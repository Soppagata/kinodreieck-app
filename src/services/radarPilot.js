import { runtimeConfig } from "../config/runtime.js";
import { AUTH_SESSION_KEY } from "../lib/authDriver.js";
import {
  acknowledgeAccountRadarPilotImport,
  acknowledgeAccountRadarPilotReceipt,
  acknowledgeAccountRadarPilotSubscription,
  markAccountRadarPilotUnavailable,
  reconcileAccountRadarPilotFeed,
  rejectAccountRadarChange,
  rejectAccountRadarPilotImport,
  rejectAccountRadarPilotReceipt,
  validateLocalRadarState,
} from "../lib/localEventRadar.js";
import {
  validateRadarPilotFeed,
  validateRadarPilotImportResult,
  validateRadarPilotSubscriptionAck,
} from "../lib/radarPilotContracts.js";
import { authDriver, authService } from "./auth.js";
import { K, captureStorageContext } from "./storage.js";

export const RADAR_PILOT_RPCS = Object.freeze([
  "kd_radar_pilot_set_subscription",
  "kd_radar_pilot_set_receipt",
  "kd_radar_pilot_import_event",
  "kd_radar_pilot_feed",
]);

const TERMINAL_SQLSTATES = new Set(["22023", "23505", "23514", "42501"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function currentStoredToken(token, expectedAccount) {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
    return text(stored?.kontoId) === text(expectedAccount) && stored?.access_token === token;
  } catch { return false; }
}
function rpcStatus(code, payload) {
  const sqlstate = text(payload?.code);
  const message = text(payload?.message);
  if (code === 404 && (sqlstate === "PGRST202" || /function.+not found|schema cache/i.test(message))) {
    return { kind: "pilot-unavailable", reason: "pilot-rpc-unavailable" };
  }
  if (code >= 500) return { kind: "pending", reason: "pilot-server-unavailable" };
  if (code >= 400 && TERMINAL_SQLSTATES.has(sqlstate) && /^radar_[a-z0-9_]+$/i.test(message)) {
    return { kind: "rejected", reason: message.toLowerCase() };
  }
  return { kind: "pending", reason: "pilot-response-unknown" };
}
function contextError() {
  const error = new Error("Radar-Pilot-Kontext hat sich während des Auftrags geändert.");
  error.code = "RADAR_PILOT_CONTEXT_CHANGED";
  return error;
}

export function createRadarPilotService({
  config = runtimeConfig,
  auth = authService,
  getAccount = authDriver.konto,
  getAccessToken = authDriver.getAccessToken,
  captureContext = captureStorageContext,
  isTokenCurrent = currentStoredToken,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const basis = text(config.supabaseUrl).replace(/\/+$/, "");
  const publishableKey = text(config.supabasePublishableKey);

  function captureFence() {
    const session = auth.getSnapshot();
    const persistentAccount = getAccount();
    const account = text(session?.account?.id);
    if (session?.mode !== "account" || session?.state !== "ready" || !account
        || text(persistentAccount?.id) !== account) return null;
    const storage = captureContext();
    if (!storage?.isCurrent?.() || text(storage.owner) !== `account:${account}`) return null;
    return Object.freeze({
      session,
      account,
      storage,
      storageName: storage.name,
      storageOwner: storage.owner,
      storageGeneration: storage.generation,
    });
  }

  function fenceCurrent(fence, token = null) {
    if (!fence || auth.getSnapshot() !== fence.session) return false;
    const session = auth.getSnapshot();
    if (session?.mode !== "account" || session?.state !== "ready"
        || text(session?.account?.id) !== fence.account
        || text(getAccount()?.id) !== fence.account
        || !fence.storage.isCurrent()
        || fence.storage.name !== fence.storageName
        || fence.storage.owner !== fence.storageOwner
        || fence.storage.generation !== fence.storageGeneration) return false;
    return token == null || isTokenCurrent(token, fence.account) === true;
  }

  async function guarded(promise, fence, token = null) {
    if (!fenceCurrent(fence, token)) throw contextError();
    const value = await promise;
    if (!fenceCurrent(fence, token)) throw contextError();
    return value;
  }

  async function loadToken(fence) {
    if (!fenceCurrent(fence)) throw contextError();
    let token;
    try { token = await getAccessToken({ erwarteteKontoId: fence.account }); }
    catch (cause) {
      if (!fenceCurrent(fence)) throw contextError();
      const error = new Error("Radar-Pilot-Token ist vorübergehend nicht verfügbar.", { cause });
      error.code = "RADAR_PILOT_TOKEN_UNAVAILABLE";
      throw error;
    }
    if (!fenceCurrent(fence)) throw contextError();
    if (token && !fenceCurrent(fence, token)) throw contextError();
    if (!token) {
      if (!fenceCurrent(fence)) throw contextError();
      const error = new Error("Radar-Pilot-Token ist nicht verfügbar.");
      error.code = "RADAR_PILOT_TOKEN_UNAVAILABLE";
      throw error;
    }
    return token;
  }

  async function callRpc(name, body, fence, token, { expectVoid = false } = {}) {
    let response;
    try {
      response = await guarded(Promise.resolve().then(() => fetchImpl(`${basis}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })), fence, token);
    } catch (error) {
      if (error?.code === "RADAR_PILOT_CONTEXT_CHANGED") throw error;
      return { kind: "pending", reason: "pilot-network-unknown" };
    }
    let raw;
    try { raw = await guarded(response.text(), fence, token); }
    catch (error) {
      if (error?.code === "RADAR_PILOT_CONTEXT_CHANGED") throw error;
      return { kind: "pending", reason: "pilot-body-unknown" };
    }
    let payload = null;
    if (raw !== "") {
      try { payload = JSON.parse(raw); }
      catch { return { kind: "pending", reason: "pilot-json-invalid" }; }
    }
    if (!response.ok) return rpcStatus(response.status, payload);
    if (expectVoid) {
      if (raw !== "" && payload !== null) {
        return { kind: "pending", reason: "pilot-void-response-invalid" };
      }
      return { kind: "ok", payload: null };
    }
    if (payload == null) return { kind: "pending", reason: "pilot-response-empty" };
    return { kind: "ok", payload };
  }

  async function persistState(commit, next, fence, token) {
    if (!fenceCurrent(fence, token) || typeof fence.storage?.set !== "function") throw contextError();
    try {
      await fence.storage.set(K.radar, JSON.stringify(next));
    } catch (error) {
      if (error?.code === "STORAGE_CONTEXT_CHANGED" || !fenceCurrent(fence, token)) throw contextError();
      return false;
    }
    if (!fenceCurrent(fence, token)) throw contextError();
    if (typeof commit === "function") {
      let confirmed;
      try { confirmed = commit(next); }
      catch { return false; }
      if (confirmed && typeof confirmed.then === "function") return false;
      if (confirmed === false) return false;
      if (!fenceCurrent(fence, token)) throw contextError();
    }
    return true;
  }

  async function unavailable(current, commit, fence, token) {
    const marked = markAccountRadarPilotUnavailable(current);
    if (!marked.ok) return { status: "pilot-unavailable", state: current };
    if (!await persistState(commit, marked.state, fence, token)) {
      return { status: "pending", state: current, reason: "pilot-persist-unconfirmed" };
    }
    return { status: "pilot-unavailable", state: marked.state };
  }

  async function runSync({ state, commit } = {}) {
    if (config.radarPilotClientEnabled !== true) return Object.freeze({ status: "disabled", state });
    const visibleSession = auth.getSnapshot();
    if (visibleSession?.mode !== "account") return Object.freeze({ status: "guest", state });
    if (!basis || !publishableKey || typeof fetchImpl !== "function") {
      return Object.freeze({ status: "pilot-unavailable", state });
    }
    if (!validateLocalRadarState(state).ok || state.authority !== "account-cache") {
      return Object.freeze({ status: "state-invalid", state });
    }
    const fence = captureFence();
    if (!fence) return Object.freeze({ status: "context-changed", state });
    let token;
    try { token = await loadToken(fence); }
    catch (error) {
      return Object.freeze({
        status: error?.code === "RADAR_PILOT_CONTEXT_CHANGED" ? "context-changed" : "pending",
        state,
        reason: error?.code === "RADAR_PILOT_CONTEXT_CHANGED" ? undefined : "pilot-token-unavailable",
      });
    }

    let current = state;
    let rejected = false;
    const runSubscriptionIds = state.outbox.filter((entry) => entry.status === "pending").map((entry) => entry.operationId);
    const runReceiptIds = (state.pilot?.receiptOutbox || [])
      .filter((entry) => entry.state === "pending").map((entry) => entry.eventVersionId);
    const runImportIds = (state.pilot?.importOutbox || [])
      .filter((entry) => entry.status === "pending").map((entry) => entry.operationId);

    try {
      const feedResponse = await callRpc("kd_radar_pilot_feed", { p_operation_ids: runSubscriptionIds }, fence, token);
      if (feedResponse.kind === "pilot-unavailable") return Object.freeze(await unavailable(current, commit, fence, token));
      if (feedResponse.kind !== "ok" || !validateRadarPilotFeed(feedResponse.payload).ok) {
        return Object.freeze({ status: "pending", state: current, reason: feedResponse.reason || "pilot-feed-invalid" });
      }
      const reconciled = reconcileAccountRadarPilotFeed(current, feedResponse.payload);
      if (!reconciled.ok) return Object.freeze({ status: "pending", state: current, reason: reconciled.reason });
      if (reconciled.changed) {
        if (!await persistState(commit, reconciled.state, fence, token)) {
          return Object.freeze({ status: "pending", state: current, reason: "pilot-persist-unconfirmed" });
        }
        current = reconciled.state;
      }

      for (const operationId of runSubscriptionIds) {
        const operation = current.outbox.find((entry) => entry.operationId === operationId && entry.status === "pending");
        if (!operation) continue;
        const status = operation.action === "remove" ? "removed" : operation.action === "pause" ? "paused" : "active";
        const reply = await callRpc("kd_radar_pilot_set_subscription", {
          p_target_key: operation.targetId,
          p_scope: operation.scope,
          p_status: status,
          p_operation_id: operation.operationId,
        }, fence, token);
        if (reply.kind === "pilot-unavailable") return Object.freeze(await unavailable(current, commit, fence, token));
        if (reply.kind === "rejected") {
          const changed = rejectAccountRadarChange(current, operation.operationId, reply.reason);
          if (!changed.ok || !await persistState(commit, changed.state, fence, token)) {
            return Object.freeze({ status: "pending", state: current, reason: "pilot-persist-unconfirmed" });
          }
          current = changed.state;
          rejected = true;
          continue;
        }
        if (reply.kind !== "ok" || !validateRadarPilotSubscriptionAck(reply.payload).ok) {
          return Object.freeze({ status: "pending", state: current, reason: reply.reason || "pilot-subscription-response-invalid" });
        }
        const changed = acknowledgeAccountRadarPilotSubscription(current, operation.operationId, reply.payload);
        if (!changed.ok || !await persistState(commit, changed.state, fence, token)) {
          return Object.freeze({ status: "pending", state: current, reason: changed.reason || "pilot-persist-unconfirmed" });
        }
        current = changed.state;
      }

      for (const eventVersionId of runReceiptIds) {
        const operation = current.pilot?.receiptOutbox.find((entry) => (
          entry.eventVersionId === eventVersionId && entry.state === "pending"
        ));
        if (!operation) continue;
        const reply = await callRpc("kd_radar_pilot_set_receipt", {
          p_event_version_id: operation.eventVersionId,
          p_status: operation.status,
        }, fence, token, { expectVoid: true });
        if (reply.kind === "pilot-unavailable") return Object.freeze(await unavailable(current, commit, fence, token));
        if (reply.kind === "rejected") {
          const changed = rejectAccountRadarPilotReceipt(current, operation.eventVersionId, reply.reason);
          if (!changed.ok || !await persistState(commit, changed.state, fence, token)) {
            return Object.freeze({ status: "pending", state: current, reason: "pilot-persist-unconfirmed" });
          }
          current = changed.state;
          rejected = true;
          continue;
        }
        if (reply.kind !== "ok") return Object.freeze({ status: "pending", state: current, reason: reply.reason });
        const changed = acknowledgeAccountRadarPilotReceipt(current, operation.eventVersionId, now());
        if (!changed.ok || !await persistState(commit, changed.state, fence, token)) {
          return Object.freeze({ status: "pending", state: current, reason: changed.reason || "pilot-persist-unconfirmed" });
        }
        current = changed.state;
      }

      for (const operationId of runImportIds) {
        const operation = current.pilot?.importOutbox.find((entry) => (
          entry.operationId === operationId && entry.status === "pending"
        ));
        if (!operation) continue;
        const reply = await callRpc("kd_radar_pilot_import_event", {
          p_operation_id: operation.operationId,
          p_payload: operation.payload,
        }, fence, token);
        if (reply.kind === "pilot-unavailable") return Object.freeze(await unavailable(current, commit, fence, token));
        if (reply.kind === "rejected") {
          const changed = rejectAccountRadarPilotImport(current, operation.operationId, reply.reason);
          if (!changed.ok || !await persistState(commit, changed.state, fence, token)) {
            return Object.freeze({ status: "pending", state: current, reason: "pilot-persist-unconfirmed" });
          }
          current = changed.state;
          rejected = true;
          continue;
        }
        if (reply.kind !== "ok" || !validateRadarPilotImportResult(reply.payload).ok) {
          return Object.freeze({ status: "pending", state: current, reason: reply.reason || "pilot-import-response-invalid" });
        }
        const changed = acknowledgeAccountRadarPilotImport(current, operation.operationId, reply.payload);
        if (!changed.ok || !await persistState(commit, changed.state, fence, token)) {
          return Object.freeze({ status: "pending", state: current, reason: changed.reason || "pilot-persist-unconfirmed" });
        }
        current = changed.state;
      }
      return Object.freeze({ status: rejected ? "rejected" : "ready", state: current });
    } catch (error) {
      if (error?.code === "RADAR_PILOT_CONTEXT_CHANGED") {
        return Object.freeze({ status: "context-changed", state });
      }
      return Object.freeze({ status: "pending", state: current, reason: "pilot-unknown" });
    }
  }

  let syncActive = false;
  async function sync(options = {}) {
    if (syncActive) return Object.freeze({ status: "busy", state: options?.state });
    syncActive = true;
    try { return await runSync(options); }
    finally { syncActive = false; }
  }

  return Object.freeze({ sync });
}

export const radarPilotService = createRadarPilotService();
