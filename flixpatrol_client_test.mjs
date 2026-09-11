import assert from "node:assert/strict";
import { createFlixPatrolClient, FlixPatrolClientError, parseFlixPatrolQuota } from "./supabase/functions/_shared/flixpatrolClient.js";
import { FLIXPATROL_AT_SOURCES } from "./supabase/functions/_shared/flixpatrolData.js";

const quotaPayload = { type: "apiquota", data: { used: 17, available: 983, limit: 1000, limitExtra: 0, resetAt: "2026-10-01T00:00:00Z" } };
let checks = 0;
async function check(name, fn) { await fn(); checks += 1; console.log(`✓ ${name}`); }

await check("normalisiert Pflichtfelder und toleriert zusätzliche Providerfelder", () => {
  assert.deepEqual(parseFlixPatrolQuota(quotaPayload), quotaPayload.data);
  assert.deepEqual(
    parseFlixPatrolQuota({ ...quotaPayload, providerMeta: "neu", data: { ...quotaPayload.data, futureField: true } }),
    quotaPayload.data,
  );
  assert.equal(parseFlixPatrolQuota({ type: "apiquota", data: { ...quotaPayload.data, used: "17" } }), null);
  assert.equal(parseFlixPatrolQuota({ type: "apiquota", data: { ...quotaPayload.data, resetAt: "morgen" } }), null);
});

await check("zählt vor genau einem festen GET und finalisiert genau einmal", async () => {
  const events = [];
  const client = createFlixPatrolClient({
    apiKey: "provider-secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
    beginOperation: async (value) => { events.push(["begin", value]); return { ok: true, claim: true, replay: false }; },
    fetchImpl: async (url, init) => { events.push(["fetch", url, init]); return { ok: true, status: 200, json: async () => quotaPayload }; },
    finishOperation: async (value) => { events.push(["finish", value]); return { ok: true, replay: false, status: "succeeded", usage: { marker: true } }; },
  });
  const result = await client.fetchQuota();
  assert.equal(result.providerRequests, 1);
  assert.deepEqual(events.map(([name]) => name), ["begin", "fetch", "finish"]);
  assert.equal(events[1][1], "https://api.flixpatrol.com/v2/quota");
  assert.equal(events[1][2].method, "GET");
  assert.equal(events[1][2].redirect, "error");
  assert.equal(events[1][2].headers.Authorization, `Basic ${btoa("provider-secret:")}`);
  assert.equal(events[2][1].status, "succeeded");
  assert.deepEqual(events[2][1].quota, quotaPayload.data);
});

await check("startet bei abgelehntem Ledger keinen Providerrequest", async () => {
  let fetches = 0;
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000002",
    beginOperation: async () => ({ ok: true, claim: false, replay: true }),
    finishOperation: async () => assert.fail("finish darf nicht laufen"),
    fetchImpl: async () => { fetches += 1; },
  });
  await assert.rejects(client.fetchQuota(), (error) => error instanceof FlixPatrolClientError && error.code === "FLIXPATROL_LEDGER_BEGIN_REJECTED" && error.providerRequests === 0);
  assert.equal(fetches, 0);
});

for (const scenario of [
  { name: "Transportfehler", fetch: async () => { throw new Error("secret transport"); }, status: "transport_error", code: "FLIXPATROL_TRANSPORT_ERROR", http: null },
  { name: "HTTP-Fehler", fetch: async () => ({ ok: false, status: 429 }), status: "http_error", code: "FLIXPATROL_HTTP_ERROR", http: 429 },
  { name: "kaputte Antwort", fetch: async () => ({ ok: true, status: 200, json: async () => ({ type: "apiquota", data: null }) }), status: "invalid_response", code: "FLIXPATROL_INVALID_RESPONSE", http: 200 },
]) {
  await check(`${scenario.name} bleibt gezählt, terminal und ohne Retry`, async () => {
    let fetches = 0;
    const finishes = [];
    const client = createFlixPatrolClient({
      apiKey: "secret",
      randomUUID: () => "00000000-0000-4000-8000-000000000003",
      beginOperation: async () => ({ ok: true, claim: true, replay: false }),
      fetchImpl: async (...args) => { fetches += 1; return scenario.fetch(...args); },
      finishOperation: async (value) => { finishes.push(value); return { ok: true, replay: false, status: scenario.status, usage: {} }; },
    });
    await assert.rejects(client.fetchQuota(), (error) => error.code === scenario.code
      && error.providerRequests === 1 && error.httpStatus === scenario.http
      && error.operationId === "00000000-0000-4000-8000-000000000003");
    assert.equal(fetches, 1);
    assert.equal(finishes.length, 1);
    assert.deepEqual(finishes[0].quota, null);
    assert.equal(finishes[0].status, scenario.status);
  });
}

