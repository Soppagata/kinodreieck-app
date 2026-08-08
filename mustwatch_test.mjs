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

/* ---------- 7) Noch-sehen-Projektionen: Typ, Jahr, Suche ---------- */
check("Typ: eindeutige Werte werden erkannt",
  M.mustwatchTyp("film") === "film" && M.mustwatchTyp("Serie") === "serie"
  && M.mustwatchTyp("tv_series") === "serie" && M.mustwatchTyp("movie") === "film");
check("Typ: unbekannter Typ bleibt unbekannt (kein Umdeuten auf film)",
  M.mustwatchTyp(undefined) === null && M.mustwatchTyp("") === null
  && M.mustwatchTyp("filmreihe") === null && M.mustwatchTyp("trilogie") === null
  && M.mustwatchTyp(1972) === null);
check("Jahr: gültige Zahl und Ziffernstring werden übernommen",
  M.mustwatchJahr(1972) === 1972 && M.mustwatchJahr(" 2024 ") === 2024);
check("Jahr: fehlendes oder unsinniges Jahr bleibt null",
  M.mustwatchJahr(null) === null && M.mustwatchJahr("") === null
  && M.mustwatchJahr("bald") === null && M.mustwatchJahr(1972.5) === null
  && M.mustwatchJahr(1200) === null);

const suchEintrag = {
  id: "mw_stalker", titel: "Stalker", jahr: 1979,
  beschreibung: "Sowjetischer Science-Fiction", notiz: "Auf großer Leinwand",
};
check("Suche: Titel trifft", M.passtZuMustwatchSuche(suchEintrag, "stalker"));
check("Suche: bestehende Beschreibung bleibt durchsuchbar", M.passtZuMustwatchSuche(suchEintrag, "sowjetischer"));
check("Suche: Notiz bleibt durchsuchbar", M.passtZuMustwatchSuche(suchEintrag, "leinwand"));
check("Suche: Jahr ist mitdurchsuchbar", M.passtZuMustwatchSuche(suchEintrag, "1979"));
check("Suche: leere Suche filtert nichts weg", M.passtZuMustwatchSuche(suchEintrag, "   "));
check("Suche: Nichttreffer bleibt Nichttreffer", M.passtZuMustwatchSuche(suchEintrag, "solaris") === false);

/* ---------- 8) Verfügbarkeit: nur aus expliziter stabiler Verknüpfung ---------- */
const kandidaten = {
  master: [{ id: "solaris_1972", titel: "Solaris", jahr: 1972 }],
  programm: [{ id: 4711, titel: "Stalker", jahr: 1979 }],
  streaming: [{ id: 88123, titel: "The Substance", jahr: 2024 }],
};
const imKino = { id: "mw_a", titel: "Stalker", verknuepfung: { ziel: "programm", id: "4711" }, erstellt_am: "2026-08-01T10:00:00Z" };
const imStream = { id: "mw_b", titel: "The Substance", verknuepfung: { ziel: "streaming", id: 88123 }, erstellt_am: "2026-07-29T10:00:00Z" };
const inMediathek = { id: "mw_c", titel: "Solaris", verknuepfung: { ziel: "master", id: "solaris_1972" }, erstellt_am: "2026-08-05T10:00:00Z" };
const ohneRef = { id: "mw_d", titel: "Andrej Rubljow", verknuepfung: null, erstellt_am: "2026-08-04T10:00:00Z" };
const toteRef = { id: "mw_e", titel: "Verschwunden", verknuepfung: { ziel: "streaming", id: 99999 }, erstellt_am: "2026-08-03T10:00:00Z" };

check("Verfügbarkeit: Zahl-/String-ID wird bei stabilen IDs tolerant verglichen",
  M.mustwatchVerfuegbarkeit(imKino, kandidaten)?.label === "IM KINO"
  && M.mustwatchVerfuegbarkeit(imStream, kandidaten)?.label === "STREAMING");
check("Verfügbarkeit: Kino und Streaming gelten als jetzt verfügbar",
  M.mustwatchVerfuegbarkeit(imKino, kandidaten).aktuell === true
  && M.mustwatchVerfuegbarkeit(imStream, kandidaten).aktuell === true);
check("Verfügbarkeit: Mediathek ist Besitz, nicht 'jetzt verfügbar'",
  M.mustwatchVerfuegbarkeit(inMediathek, kandidaten)?.label === "MEDIATHEK"
  && M.mustwatchVerfuegbarkeit(inMediathek, kandidaten).aktuell === false);
check("Verfügbarkeit: ohne Verknüpfung keine Aussage",
  M.mustwatchVerfuegbarkeit(ohneRef, kandidaten) === null);
check("Verfügbarkeit: nicht mehr vorhandene Verknüpfung erfindet keine Verfügbarkeit",
  M.mustwatchVerfuegbarkeit(toteRef, kandidaten) === null);
check("Verfügbarkeit: leerer Kandidatenbestand behauptet nichts",
  M.mustwatchVerfuegbarkeit(imKino, {}) === null
  && M.mustwatchVerfuegbarkeit(imKino, { programm: [] }) === null);
check("Verfügbarkeit: KEIN Titel-Fuzzy — gleicher Titel ohne passende ID zählt nicht",
  M.mustwatchVerfuegbarkeit({ titel: "Stalker", verknuepfung: { ziel: "programm", id: "stalker" } }, kandidaten) === null
  && M.mustwatchVerfuegbarkeit({ titel: "Stalker", verknuepfung: null }, kandidaten) === null);

