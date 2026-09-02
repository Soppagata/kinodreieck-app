import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PRIVATE_MAIL_ADAPTER_STATUS,
  createPrivateFeedbackDispatcher,
} from "./supabase/functions/_shared/privateMailMessages.js";
import {
  RESEND_PRIVATE_MAIL_ENDPOINT,
  RESEND_PRIVATE_MAIL_SENDER,
  createResendPrivateMailTransport,
} from "./supabase/functions/private-mail-request/resendAdapter.js";

const operationId = "1111111a-222b-433c-844d-55555555555e";
const recipient = "private-recipient@example.test";
const apiKey = "synthetic-resend-api-key";
const signal = AbortSignal.abort("mock-only");

function message(overrides = {}) {
  return {
    schemaVersion: 1,
    type: "feedback",
    operationId,
    subject: "Kinodreieck: Feedback ohne Namensangabe",
    text: "Feedback ohne Namensangabe\n\nMehr Originalfassungen.",
    html: "<p>Feedback ohne Namensangabe<br><br>Mehr Originalfassungen.</p>",
    ...overrides,
  };
}

function providerResponse(body, {
  status = 200,
  replayed = "false",
} = {}) {
  const headers = { "Content-Type": "application/json" };
  if (replayed !== null) headers["idempotent-replayed"] = replayed;
  return new Response(JSON.stringify(body), { status, headers });
}

function transportWith(fetchImpl) {
  return createResendPrivateMailTransport({
    apiKey,
    sender: RESEND_PRIVATE_MAIL_SENDER,
    recipient,
    fetchImpl,
    signalFactory: () => signal,
  });
}

test("fehlende oder abweichende Serverbindung bleibt vor jedem Fetch geschlossen", () => {
  const fetchImpl = async () => {
    assert.fail("Fetch darf bei unvollstaendiger Konfiguration nicht existieren");
  };
  for (const options of [
    { apiKey: null, sender: RESEND_PRIVATE_MAIL_SENDER, recipient },
    { apiKey, sender: "other@example.test", recipient },
    { apiKey, sender: RESEND_PRIVATE_MAIL_SENDER, recipient: null },
    { apiKey, sender: RESEND_PRIVATE_MAIL_SENDER, recipient: "first@example.test,second@example.test" },
  ]) {
    assert.equal(createResendPrivateMailTransport({ ...options, fetchImpl }), null);
  }
});

test("ein Versand bindet Endpoint, POST, Serveradressen und Idempotenz exakt", async () => {
  let calls = 0;
  const transport = transportWith(async (url, options) => {
    calls += 1;
    assert.equal(url, RESEND_PRIVATE_MAIL_ENDPOINT);
    assert.equal(options.method, "POST");
    assert.deepEqual(Object.keys(options.headers).sort(), [
      "Authorization", "Content-Type", "Idempotency-Key",
    ].sort());
    assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.headers["Idempotency-Key"], operationId);
    assert.equal(options.redirect, "error");
    assert.equal(options.signal, signal);
    assert.deepEqual(JSON.parse(options.body), {
      from: RESEND_PRIVATE_MAIL_SENDER,
      to: [recipient],
      subject: message().subject,
      text: message().text,
      html: message().html,
    });
    return providerResponse({ id: "provider-id-redacted" });
  });

  const result = await transport(message());
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: true, status: PRIVATE_MAIL_ADAPTER_STATUS.ACCEPTED });
  assert.deepEqual(Object.keys(result).sort(), ["ok", "status"]);
});

test("der belegte exakte Replay bleibt accepted und startet keinen versteckten Retry", async () => {
  let calls = 0;
  const transport = transportWith(async () => {
    calls += 1;
    return providerResponse({ id: "same-provider-id-redacted" }, { replayed: "true" });
  });
  const result = await transport(message());
  assert.deepEqual(result, { ok: true, status: "accepted" });
  assert.equal(calls, 1);
});

test("der belegte Idempotenzkonflikt wird als sichere Ablehnung abgebildet", async () => {
  const transport = transportWith(async () => providerResponse({
    message: "redacted provider conflict",
    name: "invalid_idempotent_request",
    statusCode: 409,
  }, { status: 409, replayed: null }));
  assert.deepEqual(await transport(message()), { ok: false, status: "rejected" });
});

