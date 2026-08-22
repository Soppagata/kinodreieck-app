/* Zielgebundener Radar-Websearch-Kern fuer den lokalen Mock-Nutzerweg.
   - genau ein bereits aktives Werk-, Reihen- oder Personenziel pro Lauf
   - ein begrenzter Adapteraufruf, keine Retries und kein Scheduler
   - deterministische Ziel-, Zeit-, Regions- und Quellenpruefung
   - globale Funddaten getrennt von persoenlichen Radar-Receipts */

import {
  createPersonIdentityKey,
  matchPersonWorkCandidate,
  validatePersonIdentity,
} from "./personDiscoveryContracts.js";
import { isStableContractId } from "./radarContracts.js";

export const RADAR_WEBSEARCH_FLOW_FORMAT = "kinodreieck-radar-websearch-cache";
export const RADAR_WEBSEARCH_FLOW_VERSION = 1;
export const RADAR_WEBSEARCH_CACHE_KEY = "kd:radar-websearch-cache";
export const RADAR_WEBSEARCH_MAX_RESULTS = 6;
export const RADAR_WEBSEARCH_MAX_EVENTS = 4;
export const RADAR_WEBSEARCH_WINDOW_DAYS_BACK = 30;
export const RADAR_WEBSEARCH_WINDOW_DAYS_FORWARD = 14;
export const RADAR_WEBSEARCH_DEFAULT_TIMEOUT_MS = 135_000;
export const RADAR_WEBSEARCH_DEFAULT_LEASE_MS = 150_000;

