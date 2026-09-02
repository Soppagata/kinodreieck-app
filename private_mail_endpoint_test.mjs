import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  PRIVATE_MAIL_ALLOWED_ORIGINS,
  PRIVATE_MAIL_RATE_LIMITS,
  createPrivateMailRequestHandler,
} from "./supabase/functions/private-mail-request/core.js";

const origin = "https://staging.kinodreieck.at";
const operationId = "80a8b9b9-2c52-42d5-8e0e-08fecee9ca43";
const accountId = "3c0b70fd-0b50-41c4-8b23-959532495476";
const otherAccountId = "42745d70-3fd1-4f69-ab70-f391ccfa2bec";
const hmacSecret = "hmac-secret-with-at-least-32-bytes-for-tests";
const transportActivationSecret = "activation-secret-with-at-least-32-bytes";
const fixedNow = "2026-09-02T12:34:56.000Z";

function feedback(overrides = {}) {
  return {
    schemaVersion: 1,
    type: "feedback",
    operationId,
    text: "Bitte mehr Originalfassungen anzeigen.",
    ...overrides,
  };
}

function deletion(overrides = {}) {
  return {
    schemaVersion: 1,
    type: "account-deletion-request",
    operationId,
    ...overrides,
  };
}

function post(body, options = {}) {
  const headers = new Headers({
    Origin: options.origin ?? origin,
    Authorization: options.authorization ?? "Bearer valid-session",
    "Content-Type": options.contentType ?? "application/json",
    ...(options.headers || {}),
  });
  return new Request("https://example.invalid/functions/v1/private-mail-request", {
    method: options.method ?? "POST",
    headers,
    body: options.method && options.method !== "POST" ? undefined
      : typeof body === "string" ? body : JSON.stringify(body),
  });
}

function state(status, replay = false) {
  const resultCode = {
    claimed: "request-in-progress",
    accepted: "accepted",
    rejected: "delivery-rejected",
    unknown: "delivery-status-unknown",
  }[status];
  return { ok: true, replay, status, resultCode };
}

function fixture(overrides = {}) {
  const calls = {
    claims: [],
    users: [],
    access: [],
    begin: [],
    finish: [],
    transport: [],
  };
  const dependencies = {
    hmacSecret,
    transportActivationSecret,
    now: () => fixedNow,
    getClaims: async (token) => {
      calls.claims.push(token);
      return { data: { claims: { sub: accountId, role: "authenticated" } }, error: null };
    },
    getUser: async (token) => {
      calls.users.push(token);
      return { data: { user: { id: accountId, email: "must-not-leak@example.invalid" } }, error: null };
    },
    getAccountAccess: async (id) => {
      calls.access.push(id);
      return { data: { active: true, role: "member" }, error: null };
    },
    beginRequest: async (args) => {
      calls.begin.push(args);
      return { data: state("claimed"), error: null };
    },
    finishRequest: async (args) => {
      calls.finish.push(args);
      return { data: state(args.p_terminal_status), error: null };
    },
    transport: async (message) => {
      calls.transport.push(message);
      return { ok: true, status: "accepted" };
    },
    ...overrides,
  };
  return { calls, dependencies, handler: createPrivateMailRequestHandler(dependencies) };
}

async function body(response) {
  return JSON.parse(await response.text());
}

