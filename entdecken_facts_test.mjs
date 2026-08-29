import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENTDECKEN_FACTS_BATCH_SIZE,
  ENTDECKEN_FACTS_CONTRACT_VERSION,
  ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS,
  ENTDECKEN_FACTS_MAX_SEARCH_USES_PER_ITEM,
  ENTDECKEN_FACTS_MAX_SEARCH_USES_TOTAL,
  ENTDECKEN_FACTS_RESUME_BATCH_SIZES,
  ENTDECKEN_FACTS_RESUME_SEARCH_USES,
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
  ENTDECKEN_FACTS_PROVIDER_TASK,
  ENTDECKEN_FACTS_REQUEST_CAP_USD_CENT,
  ENTDECKEN_FACTS_SEARCH_FEE_USD_CENT,
  buildAnthropicEntdeckenFactsBody,
  createAnthropicEntdeckenFactsAdapter,
  EntdeckenFactsProviderError,
  estimateEntdeckenFactsReservation,
  parseAnthropicEntdeckenFactsResponse,
} from "./supabase/functions/entdecken-daily-task/anthropicFactsAdapter.js";
import {
  ENTDECKEN_FACTS_REQUEST_VERSION,
  createEntdeckenFactsErrorResponse,
  validateEntdeckenFactsErrorResponse,
  validateEntdeckenFactsRequest,
} from "./supabase/functions/entdecken-daily-task/factsRequest.js";
import {
  ENTDECKEN_FACTS_RESUME_LIMIT_USD_CENT,
  createEntdeckenFactsResumeGuard,
  formatEntdeckenFactsRemoteFailure,
  runEntdeckenFactsBatchPlan,
} from "./tools/entdecken_facts_live.mjs";
import {
  EXIT_KONFIG,
  ENTDECKEN_FACTS_ONCE_ENV,
  ENTDECKEN_FACTS_ONCE_FLAG,
  MODI,
  OWNER_SERVER_BUDGET_FLAG,
  baueKindUmgebung,
  main as keychainMain,
} from "./tools/keychain_runner.mjs";
import {
  ANBIETER_REQUEST_LIMIT_USD_CENT,
} from "./tools/ai_budget_guard.mjs";

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
  taskCapUsdCent: ENTDECKEN_FACTS_REQUEST_CAP_USD_CENT,
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
function providerEnvelope(batch, outputItems, searchRequests = batch.length) {
  const urls = [...new Set(outputItems.flatMap((item) => item.evidenceUrls || []))];
  const uses = Array.from({ length: searchRequests }, (_, index) => ({
    type: "server_tool_use", id: `tool-${index + 1}`, name: "web_search",
    input: { query: `fixture ${index + 1}` },
  }));
  const results = uses.map((use, index) => ({
    type: "web_search_tool_result",
    tool_use_id: use.id,
    content: urls.filter((_, urlIndex) => urlIndex % uses.length === index).map((url) => ({
      type: "web_search_result", url, title: "Beleg",
    })),
  }));
  return {
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 220, output_tokens: 410,
      server_tool_use: { web_search_requests: searchRequests } },
    content: [
      ...uses,
      ...results,
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
    validation: Object.freeze({
      status: "machine_validated",
      identity: "not_resolved",
      taxonomy: "not_applicable",
      evidence: status === "ambiguous" ? "direct" : "none",
    }),
    providerModel: "claude-haiku-4-5",
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
    validation: Object.freeze({
      status: "machine_validated",
      identity: "exact",
      taxonomy: "normalized",
      evidence: "direct",
    }),
    providerModel: "claude-haiku-4-5",
  });
}
function serverBatch(batch, results, { searchRequests = batch.length } = {}) {
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
      model: "claude-haiku-4-5",
      providerRequests: 1,
      searchRequests,
      reservationUsdCent: 20,
      costUsdCent: 12.25,
      serverLogId: 41,
    },
  };
}

