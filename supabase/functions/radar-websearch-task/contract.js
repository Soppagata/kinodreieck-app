/* Pure Radar-Websearch-Verträge für Paket A.
   Dieses Modul kennt weder Supabase noch einen Anbieter. Es validiert nur
   globale Zieldaten, die kleine strukturierte Adapterantwort und bereits
   freigegebene Quellenmetadaten. */

export const RADAR_WEBSEARCH_STATUSES = Object.freeze([
  "confirmed", "insufficient_evidence", "no_change",
]);
export const RADAR_WEBSEARCH_EVENT_TYPES = Object.freeze([
  "kinostart_at", "streamingstart_at", "serienstart", "staffelstart",
]);
export const RADAR_WEBSEARCH_SCOPES = Object.freeze([
  "cinema", "streaming", "series_start", "season_start",
]);
export const RADAR_WEBSEARCH_MAX_RESULTS = 6;

const EVENT_SCOPE = Object.freeze({
  kinostart_at: "cinema",
  streamingstart_at: "streaming",
  serienstart: "series_start",
  staffelstart: "season_start",
});
const TARGET_ID_FORM = /^[a-z][a-z0-9_-]{1,31}:[^\s]{1,150}$/i;
const SOURCE_CLASSES = new Set(["official", "editorial", "aggregator", "unknown"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function exactKeys(value, required, optional = []) {
  if (!plain(value)) return false;
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => actual.includes(key))
    && actual.every((key) => allowed.has(key));
}
function uniqueErrors(errors) { return Object.freeze([...new Set(errors)]); }
function result(errors, value = null) {
  const unique = uniqueErrors(errors);
  return Object.freeze({ ok: unique.length === 0, errors: unique, value });
}
function validInstant(value) {
  return typeof value === "string" && text(value) === value && Number.isFinite(Date.parse(value));
}
function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const millis = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value;
}
function validYear(value) {
  return Number.isInteger(value) && value >= 1888 && value <= new Date().getUTCFullYear() + 10;
}
function validDomain(value) {
  if (typeof value !== "string" || value !== value.toLowerCase() || text(value) !== value
      || value.length < 4 || value.length > 253) return false;
  const labels = value.split(".");
  return labels.length >= 2 && labels.every((label) => (
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  ));
}
function parsedDirectUrl(value) {
  if (typeof value !== "string" || text(value) !== value || value.length > 2048) return null;
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash) return null;
  return parsed;
}
function compareText(a, b) { return text(a).localeCompare(text(b), "de"); }

export function validateRadarWebsearchRequest(value) {
  const required = ["targetId", "canonicalTitle", "mediaType", "region", "scopes"];
  const optional = ["releaseYear", "knownEvidenceUrls"];
  if (!exactKeys(value, required, optional)) return result(["request-shape-invalid"]);
  const errors = [];
  if (!TARGET_ID_FORM.test(text(value.targetId)) || text(value.targetId) !== value.targetId
      || /^(?:fixture|synthetic):/i.test(value.targetId)) {
    errors.push("request-target-invalid");
  }
  if (typeof value.canonicalTitle !== "string" || text(value.canonicalTitle) !== value.canonicalTitle
      || value.canonicalTitle.length < 1 || value.canonicalTitle.length > 200) {
    errors.push("request-title-invalid");
  }
  if (!["film", "series"].includes(value.mediaType)) errors.push("request-media-type-invalid");
  if (value.region !== "AT") errors.push("request-region-invalid");
  if (value.releaseYear !== undefined && !validYear(value.releaseYear)) errors.push("request-year-invalid");
  if (!Array.isArray(value.scopes) || value.scopes.length < 1
      || value.scopes.length > RADAR_WEBSEARCH_SCOPES.length) {
    errors.push("request-scopes-invalid");
  } else {
    const scopes = value.scopes.map(text);
    if (scopes.some((scope) => !RADAR_WEBSEARCH_SCOPES.includes(scope))
        || new Set(scopes).size !== scopes.length) errors.push("request-scopes-invalid");
    if (value.mediaType === "film" && scopes.some((scope) => ["series_start", "season_start"].includes(scope))) {
      errors.push("request-film-scope-invalid");
    }
  }
  const knownUrls = value.knownEvidenceUrls ?? [];
  if (!Array.isArray(knownUrls) || knownUrls.length > 24
      || knownUrls.some((url) => !parsedDirectUrl(url))
      || new Set(knownUrls).size !== knownUrls.length) errors.push("request-known-evidence-invalid");
  if (errors.length) return result(errors);
  return result([], freezeDeep({
    targetId: value.targetId,
    canonicalTitle: value.canonicalTitle,
    ...(value.releaseYear === undefined ? {} : { releaseYear: value.releaseYear }),
    mediaType: value.mediaType,
    region: "AT",
    scopes: [...value.scopes],
    ...(value.knownEvidenceUrls === undefined ? {} : { knownEvidenceUrls: [...value.knownEvidenceUrls] }),
  }));
}

