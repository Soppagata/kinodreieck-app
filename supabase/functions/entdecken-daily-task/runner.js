import {
  createEntdeckenWeeklyQueryContext,
  evaluateEntdeckenDailyResponse,
  validateEntdeckenDailyFeed,
  validateEntdeckenSourceRegistry,
} from "./contract.js";

const SAFE_FAILURE_CODES = new Set([
  "provider_error", "invalid_response", "storage_error", "source_registry_unavailable",
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
    return frozen("empty", null, { reason: "setup-invalid" });
  }
  let context;
  try { context = await repository.claimRefresh(); }
  catch { return frozen("empty", null, { reason: "storage_error" }); }
  const queryContext = createEntdeckenWeeklyQueryContext(context?.today, context?.isoWeek);
  if (!context || context.feedEnabled !== true || !validDay(context.today) || !queryContext) {
    return frozen("disabled", null);
  }
  const checkedCached = validateEntdeckenDailyFeed(context.feed);
  /* Auch ein abgelaufener letzter Erfolg bleibt bei einem Wochenfehler sichtbar.
     `stale` ist dabei eine ehrliche Zustandsaussage, keine neue Gueltigkeit. */
  const cached = checkedCached.ok ? checkedCached.value : null;
  if (context.refresh !== true) return frozen(weekStatus(cached, context.today, context.isoWeek), cached);
  const fenceToken = Number(context.fenceToken);
  if (!Number.isSafeInteger(fenceToken) || fenceToken <= 0) {
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, { reason: "storage_error" });
  }

  let sources;
  try { sources = validateEntdeckenSourceRegistry(await repository.loadSources()); }
  catch { sources = { ok: false }; }
  if (!sources.ok) {
    await failSafely(repository, "source_registry_unavailable", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, { reason: "source_registry_unavailable" });
  }

  let envelope;
  try { envelope = await adapter.search(queryContext); }
  catch {
    await failSafely(repository, "provider_error", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, { reason: "provider_error" });
  }
  const evaluated = evaluateEntdeckenDailyResponse(envelope, sources.value, {
    retrievedOn: context.today,
    claimedIsoWeek: context.isoWeek,
  });
  if (!evaluated.ok) {
    await failSafely(repository, "invalid_response", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, { reason: evaluated.status });
  }
  try { await repository.saveFeed(evaluated.feed, { fenceToken }); }
  catch {
    await failSafely(repository, "storage_error", fenceToken);
    return frozen(weekStatus(cached, context.today, context.isoWeek), cached, { reason: "storage_error" });
  }
  return frozen("fresh", evaluated.feed, { writes: 1 });
}
