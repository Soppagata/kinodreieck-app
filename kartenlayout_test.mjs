import fs from "node:fs";
import assert from "node:assert/strict";
import { quelleBadges, QUELLEN_KLASSEN } from "./src/lib/quellen.js";
import {
  sortiereStreamingTitel, streamingAnfangsbuchstabe,
  streamingJahrzehnte, streamingJahrzehntLabel, streamingJahrzehntBereich, streamingGenreFilterSichtbar,
  passtInJahrzehntMitKulanz,
} from "./src/lib/streamingSort.js";

let ok = 0;
const check = (name, fn) => {
  try {
    fn();
    ok++;
    console.log("✓ " + name);
  } catch (error) {
    console.error("✗ " + name + ": " + error.message);
    process.exitCode = 1;
  }
};
const lies = (datei) => fs.readFileSync(new URL(datei, import.meta.url), "utf8");

check("Quellen unterscheiden physisch, Digitalkauf und Abo", () => {
  const badges = Object.fromEntries(quelleBadges("dvd+amazon+prime").map((b) => [b.key, b]));
  assert.equal(badges.dvd.klasse, QUELLEN_KLASSEN.PHYSISCH);
  assert.equal(badges.amazon.klasse, QUELLEN_KLASSEN.DIGITAL_GEKAUFT);
  assert.equal(badges.prime.klasse, QUELLEN_KLASSEN.ABO);
});

check("Kinotickets bleiben dem Kinoprogramm vorbehalten", () => {
  assert.doesNotMatch(lies("./src/tabs/StartTab.jsx"), /<KinoTicket/);
  assert.match(lies("./src/tabs/KinoTab.jsx"), /<KinoTicket/);
  assert.match(lies("./src/components/ui.jsx"), /export function KinoTicket/);
});

