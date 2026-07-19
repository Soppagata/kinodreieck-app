/* Restore-Import-Test (Node, localStorage-Stub). Prüft: Format-Ablehnung,
   Feld→Store-Mapping + exakte Wrapper-Formen, Zählbericht, Snapshot vor
   Überschreiben, Streaming-Dienste-Überspringen, Rückgängig, Unicode/Edge.
   Aufruf: node restore_test.mjs */

const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => void _ls.set(k, String(v)),
  removeItem: (k) => void _ls.delete(k),
  clear: () => _ls.clear(),
};

/* ---------- PostgREST-Mock (für den Phase-4-Supabase-Teil unten) ---------- */
const SB_URL = "https://test.supabase.co";
const SB_KEY = "RESTKEY-9";
let sbTable = new Map(); // "owner|key" -> {owner,key,value,scope,rev}
const sbSeed = (owner, key, value, scope = "user", rev = 1) => sbTable.set(owner + "|" + key, { owner, key, value, scope, rev });
const sbGet = (owner, key) => { const r = sbTable.get(owner + "|" + key); return r ? r.value : null; };
const sbResp = (status, data) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(data) });
globalThis.fetch = (url, opts = {}) => {
  const method = opts.method || "GET";
  const body = opts.body ? JSON.parse(opts.body) : null;
  const keyOk = (opts.headers || {})["x-kd-key"] === SB_KEY;
  const u = new URL(url);
  if (!u.pathname.endsWith("/kd_store")) return sbResp(404, { message: "no table" });
  const P = u.searchParams;
  const filt = (n) => { const v = P.get(n); return v == null ? null : v.replace(/^eq\./, ""); };
  const fOwner = filt("owner"), fKey = filt("key"), fScope = filt("scope"), fRev = filt("rev");
  const match = (r) => (!fOwner || r.owner === fOwner) && (!fKey || r.key === fKey) && (!fScope || r.scope === fScope);
  const vis = (r) => (r.scope !== "user" ? true : keyOk);
  if (method === "GET") {
    const rows = [...sbTable.values()].filter(match).filter(vis).filter((r) => fRev == null || String(r.rev) === String(fRev));
    return sbResp(200, rows.map((r) => ({ key: r.key, value: r.value, rev: r.rev, owner: r.owner, scope: r.scope })));
  }
  if (method === "POST") {
    if (!keyOk) return sbResp(401, { message: "RLS" });
    const ins = Array.isArray(body) ? body[0] : body;
    const id = ins.owner + "|" + ins.key;
    if (sbTable.has(id)) return sbResp(409, { message: "dup", code: "23505" });
    const row = { owner: ins.owner, key: ins.key, value: ins.value, scope: ins.scope || "user", rev: 1 };
    sbTable.set(id, row);
    return sbResp(201, [{ ...row }]);
  }
  if (method === "PATCH") {
    const rows = [...sbTable.values()].filter(match).filter(vis).filter((r) => fRev == null || String(r.rev) === String(fRev));
    if (rows.length === 0) return sbResp(200, []);
    const r = rows[0];
    if (body && typeof body.value !== "undefined") r.value = body.value;
    r.rev += 1;
    return sbResp(200, [{ ...r }]);
  }
  return sbResp(200, []);
};

const R = await import("./src/lib/restore.js");
const S = await import("./src/lib/supabaseDriver.js");
const B = await import("./src/lib/backup.js");
const ST = await import("./src/lib/storage.js");

const checks = [];
const check = (n, p) => checks.push([n, p]);
const get = (k) => (_ls.has(k) ? _ls.get(k) : null);
const parse = (k) => { const v = get(k); return v == null ? null : JSON.parse(v); };

