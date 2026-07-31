/* Gemeinsames read-only Film-/Programmwissen. Diese Grenze verwendet nur die
   öffentliche Katalogkonfiguration und sendet niemals persönliche Sync-Keys.

   Etappe 4: Hier — und nur hier — fällt die Entscheidung live vs. demo.
   Angemeldete Sitzung → Live-Zeile (programm/streaming), Gast bzw. Demo-Start →
   Demo-Zeile (programm_demo/streaming_demo). Die Oberfläche fragt nach dem
   Bereich, nicht nach dem Zeilennamen.

   Fehlerzustände dieses Pfads (stabile Codes aus services/errors.js):
     UNAUTHENTICATED  Live-Zeile ohne Sitzung  -> „melde dich an"
     INVALID_KEY      echter HTTP-401          -> „Zugangsschlüssel wird abgelehnt"
     NO_DEMO_DATA     Demo-Zeile nicht in der DB -> „noch nichts veröffentlicht"
     OFFLINE/SERVER/INVALID_RESPONSE wie überall sonst.
   Keiner dieser Fälle meldet je eine Sitzung ab — das entscheidet allein der
   Auth-Treiber (Zusage aus Etappe 3). */
import {
  getKatalogZugang, setKatalogZugang, hatKatalogZugang,
  testeKatalogZugang, ladeKatalogAsset, baueStreamingAnsichten,
  setKatalogTokenProvider, verwerfeKatalogCache, KATALOG_GRUENDE,
} from "../lib/katalog.js";
import { authDriver } from "./auth.js";
import { runtimeConfig } from "../config/runtime.js";
import { BoundaryError, ERROR_CODES, normalizeBoundaryError } from "./errors.js";

/* Projekt-URLs vergleichen: Groß-/Kleinschreibung und ein Schrägstrich am Ende
   dürfen den Vergleich nicht entscheiden. */
function gleicheProjektUrl(a, b) {
  const n = (u) => String(u == null ? "" : u).trim().toLowerCase().replace(/\/+$/, "");
  return !!n(a) && n(a) === n(b);
}

/* Darf das Sitzungstoken an DIESEN Katalogzugang mitgehen?
   Nur wenn er auf dasselbe Projekt zeigt wie die Anmeldung. Ohne bekannte
   Projekt-URL (lokal/Test/file://) gibt es nichts zu vergleichen — dann bleibt
   es beim bisherigen Verhalten. Exportiert, weil das die ganze Regel ist und
   sie ohne Netzwerk prüfbar sein soll. */
export function katalogTokenErlaubt(katalogUrl, projektUrl = runtimeConfig.supabaseUrl) {
  const projekt = String(projektUrl == null ? "" : projektUrl).trim();
  if (!projekt || !String(katalogUrl == null ? "" : katalogUrl).trim()) return true;
  return gleicheProjektUrl(projekt, katalogUrl);
}

/* Token-Naht wie in services/storage.js: der Katalogpfad holt sein Token bei
   jedem Request frisch beim Auth-Treiber. Tokens erreichen weder diese Fassade
   noch die Oberfläche.

   Zusätzlich die Bindung an das eigene Projekt: das Sitzungstoken gilt genau
   für die Supabase-Instanz, bei der die Anmeldung stattfand. Zeigt der
   eingetragene Katalogzugang woandershin, wird ohne Token gelesen — anon statt
   „gültiger JWT an fremde Instanz, die ihn gegen uns weiterspielt". Kein
   Abbruch, keine Abmeldung: die App bleibt lesend funktionsfähig.
   Ist keine Projekt-URL konfiguriert (lokal, Test, file://), gibt es nichts zu
   vergleichen — dann bleibt es beim bisherigen Verhalten. */
export function baueKatalogTokenProvider(projektUrl = runtimeConfig.supabaseUrl) {
  return (opts = {}) => {
    if (!katalogTokenErlaubt(opts.katalogUrl, projektUrl)) return null;
    return authDriver.getAccessToken(opts);
  };
}

