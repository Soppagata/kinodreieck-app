import assert from "node:assert/strict";
import {
  FLIXPATROL_CONTEXT_AT_CHARTS,
  baueFlixpatrolProfilHinweise,
  createFlixpatrolFactsContextReader,
  findeFlixpatrolKontextFakt,
  normalisiereFlixpatrolKontextTitel,
  projiziereFlixpatrolKontext,
} from "./supabase/functions/_shared/flixpatrolFactsContext.js";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const alienId = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
const duneId = "ttl_K5H0Bes9dtvkV710raDBpXoK";
const titleRows = [{
  sourceId: alienId,
  mediaType: "film",
  status: "resolved",
  title: "Alien",
  releaseYear: 1979,
  imdbId: "0078748",
  tmdbId: "348",
  description: "Ein neutrales Werkporträt.",
  runtimeMinutes: 117,
  premiere: "1979-05-25",
  checkedAt: "2026-09-09T11:00:00.000Z",
  freshUntil: "2026-09-10T11:00:00.000Z",
  fresh: true,
  sourceUrl: "https://flixpatrol.com/title/alien/",
}, {
  sourceId: duneId,
  mediaType: "film",
  status: "resolved",
  title: "Dune",
  releaseYear: 2021,
  imdbId: "1160419",
  tmdbId: "438631",
  description: "Ein zweites neutrales Werkporträt.",
  runtimeMinutes: 155,
  premiere: "2021-09-15",
  checkedAt: "2026-09-09T11:00:00.000Z",
  fresh: false,
  sourceUrl: "https://flixpatrol.com/title/dune-2021/",
}];

function chart(spec, ids) {
  return { ok: true, chart: { ...spec, items: ids.map((sourceId, index) => ({
    sourceId,
    ranking: index + 1,
    mediaType: sourceId === alienId ? "series" : "film",
  })) } };
}

await check("fünf feste AT-Charts führen zu genau einem gebündelten Titelread", async () => {
  const calls = [];
  const reader = createFlixpatrolFactsContextReader({
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "kd_flixpatrol_chart_read") {
        const spec = FLIXPATROL_CONTEXT_AT_CHARTS.find((item) => item.companyId === args.p_company_id
          && item.countryId === args.p_country_id && item.chartType === args.p_chart_type);
        const position = calls.filter((call) => call.name === name).length;
        return chart(spec, position === 1 ? [alienId, duneId] : []);
      }
      return { ok: true, items: titleRows };
    },
  });
  const facts = await reader.load();
  assert.equal(calls.filter((call) => call.name === "kd_flixpatrol_chart_read").length, 5);
  assert.equal(calls.filter((call) => call.name === "kd_flixpatrol_titles_read").length, 1);
  assert.deepEqual(calls.at(-1).args.p_source_ids, [alienId, duneId]);
  assert.equal(facts[0].typ, "film");
  assert.equal(Object.hasOwn(facts[0], "ranking"), false);
  assert.equal(Object.hasOwn(facts[0], "genreId"), false);
});

await check("belegte FlixPatrol-ID nutzt nur den direkten Titelread", async () => {
  const calls = [];
  const reader = createFlixpatrolFactsContextReader({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { ok: true, items: titleRows };
    },
  });
  const fact = await reader.find({ titel: "Alien", jahr: 1979, typ: "film", flixpatrol_id: alienId });
  assert.equal(fact.sourceId, alienId);
  assert.deepEqual(calls.map((call) => call.name), ["kd_flixpatrol_titles_read"]);
  assert.deepEqual(calls[0].args.p_source_ids, [alienId]);
});

await check("ID-Konflikt, Remake und fehlender Typ bleiben ohne Kontext", () => {
  const facts = normalisiereFlixpatrolKontextTitel(titleRows);
  assert.equal(findeFlixpatrolKontextFakt({ titel: "Alien", jahr: 1979, typ: "film", imdb_id: "tt9999999" }, facts), null);
  assert.equal(findeFlixpatrolKontextFakt({ titel: "Dune", jahr: 1984, typ: "film" }, facts), null);
  assert.equal(findeFlixpatrolKontextFakt({ titel: "Alien", jahr: 1979 }, facts), null);
});

await check("Forecast-Projektion enthält neutrale Fakten, aber keinen Chart- oder Geschmackswert", () => {
  const [fact] = normalisiereFlixpatrolKontextTitel(titleRows);
  const context = projiziereFlixpatrolKontext(fact);
  assert.equal(context.identity.mediaType, "film");
  assert.equal(context.description, "Ein neutrales Werkporträt.");
  assert.equal(context.runtimeMinutes, 117);
  assert.equal(Object.hasOwn(context, "charts"), false);
  assert.equal(Object.hasOwn(context, "ranking"), false);
  assert.equal(Object.hasOwn(context, "taste"), false);
});

await check("jahr- oder typfreie Profilnennung erhält nur klar getrennte mögliche Werke", () => {
  const facts = normalisiereFlixpatrolKontextTitel(titleRows);
  const hints = baueFlixpatrolProfilHinweise([
    { titel: "Alien", jahr: null },
    { titel: "Dune", jahr: 1984, typ: "film" },
  ], facts);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].filmIndex, 0);
  assert.equal(hints[0].candidates[0].flixpatrolId, alienId);
  assert.equal(Object.hasOwn(hints[0].candidates[0], "sicher"), false);
});

await check("RPC-Fehler und Lesetimeout fallen leer aus und starten keinen Ersatz", async () => {
  let errorCalls = 0;
  const failed = createFlixpatrolFactsContextReader({ rpc: async () => {
    errorCalls += 1;
    throw new Error("cache-down");
  } });
  assert.deepEqual(await failed.load(), []);
  assert.ok(errorCalls >= 1 && errorCalls <= 5);

  let timeoutCalls = 0;
  const timed = createFlixpatrolFactsContextReader({
    timeoutMs: 5,
    rpc: async () => {
      timeoutCalls += 1;
      return await new Promise(() => {});
    },
  });
  assert.deepEqual(await timed.load(), []);
  assert.equal(timeoutCalls, 5);
});

console.log(`flixpatrol_ai_context_test: ${checks} Checks bestanden.`);
