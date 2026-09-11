import assert from "node:assert/strict";
import { createFlixpatrolFactsService } from "./src/services/flixpatrolFacts.js";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };
const chartId = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
const outsideId = "ttl_OutsideCharts123456789012";
let snapshot = { mode: "account", state: "ready", account: { id: "konto-a" }, capabilities: { remoteStorage: true } };
const listeners = new Set();
const auth = { getSnapshot: () => snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
const driver = { async getAccessToken() { return "token"; } };
const config = { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "public" };
const requests = [];
let hold = null;
const row = (sourceId, title, extras = {}) => ({
  schemaVersion: "title-facts-projection-v1", source: "flixpatrol", sourceId, mediaType: "film", status: "resolved",
  title, releaseYear: 2024, imdbId: sourceId === chartId ? "tt1234567" : "tt7654321", tmdbId: sourceId === chartId ? "123" : "321",
  description: `${title} description`, descriptionLanguage: null, runtimeMinutes: 101, premiere: "2024-01-01",
  checkedAt: "2026-09-11T10:00:00Z", fetchedAt: "2026-09-11T10:00:00Z", freshUntil: "2099-09-11T10:00:00Z",
  fresh: true, sourceUrl: `https://flixpatrol.com/title/${title.toLowerCase()}/`, genres: [], keywords: [], ...extras,
});
const fetchImpl = async (url, options) => {
  requests.push({ url, body: JSON.parse(options.body) });
  if (hold && url.endsWith("kd_title_facts_lookup")) await hold;
  if (url.endsWith("kd_flixpatrol_chart_read")) return new Response(JSON.stringify({ ok: true, chart: {
    companyId: JSON.parse(options.body).p_company_id, countryId: JSON.parse(options.body).p_country_id,
    chartType: JSON.parse(options.body).p_chart_type, chartDate: "2026-09-11", fetchedAt: "2026-09-11T10:00:00Z",
    fresh: true, items: requests.filter((request) => request.url.endsWith("kd_flixpatrol_chart_read")).length === 1
      ? [{ sourceId: chartId, ranking: 1 }] : [],
  } }), { status: 200 });
  if (url.endsWith("kd_flixpatrol_titles_read")) return new Response(JSON.stringify({ ok: true, items: [row(chartId, "Chart")] }), { status: 200 });
  if (JSON.parse(options.body).p_identities?.some((identity) => identity.flixpatrolId === chartId)) {
    return new Response(JSON.stringify({ ok: true, items: [row(chartId, "Chart")] }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true, schemaVersion: "title-facts-projection-v1", items: [row(outsideId, "Outside", {
    genres: [{ id: "gnr_vkhlVlz6xabS78vHh0DCIc5e", name: "Drama" }],
    keywords: [{ id: "kwd_NLPueMUHlNqj02pZEBFyWIhu", name: "space" }],
  })] }), { status: 200 });
};
const service = createFlixpatrolFactsService({ auth, driver, config, fetchImpl });
await service.load();
const lookedUp = await service.loadByIdentities([
  { imdbId: "tt7654321", mediaType: "film" }, { imdbId: "tt7654321", mediaType: "film" },
]);

check("Identitätslookup sendet nur deduplizierte starke IDs und Typ", () => {
  const lookup = requests.find((request) => request.url.endsWith("kd_title_facts_lookup"));
  assert.deepEqual(lookup.body, { p_identities: [{ imdbId: "tt7654321", mediaType: "film" }] });
  assert.equal(JSON.stringify(lookup.body).includes("Outside"), false);
});
check("Titel außerhalb aktueller Charts werden als DTO plus Legacy-Aliasse lesbar", () => {
  assert.equal(lookedUp[0].schemaVersion, "title-facts-projection-v1");
  assert.equal(lookedUp[0].descriptionLanguage, null);
  assert.equal(lookedUp[0].beschreibung, "Outside description");
  assert.deepEqual(lookedUp[0].genres, [{ id: "gnr_vkhlVlz6xabS78vHh0DCIc5e", name: "Drama" }]);
  assert.deepEqual(service.peek().map((fact) => fact.sourceId).sort(), [chartId, outsideId].sort());
});
const requestCount = requests.length;
await service.loadByIdentities([{ imdbId: "tt7654321", mediaType: "film" }]);
check("Letzter autorisierter Identitätslookup wird ohne weiteren RPC wiederverwendet", () => assert.equal(requests.length, requestCount));
await service.loadByIdentities([{ tmdbId: 321, mediaType: "film" }]);
check("Numerische TMDB-ID wird vor dem RPC kanonisch als String gesendet", () => {
  const lookup = requests.filter((request) => request.url.endsWith("kd_title_facts_lookup")).at(-1);
  assert.deepEqual(lookup.body, { p_identities: [{ tmdbId: "321", mediaType: "film" }] });
});
const beforeInvalid = requests.length;
assert.deepEqual(await service.loadByIdentities([{ title: "private name", imdbId: "tt7654321" }]), []);
assert.deepEqual(await service.loadByIdentities([{ mediaType: "film" }]), []);
assert.deepEqual(await service.loadByIdentities([{ flixpatrolId: 123456, mediaType: "film" }]), []);
assert.deepEqual(await service.loadByIdentities([{ imdbId: 7654321, mediaType: "film" }]), []);
assert.deepEqual(await service.loadByIdentities(Array.from({ length: 51 }, () => ({ imdbId: "tt7654321" }))), []);
check("Typ-only, Namen, falsch typisierte IDs und mehr als 50 Identitäten stoppen vor dem RPC", () => assert.equal(requests.length, beforeInvalid));

await service.loadByIdentities([{ flixpatrolId: chartId, mediaType: "film" }]);
check("Identitaetslookup erhaelt datierte Chartbelege desselben Titels", () => {
  const fact = service.peek().find((item) => item.sourceId === chartId);
  assert.equal(fact.charts.length, 1);
  assert.equal(fact.charts[0].chartDate, "2026-09-11");
  assert.equal(fact.charts[0].rank, 1);
  assert.equal(fact.description, "Chart description");
});

let staleClock = Date.parse("2026-09-11T12:00:00Z");
const staleService = createFlixpatrolFactsService({
  auth, driver, config, now: () => staleClock, cacheTtlMs: 5000, emptyCacheTtlMs: 100,
  fetchImpl: async () => new Response(JSON.stringify({ ok: true, items: [row(outsideId, "Old", {
    fresh: false, freshUntil: "2026-09-10T12:00:00Z",
  })] }), { status: 200 }),
});
const staleFacts = await staleService.loadByIdentities([{ tmdbId: "321", mediaType: "film" }]);
check("Belegte alte Fakten bleiben fresh:false für die kurze Lese-TTL sichtbar", () => {
  assert.equal(staleFacts[0].fresh, false);
  assert.equal(staleService.peek()[0].beschreibung, "Old description");
});
staleClock += 101;
check("Die kurze Lese-TTL alter Fakten läuft weiterhin ab", () => assert.deepEqual(staleService.peek(), []));

let release;
hold = new Promise((resolve) => { release = resolve; });
const pending = service.loadByIdentities([{ flixpatrolId: outsideId, mediaType: "film" }]);
await Promise.resolve();
snapshot = { mode: "guest", state: "ready", account: null, capabilities: { remoteStorage: false } };
listeners.forEach((listener) => listener(snapshot));
release();
assert.deepEqual(await pending, []);
check("Logout während Identitätslookup verwirft Antwort und leert beide Cacheflächen", () => assert.deepEqual(service.peek(), []));

console.log(`data_plan_foundation_service_test: ${checks} Checks bestanden.`);
