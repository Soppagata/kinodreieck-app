/* Reine UI-Projektionen für Entdecken (Phase 3).
   ---------------------------------------------------------------
   - Suchaktionen bleiben typisiert und benutzen getrennte Verträge
   - Empfehlungen lesen Profil/Mediathek nur und schreiben nie zurück
   - der lokale Ereignisbeleg entsteht ausschließlich aus Fixtures
   - kein Netzwerk, kein Provider, keine KI und keine Routine */

import {
  createSearchActionDraft,
  isStableContractId,
} from "./radarContracts.js";
import {
  applyLocalEvidenceDecision,
  createEmptyLocalEventLedger,
  stageLocalEventCandidate,
} from "./localEventRadar.js";
import { rankRecommendations } from "./recommendationRanking.js";
import { profileCompatibleGenres } from "./profileGenreVocabulary.js";
import {
  discoveryExternalIdsFromCatalog,
  matchWebDiscoveryFeed,
  MIXED_DISCOVERY_FEED_FORMAT,
  normalizeDiscoveryTitle,
  PUBLIC_DISCOVERY_FEED_FORMAT,
  VERSIONED_DISCOVERY_FEED_FORMAT,
  validateWebDiscoveryFeed,
} from "./webDiscoveryFeed.js";

const SERIEN_TYPEN = new Set(["serie", "series", "tv", "tv_series"]);
const PROFIL_ATTRIBUT_ARTEN = new Set([
  "genre", "tag", "thema", "erzaehlweise", "inszenierung", "tempo", "ton",
  "haltung", "regie", "epoche", "land", "kritikpunkt", "achse", "name", "person", "franchise",
]);
export const ENTDECKEN_PERSONAL_LIMIT = 6;
export const ENTDECKEN_TOP_POOL = 20;
export const ENTDECKEN_VISIBLE_LIMIT = 7;
export const ENTDECKEN_POPULAR_LIMIT = 6;

function text(value) { return String(value == null ? "" : value).trim(); }
function normalized(value) { return text(value).toLocaleLowerCase("de-AT"); }
function list(value) { return Array.isArray(value) ? value : []; }
function uniqueText(values) {
  const found = new Map();
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const clean = text(value);
    if (clean.length > 80) continue;
    const key = normalized(clean);
    if (clean && !found.has(key)) found.set(key, clean);
  }
  return [...found.values()];
}
function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
function stablePrefixedId(prefix, value) {
  const suffix = text(value);
  if (!suffix) return null;
  const id = `${prefix}:${suffix}`;
  return isStableContractId(id) ? id : null;
}

function selectedServiceSet(selectedServices) {
  return new Set(list(selectedServices).map(normalized).filter(Boolean));
}
function matchingServices(candidate, services) {
  return list(candidate?.services).filter((service) => services.has(normalized(service)));
}
function statusIsSeen(value) {
  if (typeof value === "string") return value === "gesehen";
  return !!value && typeof value === "object" && value.status === "gesehen";
}
function hasCompleteRating(item) {
  const axes = item?.bewertung ?? item?.axes;
  if (!axes || typeof axes !== "object") return false;
  return [axes.wie, axes.was, axes.warum]
    .every((value) => Number.isInteger(value) && value >= 0 && value <= 5);
}
function seenTargetIds(master, entdeckenStatus) {
  const ids = [];
  for (const item of list(master)) {
    const watchmodeId = positiveInteger(item?.watchmode_id);
    if (watchmodeId != null && (hasCompleteRating(item) || item?.gesehen === true || item?.status === "gesehen")) {
      ids.push(`watchmode:${watchmodeId}`);
    }
  }
  for (const [watchmodeId, status] of Object.entries(entdeckenStatus || {})) {
    const parsed = positiveInteger(watchmodeId);
    if (parsed != null && statusIsSeen(status)) ids.push(`watchmode:${parsed}`);
  }
  return uniqueText(ids);
}

function discoveryRecordIdsWithExcludedStrongId(webDiscoveryFeed, excludedTargetIds) {
  const checked = validateWebDiscoveryFeed(webDiscoveryFeed);
  if (!checked.ok) return new Set();
  const watchmodeIds = new Set([...excludedTargetIds]
    .filter((targetId) => targetId.startsWith("watchmode:"))
    .map((targetId) => targetId.slice("watchmode:".length)));
  if ([PUBLIC_DISCOVERY_FEED_FORMAT, MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT]
    .includes(checked.value.format)) return new Set();
  return new Set(checked.value.items
    .filter((record) => watchmodeIds.has(record.externalIds?.watchmode))
    .map((record) => record.recordId));
}

