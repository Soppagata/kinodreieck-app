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
  formatiereEntdeckenLiveDiagnose,
  pruefeEntdeckenLiveAntwort,
} from "./tools/entdecken_live_proof.mjs";
import {
  EntdeckenDailyLiveProduktfehler,
  pruefeGemessenenEntdeckenAbschluss,
} from "./tools/entdecken_daily_live.mjs";

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

async function failedProviderResponse({ fetchImpl, logId }) {
  let settlement = null;
  let markedFailure = null;
  const adapter = createAnthropicEntdeckenDailyAdapter({
    apiKey: "synthetic-key",
    loadSetup: async () => setup,
    reserveCost: async () => ({ ok: true, logId }),
    settleCost: async (input) => { settlement = input; },
    readSettledCost: async () => { throw new Error("unexpected-settled-readback"); },
    fetchImpl,
    operationId: () => `00000000-0000-4000-8000-${String(logId).padStart(12, "0")}`,
  });
  const run = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, providerEnabled: true,
          today: "2026-08-20", isoWeek: "2026-W34",
          refresh: true, fenceToken: logId, feed: null,
          requestMode: "owner", claimStatus: "claimed",
          attemptCount: 5, maxAttempts: 100,
        };
      },
      async loadSources() { return sources; },
      async saveFeed() { throw new Error("unexpected-save"); },
      async markFailure(value) { markedFailure = value; },
    },
    adapter,
  });
  return {
    response: createEntdeckenDailyResponse(run, adapter.telemetry()),
    settlement,
    markedFailure,
    rawResponse: adapter.takeProviderRawResponse(),
  };
}

await check("HTTP-Providerfehler belegt nur Stufe, Status und allowgelisteten Typ", async () => {
  const rawPrivate = JSON.stringify({
    type: "error",
    error: { type: "authentication_error", message: "SECRET_PROVIDER_MESSAGE" },
    request_id: "SECRET_REQUEST_ID",
    url: "https://secret.invalid/private",
  });
  const failed = await failedProviderResponse({
    logId: 905,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async text() { return rawPrivate; },
    }),
  });
  assert.deepEqual(failed.response.providerFailure, {
    stage: "http", httpStatus: 401, providerErrorType: "authentication_error",
  });
  assert.deepEqual(failed.markedFailure, { code: "provider_error", fenceToken: 905 });
  assert.equal(failed.settlement.errorClass, "http-error");
  assert.equal(failed.settlement.inputTokens, null);
  assert.equal(failed.settlement.outputTokens, null);
  assert.equal(failed.rawResponse, null);
  const serialized = JSON.stringify({ response: failed.response, settlement: failed.settlement });
  assert.doesNotMatch(serialized, /SECRET_|secret\.invalid/i);
  assert.throws(() => pruefeEntdeckenLiveAntwort(failed.response, {
    measuredCostUsdCent: 4.0814,
    readbackResponse: null,
  }), (error) => {
    assert.ok(error instanceof EntdeckenLiveProofError);
    assert.equal(error.code, "RESULT_PROVIDER_ERROR");
    assert.deepEqual(error.diagnostic, failed.response.providerFailure);
    assert.equal(
      formatiereEntdeckenLiveDiagnose(error.diagnostic),
      "Stufe http; HTTP 401; Providertyp authentication_error",
    );
    return true;
  });
});

