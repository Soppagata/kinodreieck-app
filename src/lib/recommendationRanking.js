/* Deterministisches Empfehlungsranking. Keine KI, kein Netzwerk, kein Profil-
   oder Telemetrie-Write. Das Ergebnis ist eine flüchtige Projektion. */

function text(value) { return String(value == null ? "" : value).trim(); }
function normalized(value) { return text(value).toLocaleLowerCase("de-AT"); }
function list(value) { return Array.isArray(value) ? value : []; }
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

function eligible(candidate, excludedTargetIds) {
  return candidate?.matchStatus === "matched"
    && candidate?.region === "AT"
    && candidate?.availabilityConfirmed === true
    && candidate?.eligible !== false
    && text(candidate.targetId)
    && !excludedTargetIds.has(text(candidate.targetId));
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

export function rankRecommendations(candidates, context = {}) {
  const library = context.useLibrary === false ? [] : list(context.library);
  /* Altaufrufer behandeln die ganze Mediathek weiterhin als Ausschlussmenge.
     Entdecken kann dagegen die fachlich engere Aussage "noch nicht gesehen"
     explizit übergeben: Ein bloßer Mediathek-Eintrag ist kein Sehbeleg. */
  const hasExplicitExclusions = Object.prototype.hasOwnProperty.call(context, "excludedTargetIds");
  const excludedTargetIds = new Set((hasExplicitExclusions
    ? list(context.excludedTargetIds)
    : library.map((item) => item?.targetId))
    .map(text).filter(Boolean));
  return list(candidates)
    .filter((candidate) => eligible(candidate, excludedTargetIds))
    .map((candidate) => ({ candidate, analysis: analyze(candidate, context) }))
    .filter((row) => !row.analysis.blockingNegative)
    /* Ohne belegten Profil-/Mediatheksgrund bleibt der Kandidat in seiner
       unpersonalisierten Quellenliste und wird nicht zur Empfehlung. Nur ein
       ausdruecklicher technischer Aufrufer darf neutrale Zeilen mitnehmen. */
    .filter((row) => context.includeNeutral === true || row.analysis.reasons.length > 0)
    .sort(compareRows)
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
      externalEvidence: Object.freeze(list(row.candidate.externalEvidence).map((entry) => Object.freeze({ ...entry }))),
    }));
}
