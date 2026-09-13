/* Disposable PostgreSQL test: synthetic data only, no Supabase/provider access. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const candidates = [process.env.KD_TEST_PG_BIN, "/Applications/Postgres.app/Contents/Versions/17/bin", configured.status === 0 ? configured.stdout.trim() : null, "/usr/lib/postgresql/17/bin"].filter(Boolean);
const required = ["initdb", "pg_ctl", "psql"];
const PG = [...new Set(candidates)].find((dir) => required.every((name) => existsSync(join(dir, name))));
assert.ok(PG, `PostgreSQL server binaries are required (${required.join(", ")})`);

const root = mkdtempSync("/private/tmp/kd-motn-pg-");
const data = join(root, "data");
const socket = join(root, "socket");
const port = String(56000 + process.pid % 8000);
const migration = readFileSync("supabase/migrations/20260913160000_motn_streaming.sql", "utf8");
const env = { PATH: `${PG}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
let running = false;
let checks = 0;
mkdirSync(socket);

function run(binary, args, input) {
  const result = spawnSync(join(PG, binary), args, { input, encoding: "utf8", timeout: 60_000, maxBuffer: 4_000_000, env });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function runFailure(binary, binaryArgs, input) {
  const result = spawnSync(join(PG, binary), binaryArgs, { input, encoding: "utf8", timeout: 60_000, maxBuffer: 4_000_000, env });
  assert.notEqual(result.status, 0);
  return result.stderr;
}
const args = ["-h", socket, "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", args, query);
const sessionSql = (query, role = "service_role") => `begin; set local role ${role}; select set_config('request.jwt.claim.role','${role}',true); ${query}; commit;`;
const session = (query, role) => sql(sessionSql(query, role)).split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
const id = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, "0")}`;
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }

try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set", "shared_memory_type=mmap", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options", `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`, "--wait", "start"]);
  running = true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    create function public.kd_account_active() returns boolean language sql stable as $$select coalesce(current_setting('fixture.active',true),'true')='true'$$;
    create table public.kd_catalog(name text primary key,payload jsonb,updated_at timestamptz,quelle text,stand timestamptz,gueltig_bis timestamptz);
    alter table public.kd_catalog enable row level security;
    create policy catalog_active on public.kd_catalog for select to authenticated using(public.kd_account_active());
    grant select on public.kd_catalog to authenticated,service_role;
    insert into public.kd_catalog values('streaming_entdecken','{"stand":"fixture","titel":[{"watchmode_id":1,"imdb_id":"tt1302011","tmdb_id":49444,"typ":"movie","dienste":["Disney+"]}]}',now(),'watchmode',now(),null);`);
  sql(migration);
  sql(readFileSync("supabase/migrations/20260913170000_motn_initial_backfill.sql","utf8"));
  sql(readFileSync("supabase/migrations/20260913173000_motn_watchmode_identity.sql","utf8"));
  sql(readFileSync("supabase/migrations/20260913180000_motn_change_checks.sql","utf8"));
  sql(readFileSync("supabase/migrations/20260913190000_motn_usage_ticker.sql","utf8"));
  const call = (name,args='') => JSON.parse(session(`select public.${name}(${args})`));
  check('A missing lease cannot reserve provider requests',()=>{
    assert.equal(call('kd_motn_reserve',"null,'new'").reserved,false);
  });
  const token = id(1);
  const claim = call('kd_motn_claim',`'${token}'::uuid`);
  check('Only one run can hold the lease',()=>{
    assert.equal(claim.claimed,true);
    assert.equal(call('kd_motn_claim',`'${id(2)}'::uuid`).status,'busy');
  });
  check('Comparison calls are included in the free-plan ledger',()=>{
    assert.equal(sql('select count(*) from public.kd_motn_requests'),'4');
    sql('update public.kd_motn_requests set started_at=now()');
  });
  const stamp=new Date().toISOString();
  const record={show_id:'1364',service_id:'disney',country:'AT',available:true,event_at:stamp,added_at:stamp,checked_at:stamp,
    link:'https://www.disneyplus.com/fixture',show_data:{motn_id:'1364',imdb_id:'tt1302011',tmdb_id:49444,typ:'film',titel:'Kung Fu Panda 2'}};
  const records=JSON.stringify([record]);
  check('A page is stored together with its checkpoint and cannot be replayed',()=>{
    assert.equal(call('kd_motn_reserve',`'${token}','new'`).reserved,true);
    assert.equal(call('kd_motn_commit_page',`'${token}','new',null,'cursor-next','${records}'::jsonb,0`).ok,true);
    assert.equal(call('kd_motn_commit_page',`'${token}','new',null,'cursor-next','${records}'::jsonb,0`).ok,false);
    assert.equal(sql('select count(*) from public.kd_motn_offers'),'1');
  });
  check('The atomic catalog read includes MotN and obeys active-account RLS',()=>{
    const result=JSON.parse(session(`select payload from public.kd_streaming_catalog('streaming_entdecken')`,'authenticated'));
    assert.equal(result.motn.offers.length,1);
    assert.equal(result.titel[0].watchmode_id,1);
    assert.equal(session(`set local fixture.active='false'; select count(*) from public.kd_streaming_catalog('streaming_entdecken')`,'authenticated'),'0');
    assert.match(runFailure('psql',args,sessionSql(`select * from public.kd_streaming_catalog('streaming_entdecken')`,'anon')),/permission denied/);
  });
  check('Watchmode acknowledges the exact title and subscription service',()=>{
    assert.equal(call('kd_motn_reconcile_watchmode').acknowledged,1);
    assert.equal(sql('select watchmode_seen_at is not null from public.kd_motn_offers'),'t');
  });
  check('Exact title-year-type can acknowledge missing IDs; duplicate works remain blocked',()=>{
    sql(`update public.kd_catalog set payload='{"titel":[{"watchmode_id":1,"titel":"Kung Fu Panda 2","jahr":2011,"typ":"movie","dienste":["Disney+"]}]}';
      update public.kd_motn_offers set watchmode_seen_at=null,show_data=show_data || '{"jahr":2011}'::jsonb;`);
    assert.equal(call('kd_motn_reconcile_watchmode').acknowledged,1);
    sql(`update public.kd_catalog set payload=jsonb_set(payload,'{titel}',(payload->'titel') || '[{"watchmode_id":2,"titel":"Kung Fu Panda 2","jahr":2011,"typ":"movie","dienste":["Disney+"]}]');
      update public.kd_motn_offers set watchmode_seen_at=null;`);
    assert.equal(call('kd_motn_reconcile_watchmode').acknowledged,0);
  });
  sql('update public.kd_motn_sync set bootstrap_completed_at=now()');
  check('The daily 24-call cap cannot be exceeded by repeated reservations',()=>{
    for(let i=0;i<19;i++) assert.equal(call('kd_motn_reserve',`'${token}','removed'`).reserved,true);
    assert.equal(call('kd_motn_reserve',`'${token}','removed'`).reserved,false);
    assert.equal(sql('select count(*) from public.kd_motn_requests'),'24');
  });
  check('Initial backfill is limited to 80 requests and resumes only stored progress',()=>{
    sql('update public.kd_motn_sync set bootstrap_completed_at=null');
    for(let i=0;i<56;i++) assert.equal(call('kd_motn_reserve',`'${token}','removed'`).reserved,true);
    assert.equal(call('kd_motn_reserve',`'${token}','removed'`).reserved,false);
    call('kd_motn_finish',`'${token}','limited'`);
    assert.equal(call('kd_motn_claim',`'${token}'`).status,'not_due');
    assert.equal(sql("select checkpoints->'new'->>'cursor' from public.kd_motn_sync"),'cursor-next');
    sql("update public.kd_motn_sync set last_run_at=now()-interval '1 day'; update public.kd_motn_requests set started_at=now()-interval '1 day'");
    assert.equal(call('kd_motn_claim',`'${token}'`).claimed,true);
    assert.equal(call('kd_motn_reserve',`'${token}','new'`).reserved,true);
  });
  check('An error releases only the lease, retaining the completed page and cursor',()=>{
    assert.equal(call('kd_motn_finish',`'${token}','error'`).ok,true);
    assert.equal(sql("select checkpoints->'new'->>'cursor' from public.kd_motn_sync"),'cursor-next');
    assert.equal(call('kd_motn_claim',`'${id(3)}'::uuid`).status,'not_due');
    assert.equal(sql('select count(*) from public.kd_motn_offers'),'1');
  });
  sql(`update public.kd_motn_sync set run_mode='sync',lease_token=null,lease_until=null,last_run_at=null,
    bootstrap_completed_at=now(),last_full_sync_at=now()-interval '24 hours',
    checkpoints=jsonb_build_object('new',jsonb_build_object('from',floor(extract(epoch from now()))::bigint-2*86400,'to',floor(extract(epoch from now()))::bigint-86400,'cursor',null,'done',true),
      'removed',jsonb_build_object('from',floor(extract(epoch from now()))::bigint-2*86400,'to',floor(extract(epoch from now()))::bigint-86400,'cursor',null,'done',true));`);
  const beforeProbe=sql('select checkpoints from public.kd_motn_sync');
  check('Daily changes during the 48h cooldown remain pending without changing the import cursor',()=>{
    assert.equal(call('kd_motn_claim',`'${token}'`).mode,'probe');
    assert.equal(call('kd_motn_commit_page',`'${token}','new',null,null,'[]',0`).status,'probe_only');
    assert.equal(call('kd_motn_probe_result',`'${token}',true`).status,'cooldown');
    assert.equal(sql('select checkpoints from public.kd_motn_sync'),beforeProbe);
    assert.equal(sql('select pending_changes from public.kd_motn_sync'),'t');
    assert.equal(call('kd_motn_finish',`'${token}','cooldown'`).ok,true);
    assert.equal(call('kd_motn_claim',`'${token}'`).status,'not_due');
  });
  check('At the exact 48h boundary the pending window is promoted with no gap',()=>{
    sql("update public.kd_motn_sync set last_run_at=now()-interval '1 day'");
    const claimed=call('kd_motn_claim',`'${token}'`);
    assert.equal(claimed.mode,'probe');
    assert.equal(claimed.checkpoints.new.from,JSON.parse(beforeProbe).new.to+1);
    const decision=JSON.parse(session(`update public.kd_motn_sync set last_full_sync_at=now()-interval '48 hours'; select public.kd_motn_probe_result('${token}',true)`));
    assert.equal(decision.status,'sync');
    assert.equal(call('kd_motn_commit_page',`'${token}','new',null,'saved-new','[]',0`).ok,true);
    assert.equal(call('kd_motn_commit_page',`'${token}','removed',null,null,'[]',0`).ok,true);
    assert.equal(call('kd_motn_finish',`'${token}','succeeded'`).ok,false);
    assert.equal(call('kd_motn_finish',`'${token}','limited'`).ok,true);
  });
  check('A partial full sync retains completed kinds and resumes its exact cursor',()=>{
    sql("update public.kd_motn_sync set last_run_at=now()-interval '1 day',last_full_sync_at=now()-interval '1 hour'");
    const resumed=call('kd_motn_claim',`'${token}'`);
    assert.equal(resumed.mode,'sync');assert.equal(resumed.checkpoints.new.cursor,'saved-new');
    assert.equal(resumed.checkpoints.removed.done,true);
    assert.equal(call('kd_motn_commit_page',`'${token}','new','saved-new',null,'[]',0`).ok,true);
    assert.equal(call('kd_motn_finish',`'${token}','succeeded'`).ok,true);
    assert.equal(sql("select not pending_changes and last_full_sync_at>now()-interval '10 seconds' from public.kd_motn_sync"),'t');
  });
  check('Empty daily windows advance independently without restarting the 48h cooldown',()=>{
    sql("update public.kd_motn_sync set last_run_at=now()-interval '1 day'");
    const lastFull=sql('select last_full_sync_at from public.kd_motn_sync');
    call('kd_motn_claim',`'${token}'`);
    assert.equal(call('kd_motn_probe_result',`'${token}',false`).status,'unchanged');
    assert.equal(call('kd_motn_finish',`'${token}','unchanged'`).ok,true);
    assert.equal(sql('select last_full_sync_at from public.kd_motn_sync'),lastFull);
    assert.equal(sql("select checkpoints->'new'->>'done' from public.kd_motn_sync"),'true');
  });
  check('The 900-request rolling guard includes daily checks, and browser roles cannot report checks',()=>{
    sql("update public.kd_motn_sync set last_run_at=now()-interval '1 day'; insert into public.kd_motn_requests(kind,started_at) select 'new',now()-interval '2 days' from generate_series(1,900)");
    call('kd_motn_claim',`'${token}'`);
    assert.equal(call('kd_motn_reserve',`'${token}','new'`).status,'quota_limit');
    assert.match(runFailure('psql',args,sessionSql(`select public.kd_motn_probe_result('${token}',true)`,'authenticated')),/permission denied/);
    assert.match(runFailure('psql',args,sessionSql(`select public.kd_motn_commit_sync_page('${token}','new',null,null,'[]',0)`)),/permission denied/);
  });
  check('The reusable usage ticker counts every kind without starting a request or exposing provider quota as known',()=>{
    const before=sql('select count(*) from public.kd_motn_requests');
    const result=call('kd_motn_usage_status');
    assert.equal(result.format,1);assert.equal(result.source,'kinodreieck-reservations');
    assert.equal(result.sinceSetup.attemptedRequests,Number(before));
    assert.equal(Object.values(result.sinceSetup.byKind).reduce((a,b)=>a+b,0),Number(before));
    assert.equal(result.sinceSetup.byKind.comparison,4);
    assert.equal(result.rolling32Days.remaining,0);assert.equal(result.rolling32Days.limit,900);
    assert.equal(result.planLimit,1000);assert.equal(result.providerQuota,null);
    assert.equal(sql('select count(*) from public.kd_motn_requests'),before);
    assert.match(runFailure('psql',args,sessionSql('select public.kd_motn_usage_status()','authenticated')),/permission denied/);
  });
  console.log(`${checks} MotN PostgreSQL checks passed.`);
} finally {
  if (running) run('pg_ctl',['--pgdata',data,'--wait','stop']);
  rmSync(root,{recursive:true,force:true});
}
