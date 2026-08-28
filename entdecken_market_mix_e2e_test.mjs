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
  ENTDECKEN_MIXED_MAX_SOURCE_SHARE,
  ENTDECKEN_MIXED_POOL_SIZE,
  ENTDECKEN_MIXED_SOURCE_COUNTS,
  ENTDECKEN_MIXED_SOURCE_REQUESTS,
  ENTDECKEN_NETFLIX_SOURCE_ID,
  extractNetflixAustriaWeeklyItems,
  extractOefiWeekendChartItems,
  NETFLIX_AT_WEEKLY_CHART,
  OEFI_WEEKEND_CHART,
} from "./supabase/functions/entdecken-daily-task/publicMixAdapter.js";
import { runEntdeckenDailyRefresh } from "./supabase/functions/entdecken-daily-task/runner.js";
import { pruefeEntdeckenLiveAntwort } from "./tools/entdecken_live_proof.mjs";
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
function tsvResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/tab-separated-values",
      "content-length": String(new TextEncoder().encode(body).byteLength),
    },
  });
}
function netflixTsv({ week = "2026-08-23", header = null, filmCount = 10, seriesCount = 10 } = {}) {
  const columns = header || [
    "country_name", "country_iso2", "week", "category", "weekly_rank",
    "show_title", "season_title", "cumulative_weeks_in_top_10",
  ].join("\t");
  const rows = [
    ["Argentina", "AR", week, "Films", 1, "Anderer Markt", "N/A", 1],
    ...Array.from({ length: filmCount }, (_, index) => [
      "Austria", "AT", week, "Films", index + 1,
      `Streamingfilm ${String(index + 1).padStart(2, "0")}`, "N/A", index + 1,
    ]),
    ...Array.from({ length: seriesCount }, (_, index) => [
      "Austria", "AT", week, "TV", index + 1,
      `Serie ${String(index + 1).padStart(2, "0")}`, `Serie ${index + 1}: Season 1`, index + 1,
    ]),
    ["Austria", "AT", "2026-08-16", "Films", 1, "Historischer Titel", "N/A", 2],
    ["Bahamas", "BS", week, "Films", 1, "Spaeterer Markt", "N/A", 1],
  ];
  return `${columns}\n${rows.map((row) => row.join("\t")).join("\n")}\n`;
}
function oefiHtml(count = 15, { explicitStartMonth = false } = {}) {
  const rows = Array.from({ length: count }, (_, index) => (
    `<tr><td>${index + 1}</td><td>Kinotitel ${String(index + 1).padStart(2, "0")}</td>`
    + `<td>Verleih</td><td>${10_000 - index * 100}</td><td>${20_000 - index * 100}</td></tr>`
  )).join("");
  return `<!doctype html><html><head><link rel="canonical" href="${OEFI_WEEKEND_CHART.listUrl}"></head><body>`
    + `<div class="charts-shortcode container"><h2>Wochenendcharts</h2>`
    + `<div class="charts-shortcode__description">TOP 15 vom 14.08. - 16.08.2026</div>`
    + `<table><thead><tr><th>Rang</th><th>Filmtitel</th><th>Verleih</th>`
    + `<th>Besuche Wochenende</th><th>Besuche gesamt</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<span class="tablepress-table-description">WE Wochenende, Zeitraum: ${explicitStartMonth ? "14.08.-16.08.2026" : "14.-16.08.2026"}<br>`
    + `Stand: 17.08.2026<br>Quelle: Comscore, Wochenendcharts</span></div></body></html>`;
}
const sourceRegistry = Object.freeze([
  Object.freeze({
    sourceId: ENTDECKEN_NETFLIX_SOURCE_ID, domain: "netflix.com",
    publisherFamily: "Netflix, Inc.", sourceClass: "chart",
    rightsStatus: "owner_private", attributionApproved: true, subdomainsAllowed: true, active: true,
    termsUrl: "https://help.netflix.com/legal/termsofuse", termsCheckedOn: "2026-08-28",
  }),
  Object.freeze({
    sourceId: "chart:oefi-weekend-at", domain: "filminstitut.at",
    publisherFamily: "Österreichisches Filminstitut", sourceClass: "chart",
    rightsStatus: "owner_private", attributionApproved: true, subdomainsAllowed: false, active: true,
    termsUrl: "https://filminstitut.at/impressum", termsCheckedOn: "2026-08-27",
  }),
]);
function adapterFor({ oefiStatus = 200, netflixWeek = "2026-08-23", calls = [] } = {}) {
  return createMixedPublicChartAdapter({
    now: () => "2026-08-27T07:30:00.000Z",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url === NETFLIX_AT_WEEKLY_CHART.dataUrl) return tsvResponse(netflixTsv({ week: netflixWeek }));
      assert.equal(url, OEFI_WEEKEND_CHART.listUrl);
      return htmlResponse(oefiStatus === 200 ? oefiHtml() : "nicht verfuegbar", oefiStatus);
    },
  });
}
function annotationsFor(items) {
  return Object.freeze(items.map((item, index) => ({
    sourceItemId: item.sourceItemId,
    qid: `Q${index + 101}`,
    mediaType: item.mediaType,
    releaseYear: 2000 + index,
    externalIds: {
      imdb: `tt${String(index + 1_000_001)}`,
      tmdb: String(index + 101),
    },
    resolvedAt: "2026-08-27T07:31:00.000Z",
  })));
}
function netflixCatalog(feed) {
  const facts = new Map(feed.annotations.map((entry) => [entry.sourceItemId, entry]));
  return feed.items.filter((item) => item.sourceId === ENTDECKEN_NETFLIX_SOURCE_ID).map((item, index) => ({
    watchmode_id: 8_000 + index,
    titel: item.title,
    typ: item.mediaType,
    jahr: facts.get(item.sourceItemId).releaseYear,
    imdb_id: facts.get(item.sourceItemId).externalIds.imdb,
    tmdb_id: facts.get(item.sourceItemId).externalIds.tmdb,
    dienste: ["Netflix"],
    genres: ["Drama"],
  }));
}

