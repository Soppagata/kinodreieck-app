import {
  baueStreamingAnsichten, getKatalogZugang, setKatalogZugang, testeKatalogZugang,
  ladeKatalogAsset, setKatalogTokenProvider, verwerfeKatalogCache, KATALOG_GRUENDE,
} from "./src/lib/katalog.js";
import { publicSupabaseHeaders } from "./src/lib/supabasePublic.js";

const map = new Map();
globalThis.localStorage = {
  getItem: (k) => map.has(k) ? map.get(k) : null,
  setItem: (k, v) => map.set(k, String(v)),
  removeItem: (k) => map.delete(k),
};

/* Cache-Storage-Attrappe. Ohne sie liefe der Cache-Zweig von katalog.js im Test
   gar nicht — Befund B3 (Herkunft „cache" muss erkennbar sein) wäre ungetestet. */
const cacheSpeicher = new Map();
globalThis.caches = {
  async open() {
    return {
      async put(url, res) { cacheSpeicher.set(String(url), await res.text()); },
      async match(url) {
        const roh = cacheSpeicher.get(String(url));
        return roh == null ? undefined : new Response(roh, { headers: { "Content-Type": "application/json" } });
      },
      async delete(url) { return cacheSpeicher.delete(String(url)); },
    };
  },
};

/* ---- Katalog-Attrappe mit echtem Datenbankverhalten (Etappe 4) ----
   `anon` sieht nur manifest + die *_demo-Zeilen; programm/streaming verlangen
   eine angemeldete Sitzung. PostgREST filtert per RLS OHNE 403 — die Antwort ist
   HTTP 200 mit LEEREM Array. Genau das bildet die Attrappe nach: sichtbar wird
   eine Live-Zeile erst, wenn der Request einen Authorization-Header trägt.
   Demo- und Live-Payload haben dieselbe Struktur, sind aber unterscheidbar
   (`demo: true`) — sonst könnte kein Test sagen, welche Zeile wirklich kam. */
const STAND = "2026-07-22T12:00:00Z";
const ZUKUNFT = new Date(Date.now() + 30 * 86400000).toISOString();
const VERGANGENHEIT = new Date(Date.now() - 2 * 86400000).toISOString();
const KATALOG_ZEILEN = {
  manifest: { payload: { stand: STAND }, quelle: "manifest" },
  programm: { payload: { stand: STAND, filme: [{ id: "live_1", titel: "Live-Testfilm", vorstellungen: [] }] }, quelle: "film-at" },
  programm_demo: { payload: { stand: STAND, demo: true, filme: [{ id: "demo_1", titel: "Demo-Testfilm", vorstellungen: [] }] }, quelle: "demo-schnappschuss" },
  streaming: { payload: { bekannt: { titel: [] }, entdecken: { titel: [] } }, quelle: "watchmode" },
  streaming_demo: { payload: { bekannt: { titel: [], demo: true }, entdecken: { titel: [], demo: true } }, quelle: "demo-schnappschuss" },
  streaming_bekannt: { payload: { titel: [{ watchmode_id: 10, titel: "Bekannt live", dienste: ["MUBI"] }] }, quelle: "watchmode" },
  streaming_entdecken: { payload: { titel: [{ watchmode_id: 11, titel: "Entdecken live", dienste: ["MUBI"] }] }, quelle: "watchmode" },
  streaming_bekannt_demo: { payload: { titel: [{ watchmode_id: 20, titel: "Bekannt Demo", dienste: ["MUBI"] }], demo: true }, quelle: "demo-schnappschuss" },
  streaming_entdecken_demo: { payload: { titel: [{ watchmode_id: 21, titel: "Entdecken Demo", dienste: ["MUBI"] }], demo: true }, quelle: "demo-schnappschuss" },
  demo_seed: {
    payload: {
      format: 1,
      master: { meta: { erstellt_am: STAND }, filme: [{ id: "demo_basis", titel: "Demo-Basis" }] },
      mustwatch: { eintraege: [] },
      streaming_dienste: { quellen: ["MUBI"], heuristik: true },
      artikel: { artikel: [] },
      kino_pins: [],
      merkliste: [],
    },
    quelle: "kinodreieck_demo",
  },
};
const NUR_ANGEMELDET = new Set([
  "programm", "streaming", "streaming_bekannt", "streaming_entdecken",
]);

/* Steuerpult der Attrappe — jeder Block stellt nur ein, was er wirklich braucht. */
const netz = {
  offline: false,        // Direkt-Read wirft einen Netzfehler
  status401: 0,          // so viele der nächsten kd_catalog-Antworten sind 401
  fehlend: new Set(),    // Zeilen, die auch MIT Token leer zurückkommen (Asset fehlt)
  gueltigBis: ZUKUNFT,
  /* HTTP 200, aber der Körper ist kein JSON: Captive Portal, Firmenproxy,
     CDN-Fehlerseite. Der Fall sieht auf Statusebene aus wie eine gültige
     PostgREST-Antwort und ist trotzdem keine (P4). */
  nichtJson: false,
  vorKatalogAntwort: null,
};
let fetchCalls = [];
globalThis.fetch = async (url, opts = {}) => {
  const s = String(url);
  const headers = opts.headers || {};
  /* Der HTTP-Status jeder Antwort wird mitgeschrieben. Nur damit lässt sich die
     Aussage von P4 überhaupt belegen: dass DERSELBE Status 200 je nach Körper zu
     verschiedenen Urteilen führt. Ohne diese Mitschrift verglich der Check nur
     drei Konstanten des Tests miteinander. */
  const eintrag = { url: s, headers, status: null };
  fetchCalls.push(eintrag);
  const merke = (res) => { eintrag.status = res.status; return res; };
  if (s.includes("/rest/v1/kd_store")) {
    return merke({ ok: true, status: 200, json: async () => [{ owner: "demo", key: "kd:master", value: "{}" }], text: async () => "" });
  }
  const name = new URL(s).searchParams.get("name")?.replace(/^eq\./, "");
  if (name && typeof netz.vorKatalogAntwort === "function") {
    const hook = netz.vorKatalogAntwort;
    netz.vorKatalogAntwort = null;
    await hook({ name, headers });
  }
  if (netz.offline) throw new Error("network offline (Test)");
  if (netz.status401 > 0) {
    netz.status401 -= 1;
    return merke({ ok: false, status: 401, json: async () => ({ message: "JWT expired" }), text: async () => "" });
  }
  if (netz.nichtJson) {
    /* Genau die Form, die ein Captive Portal liefert: Status 200, Content-Type
       hin oder her — `res.json()` wirft. */
    return merke({
      ok: true, status: 200,
      json: async () => { throw new SyntaxError("Unexpected token '<', \"<!doctype \"... is not valid JSON"); },
      text: async () => "<!doctype html><title>Bitte im WLAN anmelden</title>",
    });
  }
  const zeile = KATALOG_ZEILEN[name];
  const mitToken = !!headers.Authorization;
  const sichtbar = !!zeile && !netz.fehlend.has(name) && (mitToken || !NUR_ANGEMELDET.has(name));
  const zeilen = sichtbar
    ? [{ payload: zeile.payload, updated_at: STAND, stand: STAND, gueltig_bis: netz.gueltigBis, quelle: zeile.quelle }]
    : [];
  return merke({ ok: true, status: 200, json: async () => zeilen, text: async () => "" });
};

