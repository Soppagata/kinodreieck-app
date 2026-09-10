import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createFlixPatrolUsageHandler,
  FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE,
  FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE,
  normalizeFlixPatrolUsage,
  parseFlixPatrolServiceKeys,
} from "./supabase/functions/flixpatrol-usage/core.js";
import {
  FLIXPATROL_AT_SOURCES,
  describeFlixPatrolResponseShape,
} from "./supabase/functions/_shared/flixpatrolData.js";

const modern = "sb_secret_test-only";
const legacy = "legacy.service.role.test-only";
const usage = {
  sinceSetup: { attemptedRequests: 4, completedRequests: 4, successfulRequests: 3, failedRequests: 1 },
  currentUtcMonth: { month: "2026-09", attemptedRequests: 2 },
  lastStatus: "succeeded", lastAttemptAt: "2026-09-09T15:30:00Z",
  lastSuccessAt: "2026-09-09T15:30:01Z", planLimit: 1000,
  quota: { used: 21, available: 979, limit: 1000, limitExtra: 0, resetAt: "2026-10-01T00:00:00Z", requestStartedAt: "2026-09-09T15:30:00Z", observedAt: "2026-09-09T15:30:01Z" },
};
const headers = (key = modern) => ({ apikey: key, authorization: `Bearer ${key}` });
let checks = 0;
async function check(name, fn) { await fn(); checks += 1; console.log(`✓ ${name}`); }

await check("liest moderne und Legacy-Admin-Keys", () => {
  assert.deepEqual(parseFlixPatrolServiceKeys(JSON.stringify({ default: modern, rotated: "sb_secret_next" }), legacy), [modern, "sb_secret_next", legacy]);
  assert.deepEqual(parseFlixPatrolServiceKeys("kaputt", legacy), [legacy]);
});

await check("Runtime bindet den manuellen Weg fest an Prime AT Movies vom vorigen UTC-Tag", () => {
  const entry = readFileSync("supabase/functions/flixpatrol-usage/index.ts", "utf8");
  assert.equal(FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE, "manual-top10-contract-v1");
  assert.equal(FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE, "manual-title-contract-v1");
  assert.equal((entry.match(/client\.fetchTop10\(/g) || []).length, 1);
  assert.equal((entry.match(/client\.fetchTitle\(/g) || []).length, 1);
  assert.equal((entry.match(/client\.fetchQuota\(/g) || []).length, 1);
  assert.match(entry, /companyId: FLIXPATROL_AT_SOURCES\.companies\.prime\.id/);
  assert.match(entry, /countryId: FLIXPATROL_AT_SOURCES\.country\.id/);
  assert.match(entry, /chartType: "movies"/);
  assert.match(entry, /new Date\(Date\.now\(\) - 86_400_000\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(entry, /client\.fetchTitle\(\{\s*sourceId: "ttl_kVkeFHRGi3CIYLPg7FTEJ9XK",\s*mediaType: "film",\s*\}\)/);
  assert.doesNotMatch(entry, /request\.(?:url|json|body|headers).*fetchTop10/s);
  assert.doesNotMatch(entry, /request\.(?:url|json|body|headers).*fetchTitle/s);
});

await check("GET liest ausschließlich den gespeicherten Stand", async () => {
  let refreshes = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern], readUsage: async () => usage,
    refreshUsage: async () => { refreshes += 1; },
    diagnoseTop10: async () => assert.fail("GET darf keine Diagnose starten"),
    diagnoseTitle: async () => assert.fail("GET darf keine Titeldiagnose starten"),
  });
  const response = await handler(new Request("https://example.test/flixpatrol-usage", { headers: headers() }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: "read", providerRequests: 0, usage });
  assert.equal(refreshes, 0);
});

await check("POST mit exaktem Serververtrag startet genau einen Quota-Refresh", async () => {
  let refreshes = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern, legacy], readUsage: async () => assert.fail(),
    refreshUsage: async () => { refreshes += 1; return { usage, providerRequests: 1 }; },
    diagnoseTop10: async () => assert.fail("Ticker darf keine Diagnose starten"),
    diagnoseTitle: async () => assert.fail("Ticker darf keine Titeldiagnose starten"),
  });
  const response = await handler(new Request("https://example.test/flixpatrol-usage", {
    method: "POST", headers: { ...headers(legacy), "content-length": "0", "x-kd-flixpatrol-usage": "scheduled-daily-v1" },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: "refreshed", providerRequests: 1, usage });
  assert.equal(refreshes, 1);
});

