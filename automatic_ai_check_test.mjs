/* Paket H: ausschliesslich lokale Mocks und Strukturchecks. Kein Supabase-,
   Radar-, Provider-, Mail- oder sonstiger Netzwerkzugriff. */

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  AUTOMATIC_AI_CHECK_CODES,
  AUTOMATIC_AI_CHECK_HEADER,
  AUTOMATIC_AI_CHECK_HEADER_VALUE,
  AUTOMATIC_AI_CHECK_TASK,
  AUTOMATIC_AI_DRAIN_MAX_JOBS,
  AUTOMATIC_AI_DRAIN_TIME_BUDGET_MS,
  createAutomaticAiCheckHandler,
  createAutomaticAiDrainHandler,
  parseAutomaticAiServiceKeys,
} from "./supabase/functions/automatic-ai-check/core.js";

const serviceKey = "sb_secret_synthetic_scheduler_key";
const logicalJobId = "11111111-2222-4333-8444-555555555555";
const accountId = "22222222-3333-4444-8555-666666666666";
const targetId = "33333333-4444-4555-8666-777777777777";
const initialOperationId = "44444444-5555-4666-8777-888888888888";
const retryOperationId = "55555555-6666-4777-8888-999999999999";
const mailOperationId = "66666666-7777-4888-8999-aaaaaaaaaaaa";

function request({
  method = "POST",
  apiKey = serviceKey,
  checkHeader = AUTOMATIC_AI_CHECK_HEADER_VALUE,
  origin = null,
  authorization = null,
  body = null,
} = {}) {
  const headers = new Headers();
  if (apiKey !== null) headers.set("apikey", apiKey);
  if (checkHeader !== null) headers.set(AUTOMATIC_AI_CHECK_HEADER, checkHeader);
  if (origin !== null) headers.set("Origin", origin);
  if (authorization !== null) headers.set("Authorization", authorization);
  const init = { method, headers };
  if (body !== null) {
    init.body = body;
    if (body instanceof ReadableStream) init.duplex = "half";
  }
  return new Request("https://example.invalid/functions/v1/automatic-ai-check", init);
}

function emptyChunkStream(chunkCount, { fail = false } = {}) {
  let emitted = 0;
  return new ReadableStream({
    pull(controller) {
      if (fail) {
        controller.error(new Error("sensitive-body-read-error"));
        return;
      }
      if (emitted >= chunkCount) {
        controller.close();
        return;
      }
      emitted += 1;
      controller.enqueue(new Uint8Array(0));
    },
  });
}

function retryClaim(overrides = {}) {
  return {
    claim: true,
    status: "retry-claimed",
    action: "retry",
    logicalJobId,
    taskId: AUTOMATIC_AI_CHECK_TASK,
    accountId,
    targetId,
    radarViennaDay: "2026-09-03",
    initialProviderOperationId: initialOperationId,
    retryProviderOperationId: retryOperationId,
    initialApiCall: "made",
    initialCost: "confirmed",
    initialReasonCode: "initial-usage-unproven",
    ...overrides,
  };
}

function initialSuccessClaim(overrides = {}) {
  return {
    claim: true,
    status: "initial-succeeded",
    action: "none",
    logicalJobId,
    taskId: AUTOMATIC_AI_CHECK_TASK,
    initialProviderOperationId: initialOperationId,
    ...overrides,
  };
}

function mailClaim({
  retryResult = "succeeded",
  retryReasonCode = null,
  ...overrides
} = {}) {
  return {
    ok: true,
    replay: false,
    status: "claimed",
    mailOperationId,
    occurredAt: "2026-09-03T14:05:06+00:00",
    taskId: AUTOMATIC_AI_CHECK_TASK,
    initialOperationId,
    initialApiCall: "made",
    initialCost: "confirmed",
    initialReasonCode: "initial-usage-unproven",
    retryTriggered: true,
    retryOperationId,
    retryResult,
    retryReasonCode,
    ...overrides,
  };
}