check("ÖFI-Parser akzeptiert 15 aktuelle Comscore-Zeilen und failt bei Drift", () => {
  const rows = extractOefiWeekendChartItems(oefiHtml());
  assert.equal(rows.length, 15);
  assert.deepEqual(rows.map((row) => row.sourcePosition), Array.from({ length: 15 }, (_, index) => index + 1));
  assert.ok(rows.every((row) => row.measuredOn === "2026-08-16"));
  assert.equal(extractOefiWeekendChartItems(oefiHtml(15, { explicitStartMonth: true })).length, 15);
  assert.equal(extractOefiWeekendChartItems(oefiHtml().replace("14.-16.08.2026", "14.07.-16.08.2026")).length, 0);
  assert.equal(extractOefiWeekendChartItems(oefiHtml(14)).length, 0);
  assert.equal(extractOefiWeekendChartItems(oefiHtml().replace("Comscore", "Unbekannt")).length, 0);
});

check("Netflix-Parser bindet den echten 8-Felder-Vertrag an die aktuelle AT-Woche", () => {
  const rows = extractNetflixAustriaWeeklyItems(netflixTsv(), { retrievedOn: "2026-08-27" });
  assert.equal(rows.length, 20);
  assert.deepEqual(rows.reduce((counts, row) => {
    counts[row.mediaType] += 1; return counts;
  }, { film: 0, series: 0 }), { film: 10, series: 10 });
  assert.ok(rows.every((row) => row.measuredOn === "2026-08-23"));
  assert.equal(extractNetflixAustriaWeeklyItems(netflixTsv({
    header: "country_name\tcountry_iso2\tweek\tcategory\tweekly_rank\tshow_title",
  }), { retrievedOn: "2026-08-27" }).length, 0);
  assert.equal(extractNetflixAustriaWeeklyItems(netflixTsv({ week: "2026-07-05" }), {
    retrievedOn: "2026-08-27",
  }).length, 0);
});

