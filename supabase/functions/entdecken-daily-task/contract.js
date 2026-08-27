/* Providerunabhaengiger Vertrag fuer den globalen Entdecken-Wochenfeed.
   Der historische Function-/Exportname bleibt kompatibel. Konten, Profile,
   Seen-Staende, Dienste und lokale Kataloglisten gehoeren nie in diesen Pfad. */

import {
  ENTDECKEN_PUBLIC_FEED_FORMAT,
  ENTDECKEN_PUBLIC_FEED_ID,
  ENTDECKEN_PUBLIC_POOL_SIZE,
  ENTDECKEN_PUBLIC_SOURCE_ID,
} from "./publicChartAdapter.js";
import {
  ENTDECKEN_MIXED_FEED_FORMAT,
  ENTDECKEN_MIXED_FEED_ID,
  ENTDECKEN_MIXED_MARKET_COUNTS,
  ENTDECKEN_MIXED_POOL_SIZE,
  ENTDECKEN_MIXED_SOURCE_ID,
  ENTDECKEN_OEFI_SOURCE_ID,
} from "./publicMixAdapter.js";

export const ENTDECKEN_WEEKLY_FEED_FORMAT = 4;
export const ENTDECKEN_WEEKLY_FEED_ID = "websearch:weekly-positive-at";
export const ENTDECKEN_WEEKLY_SOURCE_ID = "websearch:weekly-positive";
/* Breite Lesekompatibilitaet fuer bereits gespeicherte Feeds; ein neuer
   Refresh darf darunter nur den engeren Produktumfang schreiben. */
export const ENTDECKEN_WEEKLY_MAX_ITEMS = 20;
export const ENTDECKEN_WEEKLY_REFRESH_MIN_ITEMS = 5;
export const ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS = 7;
/* Der Anbieter liefert einen kleinen Kandidatenpuffer. Erst danach werden
   Quellenalter, Evidenz, Identitaet und Dubletten geprueft; sichtbar und
   gespeichert bleiben weiterhin hoechstens sieben Titel. */
export const ENTDECKEN_WEEKLY_MAX_CANDIDATES = 12;
export const ENTDECKEN_WEEKLY_MAX_SEARCH_RESULTS = 20;
export const ENTDECKEN_WEEKLY_MAX_SOURCE_AGE_DAYS = 35;
export const ENTDECKEN_WEEKLY_MAX_SOURCES = 10;
export const ENTDECKEN_WEEKLY_PARTIAL_NOTICE = "Einige Wochentipps waren unvollständig. Angezeigt werden nur sicher belegte Titel.";
export const ENTDECKEN_WEEKLY_DEGRADED_NOTICE = "Die neuen Wochentipps waren nicht verlässlich lesbar. Der bisherige Feed bleibt sichtbar.";

/* Kompatibilitaetsnamen fuer bestehende lokale Runner und Live-Gates. */
export const ENTDECKEN_DAILY_FEED_FORMAT = ENTDECKEN_WEEKLY_FEED_FORMAT;
export const ENTDECKEN_DAILY_FEED_ID = ENTDECKEN_WEEKLY_FEED_ID;
export const ENTDECKEN_DAILY_SOURCE_ID = ENTDECKEN_WEEKLY_SOURCE_ID;
export const ENTDECKEN_DAILY_MAX_ITEMS = ENTDECKEN_WEEKLY_MAX_CANDIDATES;
export const ENTDECKEN_DAILY_MAX_SEARCH_RESULTS = ENTDECKEN_WEEKLY_MAX_SEARCH_RESULTS;
export const ENTDECKEN_DAILY_VALID_DAYS = 7;

const LEGACY_FEED = Object.freeze({
  format: 3,
  feedId: "websearch:daily-tips-at",
  sourceId: "websearch:daily-tips",
});
const LEGACY_SOURCE_DOMAINS = Object.freeze(["derstandard.at", "film.at"]);
const MEDIA_TYPES = new Set(["film", "series"]);
const EXTERNAL_ID_NAMESPACES = Object.freeze(["imdb", "tmdb", "watchmode"]);
const RESPONSE_MODES = new Set(["structured", "partial", "degraded"]);
const WARNING_FORM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_WARNINGS = 8;

/* Supabase Edge stellt bei einem real leeren POST einen Body-Stream bereit,
   obwohl Content-Length 0 ist. Deshalb entscheidet der deklarierte Umfang;
   fehlt er, bleibt jeder vorhandene Stream fail-closed verboten. */
