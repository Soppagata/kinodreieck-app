import assert from "node:assert/strict";
import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";
import {
  createTitleFactsProjector,
  normalizeTitleFactsProjection,
  projectTitleFacts,
} from "./src/lib/titleFacts.js";
import { createCatalogService, titleFactIdentitiesForTitles } from "./src/services/catalog.js";
import { createEntdeckenRecommendations } from "./src/lib/entdeckenUi.js";
import { analysiereInhaltsPassung, bereiteInhaltsEvidenz } from "./src/lib/recommendationContent.js";

let checks = 0;
const check = (name, run) => { run(); checks += 1; console.log(`✓ ${name}`); };
const identity = {
  flixpatrolId: null, imdbId: "tt0903747", tmdbId: "1396", watchmodeId: 700,
  title: "Breaking Bad", originalTitle: "Breaking Bad", year: 2008, mediaType: "series",
};
const watchmode = {
  schemaVersion: "title-facts-projection-v1", source: "watchmode",
  checkedAt: "2026-09-10T22:00:00.000Z", fetchedAt: "2026-09-10T22:00:00.000Z",
  freshUntil: "2026-10-10T22:00:00.000Z", fresh: true, sourceUrl: null,
  identity, description: "Ein Chemielehrer gerät auf die schiefe Bahn.", descriptionLanguage: null,
  runtimeMinutes: 48, premiere: "2008-01-20", genres: [{ id: null, name: "Drama" }],
  keywords: [{ id: null, name: "Organisiertes Verbrechen" }], charts: [],
};
const flixpatrol = {
  schemaVersion: "title-facts-projection-v1", source: "flixpatrol",
  checkedAt: "2026-09-11T03:00:00.000Z", fetchedAt: "2026-09-11T03:00:00.000Z",
  freshUntil: "2026-10-11T03:00:00.000Z", fresh: true,
  sourceUrl: "https://flixpatrol.com/title/breaking-bad/",
  identity: { ...identity, flixpatrolId: "ttl_12345678901234567890", watchmodeId: null },
  description: "An English fallback.", descriptionLanguage: "en", runtimeMinutes: 49,
  premiere: null, genres: [{ id: "gnr_12345678901234567890", name: "Crime" }],
  keywords: [], charts: [{ companyId: "cmp_x", rank: 2, chartDate: "2026-09-10" }],
};

check("Watchmode-DTO normalisiert numerische IDs und erfindet keine Beschreibungssprache", () => {
  const normalized = normalizeTitleFactsProjection(watchmode);
  assert.equal(normalized.identity.watchmodeId, "700");
  assert.equal(normalized.descriptionLanguage, null);
});

check("Lokaler deutscher Titel und persönliche Felder führen vor neutralen Fakten", () => {
  const entry = {
    watchmode_id: 700, imdb_id: "tt0903747", tmdb_id: 1396,
    titel: "Der Chemielehrer", originaltitel: "Breaking Bad", jahr: 2008, typ: "serie",
    beschreibung: "Meine eigene Beschreibung", genres: ["Lieblingsgenre"], title_facts: watchmode,
  };
  const projected = projectTitleFacts(entry, [flixpatrol]);
  assert.equal(projected.titel, "Der Chemielehrer");
  assert.equal(projected.beschreibung, "Meine eigene Beschreibung");
  assert.deepEqual(projected.genres, ["Lieblingsgenre", "Drama", "Crime"]);
  assert.equal(projected.laufzeit_minuten, 48);
  assert.equal(projected.descriptionEvidence, null);
  assert.equal(projected.chartEvidence.length, 1);
  assert.equal(entry.laufzeit_minuten, undefined);
});

check("Watchmode-Beschreibung gewinnt vor FlixPatrol und trägt eigenen Prüfbeleg", () => {
  const projected = projectTitleFacts({
    watchmode_id: "700", imdb_id: "tt0903747", tmdb_id: "1396",
    titel: "Breaking Bad", jahr: 2008, typ: "series", title_facts: watchmode,
  }, [flixpatrol]);
  assert.equal(projected.beschreibung, watchmode.description);
  assert.equal(projected.descriptionEvidence.source, "watchmode");
  assert.equal(projected.descriptionEvidence.checkedAt, watchmode.checkedAt);
});

check("Starke ID mit Jahr-, Typ- oder zweitem ID-Konflikt wird verworfen", () => {
  const base = { imdb_id: "tt0903747", tmdb_id: "1396", titel: "Breaking Bad", jahr: 2008, typ: "series" };
  const remake = { ...flixpatrol, identity: { ...flixpatrol.identity, year: 2026 } };
  const idConflict = { ...flixpatrol, identity: { ...flixpatrol.identity, tmdbId: "999" } };
  assert.equal(projectTitleFacts(base, [remake]).beschreibung, undefined);
  assert.equal(projectTitleFacts(base, [idConflict]).beschreibung, undefined);
});

