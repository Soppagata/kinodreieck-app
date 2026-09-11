import assert from "node:assert/strict";
import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";
import {
  createEntdeckenRecommendations,
  publicDiscoveryCandidates,
  webDiscoveryFeedCards,
} from "./src/lib/entdeckenUi.js";
import {
  FLIXPATROL_DISCOVERY_FEED_FORMAT,
  FLIXPATROL_DAILY_DISCOVERY_FEED_FORMAT,
  FLIXPATROL_DAILY_DISCOVERY_FEED_ID,
  FLIXPATROL_DAILY_DISCOVERY_SOURCE_ID,
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

// The isolated product/backend packages meet here: a real validated daily feed
// must traverse the same visible pool, identity and service filters as format 8.
const dailyFeed = structuredClone(feed);
dailyFeed.format = FLIXPATROL_DAILY_DISCOVERY_FEED_FORMAT;
dailyFeed.feedId = FLIXPATROL_DAILY_DISCOVERY_FEED_ID;
dailyFeed.sourceId = FLIXPATROL_DAILY_DISCOVERY_SOURCE_ID;
dailyFeed.sourceIds[1] = "chart:flixpatrol-netflix-at";
for (let index = 15; index < 25; index += 1) {
  dailyFeed.items[index] = {
    ...provider(51 + index - 15, "chart:flixpatrol-netflix-at", "Netflix",
      index < 20 ? "film" : "series", (index - 15) % 5 + 1,
      "https://flixpatrol.com/top10/netflix/austria/"),
    releaseYear: 2020,
  };
}
dailyFeed.items.forEach((item) => { item.availabilityConfirmed = false; });
const allServices = ["Netflix", "Prime Video", "Disney+", "Apple TV"];
let dailyChecks = 0;
function dailyCheck(name, fn) { fn(); dailyChecks += 1; console.log(`✓ ${name}`); }
dailyCheck("Format 9 erreicht den gemeinsamen Browservertrag", () => {
  const result = validateWebDiscoveryFeed(dailyFeed);
  assert.equal(result.ok, true, result.errors.join(","));
});
dailyCheck("50 Tagesfeed-Karten behalten Identitäten und Netflix-Quellenstand", () => {
  const dailyCards = webDiscoveryFeedCards({ webDiscoveryFeed: dailyFeed });
  assert.equal(dailyCards.length, 50);
  const netflix = dailyCards.filter((card) => card.services.includes("Netflix"));
  assert.equal(netflix.length, 10);
  assert.ok(netflix.every((card) => card.externalIds.flixpatrol === card.sourceItemId
    && card.popularity.metric === "daily-provider-rank"
    && card.year === 2020));
});
dailyCheck("Format 9 hält den 50er-Pool und behauptet keine persönliche Verfügbarkeit", () => {
  const selection = createEntdeckenRecommendations({
    webDiscoveryFeed: dailyFeed, profile: {}, master: [],
    streamingEntdecken: { region: "AT", titel: [] },
    selectedServices: allServices, selectionDay: day,
  });
  assert.equal(selection.popular.length, 6);
  assert.equal(selection.popularPool.length, 50);
  assert.equal(selection.personal.length, 0);
  assert.ok(selection.popularPool.every((item) => item.availabilityConfirmed === false));
});
dailyCheck("Format 9 berücksichtigt nur ausgewählte Dienste plus Kino", () => {
  const candidates = publicDiscoveryCandidates({
    webDiscoveryFeed: dailyFeed, selectedServices: ["Netflix"], requireMetadata: false,
  });
  assert.equal(candidates.length, 25);
  assert.ok(candidates.every((item) => item.availability.market === "cinema"
    || item.services.length === 1 && item.services[0] === "Netflix"));
});
dailyCheck("Erst ein eindeutiger lokaler Angebotsbeleg bestätigt den Netflix-Titel", () => {
  const record = dailyFeed.items[15];
  const candidates = publicDiscoveryCandidates({
    webDiscoveryFeed: dailyFeed, selectedServices: ["Netflix"], requireMetadata: false,
    catalogCandidates: [{
      targetId: "watchmode:90001", watchmodeId: 90001, title: record.title,
      year: record.releaseYear, type: record.mediaType, externalIds: record.externalIds,
      services: ["Netflix"], availabilityConfirmed: true, genres: ["drama"],
    }],
  });
  const confirmed = candidates.filter((item) => item.availabilityConfirmed);
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].targetId, "watchmode:90001");
  assert.equal(confirmed[0].externalIds.flixpatrol, record.sourceItemId);
});

// Render the actual tab, not a copy of its label/format switches.
const [{ build }, { mkdtempSync, rmSync }, { join }, { pathToFileURL }, React,
  { renderToStaticMarkup }, { JSDOM }] = await Promise.all([
  import("esbuild"), import("node:fs"), import("node:path"), import("node:url"),
  import("react"), import("react-dom/server"), import("jsdom"),
]);
const renderDir = mkdtempSync(join(process.cwd(), ".tmp-flixpatrol-frontend-"));
try {
  const output = join(renderDir, "tab.mjs");
  await build({
    entryPoints: ["src/tabs/EntdeckenTab.jsx"], bundle: true, format: "esm",
    platform: "node", outfile: output, jsx: "automatic", target: "es2022",
    external: ["react", "react-dom"], logLevel: "warning",
  });
  const { EntdeckenTab } = await import(pathToFileURL(output).href);
  for (const current of [feed, dailyFeed]) {
    const html = renderToStaticMarkup(React.createElement(EntdeckenTab, {
      selectedServices: allServices, webDiscoveryFeed: current, calendarDay: day,
      streamingDiscover: { region: "AT", titel: [] },
    }));
    const dom = new JSDOM(html);
    try {
      dailyCheck(`Echter Tab zeigt Format ${current.format} mit Tagesstand und sechs Karten`, () => {
        const section = dom.window.document.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
        assert.ok(section);
        assert.equal(section.querySelectorAll(".kd-entdecken-neutral").length, 6);
        assert.match(section.textContent, /Stand: 09\.09\.2026/);
        assert.doesNotMatch(section.textContent, /KW 37/);
        assert.equal(section.querySelectorAll(".kd-entdecken-quellenlink").length, 0);
      });
    } finally { dom.window.close(); }
  }
} finally { rmSync(renderDir, { recursive: true, force: true }); }
console.log(`Entdecken FlixPatrol frontend: 19 legacy checks and ${dailyChecks} daily integration checks passed`);