export function requestHasForbiddenBody(request) {
  try {
    const declaredLength = request?.headers?.get?.("content-length");
    if (declaredLength !== null && declaredLength !== undefined) {
      return !/^0+$/.test(String(declaredLength).trim());
    }
    return request?.body !== null;
  } catch {
    return true;
  }
}

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
function stablePublicSourceId(value) {
  return typeof value === "string" && /^chart:[a-z0-9][a-z0-9_-]{1,95}$/.test(value);
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
function daysBetween(earlier, later) {
  return Math.floor((Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / 86_400_000);
}
function safePresentation(value) {
  const keys = ["responseMode", "displayText", "warnings"];
  const count = keys.filter((key) => Object.prototype.hasOwnProperty.call(value || {}, key)).length;
  if (count === 0) {
    return Object.freeze({ responseMode: "structured", displayText: null, warnings: Object.freeze([]) });
  }
  if (count !== keys.length || !RESPONSE_MODES.has(value.responseMode)
      || (value.displayText !== null
        && (typeof value.displayText !== "string" || text(value.displayText) !== value.displayText
          || !value.displayText || value.displayText.length > 320
          || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value.displayText)))
      || !Array.isArray(value.warnings) || value.warnings.length > MAX_WARNINGS
      || value.warnings.some((warning) => (
        typeof warning !== "string" || warning.length > 64 || !WARNING_FORM.test(warning)
      ))) return null;
  if (value.responseMode === "structured"
      && (value.displayText !== null || value.warnings.length !== 0)) return null;
  if (value.responseMode !== "structured" && value.displayText === null) return null;
  return freezeDeep({
    responseMode: value.responseMode,
    displayText: value.displayText,
    warnings: [...new Set(value.warnings)],
  });
}
function mergePresentation(base, warnings = [], degraded = false) {
  const mergedWarnings = [...new Set([...(base?.warnings || []), ...warnings])].slice(0, MAX_WARNINGS);
  if (degraded || base?.responseMode === "degraded") {
    return freezeDeep({
      responseMode: "degraded",
      displayText: ENTDECKEN_WEEKLY_DEGRADED_NOTICE,
      warnings: mergedWarnings,
    });
  }
  if (base?.responseMode === "partial" || mergedWarnings.length) {
    return freezeDeep({
      responseMode: "partial",
      displayText: ENTDECKEN_WEEKLY_PARTIAL_NOTICE,
      warnings: mergedWarnings,
    });
  }
  return freezeDeep({ responseMode: "structured", displayText: null, warnings: [] });
}
function result(status, errors = [], feed = null, presentation = null, quality = null) {
  const safe = presentation || mergePresentation(null, ["response-invalid"], true);
  return Object.freeze({
    ok: status === "confirmed",
    status,
    errors: Object.freeze([...new Set(errors)]),
    feed,
    ...safe,
    ...(quality ? { quality: freezeDeep({ ...quality }) } : {}),
  });
}

function isoWeekData(day) {
  if (!validDay(day)) return null;
  const current = new Date(`${day}T00:00:00.000Z`);
  const weekday = current.getUTCDay() || 7;
  const weekEnd = new Date(current);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7 - weekday);
  current.setUTCDate(current.getUTCDate() + 4 - weekday);
  const year = current.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const calendarWeek = Math.ceil((((current - yearStart) / 86_400_000) + 1) / 7);
  const paddedWeek = String(calendarWeek).padStart(2, "0");
  return Object.freeze({
    year,
    calendarWeek,
    isoWeek: `${year}-W${paddedWeek}`,
    validUntil: weekEnd.toISOString().slice(0, 10),
  });
}

function weeklyQuery(year, calendarWeek) {
  return `Aktuelle positiv bewertete Film- und Serien-Charts und Tipps Österreich ${year} KW ${String(calendarWeek).padStart(2, "0")}`;
}

export function createEntdeckenWeeklyQueryContext(day, claimedIsoWeek = null) {
  const week = isoWeekData(day);
  if (!week || (claimedIsoWeek !== null && claimedIsoWeek !== week.isoWeek)) return null;
  return freezeDeep({
    year: week.year,
    calendarWeek: week.calendarWeek,
    isoWeek: week.isoWeek,
    query: weeklyQuery(week.year, week.calendarWeek),
  });
}

export function validateEntdeckenWeeklyQueryContext(value) {
  if (!exactKeys(value, ["year", "calendarWeek", "isoWeek", "query"])
      || !Number.isInteger(value.year) || value.year < 2020 || value.year > 2200
      || !Number.isInteger(value.calendarWeek) || value.calendarWeek < 1 || value.calendarWeek > 53
      || value.isoWeek !== `${value.year}-W${String(value.calendarWeek).padStart(2, "0")}`
      || value.query !== weeklyQuery(value.year, value.calendarWeek)) return null;
  const januaryFourth = new Date(Date.UTC(value.year, 0, 4));
  const weekday = januaryFourth.getUTCDay() || 7;
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() - weekday + 1 + ((value.calendarWeek - 1) * 7));
  const check = isoWeekData(januaryFourth.toISOString().slice(0, 10));
  return check?.isoWeek === value.isoWeek ? freezeDeep(JSON.parse(JSON.stringify(value))) : null;
}

function normalizeExternalIds(value) {
  if (!plain(value) || Object.keys(value).some((key) => !EXTERNAL_ID_NAMESPACES.includes(key))) return null;
  const normalized = {};
  for (const namespace of EXTERNAL_ID_NAMESPACES) {
    if (!(namespace in value)) continue;
    const id = text(value[namespace]);
    if (namespace === "imdb") {
      if (!/^tt\d{5,12}$/i.test(id)) return null;
      normalized.imdb = id.toLowerCase();
    } else {
      if (!/^[1-9]\d{0,14}$/.test(id)) return null;
      normalized[namespace] = id;
    }
  }
  return normalized;
}

export function validateEntdeckenSourceRegistry(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > ENTDECKEN_WEEKLY_MAX_SOURCES) {
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
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze([...new Set(errors)]), value: null });
  return Object.freeze({ ok: true, errors: Object.freeze([]), value: freezeDeep(JSON.parse(JSON.stringify(value))) });
}

/* Der private kostenlose Produktpfad besitzt absichtlich einen eigenen
   Quellenstatus. `owner_private` ist keine behauptete Betreiberfreigabe und
   kann deshalb nie mit einem kommerziellen Produktmodus verwechselt werden. */
