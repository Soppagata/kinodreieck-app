/* ---------- Git-Treiber (Phase 3b) ----------
   Storage-Treiber, der die sync-relevanten Schlüssel zusätzlich in ein privates
   GitHub-Daten-Repo spiegelt (Contents API). Modell: localStorage ist der Cache
   (schnell, offline-fest), Git ist die Wahrheit.
   - Pull-on-start: GET pro Datei, SHA merken; VOR jedem Überschreiben lokal ein
     Snapshot. 404 (Datei existiert noch nicht) => lokal bleibt, wird beim ersten
     Commit angelegt.
   - Commit-on-change: set() schreibt SOFORT lokal (Daten sicher), danach PUT mit
     gemerktem SHA im Hintergrund. Erfolg => Pending gelöscht. Fehler/Offline =>
     als „nicht synchronisiert" markiert, Retry bei Flush/Start. KEIN Datenverlust.
   - SHA-Mismatch (409/422): NIE blind überschreiben. Lokalen Stand snapshoten,
     Konflikt markieren, Wahl der UI überlassen (Remote laden / lokal pushen).
   - delete(): nur lokaler Cache. Remote wird NIE automatisch gelöscht.
   - PAT liegt ausschließlich im localStorage, wandert nie in eine Datei/Log.
   Rein deterministisch, kein LLM. */

import { localDriver } from "./storage.js";

/* Welche Schlüssel werden gesynct — und in welche Datei im Daten-Repo.
   Der Wert wird VERBATIM als Dateiinhalt persistiert (der localStorage-String);
   der Treiber parst/serialisiert NICHT, damit auch rohe Strings (autor-name)
   unversehrt round-trippen. */
export const SYNC_MAP = {
  "kd:master": "masterliste.json",
  "kd:artikel": "artikel.json",
  "kd:kino-pins": "kino-pins.json",
  "kd:merkliste": "merkliste.json",
  "kd:vokabular": "vokabular.json",
  "kd:einstellungen": "einstellungen.json",
  "kd:entdecken-status": "entdecken-status.json",
  "kd:autor-name": "autor-name.json",
  "kd:streaming-dienste": "streaming-dienste.json",
};

/* Konfig/Status — rein lokal, NICHT gesynct (nicht in SYNC_MAP). */
const CFG = { repo: "kd:git:repo", token: "kd:git:token", branch: "kd:git:branch" };
const SHA_KEY = "kd:git:sha";       // { file: sha }
const STATUS_KEY = "kd:git:status"; // { lastPull, lastCommit, pending:{file:true}, conflict:{file:true} }
const SNAP_KEY = "kd:git:snap";     // { file: [{t, value}] } — rollierend, letzte 5
const SNAP_MAX = 5;

/* ---------- kleine JSON-localStorage-Helfer ---------- */
function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function writeJSON(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch { /* Storage voll o.ä. */ }
}

/* ---------- Konfiguration ---------- */
export function getGitConfig() {
  return {
    repo: (localStorage.getItem(CFG.repo) || "").trim(),
    token: (localStorage.getItem(CFG.token) || "").trim(),
    branch: (localStorage.getItem(CFG.branch) || "main").trim() || "main",
  };
}
export function setGitConfig({ repo, token, branch } = {}) {
  if (repo !== undefined) localStorage.setItem(CFG.repo, saeubere(repo));
  if (token !== undefined) localStorage.setItem(CFG.token, saeubereToken(token));
  if (branch !== undefined) localStorage.setItem(CFG.branch, saeubere(branch) || "main");
}
export function isGitConfigured() {
  const c = getGitConfig();
  return /^[^/\s]+\/[^/\s]+$/.test(c.repo) && c.token.length > 0;
}
function saeubere(s) { return (s == null ? "" : String(s)).trim(); }
/* Token gegen unsichtbare Kopier-Zeichen härten (Lernpunkt aus dem Spike). */
function saeubereToken(s) {
  return (s == null ? "" : String(s)).replace(/[\s​-‍﻿ ⁠]/g, "");
}

