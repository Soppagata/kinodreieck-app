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
assert.doesNotMatch(ui.container.textContent, /Neu sichtbar bis|18\.09\.2026/u);
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
await ui.cleanup();
sessionStorage.clear();

const errorUi = await mount({ ...baseProps, streamingPage: {
  ...basePage, queryKey: "account-a:all:error", items: [], total: null,
  loaded: 0, hasMore: false, backgroundLoading: false, status: "error", error: new Error("Boundary intern"),
} });
assert.match(errorUi.container.textContent, /Titel konnten nicht geladen werden/u);
assert.doesNotMatch(errorUi.container.textContent, /Boundary intern/u);
await errorUi.cleanup();
sessionStorage.clear();

const genreUi = await mount(baseProps);
await act(async () => { button(genreUi.container, "▸ Filter & Sortierung").click(); await tick(); });
const decadeRange = genreUi.container.querySelector('[aria-label="Entdecken: Jahrzehnt filtern"]');
const stableDecadeMax = decadeRange.max;
await act(async () => { button(genreUi.container, "Komödie").click(); await tick(); });
assert.equal(queries.at(-1).filters.genre, "komodie");
await genreUi.render({ ...baseProps, streamingPage: {
  ...basePage, queryKey: "account-a:all:genre-komodie", items: [], total: null,
  loaded: 0, status: "loading", backgroundLoading: true,
} });
const selectedGenre = button(genreUi.container, "Komödie");
assert.notEqual(selectedGenre.style.background, "transparent");
assert.equal(selectedGenre.textContent.trim(), "Komödie", "Teilseitenzahlen werden nicht als Gesamtzahl gezeigt");
assert.equal(genreUi.container.querySelector('[aria-label="Entdecken: Jahrzehnt filtern"]').max, stableDecadeMax);
assert.equal(queries.at(-1).filters.genre, "komodie", "leere Ladephase setzt den aktiven Genrequery nicht zurück");
await genreUi.cleanup();
sessionStorage.clear();

const sessionQueries = [];
const sessionUi = await mount({ ...baseProps, onStreamingPageQuery: (query) => sessionQueries.push(query) });
await act(async () => { button(sessionUi.container, "Weitere 20 anzeigen").click(); await tick(); });
Object.defineProperty(window, "scrollY", { value: 427, configurable: true });
await act(async () => { button(sessionUi.container, "Neu").click(); await tick(); });
assert.equal(sessionQueries.at(-1).view, "new");
await sessionUi.render({ ...baseProps, onStreamingPageQuery: (query) => sessionQueries.push(query), streamingPage: {
  ...basePage, view: "new", queryKey: "account-a:new:default", items: items.slice(0, 25), total: 25,
  loaded: 25, hasMore: false, backgroundLoading: false,
} });
assert.equal(sessionUi.container.querySelectorAll(".kd-entdecken-karte").length, 20);
Object.defineProperty(window, "scrollY", { value: 91, configurable: true });
await act(async () => { button(sessionUi.container, "Weitere 5 anzeigen").click(); await tick(); });
assert.equal(sessionUi.container.querySelectorAll(".kd-entdecken-karte").length, 25);
await act(async () => { button(sessionUi.container, "Alles").click(); await tick(); });
await sessionUi.render({ ...baseProps, onStreamingPageQuery: (query) => sessionQueries.push(query) });
await act(async () => { await tick(); });
assert.equal(sessionUi.container.querySelectorAll(".kd-entdecken-karte").length, 40);
assert.equal(window.scrollY, 427);
const savedNew = JSON.parse(sessionStorage.getItem("kd:streaming-ui:account-a:new:default"));
assert.equal(savedNew.ansicht, "neu");
assert.equal(savedNew.visible, 25);
assert.equal(savedNew.scrollY, 91);
await sessionUi.cleanup();
sessionStorage.clear();

let focusConsumed = false;
const focusQueries = [];
const focusUi = await mount({
  ...baseProps,
  fokusTreffer: { art: "entdecken", ref: "90030", titel: "Progressiver Titel 31" },
  onFokusVerbraucht: () => { focusConsumed = true; },
  onStreamingPageQuery: (query) => focusQueries.push(query),
});
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });
const focusTarget = focusUi.container.querySelector('[data-streaming-suchtreffer="entdecken:90030"]');
assert.ok(focusTarget, "ein geladenes Ziel hinter Karte 20 bleibt als sichere Zielkarte im DOM");
assert.equal(focusQueries.at(-1).filters.suche, "Progressiver Titel 31");
assert.equal(document.activeElement, focusTarget);
assert.equal(focusConsumed, true);
assert.match(focusUi.container.textContent, /Fokussiert: Progressiver Titel 31/u);
await act(async () => { button(focusUi.container, "Alle Titel anzeigen").click(); await tick(); });
assert.equal(focusQueries.at(-1).view, "all");
assert.equal(focusQueries.at(-1).filters.suche, "");
assert.doesNotMatch(focusUi.container.textContent, /Fokussiert:/u);
await focusUi.cleanup();
sessionStorage.clear();

const libraryLoading = await mount({ ...baseProps, streamingPage: {
  ...basePage, view: "library", queryKey: "account-a:library:loading", items: [], total: null,
  loaded: 0, status: "loading", backgroundLoading: true,
} });
assert.doesNotMatch(libraryLoading.container.textContent, /Kein Titel deiner Liste/u);
assert.match(libraryLoading.container.textContent, /Erste Titel werden geladen/u);
await libraryLoading.render({ ...baseProps, streamingPage: {
  ...basePage, view: "library", queryKey: "account-a:library:empty", items: [], total: 0,
  loaded: 0, status: "ready", hasMore: false, backgroundLoading: false,
} });
assert.match(libraryLoading.container.textContent, /Kein Titel deiner Liste/u);
await libraryLoading.cleanup();
sessionStorage.clear();

const newEmpty = await mount({ ...baseProps, streamingPage: {
  ...basePage, view: "new", queryKey: "account-a:new:empty", items: [], total: 0,
  loaded: 0, status: "ready", hasMore: false, backgroundLoading: false,
} });
assert.match(newEmpty.container.textContent, /In den letzten 14 Tagen sind keine neuen Titel/u);
await act(async () => { button(newEmpty.container, "▸ Filter & Sortierung").click(); await tick(); });
await act(async () => { button(newEmpty.container, "Filme").click(); await tick(); });
await newEmpty.render({ ...baseProps, streamingPage: {
  ...basePage, view: "new", queryKey: "account-a:new:empty-movies", items: [], total: 0,
  loaded: 0, status: "ready", hasMore: false, backgroundLoading: false,
} });
assert.match(newEmpty.container.textContent, /Keine neuen Titel für diese Filter/u);
assert.doesNotMatch(newEmpty.container.textContent, /für diese Auswahl hinzugekommen/u);
await newEmpty.cleanup();
sessionStorage.clear();

const storagePrototype = Object.getPrototypeOf(sessionStorage);
const originalGetItem = storagePrototype.getItem;
Object.defineProperty(storagePrototype, "getItem", {
  configurable: true,
  value() { throw new Error("Safari storage blocked"); },
});
const blockedStorageUi = await mount({ ...baseProps, streamingPage: {
  ...basePage, queryKey: "account-a:all:storage-blocked",
} });
assert.match(blockedStorageUi.container.textContent, /314 Treffer/u);
await blockedStorageUi.cleanup();
Object.defineProperty(storagePrototype, "getItem", { configurable: true, value: originalGetItem });

console.log("streaming_progressive_ui_test: progressive error/filter/focus/session/empty contracts passed");
