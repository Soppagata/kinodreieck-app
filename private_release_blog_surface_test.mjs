import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const moduleRoot = process.env.KD_TEST_NODE_MODULES || path.join(rootDir, "node_modules");
const requireFromTestEnv = createRequire(path.join(moduleRoot, "__kd_test_resolver__.cjs"));
const { JSDOM } = requireFromTestEnv("jsdom");
const { build, stop } = requireFromTestEnv("esbuild");
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const source = fs.readFileSync(path.join(rootDir, "src/tabs/BlogTab.jsx"), "utf8");
const editorSource = fs.readFileSync(path.join(rootDir, "src/components/blog/BlogEditor.jsx"), "utf8");
const referenceSource = fs.readFileSync(path.join(rootDir, "src/components/blog/BlogReferenceList.jsx"), "utf8");

check("Die UI konsumiert nur kontrollierte Blogaktionen und keine Services", () => {
  assert.doesNotMatch(source + editorSource + referenceSource, /sharedArticlesService|service\.|fetch\(|supabase|RPC/i);
  assert.match(source, /publicationCapability/);
  assert.match(source, /publishedPage/);
  assert.match(source, /actions: suppliedActions/);
});
check("Der Editor trennt privaten Save und bewusste kanonische Autorenwahl", () => {
  assert.match(editorSource, /Anonym veröffentlichen/);
  assert.match(editorSource, /disabled=\{!publishReady\}/);
  assert.match(editorSource, /Privat speichern/);
  assert.match(editorSource, /run\(onPrivateSave\)/);
  assert.match(editorSource, /run\(onPublish\)/);
  assert.match(editorSource, /Als \$\{profileAuthor\}/);
  assert.match(editorSource, /Anonym aktualisieren/);
});
check("Referenzen werden ausschließlich über rowId umgeordnet und entfernt", () => {
  assert.match(referenceSource, /onMoveReference\(\{ draftKey, rowId: reference\.rowId/);
  assert.match(referenceSource, /onRemoveReference\(\{ draftKey, rowId: reference\.rowId/);
  assert.doesNotMatch(referenceSource, /splice\(|indexOf\(/);
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://local.invalid/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Event", "MouseEvent", "Node", "getComputedStyle"])
  Object.defineProperty(globalThis, key, { value: key === "window" ? dom.window : dom.window[key], configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let networkCalls = 0;
globalThis.fetch = dom.window.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
const built = await build({
  stdin: { contents: `export { default as React, act } from "react"; export { createRoot } from "react-dom/client"; export { BlogTab } from "./src/tabs/BlogTab.jsx";`, sourcefile: "blog-surface-entry.jsx", resolveDir: rootDir, loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "esm", jsx: "automatic", nodePaths: [moduleRoot], loader: { ".css": "empty" },
  external: ["react", "react/*", "react-dom", "react-dom/*"],
});
// Native Node React keeps act's task scheduler out of the browser-only
// MessageChannel fallback, which otherwise leaves this test process alive.
const temporary = fs.mkdtempSync(path.join(rootDir, ".blog-surface-"));
let ui;
try {
  const filename = path.join(temporary, "fixture.mjs");
  fs.symlinkSync(moduleRoot, path.join(temporary, "node_modules"), "dir");
  fs.writeFileSync(filename, built.outputFiles[0].text);
  ui = await import(pathToFileURL(filename).href);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
const host = document.createElement("div"); document.body.append(host);
const calls = [];
const actions = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return Promise.resolve(null); } });
const root = ui.createRoot(host);
try {
await ui.act(async () => root.render(ui.React.createElement(ui.BlogTab, {
  publicationCapability: { status: "unavailable", reason: "fixture" },
  view: { area: "mine", mode: "editor", articleId: null, returnToken: "back-1" },
  editor: { draftKey: "draft-1", articleId: null, title: "Titel", text: "Text", ordered: false, references: [], anonymousPublication: false, dirty: true, saveStatus: "idle" },
  actions,
})));
check("Bei fehlender Capability bleibt privates Speichern aktiv", () => {
  const publish = [...host.querySelectorAll("label")].find((label) => label.textContent.includes("Anonym veröffentlichen"))?.querySelector('input[type="checkbox"]');
  const save = [...host.querySelectorAll("button")].find((button) => button.textContent === "Privat speichern");
  assert.equal(publish.disabled, true);
  assert.equal(save.disabled, false);
  assert.equal([...host.querySelectorAll("label")].some((label) => /Autorname/.test(label.textContent)), false);
  assert.equal(networkCalls, 0);
});
console.log(`private_release_blog_surface_test: ${checks} Checks bestanden (nur Mocks).`);
} finally {
  await ui.act(async () => root.unmount());
  dom.window.close();
  stop();
}