function validateTargetEcho(target, request, errors) {
  const required = ["targetId", "canonicalTitle", "mediaType", "region"];
  const optional = ["releaseYear"];
  if (!exactKeys(target, required, optional)) {
    errors.push("response-target-shape-invalid");
    return;
  }
  if (target.targetId !== request.targetId) errors.push("response-target-id-mismatch");
  if (target.canonicalTitle !== request.canonicalTitle) errors.push("response-target-title-mismatch");
  if (target.mediaType !== request.mediaType) errors.push("response-target-type-mismatch");
  if (target.region !== "AT") errors.push("response-target-region-mismatch");
  if (request.releaseYear !== undefined && target.releaseYear !== request.releaseYear) {
    errors.push("response-target-year-mismatch");
  }
  if (request.releaseYear === undefined && target.releaseYear !== undefined) {
    errors.push("response-target-year-unexpected");
  }
  if (target.releaseYear !== undefined && !validYear(target.releaseYear)) errors.push("response-target-year-invalid");
}

function validateEvidenceShape(evidence, errors) {
  const required = ["url", "sourceDomain", "sourceTitle", "claim"];
  const optional = ["publishedAt"];
  if (!exactKeys(evidence, required, optional)) {
    errors.push("response-evidence-shape-invalid");
    return null;
  }
  const parsed = parsedDirectUrl(evidence.url);
  if (!parsed) errors.push("response-evidence-url-invalid");
  if (!validDomain(evidence.sourceDomain)) errors.push("response-evidence-domain-invalid");
  if (parsed && parsed.hostname.toLowerCase() !== evidence.sourceDomain) {
    errors.push("response-evidence-domain-mismatch");
  }
  if (typeof evidence.sourceTitle !== "string" || text(evidence.sourceTitle) !== evidence.sourceTitle
      || evidence.sourceTitle.length < 1 || evidence.sourceTitle.length > 240) {
    errors.push("response-evidence-title-invalid");
  }
  if (typeof evidence.claim !== "string" || text(evidence.claim) !== evidence.claim
      || evidence.claim.length < 1 || evidence.claim.length > 500) {
    errors.push("response-evidence-claim-invalid");
  }
  if (evidence.publishedAt !== undefined && !validDay(evidence.publishedAt)) {
    errors.push("response-evidence-published-at-invalid");
  }
  return parsed;
}

function validateEventShape(event, request, errors) {
  const required = ["eventType", "eventDate", "evidence"];
  const optional = ["platform", "seasonNumber"];
  if (!exactKeys(event, required, optional)) {
    errors.push("response-event-shape-invalid");
    return;
  }
  if (!RADAR_WEBSEARCH_EVENT_TYPES.includes(event.eventType)) errors.push("response-event-type-invalid");
  if (!validDay(event.eventDate)) errors.push("response-event-date-invalid");
  const neededScope = EVENT_SCOPE[event.eventType];
  if (neededScope && !request.scopes.includes(neededScope)) errors.push("response-event-scope-invalid");
  if (event.eventType === "streamingstart_at") {
    if (typeof event.platform !== "string" || text(event.platform) !== event.platform
        || !event.platform || event.platform === "-" || event.platform.length > 80) {
      errors.push("response-event-platform-invalid");
    }
  } else if (event.platform !== undefined) {
    errors.push("response-event-platform-forbidden");
  }
  if (event.eventType === "staffelstart") {
    if (!Number.isInteger(event.seasonNumber) || event.seasonNumber < 1 || event.seasonNumber > 999) {
      errors.push("response-event-season-invalid");
    }
  } else if (event.seasonNumber !== undefined) {
    errors.push("response-event-season-forbidden");
  }
  if (!Array.isArray(event.evidence) || event.evidence.length < 1
      || event.evidence.length > RADAR_WEBSEARCH_MAX_RESULTS) {
    errors.push("response-event-evidence-invalid");
  } else {
    for (const evidence of event.evidence) validateEvidenceShape(evidence, errors);
  }
}