function radarResponse(body = {
  ok: true,
  code: "retry-finished",
  providerRequests: 1,
  websearchRequests: 1,
}, { status = 200, contentType = "application/json" } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": contentType },
  });
}

function resolve(value, ...args) {
  if (typeof value === "function") return value(...args);
  if (value instanceof Error) throw value;
  return value;
}

function fixture(options = {}) {
  const calls = {
    order: [],
    claimDue: 0,
    radar: [],
    finishRetry: [],
    claimMail: [],
    sendMail: [],
    finishMail: [],
    randomUUID: 0,
  };
  const configured = {
    due: retryClaim(),
    radar: () => radarResponse(),
    retryFinish: {
      ok: true,
      replay: false,
      status: "succeeded",
      reasonCode: null,
      mailStatus: "pending",
    },
    mailClaim: () => mailClaim(),
    mailSend: { code: "accepted" },
    mailFinish: ({ status }) => ({ ok: true, replay: false, status }),
    ...options,
  };

  const handler = createAutomaticAiCheckHandler({
    serviceKeys: configured.serviceKeys ?? [serviceKey],
    claimDue: async () => {
      calls.order.push("claimDue");
      calls.claimDue += 1;
      return resolve(configured.due);
    },
    invokeRadar: async (claimValue, key) => {
      calls.order.push("radar");
      calls.radar.push({ claim: claimValue, key });
      return resolve(configured.radar, claimValue, key);
    },
    finishRetry: async (args) => {
      calls.order.push("finishRetry");
      calls.finishRetry.push(args);
      return resolve(configured.retryFinish, args);
    },
    claimMail: async (args) => {
      calls.order.push("claimMail");
      calls.claimMail.push(args);
      return resolve(configured.mailClaim, args);
    },
    sendOperationalMail: async (input) => {
      calls.order.push("sendMail");
      calls.sendMail.push(input);
      return resolve(configured.mailSend, input);
    },
    finishMail: async (args) => {
      calls.order.push("finishMail");
      calls.finishMail.push(args);
      return resolve(configured.mailFinish, args);
    },
    randomUUID: () => {
      calls.randomUUID += 1;
      return resolve(configured.randomUUID ?? mailOperationId);
    },
  });
  return { calls, handler };
}

const drainJobs = Object.freeze([
  Object.freeze({
    logicalJobId,
    initialOperationId,
    retryOperationId,
    mailOperationId,
  }),
  Object.freeze({
    logicalJobId: "71111111-2222-4333-8444-555555555555",
    initialOperationId: "74444444-5555-4666-8777-888888888888",
    retryOperationId: "75555555-6666-4777-8888-999999999999",
    mailOperationId: "76666666-7777-4888-8999-aaaaaaaaaaaa",
  }),
  Object.freeze({
    logicalJobId: "81111111-2222-4333-8444-555555555555",
    initialOperationId: "84444444-5555-4666-8777-888888888888",
    retryOperationId: "85555555-6666-4777-8888-999999999999",
    mailOperationId: "86666666-7777-4888-8999-aaaaaaaaaaaa",
  }),
  Object.freeze({
    logicalJobId: "91111111-2222-4333-8444-555555555555",
    initialOperationId: "94444444-5555-4666-8777-888888888888",
    retryOperationId: "95555555-6666-4777-8888-999999999999",
    mailOperationId: "96666666-7777-4888-8999-aaaaaaaaaaaa",
  }),
]);

function drainRetryClaim(job) {
  return retryClaim({
    logicalJobId: job.logicalJobId,
    initialProviderOperationId: job.initialOperationId,
    retryProviderOperationId: job.retryOperationId,
  });
}

