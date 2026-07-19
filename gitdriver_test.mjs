/* Git-Treiber-Test (Node, gemocktes fetch + localStorage-Stub).
   Deckt die riskanten Pfade ab: SHA-Neuanlage/-Update, Pull+Snapshot, 404,
   SHA-Mismatch, Offline, base64-Unicode, delete-ohne-Remote, non-sync-Key.
   Aufruf: node gitdriver_test.mjs */

/* ---------- localStorage-Stub ---------- */
const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => void _ls.set(k, String(v)),
  removeItem: (k) => void _ls.delete(k),
  clear: () => _ls.clear(),
};

/* ---------- fetch-Mock: konfigurierbar pro Test ---------- */
let fetchCalls = [];
let fakeRepoFiles = {}; // file -> { content(b64), sha, encoding? ("none" für >1MB-Fall) }
let forceOffline = false;
let nextPutStatus = null; // z.B. 409 erzwingen
let failGetFiles = new Set(); // Dateien, deren GET mit 500 scheitert (Pull-Fehler-Fall)

function b64enc(str) {
  const bytes = new TextEncoder().encode(str); let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function resp(status, data) {
  return Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(data) });
}
globalThis.fetch = (url, opts = {}) => {
  fetchCalls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
  if (forceOffline) return Promise.reject(new TypeError("Load failed"));
  const u = new URL(url);
  const p = u.pathname;
  // GET /repos/{owner}/{repo}
  if (opts.method === undefined || opts.method === "GET") {
    const mRepo = p.match(/^\/repos\/[^/]+\/[^/]+$/);
    if (mRepo) return resp(200, { full_name: "Soppagata/kinodreieck-daten", private: true });
    const mFile = p.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (mFile) {
      const file = decodeURIComponent(mFile[1]);
      if (failGetFiles.has(file)) return resp(500, { message: "kaputt (Test)" });
      const rec = fakeRepoFiles[file];
      if (rec) return resp(200, { content: rec.content, sha: rec.sha, name: file, encoding: rec.encoding || "base64" });
      return resp(404, { message: "Not Found" });
    }
  }
  if (opts.method === "PUT") {
    const mFile = p.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    const file = decodeURIComponent(mFile[1]);
    const body = JSON.parse(opts.body);
    if (nextPutStatus === 409) { nextPutStatus = null; return resp(409, { message: "does not match" }); }
    const rec = fakeRepoFiles[file];
    // SHA-Prüfung: existiert die Datei, muss der mitgeschickte SHA passen.
    if (rec && body.sha !== rec.sha) return resp(409, { message: "sha mismatch" });
    if (rec && !body.sha) return resp(422, { message: "sha required" });
    const newSha = "sha-" + (Object.keys(fakeRepoFiles).length + 1) + "-" + Math.floor(performance.now());
    fakeRepoFiles[file] = { content: body.content, sha: newSha };
    return resp(rec ? 200 : 201, { content: { sha: newSha, name: file }, commit: { sha: "commit1" } });
  }
  return resp(400, { message: "unhandled" });
};

/* ---------- Import NACH Stub-Setup ---------- */
const G = await import("./src/lib/gitDriver.js");

/* ---------- Test-Harness ---------- */
const checks = [];
const check = (n, p) => { checks.push([n, p]); };
function reset() {
  _ls.clear(); fetchCalls = []; fakeRepoFiles = {}; forceOffline = false; nextPutStatus = null; failGetFiles = new Set();
  G.setGitConfig({ repo: "Soppagata/kinodreieck-daten", token: "github_pat_dummy", branch: "main" });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 1) Konfiguration + Verbindungstest */
reset();
check("isGitConfigured true bei repo+token", G.isGitConfigured() === true);
const ct = await G.connectionTest();
check("connectionTest ok + privat erkannt", ct.ok === true && ct.private === true);

/* 2) set(sync-Key): sofort lokal + Commit legt Datei an (201, SHA gecacht) */
reset();
await G.gitDriver.set("kd:master", '{"filme":[1,2]}');
check("set schreibt sofort lokal", localStorage.getItem("kd:master") === '{"filme":[1,2]}');
await sleep(20); // Hintergrund-Commit abwarten
const put1 = fetchCalls.find((c) => c.method === "PUT");
check("PUT gegen masterliste.json ausgelöst", !!put1 && /contents\/masterliste\.json/.test(put1.url));
check("Datei im (Fake-)Repo angelegt", !!fakeRepoFiles["masterliste.json"]);
check("kein Pending mehr nach Erfolg", G.syncStatus().pending.length === 0);

