/* Einmalige, inhaltsfreie Anthropic-Trennprobe fuer Staging.
   Sie verwendet denselben Edge-Secretzugriff wie Entdecken, aber weder
   Websearch noch Feed-/Lease-/Empfehlungslogik. Providertext, Request-IDs und
   Headerwerte bleiben ausschliesslich im kurzlebigen privaten Rawbeleg. */

import {
  createEntdeckenProviderFetchFailure,
  createEntdeckenProviderHttpFailure,
  normalizeEntdeckenProviderFailure,
} from "./providerFailureContract.js";

export const ENTDECKEN_PROVIDER_PROBE_HEADER = "x-kd-entdecken-provider-probe";
export const ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE = "owner-minimal-v1";
export const ENTDECKEN_PROVIDER_PROBE_TASK = "entdecken-provider-probe";
export const ENTDECKEN_PROVIDER_PROBE_PROMPT_VERSION = "provider-probe-v1";
export const ENTDECKEN_PROVIDER_PROBE_OPERATION_ID = "7a60c0d2-37e7-4e9a-9a6d-b4442fb40c1e";
export const ENTDECKEN_PROVIDER_PROBE_MAX_TOKENS = 1;
export const ENTDECKEN_PROVIDER_PROBE_MAX_RAW_BYTES = 128 * 1024;
export const ENTDECKEN_PROVIDER_PROBE_RESERVATION_INPUT_TOKENS = 4096;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL_FORM = /^claude-haiku-4-5(?:-[0-9]{8})?$/;
const MODEL_PRICE_FLOOR = Object.freeze({ input: 100, output: 500 });
const SAFE_CAUSES = new Set([
  "authenticated",
  "authentication_rejected",
  "billing_rejected",
  "invalid_request_or_spend_limit",
  "permission_rejected",
  "rate_limited",
  "provider_unavailable",
  "request_too_large",
  "response_contract_invalid",
  "transport_failed",
  "transport_timeout",
]);
const PUBLIC_KEYS = Object.freeze([
  "cause",
  "costKnown",
  "costStatus",
  "costUsdCent",
  "organizationHeaderPresent",
  "outputTokens",
  "providerErrorType",
  "providerHttpStatus",
  "providerRequests",
  "usageKnown",
  "workspaceHeaderPresent",
]);

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function roundCost(value) {
  return Math.ceil(value * 10_000) / 10_000;
}
function safeTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export class EntdeckenProviderProbeError extends Error {
  constructor(code) {
    super(code);
    this.name = "EntdeckenProviderProbeError";
    this.code = code;
  }
}

export function buildEntdeckenProviderProbeBody(model) {
  if (typeof model !== "string" || !MODEL_FORM.test(model)) {
    throw new EntdeckenProviderProbeError("probe-setup-invalid");
  }
  return Object.freeze({
    model,
    max_tokens: ENTDECKEN_PROVIDER_PROBE_MAX_TOKENS,
    messages: Object.freeze([
      Object.freeze({ role: "user", content: "Reply with OK." }),
    ]),
  });
}

export function validateEntdeckenProviderProbeSetup(value) {
  if (!plain(value) || value.providerAllowed !== true || value.modelAlias !== "klein"
      || !MODEL_FORM.test(value.model)
      || !finitePositive(value.inputPriceUsdCentPerMtok)
      || !finitePositive(value.outputPriceUsdCentPerMtok)
      || value.inputPriceUsdCentPerMtok < MODEL_PRICE_FLOOR.input
      || value.outputPriceUsdCentPerMtok < MODEL_PRICE_FLOOR.output
      || !finitePositive(value.taskCapUsdCent)
      || !finitePositive(value.globalRequestCapUsdCent)
      || value.taskCapUsdCent > value.globalRequestCapUsdCent
      || value.globalRequestCapUsdCent > 500
      || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > 135_000) {
    throw new EntdeckenProviderProbeError("probe-setup-invalid");
  }
  return Object.freeze({ ...value });
}

