import assert from "node:assert/strict";
import { createFlixPatrolClient, FlixPatrolClientError } from "./supabase/functions/_shared/flixpatrolClient.js";

let checks = 0;
async function check(name, fn) { await fn(); checks += 1; console.log(`✓ ${name}`); }

const alien = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
const dune = "ttl_K5H0Bes9dtvkV710raDBpXoK";
const genreA = "gnr_vkhlVlz6xabS78vHh0DCIc5e";
const genreB = "gnr_AbCdEfGhIjKlMnOpQrStUvWx";
const keyword = "kwd_NLPueMUHlNqj02pZEBFyWIhu";
const relation = (type, id) => ({ type, data: { id } });
const title = (id, mediaType, name) => ({ type: "titles", data: {
  id, title: name, premiere: mediaType === "film" ? "1979-05-25" : "2021-01-01",
  country: null, company: null, genre: relation("genres", genreA), keyword: relation("keywords", keyword),
  description: null, updatedAt: "2026-09-11T10:00:00", link: `https://flixpatrol.com/title/${name.toLowerCase()}/`,
  type: mediaType === "film" ? 1 : 2, premiereOnline: null, length: 0,
  imdbId: mediaType === "film" ? 78748 : 1160419, tmdbId: mediaType === "film" ? 348 : 438631,
} });
const list = (items) => ({ type: "list", data: items });

function clientFor(payload, events = []) {
  return createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => "10000000-0000-4000-8000-000000000001",
    beginOperation: async (input) => { events.push(["begin", input]); return { ok: true, claim: true, replay: false }; },
    fetchImpl: async (url, init) => { events.push(["fetch", url, init]); return { ok: true, status: 200, json: async () => payload }; },
    finishOperation: async (input) => { events.push(["finish", input]); return { ok: true, replay: false, status: input.status, usage: {} }; },
    diagnosticLogger: () => {},
  });
}

await check("Titelbatch nutzt id[in], zählt einmal und ordnet exakt in Anfragefolge", async () => {
  const events = [];
  const result = await clientFor(list([title(dune, "series", "Dune"), title(alien, "film", "Alien")]), events)
    .fetchTitles({ sourceIds: [alien, dune], mediaTypes: ["film", "series"] });
  assert.deepEqual(result.items.map((item) => item.sourceId), [alien, dune]);
  assert.equal(result.providerRequests, 1);
  assert.deepEqual(events.map(([kind]) => kind), ["begin", "fetch", "finish"]);
  assert.equal(events[0][1].requestKind, "titles");
  const url = new URL(events[1][1]);
  assert.equal(url.pathname, "/v2/titles");
  assert.equal(url.searchParams.get("id[in]"), `${alien},${dune}`);
  assert.equal(events[1][2].redirect, "error");
});

for (const [name, payload] of [
  ["Teilmenge", list([title(alien, "film", "Alien")])],
  ["Zusatz-ID", list([title(alien, "film", "Alien"), title("ttl_ExtraIdentity1234567890123", "series", "Extra")])],
  ["Typkonflikt", list([title(alien, "series", "Alien"), title(dune, "series", "Dune")])],
  ["Doppel-ID", list([title(alien, "film", "Alien"), title(alien, "film", "Alien")])],
]) {
  await check(`${name} wird nach genau einem gezählten Batchrequest verworfen`, async () => {
    const events = [];
    await assert.rejects(
      clientFor(payload, events).fetchTitles({ sourceIds: [alien, dune], mediaTypes: ["film", "series"] }),
      (error) => error instanceof FlixPatrolClientError && error.code === "FLIXPATROL_INVALID_RESPONSE"
        && error.providerRequests === 1,
    );
    assert.equal(events.filter(([kind]) => kind === "fetch").length, 1);
    assert.equal(events.filter(([kind]) => kind === "finish").length, 1);
    assert.equal(events.at(-1)[1].status, "invalid_response");
  });
}

await check("Genres und Keywords verwenden eigene gezählte Ledger-Typen und exakte ID-Mengen", async () => {
  const events = [];
  let uuid = 1;
  const client = createFlixPatrolClient({
    apiKey: "secret",
    randomUUID: () => `20000000-0000-4000-8000-${String(uuid++).padStart(12, "0")}`,
    beginOperation: async (input) => { events.push(["begin", input]); return { ok: true, claim: true, replay: false }; },
    fetchImpl: async (url, init) => {
      events.push(["fetch", url, init]);
      const path = new URL(url).pathname;
      const payload = path.endsWith("/genres")
        ? list([{ type: "genres", data: { id: genreB, name: "Drama", type: 2 } }, { type: "genres", data: { id: genreA, name: "Science Fiction", type: 1 } }])
        : list([{ type: "keywords", data: { id: keyword, name: "space" } }]);
      return { ok: true, status: 200, json: async () => payload };
    },
    finishOperation: async (input) => { events.push(["finish", input]); return { ok: true, replay: false, status: input.status, usage: {} }; },
  });
  const genres = await client.fetchGenres({ sourceIds: [genreA, genreB] });
  const keywords = await client.fetchKeywords({ sourceIds: [keyword] });
  assert.deepEqual(genres.items.map((item) => [item.sourceId, item.mediaType]), [[genreA, "film"], [genreB, "series"]]);
  assert.deepEqual(keywords.items, [{ sourceId: keyword, name: "space", mediaType: null, providerType: null }]);
  assert.deepEqual(events.filter(([kind]) => kind === "begin").map(([, input]) => input.requestKind), ["genres", "keywords"]);
  assert.equal(events.filter(([kind]) => kind === "fetch").length, 2);
});

await check("Ungültige oder zu große Mengen stoppen vor Ledger und Provider", async () => {
  let begins = 0;
  let fetches = 0;
  const client = createFlixPatrolClient({
    apiKey: "secret",
    beginOperation: async () => { begins += 1; }, finishOperation: async () => {}, fetchImpl: async () => { fetches += 1; },
  });
  await assert.rejects(client.fetchTitles({ sourceIds: [alien, alien], mediaTypes: ["film", "film"] }), /FLIXPATROL_REQUEST_INVALID/);
  await assert.rejects(client.fetchGenres({ sourceIds: Array.from({ length: 11 }, (_, index) => `gnr_${String(index).padStart(24, "A")}`) }), /FLIXPATROL_REQUEST_INVALID/);
  await assert.rejects(client.fetchKeywords({ sourceIds: [genreA] }), /FLIXPATROL_REQUEST_INVALID/);
  assert.deepEqual([begins, fetches], [0, 0]);
});

console.log(`data_plan_foundation_client_test: ${checks} Checks bestanden.`);