check("Mehrere Titelidentitäten derselben Quelle bleiben mehrdeutig; explizite Provider-ID löst sie auf", () => {
  const secondFlix = {
    ...flixpatrol,
    identity: { ...flixpatrol.identity, flixpatrolId: "ttl_ABCDEFGHIJ1234567890" },
    description: "Anderer Text derselben vermeintlichen IMDb-Identität.",
  };
  const weakEntry = { imdb_id: "tt0903747", tmdb_id: "1396", titel: "Breaking Bad", jahr: 2008, typ: "series" };
  const ambiguousOnly = projectTitleFacts(weakEntry, [flixpatrol, secondFlix]);
  assert.equal(ambiguousOnly.beschreibung, undefined);
  const withWatchmode = projectTitleFacts(weakEntry, [watchmode, flixpatrol, secondFlix]);
  assert.equal(withWatchmode.beschreibung, watchmode.description);
  assert.equal(withWatchmode.titleFactsEvidence.length, 1);
  const explicitFlix = projectTitleFacts({ ...weakEntry, flixpatrol_id: flixpatrol.identity.flixpatrolId }, [flixpatrol, secondFlix]);
  assert.equal(explicitFlix.beschreibung, flixpatrol.description);
  assert.equal(explicitFlix.titleFactsEvidence.length, 1);
});

check("Indexierte Projektion reichert nur passende Kandidaten an", () => {
  const project = createTitleFactsProjector([flixpatrol]);
  assert.equal(project({ imdb_id: "tt0903747", tmdb_id: 1396, titel: "Breaking Bad", jahr: 2008, typ: "serie" }).beschreibung,
    flixpatrol.description);
  assert.equal(project({ imdb_id: "tt9999999", titel: "Breaking Bad", jahr: 2026, typ: "serie" }).beschreibung, undefined);
});

check("Identitätslookup priorisiert ausgewählte Dienste, sortiert stabil und bleibt bei 50", () => {
  const rows = Array.from({ length: 70 }, (_, index) => ({
    titel: `Titel ${String(69 - index).padStart(2, "0")}`, watchmode_id: index + 1,
    imdb_id: `tt${String(1_000_000 + index)}`, jahr: 2000, typ: "movie",
    dienste: [index % 2 ? "Netflix" : "Paramount+ (Via Amazon Prime)"],
  }));
  const selected = titleFactIdentitiesForTitles(rows, { services: ["Netflix"], limit: 50 });
  assert.equal(selected.length, 35);
  assert.ok(selected.every((entry) => Number(entry.imdbId.slice(2)) % 2 === 1));
  assert.deepEqual(selected, titleFactIdentitiesForTitles([...rows].reverse(), { services: ["Netflix"], limit: 50 }));
});

{
  const calls = [];
  let snapshot = [];
  const factsService = {
    async load() { calls.push("charts"); snapshot = [flixpatrol]; return snapshot; },
    async loadByIdentities(identities) {
      calls.push({ identities }); snapshot = [watchmode, ...snapshot]; return [watchmode];
    },
    peek() { return snapshot; },
  };
  const auth = { getSnapshot: () => ({
    mode: "account", state: "ready", account: { id: "konto-fakten" },
    capabilities: { remoteStorage: true },
  }) };
  const service = createCatalogService({ auth, driver: {}, factsService });
  const loaded = await service.loadFactsForTitles([{
    titel: "Breaking Bad", imdb_id: "tt0903747", tmdb_id: 1396,
    jahr: 2008, typ: "series", dienste: ["Netflix"],
  }], { services: ["Netflix"] });
  check("Faktenservice lädt seriell Charts vor dem begrenzten Identitätscache und liefert die Union", () => {
    assert.equal(calls[0], "charts");
    assert.deepEqual(calls[1], { identities: [{ imdbId: "tt0903747", tmdbId: "1396", mediaType: "series" }] });
    assert.deepEqual(loaded, [watchmode, flixpatrol]);
  });
}

check("Nur gepflegte strukturierte Begriffe erzeugen persönliche Inhaltsgründe", () => {
  const evidence = bereiteInhaltsEvidenz({ positiveSignals: [{ art: "thema", wert: "Organisiertes Verbrechen" }] });
  assert.match(analysiereInhaltsPassung({ keywords: ["organized crime"] }, evidence).profileReason, /Organisiertes Verbrechen/u);
  assert.equal(analysiereInhaltsPassung({ keywords: ["Unbekanntes Fantasiewort"] }, evidence).profileReason, null);
});

check("Chartdienst filtert den Pool, bestätigt aber erst mit passendem Watchmode-Snapshot ein Angebot", () => {
  const netflix = ENTDECKEN_MARKET_POOL_50.items.find((item) => item.availability?.service === "Netflix");
  const rawCatalog = {
    watchmode_id: 5015, titel: "Lokaler deutscher Titel", originaltitel: netflix.title,
    jahr: netflix.releaseYear, typ: netflix.mediaType, dienste: ["Netflix"], genres: ["Drama"],
  };
  const withoutCatalog = createEntdeckenRecommendations({
    webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50, streamingEntdecken: { region: "AT", titel: [] },
    streamingKnown: { region: "AT", titel: [] }, master: [], profile: {}, selectedServices: ["Netflix"],
  });
  const withCatalog = createEntdeckenRecommendations({
    webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50, streamingEntdecken: { region: "AT", titel: [rawCatalog] },
    streamingKnown: { region: "AT", titel: [] }, master: [], profile: {}, selectedServices: ["Netflix"],
  });
  const before = withoutCatalog.popularPool.find((item) => item.sourceItemId === netflix.sourceItemId);
  const after = withCatalog.popularPool.find((item) => item.sourceItemId === netflix.sourceItemId);
  assert.equal(before.availabilityConfirmed, false);
  assert.equal(after.availabilityConfirmed, true);
  assert.equal(after.title, "Lokaler deutscher Titel");
  assert.ok(withCatalog.popularPool.every((item) => item.availability?.market === "cinema" || item.services.includes("Netflix")));
});

console.log(`title_facts_product_test: ${checks}/${checks} Checks bestanden.`);
