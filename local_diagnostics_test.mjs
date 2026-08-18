import assert from "node:assert/strict";
import {
  LOCAL_DIAGNOSTICS_ENABLED_KEY,
  LOCAL_DIAGNOSTICS_KEY,
  LOCAL_DIAGNOSTICS_MAX_ENTRIES,
  LOCAL_DIAGNOSTICS_TTL_MS,
  clearLocalDiagnostics,
  createDiagnosticReference,
  createLocalDiagnosticEnvelope,
  localDiagnosticsEnabled,
  purgeLocalDiagnostics,
  readLocalDiagnostics,
  recordLocalDiagnostic,
  sanitizeLocalDiagnosticEntries,
  sendLocalDiagnosticsOnce,
  setLocalDiagnosticsEnabled,
  validateLocalDiagnosticEnvelope,
} from "./src/lib/localDiagnostics.js";
import { buildSupportBundle } from "./src/lib/supportBundle.js";
import { PRIVATE_DATA_INVENTORY, RETENTION_CLASSES } from "./src/lib/privatePilotOps.js";
import { PERSONAL_DATA_KEYS } from "./src/lib/personalDataRegistry.js";

let checks = 0;
function check(name, condition) {
  checks += 1;
  assert.ok(condition, name);
  console.log(`✓ ${name}`);
}

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const NOW = Date.parse("2026-08-18T12:00:00.000Z");
const BASE_OPTIONS = {
  now: NOW,
  config: { buildVersion: "test-build", appEnvironment: "local" },
  navigatorObject: { userAgent: "Mozilla/5.0 (iPhone)", onLine: true },
  locationObject: { protocol: "https:" },
  matchMedia: () => ({ matches: false }),
  cryptoObject: { randomUUID: () => "01234567-89ab-cdef-0123-456789abcdef" },
};
const SAFE_INPUT = {
  code: "UI_RENDER_CRASH",
  source: "APP_ERROR_BOUNDARY",
  operation: "RENDER",
  reference: "KD-DIAG-0123456789ABCDEF",
};
const envelope = createLocalDiagnosticEnvelope(SAFE_INPUT, BASE_OPTIONS);
const envelopeKeys = [
  "version", "code", "source", "operation", "buildVersion", "environment",
  "platformClass", "runtimeMode", "online", "timestamp", "reference", "count",
];

check("Diagnosereferenz bleibt zufällig, accountfrei und formstabil",
  createDiagnosticReference(BASE_OPTIONS) === "KD-DIAG-0123456789ABCDEF");
check("Allowlist erzeugt exakt das kleine strukturierte Diagnose-Envelope",
  validateLocalDiagnosticEnvelope(envelope)
    && JSON.stringify(Object.keys(envelope)) === JSON.stringify(envelopeKeys)
    && envelope.platformClass === "mobile");
const verboteneFelder = {
  message: "CANARY_FREE_TEXT",
  stack: "CANARY_STACK",
  cause: "CANARY_CAUSE",
  url: "https://canary.invalid/private",
  title: "CANARY_TITLE",
  rating: "CANARY_RATING",
  note: "CANARY_NOTE",
  name: "CANARY_NAME",
  email: "canary@example.invalid",
  accountId: "CANARY_ACCOUNT",
  storageContents: "CANARY_STORAGE",
};
for (const [field, value] of Object.entries(verboteneFelder)) {
  check("Rohfehler, Identität und unbekannte Codes werden fail-closed abgewiesen",
    createLocalDiagnosticEnvelope({ ...SAFE_INPUT, [field]: value }, BASE_OPTIONS) === null);
}
check("Unbekannter Diagnosecode wird fail-closed abgewiesen",
  createLocalDiagnosticEnvelope({ ...SAFE_INPUT, code: "UNKNOWN" }, BASE_OPTIONS) === null);

const storage = memoryStorage();
check("Lokale Diagnose ist ohne Owner und Opt-in standardmäßig aus",
  !localDiagnosticsEnabled({ storage, ownerConfirmed: false })
    && recordLocalDiagnostic(SAFE_INPUT, { ...BASE_OPTIONS, storage, ownerConfirmed: true }) === null
    && !storage.values.has(LOCAL_DIAGNOSTICS_KEY));
check("Nur bestätigter Owner kann das lokale Opt-in setzen",
  !setLocalDiagnosticsEnabled(true, { storage, ownerConfirmed: false })
    && setLocalDiagnosticsEnabled(true, { storage, ownerConfirmed: true })
    && storage.values.get(LOCAL_DIAGNOSTICS_ENABLED_KEY) === "1");
const first = recordLocalDiagnostic(SAFE_INPUT, { ...BASE_OPTIONS, storage, ownerConfirmed: true });
const second = recordLocalDiagnostic(SAFE_INPUT, {
  ...BASE_OPTIONS, now: NOW + 60_000, storage, ownerConfirmed: true,
});
check("Recorder speichert nur das sichere Envelope und dedupliziert 15 Minuten",
  first?.count === 1 && second?.count === 2
    && readLocalDiagnostics({ storage, ownerConfirmed: true, now: NOW + 60_000 }).length === 1
    && !storage.values.get(LOCAL_DIAGNOSTICS_KEY).includes("CANARY"));
check("Nicht-Owner kann Diagnose weder lesen noch löschen",
  readLocalDiagnostics({ storage, ownerConfirmed: false, now: NOW }).length === 0
    && !clearLocalDiagnostics({ storage, ownerConfirmed: false })
    && storage.values.has(LOCAL_DIAGNOSTICS_KEY));

