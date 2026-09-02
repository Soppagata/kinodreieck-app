/* Disposable local PostgreSQL test for the private-mail request guards.
   The migration is loaded only into a fresh /private/tmp cluster: no Supabase
   connection, provider request, credential or shared database is involved. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const PG = "/Applications/Postgres.app/Contents/Versions/17/bin";
const MIGRATION = "supabase/migrations/20260902090000_private_mail_request_guards.sql";
const root = mkdtempSync("/private/tmp/kd-private-mail-guards-");
const data = join(root, "data");
const socket = join(root, "socket");
const port = "65457";
const migrationSql = readFileSync(MIGRATION, "utf8");
mkdirSync(socket);
let running = false;
let checks = 0;

assert.equal(existsSync(join(PG, "postgres")), true, "Postgres.app 17 is required for this focused test");

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
    grant usage on schema auth to anon, authenticated, service_role;
  `);
  sql(migrationSql);

  const operationColumns = sql(`
    select column_name || ':' || data_type
      from information_schema.columns
     where table_schema='public' and table_name='kd_private_mail_request_operations'
     order by ordinal_position
  `).split("\n");
  const rateColumns = sql(`
    select column_name || ':' || data_type
      from information_schema.columns
     where table_schema='public' and table_name='kd_private_mail_rate_buckets'
     order by ordinal_position
  `).split("\n");
  check("Tabellen besitzen exakt die inhaltsfreien Spalten und keine Ledger-Verknuepfung", () => {
    assert.deepEqual(operationColumns, [
      "kind:text",
      "operation_id:uuid",
      "request_sha256:text",
      "account_sha256:text",
      "status:text",
      "result_code:text",
      "claimed_at:timestamp with time zone",
      "finished_at:timestamp with time zone",
      "updated_at:timestamp with time zone",
      "expires_at:timestamp with time zone",
    ]);
    assert.deepEqual(rateColumns, [
      "kind:text",
      "bucket_scope:text",
      "bucket_sha256:text",
      "window_started_at:timestamp with time zone",
      "window_seconds:integer",
      "request_count:integer",
      "updated_at:timestamp with time zone",
      "expires_at:timestamp with time zone",
    ]);
    const storedNames = [...operationColumns, ...rateColumns].map((entry) => entry.split(":")[0]);
    for (const forbidden of ["body", "content", "message", "email", "mail_address", "account_id", "ip", "origin", "header", "subject", "provider", "provider_id", "response", "payload"]) {
      assert.equal(storedNames.includes(forbidden), false, forbidden);
    }
    assert.equal(sql(`select count(*) from pg_constraint where conrelid='public.kd_private_mail_rate_buckets'::regclass and contype='f'`), "0");
  });

  check("Benannte Checks fixieren Typen, Digests, Statuscodes und 7d/24h-Expiry", () => {
    assert.deepEqual(sql(`
      select conname from pg_constraint
       where conrelid='public.kd_private_mail_request_operations'::regclass
       order by conname
    `).split("\n"), [
      "kd_private_mail_request_operations_account_scope_check",
      "kd_private_mail_request_operations_account_sha256_check",
      "kd_private_mail_request_operations_expiry_check",
      "kd_private_mail_request_operations_kind_check",
      "kd_private_mail_request_operations_pkey",
      "kd_private_mail_request_operations_request_sha256_check",
      "kd_private_mail_request_operations_result_check",
      "kd_private_mail_request_operations_status_check",
      "kd_private_mail_request_operations_time_check",
    ]);
    assert.deepEqual(sql(`
      select conname from pg_constraint
       where conrelid='public.kd_private_mail_rate_buckets'::regclass
       order by conname
    `).split("\n"), [
      "kd_private_mail_rate_buckets_count_check",
      "kd_private_mail_rate_buckets_kind_check",
      "kd_private_mail_rate_buckets_pkey",
      "kd_private_mail_rate_buckets_scope_check",
      "kd_private_mail_rate_buckets_sha256_check",
      "kd_private_mail_rate_buckets_time_check",
      "kd_private_mail_rate_buckets_window_check",
    ]);
    const operationChecks = sql(`select string_agg(pg_get_constraintdef(oid),' ') from pg_constraint where conrelid='public.kd_private_mail_request_operations'::regclass`);
    const rateChecks = sql(`select string_agg(pg_get_constraintdef(oid),' ') from pg_constraint where conrelid='public.kd_private_mail_rate_buckets'::regclass`);
    assert.match(operationChecks, /7 days/);
    for (const value of ["claimed", "accepted", "rejected", "unknown", "request-in-progress", "delivery-rejected", "delivery-status-unknown"]) assert.match(operationChecks, new RegExp(value));
    assert.match(rateChecks, /24:00:00/);
    assert.match(rateChecks, /10000/);
    assert.match(rateChecks, /86400/);
  });

  check("DDL leitet weder IP/Headers ab noch enthaelt es Hash-Secret oder Pepper", () => {
    assert.doesNotMatch(migrationSql, /inet_client_addr\s*\(|x-forwarded-for|cf-connecting-ip|request\.headers|\bpepper\b|\bsecret\b/i);
    assert.doesNotMatch(migrationSql, /\b(?:hmac|digest)\s*\(/i);
  });

  const beginSignature = "public.kd_private_mail_request_begin(text,uuid,text,text,text,text,integer,integer,integer,integer)";
  const finishSignature = "public.kd_private_mail_request_finish(text,uuid,text,text)";
  check("RLS, feste search_path und ausschließlich Service-RPC-Rechte sind wirksam", () => {
    for (const table of ["kd_private_mail_request_operations", "kd_private_mail_rate_buckets"]) {
      assert.equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`), "t");
      for (const role of ["anon", "authenticated", "service_role"]) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          assert.equal(sql(`select has_table_privilege('${role}','public.${table}','${privilege}')`), "f");
        }
      }
    }
    for (const signature of [beginSignature, finishSignature]) {
      assert.equal(sql(`select prosecdef and provolatile='v' and proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid=${quote(signature)}::regprocedure`), "t");
      assert.equal(sql(`select has_function_privilege('anon',${quote(signature)},'EXECUTE')`), "f");
      assert.equal(sql(`select has_function_privilege('authenticated',${quote(signature)},'EXECUTE')`), "f");
      assert.equal(sql(`select has_function_privilege('service_role',${quote(signature)},'EXECUTE')`), "t");
    }
    assert.throws(() => session(beginStatement({ id: operationId(90) }), "authenticated"), /permission denied/);
    assert.throws(() => session(`select count(*) from public.kd_private_mail_request_operations`, "service_role"), /permission denied/);
    assert.deepEqual(JSON.parse(sql(beginStatement({ id: operationId(91) }))), { ok: false, code: "forbidden" });
  });

  check("Accountdigest ist nur bei authentifizierter Löschanforderung zulässig", () => {
    assert.deepEqual(beginRequest({ id: operationId(1), account: digest(9) }), { ok: false, code: "invalid-request" });
    assert.deepEqual(beginRequest({ kind: "account-deletion-request", id: operationId(2) }), { ok: false, code: "invalid-request" });
    assert.deepEqual(beginRequest({ id: operationId(3), request: "ABC" }), { ok: false, code: "invalid-request" });
    assert.equal(sql(`select count(*) from public.kd_private_mail_request_operations`), "0");
    assert.throws(() => sql(`
      insert into public.kd_private_mail_request_operations(kind,operation_id,request_sha256)
      values('account-deletion-request',${quote(operationId(92))}::uuid,${quote(digest(1))})
    `), /account_scope_check/);
  });

  const first = {
    id: operationId(10),
    request: digest(10),
    globalBucket: digest(11),
    subjectBucket: digest(12),
  };
  check("Neue Operation claimt einmal und setzt exakt 7d/24h-Zeitgrenzen", () => {
    assert.deepEqual(beginRequest(first), {
      ok: true,
      replay: false,
      status: "claimed",
      resultCode: "request-in-progress",
    });
    assert.equal(sql(`select expires_at=claimed_at+interval '7 days' from public.kd_private_mail_request_operations where operation_id=${quote(first.id)}::uuid`), "t");
    assert.equal(sql(`select count(*)=2 and bool_and(request_count=1) and bool_and(expires_at=window_started_at+interval '24 hours') from public.kd_private_mail_rate_buckets where kind='feedback' and bucket_sha256 in (${quote(first.globalBucket)},${quote(first.subjectBucket)})`), "t");
  });

  check("Gleicher Key+Hash replayt ohne zweiten Rateverbrauch; anderer Hash konfligiert", () => {
    assert.deepEqual(beginRequest(first), {
      ok: true,
      replay: true,
      status: "claimed",
      resultCode: "request-in-progress",
    });
    assert.equal(sql(`select sum(request_count) from public.kd_private_mail_rate_buckets where kind='feedback' and bucket_sha256 in (${quote(first.globalBucket)},${quote(first.subjectBucket)})`), "2");
    assert.deepEqual(beginRequest({ ...first, request: digest(13) }), { ok: false, code: "idempotency-conflict" });
    assert.deepEqual(beginRequest({ ...first, kind: "operational-retry" }), { ok: false, code: "idempotency-conflict" });
    assert.equal(sql(`select sum(request_count) from public.kd_private_mail_rate_buckets where kind='feedback' and bucket_sha256 in (${quote(first.globalBucket)},${quote(first.subjectBucket)})`), "2");
  });

  check("claimed wird genau einmal accepted und kann nie wieder geöffnet werden", () => {
    assert.deepEqual(finishRequest({ id: first.id, request: first.request, status: "accepted" }), {
      ok: true,
      replay: false,
      status: "accepted",
      resultCode: "accepted",
    });
    for (const status of ["rejected", "unknown"]) {
      assert.deepEqual(finishRequest({ id: first.id, request: first.request, status }), {
        ok: true,
        replay: true,
        status: "accepted",
        resultCode: "accepted",
      });
    }
    assert.equal(beginRequest(first).status, "accepted");
    assert.equal(sql(`select count(*) from public.kd_private_mail_request_operations where operation_id=${quote(first.id)}::uuid and status='accepted' and finished_at is not null`), "1");
  });

  const deletion = {
    kind: "account-deletion-request",
    id: operationId(20),
    request: digest(20),
    account: digest(21),
    globalBucket: digest(22),
    subjectBucket: digest(23),
  };
  check("Löschanfrage speichert nur den Accountdigest und einen stabilen Reject-Code", () => {
    assert.equal(beginRequest(deletion).status, "claimed");
    assert.equal(sql(`select account_sha256 from public.kd_private_mail_request_operations where operation_id=${quote(deletion.id)}::uuid`), deletion.account);
    assert.deepEqual(finishRequest({ kind: deletion.kind, id: deletion.id, request: deletion.request, status: "rejected" }), {
      ok: true,
      replay: false,
      status: "rejected",
      resultCode: "delivery-rejected",
    });
  });

  const unknown = {
    kind: "operational-retry",
    id: operationId(30),
    request: digest(30),
    globalBucket: digest(31),
    subjectBucket: digest(32),
  };
  check("unknown ist terminal und bleibt beim Finish wie beim Begin fail-closed", () => {
    assert.equal(beginRequest(unknown).status, "claimed");
    assert.equal(finishRequest({ kind: unknown.kind, id: unknown.id, request: unknown.request, status: "unknown" }).status, "unknown");
    assert.deepEqual(finishRequest({ kind: unknown.kind, id: unknown.id, request: unknown.request, status: "accepted" }), {
      ok: true,
      replay: true,
      status: "unknown",
      resultCode: "delivery-status-unknown",
    });
    const before = sql(`select sum(request_count) from public.kd_private_mail_rate_buckets where kind='operational-retry'`);
    assert.equal(beginRequest(unknown).status, "unknown");
    assert.equal(sql(`select sum(request_count) from public.kd_private_mail_rate_buckets where kind='operational-retry'`), before);
  });

  check("Subject-Limit verwirft atomar, ohne einen freien Global-Bucket anzuzählen", () => {
    const sharedSubject = digest(40);
    assert.equal(beginRequest({ id: operationId(40), request: digest(41), globalBucket: digest(42), subjectBucket: sharedSubject, globalLimit: 5, subjectLimit: 1 }).status, "claimed");
    const rejected = beginRequest({ id: operationId(41), request: digest(43), globalBucket: digest(44), subjectBucket: sharedSubject, globalLimit: 5, subjectLimit: 1 });
    assert.deepEqual(rejected, { ok: false, code: "rate-limited" });
    assert.equal(sql(`select count(*) from public.kd_private_mail_rate_buckets where bucket_sha256=${quote(digest(44))}`), "0");
    assert.equal(sql(`select count(*) from public.kd_private_mail_request_operations where operation_id=${quote(operationId(41))}::uuid`), "0");
  });

  check("Global-Limit verwirft atomar, ohne einen freien Subject-Bucket anzuzählen", () => {
    const sharedGlobal = digest(50);
    assert.equal(beginRequest({ id: operationId(50), request: digest(51), globalBucket: sharedGlobal, subjectBucket: digest(52), globalLimit: 1, subjectLimit: 5 }).status, "claimed");
    const rejected = beginRequest({ id: operationId(51), request: digest(53), globalBucket: sharedGlobal, subjectBucket: digest(54), globalLimit: 1, subjectLimit: 5 });
    assert.deepEqual(rejected, { ok: false, code: "rate-limited" });
    assert.equal(sql(`select count(*) from public.kd_private_mail_rate_buckets where bucket_sha256=${quote(digest(54))}`), "0");
    assert.equal(sql(`select count(*) from public.kd_private_mail_request_operations where operation_id=${quote(operationId(51))}::uuid`), "0");
  });

  const concurrentBase = {
    globalBucket: digest(60),
    subjectBucket: digest(61),
    globalLimit: 1,
    subjectLimit: 1,
  };
  const concurrentInputs = [
    { ...concurrentBase, id: operationId(60), request: digest(62) },
    { ...concurrentBase, id: operationId(61), request: digest(63) },
  ];
  const concurrentTimezones = ["America/Los_Angeles", "Pacific/Auckland"];
  const concurrentResults = await Promise.all(concurrentInputs.map(async (input, index) =>
    JSON.parse(await sessionAsync(beginStatement(input), "service_role", concurrentTimezones[index]))));
  check("Parallele Requests in verschiedenen Session-Zeitzonen verbrauchen genau einen Platz", () => {
    assert.equal(concurrentResults.filter((value) => value.ok && value.replay === false).length, 1);
    assert.equal(concurrentResults.filter((value) => !value.ok && value.code === "rate-limited").length, 1);
    assert.equal(sql(`select count(*) from public.kd_private_mail_request_operations where operation_id in (${quote(operationId(60))}::uuid,${quote(operationId(61))}::uuid)`), "1");
    assert.equal(sql(`select count(*)=2 and bool_and(request_count=1) from public.kd_private_mail_rate_buckets where bucket_sha256 in (${quote(concurrentBase.globalBucket)},${quote(concurrentBase.subjectBucket)})`), "t");
  });

  check("Abgelaufener Claim wird unknown statt neu geöffnet oder erneut gezählt", () => {
    const expired = { id: operationId(70), request: digest(70), globalBucket: digest(71), subjectBucket: digest(72) };
    assert.equal(beginRequest(expired).status, "claimed");
    const before = sql(`select sum(request_count) from public.kd_private_mail_rate_buckets where bucket_sha256 in (${quote(expired.globalBucket)},${quote(expired.subjectBucket)})`);
    sql(`
      with boundary as (select clock_timestamp()-interval '8 days' as claimed_at)
      update public.kd_private_mail_request_operations o
         set claimed_at=boundary.claimed_at,
             updated_at=boundary.claimed_at,
             expires_at=boundary.claimed_at+interval '7 days'
        from boundary
       where o.operation_id=${quote(expired.id)}::uuid
    `);
    assert.deepEqual(beginRequest(expired), {
      ok: true,
      replay: true,
      status: "unknown",
      resultCode: "delivery-status-unknown",
    });
    assert.equal(sql(`select sum(request_count) from public.kd_private_mail_rate_buckets where bucket_sha256 in (${quote(expired.globalBucket)},${quote(expired.subjectBucket)})`), before);
    assert.equal(finishRequest({ id: expired.id, request: expired.request, status: "accepted" }).status, "unknown");
  });

  check("Tabellenchecks verweigern Rohformen und unstabile Zustandskombinationen", () => {
    assert.throws(() => sql(`
      insert into public.kd_private_mail_request_operations(
        kind,operation_id,request_sha256,status,result_code,claimed_at,finished_at,updated_at,expires_at
      ) values(
        'feedback',${quote(operationId(80))}::uuid,${quote(digest(80))},
        'accepted','request-in-progress',now(),now(),now(),now()+interval '7 days'
      )
    `), /result_check/);
    assert.throws(() => sql(`
      insert into public.kd_private_mail_rate_buckets(
        kind,bucket_scope,bucket_sha256,window_started_at,window_seconds,request_count,updated_at,expires_at
      ) values('feedback','ip',${quote(digest(81))},date_trunc('hour',now()),3600,1,now(),date_trunc('hour',now())+interval '24 hours')
    `), /scope_check/);
    assert.throws(() => sql(`
      insert into public.kd_private_mail_rate_buckets(
        kind,bucket_scope,bucket_sha256,window_started_at,window_seconds,request_count,updated_at,expires_at
      ) values('feedback','global','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',date_trunc('hour',now()),3600,1,now(),date_trunc('hour',now())+interval '24 hours')
    `), /sha256_check/);
  });

  console.log(`PRIVATE_MAIL_REQUEST_GUARDS: ${checks}/${checks} disposable PostgreSQL checks passed`);
} finally {
  if (running) run("pg_ctl", ["--pgdata", data, "--wait", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
