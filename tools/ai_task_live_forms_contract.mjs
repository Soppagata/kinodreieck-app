/* Inhaltsfreie Klassifikation der drei ai-task-Liveformen P4/P5/P6.
   Keine Netzwerk-, Provider- oder Persistenzwirkung. Ausgegeben werden nur
   Schluesselnamen, Typklassen und feste Vertrags-/Fehler-Enums; Feldwerte,
   Providertext und Vorgangs-IDs verlassen diese Naht nie. */

import {
  erstelleAnbieterPfadBelege,
  providerReceiptBelegAusAntwort,
  ProviderReceiptEvidenceError,
} from "./ai_smoke_contract.mjs";

export const AI_TASK_LIVE_FORMS_SHAPE_VERSION = "ai-task-live-forms-v1";
export const FILMWISSEN_LIVE_TASK = "filmwissen-synthese";
export const BLOG_PROFILE_LIVE_TASK = "blog-profile-extract";
export const MEDIA_BATCH_LIVE_TASK = "media-batch-extract";

const LIVE_TASKS = new Set([
  FILMWISSEN_LIVE_TASK,
  BLOG_PROFILE_LIVE_TASK,
  MEDIA_BATCH_LIVE_TASK,
]);
const NORMAL_ROOT_KEYS = Object.freeze([
  "data",
  "displayText",
  "modell",
  "modellAlias",
  "ok",
  "providerReceipt",
  "responseMode",
  "task",
  "verbrauch",
  "vorgangId",
  "warnings",
]);
const NORMAL_ROOT_KEYS_WITHOUT_RECEIPT = Object.freeze(
  NORMAL_ROOT_KEYS.filter((key) => key !== "providerReceipt"),
);
const ERROR_ROOT_KEYS = Object.freeze(["code", "grund", "ok", "vorgangId"]);
const KNOWN_ROOT_KEYS = new Set([...NORMAL_ROOT_KEYS, ...ERROR_ROOT_KEYS]);
const DATA_KEYS = Object.freeze({
  [FILMWISSEN_LIVE_TASK]: new Set([
    "claims", "format", "status", "versionId",
  ]),
  [BLOG_PROFILE_LIVE_TASK]: new Set(["geschmackszuege", "vokabular"]),
  [MEDIA_BATCH_LIVE_TASK]: new Set(["fehlmenge", "kandidaten", "warnungen"]),
});
const RESPONSE_MODES = new Set(["structured", "partial", "degraded"]);
const SAFE_WARNING_CODES = new Set([
  "json-extracted-from-text",
  "unstructured-provider-text",
  "display-text-truncated",
  "extra-fields-ignored",
  "missing-fields-defaulted",
  "invalid-fields-ignored",
  "invalid-items-ignored",
  "unknown-values-ignored",
  "no-safe-structure",
]);
const FEHLERZWEIGE = new Map([
  ["invalid-response|provider-receipt-invalid", "receipt-construction-failed"],
  ["invalid-response|antwort-zu-gross", "provider-response-too-large"],
  [
    "invalid-response|antwort-verletzt-schema",
    "provider-text-or-result-rejected",
  ],
  ["invalid-response|antwort-abgeschnitten", "provider-output-truncated"],
  ["invalid-response|kontextfenster-ueberschritten", "provider-context-window"],
  ["invalid-response|antwort-pausiert", "provider-output-paused"],
  ["ai-refused|", "provider-refused"],
  [
    "limit|anbieter-request-istkostenlimit-ueberschritten",
    "provider-actual-cost-limit",
  ],
  [
    "server|anbieter-request-istkosten-unbekannt",
    "provider-actual-cost-unknown",
  ],
]);

const plain = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

function typeClass(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (plain(value)) return "object";
  if (["boolean", "number", "string"].includes(typeof value)) {
    return typeof value;
  }
  return "other";
}

function shape(value, allowedKeys) {
  if (!plain(value)) return Object.freeze([]);
  return Object.freeze(
    Object.keys(value).filter((key) => allowedKeys.has(key)).sort().map((key) =>
      Object.freeze({
        key,
        type: typeClass(value[key]),
      })
    ),
  );
}

function unknownKeyCount(value, allowedKeys) {
  if (!plain(value)) return 0;
  return Object.keys(value).filter((key) => !allowedKeys.has(key)).length;
}

function exactKeys(value, expected) {
  return plain(value) && Object.keys(value).sort().join("|") ===
      [...expected].sort().join("|");
}

function httpClass(status) {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    return "unknown";
  }
  return `${Math.floor(status / 100)}xx`;
}

function normalEnvelope(task, antwort) {
  const rootBekannt = exactKeys(antwort, NORMAL_ROOT_KEYS) ||
    exactKeys(antwort, NORMAL_ROOT_KEYS_WITHOUT_RECEIPT);
  return rootBekannt && antwort.ok === true &&
    antwort.task === task && typeof antwort.modell === "string" &&
    typeof antwort.modellAlias === "string" &&
    typeof antwort.vorgangId === "string" && plain(antwort.verbrauch) &&
    Array.isArray(antwort.warnings) &&
    RESPONSE_MODES.has(antwort.responseMode) &&
    (antwort.displayText === null || typeof antwort.displayText === "string");
}

function errorEnvelope(antwort) {
  return exactKeys(antwort, ERROR_ROOT_KEYS) && antwort.ok === false &&
    typeof antwort.code === "string" &&
    (antwort.grund === null || typeof antwort.grund === "string") &&
    (antwort.vorgangId === null || typeof antwort.vorgangId === "string");
}