const expired = { ...envelope, timestamp: new Date(NOW - LOCAL_DIAGNOSTICS_TTL_MS).toISOString() };
check("Sanitizer verwirft abgelaufene, zusätzliche und falsch typisierte Einträge",
  sanitizeLocalDiagnosticEntries([
    envelope, expired, { ...envelope, message: "CANARY" }, { ...envelope, online: "true" },
  ], { now: NOW }).length === 1);
const corruptStorage = memoryStorage([[LOCAL_DIAGNOSTICS_KEY, "{"]]);
check("Beschädigter lokaler Bestand wird fail-closed entfernt",
  purgeLocalDiagnostics({ storage: corruptStorage, now: NOW }).entries.length === 0
    && !corruptStorage.values.has(LOCAL_DIAGNOSTICS_KEY));

const many = Array.from({ length: LOCAL_DIAGNOSTICS_MAX_ENTRIES + 4 }, (_, index) => ({
  ...envelope,
  timestamp: new Date(NOW - (LOCAL_DIAGNOSTICS_MAX_ENTRIES + 4 - index) * 1000).toISOString(),
  reference: `KD-DIAG-${index.toString(16).padStart(16, "0").toUpperCase()}`,
}));
check("Diagnoseexport bleibt auf höchstens 20 frische Einträge begrenzt",
  sanitizeLocalDiagnosticEntries(many, { now: NOW }).length === LOCAL_DIAGNOSTICS_MAX_ENTRIES);

const support = buildSupportBundle({
  diagnostics: [envelope, ...Object.entries(verboteneFelder)
    .map(([field, value]) => ({ ...envelope, [field]: value }))],
  checks: [{ id: "browser", code: "OK", message: "CANARY_CHECK" }],
  now: NOW,
  accountId: "CANARY_ACCOUNT",
});
const supportText = JSON.stringify(support);
check("Supportpaket exportiert ausschließlich erneut validierte Allowlistfelder",
  support.version === 2 && support.diagnostics.length === 1
    && JSON.stringify(Object.keys(support.diagnostics[0])) === JSON.stringify(envelopeKeys));
check("Supportpaket enthält keine Rohfehler, Freitexte oder Identitäten",
  ![...Object.values(verboteneFelder), "CANARY_CHECK"].some((value) => supportText.includes(value)));

let transportCalls = 0;
const transport = async () => { transportCalls += 1; };
for (const gates of [
  { ownerConfirmed: false, serverCapabilityConfirmed: true, featureFlagEnabled: true, transport },
  { ownerConfirmed: true, serverCapabilityConfirmed: false, featureFlagEnabled: true, transport },
  { ownerConfirmed: true, serverCapabilityConfirmed: true, featureFlagEnabled: false, transport },
  { ownerConfirmed: true, serverCapabilityConfirmed: true, featureFlagEnabled: true, transport: null },
]) {
  const result = await sendLocalDiagnosticsOnce({ ...gates, diagnostics: [envelope], now: NOW });
  check("Jedes fehlende Owner-/Capability-/Flag-/Adaptergate stoppt vor Transport",
    result.status === "disabled" && transportCalls === 0);
}
let sentPayload = null;
const sent = await sendLocalDiagnosticsOnce({
  ownerConfirmed: true,
  serverCapabilityConfirmed: true,
  featureFlagEnabled: true,
  diagnostics: [envelope, { ...envelope, stack: "CANARY_STACK" }],
  transport: async (payload) => { transportCalls += 1; sentPayload = payload; },
  now: NOW,
});
check("Vollständig freigegebener injizierter Transport läuft genau einmal",
  sent.status === "sent" && sent.sent && sent.count === 1 && transportCalls === 1);
check("Transportpayload ist accountfrei, allowlistet und ohne Provider-/Mailvertrag",
  sentPayload?.format === "kinodreieck-diagnostic-ingest"
    && sentPayload.diagnostics.length === 1
    && !JSON.stringify(sentPayload).includes("CANARY_STACK")
    && !Object.keys(sentPayload).some((key) => /account|email|endpoint|mail/i.test(key)));
let failedCalls = 0;
const failed = await sendLocalDiagnosticsOnce({
  ownerConfirmed: true,
  serverCapabilityConfirmed: true,
  featureFlagEnabled: true,
  diagnostics: [envelope],
  transport: async () => { failedCalls += 1; throw new Error("CANARY_PROVIDER_ERROR"); },
  now: NOW,
});
check("Transportfehler bleibt terminal und startet keinen Retry",
  failed.status === "failed" && !failed.sent && failedCalls === 1);

const registryEntry = PRIVATE_DATA_INVENTORY.find((entry) => entry.id === "local_diagnostics");
check("Datenschutzregister führt Diagnose lokal, empfängerlos und mit 7-Tage-TTL",
  registryEntry?.retention === RETENTION_CLASSES.TRANSIENT_7.id
    && JSON.stringify(registryEntry.locations) === JSON.stringify(["Browser"])
    && registryEntry.recipients.length === 0);
check("Diagnosepuffer und Opt-in bleiben außerhalb Sync und Gesamtbackup",
  !PERSONAL_DATA_KEYS.includes(LOCAL_DIAGNOSTICS_KEY)
    && !PERSONAL_DATA_KEYS.includes(LOCAL_DIAGNOSTICS_ENABLED_KEY));

console.log(`local_diagnostics_test: ${checks} Checks bestanden.`);
