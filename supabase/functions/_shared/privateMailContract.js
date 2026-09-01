/* Transportunabhaengiger Vertrag fuer die drei privaten Mailtypen.

   Dieses Modul kennt weder Transport, Adressen, Header noch externe Datenformen.
   Der Browser darf nur Feedback und eine Kontoloeschanfrage anfordern. Die
   Betriebs-Mail ist ausschliesslich ein serverinterner Nachrichtentyp. */

export const PRIVATE_MAIL_SCHEMA_VERSION = 1;

export const PRIVATE_MAIL_TYPES = Object.freeze({
  FEEDBACK: "feedback",
  ACCOUNT_DELETION_REQUEST: "account-deletion-request",
  OPERATIONAL_RETRY: "operational-retry",
});

export const PRIVATE_MAIL_BROWSER_TYPES = Object.freeze([
  PRIVATE_MAIL_TYPES.FEEDBACK,
  PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST,
]);

export const PRIVATE_MAIL_LIMITS = Object.freeze({
  requestBytes: 8 * 1024,
  feedbackCodePoints: 2000,
  messageTextBytes: 10 * 1024,
  messageHtmlBytes: 16 * 1024,
  taskIdCodePoints: 80,
  errorCodePoints: 80,
  detailCodePoints: 240,
});

export const PRIVATE_MAIL_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "invalid-request",
  REQUEST_TOO_LARGE: "request-too-large",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  RATE_LIMITED: "rate-limited",
  UNAVAILABLE: "unavailable",
});

export const PRIVATE_MAIL_SUCCESS_STATUS = "accepted";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DISALLOWED_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const BROWSER_TYPES = new Set(PRIVATE_MAIL_BROWSER_TYPES);
const ERROR_CODES = new Set(Object.values(PRIVATE_MAIL_ERROR_CODES));

export function isPrivateMailPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

export function hasExactPrivateMailKeys(value, expected) {
  if (!isPrivateMailPlainObject(value) || !Array.isArray(expected)) return false;
  try {
    return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
  } catch {
    return false;
  }
}

export function isPrivateMailOperationId(value) {
  return typeof value === "string" && UUID.test(value);
}

export function privateMailUtf8Bytes(value) {
  try { return new TextEncoder().encode(String(value)).length; }
  catch { return Number.POSITIVE_INFINITY; }
}

export function normalizePrivateMailText(value) {
  if (typeof value !== "string" || DISALLOWED_TEXT.test(value)) return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized || null;
}

export function privateMailCodePoints(value) {
  return typeof value === "string" ? [...value].length : Number.POSITIVE_INFINITY;
}

function requestFailure(code) {
  return Object.freeze({ ok: false, code });
}

function requestBytes(value, rawByteLength) {
  if (rawByteLength !== null && rawByteLength !== undefined) {
    return Number.isSafeInteger(rawByteLength) && rawByteLength >= 0
      ? rawByteLength : Number.POSITIVE_INFINITY;
  }
  try { return privateMailUtf8Bytes(JSON.stringify(value)); }
  catch { return Number.POSITIVE_INFINITY; }
}

export function validatePrivateMailRequest(value, { rawByteLength = null } = {}) {
  const bytes = requestBytes(value, rawByteLength);
  if (bytes > PRIVATE_MAIL_LIMITS.requestBytes) {
    return requestFailure(PRIVATE_MAIL_ERROR_CODES.REQUEST_TOO_LARGE);
  }
  if (!isPrivateMailPlainObject(value)
      || value.schemaVersion !== PRIVATE_MAIL_SCHEMA_VERSION
      || !BROWSER_TYPES.has(value.type)
      || !isPrivateMailOperationId(value.operationId)) {
    return requestFailure(PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);
  }

  if (value.type === PRIVATE_MAIL_TYPES.FEEDBACK) {
    if (!hasExactPrivateMailKeys(value, ["schemaVersion", "operationId", "type", "text"])) {
      return requestFailure(PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);
    }
    const text = normalizePrivateMailText(value.text);
    if (!text || privateMailCodePoints(text) > PRIVATE_MAIL_LIMITS.feedbackCodePoints) {
      return requestFailure(PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);
    }
    return Object.freeze({
      ok: true,
      request: Object.freeze({
        schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
        operationId: value.operationId,
        type: value.type,
        text,
      }),
    });
  }

  if (!hasExactPrivateMailKeys(value, ["schemaVersion", "operationId", "type"])) {
    return requestFailure(PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST);
  }
  return Object.freeze({
    ok: true,
    request: Object.freeze({
      schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
      operationId: value.operationId,
      type: value.type,
    }),
  });
}

export function createPrivateMailSuccessResponse({ type, operationId } = {}) {
  if (!BROWSER_TYPES.has(type) || !isPrivateMailOperationId(operationId)) return null;
  return Object.freeze({
    ok: true,
    schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
    type,
    operationId,
    status: PRIVATE_MAIL_SUCCESS_STATUS,
  });
}

export function createPrivateMailFailureResponse(code) {
  return Object.freeze({
    ok: false,
    schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
    code: ERROR_CODES.has(code) ? code : PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE,
  });
}

export function normalizePrivateMailResponse(value, {
  expectedType = null,
  expectedOperationId = null,
} = {}) {
  if (!isPrivateMailPlainObject(value) || value.schemaVersion !== PRIVATE_MAIL_SCHEMA_VERSION) return null;
  if (value.ok === false) {
    if (!hasExactPrivateMailKeys(value, ["ok", "schemaVersion", "code"])
        || !ERROR_CODES.has(value.code)) return null;
    return Object.freeze({ ...value });
  }
  if (value.ok !== true
      || !hasExactPrivateMailKeys(value, ["ok", "schemaVersion", "type", "operationId", "status"])
      || !BROWSER_TYPES.has(value.type)
      || !isPrivateMailOperationId(value.operationId)
      || value.status !== PRIVATE_MAIL_SUCCESS_STATUS
      || (expectedType !== null && value.type !== expectedType)
      || (expectedOperationId !== null && value.operationId !== expectedOperationId)) return null;
  return Object.freeze({ ...value });
}
