/* Kinodreieck Radar – reine Phase-1-Verträge.
   Kein Speicher, kein Netzwerk, kein Provider und keine UI. Die Funktionen
   bereiten ausschließlich validierbare Entwürfe für spätere RPCs vor. */

export const RADAR_TARGET_TYPES = Object.freeze(["work", "series", "franchise"]);
export const RADAR_TARGET_STATUSES = Object.freeze(["active", "ambiguous", "retired"]);
export const RADAR_SUBSCRIPTION_STATUSES = Object.freeze(["active", "paused", "pending", "rejected"]);
export const RADAR_EVENT_TYPES = Object.freeze(["kinostart_at", "streamingstart_at", "serienstart", "staffelstart"]);
export const RADAR_VERIFICATION_STATUSES = Object.freeze(["candidate", "corroborated", "confirmed", "ambiguous"]);
export const RADAR_LIFECYCLE_STATUSES = Object.freeze(["announced", "scheduled", "retracted"]);
export const RADAR_RECEIPT_STATUSES = Object.freeze(["new", "seen", "dismissed", "accepted_week", "exported_ics"]);
export const RADAR_SCOPES = Object.freeze(["all", "cinema", "streaming"]);
export const RADAR_SEARCH_INTENTS = Object.freeze(["watch", "radar"]);
export const RADAR_CHECK_WEEKDAYS = Object.freeze(["monday", "friday"]);
export const RADAR_CAPABILITIES = Object.freeze(["radar_unlimited", "radar_review", "radar_circle"]);
export const RADAR_NORMAL_ACTIVE_LIMIT = 10;
export const RADAR_DEFAULT_REGION = "AT";

const ID_FORM = /^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$/;
const VERSION_FORM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function text(value) { return String(value == null ? "" : value).trim(); }
function inList(value, list) { return list.includes(value); }
function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
function validDay(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const millis = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === normalized;
}
function validation(errors) {
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function isStableContractId(value, { allowFixture = true } = {}) {
  const id = text(value);
  return ID_FORM.test(id) && (allowFixture || !id.startsWith("fixture:"));
}

export function validateRadarTarget(target, { allowFixture = true } = {}) {
  const errors = [];
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return validation(["target-invalid"]);
  }
  if (!isStableContractId(target.targetId, { allowFixture })) errors.push("target-id-invalid");
  if (!inList(target.targetType, RADAR_TARGET_TYPES)) errors.push("target-type-invalid");
  if (!inList(target.targetStatus, RADAR_TARGET_STATUSES)) errors.push("target-status-invalid");
  if (!text(target.title) || text(target.title).length > 200) errors.push("target-title-invalid");
  if (target.canonical !== true && target.targetStatus === "active") errors.push("active-target-not-canonical");
  return validation(errors);
}

/* Ein sichtbarer „Titel“ ist kein eigener Zieltyp. Film/Werk, Serie und
   Franchise teilen denselben Radar-Intent, bleiben intern aber typisiert. */
export function createSearchActionDraft({ intent, target, watchmodeId = null } = {}) {
  if (!inList(intent, RADAR_SEARCH_INTENTS)) {
    return Object.freeze({ ok: false, reason: "intent-invalid", action: null });
  }
  const targetCheck = validateRadarTarget(target);
  if (!targetCheck.ok) {
    return Object.freeze({ ok: false, reason: "target-invalid", errors: targetCheck.errors, action: null });
  }

  if (intent === "watch") {
    const normalizedWatchmodeId = positiveInteger(watchmodeId);
    if (target.targetType !== "series" || normalizedWatchmodeId == null) {
      return Object.freeze({ ok: false, reason: "watch-series-id-required", action: null });
    }
    return Object.freeze({
      ok: true,
      action: Object.freeze({
        intent: "watch",
        writePath: "series-watch",
        targetId: target.targetId,
        targetType: "series",
        watchmodeId: normalizedWatchmodeId,
        costBearing: false,
        setsObserved: true,
        setsRadar: false,
        createsProviderJob: false,
      }),
    });
  }

  if (target.targetStatus !== "active" || target.canonical !== true) {
    return Object.freeze({ ok: false, reason: "radar-target-not-canonical", action: null });
  }
  return Object.freeze({
    ok: true,
    action: Object.freeze({
      intent: "radar",
      writePath: "radar-subscription-preview",
      targetId: target.targetId,
      targetType: target.targetType,
      requiresConfirmation: true,
      shareEnabled: false,
      costBearing: true,
      setsObserved: false,
      setsRadar: false,
      createsProviderJob: false,
    }),
  });
}