check("Kino-Programmfilter bleiben sichtbar, beschriftet und mobil kompakt", () => {
  const kino = lies("./src/tabs/KinoTab.jsx");
  const css = lies("./src/index.css");
  const filterCss = lies("./src/styles/kino-filter.css");
  assert.match(kino, /className=\{`kd-kino-programmfilter/);
  assert.match(kino, /aria-label="Datum im Kinoprogramm"[\s\S]*Alle Programmtage/);
  assert.match(kino, /aria-label="Kino im Kinoprogramm"[\s\S]*Alle Kinos/);
  const programmReset = kino.match(/const resetProgrammfilter = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(programmReset, "Datum/Kino/Abo/Fassung besitzen weiterhin einen gemeinsamen Reset");
  assert.match(programmReset, /setKinoF\(""\); setTagF\(null\); setAboFilter\("alle"\); setFassungF\(null\)/);
  const alleReset = kino.match(/const resetAlleFilter = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(alleReset, "Der sichtbare Reset löst sämtliche aktiven Einschränkungen");
  assert.match(alleReset, /resetProgrammfilter\(\);\s*setSucheK\(""\);\s*setZeigeAlles\(true\);/);
  assert.doesNotMatch(alleReset, /saveZeitgrenze|setZeitgrenze/, "Die gespeicherte Uhrzeit bleibt erhalten");
  assert.match(kino, /aktiveFilterAnzahl = \[kinoF, tagF, aboFilter !== "alle", fassungF, sucheK, !zeigeAlles\]\.filter\(Boolean\)\.length/);
  assert.match(kino, /\{aktiveFilterAnzahl > 0 && \(\s*<button type="button" onClick=\{resetAlleFilter\}>Filter zurücksetzen<\/button>/);
  assert.match(kino, /Filter\{aktiveFilterAnzahl > 0 \? ` · \$\{aktiveFilterAnzahl\}` : ""\}/);
  assert.match(kino, /className="kd-kino-filter-toggle"[\s\S]*?aria-expanded=\{filterMenueOffen\} aria-controls=\{filterPanelId\}/);
  assert.match(kino, /id=\{filterPanelId\} hidden=\{!filterMenueOffen\} className="kd-kino-filterpanel"/);
  assert.doesNotMatch(kino, /kd-seitensuche|Programm durchsuchen/, "Keine lokale Suchzeile versteckt die Zusatzfilter mobil");
  assert.match(kino, /setSucheK\(fokusTreffer\.titel \|\| ""\)/, "Der globale Suchfokus bleibt erhalten");
  assert.match(kino, /zeitenGefiltert[\s\S]*if \(tagF\)[\s\S]*if \(kinoF\)/);
  assert.match(css, /\.kd-kino-programmfilter select \{[^}]*min-height:44px/);
  assert.match(css, /@media \(max-width:760px\)[\s\S]*\.kd-kino-programmfilter \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(kino, /import "\.\.\/styles\/kino-filter\.css"/);
  assert.match(filterCss, /\.kd-kino-tab \.kd-kino-filteroptionen \{[^}]*flex-wrap: wrap/);
  assert.match(filterCss, /\.kd-kino-tab \.kd-kino-zusatzfilter input \{[^}]*min-height: 44px;[^}]*min-width: 44px/);
});

check("Mobiler Kino-Fehler verweist nicht auf einen dort unsichtbaren Notfallimport", () => {
  const kino = lies("./src/tabs/KinoTab.jsx");
  assert.match(kino, /manuelle Notfallimport ist dort in der Desktopansicht verfügbar/);
});

check("Katalogoberflächen unterscheiden hinterlegte Zugangsdaten von bestätigter Verbindung", () => {
  const daten = lies("./src/tabs/DatenTab.jsx");
  const kino = lies("./src/tabs/KinoTab.jsx");
  const streaming = lies("./src/tabs/StreamingTab.jsx");
  assert.match(daten, /Zugangsdaten hinterlegt/);
  assert.doesNotMatch(daten + kino + streaming, /Datenbank noch nicht verbunden/);
});

check("Dashboard folgt der festen Startseiten-Reihenfolge", () => {
  const start = lies("./src/tabs/StartTab.jsx");
  const dashboard = start.slice(start.indexOf('<div className="kd-dash-grid">'));
  const positionen = [
    dashboard.indexOf('name="Pinboard"'),
    dashboard.indexOf("<Wochenplan"),
    dashboard.indexOf('name="Must-Watch"'),
    dashboard.indexOf('name="Zuletzt hinzugefügt"'),
  ];
  assert.ok(positionen.every((position) => position >= 0));
  assert.deepEqual([...positionen].sort((a, b) => a - b), positionen);
  assert.doesNotMatch(dashboard, /name="Kino für dich"/);
  assert.match(dashboard, /kinoVorschlaege=\{kinoVorschlaege\}/);
  assert.doesNotMatch(dashboard, /name="Jetzt streambar"/);
});

check("Deine Woche rendert rollierende Kinotickets und verständliche Kalenderaktionen", () => {
  const woche = lies("./src/components/Wochenplan.jsx");
  const css = lies("./src/index.css");
  assert.match(woche, /Heute bis/);
  assert.doesNotMatch(woche, /Vorige Woche|Nächste Woche|Woche \.ics/);
  assert.match(woche, /Die nächsten 7 Tage in den Kalender setzen/);
  assert.doesNotMatch(woche, /🗓|\.ics-Dateien/);
  assert.match(woche, /Eintrag am \$\{tag\.name\}.*erstellen/);
  assert.match(woche, /Ort \/ Anbieter/);
  assert.doesNotMatch(woche, /App-Verknüpfung|Externer Link|Automatisch suchen/);
  assert.match(woche, /kd-wochen-eintrag-download/);
  assert.match(woche, /Diesen Termin im Kalender speichern/);
  assert.match(woche, /istVorschlag \|\| istKinoPin/);
  assert.match(woche, /Termin ansehen/);
  assert.match(woche, /wochentagFuerDatum\(startdatum\)/);
  assert.doesNotMatch(woche, /ExportIcon/);
  assert.match(css, /\.kd-wochen-tag \{[\s\S]*background-color:var\(--kd-leinwand\)/);
  assert.match(css, /\.kd-wochen-ticketstub/);
  assert.match(css, /\.kd-showa \.kd-wochenplan \{[^}]*--wp-ticket-accent:var\(--kd-tinteWeich\);[^}]*--wp-ticket-muted:var\(--kd-tinteWeich\)/);
  assert.match(css, /\.kd-wochen-ticketstub b \{[^}]*color:var\(--wp-ticket-accent\)/);
  assert.match(css, /\.kd-wochen-frei \{[^}]*color:var\(--wp-ticket-muted\)/);
  assert.match(css, /\.kd-wochen-tage input:checked\+span/);
  assert.match(css, /\.kd-wochen-editor \.kd-wochen-datumfeld input \{[^}]*width:148px/);
  assert.match(css, /\.kd-wochen-editor \.kd-wochen-zeitfeld input \{[^}]*width:108px/);
  assert.match(css, /@media \(max-width:430px\)[\s\S]*\.kd-wochen-datumfeld.*grid-column:1\/-1/);
});

check("Der verworfene Beobachtet-Pin ist aus dem Streaming-Eintrag entfernt", () => {
  const streaming = lies("./src/tabs/StreamingTab.jsx");
  assert.doesNotMatch(streaming, /kd-entdecken-beobachten|setzeSerienBeobachtung/);
});

check("Streaming sortiert ohne Relevanzwerte und nutzt eindeutige Schnellregler", () => {
  const titel = [
    { titel: "Zulu", jahr: 2001, typ: "movie", dienste: [] },
    { titel: "Alien", jahr: 1979, typ: "movie", dienste: ["Netflix"] },
    { titel: "Ohne Jahr", jahr: null, typ: "tv_series", dienste: ["Prime Video"] },
  ];
  assert.deepEqual(sortiereStreamingTitel(titel, "titel", "auf").map((t) => t.titel), ["Alien", "Ohne Jahr", "Zulu"]);
  assert.deepEqual(sortiereStreamingTitel(titel, "jahr", "ab").map((t) => t.titel), ["Zulu", "Alien", "Ohne Jahr"]);
  assert.equal(streamingAnfangsbuchstabe("Äon Flux"), "A");
  assert.equal(streamingAnfangsbuchstabe("  Zulu"), "Z");
  assert.equal(streamingAnfangsbuchstabe("2001"), null);
  assert.deepEqual(streamingJahrzehnte([{ jahr: 1987 }, { jahr: 2012 }]), [1980, 1990, 2000, 2010]);
  assert.equal(streamingJahrzehntLabel(1920), "1920er");
  assert.equal(streamingJahrzehntLabel(2000), "2000er");
  assert.equal(streamingJahrzehntLabel(0), "Alle");
  assert.deepEqual(streamingJahrzehntBereich(1950), { von: 1948, bis: 1962, label: "1948–1962" });
  assert.equal(streamingJahrzehntBereich(0), null);
  assert.equal(streamingGenreFilterSichtbar([
    { genres: ["Crime"] }, { genres: ["Drama"] }, { genres: [] },
  ]), false);
  assert.equal(streamingGenreFilterSichtbar([
    { genres: ["Crime"] }, { genres: ["Drama"] }, { genres: ["Drama"] },
  ]), true);
  assert.equal(passtInJahrzehntMitKulanz(1948, 1950), true);
  assert.equal(passtInJahrzehntMitKulanz(1962, 1950), true);
  assert.equal(passtInJahrzehntMitKulanz("1950", "1950"), true);
  assert.equal(passtInJahrzehntMitKulanz(1947, 1950), false);
  assert.equal(passtInJahrzehntMitKulanz(1963, 1950), false);
  assert.equal(passtInJahrzehntMitKulanz(null, 1950), false);
  assert.equal(passtInJahrzehntMitKulanz("kein Jahr", 1950), false);
  assert.equal(passtInJahrzehntMitKulanz(Number.NaN, 1950), false);
  assert.equal(passtInJahrzehntMitKulanz(2024, 0), true);

  const streaming = lies("./src/tabs/StreamingTab.jsx");
  assert.doesNotMatch(streaming, /Sortierung: Passung|User-Score|Könnte dir gefallen|passungStufe|lesbaresPassungsSignal/);
  assert.match(streaming, /"data-tour": "entdecken-sortierung"/);
  assert.doesNotMatch(streaming, /Absteigend sortiert|aufsteigend wechseln|↑|↓/);
  assert.match(streaming, /function SortierFilter[\s\S]*Sortieren nach[\s\S]*Richtung[\s\S]*Aufsteigend[\s\S]*Absteigend/);
  assert.match(streaming, /kd-streamfilter-panel[\s\S]*SortierFilter name="Mein Programm"/);
  assert.match(streaming, /kd-streamfilter-panel[\s\S]*SortierFilter name="Entdecken"/);
  assert.match(streaming, /className="kd-nur-desktop"[\s\S]*Merkliste \(\{merkliste\.length\}\) exportieren/);
  assert.match(streaming, /name="Mein Programm"[\s\S]*nurBewertet/);
  assert.match(streaming, /Gesehen \(\{statusAnzahlenE\}\)/);
  assert.doesNotMatch(streaming, /Beobachtet \(\{statusAnzahlenE/);
  assert.match(streaming, /type="range"[\s\S]*Anfangsbuchstaben filtern/);
  assert.match(streaming, /Jahrzehntbereich/);
  assert.match(streaming, /<strong aria-live="polite">\{bereich \? streamingJahrzehntLabel\(wert\) : "Alle"\}<\/strong>/);
  assert.doesNotMatch(streaming, /streamingJahrzehntLabel\(wert\).*bereich\.label/);
  assert.match(streaming, /aria-valuetext=\{bereich \? `\$\{Number\(wert\)\}er: \$\{bereich\.von\} bis \$\{bereich\.bis\}` : "Alle Jahrzehnte"\}/);
  const alphabetFilter = streaming.match(/function AlphabetFilter[\s\S]*?\n}\n\nfunction JahrzehntFilter/)?.[0] || "";
  assert.doesNotMatch(alphabetFilter, /<button/);
  assert.match(streaming, /Filter &amp; Sortierung/);
  assert.match(streaming, /name="Mein Programm"[\s\S]*optionen=\{dekadenP\}/);
  assert.match(streaming, /kd-kompakt kd-streaming-werkzeuge[\s\S]*kd-streamfilter-knopf/);
  assert.match(streaming, /genreFilterSichtbarE && <div className="kd-streamfilter-gruppe kd-streamfilter-genre"/);
  const css = lies("./src/index.css");
  assert.match(css, /\.kd-streamfilter-abc-kopf \{[^}]*grid-template-columns:minmax\(0,1fr\) 104px/);
  assert.doesNotMatch(css, /\.kd-streamfilter-abc-kopf button/);
  assert.match(css, /\.kd-streamfilter-sortierung select \{[^}]*min-height:44px/);
  assert.match(streaming, /className="kd-streamfilter-knopf"/);
});

check("Kinoticket zeigt keine Bewertung im Programmkopf", () => {
  const ui = lies("./src/components/ui.jsx");
  const ticket = ui.slice(ui.indexOf("export function KinoTicket"), ui.indexOf("/* ---------- UI-Icons"));
  assert.doesNotMatch(ticket, /Dreieck|AxisChips|KategorieTag|bewertung/i);
});

check("KI-Prognose liegt als voller Kartenblock außerhalb des Filmkopfs", () => {
  const card = lies("./src/components/FilmCard.jsx");
  const kopfEnde = card.indexOf("{expanded && !editing && vorbewertung");
  assert.ok(kopfEnde > card.indexOf('className="kd-filmkopf"'));
  assert.match(card, /className="kd-film-prognose-breit"[\s\S]*width: "100%"/);
  assert.match(lies("./src/components/PrognoseBereich.jsx"), /className="kd-prognose"[\s\S]*width: "100%"/);
});

check("KI-Prognose ordnet ihre ausgeschriebenen Aktionen mobil untereinander an", () => {
  const prognose = lies("./src/components/PrognoseBereich.jsx");
  const css = lies("./src/index.css");
  assert.match(prognose, /className="kd-prognose-aktionen"/);
  assert.match(prognose, />Als Bewertung übernehmen</);
  assert.match(prognose, />Echt bewerten \/ korrigieren</);
  assert.match(css, /@media \(max-width:760px\)[\s\S]*\.kd-prognose-aktionen[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
});

check("Blog-Datenwerkzeuge sind aus der Release-Oberfläche entfernt", () => {
  assert.doesNotMatch(lies("./src/tabs/BlogTab.jsx"), /kd-blog-daten|MasterImport|Artikel exportieren|Artikel importieren/);
});

check("Blog-Bearbeitung bleibt knapp und Altmodi sind an die geschlossene Release-Projektion gebunden", () => {
  const blog = lies("./src/tabs/BlogTab.jsx");
  const daten = lies("./src/tabs/DatenTab.jsx");
  assert.match(blog, /vorlage \? "Speichern" : "Erstellen"/);
  assert.doesNotMatch(blog, /Speichern & neu abgleichen/i);
  assert.match(daten, /const RELEASE_NEBENWEGE_SICHTBAR = false/);
  assert.match(daten, /RELEASE_NEBENWEGE_SICHTBAR && eggOffen && waehleModus/);
});

check("Icon-only Lösch- und Schließen-Aktionen sind zugänglich beschriftet", () => {
  // Die lokale Kinosuche ist entfernt; die weiterhin vorhandene Icon-only-
  // Pin-Aktion muss ihren konkreten zugänglichen Namen behalten.
  assert.match(lies("./src/tabs/KinoTab.jsx"), /aria-label=\{`Pin für \$\{p\.t\} lösen`\}/);
  assert.match(lies("./src/tabs/MediathekTab.jsx"), /aria-label="Mediatheksuche leeren"/);
  assert.match(lies("./src/tabs/BlogTab.jsx"), /aria-label=\{`Referenz \$\{i \+ 1\} entfernen`\}/);
});

console.log(`kartenlayout_test: ${ok} Checks bestanden.`);
