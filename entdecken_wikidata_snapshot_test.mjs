import assert from "node:assert/strict";
import {
  cachedEntdeckenFacts,
  createEntdeckenFactsInput,
  entdeckenFactsDiagnostics,
  emptyEntdeckenFactsSnapshot,
  mergeEntdeckenWikidataFactsSnapshot,
  projectEntdeckenFacts,
  validateEntdeckenFactsSnapshot,
} from "./src/lib/entdeckenFacts.js";
import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";
import committedSnapshot from "./src/data/entdeckenFactsSnapshot.json" with { type: "json" };
import { createEntdeckenRecommendations } from "./src/lib/entdeckenUi.js";
import {
  WikidataSnapshotError,
  buildWikidataFacts,
  createWikidataApiClient,
  runEntdeckenWikidataSnapshot,
  selectWikidataIdentity,
} from "./tools/entdecken_wikidata_snapshot.mjs";

let checks = 0;
async function check(name, test) {
  try {
    await test();
    checks += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const NOW = "2026-08-29T14:00:00.000Z";
const QID_URL = (qid) => `https://www.wikidata.org/wiki/${qid}`;
const emptySnapshot = () => emptyEntdeckenFactsSnapshot({
  poolId: ENTDECKEN_MARKET_POOL_50.feedId,
  poolVersion: ENTDECKEN_MARKET_POOL_50.poolVersion,
});
const qValue = (qid) => ({
  "entity-type": "item",
  "numeric-id": Number(qid.slice(1)),
  id: qid,
});
const claim = (value, rank = "normal") => ({
  rank,
  mainsnak: { snaktype: "value", datavalue: { value } },
});
const qClaim = (qid, rank) => claim(qValue(qid), rank);
const stringClaim = (value, rank) => claim(value, rank);
const yearClaim = (year, rank) => claim({
  time: `+${year}-01-01T00:00:00Z`,
  precision: 9,
});

function entity({
  qid, title, mediaType = "film", year = 2026, genres = [], directors = [], actors = [],
  franchise = [], imdb = null, tmdb = null, aliases = [],
}) {
  const claims = {
    P31: [qClaim(mediaType === "film" ? "Q11424" : "Q5398426")],
    ...(year === null ? {} : { P577: [yearClaim(year)] }),
    ...(genres.length ? { P136: genres.map((qid) => qClaim(qid)) } : {}),
    ...(directors.length ? { P57: directors.map((qid) => qClaim(qid)) } : {}),
    ...(actors.length ? { P161: actors.map((qid) => qClaim(qid)) } : {}),
    ...(franchise.length ? { P179: franchise.map((qid) => qClaim(qid)) } : {}),
    ...(imdb ? { P345: [stringClaim(imdb)] } : {}),
    ...(tmdb ? { [mediaType === "film" ? "P4947" : "P4983"]: [stringClaim(tmdb)] } : {}),
  };
  return {
    id: qid,
    type: "item",
    labels: { de: { language: "de", value: title } },
    aliases: { de: aliases.map((value) => ({ language: "de", value })) },
    claims,
  };
}

function inputFor(item) {
  const input = createEntdeckenFactsInput(item, ENTDECKEN_MARKET_POOL_50.poolVersion);
  assert.ok(input);
  return input;
}

function resolved(input, qid, {
  checkedAt = NOW, identity = "exact", genres = ["action"], persons = [], franchise = null,
  externalIds = {},
} = {}) {
  return {
    poolId: input.poolId,
    preResolutionKey: input.preResolutionKey,
    status: "resolved",
    strongId: `wikidata:${qid}`,
    facts: { genres, tags: [], franchise, persons, externalIds },
    evidenceUrls: [QID_URL(qid)],
    checkedAt,
    validation: {
      status: "machine_validated",
      identity,
      taxonomy: "normalized",
      evidence: "direct",
    },
  };
}

function negative(input, status, { checkedAt = NOW, qids = [] } = {}) {
  return {
    poolId: input.poolId,
    preResolutionKey: input.preResolutionKey,
    status,
    strongId: null,
    facts: null,
    evidenceUrls: qids.map(QID_URL),
    checkedAt,
    validation: {
      status: "machine_validated",
      identity: "not_resolved",
      taxonomy: "not_applicable",
      evidence: qids.length ? "direct" : "none",
    },
  };
}

await check("Externe ID gewinnt vor abweichendem Titel", () => {
  const item = {
    ...ENTDECKEN_MARKET_POOL_50.items[0],
    title: "Absichtlich anderer Pooltitel",
    externalIds: { imdb: "tt1234567" },
  };
  const input = inputFor(item);
  const candidate = entity({
    qid: "Q100", title: "Belegter Originaltitel", imdb: "tt1234567", year: 2025,
  });
  const selected = selectWikidataIdentity({
    item,
    input,
    lookupKind: "external_id",
    candidateQids: ["Q100"],
    entities: new Map([["Q100", candidate]]),
  });
  assert.equal(selected.result, null);
  assert.deepEqual(
    { qid: selected.chosen.qid, identity: selected.chosen.identity },
    { qid: "Q100", identity: "strong_id" },
  );
});

await check("Exakter Titel, Typ und Jahr loesen eindeutig auf", () => {
  const item = ENTDECKEN_MARKET_POOL_50.items[0];
  const input = inputFor(item);
  const selected = selectWikidataIdentity({
    item,
    input,
    lookupKind: "title",
    candidateQids: ["Q101", "Q102"],
    entities: new Map([
      ["Q101", entity({ qid: "Q101", title: item.title, year: item.releaseYear })],
      ["Q102", entity({ qid: "Q102", title: item.title, mediaType: "series", year: item.releaseYear })],
    ]),
  });
  assert.equal(selected.result, null);
  assert.equal(selected.chosen.qid, "Q101");
  assert.equal(selected.chosen.identity, "exact");
});

await check("Fehlendes Wikidata-Jahr ist nur bei eindeutigem Titel und Typ zulaessig", () => {
  const item = ENTDECKEN_MARKET_POOL_50.items[0];
  const input = inputFor(item);
  const selected = selectWikidataIdentity({
    item,
    input,
    lookupKind: "title",
    candidateQids: ["Q103"],
    entities: new Map([["Q103", entity({ qid: "Q103", title: item.title, year: null })]]),
  });
  assert.equal(selected.result, null);
  assert.equal(selected.chosen.identity, "title_type_year_missing");
});

await check("Widersprechendes Jahr bleibt unresolved", () => {
  const item = ENTDECKEN_MARKET_POOL_50.items[0];
  const input = inputFor(item);
  const selected = selectWikidataIdentity({
    item,
    input,
    lookupKind: "title",
    candidateQids: ["Q104"],
    entities: new Map([["Q104", entity({ qid: "Q104", title: item.title, year: item.releaseYear - 1 })]]),
  });
  assert.equal(selected.chosen, null);
  assert.equal(selected.result.status, "unresolved");
});

await check("Mehrere plausible QIDs bleiben ambiguous", () => {
  const item = ENTDECKEN_MARKET_POOL_50.items[0];
  const input = inputFor(item);
  const selected = selectWikidataIdentity({
    item,
    input,
    lookupKind: "title",
    candidateQids: ["Q105", "Q106"],
    entities: new Map([
      ["Q105", entity({ qid: "Q105", title: item.title, year: null })],
      ["Q106", entity({ qid: "Q106", title: item.title, year: null })],
    ]),
  });
  assert.equal(selected.chosen, null);
  assert.equal(selected.result.status, "ambiguous");
  assert.deepEqual(selected.result.evidenceUrls, [QID_URL("Q105"), QID_URL("Q106")]);
});

await check("Nur belegte Genre-, Personen-, Franchise- und ID-Fakten passieren", () => {
  const candidate = entity({
    qid: "Q107",
    title: "Taxonomiebeleg",
    genres: ["Q959790", "Q999999"],
    directors: ["Q201"],
    actors: ["Q201", "Q202"],
    franchise: ["Q301"],
    imdb: "tt7654321",
    tmdb: "12345",
  });
  const labels = new Map([
    ["Q959790", "Kriminalfilm"],
    ["Q999999", "Nicht abgebildetes Spezialgenre"],
    ["Q201", "Belegte Person"],
    ["Q202", "Zweite Person"],
    ["Q301", "Belegte Reihe"],
  ]);
  const built = buildWikidataFacts(candidate, labels, "film");
  assert.deepEqual(built.facts.genres, ["krimi"]);
  assert.deepEqual(built.facts.tags, []);
  assert.deepEqual(built.facts.externalIds, { imdb: "tt7654321", tmdb: "12345" });
  assert.deepEqual(built.facts.franchise, { id: "wikidata:Q301", name: "Belegte Reihe" });
  assert.deepEqual(built.facts.persons, [
    { id: "wikidata:Q201", name: "Belegte Person", roles: ["director", "actor"] },
    { id: "wikidata:Q202", name: "Zweite Person", roles: ["actor"] },
  ]);
  assert.ok(!built.evidenceQids.includes("Q999999"));
});

await check("Negativer Cache gilt 30 Tage und laeuft danach fail-closed ab", () => {
  const item = ENTDECKEN_MARKET_POOL_50.items[0];
  const input = inputFor(item);
  const merged = mergeEntdeckenWikidataFactsSnapshot(
    emptySnapshot(),
    input,
    negative(input, "ambiguous", {
      checkedAt: "2026-01-01T00:00:00.000Z",
      qids: ["Q108", "Q109"],
    }),
  );
  assert.ok(merged);
  assert.equal(cachedEntdeckenFacts(merged, item, { now: "2026-01-30T23:59:59.999Z" }).status, "ambiguous");
  assert.equal(cachedEntdeckenFacts(merged, item, { now: "2026-01-31T00:00:00.000Z" }), null);
});

await check("Wiederanlauf fragt nur offene oder abgelaufene Items und persistiert pro Item", async () => {
  const items = ENTDECKEN_MARKET_POOL_50.items.slice(0, 3);
  const pool = { ...ENTDECKEN_MARKET_POOL_50, items };
  const firstInput = inputFor(items[0]);
  const secondInput = inputFor(items[1]);
  let snapshot = mergeEntdeckenWikidataFactsSnapshot(
    emptySnapshot(), firstInput, resolved(firstInput, "Q110", { checkedAt: "2026-08-01T00:00:00.000Z" }),
  );
  snapshot = mergeEntdeckenWikidataFactsSnapshot(
    snapshot, secondInput, negative(secondInput, "ambiguous", {
      checkedAt: "2026-08-20T00:00:00.000Z", qids: ["Q111", "Q112"],
    }),
  );
  assert.ok(snapshot);

  const calls = { search: [], external: 0, entities: 0, labels: 0 };
  const qid = "Q113";
  const api = {
    async searchTitle(title, language) {
      calls.search.push([title, language]);
      return [{ id: qid, names: [title] }];
    },
    async lookupExternalId() { calls.external += 1; return { total: 0, qids: [] }; },
    async getEntities(qids) {
      calls.entities += 1;
      assert.deepEqual(qids, [qid]);
      return new Map([[qid, entity({
        qid, title: items[2].title, year: items[2].releaseYear, genres: ["Q959790"],
      })]]);
    },
    async getLabels(qids) {
      calls.labels += 1;
      assert.deepEqual(qids, ["Q959790"]);
      return new Map([["Q959790", "Kriminalfilm"]]);
    },
    telemetry: () => ({ requests: 4, maxRequests: 160 }),
  };
  const writes = [];
  const result = await runEntdeckenWikidataSnapshot({
    pool,
    snapshot,
    api,
    now: NOW,
    persistSnapshot: async (next) => { writes.push(next); },
  });
  assert.equal(result.stopped, false);
  assert.equal(result.cached, 2);
  assert.equal(result.processed, 1);
  assert.equal(result.resolved, 2);
  assert.equal(result.ambiguous, 1);
  assert.equal(result.rankingCapable, 2);
  assert.deepEqual(calls.search, [[items[2].title, "de"], [items[2].title, "en"]]);
  assert.equal(calls.external, 0);
  assert.equal(calls.entities, 1);
  assert.equal(calls.labels, 1);
  assert.equal(writes.length, 1);
  assert.deepEqual(projectEntdeckenFacts(result.snapshot, items[2], { now: NOW }).genres, ["krimi"]);
});

await check("API-Fehler wird ohne Retry safelist-codiert", async () => {
  let calls = 0;
  const api = createWikidataApiClient({
    minIntervalMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return new Response("{}", {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    },
  });
  await assert.rejects(
    () => api.searchTitle("Fixture", "de"),
    (error) => error instanceof WikidataSnapshotError && error.code === "wikidata_rate_limited",
  );
  assert.equal(calls, 1);
  assert.equal(api.telemetry().requests, 1);
});

await check("API-Ausfall behaelt vorhandene Fakten und stoppt nur offene Anreicherung", async () => {
  const items = ENTDECKEN_MARKET_POOL_50.items.slice(0, 2);
  const pool = { ...ENTDECKEN_MARKET_POOL_50, items };
  const firstInput = inputFor(items[0]);
  const snapshot = mergeEntdeckenWikidataFactsSnapshot(
    emptySnapshot(), firstInput, resolved(firstInput, "Q114", { checkedAt: "2026-08-01T00:00:00.000Z" }),
  );
  let writes = 0;
  const result = await runEntdeckenWikidataSnapshot({
    pool,
    snapshot,
    now: NOW,
    persistSnapshot: async () => { writes += 1; },
    api: {
      async searchTitle() { throw new WikidataSnapshotError("wikidata_transport"); },
      telemetry: () => ({ requests: 1, maxRequests: 160 }),
    },
  });
  assert.equal(result.stopped, true);
  assert.equal(result.stopCode, "wikidata_transport");
  assert.equal(result.resolved, 1);
  assert.equal(result.open, 1);
  assert.equal(writes, 0);
});

await check("Ambiguous Fakten blockieren den Popular-Pool nicht", () => {
  const item = ENTDECKEN_MARKET_POOL_50.items[0];
  const input = inputFor(item);
  const snapshot = mergeEntdeckenWikidataFactsSnapshot(
    emptySnapshot(), input, negative(input, "ambiguous", { qids: ["Q115", "Q116"] }),
  );
  const result = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    streamingKnown: { region: "AT", titel: [] },
    selectedServices: [],
    master: [],
    profile: {},
    webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
    selectionDay: "2026-08-29",
    factsSnapshot: snapshot,
  });
  assert.equal(result.popularPool.length, 50);
  assert.equal(result.popular.length, 6);
});

await check("Commit-Snapshot deckt den ganzen Pool terminal und rankingfaehig ab", () => {
  const checked = validateEntdeckenFactsSnapshot(committedSnapshot, {
    poolId: ENTDECKEN_MARKET_POOL_50.feedId,
    poolVersion: ENTDECKEN_MARKET_POOL_50.poolVersion,
  });
  assert.ok(checked);
  const diagnostics = entdeckenFactsDiagnostics(ENTDECKEN_MARKET_POOL_50, checked, {
    now: checked.updatedAt,
  });
  assert.equal(diagnostics.items, 50);
  assert.equal(diagnostics.unknownOrExpired, 0);
  assert.ok(diagnostics.ok >= 35);
  assert.ok(diagnostics.rankingReady >= 35);
  assert.ok(Object.values(checked.entries).every((entry) => (
    entry.provider.id === "wikidata"
      && entry.provider.license === "CC0-1.0"
      && entry.evidenceUrls.every((url) => /^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d*$/u.test(url))
  )));
});

console.log(`${checks} Wikidata-Snapshot-Pruefungen bestanden.`);