test("CORS erlaubt vor E6 ausschließlich den exakten Staging-Origin", async () => {
  assert.deepEqual(PRIVATE_MAIL_ALLOWED_ORIGINS, [origin]);

  const { handler } = fixture();
  const response = await handler(new Request("https://example.invalid", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");

  for (const rejectedOrigin of [
    "https://kinodreieck.at",
    "http://localhost:5173",
    "https://evil.invalid",
  ]) {
    const fixtureResult = fixture();
    const rejected = await fixtureResult.handler(post(feedback(), { origin: rejectedOrigin }));
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("Access-Control-Allow-Origin"), null);
    assert.deepEqual(await body(rejected), { ok: false, schemaVersion: 1, code: "forbidden" });
    assert.equal(fixtureResult.calls.claims.length, 0);
    assert.equal(fixtureResult.calls.begin.length, 0);
    assert.equal(fixtureResult.calls.transport.length, 0);
  }
});

test("Methoden, Content-Type und Preflight-Header failen geschlossen", async () => {
  const { handler, calls } = fixture();
  const method = await handler(post(null, { method: "GET" }));
  assert.equal(method.status, 405);
  assert.equal((await body(method)).code, "invalid-request");
  const contentType = await handler(post(feedback(), { contentType: "text/plain" }));
  assert.equal(contentType.status, 415);
  const options = await handler(new Request("https://example.invalid", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "DELETE",
      "Access-Control-Request-Headers": "x-free-header",
    },
  }));
  assert.equal(options.status, 403);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.begin.length, 0);
});

test("der Rohbody wird vor JSON strikt auf 8 KiB begrenzt", async () => {
  const { handler, calls } = fixture();
  const response = await handler(post("x".repeat(8 * 1024 + 1)));
  assert.equal(response.status, 413);
  assert.equal((await body(response)).code, "request-too-large");
  const declared = await handler(post(feedback(), { headers: { "Content-Length": "8193" } }));
  assert.equal(declared.status, 413);
  assert.equal(calls.claims.length, 0);
  assert.equal(calls.begin.length, 0);
});

test("Browserfelder bleiben exakt auf Typ, Vorgang und Feedbacktext begrenzt", async () => {
  for (const invalid of [
    feedback({ accountId }),
    feedback({ subject: "frei" }),
    feedback({ to: "mail@example.invalid" }),
    deletion({ accountId }),
    deletion({ html: "<b>frei</b>" }),
  ]) {
    const { handler, calls } = fixture();
    const response = await handler(post(invalid));
    assert.equal(response.status, 400);
    assert.equal((await body(response)).code, "invalid-request");
    assert.equal(calls.begin.length, 0);
    assert.equal(calls.transport.length, 0);
  }
});

test("Claims, User und aktiver kd_account_access-Eintrag muessen gemeinsam passen", async () => {
  const cases = [
    { getClaims: async () => ({ data: { claims: { sub: accountId, role: "anon" } }, error: null }), status: 401 },
    { getUser: async () => ({ data: { user: { id: otherAccountId } }, error: null }), status: 401 },
    { getAccountAccess: async () => ({ data: { active: false }, error: null }), status: 403 },
    { getAccountAccess: async () => ({ data: null, error: new Error("db") }), status: 503 },
  ];
  for (const current of cases) {
    const { status, ...override } = current;
    const { handler, calls } = fixture(override);
    const response = await handler(post(feedback()));
    assert.equal(response.status, status);
    assert.equal(calls.begin.length, 0);
    assert.equal(calls.transport.length, 0);
  }
});

test("ohne HMAC-Secret, Aktivierungssecret oder Transport wird nie geclaimt oder gesendet", async () => {
  for (const override of [
    { hmacSecret: null },
    { transportActivationSecret: null },
    { transportActivationSecret: "too-short" },
    { transport: null },
  ]) {
    const { handler, calls } = fixture(override);
    const response = await handler(post(feedback()));
    assert.equal(response.status, 503);
    assert.equal((await body(response)).code, "unavailable");
    assert.equal(calls.begin.length, 0);
    assert.equal(calls.transport.length, 0);
  }
});

