import { runtimeConfig } from "../config/runtime.js";
import { authDriver, authService } from "./auth.js";

export const RADAR_WEBSEARCH_ENDPOINT = "radar-websearch-task";
export const RADAR_WEBSEARCH_CLIENT_STATUSES = Object.freeze([
  "confirmed", "insufficient_evidence", "no_change", "provider_error",
  "invalid_response", "forbidden", "unavailable", "storage_error",
]);

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactResult(value) {
  const allowed = ["ok", "status", "writes", "providerRequests", "searchRequests"];
  if (!plain(value) || !["ok", "status", "writes"].every((key) => key in value)
      || Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (value.ok !== true || !RADAR_WEBSEARCH_CLIENT_STATUSES.includes(value.status)
      || !Number.isInteger(value.writes) || value.writes < 0) return null;
  for (const key of ["providerRequests", "searchRequests"]) {
    if (key in value && (!Number.isInteger(value[key]) || value[key] < 0)) return null;
  }
  return Object.freeze({ status: value.status, writes: value.writes });
}

/* Der Browser sendet ausschließlich die starke Zielkennung. Kontoidentität
   und Capability werden serverseitig aus dem Sitzungstoken abgeleitet; weder
   Profildaten noch Mediathek oder weitere Abos gehören in den Request. */
export function createRadarWebsearchService({
  config = runtimeConfig,
  auth = authService,
  getAccount = authDriver.konto,
  getAccessToken = authDriver.getAccessToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  async function checkNow(targetId) {
    const normalizedTargetId = text(targetId);
    const session = auth.getSnapshot();
    const accountId = text(session?.account?.id);
    if (config.radarPilotClientEnabled !== true || session?.mode !== "account"
        || session?.state !== "ready" || !accountId
        || text(getAccount()?.id) !== accountId || !normalizedTargetId
        || normalizedTargetId.length > 160 || typeof fetchImpl !== "function") {
      return Object.freeze({ status: "forbidden", writes: 0 });
    }
    const basis = text(config.supabaseUrl).replace(/\/+$/, "");
    const publishableKey = text(config.supabasePublishableKey);
    if (!basis || !publishableKey) return Object.freeze({ status: "unavailable", writes: 0 });

    let token;
    try { token = await getAccessToken({ erwarteteKontoId: accountId }); }
    catch { return Object.freeze({ status: "unavailable", writes: 0 }); }
    if (!token || auth.getSnapshot() !== session || text(getAccount()?.id) !== accountId) {
      return Object.freeze({ status: "forbidden", writes: 0 });
    }

    let response;
    try {
      response = await fetchImpl(`${basis}/functions/v1/${RADAR_WEBSEARCH_ENDPOINT}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetId: normalizedTargetId }),
      });
    } catch {
      return Object.freeze({ status: "unavailable", writes: 0 });
    }
    if (auth.getSnapshot() !== session || text(getAccount()?.id) !== accountId) {
      return Object.freeze({ status: "forbidden", writes: 0 });
    }
    let payload;
    try { payload = await response.json(); }
    catch { return Object.freeze({ status: "invalid_response", writes: 0 }); }
    const checked = exactResult(payload);
    if (!response.ok || !checked) {
      const status = response.status === 401 || response.status === 403 ? "forbidden" : "unavailable";
      return Object.freeze({ status, writes: 0 });
    }
    return checked;
  }

  return Object.freeze({ checkNow });
}

export const radarWebsearchService = createRadarWebsearchService();
