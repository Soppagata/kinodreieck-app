/* Paket B: ausschließlich lokale Mocks. Kein Provider-, Supabase- oder
   sonstiger Netzwerkzugriff. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { delimiter, dirname, relative, resolve } from "node:path";
import {
  RADAR_WEBSEARCH_FEE_USD_CENT,
  RADAR_WEBSEARCH_MAX_TOKENS,
  RADAR_WEBSEARCH_TASK_CAP_USD_CENT,
  RadarWebsearchProviderError,
  createAnthropicRadarWebsearchAdapter,
} from "./supabase/functions/radar-websearch-task/anthropicAdapter.js";
import { evaluateRadarWebsearchResponse } from "./supabase/functions/radar-websearch-task/contract.js";
import { runRadarWebsearchCheck } from "./supabase/functions/radar-websearch-task/runner.js";
import { createRadarWebsearchMemoryRepository } from "./supabase/functions/radar-websearch-task/mockAdapter.js";
import { isProviderReceipt } from "./supabase/functions/_shared/providerReceipt.js";
import { runRadarWebsearchOnce } from "./tools/radar_websearch_live.mjs";
import { erstelleAnbieterPfadBelege } from "./tools/ai_smoke_contract.mjs";
import { RADAR_WEBSEARCH_ONCE_ENV } from "./tools/keychain_runner.mjs";
import {
  ANTHROPIC_PROVIDER_KEYCHAIN,
  ENTDECKEN_EDITORIAL_SOURCE_FILES,
  ENTDECKEN_EDITORIAL_SOURCE_MIGRATION,
  ENTDECKEN_EDITORIAL_SOURCE_RELEASE_SHA256,
  ENTDECKEN_HTTP_DIAGNOSTIC_FILES,
  ENTDECKEN_HTTP_DIAGNOSTIC_RELEASE_SHA256,
  ENTDECKEN_MIXED_POOL_FILES,
  ENTDECKEN_MIXED_POOL_MIGRATION,
  ENTDECKEN_MIXED_POOL_RELEASE_SHA256,
  ENTDECKEN_MIXED_SINGLE_LIVE_FILES,
  ENTDECKEN_MIXED_SINGLE_LIVE_RELEASE_SHA256,
  ENTDECKEN_PROVIDER_PROBE_COMMAND,
  ENTDECKEN_PROVIDER_PROBE_FILES,
  ENTDECKEN_PROVIDER_PROBE_RELEASE_SHA256,
  ENTDECKEN_SINGLE_LIVE_COMMAND,
  ENTDECKEN_SINGLE_LIVE_FILES,
  ENTDECKEN_SINGLE_LIVE_RELEASE_SHA256,
  PROVIDER_RECEIPT_RUNTIME_FILES,
  PROVIDER_RECEIPT_RUNTIME_SOURCE_BUNDLE_SHA256,
  RADAR_DAILY_COMMIT,
  RADAR_DAILY_FILES,
  RADAR_DAILY_MIGRATION,
  RADAR_DAILY_RELEASE_SHA256,
  RADAR_DAILY_WORKFLOW,
  RADAR_TEXT_TARGET_COMMIT,
  RADAR_TEXT_TARGET_FILES,
  REPO_ROOT,
  SUPABASE_INFRA_KEYCHAIN,
  RadarRemoteStartStop,
  buildRadarSupabaseCliEnvironment,
  buildRadarSupabaseVersionBlueprint,
  cleanupRadarCliWorkspace,
  createRadarCliWorkspace,
  createRadarRemotePreflightOnce,
  deriveRadarPackageBReleaseClosure,
  requireEntdeckenEditorialSourceReleaseProvenance,
  requireEntdeckenHttpDiagnosticReleaseProvenance,
  requireEntdeckenMixedPoolReleaseProvenance,
  requireEntdeckenMixedPoolSingleLiveReleaseProvenance,
  requireEntdeckenProviderProbeReleaseProvenance,
  requireEntdeckenSingleLiveReleaseProvenance,
  requireProviderReceiptRuntimeProvenance,
  requireRadarDailyReleaseProvenance,
  runRadarSupabaseVersionProbe,
  validateRadarSupabaseCliEnvironment,
  validateRadarLedgerBaseline,
} from "./tools/radar_websearch_remote_start.mjs";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const target = Object.freeze({
  targetId: "imdb:tt0137523",
  canonicalTitle: "Fight Club",
  releaseYear: 1999,
  mediaType: "film",
  region: "AT",
  scopes: ["cinema", "streaming"],
});
const sources = Object.freeze([
  Object.freeze({
    sourceId: "news-a",
    domain: "news-a.example",
    publisherFamily: "news-a",
    sourceClass: "editorial",
    rightsStatus: "approved",
    attributionApproved: true,
    subdomainsAllowed: false,
    active: true,
  }),
  Object.freeze({
    sourceId: "news-b",
    domain: "news-b.example",
    publisherFamily: "news-b",
    sourceClass: "editorial",
    rightsStatus: "approved",
    attributionApproved: true,
    subdomainsAllowed: false,
    active: true,
  }),
]);
const setup = Object.freeze({
  radarEnabled: true,
  radarProviderEnabled: true,
  radarSchedulerEnabled: false,
  providerAllowed: true,
  modelAlias: "klein",
  model: "claude-haiku-4-5",
  maxTokens: RADAR_WEBSEARCH_MAX_TOKENS,
  taskCapUsdCent: RADAR_WEBSEARCH_TASK_CAP_USD_CENT,
  searchFeeUsdCent: RADAR_WEBSEARCH_FEE_USD_CENT,
  globalRequestCapUsdCent: 500,
  timeoutMs: 30_000,
  inputPriceUsdCentPerMtok: 100,
  outputPriceUsdCentPerMtok: 500,
  sourceRegistry: sources,
});

function evidence(source, path = "start") {
  return {
    url: `https://${source.domain}/${path}`,
    sourceDomain: source.domain,
    sourceTitle: `${source.publisherFamily} Termin`,
    publishedAt: "2026-08-17",
    claim: "Der Kinostart in Österreich ist am 21. August 2026.",
  };
}

function providerMessage({
  status = "confirmed",
  events = null,
  resultUrls = [evidence(sources[0]).url, evidence(sources[1]).url],
  citationUrls = null,
  usageSearch = 1,
  stopReason = "end_turn",
  toolError = false,
} = {}) {
  const eventList = events ?? (status === "confirmed" ? [{
    eventType: "kinostart_at",
    eventDate: "2026-08-21",
    evidence: [evidence(sources[0]), evidence(sources[1])],
  }] : []);
  const toolContent = toolError
    ? { type: "web_search_tool_result_error", error_code: "unavailable" }
    : resultUrls.map((url, index) => ({
      type: "web_search_result",
      url,
      title: `Treffer ${index + 1}`,
      encrypted_content: "opaque",
      page_age: "2026-08-17",
    }));
  const citations = (citationUrls ?? resultUrls).map((url, index) => ({
    type: "web_search_result_location",
    url,
    title: `Treffer ${index + 1}`,
    encrypted_index: `opaque-${index}`,
    cited_text: "Belegter Termin.",
  }));
  return {
    id: "msg_mock",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    stop_reason: stopReason,
    content: [
      { type: "server_tool_use", id: "srvtoolu_mock", name: "web_search", input: { query: "global" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_mock", content: toolContent },
      { type: "text", text: JSON.stringify({ status, events: eventList }), citations },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      server_tool_use: { web_search_requests: usageSearch },
    },
  };
}

const textTarget = Object.freeze({
  kind: "text",
  targetId: "text:d9e6b48aa971462a",
  targetText: "Mutter Teresa",
  region: "AT",
  scopes: Object.freeze(["cinema", "streaming", "series_start", "season_start"]),
});

function textProof(source, path, claim) {
  return {
    url: `https://${source.domain}/${path}`,
    sourceDomain: source.domain,
    sourceTitle: `${source.publisherFamily} Beleg`,
    publishedAt: "2026-08-22",
    claim,
  };
}

function textProviderMessage({ rawText = null, stopReason = "end_turn" } = {}) {
  const relationEvidence = [
    textProof(sources[0], "mutter-teresa/relation-a", "Das Werk handelt eindeutig von Mutter Teresa."),
    textProof(sources[1], "mutter-teresa/relation-b", "Das Werk ist Mutter Teresa eindeutig zugeordnet."),
  ];
  const eventEvidence = [
    textProof(sources[0], "mutter-teresa/start-a", "Streamingstart in Österreich am 29. August 2026."),
    textProof(sources[1], "mutter-teresa/start-b", "Österreichstart am 29. August 2026 bestätigt."),
  ];
  const resultUrls = [...relationEvidence, ...eventEvidence].map((entry) => entry.url);
  const candidates = [{ title: "kaputt-ohne-identitaet" }, {
    targetId: "imdb:tt14409336",
    targetType: "work",
    title: "Mother Teresa: No Greater Love",
    year: 2022,
    eventType: "streamingstart_at",
    eventDate: "2026-08-29",
    region: "AT",
    platform: "Beispiel+",
    relationEvidence,
    evidence: eventEvidence,
    harmlessExtra: "ignored",
  }];
  const textBody = rawText ?? [
    "Hier ist die auswertbare Antwort:",
    "```json",
    JSON.stringify({ status: "confirmed", candidates, harmlessTopLevel: true }),
    "```",
    "Nur die belegten Einträge sind relevant.",
  ].join("\n");
  return {
    id: "msg_text_mock",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    stop_reason: stopReason,
    content: [
      { type: "server_tool_use", id: "srvtoolu_text", name: "web_search", input: {} },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_text",
        content: resultUrls.map((url) => ({ type: "web_search_result", url, title: "Beleg" })),
      },
      {
        type: "text",
        text: textBody,
        citations: resultUrls.map((url) => ({ type: "web_search_result_location", url })),
      },
    ],
    usage: {
      input_tokens: 120,
      output_tokens: 180,
      server_tool_use: { web_search_requests: 1 },
    },
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function adapterHarness({
  setupPatch = {},
  providerBody = providerMessage(),
  httpStatus = 200,
  reserveResult = { ok: true, logId: 71 },
  fetchError = null,
} = {}) {
  const fetchCalls = [];
  const reserveCalls = [];
  const settleCalls = [];
  const effectiveSetup = { ...setup, ...setupPatch };
  const adapter = createAnthropicRadarWebsearchAdapter({
    apiKey: "mock-api-key-never-logged",
    loadSetup: async () => effectiveSetup,
    reserveCost: async (input) => {
      reserveCalls.push(input);
      return reserveResult;
    },
    settleCost: async (input) => { settleCalls.push(input); },
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      if (fetchError) throw fetchError;
      return response(providerBody, httpStatus);
    },
    now: () => "2026-08-17T12:00:00.000Z",
    operationId: () => "70000000-0000-4000-8000-000000000001",
  });
  return { adapter, fetchCalls, reserveCalls, settleCalls, effectiveSetup };
}

async function expectProviderError(promise, code) {
  await assert.rejects(promise, (error) => (
    error instanceof RadarWebsearchProviderError
      && error.code === code && error.message === code
  ));
}

await check("Realer Adapter macht genau einen begrenzten Fetch und der deterministische Validator schreibt", async () => {
  const harness = adapterHarness();
  const repository = createRadarWebsearchMemoryRepository({ target, sources });
  const result = await runRadarWebsearchCheck({
    accountId: "max-account",
    targetId: target.targetId,
    adapter: harness.adapter,
    repository,
    operationId: () => "71000000-0000-4000-8000-000000000001",
  });
  assert.equal(result.status, "confirmed");
  assert.equal(result.writes, 1);
  assert.equal(result.feed.events.length, 1);
  assert.equal(result.feed.events[0].targetId, target.targetId);
  assert.equal(result.feed.events[0].eventType, "kinostart_at");
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.reserveCalls.length, 1);
  assert.equal(harness.settleCalls.length, 1);
  assert.equal(harness.settleCalls[0].status, "fertig");
  assert.ok(harness.reserveCalls[0].reservationUsdCent > RADAR_WEBSEARCH_FEE_USD_CENT);
  assert.ok(harness.settleCalls[0].costUsdCent > RADAR_WEBSEARCH_FEE_USD_CENT);
  assert.equal(isProviderReceipt(result.providerReceipt), true);
  assert.equal(result.providerReceipt.provider, "anthropic");
  assert.equal(result.providerReceipt.model, "claude-haiku-4-5");
  assert.deepEqual(result.providerReceipt.usage, {
    inputTokens: 100,
    outputTokens: 50,
    webSearchRequests: 1,
  });
  assert.equal(result.providerReceipt.resultMode, "structured");
  assert.equal(result.providerReceipt.server.logId, 71);
  assert.equal(
    result.providerReceipt.server.reservationUsdCent,
    harness.reserveCalls[0].reservationUsdCent,
  );
  assert.equal(
    result.providerReceipt.server.costUsdCent,
    harness.settleCalls[0].costUsdCent,
  );
  assert.doesNotMatch(
    JSON.stringify(result.providerReceipt),
    /mock-api-key|news-a\.example|web_search_result|opaque|Fight Club/,
  );
  const proof = erstelleAnbieterPfadBelege(["radar-websearch-task"], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  proof.registriere("radar-websearch-task");
  proof.erfasseProviderReceipt("radar-websearch-task", {
    receipt: result.providerReceipt,
    measuredCostUsdCent: harness.settleCalls[0].costUsdCent,
    responseCostUsdCent: harness.settleCalls[0].costUsdCent,
    responseProviderRequests: 1,
    responseSearchRequests: 1,
    expectedResultMode: "structured",
  });
  proof.erfassePfadErgebnis("radar-websearch-task", { ok: true });
  assert.equal(proof.abschluss().ok, true);
  assert.equal(
    harness.adapter.takeProviderRawResponse(),
    JSON.stringify(providerMessage()),
  );
  assert.equal(harness.adapter.takeProviderRawResponse(), null);

  const sent = JSON.parse(harness.fetchCalls[0].options.body);
  assert.equal(harness.fetchCalls[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(sent.tools.length, 1);
  assert.equal(sent.tools[0].type, "web_search_20250305");
  assert.equal(sent.tools[0].max_uses, 1);
  assert.deepEqual(sent.tools[0].allowed_domains, ["news-a.example", "news-b.example"]);
  assert.deepEqual(sent.tools[0].allowed_callers, ["direct"]);
  const providerInput = JSON.parse(sent.messages[0].content);
  assert.deepEqual(providerInput, target);
  for (const forbidden of ["accountId", "profile", "library", "subscriptions", "password", "secret"]) {
    assert.equal(harness.fetchCalls[0].options.body.includes(forbidden), false);
  }
  assert.equal("output_config" in sent, false);
});

await check("Insufficient und no_change bleiben kleine terminale Antworten ohne Write", async () => {
  for (const status of ["insufficient_evidence", "no_change"]) {
    const harness = adapterHarness({
      providerBody: providerMessage({ status, events: [], resultUrls: [], citationUrls: [] }),
    });
    const envelope = await harness.adapter.search(target);
    const { providerReceipt, ...providerEnvelope } = envelope;
    assert.equal(isProviderReceipt(providerReceipt), true);
    const evaluated = evaluateRadarWebsearchResponse(providerEnvelope, target, sources);
    assert.equal(evaluated.status, status);
    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.settleCalls[0].status, "fertig");
  }
});

function textRepository() {
  const calls = { upserts: 0 };
  const stored = [];
  return {
    calls,
    async loadAuthorizedTarget({ accountId, targetId, targetText }) {
      assert.equal(accountId, "max-account");
      assert.equal(targetId, textTarget.targetId);
      assert.equal(targetText, textTarget.targetText);
      return structuredClone(textTarget);
    },
    async resolveSources(domains) {
      assert.equal(domains.every((domain) => sources.some((source) => source.domain === domain)), true);
      return structuredClone(sources.filter((source) => domains.includes(source.domain)));
    },
    async upsertConfirmedEvent({ event }) {
      calls.upserts += 1;
      stored.push(structuredClone(event));
      return { status: "confirmed" };
    },
    async loadFeed() { return { events: structuredClone(stored) }; },
  };
}

await check("Freitext-Codeblock rettet einen belegten Fund und verwirft ein kaputtes Item ohne zweiten Request", async () => {
  const harness = adapterHarness({ providerBody: textProviderMessage({ stopReason: "max_tokens" }) });
  const repository = textRepository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account",
    targetId: textTarget.targetId,
    targetText: textTarget.targetText,
    adapter: harness.adapter,
    repository,
    operationId: () => "72000000-0000-4000-8000-000000000001",
  });
  assert.equal(result.status, "confirmed");
  assert.equal(result.writes, 1);
  assert.equal(result.responseMode, "partial");
  assert.match(result.displayText, /Nur belegte Funde/);
  assert.ok(result.warnings.includes("json-extracted-from-text"));
  assert.equal(repository.calls.upserts, 1);
  assert.equal(result.feed.events[0].targetKey, "imdb:tt14409336");
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.reserveCalls.length, 1);
  assert.equal(harness.settleCalls.length, 1);
});

await check("Sicherer unstrukturierter Freitext wird degraded sichtbar und bleibt writes=0", async () => {
  const safeText = "Keine eindeutig belegte Zuordnung zu einem Österreich-Termin gefunden.";
  const harness = adapterHarness({ providerBody: textProviderMessage({ rawText: safeText }) });
  const repository = textRepository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account",
    targetId: textTarget.targetId,
    targetText: textTarget.targetText,
    adapter: harness.adapter,
    repository,
  });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.writes, 0);
  assert.equal(result.responseMode, "degraded");
  assert.equal(result.displayText, safeText);
  assert.equal(repository.calls.upserts, 0);
  assert.equal(harness.fetchCalls.length, 1);
});

await check("Thinking, Secrettext und eine eingebettete API-Hülle bleiben harte Ausgabesperren", async () => {
  const thinkingBody = providerMessage();
  thinkingBody.content.push({ type: "thinking", thinking: "private" });
  const unsafeBodies = [
    thinkingBody,
    textProviderMessage({ rawText: "api_key=sk-ant-synthetic-secret-value" }),
    textProviderMessage({
      rawText: JSON.stringify({
        id: "msg_leak", type: "message", role: "assistant", model: "claude-haiku-4-5",
        content: [], usage: {},
      }),
    }),
  ];
  for (const providerBody of unsafeBodies) {
    const harness = adapterHarness({ providerBody });
    await expectProviderError(harness.adapter.search(textTarget), "provider-output-invalid");
    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.settleCalls[0].status, "fehler");
  }
});

await check("HTTP- und Netzwerkfehler enden nach einem Fetch ohne Rohfehler", async () => {
  const http = adapterHarness({
    providerBody: { type: "error", error: { type: "overloaded_error", message: "raw-private" } },
    httpStatus: 529,
  });
  await expectProviderError(http.adapter.search(target), "http-error");
  assert.equal(http.fetchCalls.length, 1);
  assert.equal(http.settleCalls.length, 1);
  assert.equal(http.settleCalls[0].status, "fehler");
  assert.equal(JSON.stringify(http.settleCalls).includes("raw-private"), false);

  const network = adapterHarness({ fetchError: new Error("socket raw-private") });
  await expectProviderError(network.adapter.search(target), "http-error");
  assert.equal(network.fetchCalls.length, 1);
  assert.equal(network.settleCalls.length, 1);
  assert.equal(JSON.stringify(network.settleCalls).includes("raw-private"), false);
});

await check("Toolfehler bleibt hart; abweichender stop_reason nutzt brauchbare Antwort ohne Folgefetch", async () => {
  const tool = adapterHarness({ providerBody: providerMessage({ toolError: true }) });
  await expectProviderError(tool.adapter.search(target), "provider-tool-error");
  assert.equal(tool.fetchCalls.length, 1);
  assert.equal(tool.settleCalls.length, 1);

  const paused = adapterHarness({ providerBody: providerMessage({ stopReason: "pause_turn" }) });
  const envelope = await paused.adapter.search(target);
  assert.equal(envelope.responseMode, "partial");
  assert.ok(envelope.warnings.includes("stop-reason-normalized"));
  assert.equal(paused.fetchCalls.length, 1);
  assert.equal(paused.settleCalls.length, 1);
});

await check("Usage 0 und Usage größer 1 werden trotz HTTP 200 fail-closed abgewiesen", async () => {
  for (const usageSearch of [0, 2]) {
    const harness = adapterHarness({ providerBody: providerMessage({ usageSearch }) });
    await expectProviderError(harness.adapter.search(target), "provider-usage-invalid");
    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.settleCalls.length, 1);
    assert.equal(harness.settleCalls[0].status, "fehler");
  }
});

await check("Zusätzliche Resultate und fremde Citation werden weich begrenzt, Evidence bleibt geschlossen", async () => {
  const tooManyUrls = Array.from({ length: 7 }, (_, index) => `https://news-a.example/${index}`);
  const tooMany = adapterHarness({
    providerBody: providerMessage({ resultUrls: tooManyUrls, citationUrls: tooManyUrls }),
  });
  const truncated = await tooMany.adapter.search(target);
  assert.equal(truncated.searchResultCount, 6);
  assert.equal(truncated.responseMode, "partial");
  assert.ok(truncated.warnings.includes("search-results-truncated"));
  assert.equal(tooMany.fetchCalls.length, 1);

  const foreign = adapterHarness({
    providerBody: providerMessage({
      citationUrls: [evidence(sources[0]).url, "https://foreign.example/start"],
    }),
  });
  const filtered = await foreign.adapter.search(target);
  assert.equal(filtered.responseMode, "partial");
  const { providerReceipt: filteredReceipt, ...filteredEnvelope } = filtered;
  assert.equal(isProviderReceipt(filteredReceipt), true);
  assert.equal(
    evaluateRadarWebsearchResponse(filteredEnvelope, target, sources).status,
    "insufficient_evidence",
  );
  assert.equal(foreign.fetchCalls.length, 1);
});

await check("Scheduler-Setup akzeptiert den manuellen und den taeglichen Bool-Zustand", async () => {
  for (const radarSchedulerEnabled of [false, true]) {
    const harness = adapterHarness({ setupPatch: { radarSchedulerEnabled } });
    const result = await harness.adapter.search(target);
    assert.equal(result.response.status, "confirmed");
    assert.equal(harness.reserveCalls.length, 1);
    assert.equal(harness.fetchCalls.length, 1);
  }
});

await check("Radar-, Provider-, Scheduler-Typ-, Allowlist- und lokale Kostengates stoppen vor Reservierung und Fetch", async () => {
  const gates = [
    { radarEnabled: false },
    { radarProviderEnabled: false },
    { radarSchedulerEnabled: "true" },
    { providerAllowed: false },
    { sourceRegistry: [] },
    { searchFeeUsdCent: 2 },
    { taskCapUsdCent: 6 },
    { globalRequestCapUsdCent: 4 },
    { maxTokens: 1201 },
  ];
  for (const setupPatch of gates) {
    const harness = adapterHarness({ setupPatch });
    await expectProviderError(harness.adapter.search(target), "setup-invalid");
    assert.equal(harness.reserveCalls.length, 0);
    assert.equal(harness.fetchCalls.length, 0);
  }
});

await check("Atomare Kostenablehnung und unbrauchbare Log-ID stoppen vor dem Provider", async () => {
  const rejected = adapterHarness({ reserveResult: { ok: false, logId: null } });
  await expectProviderError(rejected.adapter.search(target), "cost-gate-rejected");
  assert.equal(rejected.fetchCalls.length, 0);
  assert.equal(rejected.settleCalls.length, 0);

  const badLog = adapterHarness({ reserveResult: { ok: true, logId: 0 } });
  await expectProviderError(badLog.adapter.search(target), "cost-log-invalid");
  assert.equal(badLog.fetchCalls.length, 0);
  assert.equal(badLog.settleCalls.length, 0);
});

await check("Eine Adapterinstanz ist one-shot und kann keinen zweiten Request auslösen", async () => {
  const harness = adapterHarness();
  await harness.adapter.search(target);
  await expectProviderError(harness.adapter.search(target), "already-used");
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.reserveCalls.length, 1);
  assert.equal(harness.settleCalls.length, 1);
});

function budgetBody(spent) {
  return {
    ok: true,
    betrieb: {
      monatsbudgetUsdCent: 5000,
      anbieterRequestMaxUsdCent: 500,
      anbieterRequestOwnerMaxUsdCent: 500,
      anbieterRequestTimeoutMs: 30_000,
      anbieterRequestTimeoutOwnerMaxMs: 135_000,
      stand: { monatVerbrauchtUsdCent: spent, budgetErschoepft: false },
    },
  };
}

await check("Live-Einstieg ruft genau die Radar-Function auf und startet keine andere KI-Probe", async () => {
  const calls = [];
  let radarCalled = false;
  const env = {
    KD_SB_URL: "https://projekt-ref.supabase.co",
    KD_SB_ANON: "sb_publishable_test_1234567890",
    KD_TESTA_USER: "testa",
    KD_TESTA_PASS: "mock-only-password",
    KD_MAIL_DOMAIN: "login.kinodreieck.at",
    KD_AI_FUNKTION: "ai-task",
    KD_ORIGIN: "https://staging.kinodreieck.at",
    KD_RADAR_TARGET_ID: target.targetId,
    [RADAR_WEBSEARCH_ONCE_ENV]: "keychain-budget-guard-v1",
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/token")) {
      return response({ access_token: "mock-session-token" });
    }
    if (String(url).endsWith("/functions/v1/ai-task")) {
      assert.deepEqual(JSON.parse(options.body).task, "health");
      return response(budgetBody(radarCalled ? 2 : 0));
    }
    if (String(url).endsWith("/functions/v1/radar-websearch-task")) {
      radarCalled = true;
      assert.deepEqual(JSON.parse(options.body), { targetId: target.targetId });
      return response({
        ok: true,
        status: "confirmed",
        writes: 1,
        providerRequests: 1,
        searchRequests: 1,
      });
    }
    throw new Error("unexpected-mock-url");
  };
  const output = [];
  const result = await runRadarWebsearchOnce({ env, fetchImpl, ausgabe: (line) => output.push(line) });
  const radarCalls = calls.filter((call) => call.url.endsWith("/functions/v1/radar-websearch-task"));
  assert.equal(result.status, "confirmed");
  assert.equal(radarCalls.length, 1);
  assert.equal(calls.some((call) => call.url.includes("api.anthropic.com")), false);
  assert.equal(calls.some((call) => call.options?.body?.includes?.("anbieter-modelle")), false);
  assert.equal(calls.some((call) => call.options?.body?.includes?.("echo-struct")), false);
  assert.equal(output.length, 1);
  assert.equal(output[0].includes(target.targetId), false);
});

await check("Direkter Live-Skriptaufruf ohne internen Runner-Guard bleibt netzfrei", async () => {
  let fetches = 0;
  await assert.rejects(
    runRadarWebsearchOnce({
      env: { KD_RADAR_TARGET_ID: target.targetId },
      fetchImpl: async () => { fetches += 1; },
    }),
    /fest verdrahteten npm-Budgetweg/,
  );
  assert.equal(fetches, 0);
});

const expectedLedgerBaseline = Object.freeze([
  Object.freeze({
    version: "20260817120000",
    name: "blog_profile_extract_config",
  }),
]);

await check("Ledgervergleich akzeptiert umsortierte JSONB-Schluessel semantisch exakt", () => {
  const reorderedJsonbResult = [{
    name: "blog_profile_extract_config",
    version: "20260817120000",
  }];
  assert.notEqual(JSON.stringify(reorderedJsonbResult), JSON.stringify(expectedLedgerBaseline));
  assert.equal(validateRadarLedgerBaseline(reorderedJsonbResult, expectedLedgerBaseline), true);
});

await check("Ledgervergleich stoppt bei fehlenden, zusaetzlichen oder abweichenden Daten", () => {
  const driftCases = [
    [{ version: "20260817120000" }],
    [{
      version: "20260817120000",
      name: "blog_profile_extract_config",
      unexpected: true,
    }],
    [{ version: "20260817120000", name: "other_migration" }],
    [{ version: 20260817120000, name: "blog_profile_extract_config" }],
  ];
  for (const drift of driftCases) {
    assert.throws(
      () => validateRadarLedgerBaseline(drift, expectedLedgerBaseline),
      (error) => error instanceof RadarRemoteStartStop
        && error.code === "LEDGER_BASELINE_DRIFT",
    );
  }
});

await check("Historischer Radar-Deployzaun blockiert die neue Runtime statt sie still zu akzeptieren", () => {
  assert.throws(
    () => deriveRadarPackageBReleaseClosure(),
    (error) => error instanceof RadarRemoteStartStop
      && error.code === "RADAR_TEXT_TARGET_RELEASE_PROVENANCE_DRIFT",
  );
  assert.equal(RADAR_TEXT_TARGET_FILES.some(({ path: pathname }) => (
    pathname.endsWith("providerReceipt.js")
  )), false);
});

await check("Lokaler Entdecken-Kandidat lässt den gemeinsamen Receipt-Bytebeleg fail-closed driften", () => {
  assert.throws(
    () => requireProviderReceiptRuntimeProvenance(),
    (error) => error instanceof RadarRemoteStartStop
      && error.code === "PROVIDER_RECEIPT_RUNTIME_PROVENANCE_DRIFT",
  );
  assert.equal(PROVIDER_RECEIPT_RUNTIME_SOURCE_BUNDLE_SHA256.length, 64);
  assert.equal(PROVIDER_RECEIPT_RUNTIME_FILES.some(({ path: pathname }) => (
    pathname.includes("radar-websearch-task")
  )), true);
  assert.equal(PROVIDER_RECEIPT_RUNTIME_FILES.some(({ path: pathname }) => (
    pathname.includes("entdecken-daily-task")
  )), true);
});

await check("Nicht deployter Entdecken-Mix hält den Quellenrelease-Zaun unverändert geschlossen", () => {
  assert.throws(
    () => requireEntdeckenEditorialSourceReleaseProvenance(),
    (error) => error instanceof RadarRemoteStartStop
      && error.code === "ENTDECKEN_EDITORIAL_SOURCE_RELEASE_PROVENANCE_DRIFT",
  );
  assert.equal(ENTDECKEN_EDITORIAL_SOURCE_RELEASE_SHA256.length, 64);
  assert.equal(ENTDECKEN_EDITORIAL_SOURCE_FILES.some(({ path: pathname }) => (
    pathname.includes("radar-websearch-task")
  )), false);
  assert.equal(
    ENTDECKEN_EDITORIAL_SOURCE_MIGRATION.path,
    "supabase/migrations/20260827140000_entdecken_public_six_day_pool.sql",
  );
});

await check("Nicht deployter Entdecken-Mix hält Einmallauf und Providerprobe vor Start geschlossen", () => {
  assert.equal(
    ENTDECKEN_SINGLE_LIVE_COMMAND,
    "npm run test:ai:live -- --entdecken-daily-once --owner-approved-server-budget",
  );
  assert.equal(
    ENTDECKEN_PROVIDER_PROBE_COMMAND,
    "npm run test:ai:live -- --entdecken-provider-probe-once --owner-approved-server-budget",
  );
  assert.equal(ENTDECKEN_HTTP_DIAGNOSTIC_RELEASE_SHA256.length, 64);
  assert.equal(ENTDECKEN_HTTP_DIAGNOSTIC_FILES.length > 0, true);
  assert.equal(ENTDECKEN_SINGLE_LIVE_RELEASE_SHA256.length, 64);
  assert.equal(ENTDECKEN_SINGLE_LIVE_FILES.length > 0, true);
  assert.equal(ENTDECKEN_PROVIDER_PROBE_RELEASE_SHA256.length, 64);
  assert.equal(ENTDECKEN_PROVIDER_PROBE_FILES.length > 0, true);
  for (const prove of [
    requireEntdeckenHttpDiagnosticReleaseProvenance,
    requireEntdeckenSingleLiveReleaseProvenance,
    requireEntdeckenProviderProbeReleaseProvenance,
  ]) {
    assert.throws(
      () => prove(),
      (error) => error instanceof RadarRemoteStartStop
        && error.code === "ENTDECKEN_HTTP_DIAGNOSTIC_PROVENANCE_DRIFT",
    );
  }
  assert.throws(() => requireEntdeckenProviderProbeReleaseProvenance({
    requireCleanVerifier: true,
    spawn(_program, args) {
      if (args[0] === "ls-files") {
        const separator = args.indexOf("--");
        return {
          status: 0,
          signal: null,
          stdout: Buffer.from(`${args.slice(separator + 1).join("\n")}\n`),
          stderr: Buffer.alloc(0),
        };
      }
      return {
        status: 0,
        signal: null,
        stdout: Buffer.from(" M tools/radar_websearch_remote_start.mjs\n"),
        stderr: Buffer.alloc(0),
      };
    },
  }), (error) => error instanceof RadarRemoteStartStop
    && error.code === "RELEASE_CLOSURE_DIRTY");
  assert.throws(() => requireEntdeckenProviderProbeReleaseProvenance({
    requireCleanVerifier: true,
    spawn() {
      return {
        status: 1,
        signal: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      };
    },
  }), (error) => error instanceof RadarRemoteStartStop
    && error.code === "RELEASE_CLOSURE_UNTRACKED");
});

await check("Nicht freigegebener Format-6-Functionpfad bleibt hinter seinem alten Migrationszaun geschlossen", () => {
  for (const prove of [
    requireEntdeckenMixedPoolReleaseProvenance,
    requireEntdeckenMixedPoolSingleLiveReleaseProvenance,
  ]) {
    assert.throws(() => prove(), (error) => error instanceof RadarRemoteStartStop
      && error.code === "ENTDECKEN_MIXED_POOL_PROVENANCE_DRIFT");
  }
  assert.equal(ENTDECKEN_MIXED_POOL_RELEASE_SHA256.length, 64);
  assert.equal(ENTDECKEN_MIXED_POOL_FILES.length > 0, true);
  assert.equal(ENTDECKEN_MIXED_SINGLE_LIVE_RELEASE_SHA256.length, 64);
  assert.equal(ENTDECKEN_MIXED_SINGLE_LIVE_FILES.length > 0, true);
  assert.equal(ENTDECKEN_MIXED_POOL_MIGRATION.path,
    "supabase/migrations/20260828180000_entdecken_mixed_pool_format_6.sql");
  assert.doesNotMatch(ENTDECKEN_MIXED_POOL_MIGRATION.path, /20260828233000/);
});

await check("Radar-Tagesrelease bindet Integrationscommit, Runtime, Migration und reinen Zeitplan", () => {
  const readCommitted = (absolutePath) => {
    const pathname = relative(REPO_ROOT, String(absolutePath)).split("\\").join("/");
    const result = spawnSync("/usr/bin/git", ["show", `${RADAR_DAILY_COMMIT}:${pathname}`], {
      cwd: REPO_ROOT,
      encoding: null,
    });
    assert.equal(result.status, 0, pathname);
    return result.stdout;
  };
  const proof = requireRadarDailyReleaseProvenance({ readFile: readCommitted });
  assert.equal(proof.commit, RADAR_DAILY_COMMIT);
  assert.equal(proof.releaseSha256, RADAR_DAILY_RELEASE_SHA256);
  assert.deepEqual(proof.files, RADAR_DAILY_FILES);
  assert.deepEqual(proof.migration, RADAR_DAILY_MIGRATION);
  assert.deepEqual(proof.workflow, RADAR_DAILY_WORKFLOW);
  assert.throws(() => requireRadarDailyReleaseProvenance(), (error) => (
    error instanceof RadarRemoteStartStop
      && error.code === "RADAR_DAILY_RELEASE_PROVENANCE_DRIFT"
  ));
  assert.throws(() => requireRadarDailyReleaseProvenance({
    readFile(absolutePath) {
      const bytes = readCommitted(absolutePath);
      return String(absolutePath).endsWith("radar-daily.yml")
        ? Buffer.concat([bytes, Buffer.from("\n# drift")]) : bytes;
    },
  }), (error) => error instanceof RadarRemoteStartStop
    && error.code === "RADAR_DAILY_RELEASE_PROVENANCE_DRIFT");
});

await check("Der echte JS-CLI-Startmodus findet Node im engen lokalen Lesepfad", () => {
  const workspace = createRadarCliWorkspace();
  try {
    const cliDirectory = `${workspace.runDir}/cli-bin`;
    fs.mkdirSync(cliDirectory, { mode: 0o700 });
    const fakeCli = `${cliDirectory}/supabase`;
    fs.writeFileSync(
      fakeCli,
      "#!/usr/bin/env node\nprocess.stdout.write(\"2.109.1\\n\");\n",
      { mode: 0o700 },
    );
    const blueprint = buildRadarSupabaseVersionBlueprint({ workspace, executable: fakeCli });
    assert.deepEqual(blueprint.env.PATH.split(delimiter), [
      cliDirectory,
      resolve(dirname(process.execPath)),
    ]);
    assert.equal(runRadarSupabaseVersionProbe(blueprint), "2.109.1");
  } finally {
    cleanupRadarCliWorkspace(workspace);
  }
});

await check("Supabase-CLI-Schreibpfade bleiben ohne HOME-Umlenkung im validierten Radar-Tempzaun", () => {
  const workspace = createRadarCliWorkspace();
  try {
    const fakeCli = `${workspace.runDir}/mock-supabase`;
    fs.writeFileSync(fakeCli, "mock-only", { mode: 0o700 });
    const env = buildRadarSupabaseCliEnvironment(workspace, {
      cliDirectory: workspace.runDir,
    });
    const forbiddenHome = ["HOME", "home", "CODEX_HOME"];
    assert.equal(forbiddenHome.some((name) => Object.hasOwn(env, name)), false);
    assert.equal(env.SUPABASE_TELEMETRY_DISABLED, "1");
    assert.equal(env.DO_NOT_TRACK, "1");
    assert.equal(env.SUPABASE_NO_KEYRING, "1");
    assert.deepEqual(env.PATH.split(delimiter), [
      workspace.runDir,
      resolve(dirname(process.execPath)),
    ]);
    for (const name of ["SUPABASE_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TMPDIR"]) {
      assert.equal(env[name].startsWith(`${workspace.runDir}/`), true);
    }

    const blueprint = buildRadarSupabaseVersionBlueprint({ workspace, executable: fakeCli });
    let launches = 0;
    const version = runRadarSupabaseVersionProbe(blueprint, {
      spawn(executable, argv, options) {
        launches += 1;
        assert.equal(executable, fakeCli);
        assert.deepEqual(argv, ["--version"]);
        assert.equal(options.shell, false);
        assert.equal(options.cwd, REPO_ROOT);
        validateRadarSupabaseCliEnvironment(options.env, workspace);
        return { status: 0, stdout: Buffer.from("2.109.1\n"), stderr: Buffer.alloc(0) };
      },
    });
    assert.equal(version, "2.109.1");
    assert.equal(launches, 1);

    let invalidLaunches = 0;
    const invalid = {
      ...blueprint,
      env: { ...blueprint.env, XDG_CACHE_HOME: "/Users/max/.cache" },
    };
    assert.throws(
      () => runRadarSupabaseVersionProbe(invalid, {
        spawn() { invalidLaunches += 1; },
      }),
      (error) => error instanceof RadarRemoteStartStop
        && error.code === "CLI_WRITE_PATH_OUTSIDE_TMP",
    );
    assert.equal(invalidLaunches, 0);

    let missingRuntimeLaunches = 0;
    const missingRuntime = {
      ...blueprint,
      env: { ...blueprint.env, PATH: workspace.runDir },
    };
    assert.throws(
      () => runRadarSupabaseVersionProbe(missingRuntime, {
        spawn() { missingRuntimeLaunches += 1; },
      }),
      (error) => error instanceof RadarRemoteStartStop
        && error.code === "CLI_RUNTIME_PATH_INVALID",
    );
    assert.equal(missingRuntimeLaunches, 0);

    let extraPathLaunches = 0;
    const extraPath = {
      ...blueprint,
      env: { ...blueprint.env, PATH: `${blueprint.env.PATH}${delimiter}/usr/bin` },
    };
    assert.throws(
      () => runRadarSupabaseVersionProbe(extraPath, {
        spawn() { extraPathLaunches += 1; },
      }),
      (error) => error instanceof RadarRemoteStartStop
        && error.code === "CLI_RUNTIME_PATH_INVALID",
    );
    assert.equal(extraPathLaunches, 0);

    assert.throws(
      () => runRadarSupabaseVersionProbe(blueprint, {
        spawn() {
          return { status: 0, stdout: Buffer.from("2.109.0\n"), stderr: Buffer.alloc(0) };
        },
      }),
      (error) => error instanceof RadarRemoteStartStop
        && error.code === "SUPABASE_VERSION_MISMATCH",
    );
  } finally {
    cleanupRadarCliWorkspace(workspace);
  }
});

await check("Lokale Gates laufen seriell vor jedem Credential-/Remote-Effekt", async () => {
  const effects = [];
  const credentialReads = [];
  const run = createRadarRemotePreflightOnce({
    async localClosureGate() { effects.push("local-closure"); return { sha256: "mock" }; },
    async localWorkspaceGate() { effects.push("local-workspace"); return { runDir: "mock" }; },
    async localCliGate() { effects.push("local-cli"); },
    async readCredential(ref) {
      effects.push(`credential:${ref.account}`);
      credentialReads.push(ref);
      return `synthetic-${ref.account}`;
    },
    async remoteRead() {
      effects.push("remote-read");
      return { anthropicApiKey: "PRESENT" };
    },
    async writeMissingProviderSecret() { effects.push("provider-write"); },
  });
  const result = await run();
  assert.deepEqual(effects, [
    "local-closure",
    "local-workspace",
    "local-cli",
    `credential:${SUPABASE_INFRA_KEYCHAIN.accounts[0]}`,
    `credential:${SUPABASE_INFRA_KEYCHAIN.accounts[1]}`,
    "remote-read",
  ]);
  assert.deepEqual(credentialReads, SUPABASE_INFRA_KEYCHAIN.accounts.map((account) => ({
    service: SUPABASE_INFRA_KEYCHAIN.service,
    account,
  })));
  assert.equal(result.providerSecretAction, "untouched");
  assert.deepEqual(result.trace, [
    "local-closure", "local-workspace", "local-cli", "supabase-credentials", "remote-read",
  ]);
});

await check("Anthropic-Key wird nur nach exakt allowlistetem Remote-MISSING einmal gelesen und geschrieben", async () => {
  const effects = [];
  let providerReads = 0;
  let providerWrites = 0;
  const run = createRadarRemotePreflightOnce({
    async localClosureGate() { effects.push("local-closure"); return {}; },
    async localWorkspaceGate() { effects.push("local-workspace"); return {}; },
    async localCliGate() { effects.push("local-cli"); },
    async readCredential(ref) {
      effects.push(`credential:${ref.account}`);
      if (ref.service === ANTHROPIC_PROVIDER_KEYCHAIN.service) providerReads += 1;
      return `synthetic-${ref.account}`;
    },
    async remoteRead() { effects.push("remote-read:MISSING"); return { anthropicApiKey: "MISSING" }; },
    async writeMissingProviderSecret(input) {
      effects.push("provider-write");
      providerWrites += 1;
      assert.equal(input.anthropicApiKey, `synthetic-${ANTHROPIC_PROVIDER_KEYCHAIN.account}`);
    },
  });
  const result = await run();
  assert.equal(providerReads, 1);
  assert.equal(providerWrites, 1);
  assert.ok(effects.indexOf("remote-read:MISSING")
    < effects.indexOf(`credential:${ANTHROPIC_PROVIDER_KEYCHAIN.account}`));
  assert.equal(result.providerSecretAction, "written-after-remote-missing");
});

await check("Lokaler Fehler stoppt vor Keychain/Netzwerk und verbraucht den one-shot Lauf", async () => {
  let workspaceGates = 0;
  let cliGates = 0;
  let credentialReads = 0;
  let remoteReads = 0;
  let providerWrites = 0;
  const run = createRadarRemotePreflightOnce({
    async localClosureGate() { throw new Error("synthetic-local-failure"); },
    async localWorkspaceGate() { workspaceGates += 1; },
    async localCliGate() { cliGates += 1; },
    async readCredential() { credentialReads += 1; },
    async remoteRead() { remoteReads += 1; },
    async writeMissingProviderSecret() { providerWrites += 1; },
  });
  await assert.rejects(run(), (error) => error instanceof RadarRemoteStartStop
    && error.code === "STOP_LOCAL_CLOSURE");
  await assert.rejects(run(), (error) => error instanceof RadarRemoteStartStop
    && error.code === "AUTONOMIE_STOPP_NO_RETRY");
  assert.deepEqual({ workspaceGates, cliGates, credentialReads, remoteReads, providerWrites }, {
    workspaceGates: 0,
    cliGates: 0,
    credentialReads: 0,
    remoteReads: 0,
    providerWrites: 0,
  });
});

await check("Remote-Fehler wird nicht automatisch wiederholt und beruehrt keinen Provider-Key", async () => {
  let remoteReads = 0;
  let providerReads = 0;
  const run = createRadarRemotePreflightOnce({
    async localClosureGate() { return {}; },
    async localWorkspaceGate() { return {}; },
    async localCliGate() {},
    async readCredential(ref) {
      if (ref.service === ANTHROPIC_PROVIDER_KEYCHAIN.service) providerReads += 1;
      return "synthetic";
    },
    async remoteRead() { remoteReads += 1; throw new Error("synthetic-remote-failure"); },
    async writeMissingProviderSecret() {},
  });
  await assert.rejects(run(), (error) => error instanceof RadarRemoteStartStop
    && error.code === "STOP_REMOTE_READ");
  await assert.rejects(run(), (error) => error instanceof RadarRemoteStartStop
    && error.code === "AUTONOMIE_STOPP_NO_RETRY");
  assert.equal(remoteReads, 1);
  assert.equal(providerReads, 0);
});

const migration = fs.readFileSync(
  "./supabase/migrations/20260817190000_radar_websearch_mvp_package_b.sql",
  "utf8",
);
const config = fs.readFileSync("./supabase/config.toml", "utf8");
const functionIndex = fs.readFileSync("./supabase/functions/radar-websearch-task/index.ts", "utf8");
const adapterSource = fs.readFileSync("./supabase/functions/radar-websearch-task/anthropicAdapter.js", "utf8");
const dailyMigration = fs.readFileSync(
  "./supabase/migrations/20260825120000_radar_daily_schedule.sql",
  "utf8",
);
const sixDayMigration = fs.readFileSync(
  "./supabase/migrations/20260830120000_radar_six_day_schedule.sql",
  "utf8",
);
const dailyWorkflow = fs.readFileSync("./.github/workflows/radar-daily.yml", "utf8");
const liveSource = fs.readFileSync("./tools/radar_websearch_live.mjs", "utf8");
const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));

await check("Additive Migration konfiguriert default-off und bindet alle serverseitigen Gates atomar", () => {
  assert.match(migration, /jsonb_set\(wert, '\{radar-websearch\}', to_jsonb\('klein'::text\), true\)/);
  assert.match(migration, /jsonb_set\(wert, '\{radar-websearch\}', to_jsonb\(1200\), true\)/);
  assert.match(migration, /websearch_usd_cent_pro_request[\s\S]+?'1'::jsonb/);
  assert.match(migration, /radar_aktiv[\s\S]+?radar_provider_aktiv/);
  assert.match(migration, /c\.radar_pilot and c\.radar_review/);
  assert.match(migration, /kd_private_provider_allowed\('anthropic'\)/);
  assert.match(migration, /p_search_requests is distinct from 1/);
  assert.match(migration, /p_reservierung < v_fee or p_reservierung > v_task_cap/);
  assert.match(migration, /return public\.kd_ai_auftrag_starten\(/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /update\s+public\.kd_radar_settings|update\s+public\.kd_private_settings|cron\.|pg_cron/i);
});

await check("Function-Konfiguration erzwingt JWT und Produktcode enthält keine Rohlogs", () => {
  assert.match(config, /\[functions\.radar-websearch-task\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(functionIndex, /kd_radar_websearch_auftrag_starten/);
  assert.match(functionIndex, /kd_private_provider_allowed/);
  assert.equal((adapterSource.match(/\bfetchImpl\(/g) || []).length, 1);
  assert.doesNotMatch(adapterSource, /console\.(?:log|error)|JSON\.stringify\([^)]*providerBody/);
  assert.doesNotMatch(functionIndex, /console\.(?:log|error)/);
  assert.match(functionIndex, /PROVIDER_DIAGNOSTIC_ENV/);
  assert.match(functionIndex, /takeProviderRawResponse/);
  assert.match(functionIndex, /access\?\.role === "owner"/);
});

await check("Daily-Migration claimt Konto/Ziel pro Wiener Tag atomar und retryfrei", () => {
  assert.match(dailyMigration, /create table public\.kd_radar_daily_runs/);
  assert.match(dailyMigration, /primary key \(account_id, target_id, vienna_day\)/);
  assert.match(dailyMigration, /at time zone 'Europe\/Vienna'/);
  assert.match(dailyMigration, /safe_status\s+text\s+not null default 'attempt_consumed'/);
  assert.match(dailyMigration, /lease_expires_at[\s\S]*?fence_token/);
  assert.match(dailyMigration, /not exists \([\s\S]*?run\.vienna_day = v_today/);
  assert.match(dailyMigration, /for update of subscription skip locked/);
  assert.match(dailyMigration, /on conflict \(account_id, target_id, vienna_day\) do nothing/);
  assert.match(dailyMigration, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(dailyMigration, /kd_radar_daily_assert_lease/);
  assert.match(dailyMigration, /kd_radar_daily_finish/);
  assert.match(dailyMigration, /p_safe_status is null or p_safe_status not in \(/);
  assert.doesNotMatch(dailyMigration, /pg_cron|cron\.|http_post|net\.http/i);
});

await check("Additive 144h-Migration nutzt denselben Claim generisch und setzt die Folgefaelligkeit am Abschluss", () => {
  assert.match(sixDayMigration, /^begin;$/mu);
  assert.match(sixDayMigration, /^commit;$/mu);
  assert.match(sixDayMigration, /add column next_check_at timestamptz not null default clock_timestamp\(\)/u);
  assert.match(sixDayMigration, /subscription\.next_check_at <= v_now/u);
  assert.match(sixDayMigration, /order by subscription\.next_check_at/u);
  assert.match(sixDayMigration, /for update of subscription skip locked/u);
  assert.match(sixDayMigration, /active_run\.worker_status = 'leased'[\s\S]*active_run\.lease_expires_at >= v_now/u);
  assert.match(sixDayMigration, /on conflict \(account_id, target_id, vienna_day\) do nothing/u);
  assert.equal((sixDayMigration.match(/next_check_at = v_now \+ interval '144 hours'/gu) || []).length, 2);
  assert.match(sixDayMigration, /next_check_at = expired\.terminal_at \+ interval '144 hours'/u);
  assert.match(sixDayMigration, /create or replace function public\.kd_radar_daily_claim\(\)/u);
  assert.match(sixDayMigration, /create or replace function public\.kd_radar_daily_finish\(/u);
  assert.doesNotMatch(sixDayMigration, /pg_cron|cron\.|http_post|net\.http|attempt_count\s*\+|--retry|Nicolas Cage|Star Wars|Starfighter/iu);
  const plus144 = (instant) => new Date(new Date(instant).getTime() + 144 * 60 * 60 * 1000).toISOString();
  assert.equal(plus144("2026-08-30T04:37:00.000Z"), "2026-09-05T04:37:00.000Z");
});

await check("Daily-Aktivierung stoppt bei Settings-Drift und behaelt alle bestehenden Kostenzaeune", () => {
  assert.match(dailyMigration, /v_radar_aktiv is distinct from true/);
  assert.match(dailyMigration, /v_provider_aktiv is distinct from true/);
  assert.match(dailyMigration, /v_scheduler_aktiv is distinct from false/);
  assert.match(dailyMigration, /set radar_scheduler_aktiv = true/);
  assert.match(dailyMigration, /radar_aktiv is true[\s\S]*?radar_provider_aktiv is true[\s\S]*?radar_scheduler_aktiv is false/);
  assert.doesNotMatch(dailyMigration, /kd_ai_limits|task_max_reservierung|anbieter_request_max/i);
  assert.match(functionIndex, /await assertDailyLease\(\);[\s\S]*?kd_radar_websearch_auftrag_starten/);
  assert.match(functionIndex, /kd_radar_websearch_auftrag_starten/);
  assert.match(migration, /return public\.kd_ai_auftrag_starten\(/);
});

await check("Scheduled-Function ist bodylos, service-role-only und antwortet ohne Konto- oder Zielpayload", () => {
  assert.match(functionIndex, /const RADAR_REFRESH_HEADER = "x-kd-radar-refresh"/);
  assert.match(functionIndex, /const SCHEDULED_REFRESH_VALUE = "scheduled-v1"/);
  assert.match(functionIndex, /scheduledMode && \(req\.body !== null/);
  assert.match(functionIndex, /req\.headers\.get\("apikey"\) !== serviceKey \|\| token !== serviceKey/);
  assert.match(functionIndex, /admin\.rpc\("kd_radar_daily_claim"\)/);
  assert.match(functionIndex, /claim\?\.claim !== false \|\| !\["idle", "disabled"\]\.includes\(claim\?\.status\)/);
  assert.match(functionIndex, /claim\?\.claim !== false[\s\S]*?status: "failed" \}, 500/);
  assert.match(functionIndex, /status: 204/);
  assert.match(functionIndex, /admin\.rpc\("kd_radar_daily_assert_lease"/);
  assert.match(functionIndex, /admin\.rpc\("kd_radar_daily_finish"/);
  assert.match(functionIndex, /json\(\{ ok: true, status: "processed" \}, 200, origin\)/);
  assert.doesNotMatch(functionIndex, /console\.(?:log|error)/);
});

await check("Daily-Workflow laeuft nur per Zeitplan, seriell hoechstens zehnmal und loggt keine Antwort", () => {
  assert.deepEqual(
    [...dailyWorkflow.matchAll(/cron:\s*["']([^"']+)["']/g)].map((match) => match[1]),
    ["37 4 * * *"],
  );
  assert.doesNotMatch(dailyWorkflow, /workflow_dispatch|push:|pull_request:/);
  assert.equal((dailyWorkflow.match(/^\s*curl\b/gm) || []).length, 1);
  assert.match(dailyWorkflow, /for claim_number in \$\(seq 1 10\)/);
  assert.match(dailyWorkflow, /--request POST/);
  assert.match(dailyWorkflow, /--connect-timeout 10/);
  assert.match(dailyWorkflow, /--max-time 150/);
  assert.match(dailyWorkflow, /--output \/dev\/null/);
  assert.match(dailyWorkflow, /x-kd-radar-refresh: scheduled-v1/);
  assert.match(dailyWorkflow, /if \[ "\$http_status" = "204" \]; then[\s\S]*?exit 0/);
  assert.doesNotMatch(dailyWorkflow, /--retry|--location|response_file|JSON\.parse|\bcat\b/);
  assert.doesNotMatch(dailyWorkflow, /targetId|target_id|accountId|account_id|console\.|set -x|printenv/);
  const shell = (dailyWorkflow.match(/\n        run: \|\n([\s\S]*)$/)?.[1] || "")
    .replace(/^          /gm, "");
  assert.ok(shell);
  assert.equal(spawnSync("bash", ["-n"], { input: shell }).status, 0);
});

await check("Einziger freigegebener Einstieg ist das vorhandene Live-npm-Skript mit engem Flag", () => {
  assert.equal(packageJson.scripts["test:ai:live"], "node tools/keychain_runner.mjs ai-live");
  assert.match(liveSource, /npm run test:ai:live -- --radar-websearch-once/);
  assert.match(liveSource, /maxAnbieterRequests:\s*1/);
  assert.doesNotMatch(liveSource, /ai_smoke|anbieter-modelle|echo-struct/);
});

console.log(`${checks} Radar-Websearch-Paket-B-Checks bestanden.`);
