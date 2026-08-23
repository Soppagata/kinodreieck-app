/* Globaler Entdecken-Tagesfeed und lokales Fail-closed-Matching.
   Der Feed enthaelt ausschliesslich globale, belegte Webtipps. Aktuelle
   Verfuegbarkeit und persoenliche Passung werden erst im Browser bestimmt. */

export const WEB_DISCOVERY_FEED_FORMAT = 4;
export const WEB_DISCOVERY_FEED_ID = "websearch:weekly-positive-at";
export const WEB_DISCOVERY_SOURCE_ID = "websearch:weekly-positive";
export const WEB_DISCOVERY_MAX_ITEMS = 20;
export const WEB_DISCOVERY_MATCH_STATUSES = Object.freeze([
  "matched", "unmatched", "ambiguous",
]);

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

export function validateWebDiscoveryFeed(value) {
  const errors = [];
  const weekly = value?.format === WEB_DISCOVERY_FEED_FORMAT;
  const legacy = value?.format === LEGACY_FEED.format;
  const required = [
    "format", "feedId", "region", "sourceId", "refreshedOn", "validUntil", "items",
    ...(weekly ? ["isoWeek"] : []),
  ];
  if ((!weekly && !legacy) || !exactKeys(value, required)) {
    return Object.freeze({ ok: false, errors: Object.freeze(["feed-shape-invalid"]), value: null });
  }
  const expected = weekly ? {
    feedId: WEB_DISCOVERY_FEED_ID, sourceId: WEB_DISCOVERY_SOURCE_ID,
  } : LEGACY_FEED;
  if (value.feedId !== expected.feedId) errors.push("feed-id-invalid");
  if (value.region !== "AT") errors.push("feed-region-invalid");
  if (value.sourceId !== expected.sourceId) errors.push("feed-source-id-invalid");
  const refreshed = calendarDay(value.refreshedOn);
  const validUntil = calendarDay(value.validUntil);
  if (!refreshed) errors.push("feed-refreshed-on-invalid");
  if (!validUntil || (refreshed && validUntil < refreshed)) errors.push("feed-valid-until-invalid");
  if (weekly && (!/^\d{4}-W\d{2}$/.test(value.isoWeek)
      || isoWeekForDay(refreshed) !== value.isoWeek
      || isoWeekForDay(validUntil) !== value.isoWeek)) errors.push("feed-iso-week-invalid");
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > WEB_DISCOVERY_MAX_ITEMS) {
    errors.push("feed-items-invalid");
  } else {
    value.items.forEach((item, index) => validateRecord(item, value, errors, index));
    if (new Set(value.items.map((item) => item?.recordId)).size !== value.items.length) errors.push("feed-record-id-duplicate");
    if (new Set(value.items.map((item) => item?.rank)).size !== value.items.length) errors.push("feed-rank-duplicate");
  }
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze([...new Set(errors)]), value: null });
  const clone = JSON.parse(JSON.stringify(value));
  clone.items.sort((left, right) => left.rank - right.rank || left.recordId.localeCompare(right.recordId, "de-AT"));
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
  const catalog = list(catalogCandidates).filter((candidate) => (
    text(candidate?.targetId) && normalizeDiscoveryMediaType(candidate?.type) && validYear(candidate?.year)
  ));
  return Object.freeze(checked.value.items.map((record) => {
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
        && row.candidate.year === record.releaseYear
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