test("Feedback bleibt in der Nachricht anonym und nutzt nur HMAC-Werte in den RPCs", async () => {
  const { handler, calls } = fixture();
  const response = await handler(post(feedback()));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), {
    ok: true,
    schemaVersion: 1,
    type: "feedback",
    operationId,
    status: "accepted",
  });
  assert.equal(calls.transport.length, 1);
  const message = calls.transport[0];
  assert.deepEqual(Object.keys(message).sort(), ["html", "operationId", "schemaVersion", "subject", "text", "type"]);
  assert.match(message.text, /Bitte mehr Originalfassungen/);
  assert.doesNotMatch(message.text, new RegExp(accountId));
  assert.doesNotMatch(message.text, /must-not-leak/);
  assert.equal(calls.begin[0].p_account_sha256, null);
  for (const name of ["p_request_sha256", "p_global_bucket_sha256", "p_subject_bucket_sha256"]) {
    assert.match(calls.begin[0][name], /^[a-f0-9]{64}$/);
    assert.notEqual(calls.begin[0][name], accountId);
  }
  assert.notEqual(calls.begin[0].p_global_bucket_sha256, calls.begin[0].p_subject_bucket_sha256);
  assert.equal(JSON.stringify(calls.begin[0]).includes(accountId), false);
});

