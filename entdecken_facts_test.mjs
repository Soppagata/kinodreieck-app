import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENTDECKEN_FACTS_BATCH_SIZE,
  ENTDECKEN_FACTS_CONTRACT_VERSION,
  ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS,
  ENTDECKEN_FACTS_MAX_SEARCH_USES,
  createEntdeckenFactsBatchPlan,
  createEntdeckenFactsInput,
  emptyEntdeckenFactsSnapshot,
  mergeEntdeckenFactsSnapshot,
  validateEntdeckenFactsBatchOutput,
  validateEntdeckenFactsSnapshot,
} from "./src/lib/entdeckenFacts.js";
import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";
import { createEntdeckenRecommendations } from "./src/lib/entdeckenUi.js";
import {
  ENTDECKEN_FACTS_MAX_TOKENS,
  ENTDECKEN_FACTS_SEARCH_FEE_USD_CENT,
  ENTDECKEN_FACTS_TASK_CAP_USD_CENT,
  buildAnthropicEntdeckenFactsBody,
  createAnthropicEntdeckenFactsAdapter,
  estimateEntdeckenFactsReservation,
  parseAnthropicEntdeckenFactsResponse,
} from "./supabase/functions/entdecken-daily-task/anthropicFactsAdapter.js";
import {
  ENTDECKEN_FACTS_REQUEST_VERSION,
  validateEntdeckenFactsRequest,
} from "./supabase/functions/entdecken-daily-task/factsRequest.js";
import {
  runEntdeckenFactsBatchPlan,
} from "./tools/entdecken_facts_live.mjs";
import {
  ENTDECKEN_FACTS_ONCE_ENV,
  ENTDECKEN_FACTS_ONCE_FLAG,
  MODI,
  OWNER_SERVER_BUDGET_FLAG,
  baueKindUmgebung,
} from "./tools/keychain_runner.mjs";

