/* Personen stehen sichtbar im Radar, bleiben intern aber eine getrennte
   Discovery-Domäne. Dieses Modul erzeugt weder Events noch Werk-Abos. */

import { isStableContractId } from "./radarContracts.js";

export const PERSON_DISCOVERY_ROLES = Object.freeze(["actor", "director"]);
export const PERSON_DISCOVERY_SUBSCRIPTION_STATUSES = Object.freeze(["active", "paused", "pending", "rejected"]);
export const PERSON_DISCOVERY_CANDIDATE_STATUSES = Object.freeze(["candidate", "ambiguous", "blocked", "retired"]);
export const PERSON_DISCOVERY_MATCH_STATUSES = Object.freeze(["matched", "no_match", "ambiguous"]);
export const PERSON_DISCOVERY_CHECK_STATUSES = Object.freeze(["confirmed", "insufficient_evidence", "no_change"]);
export const PERSON_DISCOVERY_MAX_CANDIDATES = 6;
export const PERSON_DISCOVERY_EVENT_TYPES = Object.freeze([
  "kinostart_at", "streamingstart_at", "serienstart", "staffelstart",
]);

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed) {
  return plain(value) && Object.keys(value).every((key) => allowed.includes(key));
}
function result(errors) {
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function normalizedTitle(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function usefulTitle(value) {
  const normalized = normalizedTitle(value);
  return normalized.length >= 10 || (normalized.length >= 6 && normalized.split(" ").length >= 2);
}

function validYear(value) {
  return Number.isInteger(value) && value >= 1888 && value <= new Date().getUTCFullYear() + 10;
}

function validDay(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const millis = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === normalized;
}

function dayNumber(value) {
  return validDay(value) ? Math.floor(Date.parse(`${value}T00:00:00.000Z`) / 86400000) : null;
}

function validInstant(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text(value))
    && Number.isFinite(Date.parse(value));
}

function validDomain(value) {
  const domain = text(value);
  return domain === value && domain === domain.toLowerCase() && domain.length <= 253
    && domain.split(".").length >= 2
    && domain.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function validEvidenceUrl(value, sourceDomain) {
  if (typeof value !== "string" || text(value) !== value || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port && !parsed.hash
      && (host === sourceDomain || host.endsWith(`.${sourceDomain}`));
  } catch { return false; }
}

function validatePersonCandidate(candidate, { role, windowStart, windowEnd, checkedAt }) {
  const errors = [];
  const keys = [
    "targetId", "targetType", "title", "year", "role", "eventType", "date",
    "region", "platform", "evidence",
  ];
  if (!exactKeys(candidate, keys) || keys.some((key) => !(key in candidate))) {
    return ["person-candidate-shape-invalid"];
  }
  const matchInput = {
    targetId: candidate.targetId,
    targetType: candidate.targetType,
    title: candidate.title,
    year: candidate.year,
  };
  if (matchPersonWorkCandidate(matchInput, [matchInput]).status !== "matched") {
    errors.push("person-candidate-work-invalid");
  }
  if (candidate.role !== role) errors.push("person-candidate-role-mismatch");
  if (!PERSON_DISCOVERY_EVENT_TYPES.includes(candidate.eventType)) errors.push("person-candidate-event-type-invalid");
  if (!validDay(candidate.date) || candidate.date < windowStart || candidate.date > windowEnd) {
    errors.push("person-candidate-date-invalid");
  }
  if (candidate.region !== "AT") errors.push("person-candidate-region-invalid");
  if (candidate.eventType === "streamingstart_at") {
    if (!text(candidate.platform) || text(candidate.platform) !== candidate.platform || candidate.platform === "-"
        || candidate.platform.length > 80) errors.push("person-candidate-platform-invalid");
  } else if (candidate.platform !== "-") errors.push("person-candidate-platform-invalid");
  if (candidate.targetType === "work" && ["serienstart", "staffelstart"].includes(candidate.eventType)) {
    errors.push("person-candidate-type-conflict");
  }
  if (candidate.targetType === "series" && candidate.eventType === "kinostart_at") {
    errors.push("person-candidate-type-conflict");
  }
  if (!Array.isArray(candidate.evidence) || candidate.evidence.length < 1 || candidate.evidence.length > 2) {
    errors.push("person-candidate-evidence-invalid");
  } else {
    const sourceIds = new Set();
    const sourceDomains = new Set();
    const urls = new Set();
    for (const evidence of candidate.evidence) {
      if (!exactKeys(evidence, ["sourceId", "sourceDomain", "url", "retrievedAt"])
          || !["sourceId", "sourceDomain", "url", "retrievedAt"].every((key) => key in evidence)) {
        errors.push("person-candidate-evidence-shape-invalid");
        continue;
      }
      if (!isStableContractId(evidence.sourceId)) errors.push("person-candidate-evidence-source-invalid");
      if (!validDomain(evidence.sourceDomain)) errors.push("person-candidate-evidence-domain-invalid");
      if (!validEvidenceUrl(evidence.url, evidence.sourceDomain)) errors.push("person-candidate-evidence-url-invalid");
      if (!validInstant(evidence.retrievedAt) || Date.parse(evidence.retrievedAt) > Date.parse(checkedAt)) {
        errors.push("person-candidate-evidence-time-invalid");
      }
      if (sourceIds.has(evidence.sourceId) || sourceDomains.has(evidence.sourceDomain)
          || urls.has(evidence.url)) errors.push("person-candidate-evidence-duplicate");
      sourceIds.add(evidence.sourceId); sourceDomains.add(evidence.sourceDomain); urls.add(evidence.url);
    }
  }
  return errors;
}

function publicLabel(value) {
  const normalized = text(value);
  return !!normalized && !/^(?:work|watchmode|fixture|catalog|tmdb|imdb|wikidata):/i.test(normalized);
}

function normalizedCatalogWork(entry) {
  if (!plain(entry) || !isStableContractId(entry.targetId)
      || !["work", "series"].includes(entry.targetType) || !publicLabel(entry.title)
      || text(entry.title).length > 240 || !validYear(entry.year)) return null;
  return Object.freeze({
    targetId: text(entry.targetId),
    targetType: entry.targetType,
    title: text(entry.title),
    year: entry.year,
  });
}

export function createPersonIdentityKey({ personExternalId, role } = {}) {
  const id = text(personExternalId);
  const normalizedRole = text(role);
  if (!isStableContractId(id) || !PERSON_DISCOVERY_ROLES.includes(normalizedRole)) return null;
  return `${encodeURIComponent(id)}|${normalizedRole}`;
}

export function validatePersonIdentity(identity, { mode = "production" } = {}) {
  const errors = [];
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    return result(["person-identity-invalid"]);
  }
  if (!isStableContractId(identity.personExternalId)) errors.push("person-external-id-invalid");
  if (!PERSON_DISCOVERY_ROLES.includes(identity.role)) errors.push("person-role-invalid");
  if (!publicLabel(identity.name) || text(identity.name).length > 160
      || text(identity.name) === text(identity.personExternalId)) errors.push("person-name-invalid");
  if (identity.canonical !== true) errors.push("person-not-canonical");
  if (mode === "production" && text(identity.personExternalId).startsWith("fixture:")) {
    errors.push("fixture-person-forbidden");
  }
  return result(errors);
}

export function createPersonRadarDraft(identity, { mode = "production" } = {}) {
  const checked = validatePersonIdentity(identity, { mode });
  if (!checked.ok) {
    return Object.freeze({ ok: false, reason: "person-unresolved", errors: checked.errors, action: null });
  }
  return Object.freeze({
    ok: true,
    action: Object.freeze({
      intent: "radar",
      kind: "person_discovery",
      personExternalId: text(identity.personExternalId),
      role: identity.role,
      requiresConfirmation: true,
      shareEnabled: false,
      createsEvent: false,
      createsEventVersion: false,
      createsCheck: false,
      createsWorkSubscription: false,
      createsTasteSignal: false,
    }),
  });
}

export function validateDiscoveryCandidate(candidate, { mode = "production" } = {}) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return result(["discovery-candidate-invalid"]);
  }
  const allowFixture = mode === "fixture";
  if (!isStableContractId(candidate.candidateId, { allowFixture })) errors.push("candidate-id-invalid");
  const personCheck = validatePersonIdentity(candidate.person || {}, { mode });
  if (!personCheck.ok || !createPersonIdentityKey(candidate.person || {})) errors.push("candidate-person-invalid");
  if (!isStableContractId(candidate.workTargetId, { allowFixture })) errors.push("candidate-work-id-invalid");
  if (!["work", "series"].includes(candidate.workTargetType)) errors.push("candidate-work-type-invalid");
  if (!PERSON_DISCOVERY_CANDIDATE_STATUSES.includes(candidate.status)) errors.push("candidate-status-invalid");
  if (!text(candidate.sourceMode) || !["fixture", "structured"].includes(candidate.sourceMode)) {
    errors.push("candidate-source-mode-invalid");
  }
  if (mode === "production" && candidate.sourceMode === "fixture") errors.push("fixture-candidate-forbidden");
  if (candidate.active !== false) errors.push("candidate-must-be-inactive");
  if (candidate.costBearing !== false) errors.push("candidate-must-be-cost-neutral");
  if (candidate.createsCheck !== false) errors.push("candidate-must-not-create-check");
  return result(errors);
}

