export const CATALOG_AUDIT_UNKNOWN = "unknown";

export const CATALOG_PHASES = Object.freeze([
  Object.freeze({ id: "rawBySource", label: "Rohzeilen je Quelle/Dienst" }),
  Object.freeze({ id: "validAtAvailability", label: "Gültige AT-Verfügbarkeit" }),
  Object.freeze({ id: "identityResolved", label: "Identitätsauflösung" }),
  Object.freeze({ id: "deduplicated", label: "Deduplizierung" }),
  Object.freeze({ id: "snapshot", label: "Snapshot" }),
  Object.freeze({ id: "serviceFiltered", label: "Dienstefilter" }),
  Object.freeze({ id: "librarySubtracted", label: "Mediathek-Abzug" }),
  Object.freeze({ id: "visible", label: "Sichtbare Zahl" }),
]);

export const CATALOG_COMPARISON_PHASES = Object.freeze([
  Object.freeze({ id: "rawSource", label: "Rohquellen" }),
  Object.freeze({ id: "atAvailability", label: "AT-Verfügbarkeit" }),
  Object.freeze({ id: "filter", label: "Filter" }),
  Object.freeze({ id: "dedupe", label: "Deduplizierung" }),
  Object.freeze({ id: "sort", label: "Sortierung" }),
  Object.freeze({ id: "truncation", label: "Begrenzung" }),
  Object.freeze({ id: "serving", label: "Auslieferung" }),
  Object.freeze({ id: "consumption", label: "Nutzersicht" }),
]);

const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;

function normalizeSourceCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length) return null;
  const known = {};
  const unknownSources = [];
  for (const [source, rawCount] of entries) {
    const normalized = count(rawCount);
    if (normalized == null) unknownSources.push(source);
    else known[source] = normalized;
  }
  return {
    known: Object.freeze(known),
    unknownSources: Object.freeze(unknownSources),
    total: unknownSources.length ? null : Object.values(known).reduce((sum, valueCount) => sum + valueCount, 0),
  };
}

function phaseResult(definition, value) {
  const sourceCounts = definition.id === "rawBySource" ? normalizeSourceCounts(value) : null;
  const normalizedCount = sourceCounts ? sourceCounts.total : count(value);
  const known = normalizedCount != null;
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    status: known ? "known" : CATALOG_AUDIT_UNKNOWN,
    count: normalizedCount,
    ...(sourceCounts ? {
      sourceCounts: sourceCounts.known,
      unknownSources: sourceCounts.unknownSources,
    } : {}),
    ...(!known ? { reason: "provenance-missing" } : {}),
  });
}

function comparisonCount(value) {
  const normalized = count(value);
  return Object.freeze(normalized == null
    ? { status: CATALOG_AUDIT_UNKNOWN, count: null, reason: "identity-comparison-missing" }
    : { status: "known", count: normalized });
}

/* Erstellt eine ehrliche Pipelinebilanz aus bereits gemessenen Zaehlern.
   Das Modul liest weder Dateien noch Netz/DB und leitet keine fehlende Phase
   aus einer spaeteren Zahl ab. */
export function buildCatalogPhaseBalance({
  snapshotId = null,
  generatedAt = null,
  completeness = CATALOG_AUDIT_UNKNOWN,
  phases = {},
  comparison = {},
} = {}) {
  const normalizedCompleteness = ["full", "limited"].includes(completeness)
    ? completeness : CATALOG_AUDIT_UNKNOWN;
  const results = CATALOG_PHASES.map((definition) => phaseResult(definition, phases?.[definition.id]));
  return Object.freeze({
    format: 1,
    snapshot: Object.freeze({
      id: text(snapshotId),
      generatedAt: text(generatedAt),
      completeness: normalizedCompleteness,
      ...(!text(generatedAt) ? { freshness: CATALOG_AUDIT_UNKNOWN } : {}),
    }),
    phases: Object.freeze(results),
    comparison: Object.freeze({
      added: comparisonCount(comparison?.added),
      removed: comparisonCount(comparison?.removed),
      reidentified: comparisonCount(comparison?.reidentified),
    }),
    marketInterpretation: Object.freeze({
      status: CATALOG_AUDIT_UNKNOWN,
      reason: "snapshot-difference-does-not-prove-market-exit",
    }),
    complete: results.every((phase) => phase.status === "known")
      && normalizedCompleteness !== CATALOG_AUDIT_UNKNOWN,
  });
}

export const erstelleKatalogPhasenbilanz = buildCatalogPhaseBalance;

export function catalogPhase(balance, id) {
  return balance?.phases?.find((phase) => phase.id === id) || null;
}

