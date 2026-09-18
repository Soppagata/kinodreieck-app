import { norm } from "./match.js";
import { normalisiereTyp } from "./typen.js";

export const BLOG_REFERENCE_EXTRACT_CONTRACT = "blog-reference-extract-v1";
export const BLOG_REFERENCE_EXTRACT_TASK = "blog-reference-extract";
export const BLOG_REFERENCE_EXTRACT_MAX_TITLE_BYTES = 512;
export const BLOG_REFERENCE_EXTRACT_MAX_TEXT_BYTES = 18000;
export const BLOG_REFERENCE_EXTRACT_MAX_CANDIDATES = 50;
export const BLOG_REFERENCE_EXTRACT_MAX_RESULT_BYTES = 32768;

const CANDIDATE_KEYS = Object.freeze([
  "candidateId", "mention", "titleSuggestion", "kind", "year", "interpretation", "evidence",
]);
const EVIDENCE_KEYS = Object.freeze(["field", "quote", "start", "end"]);
const CAPABILITY_KEYS = Object.freeze([
  "contractVersion", "enabled", "modelAlias", "maxTextBytes", "maxTitleBytes", "maxCandidates",
]);
const DATA_KEYS = Object.freeze(["contractVersion", "candidates", "partial", "expiresAt"]);
const ENVELOPE_KEYS = Object.freeze(["ok", "task", "vorgangId", "data"]);
const KINDS = new Set(["film", "series", "music", "other", "title_group", "unclear"]);
const INTERPRETATIONS = new Set(["direct", "interpreted", "ambiguous"]);
const MEDIA_TYPE_BY_KIND = Object.freeze({
  film: "film", series: "serie", music: "musik", other: "sonstiges",
});
const YEAR_MAX = 2200;
const yearMinForKind = (kind) => ["film", "series"].includes(kind) ? 1870 : 1;
const yearMinForMediaType = (mediaType) => ["film", "serie"].includes(mediaType) ? 1870 : 1;

const encoder = new TextEncoder();
const byteLength = (value) => encoder.encode(String(value == null ? "" : value)).byteLength;
const unicodeLength = (value) => Array.from(String(value == null ? "" : value)).length;
const jsonByteLength = (value) => {
  try { return byteLength(JSON.stringify(value)); } catch { return Number.POSITIVE_INFINITY; }
};
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected) => isObject(value)
  && Object.keys(value).length === expected.length
  && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const cleanText = (value) => typeof value === "string" && value === value.trim() && value.length > 0;
const nonBlankText = (value) => typeof value === "string" && value.trim().length > 0;
const canonicalIso = (value) => typeof value === "string"
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

export function validateBlogReferenceExtractionInput({ title, text } = {}) {
  if (typeof title !== "string" || typeof text !== "string") {
    return { ok: false, reason: "invalid-input" };
  }
  if (byteLength(title) > BLOG_REFERENCE_EXTRACT_MAX_TITLE_BYTES) {
    return { ok: false, reason: "title-too-long" };
  }
  if (byteLength(text) > BLOG_REFERENCE_EXTRACT_MAX_TEXT_BYTES) {
    return { ok: false, reason: "text-too-long" };
  }
  if (!title.trim()) return { ok: false, reason: "empty-title" };
  if (!text.trim()) return { ok: false, reason: "empty-text" };
  return { ok: true, payload: { title, text } };
}

export function blogReferenceHealthPayload() {
  return { capabilities: [BLOG_REFERENCE_EXTRACT_CONTRACT] };
}

export function readBlogReferenceExtractCapability(health) {
  const capability = health?.capabilities?.blogReferenceExtract;
  const tasks = health?.activation?.userTasks;
  if (health?.ok !== true || health?.task !== "health"
      || !Array.isArray(tasks) || !tasks.includes(BLOG_REFERENCE_EXTRACT_TASK)
      || !exactKeys(capability, CAPABILITY_KEYS)) return null;
  if (capability.contractVersion !== BLOG_REFERENCE_EXTRACT_CONTRACT
      || capability.enabled !== true || capability.modelAlias !== "gross"
      || capability.maxTextBytes !== BLOG_REFERENCE_EXTRACT_MAX_TEXT_BYTES
      || capability.maxTitleBytes !== BLOG_REFERENCE_EXTRACT_MAX_TITLE_BYTES
      || capability.maxCandidates !== BLOG_REFERENCE_EXTRACT_MAX_CANDIDATES) return null;
  return Object.freeze({ ...capability });
}