function structuredCatalogAttributes(entry) {
  const genres = [...list(entry?.genres), ...list(entry?.genre)];
  const tags = [...list(entry?.tags)];
  let franchiseId = text(entry?.franchise_id || entry?.franchiseId) || null;
  for (const raw of list(entry?.relevanz_signale)) {
    const core = text(raw).replace(/\([^)]*\)\s*$/, "");
    const splitAt = core.indexOf(":");
    if (splitAt < 1) continue;
    const kind = normalized(core.slice(0, splitAt));
    const value = text(core.slice(splitAt + 1));
    if (!value || !PROFIL_ATTRIBUT_ARTEN.has(kind)) continue;
    if (kind === "genre") genres.push(value);
    else if (kind === "franchise") franchiseId = value;
    else tags.push(value);
  }
  return { genres: uniqueText(genres), tags: uniqueText(tags), franchiseId };
}

export function radarTargetTypeForCatalogType(value) {
  return SERIEN_TYPEN.has(text(value).toLocaleLowerCase("de-AT")) ? "series" : "work";
}

/* Eine starke Watchmode-ID gewinnt. Ein bereits stabiler interner Katalogschlüssel
   ist der lokale Fallback; aus Titel/Jahr wird bewusst keine Identität geraten. */
export function createCatalogRadarTarget({
  watchmodeId = null, catalogId = null, catalogPrefix = "catalog", title, type,
} = {}) {
  const targetId = positiveInteger(watchmodeId) != null
    ? stablePrefixedId("watchmode", positiveInteger(watchmodeId))
    : stablePrefixedId(catalogPrefix, catalogId);
  const normalizedTitle = text(title);
  if (!targetId || !normalizedTitle) return null;
  return Object.freeze({
    targetId,
    targetType: radarTargetTypeForCatalogType(type),
    targetStatus: "active",
    title: normalizedTitle,
    canonical: true,
  });
}

export function createCatalogSearchActions(input = {}) {
  const target = createCatalogRadarTarget(input);
  if (!target) return Object.freeze({ target: null, watch: null, radar: null });
  const radarDraft = createSearchActionDraft({ intent: "radar", target });
  const watchmodeId = positiveInteger(input.watchmodeId);
  const watchDraft = createSearchActionDraft({ intent: "watch", target, watchmodeId });
  return Object.freeze({
    target,
    radar: radarDraft.ok ? Object.freeze({ ...radarDraft.action, target }) : null,
    watch: watchDraft.ok ? Object.freeze({ ...watchDraft.action, target }) : null,
  });
}

export function localRecommendationCandidates(streamingEntdecken, {
  streamingKnown = null, selectedServices = [], entdeckenStatus = {},
  includeSeenForMatching = false,
} = {}) {
  const region = streamingEntdecken?.region || streamingKnown?.region;
  if (region !== "AT") return Object.freeze([]);
  const sourceId = "local:streaming-catalog-at";
  const services = selectedServiceSet(selectedServices);
  const rows = new Map();
  for (const entry of [...list(streamingEntdecken?.titel), ...list(streamingKnown?.titel)]) {
    const watchmodeId = positiveInteger(entry?.watchmode_id);
    if (watchmodeId == null) continue;
    rows.set(watchmodeId, { ...(rows.get(watchmodeId) || {}), ...entry });
  }
  return Object.freeze([...rows.values()]
    .map((entry) => {
      const watchmodeId = positiveInteger(entry?.watchmode_id);
      if (watchmodeId == null || !text(entry?.titel)) return null;
      if (!includeSeenForMatching && statusIsSeen(entdeckenStatus?.[watchmodeId])) return null;
      const availableServices = list(entry.dienste);
      if (!availableServices.length) return null;
      if (services.size && !matchingServices({ services: availableServices }, services).length) return null;
      const attributes = structuredCatalogAttributes(entry);
      return Object.freeze({
        targetId: `watchmode:${watchmodeId}`,
        watchmodeId,
        title: text(entry.titel),
        matchStatus: "matched",
        region: "AT",
        availabilityConfirmed: true,
        eligible: true,
        genres: Object.freeze(attributes.genres),
        tags: Object.freeze(attributes.tags),
        franchiseId: attributes.franchiseId,
        freshnessAt: entry.available_from || streamingEntdecken?.stand || streamingKnown?.stand || null,
        sourceId,
        sourceRank: Number.isInteger(entry.rang) ? entry.rang : null,
        services: Object.freeze([...availableServices]),
        year: Number.isInteger(entry.jahr) ? entry.jahr : null,
        type: entry.typ || null,
        originalTitle: text(entry.originaltitel || entry.original_title) || null,
        externalIds: discoveryExternalIdsFromCatalog(entry),
        seenStatus: entdeckenStatus?.[watchmodeId] ?? null,
      });
    })
    .filter(Boolean));
}

