import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAnthropicRadarWebsearchAdapter } from './supabase/functions/radar-websearch-task/anthropicAdapter.js';
import { runRadarWebsearchCheck } from './supabase/functions/radar-websearch-task/runner.js';
import { isProviderReceipt } from './supabase/functions/_shared/providerReceipt.js';
import { bewerteRadarFreitextLiveReadback, erstelleRadarFreitextLiveSzenario } from './tools/radar_freitext_live_contract.mjs';
import { erstelleAnbieterPfadBelege, providerReceiptBelegAusAntwort } from './tools/ai_smoke_contract.mjs';

// All external effects are mocked. Never start a live entry point.
globalThis.fetch = async () => { throw new Error('Network forbidden by validator'); };
const scenario = erstelleRadarFreitextLiveSzenario();
const now = '2026-09-17T10:00:00.000Z';
const request = { kind: 'text', targetId: scenario.targetId, targetText: scenario.targetText,
  region: 'AT', scopes: ['cinema', 'streaming', 'series_start', 'season_start'] };
const setup = { radarEnabled: true, radarProviderEnabled: true, radarSchedulerEnabled: false,
  providerAllowed: true, modelAlias: 'klein', model: 'claude-haiku-4-5', maxTokens: 2400,
  taskCapUsdCent: 20, searchFeeUsdCent: 1, globalRequestCapUsdCent: 500, timeoutMs: 1000,
  inputPriceUsdCentPerMtok: 100, outputPriceUsdCentPerMtok: 500, sourceRegistry: [] };
const feed = (after) => ({ format: 'kd-radar-pilot-feed-v2', revision: after ? 1 : 0,
  checksum: after ? 'a'.repeat(64) : null, reconciledAt: now,
  subscriptions: after ? [{ targetId: scenario.targetId, targetType: 'text', title: scenario.targetText,
    region: 'AT', scope: 'all', status: 'active', updatedAt: now }] : [],
  events: [], receipts: [], operationAcks: [], radarReview: true, personResults: [] });
const results = [];
for (const searches of [0, 1, 2, 3, 4, 5]) {
  const calls = { fetch: 0, reserve: [], settle: [], maxUses: null };
  const providerBody = { id: 'msg_validator', type: 'message', role: 'assistant',
    model: setup.model, stop_reason: 'end_turn',
    content: [...Array.from({ length: searches }, (_, i) => [
      { type: 'server_tool_use', id: `use_${i}`, name: 'web_search', input: { query: scenario.targetText } },
      { type: 'web_search_tool_result', tool_use_id: `use_${i}`, content: [] },
    ]).flat(), { type: 'text', text: JSON.stringify({ status: 'insufficient_evidence', candidates: [] }) }],
    usage: { input_tokens: 100, output_tokens: 50, server_tool_use: { web_search_requests: searches } } };
  const adapter = createAnthropicRadarWebsearchAdapter({ apiKey: 'mock-only',
    loadSetup: async () => setup, now: () => now, operationId: () => 'validator-operation',
    reserveCost: async (value) => { calls.reserve.push(value); return { ok: true, logId: 1 }; },
    settleCost: async (value) => { calls.settle.push(value); },
    fetchImpl: async (_url, options) => { calls.fetch++; calls.maxUses = JSON.parse(options.body).tools[0].max_uses;
      return new Response(JSON.stringify(providerBody), { status: 200 }); },
  });
  const result = await runRadarWebsearchCheck({ accountId: 'validator-account',
    targetId: scenario.targetId, targetText: scenario.targetText, adapter,
    repository: { loadAuthorizedTarget: async () => request, resolveSources: async () => [],
      upsertConfirmedEvent: async () => { throw new Error('Unexpected event write'); }, loadFeed: async () => feed(true) } });
  const telemetry = adapter.telemetry();
  const body = { ok: true, ...result, ...telemetry };
  const readback = bewerteRadarFreitextLiveReadback({ httpStatus: 200, body,
    feedVorher: feed(false), feedNachher: feed(true), szenario: scenario });
  assert.equal(calls.fetch, 1);
  assert.equal(calls.maxUses, 4);
  assert.equal(calls.reserve[0].searchRequests, 4);
  assert.equal(calls.settle.length, 1);
  if (searches >= 1 && searches <= 4) {
    assert.equal(result.status, 'insufficient_evidence');
    assert.equal(isProviderReceipt(result.providerReceipt), true);
    assert.equal(telemetry.phaseCode, 'provider-complete');
    assert.equal(telemetry.providerRequests, 1);
    assert.equal(telemetry.searchRequests, searches);
    const proofLedger = erstelleAnbieterPfadBelege(['radar-websearch-task'], { requireProviderReceipt: true });
    proofLedger.registriere('radar-websearch-task');
    const proof = proofLedger.erfasseProviderReceipt('radar-websearch-task',
      providerReceiptBelegAusAntwort('radar-websearch-task', body, telemetry.costUsdCent));
    assert.equal(proof.providerProof, 'proven');
    assert.equal(readback.ok, true);
    assert.deepEqual(readback.errors, []);
    const wrongProviderCount = bewerteRadarFreitextLiveReadback({ httpStatus: 200,
      body: { ...body, providerRequests: 2 }, feedVorher: feed(false), feedNachher: feed(true) });
    assert.equal(wrongProviderCount.ok, false);
  } else {
    assert.equal(result.status, 'provider_error');
    assert.equal(calls.settle[0].errorClass, 'provider-usage-invalid');
    assert.equal(readback.ok, false);
  }
  results.push({ searches, adapterResult: result.status, providerReceiptValid: isProviderReceipt(result.providerReceipt),
    providerRequests: telemetry.providerRequests, phaseCode: telemetry.phaseCode,
    readbackOk: readback.ok, readbackErrors: readback.errors, mockFetches: calls.fetch,
    requestedMaxUses: calls.maxUses, settlementStatus: calls.settle[0].status });
}

