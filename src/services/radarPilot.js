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
  radarAutomationAttested,
  validateRadarPilotFeed,
  validateRadarPilotImportResult,
  validateRadarPilotSubscriptionAck,
} from "../lib/radarPilotContracts.js";
import { authDriver, authService } from "./auth.js";
import { K, captureStorageContext } from "./storage.js";

export const RADAR_PILOT_RPCS = Object.freeze([
  "kd_radar_pilot_set_subscription",
  "kd_radar_pilot_set_text_subscription",
  "kd_radar_pilot_set_title_group",
  "kd_radar_pilot_set_receipt",
  "kd_radar_pilot_import_event",
  "kd_radar_pilot_feed",
]);

const TERMINAL_SQLSTATES = new Set(["22023", "23505", "23514", "42501"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
function mergeConcurrentQueue(base, latest, next, key) {
  const baseById = new Map(base.map((entry) => [key(entry), entry]));
  const latestById = new Map(latest.map((entry) => [key(entry), entry]));
  const locallyChanged = new Set();
  for (const id of new Set([...baseById.keys(), ...latestById.keys()])) {
    if (JSON.stringify(baseById.get(id)) !== JSON.stringify(latestById.get(id))) locallyChanged.add(id);
  }
  const merged = next
    .filter((entry) => !(locallyChanged.has(key(entry)) && !latestById.has(key(entry))))
    .map((entry) => locallyChanged.has(key(entry)) ? latestById.get(key(entry)) : entry);
  const mergedIds = new Set(merged.map(key));
  for (const entry of latest) {
    if (locallyChanged.has(key(entry)) && !mergedIds.has(key(entry))) merged.push(entry);
  }
  return merged;
}
function preserveConcurrentPilotWork(base, latest, next) {
  if (latest === base) return next;
  const merged = {
    ...next,
    outbox: mergeConcurrentQueue(base.outbox, latest.outbox, next.outbox, (entry) => entry.operationId),
  };
  const pilot = next.pilot || latest.pilot;
  if (pilot) {
    merged.pilot = {
      ...pilot,
      receiptOutbox: mergeConcurrentQueue(
        base.pilot?.receiptOutbox || [], latest.pilot?.receiptOutbox || [], next.pilot?.receiptOutbox || [],
        (entry) => entry.eventVersionId,
      ),
      importOutbox: mergeConcurrentQueue(
        base.pilot?.importOutbox || [], latest.pilot?.importOutbox || [], next.pilot?.importOutbox || [],
        (entry) => entry.operationId,
      ),
    };
  }
  return validateLocalRadarState(merged).ok ? freezeDeep(merged) : null;
}
function accumulateConcurrentPilotWork(base, current, incoming) {
  const withCurrent = preserveConcurrentPilotWork(base, current, incoming);
  return withCurrent && preserveConcurrentPilotWork(base, incoming, withCurrent);
}
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

  async function persistState(commit, next, fence, token, run) {
    if (!fenceCurrent(fence, token) || typeof fence.storage?.set !== "function") throw contextError();
    let observedVersion = run.latestVersion;
    let persisted = preserveConcurrentPilotWork(run.baseState, run.latestState, next);
    if (!persisted) return null;
    async function storeBound(state) {
      try {
        await fence.storage.set(K.radar, JSON.stringify(state));
      } catch (error) {
        if (error?.code === "STORAGE_CONTEXT_CHANGED" || !fenceCurrent(fence, token)) throw contextError();
        return false;
      }
      if (!fenceCurrent(fence, token)) throw contextError();
      return true;
    }
    if (!await storeBound(persisted)) return null;
    if (observedVersion !== run.latestVersion) {
      observedVersion = run.latestVersion;
      persisted = preserveConcurrentPilotWork(run.baseState, run.latestState, next);
      if (!persisted || !await storeBound(persisted) || observedVersion !== run.latestVersion) return null;
    }
    if (typeof commit === "function") {
      let confirmed;
      try { confirmed = commit(persisted); }
      catch { return null; }
      if (confirmed && typeof confirmed.then === "function") return null;
      if (confirmed === false) return null;
      if (!fenceCurrent(fence, token)) throw contextError();
    }
    return persisted;
  }

  async function unavailable(current, commit, fence, token, run) {
    const marked = markAccountRadarPilotUnavailable(current);
    if (!marked.ok) return { status: "pilot-unavailable", state: current };
    const persisted = await persistState(commit, marked.state, fence, token, run);
    if (!persisted) {
      return { status: "pending", state: current, reason: "pilot-persist-unconfirmed" };
    }
    return { status: "pilot-unavailable", state: persisted };
  }

  async function runSync({ state, commit } = {}, run) {
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
    let automation = null;
    const importedEventVersionIds = new Set();
    let rejected = false;
    const runSubscriptionIds = state.outbox.filter((entry) => entry.status === "pending").map((entry) => entry.operationId);
    const runReceiptIds = (state.pilot?.receiptOutbox || [])
      .filter((entry) => entry.state === "pending").map((entry) => entry.eventVersionId);
    const runImportIds = (state.pilot?.importOutbox || [])
      .filter((entry) => entry.status === "pending").map((entry) => entry.operationId);

    try {
      const reconcileFeed = async (operationIds = []) => {
        const response = await callRpc("kd_radar_pilot_feed", { p_operation_ids: operationIds }, fence, token);
        if (response.kind === "pilot-unavailable") {
          return Object.freeze({ kind: "pilot-unavailable", state: current });
        }
        if (response.kind !== "ok" || !validateRadarPilotFeed(response.payload).ok) {
          return Object.freeze({
            kind: "pending",
            state: current,
            reason: response.reason || "pilot-feed-invalid",
          });
        }
        automation = radarAutomationAttested(response.payload.automation, { allowInactive: true })
          ? Object.freeze({ ...response.payload.automation }) : null;
        const reconciled = reconcileAccountRadarPilotFeed(current, response.payload);
        if (!reconciled.ok) return Object.freeze({ kind: "pending", state: current, reason: reconciled.reason });
        if (!reconciled.changed) return Object.freeze({ kind: "ok", state: current });
        const persisted = await persistState(commit, reconciled.state, fence, token, run);
        if (!persisted) return Object.freeze({ kind: "pending", state: current, reason: "pilot-persist-unconfirmed" });
        current = persisted;
        return Object.freeze({ kind: "ok", state: current });
      };

      const initialFeed = await reconcileFeed(runSubscriptionIds);
      if (initialFeed.kind === "pilot-unavailable") return Object.freeze(await unavailable(current, commit, fence, token, run));
      if (initialFeed.kind === "pending") return Object.freeze({ status: "pending", state: initialFeed.state, reason: initialFeed.reason });
      current = initialFeed.state;

      let subscriptionWriteConfirmed = false;
      for (const operationId of runSubscriptionIds) {
        const operation = current.outbox.find((entry) => entry.operationId === operationId && entry.status === "pending");
        if (!operation) continue;
        const status = operation.action === "remove" ? "removed" : operation.action === "pause" ? "paused" : "active";
        const textTarget = operation.targetType === "text";
        const titleGroup = operation.targetType === "franchise" && operation.titleGroup;
        const reply = await callRpc(textTarget
          ? "kd_radar_pilot_set_text_subscription"
          : titleGroup ? "kd_radar_pilot_set_title_group" : "kd_radar_pilot_set_subscription",
        textTarget ? {
          p_target_text: operation.title,
          p_status: status,
          p_operation_id: operation.operationId,
        } : {
          p_target_key: operation.targetId,
          p_scope: operation.scope,
          p_status: status,
          p_operation_id: operation.operationId,
          ...(titleGroup ? { p_title_group: titleGroup } : {}),
          ...(operation.targetType === "person" ? {
            p_person_external_id: operation.personExternalId,
            p_person_role: operation.personRole,
          } : {}),
        }, fence, token);
        if (reply.kind === "pilot-unavailable") return Object.freeze(await unavailable(current, commit, fence, token, run));
        if (reply.kind === "rejected") {
          const changed = rejectAccountRadarChange(current, operation.operationId, reply.reason);
          const persisted = changed.ok ? await persistState(commit, changed.state, fence, token, run) : null;
          if (!persisted) {
            return Object.freeze({ status: "pending", state: current, reason: "pilot-persist-unconfirmed" });
          }
          current = persisted;
          rejected = true;
          continue;
        }
        if (reply.kind !== "ok" || !validateRadarPilotSubscriptionAck(reply.payload).ok) {
          return Object.freeze({ status: "pending", state: current, reason: reply.reason || "pilot-subscription-response-invalid" });
        }
        subscriptionWriteConfirmed = true;
        const changed = acknowledgeAccountRadarPilotSubscription(current, operation.operationId, reply.payload);
        const persisted = changed.ok ? await persistState(commit, changed.state, fence, token, run) : null;
        if (!persisted) {
          return Object.freeze({ status: "pending", state: current, reason: changed.reason || "pilot-persist-unconfirmed" });
        }
        current = persisted;
      }

      if (subscriptionWriteConfirmed) {
        const afterSubscriptionFeed = await reconcileFeed([]);
        if (afterSubscriptionFeed.kind === "pilot-unavailable") {
          return Object.freeze(await unavailable(current, commit, fence, token, run));
        }
        if (afterSubscriptionFeed.kind === "pending") {
          return Object.freeze({
            status: "pending",
            state: afterSubscriptionFeed.state,
            reason: afterSubscriptionFeed.reason || "pilot-subscription-feed-pending",
          });
        }
        current = afterSubscriptionFeed.state;
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
        if (reply.kind === "pilot-unavailable") return Object.freeze(await unavailable(current, commit, fence, token, run));
        if (reply.kind === "rejected") {
          const changed = rejectAccountRadarPilotReceipt(current, operation.eventVersionId, reply.reason);
          const persisted = changed.ok ? await persistState(commit, changed.state, fence, token, run) : null;
          if (!persisted) {
            return Object.freeze({ status: "pending", state: current, reason: "pilot-persist-unconfirmed" });
          }
          current = persisted;
          rejected = true;
          continue;
        }
        if (reply.kind !== "ok") return Object.freeze({ status: "pending", state: current, reason: reply.reason });
        const changed = acknowledgeAccountRadarPilotReceipt(current, operation.eventVersionId, now());
        const persisted = changed.ok ? await persistState(commit, changed.state, fence, token, run) : null;
        if (!persisted) {
          return Object.freeze({ status: "pending", state: current, reason: changed.reason || "pilot-persist-unconfirmed" });
        }
        current = persisted;
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
        if (reply.kind === "pilot-unavailable") return Object.freeze(await unavailable(current, commit, fence, token, run));
        if (reply.kind === "rejected") {
          const changed = rejectAccountRadarPilotImport(current, operation.operationId, reply.reason);
          const persisted = changed.ok ? await persistState(commit, changed.state, fence, token, run) : null;
          if (!persisted) {
            return Object.freeze({ status: "pending", state: current, reason: "pilot-persist-unconfirmed" });
          }
          current = persisted;
          rejected = true;
          continue;
        }
        if (reply.kind !== "ok" || !validateRadarPilotImportResult(reply.payload).ok) {
          return Object.freeze({ status: "pending", state: current, reason: reply.reason || "pilot-import-response-invalid" });
        }
        const changed = acknowledgeAccountRadarPilotImport(current, operation.operationId, reply.payload);
        const persisted = changed.ok ? await persistState(commit, changed.state, fence, token, run) : null;
        if (!persisted) {
          return Object.freeze({ status: "pending", state: current, reason: changed.reason || "pilot-persist-unconfirmed" });
        }
        current = persisted;
        importedEventVersionIds.add(reply.payload.eventVersionId);
      }

      if (importedEventVersionIds.size > 0) {
        const followupIds = current.outbox
          .filter((entry) => entry.status === "pending")
          .map((entry) => entry.operationId);
        const afterImportFeed = await reconcileFeed(followupIds);
        if (afterImportFeed.kind === "pilot-unavailable") {
          return Object.freeze(await unavailable(current, commit, fence, token, run));
        }
        if (afterImportFeed.kind === "pending") {
          return Object.freeze({ status: "pending", state: afterImportFeed.state, reason: afterImportFeed.reason });
        }
        current = afterImportFeed.state;
        const visibleEventVersionIds = new Set((current.pilot?.events || []).map((entry) => entry.eventVersionId));
        const missing = [...importedEventVersionIds].filter((eventVersionId) => !visibleEventVersionIds.has(eventVersionId));
        if (missing.length > 0) {
          return Object.freeze({ status: "pending", state: current, reason: "pilot-import-event-not-visible" });
        }
      }

      return Object.freeze({
        status: rejected ? "rejected" : "ready",
        state: current,
        ...(automation ? { automation } : {}),
      });
    } catch (error) {
      if (error?.code === "RADAR_PILOT_CONTEXT_CHANGED") {
        return Object.freeze({ status: "context-changed", state });
      }
      return Object.freeze({ status: "pending", state: current, reason: "pilot-unknown" });
    }
  }

  let syncActive = false;
  let activeRun = null;
  async function sync(options = {}) {
    if (syncActive) {
      if (validateLocalRadarState(options?.state).ok
          && options.state.authority === activeRun?.baseState?.authority) {
        const accumulated = accumulateConcurrentPilotWork(
          activeRun.baseState, activeRun.latestState, options.state,
        );
        if (accumulated && JSON.stringify(accumulated) !== JSON.stringify(activeRun.latestState)) {
          activeRun.latestState = accumulated;
          activeRun.latestVersion += 1;
        }
      }
      return Object.freeze({ status: "busy", state: options?.state });
    }
    syncActive = true;
    activeRun = { baseState: options?.state, latestState: options?.state, latestVersion: 0 };
    try { return await runSync(options, activeRun); }
    finally { activeRun = null; syncActive = false; }
  }

  return Object.freeze({ sync });
}

export const radarPilotService = createRadarPilotService();
