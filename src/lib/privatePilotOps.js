import { PERSONAL_DATA_ENTRIES } from "./personalDataRegistry.js";

export const PRIVATE_OPS_SCHEMA_VERSION = 1;
export const LEGAL_REVIEW_REQUIRED = "LEGAL_OR_PROVIDER_REVIEW_REQUIRED";

export const RETENTION_CLASSES = Object.freeze({
  NONE: Object.freeze({ id: "none", days: 0, label: "nicht gespeichert" }),
  TRANSIENT_7: Object.freeze({ id: "transient-7", days: 7, label: "7 Tage" }),
  OPERATIONS_30: Object.freeze({ id: "operations-30", days: 30, label: "30 Tage" }),
  AUDIT_90: Object.freeze({ id: "audit-90", days: 90, label: "90 Tage" }),
  PURPOSE_BOUND: Object.freeze({ id: "purpose-bound", days: null, label: "bis zur Löschung durch dich" }),
});

const provider = (entry) => Object.freeze({
  enabledByDefault: false,
  legalStatus: LEGAL_REVIEW_REQUIRED,
  retentionConfirmed: false,
  sourceStatus: LEGAL_REVIEW_REQUIRED,
  serverFlag: null,
  ...entry,
});

/* Maschinenlesbare Empfänger-/Quellenliste. `enabledByDefault` ist kein
   Laufzeit-Ersatz für den Server: ein externer Anbieter braucht zusätzlich
   einen serverseitig bestätigten Registry-Eintrag und das konkrete Feature-
   Flag. Fehlende Vertrags-/Aufbewahrungsfakten schließen den Pfad. */
