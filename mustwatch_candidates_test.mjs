import assert from "node:assert/strict";
import { runtimeConfig } from "./src/config/runtime.js";
import { collectMustwatchStreamingIds } from "./src/controllers/useMustwatchCandidatesController.js";
import { createMustwatchCandidatesService } from "./src/services/mustwatchCandidates.js";

function createAuth(accountId = "account-a") {
  let snapshot = {
    mode: "account", state: "ready", account: { id: accountId },
    capabilities: { remoteStorage: true },
  };
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setAccount(id) {
      snapshot = id ? { ...snapshot, account: { id } }
        : { mode: "guest", state: "ready", account: null, capabilities: { remoteStorage: false } };
      for (const listener of listeners) listener(snapshot);
    },
  };
}

const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; },
});

let now = Date.parse("2026-09-14T10:00:00.000Z");
const baseUrl = runtimeConfig.supabaseUrl || "https://kinodreieck.test";
const auth = createAuth();
const calls = [];
const pending = new Map();
const fetchImpl = async (_url, options) => {
  const request = JSON.parse(options.body).p_request;
  calls.push({ request, authorization: options.headers.Authorization });
  if (request.query.startsWith("slow") || request.ids.includes("slow-id")) {
    return await new Promise((resolve, reject) => {
      const finish = () => reject(abortError());
      options.signal?.addEventListener("abort", finish, { once: true });
      pending.set(request.query || request.ids[0], { resolve, reject });
    });
  }
  const ids = request.ids.length ? request.ids : [`search:${request.query}`];
  return response({
    format: 1, status: "ready", version: "fixture-1",
    expiresAt: new Date(now + 1000).toISOString(),
    items: ids.map((id) => ({
      id, titel: `Titel ${id}`, dienste: ["MUBI"],
      streaming_aliases: id === "legacy" ? ["legacy"] : [],
      notiz: "darf die Grenze nicht verlassen", bewertung: 5,
    })),
  });
};
const service = createMustwatchCandidatesService({
  auth,
  driver: { getAccessToken: async ({ erwarteteKontoId }) => `token-${erwarteteKontoId}` },
  getConnection: () => ({ url: baseUrl, key: "public-test-key" }),
  fetchImpl,
  now: () => now,
});

assert.deepEqual(collectMustwatchStreamingIds([
  { verknuepfung: { ziel: "streaming", id: 7 } },
  { verknuepfung: { ziel: "master", id: "x" } },
  { verknuepfung: { ziel: "streaming", id: "7" } },
  { verknuepfung: null },
]), ["7"]);

const ids = Array.from({ length: 501 }, (_, index) => `id-${index}`);
const first = await service.loadByIds(ids);
assert.equal(first.items.length, 501);
assert.equal(calls.length, 2, "501 IDs werden in genau zwei seriellen RPCs geladen");
assert.deepEqual(calls.map((call) => call.request.ids.length), [500, 1]);
assert.ok(calls.every((call) => call.request.query === "" && call.request.limit === 6));
assert.ok(calls.every((call) => call.authorization === "Bearer token-account-a"));
assert.equal(Object.hasOwn(first.items[0], "notiz"), false);
assert.equal(Object.hasOwn(first.items[0], "bewertung"), false);

await service.loadByIds(ids);
assert.equal(calls.length, 2, "frischer kontogebundener Sitzungscache vermeidet Doppelreads");
now += 2000;
await service.loadByIds([ids[0]]);
assert.equal(calls.length, 3, "abgelaufene Antworten werden nicht aus dem Sitzungscache behauptet");

const searchOne = await service.search("Solaris");
assert.equal(searchOne.items[0].id, "search:Solaris");
const afterSearch = calls.length;
await service.search("Solaris");
assert.equal(calls.length, afterSearch, "identische frische Pickersuche nutzt den begrenzten Querycache");
assert.deepEqual(calls.at(-1).request, { format: 1, ids: [], query: "Solaris", limit: 6 });

const slowSearch = service.search("slow-a");
await Promise.resolve();
const fastSearch = service.search("Stalker");
await assert.rejects(slowSearch, (error) => error?.reason === "timeout");
assert.equal((await fastSearch).items[0].id, "search:Stalker");

const accountBound = service.loadByIds(["slow-id"]);
await Promise.resolve();
auth.setAccount("account-b");
await assert.rejects(accountBound);
const accountB = await service.loadByIds(["account-b-id"]);
assert.equal(accountB.items[0].id, "account-b-id");
assert.equal(calls.at(-1).authorization, "Bearer token-account-b");

service.destroy();

const missingService = createMustwatchCandidatesService({
  auth,
  driver: { getAccessToken: async () => "token" },
  getConnection: () => ({ url: baseUrl, key: "public-test-key" }),
  fetchImpl: async () => response({
    code: "PGRST202", message: "Could not find kd_mustwatch_streaming_candidates in the schema cache",
  }, 404),
});
await assert.rejects(
  missingService.loadByIds(["one"]),
  (error) => error?.code === "not-implemented" && error?.reason === "mustwatch-candidates-rpc-missing",
);
missingService.destroy();

console.log("Must-Watch-Kandidaten-Service: 24/24 Checks bestanden.");
