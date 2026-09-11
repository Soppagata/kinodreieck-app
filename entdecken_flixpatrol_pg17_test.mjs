/* Disposable PostgreSQL 16/17 contract test. Synthetic data only. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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

const root = mkdtempSync(join(tmpdir(), "kd-entdecken-flixpatrol-"));
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
function isoWeek(day) {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date - start) / 86_400_000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
const shiftDay = (day, delta) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

const today = viennaDay();
const chartDate = shiftDay(today, -1);
const sunday = (() => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
})();
const fetchedAt = `${today}T00:10:00.000Z`;
const publicRow = ({ source, type, rank, index }) => ({
  title: `Public title ${index}`, sourceItemId: `${type === "film" ? "f" : "s"}_public-${index}`,
  sourceId: source,
  sourceLabel: source === "chart:oefi-weekend-at" ? "Österreichisches Filminstitut" : "Netflix Top 10 Österreich",
  mediaType: type, releaseYear: null, externalIds: {}, genres: [],
  availability: source === "chart:oefi-weekend-at"
    ? { region: "AT", market: "cinema", service: null, licenseTypes: [] }
    : { region: "AT", market: "streaming", service: "Netflix", licenseTypes: ["SVOD"] },
  popularity: source === "chart:oefi-weekend-at"
    ? { metric: "weekend-admissions", rank, measuredOn: shiftDay(today, -7), value: 1000 - rank }
    : { metric: "weekly-country-rank", rank, measuredOn: sunday, value: null },
  sourceUrl: source === "chart:oefi-weekend-at" ? "https://filminstitut.at/charts"
    : `https://www.netflix.com/tudum/top10/austria/${type === "film" ? "films" : "tv"}`,
  fetchedAt,
});
const fpRow = ({ source, service, type, rank, index }) => {
  const sourceItemId = `ttl_TestTitle${String(index).padStart(11, "0")}`;
  const urls = {
    "Prime Video": "https://flixpatrol.com/top10/amazon-prime/austria/",
    "Disney+": "https://flixpatrol.com/top10/disney/austria/",
    "Apple TV": "https://flixpatrol.com/top10/apple-tv/austria/",
    "Netflix": "https://flixpatrol.com/top10/netflix/austria/",
  };
  return {
    title: `Provider title ${index}`, sourceItemId, sourceId: source,
    sourceLabel: `${service} · Top 10 Österreich (FlixPatrol)`, mediaType: type,
    releaseYear: 2000 + index, externalIds: { flixpatrol: sourceItemId }, genres: [],
    availability: { region: "AT", market: "streaming", service, licenseTypes: ["SVOD"] },
    popularity: { metric: "daily-provider-rank", rank, measuredOn: chartDate, value: null },
    sourceUrl: urls[service], fetchedAt,
  };
};
const items = [];
for (let i = 1; i <= 15; i += 1) items.push(publicRow({ source: "chart:oefi-weekend-at", type: "film", rank: i, index: i }));
for (let i = 1; i <= 5; i += 1) items.push(publicRow({ source: "chart:netflix-weekly-at", type: "film", rank: i, index: 15 + i }));
for (let i = 1; i <= 5; i += 1) items.push(publicRow({ source: "chart:netflix-weekly-at", type: "series", rank: i, index: 20 + i }));
for (const [source, service, start] of [
  ["chart:flixpatrol-prime-at", "Prime Video", 26], ["chart:flixpatrol-disney-at", "Disney+", 36],
]) {
  for (let i = 0; i < 5; i += 1) items.push(fpRow({ source, service, type: "film", rank: i + 1, index: start + i }));
  for (let i = 0; i < 5; i += 1) items.push(fpRow({ source, service, type: "series", rank: i + 1, index: start + 5 + i }));
}
for (let i = 0; i < 5; i += 1) items.push(fpRow({ source: "chart:flixpatrol-apple-tv-at", service: "Apple TV", type: "film", rank: i + 1, index: 46 + i }));
const feed = {
  format: 8, feedId: "public:daily-market-mix-at-v2", region: "AT", sourceId: "chart:daily-market-mix-at",
  sourceIds: ["chart:oefi-weekend-at", "chart:netflix-weekly-at", "chart:flixpatrol-prime-at", "chart:flixpatrol-disney-at", "chart:flixpatrol-apple-tv-at"],
  isoWeek: isoWeek(today), chartDate, refreshedOn: today, validUntil: today, items,
};
const format9Items = items.slice(0, 15).map((item) => ({ ...item, availabilityConfirmed: false }));
for (let i = 0; i < 5; i += 1) format9Items.push({ ...fpRow({
  source: "chart:flixpatrol-netflix-at", service: "Netflix", type: "film", rank: i + 1, index: 51 + i,
}), availabilityConfirmed: false });
for (let i = 0; i < 5; i += 1) format9Items.push({ ...fpRow({
  source: "chart:flixpatrol-netflix-at", service: "Netflix", type: "series", rank: i + 1, index: 56 + i,
}), availabilityConfirmed: false });
format9Items.push(...items.slice(25).map((item) => ({ ...item, availabilityConfirmed: false })));
const feed9 = {
  format: 9, feedId: "public:daily-flixpatrol-market-mix-at-v1", region: "AT",
  sourceId: "chart:daily-flixpatrol-market-mix-at",
  sourceIds: ["chart:oefi-weekend-at", "chart:flixpatrol-netflix-at", "chart:flixpatrol-prime-at", "chart:flixpatrol-disney-at", "chart:flixpatrol-apple-tv-at"],
  isoWeek: isoWeek(today), chartDate, refreshedOn: today, validUntil: today, items: format9Items,
};
const nullFetched = structuredClone(feed);
nullFetched.items[0].fetchedAt = null;
const invalidMeasured = structuredClone(feed);
invalidMeasured.items[0].popularity.measuredOn = "2026-02-30";
const untypedMeasured = structuredClone(feed);
untypedMeasured.items[0].popularity.measuredOn = 20260908;
const untypedSourceUrl = structuredClone(feed);
untypedSourceUrl.items[0].sourceUrl = 7;

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
  sql(`insert into public.kd_flixpatrol_vocabulary_cache (
    resource_type,source_id,name,media_type,provider_type,checked_at,fresh_until,source_url
  ) values ('genres','gnr_GenreFormatNine123456789','Drama','film',1,now(),now()+interval '30 days',
    'https://flixpatrol.com/api2/endpoint-genres/')`);

  check("Format 8 validiert exakt 50 Titel und fünf Quellen", () => {
    assert.equal(session(`select public.kd_entdecken_public_payload_valid_v8(${jsonb(feed)},${quote(today)}::date)`), "t");
    assert.equal(session(`select public.kd_entdecken_flixpatrol_sources_ready()`), "t");
  });
  check("Format 9 validiert Netflix daily additiv und verlangt den fehlenden Angebotsbeleg", () => {
    assert.equal(session(`select public.kd_entdecken_public_payload_valid_v9(${jsonb(feed9)},${quote(today)}::date)`), "t");
    assert.equal(session(`select public.kd_entdecken_public_payload_valid(${jsonb(feed9)},${quote(today)}::date)`), "t");
    assert.equal(session(`select public.kd_entdecken_flixpatrol_sources_ready_v9()`), "t");
    const claimed = structuredClone(feed9);
    claimed.items[15].availabilityConfirmed = true;
    assert.equal(session(`select public.kd_entdecken_public_payload_valid_v9(${jsonb(claimed)},${quote(today)}::date)`), "f");
  });
  check("Vokabularread bleibt service-only und auf höchstens zehn IDs begrenzt", () => {
    const read = JSON.parse(session(`select public.kd_flixpatrol_vocabulary_read('genres',array['gnr_GenreFormatNine123456789'])`));
    assert.equal(read.ok, true);
    assert.equal(read.items.length, 1);
    assert.equal(read.items[0].name, "Drama");
    assert.equal(read.items[0].fresh, true);
    const invalid = JSON.parse(session(`select public.kd_flixpatrol_vocabulary_read('genres',array[]::text[])`));
    assert.equal(invalid.code, "invalid-request");
    const eleven = JSON.parse(session(`select public.kd_flixpatrol_vocabulary_read('genres',
      array(select 'gnr_' || lpad(value::text,20,'A') from generate_series(1,11) value))`));
    assert.equal(eleven.code, "invalid-request");
  });
  check("Teilfeed, doppelte Identität und Apple TV Store werden verworfen", () => {
    const short = { ...feed, items: feed.items.slice(0, 49) };
    const duplicate = { ...feed, items: feed.items.map((item) => ({ ...item })) };
    duplicate.items[49].title = duplicate.items[48].title;
    const store = { ...feed, items: feed.items.map((item) => ({ ...item, availability: { ...item.availability } })) };
    store.items[49].availability.service = "Apple TV Store";
    assert.equal(session(`select public.kd_entdecken_public_payload_valid_v8(${jsonb(short)},${quote(today)}::date)`), "f");
    assert.equal(session(`select public.kd_entdecken_public_payload_valid_v8(${jsonb(duplicate)},${quote(today)}::date)`), "f");
    assert.equal(session(`select public.kd_entdecken_public_payload_valid_v8(${jsonb(store)},${quote(today)}::date)`), "f");
  });
  check("NULL, untypisierte Felder und ungültige Datumswerte werden verworfen", () => {
    for (const candidate of [nullFetched, invalidMeasured, untypedMeasured, untypedSourceUrl]) {
      assert.equal(session(`select public.kd_entdecken_public_payload_valid_v8(${jsonb(candidate)},${quote(today)}::date)`), "f");
    }
  });
  check("Fehlerrow behält den alten Format-6-Payload bis zum vollständigen Save", () => {
    const before = JSON.parse(session("select public.kd_entdecken_weekly_feed_status()"));
    assert.equal(before.feed.sentinel, "last-good");
    const claim = JSON.parse(session("select public.kd_entdecken_weekly_refresh_claim('scheduled')"));
    assert.equal(claim.refresh, true);
    assert.equal(sql("select payload->>'sentinel' from public.kd_entdecken_daily_feed"), "last-good");
    for (const candidate of [nullFetched, invalidMeasured]) {
      const rejected = JSON.parse(session(`select public.kd_entdecken_daily_save(${jsonb(candidate)},${claim.fenceToken})`));
      assert.deepEqual(rejected, { ok: false, code: "invalid_response" });
      assert.equal(sql("select payload->>'sentinel' from public.kd_entdecken_daily_feed"), "last-good");
    }
    const saved = JSON.parse(session(`select public.kd_entdecken_daily_save(${jsonb(feed9)},${claim.fenceToken})`));
    assert.equal(saved.status, "saved");
    const readback = JSON.parse(session(`select public.kd_entdecken_public_feed_readback(${claim.fenceToken})`));
    assert.equal(readback.status, "verified");
    assert.equal(readback.provenance.itemCount, 50);
    assert.equal(readback.provenance.sourceCount, 5);
    assert.equal(readback.feed.format, 9);
  });
  check("Authenticated kann die service-role-only Verträge nicht direkt ausführen", () => {
    for (const statement of [
      "select public.kd_entdecken_public_feed_readback(8)",
      "select public.kd_flixpatrol_vocabulary_read('genres',array['gnr_GenreFormatNine123456789'])",
    ]) {
      const result = spawnSync(join(selected.dir, "psql"), psqlArgs, {
        input: `begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); ${statement};`,
        encoding: "utf8", env,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /permission denied/);
    }
  });
  console.log(`Entdecken FlixPatrol PG ${selected.version}: ${checks} checks passed`);
} finally {
  if (running) spawnSync(join(selected.dir, "pg_ctl"), ["--pgdata", data, "--wait", "stop"], { env, encoding: "utf8" });
  rmSync(root, { recursive: true, force: true });
}
