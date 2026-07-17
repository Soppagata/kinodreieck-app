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

const R = await import("./src/lib/restore.js");

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

let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(ok ? "RESTORE-TEST BESTANDEN" : "RESTORE-TEST: BEFUNDE OBEN");
process.exit(ok ? 0 : 1);
