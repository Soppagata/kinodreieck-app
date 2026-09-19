import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useBlogPublicationController } from "./src/controllers/useBlogPublicationController.js";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (predicate) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await act(async () => { await tick(); });
    if (predicate()) return;
  }
  throw new Error("streaming refresh did not settle");
};

const article = {
  id: "burn-blog", titel: "Burn", text: "Evil Dead Burn", geordnet: false,
  liste: [{
    rowId: "burn-row", eingabe: "Evil Dead Burn", jahr: 2026, typ: "film", ref: null,
    workIdentity: { title: "Evil Dead Burn", year: 2026, mediaType: "film",
      identityHints: [{ namespace: "watchmode", value: "1768658" }] },
    sourceObservations: [{
      target: { kind: "streaming", art: "entdecken", ref: "1768658", titel: "Evil Dead Burn" },
      expiresAt: "2029-12-31T23:59:59.000Z",
    }],
    resolutionIntent: { kind: "auto" },
  }],
};
const calls = [];
let catalogContainsWork = true;
const streamingCatalogService = {
  async loadByIds(ids, { signal }) {
    calls.push({ ids: [...ids], signal });
    await tick();
    return { status: "ready", version: "catalog-current", items: catalogContainsWork ? [{
      id: "1768658", titel: "Evil Dead Burn", jahr: 2026, typ: "movie", dienste: ["Amazon"],
      watchmode_id: "1768658", imdb_id: "tt31170389",
    }] : [] };
  },
};
const publicationService = { capability: async () => ({ ok: false, reason: "test" }) };
let props = { accountScope: "account:a" };
let model;
function Harness() {
  model = useBlogPublicationController({
    ...props, enabled: true, articles: [article], articlesReady: true,
    library: [], libraryReady: true, mustwatch: [], mustwatchReady: true,
    streamingCatalogService, service: publicationService,
    clock: () => "2030-01-01T00:10:00.000Z",
  });
  return null;
}

const root = createRoot(document.getElementById("root"));
await act(async () => { root.render(React.createElement(Harness)); });
await settle(() => model.articleCards[0].referencePreview[0].state === "available");
assert.deepEqual(calls[0].ids, ["1768658"]);
assert.equal(model.articleCards[0].referencePreview[0].primaryTarget?.ref, "1768658");
assert.equal(model.articleCards[0].referencePreview[0].state, "available");
assert.equal(article.liste[0].ref, null);

catalogContainsWork = false;
props = { accountScope: "account:b" };
await act(async () => { root.render(React.createElement(Harness)); });
await settle(() => model.articleCards[0].referencePreview[0].state === "redlink");
assert.equal(calls.length, 2);
assert.equal(calls[0].signal.aborted, true);
assert.equal(model.articleCards[0].referencePreview[0].primaryTarget, null);
assert.equal(model.articleCards[0].referencePreview[0].state, "redlink");
assert.equal(article.liste[0].ref, null);

await act(async () => root.unmount());
dom.window.close();
console.log("blog_reference_streaming_refresh_test: 1 fokussierte Regression bestanden.");
