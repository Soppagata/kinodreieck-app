/* Echte-Datei-Test: lädt die FERTIGE Kinodreieck.html in jsdom und prüft,
   dass die App wirklich rendert (gegen #root.textContent — der Body enthält
   auch den Inline-Script-Quelltext!). fetch wird gestubbt; die file://-
   Streaming-Beilage wird deterministisch mit dem eingebetteten Snapshot befüllt.
   Deckt auch den Kino-Flow ab: kompakten Eintrag aufklappen, Termin pinnen,
   "Eintrag erstellen" mit Vorbefüllung.
   Aufruf: node echtdatei_test.mjs [pfad-zur-html] */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const pfad = process.argv[2] || "/tmp/kd-single/Kinodreieck.html";
const html = readFileSync(pfad, "utf8");

/* Seit der Beta-Startwahl lädt die App bei leerem Storage NICHT mehr automatisch
   eine Master, sondern zeigt das Startwahl-Modal. Für diesen Test einen Master
   direkt in den Storage legen. Für den film_at_id-Match-Check NICHT an einen festen
   Titel koppeln (der Snapshot wird täglich frisch gezogen) — stattdessen dynamisch
   einen film_at_id-Film aus dem AKTUELLEN Snapshot greifen, das Test-Datum auf dessen
   Zeitraum setzen und einen passenden Master-Eintrag seeden. Plus ein Apple-Besitz-
   Eintrag (Besitz-Anzeige) und ein zweiter Eintrag. */
