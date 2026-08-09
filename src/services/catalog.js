/* Gemeinsames read-only Film-/Programmwissen. Diese Grenze verwendet nur die
   öffentliche Katalogkonfiguration und sendet niemals persönliche Sync-Keys.

   Etappe 4/Rollen-v1: Hier — und nur hier — fällt die Entscheidung live vs.
   demo. Eine technisch angemeldete Sitzung genügt nicht: Nur ein bereites
   Konto mit der fachlichen Capability `remoteStorage === true` darf die
   Live-Zeilen lesen. Gast, inaktiv, fehlend, unbekannt oder degradiert lesen
   ausschließlich die öffentlichen Demo-Zeilen. Die Oberfläche fragt nach dem
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
import { authDriver, authService } from "./auth.js";
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
function remoteKonto(auth = authService) {
  try {
    const snapshot = auth?.getSnapshot?.();
    const kontoId = String(snapshot?.account?.id || "").trim();
    if (snapshot?.mode !== "account" || snapshot?.state !== "ready" || !kontoId
        || snapshot?.capabilities?.remoteStorage !== true) return null;
    return Object.freeze({ id: kontoId });
  } catch { return null; }
}

/* Exportierte reine Projektion für Regressionstests: Alle alten oder
   unvollständigen Sitzungsformen fallen auf Demo zurück. */
export function katalogVarianteAusSession(snapshot) {
  const kontoId = String(snapshot?.account?.id || "").trim();
  return snapshot?.mode === "account" && snapshot?.state === "ready" && !!kontoId
    && snapshot?.capabilities?.remoteStorage === true
    ? "live"
    : "demo";
}

