const API_ORIGIN = "https://api.flixpatrol.com";
const QUOTA_URL = `${API_ORIGIN}/v2/quota`;
export const FLIXPATROL_TIMEOUT_MS = 15_000;

export class FlixPatrolClientError extends Error {
  constructor(code, { providerRequests = 0, httpStatus = null } = {}) {
    super(code);
    this.name = "FlixPatrolClientError";
    this.code = code;
    this.providerRequests = providerRequests;
    this.httpStatus = httpStatus;
  }
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function parseFlixPatrolQuota(value) {
  if (!exactKeys(value, ["type", "data"]) || value.type !== "apiquota"
      || !exactKeys(value.data, ["used", "available", "limit", "limitExtra", "resetAt"])) {
    return null;
  }
  const { used, available, limit, limitExtra, resetAt } = value.data;
  if (![used, available, limit, limitExtra].every(safeInteger) || limit < 1
      || typeof resetAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(resetAt)) {
    return null;
  }
  return Object.freeze({ used, available, limit, limitExtra, resetAt });
}

export function createFlixPatrolClient({
  apiKey,
  beginOperation,
  finishOperation,
  fetchImpl = fetch,
  randomUUID = () => crypto.randomUUID(),
  timeoutMs = FLIXPATROL_TIMEOUT_MS,
} = {}) {
  const configured = typeof apiKey === "string" && apiKey.length > 0
    && typeof beginOperation === "function"
    && typeof finishOperation === "function"
    && typeof fetchImpl === "function"
    && typeof randomUUID === "function"
    && Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= FLIXPATROL_TIMEOUT_MS;

  async function fetchQuota() {
    if (!configured) throw new FlixPatrolClientError("FLIXPATROL_NOT_CONFIGURED");
    const operationId = randomUUID();
    if (typeof operationId !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
      throw new FlixPatrolClientError("FLIXPATROL_OPERATION_INVALID");
    }

    let begin;
    try { begin = await beginOperation({ operationId, requestKind: "quota" }); }
    catch { throw new FlixPatrolClientError("FLIXPATROL_LEDGER_BEGIN_FAILED"); }
    if (begin?.ok !== true || begin?.claim !== true || begin?.replay !== false) {
      throw new FlixPatrolClientError("FLIXPATROL_LEDGER_BEGIN_REJECTED");
    }

    let finished = false;
    const finish = async (status, httpStatus, quota) => {
      if (finished) throw new FlixPatrolClientError("FLIXPATROL_DOUBLE_FINISH", { providerRequests: 1 });
      finished = true;
      let result;
      try {
        result = await finishOperation({ operationId, status, httpStatus, quota });
      } catch {
        throw new FlixPatrolClientError("FLIXPATROL_LEDGER_FINISH_FAILED", {
          providerRequests: 1,
          httpStatus,
        });
      }
      if (result?.ok !== true || result?.replay !== false || result?.status !== status) {
        throw new FlixPatrolClientError("FLIXPATROL_LEDGER_FINISH_REJECTED", {
          providerRequests: 1,
          httpStatus,
        });
      }
      return result;
    };

    let response;
    try {
      response = await fetchImpl(QUOTA_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${btoa(`${apiKey}:`)}`,
        },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      await finish("transport_error", null, null);
      throw new FlixPatrolClientError("FLIXPATROL_TRANSPORT_ERROR", { providerRequests: 1 });
    }

    if (!response || !response.ok) {
      const status = Number.isInteger(response?.status) ? response.status : null;
      await finish("http_error", status, null);
      throw new FlixPatrolClientError("FLIXPATROL_HTTP_ERROR", {
        providerRequests: 1,
        httpStatus: status,
      });
    }

    let body;
    try { body = await response.json(); } catch { body = null; }
    const quota = parseFlixPatrolQuota(body);
    if (!quota) {
      await finish("invalid_response", response.status, null);
      throw new FlixPatrolClientError("FLIXPATROL_INVALID_RESPONSE", {
        providerRequests: 1,
        httpStatus: response.status,
      });
    }

    const completion = await finish("succeeded", response.status, quota);
    return Object.freeze({ quota, usage: completion.usage, providerRequests: 1 });
  }

  return Object.freeze({ fetchQuota });
}
