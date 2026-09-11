/* ================= Zentraler Programm-/Streaming-Katalog =================
   Der Rechner von Max schreibt validierte JSON-Payloads in `kd_catalog`.
   Gelesen wird mit dem Supabase-Publishable-Key; liegt eine Sitzung vor, geht
   zusätzlich deren Token mit (Etappe 4). Persönlicher Sync und service_role
   sind hiervon getrennt.

   Tabelle/Assets:
     manifest        -> kleiner Verbindungs- und Versionsnachweis (anon lesbar)
     programm        -> normalisiertes film.at-/Nonstop-Programm  (nur angemeldet)
     streaming       -> Legacy-Kombination für bereits ausgelieferte Clients
     streaming_bekannt / streaming_entdecken -> getrennte Live-Ansichten
     programm_demo   -> ehrlicher Demo-Schnappschuss des Programms (anon lesbar)
     streaming_demo  -> Legacy-Kombination für bereits ausgelieferte Clients
     streaming_bekannt_demo / streaming_entdecken_demo -> getrennte Demo-Ansichten
     demo_seed       -> kuratierte lokale Demo-Basis (anon lesbar)

   Zugriffstrennung (Migration 20260725220000): `anon` sieht nur manifest und
   die beiden *_demo-Zeilen. PostgREST filtert per RLS OHNE 403 — die Antwort
   ist HTTP 200 mit leerem Array. Ein leeres Ergebnis auf einer Live-Zeile ohne
   wirksames Token ist deshalb KEIN Datenfehler, sondern „Anmeldung nötig"
   (error.status = 401), damit die Grenzschicht daraus UNAUTHENTICATED macht.

   Genau deshalb wird der Grund am Fehler VERMERKT statt aus dem Status geraten
   (KATALOG_GRUENDE): weil RLS ohne 403 filtert, heißt ein ECHTER HTTP-401 auf
   dieser Tabelle praktisch immer „apikey/JWT wird abgelehnt" — also ungültiger
   Zugangsschlüssel, nicht „melde dich an". Beides muss unterscheidbar bleiben,
   sonst hört ein Tester mit vertipptem Schlüssel ewig „Anmeldung nötig".

   Token-Naht: das Sitzungstoken wird per setKatalogTokenProvider() injiziert
   (services/catalog.js reicht den Auth-Treiber durch). Ohne Provider verhält
   sich dieses Modul exakt wie vorher — nur apikey.

   Rückgabekontrakt von ladeKatalogAsset() (klein und bewusst stabil):
     {
       payload,                       // geprüfte Nutzlast
       quelle: "datenbank" | "cache", // Herkunft der BYTES (wie bisher)
       warnung?,                      // gesetzt, wenn der Cache eingesprungen ist
       status?,                       // HTTP-Status des gescheiterten Direkt-Reads
       grund?,                        // KATALOG_GRUENDE-Marke des gescheiterten Reads
       anmeldungNoetig?,              // true NUR beim synthetischen „Anmeldung nötig"
       asset,                         // tatsächlich gelesene Zeile
       variante: "live" | "demo",     // Betriebsart der Zeile
       stand,                         // DB-Spalte stand (Fallback updated_at), ISO
       gueltigBis,                    // DB-Spalte gueltig_bis, ISO
       datenquelle,                   // DB-Spalte quelle (slug aus kd_quellen)
       abgelaufen,                    // gueltigBis liegt in der Vergangenheit
       gecachtAm,                     // ms, nur bei quelle === "cache"
     }
   `quelle` bleibt die Bytes-Herkunft (Bestandsverhalten); die gleichnamige
   DB-Spalte heißt hier `datenquelle`, damit sich beide nie überlagern.

   Große Payloads werden im Cache-Storage gehalten. Ist Supabase kurz offline,
   gewinnt der letzte erfolgreiche Stand — dann aber sichtbar als „cache". */

import { K } from "./storage.js";
import { SB_DEFAULT_URL, SB_DEFAULT_ANON } from "./supabaseDefaults.js";
import { istSupabaseProjektUrl } from "./supabasePublic.js";
import {
  ergaenzeFehlendeExterneKennungen,
  externeTitelKennungen,
  normalisiereExternenTitel,
  ordneExternenTitelZu,
} from "./externalTitleIdentity.js";
import { createTitleFactsProjector, projectTitleFacts } from "./titleFacts.js";

