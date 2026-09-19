import { norm } from "./match.js";
import { normalisiereTyp } from "./typen.js";
import { blogIdentityHints, canonicalBlogSourceIds } from "./blogReferenceProjection.js";

export const BLOG_REFERENCE_EXTRACT_CONTRACT = "blog-reference-extract-v1";
export const BLOG_REFERENCE_EXTRACT_TASK = "blog-reference-extract";
export const BLOG_REFERENCE_EXTRACT_MAX_TITLE_BYTES = 512;
export const BLOG_REFERENCE_EXTRACT_MAX_TEXT_BYTES = 18000;
export const BLOG_REFERENCE_EXTRACT_MAX_CANDIDATES = 50;
export const BLOG_REFERENCE_EXTRACT_MAX_RESULT_BYTES = 32768;
export const BLOG_REFERENCE_STREAMING_MAX_QUERIES = 8;
export const BLOG_REFERENCE_STREAMING_QUERY_LIMIT = 20;
export const BLOG_REFERENCE_SOURCE_TTL_MS = 5 * 60 * 1000;

const CANDIDATE_KEYS = Object.freeze([
  "candidateId", "mention", "titleSuggestion", "kind", "year", "interpretation", "evidence",
]);
const EVIDENCE_KEYS = Object.freeze(["field", "quote", "start", "end"]);
const CAPABILITY_KEYS = Object.freeze([
  "contractVersion", "enabled", "modelAlias", "maxTextBytes", "maxTitleBytes", "maxCandidates",
]);
const DATA_KEYS = Object.freeze(["contractVersion", "candidates", "partial", "expiresAt"]);
const ENVELOPE_KEYS = Object.freeze(["ok", "task", "vorgangId", "data"]);
const ENVELOPE_METADATA_KEYS = Object.freeze([
  "modellAlias", "modell", "providerReceipt", "verbrauch",
]);
const ENVELOPE_ALLOWED_KEYS = new Set([...ENVELOPE_KEYS, ...ENVELOPE_METADATA_KEYS]);
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
const validEnvelopeKeys = (value) => isObject(value)
  && ENVELOPE_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  && Object.keys(value).every((key) => ENVELOPE_ALLOWED_KEYS.has(key));
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
  if (!checkedInput.ok || !validEnvelopeKeys(response)
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
function itemType(item) {
  const raw = String(item?.typ || item?.mediaType || "sonstiges").trim().toLocaleLowerCase("de-AT");
  if (["movie", "film"].includes(raw)) return "film";
  if (["tv_series", "series", "serie", "tv", "show"].includes(raw)) return "serie";
  return normalisiereTyp(raw);
}
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

const SOURCE_LABELS = Object.freeze({
  library: "Mediathek", mustwatch: "Merkliste",
  streaming: "Streaming-Katalog", cinema: "Kinoprogramm",
});

function sourceEvidence(source, item, ref, title) {
  const identityHints = blogIdentityHints(item);
  if (source.kind === "streaming") {
    const sourceId = canonicalBlogSourceIds(item?.dienste || [])[0] || null;
    if (identityHints.length === 0) return null;
    return {
      sourceTarget: {
        kind: "streaming", art: "entdecken", ref, titel: title,
        ...(sourceId ? { sourceId } : {}),
      },
      identityHints,
    };
  }
  if (source.kind === "cinema") {
    if (!identityHints.some((hint) => hint.namespace === "film_at")) return null;
    return {
      sourceTarget: { kind: "cinema", art: "programm", ref, titel: title },
      identityHints,
    };
  }
  return { sourceTarget: null, identityHints };
}

function identityConflicts(left, right) {
  const rightByNamespace = new Map(right.identityHints.map((hint) => [hint.namespace, hint.value]));
  return left.identityHints.some((hint) => rightByNamespace.has(hint.namespace)
    && rightByNamespace.get(hint.namespace) !== hint.value);
}

function sharesIdentity(left, right) {
  const rightKeys = new Set(right.identityHints.map((hint) => `${hint.namespace}:${hint.value}`));
  return left.identityHints.some((hint) => rightKeys.has(`${hint.namespace}:${hint.value}`));
}

function sameKnownWork(left, right) {
  return norm(left.title) === norm(right.title)
    && left.mediaType === right.mediaType
    && left.year !== null && right.year !== null && left.year === right.year;
}

function compatibleWithGroup(record, group) {
  if (group.records.some((entry) => identityConflicts(record, entry)
      || record.mediaType !== entry.mediaType
      || (record.year !== null && entry.year !== null && record.year !== entry.year))) return false;
  return group.records.some((entry) => sharesIdentity(record, entry) || sameKnownWork(record, entry));
}

function mergeWorkGroup(group, index) {
  const hints = [];
  const hintKeys = new Set();
  const sourceLabels = [];
  const observations = [];
  const observationKeys = new Set();
  for (const record of group.records) {
    if (!sourceLabels.includes(record.sourceLabel)) sourceLabels.push(record.sourceLabel);
    for (const hint of record.identityHints) {
      const key = `${hint.namespace}:${hint.value}`;
      if (!hintKeys.has(key)) { hintKeys.add(key); hints.push(hint); }
    }
    if (record.sourceTarget && record.expiresAt) {
      const key = `${record.sourceTarget.kind}:${record.sourceTarget.ref}`;
      if (!observationKeys.has(key)) {
        observationKeys.add(key);
        observations.push(Object.freeze({ target: record.sourceTarget, expiresAt: record.expiresAt }));
      }
    }
  }
  const first = group.records[0];
  const creators = [...new Set(group.records.map((record) => record.creator).filter(Boolean))];
  const identity = hints.length
    ? `work:${hints.map((hint) => `${hint.namespace}:${hint.value}`).sort().join("|")}`
    : `work:${norm(first.title)}:${first.mediaType}:${first.year ?? "unknown"}:${index}`;
  return Object.freeze({
    identity, title: first.title, year: first.year, mediaType: first.mediaType,
    creator: creators.length === 1 ? creators[0] : null,
    sourceLabels: Object.freeze(sourceLabels),
    identityHints: Object.freeze(hints.map((hint) => Object.freeze({ ...hint }))),
    sourceObservations: Object.freeze(observations),
  });
}

function workOptions(candidate, sources) {
  const suggested = norm(candidate.titleSuggestion);
  if (!suggested) return [];
  const expectedType = MEDIA_TYPE_BY_KIND[candidate.kind] || null;
  const records = [];
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
      const evidence = sourceEvidence(source, item, ref, title);
      if (!evidence) continue;
      seen.add(identity);
      records.push(Object.freeze({
        title, year, mediaType, creator: itemCreator(item),
        sourceLabel: SOURCE_LABELS[source.kind] || "Bestand",
        sourceTarget: evidence.sourceTarget,
        expiresAt: source.expiresAt || null,
        identityHints: Object.freeze(evidence.identityHints.map((hint) => Object.freeze({ ...hint }))),
      }));
    }
  }
  const groups = [];
  const addRecord = (record) => {
    const matches = groups.filter((group) => compatibleWithGroup(record, group));
    if (matches.length === 1) matches[0].records.push(record);
    else groups.push({ records: [record] });
  };
  records.filter((record) => record.identityHints.length > 0).forEach(addRecord);
  records.filter((record) => record.identityHints.length === 0).forEach(addRecord);
  return groups.map(mergeWorkGroup)
    .sort((a, b) => (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER)
    || a.title.localeCompare(b.title, "de"));
}

