import assert from "node:assert/strict";
import {
  BLOG_REFERENCE_EXTRACT_CONTRACT,
  blogReferenceContentHash,
  blogReferenceHealthPayload,
  buildBlogReferenceApplications,
  buildBlogReferenceSuggestions,
  readBlogReferenceExtractCapability,
  validateBlogReferenceExtractionInput,
  validateBlogReferenceExtractionResponse,
} from "./src/lib/blogReferenceExtraction.js";
import { createAiService } from "./src/services/ai.js";
import { applyBlogReferenceSuggestionsToDraft } from "./src/controllers/useBlogPublicationController.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const health = (enabled = true) => ({
  ok: true, task: "health",
  activation: { userTasks: ["blog-profile-extract", "blog-reference-extract"] },
  capabilities: { blogReferenceExtract: {
    contractVersion: BLOG_REFERENCE_EXTRACT_CONTRACT,
    enabled, modelAlias: "gross", maxTextBytes: 18000, maxTitleBytes: 512, maxCandidates: 50,
  } },
});

check("Health fordert nur die ausgehandelte Capability an",
  () => assert.deepEqual(blogReferenceHealthPayload(), { capabilities: ["blog-reference-extract-v1"] }));
check("Nur die exakte aktive Capability mit neuem Task gilt als bereit", () => {
  assert.equal(readBlogReferenceExtractCapability(health())?.modelAlias, "gross");
  assert.equal(readBlogReferenceExtractCapability(health(false)), null);
  assert.equal(readBlogReferenceExtractCapability({ ...health(), activation: { userTasks: [] } }), null);
  assert.equal(readBlogReferenceExtractCapability({ ...health(), capabilities: {
    blogReferenceExtract: { ...health().capabilities.blogReferenceExtract, maxCandidates: 51 },
  } }), null);
});

const input = { title: "Musik und Dune", text: "Ich hörte 1720 Water Music und sah Dune 2021. 😀 Dune bleibt gut." };
const response = {
  ok: true, task: "blog-reference-extract", vorgangId: "11111111-1111-4111-8111-111111111111",
  data: {
    contractVersion: "blog-reference-extract-v1", partial: false,
    expiresAt: "2030-09-18T10:00:00.000Z",
    candidates: [
      { candidateId: "c-music", mention: "Water Music", titleSuggestion: "Water Music", kind: "music", year: 1720, interpretation: "direct",
        evidence: { field: "text", quote: "1720 Water Music", start: 10, end: 26 } },
      { candidateId: "c-dune", mention: "Dune", titleSuggestion: "Dune", kind: "film", year: 2021, interpretation: "direct",
        evidence: { field: "text", quote: "Dune 2021", start: 35, end: 44 } },
    ],
  },
};
check("UTF-16-Belegstellen und typabhängige historische Jahre werden akzeptiert", () => {
  const result = validateBlogReferenceExtractionResponse(response, input);
  assert.equal(result.ok, true);
  assert.equal(result.value.candidates[0].year, 1720);
});
check("Filmjahre vor 1870 und manipulierte Belege werden fail-closed abgewiesen", () => {
  const oldFilm = structuredClone(response);
  oldFilm.data.candidates[1].year = 1720;
  oldFilm.data.candidates[1].evidence.quote = "1720 Water Music";
  oldFilm.data.candidates[1].evidence.start = 10;
  oldFilm.data.candidates[1].evidence.end = 26;
  oldFilm.data.candidates[1].mention = "Water Music";
  assert.equal(validateBlogReferenceExtractionResponse(oldFilm, input).ok, false);
  const wrongOffset = structuredClone(response);
  wrongOffset.data.candidates[0].evidence.start = 11;
  assert.equal(validateBlogReferenceExtractionResponse(wrongOffset, input).ok, false);
  const modelUrl = structuredClone(response);
  modelUrl.data.candidates[0].url = "https://example.invalid/work";
  assert.equal(validateBlogReferenceExtractionResponse(modelUrl, input).ok, false);
});
check("Mention und Titelvorschlag zählen bis 160 Unicode-Zeichen statt UTF-8-Bytes", () => {
  const unicodeTitle = "ä".repeat(160);
  const unicodeInput = { title: "Unicode", text: unicodeTitle };
  const unicodeResponse = {
    ...response,
    data: { ...response.data, candidates: [{
      ...response.data.candidates[0], candidateId: "c-unicode", mention: unicodeTitle,
      titleSuggestion: unicodeTitle, year: null,
      evidence: { field: "text", quote: unicodeTitle, start: 0, end: unicodeTitle.length },
    }] },
  };
  assert.equal(validateBlogReferenceExtractionResponse(unicodeResponse, unicodeInput).ok, true);
  unicodeResponse.data.candidates[0].titleSuggestion += "ä";
  assert.equal(validateBlogReferenceExtractionResponse(unicodeResponse, unicodeInput).ok, false);
});
check("Der Fachauftrag verlangt Überschrift und Blogtext, ohne den Entwurf zu verändern", () => {
  assert.equal(validateBlogReferenceExtractionInput({ title: "", text: "Text" }).reason, "empty-title");
  assert.equal(validateBlogReferenceExtractionInput({ title: "Titel", text: "" }).reason, "empty-text");
});

