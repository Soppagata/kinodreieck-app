/* ---------- Account-Treiber (Etappe 3) ----------
   Spiegelt die persönlichen Töpfe in die Tabelle `kd_personal`. Zwilling des
   Legacy-Supabase-Treibers, aber mit echter Anmeldung statt geteiltem Schlüssel:

   - Autorisierung ausschließlich über das Sitzungs-Token (Authorization: Bearer).
     Die Zeilenzugehörigkeit setzt der Server (`account_id default auth.uid()`);
     dieser Treiber sendet NIE eine Account-ID. Ein Client, der sie fälschte,
     liefe in die RLS-WITH-CHECK-Sperre.
   - localStorage bleibt der Cache (schnell, offline-fest), die DB ist die Wahrheit.
   - Optimistische Sperre über `revision` (server-monoton, Trigger): PATCH mit
     `revision=eq.<gesehen>` — 0 Zeilen zurück heißt Konflikt, nie blind überschreiben.
   - Ein 401 mitten im Commit löst GENAU EINEN Erneuerungsversuch aus, danach bleibt
     der Topf ausstehend. Kein Retry-Sturm.
   - Ein zu großer Topf (Server-CHECK) ist ein TERMINALER Zustand, kein ewiges
     Wiederholen: sonst klemmte der Sync für immer an derselben 400er-Antwort.
   - Vor jedem Überschreiben beim Pull wird lokal gesichert — fail-closed: lässt
     sich der Sicherungspunkt nicht schreiben, wird NICHT überschrieben.
   - delete() bleibt lokal. Remote löscht nur der ausdrückliche Rücknahme-Weg.

   Der Treiber ist bewusst eine eigenständige Kopie und keine gemeinsame Basis mit
   dem Legacy-Treiber: der Legacy-Pfad ist eingefroren und soll für diese Etappe
   nicht mehr angefasst werden. Die beiden dürfen auseinanderlaufen. */

import { localDriver } from "./storage.js";
import { istSupabaseProjektUrl } from "./supabasePublic.js";

const TABLE = "kd_personal";

/* Die 15 accountgebundenen Töpfe: die 11 Sync-Töpfe des Legacy-Treibers plus die
   vier Sicht-/Zeit-Präferenzen, die bisher nur auf dem Gerät lagen und beim
   Gerätewechsel still verloren gingen. */
export const ACCOUNT_SYNC_KEYS = [
  "kd:master", "kd:artikel", "kd:kino-pins", "kd:merkliste", "kd:vokabular",
  "kd:einstellungen", "kd:entdecken-status", "kd:autor-name", "kd:streaming-dienste",
  "kd:mustwatch", "kd:achievements",
  "kd:zeitgrenze", "kd:filter-mediathek", "kd:filter-kino", "kd:filter-streaming",
];
const SYNC_SET = new Set(ACCOUNT_SYNC_KEYS);

/* Gerätezustand des Treibers — nie gesynct, nie im Backup, NIE Tokens.
   Eigener Namespace kd:acct:* (die Sitzung selbst liegt getrennt in kd:auth:session). */
const VER_KEY = "kd:acct:ver";        // { key: revision } — zuletzt gesehene Server-Version
const STATUS_KEY = "kd:acct:status";  // { lastPull, lastCommit, pending, conflict, stale, zuGross }
const SNAP_KEY = "kd:acct:snap";      // { key: [{t, value}] } — rollierend
const OWNER_KEY = "kd:acct:owner";    // Account-ID, zu der der lokale Cache gehört
const SNAP_MAX = 5;
export const ACCT_KEYS = Object.freeze({ ver: VER_KEY, status: STATUS_KEY, snap: SNAP_KEY, owner: OWNER_KEY });

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function writeJSON(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; }
}
function nowIso() { try { return new Date().toISOString(); } catch { return String(Date.now()); } }

/* ---------- Status ---------- */
function leerStatus() { return { lastPull: null, lastCommit: null, pending: {}, conflict: {}, stale: {}, zuGross: {} }; }
function getStatus() { return { ...leerStatus(), ...readJSON(STATUS_KEY, {}) }; }
function setStatus(patch) { writeJSON(STATUS_KEY, { ...getStatus(), ...patch }); }
function mark(feld, key, an) {
  const s = getStatus();
  s[feld] = s[feld] || {};
  if (an) s[feld][key] = true; else delete s[feld][key];
  writeJSON(STATUS_KEY, s);
}
const markPending = (k, an) => mark("pending", k, an);
const markConflict = (k, an) => mark("conflict", k, an);
const markStale = (k, an) => mark("stale", k, an);
const markZuGross = (k, an) => mark("zuGross", k, an);

