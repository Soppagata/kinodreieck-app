import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-streaming-progressive-ui-"));
const bundle = path.join(outDir, "bundle.mjs");
fs.symlinkSync(path.join(rootDir, "node_modules"), path.join(outDir, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(outDir, { recursive: true, force: true }));
let esbuild;
try { esbuild = await import("esbuild"); }
catch { esbuild = createRequire(import.meta.resolve("vite"))("esbuild"); }
await esbuild.build({
  stdin: { contents: 'export { StreamingTab } from "./src/tabs/StreamingTab.jsx";', loader: "js", resolveDir: rootDir },
  bundle: true, format: "esm", outfile: bundle, jsx: "automatic", target: "es2022",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"], logLevel: "warning",
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
dom.window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
dom.window.cancelAnimationFrame = (id) => clearTimeout(id);
for (const name of [
  "window", "document", "navigator", "HTMLElement", "Element", "Event", "MouseEvent", "Node",
  "NodeList", "getComputedStyle", "localStorage", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame",
]) Object.defineProperty(globalThis, name, {
  value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
});
window.scrollTo = ({ top = 0 } = {}) => Object.defineProperty(window, "scrollY", { value: top, configurable: true });
globalThis.IntersectionObserver = class {
  observe() {} disconnect() {}
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { StreamingTab } = await import(pathToFileURL(bundle).href);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (next) => act(async () => { root.render(h(StreamingTab, next)); await tick(); });
  await render(props);
  return { container, render, async cleanup() { await act(async () => root.unmount()); container.remove(); } };
}
const button = (container, text) => [...container.querySelectorAll("button")]
  .find((node) => node.textContent.trim().startsWith(text));

const items = Array.from({ length: 55 }, (_, index) => ({
  watchmode_id: 90000 + index,
  ...(index === 0 ? { library_id: "library-0" } : {}),
  titel: `Progressiver Titel ${String(index + 1).padStart(2, "0")}`,
  jahr: 2000 + (index % 20), typ: index % 2 ? "tv_series" : "movie",
  genres: [index % 2 ? "Drama" : "Komödie"], dienste: ["Netflix"],
}));
const queries = [];
const actions = [];
const basePage = {
  enabled: true, status: "ready", view: "all", queryKey: "account-a:all:default", version: "v1",
  items, counts: { all: 5417, new: 205, library: 123 }, total: 314,
  loaded: 55, hasMore: true, backgroundLoading: true, fromCache: true,
  error: null, nextExpiryAt: "2026-09-18T10:00:00.000Z",
};
const baseProps = {
  bekannt: null, entdecken: null, auswahl: ["Netflix"], auswahlGeladen: true,
  master: [{ id: "library-0", watchmode_id: 90000, titel: items[0].titel, typ: "film" }],
  merkliste: [], toggleMerk: (entry) => actions.push(["merk", entry.watchmode_id]),
  mustwatchIds: new Set(), recommendationPins: [],
  onRecommendationPinToggle: (entry) => actions.push(["pin", entry.watchmode_id]),
  entdeckenStatus: {}, schreibeEntdeckenStatus: async () => true,
  onEintragKlick: (id) => actions.push(["open", id]),
  streamingPage: basePage, onStreamingPageQuery: (query) => queries.push(query),
};

const ui = await mount(baseProps);
assert.equal(button(ui.container, "Alles").textContent.trim(), "Alles (5417)");
assert.equal(button(ui.container, "Neu").textContent.trim(), "Neu (205)");
assert.equal(button(ui.container, "Mein Programm").textContent.trim(), "Mein Programm (123)");
assert.match(ui.container.textContent, /314 Treffer.*für diese Ansicht und Filter/u);
assert.match(ui.container.textContent, /aus dem Browser-Speicher/u);
assert.match(ui.container.textContent, /Neu sichtbar bis 18\.09\.2026/u);
assert.equal(ui.container.querySelectorAll(".kd-entdecken-karte").length, 20);
assert.equal(queries.length, 1);
assert.equal(queries[0].view, "all");

await act(async () => { button(ui.container, "Weitere 20 anzeigen").click(); await tick(); });
assert.equal(ui.container.querySelectorAll(".kd-entdecken-karte").length, 40);

await act(async () => { button(ui.container, "▸ Filter & Sortierung").click(); await tick(); });
const typeButton = button(ui.container, "Filme");
await act(async () => { typeButton.click(); await tick(); });
assert.equal(queries.at(-1).filters.typ, "movie");
const queryCount = queries.length;
await ui.render({ ...baseProps, streamingPage: { ...basePage } });
assert.equal(queries.length, queryCount, "gleiche primitive Query wird nicht erneut gesendet");

const firstCard = ui.container.querySelector(".kd-entdecken-karte");
await act(async () => { firstCard.querySelector('[aria-label*="Pinboard"]').click(); await tick(); });
await act(async () => { firstCard.querySelector('[aria-label="Auf die Merkliste"]').click(); await tick(); });
await act(async () => { firstCard.querySelector(".kd-streaming-mediathek-link").click(); await tick(); });
assert.deepEqual(actions, [["pin", 90000], ["merk", 90000], ["open", "library-0"]]);

await ui.render({ ...baseProps, streamingPage: { ...basePage, status: "error", error: "späte Seite fehlt" } });
assert.equal(ui.container.querySelectorAll(".kd-entdecken-karte").length, 40);
assert.match(ui.container.textContent, /vorhandenen Karten bleiben verfügbar/u);
Object.defineProperty(window, "scrollY", { value: 427, configurable: true });
await ui.cleanup();

const returnQueries = [];
const returned = await mount({ ...baseProps, onStreamingPageQuery: (query) => returnQueries.push(query) });
assert.equal(ui.container.isConnected, false);
assert.equal(returned.container.querySelectorAll(".kd-entdecken-karte").length, 40);
assert.equal(returnQueries[0].view, "all");
assert.equal(returnQueries[0].filters.typ, "movie");
await act(async () => { await tick(); });
assert.equal(window.scrollY, 427);
await returned.cleanup();

console.log("streaming_progressive_ui_test: 13 checks passed");