function drainFixture({
  dueJobs = [],
  telemetry = { remainingDueJobs: 0, oldestDueAt: null },
  inspectBacklog = null,
  mailReplay = false,
  maxJobs = AUTOMATIC_AI_DRAIN_MAX_JOBS,
} = {}) {
  const queue = [...dueJobs];
  const jobsByLogicalId = new Map(drainJobs.map((job) => [job.logicalJobId, job]));
  const calls = {
    order: [],
    claimDue: 0,
    radar: 0,
    finishRetry: 0,
    claimMail: 0,
    sendMail: 0,
    finishMail: 0,
    inspectBacklog: 0,
    maxConcurrentEffects: 0,
  };
  let activeEffects = 0;
  let lastClaimedJob = null;
  const effect = async (label, fn) => {
    activeEffects += 1;
    calls.maxConcurrentEffects = Math.max(calls.maxConcurrentEffects, activeEffects);
    calls.order.push(label);
    try { return await fn(); } finally { activeEffects -= 1; }
  };
  const dependencies = {
    serviceKeys: [serviceKey],
    claimDue: async () => effect("claimDue", () => {
      calls.claimDue += 1;
      const job = queue.shift() || null;
      lastClaimedJob = job;
      return job ? drainRetryClaim(job) : { claim: false, status: "idle" };
    }),
    invokeRadar: async (_claim, _key, timeout) => effect("radar", () => {
      calls.radar += 1;
      assert.ok(Number.isInteger(timeout?.timeoutMs));
      assert.ok(timeout.timeoutMs > 0 && timeout.timeoutMs <= 120_000);
      return radarResponse();
    }),
    finishRetry: async () => effect("finishRetry", () => {
      calls.finishRetry += 1;
      return { ok: true, replay: false, status: "succeeded", reasonCode: null, mailStatus: "pending" };
    }),
    claimMail: async ({ logicalJobId: claimedId, mailOperationId: claimedMailId }) => effect("claimMail", () => {
      calls.claimMail += 1;
      const job = jobsByLogicalId.get(claimedId);
      assert.ok(job);
      assert.equal(claimedMailId, job.mailOperationId);
      if (mailReplay) return { ok: true, replay: true, status: "claimed" };
      return mailClaim({
        mailOperationId: job.mailOperationId,
        initialOperationId: job.initialOperationId,
        retryOperationId: job.retryOperationId,
      });
    }),
    sendOperationalMail: async () => effect("sendMail", () => {
      calls.sendMail += 1;
      return { code: "accepted" };
    }),
    finishMail: async ({ status }) => effect("finishMail", () => {
      calls.finishMail += 1;
      return { ok: true, replay: false, status };
    }),
    randomUUID: () => {
      const job = jobsByLogicalId.get(lastClaimedJob?.logicalJobId);
      return job?.mailOperationId || "00000000-0000-4000-8000-000000000000";
    },
    inspectBacklog: async (args) => {
      calls.inspectBacklog += 1;
      calls.order.push("inspectBacklog");
      if (inspectBacklog instanceof Error) throw inspectBacklog;
      return typeof inspectBacklog === "function" ? inspectBacklog(args) : telemetry;
    },
  };
  const asOfMs = Date.parse("2026-09-04T12:00:00.000Z");
  const handler = createAutomaticAiDrainHandler(dependencies, {
    maxJobs,
    nowMs: () => asOfMs,
  });
  return { calls, handler, queue };
}

async function responseBody(response, expectedStatus, expectedCode) {
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type") || "", /^application\/json/);
  const body = await response.json();
  assert.deepEqual(body, { ok: expectedStatus === 200, code: expectedCode });
  return body;
}

async function drainResponseBody(response, expectedStatus = 200) {
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type") || "", /^application\/json/);
  return response.json();
}

test("nur moderne konfigurierte Service-Keys werden akzeptiert", () => {
  assert.deepEqual(parseAutomaticAiServiceKeys(JSON.stringify({
    default: serviceKey,
    previous: "sb_secret_previous_synthetic_key",
  })), [serviceKey, "sb_secret_previous_synthetic_key"]);
  assert.deepEqual(parseAutomaticAiServiceKeys(JSON.stringify({
    default: serviceKey,
    duplicate: serviceKey,
  })), [serviceKey]);
  for (const raw of [
    "",
    "not-json",
    "[]",
    JSON.stringify({ default: "legacy.jwt.value" }),
    JSON.stringify({ default: serviceKey, broken: " has-space" }),
  ]) {
    assert.deepEqual(parseAutomaticAiServiceKeys(raw), []);
  }
});