setKatalogTokenProvider(baueKatalogTokenProvider());

/* Fehler des Katalogpfads in die stabilen Codes übersetzen. Entscheidend ist der
   VERMERKTE Grund, nicht der HTTP-Status: die RLS filtert ohne 403, ein echter
   401 ist deshalb ein abgelehnter Schlüssel und keine fehlende Anmeldung. */
function katalogFehler(error, ctx) {
  if (error instanceof BoundaryError) return error;
  const grund = error?.reason || null;
  if (grund === KATALOG_GRUENDE.ANMELDUNG) {
    return new BoundaryError(ERROR_CODES.UNAUTHENTICATED, { ...ctx, status: 401, reason: grund, cause: error });
  }
  if (grund === KATALOG_GRUENDE.DEMO_FEHLT) {
    return new BoundaryError(ERROR_CODES.NO_DEMO_DATA, { ...ctx, reason: grund, cause: error });
  }
  if (grund === KATALOG_GRUENDE.SCHLUESSEL || error?.status === 401) {
    return new BoundaryError(ERROR_CODES.INVALID_KEY, {
      ...ctx, status: 401, reason: KATALOG_GRUENDE.SCHLUESSEL, cause: error,
    });
  }
  return normalizeBoundaryError(error, ctx);
}

const BEREICHE = Object.freeze({
  programm: Object.freeze({ live: "programm", demo: "programm_demo" }),
  streamingBekannt: Object.freeze({
    live: "streaming_bekannt",
    demo: "streaming_bekannt_demo",
  }),
  streamingEntdecken: Object.freeze({
    live: "streaming_entdecken",
    demo: "streaming_entdecken_demo",
  }),
  /* Übergangsvertrag für ausgelieferte Clients und gezielte Diagnose. Neue
     Oberflächen lesen die beiden getrennten Bereiche darüber. */
  streaming: Object.freeze({ live: "streaming", demo: "streaming_demo" }),
});

function bereichOder(bereich) {
  const b = BEREICHE[bereich];
  if (!b) throw new Error("Unbekannter Katalog-Bereich: " + bereich);
  return b;
}

/* Ein vorhandenes Sitzungstoken ist das einzige belastbare Signal dafür, dass
   die Live-Zeilen überhaupt lesbar sind. Ist die Sitzung abgelaufen und nicht
   erneuerbar, liefert der Treiber null — dann gilt der Demo-Weg, ohne dass
   jemand abgemeldet wird. */
async function angemeldet() {
  try { return !!(await authDriver.getAccessToken()); } catch { return false; }
}

async function aktiveVariante() { return (await angemeldet()) ? "live" : "demo"; }

/* Tokenfreie Schwester von aktiveVariante(): fragt NUR, ob überhaupt eine
   gespeicherte Sitzung vorliegt (authDriver.konto() liest die Ablage, holt
   nichts). aktiveVariante() geht über getAccessToken() und löst bei einem
   fast abgelaufenen Token eine Erneuerung mit Netzwerk-Timeout aus — für den
   Boot ist das der falsche Preis: dort geht es nur um die Frage, ob ein
   gespeicherter Programm-Topf zur Betriebsart passt. Ein Urteil ohne Netz ist
   dafür genau richtig; scheitert die Erneuerung später wirklich, korrigiert der
   Betriebsart-Wechsel-Effekt den Stand ohnehin. */
function gespeicherteVariante() {
  try { return authDriver.konto() ? "live" : "demo"; } catch { return "demo"; }
}

