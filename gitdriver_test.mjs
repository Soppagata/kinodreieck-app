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
let fakeRepoFiles = {}; // file -> { content(b64), sha }
let forceOffline = false;
let nextPutStatus = null; // z.B. 409 erzwingen

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
      const rec = fakeRepoFiles[file];
      if (rec) return resp(200, { content: rec.content, sha: rec.sha, name: file });
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
  _ls.clear(); fetchCalls = []; fakeRepoFiles = {}; forceOffline = false; nextPutStatus = null;
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