await check("manueller Diagnoseheader startet genau einen festen Top10-Vertragsabruf", async () => {
  let quotaCalls = 0;
  let top10Calls = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern],
    readUsage: async () => assert.fail("Diagnose darf keinen GET-Lesepfad starten"),
    refreshUsage: async () => { quotaCalls += 1; },
    diagnoseTop10: async () => {
      top10Calls += 1;
      return { items: [{ internal: "discard" }, {}, {}, {}, {}], providerRequests: 1 };
    },
    diagnoseTitle: async () => assert.fail("Top10-Diagnose darf keinen Titel laden"),
  });
  const response = await handler(new Request("https://example.test/flixpatrol-usage", {
    method: "POST",
    headers: {
      ...headers(), "content-length": "0",
      "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE,
    },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true, status: "valid-contract", providerRequests: 1, itemCount: 5,
  });
  assert.equal(top10Calls, 1);
  assert.equal(quotaCalls, 0);
});

await check("manueller Titelheader startet genau einen festen Titel-Vertragsabruf", async () => {
  let quotaCalls = 0;
  let top10Calls = 0;
  let titleCalls = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern],
    refreshUsage: async () => { quotaCalls += 1; },
    diagnoseTop10: async () => { top10Calls += 1; },
    diagnoseTitle: async () => {
      titleCalls += 1;
      return { title: { internal: "discard" }, providerRequests: 1 };
    },
  });
  const response = await handler(new Request("https://example.test/flixpatrol-usage", {
    method: "POST",
    headers: {
      ...headers(), "content-length": "0",
      "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE,
    },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true, status: "valid-contract", providerRequests: 1,
  });
  assert.equal(titleCalls, 1);
  assert.equal(top10Calls, 0);
  assert.equal(quotaCalls, 0);
});

await check("Browser, Body, falscher Header und ungleiche Keys bleiben wirkungslos", async () => {
  let effects = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern], readUsage: async () => { effects += 1; return usage; },
    refreshUsage: async () => { effects += 1; return { usage, providerRequests: 1 }; },
    diagnoseTop10: async () => { effects += 1; return { items: [{}], providerRequests: 1 }; },
    diagnoseTitle: async () => { effects += 1; return { title: {}, providerRequests: 1 }; },
  });
  const cases = [
    new Request("https://example.test", { headers: { ...headers(), origin: "https://kinodreieck.at" } }),
    new Request("https://example.test", { method: "POST", headers: { ...headers(), "x-kd-flixpatrol-usage": "scheduled-daily-v1" }, body: "{}" }),
    new Request("https://example.test", { method: "POST", headers: headers() }),
    new Request("https://example.test", { headers: { apikey: modern, authorization: "Bearer anderer-key" } }),
    new Request("https://example.test", { method: "POST", headers: {
      ...headers(), origin: "https://kinodreieck.at", "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE,
    } }),
    new Request("https://example.test", { method: "POST", headers: {
      ...headers(), "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE,
    }, body: "{}" }),
    new Request("https://example.test", { headers: {
      ...headers(), "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE,
    } }),
    new Request("https://example.test", { method: "PUT", headers: {
      ...headers(), "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE,
    } }),
    new Request("https://example.test", { method: "POST", headers: {
      apikey: modern, authorization: "Bearer anderer-key",
      "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE,
    } }),
    new Request("https://example.test", { method: "POST", headers: {
      ...headers(), origin: "https://kinodreieck.at",
      "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE,
    } }),
    new Request("https://example.test", { method: "POST", headers: {
      ...headers(), "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE,
    }, body: "{}" }),
    new Request("https://example.test", { headers: {
      ...headers(), "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE,
    } }),
    new Request("https://example.test", { method: "PUT", headers: {
      ...headers(), "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE,
    } }),
    new Request("https://example.test", { method: "POST", headers: {
      apikey: modern, authorization: "Bearer anderer-key",
      "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE,
    } }),
  ];
  for (const request of cases) assert.notEqual((await handler(request)).status, 200);
  assert.equal(effects, 0);
});

await check("leerer Proxy-Stream wird akzeptiert, Inhaltsbytes und defekte Streams werden abgewiesen", async () => {
  let refreshes = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern],
    refreshUsage: async () => { refreshes += 1; return { usage, providerRequests: 1 }; },
  });
  const request = (body) => new Request("https://example.test", {
    method: "POST", duplex: "half", body,
    headers: { ...headers(), "content-length": "0", "x-kd-flixpatrol-usage": "scheduled-daily-v1" },
  });
  const empty = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array()); controller.close(); } });
  assert.equal((await handler(request(empty))).status, 200);
  assert.equal(refreshes, 1);
  assert.equal((await handler(request("{}"))).status, 400);
  const broken = new ReadableStream({ start(controller) { controller.error(new Error("broken")); } });
  assert.equal((await handler(request(broken))).status, 400);
  assert.equal(refreshes, 1);
});