const TABLE = "kd_catalog";
const CACHE = "kinodreieck-katalog-v1";
const ERLAUBT = new Set([
  "manifest", "programm", "streaming", "programm_demo", "streaming_demo", "demo_seed",
  "streaming_bekannt", "streaming_entdecken",
  "streaming_bekannt_demo", "streaming_entdecken_demo",
]);
/* Zeilen, die `anon` per RLS NICHT sieht. Nur hier ist ein leeres Ergebnis ein
   Anmeldungs- und kein Datenproblem. */
const NUR_ANGEMELDET = new Set([
  "programm", "streaming", "streaming_bekannt", "streaming_entdecken",
]);
const CACHE_MARKE = "kd-katalog-1";

/* Gründe, die dieses Modul an einen Fehler heftet. Die Grenzschicht liest sie
   (statt Statuscodes zu deuten) und macht daraus die Nutzerzustände. */
export const KATALOG_GRUENDE = Object.freeze({
  ANMELDUNG: "katalog-anmeldung-noetig",     // synthetisch: Live-Zeile leer, kein Token
  DEMO_FEHLT: "katalog-demo-fehlt",          // Demo-Zeile in der DB noch nicht veröffentlicht
  SCHLUESSEL: "katalog-schluessel-ungueltig", // echter HTTP-401: apikey/JWT abgelehnt
});

function sauber(s) { return String(s == null ? "" : s).trim(); }
function geheim(s) { return sauber(s).replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF\u2022\u25CF]/g, ""); }

/* ---------- Token-Naht (reine Injektion, kein Import des Auth-Treibers) ----------
   Kein Provider gesetzt = exakt das bisherige Verhalten. Der Provider bekommt
   dieselben Optionen wie im Account-Treiber ({ erzwingeErneuerung }). Tokens
   werden hier nie zwischengespeichert. */
let tokenProvider = null;
export function setKatalogTokenProvider(fn) {
  tokenProvider = typeof fn === "function" ? fn : null;
}
async function holeToken(opts) {
  if (!tokenProvider) return null;
  try {
    const t = await tokenProvider(opts || {});
    return t ? String(t) : null;
  } catch { return null; }
}

/* Katalog-Header. Bewusst NICHT publicSupabaseHeaders(): dort darf nie ein
   Sitzungstoken landen (kd_store-Pfade teilen sich die Funktion). Ohne Token
   bleibt das Verhalten identisch \u2014 inklusive Altbestand-Regel, dass ein als
   Katalogschl\u00FCssel eingetragener anon-JWT auch als Bearer mitgeht. */
function katalogKopf(key, token, extra = {}) {
  const k = sauber(key);
  const headers = { ...extra, apikey: k };
  if (token) headers.Authorization = "Bearer " + token;
  else if (/^eyJ/.test(k)) headers.Authorization = "Bearer " + k;
  return headers;
}

export function varianteVon(name) {
  const n = String(name || "");
  return n === "demo_seed" || n.endsWith("_demo") ? "demo" : "live";
}

function istAbgelaufen(gueltigBis) {
  if (!gueltigBis) return false;
  const t = Date.parse(gueltigBis);
  return Number.isFinite(t) && t < Date.now();
}

function meldung(name, meta = {}) {
  return {
    asset: name,
    variante: varianteVon(name),
    stand: meta.stand || null,
    gueltigBis: meta.gueltigBis || null,
    datenquelle: meta.datenquelle || null,
    abgelaufen: istAbgelaufen(meta.gueltigBis),
  };
}

export function getKatalogZugang() {
  let url = SB_DEFAULT_URL || "", key = SB_DEFAULT_ANON || "";
  try {
    url = sauber(localStorage.getItem(K.katalogUrl) || url).replace(/\/+$/, "");
    key = geheim(localStorage.getItem(K.katalogKey) || key);
  } catch { /* Storage blockiert */ }
  return { url, key };
}

export function setKatalogZugang({ url, key } = {}) {
  if (typeof localStorage === "undefined") return getKatalogZugang();
  if (url !== undefined) localStorage.setItem(K.katalogUrl, sauber(url).replace(/\/+$/, ""));
  if (key !== undefined) localStorage.setItem(K.katalogKey, geheim(key));
  return getKatalogZugang();
}

