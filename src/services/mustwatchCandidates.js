import { authDriver, authService } from "./auth.js";
import { BoundaryError, ERROR_CODES, errorFromStatus, normalizeBoundaryError } from "./errors.js";
import { getKatalogZugang } from "../lib/katalog.js";
import { katalogTokenErlaubt } from "./catalog.js";

const RPC = "kd_mustwatch_streaming_candidates";
const MAX_IDS_PRO_REQUEST = 500;
const MAX_IDS_PRO_LAUF = 5000;
const MAX_ID_CACHE = 5000;
const MAX_QUERY_CACHE = 12;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const EMPTY_TTL_MS = 30 * 1000;

const text = (value) => String(value == null ? "" : value).trim();

function currentAuthority(auth, getConnection) {
  let snapshot = null;
  try { snapshot = auth?.getSnapshot?.(); } catch { return null; }
  const accountId = text(snapshot?.account?.id);
  const connection = getConnection?.() || {};
  const baseUrl = text(connection.url).replace(/\/+$/, "");
  const apiKey = text(connection.key);
  if (snapshot?.mode !== "account" || snapshot?.state !== "ready" || !accountId
      || snapshot?.capabilities?.remoteStorage !== true
      || !baseUrl || !apiKey || !katalogTokenErlaubt(baseUrl)) return null;
  return Object.freeze({ accountId, baseUrl, apiKey, key: `${baseUrl}|${accountId}` });
}

function normalizeIds(values) {
  const ids = [...new Set((Array.isArray(values) ? values : [])
    .map(text).filter(Boolean))];
  if (ids.length > MAX_IDS_PRO_LAUF) {
    throw new BoundaryError(ERROR_CODES.LIMIT, {
      source: "mustwatch-candidates", operation: "ids.normalize", reason: "mustwatch-ids-bounded",
      retryable: false,
    });
  }
  return ids;
}

function normalizeItem(raw) {
  const id = text(raw?.id);
  const titel = text(raw?.titel);
  if (!id || !titel || !Array.isArray(raw?.dienste)) return null;
  const item = {
    id,
    titel,
    dienste: [...new Set(raw.dienste.map(text).filter(Boolean))],
  };
  for (const key of ["originaltitel", "typ", "watchmode_id", "streaming_id", "imdb_id", "tmdb_id"]) {
    const value = raw?.[key];
    if (value != null && text(value)) item[key] = value;
  }
  if (Number.isInteger(raw?.jahr)) item.jahr = raw.jahr;
  if (Array.isArray(raw?.streaming_aliases)) {
    item.streaming_aliases = [...new Set(raw.streaming_aliases.map(text).filter(Boolean))];
  }
  if (Array.isArray(raw?.genres)) item.genres = [...new Set(raw.genres.map(text).filter(Boolean))];
  return Object.freeze(item);
}

function normalizeResponse(raw, now) {
  if (raw?.format !== 1 || !["ready", "unavailable"].includes(raw?.status)
      || typeof raw?.version !== "string" || !Array.isArray(raw?.items)) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
      source: "mustwatch-candidates", operation: "rpc.normalize", reason: "envelope",
    });
  }
  const parsedExpiry = raw.expiresAt == null ? null : Date.parse(String(raw.expiresAt));
  if (raw.expiresAt != null && !Number.isFinite(parsedExpiry)) {
    throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
      source: "mustwatch-candidates", operation: "rpc.normalize", reason: "expires-at",
    });
  }
  const expired = Number.isFinite(parsedExpiry) && parsedExpiry <= now;
  const status = raw.status === "ready" && !expired ? "ready" : "unavailable";
  const items = status === "ready" ? raw.items.map(normalizeItem).filter(Boolean) : [];
  return Object.freeze({
    format: 1,
    status,
    version: text(raw.version),
    expiresAt: Number.isFinite(parsedExpiry) ? new Date(parsedExpiry).toISOString() : null,
    items: Object.freeze(items),
  });
}

function rpcMissing(body, status) {
  const code = text(body?.code);
  const message = text(body?.message || body?.details);
  return status === 404 && (code === "PGRST202" || code === "42883"
    || /kd_mustwatch_streaming_candidates/i.test(message)
      && /not find|does not exist|schema cache/i.test(message));
}

