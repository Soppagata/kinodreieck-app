import { runtimeConfig } from "../config/runtime.js";
import { authDriver, authService } from "./auth.js";
import { validatePersonIdentity } from "../lib/personDiscoveryContracts.js";
import { createPersonRadarTargetId } from "../lib/personRadarCatalog.js";
import { normalizeProviderReceipt } from "../../supabase/functions/_shared/providerReceipt.js";
import { validateRadarPilotFeed } from "../lib/radarPilotContracts.js";

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
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
function frozenClone(value) { return freezeDeep(JSON.parse(JSON.stringify(value))); }
function exactResult(value, expectedPerson = null) {
  const allowed = [
    "ok", "status", "writes", "providerRequests", "searchRequests", "phaseCode", "personResult",
    "reservationStatus", "reservationUsdCent", "reservationDecision",
    "responseMode", "displayText", "warnings", "providerReceipt", "feed",
  ];
  if (!plain(value) || Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (value.ok !== true || !RADAR_WEBSEARCH_CLIENT_STATUSES.includes(value.status)
      || !Number.isInteger(value.writes) || value.writes < 0) return null;
  const reservationKeys = ["reservationStatus", "reservationUsdCent", "reservationDecision"];
  const reservationCount = reservationKeys.filter((key) => value[key] !== undefined).length;
  if (reservationCount !== 0 && reservationCount !== reservationKeys.length) return null;
  if (reservationCount === reservationKeys.length) {
    const statuses = ["not-started", "reserved", "rejected", "unknown"];
    const decisions = ["not-started", "accepted", "limit", "disabled", "forbidden", "server", "unknown"];
    if (!statuses.includes(value.reservationStatus) || !decisions.includes(value.reservationDecision)
        || (value.reservationUsdCent !== null
          && (typeof value.reservationUsdCent !== "number" || !Number.isFinite(value.reservationUsdCent)
            || value.reservationUsdCent <= 0 || value.reservationUsdCent > 5))
        || (value.reservationStatus === "not-started"
          && (value.reservationDecision !== "not-started" || value.reservationUsdCent !== null))
        || (value.reservationStatus === "reserved"
          && (value.reservationDecision !== "accepted" || value.reservationUsdCent === null))
        || (value.reservationStatus === "rejected"
          && (!["limit", "disabled", "forbidden", "server", "unknown"].includes(value.reservationDecision)
            || value.reservationUsdCent !== null))
        || (value.reservationStatus === "unknown"
          && (value.reservationDecision !== "unknown" || value.reservationUsdCent !== null))) return null;
  }
  const telemetryKeys = ["providerRequests", "searchRequests", "phaseCode"];
  const telemetryCount = telemetryKeys.filter((key) => value[key] !== undefined).length;
  const hasRequestTelemetry = value.providerRequests !== undefined || value.searchRequests !== undefined;
  if (telemetryCount !== 0 && ((!hasRequestTelemetry
      && value.phaseCode !== undefined)
      || (hasRequestTelemetry && (value.providerRequests === undefined || value.searchRequests === undefined))
      || !Number.isInteger(value.providerRequests) || value.providerRequests < 0 || value.providerRequests > 1
      || !Number.isInteger(value.searchRequests) || value.searchRequests < 0 || value.searchRequests > 1
      || (value.phaseCode !== undefined
        && !["runtime-setup", "cost-reservation", "provider-request", "provider-complete"].includes(value.phaseCode)))) {
    return null;
  }
  const providerReceipt = value.providerReceipt === undefined
    ? null : normalizeProviderReceipt(value.providerReceipt);
  if (value.providerReceipt !== undefined && (!providerReceipt
      || telemetryCount !== telemetryKeys.length
      || value.providerRequests !== providerReceipt.server.providerRequests
      || ("webSearchRequests" in providerReceipt.usage
        && value.searchRequests !== providerReceipt.usage.webSearchRequests))) return null;
  const presentationKeys = ["responseMode", "displayText", "warnings"];
  const presentationCount = presentationKeys.filter((key) => value[key] !== undefined).length;
  let presentation = {};
  if (presentationCount !== 0) {
    if (presentationCount !== presentationKeys.length
        || !["structured", "partial", "degraded"].includes(value.responseMode)
        || (value.displayText !== null
          && (typeof value.displayText !== "string" || !value.displayText.trim()
            || value.displayText !== value.displayText.trim() || value.displayText.length > 320
            || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value.displayText)))
        || !Array.isArray(value.warnings) || value.warnings.length > 8
        || new Set(value.warnings).size !== value.warnings.length
        || value.warnings.some((warning) => (
          typeof warning !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(warning)
          || warning.length > 64
        ))
        || (value.responseMode === "structured"
          ? value.displayText !== null || value.warnings.length !== 0
          : value.displayText === null)) return null;
    presentation = {
      responseMode: value.responseMode,
      displayText: value.displayText,
      warnings: Object.freeze([...value.warnings]),
    };
  }
  if (providerReceipt && presentationCount !== 0
      && providerReceipt.resultMode !== value.responseMode) return null;
  const feed = value.feed === undefined ? null : validateRadarPilotFeed(value.feed).ok
    ? frozenClone(value.feed) : null;
  if (value.feed !== undefined && !feed) return null;
  const feedResult = feed ? { feed } : {};
  if (!expectedPerson) {
    if (value.personResult !== undefined) return null;
    return Object.freeze({ status: value.status, writes: value.writes, ...presentation, ...feedResult });
  }
  const result = value.personResult;
  if (!plain(result) || !validatePersonIdentity(result.person).ok
      || result.person.personExternalId !== expectedPerson.personExternalId
      || result.person.name !== expectedPerson.name || result.person.role !== expectedPerson.role
      || result.status !== value.status || value.writes > 3) return null;
  return Object.freeze({ status: value.status, writes: value.writes, personResult: result, ...presentation, ...feedResult });
}

/* Der Browser sendet die starke Zielkennung und nur bei einem lokalen
   Freitextziel zusätzlich dessen unveränderten targetText. Kontoidentität und
   Capability werden serverseitig aus dem Sitzungstoken abgeleitet; weder
   Profildaten noch Mediathek oder weitere Abos gehören in den Request. */
export function createRadarWebsearchService({
  config = runtimeConfig,
  auth = authService,
  getAccount = authDriver.konto,
  getAccessToken = authDriver.getAccessToken,
  fetchImpl = globalThis.fetch,
  singleFile = RADAR_WEBSEARCH_SINGLE_FILE_DISABLED,
} = {}) {
  async function checkTarget(targetId, expectedPerson = null, targetText = null) {
    const normalizedTargetId = text(targetId);
    const hasTargetText = targetText !== null && targetText !== undefined;
    const validTargetText = typeof targetText === "string" && targetText.trim().length > 0
      && targetText.length <= 160;
    const session = auth.getSnapshot();
    const accountId = text(session?.account?.id);
    if (singleFile === true || config.radarPilotClientEnabled !== true || session?.mode !== "account"
        || session?.state !== "ready" || !accountId
        || text(getAccount()?.id) !== accountId || !normalizedTargetId
        || normalizedTargetId.length > 160 || (hasTargetText && !validTargetText)
        || typeof fetchImpl !== "function") {
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
        body: JSON.stringify({ targetId: normalizedTargetId, ...(hasTargetText ? { targetText } : {}) }),
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

  async function checkNow(targetId, targetText = null) {
    return checkTarget(targetId, null, targetText);
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
