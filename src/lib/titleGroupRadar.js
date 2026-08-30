import { norm } from "./match.js";
import { isStableContractId } from "./radarContracts.js";

export const TITLE_GROUP_FORMAT = "kd-radar-title-group-v1";
export const TITLE_GROUP_QUERY_VERSION = "title-group-query-v1";
export const TITLE_GROUP_MIN_WORDS = 2;
export const TITLE_GROUP_MIN_CHARACTERS = 8;
export const TITLE_GROUP_MAX_MEMBERS = 20;

/* Produktlogik enthaelt absichtlich keinen eingebauten Beispiel- oder
   Franchise-Katalog. Neue Ziele kommen als unveraenderter Freitext vom Konto;
   historische Titelgruppen bleiben nur fuer Feed-Kompatibilitaet lesbar. */
export const CANONICAL_FRANCHISE_RADAR_CATALOG = Object.freeze([]);

const YEAR_MIN = 1888;
const YEAR_MAX = 2100;

function text(value) { return String(value == null ? "" : value).trim(); }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
function publicLabel(value, max = 200) {
  const normalized = text(value);
  return normalized === value && normalized.length >= 1 && normalized.length <= max
    && !/^(?:work|watchmode|fixture|catalog|tmdb|imdb|wikidata):/i.test(normalized);
}
function queryTokens(value) { return value.split(" ").filter(Boolean); }
function querySubstantial(value) {
  const tokens = queryTokens(value);
  return tokens.length >= TITLE_GROUP_MIN_WORDS
    && tokens.join("").length >= TITLE_GROUP_MIN_CHARACTERS
    && value.length <= 100;
}
function containsTokenSequence(haystack, needle) {
  const words = queryTokens(haystack);
  const query = queryTokens(needle);
  if (!query.length || query.length > words.length) return false;
  for (let start = 0; start <= words.length - query.length; start += 1) {
    if (query.every((token, offset) => words[start + offset] === token)) return true;
  }
  return false;
}
function memberFromIndexEntry(entry) {
  const targetId = text(entry?.targetId);
  const targetType = entry?.target?.targetType;
  const title = text(entry?.title);
  const year = Number(entry?.year);
  if (!isStableContractId(targetId, { allowFixture: false })
      || /^(?:fixture|synthetic):/i.test(targetId)
      || !["work", "series"].includes(targetType)
      || !publicLabel(title)
      || !Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) return null;
  return { targetId, targetType, title, year };
}
function titleGroupTargetId(queryKey) {
  const slug = queryKey.replace(/ /g, "-");
  const targetId = `title-group:v1:${slug}`;
  return isStableContractId(targetId, { allowFixture: false }) ? targetId : null;
}

