import assert from "node:assert/strict";
import crypto from "node:crypto";
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

function gitBlobId(value) {
  const bytes = Buffer.from(value, "utf8");
  return crypto.createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function stripSqlComments(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ");
}

function compactSql(value) {
  return stripSqlComments(value).toLowerCase().replace(/\s+/g, " ").trim();
}

const EXPECTED_PILOT_IMPORT_CONSTRAINTS = [
  "kd_radar_pilot_import_operations_actor_id_fkey:f:false:false:true:true:foreignkey(actor_id)referencesauth.users(id)ondeletecascade",
  "kd_radar_pilot_import_operations_pkey:p:false:false:true:true:primarykey(actor_id,operation_id)",
  "kd_radar_pilot_import_operations_request_hash_check:c:false:false:true:false:check(request_hash~'^[a-f0-9]{32}$')",
  "kd_radar_pilot_import_operations_result_check:c:false:false:true:false:check(jsonb_typeof(result)='object')",
];

function sqlStringLiterals(value) {
  return [...value.matchAll(/'((?:''|[^'])*)'/g)]
    .map((match) => match[1].replace(/''/g, "'"));
}

function hasExactPilotImportConstraintPreflight(value) {
  const start = value.search(/do \$\$/i);
  const end = value.search(/alter table public\.kd_radar_pilot_import_operations/i);
  if (start < 0 || end <= start) return false;

  const preflight = value.slice(start, end);
  const executable = compactSql(preflight);
  const denseExecutable = stripSqlComments(preflight).toLowerCase().replace(/\s+/g, "");
  const expectedArray = preflight.match(
    /if v_constraints is distinct from array\[([\s\S]*?)\]::text\[\]\s+then/i,
  );
  if (!expectedArray) return false;

  const actualConstraints = sqlStringLiterals(expectedArray[1]);
  return actualConstraints.length === EXPECTED_PILOT_IMPORT_CONSTRAINTS.length
    && actualConstraints.every(
      (constraint, index) => constraint === EXPECTED_PILOT_IMPORT_CONSTRAINTS[index],
    )
    && denseExecutable.includes(
      "array_agg(format('%s:%s:%s:%s:%s:%s:%s',pc.conname,pc.contype,pc.condeferrable,pc.condeferred,pc.convalidated,pc.connoinherit,regexp_replace(replace(lower(pg_get_constraintdef(pc.oid,true)),'::text',''),'[[:space:]]+','','g'))orderbypc.conname)",
    )
    && denseExecutable.includes(
      ")intov_constraintsfrompg_catalog.pg_constraintpcwherepc.conrelid=v_table",
    )
    && !/\blike\b/.test(executable);
}

function findBalancedEnd(source, openAt) {
  let depth = 0;
  let quoted = false;
  for (let index = openAt; index < source.length; index++) {
    const char = source[index];
    if (char === "'") {
      if (quoted && source[index + 1] === "'") index += 1;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")" && --depth === 0) return index;
  }
  return -1;
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "'") {
      if (quoted && value[index + 1] === "'") index += 1;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function callArguments(source, callName) {
  const found = [];
  const regex = new RegExp(`\\b${callName}\\s*\\(`, "ig");
  for (const match of source.matchAll(regex)) {
    const openAt = source.indexOf("(", match.index);
    const closeAt = findBalancedEnd(source, openAt);
    if (closeAt < 0) throw new Error(`FEHLER: unvollständiger ${callName}-Aufruf`);
    found.push(source.slice(openAt + 1, closeAt));
  }
  return found;
}

function jsonObjectKeySets(source) {
  return callArguments(source, "jsonb_build_object").map((argumentsSql) => {
    const args = splitTopLevel(argumentsSql);
    if (args.length % 2 !== 0) throw new Error("FEHLER: ungerader jsonb_build_object-Aufruf");
    const keys = [];
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index].match(/^'([^']+)'(?:::text)?$/i)?.[1];
      if (key) keys.push(key);
    }
    return keys;
  });
}

function hasExactKeySet(keySets, expected) {
  const wanted = new Set(expected);
  return keySets.some((keys) => keys.length === wanted.size
    && keys.every((key) => wanted.has(key)));
}

