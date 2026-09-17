import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import React,{act,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {useStreamingNeuController} from './src/controllers/useStreamingNeuController.js';
import {createStreamingPageController,useStreamingPageController} from './src/controllers/useStreamingPageController.js';
import {normalizeStreamingPageResponse,normalizeStreamingPageRequest} from './src/lib/streamingPage.js';
import {setStorageDriver} from './src/lib/storage.js';
const PG='/Applications/Postgres.app/Contents/Versions/17/bin';
const folder=mkdtempSync(join(tmpdir(),'review49-p07-pg-'));mkdirSync(join(folder,'s'));
const port=String(57000+process.pid%7000);let running=false,root,controller;
function run(bin,args,input){const r=spawnSync(join(PG,bin),args,{input,encoding:'utf8',timeout:30000,maxBuffer:10_000_000,env:{PATH:`${PG}:/usr/bin:/bin`,LANG:'C',LC_ALL:'C'}});assert.equal(r.status,0,`${bin}: ${r.stderr||r.error}`);return r.stdout.trim();}
const sql=q=>run('psql',['-h',join(folder,'s'),'-p',port,'-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-f','-'],q);
const j=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const iso=t=>new Date(t).toISOString();const DAY=86400000;const realNow=Date.now;const t0=realNow()-15*DAY;
const day=n=>t0+(n-1)*DAY;let clock=day(4),hook,checks=0,reads=0,fallbacks=0;
const services=['Netflix'];let owner='account:p07-a';const storage=new Map(),writes=[];
const driver=()=>({name:'review49-local',owner,async get(key){return storage.has(key)?{value:storage.get(key)}:null},async set(key,value){writes.push(key);storage.set(key,value);return {key,value}}});
const dom=new JSDOM('<div id="root"></div>',{url:'http://fixture.local/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
globalThis.fetch=()=>{throw new Error('No network permitted')};
const tick=()=>new Promise(r=>setTimeout(r,0));
let hookProps={kontextKey:owner,auswahl:services,auswahlGeladen:true};
function Probe(){hook=useStreamingNeuController(hookProps);return null;}
let integrated, integratedReads=0;
const integrationService={loadPage:async request=>{integratedReads++;return rpc(request)}};
function IntegratedProbe(){
 const neu=useStreamingNeuController(hookProps);
 const page=useStreamingPageController({tab:'streaming',enabled:neu.streamingPagePersonalReady,
  accountKey:owner,services,library:[],personal:neu.streamingPagePersonal,
  onPageAccepted:neu.uebernehmeSeitenAnker,service:integrationService});
 useEffect(()=>{if(neu.streamingPagePersonalReady)page.onStreamingPageQuery({view:'new'})},[neu.streamingPagePersonalReady,page.onStreamingPageQuery]);
 integrated={neu,page};return null;
}

async function render(){await act(async()=>{root.render(React.createElement(Probe));await tick()});}
const title=(pruned=false,newAccess=false)=>({watchmode_id:777,titel:'Wiederkehrend',jahr:2020,typ:'movie',dienste:services,dienst_diffs:newAccess?[{dienst:'Netflix',vorher:false,nachher:true,erkannt_am:iso(day(16))}]:[
 ...(!pruned?[{dienst:'Netflix',vorher:false,nachher:true,erkannt_am:iso(day(1))},{dienst:'Netflix',vorher:true,nachher:false,erkannt_am:iso(day(2))}]:[]),
 {dienst:'Netflix',vorher:false,nachher:true,erkannt_am:iso(day(4))}]});
function saveCatalog(pruned=false,newAccess=false,expires=null){const meta={stand:iso(clock),katalog_stand:iso(clock),stand_pro_quelle:{Netflix:iso(clock)},vergleich_stand_pro_quelle:{Netflix:iso(clock)}};sql(`insert into public.kd_catalog values
 ('streaming_bekannt',${j({...meta,titel:[]})},now(),'fixture','${iso(clock)}',${expires?`'${iso(expires)}'`:'null'}),
 ('streaming_entdecken',${j({...meta,titel:[title(pruned,newAccess)]})},now(),'fixture','${iso(clock)}',${expires?`'${iso(expires)}'`:'null'})
 on conflict(name) do update set payload=excluded.payload,stand=excluded.stand,updated_at=excluded.updated_at,gueltig_bis=excluded.gueltig_bis;`);}
function rpc(req){const rows=sql(`begin;set local role authenticated;
 select set_config('request.jwt.claim.role','authenticated',true);
 select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 select set_config('fixture.now','${iso(clock)}',true);
 select public.kd_streaming_page(${j(req)});rollback;`).split('\n');return normalizeStreamingPageResponse(JSON.parse(rows.at(-1)));}
function startController(){controller=createStreamingPageController({now:()=>clock,setTimer:()=>1,clearTimer:()=>{},onPageAccepted:(p,c)=>hook.uebernehmeSeitenAnker(p,c),legacyFallback:()=>{fallbacks++},service:{loadPage:async r=>{reads++;return rpc(r)}}});controller.setContext({enabled:hook.streamingPagePersonalReady,accountKey:owner,services,library:[],personal:hook.streamingPagePersonal});controller.setActive(true);controller.query({view:'new'});}
function check(label,fn){fn();checks++;console.log('✓ '+label)}
try{
 run('initdb',['--no-locale','--encoding=UTF8','--auth=trust','--username=postgres','--set','shared_memory_type=mmap','--pgdata',join(folder,'data')]);
 run('pg_ctl',['--pgdata',join(folder,'data'),'--log',join(folder,'pg.log'),'--options',`-c listen_addresses= -c unix_socket_directories=${join(folder,'s')} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,'--wait','start']);running=true;
 sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.kd_account_active() returns boolean language sql stable as $$select true$$;
 create table public.kd_catalog(name text primary key,payload jsonb,updated_at timestamptz,quelle text,stand timestamptz,gueltig_bis timestamptz);
 create table public.kd_motn_offers(show_id text not null,service_id text not null,country text not null default 'AT',available boolean not null,event_at timestamptz not null,added_at timestamptz,checked_at timestamptz not null,watchmode_seen_at timestamptz,link text,show_data jsonb not null,primary key(show_id,service_id));`);
 for(const file of ['20260913200000_streaming_pages_backend.sql','20260914100000_streaming_pages_latency.sql','20260917120000_review_streaming_freshness_anchors.sql'])sql(readFileSync(new URL(`./supabase/migrations/${file}`,import.meta.url),'utf8'));
 // Install the actual migration twice to prove replacement safety, before time control.
 const migration=readFileSync(new URL('./supabase/migrations/20260917120000_review_streaming_freshness_anchors.sql',import.meta.url),'utf8');sql(migration);
 check('fresh PG17: additive migration and unchanged ACL',()=>{
  assert.equal(sql("select has_function_privilege('anon','public.kd_streaming_page(jsonb)','execute')"),'f');
  assert.equal(sql("select has_function_privilege('authenticated','public.kd_streaming_page(jsonb)','execute')"),'t');
  assert.equal(sql("select has_function_privilege('authenticated','public.kd_streaming_page_new_state(jsonb,text[],jsonb,jsonb,timestamptz,timestamptz,timestamptz,boolean,timestamptz)','execute')"),'f');
 });
 // Only the SQL clock expression is injected in this synthetic cluster. All query,
 // source replacement, window, count and response logic remains production code.
 assert.equal(migration.split('v_now timestamptz:=statement_timestamp();').length,2);
 sql(migration.replace('v_now timestamptz:=statement_timestamp();',"v_now timestamptz:=coalesce(nullif(current_setting('fixture.now',true),'')::timestamptz,statement_timestamp());"));
 Date.now=()=>clock;setStorageDriver(driver());root=createRoot(document.getElementById('root'));await render();
 saveCatalog();await act(async()=>{startController();await tick();await tick()});
 const saved=hook.streamingPagePersonal.newEntries;
 check('day4 actual full RPC/controller/hook persist day1 start and day4 consumption',()=>{
  assert.equal(controller.getSnapshot().total,1);assert.equal(Date.parse(controller.getSnapshot().items[0].neu_seit),day(1));
  assert.deepEqual(saved,[{id:'777',fensterBeginn:day(1),verbrauchtBis:day(4)}]);assert.equal(writes.length,1);assert.equal(fallbacks,0);
 });
 await act(async()=>{controller.destroy();await tick();root.unmount()});
 clock=day(16);saveCatalog(true);root=createRoot(document.getElementById('root'));await render();
 await act(async()=>{startController();await tick()});
 check('day16 pruned catalog + device reload: no new card or count, no full fallback',()=>{
  assert.deepEqual(hook.streamingPagePersonal.newEntries,saved);assert.equal(controller.getSnapshot().total,0);assert.equal(controller.getSnapshot().counts.new,0);assert.deepEqual(controller.getSnapshot().items,[]);assert.equal(writes.length,1);assert.equal(fallbacks,0);
  const unanchored=rpc(normalizeStreamingPageRequest({services,view:'new'}));assert.equal(unanchored.total,1,'sensitivity control: pruned data really requires saved anchors');
 });
 saveCatalog(true,true);await act(async()=>{controller.setContext({enabled:true,accountKey:owner,services,library:[],personal:hook.streamingPagePersonal,revision:'fresh'});await tick();await tick()});
 check('genuine access after window expiry starts day16 and repeats never extend it',()=>{
  assert.equal(controller.getSnapshot().counts.new,1);assert.equal(hook.streamingPagePersonal.newEntries[0].fensterBeginn,day(16));
 });
 const count=writes.length;
 await act(async()=>{controller.setContext({enabled:true,accountKey:owner,services,library:[],personal:hook.streamingPagePersonal,revision:'again'});await tick();await tick()});
 assert.equal(writes.length,count);
 await act(async()=>{controller.destroy();hookProps={...hookProps,auswahl:['Disney+']};root.render(React.createElement(Probe));await tick()});
 check('service-selection and obsolete response guards reject foreign anchors',()=>{
  assert.deepEqual(hook.streamingPagePersonal.newEntries,[]);
  assert.equal(hook.uebernehmeSeitenAnker({status:'ready',version:'late',newAnchors:saved},{accountKey:owner,services,isCurrent:()=>true}),false);
  assert.equal(hook.uebernehmeSeitenAnker({status:'ready',version:'late',newAnchors:saved},{accountKey:owner,services:['Disney+'],isCurrent:()=>false}),false);
 });
 await act(async()=>{owner='account:p07-b';setStorageDriver(driver());hookProps={kontextKey:owner,auswahl:services,auswahlGeladen:true};root.render(React.createElement(Probe));await tick()});
 check('account switch and storage owner restore no foreign book',()=>{
  assert.deepEqual(hook.streamingPagePersonal.newEntries,[]);
  assert.equal(hook.uebernehmeSeitenAnker({status:'ready',version:'late',newAnchors:saved},{accountKey:'account:p07-a',services,isCurrent:()=>false}),false);
 });
 await act(async()=>root.unmount());
 clock=day(4);saveCatalog();owner='account:p07-integrated';setStorageDriver(driver());
 hookProps={kontextKey:owner,auswahl:services,auswahlGeladen:true};root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(IntegratedProbe));await tick();await tick()});
 for(let i=0;i<6;i++)await act(async()=>{await tick()});
 check('actual React hooks close the anchor feedback loop after one bounded requery',()=>{
  assert.deepEqual(integrated.neu.streamingPagePersonal.newEntries,saved);
  assert.equal(integrated.page.streamingPage.total,1);assert.equal(integrated.page.streamingPage.status,'ready');
  assert.equal(integratedReads,2);
 });
 await act(async()=>root.unmount());root=null;
 // Restore byte-exact migration for RPC expiry evidence at actual database time.
 sql(migration);clock=realNow();saveCatalog(true,false,clock-1000);
 check('RPC retains expired source deadline independently from Neu expiry and null',()=>{
  const expired=rpc(normalizeStreamingPageRequest({services,view:'all'}));assert.equal(Date.parse(expired.sourceExpiresAt),clock-1000);
  assert.notEqual(expired.sourceExpiresAt,expired.nextExpiryAt);
  const again=rpc(normalizeStreamingPageRequest({services,view:'all'}));assert.equal(again.version,expired.version);assert.equal(again.sourceExpiresAt,expired.sourceExpiresAt);
  saveCatalog(true,false,null);assert.equal(rpc(normalizeStreamingPageRequest({services,view:'all'})).sourceExpiresAt,null);
 });
 console.log(`${checks}/${checks} P07 PostgreSQL/React integration checks passed; ${reads} page reads, ${fallbacks} full fallbacks`);
}finally{controller?.destroy();if(root)await act(async()=>root.unmount());Date.now=realNow;dom.window.close();if(running)run('pg_ctl',['--pgdata',join(folder,'data'),'--mode','immediate','--wait','stop']);rmSync(folder,{recursive:true,force:true});}