await check("Fetchfehler und unbekannter HTTP-Typ bleiben geschlossen und inhaltsfrei", async () => {
  const fetchFailure = await failedProviderResponse({
    logId: 906,
    fetchImpl: async () => { throw new Error("SECRET_SOCKET_DETAIL"); },
  });
  assert.deepEqual(fetchFailure.response.providerFailure, {
    stage: "fetch", httpStatus: null, providerErrorType: null,
  });
  assert.equal(fetchFailure.rawResponse, null);
  assert.doesNotMatch(JSON.stringify(fetchFailure), /SECRET_SOCKET_DETAIL/);

  const unknownHttp = await failedProviderResponse({
    logId: 907,
    fetchImpl: async () => ({
      ok: false,
      status: 529,
      async text() {
        return JSON.stringify({
          type: "error",
          error: { type: "future_private_type", message: "SECRET_FUTURE_MESSAGE" },
          request_id: "SECRET_FUTURE_REQUEST",
        });
      },
    }),
  });
  assert.deepEqual(unknownHttp.response.providerFailure, {
    stage: "http", httpStatus: 529, providerErrorType: null,
  });
  assert.equal(unknownHttp.rawResponse, null);
  assert.doesNotMatch(JSON.stringify(unknownHttp), /future_private_type|SECRET_/);

  const injected = createEntdeckenDailyResponse({
    status: "empty", feed: null, writes: 0, reason: "provider_error",
    responseMode: "degraded", displayText: null, warnings: ["provider-error"],
    refresh: {
      requested: true, mode: "owner", status: "failed",
      attemptCount: 5, maxAttempts: 100,
    },
    providerFailure: {
      stage: "http", httpStatus: 401,
      providerErrorType: "authentication_error", secret: "SECRET_INJECTED",
    },
  }, { providerRequests: 1, searchRequests: 0 });
  assert.equal("providerFailure" in injected, false);
  assert.doesNotMatch(JSON.stringify(injected), /SECRET_INJECTED/);
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
let independentResponse = null;
let storedFeed = null;
let underfilledResponse = null;

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
          requestMode: "owner",
          claimStatus: "claimed",
          attemptCount: 1,
          maxAttempts: 3,
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
  const {
    providerReceipt: _providerReceipt,
    quality: _quality,
    failureReason: _failureReason,
    ...readProjection
  } = normalResponse;
  independentResponse = Object.freeze({
    ...readProjection,
    writes: 0,
    providerRequests: 0,
    searchRequests: 0,
    refresh: Object.freeze({
      requested: false, mode: "read", status: "read_only",
      attemptCount: 1, maxAttempts: 3,
    }),
  });
  const receipt = normalResponse.providerReceipt;
  assert.equal(providerCalls, 1);
  assert.equal(saves, 1);
  assert.equal(readbacks, 1);
  assert.equal(operationId, "00000000-0000-4000-8000-000000000901");
  assert.equal(settlement.status, "fertig");
  assert.deepEqual(normalResponse.feed, storedFeed);
  assert.notEqual(normalResponse.feed, storedFeed);
  assert.equal(normalResponse.feedReadback.itemCount, 7);
  assert.deepEqual(normalResponse.quality, {
    searchResultCount: 7,
    citationUrlCount: 7,
    rawItemCount: 7,
    normalizedItemCount: 7,
    sourceItemCount: 0,
    candidateItemCount: 7,
    eligibleUniqueCount: 7,
    rejectedItemCount: 0,
    duplicateItemCount: 0,
  });
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

await check("Echter Vier-Kandidaten-Fehler bleibt providerbewiesen und diagnostisch inhaltsfrei", async () => {
  const insufficientItems = providerItems.slice(0, 4);
  const insufficientText = JSON.stringify({ items: insufficientItems });
  const insufficientBody = {
    ...providerBody,
    content: [
      providerBody.content[0],
      {
        ...providerBody.content[1],
        content: providerBody.content[1].content.slice(0, 4),
      },
      {
        ...providerBody.content[2],
        text: insufficientText,
        citations: providerBody.content[2].citations.slice(0, 4),
      },
    ],
  };
  let settlement = null;
  let failures = 0;
  let saves = 0;
  const adapter = createAnthropicEntdeckenDailyAdapter({
    apiKey: "synthetic-key",
    loadSetup: async () => setup,
    reserveCost: async () => ({ ok: true, logId: 904 }),
    settleCost: async (input) => { settlement = input; },
    readSettledCost: async ({ logId, operationId }) => ({
      logId,
      operationId,
      task: "entdecken-daily",
      status: "fertig",
      model: settlement.model,
      inputTokens: settlement.inputTokens,
      outputTokens: settlement.outputTokens,
      costUsdCent: settlement.costUsdCent,
    }),
    fetchImpl: async () => ({
      ok: true,
      async text() { return JSON.stringify(insufficientBody); },
    }),
    now: () => "2026-08-20T09:00:00.000Z",
    operationId: () => "00000000-0000-4000-8000-000000000904",
  });
  const run = await runEntdeckenDailyRefresh({
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, providerEnabled: true,
          today: "2026-08-20", isoWeek: "2026-W34",
          refresh: true, fenceToken: 904, feed: null,
          requestMode: "owner", claimStatus: "claimed",
          attemptCount: 4, maxAttempts: 100,
        };
      },
      async loadSources() { return sources; },
      async saveFeed() { saves += 1; },
      async markFailure({ code, fenceToken }) {
        assert.equal(code, "invalid_response");
        assert.equal(fenceToken, 904);
        failures += 1;
      },
    },
    adapter,
  });
  const response = createEntdeckenDailyResponse(run, adapter.telemetry());
  underfilledResponse = response;
  assert.equal(response.refresh.status, "failed");
  assert.equal(response.failureReason, "insufficient_evidence");
  assert.equal(response.writes, 0);
  assert.equal(response.providerRequests, 1);
  assert.equal(response.quality.rawItemCount, 4);
  assert.equal(response.quality.eligibleUniqueCount, 4);
  assert.equal(failures, 1);
  assert.equal(saves, 0);
  assert.doesNotMatch(JSON.stringify(response.quality), /https?:|Aktueller AT-Tipp/i);
  assert.throws(() => pruefeEntdeckenLiveAntwort(response, {
    measuredCostUsdCent: response.providerReceipt.server.costUsdCent,
    readbackResponse: null,
  }), (error) => {
    assert.ok(error instanceof EntdeckenLiveProofError);
    assert.equal(error.code, "RESULT_INSUFFICIENT_EVIDENCE");
    assert.deepEqual(error.diagnostic, {
      stage: "provider-underfilled",
      searchResults: 4,
      citations: 4,
      raw: 4,
      normalized: 4,
      candidates: 4,
      eligible: 4,
      rejected: 0,
      duplicates: 0,
    });
    const rendered = formatiereEntdeckenLiveDiagnose(error.diagnostic);
    assert.match(rendered, /provider-underfilled[\s\S]*Roh 4[\s\S]*geeignet 4/);
    assert.doesNotMatch(rendered, /https?:|Aktueller AT-Tipp|account|providerReceipt/i);
    return true;
  });
});

