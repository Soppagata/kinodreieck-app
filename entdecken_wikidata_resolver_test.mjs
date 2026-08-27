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
const now = "2026-08-27T03:17:00.000Z";
const items = Object.freeze([
  Object.freeze({ sourceItemId: "f_belegter-film", title: "Belegter Film", mediaType: "film" }),
  Object.freeze({ sourceItemId: "s_nicht-vorhanden", title: "Nicht vorhanden", mediaType: "series" }),
  Object.freeze({ sourceItemId: "f_mehrdeutig", title: "Revenge", mediaType: "film" }),
]);
const statement = (content) => ({ rank: "normal", value: { type: "value", content } });
const searchHit = (id, title) => ({
  id,
  "display-label": { language: "de", value: title },
  description: { language: "de", value: "nicht gespeichert" },
  match: { type: "label", language: "de", text: title },
});
const filmEntity = (qid, title) => ({
  id: qid,
  type: "item",
  labels: { de: title, en: title },
  aliases: { de: [], en: [] },
  descriptions: { de: "wird nicht gespeichert" },
  statements: {
    P31: [statement("Q11424")],
    P577: [statement({ time: "+2024-01-01T00:00:00Z", precision: 11 })],
    P345: [statement("tt1234567")],
    P4947: [statement("7654321")],
  },
});

await check("Positiver und frischer negativer Cache verhindern bekannte Requests", async () => {
  let calls = 0;
  const resolver = createWikidataResolver({
    now: () => now,
    fetchImpl: async () => { calls += 1; throw new Error("bekannter Titel darf nicht ins Netz"); },
    loadCache: async () => [{
      sourceItemId: items[0].sourceItemId,
      titleFingerprint: wikidataTitleFingerprint(items[0]),
      mediaType: "film", resolverVersion: WIKIDATA_RESOLVER_VERSION, status: "resolved", checkedAt: now,
      facts: {
        qid: "Q1", mediaType: "film", releaseYear: 2024,
        externalIds: { imdb: "tt1234567" }, resolvedAt: now,
      },
    }, {
      sourceItemId: items[1].sourceItemId,
      titleFingerprint: wikidataTitleFingerprint(items[1]),
      mediaType: "series", resolverVersion: WIKIDATA_RESOLVER_VERSION,
      status: "not_found", facts: null, checkedAt: "2026-08-01T03:17:00.000Z",
    }],
  });
  const result = await resolver.resolve(items.slice(0, 2));
  assert.equal(calls, 0);
  assert.equal(result.length, 1);
  assert.deepEqual(resolver.telemetry(), {
    requests: 0, cacheHits: 1, negativeHits: 1, resolved: 0, stopped: false,
  });
});

await check("REST-v1-Suche und Entity laufen seriell und cachen nur eindeutige Fakten", async () => {
  const saved = [];
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const resolver = createWikidataResolver({
    now: () => now, serialPauseMs: 0, loadCache: async () => [],
    saveCache: async (row) => saved.push(structuredClone(row)),
    fetchImpl: async (rawUrl, init) => {
      active += 1; maxActive = Math.max(maxActive, active);
      const url = new URL(rawUrl);
      calls.push({ pathname: url.pathname, query: url.searchParams.get("q"), init });
      assert.equal(url.hostname, "www.wikidata.org");
      assert.equal(url.searchParams.has("maxlag"), false);
      assert.match(init.headers["User-Agent"], /Kinodreieck/);
      const payload = url.pathname.endsWith("/search/items")
        ? { results: url.searchParams.get("q") === items[0].title ? [searchHit("Q123", items[0].title)] : [] }
        : filmEntity("Q123", items[0].title);
      active -= 1;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const result = await resolver.resolve(items.slice(0, 2));
  assert.equal(maxActive, 1);
  assert.deepEqual(calls.map((call) => call.pathname.endsWith("/search/items") ? "search" : "entity"), [
    "search", "entity", "search",
  ]);
  assert.deepEqual(saved.map((row) => row.status), ["resolved", "not_found"]);
  assert.deepEqual(result, [{
    sourceItemId: items[0].sourceItemId, qid: "Q123", mediaType: "film", releaseYear: 2024,
    externalIds: { imdb: "tt1234567", tmdb: "7654321" }, resolvedAt: now,
  }]);
  assert.doesNotMatch(JSON.stringify(saved), /description|image|raw/i);
  assert.deepEqual(resolver.telemetry(), {
    requests: 3, cacheHits: 0, negativeHits: 0, resolved: 1, stopped: false,
  });
});

await check("Mehrere exakte QIDs werden ohne Entity-Raten negativ gecacht", async () => {
  const saved = [];
  let calls = 0;
  const resolver = createWikidataResolver({
    now: () => now, serialPauseMs: 0, loadCache: async () => [],
    saveCache: async (row) => saved.push(row),
    fetchImpl: async (rawUrl) => {
      calls += 1;
      assert.ok(new URL(rawUrl).pathname.endsWith("/search/items"));
      return new Response(JSON.stringify({ results: [
        searchHit("Q10", items[2].title), searchHit("Q11", items[2].title),
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.deepEqual(await resolver.resolve(items.slice(2)), []);
  assert.equal(calls, 1);
  assert.equal(saved[0].status, "ambiguous_blocked");
  assert.equal(saved[0].facts, null);
});

await check("Eindeutige, aber unvollstaendige Entity bleibt ohne Annotation", async () => {
  const saved = [];
  const resolver = createWikidataResolver({
    now: () => now, serialPauseMs: 0, loadCache: async () => [], saveCache: async (row) => saved.push(row),
    fetchImpl: async (rawUrl) => new Response(JSON.stringify(
      new URL(rawUrl).pathname.endsWith("/search/items")
        ? { results: [searchHit("Q20", items[1].title)] }
        : { id: "Q20", type: "item", labels: { de: items[1].title }, aliases: {}, statements: { P31: [statement("Q15416")] } },
    ), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.deepEqual(await resolver.resolve(items.slice(1, 2)), []);
  assert.equal(saved[0].status, "incomplete_blocked");
});

await check("429 beendet seriell ohne Retry oder Negativcache", async () => {
  let calls = 0;
  const saved = [];
  const resolver = createWikidataResolver({
    now: () => now, serialPauseMs: 0, loadCache: async () => [],
    saveCache: async (row) => saved.push(row),
    fetchImpl: async () => { calls += 1; return new Response("rate limited", { status: 429 }); },
  });
  assert.deepEqual(await resolver.resolve(items), []);
  assert.equal(calls, 1);
  assert.deepEqual(saved, []);
  assert.equal(resolver.telemetry().stopReason, "wikidata_rate_limited");
});

console.log(`\n${checks}/${checks} Wikidata-REST-Resolverchecks bestanden.`);