let ok = 0;
const check = (name, wert) => { if (!wert) throw new Error("Fehlgeschlagen: " + name); ok++; console.log("✓ " + name); };
const publishable = "sb_publishable_katalogtest";
setKatalogZugang({ url: "https://test.supabase.co/", key: " " + publishable + " " });
const cfg = getKatalogZugang();
check("Zugang normalisiert URL und Schlüssel", cfg.url === "https://test.supabase.co" && cfg.key === publishable);
check("Manifest-Verbindung funktioniert", (await testeKatalogZugang()).ok === true);
check("Publishable-Key wird als apikey gesendet", fetchCalls.at(-1)?.headers?.apikey === publishable);
check("Publishable-Key wird nicht als Bearer gesendet", !fetchCalls.at(-1)?.headers?.Authorization);

const jwt = "eyJ" + "x".repeat(40);
setKatalogZugang({ key: jwt });
fetchCalls = [];
check("JWT-Katalogzugang funktioniert weiterhin", (await testeKatalogZugang()).ok === true);
check("JWT-Key wird als apikey und Bearer gesendet",
  fetchCalls.at(-1)?.headers?.apikey === jwt && fetchCalls.at(-1)?.headers?.Authorization === "Bearer " + jwt);

const ansichten = baueStreamingAnsichten({
  entdeckenUmfang: "voll",
  bekannt: { stand: "x", dienste: ["Netflix"], titel: [{ watchmode_id: 1, titel: "Alien", jahr: 1979, dienste: ["Netflix"] }] },
  entdecken: { stand: "x", dienste: ["Netflix"], titel: [{ watchmode_id: 2, titel: "Arrival", jahr: 2016, dienste: ["Netflix"] }] },
}, [{ id: "alien_1979", titel: "Alien", jahr: 1979, bewertung: { wie: 5, was: 5, warum: 5 } }]);
check("aktiver Master wird lokal zu Mein Programm gematcht", ansichten.bekannt.titel.length === 1 && ansichten.bekannt.titel[0].id === "alien_1979");
check("übriger Titel bleibt in Entdecken", ansichten.entdecken.titel.length === 1 && ansichten.entdecken.titel[0].titel === "Arrival");
check("Rohkatalog, Masterbestand und lokale Abzugsmengen bleiben getrennt belegt",
  ansichten.bekannt.katalogMengen.rohkatalog === 2
  && ansichten.bekannt.katalogMengen.masterbestand === 1
  && ansichten.bekannt.katalogMengen.imMasterGefunden === 1
  && ansichten.entdecken.katalogMengen.nachMasterAbzug === 1
  && ansichten.entdecken.katalogMengen.umfang === "voll"
  && ansichten.bekannt.katalogMengen === ansichten.entdecken.katalogMengen);
const unbelegterUmfang = baueStreamingAnsichten({
  bekannt: { titel: [] }, entdecken: { titel: [{ watchmode_id: 3, titel: "Nur lokal" }] },
});
check("Fehlende Umfangsmarke wird fail-closed als begrenzter Stand projiziert",
  unbelegterUmfang.entdecken.katalogMengen.umfang === "begrenzt");
const doppelt = baueStreamingAnsichten({
  bekannt: { titel: [{
    watchmode_id: 77, titel: "Doppelter Titel", jahr: 2000,
    imdb_id: "tt1234567", tmdb_id: 123, dienste: ["Prime"],
  }] },
  entdecken: { titel: [] },
}, [
  { id: "heuristisch", titel: "Doppelter Titel", jahr: 2000 },
  { id: "exakt", titel: "Doppelter Titel", jahr: 2000, watchmode_id: 77 },
]);
check("exakte Watchmode-ID schlägt bei gleichem Titel die Titel-/Jahr-Heuristik",
  doppelt.bekannt.titel[0]?.id === "exakt"
  && doppelt.bekannt.titel[0]?.imdb_id === "tt1234567"
  && doppelt.bekannt.titel[0]?.tmdb_id === 123);
const serienstand = baueStreamingAnsichten({
  bekannt: { titel: [{
    watchmode_id: 88, titel: "Serienstand", typ: "tv_series", staffeln_verfuegbar: 4,
    folgen_verfuegbar: 26, folge_aktuell: 1266, letzte_folge: { episode_number: 1266 },
    naechste_staffel_am: "2026-09-01", staffelstand_geprueft_am: "2026-08-02T10:00:00Z",
  }] },
  entdecken: { titel: [] },
}, [{ id: "serienstand", titel: "Serienstand", typ: "serie", watchmode_id: 88 }]);
check("Staffel- und Folgenfelder überleben die lokale Mein-Programm-Projektion",
  serienstand.bekannt.titel[0]?.staffeln_verfuegbar === 4
  && serienstand.bekannt.titel[0]?.folgen_verfuegbar === 26
  && serienstand.bekannt.titel[0]?.folge_aktuell === 1266
  && serienstand.bekannt.titel[0]?.letzte_folge?.episode_number === 1266
  && serienstand.bekannt.titel[0]?.naechste_staffel_am === "2026-09-01");

