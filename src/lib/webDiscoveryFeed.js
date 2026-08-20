/* Globaler Entdecken-Tagesfeed und lokales Fail-closed-Matching.
   Der Feed enthaelt ausschliesslich globale, belegte Webtipps. Aktuelle
   Verfuegbarkeit und persoenliche Passung werden erst im Browser bestimmt. */

export const WEB_DISCOVERY_FEED_FORMAT = 2;
export const WEB_DISCOVERY_FEED_ID = "websearch:daily-tips-at";
export const WEB_DISCOVERY_SOURCE_ID = "websearch:daily-tips";
export const WEB_DISCOVERY_MAX_ITEMS = 20;
export const WEB_DISCOVERY_MATCH_STATUSES = Object.freeze([
  "matched", "unmatched", "ambiguous",
]);

const EXTERNAL_ID_NAMESPACES = Object.freeze(["imdb", "tmdb", "watchmode"]);
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
function stableContractId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{1,31}:[^\s]{1,150}$/i.test(value);
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

function validateOpinion(value, errors, prefix) {
  if (!exactKeys(value, ["sourceId", "sourceFamily", "sourceLabel", "url", "stance", "summary"])) {
    errors.push(`${prefix}-shape-invalid`); return null;
  }
  if (!stableContractId(value.sourceId)) errors.push(`${prefix}-source-id-invalid`);
  if (!text(value.sourceFamily) || text(value.sourceFamily) !== value.sourceFamily || value.sourceFamily.length > 120) {
    errors.push(`${prefix}-source-family-invalid`);
  }
  if (!text(value.sourceLabel) || text(value.sourceLabel) !== value.sourceLabel || value.sourceLabel.length > 240) {
    errors.push(`${prefix}-source-label-invalid`);
  }
  if (!httpsUrl(value.url)) errors.push(`${prefix}-url-invalid`);
  if (value.stance !== "recommended") errors.push(`${prefix}-stance-invalid`);
  if (!text(value.summary) || text(value.summary) !== value.summary || value.summary.length > 320) {
    errors.push(`${prefix}-summary-invalid`);
  }
  return value;
}

function validateRecord(value, feed, errors, index) {
  const prefix = `item-${index}`;
  if (!exactKeys(value, [
    "recordId", "title", "originalTitle", "mediaType", "releaseYear", "externalIds",
    "attributes", "opinions", "rank", "retrievedOn", "validUntil",
  ])) {
    errors.push(`${prefix}-shape-invalid`); return;
  }
  if (!/^webtip:[a-f0-9]{16}$/.test(value.recordId)) errors.push(`${prefix}-record-id-invalid`);
  if (!text(value.title) || text(value.title) !== value.title || value.title.length > 200) {
    errors.push(`${prefix}-title-invalid`);
  }
  if (value.originalTitle !== null && (
    typeof value.originalTitle !== "string" || text(value.originalTitle) !== value.originalTitle
    || !value.originalTitle || value.originalTitle.length > 200
  )) errors.push(`${prefix}-original-title-invalid`);
  if (!normalizeDiscoveryMediaType(value.mediaType) || normalizeDiscoveryMediaType(value.mediaType) !== value.mediaType) {
    errors.push(`${prefix}-media-type-invalid`);
  }
  if (!validYear(value.releaseYear)) errors.push(`${prefix}-year-invalid`);
  if (!normalizeDiscoveryExternalIds(value.externalIds)) errors.push(`${prefix}-external-ids-invalid`);
  if (!exactKeys(value.attributes, ["genres", "tags"])
      || !boundedTextArray(value.attributes?.genres, 8)
      || !boundedTextArray(value.attributes?.tags, 8)) errors.push(`${prefix}-attributes-invalid`);
  if (!Array.isArray(value.opinions) || value.opinions.length < 1 || value.opinions.length > 3) {
    errors.push(`${prefix}-opinions-invalid`);
  } else {
    value.opinions.forEach((opinion, opinionIndex) => validateOpinion(opinion, errors, `${prefix}-opinion-${opinionIndex}`));
    if (new Set(value.opinions.map((opinion) => opinion?.url)).size !== value.opinions.length) {
      errors.push(`${prefix}-opinion-url-duplicate`);
    }
  }
  if (!Number.isInteger(value.rank) || value.rank < 1 || value.rank > WEB_DISCOVERY_MAX_ITEMS) {
    errors.push(`${prefix}-rank-invalid`);
  }
  if (value.retrievedOn !== feed.refreshedOn || value.validUntil !== feed.validUntil) {
    errors.push(`${prefix}-day-mismatch`);
  }
}

export function validateWebDiscoveryFeed(value) {
  const errors = [];
  if (!exactKeys(value, ["format", "feedId", "region", "sourceId", "refreshedOn", "validUntil", "items"])) {
    return Object.freeze({ ok: false, errors: Object.freeze(["feed-shape-invalid"]), value: null });
  }
  if (value.format !== WEB_DISCOVERY_FEED_FORMAT) errors.push("feed-format-invalid");
  if (value.feedId !== WEB_DISCOVERY_FEED_ID) errors.push("feed-id-invalid");
  if (value.region !== "AT") errors.push("feed-region-invalid");
  if (value.sourceId !== WEB_DISCOVERY_SOURCE_ID) errors.push("feed-source-id-invalid");
  const refreshed = calendarDay(value.refreshedOn);
  const validUntil = calendarDay(value.validUntil);
  if (!refreshed) errors.push("feed-refreshed-on-invalid");
  if (!validUntil || (refreshed && validUntil < refreshed)) errors.push("feed-valid-until-invalid");
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
  return new Set([record?.title, record?.originalTitle].map(normalizeDiscoveryTitle).filter(Boolean));
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
  const idIndex = new Map();
  for (const candidate of catalog) {
    const ids = normalizeDiscoveryExternalIds(candidate.externalIds || {}) || {};
    for (const [namespace, id] of Object.entries(ids)) {
      const key = `${namespace}:${id}`;
      if (!idIndex.has(key)) idIndex.set(key, new Set());
      idIndex.get(key).add(candidate);
    }
  }

  return Object.freeze(checked.value.items.map((record) => {
    const recordIds = normalizeDiscoveryExternalIds(record.externalIds) || {};
    const strongMatches = new Set();
    for (const [namespace, id] of Object.entries(recordIds)) {
      for (const candidate of idIndex.get(`${namespace}:${id}`) || []) strongMatches.add(candidate);
    }
    let matches;
    let matchedBy;
    if (strongMatches.size) {
      matches = [...strongMatches].filter((candidate) => (
        normalizeDiscoveryMediaType(candidate.type) === record.mediaType && candidate.year === record.releaseYear
      ));
      matchedBy = "external-id";
    } else {
      const titles = recordTitles(record);
      matches = catalog.filter((candidate) => (
        normalizeDiscoveryMediaType(candidate.type) === record.mediaType
        && candidate.year === record.releaseYear
        && hasOverlap(titles, candidateTitles(candidate))
      ));
      matchedBy = "title-year-type";
    }
    const status = matches.length === 1 ? "matched" : matches.length > 1 ? "ambiguous" : "unmatched";
    return freezeDeep({
      record,
      status,
      matchedBy: status === "matched" ? matchedBy : null,
      candidate: status === "matched" ? matches[0] : null,
    });
  }));
}