function parseInsertRows(sql, tableName) {
  const insert = new RegExp(`insert into public\\.${tableName}\\b`, "i").exec(sql);
  if (!insert) throw new Error(`FEHLER: no ${tableName} insert block`);
  const values = /\bvalues\b/i.exec(sql.slice(insert.index));
  if (!values) throw new Error(`FEHLER: no ${tableName} values block`);
  const bodyStart = insert.index + values.index + values[0].length;
  let bodyEnd = -1;
  let quoted = false;
  for (let index = bodyStart; index < sql.length; index++) {
    const char = sql[index];
    if (char === "'") {
      if (quoted && sql[index + 1] === "'") index += 1;
      else quoted = !quoted;
      continue;
    }
    if (!quoted && char === ";") {
      bodyEnd = index;
      break;
    }
  }
  if (bodyEnd < 0) throw new Error(`FEHLER: incomplete ${tableName} insert block`);
  const body = sql.slice(bodyStart, bodyEnd);
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
const pilotMigrationSql = fs.readFileSync(
  "supabase/migrations/20260814120000_radar_max_manual_pilot.sql",
  "utf8",
);
const compatMigrationPath = "supabase/migrations/20260815120000_private_export_radar_pilot_compat.sql";
const compatMigrationSql = fs.readFileSync(compatMigrationPath, "utf8");
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

const migrationFiles = fs.readdirSync("supabase/migrations")
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const compatMigrationName = compatMigrationPath.split("/").at(-1);
const compatExecutable = compactSql(compatMigrationSql);

expect(
  "Historische Private-Ops-Migration besitzt wieder exakt ihre belegte Blob-Identität",
  gitBlobId(migrationSql) === "2143d36957f5be56e9973e15584d02769b9c4222",
);
expect(
  "Forward-Migration existiert genau einmal und folgt lexikografisch auf den Radar-Max-Pilot",
  migrationFiles.filter((name) => name === compatMigrationName).length === 1
    && migrationFiles.indexOf(compatMigrationName)
      === migrationFiles.indexOf("20260814120000_radar_max_manual_pilot.sql") + 1,
);
expect(
  "Forward-Migration ist atomar, additiv und enthält keine destruktiven Radar-Operationen",
  /^begin\s*;/.test(compatExecutable)
    && /commit\s*;$/.test(compatExecutable)
    && !/\b(?:drop|truncate)\s+(?:table\s+)?public\.kd_radar_/.test(compatExecutable),
);

const constraintDrops = [...`${radarMigrationSql}\n${migrationSql}\n${retentionFixSql}\n${pilotMigrationSql}\n${compatMigrationSql}`.matchAll(
  /drop constraint(?: if exists)?\s+([a-z0-9_]+)/gi,
)].map((match) => match[1]);
expect(
  "Pre-Write-Migrationen enthalten nur den ausdrücklich erlaubten kd_personal-Constraint-DROP",
  constraintDrops.length === 1 && constraintDrops[0] === "kd_personal_key_erlaubt",
);
expect(
  "Private-Ops benötigt auf dem nachweislich leeren Erstradar keine Datenbackfills",
  !/update public\.kd_radar_operations\s+set terminal_at/i.test(`${migrationSql}\n${compatMigrationSql}`)
    && !/update public\.kd_radar_share_operations\s+set terminal_at/i.test(`${migrationSql}\n${compatMigrationSql}`)
    && !/update public\.kd_radar_checks\s+set terminal_at/i.test(`${migrationSql}\n${compatMigrationSql}`)
    && !/update public\.kd_radar_pilot_import_operations/i.test(compatMigrationSql)
    && !/drop constraint/i.test(`${migrationSql}\n${compatMigrationSql}`),
);
expect(
  "Orphan-Retention deaktiviert Ziele und Checks sofort anhand aktiver Abos",
  /subscription_status = 'active'/i.test(compatMigrationSql)
    && /target_status = case when v_has_active_subscription then 'active' else 'retired' end/i.test(retentionFixSql)
    && /update public\.kd_radar_checks[\s\S]*?set active = false/i.test(retentionFixSql),
);
expect(
  "30-Tage-Purge verarbeitet den gesamten Zielgraph einzeln und setzt Fehlmengen fort",
  /for v_target_id in[\s\S]*?delete from public\.kd_radar_reviews[\s\S]*?delete from public\.kd_radar_targets/i.test(compatMigrationSql)
    && /exception when others[\s\S]*?v_failed_targets := v_failed_targets \+ 1/i.test(compatMigrationSql)
    && /set_config\('kd\.private_retention_purge', '1', true\)/i.test(compatMigrationSql)
    && /set_config\('kd\.private_retention_purge', '0', true\)/i.test(compatMigrationSql)
    && !/not exists \(select 1 from public\.kd_radar_events/i.test(compatMigrationSql),
);

const privateSettingsColumns = migrationSql.match(
  /create table public\.kd_private_settings\s*\(([\s\S]*?)\n\);/i,
)?.[1] || "";
expect(
  "Export-Not-Aus wird nur vorwärts addiert, startet false und aktiviert keine Daten",
  [...privateSettingsColumns.matchAll(/\bexport_enabled\b/gi)].length === 0
    && (compatMigrationSql.match(/alter table public\.kd_private_settings\s+add column export_enabled boolean not null default false\s*;/gi) || []).length === 1
    && (compatExecutable.match(/\bexport_enabled\b/g) || []).length === 1,
);

const radarPreflightStart = compatMigrationSql.search(/do \$\$/i);
const radarFirstAlter = compatMigrationSql.search(/alter table public\.kd_radar_pilot_import_operations/i);
const requiredPreflightMarkers = [
  "to_regclass('public.kd_radar_pilot_import_operations')",
  "kd_radar_pilot_import_operations_missing",
  "kd_radar_pilot_import_operations_schema_drift",
  "kd_radar_pilot_import_operations_rls_drift",
  "kd_radar_pilot_import_operations_constraint_drift",
  "select count(*) from public.kd_radar_pilot_import_operations",
  "kd_radar_pilot_import_operations_not_empty",
];
expect(
  "Schema-/Leerheitszaun steht vollständig vor jeder Anpassung der Pilot-Operationen",
  radarPreflightStart >= 0
    && radarFirstAlter > radarPreflightStart
    && requiredPreflightMarkers.every((marker) => {
      const index = compatMigrationSql.indexOf(marker, radarPreflightStart);
      return index > radarPreflightStart && index < radarFirstAlter;
    })
    && /if v_row_count <> 0 then/i.test(compatMigrationSql.slice(radarPreflightStart, radarFirstAlter))
    && hasExactPilotImportConstraintPreflight(compatMigrationSql),
);
const requestOrTrueMutation = compatMigrationSql.replace(
  "check(request_hash~''^[a-f0-9]{32}$'')",
  "check((request_hash~''^[a-f0-9]{32}$'')ortrue)",
);
expect(
  "Exakter Schemazaun verwirft request_hash OR true als Constraint-Drift",
  requestOrTrueMutation !== compatMigrationSql
    && !hasExactPilotImportConstraintPreflight(requestOrTrueMutation),
);
const resultNotObjectMutation = compatMigrationSql.replace(
  "check(jsonb_typeof(result)=''object'')",
  "check(jsonb_typeof(result)<>''object'')",
);
expect(
  "Exakter Schemazaun verwirft result ungleich object als Constraint-Drift",
  resultNotObjectMutation !== compatMigrationSql
    && !hasExactPilotImportConstraintPreflight(resultNotObjectMutation),
);
const foreignKeyInheritabilityMutation = compatMigrationSql.replace(
  "actor_id_fkey:f:false:false:true:true:foreignkey",
  "actor_id_fkey:f:false:false:true:false:foreignkey",
);
expect(
  "Exakter Schemazaun verwirft falsches connoinherit am Actor-FK als Constraint-Drift",
  foreignKeyInheritabilityMutation !== compatMigrationSql
    && !hasExactPilotImportConstraintPreflight(foreignKeyInheritabilityMutation),
);
const primaryKeyInheritabilityMutation = compatMigrationSql.replace(
  "operations_pkey:p:false:false:true:true:primarykey",
  "operations_pkey:p:false:false:true:false:primarykey",
);
expect(
  "Exakter Schemazaun verwirft falsches connoinherit am PK als Constraint-Drift",
  primaryKeyInheritabilityMutation !== compatMigrationSql
    && !hasExactPilotImportConstraintPreflight(primaryKeyInheritabilityMutation),
);
expect(
  "Pilot-Import-TTL ergänzt beide Spalten, partiellen Index und den bestehenden 30-Tage-Trigger",
  /alter table public\.kd_radar_pilot_import_operations\s+add column terminal_at timestamptz,\s+add column expires_at timestamptz\s*;/i.test(compatMigrationSql)
    && /create index kd_radar_pilot_import_operations_expires\s+on public\.kd_radar_pilot_import_operations \(expires_at\)\s+where expires_at is not null\s*;/i.test(compatMigrationSql)
    && /create trigger kd_radar_pilot_import_operations_private_ttl\s+before insert or update on public\.kd_radar_pilot_import_operations\s+for each row execute function public\.kd_private_mark_operation_ttl\(\)\s*;/i.test(compatMigrationSql)
    && /new\.expires_at := coalesce\(new\.expires_at, new\.terminal_at \+ interval '30 days'\)/i.test(migrationSql),
);

const compatOwnDataSql = extractFunction(compatMigrationSql, "kd_private_own_data");
const ownDataKeySets = jsonObjectKeySets(compatOwnDataSql);
expect(
  "Own-Data projiziert Radar-Fähigkeiten und Pilot-Importzeilen mit exakt erlaubten Schlüsseln",
  hasExactKeySet(ownDataKeySets, [
    "radar_unlimited", "radar_review", "radar_pilot", "updated_at",
  ])
    && hasExactKeySet(ownDataKeySets, [
      "operation_id", "request_hash", "result", "terminal_at", "expires_at", "created_at",
    ])
    && hasExactKeySet(ownDataKeySets, [
      "capabilities", "accountState", "subscriptions", "receipts", "shares",
      "operations", "shareOperations", "reviews", "importOperations",
    ]),
);
expect(
  "Own-Data isoliert Pilot-Importoperationen am angefragten Actor und exportiert actor_id nicht",
  /from public\.kd_radar_pilot_import_operations o\s+where o\.actor_id = p_account_id/i.test(compatOwnDataSql)
    && !hasExactKeySet(ownDataKeySets, [
      "actor_id", "operation_id", "request_hash", "result", "terminal_at", "expires_at", "created_at",
    ]),
);

const compatRetentionSql = extractFunction(compatMigrationSql, "kd_private_retention_run");
const retentionKeySets = jsonObjectKeySets(compatRetentionSql);
const retentionTables = extractTables(compatMigrationSql, "kd_private_retention_run", "from");
expect(
  "Retention erfasst alle bisherigen Klassen plus Pilot-Importoperationen im Dry-Run",
  [
    "kd_radar_operations",
    "kd_radar_share_operations",
    "kd_radar_pilot_import_operations",
    "kd_radar_checks",
    "kd_ai_log",
    "kd_private_delete_operations",
    "kd_radar_targets",
  ].every((table) => retentionTables.has(table))
    && hasExactKeySet(retentionKeySets, [
      "operations", "shareOperations", "pilotImportOperations", "checks",
      "aiLogs", "deleteLedger", "orphanTargets",
    ]),
);
expect(
  "Pilot-Import-Retention nutzt 30 Tage in Dry-Run und Purge mit begrenzter Reihenfolge",
  /from public\.kd_radar_pilot_import_operations\s+where coalesce\(expires_at, created_at \+ interval '30 days'\) <= now\(\)/i.test(compatRetentionSql)
    && /delete from public\.kd_radar_pilot_import_operations\s+where ctid in \(\s*select ctid from public\.kd_radar_pilot_import_operations\s+where coalesce\(expires_at, created_at \+ interval '30 days'\) <= now\(\)\s+order by expires_at nulls first, created_at limit v_limit\s*\)/i.test(compatRetentionSql),
);
expect(
  "Fortgeschriebene Retention bewahrt Lock, Purge-Not-Aus, Zielgraph und Fehlerfortsetzung",
  /pg_try_advisory_xact_lock\(hashtextextended\('kd_private_retention_run', 0\)\)/i.test(compatRetentionSql)
    && /where singleton and purge_enabled/i.test(compatRetentionSql)
    && /delete from public\.kd_radar_reviews r\s+using public\.kd_radar_event_versions v, public\.kd_radar_events e/i.test(compatRetentionSql)
    && /delete from public\.kd_radar_targets where target_id = v_target_id/i.test(compatRetentionSql)
    && /exception when others[\s\S]*?v_failed_targets := v_failed_targets \+ 1/i.test(compatRetentionSql)
    && hasExactKeySet(retentionKeySets, ["purgedTargets", "failedTargets"]),
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

const exportGetBranch = edgeFunctionSql.match(
  /if \(req\.method === "GET"\) \{([\s\S]*?)\n  \}\n\n  let body:/,
)?.[1] || "";
const exportSettingsLookupIndex = exportGetBranch.indexOf('.from("kd_private_settings")');
const exportDisabledGateIndex = exportGetBranch.indexOf(
  "if (exportSettingsError || exportSettings?.export_enabled !== true)",
);
const gatedOwnDataIndex = exportGetBranch.indexOf('rpc("kd_private_own_data"');
expect(
  "Eigendatenexport liest den Singleton im GET-Zweig vor dem Own-Data-RPC",
  exportSettingsLookupIndex >= 0
    && exportGetBranch.indexOf('.select("export_enabled")', exportSettingsLookupIndex) > exportSettingsLookupIndex
    && exportGetBranch.indexOf('.eq("singleton", true)', exportSettingsLookupIndex) > exportSettingsLookupIndex
    && exportGetBranch.indexOf(".maybeSingle()", exportSettingsLookupIndex) > exportSettingsLookupIndex
    && exportDisabledGateIndex > exportSettingsLookupIndex
    && gatedOwnDataIndex > exportDisabledGateIndex,
);
expect(
  "Export-Not-Aus sperrt Fehler, fehlende Werte und false stabil vor dem Own-Data-RPC",
  /if \(exportSettingsError \|\| exportSettings\?\.export_enabled !== true\) return json\(\{ ok: false, code: "EXPORT_DISABLED" \}, 403, origin\);/.test(exportGetBranch)
    && gatedOwnDataIndex > exportDisabledGateIndex,
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
    radar: {
      capabilities: {
        radar_unlimited: false,
        radar_review: false,
        radar_pilot: false,
        updated_at: "2026-08-09T12:00:00Z",
      },
      accountState: null,
      subscriptions: [],
      receipts: [],
      shares: [],
      operations: [],
      shareOperations: [],
      importOperations: [],
      reviews: [],
    },
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

const validImportOperation = {
  operation_id: "11111111-1111-4111-8111-111111111111",
  request_hash: "0123456789abcdef0123456789abcdef",
  result: { status: "ok" },
  terminal_at: "2026-08-09T12:00:00Z",
  expires_at: "2026-09-09T12:00:00Z",
  created_at: "2026-08-09T12:00:00Z",
};
const validImportOperationWithOffsets = {
  ...validImportOperation,
  terminal_at: "2026-08-09T12:00:00+01:00",
  expires_at: "2026-09-09T12:00:00-07:00",
};
const validOwnDataWithImportOperations = {
  ...validOwnData,
  data: {
    ...validOwnData.data,
    radar: {
      ...validOwnData.data.radar,
      importOperations: [validImportOperation],
    },
  },
};
expect(
  "Import-Operations mit gültigem Ergebnisobjekt werden akzeptiert",
  (() => {
    const normalized = validateOwnData(validOwnDataWithImportOperations);
    const first = normalized.radar.importOperations[0];
    return normalized.radar.importOperations.length === 1
      && first.operation_id === validImportOperation.operation_id
      && first.result.status === "ok"
      && first.terminal_at === validImportOperation.terminal_at;
  })(),
);
expect(
  "Import-Operations mit positivem und negativem Offset werden akzeptiert",
  (() => {
    const normalized = validateOwnData({
      ...validOwnData,
      data: {
        ...validOwnData.data,
        radar: {
          ...validOwnData.data.radar,
          importOperations: [validImportOperationWithOffsets],
        },
      },
    });
    const first = normalized.radar.importOperations[0];
    return first.terminal_at === validImportOperationWithOffsets.terminal_at
      && first.expires_at === validImportOperationWithOffsets.expires_at;
  })(),
);
expect(
  "capabilities.updated_at mit positiven/negativen Offsets wird akzeptiert",
  (() => {
    const positiveOffset = validateOwnData({
      ...validOwnData,
      data: {
        ...validOwnData.data,
        radar: {
          ...validOwnData.data.radar,
          capabilities: {
            ...validOwnData.data.radar.capabilities,
            updated_at: "2026-08-09T12:00:00+01:00",
          },
        },
      },
    });
    const negativeOffset = validateOwnData({
      ...validOwnData,
      data: {
        ...validOwnData.data,
        radar: {
          ...validOwnData.data.radar,
          capabilities: {
            ...validOwnData.data.radar.capabilities,
            updated_at: "2026-08-09T12:00:00-07:00",
          },
        },
      },
    });
    return positiveOffset.radar.capabilities.updated_at === "2026-08-09T12:00:00+01:00"
      && negativeOffset.radar.capabilities.updated_at === "2026-08-09T12:00:00-07:00";
  })(),
);
const invalidOwnDataCapabilityShape = expectBoundaryError(
  "Radar-Capability-Missformen werden als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        capabilities: { radar_unlimited: true, radar_review: true, updated_at: "2026-08-09T12:00:00Z" },
      },
    },
  }),
);
expect("Fehlende radar_pilot-Quelle bricht den Zugriff", invalidOwnDataCapabilityShape.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataCapabilityTypesRadarPilot = expectBoundaryError(
  "Falsch typisiertes radar_pilot in Capabilities wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        capabilities: { radar_unlimited: true, radar_review: true, radar_pilot: "true", updated_at: "2026-08-09T12:00:00Z" },
      },
    },
  }),
);
expect("Falscher radar_pilot-Typ bricht den Zugriff", invalidOwnDataCapabilityTypesRadarPilot.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataCapabilityTypesUpdatedAt = expectBoundaryError(
  "Falsch typisiertes updated_at in Capabilities wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        capabilities: { radar_unlimited: true, radar_review: true, radar_pilot: true, updated_at: 1723200000000 },
      },
    },
  }),
);
expect("Falscher updated_at-Typ in Capabilities bricht den Zugriff", invalidOwnDataCapabilityTypesUpdatedAt.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataCapabilityTypesUpdatedAtTimestampString = expectBoundaryError(
  "Ungültiger updated_at-Zeitenstring in Capabilities wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        capabilities: { radar_unlimited: true, radar_review: true, radar_pilot: true, updated_at: "not-a-timestamp" },
      },
    },
  }),
);
expect("Nicht-RFC3339 updated_at in Capabilities bricht den Zugriff", invalidOwnDataCapabilityTypesUpdatedAtTimestampString.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataCapabilityBooleanType = expectBoundaryError(
  "Falsch typisiertes Boolean-Feld in Capabilities wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        capabilities: { radar_unlimited: "true", radar_review: true, radar_pilot: true, updated_at: "2026-08-09T12:00:00Z" },
      },
    },
  }),
);
expect("Falscher Boolean-Typ in Capabilities bricht den Zugriff", invalidOwnDataCapabilityBooleanType.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataCapabilityExtra = expectBoundaryError(
  "Zusätzliche Capability-Felder bei Own-Data werden als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        capabilities: {
          radar_unlimited: true,
          radar_review: true,
          radar_pilot: true,
          radar_extras: true,
          updated_at: "2026-08-09T12:00:00Z",
        },
      },
    },
  }),
);
expect("Zusätzliche Capability-Keys brechen den Zugriff", invalidOwnDataCapabilityExtra.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperations = expectBoundaryError(
  "Ungültiger importOperations-Typ in Own-Data wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: "kann-nicht-array",
      },
    },
  }),
);
expect("importOperations erfordert ein Array", invalidOwnDataImportOperations.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataMissingImportOperationsKey = expectBoundaryError(
  "Fehlender importOperations-Key in radar wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: (() => {
        const { importOperations, ...rest } = validOwnData.data.radar;
        return rest;
      })(),
    },
  }),
);
expect("Fehlender importOperations-Key bricht den Zugriff", invalidOwnDataMissingImportOperationsKey.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsMissingRequiredKey = expectBoundaryError(
  "Import-Operation mit fehlendem Pflichtkey in Own-Data wird als Boundary-Fehler verworfen",
  () => {
    const { request_hash, ...missingRequestHash } = validImportOperation;
    return validateOwnData({
      ...validOwnData,
      data: {
        ...validOwnData.data,
        radar: {
          ...validOwnData.data.radar,
          importOperations: [{
            ...missingRequestHash,
          }],
        },
      },
    });
  },
);
expect("fehlendes Pflichtfeld in importOperations bricht den Zugriff", invalidOwnDataImportOperationsMissingRequiredKey.code === ERROR_CODES.INVALID_RESPONSE);
for (const [name, invalidPayload] of [
  ["terminal_at", { ...validImportOperation, terminal_at: "0" }],
  ["expires_at", { ...validImportOperation, expires_at: "0" }],
  ["created_at", { ...validImportOperation, created_at: "0" }],
]) {
  const invalidOwnDataImportOperationsZeroTimestamp = expectBoundaryError(
    `Import-Operation mit ungültigem ${name}="0" wird als Boundary-Fehler verworfen`,
    () => validateOwnData({
      ...validOwnData,
      data: {
        ...validOwnData.data,
        radar: {
          ...validOwnData.data.radar,
          importOperations: [invalidPayload],
        },
      },
    }),
  );
  expect(`importOperations-${name} mit "0" wird abgelehnt`, invalidOwnDataImportOperationsZeroTimestamp.code === ERROR_CODES.INVALID_RESPONSE);
}
const invalidOwnDataImportOperationsTimezoneMissing = expectBoundaryError(
  "Import-Operation mit fehlender Zeitzone in terminal_at wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          terminal_at: "2026-08-09T12:00:00",
        }],
      },
    },
  }),
);
expect("Import-Operation ohne Zeitzone bricht den Zugriff", invalidOwnDataImportOperationsTimezoneMissing.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsImpossibleDate = expectBoundaryError(
  "Import-Operation mit unmöglichem Datum in created_at wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          created_at: "2026-02-30T12:00:00Z",
        }],
      },
    },
  }),
);
expect("Import-Operation mit unmöglichem Datum bricht den Zugriff", invalidOwnDataImportOperationsImpossibleDate.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsOperationId = expectBoundaryError(
  "Falsch typisierte operation_id in importOperations wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          operation_id: 1234,
        }],
      },
    },
  }),
);
expect("operation_id-Abweichungen in importOperations brechen den Zugriff", invalidOwnDataImportOperationsOperationId.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsRequestHash = expectBoundaryError(
  "Falsch typisiertes request_hash in importOperations wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          request_hash: "AABBCCDDEEFF00112233445566778899aa",
        }],
      },
    },
  }),
);
expect("request_hash-Abweichungen in importOperations brechen den Zugriff", invalidOwnDataImportOperationsRequestHash.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsResult = expectBoundaryError(
  "Falsch typisiertes result in importOperations wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          result: [],
        }],
      },
    },
  }),
);
expect("result-Abweichungen in importOperations brechen den Zugriff", invalidOwnDataImportOperationsResult.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsTerminalAt = expectBoundaryError(
  "Falsch typisierte terminal_at in importOperations wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          terminal_at: 123,
        }],
      },
    },
  }),
);
expect("terminal_at-Abweichungen in importOperations brechen den Zugriff", invalidOwnDataImportOperationsTerminalAt.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsExpiresAt = expectBoundaryError(
  "Falsch typisierte expires_at in importOperations wird als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          expires_at: false,
        }],
      },
    },
  }),
);
expect("expires_at-Abweichungen in importOperations brechen den Zugriff", invalidOwnDataImportOperationsExpiresAt.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsCreatedAt = expectBoundaryError(
  "Falsch typisiertes created_at in importOperations wird als Boundary-Fehler verwertet",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          created_at: true,
        }],
      },
    },
  }),
);
expect("created_at-Abweichungen in importOperations brechen den Zugriff", invalidOwnDataImportOperationsCreatedAt.code === ERROR_CODES.INVALID_RESPONSE);
const invalidOwnDataImportOperationsActorId = expectBoundaryError(
  "Import-Operations mit actor_id in Own-Data werden als Boundary-Fehler verworfen",
  () => validateOwnData({
    ...validOwnData,
    data: {
      ...validOwnData.data,
      radar: {
        ...validOwnData.data.radar,
        importOperations: [{
          ...validImportOperation,
          actor_id: "11111111-1111-4111-8111-111111111111",
        }],
      },
    },
  }),
);
expect("actor_id in importOperations bricht den Zugriff", invalidOwnDataImportOperationsActorId.code === ERROR_CODES.INVALID_RESPONSE);
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

