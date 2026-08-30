import {
  evaluateRadarWebsearchResponse,
  validateRadarWebsearchRequest,
} from "./contract.js";
import { normalizeProviderReceipt } from "../_shared/providerReceipt.js";

function frozenResult(value) { return Object.freeze({ ...value }); }
function safePresentation(value) {
  if (!value || !["structured", "partial", "degraded"].includes(value.responseMode)
      || (value.displayText !== null
        && (typeof value.displayText !== "string" || !value.displayText.trim()
          || value.displayText !== value.displayText.trim() || value.displayText.length > 320
          || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value.displayText)))
      || !Array.isArray(value.warnings) || value.warnings.length > 8
      || value.warnings.some((warning) => (
        typeof warning !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(warning)
        || warning.length > 64
      ))) return Object.freeze({});
  return Object.freeze({
    responseMode: value.responseMode,
    displayText: value.displayText,
    warnings: Object.freeze([...value.warnings]),
  });
}
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
 *   targetText?: string | null,
 *   adapter: { search(request: Record<string, unknown>): Promise<unknown> },
 *   repository: {
 *     loadAuthorizedTarget(input: {accountId: string, targetId: string, targetText?: string | null}): Promise<unknown>,
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
  targetText = null,
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
    const context = await repository.loadAuthorizedTarget({ accountId, targetId, targetText });
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
  const normalizedReceipt = normalizeProviderReceipt(envelope?.providerReceipt);
  const providerEvidence = normalizedReceipt
    ? Object.freeze({ providerReceipt: normalizedReceipt })
    : Object.freeze({});
  const providerEnvelope = envelope && typeof envelope === "object" && !Array.isArray(envelope)
    ? Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "providerReceipt"))
    : envelope;
  const presentation = safePresentation(providerEnvelope);

  let sources = [];
  try {
    const findings = ["person", "title_group", "text"].includes(request.kind)
      ? providerEnvelope?.response?.candidates
      : providerEnvelope?.response?.events;
    const domains = [...new Set((Array.isArray(findings) ? findings : []).flatMap((finding) => (
      ["evidence", "membershipEvidence", "relationEvidence"].flatMap((key) => (
        Array.isArray(finding?.[key]) ? finding[key] : []
      ))
        .map((entry) => entry?.sourceDomain).filter(Boolean)
    )))];
    sources = request.kind === "text" ? [] : await repository.resolveSources(domains);
  } catch {
    return frozenResult({
      status: "insufficient_evidence", writes: 0,
      feed: await loadFeedSafely(repository, accountId),
      ...presentation,
      ...providerEvidence,
    });
  }
  const evaluated = evaluateRadarWebsearchResponse(providerEnvelope, request, sources);
  const textDetails = request.kind === "text" ? {
    textResult: evaluated.textResult || null,
    textDiagnostics: Object.freeze({
      normalizedCandidates: Array.isArray(providerEnvelope?.response?.candidates)
        ? Math.min(6, providerEnvelope.response.candidates.length) : 0,
      acceptedCandidates: evaluated.textResult?.candidates?.length || 0,
      rejectionCodes: Object.freeze([...new Set(evaluated.errors || [])].filter((code) => (
        typeof code === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) && code.length <= 64
      )).slice(0, 8)),
    }),
  } : {};
  if (request.kind === "person" && evaluated.status !== "confirmed") {
    return frozenResult({
      status: evaluated.status,
      writes: 0,
      feed: await loadFeedSafely(repository, accountId),
      personResult: evaluated.personResult || null,
      ...presentation,
      ...providerEvidence,
    });
  }
  if (request.kind === "title_group" && evaluated.status !== "confirmed") {
    return frozenResult({
      status: evaluated.status,
      writes: 0,
      feed: await loadFeedSafely(repository, accountId),
      ...presentation,
      ...providerEvidence,
    });
  }
  if (request.kind === "text" && evaluated.status !== "confirmed") {
    return frozenResult({
      status: evaluated.status,
      writes: 0,
      feed: await loadFeedSafely(repository, accountId),
      ...presentation,
      ...providerEvidence,
      ...textDetails,
    });
  }
  if (evaluated.status !== "confirmed") {
    return frozenResult({
      status: evaluated.status,
      writes: 0,
      feed: await loadFeedSafely(repository, accountId),
      ...presentation,
      ...providerEvidence,
    });
  }

  let writes = 0;
  let changed = false;
  let storageFailures = 0;
  let storedResults = 0;
  try {
    const catalogResult = request.kind === "person"
      ? evaluated.personResult
      : request.kind === "title_group" ? evaluated.titleGroupResult
        : request.kind === "text" ? evaluated.textResult : null;
    const events = catalogResult
      ? catalogResult.candidates.map((candidate) => ({
        targetKey: candidate.targetId,
        targetType: candidate.targetType,
        title: candidate.title,
        year: candidate.year,
        ...(request.kind === "text" ? { category: candidate.category } : {}),
        eventType: candidate.eventType,
        date: candidate.date,
        region: candidate.region,
        platform: candidate.platform,
        seasonNumber: candidate.seasonNumber ?? null,
        evidence: candidate.evidence,
        ...(candidate.groupExternalId ? {
          groupExternalId: candidate.groupExternalId,
          membershipEvidence: candidate.membershipEvidence,
        } : {}),
        ...(request.kind === "text" ? { relationEvidence: candidate.relationEvidence } : {}),
      }))
      : evaluated.events;
    for (const event of events) {
      let upsert;
      try {
        upsert = await repository.upsertConfirmedEvent({
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
            ...(request.discoveryMode ? {
              discoveryMode: request.discoveryMode,
              groupExternalId: request.groupExternalId,
              canonicalGroupName: request.canonicalGroupName,
              windowStart: request.windowStart,
              windowEnd: request.windowEnd,
            } : {}),
          },
        } : request.kind === "text" ? {
          textContext: {
            targetId: request.targetId,
            targetText: request.targetText,
            checkedAt: evaluated.textResult.checkedAt,
            relationEvidence: event.relationEvidence,
          },
        } : {}),
        });
      } catch (error) {
        if (request.kind !== "text") throw error;
        storageFailures += 1;
        continue;
      }
      if (upsert?.status === "confirmed") {
        writes += 1;
        changed = true;
      } else if (upsert?.status !== "no_change") {
        if (request.kind === "text") { storageFailures += 1; continue; }
        return frozenResult({
          status: "storage_error", writes, feed: null,
          ...presentation, ...providerEvidence,
        });
      }
      storedResults += 1;
    }
  } catch {
    return frozenResult({
      status: "storage_error", writes, feed: null,
      ...presentation, ...providerEvidence,
    });
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
      ...presentation,
      ...providerEvidence,
    });
  }
  return frozenResult({
    status: storageFailures && !storedResults ? "storage_error" : changed ? "confirmed" : "no_change",
    writes,
    feed: await loadFeedSafely(repository, accountId),
    ...presentation,
    ...(storageFailures && storedResults ? {
      responseMode: "partial",
      displayText: "Einzelne Funde konnten nicht gespeichert werden. Andere belegte Funde bleiben erhalten.",
      warnings: [...(presentation.warnings || []), "text-finding-storage-dropped"].slice(0, 8),
    } : {}),
    ...providerEvidence,
    ...textDetails,
  });
}