const EVENT_TYPES = Object.freeze(["kinostart_at", "streamingstart_at", "serienstart", "staffelstart"]);
const DIGITAL_EVENT_TYPES = new Set(["streamingstart_at", "serienstart", "staffelstart"]);
const REGIONS = Object.freeze(["AT", "DE", "CH", "GLOBAL"]);
const PERSON_ROLES = Object.freeze(["actor", "director"]);
const RESPONSE_STATUSES = Object.freeze(["confirmed", "insufficient_evidence", "no_change"]);
const CHECK_STATUSES = Object.freeze(["checking", "ready", "failed"]);
const SOURCE_CLASSES = Object.freeze(["official", "editorial"]);
const EXTERNAL_WORK_ID = /^(?:imdb:tt\d{5,12}|tmdb:(?:movie|tv):\d+|watchmode:\d+)$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
function exactKeys(value, required, optional = []) {
  if (!plain(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
}
function unique(values) { return [...new Set(values)]; }
function validInstant(value) {
  const normalized = text(value);
  return ISO_INSTANT.test(normalized) && Number.isFinite(Date.parse(normalized));
}
function validDay(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const parsed = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === normalized;
}
function validYear(value) {
  return value === null || (Number.isInteger(value) && value >= 1888 && value <= new Date().getUTCFullYear() + 10);
}
function validLabel(value, max = 240) {
  const normalized = text(value);
  return !!normalized && normalized.length <= max && !/^fixture:/i.test(normalized);
}
function normalizedTitle(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function plusDays(day, amount) {
  const instant = Date.parse(`${day}T12:00:00.000Z`) + amount * 86_400_000;
  return new Date(instant).toISOString().slice(0, 10);
}
function viennaDay(instant) {
  if (!validInstant(instant)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((entry) => [entry.type, entry.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  return validDay(day) ? day : null;
}
function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const character of text(value)) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
function safeId(prefix, value) { return `${prefix}:${fnv1a64(value)}`; }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function createRadarWebsearchWindow(checkedAt) {
  const today = viennaDay(checkedAt);
  if (!today) return null;
  return Object.freeze({
    checkedAt: new Date(checkedAt).toISOString(),
    windowStart: plusDays(today, -RADAR_WEBSEARCH_WINDOW_DAYS_BACK),
    windowEnd: plusDays(today, RADAR_WEBSEARCH_WINDOW_DAYS_FORWARD),
  });
}

export function createRadarWebsearchTargetKey(target) {
  if (!plain(target)) return null;
  if (target.kind === "work" && isStableContractId(target.targetId, { allowFixture: false })) {
    return `work:${target.targetId}`;
  }
  if (target.kind === "person") {
    const identityKey = createPersonIdentityKey(target);
    return identityKey ? `person:${identityKey}` : null;
  }
  if (target.kind === "franchise" && isStableContractId(target.franchiseId, { allowFixture: false })) {
    return `franchise:${target.franchiseId}`;
  }
  return null;
}

export function validateRadarWebsearchTarget(target) {
  const errors = [];
  if (!plain(target) || !["work", "person", "franchise"].includes(target.kind)) {
    return Object.freeze({ ok: false, errors: Object.freeze(["target-invalid"]) });
  }
  if (target.kind === "work") {
    if (!exactKeys(target, ["kind", "targetId", "targetType", "title", "year", "canonical"])) {
      errors.push("work-target-shape-invalid");
    }
    if (!isStableContractId(target.targetId, { allowFixture: false })) errors.push("work-target-id-invalid");
    if (!["work", "series"].includes(target.targetType)) errors.push("work-target-type-invalid");
    if (!validLabel(target.title) || !validYear(target.year)) errors.push("work-target-label-invalid");
    if (target.canonical !== true) errors.push("work-target-not-canonical");
  } else if (target.kind === "person") {
    if (!exactKeys(target, ["kind", "personExternalId", "name", "role", "canonical"])) {
      errors.push("person-target-shape-invalid");
    }
    if (!validatePersonIdentity(target).ok || !PERSON_ROLES.includes(target.role)) errors.push("person-target-invalid");
  } else {
    if (!exactKeys(target, ["kind", "franchiseId", "title", "aliases", "canonical"])) {
      errors.push("franchise-target-shape-invalid");
    }
    const aliases = Array.isArray(target.aliases) ? target.aliases.map(text) : [];
    const normalizedAliases = aliases.map(normalizedTitle);
    if (!isStableContractId(target.franchiseId, { allowFixture: false })) errors.push("franchise-target-id-invalid");
    if (!validLabel(target.title) || aliases.length < 1 || aliases.length > 12
        || aliases.some((alias) => !validLabel(alias, 160))
        || normalizedAliases.some((alias) => !alias)
        || new Set(normalizedAliases).size !== aliases.length
        || !normalizedAliases.includes(normalizedTitle(target.title))) errors.push("franchise-target-aliases-invalid");
    if (target.canonical !== true) errors.push("franchise-target-not-canonical");
  }
  if (!createRadarWebsearchTargetKey(target)) errors.push("target-key-invalid");
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(unique(errors)) });
}

function normalizedCatalog(catalog) {
  return (Array.isArray(catalog) ? catalog : []).filter((entry) => (
    plain(entry) && isStableContractId(entry.targetId, { allowFixture: false })
    && ["work", "series"].includes(entry.targetType) && validLabel(entry.title)
    && Number.isInteger(entry.year)
  )).map((entry) => Object.freeze({
    targetId: text(entry.targetId), targetType: entry.targetType,
    title: text(entry.title), year: entry.year,
  }));
}

function validateWorkShape(work, { idOptional = false } = {}) {
  if (!exactKeys(work, ["targetId", "targetType", "title", "year"])) return false;
  const idValid = idOptional && work.targetId === null
    ? true : isStableContractId(work.targetId, { allowFixture: false });
  return idValid && ["work", "series"].includes(work.targetType)
    && validLabel(work.title) && Number.isInteger(work.year) && validYear(work.year);
}

function resolveEventWork(work, target, catalog) {
  if (!validateWorkShape(work, { idOptional: target.kind === "person" })) {
    return Object.freeze({ ok: false, reason: "event-work-invalid", work: null });
  }
  if (target.kind === "work") {
    const exact = work.targetId === target.targetId && work.targetType === target.targetType
      && normalizedTitle(work.title) === normalizedTitle(target.title)
      && (target.year === null || work.year === target.year);
    return Object.freeze({ ok: exact, reason: exact ? "target-bound" : "work-target-mismatch", work: exact ? work : null });
  }

  const rows = normalizedCatalog(catalog);
  if (target.kind === "franchise") {
    if (!EXTERNAL_WORK_ID.test(text(work.targetId))) {
      return Object.freeze({ ok: false, reason: "franchise-work-strong-id-required", work: null });
    }
    const sameId = rows.filter((entry) => entry.targetId === work.targetId);
    if (sameId.length > 1) return Object.freeze({ ok: false, reason: "franchise-work-ambiguous", work: null });
    if (sameId.length === 1) {
      const [known] = sameId;
      const exact = known.targetType === work.targetType && known.year === work.year
        && normalizedTitle(known.title) === normalizedTitle(work.title);
      return Object.freeze({ ok: exact, reason: exact ? "franchise-strong-id-match" : "franchise-work-conflict", work: exact ? known : null });
    }
    return Object.freeze({ ok: true, reason: "franchise-new-strong-id", work: Object.freeze({ ...work }) });
  }
  if (work.targetId !== null) {
    const sameId = rows.filter((entry) => entry.targetId === work.targetId);
    if (sameId.length > 1) return Object.freeze({ ok: false, reason: "person-work-ambiguous", work: null });
    if (sameId.length === 1) {
      const [known] = sameId;
      const exact = known.targetType === work.targetType && known.year === work.year
        && normalizedTitle(known.title) === normalizedTitle(work.title);
      return Object.freeze({ ok: exact, reason: exact ? "strong-id-match" : "person-work-conflict", work: exact ? known : null });
    }
    if (!EXTERNAL_WORK_ID.test(text(work.targetId))) {
      return Object.freeze({ ok: false, reason: "new-work-strong-id-required", work: null });
    }
    return Object.freeze({ ok: true, reason: "new-strong-id", work: Object.freeze({ ...work }) });
  }

  const decision = matchPersonWorkCandidate(work, rows);
  if (decision.status !== "matched" || decision.work?.targetType !== work.targetType) {
    return Object.freeze({ ok: false, reason: `person-work-${decision.status}`, work: null });
  }
  return Object.freeze({ ok: true, reason: "fail-closed-fallback", work: decision.work });
}

function normalizedSourceRegistry(sources) {
  const byId = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!exactKeys(source, [
      "sourceId", "domain", "publisherFamily", "sourceClass", "rightsStatus",
      "attributionApproved", "subdomainsAllowed", "active",
    ])) continue;
    const sourceId = text(source.sourceId);
    const domain = text(source.domain).toLowerCase();
    if (!isStableContractId(sourceId, { allowFixture: false }) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)
        || !isStableContractId(source.publisherFamily, { allowFixture: false })
        || !SOURCE_CLASSES.includes(source.sourceClass) || source.rightsStatus !== "approved"
        || source.attributionApproved !== true || typeof source.subdomainsAllowed !== "boolean"
        || source.active !== true || byId.has(sourceId)) continue;
    byId.set(sourceId, Object.freeze({ ...source, sourceId, domain, publisherFamily: text(source.publisherFamily) }));
  }
  return byId;
}

