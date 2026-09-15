import assert from "node:assert/strict";
import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";
import { createEntdeckenRecommendations, webDiscoveryFeedCards } from "./src/lib/entdeckenUi.js";
import { currentCinemaDiscoveryCandidates, reconcileCinemaDiscoveryCandidates } from "./src/lib/entdeckenProjection.js";
import { createEntdeckenPin, normalizeEntdeckenPins, resolveEntdeckenPins, toggleEntdeckenPin } from "./src/lib/entdeckenPins.js";
import { validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";

const NOW = new Date("2026-09-15T12:00:00+02:00");
const chart = ENTDECKEN_MARKET_POOL_50.items.find((item) => item.availability.market === "cinema");
const feed = {
  ...ENTDECKEN_MARKET_POOL_50,
  items: ENTDECKEN_MARKET_POOL_50.items.map((item) => item === chart
    ? { ...item, title: "Cars (20. Jubiläum)", releaseYear: 2006, externalIds: {} } : item),
};
assert.equal(validateWebDiscoveryFeed(feed).ok, true);
const film = { film_at_id: "95001", t: "Aktueller Film", j: 2026, g: ["Drama"],
  b: "Beschreibung aus dem Kinoprogramm.", z: ["2026-09-15T20:00:00+02:00"] };
const program = { filme: [film] };
const input = { streamingEntdecken: { region: "AT", titel: [] }, master: [], profile: {},
  selectedServices: [], webDiscoveryFeed: feed, program, now: NOW, selectionDay: "2026-09-15", factsSnapshot: {} };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`✓ ${name}`); }

check("Cars-Jubiläum ohne laufende Vorstellung verschwindet; aktueller Programmfilm füllt nach", () => {
  const result = createEntdeckenRecommendations(input);
  assert.deepEqual(result.popularPool.map((row) => row.title), [film.t]);
  assert.equal(result.popularPool[0].popularity, undefined);
  assert.equal(createEntdeckenPin(result.popularPool[0], 1).pinId, "film_at:95001");
  assert.deepEqual(webDiscoveryFeedCards({ webDiscoveryFeed: feed, program, now: NOW, factsSnapshot: {} })
    .filter((row) => row.availability.market === "cinema"), []);
});

check("Fehlendes, abgelaufenes, inzwischen verfallenes und archiviertes Programm bestätigt keine Kinocharts", () => {
  for (const overrides of [
    { program: null }, { programInfo: { abgelaufen: true } },
    { programInfo: { gueltigBis: NOW.getTime() - 1 } },
    { programInfo: { gueltigBis: NOW.toISOString() } },
    { program: { ...program, status: { archiviert: true } } },
    { program: { ...program, archiviert: true } },
    { program: { filme: [{ ...film, z: ["2026-09-15T09:00:00+02:00"] }] } },
    { program: { filme: [{ ...film, z: [] }] } },
  ]) assert.deepEqual(createEntdeckenRecommendations({ ...input, ...overrides }).popularPool, []);
});

const matchedFeed = { ...feed, items: feed.items.map((item) => item.sourceItemId === chart.sourceItemId
  ? { ...item, title: film.t, releaseYear: film.j } : item) };
const matchedInput = { ...input, webDiscoveryFeed: matchedFeed };
check("Bestätigter Chartfilm erhält genau eine Karte mit Programmidentität und unverändertem Chartbeleg", () => {
  const rows = createEntdeckenRecommendations(matchedInput).popularPool;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetId, "film-at:95001");
  assert.equal(rows[0].availabilityConfirmed, true);
  assert.equal(rows[0].program, film);
  assert.deepEqual(rows[0].popularity, chart.popularity);
  assert.equal(rows[0].description, film.b);
  const personal = createEntdeckenRecommendations({ ...matchedInput,
    profile: { signale: [{ art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 4 }] },
  }).personal;
  assert.equal(personal.length, 1);
  assert.ok(personal[0].reasons.includes("Profil: Drama"));
  assert.equal(createEntdeckenPin(personal[0], 1).ids.film_at, "95001");
});