/* ---------- 9) Sortierung: identisch für Dashboard und Vollansicht ---------- */
const mwBestand = [ohneRef, inMediathek, imStream, toteRef, imKino];
const sortiert = M.sortiereMustwatch(mwBestand, kandidaten);
check("Sortierung: aktuell verfügbare zuerst",
  sortiert.slice(0, 2).map((e) => e.id).sort().join(",") === "mw_a,mw_b");
check("Sortierung: innerhalb der Gruppe zuletzt gemerkt zuerst",
  sortiert[0].id === "mw_a" && sortiert[1].id === "mw_b"
  && sortiert.slice(2).map((e) => e.id).join(",") === "mw_c,mw_d,mw_e");
check("Sortierung: Eingabeliste wird nicht mutiert",
  mwBestand.map((e) => e.id).join(",") === "mw_d,mw_c,mw_b,mw_e,mw_a");
const gleichstand = M.sortiereMustwatch([
  { id: "mw_z", titel: "Zabriskie Point", erstellt_am: "2026-08-01T10:00:00Z" },
  { id: "mw_ae", titel: "Ätherwelle", erstellt_am: "2026-08-01T10:00:00Z" },
], kandidaten);
check("Sortierung: bei gleichem Zeitstempel entscheidet der Titel (de)", gleichstand[0].id === "mw_ae");
/* Dashboard = Vollansicht: dieselbe reine Projektion, das Dashboard schneidet
   danach lediglich auf fünf Einträge zu. */
const vollansicht = M.projiziereMustwatch(mwBestand, { filter: "alle", suche: "" }, kandidaten);
const dashboard = M.sortiereMustwatch(mwBestand, kandidaten).slice(0, 5);
check("Sortierung: Dashboard und Vollansicht liefern dieselbe Reihenfolge",
  vollansicht.map((e) => e.id).join(",") === dashboard.map((e) => e.id).join(","));

/* ---------- 10) Filterprojektion ---------- */
const mitTypen = [
  { id: "mw_f", titel: "Ein Film", typ: "film", erstellt_am: "2026-08-02T10:00:00Z" },
  { id: "mw_s", titel: "Eine Serie", typ: "serie", erstellt_am: "2026-08-02T11:00:00Z" },
  { id: "mw_u", titel: "Ohne Typ", erstellt_am: "2026-08-02T12:00:00Z" },
  imKino,
];
check("Filter: 'alle' zeigt auch Einträge ohne Typ",
  M.projiziereMustwatch(mitTypen, { filter: "alle" }, kandidaten).length === 4);
check("Filter: 'film' zeigt nur belegte Filme",
  M.projiziereMustwatch(mitTypen, { filter: "film" }, kandidaten).map((e) => e.id).join(",") === "mw_f");
check("Filter: 'serie' zeigt nur belegte Serien",
  M.projiziereMustwatch(mitTypen, { filter: "serie" }, kandidaten).map((e) => e.id).join(",") === "mw_s");
check("Filter: unbekannter Typ erscheint weder unter Filme noch unter Serien",
  M.projiziereMustwatch(mitTypen, { filter: "film" }, kandidaten).every((e) => e.id !== "mw_u")
  && M.projiziereMustwatch(mitTypen, { filter: "serie" }, kandidaten).every((e) => e.id !== "mw_u"));
check("Filter: 'jetzt' zeigt nur belegbar aktuell Verfügbares",
  M.projiziereMustwatch(mitTypen, { filter: "jetzt" }, kandidaten).map((e) => e.id).join(",") === "mw_a");
check("Filter: 'jetzt' ohne geladenen Katalog zeigt nichts statt alles",
  M.projiziereMustwatch(mitTypen, { filter: "jetzt" }, {}).length === 0);
check("Filter und Suche greifen gemeinsam",
  M.projiziereMustwatch(mitTypen, { filter: "film", suche: "serie" }, kandidaten).length === 0);
check("MUSTWATCH_FILTER benennt genau die vier Ansichten",
  M.MUSTWATCH_FILTER.join(",") === "alle,jetzt,film,serie");

/* ---------- 11) Bestandsfelder überleben die Projektionen ---------- */
const altbestand = [{
  id: "mw_alt", titel: "Alter Eintrag", im_besitz: true, beschreibung: "Text",
  notiz: "Notiz", verknuepfung: null, erstellt_am: "2026-01-01T00:00:00Z", fremdfeld: 42,
}];
const durchgereicht = M.projiziereMustwatch(altbestand, {}, kandidaten)[0];
check("Projektion: Bestandsfelder inkl. unbekannter Zusatzfelder bleiben unverändert",
  durchgereicht.im_besitz === true && durchgereicht.beschreibung === "Text"
  && durchgereicht.notiz === "Notiz" && durchgereicht.fremdfeld === 42
  && durchgereicht === altbestand[0]);

let ok = true;
for (const [n, p] of checks) { console.log((p ? "✓ " : "✗ ") + n); if (!p) ok = false; }
console.log(`${checks.filter(([, p]) => p).length}/${checks.length} Checks bestanden.`);
console.log(ok ? "MUSTWATCH-TEST BESTANDEN" : "MUSTWATCH-TEST: BEFUNDE OBEN");
process.exit(ok ? 0 : 1);
