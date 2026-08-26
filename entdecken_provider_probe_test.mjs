/* Entdecken-Providerprobe: reine Mocks, kein Netz, kein Provider, keine DB. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  buildEntdeckenProviderProbeBody,
  createAnthropicEntdeckenProviderProbe,
  ENTDECKEN_PROVIDER_PROBE_HEADER,
  ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE,
  ENTDECKEN_PROVIDER_PROBE_MAX_TOKENS,
  ENTDECKEN_PROVIDER_PROBE_OPERATION_ID,
  ENTDECKEN_PROVIDER_PROBE_TASK,
  estimateEntdeckenProviderProbeReservation,
  validateEntdeckenProviderProbePublicResult,
  validateEntdeckenProviderProbeRawEvidence,
} from "./supabase/functions/entdecken-daily-task/providerProbe.js";
import { PROVIDER_DIAGNOSTIC_FIELD } from "./supabase/functions/_shared/providerDiagnostic.js";
import { ENTDECKEN_PROVIDER_PROBE_ONCE_ENV } from "./tools/keychain_runner.mjs";
import {
  createEntdeckenProviderProbeRawLifecycle,
  EntdeckenProviderProbeProductStopp,
  runEntdeckenProviderProbeOnce,
} from "./tools/entdecken_provider_probe_live.mjs";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const setup = Object.freeze({
  providerAllowed: true,
  modelAlias: "klein",
  model: "claude-haiku-4-5-20251001",
  inputPriceUsdCentPerMtok: 100,
  outputPriceUsdCentPerMtok: 500,
  taskCapUsdCent: 5,
  globalRequestCapUsdCent: 500,
  timeoutMs: 30_000,
});

const liveEnv = Object.freeze({
  [ENTDECKEN_PROVIDER_PROBE_ONCE_ENV]: "keychain-budget-guard-v1",
  KD_SB_URL: "https://probe-project.supabase.co",
  KD_SB_ANON: "x",
  KD_TESTA_USER: "x",
  KD_TESTA_PASS: "x",
  KD_MAIL_DOMAIN: "login.kinodreieck.at",
  KD_AI_FUNKTION: "ai-task",
  KD_ORIGIN: "https://staging.kinodreieck.at",
  KD_AI_OWNER_APPROVED_SERVER_BUDGET: "1",
});

function liveRunnerHarness({ deltaUsdCent = 0, functionResponse }) {
  let healthReads = 0;
  let functionRequests = 0;
  const output = [];
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    if (url.includes("/auth/v1/token")) {
      return new Response(JSON.stringify({ access_token: "x" }), { status: 200 });
    }
    if (url.includes("/rest/v1/kd_account_access")) {
      return new Response(JSON.stringify([{ role: "owner", active: true, personal_ai: true }]), { status: 200 });
    }
    if (url.endsWith("/functions/v1/ai-task")) {
      healthReads += 1;
      const spent = healthReads < 3 ? 10 : 10 + deltaUsdCent;
      return new Response(JSON.stringify({
        ok: true,
        betrieb: {
          stand: { monatVerbrauchtUsdCent: spent, budgetErschoepft: false },
          monatsbudgetUsdCent: 1000,
          anbieterRequestMaxUsdCent: 500,
          anbieterRequestOwnerMaxUsdCent: 500,
          anbieterRequestTimeoutMs: 30_000,
          anbieterRequestTimeoutOwnerMaxMs: 135_000,
        },
      }), { status: 200 });
    }
    if (url.endsWith("/functions/v1/entdecken-daily-task")) {
      functionRequests += 1;
      return await functionResponse(options);
    }
    throw new Error("unexpected mock url");
  };
  return {
    output,
    reads: () => ({ functionRequests, healthReads }),
    run: () => runEntdeckenProviderProbeOnce({
      env: liveEnv,
      fetchImpl,
      ausgabe: (line) => output.push(String(line)),
    }),
  };
}

function harness(fetchImpl) {
  let requests = 0;
  let reservation = null;
  let settlement = null;
  const probe = createAnthropicEntdeckenProviderProbe({
    apiKey: "test-only-secret",
    fetchImpl: async (...args) => {
      requests += 1;
      return await fetchImpl(...args);
    },
    loadSetup: async () => setup,
    operationId: () => "11111111-1111-4111-8111-111111111111",
    reserveCost: async (value) => {
      reservation = value;
      return { ok: true, logId: 71 };
    },
    settleCost: async (value) => { settlement = value; },
    readSettledCost: async ({ logId, operationId }) => ({
      logId,
      operationId,
      task: ENTDECKEN_PROVIDER_PROBE_TASK,
      status: settlement.status,
      costUsdCent: settlement.costUsdCent ?? reservation.reservationUsdCent,
    }),
  });
  return { probe, reads: () => ({ requests, reservation, settlement }) };
}

await check("Probevertrag ist genau ein minimales Messages-Body ohne Tool oder Websearch", () => {
  const body = buildEntdeckenProviderProbeBody(setup.model);
  assert.deepEqual(body, {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1,
    messages: [{ role: "user", content: "Reply with OK." }],
  });
  assert.equal(ENTDECKEN_PROVIDER_PROBE_MAX_TOKENS, 1);
  assert.equal(ENTDECKEN_PROVIDER_PROBE_HEADER, "x-kd-entdecken-provider-probe");
  assert.equal(ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE, "owner-minimal-v1");
  assert.match(ENTDECKEN_PROVIDER_PROBE_OPERATION_ID, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(body), /tools|web_search|profile|account|feed|radar/i);
  const reservation = estimateEntdeckenProviderProbeReservation(setup);
  assert.ok(reservation > 0 && reservation < 1 && reservation <= setup.taskCapUsdCent);
  assert.throws(
    () => estimateEntdeckenProviderProbeReservation({
      ...setup,
      inputPriceUsdCentPerMtok: 99,
    }),
    /probe-setup-invalid/,
  );
  assert.throws(
    () => estimateEntdeckenProviderProbeReservation({
      ...setup,
      outputPriceUsdCentPerMtok: 499,
    }),
    /probe-setup-invalid/,
  );
});

await check("Function-Probezweig liegt vor Claim und enthaelt keine Produktwrites", () => {
  const source = readFileSync("./supabase/functions/entdecken-daily-task/index.ts", "utf8");
  const start = source.indexOf("if (providerProbeHeader === ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE)");
  const end = source.indexOf("let claimContext", start);
  assert.ok(start > 0 && end > start);
  const branch = source.slice(start, end);
  assert.match(branch, /kd_ai_auftrag_starten/);
  assert.match(branch, /kd_ai_auftrag_beenden/);
  assert.doesNotMatch(branch, /kd_entdecken_weekly_refresh_claim/);
  assert.doesNotMatch(branch, /kd_entdecken_daily_(?:save|fail)/);
  assert.doesNotMatch(branch, /loadSources|saveFeed|markFailure|claimRefresh/);
  assert.match(source, /ENTDECKEN_PROVIDER_PROBE_HEADER.*Access-Control-Allow-Headers/s);
  const budgetMigration = readFileSync(
    "./supabase/migrations/20260726160000_etappe5_ki_unterbau.sql",
    "utf8",
  );
  assert.match(budgetMigration, /unique index[^;]+on public\.kd_ai_log \(account_id, vorgang_id\)/s);
  const probeConstruction = branch.slice(
    branch.indexOf("createAnthropicEntdeckenProviderProbe({"),
    branch.indexOf("async loadSetup()"),
  );
  assert.doesNotMatch(probeConstruction, /operationId\s*:/);
});

await check("HTTP 200 belegt Auth, Usage, Istkosten und nur Header-Praesenz", async () => {
  let sent = null;
  const rawBody = JSON.stringify({
    id: "msg_private",
    type: "message",
    model: setup.model,
    content: [{ type: "text", text: "PRIVATE PROVIDER TEXT" }],
    stop_reason: "max_tokens",
    usage: { input_tokens: 12, output_tokens: 1 },
  });
  const h = harness(async (_url, options) => {
    sent = options;
    return new Response(rawBody, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "anthropic-organization-id": "org_private",
        "anthropic-workspace-id": "wrkspc_private",
        "request-id": "req_private",
      },
    });
  });
  const outcome = await h.probe.run();
  const state = h.reads();
  assert.equal(state.requests, 1);
  assert.deepEqual(JSON.parse(sent.body), buildEntdeckenProviderProbeBody(setup.model));
  assert.equal(sent.redirect, "error");
  assert.equal(sent.headers["x-api-key"], "test-only-secret");
  assert.equal(outcome.safe.cause, "authenticated");
  assert.equal(outcome.safe.providerHttpStatus, 200);
  assert.equal(outcome.safe.providerErrorType, null);
  assert.equal(outcome.safe.usageKnown, true);
  assert.equal(outcome.safe.outputTokens, 1);
  assert.equal(outcome.safe.costKnown, true);
  assert.equal(outcome.safe.costStatus, "actual");
  assert.equal(outcome.safe.organizationHeaderPresent, true);
  assert.equal(outcome.safe.workspaceHeaderPresent, true);
  assert.equal(state.settlement.status, "fertig");
  assert.equal(state.settlement.errorClass, null);
  assert.equal(validateEntdeckenProviderProbeRawEvidence(outcome.rawResponse, outcome.safe), true);
  const visible = JSON.stringify(outcome.safe);
  for (const forbidden of ["PRIVATE PROVIDER TEXT", "msg_private", "req_private", "org_private", "wrkspc_private", "test-only-secret"]) {
    assert.doesNotMatch(visible, new RegExp(forbidden));
  }
  await assert.rejects(() => h.probe.run(), /probe-already-used/);
});

await check("HTTP 400 bleibt inhaltsfrei und trennt Error-Type von freiem Providertext", async () => {
  const rawBody = JSON.stringify({
    type: "error",
    error: {
      type: "invalid_request_error",
      message: "PRIVATE BILLING OR REQUEST DETAIL",
    },
    request_id: "req_private_400",
  });
  const h = harness(async () => new Response(rawBody, {
    status: 400,
    headers: {
      "content-type": "application/json",
      "anthropic-organization-id": "org_private",
      "anthropic-workspace-id": "wrkspc_private",
    },
  }));
  const outcome = await h.probe.run();
  const state = h.reads();
  assert.equal(state.requests, 1);
  assert.equal(outcome.safe.cause, "invalid_request_or_spend_limit");
  assert.equal(outcome.safe.providerHttpStatus, 400);
  assert.equal(outcome.safe.providerErrorType, "invalid_request_error");
  assert.equal(outcome.safe.usageKnown, false);
  assert.equal(outcome.safe.costKnown, false);
  assert.equal(outcome.safe.costStatus, "reserved");
  assert.equal(outcome.safe.costUsdCent, state.reservation.reservationUsdCent);
  assert.equal(state.settlement.status, "fehler");
  assert.equal(state.settlement.costUsdCent, null);
  assert.equal(validateEntdeckenProviderProbeRawEvidence(outcome.rawResponse, outcome.safe), true);
  assert.doesNotMatch(JSON.stringify(outcome.safe), /PRIVATE|req_private|message|request_id/i);
});

await check("200-Usage ueber dem festen Ein-Token-Vertrag bleibt fail-closed", async () => {
  const rawBody = JSON.stringify({
    type: "message",
    content: [{ type: "text", text: "PRIVATE OVERSIZED OUTPUT" }],
    usage: { input_tokens: 12, output_tokens: 2 },
  });
  const h = harness(async () => new Response(rawBody, { status: 200 }));
  const outcome = await h.probe.run();
  const state = h.reads();
  assert.equal(state.requests, 1);
  assert.equal(outcome.safe.cause, "response_contract_invalid");
  assert.equal(outcome.safe.usageKnown, false);
  assert.equal(outcome.safe.costKnown, false);
  assert.equal(outcome.safe.costStatus, "reserved");
  assert.equal(state.settlement.status, "fehler");
  assert.equal(validateEntdeckenProviderProbeRawEvidence(outcome.rawResponse, outcome.safe), false);
});

await check("Transportfehler bleibt ein einzelner Versuch ohne erfundenen HTTP-Beleg", async () => {
  const h = harness(async () => { throw new TypeError("PRIVATE NETWORK DETAIL"); });
  const outcome = await h.probe.run();
  const state = h.reads();
  assert.equal(state.requests, 1);
  assert.equal(outcome.rawResponse, null);
  assert.equal(outcome.safe.cause, "transport_failed");
  assert.equal(outcome.safe.providerHttpStatus, null);
  assert.equal(outcome.safe.providerErrorType, null);
  assert.equal(outcome.safe.usageKnown, false);
  assert.equal(outcome.safe.costStatus, "reserved");
  assert.equal(outcome.safe.organizationHeaderPresent, false);
  assert.equal(outcome.safe.workspaceHeaderPresent, false);
  assert.doesNotMatch(JSON.stringify(outcome.safe), /PRIVATE NETWORK DETAIL/);
});

await check("Oeffentlicher Ergebnisvalidator ist geschlossen und nimmt keine Zusatzfelder", () => {
  const valid = {
    cause: "authentication_rejected",
    costKnown: false,
    costStatus: "reserved",
    costUsdCent: 0.4101,
    organizationHeaderPresent: false,
    outputTokens: null,
    providerErrorType: "authentication_error",
    providerHttpStatus: 401,
    providerRequests: 1,
    usageKnown: false,
    workspaceHeaderPresent: false,
  };
  assert.ok(validateEntdeckenProviderProbePublicResult(valid));
  assert.equal(validateEntdeckenProviderProbePublicResult({ ...valid, message: "leak" }), null);
  assert.equal(validateEntdeckenProviderProbePublicResult({ ...valid, providerRequests: 2 }), null);
  assert.equal(validateEntdeckenProviderProbePublicResult({ ...valid, costStatus: "unknown" }), null);
});

await check("Exakter npm-Kindweg misst vorher/nachher, capturt privat und raeumt wieder auf", async () => {
  const rawBody = JSON.stringify({
    type: "message",
    model: setup.model,
    content: [{ type: "text", text: "PRIVATE LIVE MOCK TEXT" }],
    stop_reason: "max_tokens",
    usage: { input_tokens: 12, output_tokens: 1 },
  });
  const safe = {
    cause: "authenticated",
    costKnown: true,
    costStatus: "actual",
    costUsdCent: 0.0017,
    organizationHeaderPresent: true,
    outputTokens: 1,
    providerErrorType: null,
    providerHttpStatus: 200,
    providerRequests: 1,
    usageKnown: true,
    workspaceHeaderPresent: true,
  };
  const tempBefore = readdirSync(tmpdir()).filter((name) => name.startsWith("kinodreieck-provider-raw-")).sort();
  const calls = [];
  let healthReads = 0;
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, method: options.method, headers: options.headers });
    if (url.includes("/auth/v1/token")) {
      return new Response(JSON.stringify({ access_token: "owner-session-test" }), { status: 200 });
    }
    if (url.includes("/rest/v1/kd_account_access")) {
      return new Response(JSON.stringify([{ role: "owner", active: true, personal_ai: true }]), { status: 200 });
    }
    if (url.endsWith("/functions/v1/ai-task")) {
      healthReads += 1;
      const spent = healthReads < 3 ? 10 : 10.0017;
      return new Response(JSON.stringify({
        ok: true,
        betrieb: {
          stand: { monatVerbrauchtUsdCent: spent, budgetErschoepft: false },
          monatsbudgetUsdCent: 1000,
          anbieterRequestMaxUsdCent: 500,
          anbieterRequestOwnerMaxUsdCent: 500,
          anbieterRequestTimeoutMs: 30_000,
          anbieterRequestTimeoutOwnerMaxMs: 135_000,
        },
      }), { status: 200 });
    }
    if (url.endsWith("/functions/v1/entdecken-daily-task")) {
      assert.equal(options.redirect, "error");
      return new Response(JSON.stringify({
        ok: true,
        status: "provider_probe",
        probe: safe,
        [PROVIDER_DIAGNOSTIC_FIELD]: { rawResponse: rawBody },
      }), { status: 200 });
    }
    throw new Error("unexpected mock url");
  };
  const output = [];
  const result = await runEntdeckenProviderProbeOnce({
    env: {
      [ENTDECKEN_PROVIDER_PROBE_ONCE_ENV]: "keychain-budget-guard-v1",
      KD_SB_URL: "https://probe-project.supabase.co",
      KD_SB_ANON: "publishable-probe-test-1234567890",
      KD_TESTA_USER: "owner-test",
      KD_TESTA_PASS: "owner-password-test",
      KD_MAIL_DOMAIN: "login.kinodreieck.at",
      KD_AI_FUNKTION: "ai-task",
      KD_ORIGIN: "https://staging.kinodreieck.at",
      KD_AI_OWNER_APPROVED_SERVER_BUDGET: "1",
    },
    fetchImpl,
    ausgabe: (line) => output.push(String(line)),
  });
  const tempAfter = readdirSync(tmpdir()).filter((name) => name.startsWith("kinodreieck-provider-raw-")).sort();
  assert.equal(result.cause, "authenticated");
  assert.equal(calls.filter((call) => call.url.endsWith("/functions/v1/entdecken-daily-task")).length, 1);
  assert.equal(healthReads, 3);
  assert.deepEqual(tempAfter, tempBefore);
  assert.equal(output.length, 1);
  assert.match(output[0], /providerHttpStatus=200/);
  assert.match(output[0], /providerRequests=1 · productWrites=0/);
  assert.doesNotMatch(output[0], /PRIVATE|owner-session|owner-password|request-id/i);
});

await check("Geschlossenes 403-disabled mit exaktem Nulldelta ist providerfrei statt Budget unbekannt", async () => {
  const tempBefore = readdirSync(tmpdir()).filter((name) => name.startsWith("kinodreieck-provider-raw-")).sort();
  const h = liveRunnerHarness({
    functionResponse: async () => new Response(JSON.stringify({
      ok: false,
      status: "disabled",
      feed: null,
    }), { status: 403 }),
  });
  await assert.rejects(h.run(), (error) => (
    error instanceof EntdeckenProviderProbeProductStopp
      && error.exitCode === 1
      && error.code === "PROVIDER_PROBE_NOT_STARTED"
      && error.safe?.cause === "staging_prerequisite_rejected"
      && error.safe?.costStatus === "zero"
      && error.safe?.costUsdCent === 0
      && error.safe?.providerReached === false
      && error.safe?.providerRequests === 0
      && error.safe?.productWrites === 0
  ));
  const tempAfter = readdirSync(tmpdir()).filter((name) => name.startsWith("kinodreieck-provider-raw-")).sort();
  assert.deepEqual(h.reads(), { functionRequests: 1, healthReads: 3 });
  assert.deepEqual(tempAfter, tempBefore);
  assert.equal(h.output.length, 1);
  assert.match(h.output[0], /functionHttpStatus=403/);
  assert.match(h.output[0], /costStatus=zero · costUsdCent=0\.0000/);
  assert.match(h.output[0], /providerReached=false · providerRequests=0 · productWrites=0/);
  assert.doesNotMatch(h.output[0], /BUDGET_UNBEKANNT/);
});

await check("Sonstiges Raw-Missing bei exaktem Nulldelta bleibt Provenienz UNPROVEN", async () => {
  const h = liveRunnerHarness({
    functionResponse: async () => new Response(JSON.stringify({
      ok: false,
      status: "provider_probe_error",
      probe: null,
    }), { status: 503 }),
  });
  await assert.rejects(h.run(), (error) => (
    error instanceof EntdeckenProviderProbeProductStopp
      && error.exitCode === 1
      && error.code === "RAW_CAPTURE_MISSING"
      && error.safe?.cause === "provider_provenance_unproven"
      && error.safe?.costStatus === "zero"
      && error.safe?.providerReached === "unproven"
      && error.safe?.providerRequests === null
  ));
  assert.deepEqual(h.reads(), { functionRequests: 1, healthReads: 3 });
  assert.match(h.output[0], /cause=provider_provenance_unproven/);
  assert.doesNotMatch(h.output[0], /BUDGET_UNBEKANNT/);
});

await check("Provider-HTTP-Fehler mit gelesener Reservierung ist Produktfehler statt Budget unbekannt", async () => {
  const rawBody = JSON.stringify({
    type: "error",
    error: { type: "authentication_error", message: "fixture" },
  });
  const safe = {
    cause: "authentication_rejected",
    costKnown: false,
    costStatus: "reserved",
    costUsdCent: 0.4101,
    organizationHeaderPresent: false,
    outputTokens: null,
    providerErrorType: "authentication_error",
    providerHttpStatus: 401,
    providerRequests: 1,
    usageKnown: false,
    workspaceHeaderPresent: false,
  };
  const h = liveRunnerHarness({
    deltaUsdCent: safe.costUsdCent,
    functionResponse: async () => new Response(JSON.stringify({
      ok: false,
      status: "provider_probe",
      probe: safe,
      [PROVIDER_DIAGNOSTIC_FIELD]: { rawResponse: rawBody },
    }), { status: 200 }),
  });
  await assert.rejects(h.run(), (error) => (
    error instanceof EntdeckenProviderProbeProductStopp
      && error.exitCode === 1
      && error.code === "PROVIDER_ERROR_COST_RESERVED"
      && error.safe?.cause === "authentication_rejected"
      && error.safe?.costStatus === "reserved"
      && error.safe?.providerReached === true
      && error.safe?.providerRequests === 1
  ));
  assert.deepEqual(h.reads(), { functionRequests: 1, healthReads: 3 });
  assert.match(h.output[0], /providerHttpStatus=401/);
  assert.match(h.output[0], /costStatus=reserved · costUsdCent=0\.4101/);
  assert.match(h.output[0], /providerReached=true · providerRequests=1 · productWrites=0/);
  assert.doesNotMatch(h.output[0], /BUDGET_UNBEKANNT/);
});

await check("Transportabbruch bleibt trotz Nulldelta ohne 403-Beleg Budget unbekannt", async () => {
  const h = liveRunnerHarness({
    functionResponse: async () => { throw new TypeError("fixture"); },
  });
  await assert.rejects(h.run(), (error) => (
    error?.exitCode === 74
      && !(error instanceof EntdeckenProviderProbeProductStopp)
      && /ohne geschlossenen Vor-Provider-Beleg/.test(error.message)
  ));
  assert.deepEqual(h.reads(), { functionRequests: 1, healthReads: 3 });
  assert.equal(h.output.length, 0);
});

await check("Probe-vs-Ledger-Mismatch ist nach lesbarer Messung eine eigene Accounting-Klasse", async () => {
  const rawBody = JSON.stringify({
    type: "message",
    content: [{ type: "text", text: "fixture" }],
    usage: { input_tokens: 12, output_tokens: 1 },
  });
  const safe = {
    cause: "authenticated",
    costKnown: true,
    costStatus: "actual",
    costUsdCent: 0.0017,
    organizationHeaderPresent: false,
    outputTokens: 1,
    providerErrorType: null,
    providerHttpStatus: 200,
    providerRequests: 1,
    usageKnown: true,
    workspaceHeaderPresent: false,
  };
  const h = liveRunnerHarness({
    deltaUsdCent: 0.002,
    functionResponse: async () => new Response(JSON.stringify({
      ok: true,
      status: "provider_probe",
      probe: safe,
      [PROVIDER_DIAGNOSTIC_FIELD]: { rawResponse: rawBody },
    }), { status: 200 }),
  });
  await assert.rejects(h.run(), (error) => (
    error instanceof EntdeckenProviderProbeProductStopp
      && error.exitCode === 1
      && error.code === "PROVIDER_COST_ACCOUNTING_MISMATCH"
      && error.safe?.costStatus === "accounted"
      && Math.abs(error.safe?.costUsdCent - 0.002) < 0.0000001
  ));
  assert.match(h.output[0], /cause=provider_cost_accounting_mismatch/);
  assert.doesNotMatch(h.output[0], /BUDGET_UNBEKANNT/);
});

await check("Raw-Evidence-Mismatch ist bei lesbarer Messung Provenienzfehler statt Budget unbekannt", async () => {
  const safe = {
    cause: "authenticated",
    costKnown: true,
    costStatus: "actual",
    costUsdCent: 0.0017,
    organizationHeaderPresent: false,
    outputTokens: 1,
    providerErrorType: null,
    providerHttpStatus: 200,
    providerRequests: 1,
    usageKnown: true,
    workspaceHeaderPresent: false,
  };
  const h = liveRunnerHarness({
    deltaUsdCent: safe.costUsdCent,
    functionResponse: async () => new Response(JSON.stringify({
      ok: true,
      status: "provider_probe",
      probe: safe,
      [PROVIDER_DIAGNOSTIC_FIELD]: {
        rawResponse: JSON.stringify({
          type: "message",
          content: [{ type: "text", text: "fixture" }],
          usage: { input_tokens: 12, output_tokens: 0 },
        }),
      },
    }), { status: 200 }),
  });
  await assert.rejects(h.run(), (error) => (
    error instanceof EntdeckenProviderProbeProductStopp
      && error.exitCode === 1
      && error.code === "PROVIDER_PROBE_RESULT_INVALID"
      && error.safe?.cause === "provider_raw_evidence_mismatch"
      && error.safe?.costStatus === "actual"
  ));
  assert.match(h.output[0], /cause=provider_raw_evidence_mismatch/);
  assert.doesNotMatch(h.output[0], /BUDGET_UNBEKANNT/);
});

await check("SIGINT und SIGTERM raeumen den privaten Rawbeleg vor Exit 74 synchron auf", () => {
  const listeners = new Map();
  const removed = [];
  const exits = [];
  const errors = [];
  const processImpl = {
    once(signal, handler) { listeners.set(signal, handler); },
    off(signal, handler) {
      if (listeners.get(signal) === handler) listeners.delete(signal);
    },
  };
  const lifecycle = createEntdeckenProviderProbeRawLifecycle({
    processImpl,
    removeImpl: (directory) => removed.push(directory),
    exitImpl: (code) => exits.push(code),
    errorOutput: (line) => errors.push(line),
  });
  lifecycle.setDirectory("/private/tmp/test-only-provider-probe");
  listeners.get("SIGTERM")();
  assert.deepEqual(removed, ["/private/tmp/test-only-provider-probe"]);
  assert.deepEqual(exits, [74]);
  assert.deepEqual(errors, []);
  assert.equal(listeners.size, 0);
});

console.log(`ENTDECKEN-PROVIDER-PROBE-TEST: ${checks}/${checks}`);
