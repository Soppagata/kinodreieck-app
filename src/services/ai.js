/* Geschützte, aufgabenspezifische KI-Aufträge (Etappe 5).
   ===========================================================================
   Diese Fassade kennt weder Anbieter noch Schlüssel noch Netzwerk. Sie prüft
   die Aufgabe, verlangt eine Sitzung und reicht an den Transport weiter
   (`lib/aiDriver.js`). Die Oberfläche spricht ausschließlich mit dieser Datei.

   Fehlerzustände dieses Pfads (stabile Codes aus services/errors.js):
     UNAUTHENTICATED  keine oder nicht erneuerbare Sitzung
     FORBIDDEN        Sitzung ohne KI-Berechtigung
     LIMIT            Tages-/Monats-/Parallelgrenze erreicht
     AI_DISABLED      der Betreiber hat die KI abgeschaltet
     AI_REFUSED       das Modell hat die Bearbeitung abgelehnt
     NOT_IMPLEMENTED  Aufgabe registriert, aber noch nicht gebaut
     OFFLINE/SERVER/INVALID_RESPONSE wie überall sonst.

   Grundsatz aus Etappe 4, hier genauso: der gemeldete GRUND schlägt den
   HTTP-Status. Ein Engpass beim Anbieter kommt als 429 und ist trotzdem kein
   verbrauchtes Kontingent — würde man ihn als LIMIT durchreichen, hielte der
   Nutzer sein Tageskontingent für aufgebraucht.
   =========================================================================== */
import { runtimeConfig } from "../config/runtime.js";
import { authService, authDriver } from "./auth.js";
import { createAiTransport } from "../lib/aiDriver.js";
import { BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError } from "./errors.js";

/* `health` und `echo-struct` sind die Gesundheits- und Kettenproben aus
   Etappe 5 — ohne persönliche Daten. Die beiden Fachaufgaben sind registriert,
   aber noch nicht gebaut; der Endpunkt meldet dafür NOT_IMPLEMENTED statt eines
   Serverfehlers. */
export const AI_TASKS = Object.freeze([
  "health", "echo-struct", "intelligent-search", "masterlist-enrichment",
  /* Etappe 7, Phase 3: liest aus den drei freien Antworten Geschmacks-Signale.
     Die Belegpflicht wird SERVERSEITIG erzwungen — der Endpunkt schlägt nach,
     ob jede gemeldete Textstelle wirklich in der Antwort steht. Hier wäre sie
     zwar auch prüfbar (der Client kennt die Antworten), aber eine Prüfung,
     die der Aufrufer überspringen kann, ist keine: `profil.js` sieht die
     Antworttexte nie und kann den Beleg nur auf Vorhandensein prüfen, nicht
     auf Wahrheit. */
  "profile-extract",
  /* Etappe 8: persönliche Vorbewertung eines einzelnen unbewerteten Films.
     Der Payload-Builder hält fremde Filme, Bewertungen, Notizen und Belege
     schon vor dieser Fassade zurück; der Server prüft dieselbe Grenze erneut. */
  "film-forecast",
  /* Etappe 8: gemeinsames, belegtes Filmwissen. Der Client darf nur eine
     starke Kennung senden; Quellenwahl, Abruf und Synthese bleiben auf dem
     Server. */
  "filmwissen-synthese",
  /* Text-Stapelimport. Die Liste wird vor dem ausdrücklichen, kostenpflichtigen
     Aufruf lokal bereinigt; Bilder gehen nur über den externen Prompt-Weg. */
  "media-batch-extract",
]);

export const AI_PROMPT_VERSION = "v1";

const BEKANNTE_CODES = new Set(Object.values(ERROR_CODES));

function neueVorgangId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  /* Ersatzweg für Umgebungen ohne WebCrypto: erzeugt dieselbe Form, weil die
     Serverspalte eine echte UUID verlangt. */
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (zeichen) => {
    const zufall = Math.random() * 16 | 0;
    const wert = zeichen === "x" ? zufall : (zufall & 0x3 | 0x8);
    return wert.toString(16);
  });
}

/* Übersetzt die Antworthülle des Endpunkts in einen stabilen Fehler. */
function aiFehler(result, ctx) {
  const gemeldet = typeof result?.code === "string" && BEKANNTE_CODES.has(result.code)
    ? result.code : null;
  const grund = typeof result?.grund === "string" ? result.grund : null;
  if (gemeldet) {
    return new BoundaryError(gemeldet, {
      ...ctx,
      status: Number.isFinite(result?.status) ? result.status : null,
      reason: grund,
      cause: result?.ursache,
    });
  }
  if (Number.isFinite(result?.status) && result.status > 0) {
    return errorFromStatus(result.status, { ...ctx, reason: grund, cause: result?.ursache });
  }
  /* Status 0 gibt es nur, wenn der Transport gar nicht erst hinauskam. */
  return new BoundaryError(ERROR_CODES.OFFLINE, {
    ...ctx, reason: grund || "netzwerk", cause: result?.ursache,
  });
}

export function createAiService({
  auth = authService,
  config = runtimeConfig,
  transport,
  vorgangId = neueVorgangId,
} = {}) {
  const send = transport || (async () => {
    throw new BoundaryError(ERROR_CODES.SERVER, {
      source: "ai", operation: "task.run", reason: "transport-not-configured",
    });
  });
  return Object.freeze({
    async runTask(task, payload, options = {}) {
      if (!AI_TASKS.includes(task) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
          source: "ai", operation: "task.validate", reason: "invalid-task-or-payload",
        });
      }
      const session = auth.requireAccount("personalAi");
      const ctx = { source: "ai", operation: "task.run" };
      try {
        const result = await send({
          endpointName: config.aiEndpointName,
          schemaVersion: config.schemaVersion,
          promptVersion: options.promptVersion || AI_PROMPT_VERSION,
          profilVersion: options.profilVersion || null,
          vorgangId: options.vorgangId || vorgangId(),
          task,
          payload,
          /* Der Transport bekommt die Account-ID, sendet sie aber NICHT: die
             Identität leitet der Server allein aus dem Sitzungstoken ab. */
          accountId: session.account.id,
          signal: options.signal,
        });
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
            source: "ai", operation: "task.decode", reason: "non-object-response",
          });
        }
        if (result.ok === false) throw aiFehler(result, ctx);
        return result;
      } catch (error) {
        throw normalizeBoundaryError(error, ctx);
      }
    },
  });
}

export const aiService = createAiService({
  transport: createAiTransport({
    config: runtimeConfig,
    getAccessToken: (opts) => authDriver.getAccessToken(opts),
  }),
});
