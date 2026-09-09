import { FLIXPATROL_AT_SOURCES } from "../_shared/flixpatrolData.js";
import { normalizeEntdeckenFlixPatrolFact } from "../_shared/entdeckenFacts.js";
import {
  ENTDECKEN_MIXED_MARKET_COUNTS,
  ENTDECKEN_NETFLIX_SOURCE_ID,
  ENTDECKEN_OEFI_SOURCE_ID,
  createMixedPublicChartAdapter,
} from "./publicMixAdapter.js";

export const ENTDECKEN_FLIXPATROL_FEED_FORMAT = 8;
export const ENTDECKEN_FLIXPATROL_FEED_ID = "public:daily-market-mix-at-v2";
export const ENTDECKEN_FLIXPATROL_SOURCE_ID = "chart:daily-market-mix-at";
export const ENTDECKEN_FLIXPATROL_POOL_SIZE = 50;
export const ENTDECKEN_FLIXPATROL_PUBLIC_REQUESTS = 2;
export const ENTDECKEN_FLIXPATROL_MAX_CHART_REQUESTS = 5;
export const ENTDECKEN_FLIXPATROL_MAX_TITLE_REQUESTS = 25;
export const ENTDECKEN_FLIXPATROL_MAX_SOURCE_REQUESTS = 32;
export const ENTDECKEN_FLIXPATROL_TITLE_TTL_DAYS = 30;
export const ENTDECKEN_FLIXPATROL_NEGATIVE_TTL_DAYS = 1;

export const ENTDECKEN_FLIXPATROL_SOURCES = Object.freeze({
  prime: Object.freeze({
    sourceId: "chart:flixpatrol-prime-at",
    sourceLabel: "Prime Video · Top 10 Österreich (FlixPatrol)",
    service: "Prime Video",
    companyId: FLIXPATROL_AT_SOURCES.companies.prime.id,
    sourceUrl: "https://flixpatrol.com/top10/amazon-prime/austria/",
  }),
  disney: Object.freeze({
    sourceId: "chart:flixpatrol-disney-at",
    sourceLabel: "Disney+ · Top 10 Österreich (FlixPatrol)",
    service: "Disney+",
    companyId: FLIXPATROL_AT_SOURCES.companies.disney.id,
    sourceUrl: "https://flixpatrol.com/top10/disney/austria/",
  }),
  apple: Object.freeze({
    sourceId: "chart:flixpatrol-apple-tv-at",
    sourceLabel: "Apple TV · Top 10 Österreich (FlixPatrol)",
    service: "Apple TV",
    companyId: FLIXPATROL_AT_SOURCES.companies.appleTv.id,
    sourceUrl: "https://flixpatrol.com/top10/apple-tv/austria/",
  }),
});

export const ENTDECKEN_FLIXPATROL_SOURCE_IDS = Object.freeze([
  ENTDECKEN_OEFI_SOURCE_ID,
  ENTDECKEN_NETFLIX_SOURCE_ID,
  ENTDECKEN_FLIXPATROL_SOURCES.prime.sourceId,
  ENTDECKEN_FLIXPATROL_SOURCES.disney.sourceId,
  ENTDECKEN_FLIXPATROL_SOURCES.apple.sourceId,
]);

export const ENTDECKEN_FLIXPATROL_SOURCE_COUNTS = Object.freeze({
  [ENTDECKEN_OEFI_SOURCE_ID]: 15,
  [ENTDECKEN_NETFLIX_SOURCE_ID]: 10,
  [ENTDECKEN_FLIXPATROL_SOURCES.prime.sourceId]: 10,
  [ENTDECKEN_FLIXPATROL_SOURCES.disney.sourceId]: 10,
  [ENTDECKEN_FLIXPATROL_SOURCES.apple.sourceId]: 5,
});

