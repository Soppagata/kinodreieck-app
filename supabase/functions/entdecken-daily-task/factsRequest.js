import {
  ENTDECKEN_FACTS_CONTRACT_VERSION,
  ENTDECKEN_FACTS_PROMPT_VERSION,
  validateEntdeckenFactsInputs,
} from "../_shared/entdeckenFacts.js";
import {
  createAnthropicEntdeckenFactsAdapter,
  EntdeckenFactsProviderError,
  ENTDECKEN_FACTS_CONFIG_TASK,
  ENTDECKEN_FACTS_MAX_TOKENS,
  ENTDECKEN_FACTS_PROVIDER_TASK,
  ENTDECKEN_FACTS_SEARCH_FEE_USD_CENT,
} from "./anthropicFactsAdapter.js";
import { normalizeEntdeckenProviderFailure } from "./providerFailureContract.js";

export const ENTDECKEN_FACTS_HEADER = "x-kd-entdecken-facts";
export const ENTDECKEN_FACTS_HEADER_VALUE = "owner-v1";
export const ENTDECKEN_FACTS_REQUEST_VERSION = "entdecken-facts-request-v1";

const SAFE_FACTS_ERROR_CODES = new Set([
  "already-used", "batch-invalid", "cost-gate-rejected", "cost-settlement-failed",
  "entdecken-facts-log-unavailable",
  "entdecken-facts-request-invalid",
  "entdecken-facts-setup-unavailable",
  "facts-function-error", "http-error", "provider-body-invalid", "provider-cost-invalid",
  "provider-envelope-invalid", "provider-output-invalid", "provider-receipt-invalid",
  "provider-timeout", "provider-tool-shape-invalid", "setup-invalid",
]);

function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function limitRows(rows) {
  const values = new Map();
  if (!Array.isArray(rows)) return values;
  for (const row of rows) {
    if (typeof row?.schluessel === "string") values.set(row.schluessel, row.wert);
  }
  return values;
}

export function validateEntdeckenFactsRequest(value) {
  if (!exactKeys(value, ["schemaVersion", "items"])
      || value.schemaVersion !== ENTDECKEN_FACTS_REQUEST_VERSION) return null;
  const items = validateEntdeckenFactsInputs(value.items);
  return items ? Object.freeze({ schemaVersion: value.schemaVersion, items }) : null;
}

export function createEntdeckenFactsErrorResponse(error) {
  const providerError = error instanceof EntdeckenFactsProviderError;
  const candidate = providerError ? error.code : error?.message;
  const code = SAFE_FACTS_ERROR_CODES.has(candidate) ? candidate : "facts-function-error";
  const providerFailure = providerError
    ? normalizeEntdeckenProviderFailure(error.providerFailure) : null;
  return Object.freeze({
    ok: false,
    status: "facts_error",
    items: Object.freeze([]),
    failure: Object.freeze({
      code,
      providerHttpStatus: providerFailure?.httpStatus ?? null,
      providerErrorCode: providerFailure?.providerErrorType ?? null,
    }),
  });
}

export function validateEntdeckenFactsErrorResponse(value) {
  if (!exactKeys(value, ["ok", "status", "items", "failure"])
      || value.ok !== false || value.status !== "facts_error"
      || !Array.isArray(value.items) || value.items.length !== 0
      || !exactKeys(value.failure, ["code", "providerHttpStatus", "providerErrorCode"])
      || !SAFE_FACTS_ERROR_CODES.has(value.failure.code)) return null;
  const { providerHttpStatus, providerErrorCode } = value.failure;
  const providerFailure = providerHttpStatus === null && providerErrorCode === null
    ? null : normalizeEntdeckenProviderFailure({
      stage: "http",
      httpStatus: providerHttpStatus,
      providerErrorType: providerErrorCode,
    });
  if ((providerHttpStatus !== null || providerErrorCode !== null) && !providerFailure) return null;
  return Object.freeze({
    ok: false,
    status: "facts_error",
    items: Object.freeze([]),
    failure: Object.freeze({
      code: value.failure.code,
      providerHttpStatus: providerFailure?.httpStatus ?? null,
      providerErrorCode: providerFailure?.providerErrorType ?? null,
    }),
  });
}

/**
 * @param {{
 *   body?: unknown,
 *   admin?: any,
 *   accountId?: string,
 *   apiKey?: string,
 *   fetchImpl?: typeof fetch,
 *   now?: () => string
 * }} [options]
 */
