/* Sichere Inhaltserzeugung und injizierbare Transportgrenze fuer private Mail.

   Adressen, Header, Transportdaten und Secrets sind absichtlich nicht Teil des
   erzeugten Objekts. Ein spaeterer Adapter muss diese Werte fest serverseitig
   binden. Nur `{ ok: true, status: "accepted" }` ist Erfolg; eine explizite
   Ablehnung ist davon getrennt. Dieses Pure-Modul macht keine Zustell- oder
   Einmaligkeitszusage und startet keinen Retry. */

import {
  PRIVATE_MAIL_LIMITS,
  PRIVATE_MAIL_SCHEMA_VERSION,
  PRIVATE_MAIL_SUCCESS_STATUS,
  PRIVATE_MAIL_TYPES,
  hasExactPrivateMailKeys,
  isPrivateMailOperationId,
  normalizePrivateMailText,
  privateMailCodePoints,
  privateMailUtf8Bytes,
  validatePrivateMailRequest,
} from "./privateMailContract.js";

export const PRIVATE_MAIL_DISPATCH_CODES = Object.freeze({
  INVALID_MESSAGE: "invalid-message",
  TRANSPORT_UNAVAILABLE: "transport-unavailable",
  DELIVERY_REJECTED: "delivery-rejected",
  DELIVERY_STATUS_UNKNOWN: "delivery-status-unknown",
});

export const PRIVATE_MAIL_ADAPTER_STATUS = Object.freeze({
  ACCEPTED: PRIVATE_MAIL_SUCCESS_STATUS,
  REJECTED: "rejected",
});

export const PRIVATE_MAIL_OPERATIONAL_REASON_CODES = Object.freeze({
  INITIAL_CALL_UNPROVEN: "initial-call-unproven",
  INITIAL_COMPLETION_UNPROVEN: "initial-completion-unproven",
  INITIAL_COST_UNPROVEN: "initial-cost-unproven",
  INITIAL_USAGE_UNPROVEN: "initial-usage-unproven",
  INITIAL_EXECUTION_FAILED: "initial-execution-failed",
  RETRY_BLOCKED: "retry-blocked",
  RETRY_EXECUTION_FAILED: "retry-execution-failed",
  RETRY_STATUS_UNPROVEN: "retry-status-unproven",
});

const MESSAGE_KEYS = Object.freeze([
  "schemaVersion", "type", "operationId", "subject", "text", "html",
]);
const TASK_ID = /^[a-z0-9][a-z0-9._:-]*$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;
const INITIAL_API_CALL = new Set(["made", "unproven"]);
const INITIAL_COST = new Set(["confirmed", "unproven"]);
const RETRY_RESULT = new Set(["succeeded", "failed", "unproven"]);

const INITIAL_REASON_CODES = new Set([
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_CALL_UNPROVEN,
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_COMPLETION_UNPROVEN,
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_COST_UNPROVEN,
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_USAGE_UNPROVEN,
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_EXECUTION_FAILED,
]);
const RETRY_REASON_CODES = new Set([
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_BLOCKED,
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_EXECUTION_FAILED,
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_STATUS_UNPROVEN,
]);
const FAILED_RETRY_REASON_CODES = new Set([
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_BLOCKED,
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_EXECUTION_FAILED,
]);
const REASON_TEXT = Object.freeze({
  [PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_CALL_UNPROVEN]:
    "Der initiale API-Aufruf ist nicht belegt.",
  [PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_COMPLETION_UNPROVEN]:
    "Der terminale Abschluss des initialen Vorgangs ist nicht belegt.",
  [PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_COST_UNPROVEN]:
    "Finalisierte positive Kosten des initialen Vorgangs sind nicht belegt.",
  [PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_USAGE_UNPROVEN]:
    "Usage- oder Tokenwerte des initialen Vorgangs sind nicht belegt.",
  [PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_EXECUTION_FAILED]:
    "Der initiale Vorgang ist fehlgeschlagen.",
  [PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_BLOCKED]:
    "Der Retry wurde durch ein bestehendes Schutzgate abgelehnt.",
  [PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_EXECUTION_FAILED]:
    "Der Retry ist fehlgeschlagen.",
  [PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_STATUS_UNPROVEN]:
    "Der terminale Abschluss des Retry ist nicht belegt.",
});

const SUBJECTS = Object.freeze({
  [PRIVATE_MAIL_TYPES.FEEDBACK]: "Kinodreieck: Feedback ohne Namensangabe",
  [PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST]: "Kinodreieck: Kontolöschanfrage",
  [PRIVATE_MAIL_TYPES.OPERATIONAL_RETRY]: "Kinodreieck: automatische KI-Nachprüfung",
});