export function validateRadarSubscription(subscription, { allowFixture = true } = {}) {
  const errors = [];
  if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) {
    return validation(["subscription-invalid"]);
  }
  if (!isStableContractId(subscription.targetId, { allowFixture })) errors.push("subscription-target-invalid");
  if (!inList(subscription.targetType, RADAR_TARGET_TYPES)) errors.push("subscription-target-type-invalid");
  if (!inList(subscription.status, RADAR_SUBSCRIPTION_STATUSES)) errors.push("subscription-status-invalid");
  if (text(subscription.region) !== RADAR_DEFAULT_REGION) errors.push("subscription-region-invalid");
  if (!inList(subscription.scope, RADAR_SCOPES)) errors.push("subscription-scope-invalid");
  if (subscription.note != null || subscription.tasteSignal != null) errors.push("subscription-private-field-forbidden");
  return validation(errors);
}

function activeEventKeys(subscriptions) {
  const keys = new Set();
  for (const subscription of Array.isArray(subscriptions) ? subscriptions : []) {
    if (subscription?.status !== "active") continue;
    if (!isStableContractId(subscription.targetId)) continue;
    if (!inList(subscription.targetType, RADAR_TARGET_TYPES)) continue;
    keys.add(`event:${subscription.targetId}`);
  }
  return keys;
}

function activeDiscoveryKeys(subscriptions) {
  const keys = new Set();
  for (const subscription of Array.isArray(subscriptions) ? subscriptions : []) {
    if (subscription?.status !== "active") continue;
    const externalId = text(subscription.personExternalId);
    const role = text(subscription.role);
    if (!isStableContractId(externalId) || !["actor", "director"].includes(role)) continue;
    keys.add(`person:${externalId}:${role}`);
  }
  return keys;
}

export function countActiveRadarEntries({ eventSubscriptions = [], discoverySubscriptions = [] } = {}) {
  return activeEventKeys(eventSubscriptions).size + activeDiscoveryKeys(discoverySubscriptions).size;
}

/* Spiegelt die spätere atomare Serverentscheidung. `role=owner` wird bewusst
   nicht gelesen; ausschließlich die eigene Capability hebt das Fachlimit auf. */
export function evaluateRadarQuota({
  eventSubscriptions = [], discoverySubscriptions = [], candidate = null, capabilities = {},
} = {}) {
  const eventKeys = activeEventKeys(eventSubscriptions);
  const discoveryKeys = activeDiscoveryKeys(discoverySubscriptions);
  const before = eventKeys.size + discoveryKeys.size;
  let increment = 0;
  let candidateValid = candidate == null;

  if (candidate?.kind === "event" && candidate.status === "active" && isStableContractId(candidate.targetId)) {
    candidateValid = true;
    increment = eventKeys.has(`event:${candidate.targetId}`) ? 0 : 1;
  } else if (
    candidate?.kind === "discovery" && candidate.status === "active"
    && isStableContractId(candidate.personExternalId)
    && ["actor", "director"].includes(candidate.role)
  ) {
    candidateValid = true;
    increment = discoveryKeys.has(`person:${candidate.personExternalId}:${candidate.role}`) ? 0 : 1;
  }

  const unlimited = capabilities?.radar_unlimited === true;
  const after = before + increment;
  return Object.freeze({
    allowed: candidateValid && (unlimited || after <= RADAR_NORMAL_ACTIVE_LIMIT),
    candidateValid,
    activeBefore: before,
    activeAfter: after,
    increment,
    limit: unlimited ? null : RADAR_NORMAL_ACTIVE_LIMIT,
    unlimited,
  });
}

function keyPart(value, version = false) {
  const normalized = text(value);
  if (!(version ? VERSION_FORM : ID_FORM).test(normalized)) return null;
  return encodeURIComponent(normalized);
}

