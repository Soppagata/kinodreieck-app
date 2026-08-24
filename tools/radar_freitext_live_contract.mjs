/* Reiner Vertrag fuer den Radar-Freitextpfad im Acht-Pfade-Smoke.
   Keine Netzwerk-, Provider-, Budget- oder Persistenzwirkung. Der Live-Runner
   reicht nur die bereits gelesene Function-Antwort und die beiden normalen
   Radar-Feed-Snapshots hinein. */

import { createLocalTextRadarTargetId } from "../src/lib/localEventRadar.js";
import { validateRadarPilotFeed } from "../src/lib/radarPilotContracts.js";

export const RADAR_FREITEXT_LIVE_TARGET_TEXT =
  "Star Wars: Starfighter Kinostart Österreich";

const FUNCTION_STATUSES = new Set([
  "confirmed", "insufficient_evidence", "no_change",
]);
const RESPONSE_MODES = new Set(["structured", "partial", "degraded"]);
const WARNING_FORM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function frozen(value) {
  return Object.freeze(value);
}

function safeReason(errors, fallback) {
  return errors.length ? errors[0] : fallback;
}

function validPresentation(body) {
  if (!RESPONSE_MODES.has(body?.responseMode)
      || !Array.isArray(body?.warnings) || body.warnings.length > 8
      || new Set(body.warnings).size !== body.warnings.length
      || body.warnings.some((warning) => (
        typeof warning !== "string" || !WARNING_FORM.test(warning)
          || warning.length > 64
      ))) return false;
  if (body.responseMode === "structured") {
    return body.displayText === null && body.warnings.length === 0;
  }
  return typeof body.displayText === "string"
    && body.displayText === body.displayText.trim()
    && body.displayText.length > 0 && body.displayText.length <= 320
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(body.displayText);
}

export function erstelleRadarFreitextLiveSzenario() {
  const targetText = RADAR_FREITEXT_LIVE_TARGET_TEXT;
  const targetId = createLocalTextRadarTargetId(targetText);
  if (!targetId || !/^text:[a-f0-9]{16}$/.test(targetId)) {
    throw new Error("Radar-Freitext-Fixtureschluessel ist ungueltig.");
  }
  return frozen({
    targetText,
    targetId,
    requestBody: frozen({ targetId, targetText }),
  });
}

export function erfasseRadarFreitextFeedSnapshot(feed) {
  const checked = validateRadarPilotFeed(feed);
  if (!checked.ok) {
    return frozen({
      ok: false,
      reason: "feed-contract-invalid",
      errors: frozen([...checked.errors]),
      subscriptions: frozen([]),
      events: frozen([]),
      eventVersionIds: frozen([]),
    });
  }
  const subscriptions = feed.subscriptions.map((entry) => frozen({ ...entry }));
  const events = feed.events.map((entry) => frozen({
    ...entry,
    evidence: frozen(entry.evidence.map((proof) => frozen({ ...proof }))),
  }));
  return frozen({
    ok: true,
    reason: null,
    errors: frozen([]),
    subscriptions: frozen(subscriptions),
    events: frozen(events),
    eventVersionIds: frozen(events.map((entry) => entry.eventVersionId)),
  });
}

export function bewerteRadarFreitextLiveReadback({
  httpStatus,
  body,
  feedVorher,
  feedNachher,
  szenario = erstelleRadarFreitextLiveSzenario(),
} = {}) {
  const errors = [];
  if (httpStatus !== 200 || !plain(body) || body.ok !== true) {
    errors.push("function-response-invalid");
  }
  if (!FUNCTION_STATUSES.has(body?.status)) errors.push("function-status-invalid");
  if (!Number.isInteger(body?.writes) || body.writes < 0 || body.writes > 6) {
    errors.push("function-writes-invalid");
  }
  if (body?.providerRequests !== 1 || body?.searchRequests !== 1
      || body?.phaseCode !== "provider-complete") {
    errors.push("function-request-count-invalid");
  }
  if (!validPresentation(body)) errors.push("function-presentation-invalid");

  const before = feedVorher?.ok === true
    ? feedVorher : erfasseRadarFreitextFeedSnapshot(feedVorher);
  const after = feedNachher?.ok === true
    ? feedNachher : erfasseRadarFreitextFeedSnapshot(feedNachher);
  if (before?.ok !== true) errors.push(before?.reason || "feed-before-invalid");
  if (after?.ok !== true) errors.push(after?.reason || "feed-after-invalid");

  const matchingSubscriptions = after?.ok === true
    ? after.subscriptions.filter((entry) => entry.targetId === szenario.targetId)
    : [];
  if (matchingSubscriptions.length !== 1) errors.push("text-subscription-readback-missing");
  else {
    const subscription = matchingSubscriptions[0];
    if (subscription.targetType !== "text" || subscription.title !== szenario.targetText
        || subscription.region !== "AT" || subscription.scope !== "all"
        || subscription.status !== "active") {
      errors.push("text-subscription-readback-invalid");
    }
  }

  const beforeIds = new Set(before?.ok === true ? before.eventVersionIds : []);
  const newEvents = after?.ok === true
    ? after.events.filter((event) => !beforeIds.has(event.eventVersionId))
    : [];
  let outcome = "invalid";
  let visibleText = "Radar-Freitext konnte nicht sicher ausgewertet werden.";
  if (body?.status === "confirmed") {
    outcome = "proven-event";
    visibleText = body.writes === 1
      ? "Ein bestätigter Radar-Fund mit Datum und Quelle wurde gespeichert."
      : `${body.writes} bestätigte Radar-Funde mit Datum und Quellen wurden gespeichert.`;
    if (body.writes < 1 || newEvents.length !== body.writes
        || newEvents.some((event) => (
          typeof event.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)
            || event.verificationStatus !== "confirmed"
            || !Array.isArray(event.evidence) || event.evidence.length < 1
        ))) errors.push("confirmed-event-readback-invalid");
  } else if (body?.status === "insufficient_evidence") {
    outcome = "degraded";
    visibleText = ["partial", "degraded"].includes(body.responseMode)
      ? body.displayText
      : "Kein belegter neuer Fund.";
    if (body.writes !== 0 || newEvents.length !== 0) {
      errors.push("degraded-result-wrote-event");
    }
  } else if (body?.status === "no_change") {
    outcome = "no-change";
    visibleText = "Keine neue bestätigte Änderung gefunden.";
    if (body.writes !== 0 || newEvents.length !== 0) {
      errors.push("no-change-result-wrote-event");
    }
  }

  return frozen({
    ok: errors.length === 0,
    outcome,
    visibleText,
    writes: Number.isInteger(body?.writes) ? body.writes : 0,
    newEventCount: newEvents.length,
    reason: errors.length ? safeReason(errors, "radar-freitext-readback-invalid") : null,
    errors: frozen([...new Set(errors)]),
  });
}
