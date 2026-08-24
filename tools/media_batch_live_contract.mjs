/* Sichere, inhaltsfreie Klassifikation des normalen Media-Batch-Livepfads.
   Dieses Modul hat keine Netzwerk- oder Persistenzwirkung. Es gibt weder
   Antwortwerte noch Providertext aus, sondern nur Root-Keynamen, Typklassen
   und stabile Vertragsklassen. */

import {
  erstelleAnbieterPfadBelege,
  providerReceiptBelegAusAntwort,
  ProviderReceiptEvidenceError,
} from "./ai_smoke_contract.mjs";

export const MEDIA_BATCH_LIVE_TASK = "media-batch-extract";
export const MEDIA_BATCH_LIVE_SHAPE_VERSION = "media-batch-live-shape-v1";

const FEHLERZWEIGE = new Map([
  ["invalid-response|provider-receipt-invalid", "receipt-construction-failed"],
  ["invalid-response|antwort-zu-gross", "provider-response-too-large"],
  ["invalid-response|antwort-verletzt-schema", "provider-text-or-result-rejected"],
  ["invalid-response|antwort-abgeschnitten", "provider-output-truncated"],
  ["invalid-response|kontextfenster-ueberschritten", "provider-context-window"],
  ["invalid-response|antwort-pausiert", "provider-output-paused"],
  ["ai-refused|", "provider-refused"],
  ["limit|anbieter-request-istkostenlimit-ueberschritten", "provider-actual-cost-limit"],
  ["server|anbieter-request-istkosten-unbekannt", "provider-actual-cost-unknown"],
]);

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function typeClass(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (plain(value)) return "object";
  if (["boolean", "number", "string"].includes(typeof value)) return typeof value;
  return "other";
}

function rootShape(value) {
  if (!plain(value)) return Object.freeze([]);
  return Object.freeze(Object.keys(value).sort().map((key) => Object.freeze({
    key,
    type: typeClass(value[key]),
  })));
}

function httpClass(status) {
  if (!Number.isInteger(status) || status < 100 || status > 599) return "unknown";
  return `${Math.floor(status / 100)}xx`;
}

function envelopeClass(antwort) {
  if (!plain(antwort)) return "non-object-envelope";
  if (antwort.ok === true && antwort.task === MEDIA_BATCH_LIVE_TASK) {
    return "normal-success-envelope";
  }
  if (antwort.ok === false) return "function-error-envelope";
  return "unexpected-envelope";
}

function failureBranch(antwort, huelle, receiptState) {
  if (huelle === "normal-success-envelope") {
    return receiptState === "valid"
      ? "normal-success"
      : `normal-success-receipt-${receiptState}`;
  }
  if (huelle !== "function-error-envelope") return huelle;
  const code = typeof antwort.code === "string" ? antwort.code : "";
  const grund = typeof antwort.grund === "string" ? antwort.grund : "";
  return FEHLERZWEIGE.get(`${code}|${grund}`)
    ?? FEHLERZWEIGE.get(`${code}|`)
    ?? "unclassified-function-error";
}

function receiptProof(antwort, measuredCostUsdCent) {
  const belege = erstelleAnbieterPfadBelege([MEDIA_BATCH_LIVE_TASK], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  belege.registriere(MEDIA_BATCH_LIVE_TASK);
  try {
    const status = belege.erfasseProviderReceipt(
      MEDIA_BATCH_LIVE_TASK,
      providerReceiptBelegAusAntwort(
        MEDIA_BATCH_LIVE_TASK,
        antwort,
        measuredCostUsdCent,
      ),
    );
    return Object.freeze({
      receiptState: status.receiptState,
      providerProof: status.providerProof,
      costState: status.costState,
    });
  } catch (error) {
    if (error instanceof ProviderReceiptEvidenceError) {
      return Object.freeze({
        receiptState: "cost-unknown",
        providerProof: "unproven",
        costState: "unknown",
      });
    }
    throw error;
  }
}

export function klassifiziereMediaBatchLiveAntwort({
  antwort,
  status,
  measuredCostUsdCent,
} = {}) {
  const proof = receiptProof(antwort, measuredCostUsdCent);
  const huelle = envelopeClass(antwort);
  return Object.freeze({
    schemaVersion: MEDIA_BATCH_LIVE_SHAPE_VERSION,
    httpClass: httpClass(status),
    envelopeClass: huelle,
    branch: failureBranch(antwort, huelle, proof.receiptState),
    rootShape: rootShape(antwort),
    receiptState: proof.receiptState,
    providerProof: proof.providerProof,
    costState: proof.costState,
    parserEligible: huelle === "normal-success-envelope"
      && proof.providerProof === "proven",
  });
}

export function formatiereMediaBatchLiveKlassifikation(input) {
  return JSON.stringify(klassifiziereMediaBatchLiveAntwort(input));
}
