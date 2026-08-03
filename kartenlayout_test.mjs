import fs from "node:fs";
import assert from "node:assert/strict";
import { quelleBadges, QUELLEN_KLASSEN } from "./src/lib/quellen.js";
import {
  sortiereStreamingTitel, streamingAnfangsbuchstabe,
  streamingJahrzehnte, passtInJahrzehntMitKulanz,
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

check("Dashboard folgt der festen Startseiten-Reihenfolge", () => {
  const start = lies("./src/tabs/StartTab.jsx");
  const dashboard = start.slice(start.indexOf('<div className="kd-dash-grid">'));
  const positionen = [
    dashboard.indexOf('name="Pinboard & Serienradar"'),
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

check("Beobachten ist ein eigener Serien-Pin im ausgeklappten Streaming-Eintrag", () => {
  const streaming = lies("./src/tabs/StreamingTab.jsx");
  assert.match(streaming, /className="kd-entdecken-beobachten"/);
  assert.match(streaming, /setzeSerienBeobachtung/);
  assert.match(streaming, /Unabhängig davon, ob du die Serie schon gesehen hast/);
});

check("Streaming sortiert ohne Relevanzwerte und nutzt tolerante Schnellregler", () => {
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
  assert.equal(passtInJahrzehntMitKulanz(1980, 1990), true);
  assert.equal(passtInJahrzehntMitKulanz(2000, 1990), true);
  assert.equal(passtInJahrzehntMitKulanz(1979, 1990), false);
  assert.equal(passtInJahrzehntMitKulanz(null, 1990), false);

  const streaming = lies("./src/tabs/StreamingTab.jsx");
  assert.doesNotMatch(streaming, /Sortierung: Passung|User-Score|Könnte dir gefallen|passungStufe|lesbaresPassungsSignal/);
  assert.match(streaming, /data-tour="entdecken-sortierung"/);
  assert.match(streaming, /className="kd-nur-desktop"[\s\S]*Merkliste \(\{merkliste\.length\}\) exportieren/);
  assert.match(streaming, /name="Mein Programm"[\s\S]*nurBewertet/);
  assert.match(streaming, /Gesehen \(\{statusAnzahlenE\.gesehen\}\)/);
  assert.match(streaming, /Beobachtet \(\{statusAnzahlenE\.beobachtet\}\)/);
  assert.match(streaming, /type="range"[\s\S]*Anfangsbuchstaben filtern/);
  assert.match(streaming, /Jahrzehnt · ±10 Jahre/);
  assert.match(streaming, /name="Mein Programm"[\s\S]*optionen=\{dekadenP\}/);
  assert.match(streaming, /kd-kompakt kd-streaming-werkzeuge[\s\S]*kd-streamfilter-knopf/);
  assert.match(streaming, /kd-streamfilter-gruppe kd-streamfilter-genre/);
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

check("Blog-Datenwerkzeuge bleiben mobil verborgen", () => {
  assert.match(lies("./src/tabs/BlogTab.jsx"), /className="kd-blog-daten kd-nur-desktop"/);
  assert.match(lies("./src/index.css"), /@media \(max-width: 760px\) \{ \.kd-nur-desktop \{ display: none !important; \} \}/);
});

check("Blog-Bearbeitung und versteckte Modi tragen die kurzen neuen Namen", () => {
  const blog = lies("./src/tabs/BlogTab.jsx");
  const daten = lies("./src/tabs/DatenTab.jsx");
  assert.match(blog, /vorlage \? "Speichern" : "Erstellen"/);
  assert.doesNotMatch(blog, /Speichern & neu abgleichen/i);
  assert.match(daten, /eggZiel === "showa" \? "Classix" : "Schon kuhl"/);
  assert.doesNotMatch(daten, /Back to the Roots|Dauerburner/);
});

check("Icon-only Lösch- und Schließen-Aktionen sind zugänglich beschriftet", () => {
  assert.match(lies("./src/tabs/KinoTab.jsx"), /aria-label="Kinosuche leeren"/);
  assert.match(lies("./src/tabs/MediathekTab.jsx"), /aria-label="Mediatheksuche leeren"/);
  assert.match(lies("./src/tabs/BlogTab.jsx"), /aria-label=\{`Referenz \$\{i \+ 1\} entfernen`\}/);
});

console.log(`kartenlayout_test: ${ok} Checks bestanden.`);
