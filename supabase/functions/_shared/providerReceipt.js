/* Dauerhafter, inhaltsfreier Beleg fuer genau eine konsumierte Providerantwort.
   Die Adapter liefern ausschliesslich bereits normalisierte Felder hinein. Der
   tatsaechlich ausgewertete Providertext wird nur im Speicher gehasht und weder
   im Receipt noch anderweitig von diesem Modul zurueckgegeben. */

export const PROVIDER_RECEIPT_VERSION = "provider-receipt-v1";

const PROVIDERS = new Set(["anthropic"]);
const RESULT_MODES = new Set(["structured", "partial", "degraded"]);
const MODEL_FORM = /^[a-z0-9][a-z0-9._:-]{0,79}$/;
const SHA256_FORM = /^[a-f0-9]{64}$/;
const MAX_PROVIDER_RESPONSE_TEXT_BYTES = 8 * 1024 * 1024;

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function exactKeys(value, expected) {
  return plain(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createProviderReceipt({
  provider,
  providerResponseText,
  model,
  inputTokens,
  outputTokens,
  webSearchRequests = null,
  resultMode,
  serverLogId,
  providerRequests,
  reservationUsdCent,
  costUsdCent,
} = {}) {
  if (!PROVIDERS.has(provider)
      || typeof providerResponseText !== "string" || !providerResponseText
      || new TextEncoder().encode(providerResponseText).length > MAX_PROVIDER_RESPONSE_TEXT_BYTES
      || typeof model !== "string" || !MODEL_FORM.test(model)
      || !nonNegativeInteger(inputTokens) || !nonNegativeInteger(outputTokens)
      || (webSearchRequests !== null && !nonNegativeInteger(webSearchRequests))
      || !RESULT_MODES.has(resultMode)
      || !Number.isSafeInteger(serverLogId) || serverLogId <= 0
      || providerRequests !== 1
      || !finiteNonNegative(reservationUsdCent)
      || !finiteNonNegative(costUsdCent)) {
    return null;
  }

  const usage = Object.freeze({
    inputTokens,
    outputTokens,
    ...(webSearchRequests === null ? {} : { webSearchRequests }),
  });
  const server = Object.freeze({
    logId: serverLogId,
    providerRequests,
    reservationUsdCent,
    costUsdCent,
  });
  return Object.freeze({
    schemaVersion: PROVIDER_RECEIPT_VERSION,
    provider,
    model,
    usage,
    responseSha256: await sha256Hex(providerResponseText),
    resultMode,
    server,
  });
}

export function normalizeProviderReceipt(value) {
  if (!exactKeys(value, [
    "schemaVersion", "provider", "model", "usage", "responseSha256",
    "resultMode", "server",
  ])
      || value.schemaVersion !== PROVIDER_RECEIPT_VERSION
      || !PROVIDERS.has(value.provider)
      || typeof value.model !== "string" || !MODEL_FORM.test(value.model)
      || typeof value.responseSha256 !== "string"
      || !SHA256_FORM.test(value.responseSha256)
      || !RESULT_MODES.has(value.resultMode)
      || !exactKeys(value.server, [
        "logId", "providerRequests", "reservationUsdCent", "costUsdCent",
      ])
      || !Number.isSafeInteger(value.server.logId) || value.server.logId <= 0
      || value.server.providerRequests !== 1
      || !finiteNonNegative(value.server.reservationUsdCent)
      || !finiteNonNegative(value.server.costUsdCent)
      || !plain(value.usage)) return null;

  const usageKeys = Object.keys(value.usage).sort().join(",");
  if (!["inputTokens,outputTokens", "inputTokens,outputTokens,webSearchRequests"]
      .includes(usageKeys)
      || !nonNegativeInteger(value.usage.inputTokens)
      || !nonNegativeInteger(value.usage.outputTokens)
      || ("webSearchRequests" in value.usage
        && !nonNegativeInteger(value.usage.webSearchRequests))) return null;

  return Object.freeze({
    schemaVersion: value.schemaVersion,
    provider: value.provider,
    model: value.model,
    usage: Object.freeze({ ...value.usage }),
    responseSha256: value.responseSha256,
    resultMode: value.resultMode,
    server: Object.freeze({ ...value.server }),
  });
}

export function isProviderReceipt(value) {
  return normalizeProviderReceipt(value) !== null;
}