function sourceUrlMatches(url, source) {
  let parsed;
  try { parsed = new URL(text(url)); } catch { return false; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  return host === source.domain || (source.subdomainsAllowed && host.endsWith(`.${source.domain}`));
}

function validateEvidence(evidence, sources, checkedAt) {
  const errors = [];
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 2) {
    return Object.freeze({ ok: false, errors: Object.freeze(["event-evidence-count-invalid"]), evidence: Object.freeze([]) });
  }
  const registry = normalizedSourceRegistry(sources);
  const rows = [];
  const sourceIds = new Set();
  const urls = new Set();
  for (const item of evidence) {
    if (!exactKeys(item, ["sourceId", "url", "sourceTitle", "publishedAt", "claim"])) {
      errors.push("event-evidence-shape-invalid"); continue;
    }
    const source = registry.get(text(item.sourceId));
    if (!source) { errors.push("event-source-unapproved"); continue; }
    if (!sourceUrlMatches(item.url, source)) errors.push("event-source-url-invalid");
    if (!validLabel(item.sourceTitle) || text(item.claim).length < 12 || text(item.claim).length > 1200) {
      errors.push("event-source-claim-invalid");
    }
    if (!validDay(item.publishedAt)) errors.push("event-source-date-invalid");
    if (sourceIds.has(source.sourceId) || urls.has(text(item.url))) errors.push("event-source-duplicate");
    sourceIds.add(source.sourceId); urls.add(text(item.url));
    rows.push(Object.freeze({
      sourceId: source.sourceId,
      sourceDomain: source.domain,
      url: text(item.url),
      retrievedAt: checkedAt,
      sourceClass: source.sourceClass,
      publisherFamily: source.publisherFamily,
    }));
  }
  const official = rows.some((entry) => entry.sourceClass === "official");
  const families = new Set(rows.map((entry) => entry.publisherFamily));
  if (!official && families.size < 2) errors.push("event-sources-not-independent");
  rows.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.url.localeCompare(b.url));
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(unique(errors)), evidence: Object.freeze(rows) });
}

function relationMatches(relation, target) {
  if (target.kind === "work") {
    return exactKeys(relation, ["kind", "targetId"])
      && relation.kind === "work" && relation.targetId === target.targetId;
  }
  if (target.kind === "franchise") {
    return exactKeys(relation, ["kind", "franchiseId"])
      && relation.kind === "franchise" && relation.franchiseId === target.franchiseId;
  }
  return exactKeys(relation, ["kind", "personExternalId", "role"])
    && relation.kind === "person" && relation.personExternalId === target.personExternalId
    && relation.role === target.role;
}

function eventRegionValid(eventType, region) {
  return REGIONS.includes(region) && (region !== "GLOBAL" || DIGITAL_EVENT_TYPES.has(eventType));
}

