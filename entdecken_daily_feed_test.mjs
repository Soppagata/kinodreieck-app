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

let checks = 0;
async function check(name, fn) {
  await fn(); checks += 1;
  console.log(`✓ ${name}`);
}

const source = Object.freeze({
  sourceId: "editorial:tipps",
  domain: "tipps.example",
  publisherFamily: "Tipps Verlag",
  sourceClass: "editorial",
  rightsStatus: "approved",
  attributionApproved: true,
  subdomainsAllowed: false,
  active: true,
  termsUrl: "https://tipps.example/nutzung",
  termsCheckedOn: "2026-08-20",
});
const sources = Object.freeze([source]);
const providerItem = Object.freeze({
  title: "Ein guter Film",
  originalTitle: "A Good Film",
  mediaType: "film",
  releaseYear: 2026,
  attributes: { genres: ["Drama"], tags: ["ruhig"] },
  opinion: {
    url: "https://tipps.example/neue-filme",
    sourceTitle: "Neue Film- und Serientipps",
    summary: "Die Redaktion empfiehlt den Film wegen seiner präzisen Figurenzeichnung.",
    stance: "recommended",
  },
});
function envelope(item = providerItem) {
  return {
    searchResultCount: 1,
    response: { checkedAt: "2026-08-20T09:00:00.000Z", items: [item] },
  };
}
function evaluated(day = "2026-08-20") {
  return evaluateEntdeckenDailyResponse(envelope(), sources, { retrievedOn: day }).feed;
}

await check("Quellenregister verlangt freigegebene redaktionelle HTTPS-Quelle mit Prüftag", () => {
  assert.equal(validateEntdeckenSourceRegistry(sources).ok, true);
  assert.equal(validateEntdeckenSourceRegistry([{ ...source, rightsStatus: "pending" }]).ok, false);
  assert.equal(validateEntdeckenSourceRegistry([{ ...source, termsUrl: "http://tipps.example" }]).ok, false);
});

await check("Providerfund wird in kanonischen stabilen Tagesrecord mit positivem Beleg überführt", () => {
  const result = evaluateEntdeckenDailyResponse(envelope(), sources, { retrievedOn: "2026-08-20" });
  assert.equal(result.status, "confirmed");
  assert.equal(validateEntdeckenDailyFeed(result.feed).ok, true);
  assert.equal(result.feed.validUntil, "2026-08-26");
  assert.match(result.feed.items[0].recordId, /^webtip:[a-f0-9]{16}$/);
  assert.equal(result.feed.items[0].opinions[0].sourceFamily, source.publisherFamily);
  assert.equal(result.feed.items[0].opinions[0].stance, "recommended");
});

await check("Unregistrierte URL oder unbelegte Meinung wird fail-closed verworfen", () => {
  const foreign = {
    ...providerItem,
    opinion: { ...providerItem.opinion, url: "https://fremd.example/tipp" },
  };
  assert.equal(evaluateEntdeckenDailyResponse(envelope(foreign), sources, {
    retrievedOn: "2026-08-20",
  }).status, "insufficient_evidence");
  assert.equal(evaluateEntdeckenDailyResponse(envelope({
    ...providerItem, opinion: { ...providerItem.opinion, stance: "mixed" },
  }), sources, { retrievedOn: "2026-08-20" }).status, "invalid_response");
});

await check("Matching bevorzugt gemeinsame externe ID und blockiert Mehrdeutigkeit", () => {
  const withId = JSON.parse(JSON.stringify(evaluated()));
  withId.items[0].externalIds = { watchmode: "41" };
  const strong = matchWebDiscoveryFeed(withId, [{
    targetId: "watchmode:41", title: "Abweichender lokaler Titel", originalTitle: null,
    year: 2026, type: "movie", externalIds: { watchmode: "41" },
  }]);
  assert.equal(strong[0].status, "matched");
  assert.equal(strong[0].matchedBy, "external-id");

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
    allowed_domains: ["tipps.example"], allowed_callers: ["direct"],
  }]);
  assert.doesNotMatch(JSON.stringify(body), /account|profile|seen|mediathek|catalog|watchlist/i);
});