const suggestions = buildBlogReferenceSuggestions(response.data.candidates, {
  library: [
    { id: "dune-1984", titel: "Dune", jahr: 1984, typ: "film", regie: "David Lynch" },
    { id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film", regie: "Denis Villeneuve" },
    { id: "water-1720", titel: "Water Music", jahr: 1720, typ: "musik", kuenstler: "G. F. Handel" },
    { id: "odyssey", titel: "2001: A Space Odyssey", jahr: 1968, typ: "film" },
  ],
});
check("Exaktes Titel/Jahr/Typ-Matching trennt Remakes, Musik und Prefix-Fallen", () => {
  assert.deepEqual(suggestions[0].workOptions.map((option) => option.ref), ["water-1720"]);
  assert.deepEqual(suggestions[1].workOptions.map((option) => option.ref), ["dune-2021"]);
  const ambiguous = buildBlogReferenceSuggestions([{ ...response.data.candidates[1], year: null }], {
    library: [
      { id: "dune-1984", titel: "Dune", jahr: 1984, typ: "film" },
      { id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film" },
      { id: "wrong-type", titel: "Dune", jahr: 2021, typ: "musik" },
    ],
  });
  assert.deepEqual(ambiguous[0].workOptions.map((option) => option.ref), ["dune-1984", "dune-2021"]);
  const prefix = buildBlogReferenceSuggestions([{ ...response.data.candidates[1], titleSuggestion: "The Odyssey", year: null }], {
    library: [{ id: "odyssey", titel: "2001: A Space Odyssey", jahr: 1968, typ: "film" }],
  });
  assert.equal(prefix[0].workOptions.length, 0);
});

check("Erwähnung und konkrete Werke sind getrennt und nie vorausgewählt", () => {
  const empty = buildBlogReferenceApplications(suggestions, suggestions.map((suggestion) => ({
    candidateId: suggestion.candidateId, selected: true, workIdentities: [], manual: false,
  })));
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "work-decision-required");
  const selected = buildBlogReferenceApplications(suggestions, [{
    candidateId: "c-dune", selected: true,
    workIdentities: ["library:dune-2021"], manual: true,
    manualTitle: "Dune (Essay)", manualYear: "2021", manualType: "sonstiges",
  }]);
  assert.equal(selected.ok, true);
  assert.deepEqual(selected.candidates.map((candidate) => candidate.ref), ["dune-2021", null]);
});

const draft = {
  draftKey: "draft-1", accountScope: "account:a", saveStatus: "idle", dirty: false,
  references: [{ rowId: "existing", title: "Vorhanden", year: 2000, mediaType: "film", ref: "existing" }],
};
const library = [
  { id: "existing", titel: "Vorhanden", jahr: 2000, typ: "film" },
  { id: "dune-1984", titel: "Dune", jahr: 1984, typ: "film" },
  { id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film" },
];
const application = (id, year) => ({
  candidateId: `c-${id}`, selectionId: `c-${id}:library:${id}`, sourceKind: "library", ref: id,
  title: "Dune", year, mediaType: "film", resolutionIntent: { kind: "auto" },
});
check("Atomare Übernahme bewahrt Reihenfolge, überspringt bestätigte Identitätsdubletten und trennt Remakes", () => {
  const result = applyBlogReferenceSuggestionsToDraft(draft, {
    draftKey: "draft-1", library,
    candidates: [application("dune-1984", 1984), application("dune-2021", 2021), {
      candidateId: "c-existing", selectionId: "c-existing:library:existing", sourceKind: "library", ref: "existing",
      title: "Vorhanden", year: 2000, mediaType: "film", resolutionIntent: { kind: "auto" },
    }],
  });
  assert.equal(result.status, "applied");
  assert.equal(result.addedCount, 2);
  assert.deepEqual(result.draft.references.map((row) => row.ref), ["existing", "dune-1984", "dune-2021"]);
});
check("Zu wenig Platz und erfundene Modell-IDs ändern keinen gespeicherten Inhalt", () => {
  const full = { ...draft, references: Array.from({ length: 50 }, (_, index) => ({
    rowId: `row-${index}`, title: `Titel ${index}`, year: 2000, mediaType: "film", ref: `ref-${index}`,
  })) };
  const capacity = applyBlogReferenceSuggestionsToDraft(full, {
    draftKey: "draft-1", library, candidates: [application("dune-1984", 1984)],
  });
  assert.equal(capacity.status, "failed");
  assert.equal(capacity.errorCode, "selection-too-large");
  assert.equal(capacity.draft, full);
  const fake = applyBlogReferenceSuggestionsToDraft(draft, {
    draftKey: "draft-1", library, candidates: [application("model-url", 2021)],
  });
  assert.equal(fake.status, "failed");
  assert.equal(fake.draft, draft);
});

let sent = null;
const ai = createAiService({
  auth: { requireAccount: () => ({ account: { id: "account-a" } }) },
  config: { aiEndpointName: "ai-task", schemaVersion: "v5" },
  vorgangId: () => "22222222-2222-4222-8222-222222222222",
  transport: async (request) => { sent = request; return { ...response, vorgangId: request.vorgangId }; },
});
await ai.runTask("blog-reference-extract", input);
check(".runTask registriert den neuen Task getrennt und überlässt beide Versionen dem Server", () => {
  assert.equal(sent.task, "blog-reference-extract");
  assert.equal(sent.promptVersion, null);
  assert.equal(sent.profilVersion, null);
  assert.deepEqual(sent.payload, input);
});
const hashA = await blogReferenceContentHash(input);
const hashB = await blogReferenceContentHash({ ...input, text: `${input.text} ` });
check("Der Content-Hash bindet die exakte Titel/Text-Paarung", () => assert.notEqual(hashA, hashB));

console.log(`blog_reference_extract_client_test: ${checks} Checks bestanden.`);
