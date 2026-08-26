/* Normale HTTP-Produktantwort des Entdecken-Endpunkts. Die inhaltsfreie
   Qualitaetsklasse bewahrt keine Titel, URLs oder Providertexte, verhindert
   aber, dass ein bezahlter Fehllauf nur als unspezifisches CLAIM_FAILED endet. */

import { normalizeEntdeckenProviderFailure } from "./providerFailureContract.js";

const FAILURE_REASONS = new Set([
  "setup-invalid", "storage_error", "source_registry_unavailable",
  "provider_error", "invalid_response", "insufficient_evidence",
]);

function safeCount(value, max = 100) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max ? value : 0;
}

function qualitySummary(result, telemetry) {
  if (telemetry?.providerRequests !== 1 && !result?.quality) return null;
  return Object.freeze({
    searchResultCount: safeCount(telemetry?.resultCount, 20),
    citationUrlCount: safeCount(telemetry?.citationUrlCount, 20),
    rawItemCount: safeCount(telemetry?.rawItemCount, 100),
    normalizedItemCount: safeCount(telemetry?.normalizedItemCount, 12),
    candidateItemCount: safeCount(result?.quality?.candidateItemCount, 12),
    eligibleUniqueCount: safeCount(result?.quality?.eligibleUniqueCount, 12),
    rejectedItemCount: safeCount(result?.quality?.rejectedItemCount, 12),
    duplicateItemCount: safeCount(result?.quality?.duplicateItemCount, 12),
  });
}

export function createEntdeckenDailyResponse(result = {}, telemetry = {}) {
  const refresh = result?.refresh && typeof result.refresh === "object"
    && !Array.isArray(result.refresh)
    ? Object.freeze({ ...result.refresh })
    : Object.freeze({
      requested: false, mode: "read", status: "unavailable",
      attemptCount: 0, maxAttempts: 3,
    });
  const failureReason = refresh.requested === true && FAILURE_REASONS.has(result?.reason)
    ? result.reason : null;
  const providerFailure = failureReason === "provider_error"
    ? normalizeEntdeckenProviderFailure(result?.providerFailure) : null;
  const quality = qualitySummary(result, telemetry);
  return Object.freeze({
    ok: true,
    status: result.status,
    feed: result.feed,
    writes: Number.isInteger(result.writes) ? result.writes : 0,
    providerRequests: Number.isInteger(telemetry?.providerRequests)
      ? telemetry.providerRequests : 0,
    searchRequests: Number.isInteger(telemetry?.searchRequests)
      ? telemetry.searchRequests : 0,
    responseMode: result.responseMode,
    displayText: result.displayText,
    warnings: result.warnings,
    refresh,
    ...(failureReason ? { failureReason } : {}),
    ...(providerFailure ? { providerFailure } : {}),
    ...(quality ? { quality } : {}),
    ...(result.feedReadback ? { feedReadback: result.feedReadback } : {}),
    ...(result.providerReceipt ? { providerReceipt: result.providerReceipt } : {}),
  });
}
