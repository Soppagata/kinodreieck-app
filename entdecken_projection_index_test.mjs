import assert from "node:assert/strict";
import {
  createEntdeckenRecommendations,
  localRecommendationCandidates,
  publicDiscoveryCandidates,
  selectStablePopularCards,
} from "./src/lib/entdeckenUi.js";
import { validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";

let checks = 0;
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }

const DAY = "2026-09-13";
const netflixItem = (index, mediaType) => ({
  title: `Stream ${mediaType === "film" ? "Film" : "Serie"} ${String(index).padStart(2, "0")}`,
  sourceItemId: `${mediaType === "film" ? "f" : "s"}_stream-${String(index).padStart(2, "0")}`,
  sourceId: "chart:netflix-weekly-at",
  sourceLabel: "Netflix Top 10 Österreich",
  mediaType,
  genres: [index % 2 ? "Drama" : "Science-Fiction"],
  availability: { region: "AT", market: "streaming", service: "Netflix", licenseTypes: ["SVOD"] },
  popularity: { metric: "weekly-country-rank", rank: index, measuredOn: "2026-09-13", value: null },
  sourceUrl: `https://www.netflix.com/tudum/top10/austria/${mediaType === "film" ? "films" : "tv"}`,
  fetchedAt: "2026-09-13T08:00:00.000Z",
});
const cinemaItem = (index) => ({
  title: `Kinotitel ${String(index).padStart(2, "0")}`,
  sourceItemId: `f_cinema-${String(index).padStart(2, "0")}`,
  sourceId: "chart:oefi-weekend-at",
  sourceLabel: "Österreichisches Filminstitut",
  mediaType: "film",
  genres: ["Drama"],
  availability: { region: "AT", market: "cinema", service: null, licenseTypes: [] },
  popularity: { metric: "weekend-admissions", rank: index, measuredOn: "2026-09-13", value: 1000 - index },
  sourceUrl: "https://filminstitut.at/charts",
  fetchedAt: "2026-09-13T08:00:00.000Z",
});

const items = [
  ...Array.from({ length: 15 }, (_, index) => cinemaItem(index + 1)),
  ...Array.from({ length: 5 }, (_, index) => netflixItem(index + 1, "film")),
  ...Array.from({ length: 5 }, (_, index) => netflixItem(index + 1, "series")),
];
const annotations = items.map((item, index) => ({
  sourceItemId: item.sourceItemId,
  qid: `Q${1000 + index}`,
  mediaType: item.mediaType,
  releaseYear: 2000 + index,
  externalIds: index === 15
    ? { imdb: "tt1000015", tmdb: "5015" }
    : index === 16 ? { imdb: "tt1000016", tmdb: "5016" }
      : index === 19 ? { imdb: "tt1000019" }
        : index === 21 ? { imdb: "tt1000021" }
          : index === 22 ? { imdb: "tt1000022" } : {},
  resolvedAt: "2026-09-13T08:05:00.000Z",
}));
const feed = {
  format: 6,
  feedId: "public:weekly-market-mix-at",
  region: "AT",
  sourceId: "chart:market-mix-at",
  sourceIds: ["chart:netflix-weekly-at", "chart:oefi-weekend-at"],
  isoWeek: "2026-W37",
  refreshedOn: DAY,
  validUntil: "2026-09-19",
  items,
  annotations,
};
assert.equal(validateWebDiscoveryFeed(feed).ok, true);

const facts = new Map(annotations.map((entry) => [entry.sourceItemId, entry]));
const itemAt = (index) => items[index];
const factAt = (index) => facts.get(itemAt(index).sourceItemId);
const catalogRows = [
  { watchmode_id: 701, titel: "Abweichender starker Titel", jahr: factAt(15).releaseYear, typ: "movie",
    imdb_id: factAt(15).externalIds.imdb, tmdb_id: factAt(15).externalIds.tmdb,
    dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 702, titel: itemAt(16).title, jahr: factAt(16).releaseYear, typ: "movie",
    imdb_id: factAt(16).externalIds.imdb, tmdb_id: "9999", dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 703, titel: itemAt(17).title, jahr: factAt(17).releaseYear, typ: "movie",
    dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 704, titel: `${itemAt(17).title}!`, jahr: factAt(17).releaseYear, typ: "film",
    dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 705, titel: `${itemAt(18).title}!`, jahr: factAt(18).releaseYear, typ: "movie",
    dienste: ["Netflix"], genres: ["Science-Fiction"], beschreibung: "Eine Reise durch den Weltraum." },
  { watchmode_id: 706, titel: itemAt(19).title, jahr: factAt(19).releaseYear, typ: "movie",
    imdb_id: "tt9999999", dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 707, titel: itemAt(20).title, jahr: factAt(20).releaseYear + 1, typ: "tv_series",
    dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 708, titel: "!!!", jahr: factAt(21).releaseYear, typ: "tv_series",
    imdb_id: factAt(21).externalIds.imdb, dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 709, titel: "Zu ferner Namespacehalter", jahr: new Date().getUTCFullYear() + 11, typ: "tv_series",
    imdb_id: "tt9000001", dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 710, titel: "Gültiger Namespacehalter", jahr: 2020, typ: "tv_series",
    imdb_id: "tt9000002", dienste: ["Netflix"], genres: ["Drama"] },
  { watchmode_id: 711, titel: itemAt(22).title, jahr: factAt(22).releaseYear, typ: "tv_series",
    dienste: ["Netflix"], genres: ["Drama"] },
];
const discover = { region: "AT", stand: "2026-09-13T00:00:00.000Z", titel: [] };
const known = { region: "AT", stand: "2026-09-13T00:00:00.000Z", titel: catalogRows };
const baseInput = {
  streamingEntdecken: discover,
  streamingKnown: known,
  selectedServices: ["Netflix"],
  master: [],
  profile: { beschaedigt: true },
  webDiscoveryFeed: feed,
  selectionDay: DAY,
  now: new Date("2026-09-13T10:00:00.000Z"),
};

