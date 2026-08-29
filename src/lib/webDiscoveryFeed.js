/* Globaler Entdecken-Tagesfeed und lokales Fail-closed-Matching.
   Der Feed enthaelt ausschliesslich globale, belegte Webtipps. Aktuelle
   Verfuegbarkeit und persoenliche Passung werden erst im Browser bestimmt. */

import {
  VERSIONED_DISCOVERY_FEED_FORMAT,
  VERSIONED_DISCOVERY_FEED_ID,
  VERSIONED_DISCOVERY_POOL_SIZE,
  VERSIONED_DISCOVERY_POOL_VERSION,
  VERSIONED_DISCOVERY_SOURCE_COUNTS,
  VERSIONED_DISCOVERY_SOURCE_ID,
  VERSIONED_DISCOVERY_SOURCE_IDS,
} from "../data/entdeckenMarketPool50.js";

export {
  VERSIONED_DISCOVERY_FEED_FORMAT,
  VERSIONED_DISCOVERY_FEED_ID,
  VERSIONED_DISCOVERY_POOL_SIZE,
  VERSIONED_DISCOVERY_POOL_VERSION,
  VERSIONED_DISCOVERY_SOURCE_ID,
  VERSIONED_DISCOVERY_SOURCE_IDS,
};

export const WEB_DISCOVERY_FEED_FORMAT = 4;
export const WEB_DISCOVERY_FEED_ID = "websearch:weekly-positive-at";
export const WEB_DISCOVERY_SOURCE_ID = "websearch:weekly-positive";
export const WEB_DISCOVERY_MAX_ITEMS = 20;
export const PUBLIC_DISCOVERY_FEED_FORMAT = 5;
export const PUBLIC_DISCOVERY_FEED_ID = "public:weekly-popular-at";
export const PUBLIC_DISCOVERY_SOURCE_ID = "chart:joyn-at";
export const PUBLIC_DISCOVERY_POOL_SIZE = 50;
export const MIXED_DISCOVERY_FEED_FORMAT = 6;
export const MIXED_DISCOVERY_FEED_ID = "public:weekly-market-mix-at";
export const MIXED_DISCOVERY_SOURCE_ID = "chart:market-mix-at";
export const MIXED_DISCOVERY_SOURCE_IDS = Object.freeze(["chart:netflix-weekly-at", "chart:oefi-weekend-at"]);
export const MIXED_DISCOVERY_POOL_SIZE = 25;
export const MIXED_DISCOVERY_MARKET_COUNTS = Object.freeze({
  cinema: 15, streamingFilm: 5, streamingSeries: 5,
});
export const WEB_DISCOVERY_MATCH_STATUSES = Object.freeze([
  "matched", "unmatched", "ambiguous",
]);

const VERSIONED_SOURCE_POLICY = Object.freeze({
  "chart:oefi-weekend-at": Object.freeze({
    sourceLabel: "Österreichisches Filminstitut", service: null, market: "cinema",
    metric: "weekend-chart-rank", url: "https://filminstitut.at/charts",
  }),
  "chart:netflix-weekly-at": Object.freeze({
    sourceLabel: "Netflix Top 10 Österreich", service: "Netflix", market: "streaming",
    metric: "weekly-country-rank", urls: Object.freeze({
      film: "https://www.netflix.com/tudum/top10/austria/films",
      series: "https://www.netflix.com/tudum/top10/austria/tv",
    }),
  }),
  "snapshot:prime-video-at": Object.freeze({
    sourceLabel: "Prime Video · Aktuell beliebt (FlixPatrol)", service: "Prime Video", market: "streaming",
    metric: "daily-provider-rank", url: "https://flixpatrol.com/top10/amazon-prime/austria/",
  }),
  "snapshot:disney-plus-at": Object.freeze({
    sourceLabel: "Disney+ · Aktuell beliebt (FlixPatrol)", service: "Disney+", market: "streaming",
    metric: "daily-provider-rank", url: "https://flixpatrol.com/top10/disney/austria/",
  }),
  "snapshot:apple-tv-plus-at": Object.freeze({
    sourceLabel: "Apple TV+ · Aktuell beliebt (FlixPatrol)", service: "Apple TV+", market: "streaming",
    metric: "daily-provider-rank", url: "https://flixpatrol.com/top10/apple-tv/austria/",
  }),
});

