/* Providerunabhaengiger Vertrag fuer den globalen Entdecken-Tagesfeed.
   Keine Konten, Profile, Seen-Staende oder lokalen Kataloglisten. */

export const ENTDECKEN_DAILY_FEED_FORMAT = 3;
export const ENTDECKEN_DAILY_FEED_ID = "websearch:daily-tips-at";
export const ENTDECKEN_DAILY_SOURCE_ID = "websearch:daily-tips";
export const ENTDECKEN_DAILY_MAX_ITEMS = 20;
export const ENTDECKEN_DAILY_MAX_SEARCH_RESULTS = 10;
export const ENTDECKEN_DAILY_VALID_DAYS = 7;
export const ENTDECKEN_DAILY_SOURCE_DOMAINS = Object.freeze([
  "derstandard.at",
  "film.at",
]);

const MEDIA_TYPES = new Set(["film", "series"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, required, optional = []) {
  if (!plain(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
}
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
function unique(values, maxLength = 80) {
  const found = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== "string" || text(value) !== value || !value || value.length > maxLength) return null;
    const key = value.toLocaleLowerCase("de-AT");
    if (found.has(key)) return null;
    found.set(key, value);
  }
  return [...found.values()];
}
function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function validInstant(value) {
  return typeof value === "string" && text(value) === value && Number.isFinite(Date.parse(value));
}
function validYear(value) {
  return Number.isInteger(value) && value >= 1888 && value <= new Date().getUTCFullYear() + 10;
}
function validDomain(value) {
  return typeof value === "string" && value === value.toLowerCase() && text(value) === value
    && value.length >= 4 && value.length <= 253
    && value.split(".").length >= 2
    && value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
function directUrl(value) {
  if (typeof value !== "string" || text(value) !== value || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      && !parsed.port && !parsed.hash ? parsed : null;
  } catch { return null; }
}
function stableSourceId(value) {
  return typeof value === "string" && /^editorial:[a-z0-9][a-z0-9_-]{1,95}$/.test(value);
}
function normalizedTitle(value) {
  return text(value).normalize("NFKC").toLocaleLowerCase("de-AT")
    .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function hash64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
function dayPlus(day, count) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
function result(status, errors = [], feed = null) {
  return Object.freeze({
    ok: status === "confirmed",
    status,
    errors: Object.freeze([...new Set(errors)]),
    feed,
  });
}

export function validateEntdeckenSourceRegistry(value) {
  if (!Array.isArray(value) || value.length !== ENTDECKEN_DAILY_SOURCE_DOMAINS.length) {
    return Object.freeze({ ok: false, errors: Object.freeze(["source-registry-size-invalid"]), value: null });
  }
  const errors = [];
  const domains = new Set();
  const ids = new Set();
  for (const [index, source] of value.entries()) {
    const prefix = `source-${index}`;
    if (!exactKeys(source, [
      "sourceId", "domain", "publisherFamily", "sourceClass", "rightsStatus",
      "attributionApproved", "subdomainsAllowed", "active", "termsUrl", "termsCheckedOn",
    ])) {
      errors.push(`${prefix}-shape-invalid`); continue;
    }
    if (!stableSourceId(source.sourceId)) errors.push(`${prefix}-id-invalid`);
    if (!validDomain(source.domain)) errors.push(`${prefix}-domain-invalid`);
    if (!text(source.publisherFamily) || text(source.publisherFamily) !== source.publisherFamily
        || source.publisherFamily.length > 120) errors.push(`${prefix}-family-invalid`);
    if (source.sourceClass !== "editorial") errors.push(`${prefix}-class-invalid`);
    if (source.rightsStatus !== "approved" || source.attributionApproved !== true || source.active !== true) {
      errors.push(`${prefix}-approval-invalid`);
    }
    if (typeof source.subdomainsAllowed !== "boolean") errors.push(`${prefix}-subdomains-invalid`);
    if (!directUrl(source.termsUrl)) errors.push(`${prefix}-terms-url-invalid`);
    if (!validDay(source.termsCheckedOn)) errors.push(`${prefix}-terms-day-invalid`);
    if (domains.has(source.domain)) errors.push(`${prefix}-domain-duplicate`);
    if (ids.has(source.sourceId)) errors.push(`${prefix}-id-duplicate`);
    domains.add(source.domain); ids.add(source.sourceId);
  }
  if (JSON.stringify([...domains].sort()) !== JSON.stringify(ENTDECKEN_DAILY_SOURCE_DOMAINS)) {
    errors.push("source-registry-domains-invalid");
  }
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze([...new Set(errors)]), value: null });
  return Object.freeze({ ok: true, errors: Object.freeze([]), value: freezeDeep(JSON.parse(JSON.stringify(value))) });
}

function validateProviderItem(item, index, errors, retrievedOn) {
  const prefix = `provider-item-${index}`;
  if (!exactKeys(item, ["title", "mediaType", "releaseYear", "attributes", "evidence"])) {
    errors.push(`${prefix}-shape-invalid`); return;
  }
  if (!text(item.title) || text(item.title) !== item.title || item.title.length > 200) errors.push(`${prefix}-title-invalid`);
  if (!MEDIA_TYPES.has(item.mediaType)) errors.push(`${prefix}-media-type-invalid`);
  if (!validYear(item.releaseYear)) errors.push(`${prefix}-year-invalid`);
  if (!exactKeys(item.attributes, ["genres", "tags"])) errors.push(`${prefix}-attributes-shape-invalid`);
  const genres = unique(item.attributes?.genres);
  const tags = unique(item.attributes?.tags);
  if (!genres || genres.length > 8 || !tags || tags.length > 8) errors.push(`${prefix}-attributes-invalid`);
  if (!exactKeys(item.evidence, ["url", "publishedOn", "positiveRecommendation"])) {
    errors.push(`${prefix}-evidence-shape-invalid`); return;
  }
  if (!directUrl(item.evidence.url)) errors.push(`${prefix}-evidence-url-invalid`);
  if (!validDay(item.evidence.publishedOn) || item.evidence.publishedOn > retrievedOn) {
    errors.push(`${prefix}-evidence-published-on-invalid`);
  }
  if (item.evidence.positiveRecommendation !== true) errors.push(`${prefix}-evidence-positive-invalid`);
}

function sourceForUrl(url, sources) {
  const parsed = directUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  const matches = sources.filter((source) => (
    host === source.domain || (source.subdomainsAllowed && host.endsWith(`.${source.domain}`))
  ));
  return matches.length === 1 ? matches[0] : null;
}

function canonicalRecord(item, rank, retrievedOn) {
  const key = `${item.mediaType}|${item.releaseYear}|${normalizedTitle(item.title)}`;
  return {
    key,
    recordId: `webtip:${hash64(key)}`,
    title: item.title,
    mediaType: item.mediaType,
    releaseYear: item.releaseYear,
    attributes: {
      genres: [...item.attributes.genres],
      tags: [...item.attributes.tags],
    },
    evidence: [{
      domain: directUrl(item.evidence.url).hostname.toLowerCase(),
      url: item.evidence.url,
      publishedOn: item.evidence.publishedOn,
      retrievedOn,
      positiveRecommendation: true,
    }],
    rank,
  };
}

export function evaluateEntdeckenDailyResponse(envelope, sourceRegistry, {
  retrievedOn,
  validUntil = validDay(retrievedOn) ? dayPlus(retrievedOn, ENTDECKEN_DAILY_VALID_DAYS - 1) : null,
} = {}) {
  const sources = validateEntdeckenSourceRegistry(sourceRegistry);
  if (!sources.ok) return result("invalid_response", sources.errors);
  if (!validDay(retrievedOn) || !validDay(validUntil) || validUntil < retrievedOn) {
    return result("invalid_response", ["feed-days-invalid"]);
  }
  if (!exactKeys(envelope, ["searchResultCount", "response"])) {
    return result("invalid_response", ["adapter-envelope-invalid"]);
  }
  if (!Number.isInteger(envelope.searchResultCount) || envelope.searchResultCount < 1
      || envelope.searchResultCount > ENTDECKEN_DAILY_MAX_SEARCH_RESULTS) {
    return result("invalid_response", ["adapter-result-count-invalid"]);
  }
  if (!exactKeys(envelope.response, ["checkedAt", "items"]) || !validInstant(envelope.response.checkedAt)) {
    return result("invalid_response", ["provider-response-shape-invalid"]);
  }
  if (!Array.isArray(envelope.response.items) || envelope.response.items.length < 1
      || envelope.response.items.length > ENTDECKEN_DAILY_MAX_ITEMS) {
    return result("insufficient_evidence", ["provider-items-insufficient"]);
  }
  const shapeErrors = [];
  envelope.response.items.forEach((item, index) => validateProviderItem(item, index, shapeErrors, retrievedOn));
  if (shapeErrors.length) return result("invalid_response", shapeErrors);
  const uniqueUrls = new Set(envelope.response.items.map((item) => item.evidence.url));
  if (uniqueUrls.size > envelope.searchResultCount) {
    return result("invalid_response", ["opinion-url-count-exceeds-search-results"]);
  }

  const records = new Map();
  const sourceErrors = [];
  envelope.response.items.forEach((item, index) => {
    const source = sourceForUrl(item.evidence.url, sources.value);
    if (!source) { sourceErrors.push(`provider-item-${index}-source-unavailable`); return; }
    const next = canonicalRecord(item, index + 1, retrievedOn);
    const previous = records.get(next.key);
    if (!previous) { records.set(next.key, next); return; }
    if (!previous.evidence.some((evidence) => evidence.url === next.evidence[0].url)
        && previous.evidence.length < 3) previous.evidence.push(next.evidence[0]);
    previous.attributes.genres = [...new Set([...previous.attributes.genres, ...next.attributes.genres])].slice(0, 8);
    previous.attributes.tags = [...new Set([...previous.attributes.tags, ...next.attributes.tags])].slice(0, 8);
  });
  if (sourceErrors.length || !records.size) return result("insufficient_evidence", sourceErrors.length ? sourceErrors : ["records-empty"]);
  const items = [...records.values()]
    .sort((left, right) => left.rank - right.rank || left.recordId.localeCompare(right.recordId, "de-AT"))
    .map(({ key: _key, ...record }) => freezeDeep(record));
  const feed = freezeDeep({
    format: ENTDECKEN_DAILY_FEED_FORMAT,
    feedId: ENTDECKEN_DAILY_FEED_ID,
    region: "AT",
    sourceId: ENTDECKEN_DAILY_SOURCE_ID,
    refreshedOn: retrievedOn,
    validUntil,
    items,
  });
  return result("confirmed", [], feed);
}

export function validateEntdeckenDailyFeed(value) {
  if (!exactKeys(value, ["format", "feedId", "region", "sourceId", "refreshedOn", "validUntil", "items"])
      || value.format !== ENTDECKEN_DAILY_FEED_FORMAT
      || value.feedId !== ENTDECKEN_DAILY_FEED_ID
      || value.region !== "AT"
      || value.sourceId !== ENTDECKEN_DAILY_SOURCE_ID
      || !validDay(value.refreshedOn) || !validDay(value.validUntil)
      || value.validUntil < value.refreshedOn
      || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > ENTDECKEN_DAILY_MAX_ITEMS) {
    return Object.freeze({ ok: false, value: null });
  }
  const recordIds = new Set();
  const ranks = new Set();
  for (const item of value.items) {
    if (!exactKeys(item, [
      "recordId", "title", "mediaType", "releaseYear", "attributes", "evidence", "rank",
    ]) || !/^webtip:[a-f0-9]{16}$/.test(item.recordId)
      || !text(item.title) || text(item.title) !== item.title || item.title.length > 200
      || !MEDIA_TYPES.has(item.mediaType) || !validYear(item.releaseYear)
      || !exactKeys(item.attributes, ["genres", "tags"])
      || !unique(item.attributes.genres) || item.attributes.genres.length > 8
      || !unique(item.attributes.tags) || item.attributes.tags.length > 8
      || !Array.isArray(item.evidence) || item.evidence.length < 1 || item.evidence.length > 3
      || !Number.isInteger(item.rank) || item.rank < 1 || item.rank > ENTDECKEN_DAILY_MAX_ITEMS) {
      return Object.freeze({ ok: false, value: null });
    }
    if (recordIds.has(item.recordId) || ranks.has(item.rank)) return Object.freeze({ ok: false, value: null });
    recordIds.add(item.recordId); ranks.add(item.rank);
    const evidenceUrls = new Set();
    for (const evidence of item.evidence) {
      const parsed = directUrl(evidence.url);
      if (!exactKeys(evidence, ["domain", "url", "publishedOn", "retrievedOn", "positiveRecommendation"])
          || !validDomain(evidence.domain) || !parsed
          || parsed.hostname.toLowerCase() !== evidence.domain
          || !ENTDECKEN_DAILY_SOURCE_DOMAINS.some((domain) => (
            evidence.domain === domain || evidence.domain.endsWith(`.${domain}`)
          ))
          || !validDay(evidence.publishedOn) || evidence.publishedOn > value.refreshedOn
          || evidence.retrievedOn !== value.refreshedOn
          || evidence.positiveRecommendation !== true
          || evidenceUrls.has(evidence.url)) return Object.freeze({ ok: false, value: null });
      evidenceUrls.add(evidence.url);
    }
  }
  return Object.freeze({ ok: true, value: freezeDeep(JSON.parse(JSON.stringify(value))) });
}
