import { runtimeConfig } from "../config/runtime.js";
import { sanitizeLocalDiagnosticEntries } from "./localDiagnostics.js";

const ALLOWED_CODES = new Set([
  "OK", "OFFLINE", "NOT_CONFIGURED", "BUILD_MISMATCH", "FUNCTION_UNAVAILABLE",
  "DATABASE_UNAVAILABLE", "FEATURE_FLAG_OFF", "PROVIDER_REGISTRY_OFF",
  "LEGAL_OR_PROVIDER_REVIEW_REQUIRED", "RETENTION_UNCONFIRMED", "BUDGET_UNKNOWN",
]);

function code(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ALLOWED_CODES.has(normalized) ? normalized : "NOT_CONFIGURED";
}

export function buildSupportBundle({
  checks = [], diagnostics = [], online = globalThis.navigator?.onLine !== false, now = Date.now(),
} = {}) {
  const requestedNow = Number(now);
  const parsedNow = Number.isFinite(requestedNow) ? new Date(requestedNow).getTime() : NaN;
  const bundleNow = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  return Object.freeze({
    format: "kinodreieck-support",
    version: 2,
    createdAt: new Date(bundleNow).toISOString(),
    buildVersion: String(runtimeConfig.buildVersion || "unknown").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "unknown",
    environment: ["local", "staging", "production"].includes(runtimeConfig.appEnvironment) ? runtimeConfig.appEnvironment : "local",
    online: online === true,
    checks: (Array.isArray(checks) ? checks : []).slice(0, 20).map((item) => Object.freeze({
      id: String(item?.id || "unknown").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50) || "unknown",
      code: code(item?.code),
    })),
    diagnostics: sanitizeLocalDiagnosticEntries(diagnostics, { now: bundleNow }),
    privacy: "NO_PAYLOAD_NO_ACCOUNT_NO_URL_NO_STORAGE",
  });
}

export function supportBundleText(options) {
  return JSON.stringify(buildSupportBundle(options), null, 2);
}