/* ---------- base64 <-> UTF-8 (kein rohes btoa auf Unicode!) ---------- */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob((b64 || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------- Status-/SHA-/Snapshot-Verwaltung ---------- */
function getStatus() { return readJSON(STATUS_KEY, { lastPull: null, lastCommit: null, pending: {}, conflict: {} }); }
function setStatus(patch) { const s = getStatus(); writeJSON(STATUS_KEY, { ...s, ...patch }); }
function markPending(file, on) {
  const s = getStatus(); if (on) s.pending[file] = true; else delete s.pending[file]; writeJSON(STATUS_KEY, s);
}
function markConflict(file, on) {
  const s = getStatus(); if (on) s.conflict[file] = true; else delete s.conflict[file]; writeJSON(STATUS_KEY, s);
}
function getSha(file) { return readJSON(SHA_KEY, {})[file] || null; }
function setSha(file, sha) { const m = readJSON(SHA_KEY, {}); m[file] = sha; writeJSON(SHA_KEY, m); }

/* Snapshot des vorherigen lokalen Stands VOR jedem Überschreiben. */
function snapshot(key, value) {
  if (value == null) return; // nichts zu sichern
  const all = readJSON(SNAP_KEY, {});
  const list = all[key] || [];
  list.push({ t: nowIso(), value });
  while (list.length > SNAP_MAX) list.shift();
  all[key] = list;
  writeJSON(SNAP_KEY, all);
}
export function getSnapshots(key) { return readJSON(SNAP_KEY, {})[key] || []; }
function nowIso() { try { return new Date().toISOString(); } catch { return String(Date.now()); } }

/* ---------- GitHub Contents API ---------- */
function ghHeaders(token, withBody) {
  const h = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (withBody) h["Content-Type"] = "application/json";
  return h;
}
async function ghFetch(method, path, { token, body } = {}) {
  const res = await fetch("https://api.github.com" + path, {
    method, headers: ghHeaders(token, !!body), body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* leerer Body möglich */ }
  return { status: res.status, ok: res.ok, data };
}

export async function connectionTest() {
  const c = getGitConfig();
  if (!isGitConfigured()) return { ok: false, status: 0, message: "Repo (owner/name) und Token nötig." };
  try {
    const r = await ghFetch("GET", "/repos/" + c.repo, { token: c.token });
    if (r.ok) return { ok: true, status: r.status, private: !!(r.data && r.data.private), full_name: r.data && r.data.full_name };
    return { ok: false, status: r.status, message: deutung(r.status, r.data) };
  } catch (e) { return { ok: false, status: 0, message: "Netzwerk/CORS: " + e }; }
}
function deutung(status, data) {
  const msg = (data && data.message) || "";
  if (status === 401) return "Token ungültig oder abgelaufen. " + msg;
  if (status === 403) return "Zugriff verweigert (Scope/Rate-Limit). " + msg;
  if (status === 404) return "Nicht gefunden — Repo-Name falsch oder Token ohne Zugriff. " + msg;
  if (status === 409 || status === 422) return "SHA-Konflikt. " + msg;
  return "HTTP " + status + " " + msg;
}

/* ---------- Pull-on-start ---------- */
export async function syncPull() {
  const c = getGitConfig();
  if (!isGitConfigured()) return { ok: false, message: "nicht konfiguriert" };
  const ergebnis = { geladen: [], angelegt: [], fehler: [] };
  for (const [key, file] of Object.entries(SYNC_MAP)) {
    try {
      const r = await ghFetch("GET", `/repos/${c.repo}/contents/${encodeURIComponent(file)}?ref=${encodeURIComponent(c.branch)}`, { token: c.token });
      if (r.status === 200 && r.data && typeof r.data.content === "string") {
        const remote = b64decode(r.data.content);
        const lokal = localStorage.getItem(key);
        if (lokal !== remote) {
          snapshot(key, lokal);                 // VOR dem Überschreiben sichern
          localStorage.setItem(key, remote);    // Remote ist Wahrheit beim Pull
        }
        setSha(file, r.data.sha);
        markPending(file, false); markConflict(file, false);
        ergebnis.geladen.push(file);
      } else if (r.status === 404) {
        // Datei existiert noch nicht im Repo — lokal bleibt, wird bei erstem Commit angelegt.
        ergebnis.angelegt.push(file);
      } else {
        markPending(file, true);
        ergebnis.fehler.push({ file, status: r.status });
      }
    } catch (e) {
      markPending(file, true);                  // offline: lokal halten, später retry
      ergebnis.fehler.push({ file, error: String(e) });
    }
  }
  setStatus({ lastPull: nowIso() });
  return { ok: ergebnis.fehler.length === 0, ...ergebnis };
}

/* ---------- Commit-on-change (pro Datei serialisiert) ----------
   Alle Commits einer Datei laufen NACHEINANDER durch eine In-Memory-Queue.
   Grund: zwei schnelle set() auf denselben Key würden sonst beide mit demselben
   gecachten SHA committen — der zweite liefe in einen selbstverschuldeten 409.
   Die Queue stellt sicher, dass Commit N+1 erst startet, wenn Commit N den neuen
   SHA gecacht hat. commitFileNow liest zudem IMMER den AKTUELLEN localStorage-Wert
   (nicht den zum set()-Zeitpunkt) → schnelle Folgeschreibungen coalescen auf den
   letzten Stand statt sich gegenseitig zu überholen. */
const commitQueues = {}; // file -> Promise-Kette (nur im Speicher, Reset bei Reload; Pending überlebt in localStorage)

function enqueueCommit(key, file) {
  const prev = commitQueues[file] || Promise.resolve();
  const next = prev.then(() => commitFileNow(key, file)).catch((e) => ({ ok: false, error: String(e) }));
  commitQueues[file] = next;
  return next;
}

async function commitFileNow(key, file) {
  const c = getGitConfig();
  const value = localStorage.getItem(key);       // IMMER der aktuelle Stand
  if (value == null) { markPending(file, false); return { ok: true, skipped: true }; }
  if (!isGitConfigured()) { markPending(file, true); return { ok: false, reason: "unconfigured" }; }
  const sha = getSha(file);
  const body = { message: `kinodreieck: update ${file}`, content: b64encode(value), branch: c.branch };
  if (sha) body.sha = sha;
  try {
    const r = await ghFetch("PUT", `/repos/${c.repo}/contents/${encodeURIComponent(file)}`, { token: c.token, body });
    if (r.status === 200 || r.status === 201) {
      if (r.data && r.data.content && r.data.content.sha) setSha(file, r.data.content.sha);
      markPending(file, false); markConflict(file, false);
      setStatus({ lastCommit: nowIso() });
      return { ok: true, status: r.status };
    }
    if (r.status === 409 || r.status === 422) {
      // SHA-Mismatch mit FREMDEM Stand: NIE blind überschreiben. Lokal sichern, Konflikt melden.
      snapshot(key, value);
      markConflict(file, true); markPending(file, true);
      return { ok: false, conflict: true, status: r.status };
    }
    markPending(file, true);
    return { ok: false, status: r.status, message: deutung(r.status, r.data) };
  } catch (e) {
    markPending(file, true);                      // offline: als nicht synchronisiert markieren
    return { ok: false, offline: true, error: String(e) };
  }
}

/* Ausstehende (nicht synchronisierte) Änderungen erneut versuchen — über dieselbe
   Queue, damit kein Flush mit einem laufenden Hintergrund-Commit kollidiert. */
export async function syncFlush() {
  const pending = Object.keys(getStatus().pending || {});
  const versuche = [];
  for (const file of pending) {
    const key = Object.keys(SYNC_MAP).find((k) => SYNC_MAP[k] === file);
    if (!key) { markPending(file, false); continue; }
    versuche.push(await enqueueCommit(key, file));
  }
  return versuche;
}

/* Konflikt auflösen: bewusst den lokalen Stand pushen. Erst aktuellen Remote-SHA
   holen, dann über die Queue committen. Nur auf ausdrückliche Nutzerwahl. */
export async function resolveConflictPushLocal(key) {
  const file = SYNC_MAP[key]; if (!file) return { ok: false };
  const c = getGitConfig();
  try {
    const g = await ghFetch("GET", `/repos/${c.repo}/contents/${encodeURIComponent(file)}?ref=${encodeURIComponent(c.branch)}`, { token: c.token });
    if (g.status === 200 && g.data && g.data.sha) setSha(file, g.data.sha);
    else if (g.status === 404) setSha(file, null); // remote gelöscht → Neuanlage
    return await enqueueCommit(key, file);
  } catch (e) { return { ok: false, error: String(e) }; }
}

export function syncStatus() {
  const s = getStatus();
  return {
    lastPull: s.lastPull, lastCommit: s.lastCommit,
    pending: Object.keys(s.pending || {}), conflict: Object.keys(s.conflict || {}),
    configured: isGitConfigured(),
  };
}

/* ---------- Treiber-Fassade (implementiert die store-Signatur) ---------- */
export const gitDriver = {
  name: "git",
  async get(k) {
    // Cache-first, kein Netz pro Lesezugriff (Pull passiert beim Start).
    return localDriver.get(k);
  },
  async set(k, v) {
    const r = await localDriver.set(k, v);       // 1) SOFORT lokal sichern
    const file = SYNC_MAP[k];
    if (file) { markPending(file, true); enqueueCommit(k, file); } // 2) Commit serialisiert im Hintergrund
    return r;
  },
  async delete(k) {
    // Nur lokaler Cache. Remote wird NIE automatisch gelöscht (Reset = lokal + Re-Pull).
    return localDriver.delete(k);
  },
  async list(prefix = "") { return localDriver.list(prefix); },
};
