import assert from "node:assert/strict";
import { createFlixPatrolClient, FlixPatrolClientError, parseFlixPatrolQuota } from "./supabase/functions/_shared/flixpatrolClient.js";

const quotaPayload = { type: "apiquota", data: { used: 17, available: 983, limit: 1000, limitExtra: 0, resetAt: "2026-10-01T00:00:00Z" } };
let checks = 0;
async function check(name, fn) { await fn(); checks += 1; console.log(`✓ ${name}`); }

await check("akzeptiert nur den exakten offiziellen Quota-Vertrag", () => {
  assert.deepEqual(parseFlixPatrolQuota(quotaPayload), quotaPayload.data);
  assert.equal(parseFlixPatrolQuota({ ...quotaPayload, extra: true }), null);
  assert.equal(parseFlixPatrolQuota({ type: "apiquota", data: { ...quotaPayload.data, used: "17" } }), null);
  assert.equal(parseFlixPatrolQuota({ type: "apiquota", data: { ...quotaPayload.data, resetAt: "morgen" } }), null);
});

await check("zählt vor genau einem festen GET und finalisiert genau einmal", async () => {
  const events = [];
  const client = createFlixPatrolClient({
    apiKey: "provider-secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
    beginOperation: async (value) => { events.push(["begin", value]); return { ok: true, claim: true, replay: false }; },
    fetchImpl: async (url, init) => { events.push(["fetch", url, init]); return { ok: true, status: 200, json: async () => quotaPayload }; },
    finishOperation: async (value) => { events.push(["finish", value]); return { ok: true, replay: false, status: "succeeded", usage: { marker: true } }; },
  });
  const result = await client.fetchQuota();
  assert.equal(result.providerRequests, 1);
  assert.deepEqual(events.map(([name]) => name), ["begin", "fetch", "finish"]);
  assert.equal(events[1][1], "https://api.flixpatrol.com/v2/quota");
  assert.equal(events[1][2].method, "GET");
  assert.equal(events[1][2].redirect, "error");
  assert.equal(events[1][2].headers.Authorization, `Basic ${btoa("provider-secret:")}`);
  assert.equal(events[2][1].status, "succeeded");
  assert.deepEqual(events[2][1].quota, quotaPayload.data);
});

await check("startet bei abgelehntem Ledger keinen Providerrequest", async () => {
  let fetches = 0;
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000002",
    beginOperation: async () => ({ ok: true, claim: false, replay: true }),
    finishOperation: async () => assert.fail("finish darf nicht laufen"),
    fetchImpl: async () => { fetches += 1; },
  });
  await assert.rejects(client.fetchQuota(), (error) => error instanceof FlixPatrolClientError && error.code === "FLIXPATROL_LEDGER_BEGIN_REJECTED" && error.providerRequests === 0);
  assert.equal(fetches, 0);
});

for (const scenario of [
  { name: "Transportfehler", fetch: async () => { throw new Error("secret transport"); }, status: "transport_error", code: "FLIXPATROL_TRANSPORT_ERROR", http: null },
  { name: "HTTP-Fehler", fetch: async () => ({ ok: false, status: 429 }), status: "http_error", code: "FLIXPATROL_HTTP_ERROR", http: 429 },
  { name: "kaputte Antwort", fetch: async () => ({ ok: true, status: 200, json: async () => ({ type: "apiquota", data: null }) }), status: "invalid_response", code: "FLIXPATROL_INVALID_RESPONSE", http: 200 },
]) {
  await check(`${scenario.name} bleibt gezählt, terminal und ohne Retry`, async () => {
    let fetches = 0;
    const finishes = [];
    const client = createFlixPatrolClient({
      apiKey: "secret",
      randomUUID: () => "00000000-0000-4000-8000-000000000003",
      beginOperation: async () => ({ ok: true, claim: true, replay: false }),
      fetchImpl: async (...args) => { fetches += 1; return scenario.fetch(...args); },
      finishOperation: async (value) => { finishes.push(value); return { ok: true, replay: false, status: scenario.status, usage: {} }; },
    });
    await assert.rejects(client.fetchQuota(), (error) => error.code === scenario.code && error.providerRequests === 1 && error.httpStatus === scenario.http);
    assert.equal(fetches, 1);
    assert.equal(finishes.length, 1);
    assert.deepEqual(finishes[0].quota, null);
    assert.equal(finishes[0].status, scenario.status);
  });
}

await check("unbelegter Abschluss meldet den bereits gestarteten Request konservativ", async () => {
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000004",
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => quotaPayload }),
    finishOperation: async () => { throw new Error("db unavailable"); },
  });
  await assert.rejects(client.fetchQuota(), (error) => error.code === "FLIXPATROL_LEDGER_FINISH_FAILED" && error.providerRequests === 1);
});

console.log(`${checks} FlixPatrol-Client-Prüfungen bestanden.`);