function evaluateEvent(event, { target, catalog, sources, window }) {
  const errors = [];
  if (!exactKeys(event, [
    "work", "relation", "eventType", "date", "region", "platform", "seasonNumber", "evidence", "franchiseEvidence",
  ])) {
    return Object.freeze({ ok: false, errors: Object.freeze(["event-shape-invalid"]), event: null });
  }
  if (!relationMatches(event.relation, target)) errors.push("event-target-relation-mismatch");
  const resolved = resolveEventWork(event.work, target, catalog);
  if (!resolved.ok) errors.push(resolved.reason);
  if (!EVENT_TYPES.includes(event.eventType)) errors.push("event-type-invalid");
  if (!validDay(event.date) || event.date < window.windowStart || event.date > window.windowEnd) {
    errors.push("event-date-outside-window");
  }
  if (!eventRegionValid(event.eventType, event.region)) errors.push("event-region-invalid");
  const platform = text(event.platform);
  if (event.eventType === "streamingstart_at" ? (!platform || platform === "-") : platform !== "-") {
    errors.push("event-platform-invalid");
  }
  if (event.eventType === "staffelstart") {
    if (!Number.isInteger(event.seasonNumber) || event.seasonNumber < 1 || event.seasonNumber > 999) {
      errors.push("event-season-invalid");
    }
  } else if (event.seasonNumber !== null) errors.push("event-season-invalid");
  const proof = validateEvidence(event.evidence, sources, window.checkedAt);
  errors.push(...proof.errors);
  let franchiseProof = Object.freeze({ ok: true, errors: Object.freeze([]), evidence: Object.freeze([]) });
  if (target.kind === "franchise") {
    franchiseProof = validateEvidence(event.franchiseEvidence, sources, window.checkedAt);
    errors.push(...franchiseProof.errors.map((error) => `franchise-${error}`));
  } else if (event.franchiseEvidence !== null) errors.push("event-franchise-evidence-forbidden");
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze(unique(errors)), event: null });

  const work = resolved.work;
  const targetKey = createRadarWebsearchTargetKey(target);
  const identity = [work.targetId, event.eventType, event.region, platform, event.seasonNumber ?? "-"].join("|");
  const targetBoundIdentity = `${targetKey}|${identity}`;
  const eventId = safeId("radar:event", targetBoundIdentity);
  const proofIdentity = [
    ...proof.evidence.map((entry) => `release:${entry.sourceId}|${entry.url}`),
    ...franchiseProof.evidence.map((entry) => `franchise:${entry.sourceId}|${entry.url}`),
  ].join("|");
  const eventVersionId = safeId("radar:version", `${targetBoundIdentity}|${event.date}|${proofIdentity}`);
  return Object.freeze({
    ok: true,
    errors: Object.freeze([]),
    event: freezeDeep({
      eventId, eventVersionId, sourceTargetKey: targetKey, sourceTargetKind: target.kind,
      targetId: work.targetId, targetType: work.targetType, title: work.title, year: work.year,
      eventType: event.eventType, date: event.date, region: event.region, platform,
      seasonNumber: event.seasonNumber, lifecycleStatus: "scheduled", verificationStatus: "confirmed",
      evidence: proof.evidence.map(({ sourceId, sourceDomain, url, retrievedAt }) => ({ sourceId, sourceDomain, url, retrievedAt })),
      franchiseEvidence: target.kind === "franchise"
        ? franchiseProof.evidence.map(({ sourceId, sourceDomain, url, retrievedAt }) => ({ sourceId, sourceDomain, url, retrievedAt }))
        : null,
    }),
  });
}

export function evaluateRadarWebsearchResponse(response, { request, target, catalog = [], sources = [] } = {}) {
  const errors = [];
  if (!plain(request) || !plain(target) || !createRadarWebsearchTargetKey(target)) {
    return Object.freeze({ status: "insufficient_evidence", errors: Object.freeze(["evaluation-context-invalid"]), events: Object.freeze([]) });
  }
  if (!exactKeys(response, ["status", "checkedAt", "targetKey", "searchResultCount", "events"])) {
    return Object.freeze({ status: "insufficient_evidence", errors: Object.freeze(["response-shape-invalid"]), events: Object.freeze([]) });
  }
  if (!RESPONSE_STATUSES.includes(response.status)) errors.push("response-status-invalid");
  if (response.checkedAt !== request.checkedAt) errors.push("response-check-time-mismatch");
  if (response.targetKey !== request.targetKey) errors.push("response-target-mismatch");
  if (!Number.isInteger(response.searchResultCount) || response.searchResultCount < 0
      || response.searchResultCount > RADAR_WEBSEARCH_MAX_RESULTS) errors.push("response-result-limit-exceeded");
  if (!Array.isArray(response.events) || response.events.length > RADAR_WEBSEARCH_MAX_EVENTS) {
    errors.push("response-event-limit-exceeded");
  }
  if (response.status === "confirmed" && response.events?.length < 1) errors.push("response-confirmed-without-event");
  if (Array.isArray(response.events) && Number.isInteger(response.searchResultCount)
      && response.searchResultCount < response.events.length) errors.push("response-result-count-conflict");
  if (response.status !== "confirmed" && response.events?.length) errors.push("response-nonconfirmed-with-event");
  if (errors.length) return Object.freeze({ status: "insufficient_evidence", errors: Object.freeze(unique(errors)), events: Object.freeze([]) });
  if (response.status !== "confirmed") {
    return Object.freeze({ status: response.status, errors: Object.freeze([]), events: Object.freeze([]) });
  }
  const window = createRadarWebsearchWindow(request.checkedAt);
  const evaluated = response.events.map((event) => evaluateEvent(event, { target, catalog, sources, window }));
  errors.push(...evaluated.flatMap((entry) => entry.errors));
  const events = evaluated.map((entry) => entry.event).filter(Boolean);
  const eventIds = new Set();
  for (const event of events) {
    if (eventIds.has(event.eventId)) errors.push("response-event-conflict");
    eventIds.add(event.eventId);
  }
  return errors.length
    ? Object.freeze({ status: "insufficient_evidence", errors: Object.freeze(unique(errors)), events: Object.freeze([]) })
    : Object.freeze({ status: "confirmed", errors: Object.freeze([]), events: Object.freeze(events) });
}

