import {
  ergaenzeFehlendeExterneKennungen,
  externeTitelKennungen,
  externesReferenzjahr,
  normalisiereExterneWerkart,
  normalisiereExternenTitel,
  pruefeExterneTitelIdentitaet,
} from "./externalTitleIdentity.js";

const text = (value, max = 5000) => String(value ?? "").trim().slice(0, max);
const list = (value) => Array.isArray(value) ? value : [];
const positiveId = (value) => {
  const raw = text(value, 32);
  return /^\d+$/.test(raw) && BigInt(raw) > 0n ? String(BigInt(raw)) : null;
};
const imdbId = (value) => {
  const raw = text(value, 16).toLowerCase();
  const match = raw.match(/^(?:tt)?([0-9]{5,12})$/u);
  return match && /[1-9]/u.test(match[1]) ? `tt${match[1]}` : null;
};
const year = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1870 && parsed <= 2999 ? parsed : null;
};
const mediaType = (value) => {
  const raw = text(value, 24).toLowerCase();
  if (["film", "movie"].includes(raw)) return "film";
  if (["serie", "series", "tv", "tv_series", "tv series", "show"].includes(raw)) return "series";
  return null;
};
const iso = (value) => {
  const raw = text(value, 64);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
};

function terms(value) {
  const found = new Map();
  for (const entry of list(value)) {
    const name = text(typeof entry === "object" ? entry?.name : entry, 240);
    if (!name) continue;
    const id = text(typeof entry === "object" ? entry?.id : null, 64) || null;
    const key = name.toLocaleLowerCase("de-AT");
    if (!found.has(key)) found.set(key, Object.freeze({ id, name }));
  }
  return Object.freeze([...found.values()]);
}

function comparableProjection(projection) {
  const identity = projection?.identity || {};
  return {
    flixpatrol_id: identity.flixpatrolId,
    imdb_id: identity.imdbId,
    tmdb_id: identity.tmdbId,
    watchmode_id: identity.watchmodeId,
    titel: identity.title,
    originaltitel: identity.originalTitle,
    jahr: identity.year,
    typ: identity.mediaType,
  };
}

