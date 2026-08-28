import assert from "node:assert/strict";
import { createEntdeckenRecommendations, publicDiscoveryCandidates } from "./src/lib/entdeckenUi.js";
import { matchWebDiscoveryFeed, validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";

let checks = 0;
function check(name, test) { test(); checks += 1; console.log(`✓ ${name}`); }

const fetchedAt = "2026-08-27T02:00:00.000Z";
const items = Array.from({ length: 50 }, (_, index) => {
  const mediaType = index % 2 ? "series" : "film";
  return {
    title: index === 0 ? "Schon gesehen" : `Joyn Kandidat ${String(index + 1).padStart(2, "0")}`,
    sourceItemId: `${mediaType === "film" ? "f" : "s"}_kandidat-${String(index + 1).padStart(3, "0")}`,
    mediaType,
    genres: index === 11 ? [] : index === 2 ? ["Comedy"] : index < 10 ? ["Drama"] : ["Reality"],
    licenseTypes: [index % 3 ? "AVOD" : "SVOD"],
    sourcePosition: Math.floor(index / 2) + 1,
    listDate: "2026-08-27",
    sourceUrl: `https://www.joyn.at/${mediaType === "film" ? "filme" : "serien"}/kandidat-${index + 1}`,
    fetchedAt,
  };
});
const feed = {
  format: 5,
  feedId: "public:weekly-popular-at",
  region: "AT",
  sourceId: "chart:joyn-at",
  isoWeek: "2026-W35",
  refreshedOn: "2026-08-27",
  validUntil: "2026-09-02",
  items,
  annotations: [{
    sourceItemId: items[0].sourceItemId,
    qid: "Q122",
    mediaType: "film",
    releaseYear: 2024,
    externalIds: {},
    resolvedAt: "2026-08-27T02:01:00.000Z",
  }, {
    sourceItemId: items[1].sourceItemId,
    qid: "Q123",
    mediaType: "series",
    releaseYear: 2024,
    externalIds: { imdb: "tt1234567" },
    resolvedAt: "2026-08-27T02:01:00.000Z",
  }],
};

check("Format 5 akzeptiert exakt 50 belegte Joyn-Faktenkarten und getrennte Annotationen", () => {
  const result = validateWebDiscoveryFeed(feed);
  assert.equal(result.ok, true);
  assert.equal(result.value.items.length, 50);
  assert.equal(result.value.annotations.length, 2);
  assert.equal(validateWebDiscoveryFeed({ ...feed, validUntil: "2026-08-31" }).ok, false);
  assert.equal(validateWebDiscoveryFeed({ ...feed, items: feed.items.slice(0, 49) }).ok, false);
  assert.equal(validateWebDiscoveryFeed({
    ...feed, items: feed.items.map((item, index) => index ? item : { ...item, description: "nicht erlaubt" }),
  }).ok, false);
});

check("Wikidata-ID matcht eindeutig; fehlende Annotation laesst lokalen Join leer", () => {
  const matches = matchWebDiscoveryFeed(feed, [{
    targetId: "watchmode:7", title: "Anderer lokaler Titel", year: 2024, type: "tv_series",
    externalIds: { imdb: "tt1234567" },
  }]);
  assert.equal(matches[1].status, "matched");
  assert.equal(matches[1].matchedBy, "external-id:imdb");
  assert.equal(matches[2].status, "unmatched");
});

check("Gesehenfilter nutzt starke IDs vor dem exakten Titel-Fallback", () => {
  const byId = publicDiscoveryCandidates({
    webDiscoveryFeed: feed, selectedServices: ["Joyn"],
    master: [{
      titel: "Abweichender Titel", typ: "series", imdb_id: "tt1234567", gesehen: true,
    }],
  });
  assert.ok(!byId.some((entry) => entry.sourceItemId === items[1].sourceItemId));
  const conflict = publicDiscoveryCandidates({
    webDiscoveryFeed: feed, selectedServices: ["Joyn"],
    master: [{
      titel: items[1].title, typ: "series", imdb_id: "tt9999999", gesehen: true,
    }],
  });
  assert.ok(conflict.some((entry) => entry.sourceItemId === items[1].sourceItemId));
});

const selection = createEntdeckenRecommendations({
  streamingEntdecken: { region: "AT", titel: [] },
  streamingKnown: { region: "AT", titel: [] },
  profile: {
    signals: [{ kind: "genre", value: "drama", direction: "positive", confirmed: true, strength: 4 }],
  },
  master: [{
    id: "seen", titel: "Schon gesehen", jahr: 2024, typ: "film", gesehen: true,
    bewertung: { wie: 4, was: 4, warum: 4 }, genre: ["Drama"],
  }],
  selectedServices: ["Joyn"],
  webDiscoveryFeed: feed,
  selectionDay: "2026-08-27",
});

check("Persoenliche Lane nutzt Joyn-Genres, nie Popularitaet, und ist auf sechs begrenzt", () => {
  assert.equal(selection.personal.length, 6);
  assert.ok(selection.personal.every((entry) => entry.targetId.startsWith("joyn:")));
  assert.ok(selection.personal.every((entry) => entry.reasons.length > 0));
  assert.ok(selection.personal.every((entry) => entry.reasons.some((reason) => /Profil:|Mediathek/.test(reason))));
  assert.ok(selection.personal.every((entry) => !entry.reasons.some((reason) => /Platz|beliebt|Rang/i.test(reason))));
  assert.ok(!selection.personal.some((entry) => entry.title === "Schon gesehen"));
});

check("Historischer Joyn-Feed bleibt persoenlich lesbar, aber ist keine Popularitaetslane mehr", () => {
  assert.deepEqual(selection.popular, []);
  assert.deepEqual(selection.further, []);
  assert.equal(new Set(selection.personal.map((entry) => entry.targetId)).size, 6);
});

check("Ohne kompatibles Profil bleibt der historische Joyn-Pfad vollstaendig leer", () => {
  const neutral = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    profile: { signals: [{ kind: "genre", value: "horror", direction: "positive", confirmed: true, strength: 4 }] },
    master: [], selectedServices: ["Joyn"], webDiscoveryFeed: feed,
  });
  assert.deepEqual(neutral.personal, []);
  assert.deepEqual(neutral.popular, []);
});