export function loescheKatalogZugang() {
  try { localStorage.removeItem(K.katalogKey); } catch { /* */ }
}

export function hatKatalogZugang() {
  const c = getKatalogZugang();
  return istSupabaseProjektUrl(c.url) && c.key.length >= 20;
}

function cacheUrl(name) {
  const basis = (typeof location !== "undefined" && location.origin && location.origin !== "null")
    ? location.origin : "https://cache.kinodreieck.invalid";
  return basis + "/__kd_katalog_cache__" + "/" + name;
}

/* Der Cache trägt seit Etappe 4 eine Hülle mit den Herkunfts-Metadaten mit —
   sonst wüsste ein Cache-Treffer nicht, von wann seine Daten sind. Altbestand
   (blanke Payload) wird weiter gelesen, dann eben ohne Metadaten. */
async function cacheSchreiben(name, payload, meta) {
  if (typeof caches === "undefined" || typeof Response === "undefined") return;
  try {
    const c = await caches.open(CACHE);
    const huelle = { __kd: CACHE_MARKE, gecachtAm: Date.now(), meta: meta || {}, payload };
    await c.put(cacheUrl(name), new Response(JSON.stringify(huelle), { headers: { "Content-Type": "application/json" } }));
  } catch { /* Cache ist Komfort, nie Wahrheitsquelle */ }
}

async function cacheLesen(name) {
  if (typeof caches === "undefined") return null;
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(cacheUrl(name));
    if (!r) return null;
    const roh = await r.json();
    if (roh && roh.__kd === CACHE_MARKE) {
      return { payload: roh.payload, meta: roh.meta || {}, gecachtAm: roh.gecachtAm || null };
    }
    return { payload: roh, meta: {}, gecachtAm: null };
  } catch { return null; }
}

/* Cache-Storage-Eintrag wirklich verwerfen. Ohne das blieb „neu laden" ein
   halber Schritt: der Programm-Topf war leer, der Cache-Storage aber voll und
   gewann beim nächsten fehlgeschlagenen Direkt-Read erneut. */
export async function verwerfeKatalogCache(namen) {
  const liste = (Array.isArray(namen) ? namen : namen ? [namen] : [...ERLAUBT]).filter((n) => ERLAUBT.has(n));
  if (typeof caches === "undefined") return false;
  try {
    const c = await caches.open(CACHE);
    let weg = false;
    for (const n of liste) { if (await c.delete(cacheUrl(n))) weg = true; }
    return weg;
  } catch { return false; }
}

/* Demo-Payloads durchlaufen dieselbe Strukturprüfung wie ihr Live-Pendant —
   ein kaputter Demo-Schnappschuss darf nicht ungeprüft in die Oberfläche. */
export function pruefeDemoSeed(p) {
  if (!p || typeof p !== "object" || p.format !== 1) throw new Error("Demo-Seed ohne unterstütztes Format");
  if (!p.master || typeof p.master !== "object" || !Array.isArray(p.master.filme)) {
    throw new Error("Demo-Seed ohne master.filme[]");
  }
  const optional = [
    ["mustwatch", p.mustwatch, (v) => v && typeof v === "object" && Array.isArray(v.eintraege)],
    ["streaming_dienste", p.streaming_dienste, (v) => v && typeof v === "object" && Array.isArray(v.quellen)],
    ["artikel", p.artikel, (v) => v && typeof v === "object" && Array.isArray(v.artikel)],
    ["kino_pins", p.kino_pins, Array.isArray],
    ["merkliste", p.merkliste, Array.isArray],
  ];
  for (const [name, wert, gueltig] of optional) {
    if (wert != null && !gueltig(wert)) throw new Error("Demo-Seed: " + name + " hat die falsche Form");
  }
  return p;
}

