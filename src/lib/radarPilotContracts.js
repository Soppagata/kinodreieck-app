/* E16A1 ist die einzige Quelle dieser Browserverträge. Dieses Modul validiert
   ausschließlich die vier capability-geschützten Pilot-RPCs; es kennt weder
   Settings-/Proposal-Schalter noch Provider-, Share- oder Schedulerpfade. */

import {
  RADAR_DEFAULT_REGION, RADAR_EVENT_TYPES, RADAR_LIFECYCLE_STATUSES,
  RADAR_RECEIPT_STATUSES, RADAR_SCOPES, RADAR_TARGET_TYPES,
  RADAR_VERIFICATION_STATUSES,
} from "./radarContracts.js";

export const RADAR_PILOT_FEED_FORMAT = "kd-radar-pilot-feed-v1";
export const RADAR_PILOT_SUBSCRIPTION_ACK_KEYS = Object.freeze([
  "operationId", "targetId", "status", "revision", "checksum",
]);
export const RADAR_PILOT_IMPORT_ROOT_KEYS = Object.freeze([
  "targetKey", "eventType", "date", "region", "platform", "evidence",
]);
export const RADAR_PILOT_EVIDENCE_KEYS = Object.freeze(["sourceId", "url", "retrievedAt"]);
export const RADAR_PILOT_IMPORT_RESULT_KEYS = Object.freeze([
  "eventId", "eventVersionId", "targetId", "eventType", "date", "region", "platform",
]);
export const RADAR_PILOT_FEED_KEYS = Object.freeze([
  "format", "revision", "checksum", "reconciledAt", "subscriptions", "events",
  "receipts", "operationAcks", "radarReview",
]);
export const RADAR_PILOT_SUBSCRIPTION_KEYS = Object.freeze([
  "targetId", "targetType", "title", "region", "scope", "status", "updatedAt",
]);
export const RADAR_PILOT_EVENT_KEYS = Object.freeze([
  "eventId", "eventVersionId", "targetId", "eventType", "date", "region", "platform",
  "lifecycleStatus", "verificationStatus",
]);
export const RADAR_PILOT_RECEIPT_KEYS = Object.freeze(["eventVersionId", "status", "updatedAt"]);

