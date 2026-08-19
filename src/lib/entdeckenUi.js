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
import {
  createRecommendationFunnel,
  rankNeutralCandidates,
  rankRecommendations,
} from "./recommendationRanking.js";

const SERIEN_TYPEN = new Set(["serie", "series", "tv", "tv_series"]);

function text(value) { return String(value == null ? "" : value).trim(); }
function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
function finiteNumber(value) {
  if (value == null || text(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function stablePrefixedId(prefix, value) {
  const suffix = text(value);
  if (!suffix) return null;
  const id = `${prefix}:${suffix}`;
  return isStableContractId(id) ? id : null;
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

export function localRecommendationCandidates(streamingEntdecken) {
  if (streamingEntdecken?.region !== "AT") return Object.freeze([]);
  const sourceId = "local:streaming-catalog-at";
  return Object.freeze((Array.isArray(streamingEntdecken?.titel) ? streamingEntdecken.titel : [])
    .map((entry) => {
      const watchmodeId = positiveInteger(entry?.watchmode_id);
      if (watchmodeId == null || !text(entry?.titel)) return null;
      return Object.freeze({
        targetId: `watchmode:${watchmodeId}`,
        watchmodeId,
        title: text(entry.titel),
        matchStatus: "matched",
        region: "AT",
        availabilityConfirmed: Array.isArray(entry.dienste) && entry.dienste.length > 0,
        eligible: true,
        genres: Array.isArray(entry.genres) ? entry.genres : [],
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        franchiseId: text(entry.franchise_id || entry.franchiseId) || null,
        freshnessAt: entry.available_from || entry.verfuegbar_ab
          || streamingEntdecken.katalog_stand || streamingEntdecken.stand || null,
        quality: finiteNumber(entry.user_score) ?? finiteNumber(entry.relevanz),
        sourceId,
        sourceRank: Number.isInteger(entry.rang) ? entry.rang
          : Number.isInteger(entry.source_rank) ? entry.source_rank : null,
        services: Array.isArray(entry.dienste) ? [...entry.dienste] : [],
        year: Number.isInteger(entry.jahr) ? entry.jahr : null,
        type: entry.typ || null,
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

function localMustWatchTargetIds(mustwatch) {
  return (Array.isArray(mustwatch) ? mustwatch : [])
    .filter((entry) => entry?.verknuepfung?.ziel === "streaming")
    .map((entry) => positiveInteger(entry.verknuepfung.id))
    .filter((id) => id != null)
    .map((id) => `watchmode:${id}`);
}

function localRecommendationContext({
  profile, master, mustwatch, useLibrary = true, selectedServices,
} = {}) {
  const context = {
    profile: profile && profile.beschaedigt !== true ? profile : {},
    library: localLibraryProjection(master),
    excludedTargetIds: localMustWatchTargetIds(mustwatch),
    useLibrary,
  };
  if (Array.isArray(selectedServices)) context.selectedServices = selectedServices;
  return context;
}

export function rankLocalEntdeckenRecommendations({
  streamingEntdecken, profile, master, mustwatch, useLibrary = true, selectedServices,
} = {}) {
  return rankRecommendations(
    localRecommendationCandidates(streamingEntdecken),
    localRecommendationContext({ profile, master, mustwatch, useLibrary, selectedServices }),
  );
}

export function createEntdeckenRecommendationFunnel({
  streamingEntdecken, profile, master, mustwatch, useLibrary = true, selectedServices,
} = {}) {
  return createRecommendationFunnel(
    localRecommendationCandidates(streamingEntdecken),
    localRecommendationContext({ profile, master, mustwatch, useLibrary, selectedServices }),
  );
}

function normalized(value) { return text(value).toLocaleLowerCase("de-AT"); }
function selectedServiceSet(selectedServices) {
  return new Set((Array.isArray(selectedServices) ? selectedServices : [])
    .map(normalized).filter(Boolean));
}
function matchingServices(candidate, services) {
  return (candidate.services || []).filter((service) => services.has(normalized(service)));
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

/* Neutrale Ergänzungen verwenden positive Profil- oder Bewertungsbelege nie
   als Passung oder Rang. Sie respektieren aber dieselben harten Ausschlüsse,
   füllen nur die freien Plätze bis sechs und bleiben stabil sortiert. */
export function createAdditionalServiceDiscoveries({
  streamingEntdecken, selectedServices = [], personalRecommendations = [], master = [],
  mustwatch = [], profile = null,
} = {}) {
  const openSlots = Math.max(0, 6 - (Array.isArray(personalRecommendations) ? personalRecommendations.length : 0));
  const services = selectedServiceSet(selectedServices);
  if (!openSlots || !services.size) return Object.freeze([]);
  const personalIds = (Array.isArray(personalRecommendations) ? personalRecommendations : [])
    .map((entry) => text(entry?.targetId)).filter(Boolean);
  const context = localRecommendationContext({
    profile, master, mustwatch, useLibrary: false, selectedServices,
  });
  context.excludedTargetIds = [...context.excludedTargetIds, ...personalIds];
  return Object.freeze(rankNeutralCandidates(localRecommendationCandidates(streamingEntdecken), context)
    .slice(0, openSlots)
    .map((candidate) => Object.freeze({
      targetId: candidate.targetId,
      watchmodeId: candidate.watchmodeId,
      title: candidate.title,
      year: candidate.year,
      type: candidate.type,
      services: Object.freeze(matchingServices(candidate, services)
        .sort((a, b) => a.localeCompare(b, "de-AT"))),
    })));
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
