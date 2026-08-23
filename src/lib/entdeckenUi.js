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
import {
  discoveryExternalIdsFromCatalog,
  matchWebDiscoveryFeed,
} from "./webDiscoveryFeed.js";

const SERIEN_TYPEN = new Set(["serie", "series", "tv", "tv_series"]);
const PROFIL_ATTRIBUT_ARTEN = new Set([
  "genre", "tag", "thema", "erzaehlweise", "inszenierung", "tempo", "ton",
  "haltung", "regie", "epoche", "land", "kritikpunkt", "achse", "name", "person", "franchise",
]);
export const ENTDECKEN_PERSONAL_LIMIT = 6;
export const ENTDECKEN_TOP_POOL = 20;
export const ENTDECKEN_VISIBLE_LIMIT = 7;

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
      if (statusIsSeen(entdeckenStatus?.[watchmodeId])) return null;
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

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
  const catalogCandidates = localRecommendationCandidates(streamingEntdecken, {
    streamingKnown, selectedServices, entdeckenStatus,
  }).filter((candidate) => !excluded.has(candidate.targetId));
  const external = webDiscoveryCandidates({ webDiscoveryFeed, catalogCandidates });
  /* Beide sichtbaren Listen stammen aus genau demselben belegten Webfeed.
     Der lokale Katalog bestaetigt nur Identitaet und AT-Verfuegbarkeit; er
     darf keine zusaetzlichen Titel in "Fuer mich" einschleusen. */
  const ranked = rankRecommendations(external, {
    profile: profile && profile.beschaedigt !== true ? profile : {},
    library: localLibraryProjection(master),
    useLibrary,
    excludedTargetIds,
  });
  const personal = selectDailyRecommendations(ranked, { dailyVariety, selectionDay });
  const personalIds = new Set(personal.map((entry) => entry.targetId));
  const remaining = external.filter((candidate) => !personalIds.has(candidate.targetId));
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
      externalEvidence: candidate.externalEvidence,
    }));
  return Object.freeze({ personal, further: Object.freeze(further) });
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