export function localLibraryProjection(master) {
  return Object.freeze((Array.isArray(master) ? master : []).map((entry) => Object.freeze({
    ...entry,
    targetId: positiveInteger(entry?.watchmode_id) != null
      ? `watchmode:${positiveInteger(entry.watchmode_id)}`
      : stablePrefixedId("catalog", entry?.id),
    genres: Array.isArray(entry?.genre) ? entry.genre : Array.isArray(entry?.genres) ? entry.genres : [],
    franchiseId: text((entry?.franchise || [])[0] || entry?.franchiseId) || null,
  })));
}

export function rankLocalEntdeckenRecommendations({
  streamingEntdecken, streamingKnown = null, profile, master, useLibrary = true,
  selectedServices = [], entdeckenStatus = {},
} = {}) {
  return rankRecommendations(localRecommendationCandidates(streamingEntdecken, {
    streamingKnown, selectedServices, entdeckenStatus,
  }), {
    profile: profile && profile.beschaedigt !== true ? profile : {},
    library: localLibraryProjection(master),
    useLibrary,
    excludedTargetIds: seenTargetIds(master, entdeckenStatus),
  });
}


/* Sichtbare Mengenwahrheit des bereits lokal projizierten Katalogstands.
   `rohkatalog` kommt vor dem Mediathekabzug aus lib/katalog.js; die aktuelle
   Treffermenge entsteht dagegen aus der Entdecken-Liste und der Dienstewahl. */
export function createEntdeckenCatalogSummary({
  streamingEntdecken, selectedServices = [],
} = {}) {
  const rows = Array.isArray(streamingEntdecken?.titel) ? streamingEntdecken.titel : [];
  const services = selectedServiceSet(selectedServices);
  const currentCount = services.size
    ? rows.filter((entry) => matchingServices({ services: entry?.dienste || [] }, services).length > 0).length
    : rows.length;
  const reportedTotal = Number(streamingEntdecken?.katalogMengen?.rohkatalog);
  const catalogSize = Number.isInteger(reportedTotal) && reportedTotal >= rows.length
    ? reportedTotal : rows.length;
  return Object.freeze({
    catalogSize,
    currentCount,
    afterLibraryCount: rows.length,
    selectedServiceCount: services.size,
    coverage: streamingEntdecken?.katalogMengen?.umfang === "voll" ? "full" : "limited",
  });
}