function validateCandidate(candidate, input) {
  if (!exactKeys(candidate, CANDIDATE_KEYS) || !exactKeys(candidate.evidence, EVIDENCE_KEYS)) return null;
  if (!cleanText(candidate.candidateId) || byteLength(candidate.candidateId) > 160
      || !nonBlankText(candidate.mention) || unicodeLength(candidate.mention) > 160
      || !nonBlankText(candidate.titleSuggestion) || unicodeLength(candidate.titleSuggestion) > 160
      || !KINDS.has(candidate.kind) || !INTERPRETATIONS.has(candidate.interpretation)) return null;
  if (candidate.year !== null && (!Number.isInteger(candidate.year)
      || candidate.year < yearMinForKind(candidate.kind) || candidate.year > YEAR_MAX)) return null;
  const evidence = candidate.evidence;
  if (!["title", "text"].includes(evidence.field) || !nonBlankText(evidence.quote)
      || byteLength(evidence.quote) > 320 || !Number.isInteger(evidence.start)
      || !Number.isInteger(evidence.end) || evidence.start < 0 || evidence.end <= evidence.start) return null;
  const source = input[evidence.field];
  if (evidence.end > source.length || source.slice(evidence.start, evidence.end) !== evidence.quote
      || !evidence.quote.includes(candidate.mention)) return null;
  if (candidate.year !== null && !evidence.quote.includes(String(candidate.year))) return null;
  return Object.freeze({
    ...candidate,
    evidence: Object.freeze({ ...evidence }),
  });
}

export function validateBlogReferenceExtractionResponse(response, input) {
  const checkedInput = validateBlogReferenceExtractionInput(input);
  if (!checkedInput.ok || !exactKeys(response, ENVELOPE_KEYS)
      || response.ok !== true || response.task !== BLOG_REFERENCE_EXTRACT_TASK
      || !cleanText(response.vorgangId) || !exactKeys(response.data, DATA_KEYS)) {
    return { ok: false, reason: "invalid-envelope" };
  }
  const data = response.data;
  if (data.contractVersion !== BLOG_REFERENCE_EXTRACT_CONTRACT
      || typeof data.partial !== "boolean" || !canonicalIso(data.expiresAt)
      || !Array.isArray(data.candidates)
      || data.candidates.length > BLOG_REFERENCE_EXTRACT_MAX_CANDIDATES
      || jsonByteLength(data) > BLOG_REFERENCE_EXTRACT_MAX_RESULT_BYTES) {
    return { ok: false, reason: "invalid-data" };
  }
  const ids = new Set();
  const candidates = [];
  for (const raw of data.candidates) {
    const candidate = validateCandidate(raw, checkedInput.payload);
    if (!candidate || ids.has(candidate.candidateId)) return { ok: false, reason: "invalid-candidate" };
    ids.add(candidate.candidateId);
    candidates.push(candidate);
  }
  return {
    ok: true,
    value: Object.freeze({
      requestId: response.vorgangId,
      contractVersion: data.contractVersion,
      candidates: Object.freeze(candidates),
      partial: data.partial,
      expiresAt: data.expiresAt,
    }),
  };
}

export async function blogReferenceContentHash({ title, text }, digest = null) {
  const digestFn = digest || (async (value) => {
    if (typeof globalThis?.crypto?.subtle?.digest !== "function") throw new Error("sha256-unavailable");
    const buffer = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(value));
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  });
  const hash = await digestFn(`${title}\u0000${text}`);
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash) || /^0+$/.test(hash)) {
    throw new Error("invalid-content-hash");
  }
  return hash;
}

function itemTitle(item) { return String(item?.titel || item?.title || "").trim(); }
function itemYear(item) {
  const value = item?.jahr ?? item?.year;
  return Number.isInteger(value) ? value : null;
}
function itemType(item) { return normalisiereTyp(item?.typ || item?.mediaType || "sonstiges"); }
function itemCreator(item) {
  for (const field of ["regie", "director", "kuenstler", "künstler", "artist", "interpret", "autor", "author"]) {
    const value = item?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.filter((entry) => typeof entry === "string" && entry.trim()).join(", ");
      if (joined) return joined;
    }
  }
  return null;
}