await check("Diagnosefehler meldet nur wahre Klasse und geprüfte Struktur", async () => {
  const secretValues = ["SECRET_TITLE", "SECRET_DESCRIPTION", "ttl_secret", "Bearer secret", "n/a"];
  const expected = {
    companyId: FLIXPATROL_AT_SOURCES.companies.prime.id,
    countryId: FLIXPATROL_AT_SOURCES.country.id,
    chartType: "movies",
    date: "2026-09-09",
  };
  const relation = (type, id) => ({ type, data: { id } });
  const row = (id, ranking, overrides = {}) => ({ type: "top10s", data: {
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
  const diagnostic = describeFlixPatrolResponseShape({
    type: "top10s",
    Authorization: secretValues[3],
    data: [
      row("ttl_bHyGTvopBHPVtIKhR2CF68WD", 1),
      row("ttl_K5H0Bes9dtvkV710raDBpXoK", 2, {
        date: { type: 1, from: expected.date, to: expected.date },
        rankingLast: 0,
        valueLast: 4,
        daysTotal: secretValues[4],
        title: secretValues[0],
        description: secretValues[1],
      }),
    ],
  }, { contractGroup: "top10-list", failureClass: "contract-mismatch", expected });
  assert.equal(diagnostic.listProblemClass, "row-invalid");
  assert.equal(diagnostic.samplePosition, 2);
  let calls = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern],
    refreshUsage: async () => assert.fail("Diagnose darf keine Quota lesen"),
    diagnoseTop10: async () => {
      calls += 1;
      throw Object.assign(new Error("SECRET_ERROR_DETAIL"), {
        code: "FLIXPATROL_INVALID_RESPONSE", providerRequests: 1, diagnostic,
      });
    },
  });
  const request = () => new Request("https://example.test/flixpatrol-usage", {
    method: "POST", headers: {
      ...headers(), "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE,
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.status, "invalid-response");
  assert.equal(body.code, "FLIXPATROL_INVALID_RESPONSE");
  assert.equal(body.providerRequests, 1);
  assert.deepEqual(body.diagnostic, diagnostic);
  assert.equal(body.diagnostic.contractChecks.dateRangeMatchesExpected, true);
  assert.equal(body.diagnostic.nullableIntegerClasses.rankingLast, "integer:zero");
  assert.equal(calls, 1);
  const serialized = JSON.stringify(body);
  for (const secret of [...secretValues, "SECRET_ERROR_DETAIL"]) {
    assert.equal(serialized.includes(secret), false);
  }

  const invalidDiagnostics = [
    { ...diagnostic, providerPayload: "SECRET_PAYLOAD" },
    {
      ...diagnostic,
      contractChecks: { ...diagnostic.contractChecks, companyMatchesExpected: "SECRET_BOOLEAN" },
    },
    {
      ...diagnostic,
      nullableIntegerClasses: { ...diagnostic.nullableIntegerClasses, valueLast: "integer:negative" },
    },
  ];
  for (const invalidDiagnostic of invalidDiagnostics) {
    const rejectingHandler = createFlixPatrolUsageHandler({
      serviceKeys: [modern],
      diagnoseTop10: async () => {
        throw Object.assign(new Error("hidden"), {
          code: "FLIXPATROL_INVALID_RESPONSE", providerRequests: 1,
          diagnostic: invalidDiagnostic,
        });
      },
    });
    const rejected = await rejectingHandler(request());
    const rejectedBody = await rejected.json();
    assert.equal(rejectedBody.status, "failed");
    assert.equal("diagnostic" in rejectedBody, false);
    assert.equal(/SECRET_PAYLOAD|SECRET_BOOLEAN/.test(JSON.stringify(rejectedBody)), false);
  }
});

await check("Titeldiagnose projiziert nur feste Klassen und Boolwerte", async () => {
  const sourceId = "ttl_kVkeFHRGi3CIYLPg7FTEJ9XK";
  const secrets = ["SECRET_TITLE", "SECRET_DESCRIPTION", "https://evil.example/SECRET_URL"];
  const titleRelation = (type, id) => ({ type, data: { id } });
  const diagnostic = describeFlixPatrolResponseShape({ type: "titles", data: {
    id: sourceId,
    title: secrets[0],
    premiere: "0000-00-00",
    country: titleRelation("countries", FLIXPATROL_AT_SOURCES.country.id),
    company: titleRelation("companies", FLIXPATROL_AT_SOURCES.companies.prime.id),
    genre: titleRelation("genres", "gnr_vkhlVlz6xabS78vHh0DCIc5e"),
    keyword: titleRelation("keywords", "kwd_NLPueMUHlNqj02pZEBFyWIhu"),
    description: secrets[1],
    updatedAt: "2026-09-10T12:16:27",
    link: secrets[2],
    type: 1,
    premiereOnline: null,
    length: 100,
    imdbId: null,
    tmdbId: 123,
  } }, {
    contractGroup: "title",
    failureClass: "contract-mismatch",
    expected: { sourceId, mediaType: "film" },
  });
  let titleCalls = 0;
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern],
    refreshUsage: async () => assert.fail("Titeldiagnose darf keine Quota lesen"),
    diagnoseTop10: async () => assert.fail("Titeldiagnose darf kein Chart laden"),
    diagnoseTitle: async () => {
      titleCalls += 1;
      throw Object.assign(new Error("SECRET_ERROR"), {
        code: "FLIXPATROL_INVALID_RESPONSE", providerRequests: 1, diagnostic,
      });
    },
  });
  const request = () => new Request("https://example.test/flixpatrol-usage", {
    method: "POST",
    headers: { ...headers(), "x-kd-flixpatrol-usage": FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE },
  });
  const response = await handler(request());
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.status, "invalid-response");
  assert.equal(body.providerRequests, 1);
  assert.deepEqual(body.diagnostic, diagnostic);
  assert.equal(body.diagnostic.titleValidity.dateClasses.premiere, "zero");
  assert.equal(body.diagnostic.titleValidity.patternChecks.sourceUrl, false);
  assert.equal(body.diagnostic.titleValidity.expectedChecks.expectedTitleIdMatches, true);
  assert.equal(titleCalls, 1);
  const serialized = JSON.stringify(body);
  for (const secret of [...secrets, sourceId, "SECRET_ERROR"]) assert.equal(serialized.includes(secret), false);

  const invalidDiagnostics = [
    { ...diagnostic, rawTitle: "SECRET_RAW_TITLE" },
    {
      ...diagnostic,
      titleValidity: {
        ...diagnostic.titleValidity,
        expectedChecks: {
          ...diagnostic.titleValidity.expectedChecks,
          expectedTitleIdMatches: "SECRET_MATCH_VALUE",
        },
      },
    },
  ];
  for (const invalidDiagnostic of invalidDiagnostics) {
    const rejectingHandler = createFlixPatrolUsageHandler({
      serviceKeys: [modern],
      diagnoseTitle: async () => {
        throw Object.assign(new Error("hidden"), {
          code: "FLIXPATROL_INVALID_RESPONSE",
          providerRequests: 1,
          diagnostic: invalidDiagnostic,
        });
      },
    });
    const rejectedBody = await (await rejectingHandler(request())).json();
    assert.equal(rejectedBody.status, "failed");
    assert.equal("diagnostic" in rejectedBody, false);
    assert.equal(/SECRET_RAW_TITLE|SECRET_MATCH_VALUE/.test(JSON.stringify(rejectedBody)), false);
  }
});

