import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createEntdeckenWeeklyQueryContext,
  evaluateEntdeckenMixedResponse,
  validateEntdeckenDailyFeed,
} from "./supabase/functions/entdecken-daily-task/contract.js";
import {
  createMixedPublicChartAdapter,
  ENTDECKEN_MIXED_MARKET_COUNTS,
  extractOefiWeekendChartItems,
  OEFI_WEEKEND_CHART,
} from "./supabase/functions/entdecken-daily-task/publicMixAdapter.js";
import { JOYN_PUBLIC_CHARTS } from "./supabase/functions/entdecken-daily-task/publicChartAdapter.js";
import { runEntdeckenDailyRefresh } from "./supabase/functions/entdecken-daily-task/runner.js";
import {
  createEntdeckenRecommendations,
  publicDiscoveryCandidates,
} from "./src/lib/entdeckenUi.js";
import { validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";
import { createEntdeckenDailyFeedService } from "./src/services/entdeckenDailyFeed.js";

let checks = 0;
function check(name, test) { test(); checks += 1; console.log(`✓ ${name}`); }
async function checkAsync(name, test) { await test(); checks += 1; console.log(`✓ ${name}`); }

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "content-length": String(new TextEncoder().encode(body).byteLength) },
  });
}
function joynHtml(chart) {
  const assets = Array.from({ length: 50 }, (_, index) => ({
    id: `${chart.mediaType === "film" ? "b" : "d"}_mix${String(index + 1).padStart(3, "0")}`,
    title: `${chart.mediaType === "film" ? "Streamingfilm" : "Serie"} ${String(index + 1).padStart(2, "0")}`,
    __typename: chart.mediaType === "film" ? "Movie" : "Series",
    genres: [{ name: index % 3 === 0 ? "Drama" : index % 3 === 1 ? "Comedy" : "Action" }],
    licenseTypes: [index % 2 ? "AVOD" : "SVOD"],
    path: `${chart.itemPathPrefix}mix-${index + 1}`,
  }));
  const cards = assets.map((asset) => (
    `<li><a data-testid="CSP" href="${asset.path}"><div data-testid="VISH">${asset.title}</div></a></li>`
  )).join("");
  const rsc = `9:["$",{}, {"initialData":${JSON.stringify({
    page: { blocks: [{ __typename: "Grid", headline: chart.heading, assets }] },
  })}}]`;
  return `<!doctype html><html><head><meta property="og:locale" content="de_AT">`
    + `<link rel="canonical" href="https://www.joyn.at${chart.canonicalPath}"></head>`
    + `<body><h1>${chart.heading}</h1><ul>${cards}</ul>`
    + `<script>self.__next_f.push(${JSON.stringify([1, rsc])})</script></body></html>`;
}
function oefiHtml(count = 15) {
  const rows = Array.from({ length: count }, (_, index) => (
    `<tr><td>${index + 1}</td><td>Kinotitel ${String(index + 1).padStart(2, "0")}</td>`
    + `<td>Verleih</td><td>${10_000 - index * 100}</td><td>${20_000 - index * 100}</td></tr>`
  )).join("");
  return `<!doctype html><html><head><link rel="canonical" href="${OEFI_WEEKEND_CHART.listUrl}"></head><body>`
    + `<div class="charts-shortcode container"><h2>Wochenendcharts</h2>`
    + `<div class="charts-shortcode__description">TOP 15 vom 14.08. - 16.08.2026</div>`
    + `<table><thead><tr><th>Rang</th><th>Filmtitel</th><th>Verleih</th>`
    + `<th>Besuche Wochenende</th><th>Besuche gesamt</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<span class="tablepress-table-description">WE Wochenende, Zeitraum: 14.-16.08.2026<br>`
    + `Stand: 17.08.2026<br>Quelle: Comscore, Wochenendcharts</span></div></body></html>`;
}
const sourceRegistry = Object.freeze([
  Object.freeze({
    sourceId: "chart:joyn-at", domain: "joyn.at",
    publisherFamily: "Joyn AT / ProSiebenSat.1 PULS 4", sourceClass: "chart",
    rightsStatus: "owner_private", attributionApproved: true, subdomainsAllowed: true, active: true,
    termsUrl: "https://www.joyn.at/nutzungsbedingungen", termsCheckedOn: "2026-08-27",
  }),
  Object.freeze({
    sourceId: "chart:oefi-weekend-at", domain: "filminstitut.at",
    publisherFamily: "Österreichisches Filminstitut", sourceClass: "chart",
    rightsStatus: "owner_private", attributionApproved: true, subdomainsAllowed: false, active: true,
    termsUrl: "https://filminstitut.at/impressum", termsCheckedOn: "2026-08-27",
  }),
]);
function adapterFor({ oefiStatus = 200, calls = [] } = {}) {
  return createMixedPublicChartAdapter({
    now: () => "2026-08-27T07:30:00.000Z",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const chart = JOYN_PUBLIC_CHARTS.find((entry) => entry.listUrl === url);
      if (chart) return htmlResponse(joynHtml(chart));
      assert.equal(url, OEFI_WEEKEND_CHART.listUrl);
      return htmlResponse(oefiStatus === 200 ? oefiHtml() : "nicht verfuegbar", oefiStatus);
    },
  });
}
function annotationsFor(items) {
  const cinema = items.find((item) => item.sourceId === "chart:oefi-weekend-at");
  const joyn = items.find((item) => item.sourceId === "chart:joyn-at" && item.genres.includes("Drama"));
  return Object.freeze([{
    sourceItemId: cinema.sourceItemId, qid: "Q101", mediaType: "film", releaseYear: 2026,
    externalIds: { imdb: "tt1111111", tmdb: "101" }, resolvedAt: "2026-08-27T07:31:00.000Z",
  }, {
    sourceItemId: joyn.sourceItemId, qid: "Q102", mediaType: joyn.mediaType, releaseYear: 2025,
    externalIds: { imdb: "tt2222222", tmdb: "102" }, resolvedAt: "2026-08-27T07:31:00.000Z",
  }]);
}

