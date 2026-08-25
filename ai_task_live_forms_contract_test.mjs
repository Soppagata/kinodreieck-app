#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  klassifiziereBlogProfileLiveAntwort,
  klassifiziereFilmwissenLiveAntwort,
  klassifiziereMediaBatchLiveAntwort,
} from "./tools/ai_task_live_forms_contract.mjs";

const COST = 0.42;
const receipt = (resultMode = "structured") => ({
  schemaVersion: "provider-receipt-v1",
  provider: "anthropic",
  model: "claude-test-20260824",
  usage: { inputTokens: 100, outputTokens: 20 },
  responseSha256: "a".repeat(64),
  resultMode,
  server: {
    logId: 42,
    providerRequests: 1,
    reservationUsdCent: 1.5,
    costUsdCent: COST,
  },
});
const envelope = (task, data, extra = {}) => ({
  ok: true,
  task,
  vorgangId: "11111111-2222-4333-8444-555555555555",
  modellAlias: task === "filmwissen-synthese" ? "gross" : "klein",
  modell: "claude-test-20260824",
  data,
  responseMode: "structured",
  displayText: null,
  warnings: [],
  providerReceipt: receipt(),
  verbrauch: {
    inputTokens: 100,
    outputTokens: 20,
    kostenUsdCent: COST,
    dauerMs: 80,
    stopReason: "end_turn",
  },
  ...extra,
});

const film = envelope("filmwissen-synthese", {
  status: "belegt",
  versionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
});
const filmForm = klassifiziereFilmwissenLiveAntwort({
  antwort: film,
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(filmForm.dataClass, "filmwissen-version-object");
assert.equal(filmForm.parserEligible, true);

const entwurf = klassifiziereFilmwissenLiveAntwort({
  antwort: envelope("filmwissen-synthese", {
    format: "filmwissen-entwurf-v1",
    status: "entwurf",
    claims: [],
  }),
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(entwurf.branch, "filmwissen-draft-object");
assert.equal(entwurf.parserEligible, false);

const blogLeer = klassifiziereBlogProfileLiveAntwort({
  antwort: envelope("blog-profile-extract", {
    geschmackszuege: [],
    vokabular: [],
  }),
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(blogLeer.dataClass, "blog-list-pair-object");
assert.equal(blogLeer.parserEligible, true);

const blogNull = klassifiziereBlogProfileLiveAntwort({
  antwort: envelope("blog-profile-extract", null, {
    responseMode: "degraded",
    displayText: "Fester Produkthinweis",
    warnings: ["no-safe-structure", "NICHT-AUSGEBEN-885"],
    providerReceipt: receipt("degraded"),
  }),
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(blogNull.branch, "blog-profile-extract-data-null");
assert.equal(blogNull.parserEligible, false);
assert.equal(blogNull.responseMode, "degraded");
assert.deepEqual(blogNull.warningCodes, ["no-safe-structure"]);
assert.equal(JSON.stringify(blogNull).includes("NICHT-AUSGEBEN-885"), false);

const blogDegradedMitDaten = klassifiziereBlogProfileLiveAntwort({
  antwort: envelope("blog-profile-extract", {
    geschmackszuege: [],
    vokabular: [],
  }, {
    responseMode: "degraded",
    displayText: "Fester Produkthinweis",
    warnings: ["unstructured-provider-text"],
    providerReceipt: receipt("degraded"),
  }),
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(blogDegradedMitDaten.dataClass, "blog-list-pair-object");
assert.equal(blogDegradedMitDaten.parserEligible, false);

const mediaAntwort = envelope("media-batch-extract", {
  kandidaten: [{ titel: "NICHT-AUSGEBEN-884" }],
  warnungen: [],
  fehlmenge: [],
}, {
  responseMode: "partial",
  displayText: "Fester Produkthinweis",
  warnings: ["invalid-items-ignored"],
  providerReceipt: receipt("partial"),
});
const media = klassifiziereMediaBatchLiveAntwort({
  antwort: mediaAntwort,
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(media.dataClass, "media-batch-object");
assert.equal(media.parserEligible, true);
assert.equal(media.responseMode, "partial");
assert.deepEqual(media.warningCodes, ["invalid-items-ignored"]);
assert.equal(JSON.stringify(media).includes("NICHT-AUSGEBEN-884"), false);
assert.equal(JSON.stringify(media).includes(mediaAntwort.vorgangId), false);

const ohneReceipt = structuredClone(mediaAntwort);
delete ohneReceipt.providerReceipt;
const receiptFehlt = klassifiziereMediaBatchLiveAntwort({
  antwort: ohneReceipt,
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(receiptFehlt.receiptState, "absent");
assert.equal(receiptFehlt.providerProof, "unproven");
assert.equal(receiptFehlt.parserEligible, false);

const unbekannt = klassifiziereMediaBatchLiveAntwort({
  antwort: {
    ...mediaAntwort,
    "NICHT-AUSGEBEN-ROOT-886": true,
    data: {
      ...mediaAntwort.data,
      "NICHT-AUSGEBEN-DATA-887": true,
    },
  },
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(unbekannt.envelopeClass, "unexpected-envelope");
assert.equal(unbekannt.parserEligible, false);
assert.equal(unbekannt.unknownRootKeyCount, 1);
assert.equal(JSON.stringify(unbekannt).includes("NICHT-AUSGEBEN"), false);

const unbekannteDaten = klassifiziereMediaBatchLiveAntwort({
  antwort: {
    ...mediaAntwort,
    data: {
      ...mediaAntwort.data,
      "NICHT-AUSGEBEN-DATA-888": true,
    },
  },
  status: 200,
  measuredCostUsdCent: COST,
});
assert.equal(unbekannteDaten.envelopeClass, "normal-success-envelope");
assert.equal(unbekannteDaten.parserEligible, false);
assert.equal(unbekannteDaten.unknownDataKeyCount, 1);
assert.equal(JSON.stringify(unbekannteDaten).includes("NICHT-AUSGEBEN"), false);

const fehler = klassifiziereMediaBatchLiveAntwort({
  antwort: {
    ok: false,
    code: "invalid-response",
    grund: "provider-receipt-invalid",
    vorgangId: "11111111-2222-4333-8444-555555555555",
  },
  status: 502,
  measuredCostUsdCent: COST,
});
assert.equal(fehler.branch, "receipt-construction-failed");
assert.equal(
  JSON.stringify(fehler).includes("provider-receipt-invalid"),
  false,
);

console.log("ai_task_live_forms_contract_test: 8 Checks bestanden.");