/* Auch nach einem Klick entsteht zunächst nur ein neuer Radar-Vorschauintent.
   Erst dessen getrennte Serverbestätigung darf später ein Werk-Abo anlegen. */
export function createCandidateRadarDraft(candidate, { mode = "production" } = {}) {
  const checked = validateDiscoveryCandidate(candidate, { mode });
  if (!checked.ok || candidate.status !== "candidate") {
    return Object.freeze({ ok: false, reason: "candidate-not-actionable", errors: checked.errors, action: null });
  }
  return Object.freeze({
    ok: true,
    action: Object.freeze({
      intent: "radar",
      kind: "event_target_preview",
      targetId: candidate.workTargetId,
      targetType: candidate.workTargetType,
      sourceCandidateId: candidate.candidateId,
      requiresConfirmation: true,
      subscriptionCreated: false,
      eventCreated: false,
      checkCreated: false,
      shareEnabled: false,
    }),
  });
}

/* Eine gemeinsame starke Werk-ID gewinnt. Ohne gemeinsame ID darf Titel+Jahr
   höchstens Mehrdeutigkeit belegen, aber niemals automatisch matchen. */
export function matchPersonWorkCandidate(candidate, catalog = []) {
  if (!plain(candidate) || !exactKeys(candidate, ["targetId", "targetType", "title", "year"])
      || !publicLabel(candidate.title) || text(candidate.title).length > 240 || !validYear(candidate.year)
      || (candidate.targetId != null && !isStableContractId(candidate.targetId))
      || (candidate.targetType != null && !["work", "series"].includes(candidate.targetType))) {
    return Object.freeze({ status: "no_match", work: null });
  }
  const works = (Array.isArray(catalog) ? catalog : []).map(normalizedCatalogWork).filter(Boolean);
  const candidateId = text(candidate.targetId);
  if (candidateId) {
    const strong = works.filter((entry) => entry.targetId === candidateId);
    if (strong.length !== 1) {
      return Object.freeze({ status: strong.length > 1 ? "ambiguous" : "no_match", work: null });
    }
    const [work] = strong;
    const contradicts = (candidate.targetType && candidate.targetType !== work.targetType)
      || normalizedTitle(candidate.title) !== normalizedTitle(work.title)
      || candidate.year !== work.year;
    return contradicts
      ? Object.freeze({ status: "ambiguous", work: null })
      : Object.freeze({ status: "matched", work });
  }
  if (!usefulTitle(candidate.title)) return Object.freeze({ status: "no_match", work: null });
  const title = normalizedTitle(candidate.title);
  const fallback = works.filter((entry) => normalizedTitle(entry.title) === title && entry.year === candidate.year);
  return Object.freeze({ status: fallback.length ? "ambiguous" : "no_match", work: null });
}

