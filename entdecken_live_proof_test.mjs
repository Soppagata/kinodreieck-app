/* Entdecken/Fuer mich: fokussierter senkrechter Produktionspfad mit Mocks.
   Kein Netz, kein Provider, keine Datenbank, keine Flags und keine Secrets. */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createEntdeckenWeeklyQueryContext,
} from "./supabase/functions/entdecken-daily-task/contract.js";
import {
  createAnthropicEntdeckenDailyAdapter,
} from "./supabase/functions/entdecken-daily-task/anthropicAdapter.js";
import { runEntdeckenDailyRefresh } from "./supabase/functions/entdecken-daily-task/runner.js";
import { createEntdeckenDailyResponse } from "./supabase/functions/entdecken-daily-task/responseContract.js";
import { createEntdeckenDailyFeedService } from "./src/services/entdeckenDailyFeed.js";
import {
  createCatalogSearchActions,
  createEntdeckenRecommendations,
} from "./src/lib/entdeckenUi.js";
import {
  EntdeckenLiveProofError,
  pruefeEntdeckenLiveAntwort,
} from "./tools/entdecken_live_proof.mjs";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const sources = Object.freeze([{
  sourceId: "editorial:filmat",
  domain: "film.at",
  publisherFamily: "film.at",
  sourceClass: "editorial",
  rightsStatus: "approved",
  attributionApproved: true,
  subdomainsAllowed: true,
  active: true,
  termsUrl: "https://www.film.at/kontakt-impressum-redaktion-filmat/401835922",
  termsCheckedOn: "2026-08-20",
}, {
  sourceId: "editorial:orf",
  domain: "orf.at",
  publisherFamily: "ORF",
  sourceClass: "editorial",
  rightsStatus: "approved",
  attributionApproved: true,
  subdomainsAllowed: true,
  active: true,
  termsUrl: "https://orf.at/stories/impressum/",
  termsCheckedOn: "2026-08-20",
}]);
const queryContext = createEntdeckenWeeklyQueryContext("2026-08-20", "2026-W34");
const providerItems = Object.freeze(Array.from({ length: 7 }, (_, index) => Object.freeze({
  title: `Aktueller AT-Tipp ${index + 1}`,
  mediaType: index === 1 ? "series" : "film",
  releaseYear: 2026,
  externalIds: { watchmode: String(7101 + index) },
  attributes: {
    genres: [index < 5 ? "Drama" : index === 5 ? "Komödie" : "Thriller"],
    tones: [index < 5 ? "ruhig" : "lebhaft"],
    themes: [index < 5 ? "Neuanfang" : "Abenteuer"],
  },
  evidence: {
    url: index % 2
      ? `https://tv.orf.at/stories/wochentipp-${index + 1}`
      : `https://www.film.at/streaming/wochentipp-${index + 1}`,
    publishedOn: "2026-08-18",
    positiveRecommendation: true,
  },
})));
const consumedText = JSON.stringify({ items: providerItems });
const providerBody = Object.freeze({
  model: "claude-haiku-4-5",
  stop_reason: "end_turn",
  usage: {
    input_tokens: 220,
    output_tokens: 520,
    server_tool_use: { web_search_requests: 1 },
  },
  content: Object.freeze([
    Object.freeze({
      type: "server_tool_use", id: "tool-1", name: "web_search",
      input: { query: queryContext.query },
    }),
    Object.freeze({
      type: "web_search_tool_result", tool_use_id: "tool-1",
      content: Object.freeze(providerItems.map((item) => Object.freeze({
        type: "web_search_result", url: item.evidence.url, title: "Wochentipp",
      }))),
    }),
    Object.freeze({
      type: "text",
      text: consumedText,
      citations: Object.freeze(providerItems.map((item) => Object.freeze({
        type: "web_search_result_location", url: item.evidence.url, title: "Wochentipp",
      }))),
    }),
  ]),
});
const rawProviderBody = JSON.stringify(providerBody);
const setup = Object.freeze({
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

function persistedReadback(feed, receipt, fenceToken) {
  const evidenceCount = feed.items.reduce((sum, item) => sum + item.evidence.length, 0);
  return {
    ok: true,
    status: "verified",
    feed,
    fenceToken,
    providerLog: {
      logId: receipt.server.logId,
      operationId: "00000000-0000-4000-8000-000000000901",
      task: "entdecken-daily",
      status: "fertig",
      model: receipt.model,
      inputTokens: receipt.usage.inputTokens,
      outputTokens: receipt.usage.outputTokens,
      costUsdCent: receipt.server.costUsdCent,
    },
    provenance: { evidenceCount, sourceCount: 2, approvedSourceCount: 2 },
  };
}

let normalResponse = null;
let storedFeed = null;

await check("Normale Functionhuelle bindet konsumierten Text, fertigen Log, Kosten, Save und Readback", async () => {
  let operationId = null;
  let settlement = null;
  let providerCalls = 0;
  let saves = 0;
  let readbacks = 0;
  let requestBody = null;
  const adapter = createAnthropicEntdeckenDailyAdapter({
    apiKey: "synthetic-key",
    loadSetup: async () => setup,
    reserveCost: async (input) => {
      operationId = input.operationId;
      return { ok: true, logId: 901 };
    },
    settleCost: async (input) => { settlement = input; },
    readSettledCost: async ({ logId, operationId: readOperationId }) => ({
      logId,
      operationId: readOperationId,
      task: "entdecken-daily",
      status: "fertig",
      model: settlement.model,
      inputTokens: settlement.inputTokens,
      outputTokens: settlement.outputTokens,
      costUsdCent: settlement.costUsdCent,
    }),
    fetchImpl: async (_url, options) => {
      providerCalls += 1;
      requestBody = JSON.parse(options.body);
      return { ok: true, async text() { return rawProviderBody; } };
    },
    now: () => "2026-08-20T09:00:00.000Z",
    operationId: () => "00000000-0000-4000-8000-000000000901",
  });
  const run = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true,
          providerEnabled: true,
          today: "2026-08-20",
          isoWeek: "2026-W34",
          refresh: true,
          fenceToken: 901,
          feed: null,
        };
      },
      async loadSources() { return sources; },
      async saveFeed(feed, { fenceToken, providerReceipt }) {
        assert.equal(fenceToken, 901);
        assert.equal(providerReceipt.server.logId, 901);
        storedFeed = feed;
        saves += 1;
      },
      async readFeed({ fenceToken, providerReceipt }) {
        readbacks += 1;
        return persistedReadback(storedFeed, providerReceipt, fenceToken);
      },
      async markFailure() { throw new Error("unexpected-failure"); },
    },
    adapter,
  });
  normalResponse = createEntdeckenDailyResponse(run, adapter.telemetry());
  const receipt = normalResponse.providerReceipt;
  assert.equal(providerCalls, 1);
  assert.equal(saves, 1);
  assert.equal(readbacks, 1);
  assert.equal(operationId, "00000000-0000-4000-8000-000000000901");
  assert.equal(settlement.status, "fertig");
  assert.deepEqual(normalResponse.feed, storedFeed);
  assert.notEqual(normalResponse.feed, storedFeed);
  assert.equal(normalResponse.feedReadback.itemCount, 7);
  assert.equal(receipt.responseSha256, createHash("sha256").update(consumedText).digest("hex"));
  assert.notEqual(receipt.responseSha256, createHash("sha256").update(rawProviderBody).digest("hex"));
  assert.equal(requestBody.messages[0].content.includes("account"), false);
  assert.doesNotMatch(JSON.stringify(requestBody), /profile|seen|gesehen|mediathek|selectedServices|watchlist/i);
});

