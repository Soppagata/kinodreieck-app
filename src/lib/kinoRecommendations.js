import { rankRecommendations } from "./recommendationRanking.js";
import { normalizeDiscoveryMediaType, normalizeDiscoveryTitle } from "./webDiscoveryFeed.js";
import { profileCompatibleGenres } from "./profileGenreVocabulary.js";

export const KINO_PERSONAL_LIMIT = 6;

function text(value) { return String(value == null ? "" : value).trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function validYear(value) {
  return Number.isInteger(value) && value >= 1888 && value <= new Date().getUTCFullYear() + 10;
}
function stableFilmAtId(value) {
  const clean = text(value);
  return /^[1-9]\d{0,14}$/u.test(clean) ? clean : null;
}
function masterType(entry) {
  return normalizeDiscoveryMediaType(entry?.typ ?? entry?.type ?? "film") || "film";
}
function masterTitles(entry) {
  return new Set([entry?.titel, entry?.title, entry?.originaltitel, entry?.originalTitle]
    .map(normalizeDiscoveryTitle).filter(Boolean));
}
function programTitles(entry) {
  return new Set([entry?.t, entry?.ot].map(normalizeDiscoveryTitle).filter(Boolean));
}
function overlaps(left, right) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}
function strictMasterMatches(program, master) {
  const sourceId = stableFilmAtId(program?.film_at_id);
  const byId = sourceId ? list(master).filter((entry) => (
    stableFilmAtId(entry?.film_at_id) === sourceId
  )) : [];
  if (byId.length) return byId;
  if (!validYear(program?.j)) return [];
  const titles = programTitles(program);
  return list(master).filter((entry) => (
    /* Eine vorhandene abweichende starke film.at-ID blockiert den
       Titel-Fallback: lieber ein False Negative als zwei Werke gleichsetzen. */
    !stableFilmAtId(entry?.film_at_id)
    && masterType(entry) === "film" && entry?.jahr === program.j
    && overlaps(titles, masterTitles(entry))
  ));
}
function libraryProjection(master) {
  return list(master).map((entry) => ({
    ...entry,
    targetId: entry?.id != null ? `catalog:${entry.id}` : null,
    genres: list(entry?.genre).length ? entry.genre : list(entry?.genres),
    franchiseId: text((entry?.franchise || [])[0] || entry?.franchiseId) || null,
  }));
}

/* Erweitert die bestehende Kino-Lane nur um reale, aktuelle Programmeintraege
   ausserhalb der Mediathek. Film.at-ID ist die Werk-/Sprungidentitaet; bei
   unklarem Mediathek-Overlap wird lieber nichts empfohlen. */
export function rankKinoProgramRecommendations({
  programEntries = [], programArchived = false, programExpired = false,
  profile = null, master = [], limit = KINO_PERSONAL_LIMIT,
} = {}) {
  if (programArchived || programExpired || profile?.beschaedigt === true) return Object.freeze([]);
  const idCounts = new Map();
  for (const entry of list(programEntries)) {
    const id = stableFilmAtId(entry?.film_at_id);
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const programByTarget = new Map();
  const candidates = [];
  list(programEntries).forEach((entry, index) => {
    const filmAtId = stableFilmAtId(entry?.film_at_id);
    const title = text(entry?.t);
    const genres = profileCompatibleGenres(entry?.g);
    if (!filmAtId || idCounts.get(filmAtId) !== 1 || !title || !validYear(entry?.j)
        || !list(entry?.z).length || !genres.length) return;
    const matches = strictMasterMatches(entry, master);
    /* Ein eindeutiger Mediathek-Treffer bleibt in der unveraenderten
       bestehenden Kino-Karte; mehrere Kandidaten blockieren fail-closed. */
    if (matches.length !== 0) return;
    const targetId = `kino:${filmAtId}`;
    programByTarget.set(targetId, entry);
    candidates.push(Object.freeze({
      targetId,
      title,
      matchStatus: "matched",
      region: "AT",
      availabilityConfirmed: true,
      eligible: true,
      genres,
      tags: Object.freeze([]),
      franchiseId: null,
      freshnessAt: null,
      sourceId: "local:kino-program-at",
      sourceRank: index + 1,
      services: Object.freeze(["Kino"]),
      year: entry.j,
      type: "film",
    }));
  });
  return Object.freeze(rankRecommendations(candidates, {
    profile: profile || {},
    library: libraryProjection(master),
    useLibrary: true,
    excludedTargetIds: [],
  }).slice(0, Math.max(0, Math.min(KINO_PERSONAL_LIMIT, Number(limit) || 0)))
    .map((row) => Object.freeze({
      ...row,
      filmAtId: row.targetId.slice("kino:".length),
      program: programByTarget.get(row.targetId),
    })));
}
