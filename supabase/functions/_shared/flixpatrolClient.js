import {
  FLIXPATROL_TITLE_TYPES,
  FLIXPATROL_TOP10_TYPES,
  normalizeFlixPatrolTitle,
  normalizeFlixPatrolTitleList,
  normalizeFlixPatrolTop10List,
  selectStrictFlixPatrolTitleCandidate,
} from "./flixpatrolData.js";

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

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseFlixPatrolQuota(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.type !== "apiquota" || !value.data
      || typeof value.data !== "object" || Array.isArray(value.data)) {
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

/**
 * @param {{
 *   apiKey?: string,
 *   beginOperation?: (input: {operationId: string, requestKind: string}) => Promise<{ok?: boolean, claim?: boolean, replay?: boolean}>,
 *   finishOperation?: (input: {operationId: string, status: string, httpStatus: number | null, quota: ReturnType<typeof parseFlixPatrolQuota>}) => Promise<{ok?: boolean, replay?: boolean, status?: string, usage?: unknown}>,
 *   fetchImpl?: typeof fetch,
 *   randomUUID?: () => string,
 *   timeoutMs?: number
 * }} options
 */
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

  async function countedGet({ url, requestKind, parse }) {
    if (!configured) throw new FlixPatrolClientError("FLIXPATROL_NOT_CONFIGURED");
    const operationId = randomUUID();
    if (typeof operationId !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
      throw new FlixPatrolClientError("FLIXPATROL_OPERATION_INVALID");
    }

    let begin;
    try { begin = await beginOperation({ operationId, requestKind }); }
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
      response = await fetchImpl(url, {
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
    const parsed = parse(body);
    if (parsed === null) {
      await finish("invalid_response", response.status, null);
      throw new FlixPatrolClientError("FLIXPATROL_INVALID_RESPONSE", {
        providerRequests: 1,
        httpStatus: response.status,
      });
    }

    const quota = requestKind === "quota" ? parsed : null;
    const completion = await finish("succeeded", response.status, quota);
    return Object.freeze({ data: parsed, usage: completion.usage, providerRequests: 1, operationId });
  }

  async function fetchQuota() {
    const result = await countedGet({ url: QUOTA_URL, requestKind: "quota", parse: parseFlixPatrolQuota });
    return Object.freeze({ quota: result.data, usage: result.usage, providerRequests: 1 });
  }

  async function fetchTop10({ companyId, countryId, chartType, date } = {}) {
    if (!Object.hasOwn(FLIXPATROL_TOP10_TYPES, chartType)
        || !/^cmp_[A-Za-z0-9]{20,40}$/.test(companyId ?? "")
        || !/^cnt_[A-Za-z0-9]{20,40}$/.test(countryId ?? "")
        || !validDate(date)) {
      throw new FlixPatrolClientError("FLIXPATROL_REQUEST_INVALID");
    }
    const query = new URLSearchParams([
      ["company[eq]", companyId],
      ["country[eq]", countryId],
      ["type[eq]", String(FLIXPATROL_TOP10_TYPES[chartType])],
      ["date[type][eq]", "1"],
      ["date[from][eq]", date],
      ["date[to][eq]", date],
      ["ranking[lte]", "10"],
    ]);
    const expected = { companyId, countryId, chartType, date };
    const result = await countedGet({
      url: `${API_ORIGIN}/v2/top10s?${query}`,
      requestKind: "top10s",
      parse: (body) => normalizeFlixPatrolTop10List(body, expected),
    });
    return Object.freeze({ items: result.data, usage: result.usage, providerRequests: 1, operationId: result.operationId });
  }

  async function fetchTitle({ sourceId, mediaType } = {}) {
    if (!/^ttl_[A-Za-z0-9]{20,40}$/.test(sourceId ?? "")
        || (mediaType !== undefined && !Object.hasOwn(FLIXPATROL_TITLE_TYPES, mediaType))) {
      throw new FlixPatrolClientError("FLIXPATROL_REQUEST_INVALID");
    }
    const result = await countedGet({
      url: `${API_ORIGIN}/v2/titles/${encodeURIComponent(sourceId)}`,
      requestKind: "titles",
      parse: (body) => {
        const title = normalizeFlixPatrolTitle(body);
        return title && (mediaType === undefined || title.mediaType === mediaType) ? title : null;
      },
    });
    return Object.freeze({ title: result.data, usage: result.usage, providerRequests: 1, operationId: result.operationId });
  }

  async function searchTitles({ title, mediaType, releaseYear } = {}) {
    if (typeof title !== "string" || title.trim() !== title || title.length < 1 || title.length > 240
        || !Object.hasOwn(FLIXPATROL_TITLE_TYPES, mediaType)
        || !Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2100) {
      throw new FlixPatrolClientError("FLIXPATROL_REQUEST_INVALID");
    }
    const query = new URLSearchParams([
      ["title[eq]", title],
      ["type[eq]", String(FLIXPATROL_TITLE_TYPES[mediaType])],
      ["premiere[gte]", `${releaseYear}-01-01`],
      ["premiere[lte]", `${releaseYear}-12-31`],
    ]);
    const result = await countedGet({
      url: `${API_ORIGIN}/v2/titles?${query}`,
      requestKind: "titles",
      parse: normalizeFlixPatrolTitleList,
    });
    return Object.freeze({
      candidates: result.data,
      resolution: selectStrictFlixPatrolTitleCandidate({ title, mediaType, releaseYear }, result.data),
      usage: result.usage,
      providerRequests: 1,
      operationId: result.operationId,
    });
  }

  return Object.freeze({ fetchQuota, fetchTop10, fetchTitle, searchTitles });
}