check("Persistierte Profilwerte und ein beschaedigtes Profil bleiben fail-closed", () => {
  const comedy = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] }, master: [],
    profile: { signale: [{ art: "genre", wert: "komoedie", richtung: "zieht_an", staerke: 4 }] },
    selectedServices: ["Joyn"], webDiscoveryFeed: feed,
  });
  assert.deepEqual(comedy.personal.map((entry) => entry.sourceItemId), [items[2].sourceItemId]);
  assert.equal(comedy.personal[0].sourceRank, null);
  const damaged = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] }, webDiscoveryFeed: feed,
    profile: { beschaedigt: true }, selectedServices: ["Joyn"],
    master: [{ bewertung: { wie: 5, was: 5, warum: 5 }, genre: ["Drama"] }],
  });
  assert.deepEqual(damaged.personal, []);
  assert.deepEqual(damaged.popular, []);
});

check("Eine andere Dienstewahl kann den historischen Joyn-Pfad nicht als Popularitaet reaktivieren", () => {
  const otherService = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    profile: { signals: [{ kind: "genre", value: "drama", direction: "positive", confirmed: true, strength: 4 }] },
    selectedServices: ["Netflix"], webDiscoveryFeed: feed,
  });
  assert.deepEqual(otherService.personal, []);
  assert.deepEqual(otherService.popular, []);
});

console.log(`\n${checks}/${checks} providerfreie Entdecken-E2E-Checks bestanden.`);