function calendarDay(value) {
  const normalizedDay = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDay)) return null;
  const parsed = Date.parse(`${normalizedDay}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === normalizedDay
    ? normalizedDay : null;
}
function isoWeekForCalendarDay(value) {
  const day = calendarDay(value);
  if (!day) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const start = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date - start) / 86_400_000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function localCalendarDay(now = new Date()) {
  const value = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(value.getTime())) return null;
  const pad = (number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/* Der spätere Adapter darf einmal je ISO-Kalenderwoche entscheiden, ob er
   einen neuen Feed benötigt. Diese reine Funktion startet selbst weder Netz
   noch Timer und macht damit aus einem Reload keinen Hintergrund-Loop. */
export function shouldRefreshWebDiscovery(lastRefreshDay, today) {
  const current = isoWeekForCalendarDay(today);
  return !!current && isoWeekForCalendarDay(lastRefreshDay) !== current;
}

/* Der globale Feed kennt keine lokale Katalogliste. Das Matching geschieht
   deshalb erst hier: gemeinsame starke ID, sonst exakt Titel + Jahr + Typ.
   Mehrdeutige und fehlende Treffer bleiben leer. Ein Webfund darf Merkmale,
   aber niemals einen persoenlichen Score oder ein Nutzerurteil liefern. */
export function webDiscoveryCandidates({
  webDiscoveryFeed, catalogCandidates = [],
} = {}) {
  const unique = new Map();
  for (const decision of matchWebDiscoveryFeed(webDiscoveryFeed, catalogCandidates)) {
    if (decision.status !== "matched") continue;
    const { record, candidate: base } = decision;
    const existing = unique.get(base.targetId);
    if (existing && existing.sourceRank <= record.rank) continue;
    const evidence = record.evidence.map((entry) => Object.freeze({
      domain: entry.domain,
      url: entry.url,
      publishedOn: entry.publishedOn,
      retrievedOn: entry.retrievedOn,
      positiveRecommendation: entry.positiveRecommendation,
    }));
    unique.set(base.targetId, Object.freeze({
      ...base,
      genres: Object.freeze(uniqueText([...list(base.genres), ...list(record.attributes.genres)])),
      tags: Object.freeze(uniqueText([
        ...list(base.tags),
        ...list(record.attributes.tags),
        ...list(record.attributes.tones),
        ...list(record.attributes.themes),
      ])),
      sourceId: webDiscoveryFeed.sourceId,
      sourceRank: record.rank,
      externalDiscovery: true,
      externalEvidence: Object.freeze(evidence),
      discoveryRecordId: record.recordId,
    }));
  }
  return Object.freeze([...unique.values()].sort((left, right) => (
    left.sourceRank - right.sourceRank
    || left.targetId.localeCompare(right.targetId, "de-AT")
  )));
}

function sourceEvidence(item) {
  let domain = "";
  try { domain = new URL(item.sourceUrl).hostname.replace(/^www\./, ""); } catch { /* validierter Feed */ }
  return Object.freeze({
    sourceId: item.sourceId || "chart:joyn-at",
    sourceLabel: item.sourceLabel || "Joyn Österreich",
    domain: domain || "joyn.at",
    url: item.sourceUrl,
    retrievedOn: item.popularity?.measuredOn || item.listDate,
    market: item.availability?.market || "streaming",
    service: item.availability?.service ?? "Joyn",
  });
}
function strongIds(entry) {
  const external = entry?.externalIds || {};
  return Object.freeze({
    joyn: text(entry?.sourceItemId ?? entry?.joyn_id ?? entry?.joynId) || null,
    qid: text(entry?.qid ?? entry?.wikidata?.qid ?? external.qid) || null,
    imdb: text(external.imdb ?? entry?.imdb_id ?? entry?.imdbId).toLowerCase() || null,
    tmdb: text(external.tmdb ?? entry?.tmdb_id ?? entry?.tmdbId) || null,
  });
}
function sourceItemSeen(item, master, catalogCandidates, annotation = item?.wikidata) {
  const itemIds = strongIds({ ...item, externalIds: annotation?.externalIds || {} });
  const itemType = radarTargetTypeForCatalogType(item?.mediaType ?? item?.type) === "series" ? "series" : "film";
  const itemTitle = normalizeDiscoveryTitle(item?.title);
  const seenEntries = [
    ...list(master).filter((entry) => (
      hasCompleteRating(entry) || entry?.gesehen === true || entry?.status === "gesehen"
    )),
    ...list(catalogCandidates).filter((entry) => statusIsSeen(entry?.seenStatus)),
  ];
  return seenEntries.some((entry) => {
    const entryIds = strongIds(entry);
    const comparable = ["joyn", "qid", "imdb", "tmdb"].filter((namespace) => (
      itemIds[namespace] && entryIds[namespace]
    ));
    if (comparable.length) {
      return comparable.every((namespace) => itemIds[namespace] === entryIds[namespace]);
    }
    const entryType = radarTargetTypeForCatalogType(entry?.typ ?? entry?.type) === "series" ? "series" : "film";
    const itemYear = Number(annotation?.releaseYear ?? item?.year);
    const entryYear = Number(entry?.jahr ?? entry?.year);
    if (entryType !== itemType || !itemTitle || !Number.isInteger(itemYear)
        || !Number.isInteger(entryYear) || itemYear !== entryYear) return false;
    return [entry?.titel, entry?.title, entry?.originaltitel, entry?.originalTitle]
      .map(normalizeDiscoveryTitle).filter(Boolean).includes(itemTitle);
  });
}

/* Der Quellenpool belegt Quellenschluessel, Typ, Popularitaet und Marktstatus.
   Wikidata beziehungsweise ein eindeutiger lokaler ID-/Titel-Jahr-Typ-Match
   duerfen Metadaten ergaenzen. Quellenrang bleibt niemals Passungsgrund. */
export function publicDiscoveryCandidates({
  webDiscoveryFeed, master = [], catalogCandidates = [], selectedServices = [],
  includeSeen = false, requireMetadata = true,
} = {}) {
  const checked = validateWebDiscoveryFeed(webDiscoveryFeed);
  if (!checked.ok || ![
    PUBLIC_DISCOVERY_FEED_FORMAT, MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT,
  ]
    .includes(checked.value.format)) return Object.freeze([]);
  const mixed = [MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT]
    .includes(checked.value.format);
  const services = selectedServiceSet(selectedServices);
  if (!mixed && services.size && !services.has("joyn")) return Object.freeze([]);
  const annotations = new Map((checked.value.annotations || []).map((entry) => [entry.sourceItemId, entry]));
  const decisions = new Map(matchWebDiscoveryFeed(checked.value, catalogCandidates)
    .map((decision) => [decision.record.sourceItemId, decision]));
  const projected = checked.value.items.map((item) => {
    const facts = checked.value.format === VERSIONED_DISCOVERY_FEED_FORMAT ? Object.freeze({
      qid: null, releaseYear: item.releaseYear, externalIds: item.externalIds,
    }) : annotations.get(item.sourceItemId);
    const local = decisions.get(item.sourceItemId)?.status === "matched"
      ? decisions.get(item.sourceItemId).candidate : null;
    const genres = profileCompatibleGenres(uniqueText([...item.genres, ...list(local?.genres)]));
    const tags = uniqueText(list(local?.tags));
    const franchiseId = local?.franchiseId || null;
    const seen = sourceItemSeen(item, master, catalogCandidates, facts);
    const availability = mixed ? item.availability : Object.freeze({
      region: "AT", market: "streaming", service: "Joyn", licenseTypes: [...item.licenseTypes],
    });
    return Object.freeze({
      targetId: local?.targetId || `${mixed ? "market" : "joyn"}:${item.sourceItemId}`,
      watchmodeId: local?.watchmodeId ?? null,
      sourceItemId: item.sourceItemId,
      title: item.title,
      matchStatus: "matched",
      region: "AT",
      availabilityConfirmed: true,
      eligible: true,
      genres: Object.freeze(genres),
      tags: Object.freeze(tags),
      franchiseId,
      freshnessAt: item.fetchedAt,
      sourceId: item.sourceId || webDiscoveryFeed.sourceId,
      sourceLabel: item.sourceLabel || "Joyn Österreich",
      sourceRank: null,
      sourcePosition: item.popularity?.rank ?? item.sourcePosition,
      services: Object.freeze(availability.service ? [availability.service] : []),
      availability: Object.freeze({ ...availability, licenseTypes: Object.freeze([...availability.licenseTypes]) }),
      popularity: Object.freeze({ ...(item.popularity || {
        metric: "source-chart-rank", rank: item.sourcePosition, measuredOn: item.listDate, value: null,
      }) }),
      year: facts?.releaseYear ?? local?.year ?? null,
      type: item.mediaType,
      externalIds: Object.freeze({ ...(facts?.externalIds || {}) }),
      externalDiscovery: true,
      externalEvidence: Object.freeze([sourceEvidence(item)]),
      discoveryRecordId: `${mixed ? "market" : "joyn"}:${item.sourceItemId}`,
      wikidata: facts || null,
      metadataReady: genres.length > 0 || tags.length > 0 || !!franchiseId,
      seen,
    });
  }).filter((candidate) => (includeSeen || !candidate.seen)
    && (!requireMetadata || candidate.metadataReady));
  return Object.freeze([...new Map(projected.map((candidate) => [candidate.targetId, candidate])).values()]);
}

function discoveryEvidence(record) {
  return Object.freeze(record.evidence.map((entry) => Object.freeze({
    domain: entry.domain,
    url: entry.url,
    publishedOn: entry.publishedOn,
    retrievedOn: entry.retrievedOn,
    positiveRecommendation: entry.positiveRecommendation,
  })));
}

/* Alle weiteren Karten bleiben eine direkte Projektion des validierten
   Wochenfeeds. Ein sicherer lokaler Match reichert die Karte mit
   Verfuegbarkeit und bestehenden Aktionen an; unklare Matches bleiben reine
   Webtipps und loesen keinerlei Pin-/Persistenzaktion aus. */
export function webDiscoveryFeedCards({ webDiscoveryFeed, catalogCandidates = [] } = {}) {
  const checked = validateWebDiscoveryFeed(webDiscoveryFeed);
  if (!checked.ok) return Object.freeze([]);
  if ([PUBLIC_DISCOVERY_FEED_FORMAT, MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT]
    .includes(checked.value.format)) {
    const mixed = [MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT]
      .includes(checked.value.format);
    const annotations = new Map((checked.value.annotations || []).map((entry) => [entry.sourceItemId, entry]));
    const decisions = new Map(matchWebDiscoveryFeed(checked.value, catalogCandidates)
      .map((decision) => [decision.record.sourceItemId, decision]));
    const projected = checked.value.items.map((item) => {
      const facts = checked.value.format === VERSIONED_DISCOVERY_FEED_FORMAT ? Object.freeze({
        qid: null, releaseYear: item.releaseYear, externalIds: item.externalIds,
      }) : annotations.get(item.sourceItemId);
      const local = decisions.get(item.sourceItemId)?.status === "matched"
        ? decisions.get(item.sourceItemId).candidate : null;
      const availability = mixed ? item.availability : Object.freeze({
        region: "AT", market: "streaming", service: "Joyn", licenseTypes: [...item.licenseTypes],
      });
      return Object.freeze({
        targetId: local?.targetId || `${mixed ? "market" : "joyn"}:${item.sourceItemId}`,
        watchmodeId: local?.watchmodeId ?? null,
        sourceItemId: item.sourceItemId,
        discoveryRecordId: `${mixed ? "market" : "joyn"}:${item.sourceItemId}`,
        title: item.title,
        year: facts?.releaseYear ?? local?.year ?? null,
        type: item.mediaType,
        services: Object.freeze(availability.service ? [availability.service] : []),
        sourceId: item.sourceId || checked.value.sourceId,
        sourceLabel: item.sourceLabel || "Joyn Österreich",
        sourceRank: null,
        sourcePosition: item.popularity?.rank ?? item.sourcePosition,
        availability: Object.freeze({ ...availability, licenseTypes: Object.freeze([...availability.licenseTypes]) }),
        popularity: Object.freeze({ ...(item.popularity || {
          metric: "source-chart-rank", rank: item.sourcePosition, measuredOn: item.listDate, value: null,
        }) }),
        externalEvidence: Object.freeze([sourceEvidence(item)]),
        matchStatus: "source-confirmed",
        genres: Object.freeze(uniqueText([...item.genres, ...list(local?.genres)])),
        tags: Object.freeze(uniqueText(list(local?.tags))),
        licenseTypes: Object.freeze([...availability.licenseTypes]),
        externalIds: Object.freeze({ ...(facts?.externalIds || {}) }),
        wikidata: facts || null,
      });
    });
    return Object.freeze([...new Map(projected.map((candidate) => [candidate.targetId, candidate])).values()]);
  }
  return Object.freeze(matchWebDiscoveryFeed(checked.value, catalogCandidates).map((decision) => {
    const { record } = decision;
    const evidence = discoveryEvidence(record);
    if (decision.status !== "matched") {
      return Object.freeze({
        targetId: record.recordId,
        discoveryRecordId: record.recordId,
        title: record.title,
        year: record.releaseYear,
        type: record.mediaType,
        services: Object.freeze([]),
        sourceRank: record.rank,
        externalEvidence: evidence,
        matchStatus: decision.status,
      });
    }
    const candidate = decision.candidate;
    return Object.freeze({
      targetId: candidate.targetId,
      discoveryRecordId: record.recordId,
      watchmodeId: candidate.watchmodeId,
      title: candidate.title,
      year: candidate.year,
      type: candidate.type,
      services: candidate.services,
      sourceRank: record.rank,
      externalEvidence: evidence,
      matchStatus: "matched",
    });
  }));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function popularityGroup(entry) {
  if (entry?.availability?.market === "cinema") return "cinema";
  return radarTargetTypeForCatalogType(entry?.type) === "series"
    ? "streaming-series" : "streaming-film";
}

/* Die sichtbare Popularitaetslane mischt die drei belegten Teilmaerkte
   deterministisch. Derselbe Pool am selben Kalendertag bleibt identisch;
   ein neuer Tag darf die Auswahl aendern, ohne Quellenrang in persoenliche
   Passung umzudeuten. */
export function selectStablePopularCards(rows, {
  webDiscoveryFeed = null, selectionDay = null, limit = ENTDECKEN_POPULAR_LIMIT,
} = {}) {
  const safeLimit = Math.max(0, Math.min(list(rows).length, Number(limit) || 0));
  const day = calendarDay(selectionDay) || calendarDay(webDiscoveryFeed?.refreshedOn);
  const poolIdentity = list(webDiscoveryFeed?.items).map((item) => item?.sourceItemId).filter(Boolean).join("|");
  const seed = `${webDiscoveryFeed?.feedId || "feed"}|${webDiscoveryFeed?.refreshedOn || "day"}|${day || "stable"}|${poolIdentity}`;
  const groups = new Map();
  for (const row of list(rows)) {
    const key = popularityGroup(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const preferred = ["cinema", "streaming-film", "streaming-series"].filter((key) => groups.has(key));
  for (const key of preferred) {
    groups.get(key).sort((left, right) => (
      stableHash(`${seed}|${key}|${left.targetId}`) - stableHash(`${seed}|${key}|${right.targetId}`)
      || left.targetId.localeCompare(right.targetId, "de-AT")
    ));
  }
  if (!preferred.length) return Object.freeze([]);
  const start = stableHash(`${seed}|group-start`) % preferred.length;
  const order = [...preferred.slice(start), ...preferred.slice(0, start)];
  const selected = [];
  for (let index = 0; selected.length < safeLimit; index += 1) {
    let added = false;
    for (const key of order) {
      const row = groups.get(key)?.[index];
      if (!row) continue;
      selected.push(Object.freeze({ ...row }));
      added = true;
      if (selected.length === safeLimit) break;
    }
    if (!added) break;
  }
  return Object.freeze(selected);
}

/* Die tägliche Abwechslung wählt stabil aus höchstens zwanzig bereits
   gerankten Treffern. Nach der Auswahl wird wieder nach Passungsrang sortiert:
   Zufall entscheidet nur, welche Titel heute vorkommen, nie über ihre Aussage. */
export function selectDailyRecommendations(rows, {
  dailyVariety = false, selectionDay = null,
  limit = ENTDECKEN_PERSONAL_LIMIT, poolLimit = ENTDECKEN_TOP_POOL,
} = {}) {
  const safeLimit = Math.max(0, Math.min(ENTDECKEN_PERSONAL_LIMIT, Number(limit) || 0));
  const ranked = list(rows).slice(0, Math.max(safeLimit, Math.min(ENTDECKEN_TOP_POOL, Number(poolLimit) || 0)));
  if (!dailyVariety || !calendarDay(selectionDay) || ranked.length <= safeLimit) {
    return Object.freeze(ranked.slice(0, safeLimit));
  }
  const rankById = new Map(ranked.map((entry, index) => [entry.targetId, index]));
  const selected = [...ranked]
    .sort((left, right) => (
      stableHash(`${selectionDay}|${left.targetId}`) - stableHash(`${selectionDay}|${right.targetId}`)
      || left.targetId.localeCompare(right.targetId, "de-AT")
    ))
    .slice(0, safeLimit)
    .sort((left, right) => rankById.get(left.targetId) - rankById.get(right.targetId));
  return Object.freeze(selected);
}

export function createEntdeckenRecommendations({
  streamingEntdecken, streamingKnown = null, profile, master, useLibrary = true,
  selectedServices = [], entdeckenStatus = {}, webDiscoveryFeed = null,
  dailyVariety = false, selectionDay = null,
} = {}) {
  const excludedTargetIds = seenTargetIds(master, entdeckenStatus);
  const excluded = new Set(excludedTargetIds);
  const excludedDiscoveryRecordIds = discoveryRecordIdsWithExcludedStrongId(
    webDiscoveryFeed,
    excludedTargetIds,
  );
  const catalogCandidates = localRecommendationCandidates(streamingEntdecken, {
    streamingKnown, selectedServices, entdeckenStatus, includeSeenForMatching: true,
  });
  const checkedFeed = validateWebDiscoveryFeed(webDiscoveryFeed);
  if (checkedFeed.ok && [
    PUBLIC_DISCOVERY_FEED_FORMAT, MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT,
  ]
    .includes(checkedFeed.value.format)) {
    /* Fuer den marktuebergreifenden Feed ist die lokale Streaming-Dienstewahl
       kein Quellenfilter. Sie beschreibt Verfuegbarkeit, nicht Geschmack. */
    const broadCatalog = [MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT]
      .includes(checkedFeed.value.format)
      ? localRecommendationCandidates(streamingEntdecken, {
        streamingKnown, selectedServices: [], entdeckenStatus, includeSeenForMatching: true,
      }) : catalogCandidates;
    const allDirect = publicDiscoveryCandidates({
      webDiscoveryFeed: checkedFeed.value, master, catalogCandidates: broadCatalog, selectedServices,
      includeSeen: true, requireMetadata: false,
    });
    const withMetadata = allDirect.filter((candidate) => candidate.metadataReady);
    const direct = withMetadata.filter((candidate) => !candidate.seen);
    const ranked = profile?.beschaedigt === true ? [] : rankRecommendations(direct, {
      profile: profile && profile.beschaedigt !== true ? profile : {},
      library: localLibraryProjection(master), useLibrary, excludedTargetIds: [],
    });
    const mixed = [MIXED_DISCOVERY_FEED_FORMAT, VERSIONED_DISCOVERY_FEED_FORMAT]
      .includes(checkedFeed.value.format);
    const personal = selectDailyRecommendations(ranked, {
      /* Persoenliche Auswahl bleibt im neuen Pfad immer bestes, stabiles
         Profilranking. Tagesmischung gehoert allein zur Popularitaetslane. */
      dailyVariety: mixed ? false : dailyVariety,
      selectionDay,
    });
    const popularPool = webDiscoveryFeedCards({
      webDiscoveryFeed: checkedFeed.value, catalogCandidates: broadCatalog,
    });
    const orderedPopularPool = mixed
      ? selectStablePopularCards(popularPool, {
        webDiscoveryFeed: checkedFeed.value, selectionDay, limit: popularPool.length,
      }) : null;
    const popular = mixed
      ? Object.freeze(orderedPopularPool.slice(0, ENTDECKEN_POPULAR_LIMIT))
      /* Format 5 bleibt fuer die unveraenderte persoenliche Matchingstrecke
         lesbar, ist nach E4 aber keine sichtbare Popularitaetsquelle mehr. */
      : Object.freeze([]);
    const diagnostics = Object.freeze({
      candidates: allDirect.length,
      metadata: withMetadata.length,
      afterExclusions: direct.length,
      profileMatches: ranked.length,
      visible: personal.length,
      duplicatesRemoved: checkedFeed.value.items.length - allDirect.length,
    });
    return Object.freeze({
      personal,
      popular,
      ...(mixed ? { popularPool: orderedPopularPool } : {}),
      diagnostics,
      /* Uebergangskompatibilitaet fuer alte lokale Aufrufer; die UI verwendet
         nur noch den fachlich benannten separaten Popularitaetspfad. */
      further: popular,
    });
  }
  const external = webDiscoveryCandidates({ webDiscoveryFeed, catalogCandidates });
  /* Beide sichtbaren Listen stammen aus genau demselben belegten Webfeed.
     Der lokale Katalog bestaetigt nur Identitaet und AT-Verfuegbarkeit; er
     darf keine zusaetzlichen Titel in "Fuer mich" einschleusen. */
  const ranked = profile?.beschaedigt === true ? [] : rankRecommendations(external, {
    profile: profile && profile.beschaedigt !== true ? profile : {},
    library: localLibraryProjection(master),
    useLibrary,
    excludedTargetIds,
  });
  const personal = selectDailyRecommendations(ranked, { dailyVariety, selectionDay });
  const personalIds = new Set(personal.map((entry) => entry.targetId));
  const seenFurther = new Set();
  const remaining = webDiscoveryFeedCards({ webDiscoveryFeed, catalogCandidates }).filter((candidate) => {
    if (excludedDiscoveryRecordIds.has(candidate.discoveryRecordId)) return false;
    if (candidate.matchStatus === "matched" && excluded.has(candidate.targetId)) return false;
    if (candidate.matchStatus === "matched" && personalIds.has(candidate.targetId)) return false;
    const identity = candidate.matchStatus === "matched" ? candidate.targetId
      : `${normalized(candidate.title)}|${candidate.year}|${normalized(candidate.type)}`;
    if (seenFurther.has(identity)) return false;
    seenFurther.add(identity);
    return true;
  });
  /* Insgesamt bleiben hoechstens sieben eindeutige Webtreffer sichtbar.
     Fuer mich bekommt nur lokal begruendete Passungen; alle uebrigen Plaetze
     folgen ohne erfundene Fueller der Quellenreihenfolge. */
  const further = remaining
    .slice(0, Math.max(0, ENTDECKEN_VISIBLE_LIMIT - personal.length))
    .map((candidate) => Object.freeze({
      targetId: candidate.targetId,
      watchmodeId: candidate.watchmodeId,
      title: candidate.title,
      year: candidate.year,
      type: candidate.type,
      services: candidate.services,
      sourceRank: candidate.sourceRank,
      sourcePosition: candidate.sourcePosition,
      externalEvidence: candidate.externalEvidence,
      matchStatus: candidate.matchStatus,
      discoveryRecordId: candidate.discoveryRecordId,
    }));
  return Object.freeze({
    personal,
    popular: Object.freeze(further),
    further: Object.freeze(further),
  });
}

export function createFixtureRadarLedger(fixtures) {
  const proposal = fixtures?.radarProposal;
  const item = proposal?.items?.[0];
  const target = fixtures?.catalog?.find((entry) => entry.targetId === item?.targetId);
  if (!item || !target) return createEmptyLocalEventLedger();
  const staged = stageLocalEventCandidate(createEmptyLocalEventLedger(), {
    target,
    eventType: item.eventType,
    date: item.eventDate,
    region: item.region,
    platform: item.platform,
    versionId: item.eventVersionId,
    lifecycleStatus: item.lifecycleStatus,
  });
  if (!staged.ok) return createEmptyLocalEventLedger();
  const registry = new Map((fixtures.sourceRegistry || []).map((source) => [source.sourceId, source]));
  const evidenceIds = (item.evidence || []).map((entry) => entry.evidenceId);
  const families = [...new Set((item.evidence || [])
    .map((entry) => registry.get(entry.sourceId)?.publisherFamily)
    .filter(Boolean))];
  const confirmed = applyLocalEvidenceDecision(staged.ledger, {
    eventId: staged.eventId,
    versionId: staged.versionId,
    verificationStatus: "confirmed",
    evidenceIds,
    independentSourceFamilies: families,
  });
  return confirmed.ok ? confirmed.ledger : staged.ledger;
}

export function localRadarTargetLabel(targetOrId, {
  master = [], streamingKnown = null, streamingDiscover = null, fixtures = null, title = null,
} = {}) {
  if (typeof targetOrId === "object" && targetOrId?.targetType === "text"
      && typeof targetOrId.targetText === "string" && targetOrId.targetText.trim()) {
    return targetOrId.targetText;
  }
  const entryTitle = text(typeof targetOrId === "object" ? targetOrId?.title : title);
  if (entryTitle && !/^(?:work|watchmode|fixture|catalog|tmdb|imdb|wikidata):/i.test(entryTitle)) return entryTitle;
  const normalized = text(typeof targetOrId === "object" ? targetOrId?.targetId : targetOrId);
  const fixture = fixtures?.catalog?.find((entry) => entry.targetId === normalized);
  if (fixture?.title) return fixture.title;
  if (normalized.startsWith("watchmode:")) {
    const watchmodeId = normalized.slice("watchmode:".length);
    const catalogs = [
      ...(streamingKnown?.titel || []),
      ...(streamingDiscover?.titel || []),
    ];
    const found = catalogs.find((entry) => String(entry.watchmode_id) === watchmodeId);
    if (found?.titel) return found.titel;
  }
  if (normalized.startsWith("catalog:")) {
    const id = normalized.slice("catalog:".length);
    const found = (master || []).find((entry) => String(entry.id) === id);
    if (found?.titel) return found.titel;
  }
  return "Radarziel";
}