function usageFromBody(body) {
  if (!plain(body) || body.type !== "message" || !plain(body.usage)) return null;
  const inputTokens = safeTokenCount(body.usage.input_tokens);
  const outputTokens = safeTokenCount(body.usage.output_tokens);
  const cacheCreation = body.usage.cache_creation_input_tokens == null
    ? 0 : safeTokenCount(body.usage.cache_creation_input_tokens);
  const cacheRead = body.usage.cache_read_input_tokens == null
    ? 0 : safeTokenCount(body.usage.cache_read_input_tokens);
  if ([inputTokens, outputTokens, cacheCreation, cacheRead].some((value) => value === null)
      || outputTokens > ENTDECKEN_PROVIDER_PROBE_MAX_TOKENS) {
    return null;
  }
  return Object.freeze({
    inputTokens: inputTokens + cacheCreation + cacheRead,
    outputTokens,
  });
}

function costFromUsage(setup, usage) {
  if (!usage) return null;
  const cost = roundCost(
    (usage.inputTokens * setup.inputPriceUsdCentPerMtok) / 1_000_000
      + (usage.outputTokens * setup.outputPriceUsdCentPerMtok) / 1_000_000,
  );
  return finitePositive(cost) ? cost : null;
}

export function estimateEntdeckenProviderProbeReservation(setupInput) {
  const setup = validateEntdeckenProviderProbeSetup(setupInput);
  const cost = roundCost(
    (ENTDECKEN_PROVIDER_PROBE_RESERVATION_INPUT_TOKENS
      * setup.inputPriceUsdCentPerMtok) / 1_000_000
      + (ENTDECKEN_PROVIDER_PROBE_MAX_TOKENS
        * setup.outputPriceUsdCentPerMtok) / 1_000_000,
  );
  if (!finitePositive(cost) || cost > setup.taskCapUsdCent
      || cost > setup.globalRequestCapUsdCent) {
    throw new EntdeckenProviderProbeError("probe-reservation-invalid");
  }
  return cost;
}

function causeForResponse(httpStatus, providerErrorType, validMessage) {
  if (httpStatus === 200) return validMessage
    ? "authenticated" : "response_contract_invalid";
  if (providerErrorType === "authentication_error" || httpStatus === 401) {
    return "authentication_rejected";
  }
  if (providerErrorType === "billing_error" || httpStatus === 402) {
    return "billing_rejected";
  }
  if (providerErrorType === "permission_error" || httpStatus === 403) {
    return "permission_rejected";
  }
  if (providerErrorType === "rate_limit_error" || httpStatus === 429) {
    return "rate_limited";
  }
  if (providerErrorType === "request_too_large" || httpStatus === 413) {
    return "request_too_large";
  }
  if (providerErrorType === "invalid_request_error" || httpStatus === 400) {
    return "invalid_request_or_spend_limit";
  }
  return "provider_unavailable";
}

function publicResult({
  cause,
  costStatus,
  costUsdCent,
  organizationHeaderPresent,
  outputTokens,
  providerErrorType,
  providerHttpStatus,
  providerRequests,
  usageKnown,
  workspaceHeaderPresent,
}) {
  if (!SAFE_CAUSES.has(cause)) {
    throw new EntdeckenProviderProbeError("probe-result-invalid");
  }
  return Object.freeze({
    cause,
    costKnown: costStatus === "actual",
    costStatus,
    costUsdCent,
    organizationHeaderPresent,
    outputTokens,
    providerErrorType,
    providerHttpStatus,
    providerRequests,
    usageKnown,
    workspaceHeaderPresent,
  });
}

async function responseText(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > ENTDECKEN_PROVIDER_PROBE_MAX_RAW_BYTES) {
    throw new EntdeckenProviderProbeError("probe-response-size-invalid");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new EntdeckenProviderProbeError("probe-response-encoding-invalid");
  }
}

