/* Supabase-Treiber-Test (Node, gemocktes fetch + localStorage-Stub).
   Modelliert PostgREST inkl. RLS-Schlüsselprüfung (Header x-kd-key) und
   rev-Trigger (server-monoton). Deckt die riskanten Pfade ab: Insert/Update mit
   rev, Pull+Snapshot, fehlende Zeile, rev-Mismatch-Konflikt, Offline, delete-ohne-
   Remote, non-sync-Key, Schlüssel-vs-kein-Schlüssel, Konfliktauflösung, stale.
   Aufruf: node supabasedriver_test.mjs */

/* ---------- localStorage-Stub ---------- */
const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => void _ls.set(k, String(v)),
  removeItem: (k) => void _ls.delete(k),
  clear: () => _ls.clear(),
};

/* ---------- PostgREST-Mock ---------- */
const MOCK_URL = "https://test.supabase.co";
const MOCK_OWNER = "max";
const MOCK_KEY = "THEKEY-123";
let fetchCalls = [];
let table = new Map();        // "owner|key" -> {owner,key,value,scope,rev}
let forceOffline = false;
let failNextGet = false;      // nächster GET scheitert mit 500 (Pull-Fehler)

function resp(status, data) {
  return Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(data) });
}
function seed(owner, key, value, scope = "user", rev = 1) { table.set(owner + "|" + key, { owner, key, value, scope, rev }); }

globalThis.fetch = (url, opts = {}) => {
  const method = opts.method || "GET";
  const body = opts.body ? JSON.parse(opts.body) : null;
  const headers = opts.headers || {};
  const keyOk = headers["x-kd-key"] === MOCK_KEY;
  fetchCalls.push({ url, method, body, keyHdr: headers["x-kd-key"] || null });
  if (forceOffline) return Promise.reject(new TypeError("Load failed"));
  const u = new URL(url);
  if (!u.pathname.endsWith("/kd_store")) return resp(404, { message: "no table" });
  const P = u.searchParams;
  const filt = (n) => { const v = P.get(n); return v == null ? null : v.replace(/^eq\./, ""); };
  const fOwner = filt("owner"), fKey = filt("key"), fScope = filt("scope"), fRev = filt("rev");
  const match = (r) => (!fOwner || r.owner === fOwner) && (!fKey || r.key === fKey) && (!fScope || r.scope === fScope);
  const visible = (r) => (r.scope !== "user" ? true : keyOk);   // RLS: user-Zeilen nur mit Schlüssel

  if (method === "GET") {
    if (failNextGet) { failNextGet = false; return resp(500, { message: "kaputt (Test)" }); }
    const rows = [...table.values()].filter(match).filter(visible)
      .filter((r) => fRev == null || String(r.rev) === String(fRev));
    return resp(200, rows.map((r) => ({ key: r.key, value: r.value, rev: r.rev, owner: r.owner, scope: r.scope })));
  }
  if (method === "POST") {
    if (!keyOk) return resp(401, { message: "RLS insert verweigert" });
    const ins = Array.isArray(body) ? body[0] : body;
    const id = ins.owner + "|" + ins.key;
    if (table.has(id)) return resp(409, { message: "duplicate key value", code: "23505" });
    const row = { owner: ins.owner, key: ins.key, value: ins.value, scope: ins.scope || "user", rev: 1 }; // Trigger: rev=1
    table.set(id, row);
    return resp(201, [{ ...row }]);
  }
  if (method === "PATCH") {
    const rows = [...table.values()].filter(match).filter(visible)
      .filter((r) => fRev == null || String(r.rev) === String(fRev));
    if (rows.length === 0) return resp(200, []);       // RLS/rev-Mismatch: 0 Zeilen
    const r = rows[0];
    if (body && typeof body.value !== "undefined") r.value = body.value; // Trigger ignoriert client-rev
    r.rev = r.rev + 1;
    return resp(200, [{ ...r }]);
  }
  if (method === "DELETE") return resp(200, []);
  return resp(400, { message: "unhandled" });
};