function dataClass(task, data) {
  if (!plain(data)) return `${task}-data-${typeClass(data)}`;
  if (task === FILMWISSEN_LIVE_TASK) {
    if (
      exactKeys(data, ["status", "versionId"]) &&
      typeof data.status === "string" && typeof data.versionId === "string"
    ) {
      return "filmwissen-version-object";
    }
    if (
      exactKeys(data, ["claims", "format", "status"]) &&
      Array.isArray(data.claims) && typeof data.format === "string" &&
      typeof data.status === "string"
    ) {
      return "filmwissen-draft-object";
    }
    return "filmwissen-unexpected-object";
  }
  if (task === BLOG_PROFILE_LIVE_TASK) {
    return exactKeys(data, ["geschmackszuege", "vokabular"]) &&
        Array.isArray(data.geschmackszuege) && Array.isArray(data.vokabular)
      ? "blog-list-pair-object"
      : "blog-unexpected-object";
  }
  return exactKeys(data, ["fehlmenge", "kandidaten", "warnungen"]) &&
      Array.isArray(data.fehlmenge) && Array.isArray(data.kandidaten) &&
      Array.isArray(data.warnungen)
    ? "media-batch-object"
    : "media-unexpected-object";
}

function expectedDataClass(task, klasse) {
  if (task === FILMWISSEN_LIVE_TASK) {
    return klasse === "filmwissen-version-object";
  }
  if (task === BLOG_PROFILE_LIVE_TASK) {
    return klasse === "blog-list-pair-object";
  }
  return klasse === "media-batch-object";
}

function receiptProof(task, antwort, measuredCostUsdCent) {
  const belege = erstelleAnbieterPfadBelege([task], {
    maxPotentialRequests: 1,
    requireProviderReceipt: true,
  });
  belege.registriere(task);
  try {
    const status = belege.erfasseProviderReceipt(
      task,
      providerReceiptBelegAusAntwort(task, antwort, measuredCostUsdCent),
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

function errorBranch(antwort) {
  const code = typeof antwort.code === "string" ? antwort.code : "";
  const grund = typeof antwort.grund === "string" ? antwort.grund : "";
  return FEHLERZWEIGE.get(`${code}|${grund}`) ??
    FEHLERZWEIGE.get(`${code}|`) ?? "unclassified-function-error";
}

function warningCodes(antwort) {
  if (!Array.isArray(antwort?.warnings)) return Object.freeze([]);
  return Object.freeze([...new Set(
    antwort.warnings.filter((code) =>
      typeof code === "string" && SAFE_WARNING_CODES.has(code)
    ),
  )].slice(0, 12));
}

export function klassifiziereAiTaskLiveForm({
  task,
  antwort,
  status,
  measuredCostUsdCent,
} = {}) {
  if (!LIVE_TASKS.has(task)) {
    throw new Error("AI_TASK_LIVE_FORM_TASK_UNBEKANNT");
  }
  const proof = receiptProof(task, antwort, measuredCostUsdCent);
  const normal = normalEnvelope(task, antwort);
  const fehler = !normal && errorEnvelope(antwort);
  const klasse = normal ? dataClass(task, antwort.data) : "not-applicable";
  const datenErwartet = normal && expectedDataClass(task, klasse);
  const envelopeClass = normal
    ? "normal-success-envelope"
    : fehler
    ? "function-error-envelope"
    : (plain(antwort) ? "unexpected-envelope" : "non-object-envelope");
  const branch = normal
    ? (proof.receiptState !== "valid"
      ? `normal-success-receipt-${proof.receiptState}`
      : datenErwartet
      ? "normal-success"
      : klasse)
    : fehler
    ? errorBranch(antwort)
    : envelopeClass;
  return Object.freeze({
    schemaVersion: AI_TASK_LIVE_FORMS_SHAPE_VERSION,
    path: task,
    httpClass: httpClass(status),
    envelopeClass,
    branch,
    rootShape: shape(antwort, KNOWN_ROOT_KEYS),
    dataShape: normal ? shape(antwort.data, DATA_KEYS[task]) : Object.freeze([]),
    unknownRootKeyCount: unknownKeyCount(antwort, KNOWN_ROOT_KEYS),
    unknownDataKeyCount: normal
      ? unknownKeyCount(antwort.data, DATA_KEYS[task]) : 0,
    dataClass: klasse,
    responseMode: normal ? antwort.responseMode : null,
    warningCodes: normal ? warningCodes(antwort) : Object.freeze([]),
    receiptState: proof.receiptState,
    providerProof: proof.providerProof,
    costState: proof.costState,
    parserEligible: datenErwartet && antwort.responseMode !== "degraded" &&
      proof.providerProof === "proven",
  });
}

export const klassifiziereFilmwissenLiveAntwort = (input = {}) =>
  klassifiziereAiTaskLiveForm({ ...input, task: FILMWISSEN_LIVE_TASK });
export const klassifiziereBlogProfileLiveAntwort = (input = {}) =>
  klassifiziereAiTaskLiveForm({ ...input, task: BLOG_PROFILE_LIVE_TASK });
export const klassifiziereMediaBatchLiveAntwort = (input = {}) =>
  klassifiziereAiTaskLiveForm({ ...input, task: MEDIA_BATCH_LIVE_TASK });

export function formatiereAiTaskLiveForm(input) {
  return JSON.stringify(klassifiziereAiTaskLiveForm(input));
}
