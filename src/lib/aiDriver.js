/* Netzwerktreiber für den geschützten KI-Endpunkt (Etappe 5).
   ===========================================================================
   Schichtung wie beim Katalog: Dieses Modul spricht als einziges mit dem
   Netzwerk, `services/ai.js` ist die Fassade, die Oberfläche kennt nur die
   Fassade. Kein UI-Modul darf diese Datei importieren (Architekturgrenzen-Test).

   Drei Zusagen, die hier eingelöst werden:

   1. **Die Account-ID geht nicht über die Leitung.** Der Aufrufer übergibt sie
      zwar (der Transportvertrag aus Etappe 1 sieht sie vor), aber der Server
      leitet die Identität ausschließlich aus dem Sitzungstoken ab. Was nicht
      gesendet wird, kann auch nicht verwechselt oder gefälscht werden.

   2. **Das Sitzungstoken geht nur an das eigene Projekt.** Dieselbe Regel wie
      beim Katalogpfad, hier sogar strenger: die Endpunkt-URL entsteht
      ausschließlich aus der Build-Konfiguration, es gibt keine von Hand
      eingetragene Adresse. Zusätzlich wird die Projekt-URL auf die erwartete
      Form geprüft, bevor ein Token mitgeht.

   3. **Ein Aufruf hängt nie unbegrenzt.** Ohne Zeitgrenze bliebe ein hängender
      Anbieter als Dauerlader in der Oberfläche stehen — und der serverseitige
      Parallelzähler des Kontos wäre belegt.
   =========================================================================== */
import { istSupabaseProjektUrl } from "./supabasePublic.js";

/* Etwas großzügiger als die serverseitige Zeitgrenze (seit Etappe 7: 120 s):
   Der Server soll seinen eigenen Timeout melden dürfen, statt dass der Client
   vorher abbricht und einen möglicherweise bereits bezahlten Vorgang als
   unbekannt zurücklässt. Zugleich bleiben 15 s Reserve bis zum dokumentierten
   Supabase-Request-Idle-Timeout von 150 s. */
export const AI_TIMEOUT_MS = 135000;

export function baueAiEndpunktUrl(projektUrl, endpointName) {
  const basis = String(projektUrl == null ? "" : projektUrl).trim().replace(/\/+$/, "");
  const name = String(endpointName == null ? "" : endpointName).trim();
  /* Gleiche Form wie in config/runtime.js. Ohne diese Prüfung könnte ein
     manipulierter Name („../../auth/v1/token") das Sitzungstoken auf einen
     ganz anderen Pfad des Projekts schicken. */
  if (!basis || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) return null;
  return `${basis}/functions/v1/${name}`;
}

/* Darf das Sitzungstoken an diesen Endpunkt? Nur wenn die konfigurierte
   Projekt-URL wirklich wie ein Supabase-Projekt aussieht. Exportiert, weil das
   die ganze Regel ist und sie ohne Netzwerk prüfbar sein soll. */
export function aiTokenErlaubt(projektUrl) {
  return istSupabaseProjektUrl(projektUrl);
}

/* Baut den Transport, den `services/ai.js` injiziert bekommt.
   `getAccessToken` ist die Naht zum Auth-Treiber — Tokens erreichen weder die
   Fassade noch die Oberfläche. */
export function createAiTransport({
  config,
  getAccessToken,
  getAccountId = null,
  fetchImpl = (typeof fetch === "function" ? fetch : null),
  timeoutMs = AI_TIMEOUT_MS,
} = {}) {
  return async function transport(request) {
    const url = baueAiEndpunktUrl(config?.supabaseUrl, request?.endpointName);
    if (!url) return { ok: false, status: 500, code: "server", grund: "kein-endpunkt-konfiguriert" };
    if (!aiTokenErlaubt(config?.supabaseUrl)) {
      return { ok: false, status: 500, code: "server", grund: "projekt-url-unplausibel" };
    }
    if (typeof fetchImpl !== "function") {
      return { ok: false, status: 500, code: "server", grund: "kein-fetch" };
    }

    let token = null;
    try {
      token = await getAccessToken?.({ erwarteteKontoId: request?.accountId || null });
    } catch { token = null; }
    /* Kein Token trotz angemeldeter Sitzung heißt: die Sitzung ist gerade nicht
       erneuerbar. Das ist ehrlich ein Anmeldeproblem, kein Serverfehler — und
       es meldet niemanden ab (Zusage aus Etappe 3). */
    if (!token) return { ok: false, status: 401, code: "unauthenticated", grund: "kein-sitzungstoken" };
    if (request?.accountId && typeof getAccountId === "function"
        && String(getAccountId() || "") !== String(request.accountId)) {
      return { ok: false, status: 401, code: "unauthenticated", grund: "konto-gewechselt" };
    }

    /* Bewusst NUR diese Felder. `accountId` aus dem Aufrufvertrag bleibt hier
       liegen und wird nicht gesendet. */
    const koerper = {
      task: request?.task,
      schemaVersion: request?.schemaVersion ?? null,
      promptVersion: request?.promptVersion ?? null,
      profilVersion: request?.profilVersion ?? null,
      vorgangId: request?.vorgangId ?? null,
      payload: request?.payload ?? {},
    };

    const uhr = new AbortController();
    let zeitgrenze = false;
    const stoppUhr = setTimeout(() => { zeitgrenze = true; uhr.abort(); }, timeoutMs);
    /* Ein vom Aufrufer mitgegebenes Abbruchsignal muss zusätzlich greifen. */
    const fremdesSignal = request?.signal;
    const weiterreichen = () => uhr.abort();
    if (fremdesSignal) {
      if (fremdesSignal.aborted) uhr.abort();
      else fremdesSignal.addEventListener?.("abort", weiterreichen, { once: true });
    }

    try {
      const antwort = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: String(config?.supabasePublishableKey || ""),
        },
        body: JSON.stringify(koerper),
        signal: uhr.signal,
      });

      let daten = null;
      try { daten = await antwort.json(); } catch { daten = null; }

      if (!antwort.ok) {
        return {
          ok: false,
          status: antwort.status,
          /* Der gemeldete Grund schlägt den Status — dieselbe Doktrin wie beim
             Katalogpfad. Ein Anbieter-Engpass ist etwas anderes als ein
             verbrauchtes Kontingent, obwohl beides gern 429 heißt. */
          code: typeof daten?.code === "string" ? daten.code : null,
          grund: typeof daten?.grund === "string" ? daten.grund : null,
          vorgangId: daten?.vorgangId ?? null,
        };
      }
      if (!daten || typeof daten !== "object") {
        return { ok: false, status: 502, code: "invalid-response", grund: "kein-json" };
      }
      return daten;
    } catch (error) {
      /* Ein Abbruch durch den Aufrufer ist keine Zeitgrenze des Servers — er
         darf nicht als solche erscheinen. */
      const abgebrochen = error?.name === "AbortError";
      if (abgebrochen && !zeitgrenze) {
        return { ok: false, status: 0, code: null, grund: "abgebrochen", ursache: error };
      }
      return {
        ok: false,
        status: abgebrochen ? 504 : 0,
        code: abgebrochen ? "server" : null,
        grund: abgebrochen ? "zeitgrenze" : "netzwerk",
        ursache: error,
      };
    } finally {
      clearTimeout(stoppUhr);
      fremdesSignal?.removeEventListener?.("abort", weiterreichen);
    }
  };
}
