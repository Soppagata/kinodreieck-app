/* Kapsel fuer den zentralen Acht-Pfade-Harness. Sie liest ausschliesslich die
   normale Functionantwort plus die bereits vorgeschriebene serverseitige
   Kostenmessung. Ausgabe bleibt inhaltsfrei: keine Titel, URLs, Konten oder
   Providerrohantworten. */

import { normalizeProviderReceipt } from
  "../supabase/functions/_shared/providerReceipt.js";
import { normalizeEntdeckenFeedReadback } from
  "../supabase/functions/entdecken-daily-task/readbackContract.js";
import { normalizeEntdeckenProviderFailure } from
  "../supabase/functions/entdecken-daily-task/providerFailureContract.js";

const COST_EPSILON_USD_CENT = 0.000001;
const OWNER_REFRESH_MAX_ATTEMPTS = new Set([3, 100]);

export class EntdeckenLiveProofError extends Error {
  constructor(code, diagnostic = null) {
    super(code);
    this.name = "EntdeckenLiveProofError";
    this.code = code;
    this.diagnostic = diagnostic;
  }
}
function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function insufficientQuality(value) {
  const keys = [
    "searchResultCount", "citationUrlCount", "rawItemCount", "normalizedItemCount",
    "sourceItemCount", "candidateItemCount", "eligibleUniqueCount", "rejectedItemCount",
    "duplicateItemCount",
  ];
  if (!plain(value) || Object.keys(value).sort().join(",") !== keys.sort().join(",")
      || keys.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)) return false;
  return value.searchResultCount <= 20
    && value.citationUrlCount <= value.searchResultCount
    && value.rawItemCount <= 100
    && value.sourceItemCount <= 100
    && value.normalizedItemCount <= 12
    && value.candidateItemCount === value.normalizedItemCount
    && value.eligibleUniqueCount < 5
    && value.candidateItemCount === value.eligibleUniqueCount
      + value.rejectedItemCount + value.duplicateItemCount;
}

function insufficientQualityDiagnostic(value) {
  if (!insufficientQuality(value)) return null;
  const stage = value.rawItemCount < 5
    ? "provider-underfilled"
    : value.normalizedItemCount < 5
    ? "adapter-rejection"
    : value.rejectedItemCount > 0
    ? "contract-rejection"
    : value.duplicateItemCount > 0
    ? "deduplication"
    : "underfilled";
  return Object.freeze({
    stage,
    searchResults: value.searchResultCount,
    citations: value.citationUrlCount,
    raw: value.rawItemCount,
    normalized: value.normalizedItemCount,
    candidates: value.candidateItemCount,
    eligible: value.eligibleUniqueCount,
    rejected: value.rejectedItemCount,
    duplicates: value.duplicateItemCount,
  });
}

export function formatiereEntdeckenLiveDiagnose(value) {
  const providerFailure = normalizeEntdeckenProviderFailure(value);
  if (providerFailure) {
    return providerFailure.stage === "fetch"
      ? "Stufe fetch; HTTP keiner; Providertyp keiner"
      : `Stufe http; HTTP ${providerFailure.httpStatus}; Providertyp ${providerFailure.providerErrorType || "keiner"}`;
  }
  if (!plain(value) || Object.keys(value).sort().join(",") !== [
    "candidates", "citations", "duplicates", "eligible", "normalized",
    "raw", "rejected", "searchResults", "stage",
  ].sort().join(",") || ![
    "provider-underfilled", "adapter-rejection", "contract-rejection",
    "deduplication", "underfilled",
  ].includes(value.stage) || Object.entries(value).some(([key, entry]) => (
    key !== "stage" && (!Number.isSafeInteger(entry) || entry < 0 || entry > 100)
  ))) return null;
  return `Stufe ${value.stage}; Suche ${value.searchResults}; Zitate ${value.citations}; `
    + `Roh ${value.raw}; normalisiert ${value.normalized}; Kandidaten ${value.candidates}; `
    + `geeignet ${value.eligible}; verworfen ${value.rejected}; Dubletten ${value.duplicates}`;
}

