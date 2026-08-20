/* E18-Prozessvertraege und Default-Executor.
   ========================================================================
   Die Rezepte in diesem Modul stammen ausschliesslich aus den lokal
   installierten Supabase-CLI-2.109.1-/PostgreSQL-17-Hilfen und den drei
   effektfreien Prozess-Spikes. Sie sind kein allgemeiner Shell-Runner.

   Geheimnisse sind nie Teil eines Blueprints, argv, Logs oder Rueckgabewerts.
   Der reale Executor reicht sie nur prozessintern in exakt allowlisteten
   Umgebungen beziehungsweise einer einmaligen 0600-Env-Datei weiter.
   ======================================================================== */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  LOCAL_ROLE_ALLOWLIST,
  buildLocalRoleScaffoldSql,
  describeAuthProjectionSql,
  parseAuthIdProjectionOutput,
} from "./e17b-remote-window.mjs";
import {
  REPO_ROOT,
  buildRadarSupabaseCliEnvironment,
  cleanupRadarCliWorkspace,
  createRadarCliWorkspace,
  deriveRadarPackageBReleaseClosure,
} from "./radar_websearch_remote_start.mjs";

const PROJECT_REF = "bscjgwcntapobyxsiyce";
const FUNCTION_NAME = "radar-websearch-task";
const MIGRATIONS = Object.freeze([
  "20260817120000",
  "20260817180000",
  "20260817190000",
]);
const PACKAGE_MIGRATIONS = Object.freeze([
  "supabase/migrations/20260817120000_blog_profile_extract_config.sql",
  "supabase/migrations/20260817180000_radar_websearch_mvp_package_a.sql",
  "supabase/migrations/20260817190000_radar_websearch_mvp_package_b.sql",
]);
const PACKAGE_FUNCTION_FILES = Object.freeze([
  "supabase/functions/radar-websearch-task/anthropicAdapter.js",
  "supabase/functions/radar-websearch-task/contract.js",
  "supabase/functions/radar-websearch-task/index.ts",
  "supabase/functions/radar-websearch-task/runner.js",
]);
const MIGRATION_DIRECTORY = "supabase/migrations";
const MIGRATION_README = "LIESMICH.md";
const MIGRATION_FILE_PATTERN = /^([0-9]{14})_([a-z0-9_]+)\.sql$/;
const SECURITY = "/usr/bin/security";
const SUPABASE = resolve(
  REPO_ROOT,
  "node_modules/@supabase/cli-darwin-arm64/bin/supabase",
);
const PG17 = "/Applications/Postgres.app/Contents/Versions/17/bin";
const NODE = "/usr/local/bin/node";
const NPM_CLI = "/usr/local/lib/node_modules/npm/bin/npm-cli.js";
const PROCESS_TIMEOUT = 20_000;
const DATABASE_TIMEOUT = 120_000;
const LIVE_TIMEOUT = 15 * 60_000;
const MAX_BUFFER = 4 * 1024 * 1024;
const BACKUP_PREFIX = "/private/tmp/kinodreieck-e18-backup-";
const CONNECTION_FILE = "supabase/.temp/pooler-url";
const RESTORE_SCOPE_ARGS = Object.freeze([
  "--schema=public",
  "--schema=supabase_migrations",
]);
const COMMITTED_EXECUTOR_PATHS = Object.freeze([
  "supabase/migrations/20260817120000_blog_profile_extract_config.sql",
  "tools/e17b-remote-window.mjs",
  "tools/radar_e17a_repair_once.mjs",
  "tools/radar_e18_process_executor.mjs",
  "tools/radar_e18_remote_adapter.mjs",
  "tools/radar_websearch_remote_start.mjs",
]);

function deriveE17bRestoreScaffold() {
  const sql = buildLocalRoleScaffoldSql();
  const lines = sql.split("\n");
  const roleLines = lines.filter((line) => line.startsWith("CREATE ROLE "));
  const expectedRoleLines = LOCAL_ROLE_ALLOWLIST
    .map((role) => `CREATE ROLE ${role} NOLOGIN;`);
  const schemaLines = lines.filter((line) => (
    line !== "BEGIN;" && line !== "COMMIT;" && line !== ""
      && !line.startsWith("CREATE ROLE ")
  ));
  if (!isDeepStrictEqual(roleLines, expectedRoleLines)
      || !schemaLines.includes("CREATE SCHEMA IF NOT EXISTS auth;")
      || !schemaLines.includes("CREATE TABLE auth.users (id uuid PRIMARY KEY);")
      || !schemaLines.includes("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;")
      || !schemaLines.includes("CREATE SCHEMA IF NOT EXISTS extensions;")
      || !schemaLines.includes("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;")
      || schemaLines.length !== 5) {
    throw new Error("E17B restore scaffold drifted");
  }
  return Object.freeze({
    roles: ["BEGIN;", ...roleLines, "COMMIT;", ""].join("\n"),
    schema: ["BEGIN;", ...schemaLines, "CREATE SCHEMA supabase_migrations;", "COMMIT;", ""].join("\n"),
  });
}

function deriveAuthProjectionSql() {
  const descriptor = describeAuthProjectionSql();
  const snapshotLine = "SET TRANSACTION SNAPSHOT '<SNAPSHOT_CAPABILITY>';";
  if (!exactObject(descriptor, ["sinkConsumable", "snapshotPlaceholder", "sqlTemplate"])
      || descriptor.sinkConsumable !== false
      || descriptor.snapshotPlaceholder !== true
      || descriptor.sqlTemplate.split("\n").filter((line) => line === snapshotLine).length !== 1) {
    throw new Error("E17B auth projection descriptor drifted");
  }
  // E18 besitzt keine Snapshot-Capability und behauptet deshalb keine. Die
  // eigentliche ID-only COPY-Projektion bleibt unveraendert aus E17B abgeleitet.
  return descriptor.sqlTemplate
    .split("\n")
    .filter((line) => line !== snapshotLine)
    .join("\n");
}

const E17B_RESTORE_SCAFFOLD = deriveE17bRestoreScaffold();
const AUTH_ID_PROJECTION_SQL = deriveAuthProjectionSql();

const CLI_ENV = Object.freeze([
  "DO_NOT_TRACK", "LANG", "LC_ALL", "NO_COLOR", "PATH", "SUPABASE_HOME",
  "SUPABASE_NO_KEYRING", "SUPABASE_TELEMETRY_DISABLED", "TMPDIR",
  "XDG_CACHE_HOME", "XDG_CONFIG_HOME",
]);
const CLI_AUTH_ENV = Object.freeze([...CLI_ENV, "SUPABASE_ACCESS_TOKEN"]);
const CLI_LINK_ENV = Object.freeze([
  ...CLI_ENV, "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD",
]);
const PSQL_ENV = Object.freeze([
  "LANG", "LC_ALL", "NO_COLOR", "PATH", "PGCONNECT_TIMEOUT", "PGPASSWORD", "PGSSLMODE", "PGTZ", "TMPDIR",
]);
const LOCAL_PG_ENV = Object.freeze(["LANG", "LC_ALL", "NO_COLOR", "PATH", "PGTZ", "TMPDIR"]);
const SECURITY_ENV = Object.freeze(["LANG", "LC_ALL", "NO_COLOR", "PATH"]);
const RADAR_E18_LIVE_TARGET_ID = "work:imdb:tt41955949";
const LIVE_ENV = Object.freeze([
  "HOME", "KD_RADAR_TARGET_ID", "LANG", "LC_ALL", "NO_COLOR", "PATH", "TMPDIR",
]);

const E17A_STATE_SQL = String.raw`select jsonb_build_object(
  'ledger', coalesce((select jsonb_agg(jsonb_build_object('version', version, 'name', name) order by version) from supabase_migrations.schema_migrations), '[]'::jsonb),
  'limits', jsonb_build_object(
    'task_modell', (select wert from public.kd_ai_limits where schluessel = 'task_modell'),
    'task_max_tokens', (select wert from public.kd_ai_limits where schluessel = 'task_max_tokens'),
    'task_max_reservierung_usd_cent', (select wert from public.kd_ai_limits where schluessel = 'task_max_reservierung_usd_cent')
  ),
  'targetLedger', (select jsonb_build_object('version', version, 'name', name, 'statements', to_jsonb(statements)) from supabase_migrations.schema_migrations where version = '20260817120000')
)::text;`;

const PACKAGE_STATE_SQL = String.raw`select jsonb_build_object(
  'ledger', coalesce((select jsonb_agg(jsonb_build_object('version', version, 'name', name) order by version) from supabase_migrations.schema_migrations), '[]'::jsonb),
  'radar', (select jsonb_build_object('radar_aktiv',radar_aktiv,'radar_provider_aktiv',radar_provider_aktiv,'radar_shares_aktiv',radar_shares_aktiv,'radar_scheduler_aktiv',radar_scheduler_aktiv,'radar_proposal_import_aktiv',radar_proposal_import_aktiv) from public.kd_radar_settings where singleton),
  'private', (select jsonb_build_object('ai_aktiv',(select wert from public.kd_ai_limits where schluessel='ai_aktiv'),'provider_requests_enabled',provider_requests_enabled,'scheduler_enabled',scheduler_enabled) from public.kd_private_settings where singleton),
  'provider', (select jsonb_build_object('feature_enabled',feature_enabled,'rights_confirmed',rights_confirmed,'dpa_transfer_confirmed',dpa_transfer_confirmed,'retention_confirmed',retention_confirmed,'price_budget_confirmed',price_budget_confirmed,'legal_status',legal_status,'review_current',coalesce(reviewed_at >= current_date - 90,false)) from public.kd_private_provider_registry where provider_id='anthropic'),
  'providerGate', public.kd_private_provider_allowed('anthropic'),
  'limits', jsonb_build_object(
    'task_modell', (select wert->'radar-websearch' from public.kd_ai_limits where schluessel='task_modell'),
    'task_max_tokens', (select wert->'radar-websearch' from public.kd_ai_limits where schluessel='task_max_tokens'),
    'task_max_reservierung_usd_cent', (select wert->'radar-websearch' from public.kd_ai_limits where schluessel='task_max_reservierung_usd_cent'),
    'websearch_usd_cent_pro_request', (select wert from public.kd_ai_limits where schluessel='websearch_usd_cent_pro_request')
  )
)::text;`;

const PACKAGE_FLAG_ENABLE_SQL = String.raw`begin;
do $$
declare
  r public.kd_radar_settings%rowtype;
  s public.kd_private_settings%rowtype;
  p public.kd_private_provider_registry%rowtype;
  v_ai_aktiv jsonb;
begin
  select * into r from public.kd_radar_settings where singleton for update;
  if not found or r.radar_shares_aktiv or r.radar_scheduler_aktiv or r.radar_proposal_import_aktiv then
    raise exception 'E18 unrelated radar flag is active';
  end if;
  select * into s from public.kd_private_settings where singleton for update;
  if not found or s.scheduler_enabled then
    raise exception 'E18 private scheduler flag is active';
  end if;
  select wert into v_ai_aktiv from public.kd_ai_limits
   where schluessel='ai_aktiv' for update;
  if not found or jsonb_typeof(v_ai_aktiv) is distinct from 'boolean' then
    raise exception 'E18 ai_aktiv is missing or malformed';
  end if;
  select * into p from public.kd_private_provider_registry where provider_id='anthropic' for update;
  if not found or not p.rights_confirmed or not p.dpa_transfer_confirmed or not p.retention_confirmed or not p.price_budget_confirmed or p.legal_status <> 'APPROVED' or p.reviewed_at is null or p.reviewed_at < current_date - 90 then
    raise exception 'E18 provider approval is not current';
  end if;
  update public.kd_ai_limits set wert='true'::jsonb where schluessel='ai_aktiv';
  update public.kd_private_settings set provider_requests_enabled=true, updated_at=now() where singleton;
  update public.kd_private_provider_registry set feature_enabled=true, updated_at=now() where provider_id='anthropic';
  update public.kd_radar_settings set radar_aktiv=true, radar_provider_aktiv=true, updated_at=now() where singleton;
end $$;
commit;`;

const PROCESS_CONTRACT_VERSION = "radar-e18-process-v1";
const contractBrand = new WeakSet();

