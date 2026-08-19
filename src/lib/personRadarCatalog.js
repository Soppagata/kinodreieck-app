import { isStableContractId } from "./radarContracts.js";

export const PERSON_RADAR_ROLES = Object.freeze(["actor", "director"]);
export const PERSON_RADAR_CATALOG_MAX_RESULTS = 6;

export function createPersonRadarTargetId(personExternalId, role) {
  const id = text(personExternalId);
  return isStableContractId(id) && PERSON_RADAR_ROLES.includes(role)
    ? `person:${id}:${role}`
    : null;
}

/* Der kleine Pilotkatalog uebernimmt nur die im lokalen Pflichtspike belegten
   QIDs und Rollen. Namen dienen der Suche; erst die ausgewaehlte starke ID plus
   Rolle wird zur Identitaet. Der Katalog ist bewusst keine freie Personensuche. */
export const PERSON_RADAR_CATALOG = Object.freeze([
  Object.freeze({ targetId: "person:wikidata:Q42869:actor", personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor" }),
  Object.freeze({ targetId: "person:wikidata:Q47284:director", personExternalId: "wikidata:Q47284", name: "Robert Rodriguez", role: "director" }),
  Object.freeze({ targetId: "person:wikidata:Q271967:actor", personExternalId: "wikidata:Q271967", name: "Greta Gerwig", role: "actor" }),
  Object.freeze({ targetId: "person:wikidata:Q271967:director", personExternalId: "wikidata:Q271967", name: "Greta Gerwig", role: "director" }),
  Object.freeze({ targetId: "person:wikidata:Q7374:director", personExternalId: "wikidata:Q7374", name: "Alfred Hitchcock", role: "director" }),
]);

function text(value) { return String(value == null ? "" : value).trim(); }
function normalized(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function validEntry(entry) {
  return !!entry && typeof entry === "object" && !Array.isArray(entry)
    && Object.keys(entry).length === 4
    && entry.targetId === createPersonRadarTargetId(entry.personExternalId, entry.role)
    && isStableContractId(entry.targetId)
    && isStableContractId(entry.personExternalId)
    && !/^(?:fixture|synthetic):/i.test(text(entry.personExternalId))
    && !!text(entry.name) && text(entry.name).length <= 160
    && text(entry.name) !== text(entry.personExternalId)
    && PERSON_RADAR_ROLES.includes(entry.role);
}
function frozen(status, entries = []) {
  return Object.freeze({ status, entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))) });
}

export function findPersonRadarCatalogIdentity(identity, catalog = PERSON_RADAR_CATALOG) {
  if (!validEntry(identity)) return null;
  const matches = (Array.isArray(catalog) ? catalog : []).filter((entry) => (
    validEntry(entry)
      && entry.personExternalId === identity.personExternalId
      && entry.name === identity.name
      && entry.role === identity.role
  ));
  return matches.length === 1 ? Object.freeze({ ...matches[0], canonical: true }) : null;
}

export function searchPersonRadarCatalog({ query, role } = {}, catalog = PERSON_RADAR_CATALOG) {
  const needle = normalized(query);
  if (!PERSON_RADAR_ROLES.includes(role)) return frozen("role_invalid");
  if (needle.length < 2) return frozen("idle");
  const entries = (Array.isArray(catalog) ? catalog : []).filter(validEntry);
  const nameMatches = entries.filter((entry) => normalized(entry.name).includes(needle));
  const roleMatches = nameMatches.filter((entry) => entry.role === role);
  if (!roleMatches.length) return frozen(nameMatches.length ? "role_mismatch" : "no_match");

  const duplicateLabels = new Set();
  const byLabel = new Map();
  for (const entry of roleMatches) {
    const key = `${normalized(entry.name)}|${entry.role}`;
    const ids = byLabel.get(key) || new Set();
    ids.add(entry.personExternalId);
    byLabel.set(key, ids);
    if (ids.size > 1) duplicateLabels.add(key);
  }
  const selectable = roleMatches.filter((entry) => (
    !duplicateLabels.has(`${normalized(entry.name)}|${entry.role}`)
  )).sort((a, b) => a.name.localeCompare(b.name, "de-AT") || a.role.localeCompare(b.role));
  if (!selectable.length) return frozen("ambiguous");
  return frozen(duplicateLabels.size ? "partial_ambiguous" : "found", selectable.slice(0, PERSON_RADAR_CATALOG_MAX_RESULTS));
}