export function buildBlogReferenceSuggestions(candidates, {
  library = [], mustwatch = [], streaming = [], cinema = [], sourceExpiresAt = {},
} = {}) {
  const sources = [
    { kind: "library", items: library }, { kind: "mustwatch", items: mustwatch },
    { kind: "streaming", items: streaming, expiresAt: sourceExpiresAt.streaming || null },
    { kind: "cinema", items: cinema, expiresAt: sourceExpiresAt.cinema || null },
  ];
  return Object.freeze((Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const options = Object.freeze(workOptions(candidate, sources));
    const mediaType = MEDIA_TYPE_BY_KIND[candidate.kind] || null;
    return Object.freeze({
      ...candidate,
      mediaType,
      workOptions: options,
      requiresWorkDecision: options.length > 1 || (!mediaType && options.length === 0),
    });
  }));
}

function cinemaItems(program) {
  const films = Array.isArray(program) ? program : Array.isArray(program?.filme) ? program.filme : [];
  return films.map((item) => {
    const id = String(item?.film_at_id ?? item?.filmAtId ?? "").trim();
    const title = String(item?.t ?? item?.titel ?? item?.title ?? "").trim();
    if (!id || !title) return null;
    return Object.freeze({
      ...item, id, titel: title, jahr: Number.isInteger(item?.j ?? item?.jahr) ? (item.j ?? item.jahr) : null,
      typ: "film", film_at_id: id,
    });
  }).filter(Boolean);
}

function sourceExpiry(value, now, fallback) {
  const parsed = typeof value === "number" && Number.isFinite(value)
    ? value : Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? Math.min(parsed, fallback) : fallback;
}

