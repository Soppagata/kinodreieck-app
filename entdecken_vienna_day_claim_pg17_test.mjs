/* Disposable PostgreSQL check for the Entdecken calendar-day forward migration.
   Uses only synthetic rows in /private/tmp; no Supabase connection or provider. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const pgConfig = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const candidates = [
  process.env.KD_TEST_PG_BIN,
  "/Applications/Postgres.app/Contents/Versions/17/bin",
  pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
  "/usr/lib/postgresql/17/bin",
].filter(Boolean);
const binaries = ["initdb", "pg_ctl", "postgres", "psql"];
const pg = [...new Set(candidates)].find((directory) => (
  binaries.every((binary) => existsSync(join(directory, binary)))
));
assert.ok(pg, `PostgreSQL 17 server binaries are required (${binaries.join(", ")})`);

const root = mkdtempSync("/private/tmp/kd-release-data-pg17-");
const data = join(root, "data");
const socket = join(root, "socket");
const log = join(root, "postgres.log");
const port = String(47_000 + (process.pid % 1_000));
mkdirSync(socket, { mode: 0o700 });
let running = false;

const env = Object.freeze({
  PATH: `${pg}:/usr/bin:/bin`,
  LANG: "C",
  LC_ALL: "C",
});

function run(binary, args, input = undefined) {
  const result = spawnSync(join(pg, binary), args, {
    encoding: "utf8",
    env,
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${binary} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const psql = (sql) => run("psql", [
  "--host", socket,
  "--port", port,
  "--username", "postgres",
  "--dbname", "postgres",
  "--no-psqlrc",
  "--set", "ON_ERROR_STOP=1",
  "--tuples-only",
  "--no-align",
], sql);

try {
  run("initdb", [
    "--no-locale", "--encoding=UTF8", "--auth=trust",
    "--username=postgres", "--pgdata", data,
  ]);
  run("pg_ctl", [
    "--pgdata", data,
    "--log", log,
    "--options", `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,
    "--wait", "start",
  ]);
  running = true;

  psql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create function auth.role() returns text language sql stable
      as $$ select current_setting('request.jwt.claim.role', true) $$;
    create table public.kd_entdecken_daily_settings (
      singleton boolean primary key,
      feed_enabled boolean not null,
      public_enabled boolean not null,
      owner_private_source_enabled boolean not null,
      provider_enabled boolean not null,
      commercial_enabled boolean not null,
      staging_owner_refresh_override boolean not null
    );
    create table public.kd_entdecken_daily_feed (
      singleton boolean primary key,
      last_success_at timestamptz,
      last_public_attempt_at timestamptz,
      last_attempt_on date,
      payload jsonb,
      status text not null,
      lease_expires_at timestamptz,
      last_attempt_iso_week text,
      attempt_iso_week text,
      attempt_count integer not null default 0,
      provider_operation_id uuid,
      fence_token bigint not null default 0,
      last_error_code text,
      last_failure_at timestamptz,
      recovery_authorized_iso_week text,
      updated_at timestamptz
    );
    create function public.kd_entdecken_mixed_sources_ready()
      returns boolean language sql stable as $$ select true $$;
    insert into public.kd_entdecken_daily_settings values
      (true, true, true, true, false, false, true);
    insert into public.kd_entdecken_daily_feed (
      singleton, last_public_attempt_at, last_attempt_on, payload, status, updated_at
    ) values (
      true,
      clock_timestamp() - interval '1 minute',
      (clock_timestamp() at time zone 'Europe/Vienna')::date - 1,
      '{}'::jsonb,
      'ready',
      clock_timestamp()
    );
  `);

  psql(readFileSync(
    "supabase/migrations/20260905180000_entdecken_vienna_day_claim.sql",
    "utf8",
  ));

  const denied = JSON.parse(psql(`
    select public.kd_entdecken_weekly_refresh_claim('owner')::text;
  `));
  assert.equal(denied.claimStatus, "disabled");
  assert.equal(denied.refresh, false);

  const claimed = JSON.parse(psql(`
    set request.jwt.claim.role = 'service_role';
    select public.kd_entdecken_weekly_refresh_claim('owner')::text;
  `).split("\n").at(-1));
  assert.equal(claimed.claimStatus, "claimed");
  assert.equal(claimed.refresh, true);
  assert.equal(claimed.attemptCount, 1);
  assert.equal(claimed.maxAttempts, 1);

  assert.equal(psql(`
    select
      has_function_privilege('anon', 'public.kd_entdecken_weekly_refresh_claim(text)', 'execute'),
      has_function_privilege('authenticated', 'public.kd_entdecken_weekly_refresh_claim(text)', 'execute'),
      has_function_privilege('service_role', 'public.kd_entdecken_weekly_refresh_claim(text)', 'execute');
  `), "f|f|t");

  assert.equal(psql(`
    select last_attempt_on = (clock_timestamp() at time zone 'Europe/Vienna')::date
      and attempt_count = 1
      and status = 'refreshing'
      and lease_expires_at > clock_timestamp()
    from public.kd_entdecken_daily_feed where singleton;
  `), "t");

  console.log("entdecken_vienna_day_claim_pg17_test: migration, claim and ACL checks passed");
} finally {
  if (running) {
    run("pg_ctl", ["--pgdata", data, "--mode", "immediate", "--wait", "stop"]);
  }
  rmSync(root, { recursive: true, force: true });
}