export function validateEntdeckenPublicSourceRegistry(value) {
  if (!Array.isArray(value) || value.length !== 1) {
    return Object.freeze({ ok: false, errors: Object.freeze(["public-source-registry-size-invalid"]), value: null });
  }
  const source = value[0];
  const errors = [];
  if (!exactKeys(source, [
    "sourceId", "domain", "publisherFamily", "sourceClass", "rightsStatus",
    "attributionApproved", "subdomainsAllowed", "active", "termsUrl", "termsCheckedOn",
  ])) errors.push("public-source-shape-invalid");
  if (!stablePublicSourceId(source?.sourceId) || source?.sourceId !== ENTDECKEN_PUBLIC_SOURCE_ID) {
    errors.push("public-source-id-invalid");
  }
  if (source?.domain !== "joyn.at" || !validDomain(source?.domain)) errors.push("public-source-domain-invalid");
  if (source?.publisherFamily !== "Joyn AT / ProSiebenSat.1 PULS 4") errors.push("public-source-family-invalid");
  if (source?.sourceClass !== "chart" || source?.rightsStatus !== "owner_private"
      || source?.attributionApproved !== true || source?.subdomainsAllowed !== true
      || source?.active !== true) errors.push("public-source-policy-invalid");
  if (!directUrl(source?.termsUrl) || !validDay(source?.termsCheckedOn)) errors.push("public-source-terms-invalid");
  return errors.length
    ? Object.freeze({ ok: false, errors: Object.freeze([...new Set(errors)]), value: null })
    : Object.freeze({ ok: true, errors: Object.freeze([]), value: freezeDeep(JSON.parse(JSON.stringify(value))) });
}

/* Der neue Mix ist weiterhin ein privater, providerfreier Produktpfad. Beide
   Quellen werden explizit gebunden; eine zusaetzliche aktive Chartquelle oder
   ein geaenderter Rechte-/Betreiberstatus stoppt vor dem ersten GET. */
export function validateEntdeckenMixedSourceRegistry(value) {
  if (!Array.isArray(value) || value.length !== 2) {
    return Object.freeze({ ok: false, errors: Object.freeze(["mixed-source-registry-size-invalid"]), value: null });
  }
  const byId = new Map(value.map((source) => [source?.sourceId, source]));
  const expected = Object.freeze({
    [ENTDECKEN_PUBLIC_SOURCE_ID]: Object.freeze({
      domain: "joyn.at", publisherFamily: "Joyn AT / ProSiebenSat.1 PULS 4", subdomainsAllowed: true,
    }),
    [ENTDECKEN_OEFI_SOURCE_ID]: Object.freeze({
      domain: "filminstitut.at", publisherFamily: "Österreichisches Filminstitut", subdomainsAllowed: false,
    }),
  });
  const errors = [];
  for (const sourceId of Object.keys(expected)) {
    const source = byId.get(sourceId);
    const policy = expected[sourceId];
    if (!exactKeys(source, [
      "sourceId", "domain", "publisherFamily", "sourceClass", "rightsStatus",
      "attributionApproved", "subdomainsAllowed", "active", "termsUrl", "termsCheckedOn",
    ])) { errors.push(`${sourceId}-shape-invalid`); continue; }
    if (!stablePublicSourceId(source.sourceId) || source.sourceId !== sourceId) errors.push(`${sourceId}-id-invalid`);
    if (source.domain !== policy.domain || !validDomain(source.domain)) errors.push(`${sourceId}-domain-invalid`);
    if (source.publisherFamily !== policy.publisherFamily) errors.push(`${sourceId}-family-invalid`);
    if (source.sourceClass !== "chart" || source.rightsStatus !== "owner_private"
        || source.attributionApproved !== true || source.subdomainsAllowed !== policy.subdomainsAllowed
        || source.active !== true) errors.push(`${sourceId}-policy-invalid`);
    const terms = directUrl(source.termsUrl);
    const termsHostAllowed = terms && (terms.hostname === policy.domain
      || (policy.subdomainsAllowed && terms.hostname.endsWith(`.${policy.domain}`)));
    if (!termsHostAllowed || !validDay(source.termsCheckedOn)) {
      errors.push(`${sourceId}-terms-invalid`);
    }
  }
  if (byId.size !== 2) errors.push("mixed-source-id-duplicate");
  return errors.length
    ? Object.freeze({ ok: false, errors: Object.freeze([...new Set(errors)]), value: null })
    : Object.freeze({ ok: true, errors: Object.freeze([]), value: freezeDeep(JSON.parse(JSON.stringify(value))) });
}

