import assert from "node:assert/strict";
import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";
import {
  createEntdeckenRecommendations,
  webDiscoveryFeedCards,
} from "./src/lib/entdeckenUi.js";
import {
  FLIXPATROL_DISCOVERY_FEED_FORMAT,
  validateWebDiscoveryFeed,
} from "./src/lib/webDiscoveryFeed.js";
import {
  createEntdeckenDailyFeedService,
  selectEntdeckenFeed,
} from "./src/services/entdeckenDailyFeed.js";
import { buildEntdeckenTitleGateTrace } from "./src/lib/entdeckenFreshness.js";

const day = "2026-09-09";
const fetchedAt = "2026-09-09T02:00:00.000Z";
const rows = [];
const common = (index, sourceId, mediaType, availability, popularity, sourceLabel, sourceUrl) => ({
  title: `Discovery ${index}`, sourceItemId: `${mediaType === "film" ? "f" : "s"}_source-${index}`,
  sourceId, sourceLabel, mediaType, releaseYear: null, externalIds: {}, genres: [],
  availability, popularity, sourceUrl, fetchedAt,
});
for (let rank = 1; rank <= 15; rank += 1) rows.push(common(
  rank, "chart:oefi-weekend-at", "film", { region: "AT", market: "cinema", service: null, licenseTypes: [] },
  { metric: "weekend-admissions", rank, measuredOn: "2026-08-30", value: 1000 - rank },
  "Österreichisches Filminstitut", "https://filminstitut.at/charts",
));
for (const [mediaType, offset, path] of [["film", 15, "films"], ["series", 20, "tv"]]) {
  for (let rank = 1; rank <= 5; rank += 1) rows.push(common(
    offset + rank, "chart:netflix-weekly-at", mediaType,
    { region: "AT", market: "streaming", service: "Netflix", licenseTypes: ["SVOD"] },
    { metric: "weekly-country-rank", rank, measuredOn: "2026-09-06", value: null },
    "Netflix Top 10 Österreich", `https://www.netflix.com/tudum/top10/austria/${path}`,
  ));
}
const provider = (index, sourceId, service, mediaType, rank, sourceUrl) => {
  const flixpatrol = `ttl_Frontend${String(index).padStart(12, "0")}`;
  return {
    title: `Provider ${index}`, sourceItemId: flixpatrol, sourceId,
    sourceLabel: `${service} · Top 10 Österreich (FlixPatrol)`, mediaType,
    releaseYear: 1980 + index, externalIds: { flixpatrol }, genres: [],
    availability: { region: "AT", market: "streaming", service, licenseTypes: ["SVOD"] },
    popularity: { metric: "daily-provider-rank", rank, measuredOn: "2026-09-08", value: null },
    sourceUrl, fetchedAt,
  };
};
for (const [sourceId, service, start, url] of [
  ["chart:flixpatrol-prime-at", "Prime Video", 26, "https://flixpatrol.com/top10/amazon-prime/austria/"],
  ["chart:flixpatrol-disney-at", "Disney+", 36, "https://flixpatrol.com/top10/disney/austria/"],
]) {
  for (let i = 0; i < 5; i += 1) rows.push(provider(start + i, sourceId, service, "film", i + 1, url));
  for (let i = 0; i < 5; i += 1) rows.push(provider(start + 5 + i, sourceId, service, "series", i + 1, url));
}
for (let i = 0; i < 5; i += 1) rows.push(provider(
  46 + i, "chart:flixpatrol-apple-tv-at", "Apple TV", "film", i + 1,
  "https://flixpatrol.com/top10/apple-tv/austria/",
));
const feed = {
  format: FLIXPATROL_DISCOVERY_FEED_FORMAT, feedId: "public:daily-market-mix-at-v2", region: "AT",
  sourceId: "chart:daily-market-mix-at",
  sourceIds: ["chart:oefi-weekend-at", "chart:netflix-weekly-at", "chart:flixpatrol-prime-at", "chart:flixpatrol-disney-at", "chart:flixpatrol-apple-tv-at"],
  isoWeek: "2026-W37", chartDate: "2026-09-08", refreshedOn: day, validUntil: day, items: rows,
};

