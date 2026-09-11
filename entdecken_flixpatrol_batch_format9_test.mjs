import assert from "node:assert/strict";
import {
  ENTDECKEN_FLIXPATROL_BATCH_MODE,
  ENTDECKEN_FLIXPATROL_DAILY_FEED_FORMAT,
  ENTDECKEN_FLIXPATROL_DAILY_SOURCE_IDS,
  ENTDECKEN_FLIXPATROL_FORMAT_9_CONSUMERS,
  createFlixPatrolMixAdapter,
} from "./supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js";
import {
  createEntdeckenWeeklyQueryContext,
  evaluateEntdeckenFlixPatrolResponse,
  validateEntdeckenDailyFeed,
} from "./supabase/functions/entdecken-daily-task/contract.js";
import { createEntdeckenDailyResponse } from "./supabase/functions/entdecken-daily-task/responseContract.js";
import { normalizeEntdeckenPublicPersistenceReadback } from "./supabase/functions/entdecken-daily-task/readbackContract.js";
import { validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";
import { createEntdeckenDailyFeedService } from "./src/services/entdeckenDailyFeed.js";

const today = "2026-09-11";
const chartDate = "2026-09-10";
const checkedAt = "2026-09-11T02:00:00.000Z";
const filmGenreId = "gnr_FilmGenreFormatNine123456";
const seriesGenreId = "gnr_SeriesGenreFormatNine1234";
const keywordId = "kwd_KeywordFormatNine123456";
const sources = [
  { sourceId: "chart:netflix-weekly-at", domain: "netflix.com", publisherFamily: "Netflix, Inc.", sourceClass: "chart", rightsStatus: "owner_private", attributionApproved: true, subdomainsAllowed: true, active: true, termsUrl: "https://help.netflix.com/legal/termsofuse", termsCheckedOn: "2026-08-28" },
  { sourceId: "chart:oefi-weekend-at", domain: "filminstitut.at", publisherFamily: "Österreichisches Filminstitut", sourceClass: "chart", rightsStatus: "owner_private", attributionApproved: true, subdomainsAllowed: false, active: true, termsUrl: "https://filminstitut.at/impressum", termsCheckedOn: "2026-08-28" },
];
const oefiItems = Array.from({ length: 15 }, (_, index) => ({
  title: `Cinema ${index + 1}`, sourceItemId: `f_oefi-${String(index + 1).padStart(4, "0")}`,
  sourceId: "chart:oefi-weekend-at", sourceLabel: "Österreichisches Filminstitut", mediaType: "film", genres: [],
  availability: { region: "AT", market: "cinema", service: null, licenseTypes: [] },
  popularity: { metric: "weekend-admissions", rank: index + 1, measuredOn: "2026-09-07", value: 1000 - index },
  sourceUrl: "https://filminstitut.at/charts", fetchedAt: checkedAt,
}));
const publicAdapter = {
  mode: "public-oefi",
  telemetry: () => ({ sourceRequests: 1 }),
  async search(queryContext) {
    return { sourceMode: "public-oefi", sourceId: "chart:oefi-weekend-at", sourceIds: ["chart:oefi-weekend-at"],
      queryContext, checkedAt, retrievedOn: today, isoWeek: "2026-W37", items: oefiItems };
  },
};
function chartKey({ companyId, countryId, chartType }) { return `${companyId}|${countryId}|${chartType}`; }
function titleId(chartNumber, rank) { return `ttl_F9Chart${chartNumber}Title${String(rank).padStart(10, "0")}`; }
function createHarness({
  failBatch = false,
  failSaveAt = null,
  mediaTypeConflict = false,
  legacyFormat8Conflict = false,
  mismatchedGenre = false,
  manyKeywords = false,
} = {}) {
  const charts = new Map();
  const titles = new Map();
  const vocabulary = new Map();
  const counts = {
    chart: 0, batch: 0, single: 0, genre: 0, keyword: 0,
    titleReads: [], savedTitles: 0, savedMisses: 0, failures: 0,
  };
  const chartNumbers = new Map();
  const client = {
    async fetchTop10({ companyId, countryId, chartType, date }) {
      counts.chart += 1;
      const key = chartKey({ companyId, countryId, chartType });
      if (!chartNumbers.has(key)) chartNumbers.set(key, chartNumbers.size + 1);
      const number = chartNumbers.get(key);
      const mediaType = chartType === "movies" ? "film" : "series";
      return { operationId: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`, providerRequests: 1,
        items: Array.from({ length: 10 }, (_, index) => ({ sourceId: titleId(number, index + 1), mediaType,
          ranking: index + 1, rankingLast: null, value: 10 - index, valueLast: null, daysTotal: 1,
          providerUpdatedAt: `${date}T01:00:00Z` })) };
    },
    async fetchTitle() { counts.single += 1; throw new Error("single fallback forbidden"); },
    async fetchTitles({ sourceIds, mediaTypes, mediaTypeConflictPolicy }) {
      counts.batch += 1;
      assert.equal(mediaTypeConflictPolicy, legacyFormat8Conflict ? undefined : "separate");
      if (legacyFormat8Conflict) throw Object.assign(new Error("strict format 8 conflict"), {
        code: "FLIXPATROL_INVALID_RESPONSE", providerRequests: 1,
        operationId: "00000000-0000-4000-8000-000000000098",
      });
      if (failBatch) throw Object.assign(new Error("batch provider failed"), {
        code: "FLIXPATROL_TRANSPORT_ERROR", providerRequests: 1,
        operationId: "00000000-0000-4000-8000-000000000099",
      });
      const conflictId = mediaTypeConflict ? titleId(2, 5) : null;
      const conflicts = [];
      const items = sourceIds.flatMap((sourceId, index) => {
        if (sourceId === conflictId) {
          conflicts.push({ sourceId, mediaType: mediaTypes[index] });
          return [];
        }
        return [{
          sourceId, mediaType: mediaTypes[index], title: `Daily ${sourceId.slice(4)}`,
          premiere: "2020-01-01", releaseYear: 2020, premiereOnline: null, runtimeMinutes: 100,
          imdbNumericId: null, imdbId: null, tmdbId: String(5000 + counts.savedTitles + index),
          countryId: null, companyId: null,
          genreId: mediaTypes[index] === "film" ? filmGenreId : seriesGenreId,
          keywordId: manyKeywords ? `kwd_${sourceId.slice(4)}` : keywordId, description: null,
          providerUpdatedAt: "2026-09-10T01:00:00Z", sourceUrl: `https://flixpatrol.com/title/${sourceId.toLowerCase()}/`,
        }];
      });
      return {
        operationId: `00000000-0000-4000-8000-${String(100 + counts.batch).padStart(12, "0")}`,
        providerRequests: 1, items, conflicts,
      };
    },
    async fetchGenres({ sourceIds }) {
      counts.genre += 1; assert.deepEqual(sourceIds, [filmGenreId, seriesGenreId]);
      return { operationId: "00000000-0000-4000-8000-000000000201", providerRequests: 1,
        items: [
          { sourceId: filmGenreId, name: "Drama", mediaType: mismatchedGenre ? "series" : "film", providerType: mismatchedGenre ? 2 : 1 },
          { sourceId: seriesGenreId, name: "Serie", mediaType: "series", providerType: 2 },
        ] };
    },
    async fetchKeywords({ sourceIds }) {
      counts.keyword += 1;
      if (!manyKeywords) assert.deepEqual(sourceIds, [keywordId]);
      else assert.equal(sourceIds.length, 10);
      return { operationId: "00000000-0000-4000-8000-000000000202", providerRequests: 1,
        items: sourceIds.map((sourceId, index) => ({
          sourceId, name: manyKeywords ? `Keyword ${index + 1}` : "Weltraum", mediaType: null, providerType: null,
        })) };
    },
  };
  const legacyItems = Array.from({ length: 25 }, (_, index) => ({
    ...oefiItems[index % oefiItems.length],
    title: `Legacy ${index + 1}`,
    sourceItemId: `f_legacy-${String(index + 1).padStart(4, "0")}`,
  }));
  const legacyPublicAdapter = {
    mode: "public-mix",
    telemetry: () => ({ sourceRequests: 2 }),
    async search(queryContext) {
      return { sourceMode: "public-mix", sourceId: "chart:public-mix-at", sourceIds: ["chart:oefi-weekend-at"],
        queryContext, checkedAt, retrievedOn: today, isoWeek: "2026-W37", items: legacyItems };
    },
  };
  const adapter = createFlixPatrolMixAdapter({
    publicAdapter: legacyFormat8Conflict ? legacyPublicAdapter
      : { mode: "public-mix", async search() { throw new Error("weekly Netflix forbidden"); } },
    dailyPublicAdapter: publicAdapter, client, now: () => checkedAt,
    titleRequestMode: ENTDECKEN_FLIXPATROL_BATCH_MODE, netflixDaily: !legacyFormat8Conflict,
    format9Consumers: legacyFormat8Conflict ? null : ENTDECKEN_FLIXPATROL_FORMAT_9_CONSUMERS,
    readChart: async (key) => ({ ok: true, chart: charts.get(chartKey(key)) || null }),
    saveChart: async (chart) => { charts.set(chartKey(chart), { ...chart, fresh: true }); return { ok: true }; },
    readTitles: async (ids) => {
      counts.titleReads.push(ids.length);
      return { ok: true, items: ids.flatMap((id) => {
        const row = titles.get(id); if (!row) return [];
        return [{ ...row,
          genres: row.genreId && vocabulary.has(row.genreId)
            ? [{ id: row.genreId, name: vocabulary.get(row.genreId).name }] : [],
          keywords: row.keywordId && vocabulary.has(row.keywordId)
            ? [{ id: row.keywordId, name: vocabulary.get(row.keywordId).name }] : [],
        }];
      }) };
    },
    saveTitle: async ({ title, fetchedAt, freshUntil }) => {
      if (failSaveAt !== null && counts.savedTitles + 1 === failSaveAt) return { ok: false };
      counts.savedTitles += 1;
      titles.set(title.sourceId, { ...title, status: "resolved", checkedAt: fetchedAt, fetchedAt, freshUntil, fresh: true });
      return { ok: true };
    },
    saveTitleMiss: async ({ sourceId, mediaType, status, checkedAt: missCheckedAt, freshUntil }) => {
      if (!mediaTypeConflict) throw new Error("batch must not write unattributed misses");
      counts.savedMisses += 1;
      titles.set(sourceId, {
        sourceId, mediaType, status, checkedAt: missCheckedAt, freshUntil, fresh: true,
      });
      return { ok: true };
    },
    readVocabulary: async ({ resourceType, sourceIds }) => ({ ok: true,
      items: sourceIds.flatMap((id) => vocabulary.has(id) ? [{ ...vocabulary.get(id), sourceId: id, fresh: true }] : []) }),
    saveVocabulary: async (row) => { vocabulary.set(row.sourceId, row); return { ok: true }; },
    recordFailure: async () => { counts.failures += 1; return { ok: true }; },
  });
  return { adapter, counts };
}

