/* Entdecken-Wochenserver: fokussierter Offline-/Mockbeleg.
   Kein Netz, kein Provider, keine Datenbank und keine echte KI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createEntdeckenWeeklyQueryContext,
  evaluateEntdeckenDailyResponse,
  validateEntdeckenDailyFeed,
  validateEntdeckenSourceRegistry,
} from "./supabase/functions/entdecken-daily-task/contract.js";
import {
  buildAnthropicEntdeckenDailyBody,
  createAnthropicEntdeckenDailyAdapter,
  ENTDECKEN_DAILY_MAX_TOKENS,
  ENTDECKEN_DAILY_RESPONSE_MAX_BYTES,
  ENTDECKEN_DAILY_TASK_CAP_USD_CENT,
  ENTDECKEN_DAILY_TIMEOUT_MAX_MS,
  parseAnthropicEntdeckenDailyResponse,
  validateEntdeckenDailyProviderSetup,
} from "./supabase/functions/entdecken-daily-task/anthropicAdapter.js";
import { runEntdeckenDailyRefresh } from "./supabase/functions/entdecken-daily-task/runner.js";
import { validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";
import { createEntdeckenDailyFeedService } from "./src/services/entdeckenDailyFeed.js";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const standardSource = Object.freeze({
  sourceId: "editorial:derstandard",
  domain: "derstandard.at",
  publisherFamily: "DER STANDARD",
  sourceClass: "editorial",
  rightsStatus: "approved",
  attributionApproved: true,
  subdomainsAllowed: true,
  active: true,
  termsUrl: "https://about.derstandard.at/nutzungsbedingungen/",
  termsCheckedOn: "2026-08-20",
});
const filmAtSource = Object.freeze({
  ...standardSource,
  sourceId: "editorial:filmat",
  domain: "film.at",
  publisherFamily: "film.at / k-digital Medien",
  termsUrl: "https://www.film.at/kontakt-impressum-redaktion-filmat/401835922",
});
const sources = Object.freeze([standardSource, filmAtSource]);
const queryContext = createEntdeckenWeeklyQueryContext("2026-08-20", "2026-W34");

function providerItem(index = 1) {
  return Object.freeze({
    title: index === 1 ? "The Ninth Jedi" : `Positiver Wochentipp ${String(index).padStart(2, "0")}`,
    mediaType: index % 5 === 0 ? "series" : "film",
    releaseYear: 2026,
    externalIds: index === 1 ? { watchmode: "5001" } : {},
    attributes: {
      genres: index % 2 ? ["Drama"] : ["Science-Fiction"],
      tones: index % 2 ? ["ruhig"] : ["abenteuerlich"],
      themes: index % 2 ? ["Neuanfang"] : ["Vermächtnis"],
    },
    evidence: {
      url: index % 2
        ? "https://www.film.at/streaming/wochentipps-kw-34"
        : "https://www.derstandard.at/story/film-serien-charts-kw-34",
      publishedOn: "2026-08-18",
      positiveRecommendation: true,
    },
  });
}

function envelope(items = [providerItem()]) {
  return {
    searchResultCount: new Set(items.map((item) => item.evidence.url)).size,
    queryContext,
    response: { checkedAt: "2026-08-20T09:00:00.000Z", items },
  };
}

function evaluated(items = [providerItem()], day = "2026-08-20", isoWeek = "2026-W34") {
  const context = createEntdeckenWeeklyQueryContext(day, isoWeek);
  return evaluateEntdeckenDailyResponse({ ...envelope(items), queryContext: context }, sources, {
    retrievedOn: day,
    claimedIsoWeek: isoWeek,
  }).feed;
}

const providerSetup = Object.freeze({
  feedEnabled: true,
  providerEnabled: true,
  providerAllowed: true,
  modelAlias: "klein",
  model: "claude-haiku-4-5",
  maxTokens: 2800,
  taskCapUsdCent: 5,
  searchFeeUsdCent: 1,
  globalRequestCapUsdCent: 500,
  timeoutMs: 30_000,
  inputPriceUsdCentPerMtok: 100,
  outputPriceUsdCentPerMtok: 500,
  sourceRegistry: sources,
});

function anthropicResponse(items = [providerItem()]) {
  const urls = [...new Set(items.map((item) => item.evidence.url))];
  return {
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 120, output_tokens: 240, server_tool_use: { web_search_requests: 1 } },
    content: [
      { type: "server_tool_use", id: "tool-1", name: "web_search", input: { query: queryContext.query } },
      { type: "web_search_tool_result", tool_use_id: "tool-1", content: urls.map((url) => ({
        type: "web_search_result", url, title: "Wochentipps",
      })) },
      {
        type: "text",
        text: JSON.stringify({ items }),
        citations: urls.map((url) => ({ type: "web_search_result_location", url, title: "Wochentipps" })),
      },
    ],
  };
}

await check("Query-Kontext bindet ISO-Jahr und Kalenderwoche auch am Jahreswechsel", () => {
  assert.deepEqual(queryContext, {
    year: 2026,
    calendarWeek: 34,
    isoWeek: "2026-W34",
    query: "Top 50 Film- und Serien-Charts Österreich 2026 KW 34",
  });
  assert.equal(createEntdeckenWeeklyQueryContext("2027-01-01")?.isoWeek, "2026-W53");
  assert.equal(createEntdeckenWeeklyQueryContext("2026-08-20", "2026-W33"), null);
});

await check("Quellenregister ist auf genau zwei freigegebene Redaktionen begrenzt", () => {
  assert.equal(validateEntdeckenSourceRegistry(sources).ok, true);
  assert.equal(validateEntdeckenSourceRegistry([standardSource]).ok, false);
  assert.equal(validateEntdeckenSourceRegistry([{ ...standardSource, active: false }, filmAtSource]).ok, false);
});

await check("Anthropic-Body enthaelt genau eine allgemeine AT-Wochensuche und keine lokalen Daten", () => {
  const body = buildAnthropicEntdeckenDailyBody(providerSetup, queryContext);
  const input = JSON.parse(body.messages[0].content);
  assert.deepEqual(input, { queryContext, region: "AT", language: "de", maxItems: 20 });
  assert.deepEqual(body.tools, [{
    type: "web_search_20250305", name: "web_search", max_uses: 1,
    allowed_domains: ["derstandard.at", "film.at"], allowed_callers: ["direct"],
  }]);
  assert.doesNotMatch(JSON.stringify(input), /account|profile|seen|gesehen|dienst|service|mediathek|catalog|watchlist|radar/i);
});

await check("Zeit-, Token-, Kosten- und Antwortgrenzen sind hart und nicht erweiterbar", () => {
  assert.equal(ENTDECKEN_DAILY_MAX_TOKENS, 2800);
  assert.equal(ENTDECKEN_DAILY_TASK_CAP_USD_CENT, 5);
  assert.equal(ENTDECKEN_DAILY_TIMEOUT_MAX_MS, 135_000);
  assert.equal(ENTDECKEN_DAILY_RESPONSE_MAX_BYTES, 512_000);
  assert.throws(() => validateEntdeckenDailyProviderSetup({
    ...providerSetup, timeoutMs: ENTDECKEN_DAILY_TIMEOUT_MAX_MS + 1,
  }), /setup-invalid/);
  assert.throws(() => validateEntdeckenDailyProviderSetup({
    ...providerSetup, maxTokens: ENTDECKEN_DAILY_MAX_TOKENS + 1,
  }), /setup-invalid/);
});

await check("Bestehender Anthropic-Transport akzeptiert nur einen Suchrequest mit direkten Zitationen", () => {
  const response = anthropicResponse();
  const parsed = parseAnthropicEntdeckenDailyResponse(
    response, providerSetup, "2026-08-20T09:00:00.000Z", queryContext,
  );
  assert.equal(parsed.envelope.searchResultCount, 1);
  assert.deepEqual(parsed.envelope.queryContext, queryContext);
  assert.throws(() => parseAnthropicEntdeckenDailyResponse({
    ...response,
    usage: { ...response.usage, server_tool_use: { web_search_requests: 2 } },
  }, providerSetup, "2026-08-20T09:00:00.000Z", queryContext), /provider-usage-invalid/);
  assert.throws(() => parseAnthropicEntdeckenDailyResponse({
    ...response,
    content: response.content.map((block) => block.type === "text" ? { ...block, citations: [] } : block),
  }, providerSetup, "2026-08-20T09:00:00.000Z", queryContext), /provider-citation-invalid/);
});

await check("Adapter macht ohne Retry genau einen Providerrequest und ist danach verbraucht", async () => {
  let providerRequests = 0;
  let reservations = 0;
  let settlements = 0;
  const adapter = createAnthropicEntdeckenDailyAdapter({
    apiKey: "mock-key",
    loadSetup: async () => providerSetup,
    reserveCost: async () => { reservations += 1; return { ok: true, logId: 71 }; },
    settleCost: async () => { settlements += 1; },
    fetchImpl: async () => {
      providerRequests += 1;
      return { ok: true, async text() { return JSON.stringify(anthropicResponse()); } };
    },
    now: () => "2026-08-20T09:00:00.000Z",
    operationId: () => "00000000-0000-4000-8000-000000000071",
  });
  const result = await adapter.search(queryContext);
  assert.equal(result.queryContext.isoWeek, "2026-W34");
  await assert.rejects(() => adapter.search(queryContext), /already-used/);
  assert.equal(providerRequests, 1);
  assert.equal(reservations, 1);
  assert.equal(settlements, 1);
});

await check("Wochenvertrag akzeptiert hoechstens 20 belegte Titel und den Clientvertrag", () => {
  const items = Array.from({ length: 20 }, (_, index) => providerItem(index + 1));
  const feed = evaluated(items);
  assert.equal(feed.items.length, 20);
  assert.equal(feed.isoWeek, "2026-W34");
  assert.equal(feed.validUntil, "2026-08-23");
  assert.equal(feed.items[0].title, "The Ninth Jedi");
  assert.deepEqual(feed.items[0].externalIds, { watchmode: "5001" });
  assert.deepEqual(Object.keys(feed.items[0].attributes).sort(), ["genres", "themes", "tones"]);
  assert.equal(validateEntdeckenDailyFeed(feed).ok, true);
  assert.equal(validateWebDiscoveryFeed(feed).ok, true);
  assert.equal(evaluateEntdeckenDailyResponse(envelope([...items, providerItem(21)]), sources, {
    retrievedOn: "2026-08-20", claimedIsoWeek: "2026-W34",
  }).ok, false);
});

await check("Unbelegte, zu alte oder identitaetswiderspruechliche Ergebnisse bleiben fail-closed", () => {
  const unpositive = providerItem();
  assert.equal(evaluateEntdeckenDailyResponse(envelope([{
    ...unpositive, evidence: { ...unpositive.evidence, positiveRecommendation: false },
  }]), sources, { retrievedOn: "2026-08-20", claimedIsoWeek: "2026-W34" }).ok, false);
  assert.equal(evaluateEntdeckenDailyResponse(envelope([{
    ...unpositive, evidence: { ...unpositive.evidence, publishedOn: "2026-06-01" },
  }]), sources, { retrievedOn: "2026-08-20", claimedIsoWeek: "2026-W34" }).ok, false);
  const duplicate = { ...providerItem(), externalIds: { watchmode: "5002" } };
  assert.equal(evaluateEntdeckenDailyResponse(envelope([providerItem(), duplicate]), sources, {
    retrievedOn: "2026-08-20", claimedIsoWeek: "2026-W34",
  }).ok, false);
});

await check("Runner bindet Query und Save an denselben Fencing-Token und sucht nur einmal je Woche", async () => {
  let stored = null;
  let attempted = false;
  let adapterCalls = 0;
  const savedFences = [];
  const repository = {
    async claimRefresh() {
      const refresh = !attempted;
      attempted = true;
      return {
        feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
        refresh, fenceToken: refresh ? 41 : null, feed: stored,
      };
    },
    async loadSources() { return sources; },
    async saveFeed(feed, options) { stored = feed; savedFences.push(options.fenceToken); },
    async markFailure() { throw new Error("unerwartet"); },
  };
  const adapter = { async search(context) {
    adapterCalls += 1;
    assert.deepEqual(context, queryContext);
    return envelope();
  } };
  assert.equal((await runEntdeckenDailyRefresh({ repository, adapter })).status, "fresh");
  assert.equal((await runEntdeckenDailyRefresh({ repository, adapter })).status, "fresh");
  assert.equal(adapterCalls, 1);
  assert.deepEqual(savedFences, [41]);
});

await check("Providerfehler behaelt den letzten erfolgreichen Vorwochenfeed ohne Retry", async () => {
  const oldContext = createEntdeckenWeeklyQueryContext("2026-08-13", "2026-W33");
  const oldItem = {
    ...providerItem(),
    evidence: { ...providerItem().evidence, publishedOn: "2026-08-12" },
  };
  const oldFeed = evaluateEntdeckenDailyResponse({
    ...envelope([oldItem]), queryContext: oldContext,
  }, sources, {
    retrievedOn: "2026-08-13", claimedIsoWeek: "2026-W33",
  }).feed;
  let adapterCalls = 0;
  const failures = [];
  const result = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
          refresh: true, fenceToken: 42, feed: oldFeed,
        };
      },
      async loadSources() { return sources; },
      async saveFeed() { throw new Error("unerwartet"); },
      async markFailure(value) { failures.push(value); },
    },
    adapter: { async search() { adapterCalls += 1; throw new Error("offline"); } },
  });
  assert.equal(result.status, "stale");
  assert.equal(result.feed.isoWeek, "2026-W33");
  assert.equal(adapterCalls, 1);
  assert.deepEqual(failures, [{ code: "provider_error", fenceToken: 42 }]);
});

await check("Alter Tagesfeed bleibt als stale lesbar, erzeugt aber keinen zweiten Vertrag", async () => {
  const legacy = {
    format: 3, feedId: "websearch:daily-tips-at", region: "AT", sourceId: "websearch:daily-tips",
    refreshedOn: "2026-08-19", validUntil: "2026-08-25", items: [{
      recordId: "webtip:0000000000000001", title: "Legacy Tipp", mediaType: "film", releaseYear: 2026,
      attributes: { genres: ["Drama"], tags: ["ruhig"] }, rank: 1,
      evidence: [{
        domain: "www.film.at", url: "https://www.film.at/streaming/legacy-tipp",
        publishedOn: "2026-08-18", retrievedOn: "2026-08-19", positiveRecommendation: true,
      }],
    }],
  };
  assert.equal(validateEntdeckenDailyFeed(legacy).ok, true);
  const result = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
          refresh: false, fenceToken: null, feed: legacy,
        };
      },
      async loadSources() { throw new Error("nicht aufrufen"); },
      async saveFeed() { throw new Error("nicht aufrufen"); },
      async markFailure() { throw new Error("nicht aufrufen"); },
    },
    adapter: { async search() { throw new Error("nicht aufrufen"); } },
  });
  assert.equal(result.status, "stale");
  assert.equal(result.feed.format, 3);
});

await check("Browserdienst sendet accountlos genau einen bodylosen GET", async () => {
  const calls = [];
  const feed = evaluated();
  const service = createEntdeckenDailyFeedService({
    config: {
      entdeckenDailyFeedEnabled: true,
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "public-key",
    },
    currentDay: () => "2026-08-20",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() {
        return { ok: true, status: "fresh", feed, writes: 1, providerRequests: 1, searchRequests: 1 };
      } };
    },
  });
  const result = await service.load();
  assert.equal(result.status, "fresh");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal("body" in calls[0].options, false);
  assert.deepEqual(Object.keys(calls[0].options.headers).sort(), ["Accept", "apikey"]);
  assert.doesNotMatch(JSON.stringify(calls[0]), /authorization|bearer|account|profile|seen|dienst|radar/i);
});

const migration = fs.readFileSync("./supabase/migrations/20260822190000_entdecken_weekly_feed.sql", "utf8");
const recoveryMigration = fs.readFileSync("./supabase/migrations/20260822210000_entdecken_weekly_recovery.sql", "utf8");
const recoveryClaimMigration = fs.readFileSync("./supabase/migrations/20260822220000_entdecken_weekly_recovery_claim.sql", "utf8");
const functionSource = fs.readFileSync("./supabase/functions/entdecken-daily-task/index.ts", "utf8");
const runnerSource = fs.readFileSync("./supabase/functions/entdecken-daily-task/runner.js", "utf8");
const clientSource = fs.readFileSync("./src/services/entdeckenDailyFeed.js", "utf8");
const controllerSource = fs.readFileSync("./src/controllers/useWebDiscoveryFeed.js", "utf8");
const appSource = fs.readFileSync("./src/App.jsx", "utf8");

await check("Normaler Browser-GET bleibt accountlos; nur der interne Recoveryheader verlangt den Owner", () => {
  assert.match(functionSource, /req\.method !== "GET"/);
  assert.match(functionSource, /req\.body !== null/);
  assert.match(functionSource, /req\.headers\.get\("apikey"\) !== publishableKey/);
  assert.match(functionSource, /recoveryRequested/);
  assert.match(functionSource, /user\.auth\.getUser\(token\)/);
  assert.match(functionSource, /\.from\("kd_account_access"\)/);
  assert.match(functionSource, /access\?\.role !== "owner"/);
  assert.match(functionSource, /\.rpc\("kd_entdecken_daily_recovery_claim"\)/);
  assert.doesNotMatch(functionSource, /profile|seen|gesehen|watchlist|selectedServices|radar/i);
  assert.match(functionSource, /p_fence_token: claimContext\?\.fenceToken/);
  assert.equal((runnerSource.match(/adapter\.search\(queryContext\)/g) || []).length, 1);
  assert.doesNotMatch(runnerSource, /setInterval|setTimeout|while\s*\(/i);
});

await check("SQL-Vertrag besitzt Wochenclaim, 180-Sekunden-Lease, Fencing und keinen Auto-Retry", () => {
  assert.match(migration, /last_attempt_iso_week\s+text/i);
  assert.match(migration, /fence_token\s+bigint\s+not null default 0/i);
  assert.match(migration, /lease_expires_at\s+timestamptz/i);
  assert.match(migration, /interval '180 seconds'/i);
  assert.match(migration, /last_attempt_iso_week is distinct from v_iso_week/i);
  assert.match(migration, /fence_token = p_fence_token/i);
  assert.match(migration, /lease_expires_at >= v_now/i);
  assert.match(migration, /v_count > 20/i);
  assert.match(migration, /p_search_requests is distinct from 1/i);
  assert.match(migration, /public_enabled darf durch die lokale Wochenmigration nicht aktiviert werden/i);
  assert.doesNotMatch(migration, /create\s+(?:or\s+replace\s+)?function\s+public\.kd_entdecken_weekly/i);
});

await check("Recovery ist default-off, nach Cooldown genau einmal service-role-autorisierbar und erhaelt den Cache", () => {
  const recoveryCode = recoveryMigration.replace(/^--.*$/gm, "");
  assert.match(recoveryMigration, /recovery_authorized_iso_week\s+text/i);
  assert.match(recoveryMigration, /recovery_attempted_iso_week\s+text/i);
  assert.match(recoveryMigration, /last_failure_at\s+timestamptz/i);
  assert.match(recoveryMigration, /last_failure_at <= v_now - interval '15 minutes'/i);
  assert.match(recoveryMigration, /recovery_authorized_iso_week = v_iso_week/i);
  assert.match(recoveryMigration, /recovery_attempted_iso_week is distinct from v_iso_week/i);
  assert.match(recoveryMigration, /recovery_authorized_iso_week = null/i);
  assert.match(recoveryMigration, /when v_recovery then v_iso_week/i);
  assert.match(recoveryMigration, /create function public\.kd_entdecken_weekly_recovery_authorize/i);
  assert.match(recoveryMigration, /grant execute on function public\.kd_entdecken_weekly_recovery_authorize\(text\)\s+to service_role/i);
  assert.match(recoveryMigration, /revoke all on function public\.kd_entdecken_weekly_recovery_authorize\(text\)\s+from public, anon, authenticated/i);
  assert.doesNotMatch(recoveryCode, /set\s+payload\s*=\s*null|setInterval|setTimeout|scheduler/i);
});

await check("Owner-Recovery autorisiert und claimt atomar in genau einem service-role-only RPC", () => {
  const recoveryClaimCode = recoveryClaimMigration.replace(/^--.*$/gm, "");
  assert.match(recoveryClaimMigration, /create function public\.kd_entdecken_daily_recovery_claim\(\)/i);
  assert.match(recoveryClaimMigration, /auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(recoveryClaimMigration, /kd_entdecken_weekly_recovery_authorize\(v_iso_week\)/i);
  assert.match(recoveryClaimMigration, /kd_entdecken_daily_claim\(\)/i);
  assert.match(recoveryClaimMigration, /raise exception/i);
  assert.match(recoveryClaimMigration, /grant execute on function public\.kd_entdecken_daily_recovery_claim\(\)\s+to service_role/i);
  assert.match(recoveryClaimMigration, /revoke all on function public\.kd_entdecken_daily_recovery_claim\(\)\s+from public, anon, authenticated/i);
  assert.doesNotMatch(recoveryClaimCode, /setInterval|setTimeout|scheduler|loop\s|while\s/i);
});

await check("App ruft den globalen Feed ohne Owner-Gate auf und behaelt lokale Daten lokal", () => {
  assert.match(appSource, /useWebDiscoveryFeed\(bootDone && tab === "blog"\)/);
  assert.doesNotMatch(appSource, /webDiscoveryOwnerFreigegeben/);
  assert.match(controllerSource, /!active \|\| laufRef\.current/);
  assert.match(controllerSource, /if \(laufRef\.current === lauf && result\?\.feed\) setFeed\(result\.feed\)/);
  assert.doesNotMatch(clientSource, /getAccessToken|hatBestaetigteOwnerRolle|Authorization|profile|seen|selectedServices|radar/);
});

console.log(`\n${checks}/${checks} Entdecken-Wochenserver-Checks bestanden.`);
