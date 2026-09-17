/* R-P08: echte Alt/Neu-Producer, SQL-Persistenz, HTTP-Handler und Alt/Neu-Browser. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { createReaderMatrix } from './tests/fixtures/review49_rollout_p08_readers.mjs';
import { createProducer } from './tests/fixtures/review49_p08_feed.mjs';
import { validateEntdeckenDailyFeed } from './supabase/functions/entdecken-daily-task/contract.js';
const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const required = ["initdb", "pg_ctl", "postgres", "psql"];
const candidates = [
  process.env.KD_TEST_PG_BIN,
  configured.status === 0 ? configured.stdout.trim() : null,
  "/Applications/Postgres.app/Contents/Versions/17/bin",
  "/usr/lib/postgresql/17/bin",
  "/usr/lib/postgresql/16/bin",
].filter(Boolean);
const selected = [...new Set(candidates)].map((dir) => {
  if (!required.every((name) => existsSync(join(dir, name)))) return null;
  const version = spawnSync(join(dir, "postgres"), ["--version"], { encoding: "utf8" });
  const match = version.status === 0 ? version.stdout.match(/\b(16|17)\.\d+\b/) : null;
  return match ? { dir, version: match[0] } : null;
}).find(Boolean);
assert.ok(selected, "PostgreSQL 16 or 17 server binaries are required");

const root = mkdtempSync(join(tmpdir(), "kd-review49-p08-pg-"));
const data = join(root, "data");
const log = join(root, "postgres.log");
const port = String(58000 + process.pid % 5000);
const env = { PATH: `${selected.dir}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
const migration = readFileSync("supabase/migrations/20260909210000_entdecken_flixpatrol_feed.sql", "utf8");
const format9Migration = readFileSync("supabase/migrations/20260911123000_entdecken_flixpatrol_batch_format9.sql", "utf8");
let running = false;
let checks = 0;

function run(binary, args, input) {
  const result = spawnSync(join(selected.dir, binary), args, {
    input, encoding: "utf8", timeout: 60_000, maxBuffer: 8_000_000, env,
  });
  if (result.status !== 0) {
    const serverLog = existsSync(log) ? readFileSync(log, "utf8") : "(server log unavailable)";
    throw new Error(`${binary}: ${result.stderr || result.error}\n${serverLog}`);
  }
  return result.stdout.trim();
}
const psqlArgs = ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", psqlArgs, query);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const jsonb = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const session = (query, role = "service_role") => sql(`begin; set local role ${role}; select set_config('request.jwt.claim.role','${role}',true); ${query}; commit;`)
  .split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }
function viennaDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const today = viennaDay();
const matrix = await createReaderMatrix();
try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set", "shared_memory_type=mmap", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", log, "--options",
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,
    "--wait", "start"]);
  running = true;
  sql(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    create table public.kd_entdecken_daily_settings (
      singleton boolean primary key, feed_enabled boolean, public_enabled boolean,
      owner_private_source_enabled boolean, provider_enabled boolean, commercial_enabled boolean,
      staging_owner_refresh_override boolean
    );
    insert into public.kd_entdecken_daily_settings values (true,true,true,true,false,false,false);
    create table public.kd_entdecken_sources (
      source_id text primary key, domain text unique, publisher_family text, source_class text,
      rights_status text, attribution_approved boolean, subdomains_allowed boolean, active boolean
    );
    insert into public.kd_entdecken_sources values
      ('chart:netflix-weekly-at','netflix.com','Netflix, Inc.','chart','owner_private',true,true,true),
      ('chart:oefi-weekend-at','filminstitut.at','Österreichisches Filminstitut','chart','owner_private',true,false,true);
    create table public.kd_entdecken_daily_feed (
      singleton boolean primary key, payload jsonb, refreshed_on date, refreshed_iso_week text,
      valid_until date, last_attempt_on date, last_attempt_iso_week text, attempt_iso_week text,
      attempt_count integer, provider_operation_id uuid, ready_provider_operation_id uuid,
      fence_token bigint not null default 0, ready_fence_token bigint,
      lease_expires_at timestamptz, last_public_attempt_at timestamptz, last_success_at timestamptz,
      last_failure_at timestamptz, recovery_authorized_iso_week text,
      status text, last_error_code text, updated_at timestamptz
    );
    insert into public.kd_entdecken_daily_feed (
      singleton,payload,refreshed_on,refreshed_iso_week,valid_until,last_attempt_on,
      attempt_count,fence_token,status,last_error_code,updated_at
    ) values (true,'{"format":6,"sentinel":"last-good"}',current_date-3,to_char(current_date-3,'IYYY-"W"IW'),current_date+3,current_date-1,1,7,'error','source_error',clock_timestamp());
    create function public.kd_entdecken_public_payload_valid_v5(jsonb,date) returns boolean language sql immutable as $$select false$$;
    create function public.kd_entdecken_public_payload_valid_v6(jsonb,date) returns boolean language sql immutable as $$select $1->>'format'='6'$$;
    create function public.kd_entdecken_public_payload_valid(jsonb,date) returns boolean language sql immutable as $$select false$$;
    create function public.kd_entdecken_mixed_sources_ready() returns boolean language sql stable security definer as $$select true$$;
    create table public.kd_flixpatrol_vocabulary_cache (
      resource_type text, source_id text, name text, code text, media_type text,
      provider_type integer, provider_updated_at text, checked_at timestamptz,
      fresh_until timestamptz, source_url text, updated_at timestamptz default now(),
      primary key(resource_type,source_id)
    );
    insert into public.kd_flixpatrol_vocabulary_cache (
      resource_type,source_id,name,code,checked_at,fresh_until,source_url
    ) values
      ('countries','cnt_gGE4RaeXpyz2U9Q5tEMYDwri','Austria','AT',now(),now()+interval '1 year','https://flixpatrol.com/api2/page-codes/'),
      ('companies','cmp_qypvowjqFhEIpCc0HlQ6VoYk','Amazon Prime',null,now(),now()+interval '1 year','https://flixpatrol.com/api2/page-codes/'),
      ('companies','cmp_oGtsgdpOrjIu3XzTEnWPt87Y','Disney+',null,now(),now()+interval '1 year','https://flixpatrol.com/api2/page-codes/'),
      ('companies','cmp_VvmYc7OphiUds0Hgjbz5MESn','Apple TV',null,now(),now()+interval '1 year','https://flixpatrol.com/api2/page-codes/'),
      ('companies','cmp_phDSns8OP1rtHnX6QwlEKhiq','Apple TV Store',null,now(),now()+interval '1 year','https://flixpatrol.com/api2/page-codes/');
    create function public.kd_entdecken_weekly_feed_status() returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.kd_entdecken_weekly_refresh_claim(text) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.kd_entdecken_daily_save(jsonb,bigint) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.kd_entdecken_public_feed_readback(bigint) returns jsonb language sql as $$select '{}'::jsonb$$;
  `);
  sql(migration);
  sql(format9Migration);
  sql(readFileSync('supabase/migrations/20260917130000_review_entdecken_ofi_identity.sql', 'utf8'));
  for (const format of [8, 9]) for (const writer of ["old", "new"]) {
    // Synthetische faellige Row; Claim/Save/Readback selbst sind echte Produkt-RPCs.
    sql("update public.kd_entdecken_daily_feed set status='error', last_attempt_on=current_date-1, last_public_attempt_at=null, last_success_at=null, lease_expires_at=null");
    let fence = null;
    const persistence = {
      claimRefresh() {
        const claim = JSON.parse(session("select public.kd_entdecken_weekly_refresh_claim('scheduled')"));
        assert.equal(claim.refresh, true); fence = claim.fenceToken; return claim;
      },
      saveFeed(feed, { fenceToken }) {
        assert.equal(validateEntdeckenDailyFeed(feed).ok, true);
        const saved = JSON.parse(session(`select public.kd_entdecken_daily_save(${jsonb(feed)},${fenceToken})`));
        assert.equal(saved.status, 'saved');
      },
      readFeed({ fenceToken }) {
        return JSON.parse(session(`select public.kd_entdecken_public_feed_readback(${fenceToken})`));
      },
    };
    const producer = (writer === "old" ? matrix.oldProducer : createProducer)({ format, today, persistence });
    const result = await producer.run();
    const feed = result.feed;
    assert.equal(result.status, 'fresh'); assert.equal(result.writes, 1);
    assert.deepEqual(JSON.parse(sql('select payload from public.kd_entdecken_daily_feed')), feed);
    assert.equal(feed.annotations?.length || 0, writer === 'new' ? 1 : 0);
    const readStatus = () => JSON.parse(session("select public.kd_entdecken_weekly_feed_status()"));
    await matrix.verify({ feed, today, readStatus, writer });
    check(`F${format}/${writer}: echter Writer -> SQL-Save/Status -> HTTP -> beide Browser, 50 Items, OEFI-Karte, Rollen, Fallback`, () => {
      assert.deepEqual(JSON.parse(sql('select payload from public.kd_entdecken_daily_feed')), feed, 'read projection never mutates persistence');
    });
    if (format === 9) {
      await matrix.verifyBrowser({ feed, today, readStatus, writer });
      check(`F9/${writer}: Chromium + WebKit, echte CORS-Preflights und Alt/Neu-Browser am ${writer}-Handler`, () => {});
    }
    // Freshness is evaluated by the real runner and both real browser services.
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    await matrix.verify({ feed, today: tomorrow, writer, readStatus: () => ({ ...readStatus(), today: tomorrow }) });
    check(`F${format}/${writer}: veralteter Feed bleibt in beiden Lesern ehrlich stale`, () => {});
  }
  check('Neue und bestehende SQL-Einstiege bleiben fuer anon/authenticated gesperrt', () => {
    for (const role of ['anon', 'authenticated']) for (const statement of [
      "select public.kd_entdecken_oefi_annotations_valid('{}',current_date)",
      "select public.kd_entdecken_public_payload_valid('{}',current_date)",
      "select public.kd_entdecken_daily_save('{}',8)",
      "select public.kd_entdecken_public_feed_readback(8)",
    ]) {
      const result = spawnSync(join(selected.dir, 'psql'), psqlArgs, {
        input: `begin; set local role ${role}; ${statement};`, encoding: 'utf8', env,
      });
      assert.notEqual(result.status, 0); assert.match(result.stderr, /permission denied/);
    }
  });
  console.log(`R-P08 PG ${selected.version}: ${checks} checks passed`);
} finally {
  matrix.close();
  if (running) spawnSync(join(selected.dir, 'pg_ctl'), ['--pgdata', data, '--wait', 'stop'], { env, encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
}