function sourceForEvidence(evidence, sourceRegistry) {
  const candidates = sourceRegistry.filter((source) => (
    evidence.sourceDomain === source.domain
      || (source.subdomainsAllowed === true && evidence.sourceDomain.endsWith(`.${source.domain}`))
  ));
  return candidates.length === 1 ? candidates[0] : null;
}

function validSourceRow(source) {
  return plain(source)
    && typeof source.sourceId === "string" && text(source.sourceId) === source.sourceId
    && source.sourceId.length >= 3 && source.sourceId.length <= 128
    && validDomain(source.domain)
    && typeof source.publisherFamily === "string" && !!text(source.publisherFamily)
    && SOURCE_CLASSES.has(source.sourceClass)
    && typeof source.subdomainsAllowed === "boolean"
    && typeof source.active === "boolean"
    && typeof source.attributionApproved === "boolean"
    && typeof source.rightsStatus === "string";
}

function selectEvidence(event, sourceRegistry, checkedAt, errors) {
  const resolved = [];
  const seenUrls = new Set();
  for (const evidence of event.evidence) {
    if (seenUrls.has(evidence.url)) {
      errors.push("response-evidence-url-duplicate");
      continue;
    }
    seenUrls.add(evidence.url);
    const source = sourceForEvidence(evidence, sourceRegistry);
    if (!source || source.active !== true || source.rightsStatus !== "approved"
        || source.attributionApproved !== true || !["official", "editorial"].includes(source.sourceClass)) {
      errors.push("response-evidence-source-unavailable");
      continue;
    }
    resolved.push({ evidence, source });
  }
  const official = resolved.filter(({ source }) => source.sourceClass === "official")
    .sort((a, b) => compareText(a.evidence.url, b.evidence.url));
  const selected = [];
  if (official.length) selected.push(official[0]);
  else {
    const familyWinner = new Map();
    for (const item of resolved.sort((a, b) => (
      compareText(a.source.publisherFamily, b.source.publisherFamily)
      || compareText(a.evidence.url, b.evidence.url)
    ))) {
      if (!familyWinner.has(item.source.publisherFamily)) familyWinner.set(item.source.publisherFamily, item);
    }
    selected.push(...[...familyWinner.values()].slice(0, 2));
    if (selected.length < 2) errors.push("response-evidence-independent-sources-insufficient");
  }
  return selected.map(({ evidence, source }) => Object.freeze({
    sourceId: source.sourceId,
    sourceDomain: evidence.sourceDomain,
    url: evidence.url,
    sourceTitle: evidence.sourceTitle,
    claim: evidence.claim,
    ...(evidence.publishedAt === undefined ? {} : { publishedAt: evidence.publishedAt }),
    retrievedAt: checkedAt,
    publisherFamily: source.publisherFamily,
    sourceClass: source.sourceClass,
  }));
}

function eventIdentity(event) {
  return [event.eventType, event.platform || "-", event.seasonNumber || "-"].join("|");
}

/* Eine wohlgeformte, aber fachlich schwache Antwort wird bewusst zu
   insufficient_evidence heruntergestuft. Nur strukturell kaputte Antworten
   sind invalid-response. */
