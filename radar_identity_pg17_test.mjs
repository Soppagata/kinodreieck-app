/* Disposable local PostgreSQL, real Radar migration chain, synthetic accounts.
   No credentials, remote connection, provider request or shared database. */
import assert from "node:assert/strict";
import {buildRadarIdentityManifest,validateRadarIdentityProjection,projectStableRadarNews} from "./src/lib/radarStableIdentity.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { validateRadarPilotFeed } from "./src/lib/radarPilotContracts.js";
import { createLocalTextRadarTargetId } from "./src/lib/localEventRadar.js";

const PG = "/Applications/Postgres.app/Contents/Versions/17/bin";
const root = mkdtempSync("/private/tmp/kd-identity-pg-");
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket);
let running = false;
let checks = 0;
function run(binary, args, input) {
  const result = spawnSync(join(PG,binary), args, {
    input, encoding:"utf8", timeout:60_000, maxBuffer:8_000_000,
    env:{ PATH:`${PG}:/usr/bin:/bin`, LANG:"C", LC_ALL:"C" },
  });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function sql(query) {
  return run("psql",["-h",socket,"-p","65453","-U","postgres","-d","postgres","-X","-qAt","-v","ON_ERROR_STOP=1","-f","-"],query);
}
const a = "a1000000-0000-4000-8000-000000000001";
const b = "a1000000-0000-4000-8000-000000000002";
const targetText = "Synthetische Sternenreihe";
const targetId = createLocalTextRadarTargetId(targetText);
const quote = (value) => `'${String(value).replaceAll("'","''")}'`;
const session = (id,query,role="authenticated") => sql(`begin; set local role ${role}; select set_config('request.jwt.claim.sub',${quote(id)},true); select set_config('request.jwt.claim.role',${quote(role)},true); ${query}; commit;`).split("\n").at(-1);
const ack = (status) => session(a,`select public.kd_radar_pilot_set_text_subscription(${quote(targetText)},${quote(status)},gen_random_uuid())`);
const feed = (id=a) => JSON.parse(session(id,"select public.kd_radar_pilot_feed_search_access('{}'::uuid[],true)"));
const productionFeed = (id=a) => JSON.parse(session(id,"select public.kd_radar_pilot_feed('{}'::uuid[],true)"));
const legacyFeed = (id=a) => JSON.parse(session(id,"select public.kd_radar_pilot_feed('{}'::uuid[])"));
function check(name,fn) { fn(); checks++; console.log(`✓ ${name}`); }
try {
  run("initdb",["--no-locale","--encoding=UTF8","--auth=trust","--username=postgres","--pgdata",data]);
  run("pg_ctl",["--pgdata",data,"--log",join(root,"postgres.log"),"--options",`-c listen_addresses= -c unix_socket_directories=${socket} -p 65453 -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,"--wait","start"]);
  running = true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth,extensions to anon,authenticated,service_role;
  `);
  sql(readFileSync("supabase/current_schema.sql","utf8"));
  sql(`insert into public.kd_ai_limits(schluessel,wert) values
    ('ai_aktiv','true'),('monatsbudget_usd_cent','1500'),
    ('tageslimit_auftraege','30'),('parallel_max','2'),('timeout_ms','30000'),
    ('anbieter_request_max_usd_cent','500'),('task_modell','{}'),
    ('task_max_tokens','{}'),('task_max_reservierung_usd_cent','{}');`);
  const selected = readdirSync("supabase/migrations").filter((file) =>
    file.endsWith(".sql") && file >= "20260809180000" && (
      /radar|event_radar|private_pilot|private_export|automatic_ai_retry/.test(file)
    ));
  for (const file of selected) {
    if (file.startsWith("20260825120000")) sql("update public.kd_radar_settings set radar_aktiv=true,radar_provider_aktiv=true");
    const previousAcl = file.startsWith("20260831120000")
      ? sql("select proacl::text from pg_proc where oid='public.kd_radar_pilot_feed(uuid[])'::regprocedure") : null;
    const previousDefinition = previousAcl !== null
      ? sql("select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[])'::regprocedure)") : null;
    const productionDefinitions = file.startsWith("20260914210000") ? {
      one: sql("select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[])'::regprocedure)"),
      two: sql("select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[],boolean)'::regprocedure)"),
    } : null;
    try { sql(readFileSync(join("supabase/migrations",file),"utf8")); }
    catch (error) { throw new Error(`${file}: ${error.message}`); }
    if (previousAcl !== null) check("Opt-in-Überladung erhält Alt-RPC bytegenau und schützt neue Signatur ohne Default",() => {
      assert.equal(sql("select proacl::text from pg_proc where oid='public.kd_radar_pilot_feed(uuid[])'::regprocedure"),previousAcl);
      assert.equal(sql("select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[])'::regprocedure)"),previousDefinition);
      assert.equal(sql("select prosecdef and proconfig @> array['search_path=pg_catalog, public'] and pronargdefaults=0 from pg_proc where oid='public.kd_radar_pilot_feed(uuid[],boolean)'::regprocedure"),"t");
      for(const signature of ["uuid[]","uuid[],boolean"]){
        assert.equal(sql(`select has_function_privilege('anon','public.kd_radar_pilot_feed(${signature})','EXECUTE')`),"f");
        assert.equal(sql(`select has_function_privilege('authenticated','public.kd_radar_pilot_feed(${signature})','EXECUTE')`),"t");
        assert.equal(sql(`select has_function_privilege('service_role','public.kd_radar_pilot_feed(${signature})','EXECUTE')`),"t");
      }
      assert.equal(sql("select has_table_privilege('authenticated','public.kd_radar_daily_runs','SELECT')"),"f");
    });
    if (productionDefinitions) check("Mitgliedsmigration laesst beide produktiven Feed-Signaturen bytegenau unveraendert",() => {
      assert.equal(sql("select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[])'::regprocedure)"),productionDefinitions.one);
      assert.equal(sql("select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[],boolean)'::regprocedure)"),productionDefinitions.two);
      assert.equal(sql("select prosecdef and proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid='public.kd_radar_pilot_feed_search_access(uuid[],boolean)'::regprocedure"),"t");
      assert.equal(sql("select has_function_privilege('anon','public.kd_radar_pilot_feed_search_access(uuid[],boolean)','EXECUTE')"),"f");
      assert.equal(sql("select has_function_privilege('authenticated','public.kd_radar_pilot_feed_search_access(uuid[],boolean)','EXECUTE')"),"t");
    });
  }
  sql(`insert into auth.users(id) values ('${a}'),('${b}');
    insert into public.kd_account_access(account_id,role,active,personal_ai) values
      ('${a}','member',true,true),('${b}','owner',true,true);
    insert into public.kd_radar_capabilities(account_id,radar_pilot,radar_review) values
      ('${a}',true,false),('${b}',true,true);`);
  sql(`update public.kd_account_access set role='owner' where account_id='${a}';
    update public.kd_radar_capabilities set radar_review=true where account_id='${a}';`);
  const today='2027-01-01',checkedAt=new Date().toISOString();
  ack('active');
  const persist=(extra={})=>JSON.parse(session(a,`select public.kd_radar_websearch_upsert_text_finding('${a}',gen_random_uuid(),${quote(JSON.stringify({
    textTargetKey:targetId,targetText,targetKey:'release:v1:1122334455667788',workTitle:'Polarlicht Staffel 2',workTargetType:'series',category:'series',
    eventType:'staffelstart',date:today,region:'AT',platform:'Disney+',seasonNumber:2,checkedAt,
    evidence:[{url:'https://press.example/release',sourceDomain:'press.example',sourceTitle:'Ankündigung',claim:'Belegter Start.'}],...extra,
  }))}::jsonb)`,'service_role'));
  const snapshot=()=>JSON.parse(sql(`select coalesce(jsonb_agg(to_jsonb(f)-'account_id' order by finding_id),'[]') from public.kd_radar_text_findings f where account_id='${a}'`));
  const comparable=({reconciledAt,...rest})=>rest;
  const stable=(id=a)=>JSON.parse(session(id,"select public.kd_radar_pilot_feed_stable_v1('{}'::uuid[],true)"));
  check('Erweiterte Topf-Whitelist erhält alte Keys, erlaubt nur den neuen und blockiert unbekannte Keys',()=>{
    sql(`insert into public.kd_personal(account_id,key,value) values('${a}','kd:radar','{}'),('${a}','kd:radar-identities:v1','{}')`);
    assert.throws(()=>sql(`insert into public.kd_personal(account_id,key,value) values('${a}','kd:boeser-topf','{}')`),/23514|check constraint/);
  });
  check('JS- und SQL-Folgenprüfung blockieren Mehrfachfolgen, Bereiche und Folge null',()=>{
    for(const title of ['Serie Staffel 2 Folge 2-3','Serie Staffel 2 Folge 2 und 3','Serie S02E02 / 03','Serie Staffel 2 Folge 0']) assert.equal(sql(`select public.kd_radar_identity_episode(${quote(title)})`),'-1');
    assert.equal(sql("select public.kd_radar_identity_episode('Serie Staffel 2 Folge 3')"),'3');
  });
  const first=persist();
  const second=persist({workTitle:'Polarlicht Season 2',evidence:[{url:'https://press.example/english',sourceDomain:'press.example',sourceTitle:'Release',claim:'Confirmed release.'}]});
  persist({platform:'Prime Video'});
  persist({workTitle:'Polarlicht weltweit Staffel 2',region:'global'});
  persist({eventType:'serienstart',seasonNumber:null,workTitle:'Polarlicht Serienpremiere'});
  persist({workTitle:'Polarlicht Staffel 3',seasonNumber:3});
  persist({workTitle:'Polarlicht Staffel 2 Folge 2'});
  persist({workTitle:'Polarlicht Staffel 2 Folge 3'});
  persist({workTitle:'Polarlicht Jubiläum Staffel 2'});
  const original=snapshot();
  const workId='a3000000-0000-5000-8000-000000000001';
  const manifest=buildRadarIdentityManifest({accountId:a,findings:original,works:[{workId,title:'Polarlicht',targetType:'series',releaseYear:null,externalIds:{}}],assignments:original.map(f=>({eventId:f.finding_id,workId,editionKey:f.title.includes('Jubiläum')?'reissue:anniversary':'original',licenseKey:'subscription',reason:'Synthetic reviewed alias and source.'}))});
  const apply=(m,id=a)=>JSON.parse(session(id,`select public.kd_radar_identity_apply(${quote(JSON.stringify(m))}::jsonb)`));
  check('Migration aktiviert kein Profil und verändert keinen alten Feedvertrag',()=>{
    assert.equal(sql('select count(*) from public.kd_radar_identity_settings'),'0');
    assert.deepEqual(comparable(stable().feed),comparable(feed()));assert.equal(stable().identities.enabled,false);
    assert.equal(validateRadarPilotFeed(stable().feed).ok,true);
  });
  check('Nur eigener Owner kann anwenden, fremdes Profil und Snapshot-Drift blockieren atomar',()=>{
    assert.throws(()=>apply({...manifest,accountId:b}),/radar_identity_forbidden|manifest_invalid/);
    const changed=structuredClone(manifest);changed.snapshot[0].platform='Other+';
    assert.throws(()=>apply(changed),/snapshot_drift/);
    assert.equal(sql('select count(*) from public.kd_radar_identity_works'),'0');
    assert.equal(sql('select count(*) from public.kd_radar_identity_settings'),'0');
  });
  const beforeReceipts=sql('select coalesce(jsonb_agg(to_jsonb(r)),\'[]\') from public.kd_radar_receipts r');
  const beforeImports=sql('select coalesce(jsonb_agg(to_jsonb(r)),\'[]\') from public.kd_radar_pilot_import_operations r');
  const beforeSubscriptions=sql('select jsonb_agg(to_jsonb(r) order by account_id,target_id) from public.kd_radar_subscriptions r');
  check('Explizite Übernahme ist additiv und erhält sämtliche Originalfelder, IDs und Beziehungen',()=>{
    const result=apply(manifest);assert.equal(result.ok,true);assert.equal(result.originalCount,original.length);
    assert.equal(result.startCount,original.length-1);assert.equal(result.observationCount,original.length);
    assert.deepEqual(snapshot(),original);
    assert.equal(sql('select coalesce(jsonb_agg(to_jsonb(r)),\'[]\') from public.kd_radar_receipts r'),beforeReceipts);
    assert.equal(sql('select coalesce(jsonb_agg(to_jsonb(r)),\'[]\') from public.kd_radar_pilot_import_operations r'),beforeImports);
    assert.equal(sql('select jsonb_agg(to_jsonb(r) order by account_id,target_id) from public.kd_radar_subscriptions r'),beforeSubscriptions);
  });
  check('Neue und alte Clients lesen parallel; Startarten, Plattformen, Märkte, Staffeln/Folgen und Editionen bleiben eigenständig',()=>{
    const f=stable();assert.equal(validateRadarPilotFeed(f.feed).ok,true);
    assert.equal(validateRadarIdentityProjection(f.identities,{accountId:a,events:f.feed.events}).ok,true,JSON.stringify(validateRadarIdentityProjection(f.identities,{accountId:a,events:f.feed.events})));
    assert.equal(new Set(f.identities.rows.map(r=>r.startId)).size,original.length-1);
    assert.deepEqual(feed().events,f.feed.events);
    const platformStarts=f.identities.rows.filter(r=>[first.eventId,second.eventId].includes(r.eventId));
    assert.equal(platformStarts[0].startId,platformStarts[1].startId);
  });
  check('Wiederholte Übernahme und identischer Fund sind idempotent',()=>{
    const before=stable().identities;apply(manifest);assert.deepEqual(stable().identities,before);
    assert.equal(persist().status,'no_change');assert.deepEqual(stable().identities,before);
    session(a,`set local timezone='Pacific/Auckland';select public.kd_radar_identity_capture('${first.eventId}')`,'service_role');assert.deepEqual(stable().identities,before);
  });
  check('Neuer Termin derselben bestätigten Quelle bleibt ein Start mit offenem Datumswiderspruch',()=>{
    persist({date:'2027-02-01'});
    const f=stable(),p=projectStableRadarNews(f.feed.events,'2026-10-19',f.identities);
    assert.equal(p.groups[0].starts.filter(s=>s.dateConflict).length,1);
    assert.deepEqual(p.groups[0].starts.find(s=>s.dateConflict).dates,['2027-01-01','2027-02-01']);
    assert.equal(f.identities.history.length,original.length+1);
  });
  check('Neuer Markt überschreibt keinen bestehenden AT-Fund; unbekannter Markt bleibt separat sichtbar',()=>{
    persist({region:'unspecified'});
    const rows=snapshot().filter(f=>f.title==='Polarlicht Staffel 2'&&f.event_date===today&&f.platform==='Disney+');
    assert.deepEqual(rows.map(f=>f.region).sort(),['AT','unspecified']);
    const f=stable();assert.equal(validateRadarPilotFeed(f.feed).ok,true);assert.equal(validateRadarIdentityProjection(f.identities,{accountId:a,events:f.feed.events}).ok,true);
    assert.ok(projectStableRadarNews(f.feed.events,'2026-10-19',f.identities).unmapped.some(e=>e.region==='unspecified'));
  });
  check('Neue Quellenversion verliert weder alten Beleg noch Originalversion oder Datum',()=>{
    persist({evidence:[{url:'https://new.example/release',sourceDomain:'new.example',sourceTitle:'New source',claim:'New claim.'}]});
    const f=stable();assert.equal(validateRadarPilotFeed(f.feed).ok,true);
    assert.ok(f.feed.events.some(e=>e.eventVersionId===first.eventVersionId));
    assert.equal(validateRadarIdentityProjection(f.identities,{accountId:a,events:f.feed.events}).ok,true,JSON.stringify(validateRadarIdentityProjection(f.identities,{accountId:a,events:f.feed.events})));
    assert.ok(f.identities.history.some(h=>h.eventVersionId===first.eventVersionId));
  });
  check('Identitäts-Export liefert den vollständigen eigenen Graphen und keinen fremden Bestand',()=>{
    const own=JSON.parse(session(a,'select public.kd_radar_identity_export_v1()'));
    assert.equal(own.works.length,1);assert.ok(own.observations.length>original.length);
    assert.equal(JSON.parse(session(b,'select public.kd_radar_identity_export_v1()')).observations.length,0);
  });
  check('Fremdkonto sieht keine Identität; Browser kann Identitätstabellen und internen Capturepfad nicht schreiben',()=>{
    assert.equal(stable(b).identities.rows.length,0);assert.equal(session(b,'select count(*) from public.kd_radar_identity_works'),'0');
    assert.throws(()=>session(a,'delete from public.kd_radar_identity_links'),/permission denied/);
    assert.throws(()=>session(a,`select public.kd_radar_identity_capture('${first.eventId}')`),/permission denied/);
  });
  const otherText='Andere synthetische Reihe',otherTarget=createLocalTextRadarTargetId(otherText);
  session(a,`select public.kd_radar_pilot_set_text_subscription(${quote(otherText)},'active',gen_random_uuid())`);
  const other=persist({textTargetKey:otherTarget,targetText:otherText});
  check('Zwei aktive Suchziele behalten beide Beziehungen zum selben Start',()=>{
    const f=stable();const rows=f.identities.rows.filter(r=>[other.eventId,second.eventId].includes(r.eventId));
    assert.equal(new Set(rows.map(r=>r.startId)).size,1);
    const groups=projectStableRadarNews(f.feed.events,'2026-10-19',f.identities).groups;
    assert.equal(groups[0].sourceTargetKeys.length,2);
  });
  check('Pause eines Ziels versteckt ausschließlich dessen Funde; Rollback schaltet nur die neue Projektion aus',()=>{
    ack('paused');assert.ok(stable().identities.rows.length>0);assert.ok(stable().identities.rows.every(r=>r.eventId===other.eventId));
    ack('active');const raw=snapshot();session(a,'select public.kd_radar_identity_disable()');
    assert.equal(stable().identities.enabled,false);assert.deepEqual(snapshot(),raw);assert.deepEqual(comparable(stable().feed),comparable(feed()));
  });
  check('Accountlöschung entfernt auch sämtliche neuen Zuordnungen und Beobachtungen',()=>{
    sql(`delete from auth.users where id='${a}'`);
    for(const name of ['settings','works','aliases','starts','observations','links']) assert.equal(sql(`select count(*) from public.kd_radar_identity_${name} where account_id='${a}'`),'0');
  });
  console.log(`${checks} Radar-Identitätsprüfungen mit lokalem PostgreSQL bestanden.`);
} finally {
  if(running)run('pg_ctl',['--pgdata',data,'--mode','immediate','--wait','stop']);
  rmSync(root,{recursive:true,force:true});
}
