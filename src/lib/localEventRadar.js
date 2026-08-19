/* Lokaler Event-Radar-Kern (Phase 2).
   ---------------------------------------------------------------
   - kein Netzwerk, kein Provider, kein Scheduler
   - keine Personen-Automatik
   - globale Eventwahrheit bleibt vom persönlichen kd:radar-Topf getrennt
   - im Kontomodus ist nur ein serverbestätigter Snapshot wirksam
   - Wochenprojektion ist read-only und schreibt nie in den Kalender */

import { K, store } from "./storage.js";
import {
  RADAR_DEFAULT_REGION,
  RADAR_EVENT_TYPES,
  RADAR_LIFECYCLE_STATUSES,
  RADAR_NORMAL_ACTIVE_LIMIT,
  RADAR_RECEIPT_STATUSES,
  RADAR_SCOPES,
  RADAR_TARGET_TYPES,
  RADAR_VERIFICATION_STATUSES,
  createRadarEventIdentity,
  isRadarEventIdentity,
  isStableContractId,
  validateRadarTarget,
} from "./radarContracts.js";
import {
  validateRadarPilotEvent,
  validateRadarPilotFeed,
  validateRadarPilotImportPayload,
  validateRadarPilotImportResult,
  validateRadarPilotSubscriptionAck,
} from "./radarPilotContracts.js";
import {
  PERSON_DISCOVERY_CHECK_STATUSES,
  PERSON_DISCOVERY_MATCH_STATUSES,
  createPersonIdentityKey,
  validatePersonIdentity,
  validatePersonRadarCheckResult,
} from "./personDiscoveryContracts.js";
import { createPersonRadarTargetId } from "./personRadarCatalog.js";

export const LOCAL_RADAR_FORMAT = "kinodreieck-radar-local";
export const LOCAL_RADAR_VERSION = 2;
export const LOCAL_RADAR_AUTHORITIES = Object.freeze(["guest", "account-cache"]);
export const LOCAL_RADAR_OUTBOX_ACTIONS = Object.freeze(["upsert", "pause", "remove"]);
export const LOCAL_RADAR_OUTBOX_STATUSES = Object.freeze(["pending", "rejected"]);
export const LOCAL_RADAR_SHARE_STATUSES = Object.freeze(["active", "revoked"]);
export const LOCAL_RADAR_MAX_OUTBOX = 100;
export const LOCAL_RADAR_MAX_SHARES = 1000;
export const LOCAL_RADAR_MAX_RECEIPTS = 1000;
export const LOCAL_RADAR_MAX_BYTES = 1024 * 1024;

export const LOCAL_EVENT_LEDGER_FORMAT = "kinodreieck-radar-ledger";
export const LOCAL_EVENT_LEDGER_VERSION = 1;

