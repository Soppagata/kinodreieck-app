export const ERROR_CODES = Object.freeze({
  OFFLINE: "offline",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  LIMIT: "limit",
  SERVER: "server",
  INVALID_RESPONSE: "invalid-response",
});

const TEXTE = Object.freeze({
  [ERROR_CODES.OFFLINE]: "Keine Netzwerkverbindung. Bitte später erneut versuchen.",
  [ERROR_CODES.UNAUTHENTICATED]: "Für diese Funktion ist eine Anmeldung nötig.",
  [ERROR_CODES.FORBIDDEN]: "Für diese Funktion fehlt die Berechtigung.",
  [ERROR_CODES.LIMIT]: "Das Nutzungslimit ist erreicht. Bitte später erneut versuchen.",
  [ERROR_CODES.SERVER]: "Der Server ist vorübergehend nicht verfügbar.",
  [ERROR_CODES.INVALID_RESPONSE]: "Der Server hat eine ungültige Antwort geliefert.",
});

export class BoundaryError extends Error {
  constructor(code, options = {}) {
    super(options.message || TEXTE[code] || TEXTE[ERROR_CODES.SERVER], { cause: options.cause });
    this.name = "BoundaryError";
    this.code = code;
    this.source = options.source || "unknown";
    this.operation = options.operation || "unknown";
    this.status = Number.isFinite(options.status) ? options.status : null;
    this.retryable = options.retryable ?? [ERROR_CODES.OFFLINE, ERROR_CODES.LIMIT, ERROR_CODES.SERVER].includes(code);
    this.retryAfterMs = Number.isFinite(options.retryAfterMs) ? options.retryAfterMs : null;
    this.requestId = options.requestId || null;
    this.reason = options.reason || null;
  }
}

export function errorText(error) {
  return TEXTE[error?.code] || TEXTE[ERROR_CODES.SERVER];
}

export function errorFromStatus(status, options = {}) {
  const code = status === 401 ? ERROR_CODES.UNAUTHENTICATED
    : status === 403 ? ERROR_CODES.FORBIDDEN
      : status === 429 ? ERROR_CODES.LIMIT
        : status >= 500 ? ERROR_CODES.SERVER
          : ERROR_CODES.INVALID_RESPONSE;
  return new BoundaryError(code, { ...options, status });
}

export function normalizeBoundaryError(error, options = {}) {
  if (error instanceof BoundaryError) return error;
  if (Number.isFinite(error?.status)) {
    return errorFromStatus(error.status, { ...options, cause: error });
  }
  const offline = error instanceof TypeError
    || /network|offline|load failed|failed to fetch|cors/i.test(String(error?.message || error || ""));
  const invalid = /invalid|ungültig|json|payload|response|antwort|fehlt/i.test(String(error?.message || error || ""));
  return new BoundaryError(offline ? ERROR_CODES.OFFLINE : invalid ? ERROR_CODES.INVALID_RESPONSE : ERROR_CODES.SERVER, {
    ...options,
    cause: error,
    reason: error?.name === "AbortError" ? "timeout" : options.reason,
  });
}
