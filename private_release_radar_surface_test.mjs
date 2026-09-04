import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build, stop } from "esbuild";
import { JSDOM } from "jsdom";

const entdeckenSource = readFileSync("src/tabs/EntdeckenTab.jsx", "utf8");
const previewSource = readFileSync("src/components/RadarSubscriptionPreview.jsx", "utf8");
let checks = 0;
function check(name, callback) {
  callback();
  checks += 1;
  console.log(`✓ ${name}`);
}

check("Release-Oberfläche enthält weder anonymes Teilen noch ein Share-Control", () => {
  assert.doesNotMatch(entdeckenSource, /onShareChange|Anonym teilen|Nicht mehr teilen|radarState\?\.shares/);
  assert.doesNotMatch(previewSource, /kd-entdecken-share|shareAllowed|setShareEnabled|Von anderen entdeckt|Opt-in/);
  assert.match(previewSource, /onConfirm\?\.\(target, \{ shareEnabled: false \}\)/);
});

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "https://staging.kinodreieck.test/",
});
for (const name of [
  "window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement",
  "Element", "Event", "MouseEvent", "KeyboardEvent", "Node", "NodeList", "getComputedStyle",
  "localStorage", "Storage",
]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
dom.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
dom.window.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cacheDir = path.join(process.cwd(), ".tmp");
mkdirSync(cacheDir, { recursive: true });
const outputDir = mkdtempSync(path.join(cacheDir, "private-release-radar-surface-"));
const output = path.join(outputDir, "bundle.mjs");
process.once("exit", () => rmSync(outputDir, { recursive: true, force: true }));
await build({
  stdin: {
    contents: [
      'export { default as React, act } from "react";',
      'export { createRoot } from "react-dom/client";',
      'export { EntdeckenTab } from "./src/tabs/EntdeckenTab.jsx";',
      'export { RadarSubscriptionPreview } from "./src/components/RadarSubscriptionPreview.jsx";',
    ].join("\n"),
    sourcefile: "private-release-radar-surface-entry.jsx",
    resolveDir: process.cwd(),
    loader: "jsx",
  },
  bundle: true,
  outfile: output,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  define: { "import.meta.env.BASE_URL": '"/"' },
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
});
const { React, act, createRoot, EntdeckenTab, RadarSubscriptionPreview } = await import(
  pathToFileURL(output).href
);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const button = (root, label) => [...root.querySelectorAll("button")]
  .find((entry) => entry.textContent.trim() === label);
async function mount(Component, props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Component, props)); await tick(); });
  return {
    container,
    async cleanup() {
      await act(async () => { root.unmount(); await tick(); });
      container.remove();
    },
  };
}
async function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await tick();
  });
}

const activeTarget = {
  targetId: "watchmode:91", targetType: "work", targetStatus: "active",
  title: "Passender Film", canonical: true, status: "active", authority: "server",
};
const inactiveState = { subscriptions: [], personSubscriptions: [], shares: [], outbox: [] };
let inactiveConfirmation = null;
const inactivePreview = await mount(RadarSubscriptionPreview, {
  target: activeTarget,
  radarState: inactiveState,
  accountMode: true,
  accountActive: true,
  onConfirm: async (...args) => { inactiveConfirmation = args; return true; },
  onClose() {},
});
check("Neue Ziele verwenden genau den privaten Release-Wortlaut", () => {
  const dialog = document.querySelector(".kd-radar-preview");
  assert.equal(dialog.querySelector("h2").textContent, "Ins Radar aufnehmen");
  assert.ok(button(dialog, "Ins Radar aufnehmen"));
  assert.equal(dialog.querySelector('input[type="checkbox"]'), null);
  assert.match(dialog.textContent, /Das Ziel bleibt privat/);
  assert.doesNotMatch(dialog.textContent, /anonym|teilen|Von anderen entdeckt/i);
});
await act(async () => { button(document, "Ins Radar aufnehmen").click(); await tick(); });
check("Preview-Vertrag bleibt zweiparametrig und erzwingt shareEnabled false", () => {
  assert.equal(inactiveConfirmation.length, 2);
  assert.equal(inactiveConfirmation[0], activeTarget);
  assert.deepEqual(inactiveConfirmation[1], { shareEnabled: false });
});
await inactivePreview.cleanup();

let activeConfirmation = null;
const activePreview = await mount(RadarSubscriptionPreview, {
  target: activeTarget,
  radarState: { ...inactiveState, subscriptions: [activeTarget], shares: [{ targetId: activeTarget.targetId, status: "active" }] },
  accountMode: true,
  accountActive: true,
  onConfirm: async (...args) => { activeConfirmation = args; return true; },
  onClose() {},
});
check("Bereits aktives Ziel erscheint als Im Radar und nie als Share-Opt-in", () => {
  const dialog = document.querySelector(".kd-radar-preview");
  assert.match(dialog.textContent, /StatusIm Radar/);
  assert.ok(button(dialog, "Im Radar"));
  assert.equal(dialog.querySelector('input[type="checkbox"]'), null);
});
await act(async () => { button(document, "Im Radar").click(); await tick(); });
check("Auch der aktive Kompatibilitätspfad erzwingt shareEnabled false", () => {
  assert.deepEqual(activeConfirmation[1], { shareEnabled: false });
});
await activePreview.cleanup();