export function validateEntdeckenProviderProbePublicResult(value) {
  const normalizedFailure = value?.providerHttpStatus !== null
    && value?.providerErrorType !== null
    ? normalizeEntdeckenProviderFailure({
      stage: "http",
      httpStatus: value?.providerHttpStatus,
      providerErrorType: value?.providerErrorType,
    })
    : null;
  const causeConsistent = value?.providerHttpStatus === null
    ? ["transport_failed", "transport_timeout"].includes(value?.cause)
    : value?.providerHttpStatus === 200
      ? ["authenticated", "response_contract_invalid"].includes(value?.cause)
      : causeForResponse(
        value?.providerHttpStatus,
        value?.providerErrorType,
        false,
      ) === value?.cause;
  if (!plain(value) || Object.keys(value).sort().join(",") !== PUBLIC_KEYS.join(",")
      || !SAFE_CAUSES.has(value.cause)
      || !causeConsistent
      || typeof value.costKnown !== "boolean"
      || !["actual", "reserved"].includes(value.costStatus)
      || !finitePositive(value.costUsdCent)
      || typeof value.organizationHeaderPresent !== "boolean"
      || !(value.outputTokens === null || safeTokenCount(value.outputTokens) === value.outputTokens)
      || !(value.providerErrorType === null || normalizedFailure?.providerErrorType === value.providerErrorType)
      || !(value.providerHttpStatus === null
        || (Number.isSafeInteger(value.providerHttpStatus)
          && value.providerHttpStatus >= 200 && value.providerHttpStatus <= 599))
      || value.providerRequests !== 1
      || typeof value.usageKnown !== "boolean"
      || typeof value.workspaceHeaderPresent !== "boolean"
      || value.costKnown !== (value.costStatus === "actual")
      || value.usageKnown !== (value.outputTokens !== null)) {
    return null;
  }
  return Object.freeze({ ...value });
}

export function validateEntdeckenProviderProbeRawEvidence(rawResponse, safeResult) {
  const result = validateEntdeckenProviderProbePublicResult(safeResult);
  if (!result || typeof rawResponse !== "string" || !rawResponse) return false;
  let body;
  try { body = JSON.parse(rawResponse); } catch { return false; }
  if (result.providerHttpStatus === 200) {
    const usage = usageFromBody(body);
    return body?.type === "message" && !!usage
      && result.cause === "authenticated"
      && result.providerErrorType === null
      && result.outputTokens === usage.outputTokens;
  }
  const failure = createEntdeckenProviderHttpFailure(result.providerHttpStatus, body);
  return !!failure && failure.providerErrorType === result.providerErrorType
    && result.cause !== "authenticated";
}

/**
 * @param {{
 *   apiKey?: string,
 *   fetchImpl?: typeof fetch,
 *   loadSetup?: (() => Promise<unknown>) | null,
 *   operationId?: () => string,
 *   readSettledCost?: ((input: {logId: number, operationId: string}) => Promise<unknown>) | null,
 *   reserveCost?: ((input: {operationId: string, reservationUsdCent: number, providerRequests: number}) => Promise<{ok?: boolean, logId?: unknown}>) | null,
 *   settleCost?: ((input: {logId: number, status: string, model: string, inputTokens: number | null, outputTokens: number | null, costUsdCent: number | null, errorClass: string | null}) => Promise<void>) | null
 * }} [options]
 */
