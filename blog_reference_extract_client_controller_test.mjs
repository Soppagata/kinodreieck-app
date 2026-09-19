import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useBlogReferenceExtractionController } from "./src/controllers/useBlogReferenceExtractionController.js";
import { useBlogPublicationController } from "./src/controllers/useBlogPublicationController.js";
import { blogReferenceContentHash, buildBlogReferenceApplications } from "./src/lib/blogReferenceExtraction.js";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const health = () => ({
  ok: true, task: "health", activation: { userTasks: ["blog-reference-extract"] },
  capabilities: { blogReferenceExtract: {
    contractVersion: "blog-reference-extract-v1", enabled: true, modelAlias: "gross",
    maxTextBytes: 18000, maxTitleBytes: 512, maxCandidates: 50,
  } },
});
const resultFor = (request, title, text) => {
  const quote = "Dune 2021";
  const start = text.indexOf(quote);
  return {
    ok: true, task: "blog-reference-extract", vorgangId: request.options.vorgangId,
    data: { contractVersion: "blog-reference-extract-v1", partial: false,
      expiresAt: "2035-01-01T00:00:00.000Z", candidates: [{
        candidateId: "c-dune", mention: "Dune", titleSuggestion: "Dune", kind: "film", year: 2021,
        interpretation: "direct", evidence: { field: "text", quote, start, end: start + quote.length },
      }] },
  };
};

let props = null;
let model = null;
let pending = [];
let applied = [];
const calls = [];
const catalogCalls = [];
const catalogService = {
  async search(query, options = {}) {
    catalogCalls.push({ query, options });
    return { status: "ready", version: "mw-test", expiresAt: "2030-01-01T00:05:00.000Z", items: [{
      id: "stream-dune", titel: "Dune", jahr: 2021, typ: "movie",
      dienste: ["Amazon", "AppleTV", "Rakuten TV", "Sky Store", "maxdome Store"],
      imdb_id: "tt1160419", watchmode_id: "stream-dune",
    }] };
  },
};
let controllerNow = Date.parse("2030-01-01T00:00:00Z");
const service = {
  async runTask(task, payload, options = {}) {
    calls.push({ task, payload, options });
    if (task === "health") return health();
    return new Promise((resolve) => pending.push({ resolve, request: { task, payload, options } }));
  },
};
function Harness() {
  model = useBlogReferenceExtractionController({ ...props, service,
    onApplyReferenceSuggestions: async (input) => {
      applied.push(input);
      return { status: "applied", addedCount: input.candidates.length };
    },
    clock: () => controllerNow,
  });
  return null;
}
const root = createRoot(document.getElementById("root"));
const editor = (text = "Ich sah Dune 2021.", count = 0) => ({
  draftKey: "draft-a", title: "Ein Text", text,
  references: Array.from({ length: count }, (_, index) => ({ rowId: `row-${index}` })),
});
props = {
  accountScope: "account:a", enabled: true, personalAi: true, editor: editor(),
  library: [{ id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film" }], libraryReady: true,
  mustwatch: [], mustwatchReady: true, catalogService,
};
await act(async () => { root.render(React.createElement(Harness)); await tick(); });
check("Expliziter Capability-Handshake macht den Start bereit", () => {
  assert.equal(model.capability.status, "ready");
  assert.equal(model.canStart, true);
  assert.deepEqual(calls[0].payload, { capabilities: ["blog-reference-extract-v1"] });
});

let firstRun;
let duplicateStart;
await act(async () => {
  firstRun = model.start();
  duplicateStart = await model.start();
  await tick();
});
check("Auch ein schneller Doppelklick startet genau einen gebundenen Fachauftrag", () => {
  assert.equal(duplicateStart, false);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].request.task, "blog-reference-extract");
  assert.deepEqual(pending[0].request.payload, { title: "Ein Text", text: "Ich sah Dune 2021." });
  assert.equal(model.status, "running");
  assert.equal(typeof model.binding.contentHash, "string");
});

props = { ...props, editor: editor("Ich sah Dune 2021 und änderte den Text.") };
await act(async () => { root.render(React.createElement(Harness)); await tick(); });
const oldPending = pending.shift();
await act(async () => {
  oldPending.resolve(resultFor(oldPending.request, "Ein Text", "Ich sah Dune 2021."));
  await firstRun;
  await tick();
});
check("Textänderung bricht den Lauf ab und verwirft die verspätete Antwort", () => {
  assert.equal(oldPending.request.options.signal.aborted, true);
  assert.equal(model.status, "idle");
  assert.equal(model.suggestions.length, 0);
});

