import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  passtInJahrzehntMitKulanz,
  sortiereStreamingTitel,
  streamingJahrzehntBereich,
  streamingJahrzehntLabel,
} from "./src/lib/streamingSort.js";

let checks = 0;
function check(name, callback) {
  callback();
  checks += 1;
  console.log(`✓ ${name}`);
}
const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = source("./src/App.jsx");
const kino = source("./src/tabs/KinoTab.jsx");
const streaming = source("./src/tabs/StreamingTab.jsx");
const navigation = source("./src/components/AppNavigation.jsx");
const jahrzehntFilter = streaming.match(/function JahrzehntFilter[\s\S]*?\n}\n\nexport function StreamingTab/)?.[0] || "";

check("U-01: Jahrzehnte sind ohne Jahrhundert-Ambiguität beschriftet", () => {
  assert.equal(streamingJahrzehntLabel(1920), "1920er");
  assert.equal(streamingJahrzehntLabel(2020), "2020er");
  assert.deepEqual(streamingJahrzehntBereich(2020), {
    von: 2018, bis: 2032, label: "2018–2032",
  });
  assert.equal(passtInJahrzehntMitKulanz(2018, 2020), true);
  assert.equal(passtInJahrzehntMitKulanz(2032, 2020), true);
  assert.equal(passtInJahrzehntMitKulanz(2033, 2020), false);
});

check("U-01: Jahr aufsteigend stellt fehlende Jahre ans Ende", () => {
  assert.deepEqual(
    sortiereStreamingTitel([
      { titel: "Ohne Jahr", jahr: null },
      { titel: "Neuer", jahr: 2001 },
      { titel: "Älter", jahr: 1989 },
    ], "jahr", "auf").map((entry) => entry.titel),
    ["Älter", "Neuer", "Ohne Jahr"],
  );
});

check("U-01: beide Jahrzehntregler erzwingen Jahr aufsteigend", () => {
  assert.match(streaming, /const aendereDekadeP = \(wert\) => \{[\s\S]*?setSortP\("jahr"\);[\s\S]*?setSortRichtungP\("auf"\);[\s\S]*?\};/);
  assert.match(streaming, /const aendereDekadeE = \(wert\) => \{[\s\S]*?setSortE\("jahr"\);[\s\S]*?setSortRichtungE\("auf"\);[\s\S]*?\};/);
  assert.match(streaming, /wert=\{dekadeP\}[\s\S]*?onChange=\{aendereDekadeP\}/);
  assert.match(streaming, /wert=\{dekadeE\}[\s\S]*?onChange=\{aendereDekadeE\}/);
});

check("Follow-up 5: die leere Kino-Datumsauswahl heißt Datum", () => {
  assert.match(kino, /<select aria-label="Datum im Kinoprogramm"[\s\S]*?<option value="">Datum<\/option>/);
  assert.doesNotMatch(kino, /<select aria-label="Datum im Kinoprogramm"[\s\S]*?<option value="">Alle Programmtage<\/option>/);
  assert.match(kino, /programmFilterStatus \|\| "Alle Programmtage und Kinos"/);
});

check("Follow-up 6: Jahrzehntwert bleibt kompakt und ohne Alle-Button", () => {
  assert.match(jahrzehntFilter, /<strong aria-live="polite">\{bereich \? streamingJahrzehntLabel\(wert\) : "Alle"\}<\/strong>/);
  assert.doesNotMatch(jahrzehntFilter, /<button[^>]*>Alle<\/button>/);
  assert.match(jahrzehntFilter, /aria-valuetext=\{bereich \? `\$\{Number\(wert\)\}er: \$\{bereich\.von\} bis \$\{bereich\.bis\}` : "Alle Jahrzehnte"\}/);
  assert.match(streaming, /function AlphabetFilter[\s\S]*?<button type="button" onClick=\{\(\) => onChange\(null\)\} disabled=\{!wert\}>Alle<\/button>/);
});

check("U-05/D-05: nur der Streaming-Key entdecken heißt sichtbar Alles", () => {
  assert.match(streaming, /\{ id: "entdecken", label: "Alles"/);
  assert.match(navigation, /\{ id: "blog", label: "Entdecken"/);
  assert.doesNotMatch(navigation, /\{ id: "blog", label: "Alles"/);
});

check("U-12: Haupt-Entdecken und Mein Programm laden beim Tab- oder Kontowechsel keinen Vollkatalog", () => {
  assert.doesNotMatch(app, /useEffect\(\(\) => \{ if \(tab === "(?:streaming|blog)"\) void ladeStreamingDateien\(true\)/);
  assert.match(app, /ladeStreamingDateien\(false\)/);
  assert.doesNotMatch(app, /tab === "streaming" \|\| tab === "blog"/);
  assert.doesNotMatch(app, /tabRef\.current === "streaming" \|\| tabRef\.current === "blog"/);
});

check("U-12: Alles, globale Suche und Streaming-Sprung behalten den Vollkatalog", () => {
  assert.match(streaming, /naechsteAnsicht === "entdecken"[\s\S]*?onAllesKatalogLaden\?\.\(\)/);
  assert.match(app, /onAllesKatalogLaden=\{\(\) => ladeStreamingDateien\(true\)\}/);
  assert.match(app, /starteGlobaleSuche[\s\S]*?ladeStreamingDateienRef\.current\?\.\(true\)/);
  assert.match(app, /springeZuStreaming[\s\S]*?ladeStreamingDateienRef\.current\?\.\(true\)/);
});

console.log(`\n${checks}/${checks} C2-Vertragsprüfungen bestanden.`);
