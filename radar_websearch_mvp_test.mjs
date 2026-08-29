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
import { createProviderReceipt } from "./supabase/functions/_shared/providerReceipt.js";
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
const liveProviderReceipt = await createProviderReceipt({
  provider: "anthropic",
  providerResponseText: "radar-freitext-live-fixture",
  model: "claude-haiku-4-5",
  inputTokens: 100,
  outputTokens: 40,
  webSearchRequests: 1,
  resultMode: "degraded",
  serverLogId: 71,
  providerRequests: 1,
  reservationUsdCent: 2,
  costUsdCent: 1.1,
});
const emptyPilotFeed = Object.freeze({
  format: "kd-radar-pilot-feed-v2",
  revision: 0,
  checksum: null,
  reconciledAt: checkedAt,
  subscriptions: Object.freeze([]),
  events: Object.freeze([]),
  receipts: Object.freeze([]),
  operationAcks: Object.freeze([]),
  radarReview: true,
  personResults: Object.freeze([]),
});

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

const textTarget = Object.freeze({
  kind: "text",
  targetId: "text:d9e6b48aa971462a",
  targetText: "Mutter Teresa",
  region: "AT",
  scopes: ["cinema", "streaming", "series_start", "season_start"],
});

function textEvidence(path, claim) {
  return {
    url: `https://${official.domain}/${path}`,
    sourceDomain: official.domain,
    sourceTitle: "Offizieller Beleg",
    publishedAt: "2026-08-17",
    claim,
  };
}

function textEnvelope(status = "confirmed", twoWorks = false) {
  const candidates = status === "confirmed" ? [{
    targetId: "imdb:tt1234567",
    targetType: "work",
    title: "Mother Teresa: No Greater Love",
    year: 2022,
    eventType: "streamingstart_at",
    eventDate: "2026-08-21",
    region: "AT",
    platform: "Beispiel+",
    seasonNumber: null,
    relationEvidence: [textEvidence("mutter-teresa-beziehung", "Das Werk handelt von Mutter Teresa.")],
    evidence: [textEvidence("mutter-teresa-start", "Streamingstart in Österreich am 21. August 2026.")],
  }, ...(twoWorks ? [{
    targetId: "tmdb:movie:7654321",
    targetType: "work",
    title: "The Letters",
    year: 2014,
    eventType: "streamingstart_at",
    eventDate: "2026-08-22",
    region: "AT",
    platform: "Beispiel+",
    seasonNumber: null,
    relationEvidence: [textEvidence("the-letters-beziehung", "Das Werk erzählt von Mutter Teresa.")],
    evidence: [textEvidence("the-letters-start", "Streamingstart in Österreich am 22. August 2026.")],
  }] : [])] : [];
  return {
    searchResultCount: candidates.length ? candidates.length * 2 : 1,
    response: {
      status,
      checkedAt,
      textTarget: { targetId: textTarget.targetId, targetText: textTarget.targetText },
      candidates,
    },
  };
}