const CHECKSUM_FORM = /^[a-f0-9]{64}$/;
const ISO_INSTANT_FORM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const UUID_FORM = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function result(errors) { return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) }); }
function byteLength(value) { return new TextEncoder().encode(value).byteLength; }
function validPublicLabel(value, max = 240) {
  const normalized = text(value);
  return !!normalized && normalized.length <= max
    && !/^(?:work|watchmode|fixture|catalog|tmdb|imdb|wikidata):/i.test(normalized);
}
function validInstant(value) {
  const normalized = text(value);
  return ISO_INSTANT_FORM.test(normalized) && Number.isFinite(Date.parse(normalized));
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
function normalizedInstant(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : value;
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
function exactKeys(value, allowed) {
  return plain(value) && Object.keys(value).every((key) => allowed.includes(key));
}
function exactPilotKeys(value, allowed) {
  return plain(value) && Object.keys(value).length === allowed.length
    && Object.keys(value).every((key) => allowed.includes(key));
}
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
function validOperationId(value) {
  const normalized = text(value);
  return UUID_FORM.test(normalized) || (normalized.startsWith("fixture:") && isStableContractId(normalized));
}

export function createEmptyLocalRadar({ authority = "guest" } = {}) {
  const safeAuthority = LOCAL_RADAR_AUTHORITIES.includes(authority) ? authority : "guest";
  return freezeDeep({
    format: LOCAL_RADAR_FORMAT,
    version: LOCAL_RADAR_VERSION,
    authority: safeAuthority,
    subscriptions: [],
    outbox: [],
    personSubscriptions: [],
    personResults: [],
    shares: [],
    shareOutbox: [],
    receipts: [],
    display: { showDismissed: false },
    server: { revision: 0, checksum: null, reconciledAt: null },
  });
}

export function createEmptyAccountRadarPilot() {
  return freezeDeep({
    status: "idle",
    events: [],
    serverReceipts: [],
    receiptOutbox: [],
    importOutbox: [],
    radarReview: false,
  });
}

function validatePilotReceiptOutbox(entry) {
  const keys = ["eventId", "eventVersionId", "status", "state", "createdAt", "reason"];
  if (!exactPilotKeys(entry, keys)) return ["pilot-receipt-outbox-shape-invalid"];
  const errors = [];
  if (!UUID_FORM.test(text(entry.eventId))) errors.push("pilot-receipt-event-invalid");
  if (!UUID_FORM.test(text(entry.eventVersionId))) errors.push("pilot-receipt-version-invalid");
  if (!RADAR_RECEIPT_STATUSES.includes(entry.status)) errors.push("pilot-receipt-status-invalid");
  if (!["pending", "rejected"].includes(entry.state)) errors.push("pilot-receipt-state-invalid");
  if (!validInstant(entry.createdAt)) errors.push("pilot-receipt-time-invalid");
  if (entry.reason !== null && (!text(entry.reason) || text(entry.reason).length > 120)) {
    errors.push("pilot-receipt-reason-invalid");
  }
  return errors;
}

function validatePilotImportOutbox(entry) {
  const keys = ["operationId", "payload", "status", "createdAt", "reason"];
  if (!exactPilotKeys(entry, keys)) return ["pilot-import-outbox-shape-invalid"];
  const errors = [];
  if (!UUID_FORM.test(text(entry.operationId))) errors.push("pilot-import-operation-invalid");
  errors.push(...validateRadarPilotImportPayload(entry.payload).errors);
  if (!["pending", "rejected"].includes(entry.status)) errors.push("pilot-import-status-invalid");
  if (!validInstant(entry.createdAt)) errors.push("pilot-import-time-invalid");
  if (entry.reason !== null && (!text(entry.reason) || text(entry.reason).length > 120)) {
    errors.push("pilot-import-reason-invalid");
  }
  return errors;
}

function validateAccountRadarPilot(pilot) {
  const errors = [];
  const keys = ["status", "events", "serverReceipts", "receiptOutbox", "importOutbox", "radarReview"];
  if (!exactPilotKeys(pilot, keys)) return result(["pilot-state-shape-invalid"]);
  if (!["idle", "ready", "pilot-unavailable"].includes(pilot.status)) errors.push("pilot-status-invalid");
  if (typeof pilot.radarReview !== "boolean") errors.push("pilot-review-invalid");
  if (!Array.isArray(pilot.events)) errors.push("pilot-events-invalid");
  else for (const event of pilot.events) errors.push(...validateRadarPilotEvent(event).errors);
  if (!Array.isArray(pilot.serverReceipts)) errors.push("pilot-server-receipts-invalid");
  else {
    for (const receipt of pilot.serverReceipts) {
      if (!exactPilotKeys(receipt, ["eventVersionId", "status", "updatedAt"])
          || !UUID_FORM.test(text(receipt.eventVersionId))
          || !RADAR_RECEIPT_STATUSES.includes(receipt.status)
          || !validInstant(receipt.updatedAt)) errors.push("pilot-server-receipt-invalid");
    }
  }
  if (!Array.isArray(pilot.receiptOutbox)) errors.push("pilot-receipt-outbox-invalid");
  else for (const entry of pilot.receiptOutbox) errors.push(...validatePilotReceiptOutbox(entry));
  if (!Array.isArray(pilot.importOutbox)) errors.push("pilot-import-outbox-invalid");
  else for (const entry of pilot.importOutbox) errors.push(...validatePilotImportOutbox(entry));
  return result([...new Set(errors)]);
}

function validateSubscription(subscription, authority) {
  const errors = [];
  const keys = [
    "targetId", "targetType", "title", "region", "scope", "status", "authority",
    "serverRevision", "serverChecksum", "updatedAt",
  ];
  if (!exactKeys(subscription, keys)) return ["subscription-shape-invalid"];
  if (!isStableContractId(subscription.targetId)) errors.push("subscription-target-invalid");
  if (!RADAR_TARGET_TYPES.includes(subscription.targetType)) errors.push("subscription-target-type-invalid");
  if (subscription.title !== null && !validPublicLabel(subscription.title)) {
    errors.push("subscription-title-invalid");
  }
  if (subscription.region !== RADAR_DEFAULT_REGION) errors.push("subscription-region-invalid");
  if (!RADAR_SCOPES.includes(subscription.scope)) errors.push("subscription-scope-invalid");
  if (!["active", "paused"].includes(subscription.status)) errors.push("subscription-status-invalid");
  if (!validInstant(subscription.updatedAt)) errors.push("subscription-updated-at-invalid");

  if (authority === "guest") {
    if (subscription.authority !== "local") errors.push("guest-subscription-authority-invalid");
    if (subscription.serverRevision !== null || subscription.serverChecksum !== null) {
      errors.push("guest-subscription-server-state-forbidden");
    }
  } else {
    if (subscription.authority !== "server") errors.push("account-subscription-authority-invalid");
    if (!Number.isInteger(subscription.serverRevision) || subscription.serverRevision <= 0) {
      errors.push("account-subscription-revision-invalid");
    }
    if (!CHECKSUM_FORM.test(text(subscription.serverChecksum))) {
      errors.push("account-subscription-checksum-invalid");
    }
  }
  return errors;
}

function validateOutboxEntry(entry) {
  const errors = [];
  const baseKeys = [
    "operationId", "action", "targetId", "targetType", "title", "region", "scope",
    "status", "createdAt", "reason",
  ];
  const person = entry?.targetType === "person";
  const keys = person ? [...baseKeys, "personExternalId", "personRole"] : baseKeys;
  if (!exactKeys(entry, keys)) return ["outbox-shape-invalid"];
  if (!validOperationId(entry.operationId)) errors.push("outbox-operation-id-invalid");
  if (!LOCAL_RADAR_OUTBOX_ACTIONS.includes(entry.action)) errors.push("outbox-action-invalid");
  if (!isStableContractId(entry.targetId)) errors.push("outbox-target-invalid");
  if (!RADAR_TARGET_TYPES.includes(entry.targetType) && !person) errors.push("outbox-target-type-invalid");
  if (entry.title !== null && !validPublicLabel(entry.title)) errors.push("outbox-title-invalid");
  if (entry.region !== RADAR_DEFAULT_REGION) errors.push("outbox-region-invalid");
  if (!RADAR_SCOPES.includes(entry.scope)) errors.push("outbox-scope-invalid");
  if (!LOCAL_RADAR_OUTBOX_STATUSES.includes(entry.status)) errors.push("outbox-status-invalid");
  if (!validInstant(entry.createdAt)) errors.push("outbox-created-at-invalid");
  if (entry.reason !== null && (!text(entry.reason) || text(entry.reason).length > 120)) {
    errors.push("outbox-reason-invalid");
  }
  if (person) {
    const identity = {
      personExternalId: entry.personExternalId,
      name: entry.title,
      role: entry.personRole,
      canonical: true,
    };
    if (!validatePersonIdentity(identity).ok
        || entry.targetId !== createPersonRadarTargetId(entry.personExternalId, entry.personRole)
        || entry.scope !== "all") errors.push("outbox-person-invalid");
  }
  return errors;
}

function validatePersonSubscription(subscription, authority) {
  const keys = [
    "personExternalId", "name", "role", "status", "authority",
    "serverRevision", "serverChecksum", "updatedAt",
  ];
  if (!exactKeys(subscription, keys)) return ["person-subscription-shape-invalid"];
  const errors = [...validatePersonIdentity({
    personExternalId: subscription.personExternalId,
    name: subscription.name,
    role: subscription.role,
    canonical: true,
  }).errors];
  if (!["active", "paused"].includes(subscription.status)) errors.push("person-subscription-status-invalid");
  if (!validInstant(subscription.updatedAt)) errors.push("person-subscription-updated-at-invalid");
  if (authority === "guest") {
    if (subscription.authority !== "local") errors.push("guest-person-authority-invalid");
    if (subscription.serverRevision !== null || subscription.serverChecksum !== null) {
      errors.push("guest-person-server-state-forbidden");
    }
  } else {
    if (subscription.authority !== "server") errors.push("account-person-authority-invalid");
    if (!Number.isInteger(subscription.serverRevision) || subscription.serverRevision <= 0) {
      errors.push("account-person-revision-invalid");
    }
    if (!CHECKSUM_FORM.test(text(subscription.serverChecksum))) errors.push("account-person-checksum-invalid");
  }
  return errors;
}

function validatePersonResult(entry) {
  const keys = [
    "personExternalId", "name", "role", "status", "checkedAt", "windowStart", "windowEnd", "decisions",
  ];
  if (!exactKeys(entry, keys)) return ["person-result-shape-invalid"];
  const errors = [...validatePersonIdentity({
    personExternalId: entry.personExternalId,
    name: entry.name,
    role: entry.role,
    canonical: true,
  }).errors];
  if (!PERSON_DISCOVERY_CHECK_STATUSES.includes(entry.status)) errors.push("person-result-status-invalid");
  if (!validInstant(entry.checkedAt)) errors.push("person-result-time-invalid");
  if (!Array.isArray(entry.decisions) || entry.decisions.length > 6) errors.push("person-result-decisions-invalid");
  else for (const decision of entry.decisions) {
    if (!exactKeys(decision, [
      "status", "title", "year", "work", "eventType", "date", "region", "platform", "evidence",
    ])) {
      errors.push("person-result-decision-shape-invalid"); continue;
    }
    if (!PERSON_DISCOVERY_MATCH_STATUSES.includes(decision.status)) errors.push("person-result-match-status-invalid");
    if (!validPublicLabel(decision.title)) errors.push("person-result-title-invalid");
    if (!Number.isInteger(decision.year) || decision.year < 1888 || decision.year > new Date().getUTCFullYear() + 10) {
      errors.push("person-result-year-invalid");
    }
    if (decision.status === "matched") {
      if (!exactPilotKeys(decision.work, ["targetId", "targetType", "title", "year"])
          || !isStableContractId(decision.work?.targetId)
          || !RADAR_TARGET_TYPES.includes(decision.work?.targetType)
          || !validPublicLabel(decision.work?.title) || decision.work?.year !== decision.year) {
        errors.push("person-result-work-invalid");
      }
    } else if (decision.work !== null) errors.push("person-result-unmatched-work-forbidden");
    if (!RADAR_EVENT_TYPES.includes(decision.eventType)) errors.push("person-result-event-type-invalid");
    if (!validDay(decision.date) || decision.date < entry.windowStart || decision.date > entry.windowEnd) {
      errors.push("person-result-date-invalid");
    }
    if (decision.region !== RADAR_DEFAULT_REGION) errors.push("person-result-region-invalid");
    if (decision.eventType === "streamingstart_at") {
      if (!validPublicLabel(decision.platform, 80) || decision.platform === "-") errors.push("person-result-platform-invalid");
    } else if (decision.platform !== "-") errors.push("person-result-platform-invalid");
    if (!Array.isArray(decision.evidence) || decision.evidence.length < 1 || decision.evidence.length > 2) {
      errors.push("person-result-evidence-invalid");
    } else {
      const sourceIds = new Set();
      const sourceDomains = new Set();
      const urls = new Set();
      for (const evidence of decision.evidence) {
        if (!exactPilotKeys(evidence, ["sourceId", "sourceDomain", "url", "retrievedAt"])
            || !isStableContractId(evidence.sourceId) || !validDomain(evidence.sourceDomain)
            || !validEvidenceUrl(evidence.url, evidence.sourceDomain) || !validInstant(evidence.retrievedAt)
            || Date.parse(evidence.retrievedAt) > Date.parse(entry.checkedAt)
            || sourceIds.has(evidence.sourceId) || sourceDomains.has(evidence.sourceDomain)
            || urls.has(evidence.url)) {
          errors.push("person-result-evidence-invalid");
        }
        sourceIds.add(evidence.sourceId); sourceDomains.add(evidence.sourceDomain); urls.add(evidence.url);
      }
    }
  }
  const start = dayNumber(entry.windowStart);
  const end = dayNumber(entry.windowEnd);
  if (start == null || end == null || end - start !== 6) errors.push("person-result-window-invalid");
  return errors;
}

function validateShare(share, authority) {
  const errors = [];
  const keys = [
    "targetId", "status", "authority", "serverRevision", "serverChecksum", "updatedAt",
  ];
  if (!exactKeys(share, keys)) return ["share-shape-invalid"];
  if (!isStableContractId(share.targetId)) errors.push("share-target-invalid");
  if (!LOCAL_RADAR_SHARE_STATUSES.includes(share.status)) errors.push("share-status-invalid");
  if (!validInstant(share.updatedAt)) errors.push("share-updated-at-invalid");
  if (authority !== "account-cache" || share.authority !== "server") {
    errors.push("share-authority-invalid");
  }
  if (!Number.isInteger(share.serverRevision) || share.serverRevision <= 0) {
    errors.push("share-revision-invalid");
  }
  if (!CHECKSUM_FORM.test(text(share.serverChecksum))) errors.push("share-checksum-invalid");
  return errors;
}

function validateShareOutboxEntry(entry) {
  const errors = [];
  const keys = ["operationId", "targetId", "shareEnabled", "status", "createdAt", "reason"];
  if (!exactKeys(entry, keys)) return ["share-outbox-shape-invalid"];
  if (!validOperationId(entry.operationId)) errors.push("share-outbox-operation-id-invalid");
  if (!isStableContractId(entry.targetId)) errors.push("share-outbox-target-invalid");
  if (typeof entry.shareEnabled !== "boolean") errors.push("share-outbox-enabled-invalid");
  if (!LOCAL_RADAR_OUTBOX_STATUSES.includes(entry.status)) errors.push("share-outbox-status-invalid");
  if (!validInstant(entry.createdAt)) errors.push("share-outbox-created-at-invalid");
  if (entry.reason !== null && (!text(entry.reason) || text(entry.reason).length > 120)) {
    errors.push("share-outbox-reason-invalid");
  }
  return errors;
}

function validateReceipt(receipt) {
  const errors = [];
  const keys = ["eventId", "versionId", "status", "updatedAt"];
  if (!exactKeys(receipt, keys)) return ["receipt-shape-invalid"];
  if (!isStableContractId(receipt.eventId) && !isRadarEventIdentity(receipt.eventId)) errors.push("receipt-event-id-invalid");
  if (!isStableContractId(receipt.versionId)) errors.push("receipt-version-id-invalid");
  if (!RADAR_RECEIPT_STATUSES.includes(receipt.status)) errors.push("receipt-status-invalid");
  if (!validInstant(receipt.updatedAt)) errors.push("receipt-updated-at-invalid");
  return errors;
}

export function validateLocalRadarState(state) {
  const errors = [];
  const baseKeys = [
    "format", "version", "authority", "subscriptions", "outbox", "personSubscriptions", "personResults", "shares",
    "shareOutbox", "receipts", "display", "server",
  ];
  const keys = state?.pilot === undefined ? baseKeys : [...baseKeys, "pilot"];
  if (!exactPilotKeys(state, keys)) return result(["radar-state-shape-invalid"]);
  if (state.format !== LOCAL_RADAR_FORMAT) errors.push("radar-format-invalid");
  if (state.version !== LOCAL_RADAR_VERSION) errors.push("radar-version-invalid");
  if (!LOCAL_RADAR_AUTHORITIES.includes(state.authority)) errors.push("radar-authority-invalid");
  if (state.pilot !== undefined) {
    if (state.authority !== "account-cache") errors.push("guest-pilot-state-forbidden");
    errors.push(...validateAccountRadarPilot(state.pilot).errors);
  }
  if (!Array.isArray(state.subscriptions)) errors.push("radar-subscriptions-invalid");
  if (!Array.isArray(state.outbox) || state.outbox.length > LOCAL_RADAR_MAX_OUTBOX) errors.push("radar-outbox-invalid");
  if (!Array.isArray(state.personSubscriptions)) errors.push("radar-person-subscriptions-invalid");
  if (!Array.isArray(state.personResults)) errors.push("radar-person-results-invalid");
  if (!Array.isArray(state.shares) || state.shares.length > LOCAL_RADAR_MAX_SHARES) errors.push("radar-shares-invalid");
  if (!Array.isArray(state.shareOutbox) || state.shareOutbox.length > LOCAL_RADAR_MAX_OUTBOX) {
    errors.push("radar-share-outbox-invalid");
  }
  if (!Array.isArray(state.receipts) || state.receipts.length > LOCAL_RADAR_MAX_RECEIPTS) errors.push("radar-receipts-invalid");
  if (!exactKeys(state.display, ["showDismissed"]) || typeof state.display.showDismissed !== "boolean") {
    errors.push("radar-display-invalid");
  }
  if (!exactKeys(state.server, ["revision", "checksum", "reconciledAt"])) {
    errors.push("radar-server-shape-invalid");
  } else {
    if (!Number.isInteger(state.server.revision) || state.server.revision < 0) errors.push("radar-server-revision-invalid");
    if (state.server.checksum !== null && !CHECKSUM_FORM.test(text(state.server.checksum))) {
      errors.push("radar-server-checksum-invalid");
    }
    if (state.server.reconciledAt !== null && !validInstant(state.server.reconciledAt)) {
      errors.push("radar-server-reconciled-at-invalid");
    }
    if (state.authority === "guest" && (
      state.server.revision !== 0 || state.server.checksum !== null || state.server.reconciledAt !== null
    )) errors.push("guest-server-state-forbidden");
  }

  if (Array.isArray(state.subscriptions)) {
    const seen = new Set();
    for (const subscription of state.subscriptions) {
      errors.push(...validateSubscription(subscription, state.authority));
      const id = text(subscription?.targetId);
      if (seen.has(id)) errors.push("subscription-duplicate-target");
      seen.add(id);
    }
    if (state.authority === "guest"
        && state.subscriptions.filter((entry) => entry?.status === "active").length > RADAR_NORMAL_ACTIVE_LIMIT) {
      errors.push("guest-subscription-limit-exceeded");
    }
  }
  if (Array.isArray(state.outbox)) {
    const seen = new Set();
    for (const entry of state.outbox) {
      errors.push(...validateOutboxEntry(entry));
      const id = text(entry?.operationId);
      if (seen.has(id)) errors.push("outbox-operation-duplicate");
      seen.add(id);
    }
    if (state.authority === "guest" && state.outbox.length) errors.push("guest-outbox-forbidden");
  }
  if (Array.isArray(state.personSubscriptions)) {
    const seen = new Set();
    for (const subscription of state.personSubscriptions) {
      errors.push(...validatePersonSubscription(subscription, state.authority));
      const id = createPersonIdentityKey(subscription);
      if (!id || seen.has(id)) errors.push("person-subscription-duplicate");
      if (id) seen.add(id);
    }
    if (state.authority === "guest") {
      const activeCount = state.subscriptions.filter((entry) => entry?.status === "active").length
        + state.personSubscriptions.filter((entry) => entry?.status === "active").length;
      if (activeCount > RADAR_NORMAL_ACTIVE_LIMIT) errors.push("guest-subscription-limit-exceeded");
    }
  }
  if (Array.isArray(state.personResults)) {
    const seen = new Set();
    const subscriptions = new Set((Array.isArray(state.personSubscriptions) ? state.personSubscriptions : [])
      .map((entry) => createPersonIdentityKey(entry)).filter(Boolean));
    for (const entry of state.personResults) {
      errors.push(...validatePersonResult(entry));
      const id = createPersonIdentityKey(entry);
      if (!id || seen.has(id)) errors.push("person-result-duplicate");
      if (id && !subscriptions.has(id)) errors.push("person-result-without-subscription");
      if (id) seen.add(id);
    }
  }
  if (Array.isArray(state.shares)) {
    const seen = new Set();
    const activeSubscriptions = new Set((Array.isArray(state.subscriptions) ? state.subscriptions : [])
      .filter((entry) => entry?.status === "active").map((entry) => entry.targetId));
    for (const share of state.shares) {
      errors.push(...validateShare(share, state.authority));
      const id = text(share?.targetId);
      if (seen.has(id)) errors.push("share-duplicate-target");
      if (share?.status === "active" && !activeSubscriptions.has(id)) errors.push("active-share-without-active-subscription");
      seen.add(id);
    }
    if (state.authority === "guest" && state.shares.length) errors.push("guest-shares-forbidden");
  }
  if (Array.isArray(state.shareOutbox)) {
    const seen = new Set();
    for (const entry of state.shareOutbox) {
      errors.push(...validateShareOutboxEntry(entry));
      const id = text(entry?.operationId);
      if (seen.has(id)) errors.push("share-outbox-operation-duplicate");
      seen.add(id);
    }
    if (state.authority === "guest" && state.shareOutbox.length) errors.push("guest-share-outbox-forbidden");
  }
  if (Array.isArray(state.receipts)) {
    const seen = new Set();
    for (const receipt of state.receipts) {
      errors.push(...validateReceipt(receipt));
      const id = `${text(receipt?.eventId)}|${text(receipt?.versionId)}`;
      if (seen.has(id)) errors.push("receipt-duplicate-version");
      seen.add(id);
    }
  }
  return result([...new Set(errors)]);
}

function migrateLocalRadarV1(value) {
  if (!plain(value) || value.format !== LOCAL_RADAR_FORMAT || value.version !== 1) return null;
  const next = clone(value);
  next.version = LOCAL_RADAR_VERSION;
  next.personSubscriptions = [];
  next.personResults = [];
  next.subscriptions = Array.isArray(next.subscriptions)
    ? next.subscriptions.map((entry) => ({ ...entry, title: null })) : next.subscriptions;
  next.outbox = Array.isArray(next.outbox)
    ? next.outbox.map((entry) => ({ ...entry, title: null })) : next.outbox;
  return validateLocalRadarState(next).ok ? next : null;
}

function normalizeLocalRadarVersion(value) {
  if (validateLocalRadarState(value).ok) return { state: value, migratedFromVersion: null };
  const migrated = migrateLocalRadarV1(value);
  return migrated ? { state: migrated, migratedFromVersion: 1 } : null;
}

export function isLocalRadarBackupState(value) {
  return normalizeLocalRadarVersion(value) !== null;
}

export function decodeLocalRadar(raw, { authority = "guest" } = {}) {
  if (!LOCAL_RADAR_AUTHORITIES.includes(authority)) {
    return Object.freeze({
      ok: false, status: "authority-invalid", state: null,
      errors: Object.freeze(["radar-authority-invalid"]),
    });
  }
  if (raw == null) {
    return Object.freeze({ ok: true, status: "missing", state: createEmptyLocalRadar({ authority }), errors: Object.freeze([]) });
  }
  if (typeof raw !== "string" || byteLength(raw) > LOCAL_RADAR_MAX_BYTES) {
    return Object.freeze({ ok: false, status: "corrupt", state: null, errors: Object.freeze(["radar-raw-invalid"]) });
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    return Object.freeze({ ok: false, status: "corrupt", state: null, errors: Object.freeze(["radar-json-invalid"]) });
  }
  const normalized = normalizeLocalRadarVersion(parsed);
  const checked = normalized ? validateLocalRadarState(normalized.state) : result(["radar-version-or-shape-invalid"]);
  if (checked.ok && LOCAL_RADAR_AUTHORITIES.includes(authority) && normalized.state.authority !== authority) {
    return Object.freeze({
      ok: false, status: "authority-mismatch", state: null,
      errors: Object.freeze(["radar-authority-mismatch"]),
    });
  }
  return checked.ok
    ? Object.freeze({
      ok: true,
      status: "loaded",
      state: freezeDeep(normalized.state),
      errors: checked.errors,
      migratedFromVersion: normalized.migratedFromVersion,
    })
    : Object.freeze({ ok: false, status: "corrupt", state: null, errors: checked.errors });
}

function targetDraft(target) {
  const checked = validateRadarTarget(target, { allowFixture: true });
  return checked.ok && target.targetStatus === "active" && target.canonical === true
    ? { targetId: text(target.targetId), targetType: target.targetType, title: text(target.title) }
    : null;
}

export function upsertGuestRadarSubscription(state, {
  target, scope = "all", now = new Date().toISOString(), status = "active",
} = {}) {
  const stateCheck = validateLocalRadarState(state);
  if (!stateCheck.ok || state.authority !== "guest") {
    return Object.freeze({ ok: false, reason: "guest-state-required", state, changed: false });
  }
  const draft = targetDraft(target);
  if (!draft || !RADAR_SCOPES.includes(scope) || !["active", "paused"].includes(status) || !validInstant(now)) {
    return Object.freeze({ ok: false, reason: "subscription-invalid", state, changed: false });
  }
  const existing = state.subscriptions.find((entry) => entry.targetId === draft.targetId);
  const activeBefore = state.subscriptions.filter((entry) => entry.status === "active").length;
  const increment = status === "active" && existing?.status !== "active" ? 1 : 0;
  if (!existing && status === "active" && activeBefore >= RADAR_NORMAL_ACTIVE_LIMIT) {
    return Object.freeze({ ok: false, reason: "quota-exceeded", state, changed: false });
  }
  if (existing && activeBefore + increment > RADAR_NORMAL_ACTIVE_LIMIT) {
    return Object.freeze({ ok: false, reason: "quota-exceeded", state, changed: false });
  }
  const nextSubscription = {
    ...draft,
    region: RADAR_DEFAULT_REGION,
    scope,
    status,
    authority: "local",
    serverRevision: null,
    serverChecksum: null,
    updatedAt: now,
  };
  const next = clone(state);
  next.subscriptions = existing
    ? next.subscriptions.map((entry) => entry.targetId === draft.targetId ? nextSubscription : entry)
    : [...next.subscriptions, nextSubscription];
  next.subscriptions.sort((a, b) => a.targetId.localeCompare(b.targetId));
  return Object.freeze({
    ok: true,
    reason: existing ? "updated" : "created",
    state: freezeDeep(next),
    changed: !existing || JSON.stringify(existing) !== JSON.stringify(nextSubscription),
    createsProviderJob: false,
  });
}

export function removeGuestRadarSubscription(state, targetId) {
  if (!validateLocalRadarState(state).ok || state.authority !== "guest") {
    return Object.freeze({ ok: false, reason: "guest-state-required", state, changed: false });
  }
  const normalizedTargetId = text(targetId);
  if (!isStableContractId(normalizedTargetId)) {
    return Object.freeze({ ok: false, reason: "subscription-target-invalid", state, changed: false });
  }
  if (!state.subscriptions.some((entry) => entry.targetId === normalizedTargetId)) {
    return Object.freeze({ ok: true, reason: "already-missing", state, changed: false, createsProviderJob: false });
  }
  const next = clone(state);
  next.subscriptions = next.subscriptions.filter((entry) => entry.targetId !== normalizedTargetId);
  /* Receipts gehören zu Eventversionen und dürfen bei einem Aboende nicht
     blind gelöscht werden. Ein späteres erneutes Abo behält damit die eigene
     bereits getroffene Anzeigeentscheidung. */
  return Object.freeze({
    ok: true,
    reason: "removed",
    state: freezeDeep(next),
    changed: true,
    createsProviderJob: false,
  });
}

export function upsertGuestPersonRadarSubscription(state, {
  identity, status = "active", now = new Date().toISOString(),
} = {}) {
  if (!validateLocalRadarState(state).ok || state.authority !== "guest") {
    return Object.freeze({ ok: false, reason: "guest-state-required", state, changed: false });
  }
  const identityCheck = validatePersonIdentity(identity);
  const identityKey = createPersonIdentityKey(identity);
  if (!identityCheck.ok || !identityKey || !["active", "paused"].includes(status) || !validInstant(now)) {
    return Object.freeze({ ok: false, reason: "person-subscription-invalid", state, changed: false });
  }
  const existing = state.personSubscriptions.find((entry) => createPersonIdentityKey(entry) === identityKey);
  const activeCount = state.subscriptions.filter((entry) => entry.status === "active").length
    + state.personSubscriptions.filter((entry) => entry.status === "active").length;
  if (status === "active" && existing?.status !== "active" && activeCount >= RADAR_NORMAL_ACTIVE_LIMIT) {
    return Object.freeze({ ok: false, reason: "quota-exceeded", state, changed: false });
  }
  const nextSubscription = {
    personExternalId: text(identity.personExternalId),
    name: text(identity.name),
    role: identity.role,
    status,
    authority: "local",
    serverRevision: null,
    serverChecksum: null,
    updatedAt: now,
  };
  const next = clone(state);
  next.personSubscriptions = existing
    ? next.personSubscriptions.map((entry) => createPersonIdentityKey(entry) === identityKey ? nextSubscription : entry)
    : [...next.personSubscriptions, nextSubscription];
  next.personSubscriptions.sort((a, b) => createPersonIdentityKey(a).localeCompare(createPersonIdentityKey(b)));
  const checked = validateLocalRadarState(next);
  if (!checked.ok) return Object.freeze({ ok: false, reason: "person-subscription-result-invalid", state, changed: false });
  return Object.freeze({
    ok: true,
    reason: existing ? "updated" : "created",
    state: freezeDeep(next),
    changed: !existing || JSON.stringify(existing) !== JSON.stringify(nextSubscription),
    createsProviderJob: false,
    createsWorkSubscription: false,
  });
}

export function setGuestPersonRadarSubscriptionStatus(state, identity, status, now = new Date().toISOString()) {
  return upsertGuestPersonRadarSubscription(state, { identity, status, now });
}

export function removeGuestPersonRadarSubscription(state, identity) {
  if (!validateLocalRadarState(state).ok || state.authority !== "guest") {
    return Object.freeze({ ok: false, reason: "guest-state-required", state, changed: false });
  }
  const identityKey = createPersonIdentityKey(identity);
  if (!identityKey) return Object.freeze({ ok: false, reason: "person-subscription-invalid", state, changed: false });
  if (!state.personSubscriptions.some((entry) => createPersonIdentityKey(entry) === identityKey)) {
    return Object.freeze({ ok: true, reason: "already-missing", state, changed: false, createsProviderJob: false });
  }
  const next = clone(state);
  next.personSubscriptions = next.personSubscriptions.filter((entry) => createPersonIdentityKey(entry) !== identityKey);
  next.personResults = next.personResults.filter((entry) => createPersonIdentityKey(entry) !== identityKey);
  return Object.freeze({
    ok: true,
    reason: "removed",
    state: freezeDeep(next),
    changed: true,
    createsProviderJob: false,
    createsWorkSubscription: false,
  });
}

export function applyPersonRadarCheckResult(state, {
  identity, response, catalog = [], mode = "production",
} = {}) {
  if (!validateLocalRadarState(state).ok) {
    return Object.freeze({ ok: false, reason: "state-invalid", state, changed: false });
  }
  const identityKey = createPersonIdentityKey(identity);
  const subscription = state.personSubscriptions.find((entry) => createPersonIdentityKey(entry) === identityKey);
  if (!identityKey || !subscription || subscription.status !== "active") {
    return Object.freeze({ ok: false, reason: "active-person-subscription-required", state, changed: false });
  }
  const checked = validatePersonRadarCheckResult(response, { identity: subscription, catalog, mode });
  if (!checked.ok) {
    return Object.freeze({ ok: false, reason: "person-check-invalid", state, changed: false, errors: checked.errors });
  }
  const resultEntry = {
    personExternalId: subscription.personExternalId,
    name: subscription.name,
    role: subscription.role,
    status: checked.result.status,
    checkedAt: checked.result.checkedAt,
    windowStart: checked.result.windowStart,
    windowEnd: checked.result.windowEnd,
    decisions: checked.result.decisions,
  };
  const next = clone(state);
  const existing = next.personResults.find((entry) => createPersonIdentityKey(entry) === identityKey);
  next.personResults = existing
    ? next.personResults.map((entry) => createPersonIdentityKey(entry) === identityKey ? resultEntry : entry)
    : [...next.personResults, resultEntry];
  const stateCheck = validateLocalRadarState(next);
  if (!stateCheck.ok) {
    return Object.freeze({ ok: false, reason: "person-check-result-invalid", state, changed: false, errors: stateCheck.errors });
  }
  return Object.freeze({
    ok: true,
    reason: checked.result.status,
    state: freezeDeep(next),
    changed: !existing || JSON.stringify(existing) !== JSON.stringify(resultEntry),
    createsProviderJob: false,
    createsWorkSubscription: false,
    createsEvent: false,
  });
}

export function queueAccountRadarChange(state, {
  operationId, action, target, scope = "all", now = new Date().toISOString(),
} = {}) {
  const stateCheck = validateLocalRadarState(state);
  if (!stateCheck.ok || state.authority !== "account-cache") {
    return Object.freeze({ ok: false, reason: "account-cache-required", state, changed: false });
  }
  const draft = targetDraft(target);
  const entry = {
    operationId: text(operationId), action, targetId: draft?.targetId || "",
    targetType: draft?.targetType || "", title: draft?.title || null, region: RADAR_DEFAULT_REGION, scope,
    status: "pending", createdAt: now, reason: null,
  };
  if (!draft || validateOutboxEntry(entry).length) {
    return Object.freeze({ ok: false, reason: "outbox-entry-invalid", state, changed: false });
  }
  const existing = state.outbox.find((item) => item.operationId === entry.operationId);
  if (existing) {
    const same = JSON.stringify(existing) === JSON.stringify(entry);
    return Object.freeze({ ok: same, reason: same ? "idempotent" : "operation-id-conflict", state, changed: false });
  }
  if (state.outbox.length >= LOCAL_RADAR_MAX_OUTBOX) {
    return Object.freeze({ ok: false, reason: "outbox-full", state, changed: false });
  }
  const next = clone(state);
  next.outbox.push(entry);
  return Object.freeze({ ok: true, reason: "queued", state: freezeDeep(next), changed: true, createsProviderJob: false });
}

/* Personen nutzen dieselbe accountgebundene Outbox. Der geschlossene
   Discriminator ist additiv; Werk-Abos und deren Zielvalidator bleiben
   unverändert. Eine spätere Server-RPC muss ID, Name und Rolle erneut gegen
   ihren kuratierten Vertrag prüfen. */
export function queueAccountPersonRadarChange(state, {
  operationId, action, identity, targetId, now = new Date().toISOString(),
} = {}) {
  const stateCheck = validateLocalRadarState(state);
  const identityCheck = validatePersonIdentity(identity);
  const expectedTargetId = createPersonRadarTargetId(identity?.personExternalId, identity?.role);
  if (!stateCheck.ok || state.authority !== "account-cache") {
    return Object.freeze({ ok: false, reason: "account-cache-required", state, changed: false });
  }
  const entry = {
    operationId: text(operationId),
    action,
    targetId: text(targetId),
    targetType: "person",
    title: text(identity?.name) || null,
    region: RADAR_DEFAULT_REGION,
    scope: "all",
    status: "pending",
    createdAt: now,
    reason: null,
    personExternalId: text(identity?.personExternalId),
    personRole: identity?.role,
  };
  if (!identityCheck.ok || entry.targetId !== expectedTargetId || validateOutboxEntry(entry).length) {
    return Object.freeze({ ok: false, reason: "outbox-person-invalid", state, changed: false });
  }
  const existing = state.outbox.find((item) => item.operationId === entry.operationId);
  if (existing) {
    const same = JSON.stringify(existing) === JSON.stringify(entry);
    return Object.freeze({ ok: same, reason: same ? "idempotent" : "operation-id-conflict", state, changed: false });
  }
  if (state.outbox.length >= LOCAL_RADAR_MAX_OUTBOX) {
    return Object.freeze({ ok: false, reason: "outbox-full", state, changed: false });
  }
  const next = clone(state);
  next.outbox.push(entry);
  return Object.freeze({ ok: true, reason: "queued", state: freezeDeep(next), changed: true, createsProviderJob: false });
}

export function rejectAccountRadarChange(state, operationId, reason) {
  const id = text(operationId);
  const normalizedReason = text(reason);
  if (!validateLocalRadarState(state).ok || state.authority !== "account-cache"
      || !id || !normalizedReason || normalizedReason.length > 120) {
    return Object.freeze({ ok: false, reason: "rejection-invalid", state, changed: false });
  }
  if (!state.outbox.some((entry) => entry.operationId === id)) {
    return Object.freeze({ ok: false, reason: "operation-not-found", state, changed: false });
  }
  const next = clone(state);
  next.outbox = next.outbox.map((entry) => entry.operationId === id
    ? { ...entry, status: "rejected", reason: normalizedReason }
    : entry);
  return Object.freeze({ ok: true, reason: "rejected", state: freezeDeep(next), changed: true });
}

export function queueAccountRadarShareChange(state, {
  operationId, targetId, shareEnabled, now = new Date().toISOString(),
} = {}) {
  if (!validateLocalRadarState(state).ok || state.authority !== "account-cache") {
    return Object.freeze({ ok: false, reason: "account-cache-required", state, changed: false });
  }
  const normalizedTargetId = text(targetId);
  const entry = {
    operationId: text(operationId), targetId: normalizedTargetId, shareEnabled,
    status: "pending", createdAt: now, reason: null,
  };
  const activeSubscription = state.subscriptions.some((subscription) => (
    subscription.targetId === normalizedTargetId && subscription.status === "active"
  ));
  if (validateShareOutboxEntry(entry).length || (shareEnabled === true && !activeSubscription)) {
    return Object.freeze({
      ok: false,
      reason: shareEnabled === true && !activeSubscription ? "active-subscription-required" : "share-outbox-entry-invalid",
      state,
      changed: false,
    });
  }
  const existing = state.shareOutbox.find((item) => item.operationId === entry.operationId);
  if (existing) {
    const same = JSON.stringify(existing) === JSON.stringify(entry);
    return Object.freeze({ ok: same, reason: same ? "idempotent" : "operation-id-conflict", state, changed: false });
  }
  if (state.shareOutbox.length >= LOCAL_RADAR_MAX_OUTBOX) {
    return Object.freeze({ ok: false, reason: "share-outbox-full", state, changed: false });
  }
  const next = clone(state);
  next.shareOutbox.push(entry);
  return Object.freeze({
    ok: true, reason: "queued", state: freezeDeep(next), changed: true, createsProviderJob: false,
  });
}

export function rejectAccountRadarShareChange(state, operationId, reason) {
  const id = text(operationId);
  const normalizedReason = text(reason);
  if (!validateLocalRadarState(state).ok || state.authority !== "account-cache"
      || !id || !normalizedReason || normalizedReason.length > 120) {
    return Object.freeze({ ok: false, reason: "rejection-invalid", state, changed: false });
  }
  if (!state.shareOutbox.some((entry) => entry.operationId === id)) {
    return Object.freeze({ ok: false, reason: "operation-not-found", state, changed: false });
  }
  const next = clone(state);
  next.shareOutbox = next.shareOutbox.map((entry) => entry.operationId === id
    ? { ...entry, status: "rejected", reason: normalizedReason }
    : entry);
  return Object.freeze({ ok: true, reason: "rejected", state: freezeDeep(next), changed: true });
}

function validateServerSnapshot(snapshot) {
  const errors = [];
  const keys = [
    "revision", "checksum", "reconciledAt", "subscriptions", "shares",
    "acknowledgedOperationIds", "acknowledgedShareOperationIds",
  ];
  if (!exactKeys(snapshot, keys)) return result(["server-snapshot-shape-invalid"]);
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) errors.push("server-snapshot-revision-invalid");
  if (snapshot.revision === 0) {
    if (snapshot.checksum !== null) errors.push("server-snapshot-checksum-invalid");
  } else if (!CHECKSUM_FORM.test(text(snapshot.checksum))) errors.push("server-snapshot-checksum-invalid");
  if (!validInstant(snapshot.reconciledAt)) errors.push("server-snapshot-time-invalid");
  if (!Array.isArray(snapshot.subscriptions)) errors.push("server-snapshot-subscriptions-invalid");
  if (!Array.isArray(snapshot.shares)) errors.push("server-snapshot-shares-invalid");
  if (!Array.isArray(snapshot.acknowledgedOperationIds)) errors.push("server-snapshot-acks-invalid");
  if (!Array.isArray(snapshot.acknowledgedShareOperationIds)) errors.push("server-snapshot-share-acks-invalid");
  if (Array.isArray(snapshot.acknowledgedOperationIds)) {
    const ids = snapshot.acknowledgedOperationIds.map(text);
    if (ids.some((id) => !validOperationId(id)) || new Set(ids).size !== ids.length) {
      errors.push("server-snapshot-acks-invalid");
    }
  }
  if (Array.isArray(snapshot.acknowledgedShareOperationIds)) {
    const ids = snapshot.acknowledgedShareOperationIds.map(text);
    if (ids.some((id) => !validOperationId(id)) || new Set(ids).size !== ids.length) {
      errors.push("server-snapshot-share-acks-invalid");
    }
  }
  if (Array.isArray(snapshot.subscriptions)) {
    const seen = new Set();
    for (const entry of snapshot.subscriptions) {
      const keys2 = ["targetId", "targetType", "title", "region", "scope", "status", "updatedAt"];
      if (!exactKeys(entry, keys2)) { errors.push("server-subscription-shape-invalid"); continue; }
      if (!isStableContractId(entry.targetId)) errors.push("server-subscription-target-invalid");
      if (!RADAR_TARGET_TYPES.includes(entry.targetType)) errors.push("server-subscription-target-type-invalid");
      if (entry.title !== undefined && !validPublicLabel(entry.title)) {
        errors.push("server-subscription-title-invalid");
      }
      if (entry.region !== RADAR_DEFAULT_REGION) errors.push("server-subscription-region-invalid");
      if (!RADAR_SCOPES.includes(entry.scope)) errors.push("server-subscription-scope-invalid");
      if (!["active", "paused"].includes(entry.status)) errors.push("server-subscription-status-invalid");
      if (!validInstant(entry.updatedAt)) errors.push("server-subscription-time-invalid");
      if (seen.has(entry.targetId)) errors.push("server-subscription-duplicate");
      seen.add(entry.targetId);
    }
    if (snapshot.revision === 0 && snapshot.subscriptions.length) errors.push("server-zero-revision-data-forbidden");
  }
  if (Array.isArray(snapshot.shares)) {
    const seen = new Set();
    const activeSubscriptions = new Set((Array.isArray(snapshot.subscriptions) ? snapshot.subscriptions : [])
      .filter((entry) => entry?.status === "active").map((entry) => entry.targetId));
    for (const share of snapshot.shares) {
      const keys2 = ["targetId", "status", "updatedAt"];
      if (!exactKeys(share, keys2)) { errors.push("server-share-shape-invalid"); continue; }
      if (!isStableContractId(share.targetId)) errors.push("server-share-target-invalid");
      if (!LOCAL_RADAR_SHARE_STATUSES.includes(share.status)) errors.push("server-share-status-invalid");
      if (!validInstant(share.updatedAt)) errors.push("server-share-time-invalid");
      if (share.status === "active" && !activeSubscriptions.has(share.targetId)) {
        errors.push("server-active-share-without-active-subscription");
      }
      if (seen.has(share.targetId)) errors.push("server-share-duplicate");
      seen.add(share.targetId);
    }
    if (snapshot.revision === 0 && snapshot.shares.length) errors.push("server-zero-revision-data-forbidden");
  }
  return result([...new Set(errors)]);
}

export function reconcileAccountRadarSnapshot(state, snapshot) {
  const stateCheck = validateLocalRadarState(state);
  const snapshotCheck = validateServerSnapshot(snapshot);
  if (!stateCheck.ok || state.authority !== "account-cache" || !snapshotCheck.ok) {
    return Object.freeze({
      ok: false, reason: !snapshotCheck.ok ? "snapshot-invalid" : "account-cache-required",
      state, changed: false, errors: snapshotCheck.errors,
    });
  }
  if (snapshot.revision < state.server.revision) {
    return Object.freeze({ ok: false, reason: "snapshot-stale", state, changed: false });
  }
  if (snapshot.revision === state.server.revision && state.server.checksum !== snapshot.checksum) {
    return Object.freeze({ ok: false, reason: "snapshot-revision-conflict", state, changed: false });
  }
  const acknowledged = new Set(snapshot.acknowledgedOperationIds);
  const acknowledgedShares = new Set(snapshot.acknowledgedShareOperationIds);
  const next = clone(state);
  next.subscriptions = snapshot.subscriptions.map((entry) => {
    const retainedTitle = [
      entry.title,
      state.subscriptions.find((item) => item.targetId === entry.targetId)?.title,
      [...state.outbox].reverse().find((item) => item.targetId === entry.targetId)?.title,
    ].map(text).find((value) => validPublicLabel(value)) || null;
    return {
      ...entry,
      title: retainedTitle,
      authority: "server",
      serverRevision: snapshot.revision,
      serverChecksum: snapshot.checksum,
    };
  }).sort((a, b) => a.targetId.localeCompare(b.targetId));
  next.outbox = next.outbox.filter((entry) => !acknowledged.has(entry.operationId));
  next.shares = snapshot.shares.map((entry) => ({
    ...entry,
    authority: "server",
    serverRevision: snapshot.revision,
    serverChecksum: snapshot.checksum,
  })).sort((a, b) => a.targetId.localeCompare(b.targetId));
  next.shareOutbox = next.shareOutbox.filter((entry) => !acknowledgedShares.has(entry.operationId));
  next.server = {
    revision: snapshot.revision,
    checksum: snapshot.checksum,
    reconciledAt: snapshot.reconciledAt,
  };
  const nextCheck = validateLocalRadarState(next);
  if (!nextCheck.ok) {
    return Object.freeze({ ok: false, reason: "snapshot-result-invalid", state, changed: false, errors: nextCheck.errors });
  }
  return Object.freeze({
    ok: true,
    reason: snapshot.revision === state.server.revision ? "idempotent-reconcile" : "reconciled",
    state: freezeDeep(next),
    changed: JSON.stringify(next) !== JSON.stringify(state),
  });
}

export function setLocalRadarReceipt(state, {
  eventId, versionId, status, now = new Date().toISOString(),
} = {}) {
  if (!validateLocalRadarState(state).ok) {
    return Object.freeze({ ok: false, reason: "state-invalid", state, changed: false });
  }
  const receipt = { eventId: text(eventId), versionId: text(versionId), status, updatedAt: now };
  if (validateReceipt(receipt).length) {
    return Object.freeze({ ok: false, reason: "receipt-invalid", state, changed: false });
  }
  const key = `${receipt.eventId}|${receipt.versionId}`;
  const existing = state.receipts.find((entry) => `${entry.eventId}|${entry.versionId}` === key);
  if (!existing && state.receipts.length >= LOCAL_RADAR_MAX_RECEIPTS) {
    return Object.freeze({ ok: false, reason: "receipt-limit", state, changed: false });
  }
  const next = clone(state);
  next.receipts = existing
    ? next.receipts.map((entry) => `${entry.eventId}|${entry.versionId}` === key ? receipt : entry)
    : [...next.receipts, receipt];
  return Object.freeze({ ok: true, reason: existing ? "updated" : "created", state: freezeDeep(next), changed: true });
}

function withAccountPilot(state) {
  if (!validateLocalRadarState(state).ok || state.authority !== "account-cache") return null;
  if (state.pilot) return clone(state);
  const next = clone(state);
  next.pilot = clone(createEmptyAccountRadarPilot());
  return next;
}

export function queueAccountRadarPilotReceipt(state, {
  eventId, eventVersionId, status, now = new Date().toISOString(),
} = {}) {
  const next = withAccountPilot(state);
  const entry = {
    eventId: text(eventId), eventVersionId: text(eventVersionId), status,
    state: "pending", createdAt: now, reason: null,
  };
  if (!next || validatePilotReceiptOutbox(entry).length) {
    return Object.freeze({ ok: false, reason: "pilot-receipt-invalid", state, changed: false });
  }
  const knownEvent = next.pilot.events.some((event) => (
    event.eventId === entry.eventId && event.eventVersionId === entry.eventVersionId
  ));
  if (!knownEvent) return Object.freeze({ ok: false, reason: "pilot-event-not-found", state, changed: false });
  const existing = next.pilot.receiptOutbox.find((item) => item.eventVersionId === entry.eventVersionId);
  next.pilot.receiptOutbox = existing
    ? next.pilot.receiptOutbox.map((item) => item.eventVersionId === entry.eventVersionId ? entry : item)
    : [...next.pilot.receiptOutbox, entry];
  const checked = validateLocalRadarState(next);
  if (!checked.ok) return Object.freeze({ ok: false, reason: "pilot-receipt-result-invalid", state, changed: false });
  return Object.freeze({ ok: true, reason: "queued", state: freezeDeep(next), changed: true });
}

export function queueAccountRadarPilotImport(state, {
  operationId, payload, now = new Date().toISOString(),
} = {}) {
  const next = withAccountPilot(state);
  const entry = {
    operationId: text(operationId), payload: clone(payload), status: "pending", createdAt: now, reason: null,
  };
  if (!next || next.pilot.radarReview !== true || validatePilotImportOutbox(entry).length) {
    return Object.freeze({ ok: false, reason: "pilot-import-invalid", state, changed: false });
  }
  const existing = next.pilot.importOutbox.find((item) => item.operationId === entry.operationId);
  if (existing) {
    const same = JSON.stringify(existing) === JSON.stringify(entry);
    return Object.freeze({ ok: same, reason: same ? "idempotent" : "operation-id-conflict", state, changed: false });
  }
  next.pilot.importOutbox.push(entry);
  const checked = validateLocalRadarState(next);
  if (!checked.ok) return Object.freeze({ ok: false, reason: "pilot-import-result-invalid", state, changed: false });
  return Object.freeze({ ok: true, reason: "queued", state: freezeDeep(next), changed: true });
}

function rejectionReason(reason) {
  const normalized = text(reason).slice(0, 120);
  return normalized || "pilot-request-rejected";
}

export function rejectAccountRadarPilotReceipt(state, eventVersionId, reason) {
  const next = withAccountPilot(state);
  if (!next) return Object.freeze({ ok: false, reason: "account-cache-required", state, changed: false });
  const id = text(eventVersionId);
  if (!next.pilot.receiptOutbox.some((entry) => entry.eventVersionId === id)) {
    return Object.freeze({ ok: false, reason: "pilot-receipt-not-found", state, changed: false });
  }
  next.pilot.receiptOutbox = next.pilot.receiptOutbox.map((entry) => entry.eventVersionId === id
    ? { ...entry, state: "rejected", reason: rejectionReason(reason) }
    : entry);
  return Object.freeze({ ok: true, reason: "rejected", state: freezeDeep(next), changed: true });
}

export function rejectAccountRadarPilotImport(state, operationId, reason) {
  const next = withAccountPilot(state);
  if (!next) return Object.freeze({ ok: false, reason: "account-cache-required", state, changed: false });
  const id = text(operationId);
  if (!next.pilot.importOutbox.some((entry) => entry.operationId === id)) {
    return Object.freeze({ ok: false, reason: "pilot-import-not-found", state, changed: false });
  }
  next.pilot.importOutbox = next.pilot.importOutbox.map((entry) => entry.operationId === id
    ? { ...entry, status: "rejected", reason: rejectionReason(reason) }
    : entry);
  return Object.freeze({ ok: true, reason: "rejected", state: freezeDeep(next), changed: true });
}

export function acknowledgeAccountRadarPilotSubscription(state, operationId, ack) {
  const next = withAccountPilot(state);
  const checked = validateRadarPilotSubscriptionAck(ack);
  const id = text(operationId);
  const pending = next?.outbox.find((entry) => entry.operationId === id && entry.status === "pending");
  const expectedStatus = pending?.action === "remove" ? "removed" : pending?.action === "pause" ? "paused" : "active";
  if (!next || !checked.ok || !pending || ack.operationId !== id || ack.targetId !== pending.targetId
      || ack.status !== expectedStatus || ack.revision < state.server.revision
      || (ack.revision === state.server.revision && state.server.checksum !== ack.checksum)) {
    return Object.freeze({ ok: false, reason: "pilot-subscription-ack-invalid", state, changed: false });
  }
  next.outbox = next.outbox.filter((entry) => entry.operationId !== id);
  next.server = { revision: ack.revision, checksum: ack.checksum, reconciledAt: state.server.reconciledAt };
  if (pending.targetType === "person") {
    const identityKey = createPersonIdentityKey({
      personExternalId: pending.personExternalId,
      role: pending.personRole,
    });
    next.personSubscriptions = next.personSubscriptions.filter((entry) => (
      createPersonIdentityKey(entry) !== identityKey
    ));
    if (ack.status !== "removed") {
      next.personSubscriptions.push({
        personExternalId: pending.personExternalId,
        name: pending.title,
        role: pending.personRole,
        status: ack.status,
        authority: "server",
        serverRevision: ack.revision,
        serverChecksum: ack.checksum,
        updatedAt: normalizedInstant(pending.createdAt),
      });
      next.personSubscriptions.sort((a, b) => createPersonIdentityKey(a).localeCompare(createPersonIdentityKey(b)));
    } else {
      next.personResults = next.personResults.filter((entry) => createPersonIdentityKey(entry) !== identityKey);
    }
  }
  next.pilot.status = "ready";
  const stateCheck = validateLocalRadarState(next);
  if (!stateCheck.ok) return Object.freeze({ ok: false, reason: "pilot-subscription-result-invalid", state, changed: false });
  return Object.freeze({ ok: true, reason: "acknowledged", state: freezeDeep(next), changed: true });
}

export function acknowledgeAccountRadarPilotReceipt(state, eventVersionId, now = new Date().toISOString()) {
  const next = withAccountPilot(state);
  const id = text(eventVersionId);
  const pending = next?.pilot.receiptOutbox.find((entry) => entry.eventVersionId === id && entry.state === "pending");
  if (!next || !pending || !validInstant(now)) {
    return Object.freeze({ ok: false, reason: "pilot-receipt-ack-invalid", state, changed: false });
  }
  next.pilot.receiptOutbox = next.pilot.receiptOutbox.filter((entry) => entry.eventVersionId !== id);
  const visible = { eventId: pending.eventId, versionId: id, status: pending.status, updatedAt: now };
  const existing = next.receipts.some((entry) => entry.versionId === id);
  next.receipts = existing
    ? next.receipts.map((entry) => entry.versionId === id ? visible : entry)
    : [...next.receipts, visible];
  next.pilot.serverReceipts = next.pilot.serverReceipts.filter((entry) => entry.eventVersionId !== id);
  next.pilot.serverReceipts.push({ eventVersionId: id, status: pending.status, updatedAt: now });
  next.pilot.status = "ready";
  const stateCheck = validateLocalRadarState(next);
  if (!stateCheck.ok) return Object.freeze({ ok: false, reason: "pilot-receipt-result-invalid", state, changed: false });
  return Object.freeze({ ok: true, reason: "acknowledged", state: freezeDeep(next), changed: true });
}

export function acknowledgeAccountRadarPilotImport(state, operationId, response) {
  const next = withAccountPilot(state);
  const id = text(operationId);
  const pending = next?.pilot.importOutbox.find((entry) => entry.operationId === id && entry.status === "pending");
  const checked = validateRadarPilotImportResult(response);
  if (!next || !pending || !checked.ok || response.targetId !== pending.payload.targetKey
      || response.eventType !== pending.payload.eventType || response.date !== pending.payload.date
      || response.region !== pending.payload.region || response.platform !== pending.payload.platform) {
    return Object.freeze({ ok: false, reason: "pilot-import-ack-invalid", state, changed: false });
  }
  next.pilot.importOutbox = next.pilot.importOutbox.filter((entry) => entry.operationId !== id);
  next.pilot.status = "ready";
  const stateCheck = validateLocalRadarState(next);
  if (!stateCheck.ok) return Object.freeze({ ok: false, reason: "pilot-import-result-invalid", state, changed: false });
  return Object.freeze({ ok: true, reason: "acknowledged", state: freezeDeep(next), changed: true });
}

export function markAccountRadarPilotUnavailable(state) {
  const next = withAccountPilot(state);
  if (!next) return Object.freeze({ ok: false, reason: "account-cache-required", state, changed: false });
  next.pilot.status = "pilot-unavailable";
  return Object.freeze({ ok: true, reason: "pilot-unavailable", state: freezeDeep(next), changed: true });
}

export function reconcileAccountRadarPilotFeed(state, feed) {
  const next = withAccountPilot(state);
  const checked = validateRadarPilotFeed(feed);
  if (!next || !checked.ok) {
    return Object.freeze({ ok: false, reason: next ? "pilot-feed-invalid" : "account-cache-required", state, changed: false, errors: checked.errors });
  }
  if (feed.revision < state.server.revision) {
    return Object.freeze({ ok: false, reason: "pilot-feed-stale", state, changed: false });
  }
  if (feed.revision === state.server.revision && state.server.checksum !== feed.checksum) {
    return Object.freeze({ ok: false, reason: "pilot-feed-revision-conflict", state, changed: false });
  }
  for (const ack of feed.operationAcks) {
    const pending = state.outbox.find((entry) => (
      entry.operationId === ack.operationId && entry.status === "pending"
    ));
    if (!pending) {
      return Object.freeze({ ok: false, reason: "pilot-feed-ack-conflict", state, changed: false });
    }
    const expectedStatus = pending.action === "remove" ? "removed" : pending.action === "pause" ? "paused" : "active";
    if (ack.targetId !== pending.targetId || ack.status !== expectedStatus || ack.revision > feed.revision) {
      return Object.freeze({ ok: false, reason: "pilot-feed-ack-conflict", state, changed: false });
    }
  }
  const acknowledged = new Set(feed.operationAcks.map((entry) => entry.operationId));
  next.subscriptions = feed.subscriptions.filter((entry) => entry.targetType !== "person").map((entry) => ({
    targetId: entry.targetId,
    targetType: entry.targetType,
    title: entry.title,
    region: entry.region,
    scope: entry.scope,
    status: entry.status,
    authority: "server",
    serverRevision: feed.revision,
    serverChecksum: feed.checksum,
    updatedAt: normalizedInstant(entry.updatedAt),
  })).sort((a, b) => a.targetId.localeCompare(b.targetId));
  next.personSubscriptions = feed.subscriptions.filter((entry) => entry.targetType === "person").map((entry) => ({
    personExternalId: entry.personExternalId,
    name: entry.title,
    role: entry.personRole,
    status: entry.status,
    authority: "server",
    serverRevision: feed.revision,
    serverChecksum: feed.checksum,
    updatedAt: normalizedInstant(entry.updatedAt),
  })).sort((a, b) => createPersonIdentityKey(a).localeCompare(createPersonIdentityKey(b)));
  const activePersonKeys = new Set(next.personSubscriptions.map((entry) => createPersonIdentityKey(entry)));
  next.personResults = next.personResults.filter((entry) => activePersonKeys.has(createPersonIdentityKey(entry)));
  next.outbox = next.outbox.filter((entry) => !acknowledged.has(entry.operationId));
  const priorPilotVersions = new Set(next.pilot.events.map((entry) => entry.eventVersionId));
  const eventsByVersion = new Map(feed.events.map((entry) => [entry.eventVersionId, entry]));
  next.receipts = next.receipts.filter((entry) => !priorPilotVersions.has(entry.versionId));
  for (const receipt of feed.receipts) {
    const matchingEvent = eventsByVersion.get(receipt.eventVersionId);
    if (!matchingEvent) continue;
    next.receipts.push({
      eventId: matchingEvent.eventId,
      versionId: receipt.eventVersionId,
      status: receipt.status,
      updatedAt: normalizedInstant(receipt.updatedAt),
    });
  }
  const confirmedReceiptKeys = new Set(feed.receipts.map((entry) => `${entry.eventVersionId}|${entry.status}`));
  next.pilot.receiptOutbox = next.pilot.receiptOutbox.filter((entry) => (
    !confirmedReceiptKeys.has(`${entry.eventVersionId}|${entry.status}`)
  ));
  next.pilot.events = clone(feed.events);
  next.pilot.serverReceipts = feed.receipts.map((entry) => ({
    ...entry,
    updatedAt: normalizedInstant(entry.updatedAt),
  }));
  next.pilot.radarReview = feed.radarReview;
  next.pilot.status = "ready";
  next.server = {
    revision: feed.revision,
    checksum: feed.checksum,
    reconciledAt: normalizedInstant(feed.reconciledAt),
  };
  const stateCheck = validateLocalRadarState(next);
  if (!stateCheck.ok) {
    return Object.freeze({ ok: false, reason: "pilot-feed-result-invalid", state, changed: false, errors: stateCheck.errors });
  }
  return Object.freeze({
    ok: true,
    reason: feed.revision === state.server.revision ? "idempotent-reconcile" : "reconciled",
    state: freezeDeep(next),
    changed: JSON.stringify(next) !== JSON.stringify(state),
  });
}

export function createEmptyLocalEventLedger() {
  return freezeDeep({
    format: LOCAL_EVENT_LEDGER_FORMAT,
    version: LOCAL_EVENT_LEDGER_VERSION,
    targets: [],
    events: [],
    versions: [],
  });
}

export function validateLocalEventLedger(ledger) {
  const errors = [];
  if (!exactKeys(ledger, ["format", "version", "targets", "events", "versions"])) {
    return result(["ledger-shape-invalid"]);
  }
  if (ledger.format !== LOCAL_EVENT_LEDGER_FORMAT) errors.push("ledger-format-invalid");
  if (ledger.version !== LOCAL_EVENT_LEDGER_VERSION) errors.push("ledger-version-invalid");
  if (!Array.isArray(ledger.targets) || !Array.isArray(ledger.events) || !Array.isArray(ledger.versions)) {
    return result([...errors, "ledger-collections-invalid"]);
  }
  const targets = new Map();
  for (const target of ledger.targets) {
    if (!exactKeys(target, ["targetId", "targetType", "title", "targetStatus", "canonical"])) {
      errors.push("ledger-target-shape-invalid");
      continue;
    }
    if (!validateRadarTarget(target, { allowFixture: true }).ok) errors.push("ledger-target-invalid");
    if (targets.has(target.targetId)) errors.push("ledger-target-duplicate");
    targets.set(target.targetId, target);
  }
  const events = new Map();
  for (const event of ledger.events) {
    const keys = [
      "eventId", "targetId", "eventType", "region", "platform", "lifecycleStatus",
      "currentCandidateVersionId", "currentConfirmedVersionId",
    ];
    if (!exactKeys(event, keys)) { errors.push("ledger-event-shape-invalid"); continue; }
    if (!isRadarEventIdentity(event.eventId)) errors.push("ledger-event-id-invalid");
    if (!targets.has(event.targetId)) errors.push("ledger-event-target-missing");
    if (!RADAR_EVENT_TYPES.includes(event.eventType)) errors.push("ledger-event-type-invalid");
    if (event.region !== RADAR_DEFAULT_REGION) errors.push("ledger-event-region-invalid");
    if (!RADAR_LIFECYCLE_STATUSES.includes(event.lifecycleStatus)) errors.push("ledger-event-lifecycle-invalid");
    if (event.eventId !== createRadarEventIdentity({
      canonicalWorkId: event.targetId,
      eventType: event.eventType,
      region: event.region,
      platform: event.platform,
    })) errors.push("ledger-event-identity-mismatch");
    for (const pointer of [event.currentCandidateVersionId, event.currentConfirmedVersionId]) {
      if (pointer !== null && !isStableContractId(pointer)) errors.push("ledger-event-pointer-invalid");
    }
    if (events.has(event.eventId)) errors.push("ledger-event-duplicate");
    events.set(event.eventId, event);
  }
  const versions = new Map();
  for (const version of ledger.versions) {
    const keys = [
      "versionId", "eventId", "date", "verificationStatus", "evidenceIds",
      "sourceFamilies", "history",
    ];
    if (!exactKeys(version, keys)) { errors.push("ledger-version-shape-invalid"); continue; }
    if (!isStableContractId(version.versionId)) errors.push("ledger-version-id-invalid");
    if (!events.has(version.eventId)) errors.push("ledger-version-event-missing");
    if (!validDay(version.date)) errors.push("ledger-version-date-invalid");
    if (!RADAR_VERIFICATION_STATUSES.includes(version.verificationStatus)) errors.push("ledger-version-status-invalid");
    const evidenceIdsValid = Array.isArray(version.evidenceIds);
    const sourceFamiliesValid = Array.isArray(version.sourceFamilies);
    if (!evidenceIdsValid
        || version.evidenceIds.some((id) => !isStableContractId(id))
        || new Set(version.evidenceIds).size !== version.evidenceIds.length) {
      errors.push("ledger-version-evidence-invalid");
    }
    if (!sourceFamiliesValid
        || version.sourceFamilies.some((id) => !isStableContractId(id))
        || new Set(version.sourceFamilies).size !== version.sourceFamilies.length) {
      errors.push("ledger-version-source-families-invalid");
    }
    if (!Array.isArray(version.history) || version.history[0] !== "candidate"
        || version.history.some((status) => !RADAR_VERIFICATION_STATUSES.includes(status))
        || version.history.at(-1) !== version.verificationStatus
        || version.history.slice(1).includes("candidate")
        || version.history.some((status, index) => index > 0 && status === version.history[index - 1])
        || (version.history.includes("confirmed") && version.verificationStatus !== "confirmed")) {
      errors.push("ledger-version-history-invalid");
    }
    if (version.verificationStatus === "confirmed"
        && (!evidenceIdsValid || !sourceFamiliesValid
          || version.evidenceIds.length < 2 || version.sourceFamilies.length < 2)) {
      errors.push("ledger-version-confirmation-insufficient");
    }
    if (version.verificationStatus === "corroborated"
        && (!evidenceIdsValid || !sourceFamiliesValid
          || version.evidenceIds.length < 1 || version.sourceFamilies.length < 1)) {
      errors.push("ledger-version-corroboration-insufficient");
    }
    if (evidenceIdsValid && sourceFamiliesValid && version.sourceFamilies.length > version.evidenceIds.length) {
      errors.push("ledger-version-source-family-count-invalid");
    }
    if (versions.has(version.versionId)) errors.push("ledger-version-duplicate");
    versions.set(version.versionId, version);
  }
  for (const event of ledger.events) {
    const candidate = event.currentCandidateVersionId == null ? null : versions.get(event.currentCandidateVersionId);
    const confirmed = event.currentConfirmedVersionId == null ? null : versions.get(event.currentConfirmedVersionId);
    if (event.currentCandidateVersionId != null && (!candidate || candidate.eventId !== event.eventId)) {
      errors.push("ledger-candidate-pointer-broken");
    }
    if (event.currentConfirmedVersionId != null && (
      !confirmed || confirmed.eventId !== event.eventId || confirmed.verificationStatus !== "confirmed"
    )) errors.push("ledger-confirmed-pointer-broken");
    if (event.currentConfirmedVersionId == null
        && ledger.versions.some((version) => version.eventId === event.eventId && version.verificationStatus === "confirmed")) {
      errors.push("ledger-confirmed-pointer-missing");
    }
  }
  return result(errors);
}

export function stageLocalEventCandidate(ledger, {
  target, eventType, date, region = RADAR_DEFAULT_REGION, platform = "-",
  versionId, lifecycleStatus = "scheduled",
} = {}) {
  if (!validateLocalEventLedger(ledger).ok) {
    return Object.freeze({ ok: false, reason: "ledger-invalid", ledger, changed: false });
  }
  const targetCheck = validateRadarTarget(target, { allowFixture: true });
  const eventId = createRadarEventIdentity({ canonicalWorkId: target?.targetId, eventType, region, platform });
  if (!targetCheck.ok || target.targetStatus !== "active" || target.canonical !== true
      || !eventId || !isStableContractId(versionId) || !validDay(date)
      || !RADAR_LIFECYCLE_STATUSES.includes(lifecycleStatus)) {
    return Object.freeze({ ok: false, reason: "event-candidate-invalid", ledger, changed: false });
  }
  const existingTarget = ledger.targets.find((entry) => entry.targetId === target.targetId);
  if (existingTarget && (existingTarget.targetType !== target.targetType || existingTarget.title !== target.title)) {
    return Object.freeze({ ok: false, reason: "target-conflict", ledger, changed: false });
  }
  const existingVersion = ledger.versions.find((entry) => entry.versionId === versionId);
  const version = {
    versionId: text(versionId), eventId, date, verificationStatus: "candidate",
    evidenceIds: [], sourceFamilies: [], history: ["candidate"],
  };
  if (existingVersion) {
    const same = JSON.stringify(existingVersion) === JSON.stringify(version);
    return Object.freeze({ ok: same, reason: same ? "idempotent" : "version-id-conflict", ledger, changed: false, eventId });
  }

  const next = clone(ledger);
  if (!existingTarget) {
    next.targets.push({
      targetId: target.targetId, targetType: target.targetType, title: target.title,
      targetStatus: target.targetStatus, canonical: true,
    });
  }
  const existingEvent = next.events.find((entry) => entry.eventId === eventId);
  if (existingEvent) {
    existingEvent.currentCandidateVersionId = version.versionId;
  } else {
    next.events.push({
      eventId, targetId: target.targetId, eventType, region, platform,
      lifecycleStatus, currentCandidateVersionId: version.versionId,
      currentConfirmedVersionId: null,
    });
  }
  next.versions.push(version);
  const nextCheck = validateLocalEventLedger(next);
  if (!nextCheck.ok) {
    return Object.freeze({ ok: false, reason: "ledger-result-invalid", ledger, changed: false, errors: nextCheck.errors });
  }
  return Object.freeze({ ok: true, reason: "staged", ledger: freezeDeep(next), changed: true, eventId, versionId: version.versionId });
}

export function applyLocalEvidenceDecision(ledger, {
  eventId, versionId, verificationStatus, evidenceIds = [], independentSourceFamilies = [],
} = {}) {
  if (!validateLocalEventLedger(ledger).ok
      || !RADAR_VERIFICATION_STATUSES.includes(verificationStatus)
      || (!isStableContractId(eventId) && !isRadarEventIdentity(eventId)) || !isStableContractId(versionId)
      || !Array.isArray(evidenceIds) || evidenceIds.some((id) => !isStableContractId(id))
      || new Set(evidenceIds).size !== evidenceIds.length
      || !Array.isArray(independentSourceFamilies)
      || independentSourceFamilies.some((id) => !isStableContractId(id))
      || new Set(independentSourceFamilies).size !== independentSourceFamilies.length
      || independentSourceFamilies.length > evidenceIds.length) {
    return Object.freeze({ ok: false, reason: "evidence-decision-invalid", ledger, changed: false });
  }
  const event = ledger.events?.find((entry) => entry.eventId === eventId);
  const version = ledger.versions?.find((entry) => entry.versionId === versionId && entry.eventId === eventId);
  if (!event || !version) return Object.freeze({ ok: false, reason: "event-version-not-found", ledger, changed: false });
  if (verificationStatus === "confirmed" && (evidenceIds.length < 2 || independentSourceFamilies.length < 2)) {
    return Object.freeze({ ok: false, reason: "confirmation-evidence-insufficient", ledger, changed: false });
  }
  if (verificationStatus === "corroborated" && (evidenceIds.length < 1 || independentSourceFamilies.length < 1)) {
    return Object.freeze({ ok: false, reason: "corroboration-evidence-insufficient", ledger, changed: false });
  }
  if (version.verificationStatus === "confirmed" && verificationStatus !== "confirmed") {
    return Object.freeze({ ok: false, reason: "confirmed-version-immutable", ledger, changed: false });
  }
  const normalizedEvidence = [...evidenceIds].sort();
  const normalizedFamilies = [...independentSourceFamilies].sort();
  if (version.verificationStatus === verificationStatus
      && JSON.stringify(version.evidenceIds) === JSON.stringify(normalizedEvidence)
      && JSON.stringify(version.sourceFamilies) === JSON.stringify(normalizedFamilies)) {
    return Object.freeze({ ok: true, reason: "idempotent", ledger, changed: false });
  }
  const next = clone(ledger);
  const nextVersion = next.versions.find((entry) => entry.versionId === versionId);
  nextVersion.verificationStatus = verificationStatus;
  nextVersion.evidenceIds = normalizedEvidence;
  nextVersion.sourceFamilies = normalizedFamilies;
  nextVersion.history = [...nextVersion.history, verificationStatus].filter((entry, index, all) => index === 0 || entry !== all[index - 1]);
  const nextEvent = next.events.find((entry) => entry.eventId === eventId);
  if (verificationStatus === "confirmed") nextEvent.currentConfirmedVersionId = versionId;
  const nextCheck = validateLocalEventLedger(next);
  if (!nextCheck.ok) {
    return Object.freeze({ ok: false, reason: "ledger-result-invalid", ledger, changed: false, errors: nextCheck.errors });
  }
  return Object.freeze({ ok: true, reason: "decision-applied", ledger: freezeDeep(next), changed: true });
}

export function projectLocalRadarWeek({ state, ledger, startDate } = {}) {
  if (!validateLocalRadarState(state).ok || !validateLocalEventLedger(ledger).ok) return Object.freeze([]);
  const start = dayNumber(startDate);
  if (start == null) return Object.freeze([]);
  const activeTargets = new Set(state.subscriptions.filter((entry) => entry.status === "active").map((entry) => entry.targetId));
  const receipts = new Map(state.receipts.map((entry) => [`${entry.eventId}|${entry.versionId}`, entry.status]));
  const targets = new Map(ledger.targets.map((entry) => [entry.targetId, entry]));
  const versions = new Map(ledger.versions.map((entry) => [entry.versionId, entry]));
  const rows = [];
  for (const event of ledger.events) {
    if (!activeTargets.has(event.targetId) || event.lifecycleStatus === "retracted" || !event.currentConfirmedVersionId) continue;
    const version = versions.get(event.currentConfirmedVersionId);
    if (!version || version.verificationStatus !== "confirmed") continue;
    const day = dayNumber(version.date);
    if (day == null || day < start || day > start + 6) continue;
    const receiptStatus = receipts.get(`${event.eventId}|${version.versionId}`) || "new";
    if (receiptStatus === "dismissed" && state.display.showDismissed !== true) continue;
    rows.push(freezeDeep({
      eventId: event.eventId,
      versionId: version.versionId,
      targetId: event.targetId,
      targetType: targets.get(event.targetId)?.targetType || null,
      title: targets.get(event.targetId)?.title || "",
      eventType: event.eventType,
      date: version.date,
      region: event.region,
      platform: event.platform,
      receiptStatus,
      readOnly: true,
      createsReminder: false,
      createsCalendarEntry: false,
    }));
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "de"));
  return Object.freeze(rows);
}