const echteMaster = JSON.parse(readFileSync(new URL("./src/data/masterliste.json", import.meta.url), "utf8"));
const snap = JSON.parse(readFileSync(new URL("./src/data/programm-snapshot.json", import.meta.url), "utf8"));
const entdeckenSnapshot = JSON.parse(readFileSync(new URL("./src/data/streaming_entdecken_snapshot.json", import.meta.url), "utf8"));
const VON = (snap.zeitraum && snap.zeitraum.von) || new Date().toISOString().slice(0, 10);
// 4-Tage-Anzeigefenster der App (ANZEIGE_TAGE=4) ab VON — der Film muss darin eine Vorstellung haben.
const FENSTER = [0, 1, 2, 3].map((i) => { const d = new Date(VON + "T12:00:00"); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
const matchFilm = (snap.filme || []).find((f) => f.film_at_id && (f.vorstellungen || []).some((v) => FENSTER.includes(String(v.zeit).slice(0, 10))))
  || (snap.filme || []).find((f) => f.film_at_id) || { titel: "Kein film_at_id-Film im Snapshot", film_at_id: -1 };
const MATCH_TITEL = matchFilm.titel;
const MATCH_ID = matchFilm.film_at_id;
const FIXED_ISO = VON + "T12:00:00+02:00"; // Test-Uhr in den Snapshot-Zeitraum
const seedMaster = JSON.stringify({
  meta: echteMaster.meta || { name: "Test" },
  filme: [
    { id: "apple_testfilm_2000", titel: "Apple-Testfilm", originaltitel: "Apple-Testfilm", jahr: 2000, jahr_bis: null, typ: "film", quelle: "apple", must_watch: false, kategorie: "sehenswert", bewertet_von: "max", bewertung: { wie: 3, was: 4, warum: 2 }, genre: ["Drama"], tags: [], begruendung: "Besitz-Testeintrag (Apple).", status: "gesetzt", notiz: "" },
    { id: "match_test", titel: MATCH_TITEL, originaltitel: MATCH_TITEL, jahr: 2000, jahr_bis: null, typ: "film", quelle: "dvd", must_watch: false, kategorie: "sehenswert", bewertet_von: "max", bewertung: { wie: 3, was: 3, warum: 3 }, genre: [], tags: [], begruendung: "film_at_id-Match-Test.", status: "gesetzt", notiz: "", film_at_id: MATCH_ID },
    // Besitz-/Unbewertet-/Migrations-Testfälle (Phase 2+3, 2026-07-18):
    { id: "unbew_dvd_1980", titel: "Unbewertet-Testfilm", originaltitel: "Unbewertet-Testfilm", jahr: 1980, jahr_bis: null, typ: "film", quelle: "dvd+prime", must_watch: false, kategorie: null, bewertet_von: null, bewertung: null, genre: [], tags: [], begruendung: "", status: "gesetzt", notiz: "" },
    { id: "flag_testfilm_1990", titel: "Flag-Testfilm", originaltitel: "Flag-Testfilm", jahr: 1990, jahr_bis: null, typ: "film", quelle: "bluray", must_watch: true, kategorie: "sehenswert", bewertet_von: "max", bewertung: { wie: 2, was: 2, warum: 2 }, genre: [], tags: [], begruendung: "Migrations-Testeintrag.", status: "gesetzt", notiz: "" },
    ...echteMaster.filme,
  ],
  herkunft: { typ: "storage" }, gespeichertAm: Date.now(),
});
const dom = new JSDOM(html, {
  url: "http://localhost/Kinodreieck.html", // file:// wirft in jsdom bei localStorage
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    /* Test-Uhr in den Snapshot-Zeitraum fixieren, sonst filtert die App vergangene
       Vorstellungen weg, sobald das echte Datum darüber hinausläuft. */
    const FIXED = Date.parse(FIXED_ISO);
    const RealDate = window.Date;
    class MockDate extends RealDate {
      constructor(...a) { super(...(a.length ? a : [FIXED])); }
      static now() { return FIXED; }
    }
    window.Date = MockDate;
    window.fetch = () => Promise.reject(new Error("offline (Test)"));
    window.__KD_STREAMING_ENTDECKEN__ = entdeckenSnapshot;
    if (!window.URL.createObjectURL) window.URL.createObjectURL = () => "blob:test";
    if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    window.localStorage.setItem("kd:setup", JSON.stringify({ done: true, installiert: true, skip: [], am: "2026-07-15", version: "beta-2026-07-datenfreigabe-2" }));
    window.localStorage.setItem("kd:tutorial", JSON.stringify({ willkommen: true, gesehen: [] }));
    window.localStorage.setItem("kd:master", seedMaster);
    /* Etappe 4: Dashboard-Seeds — Must-Watch (mit erstellt_am) fürs Must-Watch-
       und Zuletzt-hinzugefügt-Modul, Merkliste (Netflix-Titel aus dem Demo-
       Entdecken-Snapshot, Default-Abos enthalten Netflix) für „Jetzt streambar". */
    window.localStorage.setItem("kd:mustwatch", JSON.stringify({ eintraege: [
      { id: "mw_stalker", titel: "Stalker", im_besitz: true, beschreibung: "", notiz: "", verknuepfung: null, erstellt_am: "2026-07-10T10:00:00.000Z" },
      { id: "mw_der_dialog", titel: "Der Dialog", im_besitz: false, beschreibung: "", notiz: "", verknuepfung: null, erstellt_am: "2026-07-12T10:00:00.000Z" },
    ], gespeichertAm: Date.now() }));
    const merkTitel = (entdeckenSnapshot.titel || []).find((t) => (t.dienste || []).includes("Netflix"));
    if (merkTitel) window.localStorage.setItem("kd:merkliste", JSON.stringify([
      { watchmode_id: merkTitel.watchmode_id, titel: merkTitel.titel, jahr: merkTitel.jahr ?? null, hinzugefuegt_am: "2026-07-14" },
    ]));
  },
});
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const doc = dom.window.document;
const root = () => doc.getElementById("root");
const text = () => (root() && root().textContent) || "";
const knopf = (re) => [...doc.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim()));

await warte(3000);
const checks = [];
const check = (name, pass) => checks.push([name, pass]);

/* ---- Grundgerüst (Personal-Dashboard ist der Start-Tab, Etappe 4) ---- */
const startText = text();
check("App gerendert (#root gefüllt)", startText.length > 300);
const icon = doc.querySelector('link[rel="icon"]');
check("Favicon eingebettet (data:-URI, kein file://-Bruch)", !!icon && (icon.getAttribute("href") || "").startsWith("data:image/svg"));
for (const tab of ["START", "KINO", "MEDIATHEK", "STREAMING", "BLOG", "SUCHE"]) {
  check("Tab " + tab, new RegExp(tab, "i").test(startText));
}

