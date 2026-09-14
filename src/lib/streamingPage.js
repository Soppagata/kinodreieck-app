import { streamingTitelKennung } from "./streamingProjection.js";

export const STREAMING_PAGE_FORMAT = 1;
export const STREAMING_PAGE_INITIAL_LIMIT = 20;
export const STREAMING_PAGE_BACKGROUND_LIMIT = 1000;
export const STREAMING_PAGE_MAX_LIMIT = 1000;
export const STREAMING_PAGE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const VIEWS = new Set(["all", "new", "library"]);
const SORTS = new Set(["titel", "jahr", "art", "anbieter"]);
const DIRECTIONS = new Set(["auf", "ab"]);

const text = (value) => String(value == null ? "" : value).trim();
const optionalText = (value) => {
  const normalized = text(value);
  return normalized || null;
};
const uniqueStrings = (values, { sort = false } = {}) => {
  const result = [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
  return sort ? result.sort((a, b) => a.localeCompare(b, "de-AT")) : result;
};

export function stableStreamingPageValue(value) {
  if (Array.isArray(value)) return value.map(stableStreamingPageValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableStreamingPageValue(value[key])]));
}

export function stableStreamingPageString(value) {
  return JSON.stringify(stableStreamingPageValue(value));
}

export function normalizeStreamingPageFilters(filters = {}) {
  const sort = SORTS.has(filters?.sort) ? filters.sort : "titel";
  const richtung = DIRECTIONS.has(filters?.richtung) ? filters.richtung : "auf";
  return Object.freeze({
    suche: text(filters?.suche),
    plattform: optionalText(filters?.plattform),
    typ: optionalText(filters?.typ),
    genre: optionalText(filters?.genre),
    dekade: optionalText(filters?.dekade),
    buchstabe: optionalText(filters?.buchstabe),
    sort,
    richtung,
    status: optionalText(filters?.status),
    nurWunsch: filters?.nurWunsch === true,
    nurBewertet: filters?.nurBewertet === true,
  });
}

function libraryIdentity(entry) {
  const rawYear = entry?.jahr ?? entry?.year;
  const year = rawYear === "" || rawYear == null ? null : Number(rawYear);
  const normalized = {
    id: optionalText(entry?.id),
    watchmode_id: optionalText(entry?.watchmode_id ?? entry?.watchmodeId),
    streaming_id: optionalText(entry?.streaming_id ?? entry?.streamingId),
    imdb_id: optionalText(entry?.imdb_id ?? entry?.imdbId),
    tmdb_id: optionalText(entry?.tmdb_id ?? entry?.tmdbId),
    titel: optionalText(entry?.titel ?? entry?.title),
    originaltitel: optionalText(entry?.originaltitel ?? entry?.originalTitle),
    jahr: Number.isInteger(year) && year >= 1870 && year <= 2999 ? year : null,
    typ: optionalText(entry?.typ ?? entry?.type),
  };
  return Object.freeze(normalized);
}

function personalEntry(entry) {
  const id = optionalText(entry?.id);
  const fensterBeginn = Number(entry?.fensterBeginn);
  const verbrauchtBis = Number(entry?.verbrauchtBis);
  if (!id || !Number.isFinite(fensterBeginn) || !Number.isFinite(verbrauchtBis)
      || verbrauchtBis < fensterBeginn) return null;
  return Object.freeze({ id, fensterBeginn, verbrauchtBis });
}

function legacyEntry(entry) {
  const id = optionalText(entry?.id);
  const firstSeenAt = Number(entry?.firstSeenAt);
  return id && Number.isFinite(firstSeenAt) ? Object.freeze({ id, firstSeenAt }) : null;
}

export function normalizeStreamingPageRequest(request = {}) {
  const view = VIEWS.has(request?.view) ? request.view : "library";
  const rawLimit = Number(request?.limit);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(STREAMING_PAGE_MAX_LIMIT, rawLimit)
    : STREAMING_PAGE_INITIAL_LIMIT;
  const personal = request?.personal || {};
  const normalized = {
    format: STREAMING_PAGE_FORMAT,
    services: uniqueStrings(request?.services, { sort: true }),
    view,
    limit,
    cursor: optionalText(request?.cursor),
    filters: normalizeStreamingPageFilters(request?.filters),
    library: (Array.isArray(request?.library) ? request.library : []).map(libraryIdentity),
    personal: {
      seenIds: uniqueStrings(personal.seenIds, { sort: true }),
      mustWatchIds: uniqueStrings(personal.mustWatchIds, { sort: true }),
      ratedIds: uniqueStrings(personal.ratedIds, { sort: true }),
      newEntries: (Array.isArray(personal.newEntries) ? personal.newEntries : []).map(personalEntry).filter(Boolean),
      legacyNew: (Array.isArray(personal.legacyNew) ? personal.legacyNew : []).map(legacyEntry).filter(Boolean),
    },
  };
  return Object.freeze(normalized);
}

function streamingPageQuerySignature(request = {}) {
  const normalized = normalizeStreamingPageRequest({ ...request, cursor: null, limit: STREAMING_PAGE_INITIAL_LIMIT });
  return stableStreamingPageString(normalized);
}