await check("Abweichender Serverlog erzeugt keinen Receipt und keinen Provider-Retry", async () => {
  let providerCalls = 0;
  let settlements = 0;
  let settledReadbacks = 0;
  const adapter = createAnthropicEntdeckenDailyAdapter({
    apiKey: "synthetic-key",
    loadSetup: async () => setup,
    reserveCost: async () => ({ ok: true, logId: 902 }),
    settleCost: async () => { settlements += 1; },
    readSettledCost: async ({ operationId }) => {
      settledReadbacks += 1;
      return {
        logId: 903,
        operationId,
        task: "entdecken-daily",
        status: "fertig",
        model: "claude-haiku-4-5",
        inputTokens: 220,
        outputTokens: 520,
        costUsdCent: 1.282,
      };
    },
    fetchImpl: async () => {
      providerCalls += 1;
      return { ok: true, async text() { return rawProviderBody; } };
    },
    now: () => "2026-08-20T09:00:00.000Z",
    operationId: () => "00000000-0000-4000-8000-000000000902",
  });
  await assert.rejects(() => adapter.search(queryContext), /provider-receipt-invalid/);
  assert.equal(providerCalls, 1);
  assert.equal(settlements, 1);
  assert.equal(settledReadbacks, 1);
  assert.equal(adapter.telemetry().providerRequests, 1);
});

await check("Zentraler Harnesshook beweist 5-bis-7, Provenienz und Korrelation ohne Inhaltsausgabe", () => {
  const proof = pruefeEntdeckenLiveAntwort(normalResponse, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
  });
  assert.deepEqual(proof, {
    ok: true,
    result: "PROVEN",
    status: "fresh",
    itemCount: 7,
    evidenceCount: 7,
    sourceCount: 2,
    approvedSourceCount: 2,
    providerRequests: 1,
    searchRequests: 1,
    responseMode: "structured",
    receiptState: "correlated",
    costState: "known",
  });
  assert.doesNotMatch(JSON.stringify(proof), /https?:|Aktueller AT-Tipp|account|providerLogId/i);
});

