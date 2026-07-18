/* Must-Watch-/Besitz-Import-Test (Node, reine Logik aus src/lib/mustwatch.js).
   Prüft: ID-Prefix + Kollisions-Suffix, Flag-Migration (physisch-Ableitung,
   Idempotenz bei Doppellauf), Besitz-Import (Kollisions-Guard, Datei-Duplikat,
   jahr-null-Slug, typ-Mapping, Idempotenz, Format-Ablehnung).
   Aufruf: node mustwatch_test.mjs */

const M = await import("./src/lib/mustwatch.js");

const checks = [];
const check = (n, p) => checks.push([n, p]);

/* ---------- 1) IDs: Prefix + Kollisions-Suffix ---------- */
check("ID trägt mw_-Prefix", M.neueMustwatchId("Der dritte Mann", []) === "mw_der_dritte_mann");
check("istMustwatchId erkennt Prefix", M.istMustwatchId("mw_x") === true && M.istMustwatchId("blade_runner_1982") === false);
const vorhanden = [{ id: "mw_titel" }, { id: "mw_titel_2" }];
check("ID-Kollision -> Suffix _3", M.neueMustwatchId("Titel", vorhanden) === "mw_titel_3");

/* ---------- 2) Migration: Ableitung + Bericht ---------- */
const master = [
  { id: "a_2000", titel: "A", quelle: "dvd", must_watch: true },
  { id: "b_2001", titel: "B", quelle: "bluray+prime", must_watch: true },  // physisch trotz prime-Kombi
  { id: "c_2002", titel: "C", quelle: "prime", must_watch: true },         // digital = KEIN Besitz
  { id: "d_2003", titel: "D", quelle: null, must_watch: true },            // Wunschliste = kein Besitz
  { id: "e_2004", titel: "E", quelle: "dvd", must_watch: false },          // kein Flag -> nicht migriert
];
const m1 = M.migriereFlags(master, [], "2026-07-18T12:00:00Z");
check("Migration: nur Flag-Einträge (4 von 5)", m1.neue.length === 4 && m1.uebersprungen === 0);
check("Migration: Verknüpfung auf Master-ID", m1.neue.every((e) => e.verknuepfung.ziel === "master") && m1.neue[0].verknuepfung.id === "a_2000");
const proId = Object.fromEntries(m1.neue.map((e) => [e.verknuepfung.id, e]));
check("Migration: im_besitz physisch (dvd)", proId["a_2000"].im_besitz === true);
check("Migration: im_besitz physisch (bluray+prime-Kombi)", proId["b_2001"].im_besitz === true);
check("Migration: prime-only ist KEIN Besitz", proId["c_2002"].im_besitz === false);
check("Migration: ohne Quelle kein Besitz", proId["d_2003"].im_besitz === false);
check("Migration: mw_-IDs vergeben", m1.neue.every((e) => e.id.startsWith("mw_")));

/* ---------- 3) Migration: Idempotenz (Doppellauf ändert nichts) ---------- */
const m2 = M.migriereFlags(master, m1.neue, "2026-07-18T13:00:00Z");
check("Migration Doppellauf: nichts Neues", m2.neue.length === 0);
check("Migration Doppellauf: alle als übersprungen", m2.uebersprungen === 4);
check("offeneFlagAnzahl: vor Migration 4, danach 0",
  M.offeneFlagAnzahl(master, []) === 4 && M.offeneFlagAnzahl(master, m1.neue) === 0);

/* ---------- 4) Besitz-Import: Format-Ablehnung ---------- */
let abgelehnt = false;
try { M.parseBesitzImport(JSON.stringify({ format: "irgendwas", eintraege: [] })); } catch { abgelehnt = true; }
check("Import: falsches Format abgelehnt", abgelehnt);

/* ---------- 5) Besitz-Import: Guard, Duplikat, jahr null, typ-Mapping ---------- */
const importDatei = {
  format: "kinodreieck-besitz-import",
  eintraege: [
    { titel: "Neuer Film", jahr: 2001, typ: "film", quelle: "dvd", notiz: "Edition: Steelbook" },
    { titel: "Kollision", jahr: 1999, typ: "film", quelle: "dvd" },        // existiert in Master
    { titel: "Doppelt", jahr: 2005, typ: "film", quelle: "dvd" },
    { titel: "Doppelt", jahr: 2005, typ: "film", quelle: "dvd" },          // Datei-Duplikat -> Guard
    { titel: "Ohne Jahr", jahr: null, typ: "film", quelle: "dvd" },        // Slug ohne Jahres-Suffix
    { titel: "Serien-Box", jahr: 1998, typ: "serie", quelle: "dvd" },
    { titel: "Beide-Fall", jahr: 2004, typ: "film", quelle: "dvd+prime" },
  ],
};
const bestand = [{ id: "kollision_1999", titel: "Kollision", jahr: 1999 }];
const r1 = M.wendeBesitzImportAn(importDatei, bestand, "2026-07-18T12:00:00Z");
check("Import: 5 übernommen, 2 übersprungen", r1.neue.length === 5 && r1.bericht.filter((b) => b.status !== "übernommen").length === 2);
check("Import: Master-Kollision übersprungen + Grund", r1.bericht.some((b) => b.titel === "Kollision" && /existiert bereits/.test(b.grund)));
check("Import: Datei-Duplikat übersprungen", r1.bericht.filter((b) => b.titel === "Doppelt" && b.status === "übernommen").length === 1);
const ohneJahr = r1.neue.find((f) => f.titel === "Ohne Jahr");
check("Import: jahr null -> Slug ohne Suffix, jahr bleibt null", ohneJahr.id === "ohne_jahr" && ohneJahr.jahr === null);
check("Import: typ serie übernommen", r1.neue.find((f) => f.titel === "Serien-Box").typ === "serie");
check("Import: quelle-Kombi übernommen", r1.neue.find((f) => f.titel === "Beide-Fall").quelle === "dvd+prime");
const neu = r1.neue.find((f) => f.titel === "Neuer Film");
check("Import: Einträge sind UNBEWERTET (bewertung/kategorie/bewertet_von null)",
  neu.bewertung === null && neu.kategorie === null && neu.bewertet_von === null);
check("Import: Flag-Feld kompatibel false, Notiz übernommen", neu.must_watch === false && neu.notiz === "Edition: Steelbook");

/* ---------- 6) Besitz-Import: Idempotenz (zweiter Lauf gegen erweiterten Bestand) ---------- */
const r2 = M.wendeBesitzImportAn(importDatei, [...bestand, ...r1.neue], "2026-07-18T13:00:00Z");
check("Import Doppellauf: nichts übernommen", r2.neue.length === 0);
check("Import Doppellauf: alles übersprungen + berichtet", r2.bericht.every((b) => b.status !== "übernommen"));

let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(`${checks.filter(([, p]) => p).length}/${checks.length} Checks bestanden.`);
console.log(ok ? "MUSTWATCH-TEST BESTANDEN" : "MUSTWATCH-TEST: BEFUNDE OBEN");
process.exit(ok ? 0 : 1);
