import { FLIXPATROL_AT_SOURCES } from "../_shared/flixpatrolData.js";
import { normalizeEntdeckenFlixPatrolFact } from "../_shared/entdeckenFacts.js";
import {
  ENTDECKEN_MIXED_MARKET_COUNTS,
  ENTDECKEN_NETFLIX_SOURCE_ID,
  ENTDECKEN_OEFI_SOURCE_ID,
  createMixedPublicChartAdapter,
  createOefiPublicChartAdapter,
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

/* Format 9 ist absichtlich ein eigener Vertrag. Er darf erst gewählt werden,
   wenn der Batchvertrag praktisch belegt und beide ausgelieferten Consumer
   kompatibel sind. Diese Konstanten allein aktivieren nichts. */
export const ENTDECKEN_FLIXPATROL_BATCH_MODE = "verified-id-in-v1";
export const ENTDECKEN_FLIXPATROL_FORMAT_9_CONSUMERS = "format-9-ready-v1";
export const ENTDECKEN_FLIXPATROL_DAILY_FEED_FORMAT = 9;
export const ENTDECKEN_FLIXPATROL_DAILY_FEED_ID = "public:daily-flixpatrol-market-mix-at-v1";
export const ENTDECKEN_FLIXPATROL_DAILY_SOURCE_ID = "chart:daily-flixpatrol-market-mix-at";
export const ENTDECKEN_FLIXPATROL_DAILY_PUBLIC_REQUESTS = 1;
export const ENTDECKEN_FLIXPATROL_DAILY_MAX_CHART_REQUESTS = 7;
export const ENTDECKEN_FLIXPATROL_DAILY_MAX_TITLE_REQUESTS = 4;
export const ENTDECKEN_FLIXPATROL_MAX_VOCABULARY_REQUESTS_PER_KIND = 1;
export const ENTDECKEN_FLIXPATROL_TITLE_BATCH_SIZE = 10;
export const ENTDECKEN_FLIXPATROL_VOCABULARY_TTL_DAYS = 30;

export const ENTDECKEN_FLIXPATROL_SOURCES = Object.freeze({
  netflix: Object.freeze({
    sourceId: "chart:flixpatrol-netflix-at",
    sourceLabel: "Netflix · Top 10 Österreich (FlixPatrol)",
    service: "Netflix",
    companyId: "cmp_IA6TdMqwf6kuyQvxo9bJ4nKX",
    sourceUrl: "https://flixpatrol.com/top10/netflix/austria/",
  }),
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
export const ENTDECKEN_FLIXPATROL_DAILY_SOURCE_IDS = Object.freeze([
  ENTDECKEN_OEFI_SOURCE_ID,
  ENTDECKEN_FLIXPATROL_SOURCES.netflix.sourceId,
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
export const ENTDECKEN_FLIXPATROL_DAILY_SOURCE_COUNTS = Object.freeze({
  [ENTDECKEN_OEFI_SOURCE_ID]: 15,
  [ENTDECKEN_FLIXPATROL_SOURCES.netflix.sourceId]: 10,
  [ENTDECKEN_FLIXPATROL_SOURCES.prime.sourceId]: 10,
  [ENTDECKEN_FLIXPATROL_SOURCES.disney.sourceId]: 10,
  [ENTDECKEN_FLIXPATROL_SOURCES.apple.sourceId]: 5,
});

const PROVIDER_CHART_SPECS = Object.freeze([
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.prime, chartType: "movies", mediaType: "film", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.prime, chartType: "tvshows", mediaType: "series", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.disney, chartType: "movies", mediaType: "film", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.disney, chartType: "tvshows", mediaType: "series", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.apple, chartType: "movies", mediaType: "film", take: 5 }),
]);
const NETFLIX_CHART_SPECS = Object.freeze([
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.netflix, chartType: "movies", mediaType: "film", take: 5 }),
  Object.freeze({ source: ENTDECKEN_FLIXPATROL_SOURCES.netflix, chartType: "tvshows", mediaType: "series", take: 5 }),
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
function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
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
      || chart.fresh !== true || !fetchedAt || !freshUntil || !items) return null;
  return Object.freeze({ ...chart, fetchedAt, freshUntil, items });
}
function selectedChartRows(charts, titleById, publicItems) {
  const seen = new Set();
  const identities = new Set(publicItems.map((item) => identityKey(item?.mediaType, item?.title)).filter(Boolean));
  const rows = [];
  for (const { chart, spec } of charts) {
    const selected = [];
    for (const item of chart.items) {
      const cached = titleById.get(item.sourceId);
      if (cached?.mediaType && cached.mediaType !== spec.mediaType) throw new Error("flixpatrol_mix_media_type_conflict");
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
function rpcItems(value) { return value?.ok === true && Array.isArray(value.items) ? value.items : null; }
function flixpatrolItem(row, fact, { format9 = false } = {}) {
  return Object.freeze({
    title: fact.title,
    sourceItemId: fact.sourceId,
    sourceId: row.spec.source.sourceId,
    sourceLabel: row.spec.source.sourceLabel,
    mediaType: fact.mediaType,
    releaseYear: fact.releaseYear,
    externalIds: fact.externalIds,
    genres: Object.freeze([...fact.cacheLabels]),
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
    ...(format9 ? { availabilityConfirmed: false } : {}),
  });
}
function publicItem(item, { format9 = false } = {}) {
  return Object.freeze({
    ...item,
    releaseYear: null,
    externalIds: Object.freeze({}),
    ...(format9 ? { availabilityConfirmed: false } : {}),
  });
}
function checkedVocabularyRows(value, resourceType, sourceIds) {
  const items = rpcItems(value);
  if (!items) return null;
  const expected = new Set(sourceIds);
  const pattern = resourceType === "genres" ? /^gnr_[A-Za-z0-9]{20,40}$/ : /^kwd_[A-Za-z0-9]{20,40}$/;
  if (items.some((item) => !item || !pattern.test(item.sourceId || "") || !expected.has(item.sourceId)
      || typeof item.name !== "string" || item.name.trim() !== item.name || !item.name
      || typeof item.fresh !== "boolean")
      || new Set(items.map((item) => item.sourceId)).size !== items.length) return null;
  return items;
}

/** @param {any} options */
export function createFlixPatrolMixAdapter({
  publicAdapter = createMixedPublicChartAdapter(),
  dailyPublicAdapter = createOefiPublicChartAdapter(),
  providerConfigured = true,
  titleRequestMode = "single",
  netflixDaily = false,
  format9Consumers = null,
  client,
  readChart,
  readTitles,
  readVocabulary,
  saveChart,
  saveTitle,
  saveTitleMiss,
  saveVocabulary,
  recordFailure,
  now = () => new Date().toISOString(),
} = {}) {
  const batchEnabled = titleRequestMode === ENTDECKEN_FLIXPATROL_BATCH_MODE;
  const format9 = netflixDaily === true;
  const format9GatesSatisfied = !format9 || (
    batchEnabled && format9Consumers === ENTDECKEN_FLIXPATROL_FORMAT_9_CONSUMERS
  );
  const activePublicAdapter = format9 ? dailyPublicAdapter : publicAdapter;
  const chartSpecs = Object.freeze(format9 ? [...NETFLIX_CHART_SPECS, ...PROVIDER_CHART_SPECS] : [...PROVIDER_CHART_SPECS]);
  const expectedPublicRequests = format9
    ? ENTDECKEN_FLIXPATROL_DAILY_PUBLIC_REQUESTS : ENTDECKEN_FLIXPATROL_PUBLIC_REQUESTS;
  const maxChartRequests = format9
    ? ENTDECKEN_FLIXPATROL_DAILY_MAX_CHART_REQUESTS : ENTDECKEN_FLIXPATROL_MAX_CHART_REQUESTS;
  const maxTitleRequests = batchEnabled
    ? (format9 ? ENTDECKEN_FLIXPATROL_DAILY_MAX_TITLE_REQUESTS : 3)
    : ENTDECKEN_FLIXPATROL_MAX_TITLE_REQUESTS;
  let telemetry = Object.freeze({
    providerRequests: 0,
    publicSourceRequests: 0,
    flixpatrolChartRequests: 0,
    flixpatrolTitleRequests: 0,
    ...(batchEnabled ? { flixpatrolGenreRequests: 0, flixpatrolKeywordRequests: 0 } : {}),
    flixpatrolRequests: 0,
    sourceRequests: 0,
    sourceItemCount: 0,
    eligibleUniqueCount: 0,
  });
  const updateTelemetry = (patch = {}) => {
    const next = { ...telemetry, ...patch };
    next.flixpatrolRequests = next.flixpatrolChartRequests + next.flixpatrolTitleRequests
      + (next.flixpatrolGenreRequests || 0) + (next.flixpatrolKeywordRequests || 0);
    next.sourceRequests = next.publicSourceRequests + next.flixpatrolRequests;
    telemetry = Object.freeze(next);
  };
  const commonConfigured = providerConfigured === true && format9GatesSatisfied
    && activePublicAdapter && typeof activePublicAdapter.search === "function"
    && client && typeof client.fetchTop10 === "function"
    && [readChart, readTitles, saveChart, saveTitle, saveTitleMiss, recordFailure]
      .every((fn) => typeof fn === "function") && typeof now === "function";
  const configured = commonConfigured && (!batchEnabled || (
    typeof client.fetchTitles === "function" && typeof client.fetchGenres === "function"
    && typeof client.fetchKeywords === "function" && typeof readVocabulary === "function"
    && typeof saveVocabulary === "function"
  ));

  const readTitleRows = async (sourceIds) => {
    const rows = [];
    for (const sourceChunk of chunks(sourceIds, 50)) {
      const part = rpcItems(await readTitles(sourceChunk));
      if (!part) throw new Error("flixpatrol_mix_titles_read_failed");
      rows.push(...part);
    }
    if (new Set(rows.map((row) => row?.sourceId)).size !== rows.length
        || rows.some((row) => !sourceIds.includes(row?.sourceId))) {
      throw new Error("flixpatrol_mix_titles_read_invalid");
    }
    return rows;
  };

  const checkpointBatch = async (rows, checkedAt) => {
    if (!rows.length) return;
    for (const batch of chunks(rows, ENTDECKEN_FLIXPATROL_TITLE_BATCH_SIZE)) {
      if (telemetry.flixpatrolTitleRequests >= maxTitleRequests) throw new Error("flixpatrol_mix_title_cap_reached");
      let fetched;
      try {
        fetched = await client.fetchTitles({
          sourceIds: batch.map((row) => row.sourceId),
          mediaTypes: batch.map((row) => row.spec.mediaType),
        });
        updateTelemetry({ flixpatrolTitleRequests: telemetry.flixpatrolTitleRequests + 1 });
        if (!Array.isArray(fetched.items) || fetched.items.length !== batch.length) {
          throw new Error("flixpatrol_mix_title_batch_incomplete");
        }
        for (const title of fetched.items) {
          const saved = await saveTitle({
            title, fetchedAt: checkedAt,
            freshUntil: plusDays(checkedAt, ENTDECKEN_FLIXPATROL_TITLE_TTL_DAYS),
          });
          if (saved?.ok !== true) throw new Error("flixpatrol_mix_title_checkpoint_failed");
        }
      } catch (error) {
        updateTelemetry({ flixpatrolTitleRequests: telemetry.flixpatrolTitleRequests + (error?.providerRequests || 0) });
        /* Ein Batchfehler ist nicht sicher einem Einzeltitel zurechenbar. Der
           gezählte Ledgerbeleg bleibt maßgeblich; es entsteht kein falscher
           titelbezogener Failure-Record und kein Einzel-Fallback. */
        throw error;
      }
    }
  };

  const checkpointSingles = async (rows, titleById, checkedAt) => {
    for (const row of rows) {
      const cached = titleById.get(row.sourceId);
      if (normalizeEntdeckenFlixPatrolFact(cached, { requireFresh: true })) continue;
      if (cached?.fresh === true && cached.status !== "unresolved") throw new Error("flixpatrol_mix_title_cache_incomplete");
      if (telemetry.flixpatrolTitleRequests >= maxTitleRequests) throw new Error("flixpatrol_mix_title_cap_reached");
      let operationId = null;
      try {
        const fetched = await client.fetchTitle({ sourceId: row.sourceId, mediaType: row.spec.mediaType });
        operationId = fetched.operationId;
        updateTelemetry({ flixpatrolTitleRequests: telemetry.flixpatrolTitleRequests + 1 });
        const saved = await saveTitle({
          title: fetched.title, fetchedAt: checkedAt,
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
  };

  const refreshVocabulary = async (titleRows, checkedAt) => {
    const accepted = { genres: new Set(), keywords: new Set() };
    if (!batchEnabled) return accepted;
    const genreMediaTypes = new Map();
    for (const row of titleRows) {
      if (!row?.genreId) continue;
      const mediaTypes = genreMediaTypes.get(row.genreId) || new Set();
      mediaTypes.add(row.mediaType);
      genreMediaTypes.set(row.genreId, mediaTypes);
    }
    const genreMatchesTitles = (item) => {
      const mediaTypes = genreMediaTypes.get(item?.sourceId);
      return mediaTypes?.size === 1 && mediaTypes.has(item?.mediaType);
    };
    for (const [resourceType, idField, fetchName, telemetryName, sourceUrl] of [
      ["genres", "genreId", "fetchGenres", "flixpatrolGenreRequests", "https://flixpatrol.com/api2/endpoint-genres/"],
      ["keywords", "keywordId", "fetchKeywords", "flixpatrolKeywordRequests", "https://flixpatrol.com/api2/endpoint-keywords/"],
    ]) {
      const ids = [...new Set(titleRows.map((row) => row?.[idField]).filter(Boolean))];
      if (!ids.length) continue;
      const cached = [];
      for (const idChunk of chunks(ids, 10)) {
        const rows = checkedVocabularyRows(
          await readVocabulary({ resourceType, sourceIds: idChunk }), resourceType, idChunk,
        );
        if (!rows) throw new Error("flixpatrol_mix_vocabulary_read_invalid");
        cached.push(...rows);
      }
      const cachedById = new Map(cached.map((row) => [row.sourceId, row]));
      for (const id of ids) {
        const row = cachedById.get(id);
        if (row?.fresh === true && (resourceType !== "genres" || genreMatchesTitles(row))) {
          accepted[resourceType].add(id);
        }
      }
      const fetchableMissing = ids.filter((id) => !accepted[resourceType].has(id)
        && (resourceType !== "genres" || genreMediaTypes.get(id)?.size === 1));
      const missing = fetchableMissing.slice(0, 10);
      if (!missing.length) continue;
      if (telemetry[telemetryName] >= ENTDECKEN_FLIXPATROL_MAX_VOCABULARY_REQUESTS_PER_KIND) {
        throw new Error("flixpatrol_mix_vocabulary_cap_reached");
      }
      let fetched;
      try {
        fetched = await client[fetchName]({ sourceIds: missing });
        updateTelemetry({ [telemetryName]: telemetry[telemetryName] + 1 });
        const fetchedIds = Array.isArray(fetched.items)
          ? fetched.items.map((item) => item?.sourceId) : [];
        if (!Array.isArray(fetched.items) || fetched.items.length !== missing.length
            || new Set(fetchedIds).size !== missing.length
            || missing.some((id) => !fetchedIds.includes(id))
            || (resourceType === "genres" && fetched.items.some((item) => !genreMatchesTitles(item)))) {
          throw new Error("flixpatrol_mix_vocabulary_batch_incomplete");
        }
        for (const item of fetched.items) {
          const saved = await saveVocabulary({
            resourceType, sourceId: item.sourceId, name: item.name,
            mediaType: item.mediaType, providerType: item.providerType,
            providerUpdatedAt: null, checkedAt,
            freshUntil: plusDays(checkedAt, ENTDECKEN_FLIXPATROL_VOCABULARY_TTL_DAYS), sourceUrl,
          });
          if (saved?.ok !== true) throw new Error("flixpatrol_mix_vocabulary_checkpoint_failed");
          accepted[resourceType].add(item.sourceId);
        }
      } catch (error) {
        updateTelemetry({ [telemetryName]: telemetry[telemetryName] + (error?.providerRequests || 0) });
        /* Der Request ist im gemeinsamen Ledger bereits als genres/keywords
           gezählt. Das alte Failure-Schema kennt nur Charts und Einzeltitel. */
        throw error;
      }
    }
    return accepted;
  };

  return Object.freeze({
    mode: "flixpatrol-mix",
    feedFormat: format9 ? ENTDECKEN_FLIXPATROL_DAILY_FEED_FORMAT : ENTDECKEN_FLIXPATROL_FEED_FORMAT,
    async search(queryContext, { retrievedOn, claimedIsoWeek } = {}) {
      if (!configured || !validDay(retrievedOn) || !/^\d{4}-W\d{2}$/.test(claimedIsoWeek || "")) {
        throw new Error("flixpatrol_mix_setup_invalid");
      }
      const checkedAt = now();
      if (!canonicalInstant(checkedAt) || canonicalInstant(checkedAt) !== checkedAt) throw new Error("flixpatrol_mix_clock_invalid");
      const chartDate = previousUtcDay(retrievedOn);

      const publicEnvelope = await activePublicAdapter.search(queryContext, { retrievedOn, claimedIsoWeek });
      updateTelemetry({ publicSourceRequests: Number(activePublicAdapter.telemetry?.().sourceRequests) || 0 });
      const expectedPublicMode = format9 ? "public-oefi" : "public-mix";
      const expectedPublicItems = format9 ? ENTDECKEN_MIXED_MARKET_COUNTS.cinema
        : ENTDECKEN_MIXED_MARKET_COUNTS.cinema + ENTDECKEN_MIXED_MARKET_COUNTS.streamingFilm
          + ENTDECKEN_MIXED_MARKET_COUNTS.streamingSeries;
      if (telemetry.publicSourceRequests !== expectedPublicRequests
          || publicEnvelope?.sourceMode !== expectedPublicMode || !Array.isArray(publicEnvelope.items)
          || publicEnvelope.items.length !== expectedPublicItems) throw new Error("flixpatrol_mix_public_invalid");

      const charts = [];
      for (const spec of chartSpecs) {
        let chart = checkedChart(await readChart({
          companyId: spec.source.companyId, countryId: FLIXPATROL_AT_SOURCES.country.id, chartType: spec.chartType,
        }), spec, chartDate);
        if (!chart) {
          if (telemetry.flixpatrolChartRequests >= maxChartRequests) throw new Error("flixpatrol_mix_chart_cap_reached");
          let fetched;
          try {
            fetched = await client.fetchTop10({
              companyId: spec.source.companyId, countryId: FLIXPATROL_AT_SOURCES.country.id,
              chartType: spec.chartType, date: chartDate,
            });
            updateTelemetry({ flixpatrolChartRequests: telemetry.flixpatrolChartRequests + 1 });
          } catch (error) {
            updateTelemetry({ flixpatrolChartRequests: telemetry.flixpatrolChartRequests + (error?.providerRequests || 0) });
            if (error?.operationId) await recordFailure({
              operationId: error.operationId, resourceType: "chart", sourceId: spec.source.companyId,
              mediaType: spec.mediaType, errorCode: failureCode(error), failedAt: checkedAt,
            });
            throw error;
          }
          const fetchedItems = checkedChartItems(fetched.items, spec);
          if (!fetchedItems) {
            await recordFailure({
              operationId: fetched.operationId, resourceType: "chart", sourceId: spec.source.companyId,
              mediaType: spec.mediaType, errorCode: "invalid_response", failedAt: checkedAt,
            });
            throw new Error("flixpatrol_mix_chart_incomplete");
          }
          try {
            const saved = await saveChart({
              companyId: spec.source.companyId, countryId: FLIXPATROL_AT_SOURCES.country.id,
              chartType: spec.chartType, chartDate, items: fetchedItems,
              fetchedAt: checkedAt, freshUntil: plusDays(checkedAt, 1),
            });
            if (saved?.ok !== true) throw new Error("flixpatrol_mix_chart_checkpoint_failed");
            chart = checkedChart(await readChart({
              companyId: spec.source.companyId, countryId: FLIXPATROL_AT_SOURCES.country.id,
              chartType: spec.chartType,
            }), spec, chartDate);
            if (!chart) throw new Error("flixpatrol_mix_chart_readback_failed");
          } catch (error) {
            await recordFailure({
              operationId: fetched.operationId, resourceType: "chart", sourceId: spec.source.companyId,
              mediaType: spec.mediaType, errorCode: "storage_error", failedAt: checkedAt,
            });
            throw error;
          }
        }
        charts.push(Object.freeze({ spec, chart }));
      }

      const chartIds = [...new Set(charts.flatMap(({ chart }) => chart.items.map((item) => item.sourceId)))];
      const minChartIds = format9 ? 35 : 25;
      const maxChartIds = format9 ? 70 : 50;
      if (chartIds.length < minChartIds || chartIds.length > maxChartIds) throw new Error("flixpatrol_mix_chart_ids_invalid");
      let titleRows = await readTitleRows(chartIds);
      let titleById = new Map(titleRows.map((row) => [row.sourceId, row]));
      const selected = selectedChartRows(charts, titleById, publicEnvelope.items);
      const selectedIds = selected.map((row) => row.sourceId);
      const missing = selected.filter((row) => {
        const cached = titleById.get(row.sourceId);
        if (cached?.mediaType && cached.mediaType !== row.spec.mediaType) throw new Error("flixpatrol_mix_media_type_conflict");
        if (normalizeEntdeckenFlixPatrolFact(cached, { requireFresh: true })) return false;
        if (cached?.fresh === true && cached.status !== "unresolved") throw new Error("flixpatrol_mix_title_cache_incomplete");
        return true;
      });
      if (batchEnabled) await checkpointBatch(missing, checkedAt);
      else await checkpointSingles(selected, titleById, checkedAt);

      titleRows = await readTitleRows(selectedIds);
      if (titleRows.length !== selectedIds.length) throw new Error("flixpatrol_mix_titles_readback_incomplete");
      const acceptedVocabulary = await refreshVocabulary(titleRows, checkedAt);
      if (batchEnabled) {
        titleRows = await readTitleRows(selectedIds);
        if (titleRows.length !== selectedIds.length) throw new Error("flixpatrol_mix_titles_readback_incomplete");
      }
      titleById = new Map(titleRows.map((row) => [row.sourceId, row]));
      const fpItems = selected.map((row) => {
        const raw = titleById.get(row.sourceId);
        const vocabularyFiltered = batchEnabled ? {
          ...raw,
          genres: Array.isArray(raw?.genres)
            ? raw.genres.filter((entry) => acceptedVocabulary.genres.has(entry?.id)) : raw?.genres,
          keywords: Array.isArray(raw?.keywords)
            ? raw.keywords.filter((entry) => acceptedVocabulary.keywords.has(entry?.id)) : raw?.keywords,
        } : raw;
        const fact = normalizeEntdeckenFlixPatrolFact(vocabularyFiltered, { requireFresh: true });
        if (!fact || fact.mediaType !== row.spec.mediaType) throw new Error("flixpatrol_mix_title_fact_invalid");
        return flixpatrolItem(row, fact, { format9 });
      });
      const items = [...publicEnvelope.items.map((item) => publicItem(item, { format9 })), ...fpItems];
      const identities = new Set();
      for (const item of items) {
        const key = `${item.mediaType}|${normalizedTitle(item.title)}`;
        if (!normalizedTitle(item.title) || identities.has(key)) throw new Error("flixpatrol_mix_unique_scope_unproven");
        identities.add(key);
      }
      if (items.length !== ENTDECKEN_FLIXPATROL_POOL_SIZE) throw new Error("flixpatrol_mix_pool_incomplete");
      updateTelemetry({
        sourceItemCount: publicEnvelope.items.length + charts.reduce((sum, entry) => sum + entry.chart.items.length, 0),
        eligibleUniqueCount: items.length,
      });
      return Object.freeze({
        sourceMode: "flixpatrol-mix",
        sourceId: format9 ? ENTDECKEN_FLIXPATROL_DAILY_SOURCE_ID : ENTDECKEN_FLIXPATROL_SOURCE_ID,
        sourceIds: format9 ? ENTDECKEN_FLIXPATROL_DAILY_SOURCE_IDS : ENTDECKEN_FLIXPATROL_SOURCE_IDS,
        ...(format9 ? { feedFormat: ENTDECKEN_FLIXPATROL_DAILY_FEED_FORMAT } : {}),
        queryContext, checkedAt, retrievedOn, isoWeek: claimedIsoWeek, chartDate,
        items: Object.freeze(items),
      });
    },
    telemetry() { return telemetry; },
  });
}
