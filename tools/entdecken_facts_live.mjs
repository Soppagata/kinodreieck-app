#!/usr/bin/env node
/* Einmaliger, budgetgeschuetzter Faktenlauf. Autonome Agenten duerfen dieses
   Skript nie direkt starten; ausschliesslich npm run test:ai:live mit dem
   fest verdrahteten Sonderflag darf den Guard setzen. */

import {
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ENTDECKEN_FACTS_CONTRACT_VERSION,
  ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS,
  ENTDECKEN_FACTS_MAX_SEARCH_USES_TOTAL,
  ENTDECKEN_FACTS_PILOT_RESOLVED_MIN,
  createEntdeckenFactsBatchPlan,
  entdeckenFactsDiagnostics,
  markEntdeckenFactsPilot,
  mergeEntdeckenFactsSnapshot,
  normalizeStrongExternalId,
  validateEntdeckenFactsSnapshot,
} from "../src/lib/entdeckenFacts.js";
import { ENTDECKEN_MARKET_POOL_50 } from "../src/data/entdeckenMarketPool50.js";
import {
  ENTDECKEN_FACTS_HEADER,
  ENTDECKEN_FACTS_HEADER_VALUE,
  ENTDECKEN_FACTS_REQUEST_VERSION,
  validateEntdeckenFactsErrorResponse,
} from "../supabase/functions/entdecken-daily-task/factsRequest.js";
import {
  LiveLaufWache,
  fetchMitZeitgrenze,
  holeBudgetStand,
  liesBudgetVerbindung,
  meldeTestkontoAn,
} from "./ai_budget_guard.mjs";

export const ENTDECKEN_FACTS_ONCE_ENV = "KD_ENTDECKEN_FACTS_ONCE_GUARD";
export const ENTDECKEN_FACTS_ONCE_VALUE = "keychain-budget-guard-v1";
export const ENTDECKEN_FACTS_RESUME_LIMIT_USD_CENT = 1483.5933;
export const ENTDECKEN_FACTS_SNAPSHOT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/entdeckenFactsSnapshot.json",
);

function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

export function formatEntdeckenFactsRemoteFailure(functionHttpStatus, body) {
  const safeFunctionHttpStatus = Number.isSafeInteger(functionHttpStatus)
    && functionHttpStatus >= 400 && functionHttpStatus <= 599 ? functionHttpStatus : null;
  const failure = validateEntdeckenFactsErrorResponse(body)?.failure;
  return "FACTS_REMOTE_FAILED"
    + ` function_http=${safeFunctionHttpStatus ?? "unknown"}`
    + ` code=${failure?.code ?? "facts-function-error"}`
    + ` provider_http=${failure?.providerHttpStatus ?? "unknown"}`
    + ` provider_code=${failure?.providerErrorCode ?? "unknown"}`;
}

export function readEntdeckenFactsSnapshot(path = ENTDECKEN_FACTS_SNAPSHOT_PATH) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const checked = validateEntdeckenFactsSnapshot(parsed, {
    poolId: ENTDECKEN_MARKET_POOL_50.feedId,
    poolVersion: ENTDECKEN_MARKET_POOL_50.poolVersion,
  });
  if (!checked) throw new Error("FACTS_SNAPSHOT_INVALID");
  return checked;
}