export function createMustwatchCandidatesService({
  auth = authService,
  driver = authDriver,
  getConnection = getKatalogZugang,
  fetchImpl = null,
  now = () => Date.now(),
  timeoutMs = 15000,
  cacheTtlMs = DEFAULT_TTL_MS,
  emptyCacheTtlMs = EMPTY_TTL_MS,
} = {}) {
  let generation = 0;
  let authorityKey = null;
  let activeLookup = null;
  let activeSearch = null;
  const idCache = new Map();
  const queryCache = new Map();
  const getFetch = () => fetchImpl || (typeof fetch === "function" ? fetch : null);

  const abortActive = () => {
    try { activeLookup?.abort(); } catch { /* bereits beendet */ }
    try { activeSearch?.abort(); } catch { /* bereits beendet */ }
    activeLookup = null;
    activeSearch = null;
  };
  const clear = () => {
    generation += 1;
    abortActive();
    idCache.clear();
    queryCache.clear();
    authorityKey = null;
  };
  const unsubscribe = auth?.subscribe?.(() => {
    const next = currentAuthority(auth, getConnection)?.key || null;
    if (next !== authorityKey) clear();
  });

  const authorityOrThrow = (operation) => {
    const authority = currentAuthority(auth, getConnection);
    if (!authority) {
      clear();
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
        source: "mustwatch-candidates", operation, reason: "account-or-connection",
      });
    }
    if (authorityKey && authorityKey !== authority.key) clear();
    authorityKey = authority.key;
    return authority;
  };
  const stillCurrent = (authority, runGeneration) => (
    generation === runGeneration && currentAuthority(auth, getConnection)?.key === authority.key
  );
  const assertCurrent = (authority, runGeneration, operation) => {
    if (!stillCurrent(authority, runGeneration)) {
      throw new BoundaryError(ERROR_CODES.FORBIDDEN, {
        source: "mustwatch-candidates", operation, reason: "account-changed",
      });
    }
  };

  const request = async (authority, payload, outerSignal, operation, ownController) => {
    const runGeneration = generation;
    const f = getFetch();
    if (!f) throw new BoundaryError(ERROR_CODES.OFFLINE, { source: "mustwatch-candidates", operation });
    const controller = ownController || (typeof AbortController !== "undefined" ? new AbortController() : null);
    const abortFromCaller = () => { try { controller?.abort(outerSignal?.reason); } catch { controller?.abort(); } };
    if (outerSignal?.aborted) abortFromCaller();
    else outerSignal?.addEventListener?.("abort", abortFromCaller, { once: true });
    const timer = controller ? setTimeout(() => controller.abort(), Math.min(Math.max(1, timeoutMs), 15000)) : null;
    const throwIfAborted = () => {
      if (!controller?.signal?.aborted && !outerSignal?.aborted) return;
      throw Object.assign(new Error("Must-Watch-Kandidatenanfrage abgebrochen"), { name: "AbortError" });
    };
    try {
      throwIfAborted();
      assertCurrent(authority, runGeneration, `${operation}.before-token`);
      const token = await driver?.getAccessToken?.({ erwarteteKontoId: authority.accountId });
      throwIfAborted();
      assertCurrent(authority, runGeneration, `${operation}.after-token`);
      if (!token) throw new BoundaryError(ERROR_CODES.UNAUTHENTICATED, {
        source: "mustwatch-candidates", operation, reason: "token-missing",
      });
      const response = await f(`${authority.baseUrl}/rest/v1/rpc/${RPC}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          apikey: authority.apiKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_request: payload }),
        signal: controller?.signal || outerSignal || undefined,
      });
      let body = null;
      try { body = await response?.json?.(); } catch { /* unten als ungültig */ }
      throwIfAborted();
      assertCurrent(authority, runGeneration, `${operation}.after-response`);
      if (!response?.ok) {
        if (rpcMissing(body, response?.status)) {
          throw new BoundaryError(ERROR_CODES.NOT_IMPLEMENTED, {
            source: "mustwatch-candidates", operation, status: response.status,
            reason: "mustwatch-candidates-rpc-missing",
          });
        }
        throw errorFromStatus(response?.status || 0, {
          source: "mustwatch-candidates", operation,
          message: body?.message,
        });
      }
      return normalizeResponse(body, now());
    } catch (error) {
      if (error instanceof BoundaryError) throw error;
      throw normalizeBoundaryError(error, { source: "mustwatch-candidates", operation });
    } finally {
      if (timer) clearTimeout(timer);
      outerSignal?.removeEventListener?.("abort", abortFromCaller);
    }
  };

  const cacheDeadline = (response) => {
    const remote = Date.parse(String(response?.expiresAt || ""));
    const requestedTtl = response?.status === "ready" && response.items.length ? cacheTtlMs : emptyCacheTtlMs;
    const maxTtl = response?.status === "ready" && response.items.length ? DEFAULT_TTL_MS : EMPTY_TTL_MS;
    const local = now() + Math.min(maxTtl, Math.max(1, Number(requestedTtl) || maxTtl));
    return Number.isFinite(remote) ? Math.min(remote, local) : local;
  };
  const trimIdCache = () => {
    while (idCache.size > MAX_ID_CACHE) idCache.delete(idCache.keys().next().value);
  };
  const storeIdResponse = (requested, response) => {
    const expiresAt = cacheDeadline(response);
    const exact = new Map();
    const aliases = new Map();
    for (const item of response.items) {
      if (!exact.has(item.id)) exact.set(item.id, []);
      exact.get(item.id).push(item);
      for (const alias of item.streaming_aliases || []) {
        if (!aliases.has(alias)) aliases.set(alias, []);
        aliases.get(alias).push(item);
      }
    }
    const unique = (items) => items?.length === 1 ? items[0] : null;
    for (const id of requested) {
      const item = unique(exact.get(id)) || (!exact.has(id) ? unique(aliases.get(id)) : null);
      idCache.set(id, { item, expiresAt, version: response.version });
    }
    for (const [id, items] of exact) {
      const item = unique(items);
      if (item) idCache.set(id, { item, expiresAt, version: response.version });
    }
    trimIdCache();
  };

  const loadByIds = async (rawIds, { signal = null } = {}) => {
    const ids = normalizeIds(rawIds);
    if (!ids.length) return Object.freeze({ format: 1, status: "ready", version: "", expiresAt: null, items: Object.freeze([]) });
    const authority = authorityOrThrow("ids.authorize");
    try { activeLookup?.abort(); } catch { /* Querywechsel */ }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    activeLookup = controller;
    const valid = new Map();
    const missing = [];
    let earliestExpiry = Infinity;
    const cachedVersions = new Set();
    for (const id of ids) {
      const cached = idCache.get(id);
      if (cached?.expiresAt > now()) {
        earliestExpiry = Math.min(earliestExpiry, cached.expiresAt);
        cachedVersions.add(cached.version);
        if (cached.item) valid.set(cached.item.id, cached.item);
      } else {
        if (cached) idCache.delete(id);
        missing.push(id);
      }
    }
    if (cachedVersions.size > 1) {
      idCache.clear();
      throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
        source: "mustwatch-candidates", operation: "ids.load", reason: "catalog-version-mismatch",
      });
    }
    let version = cachedVersions.size ? [...cachedVersions][0] : null;
    try {
      for (let start = 0; start < missing.length; start += MAX_IDS_PRO_REQUEST) {
        const chunk = missing.slice(start, start + MAX_IDS_PRO_REQUEST);
        const response = await request(authority, {
          format: 1, ids: chunk, query: "", limit: 6,
        }, signal, "ids.load", controller);
        if (response.status !== "ready") {
          idCache.clear();
          return response;
        }
        if (version != null && response.version !== version) {
          idCache.clear();
          throw new BoundaryError(ERROR_CODES.INVALID_RESPONSE, {
            source: "mustwatch-candidates", operation: "ids.load", reason: "catalog-version-mismatch",
          });
        }
        version = response.version;
        storeIdResponse(chunk, response);
        earliestExpiry = Math.min(earliestExpiry, cacheDeadline(response));
        for (const id of chunk) {
          const cached = idCache.get(id);
          if (cached?.item) valid.set(cached.item.id, cached.item);
        }
      }
      return Object.freeze({
        format: 1, status: "ready", version: version || "",
        expiresAt: Number.isFinite(earliestExpiry) ? new Date(earliestExpiry).toISOString() : null,
        items: Object.freeze([...valid.values()]),
      });
    } catch (error) {
      idCache.clear();
      throw error;
    } finally {
      if (activeLookup === controller) activeLookup = null;
    }
  };

  const search = async (rawQuery, { signal = null, limit = 6 } = {}) => {
    const query = text(rawQuery).slice(0, 160);
    const safeLimit = Math.min(20, Math.max(1, Number.isInteger(limit) ? limit : 6));
    if (!query) return Object.freeze({ format: 1, status: "ready", version: "", expiresAt: null, items: Object.freeze([]) });
    const authority = authorityOrThrow("search.authorize");
    try { activeSearch?.abort(); } catch { /* Suchwechsel */ }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    activeSearch = controller;
    const key = `${authority.key}|${query}|${safeLimit}`;
    const cached = queryCache.get(key);
    if (cached?.expiresAt > now()) {
      activeSearch = null;
      return cached.response;
    }
    if (cached) queryCache.delete(key);
    try {
      const response = await request(authority, {
        format: 1, ids: [], query, limit: safeLimit,
      }, signal, "search.load", controller);
      queryCache.set(key, { response, expiresAt: cacheDeadline(response) });
      while (queryCache.size > MAX_QUERY_CACHE) queryCache.delete(queryCache.keys().next().value);
      return response;
    } finally {
      if (activeSearch === controller) activeSearch = null;
    }
  };

  return Object.freeze({
    loadByIds,
    search,
    clear,
    destroy() { clear(); if (typeof unsubscribe === "function") unsubscribe(); },
  });
}

export const mustwatchCandidatesService = createMustwatchCandidatesService();