test("Requestgrenze verlangt POST, leeren Body, keinen Origin/Bearer und den exakten Header", async () => {
  const invalidRequests = [
    request({ method: "GET" }),
    request({ body: "{}" }),
    request({ origin: "https://staging.kinodreieck.at" }),
    request({ authorization: `Bearer ${serviceKey}` }),
    request({ checkHeader: "scheduled-v2" }),
    request({ checkHeader: null }),
    request({ apiKey: "sb_secret_wrong" }),
  ];
  for (const invalid of invalidRequests) {
    const { calls, handler } = fixture();
    await responseBody(
      await handler(invalid),
      403,
      AUTOMATIC_AI_CHECK_CODES.FORBIDDEN,
    );
    assert.equal(calls.claimDue, 0);
  }

  const { calls, handler } = fixture({ serviceKeys: ["legacy.jwt.value"] });
  await responseBody(
    await handler(request()),
    403,
    AUTOMATIC_AI_CHECK_CODES.FORBIDDEN,
  );
  assert.equal(calls.claimDue, 0);

  const zeroByteText = fixture({ due: { claim: false, status: "idle" } });
  await responseBody(
    await zeroByteText.handler(request({ body: "" })),
    200,
    AUTOMATIC_AI_CHECK_CODES.IDLE,
  );
  assert.equal(zeroByteText.calls.claimDue, 1);

  const emptyChunks = fixture({ due: { claim: false, status: "idle" } });
  await responseBody(
    await emptyChunks.handler(request({ body: emptyChunkStream(2) })),
    200,
    AUTOMATIC_AI_CHECK_CODES.IDLE,
  );
  assert.equal(emptyChunks.calls.claimDue, 1);

  for (const body of [emptyChunkStream(8), emptyChunkStream(0, { fail: true })]) {
    const guarded = fixture();
    await responseBody(
      await guarded.handler(request({ body })),
      403,
      AUTOMATIC_AI_CHECK_CODES.FORBIDDEN,
    );
    assert.equal(guarded.calls.claimDue, 0);
  }
});

test("idle und belegter Initialerfolg stoppen nach genau einem Due-Claim", async () => {
  const idle = fixture({ due: { claim: false, status: "idle" } });
  await responseBody(
    await idle.handler(request()),
    200,
    AUTOMATIC_AI_CHECK_CODES.IDLE,
  );
  assert.deepEqual(idle.calls.order, ["claimDue"]);

  const succeeded = fixture({ due: initialSuccessClaim() });
  await responseBody(
    await succeeded.handler(request()),
    200,
    AUTOMATIC_AI_CHECK_CODES.INITIAL_SUCCEEDED,
  );
  assert.deepEqual(succeeded.calls.order, ["claimDue"]);
});

test("ein beanspruchter Retry bindet Radar, Ledger und Mail exakt einmal", async () => {
  const { calls, handler } = fixture();
  await responseBody(
    await handler(request()),
    200,
    AUTOMATIC_AI_CHECK_CODES.RETRY_FINISHED,
  );

  assert.deepEqual(calls.order, [
    "claimDue", "radar", "finishRetry", "claimMail", "sendMail", "finishMail",
  ]);
  assert.equal(calls.claimDue, 1);
  assert.equal(calls.radar.length, 1);
  assert.equal(calls.radar[0].key, serviceKey);
  assert.equal(calls.radar[0].claim.logicalJobId, logicalJobId);
  assert.equal(calls.radar[0].claim.retryProviderOperationId, retryOperationId);
  assert.deepEqual(calls.finishRetry, [{
    logicalJobId,
    retryOperationId,
    result: "succeeded",
    reasonCode: null,
  }]);
  assert.deepEqual(calls.claimMail, [{ logicalJobId, mailOperationId }]);
  assert.equal(calls.randomUUID, 1);
  assert.equal(calls.sendMail.length, 1);
  assert.deepEqual(calls.sendMail[0], {
    schemaVersion: 1,
    type: "operational-retry",
    operationId: mailOperationId,
    occurredAt: "2026-09-03T14:05:06.000Z",
    taskId: AUTOMATIC_AI_CHECK_TASK,
    initialOperationId,
    initialApiCall: "made",
    initialCost: "confirmed",
    initialErrorCode: null,
    initialReasonCode: "initial-usage-unproven",
    retryTriggered: true,
    retryOperationId,
    retryResult: "succeeded",
    retryErrorCode: null,
    retryReasonCode: null,
  });
  assert.deepEqual(calls.finishMail, [{
    logicalJobId,
    mailOperationId,
    status: "accepted",
  }]);
});

