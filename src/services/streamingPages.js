import { authDriver, authService } from "./auth.js";
import { BoundaryError, ERROR_CODES, normalizeBoundaryError } from "./errors.js";
import { getKatalogZugang } from "../lib/katalog.js";
import { katalogTokenErlaubt } from "./catalog.js";
import {
  isStreamingPageCacheFresh,
  normalizeStreamingPageRequest,
  normalizeStreamingPageResponse,
  stableStreamingPageString,
} from "../lib/streamingPage.js";

export const STREAMING_PAGE_RPC_MISSING = "streaming-page-rpc-missing";
const CACHE_NAME = "kinodreieck-streaming-pages-v1";
const CACHE_MARK = "kd-streaming-pages-1";

function currentAccount(auth) {
  let snapshot = null;
  try { snapshot = auth?.getSnapshot?.(); } catch { return null; }
  const accountId = String(snapshot?.account?.id || "").trim();
  return snapshot?.mode === "account" && snapshot?.state === "ready" && accountId
    && snapshot?.capabilities?.remoteStorage === true
    ? Object.freeze({ id: accountId }) : null;
}

function accountOrThrow(auth, operation) {
  const account = currentAccount(auth);
  if (account) return account;
  throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
    source: "streaming-pages", operation, reason: "remoteStorage",
  });
}

