/* Disposable PostgreSQL 17 test for the Radar-to-retry binding. Only a fresh
   /private/tmp cluster and synthetic rows are used: no Supabase connection,
   provider request, mail, credential, or shared database. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pgConfig = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const candidates = [
  process.env.KD_TEST_PG_BIN,
  "/Applications/Postgres.app/Contents/Versions/17/bin",
  pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
  "/usr/lib/postgresql/17/bin",
  "/usr/lib/postgresql/16/bin",
].filter(Boolean);
const binaries = ["initdb", "pg_ctl", "postgres", "psql"];
const PG = [...new Set(candidates)].find((candidate) => (
  binaries.every((binary) => existsSync(join(candidate, binary)))
));
const ledgerSql = readFileSync(
  "supabase/migrations/20260903193000_automatic_ai_retry_jobs.sql",
  "utf8",
);
const bindingSql = readFileSync(
  "supabase/migrations/20260903213000_radar_automatic_retry_binding.sql",
  "utf8",
);
const root = mkdtempSync("/private/tmp/kd-radar-retry-binding-");
const data = join(root, "data");
const socket = join(root, "socket");
const port = String(55000 + (process.pid % 5000));
let running = false;
let checks = 0;

assert.ok(PG, `PostgreSQL server binaries are required (${binaries.join(", ")})`);
mkdirSync(socket);
const env = { PATH: `${PG}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
function run(binary, args, input) {
  const result = spawnSync(join(PG, binary), args, {
    input,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8_000_000,
    env,
  });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function runAsync(binary, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(PG, binary), args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (status) => {
      clearTimeout(timer);
      if (status !== 0) reject(new Error(`${binary}: ${stderr || `exit ${status}`}`));
      else resolve(stdout.trim());
    });
    child.stdin.end(input);
  });
}
const psql = ["-h", socket, "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", psql, query);
const sqlAsync = (query) => runAsync("psql", psql, query);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const last = (output) => output.split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
const sessionSql = (query, role = "service_role") => `
  begin;
  set local role ${role};
  select set_config('request.jwt.claim.role',${quote(role)},true);
  ${query};
  commit;
`;
const session = (query, role = "service_role") => last(sql(sessionSql(query, role)));
const sessionAsync = async (query, role = "service_role") => last(await sqlAsync(sessionSql(query, role)));
const ownerSessionAsync = async (query) => last(await sqlAsync(`
  begin;
  select set_config('request.jwt.claim.role','service_role',true);
  ${query};
  commit;
`));
const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const account = uuid(910001);
const day = "2026-09-03";

function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}
async function checkAsync(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}
function call(name, logical, operation) {
  return JSON.parse(session(`select public.${name}(
    ${quote(logical)}::uuid,${quote(operation)}::uuid
  )`));
}
function fixture(number, { kind = "work", title = `Werk ${number}` } = {}) {
  const target = uuid(920000 + number);
  const initialOperation = uuid(930000 + number);
  const logical = uuid(940000 + number);
  const key = kind === "text" ? `text:${String(number).padStart(16, "0")}` : `imdb:tt${String(number).padStart(7, "0")}`;
  const external = kind === "text"
    ? JSON.stringify({ targetText: title, contractVersion: "radar-text-v1", resolvedTargets: [] })
    : "{}";
  sql(`
    insert into public.kd_radar_targets(
      target_id,target_key,target_type,target_status,canonical_title,external_ids
    ) values(
      ${quote(target)}::uuid,${quote(key)},${quote(kind)},'active',${quote(title)},${quote(external)}::jsonb
    );
    insert into public.kd_radar_subscriptions(
      account_id,target_id,region,scope,subscription_status
    ) values(${quote(account)}::uuid,${quote(target)}::uuid,'AT','all','active');
    with timing as (select clock_timestamp() - interval '7 hours' as started_at)
    insert into public.kd_radar_daily_runs(
      account_id,target_id,vienna_day,claimed_at,lease_expires_at
    ) select ${quote(account)}::uuid,${quote(target)}::uuid,${quote(day)}::date,
             started_at - interval '30 seconds',started_at + interval '180 seconds'
        from timing;
    with timing as (select clock_timestamp() - interval '7 hours' as started_at)
    insert into public.kd_ai_log(
      account_id,vorgang_id,task,status,kosten_usd_cent,gestartet_at
    ) select ${quote(account)}::uuid,${quote(initialOperation)}::uuid,
             'radar-websearch','laufend',5,started_at from timing;
  `);
  const begun = JSON.parse(session(`select public.kd_automatic_ai_retry_job_begin(
    ${quote(logical)}::uuid,'radar-websearch-task',${quote(account)}::uuid,
    ${quote(target)}::uuid,${quote(day)}::date,${quote(initialOperation)}::uuid
  )`));
  assert.equal(begun.ok, true);
  const claimed = JSON.parse(session("select public.kd_automatic_ai_retry_due_claim()"));
  assert.equal(claimed.status, "retry-claimed");
  assert.equal(claimed.logicalJobId, logical);
  return { target, initialOperation, logical, retryOperation: claimed.retryProviderOperationId, key, title };
}

try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--pgdata", data]);
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
    create function auth.role() returns text language sql stable
      as $$select current_setting('request.jwt.claim.role',true)$$;
    create table auth.users(id uuid primary key);
    create table public.kd_ai_log(
      id bigint generated always as identity primary key,
      account_id uuid not null references auth.users(id) on delete cascade,
      vorgang_id uuid not null,
      task text not null,
      status text not null,
      input_tokens integer,
      output_tokens integer,
      kosten_usd_cent numeric,
      gestartet_at timestamptz not null,
      beendet_at timestamptz
    );
    create unique index kd_ai_log_vorgang on public.kd_ai_log(account_id,vorgang_id);
    create table public.kd_radar_targets(
      target_id uuid primary key,
      target_key text not null unique,
      target_type text not null,
      target_status text not null,
      canonical_title text not null,
      external_ids jsonb not null default '{}'::jsonb
    );
    create table public.kd_radar_daily_runs(
      account_id uuid not null references auth.users(id) on delete cascade,
      target_id uuid not null references public.kd_radar_targets(target_id) on delete cascade,
      vienna_day date not null,
      claimed_at timestamptz not null,
      lease_expires_at timestamptz not null,
      primary key(account_id,target_id,vienna_day)
    );
    create table public.kd_account_access(
      account_id uuid primary key references auth.users(id),
      active boolean not null,
      personal_ai boolean not null
    );
    create table public.kd_radar_capabilities(
      account_id uuid primary key references auth.users(id),
      radar_pilot boolean not null,
      radar_review boolean not null
    );
    create table public.kd_radar_subscriptions(
      account_id uuid not null references auth.users(id),
      target_id uuid not null references public.kd_radar_targets(target_id),
      region text not null,
      scope text not null,
      subscription_status text not null,
      person_external_id text,
      person_role text,
      primary key(account_id,target_id)
    );
    create table public.kd_radar_settings(
      singleton boolean primary key,
      radar_aktiv boolean not null,
      radar_provider_aktiv boolean not null,
      radar_scheduler_aktiv boolean not null
    );
    create function public.kd_private_provider_allowed(text) returns jsonb
      language sql stable as $$select jsonb_build_object('ok',true,'code','PROVIDER_ALLOWED')$$;
    create function public.kd_radar_text_target_key(p_text text) returns text
      language sql immutable strict as $$select 'text:' || right('0000000000000000' || regexp_replace(p_text,'[^0-9]','','g'),16)$$;
    create function public.kd_radar_websearch_context(p_account uuid,p_key text) returns jsonb
      language sql stable as $$
        select jsonb_build_object(
          'targetId',target.target_key,
          'canonicalTitle',target.canonical_title,
          'mediaType',case when target.target_type='series' then 'series' else 'film' end,
          'region','AT','scopes',jsonb_build_array('cinema','streaming')
        )
          from public.kd_radar_targets target
          join public.kd_radar_subscriptions subscription
            on subscription.target_id=target.target_id
         where subscription.account_id=p_account and target.target_key=p_key
           and subscription.subscription_status='active'
      $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    insert into auth.users(id) values(${quote(account)}::uuid);
    insert into public.kd_account_access values(${quote(account)}::uuid,true,true);
    insert into public.kd_radar_capabilities values(${quote(account)}::uuid,true,true);
    insert into public.kd_radar_settings values(true,true,true,true);
  `);
  sql(ledgerSql);
  sql(bindingSql);

  const signatures = [
    "public.kd_radar_automatic_retry_context(uuid,uuid)",
    "public.kd_radar_automatic_retry_assert(uuid,uuid)",
    "public.kd_radar_automatic_retry_result_proven(uuid,uuid)",
  ];
  check("RLS bleibt aktiv und alle drei Bindungs-RPCs sind service-role-only", () => {
    assert.equal(sql("select relrowsecurity from pg_class where oid='public.kd_automatic_ai_retry_jobs'::regclass"), "t");
    for (const signature of signatures) {
      assert.equal(sql(`select has_function_privilege('anon',${quote(signature)},'EXECUTE')`), "f");
      assert.equal(sql(`select has_function_privilege('authenticated',${quote(signature)},'EXECUTE')`), "f");
      assert.equal(sql(`select has_function_privilege('service_role',${quote(signature)},'EXECUTE')`), "t");
      assert.equal(sql(`select prosecdef and proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid=${quote(signature)}::regprocedure`), "t");
    }
    assert.throws(() => session(`select public.kd_radar_automatic_retry_assert(
      ${quote(uuid(1))}::uuid,${quote(uuid(2))}::uuid
    )`, "authenticated"), /permission denied/);
  });

  const work = fixture(1);
  check("Kontext stammt nur aus exakt passender Job-/Retryoperation", () => {
    const context = call("kd_radar_automatic_retry_context", work.logical, work.retryOperation);
    assert.equal(context.ok, true);
    assert.equal(context.code, "retry-bound");
    assert.equal(context.logicalJobId, work.logical);
    assert.equal(context.retryProviderOperationId, work.retryOperation);
    assert.equal(context.accountId, account);
    assert.equal(context.targetRowId, work.target);
    assert.equal(context.radarViennaDay, day);
    assert.equal(context.targetId, work.key);
    assert.equal(context.targetText, null);
    assert.equal(context.request.targetId, work.key);
    assert.equal(context.request.canonicalTitle, work.title);
    assert.deepEqual(
      call("kd_radar_automatic_retry_context", work.logical, uuid(999999)),
      { ok: false, code: "unavailable" },
    );
  });

  await checkAsync("Parallele Assertions sind read-only, exakt und verbrauchen keinen weiteren Retry", async () => {
    const statement = `select public.kd_radar_automatic_retry_assert(
      ${quote(work.logical)}::uuid,${quote(work.retryOperation)}::uuid
    )`;
    const results = await Promise.all([sessionAsync(statement), sessionAsync(statement)]);
    assert.deepEqual(results.map(JSON.parse), [
      { ok: true, code: "retry-claimed" },
      { ok: true, code: "retry-claimed" },
    ]);
    assert.equal(sql(`select retry_consumed and retry_status='claimed'
      and retry_provider_operation_id=${quote(work.retryOperation)}::uuid
      from public.kd_automatic_ai_retry_jobs
      where logical_job_id=${quote(work.logical)}::uuid`), "t");
    assert.equal(sql("select count(*) from public.kd_automatic_ai_retry_jobs"), "1");
  });

  check("Erfolgsbeleg verlangt die exakt gebundene terminale positive Logzeile", () => {
    assert.deepEqual(call("kd_radar_automatic_retry_result_proven", work.logical, work.retryOperation), {
      ok: false, code: "unproven",
    });
    sql(`insert into public.kd_ai_log(
      account_id,vorgang_id,task,status,input_tokens,output_tokens,
      kosten_usd_cent,gestartet_at,beendet_at
    ) values(
      ${quote(account)}::uuid,${quote(work.retryOperation)}::uuid,
      'radar-websearch','fertig',12,0,1.25,
      clock_timestamp(),clock_timestamp()
    )`);
    assert.deepEqual(call("kd_radar_automatic_retry_result_proven", work.logical, work.retryOperation), {
      ok: true, code: "retry-succeeded",
    });
    sql(`update public.kd_ai_log set kosten_usd_cent=0
      where vorgang_id=${quote(work.retryOperation)}::uuid`);
    assert.equal(call("kd_radar_automatic_retry_result_proven", work.logical, work.retryOperation).ok, false);
    sql(`update public.kd_ai_log set kosten_usd_cent=1.25,input_tokens=null
      where vorgang_id=${quote(work.retryOperation)}::uuid`);
    assert.equal(call("kd_radar_automatic_retry_result_proven", work.logical, work.retryOperation).ok, false);
    sql(`update public.kd_ai_log set input_tokens=12
      where vorgang_id=${quote(work.retryOperation)}::uuid`);
  });

  const text = fixture(2, { kind: "text", title: "Text 2" });
  check("Textziel und Konto werden ebenfalls ausschliesslich aus dem Ledger geladen", () => {
    const context = call("kd_radar_automatic_retry_context", text.logical, text.retryOperation);
    assert.equal(context.ok, true);
    assert.equal(context.accountId, account);
    assert.equal(context.targetId, text.key);
    assert.equal(context.targetText, text.title);
    assert.deepEqual(context.request, {
      kind: "text",
      targetId: text.key,
      targetText: text.title,
      region: "AT",
      scopes: ["cinema", "streaming", "series_start", "season_start"],
    });
    assert.deepEqual(call("kd_radar_automatic_retry_context", work.logical, text.retryOperation), {
      ok: false, code: "unavailable",
    });
  });

  await checkAsync("Dieselbe gebundene Retryoperation kann parallel nur eine Kostenzeile reservieren", async () => {
    const statement = `with reserved as (
      insert into public.kd_ai_log(
        account_id,vorgang_id,task,status,kosten_usd_cent,gestartet_at
      ) values(
        ${quote(account)}::uuid,${quote(text.retryOperation)}::uuid,
        'radar-websearch','laufend',5,clock_timestamp()
      ) on conflict(account_id,vorgang_id) do nothing
      returning 1
    ) select coalesce((select 1 from reserved),0)`;
    const results = await Promise.all([ownerSessionAsync(statement), ownerSessionAsync(statement)]);
    assert.deepEqual(results.map(Number).sort(), [0, 1]);
    assert.equal(sql(`select count(*) from public.kd_ai_log
      where account_id=${quote(account)}::uuid
        and vorgang_id=${quote(text.retryOperation)}::uuid`), "1");
    sql(`update public.kd_ai_log
      set status='fehler',beendet_at=clock_timestamp()
      where account_id=${quote(account)}::uuid
        and vorgang_id=${quote(text.retryOperation)}::uuid`);
  });

  check("Deaktivierung sperrt neuen Context; nur terminaler Abschluss schliesst den exakten Claim", () => {
    sql("update public.kd_radar_settings set radar_scheduler_aktiv=false where singleton");
    assert.equal(call("kd_radar_automatic_retry_context", text.logical, text.retryOperation).ok, false);
    assert.equal(call("kd_radar_automatic_retry_assert", text.logical, text.retryOperation).ok, true);
    sql("update public.kd_radar_settings set radar_scheduler_aktiv=true where singleton");
    const finished = JSON.parse(session(`select public.kd_automatic_ai_retry_finish(
      ${quote(text.logical)}::uuid,${quote(text.retryOperation)}::uuid,
      'failed','retry-execution-failed'
    )`));
    assert.equal(finished.status, "failed");
    assert.equal(call("kd_radar_automatic_retry_assert", text.logical, text.retryOperation).ok, false);
    assert.equal(call("kd_radar_automatic_retry_context", text.logical, text.retryOperation).ok, false);
  });

  check("Migration fuegt nur inhaltsfreie RPCs hinzu und keine zweite Retryplanung", () => {
    assert.doesNotMatch(bindingSql, /create\s+table|alter\s+table\s+public\.kd_automatic_ai_retry_jobs\s+add/i);
    assert.doesNotMatch(bindingSql, /update\s+public\.kd_automatic_ai_retry_jobs|interval\s+'6 hours'/i);
    assert.doesNotMatch(bindingSql, /http_post|net\.http|cron\.|resend|authorization/i);
    assert.match(bindingSql, /p_logical_job_id uuid[\s\S]+p_retry_provider_operation_id uuid/);
    assert.match(bindingSql, /log\.vorgang_id = job\.retry_provider_operation_id/);
  });
} finally {
  if (running) {
    try { run("pg_ctl", ["--pgdata", data, "--mode", "immediate", "--wait", "stop"]); } catch { /* cleanup below */ }
  }
  rmSync(root, { recursive: true, force: true });
}

console.log(`${checks} Radar-Automatic-Retry-Binding-PG17-Checks bestanden.`);