await check("unbelegter Abschluss meldet den bereits gestarteten Request konservativ", async () => {
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000004",
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => quotaPayload }),
    finishOperation: async () => { throw new Error("db unavailable"); },
  });
  await assert.rejects(client.fetchQuota(), (error) => error.code === "FLIXPATROL_LEDGER_FINISH_FAILED"
    && error.providerRequests === 1
    && error.operationId === "00000000-0000-4000-8000-000000000004");
});

const titleId = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
const secondTitleId = "ttl_K5H0Bes9dtvkV710raDBpXoK";
const relation = (type, id) => ({ type, data: { id }, legacy: { id: 1 } });
const makeTitlePayload = (id = titleId, title = "Indiana Jones and the Last Crusade") => ({
  type: "titles",
  data: {
    id,
    title,
    premiere: "1989-05-24",
    country: relation("countries", "cnt_iMUHNbZvnNHK5YdhgwtOoP4u"),
    company: relation("companies", "cmp_ucpMo9k8rSnwEmcX71yBFCjT"),
    genre: relation("genres", "gnr_vkhlVlz6xabS78vHh0DCIc5e"),
    keyword: relation("keywords", "kwd_NLPueMUHlNqj02pZEBFyWIhu"),
    description: "A documented provider description.",
    updatedAt: "2026-09-08T09:25:02",
    link: "https://flixpatrol.com/title/indiana-jones-and-the-last-crusade/",
    type: 1,
    premiereOnline: "2021-04-15",
    length: 127,
    imdbId: 97576,
    tmdbId: 89,
    imdbLink: "https://www.imdb.com/title/tt0097576/",
    tmdbLink: "https://www.themoviedb.org/movie/89",
  },
});

await check("lädt einen eng gefilterten Tageschart als genau einen gezählten Request", async () => {
  const events = [];
  const expected = {
    companyId: FLIXPATROL_AT_SOURCES.companies.prime.id,
    countryId: FLIXPATROL_AT_SOURCES.country.id,
    chartType: "movies",
    date: "2026-09-09",
  };
  const response = { type: "list", data: [{
    type: "top10s",
    data: {
      id: "debug-only",
      movie: relation("titles", titleId),
      company: relation("companies", expected.companyId),
      country: relation("countries", expected.countryId),
      language: null,
      origin: null,
      type: 2,
      date: { type: 1, from: expected.date, to: expected.date },
      ranking: 1,
      rankingLast: 0,
      value: 10,
      valueLast: null,
      daysTotal: 1,
      note: null,
      key: null,
      updatedAt: "2026-09-09T10:57:43",
    },
  }] };
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000005",
    beginOperation: async (input) => { events.push(["begin", input]); return { ok: true, claim: true, replay: false }; },
    fetchImpl: async (url) => { events.push(["fetch", url]); return { ok: true, status: 200, json: async () => response }; },
    finishOperation: async (input) => { events.push(["finish", input]); return { ok: true, replay: false, status: input.status, usage: {} }; },
  });
  const result = await client.fetchTop10(expected);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sourceId, titleId);
  assert.equal(result.items[0].rankingLast, null);
  assert.equal(events[0][1].requestKind, "top10s");
  assert.deepEqual(events.map(([name]) => name), ["begin", "fetch", "finish"]);
  const url = new URL(events[1][1]);
  assert.equal(url.pathname, "/v2/top10s");
  assert.equal(url.searchParams.get("company[eq]"), expected.companyId);
  assert.equal(url.searchParams.get("country[eq]"), expected.countryId);
  assert.equal(url.searchParams.get("type[eq]"), "2");
  assert.equal(url.searchParams.get("date[type][eq]"), "1");
  assert.equal(url.searchParams.get("ranking[lte]"), "10");
  assert.equal(events[2][1].quota, null);
});

