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
import { PERSONAL_DATA_KEYS } from "./personalDataRegistry.js";
import {
  ACCT_KEYS, ACCOUNT_CACHE_METADATA_WITHOUT_OWNER,
} from "./accountStorageKeys.js";
import { purgeExpiredLocalData } from "./localRetention.js";

const TABLE = "kd_personal";

/* Rückwärtskompatibler Exportname für bestehende Services und Tests. Die
   Wahrheit liegt im PersonalDataRegistry, das auch Backup, Restore und
   Übernahme speist. */
export const ACCOUNT_SYNC_KEYS = PERSONAL_DATA_KEYS;
const SYNC_SET = new Set(ACCOUNT_SYNC_KEYS);

/* Gerätezustand des Treibers — nie gesynct, nie im Backup, NIE Tokens.
   Eigener Namespace kd:acct:* (die Sitzung selbst liegt getrennt in kd:auth:session). */
const VER_KEY = ACCT_KEYS.ver;        // { key: revision } — zuletzt gesehene Server-Version
const STATUS_KEY = ACCT_KEYS.status;  // { lastPull, lastCommit, pending, conflict, stale, zuGross, schemaVeraltet }
const SNAP_KEY = ACCT_KEYS.snap;      // { key: [{t, value}] } — rollierend
const OWNER_KEY = ACCT_KEYS.owner;    // Account-ID, zu der der lokale Cache gehört
const SNAP_MAX = 5;
export { ACCT_KEYS };

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function writeJSON(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; }
}
function nowIso() { try { return new Date().toISOString(); } catch { return String(Date.now()); } }

/* ---------- Status ---------- */
function leerStatus() { return { lastPull: null, lastCommit: null, pending: {}, conflict: {}, stale: {}, zuGross: {}, schemaVeraltet: {} }; }
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
const markSchemaVeraltet = (k, an) => mark("schemaVeraltet", k, an);

function getVer(key) { const v = readJSON(VER_KEY, {})[key]; return (typeof v === "number") ? v : null; }
function setVer(key, revision) {
  const m = readJSON(VER_KEY, {});
  if (revision == null) delete m[key]; else m[key] = revision;
  writeJSON(VER_KEY, m);
}

function snapshot(key, value) {
  purgeExpiredLocalData();
  if (value == null) return true;
  const all = readJSON(SNAP_KEY, {});
  const list = all[key] || [];
  list.push({ t: nowIso(), value });
  while (list.length > SNAP_MAX) list.shift();
  all[key] = list;
  return writeJSON(SNAP_KEY, all);
}
export function getSnapshots(key) {
  purgeExpiredLocalData();
  return readJSON(SNAP_KEY, {})[key] || [];
}

/* ---------- Owner-Bindung ----------
   Der lokale Cache SIND die kd:*-Töpfe selbst. Meldet sich am selben Gerät ein
   anderer Account an, gehören die dort liegenden Daten nicht ihm. Ohne diese
   Prüfung könnte eine Übernahme fremde Daten in den falschen Account schieben. */
export function getCacheOwner() { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } }
export function setCacheOwner(accountId) {
  const erwartet = accountId ? String(accountId) : null;
  try {
    if (erwartet) localStorage.setItem(OWNER_KEY, erwartet); else localStorage.removeItem(OWNER_KEY);
    return localStorage.getItem(OWNER_KEY) === erwartet;
  }
  catch { return false; }
}
/* Treiberzustand verwerfen (bei Account-Wechsel). Persönliche Töpfe bleiben
   unangetastet — über sie entscheidet ausschließlich der Übernahme-Weg. */
export function verwerfeTreiberZustand({ behalteTransition = false } = {}) {
  const keys = behalteTransition
    ? ACCOUNT_CACHE_METADATA_WITHOUT_OWNER.filter((key) => key !== ACCT_KEYS.transition)
    : ACCOUNT_CACHE_METADATA_WITHOUT_OWNER;
  let ok = true;
  for (const key of keys) {
    try { localStorage.removeItem(key); }
    catch { ok = false; }
  }
  for (const key of keys) {
    try { if (localStorage.getItem(key) != null) ok = false; }
    catch { ok = false; }
  }
  return ok;
}

