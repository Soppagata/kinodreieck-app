/* Servergebundener Resend-Transport fuer bereits validierte private Mails.

   Absender, Empfaenger, API-Key und Idempotenzschluessel kommen niemals aus
   dem Browser. Nur der durch die Rohprobe belegte Resend-Vertrag wird als
   terminal ausgewertet; unbekannte Antworten bleiben Zustellstatus unknown. */

import {
  PRIVATE_MAIL_SCHEMA_VERSION,
  PRIVATE_MAIL_TYPES,
  hasExactPrivateMailKeys,
  isPrivateMailOperationId,
  privateMailUtf8Bytes,
} from "../_shared/privateMailContract.js";
import {
  PRIVATE_MAIL_ADAPTER_STATUS,
} from "../_shared/privateMailMessages.js";

export const RESEND_PRIVATE_MAIL_ENDPOINT = "https://api.resend.com/emails";
export const RESEND_PRIVATE_MAIL_SENDER = "feedback@kinodreieck.at";
export const RESEND_PRIVATE_MAIL_TIMEOUT_MS = 20_000;

const RESPONSE_BYTES_LIMIT = 8 * 1024;
const MESSAGE_KEYS = Object.freeze([
  "schemaVersion", "type", "operationId", "subject", "text", "html",
]);
const PROVIDER_MESSAGE_KEYS = Object.freeze(["from", "to", "subject", "text", "html"]);
const MAIL_TYPES = new Set(Object.values(PRIVATE_MAIL_TYPES));
const SAFE_TOKEN = /^[^\s\u0000-\u001f\u007f]+$/;
const SINGLE_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function configuredToken(value) {
  return typeof value === "string" && value.length > 0 && SAFE_TOKEN.test(value);
}

function configuredRecipient(value) {
  return typeof value === "string"
    && value.length <= 254
    && value === value.trim()
    && SINGLE_ADDRESS.test(value);
}

function validMessage(value) {
  return hasExactPrivateMailKeys(value, MESSAGE_KEYS)
    && value.schemaVersion === PRIVATE_MAIL_SCHEMA_VERSION
    && MAIL_TYPES.has(value.type)
    && isPrivateMailOperationId(value.operationId)
    && typeof value.subject === "string" && value.subject.length > 0
    && typeof value.text === "string"
    && typeof value.html === "string";
}

function providerMessage(message, sender, recipient) {
  const value = {
    from: sender,
    to: [recipient],
    subject: message.subject,
    text: message.text,
    html: message.html,
  };
  return hasExactPrivateMailKeys(value, PROVIDER_MESSAGE_KEYS) ? value : null;
}

async function readProviderBody(response) {
  let raw;
  try {
    raw = await response.text();
  } catch {
    throw new Error("resend-response-unreadable");
  }
  if (privateMailUtf8Bytes(raw) > RESPONSE_BYTES_LIMIT) {
    throw new Error("resend-response-too-large");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("resend-response-invalid");
  }
}

function acceptedResponse(response, body) {
  const replayed = response.headers.get("idempotent-replayed");
  return response.status === 200
    && (replayed === "false" || replayed === "true")
    && hasExactPrivateMailKeys(body, ["id"])
    && typeof body.id === "string"
    && body.id.length > 0;
}

function idempotencyConflict(response, body) {
  return response.status === 409
    && hasExactPrivateMailKeys(body, ["message", "name", "statusCode"])
    && typeof body.message === "string"
    && body.message.length > 0
    && body.name === "invalid_idempotent_request"
    && body.statusCode === 409;
}

export function createResendPrivateMailTransport({
  apiKey,
  sender,
  recipient,
  fetchImpl = globalThis.fetch,
  signalFactory = () => AbortSignal.timeout(RESEND_PRIVATE_MAIL_TIMEOUT_MS),
} = {}) {
  if (!configuredToken(apiKey)
      || sender !== RESEND_PRIVATE_MAIL_SENDER
      || !configuredRecipient(recipient)
      || typeof fetchImpl !== "function"
      || typeof signalFactory !== "function") return null;

  return async function resendPrivateMailTransport(message) {
    if (!validMessage(message)) throw new Error("resend-message-invalid");
    const body = providerMessage(message, sender, recipient);
    if (!body) throw new Error("resend-message-invalid");

    let response;
    try {
      response = await fetchImpl(RESEND_PRIVATE_MAIL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.operationId,
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: signalFactory(),
      });
    } catch {
      throw new Error("resend-request-failed");
    }

    const responseBody = await readProviderBody(response);
    if (acceptedResponse(response, responseBody)) {
      return Object.freeze({
        ok: true,
        status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED,
      });
    }
    if (idempotencyConflict(response, responseBody)) {
      return Object.freeze({
        ok: false,
        status: PRIVATE_MAIL_ADAPTER_STATUS.REJECTED,
      });
    }
    throw new Error("resend-delivery-status-unknown");
  };
}