let mixedFeed = null;
await checkAsync("Zwei retryfreie GETs ergeben den ehrlichen 25er-Pool mit hartem Source-Cap", async () => {
  const calls = [];
  const adapter = adapterFor({ calls });
  const query = createEntdeckenWeeklyQueryContext("2026-08-27", "2026-W35");
  const raw = await adapter.search(query, { retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35" });
  assert.equal(calls.length, ENTDECKEN_MIXED_SOURCE_REQUESTS);
  assert.deepEqual(calls.map((call) => call.url), [NETFLIX_AT_WEEKLY_CHART.dataUrl, OEFI_WEEKEND_CHART.listUrl]);
  assert.ok(calls.every((call) => call.init.method === "GET" && call.init.redirect === "error"));
  assert.ok(calls.every((call) => !Object.keys(call.init.headers).some((name) => /authorization|cookie|user-agent/i.test(name))));
  const envelope = { ...raw, annotations: annotationsFor(raw.items) };
  const evaluated = evaluateEntdeckenMixedResponse(envelope, sourceRegistry, {
    retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35",
  });
  assert.equal(evaluated.ok, true);
  assert.deepEqual(evaluated.quality.marketCounts, ENTDECKEN_MIXED_MARKET_COUNTS);
  assert.equal(evaluated.feed.items.length, ENTDECKEN_MIXED_POOL_SIZE);
  assert.equal(evaluated.feed.annotations.length, ENTDECKEN_MIXED_POOL_SIZE);
  const sourceCounts = evaluated.feed.items.reduce((counts, item) => {
    counts[item.sourceId] = (counts[item.sourceId] || 0) + 1; return counts;
  }, {});
  assert.deepEqual(sourceCounts, ENTDECKEN_MIXED_SOURCE_COUNTS);
  assert.equal(sourceCounts[ENTDECKEN_NETFLIX_SOURCE_ID] / evaluated.feed.items.length,
    ENTDECKEN_MIXED_MAX_SOURCE_SHARE);
  assert.equal(validateEntdeckenDailyFeed(evaluated.feed).ok, true);
  assert.equal(validateWebDiscoveryFeed(evaluated.feed).ok, true);
  mixedFeed = evaluated.feed;
});

await checkAsync("Netflix-Prefixgrenze stoppt auch einen einzelnen übergroßen Chunk vor ÖFI", async () => {
  const calls = [];
  const adapter = createMixedPublicChartAdapter({
    now: () => "2026-08-27T07:30:00.000Z",
    maxNetflixPrefixBytes: 128,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return tsvResponse(netflixTsv());
    },
  });
  await assert.rejects(
    () => adapter.search(createEntdeckenWeeklyQueryContext("2026-08-27", "2026-W35"), {
      retrievedOn: "2026-08-27", claimedIsoWeek: "2026-W35",
    }),
    (error) => error?.message === "public_mix_source_prefix_too_large",
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, NETFLIX_AT_WEEKLY_CHART.dataUrl);
  assert.equal(adapter.telemetry().sourceRequests, 1);
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
  const catalog = netflixCatalog(mixedFeed);
  const seen = mixedFeed.annotations.find((entry) => (
    entry.sourceItemId === mixedFeed.items.find((item) => item.sourceId === ENTDECKEN_NETFLIX_SOURCE_ID).sourceItemId
  ));
  const result = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    streamingKnown: { region: "AT", titel: catalog },
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
    candidates: 25, metadata: 10, afterExclusions: 9, profileMatches: 9, visible: 6,
    duplicatesRemoved: 0,
  });
  assert.ok(!result.personal.some((entry) => entry.sourceItemId === seen.sourceItemId));
});