/* ---- Dashboard-Module (ersetzt die Landing-Checks; Landing testet betamodus_test.mjs) ---- */
const enthaeltMatchText = (s) => String(s || "").toLowerCase().includes(String(MATCH_TITEL).toLowerCase());
check("Dashboard: Vertrauens-Zeile (Programm- + Katalog-Stand)", !!doc.querySelector(".kd-vertrauen") && /Programm: \d{2}\.\d{2}\./.test(startText) && /Katalog: \d+ Titel/.test(startText));
check("Dashboard: Kino-für-dich-Modul mit Match + Termin", /Kino für dich/.test(startText) && enthaeltMatchText(startText) && /MATCH/.test(startText));
check("Dashboard: Must-Watch-Modul (geseedete Einträge, Besitz-Badge)", /Must-Watch/.test(startText) && /Stalker/.test(startText) && /IM BESITZ/.test(startText));
check("Dashboard: Jetzt-streambar-Modul (Merkliste ∩ Abos)", /Jetzt streambar/.test(startText) && /JETZT AUF NETFLIX/.test(startText));
check("Dashboard: Zuletzt hinzugefügt (Zeitstempel-Quellen, neueste zuerst)", /Zuletzt hinzugefügt/.test(startText) && /MERKLISTE/.test(startText) && /MUST-WATCH/.test(startText));
check("Dashboard: leeres Pinboard-Modul erscheint NICHT", !/Pinboard/.test(startText));
check("Dashboard: Erklärinhalte raus aus Start (kein Hero, keine Quicklinks)",
  !/LOKALE FILM-PLATTFORM/.test(startText) && !/Deine Filme, dein Kino, dein Urteil/.test(startText) && !/Direkt hinein/.test(startText) && !knopf(/Anleitung & Hilfe öffnen/i));

/* ---- Kino: kompakter Eintrag -> Pin -> Eintrag erstellen ----
   (kein Attribut-Selektor: jsdoms CSS-Engine nwsapi verschluckt sich am "&") */
const kinoTabKnopf = knopf(/^kino$/i);
if (kinoTabKnopf) { kinoTabKnopf.click(); await warte(600); }
const kinoText = text();
const kopf = [...doc.querySelectorAll("[title]")].find((e) => e.getAttribute("title") === "Details & Eintrag erstellen");
check("Kompakte Einträge vorhanden (Läuft auch)", !!kopf);
if (kopf) {
  kopf.click(); await warte(400);
  const pin = knopf(/^◇/);
  check("Termin-Pin-Knöpfe im aufgeklappten Eintrag", !!pin);
  if (pin) {
    pin.click(); await warte(400);
    check("Angepinnt-Block erscheint", /Angepinnt \(1\)/.test(text()));
  }
  check("Verknüpfen-Option im aufgeklappten Eintrag", /Schon in deiner Liste/.test(text()));
  const erstellen = knopf(/^Eintrag erstellen$/i);
  check("Eintrag-erstellen-Knopf", !!erstellen);
  if (erstellen) {
    erstellen.click(); await warte(400);
    const titelFeld = [...doc.querySelectorAll("input")].find((i) => i.placeholder === "Titel *");
    check("FilmForm öffnet mit vorbefülltem Titel", !!titelFeld && titelFeld.value.trim().length > 0);
  }
}

/* ---- film_at_id-Match: der geseedete Titel matcht via film_at_id als Treffer,
   nicht als Kompakt-Eintrag. Titel dynamisch aus dem aktuellen Snapshot. ---- */
const enthaeltMatch = (s) => String(s || "").toLowerCase().includes(String(MATCH_TITEL).toLowerCase());
if (enthaeltMatch(kinoText)) {
  const kompaktKoepfe = [...doc.querySelectorAll("[title]")].filter((e) => /Details & Eintrag erstellen|Zuklappen/.test(e.getAttribute("title") || ""));
  const alsKompakt = kompaktKoepfe.some((e) => enthaeltMatch(e.textContent));
  check(`"${MATCH_TITEL}" läuft als Treffer (film_at_id-Match)`, !alsKompakt);
} else {
  check(`"${MATCH_TITEL}" im Programm sichtbar (film_at_id ${MATCH_ID})`, false);
}

/* ---- Zurück zum Start: der eben gesetzte Pin füllt jetzt das Pinboard-Modul ---- */
const startTabKnopf = knopf(/^start$/i);
if (startTabKnopf) { startTabKnopf.click(); await warte(500); }
check("Dashboard: Pinboard-Modul erscheint nach dem Pinnen (Karte + Termin-Chip)", /Pinboard/.test(text()) && /→ Kino/.test(text()));