let secondRun;
await act(async () => { secondRun = model.start(); await tick(); });
const freshPending = pending.shift();
await act(async () => {
  freshPending.resolve(resultFor(freshPending.request, "Ein Text", props.editor.text));
  await secondRun;
  await tick();
});
check("Aktuelle Antwort enthält keine Vorauswahl und nur belegte lokale Werkoptionen", () => {
  assert.equal(model.status, "result");
  assert.equal(model.suggestions.length, 1);
  assert.deepEqual(model.suggestions[0].workOptions.map((option) => option.ref), ["dune-2021", "stream-dune"]);
  assert.deepEqual(catalogCalls.map((call) => call.query), ["Dune"]);
  assert.equal(catalogCalls[0].options.limit, 20);
  assert.equal(model.sources.streaming.status, "ready");
});

const selected = [{
  candidateId: "c-dune", selectionId: "c-dune:library:dune-2021", sourceKind: "library",
  ref: "dune-2021", title: "Dune", year: 2021, mediaType: "film", resolutionIntent: { kind: "auto" },
}];
const boundApply = model.apply;
let applyResult;
await act(async () => { applyResult = await model.apply(selected); await tick(); });
check("Übernahme prüft Health und Textbindung erneut und reicht genau einen atomaren Batch weiter", () => {
  assert.equal(applyResult.status, "applied");
  assert.equal(applied.length, 1);
  assert.equal(applied[0].candidates.length, 1);
  assert.equal(applied[0].draftKey, "draft-a");
  assert.equal(calls.filter((call) => call.task === "health").length, 2);
});
const streamingSelections = [{
  candidateId: "c-dune", selected: true, workIdentities: ["streaming:stream-dune"], manual: false,
}];
const streamingApplications = buildBlogReferenceApplications(model.suggestions, streamingSelections);
controllerNow = Date.parse("2030-01-01T00:06:00Z");
let expiredSourceApply;
await act(async () => { expiredSourceApply = await model.apply(streamingApplications.candidates); await tick(); });
check("Ein abgelaufener Quellenstand wird vor der Übernahme verworfen", () => {
  assert.equal(expiredSourceApply.status, "failed");
  assert.equal(expiredSourceApply.errorCode, "result-expired");
  assert.equal(applied.length, 1);
});
controllerNow = Date.parse("2030-01-01T00:00:00Z");

props = { ...props, editor: editor(`${props.editor.text} Nachtrag.`) };
await act(async () => { root.render(React.createElement(Harness)); await tick(); });
let staleApplyResult;
await act(async () => { staleApplyResult = await boundApply(selected); await tick(); });
check("Eine alte Übernahmefunktion bleibt nach Textänderung stale und schreibt keinen zweiten Batch", () => {
  assert.equal(staleApplyResult.status, "failed");
  assert.equal(staleApplyResult.errorCode, "stale-draft");
  assert.equal(applied.length, 1);
  assert.equal(model.status, "idle");
});

props = { ...props, accountScope: "account:b", editor: { ...props.editor, draftKey: "draft-b" } };
await act(async () => { root.render(React.createElement(Harness)); await tick(); });
check("Kontowechsel verwirft Ergebnis und bindet einen neuen Health-Handshake", () => {
  assert.equal(model.status, "idle");
  assert.equal(model.suggestions.length, 0);
  assert.equal(model.capability.status, "ready");
  assert.equal(calls.filter((call) => call.task === "health").length, 4);
});

const callsBeforeFull = calls.length;
props = { ...props, editor: editor("Ich sah Dune 2021.", 50) };
await act(async () => { root.render(React.createElement(Harness)); await tick(); });
let fullStart;
await act(async () => { fullStart = await model.start(); await tick(); });
check("Ein voller Blog startet keinen potenziell kostenpflichtigen Fachauftrag", () => {
  assert.equal(fullStart, false);
  assert.equal(model.startReason, "reference-limit");
  assert.equal(calls.slice(callsBeforeFull).some((call) => call.task === "blog-reference-extract"), false);
});

await act(async () => root.unmount());

