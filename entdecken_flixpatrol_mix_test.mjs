import assert from "node:assert/strict";
import {
  createEntdeckenWeeklyQueryContext,
  evaluateEntdeckenFlixPatrolResponse,
} from "./supabase/functions/entdecken-daily-task/contract.js";
import {
  createFlixPatrolMixAdapter,
  ENTDECKEN_FLIXPATROL_SOURCE_IDS,
} from "./supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js";
import { runEntdeckenDailyRefresh } from "./supabase/functions/entdecken-daily-task/runner.js";

const today = "2026-09-09";
const chartDate = "2026-09-08";
const checkedAt = "2026-09-09T02:00:00.000Z";
const sources = [
  {
    sourceId: "chart:netflix-weekly-at", domain: "netflix.com", publisherFamily: "Netflix, Inc.",
    sourceClass: "chart", rightsStatus: "owner_private", attributionApproved: true,
    subdomainsAllowed: true, active: true, termsUrl: "https://help.netflix.com/legal/termsofuse", termsCheckedOn: "2026-08-28",
  },
  {
    sourceId: "chart:oefi-weekend-at", domain: "filminstitut.at", publisherFamily: "Österreichisches Filminstitut",
    sourceClass: "chart", rightsStatus: "owner_private", attributionApproved: true,
    subdomainsAllowed: false, active: true, termsUrl: "https://filminstitut.at/impressum", termsCheckedOn: "2026-08-28",
  },
];
const publicItems = [];
for (let rank = 1; rank <= 15; rank += 1) publicItems.push({
  title: `Cinema ${rank}`, sourceItemId: `f_cinema-${rank}`, sourceId: "chart:oefi-weekend-at",
  sourceLabel: "Österreichisches Filminstitut", mediaType: "film", genres: [],
  availability: { region: "AT", market: "cinema", service: null, licenseTypes: [] },
  popularity: { metric: "weekend-admissions", rank, measuredOn: "2026-08-30", value: 1000 - rank },
  sourceUrl: "https://filminstitut.at/charts", fetchedAt: checkedAt,
});
for (const [type, offset, path] of [["film", 15, "films"], ["series", 20, "tv"]]) {
  for (let rank = 1; rank <= 5; rank += 1) publicItems.push({
    title: `Netflix ${type} ${rank}`, sourceItemId: `${type === "film" ? "f" : "s"}_netflix-${rank}`,
    sourceId: "chart:netflix-weekly-at", sourceLabel: "Netflix Top 10 Österreich", mediaType: type, genres: [],
    availability: { region: "AT", market: "streaming", service: "Netflix", licenseTypes: ["SVOD"] },
    popularity: { metric: "weekly-country-rank", rank, measuredOn: "2026-09-06", value: null },
    sourceUrl: `https://www.netflix.com/tudum/top10/austria/${path}`, fetchedAt: checkedAt,
    _offset: offset,
  });
}
publicItems.forEach((item) => { delete item._offset; });

