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
import { createAccountSelfService, validateOwnData } from "./src/services/accountSelfService.js";
import {
  ACCOUNT_SELF_SERVICE_ERROR,
  exportReceiptMatchesAccount,
  finalizeDeletedAccountLocally,
  runCurrentAccountDeletion,
  runExportBeforeAccountDeletion,
} from "./src/controllers/accountSelfServiceController.js";

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
const radarMigrationSql = fs.readFileSync(
  "supabase/migrations/20260809180000_event_radar_local_basis.sql",
  "utf8",
);
const retentionFixSql = fs.readFileSync(
  "supabase/migrations/20260810120000_private_pilot_retention_fix.sql",
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
const privateOpsUiSql = fs.readFileSync("src/components/PrivatePilotOps.jsx", "utf8");
const privateOpsControllerSql = fs.readFileSync("src/controllers/accountSelfServiceController.js", "utf8");
const authDriverSql = fs.readFileSync("src/lib/authDriver.js", "utf8");
const etappe9Plan = fs.readFileSync("docs/ETAPPE_9_PLAN.md", "utf8");

const constraintDrops = [...`${radarMigrationSql}\n${migrationSql}`.matchAll(
  /drop constraint(?: if exists)?\s+([a-z0-9_]+)/gi,
)].map((match) => match[1]);
expect(
  "Pre-Write-Migrationen enthalten nur den ausdrücklich erlaubten kd_personal-Constraint-DROP",
  constraintDrops.length === 1 && constraintDrops[0] === "kd_personal_key_erlaubt",
);
expect(
  "Private-Ops benötigt auf dem nachweislich leeren Erstradar keine Datenbackfills",
  !/update public\.kd_radar_operations\s+set terminal_at/i.test(migrationSql)
    && !/update public\.kd_radar_share_operations\s+set terminal_at/i.test(migrationSql)
    && !/update public\.kd_radar_checks\s+set terminal_at/i.test(migrationSql)
    && !/drop constraint/i.test(migrationSql),
);
expect(
  "Orphan-Retention deaktiviert Ziele und Checks sofort anhand aktiver Abos",
  /subscription_status = 'active'/i.test(retentionFixSql)
    && /target_status = case when v_has_active_subscription then 'active' else 'retired' end/i.test(retentionFixSql)
    && /update public\.kd_radar_checks[\s\S]*?set active = false/i.test(retentionFixSql),
);
expect(
  "30-Tage-Purge verarbeitet den gesamten Zielgraph einzeln und setzt Fehlmengen fort",
  /for v_target_id in[\s\S]*?delete from public\.kd_radar_reviews[\s\S]*?delete from public\.kd_radar_targets/i.test(retentionFixSql)
    && /exception when others[\s\S]*?v_failed_targets := v_failed_targets \+ 1/i.test(retentionFixSql)
    && /current_setting\('kd\.private_retention_purge', true\) = '1'/i.test(retentionFixSql)
    && !/not exists \(select 1 from public\.kd_radar_events/i.test(retentionFixSql),
);

const accessLookupIndex = edgeFunctionSql.indexOf('.from("kd_account_access")');
const activeGateIndex = edgeFunctionSql.indexOf("if (access?.active !== true)");
const ownDataIndex = edgeFunctionSql.indexOf('rpc("kd_private_own_data"');
const deleteBeginIndex = edgeFunctionSql.indexOf('rpc("kd_private_delete_begin"');
expect(
  "Self-Service prüft Rollen-v1 exakt und vor Export wie Delete",
  accessLookupIndex >= 0
    && edgeFunctionSql.includes('.select("active")')
    && edgeFunctionSql.includes('.eq("account_id", accountId)')
    && edgeFunctionSql.includes(".maybeSingle()")
    && /if \(accessError\)[^\n]+ACCOUNT_ACCESS_UNAVAILABLE/.test(edgeFunctionSql)
    && /if \(access\?\.active !== true\)[^\n]+ACCOUNT_INACTIVE/.test(edgeFunctionSql)
    && activeGateIndex > accessLookupIndex
    && activeGateIndex < ownDataIndex
    && activeGateIndex < deleteBeginIndex,
);

const privateGate = etappe9Plan.match(
  /Vor 9c müssen laut Roadmap sauber funktionieren:\s*([\s\S]*?)\n\nAktuell noch nicht als abgeschlossen anzunehmen:/,
)?.[1] || "";
const formalGate = etappe9Plan.match(
  /Für die formale 9c bleiben:\s*([\s\S]*?)\n\nScan-\/Blog-Demomaterial ist kein 9c-Gate\./,
)?.[1] || "";
expect(
  "Filmscan und Bloganalyse bleiben dauerhaft außerhalb des 9c-/Merge-Tors",
  privateGate.length > 0
    && formalGate.length > 0
    && !/Filmscan|Bloganalyse|Scanfoto|Blogtext/i.test(privateGate)
    && !/Filmscan|Bloganalyse|Scanfoto|Blogtext/i.test(formalGate)
    && /Bloganalyse bleibt\s+Zukunft und ist ausdrücklich kein 9c-, Merge- oder Staging-Gate\./.test(etappe9Plan)
    && /Der externe Foto-\/Textbatch ist der dauerhafte Scan-Ersatz/.test(etappe9Plan),
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
expect(
  "Jede Datenklasse besitzt Zweck, Ort, Empfänger, Export, Löschtrigger und Retention",
  PRIVATE_DATA_INVENTORY.every((entry) => entry.id && entry.label && entry.purpose && entry.owner
    && Array.isArray(entry.locations) && Array.isArray(entry.recipients) && entry.export
    && entry.deleteTrigger && Object.values(RETENTION_CLASSES).some((item) => item.id === entry.retention)),
);

const providersById = PRIVATE_PROVIDER_REGISTRY.map((provider) => provider.id);
expect(
  "Provider-Registernamen sind eindeutig, stabil, und fail-closed standardmäßig",
  providersById.every((providerId) => /^[a-z0-9_]{2,40}$/.test(providerId))
    && providersById.length === new Set(providersById).size
    && PRIVATE_PROVIDER_REGISTRY.every((provider) => provider.enabledByDefault === false
      && provider.legalStatus === LEGAL_REVIEW_REQUIRED
      && provider.retentionConfirmed === false
      && /^https:\/\//.test(provider.officialSource)
      && /^\d{4}-\d{2}-\d{2}$/.test(provider.retrievedAt)),
);

expect(
  "Provider-Fail-Closed greift bei allen bekannten Negativpfaden",
  providerActivationDecision({ featureEnabled: false }).ok === false
    && providerActivationDecision({ registryRow: { enabled: false }, featureEnabled: true }).code === "PROVIDER_REGISTRY_OFF"
    && providerActivationDecision({ registryRow: { enabled: true, legal_status: LEGAL_REVIEW_REQUIRED, legalConfirmed: false }, featureEnabled: true }).code === LEGAL_REVIEW_REQUIRED
    && providerActivationDecision({ registryRow: { enabled: true, legal_status: "APPROVED", legalConfirmed: true, rightsConfirmed: false }, featureEnabled: true }).code === "RIGHTS_UNCONFIRMED"
    && providerActivationDecision({ registryRow: { enabled: true, legal_status: "APPROVED", legalConfirmed: true, rightsConfirmed: true, dpaTransferConfirmed: false }, featureEnabled: true }).code === "DPA_TRANSFER_UNCONFIRMED"
    && providerActivationDecision({ registryRow: { enabled: true, legal_status: "APPROVED", legalConfirmed: true, rightsConfirmed: true, dpaTransferConfirmed: true, retentionConfirmed: false }, featureEnabled: true }).code === "RETENTION_UNCONFIRMED"
    && providerActivationDecision({ registryRow: { enabled: true, legal_status: "APPROVED", legalConfirmed: true, rightsConfirmed: true, dpaTransferConfirmed: true, retentionConfirmed: true, priceBudgetConfirmed: false }, featureEnabled: true }).code === "BUDGET_UNKNOWN"
    && providerActivationDecision({ registryRow: { enabled: true, legal_status: "APPROVED", legalConfirmed: true, rightsConfirmed: true, dpaTransferConfirmed: true, retentionConfirmed: true, priceBudgetConfirmed: true, reviewedAt: "2025-01-01" }, featureEnabled: true, now: Date.parse("2026-08-09") }).code === "PROVIDER_REVIEW_STALE"
    && providerActivationDecision({
      registryRow: {
        enabled: true,
        legal_status: "APPROVED",
        legalConfirmed: true,
        rightsConfirmed: true,
        dpaTransferConfirmed: true,
        retentionConfirmed: true,
        priceBudgetConfirmed: true,
        reviewedAt: "2026-08-09",
      },
      featureEnabled: true,
      now: Date.parse("2026-08-09"),
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
  "Alle lokalen Rohsnapshots besitzen exakt sieben Tage TTL",
  Object.values(LOCAL_RETENTION_DAYS).every((days) => days === 7),
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
  [LOCAL_RETENTION_KEYS.takeover, JSON.stringify({ t: isoAt(fixedNow + 60 * 1000) })],
  [LOCAL_RETENTION_KEYS.accountSnapshots, JSON.stringify({
    old: [{ t: isoAt(fixedNow - ms(7) - 10_000) }, { t: isoAt(fixedNow - 1000) }, { t: isoAt(fixedNow + 1000) }],
    mixedType: "kaputt",
    missing: [{ foo: "bar" }],
  })],
]);
const purgeReport = purgeExpiredLocalData(storage, fixedNow);
expect(
  "Lokale Retention entfernt abgelaufene Snapshot/Restore-Einträge",
  purgeReport.removed.includes(LOCAL_RETENTION_KEYS.restore)
    && !storage.store.has(LOCAL_RETENTION_KEYS.restore)
    && !storage.store.has(LOCAL_RETENTION_KEYS.takeover)
    && Array.isArray(JSON.parse(storage.store.get(LOCAL_RETENTION_KEYS.accountSnapshots)).old)
    && JSON.parse(storage.store.get(LOCAL_RETENTION_KEYS.accountSnapshots)).old.length === 1
    && purgeReport.pruned >= 1,
);
expect("Lokale Retention verwirft Zukunftszeitstempel fail-closed", purgeReport.removed.includes(LOCAL_RETENTION_KEYS.takeover));
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
    access: { role: "member", active: true, personal_ai: false, created_at: "2026-08-09T12:00:00Z", updated_at: "2026-08-09T12:00:00Z" },
    personal: [],
    aiLogs: [],
    seriesWatch: [],
    sharedArticles: [],
    sharedClaims: [],
    radar: { capabilities: null, accountState: null, subscriptions: [], receipts: [], shares: [], operations: [], shareOperations: [], reviews: [] },
    retention: [],
    deletion: { enabled: false, lastStatus: null },
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
const invalidNestedOwnData = expectBoundaryError(
  "Unbekannte verschachtelte Exportfelder werfen Boundary-Fehler",
  () => validateOwnData({ ...validOwnData, data: { ...validOwnData.data, radar: { ...validOwnData.data.radar, accountId: "leak" } } }),
);
expect("Verschachtelte Eigendaten-Allowlist ist exakt", invalidNestedOwnData.code === ERROR_CODES.INVALID_RESPONSE);

let disabledFetchCalls = 0;
const disabledSelfService = createAccountSelfService({
  config: {
    supabaseUrl: "https://private-ops-test.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
    accountSelfServiceEndpointName: "account-self-service",
    privateSelfServiceEnabled: false,
    accountDeleteEnabled: false,
  },
  tokenLoader: async () => "synthetic-user-token",
  fetchImpl: async () => { disabledFetchCalls += 1; throw new Error("must-not-fetch"); },
});
await assert.rejects(() => disabledSelfService.getOwnData(), (error) => error instanceof BoundaryError && error.code === ERROR_CODES.FORBIDDEN);
await assert.rejects(() => disabledSelfService.deleteCurrentAccount({ operationId: "11111111-2222-4333-8444-555555555555", confirmation: "DELETE test@example.invalid" }), (error) => error instanceof BoundaryError && error.code === ERROR_CODES.FORBIDDEN);
expect("Own-Data und Self-Delete bleiben bei Runtime-Not-Aus ohne Netzaufruf", disabledFetchCalls === 0);

const requestLog = [];
const enabledSelfService = createAccountSelfService({
  config: {
    supabaseUrl: "https://private-ops-test.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
    accountSelfServiceEndpointName: "account-self-service",
    privateSelfServiceEnabled: true,
    accountDeleteEnabled: true,
  },
  tokenLoader: async () => "synthetic-user-token",
  fetchImpl: async (url, init) => {
    requestLog.push({ url, init });
    if (init.method === "GET") return { ok: true, status: 200, json: async () => validOwnData };
    const body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, deleted: true, operationId: body.operationId }) };
  },
});
await enabledSelfService.getOwnData();
const deleteOperationId = "11111111-2222-4333-8444-555555555555";
await enabledSelfService.deleteCurrentAccount({ operationId: deleteOperationId, confirmation: "DELETE test@example.invalid" });
const deleteRequestBody = JSON.parse(requestLog[1].init.body);
expect(
  "Self-Service sendet nur aktuelles Bearer-Token und keine Account-ID im Requestkörper",
  requestLog.length === 2
    && requestLog.every((entry) => entry.url.endsWith("/functions/v1/account-self-service"))
    && requestLog[0].init.method === "GET"
    && requestLog[0].init.body === undefined
    && requestLog[1].init.method === "POST"
    && JSON.stringify(deleteRequestBody) === JSON.stringify({ action: "delete", operationId: deleteOperationId, confirmation: "DELETE test@example.invalid" })
    && !Object.hasOwn(deleteRequestBody, "accountId"),
);

const deletionAccount = { accountId: "11111111-2222-4333-8444-555555555555", accountEmail: "test@example.invalid" };
let currentDeletionKey = JSON.stringify([deletionAccount.accountId, deletionAccount.accountEmail]);
const exportReceipt = await runExportBeforeAccountDeletion({
  account: deletionAccount,
  exportPersonalData: async () => true,
  readCurrentAccountKey: () => currentDeletionKey,
  now: () => 1_759_560_000_000,
});
expect("Exportbeleg ist ausschließlich an das aktuelle Konto gebunden", exportReceiptMatchesAccount(exportReceipt, deletionAccount));

const deletionOrder = [];
const deletionResult = await runCurrentAccountDeletion({
  account: deletionAccount,
  exportReceipt,
  password: "synthetic-password",
  confirmation: "DELETE test@example.invalid",
  reauthenticate: async () => { deletionOrder.push("reauth"); },
  deleteRemote: async () => { deletionOrder.push("remote"); },
  finalizeLocal: async () => { deletionOrder.push("local"); },
  createOperationId: () => deleteOperationId,
  readCurrentAccountKey: () => currentDeletionKey,
});
expect(
  "Self-Delete erzwingt Export, Reauth, Serverdelete und lokale Trennung in dieser Reihenfolge",
  deletionResult.serverDeleted === true && deletionOrder.join(",") === "reauth,remote,local",
);

let remoteCalledWithoutExport = false;
await assert.rejects(
  () => runCurrentAccountDeletion({
    account: deletionAccount,
    exportReceipt: null,
    password: "synthetic-password",
    confirmation: "DELETE test@example.invalid",
    reauthenticate: async () => {},
    deleteRemote: async () => { remoteCalledWithoutExport = true; },
    finalizeLocal: async () => {},
    readCurrentAccountKey: () => currentDeletionKey,
  }),
  (error) => error?.code === ACCOUNT_SELF_SERVICE_ERROR.EXPORT_REQUIRED,
);
expect("Fehlender Exportbeleg stoppt vor dem Serverdelete", remoteCalledWithoutExport === false);

let localCalledAfterAccountSwitch = false;
currentDeletionKey = JSON.stringify([deletionAccount.accountId, deletionAccount.accountEmail]);
await assert.rejects(
  () => runCurrentAccountDeletion({
    account: deletionAccount,
    exportReceipt,
    password: "synthetic-password",
    confirmation: "DELETE test@example.invalid",
    reauthenticate: async () => {},
    deleteRemote: async () => { currentDeletionKey = JSON.stringify(["22222222-2222-4222-8222-222222222222", "other@example.invalid"]); },
    finalizeLocal: async () => { localCalledAfterAccountSwitch = true; },
    createOperationId: () => deleteOperationId,
    readCurrentAccountKey: () => currentDeletionKey,
  }),
  (error) => error?.code === ACCOUNT_SELF_SERVICE_ERROR.LOCAL_FINALIZATION_FAILED && error?.serverDeleted === true,
);
expect("Kontowechsel nach Servererfolg löscht keine fremde lokale Sitzung", localCalledAfterAccountSwitch === false);
await assert.rejects(
  () => finalizeDeletedAccountLocally(async () => { throw new Error("synthetic-local-failure"); }),
  (error) => error?.code === ACCOUNT_SELF_SERVICE_ERROR.LOCAL_FINALIZATION_FAILED && error?.serverDeleted === true,
);
currentDeletionKey = JSON.stringify([deletionAccount.accountId, deletionAccount.accountEmail]);

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
expect(
  "Self-Delete-UI erzwingt Export, frische Passwortbestätigung und lokale Trennung erst nach Servererfolg",
  privateOpsUiSql.includes("runExportBeforeAccountDeletion")
    && privateOpsUiSql.includes("runCurrentAccountDeletion")
    && privateOpsUiSql.includes("!serverExportDone")
    && privateOpsUiSql.includes("localFinalizationPending")
    && privateOpsControllerSql.indexOf("await reauthenticate(password)") < privateOpsControllerSql.indexOf("await deleteRemote")
    && privateOpsControllerSql.indexOf("await deleteRemote") < privateOpsControllerSql.indexOf("await finalizeLocal()")
    && authDriverSql.includes("async function reauthenticate(passwort)"),
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
const exportRequired = deleteMapRows
  .filter((row) => row.accountColumn && !["auth.users", "browser_auth_session", "browser_account_cache"].includes(row.storageClass))
  .map((row) => row.storageClass);
expect(
  "Eigendatenexport enthält jede serverseitige accountgebundene Löschklasse",
  exportRequired.every((table) => ownDataTables.has(table)),
);

const invalidMappingRows = deleteMapRows.filter(
  (row) => (row.action === "explicit_delete" || row.action === "cascade") && row.accountColumn === null,
);
expect(
  "Explicit-delete/cascade Tabellen im Mapping haben Konto-Join-Spalte",
  invalidMappingRows.length === 0
    || invalidMappingRows.every((row) => ["browser_auth_session", "browser_account_cache"].includes(row.storageClass)),
);
expect(
  "Self-Delete löscht Auth zuerst und stützt alle Projektionen auf Cascade",
  /foreign key \(account_id\) references auth\.users\(id\) on delete cascade/i.test(`${radarMigrationSql}\n${migrationSql}`)
    && /foreign key \(actor_id\) references auth\.users\(id\) on delete cascade/i.test(`${radarMigrationSql}\n${migrationSql}`)
    && !/delete from public\.kd_personal/i.test(extractFunction(migrationSql, "kd_private_delete_begin"))
    && edgeFunctionSql.indexOf("admin.auth.admin.deleteUser") < edgeFunctionSql.indexOf('rpc("kd_private_delete_finish"'),
);
expect(
  "Remote-Retention markiert Terminalzustände und beendet widerrufene Zwecke",
  /create trigger kd_radar_operations_private_ttl/i.test(migrationSql)
    && /create trigger kd_radar_checks_private_ttl/i.test(migrationSql)
    && /create trigger kd_radar_subscriptions_private_orphan/i.test(migrationSql)
    && /delete from public\.kd_radar_target_shares[\s\S]+p_share_enabled/i.test(radarMigrationSql)
    && /delete from public\.kd_radar_receipts/i.test(radarMigrationSql),
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