export function createRadarCheckKey({ targetId, region, scope, queryVersion, providerVersion } = {}) {
  const parts = [
    keyPart(targetId),
    text(region) === RADAR_DEFAULT_REGION ? RADAR_DEFAULT_REGION : null,
    inList(scope, RADAR_SCOPES) ? scope : null,
    keyPart(queryVersion, true),
    keyPart(providerVersion, true),
  ];
  return parts.every(Boolean) ? parts.join("|") : null;
}

/* Das Datum ist absichtlich kein Bestandteil der Eventidentität. Eine
   Verschiebung erzeugt eine neue Version desselben Ereignisses. */
export function createRadarEventIdentity({ canonicalWorkId, eventType, region, platform = "-" } = {}) {
  const work = keyPart(canonicalWorkId);
  const type = inList(eventType, RADAR_EVENT_TYPES) ? eventType : null;
  const normalizedRegion = text(region) === RADAR_DEFAULT_REGION ? RADAR_DEFAULT_REGION : null;
  const normalizedPlatform = platform === "-" ? "-" : keyPart(platform, true);
  return work && type && normalizedRegion && normalizedPlatform
    ? [work, type, normalizedRegion, normalizedPlatform].join("|")
    : null;
}

function isEncodedKeyPart(value) {
  try {
    const decoded = decodeURIComponent(text(value));
    return keyPart(decoded) === value;
  } catch { return false; }
}

/* Eventidentitäten sind deterministische Verbundschlüssel und dürfen deshalb
   die vier intern gesetzten Trenner enthalten. Persistente UUIDs und Fixture-
   IDs bleiben über isStableContractId weiterhin zulässig. */
export function isRadarEventIdentity(value) {
  const parts = text(value).split("|");
  return parts.length === 4
    && isEncodedKeyPart(parts[0])
    && RADAR_EVENT_TYPES.includes(parts[1])
    && parts[2] === RADAR_DEFAULT_REGION
    && (parts[3] === "-" || isEncodedKeyPart(parts[3]));
}

export function validateRadarEventVersion(version, { allowFixture = true } = {}) {
  const errors = [];
  if (!version || typeof version !== "object" || Array.isArray(version)) {
    return validation(["event-version-invalid"]);
  }
  if (!isStableContractId(version.eventId, { allowFixture }) && !isRadarEventIdentity(version.eventId)) {
    errors.push("event-id-invalid");
  }
  if (!isStableContractId(version.versionId, { allowFixture })) errors.push("event-version-id-invalid");
  if (!inList(version.verificationStatus, RADAR_VERIFICATION_STATUSES)) errors.push("verification-status-invalid");
  if (!inList(version.lifecycleStatus, RADAR_LIFECYCLE_STATUSES)) errors.push("lifecycle-status-invalid");
  if (!validDay(version.date)) errors.push("event-date-invalid");
  return validation(errors);
}

export function createRadarShareDraft(targetId) {
  if (!isStableContractId(targetId)) return null;
  return Object.freeze({ targetId: text(targetId), shareEnabled: false, requiresExplicitOptIn: true });
}

const SHARE_FIELDS = Object.freeze(["targetId", "title", "targetType", "year", "artwork"]);
const SHARE_EVENT_FIELDS = Object.freeze([
  "eventId", "eventType", "lifecycleStatus", "date", "verificationStatus", "platform", "region",
]);
export function projectCuratedRadarShare(row = {}) {
  const projection = {};
  for (const field of SHARE_FIELDS) {
    if (row[field] !== undefined && row[field] !== null) projection[field] = row[field];
  }
  if (row.event && typeof row.event === "object" && !Array.isArray(row.event)) {
    const event = {};
    for (const field of SHARE_EVENT_FIELDS) {
      if (row.event[field] !== undefined && row.event[field] !== null) event[field] = row.event[field];
    }
    if (Object.keys(event).length) projection.event = Object.freeze(event);
  }
  return Object.freeze(projection);
}

export function isRadarCheckWeekday(day) {
  return RADAR_CHECK_WEEKDAYS.includes(text(day).toLowerCase());
}