function hashKey(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheUrl(accountId, request) {
  const origin = typeof location !== "undefined" && location.origin && location.origin !== "null"
    ? location.origin : "https://cache.kinodreieck.invalid";
  const signature = stableStreamingPageString(request);
  return `${origin}/__kd_streaming_page_cache__/${hashKey(accountId + "\n" + signature)}`;
}

function missingRpc(body, status) {
  const code = String(body?.code || "");
  const message = String(body?.message || body?.details || "");
  return status === 404 && (code === "PGRST202" || code === "42883"
    || /kd_streaming_page/i.test(message) && /not find|does not exist|schema cache/i.test(message));
}

export function isStreamingPageRpcMissing(error) {
  return error?.reason === STREAMING_PAGE_RPC_MISSING;
}

export function createStreamingPagesService({
  auth = authService,
  driver = authDriver,
  getConnection = getKatalogZugang,
  fetchImpl = null,
  cacheStorage = typeof caches !== "undefined" ? caches : null,
  responseFactory = typeof Response !== "undefined" ? Response : null,
  now = () => Date.now(),
} = {}) {
  const inFlight = new Map();
  const getFetch = () => fetchImpl || (typeof fetch === "function" ? fetch : null);

  const accountStillCurrent = (id, operation) => {
    const current = accountOrThrow(auth, operation);
    if (current.id !== id) {
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
        source: "streaming-pages", operation, reason: "account-changed",
      });
    }
  };

  const readCache = async (account, request) => {
    if (!cacheStorage) return null;
    try {
      const cache = await cacheStorage.open(CACHE_NAME);
      const response = await cache.match(cacheUrl(account.id, request));
      if (!response) return null;
      const envelope = await response.json();
      if (envelope?.mark !== CACHE_MARK || envelope?.accountId !== account.id
          || envelope?.signature !== stableStreamingPageString(request)) return null;
      const page = normalizeStreamingPageResponse(envelope.page);
      if (!isStreamingPageCacheFresh(page, Number(envelope.cachedAt), now())) {
        try { await cache.delete(cacheUrl(account.id, request)); } catch { /* Komfortcache */ }
        return null;
      }
      accountStillCurrent(account.id, "cache.read.after");
      return Object.freeze({ ...page, fromCache: true, cachedAt: Number(envelope.cachedAt) });
    } catch (error) {
      if (error instanceof BoundaryError) throw error;
      return null;
    }
  };

  const writeCache = async (account, request, page) => {
    if (!cacheStorage || !responseFactory) return;
    let cache = null;
    const url = cacheUrl(account.id, request);
    let written = false;
    try {
      accountStillCurrent(account.id, "cache.write.before");
      cache = await cacheStorage.open(CACHE_NAME);
      accountStillCurrent(account.id, "cache.write.after-open");
      const envelope = {
        mark: CACHE_MARK,
        accountId: account.id,
        signature: stableStreamingPageString(request),
        cachedAt: now(),
        page,
      };
      await cache.put(url, new responseFactory(JSON.stringify(envelope), {
        headers: { "Content-Type": "application/json" },
      }));
      written = true;
      accountStillCurrent(account.id, "cache.write.after-put");
    } catch (error) {
      if (written && cache) {
        try { await cache.delete(url); } catch { /* Kontoabgrenzung bleibt best effort. */ }
      }
      if (error instanceof BoundaryError) throw error;
      /* Der Gerätecache ist Komfort und blockiert eine gültige Antwort nie. */
    }
  };

  const networkPage = async (account, request, { timeout = 15000 } = {}) => {
    const connection = getConnection?.() || {};
    const baseUrl = String(connection.url || "").trim().replace(/\/+$/, "");
    const apiKey = String(connection.key || "").trim();
    if (!baseUrl || !apiKey || !katalogTokenErlaubt(baseUrl)) {
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
        source: "streaming-pages", operation: "page.load", reason: "catalog-connection",
      });
    }
    const f = getFetch();
    if (!f) throw new BoundaryError(ERROR_CODES.OFFLINE, { source: "streaming-pages", operation: "page.load" });
    accountStillCurrent(account.id, "page.load.before-token");
    let token = await driver?.getAccessToken?.({ erwarteteKontoId: account.id });
    accountStillCurrent(account.id, "page.load.after-token");
    if (!token) throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
      source: "streaming-pages", operation: "page.load", reason: "token-missing",
    });
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
    const call = (bearer) => f(baseUrl + "/rest/v1/rpc/kd_streaming_page", {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: apiKey,
        Authorization: "Bearer " + bearer,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_request: request }),
      signal: controller?.signal,
    });
    try {
      let response = await call(token);
      if (response?.status === 401) {
        token = await driver?.getAccessToken?.({ erwarteteKontoId: account.id, erzwingeErneuerung: true });
        accountStillCurrent(account.id, "page.load.after-refresh");
        if (token) response = await call(token);
      }
      let body = null;
      try { body = await response?.json?.(); } catch { /* normalize below */ }
      accountStillCurrent(account.id, "page.load.after-response");
      if (!response?.ok) {
        if (missingRpc(body, response?.status)) {
          throw new BoundaryError(ERROR_CODES.NOT_IMPLEMENTED, {
            source: "streaming-pages", operation: "page.load", status: response.status,
            reason: STREAMING_PAGE_RPC_MISSING,
          });
        }
        const error = new Error(body?.message || `Streaming-Seiten HTTP ${response?.status || 0}`);
        error.status = response?.status;
        throw error;
      }
      const page = normalizeStreamingPageResponse(body);
      accountStillCurrent(account.id, "page.load.before-cache");
      if (page.status === "ready" && !request.cursor) void writeCache(account, request, page).catch(() => {});
      return page;
    } catch (error) {
      if (error instanceof BoundaryError) throw error;
      throw normalizeBoundaryError(error, { source: "streaming-pages", operation: "page.load" });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const loadPage = async (rawRequest, options = {}) => {
    const account = accountOrThrow(auth, "page.authorize");
    const request = normalizeStreamingPageRequest(rawRequest);
    if (options.cacheOnly === true) return readCache(account, request);
    if (options.preferCache === true) {
      const cached = await readCache(account, request);
      if (cached) return cached;
    }
    const key = `${account.id}\n${stableStreamingPageString(request)}`;
    if (inFlight.has(key)) return inFlight.get(key);
    const run = networkPage(account, request, options).finally(() => {
      if (inFlight.get(key) === run) inFlight.delete(key);
    });
    inFlight.set(key, run);
    return run;
  };

  return Object.freeze({
    loadPage,
    loadCachedPage: (request) => loadPage(request, { cacheOnly: true }),
  });
}

export const streamingPagesService = createStreamingPagesService();
