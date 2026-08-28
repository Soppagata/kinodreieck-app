import assert from "node:assert/strict";
import {
  createEntdeckenWeeklyQueryContext,
  evaluateEntdeckenPublicResponse,
  validateEntdeckenDailyFeed,
} from "./supabase/functions/entdecken-daily-task/contract.js";
import {
  createJoynPublicChartAdapter,
  ENTDECKEN_PUBLIC_POOL_SIZE,
  extractJoynChartItems,
  JOYN_PUBLIC_CHARTS,
} from "./supabase/functions/entdecken-daily-task/publicChartAdapter.js";
import { runEntdeckenDailyRefresh } from "./supabase/functions/entdecken-daily-task/runner.js";
import { createEntdeckenRecommendations } from "./src/lib/entdeckenUi.js";

let checks = 0;
function check(name, test) {
  test(); checks += 1; console.log(`✓ ${name}`);
}
async function checkAsync(name, test) {
  await test(); checks += 1; console.log(`✓ ${name}`);
}

const specials = Object.freeze([
  "Asterix &amp; Obelix - Im Auftrag Ihrer Majestät",
  "Roland Düringer: Regenerationsabend 2.0",
  "... und dann kam Polly",
  "Joko &amp; Klaas machen Urlaub",
  "Liebesg&#39;schichten und Heiratssachen",
  "Born Famous - Fluch oder Segen?",
  "Rosins Restaurants - Ein Sternekoch räumt auf!",
]);

function chartTitles(chart, count = 50) {
  return Array.from({ length: count }, (_, index) => (
    chart.mediaType === "film" && specials[index]
      ? specials[index]
      : `${chart.mediaType === "film" ? "Film" : "Serie"} Österreich ${index + 1}`
  ));
}
function slug(index) { return `titel-${String(index + 1).padStart(2, "0")}`; }
function chartHtml(chart, count = 50) {
  const titles = chartTitles(chart, count);
  const cards = titles.map((title, index) => (
    `<li><a class="hashed" data-testid="CSP" href="${chart.itemPathPrefix}${slug(index)}">`
    + `<div class="outer"><div data-testid="VISH">${title}</div></div></a></li>`
  )).join("");
  const assets = titles.map((encodedTitle, index) => ({
    id: `${chart.mediaType === "film" ? "b" : "d"}_source${String(index + 1).padStart(3, "0")}`,
    title: encodedTitle.replaceAll("&amp;", "&").replaceAll("&#39;", "'"),
    __typename: chart.mediaType === "film" ? "Movie" : "Series",
    description: "MUSS VERWORFEN WERDEN",
    images: [{ url: "https://img.invalid/nicht-speichern.jpg" }],
    genres: index === 8 ? [] : [{ name: index % 2 ? "Drama" : "Action" }],
    licenseTypes: [index % 3 ? "AVOD" : "SVOD"],
    path: `${chart.itemPathPrefix}${slug(index)}`,
  }));
  const rsc = `9:["$",{}, {"initialData":${JSON.stringify({
    page: { blocks: [{ __typename: "Grid", headline: chart.heading, assets }] },
  })}}]`;
  return `<!doctype html><html><head>`
    + `<meta property="og:locale" content="de_AT">`
    + `<link rel="canonical" href="https://www.joyn.at${chart.canonicalPath}">`
    + `</head><body><h1>${chart.heading}</h1><ul><li>Navigation</li></ul><ul>${cards}</ul>`
    + `<script>self.__next_f.push(${JSON.stringify([1, rsc])})</script></body></html>`;
}
function htmlResponse(body, status = 200, type = "text/html; charset=utf-8") {
  return new Response(body, {
    status,
    headers: { "content-type": type, "content-length": String(new TextEncoder().encode(body).byteLength) },
  });
}
function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).reverse()
    .map(([key, nested]) => [key, reverseObjectKeys(nested)]));
}
const publicSourceRegistry = Object.freeze([Object.freeze({
  sourceId: "chart:joyn-at",
  domain: "joyn.at",
  publisherFamily: "Joyn AT / ProSiebenSat.1 PULS 4",
  sourceClass: "chart",
  rightsStatus: "owner_private",
  attributionApproved: true,
  subdomainsAllowed: true,
  active: true,
  termsUrl: "https://www.joyn.at/nutzungsbedingungen",
  termsCheckedOn: "2026-08-27",
})]);
let endToEndFeed = null;