/* ================= Etappe 4: Token-Naht (src/lib/katalog.js) =================
   Bis hierher lief das Modul OHNE Token-Provider — die beiden Header-Checks oben
   belegen damit zugleich, dass das Altverhalten unangetastet bleibt. */
setKatalogZugang({ key: publishable });
const TOKEN = "test-sitzungstoken-platzhalter";
const TOKEN_NEU = "test-sitzungstoken-erneuert";
let tokenAufrufe = [];
let tokenWert = TOKEN;
setKatalogTokenProvider(async (opts) => { tokenAufrufe.push(opts || {}); return tokenWert; });

await verwerfeKatalogCache();
fetchCalls = [];
await ladeKatalogAsset("manifest");
check("Mit Token-Provider trägt der Katalog-Request Authorization: Bearer <token>",
  fetchCalls.at(-1)?.headers?.Authorization === "Bearer " + TOKEN);
check("Mit Token bleibt der apikey trotzdem gesetzt", fetchCalls.at(-1)?.headers?.apikey === publishable);

/* Live-Zeile: erst das Token macht sie überhaupt sichtbar (RLS-Nachbau). */
await verwerfeKatalogCache();
fetchCalls = [];
const liveMitToken = await ladeKatalogAsset("programm");
check("Angemeldeter Read der Live-Zeile liefert die Live-Payload",
  liveMitToken.asset === "programm" && liveMitToken.variante === "live" && !liveMitToken.payload.demo);
check("Live-Read meldet die neuen DB-Spalten (stand, gueltigBis, datenquelle)",
  liveMitToken.stand === STAND && liveMitToken.gueltigBis === ZUKUNFT && liveMitToken.datenquelle === "film-at");

/* --- 401: GENAU EINE Erneuerung, dann anon-Rückfall (kein Endlos-Retry) --- */
await verwerfeKatalogCache();
netz.status401 = 1;
tokenWert = TOKEN;
fetchCalls = []; tokenAufrufe = [];
const nach401 = await ladeKatalogAsset("programm");
check("401 führt zu genau einem Wiederholungsversuch mit erneuertem Token",
  nach401.quelle === "datenbank" && fetchCalls.length === 2);
check("Die Erneuerung wird genau einmal und mit erzwingeErneuerung angefordert",
  tokenAufrufe.length === 2 && tokenAufrufe[0].erzwingeErneuerung !== true && tokenAufrufe[1].erzwingeErneuerung === true);

await verwerfeKatalogCache();
netz.status401 = Infinity;
tokenWert = TOKEN_NEU;
fetchCalls = []; tokenAufrufe = [];
let dauer401 = null;
try { await ladeKatalogAsset("programm"); } catch (e) { dauer401 = e; }
netz.status401 = 0;
check("Dauerhaftes 401 endet als Fehler mit Status 401", dauer401?.status === 401);
check("Dauerhaftes 401 macht genau drei Requests (Versuch, Erneuerung, anon-Rückfall)", fetchCalls.length === 3);
check("Dauerhaftes 401 erneuert das Token genau einmal — keine Endlosschleife", tokenAufrufe.length === 2);
check("Der anon-Rückfall geht ohne Authorization raus", !fetchCalls[2]?.headers?.Authorization && fetchCalls[2]?.headers?.apikey === publishable);

/* --- B3: Cache-Herkunft muss im Ergebnis erkennbar sein --- */
tokenWert = TOKEN;
await verwerfeKatalogCache();
netz.offline = false;
const frischDemo = await ladeKatalogAsset("programm_demo");
check("Direkt-Read meldet Herkunft „datenbank“", frischDemo.quelle === "datenbank" && !frischDemo.warnung);
netz.offline = true;
const ausCache = await ladeKatalogAsset("programm_demo");
netz.offline = false;
check("B3: Cache-Treffer meldet Herkunft „cache“ mit Warnung, nie „datenbank“",
  ausCache.quelle === "cache" && ausCache.quelle !== "datenbank" && !!ausCache.warnung);
check("B3: der Cache-Treffer trägt die Herkunfts-Metadaten des gecachten Stands mit",
  ausCache.stand === STAND && ausCache.datenquelle === "demo-schnappschuss" && Number.isFinite(ausCache.gecachtAm));
check("Cache verwerfen entfernt den Eintrag wirklich (zweiter Aufruf findet nichts mehr)",
  (await verwerfeKatalogCache(["programm_demo"])) === true && (await verwerfeKatalogCache(["programm_demo"])) === false);
netz.offline = true;
let ohneCache = null;
try { await ladeKatalogAsset("programm_demo"); } catch (e) { ohneCache = e; }
netz.offline = false;
check("Nach dem Verwerfen springt kein Cache mehr ein — der Fehler kommt durch", !!ohneCache);

/* --- Ablauf: gueltig_bis in der Vergangenheit --- */
await verwerfeKatalogCache();
netz.gueltigBis = VERGANGENHEIT;
const abgelaufen = await ladeKatalogAsset("programm_demo");
check("Demo-Snapshot mit gueltig_bis in der Vergangenheit wird als abgelaufen gemeldet",
  abgelaufen.variante === "demo" && abgelaufen.gueltigBis === VERGANGENHEIT && abgelaufen.abgelaufen === true);
netz.gueltigBis = ZUKUNFT;
await verwerfeKatalogCache();
check("Demo-Snapshot mit gueltig_bis in der Zukunft gilt nicht als abgelaufen",
  (await ladeKatalogAsset("programm_demo")).abgelaufen === false);

/* ============ Etappe 4: Auswahl live/demo an der Grenze (services/catalog.js) ============
   Erst ab hier wird die Fassade geladen; ihr Modulstart ersetzt den Token-Provider
   durch den echten Auth-Treiber. Der liest sein Token aus localStorage — eine
   gesetzte Sitzung ist damit „angemeldet", eine gelöschte „Gast". */