const backup = {
  format: "kinodreieck-backup", version: 1, erstellt: "2026-07-17T00:00:00Z",
  masterliste: { meta: { name: "Max", version: "3.0" }, filme: [
    { titel: "Größe · 🎬", jahr: 2001, bewertung: { wie: 3, was: 4, warum: 2 } }, // ohne id → ensureIds vergibt eine
    { id: "fest_1999", titel: "Fester Eintrag", jahr: 1999 },
  ] },
  artikel: [{ id: "a1", titel: "Blog 1" }],
  kino_pins: [{ t: "Film", j: 2020, z: "12.08. Kino", seit: 1 }],
  merkliste: [{ watchmode_id: 1, titel: "M1", jahr: 2010 }, { watchmode_id: 2, titel: "M2", jahr: 2011 }],
  vokabular: [{ wort: "gemütlich", genres: ["komödie"], tags: [] }],
  einstellungen: { theme: "hell", startTab: "kino", schrift: "gross", modus: "kurosawa" },
  entdecken_status: { "100": "gesehen", "200": "erstellt" },
  autor: "Max",
  must_watch_liste: [{ id: "mw_a", titel: "A", im_besitz: true, beschreibung: "", notiz: "", verknuepfung: { ziel: "master", id: "fest_1999" }, erstellt_am: "2026-07-18T00:00:00Z" }],
  // streaming_dienste bewusst NICHT enthalten (Alt-Backup-Lücke)
};

/* 1) Vorher-Stand setzen (für Snapshot-/Undo-Prüfung) */
_ls.clear();
localStorage.setItem("kd:master", JSON.stringify({ meta: null, filme: [{ id: "alt" }] }));
localStorage.setItem("kd:autor-name", "AlterName");

const res = await R.restoreBackup(backup);
check("Restore ok", res.ok === true);

/* 2) Master: Wrapper-Form + ensureIds */
const m = parse("kd:master");
check("Master: Wrapper {meta,filme,herkunft,gespeichertAm}", m && Array.isArray(m.filme) && m.herkunft && m.herkunft.typ === "storage" && typeof m.gespeichertAm === "number");
check("Master: meta übernommen", m.meta && m.meta.version === "3.0");
check("Master: ensureIds vergibt fehlende id", m.filme[0].id && typeof m.filme[0].id === "string" && m.filme[0].id.length > 0);
check("Master: bestehende id bleibt", m.filme[1].id === "fest_1999");
check("Master: Unicode/Emoji unversehrt", m.filme[0].titel === "Größe · 🎬");

/* 3) Artikel: Wrapper {artikel,gespeichertAm} */
const art = parse("kd:artikel");
check("Artikel: Wrapper {artikel:[...],gespeichertAm}", art && Array.isArray(art.artikel) && art.artikel.length === 1 && typeof art.gespeichertAm === "number");

/* 4) Arrays direkt */
check("Kino-Pins: Array direkt", Array.isArray(parse("kd:kino-pins")) && parse("kd:kino-pins").length === 1);
check("Merkliste: Array direkt", Array.isArray(parse("kd:merkliste")) && parse("kd:merkliste").length === 2);
check("Vokabular: Array direkt", Array.isArray(parse("kd:vokabular")) && parse("kd:vokabular")[0].wort === "gemütlich");

/* 5) Objekte */
check("Einstellungen: Objekt", parse("kd:einstellungen").theme === "hell");
check("Entdecken-Status: Objekt", parse("kd:entdecken-status")["100"] === "gesehen");

/* 6) Autor: roher String (kein JSON) */
check("Autor-Name: roher String", get("kd:autor-name") === "Max");

/* 7) Streaming-Dienste: NICHT geschrieben (nicht im Backup), im Bericht übersprungen */
check("Streaming-Dienste: Topf unangetastet (nicht überschrieben)", get("kd:streaming-dienste") === null);
const sd = res.bericht.find((b) => b.topf === "Streaming-Dienste");
check("Streaming-Dienste: als übersprungen berichtet", sd && /ÜBERSPRUNGEN/.test(sd.status));

/* 7b) Must-Watch-Liste (10. Topf): Wrapper {eintraege, gespeichertAm} */
const mwTopf = parse("kd:mustwatch");
check("Must-Watch: Wrapper {eintraege:[...],gespeichertAm}", mwTopf && Array.isArray(mwTopf.eintraege) && mwTopf.eintraege.length === 1 && typeof mwTopf.gespeichertAm === "number");
check("Must-Watch: Eintrag + Verknüpfung unversehrt", mwTopf && mwTopf.eintraege[0].id === "mw_a" && mwTopf.eintraege[0].verknuepfung.id === "fest_1999");

/* 8) Zählbericht */
const mb = res.bericht.find((b) => b.topf === "Masterliste");
check("Bericht: Masterliste-Zählstand = 2", mb && mb.count === 2 && mb.status === "übernommen");