function getVer(key) { const v = readJSON(VER_KEY, {})[key]; return (typeof v === "number") ? v : null; }
function setVer(key, revision) {
  const m = readJSON(VER_KEY, {});
  if (revision == null) delete m[key]; else m[key] = revision;
  writeJSON(VER_KEY, m);
}

function snapshot(key, value) {
  if (value == null) return true;
  const all = readJSON(SNAP_KEY, {});
  const list = all[key] || [];
  list.push({ t: nowIso(), value });
  while (list.length > SNAP_MAX) list.shift();
  all[key] = list;
  return writeJSON(SNAP_KEY, all);
}
export function getSnapshots(key) { return readJSON(SNAP_KEY, {})[key] || []; }

/* ---------- Owner-Bindung ----------
   Der lokale Cache SIND die kd:*-Töpfe selbst. Meldet sich am selben Gerät ein
   anderer Account an, gehören die dort liegenden Daten nicht ihm. Ohne diese
   Prüfung könnte eine Übernahme fremde Daten in den falschen Account schieben. */
export function getCacheOwner() { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } }
export function setCacheOwner(accountId) {
  try { if (accountId) localStorage.setItem(OWNER_KEY, String(accountId)); else localStorage.removeItem(OWNER_KEY); }
  catch { /* best effort */ }
}
/* Treiberzustand verwerfen (bei Account-Wechsel). Persönliche Töpfe bleiben
   unangetastet — über sie entscheidet ausschließlich der Übernahme-Weg. */
export function verwerfeTreiberZustand() {
  try {
    localStorage.removeItem(VER_KEY);
    localStorage.removeItem(STATUS_KEY);
    localStorage.removeItem(SNAP_KEY);
  } catch { /* best effort */ }
}

