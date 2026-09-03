import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PRIVATE_MAIL_SCHEMA_VERSION,
  PRIVATE_MAIL_TYPES,
} from "./supabase/functions/_shared/privateMailContract.js";
import {
  PRIVATE_MAIL_OPERATIONAL_REASON_CODES,
} from "./supabase/functions/_shared/privateMailMessages.js";
import {
  OPERATIONAL_RETRY_MAIL_CODES,
  createOperationalRetryMailSender,
} from "./supabase/functions/_shared/operationalRetryMail.js";
import {
  RESEND_PRIVATE_MAIL_ENDPOINT,
  RESEND_PRIVATE_MAIL_SENDER,
} from "./supabase/functions/private-mail-request/resendAdapter.js";

const activationSecret = "synthetic-operational-activation-secret-v1";
const apiKey = "synthetic-resend-api-key";
const recipient = "private-recipient@example.test";
const operationId = "1111111a-222b-433c-844d-55555555555e";
const initialOperationId = "2222222a-333b-444c-855d-66666666666e";
const retryOperationId = "3333333a-444b-455c-866d-77777777777e";
const signal = AbortSignal.abort("mock-only");

function operationalInput(overrides = {}) {
  return {
    schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
    type: PRIVATE_MAIL_TYPES.OPERATIONAL_RETRY,
    operationId,
    occurredAt: "2026-09-03T12:00:00.000Z",
    taskId: "radar-six-day-trigger",
    initialOperationId,
    initialApiCall: "made",
    initialCost: "confirmed",
    initialErrorCode: "UPSTREAM_TIMEOUT",
    initialReasonCode: PRIVATE_MAIL_OPERATIONAL_REASON_CODES.INITIAL_USAGE_UNPROVEN,
    retryTriggered: true,
    retryOperationId,
    retryResult: "failed",
    retryErrorCode: "UPSTREAM_UNAVAILABLE",
    retryReasonCode: PRIVATE_MAIL_OPERATIONAL_REASON_CODES.RETRY_EXECUTION_FAILED,
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

function senderWith(fetchImpl, overrides = {}) {
  return createOperationalRetryMailSender({
    transportActivationSecret: activationSecret,
    apiKey,
    sender: RESEND_PRIVATE_MAIL_SENDER,
    recipient,
    fetchImpl,
    signalFactory: () => signal,
    ...overrides,
  });
}

function assertSafeResult(result, expectedCode) {
  assert.deepEqual(result, { code: expectedCode });
  assert.deepEqual(Object.keys(result), ["code"]);
  assert.equal(Object.isFrozen(result), true);
  const serialized = JSON.stringify(result);
  for (const sensitive of [activationSecret, apiKey, recipient, RESEND_PRIVATE_MAIL_SENDER]) {
    assert.equal(serialized.includes(sensitive), false);
  }
}

test("fehlende oder abweichende Serverbindung bleibt ohne Transport fail-closed", async () => {
  for (const override of [
    { transportActivationSecret: null },
    { transportActivationSecret: "too-short" },
    { apiKey: null },
    { apiKey: "invalid key with spaces" },
    { sender: "other@example.test" },
    { recipient: null },
    { recipient: "first@example.test,second@example.test" },
    { fetchImpl: null },
    { signalFactory: null },
  ]) {
    let calls = 0;
    const boundary = senderWith(async () => {
      calls += 1;
      return providerResponse({ id: "must-not-be-used" });
    }, override);
    const result = await boundary.send(operationalInput());
    assertSafeResult(result, OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN);
    assert.equal(calls, 0);
  }
});

test("gueltige Betriebs-Mail nutzt den gebundenen Resend-Transport genau einmal", async () => {
  let calls = 0;
  const boundary = senderWith(async (url, options) => {
    calls += 1;
    assert.equal(url, RESEND_PRIVATE_MAIL_ENDPOINT);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, `Bearer ${apiKey}`);
    assert.equal(options.headers["Idempotency-Key"], operationId);
    assert.equal(options.signal, signal);
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ["from", "html", "subject", "text", "to"].sort());
    assert.equal(body.from, RESEND_PRIVATE_MAIL_SENDER);
    assert.deepEqual(body.to, [recipient]);
    assert.equal(body.subject, "Kinodreieck: automatische KI-Nachprüfung");
    assert.match(body.text, /Retry-Ergebnis: fehlgeschlagen/);
    return providerResponse({ id: "provider-id-redacted" });
  });

  const result = await boundary.send(operationalInput());
  assert.equal(calls, 1);
  assertSafeResult(result, OPERATIONAL_RETRY_MAIL_CODES.ACCEPTED);
});

test("exakte Providerablehnung wird sicher rejected und nicht wiederholt", async () => {
  let calls = 0;
  const boundary = senderWith(async () => {
    calls += 1;
    return providerResponse({
      message: "redacted provider conflict",
      name: "invalid_idempotent_request",
      statusCode: 409,
    }, { status: 409, replayed: null });
  });

  const result = await boundary.send(operationalInput());
  assert.equal(calls, 1);
  assertSafeResult(result, OPERATIONAL_RETRY_MAIL_CODES.REJECTED);
});

test("Transportthrow bleibt ohne Rohdetail unknown und wird nicht wiederholt", async () => {
  let calls = 0;
  const sensitiveDetail = "sensitive-provider-timeout";
  const boundary = senderWith(async () => {
    calls += 1;
    throw new Error(sensitiveDetail);
  });

  const result = await boundary.send(operationalInput());
  assert.equal(calls, 1);
  assertSafeResult(result, OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN);
  assert.equal(JSON.stringify(result).includes(sensitiveDetail), false);
});

test("ungueltiger Betriebs-Payload stoppt vor Transport und bleibt unknown", async () => {
  let calls = 0;
  const boundary = senderWith(async () => {
    calls += 1;
    return providerResponse({ id: "must-not-be-used" });
  });

  for (const invalid of [
    operationalInput({ type: PRIVATE_MAIL_TYPES.FEEDBACK }),
    operationalInput({ recipient: "attacker@example.test" }),
    operationalInput({ retryTriggered: false }),
    operationalInput({ retryReasonCode: "Bearer secret" }),
  ]) {
    assertSafeResult(
      await boundary.send(invalid),
      OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN,
    );
  }
  assert.equal(calls, 0);
});

test("Bindung besitzt weder Browserweg, eigene Transportschleife noch Logausgabe", () => {
  const source = fs.readFileSync(
    "supabase/functions/_shared/operationalRetryMail.js",
    "utf8",
  );
  assert.match(source, /createPrivateOperationalRetryDispatcher/);
  assert.match(source, /createResendPrivateMailTransport/);
  assert.doesNotMatch(source, /buildPrivateOperationalRetryMessage/);
  assert.doesNotMatch(source, /\b(?:for|while)\s*\(/);
  assert.doesNotMatch(source, /setTimeout|setInterval/);
  assert.doesNotMatch(source, /console\s*\.|Deno\.serve|addEventListener|window\s*\.|document\s*\./);
  assert.doesNotMatch(source, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});