export async function runEntdeckenFactsRequest({
  body,
  admin,
  accountId,
  apiKey,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const request = validateEntdeckenFactsRequest(body);
  if (!request || !admin || typeof accountId !== "string" || !accountId || !apiKey) {
    throw new Error("entdecken-facts-request-invalid");
  }
  const adapter = createAnthropicEntdeckenFactsAdapter({
    apiKey,
    fetchImpl,
    now,
    async loadSetup() {
      const [providerResult, limitsResult] = await Promise.all([
        admin.rpc("kd_private_provider_allowed", { p_provider_id: "anthropic" }),
        admin.from("kd_ai_limits")
          .select("schluessel,wert")
          .in("schluessel", [
            "anbieter_request_max_usd_cent",
            "modell_alias",
            "preise_usd_cent_pro_mtok",
            "task_modell",
            "timeout_ms",
          ]),
      ]);
      if (providerResult.error || limitsResult.error) {
        throw new Error("entdecken-facts-setup-unavailable");
      }
      const limits = limitRows(limitsResult.data);
      const taskModels = limits.get("task_modell");
      const aliases = limits.get("modell_alias");
      const prices = limits.get("preise_usd_cent_pro_mtok");
      const modelAlias = taskModels?.[ENTDECKEN_FACTS_CONFIG_TASK];
      const model = typeof modelAlias === "string" ? aliases?.[modelAlias] : null;
      const price = typeof model === "string" ? prices?.[model] : null;
      return {
        providerAllowed: providerResult.data?.ok === true
          && providerResult.data?.code === "PROVIDER_ALLOWED",
        modelAlias,
        model,
        maxTokens: ENTDECKEN_FACTS_MAX_TOKENS,
        inputPriceUsdCentPerMtok: price?.in,
        outputPriceUsdCentPerMtok: price?.out,
        taskCapUsdCent: limits.get("anbieter_request_max_usd_cent"),
        globalRequestCapUsdCent: limits.get("anbieter_request_max_usd_cent"),
        searchFeeUsdCent: ENTDECKEN_FACTS_SEARCH_FEE_USD_CENT,
        timeoutMs: limits.get("timeout_ms"),
      };
    },
    async reserveCost({ operationId, reservationUsdCent, providerRequests }) {
      if (providerRequests !== 1) return { ok: false, logId: null };
      const { data, error } = await admin.rpc("kd_ai_auftrag_starten", {
        p_account: accountId,
        p_task: ENTDECKEN_FACTS_PROVIDER_TASK,
        p_vorgang: operationId,
        p_modell_alias: "klein",
        p_prompt_version: ENTDECKEN_FACTS_PROMPT_VERSION,
        p_profil_version: null,
        p_reservierung: reservationUsdCent,
      });
      if (error) throw error;
      return { ok: data?.ok === true, logId: data?.log_id };
    },
    async settleCost({
      logId, status, model, inputTokens, outputTokens, costUsdCent, errorClass,
    }) {
      const { error } = await admin.rpc("kd_ai_auftrag_beenden", {
        p_id: logId,
        p_status: status,
        p_modell: model,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
        p_kosten: costUsdCent,
        p_fehlerklasse: errorClass,
      });
      if (error) throw error;
    },
    async readSettledCost({ logId, operationId }) {
      const { data, error } = await admin.from("kd_ai_log")
        .select("id,account_id,vorgang_id,task,status,modell,input_tokens,output_tokens,kosten_usd_cent")
        .eq("id", logId)
        .eq("vorgang_id", operationId)
        .maybeSingle();
      if (error || !data || data.account_id !== accountId) {
        throw error || new Error("entdecken-facts-log-unavailable");
      }
      return {
        logId: data.id,
        operationId: data.vorgang_id,
        task: data.task,
        status: data.status,
        model: data.modell,
        inputTokens: data.input_tokens,
        outputTokens: data.output_tokens,
        costUsdCent: Number(data.kosten_usd_cent),
      };
    },
  });
  const result = await adapter.resolve(request.items);
  return Object.freeze({
    ok: true,
    status: "facts",
    schemaVersion: ENTDECKEN_FACTS_CONTRACT_VERSION,
    items: result.items,
    quality: result.quality,
    receipt: result.receipt,
  });
}
