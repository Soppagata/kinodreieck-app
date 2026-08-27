import assert from "node:assert/strict";
import {
  createWikidataResolver,
  wikidataTitleFingerprint,
  WIKIDATA_RESOLVER_VERSION,
} from "./supabase/functions/entdecken-daily-task/wikidataResolver.js";

let checks = 0;
async function check(name, test) {
  await test(); checks += 1; console.log(`✓ ${name}`);
}
const items = Object.freeze([
  Object.freeze({ sourceItemId: "f_belegter-film", title: "Belegter Film", mediaType: "film" }),
  Object.freeze({ sourceItemId: "s_nicht-vorhanden", title: "Nicht vorhanden", mediaType: "series" }),
  Object.freeze({ sourceItemId: "f_spaeterer-film", title: "Spaeterer Film", mediaType: "film" }),
]);
const itemClaim = (qid) => ({
  rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: { id: qid } } },
});
const stringClaim = (value) => ({
  rank: "normal", mainsnak: { snaktype: "value", datavalue: { value } },
});
const timeClaim = (year) => ({
  rank: "normal", mainsnak: { snaktype: "value", datavalue: { value: { time: `+${year}-01-01T00:00:00Z` } } },
});
const filmEntity = (qid, title) => ({
  id: qid, type: "item", lastrevid: 123,
  labels: { de: { language: "de", value: title } }, aliases: {},
  claims: {
    P31: [itemClaim("Q11424")], P577: [timeClaim(2024)], P345: [stringClaim("tt1234567")],
  },
});

await check("Positiver und negativer Cache verhindern jeden bekannten Request", async () => {
  let calls = 0;
  const resolver = createWikidataResolver({
    fetchImpl: async () => { calls += 1; throw new Error("bekannter Titel darf nicht ins Netz"); },
    loadCache: async () => [{
      sourceItemId: "f_belegter-film", titleFingerprint: wikidataTitleFingerprint(items[0]), mediaType: "film",
      resolverVersion: WIKIDATA_RESOLVER_VERSION, status: "resolved",
      facts: { qid: "Q1", mediaType: "film", releaseYear: 2024, externalIds: { imdb: "tt1234567" }, resolvedAt: "2026-08-27T02:00:00.000Z" },
    }, {
      sourceItemId: "s_nicht-vorhanden", titleFingerprint: wikidataTitleFingerprint(items[1]), mediaType: "series",
      resolverVersion: WIKIDATA_RESOLVER_VERSION, status: "not_found", facts: null,
    }],
  });
  const result = await resolver.resolve(items.slice(0, 2));
  assert.equal(calls, 0);
  assert.equal(result.length, 1);
  assert.deepEqual(resolver.telemetry(), {
    requests: 0, cacheHits: 1, negativeHits: 1, resolved: 0, stopped: false,
  });
});

await check("Unbekannte Titel laufen seriell, werden sofort gecacht und liefern nur Fakten", async () => {
  const saved = [];
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const resolver = createWikidataResolver({
    now: () => "2026-08-27T03:17:00.000Z",
    serialPauseMs: 0,
    loadCache: async () => [],
    saveCache: async (row) => { saved.push(structuredClone(row)); },
    fetchImpl: async (rawUrl, init) => {
      active += 1; maxActive = Math.max(maxActive, active);
      const url = new URL(rawUrl);
      calls.push({ action: url.searchParams.get("action"), search: url.searchParams.get("search"), init, url });
      assert.equal(url.hostname, "www.wikidata.org");
      assert.equal(url.searchParams.get("maxlag"), "1");
      assert.equal(url.searchParams.get("formatversion"), "2");
      assert.match(init.headers["Api-User-Agent"], /Kinodreieck/);
      let payload;
      if (url.searchParams.get("action") === "wbsearchentities") {
        payload = url.searchParams.get("search") === "Belegter Film"
          ? { search: [{ id: "Q123", label: "Belegter Film", match: { text: "Belegter Film" } }] }
          : { search: [] };
      } else {
        payload = { entities: { Q123: filmEntity("Q123", "Belegter Film") } };
      }
      active -= 1;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const result = await resolver.resolve(items.slice(0, 2));
  assert.equal(maxActive, 1);
  assert.deepEqual(calls.map((call) => call.action), ["wbsearchentities", "wbgetentities", "wbsearchentities"]);
  assert.deepEqual(saved.map((row) => row.status), ["resolved", "not_found"]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    sourceItemId: "f_belegter-film", qid: "Q123", mediaType: "film", releaseYear: 2024,
    externalIds: { imdb: "tt1234567" }, resolvedAt: "2026-08-27T03:17:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(saved), /description|image|raw/i);
  assert.deepEqual(resolver.telemetry(), {
    requests: 3, cacheHits: 0, negativeHits: 0, resolved: 1, stopped: false,
  });
});

await check("429 beendet nur die serielle Anreicherung ohne Retry oder Negativcache", async () => {
  let calls = 0;
  const saved = [];
  const resolver = createWikidataResolver({
    serialPauseMs: 0,
    loadCache: async () => [],
    saveCache: async (row) => saved.push(row),
    fetchImpl: async () => { calls += 1; return new Response("rate limited", { status: 429 }); },
  });
  assert.deepEqual(await resolver.resolve(items), []);
  assert.equal(calls, 1);
  assert.deepEqual(saved, []);
  assert.equal(resolver.telemetry().stopped, true);
  assert.equal(resolver.telemetry().stopReason, "wikidata_rate_limited");
});

await check("maxlag ist transient und wird niemals als not_found gespeichert", async () => {
  let calls = 0;
  const saved = [];
  const resolver = createWikidataResolver({
    serialPauseMs: 0,
    loadCache: async () => [], saveCache: async (row) => saved.push(row),
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { code: "maxlag" } }), { status: 200 });
    },
  });
  await resolver.resolve(items);
  assert.equal(calls, 1);
  assert.deepEqual(saved, []);
  assert.equal(resolver.telemetry().stopReason, "wikidata_maxlag");
});

console.log(`\n${checks}/${checks} Wikidata-Resolverchecks bestanden.`);