setKatalogTokenProvider(null);
const {
  createCatalogService, katalogTokenErlaubt, katalogVarianteAusSession,
  baueKatalogTokenProvider,
} = await import("./src/services/catalog.js");
const { ERROR_CODES } = await import("./src/services/errors.js");
const { AUTH_SESSION_KEY, AUTH_ZUSTAND } = await import("./src/lib/authDriver.js");
const { authDriver } = await import("./src/services/auth.js");
const SITZUNGSTOKEN = "test-zugriffstoken-platzhalter";
const aktiveKatalogSession = (id = "test-konto") => ({
  mode: "account", state: "ready", account: { id },
  capabilities: { remoteStorage: true, personalAi: false },
});
let katalogSession = { mode: "guest", state: "ready", account: null, capabilities: {} };
const katalogAuth = { getSnapshot: () => katalogSession };
const catalogService = createCatalogService({ auth: katalogAuth, driver: authDriver });
setKatalogTokenProvider(baueKatalogTokenProvider("", katalogAuth, authDriver));
const anmelden = () => {
  katalogSession = aktiveKatalogSession();
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    v: 1, access_token: SITZUNGSTOKEN, refresh_token: "test-erneuerungswert-platzhalter",
    gueltigBis: Date.now() + 3600000, kontoId: "test-konto", mail: "tester@login.kinodreieck.at", benutzername: "tester",
  }));
};
const abmelden = () => {
  katalogSession = { mode: "guest", state: "ready", account: null, capabilities: {} };
  localStorage.removeItem(AUTH_SESSION_KEY);
};

check("Rollen-v1: Nur ready + remoteStorage=true ergibt die Live-Variante",
  katalogVarianteAusSession(aktiveKatalogSession()) === "live");
check("Rollen-v1: fehlend, inaktiv, degradiert und alte Session ohne Capability bleiben Demo",
  [
    null,
    { mode: "account", state: "ready", account: { id: "test-konto" }, capabilities: { remoteStorage: false } },
    { mode: "account", state: "degraded", account: { id: "test-konto" }, capabilities: { remoteStorage: true } },
    { mode: "account", state: "ready", account: { id: "test-konto" }, capabilities: {} },
  ].every((session) => katalogVarianteAusSession(session) === "demo"));

let raceSession = aktiveKatalogSession("konto-a");
const raceService = createCatalogService({
  auth: { getSnapshot: () => raceSession },
  driver: {
    async getAccessToken() {
      raceSession = aktiveKatalogSession("konto-b");
      return "token-a";
    },
  },
});
check("Verspäteter A-Tokengriff kann nach A→B die Live-Variante nicht freischalten",
  (await raceService.activeVariant()) === "demo");

abmelden();
await verwerfeKatalogCache();
fetchCalls = [];
check("Gast: activeVariant() meldet „demo“", (await catalogService.activeVariant()) === "demo");
const gastBereich = await catalogService.loadArea("programm");
check("Gast lädt die Demo-Zeile programm_demo",
  gastBereich.asset === "programm_demo" && gastBereich.variante === "demo" && gastBereich.payload.demo === true);
check("Gast-Request trägt kein Authorization", !fetchCalls.at(-1)?.headers?.Authorization);

anmelden();
await verwerfeKatalogCache();
fetchCalls = [];
check("Angemeldet: activeVariant() meldet „live“", (await catalogService.activeVariant()) === "live");
const liveBereich = await catalogService.loadArea("programm");
check("Angemeldet lädt die Live-Zeile programm",
  liveBereich.asset === "programm" && liveBereich.variante === "live" && !liveBereich.payload.demo);
check("Live-Request trägt das Sitzungstoken als Bearer",
  fetchCalls.at(-1)?.headers?.Authorization === "Bearer " + SITZUNGSTOKEN);

/* Eine vorhandene technische Sitzung ohne fachliche Freigabe bleibt auf dem
   öffentlichen Pfad. Der Demo-Read ist dabei auch tokenfrei. */
katalogSession = {
  mode: "account", state: "ready", account: { id: "test-konto" },
  capabilities: { remoteStorage: false, personalAi: false },
};
await verwerfeKatalogCache();
fetchCalls = [];
check("Inaktives Konto: activeVariant() meldet fail-closed „demo“",
  (await catalogService.activeVariant()) === "demo");
const inaktiverBereich = await catalogService.loadArea("programm");
check("Inaktives Konto lädt nur programm_demo und sendet kein Sitzungstoken",
  inaktiverBereich.asset === "programm_demo" && inaktiverBereich.variante === "demo"
  && !fetchCalls.at(-1)?.headers?.Authorization);

fetchCalls = [];
let erzwungenLive = null;
try { await catalogService.loadArea("programm", { variante: "live" }); } catch (error) { erzwungenLive = error; }
check("Eine explizite live-Option kann die fehlende Freigabe nicht umgehen",
  erzwungenLive?.code === ERROR_CODES.FORBIDDEN && erzwungenLive?.reason === "remoteStorage"
  && fetchCalls.length === 0);

anmelden();
await verwerfeKatalogCache();
netz.vorKatalogAntwort = () => {
  katalogSession = {
    ...aktiveKatalogSession(),
    capabilities: { remoteStorage: false, personalAi: false },
  };
};
let widerrufImRead = null;
try { await catalogService.loadArea("programm"); } catch (error) { widerrufImRead = error; }
check("Widerruf während des Live-Fetch verwirft die Antwort vollständig",
  widerrufImRead?.code === ERROR_CODES.FORBIDDEN && widerrufImRead?.reason === "remoteStorage");

anmelden();
await verwerfeKatalogCache();
netz.vorKatalogAntwort = () => { katalogSession = aktiveKatalogSession("konto-b"); };
let wechselImRead = null;
try { await catalogService.loadArea("programm"); } catch (error) { wechselImRead = error; }
check("A→B während des Live-Fetch kann keinen A-Lauf als B-Erfolg liefern",
  wechselImRead?.code === ERROR_CODES.FORBIDDEN && wechselImRead?.reason === "remoteStorage");

