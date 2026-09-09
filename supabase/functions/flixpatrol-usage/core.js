const SCHEDULE_HEADER = "x-kd-flixpatrol-usage";
const SCHEDULE_VALUE = "scheduled-daily-v1";

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function instant(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return value;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function normalizeFlixPatrolUsage(value) {
  const keys = [
    "attemptedRequests", "completedRequests", "failedRequests", "lastAttemptAt",
    "lastStatus", "lastSuccessAt", "planLimit", "quota", "successfulRequests",
  ];
  if (!exactKeys(value, keys)
      || ![value.attemptedRequests, value.completedRequests, value.successfulRequests, value.failedRequests].every(nonnegativeInteger)
      || value.completedRequests !== value.successfulRequests + value.failedRequests
      || value.attemptedRequests < value.completedRequests
      || value.planLimit !== 1000
      || !["empty", "claimed", "succeeded", "http_error", "invalid_response", "transport_error"].includes(value.lastStatus)
      || instant(value.lastAttemptAt) === undefined
      || instant(value.lastSuccessAt) === undefined) return null;
  let quota = null;
  if (value.quota !== null) {
    if (!exactKeys(value.quota, ["available", "limit", "limitExtra", "observedAt", "resetAt", "used"])
        || ![value.quota.used, value.quota.available, value.quota.limit, value.quota.limitExtra].every(nonnegativeInteger)
        || value.quota.limit < 1
        || typeof value.quota.resetAt !== "string"
        || instant(value.quota.observedAt) === undefined) return null;
    quota = Object.freeze({ ...value.quota });
  }
  return Object.freeze({ ...value, quota });
}

export function parseFlixPatrolServiceKeys(raw, legacy = "") {
  const values = [];
  if (typeof raw === "string" && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const value of Object.values(parsed)) {
          if (typeof value === "string" && value) values.push(value);
        }
      }
    } catch { /* legacy below */ }
  }
  if (typeof legacy === "string" && legacy) values.push(legacy);
  return [...new Set(values)];
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % Math.max(a.length, 1)] || 0)
      ^ (b[index % Math.max(b.length, 1)] || 0);
  }
  return difference === 0;
}

function authorized(request, serviceKeys) {
  if (!Array.isArray(serviceKeys) || serviceKeys.length === 0) return false;
  const apiKey = request.headers.get("apikey") || "";
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const bearer = authorization.slice(7);
  return serviceKeys.some((key) => constantTimeEqual(apiKey, key) && constantTimeEqual(bearer, key));
}

function hasBody(request) {
  const contentLength = request.headers.get("content-length");
  return (contentLength !== null && contentLength !== "0")
    || request.headers.has("transfer-encoding") || request.body !== null;
}

function response(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safeError(error) {
  const code = typeof error?.code === "string" && /^FLIXPATROL_[A-Z0-9_]{1,48}$/.test(error.code)
    ? error.code : "FLIXPATROL_USAGE_FAILED";
  const providerRequests = error?.providerRequests === 1 ? 1 : 0;
  return { code, providerRequests };
}

export function createFlixPatrolUsageHandler({ serviceKeys = [], readUsage, refreshUsage } = {}) {
  return async function handler(request) {
    if (request.headers.get("origin") !== null || !authorized(request, serviceKeys)) {
      return response({ ok: false, status: "forbidden", providerRequests: 0 }, 403);
    }
    if (hasBody(request)) {
      return response({ ok: false, status: "invalid-request", providerRequests: 0 }, 400);
    }

    if (request.method === "GET" && request.headers.get(SCHEDULE_HEADER) === null) {
      try {
        const usage = normalizeFlixPatrolUsage(await readUsage?.());
        return usage
          ? response({ ok: true, status: "read", providerRequests: 0, usage }, 200)
          : response({ ok: false, status: "unavailable", providerRequests: 0 }, 503);
      } catch {
        return response({ ok: false, status: "unavailable", providerRequests: 0 }, 503);
      }
    }

    if (request.method !== "POST" || request.headers.get(SCHEDULE_HEADER) !== SCHEDULE_VALUE) {
      return response({ ok: false, status: "invalid-request", providerRequests: 0 }, 405);
    }

    try {
      const result = await refreshUsage?.();
      const usage = normalizeFlixPatrolUsage(result?.usage);
      if (!usage || result?.providerRequests !== 1) {
        const providerRequests = result?.providerRequests === 1 ? 1 : 0;
        return response({ ok: false, status: "failed", code: "FLIXPATROL_USAGE_UNPROVEN", providerRequests }, 500);
      }
      return response({ ok: true, status: "refreshed", providerRequests: 1, usage }, 200);
    } catch (error) {
      const safe = safeError(error);
      return response({ ok: false, status: "failed", ...safe }, 502);
    }
  };
}

export const FLIXPATROL_USAGE_SCHEDULE_HEADER = SCHEDULE_HEADER;
export const FLIXPATROL_USAGE_SCHEDULE_VALUE = SCHEDULE_VALUE;