await check("Restplan bearbeitet 50 Titel in fünf Batches mit höchstens 41 Websuchen", () => {
  const plan = createEntdeckenFactsBatchPlan(ENTDECKEN_MARKET_POOL_50, emptySnapshot(), { now: NOW });
  assert.deepEqual(plan.batches.map((batch) => batch.length), [9, 11, 10, 10, 10]);
  assert.deepEqual(plan.maxSearchUsesByBatch, [9, 8, 8, 8, 8]);
  assert.deepEqual(ENTDECKEN_FACTS_RESUME_BATCH_SIZES, [9, 11, 10, 10, 10]);
  assert.deepEqual(ENTDECKEN_FACTS_RESUME_SEARCH_USES, [9, 8, 8, 8, 8]);
  assert.equal(plan.providerRequests, ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS);
  assert.equal(plan.maxSearchUses, 41);
  assert.equal(ENTDECKEN_FACTS_BATCH_SIZE, 9);
  assert.equal(ENTDECKEN_FACTS_MAX_SEARCH_USES_PER_ITEM, 1);
  assert.equal(ENTDECKEN_FACTS_MAX_SEARCH_USES_TOTAL, 41);
  assert.equal(ENTDECKEN_FACTS_RESUME_LIMIT_USD_CENT, 1483.5933);
  const reservations = plan.batches.map((batch, index) => (
    estimateEntdeckenFactsReservation(buildAnthropicEntdeckenFactsBody(
      setup,
      batch,
      plan.maxSearchUsesByBatch[index],
    ), setup)
  ));
  assert.ok(reservations.every((cost) => cost > 5 && cost <= ANBIETER_REQUEST_LIMIT_USD_CENT));
  assert.ok(reservations.reduce((sum, cost) => sum + cost, 0)
    <= ENTDECKEN_FACTS_RESUME_LIMIT_USD_CENT);
  assert.equal(plan.maxSearchUses * ENTDECKEN_FACTS_SEARCH_FEE_USD_CENT, 41);
});

await check("Providerbody sendet nur Poolidentitaet und Chartquelle, nie Profil oder Score", () => {
  const body = buildAnthropicEntdeckenFactsBody(setup, inputs.slice(0, 9), 9);
  assert.equal(body.tools[0].type, "web_search_20250305");
  assert.equal(body.tools[0].max_uses, 9);
  assert.deepEqual(body.tools[0].allowed_callers, ["direct"]);
  assert.equal(body.max_tokens, 2800);
  const userInput = body.messages[0].content;
  assert.equal(JSON.parse(userInput).maxSearchUses, 9);
  assert.match(userInput, /chartSource/);
  assert.doesNotMatch(userInput, /profile|geschmack|score|seen|gesehen|account/i);
});

await check("Vollstaendige echte Envelope-Form wird strikt normalisiert", () => {
  const batch = inputs.slice(0, 2);
  const response = providerEnvelope(batch, batch.map((item, index) => providerResolved(item, index)));
  const parsed = parseAnthropicEntdeckenFactsResponse(response, batch, NOW, 2);
  assert.equal(parsed.accepted, 2);
  assert.equal(parsed.missing, 0);
  assert.equal(parsed.usage.searchRequests, 2);
  assert.deepEqual(parsed.items[0].facts.genres, ["action"]);
  assert.throws(() => parseAnthropicEntdeckenFactsResponse(
    providerEnvelope(batch, batch.map((item, index) => providerResolved(item, index)), 3),
    batch,
    NOW,
    2,
  ), /provider-envelope-invalid/);
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
  const parsed = parseAnthropicEntdeckenFactsResponse(
    providerEnvelope(batch, output), batch, NOW, 3,
  );
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
      task: ENTDECKEN_FACTS_PROVIDER_TASK,
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
  const result = await adapter.resolve(batch, 2);
  assert.equal(fetches, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.receipt.searchRequests, 2);
  await assert.rejects(() => adapter.resolve(batch, 2), /already-used/);
  assert.equal(fetches, 1);
});