const privateGrantBlock = compatMigrationSql.match(/grant execute on function public\.kd_private_mark_operation_ttl[\s\S]*?to service_role;/i) || [];
expect(
  "Private RPCs sind nicht für Browser-Rollen ausführbar",
  privateGrantBlock.length === 1 && /to service_role;/i.test(privateGrantBlock[0])
    && !/to\s+(public|anon|authenticated)\b/i.test(privateGrantBlock[0])
    && /revoke all on table public\.kd_radar_pilot_import_operations\s+from public, anon, authenticated;/i.test(compatMigrationSql)
    && /grant all on table public\.kd_radar_pilot_import_operations\s+to service_role;/i.test(compatMigrationSql)
    && /notify pgrst, 'reload schema';/i.test(compatMigrationSql),
);

const deleteMapRows = [
  ...parseInsertRows(migrationSql, "kd_private_delete_map"),
  ...parseInsertRows(compatMigrationSql, "kd_private_delete_map"),
];
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
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_reviews")
    && new Set(deleteMapRows.map((row) => row.storageClass)).has("kd_radar_pilot_import_operations"),
);
const pilotImportDeleteRow = deleteMapRows.find(
  (row) => row.storageClass === "kd_radar_pilot_import_operations",
);
expect(
  "Pilot-Importoperationen sind genau actor-gebunden und cascaden beim Self-Delete",
  pilotImportDeleteRow?.accountColumn === "actor_id"
    && pilotImportDeleteRow?.action === "cascade"
    && deleteMapRows.filter((row) => row.storageClass === "kd_radar_pilot_import_operations").length === 1,
);