/* 9) Snapshot vor Überschreiben angelegt */
const snap = parse("kd:restore:vorher");
check("Snapshot: vorheriger Master gesichert", snap && snap.werte && /"id":"alt"/.test(snap.werte["kd:master"] || ""));
check("Snapshot: vorheriger Autor gesichert", snap && snap.werte["kd:autor-name"] === "AlterName");

/* 10) Rückgängig stellt den vorherigen Stand her */
await R.restoreRueckgaengig();
check("Undo: Master zurückgesetzt", /"id":"alt"/.test(get("kd:master") || ""));
check("Undo: Autor zurückgesetzt", get("kd:autor-name") === "AlterName");
check("Undo: neu geschriebene Töpfe (kino-pins) wieder entfernt", get("kd:kino-pins") === null);
check("Undo: Must-Watch-Topf wieder entfernt", get("kd:mustwatch") === null);

/* 11) Falsches Format wird abgelehnt, nichts geschrieben */
_ls.clear();
let abgelehnt = false;
try { await R.restoreBackup({ format: "irgendwas", masterliste: { filme: [{}] } }); } catch { abgelehnt = true; }
check("Falsches Format: abgelehnt", abgelehnt === true);
check("Falsches Format: nichts geschrieben", get("kd:master") === null);

/* 12) Fehlende Einzelfelder: nicht abbrechen, Topf überspringen */
_ls.clear();
const teil = await R.restoreBackup({ format: "kinodreieck-backup", version: 1, autor: "Nur" });
check("Teil-Backup: läuft durch", teil.ok === true);
check("Teil-Backup: Autor gesetzt", get("kd:autor-name") === "Nur");
check("Teil-Backup: Master übersprungen", get("kd:master") === null && teil.bericht.find((b) => b.topf === "Masterliste").status.includes("übersprungen"));
check("Teil-Backup: Must-Watch übersprungen, Topf unangetastet", get("kd:mustwatch") === null && teil.bericht.find((b) => b.topf === "Must-Watch-Liste").status.includes("übersprungen"));

/* ===== Phase 4: Backup/Restore über den Supabase-Treiber ===== */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZEHN = {
  "kd:master": JSON.stringify({ meta: { name: "Max" }, filme: [{ id: "f1", titel: "DB-Film" }], herkunft: { typ: "storage" }, gespeichertAm: 1 }),
  "kd:artikel": JSON.stringify({ artikel: [{ id: "a1", titel: "DB-Blog" }], gespeichertAm: 1 }),
  "kd:kino-pins": JSON.stringify([{ t: "P", j: 2020 }]),
  "kd:merkliste": JSON.stringify([{ watchmode_id: 1 }]),
  "kd:vokabular": JSON.stringify([{ wort: "db" }]),
  "kd:einstellungen": JSON.stringify({ theme: "hell" }),
  "kd:entdecken-status": JSON.stringify({ "1": "gesehen" }),
  "kd:autor-name": "DB-Autor",
  "kd:streaming-dienste": JSON.stringify({ auswahl: { netflix: true } }),
  "kd:mustwatch": JSON.stringify({ eintraege: [{ id: "mw1" }], gespeichertAm: 2 }),
  "kd:achievements": JSON.stringify({ eggs: ["cage-alphabet"], gespeichertAm: 3 }),
};

// Aktiver Treiber = Supabase (konfiguriert), DB mit allen 11 Schlüsseln geseedet.
_ls.clear(); sbTable = new Map();
ST.setStorageDriver(S.supabaseDriver);
S.setSupabaseConfig({ url: SB_URL, anon: "anon_pub", owner: "max", key: SB_KEY });
for (const [k, v] of Object.entries(ZEHN)) sbSeed("max", k, v);