const checked = validateWebDiscoveryFeed(feed);
assert.equal(checked.ok, true, checked.errors.join(","));
const cards = webDiscoveryFeedCards({ webDiscoveryFeed: feed });
assert.equal(cards.length, 50);
const apple = cards.find((card) => card.services.includes("Apple TV"));
assert.ok(apple);
assert.match(apple.targetId, /^market:ttl_/);
assert.equal(apple.externalIds.flixpatrol, apple.sourceItemId);
assert.equal(apple.popularity.measuredOn, "2026-09-08");
assert.equal(feed.refreshedOn, "2026-09-09");

const recommendations = createEntdeckenRecommendations({
  webDiscoveryFeed: feed, profile: {}, master: [], streamingEntdecken: { region: "AT", titel: [] },
  selectedServices: ["Netflix", "Prime Video", "Disney+", "Apple TV"], selectionDay: day,
});
assert.equal(recommendations.popular.length, 6);
assert.equal(recommendations.popularPool.length, 50);
assert.equal(new Set(recommendations.popular.map((entry) => entry.targetId)).size, 6);

const server = Object.freeze({ status: "fresh", feed, feedOrigin: "server" });
const fallback = Object.freeze({ status: "fresh", feed: ENTDECKEN_MARKET_POOL_50, feedOrigin: "embedded_fallback" });
assert.equal(selectEntdeckenFeed(server, fallback), server);

const service = createEntdeckenDailyFeedService({
  config: { entdeckenDailyFeedEnabled: true, supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public" },
  auth: { getSnapshot: () => session }, getAccount: () => session.account,
  getAccessToken: async () => "token", currentDay: () => day, fallbackFeed: ENTDECKEN_MARKET_POOL_50,
  fetchImpl: async () => ({ ok: true, async json() {
    return {
      ok: true, status: "fresh", feed, writes: 0, providerRequests: 0, searchRequests: 0,
      sourceRequests: 0, publicSourceRequests: 0, flixpatrolRequests: 0,
      flixpatrolChartRequests: 0, flixpatrolTitleRequests: 0, wikidataRequests: 0,
      responseMode: "structured", displayText: null, warnings: [],
      refresh: { requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1 },
    };
  } }),
});
const session = Object.freeze({ mode: "account", state: "ready", account: { id: "account-1" }, capabilities: { remoteStorage: true } });
const loaded = await service.load();
assert.equal(loaded.feedOrigin, "server");
assert.equal(loaded.feed.format, 8);
const legacyWithFormat9Counter = createEntdeckenDailyFeedService({
  config: { entdeckenDailyFeedEnabled: true, supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public" },
  auth: { getSnapshot: () => session }, getAccount: () => session.account,
  getAccessToken: async () => "token", currentDay: () => day,
  fetchImpl: async () => ({ ok: true, async json() {
    return {
      ok: true, status: "fresh", feed, writes: 0, providerRequests: 0, searchRequests: 0,
      sourceRequests: 0, publicSourceRequests: 0, flixpatrolRequests: 0,
      flixpatrolChartRequests: 0, flixpatrolTitleRequests: 0,
      flixpatrolGenreRequests: 0, flixpatrolKeywordRequests: 0, wikidataRequests: 0,
      responseMode: "structured", displayText: null, warnings: [],
      refresh: { requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1 },
    };
  } }),
});
assert.equal((await legacyWithFormat9Counter.load()).status, "invalid_response");

const invalidApple = structuredClone(feed);
invalidApple.items.at(-1).availability.service = "Apple TV+";
assert.equal(validateWebDiscoveryFeed(invalidApple).ok, false);
const badIdentity = structuredClone(feed);
badIdentity.items.at(-1).title = badIdentity.items.at(-2).title;
assert.equal(validateWebDiscoveryFeed(badIdentity).ok, false);
const trace = buildEntdeckenTitleGateTrace({ title: "Provider 46", checkedOn: day, feed: { refreshedOn: day, validUntil: day } });
assert.equal(trace.preferredAction, "observe-natural-daily-refresh");
assert.equal(trace.migrationState, "format-8-runtime-contract");

console.log("Entdecken FlixPatrol frontend: 19 checks passed");