const CHART_SPECS = Object.freeze([
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.prime, chartType: "movies", mediaType: "film", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.prime, chartType: "tvshows", mediaType: "series", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.disney, chartType: "movies", mediaType: "film", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.disney, chartType: "tvshows", mediaType: "series", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.apple, chartType: "movies", mediaType: "film", take: 5 }),
]);

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function canonicalInstant(value) {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function previousUtcDay(day) {
  if (!validDay(day)) return null;
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
}
function failureCode(error) {
  return ({
    FLIXPATROL_TRANSPORT_ERROR: "transport_error",
    FLIXPATROL_HTTP_ERROR: "http_error",
    FLIXPATROL_INVALID_RESPONSE: "invalid_response",
  })[error?.code] || "storage_error";
}
function plusDays(instant, days) {
  return new Date(Date.parse(instant) + days * 86_400_000).toISOString();
}
function normalizedTitle(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("de-AT")
    .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/gu, " ").trim();
}
function identityKey(mediaType, title) {
  const normalized = normalizedTitle(title);
  return normalized && ["film", "series"].includes(mediaType) ? `${mediaType}|${normalized}` : null;
}
function checkedChartItems(items, spec) {
  if (!Array.isArray(items) || items.length < spec.take || items.length > 10) return null;
  const ranks = new Set();
  const ids = new Set();
  for (const item of items) {
    if (!item || item.mediaType !== spec.mediaType
        || !/^ttl_[A-Za-z0-9]{20,40}$/.test(item.sourceId || "")
        || !Number.isInteger(item.ranking) || item.ranking < 1 || item.ranking > 10
        || ranks.has(item.ranking) || ids.has(item.sourceId)) return null;
    ranks.add(item.ranking); ids.add(item.sourceId);
  }
  return Object.freeze([...items].sort((a, b) => a.ranking - b.ranking));
}
function checkedChart(value, spec, chartDate) {
  const chart = value?.ok === true ? value.chart : null;
  const fetchedAt = canonicalInstant(chart?.fetchedAt);
  const freshUntil = canonicalInstant(chart?.freshUntil);
  const items = checkedChartItems(chart?.items, spec);
  if (!chart || chart.companyId !== spec.source.companyId
      || chart.countryId !== FLIXPATROL_AT_SOURCES.country.id
      || chart.chartType !== spec.chartType || chart.chartDate !== chartDate
      || chart.fresh !== true || !fetchedAt || !freshUntil
      || !items) return null;
  return Object.freeze({
    ...chart, fetchedAt, freshUntil,
    items,
  });
}
function selectedChartRows(charts, titleById, publicItems) {
  const seen = new Set();
  const identities = new Set(publicItems.map((item) => identityKey(item?.mediaType, item?.title)).filter(Boolean));
  const rows = [];
  for (const { chart, spec } of charts) {
    const selected = [];
    for (const item of chart.items) {
      const cached = titleById.get(item.sourceId);
      if (cached?.mediaType && cached.mediaType !== spec.mediaType) {
        throw new Error("flixpatrol_mix_media_type_conflict");
      }
      if (cached?.fresh === true && ["not_found", "incomplete_blocked"].includes(cached.status)) continue;
      if (seen.has(item.sourceId)) continue;
      const cachedFact = normalizeEntdeckenFlixPatrolFact(cached);
      const cachedIdentity = cachedFact ? identityKey(cachedFact.mediaType, cachedFact.title) : null;
      if (cachedIdentity && identities.has(cachedIdentity)) continue;
      seen.add(item.sourceId);
      if (cachedIdentity) identities.add(cachedIdentity);
      selected.push(Object.freeze({ ...item, spec, chart }));
      if (selected.length === spec.take) break;
    }
    if (selected.length !== spec.take) throw new Error("flixpatrol_mix_unique_scope_unproven");
    rows.push(...selected);
  }
  return Object.freeze(rows);
}
function rpcItems(value) {
  return value?.ok === true && Array.isArray(value.items) ? value.items : null;
}
function flixpatrolItem(row, fact) {
  return Object.freeze({
    title: fact.title,
    sourceItemId: fact.sourceId,
    sourceId: row.spec.source.sourceId,
    sourceLabel: row.spec.source.sourceLabel,
    mediaType: fact.mediaType,
    releaseYear: fact.releaseYear,
    externalIds: fact.externalIds,
    genres: Object.freeze([]),
    availability: Object.freeze({
      region: "AT", market: "streaming", service: row.spec.source.service,
      licenseTypes: Object.freeze(["SVOD"]),
    }),
    popularity: Object.freeze({
      metric: "daily-provider-rank", rank: row.ranking,
      measuredOn: row.chart.chartDate, value: null,
    }),
    sourceUrl: row.spec.source.sourceUrl,
    fetchedAt: row.chart.fetchedAt,
  });
}
function publicItem(item) {
  return Object.freeze({
    ...item,
    releaseYear: null,
    externalIds: Object.freeze({}),
  });
}