await check("Fehlerantwort nennt nur Code und konservative Requestzahl", async () => {
  const handler = createFlixPatrolUsageHandler({
    serviceKeys: [modern], readUsage: async () => usage,
    refreshUsage: async () => { throw Object.assign(new Error("provider secret detail"), { code: "FLIXPATROL_HTTP_ERROR", providerRequests: 1 }); },
  });
  const response = await handler(new Request("https://example.test", {
    method: "POST", headers: { ...headers(), "x-kd-flixpatrol-usage": "scheduled-daily-v1" },
  }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, status: "failed", code: "FLIXPATROL_HTTP_ERROR", providerRequests: 1 });
});

await check("inkonsistente Tickerwerte werden abgelehnt", () => {
  assert.equal(normalizeFlixPatrolUsage({ ...usage, sinceSetup: { ...usage.sinceSetup, completedRequests: 3 } }), null);
  assert.equal(normalizeFlixPatrolUsage({ ...usage, planLimit: 999 }), null);
  assert.equal(normalizeFlixPatrolUsage({ ...usage, quota: { ...usage.quota, used: "21" } }), null);
  assert.equal(normalizeFlixPatrolUsage({ ...usage, quota: { ...usage.quota, requestStartedAt: "2026-09-09T15:31:00Z" } }), null);
  assert.equal(normalizeFlixPatrolUsage({ ...usage, currentUtcMonth: { month: "2026-13", attemptedRequests: 2 } }), null);
});

console.log(`${checks} FlixPatrol-Function-Prüfungen bestanden.`);