await check("Acht-Pfade-Smoke verwendet den korrelierten Entdecken-Livebeleg", () => {
  const smoke = readFileSync(new URL("./tools/ai_smoke.mjs", import.meta.url), "utf8");
  assert.match(smoke, /pruefeEntdeckenLiveAntwort\(p24\.daten/);
  assert.match(smoke, /measuredCostUsdCent:\s*p24\.kostenMessung\?\.requestKostenUsdCent/);
  assert.doesNotMatch(smoke, /entdeckenFeedGueltig\s*=\s*validateEntdeckenDailyFeed/);
});

await check("Manipulierter Readback oder nicht korrelierte Kosten fallen geschlossen aus", () => {
  assert.throws(() => pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    feedReadback: { ...normalResponse.feedReadback, itemCount: 6 },
  }, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "FEED_READBACK");
  assert.throws(() => pruefeEntdeckenLiveAntwort(normalResponse, {
    measuredCostUsdCent: 0,
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "RECEIPT_UNCORRELATED");
  assert.throws(() => pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    providerDiagnostic: { raw: "nicht-zulaessig" },
  }, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "FUNCTION_ENVELOPE");
});

await check("Browser akzeptiert dieselbe normale Beleg-Huelle und behaelt Belege ausserhalb des UI-State", async () => {
  const service = createEntdeckenDailyFeedService({
    config: {
      entdeckenDailyFeedEnabled: true,
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "public-key",
    },
    currentDay: () => "2026-08-20",
    fetchImpl: async () => ({ ok: true, async json() { return normalResponse; } }),
  });
  const result = await service.load();
  assert.equal(result.status, "fresh");
  assert.equal(result.feed.items.length, 7);
  assert.equal("providerReceipt" in result, false);
  assert.equal("feedReadback" in result, false);
});

await check("Lokaler Katalog-, Streaming-, Mediathek- und Profilabgleich teilt deterministisch 5 plus 2", () => {
  const catalog = providerItems.map((item, index) => ({
    watchmode_id: 7101 + index,
    titel: item.title,
    jahr: item.releaseYear,
    typ: item.mediaType === "series" ? "tv_series" : "movie",
    dienste: ["ORF ON"],
    genres: item.attributes.genres,
    tags: item.attributes.themes,
  }));
  const selection = createEntdeckenRecommendations({
    streamingEntdecken: {
      region: "AT",
      stand: "2026-08-20T00:00:00.000Z",
      titel: catalog.slice(0, 4),
    },
    streamingKnown: { region: "AT", titel: catalog.slice(4) },
    profile: {
      signals: [{
        kind: "genre", value: "Drama", direction: "positive",
        confirmed: true, strength: 4,
      }],
    },
    master: [{
      watchmode_id: 7999,
      titel: "Frueher positiv bewerteter Film",
      genre: ["Drama"],
      bewertung: { wie: 4, was: 4, warum: 4 },
    }],
    useLibrary: true,
    selectedServices: ["ORF ON"],
    entdeckenStatus: {},
    webDiscoveryFeed: storedFeed,
    selectionDay: "2026-08-20",
  });
  assert.deepEqual(selection.personal.map((entry) => entry.sourceRank), [1, 2, 3, 4, 5]);
  assert.equal(selection.personal.length, 5);
  assert.equal(selection.further.length, 2);
  assert.ok(selection.personal.every((entry) => entry.services.includes("ORF ON")
    && entry.reasons.some((reason) => /^Profil:/.test(reason))
    && entry.reasons.some((reason) => /Mediathek/.test(reason))));
  assert.ok(selection.further.every((entry) => entry.externalEvidence.length > 0));

  const seenTitle = selection.personal[0].title;
  const withoutSeen = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: catalog },
    profile: {
      signals: [{ kind: "genre", value: "Drama", direction: "positive", confirmed: true, strength: 4 }],
    },
    master: [],
    selectedServices: ["ORF ON"],
    entdeckenStatus: { 7101: "gesehen" },
    webDiscoveryFeed: storedFeed,
    selectionDay: "2026-08-20",
  });
  assert.equal([...withoutSeen.personal, ...withoutSeen.further]
    .some((entry) => entry.title === seenTitle), false);
});

await check("Bestehende Radar- und Beobachten-Actions bleiben die einzige Verdrahtung", () => {
  const actions = createCatalogSearchActions({
    watchmodeId: 7102,
    title: providerItems[1].title,
    type: "tv_series",
  });
  assert.equal(actions.radar.intent, "radar");
  assert.equal(actions.watch.intent, "watch");
  assert.equal(actions.radar.setsObserved, false);
  assert.equal(actions.watch.setsRadar, false);
});

await check("Fehlerhafter Folge-Refresh behaelt den letzten guten Feed ohne Save oder Retry", async () => {
  let providerCalls = 0;
  let saves = 0;
  const result = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true,
          providerEnabled: true,
          today: "2026-08-20",
          isoWeek: "2026-W34",
          refresh: true,
          fenceToken: 902,
          feed: storedFeed,
        };
      },
      async loadSources() { return sources; },
      async saveFeed() { saves += 1; },
      async markFailure() {},
    },
    adapter: {
      async search() { providerCalls += 1; throw new Error("synthetic-provider-error"); },
    },
  });
  assert.equal(providerCalls, 1);
  assert.equal(saves, 0);
  assert.deepEqual(result.feed, storedFeed);
  assert.notEqual(result.feed, storedFeed);
  assert.equal(result.status, "fresh");
  assert.equal(result.responseMode, "degraded");
});

console.log(`\n${checks}/${checks} Entdecken-Livepfad-Checks bestanden.`);
