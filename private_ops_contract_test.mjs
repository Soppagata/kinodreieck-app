import assert from "node:assert/strict";
import fs from "node:fs";

import { PERSONAL_DATA_ENTRIES } from "./src/lib/personalDataRegistry.js";
import {
  LEGAL_REVIEW_REQUIRED,
  PRIVATE_DATA_INVENTORY,
  PRIVATE_OPS_SCHEMA_VERSION,
  PRIVATE_PROVIDER_REGISTRY,
  RETENTION_CLASSES,
  privateOpsExportStatus,
  providerActivationDecision,
} from "./src/lib/privatePilotOps.js";
import {
  LOCAL_RETENTION_DAYS,
  LOCAL_RETENTION_KEYS,
  purgeExpiredLocalData,
} from "./src/lib/localRetention.js";
import { buildSupportBundle } from "./src/lib/supportBundle.js";
import { ERROR_CODES, BoundaryError } from "./src/services/errors.js";
import { validateOwnData } from "./src/services/accountSelfService.js";

let checks = 0;
function pass(name) {
  checks += 1;
  console.log(`✓ ${name}`);
}

function expect(name, result) {
  if (!result) throw new Error(`FEHLER: ${name}`);
  pass(name);
}

function expectBoundaryError(name, fn) {
  const thrown = (() => {
    try { fn(); return null; }
    catch (error) { return error; }
  })();
  if (!(thrown instanceof BoundaryError)) throw new Error(`FEHLER: ${name}`);
  return thrown;
}

function eqSet(actual, expected, name) {
  const a = new Set(actual);
  const b = new Set(expected);
  expect(
    name,
    a.size === b.size && [...a].every((item) => b.has(item)),
  );
}

function parseInsertRows(sql, tableName) {
  const match = sql.match(
    new RegExp(`insert into public\\.${tableName}[^]*?values([\\s\\S]*?)\\s*;`, "i"),
  );
  if (!match) throw new Error(`FEHLER: no ${tableName} insert block`);
  const body = match[1];
  const rows = [];
  const rowRe = /\(\s*'([^']+)'\s*,\s*(null|[0-9]+|'[^']*')\s*,\s*([^,]+)\s*,\s*'([^']+)'\s*\)/gi;
  let matchRow;
  while ((matchRow = rowRe.exec(body)) !== null) {
    const rawAccountColumn = String(matchRow[2]).trim();
    const accountColumn = rawAccountColumn === "null"
      ? null
      : rawAccountColumn.replace(/^'|'$/g, "");
    const action = String(matchRow[3]).trim().replace(/^'|'$/g, "");
    const retentionDays = /^-?\d+$/.test(matchRow[2]) ? Number(matchRow[2]) : rawAccountColumn === "null" ? null : null;
    rows.push({
      storageClass: matchRow[1],
      accountColumn,
      retentionDays,
      action,
      reason: matchRow[4],
    });
  }
  return rows;
}

function extractFunction(sql, name) {
  const match = sql.match(
    new RegExp(`create or replace function public\\.${name}[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$`, "i"),
  );
  if (!match) throw new Error(`FEHLER: function ${name} not found`);
  return match[1];
}

function extractTables(sql, fnName, keyword = "from") {
  const functionBody = extractFunction(sql, fnName);
  const refs = new Set();
  const regex = new RegExp(`${keyword}\\s+public\\.([a-z_0-9]+)`, "gi");
  let match;
  while ((match = regex.exec(functionBody)) !== null) {
    refs.add(match[1]);
  }
  return refs;
}

