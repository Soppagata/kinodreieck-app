/* Fokussierter lokaler v6-Function-/Persistenzmock.
   Kein Netz, keine DB, kein Provider, kein Scheduler und kein Retry. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  acknowledgeAccountRadarPilotReceipt,
  createEmptyLocalRadar,
  queueAccountRadarPilotReceipt,
  reconcileAccountRadarPilotFeed,
} from "./src/lib/localEventRadar.js";
import {
  buildAnthropicRadarWebsearchBody,
  parseAnthropicRadarWebsearchResponse,
} from "./supabase/functions/radar-websearch-task/anthropicAdapter.js";
import {
  evaluateTitleGroupRadarWebsearchResponse,
  validateTitleGroupRadarWebsearchRequest,
} from "./supabase/functions/radar-websearch-task/contract.js";
import {
  createRadarWebsearchMemoryRepository,
  createRadarWebsearchMockAdapter,
} from "./supabase/functions/radar-websearch-task/mockAdapter.js";
import { runRadarWebsearchCheck } from "./supabase/functions/radar-websearch-task/runner.js";

let checks = 0;
async function check(name, run) {
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}

const checkedAt = "2026-08-22T09:00:00.000Z";
const accountId = "max-account";
const targetId = "title-group:v1:star-wars";
const unknownWorkId = "imdb:tt34712345";
const catalog = Object.freeze([
  Object.freeze({ targetId: "watchmode:71001", targetType: "work", title: "Star Wars: Episode I", year: 1999 }),
  Object.freeze({ targetId: "watchmode:71004", targetType: "work", title: "Star Wars: Episode IV", year: 1977 }),
]);
const requestV6 = Object.freeze({
  kind: "title_group",
  targetId,
  queryVersion: "title-group-query-v2",
  queryKey: "star wars",
  displayName: "Star Wars",
  region: "AT",
  catalog,
  discoveryMode: "canonical-group-v1",
  groupExternalId: "wikidata:Q462",
  canonicalGroupName: "Star Wars",
  windowStart: "2026-07-23",
  windowEnd: "2026-09-05",
});
const sources = Object.freeze([
  Object.freeze({
    sourceId: "source:starwars-official",
    domain: "www.starwars.com",
    publisherFamily: "lucasfilm",
    sourceClass: "official",
    rightsStatus: "approved",
    attributionApproved: true,
    subdomainsAllowed: false,
    active: true,
  }),
  Object.freeze({
    sourceId: "source:disneyplus-official",
    domain: "press.disneyplus.com",
    publisherFamily: "disney-plus",
    sourceClass: "official",
    rightsStatus: "approved",
    attributionApproved: true,
    subdomainsAllowed: false,
    active: true,
  }),
]);
const membershipEvidence = Object.freeze([Object.freeze({
  url: "https://www.starwars.com/news/the-ninth-jedi",
  sourceDomain: "www.starwars.com",
  sourceTitle: "The Ninth Jedi",
  claim: "Die offizielle Werkseite ordnet The Ninth Jedi der Star-Wars-Reihe zu.",
  publishedAt: "2026-08-20",
})]);
const availabilityEvidence = Object.freeze([Object.freeze({
  url: "https://press.disneyplus.com/news/the-ninth-jedi-start",
  sourceDomain: "press.disneyplus.com",
  sourceTitle: "The Ninth Jedi startet im August",
  claim: "Disney+ nennt den weltweiten Streamingstart am 30. August 2026.",
  publishedAt: "2026-08-21",
})]);
const candidate = Object.freeze({
  targetId: unknownWorkId,
  targetType: "work",
  title: "The Ninth Jedi",
  year: 2026,
  eventType: "streamingstart_at",
  eventDate: "2026-08-30",
  region: "AT",
  platform: "Disney+",
  seasonNumber: null,
  groupExternalId: "wikidata:Q462",
  membershipEvidence,
  evidence: availabilityEvidence,
});
function envelopeFor(candidateOverride = candidate) {
  return {
    searchResultCount: 2,
    response: {
      status: "confirmed",
      checkedAt,
      titleGroup: {
        queryVersion: requestV6.queryVersion,
        queryKey: requestV6.queryKey,
        displayName: requestV6.displayName,
        groupExternalId: requestV6.groupExternalId,
        canonicalGroupName: requestV6.canonicalGroupName,
      },
      candidates: [candidateOverride],
    },
  };
}

await check("v6 bindet genau eine Websuche an kanonische Reihen-ID, Name und 30/14-Tage-Fenster", () => {
  const validated = validateTitleGroupRadarWebsearchRequest(requestV6);
  assert.equal(validated.ok, true, validated.errors.join(","));
  const setup = {
    radarEnabled: true,
    radarProviderEnabled: true,
    radarSchedulerEnabled: false,
    providerAllowed: true,
    modelAlias: "klein",
    model: "claude-haiku-4-5",
    maxTokens: 1200,
    taskCapUsdCent: 5,
    searchFeeUsdCent: 1,
    globalRequestCapUsdCent: 500,
    timeoutMs: 135000,
    inputPriceUsdCentPerMtok: 100,
    outputPriceUsdCentPerMtok: 500,
    sourceRegistry: sources,
  };
  const body = buildAnthropicRadarWebsearchBody(requestV6, setup);
  const providerInput = JSON.parse(body.messages[0].content);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].name, "web_search");
  assert.equal(body.tools[0].max_uses, 1);
  assert.match(body.system, /keinen Vollkatalogscan/);
  assert.deepEqual({
    discoveryMode: providerInput.discoveryMode,
    groupExternalId: providerInput.groupExternalId,
    canonicalGroupName: providerInput.canonicalGroupName,
    windowStart: providerInput.windowStart,
    windowEnd: providerInput.windowEnd,
  }, {
    discoveryMode: "canonical-group-v1",
    groupExternalId: "wikidata:Q462",
    canonicalGroupName: "Star Wars",
    windowStart: "2026-07-23",
    windowEnd: "2026-09-05",
  });
  const providerResponse = {
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    usage: {
      input_tokens: 100,
      output_tokens: 200,
      server_tool_use: { web_search_requests: 1 },
    },
    content: [
      { type: "server_tool_use", id: "toolu_radar_v6", name: "web_search", input: {} },
      {
        type: "web_search_tool_result",
        tool_use_id: "toolu_radar_v6",
        content: [
          { type: "web_search_result", url: membershipEvidence[0].url },
          { type: "web_search_result", url: availabilityEvidence[0].url },
        ],
      },
      {
        type: "text",
        text: JSON.stringify({ status: "confirmed", candidates: [candidate] }),
        citations: [
          { type: "web_search_result_location", url: membershipEvidence[0].url },
          { type: "web_search_result_location", url: availabilityEvidence[0].url },
        ],
      },
    ],
  };
  const parsed = parseAnthropicRadarWebsearchResponse(providerResponse, requestV6, setup, checkedAt);
  assert.equal(parsed.usage.searchRequests, 1);
  assert.equal(parsed.envelope.response.candidates[0].targetId, unknownWorkId);
  const missingMembershipCitation = JSON.parse(JSON.stringify(providerResponse));
  missingMembershipCitation.content[2].citations = [
    { type: "web_search_result_location", url: availabilityEvidence[0].url },
  ];
  const missingMembership = parseAnthropicRadarWebsearchResponse(
    missingMembershipCitation, requestV6, setup, checkedAt,
  );
  assert.equal(missingMembership.envelope.response.status, "insufficient_evidence");
  assert.deepEqual(missingMembership.envelope.response.candidates, []);
});

await check("The Ninth Jedi wird mit starker Werk-ID und zwei getrennten Belegrollen akzeptiert", () => {
  const result = evaluateTitleGroupRadarWebsearchResponse(envelopeFor(), requestV6, sources);
  assert.equal(result.status, "confirmed", result.errors.join(","));
  assert.equal(result.titleGroupResult.candidates.length, 1);
  assert.deepEqual(result.titleGroupResult.candidates[0], {
    targetId: unknownWorkId,
    targetType: "work",
    title: "The Ninth Jedi",
    year: 2026,
    eventType: "streamingstart_at",
    date: "2026-08-30",
    region: "AT",
    platform: "Disney+",
    seasonNumber: null,
    evidence: [{
      sourceId: "source:disneyplus-official",
      sourceDomain: "press.disneyplus.com",
      url: availabilityEvidence[0].url,
      retrievedAt: checkedAt,
    }],
    groupExternalId: "wikidata:Q462",
    membershipEvidence: [{
      sourceId: "source:starwars-official",
      sourceDomain: "www.starwars.com",
      url: membershipEvidence[0].url,
      retrievedAt: checkedAt,
    }],
  });
});

let acceptedFeed;
let acceptedRepository;
await check("Function-/Persistenzmock speichert den unbekannten Fund idempotent mit genau einem Adapteraufruf je Check", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelopeFor());
  const repository = createRadarWebsearchMemoryRepository({ target: requestV6, sources, accountId });
  const operationId = (event) => `${event.targetKey}|${event.eventType}|${event.platform}`;
  const first = await runRadarWebsearchCheck({
    accountId, targetId, adapter, repository, operationId,
  });
  assert.equal(first.status, "confirmed");
  assert.equal(first.writes, 1);
  assert.equal(adapter.calls.length, 1);
  assert.equal(repository.events.size, 1);
  assert.equal(repository.titleGroupMemberships.size, 1);
  assert.equal(first.feed.subscriptions[0].titleGroup.members.some((entry) => (
    entry.targetId === unknownWorkId && entry.title === "The Ninth Jedi"
  )), true);

  const repeated = await runRadarWebsearchCheck({
    accountId, targetId, adapter, repository, operationId,
  });
  assert.equal(repeated.status, "no_change");
  assert.equal(repeated.writes, 0);
  assert.equal(adapter.calls.length, 2);
  assert.equal(repository.events.size, 1);
  assert.equal(repository.events.values().next().value.versions.length, 1);
  assert.equal(repository.titleGroupMemberships.size, 1);
  acceptedFeed = repeated.feed;
  acceptedRepository = repository;
});

await check("Fehlender oder fremder Gruppenbeleg wird vor jeder Persistenz abgelehnt", async () => {
  for (const rejectedCandidate of [
    { ...candidate, membershipEvidence: [] },
    { ...candidate, groupExternalId: "wikidata:Q999999" },
    { ...candidate, targetId: "catalog:only-a-keyword" },
  ]) {
    const adapter = createRadarWebsearchMockAdapter(envelopeFor(rejectedCandidate));
    const repository = createRadarWebsearchMemoryRepository({ target: requestV6, sources, accountId });
    const result = await runRadarWebsearchCheck({ accountId, targetId, adapter, repository });
    assert.equal(result.status, "insufficient_evidence");
    assert.equal(result.writes, 0);
    assert.equal(adapter.calls.length, 1);
    assert.equal(repository.events.size, 0);
    assert.equal(repository.titleGroupMemberships.size, 0);
  }
});

await check("Pin bleibt nach dem belegten Serverfund eine ausdrueckliche Nutzeraktion", () => {
  assert.ok(acceptedRepository);
  const serverFeed = {
    format: "kd-radar-pilot-feed-v2",
    revision: 1,
    checksum: "a".repeat(64),
    reconciledAt: checkedAt,
    subscriptions: acceptedFeed.subscriptions,
    events: acceptedFeed.events,
    receipts: [],
    operationAcks: [],
    radarReview: true,
    personResults: [],
  };
  const reconciled = reconcileAccountRadarPilotFeed(
    createEmptyLocalRadar({ authority: "account-cache" }), serverFeed,
  );
  assert.equal(reconciled.ok, true, reconciled.errors?.join(","));
  assert.equal(reconciled.state.receipts.length, 0);
  assert.equal(reconciled.state.pilot.receiptOutbox.length, 0);
  const event = acceptedFeed.events[0];
  const queued = queueAccountRadarPilotReceipt(reconciled.state, {
    eventId: event.eventId,
    eventVersionId: event.eventVersionId,
    status: "accepted_week",
    now: checkedAt,
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.state.receipts.length, 0);
  assert.equal(queued.state.pilot.receiptOutbox.length, 1);
  const pinned = acknowledgeAccountRadarPilotReceipt(queued.state, event.eventVersionId, checkedAt);
  assert.equal(pinned.ok, true);
  assert.deepEqual(pinned.state.receipts.map(({ versionId, status }) => ({ versionId, status })), [{
    versionId: event.eventVersionId,
    status: "accepted_week",
  }]);
});

await check("v5-Mitgliederpfad bleibt kompatibel und alte angewandte Migrationen bleiben bytegenau", async () => {
  const requestV5 = {
    kind: "title_group",
    targetId,
    queryVersion: "title-group-query-v1",
    queryKey: "star wars",
    displayName: "Star Wars",
    region: "AT",
    catalog,
  };
  const responseV5 = {
    searchResultCount: 1,
    response: {
      status: "confirmed",
      checkedAt,
      titleGroup: {
        queryVersion: requestV5.queryVersion,
        queryKey: requestV5.queryKey,
        displayName: requestV5.displayName,
      },
      candidates: [{
        targetId: "watchmode:71004",
        targetType: "work",
        title: "Star Wars: Episode IV",
        year: 1977,
        eventType: "streamingstart_at",
        eventDate: "2026-08-30",
        region: "AT",
        platform: "Disney+",
        seasonNumber: null,
        evidence: availabilityEvidence,
      }],
    },
  };
  const adapter = createRadarWebsearchMockAdapter(responseV5);
  const repository = createRadarWebsearchMemoryRepository({ target: requestV5, sources, accountId });
  const result = await runRadarWebsearchCheck({ accountId, targetId, adapter, repository });
  assert.equal(result.status, "confirmed");
  assert.equal(result.writes, 1);
  assert.equal(adapter.calls.length, 1);

  const oldMigrationHashes = new Map([
    ["supabase/migrations/20260819220000_radar_person_server_candidate.sql", "d23f80f7073deb1197fdcb0b5a73f4abd1ad002e0b3bded6ee08c691d937f658"],
    ["supabase/migrations/20260821120000_radar_person_catalog_repair.sql", "8d2624a4ee34dae6b8080ba1bdb74f402c8144328815d21c99762cc22c6af765"],
    ["supabase/migrations/20260821130000_radar_title_group.sql", "6e1b7b8a638536f223d82fd62220b80e130da0ba20e855336145d5afc31b228c"],
  ]);
  for (const [path, expected] of oldMigrationHashes) {
    assert.equal(createHash("sha256").update(fs.readFileSync(path)).digest("hex"), expected, path);
  }
  const migration = fs.readFileSync(
    "supabase/migrations/20260822200000_radar_title_group_discovery_v6.sql", "utf8",
  );
  assert.match(migration, /discovery_enabled\s+boolean\s+not null default false/);
  assert.match(migration, /'title-group:v1:star-wars', 'wikidata:Q462', 'Star Wars', false/);
  assert.match(migration, /kd_radar_websearch_upsert_title_group_discovery_event/);
  assert.match(migration, /insert into public\.kd_radar_events/);
  assert.match(migration, /insert into public\.kd_radar_evidence/);
  assert.doesNotMatch(migration, /kd_radar_websearch_upsert_title_group_event\s*\(/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.kd_radar_subscriptions/i);
  assert.doesNotMatch(migration, /update\s+public\.kd_radar_subscriptions/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.kd_radar_subscriptions/i);
  assert.doesNotMatch(migration, /update\s+public\.kd_radar_settings/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.kd_radar_receipts/i);
});

console.log(`\n${checks} Radar-Titelgruppen-v6-Checks bestanden.`);
console.log("Betrieb: lokale Mocks · kein Netz · keine DB · kein Anbieter · kein Retry");
