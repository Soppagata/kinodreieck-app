/* Deterministisches Empfehlungsranking. Keine KI, kein Netzwerk, kein Profil-
   oder Telemetrie-Write. Das Ergebnis ist eine flüchtige Projektion. */

function text(value) { return String(value == null ? "" : value).trim(); }
function normalized(value) { return text(value).toLocaleLowerCase("de-AT"); }
function list(value) { return Array.isArray(value) ? value : []; }
function values(value) { return value instanceof Set ? [...value] : list(value); }
function stringSet(value) { return new Set(list(value).map(normalized).filter(Boolean)); }
function overlap(a, b) {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

export function isPositiveLibraryEvidence(item) {
  /* Die bestehende Mediathek speichert die drei Werte unter `bewertung`.
     `axes` bleibt als bereits normalisierte reine Contractform zulässig. */
  const axes = item?.bewertung ?? item?.axes;
  if (!axes || typeof axes !== "object") return false;
  const values = [axes.wie, axes.was, axes.warum];
  return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 5)
    && values.reduce((sum, value) => sum + value, 0) >= 10;
}

function confirmedSignals(profile, direction) {
  /* `signale` ist der bestätigte Bestand des heutigen Profils; `offen` wird
     niemals gelesen. `signals` ist nur die normalisierte Fixtureform. */
  const stored = Array.isArray(profile?.signale) ? profile.signale : null;
  const signals = stored ?? list(profile?.signals);
  return signals.filter((signal) => {
    const actualDirection = signal.richtung ?? signal.direction;
    const isConfirmed = stored ? true : signal?.confirmed === true;
    return isConfirmed
      && (actualDirection === direction
        || (direction === "positive" && actualDirection === "zieht_an")
        || (direction === "negative" && actualDirection === "stoesst_ab"))
      && text(signal.wert ?? signal.value);
  });
}

function signalMatches(signal, candidate) {
  const value = normalized(signal.wert ?? signal.value);
  const kind = signal.art ?? signal.kind;
  if (!value) return false;
  if (kind === "franchise") return normalized(candidate.franchiseId) === value;
  if (kind === "genre") return stringSet(candidate.genres).has(value);
  return stringSet(candidate.tags).has(value);
}

function libraryMatchCount(candidate, library) {
  const candidateGenres = stringSet(candidate.genres);
  const franchise = normalized(candidate.franchiseId);
  return list(library).filter((item) => {
    if (!isPositiveLibraryEvidence(item)) return false;
    if (franchise && normalized(item.franchiseId) === franchise) return true;
    return overlap(candidateGenres, stringSet(item.genres ?? item.genre));
  }).length;
}

