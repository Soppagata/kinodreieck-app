import { PERSONAL_DATA_ENTRIES } from "./personalDataRegistry.js";

export const PRIVATE_OPS_SCHEMA_VERSION = 1;
export const LEGAL_REVIEW_REQUIRED = "LEGAL_OR_PROVIDER_REVIEW_REQUIRED";

/* Ein freigeschalteter Endpoint und eine formal valide Antwort belegen noch
   keinen vollständigen Kontoexport. Der sichtbare Releaseweg braucht
   zusätzlich diesen versionierten Umfangsvertrag. Die aktuelle
   Releasekonfiguration bleibt bewusst UNPROVEN: Der bestehende Own-Data-
   Vertrag ist gegenüber den später ergänzten Kontoflächen nicht als
   vollständig abgenommen. Ein Runtime-Flag kann diese Codegrenze nicht
   überstimmen. */
export const ACCOUNT_EXPORT_SCOPE_VERSION = "kinodreieck-account-export-release-v1";
export const ACCOUNT_EXPORT_REQUIRED_SCOPE = Object.freeze([
  Object.freeze({ id: "auth-account", label: "Anmeldung und Kontokennung" }),
  Object.freeze({ id: "account-access", label: "Kontofreigabe und Rolle" }),
  Object.freeze({ id: "personal-sync-pots", label: "alle registrierten persönlichen Sync-Töpfe" }),
  Object.freeze({ id: "ai-operation-logs", label: "kontobezogene KI-Betriebsnachweise" }),
  Object.freeze({ id: "blog-reference-extractions", label: "kurzlebige Vorschläge aus der Blog-Referenzerkennung" }),
  Object.freeze({ id: "series-watch", label: "Serienbeobachtung" }),
  Object.freeze({ id: "shared-articles", label: "eigene geteilte Artikel" }),
  Object.freeze({ id: "shared-claims", label: "eigene Artikelübernahmen" }),
  Object.freeze({ id: "radar-capabilities-state", label: "Radar-Rechte und Kontostand" }),
  Object.freeze({ id: "radar-subscriptions-receipts-shares", label: "Radar-Ziele, Bestätigungen und Freigaben" }),
  Object.freeze({ id: "radar-operations-reviews", label: "kontobezogene Radar-Vorgänge und Prüfungen" }),
  Object.freeze({ id: "radar-text-findings", label: "persönliche Radar-Textfunde" }),
  Object.freeze({ id: "retention-information", label: "Aufbewahrungsinformationen" }),
  Object.freeze({ id: "deletion-status", label: "Status einer Kontolöschanfrage" }),
]);

export const ACCOUNT_EXPORT_RELEASE_CONTRACT = Object.freeze({
  schemaVersion: ACCOUNT_EXPORT_SCOPE_VERSION,
  status: "UNPROVEN",
  dataClasses: Object.freeze([]),
});

export function istKontoExportVertragVollstaendig(
  contract = ACCOUNT_EXPORT_RELEASE_CONTRACT,
) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return false;
  const keys = Object.keys(contract).sort();
  if (keys.length !== 3 || keys.join("|") !== "dataClasses|schemaVersion|status") return false;
  if (contract.schemaVersion !== ACCOUNT_EXPORT_SCOPE_VERSION || contract.status !== "VERIFIED") return false;
  if (!Array.isArray(contract.dataClasses)) return false;
  const required = ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => entry.id);
  const included = contract.dataClasses;
  return included.length === required.length
    && new Set(included).size === required.length
    && required.every((id) => included.includes(id));
}

export const RETENTION_CLASSES = Object.freeze({
  NONE: Object.freeze({ id: "none", days: 0, label: "nicht gespeichert" }),
  TRANSIENT_7: Object.freeze({ id: "transient-7", days: 7, label: "7 Tage" }),
  OPERATIONS_30: Object.freeze({ id: "operations-30", days: 30, label: "30 Tage" }),
  AUDIT_90: Object.freeze({ id: "audit-90", days: 90, label: "90 Tage" }),
  BLOG_REFERENCE_EXTRACTIONS: Object.freeze({
    id: "blog-reference-extractions-24h",
    days: 1,
    label: "24 Stunden abrufbar; spätestens nach 25 Stunden gelöscht",
  }),
  PURPOSE_BOUND: Object.freeze({ id: "purpose-bound", days: null, label: "bis zur Löschung durch dich" }),
});

const provider = (entry) => Object.freeze({
  enabledByDefault: false,
  legalStatus: LEGAL_REVIEW_REQUIRED,
  retentionConfirmed: false,
  sourceStatus: LEGAL_REVIEW_REQUIRED,
  serverFlag: null,
  usage: "abhängig von der jeweils freigegebenen Funktion",
  retentionNote: null,
  technicalSource: null,
  termsSource: null,
  officialSourceLabel: "Offizielle Quelle",
  technicalSourceLabel: "Technische Informationen",
  termsSourceLabel: "Bedingungen",
  additionalSources: Object.freeze([]),
  ...entry,
});