function textRepository() {
  const calls = { loads: [], upserts: [], feeds: 0 };
  const stored = [];
  return {
    calls,
    stored,
    async loadAuthorizedTarget(input) {
      calls.loads.push(structuredClone(input));
      if (input.accountId !== "max-account" || input.targetId !== textTarget.targetId
          || input.targetText !== textTarget.targetText) throw new Error("forbidden");
      return structuredClone(textTarget);
    },
    async resolveSources(domains) {
      assert.deepEqual(domains, [official.domain]);
      return [structuredClone(official)];
    },
    async upsertConfirmedEvent(input) {
      calls.upserts.push(structuredClone(input));
      stored.push(structuredClone(input.event));
      return { status: "confirmed" };
    },
    async loadFeed() {
      calls.feeds += 1;
      return {
        subscriptions: [{
          targetId: textTarget.targetId,
          targetType: "text",
          title: textTarget.targetText,
        }],
        events: stored.map((event) => ({ ...event, targetId: event.targetKey, title: event.title })),
      };
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

await check("Freitextvertrag erhaelt Mutter Teresa roh und verlangt weder Nutzer-ID noch Zielart", () => {
  const accepted = validateRadarWebsearchRequest(textTarget);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.targetText, "Mutter Teresa");
  assert.equal("accountId" in accepted.value, false);
  assert.equal("targetType" in accepted.value, false);
  assert.equal(validateRadarWebsearchRequest({ ...textTarget, targetText: " Mutter Teresa " }).ok, true);
  assert.equal(validateRadarWebsearchRequest({ ...textTarget, targetText: "" }).ok, false);
});

await check("Mutter Teresa startet genau einen Suchpfad und der bestaetigte Fund ist im Feed ruecklesbar", async () => {
  const repo = textRepository();
  const adapter = createRadarWebsearchMockAdapter(textEnvelope());
  const result = await runRadarWebsearchCheck({
    accountId: "max-account",
    targetId: textTarget.targetId,
    targetText: textTarget.targetText,
    adapter,
    repository: repo,
    operationId: () => "40000000-0000-4000-8000-000000000001",
  });
  assert.equal(result.status, "confirmed");
  assert.equal(result.writes, 1);
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(repo.calls.loads, [{
    accountId: "max-account", targetId: textTarget.targetId, targetText: "Mutter Teresa",
  }]);
  assert.equal(repo.calls.upserts.length, 1);
  assert.equal(repo.calls.upserts[0].textContext.targetText, "Mutter Teresa");
  assert.equal(repo.calls.upserts[0].textContext.relationEvidence.length, 1);
  assert.equal(result.feed.subscriptions[0].title, "Mutter Teresa");
  assert.equal(result.feed.events[0].targetId, "imdb:tt1234567");
  assert.equal(result.feed.events[0].title, "Mother Teresa: No Greater Love");
});

await check("Zwei Freitextwerke derselben Plattform bleiben werkgebundene getrennte Events", async () => {
  const repo = textRepository();
  const adapter = createRadarWebsearchMockAdapter(textEnvelope("confirmed", true));
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: textTarget.targetId, targetText: textTarget.targetText,
    adapter, repository: repo,
    operationId: (event) => event.targetKey.startsWith("imdb:")
      ? "41000000-0000-4000-8000-000000000001"
      : "41000000-0000-4000-8000-000000000002",
  });
  assert.equal(result.status, "confirmed");
  assert.equal(result.writes, 2);
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(result.feed.events.map((event) => event.targetId).sort(), [
    "imdb:tt1234567", "tmdb:movie:7654321",
  ]);
});

await check("Unsicherer Freitextfund bleibt ehrlich leer und ohne Persistenz", async () => {
  const repo = textRepository();
  const adapter = createRadarWebsearchMockAdapter(textEnvelope("insufficient_evidence"));
  const result = await runRadarWebsearchCheck({
    accountId: "max-account", targetId: textTarget.targetId, targetText: textTarget.targetText,
    adapter, repository: repo,
  });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.writes, 0);
  assert.equal(adapter.calls.length, 1);
  assert.equal(repo.calls.upserts.length, 0);
  assert.deepEqual(result.feed.events, []);
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
      return { ok: true, status: 200, async json() {
        return {
          ok: true, status: "confirmed", writes: 1,
          providerRequests: 1, searchRequests: 1, feed: emptyPilotFeed,
        };
      } };
    },
  });
  const result = await service.checkNow(target.targetId);
  assert.equal(result.status, "confirmed");
  assert.deepEqual(result.feed, emptyPilotFeed);
  assert.ok(Object.isFrozen(result.feed) && Object.isFrozen(result.feed.events));
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { targetId: target.targetId });
  assert.equal(calls[0].options.body.includes("max-account"), false);
});

await check("Browserdienst verwirft einen Feed außerhalb des bestehenden exakten Vertrags", async () => {
  const session = { mode: "account", state: "ready", account: { id: "max-account" } };
  const service = createRadarWebsearchService({
    config: {
      radarPilotClientEnabled: true,
      supabaseUrl: "https://project.example.supabase.co",
      supabasePublishableKey: "public-key",
    },
    auth: { getSnapshot: () => session },
    getAccount: () => session.account,
    getAccessToken: async () => "session-token",
    fetchImpl: async () => ({ ok: true, status: 200, async json() {
      return {
        ok: true, status: "confirmed", writes: 1,
        providerRequests: 1, searchRequests: 1,
        feed: { ...emptyPilotFeed, accountId: "verboten" },
      };
    } }),
  });
  assert.deepEqual(await service.checkNow(target.targetId), { status: "unavailable", writes: 0 });
});

await check("Browserdienst übergibt gespeicherten Freitext beim manuellen Check genau einmal und unverändert", async () => {
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
      return { ok: true, status: 200, async json() {
        return {
          ok: true,
          status: "insufficient_evidence",
          writes: 0,
          providerRequests: 1,
          searchRequests: 1,
          phaseCode: "provider-complete",
          responseMode: "degraded",
          displayText: "Keine eindeutig belegte Zuordnung gefunden.",
          warnings: ["unstructured-provider-text"],
          providerReceipt: liveProviderReceipt,
        };
      } };
    },
  });
  const result = await service.checkNow("text:0123456789abcdef", "Mutter Teresa");
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.responseMode, "degraded");
  assert.equal(result.displayText, "Keine eindeutig belegte Zuordnung gefunden.");
  assert.equal("providerReceipt" in result, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    targetId: "text:0123456789abcdef", targetText: "Mutter Teresa",
  });
});