function createHarness({ duplicateAcrossCharts = false, negativeId = null } = {}) {
  const charts = new Map();
  const titles = new Map();
  const counts = { chart: 0, title: 0, titleReads: 0, saves: 0, failures: 0, titleIds: [] };
  const publicAdapter = {
    mode: "public-mix",
    async search(queryContext) {
      return { sourceMode: "public-mix", queryContext, items: publicItems };
    },
    telemetry: () => ({ sourceRequests: 2 }),
  };
  const chartKey = ({ companyId, countryId, chartType }) => `${companyId}|${countryId}|${chartType}`.replace("chartType", chartType);
  const chartNumber = new Map();
  const client = {
    async fetchTop10({ companyId, countryId, chartType, date }) {
      counts.chart += 1;
      const key = chartKey({ companyId, countryId, chartType });
      const number = chartNumber.size + 1;
      if (!chartNumber.has(key)) chartNumber.set(key, number);
      const prefix = chartNumber.get(key);
      return {
        operationId: `00000000-0000-4000-8000-${String(counts.chart).padStart(12, "0")}`,
        providerRequests: 1,
        items: Array.from({ length: 10 }, (_, index) => ({
          sourceId: duplicateAcrossCharts && prefix === 5
            ? `ttl_Chart${index < 5 ? 1 : 3}Title${String((index % 5) + 1).padStart(9, "0")}`
            : `ttl_Chart${prefix}Title${String(index + 1).padStart(9, "0")}`,
          mediaType: chartType === "movies" ? "film" : "series", ranking: index + 1,
          rankingLast: null, value: 10 - index, valueLast: null, daysTotal: 1,
          providerUpdatedAt: `${date}T01:00:00Z`,
        })),
      };
    },
    async fetchTitle({ sourceId, mediaType }) {
      counts.title += 1;
      counts.titleIds.push(sourceId);
      if (sourceId === negativeId) {
        const error = new Error("missing");
        Object.assign(error, {
          code: "FLIXPATROL_HTTP_ERROR", httpStatus: 404, providerRequests: 1,
          operationId: `00000000-0000-4000-8000-${String(100 + counts.title).padStart(12, "0")}`,
        });
        throw error;
      }
      const serial = Number(sourceId.slice(-9));
      return {
        operationId: `00000000-0000-4000-8000-${String(100 + counts.title).padStart(12, "0")}`,
        providerRequests: 1,
        title: {
          sourceId, mediaType, title: `Flix ${sourceId.slice(4)}`, premiere: `${2000 + serial}-01-01`,
          releaseYear: 2000 + serial, premiereOnline: null, runtimeMinutes: 100,
          imdbNumericId: null, imdbId: null, tmdbId: String(1000 + counts.title),
          countryId: null, companyId: null, genreId: null, keywordId: null, description: null,
          providerUpdatedAt: "2026-09-08T01:00:00Z", sourceUrl: `https://flixpatrol.com/title/${sourceId.toLowerCase()}/`,
        },
      };
    },
  };
  const adapter = createFlixPatrolMixAdapter({
    publicAdapter, client, now: () => checkedAt,
    readChart: async (key) => ({ ok: true, chart: charts.get(chartKey(key)) || null }),
    saveChart: async (chart) => {
      charts.set(chartKey(chart), { ...chart, fresh: true, fetchedAt: "2026-09-09T04:00:00+02:00" });
      counts.saves += 1; return { ok: true };
    },
    readTitles: async (sourceIds) => {
      counts.titleReads += 1;
      return { ok: true, items: sourceIds.flatMap((id) => titles.has(id) ? [titles.get(id)] : []) };
    },
    saveTitle: async ({ title, fetchedAt, freshUntil }) => {
      titles.set(title.sourceId, {
        sourceId: title.sourceId, mediaType: title.mediaType, status: "resolved", title: title.title,
        releaseYear: title.releaseYear, imdbId: title.imdbId, tmdbId: title.tmdbId,
        sourceUrl: title.sourceUrl, checkedAt: fetchedAt, freshUntil, fresh: true,
      });
      counts.saves += 1; return { ok: true };
    },
    saveTitleMiss: async ({ sourceId, mediaType, checkedAt, freshUntil, status }) => {
      titles.set(sourceId, { sourceId, mediaType, checkedAt, freshUntil, fresh: true, status });
      counts.saves += 1; return { ok: true };
    },
    recordFailure: async () => { counts.failures += 1; return { ok: true }; },
  });
  return { adapter, charts, titles, counts, client, publicAdapter };
}

const query = createEntdeckenWeeklyQueryContext(today, "2026-W37");
const cold = createHarness();
const envelope = await cold.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" });
assert.equal(envelope.items.length, 50);
assert.equal(cold.counts.chart, 5);
assert.equal(cold.counts.title, 25);
assert.equal(cold.counts.titleReads, 2);
assert.equal(cold.counts.saves, 30);
assert.deepEqual(cold.adapter.telemetry(), {
  providerRequests: 0, publicSourceRequests: 2, flixpatrolChartRequests: 5,
  flixpatrolTitleRequests: 25, flixpatrolRequests: 30, sourceRequests: 32,
  sourceItemCount: 75, eligibleUniqueCount: 50,
});
assert.equal(envelope.chartDate, chartDate);
assert.equal(envelope.items.at(-1).availability.service, "Apple TV");
assert.equal(envelope.items.at(-1).popularity.measuredOn, chartDate);
assert.equal(envelope.items.at(-1).fetchedAt, checkedAt);
const evaluated = evaluateEntdeckenFlixPatrolResponse(envelope, sources, { retrievedOn: today, claimedIsoWeek: "2026-W37" });
assert.equal(evaluated.ok, true);
assert.equal(evaluated.feed.format, 8);
assert.equal(evaluated.feed.validUntil, today);

