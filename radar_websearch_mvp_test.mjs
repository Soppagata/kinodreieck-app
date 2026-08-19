/* Paket A: ausschließlich Mock-/Offline-Verträge. Kein Provider, kein Netz,
   keine Datenbank und keine Live-KI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  RADAR_WEBSEARCH_EVENT_TYPES,
  evaluateRadarWebsearchResponse,
  validateRadarWebsearchRequest,
} from "./supabase/functions/radar-websearch-task/contract.js";
import { runRadarWebsearchCheck } from "./supabase/functions/radar-websearch-task/runner.js";
import {
  createRadarWebsearchMemoryRepository,
  createRadarWebsearchMockAdapter,
} from "./supabase/functions/radar-websearch-task/mockAdapter.js";
import { createRadarWebsearchService } from "./src/services/radarWebsearch.js";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const target = Object.freeze({
  targetId: "imdb:tt0137523",
  canonicalTitle: "Fight Club",
  releaseYear: 1999,
  mediaType: "film",
  region: "AT",
  scopes: ["cinema", "streaming"],
});
const checkedAt = "2026-08-17T12:00:00.000Z";
const official = Object.freeze({
  sourceId: "studio-official",
  domain: "studio.example",
  publisherFamily: "studio",
  sourceClass: "official",
  rightsStatus: "approved",
  attributionApproved: true,
  subdomainsAllowed: false,
  active: true,
});
const editorialA = Object.freeze({
  sourceId: "news-a",
  domain: "news-a.example",
  publisherFamily: "news-a",
  sourceClass: "editorial",
  rightsStatus: "approved",
  attributionApproved: true,
  subdomainsAllowed: false,
  active: true,
});
const editorialB = Object.freeze({
  sourceId: "news-b",
  domain: "news-b.example",
  publisherFamily: "news-b",
  sourceClass: "editorial",
  rightsStatus: "approved",
  attributionApproved: true,
  subdomainsAllowed: false,
  active: true,
});
const sameFamily = Object.freeze({
  ...editorialB,
  sourceId: "news-a-syndicated",
  domain: "syndicated.example",
  publisherFamily: "news-a",
});
const sources = Object.freeze([official, editorialA, editorialB, sameFamily]);

function evidence(source, path = "start") {
  return {
    url: `https://${source.domain}/${path}`,
    sourceDomain: source.domain,
    sourceTitle: `${source.publisherFamily} Termin`,
    publishedAt: "2026-08-17",
    claim: "Österreichstart am 21. August 2026.",
  };
}

function envelope({
  status = "confirmed",
  date = "2026-08-21",
  proof = [evidence(editorialA), evidence(editorialB)],
  targetPatch = {},
  eventPatch = {},
  searchResultCount = proof.length,
} = {}) {
  return {
    searchResultCount,
    response: {
      status,
      checkedAt,
      target: {
        targetId: target.targetId,
        canonicalTitle: target.canonicalTitle,
        releaseYear: target.releaseYear,
        mediaType: target.mediaType,
        region: target.region,
        ...targetPatch,
      },
      events: status === "confirmed" ? [{
        eventType: "kinostart_at",
        eventDate: date,
        evidence: proof,
        ...eventPatch,
      }] : [],
    },
  };
}

function repository(sourceRows = sources) {
  return createRadarWebsearchMemoryRepository({ target, sources: sourceRows });
}

await check("Requestvertrag akzeptiert nur globale Zieldaten", () => {
  const accepted = validateRadarWebsearchRequest(target);
  assert.equal(accepted.ok, true);
  assert.deepEqual(Object.keys(accepted.value).sort(), [
    "canonicalTitle", "mediaType", "region", "releaseYear", "scopes", "targetId",
  ]);
  assert.equal(validateRadarWebsearchRequest({ ...target, accountId: "max-account" }).ok, false);
  assert.equal(validateRadarWebsearchRequest({ ...target, profile: {} }).ok, false);
  assert.equal(validateRadarWebsearchRequest({ ...target, targetId: "fixture:film:1" }).ok, false);
});

await check("Antwortvertrag kennt genau die vier Radar-Ereignisarten", () => {
  assert.deepEqual(RADAR_WEBSEARCH_EVENT_TYPES, [
    "kinostart_at", "streamingstart_at", "serienstart", "staffelstart",
  ]);
});

await check("Zwei unabhängige redaktionelle Quellen bestätigen genau ein Event", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelope());
  const repo = repository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
    operationId: () => "10000000-0000-4000-8000-000000000001",
  });
  assert.equal(result.status, "confirmed");
  assert.equal(result.writes, 1);
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(Object.keys(adapter.calls[0]).sort(), Object.keys(target).sort());
  assert.equal("accountId" in adapter.calls[0], false);
  assert.equal("profile" in adapter.calls[0], false);
  assert.equal(repo.events.size, 1);
  assert.equal([...repo.events.values()][0].versions.length, 1);
  assert.equal(result.feed.events[0].evidence.length, 2);
});

await check("Eine offizielle Primärquelle reicht aus", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelope({ proof: [evidence(official)] }));
  const repo = repository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
  });
  assert.equal(result.status, "confirmed");
  assert.equal(result.feed.events[0].evidence.length, 1);
});

await check("Eine einzelne redaktionelle Quelle schreibt nichts", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelope({ proof: [evidence(editorialA)] }));
  const repo = repository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
  });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.writes, 0);
  assert.equal(repo.events.size, 0);
});

await check("Zwei URLs derselben Publisherfamilie bleiben unzureichend", async () => {
  const proof = [evidence(editorialA, "eins"), evidence(sameFamily, "zwei")];
  const result = evaluateRadarWebsearchResponse(envelope({ proof }), target, sources);
  assert.equal(result.status, "insufficient_evidence");
  assert.ok(result.errors.includes("response-evidence-independent-sources-insufficient"));
});

await check("Falsches Werk wird deterministisch blockiert", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelope({
    targetPatch: { targetId: "imdb:tt9999999", canonicalTitle: "Anderes Werk" },
  }));
  const repo = repository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
  });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(repo.events.size, 0);
});

await check("Falsche Region wird deterministisch blockiert", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelope({ targetPatch: { region: "DE" } }));
  const repo = repository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
  });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(repo.events.size, 0);
});

await check("Derselbe Treffer bleibt no_change und erzeugt keine zweite Version", async () => {
  const response = envelope();
  const adapter = createRadarWebsearchMockAdapter([response, response]);
  const repo = repository();
  const first = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
    operationId: () => "20000000-0000-4000-8000-000000000001",
  });
  const second = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
    operationId: () => "20000000-0000-4000-8000-000000000002",
  });
  assert.equal(first.status, "confirmed");
  assert.equal(second.status, "no_change");
  assert.equal(adapter.calls.length, 2);
  assert.equal(repo.events.size, 1);
  assert.equal([...repo.events.values()][0].versions.length, 1);
});

await check("Ein geändertes Datum wird neue Version derselben Eventidentität", async () => {
  const adapter = createRadarWebsearchMockAdapter([
    envelope({ date: "2026-08-21" }),
    envelope({ date: "2026-08-28" }),
  ]);
  const repo = repository();
  await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
    operationId: () => "30000000-0000-4000-8000-000000000001",
  });
  const changed = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
    operationId: () => "30000000-0000-4000-8000-000000000002",
  });
  const stored = [...repo.events.values()][0];
  assert.equal(changed.status, "confirmed");
  assert.equal(repo.events.size, 1);
  assert.deepEqual(stored.versions.map((entry) => entry.date), ["2026-08-21", "2026-08-28"]);
});

await check("Provider-no_change bleibt ohne Eventwrite", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelope({ status: "no_change", proof: [] }));
  const repo = repository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
  });
  assert.equal(result.status, "no_change");
  assert.equal(result.writes, 0);
  assert.equal(repo.events.size, 0);
});

await check("Providerfehler endet nach genau einem Aufruf ohne Retry", async () => {
  const adapter = createRadarWebsearchMockAdapter(new Error("mock-provider-down"));
  const repo = repository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
  });
  assert.equal(result.status, "provider_error");
  assert.equal(adapter.calls.length, 1);
  assert.equal(repo.events.size, 0);
});

await check("Mehr als sechs Suchtreffer werden vor dem Upsert blockiert", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelope({ searchResultCount: 7 }));
  const repo = repository();
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId, adapter, repository: repo,
  });
  assert.equal(result.status, "invalid_response");
  assert.equal(repo.events.size, 0);
});

await check("Feed-Reload liest persistierte Version und direkte Quellen erneut", async () => {
  const repo = repository();
  await runRadarWebsearchCheck({
    accountId: "max-account", targetId: target.targetId,
    adapter: createRadarWebsearchMockAdapter(envelope()), repository: repo,
  });
  const reloaded = JSON.parse(JSON.stringify(await repo.loadFeed({ accountId: "max-account" })));
  assert.equal(reloaded.events.length, 1);
  assert.equal(reloaded.events[0].targetId, target.targetId);
  assert.deepEqual(reloaded.events[0].evidence.map((entry) => entry.url), [
    "https://news-a.example/start", "https://news-b.example/start",
  ]);
});

await check("Browserdienst sendet nur targetId und macht keinen Retry", async () => {
  const session = { mode: "account", state: "ready", account: { id: "max-account" } };
  const calls = [];
  const service = createRadarWebsearchService({
    config: {
      radarPilotClientEnabled: true,
      supabaseUrl: "https://project.example.supabase.co",
      supabasePublishableKey: "public-key",
    },
    auth: { getSnapshot: () => session },
    getAccount: () => session.account,
    getAccessToken: async () => "session-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, async json() { return { ok: true, status: "confirmed", writes: 1 }; } };
    },
  });
  const result = await service.checkNow(target.targetId);
  assert.equal(result.status, "confirmed");
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { targetId: target.targetId });
  assert.equal(calls[0].options.body.includes("max-account"), false);
});

await check("Einzeldatei sperrt die Serverprüfung vor Token und Netzwerk", async () => {
  const session = { mode: "account", state: "ready", account: { id: "max-account" } };
  let tokenCalls = 0;
  let fetchCalls = 0;
  const service = createRadarWebsearchService({
    singleFile: true,
    config: {
      radarPilotClientEnabled: true,
      supabaseUrl: "https://project.example.supabase.co",
      supabasePublishableKey: "public-key",
    },
    auth: { getSnapshot: () => session },
    getAccount: () => session.account,
    getAccessToken: async () => { tokenCalls += 1; return "session-token"; },
    fetchImpl: async () => { fetchCalls += 1; throw new Error("darf nicht laufen"); },
  });
  assert.deepEqual(await service.checkNow(target.targetId), { status: "forbidden", writes: 0 });
  assert.equal(tokenCalls, 0);
  assert.equal(fetchCalls, 0);
});

const migration = fs.readFileSync("./supabase/migrations/20260817180000_radar_websearch_mvp_package_a.sql", "utf8");
const functionIndex = fs.readFileSync("./supabase/functions/radar-websearch-task/index.ts", "utf8");
const runnerSource = fs.readFileSync("./supabase/functions/radar-websearch-task/runner.js", "utf8");

await check("Migration bleibt additiv auf vorhandenen Radar-Tabellen und service-role-only", () => {
  assert.doesNotMatch(migration, /create\s+table/i);
  assert.match(migration, /kd_radar_websearch_context\(uuid,text\)[\s\S]*to service_role/i);
  assert.match(migration, /kd_radar_websearch_upsert_event\(uuid,uuid,jsonb\)[\s\S]*to service_role/i);
  assert.match(migration, /v_official_count\s*<\s*1\s+and\s+v_family_count\s*<\s*2/i);
  assert.match(migration, /current_confirmed_version_id/i);
  assert.match(migration, /source_state_hash/i);
  assert.match(migration, /radar_websearch_event_outside_subscription/i);
  assert.doesNotMatch(migration, /radar_provider_aktiv\s*=|radar_scheduler_aktiv\s*=|cron\.|pg_cron/i);
});

await check("Function prüft JWT selbst und der Runner übergibt nur den validierten Request", () => {
  assert.match(functionIndex, /auth\.getClaims\(token\)/);
  assert.match(functionIndex, /claims\?\.role\s*===\s*"authenticated"/);
  assert.match(functionIndex, /createAnthropicRadarWebsearchAdapter/);
  assert.match(functionIndex, /ANTHROPIC_API_KEY/);
  assert.match(functionIndex, /kd_radar_websearch_auftrag_starten/);
  assert.equal((runnerSource.match(/adapter\.search\(request\)/g) || []).length, 1);
  assert.doesNotMatch(runnerSource, /setTimeout|while\s*\(/i);
});

console.log(`${checks} Radar-Websearch-MVP-Checks bestanden.`);