function pruefePayload(name, p) {
  if (!p || typeof p !== "object") throw new Error(name + ": leere oder ungültige Payload");
  if (name === "manifest" && !p.updated_at && !p.stand) throw new Error("Manifest ohne Stand");
  if ((name === "programm" || name === "programm_demo")
    && !Array.isArray(p.filme) && !(p.data && Array.isArray(p.data.filme))) throw new Error("Programm ohne filme[]");
  if ((name === "streaming" || name === "streaming_demo")
    && !(p.bekannt && p.entdecken)) throw new Error("Streaming ohne bekannt/entdecken");
  if ((name.startsWith("streaming_bekannt")
    || name.startsWith("streaming_entdecken"))
    && !Array.isArray(p.titel)) throw new Error(name + " ohne titel[]");
  if (name === "demo_seed") return pruefeDemoSeed(p);
  return p;
}

/* Ein Katalog-Read. Bei 401 GENAU EIN erzwungener Erneuerungsversuch (Vorbild:
   accountDriver.rest). Bleibt es dabei, fällt der Katalogpfad auf den anon-Weg
   zurück — ein totes Token meldet hier NIEMALS ab, darüber entscheidet allein
   der Auth-Treiber. */
async function direktLesen(name, signal, erwarteteKontoId = null) {
  if (!ERLAUBT.has(name)) throw new Error("Unbekanntes Katalog-Asset: " + name);
  const c = getKatalogZugang();
  if (!hatKatalogZugang()) throw new Error("Datenbank-Zugang noch nicht eingerichtet");
  const url = c.url + "/rest/v1/" + TABLE + "?name=eq." + encodeURIComponent(name)
    + "&select=payload,updated_at,quelle,stand,gueltig_bis&limit=1";

  /* Die Katalog-URL geht an den Token-Provider mit: nur er weiß, zu welcher
     Projekt-URL die Sitzung gehört, und hält das Token bei Abweichung zurück
     (Zugang bleibt lesbar, dann eben anon). */
  let token = await holeToken({ katalogUrl: c.url, erwarteteKontoId });
  let mitToken = !!token;
  const hole = (t) => fetch(url, { cache: "no-store", signal, headers: katalogKopf(c.key, t, { Accept: "application/json" }) });
  let res = await hole(token);
  if (res.status === 401 && mitToken) {
    token = await holeToken({ erzwingeErneuerung: true, katalogUrl: c.url, erwarteteKontoId });
    if (token) res = await hole(token);
    if (res.status === 401) { mitToken = false; res = await hole(null); }   // anon-Rückfall
  }

  /* `jsonOk` trennt zwei Fälle, die sonst verschmelzen: „PostgREST antwortete
     mit einem leeren Array" (RLS/Zeile fehlt) und „die Antwort war überhaupt
     kein JSON". Captive Portal, Firmenproxy und CDN-Fehlerseiten liefern
     regelmäßig HTTP 200 mit HTML — daraus darf nie das endgültige Urteil
     „noch keine Beispieldaten veröffentlicht" werden. */
  let body = null, jsonOk = false;
  try { body = await res.json(); jsonOk = true; } catch { /* Fehlertext ist nicht zwingend JSON */ }
  if (!res.ok) {
    const error = new Error("Datenbank HTTP " + res.status + (body && body.message ? ": " + body.message : ""));
    error.status = res.status;
    /* Ein 401, der trotz anon-Rückfall bleibt, kommt nicht von der RLS (die
       filtert lautlos), sondern vom abgelehnten Schlüssel. */
    if (res.status === 401) error.reason = KATALOG_GRUENDE.SCHLUESSEL;
    throw error;
  }
  /* HTTP 200, aber kein JSON-Array: das kam nicht von PostgREST. Weder
     Anmeldungs- noch Veröffentlichungsfrage — eine ungültige Antwort. */
  if (!jsonOk || !Array.isArray(body)) {
    throw new Error("Datenbank lieferte für „" + name + "“ keine gültige JSON-Antwort.");
  }
  if (!body[0]) {
    /* PostgREST filtert per RLS ohne 403: 200 + leeres Array. Ohne wirksames
       Token ist das auf einer Live-Zeile der Anmeldungs-, kein Datenfehler. */
    if (NUR_ANGEMELDET.has(name) && !mitToken) {
      const error = new Error("Für „" + name + "“ ist eine Anmeldung nötig.");
      error.status = 401;
      error.reason = KATALOG_GRUENDE.ANMELDUNG;
      throw error;
    }
    /* Die Demo-Zeilen sind für alle lesbar. Fehlen sie, ist schlicht noch nichts
       veröffentlicht — weder ein Server- noch ein Anmeldungsproblem. */
    if (varianteVon(name) === "demo") {
      const error = new Error("Für „" + name + "“ ist noch nichts veröffentlicht.");
      error.reason = KATALOG_GRUENDE.DEMO_FEHLT;
      throw error;
    }
    throw new Error("Asset „" + name + "“ fehlt in der Datenbank");
  }
  let payload = body[0].payload;
  if (typeof payload === "string") payload = JSON.parse(payload);
  const p = pruefePayload(name, payload);
  if (body[0].updated_at && !p.db_updated_at) p.db_updated_at = body[0].updated_at;
  return {
    payload: p,
    meta: {
      stand: body[0].stand || body[0].updated_at || null,
      gueltigBis: body[0].gueltig_bis || null,
      datenquelle: body[0].quelle || null,
    },
  };
}