export function createEmptyRadarWebsearchCache() {
  return freezeDeep({ format: RADAR_WEBSEARCH_FLOW_FORMAT, version: RADAR_WEBSEARCH_FLOW_VERSION, events: [], checks: [] });
}

function validateCachedEvidence(value) {
  if (!exactKeys(value, ["sourceId", "sourceDomain", "url", "retrievedAt"])
      || !isStableContractId(value.sourceId, { allowFixture: false }) || !validInstant(value.retrievedAt)
      || !text(value.sourceDomain).includes(".")) return false;
  let parsed;
  try { parsed = new URL(text(value.url)); } catch { return false; }
  const domain = text(value.sourceDomain).toLowerCase();
  const host = parsed.hostname.toLowerCase();
  return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port
    && (host === domain || host.endsWith(`.${domain}`));
}
function validateCachedEvent(event) {
  const keys = [
    "eventId", "eventVersionId", "sourceTargetKey", "sourceTargetKind", "targetId", "targetType",
    "title", "year", "eventType", "date", "region", "platform", "seasonNumber", "lifecycleStatus",
    "verificationStatus", "evidence", "franchiseEvidence",
  ];
  const basic = exactKeys(event, keys) && isStableContractId(event.eventId, { allowFixture: false })
    && isStableContractId(event.eventVersionId, { allowFixture: false }) && validLabel(event.sourceTargetKey)
    && ["work", "person", "franchise"].includes(event.sourceTargetKind)
    && event.sourceTargetKey.startsWith(`${event.sourceTargetKind}:`)
    && isStableContractId(event.targetId, { allowFixture: false }) && ["work", "series"].includes(event.targetType)
    && (event.sourceTargetKind !== "franchise" || EXTERNAL_WORK_ID.test(event.targetId))
    && validLabel(event.title) && Number.isInteger(event.year) && validYear(event.year)
    && EVENT_TYPES.includes(event.eventType) && validDay(event.date) && eventRegionValid(event.eventType, event.region)
    && typeof event.platform === "string" && (event.seasonNumber === null || Number.isInteger(event.seasonNumber))
    && event.lifecycleStatus === "scheduled" && event.verificationStatus === "confirmed"
    && Array.isArray(event.evidence) && event.evidence.length >= 1 && event.evidence.length <= 2
    && event.evidence.every(validateCachedEvidence)
    && (event.sourceTargetKind === "franchise"
      ? Array.isArray(event.franchiseEvidence) && event.franchiseEvidence.length >= 1
        && event.franchiseEvidence.length <= 2 && event.franchiseEvidence.every(validateCachedEvidence)
      : event.franchiseEvidence === null);
  if (!basic) return false;
  const identity = [event.targetId, event.eventType, event.region, event.platform, event.seasonNumber ?? "-"].join("|");
  const targetBoundIdentity = `${event.sourceTargetKey}|${identity}`;
  const proofIdentity = [
    ...event.evidence.map((entry) => `release:${entry.sourceId}|${entry.url}`),
    ...(event.franchiseEvidence || []).map((entry) => `franchise:${entry.sourceId}|${entry.url}`),
  ].join("|");
  return event.eventId === safeId("radar:event", targetBoundIdentity)
    && event.eventVersionId === safeId("radar:version", `${targetBoundIdentity}|${event.date}|${proofIdentity}`);
}
function validateCachedCheck(check) {
  return exactKeys(check, ["targetKey", "status", "leaseUntil", "fencingToken", "checkedAt", "lastStatus"])
    && validLabel(check.targetKey) && CHECK_STATUSES.includes(check.status)
    && (check.leaseUntil === null || validInstant(check.leaseUntil))
    && (check.fencingToken === null || isStableContractId(check.fencingToken, { allowFixture: true }))
    && (check.checkedAt === null || validInstant(check.checkedAt))
    && (check.lastStatus === null || [...RESPONSE_STATUSES, "provider_error", "timeout"].includes(check.lastStatus));
}