const EXTERNAL_ID_NAMESPACES = Object.freeze(["imdb", "tmdb", "watchmode"]);
const LEGACY_FEED = Object.freeze({
  format: 3,
  feedId: "websearch:daily-tips-at",
  sourceId: "websearch:daily-tips",
});
const MEDIA_TYPE_ALIASES = Object.freeze({
  film: "film", movie: "film",
  series: "series", serie: "series", tv: "series", tv_series: "series",
});

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function list(value) { return Array.isArray(value) ? value : []; }
function exactKeys(value, required, optional = []) {
  if (!plain(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
}
function unique(values) {
  const found = new Map();
  for (const value of values) {
    const clean = text(value);
    const key = clean.toLocaleLowerCase("de-AT");
    if (clean && !found.has(key)) found.set(key, clean);
  }
  return [...found.values()];
}
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
function calendarDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : null;
}
function isoWeekForDay(value) {
  const day = calendarDay(value);
  if (!day) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86_400_000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
function validYear(value) {
  return Number.isInteger(value) && value >= 1888 && value <= new Date().getUTCFullYear() + 10;
}
function httpsUrl(value) {
  if (typeof value !== "string" || text(value) !== value || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      && !parsed.port && !parsed.hash ? parsed.toString() : null;
  } catch { return null; }
}
function validDomain(value) {
  return typeof value === "string" && value === value.toLowerCase() && text(value) === value
    && value.split(".").length >= 2
    && value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
function boundedTextArray(value, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const values = unique(value);
  if (values.length !== value.length || values.some((entry) => entry.length > 80)) return null;
  return values;
}
function validInstant(value) {
  return typeof value === "string" && text(value) === value
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function sixDaysAfter(day) {
  const value = calendarDay(day) ? new Date(`${day}T00:00:00.000Z`) : null;
  if (!value) return null;
  value.setUTCDate(value.getUTCDate() + 6);
  return value.toISOString().slice(0, 10);
}
function publicMediaTypeForUrl(value) {
  const normalized = httpsUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.hostname !== "www.joyn.at") return null;
  if (url.pathname.startsWith("/filme/") && url.pathname.length > 8) return "film";
  if (url.pathname.startsWith("/serien/") && url.pathname.length > 9) return "series";
  return null;
}

export function normalizeDiscoveryMediaType(value) {
  return MEDIA_TYPE_ALIASES[text(value).toLocaleLowerCase("de-AT")] || null;
}

export function normalizeDiscoveryTitle(value) {
  const normalized = text(value).normalize("NFKC").toLocaleLowerCase("de-AT")
    .replace(/\s*(?:[-–—·|]|\()\s*(?:omu|omeu|ov|df|director'?s cut|extended cut)\)?\s*$/iu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function normalizeExternalId(namespace, value) {
  const clean = text(value);
  if (namespace === "imdb") return /^tt\d{5,12}$/i.test(clean) ? clean.toLowerCase() : null;
  if (namespace === "tmdb" || namespace === "watchmode") {
    return /^[1-9]\d{0,14}$/.test(clean) ? clean : null;
  }
  return null;
}

export function normalizeDiscoveryExternalIds(value) {
  if (!plain(value) || Object.keys(value).some((key) => !EXTERNAL_ID_NAMESPACES.includes(key))) return null;
  const normalized = {};
  for (const namespace of EXTERNAL_ID_NAMESPACES) {
    if (!(namespace in value)) continue;
    const id = normalizeExternalId(namespace, value[namespace]);
    if (!id) return null;
    normalized[namespace] = id;
  }
  return freezeDeep(normalized);
}

export function discoveryExternalIdsFromCatalog(entry = {}) {
  const candidates = {
    ...((entry.imdb_id ?? entry.imdbId) ? { imdb: entry.imdb_id ?? entry.imdbId } : {}),
    ...((entry.tmdb_id ?? entry.tmdbId) ? { tmdb: entry.tmdb_id ?? entry.tmdbId } : {}),
    ...((entry.watchmode_id ?? entry.watchmodeId) ? { watchmode: entry.watchmode_id ?? entry.watchmodeId } : {}),
  };
  return normalizeDiscoveryExternalIds(candidates) || Object.freeze({});
}

function validateEvidence(value, feed, errors, prefix) {
  if (!exactKeys(value, ["domain", "url", "publishedOn", "retrievedOn", "positiveRecommendation"])) {
    errors.push(`${prefix}-shape-invalid`); return null;
  }
  const url = httpsUrl(value.url);
  if (!validDomain(value.domain) || !url || new URL(url).hostname.toLowerCase() !== value.domain) {
    errors.push(`${prefix}-source-invalid`);
  }
  if (feed.format === LEGACY_FEED.format
      && !(value.domain === "derstandard.at" || value.domain.endsWith(".derstandard.at")
        || value.domain === "film.at" || value.domain.endsWith(".film.at"))) {
    errors.push(`${prefix}-domain-invalid`);
  }
  const publishedOn = calendarDay(value.publishedOn);
  if (!publishedOn || publishedOn > feed.refreshedOn) errors.push(`${prefix}-published-on-invalid`);
  if (value.retrievedOn !== feed.refreshedOn) errors.push(`${prefix}-retrieved-on-invalid`);
  if (value.positiveRecommendation !== true) errors.push(`${prefix}-positive-invalid`);
  return value;
}

function validateRecord(value, feed, errors, index) {
  const prefix = `item-${index}`;
  const weekly = feed.format === WEB_DISCOVERY_FEED_FORMAT;
  const required = [
    "recordId", "title", "mediaType", "releaseYear", "attributes", "evidence", "rank",
    ...(weekly ? ["externalIds"] : []),
  ];
  if (!exactKeys(value, required)) {
    errors.push(`${prefix}-shape-invalid`); return;
  }
  if (!/^webtip:[a-f0-9]{16}$/.test(value.recordId)) errors.push(`${prefix}-record-id-invalid`);
  if (!text(value.title) || text(value.title) !== value.title || value.title.length > 200) {
    errors.push(`${prefix}-title-invalid`);
  }
  if (!normalizeDiscoveryMediaType(value.mediaType) || normalizeDiscoveryMediaType(value.mediaType) !== value.mediaType) {
    errors.push(`${prefix}-media-type-invalid`);
  }
  if (!validYear(value.releaseYear)) errors.push(`${prefix}-year-invalid`);
  if (weekly) {
    if (!normalizeDiscoveryExternalIds(value.externalIds)) errors.push(`${prefix}-external-ids-invalid`);
    if (!exactKeys(value.attributes, ["genres", "tones", "themes"])
        || !boundedTextArray(value.attributes?.genres, 8)
        || !boundedTextArray(value.attributes?.tones, 8)
        || !boundedTextArray(value.attributes?.themes, 8)) errors.push(`${prefix}-attributes-invalid`);
  } else if (!exactKeys(value.attributes, ["genres", "tags"])
      || !boundedTextArray(value.attributes?.genres, 8)
      || !boundedTextArray(value.attributes?.tags, 8)) errors.push(`${prefix}-attributes-invalid`);
  if (!Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 3) {
    errors.push(`${prefix}-evidence-invalid`);
  } else {
    value.evidence.forEach((evidence, evidenceIndex) => validateEvidence(evidence, feed, errors, `${prefix}-evidence-${evidenceIndex}`));
    if (new Set(value.evidence.map((evidence) => evidence?.url)).size !== value.evidence.length) {
      errors.push(`${prefix}-evidence-url-duplicate`);
    }
  }
  if (!Number.isInteger(value.rank) || value.rank < 1 || value.rank > WEB_DISCOVERY_MAX_ITEMS) {
    errors.push(`${prefix}-rank-invalid`);
  }
}

function validatePublicRecord(value, feed, errors, index) {
  const prefix = `item-${index}`;
  if (!exactKeys(value, [
    "title", "sourceItemId", "mediaType", "genres", "licenseTypes",
    "sourcePosition", "listDate", "sourceUrl", "fetchedAt",
  ])) { errors.push(`${prefix}-shape-invalid`); return; }
  if (!text(value.title) || value.title !== text(value.title) || value.title.length > 200) errors.push(`${prefix}-title-invalid`);
  if (!/^[fs]_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.sourceItemId)
      || value.sourceItemId.length > 182) errors.push(`${prefix}-source-item-id-invalid`);
  if (!normalizeDiscoveryMediaType(value.mediaType) || value.mediaType !== normalizeDiscoveryMediaType(value.mediaType)
      || publicMediaTypeForUrl(value.sourceUrl) !== value.mediaType) errors.push(`${prefix}-media-type-invalid`);
  if (!boundedTextArray(value.genres, 8)) errors.push(`${prefix}-genres-invalid`);
  const licenses = boundedTextArray(value.licenseTypes, 4);
  if (!licenses || !licenses.length || licenses.some((license) => !["AVOD", "FVOD", "SVOD"].includes(license))) {
    errors.push(`${prefix}-licenses-invalid`);
  }
  if (!Number.isInteger(value.sourcePosition) || value.sourcePosition < 1 || value.sourcePosition > 50) {
    errors.push(`${prefix}-position-invalid`);
  }
  if (value.listDate !== feed.refreshedOn || !validInstant(value.fetchedAt)) errors.push(`${prefix}-date-invalid`);
}

function validateMixedRecord(value, feed, errors, index) {
  const prefix = `item-${index}`;
  if (!exactKeys(value, [
    "title", "sourceItemId", "sourceId", "sourceLabel", "mediaType", "genres",
    "availability", "popularity", "sourceUrl", "fetchedAt",
  ])) { errors.push(`${prefix}-shape-invalid`); return; }
  if (!text(value.title) || value.title !== text(value.title) || value.title.length > 200) errors.push(`${prefix}-title-invalid`);
  if (!/^[fs]_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.sourceItemId)
      || value.sourceItemId.length > 182) errors.push(`${prefix}-source-item-id-invalid`);
  if (!normalizeDiscoveryMediaType(value.mediaType) || value.mediaType !== normalizeDiscoveryMediaType(value.mediaType)) {
    errors.push(`${prefix}-media-type-invalid`);
  }
  if (!boundedTextArray(value.genres, 8)) errors.push(`${prefix}-genres-invalid`);
  if (!validInstant(value.fetchedAt)) errors.push(`${prefix}-fetched-at-invalid`);
  if (!exactKeys(value.availability, ["region", "market", "service", "licenseTypes"])
      || value.availability.region !== "AT" || !["cinema", "streaming"].includes(value.availability.market)) {
    errors.push(`${prefix}-availability-invalid`);
  }
  const licenses = boundedTextArray(value.availability?.licenseTypes, 4);
  if (!licenses || licenses.some((license) => !["AVOD", "FVOD", "SVOD"].includes(license))) {
    errors.push(`${prefix}-licenses-invalid`);
  }
  if (!exactKeys(value.popularity, ["metric", "rank", "measuredOn", "value"])
      || !Number.isInteger(value.popularity.rank) || value.popularity.rank < 1 || value.popularity.rank > 50
      || !calendarDay(value.popularity.measuredOn) || value.popularity.measuredOn > feed.refreshedOn) {
    errors.push(`${prefix}-popularity-invalid`);
  }
  const sourceUrl = httpsUrl(value.sourceUrl);
  const url = sourceUrl ? new URL(sourceUrl) : null;
  if (value.sourceId === "chart:netflix-weekly-at") {
    const expectedPath = value.mediaType === "film"
      ? "/tudum/top10/austria/films" : value.mediaType === "series"
        ? "/tudum/top10/austria/tv" : null;
    const ageDays = calendarDay(value.popularity?.measuredOn) && calendarDay(feed.refreshedOn)
      ? (Date.parse(`${feed.refreshedOn}T00:00:00.000Z`)
        - Date.parse(`${value.popularity.measuredOn}T00:00:00.000Z`)) / 86_400_000 : null;
    if (value.sourceLabel !== "Netflix Top 10 Österreich"
        || url?.hostname !== "www.netflix.com" || url?.pathname !== expectedPath || url?.search
        || value.availability?.market !== "streaming" || value.availability?.service !== "Netflix"
        || JSON.stringify(licenses) !== JSON.stringify(["SVOD"])
        || value.popularity?.metric !== "weekly-country-rank" || value.popularity?.value !== null
        || !Number.isInteger(ageDays) || ageDays < 0 || ageDays > 9
        || new Date(`${value.popularity?.measuredOn}T00:00:00.000Z`).getUTCDay() !== 0) {
      errors.push(`${prefix}-netflix-facts-invalid`);
    }
  } else if (value.sourceId === "chart:oefi-weekend-at") {
    if (value.sourceLabel !== "Österreichisches Filminstitut" || value.mediaType !== "film"
        || url?.hostname !== "filminstitut.at" || url?.pathname !== "/charts"
        || value.availability?.market !== "cinema" || value.availability?.service !== null
        || licenses?.length !== 0 || value.popularity?.metric !== "weekend-admissions"
        || !Number.isSafeInteger(value.popularity?.value) || value.popularity.value < 0) {
      errors.push(`${prefix}-oefi-facts-invalid`);
    }
  } else errors.push(`${prefix}-source-invalid`);
}

function validateVersionedRecord(value, feed, errors, index) {
  const prefix = `item-${index}`;
  if (!exactKeys(value, [
    "title", "sourceItemId", "sourceId", "sourceLabel", "mediaType", "releaseYear",
    "externalIds", "genres", "availability", "popularity", "sourceUrl", "fetchedAt",
  ])) { errors.push(`${prefix}-shape-invalid`); return; }
  const policy = VERSIONED_SOURCE_POLICY[value.sourceId];
  const expectedSourceUrl = policy?.urls?.[value.mediaType] || policy?.url;
  if (!text(value.title) || value.title !== text(value.title) || value.title.length > 200) {
    errors.push(`${prefix}-title-invalid`);
  }
  if (!/^[fs]_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.sourceItemId)
      || value.sourceItemId.length > 182) errors.push(`${prefix}-source-item-id-invalid`);
  if (!policy || value.sourceLabel !== policy.sourceLabel || value.sourceUrl !== expectedSourceUrl) {
    errors.push(`${prefix}-source-invalid`);
  }
  if (!normalizeDiscoveryMediaType(value.mediaType) || value.mediaType !== normalizeDiscoveryMediaType(value.mediaType)) {
    errors.push(`${prefix}-media-type-invalid`);
  }
  if (!validYear(value.releaseYear) || !normalizeDiscoveryExternalIds(value.externalIds)
      || !boundedTextArray(value.genres, 8)) errors.push(`${prefix}-metadata-invalid`);
  if (!validInstant(value.fetchedAt) || !httpsUrl(value.sourceUrl)) errors.push(`${prefix}-fetch-invalid`);
  if (!exactKeys(value.availability, ["region", "market", "service", "licenseTypes"])
      || value.availability.region !== "AT" || value.availability.market !== policy?.market
      || value.availability.service !== policy?.service) errors.push(`${prefix}-availability-invalid`);
  const licenses = boundedTextArray(value.availability?.licenseTypes, 4);
  const expectedLicenses = policy?.market === "streaming" ? ["SVOD"] : [];
  if (!licenses || JSON.stringify(licenses) !== JSON.stringify(expectedLicenses)) {
    errors.push(`${prefix}-licenses-invalid`);
  }
  if (!exactKeys(value.popularity, ["metric", "rank", "measuredOn", "value"])
      || value.popularity.metric !== policy?.metric || value.popularity.value !== null
      || !Number.isInteger(value.popularity.rank) || value.popularity.rank < 1 || value.popularity.rank > 15
      || !calendarDay(value.popularity.measuredOn) || value.popularity.measuredOn > feed.refreshedOn) {
    errors.push(`${prefix}-popularity-invalid`);
  }
}

function validatePublicAnnotations(value, feed, errors) {
  if (!Array.isArray(value) || value.length > PUBLIC_DISCOVERY_POOL_SIZE) {
    errors.push("annotations-invalid"); return;
  }
  const items = new Map(feed.items.map((item) => [item.sourceItemId, item]));
  const sourceIds = new Set();
  for (const [index, annotation] of value.entries()) {
    const prefix = `annotation-${index}`;
    if (!exactKeys(annotation, ["sourceItemId", "qid", "mediaType", "releaseYear", "externalIds", "resolvedAt"])
        || !items.has(annotation?.sourceItemId) || sourceIds.has(annotation?.sourceItemId)
        || !/^Q[1-9]\d*$/.test(annotation?.qid)
        || annotation?.mediaType !== items.get(annotation?.sourceItemId)?.mediaType
        || (annotation?.releaseYear !== null && !validYear(annotation?.releaseYear))
        || !normalizeDiscoveryExternalIds(annotation?.externalIds)
        || (annotation?.releaseYear === null && Object.keys(annotation?.externalIds || {}).length === 0)
        || !validInstant(annotation?.resolvedAt)) errors.push(`${prefix}-invalid`);
    sourceIds.add(annotation?.sourceItemId);
  }
}

export function validateWebDiscoveryFeed(value) {
  const errors = [];
  const versionedWeekly = value?.format === VERSIONED_DISCOVERY_FEED_FORMAT;
  const mixedWeekly = value?.format === MIXED_DISCOVERY_FEED_FORMAT;
  const publicWeekly = value?.format === PUBLIC_DISCOVERY_FEED_FORMAT;
  const weekly = value?.format === WEB_DISCOVERY_FEED_FORMAT;
  const legacy = value?.format === LEGACY_FEED.format;
  const required = [
    "format", "feedId", "region", "sourceId", "refreshedOn", "validUntil", "items",
    ...(versionedWeekly ? ["sourceIds", "poolVersion"]
      : mixedWeekly ? ["sourceIds", "isoWeek", "annotations"]
      : publicWeekly ? ["isoWeek", "annotations"] : weekly ? ["isoWeek"] : []),
  ];
  if ((!versionedWeekly && !mixedWeekly && !publicWeekly && !weekly && !legacy) || !exactKeys(value, required)) {
    return Object.freeze({ ok: false, errors: Object.freeze(["feed-shape-invalid"]), value: null });
  }
  const expected = versionedWeekly ? {
    feedId: VERSIONED_DISCOVERY_FEED_ID, sourceId: VERSIONED_DISCOVERY_SOURCE_ID,
  } : mixedWeekly ? {
    feedId: MIXED_DISCOVERY_FEED_ID, sourceId: MIXED_DISCOVERY_SOURCE_ID,
  } : publicWeekly ? {
    feedId: PUBLIC_DISCOVERY_FEED_ID, sourceId: PUBLIC_DISCOVERY_SOURCE_ID,
  } : weekly ? {
    feedId: WEB_DISCOVERY_FEED_ID, sourceId: WEB_DISCOVERY_SOURCE_ID,
  } : LEGACY_FEED;
  if (value.feedId !== expected.feedId) errors.push("feed-id-invalid");
  if (value.region !== "AT") errors.push("feed-region-invalid");
  if (value.sourceId !== expected.sourceId) errors.push("feed-source-id-invalid");
  const refreshed = calendarDay(value.refreshedOn);
  const validUntil = calendarDay(value.validUntil);
  if (!refreshed) errors.push("feed-refreshed-on-invalid");
  if (!validUntil || (refreshed && validUntil < refreshed)) errors.push("feed-valid-until-invalid");
  if (versionedWeekly && (value.poolVersion !== VERSIONED_DISCOVERY_POOL_VERSION
      || validUntil !== sixDaysAfter(refreshed)
      || !Array.isArray(value.sourceIds)
      || JSON.stringify([...value.sourceIds].sort()) !== JSON.stringify([...VERSIONED_DISCOVERY_SOURCE_IDS].sort()))) {
    errors.push("feed-versioned-contract-invalid");
  }
  if ((mixedWeekly || publicWeekly) && (!/^\d{4}-W\d{2}$/.test(value.isoWeek)
      || isoWeekForDay(refreshed) !== value.isoWeek
      || validUntil !== sixDaysAfter(refreshed))) errors.push("feed-public-period-invalid");
  if (mixedWeekly && (!Array.isArray(value.sourceIds)
      || JSON.stringify([...value.sourceIds].sort()) !== JSON.stringify([...MIXED_DISCOVERY_SOURCE_IDS].sort()))) {
    errors.push("feed-source-ids-invalid");
  }
  if (weekly && (!/^\d{4}-W\d{2}$/.test(value.isoWeek)
      || isoWeekForDay(refreshed) !== value.isoWeek
      || isoWeekForDay(validUntil) !== value.isoWeek)) errors.push("feed-iso-week-invalid");
  if (!Array.isArray(value.items) || (versionedWeekly
    ? value.items.length !== VERSIONED_DISCOVERY_POOL_SIZE : mixedWeekly
    ? value.items.length !== MIXED_DISCOVERY_POOL_SIZE : publicWeekly
      ? value.items.length !== PUBLIC_DISCOVERY_POOL_SIZE
    : value.items.length < 1 || value.items.length > WEB_DISCOVERY_MAX_ITEMS)) {
    errors.push("feed-items-invalid");
  } else {
    if (versionedWeekly) {
      value.items.forEach((item, index) => validateVersionedRecord(item, value, errors, index));
      if (new Set(value.items.map((item) => item?.sourceItemId)).size !== value.items.length) errors.push("feed-source-id-duplicate");
      if (new Set(value.items.map((item) => normalizeDiscoveryTitle(item?.title))).size !== value.items.length) {
        errors.push("feed-title-duplicate");
      }
      if (new Set(value.items.map((item) => `${item?.sourceId}|${item?.mediaType}|${item?.popularity?.rank}`)).size
          !== value.items.length) errors.push("feed-position-duplicate");
      const sourceCounts = Object.fromEntries(VERSIONED_DISCOVERY_SOURCE_IDS.map((sourceId) => [
        sourceId, value.items.filter((item) => item?.sourceId === sourceId).length,
      ]));
      if (JSON.stringify(sourceCounts) !== JSON.stringify(VERSIONED_DISCOVERY_SOURCE_COUNTS)) {
        errors.push("feed-source-counts-invalid");
      }
      const segmentCounts = {
        cinema: value.items.filter((item) => item?.sourceId === "chart:oefi-weekend-at" && item?.mediaType === "film").length,
        netflixFilm: value.items.filter((item) => item?.sourceId === "chart:netflix-weekly-at" && item?.mediaType === "film").length,
        netflixSeries: value.items.filter((item) => item?.sourceId === "chart:netflix-weekly-at" && item?.mediaType === "series").length,
        primeFilm: value.items.filter((item) => item?.sourceId === "snapshot:prime-video-at" && item?.mediaType === "film").length,
        primeSeries: value.items.filter((item) => item?.sourceId === "snapshot:prime-video-at" && item?.mediaType === "series").length,
        disneyFilm: value.items.filter((item) => item?.sourceId === "snapshot:disney-plus-at" && item?.mediaType === "film").length,
        disneySeries: value.items.filter((item) => item?.sourceId === "snapshot:disney-plus-at" && item?.mediaType === "series").length,
        appleTotal: value.items.filter((item) => item?.sourceId === "snapshot:apple-tv-plus-at").length,
      };
      if (JSON.stringify(segmentCounts) !== JSON.stringify({
        cinema: 15, netflixFilm: 5, netflixSeries: 5, primeFilm: 5,
        primeSeries: 5, disneyFilm: 5, disneySeries: 5, appleTotal: 5,
      })) errors.push("feed-segment-counts-invalid");
    } else if (mixedWeekly) {
      value.items.forEach((item, index) => validateMixedRecord(item, value, errors, index));
      if (new Set(value.items.map((item) => item?.sourceItemId)).size !== value.items.length) errors.push("feed-source-id-duplicate");
      if (new Set(value.items.map((item) => normalizeDiscoveryTitle(item?.title))).size !== value.items.length) {
        errors.push("feed-title-duplicate");
      }
      if (new Set(value.items.map((item) => `${item?.sourceId}|${item?.mediaType}|${item?.popularity?.rank}`)).size
          !== value.items.length) errors.push("feed-position-duplicate");
      const counts = {
        cinema: value.items.filter((item) => item?.availability?.market === "cinema").length,
        streamingFilm: value.items.filter((item) => item?.availability?.market === "streaming" && item?.mediaType === "film").length,
        streamingSeries: value.items.filter((item) => item?.availability?.market === "streaming" && item?.mediaType === "series").length,
      };
      if (JSON.stringify(counts) !== JSON.stringify(MIXED_DISCOVERY_MARKET_COUNTS)) errors.push("feed-market-counts-invalid");
      validatePublicAnnotations(value.annotations, value, errors);
    } else if (publicWeekly) {
      value.items.forEach((item, index) => validatePublicRecord(item, value, errors, index));
      if (new Set(value.items.map((item) => item?.sourceItemId)).size !== value.items.length) errors.push("feed-source-id-duplicate");
      if (new Set(value.items.map((item) => item?.sourceUrl)).size !== value.items.length) errors.push("feed-source-url-duplicate");
      if (new Set(value.items.map((item) => `${item?.mediaType}|${item?.sourcePosition}`)).size !== value.items.length) {
        errors.push("feed-position-duplicate");
      }
      if (new Set(value.items.map((item) => normalizeDiscoveryTitle(item?.title))).size !== value.items.length) {
        errors.push("feed-title-duplicate");
      }
      validatePublicAnnotations(value.annotations, value, errors);
    } else {
      value.items.forEach((item, index) => validateRecord(item, value, errors, index));
      if (new Set(value.items.map((item) => item?.recordId)).size !== value.items.length) errors.push("feed-record-id-duplicate");
      if (new Set(value.items.map((item) => item?.rank)).size !== value.items.length) errors.push("feed-rank-duplicate");
    }
  }
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze([...new Set(errors)]), value: null });
  const clone = JSON.parse(JSON.stringify(value));
  if (!versionedWeekly && !mixedWeekly && !publicWeekly) clone.items.sort((left, right) => left.rank - right.rank || left.recordId.localeCompare(right.recordId, "de-AT"));
  return Object.freeze({ ok: true, errors: Object.freeze([]), value: freezeDeep(clone) });
}

function candidateTitles(candidate) {
  return new Set([candidate?.title, candidate?.originalTitle].map(normalizeDiscoveryTitle).filter(Boolean));
}

function recordTitles(record) {
  return new Set([record?.title].map(normalizeDiscoveryTitle).filter(Boolean));
}

function hasOverlap(left, right) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

export function matchWebDiscoveryFeed(webDiscoveryFeed, catalogCandidates = []) {
  const checked = validateWebDiscoveryFeed(webDiscoveryFeed);
  if (!checked.ok) return Object.freeze([]);
  const versionedWeekly = checked.value.format === VERSIONED_DISCOVERY_FEED_FORMAT;
  const publicWeekly = [
    PUBLIC_DISCOVERY_FEED_FORMAT, MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT,
  ].includes(checked.value.format);
  const annotations = new Map((publicWeekly ? (checked.value.annotations || []) : [])
    .map((entry) => [entry.sourceItemId, entry]));
  const records = publicWeekly ? checked.value.items.map((item, index) => {
    const facts = versionedWeekly ? Object.freeze({
      qid: null,
      releaseYear: item.releaseYear,
      externalIds: item.externalIds,
    }) : annotations.get(item.sourceItemId);
    return Object.freeze({
      ...item,
      recordId: `${checked.value.format === PUBLIC_DISCOVERY_FEED_FORMAT ? "joyn" : "market"}:${item.sourceItemId}`,
      rank: index + 1,
      releaseYear: facts?.releaseYear ?? null,
      externalIds: facts?.externalIds || Object.freeze({}),
      wikidata: facts || null,
    });
  }) : checked.value.items;
  const catalog = list(catalogCandidates).filter((candidate) => (
    text(candidate?.targetId) && normalizeDiscoveryMediaType(candidate?.type) && validYear(candidate?.year)
  ));
  return Object.freeze(records.map((record) => {
    if (publicWeekly && !record.wikidata) {
      return freezeDeep({ record, status: "unmatched", matchedBy: null, candidate: null });
    }
    const titles = recordTitles(record);
    const recordIds = normalizeDiscoveryExternalIds(record.externalIds || {}) || {};
    const idRows = catalog.map((candidate) => {
      const candidateIds = normalizeDiscoveryExternalIds(candidate.externalIds || {}) || {};
      const common = EXTERNAL_ID_NAMESPACES.filter((namespace) => (
        recordIds[namespace] && candidateIds[namespace]
      ));
      const equal = common.filter((namespace) => recordIds[namespace] === candidateIds[namespace]);
      return { candidate, common, equal, conflict: common.some((namespace) => !equal.includes(namespace)) };
    });
    const comparableById = idRows.some((row) => row.common.length > 0);
    if (Object.keys(recordIds).length && comparableById) {
      const hits = idRows.filter((row) => row.equal.length > 0);
      const consistent = hits.filter((row) => (
        !row.conflict
        && normalizeDiscoveryMediaType(row.candidate.type) === record.mediaType
        && (record.releaseYear === null || row.candidate.year === record.releaseYear)
      ));
      const hitTargets = new Set(hits.map((row) => row.candidate.targetId));
      const status = consistent.length === 1 && hitTargets.size === 1
        ? "matched" : hitTargets.size > 1 || consistent.length > 1 ? "ambiguous" : "unmatched";
      const chosen = status === "matched" ? consistent[0] : null;
      return freezeDeep({
        record,
        status,
        matchedBy: chosen ? `external-id:${chosen.equal[0]}` : null,
        candidate: chosen?.candidate || null,
      });
    }
    const matches = catalog.filter((candidate) => (
      validYear(record.releaseYear)
      &&
      normalizeDiscoveryMediaType(candidate.type) === record.mediaType
      && candidate.year === record.releaseYear
      && hasOverlap(titles, candidateTitles(candidate))
    ));
    const status = matches.length === 1 ? "matched" : matches.length > 1 ? "ambiguous" : "unmatched";
    return freezeDeep({
      record,
      status,
      matchedBy: status === "matched" ? "title-year-type" : null,
      candidate: status === "matched" ? matches[0] : null,
    });
  }));
}