const actions = [];
let shareCalls = 0;
const savedQueries = [];
const radarState = {
  subscriptions: [
    activeTarget,
    { targetId: "title-group:v1:star-wars", targetType: "franchise", title: "Star Wars", status: "paused", authority: "server" },
    { targetId: "watchmode:92", targetType: "series", title: "Beispielserie", status: "active", authority: "server" },
  ],
  personSubscriptions: [
    { personExternalId: "wikidata:Q1", name: "Beispiel Person", role: "actor", status: "active", authority: "local" },
  ],
  shares: [{ targetId: activeTarget.targetId, status: "active" }],
  outbox: [],
  pilot: { searchStatuses: [] },
};
const emptyBlogProps = {
  artikel: [], master: [], angemeldet: true,
  onFokusVerbraucht() {}, onErstellen: async () => null, onAktualisieren: async () => null,
  onSetzeRef() {}, onFreigeben: async () => false, onLoeschen: async () => false,
  onAddFilm: async () => null, onSpringeZuFilm() {},
};
const radarUi = await mount(EntdeckenTab, {
  blogProps: emptyBlogProps,
  radarState,
  accountMode: true,
  radarAvailable: true,
  master: [],
  seriesCatalog: [],
  entdeckenStatus: {},
  streamingKnown: { region: "AT", titel: [] },
  streamingDiscover: { region: "AT", titel: [] },
  onRadarTextAdd: async (query) => { savedQueries.push(query); return { status: "active", saved: true }; },
  onRadarChange: (entry, action) => actions.push({ targetId: entry.targetId, action }),
  onPersonRadarChange: (entry, action) => actions.push({ targetId: entry.personExternalId, action }),
  onShareChange: () => { shareCalls += 1; },
});
await act(async () => { button(radarUi.container, "Radar").click(); await tick(); });
check("Radarzielsuche sowie getrennte Ziele und Neuigkeiten bleiben erhalten", () => {
  assert.ok(radarUi.container.querySelector("#kd-radar-target-search"));
  assert.ok(button(radarUi.container, "Ins Radar aufnehmen"));
  assert.deepEqual([...radarUi.container.querySelectorAll(".kd-entdecken-radar-grid h3")]
    .map((entry) => entry.textContent), ["Meine Ziele", "Neuigkeiten"]);
  assert.match(radarUi.container.textContent, /Passender FilmIm Radar · Film/);
  assert.match(radarUi.container.textContent, /Star WarsPausiert · Reihe/);
  assert.match(radarUi.container.textContent, /BeispielserieIm Radar · Serie/);
  assert.match(radarUi.container.textContent, /Beispiel PersonSchauspiel · Im Radar/);
});
await setInput(radarUi.container.querySelector("#kd-radar-target-search"), "Mutter Teresa");
await act(async () => { button(radarUi.container, "Ins Radar aufnehmen").click(); await tick(); });
check("Der vereinheitlichte Button reicht den Suchtext unverändert an den bestehenden Pfad", () => {
  assert.deepEqual(savedQueries, ["Mutter Teresa"]);
});

await act(async () => {
  radarUi.container.querySelector('button[aria-label="Entdecken verwalten"]').click();
  await tick();
});
const manage = document.querySelector('[aria-labelledby="kd-entdecken-manage-title"]');
const workRow = [...manage.querySelectorAll(".kd-entdecken-verwalten-liste li")]
  .find((entry) => /Passender Film/.test(entry.textContent));
const pausedRow = [...manage.querySelectorAll(".kd-entdecken-verwalten-liste li")]
  .find((entry) => /Star Wars/.test(entry.textContent));
const personRow = [...manage.querySelectorAll(".kd-entdecken-verwalten-liste li")]
  .find((entry) => /Beispiel Person/.test(entry.textContent));
check("Verwaltung behält Pause, Fortsetzen und Entfernen ohne Share-Control", () => {
  assert.match(workRow.textContent, /Im Radar · Österreich/);
  assert.deepEqual([...workRow.querySelectorAll("button")].map((entry) => entry.textContent),
    ["Pausieren", "Aus dem Radar entfernen"]);
  assert.deepEqual([...pausedRow.querySelectorAll("button")].map((entry) => entry.textContent),
    ["Fortsetzen", "Aus dem Radar entfernen"]);
  assert.deepEqual([...personRow.querySelectorAll("button")].map((entry) => entry.textContent),
    ["Pausieren", "Aus dem Radar entfernen"]);
  assert.doesNotMatch(manage.textContent, /anonym|teilen|Von anderen entdeckt/i);
  assert.equal(manage.querySelector('button[aria-pressed]'), null);
});
await act(async () => {
  button(workRow, "Pausieren").click();
  button(workRow, "Aus dem Radar entfernen").click();
  button(pausedRow, "Fortsetzen").click();
  button(personRow, "Aus dem Radar entfernen").click();
  await tick();
});
check("Umbenannte Controls bewahren die bestehenden Radar-Aktionen", () => {
  assert.deepEqual(actions, [
    { targetId: "watchmode:91", action: "pause" },
    { targetId: "watchmode:91", action: "remove" },
    { targetId: "title-group:v1:star-wars", action: "upsert" },
    { targetId: "wikidata:Q1", action: "remove" },
  ]);
  assert.equal(shareCalls, 0);
});
await radarUi.cleanup();
dom.window.close();
await stop();
rmSync(outputDir, { recursive: true, force: true });

console.log(`PRIVATE-RELEASE-RADAR-SURFACE-TEST BESTANDEN (${checks}/${checks})`);
