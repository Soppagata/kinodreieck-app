/* Inhaltsfreier Fehlervertrag fuer den einzigen Entdecken-Providerrequest.
   Freie Providertexte, Request-IDs, Header, URLs und Payloads werden weder
   uebernommen noch durch diesen Vertrag erreichbar gemacht. */

const SAFE_PROVIDER_ERROR_TYPES = new Set([
  "api_error",
  "authentication_error",
  "billing_error",
  "conflict_error",
  "invalid_request_error",
  "not_found_error",
  "overloaded_error",
  "permission_error",
  "rate_limit_error",
  "request_too_large",
  "timeout_error",
]);

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeHttpStatus(value) {
  return Number.isSafeInteger(value) && value >= 400 && value <= 599 ? value : null;
}

function safeProviderErrorType(value) {
  return typeof value === "string" && SAFE_PROVIDER_ERROR_TYPES.has(value) ? value : null;
}

export function createEntdeckenProviderFetchFailure() {
  return Object.freeze({
    stage: "fetch",
    httpStatus: null,
    providerErrorType: null,
  });
}

export function createEntdeckenProviderHttpFailure(status, body) {
  const httpStatus = safeHttpStatus(status);
  if (httpStatus === null) return null;
  const providerErrorType = body?.type === "error" && plain(body.error)
    ? safeProviderErrorType(body.error.type) : null;
  return Object.freeze({
    stage: "http",
    httpStatus,
    providerErrorType,
  });
}

export function normalizeEntdeckenProviderFailure(value) {
  if (!plain(value)
      || Object.keys(value).sort().join(",") !== "httpStatus,providerErrorType,stage") return null;
  if (value.stage === "fetch") {
    return value.httpStatus === null && value.providerErrorType === null
      ? createEntdeckenProviderFetchFailure() : null;
  }
  if (value.stage !== "http") return null;
  const httpStatus = safeHttpStatus(value.httpStatus);
  const providerErrorType = value.providerErrorType === null
    ? null : safeProviderErrorType(value.providerErrorType);
  if (httpStatus === null || providerErrorType !== value.providerErrorType) return null;
  return Object.freeze({ stage: "http", httpStatus, providerErrorType });
}