check("Titelpin bleibt nach Speichern lesbar und öffnet den aktuellen Kinofilm", () => {
  const entry = createEntdeckenRecommendations(matchedInput).popularPool[0];
  const pins = normalizeEntdeckenPins(JSON.parse(JSON.stringify(toggleEntdeckenPin([], entry, 1))));
  assert.equal(pins.length, 1);
  const recommendations = webDiscoveryFeedCards({ webDiscoveryFeed: matchedFeed, program, now: NOW, factsSnapshot: {} });
  const resolved = resolveEntdeckenPins(pins, { recommendations });
  assert.equal(resolved.resolved[0].destination, "kino");
  assert.equal(resolved.resolved[0].target.programm_ref, "95001");
  const known = resolveEntdeckenPins(pins, { recommendations,
    cinema: [{ titel: film.t, jahr: film.j, type: "film", programm_ref: "95001", film_ref: 42 }],
  });
  assert.equal(known.resolved[0].target.film_ref, 42);
  assert.deepEqual(toggleEntdeckenPin(pins, entry, 2), []);
  const gone = resolveEntdeckenPins(pins, { recommendations: webDiscoveryFeedCards({
    webDiscoveryFeed: matchedFeed, program: { filme: [] }, now: NOW, factsSnapshot: {},
  }) });
  assert.deepEqual(gone.resolved, []);
  assert.deepEqual(gone.discardedPinIds, []);
  assert.deepEqual(gone.pendingPinIds, [pins[0].pinId]);
});

check("Gesehener Film bleibt auch mit korrigiertem Mediathektitel aus den Empfehlungen", () => {
  assert.deepEqual(createEntdeckenRecommendations({ ...matchedInput, master: [{
    film_at_id: "95001", titel: "Mein eigener Titel", jahr: 2026, typ: "film", gesehen: true,
  }] }).popularPool, []);
});

const candidates = currentCinemaDiscoveryCandidates({ program, now: NOW });
const candidate = candidates[0];
const source = { title: film.t, year: 2026, type: "film", availability: chart.availability };
check("Remake, Serie, Titelpräfix und fehlendes Jahr werden nicht als derselbe Film bestätigt", () => {
  for (const variant of [{ year: 2006 }, { type: "series" }, { title: "Aktueller" }, { year: null }]) {
    assert.deepEqual(reconcileCinemaDiscoveryCandidates([{ ...source, ...variant }], candidates), []);
  }
});
check("Exakter Originaltitel darf matchen, widersprechende IDs und mehrdeutige Werke bleiben blockiert", () => {
  const original = reconcileCinemaDiscoveryCandidates([{ ...source, title: "Original Title" }],
    [{ ...candidate, originalTitle: "Original Title" }]);
  assert.equal(original[0].filmAtId, "95001");
  assert.deepEqual(reconcileCinemaDiscoveryCandidates([{ ...source, externalIds: { imdb: "tt0000001" } }],
    [{ ...candidate, externalIds: { imdb: "tt0000002" } }]), []);
  assert.deepEqual(reconcileCinemaDiscoveryCandidates([source],
    [candidate, { ...candidate, targetId: "film-at:95002", filmAtId: "95002" }]), []);
  assert.deepEqual(currentCinemaDiscoveryCandidates({
    program: { filme: [film, { ...film, film_at_id: "95002" }] }, now: NOW,
  }), []);
});
check("Streamingauswahl bleibt erhalten, auch wenn keine Kinoempfehlung belegbar ist", () => {
  const rows = createEntdeckenRecommendations({ ...input, program: null, selectedServices: ["Netflix"] }).popularPool;
  const expected = feed.items.filter((row) => row.availability.service === "Netflix");
  assert.equal(rows.length, expected.length);
  assert.ok(rows.every((row) => row.availability.market === "streaming" && row.services.includes("Netflix")));
});

console.log(`\n${checks}/${checks} Kino-Verfügbarkeit und Pins bestanden.`);