/* Maschinenlesbare Empfänger-/Quellenliste. `enabledByDefault` ist kein
   Laufzeit-Ersatz für den Server: ein externer Anbieter braucht zusätzlich
   einen serverseitig bestätigten Registry-Eintrag und das konkrete Feature-
   Flag. Fehlende Vertrags-/Aufbewahrungsfakten schließen den Pfad. */
export const PRIVATE_PROVIDER_REGISTRY = Object.freeze([
  provider({ id: "supabase", name: "Supabase", purpose: "Anmeldung, persönlicher Kontospeicher und eigene Backend-Funktionen", data: "Anmeldedaten und Sitzung; synchronisierte persönliche Bereiche einschließlich Profil, Artikeln, Bewertungen und Radar; außerdem die Eingaben der jeweils aufgerufenen Backend-Funktion", region: "Projektregion", usage: "Kernbetrieb für angemeldete Konten, Synchronisation und serverseitige Datenwege", officialSource: "https://supabase.com/privacy", officialSourceLabel: "Datenschutz", retrievedAt: "2026-09-14" }),
  provider({ id: "cloudflare", name: "Cloudflare Pages", purpose: "Auslieferung der Web-App", data: "technische HTTP-Verbindungsdaten beim Laden der Website", region: "globales Edge-Netz", usage: "Kernbetrieb beim Öffnen der Website", officialSource: "https://www.cloudflare.com/privacypolicy/", officialSourceLabel: "Datenschutz", retrievedAt: "2026-09-14" }),
  provider({ id: "github", name: "GitHub und GitHub Actions", purpose: "Quellcodeverwaltung, Builds, Tests, Jobs und öffentliche Katalogdaten", data: "Quellcode, Build- und Jobdaten sowie öffentliche Katalogdaten; keine persönliche Mediathek und kein Geschmacksprofil", region: "Anbieterbetrieb", usage: "technischer Betrieb und Pflege gemeinsamer Daten", officialSource: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement", officialSourceLabel: "Datenschutz", retrievedAt: "2026-09-14" }),
  provider({
    id: "anthropic",
    name: "Anthropic API",
    purpose: "KI-Suche, Profil- und Geschmacksaufgaben, Filmprognosen, Listen- und Bloganalyse, optionale Erkennung von Blogreferenzen sowie Filmwissen und Radar-Recherche",
    data: "begrenzte Eingaben der jeweiligen Aufgabe: etwa Suchtext, Antworten, Film- oder Listenangaben, bestätigte Profilsignale, der ausdrücklich ausgewählte Blogartikel oder ein Radarziel. Bei „Titel im Text erkennen (KI)“ gehen nach dem Klick die Überschrift und der vollständige begrenzte Blogtext an Anthropic; persönliche Angaben im Text werden mitgesendet. Keine Passwörter und nicht pauschal die gesamte Mediathek",
    region: "Anthropic nennt Speicherung in den USA und standardmäßig mögliche Verarbeitung in den USA, Europa, Asien und Australien",
    usage: "optional bei bewusst gestarteten und freigeschalteten KI-Aufgaben; die Blog-Referenzerkennung startet ausschließlich per Klick und „Anonym veröffentlichen“ anonymisiert ihre Eingabe nicht. Zusätzlich kann ein serverseitig freigegebener automatischer Radar-Lauf aktive Radarziele unabhängig vom lokalen KI-Schalter prüfen",
    serverFlag: "ai_provider_aktiv",
    retentionNote: "Anthropic beschreibt für Standard-API-Eingaben und -Ausgaben eine automatische Löschung innerhalb von 30 Tagen, unter anderem mit Ausnahmen für abweichende Vereinbarungen, Sicherheitsprüfungen und rechtliche Pflichten. Das belegt weder die konkrete Kinodreieck-Vertragslage noch EU-only, Zero Data Retention oder eine bestimmte Trainingseinstellung.",
    officialSource: "https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data",
    officialSourceLabel: "Datenschutz und Aufbewahrung",
    technicalSource: "https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers",
    technicalSourceLabel: "Verarbeitungs- und Speicherregionen",
    termsSource: "https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa",
    termsSourceLabel: "DPA-Informationen",
    additionalSources: Object.freeze([
      Object.freeze({
        href: "https://privacy.claude.com/en/articles/9267385-does-anthropic-act-as-a-data-processor-or-controller",
        label: "Kommerzielle Verarbeitung",
      }),
    ]),
    retrievedAt: "2026-09-18",
  }),
  provider({ id: "watchmode", name: "Watchmode", purpose: "österreichische Streaming-Verfügbarkeiten", data: "serverseitige Titel-, Werk- und Dienstabfragen; keine Kontokennung, persönlichen Profile, Bewertungen oder Abo-Auswahl", region: "Anbieterbetrieb", usage: "gemeinsame Katalogquelle", serverFlag: "watchmode_provider_aktiv", officialSource: "https://www.watchmode.com/privacy", officialSourceLabel: "Datenschutz", technicalSource: "https://api.watchmode.com/docs/", retrievedAt: "2026-09-14" }),
  provider({ id: "motn", name: "Movie of the Night", purpose: "ergänzende Streaming-Verfügbarkeiten", data: "serverseitige Titel-, Werk- und Dienstabfragen an die direkte API von Movie of the Night; keine Kontokennung, persönlichen Profile, Bewertungen oder Abo-Auswahl", region: "Anbieterbetrieb", usage: "gemeinsame ergänzende Katalogquelle", officialSource: "https://www.movieofthenight.com/privacy-policy", officialSourceLabel: "Datenschutz", technicalSource: "https://www.movieofthenight.com/about/api", retrievedAt: "2026-09-14" }),
  provider({ id: "oefi", name: "Österreichisches Filminstitut", purpose: "österreichische Kinocharts für Entdecken", data: "öffentliche Chartdaten; keine Kontokennung oder persönlichen Inhalte", region: "Österreich", usage: "aktive gemeinsame Quelle für Entdecken", officialSource: "https://filminstitut.at/charts", retrievedAt: "2026-09-10" }),
  provider({ id: "netflix_top10", name: "Netflix Top 10", purpose: "österreichische Netflix-Charts für Entdecken", data: "öffentliche Länder- und Titelrangdaten; keine Kontokennung oder persönlichen Inhalte", region: "Anbieterbetrieb", usage: "aktive gemeinsame Quelle für Entdecken", officialSource: "https://www.netflix.com/tudum/top10/austria", retrievedAt: "2026-09-10" }),
  provider({
    id: "flixpatrol",
    name: "FlixPatrol API",
    purpose: "neutrale österreichische Charts und Titelfakten für den gemeinsamen Katalog",
    data: "serverseitige Dienst-, Chart- und Titelkennungen; keine Kontokennung, Profile, Bewertungen, Notizen oder Abo-Auswahl",
    region: "in den geprüften öffentlichen Anbietertexten nicht belegt",
    usage: "aktive gemeinsame Katalogquelle; der Betreiber-API-Key bleibt serverseitig",
    retentionNote: "Aufbewahrung, API-Transferregion und DPA-Details sind in den geprüften öffentlichen Anbietertexten nicht belastbar belegt. Die technische Cachefrische ist keine Löschfrist.",
    officialSource: "https://flixpatrol.com/about/privacy-policy/",
    officialSourceLabel: "Datenschutz",
    technicalSource: "https://flixpatrol.com/api2/",
    termsSource: "https://flixpatrol.com/about/terms-and-conditions/",
    retrievedAt: "2026-09-10",
  }),
  provider({ id: "wikidata", name: "Wikidata", purpose: "optionale Metadatenauflösung und Recherche", data: "Titel-, Werk- oder Suchabfrage; keine Kontokennung", region: "Anbieterbetrieb", usage: "optionale öffentliche Wissensquelle", serverFlag: "filmwissen_provider_aktiv", officialSource: "https://www.wikidata.org/wiki/Wikidata:Data_access", officialSourceLabel: "Datenzugriff", retrievedAt: "2026-09-14" }),
  provider({ id: "loc", name: "Library of Congress", purpose: "optionale Recherche nach gemeinfreien Filminformationen", data: "Titel-, Werk- oder Suchabfrage; keine Kontokennung", region: "USA", usage: "optionale öffentliche Wissensquelle", serverFlag: "filmwissen_provider_aktiv", officialSource: "https://www.loc.gov/apis/", officialSourceLabel: "API-Informationen", retrievedAt: "2026-09-14" }),
  provider({ id: "film_at", name: "film.at", purpose: "Wiener Kinoprogramm als redaktionelle Quelle", data: "öffentliche Programmseiten; keine Kontokennung", region: "Anbieterbetrieb", usage: "gemeinsame Programmquelle; eine direkte Browserverbindung entsteht zusätzlich erst, wenn ein externer Link geöffnet wird", serverFlag: "programmdaten_import_aktiv", officialSource: "https://www.film.at/", officialSourceLabel: "Anbieterinformationen", retrievedAt: "2026-09-14" }),
  provider({ id: "nonstopkino", name: "nonstopkino.at", purpose: "Wiener Kinoprogramm als redaktionelle Quelle", data: "öffentliche Programmseiten; keine Kontokennung", region: "Anbieterbetrieb", usage: "gemeinsame Programmquelle; eine direkte Browserverbindung entsteht zusätzlich erst, wenn ein externer Link geöffnet wird", serverFlag: "programmdaten_import_aktiv", officialSource: "https://nonstopkino.at/datenschutz/", officialSourceLabel: "Datenschutz", retrievedAt: "2026-09-14" }),
  provider({
    id: "resend",
    name: "Resend",
    purpose: "Versand von Feedback und authentifizierten Kontolöschanfragen",
    data: "beim Feedback der eingegebene Text, Absender- und Empfänger-Mailadresse sowie technische Transportdaten, ohne angehängte Konto-, Profil-, Diagnose- oder Browserdaten; bei einer Kontolöschanfrage zusätzlich Konto-ID und Zeitstempel",
    region: "USA",
    usage: "optional, wenn Feedback gesendet oder eine Kontolöschung angefragt wird",
    retentionNote: "Resend verarbeitet Nachrichten und technische Zustellmetadaten in den USA. Die technischen Zustellmetadaten werden standardmäßig 30 Tage aufbewahrt.",
    officialSource: "https://resend.com/legal/privacy-policy",
    officialSourceLabel: "Datenschutz",
    retrievedAt: "2026-09-14",
  }),
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
  Object.freeze({ id: "auth_session", label: "Anmeldesitzung", purpose: "Authentifizierung", owner: "angemeldetes Konto", locations: Object.freeze(["Browser", "Supabase Auth"]), recipients: Object.freeze(["Supabase"]), export: "manueller Rechteweg; kein freigeschalteter Self-Service-Kontoexport", deleteTrigger: "Logout oder Kontolöschung", retention: RETENTION_CLASSES.PURPOSE_BOUND.id, featureFlag: "private_pilot_access", legalStatus: "AUTH_REQUIRED" }),
  Object.freeze({
    id: "blogReferenceExtractions",
    label: "Kurzlebige Vorschläge aus der Blog-Referenzerkennung",
    purpose: "kontogetrennte erneute Anzeige geprüfter Referenzvorschläge und kurzer Textfundstellen",
    owner: "angemeldetes Konto",
    locations: Object.freeze(["Supabase kd_blog_reference_extractions"]),
    recipients: Object.freeze(["Supabase"]),
    export: "serverseitiger Konto-/Rechteweg nur über account-self-service GET ?include=blog-reference-extract-v1 und die service-only RPC kd_blog_reference_extract_own_data; kd_private_own_data bleibt unverändert, nicht in der Gerätesicherung",
    deleteTrigger: "nach 24 Stunden nicht mehr abrufbar; stündlicher Purge, im normalen Schedulerbetrieb spätestens nach 25 Stunden; bei Kontolöschung zusätzlich FK-Cascade",
    retention: RETENTION_CLASSES.BLOG_REFERENCE_EXTRACTIONS.id,
    featureFlag: null,
    legalStatus: "CONTENT_PAYLOAD",
  }),
  Object.freeze({ id: "local_rollback", label: "lokale Rückholpunkte", purpose: "technischer Schutz bei lokalen Übergängen und Kontowechsel", owner: "lokales Gerät", locations: Object.freeze(["Browser"]), recipients: Object.freeze([]), export: "nicht im Backup; nur kurzfristige Sicherheitskopie", deleteTrigger: "TTL, Rücknahme oder Reset", retention: RETENTION_CLASSES.TRANSIENT_7.id, featureFlag: null, legalStatus: "LOCAL_ONLY" }),
  Object.freeze({ id: "ops_terminal", label: "terminale Betriebsdetails", purpose: "Idempotenz, Fehlerabschluss und zeitlich begrenzte Supportdiagnose", owner: "technischer Betrieb", locations: Object.freeze(["Browser", "Supabase"]), recipients: Object.freeze(["Supabase bei serverseitigen Operationen"]), export: "manueller Rechteweg soweit kontobezogen", deleteTrigger: "30-Tage-TTL-Purge", retention: RETENTION_CLASSES.OPERATIONS_30.id, featureFlag: "private_ops_aktiv", legalStatus: "NO_CONTENT_PAYLOAD" }),
  Object.freeze({ id: "ops_metadata", label: "inhaltsfreie Betriebsmetadaten", purpose: "Run-, Kosten-, Review- und Capability-Nachweis", owner: "technischer Betrieb", locations: Object.freeze(["Supabase", "GitHub Actions"]), recipients: Object.freeze(["Supabase", "GitHub"]), export: "manueller Rechteweg soweit kontobezogen", deleteTrigger: "90-Tage-TTL-Purge", retention: RETENTION_CLASSES.AUDIT_90.id, featureFlag: "private_ops_aktiv", legalStatus: "NO_CONTENT_PAYLOAD" }),
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