async function direktMitZeitgrenze(name, timeout, erwarteteKontoId = null) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try { return await direktLesen(name, ctrl ? ctrl.signal : undefined, erwarteteKontoId); }
  finally { if (timer) clearTimeout(timer); }
}

export async function ladeKatalogAsset(name, {
  nurCache = false, timeout = 12000, erwarteteKontoId = null,
} = {}) {
  if (!ERLAUBT.has(name)) throw new Error("Unbekanntes Katalog-Asset: " + name);
  if (!nurCache) {
    try {
      const r = await direktMitZeitgrenze(name, timeout, erwarteteKontoId);
      await cacheSchreiben(name, r.payload, r.meta);
      return { payload: r.payload, quelle: "datenbank", ...meldung(name, r.meta) };
    } catch (e) {
      const alt = await cacheLesen(name);
      if (alt) {
        return {
          payload: pruefePayload(name, alt.payload),
          quelle: "cache",
          warnung: String(e && e.message || e),
          status: Number.isFinite(e?.status) ? e.status : null,
          grund: e?.reason || null,
          /* Nur der synthetische Grund heißt „Anmeldung nötig". Ein echter 401
             wäre ein abgelehnter Schlüssel und darf sich nicht so verkleiden. */
          anmeldungNoetig: e?.reason === KATALOG_GRUENDE.ANMELDUNG,
          gecachtAm: alt.gecachtAm,
          ...meldung(name, alt.meta),
        };
      }
      throw e;
    }
  }
  const alt = await cacheLesen(name);
  return alt
    ? { payload: pruefePayload(name, alt.payload), quelle: "cache", gecachtAm: alt.gecachtAm, ...meldung(name, alt.meta) }
    : null;
}

function fehlerText(e) {
  return e && e.name === "AbortError" ? "Zeitüberschreitung" : String(e && e.message || e);
}

/* Verbindungsprüfung. `manifest` bleibt anon lesbar — es allein zu prüfen hieß
   „Verbunden ✓" zu melden, während Programm und Streaming leer bleiben. Wird
   ein `asset` übergeben (die für die aktuelle Betriebsart wirklich benötigte
   Zeile), wird sie zusätzlich direkt geprüft, bewusst ohne Cache-Rückfall:
   die Frage lautet „geht es JETZT?", nicht „lag mal etwas im Browser".
   `ok` meint die Verbindung; ob das Asset da ist, steht getrennt in `asset`. */
