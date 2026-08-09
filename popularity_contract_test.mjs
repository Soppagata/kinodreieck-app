import assert from "node:assert/strict";
import fs from "node:fs";
import {
  POPULARITY_MATCH_STATUSES,
  validatePopularitySource,
  mayRunPopularitySource,
  popularityItemKey,
  matchPopularityItem,
  mayDisplayPopularityItem,
} from "./src/lib/popularityContracts.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const fixture = JSON.parse(fs.readFileSync(new URL("./src/data/popularity_phase1_fixtures.json", import.meta.url), "utf8"));

check("Matchzustände sind geschlossen", () => {
  assert.deepEqual(POPULARITY_MATCH_STATUSES, ["matched", "unmatched", "ambiguous", "blocked"]);
});

check("Fixturequelle ist valide, abgeschaltet und niemals ausführbar", () => {
  assert.equal(validatePopularitySource(fixture.source).ok, true);
  assert.equal(mayRunPopularitySource(fixture.source, { featureEnabled: false }), false);
  assert.equal(mayRunPopularitySource(fixture.source, { featureEnabled: true }), false);
});

check("Eine Quelle kann nur mit Rechten, Attribution, Source- und Featureflag laufen", () => {
  const approved = {
    ...fixture.source, sourceId: "provider:approved:test", mode: "api", rightsStatus: "approved",
    enabled: true, attributionApproved: true,
  };
  assert.equal(validatePopularitySource(approved).ok, true);
  assert.equal(mayRunPopularitySource(approved, { featureEnabled: false }), false);
  assert.equal(mayRunPopularitySource(approved, { featureEnabled: true }), true);
  assert.equal(mayRunPopularitySource({ ...approved, rightsStatus: "blocked" }, { featureEnabled: true }), false);
  assert.equal(mayRunPopularitySource({ ...approved, attributionApproved: false }, { featureEnabled: true }), false);
});

check("Starke externe ID matcht deterministisch trotz anderem Anzeigetitel", () => {
  const item = fixture.items.find((entry) => entry.case === "matched");
  const match = matchPopularityItem(item, fixture.catalog);
  assert.deepEqual(match, { status: "matched", targetId: "fixture:target:pop-work-01", basis: "external-id" });
});

check("Mehrere starke IDs müssen auf dasselbe Werk zeigen", () => {
  const item = {
    ...fixture.items[0], externalIds: { watchmode: "fixture-watchmode-01", imdb: "fixture-imdb-01" },
  };
  assert.equal(matchPopularityItem(item, fixture.catalog).basis, "multiple-external-ids");
  const conflictingCatalog = [
    ...fixture.catalog,
    { targetId: "fixture:target:conflict", title: "Konflikt", year: 2026, type: "movie", externalIds: { imdb: "fixture-imdb-conflict" } },
  ];
  const conflict = matchPopularityItem({
    ...item, externalIds: { watchmode: "fixture-watchmode-01", imdb: "fixture-imdb-conflict" },
  }, conflictingCatalog);
  assert.equal(conflict.status, "blocked");
  assert.equal(conflict.basis, "external-id-conflict");
  const incomplete = matchPopularityItem({
    ...item, externalIds: { watchmode: "fixture-watchmode-01", imdb: "fixture-imdb-unknown" },
  }, fixture.catalog);
  assert.equal(incomplete.status, "blocked");
  assert.equal(incomplete.basis, "external-id-incomplete");
});

check("Exakt normalisierter Titel plus Jahr/Typ matcht nur eindeutig", () => {
  const item = { title: "Beispielwerk Eins!", year: 2026, type: "movie", externalIds: {} };
  const match = matchPopularityItem(item, fixture.catalog);
  assert.equal(match.status, "matched");
  assert.equal(match.basis, "exact-title-year-type");
  assert.equal(matchPopularityItem({ ...item, title: "Beispielwerk" }, fixture.catalog).status, "unmatched");
  assert.equal(matchPopularityItem(item, [...fixture.catalog, { ...fixture.catalog[0], targetId: "fixture:target:duplicate" }]).status, "ambiguous");
});

check("Unaufgelöste und gesperrte Items bleiben unsichtbar", () => {
  const unmatched = fixture.items.find((entry) => entry.case === "unmatched");
  const blocked = fixture.items.find((entry) => entry.case === "blocked");
  assert.equal(matchPopularityItem(unmatched, fixture.catalog).status, "unmatched");
  assert.equal(matchPopularityItem(blocked, fixture.catalog).status, "blocked");
  assert.equal(mayDisplayPopularityItem(unmatched, { status: "unmatched" }), false);
  assert.equal(mayDisplayPopularityItem(blocked, { status: "blocked" }), false);
});

check("Sichtbarkeit verlangt Match, Quellenbeschriftung und bestätigte AT-Verfügbarkeit", () => {
  const item = fixture.items[0];
  const match = matchPopularityItem(item, fixture.catalog);
  assert.equal(mayDisplayPopularityItem(item, match), true);
  assert.equal(mayDisplayPopularityItem({ ...item, atAvailabilityConfirmed: false }, match), false);
  assert.equal(mayDisplayPopularityItem({ ...item, sourceLabel: "" }, match), false);
  assert.equal(mayDisplayPopularityItem({ ...item, region: "US" }, match), false);
});

check("Item-Key dedupliziert Quelle, Region, Dienst, Chartart, Zeitraum und Rang", () => {
  const item = fixture.items[0];
  assert.equal(popularityItemKey(item), popularityItemKey({ ...item }));
  assert.notEqual(popularityItemKey(item), popularityItemKey({ ...item, rank: 2 }));
  assert.notEqual(popularityItemKey(item), popularityItemKey({ ...item, periodEnd: "2026-08-16" }));
});

check("Popularityfixtures enthalten weder URL noch Providerpayload", () => {
  const source = fs.readFileSync(new URL("./src/data/popularity_phase1_fixtures.json", import.meta.url), "utf8");
  assert.equal(fixture.meta.providerPayload, false);
  assert.doesNotMatch(source, /https?:\/\//i);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("POPULARITY-CONTRACT-TEST BESTANDEN");
