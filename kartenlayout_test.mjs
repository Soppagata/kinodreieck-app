import fs from "node:fs";
import assert from "node:assert/strict";
import { quelleBadges, QUELLEN_KLASSEN } from "./src/lib/quellen.js";

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

check("Dashboard und Kino verwenden dasselbe Kinoticket", () => {
  assert.match(lies("./src/tabs/StartTab.jsx"), /<KinoTicket/);
  assert.match(lies("./src/tabs/KinoTab.jsx"), /<KinoTicket/);
  assert.match(lies("./src/components/ui.jsx"), /export function KinoTicket/);
});

check("Dashboard folgt der festen Startseiten-Reihenfolge", () => {
  const start = lies("./src/tabs/StartTab.jsx");
  const dashboard = start.slice(start.indexOf('<div className="kd-dash-grid">'));
  const positionen = [
    dashboard.indexOf('name="Kino für dich"'),
    dashboard.indexOf("<Wochenplan"),
    dashboard.indexOf('name="Pinboard & Serienradar"'),
    dashboard.indexOf('name="Must-Watch"'),
    dashboard.indexOf('name="Zuletzt hinzugefügt"'),
  ];
  assert.ok(positionen.every((position) => position >= 0));
  assert.deepEqual([...positionen].sort((a, b) => a - b), positionen);
  assert.doesNotMatch(dashboard, /name="Jetzt streambar"/);
});

check("Deine Woche rendert rollierende Kinotickets und verständliche Kalenderaktionen", () => {
  const woche = lies("./src/components/Wochenplan.jsx");
  const css = lies("./src/index.css");
  assert.match(woche, /Heute bis/);
  assert.doesNotMatch(woche, /Vorige Woche|Nächste Woche|Woche \.ics/);
  assert.match(woche, /Die nächsten 7 Tage in den Kalender setzen/);
  assert.match(css, /\.kd-wochen-tag \{[\s\S]*background-color:var\(--kd-leinwand\)/);
  assert.match(css, /\.kd-wochen-ticketstub/);
});

check("Beobachten ist ein eigener Serien-Pin im ausgeklappten Streaming-Eintrag", () => {
  const streaming = lies("./src/tabs/StreamingTab.jsx");
  assert.match(streaming, /className="kd-entdecken-beobachten"/);
  assert.match(streaming, /setzeSerienBeobachtung/);
  assert.match(streaming, /Unabhängig davon, ob du die Serie schon gesehen hast/);
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

check("Icon-only Lösch- und Schließen-Aktionen sind zugänglich beschriftet", () => {
  assert.match(lies("./src/tabs/KinoTab.jsx"), /aria-label="Kinosuche leeren"/);
  assert.match(lies("./src/tabs/MediathekTab.jsx"), /aria-label="Mediatheksuche leeren"/);
  assert.match(lies("./src/tabs/BlogTab.jsx"), /aria-label=\{`Referenz \$\{i \+ 1\} entfernen`\}/);
});

console.log(`kartenlayout_test: ${ok} Checks bestanden.`);