test("Radar-Ablehnung wird failed, mehrdeutige Antwort und Throw werden unproven", async () => {
  const blocked = fixture({
    radar: () => radarResponse({ ok: false }, { status: 403 }),
    mailClaim: { ok: false, code: "not-ready" },
  });
  await responseBody(
    await blocked.handler(request()),
    500,
    AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
  );
  assert.deepEqual(blocked.calls.finishRetry, [{
    logicalJobId,
    retryOperationId,
    result: "failed",
    reasonCode: "retry-blocked",
  }]);
  assert.equal(blocked.calls.radar.length, 1);
  assert.equal(blocked.calls.sendMail.length, 0);

  const ambiguous = fixture({
    radar: () => radarResponse({
      ok: true,
      code: "retry-finished",
      providerRequests: 1,
      websearchRequests: 1,
      detail: "not-allowed",
    }),
    mailClaim: { ok: false, code: "not-ready" },
  });
  await responseBody(
    await ambiguous.handler(request()),
    500,
    AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
  );
  assert.equal(ambiguous.calls.finishRetry[0].result, "unproven");
  assert.equal(ambiguous.calls.finishRetry[0].reasonCode, "retry-status-unproven");
  assert.equal(ambiguous.calls.radar.length, 1);

  const thrown = fixture({
    radar: new Error("sensitive-radar-detail"),
    mailClaim: { ok: false, code: "not-ready" },
  });
  const thrownResponse = await thrown.handler(request());
  const thrownSafeCopy = thrownResponse.clone();
  await responseBody(thrownResponse, 500, AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE);
  assert.equal(thrown.calls.finishRetry[0].result, "unproven");
  assert.equal(thrown.calls.radar.length, 1);
  assert.equal((await thrownSafeCopy.text()).includes("sensitive"), false);
});

test("Radar akzeptiert nur ganzzahlige Websearch-Zahlen von null bis vier", async () => {
  for (const websearchRequests of [0, 2, 4]) {
    const accepted = fixture({
      radar: () => radarResponse({
        ok: true,
        code: "retry-finished",
        providerRequests: 1,
        websearchRequests,
      }),
    });
    await responseBody(
      await accepted.handler(request()),
      200,
      AUTOMATIC_AI_CHECK_CODES.RETRY_FINISHED,
    );
    assert.equal(accepted.calls.finishRetry[0].result, "succeeded");
  }

  for (const websearchRequests of [-1, 5, 1.5, "4"]) {
    const rejected = fixture({
      radar: () => radarResponse({
        ok: true,
        code: "retry-finished",
        providerRequests: 1,
        websearchRequests,
      }),
      mailClaim: { ok: false, code: "not-ready" },
    });
    await responseBody(
      await rejected.handler(request()),
      500,
      AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
    );
    assert.equal(rejected.calls.finishRetry[0].result, "unproven");
  }
});

test("Retry-Abschluss wird auch nach Radarfehler genau einmal bestmoeglich versucht", async () => {
  const { calls, handler } = fixture({
    radar: new Error("network-outcome-unknown"),
    retryFinish: new Error("retry-finish-unknown"),
    mailClaim: { ok: false, code: "not-ready" },
  });
  await responseBody(
    await handler(request()),
    500,
    AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
  );
  assert.equal(calls.radar.length, 1);
  assert.equal(calls.finishRetry.length, 1);
  assert.equal(calls.claimMail.length, 1);
  assert.equal(calls.sendMail.length, 0);
  assert.equal(calls.finishMail.length, 0);
});

