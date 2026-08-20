import { runtimeConfig } from "../config/runtime.js";
import { hatBestaetigteOwnerRolle } from "../lib/accountAccess.js";
import { validateWebDiscoveryFeed } from "../lib/webDiscoveryFeed.js";
import { authDriver, authService } from "./auth.js";

export const ENTDECKEN_DAILY_ENDPOINT = "entdecken-daily-task";
export const ENTDECKEN_DAILY_CLIENT_STATUSES = Object.freeze([
  "fresh", "stale", "empty", "disabled", "unavailable", "invalid_response",
]);

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
function frozen(status, feed = null) { return Object.freeze({ status, feed }); }
function exactResult(value, today) {
  const allowed = ["ok", "status", "feed", "writes", "providerRequests", "searchRequests"];
  if (!plain(value) || !["ok", "status", "feed"].every((key) => key in value)
      || Object.keys(value).some((key) => !allowed.includes(key))
      || value.ok !== true || !["fresh", "stale", "empty", "disabled"].includes(value.status)) return null;
  for (const key of ["writes", "providerRequests", "searchRequests"]) {
    if (key in value && (!Number.isInteger(value[key]) || value[key] < 0)) return null;
  }
  if (value.status === "empty" || value.status === "disabled") {
    return value.feed === null ? frozen(value.status) : null;
  }
  const checked = validateWebDiscoveryFeed(value.feed);
  if (!checked.ok || !today || checked.value.validUntil < today) return null;
  if ((value.status === "fresh") !== (checked.value.refreshedOn === today)) return null;
  return frozen(value.status, checked.value);
}

/* Ein App-Lauf startet hoechstens einen GET. Der private Pilot sendet nur das
   verifizierbare Sitzungstoken; Body, Profil, Seen- und Katalogdaten bleiben aus. */
export function createEntdeckenDailyFeedService({
  config = runtimeConfig,
  auth = authService,
  getAccount = authDriver.konto,
  getAccessToken = authDriver.getAccessToken,
  fetchImpl = globalThis.fetch,
  currentDay = () => viennaDay(new Date()),
} = {}) {
  async function load() {
    if (config.entdeckenDailyFeedEnabled !== true || typeof fetchImpl !== "function") {
      return frozen("disabled");
    }
    const session = auth.getSnapshot();
    const accountId = text(session?.account?.id);
    if (!hatBestaetigteOwnerRolle(session) || session?.capabilities?.personalAi !== true
        || !accountId || text(getAccount()?.id) !== accountId) return frozen("disabled");
    const basis = text(config.supabaseUrl).replace(/\/+$/, "");
    const publishableKey = text(config.supabasePublishableKey);
    if (!basis || !publishableKey) return frozen("unavailable");
    let token;
    try { token = await getAccessToken({ erwarteteKontoId: accountId }); }
    catch { return frozen("unavailable"); }
    if (!token || auth.getSnapshot() !== session || text(getAccount()?.id) !== accountId) {
      return frozen("disabled");
    }
    let response;
    try {
      response = await fetchImpl(`${basis}/functions/v1/${ENTDECKEN_DAILY_ENDPOINT}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: publishableKey,
          Accept: "application/json",
        },
      });
    } catch { return frozen("unavailable"); }
    let payload;
    try { payload = await response.json(); }
    catch { return frozen("invalid_response"); }
    if (auth.getSnapshot() !== session || text(getAccount()?.id) !== accountId) return frozen("disabled");
    const checked = exactResult(payload, currentDay());
    if (!response.ok || !checked) return frozen(response.ok ? "invalid_response" : "unavailable");
    return checked;
  }
  return Object.freeze({ load });
}

export const entdeckenDailyFeedService = createEntdeckenDailyFeedService();