function failure(code) {
  return Object.freeze({ ok: false, code });
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const canonical = new Date(parsed).toISOString();
  return canonical === value ? canonical : null;
}

function boundedErrorCode(value) {
  if (value === null) return null;
  const normalized = normalizePrivateMailText(value);
  if (!normalized || /\n/.test(normalized)
      || privateMailCodePoints(normalized) > PRIVATE_MAIL_LIMITS.errorCodePoints
      || !ERROR_CODE.test(normalized)) return null;
  return normalized;
}

function mappedReason(code) {
  return `${code} – ${REASON_TEXT[code]}`;
}

export function escapePrivateMailHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlFromPlainText(value) {
  return `<p>${escapePrivateMailHtml(value).replace(/\n/g, "<br>")}</p>`;
}

export function privateMailBodiesFit(value) {
  return hasExactPrivateMailKeys(value, ["text", "html"])
    && typeof value.text === "string"
    && typeof value.html === "string"
    && privateMailUtf8Bytes(value.text) <= PRIVATE_MAIL_LIMITS.messageTextBytes
    && privateMailUtf8Bytes(value.html) <= PRIVATE_MAIL_LIMITS.messageHtmlBytes;
}

function message(type, operationId, text) {
  const html = htmlFromPlainText(text);
  if (!privateMailBodiesFit({ text, html })) return null;
  const result = Object.freeze({
    schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
    type,
    operationId,
    subject: SUBJECTS[type],
    text,
    html,
  });
  return hasExactPrivateMailKeys(result, MESSAGE_KEYS) ? result : null;
}

function feedbackMessage(value) {
  if (!hasExactPrivateMailKeys(value, [
    "schemaVersion", "type", "operationId", "submittedAt", "text",
  ])) return null;
  const checked = validatePrivateMailRequest({
    schemaVersion: value.schemaVersion,
    type: value.type,
    operationId: value.operationId,
    text: value.text,
  });
  const submittedAt = canonicalTimestamp(value.submittedAt);
  if (!checked.ok || !submittedAt) return null;
  const feedback = checked.request.text;
  return message(
    value.type,
    value.operationId,
    `Feedback ohne Namensangabe\nZeitpunkt: ${submittedAt}\n\n${feedback}`,
  );
}

function deletionMessage(value) {
  if (!hasExactPrivateMailKeys(value, [
    "schemaVersion", "type", "operationId", "requestedAt", "accountId",
  ])) return null;
  const request = validatePrivateMailRequest({
    schemaVersion: value.schemaVersion,
    type: value.type,
    operationId: value.operationId,
  });
  const requestedAt = canonicalTimestamp(value.requestedAt);
  if (!request.ok || !requestedAt || !isPrivateMailOperationId(value.accountId)) return null;
  return message(
    value.type,
    value.operationId,
    `Authentifizierte Kontolöschanfrage\nZeitpunkt: ${requestedAt}\nKonto-ID: ${value.accountId}\n\nDie Anfrage wird manuell geprüft und bearbeitet. Diese Nachricht löscht kein Konto.`,
  );
}