export function writeEntdeckenFactsSnapshotAtomic(
  snapshot,
  path = ENTDECKEN_FACTS_SNAPSHOT_PATH,
) {
  const checked = validateEntdeckenFactsSnapshot(snapshot, {
    poolId: ENTDECKEN_MARKET_POOL_50.feedId,
    poolVersion: ENTDECKEN_MARKET_POOL_50.poolVersion,
  });
  if (!checked) throw new Error("FACTS_SNAPSHOT_INVALID");
  const temporary = `${path}.next-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(checked, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644,
    });
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* bestmoegliche lokale Aufraeumung */ }
    throw error;
  }
}

function validateSafeServerBatch(value, batch, maxSearchUses) {
  if (!exactKeys(value, ["ok", "status", "schemaVersion", "items", "quality", "receipt"])
      || value.ok !== true || value.status !== "facts"
      || value.schemaVersion !== ENTDECKEN_FACTS_CONTRACT_VERSION
      || !Array.isArray(value.items)
      || !exactKeys(value.quality, ["returned", "accepted", "dropped", "missing", "warnings"])
      || !exactKeys(value.receipt, [
        "model", "providerRequests", "searchRequests", "reservationUsdCent", "costUsdCent", "serverLogId",
      ]) || value.receipt.providerRequests !== 1
      || !/^claude-haiku-4-5(?:-[0-9]{8})?$/.test(value.receipt.model)
      || !Number.isInteger(value.receipt.searchRequests)
      || value.receipt.searchRequests < 0
      || value.receipt.searchRequests > maxSearchUses
      || !Number.isFinite(value.receipt.reservationUsdCent)
      || value.receipt.reservationUsdCent <= 0
      || value.receipt.reservationUsdCent > 500
      || !Number.isFinite(value.receipt.costUsdCent) || value.receipt.costUsdCent <= 0
      || value.receipt.costUsdCent > value.receipt.reservationUsdCent
      || !Number.isInteger(value.receipt.serverLogId) || value.receipt.serverLogId <= 0) return null;
  const inputs = new Map(batch.map((item) => [item.poolId, item]));
  const seen = new Set();
  for (const item of value.items) {
    if (!exactKeys(item, [
      "poolId", "preResolutionKey", "status", "strongId", "facts",
      "evidenceUrls", "checkedAt", "validation", "providerModel",
    ]) || seen.has(item.poolId) || inputs.get(item.poolId)?.preResolutionKey !== item.preResolutionKey
      || item.providerModel !== value.receipt.model) return null;
    seen.add(item.poolId);
  }
  return value;
}

function pilotReady(item) {
  const facts = item?.facts;
  return item?.status === "resolved"
    && normalizeStrongExternalId(item.strongId) === item.strongId
    && item.providerModel
    && item.validation?.status === "machine_validated"
    && item.validation.identity === "exact"
    && item.validation.taxonomy === "normalized"
    && item.validation.evidence === "direct"
    && Array.isArray(item.evidenceUrls) && item.evidenceUrls.length > 0
    && facts && (
      facts.genres?.length > 0 || facts.tags?.length > 0
      || !!facts.franchise?.name || facts.persons?.length > 0
    );
}

export function createEntdeckenFactsResumeGuard(standLeser) {
  return new LiveLaufWache({
    maxAnbieterRequests: ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS,
    laufLimitUsdCent: ENTDECKEN_FACTS_RESUME_LIMIT_USD_CENT,
    standLeser,
  });
}

export async function runEntdeckenFactsBatchPlan({
  pool = ENTDECKEN_MARKET_POOL_50,
  snapshot,
  now = new Date().toISOString(),
  requestBatch,
  beforeRequest = async () => null,
  afterRequest = async () => {},
  persistSnapshot = async () => {},
} = {}) {
  const plan = createEntdeckenFactsBatchPlan(pool, snapshot, { now });
  if (!plan || typeof requestBatch !== "function" || typeof persistSnapshot !== "function"
      || typeof beforeRequest !== "function" || typeof afterRequest !== "function") {
    throw new Error("FACTS_PLAN_INVALID");
  }
  if (snapshot.pilot?.status === "failed") throw new Error("FACTS_PILOT_PREVIOUSLY_FAILED");
  if (snapshot.pilot === null && plan.batches[0]?.length !== 9) {
    throw new Error("FACTS_PILOT_BATCH_INVALID");
  }
  let current = snapshot;
  let providerRequests = 0;
  let searchRequests = 0;
  let accepted = 0;
  for (const [batchIndex, batch] of plan.batches.entries()) {
    if (providerRequests >= ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS) {
      throw new Error("FACTS_REQUEST_LIMIT");
    }
    providerRequests += 1;
    const maxSearchUses = plan.maxSearchUsesByBatch[batchIndex];
    if (!Number.isInteger(maxSearchUses) || maxSearchUses < 1
        || maxSearchUses > batch.length) throw new Error("FACTS_SEARCH_PLAN_INVALID");
    const requestMarker = await beforeRequest({ batch, requestNumber: providerRequests });
    let rawResponse;
    try {
      rawResponse = await requestBatch(batch, { maxSearchUses });
    } catch (error) {
      await afterRequest(requestMarker, null);
      throw error;
    }
    const response = validateSafeServerBatch(rawResponse, batch, maxSearchUses);
    if (!response) {
      await afterRequest(requestMarker, null);
      throw new Error("FACTS_BATCH_RESPONSE_INVALID");
    }
    await afterRequest(requestMarker, response.receipt.costUsdCent);
    searchRequests += response.receipt.searchRequests;
    if (searchRequests > ENTDECKEN_FACTS_MAX_SEARCH_USES_TOTAL) {
      throw new Error("FACTS_SEARCH_LIMIT");
    }
    const inputById = new Map(batch.map((item) => [item.poolId, item]));
    for (const result of response.items) {
      const merged = mergeEntdeckenFactsSnapshot(current, inputById.get(result.poolId), result);
      const checked = merged && validateEntdeckenFactsSnapshot(merged, {
        poolId: pool.feedId,
        poolVersion: pool.poolVersion,
      });
      if (!checked) throw new Error("FACTS_ITEM_INVALID");
      current = checked;
      await persistSnapshot(current, result);
      accepted += 1;
    }
    if (batchIndex === 0 && current.pilot === null) {
      const resolvedReady = response.items.filter(pilotReady).length;
      const pilotStatus = resolvedReady >= ENTDECKEN_FACTS_PILOT_RESOLVED_MIN
        ? "passed" : "failed";
      const marked = markEntdeckenFactsPilot(current, {
        status: pilotStatus,
        resolvedReady,
        evaluatedAt: now,
      });
      if (!marked) throw new Error("FACTS_PILOT_STATE_INVALID");
      current = marked;
      await persistSnapshot(current, Object.freeze({ kind: "pilot", status: pilotStatus }));
      if (pilotStatus !== "passed") throw new Error("FACTS_PILOT_THRESHOLD");
    }
  }
  return Object.freeze({
    snapshot: current,
    providerRequests,
    searchRequests,
    accepted,
    diagnostics: entdeckenFactsDiagnostics(pool, current, { now }),
  });
}

async function responseJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; }
  catch { return null; }
}

export async function runEntdeckenFactsLive({
  env = process.env,
  fetchImpl = fetch,
  output = console.log,
} = {}) {
  if (env[ENTDECKEN_FACTS_ONCE_ENV] !== ENTDECKEN_FACTS_ONCE_VALUE) {
    throw new Error("FACTS_LIVE_GUARD_MISSING");
  }
  const connection = liesBudgetVerbindung(env);
  const token = await meldeTestkontoAn(connection, fetchImpl);
  const laufWache = createEntdeckenFactsResumeGuard(
    () => holeBudgetStand({ verbindung: connection, token, fetchImpl }),
  );
  await laufWache.initialisiere();
  const initial = readEntdeckenFactsSnapshot();
  const endpoint = `${connection.urlBasis}/functions/v1/entdecken-daily-task`;
  const result = await runEntdeckenFactsBatchPlan({
    snapshot: initial,
    beforeRequest: ({ requestNumber }) => laufWache.vorAnbieterRequest(
      `Entdecken-Fakten Batch ${requestNumber}`,
    ),
    afterRequest: (marker, costUsdCent) => laufWache.nachAnbieterRequest(marker, costUsdCent),
    requestBatch: async (items, { maxSearchUses }) => {
      const response = await fetchMitZeitgrenze(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Origin: connection.origin,
          apikey: connection.anon,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-KD-Entdecken-Refresh": "owner-v1",
          [ENTDECKEN_FACTS_HEADER]: ENTDECKEN_FACTS_HEADER_VALUE,
        },
        body: JSON.stringify({
          schemaVersion: ENTDECKEN_FACTS_REQUEST_VERSION,
          items,
          maxSearchUses,
        }),
      }, { fetchImpl, timeoutMs: 135_000 });
      const body = await responseJson(response);
      if (!response.ok || response.status !== 200) {
        throw new Error(formatEntdeckenFactsRemoteFailure(response.status, body));
      }
      return body;
    },
    persistSnapshot: async (snapshot) => writeEntdeckenFactsSnapshotAtomic(snapshot),
  });
  output(
    `ENTDECKEN-FACTS: providerRequests=${result.providerRequests}`
      + ` · searchRequests=${result.searchRequests}`
      + ` · accepted=${result.accepted}`
      + ` · ok=${result.diagnostics.ok}`
      + ` · ambiguous=${result.diagnostics.ambiguous}`
      + ` · unresolved=${result.diagnostics.unresolved}`
      + ` · unknownOrExpired=${result.diagnostics.unknownOrExpired}`
      + ` · rankingReady=${result.diagnostics.rankingReady}`,
  );
  return result;
}

const directlyStarted = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directlyStarted) {
  runEntdeckenFactsLive().catch((error) => {
    console.error(`ENTDECKEN-FACTS-STOPP: ${error?.message || "unbekannt"}`);
    process.exitCode = 1;
  });
}