anmelden();
await verwerfeKatalogCache();
await catalogService.loadArea("programm");
netz.offline = true;
netz.vorKatalogAntwort = () => {
  katalogSession = {
    ...aktiveKatalogSession(),
    capabilities: { remoteStorage: false, personalAi: false },
  };
};
let widerrufMitLiveCache = null;
try { await catalogService.loadArea("programm"); } catch (error) { widerrufMitLiveCache = error; }
netz.offline = false;
check("Widerruf macht auch einen vorhandenen Live-Cache unsichtbar",
  widerrufMitLiveCache?.code === ERROR_CODES.FORBIDDEN
  && widerrufMitLiveCache?.reason === "remoteStorage");

anmelden();
await verwerfeKatalogCache();
netz.vorKatalogAntwort = () => {
  katalogSession = {
    ...aktiveKatalogSession(),
    capabilities: { remoteStorage: false, personalAi: false },
  };
};
let rawWiderruf = null;
try { await catalogService.loadAsset("programm"); } catch (error) { rawWiderruf = error; }
check("Roher Live-Asset-Read verwirft einen Widerruf während des Transports",
  rawWiderruf?.code === ERROR_CODES.FORBIDDEN);

anmelden();
netz.vorKatalogAntwort = () => { katalogSession = aktiveKatalogSession("konto-b"); };
let verbindungsWechsel = null;
try { await catalogService.testConnection({ bereich: "programm", variante: "live" }); }
catch (error) { verbindungsWechsel = error; }
check("Live-Verbindungsprüfung verwirft A→B während des Transports",
  verbindungsWechsel?.code === ERROR_CODES.FORBIDDEN);

anmelden();

await verwerfeKatalogCache();
fetchCalls = [];
const bekanntBereich = await catalogService.loadArea("streamingBekannt");
check("Leichter Streaming-Read lädt ausschließlich die getrennte Bekannt-Zeile",
  bekanntBereich.asset === "streaming_bekannt"
  && bekanntBereich.payload.titel[0]?.titel === "Bekannt live"
  && fetchCalls.length === 1
  && !fetchCalls[0].url.includes("streaming_entdecken"));
const entdeckenBereich = await catalogService.loadArea("streamingEntdecken");
check("Entdecken-Read lädt erst auf eigenen Aufruf die große getrennte Zeile",
  entdeckenBereich.asset === "streaming_entdecken"
  && entdeckenBereich.payload.titel[0]?.titel === "Entdecken live"
  && fetchCalls.length === 2);

/* --- Rollen-v1: Ein expliziter Live-Wunsch ohne Freigabe endet VOR Netz. --- */
abmelden();
await verwerfeKatalogCache();
fetchCalls = [];
let b1 = null;
try { await catalogService.loadArea("programm", { variante: "live" }); } catch (e) { b1 = e; }
check("Live ohne fachliche Freigabe => FORBIDDEN ohne HTTP- oder Cache-Zugriff",
  b1?.code === ERROR_CODES.FORBIDDEN && b1?.reason === "remoteStorage" && fetchCalls.length === 0);

/* --- Gegenprobe: leer TROTZ Token ist ein echter Fehler, kein Demo-Rückfall --- */
anmelden();
netz.fehlend.add("programm");
await verwerfeKatalogCache();
fetchCalls = [];
let fehlt = null;
try { await catalogService.loadArea("programm"); } catch (e) { fehlt = e; }
netz.fehlend.delete("programm");
/* `code !== UNAUTHENTICATED` war vom `===` davor logisch impliziert. An seiner
   Stelle steht die eigentliche Aussage: dieser Fall trägt gar keine
   Grund-Marke — er kommt weder aus der RLS noch aus der Demo-Frage. */
check("Leere Live-Zeile MIT gültigem Token ist ein echter Fehlerzustand (Asset fehlt)",
  fehlt?.code === ERROR_CODES.INVALID_RESPONSE && fehlt?.reason == null);
check("Fehlendes Live-Asset fällt NICHT still auf die Demo-Zeile zurück",
  !fetchCalls.some((c) => c.url.includes("programm_demo")));

/* ================= F4: ein echter 401 ist KEIN „Anmeldung nötig" =================
   Beide Zustände tragen Status 401. Unterschieden werden sie am VERMERKTEN Grund:
   die RLS filtert lautlos (200 + leeres Array), ein echter HTTP-401 kommt deshalb
   vom abgelehnten apikey/JWT. Wer hier wieder auf den Status vergleicht, lässt
   einen Tester mit vertipptem Schlüssel ewig „melde dich an" hören. */
anmelden();
await verwerfeKatalogCache();
netz.status401 = Infinity;
fetchCalls = [];
let schluesselFehler = null;
try { await catalogService.loadArea("programm"); } catch (e) { schluesselFehler = e; }
netz.status401 = 0;
check("F4: dauerhafter HTTP-401 des Servers ergibt INVALID_KEY (abgelehnter Zugangsschlüssel)",
  schluesselFehler?.code === ERROR_CODES.INVALID_KEY);
check("F4: der abgelehnte Schlüssel wird NICHT als „Anmeldung nötig“ gemeldet",
  schluesselFehler?.code !== ERROR_CODES.UNAUTHENTICATED);
check("F4: INVALID_KEY ist nicht wiederholbar — erneut probieren hilft nicht",
  schluesselFehler?.retryable === false);
/* Der fachliche Guard liegt jetzt noch vor diesem HTTP-Vertrag: Ohne Freigabe
   entsteht gar kein Live-Request. Ein echter Server-401 bleibt trotzdem sauber
   als Schlüsselproblem klassifiziert. */
check("F4: echter Server-401 bleibt INVALID_KEY; fehlende Freigabe endet früher als FORBIDDEN",
  schluesselFehler?.status === 401
  && schluesselFehler.reason === KATALOG_GRUENDE.SCHLUESSEL
  && b1?.code === ERROR_CODES.FORBIDDEN && b1?.status == null);

