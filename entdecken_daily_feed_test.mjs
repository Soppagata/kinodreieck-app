/* Entdecken-Tagesfeed: fokussierte Offline-/Mockbelege.
   Kein Netz, kein Provider, keine Datenbank und keine echte KI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateEntdeckenDailyResponse,
  validateEntdeckenDailyFeed,
  validateEntdeckenSourceRegistry,
} from "./supabase/functions/entdecken-daily-task/contract.js";
import {
  buildAnthropicEntdeckenDailyBody,
  parseAnthropicEntdeckenDailyResponse,
} from "./supabase/functions/entdecken-daily-task/anthropicAdapter.js";
import { runEntdeckenDailyRefresh } from "./supabase/functions/entdecken-daily-task/runner.js";
import { matchWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";
import { createEntdeckenDailyFeedService } from "./src/services/entdeckenDailyFeed.js";
import { ENTDECKEN_LAUF_LIMIT_USD_CENT } from "./tools/ai_budget_guard.mjs";
import { ENTDECKEN_DAILY_ONCE_ENV } from "./tools/keychain_runner.mjs";
import { runEntdeckenDailyOnce } from "./tools/entdecken_daily_live.mjs";

let checks = 0;
async function check(name, fn) {
  await fn(); checks += 1;
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
const providerItem = Object.freeze({
  title: "Ein guter Film",
  mediaType: "film",
  releaseYear: 2026,
  attributes: { genres: ["Drama"], tags: ["ruhig"] },
  evidence: {
    url: "https://www.film.at/streaming/neue-filme",
    publishedOn: "2026-08-20",
    positiveRecommendation: true,
  },
});
function envelope(item = providerItem) {
  return {
    searchResultCount: 1,
    response: { checkedAt: "2026-08-20T09:00:00.000Z", items: [item] },
  };
}
function evaluated(day = "2026-08-20") {
  return evaluateEntdeckenDailyResponse(envelope({
    ...providerItem, evidence: { ...providerItem.evidence, publishedOn: day },
  }), sources, { retrievedOn: day }).feed;
}

await check("Quellenregister verlangt exakt die zwei freigegebenen österreichischen Redaktionen", () => {
  assert.equal(validateEntdeckenSourceRegistry(sources).ok, true);
  assert.equal(validateEntdeckenSourceRegistry([standardSource]).ok, false);
  assert.equal(validateEntdeckenSourceRegistry([{ ...standardSource, rightsStatus: "pending" }, filmAtSource]).ok, false);
  assert.equal(validateEntdeckenSourceRegistry([{ ...standardSource, termsUrl: "http://derstandard.at" }, filmAtSource]).ok, false);
});

await check("Providerfund wird ohne Rezensionstext in minimalen positiven Beleg überführt", () => {
  const result = evaluateEntdeckenDailyResponse(envelope(), sources, { retrievedOn: "2026-08-20" });
  assert.equal(result.status, "confirmed");
  assert.equal(validateEntdeckenDailyFeed(result.feed).ok, true);
  assert.equal(result.feed.validUntil, "2026-08-26");
  assert.match(result.feed.items[0].recordId, /^webtip:[a-f0-9]{16}$/);
  assert.deepEqual(result.feed.items[0].evidence[0], {
    domain: "www.film.at",
    url: providerItem.evidence.url,
    publishedOn: "2026-08-20",
    retrievedOn: "2026-08-20",
    positiveRecommendation: true,
  });
  assert.doesNotMatch(JSON.stringify(result.feed), /summary|quote|review|image|logo|sourceTitle/i);
});

await check("Unregistrierte URL oder unbelegte Meinung wird fail-closed verworfen", () => {
  const foreign = {
    ...providerItem,
    evidence: { ...providerItem.evidence, url: "https://fremd.example/tipp" },
  };
  assert.equal(evaluateEntdeckenDailyResponse(envelope(foreign), sources, {
    retrievedOn: "2026-08-20",
  }).status, "insufficient_evidence");
  assert.equal(evaluateEntdeckenDailyResponse(envelope({
    ...providerItem, evidence: { ...providerItem.evidence, positiveRecommendation: false },
  }), sources, { retrievedOn: "2026-08-20" }).status, "invalid_response");
});

await check("Matching bleibt exakt bei Titel, Jahr und Typ und blockiert Mehrdeutigkeit", () => {
  const exact = matchWebDiscoveryFeed(evaluated(), [{
    targetId: "watchmode:41", title: "Ein guter Film", originalTitle: null,
    year: 2026, type: "movie", externalIds: {},
  }]);
  assert.equal(exact[0].status, "matched");
  assert.equal(exact[0].matchedBy, "title-year-type");

  const ambiguous = matchWebDiscoveryFeed(evaluated(), [1, 2].map((id) => ({
    targetId: `catalog:${id}`, title: "Ein guter Film", originalTitle: null,
    year: 2026, type: "film", externalIds: {},
  })));
  assert.equal(ambiguous[0].status, "ambiguous");
  assert.equal(ambiguous[0].candidate, null);
});

const providerSetup = Object.freeze({
  feedEnabled: true,
  providerEnabled: true,
  providerAllowed: true,
  modelAlias: "klein",
  model: "claude-haiku-4-5",
  maxTokens: 1800,
  taskCapUsdCent: 5,
  searchFeeUsdCent: 1,
  globalRequestCapUsdCent: 500,
  timeoutMs: 30_000,
  inputPriceUsdCentPerMtok: 100,
  outputPriceUsdCentPerMtok: 500,
  sourceRegistry: sources,
});

await check("Verifizierter Anthropic-Request enthält nur die globale AT-Suche und erlaubte Domains", () => {
  const body = buildAnthropicEntdeckenDailyBody(providerSetup);
  const input = JSON.parse(body.messages[0].content);
  assert.deepEqual(input, {
    query: "neue Serien- und Filmtipps", region: "AT", language: "de", maxItems: 20,
  });
  assert.deepEqual(body.tools, [{
    type: "web_search_20250305", name: "web_search", max_uses: 1,
    allowed_domains: ["derstandard.at", "film.at"], allowed_callers: ["direct"],
  }]);
  assert.doesNotMatch(JSON.stringify(body), /account|profile|seen|mediathek|catalog|watchlist/i);
});

await check("Anthropic-Antwort akzeptiert nur Toolresultat plus direkte Webzitation", () => {
  const url = providerItem.evidence.url;
  const response = {
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 120, output_tokens: 80, server_tool_use: { web_search_requests: 1 } },
    content: [
      { type: "server_tool_use", id: "tool-1", name: "web_search", input: { query: "Tipps" } },
      { type: "web_search_tool_result", tool_use_id: "tool-1", content: [
        { type: "web_search_result", url, title: "Tipps" },
      ] },
      {
        type: "text", text: JSON.stringify({ items: [providerItem] }),
        citations: [{ type: "web_search_result_location", url, title: "Tipps" }],
      },
    ],
  };
  const parsed = parseAnthropicEntdeckenDailyResponse(response, providerSetup, "2026-08-20T09:00:00.000Z");
  assert.equal(parsed.envelope.searchResultCount, 1);
  assert.equal(parsed.usage.searchRequests, 1);
  assert.throws(() => parseAnthropicEntdeckenDailyResponse({
    ...response,
    content: response.content.map((block) => block.type === "text" ? { ...block, citations: [] } : block),
  }, providerSetup, "2026-08-20T09:00:00.000Z"), /provider-citation-invalid/);
});

await check("Tagesrunner speichert einmal und macht am selben Tag keinen Folge-Providerlauf", async () => {
  let stored = null;
  let attempted = false;
  let adapterCalls = 0;
  const repository = {
    async claimRefresh() {
      const refresh = !attempted;
      attempted = true;
      return { feedEnabled: true, providerEnabled: true, today: "2026-08-20", refresh, feed: stored };
    },
    async loadSources() { return sources; },
    async saveFeed(feed) { stored = feed; },
    async markFailure() { throw new Error("unerwartet"); },
  };
  const adapter = { async search() { adapterCalls += 1; return envelope(); } };
  assert.equal((await runEntdeckenDailyRefresh({ repository, adapter })).status, "fresh");
  assert.equal((await runEntdeckenDailyRefresh({ repository, adapter })).status, "fresh");
  assert.equal(adapterCalls, 1);
});

await check("Providerfehler behält alten gültigen Feed und löst keinen Retry aus", async () => {
  const oldFeed = evaluated("2026-08-19");
  let adapterCalls = 0;
  let failures = 0;
  const result = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return { feedEnabled: true, providerEnabled: true, today: "2026-08-20", refresh: true, feed: oldFeed };
      },
      async loadSources() { return sources; },
      async saveFeed() { throw new Error("unerwartet"); },
      async markFailure() { failures += 1; },
    },
    adapter: { async search() { adapterCalls += 1; throw new Error("offline"); } },
  });
  assert.equal(result.status, "stale");
  assert.equal(result.feed.refreshedOn, "2026-08-19");
  assert.equal(adapterCalls, 1);
  assert.equal(failures, 1);
});

await check("Browserdienst bleibt Max-only und sendet genau einen bodylosen Owner-GET", async () => {
  let disabledCalls = 0;
  const disabled = createEntdeckenDailyFeedService({
    config: { entdeckenDailyFeedEnabled: false },
    fetchImpl: async () => { disabledCalls += 1; },
  });
  assert.equal((await disabled.load()).status, "disabled");
  assert.equal(disabledCalls, 0);

  const calls = [];
  const feed = evaluated();
  const session = {
    mode: "account", state: "ready",
    account: { id: "00000000-0000-4000-8000-000000000001", role: "owner" },
    access: { status: "resolved", role: "owner" },
    capabilities: { remoteStorage: true, personalAi: true },
  };
  const service = createEntdeckenDailyFeedService({
    config: {
      entdeckenDailyFeedEnabled: true,
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "public-key",
    },
    auth: { getSnapshot: () => session },
    getAccount: () => ({ id: session.account.id }),
    getAccessToken: async () => "owner-token",
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
  assert.deepEqual(Object.keys(calls[0].options.headers).sort(), ["Accept", "Authorization", "apikey"]);
  assert.equal(calls[0].options.headers.Authorization, "Bearer owner-token");
});

await check("Budgetpfad macht genau einen bodylosen Live-GET ohne Retry und misst maximal 900 US-Cent", async () => {
  assert.equal(ENTDECKEN_LAUF_LIMIT_USD_CENT, 900);
  const calls = [];
  const healthSpends = [100, 100, 100.25];
  const output = [];
  const env = {
    KD_SB_URL: "https://project.supabase.co",
    KD_SB_ANON: "sb_publishable_test_1234567890",
    KD_TESTA_PASS: "nicht-echt",
    KD_TESTA_USER: "testa",
    KD_MAIL_DOMAIN: "login.kinodreieck.at",
    KD_AI_FUNKTION: "ai-task",
    KD_ORIGIN: "https://kinodreieck.at",
    KD_AI_OWNER_APPROVED_SERVER_BUDGET: "1",
    [ENTDECKEN_DAILY_ONCE_ENV]: "keychain-budget-guard-v1",
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/auth/v1/token")) {
      return { ok: true, status: 200, async json() { return { access_token: "token" }; } };
    }
    if (url.endsWith("/functions/v1/ai-task")) {
      const spend = healthSpends.shift();
      return { ok: true, status: 200, async json() { return {
        ok: true,
        betrieb: {
          monatsbudgetUsdCent: 1000,
          anbieterRequestMaxUsdCent: 500,
          anbieterRequestOwnerMaxUsdCent: 500,
          anbieterRequestTimeoutMs: 120000,
          anbieterRequestTimeoutOwnerMaxMs: 135000,
          stand: { monatVerbrauchtUsdCent: spend, budgetErschoepft: false },
        },
      }; } };
    }
    if (url.endsWith("/functions/v1/entdecken-daily-task")) {
      return { ok: true, status: 200, async json() { return {
        ok: true, status: "fresh", feed: evaluated(),
        writes: 1, providerRequests: 1, searchRequests: 1,
      }; } };
    }
    throw new Error("unerwartetes Ziel");
  };
  const result = await runEntdeckenDailyOnce({ env, fetchImpl, ausgabe: (line) => output.push(line) });
  const discoveryCalls = calls.filter((call) => call.url.endsWith("/functions/v1/entdecken-daily-task"));
  assert.equal(result.laufKostenUsdCent, 0.25);
  assert.equal(discoveryCalls.length, 1);
  assert.equal(discoveryCalls[0].options.method, "GET");
  assert.equal("body" in discoveryCalls[0].options, false);
  assert.equal(healthSpends.length, 0);
  assert.equal(output.length, 1);

  let unguardedFetches = 0;
  await assert.rejects(() => runEntdeckenDailyOnce({
    env: { ...env, [ENTDECKEN_DAILY_ONCE_ENV]: "" },
    fetchImpl: async () => { unguardedFetches += 1; },
  }), /fest verdrahteten npm-Budgetweg/);
  assert.equal(unguardedFetches, 0);
});

const migration = fs.readFileSync("./supabase/migrations/20260820200000_entdecken_daily_feed.sql", "utf8");
const functionSource = fs.readFileSync("./supabase/functions/entdecken-daily-task/index.ts", "utf8");
const runnerSource = fs.readFileSync("./supabase/functions/entdecken-daily-task/runner.js", "utf8");
const clientSource = fs.readFileSync("./src/services/entdeckenDailyFeed.js", "utf8");
const controllerSource = fs.readFileSync("./src/controllers/useWebDiscoveryFeed.js", "utf8");
const appSource = fs.readFileSync("./src/App.jsx", "utf8");
const configSource = fs.readFileSync("./supabase/config.toml", "utf8");

await check("Migration beansprucht atomar, seedet nur zwei Quellen und hält Public/Commercial aus", () => {
  assert.match(migration, /owner_pilot_enabled\s+boolean\s+not null default false/i);
  assert.match(migration, /feed_enabled\s+boolean\s+not null default false/i);
  assert.match(migration, /provider_enabled\s+boolean\s+not null default false/i);
  assert.match(migration, /public_enabled\s+boolean\s+not null default false/i);
  assert.match(migration, /commercial_enabled\s+boolean\s+not null default false/i);
  assert.match(migration, /last_attempt_on is distinct from v_today/i);
  assert.match(migration, /provider_operation_id is null/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /active and rights_status = 'approved' and attribution_approved/i);
  assert.match(migration, /public\.kd_ai_auftrag_starten\(\s*null,/i);
  assert.match(migration, /'editorial:derstandard', 'derstandard\.at'/i);
  assert.match(migration, /'editorial:filmat', 'film\.at'/i);
  assert.equal((migration.match(/'editorial:(?:derstandard|filmat)'/g) || []).length, 2);
  assert.doesNotMatch(migration, /pg_cron|cron\./i);
});

await check("Function erzwingt Own-Row-Owner plus personal_ai und bleibt schleifenfrei", () => {
  assert.match(functionSource, /req\.method !== "GET"/);
  assert.match(functionSource, /req\.body !== null/);
  assert.match(functionSource, /kd_entdecken_daily_claim/);
  assert.match(functionSource, /kd_entdecken_daily_auftrag_starten/);
  assert.match(functionSource, /Authorization/);
  assert.match(functionSource, /role,active,personal_ai/);
  assert.match(functionSource, /role !== "owner"/);
  assert.doesNotMatch(functionSource, /displayName|email|profile|seen|watchlist/);
  assert.equal((runnerSource.match(/adapter\.search\(\)/g) || []).length, 1);
  assert.doesNotMatch(runnerSource, /setInterval|setTimeout|while\s*\(/i);
  assert.doesNotMatch(clientSource, /setInterval|setTimeout|while\s*\(/i);
});

await check("App lädt den privaten Feed erst in Entdecken und nur mit bestätigtem Owner-Gate", () => {
  assert.match(appSource, /webDiscoveryOwnerFreigegeben = ownerTechnikBestaetigt/);
  assert.match(appSource, /useWebDiscoveryFeed\([\s\S]*bootDone && tab === "blog"[\s\S]*webDiscoveryOwnerFreigegeben/);
  assert.match(controllerSource, /entdeckenDailyFeedService\.load\(\)/);
  assert.match(controllerSource, /!active \|\| laufRef\.current/);
  assert.match(appSource, /webDiscoveryFeed=\{webDiscoveryFeed\}/);
  assert.match(configSource, /\[functions\.entdecken-daily-task\][\s\S]*verify_jwt = false/);
});

console.log(`${checks} Entdecken-Tagesfeed-Checks bestanden.`);