await check("verwirft leere Charts nach einem gezählten Request", async () => {
  let fetches = 0;
  const finishes = [];
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000006",
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async () => { fetches += 1; return { ok: true, status: 200, json: async () => [] }; },
    finishOperation: async (value) => { finishes.push(value); return { ok: true, replay: false, status: value.status, usage: {} }; },
  });
  await assert.rejects(
    client.fetchTop10({
      companyId: FLIXPATROL_AT_SOURCES.companies.disney.id,
      countryId: FLIXPATROL_AT_SOURCES.country.id,
      chartType: "tvshows",
      date: "2026-09-09",
    }),
    (error) => error.code === "FLIXPATROL_INVALID_RESPONSE" && error.providerRequests === 1,
  );
  assert.equal(fetches, 1);
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].status, "invalid_response");
});

await check("diagnostiziert ungültige Charts payloadfrei und finalisiert trotz Loggerfehler", async () => {
  const operationId = "00000000-0000-4000-8000-000000000011";
  const expected = {
    companyId: FLIXPATROL_AT_SOURCES.companies.prime.id,
    countryId: FLIXPATROL_AT_SOURCES.country.id,
    chartType: "movies",
    date: "2026-09-09",
  };
  const sensitive = [
    "Secret chart title", "Secret chart description", titleId,
    FLIXPATROL_AT_SOURCES.companies.prime.id, "Basic private-api-key", "n/a",
  ];
  const validRow = (id, ranking, overrides = {}) => ({ type: "top10s", data: {
    movie: relation("titles", id),
    company: relation("companies", expected.companyId),
    country: relation("countries", expected.countryId),
    type: 2,
    date: { type: "daterange", data: { type: 1, from: expected.date, to: expected.date } },
    ranking,
    rankingLast: null,
    value: 10,
    valueLast: null,
    daysTotal: 1,
    updatedAt: "2026-09-09T10:57:43",
    ...overrides,
  } });
  const malicious = {
    type: "collection",
    Authorization: sensitive[4],
    data: [
      validRow(titleId, 1),
      validRow(secondTitleId, 2, {
        date: { type: 1, from: expected.date, to: expected.date },
        rankingLast: null,
        valueLast: 4,
        daysTotal: sensitive[5],
        title: sensitive[0],
        description: sensitive[1],
      }),
    ],
  };
  const diagnostics = [];
  const finishes = [];
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => operationId,
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => malicious }),
    diagnosticLogger: (value) => diagnostics.push(value),
    finishOperation: async (value) => {
      finishes.push(value);
      return { ok: true, replay: false, status: value.status, usage: {} };
    },
  });
  await assert.rejects(
    client.fetchTop10(expected),
    (error) => error.code === "FLIXPATROL_INVALID_RESPONSE"
      && error.providerRequests === 1
      && error.operationId === operationId
      && error.diagnostic === diagnostics[0],
  );
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].status, "invalid_response");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].contractGroup, "top10-list");
  assert.equal(diagnostics[0].dataArrayLength, 2);
  assert.equal(diagnostics[0].listLengthClass, "one-to-ten");
  assert.equal(diagnostics[0].rootTypeClass, "known:collection");
  assert.equal(diagnostics[0].listProblemClass, "outer-shape");
  assert.equal(diagnostics[0].samplePosition, 2);
  assert.equal(diagnostics[0].rankingClass, "integer:one-to-ten");
  assert.deepEqual(diagnostics[0].nullableIntegerClasses, {
    rankingLast: "null", valueLast: "integer:valid", daysTotal: "invalid",
  });
  assert.equal(diagnostics[0].dateShape.formClass, "direct-date");
  assert.equal(diagnostics[0].dateShape.rangeTypeClass, "known:1");
  assert.equal(diagnostics[0].relations.movie.typeClass, "known:titles");
  assert.deepEqual(diagnostics[0].contractChecks, {
    companyMatchesExpected: true,
    countryMatchesExpected: true,
    chartTypeMatchesExpected: true,
    dateRangeMatchesExpected: true,
    titleIdValid: true,
    providerUpdatedAtValid: true,
  });
  const serialized = JSON.stringify(diagnostics[0]);
  for (const secret of sensitive) assert.equal(serialized.includes(secret), false);

  let throwingLoggerFinish = 0;
  const throwingLoggerClient = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000012",
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }),
    diagnosticLogger: () => { throw new Error("logger must not escape"); },
    finishOperation: async (value) => {
      throwingLoggerFinish += 1;
      return { ok: true, replay: false, status: value.status, usage: {} };
    },
  });
  await assert.rejects(
    throwingLoggerClient.fetchTop10({
      companyId: FLIXPATROL_AT_SOURCES.companies.prime.id,
      countryId: FLIXPATROL_AT_SOURCES.country.id,
      chartType: "movies",
      date: "2026-09-09",
    }),
    (error) => error.code === "FLIXPATROL_INVALID_RESPONSE" && error.providerRequests === 1,
  );
  assert.equal(throwingLoggerFinish, 1);
});