/* Upgrade-Aufräumung für den früher möglichen Zustand „Snapshot ohne Owner“.
   Persönliche Haupttöpfe werden dabei ausdrücklich nicht angefasst. */
export function bereinigeVerwaisteTreiberMetadaten() {
  if (getCacheOwner()) return true;
  return verwerfeTreiberZustand();
}

/* ---------- Treiber-Fabrik ---------- */
export function createAccountDriver({
  config = {},
  getAccessToken = async () => null,
  fetchImpl = null,
  isActive = () => true,
  owner = "account:unknown",
} = {}) {
  const basis = String(config.supabaseUrl || "").trim().replace(/\/+$/, "");
  const anon = String(config.supabasePublishableKey || "").trim();

  function konfiguriert() { return istSupabaseProjektUrl(basis) && anon.length > 0; }
  function netz() { return fetchImpl || (typeof fetch === "function" ? fetch : null); }
  function q(v) { return encodeURIComponent(v); }
  function aktiv() {
    try { return isActive() !== false; } catch { return false; }
  }
  function inaktiv() { return { ok: false, status: 0, inactive: true, cancelled: true }; }
  function fordereAktiv() {
    if (aktiv()) return;
    const error = new Error("Der gebundene Kontokontext ist nicht mehr aktiv.");
    error.code = "ACCOUNT_CONTEXT_CHANGED";
    throw error;
  }

  function kopf(token, { body = false, prefer = null } = {}) {
    const h = { apikey: anon, Authorization: "Bearer " + token };
    if (body) h["Content-Type"] = "application/json";
    if (prefer) h.Prefer = prefer;
    return h;
  }

  /* Ein Request. Bei 401 GENAU EIN erzwungener Erneuerungsversuch + Wiederholung. */
  async function rest(method, pfad, { body = null, prefer = null, schonErneuert = false } = {}) {
    if (!aktiv()) return inaktiv();
    if (!konfiguriert()) return { ok: false, status: 0, unconfigured: true };
    const token = await getAccessToken({ erzwingeErneuerung: schonErneuert });
    if (!aktiv()) return inaktiv();
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
    if (!aktiv()) return inaktiv();
    let data = null;
    try { data = await res.json(); } catch { /* 204 */ }
    if (!aktiv()) return inaktiv();
    if (res.status === 401 && !schonErneuert) {
      return await rest(method, pfad, { body, prefer, schonErneuert: true });
    }
    return { status: res.status, ok: res.ok, data };
  }

  /* Der Server lehnt zu große Werte per CHECK ab (23514). Das ist dauerhaft:
     erneutes Senden desselben Werts kann nie gelingen. Beide CHECKs melden
     denselben SQL-Code — deshalb wird an den Aufrufstellen ZUERST auf den
     Key-Constraint geprüft, sonst würde ein unbekannter Datentopf fälschlich
     als „zu groß" diagnostiziert (Audit Probe f). */
  function istZuGross(r) {
    if (r.status !== 400) return false;
    return /23514|kd_personal_value_max/.test(JSON.stringify(r.data || {}));
  }
  /* Unbekannter Datentopf (kd_personal_key_erlaubt): die DB kennt den Key
     noch nicht — typisch eine fehlende Migration. Ebenfalls terminal, aber
     eine ANDERE Diagnose als „zu groß": aufräumen hilft hier nicht. */
  function istKeyAbgelehnt(r) {
    if (r.status !== 400) return false;
    return /kd_personal_key_erlaubt/.test(JSON.stringify(r.data || {}));
  }

  async function connectionTest() {
    if (!konfiguriert()) return { ok: false, status: 0, message: "Anmeldung in dieser Umgebung nicht eingerichtet." };
    try {
      const r = await rest("GET", `/${TABLE}?select=key&limit=1`);
      if (r.inactive) return r;
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
      if (r.inactive) return { ...r, zeilen: {} };
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
    if (!aktiv()) return { ...inaktiv(), geladen: [], angelegt: [], konflikt: [], fehler: [] };
    if (!konfiguriert()) return { ok: false, message: "nicht konfiguriert" };
    const ergebnis = { geladen: [], angelegt: [], konflikt: [], fehler: [] };
    let rows;
    try {
      const r = await rest("GET", `/${TABLE}?select=key,value,revision`);
      if (r.inactive) return { ...r, geladen: [], angelegt: [], konflikt: [], fehler: [] };
      if (!r.ok || !Array.isArray(r.data)) {
        if (!aktiv()) return { ...inaktiv(), geladen: [], angelegt: [], konflikt: [], fehler: [] };
        for (const key of ACCOUNT_SYNC_KEYS) { markStale(key, true); ergebnis.fehler.push({ key, status: r.status }); }
        setStatus({ lastPull: nowIso() });
        return { ok: false, ...ergebnis };
      }
      rows = r.data;
    } catch (e) {
      if (!aktiv()) return { ...inaktiv(), geladen: [], angelegt: [], konflikt: [], fehler: [] };
      for (const key of ACCOUNT_SYNC_KEYS) markStale(key, true);
      setStatus({ lastPull: nowIso() });
      return { ok: false, geladen: [], angelegt: [], konflikt: [], fehler: ACCOUNT_SYNC_KEYS.map((key) => ({ key, error: String(e) })) };
    }

    const remote = {};
    for (const row of rows) { if (row && SYNC_SET.has(row.key)) remote[row.key] = row; }

    for (const key of ACCOUNT_SYNC_KEYS) {
      if (!aktiv()) return { ...inaktiv(), ...ergebnis };
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
        if (!aktiv()) return { ...inaktiv(), ...ergebnis };
        if (remoteVal == null) localStorage.removeItem(key);
        else localStorage.setItem(key, remoteVal);
      }
      if (!aktiv()) return { ...inaktiv(), ...ergebnis };
      setVer(key, row.revision);
      markPending(key, false); markConflict(key, false); markStale(key, false);
      ergebnis.geladen.push(key);
    }
    if (!aktiv()) return { ...inaktiv(), ...ergebnis };
    setStatus({ lastPull: nowIso() });
    return { ok: ergebnis.fehler.length === 0, ...ergebnis };
  }

  /* ---------- Commit (pro Schlüssel serialisiert) ---------- */
  const queues = {};
  function enqueueCommit(key, capturedValue = localStorage.getItem(key)) {
    if (!aktiv()) return Promise.resolve(inaktiv());
    const prev = queues[key] || Promise.resolve();
    /* Der Wert gehört zu dem Auftrag, der ihn erzeugt hat. Würde er erst beim
       späteren Abarbeiten aus localStorage gelesen, könnte nach einem
       Kontowechsel bereits der Bestand des nächsten Kontos darin stehen. */
    const next = prev
      .then(() => (aktiv() ? commitKeyNow(key, capturedValue) : inaktiv()))
      .catch((e) => ({ ok: false, error: String(e) }));
    queues[key] = next;
    return next;
  }

  async function insertRow(key, value) {
    /* KEIN account_id im Body: die setzt der Server aus der Sitzung. */
    const r = await rest("POST", `/${TABLE}`, { body: { key, value }, prefer: "return=representation" });
    if (r.inactive) return r;
    if ((r.status === 201 || r.status === 200) && Array.isArray(r.data) && r.data[0]) {
      setVer(key, r.data[0].revision);
      markPending(key, false); markConflict(key, false); markStale(key, false); markZuGross(key, false); markSchemaVeraltet(key, false);
      setStatus({ lastCommit: nowIso() });
      return { ok: true, status: r.status };
    }
    if (r.status === 409) {
      snapshot(key, value);
      markConflict(key, true); markPending(key, true);
      return { ok: false, conflict: true, status: r.status };
    }
    if (istKeyAbgelehnt(r)) {
      markSchemaVeraltet(key, true); markPending(key, false);
      return { ok: false, schemaVeraltet: true, status: r.status };
    }
    if (istZuGross(r)) {
      markZuGross(key, true); markPending(key, false);
      return { ok: false, zuGross: true, status: r.status };
    }
    markPending(key, true);
    return { ok: false, status: r.status };
  }

  async function commitKeyNow(key, capturedValue = localStorage.getItem(key)) {
    if (!aktiv()) return inaktiv();
    const value = capturedValue;
    if (value == null) { markPending(key, false); return { ok: true, skipped: true }; }
    if (!konfiguriert()) { markPending(key, true); return { ok: false, reason: "unconfigured" }; }
    const seen = getVer(key);
    try {
      if (seen == null) return await insertRow(key, value);
      const r = await rest("PATCH", `/${TABLE}?key=eq.${q(key)}&revision=eq.${seen}`, {
        body: { value }, prefer: "return=representation",
      });
      if (r.inactive) return r;
      if (r.ok && Array.isArray(r.data) && r.data.length === 1) {
        setVer(key, r.data[0].revision);
        markPending(key, false); markConflict(key, false); markStale(key, false); markZuGross(key, false); markSchemaVeraltet(key, false);
        setStatus({ lastCommit: nowIso() });
        return { ok: true, status: r.status };
      }
      if (r.ok && Array.isArray(r.data) && r.data.length === 0) {
        // revision passte nicht ODER Zeile ist weg — unterscheiden.
        const g = await rest("GET", `/${TABLE}?key=eq.${q(key)}&select=key,value,revision`);
        if (g.inactive) return g;
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
      if (istKeyAbgelehnt(r)) {
        markSchemaVeraltet(key, true); markPending(key, false);
        return { ok: false, schemaVeraltet: true, status: r.status };
      }
      if (istZuGross(r)) {
        markZuGross(key, true); markPending(key, false);
        return { ok: false, zuGross: true, status: r.status };
      }
      markPending(key, true);
      return { ok: false, status: r.status };
    } catch (e) {
      if (!aktiv()) return inaktiv();
      markPending(key, true);
      return { ok: false, offline: true, error: String(e) };
    }
  }

  async function syncFlush() {
    if (!aktiv()) return [inaktiv()];
    /* Erst bereits laufende, von set() angestoßene Aufträge abwarten. Ohne
       diese Barriere konnte ein Restore „fertig“ melden, während seine ersten
       Konto-Commits noch unterwegs waren. */
    const laufend = Object.values(queues);
    if (laufend.length) await Promise.allSettled(laufend);
    if (!aktiv()) return [inaktiv()];
    const st = getStatus();
    const versuche = [];
    for (const key of Object.keys(st.pending || {})) {
      if (st.conflict && st.conflict[key]) continue;
      if (st.zuGross && st.zuGross[key]) continue;   // terminal, kein Wiederholen
      if (st.schemaVeraltet && st.schemaVeraltet[key]) continue; // terminal bis zur Migration
      if (!SYNC_SET.has(key)) { markPending(key, false); continue; }
      versuche.push(await enqueueCommit(key));
    }
    const nachlauf = Object.values(queues);
    if (nachlauf.length) await Promise.allSettled(nachlauf);
    if (!aktiv()) return [inaktiv()];
    return versuche;
  }

  async function resolveConflictPushLocal(key) {
    if (!SYNC_SET.has(key) || !aktiv()) return inaktiv();
    try {
      const g = await rest("GET", `/${TABLE}?key=eq.${q(key)}&select=revision`);
      if (g.inactive) return g;
      if (g.ok && Array.isArray(g.data) && g.data[0]) setVer(key, g.data[0].revision);
      else if (g.ok && Array.isArray(g.data) && g.data.length === 0) setVer(key, null);
      markConflict(key, false);
      return await enqueueCommit(key);
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  async function resolveConflictUseRemote(key) {
    if (!SYNC_SET.has(key) || !aktiv()) return inaktiv();
    try {
      const g = await rest("GET", `/${TABLE}?key=eq.${q(key)}&select=key,value,revision`);
      if (g.inactive) return g;
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
    if (!aktiv()) return inaktiv();
    if (value == null) return { ok: true, uebersprungen: true };
    const r = await rest("POST", `/${TABLE}`, { body: { key, value }, prefer: "return=representation" });
    if (r.inactive) return r;
    if ((r.status === 201 || r.status === 200) && Array.isArray(r.data) && r.data[0]) {
      setVer(key, r.data[0].revision);
      markPending(key, false); markConflict(key, false); markZuGross(key, false); markSchemaVeraltet(key, false);
      return { ok: true, angelegt: true };
    }
    if (istKeyAbgelehnt(r)) { markSchemaVeraltet(key, true); return { ok: false, schemaVeraltet: true }; }
    if (istZuGross(r)) { markZuGross(key, true); return { ok: false, zuGross: true }; }
    if (r.status === 409) {
      const g = await rest("GET", `/${TABLE}?key=eq.${q(key)}&select=value,revision`);
      if (g.inactive) return g;
      if (g.ok && Array.isArray(g.data) && g.data[0]) {
        if (String(g.data[0].value) === String(value)) {
          setVer(key, g.data[0].revision);
          markPending(key, false); markConflict(key, false);
          return { ok: true, bereitsGleich: true };     // idempotent
        }
        const p = await rest("PATCH", `/${TABLE}?key=eq.${q(key)}&revision=eq.${g.data[0].revision}`, {
          body: { value }, prefer: "return=representation",
        });
        if (p.inactive) return p;
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
    if (!SYNC_SET.has(key) || !aktiv()) return inaktiv();
    const r = await rest("DELETE", `/${TABLE}?key=eq.${q(key)}`);
    if (r.inactive) return r;
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
      schemaVeraltet: Object.keys(s.schemaVeraltet || {}),
      configured: konfiguriert(),
    };
  }

  return Object.freeze({
    name: "konto",
    owner,
    status: syncStatus,
    pull: syncPull,
    async get(k) {
      fordereAktiv();
      const r = await localDriver.get(k);
      fordereAktiv();
      return r;
    },
    async set(k, v) {
      fordereAktiv();
      /* localDriver.set() schreibt synchron in localStorage und liefert erst
         danach sein Promise. Wert und Pending müssen deshalb noch im selben
         Call-Stack gekoppelt werden: Ein Kontowechsel im folgenden Microtask
         darf weder ein unmarkiertes A-Edit hinterlassen noch später A-Pending
         in Bs bereits neu gebundenen Metadatenraum schreiben. */
      const lokal = localDriver.set(k, v);
      if (SYNC_SET.has(k)) markPending(k, true);
      const r = await lokal;
      fordereAktiv();
      if (SYNC_SET.has(k)) enqueueCommit(k, String(v));
      return r;
    },
    async delete(k) {
      fordereAktiv();
      const r = await localDriver.delete(k);        // remote bleibt unberührt
      fordereAktiv();
      return r;
    },
    async list(prefix = "") {
      fordereAktiv();
      const r = await localDriver.list(prefix);
      fordereAktiv();
      return r;
    },
    // erweiterte Fläche für Konto-UI und Übernahme
    connectionTest, inventur, syncFlush, uebernehmeKey, loescheRemote,
    resolveConflictPushLocal, resolveConflictUseRemote, getSnapshots,
  });
}