let checks = 0;
async function check(name, test) {
  try {
    await test();
    checks += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const NOW = "2026-08-29T14:00:00.000Z";
const setup = Object.freeze({
  providerAllowed: true,
  modelAlias: "klein",
  model: "claude-haiku-4-5",
  maxTokens: ENTDECKEN_FACTS_MAX_TOKENS,
  taskCapUsdCent: ENTDECKEN_FACTS_TASK_CAP_USD_CENT,
  globalRequestCapUsdCent: 500,
  searchFeeUsdCent: ENTDECKEN_FACTS_SEARCH_FEE_USD_CENT,
  timeoutMs: 135_000,
  inputPriceUsdCentPerMtok: 100,
  outputPriceUsdCentPerMtok: 500,
});
const inputs = ENTDECKEN_MARKET_POOL_50.items.map((item) => (
  createEntdeckenFactsInput(item, ENTDECKEN_MARKET_POOL_50.poolVersion)
));
const emptySnapshot = () => emptyEntdeckenFactsSnapshot({
  poolId: ENTDECKEN_MARKET_POOL_50.feedId,
  poolVersion: ENTDECKEN_MARKET_POOL_50.poolVersion,
});

function strongId(index) { return `imdb:tt${String(1_000_000 + index)}`; }
function evidenceUrl(input) { return `https://example.com/evidence/${input.poolId}`; }
function providerResolved(input, index, overrides = {}) {
  return {
    poolId: input.poolId,
    status: "resolved",
    identity: {
      strongId: strongId(index),
      confirmedTitle: input.title,
      releaseYear: input.releaseYear,
      mediaType: input.mediaType,
    },
    facts: {
      genres: ["action"],
      tags: ["ab_2020"],
      franchise: null,
      persons: [{ id: "wikidata:Q34012", name: "Belegte Person", roles: ["actor"] }],
    },
    evidenceUrls: [evidenceUrl(input)],
    ...overrides,
  };
}
function providerEnvelope(batch, outputItems) {
  const urls = [...new Set(outputItems.flatMap((item) => item.evidenceUrls || []))];
  return {
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 220, output_tokens: 410, server_tool_use: { web_search_requests: 1 } },
    content: [
      { type: "server_tool_use", id: "tool-1", name: "web_search", input: { query: "fixture" } },
      { type: "web_search_tool_result", tool_use_id: "tool-1", content: urls.map((url) => ({
        type: "web_search_result", url, title: "Beleg",
      })) },
      {
        type: "text",
        text: JSON.stringify({ schemaVersion: ENTDECKEN_FACTS_CONTRACT_VERSION, items: outputItems }),
        citations: urls.map((url) => ({ type: "web_search_result_location", url, title: "Beleg" })),
      },
    ],
  };
}
function normalizedResult(input, index, status = "resolved") {
  if (status !== "resolved") return Object.freeze({
    poolId: input.poolId,
    preResolutionKey: input.preResolutionKey,
    status,
    strongId: null,
    facts: null,
    evidenceUrls: status === "ambiguous" ? [evidenceUrl(input)] : [],
    checkedAt: NOW,
  });
  return Object.freeze({
    poolId: input.poolId,
    preResolutionKey: input.preResolutionKey,
    status: "resolved",
    strongId: strongId(index),
    facts: Object.freeze({
      genres: Object.freeze(["action"]),
      tags: Object.freeze(["ab_2020"]),
      franchise: null,
      persons: Object.freeze([]),
    }),
    evidenceUrls: Object.freeze([evidenceUrl(input)]),
    checkedAt: NOW,
  });
}
function serverBatch(batch, results) {
  return {
    ok: true,
    status: "facts",
    schemaVersion: ENTDECKEN_FACTS_CONTRACT_VERSION,
    items: results,
    quality: {
      returned: results.length,
      accepted: results.length,
      dropped: 0,
      missing: batch.length - results.length,
      warnings: [],
    },
    receipt: {
      providerRequests: 1,
      searchRequests: 1,
      reservationUsdCent: 4.5,
      costUsdCent: 1.25,
      serverLogId: 41,
    },
  };
}

await check("50 Titel ergeben sechs serielle Batches 9/9/9/9/9/5 mit je einer Suche", () => {
  const plan = createEntdeckenFactsBatchPlan(ENTDECKEN_MARKET_POOL_50, emptySnapshot(), { now: NOW });
  assert.deepEqual(plan.batches.map((batch) => batch.length), [9, 9, 9, 9, 9, 5]);
  assert.equal(plan.providerRequests, ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS);
  assert.equal(plan.maxSearchUses, 6);
  assert.equal(ENTDECKEN_FACTS_BATCH_SIZE, 9);
  assert.equal(ENTDECKEN_FACTS_MAX_SEARCH_USES, 1);
  assert.ok(plan.batches.every((batch) => (
    estimateEntdeckenFactsReservation(buildAnthropicEntdeckenFactsBody(setup, batch), setup) <= 5
  )));
});

await check("Providerbody sendet nur Poolidentitaet und Chartquelle, nie Profil oder Score", () => {
  const body = buildAnthropicEntdeckenFactsBody(setup, inputs.slice(0, 9));
  assert.equal(body.tools[0].type, "web_search_20250305");
  assert.equal(body.tools[0].max_uses, 1);
  assert.equal(body.max_tokens, 2800);
  const userInput = body.messages[0].content;
  assert.match(userInput, /chartSource/);
  assert.doesNotMatch(userInput, /profile|geschmack|score|seen|gesehen|account/i);
});

await check("Vollstaendige echte Envelope-Form wird strikt normalisiert", () => {
  const batch = inputs.slice(0, 2);
  const response = providerEnvelope(batch, batch.map((item, index) => providerResolved(item, index)));
  const parsed = parseAnthropicEntdeckenFactsResponse(response, batch, NOW);
  assert.equal(parsed.accepted, 2);
  assert.equal(parsed.missing, 0);
  assert.equal(parsed.usage.searchRequests, 1);
  assert.deepEqual(parsed.items[0].facts.genres, ["action"]);
});

await check("Falsche Identitaet bleibt offen; Mehrdeutiges wird terminal negativ", () => {
  const batch = inputs.slice(0, 3);
  const output = [
    providerResolved(batch[0], 0),
    providerResolved(batch[1], 1, {
      identity: { ...providerResolved(batch[1], 1).identity, releaseYear: batch[1].releaseYear - 1 },
    }),
    { poolId: batch[2].poolId, status: "ambiguous", identity: null, facts: null,
      evidenceUrls: [evidenceUrl(batch[2])] },
  ];
  const parsed = parseAnthropicEntdeckenFactsResponse(providerEnvelope(batch, output), batch, NOW);
  assert.equal(parsed.accepted, 2);
  assert.equal(parsed.missing, 1);
  assert.ok(parsed.warnings.includes("identity-dropped"));
  assert.equal(parsed.items.find((item) => item.poolId === batch[2].poolId).status, "ambiguous");
});

await check("Unbekannte Taxonomiewerte werden verworfen, belegte Personen bleiben", () => {
  const input = inputs[0];
  const raw = providerResolved(input, 0);
  raw.facts.genres.push("western");
  raw.facts.tags.push("rasant");
  const parsed = validateEntdeckenFactsBatchOutput({
    schemaVersion: ENTDECKEN_FACTS_CONTRACT_VERSION,
    items: [raw],
  }, [input], { allowedEvidenceUrls: [evidenceUrl(input)], checkedAt: NOW });
  assert.deepEqual(parsed.items[0].facts.genres, ["action"]);
  assert.deepEqual(parsed.items[0].facts.tags, ["ab_2020"]);
  assert.equal(parsed.items[0].facts.persons[0].name, "Belegte Person");
  assert.ok(parsed.warnings.includes("unknown-genre-dropped"));
  assert.ok(parsed.warnings.includes("unknown-tag-dropped"));
});

await check("Adapter bindet einen Request an Serverkostenbeleg und macht keinen Retry", async () => {
  const batch = inputs.slice(0, 2);
  const operationId = "00000000-0000-4000-8000-000000000041";
  let fetches = 0;
  let settlement = null;
  const adapter = createAnthropicEntdeckenFactsAdapter({
    apiKey: "fixture-secret",
    loadSetup: async () => setup,
    reserveCost: async () => ({ ok: true, logId: 41 }),
    settleCost: async (value) => { settlement = value; },
    readSettledCost: async () => ({
      logId: 41,
      operationId,
      task: "entdecken-daily",
      status: "fertig",
      model: "claude-haiku-4-5",
      inputTokens: 220,
      outputTokens: 410,
      costUsdCent: settlement.costUsdCent,
    }),
    operationId: () => operationId,
    now: () => NOW,
    fetchImpl: async () => {
      fetches += 1;
      return new Response(JSON.stringify(providerEnvelope(
        batch, batch.map((item, index) => providerResolved(item, index)),
      )), { status: 200 });
    },
  });
  const result = await adapter.resolve(batch);
  assert.equal(fetches, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.receipt.searchRequests, 1);
  await assert.rejects(() => adapter.resolve(batch), /already-used/);
  assert.equal(fetches, 1);
});

await check("Teilfortschritt wird je Item gesichert und Wiederanlauf enthaelt nur 41 Fehlende", async () => {
  let persisted = emptySnapshot();
  let writes = 0;
  let requests = 0;
  await assert.rejects(() => runEntdeckenFactsBatchPlan({
    snapshot: persisted,
    now: NOW,
    requestBatch: async (batch) => {
      requests += 1;
      if (requests === 2) throw new Error("fixture-transport");
      return serverBatch(batch, batch.map((item, index) => normalizedResult(item, index)));
    },
    persistSnapshot: async (snapshot) => { persisted = snapshot; writes += 1; },
  }), /fixture-transport/);
  assert.equal(requests, 2);
  assert.equal(writes, 9);
  const resume = createEntdeckenFactsBatchPlan(ENTDECKEN_MARKET_POOL_50, persisted, { now: NOW });
  assert.equal(resume.pending.length, 41);
  assert.equal(resume.batches.length, 5);
  assert.ok(resume.pending.every((item) => !inputs.slice(0, 9).some((done) => done.poolId === item.poolId)));
});

await check("Vollstaendiger Mocklauf versucht alle 50 genau einmal in sechs Requests", async () => {
  let snapshot = emptySnapshot();
  let offset = 0;
  let writes = 0;
  const result = await runEntdeckenFactsBatchPlan({
    snapshot,
    now: NOW,
    requestBatch: async (batch) => {
      const rows = batch.map((item, index) => normalizedResult(item, offset + index));
      offset += batch.length;
      return serverBatch(batch, rows);
    },
    persistSnapshot: async (next) => { snapshot = next; writes += 1; },
  });
  assert.equal(result.providerRequests, 6);
  assert.equal(result.searchRequests, 6);
  assert.equal(result.accepted, 50);
  assert.equal(writes, 50);
  assert.equal(result.diagnostics.ok, 50);
  assert.equal(result.diagnostics.unknownOrExpired, 0);
});

await check("Mehrdeutig und ungelöst werden negativ gecacht und nicht erneut angefragt", () => {
  let snapshot = emptySnapshot();
  snapshot = mergeEntdeckenFactsSnapshot(snapshot, inputs[0], normalizedResult(inputs[0], 0, "ambiguous"));
  snapshot = mergeEntdeckenFactsSnapshot(snapshot, inputs[1], normalizedResult(inputs[1], 1, "unresolved"));
  assert.ok(validateEntdeckenFactsSnapshot(snapshot, {
    poolId: ENTDECKEN_MARKET_POOL_50.feedId,
    poolVersion: ENTDECKEN_MARKET_POOL_50.poolVersion,
  }));
  const plan = createEntdeckenFactsBatchPlan(ENTDECKEN_MARKET_POOL_50, snapshot, { now: NOW });
  assert.equal(plan.pending.length, 48);
  const expired = structuredClone(snapshot);
  const expiredKey = expired.preResolution[inputs[0].preResolutionKey];
  expired.entries[expiredKey].expiresAt = "2026-08-29T13:59:59.000Z";
  const expiredPlan = createEntdeckenFactsBatchPlan(ENTDECKEN_MARKET_POOL_50, expired, { now: NOW });
  assert.equal(expiredPlan.pending.length, 49);
});

await check("Fehlerhafte Batchantwort persistiert kein Item", async () => {
  let writes = 0;
  await assert.rejects(() => runEntdeckenFactsBatchPlan({
    snapshot: emptySnapshot(),
    now: NOW,
    requestBatch: async () => ({ ok: true, status: "falsche-form" }),
    persistSnapshot: async () => { writes += 1; },
  }), /FACTS_BATCH_RESPONSE_INVALID/);
  assert.equal(writes, 0);
});

await check("Ein belegtes ungesehenes Poolitem erreicht Für mich ohne Rankeränderung", () => {
  let snapshot = emptySnapshot();
  snapshot = mergeEntdeckenFactsSnapshot(snapshot, inputs[0], normalizedResult(inputs[0], 0));
  const result = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    streamingKnown: { region: "AT", titel: [] },
    master: [],
    profile: { signale: [{ art: "genre", wert: "action", richtung: "zieht_an", staerke: 4 }] },
    webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
    factsSnapshot: snapshot,
    selectionDay: "2026-08-29",
  });
  assert.equal(result.personal.length, 1);
  assert.equal(result.personal[0].title, inputs[0].title);
  assert.match(result.personal[0].reasons[0], /^Profil:/);
  assert.equal(result.diagnostics.candidates, 50);
  assert.equal(result.diagnostics.metadata, 1);
});