function memoryStorageFrom(entries = []) {
  const store = new Map(entries);
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const migrationSql = fs.readFileSync(
  "supabase/migrations/20260809220000_private_pilot_ops.sql",
  "utf8",
);
const accountSelfServiceSql = fs.readFileSync(
  "src/services/accountSelfService.js",
  "utf8",
);
const edgeFunctionSql = fs.readFileSync(
  "supabase/functions/account-self-service/index.ts",
  "utf8",
);

const retentionById = Object.values(RETENTION_CLASSES);
const retentionDays = new Set(retentionById.map((entry) => entry.days));
expect(
  "Private-Pilot Retention-Klassen sind vollständig und eindeutig",
  retentionById.length === 5
    && new Set(retentionById.map((entry) => entry.id)).size === retentionById.length
    && retentionDays.has(0)
    && retentionDays.has(7)
    && retentionDays.has(30)
    && retentionDays.has(90)
    && retentionDays.has(null),
);

const personalDataIds = new Set(PERSONAL_DATA_ENTRIES.map((entry) => entry.backupField));
const privateDataIds = new Set(PRIVATE_DATA_INVENTORY.map((entry) => entry.id));
const purposeBoundedIds = new Set(privateDataIds);
eqSet(
  new Set([...personalDataIds].filter((id) => privateDataIds.has(id))),
  new Set([...personalDataIds]),
  "Jedes persönliche Datenfeld ist im privaten Dateninventar erfasst",
);
expect(
  "Keine personenbezogenen Registry-Einträge sind doppelt erfasst",
  privateDataIds.size === PRIVATE_DATA_INVENTORY.length,
);

const providersById = PRIVATE_PROVIDER_REGISTRY.map((provider) => provider.id);
expect(
  "Provider-Registernamen sind eindeutig, stabil, und fail-closed standardmäßig",
  providersById.every((providerId) => /^[a-z0-9_]{2,40}$/.test(providerId))
    && providersById.length === new Set(providersById).size
    && PRIVATE_PROVIDER_REGISTRY.every((provider) => provider.enabledByDefault === false),
);

expect(
  "Provider-Fail-Closed greift bei allen bekannten Negativpfaden",
  providerActivationDecision({ featureEnabled: false }).ok === false
    && providerActivationDecision({ registryRow: { enabled: false }, featureEnabled: true }).code === "PROVIDER_REGISTRY_OFF"
    && providerActivationDecision({ registryRow: { enabled: true, legal_status: LEGAL_REVIEW_REQUIRED, legalConfirmed: false }, featureEnabled: true }).code === LEGAL_REVIEW_REQUIRED
    && providerActivationDecision({ registryRow: { enabled: true, legal_status: "APPROVED", legalConfirmed: true, retentionConfirmed: false }, featureEnabled: true }).code === "RETENTION_UNCONFIRMED"
    && providerActivationDecision({
      registryRow: {
        enabled: true,
        legal_status: "APPROVED",
        legalConfirmed: true,
        retentionConfirmed: true,
      },
      featureEnabled: true,
    }).ok === true,
);

const exportStatus = privateOpsExportStatus();
expect(
  "Private-Ops-Export bleibt schema-stabil",
  exportStatus.schemaVersion === PRIVATE_OPS_SCHEMA_VERSION
    && exportStatus.registryVersion === PRIVATE_OPS_SCHEMA_VERSION
    && exportStatus.localDataClasses.length === PERSONAL_DATA_ENTRIES.length
    && exportStatus.retentionPolicy.length === 5,
);

const retentionRows = parseInsertRows(migrationSql, "kd_private_retention_registry");
expect(
  "Migrations-Retention-Tabelle enthält die 0/7/30/90-Klassen und purpose-bound-Null",
  retentionRows.length >= 5
    && retentionRows.some((row) => row.storageClass === "raw_payload_prompt_snippet_image_export_copy")
    && retentionRows.every((row) => row.retentionDays === null || [0, 7, 30, 90].includes(row.retentionDays)),
);
const retentionDaysSet = new Set(retentionRows.map((row) => row.retentionDays));
expect(
  "Migrations-Retention-Restriktion erlaubt exakt 0/7/30/90 oder null",
  [0, 7, 30, 90].every((value) => retentionDaysSet.has(value))
    && retentionDaysSet.has(null)
    && retentionDaysSet.size <= 5,
);

expect(
  "Keine lokale Retention definiert unerwartete TTL-Werte",
  Object.values(LOCAL_RETENTION_DAYS).every((days) => [0, 7, 30].includes(days)),
);
expect(
  "Lokale Retention-Schlüssel sind vollständig abgedeckt",
  LOCAL_RETENTION_KEYS.restore === "kd:restore:vorher"
    && LOCAL_RETENTION_KEYS.takeover === "kd:acct:uebernahme:vorher"
    && LOCAL_RETENTION_KEYS.accountSnapshots === "kd:acct:snap",
);

const fixedNow = 1_759_560_000_000;
const ms = (days) => days * 24 * 60 * 60 * 1000;
const isoAt = (timestampMs) => new Date(timestampMs).toISOString();
const storage = memoryStorageFrom([
  [LOCAL_RETENTION_KEYS.restore, JSON.stringify({ t: isoAt(fixedNow - ms(7) - 1) })],
  [LOCAL_RETENTION_KEYS.takeover, JSON.stringify({ t: isoAt(fixedNow - ms(7) + 60 * 1000) })],
  [LOCAL_RETENTION_KEYS.accountSnapshots, JSON.stringify({
    old: [{ t: isoAt(fixedNow - ms(30) - 10_000) }, { t: isoAt(fixedNow - 1000) }],
    mixedType: "kaputt",
    missing: [{ foo: "bar" }],
  })],
]);
const purgeReport = purgeExpiredLocalData(storage, fixedNow);
expect(
  "Lokale Retention entfernt abgelaufene Snapshot/Restore-Einträge",
  purgeReport.removed.includes(LOCAL_RETENTION_KEYS.restore)
    && !storage.store.has(LOCAL_RETENTION_KEYS.restore)
    && storage.store.has(LOCAL_RETENTION_KEYS.takeover)
    && Array.isArray(JSON.parse(storage.store.get(LOCAL_RETENTION_KEYS.accountSnapshots)).old)
    && JSON.parse(storage.store.get(LOCAL_RETENTION_KEYS.accountSnapshots)).old.length === 1
    && purgeReport.pruned >= 1,
);
const storageInvalidJson = memoryStorageFrom([
  [LOCAL_RETENTION_KEYS.restore, JSON.stringify({ t: isoAt(fixedNow - ms(7) - 1) })],
  [LOCAL_RETENTION_KEYS.accountSnapshots, "{"],
]);
const invalidJsonReport = purgeExpiredLocalData(storageInvalidJson, fixedNow);
expect(
  "Ungültige lokale JSON-Payloads werden sauber entfernt",
  invalidJsonReport.invalidRemoved.includes(LOCAL_RETENTION_KEYS.accountSnapshots)
    && !storageInvalidJson.store.has(LOCAL_RETENTION_KEYS.accountSnapshots),
);

const safeBundle = buildSupportBundle({
  checks: [
    { id: "<script>alert(1)</script>", code: "offline" },
    { id: "a".repeat(80), code: "UNDEFINED" },
  ],
  online: false,
});
expect(
  "Support-Bundle bleibt payload- und accountsicher (Negativfälle)",
  safeBundle.privacy === "NO_PAYLOAD_NO_ACCOUNT_NO_URL_NO_STORAGE"
    && safeBundle.checks[0].id === "scriptalert1script"
    && safeBundle.checks[0].code === "OFFLINE"
    && safeBundle.checks[1].id.length <= 50
    && safeBundle.checks[1].code === "NOT_CONFIGURED",
);
const bundleText = JSON.stringify(safeBundle);
expect(
  "Support-Bundle leakt keine URL oder Sessionkontextfelder",
  !bundleText.includes("http://")
    && !bundleText.includes("https://")
    && !bundleText.includes("token")
    && !bundleText.includes("localStorage"),
);

const validOwnData = {
  ok: true,
  schemaVersion: 1,
  data: {
    auth: { createdAt: "2026-08-09T12:00:00Z", lastSignInAt: "2026-08-09T12:00:00Z", providers: [] },
    access: {},
    aiLogs: [],
    seriesWatch: [],
    sharedClaims: [],
    radar: {},
    retention: [],
    deletion: {},
  },
};
expect(
  "Eigene Daten werden bei gültiger Form nur akzeptiert und gefroren geliefert",
  (() => {
    const normalized = validateOwnData(validOwnData);
    return normalized.auth.createdAt === validOwnData.data.auth.createdAt
      && normalized.access === validOwnData.data.access
      && Object.isFrozen(normalized);
  })(),
);
const invalidOwnDataMissing = expectBoundaryError(
  "Falsche Schema-Version wird als Boundary-Fehler geworfen",
  () => validateOwnData({ ...validOwnData, schemaVersion: 2 }),
);
expect("Falsche Schema-Version wird als invalid-response abgelehnt", invalidOwnDataMissing.code === ERROR_CODES.INVALID_RESPONSE);

const invalidOwnDataFields = expectBoundaryError(
  "Unbekannte Zusatzfelder bei eigenen Daten werfen Boundary-Fehler",
  () => validateOwnData({ ...validOwnData, data: { ...validOwnData.data, unknownField: true } }),
);
expect("Unbekannte Zusatzfelder bei eigenen Daten brechen den Zugriff", invalidOwnDataFields.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataShapes = expectBoundaryError(
  "Ungültige eigene Felder bei eigenen Daten werfen Boundary-Fehler",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      aiLogs: "nicht-array",
    },
  }),
);
expect("Falsche Feldtypen bei eigenen Daten werden strikt abgelehnt", invalidOwnDataShapes.code === ERROR_CODES.INVALID_RESPONSE);

