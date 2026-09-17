/* E13-002: additive bucket retention against the real mail guards and retention SQL.
   The migration is loaded only into a fresh /private/tmp cluster: no Supabase
   connection, provider request, credential or shared database is involved. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pgConfig = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const pgCandidates = [
  process.env.KD_TEST_PG_BIN,
  "/Applications/Postgres.app/Contents/Versions/17/bin",
  pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
  "/usr/lib/postgresql/17/bin",

].filter(Boolean);
const requiredPgBinaries = ["initdb", "pg_ctl", "postgres", "psql"];
const PG = [...new Set(pgCandidates)].find((candidate) => (
  requiredPgBinaries.every((binary) => existsSync(join(candidate, binary)))
));
const MIGRATION = "supabase/migrations/20260902090000_private_mail_request_guards.sql";
const root = mkdtempSync("/private/tmp/kd-p12-retention-");
const data = join(root, "data");
const socket = join(root, "socket");
const port = "65477";
const migrationSql = readFileSync(MIGRATION, "utf8");
mkdirSync(socket);
let running = false;
let checks = 0;

assert.ok(PG, `PostgreSQL server binaries are required (${requiredPgBinaries.join(", ")})`);

const pgEnv = {
  PATH: `${PG}:/usr/bin:/bin`,
  LANG: "C",
  LC_ALL: "C",
};
function run(binary, args, input) {
  const result = spawnSync(join(PG, binary), args, {
    input,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8_000_000,
    env: pgEnv,
  });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function runAsync(binary, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(PG, binary), args, { env: pgEnv, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill("SIGKILL");
    }, 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (status !== 0) reject(new Error(`${binary}: ${stderr || `exit ${status}`}`));
      else resolve(stdout.trim());
    });
    child.stdin.end(input);
  });
}
const psqlArgs = ["-h", socket, "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", psqlArgs, query);
const sqlAsync = (query) => runAsync("psql", psqlArgs, query);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const outputValue = (output) => output.split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
const sessionSql = (query, role = "service_role", timezone = null) => `
  begin;
  set local role ${role};
  ${timezone === null ? "" : `set local time zone ${quote(timezone)};`}
  select set_config('request.jwt.claim.role',${quote(role)},true);
  ${query};
  commit;
`;
const session = (query, role = "service_role") => outputValue(sql(sessionSql(query, role)));
const sessionAsync = async (query, role = "service_role", timezone = null) => outputValue(await sqlAsync(sessionSql(query, role, timezone)));
const digest = (value) => Number(value).toString(16).padStart(2, "0").repeat(32);
const operationId = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function beginStatement({
  kind = "feedback",
  id,
  request = digest(1),
  account = null,
  globalBucket = digest(2),
  subjectBucket = digest(3),
  globalLimit = 10,
  globalWindow = 3600,
  subjectLimit = 10,
  subjectWindow = 3600,
}) {
  return `select public.kd_private_mail_request_begin(
    ${quote(kind)},${quote(id)}::uuid,${quote(request)},${account === null ? "null" : quote(account)},
    ${quote(globalBucket)},${quote(subjectBucket)},${globalLimit},${globalWindow},${subjectLimit},${subjectWindow}
  )`;
}
function finishStatement({ kind = "feedback", id, request = digest(1), status }) {
  return `select public.kd_private_mail_request_finish(
    ${quote(kind)},${quote(id)}::uuid,${quote(request)},${quote(status)}
  )`;
}
const beginRequest = (options) => JSON.parse(session(beginStatement(options)));
const finishRequest = (options) => JSON.parse(session(finishStatement(options)));
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const RETENTION = "supabase/migrations/20260917123000_review_mail_rate_bucket_retention.sql";
const retentionSql = readFileSync(RETENTION, "utf8");
const previousSql = readFileSync("supabase/migrations/20260815120000_private_export_radar_pilot_compat.sql", "utf8");
const previousFunction = previousSql.slice(previousSql.indexOf("create or replace function public.kd_private_retention_run("), previousSql.indexOf("\nrevoke all on table"));
const retain = (dry = true, limit = 200) => JSON.parse(session(`select public.kd_private_retention_run(${dry},${limit})`));
const count = (table) => Number(sql(`select count(*) from public.${table}`));
const buckets = "kd_private_mail_rate_buckets";
const operations = "kd_private_mail_request_operations";
const snapshot = (table) => sql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`);
function expiredFixtures(amount) {
  sql(`insert into public.${buckets}
    (kind,bucket_scope,bucket_sha256,window_started_at,window_seconds,request_count,updated_at,expires_at)
    select 'feedback','subject',md5(n::text)||md5(n::text),now()-interval '3 days',3600,1,
      now()-interval '3 days',now()-interval '2 days' from generate_series(1,${amount}) n`);
}

// Keep one real database transaction open until the competing RPC completes.
async function withHeldLock(statement, work) {
  const child = spawn(join(PG, "psql"), psqlArgs.slice(0, -2), { env: pgEnv, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let error = "";
  child.stderr.on("data", (chunk) => { error += chunk; });
  const exited = new Promise((resolve) => child.on("close", resolve));
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  try {
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => reject(new Error(`lock session exited ${code}: ${error}`)));
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("P12_LOCK_READY")) resolve();
      });
      child.stdin.write(`begin; ${statement};\n\\echo P12_LOCK_READY\n`);
    });
    await work();
  } finally {
    child.stdin.end("rollback;\n");
    const code = await exited;
    clearTimeout(timer);
    assert.equal(code, 0, error);
  }
}

try {
  assert.match(run("postgres", ["--version"]), /PostgreSQL\) 17\./);
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"),
    "--options", `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,
    "--wait", "start"]);
  running = true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable
      as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth to anon, authenticated, service_role;
    -- Unrelated retention tables are empty fixtures, not a full migration replay.
    create table public.kd_private_settings(singleton boolean, purge_enabled boolean);
    insert into public.kd_private_settings values(true,false);
    create table public.kd_radar_operations(created_at timestamptz, expires_at timestamptz);
    create table public.kd_radar_share_operations(created_at timestamptz, expires_at timestamptz);
    create table public.kd_radar_pilot_import_operations(created_at timestamptz, expires_at timestamptz);
    create table public.kd_radar_checks(check_id uuid, superseded_by uuid, expires_at timestamptz);
    create table public.kd_ai_log(gestartet_at timestamptz);
    create table public.kd_private_delete_operations(expires_at timestamptz);
    create table public.kd_radar_targets(target_id uuid, orphaned_at timestamptz);
    create table public.kd_radar_subscriptions(target_id uuid, subscription_status text);
    create table public.kd_radar_reviews(event_version_id uuid);
    create table public.kd_radar_event_versions(event_version_id uuid,event_id uuid);
    create table public.kd_radar_events(event_id uuid,target_id uuid);
  `);
  sql(migrationSql);
  sql(previousFunction);
  const frozenMailFunctions = sql(`select string_agg(pg_get_functiondef(oid), E'\n' order by proname)
    from pg_proc where proname in ('kd_private_mail_request_begin','kd_private_mail_request_finish')`);
  sql(retentionSql);
  check("additive migration preserves the actual begin/finish definitions", () => {
    assert.equal(sql(`select string_agg(pg_get_functiondef(oid), E'\n' order by proname)
      from pg_proc where proname in ('kd_private_mail_request_begin','kd_private_mail_request_finish')`), frozenMailFunctions);
    assert.doesNotMatch(retentionSql, /(?:delete from|update|alter table) public\.kd_private_mail_request_operations/i);
  });
  check("expiry index exists and RPC/table access remains service-only", () => {
    assert.match(sql("select indexdef from pg_indexes where indexname='kd_private_mail_rate_buckets_expires'"), /btree \(expires_at\)/);
    for (const role of ["anon", "authenticated"]) {
      assert.equal(sql(`select has_function_privilege('${role}','public.kd_private_retention_run(boolean,integer)','execute')`), "f");
      assert.throws(() => session("select public.kd_private_retention_run(true,2)", role), /permission denied/);
    }
    assert.equal(sql("select has_function_privilege('service_role','public.kd_private_retention_run(boolean,integer)','execute')"), "t");
    for (const table of [buckets, operations]) {
      assert.equal(sql(`select has_table_privilege('service_role','public.${table}','select,insert,update,delete')`), "f");
    }
  });
  const statuses = ["accepted", "rejected", "unknown", "claimed"];
  for (const [i, status] of statuses.entries()) {
    const id = operationId(i + 1);
    assert.equal(beginRequest({ id }).replay, false);
    if (status !== "claimed") assert.equal(finishRequest({ id, status }).status, status);
  }
  sql(`update public.${operations} set claimed_at=claimed_at-interval '8 days',
    finished_at=finished_at-interval '8 days',updated_at=updated_at-interval '8 days',expires_at=expires_at-interval '8 days';
    update public.${buckets} set window_started_at=window_started_at-interval '8 days',
      updated_at=updated_at-interval '8 days',expires_at=expires_at-interval '8 days';`);
  assert.equal(beginRequest({ id: operationId(10) }).replay, false);
  const oldOperations = snapshot(operations);
  const allBuckets = snapshot(buckets);
  const activeBuckets = sql(`select jsonb_agg(to_jsonb(b) order by bucket_scope) from public.${buckets} b where expires_at>now()`);
  check("dryrun reports only the two expired mail buckets, without any mutation", () => {
    const dry = retain();
    assert.equal(dry.ok, true);
    assert.equal(dry.dryRun, true);
    assert.deepEqual(dry.due, { mailRateBuckets: 2, operations: 0, shareOperations: 0,
      pilotImportOperations: 0, checks: 0, aiLogs: 0, deleteLedger: 0, orphanTargets: 0 });
    assert.equal(dry.result.purgedMailRateBuckets, 0);
    assert.equal(snapshot(buckets), allBuckets);
    assert.equal(snapshot(operations), oldOperations);
  });
  check("disabled purge deletes no buckets or operations", () => {
    assert.equal(retain(false).code, "PURGE_DISABLED");
    assert.equal(snapshot(buckets), allBuckets);
    assert.equal(snapshot(operations), oldOperations);
  });
  sql("update public.kd_private_settings set purge_enabled=true");
  check("enabled purge obeys limit one and preserves every active counter and operation", () => {
    assert.equal(retain(false, 1).result.purgedMailRateBuckets, 1);
    assert.equal(count(buckets), 3);
    assert.equal(retain(false, 1).result.purgedMailRateBuckets, 1);
    assert.equal(count(buckets), 2);
    assert.equal(retain().due.mailRateBuckets, 0);
    assert.equal(sql(`select jsonb_agg(to_jsonb(b) order by bucket_scope) from public.${buckets} b where expires_at>now()`), activeBuckets);
    assert.equal(snapshot(operations), oldOperations);
  });
  check("expired accepted/rejected/unknown/claimed IDs cannot reopen after purge", () => {
    const before = snapshot(buckets);
    for (const [i, status] of statuses.entries()) {
      const replay = beginRequest({ id: operationId(i + 1) });
      assert.equal(replay.replay, true);
      assert.equal(replay.status, status === "claimed" ? "unknown" : status);
      assert.equal(beginRequest({ id: operationId(i + 1), request: digest(99) }).code, "idempotency-conflict");
    }
    assert.equal(snapshot(buckets), before);
    assert.equal(count(operations), 5);
  });
  check("large batches clamp to 500, null defaults to 200 and zero clamps to one", () => {
    expiredFixtures(505);
    assert.equal(retain(true, "null").due.mailRateBuckets, 200);
    const capped = retain(false, 10000);
    assert.equal(capped.due.mailRateBuckets, 500);
    assert.equal(capped.result.purgedMailRateBuckets, 500);
    assert.equal(retain(false, 0).result.purgedMailRateBuckets, 1);
    assert.equal(retain(false).result.purgedMailRateBuckets, 4);
    assert.equal(count(buckets), 2);
  });
  check("repeated new windows keep expired storage bounded while active limits remain", () => {
    for (let i = 0; i < 3; i += 1) {
      expiredFixtures(3);
      assert.equal(beginRequest({ id: operationId(20 + i), globalLimit: 4, subjectLimit: 4 }).replay, false);
      assert.equal(retain(false, 2).result.purgedMailRateBuckets, 2);
      assert.equal(retain(false, 2).result.purgedMailRateBuckets, 1);
      assert.equal(count(buckets), 2);
    }
    assert.equal(beginRequest({ id: operationId(24), globalLimit: 4, subjectLimit: 4 }).code, "rate-limited");
    assert.equal(sql(`select string_agg(request_count::text,',' order by bucket_scope) from public.${buckets}`), "4,4");
  });
  expiredFixtures(7);
  const concurrent = await Promise.all([
    ...Array.from({ length: 12 }, (_, i) => sessionAsync(beginStatement({
      id: operationId(100 + i), globalBucket: digest(40), subjectBucket: digest(41),
      globalLimit: 4, subjectLimit: 4, globalWindow: 86400, subjectWindow: 86400,
    })).then(JSON.parse)),
    sessionAsync("select public.kd_private_retention_run(false,5)").then(JSON.parse),
  ]);
  check("twelve concurrent begins plus purge preserve the global/subject limit four", () => {
    assert.equal(concurrent.slice(0, 12).filter((r) => r.ok && !r.replay).length, 4);
    assert.equal(concurrent.slice(0, 12).filter((r) => r.code === "rate-limited").length, 8);
    assert.equal(concurrent[12].result.purgedMailRateBuckets, 5);
    assert.equal(sql(`select string_agg(request_count::text,',' order by bucket_scope) from public.${buckets}
      where bucket_sha256 in ('${digest(40)}','${digest(41)}')`), "4,4");
    assert.equal(retain(false).result.purgedMailRateBuckets, 2);
  });
  const repeated = await Promise.all(Array.from({ length: 4 }, () => sessionAsync(beginStatement({
    id: operationId(200), globalBucket: digest(50), subjectBucket: digest(51),
  })).then(JSON.parse)));
  check("concurrent replay consumes only one rate slot and creates only one operation", () => {
    assert.equal(repeated.filter((r) => r.ok && r.replay === false).length, 1);
    assert.equal(repeated.filter((r) => r.ok && r.replay === true).length, 3);
    assert.equal(sql(`select string_agg(request_count::text,',' order by bucket_scope) from public.${buckets}
      where bucket_sha256 in ('${digest(50)}','${digest(51)}')`), "1,1");
    assert.equal(sql(`select count(*) from public.${operations} where operation_id='${operationId(200)}'`), "1");
    assert.equal(retain().due.mailRateBuckets, 0);
  });
  expiredFixtures(2);
  await withHeldLock(`select ctid from public.${buckets} where expires_at<=now() order by expires_at limit 1 for update`, async () => {
    check("purge skips a concurrently locked expired row and removes only the available row", () => {
      assert.equal(retain(false, 2).result.purgedMailRateBuckets, 1);
      assert.equal(retain().due.mailRateBuckets, 1);
    });
  });
  check("released expired row is eligible on the next bounded run", () => {
    assert.equal(retain(false, 1).result.purgedMailRateBuckets, 1);
    assert.equal(retain().due.mailRateBuckets, 0);
  });
  await withHeldLock("select pg_advisory_xact_lock(hashtextextended('kd_private_retention_run',0))", async () => {
    check("existing retention advisory lock prevents overlapping purges", () => {
      assert.deepEqual(retain(false), { ok: false, code: "LOCKED" });
    });
  });
  console.log(`REVIEW49_P12_RETENTION: ${checks}/${checks} PostgreSQL 17 checks passed; synthetic local data only`);
} finally {
  if (running) run("pg_ctl", ["--pgdata", data, "--wait", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
