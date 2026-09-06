import { runtimeConfig } from "../config/runtime.js";
import { ENTDECKEN_MARKET_POOL_50 } from "../data/entdeckenMarketPool50.js";
import { validateWebDiscoveryFeed } from "../lib/webDiscoveryFeed.js";
import { authDriver, authService } from "./auth.js";

export const ENTDECKEN_DAILY_ENDPOINT = "entdecken-daily-task";
export const ENTDECKEN_DAILY_CLIENT_STATUSES = Object.freeze([
  "fresh", "stale", "empty", "disabled", "unavailable", "invalid_response",
]);
export const ENTDECKEN_DAILY_PARTIAL_NOTICE =
  "Einige Wochentipps waren unvollständig. Angezeigt werden nur sicher belegte Titel.";
export const ENTDECKEN_DAILY_DEGRADED_NOTICE =
  "Die neuen Wochentipps waren nicht verlässlich lesbar. Der bisherige Feed bleibt sichtbar.";
export const ENTDECKEN_DAILY_STALE_NOTICE =
  "Der angezeigte datierte Stand liegt außerhalb seines bestätigten Gültigkeitszeitraums. Er bleibt nur zur Orientierung sichtbar.";
export const ENTDECKEN_DAILY_STALE_DEGRADED_NOTICE =
  "Die neuen Wochentipps waren nicht verlässlich lesbar. Der bisherige datierte Stand liegt außerhalb seines bestätigten Gültigkeitszeitraums und bleibt nur zur Orientierung sichtbar.";
export const ENTDECKEN_DAILY_CLIENT_TIMEOUT_MS = 20_000;
const READ_REFRESH_STATUSES = new Set(["read_only", "disabled", "unavailable"]);

