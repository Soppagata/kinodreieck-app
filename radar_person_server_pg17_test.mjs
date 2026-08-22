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
import {
  buildRadarPersonCandidateSurfaceSql,
  validateRadarPersonCandidateSurface,
} from "./tools/radar_e18_process_executor.mjs";

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
    sha256: "d23f80f7073deb1197fdcb0b5a73f4abd1ad002e0b3bded6ee08c691d937f658",
  }),
]);
const DAILY_HISTORY = Object.freeze({
  path: "supabase/migrations/20260820200000_entdecken_daily_feed.sql",
  sha256: "bc951974a199be606285c6358c05e64e68ba88193c83ffc5888b022217e8e978",
});
const PERSON_CATALOG_REPAIR = Object.freeze({
  path: "supabase/migrations/20260821120000_radar_person_catalog_repair.sql",
  version: "20260821120000",
  name: "radar_person_catalog_repair",
});
const TITLE_GROUP_MIGRATION = Object.freeze({
  path: "supabase/migrations/20260821130000_radar_title_group.sql",
  version: "20260821130000",
  name: "radar_title_group",
});
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const REMOTE_PERSON_FINGERPRINT =
  "bade140d6710349110be22457cbfd1a9398a99fe23a885b39f0ebbbd7885c812";
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
create schema supabase_migrations;
create schema extensions;
create extension pgcrypto with schema extensions;
create table supabase_migrations.schema_migrations (
  version text not null,
  name text not null,
  statements text[]
);
insert into supabase_migrations.schema_migrations (version,name,statements) values
  ('20260819220000','radar_person_server_candidate',array[]::text[]),
  ('20260820200000','entdecken_daily_feed',array[]::text[]);
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
const dailyHistorySource = readFileSync(DAILY_HISTORY.path, "utf8");
const repairSource = readFileSync(PERSON_CATALOG_REPAIR.path, "utf8");
const titleGroupSource = readFileSync(TITLE_GROUP_MIGRATION.path, "utf8");

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
  check(`${DAILY_HISTORY.path.split("/").at(-1)} bleibt historisch unveraendert`,
    createHash("sha256").update(dailyHistorySource).digest("hex") === DAILY_HISTORY.sha256);
  check("additive Kandidatenmigration laeuft auf der echten lokalen Migrationskette", true);
  const candidateSurface = jsonResult(buildRadarPersonCandidateSurfaceSql());
  check("Kandidaten-Surface prueft RLS enabled und FORCE separat auf echtem PG17",
    validateRadarPersonCandidateSurface(candidateSurface, { fehlerAusgabe() {} }) === true);

  psql(`
    insert into auth.users (id) values ('${ACCOUNT_ID}');
    insert into public.kd_radar_targets (
      target_key,target_type,target_status,canonical_title,external_ids
    ) values (
      'person:wikidata:Q999999:actor','person','active','Unberuehrte Person',
      '{"personExternalId":"wikidata:Q999999","personRole":"actor","catalog":[{"targetId":"catalog:psycho-1960","targetType":"work","title":"Psycho","year":1960}]}'::jsonb
    );
    insert into public.kd_radar_subscriptions (
      account_id,target_id,region,scope,subscription_status,server_revision,
      last_operation_id,person_external_id,person_role
    )
    select '${ACCOUNT_ID}',target_id,'AT','all','active',1,
      '10000000-0000-4000-8000-000000000099','wikidata:Q999999','actor'
    from public.kd_radar_targets
    where target_key='person:wikidata:Q999999:actor';
    delete from public.kd_radar_targets
    where target_key='person:wikidata:Q7374:director';
  `);
  const curatedCountSql = `select count(*) from public.kd_radar_targets
    where target_type='person' and target_status='active' and target_key in (
      'person:wikidata:Q42869:actor','person:wikidata:Q47284:director',
      'person:wikidata:Q271967:actor','person:wikidata:Q271967:director',
      'person:wikidata:Q7374:director'
    );`;
  const curatedExactCountSql = `select count(*) from (values
      ('person:wikidata:Q42869:actor','person','active','Nicolas Cage',
       '{"personExternalId":"wikidata:Q42869","personRole":"actor","catalog":[{"targetId":"catalog:dream-scenario-2023","targetType":"work","title":"Dream Scenario","year":2023}]}'::jsonb),
      ('person:wikidata:Q47284:director','person','active','Robert Rodriguez',
       '{"personExternalId":"wikidata:Q47284","personRole":"director","catalog":[{"targetId":"catalog:sin-city-2005","targetType":"work","title":"Sin City","year":2005}]}'::jsonb),
      ('person:wikidata:Q271967:actor','person','active','Greta Gerwig',
       '{"personExternalId":"wikidata:Q271967","personRole":"actor","catalog":[{"targetId":"catalog:frances-ha-2012","targetType":"work","title":"Frances Ha","year":2012}]}'::jsonb),
      ('person:wikidata:Q271967:director','person','active','Greta Gerwig',
       '{"personExternalId":"wikidata:Q271967","personRole":"director","catalog":[{"targetId":"catalog:barbie-2023","targetType":"work","title":"Barbie","year":2023}]}'::jsonb),
      ('person:wikidata:Q7374:director','person','active','Alfred Hitchcock',
       '{"personExternalId":"wikidata:Q7374","personRole":"director","catalog":[{"targetId":"catalog:psycho-1960","targetType":"work","title":"Psycho","year":1960}]}'::jsonb)
    ) expected(target_key,target_type,target_status,canonical_title,external_ids)
    join public.kd_radar_targets target
      on target.target_key=expected.target_key
     and target.target_type=expected.target_type
     and target.target_status=expected.target_status
     and target.canonical_title=expected.canonical_title
     and target.external_ids=expected.external_ids;`;
  const protectedSurfaceSql = `select jsonb_build_object(
    'curatedWithoutStatus',(select coalesce(jsonb_agg(to_jsonb(target)-'target_status'
      order by target.target_key),'[]'::jsonb) from public.kd_radar_targets target
      where target.target_key in (
        'person:wikidata:Q42869:actor','person:wikidata:Q47284:director',
        'person:wikidata:Q271967:actor','person:wikidata:Q271967:director',
        'person:wikidata:Q7374:director')),
    'otherTargets',(select coalesce(jsonb_agg(to_jsonb(target) order by target.target_key),'[]'::jsonb)
      from public.kd_radar_targets target where target.target_key not in (
        'person:wikidata:Q42869:actor','person:wikidata:Q47284:director',
        'person:wikidata:Q271967:actor','person:wikidata:Q271967:director',
        'person:wikidata:Q7374:director')),
    'subscriptions',(select coalesce(jsonb_agg(to_jsonb(subscription)
      order by to_jsonb(subscription)::text),'[]'::jsonb) from public.kd_radar_subscriptions subscription),
    'events',(select coalesce(jsonb_agg(to_jsonb(event)
      order by to_jsonb(event)::text),'[]'::jsonb) from public.kd_radar_events event),
    'flags',(select coalesce(jsonb_agg(to_jsonb(settings)
      order by to_jsonb(settings)::text),'[]'::jsonb) from public.kd_radar_settings settings)
  );`;
  const knownFingerprintSql = `select encode(extensions.digest(
    convert_to(to_jsonb(target)::text,'UTF8'),'sha256'),'hex')
    from public.kd_radar_targets target
    where target.target_key='person:wikidata:Q42869:actor';`;
  check("synthetischer Remote-Drift startet mit exakt 4/5 kuratierten Personenzielen",
    psql(curatedCountSql).stdout === "4");
  const foreignBefore = jsonResult(`select jsonb_build_object(
    'target',to_jsonb(t) - 'created_at' - 'updated_at',
    'subscription',to_jsonb(s) - 'created_at' - 'updated_at'
  ) from public.kd_radar_targets t
  join public.kd_radar_subscriptions s on s.target_id=t.target_id
  where t.target_key='person:wikidata:Q999999:actor';`);

  psql(repairSource);
  psql(`insert into supabase_migrations.schema_migrations (version,name,statements)
    values ('${PERSON_CATALOG_REPAIR.version}','${PERSON_CATALOG_REPAIR.name}',array[]::text[]);`);
  check("Forwardrepair schliesst die belegte 4/5-Baseline exakt auf 5/5",
    psql(curatedExactCountSql).stdout === "5");
  const foreignAfterFirst = jsonResult(`select jsonb_build_object(
    'target',to_jsonb(t) - 'created_at' - 'updated_at',
    'subscription',to_jsonb(s) - 'created_at' - 'updated_at'
  ) from public.kd_radar_targets t
  join public.kd_radar_subscriptions s on s.target_id=t.target_id
  where t.target_key='person:wikidata:Q999999:actor';`);
  check("Forwardrepair veraendert weder fremdes Personenziel noch dessen Subscription",
    JSON.stringify(foreignAfterFirst) === JSON.stringify(foreignBefore));

  check("Forwardrepair ist genau an den belegten Remote-Fingerprint gebunden",
    (repairSource.match(new RegExp(REMOTE_PERSON_FINGERPRINT, "g")) || []).length === 1);
  psql(`update public.kd_radar_targets set target_status='retired'
    where target_key='person:wikidata:Q42869:actor';`);
  const localPersonFingerprint = psql(knownFingerprintSql).stdout;
  check("synthetischer Statusdrift bildet die belegte 5-vorhanden/4-exakt-Form ab",
    /^[0-9a-f]{64}$/.test(localPersonFingerprint)
      && localPersonFingerprint !== REMOTE_PERSON_FINGERPRINT
      && psql(curatedCountSql).stdout === "4"
      && psql(curatedExactCountSql).stdout === "4");
  const protectedBeforeFingerprintCheck = jsonResult(protectedSurfaceSql);
  const fingerprintMismatch = psql(repairSource, { allowFailure: true });
  const protectedAfterFingerprintCheck = jsonResult(protectedSurfaceSql);
  check("abweichender Vollzeilen-Fingerprint rollt die Statuskorrektur ohne Nebenwirkung zurueck",
    fingerprintMismatch.ok === false
      && fingerprintMismatch.stderr.includes("radar_person_catalog_person_fingerprint_drift")
      && psql(`select target_status from public.kd_radar_targets
        where target_key='person:wikidata:Q42869:actor';`).stdout === "retired"
      && JSON.stringify(protectedAfterFingerprintCheck)
        === JSON.stringify(protectedBeforeFingerprintCheck));

  const locallyBoundRepairSource = repairSource.replace(
    REMOTE_PERSON_FINGERPRINT, localPersonFingerprint,
  );
  psql(locallyBoundRepairSource);
  const protectedAfterKnownRepair = jsonResult(protectedSurfaceSql);
  check("exakt gebundener 5/4-Statusdrift wird mit einer Feldkorrektur auf 5/5 geschlossen",
    psql(curatedExactCountSql).stdout === "5"
      && psql(`select target_status from public.kd_radar_targets
        where target_key='person:wikidata:Q42869:actor';`).stdout === "active"
      && JSON.stringify(protectedAfterKnownRepair)
        === JSON.stringify(protectedBeforeFingerprintCheck));

  psql(repairSource);
  const protectedAfterReplay = jsonResult(protectedSurfaceSql);
  const forwardCounts = jsonResult(`select jsonb_build_object(
    'curated',(${curatedCountSql.replace(/;$/, "")}),
    'foreignTargets',(select count(*) from public.kd_radar_targets
      where target_key='person:wikidata:Q999999:actor'),
    'foreignSubscriptions',(select count(*) from public.kd_radar_subscriptions s
      join public.kd_radar_targets t on t.target_id=s.target_id
      where t.target_key='person:wikidata:Q999999:actor'),
    'personHistory',(select count(*) from supabase_migrations.schema_migrations
      where version='20260819220000'),
    'dailyHistory',(select count(*) from supabase_migrations.schema_migrations
      where version='20260820200000'),
    'repairLedger',(select count(*) from supabase_migrations.schema_migrations
      where version='${PERSON_CATALOG_REPAIR.version}')
  );`);
  check("zweiter SQL-Lauf ist idempotent und historische Ledger bleiben genau einmal",
    forwardCounts.curated === 5
      && forwardCounts.foreignTargets === 1
      && forwardCounts.foreignSubscriptions === 1
      && forwardCounts.personHistory === 1
      && forwardCounts.dailyHistory === 1
      && forwardCounts.repairLedger === 1
      && JSON.stringify(protectedAfterReplay) === JSON.stringify(protectedAfterKnownRepair));

  psql(titleGroupSource);
  psql(`insert into supabase_migrations.schema_migrations (version,name,statements)
    values ('${TITLE_GROUP_MIGRATION.version}','${TITLE_GROUP_MIGRATION.name}',array[]::text[]);`);
  check("additive Titelgruppenmigration schliesst Feed, Start und Schreibvertrag auf PG17", true);

  psql(`
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

  const starWarsMembers = [
    { targetId: "watchmode:71001", targetType: "work", title: "Star Wars: Episode I", year: 1999 },
    { targetId: "watchmode:71002", targetType: "work", title: "Star Wars: Episode II", year: 2002 },
    { targetId: "watchmode:71003", targetType: "work", title: "Star Wars: Episode III", year: 2005 },
    { targetId: "watchmode:71004", targetType: "work", title: "Star Wars: Episode IV", year: 1977 },
  ];
  const starWarsGroup = {
    format: "kd-radar-title-group-v1",
    queryVersion: "title-group-query-v1",
    queryKey: "star wars",
    displayName: "Star Wars",
    members: starWarsMembers,
  };
  const starWarsGroupSql = `$group$${JSON.stringify(starWarsGroup)}$group$::jsonb`;
  const groupSubscription = jsonResult(`select public.kd_radar_pilot_set_title_group(
    'title-group:v1:star-wars','all','active',
    '60000000-0000-4000-8000-000000000001'::uuid,${starWarsGroupSql}
  );`, { account: true });
  const groupContext = jsonResult(`select public.kd_radar_websearch_context(
    '${ACCOUNT_ID}'::uuid,'title-group:v1:star-wars'
  );`);
  check("Titelgruppe wird als genau ein aktives Ziel mit vier starken Werken persistiert",
    groupSubscription.status === "active"
      && groupContext.kind === "title_group"
      && groupContext.targetId === "title-group:v1:star-wars"
      && groupContext.catalog.length === 4
      && psql(`select count(*) from public.kd_radar_subscriptions s
        join public.kd_radar_targets t on t.target_id=s.target_id
        where s.account_id='${ACCOUNT_ID}' and t.target_key='title-group:v1:star-wars';`).stdout === "1");

  const groupReservation = jsonResult(`select public.kd_radar_websearch_auftrag_starten(
    '${ACCOUNT_ID}'::uuid,'title-group:v1:star-wars',
    '60000000-0000-4000-8000-000000000002'::uuid,2.25,1
  );`);
  check("Titelgruppe darf den bestehenden kostenbegrenzten Startvertrag nutzen",
    groupReservation.ok === true && groupReservation.reservationUsdCent === 2.25);

  const groupCheckedAt = `${context.windowStart}T12:00:00.000Z`;
  const groupPayload = {
    targetKey: "watchmode:71004",
    eventType: "kinostart_at",
    date: context.windowStart,
    region: "AT",
    platform: "-",
    seasonNumber: null,
    evidence: [{
      sourceId: "studio-official",
      url: "https://studio.example/star-wars-episode-iv-at",
      retrievedAt: groupCheckedAt,
    }],
    titleGroupTargetKey: "title-group:v1:star-wars",
    queryVersion: "title-group-query-v1",
    queryKey: "star wars",
    displayName: "Star Wars",
    workTargetType: "work",
    workTitle: "Star Wars: Episode IV",
    workYear: 1977,
    checkedAt: groupCheckedAt,
  };
  const groupPayloadSql = `$payload$${JSON.stringify(groupPayload)}$payload$::jsonb`;
  const groupEvent = jsonResult(`select public.kd_radar_websearch_upsert_title_group_event(
    '${ACCOUNT_ID}'::uuid,'60000000-0000-4000-8000-000000000003'::uuid,${groupPayloadSql}
  );`);
  const groupEventReplay = jsonResult(`select public.kd_radar_websearch_upsert_title_group_event(
    '${ACCOUNT_ID}'::uuid,'60000000-0000-4000-8000-000000000003'::uuid,${groupPayloadSql}
  );`);
  const groupFeed = jsonResult("select public.kd_radar_pilot_feed(array[]::uuid[]);", { account: true });
  check("Gruppenfund schreibt Evidenz pro konkretem Werk und erscheint nach Feed-Reload",
    groupEvent.status === "confirmed"
      && groupEventReplay.eventVersionId === groupEvent.eventVersionId
      && groupFeed.subscriptions.find((entry) => entry.targetId === "title-group:v1:star-wars")?.titleGroup.members.length === 4
      && groupFeed.events.some((entry) => (
        entry.targetId === "watchmode:71004" && entry.eventVersionId === groupEvent.eventVersionId
      )));
  check("temporäre Werkautorisierung hinterlässt kein verborgenes Einzelabo",
    psql(`select count(*) from public.kd_radar_subscriptions s
      join public.kd_radar_targets t on t.target_id=s.target_id
      where s.account_id='${ACCOUNT_ID}' and t.target_key='watchmode:71004';`).stdout === "0");

  const individualEpisode = jsonResult(`select public.kd_radar_pilot_set_subscription(
    'watchmode:71004','all','active','60000000-0000-4000-8000-000000000004'::uuid
  );`, { account: true });
  jsonResult(`select public.kd_radar_pilot_set_subscription(
    'watchmode:71004','all','paused','60000000-0000-4000-8000-000000000005'::uuid
  );`, { account: true });
  jsonResult(`select public.kd_radar_websearch_upsert_title_group_event(
    '${ACCOUNT_ID}'::uuid,'60000000-0000-4000-8000-000000000006'::uuid,${groupPayloadSql}
  );`);
  check("ein ausdrücklich gewähltes Episode-IV-Werk bleibt ein eigenes Ziel und nach Gruppenprüfung pausiert",
    individualEpisode.targetId === "watchmode:71004"
      && psql(`select s.subscription_status from public.kd_radar_subscriptions s
        join public.kd_radar_targets t on t.target_id=s.target_id
        where s.account_id='${ACCOUNT_ID}' and t.target_key='watchmode:71004';`).stdout === "paused");

  const futureStarWarsGroup = {
    ...starWarsGroup,
    members: [...starWarsMembers, {
      targetId: "watchmode:71005", targetType: "work", title: "Star Wars: Episode V", year: 1980,
    }],
  };
  const futureGroupSql = `$group$${JSON.stringify(futureStarWarsGroup)}$group$::jsonb`;
  jsonResult(`select public.kd_radar_pilot_set_title_group(
    'title-group:v1:star-wars','all','active',
    '60000000-0000-4000-8000-000000000007'::uuid,${futureGroupSql}
  );`, { account: true });
  const futureGroupFeed = jsonResult("select public.kd_radar_pilot_feed(array[]::uuid[]);", { account: true });
  const futureSubscription = futureGroupFeed.subscriptions.find((entry) => (
    entry.targetId === "title-group:v1:star-wars"
  ));
  check("eine spätere deterministische Auflösung ergänzt Episode V, die Gruppe bleibt ein Ziel",
    futureSubscription?.titleGroup.members.length === 5
      && futureSubscription.titleGroup.members.at(-1).targetId === "watchmode:71005"
      && futureGroupFeed.subscriptions.filter((entry) => entry.targetId === "title-group:v1:star-wars").length === 1);

  const mismatchedGroupPayload = {
    ...groupPayload,
    workTitle: "Star Warship",
  };
  const mismatchWrite = psql(`select public.kd_radar_websearch_upsert_title_group_event(
    '${ACCOUNT_ID}'::uuid,'60000000-0000-4000-8000-000000000008'::uuid,
    $payload$${JSON.stringify(mismatchedGroupPayload)}$payload$::jsonb
  );`, { allowFailure: true });
  check("Titelwiderspruch im Gruppenfund stoppt vor einem Evidenzwrite",
    mismatchWrite.ok === false
      && mismatchWrite.stderr.includes("radar_title_group_member_unavailable"));

  const candidateSql = migrationBytes.at(-1).source;
  const executableCandidateSql = candidateSql.replace(/--[^\n]*/g, "");
  check("Kandidat fuehrt keine neue Tabelle, Queue, Planung oder Ranking ein",
    !/create\s+table|\bcron\.|pg_cron|scheduler|\bretry\b|\branking\b/i.test(executableCandidateSql));
  check("Kandidat ergaenzt genau die zwei noetigen Personenfelder am bestehenden Abo",
    (candidateSql.match(/add column person_(?:external_id|role) text/g) || []).length === 2);

  psql(`update public.kd_radar_targets set canonical_title='Drift'
    where target_key='person:wikidata:Q7374:director';`);
  const inconsistent = psql(repairSource, { allowFailure: true });
  check("abweichender Zielschluessel statt des belegten Statusfalls stoppt fail-closed",
    inconsistent.ok === false
      && inconsistent.stderr.includes("radar_person_catalog_person_fingerprint_drift"));
  psql(`update public.kd_radar_targets set canonical_title='Alfred Hitchcock'
    where target_key='person:wikidata:Q7374:director';
    delete from public.kd_radar_targets where target_key in (
      'person:wikidata:Q271967:actor','person:wikidata:Q271967:director'
    );`);
  const missing = psql(repairSource, { allowFailure: true });
  check("eine unbekannte 3/5-Baseline wird nicht still neu geseedet",
    missing.ok === false
      && missing.stderr.includes("radar_person_catalog_baseline_count_drift")
      && psql(curatedCountSql).stdout === "3");

  console.log(`${checks} Personenradar-PG17-Checks bestanden.`);
} finally {
  if (running) {
    run("pg_ctl", ["--pgdata", cluster.data, "--wait", "stop"], { allowFailure: true });
  }
  rmSync(root, { recursive: true, force: true });
}
