/* Fokussierter Nutzerweg fuer Streaming-Pins und den lokalen Vollkatalog-Diff.
   Rein lokal: keine Datenbank, kein Provider, keine KI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  aktualisiereStreamingNeuSnapshot,
  parseStreamingNeuSnapshot,
  streamingNeuIds,
  streamingNeuStorageKey,
} from "./src/lib/streamingNeu.js";
import { toggleEntdeckenPin } from "./src/lib/entdeckenPins.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };

const ownerA = "account:00000000-0000-4000-8000-0000000000aa";
const ownerB = "account:00000000-0000-4000-8000-0000000000bb";
const titel = (id, name, dienst = "Netflix") => ({
  watchmode_id: id, titel: name, jahr: 2024, typ: "movie", genres: ["Drama"], dienste: [dienst],
});

const erster = aktualisiereStreamingNeuSnapshot(null, {
  owner: ownerA, runId: "2026-09-06T08:00:00Z",
  titel: [titel(1, "Bekannt"), titel(2, "Entdeckung")],
});
check("Erster vollständiger Stand befüllt Neu initial mit dem ganzen Katalog", () => {
  assert.equal(erster.geaendert, true);
  assert.equal(erster.snapshot.neueIds, null);
  assert.deepEqual(streamingNeuIds(erster.snapshot), [1, 2]);
});

const reload = parseStreamingNeuSnapshot(JSON.stringify(erster.snapshot), ownerA);
check("Reload liest denselben ownergebundenen Ausgangsstand", () => {
  assert.deepEqual(reload, erster.snapshot);
  assert.equal(parseStreamingNeuSnapshot(JSON.stringify(erster.snapshot), ownerB), null);
  assert.notEqual(streamingNeuStorageKey(ownerA), streamingNeuStorageKey(ownerB));
});

const nurGefilterterRender = aktualisiereStreamingNeuSnapshot(reload, {
  owner: ownerA, runId: "2026-09-06T08:00:00Z", titel: [titel(2, "Entdeckung")],
});
check("Derselbe Run bleibt trotz anderer Filter-/Render-Menge unverändert", () => {
  assert.equal(nurGefilterterRender.geaendert, false);
  assert.deepEqual(nurGefilterterRender.snapshot.ids, [1, 2]);
  assert.deepEqual(streamingNeuIds(nurGefilterterRender.snapshot), [1, 2]);
});

const folgerun = aktualisiereStreamingNeuSnapshot(reload, {
  owner: ownerA, runId: "2026-09-07T08:00:00Z",
  titel: [titel(2, "Entdeckung"), titel(3, "Wirklich neu", "MUBI")],
});
check("Ein neuer Vollstand zeigt ausschließlich den Diff zum unmittelbaren Vorgänger", () => {
  assert.deepEqual(folgerun.snapshot.ids, [2, 3]);
  assert.deepEqual(folgerun.snapshot.neueIds, [3]);
  assert.deepEqual(streamingNeuIds(parseStreamingNeuSnapshot(JSON.stringify(folgerun.snapshot), ownerA)), [3]);
});

const wurzel = path.dirname(fileURLToPath(import.meta.url));
async function ladeEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}
const ausgabeDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-streaming-pin-neu-test-"));
const ausgabe = path.join(ausgabeDir, "bundle.mjs");
fs.symlinkSync(path.join(wurzel, "node_modules"), path.join(ausgabeDir, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(ausgabeDir, { recursive: true, force: true }));
const esbuild = await ladeEsbuild();
await esbuild.build({
  stdin: {
    contents: [
      'export { StreamingTab } from "./src/tabs/StreamingTab.jsx";',
      'export { StartTab } from "./src/tabs/StartTab.jsx";',
    ].join("\n"),
    loader: "js", resolveDir: wurzel,
  },
  bundle: true, format: "esm", outfile: ausgabe, jsx: "automatic", target: "es2022",
  logLevel: "warning", external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of [
  "window", "document", "navigator", "HTMLElement", "Element", "Event", "MouseEvent", "Node", "NodeList",
  "getComputedStyle", "localStorage",
]) Object.defineProperty(globalThis, name, {
  value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { StreamingTab, StartTab } = await import(ausgabe);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(Component, props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (next) => act(async () => { root.render(h(Component, next)); await tick(); });
  await render(props);
  return { container, render, async cleanup() { await act(async () => root.unmount()); container.remove(); } };
}

const bekannt = {
  stand: "2026-09-06T08:00:00Z", dienste: ["Netflix"], katalogMengen: { umfang: "voll" },
  titel: [{ ...titel(1, "Bekannt"), id: "bekannt-master", bewertung: null, quelle: "streaming", typ: "film" }],
};
const entdecken = {
  stand: "2026-09-06T08:00:00Z", dienste: ["Netflix", "MUBI"], katalogMengen: { umfang: "voll" },
  titel: [titel(2, "Entdeckung"), titel(3, "Nur MUBI", "MUBI")],
};
let letzterToggle = null;
let vollLadungen = 0;
const basisProps = {
  bekannt, entdecken, auswahl: ["Netflix"], merkliste: [], toggleMerk() {},
  master: bekannt.titel, mustwatchIds: new Set(), entdeckenStatus: {},
  schreibeEntdeckenStatus: async () => true,
  onAllesKatalogLaden() { vollLadungen++; },
  recommendationPins: [], onRecommendationPinToggle(entry) { letzterToggle = entry; },
  streamingNeu: { status: "ready", runId: "2026-09-06T08:00:00Z", neueIds: [1, 2, 3], initial: true },
};
const ui = await mount(StreamingTab, basisProps);
const pin = (name, action = "anpinnen") => ui.container.querySelector(`button[aria-label="${name} ${action === "lösen" ? "vom Pinboard lösen" : "am Pinboard anpinnen"}"]`);

await act(async () => { pin("Bekannt").click(); await tick(); });
const gesetztePins = toggleEntdeckenPin([], letzterToggle, 1234);
await ui.render({ ...basisProps, recommendationPins: gesetztePins });
check("Jeder Titel in Mein Programm lässt sich über den bestehenden Pin-Mechanismus pinnen und entpinnen", () => {
  assert.equal(letzterToggle.watchmode_id, 1);
  assert.equal(pin("Bekannt", "lösen")?.getAttribute("aria-pressed"), "true");
});
await act(async () => { pin("Bekannt", "lösen").click(); await tick(); });
check("Der gedrückte Streaming-Pin ruft zum Entpinnen dieselbe stabile Titelidentität auf", () => {
  assert.equal(letzterToggle.watchmode_id, 1);
});

const allesKnopf = [...ui.container.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith("Alles"));
await act(async () => { allesKnopf.click(); await tick(); await tick(); });
check("Auch jede Karte in Alles besitzt denselben Pin-Button", () => {
  assert.ok(pin("Entdeckung"));
  assert.equal(vollLadungen, 1);
});

const neuKnopf = [...ui.container.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith("Neu"));
await act(async () => { neuKnopf.click(); await tick(); await tick(); });
check("Neu nutzt den vollständigen Initialbestand, die Dienstewahl und dieselben Pin-Karten", () => {
  assert.match(ui.container.textContent, /Erster vollständiger Katalogstand/u);
  assert.match(ui.container.textContent, /Bekannt/u);
  assert.match(ui.container.textContent, /Entdeckung/u);
  assert.doesNotMatch(ui.container.textContent, /Nur MUBI/u);
  assert.ok((pin("Bekannt") || pin("Bekannt", "lösen")) && pin("Entdeckung"));
  assert.equal(vollLadungen, 2);
});

let dashboardSprung = null;
const dashboard = await mount(StartTab, {
  entdeckenPins: gesetztePins, streamingBekannt: bekannt, streamingEntdecken: entdecken,
  webDiscoveryFeed: null, progStand: Date.now(), kinoMatches: { matched: [], rest: [] },
  wochenplan: { version: 1, eintraege: [] }, onWochenplanAendern() {},
  onSpringeZuStreaming(target) { dashboardSprung = target; }, onEntdeckenPinsBereinigen() {},
});
const dashboardPin = dashboard.container.querySelector(".kd-pinboard-titel");
await act(async () => { dashboardPin.click(); await tick(); });
check("Ein Streaming-Pin erscheint zuverlässig im bestehenden Dashboard-Pinboard", () => {
  assert.match(dashboardPin.textContent, /Bekannt/u);
  assert.equal(dashboardSprung?.ref, 1);
  assert.equal(dashboardSprung?.art, "programm");
});

await dashboard.cleanup();
await ui.cleanup();
console.log(`\nSTREAMING-PIN-NEU-TEST BESTANDEN (${checks}/${checks})`);
