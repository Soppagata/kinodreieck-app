import {
  normalisiereExternenTitel,
  ordneExternenTitelZu,
} from "./externalTitleIdentity.js";

const list = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? "").trim();
const normalized = (value) => text(value).toLocaleLowerCase("de-AT");

function canonicalService(value) {
  const raw = normalized(value)
    .replace(/\s*\(via (?:amazon )?prime\)\s*$/u, "")
    .replace(/^crunchyroll\s+premium\b/u, "crunchyroll")
    .replace(/^paramount\s+plus\b/u, "paramount+")
    .replace(/_/gu, " ")
    .replace(/\+/gu, " plus ")
    .replace(/[^a-z0-9]+/gu, "")
    .replace(/^amazonprimevideo$/u, "primevideo")
    .replace(/^amazonprime$/u, "primevideo")
    .replace(/^appletvplus$/u, "appletv");
  return raw;
}

export function serviceAllowedDiscoveryEntry(entry, selectedServices = []) {
  if (entry?.availability?.market === "cinema") return true;
  const selected = new Set(list(selectedServices).map(canonicalService).filter(Boolean));
  if (!selected.size) return false;
  const services = list(entry?.services).length
    ? entry.services : entry?.availability?.service ? [entry.availability.service] : [];
  return services.some((service) => selected.has(canonicalService(service)));
}

function referenceTime(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function displayShowTime(value, now) {
  const match = /(\d{1,2})\.(\d{1,2})\.(?:\s*(\d{1,2}):(\d{2}))?/.exec(text(value));
  if (!match) return null;
  const month = Number(match[2]) - 1;
  const day = Number(match[1]);
  const hour = match[3] == null ? 23 : Number(match[3]);
  const minute = match[4] == null ? 59 : Number(match[4]);
  let date = new Date(now.getFullYear(), month, day, hour, minute);
  const year = 365 * 86_400_000;
  if (now.getTime() - date.getTime() > year / 2) date = new Date(now.getFullYear() + 1, month, day, hour, minute);
  else if (date.getTime() - now.getTime() > year / 2) date = new Date(now.getFullYear() - 1, month, day, hour, minute);
  return Number.isFinite(date.getTime()) ? date : null;
}

function hasFutureShow(entry, now) {
  return list(entry?.z).some((value) => {
    const iso = /^\d{4}-\d{2}-\d{2}T/.test(text(value)) ? new Date(value) : displayShowTime(value, now);
    return Number.isFinite(iso?.getTime()) && iso.getTime() >= now.getTime();
  });
}

function year(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1888 && parsed <= 2999 ? parsed : null;
}

function filmAtId(value) {
  const clean = text(value);
  return /^[1-9]\d{0,14}$/u.test(clean) ? clean : null;
}

/* Nur aktuelle, eindeutig adressierbare Programmeintraege werden als
   Kino-Fueller projiziert. Ihre Reihenfolge ist die Reihenfolge des geladenen
   Programms; sie erhalten absichtlich keine Chartpopularitaet. */
export function currentCinemaDiscoveryCandidates({
  program = null, programInfo = null, now = new Date(),
} = {}) {
  if (programInfo?.abgelaufen === true || program?.status?.archiviert === true) return Object.freeze([]);
  const at = referenceTime(now);
  const idCounts = new Map();
  for (const entry of list(program?.filme)) {
    const id = filmAtId(entry?.film_at_id);
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const seenComposite = new Set();
  const rows = [];
  for (const entry of list(program?.filme)) {
    const id = filmAtId(entry?.film_at_id);
    const title = text(entry?.t);
    const releaseYear = year(entry?.j);
    const composite = `${normalisiereExternenTitel(title)}|${releaseYear}|film`;
    if (!id || idCounts.get(id) !== 1 || !title || releaseYear == null
        || !hasFutureShow(entry, at) || seenComposite.has(composite)) continue;
    seenComposite.add(composite);
    rows.push(Object.freeze({
      targetId: `film-at:${id}`,
      filmAtId: id,
      title,
      year: releaseYear,
      type: "film",
      region: "AT",
      services: Object.freeze([]),
      availability: Object.freeze({ region: "AT", market: "cinema", service: null, licenseTypes: Object.freeze([]) }),
      availabilityConfirmed: true,
      eligible: true,
      matchStatus: "matched",
      sourceId: "local:kino-program-at",
      sourceLabel: "Aktuelles Kinoprogramm",
      sourceRank: null,
      sourcePosition: null,
      genres: Object.freeze([...list(entry?.g)]),
      tags: Object.freeze([]),
      description: text(entry?.b) || null,
      beschreibung: text(entry?.b) || null,
      externalEvidence: Object.freeze([]),
      program: entry,
    }));
  }
  return Object.freeze(rows);
}

function descriptionOf(entry) {
  return text(entry?.beschreibung ?? entry?.description) || null;
}

/* Katalog- und FlixPatrol-Texte bleiben fluechtige Projektion. Ein eigener
   Text gewinnt immer; externe Texte duerfen nur nach der bestehenden strengen
   ID- bzw. Titel-Jahr-Typ-Zuordnung eine Luecke fuellen. */
export function projectTransientDescriptions(entries, {
  catalogEntries = [], facts = [],
} = {}) {
  const sources = [...list(catalogEntries), ...list(facts)].filter(descriptionOf);
  const comparableSources = sources.map(comparableIdentity);
  return Object.freeze(list(entries).map((entry) => {
    if (descriptionOf(entry) || !sources.length) return entry;
    const decision = ordneExternenTitelZu(comparableIdentity(entry), comparableSources);
    if (decision.status !== "matched") return entry;
    const description = descriptionOf(decision.match);
    if (!description) return entry;
    const usesGermanField = Object.prototype.hasOwnProperty.call(entry || {}, "titel")
      || Object.prototype.hasOwnProperty.call(entry || {}, "jahr");
    return Object.freeze({
      ...entry,
      ...(usesGermanField ? { beschreibung: description } : { description }),
    });
  }));
}

function comparableIdentity(entry) {
  const external = entry?.externalIds || {};
  const projected = {
    ...entry,
    watchmode_id: entry?.watchmode_id ?? entry?.watchmodeId ?? external.watchmode,
    imdb_id: entry?.imdb_id ?? entry?.imdbId ?? external.imdb,
    tmdb_id: entry?.tmdb_id ?? entry?.tmdbId ?? external.tmdb,
    flixpatrol_id: entry?.flixpatrol_id ?? entry?.flixpatrolId ?? external.flixpatrol,
  };
  const target = text(entry?.targetId).match(/^(watchmode|imdb|tmdb|flixpatrol):(.+)$/u);
  if (target && projected[`${target[1]}_id`] == null) projected[`${target[1]}_id`] = target[2];
  return projected;
}

export function fillPopularWithCinema(rows, cinemaRows, limit = 50) {
  const result = [];
  const seenTargets = new Set();
  for (const entry of [...list(rows), ...list(cinemaRows)]) {
    const targetId = text(entry?.targetId);
    if (targetId && seenTargets.has(targetId)) continue;
    const decision = ordneExternenTitelZu(comparableIdentity(entry), result.map(comparableIdentity));
    if (["matched", "ambiguous"].includes(decision.status)) continue;
    if (targetId) seenTargets.add(targetId);
    result.push(entry);
    if (result.length >= Math.max(0, Number(limit) || 0)) break;
  }
  return Object.freeze(result);
}