export function baueKatalogTokenProvider(
  projektUrl = runtimeConfig.supabaseUrl,
  auth = authService,
  driver = authDriver,
) {
  return (opts = {}) => {
    if (!katalogTokenErlaubt(opts.katalogUrl, projektUrl)) return null;
    const konto = remoteKonto(auth);
    /* Öffentliche Reads (Demo, Manifest, Demo-Seed) reichen bewusst keine
       Konto-ID mit. So bleibt der öffentliche Pfad auch bei aktivem Konto
       tokenfrei. Außerdem verhindert der ID-Vergleich, dass ein verspäteter
       A-Aufruf nach dem Wechsel ein B-Token bekommt. */
    if (!konto || String(opts.erwarteteKontoId || "") !== konto.id) return null;
    return driver.getAccessToken({ ...opts, erwarteteKontoId: konto.id });
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

/* Capability zuerst, Token als zweite Grenze. Nach dem asynchronen Tokengriff
   wird die Capability erneut geprüft: Widerruf oder A→B während des Wartens
   darf den alten Lauf nicht live schalten. */
async function aktiveLiveFreigabe(auth = authService, driver = authDriver) {
  const vorher = remoteKonto(auth);
  if (!vorher) return null;
  try {
    const token = await driver.getAccessToken({ erwarteteKontoId: vorher.id });
    const nachher = remoteKonto(auth);
    return token && nachher?.id === vorher.id ? vorher : null;
  } catch { return null; }
}

async function aktiveVariante(auth = authService, driver = authDriver) {
  return (await aktiveLiveFreigabe(auth, driver)) ? "live" : "demo";
}

/* Tokenfreie Schwester von aktiveVariante(): fragt NUR, ob überhaupt eine
   bereits bestätigte fachliche Freigabe im Snapshot vorliegt. Sie fasst weder
   Token noch Netzwerk an. Alte technisch gespeicherte Sitzungen ohne
   Capability sind ausdrücklich Demo. */
function gespeicherteVariante(auth = authService) {
  try { return katalogVarianteAusSession(auth?.getSnapshot?.()); }
  catch { return "demo"; }
}

export function createCatalogService({ auth = authService, driver = authDriver } = {}) {
  const aktuelleFreigabe = () => remoteKonto(auth);
  const fordereGebundeneFreigabe = (accountId, operation) => {
    const aktuell = aktuelleFreigabe();
    if (!accountId || aktuell?.id !== accountId) {
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
        source: "catalog", operation, reason: "remoteStorage",
      });
    }
    return accountId;
  };
  const variante = async (verlangt = null) => {
    if (verlangt === "demo") return Object.freeze({ name: "demo", accountId: null });
    const konto = await aktiveLiveFreigabe(auth, driver);
    if (verlangt === "live" && !konto) {
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
        source: "catalog", operation: "variant.require-live", reason: "remoteStorage",
      });
    }
    return konto
      ? Object.freeze({ name: "live", accountId: konto.id })
      : Object.freeze({ name: "demo", accountId: null });
  };

  return Object.freeze({
    getConnection: getKatalogZugang,
    setConnection: setKatalogZugang,
    hasConnection: hatKatalogZugang,
    /* Betriebsart der aktuellen fachlichen Freigabe: "live" oder "demo". */
    activeVariant: () => aktiveVariante(auth, driver),
    /* Dasselbe Urteil ohne Netz und ohne Token — nur anhand des bereits
       geladenen Capability-Snapshots. Synchron und fail-closed. */
    storedVariant: () => gespeicherteVariante(auth),
  async testConnection(options = {}) {
    try {
      const auswahl = await variante(options.variante);
      const b = bereichOder(options.bereich || "programm");
      const ctx = { source: "catalog", operation: "connection.test" };
      const erwarteteKontoId = auswahl.name === "live"
        ? fordereGebundeneFreigabe(auswahl.accountId, "connection.test.before")
        : null;
      const result = await testeKatalogZugang({
        asset: auswahl.name === "live" ? b.live : b.demo,
        erwarteteKontoId,
      });
      if (auswahl.name === "live") {
        fordereGebundeneFreigabe(auswahl.accountId, "connection.test.after");
      }
      if (result?.ok) {
        const a = result.asset;
        if (!a || a.ok) return { ...result, variante: auswahl.name };
        /* Der rohe Fehler der Bibliothek wird hier durch den normalisierten
           ersetzt — die Oberfläche bekommt nie Servertext, sondern `code` und
           einen Fehler, aus dem errorText() ihren Satz bildet. */
        const fehler = katalogFehler(a.fehler || { status: a.status, reason: a.grund }, ctx);
        return {
          ...result,
          variante: auswahl.name,
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
    const auswahl = await variante(options.variante);
    const name = auswahl.name === "live" ? b.live : b.demo;
    const ctx = { source: "catalog", operation: "area.load" };
    try {
      const erwarteteKontoId = auswahl.name === "live"
        ? fordereGebundeneFreigabe(auswahl.accountId, "area.load.before")
        : null;
      const r = await ladeKatalogAsset(name, { ...options, erwarteteKontoId });
      if (auswahl.name === "live") {
        fordereGebundeneFreigabe(auswahl.accountId, "area.load.after");
      }
      /* Sprang der Cache ein, ist der Direkt-Read trotzdem gescheitert. Sein
         Grund reist als stabiler `code` mit — sonst hörte ein Tester mit
         abgelehntem Schlüssel nur „Datenbank nicht erreichbar". */
      return { ...r, bereich, variante: auswahl.name, code: r.grund ? katalogFehler({ status: r.status, reason: r.grund }, ctx).code : null };
    } catch (error) {
      throw katalogFehler(error, ctx);
    }
  },
  /* Roher Zeilenzugriff (Name statt Bereich) — für Sonderfälle wie das Manifest. */
  async loadAsset(name, options) {
    const live = Object.values(BEREICHE).some((b) => b.live === name);
    const konto = live ? await aktiveLiveFreigabe(auth, driver) : null;
    if (live && !konto) {
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
        source: "catalog", operation: "asset.load", reason: "remoteStorage",
      });
    }
    const erwarteteKontoId = live
      ? fordereGebundeneFreigabe(konto.id, "asset.load.before")
      : null;
    try {
      const result = await ladeKatalogAsset(name, { ...(options || {}), erwarteteKontoId });
      if (live) fordereGebundeneFreigabe(konto.id, "asset.load.after");
      return result;
    }
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
}

export const catalogService = createCatalogService();