await check("normalisiert eine gezielte Titelauflösung samt nullable Fremd-IDs", async () => {
  const begins = [];
  const payload = makeTitlePayload();
  payload.data.length = 0;
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000007",
    beginOperation: async (value) => { begins.push(value); return { ok: true, claim: true, replay: false }; },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload }),
    finishOperation: async (value) => ({ ok: true, replay: false, status: value.status, usage: {} }),
  });
  const result = await client.fetchTitle({ sourceId: titleId, mediaType: "film" });
  assert.equal(result.title.imdbId, "tt0097576");
  assert.equal(result.title.imdbNumericId, "97576");
  assert.equal(result.title.tmdbId, "89");
  assert.equal(result.title.releaseYear, 1989);
  assert.equal(result.title.runtimeMinutes, null);
  assert.equal(begins[0].requestKind, "titles");
});

await check("verwirft eine andere Titel-ID nach genau einem gezählten Abschluss", async () => {
  const operationId = "00000000-0000-4000-8000-000000000010";
  const finishes = [];
  const diagnostics = [];
  const invalidTitle = makeTitlePayload(secondTitleId, "SECRET_PROVIDER_TITLE");
  invalidTitle.data.premiereOnline = "0000-00-00";
  invalidTitle.data.link = "https://evil.example/SECRET_PROVIDER_URL";
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => operationId,
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => invalidTitle }),
    diagnosticLogger: (value) => diagnostics.push(value),
    finishOperation: async (value) => {
      finishes.push(value);
      return { ok: true, replay: false, status: value.status, usage: {} };
    },
  });
  await assert.rejects(
    client.fetchTitle({ sourceId: titleId, mediaType: "film" }),
    (error) => error.code === "FLIXPATROL_INVALID_RESPONSE"
      && error.providerRequests === 1
      && error.operationId === operationId,
  );
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].status, "invalid_response");
  assert.equal(finishes[0].operationId, operationId);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].titleValidity.dateClasses.premiereOnline, "zero");
  assert.equal(diagnostics[0].titleValidity.patternChecks.sourceUrl, false);
  assert.deepEqual(diagnostics[0].titleValidity.expectedChecks, {
    expectedTitleIdMatches: false,
    expectedMediaTypeMatches: true,
  });
  assert.equal(/SECRET_PROVIDER_TITLE|SECRET_PROVIDER_URL/.test(JSON.stringify(diagnostics[0])), false);
});