abmelden();
await verwerfeKatalogCache();
netz.status401 = Infinity;
let gastSchluessel = null;
try { await catalogService.loadArea("programm"); } catch (e) { gastSchluessel = e; }
netz.status401 = 0;
check("F4: auch im Gastbetrieb ist ein dauerhafter 401 ein abgelehnter Schlüssel, kein fehlender Demo-Stand",
  gastSchluessel?.code === ERROR_CODES.INVALID_KEY && gastSchluessel?.code !== ERROR_CODES.NO_DEMO_DATA);

/* Springt der Cache ein, ist der Direkt-Read trotzdem gescheitert — sein Grund
   muss als stabiler `code` mitreisen, sonst hört derselbe Tester nur „Datenbank
   nicht erreichbar". */
abmelden();
await verwerfeKatalogCache();
await catalogService.loadArea("programm");            // programm_demo in den Cache legen
netz.status401 = Infinity;
const cacheNach401 = await catalogService.loadArea("programm");
netz.status401 = 0;
check("F4: springt der Cache ein, reist der Grund als loadArea().code mit (INVALID_KEY)",
  cacheNach401.quelle === "cache" && cacheNach401.code === ERROR_CODES.INVALID_KEY
  && cacheNach401.anmeldungNoetig === false);

anmelden();
await verwerfeKatalogCache();
await catalogService.loadArea("programm");            // Live-Zeile in den Cache legen
abmelden();
fetchCalls = [];
let cacheOhneAnmeldung = null;
try { await catalogService.loadArea("programm", { variante: "live" }); } catch (error) { cacheOhneAnmeldung = error; }
check("Ein früherer Live-Cache ist ohne Freigabe weder per Netz noch per Cache erreichbar",
  cacheOhneAnmeldung?.code === ERROR_CODES.FORBIDDEN && fetchCalls.length === 0);

/* ================= F5: fehlende Demo-Zeile ist ein eigener Zustand =================
   Die *_demo-Zeilen sind für alle lesbar. Fehlen sie, ist schlicht noch nichts
   veröffentlicht — weder eine „ungültige Antwort" noch „melde dich an". */
abmelden();
netz.fehlend.add("programm_demo");
await verwerfeKatalogCache();
let demoFehlt = null;
try { await catalogService.loadArea("programm"); } catch (e) { demoFehlt = e; }
netz.fehlend.delete("programm_demo");
check("F5: fehlende Demo-Zeile programm_demo ergibt NO_DEMO_DATA", demoFehlt?.code === ERROR_CODES.NO_DEMO_DATA);
check("F5: fehlende Demo-Zeile ist weder INVALID_RESPONSE noch UNAUTHENTICATED — und trägt die Demo-Marke",
  demoFehlt?.code !== ERROR_CODES.INVALID_RESPONSE && demoFehlt?.code !== ERROR_CODES.UNAUTHENTICATED
  && demoFehlt?.reason === KATALOG_GRUENDE.DEMO_FEHLT);
check("F5: NO_DEMO_DATA ist nicht wiederholbar — Warten ändert nichts", demoFehlt?.retryable === false);

netz.fehlend.add("streaming_demo");
await verwerfeKatalogCache();
let streamingDemoFehlt = null;
try { await catalogService.loadArea("streaming"); } catch (e) { streamingDemoFehlt = e; }
netz.fehlend.delete("streaming_demo");
check("F5: fehlende Demo-Zeile streaming_demo ergibt ebenfalls NO_DEMO_DATA",
  streamingDemoFehlt?.code === ERROR_CODES.NO_DEMO_DATA);

check("F5-Gegenprobe: die fehlende LIVE-Zeile trotz Token bleibt INVALID_RESPONSE und wird nicht zu NO_DEMO_DATA",
  fehlt?.code === ERROR_CODES.INVALID_RESPONSE && fehlt?.reason !== KATALOG_GRUENDE.DEMO_FEHLT);

/* ============ P4: HTTP 200 ohne JSON-Körper ist eine ungültige Antwort ============
   Captive Portal, Firmenproxy und CDN-Fehlerseite antworten regelmäßig mit
   HTTP 200 und HTML. Fällt das in denselben Zweig wie „PostgREST lieferte ein
   leeres Array", wird daraus das ENDGÜLTIGE Urteil „für den öffentlichen Zugang
   ist noch nichts veröffentlicht" — und ein Tester wartet auf eine
   Veröffentlichung, statt sein Netz zu prüfen. Nur ein ECHTES leeres Array darf
   in die RLS-/Demo-Unterscheidung laufen. */
abmelden();
await verwerfeKatalogCache();
netz.nichtJson = true;
fetchCalls = [];
let htmlAntwort = null;
try { await catalogService.loadArea("programm"); } catch (e) { htmlAntwort = e; }
const statiHtml = fetchCalls.map((c) => c.status);
netz.nichtJson = false;
check("P4: HTTP 200 mit nicht-JSON-Körper ergibt INVALID_RESPONSE",
  htmlAntwort?.code === ERROR_CODES.INVALID_RESPONSE);
check("P4: eine HTML-Seite mit Status 200 wird NICHT zu „noch nichts veröffentlicht“ (NO_DEMO_DATA)",
  htmlAntwort?.code !== ERROR_CODES.NO_DEMO_DATA && htmlAntwort?.reason == null);
check("P4: sie wird auch weder zu „Anmeldung nötig“ noch zu „Schlüssel abgelehnt“",
  htmlAntwort?.code !== ERROR_CODES.UNAUTHENTICATED && htmlAntwort?.code !== ERROR_CODES.INVALID_KEY);

/* Derselbe Körper auf der fachlich erlaubten LIVE-Zeile: er darf auch dort
   nicht als lautloser RLS-Filter durchgehen. */
anmelden();
await verwerfeKatalogCache();
netz.nichtJson = true;
let htmlLive = null;
try { await catalogService.loadArea("programm", { variante: "live" }); } catch (e) { htmlLive = e; }
netz.nichtJson = false;
check("P4: nicht-JSON auf der Live-Zeile ist ebenfalls INVALID_RESPONSE, kein RLS-Filter",
  htmlLive?.code === ERROR_CODES.INVALID_RESPONSE && htmlLive?.reason !== KATALOG_GRUENDE.ANMELDUNG);