export function evaluateRadarWebsearchResponse(envelope, requestInput, sourceRegistryInput = []) {
  const requestCheck = validateRadarWebsearchRequest(requestInput);
  if (!requestCheck.ok) return Object.freeze({ status: "invalid_response", events: Object.freeze([]), errors: requestCheck.errors });
  const request = requestCheck.value;
  if (!exactKeys(envelope, ["searchResultCount", "response"])) {
    return Object.freeze({ status: "invalid_response", events: Object.freeze([]), errors: Object.freeze(["adapter-envelope-invalid"]) });
  }
  if (!Number.isInteger(envelope.searchResultCount) || envelope.searchResultCount < 0
      || envelope.searchResultCount > RADAR_WEBSEARCH_MAX_RESULTS) {
    return Object.freeze({ status: "invalid_response", events: Object.freeze([]), errors: Object.freeze(["adapter-result-count-invalid"]) });
  }
  const response = envelope.response;
  if (!exactKeys(response, ["status", "checkedAt", "target", "events"])) {
    return Object.freeze({ status: "invalid_response", events: Object.freeze([]), errors: Object.freeze(["response-shape-invalid"]) });
  }
  const shapeErrors = [];
  if (!RADAR_WEBSEARCH_STATUSES.includes(response.status)) shapeErrors.push("response-status-invalid");
  if (!validInstant(response.checkedAt)) shapeErrors.push("response-checked-at-invalid");
  if (!Array.isArray(response.events)) shapeErrors.push("response-events-invalid");
  validateTargetEcho(response.target, request, shapeErrors);
  if (Array.isArray(response.events)) {
    for (const event of response.events) validateEventShape(event, request, shapeErrors);
  }
  if (shapeErrors.some((error) => error.includes("shape-invalid") || error.endsWith("-invalid"))) {
    return Object.freeze({ status: "invalid_response", events: Object.freeze([]), errors: uniqueErrors(shapeErrors) });
  }
  if (response.status !== "confirmed") {
    const errors = [...shapeErrors];
    if (response.events.length !== 0) errors.push("response-nonconfirmed-events-forbidden");
    return Object.freeze({
      status: errors.length ? "insufficient_evidence" : response.status,
      checkedAt: response.checkedAt,
      events: Object.freeze([]),
      errors: uniqueErrors(errors),
    });
  }
  const evidenceCount = new Set(response.events.flatMap((event) => (
    Array.isArray(event.evidence) ? event.evidence.map((entry) => entry.url) : []
  ))).size;
  const errors = [...shapeErrors];
  if (!response.events.length) errors.push("response-confirmed-events-required");
  if (evidenceCount > envelope.searchResultCount) errors.push("response-evidence-count-exceeds-results");
  const registry = Array.isArray(sourceRegistryInput) ? sourceRegistryInput : [];
  if (registry.some((source) => !validSourceRow(source))) errors.push("source-registry-invalid");
  const grouped = new Map();
  for (const event of response.events) {
    const key = eventIdentity(event);
    const previous = grouped.get(key);
    if (previous && previous.eventDate !== event.eventDate) {
      errors.push("response-event-date-conflict");
      continue;
    }
    if (previous) previous.evidence.push(...event.evidence);
    else grouped.set(key, clone(event));
  }
  const normalizedEvents = [];
  for (const event of grouped.values()) {
    const evidence = selectEvidence(event, registry, response.checkedAt, errors);
    normalizedEvents.push(Object.freeze({
      targetKey: request.targetId,
      eventType: event.eventType,
      date: event.eventDate,
      region: "AT",
      platform: event.platform || "-",
      seasonNumber: event.seasonNumber ?? null,
      evidence: Object.freeze(evidence),
    }));
  }
  if (errors.length) {
    return Object.freeze({
      status: "insufficient_evidence",
      checkedAt: response.checkedAt,
      events: Object.freeze([]),
      errors: uniqueErrors(errors),
    });
  }
  normalizedEvents.sort((a, b) => (
    compareText(a.eventType, b.eventType)
    || compareText(a.platform, b.platform)
    || (a.seasonNumber || 0) - (b.seasonNumber || 0)
    || compareText(a.date, b.date)
  ));
  return Object.freeze({
    status: "confirmed",
    checkedAt: response.checkedAt,
    events: freezeDeep(normalizedEvents),
    errors: Object.freeze([]),
  });
}