export const catalogService = Object.freeze({
  getConnection: getKatalogZugang,
  setConnection: setKatalogZugang,
  hasConnection: hatKatalogZugang,
  /* Betriebsart der aktuellen Sitzung: "live" (angemeldet) oder "demo". */
  activeVariant: aktiveVariante,
  /* Dasselbe Urteil ohne Netz und ohne Token — nur anhand der gespeicherten
     Sitzung. Synchron. Für Pfade, die nicht auf eine Token-Erneuerung warten
     dürfen (Boot). */
  storedVariant: gespeicherteVariante,
  async testConnection(options = {}) {
    try {
      const variante = options.variante || await aktiveVariante();
      const b = bereichOder(options.bereich || "programm");
      const ctx = { source: "catalog", operation: "connection.test" };
      const result = await testeKatalogZugang({ asset: variante === "live" ? b.live : b.demo });
      if (result?.ok) {
        const a = result.asset;
        if (!a || a.ok) return { ...result, variante };
        /* Der rohe Fehler der Bibliothek wird hier durch den normalisierten
           ersetzt — die Oberfläche bekommt nie Servertext, sondern `code` und
           einen Fehler, aus dem errorText() ihren Satz bildet. */
        const fehler = katalogFehler(a.fehler || { status: a.status, reason: a.grund }, ctx);
        return {
          ...result,
          variante,
          asset: {
            ...a,
            fehler,
            code: fehler.code,
            anmeldungNoetig: fehler.code === ERROR_CODES.UNAUTHENTICATED,
          },
        };
      }
      if (result?.grund || Number.isFinite(result?.status)) {
        throw katalogFehler({ status: result.status, reason: result.grund }, ctx);
      }
      throw new Error(result?.message || "Katalog-Verbindung fehlgeschlagen");
    } catch (error) {
      throw normalizeBoundaryError(error, { source: "catalog", operation: "connection.test" });
    }
  },
  buildStreamingViews: baueStreamingAnsichten,
  /* Bereich laden ("programm" | "streamingBekannt" |
     "streamingEntdecken"; "streaming" bleibt Übergangskompatibilität).
     Die Zeile wählt die Betriebsart.
     Bleibt die LIVE-Zeile für eine angemeldete Sitzung leer, ist das ein echter
     Fehler (Asset fehlt) — kein stiller Rückfall auf die Demo-Zeile. Fehlt die
     DEMO-Zeile, ist das dagegen NO_DEMO_DATA: noch nichts veröffentlicht. */
  async loadArea(bereich, options = {}) {
    const b = bereichOder(bereich);
    const variante = options.variante || await aktiveVariante();
    const name = variante === "live" ? b.live : b.demo;
    const ctx = { source: "catalog", operation: "area.load" };
    try {
      const r = await ladeKatalogAsset(name, options);
      /* Sprang der Cache ein, ist der Direkt-Read trotzdem gescheitert. Sein
         Grund reist als stabiler `code` mit — sonst hörte ein Tester mit
         abgelehntem Schlüssel nur „Datenbank nicht erreichbar". */
      return { ...r, bereich, variante, code: r.grund ? katalogFehler({ status: r.status, reason: r.grund }, ctx).code : null };
    } catch (error) {
      throw katalogFehler(error, ctx);
    }
  },
  /* Roher Zeilenzugriff (Name statt Bereich) — für Sonderfälle wie das Manifest. */
  async loadAsset(name, options) {
    try { return await ladeKatalogAsset(name, options); }
    catch (error) { throw katalogFehler(error, { source: "catalog", operation: "asset.load" }); }
  },
  /* Cache-Storage-Eintrag eines Bereichs (live UND demo) verwerfen. Ohne das
     bliebe „neu laden" wirkungslos, sobald der Direkt-Read scheitert. */
  async discardCache(bereich) {
    try {
      if (bereich === "streaming") {
        return await verwerfeKatalogCache([
          "streaming", "streaming_demo",
          "streaming_bekannt", "streaming_bekannt_demo",
          "streaming_entdecken", "streaming_entdecken_demo",
        ]);
      }
      const b = bereichOder(bereich);
      return await verwerfeKatalogCache([b.live, b.demo]);
    } catch (error) { throw normalizeBoundaryError(error, { source: "catalog", operation: "cache.discard" }); }
  },
  async loadDemo() {
    try { return (await ladeKatalogAsset("demo_seed")).payload; }
    catch (error) { throw katalogFehler(error, { source: "catalog", operation: "demo.load" }); }
  },
});