test("nur ein exakter DB-Mailclaim erlaubt den einen Send", async () => {
  const ambiguous = fixture({
    mailClaim: () => mailClaim({ payload: "not-allowed" }),
  });
  await responseBody(
    await ambiguous.handler(request()),
    500,
    AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
  );
  assert.equal(ambiguous.calls.sendMail.length, 0);
  assert.deepEqual(ambiguous.calls.finishMail, [{
    logicalJobId,
    mailOperationId,
    status: "unknown",
  }]);

  const rejected = fixture({
    mailClaim: { ok: false, code: "idempotency-conflict" },
  });
  await responseBody(
    await rejected.handler(request()),
    500,
    AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
  );
  assert.equal(rejected.calls.sendMail.length, 0);
  assert.equal(rejected.calls.finishMail.length, 0);
});

test("Mailthrow wird einmal als unknown abgeschlossen und nie erneut gesendet", async () => {
  const { calls, handler } = fixture({
    mailSend: new Error("sensitive-mail-detail"),
  });
  const response = await handler(request());
  const safeCopy = response.clone();
  await responseBody(response, 200, AUTOMATIC_AI_CHECK_CODES.RETRY_FINISHED);
  assert.equal(calls.sendMail.length, 1);
  assert.deepEqual(calls.finishMail, [{
    logicalJobId,
    mailOperationId,
    status: "unknown",
  }]);
  assert.equal((await safeCopy.text()).includes("sensitive"), false);
});

test("mehrdeutiger Mailabschluss startet weder zweiten Send noch zweiten Finish", async () => {
  const { calls, handler } = fixture({
    mailFinish: new Error("mail-finish-unknown"),
  });
  await responseBody(
    await handler(request()),
    500,
    AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
  );
  assert.equal(calls.radar.length, 1);
  assert.equal(calls.sendMail.length, 1);
  assert.equal(calls.finishMail.length, 1);
});

test("Drain bildet 0 und 1 Job exakt ab und liest die Restanz danach einmal", async () => {
  const empty = drainFixture();
  assert.deepEqual(await drainResponseBody(await empty.handler(request())), {
    ok: true,
    code: AUTOMATIC_AI_CHECK_CODES.IDLE,
    processedJobs: 0,
    initialSucceededJobs: 0,
    retryFinishedJobs: 0,
    remainingDueJobs: 0,
    oldestLagSeconds: null,
    stopReason: "idle",
    maxJobs: 3,
    timeBudgetMs: AUTOMATIC_AI_DRAIN_TIME_BUDGET_MS,
  });
  assert.equal(empty.calls.claimDue, 1);
  assert.equal(empty.calls.radar, 0);
  assert.equal(empty.calls.sendMail, 0);
  assert.equal(empty.calls.inspectBacklog, 1);

  const one = drainFixture({ dueJobs: [drainJobs[0]] });
  assert.deepEqual(await drainResponseBody(await one.handler(request())), {
    ok: true,
    code: AUTOMATIC_AI_CHECK_CODES.DRAINED,
    processedJobs: 1,
    initialSucceededJobs: 0,
    retryFinishedJobs: 1,
    remainingDueJobs: 0,
    oldestLagSeconds: null,
    stopReason: "idle",
    maxJobs: 3,
    timeBudgetMs: AUTOMATIC_AI_DRAIN_TIME_BUDGET_MS,
  });
  assert.deepEqual(one.calls.order, [
    "claimDue", "radar", "finishRetry", "claimMail", "sendMail", "finishMail",
    "claimDue", "inspectBacklog",
  ]);
  assert.equal(one.calls.maxConcurrentEffects, 1);
});