const publicationContainer = document.createElement("div");
document.body.appendChild(publicationContainer);
const publicationRoot = createRoot(publicationContainer);
let publicationModel = null;
const publicationLibrary = [
  { id: "dune-1984", titel: "Dune", jahr: 1984, typ: "film" },
  { id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film" },
];
const publicationEmpty = Object.freeze([]);
let publicationStored = [];
const publicationWriteArticles = async (updater) => {
  publicationStored = updater(publicationStored);
  return true;
};
const publicationService = Object.freeze({ capability: async () => ({ ok: true }) });
function PublicationHarness() {
  publicationModel = useBlogPublicationController({
    accountScope: "account:a", enabled: true, articles: publicationEmpty, articlesReady: true,
    writeArticles: publicationWriteArticles,
    library: publicationLibrary, libraryReady: true, mustwatch: publicationEmpty, mustwatchReady: true,
    selectedServices: publicationEmpty, selectedServicesReady: true,
    service: publicationService,
  });
  return null;
}
await act(async () => { publicationRoot.render(React.createElement(PublicationHarness)); await tick(); });
await act(async () => {
  publicationModel.actions.onNewArticle();
  await tick();
  publicationModel.actions.onEditorChange({ title: "Remakes", text: "Dune 1984 und Dune 2021" });
  await tick();
});
const publicationDraft = publicationModel.editor;
const publicationHash = await blogReferenceContentHash({ title: publicationDraft.title, text: publicationDraft.text });
const remakeApplications = [
  { candidateId: "c-1", selectionId: "c-1:library:dune-1984", sourceKind: "library", ref: "dune-1984", title: "Dune", year: 1984, mediaType: "film", resolutionIntent: { kind: "auto" } },
  { candidateId: "c-2", selectionId: "c-2:library:dune-2021", sourceKind: "library", ref: "dune-2021", title: "Dune", year: 2021, mediaType: "film", resolutionIntent: { kind: "auto" } },
];
let publicationApply;
await act(async () => {
  publicationApply = await publicationModel.actions.onApplyReferenceSuggestions({
    draftKey: publicationDraft.draftKey, contentHash: publicationHash, candidates: remakeApplications,
  });
  await tick();
});
check("Der echte Publikationscontroller übernimmt mehrere gleichnamige Werke in genau einem Draft-Übergang", () => {
  assert.equal(publicationApply.status, "applied");
  assert.equal(publicationApply.addedCount, 2);
  assert.deepEqual(publicationModel.editor.references.map((row) => row.primaryTarget?.ref), ["dune-1984", "dune-2021"]);
});
const directStreamingApplication = {
  candidateId: "c-burn", selectionId: "c-burn:streaming:1768658", sourceKind: "streaming",
  ref: "1768658", title: "Evil Dead Burn", year: 2026, mediaType: "film",
  resolutionIntent: { kind: "auto" },
  sourceTarget: { kind: "streaming", art: "entdecken", ref: "1768658", titel: "Evil Dead Burn" },
  identityHints: [{ namespace: "imdb", value: "tt31170389" }, { namespace: "watchmode", value: "1768658" }],
};
let sourceApply;
await act(async () => {
  sourceApply = await publicationModel.actions.onApplyReferenceSuggestions({
    draftKey: publicationDraft.draftKey, contentHash: publicationHash,
    candidates: [directStreamingApplication],
  });
  await tick();
});
let privateSave;
await act(async () => {
  privateSave = await publicationModel.actions.onPrivateSave({ draftKey: publicationDraft.draftKey });
  await tick();
});
check("Direkte Streamingquelle bleibt nach privatem Speichern im Reload-Draft adressierbar", () => {
  assert.equal(sourceApply.status, "applied");
  assert.equal(privateSave.private.status, "saved");
  assert.equal(publicationStored[0].liste[2].sourceTarget.ref, "1768658");
  assert.equal(publicationModel.editor.references[2].primaryTarget.ref, "1768658");
  assert.equal(publicationStored[0].liste[2].identityHints[0].namespace, "imdb");
});
const beforeStale = publicationModel.editor.references.map((row) => row.rowId);
let publicationStale;
await act(async () => {
  publicationStale = await publicationModel.actions.onApplyReferenceSuggestions({
    draftKey: publicationDraft.draftKey, contentHash: "f".repeat(64), candidates: [remakeApplications[0]],
  });
  await tick();
});
check("Der Publikationscontroller weist einen alten Content-Hash ohne Draftänderung ab", () => {
  assert.equal(publicationStale.status, "failed");
  assert.equal(publicationStale.errorCode, "stale-draft");
  assert.deepEqual(publicationModel.editor.references.map((row) => row.rowId), beforeStale);
});
await act(async () => publicationRoot.unmount());
publicationContainer.remove();
console.log(`blog_reference_extract_client_controller_test: ${checks} Checks bestanden.`);