function publicMediaTypeForUrl(value) {
  const parsed = directUrl(value);
  if (!parsed || parsed.hostname !== "www.joyn.at") return null;
  if (parsed.pathname.startsWith("/filme/") && parsed.pathname.length > "/filme/".length) return "film";
  if (parsed.pathname.startsWith("/serien/") && parsed.pathname.length > "/serien/".length) return "series";
  return null;
}
function validatePublicFeedItem(item, retrievedOn, checkedAt) {
  return exactKeys(item, [
    "title", "sourceItemId", "mediaType", "genres", "licenseTypes",
    "sourcePosition", "listDate", "sourceUrl", "fetchedAt",
  ])
    && typeof item.title === "string" && item.title === text(item.title)
    && item.title.length >= 1 && item.title.length <= 200
    && typeof item.sourceItemId === "string"
    && /^[fs]_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.sourceItemId)
    && item.sourceItemId.length <= 182
    && ["film", "series"].includes(item.mediaType)
    && unique(item.genres, 80) !== null && item.genres.length <= 8
    && unique(item.licenseTypes, 20) !== null && item.licenseTypes.length >= 1
    && item.licenseTypes.length <= 4
    && item.licenseTypes.every((license) => ["AVOD", "FVOD", "SVOD"].includes(license))
    && Number.isInteger(item.sourcePosition) && item.sourcePosition >= 1 && item.sourcePosition <= 50
    && item.listDate === retrievedOn && item.fetchedAt === checkedAt
    && validInstant(item.fetchedAt) && new Date(item.fetchedAt).toISOString() === item.fetchedAt
    && publicMediaTypeForUrl(item.sourceUrl) === item.mediaType;
}
function mixedSourceUrl(item) {
  const parsed = directUrl(item?.sourceUrl);
  if (!parsed) return false;
  if (item.sourceId === ENTDECKEN_PUBLIC_SOURCE_ID) {
    return item.sourceLabel === "Joyn Österreich" && publicMediaTypeForUrl(item.sourceUrl) === item.mediaType;
  }
  return item.sourceId === ENTDECKEN_OEFI_SOURCE_ID
    && item.sourceLabel === "Österreichisches Filminstitut"
    && item.mediaType === "film" && parsed.hostname === "filminstitut.at" && parsed.pathname === "/charts";
}
function validateMixedFeedItem(item, retrievedOn, checkedAt) {
  if (!exactKeys(item, [
    "title", "sourceItemId", "sourceId", "sourceLabel", "mediaType", "genres",
    "availability", "popularity", "sourceUrl", "fetchedAt",
  ]) || typeof item.title !== "string" || item.title !== text(item.title)
      || item.title.length < 1 || item.title.length > 200
      || typeof item.sourceItemId !== "string"
      || !/^[fs]_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.sourceItemId)
      || item.sourceItemId.length > 182 || !["film", "series"].includes(item.mediaType)
      || unique(item.genres, 80) === null || item.genres.length > 8
      || item.fetchedAt !== checkedAt || !validInstant(item.fetchedAt)
      || new Date(item.fetchedAt).toISOString() !== item.fetchedAt || !mixedSourceUrl(item)
      || !exactKeys(item.availability, ["region", "market", "service", "licenseTypes"])
      || item.availability.region !== "AT" || !["cinema", "streaming"].includes(item.availability.market)
      || !exactKeys(item.popularity, ["metric", "rank", "measuredOn", "value"])
      || !Number.isInteger(item.popularity.rank) || item.popularity.rank < 1 || item.popularity.rank > 50
      || !validDay(item.popularity.measuredOn) || item.popularity.measuredOn > retrievedOn) return false;
  const licenses = unique(item.availability.licenseTypes, 20);
  if (!licenses || licenses.length > 4
      || licenses.some((license) => !["AVOD", "FVOD", "SVOD"].includes(license))) return false;
  if (item.sourceId === ENTDECKEN_PUBLIC_SOURCE_ID) {
    return item.availability.market === "streaming" && item.availability.service === "Joyn"
      && licenses.length >= 1 && item.popularity.metric === "source-chart-rank"
      && item.popularity.value === null && item.popularity.measuredOn === retrievedOn;
  }
  return item.availability.market === "cinema" && item.availability.service === null
    && licenses.length === 0 && item.popularity.metric === "weekend-admissions"
    && Number.isSafeInteger(item.popularity.value) && item.popularity.value >= 0;
}
function sixDaysAfter(day) {
  if (!validDay(day)) return null;
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 6);
  return value.toISOString().slice(0, 10);
}
function validPublicAnnotation(value, itemsById) {
  if (!exactKeys(value, ["sourceItemId", "qid", "mediaType", "releaseYear", "externalIds", "resolvedAt"])
      || !itemsById.has(value.sourceItemId) || !/^Q[1-9]\d*$/.test(value.qid)
      || value.mediaType !== itemsById.get(value.sourceItemId).mediaType
      || (value.releaseYear !== null && !validYear(value.releaseYear))
      || !exactKeys(value.externalIds, [], ["imdb", "tmdb"])
      || ("imdb" in value.externalIds && !/^tt\d{7,10}$/.test(value.externalIds.imdb))
      || ("tmdb" in value.externalIds && !/^[1-9]\d{0,8}$/.test(value.externalIds.tmdb))
      || !validInstant(value.resolvedAt) || new Date(value.resolvedAt).toISOString() !== value.resolvedAt) return false;
  return value.releaseYear !== null || Object.keys(value.externalIds).length > 0;
}

export function evaluateEntdeckenPublicResponse(envelope, sourceRegistry, {
  retrievedOn,
  claimedIsoWeek = null,
} = {}) {
  const sources = validateEntdeckenPublicSourceRegistry(sourceRegistry);
  const week = isoWeekData(retrievedOn);
  const expectedQuery = createEntdeckenWeeklyQueryContext(retrievedOn, claimedIsoWeek);
  if (!sources.ok) return result("invalid_response", sources.errors);
  if (!week || !expectedQuery || !exactKeys(envelope, [
    "sourceMode", "sourceId", "queryContext", "checkedAt", "retrievedOn", "isoWeek", "items",
  ], ["annotations"]) || envelope.sourceMode !== "public-chart" || envelope.sourceId !== ENTDECKEN_PUBLIC_SOURCE_ID
      || envelope.retrievedOn !== retrievedOn || envelope.isoWeek !== week.isoWeek
      || !validInstant(envelope.checkedAt) || new Date(envelope.checkedAt).toISOString() !== envelope.checkedAt
      || JSON.stringify(validateEntdeckenWeeklyQueryContext(envelope.queryContext)) !== JSON.stringify(expectedQuery)
      || !Array.isArray(envelope.items) || envelope.items.length !== ENTDECKEN_PUBLIC_POOL_SIZE) {
    return result("invalid_response", ["public-chart-envelope-invalid"]);
  }
  const identities = new Set();
  const sourceItemIds = new Set();
  const positions = new Set();
  const urls = new Set();
  for (const item of envelope.items) {
    if (!validatePublicFeedItem(item, retrievedOn, envelope.checkedAt)) {
      return result("invalid_response", ["public-chart-item-invalid"]);
    }
    const mediaType = publicMediaTypeForUrl(item.sourceUrl);
    const identity = normalizedTitle(item.title);
    const position = `${mediaType}|${item.sourcePosition}`;
    if (!normalizedTitle(item.title) || identities.has(identity) || sourceItemIds.has(item.sourceItemId)
        || positions.has(position) || urls.has(item.sourceUrl)) {
      return result("invalid_response", ["public-chart-identity-invalid"]);
    }
    identities.add(identity); sourceItemIds.add(item.sourceItemId); positions.add(position); urls.add(item.sourceUrl);
  }
  const itemsById = new Map(envelope.items.map((item) => [item.sourceItemId, item]));
  const annotations = envelope.annotations ?? [];
  if (!Array.isArray(annotations) || annotations.length > ENTDECKEN_PUBLIC_POOL_SIZE
      || annotations.some((entry) => !validPublicAnnotation(entry, itemsById))
      || new Set(annotations.map((entry) => entry.sourceItemId)).size !== annotations.length) {
    return result("invalid_response", ["public-chart-annotations-invalid"]);
  }
  const feed = freezeDeep({
    format: ENTDECKEN_PUBLIC_FEED_FORMAT,
    feedId: ENTDECKEN_PUBLIC_FEED_ID,
    region: "AT",
    sourceId: ENTDECKEN_PUBLIC_SOURCE_ID,
    isoWeek: week.isoWeek,
    refreshedOn: retrievedOn,
    validUntil: sixDaysAfter(retrievedOn),
    items: JSON.parse(JSON.stringify(envelope.items)),
    annotations: JSON.parse(JSON.stringify(annotations)),
  });
  return result("confirmed", [], feed, mergePresentation(null), {
    candidateItemCount: envelope.items.length,
    eligibleUniqueCount: identities.size,
    rejectedItemCount: 0,
    duplicateItemCount: 0,
  });
}