test("Drain verarbeitet exakt drei Jobs streng seriell und claimt keinen vierten", async () => {
  const three = drainFixture({ dueJobs: drainJobs.slice(0, 3) });
  const body = await drainResponseBody(await three.handler(request()));
  assert.equal(body.code, AUTOMATIC_AI_CHECK_CODES.DRAINED);
  assert.equal(body.processedJobs, 3);
  assert.equal(body.retryFinishedJobs, 3);
  assert.equal(body.stopReason, "job_limit");
  assert.equal(three.calls.claimDue, 3);
  assert.equal(three.calls.radar, 3);
  assert.equal(three.calls.finishRetry, 3);
  assert.equal(three.calls.claimMail, 3);
  assert.equal(three.calls.sendMail, 3);
  assert.equal(three.calls.finishMail, 3);
  assert.equal(three.calls.maxConcurrentEffects, 1);
  assert.equal(three.calls.inspectBacklog, 1);
});

test("Mehr als drei faellige Jobs bleiben begrenzt und melden anonymen Backlog-Lag", async () => {
  const four = drainFixture({
    dueJobs: drainJobs,
    maxJobs: 99,
    telemetry: {
      remainingDueJobs: 1,
      oldestDueAt: "2026-09-04T10:30:00.000Z",
    },
  });
  const body = await drainResponseBody(await four.handler(request()));
  assert.deepEqual(body, {
    ok: true,
    code: AUTOMATIC_AI_CHECK_CODES.BACKLOG,
    processedJobs: 3,
    initialSucceededJobs: 0,
    retryFinishedJobs: 3,
    remainingDueJobs: 1,
    oldestLagSeconds: 5_400,
    stopReason: "job_limit",
    maxJobs: 3,
    timeBudgetMs: AUTOMATIC_AI_DRAIN_TIME_BUDGET_MS,
  });
  assert.equal(four.calls.claimDue, 3);
  assert.equal(four.calls.radar, 3);
  assert.equal(four.calls.sendMail, 3);
  assert.equal(four.queue.length, 1);
  assert.deepEqual(Object.keys(body).sort(), [
    "code", "initialSucceededJobs", "maxJobs", "ok", "oldestLagSeconds",
    "processedJobs", "remainingDueJobs", "retryFinishedJobs", "stopReason", "timeBudgetMs",
  ].sort());
  assert.doesNotMatch(JSON.stringify(body), /account|target|operation|mail|title|content|prompt/iu);
});

test("Unbekannte oder formfremde Backlogdaten bleiben fail-closed rot", async () => {
  const cases = [
    new Error("synthetic-read-failure"),
    () => ({ remainingDueJobs: 0, oldestDueAt: "2026-09-04T10:00:00.000Z" }),
    () => ({ remainingDueJobs: 1, oldestDueAt: null }),
    () => ({ remainingDueJobs: 1, oldestDueAt: "2026-09-04T13:00:00.000Z" }),
    () => ({ remainingDueJobs: "1", oldestDueAt: "2026-09-04T10:00:00.000Z" }),
    () => ({ remainingDueJobs: 1, oldestDueAt: "2026-09-04T10:00:00.000Z", identity: logicalJobId }),
  ];
  for (const inspectBacklog of cases) {
    const guarded = drainFixture({ inspectBacklog });
    await responseBody(
      await guarded.handler(request()),
      500,
      AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
    );
    assert.equal(guarded.calls.inspectBacklog, 1);
    assert.equal(guarded.calls.radar, 0);
    assert.equal(guarded.calls.sendMail, 0);
  }
});

test("Wiederholter Mailclaim wird im Drain nie als zweiter Send interpretiert", async () => {
  const replay = drainFixture({ dueJobs: [drainJobs[0]], mailReplay: true });
  await responseBody(
    await replay.handler(request()),
    500,
    AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE,
  );
  assert.equal(replay.calls.claimDue, 1);
  assert.equal(replay.calls.radar, 1);
  assert.equal(replay.calls.claimMail, 1);
  assert.equal(replay.calls.sendMail, 0);
  assert.equal(replay.calls.finishMail, 1);
  assert.equal(replay.calls.inspectBacklog, 0);
});

