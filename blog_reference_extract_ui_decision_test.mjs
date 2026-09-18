import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React, { act, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useBlogPublicationController } from "./src/controllers/useBlogPublicationController.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = (() => { try { return require("esbuild"); } catch { return require("vite/node_modules/esbuild"); } })();
const bundle = await esbuild.build({
  stdin: {
    contents: 'export { BlogReferenceList } from "./src/components/blog/BlogReferenceList.jsx";',
    sourcefile: "blog-reference-empty-decision-entry.jsx", resolveDir: directory, loader: "jsx",
  },
  write: false, bundle: true, platform: "node", format: "esm", jsx: "automatic",
  external: ["react", "react/*", "react-dom", "react-dom/*"],
});
const temporary = mkdtempSync(path.join(directory, ".blog-reference-decision-"));
const bundledFile = path.join(temporary, "fixture.mjs");
writeFileSync(bundledFile, bundle.outputFiles[0].text);
const { BlogReferenceList } = await import(pathToFileURL(bundledFile).href);

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const EMPTY = Object.freeze([]);
const LIBRARY = Object.freeze([
  { id: "dune-1984", titel: "Dune", jahr: 1984, typ: "film", imdb_id: "tt0087182" },
  { id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film", imdb_id: "tt1160419" },
]);
let articleStore = [];
let lastPublicationRequest = null;
const service = Object.freeze({
  capability: async () => ({ ok: true }),
  ownerReadback: async (privateArticleId) => ({
    contractVersion: "blog-publication-v1", privateArticleId,
    currentPublication: null, operation: null, legacyReloadRequired: false,
  }),
  publishV1: async (request) => {
    lastPublicationRequest = request;
    return {
      contractVersion: "blog-publication-v2", outcome: "decision_required",
      operationId: request.operationId, contentVersion: request.contentVersion,
      referenceResults: [],
      decisionRequests: request.article.references
        .filter((row) => row.title === "Dune")
        .map((row) => ({ rowId: row.rowId, candidates: [] })),
      errorCode: "REFERENCE_DECISION_REQUIRED",
    };
  },
});

async function mountController() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let model = null;
  function Harness() {
    const [articles, setArticles] = useState(articleStore);
    const articlesRef = useRef(articles);
    articlesRef.current = articles;
    const writeArticles = useCallback(async (calculate) => {
      const next = typeof calculate === "function" ? calculate(articlesRef.current) : calculate;
      if (!Array.isArray(next)) return false;
      articleStore = next;
      articlesRef.current = next;
      setArticles(next);
      return true;
    }, []);
    model = useBlogPublicationController({
      accountScope: "account:a", enabled: true, articles, articlesReady: true,
      writeArticles, library: LIBRARY, libraryReady: true,
      mustwatch: EMPTY, mustwatchReady: true,
      selectedServices: EMPTY, selectedServicesReady: true,
      service, clock: () => "2032-05-04T12:00:00.000Z",
    });
    const references = (model.editor?.references || []).map((row) => ({
      ...row, articleId: model.editor.articleId,
    }));
    return model.editor ? React.createElement(BlogReferenceList, {
      references, editable: true, actions: model.actions, draftKey: model.editor.draftKey,
    }) : null;
  }
  await act(async () => { root.render(React.createElement(Harness)); await tick(); await tick(); });
  return {
    container,
    get model() { return model; },
    async close() { await act(async () => root.unmount()); container.remove(); },
  };
}

let fixture = await mountController();
await act(async () => { fixture.model.actions.onNewArticle(); await tick(); });
await act(async () => {
  fixture.model.actions.onEditorChange({ title: "Zwei Dune-Filme", text: "Dune 1984 und Dune 2021", anonymousPublication: true });
  fixture.model.actions.onAddReference({ draftKey: fixture.model.editor.draftKey,
    reference: { title: "Dune", year: 1984, mediaType: "film", ref: "dune-1984" } });
  fixture.model.actions.onAddReference({ draftKey: fixture.model.editor.draftKey,
    reference: { title: "Dune", year: 2021, mediaType: "film", ref: "dune-2021" } });
  fixture.model.actions.onAddReference({ draftKey: fixture.model.editor.draftKey,
    reference: { title: "Normale unbekannte Zeile", year: 2020, mediaType: "film" } });
  await tick();
});
let saveResult;
await act(async () => {
  saveResult = await fixture.model.actions.onSave({
    draftKey: fixture.model.editor.draftKey, anonymousPublication: true,
  });
  await tick();
});
assert.equal(saveResult.publication.status, "decision_required");
assert.equal(lastPublicationRequest.article.references.length, 3);
assert.equal(articleStore[0].liste.filter((row) => row.decisionRequired === true).length, 2);
assert.equal(fixture.container.querySelectorAll(".kd-blog-reference-decision").length, 2);
assert.equal(fixture.container.querySelectorAll(".kd-blog-reference-decision select").length, 0);
assert.equal([...fixture.container.querySelectorAll("button")]
  .filter((button) => button.textContent === "Als Rotlink behalten").length, 2);
assert.equal(fixture.container.textContent.includes("Kein gemeinsamer Treffer verfügbar."), true);
console.log("✓ Leere Serverentscheidungen sind sichtbar, normale unbekannte Zeilen bleiben ohne Zusatzentscheidung");

const articleId = articleStore[0].id;
await fixture.close();
fixture = await mountController();
await act(async () => { fixture.model.actions.onEditArticle({ articleId }); await tick(); await tick(); });
assert.equal(fixture.container.querySelectorAll(".kd-blog-reference-decision").length, 2);
console.log("✓ Erforderliche leere Entscheidungen bleiben nach Reload sichtbar");

const firstButton = [...fixture.container.querySelectorAll("button")]
  .find((button) => button.textContent === "Als Rotlink behalten");
await act(async () => { firstButton.click(); await tick(); await tick(); });
assert.equal(articleStore[0].liste.filter((row) => row.decisionRequired === true).length, 1);
assert.equal(articleStore[0].liste.filter((row) => row.resolutionIntent?.kind === "keep_redlink").length, 1);
assert.equal(fixture.container.querySelectorAll(".kd-blog-reference-decision").length, 1);
console.log("✓ Bewusste Rotlink-Bestätigung löst nur die gewählte Entscheidung dauerhaft auf");

await fixture.close();
dom.window.close();
rmSync(temporary, { recursive: true, force: true });
esbuild.stop();
console.log("blog_reference_extract_ui_decision_test: 3 Checks bestanden.");