const warm = createFlixPatrolMixAdapter({
  publicAdapter: cold.publicAdapter, client: cold.client, now: () => checkedAt,
  readChart: async (key) => ({ ok: true, chart: cold.charts.get(`${key.companyId}|${key.countryId}|${key.chartType}`) || null }),
  readTitles: async (ids) => ({ ok: true, items: ids.map((id) => cold.titles.get(id)).filter(Boolean) }),
  saveChart: async () => { throw new Error("warm-chart-write"); },
  saveTitle: async () => { throw new Error("warm-title-write"); },
  saveTitleMiss: async () => { throw new Error("warm-negative-write"); },
  recordFailure: async () => ({ ok: true }),
});
const warmEnvelope = await warm.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" });
assert.equal(warmEnvelope.items.length, 50);
assert.deepEqual({ chart: warm.telemetry().flixpatrolChartRequests, title: warm.telemetry().flixpatrolTitleRequests }, { chart: 0, title: 0 });
assert.equal(warm.telemetry().sourceRequests, 2);

const negativeHarness = createHarness();
const firstChart = await negativeHarness.client.fetchTop10({
  companyId: "cmp_qypvowjqFhEIpCc0HlQ6VoYk", countryId: "cnt_gGE4RaeXpyz2U9Q5tEMYDwri", chartType: "movies", date: chartDate,
});
const negative = firstChart.items[0].sourceId;
negativeHarness.counts.chart = 0;
negativeHarness.titles.set(negative, {
  sourceId: negative, mediaType: "film", status: "not_found", checkedAt, freshUntil: "2026-09-10T02:00:00.000Z", fresh: true,
});
const negativeEnvelope = await negativeHarness.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" });
assert.equal(negativeEnvelope.items.length, 50);
assert.equal(negativeHarness.counts.title, 25);
assert.equal(negativeHarness.counts.titleIds.includes(negative), false);

const duplicateHarness = createHarness({ duplicateAcrossCharts: true });
await assert.rejects(
  duplicateHarness.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" }),
  /flixpatrol_mix_unique_scope_unproven/,
);
assert.equal(duplicateHarness.counts.title, 0);

const typeConflictHarness = createHarness();
typeConflictHarness.titles.set("ttl_Chart1Title000000001", {
  sourceId: "ttl_Chart1Title000000001", mediaType: "series", status: "unresolved",
  checkedAt, freshUntil: checkedAt, fresh: false,
});
await assert.rejects(
  typeConflictHarness.adapter.search(query, { retrievedOn: today, claimedIsoWeek: "2026-W37" }),
  /flixpatrol_mix_media_type_conflict/,
);
assert.equal(typeConflictHarness.counts.title, 0);

let savedFeed = null;
const repository = {
  async claimRefresh() {
    return { feedEnabled: true, today, isoWeek: "2026-W37", refresh: true, fenceToken: 9,
      feed: null, requestMode: "scheduled", claimStatus: "claimed", attemptCount: 1, maxAttempts: 1 };
  },
  async loadSources() { return sources; },
  async saveFeed(feed) { savedFeed = feed; },
  async readFeed({ fenceToken }) {
    return { ok: true, status: "verified", feed: savedFeed, fenceToken,
      provenance: { itemCount: 50, sourceCount: 5, sourceIds: ENTDECKEN_FLIXPATROL_SOURCE_IDS, rightsStatus: "owner_private" } };
  },
  async markFailure() { throw new Error("unexpected failure"); },
};
const integrated = await runEntdeckenDailyRefresh({ repository, adapter: warm });
assert.equal(integrated.status, "fresh");
assert.equal(integrated.writes, 1);
assert.equal(integrated.feedReadback.schemaVersion, "entdecken-flixpatrol-daily-readback-v1");
assert.equal(integrated.feedReadback.providerRequests, 0);

let failureMarked = null;
const failed = await runEntdeckenDailyRefresh({
  repository: {
    async claimRefresh() {
      return { feedEnabled: true, today, isoWeek: "2026-W37", refresh: true, fenceToken: 10,
        feed: evaluated.feed, requestMode: "scheduled", claimStatus: "claimed", attemptCount: 1, maxAttempts: 1 };
    },
    async loadSources() { return sources; },
    async saveFeed() { throw new Error("must not save"); },
    async markFailure(value) { failureMarked = value; },
  },
  adapter: { mode: "flixpatrol-mix", async search() { throw new Error("flixpatrol_mix_chart_incomplete"); } },
});
assert.equal(failed.reason, "source_error");
assert.equal(failed.writes, 0);
assert.deepEqual(failed.feed, evaluated.feed);
assert.equal(failureMarked.code, "source_error");

console.log("Entdecken FlixPatrol adapter/runner: 37 checks passed");