check("ÖFI-Parser akzeptiert 15 aktuelle Comscore-Zeilen und failt bei Drift", () => {
  const rows = extractOefiWeekendChartItems(oefiHtml());
  assert.equal(rows.length, 15);
  assert.deepEqual(rows.map((row) => row.sourcePosition), Array.from({ length: 15 }, (_, index) => index + 1));
  assert.ok(rows.every((row) => row.measuredOn === "2026-08-16"));
  assert.equal(extractOefiWeekendChartItems(oefiHtml(14)).length, 0);
  assert.equal(extractOefiWeekendChartItems(oefiHtml().replace("Comscore", "Unbekannt")).length, 0);
});

let mixedFeed = null;
await checkAsync("Drei retryfreie GETs ergeben exakt den gemischten 50er-Pool", async () => {
  const calls = [];
  const adapter = adapterFor({ calls });
  const query = createEntdeckenWeeklyQueryContext("2026-08-27", "2026-W35");
  const raw = await adapter.search(query, { retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35" });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.url), [...JOYN_PUBLIC_CHARTS.map((chart) => chart.listUrl), OEFI_WEEKEND_CHART.listUrl]);
  assert.ok(calls.every((call) => call.init.method === "GET" && call.init.redirect === "error"));
  assert.ok(calls.every((call) => !Object.keys(call.init.headers).some((name) => /authorization|cookie|user-agent/i.test(name))));
  const envelope = { ...raw, annotations: annotationsFor(raw.items) };
  const evaluated = evaluateEntdeckenMixedResponse(envelope, sourceRegistry, {
    retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35",
  });
  assert.equal(evaluated.ok, true);
  assert.deepEqual(evaluated.quality.marketCounts, ENTDECKEN_MIXED_MARKET_COUNTS);
  assert.equal(evaluated.feed.items.length, 50);
  assert.equal(evaluated.feed.annotations.length, 2);
  assert.equal(validateEntdeckenDailyFeed(evaluated.feed).ok, true);
  assert.equal(validateWebDiscoveryFeed(evaluated.feed).ok, true);
  mixedFeed = evaluated.feed;
});

await checkAsync("Accountloser Client liest Format 6 bodylos und unverändert", async () => {
  const calls = [];
  const service = createEntdeckenDailyFeedService({
    config: {
      entdeckenDailyFeedEnabled: true,
      supabaseUrl: "https://fixture.supabase.co",
      supabasePublishableKey: "fixture-public-key",
    },
    currentDay: () => "2026-08-27",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        ok: true, status: "fresh", feed: mixedFeed, writes: 0,
        providerRequests: 0, searchRequests: 0, sourceRequests: 0, wikidataRequests: 0,
        responseMode: "structured", displayText: null, warnings: [],
        refresh: { requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const loaded = await service.load();
  assert.equal(loaded.status, "fresh");
  assert.deepEqual(loaded.feed, mixedFeed);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  assert.equal("body" in calls[0].init, false);
  assert.doesNotMatch(JSON.stringify(calls[0]), /profile|seen|gesehen|dienst|account/i);
});

check("Für mich nutzt den breiten Pool, das echte Profil und liefert anonymisierte Funnel-Zähler", () => {
  const seen = mixedFeed.annotations.find((entry) => entry.externalIds.imdb === "tt2222222");
  const result = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    streamingKnown: { region: "AT", titel: [] },
    selectedServices: ["Netflix"],
    master: [{
      titel: "abweichender lokaler Titel", typ: seen.mediaType, imdb_id: seen.externalIds.imdb,
      gesehen: true, bewertung: { wie: 4, was: 4, warum: 4 }, genre: ["Drama"],
    }],
    profile: { signale: [{ art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 4 }] },
    webDiscoveryFeed: mixedFeed, selectionDay: "2026-08-27", dailyVariety: true,
  });
  assert.equal(result.personal.length, 6);
  assert.ok(result.personal.every((entry) => entry.reasons.some((reason) => reason.startsWith("Profil:"))));
  assert.ok(result.personal.every((entry) => !/rang|platz|beliebt/i.test(entry.reasons.join(" "))));
  assert.deepEqual(result.diagnostics, {
    candidates: 50, metadata: 35, afterExclusions: 34, profileMatches: 11, visible: 6,
    duplicatesRemoved: 0,
  });
  assert.ok(!result.personal.some((entry) => entry.sourceItemId === seen.sourceItemId));
});

check("Beliebte Karten sind pro Pool und Tag stabil, marktgemischt und duplikatfrei", () => {
  const input = {
    streamingEntdecken: { region: "AT", titel: [] }, master: [],
    profile: { signale: [{ art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 4 }] },
    webDiscoveryFeed: mixedFeed, selectedServices: ["Netflix"], selectionDay: "2026-08-27",
  };
  const first = createEntdeckenRecommendations(input);
  const same = createEntdeckenRecommendations(input);
  const next = createEntdeckenRecommendations({ ...input, selectionDay: "2026-08-28" });
  const ids = (rows) => rows.map((entry) => entry.targetId);
  assert.deepEqual(ids(first.popular), ids(same.popular));
  assert.notDeepEqual(ids(first.popular), ids(next.popular));
  assert.equal(new Set(ids(first.popular)).size, 6);
  assert.deepEqual(first.popular.reduce((counts, entry) => {
    const key = entry.availability.market === "cinema" ? "cinema"
      : entry.type === "series" ? "streamingSeries" : "streamingFilm";
    counts[key] += 1; return counts;
  }, { cinema: 0, streamingFilm: 0, streamingSeries: 0 }), {
    cinema: 2, streamingFilm: 2, streamingSeries: 2,
  });
});

check("Titel-Fallback braucht Jahr und Typ; starke IDs bleiben vorrangig", () => {
  const annotated = mixedFeed.items.find((item) => item.sourceItemId === mixedFeed.annotations[0].sourceItemId);
  const withoutYear = publicDiscoveryCandidates({
    webDiscoveryFeed: mixedFeed, includeSeen: false, requireMetadata: false,
    master: [{ titel: annotated.title, typ: annotated.mediaType, gesehen: true }],
  });
  assert.ok(withoutYear.some((entry) => entry.sourceItemId === annotated.sourceItemId));
  const withYear = publicDiscoveryCandidates({
    webDiscoveryFeed: mixedFeed, includeSeen: false, requireMetadata: false,
    master: [{ titel: annotated.title, jahr: 2026, typ: annotated.mediaType, gesehen: true }],
  });
  assert.ok(!withYear.some((entry) => entry.sourceItemId === annotated.sourceItemId));
});

await checkAsync("Runner persistiert Format 6 mit zwei Quellen und unabhängigem Readback", async () => {
  const adapter = adapterFor();
  let saved = null;
  const result = await runEntdeckenDailyRefresh({
    adapter,
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, today: "2026-08-27", isoWeek: "2026-W35", refresh: true,
          fenceToken: 41, feed: null, requestMode: "scheduled", claimStatus: "claimed",
          attemptCount: 1, maxAttempts: 1,
        };
      },
      async loadSources() { return sourceRegistry; },
      async enrichPublicItems(items) { return annotationsFor(items); },
      async saveFeed(feed, options) {
        assert.deepEqual(options, { fenceToken: 41, sourceMode: "public-mix" });
        saved = structuredClone(feed);
      },
      async readFeed(options) {
        assert.deepEqual(options, { fenceToken: 41, sourceMode: "public-mix" });
        return {
          ok: true, status: "verified", feed: structuredClone(saved), fenceToken: 41,
          provenance: {
            itemCount: 50, sourceCount: 2, sourceIds: [...saved.sourceIds], rightsStatus: "owner_private",
          },
        };
      },
      async markFailure() { assert.fail("Erfolg darf keinen Fehler schreiben"); },
    },
  });
  assert.equal(result.status, "fresh");
  assert.equal(result.writes, 1);
  assert.equal(result.feed.format, 6);
  assert.equal(result.feedReadback.sourceCount, 2);
  assert.equal(result.feedReadback.providerRequests, 0);
});