function franchiseDensity(candidate, library) {
  const franchise = normalized(candidate.franchiseId);
  if (!franchise) return 0;
  const count = list(library).filter((item) => normalized(item.franchiseId) === franchise).length;
  return count >= 3 ? count : 0;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function analyze(candidate, context) {
  const profile = context.profile || {};
  const library = context.useLibrary === false ? [] : list(context.library);
  const positives = confirmedSignals(profile, "positive").filter((signal) => signalMatches(signal, candidate));
  const negatives = confirmedSignals(profile, "negative").filter((signal) => signalMatches(signal, candidate));
  const blockingNegative = negatives.some((signal) => signal.blocking === true);
  const ratedMatches = libraryMatchCount(candidate, library);
  const density = franchiseDensity(candidate, library);
  const positiveStrength = positives.reduce((sum, signal) => (
    sum + Math.max(0, Number(signal.staerke ?? signal.strength) || 0)
  ), 0);

  const reasons = [];
  for (const signal of positives.slice(0, 1)) {
    reasons.push(`Profil: ${text(signal.label || signal.wert || signal.value)}`);
  }
  if (ratedMatches > 0) reasons.push(`${ratedMatches} positiv bewertete Mediathek-${ratedMatches === 1 ? "Passung" : "Passungen"}`);
  if (density >= 3) reasons.push("Mehrere Titel dieser Reihe in deiner Mediathek");

  return {
    blockingNegative,
    negativeCount: negatives.length,
    positiveStrength,
    positiveCount: positives.length,
    ratedMatches,
    density,
    freshness: timestamp(candidate.freshnessAt || candidate.availableFrom),
    reasons: reasons.slice(0, 3),
  };
}

function requiredServices(context) {
  return Object.prototype.hasOwnProperty.call(context, "selectedServices")
    ? stringSet(context.selectedServices)
    : null;
}

function available(candidate, services) {
  const serviceMatch = services == null
    || (services.size > 0 && overlap(stringSet(candidate?.services), services));
  return candidate?.matchStatus === "matched"
    && candidate?.region === "AT"
    && candidate?.availabilityConfirmed === true
    && text(candidate.targetId)
    && serviceMatch;
}

function compareRows(a, b) {
  const pairs = [
    [a.analysis.negativeCount, b.analysis.negativeCount, 1],
    [a.analysis.positiveStrength, b.analysis.positiveStrength, -1],
    [a.analysis.positiveCount, b.analysis.positiveCount, -1],
    [a.analysis.ratedMatches, b.analysis.ratedMatches, -1],
    [a.analysis.density, b.analysis.density, -1],
    [a.analysis.freshness, b.analysis.freshness, -1],
  ];
  for (const [left, right, direction] of pairs) {
    if (left !== right) return (left < right ? -1 : 1) * direction;
  }
  /* Ein Quellenrang ist nur innerhalb derselben Quelle vergleichbar. */
  if (a.candidate.sourceId === b.candidate.sourceId) {
    const rankA = Number.isInteger(a.candidate.sourceRank) ? a.candidate.sourceRank : Number.MAX_SAFE_INTEGER;
    const rankB = Number.isInteger(b.candidate.sourceRank) ? b.candidate.sourceRank : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
  }
  return text(a.candidate.targetId).localeCompare(text(b.candidate.targetId), "de-AT");
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const id = text(row.candidate.targetId);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function projectPipeline(candidates, context) {
  const catalog = list(candidates);
  const library = list(context.library);
  /* Altaufrufer behandeln die ganze Mediathek weiterhin als Ausschlussmenge.
     Entdecken kann dagegen explizit die fachlich engere Aussage "gesehen"
     übergeben: Ein bloßer Mediathek-Eintrag ist kein Sehbeleg. */
  const hasExplicitExclusions = Object.prototype.hasOwnProperty.call(context, "excludedTargetIds");
  const excludedTargetIds = new Set((hasExplicitExclusions
    ? values(context.excludedTargetIds)
    : library.map((item) => item?.targetId))
    .map(text).filter(Boolean));
  const serviceSelection = requiredServices(context);
  const serviceAvailable = catalog.filter((candidate) => available(candidate, serviceSelection));
  const analyzed = serviceAvailable.map((candidate) => ({ candidate, analysis: analyze(candidate, context) }));
  const hardEligible = analyzed.filter((row) => (
    row.candidate?.eligible !== false
    && !excludedTargetIds.has(text(row.candidate.targetId))
    && !row.analysis.blockingNegative
  ));
  const reasoned = hardEligible.filter((row) => row.analysis.reasons.length > 0);
  const personal = uniqueRows([...reasoned].sort(compareRows));
  return { catalog, serviceAvailable, hardEligible, reasoned, personal };
}

export function rankRecommendations(candidates, context = {}) {
  return projectPipeline(candidates, context).personal
    .map((row) => Object.freeze({
      targetId: row.candidate.targetId,
      title: row.candidate.title,
      reasons: Object.freeze([...row.analysis.reasons]),
      negativeMatches: row.analysis.negativeCount,
      sourceId: row.candidate.sourceId,
      sourceRank: row.candidate.sourceRank ?? null,
      watchmodeId: row.candidate.watchmodeId ?? null,
      services: Object.freeze([...list(row.candidate.services)]),
      year: row.candidate.year ?? null,
      type: row.candidate.type ?? null,
      externalDiscovery: row.candidate.externalDiscovery === true,
      externalEvidence: Object.freeze(list(row.candidate.externalEvidence)
        .map((entry) => Object.freeze({ ...entry }))),
    }));
}

/* Ausschließlich aggregierte Zahlen: keine Titel, Signale oder Profildaten.
   Dadurch kann eine dünne persönliche Auswahl reproduzierbar diagnostiziert
   werden, ohne Nutzerdaten in Logs oder Telemetrie zu tragen. */
export function createRecommendationFunnel(candidates, context = {}) {
  const stages = projectPipeline(candidates, context);
  return Object.freeze({
    catalogCount: stages.catalog.length,
    serviceAvailableCount: stages.serviceAvailable.length,
    hardEligibleCount: stages.hardEligible.length,
    reasonedCount: stages.reasoned.length,
    personalCount: stages.personal.length,
  });
}
