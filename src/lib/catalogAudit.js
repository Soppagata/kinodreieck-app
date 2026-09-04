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
