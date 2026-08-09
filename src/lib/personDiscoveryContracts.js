/* Personen stehen sichtbar im Radar, bleiben intern aber eine getrennte
   Discovery-Domäne. Dieses Modul erzeugt weder Events noch Werk-Abos. */

import { isStableContractId } from "./radarContracts.js";

export const PERSON_DISCOVERY_ROLES = Object.freeze(["actor", "director"]);
export const PERSON_DISCOVERY_SUBSCRIPTION_STATUSES = Object.freeze(["active", "paused", "pending", "rejected"]);
export const PERSON_DISCOVERY_CANDIDATE_STATUSES = Object.freeze(["candidate", "ambiguous", "blocked", "retired"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function result(errors) {
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
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
  if (!text(identity.name) || text(identity.name).length > 160) errors.push("person-name-invalid");
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