expect(
  "Account-Selbstlöschung im Service bleibt doppelt abgeschaltet",
  /accountDeleteEnabled/.test(accountSelfServiceSql)
    && /reason: \"delete-disabled\"/.test(accountSelfServiceSql),
);
expect(
  "Edge-Function für Kontolöschung hat doppelte Not-Aus-Instanzen",
  /KD_ACCOUNT_DELETE_ENABLED/.test(edgeFunctionSql)
    && /DELETE_NOT_ALLOWLISTED/.test(edgeFunctionSql)
    && /REAUTH_REQUIRED/.test(edgeFunctionSql)
    && /Deno\.env\.get\("KD_ACCOUNT_DELETE_ALLOWLIST_SHA256"\)/.test(edgeFunctionSql),
);

const privateGrantBlock = migrationSql.match(/grant execute on function public\.kd_private_provider_allowed[\s\S]*?to service_role;/i) || [];
expect(
  "Private RPCs sind nicht für Browser-Rollen ausführbar",
  privateGrantBlock.length === 1 && /to service_role;/i.test(privateGrantBlock[0])
    && !/to\s+(public|anon|authenticated)\b/i.test(privateGrantBlock[0]),
);

const deleteMapRows = parseInsertRows(migrationSql, "kd_private_delete_map");
expect(
  "Lösch-Mapping enthält alle Kern-Kontotabellen",
  new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_account_access")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_personal")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_ai_log")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_series_watch")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_shared_articles")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_shared_article_claims")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_capabilities")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_account_state")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_subscriptions")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_target_shares")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_operations")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_share_operations")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_receipts")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_reviews"),
);

