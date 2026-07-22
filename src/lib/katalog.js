/* ================= Zentraler Programm-/Streaming-Katalog =================
   Der Rechner von Max schreibt validierte JSON-Payloads in `kd_catalog`.
   Die PWA liest ausschließlich mit dem vom Tester eingegebenen Supabase-
   Publishable-Key. Persönlicher Sync und service_role sind hiervon getrennt.

   Tabelle/Assets:
     manifest   -> kleiner Verbindungs- und Versionsnachweis
     programm   -> normalisiertes film.at-/Nonstop-Programm
     streaming  -> { bekannt, entdecken } aus dem letzten Pipeline-Lauf

   Große Payloads werden im Cache-Storage gehalten. Ist Supabase kurz offline,
   gewinnt der letzte erfolgreiche Stand; beim allerersten Start wird ehrlich
   ein Fehler gemeldet. */

import { K } from "./storage.js";
import { SB_DEFAULT_URL } from "./supabaseDefaults.js";

const TABLE = "kd_catalog";
const CACHE = "kinodreieck-katalog-v1";
const ERLAUBT = new Set(["manifest", "programm", "streaming"]);

function sauber(s) { return String(s == null ? "" : s).trim(); }
function geheim(s) { return sauber(s).replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF\u2022\u25CF]/g, ""); }

export function getKatalogZugang() {
  let url = SB_DEFAULT_URL || "", key = "";
  try {
    url = sauber(localStorage.getItem(K.katalogUrl) || url).replace(/\/+$/, "");
    key = geheim(localStorage.getItem(K.katalogKey) || "");
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
  return /^https:\/\/[^\s]+\.supabase\.co$/i.test(c.url) && c.key.length >= 20;
}

function cacheUrl(name) {
  const basis = (typeof location !== "undefined" && location.origin && location.origin !== "null")
    ? location.origin : "https://cache.kinodreieck.invalid";
  return basis + "/__kd_katalog_cache__" + "/" + name;
}

async function cacheSchreiben(name, payload) {
  if (typeof caches === "undefined" || typeof Response === "undefined") return;
  try {
    const c = await caches.open(CACHE);
    await c.put(cacheUrl(name), new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }));
  } catch { /* Cache ist Komfort, nie Wahrheitsquelle */ }
}

async function cacheLesen(name) {
  if (typeof caches === "undefined") return null;
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(cacheUrl(name));
    return r ? await r.json() : null;
  } catch { return null; }
}

function pruefePayload(name, p) {
  if (!p || typeof p !== "object") throw new Error(name + ": leere oder ungültige Payload");
  if (name === "manifest" && !p.updated_at && !p.stand) throw new Error("Manifest ohne Stand");
  if (name === "programm" && !Array.isArray(p.filme) && !(p.data && Array.isArray(p.data.filme))) throw new Error("Programm ohne filme[]");
  if (name === "streaming" && !(p.bekannt && p.entdecken)) throw new Error("Streaming ohne bekannt/entdecken");
  return p;
}

async function direktLesen(name, signal) {
  if (!ERLAUBT.has(name)) throw new Error("Unbekanntes Katalog-Asset: " + name);
  const c = getKatalogZugang();
  if (!hatKatalogZugang()) throw new Error("Datenbank-Zugang noch nicht eingerichtet");
  const url = c.url + "/rest/v1/" + TABLE + "?name=eq." + encodeURIComponent(name) + "&select=payload,updated_at&limit=1";
  const res = await fetch(url, {
    cache: "no-store", signal,
    headers: { apikey: c.key, Authorization: "Bearer " + c.key, Accept: "application/json" },
  });
  let body = null;
  try { body = await res.json(); } catch { /* Fehlertext ist nicht zwingend JSON */ }
  if (!res.ok) throw new Error("Datenbank HTTP " + res.status + (body && body.message ? ": " + body.message : ""));
  if (!Array.isArray(body) || !body[0]) throw new Error("Asset „" + name + "“ fehlt in der Datenbank");
  let payload = body[0].payload;
  if (typeof payload === "string") payload = JSON.parse(payload);
  const p = pruefePayload(name, payload);
  if (body[0].updated_at && !p.db_updated_at) p.db_updated_at = body[0].updated_at;
  return p;
}

export async function ladeKatalogAsset(name, { nurCache = false, timeout = 12000 } = {}) {
  if (!ERLAUBT.has(name)) throw new Error("Unbekanntes Katalog-Asset: " + name);
  if (!nurCache) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const p = await direktLesen(name, ctrl ? ctrl.signal : undefined);
      await cacheSchreiben(name, p);
      return { payload: p, quelle: "datenbank" };
    } catch (e) {
      const alt = await cacheLesen(name);
      if (alt) return { payload: pruefePayload(name, alt), quelle: "cache", warnung: String(e && e.message || e) };
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }
  const p = await cacheLesen(name);
  return p ? { payload: pruefePayload(name, p), quelle: "cache" } : null;
}

export async function testeKatalogZugang() {
  try {
    const r = await ladeKatalogAsset("manifest", { timeout: 10000 });
    return { ok: true, manifest: r.payload, quelle: r.quelle };
  } catch (e) {
    return { ok: false, message: e && e.name === "AbortError" ? "Zeitüberschreitung" : String(e && e.message || e) };
  }
}

/* Aus den bisher getrennt gelieferten Ansichten entsteht ein neutraler Katalog.
   Danach wird „Mein Programm“ immer im Browser gegen die AKTIVE Masterliste
   gebildet. Damit funktionieren Demo- und Clean-Modus mit derselben DB-Payload. */
export function baueStreamingAnsichten(streaming, master = []) {
  const bekanntAlt = (streaming && streaming.bekannt) || {};
  const entdeckenAlt = (streaming && streaming.entdecken) || {};
  const map = new Map();
  for (const t of entdeckenAlt.titel || []) map.set(String(t.watchmode_id), { ...t });
  for (const t of bekanntAlt.titel || []) {
    const key = String(t.watchmode_id);
    const neutral = {
      watchmode_id: t.watchmode_id, titel: t.titel, jahr: t.jahr,
      typ: t.typ || "movie", genres: t.genres || t.genre || null,
      user_score: t.user_score ?? null, tmdb_id: t.tmdb_id ?? null, imdb_id: t.imdb_id ?? null,
      dienste: t.dienste || [], web_urls: t.web_urls || null,
      relevanz: t.relevanz ?? 0, relevanz_signale: t.relevanz_signale || [],
    };
    map.set(key, { ...(map.get(key) || {}), ...neutral });
  }

  const meine = [], entdecken = [];
  for (const t of map.values()) {
    /* Lokaler Import vermeiden: kleine, exakte Matching-Variante. App.jsx stellt
       bereits sicher, dass Master-IDs/Titel normalisiert sind. */
    const n = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const tt = n(t.titel);
    const film = (master || []).find((f) => {
      const jahrOk = !t.jahr || !f.jahr || Math.abs(Number(f.jahr) - Number(t.jahr)) <= 2;
      return jahrOk && (n(f.titel) === tt || n(f.originaltitel) === tt);
    });
    if (film) meine.push({ ...film, watchmode_id: t.watchmode_id, dienste: t.dienste || [], web_urls: t.web_urls || null });
    else entdecken.push(t);
  }
  const meta = { ...entdeckenAlt, ...bekanntAlt, titel: undefined };
  return {
    bekannt: { ...meta, titel: meine },
    entdecken: { ...meta, heuristik: entdeckenAlt.heuristik, titel: entdecken },
  };
}
