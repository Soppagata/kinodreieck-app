import { runtimeConfig } from "../config/runtime.js";
import { authDriver, authService } from "./auth.js";
import { istSupabaseProjektUrl } from "../lib/supabasePublic.js";
import {
  PRIVATE_MAIL_ERROR_CODES,
  PRIVATE_MAIL_SCHEMA_VERSION,
  PRIVATE_MAIL_TYPES,
  normalizePrivateMailResponse,
  validatePrivateMailRequest,
} from "../../supabase/functions/_shared/privateMailContract.js";

export const PRIVATE_MAIL_CLIENT_STATUS = Object.freeze({
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  UNKNOWN: "unknown",
  UNAVAILABLE: "unavailable",
});

export const PRIVATE_MAIL_TIMEOUT_MS = 30_000;

const UNKNOWN_CODES = new Set([
  PRIVATE_MAIL_ERROR_CODES.IDEMPOTENCY_CONFLICT,
  PRIVATE_MAIL_ERROR_CODES.REQUEST_IN_PROGRESS,
  PRIVATE_MAIL_ERROR_CODES.DELIVERY_STATUS_UNKNOWN,
]);

function text(value) { return String(value == null ? "" : value).trim(); }

export function privateMailRuntimeEnabled(config = runtimeConfig) {
  return config?.privateMailEnabled === true
    && istSupabaseProjektUrl(config?.supabaseUrl)
    && !!text(config?.supabasePublishableKey)
    && /^[a-z0-9][a-z0-9_-]*$/i.test(text(config?.privateMailEndpointName));
}

function result(status, operationId = null) {
  return Object.freeze({ status, operationId });
}

function mappedFailure(code, operationId) {
  if (code === PRIVATE_MAIL_ERROR_CODES.DELIVERY_REJECTED) {
    return result(PRIVATE_MAIL_CLIENT_STATUS.REJECTED, operationId);
  }
  if (UNKNOWN_CODES.has(code)) {
    return result(PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN, operationId);
  }
  return result(PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE, operationId);
}

export function createPrivateMailService({
  config = runtimeConfig,
  auth = authService,
  getAccount = authDriver.konto,
  getAccessToken = (options) => authDriver.getAccessToken(options),
  fetchImpl = globalThis.fetch,
  createOperationId = () => globalThis.crypto?.randomUUID?.() || "",
  timeoutMs = PRIVATE_MAIL_TIMEOUT_MS,
} = {}) {
  async function submit(type, feedbackText = null) {
    if (!privateMailRuntimeEnabled(config) || typeof fetchImpl !== "function") {
      return result(PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE);
    }

    const session = auth?.getSnapshot?.();
    const accountId = text(session?.account?.id);
    if (session?.mode !== "account" || session?.state !== "ready" || !accountId
        || text(getAccount?.()?.id) !== accountId) {
      return result(PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE);
    }

    const operationId = createOperationId();
    const candidate = type === PRIVATE_MAIL_TYPES.FEEDBACK
      ? { schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION, operationId, type, text: feedbackText }
      : { schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION, operationId, type };
    const checked = validatePrivateMailRequest(candidate);
    if (!checked.ok) return result(PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE, operationId || null);

    let token;
    try { token = await getAccessToken({ erwarteteKontoId: accountId }); }
    catch { return result(PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE, operationId); }
    if (!token || auth.getSnapshot() !== session || text(getAccount?.()?.id) !== accountId) {
      return result(PRIVATE_MAIL_CLIENT_STATUS.UNAVAILABLE, operationId);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(
        `${text(config.supabaseUrl).replace(/\/+$/, "")}/functions/v1/${text(config.privateMailEndpointName)}`,
        {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: text(config.supabasePublishableKey),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(checked.request),
        },
      );
    } catch {
      return result(PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN, operationId);
    } finally {
      clearTimeout(timer);
    }

    if (auth.getSnapshot() !== session || text(getAccount?.()?.id) !== accountId) {
      return result(PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN, operationId);
    }
    let payload;
    try { payload = await response.json(); }
    catch { return result(PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN, operationId); }
    const normalized = normalizePrivateMailResponse(payload, {
      expectedType: type,
      expectedOperationId: operationId,
    });
    if (!normalized) return result(PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN, operationId);
    if (normalized.ok === true) {
      return response.ok
        ? result(PRIVATE_MAIL_CLIENT_STATUS.ACCEPTED, operationId)
        : result(PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN, operationId);
    }
    return mappedFailure(normalized.code, operationId);
  }

  return Object.freeze({
    submitFeedback(feedbackText) {
      return submit(PRIVATE_MAIL_TYPES.FEEDBACK, feedbackText);
    },
    requestAccountDeletion() {
      return submit(PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST);
    },
  });
}

export const privateMailService = createPrivateMailService();
