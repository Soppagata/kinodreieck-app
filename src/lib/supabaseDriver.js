/* ---------- Supabase-Treiber (Block 2) ----------
   Storage-Treiber, der die sync-relevanten Schlüssel in eine managed Postgres-DB
   (Supabase, PostgREST) spiegelt — Zwilling des Git-Treibers, aber ohne Git.
   Modell: localStorage ist der Cache (schnell, offline-fest), die DB ist die Wahrheit.
   - Login-frei: Schreibzugriff wird über einen geheimen Sync-Schlüssel pro Gerät
     autorisiert (Header `x-kd-key`), analog zum Git-PAT. Der Schlüssel liegt NUR
     im localStorage (kd:sb:key), nie im Build/Repo/einer Zeile.
   - Pull-on-start: GET der Owner-Zeilen (scope=user); VOR jedem Überschreiben lokal
     ein Snapshot. Fehlt eine Zeile => lokal bleibt, wird beim ersten Commit angelegt.
   - Commit-on-change: set() schreibt SOFORT lokal, danach im Hintergrund ein
     serialisierter PATCH/POST. Erfolg => Pending weg. Fehler/Offline => pending.
   - Optimistische Sperre über `rev` (server-monoton, Trigger) statt SHA: PATCH mit
     `rev=eq.<gesehen>` — 0 Zeilen zurück => jemand anderes war schneller => Konflikt,
     NIE blind überschreiben. Lokal snapshoten, Wahl der UI überlassen.
   - delete(): nur lokaler Cache. Remote wird NIE automatisch gelöscht.
   Rein deterministisch, kein LLM. Nur der anon/publishable-Key im Client; RLS ist
   die Sicherheitsgrenze. Der `service_role`-Key kommt hier nie vor. */

import { localDriver } from "./storage.js";
import { SB_DEFAULT_URL, SB_DEFAULT_ANON } from "./supabaseDefaults.js";

/* Die 11 datentragenden Schlüssel — identisch zur Git-SYNC_MAP (Testfall hält sie
   deckungsgleich). Beim Supabase-Treiber ist der Schlüssel zugleich der Zeilen-
   Schlüssel (Spalte `key`); es gibt keine Datei-Indirektion. */
export const SYNC_KEYS = [
  "kd:master", "kd:artikel", "kd:kino-pins", "kd:merkliste", "kd:vokabular",
  "kd:einstellungen", "kd:entdecken-status", "kd:autor-name", "kd:streaming-dienste",
  "kd:mustwatch", "kd:achievements",
];
const SYNC_SET = new Set(SYNC_KEYS);
const TABLE = "kd_store";

/* Konfig/Status — rein lokal, NICHT gesynct. Eigener Namespace kd:sb:* (analog kd:git:*). */
const CFG = { url: "kd:sb:url", anon: "kd:sb:anon", key: "kd:sb:key", owner: "kd:sb:owner" };
const VER_KEY = "kd:sb:ver";        // { key: rev } — zuletzt gesehene Server-Version pro Schlüssel
const STATUS_KEY = "kd:sb:status";  // { lastPull, lastCommit, pending:{}, conflict:{}, stale:{} }
const SNAP_KEY = "kd:sb:snap";      // { key: [{t, value}] } — rollierend, letzte 5
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
function saeubere(s) { return (s == null ? "" : String(s)).trim(); }
/* Sync-Schlüssel/anon-Key gegen unsichtbare Kopier-Zeichen UND Masken-Punkte härten
   (Lernpunkt aus dem Git-Spike: Punkte-Maske als value zerstörte den Token). */
function saeubereGeheim(s) {
  return (s == null ? "" : String(s)).replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF\u2022\u25CF]/g, "");
}
export function getSupabaseConfig() {
  return {
    url: saeubere(localStorage.getItem(CFG.url) || "").replace(/\/+$/, ""),
    anon: saeubereGeheim(localStorage.getItem(CFG.anon) || ""),
    key: saeubereGeheim(localStorage.getItem(CFG.key) || ""),
    owner: saeubere(localStorage.getItem(CFG.owner) || ""),
  };
}
export function setSupabaseConfig({ url, anon, key, owner } = {}) {
  if (url !== undefined) localStorage.setItem(CFG.url, saeubere(url).replace(/\/+$/, ""));
  if (anon !== undefined) localStorage.setItem(CFG.anon, saeubereGeheim(anon));
  if (key !== undefined) localStorage.setItem(CFG.key, saeubereGeheim(key));
  if (owner !== undefined) localStorage.setItem(CFG.owner, saeubere(owner));
}
/* Für Pull/Verbindung genügen url+anon+owner; Schreiben braucht zusätzlich den Schlüssel.
   isSupabaseConfigured() = bereit für den Alltag (Lesen+Schreiben) => Schlüssel Pflicht. */