await check("Provider-HTTP-Fehler zeigt nur Status und erlaubte Codes", async () => {
  const batch = inputs.slice(0, 9);
  const privateText = `${batch[0].title} fixture-secret kompletter Prompt`;
  let settlement = null;
  const adapter = createAnthropicEntdeckenFactsAdapter({
    apiKey: "fixture-secret",
    loadSetup: async () => setup,
    reserveCost: async () => ({ ok: true, logId: 42 }),
    settleCost: async (value) => { settlement = value; },
    readSettledCost: async () => null,
    fetchImpl: async () => new Response(JSON.stringify({
      type: "error",
      error: { type: "invalid_request_error", message: privateText },
      request_id: "req_private_fixture",
      injected: { token: "fixture-secret", titles: batch.map((item) => item.title) },
    }), {
      status: 400,
      headers: { "x-private-fixture": "fixture-secret" },
    }),
  });
  let caught = null;
  try { await adapter.resolve(batch, 9); } catch (error) { caught = error; }
  assert.ok(caught instanceof EntdeckenFactsProviderError);
  assert.equal(caught.code, "http-error");
  assert.deepEqual(caught.providerFailure, {
    stage: "http", httpStatus: 400, providerErrorType: "invalid_request_error",
  });
  assert.equal(settlement.errorClass, "http-error");

  const functionBody = createEntdeckenFactsErrorResponse(caught);
  assert.deepEqual(functionBody.failure, {
    code: "http-error",
    providerHttpStatus: 400,
    providerErrorCode: "invalid_request_error",
  });
  assert.equal(validateEntdeckenFactsErrorResponse({
    ...functionBody,
    ignored: privateText,
  }), null);
  const visible = formatEntdeckenFactsRemoteFailure(503, functionBody);
  assert.equal(visible,
    "FACTS_REMOTE_FAILED function_http=503 code=http-error"
      + " provider_http=400 provider_code=invalid_request_error");
  assert.doesNotMatch(visible, new RegExp([
    privateText, "fixture-secret", "req_private_fixture", batch[0].title,
  ].map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")));
});

await check("Nicht-JSON-Providerfehler behält nur den HTTP-Status", async () => {
  const adapter = createAnthropicEntdeckenFactsAdapter({
    apiKey: "fixture-secret",
    loadSetup: async () => setup,
    reserveCost: async () => ({ ok: true, logId: 43 }),
    settleCost: async () => {},
    readSettledCost: async () => null,
    fetchImpl: async () => new Response("private upstream body", { status: 502 }),
  });
  await assert.rejects(() => adapter.resolve(inputs.slice(0, 9), 9), (error) => {
    assert.equal(error.code, "http-error");
    assert.deepEqual(error.providerFailure, {
      stage: "http", httpStatus: 502, providerErrorType: null,
    });
    assert.doesNotMatch(JSON.stringify(createEntdeckenFactsErrorResponse(error)),
      /private upstream body|fixture-secret/);
    return true;
  });
});

await check("Teilfortschritt wird je Item gesichert und Wiederanlauf enthaelt nur 41 Fehlende", async () => {
  let persisted = emptySnapshot();
  let writes = 0;
  let requests = 0;
  await assert.rejects(() => runEntdeckenFactsBatchPlan({
    snapshot: persisted,
    now: NOW,
    requestBatch: async (batch, { maxSearchUses }) => {
      requests += 1;
      if (requests === 2) throw new Error("fixture-transport");
      return serverBatch(
        batch,
        batch.map((item, index) => normalizedResult(item, index)),
        { searchRequests: maxSearchUses },
      );
    },
    persistSnapshot: async (snapshot) => { persisted = snapshot; writes += 1; },
  }), /fixture-transport/);
  assert.equal(requests, 2);
  assert.equal(writes, 10);
  assert.equal(persisted.pilot.status, "passed");
  assert.equal(persisted.pilot.resolvedReady, 9);
  const resume = createEntdeckenFactsBatchPlan(ENTDECKEN_MARKET_POOL_50, persisted, { now: NOW });
  assert.equal(resume.pending.length, 41);
  assert.equal(resume.batches.length, 5);
  assert.deepEqual(resume.batches.map((batch) => batch.length), [9, 11, 10, 10, 1]);
  assert.deepEqual(resume.maxSearchUsesByBatch, [9, 8, 8, 8, 1]);
  assert.ok(resume.pending.every((item) => !inputs.slice(0, 9).some((done) => done.poolId === item.poolId)));
});

await check("Vollstaendiger Mocklauf versucht alle 50 genau einmal in fünf Requests", async () => {
  let snapshot = emptySnapshot();
  let offset = 0;
  let writes = 0;
  let measuredBefore = 0;
  let measuredAfter = 0;
  const result = await runEntdeckenFactsBatchPlan({
    snapshot,
    now: NOW,
    beforeRequest: async ({ requestNumber }) => {
      measuredBefore += 1;
      return Object.freeze({ requestNumber });
    },
    afterRequest: async (marker, costUsdCent) => {
      measuredAfter += 1;
      assert.equal(marker.requestNumber, measuredAfter);
      assert.ok(costUsdCent > 0 && costUsdCent <= ANBIETER_REQUEST_LIMIT_USD_CENT);
    },
    requestBatch: async (batch, { maxSearchUses }) => {
      const rows = batch.map((item, index) => normalizedResult(item, offset + index));
      offset += batch.length;
      return serverBatch(batch, rows, { searchRequests: maxSearchUses });
    },
    persistSnapshot: async (next) => { snapshot = next; writes += 1; },
  });
  assert.equal(result.providerRequests, 5);
  assert.equal(result.searchRequests, 41);
  assert.equal(measuredBefore, 5);
  assert.equal(measuredAfter, 5);
  assert.equal(result.accepted, 50);
  assert.equal(writes, 51);
  assert.deepEqual(snapshot.pilot, {
    status: "passed", batchSize: 9, threshold: 7, resolvedReady: 9,
    evaluatedAt: NOW, providerRequests: 1,
  });
  assert.equal(result.diagnostics.ok, 50);
  assert.equal(result.diagnostics.unknownOrExpired, 0);
});

await check("Pilot 7/9 geht weiter; ambiguous und unresolved zählen nicht", async () => {
  let snapshot = emptySnapshot();
  let requests = 0;
  const result = await runEntdeckenFactsBatchPlan({
    snapshot,
    now: NOW,
    requestBatch: async (batch, { maxSearchUses }) => {
      requests += 1;
      const rows = batch.map((item, index) => (
        requests === 1 && index === 7 ? normalizedResult(item, index, "ambiguous")
          : requests === 1 && index === 8 ? normalizedResult(item, index, "unresolved")
            : normalizedResult(item, requests * 100 + index)
      ));
      return serverBatch(batch, rows, { searchRequests: maxSearchUses });
    },
    persistSnapshot: async (next) => { snapshot = next; },
  });
  assert.equal(requests, 5);
  assert.equal(result.providerRequests, 5);
  assert.equal(snapshot.pilot.status, "passed");
  assert.equal(snapshot.pilot.resolvedReady, 7);
});

await check("Pilot 6/9 stoppt nach exakt einem Providerrequest und behält Teilstand", async () => {
  let snapshot = emptySnapshot();
  let requests = 0;
  let writes = 0;
  await assert.rejects(() => runEntdeckenFactsBatchPlan({
    snapshot,
    now: NOW,
    requestBatch: async (batch, { maxSearchUses }) => {
      requests += 1;
      const rows = batch.map((item, index) => (
        index < 6 ? normalizedResult(item, index)
          : normalizedResult(item, index, index === 6 ? "unresolved" : "ambiguous")
      ));
      return serverBatch(batch, rows, { searchRequests: maxSearchUses });
    },
    persistSnapshot: async (next) => { snapshot = next; writes += 1; },
  }), /FACTS_PILOT_THRESHOLD/);
  assert.equal(requests, 1);
  assert.equal(writes, 10);
  assert.equal(Object.keys(snapshot.entries).length, 9);
  assert.equal(snapshot.pilot.status, "failed");
  assert.equal(snapshot.pilot.resolvedReady, 6);
  assert.equal(snapshot.entries[strongId(0)].provider.origin, "provider_model_generated");
  assert.equal(snapshot.entries[strongId(0)].provider.userJudgment, false);
  assert.equal(snapshot.entries[strongId(0)].validation.status, "machine_validated");
});

await check("Restwache erzwingt fünf Requests, 1483,5933 Cent und 500-Cent-Puffer", async () => {
  const values = [0, 0, 400, 400, 800, 800, 1_001, 1_001];
  const wache = createEntdeckenFactsResumeGuard(async () => ({
      verbrauchtUsdCent: values.shift(),
      globalesBudgetErschoepft: false,
      anbieterRequestLimitUsdCent: ANBIETER_REQUEST_LIMIT_USD_CENT,
      anbieterRequestTimeoutMs: 135_000,
    }));
  assert.equal(wache.maxAnbieterRequests, 5);
  assert.equal(wache.laufLimitUsdCent, 1483.5933);
  await wache.initialisiere();
  for (const cost of [400, 400, 201]) {
    const marker = await wache.vorAnbieterRequest("fixture");
    await wache.nachAnbieterRequest(marker, cost);
  }
  await assert.rejects(() => wache.vorAnbieterRequest("batch 4"), /500-Cent-Sicherheitspuffer/);
  assert.equal(wache.anzahl, 3);
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

await check("AGENTS-konformer Wrapper akzeptiert exakt Owner-Zusatz zuerst und startet nur Fakten", async () => {
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
  let started = null;
  const exact = await keychainMain([
    "ai-live", OWNER_SERVER_BUDGET_FLAG, ENTDECKEN_FACTS_ONCE_FLAG,
  ], {
    modusStarter: async (value) => { started = value; return 0; },
    fehlerAusgabe: () => {},
  });
  assert.equal(exact, 0);
  assert.equal(started.entdeckenFactsOnce, true);
  assert.equal(started.ownerApprovedServerBudget, true);
  assert.equal(started.entdeckenDailyOnce, false);
  assert.equal(started.entdeckenProviderProbeOnce, false);
  assert.equal(started.radarWebsearchOnce, false);
  assert.equal(started.radarEntdeckenOnce, false);
  let wrongStarted = false;
  const wrongOrder = await keychainMain([
    "ai-live", ENTDECKEN_FACTS_ONCE_FLAG, OWNER_SERVER_BUDGET_FLAG,
  ], {
    modusStarter: async () => { wrongStarted = true; return 0; },
    fehlerAusgabe: () => {},
  });
  assert.equal(wrongOrder, EXIT_KONFIG);
  assert.equal(wrongStarted, false);
  assert.equal(`npm run test:ai:live -- ${OWNER_SERVER_BUDGET_FLAG} ${ENTDECKEN_FACTS_ONCE_FLAG}`,
    "npm run test:ai:live -- --owner-approved-server-budget --entdecken-facts-once");
});

await check("Requestvertrag akzeptiert nur die vollständige pre-resolution Identitaet", () => {
  const request = validateEntdeckenFactsRequest({
    schemaVersion: ENTDECKEN_FACTS_REQUEST_VERSION,
    items: inputs.slice(0, 9),
    maxSearchUses: 9,
  });
  assert.equal(request.items.length, 9);
  assert.equal(validateEntdeckenFactsRequest({
    schemaVersion: ENTDECKEN_FACTS_REQUEST_VERSION,
    items: [{ ...inputs[0], title: "anderer Titel" }],
    maxSearchUses: 1,
  }), null);
  assert.equal(validateEntdeckenFactsRequest({
    schemaVersion: ENTDECKEN_FACTS_REQUEST_VERSION,
    items: inputs.slice(0, 11),
    maxSearchUses: 10,
  }), null);
});

const source = readFileSync("./tools/entdecken_facts_live.mjs", "utf8");
assert.doesNotMatch(source, /setTimeout\([^)]*retry|while\s*\(|Promise\.all\s*\(.*requestBatch/s);
console.log(`\n${checks}/${checks} fokussierte E6-Faktenchecks grün.`);