export function evaluateEntdeckenMixedResponse(envelope, sourceRegistry, {
  retrievedOn,
  claimedIsoWeek = null,
} = {}) {
  const sources = validateEntdeckenMixedSourceRegistry(sourceRegistry);
  const week = isoWeekData(retrievedOn);
  const expectedQuery = createEntdeckenWeeklyQueryContext(retrievedOn, claimedIsoWeek);
  if (!sources.ok) return result("invalid_response", sources.errors);
  if (!week || !expectedQuery || !exactKeys(envelope, [
    "sourceMode", "sourceId", "sourceIds", "queryContext", "checkedAt", "retrievedOn", "isoWeek", "items",
  ], ["annotations"]) || envelope.sourceMode !== "public-mix" || envelope.sourceId !== ENTDECKEN_MIXED_SOURCE_ID
      || !Array.isArray(envelope.sourceIds)
      || JSON.stringify([...envelope.sourceIds].sort()) !== JSON.stringify([
        ENTDECKEN_PUBLIC_SOURCE_ID, ENTDECKEN_OEFI_SOURCE_ID,
      ].sort())
      || envelope.retrievedOn !== retrievedOn || envelope.isoWeek !== week.isoWeek
      || !validInstant(envelope.checkedAt) || new Date(envelope.checkedAt).toISOString() !== envelope.checkedAt
      || JSON.stringify(validateEntdeckenWeeklyQueryContext(envelope.queryContext)) !== JSON.stringify(expectedQuery)
      || !Array.isArray(envelope.items) || envelope.items.length !== ENTDECKEN_MIXED_POOL_SIZE) {
    return result("invalid_response", ["public-mix-envelope-invalid"]);
  }
  const identities = new Set();
  const sourceItemIds = new Set();
  const positions = new Set();
  const marketCounts = { cinema: 0, streamingFilm: 0, streamingSeries: 0 };
  for (const item of envelope.items) {
    if (!validateMixedFeedItem(item, retrievedOn, envelope.checkedAt)) {
      return result("invalid_response", ["public-mix-item-invalid"]);
    }
    const identity = normalizedTitle(item.title);
    const position = `${item.sourceId}|${item.mediaType}|${item.popularity.rank}`;
    if (!identity || identities.has(identity) || sourceItemIds.has(item.sourceItemId) || positions.has(position)) {
      return result("invalid_response", ["public-mix-identity-invalid"]);
    }
    identities.add(identity); sourceItemIds.add(item.sourceItemId); positions.add(position);
    if (item.availability.market === "cinema") marketCounts.cinema += 1;
    else if (item.mediaType === "film") marketCounts.streamingFilm += 1;
    else marketCounts.streamingSeries += 1;
  }
  if (JSON.stringify(marketCounts) !== JSON.stringify(ENTDECKEN_MIXED_MARKET_COUNTS)) {
    return result("invalid_response", ["public-mix-market-counts-invalid"]);
  }
  const itemsById = new Map(envelope.items.map((item) => [item.sourceItemId, item]));
  const annotations = envelope.annotations ?? [];
  if (!Array.isArray(annotations) || annotations.length > ENTDECKEN_MIXED_POOL_SIZE
      || annotations.some((entry) => !validPublicAnnotation(entry, itemsById))
      || new Set(annotations.map((entry) => entry.sourceItemId)).size !== annotations.length) {
    return result("invalid_response", ["public-mix-annotations-invalid"]);
  }
  const feed = freezeDeep({
    format: ENTDECKEN_MIXED_FEED_FORMAT,
    feedId: ENTDECKEN_MIXED_FEED_ID,
    region: "AT",
    sourceId: ENTDECKEN_MIXED_SOURCE_ID,
    sourceIds: [...envelope.sourceIds],
    isoWeek: week.isoWeek,
    refreshedOn: retrievedOn,
    validUntil: sixDaysAfter(retrievedOn),
    items: JSON.parse(JSON.stringify(envelope.items)),
    annotations: JSON.parse(JSON.stringify(annotations)),
  });
  return result("confirmed", [], feed, mergePresentation(null), {
    candidateItemCount: envelope.items.length,
    eligibleUniqueCount: identities.size,
    rejectedItemCount: 0,
    duplicateItemCount: 0,
    marketCounts,
  });
}

