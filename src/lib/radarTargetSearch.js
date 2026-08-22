import { createCatalogRadarTarget } from "./entdeckenUi.js";
import {
  PERSON_RADAR_ROLES,
  searchPersonRadarCatalog,
} from "./personRadarCatalog.js";
import { isStableContractId } from "./radarContracts.js";
import { CANONICAL_FRANCHISE_RADAR_CATALOG } from "./titleGroupRadar.js";

export const RADAR_TARGET_SEARCH_MIN_LENGTH = 2;
export const RADAR_TARGET_SEARCH_MAX_RESULTS = 8;

const ROLE_LABEL = Object.freeze({ actor: "Schauspiel", director: "Regie" });
const KIND_ORDER = Object.freeze({ franchise: 0, person: 1, catalog: 2 });

function text(value) { return String(value == null ? "" : value).trim(); }
function normalized(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function year(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1888 && parsed <= 2100 ? parsed : null;
}
function rank(label, needle) {
  if (label === needle) return 0;
  if (label.startsWith(needle)) return 1;
  if (label.split(" ").some((token) => token.startsWith(needle))) return 2;
  return label.includes(needle) ? 3 : null;
}
function frozen(status, entries = []) {
  return Object.freeze({
    status,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
  });
}

function* catalogRows({ master, streamingKnown, streamingDiscover }) {
  for (const entry of Array.isArray(master) ? master : []) {
    yield {
      watchmodeId: entry?.watchmode_id,
      catalogId: entry?.id,
      title: entry?.titel,
      type: entry?.typ,
      year: entry?.jahr,
    };
  }
  for (const entry of Array.isArray(streamingKnown?.titel) ? streamingKnown.titel : []) {
    yield {
      watchmodeId: entry?.watchmode_id,
      title: entry?.titel,
      type: entry?.typ,
      year: entry?.jahr,
    };
  }
  for (const entry of Array.isArray(streamingDiscover?.titel) ? streamingDiscover.titel : []) {
    yield {
      watchmodeId: entry?.watchmode_id,
      title: entry?.titel,
      type: entry?.typ,
      year: entry?.jahr,
    };
  }
}

function catalogEntries(input, needle) {
  const byId = new Map();
  const conflicts = new Set();
  for (const row of catalogRows(input)) {
    const label = normalized(row.title);
    const score = rank(label, needle);
    if (score == null) continue;
    const target = createCatalogRadarTarget(row);
    if (!target || conflicts.has(target.targetId)) continue;
    const candidateYear = year(row.year);
    const existing = byId.get(target.targetId);
    if (existing) {
      const identityConflict = normalized(existing.title) !== label
        || existing.target.targetType !== target.targetType
        || (existing.year != null && candidateYear != null && existing.year !== candidateYear);
      if (identityConflict) {
        byId.delete(target.targetId);
        conflicts.add(target.targetId);
      } else if (existing.year == null && candidateYear != null) {
        byId.set(target.targetId, { ...existing, year: candidateYear });
      }
      continue;
    }
    byId.set(target.targetId, {
      key: `catalog|${target.targetId}`,
      stableId: target.targetId,
      kind: "catalog",
      category: target.targetType === "series" ? "Serie" : "Film",
      title: target.title,
      year: candidateYear,
      meta: candidateYear == null ? null : String(candidateYear),
      score,
      target,
    });
  }

  /* Zwei identisch beschriftete Treffer mit verschiedenen IDs waeren ohne
     sichtbare Unterscheidung nicht sicher auswaehlbar und fallen deshalb weg. */
  const labels = new Map();
  for (const entry of byId.values()) {
    const key = `${entry.category}|${normalized(entry.title)}|${entry.year ?? ""}`;
    const ids = labels.get(key) || new Set();
    ids.add(entry.stableId);
    labels.set(key, ids);
  }
  return [...byId.values()].filter((entry) => (
    labels.get(`${entry.category}|${normalized(entry.title)}|${entry.year ?? ""}`)?.size === 1
  ));
}

function personEntries(needle) {
  const entries = [];
  for (const role of PERSON_RADAR_ROLES) {
    const result = searchPersonRadarCatalog({ query: needle, role });
    if (!["found", "partial_ambiguous"].includes(result.status)) continue;
    for (const person of result.entries) {
      if (!isStableContractId(person.targetId) || !isStableContractId(person.personExternalId)) continue;
      entries.push({
        key: `person|${person.targetId}`,
        stableId: person.targetId,
        kind: "person",
        category: "Person",
        title: person.name,
        meta: ROLE_LABEL[person.role],
        score: rank(normalized(person.name), needle),
        identity: Object.freeze({
          personExternalId: person.personExternalId,
          name: person.name,
          role: person.role,
        }),
      });
    }
  }
  return entries;
}

function franchiseEntries(needle) {
  const entries = [];
  for (const franchise of CANONICAL_FRANCHISE_RADAR_CATALOG) {
    if (!isStableContractId(franchise.franchiseId) || !isStableContractId(franchise.targetId)) continue;
    const scores = franchise.aliases.map((alias) => rank(normalized(alias), needle)).filter((value) => value != null);
    if (!scores.length) continue;
    entries.push({
      key: `franchise|${franchise.targetId}`,
      stableId: franchise.targetId,
      kind: "franchise",
      category: "Reihe",
      title: franchise.title,
      meta: "Film- und Serienreihe",
      score: Math.min(...scores),
      franchise: Object.freeze({
        franchiseId: franchise.franchiseId,
        targetId: franchise.targetId,
        name: franchise.title,
      }),
    });
  }
  return entries;
}

/* Rein lokale, ID-gebundene Vorschlagssuche. Sie startet weder Netz noch KI
   und erzeugt hoechstens acht sichtbare Treffer. Der grosse Katalog wird erst
   nach einer substanziellen Eingabe gelesen und nie als DOM-Select gerendert. */
export function searchRadarTargets({
  query,
  master = [],
  streamingKnown = null,
  streamingDiscover = null,
  personAvailable = false,
  franchiseAvailable = false,
} = {}) {
  const needle = normalized(query);
  if (needle.length < RADAR_TARGET_SEARCH_MIN_LENGTH) return frozen("idle");
  const entries = [
    ...catalogEntries({ master, streamingKnown, streamingDiscover }, needle),
    ...(personAvailable ? personEntries(needle) : []),
    ...(franchiseAvailable ? franchiseEntries(needle) : []),
  ].filter((entry) => Number.isInteger(entry.score));
  entries.sort((left, right) => (
    left.score - right.score
    || KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
    || left.title.localeCompare(right.title, "de-AT", { sensitivity: "base", numeric: true })
    || left.stableId.localeCompare(right.stableId, "de-AT")
  ));
  const limited = entries.slice(0, RADAR_TARGET_SEARCH_MAX_RESULTS);
  return frozen(limited.length ? "found" : "no_match", limited);
}
