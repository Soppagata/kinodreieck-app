import assert from "node:assert/strict";
import {
  FLIXPATROL_AT_CHARTS, baueFlixpatrolVorschlaege,
  normalisiereFlixpatrolFakten, uebernehmeFlixpatrolVorschlag,
} from "./src/lib/flixpatrolFacts.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const alien = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
const dune = "ttl_K5H0Bes9dtvkV710raDBpXoK";
const charts = FLIXPATROL_AT_CHARTS.map((spec, index) => ({ ok: true, chart: {
  ...spec, chartDate: "2026-09-09", fetchedAt: "2026-09-09T11:00:00Z", fresh: true,
  items: index === 0 ? [{ sourceId: alien, mediaType: "series", ranking: 1 }]
    : index === 1 ? [{ sourceId: dune, mediaType: "film", ranking: 2 }] : [],
} }));
const titles = { ok: true, items: [
  { sourceId: alien, mediaType: "film", status: "resolved", title: "Alien", releaseYear: 1979,
    imdbId: "tt0078748", tmdbId: "348", description: "Neutraler Text", runtimeMinutes: 117,
    premiere: "1979-05-25", checkedAt: "2026-09-09T11:00:00Z", freshUntil: "2026-09-10T11:00:00Z",
    fresh: true, sourceUrl: "https://flixpatrol.com/title/alien/", genreId: "gen_ignored", keywordId: "key_ignored" },
  { sourceId: dune, mediaType: "film", status: "resolved", title: "Dune", releaseYear: 2021,
    imdbId: null, tmdbId: "438631", description: null, runtimeMinutes: null, premiere: "2021-09-15",
    fresh: false },
] };
const facts = normalisiereFlixpatrolFakten(charts, titles);

check("Titles-Read-Medientyp gewinnt gegen den Chart-Platzhalter", () => {
  assert.equal(facts.find((fact) => fact.sourceId === alien)?.typ, "film");
});
check("Neutrale Fakten enthalten weder Genre- noch Keyword-IDs als Nutzertags", () => {
  assert.equal(Object.hasOwn(facts[0], "genreId"), false);
  assert.equal(Object.hasOwn(facts[0], "keywordId"), false);
});
check("Exakter Titel, Jahr und Typ erzeugen einen überprüfbaren Vorschlag", () => {
  const [candidate] = baueFlixpatrolVorschlaege([{ titel: "Alien", jahr: 1979, typ: "film", beschreibung: "" }], facts);
  assert.equal(candidate.flixpatrolVorschlag.matchedBy, "title-year-type");
  assert.equal(candidate.flixpatrolVorschlag.ergaenzungen.imdb_id, "tt0078748");
  assert.equal(candidate.flixpatrolVorschlag.ergaenzungen.beschreibung, "Neutraler Text");
});
check("Remake, fehlendes Jahr und fehlender Typ bleiben offen", () => {
  const result = baueFlixpatrolVorschlaege([
    { titel: "Dune", jahr: 1984, typ: "film" }, { titel: "Alien", jahr: null, typ: "film" },
    { titel: "Alien", jahr: 1979, typ: null },
  ], facts);
  assert.ok(result.every((entry) => !entry.flixpatrolVorschlag));
});
check("Eigene Werte bleiben bei der Übernahme bytegetreu führend", () => {
  const own = { titel: "Alien", jahr: 1979, typ: "film", imdb_id: "tt0078748", beschreibung: "Eigener Text" };
  const [candidate] = baueFlixpatrolVorschlaege([own], facts);
  const result = uebernehmeFlixpatrolVorschlag(candidate);
  assert.equal(result.imdb_id, own.imdb_id);
  assert.equal(result.beschreibung, own.beschreibung);
  assert.equal(result.flixpatrol_id, alien);
});
check("Abgewählter Vorschlag schreibt keine Fakten", () => {
  const [candidate] = baueFlixpatrolVorschlaege([{ titel: "Alien", jahr: 1979, typ: "film" }], facts);
  const result = uebernehmeFlixpatrolVorschlag({ ...candidate, flixpatrolVorschlag: { ...candidate.flixpatrolVorschlag, ausgewaehlt: false } });
  assert.equal(result.flixpatrol_id, undefined);
  assert.equal(Object.hasOwn(result, "flixpatrolVorschlag"), false);
});

console.log(`flixpatrol_facts_lib_test: ${checks} Checks bestanden.`);