await check("lokalisiert einen verworfenen Eintrag im exakten Titelbatch ohne Providerwerte", async () => {
  const first = makeTitlePayload();
  const second = makeTitlePayload(secondTitleId, "SECRET_BATCH_TITLE");
  second.data.link = "https://flixpatrol.com/title/secret-batch-title/";
  second.data.premiereOnline = "0000-00-00";
  const diagnostics = [];
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000013",
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ type: "list", data: [first, second] }) }),
    diagnosticLogger: (value) => diagnostics.push(value),
    finishOperation: async (value) => ({ ok: true, replay: false, status: value.status, usage: {} }),
  });
  await assert.rejects(
    client.fetchTitles({ sourceIds: [titleId, secondTitleId], mediaTypes: ["film", "film"] }),
    (error) => error.code === "FLIXPATROL_INVALID_RESPONSE" && error.providerRequests === 1,
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].contractGroup, "title-list");
  assert.equal(diagnostics[0].listProblemClass, "row-invalid");
  assert.equal(diagnostics[0].samplePosition, 2);
  assert.equal(diagnostics[0].titleValidity.dateClasses.premiereOnline, "zero");
  assert.deepEqual(diagnostics[0].titleValidity.expectedChecks, {
    expectedTitleIdMatches: true,
    expectedMediaTypeMatches: true,
  });
  assert.equal(JSON.stringify(diagnostics[0]).includes("SECRET_BATCH_TITLE"), false);
});

await check("Titelsuche nutzt exakten Titel, Jahr und Typ und blockiert Mehrdeutigkeit", async () => {
  let requestedUrl = "";
  const duplicate = makeTitlePayload(secondTitleId);
  duplicate.data.link = "https://flixpatrol.com/title/indiana-jones-and-the-last-crusade-duplicate/";
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000008",
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async (url) => { requestedUrl = url; return { ok: true, status: 200, json: async () => [makeTitlePayload(), duplicate] }; },
    finishOperation: async (value) => ({ ok: true, replay: false, status: value.status, usage: {} }),
  });
  const result = await client.searchTitles({
    title: "Indiana Jones and the Last Crusade",
    mediaType: "film",
    releaseYear: 1989,
  });
  assert.equal(result.resolution.status, "ambiguous_blocked");
  assert.equal(result.resolution.candidateCount, 2);
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("title[eq]"), "Indiana Jones and the Last Crusade");
  assert.equal(url.searchParams.get("type[eq]"), "1");
  assert.equal(url.searchParams.get("premiere[gte]"), "1989-01-01");
  assert.equal(url.searchParams.get("premiere[lte]"), "1989-12-31");
  assert.equal([...url.searchParams].length, 4);
});

await check("leere gezielte Titelsuche wird als negativer Treffer aufgelöst", async () => {
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "00000000-0000-4000-8000-000000000009",
    beginOperation: async () => ({ ok: true, claim: true, replay: false }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ type: "titles", data: [] }) }),
    finishOperation: async (value) => ({ ok: true, replay: false, status: value.status, usage: {} }),
  });
  const result = await client.searchTitles({ title: "Unknown", mediaType: "film", releaseYear: 2026 });
  assert.deepEqual(result.resolution, { status: "not_found", sourceId: null, candidateCount: 0 });
});

await check("ungültige Datenanfrage erreicht weder Ledger noch Provider", async () => {
  let begins = 0;
  let fetches = 0;
  const client = createFlixPatrolClient({
    apiKey: "secret",
    beginOperation: async () => { begins += 1; },
    finishOperation: async () => assert.fail("finish darf nicht laufen"),
    fetchImpl: async () => { fetches += 1; },
  });
  await assert.rejects(
    client.searchTitles({ title: "Dune", mediaType: "film" }),
    (error) => error.code === "FLIXPATROL_REQUEST_INVALID" && error.providerRequests === 0,
  );
  assert.equal(begins, 0);
  assert.equal(fetches, 0);
});

console.log(`${checks} FlixPatrol-Client-Prüfungen bestanden.`);