export const PRIVATE_PROVIDER_REGISTRY = Object.freeze([
  provider({ id: "supabase", name: "Supabase", purpose: "Anmeldung, persönlicher Kontospeicher und Edge Functions", data: "Sitzungstoken und ausdrücklich synchronisierte persönliche Töpfe", region: "Projektregion", officialSource: "https://supabase.com/docs/guides/security", retrievedAt: "2026-08-09" }),
  provider({ id: "cloudflare", name: "Cloudflare Pages", purpose: "Auslieferung der statischen Web-App", data: "technische HTTP-Verbindungsdaten", region: "globales Edge-Netz", officialSource: "https://www.cloudflare.com/cloudflare-customer-dpa/", retrievedAt: "2026-08-09" }),
  provider({ id: "github", name: "GitHub Actions", purpose: "Build, Tests und betriebliche Statusprüfung", data: "Build-Metadaten und feste technische Statuscodes; keine Inhaltsdaten", region: "Anbieterbetrieb", officialSource: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement", retrievedAt: "2026-08-09" }),
  provider({ id: "anthropic", name: "Anthropic API", purpose: "einzelne ausdrücklich aktivierte KI-Aufgaben", data: "minimaler Aufgabeninhalt; keine gesamte Mediathek", region: "Anbieterbetrieb", serverFlag: "ai_provider_aktiv", officialSource: "https://privacy.claude.com/en/articles/15425996-data-retention-practices-for-covered-models", retrievedAt: "2026-08-09" }),
  provider({ id: "watchmode", name: "Watchmode", purpose: "Streaming-Kataloganreicherung", data: "Titel-/Provider-Suchparameter; keine Kontokennung", region: "Anbieterbetrieb", serverFlag: "watchmode_provider_aktiv", officialSource: "https://api.watchmode.com/docs/", retrievedAt: "2026-08-09" }),
  provider({ id: "wikidata", name: "Wikidata", purpose: "deterministische Metadatenauflösung", data: "Titel-/Werkabfrage; keine Kontokennung", region: "Anbieterbetrieb", serverFlag: "filmwissen_provider_aktiv", officialSource: "https://www.wikidata.org/wiki/Wikidata:Data_access", retrievedAt: "2026-08-09" }),
  provider({ id: "loc", name: "Library of Congress", purpose: "gemeinfreie Filminformationen", data: "Titel-/Werkabfrage; keine Kontokennung", region: "USA", serverFlag: "filmwissen_provider_aktiv", officialSource: "https://www.loc.gov/apis/", retrievedAt: "2026-08-09" }),
  provider({ id: "film_at", name: "film.at", purpose: "Wiener Kinoprogramm als redaktionelle Quelle", data: "öffentliche Programmseiten; keine Kontokennung", region: "Anbieterbetrieb", serverFlag: "programmdaten_import_aktiv", officialSource: "https://www.film.at/", retrievedAt: "2026-08-09" }),
  provider({ id: "nonstopkino", name: "nonstopkino.at", purpose: "Wiener Kinoprogramm als redaktionelle Quelle", data: "öffentliche Programmseiten; keine Kontokennung", region: "Anbieterbetrieb", serverFlag: "programmdaten_import_aktiv", officialSource: "https://nonstopkino.at/datenschutz/", retrievedAt: "2026-08-09" }),
]);

export const PRIVATE_DATA_INVENTORY = Object.freeze([
  ...PERSONAL_DATA_ENTRIES.map((entry) => Object.freeze({
    id: entry.backupField,
    label: entry.label,
    purpose: "persönliche Kinodreieck-Funktion und geräteübergreifende Synchronisierung",
    owner: "angemeldetes Konto oder lokaler Gast",
    locations: Object.freeze(["Browser", "Supabase kd_personal bei aktivem Konto"]),
    recipients: Object.freeze(["Supabase bei aktivem Konto"]),
    export: "Sicherheitskopie dieses Geräts (kein Server-/Kontoexport)",
    deleteTrigger: "Eintrag/Funktion löschen, lokale Inhaltslöschung oder abgeschlossene Kontolöschung",
    retention: RETENTION_CLASSES.PURPOSE_BOUND.id,
    featureFlag: "personal_storage_aktiv",
    legalStatus: "INTERNAL_PERSONAL_DATA",
  })),
  Object.freeze({ id: "local_diagnostics", label: "Lokale technische Fehlerdiagnose", purpose: "Owner-aktivierte, inhaltsfreie Fehlercodes mit groben Laufzeitmetadaten", owner: "lokales Gerät", locations: Object.freeze(["Browser"]), recipients: Object.freeze([]), export: "bewusster Export über Supportdaten", deleteTrigger: "manuelles Leeren oder automatische 7-Tage-TTL", retention: RETENTION_CLASSES.TRANSIENT_7.id, featureFlag: null, legalStatus: "LOCAL_ONLY_NO_CONTENT" }),
  Object.freeze({ id: "auth_session", label: "Anmeldesitzung", purpose: "Authentifizierung", owner: "angemeldetes Konto", locations: Object.freeze(["Browser", "Supabase Auth"]), recipients: Object.freeze(["Supabase"]), export: "serverseitige Eigendatenauskunft", deleteTrigger: "Logout oder Kontolöschung", retention: RETENTION_CLASSES.PURPOSE_BOUND.id, featureFlag: "private_pilot_access", legalStatus: "AUTH_REQUIRED" }),
  Object.freeze({ id: "local_rollback", label: "lokale Rückholpunkte", purpose: "sicherer Restore und Kontowechsel", owner: "lokales Gerät", locations: Object.freeze(["Browser"]), recipients: Object.freeze([]), export: "nicht im Backup; nur kurzfristige Sicherheitskopie", deleteTrigger: "TTL, Rücknahme oder Reset", retention: RETENTION_CLASSES.TRANSIENT_7.id, featureFlag: null, legalStatus: "LOCAL_ONLY" }),
  Object.freeze({ id: "ops_terminal", label: "terminale Betriebsdetails", purpose: "Idempotenz, Fehlerabschluss und zeitlich begrenzte Supportdiagnose", owner: "technischer Betrieb", locations: Object.freeze(["Browser", "Supabase"]), recipients: Object.freeze(["Supabase bei serverseitigen Operationen"]), export: "serverseitige Eigendatenauskunft soweit kontobezogen", deleteTrigger: "30-Tage-TTL-Purge", retention: RETENTION_CLASSES.OPERATIONS_30.id, featureFlag: "private_ops_aktiv", legalStatus: "NO_CONTENT_PAYLOAD" }),
  Object.freeze({ id: "ops_metadata", label: "inhaltsfreie Betriebsmetadaten", purpose: "Run-, Kosten-, Review- und Capability-Nachweis", owner: "technischer Betrieb", locations: Object.freeze(["Supabase", "GitHub Actions"]), recipients: Object.freeze(["Supabase", "GitHub"]), export: "serverseitige Eigendatenauskunft soweit kontobezogen", deleteTrigger: "90-Tage-TTL-Purge", retention: RETENTION_CLASSES.AUDIT_90.id, featureFlag: "private_ops_aktiv", legalStatus: "NO_CONTENT_PAYLOAD" }),
]);

export function providerActivationDecision({ registryRow, featureEnabled, now = Date.now() }) {
  if (featureEnabled !== true) return Object.freeze({ ok: false, code: "FEATURE_FLAG_OFF" });
  if (!registryRow || registryRow.enabled !== true) return Object.freeze({ ok: false, code: "PROVIDER_REGISTRY_OFF" });
  if (registryRow.legal_status === LEGAL_REVIEW_REQUIRED || registryRow.legalConfirmed !== true) {
    return Object.freeze({ ok: false, code: LEGAL_REVIEW_REQUIRED });
  }
  if (registryRow.rightsConfirmed !== true) return Object.freeze({ ok: false, code: "RIGHTS_UNCONFIRMED" });
  if (registryRow.dpaTransferConfirmed !== true) return Object.freeze({ ok: false, code: "DPA_TRANSFER_UNCONFIRMED" });
  if (registryRow.retentionConfirmed !== true) return Object.freeze({ ok: false, code: "RETENTION_UNCONFIRMED" });
  if (registryRow.priceBudgetConfirmed !== true) return Object.freeze({ ok: false, code: "BUDGET_UNKNOWN" });
  const reviewedAt = Date.parse(String(registryRow.reviewedAt || ""));
  if (!Number.isFinite(reviewedAt) || reviewedAt > now || now - reviewedAt > 90 * 24 * 60 * 60 * 1000) {
    return Object.freeze({ ok: false, code: "PROVIDER_REVIEW_STALE" });
  }
  return Object.freeze({ ok: true, code: "PROVIDER_ALLOWED" });
}

export function privateOpsExportStatus({ remoteIncluded = false, remoteAvailable = false } = {}) {
  return Object.freeze({
    schemaVersion: PRIVATE_OPS_SCHEMA_VERSION,
    registryVersion: PRIVATE_OPS_SCHEMA_VERSION,
    localDataClasses: PERSONAL_DATA_ENTRIES.map((entry) => entry.backupField),
    remoteOwnData: remoteIncluded ? "included" : remoteAvailable ? "not-requested" : "unavailable",
    retentionPolicy: Object.values(RETENTION_CLASSES).map(({ id, days }) => ({ id, days })),
    accountDeletion: "server-flagged-disabled-by-default",
  });
}