/* Dies ist der kleine lokale Adaptervertrag, nicht die Payload eines fremden
   Providers. Er lässt nur kanonische Personen und höchstens sechs belegbare
   Werkkandidaten durch; ein Treffer erzeugt ausdrücklich kein Werk-Abo. */
export function validatePersonRadarCheckResult(value, { identity, catalog = [], mode = "production" } = {}) {
  const errors = [];
  if (!plain(value) || !exactKeys(value, ["status", "checkedAt", "windowStart", "windowEnd", "person", "candidates"])
      || !["status", "checkedAt", "windowStart", "windowEnd", "person", "candidates"].every((key) => key in value)) {
    return Object.freeze({ ok: false, errors: Object.freeze(["person-check-shape-invalid"]), result: null });
  }
  if (!PERSON_DISCOVERY_CHECK_STATUSES.includes(value.status)) errors.push("person-check-status-invalid");
  if (!validInstant(value.checkedAt)) errors.push("person-check-time-invalid");
  const startNumber = dayNumber(value.windowStart);
  const endNumber = dayNumber(value.windowEnd);
  if (startNumber == null || endNumber == null || endNumber - startNumber !== 6) {
    errors.push("person-check-window-invalid");
  }
  const personCheck = validatePersonIdentity(value.person, { mode });
  if (!personCheck.ok) errors.push("person-check-identity-invalid");
  const expectedKey = createPersonIdentityKey(identity);
  if (!expectedKey || createPersonIdentityKey(value.person) !== expectedKey
      || text(value.person?.name) !== text(identity?.name)) errors.push("person-check-identity-mismatch");
  if (!Array.isArray(value.candidates) || value.candidates.length > PERSON_DISCOVERY_MAX_CANDIDATES) {
    errors.push("person-check-candidates-invalid");
  } else {
    for (const candidate of value.candidates) errors.push(...validatePersonCandidate(candidate, {
      role: identity?.role,
      windowStart: value.windowStart,
      windowEnd: value.windowEnd,
      checkedAt: value.checkedAt,
    }));
  }
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze([...new Set(errors)]), result: null });

  const decisions = value.candidates.map((candidate) => {
    const decision = matchPersonWorkCandidate({
      targetId: candidate.targetId,
      targetType: candidate.targetType,
      title: candidate.title,
      year: candidate.year,
    }, catalog);
    return Object.freeze({
      status: decision.status,
      title: text(candidate.title),
      year: candidate.year,
      work: decision.work,
      eventType: candidate.eventType,
      date: candidate.date,
      region: "AT",
      platform: candidate.platform,
      evidence: Object.freeze(candidate.evidence.map((entry) => Object.freeze({ ...entry }))),
    });
  });
  const matched = decisions.filter((entry) => entry.status === "matched");
  if (value.status === "confirmed" && matched.length === 0) errors.push("person-check-confirmed-without-match");
  if (value.status !== "confirmed" && matched.length > 0) errors.push("person-check-unreported-match");
  if (value.status === "no_change" && value.candidates.length > 0) errors.push("person-check-no-change-candidates-forbidden");
  if (errors.length) return Object.freeze({ ok: false, errors: Object.freeze(errors), result: null });
  return Object.freeze({
    ok: true,
    errors: Object.freeze([]),
    result: Object.freeze({
      status: value.status,
      checkedAt: new Date(value.checkedAt).toISOString(),
      windowStart: value.windowStart,
      windowEnd: value.windowEnd,
      person: Object.freeze({
        personExternalId: text(value.person.personExternalId),
        name: text(value.person.name),
        role: value.person.role,
        canonical: true,
      }),
      decisions: Object.freeze(decisions),
      createsWorkSubscription: false,
      createsEvent: false,
    }),
  });
}

export function personDiscoveryFallback({ enabled = false, identityResolved = false, sourceAvailable = false, existing = false } = {}) {
  if (!enabled || !identityResolved) {
    return Object.freeze({ visible: false, writable: false, message: "Personen-Radar noch nicht verfügbar", candidates: Object.freeze([]) });
  }
  if (!sourceAvailable) {
    return Object.freeze({
      visible: existing,
      writable: false,
      message: existing ? "Noch keine bestätigten Projekte" : "Personen-Radar noch nicht verfügbar",
      candidates: Object.freeze([]),
    });
  }
  return Object.freeze({ visible: true, writable: true, message: "", candidates: Object.freeze([]) });
}