export async function testeKatalogZugang({
  asset = null, timeout = 10000, erwarteteKontoId = null,
} = {}) {
  let manifest = null, quelle = null;
  try {
    const r = await ladeKatalogAsset("manifest", { timeout, erwarteteKontoId });
    manifest = r.payload; quelle = r.quelle;
  } catch (e) {
    return {
      ok: false, verbindung: false, manifest: null, asset: null,
      status: Number.isFinite(e?.status) ? e.status : null,
      grund: e?.reason || null,
      message: fehlerText(e),
    };
  }
  const basis = { ok: true, verbindung: true, manifest, quelle };
  if (!asset) return { ...basis, asset: null };
  try {
    const r = await direktMitZeitgrenze(asset, timeout, erwarteteKontoId);
    const m = meldung(asset, r.meta);
    return {
      ...basis,
      asset: {
        ok: true, name: asset, variante: m.variante, status: 200, anmeldungNoetig: false,
        stand: m.stand, gueltigBis: m.gueltigBis, datenquelle: m.datenquelle, abgelaufen: m.abgelaufen,
      },
    };
  } catch (e) {
    const status = Number.isFinite(e?.status) ? e.status : null;
    /* Kein roher Backendtext nach draußen: der Grund reist als Marke, den Satz
       für den Menschen formuliert die Grenzschicht (services/catalog.js) —
       derselbe Weg, den auch ein geworfener Fehler nimmt. */
    return {
      ...basis,
      asset: {
        ok: false,
        name: asset,
        variante: varianteVon(asset),
        status,
        grund: e?.reason || null,
        anmeldungNoetig: e?.reason === KATALOG_GRUENDE.ANMELDUNG,
        /* Der rohe Fehler NUR für die Grenzschicht (Netz-/Zeitüberschreitung
           erkennt sie an ihm). Sie ersetzt dieses Feld durch ihren eigenen,
           normalisierten Fehler, bevor irgendeine Oberfläche ihn sieht. */
        fehler: e,
      },
    };
  }
}

/* Aus den bisher getrennt gelieferten Ansichten entsteht ein neutraler Katalog.
   Danach wird „Mein Programm“ immer im Browser gegen die AKTIVE Masterliste
   gebildet. Damit funktionieren Demo- und Clean-Modus mit derselben DB-Payload. */