test("nur die exakt belegten 200- und 409-Formen sind terminal", async () => {
  const cases = [
    providerResponse({ id: "provider-id-redacted", extra: true }),
    providerResponse({ id: "provider-id-redacted" }, { replayed: null }),
    providerResponse({ id: "provider-id-redacted" }, { replayed: "TRUE" }),
    providerResponse({ message: "redacted", name: "other", statusCode: 409 }, { status: 409, replayed: null }),
    providerResponse({ message: "redacted", name: "invalid_idempotent_request", statusCode: 409, extra: true }, { status: 409, replayed: null }),
    providerResponse({ message: "redacted", name: "invalid_idempotent_request", statusCode: 422 }, { status: 409, replayed: null }),
    providerResponse({ message: "redacted" }, { status: 422, replayed: null }),
  ];
  for (const response of cases) {
    const transport = transportWith(async () => response.clone());
    await assert.rejects(() => transport(message()), /resend-delivery-status-unknown/);
  }
});

test("ungueltige Providerkoerper und uebergrosse Antworten bleiben unknown", async () => {
  const invalidJson = transportWith(async () => new Response("not-json", {
    status: 200,
    headers: { "idempotent-replayed": "false" },
  }));
  await assert.rejects(() => invalidJson(message()), /resend-response-invalid/);

  const oversized = transportWith(async () => new Response(JSON.stringify({
    id: "x".repeat(9 * 1024),
  }), {
    status: 200,
    headers: { "idempotent-replayed": "false" },
  }));
  await assert.rejects(() => oversized(message()), /resend-response-too-large/);
});

test("Transportfehler bleiben unknown und werden nie automatisch wiederholt", async () => {
  let calls = 0;
  const transport = transportWith(async () => {
    calls += 1;
    throw new Error("sensitive provider detail");
  });
  await assert.rejects(() => transport(message()), /resend-request-failed/);
  assert.equal(calls, 1);
});

test("freie Message-Felder erreichen den Provider nicht", async () => {
  let calls = 0;
  const transport = transportWith(async () => {
    calls += 1;
    return providerResponse({ id: "provider-id-redacted" });
  });
  await assert.rejects(() => transport(message({ to: "attacker@example.test" })), /resend-message-invalid/);
  await assert.rejects(() => transport(message({ headers: { "x-free": "value" } })), /resend-message-invalid/);
  assert.equal(calls, 0);
});

test("Dispatcher uebernimmt accepted, rejected und unknown ohne Providerdetails", async () => {
  const input = {
    schemaVersion: 1,
    type: "feedback",
    operationId,
    submittedAt: "2026-09-02T12:00:00.000Z",
    text: "Mehr Originalfassungen.",
  };

  const accepted = await createPrivateFeedbackDispatcher({
    transport: transportWith(async () => providerResponse({ id: "provider-id-redacted" })),
  }).send(input);
  assert.deepEqual(accepted, {
    ok: true,
    status: "accepted",
    type: "feedback",
    operationId,
  });

  const rejected = await createPrivateFeedbackDispatcher({
    transport: transportWith(async () => providerResponse({
      message: "redacted provider conflict",
      name: "invalid_idempotent_request",
      statusCode: 409,
    }, { status: 409, replayed: null })),
  }).send(input);
  assert.deepEqual(rejected, { ok: false, code: "delivery-rejected" });

  const unknown = await createPrivateFeedbackDispatcher({
    transport: transportWith(async () => providerResponse({ id: "provider-id-redacted" }, { replayed: null })),
  }).send(input);
  assert.deepEqual(unknown, { ok: false, code: "delivery-status-unknown" });
});

test("Runtime bindet nur Server-Secrets und behaelt HMAC sowie Aktivierung als Pflichtgates", () => {
  const runtimeSource = fs.readFileSync(
    "supabase/functions/private-mail-request/index.ts",
    "utf8",
  );
  const coreSource = fs.readFileSync(
    "supabase/functions/private-mail-request/core.js",
    "utf8",
  );

  assert.match(runtimeSource, /Deno\.env\.get\("RESEND_API_KEY"\)/);
  assert.match(runtimeSource, /Deno\.env\.get\("KD_PRIVATE_MAIL_SENDER"\)/);
  assert.match(runtimeSource, /Deno\.env\.get\("KD_PRIVATE_MAIL_RECIPIENT"\)/);
  assert.match(runtimeSource, /Deno\.env\.get\("KD_PRIVATE_MAIL_HMAC_SECRET"\)/);
  assert.match(runtimeSource, /Deno\.env\.get\("KD_PRIVATE_MAIL_TRANSPORT_ACTIVATION_SECRET"\)/);
  assert.match(coreSource, /!secretReady\(dependencies\.hmacSecret\)/);
  assert.match(coreSource, /!secretReady\(dependencies\.transportActivationSecret\)/);
  assert.match(coreSource, /typeof dependencies\.transport !== "function"/);
  assert.doesNotMatch(runtimeSource, /recipient:\s*["'][^"']+@/i);
});
