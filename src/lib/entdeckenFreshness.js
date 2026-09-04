export const ENTDECKEN_TARGET_REFRESH_SLA_HOURS = 24;
export const ENTDECKEN_CURRENT_REFRESH_INTERVAL_HOURS = 24;
export const RADAR_REFRESH_INTERVAL_HOURS = 144;

const VALID_DAY = /^\d{4}-\d{2}-\d{2}$/u;

function dayNumber(value) {
  if (!VALID_DAY.test(String(value || ""))) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? Math.floor(parsed / 86_400_000)
    : null;
}

function frozenGate(id, label, status, evidence) {
  return Object.freeze({ id, label, status, evidence });
}

/* Der Feed nennt nur Kalendertage. Deshalb wird die 24h-SLA ausschließlich
   am selben Wiener Tag als belegt ausgewiesen; ein Vortagesdatum wird nicht
   optimistisch als "unter 24 Stunden" interpretiert. */
export function entdeckenFeedFreshness(feed, today) {
  const refreshed = dayNumber(feed?.refreshedOn);
  const validUntil = dayNumber(feed?.validUntil);
  const current = dayNumber(today);
  if (refreshed == null || validUntil == null || current == null || validUntil < refreshed) {
    return Object.freeze({ status: "unknown", ageDays: null, label: "Feedalter unbekannt" });
  }
  const ageDays = current - refreshed;
  if (ageDays < 0) {
    return Object.freeze({ status: "invalid", ageDays, label: "Feeddatum liegt in der Zukunft" });
  }
  if (validUntil < current) {
    return Object.freeze({ status: "expired", ageDays, label: "Feed ist abgelaufen" });
  }
  if (ageDays === 0) {
    return Object.freeze({ status: "within_sla", ageDays, label: "Heute aktualisiert" });
  }
  return Object.freeze({
    status: "sla_unproven",
    ageDays,
    label: "24-Stunden-Frische mit Tagesdatum nicht mehr belegt",
  });
}

/* Reine, deterministische Supportprojektion. Fehlende Gates bleiben unknown;
   insbesondere werden weder ein Titelmatch noch eine Quellenabdeckung aus
   Titeltext oder Plattformnamen geraten. */
export function buildEntdeckenTitleGateTrace({
  title,
  checkedOn,
  fullCatalog = {},
  previousSnapshot = {},
  feed = {},
  profile = {},
  personal = {},
  operation = {},
} = {}) {
  const freshness = entdeckenFeedFreshness(feed, checkedOn);
  const catalogIdentity = fullCatalog.present === true && fullCatalog.stableIdConfirmed === true;
  const atAvailability = catalogIdentity && fullCatalog.atAvailable === true;
  const feedPresence = feed.titlePresent === true;
  const sourceExclusion = feedPresence === false && feed.coverage?.capturesCatalogService === false;
  const gates = Object.freeze([
    frozenGate("catalog-identity", "Stabile Katalogidentität", catalogIdentity ? "passed" : "unknown",
      catalogIdentity ? "Im aktuellen Vollkatalog eindeutig belegt." : "Kein eindeutiger Katalogbeleg."),
    frozenGate("at-availability", "AT-Verfügbarkeit", atAvailability ? "passed" : "unknown",
      atAvailability ? `Belegt bei ${fullCatalog.service || "einem österreichischen Dienst"}.` : "Nicht belegt."),
    frozenGate("previous-snapshot", "Früher Vergleichsstand", previousSnapshot.titlePresent === false ? "absent" : "unknown",
      previousSnapshot.titlePresent === false ? "Im Vergleichssnapshot nicht enthalten." : "Vergleich nicht belegt."),
    frozenGate("feed-freshness", "Entdecken-Aktualität", freshness.status, freshness.label),
    frozenGate("feed-intake", "Aufnahme in den Entdecken-Feed", feedPresence ? "passed" : "absent",
      feedPresence ? "Im Feed enthalten." : "Im geprüften Feed nicht enthalten."),
    frozenGate("source-coverage", "Abdeckung der Feedquellen", sourceExclusion ? "excluded" : "unknown",
      sourceExclusion
        ? "Die belegten Feedquellen erfassen den Katalogdienst dieses Titels nicht."
        : "Keine eindeutige Ausschlussursache belegt."),
    frozenGate("profile", "Profilmetadaten", profile.metadataPresent === true ? "passed"
      : profile.metadataPresent === false ? "absent" : "unknown",
    profile.metadataPresent === false ? "Keine Profilmetadaten für diesen Titel belegt." : "Profilstand nicht belegt."),
    frozenGate("personal", "Gesehen/Mediathek", personal.seen === false && personal.inLibrary === false ? "passed" : "unknown",
      personal.seen === false && personal.inLibrary === false
        ? "Weder als gesehen noch als Mediathek-Eintrag ausgeschlossen."
        : "Persönlicher Ausschluss nicht eindeutig belegt."),
    frozenGate("last-attempt", "Letzter Versuch", operation.lastAttemptAt ? "known" : "unknown",
      operation.lastAttemptAt || "Zeitpunkt im Audit nicht belegt."),
    frozenGate("last-success", "Letzter erfolgreicher Lauf", operation.lastSuccessAt ? "known" : "unknown",
      operation.lastSuccessAt || "Zeitpunkt im Audit nicht belegt."),
  ]);
  const conclusion = feedPresence && freshness.status === "within_sla"
    ? "feed-included"
    : sourceExclusion ? "explainable-source-exclusion"
      : ["expired", "sla_unproven", "unknown"].includes(freshness.status)
        ? "freshness-unproven"
        : "exclusion-unresolved";
  return Object.freeze({
    format: "kd-entdecken-title-gate-trace-v1",
    title: String(title || "").trim(),
    checkedOn: VALID_DAY.test(String(checkedOn || "")) ? checkedOn : null,
    targetRefreshSlaHours: ENTDECKEN_TARGET_REFRESH_SLA_HOURS,
    currentRefreshIntervalHours: ENTDECKEN_CURRENT_REFRESH_INTERVAL_HOURS,
    radarIntervalHours: RADAR_REFRESH_INTERVAL_HOURS,
    gates,
    conclusion,
    marketAbsenceProven: false,
    preferredAction: "apply-authored-provider-free-refresh-migration",
    migrationState: "authorized-authored-not-applied",
  });
}

export const MANDALORIAN_GROGU_TRACE = buildEntdeckenTitleGateTrace({
  title: "Mandalorian & Grogu",
  checkedOn: "2026-09-04",
  fullCatalog: {
    present: true,
    stableIdConfirmed: true,
    atAvailable: true,
    service: "Disney+",
  },
  previousSnapshot: { titlePresent: false },
  feed: {
    format: 6,
    refreshedOn: "2026-08-28",
    validUntil: "2026-09-03",
    titlePresent: false,
    coverage: {
      sourceIds: Object.freeze(["chart:joyn-at", "chart:oefi-weekend-at"]),
      capturesCatalogService: false,
    },
  },
  profile: { metadataPresent: false },
  personal: { seen: false, inLibrary: false },
  operation: { lastAttemptAt: null, lastSuccessAt: null },
});