// (b) Export trägt nach frischem Pull den DB-Stand (nicht veralteten State)
await S.syncPull();
const bk = await B.baueBackup();
check("P4 Export: master aus DB (Pull, nicht State)", bk.masterliste.filme[0].titel === "DB-Film" && bk.masterliste.meta.name === "Max");
check("P4 Export: artikel entpackt {artikel:[...]}", Array.isArray(bk.artikel) && bk.artikel[0].titel === "DB-Blog");
check("P4 Export: must_watch_liste entpackt {eintraege:[...]}", Array.isArray(bk.must_watch_liste) && bk.must_watch_liste[0].id === "mw1");
check("P4 Export: autor roher String", bk.autor === "DB-Autor");
check("P4 Export: streaming_dienste enthalten", bk.streaming_dienste && bk.streaming_dienste.auswahl.netflix === true);
check("P4 Export: alle 11 Felder befüllt", [bk.masterliste, bk.artikel, bk.kino_pins, bk.merkliste, bk.vokabular, bk.einstellungen, bk.entdecken_status, bk.autor, bk.streaming_dienste, bk.must_watch_liste, bk.achievements].every((x) => x != null));
check("P4 Export: achievements entpackt {eggs:[...]}", bk.achievements && Array.isArray(bk.achievements.eggs) && bk.achievements.eggs.includes("cage-alphabet"));

// (a) Roundtrip: Backup in leere DB einspielen -> alle 10 Owner-Zeilen geschrieben
_ls.clear(); sbTable = new Map();
S.setSupabaseConfig({ url: SB_URL, anon: "anon_pub", owner: "max", key: SB_KEY }); // Config lebt in localStorage -> nach clear neu setzen
const rr = await R.restoreBackup(bk);
check("P4 Restore: ok + kein dbWarnung (Schlüssel da)", rr.ok === true && rr.dbWarnung === false && /aktiv/.test(rr.dbHinweis || ""));
await sleep(80); // Hintergrund-Commits abwarten
check("P4 Roundtrip: master-Wrapper in DB", JSON.parse(sbGet("max", "kd:master") || "{}").filme[0].titel === "DB-Film");
check("P4 Roundtrip: mustwatch-Wrapper in DB", JSON.parse(sbGet("max", "kd:mustwatch") || "{}").eintraege[0].id === "mw1");
check("P4 Roundtrip: autor roh in DB", sbGet("max", "kd:autor-name") === "DB-Autor");
check("P4 Roundtrip: achievements in DB", JSON.parse(sbGet("max", "kd:achievements") || "{}").eggs[0] === "cage-alphabet");
check("P4 Roundtrip: alle 11 Schlüssel in DB", S.SYNC_KEYS.every((k) => sbGet("max", k) != null));
check("P4 Roundtrip: Snapshot vor Überschreiben angelegt", R.hatRestoreSnapshot() === true);

// (c) ohne Schlüssel: kein DB-Write, dbWarnung, lokaler Cache konsistent
_ls.clear(); sbTable = new Map();
S.setSupabaseConfig({ url: SB_URL, anon: "anon_pub", owner: "max", key: "" }); // konfiguriert, aber OHNE Schlüssel
const rc = await R.restoreBackup(bk);
await sleep(50);
check("P4 ohne Schlüssel: dbWarnung + klarer Hinweis", rc.dbWarnung === true && /NICHT in der Datenbank/.test(rc.dbHinweis || ""));
check("P4 ohne Schlüssel: lokaler Cache geschrieben", JSON.parse(localStorage.getItem("kd:master") || "{}").filme[0].titel === "DB-Film");
check("P4 ohne Schlüssel: KEINE DB-Zeile", sbGet("max", "kd:master") === null);

// (d) Snapshot + Undo stellt den Vorher-Stand her (Supabase aktiv)
_ls.clear(); sbTable = new Map();
S.setSupabaseConfig({ url: SB_URL, anon: "anon_pub", owner: "max", key: SB_KEY });
localStorage.setItem("kd:autor-name", "VorherAutor");
await R.restoreBackup(bk);
await sleep(50);
check("P4 Undo-Vorlage: Autor überschrieben", localStorage.getItem("kd:autor-name") === "DB-Autor");
await R.restoreRueckgaengig();
check("P4 Undo: Autor lokal zurückgesetzt", localStorage.getItem("kd:autor-name") === "VorherAutor");

ST.setStorageDriver(null); // Hygiene: zurück auf lokal

let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(`\n${checks.filter(([, p]) => p).length}/${checks.length} Checks bestanden.`);
console.log(ok ? "RESTORE-TEST BESTANDEN" : "RESTORE-TEST: BEFUNDE OBEN");
process.exit(ok ? 0 : 1);
