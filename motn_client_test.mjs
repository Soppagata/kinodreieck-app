import assert from "node:assert/strict";
import { test } from "node:test";
import { createMotnClient } from "./supabase/functions/_shared/motnClient.js";
import { createMotnHandler } from "./supabase/functions/streaming-motn/core.js";

test("MotN uses the direct v4 AT API, counts attempts, and stops at its cap", async () => {
  const calls = [];
  const client = createMotnClient({ apiKey: "fixture-motn-key", maxRequests: 1, fetchImpl: async (...args) => {
    calls.push(args); return Response.json({ id: "one" });
  } });
  await client.show("tt1302011");
  assert.equal(new URL(calls[0][0]).origin, "https://api.movieofthenight.com");
  assert.equal(new URL(calls[0][0]).searchParams.get("country"), "at");
  assert.equal(calls[0][1].headers["X-API-Key"], "fixture-motn-key");
  assert.equal(calls[0][1].redirect, "error");
  await assert.rejects(client.show("tt0138749"), { code: "MOTN_REQUEST_LIMIT" });
  assert.equal(calls.length, 1);
});

test("Invalid identifiers, wrong catalogs, missing keys stop before a provider call", async () => {
  let count = 0;
  const client = createMotnClient({ apiKey: "fixture-key", fetchImpl: async () => { count++; } });
  await assert.rejects(client.show("../../secrets"), { code: "MOTN_INVALID_ID" });
  await assert.rejects(client.changes({ type: "new", from: 1, to: 2, catalogs: ["prime.rent"] }), { code: "MOTN_INVALID_QUERY" });
  await assert.rejects(createMotnClient({ fetchImpl: async () => { count++; } }).show("tt1302011"), { code: "MOTN_NOT_CONFIGURED" });
  assert.equal(count, 0);
});

test("Provider errors are sanitized and never retried", async () => {
  let count = 0;
  const client = createMotnClient({ apiKey: "fixture-provider", fetchImpl: async () => {
    count++; return new Response("PRIVATE_PROVIDER_ERROR fixture-provider", { status: 429 });
  } });
  await assert.rejects(client.show("tt1302011"), error => error.code === "MOTN_HTTP_ERROR"
    && error.status === 429 && !error.message.includes("fixture-provider"));
  assert.equal(count, 1);
});

test("The sync rejects browser/unauthenticated requests before any provider request", async () => {
  let count = 0;
  const handler = createMotnHandler({ serviceKeys: ["fixture-admin"], apiKey: "fixture-key", fetchImpl: async () => { count++; } });
  assert.equal((await handler(new Request("https://example.test", { method: "POST" }))).status, 403);
  assert.equal((await handler(new Request("https://example.test"))).status, 405);
  assert.equal(count, 0);
});

test("The retired comparison and authenticated browser calls cannot bypass the shared ledger", async () => {
  const handler = createMotnHandler({ serviceKeys: ["fixture-admin"], apiKey: "fixture-key",
    fetchImpl: async () => { throw new Error("must not fetch"); } });
  const headers = { apikey: "fixture-admin", authorization: "Bearer fixture-admin", "x-kd-motn": "compare-at-v1" };
  assert.equal((await handler(new Request("https://example.test", { method: "POST", headers }))).status, 400);
  headers["x-kd-motn"] = "scheduled-at-v1";
  headers.origin = "https://example.test";
  assert.equal((await handler(new Request("https://example.test", { method: "POST", headers }))).status, 403);
});

test("The usage ticker is provider-free even without a MotN key and remains server-only",async()=>{
  const rpcs=[];
  const handler=createMotnHandler({serviceKeys:["fixture-admin"],rpc:async(name)=>{rpcs.push(name);return {format:1,source:"kinodreieck-reservations"};},
    fetchImpl:async()=>{throw new Error("must not fetch");}});
  const headers={apikey:"fixture-admin",authorization:"Bearer fixture-admin","x-kd-motn":"usage-at-v1"};
  const response=await handler(new Request("https://example.test",{method:"POST",headers}));
  assert.equal(response.status,200);assert.equal((await response.json()).providerRequests,0);
  assert.deepEqual(rpcs,["kd_motn_usage_status"]);
  assert.equal((await handler(new Request("https://example.test",{method:"POST",headers:{...headers,origin:"https://example.test"}}))).status,403);
  assert.equal((await handler(new Request("https://example.test",{method:"POST",headers:{"x-kd-motn":"usage-at-v1"}}))).status,403);
  assert.deepEqual(rpcs,["kd_motn_usage_status"]);
});