function legacyPopularReference(input) {
  const catalogCandidates = localRecommendationCandidates(input.streamingEntdecken, {
    streamingKnown: input.streamingKnown,
    selectedServices: [],
    entdeckenStatus: input.entdeckenStatus || {},
    includeSeenForMatching: true,
  });
  const direct = publicDiscoveryCandidates({
    webDiscoveryFeed: input.webDiscoveryFeed,
    master: input.master,
    catalogCandidates,
    selectedServices: input.selectedServices,
    includeSeen: true,
    requireMetadata: false,
  }).filter((candidate) => !candidate.seen && candidate.availability?.market !== "cinema");
  return selectStablePopularCards(direct, {
    webDiscoveryFeed: input.webDiscoveryFeed,
    selectionDay: input.selectionDay,
    limit: direct.length,
  });
}

check("Indexprojektion bleibt bytegleich zum bisherigen Vollkatalogpfad", () => {
  const expected = legacyPopularReference(baseInput);
  const actual = createEntdeckenRecommendations(baseInput);
  assert.equal(JSON.stringify(actual.popularPool), JSON.stringify(expected));
  assert.equal(actual.diagnostics.candidates, 25);
  const bySource = new Map(actual.popularPool.map((entry) => [entry.sourceItemId, entry]));
  assert.equal(bySource.get(itemAt(15).sourceItemId).targetId, "watchmode:701");
  assert.equal(bySource.get(itemAt(16).sourceItemId).availabilityConfirmed, false);
  assert.match(bySource.get(itemAt(17).sourceItemId).targetId, /^market:/);
  assert.equal(bySource.get(itemAt(18).sourceItemId).targetId, "watchmode:705");
  assert.equal(bySource.get(itemAt(19).sourceItemId).availabilityConfirmed, false);
  assert.equal(bySource.get(itemAt(20).sourceItemId).availabilityConfirmed, false);
  assert.equal(bySource.get(itemAt(21).sourceItemId).targetId, "watchmode:708");
  assert.equal(bySource.get(itemAt(22).sourceItemId).availabilityConfirmed, false);
});

check("Dienste und frischer Seen-Status bleiben außerhalb des neutralen Cache", () => {
  const seen = createEntdeckenRecommendations({ ...baseInput, entdeckenStatus: { 701: "gesehen" } });
  assert.ok(!seen.popularPool.some((entry) => entry.targetId === "watchmode:701"));
  const fresh = createEntdeckenRecommendations({ ...baseInput, entdeckenStatus: {} });
  assert.ok(fresh.popularPool.some((entry) => entry.targetId === "watchmode:701"));
  const otherService = createEntdeckenRecommendations({ ...baseInput, selectedServices: ["Prime Video"] });
  assert.ok(otherService.popularPool.every((entry) => entry.availability.market === "cinema"));
});

check("Masterbeschreibungen und frische Profile verwenden weiterhin den strengen Abgleich", () => {
  const master = [{
    id: "rated", watchmode_id: 900, titel: "Bibliotheksfilm", jahr: 2010, typ: "film",
    bewertung: { wie: 4, was: 4, warum: 4 }, genre: [],
  }];
  const describedKnown = {
    ...known,
    titel: [...known.titel, {
      watchmode_id: 900, titel: "Bibliotheksfilm", jahr: 2010, typ: "movie",
      dienste: ["Netflix"], beschreibung: "Eine Expedition durch den Weltraum.",
    }],
  };
  const withoutProfile = createEntdeckenRecommendations({
    ...baseInput, streamingKnown: describedKnown, master, profile: { signale: [] },
  });
  assert.ok(withoutProfile.personal.some((entry) => entry.reasons.some((reason) => /Mediathek/u.test(reason))));
  const withProfile = createEntdeckenRecommendations({
    ...baseInput, streamingKnown: describedKnown, master: [],
    profile: { signale: [{ art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 4 }] },
  });
  assert.ok(withProfile.personal.some((entry) => entry.reasons.some((reason) => reason.startsWith("Profil:"))));
});

check("Identische Snapshotreferenzen scannen irrelevante Rohzeilen nur einmal", () => {
  let rawTitleReads = 0;
  const irrelevant = {
    watchmode_id: 999001, jahr: 1988, typ: "movie", dienste: ["Netflix"], genres: [],
    get titel() { rawTitleReads += 1; return "Nicht im Feed"; },
  };
  const countedKnown = { region: "AT", stand: known.stand, titel: [...known.titel, irrelevant] };
  const input = { ...baseInput, streamingKnown: countedKnown };
  createEntdeckenRecommendations(input);
  const afterFirst = rawTitleReads;
  assert.ok(afterFirst > 0);
  createEntdeckenRecommendations({
    ...input,
    profile: { signale: [{ art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 3 }] },
    entdeckenStatus: { 701: "gesehen" },
  });
  assert.equal(rawTitleReads, afterFirst);
});

console.log(`\n${checks}/${checks} Entdecken-Projektionsindex-Checks bestanden.`);
