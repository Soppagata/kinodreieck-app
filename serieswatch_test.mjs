import assert from "node:assert/strict";
import { createSeriesWatchService, normalisiereBeobachteteIds } from "./src/services/seriesWatch.js";

let checks = 0;
const ok = async (name, fn) => { await fn(); checks++; console.log("✓ " + name); };

await ok("IDs werden positiv, eindeutig und sortiert", () => {
  assert.deepEqual(normalisiereBeobachteteIds([42, "7", 42, -1, 2.5, null]), [7, 42]);
});

await ok("Gastbetrieb führt keinen Request aus", async () => {
  let calls = 0;
  const service = createSeriesWatchService({
    config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_test" },
    getAccessToken: async () => null,
    fetchImpl: async () => { calls++; },
  });
  const r = await service.setObserved([42]);
  assert.equal(r.reason, "unauthenticated");
  assert.equal(calls, 0);
});

await ok("Account synchronisiert nur IDs an die atomare RPC", async () => {
  let request = null;
  const service = createSeriesWatchService({
    config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "sb_test" },
    getAccessToken: async () => "jwt-test",
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, status: 204 }; },
  });
  const r = await service.setObserved([42, 42, 77]);
  assert.equal(r.ok, true);
  assert.match(request.url, /\/rpc\/kd_set_series_watch$/);
  assert.equal(request.options.headers.Authorization, "Bearer jwt-test");
  assert.deepEqual(JSON.parse(request.options.body), { p_watchmode_ids: [42, 77] });
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("SERIES-WATCH-TEST BESTANDEN");