await check("Gemessener Unterfuellungsfehler bleibt Produktfehler statt Budget unbekannt", () => {
  assert.ok(underfilledResponse);
  assert.throws(() => pruefeGemessenenEntdeckenAbschluss({
    response: { ok: true, status: 200 },
    body: underfilledResponse,
    readbackResponse: { ok: true, status: 200 },
    readbackBody: null,
    measuredCostUsdCent: underfilledResponse.providerReceipt.server.costUsdCent,
  }), (error) => {
    assert.ok(error instanceof EntdeckenDailyLiveProduktfehler);
    assert.equal(error.code, "RESULT_INSUFFICIENT_EVIDENCE");
    assert.equal(error.terminalCode, "ENTDECKEN_UNPROVEN");
    assert.equal(error.exitCode, 1);
    assert.match(error.message, /provider-underfilled/);
    return true;
  });
});

await check("Gemessener Readback-Fehler bleibt Produktfehler ohne zweiten Providerlauf", () => {
  assert.ok(normalResponse);
  assert.throws(() => pruefeGemessenenEntdeckenAbschluss({
    response: { ok: true, status: 200 },
    body: normalResponse,
    readbackResponse: { ok: false, status: 503 },
    readbackBody: null,
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
  }), (error) => {
    assert.ok(error instanceof EntdeckenDailyLiveProduktfehler);
    assert.equal(error.code, "READBACK_HTTP");
    assert.equal(error.exitCode, 1);
    return true;
  });
});

await check("Nicht messbarer Abschluss bleibt weiterhin BUDGET_UNBEKANNT", () => {
  assert.throws(() => pruefeGemessenenEntdeckenAbschluss({
    response: { ok: true, status: 200 },
    body: normalResponse,
    readbackResponse: { ok: true, status: 200 },
    readbackBody: independentResponse,
    measuredCostUsdCent: Number.NaN,
  }), (error) => error?.name === "LiveSicherheitsStopp" && error?.exitCode === 74);
});

await check("Read-only-Fehler behaelt den bisherigen Browservertrag ohne Diagnosefeld", () => {
  const response = createEntdeckenDailyResponse({
    status: "empty", feed: null, writes: 0, reason: "storage_error",
    responseMode: "degraded", displayText: null, warnings: [],
    refresh: {
      requested: false, mode: "read", status: "unavailable",
      attemptCount: 0, maxAttempts: 3,
    },
  });
  assert.equal("failureReason" in response, false);
});