function frozenComparisonPhase(id, status, value, evidence) {
  const definition = CATALOG_COMPARISON_PHASES.find((phase) => phase.id === id);
  return Object.freeze({
    id,
    label: definition?.label || id,
    status,
    value: value ?? null,
    evidence,
  });
}

/* Datiertes Supportartefakt für U-14. Die Vergleichsmengen beziehen sich nur
   auf die Discover-Lane; die kleine Known-Lane wird separat ausgewiesen. Aus
   späteren Zählern werden keine fehlenden früheren Pipelinewerte errechnet. */
export function buildPrivateReleaseCatalogAudit({
  observedOn = "2026-09-04",
  previous = {},
  current = {},
  comparison = {},
} = {}) {
  const previousDiscover = count(previous.discover);
  const previousKnown = count(previous.known);
  const currentDiscover = count(current.discover);
  const currentKnown = count(current.known);
  const retained = count(comparison.retained);
  const removed = count(comparison.removed);
  const added = count(comparison.added);
  const reidentified = count(comparison.reidentified);
  const strongIdDuplicates = count(comparison.strongIdDuplicates);
  const serviceCount = count(comparison.serviceCount);
  const countsKnown = [previousDiscover, previousKnown, currentDiscover, currentKnown,
    retained, removed, added, reidentified, strongIdDuplicates, serviceCount]
    .every((value) => value != null);
  const identitiesConsistent = countsKnown
    && retained + removed === previousDiscover
    && retained + added === currentDiscover;
  if (!identitiesConsistent) throw new Error("catalog-comparison-identity-balance-invalid");
  const previousTotal = previousDiscover + previousKnown;
  const currentTotal = currentDiscover + currentKnown;
  return Object.freeze({
    format: "kd-streaming-catalog-audit-v1",
    observedOn,
    scope: "AT-Streaming · Discover und Known",
    snapshotCoverage: "full",
    pipelineCoverage: "limited",
    previous: Object.freeze({
      date: text(previous.date),
      discover: previousDiscover,
      known: previousKnown,
      total: previousTotal,
    }),
    current: Object.freeze({
      date: text(current.date),
      discover: currentDiscover,
      known: currentKnown,
      total: currentTotal,
    }),
    comparison: Object.freeze({
      scope: "Discover-Lane",
      retained,
      removed,
      added,
      reidentified,
      strongIdDuplicates,
      serviceCount,
      sameServiceSet: comparison.sameServiceSet === true,
      netDiscoverChange: currentDiscover - previousDiscover,
      netTotalChange: currentTotal - previousTotal,
    }),
    phases: Object.freeze([
      frozenComparisonPhase("rawSource", "unknown", null,
        "Rohzeilen je Quelle wurden in keinem der beiden Snapshots mitgeführt."),
      frozenComparisonPhase("atAvailability", "unknown", null,
        "Ein Vorher-/Nachher-Zähler vor dem AT-Marktfilter fehlt."),
      frozenComparisonPhase("filter", "limited", serviceCount,
        `${serviceCount} Dienste in beiden Snapshots; Zeilen vor und nach dem Filter unbekannt.`),
      frozenComparisonPhase("dedupe", "limited", strongIdDuplicates,
        `${strongIdDuplicates} starke ID-Duplikate im Vergleich; Vorher-/Nachher-Zähler unbekannt.`),
      frozenComparisonPhase("sort", "unknown", null,
        "Die Sortierstufe hat keinen eigenen Mengenzähler."),
      frozenComparisonPhase("truncation", "unknown", null,
        "Eine mögliche Begrenzung vor dem gespeicherten Snapshot ist nicht protokolliert."),
      frozenComparisonPhase("serving", "known", currentTotal,
        `Gespeicherter aktueller Snapshot: ${currentDiscover} Discover + ${currentKnown} Known.`),
      frozenComparisonPhase("consumption", "unknown", null,
        "Die sichtbare Zahl hängt von Dienstefilter und persönlichem Mediathek-Abzug ab."),
    ]),
    interpretation: Object.freeze({
      marketLossProven: false,
      label: "Snapshotdifferenz; kein belegter Marktabgang",
    }),
  });
}

export const PRIVATE_RELEASE_CATALOG_AUDIT = buildPrivateReleaseCatalogAudit({
  observedOn: "2026-09-04",
  previous: { date: "2026-07-22", discover: 12_540, known: 100 },
  current: { date: "2026-09-04", discover: 11_049, known: 103 },
  comparison: {
    retained: 10_695,
    removed: 1_845,
    added: 354,
    reidentified: 7,
    strongIdDuplicates: 0,
    serviceCount: 6,
    sameServiceSet: true,
  },
});