export function createAnthropicEntdeckenProviderProbe({
  apiKey = "",
  fetchImpl = fetch,
  loadSetup = null,
  operationId = () => ENTDECKEN_PROVIDER_PROBE_OPERATION_ID,
  readSettledCost = null,
  reserveCost = null,
  settleCost = null,
} = {}) {
  let used = false;
  return Object.freeze({
    async run() {
      if (used) throw new EntdeckenProviderProbeError("probe-already-used");
      used = true;
      if (typeof apiKey !== "string" || !apiKey || apiKey !== apiKey.trim()
          || /[\0\r\n]/.test(apiKey) || typeof fetchImpl !== "function"
          || typeof loadSetup !== "function" || typeof reserveCost !== "function"
          || typeof settleCost !== "function" || typeof readSettledCost !== "function") {
        throw new EntdeckenProviderProbeError("probe-setup-invalid");
      }
      const setup = validateEntdeckenProviderProbeSetup(await loadSetup());
      const body = buildEntdeckenProviderProbeBody(setup.model);
      const reservationUsdCent = estimateEntdeckenProviderProbeReservation(setup);
      const requestOperationId = operationId();
      const reservation = await reserveCost({
        operationId: requestOperationId,
        reservationUsdCent,
        providerRequests: 1,
      });
      const logId = Number(reservation?.logId);
      if (reservation?.ok !== true || !Number.isSafeInteger(logId) || logId <= 0) {
        throw new EntdeckenProviderProbeError("probe-cost-gate-rejected");
      }

      let response = null;
      let rawResponse = null;
      let parsedBody = null;
      let providerFailure = null;
      let usage = null;
      let actualCost = null;
      let cause = "transport_failed";
      let settled = false;
      const settle = async () => {
        if (settled) throw new EntdeckenProviderProbeError("probe-settlement-invalid");
        settled = true;
        await settleCost({
          logId,
          status: cause === "authenticated" ? "fertig" : "fehler",
          model: setup.model,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          costUsdCent: actualCost,
          errorClass: cause === "authenticated" ? null : "provider-probe-rejected",
        });
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), setup.timeoutMs);
      try {
        try {
          response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
            method: "POST",
            redirect: "error",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          rawResponse = await responseText(response);
          try { parsedBody = JSON.parse(rawResponse); } catch { parsedBody = null; }
        } catch (error) {
          if (error instanceof EntdeckenProviderProbeError) throw error;
          cause = error?.name === "AbortError" ? "transport_timeout" : "transport_failed";
          providerFailure = createEntdeckenProviderFetchFailure();
        }

        if (response) {
          providerFailure = response.ok
            ? null : createEntdeckenProviderHttpFailure(response.status, parsedBody);
          usage = usageFromBody(parsedBody);
          actualCost = costFromUsage(setup, usage);
          const validMessage = response.status === 200 && !!usage && actualCost !== null
            && actualCost <= reservationUsdCent
            && actualCost <= setup.taskCapUsdCent
            && actualCost <= setup.globalRequestCapUsdCent;
          cause = causeForResponse(
            response.status,
            providerFailure?.providerErrorType ?? null,
            validMessage,
          );
        }
        await settle();
      } catch (error) {
        if (!settled) {
          try { await settle(); } catch { /* der aeussere Fehler bleibt fail-closed */ }
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }

      const persisted = await readSettledCost({ logId, operationId: requestOperationId });
      const persistedCost = Number(persisted?.costUsdCent);
      if (persisted?.logId !== logId || persisted?.operationId !== requestOperationId
          || persisted?.task !== ENTDECKEN_PROVIDER_PROBE_TASK
          || persisted?.status !== (cause === "authenticated" ? "fertig" : "fehler")
          || !finitePositive(persistedCost)
          || (actualCost !== null && persistedCost !== actualCost)
          || (actualCost === null && persistedCost !== reservationUsdCent)) {
        throw new EntdeckenProviderProbeError("probe-cost-readback-invalid");
      }

      const safe = publicResult({
        cause,
        costStatus: actualCost === null ? "reserved" : "actual",
        costUsdCent: persistedCost,
        organizationHeaderPresent: response?.headers?.has("anthropic-organization-id") === true,
        outputTokens: usage?.outputTokens ?? null,
        providerErrorType: providerFailure?.providerErrorType ?? null,
        providerHttpStatus: Number.isSafeInteger(response?.status) ? response.status : null,
        providerRequests: 1,
        usageKnown: usage !== null,
        workspaceHeaderPresent: response?.headers?.has("anthropic-workspace-id") === true,
      });
      if (!validateEntdeckenProviderProbePublicResult(safe)) {
        throw new EntdeckenProviderProbeError("probe-result-invalid");
      }
      return Object.freeze({ safe, rawResponse });
    },
  });
}
