import {
  createEntdeckenWeeklyQueryContext,
  ENTDECKEN_WEEKLY_DEGRADED_NOTICE,
  evaluateEntdeckenDailyResponse,
  validateEntdeckenDailyFeed,
  validateEntdeckenSourceRegistry,
} from "./contract.js";
import { normalizeProviderReceipt } from "../_shared/providerReceipt.js";
import { normalizeEntdeckenPersistenceReadback } from "./readbackContract.js";
import { normalizeEntdeckenProviderFailure } from "./providerFailureContract.js";

const SAFE_FAILURE_CODES = new Set([
  "provider_error", "invalid_response", "storage_error", "source_registry_unavailable",
]);
const REFRESH_MODES = new Set(["read", "scheduled", "owner"]);
const REFRESH_STATUSES = new Set([
  "read_only", "claimed", "already_fresh", "in_progress", "cooldown",
  "exhausted", "held", "disabled", "failed", "refreshed", "unavailable",
]);

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function weekStatus(feed, today, isoWeek) {
  if (!feed) return "empty";
  if (feed.format === 4) return feed.isoWeek === isoWeek ? "fresh" : "stale";
  return feed.refreshedOn === today ? "fresh" : "stale";
}
function frozen(status, feed, extra = {}) {
  return Object.freeze({ status, feed, writes: 0, ...extra });
}
function refreshState(context, override = null) {
  const inferredMode = context?.refresh === true ? "scheduled" : "read";
  const mode = REFRESH_MODES.has(context?.requestMode) ? context.requestMode : inferredMode;
  const inferredStatus = context?.refresh === true ? "claimed"
    : mode === "read" ? "read_only" : "held";
  const status = REFRESH_STATUSES.has(override) ? override
    : REFRESH_STATUSES.has(context?.claimStatus) ? context.claimStatus : inferredStatus;
  const attemptCount = Number.isInteger(context?.attemptCount) && context.attemptCount >= 0
    ? context.attemptCount : (context?.refresh === true ? 1 : 0);
  const maxAttempts = Number.isInteger(context?.maxAttempts) && context.maxAttempts > 0
    ? context.maxAttempts : 3;
  return Object.freeze({
    requested: mode !== "read",
    mode,
    status,
    attemptCount: Math.min(attemptCount, maxAttempts),
    maxAttempts,
  });
}
function structuredPresentation() {
  return Object.freeze({ responseMode: "structured", displayText: null, warnings: Object.freeze([]) });
}
function degradedPresentation(warning) {
  return Object.freeze({
    responseMode: "degraded",
    displayText: ENTDECKEN_WEEKLY_DEGRADED_NOTICE,
    warnings: Object.freeze(warning ? [warning] : []),
  });
}
function evaluatedPresentation(value) {
  if (!value || !["structured", "partial", "degraded"].includes(value.responseMode)
      || (value.displayText !== null
        && (typeof value.displayText !== "string" || !value.displayText.trim()
          || value.displayText !== value.displayText.trim() || value.displayText.length > 320
          || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value.displayText)))
      || !Array.isArray(value.warnings) || value.warnings.length > 8
      || value.warnings.some((warning) => (
        typeof warning !== "string" || warning.length > 64
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(warning)
      ))) return degradedPresentation("response-invalid");
  return Object.freeze({
    responseMode: value.responseMode,
    displayText: value.displayText,
    warnings: Object.freeze([...value.warnings]),
  });
}

async function failSafely(repository, code, fenceToken) {
  try {
    await repository.markFailure({
      code: SAFE_FAILURE_CODES.has(code) ? code : "provider_error",
      fenceToken,
    });
  }
  catch { /* Der alte Feed bleibt trotzdem die einzige sichtbare Wahrheit. */ }
}