export function entdeckenDailyFeedNotice(value) {
  if (value?.status === "stale") {
    return value?.responseMode === "degraded"
      ? ENTDECKEN_DAILY_STALE_DEGRADED_NOTICE : ENTDECKEN_DAILY_STALE_NOTICE;
  }
  if (value?.responseMode === "partial") return ENTDECKEN_DAILY_PARTIAL_NOTICE;
  if (value?.responseMode === "degraded") return ENTDECKEN_DAILY_DEGRADED_NOTICE;
  return null;
}

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function viennaDay(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const day = `${values.year}-${values.month}-${values.day}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  } catch { return null; }
}
function isoWeekForDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const start = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date - start) / 86_400_000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
function presentation(value) {
  const responseMode = value?.responseMode;
  if (responseMode === undefined) {
    return Object.freeze({ responseMode: "structured", displayText: null, warnings: Object.freeze([]) });
  }
  if (!["structured", "partial", "degraded"].includes(responseMode)) return null;
  const warnings = value.warnings === undefined ? [] : value.warnings;
  if (!Array.isArray(warnings) || warnings.length > 8 || warnings.some((warning) => (
    typeof warning !== "string" || warning.length > 64
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(warning)
  ))) return null;
  const expectedText = responseMode === "partial" ? ENTDECKEN_DAILY_PARTIAL_NOTICE
    : responseMode === "degraded" ? ENTDECKEN_DAILY_DEGRADED_NOTICE : null;
  if (value.displayText !== undefined && value.displayText !== expectedText) return null;
  if (responseMode === "structured" && warnings.length) return null;
  return Object.freeze({
    responseMode,
    /* Nie freien Anbietertext anzeigen: die UI bekommt nur lokale Festtexte. */
    displayText: expectedText,
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
function refreshState(value, feedFormat = null) {
  /* Direkt nach der Forward-Migration darf der letzte gute Format-3/4-Feed
     noch unter dem neuen Ein-Versuch-Serververtrag sichtbar sein. Format 5
     selbst ist dagegen ausschliesslich mit maxAttempts=1 gueltig. */
  const expectedAttempts = [5, 6, 7].includes(feedFormat) ? 1 : null;
  if (!plain(value)
      || Object.keys(value).sort().join(",")
        !== ["attemptCount", "maxAttempts", "mode", "requested", "status"].sort().join(",")
      || value.requested !== false || value.mode !== "read"
      || !READ_REFRESH_STATUSES.has(value.status)
      || !Number.isInteger(value.attemptCount) || value.attemptCount < 0
      || ![1, 3].includes(value.maxAttempts)
      || (expectedAttempts !== null && value.maxAttempts !== expectedAttempts)
      || value.attemptCount > value.maxAttempts) return null;
  return Object.freeze({ ...value });
}
function frozen(status, feed = null, response = null, refresh = null) {
  return Object.freeze({
    status,
    feed,
    ...(response || presentation({})),
    ...(refresh ? { refresh } : {}),
  });
}
function exactResult(value, today) {
  const allowed = [
    "ok", "status", "feed", "writes", "providerRequests", "searchRequests",
    "sourceRequests", "wikidataRequests", "responseMode", "displayText", "warnings", "providerReceipt", "feedReadback", "refresh",
  ];
  if (!plain(value) || !["ok", "status", "feed"].every((key) => key in value)
      || Object.keys(value).some((key) => !allowed.includes(key))
      || value.ok !== true || !["fresh", "stale", "empty", "disabled"].includes(value.status)) return null;
  for (const key of ["writes", "providerRequests", "searchRequests", "sourceRequests", "wikidataRequests"]) {
    if (key in value && (!Number.isInteger(value[key]) || value[key] < 0)) return null;
  }
  /* Der Browser benoetigt die inhaltsfreien Live-/Persistenzbelege nicht,
     darf eine normale frische Functionantwort mit diesen eigenen Feldern aber
     auch nicht als fremde Form verwerfen. Sie werden nach dieser Huelle nicht
     in den UI-State uebernommen. */
  if (("providerReceipt" in value && !plain(value.providerReceipt))
      || ("feedReadback" in value && !plain(value.feedReadback))) return null;
  const response = presentation(value);
  const refresh = refreshState(value.refresh, value.feed?.format ?? null);
  if (!response || !refresh) return null;
  if (value.status === "empty" || value.status === "disabled") {
    return value.feed === null ? frozen(value.status, null, response, refresh) : null;
  }
  const checked = validateWebDiscoveryFeed(value.feed);
  if (!checked.ok || !today) return null;
  if (checked.value.format === 4) {
    const currentWeek = isoWeekForDay(today);
    if (!currentWeek || (value.status === "fresh") !== (checked.value.isoWeek === currentWeek)) return null;
    if (value.status === "fresh" && checked.value.validUntil < today) return null;
  } else if ([5, 6, 7].includes(checked.value.format)) {
    if ((value.status === "fresh") !== (
      checked.value.refreshedOn <= today && checked.value.validUntil >= today
    )) return null;
  } else {
    if (checked.value.validUntil < today) return null;
    if ((value.status === "fresh") !== (checked.value.refreshedOn === today)) return null;
  }
  return frozen(value.status, checked.value, response, refresh);
}

function fallbackState(fallbackFeed, today) {
  if (fallbackFeed === null) return null;
  const checked = validateWebDiscoveryFeed(fallbackFeed);
  if (!checked.ok || !today) return frozen("invalid_response");
  const status = checked.value.refreshedOn <= today && checked.value.validUntil >= today
    ? "fresh" : "stale";
  return frozen(status, checked.value, presentation({}), Object.freeze({
    requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1,
  }));
}
function newerFeed(serverState, localState) {
  if (!localState?.feed) return serverState;
  if (!serverState?.feed) return localState;
  return serverState.feed.refreshedOn > localState.feed.refreshedOn
    ? serverState : localState;
}

/* Nur ein aktiv freigeschaltetes, waehrend Token- und Requestphase identisches
   Konto versucht den privaten GET. Der versionierte Pool bleibt oeffentlicher
   Fail-safe und gewinnt, solange der Server keinen strikt gueltigen, inhaltlich
   neueren Stand liefert. Body, Profil, Seen-Stand, Dienste und Katalogdaten
   bleiben vollstaendig lokal. */
export function createEntdeckenDailyFeedService({
  config = runtimeConfig,
  auth = authService,
  getAccount = authDriver.konto,
  getAccessToken = authDriver.getAccessToken,
  fetchImpl = globalThis.fetch,
  currentDay = () => viennaDay(new Date()),
  fallbackFeed = null,
  timeoutMs = ENTDECKEN_DAILY_CLIENT_TIMEOUT_MS,
} = {}) {
  const requestTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.min(timeoutMs, ENTDECKEN_DAILY_CLIENT_TIMEOUT_MS)
    : ENTDECKEN_DAILY_CLIENT_TIMEOUT_MS;
  async function load() {
    const today = currentDay();
    const localState = fallbackState(fallbackFeed, today);
    const failSafe = (status) => localState?.feed || localState?.status === "invalid_response"
      ? localState : frozen(status);
    if (config.entdeckenDailyFeedEnabled !== true || typeof fetchImpl !== "function") {
      return failSafe("disabled");
    }
    const session = auth?.getSnapshot?.();
    const accountId = text(session?.account?.id);
    if (session?.mode !== "account" || session?.state !== "ready"
        || session?.capabilities?.remoteStorage !== true || !accountId
        || text(getAccount?.()?.id) !== accountId) {
      return failSafe("disabled");
    }
    const basis = text(config.supabaseUrl).replace(/\/+$/, "");
    const publishableKey = text(config.supabasePublishableKey);
    if (!basis || !publishableKey) return failSafe("unavailable");

    let token;
    try { token = await getAccessToken({ erwarteteKontoId: accountId }); }
    catch { return failSafe("unavailable"); }
    const accountUnchanged = () => (
      auth.getSnapshot() === session && text(getAccount()?.id) === accountId
    );
    if (!token || !accountUnchanged()) return failSafe("disabled");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response;
    let payload;
    try {
      response = await fetchImpl(`${basis}/functions/v1/${ENTDECKEN_DAILY_ENDPOINT}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: publishableKey,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!accountUnchanged()) return failSafe("disabled");
      try { payload = await response.json(); }
      catch {
        return failSafe(controller.signal.aborted ? "unavailable" : "invalid_response");
      }
    } catch { return failSafe("unavailable"); }
    finally { clearTimeout(timer); }
    if (!accountUnchanged()) return failSafe("disabled");
    const checked = exactResult(payload, today);
    if (!response.ok || !checked) return failSafe(response.ok ? "invalid_response" : "unavailable");
    return newerFeed(checked, localState);
  }
  return Object.freeze({ load });
}

export const entdeckenDailyFeedService = createEntdeckenDailyFeedService({
  fallbackFeed: ENTDECKEN_MARKET_POOL_50,
});
