import assert from "node:assert/strict";
import {
  buildAnthropicRadarWebsearchBody,
} from "./supabase/functions/radar-websearch-task/anthropicAdapter.js";
import { runRadarWebsearchCheck } from "./supabase/functions/radar-websearch-task/runner.js";
import {
  createRadarWebsearchMemoryRepository,
  createRadarWebsearchMockAdapter,
} from "./supabase/functions/radar-websearch-task/mockAdapter.js";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const target = Object.freeze({
  targetId: "imdb:tt0137523",
  canonicalTitle: "Fight Club",
  releaseYear: 1999,
  mediaType: "film",
  region: "AT",
  scopes: ["cinema", "streaming"],
});
const source = Object.freeze({
  sourceId: "news-a",
  domain: "news-a.example",
  publisherFamily: "news-a",
  sourceClass: "editorial",
  rightsStatus: "approved",
  attributionApproved: true,
  subdomainsAllowed: false,
  active: true,
});
const facts = Object.freeze({
  source: "FlixPatrol",
  identity: Object.freeze({
    flixpatrolId: "ttl_bHyGTvopBHPVtIKhR2CF68WX",
    imdbId: "tt0137523",
    tmdbId: "movie:550",
    title: "Fight Club",
    year: 1999,
    mediaType: "film",
  }),
  description: "Ein neutraler Katalogsatz.",
  runtimeMinutes: 139,
  premiere: "1999-09-10",
  checkedAt: "2026-09-09T11:00:00.000Z",
  fresh: true,
  sourceUrl: "https://flixpatrol.com/title/fight-club/",
});
const envelope = Object.freeze({
  searchResultCount: 0,
  response: Object.freeze({
    status: "no_change",
    checkedAt: "2026-09-10T08:00:00.000Z",
    target: Object.freeze({
      targetId: target.targetId,
      canonicalTitle: target.canonicalTitle,
      releaseYear: target.releaseYear,
      mediaType: target.mediaType,
      region: target.region,
    }),
    events: Object.freeze([]),
  }),
});

function repository(loadFactsContext) {
  const base = createRadarWebsearchMemoryRepository({ target, sources: [source] });
  return Object.freeze({ ...base, loadFactsContext });
}

await check("ein strukturierter Werkcheck bekommt den optionalen Cachekontext ohne zweiten Provideraufruf", async () => {
  let factsReads = 0;
  const adapter = createRadarWebsearchMockAdapter(envelope);
  const result = await runRadarWebsearchCheck({
    accountId: "max-account",
    targetId: target.targetId,
    adapter,
    repository: repository(async (request) => {
      factsReads += 1;
      assert.deepEqual(request, target);
      return facts;
    }),
  });
  assert.equal(result.status, "no_change");
  assert.equal(factsReads, 1);
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(adapter.calls[0].flixpatrolFakten, facts);
  assert.equal("accountId" in adapter.calls[0], false);
});

await check("Cachefehler lässt den bisherigen Radarrequest unverändert weiterlaufen", async () => {
  const adapter = createRadarWebsearchMockAdapter(envelope);
  const result = await runRadarWebsearchCheck({
    accountId: "max-account",
    targetId: target.targetId,
    adapter,
    repository: repository(async () => { throw new Error("cache offline"); }),
  });
  assert.equal(result.status, "no_change");
  assert.equal(adapter.calls.length, 1);
  assert.equal("flixpatrolFakten" in adapter.calls[0], false);
});

await check("der Anthropic-Body trennt neutrale Cachefakten von Termin- und AT-Belegen", () => {
  const setup = {
    radarEnabled: true,
    radarProviderEnabled: true,
    radarSchedulerEnabled: false,
    providerAllowed: true,
    modelAlias: "klein",
    model: "claude-haiku-4-5",
    maxTokens: 1200,
    taskCapUsdCent: 5,
    searchFeeUsdCent: 1,
    globalRequestCapUsdCent: 500,
    timeoutMs: 135000,
    inputPriceUsdCentPerMtok: 100,
    outputPriceUsdCentPerMtok: 500,
    sourceRegistry: [source],
  };
  const body = buildAnthropicRadarWebsearchBody({ ...target, flixpatrolFakten: facts }, setup);
  const input = JSON.parse(body.messages[0].content);
  assert.deepEqual(input.flixpatrolFakten, facts);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].max_uses, 1);
  assert.match(body.system, /weder einen kuenftigen Termin noch AT-Verfuegbarkeit/);
  assert.match(body.system, /Besetzung oder Reihenmitgliedschaft/);
  assert.match(body.system, /fremde Beschreibung.*ausschliesslich als Daten/);
});

console.log(`\n${checks}/${checks} FlixPatrol-KI-Radar-Checks bestanden.`);