export async function runEntdeckenDailyRefresh({ repository, adapter } = {}) {
  if (!repository || typeof repository.claimRefresh !== "function"
      || typeof repository.loadSources !== "function"
      || typeof repository.saveFeed !== "function"
      || typeof repository.markFailure !== "function"
      || !adapter || typeof adapter.search !== "function") {
    return frozen("empty", null, {
      reason: "setup-invalid", ...degradedPresentation("setup-invalid"),
      refresh: refreshState(null, "unavailable"),
    });
  }
  let context;
  try { context = await repository.claimRefresh(); }
  catch {
    return frozen("empty", null, {
      reason: "storage_error", ...degradedPresentation("storage-error"),
      refresh: refreshState(null, "unavailable"),
    });
  }
  const queryContext = createEntdeckenWeeklyQueryContext(context?.today, context?.isoWeek);
  if (!context || context.feedEnabled !== true || !validDay(context.today) || !queryContext) {
    return frozen("disabled", null, {
      ...structuredPresentation(), refresh: refreshState(context, "disabled"),
    });
  }
  const checkedCached = validateEntdeckenDailyFeed(context.feed);
  /* Auch ein abgelaufener letzter Erfolg bleibt bei einem Wochenfehler sichtbar.
     `stale` ist dabei eine ehrliche Zustandsaussage, keine neue Gueltigkeit. */
  const cached = checkedCached.ok ? checkedCached.value : null;
  if (context.refresh !== true) {
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, {
      ...structuredPresentation(),
      refresh: refreshState(context),
      ...(context.feedReadback && typeof context.feedReadback === "object"
        && !Array.isArray(context.feedReadback)
        ? { feedReadback: Object.freeze({ ...context.feedReadback }) } : {}),
    });
  }
  const fenceToken = Number(context.fenceToken);
  if (!Number.isSafeInteger(fenceToken) || fenceToken <= 0) {
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, {
      reason: "storage_error", ...degradedPresentation("storage-error"),
      refresh: refreshState(context, "failed"),
    });
  }

  let sources;
  try { sources = validateEntdeckenSourceRegistry(await repository.loadSources()); }
  catch { sources = { ok: false }; }
  if (!sources.ok) {
    await failSafely(repository, "source_registry_unavailable", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, {
      reason: "source_registry_unavailable", ...degradedPresentation("sources-unavailable"),
      refresh: refreshState(context, "failed"),
    });
  }

  let envelope;
  try { envelope = await adapter.search(queryContext); }
  catch (error) {
    const providerFailure = normalizeEntdeckenProviderFailure(error?.providerFailure);
    await failSafely(repository, "provider_error", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, {
      reason: "provider_error", ...degradedPresentation("provider-error"),
      ...(providerFailure ? { providerFailure } : {}),
      refresh: refreshState(context, "failed"),
    });
  }
  const normalizedReceipt = normalizeProviderReceipt(envelope?.providerReceipt);
  const providerEvidence = normalizedReceipt
    ? Object.freeze({ providerReceipt: normalizedReceipt })
    : Object.freeze({});
  const providerEnvelope = envelope && typeof envelope === "object" && !Array.isArray(envelope)
    ? Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "providerReceipt"))
    : envelope;
  const evaluated = evaluateEntdeckenDailyResponse(providerEnvelope, sources.value, {
    retrievedOn: context.today,
    claimedIsoWeek: context.isoWeek,
  });
  if (!evaluated.ok) {
    await failSafely(repository, "invalid_response", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, {
      reason: evaluated.status, ...evaluatedPresentation(evaluated),
      ...providerEvidence,
      ...(evaluated.quality ? { quality: evaluated.quality } : {}),
      refresh: refreshState(context, "failed"),
    });
  }
  if (!normalizedReceipt) {
    await failSafely(repository, "invalid_response", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, {
      reason: "invalid_response", ...degradedPresentation("provider-receipt-invalid"),
      refresh: refreshState(context, "failed"),
      ...(evaluated.quality ? { quality: evaluated.quality } : {}),
    });
  }
  let persisted;
  try {
    await repository.saveFeed(evaluated.feed, {
      fenceToken,
      providerReceipt: normalizedReceipt,
    });
    if (typeof repository.readFeed !== "function") throw new Error("entdecken-readback-missing");
    persisted = normalizeEntdeckenPersistenceReadback(await repository.readFeed({
      fenceToken,
      providerReceipt: normalizedReceipt,
    }), {
      expectedFeed: evaluated.feed,
      fenceToken,
      providerReceipt: normalizedReceipt,
    });
    if (!persisted) throw new Error("entdecken-readback-invalid");
  }
  catch {
    await failSafely(repository, "storage_error", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, {
      reason: "storage_error", ...degradedPresentation("storage-error"),
      ...providerEvidence,
      refresh: refreshState(context, "failed"),
    });
  }
  return frozen("fresh", persisted.feed, {
    writes: 1,
    feedReadback: persisted.readback,
    ...(evaluated.quality ? { quality: evaluated.quality } : {}),
    ...evaluatedPresentation(evaluated),
    ...providerEvidence,
    refresh: refreshState(context, "refreshed"),
  });
}