/* ---- Streaming/Entdecken: Filter + gesehen + Eintrag erstellen ---- */
const streamingTab = knopf(/^streaming$/i);
if (streamingTab) { streamingTab.click(); await warte(800); }
const entdeckenKnopf = knopf(/^entdecken/i);
check("Entdecken-Ansicht erreichbar", !!entdeckenKnopf);
if (entdeckenKnopf) {
  entdeckenKnopf.click(); await warte(600);
  /* Filterleiste ist default zugeklappt -> vor den Chip-Checks aufklappen */
  const sFilter = [...doc.querySelectorAll("button")].find((b) => /Filter$/.test((b.textContent || "").trim()) && /[▸▾]/.test(b.textContent || ""));
  if (sFilter && /▸/.test(sFilter.textContent)) { sFilter.click(); await warte(300); }
  check("Chip: Könnte dir gefallen", !!knopf(/^Könnte dir gefallen$/i));
  const gesehenKnopf = [...doc.querySelectorAll("button")].find((b) => /Als gesehen markieren/.test(b.getAttribute("title") || ""));
  check("Gesehen-Knopf pro Titel", !!gesehenKnopf);
  if (gesehenKnopf) {
    gesehenKnopf.click(); await warte(400);
    check("Erledigte-Chip erscheint nach Markieren", /Erledigte zeigen \(1\)/.test(text()));
  }
  /* Nach dem Gesehen-Check einen ANDEREN, noch offenen Titel aufklappen. Beim
     erledigten Titel ist "Eintrag erstellen" absichtlich nicht mehr sichtbar. */
  const zeile = [...doc.querySelectorAll("div")].find((d) => d.style && d.style.cursor === "pointer"
    && [...d.querySelectorAll("button")].some((b) => /Als gesehen markieren/.test(b.getAttribute("title") || "")));
  if (zeile) { zeile.click(); await warte(400); }
  const eErstellen = knopf(/^Eintrag erstellen$/i);
  check("Eintrag-erstellen im Entdecken", !!eErstellen);
  if (eErstellen) {
    eErstellen.click(); await warte(400);
    const titelFeld = [...doc.querySelectorAll("input")].find((i) => i.placeholder === "Titel *" && i.value.trim().length > 0);
    check("Entdecken-FilmForm vorbefüllt", !!titelFeld);
    const abbrechen = knopf(/^Abbrechen$/i);
    if (abbrechen) { abbrechen.click(); await warte(200); }
  }
}

/* ---- Einstellungen: Darstellung, Theme-Wechsel, Vokabular, Backup, Rechtliches ---- */
const datenTab = knopf(/^einstellungen$/i);
check("Tab heißt Einstellungen", !!datenTab);
if (datenTab) { datenTab.click(); await warte(600); }
check("Darstellung & Verhalten vorhanden", /Darstellung & Verhalten/.test(text()));
/* Easter-Egg-Modi: versteckt unter dem „Max"-Link in Über & Rechtliches */
const maxLink = [...doc.querySelectorAll("span")].find((s) => (s.textContent || "").trim() === "Max" && s.style && s.style.cursor === "pointer");
check("Easter-Egg-Link 'Max' vorhanden", !!maxLink);
if (maxLink) { maxLink.click(); await warte(200); }
check("Easter-Egg-Modus-Knopf erscheint", !!knopf(/^(Showa|NERV)$/));
check("Suche-Vokabular vorhanden", /Suche-Vokabular/.test(text()));
check("Backup-Knopf vorhanden", !!knopf(/Gesamt-Backup herunterladen/i));
check("Rechtliches vorhanden", /Über & Rechtliches/.test(text()) && /nicht-kommerzielles/.test(text()));

/* ---- „Über"-Einstieg (Etappe 4): Erklärstücke + Anleitung leben jetzt hier ---- */
const ueberKnopf = knopf(/^Über Kinodreieck & Anleitung$/i);
check("Über-Einstieg unter Über & Rechtliches vorhanden", !!ueberKnopf);
if (ueberKnopf) {
  ueberKnopf.click(); await warte(400);
  check("Über: Hero + Dreieck-Erklärstück erscheinen", /LOKALE FILM-PLATTFORM/.test(text()) && /Deine Filme, dein Kino, dein Urteil/.test(text())
    && /Wie ist es gemacht\?/.test(text()) && /Was erzählt es\?/.test(text()) && /Warum gerade für dich\?/.test(text()));
  const dokuKnopf = knopf(/Anleitung & Hilfe öffnen/i);
  check("Über: Doku-Knopf vorhanden", !!dokuKnopf);
  if (dokuKnopf) {
    dokuKnopf.click(); await warte(300);
    check("Über: Doku-Ansicht öffnet (inkl. Rechtliches)", /Automatik/.test(text()) && /Die vollständige Anleitung liegt als ANLEITUNG\.md/.test(text()));
    const zu = knopf(/Anleitung zuklappen/i);
    if (zu) { zu.click(); await warte(200); }
  }
  const ueberZu = knopf(/^Über Kinodreieck zuklappen$/i);
  if (ueberZu) { ueberZu.click(); await warte(200); }
}

