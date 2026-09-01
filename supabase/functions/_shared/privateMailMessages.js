/* Sichere Inhaltserzeugung und injizierbare Transportgrenze fuer private Mail.

   Adressen, Header, Transportdaten und Secrets sind absichtlich nicht Teil des
   erzeugten Objekts. Ein spaeterer Adapter muss diese Werte fest serverseitig
   binden und darf nur `{ ok: true }` zurueckgeben. Dieses Pure-Modul macht
   keine Zustell- oder Einmaligkeitszusage und startet keinen Retry. */

import {
  PRIVATE_MAIL_LIMITS,
  PRIVATE_MAIL_SCHEMA_VERSION,
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
  DELIVERY_FAILED: "delivery-failed",
});

const MESSAGE_KEYS = Object.freeze([
  "schemaVersion", "type", "operationId", "subject", "text", "html",
]);
const TASK_ID = /^[a-z0-9][a-z0-9._:-]*$/;
const ERROR_CODE = /^[A-Z0-9][A-Z0-9_:-]*$/;
const INITIAL_API_CALL = new Set(["made", "unproven"]);
const INITIAL_COST = new Set(["confirmed", "unproven"]);
const RETRY_RESULT = new Set(["succeeded", "failed", "unproven"]);

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

function boundedLine(value, { optional = false, code = false } = {}) {
  if (value === null && optional) return null;
  const normalized = normalizePrivateMailText(value);
  if (!normalized || /\n/.test(normalized)
      || privateMailCodePoints(normalized) > (code
        ? PRIVATE_MAIL_LIMITS.errorCodePoints
        : PRIVATE_MAIL_LIMITS.detailCodePoints)
      || (code && !ERROR_CODE.test(normalized))) return null;
  return normalized;
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
    `Feedback ohne Namensangabe\nZeitpunkt: ${submittedAt}\nVorgang: ${value.operationId}\n\n${feedback}`,
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
    `Authentifizierte Kontolöschanfrage\nZeitpunkt: ${requestedAt}\nKonto-ID: ${value.accountId}\nVorgang: ${value.operationId}\n\nDie Anfrage wird manuell geprüft und bearbeitet. Diese Nachricht löscht kein Konto.`,
  );
}

function operationalRetryMessage(value) {
  const keys = [
    "schemaVersion", "type", "operationId", "occurredAt", "taskId",
    "initialOperationId", "initialApiCall", "initialCost", "initialErrorCode",
    "initialReason", "retryTriggered", "retryOperationId", "retryResult",
    "retryErrorCode", "retryReason",
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
      || value.retryTriggered !== true
      || !RETRY_RESULT.has(value.retryResult)) return null;

  const initialErrorCode = boundedLine(value.initialErrorCode, { optional: true, code: true });
  const initialReason = boundedLine(value.initialReason, { optional: true });
  const retryErrorCode = boundedLine(value.retryErrorCode, { optional: true, code: true });
  const retryReason = boundedLine(value.retryReason, { optional: true });
  if ((value.initialErrorCode !== null && !initialErrorCode)
      || (value.initialReason !== null && !initialReason)
      || (value.retryErrorCode !== null && !retryErrorCode)
      || (value.retryReason !== null && !retryReason)
      || (value.retryResult === "succeeded" && (retryErrorCode || retryReason))) return null;

  const fields = Object.freeze([
    ["Zeitpunkt", value.occurredAt],
    ["Automatische Funktion/Task-ID", value.taskId],
    ["Initiale API-Operation", value.initialOperationId],
    ["Initialer API-Call", value.initialApiCall === "made" ? "gemacht" : "nicht belegt"],
    ["Finalisierte Kosten", value.initialCost === "confirmed" ? "belegt" : "nicht belegt"],
    ["Initialer Fehlercode", initialErrorCode || "nicht vorhanden"],
    ["Initialer Grund", initialReason || "nicht vorhanden"],
    ["Retry ausgelöst", "ja"],
    ["Retry-Operation", value.retryOperationId],
    ["Retry-Ergebnis", value.retryResult === "succeeded" ? "erfolgreich" : value.retryResult === "failed" ? "fehlgeschlagen" : "nicht belegt"],
    ["Retry-Fehlercode", retryErrorCode || "nicht vorhanden"],
    ["Retry-Grund", retryReason || "nicht vorhanden"],
  ]);
  const text = `Automatische KI-Nachprüfung\n${fields.map(([label, content]) => `${label}: ${content}`).join("\n")}`;
  return message(value.type, value.operationId, text);
}

export function buildPrivateMailMessage(value) {
  let built = null;
  if (value?.type === PRIVATE_MAIL_TYPES.FEEDBACK) built = feedbackMessage(value);
  else if (value?.type === PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST) built = deletionMessage(value);
  else if (value?.type === PRIVATE_MAIL_TYPES.OPERATIONAL_RETRY) built = operationalRetryMessage(value);
  return built
    ? Object.freeze({ ok: true, message: built })
    : failure(PRIVATE_MAIL_DISPATCH_CODES.INVALID_MESSAGE);
}

export function createPrivateMailDispatcher(options = {}) {
  const send = hasExactPrivateMailKeys(options, ["transport"])
    && typeof options.transport === "function" ? options.transport : null;
  return Object.freeze({
    async send(input) {
      const built = buildPrivateMailMessage(input);
      if (!built.ok) return built;
      if (!send) return failure(PRIVATE_MAIL_DISPATCH_CODES.TRANSPORT_UNAVAILABLE);
      let result;
      try { result = await send(built.message); }
      catch { return failure(PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_FAILED); }
      if (!hasExactPrivateMailKeys(result, ["ok"]) || result.ok !== true) {
        return failure(PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_FAILED);
      }
      return Object.freeze({
        ok: true,
        type: built.message.type,
        operationId: built.message.operationId,
      });
    },
  });
}
