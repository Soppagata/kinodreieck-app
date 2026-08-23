/* Enger, default-OFF Vertrag fuer den einmaligen Owner-Live-Audit.
   Der unveraenderte Providertext darf nur bei gleichzeitigem festen Header,
   temporaerem Serverflag und bestaetigter Ownerrolle in die Function-Antwort.
   Normale Produktantworten bleiben davon vollstaendig unberuehrt. */

export const PROVIDER_DIAGNOSTIC_HEADER = "x-kd-provider-diagnostic";
export const PROVIDER_DIAGNOSTIC_HEADER_VALUE = "owner-live-v1";
export const PROVIDER_DIAGNOSTIC_ENV = "KD_PROVIDER_LIVE_DIAGNOSTICS_ENABLED";
export const PROVIDER_DIAGNOSTIC_FIELD = "providerDiagnostic";

/**
 * @param {{headerValue?: string | null, enabled?: boolean, owner?: boolean}} [options]
 */
export function providerDiagnosticAccess({
  headerValue = null,
  enabled = false,
  owner = false,
} = {}) {
  const requested = headerValue !== null;
  return Object.freeze({
    requested,
    allowed: requested
      && headerValue === PROVIDER_DIAGNOSTIC_HEADER_VALUE
      && enabled === true
      && owner === true,
  });
}

/** @param {string} rawResponse */
export function providerDiagnosticField(rawResponse) {
  return {
    [PROVIDER_DIAGNOSTIC_FIELD]: {
      rawResponse,
    },
  };
}
