/* Kapsel fuer den zentralen Acht-Pfade-Harness. Sie liest ausschliesslich die
   normale Functionantwort plus die bereits vorgeschriebene serverseitige
   Kostenmessung. Ausgabe bleibt inhaltsfrei: keine Titel, URLs, Konten oder
   Providerrohantworten. */

import { normalizeProviderReceipt } from
  "../supabase/functions/_shared/providerReceipt.js";
import { normalizeEntdeckenFeedReadback } from
  "../supabase/functions/entdecken-daily-task/readbackContract.js";

const COST_EPSILON_USD_CENT = 0.000001;

export class EntdeckenLiveProofError extends Error {
  constructor(code) {
    super(code);
    this.name = "EntdeckenLiveProofError";
    this.code = code;
  }
}
function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
      || antwort.refresh.mode !== "owner" || antwort.refresh.status !== "refreshed"
      || !Number.isSafeInteger(antwort.refresh.attemptCount)
      || antwort.refresh.attemptCount < 1 || antwort.refresh.attemptCount > 3
      || antwort.refresh.maxAttempts !== 3) {
    const safeStatus = typeof antwort?.refresh?.status === "string"
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