export function isSupabaseConfigured() {
  const c = getSupabaseConfig();
  return /^https?:\/\/[^\s]+$/.test(c.url) && c.anon.length > 0 && c.owner.length > 0 && c.key.length > 0;
}
export function hatSyncSchluessel() { return getSupabaseConfig().key.length > 0; }

/* ---------- Status-/Versions-/Snapshot-Verwaltung ---------- */
function getStatus() { return readJSON(STATUS_KEY, { lastPull: null, lastCommit: null, pending: {}, conflict: {}, stale: {} }); }
function setStatus(patch) { const s = getStatus(); writeJSON(STATUS_KEY, { ...s, ...patch }); }
function markPending(key, on) { const s = getStatus(); if (on) s.pending[key] = true; else delete s.pending[key]; writeJSON(STATUS_KEY, s); }
function markConflict(key, on) { const s = getStatus(); if (on) s.conflict[key] = true; else delete s.conflict[key]; writeJSON(STATUS_KEY, s); }
/* stale = Pull für diesen Schlüssel zuletzt fehlgeschlagen. Bewusst GETRENNT von
   pending — ein Pull-Fehler ist KEIN Grund, den lokalen Stand zu pushen. */
function markStale(key, on) { const s = getStatus(); s.stale = s.stale || {}; if (on) s.stale[key] = true; else delete s.stale[key]; writeJSON(STATUS_KEY, s); }
function getVer(key) { const v = readJSON(VER_KEY, {})[key]; return (typeof v === "number") ? v : null; }
function setVer(key, rev) { const m = readJSON(VER_KEY, {}); if (rev == null) delete m[key]; else m[key] = rev; writeJSON(VER_KEY, m); }

function snapshot(key, value) {
  if (value == null) return;
  const all = readJSON(SNAP_KEY, {});
  const list = all[key] || [];
  list.push({ t: nowIso(), value });
  while (list.length > SNAP_MAX) list.shift();
  all[key] = list;
  writeJSON(SNAP_KEY, all);
}
export function getSnapshots(key) { return readJSON(SNAP_KEY, {})[key] || []; }
function nowIso() { try { return new Date().toISOString(); } catch { return String(Date.now()); } }

