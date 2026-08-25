/* Entdecken-Wochenserver: fokussierter Offline-/Mockbeleg.
   Kein Netz, kein Provider, keine Datenbank und keine echte KI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createEntdeckenWeeklyQueryContext,
  ENTDECKEN_WEEKLY_MAX_CANDIDATES,
  ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS,
  ENTDECKEN_WEEKLY_REFRESH_MIN_ITEMS,
  evaluateEntdeckenDailyResponse,
  requestHasForbiddenBody,
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
import { normalizeEntdeckenPersistenceReadback } from "./supabase/functions/entdecken-daily-task/readbackContract.js";
import {
  createProviderReceipt,
  isProviderReceipt,
} from "./supabase/functions/_shared/providerReceipt.js";
import { validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";
import { createEntdeckenRecommendations } from "./src/lib/entdeckenUi.js";
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
const orfSource = Object.freeze({
  ...standardSource,
  sourceId: "editorial:orf",
  domain: "orf.at",
  publisherFamily: "ORF",
  termsUrl: "https://orf.at/stories/impressum/",
});
const sources = Object.freeze([standardSource, filmAtSource, orfSource]);
const queryContext = createEntdeckenWeeklyQueryContext("2026-08-20", "2026-W34");

await check("leerer Edge-POST mit Content-Length 0 bleibt zulaessig, Nutzlast bleibt verboten", () => {
  const edgeEmptyPost = new Request("https://project.supabase.co/functions/v1/entdecken-daily-task", {
    method: "POST",
    headers: { "content-length": "0" },
    body: "",
  });
  const bodyPost = new Request("https://project.supabase.co/functions/v1/entdecken-daily-task", {
    method: "POST",
    headers: { "content-length": "2" },
    body: "{}",
  });
  assert.equal(edgeEmptyPost.body === null, false);
  assert.equal(requestHasForbiddenBody(edgeEmptyPost), false);
  assert.equal(requestHasForbiddenBody(bodyPost), true);
  assert.equal(requestHasForbiddenBody(new Request("https://project.supabase.co")), false);
});

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

function providerItems(count = ENTDECKEN_WEEKLY_REFRESH_MIN_ITEMS) {
  return Array.from({ length: count }, (_, index) => providerItem(index + 1));
}

function envelope(items = providerItems()) {
  return {
    searchResultCount: new Set(items.map((item) => item.evidence.url)).size,
    queryContext,
    response: { checkedAt: "2026-08-20T09:00:00.000Z", items },
  };
}

function evaluated(items = providerItems(), day = "2026-08-20", isoWeek = "2026-W34") {
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

async function mockReceipt({
  providerResponseText = JSON.stringify({ items: providerItems() }),
  responseMode = "structured",
  logId = 71,
  inputTokens = 120,
  outputTokens = 240,
  searchRequests = 1,
  costUsdCent = 1.1321,
} = {}) {
  return await createProviderReceipt({
    provider: "anthropic",
    providerResponseText,
    model: "claude-haiku-4-5",
    inputTokens,
    outputTokens,
    webSearchRequests: searchRequests,
    resultMode: responseMode,
    serverLogId: logId,
    providerRequests: 1,
    reservationUsdCent: 3.5,
    costUsdCent,
  });
}

function persistenceReadback(feed, receipt, fenceToken) {
  const evidence = feed.items.flatMap((item) => item.evidence);
  const usedSources = sources.filter((source) => evidence.some((entry) => (
    entry.domain === source.domain
      || (source.subdomainsAllowed && entry.domain.endsWith(`.${source.domain}`))
  )));
  return {
    ok: true,
    status: "verified",
    feed,
    fenceToken,
    providerLog: {
      logId: receipt.server.logId,
      operationId: `00000000-0000-4000-8000-${String(receipt.server.logId).padStart(12, "0")}`,
      task: "entdecken-daily",
      status: "fertig",
      model: receipt.model,
      inputTokens: receipt.usage.inputTokens,
      outputTokens: receipt.usage.outputTokens,
      costUsdCent: receipt.server.costUsdCent,
    },
    provenance: {
      evidenceCount: evidence.length,
      sourceCount: usedSources.length,
      approvedSourceCount: sources.length,
    },
  };
}

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

let endToEndFeed = null;

await check("Query-Kontext bindet ISO-Jahr und Kalenderwoche auch am Jahreswechsel", () => {
  assert.deepEqual(queryContext, {
    year: 2026,
    calendarWeek: 34,
    isoWeek: "2026-W34",
    query: "Aktuelle positiv bewertete Film- und Serien-Charts und Tipps Österreich 2026 KW 34",
  });
  assert.equal(createEntdeckenWeeklyQueryContext("2027-01-01")?.isoWeek, "2026-W53");
  assert.equal(createEntdeckenWeeklyQueryContext("2026-08-20", "2026-W33"), null);
});

await check("Quellenregister akzeptiert eine kleine freigegebene Redaktionsliste ohne Zwei-Domain-Zwang", () => {
  assert.equal(validateEntdeckenSourceRegistry(sources).ok, true);
  assert.equal(validateEntdeckenSourceRegistry([standardSource]).ok, true);
  assert.equal(validateEntdeckenSourceRegistry(Array.from({ length: 11 }, (_, index) => ({
    ...standardSource,
    sourceId: `editorial:quelle_${index}`,
    domain: `quelle-${index}.example`,
  }))).ok, false);
  assert.equal(validateEntdeckenSourceRegistry([{ ...standardSource, active: false }, filmAtSource]).ok, false);
});

await check("Anthropic-Body erlaubt zwei begrenzte AT-Wochensuchen und keine lokalen Daten", () => {
  const body = buildAnthropicEntdeckenDailyBody(providerSetup, queryContext);
  const input = JSON.parse(body.messages[0].content);
  assert.deepEqual(input, {
    queryContext, region: "AT", language: "de", maxItems: ENTDECKEN_WEEKLY_MAX_CANDIDATES,
  });
  assert.deepEqual(body.tools, [{
    type: "web_search_20250305", name: "web_search", max_uses: 2,
    allowed_domains: ["derstandard.at", "film.at", "orf.at"], allowed_callers: ["direct"],
    user_location: { type: "approximate", country: "AT", timezone: "Europe/Vienna" },
  }]);
  assert.match(body.system, /ausschliesslich mit einem einzigen JSON-Objekt/);
  assert.match(body.system, /mindestens fuenf belegte Titel/);
  assert.match(body.system, /evidence\.url ist unveraendert exakt eine URL aus den Websearch-Ergebnissen/);
  assert.match(body.system, /automatischen Websearch-Zitate auch in der strukturierten JSON-Antwort/);
  assert.match(body.system, /weniger statt Fuellmaterial oder erfundener Daten/);
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

await check("Anthropic-Transport behält sichere Items und begrenzt Suchrequests", () => {
  const response = anthropicResponse();
  const parsed = parseAnthropicEntdeckenDailyResponse(
    response, providerSetup, "2026-08-20T09:00:00.000Z", queryContext,
  );
  assert.equal(parsed.envelope.searchResultCount, 1);
  assert.deepEqual(parsed.envelope.queryContext, queryContext);
  assert.throws(() => parseAnthropicEntdeckenDailyResponse({
    ...response,
    usage: { ...response.usage, server_tool_use: { web_search_requests: 3 } },
  }, providerSetup, "2026-08-20T09:00:00.000Z", queryContext), /provider-usage-invalid/);
  const withoutCitation = parseAnthropicEntdeckenDailyResponse({
    ...response,
    content: response.content.map((block) => block.type === "text" ? { ...block, citations: [] } : block),
  }, providerSetup, "2026-08-20T09:00:00.000Z", queryContext);
  assert.equal(withoutCitation.envelope.responseMode, "degraded");
  assert.deepEqual(withoutCitation.envelope.response.items, []);
});

await check("Automatische Websearch-Zitate duerfen ein valides JSON ueber mehrere Textbloecke teilen", () => {
  const items = providerItems(6);
  const providerText = JSON.stringify({ items });
  const urls = [...new Set(items.map((item) => item.evidence.url))];
  const splitAt = [
    providerText.indexOf("Ninth Jedi") + 3,
    providerText.indexOf("Positiver Wochentipp 04") + 11,
  ];
  assert.ok(splitAt[0] > 2);
  assert.ok(splitAt[1] > splitAt[0]);
  const response = anthropicResponse(items);
  response.content = [
    ...response.content.slice(0, 2),
    {
      type: "text",
      text: providerText.slice(0, splitAt[0]),
      citations: [{ type: "web_search_result_location", url: urls[0], title: "Wochentipps A" }],
    },
    {
      type: "text",
      text: providerText.slice(splitAt[0], splitAt[1]),
      citations: [{ type: "web_search_result_location", url: urls[1], title: "Wochentipps B" }],
    },
    {
      type: "text",
      text: providerText.slice(splitAt[1]),
      citations: urls.map((url) => ({
        type: "web_search_result_location", url, title: "Wochentipps",
      })),
    },
  ];
  const parsed = parseAnthropicEntdeckenDailyResponse(
    response, providerSetup, "2026-08-20T09:00:00.000Z", queryContext,
  );
  assert.equal(parsed.consumedProviderText, providerText);
  assert.equal(parsed.envelope.response.items.length, 6);
  assert.ok(parsed.envelope.warnings.includes("multiple-text-blocks-normalized"));
  const evaluatedParsed = evaluateEntdeckenDailyResponse(parsed.envelope, sources, {
    retrievedOn: "2026-08-20",
    claimedIsoWeek: "2026-W34",
  });
  assert.equal(evaluatedParsed.ok, true, JSON.stringify(evaluatedParsed.errors));
  assert.equal(evaluatedParsed.feed.items.length, 6);
});

await check("Adapter macht ohne Retry genau einen Providerrequest und ist danach verbraucht", async () => {
  let providerRequests = 0;
  let reservations = 0;
  let settlements = 0;
  let settledReadbacks = 0;
  let reservationInput = null;
  const adapter = createAnthropicEntdeckenDailyAdapter({
    apiKey: "mock-key",
    loadSetup: async () => providerSetup,
    reserveCost: async (input) => { reservations += 1; reservationInput = input; return { ok: true, logId: 71 }; },
    settleCost: async () => { settlements += 1; },
    readSettledCost: async ({ logId, operationId }) => {
      settledReadbacks += 1;
      return {
        logId,
        operationId,
        task: "entdecken-daily",
        status: "fertig",
        model: "claude-haiku-4-5",
        inputTokens: 120,
        outputTokens: 240,
        costUsdCent: 1.1321,
      };
    },
    fetchImpl: async () => {
      providerRequests += 1;
      return { ok: true, async text() { return JSON.stringify(anthropicResponse()); } };
    },
    now: () => "2026-08-20T09:00:00.000Z",
    operationId: () => "00000000-0000-4000-8000-000000000071",
  });
  const result = await adapter.search(queryContext);
  assert.equal(result.queryContext.isoWeek, "2026-W34");
  assert.equal(isProviderReceipt(result.providerReceipt), true);
  assert.equal(result.providerReceipt.provider, "anthropic");
  assert.equal(result.providerReceipt.model, "claude-haiku-4-5");
  assert.deepEqual(result.providerReceipt.usage, {
    inputTokens: 120, outputTokens: 240, webSearchRequests: 1,
  });
  assert.equal(result.providerReceipt.resultMode, "structured");
  assert.equal(result.providerReceipt.server.logId, 71);
  assert.doesNotMatch(
    JSON.stringify(result.providerReceipt),
    /mock-key|film\.at|web_search_result|The Ninth Jedi/,
  );
  await assert.rejects(() => adapter.search(queryContext), /already-used/);
  assert.equal(providerRequests, 1);
  assert.equal(reservations, 1);
  assert.equal(reservationInput.providerRequests, 1);
  assert.equal(settlements, 1);
  assert.equal(settledReadbacks, 1);
  const consumedText = anthropicResponse().content.find((block) => block.type === "text").text;
  const expectedReceipt = await mockReceipt({ providerResponseText: consumedText });
  assert.equal(result.providerReceipt.responseSha256, expectedReceipt.responseSha256);
  assert.equal(adapter.takeProviderRawResponse(), JSON.stringify(anthropicResponse()));
  assert.equal(adapter.takeProviderRawResponse(), null);
});

await check("Weicher Websearch-Mock speichert sechs sichere Titel und projiziert Für mich plus Weitere", async () => {
  const validItems = Array.from({ length: 6 }, (_, index) => providerItem(index + 1));
  validItems[5] = {
    ...validItems[5],
    evidence: {
      ...validItems[5].evidence,
      url: "https://tv.orf.at/stories/film-serien-tipps-kw-34",
    },
  };
  const flexibleItems = validItems.map((item, index) => {
    if (index === 0) return { ...item, providerNote: "wird ignoriert" };
    if (index === 1) {
      const { externalIds: _externalIds, attributes: _attributes, ...required } = item;
      return required;
    }
    return item;
  });
  const urls = [...new Set(validItems.map((item) => item.evidence.url))];
  const response = {
    model: "claude-haiku-4-5",
    stop_reason: "max_tokens",
    usage: { input_tokens: 180, output_tokens: 420, server_tool_use: { web_search_requests: 2 } },
    content: [
      { type: "server_tool_use", id: "tool-1", name: "web_search", input: { query: queryContext.query } },
      { type: "web_search_tool_result", tool_use_id: "tool-1", content: [{
        type: "web_search_result", url: urls[0], title: "Wochentipps A",
      }] },
      { type: "text", text: "Zwischenstand: Die zweite kleine Suche ergänzt die Liste." },
      { type: "server_tool_use", id: "tool-2", name: "web_search", input: { query: `${queryContext.query} Serien` } },
      { type: "web_search_tool_result", tool_use_id: "tool-2", content: urls.slice(1).map((url) => ({
        type: "web_search_result", url, title: "Wochentipps B",
      })) },
      {
        type: "text",
        text: `Hier sind die belegten Titel.\n\`\`\`json\n${JSON.stringify({
          items: [...flexibleItems, { title: "Kaputter Titel" }],
          providerExtra: "wird ignoriert",
        })}\n\`\`\`\nWeitere Erklärung wird nicht angezeigt.`,
        citations: urls.map((url) => ({ type: "web_search_result_location", url, title: "Wochentipps" })),
      },
    ],
  };
  const parsed = parseAnthropicEntdeckenDailyResponse(
    response, providerSetup, "2026-08-20T09:00:00.000Z", queryContext,
  );
  assert.equal(parsed.envelope.responseMode, "partial");
  assert.equal(parsed.envelope.response.items.length, 6);
  const evaluatedParsed = evaluateEntdeckenDailyResponse(parsed.envelope, sources, {
    retrievedOn: "2026-08-20",
    claimedIsoWeek: "2026-W34",
  });
  assert.equal(evaluatedParsed.ok, true, JSON.stringify(evaluatedParsed.errors));
  const receipt = await mockReceipt({
    providerResponseText: parsed.consumedProviderText,
    responseMode: parsed.envelope.responseMode,
    logId: 81,
    inputTokens: 180,
    outputTokens: 420,
    searchRequests: 2,
    costUsdCent: 2.228,
  });
  assert.equal(isProviderReceipt(receipt), true);

  let saves = 0;
  const run = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
          refresh: true, fenceToken: 81, feed: null,
        };
      },
      async loadSources() { return sources; },
      async saveFeed(feed, options) {
        assert.equal(validateEntdeckenDailyFeed(feed).ok, true);
        assert.deepEqual(options.providerReceipt, receipt);
        endToEndFeed = feed;
        saves += 1;
      },
      async readFeed({ fenceToken, providerReceipt }) {
        assert.deepEqual(providerReceipt, receipt);
        const readback = persistenceReadback(endToEndFeed, receipt, fenceToken);
        assert.ok(normalizeEntdeckenPersistenceReadback(readback, {
          expectedFeed: endToEndFeed,
          fenceToken,
          providerReceipt,
        }));
        return readback;
      },
      async markFailure() { throw new Error("unerwartet"); },
    },
    adapter: { async search() { return { ...parsed.envelope, providerReceipt: receipt }; } },
  });
  assert.equal(run.status, "fresh");
  assert.equal(run.responseMode, "partial");
  assert.equal(saves, 1);
  assert.equal(endToEndFeed.items.length, 6);
  assert.equal(run.feedReadback.itemCount, 6);
  assert.equal(run.feedReadback.providerLogId, receipt.server.logId);

  const selection = createEntdeckenRecommendations({
    streamingEntdecken: {
      region: "AT", stand: "2026-08-20T00:00:00.000Z", titel: [{
        watchmode_id: 5001, titel: "The Ninth Jedi", jahr: 2026, typ: "movie",
        dienste: ["ORF ON"], genres: ["Drama"], tags: [],
      }, {
        watchmode_id: 9999, titel: "Nur aus streaming_entdecken", jahr: 2026, typ: "movie",
        dienste: ["ORF ON"], genres: ["Drama"], tags: [],
      }],
    },
    profile: {
      signals: [{ kind: "genre", value: "Drama", direction: "positive", confirmed: true, strength: 4 }],
    },
    master: [], selectedServices: ["ORF ON"], entdeckenStatus: {},
    webDiscoveryFeed: endToEndFeed, selectionDay: "2026-08-20",
  });
  assert.equal(selection.personal.length, 1);
  assert.equal(selection.personal[0].title, "The Ninth Jedi");
  assert.equal(selection.further.length, 5);
  assert.equal([...selection.personal, ...selection.further].length, 6);
  assert.ok(selection.further.every((item) => item.externalEvidence.length > 0));
  assert.ok(selection.further.some((item) => item.services.length === 0));
  assert.ok(![...selection.personal, ...selection.further]
    .some((item) => item.title === "Nur aus streaming_entdecken"));
});

await check("Unparsebarer sicherer Text ersetzt den Feed nicht; spaeterer GET liest nur den alten Feed", async () => {
  assert.ok(endToEndFeed);
  const response = anthropicResponse();
  response.content = response.content.map((block) => block.type === "text" ? {
    ...block,
    text: "Diese Woche war keine verlässliche strukturierte Liste ableitbar.",
  } : block);
  const parsed = parseAnthropicEntdeckenDailyResponse(
    response, providerSetup, "2026-08-20T10:00:00.000Z", queryContext,
  );
  assert.equal(parsed.envelope.responseMode, "degraded");
  assert.deepEqual(parsed.envelope.response.items, []);
  let saves = 0;
  const failures = [];
  const run = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
          refresh: true, fenceToken: 82, feed: endToEndFeed,
        };
      },
      async loadSources() { return sources; },
      async saveFeed() { saves += 1; },
      async markFailure(value) { failures.push(value); },
    },
    adapter: { async search() { return parsed.envelope; } },
  });
  assert.equal(saves, 0);
  assert.equal(run.responseMode, "degraded");
  assert.match(run.displayText, /bisherige Feed bleibt sichtbar/);
  assert.deepEqual(run.feed, endToEndFeed);
  assert.deepEqual(failures, [{ code: "invalid_response", fenceToken: 82 }]);

  const service = createEntdeckenDailyFeedService({
    config: {
      entdeckenDailyFeedEnabled: true,
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "public-key",
    },
    currentDay: () => "2026-08-20",
    fetchImpl: async () => ({ ok: true, async json() {
      return { ok: true, status: run.status, feed: run.feed, writes: 0,
        providerRequests: 0, searchRequests: 0, responseMode: "structured",
        displayText: null, warnings: [], refresh: {
          requested: false, mode: "read", status: "read_only",
          attemptCount: 1, maxAttempts: 3,
        } };
    } }),
  });
  const loaded = await service.load();
  assert.equal(loaded.responseMode, "structured");
  assert.equal(loaded.refresh.status, "read_only");
  assert.equal(loaded.feed.items.length, 6);
});

await check("Neuer Wochenrefresh speichert exakt fuenf bis sieben belegte Titel", () => {
  const items = Array.from({ length: 20 }, (_, index) => providerItem(index + 1));
  const feed = evaluated(items);
  assert.equal(feed.items.length, ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS);
  assert.equal(feed.isoWeek, "2026-W34");
  assert.equal(feed.validUntil, "2026-08-23");
  assert.equal(feed.items[0].title, "The Ninth Jedi");
  assert.deepEqual(feed.items[0].externalIds, { watchmode: "5001" });
  assert.deepEqual(Object.keys(feed.items[0].attributes).sort(), ["genres", "themes", "tones"]);
  assert.equal(validateEntdeckenDailyFeed(feed).ok, true);
  assert.equal(validateWebDiscoveryFeed(feed).ok, true);
  const truncated = evaluateEntdeckenDailyResponse(envelope([...items, providerItem(21)]), sources, {
    retrievedOn: "2026-08-20", claimedIsoWeek: "2026-W34",
  });
  assert.equal(truncated.ok, true);
  assert.equal(truncated.feed.items.length, ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS);
  assert.equal(truncated.responseMode, "partial");
  assert.equal(evaluateEntdeckenDailyResponse(envelope(providerItems(4)), sources, {
    retrievedOn: "2026-08-20", claimedIsoWeek: "2026-W34",
  }).ok, false);
});

await check("Kandidatenpuffer wird vor Evidenzfilterung genutzt und der sichtbare Feed bleibt auf sieben begrenzt", () => {
  const dropped = [1, 2, 3].map((index) => ({
    ...providerItem(index),
    evidence: { ...providerItem(index).evidence, publishedOn: "2026-06-01" },
  }));
  const safe = Array.from({ length: 7 }, (_, index) => providerItem(index + 10));
  const result = evaluateEntdeckenDailyResponse(envelope([...dropped, ...safe]), sources, {
    retrievedOn: "2026-08-20", claimedIsoWeek: "2026-W34",
  });
  assert.equal(result.ok, true);
  assert.equal(result.feed.items.length, ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS);
  assert.deepEqual(result.feed.items.map((item) => item.rank), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(result.errors.some((error) => /evidence-age-invalid$/.test(error)));
  assert.equal(result.responseMode, "partial");
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
  const duplicateResult = evaluateEntdeckenDailyResponse(envelope([providerItem(), duplicate]), sources, {
    retrievedOn: "2026-08-20", claimedIsoWeek: "2026-W34",
  });
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.feed, null);
  assert.equal(duplicateResult.responseMode, "degraded");
});

await check("Runner bindet Query und Save an denselben Fencing-Token und sucht nur einmal je Woche", async () => {
  let stored = null;
  let attempted = false;
  let adapterCalls = 0;
  const savedFences = [];
  const receipt = await mockReceipt({ logId: 41 });
  const repository = {
    async claimRefresh() {
      const refresh = !attempted;
      attempted = true;
      return {
        feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
        refresh, fenceToken: refresh ? 41 : null, feed: stored,
        requestMode: "scheduled", claimStatus: refresh ? "claimed" : "already_fresh",
        attemptCount: 1, maxAttempts: 3,
      };
    },
    async loadSources() { return sources; },
    async saveFeed(feed, options) {
      assert.deepEqual(options.providerReceipt, receipt);
      stored = feed;
      savedFences.push(options.fenceToken);
    },
    async readFeed({ fenceToken, providerReceipt }) {
      assert.deepEqual(providerReceipt, receipt);
      return persistenceReadback(stored, receipt, fenceToken);
    },
    async markFailure() { throw new Error("unerwartet"); },
  };
  const adapter = { async search(context) {
    adapterCalls += 1;
    assert.deepEqual(context, queryContext);
    return { ...envelope(), providerReceipt: receipt };
  } };
  const first = await runEntdeckenDailyRefresh({ repository, adapter });
  const second = await runEntdeckenDailyRefresh({ repository, adapter });
  assert.equal(first.status, "fresh");
  assert.equal(first.refresh.status, "refreshed");
  assert.equal(second.status, "fresh");
  assert.equal(second.refresh.status, "already_fresh");
  assert.equal(adapterCalls, 1);
  assert.deepEqual(savedFences, [41]);
});

await check("Providerfehler behaelt den letzten erfolgreichen Vorwochenfeed ohne Retry", async () => {
  const oldContext = createEntdeckenWeeklyQueryContext("2026-08-13", "2026-W33");
  const oldItems = providerItems().map((item) => ({
    ...item,
    evidence: { ...item.evidence, publishedOn: "2026-08-12" },
  }));
  const oldFeed = evaluateEntdeckenDailyResponse({
    ...envelope(oldItems), queryContext: oldContext,
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
  assert.equal(result.responseMode, "degraded");
  assert.match(result.displayText, /bisherige Feed bleibt sichtbar/);
  assert.equal(adapterCalls, 1);
  assert.deepEqual(failures, [{ code: "provider_error", fenceToken: 42 }]);
});

await check("Fehler darf erst in einem spaeteren Lauf recovern; danach bleibt die Woche providerfrei", async () => {
  let attempt = 0;
  let providerCalls = 0;
  let stored = null;
  let failures = 0;
  let saves = 0;
  const receipt = await mockReceipt({ logId: 43 });
  const repository = {
    async claimRefresh() {
      attempt += 1;
      if (attempt === 1) return {
        feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
        refresh: true, fenceToken: 42, feed: null, requestMode: "scheduled",
        claimStatus: "claimed", attemptCount: 1, maxAttempts: 3,
      };
      if (attempt === 2) return {
        feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
        refresh: true, fenceToken: 43, feed: null, requestMode: "scheduled",
        claimStatus: "claimed", attemptCount: 2, maxAttempts: 3,
      };
      return {
        feedEnabled: true, providerEnabled: true, today: "2026-08-20", isoWeek: "2026-W34",
        refresh: false, fenceToken: null, feed: stored, requestMode: "scheduled",
        claimStatus: "already_fresh", attemptCount: 2, maxAttempts: 3,
      };
    },
    async loadSources() { return sources; },
    async saveFeed(feed) { stored = feed; saves += 1; },
    async readFeed({ fenceToken }) { return persistenceReadback(stored, receipt, fenceToken); },
    async markFailure() { failures += 1; },
  };
  const adapter = { async search() {
    providerCalls += 1;
    if (providerCalls === 1) throw new Error("synthetic-first-attempt-failed");
    return { ...envelope(), providerReceipt: receipt };
  } };

  const failed = await runEntdeckenDailyRefresh({ repository, adapter });
  assert.equal(failed.refresh.status, "failed");
  assert.equal(providerCalls, 1);
  assert.equal(saves, 0);
  const recovered = await runEntdeckenDailyRefresh({ repository, adapter });
  assert.equal(recovered.status, "fresh");
  assert.equal(recovered.refresh.status, "refreshed");
  assert.equal(recovered.feed.items.length, 5);
  assert.equal(providerCalls, 2);
  assert.equal(saves, 1);
  const current = await runEntdeckenDailyRefresh({ repository, adapter });
  assert.equal(current.refresh.status, "already_fresh");
  assert.equal(providerCalls, 2);
  assert.equal(failures, 1);
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
        return { ok: true, status: "fresh", feed, writes: 0, providerRequests: 0, searchRequests: 0,
          refresh: { requested: false, mode: "read", status: "read_only", attemptCount: 1, maxAttempts: 3 } };
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
const liveProofMigration = fs.readFileSync("./supabase/migrations/20260824120000_entdecken_weekly_live_proof.sql", "utf8");
const refreshLeaseMigration = fs.readFileSync("./supabase/migrations/20260824140000_entdecken_weekly_refresh_lease.sql", "utf8");
const ownerRefreshOverrideMigration = fs.readFileSync("./supabase/migrations/20260825130000_entdecken_staging_owner_refresh_override.sql", "utf8");
const aiLiveHandoff = fs.readFileSync("./docs/KI_LIVE_TEST_UEBERGABE.md", "utf8");
const functionSource = fs.readFileSync("./supabase/functions/entdecken-daily-task/index.ts", "utf8");
const runnerSource = fs.readFileSync("./supabase/functions/entdecken-daily-task/runner.js", "utf8");
const clientSource = fs.readFileSync("./src/services/entdeckenDailyFeed.js", "utf8");
const controllerSource = fs.readFileSync("./src/controllers/useWebDiscoveryFeed.js", "utf8");
const appSource = fs.readFileSync("./src/App.jsx", "utf8");

await check("GET bleibt read-only; nur explizites scheduled-/owner-POST darf claimen", () => {
  assert.match(functionSource, /\["GET", "POST"\]\.includes\(req\.method\)/);
  assert.match(functionSource, /requestHasForbiddenBody\(req\)/);
  assert.match(functionSource, /scheduledAuthorized = requestMode === "scheduled"/);
  assert.match(functionSource, /req\.headers\.get\("apikey"\) === serviceKey && bearerToken === serviceKey/);
  assert.match(functionSource, /publicKeyAuthorized = requestMode !== "scheduled"/);
  assert.match(functionSource, /requestMode = req\.method === "GET"[\s\S]*"read"/);
  assert.match(functionSource, /SCHEDULED_REFRESH_VALUE/);
  assert.match(functionSource, /OWNER_REFRESH_VALUE/);
  assert.match(functionSource, /user\.auth\.getUser\(token\)/);
  assert.match(functionSource, /\.from\("kd_account_access"\)/);
  assert.match(functionSource, /access\?\.role !== "owner"/);
  assert.match(functionSource, /\.rpc\("kd_entdecken_weekly_feed_status"\)/);
  assert.match(functionSource, /\.rpc\("kd_entdecken_weekly_refresh_claim"/);
  assert.match(functionSource, /PROVIDER_DIAGNOSTIC_ENV/);
  assert.match(functionSource, /takeProviderRawResponse/);
  assert.match(functionSource, /ownerRefreshConfirmed/);
  assert.doesNotMatch(functionSource, /profile|seen|gesehen|watchlist|selectedServices|radar/i);
  assert.match(functionSource, /p_fence_token: claimContext\?\.fenceToken/);
  assert.match(functionSource, /p_account: ownerRefreshAccountId/);
  assert.match(functionSource, /\.from\("kd_ai_log"\)/);
  assert.match(functionSource, /\.rpc\("kd_entdecken_weekly_feed_readback"/);
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

await check("Additive Refresh-Lease trennt read-only GET von drei begrenzten Wochenversuchen", () => {
  const code = refreshLeaseMigration.replace(/^--.*$/gm, "");
  assert.match(refreshLeaseMigration, /add column attempt_iso_week text/i);
  assert.match(refreshLeaseMigration, /add column attempt_count integer not null default 0/i);
  assert.match(refreshLeaseMigration, /attempt_count between 1 and 3/i);
  assert.match(refreshLeaseMigration, /create function public\.kd_entdecken_weekly_feed_status\(\)[\s\S]*?stable/i);
  assert.match(refreshLeaseMigration, /create function public\.kd_entdecken_weekly_refresh_claim\([\s\S]*?p_source text/i);
  assert.match(refreshLeaseMigration, /p_source not in \('scheduled','owner'\)/i);
  assert.match(refreshLeaseMigration, /from public\.kd_entdecken_daily_feed[\s\S]*for update/i);
  assert.match(refreshLeaseMigration, /v_feed\.refreshed_iso_week = v_iso_week[\s\S]*'already_fresh'/i);
  assert.match(refreshLeaseMigration, /v_attempt_count >= 3[\s\S]*'exhausted'/i);
  assert.match(refreshLeaseMigration, /last_failure_at <= v_now - interval '15 minutes'/i);
  assert.match(refreshLeaseMigration, /lease_expires_at <= v_now/i);
  assert.match(refreshLeaseMigration, /attempt_count = case when attempt_iso_week = v_iso_week[\s\S]*attempt_count \+ 1 else 1 end/i);
  assert.match(refreshLeaseMigration, /create or replace function public\.kd_entdecken_daily_claim\(\)[\s\S]*kd_entdecken_weekly_feed_status\(\)/i);
  assert.match(refreshLeaseMigration, /ready_provider_operation_id = v_operation_id/i);
  assert.match(refreshLeaseMigration, /ready_fence_token = p_fence_token/i);
  assert.doesNotMatch(code, /set\s+payload\s*=\s*null|\bloop\b|\bwhile\b|setInterval|setTimeout/i);
});

await check("Temporaerer Owner-Override bleibt fail-closed und aendert weder Scheduler noch Erfolgssperre", () => {
  const code = ownerRefreshOverrideMigration.replace(/^--.*$/gm, "");
  assert.match(ownerRefreshOverrideMigration, /add column staging_owner_refresh_override boolean not null default false/i);
  assert.match(ownerRefreshOverrideMigration, /attempt_count between 1 and 100/i);
  assert.match(ownerRefreshOverrideMigration, /create or replace function public\.kd_entdecken_weekly_refresh_claim/i);
  assert.match(ownerRefreshOverrideMigration, /when p_source = 'owner' and coalesce\(v_owner_refresh_override,false\) then 100[\s\S]*else 3/i);
  assert.match(ownerRefreshOverrideMigration, /v_feed\.refreshed_iso_week = v_iso_week[\s\S]*v_claim_status := 'already_fresh'[\s\S]*v_attempt_count >= v_max_attempts/i);
  assert.match(ownerRefreshOverrideMigration, /last_failure_at <= v_now - interval '15 minutes'/i);
  assert.match(ownerRefreshOverrideMigration, /p_source = 'owner' and coalesce\(v_owner_refresh_override,false\)[\s\S]*or v_feed\.last_failure_at <= v_now - interval '15 minutes'/i);
  assert.match(ownerRefreshOverrideMigration, /lease_expires_at = v_now \+ interval '180 seconds'/i);
  assert.match(ownerRefreshOverrideMigration, /fence_token = fence_token \+ 1/i);
  assert.match(ownerRefreshOverrideMigration, /'maxAttempts',v_max_attempts/i);
  assert.match(ownerRefreshOverrideMigration, /grant execute on function public\.kd_entdecken_weekly_refresh_claim\(text\)[\s\S]*to service_role/i);
  assert.doesNotMatch(code, /update\s+public\.kd_entdecken_daily_settings[\s\S]*staging_owner_refresh_override\s*=\s*true/i);
  assert.doesNotMatch(code, /kd_ai_limits|kosten_usd_cent|task_cap|global_request_cap/i);
  assert.doesNotMatch(code, /set\s+payload\s*=\s*null|\bloop\b|\bwhile\b|setInterval|setTimeout/i);
  assert.match(refreshLeaseMigration, /create function public\.kd_entdecken_weekly_feed_status\(\)[\s\S]*'maxAttempts',3/i);
  assert.match(aiLiveHandoff, /OFFENER PUNKT: temporaeren Staging-Override wieder schliessen/i);
  assert.match(aiLiveHandoff, /staging_owner_refresh_override=false`[\s\S]*als `false`[\s\S]*zurueckgelesen/i);
  assert.match(aiLiveHandoff, /Default-Branch oder einem[\s\S]*Produktionsfenster darf das Flag niemals `true` sein/i);
});

await check("Live-Beleg bindet Ownerkosten, fertigen Log und unabhaengigen 5-bis-7-Readback", () => {
  const liveProofCode = liveProofMigration.replace(/^--.*$/gm, "");
  assert.match(liveProofMigration, /kd_entdecken_daily_auftrag_starten\([\s\S]*p_account uuid/i);
  assert.match(liveProofMigration, /account_id = p_account and role = 'owner'[\s\S]*active and personal_ai/i);
  assert.match(liveProofMigration, /return public\.kd_ai_auftrag_starten\([\s\S]*p_account/i);
  assert.match(liveProofMigration, /v_count < 5 or v_count > 7/i);
  assert.match(liveProofMigration, /vorgang_id = v_operation_id[\s\S]*status = 'fertig'/i);
  assert.match(liveProofMigration, /create function public\.kd_entdecken_weekly_feed_readback/i);
  assert.match(liveProofMigration, /l\.id = p_provider_log_id/i);
  assert.match(liveProofMigration, /'sourceCount',v_source_count/i);
  assert.match(liveProofMigration, /grant execute on function public\.kd_entdecken_weekly_feed_readback\(bigint,bigint\)[\s\S]*to service_role/i);
  assert.doesNotMatch(liveProofCode, /providerDiagnostic|rawResponse|profile|seen|gesehen|selectedServices/i);
});

await check("App ruft den globalen Feed ohne Owner-Gate auf und behaelt lokale Daten lokal", () => {
  assert.match(appSource, /useWebDiscoveryFeed\(bootDone && tab === "blog"\)/);
  assert.doesNotMatch(appSource, /webDiscoveryOwnerFreigegeben/);
  assert.match(controllerSource, /!active \|\| laufRef\.current/);
  assert.match(controllerSource, /feed: result\.feed \|\| current\.feed/);
  assert.match(appSource, /webDiscoveryFeed=\{webDiscoveryState\.feed\}/);
  assert.match(appSource, /webDiscoveryStatus=\{webDiscoveryState\}/);
  assert.doesNotMatch(clientSource, /getAccessToken|hatBestaetigteOwnerRolle|Authorization|profile|seen|selectedServices|radar/);
});

console.log(`\n${checks}/${checks} Entdecken-Wochenserver-Checks bestanden.`);