await check("AGENTS-konformer Wrapper erlaubt exakt einen neuen Fakten-Sonderpfad", () => {
  assert.equal(ENTDECKEN_FACTS_ONCE_FLAG, "--entdecken-facts-once");
  assert.deepEqual(MODI["ai-live"].entdeckenFactsOnceArgv.slice(-1), [
    new URL("./tools/entdecken_facts_live.mjs", import.meta.url).pathname,
  ]);
  const env = baueKindUmgebung({
    modus: "ai-live",
    ambientEnv: {
      PATH: process.env.PATH,
      KD_SB_URL: "https://fixture.supabase.co",
      KD_SB_ANON: "fixture-public-key-at-least-twenty",
      KD_OWNER_USER: "owner",
    },
    lokaleKonfig: {},
    keychainLeser: () => "fixture-owner-password",
    ownerApprovedServerBudget: true,
    entdeckenFactsOnce: true,
  });
  assert.equal(env[ENTDECKEN_FACTS_ONCE_ENV], "keychain-budget-guard-v1");
  assert.equal(env.KD_AI_OWNER_APPROVED_SERVER_BUDGET, "1");
  assert.equal(`${ENTDECKEN_FACTS_ONCE_FLAG} ${OWNER_SERVER_BUDGET_FLAG}`,
    "--entdecken-facts-once --owner-approved-server-budget");
});

await check("Requestvertrag akzeptiert nur die vollständige pre-resolution Identitaet", () => {
  const request = validateEntdeckenFactsRequest({
    schemaVersion: ENTDECKEN_FACTS_REQUEST_VERSION,
    items: inputs.slice(0, 9),
  });
  assert.equal(request.items.length, 9);
  assert.equal(validateEntdeckenFactsRequest({
    schemaVersion: ENTDECKEN_FACTS_REQUEST_VERSION,
    items: [{ ...inputs[0], title: "anderer Titel" }],
  }), null);
});

const source = readFileSync("./tools/entdecken_facts_live.mjs", "utf8");
assert.doesNotMatch(source, /setTimeout\([^)]*retry|while\s*\(|Promise\.all\s*\(.*requestBatch/s);
console.log(`\n${checks}/${checks} fokussierte E6-Faktenchecks grün.`);