export function normalizeTitleFactsProjection(value, { allowLegacy = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const legacyFlixpatrol = allowLegacy && value.schemaVersion == null
    && /^ttl_[A-Za-z0-9]{20,40}$/u.test(text(value.sourceId ?? value.flixpatrol_id, 64));
  if (value.schemaVersion !== "title-facts-projection-v1" && !legacyFlixpatrol) return null;
  const identityRaw = value.identity && typeof value.identity === "object" ? value.identity : {};
  const source = value.source === "watchmode" ? "watchmode"
    : value.source === "flixpatrol" || legacyFlixpatrol ? "flixpatrol" : null;
  const flixpatrolId = text(identityRaw.flixpatrolId ?? value.sourceId ?? value.flixpatrol_id, 64);
  const identity = Object.freeze({
    flixpatrolId: /^ttl_[A-Za-z0-9]{20,40}$/u.test(flixpatrolId) ? flixpatrolId : null,
    imdbId: imdbId(identityRaw.imdbId ?? value.imdb_id),
    tmdbId: positiveId(identityRaw.tmdbId ?? value.tmdb_id),
    watchmodeId: positiveId(identityRaw.watchmodeId ?? value.watchmode_id),
    title: text(identityRaw.title ?? value.titel ?? value.title, 240) || null,
    originalTitle: text(identityRaw.originalTitle ?? value.originaltitel ?? value.originalTitle, 240) || null,
    year: year(identityRaw.year ?? value.jahr ?? value.releaseYear),
    mediaType: mediaType(identityRaw.mediaType ?? value.typ ?? value.mediaType ?? value.type),
  });
  if (!source || !identity.mediaType || identity.year == null || !identity.title
      || ![identity.flixpatrolId, identity.imdbId, identity.tmdbId, identity.watchmodeId].some(Boolean)) return null;
  const language = text(value.descriptionLanguage, 8).toLowerCase();
  return Object.freeze({
    schemaVersion: "title-facts-projection-v1",
    source,
    checkedAt: iso(value.checkedAt),
    fetchedAt: iso(value.fetchedAt),
    freshUntil: iso(value.freshUntil),
    fresh: value.fresh === true,
    sourceUrl: /^https:\/\//u.test(text(value.sourceUrl, 1000)) ? text(value.sourceUrl, 1000) : null,
    identity,
    description: text(value.description ?? value.beschreibung, 4000) || null,
    descriptionLanguage: ["de", "en"].includes(language) ? language : null,
    runtimeMinutes: Number.isInteger(Number(value.runtimeMinutes ?? value.laufzeit_minuten))
      && Number(value.runtimeMinutes ?? value.laufzeit_minuten) > 0
      ? Number(value.runtimeMinutes ?? value.laufzeit_minuten) : null,
    premiere: /^\d{4}-\d{2}-\d{2}$/u.test(text(value.premiere, 10)) ? text(value.premiere, 10) : null,
    genres: terms(value.genres),
    keywords: terms(value.keywords),
    charts: Object.freeze([...list(value.charts)]),
  });
}

export function titleFactIdentity(entry) {
  const embedded = normalizeTitleFactsProjection(entry?.title_facts ?? entry?.titleFacts);
  const identity = embedded?.identity || {};
  const external = entry?.externalIds || {};
  const candidate = {
    flixpatrolId: text(entry?.flixpatrol_id ?? entry?.flixpatrolId ?? external.flixpatrol ?? identity.flixpatrolId, 64) || undefined,
    imdbId: imdbId(entry?.imdb_id ?? entry?.imdbId ?? external.imdb ?? identity.imdbId) || undefined,
    tmdbId: positiveId(entry?.tmdb_id ?? entry?.tmdbId ?? external.tmdb ?? identity.tmdbId) || undefined,
    mediaType: mediaType(entry?.typ ?? entry?.type ?? entry?.mediaType ?? identity.mediaType) || undefined,
  };
  if (!candidate.flixpatrolId || !/^ttl_[A-Za-z0-9]{20,40}$/u.test(candidate.flixpatrolId)) delete candidate.flixpatrolId;
  if (!candidate.imdbId) delete candidate.imdbId;
  if (!candidate.tmdbId) delete candidate.tmdbId;
  if (!candidate.mediaType) delete candidate.mediaType;
  return candidate.flixpatrolId || candidate.imdbId || candidate.tmdbId ? Object.freeze(candidate) : null;
}

function comparableEntry(entry) {
  const external = entry?.externalIds || {};
  const target = text(entry?.targetId, 120).match(/^(watchmode|imdb|tmdb|flixpatrol):(.+)$/u);
  const projected = {
    ...entry,
    watchmode_id: entry?.watchmode_id ?? entry?.watchmodeId ?? external.watchmode,
    imdb_id: entry?.imdb_id ?? entry?.imdbId ?? external.imdb,
    tmdb_id: entry?.tmdb_id ?? entry?.tmdbId ?? external.tmdb,
    flixpatrol_id: entry?.flixpatrol_id ?? entry?.flixpatrolId ?? external.flixpatrol,
  };
  if (target && projected[`${target[1]}_id`] == null) projected[`${target[1]}_id`] = target[2];
  return projected;
}

function matchedFacts(entry, facts) {
  const matches = [];
  const embedded = normalizeTitleFactsProjection(entry?.title_facts ?? entry?.titleFacts);
  for (const fact of [embedded, ...list(facts).map((value) => normalizeTitleFactsProjection(value, { allowLegacy: true }))]) {
    if (!fact) continue;
    const decision = pruefeExterneTitelIdentitaet(comparableProjection(fact), comparableEntry(entry));
    if (decision.status === "matched") matches.push(fact);
  }
  const unique = new Map();
  for (const fact of matches) {
    const key = `${fact.source}|${fact.identity.flixpatrolId || ""}|${fact.identity.watchmodeId || ""}|${fact.identity.imdbId || ""}|${fact.identity.tmdbId || ""}`;
    if (!unique.has(key)) unique.set(key, fact);
  }
  const bySource = new Map();
  for (const fact of unique.values()) {
    if (!bySource.has(fact.source)) bySource.set(fact.source, []);
    bySource.get(fact.source).push(fact);
  }
  const unambiguous = [...bySource.values()].flatMap((sourceFacts) => {
    /* Eine gemeinsame IMDb/TMDB-ID allein darf zwei verschiedene Titel-IDs
       derselben Quelle nicht willkürlich auflösen. Eine explizit passende
       Provider-ID hat den anderen Datensatz bereits oben als Konflikt entfernt. */
    const identities = new Set(sourceFacts.map((fact) => {
      const primary = fact.source === "watchmode"
        ? fact.identity.watchmodeId || fact.identity.flixpatrolId
        : fact.identity.flixpatrolId || fact.identity.watchmodeId;
      return primary || [
        fact.identity.imdbId ? `imdb:${fact.identity.imdbId}` : "",
        fact.identity.tmdbId ? `tmdb:${fact.identity.tmdbId}` : "",
      ].filter(Boolean).join("|");
    }).filter(Boolean));
    return identities.size > 1 ? [] : sourceFacts;
  });
  return unambiguous.sort((left, right) => {
    const priority = (fact) => fact.source === "watchmode" ? 0 : 1;
    return priority(left) - priority(right);
  });
}

function ownTerms(entry, fields) {
  const values = fields.flatMap((field) => list(entry?.[field]));
  return values.map((value) => text(typeof value === "object" ? value?.name : value, 240)).filter(Boolean);
}
function mergeNames(...groups) {
  const found = new Map();
  for (const value of groups.flat()) {
    const clean = text(value, 240);
    const key = clean.toLocaleLowerCase("de-AT");
    if (clean && !found.has(key)) found.set(key, clean);
  }
  return Object.freeze([...found.values()]);
}

/* Reine, flüchtige Consumerprojektion. Persönliche Felder und lokale Titel
   bleiben führend; neutrale Fakten füllen ausschließlich belegte Lücken. */
export function projectTitleFacts(entry, facts = []) {
  if (!entry || typeof entry !== "object") return entry;
  const matched = matchedFacts(entry, facts);
  if (!matched.length) return entry;
  const ownDescription = text(entry.beschreibung ?? entry.description, 4000) || null;
  const descriptionFact = matched.find((fact) => fact.description) || null;
  const runtimeFact = matched.find((fact) => fact.runtimeMinutes != null) || null;
  const projected = { ...entry };
  if (!ownDescription && descriptionFact) {
    if (Object.prototype.hasOwnProperty.call(entry, "titel") || !Object.prototype.hasOwnProperty.call(entry, "title")) {
      projected.beschreibung = descriptionFact.description;
    } else projected.description = descriptionFact.description;
  }
  if (projected.laufzeit_minuten == null && projected.runtimeMinutes == null && runtimeFact) {
    projected.laufzeit_minuten = runtimeFact.runtimeMinutes;
    projected.runtimeMinutes = runtimeFact.runtimeMinutes;
  }
  const genres = mergeNames(ownTerms(entry, ["genres", "genre", "g"]), matched.flatMap((fact) => fact.genres.map((term) => term.name)));
  if (genres.length) projected.genres = genres;
  const keywords = mergeNames(ownTerms(entry, ["keywords"]), matched.flatMap((fact) => fact.keywords.map((term) => term.name)));
  if (keywords.length) projected.keywords = keywords;
  const primary = descriptionFact || runtimeFact || matched[0];
  projected.titleFacts = primary;
  projected.titleFactsEvidence = Object.freeze(matched);
  projected.descriptionEvidence = ownDescription ? (entry.descriptionEvidence || null) : descriptionFact ? Object.freeze({
    source: descriptionFact.source,
    checkedAt: descriptionFact.checkedAt,
    fetchedAt: descriptionFact.fetchedAt,
    sourceUrl: descriptionFact.sourceUrl,
  }) : null;
  projected.chartEvidence = Object.freeze(matched.flatMap((fact) => fact.charts));
  const withIds = ergaenzeFehlendeExterneKennungen(projected, comparableProjection(primary));
  if (withIds.watchmode_id == null && primary.identity.watchmodeId) withIds.watchmode_id = primary.identity.watchmodeId;
  return Object.freeze(withIds);
}

export function formatTitleFactsDate(value) {
  const raw = text(value, 64);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(parsed));
}