/* ---------- Treiber-Fabrik ---------- */
export function createAccountDriver({ config = {}, getAccessToken = async () => null, fetchImpl = null } = {}) {
  const basis = String(config.supabaseUrl || "").trim().replace(/\/+$/, "");
  const anon = String(config.supabasePublishableKey || "").trim();

  function konfiguriert() { return istSupabaseProjektUrl(basis) && anon.length > 0; }
  function netz() { return fetchImpl || (typeof fetch === "function" ? fetch : null); }
  function q(v) { return encodeURIComponent(v); }

  function kopf(token, { body = false, prefer = null } = {}) {
    const h = { apikey: anon, Authorization: "Bearer " + token };
    if (body) h["Content-Type"] = "application/json";
    if (prefer) h.Prefer = prefer;
    return h;
  }

  /* Ein Request. Bei 401 GENAU EIN erzwungener Erneuerungsversuch + Wiederholung. */
  async function rest(method, pfad, { body = null, prefer = null, schonErneuert = false } = {}) {
    if (!konfiguriert()) return { ok: false, status: 0, unconfigured: true };
    const token = await getAccessToken({ erzwingeErneuerung: schonErneuert });
    if (!token) return { ok: false, status: 401, keinToken: true };
    const f = netz();
    if (!f) return { ok: false, status: 0, offline: true };
    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
    let res;
    try {
      res = await f(basis + "/rest/v1" + pfad, {
        method,
        headers: kopf(token, { body: !!body, prefer }),
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
    } finally { if (timer) clearTimeout(timer); }
    let data = null;
    try { data = await res.json(); } catch { /* 204 */ }
    if (res.status === 401 && !schonErneuert) {
      return await rest(method, pfad, { body, prefer, schonErneuert: true });
    }
    return { status: res.status, ok: res.ok, data };
  }

  /* Der Server lehnt zu große Werte per CHECK ab (23514). Das ist dauerhaft:
     erneutes Senden desselben Werts kann nie gelingen. */
  function istZuGross(r) {
    if (r.status !== 400) return false;
    return /23514|kd_personal_value_max/.test(JSON.stringify(r.data || {}));
  }
  function istKeyAbgelehnt(r) {
    if (r.status !== 400) return false;
    return /kd_personal_key_erlaubt/.test(JSON.stringify(r.data || {}));
  }

  async function connectionTest() {
    if (!konfiguriert()) return { ok: false, status: 0, message: "Anmeldung in dieser Umgebung nicht eingerichtet." };
    try {
      const r = await rest("GET", `/${TABLE}?select=key&limit=1`);
      if (r.ok) return { ok: true, status: r.status };
      if (r.keinToken) return { ok: false, status: 401, message: "Nicht angemeldet." };
      return { ok: false, status: r.status, message: "HTTP " + r.status };
    } catch (e) { return { ok: false, status: 0, message: "Netzwerk: " + e }; }
  }

  /* ---------- Inventur: NUR lesen, nichts in den Cache schreiben ----------
     Grundlage des Übernahme-Wizards. Muss vor der Treiberaktivierung laufen,
     weil ein Pull den lokalen Stand überschreiben würde. */
  async function inventur() {
    try {
      const r = await rest("GET", `/${TABLE}?select=key,value,revision`);
      if (!r.ok || !Array.isArray(r.data)) {
        return { ok: false, status: r.status, zeilen: {} };
      }
      const zeilen = {};
      for (const row of r.data) { if (row && SYNC_SET.has(row.key)) zeilen[row.key] = row; }
      return { ok: true, zeilen };
    } catch (e) { return { ok: false, status: 0, error: String(e), zeilen: {} }; }
  }

  /* ---------- Pull ---------- */
  async function syncPull() {
    if (!konfiguriert()) return { ok: false, message: "nicht konfiguriert" };
    const ergebnis = { geladen: [], angelegt: [], konflikt: [], fehler: [] };
    let rows;
    try {
      const r = await rest("GET", `/${TABLE}?select=key,value,revision`);
      if (!r.ok || !Array.isArray(r.data)) {
        for (const key of ACCOUNT_SYNC_KEYS) { markStale(key, true); ergebnis.fehler.push({ key, status: r.status }); }
        setStatus({ lastPull: nowIso() });
        return { ok: false, ...ergebnis };
      }
      rows = r.data;
    } catch (e) {
      for (const key of ACCOUNT_SYNC_KEYS) markStale(key, true);
      setStatus({ lastPull: nowIso() });
      return { ok: false, geladen: [], angelegt: [], konflikt: [], fehler: ACCOUNT_SYNC_KEYS.map((key) => ({ key, error: String(e) })) };
    }

    const remote = {};
    for (const row of rows) { if (row && SYNC_SET.has(row.key)) remote[row.key] = row; }

    for (const key of ACCOUNT_SYNC_KEYS) {
      const row = remote[key];
      if (!row) { markStale(key, false); ergebnis.angelegt.push(key); continue; }
      const remoteVal = (row.value == null) ? null : String(row.value);
      const lokal = localStorage.getItem(key);
      const st = getStatus();
      const ungesynct = !!((st.pending && st.pending[key]) || (st.conflict && st.conflict[key]));
      if (lokal !== remoteVal && ungesynct && lokal != null) {
        /* Lokale, noch nicht übertragene Änderung trifft auf abweichendes Remote:
           nie stillschweigend verwerfen. Konflikt melden, revision NICHT übernehmen. */
        snapshot(key, lokal);
        markConflict(key, true); markStale(key, false);
        ergebnis.konflikt.push(key);
        continue;
      }
      if (lokal !== remoteVal) {
        /* fail-closed: ohne gesicherten Rückholpunkt wird nicht überschrieben. */
        if (lokal != null && !snapshot(key, lokal)) {
          markStale(key, true);
          ergebnis.fehler.push({ key, grund: "snapshot-fehlgeschlagen" });
          continue;
        }
        if (remoteVal == null) localStorage.removeItem(key);
        else localStorage.setItem(key, remoteVal);
      }
      setVer(key, row.revision);
      markPending(key, false); markConflict(key, false); markStale(key, false);
      ergebnis.geladen.push(key);
    }
    setStatus({ lastPull: nowIso() });
    return { ok: ergebnis.fehler.length === 0, ...ergebnis };
  }

  /* ---------- Commit (pro Schlüssel serialisiert) ---------- */
  const queues = {};
  function enqueueCommit(key) {
    const prev = queues[key] || Promise.resolve();
    const next = prev.then(() => commitKeyNow(key)).catch((e) => ({ ok: false, error: String(e) }));
    queues[key] = next;
    return next;
  }

  async function insertRow(key, value) {
    /* KEIN account_id im Body: die setzt der Server aus der Sitzung. */
    const r = await rest("POST", `/${TABLE}`, { body: { key, value }, prefer: "return=representation" });
    if ((r.status === 201 || r.status === 200) && Array.isArray(r.data) && r.data[0]) {
      setVer(key, r.data[0].revision);
      markPending(key, false); markConflict(key, false); markStale(key, false); markZuGross(key, false);
      setStatus({ lastCommit: nowIso() });
      return { ok: true, status: r.status };
    }
    if (r.status === 409) {
      snapshot(key, value);
      markConflict(key, true); markPending(key, true);
      return { ok: false, conflict: true, status: r.status };
    }
    if (istZuGross(r) || istKeyAbgelehnt(r)) {
      markZuGross(key, true); markPending(key, false);
      return { ok: false, zuGross: true, status: r.status };
    }
    markPending(key, true);
    return { ok: false, status: r.status };
  }

  async function commitKeyNow(key) {
    const value = localStorage.getItem(key);
    if (value == null) { markPending(key, false); return { ok: true, skipped: true }; }
    if (!konfiguriert()) { markPending(key, true); return { ok: false, reason: "unconfigured" }; }
    const seen = getVer(key);
    try {
      if (seen == null) return await insertRow(key, value);
      const r = await rest("PATCH", `/${TABLE}?key=eq.${q(key)}&revision=eq.${seen}`, {
        body: { value }, prefer: "return=representation",
      });
      if (r.ok && Array.isArray(r.data) && r.data.length === 1) {
        setVer(key, r.data[0].revision);
        markPending(key, false); markConflict(key, false); markStale(key, false); markZuGross(key, false);
        setStatus({ lastCommit: nowIso() });
        return { ok: true, status: r.status };
      }
      if (r.ok && Array.isArray(r.data) && r.data.length === 0) {
        // revision passte nicht ODER Zeile ist weg — unterscheiden.
        const g = await rest("GET", `/${TABLE}?key=eq.${q(key)}&select=key,value,revision`);
        if (g.ok && Array.isArray(g.data) && g.data.length === 1) {
          snapshot(key, value);
          markConflict(key, true); markPending(key, true);
          return { ok: false, conflict: true, status: 409 };
        }
        if (g.ok && Array.isArray(g.data) && g.data.length === 0) {
          setVer(key, null);
          return await insertRow(key, value);
        }
        markPending(key, true);
        return { ok: false, status: g.status };
      }
      if (istZuGross(r) || istKeyAbgelehnt(r)) {
        markZuGross(key, true); markPending(key, false);
        return { ok: false, zuGross: true, status: r.status };
      }
      markPending(key, true);
      return { ok: false, status: r.status };
    } catch (e) {
      markPending(key, true);
      return { ok: false, offline: true, error: String(e) };
    }
  }

  async function syncFlush() {
    const st = getStatus();
    const versuche = [];
    for (const key of Object.keys(st.pending || {})) {
      if (st.conflict && st.conflict[key]) continue;
      if (st.zuGross && st.zuGross[key]) continue;   // terminal, kein Wiederholen
      if (!SYNC_SET.has(key)) { markPending(key, false); continue; }
      versuche.push(await enqueueCommit(key));
    }
    return versuche;
  }

  async function resolveConflictPushLocal(key) {
    if (!SYNC_SET.has(key)) return { ok: false };
    try {
      const g = await rest("GET", `/${TABLE}?key=eq.${q(key)}&select=revision`);
      if (g.ok && Array.isArray(g.data) && g.data[0]) setVer(key, g.data[0].revision);
      else if (g.ok && Array.isArray(g.data) && g.data.length === 0) setVer(key, null);
      markConflict(key, false);
      return await enqueueCommit(key);
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  async function resolveConflictUseRemote(key) {
    if (!SYNC_SET.has(key)) return { ok: false };
    try {
      const g = await rest("GET", `/${TABLE}?key=eq.${q(key)}&select=key,value,revision`);
      if (g.ok && Array.isArray(g.data) && g.data[0]) {
        const remote = (g.data[0].value == null) ? null : String(g.data[0].value);
        const lokal = localStorage.getItem(key);
        if (lokal !== remote) {
          if (lokal != null && !snapshot(key, lokal)) return { ok: false, error: "snapshot-fehlgeschlagen" };
          if (remote == null) localStorage.removeItem(key); else localStorage.setItem(key, remote);
        }
        setVer(key, g.data[0].revision);
        markPending(key, false); markConflict(key, false); markStale(key, false);
        return { ok: true };
      }
      if (g.ok && Array.isArray(g.data) && g.data.length === 0) {
        const lokal = localStorage.getItem(key);
        if (lokal != null) snapshot(key, lokal);
        localStorage.removeItem(key);
        setVer(key, null);
        markPending(key, false); markConflict(key, false); markStale(key, false);
        return { ok: true, geloescht: true };
      }
      return { ok: false, status: g.status };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  /* ---------- Übernahme-Hilfen ----------
     Eigener Weg neben dem Alltags-Commit, weil die Übernahme WIEDERHOLBAR sein
     muss: bricht sie in der Mitte ab, darf der zweite Anlauf nicht in einen
     Konflikt laufen, nur weil die Zeile schon steht. Deshalb bei 409 den
     Serverwert lesen und bei Gleichheit die revision einfach übernehmen. */
  async function uebernehmeKey(key, value) {
    if (!SYNC_SET.has(key)) return { ok: false, uebersprungen: true };
    if (value == null) return { ok: true, uebersprungen: true };
    const r = await rest("POST", `/${TABLE}`, { body: { key, value }, prefer: "return=representation" });
    if ((r.status === 201 || r.status === 200) && Array.isArray(r.data) && r.data[0]) {
      setVer(key, r.data[0].revision);
      markPending(key, false); markConflict(key, false); markZuGross(key, false);
      return { ok: true, angelegt: true };
    }
    if (istZuGross(r) || istKeyAbgelehnt(r)) { markZuGross(key, true); return { ok: false, zuGross: true }; }
    if (r.status === 409) {
      const g = await rest("GET", `/${TABLE}?key=eq.${q(key)}&select=value,revision`);
      if (g.ok && Array.isArray(g.data) && g.data[0]) {
        if (String(g.data[0].value) === String(value)) {
          setVer(key, g.data[0].revision);
          markPending(key, false); markConflict(key, false);
          return { ok: true, bereitsGleich: true };     // idempotent
        }
        const p = await rest("PATCH", `/${TABLE}?key=eq.${q(key)}&revision=eq.${g.data[0].revision}`, {
          body: { value }, prefer: "return=representation",
        });
        if (p.ok && Array.isArray(p.data) && p.data.length === 1) {
          setVer(key, p.data[0].revision);
          markPending(key, false); markConflict(key, false);
          return { ok: true, ersetzt: true };
        }
        return { ok: false, status: p.status };
      }
      return { ok: false, status: g.status };
    }
    return { ok: false, status: r.status };
  }

  /* Rücknahme einer Übernahme: die in diesem Lauf angelegten Zeilen wieder
     entfernen. Nur hier wird remote gelöscht — nie im Alltagsbetrieb. */
  async function loescheRemote(key) {
    if (!SYNC_SET.has(key)) return { ok: false };
    const r = await rest("DELETE", `/${TABLE}?key=eq.${q(key)}`);
    if (r.ok || r.status === 204) { setVer(key, null); return { ok: true }; }
    return { ok: false, status: r.status };
  }

  function syncStatus() {
    const s = getStatus();
    return {
      lastPull: s.lastPull, lastCommit: s.lastCommit,
      pending: Object.keys(s.pending || {}),
      conflict: Object.keys(s.conflict || {}),
      stale: Object.keys(s.stale || {}),
      zuGross: Object.keys(s.zuGross || {}),
      configured: konfiguriert(),
    };
  }

  return Object.freeze({
    name: "konto",
    status: syncStatus,
    pull: syncPull,
    async get(k) { return localDriver.get(k); },
    async set(k, v) {
      const r = await localDriver.set(k, v);        // 1) sofort lokal sichern
      if (SYNC_SET.has(k)) { markPending(k, true); enqueueCommit(k); }
      return r;
    },
    async delete(k) { return localDriver.delete(k); },   // remote bleibt unberührt
    async list(prefix = "") { return localDriver.list(prefix); },
    // erweiterte Fläche für Konto-UI und Übernahme
    connectionTest, inventur, syncFlush, uebernehmeKey, loescheRemote,
    resolveConflictPushLocal, resolveConflictUseRemote, getSnapshots,
  });
}