check("Beliebte Karten sind pro Pool und Tag stabil, marktgemischt und duplikatfrei", () => {
  const input = {
    streamingEntdecken: { region: "AT", titel: [] }, master: [],
    profile: {},
    webDiscoveryFeed: mixedFeed, selectedServices: ["Netflix"], selectionDay: "2026-08-27",
  };
  const first = createEntdeckenRecommendations(input);
  const same = createEntdeckenRecommendations(input);
  const next = createEntdeckenRecommendations({ ...input, selectionDay: "2026-08-28" });
  const ids = (rows) => rows.map((entry) => entry.targetId);
  assert.deepEqual(ids(first.popular), ids(same.popular));
  assert.notDeepEqual(ids(first.popular), ids(next.popular));
  assert.equal(new Set(ids(first.popular)).size, 6);
  assert.equal(first.popularPool.length, 25);
  assert.equal(first.popularPool.filter((entry) => entry.sourceId === ENTDECKEN_NETFLIX_SOURCE_ID).length, 10);
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
    master: [{
      titel: annotated.title,
      jahr: mixedFeed.annotations[0].releaseYear,
      typ: annotated.mediaType,
      gesehen: true,
    }],
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
            itemCount: 25, sourceCount: 2, sourceIds: [...saved.sourceIds], rightsStatus: "owner_private",
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

check("Livebeleg akzeptiert Format 6 nur mit Nulldelta und unabhängigem Readback", () => {
  const feedReadback = {
    schemaVersion: "entdecken-mixed-weekly-readback-v2",
    feedId: mixedFeed.feedId,
    region: mixedFeed.region,
    isoWeek: mixedFeed.isoWeek,
    refreshedOn: mixedFeed.refreshedOn,
    validUntil: mixedFeed.validUntil,
    itemCount: 25,
    sourceCount: 2,
    sourceIds: [...mixedFeed.sourceIds],
    rightsStatus: "owner_private",
    providerRequests: 0,
  };
  const response = {
    ok: true, status: "fresh", feed: mixedFeed, writes: 1,
    providerRequests: 0, searchRequests: 0, sourceRequests: 2, wikidataRequests: 5,
    responseMode: "structured", displayText: null, warnings: [], feedReadback,
    refresh: { requested: true, mode: "owner", status: "refreshed", attemptCount: 1, maxAttempts: 1 },
  };
  const independent = {
    ok: true, status: "fresh", feed: structuredClone(mixedFeed), writes: 0,
    providerRequests: 0, searchRequests: 0, sourceRequests: 0, wikidataRequests: 0,
    responseMode: "structured", displayText: null, warnings: [],
    refresh: { requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1 },
  };
  assert.deepEqual(pruefeEntdeckenLiveAntwort(response, {
    measuredCostUsdCent: 0,
    readbackResponse: independent,
  }), {
    ok: true, result: "PROVEN", status: "fresh", itemCount: 25, sourceCount: 2,
    marketCounts: { cinema: 15, streamingFilm: 5, streamingSeries: 5 },
    providerRequests: 0, sourceRequests: 2, wikidataRequests: 5,
    responseMode: "structured", receiptState: "provider-free", costState: "zero",
  });
  assert.throws(() => pruefeEntdeckenLiveAntwort(response, {
    measuredCostUsdCent: 0.0001,
    readbackResponse: independent,
  }), (error) => error?.code === "PROVIDER_FREE_RESULT");
});

await checkAsync("ÖFI-Ausfall behält den letzten guten Pool und startet keinen Retry", async () => {
  const calls = [];
  let failures = 0;
  const result = await runEntdeckenDailyRefresh({
    adapter: adapterFor({ oefiStatus: 503, netflixWeek: "2026-08-30", calls }),
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
  assert.equal(calls.length, 2);
  assert.equal(failures, 1);
});

check("UI verlinkt Titel neutral und klappt den restlichen Pool zugänglich auf", () => {
  const source = fs.readFileSync("./src/tabs/EntdeckenTab.jsx", "utf8");
  assert.doesNotMatch(source, /Bei Joyn ansehen|Listenplatz|Listenposition/);
  assert.match(source, /Quelle: \{sourceLabel\(entry\)\}/);
  assert.match(source, /kd-entdecken-titellink/);
  assert.match(source, /aria-expanded=\{showAllPopular\}/);
  assert.match(source, /Weitere \$\{popularPool\.length - popular\.length\} Titel anzeigen/);
});

console.log(`\n${checks}/${checks} marktuebergreifende Entdecken-E2E-Checks bestanden.`);
