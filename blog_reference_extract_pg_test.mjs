import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pgConfig = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const pgCandidates = [
  process.env.KD_TEST_PG_BIN,
  "/Applications/Postgres.app/Contents/Versions/17/bin",
  pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
  "/usr/lib/postgresql/17/bin",
].filter(Boolean);
const required = ["initdb", "pg_ctl", "postgres", "psql"];
const PG = [...new Set(pgCandidates)].find((candidate) =>
  required.every((binary) => existsSync(join(candidate, binary)))
);
assert.ok(PG, `PostgreSQL 17 binaries are required (${required.join(", ")})`);

const root = mkdtempSync(join(tmpdir(), "kd-blog-reference-pg-"));
const data = join(root, "data");
const socket = join(root, "socket");
const port = String(56000 + (process.pid % 7000));
const migration = readFileSync(
  "supabase/migrations/20260918160000_blog_reference_extract.sql",
  "utf8",
);
mkdirSync(socket);
let running = false;
let checks = 0;

const pgEnv = { PATH: `${PG}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
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
    const child = spawn(join(PG, binary), args, {
      env: pgEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
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
const value = (output) => output.split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
const sessionSql = (query, role = "service_role") => `
  begin;
  set local role ${role};
  ${query};
  commit;
`;
const session = (query, role = "service_role") => value(sql(sessionSql(query, role)));
const sessionAsync = async (query, role = "service_role") => value(await sqlAsync(sessionSql(query, role)));
const quote = (input) => `'${String(input).replaceAll("'", "''")}'`;
const account = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const operation = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hmac = (n) => Number(n).toString(16).padStart(2, "0").repeat(32);

function prepare({ accountId, operationId, requestHmac, reservation = 20 }) {
  return `select public.kd_blog_reference_extract_prepare_v1(
    ${quote(accountId)}::uuid,${quote(operationId)}::uuid,${quote(requestHmac)},
    'blog-reference-extract-v1','gross','blog-reference-extract-v1',
    'blog-reference-extract-v1',${reservation})`;
}
const call = (statement, role = "service_role") => JSON.parse(session(statement, role));
const mark = (accountId, operationId) => call(
  `select public.kd_blog_reference_extract_provider_started_v1(${quote(accountId)}::uuid,${quote(operationId)}::uuid)`,
);
const finish = (accountId, operationId, succeeded, result = null) => call(
  `select public.kd_blog_reference_extract_finish_v1(${quote(accountId)}::uuid,${quote(operationId)}::uuid,${succeeded},${result === null ? "null" : `${quote(JSON.stringify(result))}::jsonb`})`,
);
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

try {
  assert.match(run("postgres", ["--version"]), /PostgreSQL\) 17\./);
  run("initdb", [
    "--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres",
    "--set", "shared_memory_type=mmap",
    "--set", "dynamic_shared_memory_type=posix",
    "--pgdata", data,
  ]);
  run("pg_ctl", [
    "--pgdata", data,
    "--log", join(root, "postgres.log"),
    "--options", `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,
    "--wait", "start",
  ]);
  running = true;

  sql(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    grant usage on schema auth to service_role;
    create table public.kd_ai_limits(schluessel text primary key,wert jsonb not null,notiz text);
    insert into public.kd_ai_limits values
      ('task_modell','{"echo-struct":"klein"}',null),
      ('task_max_tokens','{"echo-struct":256}',null),
      ('task_max_reservierung_usd_cent','{"echo-struct":1}',null);
    create table public.kd_account_access(
      account_id uuid primary key references auth.users(id) on delete cascade,
      active boolean not null,
      personal_ai boolean not null
    );
    create table public.kd_private_delete_map(
      storage_class text primary key,
      account_column text,
      action text not null,
      reason text not null
    );
    create schema cron;
    create table cron.job(jobid bigint generated always as identity primary key,jobname text, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
      declare v_id bigint; begin
        insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into v_id;
        return v_id;
      end $$;
    create function cron.unschedule(bigint) returns boolean language plpgsql as $$
      begin delete from cron.job where jobid=$1; return found; end $$;
    insert into auth.users select ${Array.from({ length: 30 }, (_, i) => `${quote(account(i + 1))}::uuid`).join(" union all select ")};
    insert into public.kd_account_access
      select id,true,true from auth.users;
  `);
  sql(migration);

  await check("migration pins task routing, token ceiling, cap and default-off flag", () => {
    assert.equal(sql(`select wert->>'blog-reference-extract' from public.kd_ai_limits where schluessel='task_modell'`), "gross");
    assert.equal(sql(`select wert->>'blog-reference-extract' from public.kd_ai_limits where schluessel='task_max_tokens'`), "8192");
    assert.equal(sql(`select wert->>'blog-reference-extract' from public.kd_ai_limits where schluessel='task_max_reservierung_usd_cent'`), "30");
    assert.equal(sql(`select wert::text from public.kd_ai_limits where schluessel='blog_reference_extract_enabled'`), "false");
  });

  await check("table and every task/export RPC are service-only", () => {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(sql(`select has_table_privilege('${role}','public.kd_blog_reference_extractions','select')`), "f");
      assert.equal(sql(`select has_function_privilege('${role}','public.kd_blog_reference_extract_prepare_v1(uuid,uuid,text,text,text,text,text,numeric)','execute')`), "f");
      assert.equal(sql(`select has_function_privilege('${role}','public.kd_blog_reference_extract_own_data(uuid)','execute')`), "f");
      assert.throws(() => session(`select public.kd_blog_reference_extract_own_data(${quote(account(1))}::uuid)`, role), /permission denied/);
    }
    assert.equal(sql(`select has_function_privilege('service_role','public.kd_blog_reference_extract_own_data(uuid)','execute')`), "t");
  });

  await check("feature flag and 30-cent boundary fail before a claim", () => {
    assert.equal(call(prepare({ accountId: account(1), operationId: operation(1), requestHmac: hmac(1) })).code, "ai-disabled");
    sql(`update public.kd_ai_limits set wert='true'::jsonb where schluessel='blog_reference_extract_enabled'`);
    assert.equal(call(prepare({ accountId: account(1), operationId: operation(1), requestHmac: hmac(1), reservation: 30.000001 })).grund, "blog-reference-task-kostenlimit");
    assert.equal(sql("select count(*) from public.kd_blog_reference_extractions"), "0");
  });

  await check("pre-provider cancellation frees the slot while provider-started work is terminal", () => {
    assert.equal(call(prepare({ accountId: account(1), operationId: operation(1), requestHmac: hmac(1) })).status, "new");
    assert.equal(call(prepare({ accountId: account(1), operationId: operation(2), requestHmac: hmac(2) })).grund, "blog-reference-konto-parallel");
    assert.equal(call(`select public.kd_blog_reference_extract_cancel_v1(${quote(account(1))}::uuid,${quote(operation(1))}::uuid)`).ok, true);
    assert.equal(call(prepare({ accountId: account(1), operationId: operation(1), requestHmac: hmac(1) })).status, "new");
    assert.equal(mark(account(1), operation(1)).ok, true);
    assert.equal(call(`select public.kd_blog_reference_extract_cancel_v1(${quote(account(1))}::uuid,${quote(operation(1))}::uuid)`).ok, false);
    assert.equal(call(prepare({ accountId: account(1), operationId: operation(2), requestHmac: hmac(1) })).code, "ai-duplicate");
  });

  await check("success is cached, bounded, immutable for 24h and explicitly exportable", () => {
    const stored = finish(account(1), operation(1), true, {
      contractVersion: "blog-reference-extract-v1",
      candidates: [],
      partial: false,
    });
    assert.equal(stored.status, "succeeded");
    assert.match(stored.data.expiresAt, /^\d{4}-\d\d-\d\dT/);
    const cached = call(prepare({ accountId: account(1), operationId: operation(2), requestHmac: hmac(1) }));
    assert.equal(cached.status, "cache_hit");
    assert.deepEqual(cached.data, stored.data);
    const exported = JSON.parse(session(`select public.kd_blog_reference_extract_own_data(${quote(account(1))}::uuid)`));
    assert.equal(exported.length, 1);
    assert.equal(exported[0].operationId, operation(1));
    assert.equal("account_id" in exported[0], false);
    assert.equal("request_hmac" in exported[0], false);
    assert.deepEqual(JSON.parse(session(`select public.kd_blog_reference_extract_own_data(${quote(account(2))}::uuid)`)), []);
    assert.equal(sql(`select extract(epoch from (expires_at-created_at))::int from public.kd_blog_reference_extractions where operation_id=${quote(operation(1))}::uuid`), "86400");
  });

  await check("cache API readerate stops the 61st read", () => {
    sql(`update public.kd_blog_reference_extractions set read_window_started_at=clock_timestamp(),read_count=60 where operation_id=${quote(operation(1))}::uuid`);
    assert.equal(call(prepare({ accountId: account(1), operationId: operation(3), requestHmac: hmac(1) })).grund, "blog-reference-leserate");
  });

  await check("atomic account lock admits only one of two concurrent starts", async () => {
    const attempts = await Promise.all([
      sessionAsync(prepare({ accountId: account(2), operationId: operation(20), requestHmac: hmac(20) })),
      sessionAsync(prepare({ accountId: account(2), operationId: operation(21), requestHmac: hmac(21) })),
    ]);
    const results = attempts.map(JSON.parse);
    assert.equal(results.filter((result) => result.status === "new").length, 1);
    assert.equal(results.filter((result) => result.grund === "blog-reference-konto-parallel").length, 1);
  });

  await check("global parallel boundary rejects the fifth active account", () => {
    sql(`delete from public.kd_blog_reference_extractions where status='running'`);
    for (let i = 3; i <= 6; i += 1) {
      assert.equal(call(prepare({ accountId: account(i), operationId: operation(30 + i), requestHmac: hmac(30 + i) })).status, "new");
    }
    assert.equal(call(prepare({ accountId: account(7), operationId: operation(37), requestHmac: hmac(37) })).grund, "blog-reference-global-parallel");
    sql(`delete from public.kd_blog_reference_extractions where status='running'`);
  });

  await check("three starts per minute and ten per Vienna day are enforced", () => {
    const accountId = account(8);
    for (let i = 0; i < 3; i += 1) {
      const op = operation(80 + i);
      assert.equal(call(prepare({ accountId, operationId: op, requestHmac: hmac(80 + i) })).status, "new");
      finish(accountId, op, false);
    }
    assert.equal(call(prepare({ accountId, operationId: operation(83), requestHmac: hmac(83) })).grund, "blog-reference-minute-limit");
    sql(`update public.kd_blog_reference_extractions set created_at=clock_timestamp()-interval '2 minutes' where account_id=${quote(accountId)}::uuid`);
    for (let i = 3; i < 10; i += 1) {
      const op = operation(80 + i);
      assert.equal(call(prepare({ accountId, operationId: op, requestHmac: hmac(80 + i) })).status, "new");
      finish(accountId, op, false);
      sql(`update public.kd_blog_reference_extractions set created_at=clock_timestamp()-interval '2 minutes' where operation_id=${quote(op)}::uuid`);
    }
    assert.equal(call(prepare({ accountId, operationId: operation(90), requestHmac: hmac(90) })).grund, "blog-reference-tageslimit");
  });

  await check("count/storage cap is independent of start-rate windows", () => {
    const accountId = account(9);
    sql(`insert into public.kd_blog_reference_extractions(
      account_id,operation_id,request_hmac,status,contract_version,model_alias,prompt_version,result_version,
      result,result_bytes,provider_started_at,finished_at,created_at,expires_at)
      select ${quote(accountId)}::uuid,('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        lpad(to_hex(120+n),64,'0'),'succeeded','blog-reference-extract-v1','gross',
        'blog-reference-extract-v1','blog-reference-extract-v1',
        '{"contractVersion":"blog-reference-extract-v1","candidates":[],"partial":false}'::jsonb,
        100,clock_timestamp(),clock_timestamp(),clock_timestamp()-interval '2 days',clock_timestamp()+interval '1 day'
      from generate_series(1,10) n`);
    assert.equal(call(prepare({ accountId, operationId: operation(99), requestHmac: hmac(99) })).grund, "blog-reference-speicherlimit");
  });

  await check("purge is bounded, hourly scheduled, and account deletion cascades", () => {
    const purgeAccount = account(10);
    sql(`insert into public.kd_blog_reference_extractions(
      account_id,operation_id,request_hmac,contract_version,model_alias,prompt_version,result_version,expires_at)
      values(${quote(purgeAccount)}::uuid,${quote(operation(100))}::uuid,${quote(hmac(100))},
      'blog-reference-extract-v1','gross','blog-reference-extract-v1','blog-reference-extract-v1',clock_timestamp()-interval '1 second')`);
    const purged = call("select public.kd_blog_reference_extract_purge_v1(200)");
    assert.equal(purged.ok, true);
    assert.equal(purged.purged >= 1, true);
    const cascadeAccount = account(11);
    sql(`insert into public.kd_blog_reference_extractions(
      account_id,operation_id,request_hmac,contract_version,model_alias,prompt_version,result_version)
      values(${quote(cascadeAccount)}::uuid,${quote(operation(110))}::uuid,${quote(hmac(110))},
      'blog-reference-extract-v1','gross','blog-reference-extract-v1','blog-reference-extract-v1')`);
    sql(`delete from auth.users where id=${quote(cascadeAccount)}::uuid`);
    assert.equal(sql(`select count(*) from public.kd_blog_reference_extractions where account_id=${quote(cascadeAccount)}::uuid`), "0");
    assert.equal(sql(`select schedule||'|'||command from cron.job where jobname='kd-blog-reference-extract-purge-v1'`), "17 * * * *|select public.kd_blog_reference_extract_purge_v1(200);");
    assert.equal(sql(`select action from public.kd_private_delete_map where storage_class='kd_blog_reference_extractions'`), "cascade");
  });

  console.log(`blog-reference PG17: ${checks} focused checks passed`);
} finally {
  if (running) {
    try { run("pg_ctl", ["--pgdata", data, "--mode", "immediate", "--wait", "stop"]); } catch { /* best effort */ }
  }
  rmSync(root, { recursive: true, force: true });
}
