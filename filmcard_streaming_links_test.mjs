/* Fokussierte DOM-Regression für Mein-Programm-Bewertung und die Trennung
   gespeicherter Quellen von aktuellen externen Streaming-Links. Nur Mocks. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = path.join(wurzel, "node_modules");
const requireFromProject = createRequire(path.join(nodeModules, "__filmcard_streaming_links__.cjs"));
const { JSDOM } = requireFromProject("jsdom");
let esbuild;
try { esbuild = requireFromProject("esbuild"); }
catch { esbuild = requireFromProject("vite/node_modules/esbuild"); }

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-filmcard-streaming-links-"));
const bundle = path.join(temp, "bundle.mjs");
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
await esbuild.build({
  stdin: {
    contents: [
      'export { FilmCard } from "./src/components/FilmCard.jsx";',
      'export { default as React, act } from "react";',
      'export { createRoot } from "react-dom/client";',
    ].join("\n"),
    resolveDir: wurzel,
    loader: "jsx",
  },
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  loader: { ".css": "empty" },
  nodePaths: [nodeModules],
  logLevel: "silent",
});
esbuild.stop?.();

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", {
  url: "https://kinodreieck.test/",
});
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { FilmCard, React, act, createRoot } = await import(pathToFileURL(bundle).href);
const app = document.getElementById("app");
const root = createRoot(app);
const h = React.createElement;

const links = h("span", null,
  h("a", { href: "https://example.test/netflix", target: "_blank", rel: "noopener noreferrer" }, "Netflix", h("span", { "aria-hidden": "true" }, "↗")),
  h("a", { href: "https://example.test/prime", target: "_blank", rel: "noopener noreferrer" }, "Prime Video", h("span", { "aria-hidden": "true" }, "↗")),
);
const basis = { id: "beetlejuice", titel: "Beetlejuice", jahr: 1988, typ: "film", quelle: "prime" };

await act(async () => root.render(h(FilmCard, {
  film: { ...basis, bewertung: null }, kinoInfo: links, expanded: true,
  onToggle() {}, onSave: async () => true,
})));
assert.equal([...app.querySelectorAll("button")].filter((button) => button.textContent.includes("Jetzt bewerten")).length, 1,
  "unbewerteter Eintrag zeigt genau Jetzt bewerten");
assert.equal([...app.querySelectorAll("button")].filter((button) => button.textContent.includes("Bewertung bearbeiten")).length, 0,
  "unbewerteter Eintrag bietet keine Bearbeitung einer nicht vorhandenen Bewertung an");
assert.deepEqual([...app.querySelectorAll(".kd-film-quellentag")].map((tag) => tag.textContent), ["Prime Video"],
  "farbiger Tag bildet ausschließlich die gespeicherte Quelle ab");
assert.equal(app.querySelector(".kd-film-verfuegbarkeit")?.dataset.kdSourceKind, "aktuelle-verfuegbarkeit");
assert.deepEqual([...app.querySelectorAll(".kd-film-verfuegbarkeit a")].map((link) => link.textContent), ["Netflix↗", "Prime Video↗"],
  "aktuelle Netflix- und Prime-Verfügbarkeit bleibt separat extern verlinkt");
assert.ok([...app.querySelectorAll(".kd-film-verfuegbarkeit a")].every((link) => (
  link.target === "_blank" && link.rel === "noopener noreferrer" && link.querySelector('[aria-hidden="true"]')
)), "alle externen Dienst-Links behalten Zielschutz und sichtbaren Externhinweis");

await act(async () => root.render(h(FilmCard, {
  film: { ...basis, bewertung: { wie: 0, was: 0, warum: 0 } }, kinoInfo: links, expanded: true,
  onToggle() {}, onSave: async () => true,
})));
assert.equal([...app.querySelectorAll("button")].filter((button) => button.textContent.includes("Jetzt bewerten")).length, 0,
  "eine vorhandene Null-Bewertung gilt als bewertet");
assert.equal([...app.querySelectorAll("button")].filter((button) => button.textContent.includes("Bewertung bearbeiten")).length, 1,
  "bewerteter Eintrag behält Bewertung bearbeiten");

const css = fs.readFileSync(path.join(wurzel, "src/styles/design-primary.css"), "utf8");
assert.match(css, /\.kd-streaming-tab :is\(\.kd-film-verfuegbarkeit, \.kd-entdecken-dienste\) a\s*\{[\s\S]*min-height: 0 !important;[\s\S]*padding: 2px 7px !important;/u,
  "Mein Programm, Alles und Neu verwenden dasselbe kompakte Link-Chip-Schema");
assert.match(css, /\.kd-film-verfuegbarkeit > span\s*\{[\s\S]*flex-wrap: wrap/u,
  "mehrere Dienst-Links brechen geordnet um");

await act(async () => root.unmount());
console.log("filmcard_streaming_links_test: 10 Checks bestanden.");
process.exit(0);
