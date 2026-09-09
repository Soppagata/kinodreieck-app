import assert from "node:assert/strict";
import { createFlixPatrolUsageHandler, normalizeFlixPatrolUsage, parseFlixPatrolServiceKeys } from "./supabase/functions/flixpatrol-usage/core.js";

const modern = "sb_secret_test-only";
const legacy = "legacy.service.role.test-only";
const usage = {
  attemptedRequests: 4, completedRequests: 4, successfulRequests: 3, failedRequests: 1,
  lastStatus: "succeeded", lastAttemptAt: "2026-09-09T15:30:00Z",
  lastSuccessAt: "2026-09-09T15:30:01Z", planLimit: 1000,
  quota: { used: 21, available: 979, limit: 1000, limitExtra: 0, resetAt: "2026-10-01T00:00:00Z", observedAt: "2026-09-09T15:30:01Z" },
};
const headers = (key = modern) => ({ apikey: key, authorization: `Bearer ${key}` });
let checks = 0;
async function check(name, fn) { await fn(); checks += 1; console.log(`✓ ${name}`); }

await check("liest moderne und Legacy-Admin-Keys", () => {
  assert.deepEqual(parseFlixPatrolServiceKeys(JSON.stringify({ default: modern, rotated: "sb_secret_next" }), legacy), [modern, "sb_secret_next", legacy]);
  assert.deepEqual(parseFlixPatrolServiceKeys("kaputt", legacy), [legacy]);
});

await check("GET liest ausschließlich den gespeicherten Stand", async () => {
  let refreshes = 0;
  const handler = createFlixPatrolUsageHandler({ serviceKeys: [modern], readUsage: async () => usage, refreshUsage: async () => { refreshes += 1; } });
  const response = await handler(new Request("https://example.test/flixpatrol-usage", { headers: headers() }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: "read", providerRequests: 0, usage });
  assert.equal(refreshes, 0);
});

await check("POST mit exaktem Serververtrag startet genau einen Quota-Refresh", async () => {
  let refreshes = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern, legacy], readUsage: async () => assert.fail(),
    refreshUsage: async () => { refreshes += 1; return { usage, providerRequests: 1 }; },
  });
  const response = await handler(new Request("https://example.test/flixpatrol-usage", {
    method: "POST", headers: { ...headers(legacy), "content-length": "0", "x-kd-flixpatrol-usage": "scheduled-daily-v1" },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: "refreshed", providerRequests: 1, usage });
  assert.equal(refreshes, 1);
});

await check("Browser, Body, falscher Header und ungleiche Keys bleiben wirkungslos", async () => {
  let effects = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern], readUsage: async () => { effects += 1; return usage; },
    refreshUsage: async () => { effects += 1; return { usage, providerRequests: 1 }; },
  });
  const cases = [
    new Request("https://example.test", { headers: { ...headers(), origin: "https://kinodreieck.at" } }),
    new Request("https://example.test", { method: "POST", headers: { ...headers(), "x-kd-flixpatrol-usage": "scheduled-daily-v1" }, body: "{}" }),
    new Request("https://example.test", { method: "POST", headers: headers() }),
    new Request("https://example.test", { headers: { apikey: modern, authorization: "Bearer anderer-key" } }),
  ];
  for (const request of cases) assert.notEqual((await handler(request)).status, 200);
  assert.equal(effects, 0);
});

await check("Fehlerantwort nennt nur Code und konservative Requestzahl", async () => {
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern], readUsage: async () => usage,
    refreshUsage: async () => { throw Object.assign(new Error("provider secret detail"), { code: "FLIXPATROL_HTTP_ERROR", providerRequests: 1 }); },
  });
  const response = await handler(new Request("https://example.test", {
    method: "POST", headers: { ...headers(), "x-kd-flixpatrol-usage": "scheduled-daily-v1" },
  }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, status: "failed", code: "FLIXPATROL_HTTP_ERROR", providerRequests: 1 });
});

await check("inkonsistente Tickerwerte werden abgelehnt", () => {
  assert.equal(normalizeFlixPatrolUsage({ ...usage, completedRequests: 3 }), null);
  assert.equal(normalizeFlixPatrolUsage({ ...usage, planLimit: 999 }), null);
  assert.equal(normalizeFlixPatrolUsage({ ...usage, quota: { ...usage.quota, used: "21" } }), null);
});

console.log(`${checks} FlixPatrol-Function-Prüfungen bestanden.`);