function opaqueHash(value) {
  let hash = 14695981039346656037n;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(36).padStart(13, "0");
}

/* Öffentliche UI-/Sessionkennung ohne persönliche Requestdaten. Die volle
   Signatur bleibt für Kollisions- und Kontextprüfungen ausschließlich intern. */
export function streamingPageQueryKey(request = {}, accountScope = "") {
  return `sp1-${opaqueHash(`${String(accountScope || "")}\n${streamingPageQuerySignature(request)}`)}`;
}

export function shouldDeferStreamingKnownLoad({
  tab,
  accountReady = false,
  accountBootPending = false,
  servicesReady = false,
  pageEnabled = false,
  pageStatus = "idle",
} = {}) {
  if (tab !== "streaming") return false;
  if (accountBootPending === true) return true;
  if (accountReady !== true) return false;
  if (!servicesReady) return true;
  return pageEnabled === true && ["idle", "loading"].includes(pageStatus);
}

export function resolveAccountBootStartTab({
  startTab,
  supportedTabs = [],
  accountMode,
  accountReady = false,
  navigationRevisionAtBoot = 0,
  currentNavigationRevision = 0,
} = {}) {
  const tab = String(startTab || "");
  if (!supportedTabs.includes(tab) || navigationRevisionAtBoot !== currentNavigationRevision) {
    return Object.freeze({ applyTab: null, pendingTab: null });
  }
  if (accountReady || tab === "mediathek") {
    return Object.freeze({ applyTab: tab, pendingTab: null });
  }
  return accountMode === "account"
    ? Object.freeze({ applyTab: null, pendingTab: tab })
    : Object.freeze({ applyTab: null, pendingTab: null });
}

const finiteCount = (value) => Number.isInteger(value) && value >= 0 ? value : null;
const timestamp = (value) => {
  if (value == null || value === "") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

export function normalizeStreamingPageResponse(raw) {
  const value = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.format !== STREAMING_PAGE_FORMAT
      || !["ready", "version_changed"].includes(value.status)
      || !text(value.version)) {
    throw new Error("Streaming-Seite ohne unterstützten Antwortvertrag");
  }
  if (value.status === "version_changed") {
    return Object.freeze({ format: STREAMING_PAGE_FORMAT, status: "version_changed", version: text(value.version) });
  }
  if (!Array.isArray(value.items) || !value.counts || typeof value.counts !== "object") {
    throw new Error("Streaming-Seite ohne Items oder Zähler");
  }
  const counts = {
    all: finiteCount(value.counts.all),
    new: finiteCount(value.counts.new),
    library: finiteCount(value.counts.library),
  };
  if (Object.values(counts).some((count) => count == null)) {
    throw new Error("Streaming-Seite mit ungültigen Zählern");
  }
  const total = finiteCount(value.total);
  if (total == null) throw new Error("Streaming-Seite mit ungültiger Trefferzahl");
  const nextCursor = optionalText(value.nextCursor);
  const complete = value.complete === true;
  if (!complete && !nextCursor) throw new Error("Unvollständige Streaming-Seite ohne Cursor");
  return Object.freeze({
    format: STREAMING_PAGE_FORMAT,
    status: "ready",
    region: text(value.region) || "AT",
    version: text(value.version),
    generatedAt: timestamp(value.generatedAt),
    counts: Object.freeze(counts),
    total,
    items: Object.freeze(value.items.map((item) => Object.freeze({ ...item }))),
    nextCursor,
    complete,
    nextExpiryAt: timestamp(value.nextExpiryAt),
    meta: Object.freeze(value.meta && typeof value.meta === "object" ? { ...value.meta } : {}),
  });
}

export function streamingPageCacheExpiry(page, cachedAt, maxAgeMs = STREAMING_PAGE_CACHE_MAX_AGE_MS) {
  const limits = [];
  if (Number.isFinite(cachedAt) && Number.isFinite(maxAgeMs) && maxAgeMs > 0) limits.push(cachedAt + maxAgeMs);
  const semanticExpiry = Date.parse(page?.nextExpiryAt || "");
  if (Number.isFinite(semanticExpiry)) limits.push(semanticExpiry);
  return limits.length ? Math.min(...limits) : null;
}

export function isStreamingPageCacheFresh(page, cachedAt, now = Date.now(), maxAgeMs) {
  const expiry = streamingPageCacheExpiry(page, cachedAt, maxAgeMs);
  return Number.isFinite(expiry) && Number(now) < expiry;
}

export function mergeStreamingPageItems(previous = [], incoming = []) {
  const result = [], positions = new Map();
  for (const item of [...previous, ...incoming]) {
    const identity = streamingTitelKennung(item)
      || stableStreamingPageString([item?.titel ?? item?.title, item?.jahr ?? item?.year, item?.typ ?? item?.type]);
    if (!positions.has(identity)) {
      positions.set(identity, result.length);
      result.push(item);
    } else {
      result[positions.get(identity)] = item;
    }
  }
  return result;
}