export function validateRadarWebsearchCache(cache) {
  const errors = [];
  if (!exactKeys(cache, ["format", "version", "events", "checks"])) {
    return Object.freeze({ ok: false, errors: Object.freeze(["cache-shape-invalid"]) });
  }
  if (cache.format !== RADAR_WEBSEARCH_FLOW_FORMAT || cache.version !== RADAR_WEBSEARCH_FLOW_VERSION) {
    errors.push("cache-version-invalid");
  }
  if (!Array.isArray(cache.events) || cache.events.length > 1000 || !cache.events.every(validateCachedEvent)) {
    errors.push("cache-events-invalid");
  } else {
    if (new Set(cache.events.map((event) => event.eventId)).size !== cache.events.length) errors.push("cache-event-duplicate");
  }
  if (!Array.isArray(cache.checks) || cache.checks.length > 100 || !cache.checks.every(validateCachedCheck)) {
    errors.push("cache-checks-invalid");
  } else if (new Set(cache.checks.map((check) => check.targetKey)).size !== cache.checks.length) {
    errors.push("cache-check-duplicate");
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(unique(errors)) });
}

export function applyRadarWebsearchEvents(cache, events) {
  if (!validateRadarWebsearchCache(cache).ok || !Array.isArray(events) || !events.every(validateCachedEvent)) {
    return Object.freeze({ ok: false, reason: "cache-or-events-invalid", cache, writes: 0 });
  }
  const next = clone(cache);
  let writes = 0;
  for (const event of events) {
    const index = next.events.findIndex((entry) => entry.eventId === event.eventId);
    if (index >= 0 && next.events[index].eventVersionId === event.eventVersionId) continue;
    if (index >= 0) next.events[index] = clone(event);
    else next.events.push(clone(event));
    writes += 1;
  }
  next.events.sort((a, b) => a.eventId.localeCompare(b.eventId));
  const checked = validateRadarWebsearchCache(next);
  return checked.ok
    ? Object.freeze({ ok: true, reason: writes ? "applied" : "no_change", cache: freezeDeep(next), writes })
    : Object.freeze({ ok: false, reason: "cache-result-invalid", cache, writes: 0, errors: checked.errors });
}

function claimCache(cache, targetKey, { checkedAt, leaseMs, fencingToken }) {
  const existing = cache.checks.find((entry) => entry.targetKey === targetKey);
  if (existing?.status === "checking" && existing.leaseUntil && Date.parse(existing.leaseUntil) > Date.parse(checkedAt)) {
    return Object.freeze({ ok: false, reason: "busy", cache });
  }
  const claim = {
    targetKey, status: "checking",
    leaseUntil: new Date(Date.parse(checkedAt) + leaseMs).toISOString(),
    fencingToken, checkedAt: null, lastStatus: null,
  };
  const next = clone(cache);
  next.checks = existing
    ? next.checks.map((entry) => entry.targetKey === targetKey ? claim : entry)
    : [...next.checks, claim];
  return Object.freeze({ ok: true, reason: "claimed", cache: freezeDeep(next) });
}

function finishCache(cache, targetKey, fencingToken, { checkedAt, status, failed = false }) {
  const existing = cache.checks.find((entry) => entry.targetKey === targetKey);
  if (!existing || existing.status !== "checking" || existing.fencingToken !== fencingToken) {
    return Object.freeze({ ok: false, reason: "fence-mismatch", cache });
  }
  const next = clone(cache);
  next.checks = next.checks.map((entry) => entry.targetKey === targetKey ? {
    targetKey, status: failed ? "failed" : "ready", leaseUntil: null,
    fencingToken: null, checkedAt, lastStatus: status,
  } : entry);
  return Object.freeze({ ok: true, reason: "finished", cache: freezeDeep(next) });
}

export function createRadarWebsearchMemoryStore(initial = createEmptyRadarWebsearchCache()) {
  let cache = validateRadarWebsearchCache(initial).ok ? freezeDeep(clone(initial)) : createEmptyRadarWebsearchCache();
  return Object.freeze({
    async load() { return cache; },
    async save(next) {
      const checked = validateRadarWebsearchCache(next);
      if (!checked.ok) return Object.freeze({ ok: false, reason: "cache-invalid", errors: checked.errors });
      cache = freezeDeep(clone(next));
      return Object.freeze({ ok: true, cache });
    },
  });
}

export function createRadarWebsearchStorageStore({ storage, key = RADAR_WEBSEARCH_CACHE_KEY } = {}) {
  const validStorage = typeof storage?.get === "function" && typeof storage?.set === "function" && text(key).length >= 3;
  return Object.freeze({
    async load() {
      if (!validStorage) return Object.freeze({ invalid: true });
      const row = await storage.get(key);
      const raw = row == null ? null : typeof row === "string" ? row : row.value;
      if (raw == null) return createEmptyRadarWebsearchCache();
      if (typeof raw !== "string" || raw.length > 2 * 1024 * 1024) return Object.freeze({ invalid: true });
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch { return Object.freeze({ invalid: true }); }
      return validateRadarWebsearchCache(parsed).ok ? freezeDeep(parsed) : Object.freeze({ invalid: true });
    },
    async save(next) {
      if (!validStorage) return Object.freeze({ ok: false, reason: "storage-invalid" });
      const checked = validateRadarWebsearchCache(next);
      if (!checked.ok) return Object.freeze({ ok: false, reason: "cache-invalid", errors: checked.errors });
      const serialized = JSON.stringify(next);
      if (serialized.length > 2 * 1024 * 1024) return Object.freeze({ ok: false, reason: "cache-too-large" });
      await storage.set(key, serialized);
      const readback = await storage.get(key);
      const raw = typeof readback === "string" ? readback : readback?.value;
      if (raw !== serialized) return Object.freeze({ ok: false, reason: "write-not-confirmed" });
      return Object.freeze({ ok: true, cache: freezeDeep(clone(next)) });
    },
  });
}

