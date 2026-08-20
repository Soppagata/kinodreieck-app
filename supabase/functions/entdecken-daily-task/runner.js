import {
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
function dayStatus(feed, today) {
  if (!feed) return "empty";
  return feed.refreshedOn === today ? "fresh" : "stale";
}
function frozen(status, feed, extra = {}) {
  return Object.freeze({ status, feed, ...extra });
}

async function failSafely(repository, code) {
  try { await repository.markFailure({ code: SAFE_FAILURE_CODES.has(code) ? code : "provider_error" }); }
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
  if (!context || context.feedEnabled !== true || !validDay(context.today)) {
    return frozen("disabled", null);
  }
  const checkedCached = validateEntdeckenDailyFeed(context.feed);
  const cached = checkedCached.ok && context.feed.validUntil >= context.today ? checkedCached.value : null;
  if (context.refresh !== true) return frozen(dayStatus(cached, context.today), cached);

  let sources;
  try { sources = validateEntdeckenSourceRegistry(await repository.loadSources()); }
  catch { sources = { ok: false }; }
  if (!sources.ok) {
    await failSafely(repository, "source_registry_unavailable");
    return frozen(dayStatus(cached, context.today), cached, { reason: "source_registry_unavailable" });
  }

  let envelope;
  try { envelope = await adapter.search(); }
  catch {
    await failSafely(repository, "provider_error");
    return frozen(dayStatus(cached, context.today), cached, { reason: "provider_error" });
  }
  const evaluated = evaluateEntdeckenDailyResponse(envelope, sources.value, { retrievedOn: context.today });
  if (!evaluated.ok) {
    await failSafely(repository, "invalid_response");
    return frozen(dayStatus(cached, context.today), cached, { reason: evaluated.status });
  }
  try { await repository.saveFeed(evaluated.feed); }
  catch {
    await failSafely(repository, "storage_error");
    return frozen(dayStatus(cached, context.today), cached, { reason: "storage_error" });
  }
  return frozen("fresh", evaluated.feed);
}
