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
  check('The daily 24-call cap cannot be exceeded by repeated reservations',()=>{
    for(let i=0;i<19;i++) assert.equal(call('kd_motn_reserve',`'${token}','removed'`).reserved,true);
    assert.equal(call('kd_motn_reserve',`'${token}','removed'`).reserved,false);
    assert.equal(sql('select count(*) from public.kd_motn_requests'),'24');
  });
  check('An error releases only the lease, retaining the completed page and cursor',()=>{
    assert.equal(call('kd_motn_finish',`'${token}','error'`).ok,true);
    assert.equal(sql("select checkpoints->'new'->>'cursor' from public.kd_motn_sync"),'cursor-next');
    assert.equal(call('kd_motn_claim',`'${id(3)}'::uuid`).status,'not_due');
    assert.equal(sql('select count(*) from public.kd_motn_offers'),'1');
  });
  console.log(`${checks} MotN PostgreSQL checks passed.`);
} finally {
  if (running) run('pg_ctl',['--pgdata',data,'--wait','stop']);
  rmSync(root,{recursive:true,force:true});
}
