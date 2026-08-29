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
  ENTDECKEN_FACTS_MAX_SEARCH_USES,
  createEntdeckenFactsBatchPlan,
  entdeckenFactsDiagnostics,
  mergeEntdeckenFactsSnapshot,
  validateEntdeckenFactsSnapshot,
} from "../src/lib/entdeckenFacts.js";
import { ENTDECKEN_MARKET_POOL_50 } from "../src/data/entdeckenMarketPool50.js";
import {
  ENTDECKEN_FACTS_HEADER,
  ENTDECKEN_FACTS_HEADER_VALUE,
  ENTDECKEN_FACTS_REQUEST_VERSION,
} from "../supabase/functions/entdecken-daily-task/factsRequest.js";
import {
  fetchMitZeitgrenze,
  liesBudgetVerbindung,
  meldeTestkontoAn,
} from "./ai_budget_guard.mjs";

export const ENTDECKEN_FACTS_ONCE_ENV = "KD_ENTDECKEN_FACTS_ONCE_GUARD";
export const ENTDECKEN_FACTS_ONCE_VALUE = "keychain-budget-guard-v1";
export const ENTDECKEN_FACTS_SNAPSHOT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/entdeckenFactsSnapshot.json",
);

function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
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

function validateSafeServerBatch(value, batch) {
  if (!exactKeys(value, ["ok", "status", "schemaVersion", "items", "quality", "receipt"])
      || value.ok !== true || value.status !== "facts"
      || value.schemaVersion !== ENTDECKEN_FACTS_CONTRACT_VERSION
      || !Array.isArray(value.items)
      || !exactKeys(value.quality, ["returned", "accepted", "dropped", "missing", "warnings"])
      || !exactKeys(value.receipt, [
        "providerRequests", "searchRequests", "reservationUsdCent", "costUsdCent", "serverLogId",
      ]) || value.receipt.providerRequests !== 1
      || value.receipt.searchRequests !== ENTDECKEN_FACTS_MAX_SEARCH_USES
      || !Number.isFinite(value.receipt.costUsdCent) || value.receipt.costUsdCent <= 0
      || value.receipt.costUsdCent > 5
      || !Number.isInteger(value.receipt.serverLogId) || value.receipt.serverLogId <= 0) return null;
  const inputs = new Map(batch.map((item) => [item.poolId, item]));
  const seen = new Set();
  for (const item of value.items) {
    if (!exactKeys(item, [
      "poolId", "preResolutionKey", "status", "strongId", "facts",
      "evidenceUrls", "checkedAt",
    ]) || seen.has(item.poolId) || inputs.get(item.poolId)?.preResolutionKey !== item.preResolutionKey) return null;
    seen.add(item.poolId);
  }
  return value;
}

export async function runEntdeckenFactsBatchPlan({
  pool = ENTDECKEN_MARKET_POOL_50,
  snapshot,
  now = new Date().toISOString(),
  requestBatch,
  persistSnapshot = async () => {},
} = {}) {
  const plan = createEntdeckenFactsBatchPlan(pool, snapshot, { now });
  if (!plan || typeof requestBatch !== "function" || typeof persistSnapshot !== "function") {
    throw new Error("FACTS_PLAN_INVALID");
  }
  let current = snapshot;
  let providerRequests = 0;
  let searchRequests = 0;
  let accepted = 0;
  for (const batch of plan.batches) {
    if (providerRequests >= ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS) {
      throw new Error("FACTS_REQUEST_LIMIT");
    }
    providerRequests += 1;
    const response = validateSafeServerBatch(await requestBatch(batch), batch);
    if (!response) throw new Error("FACTS_BATCH_RESPONSE_INVALID");
    searchRequests += response.receipt.searchRequests;
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
  const initial = readEntdeckenFactsSnapshot();
  const endpoint = `${connection.urlBasis}/functions/v1/entdecken-daily-task`;
  const result = await runEntdeckenFactsBatchPlan({
    snapshot: initial,
    requestBatch: async (items) => {
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
        body: JSON.stringify({ schemaVersion: ENTDECKEN_FACTS_REQUEST_VERSION, items }),
      }, { fetchImpl, timeoutMs: 135_000 });
      const body = await responseJson(response);
      if (!response.ok || response.status !== 200) throw new Error("FACTS_REMOTE_FAILED");
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