export function baueStreamingAnsichten(streaming, master = [], flixpatrolFakten = []) {
  const projectFacts = createTitleFactsProjector(flixpatrolFakten);
  const masterMitFakten = (Array.isArray(master) ? master : []).map((entry) => ({ ...entry }));
  /* Ein Vollkatalog enthaelt derzeit rund 25.000 Titel. Jeden davon gegen
     jeden Mediathek-Eintrag zu pruefen blockiert den Browser auf Mobilgeraeten
     fuer viele Sekunden. Die eigentliche strenge Identitaetspruefung bleibt
     unveraendert; dieser Index schraenkt nur auf Eintraege ein, die ueberhaupt
     einen gemeinsamen normalisierten Titel oder eine gleiche starke ID haben.
     Genau diese beiden Bedingungen oeffnen in `pruefeExterneTitelIdentitaet`
     erst einen moeglichen Match oder Konflikt. */
  const titelIndex = new Map(), idIndex = new Map();
  const fuegeEin = (index, key, eintrag) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(eintrag);
  };
  for (const eintrag of masterMitFakten) {
    for (const titel of [eintrag?.titel, eintrag?.title, eintrag?.originaltitel, eintrag?.originalTitle]) {
      fuegeEin(titelIndex, normalisiereExternenTitel(titel), eintrag);
    }
    for (const [namespace, wert] of Object.entries(externeTitelKennungen(eintrag))) {
      fuegeEin(idIndex, `${namespace}:${wert}`, eintrag);
    }
  }
  const kandidatenFuer = (extern) => {
    const kandidaten = new Set();
    for (const titel of [extern?.titel, extern?.title, extern?.originaltitel, extern?.originalTitle]) {
      for (const eintrag of titelIndex.get(normalisiereExternenTitel(titel)) || []) kandidaten.add(eintrag);
    }
    for (const [namespace, wert] of Object.entries(externeTitelKennungen(extern))) {
      for (const eintrag of idIndex.get(`${namespace}:${wert}`) || []) kandidaten.add(eintrag);
    }
    return [...kandidaten];
  };
  const bekanntAlt = (streaming && streaming.bekannt) || {};
  const entdeckenAlt = (streaming && streaming.entdecken) || {};
  const objekt = (wert) => wert && typeof wert === "object" && !Array.isArray(wert) ? wert : {};
  const gleicherKatalogStand = !!bekanntAlt.katalog_stand
    && bekanntAlt.katalog_stand === entdeckenAlt.katalog_stand;
  const vereinigeMetadaten = (feld) => {
    if (bekanntAlt.katalog_stand && entdeckenAlt.katalog_stand && !gleicherKatalogStand) {
      /* Zwei Publikationsstände dürfen keinen künstlich vollständigen
         Quellenbeleg ergeben. Im ohnehin angeforderten Vollweg ist Discover
         der aktuelle Stand; fehlende Felder werden nicht aus Known ergänzt. */
      return { ...objekt(entdeckenAlt?.[feld]) };
    }
    return { ...objekt(bekanntAlt?.[feld]), ...objekt(entdeckenAlt?.[feld]) };
  };
  const vereinigeListen = (links, rechts) => [...new Set([
    ...(Array.isArray(links) ? links : []),
    ...(Array.isArray(rechts) ? rechts : []),
  ])];
  const vereinigeDienstDiffs = (links, rechts) => {
    const map = new Map();
    for (const diff of [...(Array.isArray(links) ? links : []), ...(Array.isArray(rechts) ? rechts : [])]) {
      const key = JSON.stringify([diff?.dienst, diff?.vorher, diff?.nachher, diff?.erkannt_am]);
      map.set(key, diff);
    }
    return map.size ? [...map.values()] : undefined;
  };
  const map = new Map();
  for (const t of entdeckenAlt.titel || []) {
    const projected = projectFacts(t);
    map.set(String(projected.watchmode_id), { ...projected });
  }
  for (const t of bekanntAlt.titel || []) {
    const key = String(t.watchmode_id);
    const entdeckenTitel = map.get(key) || {};
    const katalogGenres = vereinigeListen(
      entdeckenTitel.genres ?? entdeckenTitel.genre,
      t.genres ?? t.genre,
    );
    const neutral = {
      watchmode_id: t.watchmode_id,
      titel: t.titel ?? entdeckenTitel.titel,
      jahr: t.jahr ?? entdeckenTitel.jahr,
      /* Der neutrale Entdecken-Datensatz traegt den Werktyp explizit. Ein
         historischer Bekannt-Datensatz ohne Typ darf ihn daraus uebernehmen,
         wird aber nie pauschal zum Film erklaert. */
      typ: t.typ ?? entdeckenTitel.typ ?? null,
      /* Leere Kataloggenres bleiben „nicht geliefert“. Nur so kann die
         bestehende persönliche Genreangabe nach einem strengen Match wie
         bisher einspringen. */
      genres: katalogGenres.length ? katalogGenres : null,
      user_score: t.user_score ?? entdeckenTitel.user_score ?? null,
      tmdb_id: t.tmdb_id ?? entdeckenTitel.tmdb_id ?? null,
      imdb_id: t.imdb_id ?? entdeckenTitel.imdb_id ?? null,
      dienste: vereinigeListen(entdeckenTitel.dienste, t.dienste),
      web_urls: { ...objekt(entdeckenTitel.web_urls), ...objekt(t.web_urls) },
      relevanz: t.relevanz ?? 0, relevanz_signale: t.relevanz_signale || [],
      staffeln_verfuegbar: t.staffeln_verfuegbar ?? null,
      folgen_verfuegbar: t.folgen_verfuegbar ?? null,
      folge_aktuell: t.folge_aktuell ?? null,
      letzte_folge: t.letzte_folge ?? null,
      naechste_folge: t.naechste_folge ?? null,
      naechste_folge_am: t.naechste_folge_am ?? null,
      naechste_staffel: t.naechste_staffel ?? null,
      naechste_staffel_am: t.naechste_staffel_am ?? null,
      staffel_dienste: t.staffel_dienste || [],
      staffelstand_geprueft_am: t.staffelstand_geprueft_am ?? null,
      /* E11 liefert kleine quellenbezogene Angebotsbelege. Sie bleiben am
         Titel erhalten; die Consumerprojektion entscheidet erst später anhand
         der aktuellen Auswahl, ob daraus ein sichtbarer Zugang folgt. */
      dienst_diffs: vereinigeDienstDiffs(entdeckenTitel.dienst_diffs, t.dienst_diffs),
    };
    map.set(key, projectFacts({ ...entdeckenTitel, ...neutral,
      title_facts: t.title_facts ?? entdeckenTitel.title_facts,
    }));
  }

  const meine = [], entdecken = [];
  for (const t of map.values()) {
    const zuordnung = ordneExternenTitelZu(t, kandidatenFuer(t));
    if (zuordnung.status === "matched") {
      const film = ergaenzeFehlendeExterneKennungen(zuordnung.match, t);
      const filmMitFakten = projectTitleFacts(film, t.titleFactsEvidence || flixpatrolFakten);
      const genreMap = new Map();
      for (const genre of [
        ...(Array.isArray(filmMitFakten.genres) ? filmMitFakten.genres : Array.isArray(filmMitFakten.genre) ? filmMitFakten.genre : []),
        ...(Array.isArray(t.genres) ? t.genres : []),
      ]) {
        const wert = String(typeof genre === "object" ? genre?.name || "" : genre).trim();
        const genreKey = wert.toLocaleLowerCase("de-AT");
        if (wert && !genreMap.has(genreKey)) genreMap.set(genreKey, wert);
      }
      meine.push({
        ...filmMitFakten,
        genres: [...genreMap.values()],
        beschreibung: filmMitFakten.beschreibung || filmMitFakten.description || t.beschreibung || t.description || null,
        laufzeit_minuten: filmMitFakten.laufzeit_minuten ?? filmMitFakten.runtimeMinutes ?? t.laufzeit_minuten ?? t.runtimeMinutes ?? null,
        titleFacts: filmMitFakten.titleFacts || t.titleFacts || null,
        titleFactsEvidence: filmMitFakten.titleFactsEvidence || t.titleFactsEvidence || [],
        descriptionEvidence: filmMitFakten.descriptionEvidence || t.descriptionEvidence || null,
        chartEvidence: filmMitFakten.chartEvidence || t.chartEvidence || [],
        dienste: t.dienste || [],
        web_urls: t.web_urls || null,
        staffeln_verfuegbar: t.staffeln_verfuegbar ?? film.staffeln_verfuegbar ?? null,
        folgen_verfuegbar: t.folgen_verfuegbar ?? film.folgen_verfuegbar ?? null,
        folge_aktuell: t.folge_aktuell ?? film.folge_aktuell ?? null,
        letzte_folge: t.letzte_folge ?? film.letzte_folge ?? null,
        naechste_folge: t.naechste_folge ?? film.naechste_folge ?? null,
        naechste_folge_am: t.naechste_folge_am ?? film.naechste_folge_am ?? null,
        naechste_staffel: t.naechste_staffel ?? film.naechste_staffel ?? null,
        naechste_staffel_am: t.naechste_staffel_am ?? film.naechste_staffel_am ?? null,
        staffel_dienste: t.staffel_dienste || film.staffel_dienste || [],
        staffelstand_geprueft_am: t.staffelstand_geprueft_am ?? film.staffelstand_geprueft_am ?? null,
        dienst_diffs: Array.isArray(t.dienst_diffs) ? t.dienst_diffs : undefined,
      });
    } else entdecken.push(t);
  }
  const meta = {
    ...entdeckenAlt,
    ...bekanntAlt,
    titel: undefined,
    stand_pro_quelle: vereinigeMetadaten("stand_pro_quelle"),
    vergleich_stand_pro_quelle: vereinigeMetadaten("vergleich_stand_pro_quelle"),
    katalog_stand_bekannt: bekanntAlt.katalog_stand ?? null,
    katalog_stand_entdecken: entdeckenAlt.katalog_stand ?? null,
    katalog_stand_konsistent: !!bekanntAlt.katalog_stand
      && bekanntAlt.katalog_stand === entdeckenAlt.katalog_stand,
  };
  /* Der geladene Rohkatalog, der erkannte Mediathekbestand und die daraus
     gebildete Entdecken-Ansicht sind verschiedene Mengen. `entdeckenUmfang`
     stammt ausschließlich aus dem lokalen Ladepfad in App.jsx; fehlt die
     Marke, darf die Oberfläche den Stand nicht als Vollkatalog ausgeben. */
  const katalogMengen = Object.freeze({
    rohkatalog: map.size,
    masterbestand: Array.isArray(master) ? master.length : 0,
    imMasterGefunden: meine.length,
    nachMasterAbzug: entdecken.length,
    umfang: streaming?.entdeckenUmfang === "voll" ? "voll" : "begrenzt",
  });
  return {
    bekannt: { ...meta, katalogMengen, titel: meine },
    entdecken: { ...meta, heuristik: entdeckenAlt.heuristik, katalogMengen, titel: entdecken },
  };
}