test("Kontoloeschanfrage bezieht die Konto-ID ausschliesslich aus der verifizierten Sitzung", async () => {
  const { handler, calls } = fixture();
  const response = await handler(post(deletion()));
  assert.equal(response.status, 200);
  assert.equal(calls.transport.length, 1);
  assert.match(calls.transport[0].text, new RegExp(accountId));
  assert.doesNotMatch(calls.transport[0].text, new RegExp(otherAccountId));
  assert.match(calls.begin[0].p_account_sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(calls.begin[0].p_account_sha256, accountId);
  assert.equal(JSON.stringify(calls.begin[0]).includes(accountId), false);
});

test("begin-RPC erhaelt den exakten Guard-Vertrag und feste getrennte Limits", async () => {
  const { handler, calls } = fixture();
  await handler(post(feedback()));
  assert.deepEqual(Object.keys(calls.begin[0]).sort(), [
    "p_account_sha256",
    "p_global_bucket_sha256",
    "p_global_limit",
    "p_global_window_seconds",
    "p_kind",
    "p_operation_id",
    "p_request_sha256",
    "p_subject_bucket_sha256",
    "p_subject_limit",
    "p_subject_window_seconds",
  ]);
  assert.equal(calls.begin[0].p_kind, "feedback");
  assert.equal(calls.begin[0].p_operation_id, operationId);
  assert.equal(calls.begin[0].p_global_limit, PRIVATE_MAIL_RATE_LIMITS.feedback.globalLimit);
  assert.equal(calls.begin[0].p_subject_limit, PRIVATE_MAIL_RATE_LIMITS.feedback.subjectLimit);
});

test("Replay, Konflikt, In-Progress und Rate werden ohne Transport generisch abgebildet", async () => {
  const scenarios = [
    { data: state("accepted", true), status: 200, code: null },
    { data: state("rejected", true), status: 502, code: "delivery-rejected" },
    { data: state("unknown", true), status: 502, code: "delivery-status-unknown" },
    { data: state("claimed", true), status: 409, code: "request-in-progress" },
    { data: { ok: false, code: "idempotency-conflict" }, status: 409, code: "idempotency-conflict" },
    { data: { ok: false, code: "rate-limited" }, status: 429, code: "rate-limited" },
  ];
  for (const scenario of scenarios) {
    const { handler, calls } = fixture({
      beginRequest: async (args) => {
        calls.begin.push(args);
        return { data: scenario.data, error: null };
      },
    });
    const response = await handler(post(feedback()));
    assert.equal(response.status, scenario.status);
    const responseBody = await body(response);
    if (scenario.code) assert.equal(responseBody.code, scenario.code);
    else assert.equal(responseBody.status, "accepted");
    assert.equal(calls.transport.length, 0);
    assert.equal(calls.finish.length, 0);
  }
});

test("ein unmoeglicher nicht-Replay-Erfolg vom begin-RPC bleibt fail-closed", async () => {
  const { handler, calls } = fixture({
    beginRequest: async (args) => {
      calls.begin.push(args);
      return { data: state("accepted", false), error: null };
    },
  });
  const response = await handler(post(feedback()));
  assert.equal(response.status, 503);
  assert.equal((await body(response)).code, "unavailable");
  assert.equal(calls.transport.length, 0);
  assert.equal(calls.finish.length, 0);
});

test("accepted, rejected und unknown werden genau einmal abgeschlossen und abgebildet", async () => {
  const outcomes = [
    { transport: { ok: true, status: "accepted" }, terminal: "accepted", responseStatus: 200, code: null },
    { transport: { ok: false, status: "rejected" }, terminal: "rejected", responseStatus: 502, code: "delivery-rejected" },
    { transport: { ok: false, status: "pending" }, terminal: "unknown", responseStatus: 502, code: "delivery-status-unknown" },
  ];
  for (const outcome of outcomes) {
    const { handler, calls } = fixture({
      transport: async (message) => {
        calls.transport.push(message);
        return outcome.transport;
      },
    });
    const response = await handler(post(feedback()));
    assert.equal(response.status, outcome.responseStatus);
    const responseBody = await body(response);
    if (outcome.code) assert.equal(responseBody.code, outcome.code);
    assert.equal(calls.transport.length, 1);
    assert.equal(calls.finish.length, 1);
    assert.deepEqual(calls.finish[0], {
      p_kind: "feedback",
      p_operation_id: operationId,
      p_request_sha256: calls.begin[0].p_request_sha256,
      p_terminal_status: outcome.terminal,
    });
  }
});

test("Transportfehler und unbestaetigtes Finish bleiben unknown ohne Retry", async () => {
  const { handler, calls } = fixture({
    transport: async (message) => {
      calls.transport.push(message);
      throw new Error("ambiguous-provider-outcome");
    },
    finishRequest: async (args) => {
      calls.finish.push(args);
      return { data: null, error: new Error("finish-unavailable") };
    },
  });
  const response = await handler(post(feedback()));
  assert.equal(response.status, 502);
  assert.equal((await body(response)).code, "delivery-status-unknown");
  assert.equal(calls.transport.length, 1);
  assert.equal(calls.finish.length, 1);
  assert.equal(calls.finish[0].p_terminal_status, "unknown");
});

test("Requesthash und Subject-Bucket binden die serverseitige Kontoidentitaet", async () => {
  async function capturedFor(id) {
    const { handler, calls } = fixture({
      getClaims: async () => ({ data: { claims: { sub: id, role: "authenticated" } }, error: null }),
      getUser: async () => ({ data: { user: { id } }, error: null }),
    });
    await handler(post(feedback()));
    return calls.begin[0];
  }
  const first = await capturedFor(accountId);
  const second = await capturedFor(accountId);
  const other = await capturedFor(otherAccountId);
  assert.equal(first.p_request_sha256, second.p_request_sha256);
  assert.equal(first.p_subject_bucket_sha256, second.p_subject_bucket_sha256);
  assert.equal(first.p_global_bucket_sha256, other.p_global_bucket_sha256);
  assert.notEqual(first.p_request_sha256, other.p_request_sha256);
  assert.notEqual(first.p_subject_bucket_sha256, other.p_subject_bucket_sha256);
});

test("Runtime bindet Claims/User/Access, die exakten RPCs und den serverseitigen Resend-Adapter", () => {
  const source = fs.readFileSync("supabase/functions/private-mail-request/index.ts", "utf8");
  assert.match(source, /getClaims\(token\)/);
  assert.match(source, /getUser\(token\)/);
  assert.match(source, /\.from\("kd_account_access"\)/);
  assert.match(source, /\.rpc\("kd_private_mail_request_begin", args\)/);
  assert.match(source, /\.rpc\("kd_private_mail_request_finish", args\)/);
  assert.match(source, /createResendPrivateMailTransport\(\{/);
  assert.match(source, /Deno\.env\.get\("RESEND_API_KEY"\)/);
  assert.match(source, /Deno\.env\.get\("KD_PRIVATE_MAIL_SENDER"\)/);
  assert.match(source, /Deno\.env\.get\("KD_PRIVATE_MAIL_RECIPIENT"\)/);
  assert.doesNotMatch(source, /@(?:hotmail|kinodreieck)/i);
  assert.doesNotMatch(source, /api\.resend|fetch\(/i);
});
