/* Disposable PostgreSQL 17 test for the automatic +6h AI retry ledger.
   Only a fresh /private/tmp cluster and synthetic rows are used: no Supabase
   connection, provider request, mail, credential or shared database. */
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
  "/usr/lib/postgresql/16/bin",
].filter(Boolean);
const requiredPgBinaries = ["initdb", "pg_ctl", "postgres", "psql"];
const PG = [...new Set(pgCandidates)].find((candidate) => (
  requiredPgBinaries.every((binary) => existsSync(join(candidate, binary)))
));
const MIGRATION = "supabase/migrations/20260903193000_automatic_ai_retry_jobs.sql";
const root = mkdtempSync("/private/tmp/kd-automatic-ai-retry-");
const data = join(root, "data");
const socket = join(root, "socket");
const port = "65467";
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
const sessionSql = (query, role = "service_role") => `
  begin;
  set local role ${role};
  select set_config('request.jwt.claim.role',${quote(role)},true);
  ${query};
  commit;
`;
const session = (query, role = "service_role") => outputValue(sql(sessionSql(query, role)));
const sessionAsync = async (query, role = "service_role") => outputValue(await sqlAsync(sessionSql(query, role)));
const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const accountId = uuid(900001);
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
function fixture({
  targetNumber,
  operationNumber,
  account = accountId,
  ageHours = 7,
  operationOffsetSeconds = 0,
  status = "laufend",
  cost = 5,
  inputTokens = null,
  outputTokens = null,
  finished = false,
  task = "radar-websearch",
}) {
  const target = uuid(100000 + targetNumber);
  const operation = uuid(200000 + operationNumber);
  sql(`
    insert into auth.users(id) values(${quote(account)}::uuid) on conflict do nothing;
    insert into public.kd_radar_targets(target_id) values(${quote(target)}::uuid) on conflict do nothing;
    with timing as (
      select clock_timestamp() - interval '${ageHours} hours' as started_at
    )
    insert into public.kd_radar_daily_runs(
      account_id,target_id,vienna_day,claimed_at,lease_expires_at
    )
    select ${quote(account)}::uuid,${quote(target)}::uuid,${quote(day)}::date,
           started_at - interval '30 seconds',started_at + interval '180 seconds'
      from timing;
    with timing as (
      select clock_timestamp() - interval '${ageHours} hours'
             + interval '${operationOffsetSeconds} seconds' as started_at
    )
    insert into public.kd_ai_log(
      account_id,vorgang_id,task,status,input_tokens,output_tokens,
      kosten_usd_cent,gestartet_at,beendet_at
    )
    select ${quote(account)}::uuid,${quote(operation)}::uuid,${quote(task)},${quote(status)},
           ${inputTokens === null ? "null" : Number(inputTokens)},
           ${outputTokens === null ? "null" : Number(outputTokens)},
           ${cost === null ? "null" : Number(cost)},started_at,
           ${finished ? "started_at + interval '60 seconds'" : "null"}
      from timing;
  `);
  return { account, target, operation };
}
function beginStatement({ logical, target, operation, task = "radar-websearch-task", account = accountId }) {
  return `select public.kd_automatic_ai_retry_job_begin(
    ${quote(logical)}::uuid,${quote(task)},${quote(account)}::uuid,
    ${quote(target)}::uuid,${quote(day)}::date,${quote(operation)}::uuid
  )`;
}
const beginJob = (values) => JSON.parse(session(beginStatement(values)));
const dueClaim = () => JSON.parse(session("select public.kd_automatic_ai_retry_due_claim()"));
function retryFinish(logical, retryOperation, result, reason = null) {
  return JSON.parse(session(`select public.kd_automatic_ai_retry_finish(
    ${quote(logical)}::uuid,${quote(retryOperation)}::uuid,${quote(result)},
    ${reason === null ? "null" : quote(reason)}
  )`));
}
function mailClaim(logical, mailOperation) {
  return JSON.parse(session(`select public.kd_automatic_ai_retry_mail_claim(
    ${quote(logical)}::uuid,${quote(mailOperation)}::uuid
  )`));
}
function mailFinish(logical, mailOperation, status) {
  return JSON.parse(session(`select public.kd_automatic_ai_retry_mail_finish(
    ${quote(logical)}::uuid,${quote(mailOperation)}::uuid,${quote(status)}
  )`));
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
      account_id uuid references auth.users(id) on delete cascade,
      vorgang_id uuid not null,
      task text not null,
      status text not null check(status in ('laufend','fertig','fehler')),
      input_tokens integer check(input_tokens is null or input_tokens >= 0),
      output_tokens integer check(output_tokens is null or output_tokens >= 0),
      kosten_usd_cent numeric(12,6) check(kosten_usd_cent is null or kosten_usd_cent >= 0),
      gestartet_at timestamptz not null,
      beendet_at timestamptz
    );
    create unique index kd_ai_log_vorgang_uniq
      on public.kd_ai_log(account_id,vorgang_id);
    create table public.kd_radar_targets(target_id uuid primary key);
    create table public.kd_radar_daily_runs(
      account_id uuid not null references auth.users(id) on delete cascade,
      target_id uuid not null references public.kd_radar_targets(target_id) on delete cascade,
      vienna_day date not null,
      claimed_at timestamptz not null,
      lease_expires_at timestamptz not null,
      primary key(account_id,target_id,vienna_day)
    );
    grant usage on schema auth,public to anon,authenticated,service_role;
  `);
  sql(migrationSql);

  const columns = sql(`
    select column_name || ':' || data_type
      from information_schema.columns
     where table_schema='public' and table_name='kd_automatic_ai_retry_jobs'
     order by ordinal_position
  `).split("\n");
  check("Ledger besitzt exakt den inhaltsfreien Job-/Retry-/Mailzustand", () => {
    assert.deepEqual(columns, [
      "logical_job_id:uuid",
      "task_id:text",
      "trigger_source:text",
      "account_id:uuid",
      "target_id:uuid",
      "radar_vienna_day:date",
      "initial_provider_operation_id:uuid",
      "triggered_at:timestamp with time zone",
      "check_due_at:timestamp with time zone",
      "check_claimed_at:timestamp with time zone",
      "initial_evidence_status:text",
      "initial_api_call:text",
      "initial_cost:text",
      "initial_reason_code:text",
      "retry_consumed:boolean",
      "retry_provider_operation_id:uuid",
      "retry_status:text",
      "retry_reason_code:text",
      "retry_finished_at:timestamp with time zone",
      "mail_status:text",
      "mail_operation_id:uuid",
      "mail_claimed_at:timestamp with time zone",
      "mail_finished_at:timestamp with time zone",
      "updated_at:timestamp with time zone",
    ]);
    const names = columns.map((entry) => entry.split(":")[0]);
    for (const forbidden of ["title", "target_text", "search", "address", "email", "recipient", "prompt", "payload", "body", "response"]) {
      assert.equal(names.includes(forbidden), false, forbidden);
    }
  });

  check("Account, Target und Tagesrun sind echte kaskadierende Referenzen", () => {
    const definitions = sql(`
      select pg_get_constraintdef(oid)
        from pg_constraint
       where conrelid='public.kd_automatic_ai_retry_jobs'::regclass
         and contype='f'
       order by conname
    `).split("\n");
    assert.equal(definitions.length, 3);
    assert.ok(definitions.every((definition) => /ON DELETE CASCADE/.test(definition)));
    assert.ok(definitions.some((definition) => /FOREIGN KEY \(account_id\) REFERENCES auth\.users\(id\)/.test(definition)));
    assert.ok(definitions.some((definition) => /FOREIGN KEY \(target_id\) REFERENCES kd_radar_targets\(target_id\)/.test(definition)));
    assert.ok(definitions.some((definition) => /FOREIGN KEY \(account_id, target_id, radar_vienna_day\) REFERENCES kd_radar_daily_runs\(account_id, target_id, vienna_day\)/.test(definition)));
  });

  const signatures = [
    "public.kd_automatic_ai_retry_job_begin(uuid,text,uuid,uuid,date,uuid)",
    "public.kd_automatic_ai_retry_due_claim()",
    "public.kd_automatic_ai_retry_finish(uuid,uuid,text,text)",
    "public.kd_automatic_ai_retry_mail_claim(uuid,uuid)",
    "public.kd_automatic_ai_retry_mail_finish(uuid,uuid,text)",
  ];
  check("RLS und Rechte lassen nur die fünf service-role-RPCs zu", () => {
    assert.equal(sql("select relrowsecurity from pg_class where oid='public.kd_automatic_ai_retry_jobs'::regclass"), "t");
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert.equal(sql(`select has_table_privilege('${role}','public.kd_automatic_ai_retry_jobs','${privilege}')`), "f");
      }
    }
    for (const signature of signatures) {
      assert.equal(sql(`select has_function_privilege('anon',${quote(signature)},'EXECUTE')`), "f");
      assert.equal(sql(`select has_function_privilege('authenticated',${quote(signature)},'EXECUTE')`), "f");
      assert.equal(sql(`select has_function_privilege('service_role',${quote(signature)},'EXECUTE')`), "t");
      assert.equal(sql(`select prosecdef and provolatile='v' and proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid=${quote(signature)}::regprocedure`), "t");
    }
    assert.throws(() => session("select public.kd_automatic_ai_retry_due_claim()", "authenticated"), /permission denied/);
    assert.deepEqual(JSON.parse(sql("select public.kd_automatic_ai_retry_due_claim()")), { claim: false, status: "forbidden" });
  });

  const first = fixture({ targetNumber: 1, operationNumber: 1, ageHours: 1 });
  const firstLogical = uuid(300001);
  check("Beginn bindet die exakte Logoperation an unveränderliche Start+6h", () => {
    const result = beginJob({ logical: firstLogical, target: first.target, operation: first.operation });
    assert.equal(result.ok, true);
    assert.equal(result.replay, false);
    assert.equal(result.status, "pending");
    assert.equal(result.logicalJobId, firstLogical);
    assert.equal(typeof result.checkDueAt, "string");
  });

  check("Persistierter Termin ist exakt Logstart plus sechs Stunden", () => {
    assert.equal(sql(`
      select job.triggered_at=log.gestartet_at
         and job.check_due_at=job.triggered_at+interval '6 hours'
        from public.kd_automatic_ai_retry_jobs job
        join public.kd_ai_log log
          on log.account_id=job.account_id
         and log.vorgang_id=job.initial_provider_operation_id
       where job.logical_job_id=${quote(firstLogical)}::uuid
    `), "t");
    assert.equal(dueClaim().status, "idle");
  });

  check("Exakter Begin replayt, abweichende Identität konfligiert ohne zweite Zeile", () => {
    const replay = beginJob({ logical: firstLogical, target: first.target, operation: first.operation });
    assert.equal(replay.ok, true);
    assert.equal(replay.replay, true);
    assert.equal(beginJob({ logical: firstLogical, target: first.target, operation: uuid(299999) }).code, "idempotency-conflict");
    assert.equal(sql("select count(*) from public.kd_automatic_ai_retry_jobs"), "1");
  });

  check("Nur Allowlist-Task und belegte Operation im exakten Tageslease werden angelegt", () => {
    const wrongTask = fixture({ targetNumber: 2, operationNumber: 2 });
    assert.equal(beginJob({ logical: uuid(300002), target: wrongTask.target, operation: wrongTask.operation, task: "other-task" }).code, "invalid-request");
    const wrongLogTask = fixture({ targetNumber: 3, operationNumber: 3, task: "other-provider" });
    assert.equal(beginJob({ logical: uuid(300003), target: wrongLogTask.target, operation: wrongLogTask.operation }).code, "invalid-reference");
    const outsideLease = fixture({ targetNumber: 4, operationNumber: 4, operationOffsetSeconds: 240 });
    assert.equal(beginJob({ logical: uuid(300004), target: outsideLease.target, operation: outsideLease.operation }).code, "invalid-reference");
    assert.equal(beginJob({ logical: uuid(300005), target: uuid(199999), operation: uuid(299998) }).code, "invalid-reference");
    assert.equal(sql("select count(*) from public.kd_automatic_ai_retry_jobs"), "1");
  });

  const success = fixture({
    targetNumber: 10, operationNumber: 10, status: "fertig", cost: 1.25,
    inputTokens: 12, outputTokens: 0, finished: true,
  });
  const successLogical = uuid(300010);
  beginJob({ logical: successLogical, target: success.target, operation: success.operation });
  check("Initialerfolg verlangt fertig, Abschluss, positive Kosten und beide Tokenwerte", () => {
    assert.deepEqual(dueClaim(), {
      claim: true,
      status: "initial-succeeded",
      action: "none",
      logicalJobId: successLogical,
      taskId: "radar-websearch-task",
      initialProviderOperationId: success.operation,
    });
    assert.equal(sql(`select retry_consumed=false and retry_provider_operation_id is null and mail_status='not-required' from public.kd_automatic_ai_retry_jobs where logical_job_id=${quote(successLogical)}::uuid`), "t");
  });

  const proofCases = [
    {
      targetNumber: 11, operationNumber: 11, logical: uuid(300011),
      fixture: { status: "laufend", cost: 5, inputTokens: null, outputTokens: null, finished: false },
      apiCall: "unproven", initialCost: "unproven", reason: "initial-call-unproven",
    },
    {
      targetNumber: 12, operationNumber: 12, logical: uuid(300012),
      fixture: { status: "fertig", cost: 0, inputTokens: 12, outputTokens: 1, finished: true },
      apiCall: "made", initialCost: "unproven", reason: "initial-cost-unproven",
    },
    {
      targetNumber: 13, operationNumber: 13, logical: uuid(300013),
      fixture: { status: "fertig", cost: 1, inputTokens: null, outputTokens: 1, finished: true },
      apiCall: "made", initialCost: "confirmed", reason: "initial-usage-unproven",
    },
    {
      targetNumber: 14, operationNumber: 14, logical: uuid(300014),
      fixture: { status: "fehler", cost: 1, inputTokens: 12, outputTokens: 1, finished: true },
      apiCall: "made", initialCost: "confirmed", reason: "initial-execution-failed",
    },
  ];
  check("Reservierung, Nullkosten, fehlende Usage und Fehler sind nie Initialerfolg", () => {
    for (const testCase of proofCases) {
      const item = fixture({
        targetNumber: testCase.targetNumber,
        operationNumber: testCase.operationNumber,
        ...testCase.fixture,
      });
      assert.equal(beginJob({ logical: testCase.logical, target: item.target, operation: item.operation }).ok, true);
      const claim = dueClaim();
      assert.equal(claim.status, "retry-claimed");
      assert.equal(claim.action, "retry");
      assert.equal(claim.initialApiCall, testCase.apiCall);
      assert.equal(claim.initialCost, testCase.initialCost);
      assert.equal(claim.initialReasonCode, testCase.reason);
      assert.notEqual(claim.retryProviderOperationId, item.operation);
      assert.notEqual(claim.retryProviderOperationId, testCase.logical);
    }
  });

  const parallel = fixture({ targetNumber: 15, operationNumber: 15 });
  const parallelLogical = uuid(300015);
  beginJob({ logical: parallelLogical, target: parallel.target, operation: parallel.operation });
  let parallelRetryOperation;
  await checkAsync("Paralleler Due-Claim verbraucht genau einen Retry mit einer neuen Operation", async () => {
    const results = await Promise.all([
      sessionAsync("select public.kd_automatic_ai_retry_due_claim()"),
      sessionAsync("select public.kd_automatic_ai_retry_due_claim()"),
    ]).then((items) => items.map(JSON.parse));
    const claimed = results.filter((result) => result.claim === true && result.status === "retry-claimed");
    const idle = results.filter((result) => result.claim === false && result.status === "idle");
    assert.equal(claimed.length, 1);
    assert.equal(idle.length, 1);
    parallelRetryOperation = claimed[0].retryProviderOperationId;
    assert.equal(sql(`select retry_consumed and retry_status='claimed' and check_due_at=triggered_at+interval '6 hours' from public.kd_automatic_ai_retry_jobs where logical_job_id=${quote(parallelLogical)}::uuid`), "t");
    assert.equal(dueClaim().status, "idle");
  });

  check("Behaupteter Retry-Erfolg ohne exakten Logbeleg wird dauerhaft unproven", () => {
    assert.deepEqual(retryFinish(parallelLogical, parallelRetryOperation, "succeeded"), {
      ok: true,
      replay: false,
      status: "unproven",
      reasonCode: "retry-status-unproven",
      mailStatus: "pending",
    });
    sql(`insert into public.kd_ai_log(account_id,vorgang_id,task,status,input_tokens,output_tokens,kosten_usd_cent,gestartet_at,beendet_at)
      values(${quote(accountId)}::uuid,${quote(parallelRetryOperation)}::uuid,'radar-websearch','fertig',1,1,1,now(),now())`);
    assert.deepEqual(retryFinish(parallelLogical, parallelRetryOperation, "succeeded"), {
      ok: true,
      replay: true,
      status: "unproven",
      reasonCode: "retry-status-unproven",
    });
  });

  const retrySuccess = fixture({ targetNumber: 16, operationNumber: 16 });
  const retrySuccessLogical = uuid(300016);
  beginJob({ logical: retrySuccessLogical, target: retrySuccess.target, operation: retrySuccess.operation });
  const retrySuccessClaim = dueClaim();
  sql(`insert into public.kd_ai_log(account_id,vorgang_id,task,status,input_tokens,output_tokens,kosten_usd_cent,gestartet_at,beendet_at)
    values(${quote(accountId)}::uuid,${quote(retrySuccessClaim.retryProviderOperationId)}::uuid,'radar-websearch','fertig',5,0,0.25,now(),now())`);
  check("Retry-Erfolg braucht denselben exakten finalisierten Positivbeleg", () => {
    assert.deepEqual(retryFinish(retrySuccessLogical, retrySuccessClaim.retryProviderOperationId, "succeeded"), {
      ok: true,
      replay: false,
      status: "succeeded",
      reasonCode: null,
      mailStatus: "pending",
    });
  });

  const retryFailure = fixture({ targetNumber: 17, operationNumber: 17 });
  const retryFailureLogical = uuid(300017);
  beginJob({ logical: retryFailureLogical, target: retryFailure.target, operation: retryFailure.operation });
  const retryFailureClaim = dueClaim();
  check("Retryabschluss akzeptiert nur sichere Ergebnis-/Reason-Kombinationen", () => {
    assert.equal(retryFinish(retryFailureLogical, retryFailureClaim.retryProviderOperationId, "failed", "free-text").code, "invalid-request");
    assert.equal(retryFinish(retryFailureLogical, retryFailureClaim.retryProviderOperationId, "unproven", "retry-blocked").code, "invalid-request");
    assert.deepEqual(retryFinish(retryFailureLogical, retryFailureClaim.retryProviderOperationId, "failed", "retry-blocked"), {
      ok: true,
      replay: false,
      status: "failed",
      reasonCode: "retry-blocked",
      mailStatus: "pending",
    });
  });

  let winningMailOperation;
  await checkAsync("Paralleler Mailclaim vergibt genau eine Operation und liefert nur Betriebsmetadaten", async () => {
    const candidates = [uuid(400001), uuid(400002)];
    const results = await Promise.all(candidates.map(async (mailOperation) => ({
      mailOperation,
      result: JSON.parse(await sessionAsync(`select public.kd_automatic_ai_retry_mail_claim(
        ${quote(parallelLogical)}::uuid,${quote(mailOperation)}::uuid
      )`)),
    })));
    const claimed = results.filter(({ result }) => result.ok === true && result.status === "claimed");
    const rejected = results.filter(({ result }) => result.ok === false && result.code === "idempotency-conflict");
    assert.equal(claimed.length, 1);
    assert.equal(rejected.length, 1);
    winningMailOperation = claimed[0].mailOperation;
    assert.deepEqual(Object.keys(claimed[0].result).sort(), [
      "initialApiCall", "initialCost", "initialOperationId", "initialReasonCode",
      "mailOperationId", "occurredAt", "ok", "replay", "retryOperationId",
      "retryReasonCode", "retryResult", "retryTriggered", "status", "taskId",
    ].sort());
    for (const forbidden of ["accountId", "targetId", "title", "targetText", "address", "payload", "prompt", "response"]) {
      assert.equal(Object.hasOwn(claimed[0].result, forbidden), false, forbidden);
    }
  });

  check("Mailabschluss ist terminal, replaybar und öffnet weder Retry noch Termin neu", () => {
    assert.deepEqual(mailFinish(parallelLogical, winningMailOperation, "accepted"), {
      ok: true, replay: false, status: "accepted",
    });
    assert.deepEqual(mailFinish(parallelLogical, winningMailOperation, "rejected"), {
      ok: true, replay: true, status: "accepted",
    });
    assert.equal(mailClaim(parallelLogical, uuid(400003)).code, "idempotency-conflict");
    assert.equal(sql(`select retry_consumed and retry_status='unproven' and mail_status='accepted' and check_due_at=triggered_at+interval '6 hours' from public.kd_automatic_ai_retry_jobs where logical_job_id=${quote(parallelLogical)}::uuid`), "t");
  });

  check("Initialerfolg und laufender Retry geben keinen vorzeitigen Mailclaim frei", () => {
    assert.equal(mailClaim(successLogical, uuid(400010)).code, "not-ready");
    assert.equal(mailClaim(proofCases[0].logical, uuid(400011)).code, "not-ready");
  });

  check("Deadline und Jobidentität bleiben auch für den Tabellenowner unveränderlich", () => {
    assert.throws(() => sql(`update public.kd_automatic_ai_retry_jobs set check_due_at=check_due_at+interval '1 second',triggered_at=triggered_at+interval '1 second' where logical_job_id=${quote(firstLogical)}::uuid`), /automatic ai retry identity is immutable/);
    assert.throws(() => sql(`update public.kd_automatic_ai_retry_jobs set target_id=${quote(success.target)}::uuid where logical_job_id=${quote(firstLogical)}::uuid`), /automatic ai retry identity is immutable/);
  });

  check("Tabellenchecks blockieren erfundene Zwischenzustände", () => {
    assert.throws(() => sql(`update public.kd_automatic_ai_retry_jobs set retry_consumed=true where logical_job_id=${quote(firstLogical)}::uuid`), /retry_state_check/);
    assert.throws(() => sql(`update public.kd_automatic_ai_retry_jobs set mail_status='accepted' where logical_job_id=${quote(firstLogical)}::uuid`), /mail_state_check/);
  });

  const cascadeAccount = uuid(900002);
  const cascade = fixture({ targetNumber: 20, operationNumber: 20, account: cascadeAccount, ageHours: 1 });
  const cascadeLogical = uuid(300020);
  beginJob({ logical: cascadeLogical, target: cascade.target, operation: cascade.operation, account: cascadeAccount });
  check("Kontolöschung entfernt den technischen Job über bestehende Cascades", () => {
    assert.equal(sql(`select count(*) from public.kd_automatic_ai_retry_jobs where logical_job_id=${quote(cascadeLogical)}::uuid`), "1");
    sql(`delete from auth.users where id=${quote(cascadeAccount)}::uuid`);
    assert.equal(sql(`select count(*) from public.kd_automatic_ai_retry_jobs where logical_job_id=${quote(cascadeLogical)}::uuid`), "0");
  });

  check("Migration ist additiv und enthält keinen Provider-, Mail- oder Scheduleraufruf", () => {
    assert.match(migrationSql, /^begin;/);
    assert.match(migrationSql, /commit;\s*$/);
    assert.doesNotMatch(migrationSql, /https?:\/\/|net\.http|pg_cron|cron\.schedule|resend|anthropic\.com/i);
    assert.doesNotMatch(migrationSql, /\b(?:drop|truncate)\s+(?:table\s+)?public\./i);
  });

  console.log(`AUTOMATIC_AI_RETRY_JOBS_PG17: ${checks}/${checks} disposable PostgreSQL checks passed`);
} finally {
  if (running) run("pg_ctl", ["--pgdata", data, "--wait", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
