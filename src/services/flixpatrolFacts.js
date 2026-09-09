import { authDriver, authService } from "./auth.js";
import { runtimeConfig } from "../config/runtime.js";
import { FLIXPATROL_AT_CHARTS, normalisiereFlixpatrolFakten } from "../lib/flixpatrolFacts.js";

const TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 30 * 1000;

function activeAccount(auth) {
  try {
    const snapshot = auth?.getSnapshot?.();
    const id = String(snapshot?.account?.id || "").trim();
    return snapshot?.mode === "account" && snapshot?.state === "ready" && id
      && snapshot?.capabilities?.remoteStorage === true ? id : null;
  } catch { return null; }
}

function configured(config) {
  const url = String(config?.supabaseUrl || "").trim().replace(/\/+$/, "");
  const key = String(config?.supabasePublishableKey || "").trim();
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key ? { url, key } : null;
}

async function rpc(fetchImpl, config, token, name, body, signal) {
  const response = await fetchImpl(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST", cache: "no-store", signal,
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`FlixPatrol-Fakten HTTP ${response.status}`);
  const data = await response.json();
  if (!data || data.ok !== true) throw new Error("FlixPatrol-Fakten: ungültige RPC-Antwort");
  return data;
}

export function createFlixpatrolFactsService({
  auth = authService, driver = authDriver, config = runtimeConfig,
  fetchImpl = (...args) => fetch(...args), timeoutMs = TIMEOUT_MS,
  now = () => Date.now(), cacheTtlMs = CACHE_TTL_MS, emptyCacheTtlMs = EMPTY_CACHE_TTL_MS,
} = {}) {
  let cache = null;
  let inflight = null;
  let generation = 0;
  const authorityKey = () => {
    const accountId = activeAccount(auth);
    const project = configured(config)?.url;
    return accountId && project ? `${project}|${accountId}` : null;
  };
  let lastAuthorityKey = authorityKey();
  const clear = () => { generation += 1; cache = null; inflight = null; };
  auth?.subscribe?.(() => {
    const nextAuthorityKey = authorityKey();
    if (nextAuthorityKey !== lastAuthorityKey) {
      lastAuthorityKey = nextAuthorityKey;
      clear();
    }
  });
  const cacheValid = (key) => cache?.key === key && cache.expiresAt > now();
  const runStillValid = (runGeneration, key) => generation === runGeneration && authorityKey() === key;
  const expiryFor = (facts) => {
    const ttl = facts.length ? cacheTtlMs : emptyCacheTtlMs;
    let expiresAt = now() + Math.max(0, Number(ttl) || 0);
    for (const fact of facts) {
      if (fact?.fresh !== true) expiresAt = Math.min(expiresAt, now() + Math.max(0, Number(emptyCacheTtlMs) || 0));
      const freshUntil = Date.parse(String(fact?.freshUntil || ""));
      if (Number.isFinite(freshUntil)) expiresAt = Math.min(expiresAt, freshUntil);
    }
    return expiresAt;
  };
  const store = (key, project, accountId, facts) => {
    cache = { key, project, accountId, facts, expiresAt: expiryFor(facts) };
    return facts;
  };
  return Object.freeze({
    clear,
    peek() {
      const accountId = activeAccount(auth);
      const project = configured(config)?.url || null;
      const key = accountId && project ? `${project}|${accountId}` : null;
      if (key && cacheValid(key)) return cache.facts;
      if (cache && cache.key !== key) clear();
      else if (cache?.key === key) cache = null;
      return [];
    },
    async load() {
      const accountId = activeAccount(auth);
      const project = configured(config);
      if (!accountId || !project) { clear(); return []; }
      const key = `${project.url}|${accountId}`;
      if (cacheValid(key)) return cache.facts;
      if (cache?.key === key) cache = null;
      if (inflight?.key === key) return inflight.promise;
      clear();
      lastAuthorityKey = key;
      const runGeneration = generation;
      const promise = (async () => {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
        try {
          const token = await driver.getAccessToken({ erwarteteKontoId: accountId });
          if (!token || !runStillValid(runGeneration, key)) return [];
          const charts = [];
          for (const spec of FLIXPATROL_AT_CHARTS) {
            charts.push(await rpc(fetchImpl, project, token, "kd_flixpatrol_chart_read", {
              p_company_id: spec.companyId, p_country_id: spec.countryId, p_chart_type: spec.chartType,
            }, ctrl?.signal));
            if (!runStillValid(runGeneration, key)) return [];
          }
          const ids = [...new Set(charts.flatMap((result) => result?.chart?.items || [])
            .map((item) => String(item?.sourceId || "").trim()).filter((id) => /^ttl_[A-Za-z0-9]{20,40}$/.test(id)))].slice(0, 50);
          if (!runStillValid(runGeneration, key)) return [];
          if (!ids.length) return store(key, project.url, accountId, []);
          const titles = await rpc(fetchImpl, project, token, "kd_flixpatrol_titles_read", { p_source_ids: ids }, ctrl?.signal);
          if (!runStillValid(runGeneration, key)) return [];
          const facts = normalisiereFlixpatrolFakten(charts, titles);
          return runStillValid(runGeneration, key) ? store(key, project.url, accountId, facts) : [];
        } catch {
          if (runStillValid(runGeneration, key)) clear();
          return [];
        }
        finally { if (timer) clearTimeout(timer); }
      })();
      inflight = { key, promise };
      try { return await promise; }
      finally { if (inflight?.promise === promise) inflight = null; }
    },
  });
}

export const flixpatrolFactsService = createFlixpatrolFactsService();