function timeoutPromise(ms) {
  let timeoutId;
  const promise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Radar-Websearch-Zeitgrenze erreicht");
      error.code = "RADAR_WEBSEARCH_TIMEOUT";
      reject(error);
    }, ms);
  });
  return { promise, clear: () => clearTimeout(timeoutId) };
}

function newFencingToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createRadarWebsearchExecutor({
  adapter, store = createRadarWebsearchMemoryStore(), sources = [],
  now = () => new Date().toISOString(), timeoutMs = RADAR_WEBSEARCH_DEFAULT_TIMEOUT_MS,
  leaseMs = RADAR_WEBSEARCH_DEFAULT_LEASE_MS,
} = {}) {
  const inFlight = new Set();
  const validSetup = typeof adapter?.search === "function" && typeof store?.load === "function"
    && typeof store?.save === "function" && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 135_000
    && Number.isInteger(leaseMs) && leaseMs > timeoutMs;

  const loadEvents = async () => {
    const cache = await store.load();
    return validateRadarWebsearchCache(cache).ok ? cache.events : Object.freeze([]);
  };

  const resolvePerson = async ({ name, role } = {}) => {
    if (!validSetup || typeof adapter.resolvePerson !== "function" || !PERSON_ROLES.includes(role)) return null;
    const resolved = await adapter.resolvePerson({ name: text(name), role });
    return validatePersonIdentity(resolved).ok ? freezeDeep(clone(resolved)) : null;
  };

  const resolveFranchise = async ({ name } = {}) => {
    if (!validSetup || typeof adapter.resolveFranchise !== "function") return null;
    const resolved = await adapter.resolveFranchise({ name: text(name) });
    return validateRadarWebsearchTarget(resolved).ok && resolved.kind === "franchise"
      ? freezeDeep(clone(resolved)) : null;
  };

  const check = async ({ target, catalog = [] } = {}) => {
    const targetCheck = validateRadarWebsearchTarget(target);
    const targetKey = createRadarWebsearchTargetKey(target);
    if (!validSetup || !targetCheck.ok || !targetKey) {
      return Object.freeze({ status: "forbidden", writes: 0, events: Object.freeze([]), errors: targetCheck.errors });
    }
    if (inFlight.has(targetKey)) {
      return Object.freeze({ status: "busy", writes: 0, events: await loadEvents(), errors: Object.freeze([]) });
    }
    inFlight.add(targetKey);
    const checkedAtValue = now();
    const window = createRadarWebsearchWindow(checkedAtValue);
    const fencingToken = newFencingToken();
    let cache = null;
    try {
      cache = await store.load();
      if (!window || !validateRadarWebsearchCache(cache).ok) {
        return Object.freeze({ status: "storage_error", writes: 0, events: Object.freeze([]), errors: Object.freeze(["cache-invalid"]) });
      }
      const claimed = claimCache(cache, targetKey, {
        checkedAt: window.checkedAt, leaseMs, fencingToken,
      });
      if (!claimed.ok) {
        return Object.freeze({ status: "busy", writes: 0, events: cache.events, errors: Object.freeze([]) });
      }
      const claimSaved = await store.save(claimed.cache);
      if (!claimSaved?.ok) {
        return Object.freeze({ status: "storage_error", writes: 0, events: cache.events, errors: Object.freeze([]) });
      }
      cache = claimSaved.cache;
      const request = freezeDeep({
        targetKey, target: clone(target), checkedAt: window.checkedAt,
        windowStart: window.windowStart, windowEnd: window.windowEnd,
        regionPolicy: {
          cinema: ["AT", "DE", "CH"],
          streaming: ["GLOBAL", "AT", "DE", "CH"],
        },
        maxResults: RADAR_WEBSEARCH_MAX_RESULTS,
        maxEvents: RADAR_WEBSEARCH_MAX_EVENTS,
      });
      const timer = timeoutPromise(timeoutMs);
      let response;
      try { response = await Promise.race([adapter.search(request), timer.promise]); }
      finally { timer.clear(); }
      const evaluated = evaluateRadarWebsearchResponse(response, { request, target, catalog, sources });
      const applied = evaluated.status === "confirmed"
        ? applyRadarWebsearchEvents(cache, evaluated.events)
        : Object.freeze({ ok: true, cache, writes: 0 });
      if (!applied.ok) throw new Error("Radar-Websearch-Cache konnte nicht aktualisiert werden");
      const status = evaluated.status === "confirmed" && applied.writes === 0 ? "no_change" : evaluated.status;
      const finished = finishCache(applied.cache, targetKey, fencingToken, {
        checkedAt: window.checkedAt, status,
      });
      if (!finished.ok) throw new Error("Radar-Websearch-Fencing ist ungueltig");
      const saved = await store.save(finished.cache);
      if (!saved?.ok) throw new Error("Radar-Websearch-Abschluss konnte nicht gespeichert werden");
      return Object.freeze({
        status, writes: applied.writes, events: saved.cache.events,
        errors: evaluated.errors, adapterCalls: 1,
      });
    } catch (error) {
      const status = error?.code === "RADAR_WEBSEARCH_TIMEOUT" ? "timeout" : "provider_error";
      const finished = cache ? finishCache(cache, targetKey, fencingToken, {
        checkedAt: window?.checkedAt || new Date(checkedAtValue).toISOString(), status, failed: true,
      }) : Object.freeze({ ok: false });
      if (finished.ok) await store.save(finished.cache);
      const current = await store.load().catch(() => null);
      return Object.freeze({ status, writes: 0, events: current?.events || Object.freeze([]), errors: Object.freeze([]), adapterCalls: 1 });
    } finally {
      inFlight.delete(targetKey);
    }
  };

  return Object.freeze({ valid: validSetup, loadEvents, resolvePerson, resolveFranchise, check });
}