/* ---- Must-Watch-Migration (Flag-Testfilm ist geseedet) ---- */
check("Migration: Abschnitt sichtbar (offenes Flag)", /Must-Watch-Migration/.test(text()));
const migKnopf = knopf(/Flags in die Must-Watch-Liste migrieren/);
check("Migration: Knopf vorhanden", !!migKnopf);
if (migKnopf) {
  migKnopf.click(); await warte(500);
  let mwTopf = null;
  try { mwTopf = JSON.parse(dom.window.localStorage.getItem("kd:mustwatch") || "null"); } catch { /* */ }
  const eintraege = (mwTopf && mwTopf.eintraege) || [];
  /* Etappe 4: 2 Dashboard-Seeds + 1 migrierter Eintrag = 3 in der Liste. */
  const migriert = eintraege.find((e) => e.verknuepfung && e.verknuepfung.id === "flag_testfilm_1990");
  check("Migration: 1 Eintrag angelegt + auf Master verknüpft (Seeds unangetastet)",
    eintraege.length === 3 && !!migriert);
  check("Migration: im_besitz aus physischer Quelle abgeleitet (bluray)", !!migriert && migriert.im_besitz === true);
  check("Migration: Bericht angezeigt (1 angelegt)", /Migration: 1 angelegt/.test(text()));
  check("Migration: Knopf nach Lauf verschwunden (idempotent, nichts mehr offen)", !knopf(/Flags in die Must-Watch-Liste migrieren/));
}
/* Theme-Wechsel: Foyer anklicken -> Wrapper-Hintergrund hell, dann zurück */
const foyer = knopf(/Foyer \(hell\)/i);
check("Theme-Knöpfe vorhanden", !!foyer && !!knopf(/Saal \(dunkel\)/i));
if (foyer) {
  foyer.click(); await warte(500);
  const wrapBg = root().firstElementChild ? dom.window.getComputedStyle(root().firstElementChild).backgroundColor : "";
  check("Light Mode färbt die Fläche um", /237, 234, 227|rgb\(237/.test(wrapBg));
  const saal = knopf(/Saal \(dunkel\)/i);
  if (saal) { saal.click(); await warte(400); }
}

/* ---- Teilen & Tauschen (jetzt im Einstellungen-Tab) ---- */
check("Teilen & Tauschen im Einstellungen-Tab", /Teilen & Tauschen/.test(text()));
const kiKnopf = knopf(/Bestand per KI erfassen/i);
check("KI-Popup-Knopf", !!kiKnopf);
if (kiKnopf) {
  kiKnopf.click(); await warte(300);
  const promptFeld = doc.getElementById("kd-ingestion-prompt");
  check("Ingestion-Prompt sichtbar + Paketformat drin", !!promptFeld && /kinodreieck-paket/.test(promptFeld.value));
  const paste = [...doc.querySelectorAll("textarea")].find((t) => /JSON aus der KI-Antwort/.test(t.placeholder || ""));
  check("Paste-Feld im Popup", !!paste);
  if (paste) {
    const paket = JSON.stringify({ format: "kinodreieck-paket", version: 1, autor: "Laura", quelle: "ki-ingestion", bereiche: {
      filme: [{ titel: "Lauras Testfilm", jahr: 2021, typ: "film", kategorie: "sehenswert", bewertung: { wie: 3, was: 4, warum: 2 }, genre: ["Drama"], begruendung: "Lauras Urteil." }],
    } });
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(paste, paket);
    paste.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await warte(200);
    const importKnopf = knopf(/^Eingefügtes importieren$/i);
    if (importKnopf) { importKnopf.click(); await warte(400); }
    check("Vorschau erscheint (1 neu, Autor Laura)", /Paket-Vorschau/.test(text()) && /Laura/.test(text()) && /1 neu/.test(text()));
    const uebernehmen = knopf(/^Auswahl übernehmen$/i);
    if (uebernehmen) { uebernehmen.click(); await warte(500); }
    check("Report: übernommen von Laura", /Übernommen von Laura/.test(text()) && /Filme 1/.test(text()));
  }
}

/* ---- Mediathek: Apple-Besitz + importierter Fremd-Eintrag ---- */
const mediathekTab = knopf(/mediathek/i);
if (mediathekTab) { mediathekTab.click(); await warte(800); }
/* Filterleiste (mit dem Apple-Chip) ist default zugeklappt -> aufklappen */
const mFilter = [...doc.querySelectorAll("button")].find((b) => /Filter$/.test((b.textContent || "").trim()) && /[▸▾]/.test(b.textContent || ""));
if (mFilter && /▸/.test(mFilter.textContent)) { mFilter.click(); await warte(300); }
check("Mediathek klickbar + Apple-Besitz sichtbar", /apple/i.test(text()));
check("Lauras Import in der Mediathek (mit Autor)", /Lauras Testfilm/i.test(text()) && /bewertet von Laura/i.test(text()));

/* ---- Block A: Notiz-Feld editierbar (Karte aufklappen -> Bearbeiten) ---- */
const karte = [...doc.querySelectorAll("div")].find((d) => d.style && d.style.cursor === "pointer" && /SCORE/.test(d.textContent || ""));
if (karte) {
  karte.click(); await warte(400);
  const bearb = knopf(/Bewertung bearbeiten|Beschreibung bearbeiten/);
  if (bearb) { bearb.click(); await warte(300); }
  check("Notiz-Feld im Edit-Panel (jeder Eintrag)", [...doc.querySelectorAll("textarea")].some((t) => /^Notiz/.test(t.placeholder || "")));
} else {
  check("Mediathek-Karte für Notiz-Test gefunden", false);
}

/* ---- Besitz-Ansicht: nur physische Quellen, unbewertet erstklassig ---- */
const besitzKnopf = knopf(/^Im Besitz \(/);
check("Mediathek: Ansicht-Umschalter 'Im Besitz'", !!besitzKnopf);
if (besitzKnopf) {
  besitzKnopf.click(); await warte(600);
  const tb = text();
  check("Besitz: physischer Eintrag sichtbar (dvd+prime-Kombi)", /Unbewertet-Testfilm/.test(tb));
  check("Besitz: bluray-Eintrag sichtbar", /Flag-Testfilm/.test(tb));
  check("Besitz: Apple-only-Eintrag NICHT im Besitz-Bereich", !/Apple-Testfilm/.test(tb));
  check("Besitz: UNBEWERTET-Badge sichtbar", /UNBEWERTET/.test(tb));
  check("Besitz: 'Jetzt bewerten'-Einstieg vorhanden", !!knopf(/Jetzt bewerten/));
  const nurUnbew = knopf(/^nur unbewertete/);
  check("Besitz: Chip 'nur unbewertete'", !!nurUnbew);
  if (nurUnbew) {
    nurUnbew.click(); await warte(400);
    const tu = text();
    check("Besitz-Filter: unbewerteter Eintrag bleibt, bewerteter fliegt", /Unbewertet-Testfilm/.test(tu) && !/Flag-Testfilm/.test(tu));
    const aus = knopf(/^nur unbewertete/);
    if (aus) { aus.click(); await warte(200); }
  }
}

/* ---- Must-Watch-Ansicht: migrierter Eintrag lebt in der eigenen Liste ---- */
const mwKnopf = knopf(/^Must-Watch \(/);
check("Mediathek: Ansicht-Umschalter 'Must-Watch'", !!mwKnopf);
if (mwKnopf) {
  mwKnopf.click(); await warte(500);
  check("Must-Watch: migrierter Eintrag gelistet", /Flag-Testfilm/.test(text()));
  check("Must-Watch: eigener '+ Eintrag'-Knopf", !!knopf(/^\+ Eintrag$/));
  check("Must-Watch: im-Besitz-Häkchen pro Eintrag", [...doc.querySelectorAll('input[type="checkbox"]')].length > 0);
}

let ok = true;
for (const [name, pass] of checks) { console.log((pass ? "✓ " : "✗ ") + name); if (!pass) ok = false; }
console.log(ok ? "ECHTE-DATEI-TEST BESTANDEN: " + pfad : "TEST FEHLGESCHLAGEN");
process.exit(ok ? 0 : 1);