function validateProviderItem(item, index, errors, retrievedOn) {
  const prefix = `provider-item-${index}`;
  if (!exactKeys(item, ["title", "mediaType", "releaseYear", "externalIds", "attributes", "evidence"])) {
    errors.push(`${prefix}-shape-invalid`); return;
  }
  if (!text(item.title) || text(item.title) !== item.title || item.title.length > 200) errors.push(`${prefix}-title-invalid`);
  if (!MEDIA_TYPES.has(item.mediaType)) errors.push(`${prefix}-media-type-invalid`);
  if (!validYear(item.releaseYear)) errors.push(`${prefix}-year-invalid`);
  if (!normalizeExternalIds(item.externalIds)) errors.push(`${prefix}-external-ids-invalid`);
  if (!exactKeys(item.attributes, ["genres", "tones", "themes"])) errors.push(`${prefix}-attributes-shape-invalid`);
  for (const key of ["genres", "tones", "themes"]) {
    const values = unique(item.attributes?.[key]);
    if (!values || values.length > 8) errors.push(`${prefix}-${key}-invalid`);
  }
  if (!exactKeys(item.evidence, ["url", "publishedOn", "positiveRecommendation"])) {
    errors.push(`${prefix}-evidence-shape-invalid`); return;
  }
  if (!directUrl(item.evidence.url)) errors.push(`${prefix}-evidence-url-invalid`);
  if (!validDay(item.evidence.publishedOn)) {
    errors.push(`${prefix}-evidence-published-on-invalid`);
  } else {
    const age = daysBetween(item.evidence.publishedOn, retrievedOn);
    if (age < 0 || age > ENTDECKEN_WEEKLY_MAX_SOURCE_AGE_DAYS) {
      errors.push(`${prefix}-evidence-age-invalid`);
    }
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
    externalIds: { ...normalizeExternalIds(item.externalIds) },
    attributes: {
      genres: [...item.attributes.genres],
      tones: [...item.attributes.tones],
      themes: [...item.attributes.themes],
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
  claimedIsoWeek = null,
} = {}) {
  const sources = validateEntdeckenSourceRegistry(sourceRegistry);
  if (!sources.ok) return result("invalid_response", sources.errors);
  const week = isoWeekData(retrievedOn);
  const expectedQuery = createEntdeckenWeeklyQueryContext(retrievedOn, claimedIsoWeek);
  if (!week || !expectedQuery) return result("invalid_response", ["feed-week-invalid"]);
  if (!exactKeys(envelope, ["searchResultCount", "queryContext", "response"], [
    "responseMode", "displayText", "warnings",
  ])) {
    return result("invalid_response", ["adapter-envelope-invalid"]);
  }
  const presentation = safePresentation(envelope);
  if (!presentation) return result("invalid_response", ["adapter-presentation-invalid"]);
  const queryContext = validateEntdeckenWeeklyQueryContext(envelope.queryContext);
  if (!queryContext || JSON.stringify(queryContext) !== JSON.stringify(expectedQuery)) {
    return result("invalid_response", ["adapter-query-context-invalid"], null,
      mergePresentation(presentation, ["query-context-invalid"], true));
  }
  if (!Number.isInteger(envelope.searchResultCount) || envelope.searchResultCount < 0
      || envelope.searchResultCount > ENTDECKEN_WEEKLY_MAX_SEARCH_RESULTS) {
    return result("invalid_response", ["adapter-result-count-invalid"], null,
      mergePresentation(presentation, ["result-count-invalid"], true));
  }
  if (!exactKeys(envelope.response, ["checkedAt", "items"]) || !validInstant(envelope.response.checkedAt)) {
    return result("invalid_response", ["provider-response-shape-invalid"], null,
      mergePresentation(presentation, ["response-shape-invalid"], true));
  }
  if (!Array.isArray(envelope.response.items)) {
    return result("insufficient_evidence", ["provider-items-insufficient"], null,
      mergePresentation(presentation, ["items-missing"], true));
  }

  const records = new Map();
  const itemErrors = [];
  const warnings = [];
  let rejectedItemCount = 0;
  let duplicateItemCount = 0;
  const rawItems = envelope.response.items.slice(0, ENTDECKEN_WEEKLY_MAX_CANDIDATES);
  if (envelope.response.items.length > ENTDECKEN_WEEKLY_MAX_CANDIDATES) warnings.push("candidates-truncated");
  rawItems.forEach((item, index) => {
    const shapeErrors = [];
    validateProviderItem(item, index, shapeErrors, retrievedOn);
    if (shapeErrors.length) {
      rejectedItemCount += 1;
      itemErrors.push(...shapeErrors);
      warnings.push("item-dropped");
      return;
    }
    const source = sourceForUrl(item.evidence.url, sources.value);
    if (!source) {
      rejectedItemCount += 1;
      itemErrors.push(`provider-item-${index}-source-unavailable`);
      warnings.push("item-dropped");
      return;
    }
    const next = canonicalRecord(item, index + 1, retrievedOn);
    const previous = records.get(next.key);
    if (!previous) { records.set(next.key, next); return; }
    duplicateItemCount += 1;
    const idConflict = Object.entries(next.externalIds).some(([namespace, id]) => (
      previous.externalIds[namespace] && previous.externalIds[namespace] !== id
    ));
    if (idConflict) {
      itemErrors.push(`provider-item-${index}-external-id-conflict`);
      warnings.push("item-dropped");
      return;
    }
    for (const [namespace, id] of Object.entries(next.externalIds)) {
      previous.externalIds[namespace] = id;
    }
    if (!previous.evidence.some((evidence) => evidence.url === next.evidence[0].url)
        && previous.evidence.length < 3) previous.evidence.push(next.evidence[0]);
    for (const key of ["genres", "tones", "themes"]) {
      previous.attributes[key] = [...new Set([...previous.attributes[key], ...next.attributes[key]])].slice(0, 8);
    }
  });
  const quality = Object.freeze({
    candidateItemCount: rawItems.length,
    eligibleUniqueCount: records.size,
    rejectedItemCount,
    duplicateItemCount,
  });
  const uniqueUrls = new Set([...records.values()].flatMap((record) => record.evidence.map((entry) => entry.url)));
  if (uniqueUrls.size > envelope.searchResultCount) {
    return result("invalid_response", ["opinion-url-count-exceeds-search-results"], null,
      mergePresentation(presentation, ["result-count-invalid"], true), quality);
  }
  if (records.size < ENTDECKEN_WEEKLY_REFRESH_MIN_ITEMS) {
    return result("insufficient_evidence", itemErrors.length ? itemErrors : ["records-empty"], null,
      mergePresentation(presentation, ["records-insufficient"], true), quality);
  }
  const rankedRecords = [...records.values()]
    .sort((left, right) => left.rank - right.rank || left.recordId.localeCompare(right.recordId, "de-AT"))
  if (rankedRecords.length > ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS) warnings.push("items-truncated");
  const items = rankedRecords.slice(0, ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS)
    .map(({ key: _key, ...record }, rank) => freezeDeep({ ...record, rank: rank + 1 }));
  const feed = freezeDeep({
    format: ENTDECKEN_WEEKLY_FEED_FORMAT,
    feedId: ENTDECKEN_WEEKLY_FEED_ID,
    region: "AT",
    sourceId: ENTDECKEN_WEEKLY_SOURCE_ID,
    isoWeek: week.isoWeek,
    refreshedOn: retrievedOn,
    validUntil: week.validUntil,
    items,
  });
  return result("confirmed", itemErrors, feed, mergePresentation(presentation, warnings), quality);
}

function validateEvidence(evidence, feed, evidenceUrls, weekly) {
  const parsed = directUrl(evidence?.url);
  return exactKeys(evidence, ["domain", "url", "publishedOn", "retrievedOn", "positiveRecommendation"])
    && validDomain(evidence.domain) && parsed
    && parsed.hostname.toLowerCase() === evidence.domain
    && (weekly || LEGACY_SOURCE_DOMAINS.some((domain) => (
      evidence.domain === domain || evidence.domain.endsWith(`.${domain}`)
    )))
    && validDay(evidence.publishedOn)
    && daysBetween(evidence.publishedOn, feed.refreshedOn) >= 0
    && (!weekly || daysBetween(evidence.publishedOn, feed.refreshedOn) <= ENTDECKEN_WEEKLY_MAX_SOURCE_AGE_DAYS)
    && evidence.retrievedOn === feed.refreshedOn
    && evidence.positiveRecommendation === true
    && !evidenceUrls.has(evidence.url);
}

function validateFeedItem(item, feed, weekly) {
  const baseKeys = ["recordId", "title", "mediaType", "releaseYear", "attributes", "evidence", "rank"];
  if (!exactKeys(item, weekly ? [...baseKeys, "externalIds"] : baseKeys)
      || !/^webtip:[a-f0-9]{16}$/.test(item.recordId)
      || !text(item.title) || text(item.title) !== item.title || item.title.length > 200
      || !MEDIA_TYPES.has(item.mediaType) || !validYear(item.releaseYear)
      || !Array.isArray(item.evidence) || item.evidence.length < 1 || item.evidence.length > 3
      || !Number.isInteger(item.rank) || item.rank < 1 || item.rank > ENTDECKEN_WEEKLY_MAX_ITEMS) return false;
  if (weekly) {
    if (!normalizeExternalIds(item.externalIds)
        || !exactKeys(item.attributes, ["genres", "tones", "themes"])) return false;
    for (const key of ["genres", "tones", "themes"]) {
      if (!unique(item.attributes[key]) || item.attributes[key].length > 8) return false;
    }
  } else if (!exactKeys(item.attributes, ["genres", "tags"])
      || !unique(item.attributes.genres) || item.attributes.genres.length > 8
      || !unique(item.attributes.tags) || item.attributes.tags.length > 8) return false;
  const evidenceUrls = new Set();
  for (const evidence of item.evidence) {
    if (!validateEvidence(evidence, feed, evidenceUrls, weekly)) return false;
    evidenceUrls.add(evidence.url);
  }
  return true;
}

export function validateEntdeckenDailyFeed(value) {
  const mixedWeekly = value?.format === ENTDECKEN_MIXED_FEED_FORMAT;
  const publicWeekly = value?.format === ENTDECKEN_PUBLIC_FEED_FORMAT;
  const weekly = value?.format === ENTDECKEN_WEEKLY_FEED_FORMAT;
  const legacy = value?.format === LEGACY_FEED.format;
  const required = ["format", "feedId", "region", "sourceId", "refreshedOn", "validUntil", "items"];
  if ((!mixedWeekly && !publicWeekly && !weekly && !legacy)
      || !exactKeys(value, mixedWeekly ? [...required, "sourceIds", "isoWeek", "annotations"]
        : publicWeekly ? [...required, "isoWeek", "annotations"]
        : weekly ? [...required, "isoWeek"] : required)
      || value.feedId !== (mixedWeekly ? ENTDECKEN_MIXED_FEED_ID : publicWeekly ? ENTDECKEN_PUBLIC_FEED_ID
        : weekly ? ENTDECKEN_WEEKLY_FEED_ID : LEGACY_FEED.feedId)
      || value.region !== "AT"
      || value.sourceId !== (mixedWeekly ? ENTDECKEN_MIXED_SOURCE_ID : publicWeekly ? ENTDECKEN_PUBLIC_SOURCE_ID
        : weekly ? ENTDECKEN_WEEKLY_SOURCE_ID : LEGACY_FEED.sourceId)
      || !validDay(value.refreshedOn) || !validDay(value.validUntil)
      || value.validUntil < value.refreshedOn
      || !Array.isArray(value.items) || value.items.length < 1
      || value.items.length > (mixedWeekly ? ENTDECKEN_MIXED_POOL_SIZE
        : publicWeekly ? ENTDECKEN_PUBLIC_POOL_SIZE : ENTDECKEN_WEEKLY_MAX_ITEMS)) {
    return Object.freeze({ ok: false, value: null });
  }
  if (weekly) {
    const week = isoWeekData(value.refreshedOn);
    if (!week || value.isoWeek !== week.isoWeek || value.validUntil !== week.validUntil) {
      return Object.freeze({ ok: false, value: null });
    }
  }
  if (publicWeekly) {
    const week = isoWeekData(value.refreshedOn);
    if (!week || value.isoWeek !== week.isoWeek || value.validUntil !== sixDaysAfter(value.refreshedOn)
        || value.items.length !== ENTDECKEN_PUBLIC_POOL_SIZE) return Object.freeze({ ok: false, value: null });
    const identities = new Set();
    const sourceItemIds = new Set();
    const positions = new Set();
    const urls = new Set();
    const fetchedAt = value.items[0]?.fetchedAt;
    for (const item of value.items) {
      if (!validatePublicFeedItem(item, value.refreshedOn, fetchedAt)) {
        return Object.freeze({ ok: false, value: null });
      }
      const mediaType = publicMediaTypeForUrl(item.sourceUrl);
      const identity = normalizedTitle(item.title);
      const position = `${mediaType}|${item.sourcePosition}`;
      if (!normalizedTitle(item.title) || identities.has(identity) || sourceItemIds.has(item.sourceItemId)
          || positions.has(position) || urls.has(item.sourceUrl)) {
        return Object.freeze({ ok: false, value: null });
      }
      identities.add(identity); sourceItemIds.add(item.sourceItemId); positions.add(position); urls.add(item.sourceUrl);
    }
    const itemsById = new Map(value.items.map((item) => [item.sourceItemId, item]));
    if (!Array.isArray(value.annotations) || value.annotations.length > ENTDECKEN_PUBLIC_POOL_SIZE
        || value.annotations.some((entry) => !validPublicAnnotation(entry, itemsById))
        || new Set(value.annotations.map((entry) => entry.sourceItemId)).size !== value.annotations.length) {
      return Object.freeze({ ok: false, value: null });
    }
    return Object.freeze({ ok: true, value: freezeDeep(JSON.parse(JSON.stringify(value))) });
  }
  if (mixedWeekly) {
    const week = isoWeekData(value.refreshedOn);
    const expectedSourceIds = [ENTDECKEN_PUBLIC_SOURCE_ID, ENTDECKEN_OEFI_SOURCE_ID].sort();
    if (!week || value.isoWeek !== week.isoWeek || value.validUntil !== sixDaysAfter(value.refreshedOn)
        || value.items.length !== ENTDECKEN_MIXED_POOL_SIZE || !Array.isArray(value.sourceIds)
        || JSON.stringify([...value.sourceIds].sort()) !== JSON.stringify(expectedSourceIds)) {
      return Object.freeze({ ok: false, value: null });
    }
    const identities = new Set();
    const sourceItemIds = new Set();
    const positions = new Set();
    const marketCounts = { cinema: 0, streamingFilm: 0, streamingSeries: 0 };
    const fetchedAt = value.items[0]?.fetchedAt;
    for (const item of value.items) {
      if (!validateMixedFeedItem(item, value.refreshedOn, fetchedAt)) {
        return Object.freeze({ ok: false, value: null });
      }
      const identity = normalizedTitle(item.title);
      const position = `${item.sourceId}|${item.mediaType}|${item.popularity.rank}`;
      if (!identity || identities.has(identity) || sourceItemIds.has(item.sourceItemId) || positions.has(position)) {
        return Object.freeze({ ok: false, value: null });
      }
      identities.add(identity); sourceItemIds.add(item.sourceItemId); positions.add(position);
      if (item.availability.market === "cinema") marketCounts.cinema += 1;
      else if (item.mediaType === "film") marketCounts.streamingFilm += 1;
      else marketCounts.streamingSeries += 1;
    }
    if (JSON.stringify(marketCounts) !== JSON.stringify(ENTDECKEN_MIXED_MARKET_COUNTS)) {
      return Object.freeze({ ok: false, value: null });
    }
    const itemsById = new Map(value.items.map((item) => [item.sourceItemId, item]));
    if (!Array.isArray(value.annotations) || value.annotations.length > ENTDECKEN_MIXED_POOL_SIZE
        || value.annotations.some((entry) => !validPublicAnnotation(entry, itemsById))
        || new Set(value.annotations.map((entry) => entry.sourceItemId)).size !== value.annotations.length) {
      return Object.freeze({ ok: false, value: null });
    }
    return Object.freeze({ ok: true, value: freezeDeep(JSON.parse(JSON.stringify(value))) });
  }
  const recordIds = new Set();
  const ranks = new Set();
  for (const item of value.items) {
    if (!validateFeedItem(item, value, weekly)
        || recordIds.has(item.recordId) || ranks.has(item.rank)) {
      return Object.freeze({ ok: false, value: null });
    }
    recordIds.add(item.recordId); ranks.add(item.rank);
  }
  return Object.freeze({ ok: true, value: freezeDeep(JSON.parse(JSON.stringify(value))) });
}