/** @param {any} options */
export function createFlixPatrolMixAdapter({
  publicAdapter = createMixedPublicChartAdapter(),
  providerConfigured = true,
  client,
  readChart,
  readTitles,
  saveChart,
  saveTitle,
  saveTitleMiss,
  recordFailure,
  now = () => new Date().toISOString(),
} = {}) {
  let telemetry = Object.freeze({
    providerRequests: 0,
    publicSourceRequests: 0,
    flixpatrolChartRequests: 0,
    flixpatrolTitleRequests: 0,
    flixpatrolRequests: 0,
    sourceRequests: 0,
    sourceItemCount: 0,
    eligibleUniqueCount: 0,
  });
  const updateTelemetry = (patch = {}) => {
    const next = { ...telemetry, ...patch };
    next.flixpatrolRequests = next.flixpatrolChartRequests + next.flixpatrolTitleRequests;
    next.sourceRequests = next.publicSourceRequests + next.flixpatrolRequests;
    telemetry = Object.freeze(next);
  };
  const configured = providerConfigured === true
    && publicAdapter?.mode === "public-mix" && typeof publicAdapter.search === "function"
    && client && typeof client.fetchTop10 === "function" && typeof client.fetchTitle === "function"
    && [readChart, readTitles, saveChart, saveTitle, saveTitleMiss, recordFailure]
      .every((fn) => typeof fn === "function") && typeof now === "function";

  return Object.freeze({
    mode: "flixpatrol-mix",
    async search(queryContext, { retrievedOn, claimedIsoWeek } = {}) {
      if (!configured || !validDay(retrievedOn) || !/^\d{4}-W\d{2}$/.test(claimedIsoWeek || "")) {
        throw new Error("flixpatrol_mix_setup_invalid");
      }
      const checkedAt = now();
      if (!canonicalInstant(checkedAt) || canonicalInstant(checkedAt) !== checkedAt) {
        throw new Error("flixpatrol_mix_clock_invalid");
      }
      const chartDate = previousUtcDay(retrievedOn);

      const publicEnvelope = await publicAdapter.search(queryContext, { retrievedOn, claimedIsoWeek });
      updateTelemetry({ publicSourceRequests: Number(publicAdapter.telemetry?.().sourceRequests) || 0 });
      if (telemetry.publicSourceRequests !== ENTDECKEN_FLIXPATROL_PUBLIC_REQUESTS
          || publicEnvelope?.sourceMode !== "public-mix" || !Array.isArray(publicEnvelope.items)
          || publicEnvelope.items.length !== ENTDECKEN_MIXED_MARKET_COUNTS.cinema
            + ENTDECKEN_MIXED_MARKET_COUNTS.streamingFilm + ENTDECKEN_MIXED_MARKET_COUNTS.streamingSeries) {
        throw new Error("flixpatrol_mix_public_invalid");
      }

      const charts = [];
      for (const spec of CHART_SPECS) {
        let chart = checkedChart(await readChart({
          companyId: spec.source.companyId,
          countryId: FLIXPATROL_AT_SOURCES.country.id,
          chartType: spec.chartType,
        }), spec, chartDate);
        if (!chart) {
          if (telemetry.flixpatrolChartRequests >= ENTDECKEN_FLIXPATROL_MAX_CHART_REQUESTS) {
            throw new Error("flixpatrol_mix_chart_cap_reached");
          }
          let fetched;
          try {
            fetched = await client.fetchTop10({
              companyId: spec.source.companyId,
              countryId: FLIXPATROL_AT_SOURCES.country.id,
              chartType: spec.chartType,
              date: chartDate,
            });
            updateTelemetry({ flixpatrolChartRequests: telemetry.flixpatrolChartRequests + 1 });
          } catch (error) {
            updateTelemetry({ flixpatrolChartRequests: telemetry.flixpatrolChartRequests + (error?.providerRequests || 0) });
            if (error?.operationId) await recordFailure({
              operationId: error.operationId, resourceType: "chart",
              sourceId: spec.source.companyId, mediaType: spec.mediaType,
              errorCode: failureCode(error), failedAt: checkedAt,
            });
            throw error;
          }
          const fetchedItems = checkedChartItems(fetched.items, spec);
          if (!fetchedItems) {
            await recordFailure({
              operationId: fetched.operationId, resourceType: "chart",
              sourceId: spec.source.companyId, mediaType: spec.mediaType,
              errorCode: "invalid_response", failedAt: checkedAt,
            });
            throw new Error("flixpatrol_mix_chart_incomplete");
          }
          try {
            const saved = await saveChart({
              companyId: spec.source.companyId,
              countryId: FLIXPATROL_AT_SOURCES.country.id,
              chartType: spec.chartType,
              chartDate,
              items: fetchedItems,
              fetchedAt: checkedAt,
              freshUntil: plusDays(checkedAt, 1),
            });
            if (saved?.ok !== true) throw new Error("flixpatrol_mix_chart_checkpoint_failed");
            chart = checkedChart(await readChart({
              companyId: spec.source.companyId,
              countryId: FLIXPATROL_AT_SOURCES.country.id,
              chartType: spec.chartType,
            }), spec, chartDate);
            if (!chart) throw new Error("flixpatrol_mix_chart_readback_failed");
          } catch (error) {
            await recordFailure({
              operationId: fetched.operationId, resourceType: "chart",
              sourceId: spec.source.companyId, mediaType: spec.mediaType,
              errorCode: "storage_error", failedAt: checkedAt,
            });
            throw error;
          }
        }
        charts.push(Object.freeze({ spec, chart }));
      }

      const chartIds = [...new Set(charts.flatMap(({ chart }) => chart.items.map((item) => item.sourceId)))];
      if (chartIds.length < 25 || chartIds.length > 50) throw new Error("flixpatrol_mix_chart_ids_invalid");
      let titleRows = rpcItems(await readTitles(chartIds));
      if (!titleRows) throw new Error("flixpatrol_mix_titles_read_failed");
      if (new Set(titleRows.map((row) => row?.sourceId)).size !== titleRows.length
          || titleRows.some((row) => !chartIds.includes(row?.sourceId))) {
        throw new Error("flixpatrol_mix_titles_read_invalid");
      }
      let titleById = new Map(titleRows.map((row) => [row.sourceId, row]));
      const selected = selectedChartRows(charts, titleById, publicEnvelope.items);
      const selectedIds = selected.map((row) => row.sourceId);
      for (const row of selected) {
        const cached = titleById.get(row.sourceId);
        if (cached?.mediaType && cached.mediaType !== row.spec.mediaType) {
          throw new Error("flixpatrol_mix_media_type_conflict");
        }
        if (normalizeEntdeckenFlixPatrolFact(cached, { requireFresh: true })) continue;
        if (cached?.fresh === true && cached.status !== "unresolved") {
          throw new Error("flixpatrol_mix_title_cache_incomplete");
        }
        if (telemetry.flixpatrolTitleRequests >= ENTDECKEN_FLIXPATROL_MAX_TITLE_REQUESTS) {
          throw new Error("flixpatrol_mix_title_cap_reached");
        }
        let operationId = null;
        try {
          const fetched = await client.fetchTitle({ sourceId: row.sourceId, mediaType: row.spec.mediaType });
          operationId = fetched.operationId;
          updateTelemetry({ flixpatrolTitleRequests: telemetry.flixpatrolTitleRequests + 1 });
          const saved = await saveTitle({
            title: fetched.title,
            fetchedAt: checkedAt,
            freshUntil: plusDays(checkedAt, ENTDECKEN_FLIXPATROL_TITLE_TTL_DAYS),
          });
          if (saved?.ok !== true) throw new Error("flixpatrol_mix_title_checkpoint_failed");
        } catch (error) {
          updateTelemetry({ flixpatrolTitleRequests: telemetry.flixpatrolTitleRequests + (error?.providerRequests || 0) });
          const negativeStatus = error?.code === "FLIXPATROL_HTTP_ERROR" && error?.httpStatus === 404
            ? "not_found" : error?.code === "FLIXPATROL_INVALID_RESPONSE" ? "incomplete_blocked" : null;
          if (negativeStatus) await saveTitleMiss({
            sourceId: row.sourceId, mediaType: row.spec.mediaType, status: negativeStatus,
            checkedAt, freshUntil: plusDays(checkedAt, ENTDECKEN_FLIXPATROL_NEGATIVE_TTL_DAYS),
          });
          if (error?.operationId || operationId) await recordFailure({
            operationId: error.operationId || operationId, resourceType: "title", sourceId: row.sourceId,
            mediaType: row.spec.mediaType, errorCode: failureCode(error), failedAt: checkedAt,
          });
          throw error;
        }
      }

      titleRows = rpcItems(await readTitles(selectedIds));
      if (!titleRows || titleRows.length !== selectedIds.length) {
        throw new Error("flixpatrol_mix_titles_readback_incomplete");
      }
      titleById = new Map(titleRows.map((row) => [row.sourceId, row]));
      const fpItems = selected.map((row) => {
        const fact = normalizeEntdeckenFlixPatrolFact(titleById.get(row.sourceId), { requireFresh: true });
        if (!fact || fact.mediaType !== row.spec.mediaType) throw new Error("flixpatrol_mix_title_fact_invalid");
        return flixpatrolItem(row, fact);
      });
      const items = [...publicEnvelope.items.map(publicItem), ...fpItems];
      const identities = new Set();
      for (const item of items) {
        const key = `${item.mediaType}|${normalizedTitle(item.title)}`;
        if (!normalizedTitle(item.title) || identities.has(key)) {
          throw new Error("flixpatrol_mix_unique_scope_unproven");
        }
        identities.add(key);
      }
      if (items.length !== ENTDECKEN_FLIXPATROL_POOL_SIZE) throw new Error("flixpatrol_mix_pool_incomplete");
      updateTelemetry({
        sourceItemCount: publicEnvelope.items.length + charts.reduce((sum, entry) => sum + entry.chart.items.length, 0),
        eligibleUniqueCount: items.length,
      });
      return Object.freeze({
        sourceMode: "flixpatrol-mix",
        sourceId: ENTDECKEN_FLIXPATROL_SOURCE_ID,
        sourceIds: ENTDECKEN_FLIXPATROL_SOURCE_IDS,
        queryContext,
        checkedAt,
        retrievedOn,
        isoWeek: claimedIsoWeek,
        chartDate,
        items: Object.freeze(items),
      });
    },
    telemetry() { return telemetry; },
  });
}
