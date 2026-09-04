import assert from "node:assert/strict";
import fs from "node:fs";

import {
  mergePersonalMasterEntry,
  projectRecentPersonalEntries,
  stampPersonalMasterEntry,
} from "./src/lib/personalEntryChronology.js";
import { rankCatalogTitleMatches } from "./src/lib/catalogTitleSearch.js";
import { projectCompactGlobalResults } from "./src/lib/globalSearchProjection.js";
import { parseAnfrage, sucheEntdecken, sucheFinder, sucheKino } from "./src/lib/finder.js";

const checks = [];
const check = async (name, run) => {
  try {
    await run();
    checks.push(name);
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
};

const obsession = {
  id: "obsession-2026",
  titel: "Obsession - Du sollst mich lieben",
  originaltitel: "Obsession",
  jahr: 2026,
  typ: "film",
  quelle: "dvd",
  genre: ["thriller"],
  bewertung: { wie: 2, was: 2, warum: 2 },
};
const master = [
  obsession,
  { ...obsession, id: "possession-1981", titel: "Possession", originaltitel: "Possession", jahr: 1981 },
  { ...obsession, id: "rache-2005", titel: "Lady Vengeance", originaltitel: "Sympathy for Lady Vengeance", jahr: 2005 },
];
const emptyContext = { kinoMatches: { matched: [], rest: [] }, streamingBekannt: { titel: [] } };

await check("Einzel- und Batchanlagen erhalten den echten lokalen Zeitpunkt statt Fremddaten", () => {
  const at = "2026-09-04T18:30:00.000Z";
  const stamped = [
    stampPersonalMasterEntry({ id: "a", erstellt_am: "1999-01-01T00:00:00Z" }, at),
    stampPersonalMasterEntry({ id: "b" }, at),
  ];
  assert.deepEqual(stamped.map((entry) => entry.erstellt_am), [at, at]);
});

await check("Bearbeitung bewahrt erstellt_am unveränderlich und erfindet keines für Legacy", () => {
  const existing = { id: "a", titel: "Alt", erstellt_am: "2026-09-04T18:30:00.000Z" };
  assert.deepEqual(mergePersonalMasterEntry(existing, {
    titel: "Neu", erstellt_am: "2099-01-01T00:00:00Z",
  }), { ...existing, titel: "Neu" });
  assert.equal("erstellt_am" in mergePersonalMasterEntry({ id: "legacy" }, {
    titel: "Legacy neu", erstellt_am: "2099-01-01T00:00:00Z",
  }), false);
});

await check("Zuletzt hinzugefügt sortiert Master, Must-Watch und Merkliste nach belegten Zeiten", () => {
  const recent = projectRecentPersonalEntries({
    master: [{ ...obsession, erstellt_am: "2026-09-04T18:35:00Z" }],
    mustwatch: [{ id: "mw-a", titel: "Must", erstellt_am: "2026-09-04T18:34:00Z" }],
    merkliste: [{ watchmode_id: 77, titel: "Merk", hinzugefuegt_am: "2026-09-04T18:33:00Z" }],
  });
  assert.deepEqual(recent.dated.map((entry) => entry.source), ["MASTER", "MUST-WATCH", "MERKLISTE"]);
  assert.equal(recent.dated[0].label, "Obsession - Du sollst mich lieben (2026)");
});

await check("Legacy-Master bleibt getrennt und nutzt nur die stabile Einfügereihenfolge", () => {
  const recent = projectRecentPersonalEntries({
    master: [{ id: "alt", titel: "Alt" }, { id: "neu", titel: "Obsession" }],
  });
  assert.deepEqual(recent.dated, []);
  assert.deepEqual(recent.legacyMaster.map((entry) => entry.ref), ["neu", "alt"]);
  assert.equal("time" in recent.legacyMaster[0], false);
});

await check("Obsession wird per ID, Volltitel, Originaltitel und markantem Titelwort gefunden", () => {
  for (const query of [
    "obsession-2026", "Obsession - Du sollst mich lieben", "Obsession",
  ]) {
    assert.equal(parseAnfrage(query, master).titel[0]?.id, obsession.id, query);
  }
});

await check("Ein-, Doppel- und Vertauschfehler bleiben eindeutig bei Obsession", () => {
  for (const query of ["Obsesion", "Obsessiion", "Obsesison"]) {
    const result = rankCatalogTitleMatches(query, master);
    assert.equal(result.length, 1, query);
    assert.equal(result[0].item.id, obsession.id, query);
    assert.equal(parseAnfrage(query, master).titel[0]?.id, obsession.id, query);
  }
});

await check("Bewusster Nichtmatch und mehrdeutiger Tippfehler werden nicht geraten", () => {
  assert.deepEqual(rankCatalogTitleMatches("Obsidian", master), []);
  assert.deepEqual(rankCatalogTitleMatches("Kamea", [
    { id: "kamera", titel: "Kamera" },
    { id: "kamela", titel: "Kamela" },
  ]), []);
});

await check("Gleichnamige Titel verschiedener Jahre und Medientypen bleiben getrennt", () => {
  const sameName = [
    { id: "signal-film", titel: "Signal", jahr: 2024, typ: "film" },
    { id: "signal-serie", titel: "Signal", jahr: 2026, typ: "serie" },
  ];
  assert.deepEqual(parseAnfrage("Signal", sameName).titel.map((entry) => entry.id), [
    "signal-film", "signal-serie",
  ]);
});

await check("Finder-Masterranking führt Obsession als echten ersten Kontotreffer", () => {
  const sig = parseAnfrage("Obsesion", master);
  const result = sucheFinder(sig, { master, ...emptyContext });
  assert.equal(result[0]?.film.id, obsession.id);
  assert.equal(result[0]?.gruende.includes("titel-treffer"), true);
});

await check("Kino und Streaming verwenden denselben Originaltitel-/Tippfehlervertrag", () => {
  const kino = sucheKino(parseAnfrage("Sympathy for Lady Vengeance", []), [{
    id: "kino-rache", t: "Lady Vengeance", ot: "Sympathy for Lady Vengeance", j: 2005, g: [],
  }]);
  assert.equal(kino[0]?.pf.id, "kino-rache");
  const streaming = sucheEntdecken(parseAnfrage("Obsesion", []), { titel: [{
    watchmode_id: 91, titel: obsession.titel, originaltitel: obsession.originaltitel, jahr: 2026,
  }] });
  assert.equal(streaming[0]?.watchmode_id, 91);
});

await check("Exakter Fremdbereich schlägt starken Treffer im aktuellen Bereich", () => {
  const result = projectCompactGlobalResults([
    { key: "m-strong", id: "m-strong", titel: "Obsession Chronik", bereich: "mediathek" },
    { key: "s-exact", watchmode_id: 7, titel: "Obsession", bereich: "streaming" },
  ], { query: "Obsession", preferredArea: "mediathek" });
  assert.equal(result.items[0].key, "s-exact");
});

await check("Gleich relevante Topauswahl mischt Bereiche; aktuelle Seite ist nur Start-Tie-Break", () => {
  const all = [
    { key: "m", id: "m", titel: "Signal", bereich: "mediathek" },
    { key: "k", id: "k", titel: "Signal", bereich: "kino" },
    { key: "s", watchmode_id: 1, titel: "Signal", bereich: "streaming" },
    { key: "b", id: "b", titel: "Signal", bereich: "blog" },
  ];
  const result = projectCompactGlobalResults(all, {
    query: "Signal", preferredArea: "streaming", limit: 4,
  });
  assert.deepEqual(result.items.map((item) => item.bereich), [
    "streaming", "mediathek", "kino", "blog",
  ]);
});

await check("Kompakte Projektion verliert aus der Vollmenge nichts", () => {
  const all = Array.from({ length: 8 }, (_, index) => ({
    key: `m-${index}`, id: `m-${index}`, titel: `Semantik ${index}`, bereich: index % 2 ? "kino" : "mediathek",
  }));
  const snapshot = JSON.stringify(all);
  const result = projectCompactGlobalResults(all, { query: "spannend", limit: 3 });
  assert.equal(result.items.length, 3);
  assert.equal(result.gesamt, 8);
  assert.equal(JSON.stringify(all), snapshot);
});

await check("App verdrahtet alle Anlagewege, Unveränderlichkeit und das Auswahl-Navigationsgate", () => {
  const source = fs.readFileSync("src/App.jsx", "utf8");
  assert.ok((source.match(/stampPersonalMasterEntry/g) || []).length >= 6);
  assert.match(source, /mergePersonalMasterEntry\(film, changes\)/);
  assert.match(source, /Mit „Abbrechen“ bleibt die Auswahl vollständig erhalten/);
  assert.match(source, /onSelectionStateChange=\{meldeMediathekAuswahl\}/);
});

await check("Must-Watch, mobile Suche und Touchziele nutzen die gemeinsamen semantischen Verträge", () => {
  const mustwatch = fs.readFileSync("src/components/MustWatchListe.jsx", "utf8");
  const mediathek = fs.readFileSync("src/tabs/MediathekTab.jsx", "utf8");
  const css = fs.readFileSync("src/index.css", "utf8");
  assert.equal((mustwatch.match(/<SelectionControl/g) || []).length, 2);
  assert.doesNotMatch(mustwatch, /<input type="checkbox"/);
  assert.match(mediathek, /kd-mediathek-suchleiste--auswahl/);
  assert.match(mediathek, /\? "Fertig" : "Auswählen"/);
  assert.match(css, /\.kd-selection-control-hitbox[^}]*min-height:44px/);
  assert.match(css, /\.kd-globalsuche \.kd-globalsuche-aktionen button[^}]*min-height:44px/);
  assert.match(css, /\.kd-mediathek-suchleiste--auswahl[^}]*position:sticky/);
});

console.log(`cleanup_c1_test: ${checks.length}/${checks.length} Checks bestanden.`);
