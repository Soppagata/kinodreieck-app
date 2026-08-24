/* Normale HTTP-Produktantwort des Entdecken-Endpunkts. Diagnosefelder sind
   bewusst kein Teil dieses Vertrags und werden fuer Live-Belege nie benoetigt. */

export function createEntdeckenDailyResponse(result = {}, telemetry = {}) {
  const refresh = result?.refresh && typeof result.refresh === "object"
    && !Array.isArray(result.refresh)
    ? Object.freeze({ ...result.refresh })
    : Object.freeze({
      requested: false, mode: "read", status: "unavailable",
      attemptCount: 0, maxAttempts: 3,
    });
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
    ...(result.feedReadback ? { feedReadback: result.feedReadback } : {}),
    ...(result.providerReceipt ? { providerReceipt: result.providerReceipt } : {}),
  });
}
