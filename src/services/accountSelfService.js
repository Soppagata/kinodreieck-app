import { runtimeConfig } from "../config/runtime.js";
import { authDriver } from "./auth.js";
import { BoundaryError, ERROR_CODES, errorFromStatus } from "./errors.js";

const fixedObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => fixedObject(value)
  && Object.keys(value).length === keys.length
  && Object.keys(value).every((key) => keys.includes(key));
const rows = (value, keys) => Array.isArray(value) && value.every((row) => exactKeys(row, keys));
const rowWithExactKeysAndTypes = (value, keys, checks = {}) => Array.isArray(value) && value.every((row) => {
  if (!exactKeys(row, keys)) return false;
  for (const [field, isValid] of Object.entries(checks)) {
    if (!isValid(row[field])) return false;
  }
  return true;
});
const stringOrNull = (value) => value === null || typeof value === "string";
const lowercaseUuid = (value) => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const lowercaseHex32 = (value) => typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
const isoDateString = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));

const ownRows = (value) => rowWithExactKeysAndTypes(
  value,
  ["operation_id", "request_hash", "result", "terminal_at", "expires_at", "created_at"],
  {
    operation_id: (value) => typeof value === "string",
    request_hash: (value) => typeof value === "string",
    result: (value) => fixedObject(value),
    terminal_at: stringOrNull,
    expires_at: stringOrNull,
    created_at: (value) => typeof value === "string",
  },
);
const importRows = (value) => rowWithExactKeysAndTypes(
  value,
  ["operation_id", "request_hash", "result", "terminal_at", "expires_at", "created_at"],
  {
    operation_id: lowercaseUuid,
    request_hash: lowercaseHex32,
    result: (value) => fixedObject(value),
    terminal_at: (value) => isoDateString(value),
    expires_at: (value) => isoDateString(value),
    created_at: (value) => isoDateString(value),
  },
);

export function validateOwnData(value) {
  if (!fixedObject(value) || value.ok !== true || value.schemaVersion !== 1 || !fixedObject(value.data)) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, { source: "account-self-service", operation: "own-data.validate" });
  }
  const allowed = ["auth", "access", "personal", "aiLogs", "seriesWatch", "sharedArticles", "sharedClaims", "radar", "retention", "deletion"];
  if (!exactKeys(value.data, allowed)) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, { source: "account-self-service", operation: "own-data.validate", reason: "unknown-field" });
  }
  const radarKeys = ["capabilities", "accountState", "subscriptions", "receipts", "shares", "operations", "shareOperations", "reviews", "importOperations"];
  const radarCapabilitiesWithType = (value.data.radar.capabilities === null) || (
    exactKeys(value.data.radar.capabilities, ["radar_unlimited", "radar_review", "radar_pilot", "updated_at"])
    && typeof value.data.radar.capabilities.radar_unlimited === "boolean"
    && typeof value.data.radar.capabilities.radar_review === "boolean"
    && typeof value.data.radar.capabilities.radar_pilot === "boolean"
    && typeof value.data.radar.capabilities.updated_at === "string"
  );
  const valid = exactKeys(value.data.auth, ["createdAt", "lastSignInAt", "providers"])
    && (value.data.auth.createdAt === null || typeof value.data.auth.createdAt === "string")
    && (value.data.auth.lastSignInAt === null || typeof value.data.auth.lastSignInAt === "string")
    && Array.isArray(value.data.auth.providers) && value.data.auth.providers.every((provider) => typeof provider === "string")
    && exactKeys(value.data.access, ["role", "active", "personal_ai", "created_at", "updated_at"])
    && ["member", "owner"].includes(value.data.access.role) && value.data.access.active === true
    && typeof value.data.access.personal_ai === "boolean"
    && rows(value.data.personal, ["key", "value", "revision", "updated_at"])
    && rows(value.data.aiLogs, ["operationId", "task", "status", "modelAlias", "promptVersion", "profileVersion", "costUsdCent", "startedAt", "finishedAt"])
    && rows(value.data.seriesWatch, ["watchmode_id", "active", "created_at", "updated_at"])
    && rows(value.data.sharedArticles, ["publication_id", "article_id", "author", "payload", "published_at", "updated_at"])
    && rows(value.data.sharedClaims, ["share_token", "claimed_at"])
    && exactKeys(value.data.radar, radarKeys)
    && (radarCapabilitiesWithType)
    && (value.data.radar.accountState === null || exactKeys(value.data.radar.accountState, ["revision", "checksum", "updated_at"]))
    && rows(value.data.radar.subscriptions, ["target_id", "region", "scope", "subscription_status", "server_revision", "last_operation_id", "created_at", "updated_at"])
    && rows(value.data.radar.receipts, ["event_version_id", "receipt_status", "updated_at"])
    && rows(value.data.radar.shares, ["target_id", "share_status", "last_operation_id", "created_at", "updated_at"])
    && ownRows(value.data.radar.operations)
    && ownRows(value.data.radar.shareOperations)
    && importRows(value.data.radar.importOperations)
    && rows(value.data.radar.reviews, ["review_id", "event_version_id", "decision", "reason", "source_id", "created_at"])
    && rows(value.data.retention, ["data_class", "retention_days", "purpose_bound", "purge_trigger"])
    && exactKeys(value.data.deletion, ["enabled", "lastStatus"])
    && typeof value.data.deletion.enabled === "boolean"
    && (value.data.deletion.lastStatus === null || typeof value.data.deletion.lastStatus === "string");
  if (!valid) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, { source: "account-self-service", operation: "own-data.validate", reason: "invalid-shape" });
  }
  return Object.freeze(value.data);
}

export function createAccountSelfService({ config = runtimeConfig, tokenLoader = authDriver.getAccessToken, fetchImpl = globalThis.fetch } = {}) {
  const basis = String(config.supabaseUrl || "").replace(/\/+$/, "");
  const endpoint = String(config.accountSelfServiceEndpointName || "");
  const invoke = async (method, body = null) => {
    if (config.privateSelfServiceEnabled !== true || !basis || !endpoint) {
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, { source: "account-self-service", operation: method, reason: "feature-disabled" });
    }
    const token = await tokenLoader();
    if (!token) throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, { source: "account-self-service", operation: method });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    let response;
    try {
      response = await fetchImpl(`${basis}/functions/v1/${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (cause) {
      throw new BoundaryError(ERROR_CODES.OFFLINE, { source: "account-self-service", operation: method, cause });
    } finally { clearTimeout(timer); }
    let payload = null;
    try { payload = await response.json(); } catch { /* invalid below */ }
    if (!response.ok) throw errorFromStatus(response.status, { source: "account-self-service", operation: method });
    return payload;
  };
  return Object.freeze({
    async getOwnData() { return validateOwnData(await invoke("GET")); },
    async deleteCurrentAccount({ operationId, confirmation }) {
      if (config.accountDeleteEnabled !== true) {
        throw new BoundaryError(ERROR_CODES.FORBIDDEN, { source: "account-self-service", operation: "DELETE", reason: "delete-disabled" });
      }
      const payload = await invoke("POST", { action: "delete", operationId, confirmation });
      if (!fixedObject(payload) || payload.ok !== true || payload.deleted !== true || payload.operationId !== operationId) {
        throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, { source: "account-self-service", operation: "DELETE" });
      }
      return Object.freeze({ ok: true, operationId });
    },
  });
}

export const accountSelfService = createAccountSelfService();
