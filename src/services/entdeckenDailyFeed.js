import { runtimeConfig } from "../config/runtime.js";
import { validateWebDiscoveryFeed } from "../lib/webDiscoveryFeed.js";

export const ENTDECKEN_DAILY_ENDPOINT = "entdecken-daily-task";
export const ENTDECKEN_DAILY_CLIENT_STATUSES = Object.freeze([
  "fresh", "stale", "empty", "disabled", "unavailable", "invalid_response",
]);
export const ENTDECKEN_DAILY_PARTIAL_NOTICE =
  "Einige Wochentipps waren unvollständig. Angezeigt werden nur sicher belegte Titel.";
export const ENTDECKEN_DAILY_DEGRADED_NOTICE =
  "Die neuen Wochentipps waren nicht verlässlich lesbar. Der bisherige Feed bleibt sichtbar.";

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
function frozen(status, feed = null, response = null) {
  return Object.freeze({
    status,
    feed,
    ...(response || presentation({})),
  });
}
function exactResult(value, today) {
  const allowed = [
    "ok", "status", "feed", "writes", "providerRequests", "searchRequests",
    "responseMode", "displayText", "warnings",
  ];
  if (!plain(value) || !["ok", "status", "feed"].every((key) => key in value)
      || Object.keys(value).some((key) => !allowed.includes(key))
      || value.ok !== true || !["fresh", "stale", "empty", "disabled"].includes(value.status)) return null;
  for (const key of ["writes", "providerRequests", "searchRequests"]) {
    if (key in value && (!Number.isInteger(value[key]) || value[key] < 0)) return null;
  }
  const response = presentation(value);
  if (!response) return null;
  if (value.status === "empty" || value.status === "disabled") {
    return value.feed === null ? frozen(value.status, null, response) : null;
  }
  const checked = validateWebDiscoveryFeed(value.feed);
  if (!checked.ok || !today) return null;
  if (checked.value.format === 4) {
    const currentWeek = isoWeekForDay(today);
    if (!currentWeek || (value.status === "fresh") !== (checked.value.isoWeek === currentWeek)) return null;
    if (value.status === "fresh" && checked.value.validUntil < today) return null;
  } else {
    if (checked.value.validUntil < today) return null;
    if ((value.status === "fresh") !== (checked.value.refreshedOn === today)) return null;
  }
  return frozen(value.status, checked.value, response);
}

/* Ein App-Lauf startet hoechstens einen accountlosen GET. Body, Sitzung,
   Profil, Seen-Stand, Dienste und Katalogdaten bleiben vollstaendig lokal. */
export function createEntdeckenDailyFeedService({
  config = runtimeConfig,
  fetchImpl = globalThis.fetch,
  currentDay = () => viennaDay(new Date()),
} = {}) {
  async function load() {
    if (config.entdeckenDailyFeedEnabled !== true || typeof fetchImpl !== "function") {
      return frozen("disabled");
    }
    const basis = text(config.supabaseUrl).replace(/\/+$/, "");
    const publishableKey = text(config.supabasePublishableKey);
    if (!basis || !publishableKey) return frozen("unavailable");
    let response;
    try {
      response = await fetchImpl(`${basis}/functions/v1/${ENTDECKEN_DAILY_ENDPOINT}`, {
        method: "GET",
        headers: {
          apikey: publishableKey,
          Accept: "application/json",
        },
      });
    } catch { return frozen("unavailable"); }
    let payload;
    try { payload = await response.json(); }
    catch { return frozen("invalid_response"); }
    const checked = exactResult(payload, currentDay());
    if (!response.ok || !checked) return frozen(response.ok ? "invalid_response" : "unavailable");
    return checked;
  }
  return Object.freeze({ load });
}

export const entdeckenDailyFeedService = createEntdeckenDailyFeedService();
