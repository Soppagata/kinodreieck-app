import { runtimeConfig } from "../config/runtime.js";

const ALLOWED_CODES = new Set([
  "OK", "OFFLINE", "NOT_CONFIGURED", "BUILD_MISMATCH", "FUNCTION_UNAVAILABLE",
  "DATABASE_UNAVAILABLE", "FEATURE_FLAG_OFF", "PROVIDER_REGISTRY_OFF",
  "LEGAL_OR_PROVIDER_REVIEW_REQUIRED", "RETENTION_UNCONFIRMED", "BUDGET_UNKNOWN",
]);

function code(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ALLOWED_CODES.has(normalized) ? normalized : "NOT_CONFIGURED";
}

export function buildSupportBundle({ checks = [], online = globalThis.navigator?.onLine !== false } = {}) {
  return Object.freeze({
    format: "kinodreieck-support",
    version: 1,
    createdAt: new Date().toISOString(),
    buildVersion: String(runtimeConfig.buildVersion || "unknown").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "unknown",
    environment: ["local", "staging", "production"].includes(runtimeConfig.appEnvironment) ? runtimeConfig.appEnvironment : "local",
    online: online === true,
    checks: (Array.isArray(checks) ? checks : []).slice(0, 20).map((item) => Object.freeze({
      id: String(item?.id || "unknown").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50) || "unknown",
      code: code(item?.code),
    })),
    privacy: "NO_PAYLOAD_NO_ACCOUNT_NO_URL_NO_STORAGE",
  });
}

export function supportBundleText(options) {
  return JSON.stringify(buildSupportBundle(options), null, 2);
}