const ownDataTables = extractTables(compatMigrationSql, "kd_private_own_data", "from");
const deleteDataTables = extractTables(migrationSql, "kd_private_delete_begin", "from");
const operationDataTables = extractTables(migrationSql, "kd_private_delete_begin", "delete from");
const accountBoundTables = new Set(
  [...ownDataTables, ...deleteDataTables, ...operationDataTables]
    .filter((table) => !table.startsWith("kd_private_")),
);
const mappedTables = new Set(deleteMapRows.map((row) => row.storageClass));
eqSet(
  mappedTables,
  new Set([
    "auth.users",
    "kd_account_access",
    "kd_personal",
    "kd_ai_log",
    "kd_series_watch",
    "kd_shared_articles",
    "kd_shared_article_claims",
    "kd_radar_capabilities",
    "kd_radar_account_state",
    "kd_radar_subscriptions",
    "kd_radar_target_shares",
    "kd_radar_operations",
    "kd_radar_share_operations",
    "kd_radar_receipts",
    "kd_radar_reviews",
    "kd_radar_pilot_import_operations",
    "browser_auth_session",
    "browser_account_cache",
    "logical_dumps",
  ]),
  "Delete-Mapping ist über historische und Forward-Migration exakt und erschöpfend",
);
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
    && /actor_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/i.test(pilotMigrationSql)
    && !/delete from public\.kd_personal/i.test(extractFunction(migrationSql, "kd_private_delete_begin"))
    && !/delete from public\.kd_radar_(?:targets|events|event_versions|evidence)/i.test(extractFunction(migrationSql, "kd_private_delete_begin"))
    && edgeFunctionSql.indexOf("admin.auth.admin.deleteUser") < edgeFunctionSql.indexOf('rpc("kd_private_delete_finish"'),
);
expect(
  "Remote-Retention markiert Terminalzustände und beendet widerrufene Zwecke",
  /create trigger kd_radar_operations_private_ttl/i.test(migrationSql)
    && /create trigger kd_radar_checks_private_ttl/i.test(migrationSql)
    && /create trigger kd_radar_subscriptions_private_orphan/i.test(migrationSql)
    && /create trigger kd_radar_pilot_import_operations_private_ttl/i.test(compatMigrationSql)
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