function operationalRetryMessage(value) {
  const keys = [
    "schemaVersion", "type", "operationId", "occurredAt", "taskId",
    "initialOperationId", "initialApiCall", "initialCost", "initialErrorCode",
    "initialReasonCode", "retryTriggered", "retryOperationId", "retryResult",
    "retryErrorCode", "retryReasonCode",
  ];
  if (!hasExactPrivateMailKeys(value, keys)
      || value.schemaVersion !== PRIVATE_MAIL_SCHEMA_VERSION
      || value.type !== PRIVATE_MAIL_TYPES.OPERATIONAL_RETRY
      || !isPrivateMailOperationId(value.operationId)
      || !isPrivateMailOperationId(value.initialOperationId)
      || !isPrivateMailOperationId(value.retryOperationId)
      || !canonicalTimestamp(value.occurredAt)
      || typeof value.taskId !== "string" || !TASK_ID.test(value.taskId)
      || privateMailCodePoints(value.taskId) > PRIVATE_MAIL_LIMITS.taskIdCodePoints
      || !INITIAL_API_CALL.has(value.initialApiCall)
      || !INITIAL_COST.has(value.initialCost)
      || (value.initialApiCall === "unproven" && value.initialCost === "confirmed")
      || !INITIAL_REASON_CODES.has(value.initialReasonCode)
      || value.retryTriggered !== true
      || !RETRY_RESULT.has(value.retryResult)) return null;

  const initialErrorCode = boundedErrorCode(value.initialErrorCode);
  const retryErrorCode = boundedErrorCode(value.retryErrorCode);
  if ((value.initialErrorCode !== null && !initialErrorCode)
      || (value.retryErrorCode !== null && !retryErrorCode)
      || (value.initialApiCall === "unproven"
        && value.initialReasonCode !== PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_CALL_UNPROVEN)
      || (value.initialApiCall === "made"
        && value.initialReasonCode === PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_CALL_UNPROVEN)
      || (value.initialCost === "confirmed"
        && value.initialReasonCode === PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_COST_UNPROVEN)
      || (value.retryResult === "succeeded"
        && (retryErrorCode || value.retryReasonCode !== null))
      || (value.retryResult === "failed"
        && !FAILED_RETRY_REASON_CODES.has(value.retryReasonCode))
      || (value.retryResult === "unproven"
        && value.retryReasonCode !== PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_STATUS_UNPROVEN)
      || (value.retryResult !== "succeeded" && !RETRY_REASON_CODES.has(value.retryReasonCode))) return null;

  const fields = Object.freeze([
    ["Zeitpunkt", value.occurredAt],
    ["Automatische Funktion/Task-ID", value.taskId],
    ["Initiale API-Operation", value.initialOperationId],
    ["Initialer API-Call", value.initialApiCall === "made" ? "gemacht" : "nicht belegt"],
    ["Finalisierte Kosten", value.initialCost === "confirmed" ? "belegt" : "nicht belegt"],
    ["Initialer Fehlercode", initialErrorCode || "nicht vorhanden"],
    ["Initialer Grund", mappedReason(value.initialReasonCode)],
    ["Retry ausgelöst", "ja"],
    ["Retry-Operation", value.retryOperationId],
    ["Retry-Ergebnis", value.retryResult === "succeeded" ? "erfolgreich" : value.retryResult === "failed" ? "fehlgeschlagen" : "nicht belegt"],
    ["Retry-Fehlercode", retryErrorCode || "nicht vorhanden"],
    ["Retry-Grund", value.retryReasonCode === null ? "nicht vorhanden" : mappedReason(value.retryReasonCode)],
  ]);
  const text = `Automatische KI-Nachprüfung\n${fields.map(([label, content]) => `${label}: ${content}`).join("\n")}`;
  return message(value.type, value.operationId, text);
}

function messageResult(built) {
  return built
    ? Object.freeze({ ok: true, message: built })
    : failure(PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE);
}

export function buildPrivateFeedbackMessage(value) {
  return messageResult(feedbackMessage(value));
}

export function buildPrivateAccountDeletionMessage(value) {
  return messageResult(deletionMessage(value));
}

export function buildPrivateOperationalRetryMessage(value) {
  return messageResult(operationalRetryMessage(value));
}

function createTypedDispatcher(build, options = {}) {
  const send = hasExactPrivateMailKeys(options, ["transport"])
    && typeof options.transport === "function" ? options.transport : null;
  return Object.freeze({
    async send(input) {
      const built = build(input);
      if (!built.ok) return built;
      if (!send) return failure(PRIVATE_MAIL_DISPATCH_CODES.TRANSPORT_UNAVAILABLE);
      let result;
      try { result = await send(built.message); }
      catch { return failure(PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_STATUS_UNKNOWN); }
      if (hasExactPrivateMailKeys(result, ["ok", "status"])
          && result.ok === false
          && result.status === PRIVATE_MAIL_ADAPTER_STATUS.REJECTED) {
        return failure(PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_REJECTED);
      }
      if (!hasExactPrivateMailKeys(result, ["ok", "status"])
          || result.ok !== true
          || result.status !== PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED) {
        return failure(PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_STATUS_UNKNOWN);
      }
      return Object.freeze({
        ok: true,
        status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED,
        type: built.message.type,
        operationId: built.message.operationId,
      });
    },
  });
}

export function createPrivateFeedbackDispatcher(options = {}) {
  return createTypedDispatcher(buildPrivateFeedbackMessage, options);
}

export function createPrivateAccountDeletionDispatcher(options = {}) {
  return createTypedDispatcher(buildPrivateAccountDeletionMessage, options);
}

export function createPrivateOperationalRetryDispatcher(options = {}) {
  return createTypedDispatcher(buildPrivateOperationalRetryMessage, options);
}