export class RadarE18ProcessStop extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RadarE18ProcessStop";
    this.code = code;
  }
}

function stop(code, message) {
  throw new RadarE18ProcessStop(code, message);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function exactObject(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function step(id, binary, argv, cwd, envNames, stdin, stdout, timeoutMs, parser) {
  return deepFreeze({
    id,
    binary,
    argv: [...argv],
    cwd,
    envNames: [...envNames].sort(),
    stdin,
    stdout,
    timeoutMs,
    parser,
    attempts: 1,
    shell: false,
  });
}

function pg(name) {
  return `${PG17}/${name}`;
}

function psqlStep(id, stdin, parser = "json") {
  return step(
    id,
    pg("psql"),
    ["--no-psqlrc", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=on", "--file", "-", "$REMOTE_DB_URL"],
    "$RUN_PROJECT",
    PSQL_ENV,
    stdin,
    "pipe",
    DATABASE_TIMEOUT,
    parser,
  );
}

function authProjectionStep(id) {
  return step(
    id,
    pg("psql"),
    ["--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=on", "--file", "-", "$REMOTE_DB_URL"],
    "$RUN_PROJECT",
    PSQL_ENV,
    "sql:auth-id-projection",
    "pipe",
    DATABASE_TIMEOUT,
    "auth-id-projection",
  );
}

function backupSteps(prefix) {
  return [
    step(`${prefix}-custom`, pg("pg_dump"), ["--format=custom", "--column-inserts", "--no-owner", "--no-privileges", "--file", "$BACKUP_FILE", "$REMOTE_DB_URL"], "$RUN_PROJECT", PSQL_ENV, "ignore", "ignore", DATABASE_TIMEOUT, "backup-file"),
    authProjectionStep(`${prefix}-auth-ids`),
    step(`${prefix}-data`, pg("pg_restore"), ["--data-only", "--no-owner", "--no-privileges", ...RESTORE_SCOPE_ARGS, "--file", "$PROJECTION_FILE", "$BACKUP_FILE"], "$RUN_PROJECT", LOCAL_PG_ENV, "ignore", "ignore", DATABASE_TIMEOUT, "projection-digest"),
  ];
}

function restorePsqlStep(id, database, stdin) {
  return step(
    id,
    pg("psql"),
    [
      "--host", "$RESTORE_SOCKET", "--port", "$RESTORE_PORT",
      "--dbname", database,
      "--no-psqlrc", "--set", "ON_ERROR_STOP=on", "--file", "-",
    ],
    "$RESTORE_ROOT",
    LOCAL_PG_ENV,
    stdin,
    "ignore",
    PROCESS_TIMEOUT,
    "opaque",
  );
}

function restoreSteps(prefix) {
  return [
    step(`${prefix}-initdb`, pg("initdb"), ["--no-locale", "--encoding=UTF8", "--auth=trust", "--pgdata", "$RESTORE_DATA"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "opaque"),
    step(`${prefix}-start`, pg("pg_ctl"), ["--pgdata", "$RESTORE_DATA", "--log", "$RESTORE_LOG", "--options", "$RESTORE_OPTIONS", "--wait", "start"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "opaque"),
    restorePsqlStep(`${prefix}-roles`, "postgres", "sql:restore-roles"),
    step(`${prefix}-preflight-createdb`, pg("createdb"), ["--host", "$RESTORE_SOCKET", "--port", "$RESTORE_PORT", "schema_preflight"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "pipe", PROCESS_TIMEOUT, "opaque"),
    restorePsqlStep(`${prefix}-preflight-schema`, "schema_preflight", "sql:restore-schema"),
    restorePsqlStep(`${prefix}-preflight-auth-ids`, "schema_preflight", "sql:restore-auth-ids"),
    step(`${prefix}-preflight`, pg("pg_restore"), ["--schema-only", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", ...RESTORE_SCOPE_ARGS, "--host", "$RESTORE_SOCKET", "--port", "$RESTORE_PORT", "--dbname", "schema_preflight", "$BACKUP_FILE"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "schema-preflight"),
    step(`${prefix}-preflight-scoped-backup`, pg("pg_dump"), ["--format=custom", "--column-inserts", "--no-owner", "--no-privileges", ...RESTORE_SCOPE_ARGS, "--file", "$PREFLIGHT_BACKUP_FILE", "--host", "$RESTORE_SOCKET", "--port", "$RESTORE_PORT", "schema_preflight"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "ignore", DATABASE_TIMEOUT, "preflight-backup-file"),
    step(`${prefix}-preflight-canonical-schema`, pg("pg_restore"), ["--schema-only", "--no-owner", "--no-privileges", ...RESTORE_SCOPE_ARGS, "--file", "$PROJECTION_FILE", "$PREFLIGHT_BACKUP_FILE"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "ignore", DATABASE_TIMEOUT, "projection-digest"),
    step(`${prefix}-createdb`, pg("createdb"), ["--host", "$RESTORE_SOCKET", "--port", "$RESTORE_PORT", "radar_restore"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "pipe", PROCESS_TIMEOUT, "opaque"),
    restorePsqlStep(`${prefix}-schema-scaffold`, "radar_restore", "sql:restore-schema"),
    restorePsqlStep(`${prefix}-auth-ids`, "radar_restore", "sql:restore-auth-ids"),
    step(`${prefix}-restore`, pg("pg_restore"), ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", ...RESTORE_SCOPE_ARGS, "--host", "$RESTORE_SOCKET", "--port", "$RESTORE_PORT", "--dbname", "radar_restore", "$BACKUP_FILE"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "opaque"),
    step(`${prefix}-scoped-backup`, pg("pg_dump"), ["--format=custom", "--column-inserts", "--no-owner", "--no-privileges", ...RESTORE_SCOPE_ARGS, "--file", "$RESTORED_BACKUP_FILE", "--host", "$RESTORE_SOCKET", "--port", "$RESTORE_PORT", "radar_restore"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "ignore", DATABASE_TIMEOUT, "restored-backup-file"),
    step(`${prefix}-schema`, pg("pg_restore"), ["--schema-only", "--no-owner", "--no-privileges", ...RESTORE_SCOPE_ARGS, "--file", "$PROJECTION_FILE", "$RESTORED_BACKUP_FILE"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "ignore", DATABASE_TIMEOUT, "projection-digest"),
    step(`${prefix}-data`, pg("pg_restore"), ["--data-only", "--no-owner", "--no-privileges", ...RESTORE_SCOPE_ARGS, "--file", "$PROJECTION_FILE", "$RESTORED_BACKUP_FILE"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "ignore", DATABASE_TIMEOUT, "projection-digest"),
    step(`${prefix}-stop`, pg("pg_ctl"), ["--pgdata", "$RESTORE_DATA", "--wait", "stop"], "$RESTORE_ROOT", LOCAL_PG_ENV, "ignore", "pipe", PROCESS_TIMEOUT, "opaque"),
  ];
}

function definition(id, target) {
  switch (id) {
    case "credential-supabase-access-token":
    case "credential-db-postgres-password":
    case "credential-anthropic-api-key":
      return { kind: "process", steps: [step(
        `${id}-read`, SECURITY,
        ["find-generic-password", "-s", target.keychain.service, "-a", target.keychain.account, "-w"],
        REPO_ROOT, SECURITY_ENV, "ignore", "secret", PROCESS_TIMEOUT, "credential-line",
      )] };
    case "e17a-remote-read":
      return { kind: "process", steps: [
        step("supabase-link", SUPABASE, ["link", "--project-ref", PROJECT_REF, "--output-format", "json"], "$RUN_PROJECT", CLI_LINK_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "opaque"),
        psqlStep("e17a-state-read", "sql:e17a-state"),
      ] };
    case "package-b-local-closure": return { kind: "internal", action: "derive-package-b-closure", steps: [] };
    case "package-b-local-workspace": return { kind: "internal", action: "create-package-b-workspace", steps: [] };
    case "package-b-local-cli":
      return { kind: "process", steps: [
        step("supabase-version", SUPABASE, ["--version"], REPO_ROOT, CLI_ENV, "ignore", "pipe", PROCESS_TIMEOUT, "supabase-2.109.1"),
        ...["pg_dump", "pg_restore", "psql", "initdb", "pg_ctl", "createdb"].map((binary) => (
          step(`postgresql-17-${binary}`, pg(binary), ["--version"], REPO_ROOT, LOCAL_PG_ENV, "ignore", "pipe", PROCESS_TIMEOUT, "postgresql-17")
        )),
      ] };
    case "package-b-remote-read":
      return { kind: "process", steps: [
        psqlStep("package-b-state-read", "sql:package-state"),
        step("package-b-secrets-list", SUPABASE, ["secrets", "list", "--project-ref", PROJECT_REF, "--output", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "supabase-secrets-json"),
        step("package-b-functions-list", SUPABASE, ["functions", "list", "--project-ref", PROJECT_REF, "--output", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "supabase-functions-json"),
      ] };
    case "package-b-provider-secret-write":
      return { kind: "process", steps: [
        step("provider-secret-set", SUPABASE, ["secrets", "set", "--project-ref", PROJECT_REF, "--env-file", "$PROVIDER_ENV_FILE", "--output", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "opaque"),
        step("provider-secret-readback", SUPABASE, ["secrets", "list", "--project-ref", PROJECT_REF, "--output", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "supabase-secrets-json"),
      ] };
    case "package-b-backup": return { kind: "process", steps: backupSteps("package-b-backup") };
    case "package-b-restore": return { kind: "process", steps: restoreSteps("package-b-restore") };
    case "package-b-migrations":
      return { kind: "process", steps: [
        step("package-b-migration-up", SUPABASE, ["migration", "up", "--linked", "--include-all", "--yes", "--output-format", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "opaque"),
        psqlStep("package-b-migration-readback", "sql:package-state"),
      ] };
    case "package-b-function":
      return { kind: "process", steps: [
        step("package-b-function-deploy", SUPABASE, ["functions", "deploy", FUNCTION_NAME, "--project-ref", PROJECT_REF, "--use-api", "--jobs", "1", "--output-format", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "opaque"),
        step("package-b-function-readback", SUPABASE, ["functions", "list", "--project-ref", PROJECT_REF, "--output", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "supabase-functions-json"),
      ] };
    case "package-b-secret-flags":
      return { kind: "process", steps: [
        psqlStep("package-b-flags-enable", "sql:package-flags-enable", "opaque"),
        psqlStep("package-b-flags-enabled-readback", "sql:package-state"),
      ] };
    case "package-b-live-request":
      return { kind: "process", steps: [step("package-b-live-once", NODE, [NPM_CLI, "run", "test:ai:live", "--", "--radar-websearch-once"], REPO_ROOT, LIVE_ENV, "ignore", "pipe", LIVE_TIMEOUT, "live-one-shot")] };
    case "package-b-postflight":
      return { kind: "process", steps: [
        psqlStep("package-b-state-postflight", "sql:package-state"),
        step("package-b-secrets-postflight", SUPABASE, ["secrets", "list", "--project-ref", PROJECT_REF, "--output", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "supabase-secrets-json"),
        step("package-b-functions-postflight", SUPABASE, ["functions", "list", "--project-ref", PROJECT_REF, "--output", "json"], "$RUN_PROJECT", CLI_AUTH_ENV, "ignore", "pipe", DATABASE_TIMEOUT, "supabase-functions-json"),
      ] };
    case "package-b-cleanup":
      return { kind: "process", steps: [
        psqlStep("package-b-flags-restore", "sql:package-flags-restore", "opaque"),
        psqlStep("package-b-flags-readback", "sql:package-state"),
      ] };
    default: stop("PROCESS_CONTRACT_ID_UNKNOWN", "E18-Prozessvertrag kennt den Blueprint nicht.");
  }
}

export function createRadarE18ProcessContract(id, target) {
  const raw = definition(id, target);
  const contract = deepFreeze({
    version: PROCESS_CONTRACT_VERSION,
    kind: raw.kind,
    ...(raw.action ? { action: raw.action } : {}),
    steps: raw.steps,
  });
  contractBrand.add(contract);
  return contract;
}

export function validateRadarE18ProcessContract(blueprint) {
  if (!exactObject(blueprint, ["attempts", "id", "operation", "process", "stage", "target"])
      || blueprint.attempts !== 1 || !contractBrand.has(blueprint.process)) {
    stop("PROCESS_BLUEPRINT_INVALID", "E18-Prozessblueprint ist nicht intern und exakt erzeugt.");
  }
  const expected = createRadarE18ProcessContract(blueprint.id, blueprint.target);
  if (!isDeepStrictEqual(blueprint.process, expected)) {
    stop("PROCESS_BLUEPRINT_DRIFT", "E18-Prozessblueprint besitzt unbekannte oder abweichende Felder.");
  }
  return blueprint;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export const RADAR_E18_READ_PREFLIGHT_SUBCODES = Object.freeze([
  "READ_PREFLIGHT_SHAPE_DRIFT",
  "READ_PREFLIGHT_LEDGER_SHAPE_DRIFT",
  "READ_PREFLIGHT_LEDGER_COUNT_DRIFT",
  "READ_PREFLIGHT_LEDGER_DIGEST_DRIFT",
  "READ_PREFLIGHT_FLAGS_DRIFT",
  "READ_PREFLIGHT_LIMITS_DRIFT",
  "READ_PREFLIGHT_SOURCES_DRIFT",
  "READ_PREFLIGHT_ACCOUNT_ROLE_DRIFT",
  "READ_PREFLIGHT_ACCOUNT_CAPABILITIES_DRIFT",
  "READ_PREFLIGHT_SURFACE_DRIFT",
  "READ_PREFLIGHT_WRITERS_DRIFT",
]);

const READ_PREFLIGHT_FLAG_KEYS = Object.freeze([
  "privateRequests", "privateScheduler", "providerApproved", "providerCurrent",
  "providerDpa", "providerFeature", "providerPrice", "providerRetention",
  "providerRights", "radarActive", "radarProposal", "radarProvider",
  "radarScheduler", "radarShares",
]);
const READ_PREFLIGHT_LIMIT_KEYS = Object.freeze([
  "modelMatches", "requestCap", "searchFee", "taskCap", "tokens",
]);
const READ_PREFLIGHT_ACCOUNT_KEYS = Object.freeze([
  "active", "personalAi", "pilot", "review",
]);
const READ_PREFLIGHT_SURFACE_KEYS = Object.freeze([
  "candidateLedger", "personColumn", "personRpc", "personTarget", "personUpsert",
]);

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function booleanObject(value, keys) {
  return exactObject(value, keys) && Object.values(value).every((entry) => typeof entry === "boolean");
}

function readPreflightShape(value) {
  return exactObject(value, ["account", "flags", "ledger", "limits", "sources", "surface", "writers"])
    && Array.isArray(value.ledger)
    && exactObject(value.flags, ["private", "provider", "radar"])
    && exactObject(value.flags.radar, ["proposal", "provider", "radar", "scheduler", "shares"])
    && Object.values(value.flags.radar).every((entry) => typeof entry === "boolean")
    && exactObject(value.flags.private, ["requests", "scheduler"])
    && Object.values(value.flags.private).every((entry) => typeof entry === "boolean")
    && exactObject(value.flags.provider, ["current", "dpa", "feature", "legal", "price", "retention", "rights"])
    && [
      value.flags.provider.current, value.flags.provider.dpa, value.flags.provider.feature,
      value.flags.provider.price, value.flags.provider.retention, value.flags.provider.rights,
    ].every((entry) => typeof entry === "boolean")
    && typeof value.flags.provider.legal === "string"
    && exactObject(value.limits, ["model", "requestCap", "searchFee", "taskCap", "tokens"])
    && typeof value.limits.model === "string"
    && nonnegativeInteger(value.limits.tokens)
    && [value.limits.requestCap, value.limits.searchFee, value.limits.taskCap].every(finiteNonnegative)
    && exactObject(value.sources, ["eligible", "families", "official"])
    && Object.values(value.sources).every(nonnegativeInteger)
    && exactObject(value.account, ["active", "personalAi", "pilot", "review", "role"])
    && typeof value.account.role === "string"
    && [value.account.active, value.account.personalAi, value.account.pilot, value.account.review]
      .every((entry) => typeof entry === "boolean")
    && exactObject(value.surface, READ_PREFLIGHT_SURFACE_KEYS)
    && [
      value.surface.candidateLedger, value.surface.personColumn,
      value.surface.personRpc, value.surface.personUpsert,
    ].every((entry) => typeof entry === "boolean")
    && nonnegativeInteger(value.surface.personTarget)
    && exactObject(value.writers, ["locks", "sessions"])
    && Object.values(value.writers).every(nonnegativeInteger);
}

function readPreflightLedgerShape(ledger) {
  if (!Array.isArray(ledger) || ledger.length < 1) return false;
  const identities = ledger.map((row) => {
    if (!exactObject(row, ["name", "version"])
        || typeof row.version !== "string" || !/^[0-9]{14}$/.test(row.version)
        || typeof row.name !== "string" || !/^[a-z0-9_]{1,128}$/.test(row.name)) {
      return null;
    }
    return `${row.version}:${row.name}`;
  });
  return !identities.includes(null)
    && new Set(identities).size === identities.length
    && isDeepStrictEqual(
      ledger.map(({ version }) => version),
      ledger.map(({ version }) => version).sort(),
    );
}

function readPreflightLedgerDigest(ledger) {
  const canonicalLedger = ledger.map(({ version, name }) => ({ version, name }));
  return sha256(Buffer.from(JSON.stringify(canonicalLedger), "utf8"));
}

function readPreflightFlags(value) {
  return Object.freeze({
    privateRequests: value.flags.private.requests,
    privateScheduler: value.flags.private.scheduler,
    providerApproved: value.flags.provider.legal === "APPROVED",
    providerCurrent: value.flags.provider.current,
    providerDpa: value.flags.provider.dpa,
    providerFeature: value.flags.provider.feature,
    providerPrice: value.flags.provider.price,
    providerRetention: value.flags.provider.retention,
    providerRights: value.flags.provider.rights,
    radarActive: value.flags.radar.radar,
    radarProposal: value.flags.radar.proposal,
    radarProvider: value.flags.radar.provider,
    radarScheduler: value.flags.radar.scheduler,
    radarShares: value.flags.radar.shares,
  });
}

function readPreflightLimits(value) {
  return Object.freeze({
    modelMatches: value.limits.model === "klein",
    requestCap: value.limits.requestCap,
    searchFee: value.limits.searchFee,
    taskCap: value.limits.taskCap,
    tokens: value.limits.tokens,
  });
}

function readPreflightAccountCapabilities(value) {
  return Object.freeze({
    active: value.account.active,
    personalAi: value.account.personalAi,
    pilot: value.account.pilot,
    review: value.account.review,
  });
}

function safeReadPreflightRole(value) {
  return value === "owner" || value === "member" ? value : "invalid";
}

function validReadPreflightEvidence(evidence) {
  if (!exactObject(evidence, ["code", "expected", "observed"])
      || !RADAR_E18_READ_PREFLIGHT_SUBCODES.includes(evidence.code)) return false;
  if (["READ_PREFLIGHT_SHAPE_DRIFT", "READ_PREFLIGHT_LEDGER_SHAPE_DRIFT"].includes(evidence.code)) {
    return evidence.expected === true && evidence.observed === false;
  }
  if (evidence.code === "READ_PREFLIGHT_LEDGER_COUNT_DRIFT") {
    return nonnegativeInteger(evidence.expected) && nonnegativeInteger(evidence.observed);
  }
  if (evidence.code === "READ_PREFLIGHT_LEDGER_DIGEST_DRIFT") {
    return [evidence.expected, evidence.observed].every((value) => (
      typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
    ));
  }
  if (evidence.code === "READ_PREFLIGHT_FLAGS_DRIFT") {
    return booleanObject(evidence.expected, READ_PREFLIGHT_FLAG_KEYS)
      && booleanObject(evidence.observed, READ_PREFLIGHT_FLAG_KEYS);
  }
  if (evidence.code === "READ_PREFLIGHT_LIMITS_DRIFT") {
    return exactObject(evidence.expected, READ_PREFLIGHT_LIMIT_KEYS)
      && exactObject(evidence.observed, READ_PREFLIGHT_LIMIT_KEYS)
      && evidence.expected.modelMatches === true
      && typeof evidence.observed.modelMatches === "boolean"
      && [...READ_PREFLIGHT_LIMIT_KEYS].filter((key) => key !== "modelMatches")
        .every((key) => finiteNonnegative(evidence.expected[key]) && finiteNonnegative(evidence.observed[key]));
  }
  if (evidence.code === "READ_PREFLIGHT_SOURCES_DRIFT") {
    return booleanObject(evidence.expected, ["eligible", "independent"])
      && booleanObject(evidence.observed, ["eligible", "independent"]);
  }
  if (evidence.code === "READ_PREFLIGHT_ACCOUNT_ROLE_DRIFT") {
    return evidence.expected === "owner" && ["owner", "member", "invalid"].includes(evidence.observed);
  }
  if (evidence.code === "READ_PREFLIGHT_ACCOUNT_CAPABILITIES_DRIFT") {
    return booleanObject(evidence.expected, READ_PREFLIGHT_ACCOUNT_KEYS)
      && booleanObject(evidence.observed, READ_PREFLIGHT_ACCOUNT_KEYS);
  }
  if (evidence.code === "READ_PREFLIGHT_SURFACE_DRIFT") {
    const valid = (entry) => exactObject(entry, READ_PREFLIGHT_SURFACE_KEYS)
      && [entry.candidateLedger, entry.personColumn, entry.personRpc, entry.personUpsert]
        .every((value) => typeof value === "boolean")
      && nonnegativeInteger(entry.personTarget);
    return valid(evidence.expected) && valid(evidence.observed);
  }
  if (evidence.code === "READ_PREFLIGHT_WRITERS_DRIFT") {
    const valid = (entry) => exactObject(entry, ["locks", "sessions"])
      && Object.values(entry).every(nonnegativeInteger);
    return valid(evidence.expected) && valid(evidence.observed);
  }
  return false;
}

function requireReadPreflightEvidencePath(evidencePath) {
  if (typeof evidencePath !== "string" || resolve(evidencePath) !== evidencePath
      || !evidencePath.startsWith("/private/tmp/")
      || basename(evidencePath) !== "read-preflight-stop.json") {
    stop("READ_PREFLIGHT_EVIDENCE_PATH_INVALID", "Read-Preflight-Belegpfad ist nicht exakt allowlistet.");
  }
  const root = dirname(evidencePath);
  try {
    const info = lstatSync(root);
    if (resolve(realpathSync(root)) !== root || !info.isDirectory() || info.isSymbolicLink()
        || (info.mode & 0o077) !== 0
        || (typeof process.getuid === "function" && info.uid !== process.getuid())
        || existsSync(evidencePath)) {
      stop("READ_PREFLIGHT_EVIDENCE_PATH_INVALID", "Read-Preflight-Belegraum ist nicht privat und leer.");
    }
  } catch (error) {
    if (error instanceof RadarE18ProcessStop) throw error;
    stop("READ_PREFLIGHT_EVIDENCE_PATH_INVALID", "Read-Preflight-Belegraum ist nicht pruefbar.");
  }
  return evidencePath;
}

function persistReadPreflightEvidence(evidencePath, evidence) {
  if (!validReadPreflightEvidence(evidence)) {
    stop("READ_PREFLIGHT_EVIDENCE_INVALID", "Read-Preflight-Beleg ist nicht allowlistbar.");
  }
  try {
    writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`, {
      encoding: "utf8", flag: "wx", mode: 0o600,
    });
    chmodSync(evidencePath, 0o600);
    const info = lstatSync(evidencePath);
    const readback = JSON.parse(readFileSync(evidencePath, "utf8"));
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
        || !isDeepStrictEqual(readback, evidence)) {
      throw new Error("evidence readback drift");
    }
  } catch (error) {
    try { if (existsSync(evidencePath)) rmSync(evidencePath, { force: true }); } catch { /* fail closed below */ }
    if (error instanceof RadarE18ProcessStop) throw error;
    stop("READ_PREFLIGHT_EVIDENCE_WRITE_FAILED", "Read-Preflight-Beleg konnte nicht sicher persistiert werden.");
  }
}

function stopReadPreflight(code, expected, observed, evidencePath, fehlerAusgabe) {
  const evidence = deepFreeze({ code, expected, observed });
  persistReadPreflightEvidence(evidencePath, evidence);
  try {
    fehlerAusgabe(JSON.stringify(evidence));
  } catch {
    stop("READ_PREFLIGHT_EVIDENCE_OUTPUT_FAILED", "Read-Preflight-Beleg konnte nicht sicher ausgegeben werden.");
  }
  const error = new RadarE18ProcessStop(code, "Read-Preflight stoppte beim ersten abweichenden Vergleich.");
  Object.defineProperty(error, "readPreflightEvidence", {
    value: evidence, enumerable: false, configurable: false, writable: false,
  });
  throw error;
}

export function validateRadarE18ReadPreflight({
  observed,
  expectedLedger,
  evidencePath,
  fehlerAusgabe = console.error,
} = {}) {
  if (typeof fehlerAusgabe !== "function") {
    stop("READ_PREFLIGHT_EVIDENCE_OUTPUT_INVALID", "Read-Preflight-Ausgabe fehlt.");
  }
  requireReadPreflightEvidencePath(evidencePath);
  if (!readPreflightLedgerShape(expectedLedger)) {
    stop("READ_PREFLIGHT_EXPECTATION_INVALID", "Read-Preflight-Sollerwartung ist formfremd.");
  }
  const mismatch = (code, expected, actual) => {
    if (!isDeepStrictEqual(actual, expected)) {
      stopReadPreflight(code, expected, actual, evidencePath, fehlerAusgabe);
    }
  };
  if (!readPreflightShape(observed)) {
    stopReadPreflight("READ_PREFLIGHT_SHAPE_DRIFT", true, false, evidencePath, fehlerAusgabe);
  }
  if (!readPreflightLedgerShape(observed.ledger)) {
    stopReadPreflight("READ_PREFLIGHT_LEDGER_SHAPE_DRIFT", true, false, evidencePath, fehlerAusgabe);
  }
  mismatch("READ_PREFLIGHT_LEDGER_COUNT_DRIFT", expectedLedger.length, observed.ledger.length);
  mismatch(
    "READ_PREFLIGHT_LEDGER_DIGEST_DRIFT",
    readPreflightLedgerDigest(expectedLedger),
    readPreflightLedgerDigest(observed.ledger),
  );
  mismatch("READ_PREFLIGHT_FLAGS_DRIFT", Object.freeze({
    privateRequests: false,
    privateScheduler: false,
    providerApproved: true,
    providerCurrent: true,
    providerDpa: true,
    providerFeature: false,
    providerPrice: true,
    providerRetention: true,
    providerRights: true,
    radarActive: false,
    radarProposal: false,
    radarProvider: false,
    radarScheduler: false,
    radarShares: false,
  }), readPreflightFlags(observed));
  mismatch("READ_PREFLIGHT_LIMITS_DRIFT", Object.freeze({
    modelMatches: true,
    requestCap: 500,
    searchFee: 1,
    taskCap: 5,
    tokens: 1200,
  }), readPreflightLimits(observed));
  mismatch("READ_PREFLIGHT_SOURCES_DRIFT", Object.freeze({
    eligible: true,
    independent: true,
  }), Object.freeze({
    eligible: observed.sources.eligible >= 1 && observed.sources.eligible <= 10,
    independent: observed.sources.official >= 1 || observed.sources.families >= 2,
  }));
  mismatch("READ_PREFLIGHT_ACCOUNT_ROLE_DRIFT", "owner", safeReadPreflightRole(observed.account.role));
  mismatch("READ_PREFLIGHT_ACCOUNT_CAPABILITIES_DRIFT", Object.freeze({
    active: true,
    personalAi: true,
    pilot: true,
    review: true,
  }), readPreflightAccountCapabilities(observed));
  mismatch("READ_PREFLIGHT_SURFACE_DRIFT", Object.freeze({
    candidateLedger: false,
    personColumn: false,
    personRpc: false,
    personTarget: 0,
    personUpsert: false,
  }), Object.freeze({ ...observed.surface }));
  mismatch("READ_PREFLIGHT_WRITERS_DRIFT", Object.freeze({
    locks: 0,
    sessions: 0,
  }), Object.freeze({ ...observed.writers }));
  return true;
}

export const RADAR_PERSON_CANDIDATE_RLS_TABLES = Object.freeze([
  "kd_radar_subscriptions",
  "kd_radar_events",
  "kd_radar_event_versions",
  "kd_radar_evidence",
  "kd_radar_operations",
]);

export const RADAR_PERSON_CANDIDATE_SURFACE_COMPARISONS = Object.freeze([
  "personTargets",
  "curatedTarget",
  "personColumns",
  "rpc",
  "upsert",
  "feed",
  "authRpc",
  "anonRpc",
  "authFeed",
  "anonFeed",
  ...RADAR_PERSON_CANDIDATE_RLS_TABLES.flatMap((table) => [
    `rls.${table}.enabled`,
    `rls.${table}.forced`,
  ]),
]);

function radarPersonCandidateRlsProjectionSql() {
  return RADAR_PERSON_CANDIDATE_RLS_TABLES.map((table) => `'${table}',(
      select jsonb_build_object(
        'enabled',c.relrowsecurity,
        'forced',c.relforcerowsecurity
      )
        from pg_class c
        join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='${table}'
    )`).join(",\n    ");
}

export function buildRadarPersonCandidateSurfaceSql() {
  return `select jsonb_build_object(
    'personTargets',(select count(*) from public.kd_radar_targets where target_type='person'),
    'curatedTarget',(select count(*) from public.kd_radar_targets
      where target_key='person:wikidata:Q42869:actor'
        and target_type='person'
        and target_status='active'
        and canonical_title='Nicolas Cage'
        and external_ids->>'personExternalId'='wikidata:Q42869'
        and external_ids->>'personRole'='actor'),
    'personColumns',(select count(*) from information_schema.columns
      where table_schema='public'
        and table_name='kd_radar_subscriptions'
        and column_name in ('person_external_id','person_role')),
    'rpc',to_regprocedure(
      'public.kd_radar_pilot_set_subscription(text,text,text,uuid,text,text)'
    ) is not null,
    'upsert',to_regprocedure(
      'public.kd_radar_websearch_upsert_person_event(uuid,uuid,jsonb)'
    ) is not null,
    'feed',to_regprocedure('public.kd_radar_pilot_feed(uuid[])') is not null,
    'authRpc',has_function_privilege(
      'authenticated',
      'public.kd_radar_pilot_set_subscription(text,text,text,uuid,text,text)',
      'EXECUTE'
    ),
    'anonRpc',has_function_privilege(
      'anon',
      'public.kd_radar_pilot_set_subscription(text,text,text,uuid,text,text)',
      'EXECUTE'
    ),
    'authFeed',has_function_privilege(
      'authenticated','public.kd_radar_pilot_feed(uuid[])','EXECUTE'
    ),
    'anonFeed',has_function_privilege(
      'anon','public.kd_radar_pilot_feed(uuid[])','EXECUTE'
    ),
    'rls',jsonb_build_object(
      ${radarPersonCandidateRlsProjectionSql()}
    )
  )::text;`;
}

function radarPersonCandidateSurfaceShape(value) {
  return exactObject(value, [
    "anonFeed", "anonRpc", "authFeed", "authRpc", "curatedTarget", "feed",
    "personColumns", "personTargets", "rls", "rpc", "upsert",
  ])
    && [value.personTargets, value.curatedTarget, value.personColumns].every(nonnegativeInteger)
    && [
      value.rpc, value.upsert, value.feed, value.authRpc, value.anonRpc,
      value.authFeed, value.anonFeed,
    ].every((entry) => typeof entry === "boolean")
    && exactObject(value.rls, RADAR_PERSON_CANDIDATE_RLS_TABLES)
    && RADAR_PERSON_CANDIDATE_RLS_TABLES.every((table) => (
      booleanObject(value.rls[table], ["enabled", "forced"])
    ));
}

function stopRadarPersonCandidateSurface(name, expected, observed, fehlerAusgabe) {
  const evidence = deepFreeze({ name, expected, observed });
  try {
    fehlerAusgabe(JSON.stringify(evidence));
  } catch {
    stop(
      "CANDIDATE_SURFACE_EVIDENCE_OUTPUT_FAILED",
      "Kandidaten-Surface-Beleg konnte nicht sicher ausgegeben werden.",
    );
  }
  const error = new RadarE18ProcessStop(
    "CANDIDATE_SURFACE_DRIFT",
    "Kandidaten-Surface stoppte beim ersten abweichenden allowlisteten Vergleich.",
  );
  Object.defineProperty(error, "candidateSurfaceEvidence", {
    value: evidence, enumerable: false, configurable: false, writable: false,
  });
  throw error;
}

export function validateRadarPersonCandidateSurface(
  observed,
  { fehlerAusgabe = console.error } = {},
) {
  if (typeof fehlerAusgabe !== "function") {
    stop(
      "CANDIDATE_SURFACE_EVIDENCE_OUTPUT_INVALID",
      "Kandidaten-Surface-Ausgabe fehlt.",
    );
  }
  if (!radarPersonCandidateSurfaceShape(observed)) {
    stopRadarPersonCandidateSurface("shape", true, false, fehlerAusgabe);
  }
  const comparisons = [
    ["personTargets", 5, observed.personTargets],
    ["curatedTarget", 1, observed.curatedTarget],
    ["personColumns", 2, observed.personColumns],
    ["rpc", true, observed.rpc],
    ["upsert", true, observed.upsert],
    ["feed", true, observed.feed],
    ["authRpc", true, observed.authRpc],
    ["anonRpc", false, observed.anonRpc],
    ["authFeed", true, observed.authFeed],
    ["anonFeed", false, observed.anonFeed],
    ...RADAR_PERSON_CANDIDATE_RLS_TABLES.flatMap((table) => [
      [`rls.${table}.enabled`, true, observed.rls[table].enabled],
      [`rls.${table}.forced`, false, observed.rls[table].forced],
    ]),
  ];
  if (!isDeepStrictEqual(
    comparisons.map(([name]) => name),
    RADAR_PERSON_CANDIDATE_SURFACE_COMPARISONS,
  )) {
    stop("CANDIDATE_SURFACE_CONTRACT_INVALID", "Kandidaten-Surface-Reihenfolge driftet.");
  }
  for (const [name, expected, actual] of comparisons) {
    if (!Object.is(actual, expected)) {
      stopRadarPersonCandidateSurface(name, expected, actual, fehlerAusgabe);
    }
  }
  return true;
}

export function verifyRadarE18CommittedSources({ gitSpawn = spawnSync } = {}) {
  if (typeof gitSpawn !== "function") stop("LOCAL_GIT_ADAPTER_REQUIRED", "E18-Gitgate fehlt.");
  const run = (args, { allowOne = false } = {}) => {
    const result = gitSpawn("/usr/bin/git", args, {
      cwd: REPO_ROOT,
      env: { LANG: "C", LC_ALL: "C", NO_COLOR: "1", PATH: "/usr/bin:/bin" },
      encoding: null,
      maxBuffer: 1024 * 1024,
      timeout: PROCESS_TIMEOUT,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!result || result.error || result.signal
        || (result.status !== 0 && !(allowOne && result.status === 1))) {
      stop("COMMITTED_SOURCE_GIT_FAILED", "E18-Quellclosure konnte nicht commitgebunden gelesen werden.");
    }
    return result;
  };
  const head = decodeUtf8(
    run(["rev-parse", "HEAD"]).stdout,
    "COMMITTED_SOURCE_HEAD_INVALID",
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(head)) stop("COMMITTED_SOURCE_HEAD_INVALID", "E18-HEAD ist kein Commit.");
  run(["ls-files", "--error-unmatch", "--", ...COMMITTED_EXECUTOR_PATHS]);
  const status = Buffer.from(run([
    "status", "--porcelain=v1", "--untracked-files=all", "--", ...COMMITTED_EXECUTOR_PATHS,
  ]).stdout || []);
  if (status.length !== 0) stop("COMMITTED_SOURCE_DIRTY", "E18-Effektcode ist nicht exakt committed.");
  const diff = run(["diff", "--quiet", "HEAD", "--", ...COMMITTED_EXECUTOR_PATHS], { allowOne: true });
  if (diff.status !== 0) stop("COMMITTED_SOURCE_DRIFT", "E18-Effektcode driftet von HEAD.");
  return Object.freeze({
    status: "E18_COMMITTED_SOURCES_OK",
    head,
    paths: COMMITTED_EXECUTOR_PATHS,
  });
}

function decodeUtf8(bytes, code) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(bytes || []));
  } catch {
    stop(code, "Prozessausgabe ist kein gueltiges UTF-8.");
  }
}

function parseJson(bytes, code) {
  const text = decodeUtf8(bytes, code).trim();
  try {
    return JSON.parse(text);
  } catch {
    stop(code, "Prozessausgabe ist kein einzelnes gueltiges JSON-Dokument.");
  }
}

function canonicalDump(bytes) {
  return decodeUtf8(bytes, "PG_DUMP_INVALID_UTF8")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("--") && !line.startsWith("\\restrict ")
      && !line.startsWith("\\unrestrict "))
    .join("\n")
    .trim();
}

function validateSecrets(payload) {
  if (!Array.isArray(payload)) stop("REMOTE_SECRETS_SHAPE_UNKNOWN", "Secretliste ist formfremd.");
  const names = [];
  for (const row of payload) {
    const keys = Object.keys(row || {}).sort();
    const knownShape = isDeepStrictEqual(keys, ["name", "value"])
      || isDeepStrictEqual(keys, ["name", "updated_at", "value"]);
    if (!knownShape || typeof row.name !== "string" || typeof row.value !== "string"
        || (Object.hasOwn(row, "updated_at")
          && !(typeof row.updated_at === "string" || row.updated_at === null))) {
      stop("REMOTE_SECRETS_SHAPE_UNKNOWN", "Secretliste besitzt unbekannte Felder.");
    }
    names.push(row.name);
  }
  if (new Set(names).size !== names.length) stop("REMOTE_SECRETS_DUPLICATE", "Secretliste ist mehrdeutig.");
  return Object.freeze(names);
}

const FUNCTION_KEYS = Object.freeze([
  "created_at", "entrypoint_path", "ezbr_sha256", "id", "import_map_path", "name",
  "import_map", "slug", "status", "updated_at", "verify_jwt", "version",
]);

function validateFunctions(payload) {
  if (!Array.isArray(payload)) stop("REMOTE_FUNCTIONS_SHAPE_UNKNOWN", "Functionliste ist formfremd.");
  return Object.freeze(payload.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)
        || Object.keys(row).some((key) => !FUNCTION_KEYS.includes(key))
        || typeof row.slug !== "string"
        || !["ACTIVE", "REMOVED", "THROTTLED"].includes(row.status)
        || !(typeof row.verify_jwt === "boolean" || row.verify_jwt === null
          || row.verify_jwt === undefined)
        || !Number.isSafeInteger(row.version) || row.version < 1) {
      stop("REMOTE_FUNCTIONS_SHAPE_UNKNOWN", "Functionliste besitzt unbekannte Felder.");
    }
    return Object.freeze({
      slug: row.slug,
      status: row.status,
      verifyJwt: row.verify_jwt,
      version: row.version,
    });
  }));
}

function validatePackageState(value) {
  if (!exactObject(value, ["ledger", "limits", "private", "provider", "providerGate", "radar"])
      || !Array.isArray(value.ledger)
      || !exactObject(value.radar, ["radar_aktiv", "radar_provider_aktiv", "radar_proposal_import_aktiv", "radar_scheduler_aktiv", "radar_shares_aktiv"])
      || !exactObject(value.private, ["ai_aktiv", "provider_requests_enabled", "scheduler_enabled"])
      || !exactObject(value.provider, ["dpa_transfer_confirmed", "feature_enabled", "legal_status", "price_budget_confirmed", "retention_confirmed", "review_current", "rights_confirmed"])
      || !exactObject(value.providerGate, ["code", "ok"])
      || !exactObject(value.limits, ["task_max_reservierung_usd_cent", "task_max_tokens", "task_modell", "websearch_usd_cent_pro_request"])) {
    stop("REMOTE_PACKAGE_STATE_UNKNOWN", "Paket-B-Projektion ist formfremd.");
  }
  const booleans = [
    ...Object.values(value.radar), ...Object.values(value.private),
    value.provider.feature_enabled, value.provider.rights_confirmed,
    value.provider.dpa_transfer_confirmed, value.provider.retention_confirmed,
    value.provider.price_budget_confirmed, value.provider.review_current,
  ];
  if (booleans.some((entry) => typeof entry !== "boolean")
      || typeof value.provider.legal_status !== "string"
      || typeof value.providerGate.ok !== "boolean" || typeof value.providerGate.code !== "string"
      || value.private.scheduler_enabled !== false
      || value.radar.radar_shares_aktiv !== false
      || value.radar.radar_scheduler_aktiv !== false
      || value.radar.radar_proposal_import_aktiv !== false
      || !value.provider.rights_confirmed || !value.provider.dpa_transfer_confirmed
      || !value.provider.retention_confirmed || !value.provider.price_budget_confirmed
      || value.provider.legal_status !== "APPROVED" || !value.provider.review_current) {
    stop("REMOTE_PACKAGE_GATE_CLOSED", "Paket-B-Provider-/Nebenflagvertrag ist nicht freigegeben.");
  }
  return value;
}

function validateConnectionUrl(text) {
  let url;
  try { url = new URL(text.trim()); } catch { stop("REMOTE_CONNECTION_METADATA_INVALID", "Linkmetadaten sind unlesbar."); }
  if (url.protocol !== "postgresql:" || url.password !== ""
      || url.username !== `postgres.${PROJECT_REF}`
      || !url.hostname.endsWith(".pooler.supabase.com")
      || !/^\d{2,5}$/.test(url.port) || url.pathname !== "/postgres"
      || url.search !== "" || url.hash !== "") {
    stop("REMOTE_CONNECTION_METADATA_INVALID", "Linkmetadaten sind nicht secretfrei und zielgebunden.");
  }
  return url.toString();
}

function flagsRestoreSql(preimage) {
  if (!preimage) stop("FLAG_PREIMAGE_REQUIRED", "Flag-Rueckbau braucht das exakte Preimage.");
  const bit = (value) => value === true ? "true" : value === false ? "false" : stop("FLAG_PREIMAGE_INVALID", "Flag-Preimage ist formfremd.");
  const jsonBit = (value) => `'${bit(value)}'::jsonb`;
  return `begin;\nupdate public.kd_ai_limits set wert=${jsonBit(preimage.aiActive)} where schluessel='ai_aktiv';\nupdate public.kd_private_settings set provider_requests_enabled=${bit(preimage.providerRequests)}, updated_at=now() where singleton;\nupdate public.kd_private_provider_registry set feature_enabled=${bit(preimage.providerFeature)}, updated_at=now() where provider_id='anthropic';\nupdate public.kd_radar_settings set radar_aktiv=${bit(preimage.radar)}, radar_provider_aktiv=${bit(preimage.radarProvider)}, updated_at=now() where singleton;\ncommit;`;
}

function cleanLiveEnv(ambient, tmp) {
  if (ambient?.KD_RADAR_TARGET_ID !== RADAR_E18_LIVE_TARGET_ID) {
    stop("LIVE_TARGET_INVALID", "Radar-Live-One-Shot besitzt nicht das exakt freigegebene Ziel.");
  }
  const env = {};
  for (const name of LIVE_ENV) {
    if (name === "TMPDIR") env[name] = tmp;
    else if (typeof ambient[name] === "string") env[name] = ambient[name];
  }
  env.LANG = env.LANG || "C";
  env.LC_ALL = "C";
  env.NO_COLOR = "1";
  env.PATH = "/usr/local/bin:/usr/bin:/bin";
  return env;
}

export function createRadarE18DefaultExecutor({
  spawn = spawnSync,
  ambientEnv = process.env,
  deriveClosure = deriveRadarPackageBReleaseClosure,
  createWorkspace = createRadarCliWorkspace,
  cleanupWorkspace = cleanupRadarCliWorkspace,
  committedSourceGate = verifyRadarE18CommittedSources,
  retainBackups = true,
  fs = {},
} = {}) {
  const io = {
    chmod: fs.chmod || chmodSync,
    copyFile: fs.copyFile || copyFileSync,
    exists: fs.exists || existsSync,
    lstat: fs.lstat || lstatSync,
    mkdir: fs.mkdir || mkdirSync,
    mkdtemp: fs.mkdtemp || mkdtempSync,
    readFile: fs.readFile || readFileSync,
    readdir: fs.readdir || readdirSync,
    remove: fs.remove || rmSync,
    stat: fs.stat || statSync,
    writeFile: fs.writeFile || writeFileSync,
  };
  const state = {
    closure: null,
    sourceClosure: null,
    workspace: null,
    projectDir: null,
    cliEnv: null,
    connectionUrl: null,
    credentials: { access: null, database: null, anthropic: null },
    started: new Set(),
    backups: new Map(),
    restores: new Map(),
    e17aLedger: null,
    migrationWorkspacePrepared: false,
    packagePreflight: null,
    functionPreflight: null,
    functionDeployment: null,
    flagsChanged: false,
    localServerMayBeRunning: false,
    cleaned: false,
  };

  const expectedPackageLedger = () => [
    ...state.e17aLedger,
    { version: MIGRATIONS[0], name: "blog_profile_extract_config" },
    { version: MIGRATIONS[1], name: "radar_websearch_mvp_package_a" },
    { version: MIGRATIONS[2], name: "radar_websearch_mvp_package_b" },
  ];

  const requirePackageDeploymentState = (value, { enabled }) => {
    const packageState = validatePackageState(value);
    const expectedFlags = enabled ? {
      aiActive: true,
      radar: true,
      radarProvider: true,
      providerRequests: true,
      providerFeature: true,
    } : state.packagePreflight;
    if (!expectedFlags
        || !isDeepStrictEqual(packageState.ledger, expectedPackageLedger())
        || packageState.private.ai_aktiv !== expectedFlags.aiActive
        || packageState.radar.radar_aktiv !== expectedFlags.radar
        || packageState.radar.radar_provider_aktiv !== expectedFlags.radarProvider
        || packageState.private.provider_requests_enabled !== expectedFlags.providerRequests
        || packageState.provider.feature_enabled !== expectedFlags.providerFeature
        || (enabled && (packageState.providerGate.ok !== true
          || packageState.providerGate.code !== "PROVIDER_ALLOWED"))
        || !isDeepStrictEqual(packageState.limits, {
          task_modell: "klein",
          task_max_tokens: 1200,
          task_max_reservierung_usd_cent: 5,
          websearch_usd_cent_pro_request: 1,
        })) {
      stop("PACKAGE_DEPLOYMENT_READBACK_DRIFT", "Paket-B-Readback ist vor dem Livepfad nicht exakt.");
    }
    return packageState;
  };

  const requireDeployedFunction = (functions, { requireAdvance }) => {
    const targets = functions.filter(({ slug }) => slug === FUNCTION_NAME);
    const prior = state.functionPreflight?.find(({ slug }) => slug === FUNCTION_NAME) || null;
    if (targets.length !== 1 || targets[0].verifyJwt !== true || targets[0].status !== "ACTIVE"
        || (requireAdvance && prior && targets[0].version <= prior.version)) {
      stop("FUNCTION_READBACK_DRIFT", "Radar-Function ist nicht eindeutig, aktiv, JWT-geschuetzt und frisch deployed.");
    }
    return targets[0];
  };

  const prepareProject = () => {
    const projectDir = join(state.workspace.runDir, "project");
    io.mkdir(projectDir, { mode: 0o700 });
    for (const path of ["supabase", MIGRATION_DIRECTORY, "supabase/functions", `supabase/functions/${FUNCTION_NAME}`]) {
      io.mkdir(join(projectDir, path), { mode: 0o700 });
    }
    const files = ["supabase/config.toml", ...PACKAGE_FUNCTION_FILES];
    const allowed = new Set(state.closure.paths);
    for (const path of files) {
      if (!allowed.has(path)) stop("ISOLATED_RELEASE_FILE_REJECTED", "Isolierter Arbeitsraum enthaelt keine belegte Datei.");
      const destination = join(projectDir, path);
      io.copyFile(join(REPO_ROOT, path), destination);
      io.chmod(destination, 0o600);
    }
    state.projectDir = projectDir;
  };

  const migrationIdentity = (file) => {
    const match = file.match(MIGRATION_FILE_PATTERN);
    return match ? Object.freeze({ file, version: match[1], name: match[2] }) : null;
  };

  const prepareMigrationWorkspace = () => {
    if (state.migrationWorkspacePrepared) {
      stop("MIGRATION_HISTORY_ALREADY_PREPARED", "Historischer Migrationskontext darf nur einmal materialisiert werden.");
    }
    const ledger = state.e17aLedger;
    if (!Array.isArray(ledger) || ledger.length < 1
        || !ledger.every((row) => exactObject(row, ["name", "version"])
          && /^[0-9]{14}$/.test(row.version)
          && /^[a-z0-9_]+$/.test(row.name))
        || new Set(ledger.map(({ version }) => version)).size !== ledger.length
        || !isDeepStrictEqual(ledger.map(({ version }) => version), ledger.map(({ version }) => version).sort())
        || ledger.some(({ version }) => MIGRATIONS.includes(version))) {
      stop("MIGRATION_HISTORY_LEDGER_INVALID", "Read-only Ledger ist keine eindeutige historische Migrationsclosure.");
    }

    const sourceDirectory = join(REPO_ROOT, MIGRATION_DIRECTORY);
    let entries;
    try {
      entries = io.readdir(sourceDirectory);
    } catch {
      stop("MIGRATION_HISTORY_SOURCE_INVALID", "Lokaler Migrationsbaum ist nicht lesbar.");
    }
    if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === "string")) {
      stop("MIGRATION_HISTORY_SOURCE_INVALID", "Lokaler Migrationsbaum liefert keine exakten Dateinamen.");
    }

    const sourcesByVersion = new Map();
    for (const file of entries) {
      const source = join(sourceDirectory, file);
      let info;
      try {
        info = io.lstat(source);
      } catch {
        stop("MIGRATION_HISTORY_SOURCE_INVALID", "Lokaler Migrationseintrag ist nicht sicher lesbar.");
      }
      if (!info?.isFile?.() || info.isSymbolicLink?.()) {
        stop("MIGRATION_HISTORY_SOURCE_INVALID", "Lokaler Migrationsbaum enthaelt keine ausschliesslich regulaeren Dateien.");
      }
      if (file === MIGRATION_README) continue;
      const identity = migrationIdentity(file);
      if (!identity) {
        stop("MIGRATION_HISTORY_SOURCE_INVALID", "Lokaler Migrationsbaum enthaelt einen formfremden Eintrag.");
      }
      if (sourcesByVersion.has(identity.version)) {
        stop("MIGRATION_HISTORY_BASELINE_DRIFT", "Lokaler Migrationsbaum enthaelt eine doppelte Version.");
      }
      sourcesByVersion.set(identity.version, Object.freeze({ ...identity, source }));
    }

    const packageIdentities = PACKAGE_MIGRATIONS.map((path) => migrationIdentity(basename(path)));
    if (packageIdentities.some((identity) => !identity)
        || !isDeepStrictEqual(packageIdentities.map(({ version }) => version), MIGRATIONS)
        || packageIdentities.some(({ version }) => version <= ledger.at(-1).version)) {
      stop("MIGRATION_HISTORY_PACKAGE_INVALID", "Paketmigrationen liegen nicht exakt und geordnet oberhalb des Remote-Ledgers.");
    }
    const expected = [
      ...ledger.map(({ version, name }) => Object.freeze({ version, name })),
      ...packageIdentities.map(({ version, name }) => Object.freeze({ version, name })),
    ];
    if (sourcesByVersion.size !== expected.length
        || expected.some(({ version, name }) => sourcesByVersion.get(version)?.name !== name)) {
      stop("MIGRATION_HISTORY_BASELINE_DRIFT", "Lokaler Migrationsbaum entspricht nicht exakt dem Read-only Ledger plus Paketclosure.");
    }

    const allowedPackagePaths = new Set(state.closure.paths);
    for (const path of PACKAGE_MIGRATIONS) {
      if (!allowedPackagePaths.has(path)) {
        stop("ISOLATED_RELEASE_FILE_REJECTED", "Paketmigration ist nicht releasegebunden.");
      }
    }
    try {
      for (const { version } of expected) {
        const source = sourcesByVersion.get(version);
        const destination = join(state.projectDir, MIGRATION_DIRECTORY, source.file);
        if (io.exists(destination)) {
          stop("MIGRATION_WORKSPACE_NOT_EMPTY", "Isolierter Migrationsarbeitsraum ist nicht leer.");
        }
        io.copyFile(source.source, destination);
        io.chmod(destination, 0o600);
        const info = io.stat(destination);
        if (!info.isFile() || (info.mode & 0o077) !== 0) {
          stop("MIGRATION_WORKSPACE_FILE_INVALID", "Isolierte Migrationsdatei ist nicht regulaer und 0600.");
        }
      }
    } catch (error) {
      if (error instanceof RadarE18ProcessStop) throw error;
      stop("MIGRATION_WORKSPACE_COPY_FAILED", "Historischer Migrationskontext konnte nicht sicher kopiert werden.");
    }
    state.migrationWorkspacePrepared = true;
  };

  const baseLocalEnv = () => ({
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
    PATH: `${PG17}:/usr/bin:/bin`,
    PGTZ: "UTC",
    TMPDIR: state.workspace?.tmp,
  });
  const psqlEnv = () => ({
    ...baseLocalEnv(),
    PGCONNECT_TIMEOUT: "20",
    PGPASSWORD: state.credentials.database,
    PGSSLMODE: "require",
  });
  const cliAuthEnv = (link = false) => ({
    ...state.cliEnv,
    SUPABASE_ACCESS_TOKEN: state.credentials.access,
    ...(link ? { SUPABASE_DB_PASSWORD: state.credentials.database } : {}),
  });

  const resolveValue = (token, runtime) => {
    const table = {
      "$RUN_PROJECT": state.projectDir,
      "$REMOTE_DB_URL": state.connectionUrl,
      "$BACKUP_FILE": runtime.backupFile,
      "$PREFLIGHT_BACKUP_FILE": runtime.preflightBackupFile,
      "$RESTORED_BACKUP_FILE": runtime.restoredBackupFile,
      "$RESTORE_ROOT": runtime.restoreRoot,
      "$RESTORE_DATA": runtime.restoreData,
      "$RESTORE_LOG": runtime.restoreLog,
      "$RESTORE_SOCKET": runtime.restoreSocket,
      "$RESTORE_PORT": String(runtime.restorePort ?? ""),
      "$RESTORE_OPTIONS": runtime.restoreOptions,
      "$PROJECTION_FILE": runtime.projectionFile,
      "$AUTH_PROJECTION_FILE": runtime.authProjectionFile,
      "$PROVIDER_ENV_FILE": runtime.providerEnvFile,
    };
    return Object.hasOwn(table, token) ? table[token] : token;
  };

  const envFor = (stepContract, runtime) => {
    let source;
    if (isDeepStrictEqual(stepContract.envNames, [...SECURITY_ENV].sort())) source = baseLocalEnv();
    else if (isDeepStrictEqual(stepContract.envNames, [...CLI_ENV].sort())) source = state.cliEnv;
    else if (isDeepStrictEqual(stepContract.envNames, [...CLI_AUTH_ENV].sort())) source = cliAuthEnv(false);
    else if (isDeepStrictEqual(stepContract.envNames, [...CLI_LINK_ENV].sort())) source = cliAuthEnv(true);
    else if (isDeepStrictEqual(stepContract.envNames, [...PSQL_ENV].sort())) source = psqlEnv();
    else if (isDeepStrictEqual(stepContract.envNames, [...LOCAL_PG_ENV].sort())) source = baseLocalEnv();
    else if (isDeepStrictEqual(stepContract.envNames, [...LIVE_ENV].sort())) source = cleanLiveEnv(ambientEnv, state.workspace.tmp);
    else stop("PROCESS_ENV_CONTRACT_UNKNOWN", "Prozessumgebung ist nicht allowlistet.");
    const env = {};
    for (const name of stepContract.envNames) {
      if (typeof source?.[name] !== "string") stop("PROCESS_ENV_VALUE_MISSING", "Erlaubter Prozessumgebungswert fehlt.");
      env[name] = source[name];
    }
    if (runtime.extraEnv) stop("PROCESS_ENV_EXTENSION_REJECTED", "Prozessumgebung darf nicht erweitert werden.");
    return env;
  };

  const stdinFor = (mode, runtime) => {
    if (mode === "ignore") return null;
    let value = null;
    if (mode === "sql:e17a-state") value = E17A_STATE_SQL;
    else if (mode === "sql:package-state") value = PACKAGE_STATE_SQL;
    else if (mode === "sql:package-flags-enable") value = PACKAGE_FLAG_ENABLE_SQL;
    else if (mode === "sql:package-flags-restore") value = flagsRestoreSql(state.packagePreflight);
    else if (mode === "sql:auth-id-projection") value = AUTH_ID_PROJECTION_SQL;
    else if (mode === "sql:restore-roles") value = E17B_RESTORE_SCAFFOLD.roles;
    else if (mode === "sql:restore-schema") value = E17B_RESTORE_SCAFFOLD.schema;
    else if (mode === "sql:restore-auth-ids") {
      if (typeof runtime.authProjectionFile !== "string"
          || !runtime.authProjectionFile.startsWith("/private/tmp/")
          || runtime.authProjectionFile.includes("'")) {
        stop("AUTH_ID_PROJECTION_PATH_INVALID", "Private Auth-ID-Projektion liegt nicht im erlaubten Tempbereich.");
      }
      value = `\\copy auth.users (id) FROM '${runtime.authProjectionFile}' WITH (FORMAT text)\n`;
    }
    if (typeof value !== "string") {
      stop("PROCESS_STDIN_CONTRACT_UNKNOWN", "Prozess-stdin ist nicht exakt gebunden.");
    }
    return value;
  };

  const removeProjection = (runtime) => {
    if (!runtime.projectionFile) return;
    if (typeof runtime.projectionFile !== "string"
        || !runtime.projectionFile.startsWith("/private/tmp/")) {
      stop("PROJECTION_PATH_INVALID", "Private E18-Projektion liegt nicht im erlaubten Tempbereich.");
    }
    try {
      if (io.exists(runtime.projectionFile)) {
        io.remove(runtime.projectionFile, { force: false });
      }
    } catch {
      stop("PROJECTION_CLEANUP_FAILED", "Private E18-Projektion konnte nicht entfernt werden.");
    }
  };

  const projectionDigest = (runtime) => {
    const path = runtime.projectionFile;
    try {
      if (typeof path !== "string" || !path.startsWith("/private/tmp/")) {
        stop("PROJECTION_PATH_INVALID", "Private E18-Projektion liegt nicht im erlaubten Tempbereich.");
      }
      const info = io.stat(path);
      if (!info.isFile() || (info.mode & 0o077) !== 0) {
        stop("PROJECTION_FILE_INVALID", "Private E18-Projektion ist nicht regulaer und 0600.");
      }
      const canonical = canonicalDump(io.readFile(path));
      return Object.freeze({
        sha256: sha256(canonical),
        lineCount: canonical === "" ? 0 : canonical.split("\n").length,
      });
    } catch (error) {
      if (error instanceof RadarE18ProcessStop) throw error;
      stop("PROJECTION_READ_FAILED", "Private E18-Projektion konnte nicht sicher gelesen werden.");
    } finally {
      removeProjection(runtime);
    }
  };

  const createProjection = (root, name) => {
    try {
      const rootInfo = io.stat(root);
      if (!rootInfo.isDirectory() || (rootInfo.mode & 0o077) !== 0) {
        stop("PROJECTION_ROOT_INVALID", "Privater E18-Projektionsraum ist nicht 0700.");
      }
      const path = join(root, `${name}.projection.sql`);
      io.writeFile(path, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
      io.chmod(path, 0o600);
      return path;
    } catch (error) {
      if (error instanceof RadarE18ProcessStop) throw error;
      stop("PROJECTION_CREATE_FAILED", "Private E18-Projektion konnte nicht angelegt werden.");
    }
  };

  const validateAuthProjection = (bytes) => {
    try {
      const receipt = parseAuthIdProjectionOutput(bytes, {
        secrets: Object.values(state.credentials).filter((value) => typeof value === "string"),
      });
      if (receipt.authIdCount < 1) throw new Error("empty auth projection");
      return receipt;
    } catch {
      stop("AUTH_ID_PROJECTION_INVALID", "Auth-ID-Projektion ist formfremd, leer, mehrspaltig oder driftet.");
    }
  };

  const createAuthProjection = (root, bytes, expected) => {
    const path = join(root, "auth-ids.txt");
    try {
      const rootInfo = io.stat(root);
      if (!rootInfo.isDirectory() || (rootInfo.mode & 0o077) !== 0) {
        stop("AUTH_ID_PROJECTION_ROOT_INVALID", "Privater Auth-ID-Projektionsraum ist nicht 0700.");
      }
      io.writeFile(path, Buffer.from(bytes), { flag: "wx", mode: 0o600 });
      io.chmod(path, 0o600);
      const info = io.stat(path);
      const observed = validateAuthProjection(io.readFile(path));
      if (!info.isFile() || (info.mode & 0o077) !== 0
          || !isDeepStrictEqual(observed, expected)) {
        stop("AUTH_ID_PROJECTION_FILE_INVALID", "Private Auth-ID-Projektion ist nicht exakt und 0600.");
      }
      return path;
    } catch (error) {
      if (error instanceof RadarE18ProcessStop) throw error;
      stop("AUTH_ID_PROJECTION_CREATE_FAILED", "Private Auth-ID-Projektion konnte nicht sicher angelegt werden.");
    }
  };

  const processFailureCode = (stepId) => (stepId === "supabase-version"
    ? "LOCAL_CLI_VERSION_FAILED"
    : (stepId.startsWith("postgresql-17-")
      ? "POSTGRESQL_VERSION_FAILED"
      : `PROCESS_${stepId.toUpperCase().replaceAll("-", "_")}_FAILED`));

  const runStep = (blueprint, stepId, runtime = {}) => {
    validateRadarE18ProcessContract(blueprint);
    const processStep = blueprint.process.steps.find(({ id }) => id === stepId);
    if (!processStep) stop("PROCESS_STEP_UNKNOWN", "E18-Prozessschritt ist nicht Teil des Blueprints.");
    const key = `${blueprint.id}:${stepId}`;
    if (state.started.has(key)) stop("PROCESS_STEP_ALREADY_STARTED", "E18-Prozessschritt darf nicht wiederholt werden.");
    state.started.add(key);
    const argv = processStep.argv.map((token) => resolveValue(token, runtime));
    const cwd = resolveValue(processStep.cwd, runtime);
    if (!processStep.binary.startsWith("/") || !cwd?.startsWith("/")
        || argv.some((arg) => typeof arg !== "string" || arg.includes("\0"))) {
      stop("PROCESS_RESOLUTION_INVALID", "E18-Prozess konnte nicht absolut und textuell aufgeloest werden.");
    }
    const input = stdinFor(processStep.stdin, runtime);
    let result;
    try {
      result = spawn(processStep.binary, argv, {
        cwd,
        env: envFor(processStep, runtime),
        encoding: null,
        input,
        maxBuffer: MAX_BUFFER,
        timeout: processStep.timeoutMs,
        shell: false,
        stdio: [input === null ? "ignore" : "pipe", processStep.stdout === "ignore" ? "ignore" : "pipe", "pipe"],
      });
    } catch {
      removeProjection(runtime);
      if (processStep.parser === "schema-preflight") {
        stop("RESTORE_SCOPE_DEPENDENCY_UNSUPPORTED", "Schema-Preflight stoppte vor dem Full-Restore.");
      }
      stop(processFailureCode(stepId), "E18-Prozessschritt schlug fail-closed fehl.");
    }
    if (processStep.parser === "live-one-shot" && result && !result.error && !result.signal) {
      const guardedOutput = decodeUtf8(
        Buffer.concat([Buffer.from(result.stdout || []), Buffer.from(result.stderr || [])]),
        "LIVE_OUTPUT_INVALID",
      );
      if (/BUDGET_UNBEKANNT/.test(guardedOutput)) {
        stop("BUDGET_UNBEKANNT", "Live-One-Shot meldete unbekannten Verbrauch.");
      }
      if (result.status === 75 || /AUTONOMIE_STOPP/.test(guardedOutput)) {
        stop("AUTONOMIE_STOPP", "Live-One-Shot meldete einen terminalen Autonomiestopp.");
      }
    }
    if (!result || result.error || result.signal || result.status !== 0) {
      removeProjection(runtime);
      if (processStep.parser === "schema-preflight") {
        stop("RESTORE_SCOPE_DEPENDENCY_UNSUPPORTED", "Schema-Preflight stoppte vor dem Full-Restore.");
      }
      stop(processFailureCode(stepId), "E18-Prozessschritt schlug fail-closed fehl.");
    }
    const stdout = Buffer.from(result.stdout || []);
    if (processStep.parser === "credential-line") {
      const value = decodeUtf8(stdout, "CREDENTIAL_OUTPUT_INVALID").replace(/\r?\n$/, "");
      if (!value || /[\0\r\n]/.test(value)) stop("CREDENTIAL_OUTPUT_INVALID", "Credentialausgabe ist formfremd.");
      return value;
    }
    if (processStep.parser === "json") return parseJson(stdout, "REMOTE_JSON_INVALID");
    if (processStep.parser === "auth-id-projection") {
      return Object.freeze({
        bytes: Buffer.from(stdout),
        receipt: validateAuthProjection(stdout),
      });
    }
    if (processStep.parser === "projection-digest") return projectionDigest(runtime);
    if (processStep.parser === "schema-preflight") return true;
    if (processStep.parser === "supabase-secrets-json") return validateSecrets(parseJson(stdout, "REMOTE_SECRETS_JSON_INVALID"));
    if (processStep.parser === "supabase-functions-json") return validateFunctions(parseJson(stdout, "REMOTE_FUNCTIONS_JSON_INVALID"));
    if (processStep.parser === "supabase-2.109.1") {
      if (decodeUtf8(stdout, "CLI_VERSION_INVALID").trim() !== "2.109.1") stop("SUPABASE_VERSION_MISMATCH", "Supabase-CLI-Version driftet.");
      return "2.109.1";
    }
    if (processStep.parser === "postgresql-17") {
      const version = decodeUtf8(stdout, "POSTGRESQL_VERSION_INVALID").trim();
      if (!/^(?:pg_dump|pg_restore|psql|initdb|pg_ctl|createdb) \(PostgreSQL\) 17\.\d+ \(Postgres\.app\)$/.test(version)) {
        stop("POSTGRESQL_VERSION_MISMATCH", "Lokale PostgreSQL-Werkzeugkette ist nicht Postgres.app 17.x.");
      }
      return version;
    }
    if (processStep.parser === "live-one-shot") {
      const output = decodeUtf8(Buffer.concat([stdout, Buffer.from(result.stderr || [])]), "LIVE_OUTPUT_INVALID");
      if (/AUTONOMIE_STOPP|BUDGET_UNBEKANNT/.test(output)) stop("AUTONOMIE_STOPP", "Live-One-Shot meldete einen terminalen Stopp.");
      return true;
    }
    if (processStep.parser === "backup-file") {
      if (!runtime.backupFile || !io.exists(runtime.backupFile)) stop("BACKUP_FILE_MISSING", "Backup-Artefakt fehlt.");
      io.chmod(runtime.backupFile, 0o600);
      const info = io.stat(runtime.backupFile);
      if (!info.isFile() || info.size < 1 || (info.mode & 0o077) !== 0) stop("BACKUP_FILE_INVALID", "Backup-Artefakt ist nicht regulaer und 0600.");
      return true;
    }
    if (processStep.parser === "restored-backup-file") {
      if (!runtime.restoredBackupFile || !io.exists(runtime.restoredBackupFile)) {
        stop("RESTORED_BACKUP_FILE_MISSING", "Enges Restore-Projektionsarchiv fehlt.");
      }
      io.chmod(runtime.restoredBackupFile, 0o600);
      const info = io.stat(runtime.restoredBackupFile);
      if (!info.isFile() || info.size < 1 || (info.mode & 0o077) !== 0) {
        stop("RESTORED_BACKUP_FILE_INVALID", "Enges Restore-Projektionsarchiv ist nicht regulaer und 0600.");
      }
      return true;
    }
    if (processStep.parser === "preflight-backup-file") {
      if (!runtime.preflightBackupFile || !io.exists(runtime.preflightBackupFile)) {
        stop("PREFLIGHT_BACKUP_FILE_MISSING", "Enges Preflight-Projektionsarchiv fehlt.");
      }
      io.chmod(runtime.preflightBackupFile, 0o600);
      const info = io.stat(runtime.preflightBackupFile);
      if (!info.isFile() || info.size < 1 || (info.mode & 0o077) !== 0) {
        stop("PREFLIGHT_BACKUP_FILE_INVALID", "Enges Preflight-Projektionsarchiv ist nicht regulaer und 0600.");
      }
      return true;
    }
    if (processStep.parser !== "opaque") stop("PROCESS_PARSER_UNKNOWN", "E18-Parservertrag ist unbekannt.");
    return true;
  };

  const ensureLocalReady = (cliBlueprint) => {
    if (state.workspace) return;
    if (typeof committedSourceGate !== "function") stop("COMMITTED_SOURCE_GATE_REQUIRED", "E18-Quellgate fehlt.");
    state.sourceClosure = committedSourceGate();
    if (!exactObject(state.sourceClosure, ["head", "paths", "status"])
        || state.sourceClosure.status !== "E18_COMMITTED_SOURCES_OK"
        || !/^[0-9a-f]{40}$/.test(state.sourceClosure.head)
        || !isDeepStrictEqual(state.sourceClosure.paths, COMMITTED_EXECUTOR_PATHS)) {
      stop("COMMITTED_SOURCE_GATE_INVALID", "E18-Quellgate lieferte keinen exakten Beleg.");
    }
    state.closure = deriveClosure();
    state.workspace = createWorkspace();
    try {
      prepareProject();
      state.cliEnv = buildRadarSupabaseCliEnvironment(state.workspace, { cliDirectory: dirname(SUPABASE) });
      const target = deepFreeze({ localOnly: true });
      const localBlueprint = cliBlueprint || deepFreeze({
        id: "package-b-local-cli",
        operation: "local-gate",
        stage: "package-b",
        attempts: 1,
        target,
        process: createRadarE18ProcessContract("package-b-local-cli", target),
      });
      for (const processStep of localBlueprint.process.steps) {
        runStep(localBlueprint, processStep.id);
      }
    } catch (error) {
      try { cleanupWorkspace(state.workspace); } catch { /* primaerer lokaler Stopp bleibt massgeblich */ }
      state.workspace = null;
      throw error;
    }
  };

  const readConnection = () => {
    const path = join(state.projectDir, CONNECTION_FILE);
    let text;
    try { text = io.readFile(path, "utf8"); } catch { stop("REMOTE_CONNECTION_METADATA_MISSING", "Supabase-Link lieferte keine Verbindungmetadaten."); }
    state.connectionUrl = validateConnectionUrl(String(text));
  };

  const backup = (blueprint, stage) => {
    const dir = io.mkdtemp(BACKUP_PREFIX);
    io.chmod(dir, 0o700);
    const backupFile = join(dir, `${stage}.dump`);
    let data;
    let auth;
    try {
      runStep(blueprint, `${stage}-backup-custom`, { backupFile });
      auth = runStep(blueprint, `${stage}-backup-auth-ids`);
      data = runStep(blueprint, `${stage}-backup-data`, {
        backupFile,
        projectionFile: createProjection(dir, `${stage}-data`),
      });
      const bytes = io.readFile(backupFile);
      const receipt = Object.freeze({
        status: "BACKUP_CREATED",
        artifactPath: backupFile,
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
      state.backups.set(stage, Object.freeze({
        ...receipt,
        dir,
        authProjection: auth,
        dataProjection: data,
      }));
      return receipt;
    } catch (error) {
      try { io.remove(dir, { recursive: true, force: true }); } catch { /* primaerer Stopp bleibt */ }
      throw error;
    }
  };

  const restore = (blueprint, stage, port) => {
    const source = state.backups.get(stage);
    if (!source) stop("BACKUP_RECEIPT_REQUIRED", "Restore besitzt kein gebundenes Backup.");
    const restoreRoot = join(state.workspace.runDir, `restore-${stage}`);
    const restoreData = join(restoreRoot, "data");
    const restoreSocket = join(restoreRoot, "socket");
    io.mkdir(restoreRoot, { mode: 0o700 });
    io.mkdir(restoreSocket, { mode: 0o700 });
    const runtime = {
      backupFile: source.artifactPath,
      restoreRoot,
      restoreData,
      restoreLog: join(restoreRoot, "postgres.log"),
      restoreSocket,
      restorePort: port,
      restoreOptions: `-c listen_addresses= -c unix_socket_directories=${restoreSocket} -p ${port}`,
      preflightBackupFile: join(restoreRoot, `${stage}-preflight-scoped.dump`),
      restoredBackupFile: join(restoreRoot, `${stage}-scoped.dump`),
    };
    if (!source.authProjection?.receipt || !Buffer.isBuffer(source.authProjection.bytes)) {
      stop("AUTH_ID_PROJECTION_REQUIRED", "Restore besitzt keine intern validierte Auth-ID-Projektion.");
    }
    runtime.authProjectionFile = createAuthProjection(
      restoreRoot,
      source.authProjection.bytes,
      source.authProjection.receipt,
    );
    let startAttempted = false;
    try {
      runStep(blueprint, `${stage}-restore-initdb`, runtime);
      startAttempted = true;
      state.localServerMayBeRunning = true;
      runStep(blueprint, `${stage}-restore-start`, runtime);
      runStep(blueprint, `${stage}-restore-roles`, runtime);
      runStep(blueprint, `${stage}-restore-preflight-createdb`, runtime);
      runStep(blueprint, `${stage}-restore-preflight-schema`, runtime);
      runStep(blueprint, `${stage}-restore-preflight-auth-ids`, runtime);
      runStep(blueprint, `${stage}-restore-preflight`, runtime);
      runStep(blueprint, `${stage}-restore-preflight-scoped-backup`, runtime);
      const preflightSchema = runStep(blueprint, `${stage}-restore-preflight-canonical-schema`, {
        ...runtime,
        projectionFile: createProjection(restoreRoot, `${stage}-preflight-schema`),
      });
      runStep(blueprint, `${stage}-restore-createdb`, runtime);
      runStep(blueprint, `${stage}-restore-schema-scaffold`, runtime);
      runStep(blueprint, `${stage}-restore-auth-ids`, runtime);
      runStep(blueprint, `${stage}-restore-restore`, runtime);
      runStep(blueprint, `${stage}-restore-scoped-backup`, runtime);
      const schema = runStep(blueprint, `${stage}-restore-schema`, {
        ...runtime,
        projectionFile: createProjection(restoreRoot, `${stage}-schema`),
      });
      const data = runStep(blueprint, `${stage}-restore-data`, {
        ...runtime,
        projectionFile: createProjection(restoreRoot, `${stage}-data`),
      });
      if (!isDeepStrictEqual(schema, preflightSchema)
          || !isDeepStrictEqual(data, source.dataProjection)) {
        stop("RESTORE_CONTENT_DRIFT", "Wegwerf-Restore weicht in Schema oder kanonischem Inhalt ab.");
      }
      runStep(blueprint, `${stage}-restore-stop`, runtime);
      state.localServerMayBeRunning = false;
      io.remove(restoreRoot, { recursive: true, force: false });
      const receipt = Object.freeze({
        status: "DISPOSABLE_RESTORE_VERIFIED",
        backupSha256: source.sha256,
        schemaSha256: preflightSchema.sha256,
        dataSha256: source.dataProjection.sha256,
      });
      state.restores.set(stage, receipt);
      return receipt;
    } catch (error) {
      if (startAttempted && !state.started.has(`${blueprint.id}:${stage}-restore-stop`)) {
        try {
          runStep(blueprint, `${stage}-restore-stop`, runtime);
          state.localServerMayBeRunning = false;
        } catch { /* primaerer Stopp bleibt; Arbeitsraum bleibt fuer manuellen Cleanup erhalten */ }
      }
      if (!state.localServerMayBeRunning) {
        try { io.remove(restoreRoot, { recursive: true, force: true }); } catch { /* primaerer Stopp bleibt */ }
      }
      throw error;
    }
  };

  const cleanupAll = () => {
    if (state.cleaned) stop("CLEANUP_ALREADY_RUN", "E18-Cleanup darf nicht wiederholt werden.");
    state.cleaned = true;
    state.credentials.access = null;
    state.credentials.database = null;
    state.credentials.anthropic = null;
    if (state.localServerMayBeRunning) {
      stop("LOCAL_RESTORE_PROCESS_UNCERTAIN", "Lokaler Restoreprozess braucht manuellen Cleanup; Arbeitsraum bleibt erhalten.");
    }
    if (!retainBackups) {
      for (const backupState of state.backups.values()) {
        if (io.exists(backupState.dir)) io.remove(backupState.dir, { recursive: true, force: false });
      }
    }
    if (state.workspace) cleanupWorkspace(state.workspace);
  };

  return async function executeBlueprint(blueprint, input = {}) {
    validateRadarE18ProcessContract(blueprint);
    const id = blueprint.id;
    if (id.startsWith("credential-")) {
      ensureLocalReady();
      const value = runStep(blueprint, `${id}-read`);
      if (id === "credential-supabase-access-token") state.credentials.access = value;
      else if (id === "credential-db-postgres-password") state.credentials.database = value;
      else state.credentials.anthropic = value;
      return value;
    }
    if (id === "e17a-remote-read") {
      runStep(blueprint, "supabase-link");
      readConnection();
      const result = runStep(blueprint, "e17a-state-read");
      state.e17aLedger = result?.ledger;
      return result;
    }
    if (id === "package-b-local-closure") { ensureLocalReady(); return state.closure; }
    if (id === "package-b-local-workspace") { ensureLocalReady(); return state.workspace; }
    if (id === "package-b-local-cli") {
      ensureLocalReady(blueprint);
      return "2.109.1";
    }
    if (id === "package-b-remote-read") {
      const packageState = validatePackageState(runStep(blueprint, "package-b-state-read"));
      if (!isDeepStrictEqual(packageState.ledger, state.e17aLedger)) stop("PACKAGE_LEDGER_BASELINE_DRIFT", "Paket-B-Ledger driftet vom E17A-Postflight.");
      prepareMigrationWorkspace();
      state.packagePreflight = Object.freeze({
        aiActive: packageState.private.ai_aktiv,
        radar: packageState.radar.radar_aktiv,
        radarProvider: packageState.radar.radar_provider_aktiv,
        providerRequests: packageState.private.provider_requests_enabled,
        providerFeature: packageState.provider.feature_enabled,
      });
      const secrets = runStep(blueprint, "package-b-secrets-list");
      state.functionPreflight = runStep(blueprint, "package-b-functions-list");
      return { anthropicApiKey: secrets.includes("ANTHROPIC_API_KEY") ? "PRESENT" : "MISSING" };
    }
    if (id === "package-b-provider-secret-write") {
      const secret = state.credentials.anthropic;
      if (typeof secret !== "string" || !/^[A-Za-z0-9._-]+$/.test(secret)) stop("PROVIDER_SECRET_FORMAT_REJECTED", "Providersecret kann nicht sicher als Env-Datei uebergeben werden.");
      const providerEnvFile = join(state.workspace.tmp, "radar-provider.env");
      try {
        io.writeFile(providerEnvFile, `ANTHROPIC_API_KEY=${secret}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
        io.chmod(providerEnvFile, 0o600);
        if ((io.lstat(providerEnvFile).mode & 0o077) !== 0) stop("PROVIDER_ENV_MODE_INVALID", "Provider-Env-Datei ist nicht 0600.");
        runStep(blueprint, "provider-secret-set", { providerEnvFile });
      } finally {
        if (io.exists(providerEnvFile)) io.remove(providerEnvFile, { force: false });
        state.credentials.anthropic = null;
      }
      const names = runStep(blueprint, "provider-secret-readback");
      if (!names.includes("ANTHROPIC_API_KEY")) stop("PROVIDER_SECRET_READBACK_MISSING", "Providersecret fehlt nach dem Write.");
      return { status: "PROVIDER_SECRET_CONFIGURED" };
    }
    if (id === "package-b-backup") {
      backup(blueprint, "package-b");
      return { status: "BACKUP_CREATED" };
    }
    if (id === "package-b-restore") {
      restore(blueprint, "package-b", 65432);
      return { status: "DISPOSABLE_RESTORE_VERIFIED" };
    }
    if (id === "package-b-migrations") {
      const backupReceipt = state.backups.get("package-b");
      const restoreReceipt = state.restores.get("package-b");
      if (backupReceipt?.status !== "BACKUP_CREATED"
          || restoreReceipt?.status !== "DISPOSABLE_RESTORE_VERIFIED"
          || restoreReceipt.backupSha256 !== backupReceipt.sha256) {
        stop(
          "MIGRATION_RESTORE_RECEIPT_REQUIRED",
          "E18-Mutationen brauchen das gebundene Backup und den erfolgreichen Wegwerf-Restore.",
        );
      }
      runStep(blueprint, "package-b-migration-up");
      requirePackageDeploymentState(
        runStep(blueprint, "package-b-migration-readback"),
        { enabled: false },
      );
      return { status: "MIGRATIONS_APPLIED" };
    }
    if (id === "package-b-function") {
      runStep(blueprint, "package-b-function-deploy");
      state.functionDeployment = requireDeployedFunction(
        runStep(blueprint, "package-b-function-readback"),
        { requireAdvance: true },
      );
      return { status: "FUNCTION_DEPLOYED" };
    }
    if (id === "package-b-secret-flags") {
      state.flagsChanged = true;
      runStep(blueprint, "package-b-flags-enable");
      requirePackageDeploymentState(
        runStep(blueprint, "package-b-flags-enabled-readback"),
        { enabled: true },
      );
      return { status: "SECRET_FLAGS_CONFIGURED" };
    }
    if (id === "package-b-live-request") {
      runStep(blueprint, "package-b-live-once");
      return { status: "LIVE_REQUEST_COMPLETE" };
    }
    if (id === "package-b-postflight") {
      requirePackageDeploymentState(
        runStep(blueprint, "package-b-state-postflight"),
        { enabled: true },
      );
      const secrets = runStep(blueprint, "package-b-secrets-postflight");
      const functions = runStep(blueprint, "package-b-functions-postflight");
      const deployed = requireDeployedFunction(functions, { requireAdvance: false });
      if (!secrets.includes("ANTHROPIC_API_KEY")
          || !state.functionDeployment
          || deployed.version !== state.functionDeployment.version) {
        stop("PACKAGE_DEPLOYMENT_POSTFLIGHT_DRIFT", "Function-/Secret-Postflight ist nicht exakt.");
      }
      return { status: "POSTFLIGHT_COMPLETE" };
    }
    if (id === "package-b-cleanup") {
      try {
        if (state.flagsChanged) {
          runStep(blueprint, "package-b-flags-restore");
          const restored = validatePackageState(runStep(blueprint, "package-b-flags-readback"));
          if (restored.private.ai_aktiv !== state.packagePreflight.aiActive
              || restored.radar.radar_aktiv !== state.packagePreflight.radar
              || restored.radar.radar_provider_aktiv !== state.packagePreflight.radarProvider
              || restored.private.provider_requests_enabled !== state.packagePreflight.providerRequests
              || restored.provider.feature_enabled !== state.packagePreflight.providerFeature) {
            stop("FLAG_RESTORE_DRIFT", "Paket-B-Flagpreimage wurde nicht exakt restauriert.");
          }
          state.flagsChanged = false;
        }
      } finally {
        cleanupAll();
      }
      return { status: "CLEANUP_COMPLETE" };
    }
    stop("PROCESS_EXECUTOR_ID_UNKNOWN", "Default-Executor kennt den Blueprint nicht.");
  };
}
