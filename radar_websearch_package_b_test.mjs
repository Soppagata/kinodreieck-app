/* Paket B: ausschließlich lokale Mocks. Kein Provider-, Supabase- oder
   sonstiger Netzwerkzugriff. */
import assert from "node:assert/strict";
import fs from "node:fs";
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
import { runRadarWebsearchOnce } from "./tools/radar_websearch_live.mjs";
import { RADAR_WEBSEARCH_ONCE_ENV } from "./tools/keychain_runner.mjs";

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
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.reserveCalls.length, 1);
  assert.equal(harness.settleCalls.length, 1);
  assert.equal(harness.settleCalls[0].status, "fertig");
  assert.ok(harness.reserveCalls[0].reservationUsdCent > RADAR_WEBSEARCH_FEE_USD_CENT);
  assert.ok(harness.settleCalls[0].costUsdCent > RADAR_WEBSEARCH_FEE_USD_CENT);

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
    const evaluated = evaluateRadarWebsearchResponse(envelope, target, sources);
    assert.equal(evaluated.status, status);
    assert.equal(harness.fetchCalls.length, 1);
    assert.equal(harness.settleCalls[0].status, "fertig");
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

await check("Toolfehler und pause_turn sind terminal und starten niemals einen Folgefetch", async () => {
  const tool = adapterHarness({ providerBody: providerMessage({ toolError: true }) });
  await expectProviderError(tool.adapter.search(target), "provider-tool-error");
  assert.equal(tool.fetchCalls.length, 1);
  assert.equal(tool.settleCalls.length, 1);

  const paused = adapterHarness({ providerBody: providerMessage({ stopReason: "pause_turn" }) });
  await expectProviderError(paused.adapter.search(target), "provider-stop-reason-invalid");
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

await check("Mehr als sechs Resultate und eine fremde Citation werden vor dem Produktvalidator blockiert", async () => {
  const tooManyUrls = Array.from({ length: 7 }, (_, index) => `https://news-a.example/${index}`);
  const tooMany = adapterHarness({
    providerBody: providerMessage({ resultUrls: tooManyUrls, citationUrls: tooManyUrls }),
  });
  await expectProviderError(tooMany.adapter.search(target), "provider-result-count-invalid");
  assert.equal(tooMany.fetchCalls.length, 1);

  const foreign = adapterHarness({
    providerBody: providerMessage({
      citationUrls: [evidence(sources[0]).url, "https://foreign.example/start"],
    }),
  });
  await expectProviderError(foreign.adapter.search(target), "provider-citation-invalid");
  assert.equal(foreign.fetchCalls.length, 1);
});

await check("Radar-, Provider-, Scheduler-, Allowlist- und lokale Kostengates stoppen vor Reservierung und Fetch", async () => {
  const gates = [
    { radarEnabled: false },
    { radarProviderEnabled: false },
    { radarSchedulerEnabled: true },
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

const migration = fs.readFileSync(
  "./supabase/migrations/20260817190000_radar_websearch_mvp_package_b.sql",
  "utf8",
);
const config = fs.readFileSync("./supabase/config.toml", "utf8");
const functionIndex = fs.readFileSync("./supabase/functions/radar-websearch-task/index.ts", "utf8");
const adapterSource = fs.readFileSync("./supabase/functions/radar-websearch-task/anthropicAdapter.js", "utf8");
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
});

await check("Einziger freigegebener Einstieg ist das vorhandene Live-npm-Skript mit engem Flag", () => {
  assert.equal(packageJson.scripts["test:ai:live"], "node tools/keychain_runner.mjs ai-live");
  assert.match(liveSource, /npm run test:ai:live -- --radar-websearch-once/);
  assert.match(liveSource, /maxAnbieterRequests:\s*1/);
  assert.doesNotMatch(liveSource, /ai_smoke|anbieter-modelle|echo-struct/);
});

console.log(`${checks} Radar-Websearch-Paket-B-Checks bestanden.`);