export async function resolveBlogReferenceCatalogSources(candidates, {
  streamingService = null,
  cinema = [],
  cinemaReady = false,
  cinemaExpiresAt = null,
  signal = null,
  clock = () => Date.now(),
} = {}) {
  const now = clock();
  const localExpiry = now + BLOG_REFERENCE_SOURCE_TTL_MS;
  const queries = [];
  const seenQueries = new Set();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!["film", "series", "title_group", "unclear"].includes(candidate?.kind)) continue;
    const query = String(candidate?.titleSuggestion || "").trim();
    const key = norm(query);
    if (!key || seenQueries.has(key)) continue;
    seenQueries.add(key);
    queries.push(query);
  }
  const boundedQueries = queries.slice(0, BLOG_REFERENCE_STREAMING_MAX_QUERIES);
  const streamingItems = new Map();
  let streamingVersion = null;
  let streamingExpiry = localExpiry;
  let streamingStatus = boundedQueries.length === 0 ? "not-requested"
    : typeof streamingService?.search === "function" ? "ready" : "unavailable";
  let streamingCompleted = 0;
  if (streamingStatus === "ready") {
    try {
      for (const query of boundedQueries) {
        if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        const response = await streamingService.search(query, {
          signal, limit: BLOG_REFERENCE_STREAMING_QUERY_LIMIT,
        });
        if (response?.status !== "ready") {
          streamingStatus = streamingCompleted > 0 ? "partial" : "unavailable";
          break;
        }
        if (streamingVersion !== null && response.version !== streamingVersion) {
          streamingStatus = "failed";
          streamingItems.clear();
          break;
        }
        streamingVersion = response.version;
        streamingExpiry = sourceExpiry(response.expiresAt, now, streamingExpiry);
        for (const item of Array.isArray(response.items) ? response.items : []) {
          const id = String(item?.id ?? "").trim();
          if (id) streamingItems.set(id, item);
        }
        streamingCompleted += 1;
      }
      if (streamingStatus === "ready" && queries.length > boundedQueries.length) streamingStatus = "partial";
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw error;
      streamingStatus = streamingCompleted > 0 ? "partial" : "failed";
    }
  }
  const parsedCinemaExpiry = typeof cinemaExpiresAt === "number" && Number.isFinite(cinemaExpiresAt)
    ? cinemaExpiresAt : Date.parse(String(cinemaExpiresAt || ""));
  const cinemaCurrent = cinemaReady === true
    && (!Number.isFinite(parsedCinemaExpiry) || parsedCinemaExpiry > now);
  const cinemaStatus = cinemaCurrent ? "ready" : "unavailable";
  return Object.freeze({
    streaming: Object.freeze({
      status: streamingStatus,
      items: Object.freeze([...streamingItems.values()]),
      queried: streamingCompleted,
      totalQueries: queries.length,
      version: streamingVersion,
      expiresAt: new Date(Math.max(now + 1, streamingExpiry)).toISOString(),
    }),
    cinema: Object.freeze({
      status: cinemaStatus,
      items: Object.freeze(cinemaCurrent ? cinemaItems(cinema) : []),
      expiresAt: cinemaCurrent
        ? new Date(sourceExpiry(cinemaExpiresAt, now, localExpiry)).toISOString() : null,
    }),
  });
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
    if (selection.manual === true && selectedWorks.length > 0) {
      return { ok: false, reason: "conflicting-work-selection", candidateId: suggestion.candidateId, candidates: [] };
    }
    const addWork = (work, selectionId) => {
      const title = String(work?.title || suggestion.titleSuggestion || "").trim();
      const mediaType = normalisiereTyp(work?.mediaType || suggestion.mediaType || "sonstiges");
      const year = work?.year ?? suggestion.year ?? null;
      result.push({
        candidateId: suggestion.candidateId,
        selectionId,
        sourceKind: "work",
        ref: null,
        title,
        year,
        mediaType,
        resolutionIntent: { kind: "auto" },
        workIdentity: {
          title, year, mediaType,
          identityHints: Array.isArray(work?.identityHints) ? work.identityHints : [],
        },
        sourceObservations: Array.isArray(work?.sourceObservations) ? work.sourceObservations : [],
      });
    };
    if (!suggestion.requiresWorkDecision) {
      if (selectedWorks.length > 0 || selection.manual === true) {
        return { ok: false, reason: "unexpected-work-selection", candidateId: suggestion.candidateId, candidates: [] };
      }
      addWork(suggestion.workOptions[0] || null, `${suggestion.candidateId}:work`);
      continue;
    }
    for (const identity of selectedWorks) {
      const option = optionById.get(identity);
      if (!option) return { ok: false, reason: "invalid-work-selection", candidateId: suggestion.candidateId, candidates: [] };
      addWork(option, `${suggestion.candidateId}:${option.identity}`);
    }
    if (selection.manual === true) {
      const title = String(selection.manualTitle || "").trim();
      const mediaType = normalisiereTyp(selection.manualType || suggestion.mediaType || "sonstiges");
      const rawYear = selection.manualYear;
      const year = rawYear === "" || rawYear == null ? null : Number(rawYear);
      if (!title || !["film", "serie", "musik", "sonstiges"].includes(mediaType)
          || (year !== null && (!Number.isInteger(year)
            || year < yearMinForMediaType(mediaType) || year > YEAR_MAX))) {
        return { ok: false, reason: "invalid-manual-selection", candidateId: suggestion.candidateId, candidates: [] };
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
      return { ok: false, reason: "work-decision-required", candidateId: suggestion.candidateId, candidates: [] };
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
