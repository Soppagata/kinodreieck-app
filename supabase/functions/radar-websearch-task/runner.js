import {
  evaluateRadarWebsearchResponse,
  validateRadarWebsearchRequest,
} from "./contract.js";

function frozenResult(value) { return Object.freeze({ ...value }); }
async function loadFeedSafely(repository, accountId) {
  try { return await repository.loadFeed({ accountId }); }
  catch { return null; }
}

/* Senkrechter Paket-A-Runner. Der Adapter sieht ausschließlich `request`.
   Accountbindung, Quellenregister, Upsert und Feed bleiben im Repository und
   damit außerhalb des Providerpayloads. Es gibt genau einen Adapteraufruf und
   weder Retry noch automatischen Folgecheck. */
/**
 * @param {{
 *   accountId: string,
 *   targetId: string,
 *   adapter: { search(request: Record<string, unknown>): Promise<unknown> },
 *   repository: {
 *     loadAuthorizedTarget(input: {accountId: string, targetId: string}): Promise<unknown>,
 *     resolveSources(domains: string[]): Promise<Array<Record<string, unknown>>>,
 *     upsertConfirmedEvent(input: {accountId: string, operationId: string, event: Record<string, unknown>}): Promise<{status?: string}>,
 *     loadFeed(input: {accountId: string}): Promise<unknown>
 *   },
 *   operationId?: (event: Record<string, unknown>) => string
 * }} options
 */
export async function runRadarWebsearchCheck({
  accountId,
  targetId,
  adapter,
  repository,
  operationId = () => crypto.randomUUID(),
}) {
  if (!accountId || !targetId || typeof adapter?.search !== "function"
      || typeof repository?.loadAuthorizedTarget !== "function"
      || typeof repository?.resolveSources !== "function"
      || typeof repository?.upsertConfirmedEvent !== "function"
      || typeof repository?.loadFeed !== "function") {
    return frozenResult({ status: "unavailable", writes: 0, feed: null });
  }
  let request;
  try {
    const context = await repository.loadAuthorizedTarget({ accountId, targetId });
    const checked = validateRadarWebsearchRequest(context);
    if (!checked.ok) return frozenResult({ status: "forbidden", writes: 0, feed: null });
    request = checked.value;
  } catch {
    return frozenResult({ status: "forbidden", writes: 0, feed: null });
  }

  let envelope;
  try {
    envelope = await adapter.search(request);
  } catch {
    return frozenResult({ status: "provider_error", writes: 0, feed: null });
  }

  let sources = [];
  try {
    const findings = ["person", "title_group"].includes(request.kind)
      ? envelope?.response?.candidates
      : envelope?.response?.events;
    const domains = [...new Set((findings || []).flatMap((finding) => (
      (finding?.evidence || []).map((entry) => entry?.sourceDomain).filter(Boolean)
    )))];
    sources = await repository.resolveSources(domains);
  } catch {
    return frozenResult({
      status: "insufficient_evidence", writes: 0,
      feed: await loadFeedSafely(repository, accountId),
    });
  }
  const evaluated = evaluateRadarWebsearchResponse(envelope, request, sources);
  if (request.kind === "person" && evaluated.status !== "confirmed") {
    return frozenResult({
      status: evaluated.status,
      writes: 0,
      feed: await loadFeedSafely(repository, accountId),
      personResult: evaluated.personResult || null,
    });
  }
  if (request.kind === "title_group" && evaluated.status !== "confirmed") {
    return frozenResult({
      status: evaluated.status,
      writes: 0,
      feed: await loadFeedSafely(repository, accountId),
    });
  }
  if (evaluated.status !== "confirmed") {
    return frozenResult({
      status: evaluated.status,
      writes: 0,
      feed: await loadFeedSafely(repository, accountId),
    });
  }

  let writes = 0;
  let changed = false;
  try {
    const catalogResult = request.kind === "person"
      ? evaluated.personResult
      : request.kind === "title_group" ? evaluated.titleGroupResult : null;
    const events = catalogResult
      ? catalogResult.candidates.map((candidate) => ({
        targetKey: candidate.targetId,
        targetType: candidate.targetType,
        title: candidate.title,
        year: candidate.year,
        eventType: candidate.eventType,
        date: candidate.date,
        region: candidate.region,
        platform: candidate.platform,
        seasonNumber: candidate.seasonNumber ?? null,
        evidence: candidate.evidence,
      }))
      : evaluated.events;
    for (const event of events) {
      const upsert = await repository.upsertConfirmedEvent({
        accountId,
        operationId: operationId(event),
        event,
        ...(request.kind === "person" ? {
          personContext: {
            targetId: request.targetId,
            personExternalId: request.personExternalId,
            canonicalName: request.canonicalName,
            role: request.role,
            checkedAt: evaluated.personResult.checkedAt,
            windowStart: request.windowStart,
            windowEnd: request.windowEnd,
          },
        } : request.kind === "title_group" ? {
          titleGroupContext: {
            targetId: request.targetId,
            queryVersion: request.queryVersion,
            queryKey: request.queryKey,
            displayName: request.displayName,
            checkedAt: evaluated.titleGroupResult.checkedAt,
          },
        } : {}),
      });
      if (upsert?.status === "confirmed") {
        writes += 1;
        changed = true;
      } else if (upsert?.status !== "no_change") {
        return frozenResult({ status: "storage_error", writes, feed: null });
      }
    }
  } catch {
    return frozenResult({ status: "storage_error", writes, feed: null });
  }
  if (request.kind === "person") {
    const personResult = changed
      ? evaluated.personResult
      : {
        status: "no_change",
        checkedAt: evaluated.personResult.checkedAt,
        windowStart: request.windowStart,
        windowEnd: request.windowEnd,
        person: evaluated.personResult.person,
        candidates: [],
      };
    return frozenResult({
      status: changed ? "confirmed" : "no_change",
      writes,
      feed: await loadFeedSafely(repository, accountId),
      personResult,
    });
  }
  return frozenResult({
    status: changed ? "confirmed" : "no_change",
    writes,
    feed: await loadFeedSafely(repository, accountId),
  });
}
