import { authDriver, authService } from "./auth.js";
import { runtimeConfig } from "../config/runtime.js";
import { FLIXPATROL_AT_CHARTS, normalisiereFlixpatrolFakten } from "../lib/flixpatrolFacts.js";

const TIMEOUT_MS = 12000;

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
} = {}) {
  let cache = null;
  let inflight = null;
  const clear = () => { cache = null; };
  auth?.subscribe?.(() => {
    if (!cache || cache.accountId !== activeAccount(auth)) clear();
  });
  return Object.freeze({
    clear,
    peek() {
      const accountId = activeAccount(auth);
      const project = configured(config)?.url || null;
      return cache && cache.accountId === accountId && cache.project === project ? cache.facts : [];
    },
    async load() {
      const accountId = activeAccount(auth);
      const project = configured(config);
      if (!accountId || !project) { clear(); return []; }
      const key = `${project.url}|${accountId}`;
      if (cache?.key === key) return cache.facts;
      if (inflight?.key === key) return inflight.promise;
      clear();
      const promise = (async () => {
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
        try {
          const token = await driver.getAccessToken({ erwarteteKontoId: accountId });
          if (!token || activeAccount(auth) !== accountId) return [];
          const charts = [];
          for (const spec of FLIXPATROL_AT_CHARTS) {
            charts.push(await rpc(fetchImpl, project, token, "kd_flixpatrol_chart_read", {
              p_company_id: spec.companyId, p_country_id: spec.countryId, p_chart_type: spec.chartType,
            }, ctrl?.signal));
            if (activeAccount(auth) !== accountId) return [];
          }
          const ids = [...new Set(charts.flatMap((result) => result?.chart?.items || [])
            .map((item) => String(item?.sourceId || "").trim()).filter((id) => /^ttl_[A-Za-z0-9]{20,40}$/.test(id)))].slice(0, 50);
          if (!ids.length || activeAccount(auth) !== accountId) return [];
          const titles = await rpc(fetchImpl, project, token, "kd_flixpatrol_titles_read", { p_source_ids: ids }, ctrl?.signal);
          if (activeAccount(auth) !== accountId) return [];
          const facts = normalisiereFlixpatrolFakten(charts, titles);
          cache = { key, project: project.url, accountId, facts };
          return facts;
        } catch { clear(); return []; }
        finally { if (timer) clearTimeout(timer); }
      })();
      inflight = { key, promise };
      try { return await promise; }
      finally { if (inflight?.promise === promise) inflight = null; }
    },
  });
}

export const flixpatrolFactsService = createFlixpatrolFactsService();