const validBody = { ok: true, status: 'insufficient_evidence', writes: 0,
  providerRequests: 1, searchRequests: 3, phaseCode: 'provider-complete',
  responseMode: 'structured', displayText: null, warnings: [] };
const evaluate = (body, after = feed(true)) => bewerteRadarFreitextLiveReadback({
  httpStatus: 200, body, feedVorher: feed(false), feedNachher: after });
for (const count of [0, 5, -1, 1.5, '3', null, undefined, NaN]) {
  assert.ok(evaluate({ ...validBody, searchRequests: count }).errors.includes('function-request-count-invalid'));
}
for (const count of [0, 2, -1, 1.5, '1', null, undefined]) {
  assert.ok(evaluate({ ...validBody, providerRequests: count }).errors.includes('function-request-count-invalid'));
}
assert.equal(evaluate({ ...validBody, phaseCode: 'provider-started' }).ok, false);
assert.equal(evaluate({ ...validBody, displayText: 'invalid structured presentation' }).ok, false);
assert.equal(evaluate(validBody, { invalid: true }).ok, false);
assert.equal(evaluate({ ...validBody, status: 'confirmed', writes: 1 }).ok, false);
const ledger = erstelleAnbieterPfadBelege(['radar-websearch-task'], { requireProviderReceipt: true });
ledger.registriere('radar-websearch-task');
assert.notEqual(ledger.erfasseProviderReceipt('radar-websearch-task',
  providerReceiptBelegAusAntwort('radar-websearch-task', validBody, 1)).providerProof, 'proven');
const smoke = readFileSync(new URL('./tools/ai_smoke.mjs', import.meta.url), 'utf8');
assert.match(smoke, /Radar-Freitext liefert einen Providerrequest mit 1 bis 4 Websuchen/);
assert.match(smoke, /const radarOk = p25ProviderBelegt/);
console.log('review49_p03_radar_test: 6 adapter/runner/readback cases, 15 invalid counters, phase/presentation/feed/result/receipt guards passed; no network.');