check("Parser liest exakt die semantische Joyn-Kartenliste und behaelt Sonderzeichen", () => {
  const items = extractJoynChartItems(chartHtml(JOYN_PUBLIC_CHARTS[0]), JOYN_PUBLIC_CHARTS[0]);
  assert.equal(items.length, 50);
  assert.equal(items[0].title, "Asterix & Obelix - Im Auftrag Ihrer Majestät");
  assert.equal(items[4].title, "Liebesg'schichten und Heiratssachen");
  assert.deepEqual(items.slice(0, 2).map((item) => item.sourcePosition), [1, 2]);
  assert.deepEqual(items[0].genres, ["Action"]);
  assert.deepEqual(items[0].licenseTypes, ["SVOD"]);
  assert.equal(items[0].sourceItemId, "f_titel-01");
  assert.equal("description" in items[0], false);
  assert.equal("images" in items[0], false);
  assert.match(items[0].url, /^https:\/\/www\.joyn\.at\/filme\//);
});

check("Parser failt geschlossen bei falscher Region, Canonical oder Unterfuellung", () => {
  const chart = JOYN_PUBLIC_CHARTS[0];
  assert.equal(extractJoynChartItems(chartHtml(chart).replace("de_AT", "de_DE"), chart).length, 0);
  assert.equal(extractJoynChartItems(chartHtml(chart).replace(chart.canonicalPath, "/falsch"), chart).length, 0);
  assert.equal(extractJoynChartItems(chartHtml(chart, 49), chart).length, 0);
  assert.equal(extractJoynChartItems(chartHtml(chart).replace("<body>", "<body>CAPTCHA"), chart).length, 0);
});

await checkAsync("Adapter macht genau zwei retryfreie GETs und erzeugt 50 Minimalzeilen", async () => {
  const calls = [];
  const adapter = createJoynPublicChartAdapter({
    now: () => "2026-08-27T07:30:00.000Z",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const chart = JOYN_PUBLIC_CHARTS.find((entry) => entry.listUrl === url);
      assert.ok(chart);
      return htmlResponse(chartHtml(chart));
    },
  });
  const queryContext = createEntdeckenWeeklyQueryContext("2026-08-27", "2026-W35");
  const envelope = await adapter.search(queryContext, {
    retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35",
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.url), JOYN_PUBLIC_CHARTS.map((chart) => chart.listUrl));
  for (const call of calls) {
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.redirect, "error");
    assert.deepEqual(call.init.headers, { Accept: "text/html" });
  }
  assert.equal(envelope.items.length, ENTDECKEN_PUBLIC_POOL_SIZE);
  assert.deepEqual(Object.keys(envelope.items[0]).sort(), [
    "fetchedAt", "genres", "licenseTypes", "listDate", "mediaType",
    "sourceItemId", "sourcePosition", "sourceUrl", "title",
  ]);
  assert.match(envelope.items[0].sourceUrl, /\/filme\//);
  assert.match(envelope.items[1].sourceUrl, /\/serien\//);
  assert.deepEqual(adapter.telemetry(), {
    sourceRequests: 2, sourceItemCount: 100, eligibleUniqueCount: 50,
  });

  const seenFixture = envelope.items.find((item) => item.genres.includes("Drama"));
  const evaluated = evaluateEntdeckenPublicResponse({ ...envelope, annotations: [{
    sourceItemId: seenFixture.sourceItemId,
    qid: "Q123",
    mediaType: seenFixture.mediaType,
    releaseYear: 2025,
    externalIds: {},
    resolvedAt: "2026-08-27T07:31:00.000Z",
  }] }, publicSourceRegistry, {
    retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35",
  });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.feed.format, 5);
  assert.equal(evaluated.feed.items.length, 50);
  assert.equal(validateEntdeckenDailyFeed(evaluated.feed).ok, true);
  endToEndFeed = evaluated.feed;
});

check("Historischer 50er-Feed bleibt fuer Fuer mich lesbar, aber aus der Popular-Lane entfernt", () => {
  assert.ok(endToEndFeed);
  const seen = endToEndFeed.items.find((item) => item.genres.includes("Drama"));
  const result = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    streamingKnown: { region: "AT", titel: [] },
    master: [{
      id: "seen-joyn", titel: seen.title, jahr: 2025, typ: seen.mediaType, gesehen: true,
      bewertung: { wie: 4, was: 4, warum: 4 }, genre: ["Drama"],
    }],
    profile: { signale: [{ art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 4 }] },
    selectedServices: ["Joyn"], webDiscoveryFeed: endToEndFeed,
  });
  assert.equal(result.personal.length, 6);
  assert.equal(result.popular.length, 0);
  assert.ok(result.personal.every((item) => item.reasons.length > 0));
  assert.ok(![...result.personal, ...result.popular].some((item) => item.title === seen.title));
  assert.equal(new Set(result.personal.map((item) => item.targetId)).size, 6);
});