const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKSUM_FORM = /^[a-f0-9]{64}$/;

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) {
  if (!plain(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function validUuid(value) { return UUID_FORM.test(text(value)); }
function validTargetKey(value) {
  const normalized = text(value);
  return normalized.length >= 3 && normalized.length <= 160;
}
function validTitle(value) {
  const normalized = text(value);
  return normalized.length >= 1 && normalized.length <= 200;
}
function validInstant(value) {
  const normalized = text(value);
  return !!normalized && Number.isFinite(Date.parse(normalized));
}
function validDay(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const millis = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === normalized;
}
function validChecksum(revision, checksum) {
  return revision === 0 ? checksum === null : CHECKSUM_FORM.test(text(checksum));
}
function validPlatform(eventType, platform) {
  const normalized = text(platform);
  return eventType === "streamingstart_at" ? !!normalized && normalized !== "-" : platform === "-";
}
function result(errors) {
  const unique = Object.freeze([...new Set(errors)]);
  return Object.freeze({ ok: unique.length === 0, errors: unique });
}

export function validateRadarPilotSubscriptionAck(value) {
  const errors = [];
  if (!exactKeys(value, RADAR_PILOT_SUBSCRIPTION_ACK_KEYS)) return result(["subscription-ack-shape-invalid"]);
  if (!validUuid(value.operationId)) errors.push("subscription-ack-operation-invalid");
  if (!validTargetKey(value.targetId)) errors.push("subscription-ack-target-invalid");
  if (!["active", "paused", "removed"].includes(value.status)) errors.push("subscription-ack-status-invalid");
  if (!Number.isInteger(value.revision) || value.revision <= 0) errors.push("subscription-ack-revision-invalid");
  if (!CHECKSUM_FORM.test(text(value.checksum))) errors.push("subscription-ack-checksum-invalid");
  return result(errors);
}

function validateImportFields(value, targetField) {
  const errors = [];
  if (!validTargetKey(value[targetField])) errors.push("import-target-invalid");
  if (!RADAR_EVENT_TYPES.includes(value.eventType)) errors.push("import-event-type-invalid");
  if (!validDay(value.date)) errors.push("import-date-invalid");
  if (value.region !== RADAR_DEFAULT_REGION) errors.push("import-region-invalid");
  if (!validPlatform(value.eventType, value.platform)) errors.push("import-platform-invalid");
  return errors;
}

export function validateRadarPilotImportPayload(value) {
  if (!exactKeys(value, RADAR_PILOT_IMPORT_ROOT_KEYS)) return result(["import-payload-shape-invalid"]);
  const errors = validateImportFields(value, "targetKey");
  if (!Array.isArray(value.evidence) || value.evidence.length !== 2) {
    errors.push("import-evidence-invalid");
  } else {
    const sourceIds = new Set();
    for (const evidence of value.evidence) {
      if (!exactKeys(evidence, RADAR_PILOT_EVIDENCE_KEYS)) {
        errors.push("import-evidence-shape-invalid");
        continue;
      }
      if (!text(evidence.sourceId) || text(evidence.sourceId).length > 128) errors.push("import-source-invalid");
      if (!text(evidence.url)) errors.push("import-url-invalid");
      if (!validInstant(evidence.retrievedAt)) errors.push("import-retrieved-at-invalid");
      sourceIds.add(text(evidence.sourceId));
    }
    if (sourceIds.size !== 2) errors.push("import-sources-not-independent");
  }
  return result(errors);
}

export function validateRadarPilotImportResult(value) {
  if (!exactKeys(value, RADAR_PILOT_IMPORT_RESULT_KEYS)) return result(["import-result-shape-invalid"]);
  const errors = validateImportFields(value, "targetId");
  if (!validUuid(value.eventId)) errors.push("import-result-event-invalid");
  if (!validUuid(value.eventVersionId)) errors.push("import-result-version-invalid");
  return result(errors);
}

function validateSubscription(value) {
  const errors = [];
  if (!exactKeys(value, RADAR_PILOT_SUBSCRIPTION_KEYS)) return ["feed-subscription-shape-invalid"];
  if (!validTargetKey(value.targetId)) errors.push("feed-subscription-target-invalid");
  if (!RADAR_TARGET_TYPES.includes(value.targetType)) errors.push("feed-subscription-type-invalid");
  if (!validTitle(value.title)) errors.push("feed-subscription-title-invalid");
  if (value.region !== RADAR_DEFAULT_REGION) errors.push("feed-subscription-region-invalid");
  if (!RADAR_SCOPES.includes(value.scope)) errors.push("feed-subscription-scope-invalid");
  if (!["active", "paused"].includes(value.status)) errors.push("feed-subscription-status-invalid");
  if (!validInstant(value.updatedAt)) errors.push("feed-subscription-time-invalid");
  return errors;
}

export function validateRadarPilotEvent(value) {
  const errors = [];
  if (!exactKeys(value, RADAR_PILOT_EVENT_KEYS)) return result(["feed-event-shape-invalid"]);
  if (!validUuid(value.eventId)) errors.push("feed-event-id-invalid");
  if (!validUuid(value.eventVersionId)) errors.push("feed-event-version-invalid");
  if (!validTargetKey(value.targetId)) errors.push("feed-event-target-invalid");
  if (!RADAR_EVENT_TYPES.includes(value.eventType)) errors.push("feed-event-type-invalid");
  if (!validDay(value.date)) errors.push("feed-event-date-invalid");
  if (value.region !== RADAR_DEFAULT_REGION) errors.push("feed-event-region-invalid");
  if (!validPlatform(value.eventType, value.platform)) errors.push("feed-event-platform-invalid");
  if (!RADAR_LIFECYCLE_STATUSES.includes(value.lifecycleStatus) || value.lifecycleStatus === "retracted") {
    errors.push("feed-event-lifecycle-invalid");
  }
  if (!RADAR_VERIFICATION_STATUSES.includes(value.verificationStatus) || value.verificationStatus !== "confirmed") {
    errors.push("feed-event-verification-invalid");
  }
  return result(errors);
}

function validateReceipt(value) {
  const errors = [];
  if (!exactKeys(value, RADAR_PILOT_RECEIPT_KEYS)) return ["feed-receipt-shape-invalid"];
  if (!validUuid(value.eventVersionId)) errors.push("feed-receipt-version-invalid");
  if (!RADAR_RECEIPT_STATUSES.includes(value.status)) errors.push("feed-receipt-status-invalid");
  if (!validInstant(value.updatedAt)) errors.push("feed-receipt-time-invalid");
  return errors;
}

export function validateRadarPilotFeed(value) {
  if (!exactKeys(value, RADAR_PILOT_FEED_KEYS)) return result(["feed-shape-invalid"]);
  const errors = [];
  if (value.format !== RADAR_PILOT_FEED_FORMAT) errors.push("feed-format-invalid");
  if (!Number.isInteger(value.revision) || value.revision < 0) errors.push("feed-revision-invalid");
  if (!validChecksum(value.revision, value.checksum)) errors.push("feed-checksum-invalid");
  if (!validInstant(value.reconciledAt)) errors.push("feed-time-invalid");
  if (typeof value.radarReview !== "boolean") errors.push("feed-review-invalid");
  if (!Array.isArray(value.subscriptions)) errors.push("feed-subscriptions-invalid");
  else {
    const seen = new Set();
    for (const entry of value.subscriptions) {
      errors.push(...validateSubscription(entry));
      const id = text(entry?.targetId);
      if (seen.has(id)) errors.push("feed-subscription-duplicate");
      seen.add(id);
    }
  }
  if (!Array.isArray(value.events)) errors.push("feed-events-invalid");
  else {
    const seen = new Set();
    for (const entry of value.events) {
      errors.push(...validateRadarPilotEvent(entry).errors);
      const id = text(entry?.eventVersionId);
      if (seen.has(id)) errors.push("feed-event-version-duplicate");
      seen.add(id);
    }
  }
  if (!Array.isArray(value.receipts)) errors.push("feed-receipts-invalid");
  else {
    const seen = new Set();
    for (const entry of value.receipts) {
      errors.push(...validateReceipt(entry));
      const id = text(entry?.eventVersionId);
      if (seen.has(id)) errors.push("feed-receipt-duplicate");
      seen.add(id);
    }
  }
  if (!Array.isArray(value.operationAcks)) errors.push("feed-operation-acks-invalid");
  else {
    const seen = new Set();
    for (const entry of value.operationAcks) {
      errors.push(...validateRadarPilotSubscriptionAck(entry).errors);
      const id = text(entry?.operationId);
      if (seen.has(id)) errors.push("feed-operation-ack-duplicate");
      seen.add(id);
    }
  }
  return result(errors);
}

export function projectEntdeckenRadarPilot({
  clientEnabled = false, radarAuthority, radarState, localEvents = Object.freeze([]),
} = {}) {
  const active = clientEnabled === true
    && radarAuthority === "account-cache"
    && radarState?.authority === "account-cache"
    && radarState?.pilot?.status === "ready";
  return Object.freeze({
    active,
    events: active ? radarState.pilot.events : localEvents,
    radarReview: active && radarState.pilot.radarReview === true,
  });
}