/* 3) zweites set(): PUT MIT gemerktem SHA -> 200 */
fetchCalls = [];
await G.gitDriver.set("kd:master", '{"filme":[1,2,3]}');
await sleep(20);
const put2 = fetchCalls.find((c) => c.method === "PUT");
check("zweiter PUT schickt gemerkten SHA mit", !!put2 && typeof put2.body.sha === "string" && put2.body.sha.length > 0);
check("Repo-Inhalt aktualisiert", b64dec(fakeRepoFiles["masterliste.json"].content) === '{"filme":[1,2,3]}');

/* 4) Pull: Remote neuer -> lokal überschrieben + Snapshot des alten Stands */
reset();
localStorage.setItem("kd:vokabular", '["alt"]');
fakeRepoFiles["vokabular.json"] = { content: b64enc('["neu"]'), sha: "sha-remote-1" };
const pull = await G.syncPull();
check("Pull: lokal = Remote nach Übernahme", localStorage.getItem("kd:vokabular") === '["neu"]');
const snaps = G.getSnapshots("kd:vokabular");
check("Pull: Snapshot des alten Stands angelegt", snaps.length === 1 && snaps[0].value === '["alt"]');
check("Pull meldet geladen", pull.geladen.includes("vokabular.json"));

/* 5) Pull 404: Datei fehlt im Repo -> lokal bleibt, kein Snapshot, kein Verlust */
reset();
localStorage.setItem("kd:artikel", '{"artikel":["mein"]}');
const pull404 = await G.syncPull();
check("Pull 404: lokaler Stand unangetastet", localStorage.getItem("kd:artikel") === '{"artikel":["mein"]}');
check("Pull 404: als 'anzulegen' gemeldet", pull404.angelegt.includes("artikel.json"));
check("Pull 404: kein Snapshot nötig", G.getSnapshots("kd:artikel").length === 0);

/* 6) SHA-Mismatch beim Commit: NIE blind überschreiben, Konflikt + lokal intakt */
reset();
localStorage.setItem("kd:master", '{"lokal":true}');
fakeRepoFiles["masterliste.json"] = { content: b64enc('{"remote":true}'), sha: "sha-X" };
nextPutStatus = 409; // erzwinge Mismatch beim nächsten PUT
await G.gitDriver.set("kd:master", '{"lokal":"neu"}');
await sleep(20);
check("Mismatch: lokaler Stand NICHT verloren", localStorage.getItem("kd:master") === '{"lokal":"neu"}');
check("Mismatch: Remote NICHT überschrieben", b64dec(fakeRepoFiles["masterliste.json"].content) === '{"remote":true}');
check("Mismatch: Konflikt markiert", G.syncStatus().conflict.includes("masterliste.json"));
check("Mismatch: Snapshot des lokalen Stands", G.getSnapshots("kd:master").some((s) => s.value === '{"lokal":"neu"}'));

/* 7) Offline beim set: Pending markiert, lokal intakt, kein Verlust */
reset();
forceOffline = true;
await G.gitDriver.set("kd:merkliste", '[{"id":1}]');
await sleep(20);
check("Offline: lokal gespeichert", localStorage.getItem("kd:merkliste") === '[{"id":1}]');
check("Offline: als nicht synchronisiert markiert", G.syncStatus().pending.includes("merkliste.json"));
// wieder online -> Flush committet nach
forceOffline = false;
const fl = await G.syncFlush();
check("Flush committet ausstehende Änderung nach", fl.some((r) => r.ok) && !!fakeRepoFiles["merkliste.json"]);
check("Flush: Pending danach leer", G.syncStatus().pending.length === 0);

/* 8) base64 <-> UTF-8: Umlaute + Emoji round-trippen unversehrt */
reset();
const heikel = '{"t":"Größe · Œuvre · 🎬 · straße"}';
await G.gitDriver.set("kd:artikel", heikel);
await sleep(20);
check("Unicode: im Repo korrekt kodiert", b64dec(fakeRepoFiles["artikel.json"].content) === heikel);

/* 9) delete(sync-Key): nur lokal, NIE remote löschen */
reset();
localStorage.setItem("kd:master", "x");
fakeRepoFiles["masterliste.json"] = { content: b64enc("x"), sha: "s1" };
fetchCalls = [];
await G.gitDriver.delete("kd:master");
await sleep(20);
check("delete: lokaler Cache entfernt", localStorage.getItem("kd:master") === null);
check("delete: KEIN DELETE/PUT an Remote", !fetchCalls.some((c) => c.method === "DELETE" || c.method === "PUT"));
check("delete: Remote-Datei noch da", !!fakeRepoFiles["masterliste.json"]);

