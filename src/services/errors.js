export const ERROR_CODES = Object.freeze({
  OFFLINE: "offline",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  LIMIT: "limit",
  SERVER: "server",
  INVALID_RESPONSE: "invalid-response",
  /* Etappe 4: zwei Zustände, die vorher fälschlich als „Anmeldung nötig" bzw.
     „ungültige Antwort" durchgingen. Beide sind weder Nutzer- noch Serverfehler:
     INVALID_KEY  = der eingetragene Leseschlüssel wird abgelehnt (echter 401),
     NO_DEMO_DATA = für den öffentlichen Zugang ist noch nichts veröffentlicht.
     errorFromStatus() bildet weiterhin nur die sechs HTTP-Codes ab — diese
     beiden entstehen ausschließlich aus einem erkannten Grund am Fehler. */
  INVALID_KEY: "invalid-key",
  NO_DEMO_DATA: "no-demo-data",
  /* Etappe 5: drei Zustände des KI-Pfads, die weder Nutzer- noch Serverfehler
     sind und deshalb nicht in SERVER oder INVALID_RESPONSE gehören:
     AI_DISABLED     = der Betreiber hat die KI abgeschaltet (Not-Aus),
     AI_REFUSED      = das Modell hat die Bearbeitung abgelehnt (kommt als
                       reguläre Anbieterantwort, nicht als Fehler),
     NOT_IMPLEMENTED = die Aufgabe ist registriert, aber noch nicht gebaut.
     Wie INVALID_KEY/NO_DEMO_DATA entstehen sie ausschließlich aus einem
     gemeldeten Grund, nie aus einem HTTP-Status — errorFromStatus() bleibt
     unverändert bei den sechs Ursprungscodes. */
  AI_DISABLED: "ai-disabled",
  AI_REFUSED: "ai-refused",
  NOT_IMPLEMENTED: "not-implemented",
  /* Nachtrag Review: ein doppelt gestarteter Vorgang meldete vorher
     "Nutzungslimit erreicht" — das war schlicht gelogen. */
  AI_DUPLICATE: "ai-duplicate",
});

const TEXTE = Object.freeze({
  [ERROR_CODES.OFFLINE]: "Keine Netzwerkverbindung. Bitte später erneut versuchen.",
  [ERROR_CODES.UNAUTHENTICATED]: "Für diese Funktion ist eine Anmeldung nötig.",
  [ERROR_CODES.FORBIDDEN]: "Für diese Funktion fehlt die Berechtigung.",
  [ERROR_CODES.LIMIT]: "Das Nutzungslimit ist erreicht. Bitte später erneut versuchen.",
  [ERROR_CODES.SERVER]: "Der Server ist vorübergehend nicht verfügbar.",
  [ERROR_CODES.INVALID_RESPONSE]: "Der Server hat eine ungültige Antwort geliefert.",
  [ERROR_CODES.INVALID_KEY]: "Der hinterlegte Zugangsschlüssel wird nicht akzeptiert.",
  [ERROR_CODES.NO_DEMO_DATA]: "Für den öffentlichen Zugang sind noch keine Beispieldaten veröffentlicht.",
  [ERROR_CODES.AI_DISABLED]: "Die KI-Funktionen sind vorübergehend abgeschaltet. Alles andere funktioniert unverändert.",
  [ERROR_CODES.AI_REFUSED]: "Die KI hat die Bearbeitung dieser Anfrage abgelehnt.",
  [ERROR_CODES.NOT_IMPLEMENTED]: "Diese Funktion ist noch nicht verfügbar.",
  [ERROR_CODES.AI_DUPLICATE]: "Dieser Vorgang läuft bereits.",
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
