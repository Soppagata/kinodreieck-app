import assert from "node:assert/strict";
import { createSeriesWatchService, normalisiereBeobachteteIds } from "./src/services/seriesWatch.js";

let checks = 0;
const ok = async (name, fn) => { await fn(); checks++; console.log("✓ " + name); };
const aktiveSession = (id = "A") => ({
  mode: "account", state: "ready", account: { id },
  capabilities: { remoteStorage: true, personalAi: false },
});

await ok("IDs werden positiv, eindeutig und sortiert", () => {
  assert.deepEqual(normalisiereBeobachteteIds([42, "7", 42, -1, 2.5, null]), [7, 42]);
});

await ok("Gastbetrieb führt keinen Request aus", async () => {
  let calls = 0;
  const service = createSeriesWatchService({
    config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_test" },
    getSession: () => ({ mode: "guest", state: "ready", account: null, capabilities: {} }),
    getAccessToken: async () => null,
    fetchImpl: async () => { calls++; },
  });
  const r = await service.setObserved([42]);
  assert.equal(r.reason, "unauthenticated");
  assert.equal(calls, 0);
});

await ok("Inaktiv, unbekannt und alte Session ohne Capability senden weder Token- noch RPC-Request", async () => {
  for (const session of [
    { mode: "account", state: "ready", account: { id: "A" }, capabilities: { remoteStorage: false } },
    { mode: "account", state: "degraded", account: { id: "A" }, capabilities: { remoteStorage: true } },
    { mode: "account", state: "ready", account: { id: "A" }, capabilities: {} },
  ]) {
    let tokenCalls = 0;
    let requests = 0;
    const service = createSeriesWatchService({
      config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_test" },
      getSession: () => session,
      getAccessToken: async () => { tokenCalls++; return "jwt-test"; },
      fetchImpl: async () => { requests++; return { ok: true }; },
    });
    const result = await service.setObserved([42], "A");
    assert.equal(result.reason, "forbidden");
    assert.equal(tokenCalls, 0);
    assert.equal(requests, 0);
  }
});

await ok("Account synchronisiert nur IDs an die atomare RPC", async () => {
  let request = null;
  const service = createSeriesWatchService({
    config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_test" },
    getSession: () => aktiveSession(),
    getAccountId: () => "A",
    getAccessToken: async () => "jwt-test",
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, status: 204 }; },
  });
  const r = await service.setObserved([42, 42, 77]);
  assert.equal(r.ok, true);
  assert.match(request.url, /\/rpc\/kd_set_series_watch$/);
  assert.equal(request.options.headers.Authorization, "Bearer jwt-test");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), { p_watchmode_ids: [42, 77] });
});

await ok("Verspäteter A-Callback kann nach A→B weder B-Token noch B-RPC verwenden", async () => {
  let aktivesKonto = "A";
  let requests = 0;
  let tokenOptionen = null;
  const service = createSeriesWatchService({
    config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_test" },
    getSession: () => aktiveSession(aktivesKonto),
    getAccountId: () => aktivesKonto,
    getAccessToken: async (optionen) => {
      tokenOptionen = optionen;
      aktivesKonto = "B";
      return "token-a";
    },
    fetchImpl: async () => { requests++; return { ok: true }; },
  });
  const r = await service.setObserved([42], "A");
  assert.equal(tokenOptionen.erwarteteKontoId, "A");
  assert.equal(r.reason, "account-changed");
  assert.equal(requests, 0);
});

await ok("Widerruf während eines laufenden Requests kann keinen alten Erfolg bestätigen", async () => {
  let session = aktiveSession();
  const service = createSeriesWatchService({
    config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_test" },
    getSession: () => session,
    getAccountId: () => "A",
    getAccessToken: async () => "token-a",
    fetchImpl: async () => {
      session = { ...aktiveSession(), capabilities: { remoteStorage: false, personalAi: false } };
      return { ok: true, status: 204 };
    },
  });
  const result = await service.setObserved([42], "A");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "forbidden");
});

await ok("Produkt-Effect bindet Watch-Sync an Konto-ID und invalidiert A→B", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /setObserved\(ids, expectedAccountId\)/);
  assert.match(app, /const signatur = expectedAccountId \+ "\|" \+ JSON\.stringify\(ids\)/);
  assert.match(app, /remoteKontoAktiv, session\.account\?\.id, bootDone/);
  assert.match(app, /session\.capabilities\?\.remoteStorage === true/);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("SERIES-WATCH-TEST BESTANDEN");