/* 10) non-sync-Key: set berührt Git nicht */
reset();
fetchCalls = [];
await G.gitDriver.set("kd:start", "clean");
await sleep(20);
check("non-sync: lokal gesetzt", localStorage.getItem("kd:start") === "clean");
check("non-sync: kein Git-Call", fetchCalls.length === 0);

/* 11) Token taucht nie in einem Dateiinhalt auf */
reset();
await G.gitDriver.set("kd:autor-name", "Max");
await sleep(20);
const alleContents = Object.values(fakeRepoFiles).map((r) => b64dec(r.content)).join("|");
check("Secret: Token in keinem Dateiinhalt", !alleContents.includes("github_pat_dummy"));

/* 12) Schnelle Folge-set() auf denselben Key: kein Selbst-Konflikt, Remote = neuester Wert */
reset();
const p1 = G.gitDriver.set("kd:master", '{"v":1}');
const p2 = G.gitDriver.set("kd:master", '{"v":2}');
await Promise.all([p1, p2]);
await sleep(50); // beide serialisierten Commits abwarten
check("Race: kein Konflikt-Flag entstanden", G.syncStatus().conflict.length === 0);
check("Race: nichts bleibt pending", G.syncStatus().pending.length === 0);
check("Race: Remote trägt den NEUESTEN Wert", b64dec(fakeRepoFiles["masterliste.json"].content) === '{"v":2}');

/* 13) REGRESSION (Review 2026-07): Pull darf ungesyncte lokale Änderungen NICHT
   stillschweigend verwerfen — vorher: Offline-Edit + fremder Push = Datenverlust. */
reset();
fakeRepoFiles["masterliste.json"] = { content: b64enc('{"anderes":"geraet"}'), sha: "sha-r2" };
forceOffline = true;
await G.gitDriver.set("kd:master", '{"offline":"edit"}'); // Commit scheitert -> pending
await sleep(20);
forceOffline = false;
const pullK = await G.syncPull();
check("Pull-Schutz: lokaler Offline-Stand NICHT überschrieben", localStorage.getItem("kd:master") === '{"offline":"edit"}');
check("Pull-Schutz: als Konflikt gemeldet", pullK.konflikt.includes("masterliste.json") && G.syncStatus().conflict.includes("masterliste.json"));
check("Pull-Schutz: Snapshot des lokalen Stands vorhanden", G.getSnapshots("kd:master").some((s) => s.value === '{"offline":"edit"}'));

/* 14) REGRESSION: Pull-Fehler wird stale, NICHT pending — Flush pusht dann nichts
   (vorher: Pull-Fehler => pending => Flush committete evtl. veralteten Stand). */
reset();
localStorage.setItem("kd:vokabular", '["lokal"]');
fakeRepoFiles["vokabular.json"] = { content: b64enc('["remote"]'), sha: "sv1" };
failGetFiles.add("vokabular.json");
await G.syncPull();
check("Pull-Fehler: lokal unangetastet", localStorage.getItem("kd:vokabular") === '["lokal"]');
check("Pull-Fehler: als stale geführt", G.syncStatus().stale.includes("vokabular.json"));
check("Pull-Fehler: NICHT pending", !G.syncStatus().pending.includes("vokabular.json"));
fetchCalls = [];
await G.syncFlush();
check("Pull-Fehler: Flush macht daraufhin KEINEN PUT", !fetchCalls.some((c) => c.method === "PUT"));
failGetFiles.clear();
await G.syncPull();
check("Pull-Erfolg danach: stale abgeräumt", !G.syncStatus().stale.includes("vokabular.json"));

/* 15) REGRESSION: Konfliktdatei — Flush überspringt sie (kein 409-Dauerfeuer),
   nur die bewusste Nutzerwahl pusht. */
reset();
localStorage.setItem("kd:master", '{"lokal":true}');
fakeRepoFiles["masterliste.json"] = { content: b64enc('{"remote":true}'), sha: "sha-X" };
nextPutStatus = 409;
await G.gitDriver.set("kd:master", '{"lokal":"neu"}');
await sleep(20);
check("Konflikt vorhanden (Ausgangslage)", G.syncStatus().conflict.includes("masterliste.json"));
fetchCalls = [];
await G.syncFlush();
check("Flush überspringt Konfliktdatei (kein PUT)", !fetchCalls.some((c) => c.method === "PUT"));
const rlokal = await G.resolveConflictPushLocal("kd:master");
check("Bewusst pushen: ok + Remote trägt lokalen Stand", rlokal.ok === true && b64dec(fakeRepoFiles["masterliste.json"].content) === '{"lokal":"neu"}');
check("Bewusst pushen: Flags geräumt", G.syncStatus().conflict.length === 0 && G.syncStatus().pending.length === 0);