await checkAsync("Runner speichert den 50er-Pool providerfrei und liest ihn unabhaengig zurueck", async () => {
  const calls = [];
  const adapter = createJoynPublicChartAdapter({
    now: () => "2026-08-27T07:30:00.000Z",
    fetchImpl: async (url) => {
      calls.push(url);
      const chart = JOYN_PUBLIC_CHARTS.find((entry) => entry.listUrl === url);
      return htmlResponse(chartHtml(chart));
    },
  });
  let savedFeed = null;
  const repository = {
    async claimRefresh() {
      return {
        feedEnabled: true, today: "2026-08-27", isoWeek: "2026-W35",
        refresh: true, fenceToken: 7, feed: null, requestMode: "scheduled",
        claimStatus: "claimed", attemptCount: 1, maxAttempts: 1,
      };
    },
    async loadSources() { return publicSourceRegistry; },
    async saveFeed(feed, options) {
      assert.deepEqual(options, { fenceToken: 7, sourceMode: "public-chart" });
      savedFeed = feed;
    },
    async readFeed(options) {
      assert.deepEqual(options, { fenceToken: 7, sourceMode: "public-chart" });
      return {
        ok: true, status: "verified", feed: reverseObjectKeys(savedFeed), fenceToken: 7,
        provenance: {
          itemCount: 50, sourceCount: 1, sourceId: "chart:joyn-at", rightsStatus: "owner_private",
        },
      };
    },
    async markFailure() { assert.fail("Erfolg darf keinen Fehler schreiben"); },
  };
  const result = await runEntdeckenDailyRefresh({ repository, adapter });
  assert.equal(result.status, "fresh");
  assert.equal(result.writes, 1);
  assert.equal(result.feed.items.length, 50);
  assert.equal(result.feedReadback.providerRequests, 0);
  assert.equal("providerReceipt" in result, false);
  assert.equal(calls.length, 2);
});

await checkAsync("Quellensperre behaelt den alten Feed und startet keinen Retry", async () => {
  let requests = 0;
  let failures = 0;
  const staleFeed = (() => {
    const adapter = createJoynPublicChartAdapter({
      now: () => "2026-08-27T07:30:00.000Z",
      fetchImpl: async (url) => htmlResponse(chartHtml(JOYN_PUBLIC_CHARTS.find((entry) => entry.listUrl === url))),
    });
    return adapter.search(createEntdeckenWeeklyQueryContext("2026-08-27", "2026-W35"), {
      retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35",
    }).then((envelope) => evaluateEntdeckenPublicResponse(envelope, publicSourceRegistry, {
      retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35",
    }).feed);
  })();
  const cached = await staleFeed;
  const adapter = createJoynPublicChartAdapter({
    now: () => "2026-09-03T07:30:00.000Z",
    fetchImpl: async () => { requests += 1; return htmlResponse("blocked", 403); },
  });
  const result = await runEntdeckenDailyRefresh({
    adapter,
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, today: "2026-09-03", isoWeek: "2026-W36",
          refresh: true, fenceToken: 8, feed: cached, requestMode: "scheduled",
          claimStatus: "claimed", attemptCount: 1, maxAttempts: 1,
        };
      },
      async loadSources() { return publicSourceRegistry; },
      async saveFeed() { assert.fail("Sperre darf nicht speichern"); },
      async markFailure({ code }) { failures += 1; assert.equal(code, "source_error"); },
    },
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(result.feed, cached);
  assert.equal(result.writes, 0);
  assert.equal(result.reason, "source_error");
  assert.equal(requests, 1);
  assert.equal(failures, 1);
});

await checkAsync("Driftendes Quellenregister stoppt vor Joyn und Wikidata", async () => {
  let sourceCalls = 0;
  let enrichmentCalls = 0;
  const result = await runEntdeckenDailyRefresh({
    adapter: {
      mode: "public-chart",
      async search() { sourceCalls += 1; throw new Error("darf nicht starten"); },
    },
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, today: "2026-08-27", isoWeek: "2026-W35",
          refresh: true, fenceToken: 9, feed: null, requestMode: "scheduled",
          claimStatus: "claimed", attemptCount: 1, maxAttempts: 1,
        };
      },
      async loadSources() { return []; },
      async enrichPublicItems() { enrichmentCalls += 1; return []; },
      async saveFeed() { assert.fail("darf nicht speichern"); },
      async markFailure({ code }) { assert.equal(code, "source_registry_unavailable"); },
    },
  });
  assert.equal(result.reason, "source_registry_unavailable");
  assert.equal(sourceCalls, 0);
  assert.equal(enrichmentCalls, 0);
});

await checkAsync("Sperrstatus stoppt sofort ohne zweiten GET und ohne Retry", async () => {
  let requests = 0;
  const adapter = createJoynPublicChartAdapter({
    now: () => "2026-08-27T07:30:00.000Z",
    fetchImpl: async () => { requests += 1; return htmlResponse("blocked", 429); },
  });
  await assert.rejects(() => adapter.search(
    createEntdeckenWeeklyQueryContext("2026-08-27", "2026-W35"),
    { retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35" },
  ), /public_chart_blocked/);
  assert.equal(requests, 1);
});

console.log(`\n${checks}/${checks} providerfreie Joyn-Adapterchecks bestanden.`);