/* Gegenprobe: das ECHTE leere Array läuft weiterhin in die Unterscheidung. */
abmelden();
netz.fehlend.add("programm_demo");
await verwerfeKatalogCache();
fetchCalls = [];
let echtLeerDemo = null;
try { await catalogService.loadArea("programm"); } catch (e) { echtLeerDemo = e; }
const statiLeerDemo = fetchCalls.map((c) => c.status);
netz.fehlend.delete("programm_demo");
check("P4-Gegenprobe: das echte leere Array bleibt auf der Demo-Zeile NO_DEMO_DATA",
  echtLeerDemo?.code === ERROR_CODES.NO_DEMO_DATA);
await verwerfeKatalogCache();
fetchCalls = [];
let echtLeerLive = null;
anmelden();
netz.fehlend.add("programm");
try { await catalogService.loadArea("programm", { variante: "live" }); } catch (e) { echtLeerLive = e; }
const statiLeerLive = fetchCalls.map((c) => c.status);
netz.fehlend.delete("programm");
check("P4-Gegenprobe: leere Live-Zeile trotz gültiger Freigabe bleibt INVALID_RESPONSE",
  echtLeerLive?.code === ERROR_CODES.INVALID_RESPONSE && echtLeerLive?.reason == null);
/* Der Kern der Aussage ist das Wort „derselbe": dass die drei Urteile
   verschieden sind, war durch die drei Checks darüber schon festgenagelt — das
   allein verglich nur Konstanten des Tests miteinander. Belegt werden muss, dass
   alle drei Läufe wirklich HTTP 200 gesehen haben; sonst unterschiede die App
   womöglich am Status statt am Körper, und niemand würde es merken. */
const p4Stati = [...statiHtml, ...statiLeerDemo, ...statiLeerLive];
check("P4: HTTP 200 mit HTML bleibt ungültig; nur echtes leeres Demo-Array wird NO_DEMO_DATA",
  p4Stati.length >= 3 && p4Stati.every((s) => s === 200)
  && htmlAntwort?.code === ERROR_CODES.INVALID_RESPONSE
  && htmlLive?.code === ERROR_CODES.INVALID_RESPONSE
  && echtLeerLive?.code === ERROR_CODES.INVALID_RESPONSE
  && echtLeerDemo?.code === ERROR_CODES.NO_DEMO_DATA);

/* ============ P5: storedVariant() urteilt synchron und ohne Token ============
   Der Boot fragt nur eines: „passt der gespeicherte Programm-Topf zur
   Betriebsart?" activeVariant() beantwortet das über getAccessToken() und stößt
   bei fast abgelaufener Sitzung eine Erneuerung samt Netz-Zeitgrenze an — der
   Boot stünde dann bei hängender Verbindung vor der Startseite. storedVariant()
   darf dafür ausschließlich die gespeicherte Sitzung lesen.

   Nachgewiesen wird das an den SPUREN im Auth-Treiber: wer die
   Erneuerungsmaschinerie betritt, ändert dessen Zustand (AUTH_ZUSTAND).
   storedVariant() darf keine Spur hinterlassen — und da es synchron ist, kann
   es gar keine Antwort abwarten. */
abmelden();
check("P5: ohne gespeicherte Sitzung meldet storedVariant() „demo“",
  catalogService.storedVariant() === "demo");
anmelden();
check("P5: mit gespeicherter Sitzung meldet storedVariant() „live“",
  catalogService.storedVariant() === "live");
const p5Urteil = catalogService.storedVariant();
check("P5: das Urteil kommt synchron — ein blanker String, kein Versprechen",
  typeof p5Urteil === "string" && typeof p5Urteil.then !== "function");
const p5Versprechen = catalogService.activeVariant();
check("P5-Gegenüberstellung: activeVariant() ist demgegenüber ein Versprechen (und darf es bleiben)",
  typeof p5Versprechen?.then === "function" && (await p5Versprechen) === "live");

/* Scharfstellen: eine ABGELAUFENE Sitzung. Genau sie treibt activeVariant() in
   die Erneuerung — der Preis, den der Boot nicht zahlen darf. */
await catalogService.activeVariant();                 // Treiberzustand auf „angemeldet"
const zustandVorher = authDriver.getZustand();
check("P5-Vorbedingung: der Auth-Treiber steht auf „angemeldet“",
  zustandVorher === AUTH_ZUSTAND.ANGEMELDET);
localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
  v: 1, access_token: SITZUNGSTOKEN, refresh_token: "test-erneuerungswert-platzhalter",
  gueltigBis: Date.now() - 60000,                     // abgelaufen -> Erneuerung fällig
  kontoId: "test-konto", mail: "tester@login.kinodreieck.at", benutzername: "tester",
}));
fetchCalls = [];
const p5Urteil2 = catalogService.storedVariant();
/* Erst die Warteschlangen leerlaufen lassen: ein nur ANGESTOSSENER (nicht
   abgewarteter) Token-Griff hinterließe seine Spur eine Mikrotask später — ohne
   diesen Tick wäre der Zustands-Check blind dafür. */
await new Promise((r) => setTimeout(r, 0));
check("P5: auch bei abgelaufener Sitzung urteilt storedVariant() allein aus der Ablage („live“)",
  p5Urteil2 === "live");
check("P5: der Aufruf löst keinen einzigen Request aus", fetchCalls.length === 0);
check("P5: er betritt die Erneuerungsmaschinerie des Treibers nicht — dessen Zustand bleibt unberührt",
  authDriver.getZustand() === zustandVorher);
/* Eichung des Zählers: derselbe fetchCalls zählt sehr wohl, wenn wirklich
   gelesen wird — „0 Requests" ist damit ein Befund und kein toter Zähler. */
await verwerfeKatalogCache();
await catalogService.loadArea("programm", { variante: "demo" });
check("P5-Eichung: derselbe Zähler erfasst einen echten Katalog-Read", fetchCalls.length >= 1);
/* Und die Scharfprobe: dieselbe Sitzung schickt activeVariant() in die
   Erneuerung — sichtbar am gewechselten Treiberzustand. */
localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
  v: 1, access_token: SITZUNGSTOKEN, refresh_token: "test-erneuerungswert-platzhalter",
  gueltigBis: Date.now() - 60000,
  kontoId: "test-konto", mail: "tester@login.kinodreieck.at", benutzername: "tester",
}));
await catalogService.activeVariant();
check("P5-Scharfprobe: bei genau dieser Sitzung geht activeVariant() in die Erneuerung (Zustand wechselt)",
  authDriver.getZustand() !== zustandVorher);

/* --- Demo-Seed ist ein normaler öffentlicher Katalogvertrag ---------------- */
abmelden();
const oeffentlicherKopf = publicSupabaseHeaders(publishable);
check("Leitplanke: publicSupabaseHeaders bleibt bei gesetztem Token-Provider unverändert (nur apikey)",
  oeffentlicherKopf.apikey === publishable && !oeffentlicherKopf.Authorization && Object.keys(oeffentlicherKopf).join() === "apikey");
fetchCalls = [];
const demoSeed = await catalogService.loadDemo();
const demoRuf = fetchCalls.find((c) => c.url.includes("/rest/v1/kd_catalog") && c.url.includes("name=eq.demo_seed"));
check("Demo-Seed kommt aus kd_catalog und besteht den gemeinsamen Vertrag",
  demoSeed.format === 1 && demoSeed.master.filme[0].titel === "Demo-Basis" && !!demoRuf);
check("Gast liest demo_seed nur mit Publishable-Key",
  !demoRuf.headers.Authorization && demoRuf.headers.apikey === publishable);
check("Aktiver Katalogpfad ruft für den Demo-Seed kd_store nicht mehr auf",
  !fetchCalls.some((c) => c.url.includes("/rest/v1/kd_store")));

/* ================= F6: das Sitzungstoken gilt nur fürs eigene Projekt =================
   Die Regel selbst ist eine reine Funktion (ohne Netz prüfbar) … */
check("F6: identische Projekt-URL erlaubt das Sitzungstoken",
  katalogTokenErlaubt("https://projekt-a.supabase.co", "https://projekt-a.supabase.co") === true);
check("F6: fremde Projekt-URL verbietet das Sitzungstoken",
  katalogTokenErlaubt("https://projekt-b.supabase.co", "https://projekt-a.supabase.co") === false);
check("F6: Groß-/Kleinschreibung, Schrägstrich am Ende und Leerraum entscheiden den Vergleich nicht",
  katalogTokenErlaubt("  https://Projekt-A.supabase.co/  ", "https://projekt-a.supabase.co") === true
  && katalogTokenErlaubt("https://projekt-a.supabase.co", " HTTPS://PROJEKT-A.SUPABASE.CO/ ") === true);
check("F6: Normalisierung macht aus zwei VERSCHIEDENEN Projekten kein gleiches",
  katalogTokenErlaubt("  https://Projekt-B.supabase.co/  ", "https://projekt-a.supabase.co") === false);
check("F6: ohne bekannte Projekt-URL gibt es nichts zu vergleichen — bisheriges Verhalten bleibt",
  katalogTokenErlaubt("https://projekt-b.supabase.co", "") === true
  && katalogTokenErlaubt("", "https://projekt-a.supabase.co") === true);

/* … der eigentliche Beweis ist aber der Durchstich durch den echten Katalog-Read.
   Geprüft wird dabei GENAU der Provider, der auch produktiv läuft: services/catalog.js
   verdrahtet ihn mit `setKatalogTokenProvider(baueKatalogTokenProvider())`. Hier
   bekommt dieselbe Fabrik nur die Projekt-URL explizit mit, weil in der
   Testumgebung keine Runtime-Konfiguration gebaut ist. Die Regel selbst, der
   Guard und der Griff zum Auth-Treiber sind unverändert der Produktionscode.
   Der Wrapper schreibt ausschließlich mit — entschieden wird nichts in ihm. */
const F6_PROJEKT = "https://projekt-a.supabase.co";
const f6Provider = baueKatalogTokenProvider(F6_PROJEKT, katalogAuth, authDriver);
let f6Aufrufe = [];
setKatalogTokenProvider((opts = {}) => { f6Aufrufe.push(opts); return f6Provider(opts); });

anmelden();
setKatalogZugang({ url: "https://fremd-projekt.supabase.co", key: publishable });
await verwerfeKatalogCache();
fetchCalls = []; f6Aufrufe = [];
const fremdesProjekt = await ladeKatalogAsset("programm_demo", { erwarteteKontoId: "test-konto" });
check("F6-Durchstich (produktiver Provider aus baueKatalogTokenProvider): fremde Katalog-URL ⇒ Request ohne Authorization",
  fetchCalls.length === 1 && !fetchCalls[0].headers.Authorization && fetchCalls[0].headers.apikey === publishable);
check("F6-Durchstich: der Read läuft trotzdem durch — anon statt Abbruch",
  fremdesProjekt.quelle === "datenbank" && fremdesProjekt.payload.demo === true);
check("F6-Durchstich: die gespeicherte Sitzung bleibt dabei bestehen (keine Abmeldung)",
  !!localStorage.getItem(AUTH_SESSION_KEY));
check("F6: holeToken reicht die Katalog-URL an den produktiven Provider durch — ohne sie greift der Guard ins Leere",
  f6Aufrufe.length >= 1 && f6Aufrufe.every((o) => typeof o.katalogUrl === "string" && o.katalogUrl.length > 0));

setKatalogZugang({ url: F6_PROJEKT, key: publishable });
await verwerfeKatalogCache();
fetchCalls = [];
const eigenesProjekt = await ladeKatalogAsset("programm", { erwarteteKontoId: "test-konto" });
check("F6-Gegenprobe: bei übereinstimmender Projekt-URL gibt derselbe Provider das Sitzungstoken frei",
  fetchCalls.at(-1)?.headers?.Authorization === "Bearer " + SITZUNGSTOKEN);
check("F6-Gegenprobe: erst mit Token wird die Live-Zeile überhaupt sichtbar",
  eigenesProjekt.asset === "programm" && !eigenesProjekt.payload.demo);

abmelden();
console.log(`\n${ok} Checks bestanden.`);