function normalizedAlias(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

const CANONICAL_RADAR_EVENT_WORDS = Object.freeze([
  "kinostart", "streamingstart", "serienstart", "staffelstart",
]);
const CANONICAL_RADAR_AT_WORDS = Object.freeze(["osterreich", "austria"]);

/* Die sichtbare Freitexteingabe wird nur bei einem engen, belegten Vertrag
   kanonisiert: exakter Alias oder Alias + klarer Terminauftrag fuer AT. Ein
   beliebiger Titel, der die Reihe nur erwaehnt, bleibt ehrlicher Freitext. */
export function resolveCanonicalFranchiseRadarInput(value) {
  const normalized = normalizedAlias(value);
  if (!normalized) return null;
  const matches = CANONICAL_FRANCHISE_RADAR_CATALOG.filter((entry) => (
    entry.aliases.some((alias) => {
      const normalizedEntry = normalizedAlias(alias);
      if (normalized === normalizedEntry) return true;
      if (!normalized.startsWith(`${normalizedEntry} `)) return false;
      const rest = normalized.slice(normalizedEntry.length + 1);
      return CANONICAL_RADAR_EVENT_WORDS.some((word) => rest.split(" ").includes(word))
        && CANONICAL_RADAR_AT_WORDS.some((word) => rest.split(" ").includes(word));
    })
  ));
  if (matches.length !== 1) return null;
  const match = matches[0];
  return Object.freeze({
    name: match.title,
    franchiseId: match.franchiseId,
    targetId: match.targetId,
  });
}

function canonicalFranchiseMember(entry, franchiseId) {
  if (text(entry?.franchiseId) !== franchiseId) return null;
  return memberFromIndexEntry({
    targetId: entry?.targetId,
    target: { targetType: entry?.targetType },
    title: entry?.title,
    year: entry?.year,
  });
}

export function resolveCanonicalFranchiseRadarTarget({ name, catalog = [] } = {}) {
  const requested = normalizedAlias(name);
  if (!requested) return freezeDeep({ status: "unresolved", franchise: null, target: null });
  const matches = CANONICAL_FRANCHISE_RADAR_CATALOG.filter((entry) => (
    entry.aliases.some((alias) => normalizedAlias(alias) === requested)
  ));
  if (matches.length !== 1) return freezeDeep({ status: "unresolved", franchise: null, target: null });
  const contract = matches[0];
  const members = [...new Map((Array.isArray(catalog) ? catalog : [])
    .map((entry) => canonicalFranchiseMember(entry, contract.franchiseId))
    .filter(Boolean)
    .map((entry) => [entry.targetId, entry])).values()]
    .sort((left, right) => left.targetId.localeCompare(right.targetId, "de-AT"));
  if (members.length < 2 || members.length > TITLE_GROUP_MAX_MEMBERS) {
    return freezeDeep({ status: "unavailable", franchise: null, target: null });
  }
  const titleGroup = {
    format: TITLE_GROUP_FORMAT,
    queryVersion: TITLE_GROUP_QUERY_VERSION,
    queryKey: contract.queryKey,
    displayName: contract.title,
    members,
  };
  if (titleGroupTargetId(contract.queryKey) !== contract.targetId
      || !validateTitleGroupMetadata(titleGroup, { targetId: contract.targetId, title: contract.title })) {
    return freezeDeep({ status: "unavailable", franchise: null, target: null });
  }
  return freezeDeep({
    status: "ready",
    franchise: {
      kind: "franchise",
      franchiseId: contract.franchiseId,
      title: contract.title,
      aliases: [...contract.aliases],
      canonical: true,
    },
    target: {
      targetId: contract.targetId,
      targetType: "franchise",
      targetStatus: "active",
      title: contract.title,
      canonical: true,
      titleGroup,
    },
  });
}

export function normalizeTitleGroupQuery(value) {
  return norm(value);
}

export function validateTitleGroupMetadata(value, { targetId = null, title = null } = {}) {
  const keys = ["format", "queryVersion", "queryKey", "displayName", "members"];
  if (!exactKeys(value, keys)) return false;
  const queryKey = normalizeTitleGroupQuery(value.queryKey);
  if (value.format !== TITLE_GROUP_FORMAT
      || value.queryVersion !== TITLE_GROUP_QUERY_VERSION
      || queryKey !== value.queryKey || !querySubstantial(queryKey)
      || !publicLabel(value.displayName, 160)
      || !Array.isArray(value.members)
      || value.members.length < 2 || value.members.length > TITLE_GROUP_MAX_MEMBERS) return false;
  if (targetId != null && titleGroupTargetId(queryKey) !== targetId) return false;
  if (title != null && text(title) !== value.displayName) return false;
  const memberIds = new Set();
  for (const member of value.members) {
    if (!exactKeys(member, ["targetId", "targetType", "title", "year"])
        || !isStableContractId(member.targetId, { allowFixture: false })
        || /^(?:fixture|synthetic|title-group):/i.test(member.targetId)
        || !["work", "series"].includes(member.targetType)
        || !publicLabel(member.title)
        || !Number.isInteger(member.year) || member.year < YEAR_MIN || member.year > YEAR_MAX
        || memberIds.has(member.targetId)) return false;
    memberIds.add(member.targetId);
  }
  return true;
}

export function isTitleGroupTarget(value) {
  return value?.targetType === "franchise"
    && validateTitleGroupMetadata(value.titleGroup, { targetId: value.targetId, title: value.title });
}

export function createTitleGroupRadarTarget(index, query, { displayName = null } = {}) {
  const queryKey = normalizeTitleGroupQuery(query);
  if (!querySubstantial(queryKey)) {
    return Object.freeze({ status: "too_short", target: null, total: 0, excluded: 0 });
  }
  const shownName = text(displayName ?? query).replace(/\s+/g, " ");
  if (!publicLabel(shownName, 160)) {
    return Object.freeze({ status: "invalid", target: null, total: 0, excluded: 0 });
  }
  const matches = [];
  let excluded = 0;
  for (const entry of Array.isArray(index) ? index : []) {
    const keys = Array.isArray(entry?.searchKeys) ? entry.searchKeys : [];
    if (!keys.some((key) => containsTokenSequence(key, queryKey))) continue;
    const member = memberFromIndexEntry(entry);
    if (member) matches.push(member);
    else excluded += 1;
  }
  const unique = [...new Map(matches.map((entry) => [entry.targetId, entry])).values()]
    .sort((left, right) => (
      left.title.localeCompare(right.title, "de-AT", { sensitivity: "base", numeric: true })
      || left.year - right.year
      || left.targetId.localeCompare(right.targetId, "de-AT")
    ));
  if (unique.length < 2) {
    return Object.freeze({ status: "ambiguous", target: null, total: unique.length, excluded });
  }
  if (unique.length > TITLE_GROUP_MAX_MEMBERS) {
    return Object.freeze({ status: "too_many", target: null, total: unique.length, excluded });
  }
  const targetId = titleGroupTargetId(queryKey);
  if (!targetId) return Object.freeze({ status: "invalid", target: null, total: 0, excluded });
  const titleGroup = {
    format: TITLE_GROUP_FORMAT,
    queryVersion: TITLE_GROUP_QUERY_VERSION,
    queryKey,
    displayName: shownName,
    members: unique,
  };
  const target = {
    targetId,
    targetType: "franchise",
    targetStatus: "active",
    title: shownName,
    canonical: true,
    titleGroup,
  };
  if (!validateTitleGroupMetadata(titleGroup, { targetId, title: shownName })) {
    return Object.freeze({ status: "invalid", target: null, total: 0, excluded });
  }
  return freezeDeep({ status: "ready", target, total: unique.length, excluded });
}

export function resolveTitleGroupRadarTarget(target, index) {
  if (!isTitleGroupTarget(target)) {
    return Object.freeze({ status: "invalid", target: null, total: 0, excluded: 0 });
  }
  const resolved = createTitleGroupRadarTarget(index, target.titleGroup.queryKey, {
    displayName: target.titleGroup.displayName,
  });
  if (resolved.status !== "ready" || resolved.target.targetId !== target.targetId) return resolved;
  return resolved;
}