const ownDataTables = extractTables(migrationSql, "kd_private_own_data", "from");
const deleteDataTables = extractTables(migrationSql, "kd_private_delete_begin", "from");
const operationDataTables = extractTables(migrationSql, "kd_private_delete_begin", "delete from");
const accountBoundTables = new Set(
  [...ownDataTables, ...deleteDataTables, ...operationDataTables]
    .filter((table) => !table.startsWith("kd_private_")),
);
const mappedTables = new Set(deleteMapRows.map((row) => row.storageClass));
const missingMapping = [...accountBoundTables].filter((table) => !mappedTables.has(table));
expect("Alle accountgebundenen Tabellen aus Own-Data + Delete-Pfad sind im Delete-Mapping erfasst", missingMapping.length === 0);

const invalidMappingRows = deleteMapRows.filter(
  (row) => (row.action === "explicit_delete" || row.action === "cascade") && row.accountColumn === null,
);
expect(
  "Explicit-delete/cascade Tabellen im Mapping haben Konto-Join-Spalte",
  invalidMappingRows.length === 0
    || invalidMappingRows.every((row) => ["browser_auth_session", "browser_account_cache"].includes(row.storageClass)),
);

const providerAllowedSql = extractFunction(migrationSql, "kd_private_provider_allowed");
const providerAllowedSqlLower = providerAllowedSql.toLowerCase();
expect(
  "Server-seitige Provider-Fail-Closed-Klausel ist strikt",
  providerAllowedSqlLower.includes("s.provider_requests_enabled")
    && providerAllowedSqlLower.includes("p.feature_enabled")
    && providerAllowedSqlLower.includes("p.rights_confirmed")
    && providerAllowedSqlLower.includes("p.dpa_transfer_confirmed")
    && providerAllowedSqlLower.includes("p.retention_confirmed")
    && providerAllowedSqlLower.includes("p.price_budget_confirmed")
    && providerAllowedSqlLower.includes("p.legal_status = 'approved'")
    && providerAllowedSqlLower.includes("provider_global_off")
    && providerAllowedSqlLower.includes("provider_allowed"),
);

console.log(`private_ops_contract_test: ${checks} Checks bestanden.`);