test("Function, Workflow und Tests bleiben bodylos, seriell und ohne Retryschleife", () => {
  const core = fs.readFileSync("supabase/functions/automatic-ai-check/core.js", "utf8");
  const runtime = fs.readFileSync("supabase/functions/automatic-ai-check/index.ts", "utf8");
  const workflow = fs.readFileSync(".github/workflows/automatic-ai-check.yml", "utf8");
  const config = fs.readFileSync("supabase/config.toml", "utf8");
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const runtimeRadar = runtime.slice(
    runtime.indexOf(") => fetch(`${supabaseUrl}/functions/v1/radar-websearch-task`"),
    runtime.indexOf("finishRetry:", runtime.indexOf(") => fetch(`${supabaseUrl}/functions/v1/radar-websearch-task`")),
  );

  assert.match(runtime, /createOperationalRetryMailSender/);
  for (const rpc of [
    "kd_automatic_ai_retry_due_claim",
    "kd_automatic_ai_retry_finish",
    "kd_automatic_ai_retry_mail_claim",
    "kd_automatic_ai_retry_mail_finish",
  ]) {
    assert.equal((runtime.match(new RegExp(rpc, "g")) || []).length, 1, rpc);
  }
  assert.match(runtimeRadar, /method: "POST"/);
  assert.match(runtimeRadar, /"x-kd-radar-refresh": RADAR_RETRY_HEADER_VALUE/);
  assert.match(runtimeRadar, /"x-kd-automatic-job-id": claim\.logicalJobId/);
  assert.match(runtimeRadar, /"x-kd-radar-retry-operation": claim\.retryProviderOperationId/);
  assert.doesNotMatch(runtimeRadar, /\bbody\s*:|Authorization|Origin/);
  assert.match(core, /for \(let emptyChunks = 0; emptyChunks < 8; emptyChunks \+= 1\)/);
  assert.doesNotMatch(`${core}\n${runtime}`, /console\s*\.|\bwhile\s*\(|setTimeout|setInterval/);
  assert.match(core, /AUTOMATIC_AI_DRAIN_MAX_JOBS = 3/);
  assert.match(core, /for \(let index = 0; index < maxJobs; index \+= 1\)/);
  assert.match(core, /await createAutomaticAiCheckHandler/);
  assert.match(runtime, /\.from\("kd_automatic_ai_retry_jobs"\)/);
  assert.match(runtime, /\.select\("check_due_at", \{ count: "exact" \}\)/);
  assert.match(runtime, /\.eq\("initial_evidence_status", "pending"\)/);
  assert.match(runtime, /\.lte\("check_due_at", asOf\)/);
  assert.doesNotMatch(runtime, /select\("(?:account_id|target_id|logical_job_id|initial_provider_operation_id)/);
  assert.match(runtime, /createAutomaticAiCheckHandler\(runtimeDependencies\(\)\)/);
  assert.doesNotMatch(runtime, /createAutomaticAiDrainHandler/);

  assert.doesNotMatch(workflow, /workflow_dispatch|curl[^\n]*--retry|--data(?:-binary|-raw)?\b/);
  assert.equal((workflow.match(/\bcurl\b/g) || []).length, 1);
  assert.match(workflow, /concurrency:[\s\S]*?cancel-in-progress: false/);
  assert.match(workflow, /--request POST/);
  assert.match(workflow, /--header "apikey: \$\{SUPABASE_RADAR_SCHEDULER\}"/);
  assert.match(workflow, /--header "x-kd-automatic-check: scheduled-v1"/);
  assert.doesNotMatch(workflow, /--header "(?:Authorization|Origin):/i);

  assert.match(config, /\[functions\.automatic-ai-check\][\s\S]*?verify_jwt = false/);
  assert.equal(
    packageJson.scripts["test:automatic-ai-retry-pg17"],
    "node automatic_ai_retry_jobs_pg17_test.mjs && node radar_automatic_retry_binding_pg17_test.mjs",
  );
  assert.equal(
    packageJson.scripts["test:automatic-ai-check"],
    "node --test automatic_ai_check_test.mjs",
  );
  assert.match(packageJson.scripts.test, /npm run test:automatic-ai-retry-pg17/);
  assert.match(packageJson.scripts.test, /npm run test:automatic-ai-check/);
});
