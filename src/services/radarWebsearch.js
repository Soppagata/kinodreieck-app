import { runtimeConfig } from "../config/runtime.js";
import { authDriver, authService } from "./auth.js";
import { validatePersonIdentity } from "../lib/personDiscoveryContracts.js";
import { createPersonRadarTargetId } from "../lib/personRadarCatalog.js";

export const RADAR_WEBSEARCH_ENDPOINT = "radar-websearch-task";
export const RADAR_WEBSEARCH_SINGLE_FILE_DISABLED = typeof __KD_SINGLE_FILE__ !== "undefined"
  && __KD_SINGLE_FILE__ === true;
export const RADAR_WEBSEARCH_CLIENT_STATUSES = Object.freeze([
  "confirmed", "insufficient_evidence", "no_change", "provider_error",
  "invalid_response", "forbidden", "unavailable", "storage_error",
]);
export const RADAR_WEBSEARCH_CLIENT_RESPONSE_MAX_BYTES = 64 * 1024;

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactResult(value, expectedPerson = null) {
  const allowed = [
    "ok", "status", "writes", "providerRequests", "searchRequests", "phaseCode", "personResult",
  ];
  if (!plain(value) || Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (value.ok !== true || !RADAR_WEBSEARCH_CLIENT_STATUSES.includes(value.status)
      || !Number.isInteger(value.writes) || value.writes < 0) return null;
  if (!expectedPerson) {
    if (value.personResult !== undefined) return null;
    return Object.freeze({ status: value.status, writes: value.writes });
  }
  const result = value.personResult;
  if (!plain(result) || !validatePersonIdentity(result.person).ok
      || result.person.personExternalId !== expectedPerson.personExternalId
      || result.person.name !== expectedPerson.name || result.person.role !== expectedPerson.role
      || result.status !== value.status || value.writes !== 0) return null;
  return Object.freeze({ status: value.status, writes: value.writes, personResult: result });
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
  singleFile = RADAR_WEBSEARCH_SINGLE_FILE_DISABLED,
} = {}) {
  async function checkTarget(targetId, expectedPerson = null) {
    const normalizedTargetId = text(targetId);
    const session = auth.getSnapshot();
    const accountId = text(session?.account?.id);
    if (singleFile === true || config.radarPilotClientEnabled !== true || session?.mode !== "account"
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
    let payloadBytes = Number.POSITIVE_INFINITY;
    try { payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).length; } catch { /* fail closed */ }
    if (payloadBytes > RADAR_WEBSEARCH_CLIENT_RESPONSE_MAX_BYTES) {
      return Object.freeze({ status: "invalid_response", writes: 0 });
    }
    const checked = exactResult(payload, expectedPerson);
    if (!response.ok || !checked) {
      const status = response.status === 401 || response.status === 403 ? "forbidden" : "unavailable";
      return Object.freeze({ status, writes: 0 });
    }
    return checked;
  }

  async function checkNow(targetId) {
    return checkTarget(targetId);
  }

  async function checkPersonNow(identity) {
    const checked = validatePersonIdentity(identity);
    const expectedTargetId = createPersonRadarTargetId(identity?.personExternalId, identity?.role);
    if (!checked.ok || identity?.targetId !== expectedTargetId) {
      return Object.freeze({ status: "forbidden", writes: 0 });
    }
    return checkTarget(expectedTargetId, identity);
  }

  return Object.freeze({ checkNow, checkPersonNow });
}

export const radarWebsearchService = createRadarWebsearchService();