const migration = fs.readFileSync("./supabase/migrations/20260817180000_radar_websearch_mvp_package_a.sql", "utf8");
const textMigration = fs.readFileSync("./supabase/migrations/20260823120000_radar_text_target.sql", "utf8");
const feedTitleMigration = fs.readFileSync("./supabase/migrations/20260829120000_radar_feed_work_title.sql", "utf8");
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

await check("Freitextmigration nutzt nur bestehende Radarpfade und sperrt Rohtext-Schluessel-Drift", () => {
  assert.doesNotMatch(textMigration, /create\s+table/i);
  assert.match(textMigration, /kd_radar_websearch_prepare_text\(uuid,text,text,uuid\)/i);
  assert.match(textMigration, /kd_radar_websearch_upsert_text_event\(uuid,uuid,jsonb\)/i);
  assert.match(textMigration, /p_target_key\s+is\s+distinct\s+from\s+public\.kd_radar_text_target_key\(p_target_text\)/i);
  assert.match(textMigration, /'targetKey',v_work_key/i);
  assert.match(textMigration, /radar-text-inner/i);
  assert.match(textMigration, /public\.kd_radar_websearch_upsert_event\([\s\S]*?v_inner_operation_id,v_core_payload/i);
  assert.match(textMigration, /v_direct_inserted[\s\S]*?delete from public\.kd_radar_subscriptions/i);
  assert.match(textMigration, /select subscription\.subscription_status,subscription\.scope,subscription\.region[\s\S]*?into v_direct_status,v_direct_scope,v_direct_region/i);
  assert.match(textMigration, /set subscription_status='active',scope='all',region='AT'[\s\S]*?kd_radar_websearch_upsert_event/i);
  assert.match(textMigration, /kd_radar_websearch_upsert_event[\s\S]*?set subscription_status=v_direct_status,scope=v_direct_scope,region=v_direct_region/i);
  assert.doesNotMatch(textMigration, /exception\s+when[\s\S]*?kd_radar_websearch_upsert_event/i);
  assert.match(textMigration, /'format','kd-radar-text-event-v1'[\s\S]*?'checkedAt'/i);
  assert.match(textMigration, /account_id,operation_id,request_hash,result,terminal_at,created_at/i);
  assert.match(textMigration, /rename to kd_radar_pilot_feed_text_internal/i);
  assert.match(textMigration, /'targetId',item\.target_key,'title',item\.canonical_title/i);
  assert.doesNotMatch(textMigration, /radar_text_event_definition_drift/i);
  assert.match(textMigration, /target_type\s+in\s+\('work','series','franchise','person','text'\)/i);
  assert.doesNotMatch(textMigration, /anthropic|pg_net|http_post|curl/i);
});

await check("Additiver Radarfeed ergaenzt nur den kanonischen Werktitel bereits sichtbarer Events", () => {
  assert.match(feedTitleMigration, /rename to kd_radar_pilot_feed_work_title_internal/i);
  assert.match(feedTitleMigration, /v_feed\s*:=\s*public\.kd_radar_pilot_feed_work_title_internal\(p_operation_ids\)/i);
  assert.match(feedTitleMigration, /jsonb_array_elements\(coalesce\(v_feed -> 'events','\[\]'::jsonb\)\)/i);
  assert.match(feedTitleMigration, /target\.target_key\s*=\s*item\.value\s*->>\s*'targetId'/i);
  assert.match(feedTitleMigration, /jsonb_build_object\('title',target\.canonical_title\)/i);
  assert.match(feedTitleMigration, /when item\.value \? 'title' then item\.value/i);
  assert.doesNotMatch(feedTitleMigration, /insert\s+into|update\s+public|delete\s+from|anthropic|http|cron\./i);
});

await check("Function prüft JWT selbst und der Runner übergibt nur den validierten Request", () => {
  assert.match(functionIndex, /auth\.getClaims\(token\)/);
  assert.match(functionIndex, /claims\?\.role\s*===\s*"authenticated"/);
  assert.match(functionIndex, /createAnthropicRadarWebsearchAdapter/);
  assert.match(functionIndex, /ANTHROPIC_API_KEY/);
  assert.match(functionIndex, /kd_radar_websearch_auftrag_starten/);
  assert.match(functionIndex, /result\.feed\s*\?\s*\{\s*feed:\s*result\.feed\s*\}/);
  assert.equal((runnerSource.match(/adapter\.search\(request\)/g) || []).length, 1);
  assert.doesNotMatch(runnerSource, /setTimeout|while\s*\(/i);
});

console.log(`${checks} Radar-Websearch-MVP-Checks bestanden.`);
