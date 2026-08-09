/* Abgeschalteter Popularity-Vertrag. Phase 1 enthält ausschließlich
   deterministisches Matching und synthetische Fixtures – keinen Abruf. */

import { isStableContractId } from "./radarContracts.js";

export const POPULARITY_SOURCE_ROLES = Object.freeze(["primary_rank", "identity_control", "availability_control"]);
export const POPULARITY_SOURCE_MODES = Object.freeze(["fixture", "manual_link", "api", "download"]);
export const POPULARITY_RIGHTS_STATUSES = Object.freeze(["fixture", "approved", "blocked", "re_audit", "manual_only", "parked"]);
export const POPULARITY_MATCH_STATUSES = Object.freeze(["matched", "unmatched", "ambiguous", "blocked"]);

const ALLOWED_EXTERNAL_IDS = Object.freeze(["watchmode", "imdb", "tmdb", "wikidata"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function result(errors) { return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) }); }
function dayNumber(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const millis = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === normalized
    ? Math.floor(millis / 86400000)
    : null;
}
function exactTitle(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT").replace(/[^a-z0-9]+/g, " ").trim();
}

export function validatePopularitySource(source) {
  const errors = [];
  if (!source || typeof source !== "object" || Array.isArray(source)) return result(["source-invalid"]);
  if (!isStableContractId(source.sourceId)) errors.push("source-id-invalid");
  if (!POPULARITY_SOURCE_ROLES.includes(source.role)) errors.push("source-role-invalid");
  if (!POPULARITY_SOURCE_MODES.includes(source.mode)) errors.push("source-mode-invalid");
  if (!POPULARITY_RIGHTS_STATUSES.includes(source.rightsStatus)) errors.push("source-rights-invalid");
  if (source.region !== "AT") errors.push("source-region-invalid");
  if (!text(source.chartKind)) errors.push("source-chart-kind-invalid");
  if (source.mode === "fixture" && source.enabled !== false) errors.push("fixture-source-must-be-disabled");
  if (source.enabled === true && source.rightsStatus !== "approved") errors.push("source-enabled-without-rights");
  return result(errors);
}

export function mayRunPopularitySource(source, { featureEnabled = false } = {}) {
  const checked = validatePopularitySource(source);
  return checked.ok && featureEnabled === true && source.enabled === true
    && source.mode !== "fixture" && source.rightsStatus === "approved"
    && source.attributionApproved === true;
}

export function popularityItemKey(item) {
  const rank = Number(item?.rank);
  const parts = [item?.sourceId, item?.region, item?.service, item?.chartKind, item?.periodEnd]
    .map(text);
  const periodStart = dayNumber(item?.periodStart);
  const periodEnd = dayNumber(item?.periodEnd);
  return parts.every(Boolean) && item?.region === "AT" && periodStart != null && periodEnd != null
    && periodStart <= periodEnd && Number.isInteger(rank) && rank > 0
    ? [...parts, String(rank)].map(encodeURIComponent).join("|")
    : null;
}

function idEntries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return ALLOWED_EXTERNAL_IDS
    .filter((key) => text(value[key]))
    .map((key) => [key, text(value[key])]);
}

function recordMatchesId(record, key, value) {
  return text(record?.externalIds?.[key]) === value;
}

export function matchPopularityItem(item, catalog) {
  if (item?.blocked === true) return Object.freeze({ status: "blocked", targetId: null, basis: "source-blocked" });
  const records = Array.isArray(catalog) ? catalog : [];
  const externalIds = idEntries(item?.externalIds);
  const identities = new Map();
  for (const [key, value] of externalIds) {
    const matches = records.filter((record) => recordMatchesId(record, key, value));
    if (matches.length > 1) return Object.freeze({ status: "ambiguous", targetId: null, basis: `external-id:${key}` });
    if (matches.length === 0) {
      return Object.freeze({
        status: externalIds.length > 1 ? "blocked" : "unmatched",
        targetId: null,
        basis: externalIds.length > 1 ? "external-id-incomplete" : `external-id:${key}`,
      });
    }
    if (!isStableContractId(matches[0].targetId)) {
      return Object.freeze({ status: "blocked", targetId: null, basis: "external-id-target-invalid" });
    }
    identities.set(text(matches[0].targetId), matches[0]);
  }
  if (identities.size > 1) return Object.freeze({ status: "blocked", targetId: null, basis: "external-id-conflict" });
  if (identities.size === 1) {
    const [record] = identities.values();
    return Object.freeze({
      status: "matched",
      targetId: record.targetId,
      basis: externalIds.length > 1 ? "multiple-external-ids" : "external-id",
    });
  }

  const normalizedTitle = exactTitle(item?.title);
  const year = Number(item?.year);
  const type = text(item?.type);
  if (!normalizedTitle || !Number.isInteger(year) || !type) {
    return Object.freeze({ status: "unmatched", targetId: null, basis: "insufficient-fields" });
  }
  const exact = records.filter((record) => (
    isStableContractId(record.targetId)
    && exactTitle(record.title) === normalizedTitle
    && Number(record.year) === year
    && text(record.type) === type
    && (item.season == null || Number(record.season) === Number(item.season))
  ));
  if (exact.length === 1) return Object.freeze({ status: "matched", targetId: exact[0].targetId, basis: "exact-title-year-type" });
  if (exact.length > 1) return Object.freeze({ status: "ambiguous", targetId: null, basis: "exact-title-year-type" });
  return Object.freeze({ status: "unmatched", targetId: null, basis: "no-exact-match" });
}

export function mayDisplayPopularityItem(item, match) {
  if (match?.status !== "matched") return false;
  if (!popularityItemKey(item)) return false;
  if (!["streaming", "cinema"].includes(item.medium)) return false;
  if (item.medium === "streaming" && item.atAvailabilityConfirmed !== true) return false;
  return !!(
    item.region === "AT" && text(item.sourceLabel) && text(item.periodStart) && text(item.periodEnd)
  );
}
