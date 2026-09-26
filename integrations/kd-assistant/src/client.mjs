import { OPERATIONS } from "./operations.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class KdApiError extends Error {
  constructor(problem, { status = 0, cause } = {}) {
    super(problem?.title || "Kinodreieck API request failed", { cause });
    this.name = "KdApiError";
    this.status = Number(problem?.status ?? status) || status;
    this.code = problem?.code || (status ? "HTTP_ERROR" : "NETWORK_ERROR");
    this.requestId = problem?.requestId ?? null;
    this.operationId = problem?.operationId ?? null;
    this.currentRevision = problem?.currentRevision ?? null;
    this.retryable = problem?.retryable === true;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      requestId: this.requestId,
      operationId: this.operationId,
      currentRevision: this.currentRevision,
      retryable: this.retryable,
    };
  }
}

function normalizeBaseUrl(value) {
  if (!value) throw new TypeError("KD_API_BASE_URL is required.");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new TypeError("KD_API_BASE_URL must use HTTPS (HTTP is allowed only for localhost tests).");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/v1")) {
    throw new TypeError("KD_API_BASE_URL must be the complete logical base ending in /v1.");
  }
  return url;
}

function pathFor(spec, input) {
  return typeof spec.path === "function" ? spec.path(input) : spec.path;
}

function readEtag(response) {
  const value = response.headers.get("etag");
  const match = /^\"([0-9]+)\"$/.exec(value || "");
  return match ? { etag: value, revision: Number(match[1]) } : { etag: null, revision: null };
}

function validateWriteGuards(spec, input) {
  if (spec.mutation || spec.idempotent) {
    if (typeof input.operationId !== "string" || !UUID.test(input.operationId)) {
      throw new KdApiError({ title: "A stable UUID operationId is required", code: "IDEMPOTENCY_REQUIRED" });
    }
  }
  if (spec.mutation && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)) {
    throw new KdApiError({ title: "The last confirmed revision is required", code: "REVISION_REQUIRED" });
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new KdApiError({ title: "API returned invalid JSON", code: "INVALID_RESPONSE", status: response.status }, { status: response.status, cause });
  }
}

export class KdApiClient {
  constructor({ baseUrl, credential, fetch: fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    if (typeof credential !== "function") throw new TypeError("credential must be an async key provider.");
    if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required.");
    this.credential = credential;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(operation, input = {}) {
    const spec = OPERATIONS[operation];
    if (!spec) throw new TypeError(`Unknown KD API operation: ${operation}`);
    validateWriteGuards(spec, input);
    const url = new URL(`${this.baseUrl.origin}${this.baseUrl.pathname}${pathFor(spec, input)}`);
    for (const name of spec.query?.names || []) {
      if (input[name] !== undefined && input[name] !== null) url.searchParams.set(name, String(input[name]));
    }
    const key = await this.credential();
    if (typeof key !== "string" || !key.trim()) throw new KdApiError({ title: "KD API credential is unavailable", code: "CREDENTIAL_UNAVAILABLE" });
    const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${key}` });
    if (spec.mutation || spec.idempotent) headers.set("Idempotency-Key", input.operationId || "");
    if (spec.mutation) headers.set("If-Match", `\"${input.expectedRevision}\"`);
    const bodyValue = spec.body?.(input);
    if (bodyValue !== undefined) {
      headers.set("Content-Type", spec.method === "PATCH" ? "application/merge-patch+json" : "application/json");
    }
    let response;
    try {
      response = await this.fetch(url, {
        method: spec.method,
        headers,
        body: bodyValue === undefined ? undefined : JSON.stringify(bodyValue),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
    } catch (cause) {
      throw new KdApiError({ title: "KD API is unreachable", code: cause?.name === "TimeoutError" ? "REQUEST_TIMEOUT" : "NETWORK_ERROR" }, { cause });
    }
    const data = await readJson(response);
    if (!response.ok) throw new KdApiError(data, { status: response.status });
    const revision = readEtag(response);
    return Object.freeze({ data, status: response.status, ...revision });
  }

  capabilities() { return this.request("capabilities_get"); }
  call(operation, input = {}) { return this.request(operation, input); }
}

export function createKdApiClient(options) {
  return new KdApiClient(options);
}
