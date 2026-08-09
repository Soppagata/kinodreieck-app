/* Deterministischer lokaler proposal.json-Validator (Phase 2).
   ---------------------------------------------------------------
   Das Modul liest nur Daten und liefert eine Vorschau. Es startet weder ein
   LLM noch einen Provider, schreibt keine Datenbank und aktiviert keine
   Routine. Radar-Matching verlangt bereits kanonische IDs; Popularity nutzt
   den geschlossenen Phase-1-Matcher. */

import {
  RADAR_DEFAULT_REGION,
  RADAR_EVENT_TYPES,
  RADAR_LIFECYCLE_STATUSES,
  RADAR_TARGET_TYPES,
  createRadarEventIdentity,
  isStableContractId,
} from "./radarContracts.js";
import {
  matchPopularityItem,
  mayDisplayPopularityItem,
  popularityItemKey,
} from "./popularityContracts.js";

export const LOCAL_PROPOSAL_FORMAT = "kinodreieck-proposal";
export const LOCAL_PROPOSAL_VERSION = 1;
export const LOCAL_PROPOSAL_KINDS = Object.freeze(["radar_events", "popularity_items"]);
export const PROPOSAL_SOURCE_CLASSES = Object.freeze(["official", "editorial", "aggregator", "unknown"]);
export const LOCAL_PROPOSAL_MAX_BYTES = 256 * 1024;
export const LOCAL_PROPOSAL_MAX_ITEMS = 50;
export const LOCAL_PROPOSAL_MAX_EVIDENCE = 5;

const HASH_FORM = /^[a-f0-9]{64}$/;
const DOMAIN_FORM = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EXTERNAL_ID_FORM = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const EXTERNAL_ID_KEYS = Object.freeze(["watchmode", "imdb", "tmdb", "wikidata"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function result(errors) { return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) }); }
function exactKeys(value, allowed) {
  return plain(value) && Object.keys(value).every((key) => allowed.includes(key));
}
function validInstant(value) {
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized)
    && Number.isFinite(Date.parse(normalized));
}
function dayNumber(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const millis = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === normalized
    ? Math.floor(millis / 86400000)
    : null;
}
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

export function canonicalizeProposalUrl(value) {
  let url;
  try { url = new URL(text(value)); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !/^utm_/i.test(key) && !["fbclid", "gclid"].includes(key.toLowerCase()))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  url.search = "";
  for (const [key, val] of kept) url.searchParams.append(key, val);
  return url.toString();
}

function validateSource(source) {
  const errors = [];
  const keys = [
    "sourceId", "domain", "publisherFamily", "sourceClass", "rightsStatus",
    "active", "attributionApproved", "subdomainsAllowed", "allowedProposalKinds",
  ];
  if (!exactKeys(source, keys)) return ["source-shape-invalid"];
  if (!isStableContractId(source.sourceId)) errors.push("source-id-invalid");
  if (!DOMAIN_FORM.test(text(source.domain))) errors.push("source-domain-invalid");
  if (!isStableContractId(source.publisherFamily)) errors.push("source-publisher-family-invalid");
  if (!PROPOSAL_SOURCE_CLASSES.includes(source.sourceClass)) errors.push("source-class-invalid");
  if (!['approved', 'blocked', 're_audit', 'manual_only', 'parked'].includes(source.rightsStatus)) {
    errors.push("source-rights-invalid");
  }
  if (typeof source.active !== "boolean" || typeof source.attributionApproved !== "boolean"
      || typeof source.subdomainsAllowed !== "boolean") errors.push("source-flags-invalid");
  if (!Array.isArray(source.allowedProposalKinds) || source.allowedProposalKinds.length === 0
      || source.allowedProposalKinds.some((kind) => !LOCAL_PROPOSAL_KINDS.includes(kind))
      || new Set(source.allowedProposalKinds).size !== source.allowedProposalKinds.length) {
    errors.push("source-proposal-kinds-invalid");
  }
  if (source.active && (source.rightsStatus !== "approved" || source.attributionApproved !== true)) {
    errors.push("source-active-without-rights");
  }
  return errors;
}