await check("Anthropic-Antwort akzeptiert nur Toolresultat plus direkte Webzitation", () => {
  const url = providerItem.opinion.url;
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

await check("Browserdienst ist default-off und sendet aktiv genau einen bodylosen GET", async () => {
  let disabledCalls = 0;
  const disabled = createEntdeckenDailyFeedService({
    config: { entdeckenDailyFeedEnabled: false },
    fetchImpl: async () => { disabledCalls += 1; },
  });
  assert.equal((await disabled.load()).status, "disabled");
  assert.equal(disabledCalls, 0);

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
      return { ok: true, async json() { return { ok: true, status: "fresh", feed }; } };
    },
  });
  const result = await service.load();
  assert.equal(result.status, "fresh");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal("body" in calls[0].options, false);
  assert.deepEqual(Object.keys(calls[0].options.headers).sort(), ["Accept", "apikey"]);
});

const migration = fs.readFileSync("./supabase/migrations/20260820200000_entdecken_daily_feed.sql", "utf8");
const functionSource = fs.readFileSync("./supabase/functions/entdecken-daily-task/index.ts", "utf8");
const runnerSource = fs.readFileSync("./supabase/functions/entdecken-daily-task/runner.js", "utf8");
const clientSource = fs.readFileSync("./src/services/entdeckenDailyFeed.js", "utf8");
const controllerSource = fs.readFileSync("./src/controllers/useWebDiscoveryFeed.js", "utf8");
const appSource = fs.readFileSync("./src/App.jsx", "utf8");
const configSource = fs.readFileSync("./supabase/config.toml", "utf8");

await check("Migration beansprucht Tagesversuch atomar, lässt Quellen leer und hält alles default-off", () => {
  assert.match(migration, /feed_enabled\s+boolean\s+not null default false/i);
  assert.match(migration, /provider_enabled\s+boolean\s+not null default false/i);
  assert.match(migration, /last_attempt_on is distinct from v_today/i);
  assert.match(migration, /provider_operation_id is null/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /active and rights_status = 'approved' and attribution_approved/i);
  assert.match(migration, /public\.kd_ai_auftrag_starten\(\s*null,/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.kd_entdecken_sources/i);
  assert.doesNotMatch(migration, /pg_cron|cron\./i);
});

await check("Function und Client halten den globalen Request privatarm und schleifenfrei", () => {
  assert.match(functionSource, /req\.method !== "GET"/);
  assert.match(functionSource, /req\.body !== null/);
  assert.match(functionSource, /kd_entdecken_daily_claim/);
  assert.match(functionSource, /kd_entdecken_daily_auftrag_starten/);
  assert.doesNotMatch(functionSource, /Authorization|accountId|profile|seen|watchlist/);
  assert.equal((runnerSource.match(/adapter\.search\(\)/g) || []).length, 1);
  assert.doesNotMatch(runnerSource, /setInterval|setTimeout|while\s*\(/i);
  assert.doesNotMatch(clientSource, /setInterval|setTimeout|while\s*\(/i);
});

await check("App lädt den globalen Feed erst in Entdecken und reicht ihn einmalig weiter", () => {
  assert.match(appSource, /useWebDiscoveryFeed\(bootDone && tab === "blog"\)/);
  assert.match(controllerSource, /entdeckenDailyFeedService\.load\(\)/);
  assert.match(controllerSource, /!active \|\| laufRef\.current/);
  assert.match(appSource, /webDiscoveryFeed=\{webDiscoveryFeed\}/);
  assert.match(configSource, /\[functions\.entdecken-daily-task\][\s\S]*verify_jwt = false/);
});

console.log(`${checks} Entdecken-Tagesfeed-Checks bestanden.`);