/* Für große Kataloge wird der kleine Faktenbestand einmal indiziert. Pro Titel
   werden nur Kandidaten mit gemeinsamer starker ID oder demselben exakten
   Titel/Jahr/Typ geprüft. */
export function createTitleFactsProjector(facts = []) {
  const normalized = list(facts).map((value) => normalizeTitleFactsProjection(value, { allowLegacy: true })).filter(Boolean);
  const idIndex = new Map();
  const titleIndex = new Map();
  const add = (index, key, fact) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(fact);
  };
  for (const fact of normalized) {
    const comparable = comparableProjection(fact);
    for (const [namespace, id] of Object.entries(externeTitelKennungen(comparable))) {
      add(idIndex, `${namespace}:${id}`, fact);
    }
    const type = normalisiereExterneWerkart(comparable);
    const releaseYear = externesReferenzjahr(comparable);
    for (const title of [comparable.titel, comparable.originaltitel]) {
      const normalizedTitle = normalisiereExternenTitel(title);
      if (normalizedTitle && type && releaseYear != null) add(titleIndex, `${normalizedTitle}|${releaseYear}|${type}`, fact);
    }
  }
  return (entry) => {
    const comparable = comparableEntry(entry);
    const candidates = new Set();
    for (const [namespace, id] of Object.entries(externeTitelKennungen(comparable))) {
      for (const fact of idIndex.get(`${namespace}:${id}`) || []) candidates.add(fact);
    }
    const type = normalisiereExterneWerkart(comparable);
    const releaseYear = externesReferenzjahr(comparable);
    for (const title of [comparable.titel, comparable.title, comparable.originaltitel, comparable.originalTitle]) {
      const normalizedTitle = normalisiereExternenTitel(title);
      for (const fact of titleIndex.get(`${normalizedTitle}|${releaseYear}|${type}`) || []) candidates.add(fact);
    }
    return projectTitleFacts(entry, [...candidates]);
  };
}
