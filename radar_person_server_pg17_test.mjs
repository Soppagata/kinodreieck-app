/* Lokaler, synthetischer PG17-Nachweis fuer den schlanken Personenradar-
   Serverkandidaten. Kein Netzwerk, kein Remote-Apply und kein Anbieter. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

const PG = "/Applications/Postgres.app/Contents/Versions/17/bin";
const MIGRATIONS = Object.freeze([
  Object.freeze({
    path: "supabase/migrations/20260809180000_event_radar_local_basis.sql",
    sha256: "d2bfe936e7ecf3b20c2c0fb5a761a87dbee42149b8b733e0e63fec5af82b94c4",
  }),
  Object.freeze({
    path: "supabase/migrations/20260814120000_radar_max_manual_pilot.sql",
    sha256: "9d66b957326eb91183f6b30a713dcdf9cdb753b36813d4719dcfc8f6bd6d51e5",
  }),
  Object.freeze({
    path: "supabase/migrations/20260817180000_radar_websearch_mvp_package_a.sql",
    sha256: "25808bc4ebb8b2f7e3d19d1946702fbd5094a93c95fe639e1c3d583d5067b93a",
  }),
  Object.freeze({
    path: "supabase/migrations/20260817190000_radar_websearch_mvp_package_b.sql",
    sha256: "b33691cfbc10c0323d2f0d8d8fa30630b8211463ed1c7bcce2af652d3daf325a",
  }),
  Object.freeze({
    path: "supabase/migrations/20260819220000_radar_person_server_candidate.sql",
  }),
]);
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const root = mkdtempSync("/private/tmp/kinodreieck-radar-person-pg17-");
const cluster = Object.freeze({
  data: join(root, "data"),
  log: join(root, "postgres.log"),
  socket: join(root, "socket"),
  port: "65449",
});
const env = Object.freeze({
  LANG: "C",
  LC_ALL: "C",
  NO_COLOR: "1",
  PATH: `${PG}:/usr/bin:/bin`,
  TMPDIR: root,
});
let running = false;
let checks = 0;

function check(name, condition) {
  assert.equal(condition, true, name);
  checks += 1;
  console.log(`✓ ${name}`);
}

function run(binary, argv, { input = null, allowFailure = false, timeout = 120_000 } = {}) {
  const result = spawnSync(`${PG}/${binary}`, argv, {
    cwd: root,
    env,
    encoding: "utf8",
    input,
    maxBuffer: 8 * 1024 * 1024,
    timeout,
    shell: false,
    stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (!allowFailure && (result.error || result.signal || result.status !== 0)) {
    const detail = String(result.stderr || result.error?.message || "").slice(-4000);
    throw new Error(`PG17_${binary.toUpperCase()}_FAILED: ${detail}`);
  }
  return result;
}

function psql(sql, { allowFailure = false } = {}) {
  const result = run("psql", [
    "--host", cluster.socket,
    "--port", cluster.port,
    "--dbname", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align",
    "--set", "ON_ERROR_STOP=on", "--file", "-",
  ], { input: sql, allowFailure });
  return Object.freeze({
    ok: !result.error && !result.signal && result.status === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  });
}

function asAccount(sql) {
  return psql(`select set_config('request.jwt.claim.sub','${ACCOUNT_ID}',false);\n${sql}`);
}

function jsonResult(sql, { account = false } = {}) {
  const output = (account ? asAccount(sql) : psql(sql)).stdout.split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(output);
}

const bootstrap = String.raw`
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.kd_personal (
  account_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  constraint kd_personal_pkey primary key (account_id, key),
  constraint kd_personal_key_erlaubt check (key in ('kd:master'))
);
create table public.kd_account_access (
  account_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member',
  active boolean not null default false,
  personal_ai boolean not null default false
);
create function public.kd_account_active() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select active from public.kd_account_access where account_id = auth.uid()), false)
$$;
create table public.kd_ai_limits (
  schluessel text primary key,
  wert jsonb not null,
  notiz text not null default '',
  geaendert_at timestamptz not null default now()
);
insert into public.kd_ai_limits (schluessel, wert) values
  ('task_modell', '{}'::jsonb),
  ('task_max_tokens', '{}'::jsonb),
  ('task_max_reservierung_usd_cent', '{"filmwissen-synthese":6,"media-batch-extract":5}'::jsonb),
  ('anbieter_request_max_usd_cent', '500'::jsonb);
create function public.kd_ai_auftrag_starten(
  p_account uuid, p_task text, p_vorgang uuid, p_modell_alias text default null,
  p_prompt_version text default null, p_profil_version text default null,
  p_reservierung numeric default 0
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if current_setting('kd.test_budget_decision', true) = 'limit' then
    return jsonb_build_object('ok',false,'code','limit','grund','synthetic-limit');
  end if;
  return jsonb_build_object('ok',true,'logId',71,'reservationUsdCent',p_reservierung);
end
$$;
create function public.kd_private_provider_allowed(p_provider_id text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('ok',p_provider_id = 'anthropic','code',
    case when p_provider_id = 'anthropic' then 'PROVIDER_ALLOWED' else 'PROVIDER_REGISTRY_OFF' end)
$$;
`;

const migrationBytes = MIGRATIONS.map((entry) => ({
  ...entry,
  source: readFileSync(entry.path, "utf8"),
}));

try {
  chmodSync(root, 0o700);
  mkdirSync(cluster.socket, { mode: 0o700 });
  const version = run("psql", ["--version"]).stdout.trim();
  check("eingefrorene lokale PostgreSQL-Werkzeugkette meldet Version 17.10", version.includes("17.10 (Postgres.app)"));

  run("initdb", [
    "--no-locale", "--encoding=UTF8", "--auth=trust", "--pgdata", cluster.data,
  ]);
  run("pg_ctl", [
    "--pgdata", cluster.data,
    "--log", cluster.log,
    "--options", `-c listen_addresses= -c unix_socket_directories=${cluster.socket} -p ${cluster.port}`,
    "--wait", "start",
  ]);
  running = true;
  psql(bootstrap);

  for (const entry of migrationBytes) {
    if (entry.sha256) {
      const actual = createHash("sha256").update(entry.source).digest("hex");
      check(`${entry.path.split("/").at(-1)} bleibt historisch unveraendert`, actual === entry.sha256);
    }
    psql(entry.source);
  }
  check("additive Kandidatenmigration laeuft auf der echten lokalen Migrationskette", true);

  psql(`
    insert into auth.users (id) values ('${ACCOUNT_ID}');
    insert into public.kd_account_access (account_id,role,active,personal_ai)
      values ('${ACCOUNT_ID}','owner',true,true);
    insert into public.kd_radar_capabilities
      (account_id,radar_unlimited,radar_review,radar_pilot)
      values ('${ACCOUNT_ID}',true,true,true);
    insert into public.kd_radar_sources
      (source_id,domain,publisher_family,source_class,rights_status,
       attribution_approved,subdomains_allowed,active,terms_checked_at)
      values ('studio-official','studio.example','studio','official','approved',true,false,true,current_date);
    update public.kd_radar_settings
       set radar_aktiv=true,radar_provider_aktiv=true
     where singleton;
  `);

  const subscription = jsonResult(`select public.kd_radar_pilot_set_subscription(
    'person:wikidata:Q42869:actor','all','active',
    '20000000-0000-4000-8000-000000000001'::uuid,
    'wikidata:Q42869','actor'
  );`, { account: true });
  check("starke Personen-ID plus Schauspielrolle erzeugen genau ein aktives Abo", subscription.status === "active");

  const roleMismatch = psql(`select set_config('request.jwt.claim.sub','${ACCOUNT_ID}',false);
    select public.kd_radar_pilot_set_subscription(
      'person:wikidata:Q42869:actor','all','active',
      '20000000-0000-4000-8000-000000000002'::uuid,
      'wikidata:Q42869','director'
    );`, { allowFailure: true });
  check("Rollenwiderspruch stoppt fail-closed", roleMismatch.ok === false);

  const directorSubscription = jsonResult(`select public.kd_radar_pilot_set_subscription(
    'person:wikidata:Q47284:director','all','active',
    '20000000-0000-4000-8000-000000000003'::uuid,
    'wikidata:Q47284','director'
  );`, { account: true });
  const directorContext = jsonResult(`select public.kd_radar_websearch_context(
    '${ACCOUNT_ID}'::uuid,'person:wikidata:Q47284:director'
  );`);
  check("Regie bleibt auch im Serververtrag ein eigener eindeutiger Discriminator",
    directorSubscription.status === "active"
      && directorContext.personExternalId === "wikidata:Q47284"
      && directorContext.role === "director"
      && directorContext.catalog[0].targetId === "catalog:sin-city-2005");

  const context = jsonResult(`select public.kd_radar_websearch_context(
    '${ACCOUNT_ID}'::uuid,'person:wikidata:Q42869:actor'
  );`);
  check("Serverkontext liefert nur die starke Person und den kleinen kuratierten Werkkatalog",
    context.kind === "person"
      && context.personExternalId === "wikidata:Q42869"
      && context.role === "actor"
      && context.catalog.length === 1
      && context.catalog[0].targetId === "catalog:dream-scenario-2023");

  const checkedAt = `${context.windowStart}T12:00:00.000Z`;
  const payload = {
    targetKey: "catalog:dream-scenario-2023",
    eventType: "kinostart_at",
    date: context.windowStart,
    region: "AT",
    platform: "-",
    seasonNumber: null,
    evidence: [{
      sourceId: "studio-official",
      url: "https://studio.example/dream-scenario-at",
      retrievedAt: checkedAt,
    }],
    personTargetKey: context.targetId,
    personExternalId: context.personExternalId,
    personRole: context.role,
    personName: context.canonicalName,
    workTargetType: context.catalog[0].targetType,
    workTitle: context.catalog[0].title,
    workYear: context.catalog[0].year,
    checkedAt,
    windowStart: context.windowStart,
    windowEnd: context.windowEnd,
  };
  const payloadSql = `$payload$${JSON.stringify(payload)}$payload$::jsonb`;
  const first = jsonResult(`select public.kd_radar_websearch_upsert_person_event(
    '${ACCOUNT_ID}'::uuid,'30000000-0000-4000-8000-000000000001'::uuid,${payloadSql}
  );`);
  const repeated = jsonResult(`select public.kd_radar_websearch_upsert_person_event(
    '${ACCOUNT_ID}'::uuid,'30000000-0000-4000-8000-000000000002'::uuid,${payloadSql}
  );`);
  check("kuratiertes Personenwerk wird in vorhandene Event- und Evidenzprimitiven geschrieben", first.status === "confirmed");
  check("zweiter identischer Fund dedupliziert ohne neue Version", repeated.status === "no_change"
    && repeated.eventVersionId === first.eventVersionId);

  const persisted = jsonResult(`select jsonb_build_object(
    'events',(select count(*) from public.kd_radar_events where target_id =
      (select target_id from public.kd_radar_targets where target_key='catalog:dream-scenario-2023')),
    'versions',(select count(*) from public.kd_radar_event_versions where event_id='${first.eventId}'::uuid),
    'evidence',(select count(*) from public.kd_radar_evidence where event_version_id='${first.eventVersionId}'::uuid)
  );`);
  check("Dedupe hinterlaesst genau ein Event, eine Version und einen Beleg",
    persisted.events === 1 && persisted.versions === 1 && persisted.evidence === 1);

  const feed = jsonResult("select public.kd_radar_pilot_feed(array[]::uuid[]);", { account: true });
  check("Feed v2 liefert den bestaetigten Personenfund nach einem Reload lesbar",
    feed.format === "kd-radar-pilot-feed-v2"
      && feed.personResults.length === 1
      && feed.personResults[0].person.name === "Nicolas Cage"
      && feed.personResults[0].person.role === "actor"
      && feed.personResults[0].candidates[0].title === "Dream Scenario");

  const reservation = jsonResult(`select public.kd_radar_websearch_auftrag_starten(
    '${ACCOUNT_ID}'::uuid,'person:wikidata:Q42869:actor',
    '40000000-0000-4000-8000-000000000001'::uuid,2.25,1
  );`);
  check("atomare Reservierung ist messbar und akzeptiert keinen unbekannten Kostenstand",
    reservation.ok === true && reservation.reservationUsdCent === 2.25);
  const limited = jsonResult(`select set_config('kd.test_budget_decision','limit',false);
    select public.kd_radar_websearch_auftrag_starten(
      '${ACCOUNT_ID}'::uuid,'person:wikidata:Q42869:actor',
      '40000000-0000-4000-8000-000000000002'::uuid,2.25,1
    );`);
  check("bekannte Budgetablehnung bleibt eine Ablehnung", limited.ok === false && limited.code === "limit");

  const workSubscription = jsonResult(`select public.kd_radar_pilot_set_subscription(
    'catalog:barbie-2023','all','active','50000000-0000-4000-8000-000000000001'::uuid
  );`, { account: true });
  const workContext = jsonResult(`select public.kd_radar_websearch_context(
    '${ACCOUNT_ID}'::uuid,'catalog:barbie-2023'
  );`);
  check("bestehender vierparametriger Werkpfad bleibt unveraendert nutzbar",
    workSubscription.status === "active"
      && workContext.targetId === "catalog:barbie-2023"
      && workContext.canonicalTitle === "Barbie"
      && workContext.kind === undefined);

  const candidateSql = migrationBytes.at(-1).source;
  const executableCandidateSql = candidateSql.replace(/--[^\n]*/g, "");
  check("Kandidat fuehrt keine neue Tabelle, Queue, Planung oder Ranking ein",
    !/create\s+table|\bcron\.|pg_cron|scheduler|\bretry\b|\branking\b/i.test(executableCandidateSql));
  check("Kandidat ergaenzt genau die zwei noetigen Personenfelder am bestehenden Abo",
    (candidateSql.match(/add column person_(?:external_id|role) text/g) || []).length === 2);

  console.log(`${checks} Personenradar-PG17-Checks bestanden.`);
} finally {
  if (running) {
    run("pg_ctl", ["--pgdata", cluster.data, "--wait", "stop"], { allowFailure: true });
  }
  rmSync(root, { recursive: true, force: true });
}