export function validateProposalSourceRegistry(sources) {
  const errors = [];
  if (!Array.isArray(sources)) return result(["source-registry-invalid"]);
  const ids = new Set();
  const domains = new Set();
  for (const source of sources) {
    errors.push(...validateSource(source));
    const id = text(source?.sourceId);
    if (ids.has(id)) errors.push("source-id-duplicate");
    ids.add(id);
    const domain = text(source?.domain);
    if (domains.has(domain)) errors.push("source-domain-duplicate");
    domains.add(domain);
  }
  return result(errors);
}

function sourceAllows(source, kind) {
  return !!source && source.active === true && source.rightsStatus === "approved"
    && source.attributionApproved === true && source.allowedProposalKinds.includes(kind);
}

function hostAllowed(source, canonicalUrl) {
  try {
    const hostname = new URL(canonicalUrl).hostname.toLowerCase();
    return hostname === source.domain
      || (source.subdomainsAllowed === true && hostname.endsWith(`.${source.domain}`));
  } catch { return false; }
}

function externalIds(value) {
  if (!plain(value) || !exactKeys(value, EXTERNAL_ID_KEYS)) return null;
  const entries = EXTERNAL_ID_KEYS.filter((key) => value[key] !== undefined)
    .map((key) => [key, value[key]]);
  if (!entries.length || entries.some(([, entry]) => typeof entry !== "string" || !EXTERNAL_ID_FORM.test(entry.trim()))) {
    return null;
  }
  const normalized = entries.map(([key, entry]) => [key, entry.trim()]);
  return Object.fromEntries(normalized);
}

function catalogMatch(item, catalog) {
  const target = catalog.find((entry) => entry?.targetId === item.targetId);
  if (!target) return { ok: false, reason: "target-unmatched", target: null };
  if (!isStableContractId(target.targetId) || !RADAR_TARGET_TYPES.includes(target.targetType)
      || target.targetType !== item.targetType || target.canonical !== true || target.targetStatus !== "active") {
    return { ok: false, reason: "target-contract-mismatch", target: null };
  }
  const proposed = externalIds(item.externalIds);
  if (!proposed) return { ok: false, reason: "strong-id-required", target: null };
  for (const [key, value] of Object.entries(proposed)) {
    if (text(target.externalIds?.[key]) !== value) return { ok: false, reason: `strong-id-conflict:${key}`, target: null };
  }
  return { ok: true, reason: "strong-id", target };
}

function validateEvidence(evidence, item, sourcesById) {
  const errors = [];
  const keys = [
    "evidenceId", "sourceId", "url", "claimedDate", "eventType", "region",
    "platform", "fingerprint",
  ];
  if (!exactKeys(evidence, keys)) return { ok: false, errors: ["evidence-shape-invalid"] };
  if (!isStableContractId(evidence.evidenceId)) errors.push("evidence-id-invalid");
  if (!HASH_FORM.test(text(evidence.fingerprint))) errors.push("evidence-fingerprint-invalid");
  const source = sourcesById.get(text(evidence.sourceId));
  if (!sourceAllows(source, "radar_events")) errors.push("evidence-source-not-allowed");
  const url = canonicalizeProposalUrl(evidence.url);
  if (!url || !source || !hostAllowed(source, url)) errors.push("evidence-url-invalid");
  if (evidence.claimedDate !== item.eventDate) errors.push("evidence-date-conflict");
  if (evidence.eventType !== item.eventType) errors.push("evidence-event-type-conflict");
  if (evidence.region !== item.region) errors.push("evidence-region-conflict");
  if (text(evidence.platform || "-") !== text(item.platform || "-")) errors.push("evidence-platform-conflict");
  return {
    ok: errors.length === 0,
    errors,
    normalized: errors.length ? null : {
      evidenceId: evidence.evidenceId,
      sourceId: evidence.sourceId,
      url,
      claimedDate: evidence.claimedDate,
      eventType: evidence.eventType,
      region: evidence.region,
      platform: evidence.platform,
      fingerprint: evidence.fingerprint,
      publisherFamily: source.publisherFamily,
      sourceClass: source.sourceClass,
    },
  };
}