/* ---------- PostgREST-Zugriff ---------- */
function restBase() { return getSupabaseConfig().url + "/rest/v1"; }
function sbHeaders({ withBody, withKey, prefer } = {}) {
  const c = getSupabaseConfig();
  const h = { "apikey": c.anon, "Authorization": "Bearer " + c.anon };
  if (withBody) h["Content-Type"] = "application/json";
  if (withKey && c.key) h["x-kd-key"] = c.key;   // Sync-Schlüssel NUR im Header, nie in einer Zeile
  if (prefer) h["Prefer"] = prefer;
  return h;
}
async function sbFetch(method, path, { body, withKey, prefer } = {}) {
  /* Timeout wie im Git-Treiber: ein hängender fetch dürfte den Boot-Pull sonst
     nie auflösen (await vor dem Rendern). */
  const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
  try {
    const res = await fetch(restBase() + path, {
      method,
      headers: sbHeaders({ withBody: !!body, withKey, prefer }),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* 204/leerer Body möglich */ }
    return { status: res.status, ok: res.ok, data };
  } finally { if (timer) clearTimeout(timer); }
}
function q(v) { return encodeURIComponent(v); }
function deutung(status, data) {
  const msg = (data && (data.message || data.hint)) || "";
  if (status === 401 || status === 403) return "Zugriff verweigert — anon-Key oder Sync-Schlüssel falsch, oder RLS. " + msg;
  if (status === 404) return "Nicht gefunden — Projekt-URL/Tabelle prüfen. " + msg;
  if (status === 409) return "Versionskonflikt. " + msg;
  return "HTTP " + status + " " + msg;
}

export async function connectionTest() {
  const c = getSupabaseConfig();
  if (!/^https?:\/\//.test(c.url) || !c.anon) return { ok: false, status: 0, message: "Projekt-URL und anon-Key nötig." };
  try {
    // Reine Erreichbarkeit/Auth: gültiger anon-Key => 200 (auch bei 0 Zeilen).
    const r = await sbFetch("GET", `/${TABLE}?select=key&limit=1`, { withKey: true });
    if (r.ok) return { ok: true, status: r.status };
    return { ok: false, status: r.status, message: deutung(r.status, r.data) };
  } catch (e) { return { ok: false, status: 0, message: "Netzwerk/CORS: " + e }; }
}

/* ---------- Demo-Blobs per anon-Read (Phase 5) ----------
   Liest die Demo-Menge (scope=demo) OHNE Sync-Schlüssel — nur mit dem öffentlichen
   anon-Key. Nutzt die konfigurierte URL/anon oder die Build-Defaults. Für die
   Demo-Startwahl im Tester-Build; Tester-Edits bleiben lokal (kein DB-Write). */
export async function ladeDemoBlobs() {
  const c = getSupabaseConfig();
  const url = (c.url || SB_DEFAULT_URL || "").replace(/\/+$/, "");
  const anon = c.anon || SB_DEFAULT_ANON || "";
  if (!/^https?:\/\//.test(url) || !anon) throw new Error("Demo-Quelle nicht konfiguriert (Supabase-URL/anon-Key).");
  const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
  try {
    const res = await fetch(url + "/rest/v1/" + TABLE + "?scope=eq.demo&select=key,value", {
      headers: { "apikey": anon, "Authorization": "Bearer " + anon },   // KEIN x-kd-key: reiner anon-Read
      signal: ctrl ? ctrl.signal : undefined,
    });
    let data = null; try { data = await res.json(); } catch { /* leerer Body */ }
    if (!res.ok || !Array.isArray(data)) throw new Error("Demo-Read fehlgeschlagen: HTTP " + res.status);
    const blobs = {};
    for (const row of data) { if (row && typeof row.key === "string") blobs[row.key] = (row.value == null ? null : String(row.value)); }
    return blobs;
  } finally { if (timer) clearTimeout(timer); }
}

/* ---------- Pull-on-start ---------- */
export async function syncPull() {
  const c = getSupabaseConfig();
  if (!isSupabaseConfigured()) return { ok: false, message: "nicht konfiguriert" };
  const ergebnis = { geladen: [], angelegt: [], konflikt: [], fehler: [] };
  let remoteRows;
  try {
    const r = await sbFetch("GET", `/${TABLE}?owner=eq.${q(c.owner)}&scope=eq.user&select=key,value,rev`, { withKey: true });
    if (!r.ok || !Array.isArray(r.data)) {
      // Gesamt-Pull fehlgeschlagen: alle Sync-Schlüssel als stale führen (nie als pending).
      for (const key of SYNC_KEYS) { markStale(key, true); ergebnis.fehler.push({ key, status: r.status }); }
      setStatus({ lastPull: nowIso() });
      return { ok: false, ...ergebnis };
    }
    remoteRows = r.data;
  } catch (e) {
    for (const key of SYNC_KEYS) markStale(key, true);
    setStatus({ lastPull: nowIso() });
    return { ok: false, geladen: [], angelegt: [], konflikt: [], fehler: SYNC_KEYS.map((key) => ({ key, error: String(e) })) };
  }

  const remote = {};
  for (const row of remoteRows) { if (row && SYNC_SET.has(row.key)) remote[row.key] = row; }

  for (const key of SYNC_KEYS) {
    const row = remote[key];
    if (!row) {
      // Zeile existiert noch nicht — lokal bleibt, wird beim ersten Commit angelegt.
      markStale(key, false);
      ergebnis.angelegt.push(key);
      continue;
    }
    const remoteVal = (row.value == null) ? null : String(row.value);
    const lokal = localStorage.getItem(key);
    const st = getStatus();
    const ungesynct = !!((st.pending && st.pending[key]) || (st.conflict && st.conflict[key]));
    if (lokal !== remoteVal && ungesynct && lokal != null) {
      /* Lokale, noch nicht committete Änderung trifft auf abweichendes Remote:
         NIE stillschweigend verwerfen. Konflikt markieren, rev bewusst NICHT
         übernehmen (sonst überschriebe der nächste Commit das Remote still). */
      snapshot(key, lokal);
      markConflict(key, true); markStale(key, false);
      ergebnis.konflikt.push(key);
      continue;
    }
    if (lokal !== remoteVal) {
      snapshot(key, lokal);                          // VOR dem Überschreiben sichern
      if (remoteVal == null) localStorage.removeItem(key);
      else localStorage.setItem(key, remoteVal);     // Remote ist Wahrheit beim Pull
    }
    setVer(key, row.rev);
    markPending(key, false); markConflict(key, false); markStale(key, false);
    ergebnis.geladen.push(key);
  }
  setStatus({ lastPull: nowIso() });
  return { ok: ergebnis.fehler.length === 0, ...ergebnis };
}

/* ---------- Commit-on-change (pro Schlüssel serialisiert) ----------
   Wie beim Git-Treiber: eine In-Memory-Queue pro Schlüssel, damit zwei schnelle
   set() nicht beide mit derselben gesehenen rev committen (der zweite liefe sonst
   in einen selbstverschuldeten Konflikt). commitKeyNow liest IMMER den aktuellen
   localStorage-Wert -> schnelle Folgeschreibungen coalescen auf den letzten Stand. */
const commitQueues = {};
function enqueueCommit(key) {
  const prev = commitQueues[key] || Promise.resolve();
  const next = prev.then(() => commitKeyNow(key)).catch((e) => ({ ok: false, error: String(e) }));
  commitQueues[key] = next;
  return next;
}

async function insertRow(key, value) {
  const c = getSupabaseConfig();
  const r = await sbFetch("POST", `/${TABLE}`, {
    body: { owner: c.owner, key, value, scope: "user" },
    withKey: true, prefer: "return=representation",
  });
  if ((r.status === 201 || r.status === 200) && Array.isArray(r.data) && r.data[0]) {
    setVer(key, r.data[0].rev);
    markPending(key, false); markConflict(key, false); markStale(key, false);
    setStatus({ lastCommit: nowIso() });
    return { ok: true, status: r.status };
  }
  if (r.status === 409) {
    // Zeile existiert remote, wir kannten sie nicht (rev unbekannt): Konflikt, nicht blind überschreiben.
    snapshot(key, value);
    markConflict(key, true); markPending(key, true);
    return { ok: false, conflict: true, status: r.status };
  }
  markPending(key, true);
  return { ok: false, status: r.status, message: deutung(r.status, r.data) };
}

async function commitKeyNow(key) {
  const value = localStorage.getItem(key);           // IMMER der aktuelle Stand
  if (value == null) { markPending(key, false); return { ok: true, skipped: true }; }
  if (!isSupabaseConfigured()) { markPending(key, true); return { ok: false, reason: "unconfigured" }; }
  const c = getSupabaseConfig();
  const seenRev = getVer(key);
  try {
    if (seenRev == null) {
      // Erster Schreibzugriff auf diesen Schlüssel: anlegen.
      return await insertRow(key, value);
    }
    // Optimistische Sperre: nur überschreiben, wenn rev unverändert.
    const r = await sbFetch("PATCH", `/${TABLE}?owner=eq.${q(c.owner)}&key=eq.${q(key)}&rev=eq.${seenRev}`, {
      body: { value }, withKey: true, prefer: "return=representation",
    });
    if (r.ok && Array.isArray(r.data) && r.data.length === 1) {
      setVer(key, r.data[0].rev);
      markPending(key, false); markConflict(key, false); markStale(key, false);
      setStatus({ lastCommit: nowIso() });
      return { ok: true, status: r.status };
    }
    if (r.ok && Array.isArray(r.data) && r.data.length === 0) {
      // rev passte nicht ODER Zeile ist weg. Aktuellen Stand holen und unterscheiden.
      const g = await sbFetch("GET", `/${TABLE}?owner=eq.${q(c.owner)}&key=eq.${q(key)}&select=key,value,rev`, { withKey: true });
      if (g.ok && Array.isArray(g.data) && g.data.length === 1) {
        // Fremder Stand mit anderer rev: Konflikt.
        snapshot(key, value);
        markConflict(key, true); markPending(key, true);
        return { ok: false, conflict: true, status: 409 };
      }
      if (g.ok && Array.isArray(g.data) && g.data.length === 0) {
        // Remote-Zeile gelöscht: neu anlegen.
        setVer(key, null);
        return await insertRow(key, value);
      }
      markPending(key, true);
      return { ok: false, status: g.status, message: deutung(g.status, g.data) };
    }
    markPending(key, true);
    return { ok: false, status: r.status, message: deutung(r.status, r.data) };
  } catch (e) {
    markPending(key, true);                           // offline: als nicht synchronisiert markieren
    return { ok: false, offline: true, error: String(e) };
  }
}

/* Ausstehende erneut versuchen — über dieselbe Queue. Konfliktschlüssel überspringen
   (nur bewusste Nutzerwahl pusht sie). */
export async function syncFlush() {
  const st = getStatus();
  const pending = Object.keys(st.pending || {});
  const versuche = [];
  for (const key of pending) {
    if (st.conflict && st.conflict[key]) continue;
    if (!SYNC_SET.has(key)) { markPending(key, false); continue; }
    versuche.push(await enqueueCommit(key));
  }
  return versuche;
}

/* Konflikt bewusst mit dem LOKALEN Stand auflösen: aktuellen Remote-rev holen,
   dann committen. Nur auf ausdrückliche Nutzerwahl. */
export async function resolveConflictPushLocal(key) {
  if (!SYNC_SET.has(key)) return { ok: false };
  const c = getSupabaseConfig();
  try {
    const g = await sbFetch("GET", `/${TABLE}?owner=eq.${q(c.owner)}&key=eq.${q(key)}&select=rev`, { withKey: true });
    if (g.ok && Array.isArray(g.data) && g.data[0]) setVer(key, g.data[0].rev);
    else if (g.ok && Array.isArray(g.data) && g.data.length === 0) setVer(key, null); // remote weg -> Neuanlage
    markConflict(key, false);
    return await enqueueCommit(key);
  } catch (e) { return { ok: false, error: String(e) }; }
}

/* Konflikt bewusst mit dem REMOTE-Stand auflösen: lokal snapshoten, Remote in den
   Cache schreiben, Flags räumen. Nur auf ausdrückliche Nutzerwahl. */
export async function resolveConflictUseRemote(key) {
  if (!SYNC_SET.has(key)) return { ok: false };
  const c = getSupabaseConfig();
  try {
    const g = await sbFetch("GET", `/${TABLE}?owner=eq.${q(c.owner)}&key=eq.${q(key)}&select=key,value,rev`, { withKey: true });
    if (g.ok && Array.isArray(g.data) && g.data[0]) {
      const remote = (g.data[0].value == null) ? null : String(g.data[0].value);
      const lokal = localStorage.getItem(key);
      if (lokal !== remote) { snapshot(key, lokal); if (remote == null) localStorage.removeItem(key); else localStorage.setItem(key, remote); }
      setVer(key, g.data[0].rev);
      markPending(key, false); markConflict(key, false); markStale(key, false);
      return { ok: true };
    }
    if (g.ok && Array.isArray(g.data) && g.data.length === 0) {
      // Remote weg: Konflikt hinfällig — lokal bleibt, nächster Commit legt neu an.
      setVer(key, null); markConflict(key, false);
      return { ok: true, neuAnlegen: true };
    }
    return { ok: false, status: g.status, message: deutung(g.status, g.data) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export function syncStatus() {
  const s = getStatus();
  return {
    lastPull: s.lastPull, lastCommit: s.lastCommit,
    pending: Object.keys(s.pending || {}),
    conflict: Object.keys(s.conflict || {}),
    stale: Object.keys(s.stale || {}),
    configured: isSupabaseConfigured(),
  };
}

/* ============================================================
   Shared-Blogs ("Blogs für alle", scope=shared) — Folge-Feature.
   Ein publizierter Blog ist EINE Zeile:
     owner=<Autor-Owner>, key="kd:blog:<artikelId>", scope="shared",
     author=<Anzeigename>, value=<Artikel-JSON OHNE lokale refs>.
   - Lesen ist offen (anon, KEIN Sync-Schlüssel) — RLS-Policy sel_shared.
   - Schreiben/Löschen nur der Autor: x-kd-key bindet via kd_key_ok(owner).
   - Lokale Mediathek-refs werden NICHT publiziert; sie sind pro Nutzer und
     werden beim Ziehen gegen DIE EIGENE Masterliste neu aufgelöst (Rotlinks).
   ============================================================ */
const BLOG_PREFIX = "kd:blog:";
export function blogKey(artikelId) { return BLOG_PREFIX + artikelId; }

/* Nur die teilbaren Felder serialisieren — lokale refs bewusst weglassen. */
function blogValue(artikel) {
  return JSON.stringify({
    id: artikel.id, titel: artikel.titel, autor: artikel.autor, text: artikel.text,
    geordnet: !!artikel.geordnet, erstellt_am: artikel.erstellt_am || null,
    liste: (artikel.liste || []).map((le) => ({
      eingabe: le.eingabe, jahr: le.jahr == null ? null : le.jahr, typ: le.typ || null,
    })),
  });
}

/* Eigenen Blog veröffentlichen/aktualisieren (Upsert auf PK owner,key). */
export async function publishBlog(artikel) {
  if (!isSupabaseConfigured()) return { ok: false, message: "Kein Sync-Schlüssel — Veröffentlichen braucht den eingeloggten Autor." };
  const c = getSupabaseConfig();
  const r = await sbFetch("POST", `/${TABLE}`, {
    body: { owner: c.owner, key: blogKey(artikel.id), value: blogValue(artikel), scope: "shared", author: artikel.autor || c.owner },
    withKey: true, prefer: "resolution=merge-duplicates,return=representation",
  });
  if ((r.status === 200 || r.status === 201) && Array.isArray(r.data)) { setStatus({ lastCommit: nowIso() }); return { ok: true, status: r.status }; }
  return { ok: false, status: r.status, message: deutung(r.status, r.data) };
}

/* Eigenen Blog aus dem geteilten Ordner entfernen (Autor-Delete = DB-weit).
   Fremde, bereits lokal gezogene Kopien bleiben — sie räumt deren Start-Abgleich. */
export async function unpublishBlog(artikelId) {
  if (!isSupabaseConfigured()) return { ok: false, message: "Kein Sync-Schlüssel." };
  const c = getSupabaseConfig();
  const r = await sbFetch("DELETE", `/${TABLE}?owner=eq.${q(c.owner)}&key=eq.${q(blogKey(artikelId))}`, { withKey: true });
  if (r.ok || r.status === 204) return { ok: true, status: r.status };
  return { ok: false, status: r.status, message: deutung(r.status, r.data) };
}

/* Alle geteilten Blogs lesen — offener anon-Read (kein Schlüssel). Speist
   "Blogs entdecken" UND die Start-Reconciliation. Normalisierte Einträge:
   { db_owner, db_key, author, updated_at, artikel }. */
export async function ladeSharedBlogs() {
  const c = getSupabaseConfig();
  const url = (c.url || SB_DEFAULT_URL || "").replace(/\/+$/, "");
  const anon = c.anon || SB_DEFAULT_ANON || "";
  if (!/^https?:\/\//.test(url) || !anon) return { ok: false, blogs: [], message: "nicht konfiguriert" };
  const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
  try {
    const res = await fetch(url + "/rest/v1/" + TABLE + "?scope=eq.shared&select=owner,key,value,author,updated_at", {
      headers: { "apikey": anon, "Authorization": "Bearer " + anon },   // KEIN x-kd-key: offener Read
      signal: ctrl ? ctrl.signal : undefined,
    });
    let data = null; try { data = await res.json(); } catch { /* leerer Body */ }
    if (!res.ok || !Array.isArray(data)) return { ok: false, blogs: [], status: res.status };
    const blogs = [];
    for (const row of data) {
      if (!row || typeof row.key !== "string") continue;
      let artikel = null; try { artikel = JSON.parse(row.value); } catch { continue; }
      if (!artikel || !artikel.titel) continue;
      blogs.push({ db_owner: row.owner, db_key: row.key, author: row.author || artikel.autor || row.owner, updated_at: row.updated_at || null, artikel });
    }
    return { ok: true, blogs };
  } catch (e) { return { ok: false, blogs: [], error: String(e) }; }
  finally { if (timer) clearTimeout(timer); }
}

/* ---------- Treiber-Fassade (implementiert die store-Signatur) ---------- */
export const supabaseDriver = {
  name: "supabase",
  status: syncStatus,                         // driver-agnostischer Status-Abgriff (storage.activeSyncStatus)
  pull: syncPull,                             // driver-agnostischer Pull (storage.activePull)
  async get(k) {
    // Cache-first, kein Netz pro Lesezugriff (Pull passiert beim Start).
    return localDriver.get(k);
  },
  async set(k, v) {
    const r = await localDriver.set(k, v);      // 1) SOFORT lokal sichern
    if (SYNC_SET.has(k)) { markPending(k, true); enqueueCommit(k); } // 2) Commit serialisiert im Hintergrund
    return r;
  },
  async delete(k) {
    // Nur lokaler Cache. Remote wird NIE automatisch gelöscht.
    return localDriver.delete(k);
  },
  async list(prefix = "") { return localDriver.list(prefix); },
};