export function pruefeEntdeckenLiveAntwort(antwort, {
  measuredCostUsdCent,
  readbackResponse,
} = {}) {
  if (!plain(antwort) || Object.prototype.hasOwnProperty.call(antwort, "providerDiagnostic")) {
    throw new EntdeckenLiveProofError("FUNCTION_ENVELOPE");
  }
  if (typeof measuredCostUsdCent !== "number" || !Number.isFinite(measuredCostUsdCent)
      || measuredCostUsdCent < 0) {
    throw new EntdeckenLiveProofError("COST_UNKNOWN");
  }
  if (!plain(antwort.refresh) || antwort.refresh.requested !== true
      || antwort.refresh.mode !== "owner"
      || !Number.isSafeInteger(antwort.refresh.attemptCount)
      || antwort.refresh.attemptCount < 1
      || !OWNER_REFRESH_MAX_ATTEMPTS.has(antwort.refresh.maxAttempts)
      || antwort.refresh.attemptCount > antwort.refresh.maxAttempts) {
    const safeStatus = typeof antwort?.refresh?.status === "string"
      && /^[a-z_]+$/.test(antwort.refresh.status)
      ? antwort.refresh.status.toUpperCase() : "INVALID";
    throw new EntdeckenLiveProofError(`CLAIM_${safeStatus}`);
  }
  if (antwort.refresh.status === "failed") {
    const safeReason = typeof antwort.failureReason === "string"
      && /^(?:insufficient_evidence|invalid_response|provider_error|storage_error|source_registry_unavailable)$/.test(antwort.failureReason)
      ? antwort.failureReason : null;
    if (antwort.ok !== true || !["fresh", "stale", "empty"].includes(antwort.status)
        || antwort.writes !== 0 || !Number.isSafeInteger(antwort.providerRequests)
        || antwort.providerRequests < 0 || antwort.providerRequests > 1
        || !Number.isSafeInteger(antwort.searchRequests)
        || antwort.searchRequests < 0 || antwort.searchRequests > 2) {
      throw new EntdeckenLiveProofError("FUNCTION_RESULT");
    }
    const qualityDiagnostic = safeReason === "insufficient_evidence"
      ? insufficientQualityDiagnostic(antwort.quality) : null;
    const providerFailure = safeReason === "provider_error"
      ? normalizeEntdeckenProviderFailure(antwort.providerFailure) : null;
    if (safeReason === "insufficient_evidence"
        && (antwort.status === "fresh" || antwort.responseMode !== "degraded"
          || Object.prototype.hasOwnProperty.call(antwort, "feedReadback")
          || !qualityDiagnostic)) {
      throw new EntdeckenLiveProofError("FUNCTION_RESULT");
    }
    if (["insufficient_evidence", "invalid_response"].includes(safeReason)) {
      const failedReceipt = normalizeProviderReceipt(antwort.providerReceipt);
      if (!failedReceipt || antwort.providerRequests !== 1
          || failedReceipt.server.costUsdCent <= 0
          || measuredCostUsdCent + COST_EPSILON_USD_CENT < failedReceipt.server.costUsdCent
          || antwort.searchRequests !== failedReceipt.usage.webSearchRequests) {
        throw new EntdeckenLiveProofError("RECEIPT_UNCORRELATED");
      }
    }
    if (safeReason === "provider_error" && !providerFailure) {
      throw new EntdeckenLiveProofError("FUNCTION_RESULT");
    }
    throw new EntdeckenLiveProofError(
      `RESULT_${safeReason?.toUpperCase() || "UNKNOWN"}`,
      qualityDiagnostic || providerFailure,
    );
  }
  if (antwort.refresh.status !== "refreshed") {
    const safeStatus = typeof antwort.refresh.status === "string"
      && /^[a-z_]+$/.test(antwort.refresh.status)
      ? antwort.refresh.status.toUpperCase() : "INVALID";
    throw new EntdeckenLiveProofError(`CLAIM_${safeStatus}`);
  }
  const receipt = normalizeProviderReceipt(antwort.providerReceipt);
  if (!receipt || receipt.server.costUsdCent <= 0
      || measuredCostUsdCent + COST_EPSILON_USD_CENT < receipt.server.costUsdCent) {
    throw new EntdeckenLiveProofError("RECEIPT_UNCORRELATED");
  }
  const searchRequests = receipt.usage.webSearchRequests;
  if (antwort.ok !== true || antwort.status !== "fresh" || antwort.writes !== 1
      || antwort.providerRequests !== 1
      || !Number.isSafeInteger(searchRequests) || searchRequests < 1 || searchRequests > 2
      || antwort.searchRequests !== searchRequests
      || !["structured", "partial"].includes(antwort.responseMode)
      || antwort.responseMode !== receipt.resultMode) {
    throw new EntdeckenLiveProofError("FUNCTION_RESULT");
  }
  const requestReadback = normalizeEntdeckenFeedReadback(antwort.feedReadback, {
    feed: antwort.feed,
    providerReceipt: receipt,
  });
  if (!requestReadback) throw new EntdeckenLiveProofError("FEED_READBACK");
  if (!plain(readbackResponse)
      || Object.prototype.hasOwnProperty.call(readbackResponse, "providerDiagnostic")
      || readbackResponse.ok !== true || readbackResponse.status !== "fresh"
      || readbackResponse.writes !== 0 || readbackResponse.providerRequests !== 0
      || readbackResponse.searchRequests !== 0
      || !plain(readbackResponse.refresh)
      || readbackResponse.refresh.requested !== false
      || readbackResponse.refresh.mode !== "read"
      || readbackResponse.refresh.status !== "read_only"
      || JSON.stringify(readbackResponse.feed) !== JSON.stringify(antwort.feed)) {
    throw new EntdeckenLiveProofError("INDEPENDENT_READBACK");
  }
  const readback = normalizeEntdeckenFeedReadback(readbackResponse.feedReadback, {
    feed: readbackResponse.feed,
    providerReceipt: receipt,
  });
  if (!readback || JSON.stringify(readback) !== JSON.stringify(requestReadback)) {
    throw new EntdeckenLiveProofError("INDEPENDENT_READBACK");
  }

  return Object.freeze({
    ok: true,
    result: "PROVEN",
    status: "fresh",
    itemCount: readback.itemCount,
    evidenceCount: readback.evidenceCount,
    sourceCount: readback.sourceCount,
    approvedSourceCount: readback.approvedSourceCount,
    providerRequests: 1,
    searchRequests,
    responseMode: antwort.responseMode,
    receiptState: "correlated",
    costState: "known",
  });
}