function validateRadarItem(item, { catalog, sourcesById }) {
  const errors = [];
  const keys = [
    "itemId", "eventVersionId", "targetId", "targetType", "externalIds",
    "eventType", "eventDate", "region", "platform", "lifecycleStatus",
    "evidence", "conflicts",
  ];
  if (!exactKeys(item, keys)) return { status: "blocked", errors: ["radar-item-shape-invalid"], normalized: null };
  if (!isStableContractId(item.itemId)) errors.push("radar-item-id-invalid");
  if (!isStableContractId(item.eventVersionId)) errors.push("radar-version-id-invalid");
  if (!isStableContractId(item.targetId)) errors.push("radar-target-id-invalid");
  if (!RADAR_TARGET_TYPES.includes(item.targetType)) errors.push("radar-target-type-invalid");
  if (!RADAR_EVENT_TYPES.includes(item.eventType)) errors.push("radar-event-type-invalid");
  if (dayNumber(item.eventDate) == null) errors.push("radar-event-date-invalid");
  if (item.region !== RADAR_DEFAULT_REGION) errors.push("radar-region-invalid");
  if (!RADAR_LIFECYCLE_STATUSES.includes(item.lifecycleStatus)) errors.push("radar-lifecycle-invalid");
  if (item.eventType === "streamingstart_at" && (!text(item.platform) || item.platform === "-")) {
    errors.push("radar-platform-required");
  }
  if (item.eventType !== "streamingstart_at" && item.platform !== "-") errors.push("radar-platform-forbidden");
  if (!Array.isArray(item.evidence) || item.evidence.length < 1 || item.evidence.length > LOCAL_PROPOSAL_MAX_EVIDENCE) {
    errors.push("radar-evidence-count-invalid");
  }
  if (!Array.isArray(item.conflicts)
      || item.conflicts.some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 160)) {
    errors.push("radar-conflicts-invalid");
  }
  const matched = catalogMatch(item, catalog);
  if (!matched.ok) errors.push(matched.reason);

  const normalizedEvidence = [];
  if (Array.isArray(item.evidence)) {
    for (const evidence of item.evidence) {
      const checked = validateEvidence(evidence, item, sourcesById);
      errors.push(...checked.errors);
      if (checked.normalized) normalizedEvidence.push(checked.normalized);
    }
  }
  const evidenceIds = normalizedEvidence.map((entry) => entry.evidenceId);
  if (new Set(evidenceIds).size !== evidenceIds.length) errors.push("radar-evidence-id-duplicate");

  const uniqueEvidence = [];
  const urlSeen = new Set();
  const fingerprintSeen = new Set();
  for (const evidence of normalizedEvidence) {
    if (urlSeen.has(evidence.url) || fingerprintSeen.has(evidence.fingerprint)) continue;
    urlSeen.add(evidence.url);
    fingerprintSeen.add(evidence.fingerprint);
    uniqueEvidence.push(evidence);
  }
  const eligibleFamilies = new Set(uniqueEvidence
    .filter((entry) => ["official", "editorial"].includes(entry.sourceClass))
    .map((entry) => entry.publisherFamily));
  const conflicts = Array.isArray(item.conflicts) ? item.conflicts.map(text).filter(Boolean) : [];
  if (errors.length) return { status: "blocked", errors: [...new Set(errors)], normalized: null };

  const verificationStatus = conflicts.length
    ? "ambiguous"
    : eligibleFamilies.size >= 2 ? "confirmed" : eligibleFamilies.size === 1 ? "corroborated" : "candidate";
  const eventId = createRadarEventIdentity({
    canonicalWorkId: item.targetId,
    eventType: item.eventType,
    region: item.region,
    platform: item.platform,
  });
  if (!eventId) return { status: "blocked", errors: ["radar-event-identity-invalid"], normalized: null };
  return {
    status: conflicts.length ? "ambiguous" : "matched",
    errors: [],
    normalized: {
      itemId: item.itemId,
      eventId,
      eventVersionId: item.eventVersionId,
      target: {
        targetId: matched.target.targetId,
        targetType: matched.target.targetType,
        targetStatus: matched.target.targetStatus,
        title: matched.target.title,
        canonical: true,
      },
      eventType: item.eventType,
      eventDate: item.eventDate,
      region: item.region,
      platform: item.platform,
      lifecycleStatus: item.lifecycleStatus,
      verificationStatus,
      evidence: uniqueEvidence,
      evidenceIds: uniqueEvidence.map((entry) => entry.evidenceId),
      sourceFamilies: [...eligibleFamilies].sort(),
      conflicts,
      calendarEligible: verificationStatus === "confirmed",
      requiresPreview: true,
    },
  };
}