function workOptions(candidate, sources) {
  const suggested = norm(candidate.titleSuggestion);
  if (!suggested) return [];
  const expectedType = MEDIA_TYPE_BY_KIND[candidate.kind] || null;
  const options = [];
  const seen = new Set();
  for (const source of sources) {
    for (const item of Array.isArray(source.items) ? source.items : []) {
      const ref = String(item?.id == null ? "" : item.id).trim();
      const title = itemTitle(item);
      if (!ref || !title || norm(title) !== suggested) continue;
      const mediaType = itemType(item);
      const year = itemYear(item);
      if (expectedType && mediaType !== expectedType) continue;
      if (candidate.year !== null && year !== candidate.year) continue;
      const identity = `${source.kind}:${ref}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      options.push(Object.freeze({
        identity, sourceKind: source.kind, ref, title, year, mediaType,
        creator: itemCreator(item),
      }));
    }
  }
  return options.sort((a, b) => (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER)
    || a.title.localeCompare(b.title, "de"));
}

export function buildBlogReferenceSuggestions(candidates, { library = [], mustwatch = [] } = {}) {
  const sources = [{ kind: "library", items: library }, { kind: "mustwatch", items: mustwatch }];
  return Object.freeze((Array.isArray(candidates) ? candidates : []).map((candidate) => Object.freeze({
    ...candidate,
    mediaType: MEDIA_TYPE_BY_KIND[candidate.kind] || null,
    workOptions: Object.freeze(workOptions(candidate, sources)),
  })));
}

export function buildBlogReferenceApplications(suggestions, selections) {
  const byId = new Map((Array.isArray(suggestions) ? suggestions : [])
    .map((suggestion) => [suggestion.candidateId, suggestion]));
  const result = [];
  for (const selection of Array.isArray(selections) ? selections : []) {
    const suggestion = byId.get(selection?.candidateId);
    if (!suggestion || selection.selected !== true) continue;
    const optionById = new Map(suggestion.workOptions.map((option) => [option.identity, option]));
    const selectedWorks = Array.isArray(selection.workIdentities) ? selection.workIdentities : [];
    for (const identity of selectedWorks) {
      const option = optionById.get(identity);
      if (!option) return { ok: false, reason: "invalid-work-selection", candidates: [] };
      result.push({
        candidateId: suggestion.candidateId,
        selectionId: `${suggestion.candidateId}:${option.identity}`,
        sourceKind: option.sourceKind,
        ref: option.ref,
        title: option.title,
        year: option.year,
        mediaType: option.mediaType,
        resolutionIntent: { kind: "auto" },
      });
    }
    if (selection.manual === true) {
      const title = String(selection.manualTitle || "").trim();
      const mediaType = normalisiereTyp(selection.manualType || suggestion.mediaType || "sonstiges");
      const rawYear = selection.manualYear;
      const year = rawYear === "" || rawYear == null ? null : Number(rawYear);
      if (!title || !["film", "serie", "musik", "sonstiges"].includes(mediaType)
          || (year !== null && (!Number.isInteger(year)
            || year < yearMinForMediaType(mediaType) || year > YEAR_MAX))) {
        return { ok: false, reason: "invalid-manual-selection", candidates: [] };
      }
      result.push({
        candidateId: suggestion.candidateId,
        selectionId: `${suggestion.candidateId}:manual`,
        sourceKind: "manual",
        ref: null,
        title,
        year,
        mediaType,
        resolutionIntent: { kind: "keep_redlink" },
      });
    }
    if (selectedWorks.length === 0 && selection.manual !== true) {
      return { ok: false, reason: "work-decision-required", candidates: [] };
    }
  }
  if (result.length === 0) return { ok: false, reason: "empty-selection", candidates: [] };
  return { ok: true, candidates: result };
}

export function blogReferenceKindLabel(kind) {
  return ({ film: "Film", series: "Serie", music: "Musik", other: "Sonstiges",
    title_group: "Titelgruppe", unclear: "Unklar" })[kind] || "Unklar";
}

export function blogReferenceInterpretationLabel(value) {
  return ({ direct: "Direkte Nennung", interpreted: "Interpretierter Titel",
    ambiguous: "Mehrdeutige Nennung" })[value] || "Mehrdeutige Nennung";
}