const query = createEntdeckenWeeklyQueryContext(today, "2026-W37");
const cold = createHarness();
const envelope = await cold.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" });
assert.equal(envelope.feedFormat, ENTDECKEN_FLIXPATROL_DAILY_FEED_FORMAT);
assert.equal(envelope.items.length, 50);
assert.equal(cold.counts.chart, 7);
assert.equal(cold.counts.batch, 4);
assert.equal(cold.counts.single, 0);
assert.equal(cold.counts.savedTitles, 40);
assert.equal(cold.counts.genre, 1);
assert.equal(cold.counts.keyword, 1);
assert.deepEqual(cold.counts.titleReads, [50, 20, 50, 20, 35, 35]);
assert.deepEqual(cold.adapter.telemetry(), {
  providerRequests: 0, publicSourceRequests: 1, flixpatrolChartRequests: 7,
  flixpatrolTitleRequests: 4, flixpatrolGenreRequests: 1, flixpatrolKeywordRequests: 1,
  flixpatrolRequests: 13, sourceRequests: 14, sourceItemCount: 85, eligibleUniqueCount: 50,
});
const netflix = envelope.items.find((item) => item.sourceId === "chart:flixpatrol-netflix-at");
assert.ok(netflix);
assert.equal(netflix.availabilityConfirmed, false);
assert.deepEqual(netflix.genres, ["Drama", "Weltraum"]);
const evaluated = evaluateEntdeckenFlixPatrolResponse(envelope, sources, { retrievedOn: today, claimedIsoWeek: "2026-W37" });
assert.equal(evaluated.ok, true);
assert.equal(evaluated.feed.format, 9);
assert.equal(validateEntdeckenDailyFeed(evaluated.feed).ok, true);
assert.equal(validateWebDiscoveryFeed(evaluated.feed).ok, true);
assert.deepEqual([...evaluated.feed.sourceIds].sort(), [...ENTDECKEN_FLIXPATROL_DAILY_SOURCE_IDS].sort());
const readback = normalizeEntdeckenPublicPersistenceReadback({
  ok: true, status: "verified", feed: evaluated.feed, fenceToken: 9,
  provenance: { itemCount: 50, sourceCount: 5, sourceIds: evaluated.feed.sourceIds, rightsStatus: "owner_private" },
}, { expectedFeed: evaluated.feed, fenceToken: 9 });
assert.equal(readback.readback.schemaVersion, "entdecken-flixpatrol-daily-readback-v2");
const response = createEntdeckenDailyResponse({
  status: "fresh", feed: evaluated.feed, writes: 1, responseMode: "structured", displayText: null, warnings: [],
  refresh: { requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1 },
}, cold.adapter.telemetry());
assert.equal(response.flixpatrolGenreRequests, 1);
assert.equal(response.flixpatrolKeywordRequests, 1);
const session = Object.freeze({ mode: "account", state: "ready", account: { id: "account-1" }, capabilities: { remoteStorage: true } });
const service = createEntdeckenDailyFeedService({
  config: { entdeckenDailyFeedEnabled: true, supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public" },
  auth: { getSnapshot: () => session }, getAccount: () => session.account, getAccessToken: async () => "token",
  currentDay: () => today, fetchImpl: async () => ({ ok: true, async json() { return response; } }),
});
assert.equal((await service.load()).feed.format, 9);
const readOnlyResponse = createEntdeckenDailyResponse({
  status: "fresh", feed: evaluated.feed, writes: 0, responseMode: "structured", displayText: null, warnings: [],
  refresh: { requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1 },
}, {});
assert.equal(readOnlyResponse.flixpatrolGenreRequests, 0);
assert.equal(readOnlyResponse.flixpatrolKeywordRequests, 0);
const legacyResponseShape = createEntdeckenDailyResponse({
  status: "fresh", feed: { format: 8 }, writes: 0, responseMode: "structured", displayText: null, warnings: [],
  refresh: { requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1 },
}, { flixpatrolGenreRequests: 1, flixpatrolKeywordRequests: 1 });
assert.equal(Object.hasOwn(legacyResponseShape, "flixpatrolGenreRequests"), false);
assert.equal(Object.hasOwn(legacyResponseShape, "flixpatrolKeywordRequests"), false);
const readOnlyService = createEntdeckenDailyFeedService({
  config: { entdeckenDailyFeedEnabled: true, supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public" },
  auth: { getSnapshot: () => session }, getAccount: () => session.account, getAccessToken: async () => "token",
  currentDay: () => today, fetchImpl: async () => ({ ok: true, async json() { return readOnlyResponse; } }),
});
assert.equal((await readOnlyService.load()).feed.format, 9);
const missingVocabularyCounter = structuredClone(response);
delete missingVocabularyCounter.flixpatrolKeywordRequests;
const invalidFormat9Service = createEntdeckenDailyFeedService({
  config: { entdeckenDailyFeedEnabled: true, supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public" },
  auth: { getSnapshot: () => session }, getAccount: () => session.account, getAccessToken: async () => "token",
  currentDay: () => today, fetchImpl: async () => ({ ok: true, async json() { return missingVocabularyCounter; } }),
});
assert.equal((await invalidFormat9Service.load()).status, "invalid_response");

let publicCalls = 0;
const gated = createFlixPatrolMixAdapter({
  dailyPublicAdapter: { mode: "public-oefi", async search() { publicCalls += 1; } },
  providerConfigured: true, netflixDaily: true, client: {}, readChart() {}, readTitles() {}, saveChart() {},
  saveTitle() {}, saveTitleMiss() {}, recordFailure() {},
});
await assert.rejects(gated.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" }), /setup_invalid/);
assert.equal(publicCalls, 0);

const conflictingTitle = createHarness({ mediaTypeConflict: true });
const conflictEnvelope = await conflictingTitle.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" });
assert.equal(conflictingTitle.counts.batch, 4);
assert.equal(conflictingTitle.counts.savedTitles, 39);
assert.equal(conflictingTitle.counts.savedMisses, 1);
assert.equal(conflictEnvelope.items.some((item) => item.sourceItemId === titleId(2, 5)), false);
assert.equal(conflictEnvelope.items.some((item) => item.sourceItemId === titleId(2, 6)), true);
assert.equal(conflictEnvelope.items.filter((item) => item.sourceId === "chart:flixpatrol-netflix-at").length, 10);

const strictFormat8 = createHarness({ legacyFormat8Conflict: true });
await assert.rejects(
  strictFormat8.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" }),
  /strict format 8 conflict/,
);
assert.equal(strictFormat8.counts.batch, 1);
assert.equal(strictFormat8.counts.savedMisses, 0);

const failed = createHarness({ failBatch: true });
await assert.rejects(failed.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" }), /batch provider failed/);
assert.equal(failed.counts.batch, 1);
assert.equal(failed.counts.single, 0);
assert.equal(failed.counts.savedTitles, 0);
assert.equal(failed.counts.failures, 0);

const checkpoint = createHarness({ failSaveAt: 5 });
await assert.rejects(checkpoint.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" }), /checkpoint_failed/);
assert.equal(checkpoint.counts.batch, 1);
assert.equal(checkpoint.counts.savedTitles, 4);
assert.equal(checkpoint.counts.single, 0);

const genreConflict = createHarness({ mismatchedGenre: true });
await assert.rejects(genreConflict.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" }), /vocabulary_batch_incomplete/);
assert.equal(genreConflict.counts.genre, 1);
assert.equal(genreConflict.counts.keyword, 0);
assert.equal(genreConflict.counts.single, 0);

const boundedVocabulary = createHarness({ manyKeywords: true });
const boundedEnvelope = await boundedVocabulary.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" });
assert.equal(boundedVocabulary.counts.keyword, 1);
assert.equal(boundedEnvelope.items.filter((item) => item.genres.some((name) => name.startsWith("Keyword "))).length, 10);
assert.equal(boundedVocabulary.adapter.telemetry().flixpatrolKeywordRequests, 1);

console.log("Entdecken FlixPatrol Batch/Format 9: 57 checks passed");