function validatePopularityItem(item, { catalog, sourcesById }) {
  const keys = [
    "itemId", "sourceId", "region", "service", "chartKind", "periodStart",
    "periodEnd", "rank", "title", "year", "type", "season", "medium",
    "sourceLabel", "atAvailabilityConfirmed", "externalIds", "blocked",
  ];
  if (!exactKeys(item, keys)) return { status: "blocked", errors: ["popularity-item-shape-invalid"], normalized: null };
  const errors = [];
  if (!isStableContractId(item.itemId)) errors.push("popularity-item-id-invalid");
  const source = sourcesById.get(text(item.sourceId));
  if (!sourceAllows(source, "popularity_items")) errors.push("popularity-source-not-allowed");
  const start = dayNumber(item.periodStart);
  const end = dayNumber(item.periodEnd);
  if (start == null || end == null || start > end || end - start > 31) errors.push("popularity-period-invalid");
  if (!Number.isInteger(Number(item.rank)) || Number(item.rank) < 1 || Number(item.rank) > 100) {
    errors.push("popularity-rank-invalid");
  }
  if (item.region !== RADAR_DEFAULT_REGION) errors.push("popularity-region-invalid");
  if (!externalIds(item.externalIds)) errors.push("popularity-strong-id-required");
  const match = matchPopularityItem(item, catalog);
  if (match.status !== "matched") errors.push(`popularity-${match.status}`);
  if (!mayDisplayPopularityItem(item, match)) errors.push("popularity-not-displayable");
  const key = popularityItemKey(item);
  if (!key) errors.push("popularity-key-invalid");
  return errors.length
    ? { status: match.status === "ambiguous" ? "ambiguous" : "blocked", errors: [...new Set(errors)], normalized: null }
    : {
      status: "matched",
      errors: [],
      normalized: {
        ...item,
        targetId: match.targetId,
        itemKey: key,
        requiresPreview: true,
      },
    };
}

function validateEnvelope(proposal) {
  const errors = [];
  const keys = ["format", "version", "proposalId", "kind", "inputHash", "generatedAt", "region", "items"];
  if (!exactKeys(proposal, keys)) return result(["proposal-shape-invalid"]);
  if (proposal.format !== LOCAL_PROPOSAL_FORMAT) errors.push("proposal-format-invalid");
  if (proposal.version !== LOCAL_PROPOSAL_VERSION) errors.push("proposal-version-invalid");
  if (!isStableContractId(proposal.proposalId)) errors.push("proposal-id-invalid");
  if (!LOCAL_PROPOSAL_KINDS.includes(proposal.kind)) errors.push("proposal-kind-invalid");
  if (!HASH_FORM.test(text(proposal.inputHash))) errors.push("proposal-input-hash-invalid");
  if (!validInstant(proposal.generatedAt)) errors.push("proposal-generated-at-invalid");
  if (proposal.region !== RADAR_DEFAULT_REGION) errors.push("proposal-region-invalid");
  if (!Array.isArray(proposal.items) || proposal.items.length < 1 || proposal.items.length > LOCAL_PROPOSAL_MAX_ITEMS) {
    errors.push("proposal-items-invalid");
  }
  return result(errors);
}