/* ---------- Import NACH Stub-Setup ---------- */
const S = await import("./src/lib/supabaseDriver.js");
const G = await import("./src/lib/gitDriver.js");

/* ---------- Harness ---------- */
const checks = [];
const check = (n, p) => { checks.push([n, p]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function reset() {
  _ls.clear(); fetchCalls = []; table = new Map(); forceOffline = false; failNextGet = false;
  S.setSupabaseConfig({ url: MOCK_URL, anon: "sb_publishable_dummy", key: MOCK_KEY, owner: MOCK_OWNER });
}

/* 1) Konfiguration */
reset();
check("isSupabaseConfigured true bei url+anon+owner+key", S.isSupabaseConfigured() === true);
S.setSupabaseConfig({ key: "" });
check("ohne Sync-Schlüssel: NICHT konfiguriert (Schreiben gesperrt)", S.isSupabaseConfigured() === false);
reset();
const ct = await S.connectionTest();
check("connectionTest ok bei erreichbarem Projekt", ct.ok === true);

/* 2) set(sync-Key): sofort lokal + Insert legt Zeile an (rev=1), kein Pending */
reset();
await S.supabaseDriver.set("kd:master", '{"filme":[1,2]}');
check("set schreibt sofort lokal", localStorage.getItem("kd:master") === '{"filme":[1,2]}');
await sleep(20);
const post1 = fetchCalls.find((c) => c.method === "POST");
check("POST gegen kd_store ausgelöst", !!post1 && /\/kd_store$/.test(new URL(post1.url).pathname));
check("Zeile im (Fake-)DB angelegt", table.get("max|kd:master")?.value === '{"filme":[1,2]}');
check("kein Pending mehr nach Erfolg", S.syncStatus().pending.length === 0);

/* 3) zweites set(): PATCH mit rev -> rev inkrementiert, Wert aktualisiert */
reset();
await S.supabaseDriver.set("kd:master", '{"v":1}');
await sleep(20);
fetchCalls = [];
await S.supabaseDriver.set("kd:master", '{"v":2}');
await sleep(20);
const patch2 = fetchCalls.find((c) => c.method === "PATCH");
check("zweiter Schreibzugriff ist PATCH mit rev-Filter", !!patch2 && /rev=eq\.1/.test(patch2.url));
check("DB-Inhalt aktualisiert", table.get("max|kd:master").value === '{"v":2}');
check("DB-rev inkrementiert (1->2)", table.get("max|kd:master").rev === 2);
check("kein Pending nach Update", S.syncStatus().pending.length === 0);

/* 4) Pull: Remote neuer -> lokal überschrieben + Snapshot des alten Stands */
reset();
localStorage.setItem("kd:vokabular", '["alt"]');
seed(MOCK_OWNER, "kd:vokabular", '["neu"]', "user", 7);
const pull = await S.syncPull();
check("Pull: lokal = Remote nach Übernahme", localStorage.getItem("kd:vokabular") === '["neu"]');
const snaps = S.getSnapshots("kd:vokabular");
check("Pull: Snapshot des alten Stands", snaps.length === 1 && snaps[0].value === '["alt"]');
check("Pull meldet geladen", pull.geladen.includes("kd:vokabular"));

/* 5) Pull: Zeile fehlt remote -> lokal bleibt, kein Snapshot, als 'anzulegen' gemeldet */
reset();
localStorage.setItem("kd:artikel", '{"artikel":["mein"]}');
const pullFehlt = await S.syncPull();
check("Pull fehlend: lokaler Stand unangetastet", localStorage.getItem("kd:artikel") === '{"artikel":["mein"]}');
check("Pull fehlend: als 'anzulegen' gemeldet", pullFehlt.angelegt.includes("kd:artikel"));
check("Pull fehlend: kein Snapshot", S.getSnapshots("kd:artikel").length === 0);

/* 6) rev-Mismatch beim Commit: NIE blind überschreiben, Konflikt + lokal intakt */
reset();
await S.supabaseDriver.set("kd:master", '{"stand":"A"}');   // legt an, ver=1
await sleep(20);
table.get("max|kd:master").rev = 9;                          // Fremdänderung: DB-rev springt weg
table.get("max|kd:master").value = '{"stand":"fremd"}';
fetchCalls = [];
await S.supabaseDriver.set("kd:master", '{"stand":"lokal-neu"}'); // ver noch 1 -> PATCH rev=eq.1 => 0 Zeilen
await sleep(20);
check("Mismatch: lokaler Stand NICHT verloren", localStorage.getItem("kd:master") === '{"stand":"lokal-neu"}');
check("Mismatch: Remote NICHT überschrieben", table.get("max|kd:master").value === '{"stand":"fremd"}');
check("Mismatch: Konflikt markiert", S.syncStatus().conflict.includes("kd:master"));
check("Mismatch: Snapshot des lokalen Stands", S.getSnapshots("kd:master").some((s) => s.value === '{"stand":"lokal-neu"}'));

/* 7) Offline beim set: Pending, lokal intakt; online -> Flush committet nach */
reset();
forceOffline = true;
await S.supabaseDriver.set("kd:merkliste", '[{"id":1}]');
await sleep(20);
check("Offline: lokal gespeichert", localStorage.getItem("kd:merkliste") === '[{"id":1}]');
check("Offline: als nicht synchronisiert markiert", S.syncStatus().pending.includes("kd:merkliste"));
forceOffline = false;
const fl = await S.syncFlush();
check("Flush committet ausstehende Änderung nach", fl.some((r) => r.ok) && !!table.get("max|kd:merkliste"));
check("Flush: Pending danach leer", S.syncStatus().pending.length === 0);

/* 8) delete(sync-Key): nur lokal, NIE remote löschen */
reset();
localStorage.setItem("kd:master", "x");
seed(MOCK_OWNER, "kd:master", "x", "user", 1);
fetchCalls = [];
await S.supabaseDriver.delete("kd:master");
await sleep(20);
check("delete: lokaler Cache entfernt", localStorage.getItem("kd:master") === null);
check("delete: KEIN DELETE/PATCH/POST an Remote", !fetchCalls.some((c) => ["DELETE", "PATCH", "POST"].includes(c.method)));
check("delete: Remote-Zeile noch da", !!table.get("max|kd:master"));

/* 9) non-sync-Key: set berührt das Netz nicht */
reset();
fetchCalls = [];
await S.supabaseDriver.set("kd:start", "clean");
await sleep(20);
check("non-sync: lokal gesetzt", localStorage.getItem("kd:start") === "clean");
check("non-sync: kein Netz-Call", fetchCalls.length === 0);

/* 10) Sync-Schlüssel taucht in KEINER Zeile auf (nur im Header) */
reset();
await S.supabaseDriver.set("kd:autor-name", "Max");
await sleep(20);
const alleWerte = [...table.values()].map((r) => r.value).join("|");
const alleBodies = fetchCalls.map((c) => JSON.stringify(c.body || "")).join("|");
check("Secret: Sync-Schlüssel in keiner Zeile", !alleWerte.includes(MOCK_KEY));
check("Secret: Sync-Schlüssel in keinem Request-Body", !alleBodies.includes(MOCK_KEY));
check("Secret: Sync-Schlüssel steckt im Header", fetchCalls.some((c) => c.keyHdr === MOCK_KEY));

/* 11) Schlüssel-vs-kein-Schlüssel: ohne Schlüssel sauber gemeldet, kein stiller Erfolg */
reset();
S.setSupabaseConfig({ key: "" });                 // Schlüssel entfernt
fetchCalls = [];
await S.supabaseDriver.set("kd:master", '{"x":1}');
await sleep(20);
check("ohne Schlüssel: lokal gespeichert (Cache)", localStorage.getItem("kd:master") === '{"x":1}');
check("ohne Schlüssel: als pending gemeldet (kein stiller Erfolg)", S.syncStatus().pending.includes("kd:master"));
check("ohne Schlüssel: KEIN Schreib-Request abgesetzt", !fetchCalls.some((c) => ["POST", "PATCH"].includes(c.method)));

/* 12) Race: zwei schnelle set() auf denselben Key -> kein Selbst-Konflikt, Remote = neuester */
reset();
const p1 = S.supabaseDriver.set("kd:master", '{"v":1}');
const p2 = S.supabaseDriver.set("kd:master", '{"v":2}');
await Promise.all([p1, p2]);
await sleep(60);
check("Race: kein Konflikt-Flag", S.syncStatus().conflict.length === 0);
check("Race: nichts bleibt pending", S.syncStatus().pending.length === 0);
check("Race: Remote trägt den NEUESTEN Wert", table.get("max|kd:master").value === '{"v":2}');

/* 13) Pull-Schutz: Offline-Edit + fremder Push -> Konflikt statt Datenverlust */
reset();
seed(MOCK_OWNER, "kd:master", '{"remote":"start"}', "user", 1);
await S.syncPull();                                // lokal=remote, ver=1
forceOffline = true;
await S.supabaseDriver.set("kd:master", '{"offline":"edit"}'); // Commit scheitert -> pending
await sleep(20);
forceOffline = false;
table.get("max|kd:master").value = '{"anderes":"geraet"}';     // Fremdänderung
table.get("max|kd:master").rev = 5;
const pullK = await S.syncPull();
check("Pull-Schutz: lokaler Offline-Stand NICHT überschrieben", localStorage.getItem("kd:master") === '{"offline":"edit"}');
check("Pull-Schutz: als Konflikt gemeldet", pullK.konflikt.includes("kd:master") && S.syncStatus().conflict.includes("kd:master"));
check("Pull-Schutz: Snapshot des lokalen Stands", S.getSnapshots("kd:master").some((s) => s.value === '{"offline":"edit"}'));

/* 14) Pull-Fehler wird stale, NICHT pending — Flush pusht dann nichts */
reset();
localStorage.setItem("kd:vokabular", '["lokal"]');
failNextGet = true;
await S.syncPull();
check("Pull-Fehler: lokal unangetastet", localStorage.getItem("kd:vokabular") === '["lokal"]');
check("Pull-Fehler: als stale geführt", S.syncStatus().stale.includes("kd:vokabular"));
check("Pull-Fehler: NICHT pending", !S.syncStatus().pending.includes("kd:vokabular"));
fetchCalls = [];
await S.syncFlush();
check("Pull-Fehler: Flush macht KEINEN Schreib-Request", !fetchCalls.some((c) => ["POST", "PATCH"].includes(c.method)));
seed(MOCK_OWNER, "kd:vokabular", '["remote"]', "user", 1);
await S.syncPull();
check("Pull-Erfolg danach: stale abgeräumt", !S.syncStatus().stale.includes("kd:vokabular"));

/* 15) Konfliktdatei: Flush überspringt sie; bewusste Auflösung push-local / use-remote */
reset();
await S.supabaseDriver.set("kd:master", '{"lokal":true}');  // ver=1
await sleep(20);
table.get("max|kd:master").rev = 9; table.get("max|kd:master").value = '{"remote":true}';
await S.supabaseDriver.set("kd:master", '{"lokal":"neu"}'); // -> Konflikt
await sleep(20);
check("Konflikt vorhanden (Ausgangslage)", S.syncStatus().conflict.includes("kd:master"));
fetchCalls = [];
await S.syncFlush();
check("Flush überspringt Konfliktschlüssel (kein Schreiben)", !fetchCalls.some((c) => ["POST", "PATCH"].includes(c.method)));
const rlokal = await S.resolveConflictPushLocal("kd:master");
check("Bewusst pushen: ok + Remote trägt lokalen Stand", rlokal.ok === true && table.get("max|kd:master").value === '{"lokal":"neu"}');
check("Bewusst pushen: Flags geräumt", S.syncStatus().conflict.length === 0 && S.syncStatus().pending.length === 0);
// use-remote
reset();
await S.supabaseDriver.set("kd:artikel", '{"lokal":"a"}');
await sleep(20);
table.get("max|kd:artikel").rev = 9; table.get("max|kd:artikel").value = '{"remote":"b"}';
await S.supabaseDriver.set("kd:artikel", '{"lokal":"a2"}');
await sleep(20);
const rRemote = await S.resolveConflictUseRemote("kd:artikel");
check("Remote übernehmen: ok + lokal = Remote", rRemote.ok === true && localStorage.getItem("kd:artikel") === '{"remote":"b"}');
check("Remote übernehmen: lokaler Stand als Snapshot", S.getSnapshots("kd:artikel").some((s) => s.value === '{"lokal":"a2"}'));
check("Remote übernehmen: Konflikt geräumt", S.syncStatus().conflict.length === 0);

/* 16) 11 Sync-Schlüssel — deckungsgleich mit der Git-SYNC_MAP */
reset();
const gitKeys = Object.keys(G.SYNC_MAP).sort();
const sbKeys = [...S.SYNC_KEYS].sort();
check("SYNC_KEYS: genau 11", S.SYNC_KEYS.length === 11);
check("SYNC_KEYS deckungsgleich mit Git-SYNC_MAP", JSON.stringify(gitKeys) === JSON.stringify(sbKeys));
check("SYNC_KEYS enthält kd:mustwatch (10. Datei)", S.SYNC_KEYS.includes("kd:mustwatch"));
check("SYNC_KEYS enthält kd:achievements (11. Artefakt)", S.SYNC_KEYS.includes("kd:achievements"));

/* 17) syncStatus-Form (inkl. stale) exakt wie der Git-Treiber */
reset();
const st = S.syncStatus();
check("syncStatus: alle Felder inkl. stale/configured",
  ["lastPull", "lastCommit", "pending", "conflict", "stale", "configured"].every((k) => k in st) &&
  Array.isArray(st.pending) && Array.isArray(st.stale));

/* 18) Demo-Blobs per anon-Read (Phase 5): nur scope=demo, OHNE Sync-Schlüssel */
reset();
seed("demo", "kd:master", '{"meta":{"erstellt_am":"2026-07-01"},"filme":[{"id":"d1","titel":"Demo-Film"}]}', "demo");
seed("demo", "kd:artikel", '{"artikel":[{"id":"da1"}]}', "demo");
seed("max", "kd:master", '{"geheim":true}', "user");
fetchCalls = [];
const demo = await S.ladeDemoBlobs();
check("Demo-Read: liefert Demo-Master", !!demo["kd:master"] && JSON.parse(demo["kd:master"]).filme[0].titel === "Demo-Film");
check("Demo-Read: liefert weitere Demo-Blobs", !!demo["kd:artikel"]);
check("Demo-Read: KEINE User-Zeile enthalten", demo["kd:master"].indexOf("geheim") === -1);
check("Demo-Read: sendet KEINEN x-kd-key (reiner anon-Read)", fetchCalls.length > 0 && fetchCalls.every((c) => c.keyHdr == null));

/* ---------- Auswertung ---------- */
let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(`\n${checks.filter(([, p]) => p).length}/${checks.length} Checks bestanden.`);
console.log(ok ? "SUPABASE-TREIBER-TEST BESTANDEN" : "SUPABASE-TREIBER-TEST: BEFUNDE OBEN");
process.exit(ok ? 0 : 1);