/* 16) REGRESSION: Konflikt per „Remote übernehmen" lösen — lokal gesichert, Remote gilt. */
reset();
localStorage.setItem("kd:artikel", '{"lokal":"a"}');
fakeRepoFiles["artikel.json"] = { content: b64enc('{"remote":"b"}'), sha: "sa1" };
nextPutStatus = 409;
await G.gitDriver.set("kd:artikel", '{"lokal":"a2"}');
await sleep(20);
const rRemote = await G.resolveConflictUseRemote("kd:artikel");
check("Remote übernehmen: ok + lokal = Remote", rRemote.ok === true && localStorage.getItem("kd:artikel") === '{"remote":"b"}');
check("Remote übernehmen: lokaler Stand als Snapshot gesichert", G.getSnapshots("kd:artikel").some((s) => s.value === '{"lokal":"a2"}'));
check("Remote übernehmen: Konflikt geräumt", G.syncStatus().conflict.length === 0);

/* 17) REGRESSION: Datei >1MB (Contents-API: encoding "none", content "") darf
   lokal NIE mit Leerem überschreiben. */
reset();
localStorage.setItem("kd:master", '{"wichtig":true}');
fakeRepoFiles["masterliste.json"] = { content: "", sha: "sbig", encoding: "none" };
const pullBig = await G.syncPull();
check("encoding none: lokal NICHT mit Leerem überschrieben", localStorage.getItem("kd:master") === '{"wichtig":true}');
check("encoding none: als Fehler + stale gemeldet", pullBig.fehler.some((f) => f.file === "masterliste.json") && G.syncStatus().stale.includes("masterliste.json"));

/* 18) 10. Sync-Datei (Must-Watch): synct, konfliktet und schützt wie die übrigen */
reset();
check("SYNC_MAP: kd:mustwatch → mustwatch.json + kd:achievements → achievements.json (11 Dateien)",
  G.SYNC_MAP["kd:mustwatch"] === "mustwatch.json" && G.SYNC_MAP["kd:achievements"] === "achievements.json" && Object.keys(G.SYNC_MAP).length === 11);
await G.gitDriver.set("kd:mustwatch", '{"eintraege":[{"id":"mw_test","titel":"T"}],"gespeichertAm":1}');
await sleep(20);
check("mustwatch: Commit legt mustwatch.json an", !!fakeRepoFiles["mustwatch.json"] && b64dec(fakeRepoFiles["mustwatch.json"].content).includes("mw_test"));
check("mustwatch: kein Pending nach Erfolg", G.syncStatus().pending.length === 0);
/* 11. Sync-Datei (Achievements, Block 3): committet wie die übrigen */
await G.gitDriver.set("kd:achievements", '{"eggs":["cage-alphabet"],"gespeichertAm":1}');
await sleep(20);
check("achievements: Commit legt achievements.json an", !!fakeRepoFiles["achievements.json"] && b64dec(fakeRepoFiles["achievements.json"].content).includes("cage-alphabet"));
// Pull-Schutz (Offline-Edit + fremder Push) gilt auch für die 10. Datei
reset();
fakeRepoFiles["mustwatch.json"] = { content: b64enc('{"eintraege":[],"gespeichertAm":2}'), sha: "smw" };
forceOffline = true;
await G.gitDriver.set("kd:mustwatch", '{"eintraege":[{"id":"mw_offline"}]}');
await sleep(20);
forceOffline = false;
const pullMw = await G.syncPull();
check("mustwatch: Pull-Schutz meldet Konflikt statt Datenverlust",
  pullMw.konflikt.includes("mustwatch.json") && localStorage.getItem("kd:mustwatch") === '{"eintraege":[{"id":"mw_offline"}]}');

/* ---------- Auswertung ---------- */
function b64dec(b64) {
  const bin = atob((b64 || "").replace(/\s/g, "")); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(ok ? "GIT-TREIBER-TEST BESTANDEN" : "GIT-TREIBER-TEST: BEFUNDE OBEN");
process.exit(ok ? 0 : 1);