await check("Zentraler Harnesshook beweist 5-bis-7, Provenienz und Korrelation ohne Inhaltsausgabe", () => {
  const proof = pruefeEntdeckenLiveAntwort(normalResponse, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
    readbackResponse: independentResponse,
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

await check("Zentraler Harnesshook akzeptiert den expliziten Owner-Staging-Hoechstwert", () => {
  const proof = pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    refresh: {
      ...normalResponse.refresh,
      maxAttempts: 100,
    },
  }, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
    readbackResponse: independentResponse,
  });
  assert.equal(proof.result, "PROVEN");
  assert.throws(() => pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    refresh: {
      ...normalResponse.refresh,
      maxAttempts: 99,
    },
  }, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
    readbackResponse: independentResponse,
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "CLAIM_REFRESHED");
});

await check("Acht-Pfade-Smoke verwendet den korrelierten Entdecken-Livebeleg", () => {
  const smoke = readFileSync(new URL("./tools/ai_smoke.mjs", import.meta.url), "utf8");
  assert.match(smoke, /pruefeEntdeckenLiveAntwort\(p24\.daten/);
  assert.match(smoke, /measuredCostUsdCent:\s*p24\.kostenMessung\?\.requestKostenUsdCent/);
  assert.match(smoke, /readbackResponse:\s*p24Readback\.daten/);
  assert.match(smoke, /formatiereEntdeckenLiveDiagnose\(error\?\.diagnostic\)/);
  assert.match(smoke, /methode:\s*"POST"/);
  assert.doesNotMatch(smoke, /entdeckenFeedGueltig\s*=\s*validateEntdeckenDailyFeed/);
});

await check("Manipulierter Readback oder nicht korrelierte Kosten fallen geschlossen aus", () => {
  assert.throws(() => pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    failureReason: "insufficient_evidence",
    refresh: {
      requested: true, mode: "owner", status: "failed",
      attemptCount: 3, maxAttempts: 100,
    },
  }, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
    readbackResponse: independentResponse,
  }), (error) => error instanceof EntdeckenLiveProofError
    && error.code === "FUNCTION_RESULT");
  assert.throws(() => pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    writes: 0,
    failureReason: "insufficient_evidence",
    refresh: {
      requested: true, mode: "owner", status: "failed",
      attemptCount: 3, maxAttempts: 100,
    },
  }, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
    readbackResponse: independentResponse,
  }), (error) => error instanceof EntdeckenLiveProofError
    && error.code === "FUNCTION_RESULT");
  assert.throws(() => pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    feedReadback: { ...normalResponse.feedReadback, itemCount: 6 },
  }, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
    readbackResponse: independentResponse,
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "FEED_READBACK");
  assert.throws(() => pruefeEntdeckenLiveAntwort(normalResponse, {
    measuredCostUsdCent: 0,
    readbackResponse: independentResponse,
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "RECEIPT_UNCORRELATED");
  assert.throws(() => pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    providerDiagnostic: { raw: "nicht-zulaessig" },
  }, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
    readbackResponse: independentResponse,
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "FUNCTION_ENVELOPE");
  assert.throws(() => pruefeEntdeckenLiveAntwort(normalResponse, {
    measuredCostUsdCent: normalResponse.providerReceipt.server.costUsdCent,
    readbackResponse: { ...independentResponse, feed: null },
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "INDEPENDENT_READBACK");
  assert.throws(() => pruefeEntdeckenLiveAntwort({
    ...normalResponse,
    refresh: {
      requested: true, mode: "owner", status: "exhausted",
      attemptCount: 3, maxAttempts: 3,
    },
  }, {
    measuredCostUsdCent: 0,
    readbackResponse: independentResponse,
  }), (error) => error instanceof EntdeckenLiveProofError && error.code === "CLAIM_EXHAUSTED");
});

await check("Browser akzeptiert dieselbe normale Beleg-Huelle und behaelt Belege ausserhalb des UI-State", async () => {
  const session = {
    mode: "account", state: "ready",
    account: { id: "00000000-0000-4000-8000-000000000001", role: "member" },
    capabilities: { remoteStorage: true, personalAi: false },
  };
  const service = createEntdeckenDailyFeedService({
    config: {
      entdeckenDailyFeedEnabled: true,
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "public-key",
    },
    auth: { getSnapshot: () => session },
    getAccount: () => ({ id: session.account.id }),
    getAccessToken: async () => "account-token",
    currentDay: () => "2026-08-20",
    fetchImpl: async () => ({ ok: true, async json() { return independentResponse; } }),
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
  assert.equal(selection.personal.length + selection.further.length, 7);
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