await checkAsync("ÖFI-Ausfall behält den letzten guten Pool und startet keinen Retry", async () => {
  const calls = [];
  let failures = 0;
  const result = await runEntdeckenDailyRefresh({
    adapter: adapterFor({ oefiStatus: 503, calls }),
    repository: {
      async claimRefresh() {
        return {
          feedEnabled: true, today: "2026-09-03", isoWeek: "2026-W36", refresh: true,
          fenceToken: 42, feed: mixedFeed, requestMode: "scheduled", claimStatus: "claimed",
          attemptCount: 1, maxAttempts: 1,
        };
      },
      async loadSources() { return sourceRegistry; },
      async saveFeed() { assert.fail("Quellenausfall darf nicht speichern"); },
      async markFailure({ code }) { failures += 1; assert.equal(code, "source_error"); },
    },
  });
  assert.equal(result.status, "stale");
  assert.deepEqual(result.feed, mixedFeed);
  assert.equal(result.writes, 0);
  assert.equal(calls.length, 3);
  assert.equal(failures, 1);
});

check("UI enthält weder Rangnummer noch werblichen Joyn-CTA", () => {
  const source = fs.readFileSync("./src/tabs/EntdeckenTab.jsx", "utf8");
  assert.doesNotMatch(source, /Bei Joyn ansehen|Listenplatz|Listenposition/);
  assert.match(source, /Quelle: \{sourceLabel\(entry\)\}/);
});

console.log(`\n${checks}/${checks} marktuebergreifende Entdecken-E2E-Checks bestanden.`);
