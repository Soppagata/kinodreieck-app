import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = process.env.KD_NODE_MODULES_DIR || path.join(rootDir, "node_modules");
const req = createRequire(path.join(nodeModules, "__e5_resolver__.cjs"));
const load = async (name) => { try { return await import(name); } catch { return req(name); } };
const { JSDOM } = await load("jsdom");
let esbuild;
try { esbuild = await load("esbuild"); } catch { esbuild = req("vite/node_modules/esbuild"); }
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-flixpatrol-mediathek-ui-"));
const bundle = path.join(temp, "bundle.mjs");
fs.symlinkSync(nodeModules, path.join(temp, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
await esbuild.build({
  stdin: { contents: 'export { MediathekTab } from "./src/tabs/MediathekTab.jsx";', resolveDir: rootDir, loader: "jsx" },
  outfile: bundle, bundle: true, platform: "node", format: "esm", jsx: "automatic", target: "es2022",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"], logLevel: "silent",
});
esbuild.stop?.();

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", { url: "https://kinodreieck.test/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
  "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "localStorage"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? dom.window : dom.window[name], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
const React = await load("react");
const { act, createElement } = React;
const { createRoot } = await load("react-dom/client");
const { MediathekTab } = await import(pathToFileURL(bundle).href);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const facts = { async load() { return [{
  sourceId: "ttl_bHyGTvopBHPVtIKhR2CF68WD", flixpatrol_id: "ttl_bHyGTvopBHPVtIKhR2CF68WD",
  titel: "Alien", jahr: 1979, typ: "film", imdb_id: "tt0078748", fresh: true,
  checkedAt: "2026-09-09T11:00:00Z", charts: [],
}]; } };
const json = JSON.stringify({ kandidaten: [
  { titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch" },
  { titel: "Arrival", typ: "film", jahr: 2016, quelle: "dvd", vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch" },
], warnungen: [] });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
let pending = deferred();
const writes = [];
const addFilm = async (film) => { writes.push(film); if (writes.length === 1 || writes.length === 2) await pending.promise; return `id-${writes.length}`; };
const errors = [];
const props = (key, kiAktiv = false) => ({
  master: [], nachtragFlach: [], expandedId: null, setExpandedId: () => {}, updateFilm: () => {}, deleteFilm: () => {},
  addFilm, badgeFuer: () => null, mustwatch: [], datenKontextKey: key, stapelimportKiAktiv: kiAktiv,
  stapelimportFacts: facts, setErr: (value) => errors.push(value),
});
const app = document.getElementById("app");
const reactRoot = createRoot(app);
const render = async (key, kiAktiv = false) => act(async () => {
  reactRoot.render(createElement(React.StrictMode, null, createElement(MediathekTab, props(key, kiAktiv)))); await tick();
});
const click = async (element) => act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await tick(); });
const setValue = async (element, value) => act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true })); await tick();
});
const button = (text) => [...app.querySelectorAll("button")].find((item) => item.textContent.includes(text));

await render("account:ready:a");
assert.ok(app.querySelector("details.kd-stapelimport-einstieg")?.textContent.includes("Mehrere Titel erfassen"));
assert.match(app.textContent, /Die App-KI ist ausgeschaltet/);
await render("account:ready:a", true);
assert.ok(button("Liste mit KI ordnen"), "der manuelle KI-Knopf folgt dem übergebenen Doppel-Gate");
await render("account:ready:a", false);
const textarea = app.querySelector('textarea[placeholder^="JSON-Antwort"]');
await setValue(textarea, json);
await click(button("Antwort prüfen"));
assert.match(app.textContent, /Belegte FlixPatrol-Lücken ergänzen/);
assert.match(app.textContent, /exakten Titel, Jahr und Typ/);
assert.match(app.textContent, /IMDb-ID:\s*tt0078748/);

await click(button("Auswahl übernehmen"));
await render("account:ready:b");
pending.resolve();
await act(async () => { await tick(); await tick(); });
assert.equal(writes.length, 1, "Kontowechsel stoppt den seriellen Import vor dem nächsten Titel");
assert.equal(app.querySelector('textarea[placeholder^="JSON-Antwort"]')?.value, "", "neuer Datenkontext enthält keine alte Vorschau");

pending = deferred();
await setValue(app.querySelector('textarea[placeholder^="JSON-Antwort"]'), json);
await click(button("Antwort prüfen"));
await click(button("Auswahl übernehmen"));
await act(async () => { reactRoot.unmount(); });
pending.resolve();
await tick();
assert.equal(writes.length, 2, "Unmount stoppt den seriellen Import vor dem nächsten Titel");
assert.deepEqual(errors.filter(Boolean), []);

console.log("flixpatrol_facts_mediathek_ui_test: 10 Checks bestanden.");