export function createRadarWebsearchMockAdapter({ people = [], franchises = [], responses = {} } = {}) {
  const calls = [];
  const personRows = (Array.isArray(people) ? people : []).filter((entry) => validatePersonIdentity(entry).ok);
  const franchiseRows = (Array.isArray(franchises) ? franchises : []).filter((entry) => (
    entry?.kind === "franchise" && validateRadarWebsearchTarget(entry).ok
  ));
  const responseMap = responses instanceof Map ? responses : new Map(Object.entries(responses));
  return Object.freeze({
    calls,
    async resolvePerson({ name, role } = {}) {
      const normalized = normalizedTitle(name);
      const matches = personRows.filter((entry) => normalizedTitle(entry.name) === normalized && entry.role === role);
      return matches.length === 1 ? freezeDeep(clone(matches[0])) : null;
    },
    async resolveFranchise({ name } = {}) {
      const normalized = normalizedTitle(name);
      const matches = franchiseRows.filter((entry) => entry.aliases.some((alias) => normalizedTitle(alias) === normalized));
      return matches.length === 1 ? freezeDeep(clone(matches[0])) : null;
    },
    async search(request) {
      calls.push(freezeDeep(clone(request)));
      const configured = responseMap.get(request.targetKey);
      const response = Array.isArray(configured) ? configured[Math.min(calls.length - 1, configured.length - 1)] : configured;
      if (typeof response === "function") return response(request, calls.length);
      if (!response) throw new Error("Keine Mockantwort fuer dieses Ziel");
      return freezeDeep(clone(response));
    },
  });
}

export function projectVisibleRadarWebsearchEvents({
  events = [], receipts = [], activeWorkTargetIds = [], activeFranchiseIds = [], activePersonKeys = [],
} = {}) {
  const activeTargets = new Set([
    ...activeWorkTargetIds.map((id) => `work:${id}`),
    ...activeFranchiseIds.map((id) => `franchise:${id}`),
    ...activePersonKeys.map((key) => `person:${key}`),
  ]);
  const receiptByVersion = new Map((Array.isArray(receipts) ? receipts : []).map((entry) => [entry.versionId, entry.status]));
  const visible = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!validateCachedEvent(event) || !activeTargets.has(event.sourceTargetKey)) continue;
    const receiptStatus = receiptByVersion.get(event.eventVersionId) || "new";
    if (!["new", "accepted_week"].includes(receiptStatus)) continue;
    visible.push(freezeDeep({ ...clone(event), receiptStatus }));
  }
  visible.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "de-AT"));
  return Object.freeze(visible);
}

export function radarWebsearchResponseFor(request, events, { status = "confirmed", searchResultCount = null } = {}) {
  return freezeDeep({
    status,
    checkedAt: request.checkedAt,
    targetKey: request.targetKey,
    searchResultCount: searchResultCount ?? (Array.isArray(events) ? events.length : 0),
    events: status === "confirmed" ? clone(events || []) : [],
  });
}

export function radarWebsearchWorkRelation(targetId) {
  return Object.freeze({ kind: "work", targetId: text(targetId) });
}

export function radarWebsearchPersonRelation(personExternalId, role) {
  return Object.freeze({ kind: "person", personExternalId: text(personExternalId), role });
}

export function radarWebsearchFranchiseRelation(franchiseId) {
  return Object.freeze({ kind: "franchise", franchiseId: text(franchiseId) });
}

export function radarWebsearchContractFingerprint(value) {
  return fnv1a64(canonicalJson(value));
}