export function validateLocalProposal(proposal, {
  sourceRegistry = [], catalog = [], expectedInputHash = null,
  seenProposalIds = [], seenInputHashes = [],
} = {}) {
  const envelope = validateEnvelope(proposal);
  const registry = validateProposalSourceRegistry(sourceRegistry);
  const optionErrors = [];
  if (!Array.isArray(seenProposalIds)
      || seenProposalIds.some((id) => !isStableContractId(id))
      || new Set(seenProposalIds).size !== seenProposalIds.length) optionErrors.push("seen-proposal-ids-invalid");
  if (!Array.isArray(seenInputHashes)
      || seenInputHashes.some((hash) => !HASH_FORM.test(text(hash)))
      || new Set(seenInputHashes).size !== seenInputHashes.length) optionErrors.push("seen-input-hashes-invalid");
  if (!envelope.ok || !registry.ok || !Array.isArray(catalog) || optionErrors.length) {
    return freezeDeep({
      ok: false,
      status: "blocked",
      errors: [
        ...envelope.errors,
        ...registry.errors,
        ...(!Array.isArray(catalog) ? ["catalog-invalid"] : []),
        ...optionErrors,
      ],
      items: [],
      summary: { total: 0, matched: 0, ambiguous: 0, blocked: 0, calendarEligible: 0 },
      writes: false,
      routineActivated: false,
      automaticRetry: false,
    });
  }
  if (!HASH_FORM.test(text(expectedInputHash)) || expectedInputHash !== proposal.inputHash) {
    return freezeDeep({
      ok: false,
      status: "blocked",
      errors: ["proposal-input-hash-unverified"],
      items: [],
      summary: { total: proposal.items.length, matched: 0, ambiguous: 0, blocked: proposal.items.length, calendarEligible: 0 },
      writes: false,
      routineActivated: false,
      automaticRetry: false,
    });
  }
  if (seenProposalIds.includes(proposal.proposalId) || seenInputHashes.includes(proposal.inputHash)) {
    return freezeDeep({
      ok: true,
      status: "duplicate",
      errors: [],
      items: [],
      summary: { total: proposal.items.length, matched: 0, ambiguous: 0, blocked: 0, calendarEligible: 0 },
      writes: false,
      routineActivated: false,
      automaticRetry: false,
    });
  }
  const sourcesById = new Map(sourceRegistry.map((source) => [source.sourceId, source]));
  const itemIds = new Set();
  const itemKeys = new Set();
  const rankKeys = new Set();
  const items = proposal.items.map((item) => {
    let checked = proposal.kind === "radar_events"
      ? validateRadarItem(item, { catalog, sourcesById })
      : validatePopularityItem(item, { catalog, sourcesById });
    const duplicateErrors = [];
    const id = text(item?.itemId);
    if (itemIds.has(id)) duplicateErrors.push("proposal-item-id-duplicate");
    itemIds.add(id);
    if (checked.normalized && proposal.kind === "radar_events") {
      const key = `${checked.normalized.eventId}|${checked.normalized.eventDate}`;
      if (itemKeys.has(key)) duplicateErrors.push("proposal-event-duplicate");
      itemKeys.add(key);
    }
    if (checked.normalized && proposal.kind === "popularity_items") {
      if (itemKeys.has(checked.normalized.itemKey)) duplicateErrors.push("proposal-popularity-key-duplicate");
      itemKeys.add(checked.normalized.itemKey);
      const rankKey = [item.sourceId, item.service, item.chartKind, item.periodStart, item.periodEnd, item.rank].join("|");
      if (rankKeys.has(rankKey)) duplicateErrors.push("proposal-rank-duplicate");
      rankKeys.add(rankKey);
    }
    if (duplicateErrors.length) checked = { status: "blocked", errors: duplicateErrors, normalized: null };
    return freezeDeep({ itemId: id, status: checked.status, errors: checked.errors, normalized: checked.normalized });
  });
  const summary = {
    total: items.length,
    matched: items.filter((item) => item.status === "matched").length,
    ambiguous: items.filter((item) => item.status === "ambiguous").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    calendarEligible: items.filter((item) => item.normalized?.calendarEligible === true).length,
  };
  return freezeDeep({
    ok: true,
    status: summary.matched > 0 ? "preview-ready" : "no-importable-items",
    errors: [],
    items,
    summary,
    writes: false,
    routineActivated: false,
    automaticRetry: false,
  });
}

export function decodeAndValidateLocalProposal(raw, options = {}) {
  if (typeof raw !== "string" || raw.length === 0
      || new TextEncoder().encode(raw).byteLength > LOCAL_PROPOSAL_MAX_BYTES) {
    return freezeDeep({ ok: false, status: "blocked", errors: ["proposal-raw-invalid"], items: [], writes: false, routineActivated: false, automaticRetry: false });
  }
  let proposal;
  try { proposal = JSON.parse(raw); }
  catch {
    return freezeDeep({ ok: false, status: "blocked", errors: ["proposal-json-invalid"], items: [], writes: false, routineActivated: false, automaticRetry: false });
  }
  return validateLocalProposal(proposal, options);
}
