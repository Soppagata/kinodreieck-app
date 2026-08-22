/* Fokussierter Laufvertrag fuer den kombinierten Produkt-Smoke.
   Vollstaendig lokal: kein Netz, keine DB und kein Anbieter. */
import assert from "node:assert/strict";
import {
  ENTDECKEN_DAILY_ONCE_ENV,
  RADAR_WEBSEARCH_ONCE_ENV,
} from "./tools/keychain_runner.mjs";
import { runRadarEntdeckenOnce } from "./tools/radar_entdecken_live.mjs";

const env = Object.freeze({
  [ENTDECKEN_DAILY_ONCE_ENV]: "keychain-budget-guard-v1",
  [RADAR_WEBSEARCH_ONCE_ENV]: "keychain-budget-guard-v1",
});

{
  const calls = [];
  const output = [];
  const result = await runRadarEntdeckenOnce({
    env,
    ausgabe: (line) => output.push(String(line)),
    async runEntdecken() { calls.push("entdecken"); return { status: "fresh", providerRequests: 1 }; },
    async runRadar() { calls.push("radar"); return { status: "confirmed", providerRequests: 1 }; },
  });
  assert.deepEqual(calls, ["entdecken", "radar"]);
  assert.deepEqual(result, {
    entdecken: { status: "fresh", providerRequests: 1 },
    radar: { status: "confirmed", providerRequests: 1 },
  });
  assert.match(output.at(-1), /2 serielle Produktrequests · kein Retry/);
}

{
  let radarCalls = 0;
  await assert.rejects(() => runRadarEntdeckenOnce({
    env,
    async runEntdecken() { throw new Error("erster Request stoppt"); },
    async runRadar() { radarCalls += 1; },
  }), /erster Request stoppt/);
  assert.equal(radarCalls, 0);
}

{
  let entdeckenCalls = 0;
  let radarCalls = 0;
  await assert.rejects(() => runRadarEntdeckenOnce({
    env,
    async runEntdecken() { entdeckenCalls += 1; return { status: "fresh" }; },
    async runRadar() { radarCalls += 1; throw new Error("zweiter Request stoppt"); },
  }), /zweiter Request stoppt/);
  assert.equal(entdeckenCalls, 1);
  assert.equal(radarCalls, 1);
}

await assert.rejects(() => runRadarEntdeckenOnce({
  env: {},
  async runEntdecken() {},
  async runRadar() {},
}), /npm-Budgetweg/);

console.log("RADAR+ENTDECKEN-LIVE-RUNNER: 4/4 lokale Checks bestanden");
