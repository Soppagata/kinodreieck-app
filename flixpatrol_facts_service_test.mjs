import assert from "node:assert/strict";
import { createFlixpatrolFactsService } from "./src/services/flixpatrolFacts.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const sourceId = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
let snapshot = { mode: "account", state: "ready", account: { id: "konto-a" }, capabilities: { remoteStorage: true } };
const listeners = new Set();
const auth = { getSnapshot: () => snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
const tokenCalls = [];
const driver = { async getAccessToken(options) { tokenCalls.push(options); return `token-${options.erwarteteKontoId}`; } };
const requests = [];
let holdFirst = null;
const fetchImpl = async (url, options) => {
  requests.push({ url, options, body: JSON.parse(options.body) });
  if (holdFirst) { const hold = holdFirst; holdFirst = null; await hold; }
  const name = String(url).split("/").at(-1);
  if (name === "kd_flixpatrol_chart_read") return new Response(JSON.stringify({ ok: true, chart: {
    companyId: JSON.parse(options.body).p_company_id, countryId: JSON.parse(options.body).p_country_id,
    chartType: JSON.parse(options.body).p_chart_type, chartDate: "2026-09-09", fetchedAt: "2026-09-09T11:00:00Z",
    fresh: true, items: [{ sourceId, ranking: 1 }],
  } }), { status: 200 });
  return new Response(JSON.stringify({ ok: true, items: [{ sourceId, mediaType: "film", status: "resolved",
    title: "Alien", releaseYear: 1979, imdbId: "tt0078748", fresh: true }] }), { status: 200 });
};
const config = { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public-key" };
const service = createFlixpatrolFactsService({ auth, driver, config, fetchImpl });

const facts = await service.load();
check("Fünf feste Chartreads münden in genau einen gebündelten Titles-Read", () => {
  assert.equal(requests.filter((r) => r.url.endsWith("kd_flixpatrol_chart_read")).length, 5);
  assert.equal(requests.filter((r) => r.url.endsWith("kd_flixpatrol_titles_read")).length, 1);
  assert.deepEqual(requests.at(-1).body.p_source_ids, [sourceId]);
  assert.equal(facts.length, 1);
});
check("Jeder RPC nutzt frisches Kontotoken und den öffentlichen Projektschlüssel", () => {
  assert.equal(tokenCalls.length, 1);
  assert.ok(requests.every((r) => r.options.headers.Authorization === "Bearer token-konto-a"
    && r.options.headers.apikey === "public-key"));
});
await service.load();
check("Der kontogebundene In-Memory-Cache verhindert redundante RPC-Schleifen", () => assert.equal(requests.length, 6));

snapshot = { mode: "guest", state: "ready", account: null, capabilities: { remoteStorage: false } };
listeners.forEach((listener) => listener(snapshot));
check("Abmeldung leert die Projektion ohne Netzwerk", () => assert.deepEqual(service.peek(), []));
const vorGuest = requests.length;
assert.deepEqual(await service.load(), []);
check("Gast und fehlende Capability enden vor Token und RPC", () => assert.equal(requests.length, vorGuest));

snapshot = { mode: "account", state: "ready", account: { id: "konto-a" }, capabilities: { remoteStorage: true } };
listeners.forEach((listener) => listener(snapshot));
let release;
holdFirst = new Promise((resolve) => { release = resolve; });
const alt = service.load();
await Promise.resolve();
snapshot = { mode: "account", state: "ready", account: { id: "konto-b" }, capabilities: { remoteStorage: true } };
listeners.forEach((listener) => listener(snapshot));
release();
assert.deepEqual(await alt, []);
check("A→B während Await verwirft die verspätete A-Antwort", () => assert.deepEqual(service.peek(), []));

snapshot = { mode: "account", state: "ready", account: { id: "konto-a" }, capabilities: { remoteStorage: true } };
listeners.forEach((listener) => listener(snapshot));
holdFirst = new Promise((resolve) => { release = resolve; });
const wiederkehrend = service.load();
await Promise.resolve();
snapshot = { mode: "guest", state: "ready", account: null, capabilities: { remoteStorage: false } };
listeners.forEach((listener) => listener(snapshot));
snapshot = { mode: "account", state: "ready", account: { id: "konto-a" }, capabilities: { remoteStorage: true } };
listeners.forEach((listener) => listener(snapshot));
release();
assert.deepEqual(await wiederkehrend, []);
check("A→Gast→A während Await kann den alten Lauf nicht wieder freigeben", () => assert.deepEqual(service.peek(), []));

let clock = 1_800_000_000_000;
const ttlRequests = [];
const ttlService = createFlixpatrolFactsService({ auth, driver, config,
  now: () => clock, cacheTtlMs: 1000, emptyCacheTtlMs: 100,
  fetchImpl: async (...args) => { ttlRequests.push(args[0]); return fetchImpl(...args); } });
await ttlService.load();
await ttlService.load();
clock += 1001;
await ttlService.load();
check("Fakten werden nur bis zur injizierten TTL wiederverwendet", () => assert.equal(ttlRequests.length, 12));

const emptyRequests = [];
const emptyFetch = async (url, options) => {
  emptyRequests.push(url);
  return new Response(JSON.stringify({ ok: true, chart: {
    companyId: JSON.parse(options.body).p_company_id, countryId: JSON.parse(options.body).p_country_id,
    chartType: JSON.parse(options.body).p_chart_type, chartDate: "2026-09-09", fetchedAt: "2026-09-09T11:00:00Z",
    fresh: true, items: [],
  } }), { status: 200 });
};
const emptyService = createFlixpatrolFactsService({ auth, driver, config, fetchImpl: emptyFetch,
  now: () => clock, cacheTtlMs: 1000, emptyCacheTtlMs: 100 });
assert.deepEqual(await emptyService.load(), []);
assert.deepEqual(await emptyService.load(), []);
check("Erfolgreiche leere Chartresultate werden kurz ohne Titles-Read gecacht", () => assert.equal(emptyRequests.length, 5));
clock += 101;
await emptyService.load();
check("Auch der leere Cache läuft kontrolliert ab", () => assert.equal(emptyRequests.length, 10));

const isolateAuth = () => {
  let value = { mode: "account", state: "ready", account: { id: "konto-a" }, capabilities: { remoteStorage: true } };
  const ownListeners = new Set();
  return { auth: { getSnapshot: () => value, subscribe(fn) { ownListeners.add(fn); return () => ownListeners.delete(fn); } },
    set(next) { value = next; ownListeners.forEach((listener) => listener(value)); } };
};
const clearAuth = isolateAuth();
let clearRelease;
const clearHold = new Promise((resolve) => { clearRelease = resolve; });
let clearHeld = false;
const clearService = createFlixpatrolFactsService({ auth: clearAuth.auth, driver, config,
  fetchImpl: async (...args) => { if (!clearHeld) { clearHeld = true; await clearHold; } return fetchImpl(...args); } });
const clearedLoad = clearService.load();
await Promise.resolve();
clearService.clear();
clearRelease();
assert.deepEqual(await clearedLoad, []);
check("Explizites clear invalidiert auch einen laufenden Load", () => assert.deepEqual(clearService.peek(), []));

const projectAuth = isolateAuth();
const mutableConfig = { supabaseUrl: "https://project-a.supabase.co", supabasePublishableKey: "public-key" };
let projectRelease;
const projectHold = new Promise((resolve) => { projectRelease = resolve; });
let projectHeld = false;
const projectService = createFlixpatrolFactsService({ auth: projectAuth.auth, driver, config: mutableConfig,
  fetchImpl: async (...args) => { if (!projectHeld) { projectHeld = true; await projectHold; } return fetchImpl(...args); } });
const projectLoad = projectService.load();
await Promise.resolve();
mutableConfig.supabaseUrl = "https://project-b.supabase.co";
projectRelease();
assert.deepEqual(await projectLoad, []);
check("Projektwechsel während Await verwirft die alte Projektion", () => assert.deepEqual(projectService.peek(), []));

console.log(`flixpatrol_facts_service_test: ${checks} Checks bestanden.`);
