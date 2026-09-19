import assert from "node:assert/strict";
import {
  BLOG_REFERENCE_EXTRACT_CONTRACT,
  blogReferenceContentHash,
  blogReferenceHealthPayload,
  buildBlogReferenceApplications,
  buildBlogReferenceSuggestions,
  readBlogReferenceExtractCapability,
  resolveBlogReferenceCatalogSources,
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
check("Exakte Belege und Modelltexte dürfen belegte Rand-Leerzeichen unverändert behalten", () => {
  const spacedInput = { title: "Beleg", text: " Dune 2021 " };
  const spacedResponse = {
    ...response,
    data: { ...response.data, candidates: [{
      ...response.data.candidates[1], candidateId: "c-spaced", mention: " Dune",
      titleSuggestion: " Dune ",
      evidence: { field: "text", quote: " Dune 2021 ", start: 0, end: spacedInput.text.length },
    }] },
  };
  const result = validateBlogReferenceExtractionResponse(spacedResponse, spacedInput);
  assert.equal(result.ok, true);
  assert.equal(result.value.candidates[0].evidence.quote, spacedInput.text);
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
  assert.deepEqual(suggestions[0].workOptions.map((option) => option.year), [1720]);
  assert.deepEqual(suggestions[1].workOptions.map((option) => option.year), [2021]);
  assert.equal(suggestions[0].requiresWorkDecision, false);
  assert.equal(suggestions[1].requiresWorkDecision, false);
  const ambiguous = buildBlogReferenceSuggestions([{ ...response.data.candidates[1], year: null }], {
    library: [
      { id: "dune-1984", titel: "Dune", jahr: 1984, typ: "film" },
      { id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film" },
      { id: "wrong-type", titel: "Dune", jahr: 2021, typ: "musik" },
    ],
  });
  assert.deepEqual(ambiguous[0].workOptions.map((option) => option.year), [1984, 2021]);
  assert.equal(ambiguous[0].requiresWorkDecision, true);
  const prefix = buildBlogReferenceSuggestions([{ ...response.data.candidates[1], titleSuggestion: "The Odyssey", year: null }], {
    library: [{ id: "odyssey", titel: "2001: A Space Odyssey", jahr: 1968, typ: "film" }],
  });
  assert.equal(prefix[0].workOptions.length, 0);
  assert.equal(prefix[0].requiresWorkDecision, false);
});

check("Ein klares Werk braucht nach der Erwähnungsauswahl keine zweite Bestätigung", () => {
  const selected = buildBlogReferenceApplications(suggestions, [{
    candidateId: "c-dune", selected: true, workIdentities: [], manual: false,
  }]);
  assert.equal(selected.ok, true);
  assert.equal(selected.candidates[0].sourceKind, "work");
  assert.equal(selected.candidates[0].ref, null);
  assert.deepEqual(selected.candidates[0].resolutionIntent, { kind: "auto" });
  assert.equal(selected.candidates[0].workIdentity.year, 2021);
});

check("Nur echte Werkmehrdeutigkeit verlangt eine bewusste Werkauswahl", () => {
  const ambiguous = buildBlogReferenceSuggestions([{ ...response.data.candidates[1], year: null }], {
    library: [
      { id: "dune-1984", titel: "Dune", jahr: 1984, typ: "film" },
      { id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film" },
    ],
  });
  const open = buildBlogReferenceApplications(ambiguous, [{
    candidateId: "c-dune", selected: true, workIdentities: [], manual: false,
  }]);
  assert.equal(open.reason, "work-decision-required");
  const selected = buildBlogReferenceApplications(ambiguous, [{
    candidateId: "c-dune", selected: true,
    workIdentities: [ambiguous[0].workOptions[1].identity], manual: false,
  }]);
  assert.equal(selected.ok, true);
  assert.equal(selected.candidates[0].workIdentity.year, 2021);
});

let sourceActive = 0;
let sourceMaxActive = 0;
const sourceCalls = [];
const sourceCandidates = [
  { ...response.data.candidates[1], candidateId: "c-burn", titleSuggestion: "Evil Dead Burn", year: 2026 },
  { ...response.data.candidates[1], candidateId: "c-cinema", titleSuggestion: "Kinofilm", year: 2026 },
  { ...response.data.candidates[0], candidateId: "c-music-source" },
];
const sources = await resolveBlogReferenceCatalogSources(sourceCandidates, {
  streamingService: { search: async (query, { limit }) => {
    sourceCalls.push({ query, limit });
    sourceActive += 1;
    sourceMaxActive = Math.max(sourceMaxActive, sourceActive);
    await Promise.resolve();
    sourceActive -= 1;
    return { status: "ready", version: "mw1-69", expiresAt: "2030-01-01T00:05:00.000Z", items: query === "Evil Dead Burn" ? [{
      id: "1768658", titel: "Evil Dead Burn", jahr: 2026, typ: "movie",
      dienste: ["Amazon", "AppleTV", "Rakuten TV", "Sky Store", "maxdome Store"],
      watchmode_id: "1768658", imdb_id: "tt31170389",
    }] : [] };
  } },
  cinema: { filme: [{ film_at_id: "kino-1", t: "Kinofilm", j: 2026 }] },
  cinemaReady: true,
  cinemaExpiresAt: "2030-01-01T00:10:00.000Z",
  clock: () => Date.parse("2030-01-01T00:00:00.000Z"),
});
check("Streaming-Suchen laufen dedupliziert und seriell; Musik löst keine Katalogsuche aus", () => {
  assert.deepEqual(sourceCalls, [
    { query: "Evil Dead Burn", limit: 20 }, { query: "Kinofilm", limit: 20 },
  ]);
  assert.equal(sourceMaxActive, 1);
  assert.equal(sources.streaming.status, "ready");
  assert.equal(sources.cinema.status, "ready");
});
let failedLookupCalls = 0;
const failedSources = await resolveBlogReferenceCatalogSources(sourceCandidates, {
  streamingService: { search: async () => { failedLookupCalls += 1; throw new Error("429"); } },
  cinema: { filme: [{ film_at_id: "expired-kino", t: "Kinofilm", j: 2026 }] },
  cinemaReady: true,
  cinemaExpiresAt: Date.parse("2029-12-31T23:59:59.000Z"),
  clock: () => Date.parse("2030-01-01T00:00:00.000Z"),
});
check("Ein Quellenfehler stoppt ohne Retry und ungeladene Quellen werden nicht als geprüft ausgegeben", () => {
  assert.equal(failedLookupCalls, 1);
  assert.equal(failedSources.streaming.status, "failed");
  assert.equal(failedSources.cinema.status, "unavailable");
  assert.equal(failedSources.streaming.items.length, 0);
});
let boundedCalls = 0;
const boundedSources = await resolveBlogReferenceCatalogSources(Array.from({ length: 10 }, (_, index) => ({
  kind: "film", titleSuggestion: `Titel ${index}`,
})), {
  streamingService: { search: async () => {
    boundedCalls += 1;
    return { status: "ready", version: "mw1", expiresAt: "2030-01-01T00:05:00.000Z", items: [] };
  } },
  clock: () => Date.parse("2030-01-01T00:00:00.000Z"),
});
check("Der gezielte Streamingabgleich bleibt bei acht seriellen Suchbegriffen begrenzt", () => {
  assert.equal(boundedCalls, 8);
  assert.equal(boundedSources.streaming.status, "partial");
  assert.equal(boundedSources.streaming.totalQueries, 10);
});
const sourceSuggestions = buildBlogReferenceSuggestions(sourceCandidates, {
  streaming: sources.streaming.items,
  cinema: sources.cinema.items,
  sourceExpiresAt: {
    streaming: sources.streaming.expiresAt,
    cinema: sources.cinema.expiresAt,
  },
});
check("Vorhandene Streaming- und Kino-IDs werden typgerecht und mit sichtbarer Herkunft angeboten", () => {
  assert.equal(sourceSuggestions[0].workOptions[0].mediaType, "film");
  assert.deepEqual(sourceSuggestions[0].workOptions[0].sourceLabels, ["Streaming-Katalog"]);
  assert.equal(sourceSuggestions[0].workOptions[0].sourceObservations[0].target.ref, "1768658");
  assert.equal("sourceId" in sourceSuggestions[0].workOptions[0].sourceObservations[0].target, false);
  assert.deepEqual(sourceSuggestions[1].workOptions[0].sourceLabels, ["Kinoprogramm"]);
  assert.equal(sourceSuggestions[1].workOptions[0].sourceObservations[0].target.ref, "kino-1");
});
const streamingApplication = buildBlogReferenceApplications(sourceSuggestions, [{
  candidateId: "c-burn", selected: true, workIdentities: [], manual: false,
}]);
check("Shop-only-Katalogtreffer speichert das Werk und nur eine befristete private Quellenbeobachtung", () => {
  assert.equal(streamingApplication.ok, true);
  assert.equal(streamingApplication.candidates[0].sourceKind, "work");
  assert.equal(streamingApplication.candidates[0].ref, null);
  assert.deepEqual(streamingApplication.candidates[0].workIdentity.identityHints, [
    { namespace: "imdb", value: "tt31170389" },
    { namespace: "watchmode", value: "1768658" },
  ]);
  assert.equal(streamingApplication.candidates[0].sourceObservations[0].target.ref, "1768658");
});

const odysseyCandidate = {
  ...response.data.candidates[1], candidateId: "c-2001", titleSuggestion: "2001: A Space Odyssey", year: 1968,
};
const odysseySuggestions = buildBlogReferenceSuggestions([odysseyCandidate], {
  library: [{ id: "lib-2001", titel: "2001: A Space Odyssey", jahr: 1968, typ: "film" }],
  streaming: [{ id: "stream-2001", titel: "2001: A Space Odyssey", jahr: 1968, typ: "movie",
    imdb_id: "tt0062622", watchmode_id: "stream-2001" }],
  cinema: [{ id: "kino-2001", titel: "2001: A Space Odyssey", jahr: 1968, typ: "film", film_at_id: "kino-2001" }],
  sourceExpiresAt: { streaming: "2030-01-01T00:05:00.000Z", cinema: "2030-01-01T00:10:00.000Z" },
});
check("Dasselbe Werk aus Mediathek, Streaming und Kino erscheint genau einmal ohne Unterauswahl", () => {
  assert.equal(odysseySuggestions[0].workOptions.length, 1);
  assert.equal(odysseySuggestions[0].requiresWorkDecision, false);
  assert.deepEqual(odysseySuggestions[0].workOptions[0].sourceLabels,
    ["Streaming-Katalog", "Kinoprogramm", "Mediathek"]);
  const application = buildBlogReferenceApplications(odysseySuggestions, [{
    candidateId: "c-2001", selected: true, workIdentities: [], manual: false,
  }]);
  assert.equal(application.ok, true);
  assert.equal(application.candidates.length, 1);
});

check("Widersprüchliche starke IDs werden nicht durch einen ID-losen Fund transitiv verbunden", () => {
  const conflicts = buildBlogReferenceSuggestions([odysseyCandidate], {
    library: [{ id: "plain", titel: "2001: A Space Odyssey", jahr: 1968, typ: "film" }],
    streaming: [
      { id: "a", titel: "2001: A Space Odyssey", jahr: 1968, typ: "movie", imdb_id: "tt-a" },
      { id: "b", titel: "2001: A Space Odyssey", jahr: 1968, typ: "movie", imdb_id: "tt-b" },
    ],
  });
  assert.equal(conflicts[0].workOptions.length, 3);
  assert.equal(conflicts[0].requiresWorkDecision, true);
});

check("Ein klares Werk ohne Bestand bleibt auto-auflösbar und wird nicht dauerhaft zum Rotlink", () => {
  const clear = buildBlogReferenceSuggestions([{ ...response.data.candidates[1], candidateId: "c-clear",
    titleSuggestion: "Unbekannter klarer Film", year: 2025 }]);
  const application = buildBlogReferenceApplications(clear, [{
    candidateId: "c-clear", selected: true, workIdentities: [], manual: false,
  }]);
  assert.equal(clear[0].requiresWorkDecision, false);
  assert.equal(application.ok, true);
  assert.deepEqual(application.candidates[0].resolutionIntent, { kind: "auto" });
  assert.equal(application.candidates[0].workIdentity.identityHints.length, 0);
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
check("Ein belegtes Werk behält private Quellenbeobachtung und starke IDs ohne Mediathekwrite", () => {
  const result = applyBlogReferenceSuggestionsToDraft(draft, {
    draftKey: "draft-1", library, candidates: streamingApplication.candidates,
  });
  assert.equal(result.status, "applied");
  assert.equal(result.draft.references[1].primaryTarget, undefined);
  assert.deepEqual(result.draft.references[1].sourceObservations[0].target, {
    kind: "streaming", art: "entdecken", ref: "1768658", titel: "Evil Dead Burn",
  });
  assert.equal(result.draft.references[1].workIdentity.identityHints[0].namespace, "imdb");
  assert.equal(result.draft.references[1].ref, null);
});
check("Ein späterer Scan erkennt dasselbe Werk auch bei einer Teilmenge starker IDs als Dublette", () => {
  const existingWork = applyBlogReferenceSuggestionsToDraft(draft, {
    draftKey: "draft-1", library, candidates: streamingApplication.candidates,
  }).draft;
  const repeat = structuredClone(streamingApplication.candidates[0]);
  repeat.selectionId = "c-burn:repeat";
  repeat.workIdentity.identityHints = [{ namespace: "imdb", value: "tt31170389" }];
  repeat.sourceObservations = [];
  const result = applyBlogReferenceSuggestionsToDraft(existingWork, {
    draftKey: "draft-1", library, candidates: [repeat],
  });
  assert.equal(result.status, "applied");
  assert.equal(result.addedCount, 0);
  assert.equal(result.draft.references.length, existingWork.references.length);
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
  const forgedSource = structuredClone(streamingApplication.candidates[0]);
  forgedSource.sourceObservations[0].unexpected = "vom-modell-erfunden";
  const forged = applyBlogReferenceSuggestionsToDraft(draft, {
    draftKey: "draft-1", library, candidates: [forgedSource],
  });
  assert.equal(forged.status, "failed");
  assert.equal(forged.draft, draft);
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

const fullScanInput = {
  title: "Scan-Reproduktion",
  text: `JOOOHNNYYY TEEEEEESST
Space odyssee
Blabla roter oktober blabla
Trash grindhouse nicolas cage AEG city of god mashed potato
Im Kino habe ich letztens Evil Dead gesehen. Den neuen. Der sich so alt angefühlt hat… kein Retro, aber ein Remake von einem Remake. Spaß hat Evil Dead Burn trotzdem gemacht, kappa.`,
};
const fullCandidate = (candidateId, mention, titleSuggestion, kind = "film", interpretation = "direct") => {
  const start = fullScanInput.text.indexOf(mention);
  assert.notEqual(start, -1);
  return {
    candidateId, mention, titleSuggestion, kind, year: null, interpretation,
    evidence: { field: "text", quote: mention, start, end: start + mention.length },
  };
};
const freshEnvelope = {
  ok: true,
  task: "blog-reference-extract",
  vorgangId: "33333333-3333-4333-8333-333333333333",
  modellAlias: "gross",
  modell: "claude-sonnet-4-5-20250929",
  data: {
    contractVersion: "blog-reference-extract-v1",
    candidates: [
      fullCandidate("scan-johnny", "JOOOHNNYYY TEEEEEESST", "Johnny Test", "series", "interpreted"),
      fullCandidate("scan-space", "Space odyssee", "2001: A Space Odyssey", "film", "interpreted"),
      fullCandidate("scan-oktober", "roter oktober", "Jagd auf Roter Oktober", "film", "interpreted"),
      fullCandidate("scan-city", "city of god", "City of God"),
      fullCandidate("scan-evil", "Evil Dead", "Evil Dead"),
    ],
    partial: false,
    expiresAt: "2030-09-19T12:00:00.000Z",
  },
  providerReceipt: {
    schemaVersion: "provider-receipt-v1", provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    usage: { inputTokens: 240, outputTokens: 510 },
    responseSha256: "a".repeat(64), resultMode: "structured",
    server: { logId: 123, providerRequests: 1, reservationUsdCent: 500, costUsdCent: 1.25 },
  },
  verbrauch: {
    inputTokens: 240, outputTokens: 510, kostenUsdCent: 1.25,
    dauerMs: 6123, stopReason: "end_turn",
  },
};
const freshAi = createAiService({
  auth: { requireAccount: () => ({ account: { id: "account-a" } }) },
  config: { aiEndpointName: "ai-task", schemaVersion: "v5" },
  transport: async () => structuredClone(freshEnvelope),
});
const freshRaw = await freshAi.runTask("blog-reference-extract", fullScanInput);
check("Frische AI-Task-Hülle und Cache-Hülle liefern dieselben fünf nicht vorausgewählten Vorschläge", () => {
  const fresh = validateBlogReferenceExtractionResponse(freshRaw, fullScanInput);
  const cached = validateBlogReferenceExtractionResponse({
    ok: freshEnvelope.ok, task: freshEnvelope.task,
    vorgangId: freshEnvelope.vorgangId, data: structuredClone(freshEnvelope.data),
  }, fullScanInput);
  assert.equal(fresh.ok, true);
  assert.equal(cached.ok, true);
  assert.equal(fresh.value.candidates.length, 5);
  assert.deepEqual(fresh.value.candidates, cached.value.candidates);
  const freshSuggestions = buildBlogReferenceSuggestions(fresh.value.candidates);
  assert.equal(freshSuggestions.every((suggestion) => !("selected" in suggestion)), true);
  assert.equal(buildBlogReferenceApplications(freshSuggestions, []).reason, "empty-selection");
  assert.equal("modell" in fresh.value, false);
  assert.equal("providerReceipt" in fresh.value, false);
  assert.equal("verbrauch" in fresh.value, false);

  const unknownEnvelope = { ...freshRaw, unexpected: "nicht vereinbart" };
  assert.equal(validateBlogReferenceExtractionResponse(unknownEnvelope, fullScanInput).ok, false);
  const malformedEvidence = structuredClone(freshRaw);
  malformedEvidence.data.candidates[0].evidence.start += 1;
  assert.equal(validateBlogReferenceExtractionResponse(malformedEvidence, fullScanInput).ok, false);
});
const hashA = await blogReferenceContentHash(input);
const hashB = await blogReferenceContentHash({ ...input, text: `${input.text} ` });
check("Der Content-Hash bindet die exakte Titel/Text-Paarung", () => assert.notEqual(hashA, hashB));

console.log(`blog_reference_extract_client_test: ${checks} Checks bestanden.`);
