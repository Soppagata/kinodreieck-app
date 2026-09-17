/* P11: executable acceptance for E09-002/003, against current product modules.
   Run: TZ=Europe/Vienna node review49_p11_finder_test.mjs
   Temporary bundles stay outside node_modules; all network/AI paths are blocked. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

process.env.TZ = "Europe/Vienna";
const RealDate = Date;
let now = RealDate.parse("2026-09-06T12:00:00+02:00");
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
let networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw new Error("P11 forbids network"); };
globalThis.__P11_AI_CALLS__ = 0;
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "review49-p11-"));
const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [path.dirname(require.resolve("vite"))] }));
const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "localStorage"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom.window : dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let passed = 0;
let failed = 0;
const check = async (label, fn) => {
  try { await fn(); passed++; console.log(`PASS ${label}`); }
  catch (error) { failed++; console.error(`FAIL ${label}\n${error.stack}`); }
};
try {
  const outfile = path.join(tempDir, "product.mjs");
  await build({
    stdin: { contents: `
      export * from './src/lib/finder.js';
      export * from './src/lib/programm.js';
      export { baueKinoMatches } from './src/lib/libraryProjection.js';
      export { FinderTab, erstelleFinderAntwort, kompakteFinderTreffer } from './src/tabs/FinderTab.jsx';
    `, resolveDir: rootDir },
    outfile, bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    plugins: [{ name: "p11-offline", setup(b) {
      b.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, ({ path: name }) => ({ path: require.resolve(name), external: true }));
      b.onResolve({ filter: /services\/ai\.js$/ }, () => ({ path: "ai", namespace: "p11" }));
      b.onLoad({ filter: /.*/, namespace: "p11" }, () => ({ contents: `export const aiService = { runTask() { globalThis.__P11_AI_CALLS__++; throw new Error('P11 forbids AI'); } };` }));
    } }],
  });
  const F = await import(pathToFileURL(outfile));
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement: h, act, useState } = React;
  const masterFilm = (id, titel, jahr = 2026) => ({ id, titel, jahr, film_at_id: id, typ: "film", genre: ["drama"], quelle: "kino", kategorie: "sehenswert", bewertung: { wie: 3, was: 3, warum: 3 } });
  const rawFilm = (id, titel, days, jahr = 2026, genres = ["drama"]) => ({
    film_at_id: id, titel, jahr, genres,
    vorstellungen: days.map((day) => ({ kino: "Filmcasino", zeit: `2026-09-${String(day).padStart(2, "0")}T20:00:00+02:00` })),
  });
  const normal = (filme) => F.normalisiereProgramm({ erstellt: "2026-09-06", filme });
  const context = (master, program) => ({ master, kinoMatches: F.baueKinoMatches(program, master), streamingBekannt: { titel: [] }, streamingEntdecken: { titel: [] } });
  const answer = (text, ctx) => F.erstelleFinderAntwort({ text, ...ctx });
  const masterIds = (a) => a.treffer.map((x) => x.film.id).sort();
  const restIds = (a) => a.kino.map((x) => x.pf.film_at_id).sort();
  const compactTitles = (a) => F.kompakteFinderTreffer(a, "kino", 50).items.map((x) => x.titel).sort();
  const props = (ctx) => ({ ...ctx, mustwatchIds: new Set(), eingabe: "", setEingabe() {}, setVerlauf() {} });
  const ssr = (a, ctx) => renderToStaticMarkup(h(F.FinderTab, { ...props(ctx), verlauf: [{ id: "p11", frage: a.sig.frage, ...a }] }));
  const assertViews = (a, ctx, yes, no) => {
    assert.deepEqual(compactTitles(a), [...yes].sort());
    const html = ssr(a, ctx);
    for (const title of yes) assert.ok(html.includes(title), `SSR missing ${title}`);
    for (const title of no) assert.ok(!html.includes(title), `SSR leaked ${title}`);
  };

  const futureMaster = [masterFilm("m16", "Kupferpalast"), masterFilm("m26", "Zedernbogen")];
  const future = normal([rawFilm("m16", "Kupferpalast", [16]), rawFilm("m26", "Zedernbogen", [26])]);
  await check("E09-002: actual film.at future-only fallback excludes 16/26 today", () => {
    assert.match(future.quelle_hinweis, /außerhalb des 4-Tage-Fensters/);
    assert.equal(future.filme.length, 2);
    const ctx = context(futureMaster, future);
    assert.equal(ctx.kinoMatches.matched.length, 2);
    const a = answer("heute im Kino", ctx);
    assert.equal(a.sig.titel.length, 0);
    assert.deepEqual(masterIds(a), []);
    assertViews(a, ctx, [], futureMaster.map((f) => f.titel));
  });
  await check("E09-002: real cache re-normalization retains fallback but finder excludes it", () => {
    const cached = F.normalisiereProgramm(JSON.parse(JSON.stringify(future)));
    assert.equal(cached.filme.length, 2);
    assert.deepEqual(masterIds(answer("heute im Kino", context(futureMaster, cached))), []);
  });
  const dayMaster = [masterFilm("m6", "Bernsteinufer"), masterFilm("m7", "Samtbruecke"), masterFilm("m17", "Mondarchiv"), masterFilm("m27", "Felsenpfad")];
  const legacy = F.normalisiereProgramm({ filme: dayMaster.map((f, i) => ({ t: f.titel, j: f.jahr, film_at_id: f.id, k: ["Filmcasino"], z: [`So ${[6, 7, 17, 27][i]}.9. 20:00 · Filmcasino`] })) });
  await check("E09-002: tomorrow selects 7, excludes 17/27 in supported legacy cache", () => {
    const ctx = context(dayMaster, legacy);
    const a = answer("morgen im Kino", ctx);
    assert.deepEqual(masterIds(a), ["m7"]);
    assert.deepEqual(a.treffer[0].herkunft.kino.zeitenAlle, ["So 7.9. 20:00 · Filmcasino"]);
    assertViews(a, ctx, ["Samtbruecke"], ["Bernsteinufer", "Mondarchiv", "Felsenpfad"]);
  });
  await check("E09-002: mixed/padded exact dates expose only the requested times", () => {
    const pf = { ...legacy.filme[0], z: ["So 06.09. 19:00 · Filmcasino", "So 6.9. 21:00 · Filmcasino", "Mi 16.9. 20:00 · Filmcasino", "Sa 26.9. 20:00 · Filmcasino", "So 6.10. 20:00 · Filmcasino"] };
    const ctx = context([dayMaster[0]], { filme: [pf] });
    const a = answer("heute im Kino", ctx);
    assert.deepEqual(a.treffer[0].herkunft.kino.zeitenAlle, pf.z.slice(0, 2));
    assert.deepEqual(a.treffer[0].herkunft.kino.zeiten, pf.z.slice(0, 2));
    assert.ok(!ssr(a, ctx).includes("16.9."));
  });
  const mixedMaster = dayMaster.slice(0, 2);
  const mixed = normal([
    rawFilm("m6", "Bernsteinufer", [6]), rawFilm("m7", "Samtbruecke", [7]),
    rawFilm("r6", "Wolkengarten", [6]), rawFilm("r7", "Silberwiese", [7]), rawFilm("r8", "Kristalltor", [8]),
    rawFilm("r67", "Quellenspiegel", [6, 7, 8]),
  ]);
  const mixedCtx = context(mixedMaster, mixed);
  for (const [word, day, rest, yes, no] of [
    ["heute", "m6", ["r6", "r67"], ["Bernsteinufer", "Wolkengarten", "Quellenspiegel"], ["Samtbruecke", "Silberwiese", "Kristalltor"]],
    ["morgen", "m7", ["r7", "r67"], ["Samtbruecke", "Silberwiese", "Quellenspiegel"], ["Bernsteinufer", "Wolkengarten", "Kristalltor"]],
  ]) {
    await check(`E09-003: ${word} filters mixed master/rest before answer, SSR and compact projection`, () => {
      const a = answer(`${word} im Kino`, mixedCtx);
      assert.equal(a.sig.titel.length, 0);
      assert.deepEqual(masterIds(a), [day]);
      assert.deepEqual(restIds(a), rest.sort());
      assertViews(a, mixedCtx, yes, no);
    });
  }
  await check("E09-003: date filtering precedes rest ranking and the 15-result limit", () => {
    const rest = [
      ...Array.from({ length: 16 }, (_, i) => ({ t: `Later${i}`, j: 2026, film_at_id: `later${i}`, z: ["Mo 7.9. 20:00"] })),
      { t: "Fensterlicht", j: 1980, film_at_id: "old", z: ["So 6.9. 20:00"] },
    ];
    assert.deepEqual(F.sucheKino(F.parseAnfrage("heute im Kino", []), rest).map((x) => x.pf.film_at_id), ["old"]);
  });
  await check("E09-003: rest also uses exact date tokens in future fallback", () => {
    const ctx = context([], future);
    assert.deepEqual(restIds(answer("heute im Kino", ctx)), []);
    assertViews(answer("heute im Kino", ctx), ctx, [], futureMaster.map((f) => f.titel));
  });
  await check("Control: no time filter retains all otherwise matching films", () => {
    const a = answer("im Kino", mixedCtx);
    assert.deepEqual(restIds(a), ["r6", "r67", "r7", "r8"]);
    assert.deepEqual(masterIds(a), ["m6", "m7"]);
    assertViews(a, mixedCtx, mixed.filme.map((f) => f.t), []);
  });
  await check("Control: genre/year/decade/exclusions remain effective on rest films", () => {
    const ctx = context([], normal([
      rawFilm("drama", "Apfelhain", [6], 1984), rawFilm("horror", "Bergschatten", [6], 1984, ["horror"]),
      rawFilm("new", "Segelschiff", [6], 2026), rawFilm("late", "Traumkiesel", [7], 1984),
    ]));
    for (const text of ["Drama heute im Kino bis 1989", "Drama aus den 80ern heute im Kino", "heute im Kino bis 1989 ohne Horror"]) {
      assert.deepEqual(restIds(answer(text, ctx)), ["drama"], text);
    }
  });
  await check("Control: direct master title bypass and soft time without explicit cinema survive", () => {
    const ctx = context(futureMaster, future);
    const title = answer("Kupferpalast heute im Kino", ctx);
    assert.equal(title.sig.titel[0].id, "m16");
    assert.deepEqual(masterIds(title), ["m16"]);
    assert.match(title.treffer[0].herkunft.kino.zeitenAlle[0], /16\.9\./);
    assert.deepEqual(masterIds(answer("heute", ctx)), ["m16", "m26"]);
    assert.deepEqual(restIds(answer("Drama heute", context([], future))), ["m16", "m26"]);
    assert.deepEqual(restIds(answer("Kupferpalast", context([], future))), ["m16"]);
    const sig = { ...F.parseAnfrage("Kupferpalast", []), zeit: ["heute"], quellen: ["kino"] };
    assert.deepEqual(F.sucheKino(sig, future.filme).map((x) => x.pf.film_at_id), ["m16"]);
  });
  await check("Control: real four-day normalization and future fallback keep their contract", () => {
    const p = normal([rawFilm("today", "Tagesfenster", [6]), rawFilm("last", "Abendfenster", [9]), rawFilm("later", "Fernfenster", [10, 16])]);
    assert.deepEqual(p.filme.map((f) => f.film_at_id), ["today", "last"]);
    assert.match(p.quelle_hinweis, /heute \+ 3 Tage/);
    assert.equal(future.filme.length, 2);
  });
  await check("Calendar control: tomorrow survives DST and year rollover in both branches", () => {
    const before = now;
    try {
      for (const [instant, tomorrow, other] of [["2026-10-25T00:30:00+02:00", "26.10.", "25.10."], ["2026-12-31T12:00:00+01:00", "1.1.", "31.12."]]) {
        now = RealDate.parse(instant);
        const master = [masterFilm("right", "Tannenuhr"), masterFilm("wrong", "Sonnenuhr")];
        const p = { filme: master.map((f, i) => ({ film_at_id: f.id, t: f.titel, j: f.jahr, z: [`Mo ${i ? other : tomorrow} 20:00`] })) };
        assert.deepEqual(masterIds(answer("morgen im Kino", context(master, p))), ["right"]);
        assert.deepEqual(restIds(answer("morgen im Kino", context([], p))), ["right"]);
      }
    } finally { now = before; }
  });
  await check("Real Finder DOM: submit today/tomorrow and remove the hard time chip", async () => {
    const container = document.getElementById("root");
    const root = createRoot(container);
    let current;
    function Harness() {
      const [verlauf, setVerlauf] = useState([]);
      const [eingabe, setEingabe] = useState("heute im Kino");
      current = { verlauf, setEingabe };
      return h(F.FinderTab, { ...props(mixedCtx), verlauf, setVerlauf, eingabe, setEingabe });
    }
    const click = async (label) => {
      const button = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
      assert.ok(button, `missing button ${label}`);
      await act(async () => button.click());
    };
    try {
      await act(async () => root.render(h(Harness)));
      await click("Suchen");
      assert.deepEqual(restIds(current.verlauf[0]), ["r6", "r67"]);
      assert.ok(container.textContent.includes("Wolkengarten"));
      assert.ok(!container.textContent.includes("Silberwiese"));
      const chip = [...container.querySelectorAll("button")].find((b) => b.textContent === "Filter · heute ×");
      assert.ok(chip);
      assert.match(chip.title, /Harter Filter/);
      await act(async () => chip.click());
      assert.deepEqual(restIds(current.verlauf[0]), ["r6", "r67", "r7", "r8"]);
      await click("Neue Suche");
      await act(async () => current.setEingabe("morgen im Kino"));
      await click("Suchen");
      assert.deepEqual(restIds(current.verlauf[0]), ["r67", "r7"]);
      assert.ok(container.textContent.includes("Silberwiese"));
      assert.ok(!container.textContent.includes("Wolkengarten"));
    } finally { await act(async () => root.unmount()); }
  });
  await check("No network or provider requests", () => {
    assert.equal(networkCalls, 0);
    assert.equal(globalThis.__P11_AI_CALLS__, 0);
  });
} finally {
  globalThis.Date = RealDate;
  dom.window.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}
console.log(`P11: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