export function createLocalWeekAcceptanceDraft(row) {
  if (!plain(row) || (!isStableContractId(row.eventId) && !isRadarEventIdentity(row.eventId)) || !isStableContractId(row.versionId)
      || !validDay(row.date) || row.readOnly !== true) return null;
  return freezeDeep({
    eventId: row.eventId,
    eventVersionId: row.versionId,
    requiresConfirmation: true,
    reminderCreated: false,
    calendarWritten: false,
  });
}

export function createLocalEventRadarStore({ storage = store, key = K.radar, authority = "guest" } = {}) {
  return Object.freeze({
    async load() {
      const row = await storage.get(key);
      return decodeLocalRadar(row?.value ?? null, { authority });
    },
    async save(state) {
      const checked = validateLocalRadarState(state);
      if (!checked.ok) return Object.freeze({ ok: false, reason: "state-invalid", errors: checked.errors });
      if (state.authority !== authority) {
        return Object.freeze({ ok: false, reason: "authority-mismatch", errors: Object.freeze(["radar-authority-mismatch"]) });
      }
      const serialized = JSON.stringify(state);
      if (byteLength(serialized) > LOCAL_RADAR_MAX_BYTES) return Object.freeze({ ok: false, reason: "state-too-large", errors: Object.freeze([]) });
      await storage.set(key, serialized);
      const readback = await storage.get(key);
      if (readback?.value !== serialized) return Object.freeze({ ok: false, reason: "write-not-confirmed", errors: Object.freeze([]) });
      return Object.freeze({ ok: true, state: freezeDeep(clone(state)) });
    },
  });
}
