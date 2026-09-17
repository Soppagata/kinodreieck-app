// R-RADAR: exact baseline/current clients and handlers, real SQL, synthetic local data.
import {randomUUID} from 'node:crypto';
globalThis.fetch=async()=>{throw new Error('Unexpected network');};
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalTextRadarTargetId } from './src/lib/localEventRadar.js';
import { evaluateTextRadarWebsearchResponse } from './supabase/functions/radar-websearch-task/contract.js';
import { parseAnthropicRadarWebsearchResponse } from './supabase/functions/radar-websearch-task/anthropicAdapter.js';
const SOURCE=process.cwd();
const configuredPgBin=process.env.KD_TEST_PG_BIN?.trim();
const pgConfig=spawnSync('pg_config',['--bindir'],{encoding:'utf8',timeout:10000});
const pgCandidates=(configuredPgBin?[configuredPgBin]:[
  pgConfig.status===0?pgConfig.stdout.trim():null,
  '/Applications/Postgres.app/Contents/Versions/17/bin',
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/16/bin',
]).filter(Boolean);
const requiredPgBinaries=['initdb','pg_ctl','postgres','psql'];
const selectedPg=[...new Set(pgCandidates)].map(directory=>{
  const versions=requiredPgBinaries.map(binary=>{
    const result=spawnSync(join(directory,binary),['--version'],{encoding:'utf8',timeout:10000});
    return result.status===0?result.stdout.match(/\(PostgreSQL\) ((16|17)\.\d+)\b/):null;
  });
  return versions.every(version=>version&&version[2]===versions[0]?.[2])
    ?{directory,version:versions[0][1]}:null;
}).find(Boolean);
assert.ok(selectedPg,`PostgreSQL 16 or 17 server binaries required (${requiredPgBinaries.join(', ')}); set KD_TEST_PG_BIN to a compatible bin directory. Tried: ${pgCandidates.join(', ')}`);
const PG=selectedPg.directory;
console.log(`PostgreSQL ${selectedPg.version}: ${PG}`);
const root=mkdtempSync(join(tmpdir(),'review49-rollout-p05-pg-'));
const data=join(root,'data'), socket=join(root,'socket'); mkdirSync(socket);
let running=false;
function run(bin,args,input) {
  const r=spawnSync(join(PG,bin),args,{input,encoding:'utf8',timeout:60000,maxBuffer:8000000,env:{PATH:`${PG}:/usr/bin:/bin`,LANG:'C',LC_ALL:'C'}});
  if(r.status!==0) throw new Error(`${bin}: ${r.stderr || r.error}`);
  return r.stdout.trim();
}
function sql(q){return run('psql',['-h',socket,'-p','65455','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-f','-'],q);}
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
const account='e0800000-0000-4000-8000-000000000002';
const targetText='Synthetische Validator Filmreihe';
const targetId=createLocalTextRadarTargetId(targetText);
const session=(q,role='service_role')=>sql(`begin; set local role ${role}; select set_config('request.jwt.claim.sub','${account}',true); select set_config('request.jwt.claim.role','${role}',true); ${q}; commit;`).split('\n').at(-1);
const feed=()=>JSON.parse(session("select public.kd_radar_pilot_feed_search_access('{}'::uuid[],true)",'authenticated'));
const checkedAt=new Date().toISOString();
const eventDate=new Date(Date.now()+86400000*7).toISOString().slice(0,10);
const setup={radarEnabled:true,radarProviderEnabled:true,radarSchedulerEnabled:false,providerAllowed:true,modelAlias:'klein',model:'claude-haiku-4-5',maxTokens:2400,taskCapUsdCent:20,searchFeeUsdCent:1,globalRequestCapUsdCent:500,timeoutMs:30000,inputPriceUsdCentPerMtok:100,outputPriceUsdCentPerMtok:500,sourceRegistry:[]};
const candidates=['Platform A','Platform B'].map((platform,i)=>({title:'Synthetischer Film',targetType:'work',category:'film',eventType:'streamingstart_at',eventDate,region:'AT',platform,evidence:[{url:`https://press.example/platform-${i}`,sourceDomain:'press.example',sourceTitle:`Start auf ${platform}`,claim:`Synthetischer Film startet am ${eventDate} in AT auf ${platform}.`}]}));
function providerBody(items){
  return {model:setup.model,stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:100,server_tool_use:{web_search_requests:1}},content:[{type:'server_tool_use',id:'mock-tool-1',name:'web_search',input:{}},{type:'web_search_tool_result',tool_use_id:'mock-tool-1',content:items.map(c=>({type:'web_search_result',url:c.evidence[0].url}))},{type:'text',text:JSON.stringify({status:'confirmed',candidates:items})}]};
}
function envelope(request,items){return parseAnthropicRadarWebsearchResponse(providerBody(items),request,setup,checkedAt).envelope;}

const { build } = await import('esbuild');
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const exportsSource = `
export * as local from './src/lib/localEventRadar.js';
export {RadarView} from './src/tabs/EntdeckenTab.jsx';
export {validateRadarPilotFeed,projectEntdeckenRadarPilot} from './src/lib/radarPilotContracts.js';
export {createRadarPilotService} from './src/services/radarPilot.js';
export {createRadarWebsearchService} from './src/services/radarWebsearch.js';
export {createAnthropicRadarWebsearchAdapter} from './supabase/functions/radar-websearch-task/anthropicAdapter.js';
export {createRadarWebsearchHandler} from './supabase/functions/radar-websearch-task/index.ts';
export {createTextRadarReleaseId} from './supabase/functions/radar-websearch-task/contract.js';
export {useEntdeckenRadarController} from './src/controllers/useEntdeckenRadarController.js';
export {setStorageDriver,captureStorageContext} from './src/lib/storage.js';
export {projectRadarNews} from './src/lib/radarNews.js';
`;
async function generation(old) {
  const bundle=await build({stdin:{contents:exportsSource,resolveDir:SOURCE},bundle:true,write:false,
    format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},external:['react','react-dom','react/jsx-runtime'],define:{'import.meta.main':'false'},logLevel:'silent',plugins:[
    {name:'mock-supabase',setup(b){b.onResolve({filter:/^npm:@supabase/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClient = (...args) => globalThis.__mockClient(...args);'}));}},
    {name:'exact-generation',setup(b){b.onLoad({filter:/\.(js|jsx|ts)$/},({path})=>{
      if(!path.startsWith(SOURCE+'/')||path.includes('/node_modules/'))return;
      if(!old)return path.endsWith('/src/tabs/EntdeckenTab.jsx')?{contents:readFileSync(path,'utf8')+'\nexport {RadarView};',loader:'jsx'}:undefined;
      const r=spawnSync('git',['show','14804ce389d69114feed27b92fb11ac78423cc0e:'+path.slice(SOURCE.length+1)],{encoding:'utf8'});
      assert.equal(r.status,0,r.stderr);return {contents:r.stdout+(path.endsWith('/src/tabs/EntdeckenTab.jsx')?'\nexport {RadarView};':''),loader:path.endsWith('.tsx')?'tsx':path.endsWith('.ts')?'ts':path.endsWith('.jsx')?'jsx':'js'};
    });}}]});
  const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);return module.exports;
}
const oldClient=await generation(true),newClient=await generation(false);
const sessionSnapshot={mode:'account',state:'ready',account:{id:account}};
const config={supabaseUrl:'https://mock.invalid',supabasePublishableKey:'mock',radarPilotClientEnabled:true};
const rpcFetch=async(url,options)=>{
  const name=url.split('/').at(-1),p=JSON.parse(options.body);
  let query;
  if(name==='kd_radar_pilot_feed_search_access')query=`select public.${name}(array[${p.p_operation_ids.map(quote).join(',')}]::uuid[],true)`;
  else if(name==='kd_radar_pilot_set_text_subscription')query=`select public.${name}(${quote(p.p_target_text)},${quote(p.p_status)},${quote(p.p_operation_id)})`;
  else throw new Error(name);
  return new Response(session(query,'authenticated'));
};
const makePilot=gen=>gen.createRadarPilotService({config,auth:{getSnapshot:()=>sessionSnapshot},getAccount:()=>sessionSnapshot.account,getAccessToken:async()=>'mock',isTokenCurrent:()=>true,captureContext:()=>({owner:`account:${account}`,isCurrent:()=>true,set:async()=>{}}),fetchImpl:rpcFetch});
const makeSearch=(gen,fetchImpl)=>gen.createRadarWebsearchService({config,auth:{getSnapshot:()=>sessionSnapshot},getAccount:()=>sessionSnapshot.account,getAccessToken:async()=>'mock',singleFile:false,fetchImpl});
let failures=false;
globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://mock.invalid',SUPABASE_ANON_KEY:'mock',SUPABASE_SERVICE_ROLE_KEY:'mock-service'})[key]}};
let providerRequests=0;
try {
  run('initdb',['--no-locale','--encoding=UTF8','--auth=trust','--username=postgres','--pgdata',data]);
  run('pg_ctl',['--pgdata',data,'--log',join(root,'postgres.log'),'--options',`-c listen_addresses= -c unix_socket_directories=${socket} -p 65455 -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,'--wait','start']);running=true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth,extensions to anon,authenticated,service_role;`);
  sql(readFileSync(join(SOURCE,'supabase/current_schema.sql'),'utf8'));
  sql(`insert into public.kd_ai_limits(schluessel,wert) values ('ai_aktiv','true'),('monatsbudget_usd_cent','1500'),('tageslimit_auftraege','30'),('parallel_max','2'),('timeout_ms','30000'),('anbieter_request_max_usd_cent','500'),('task_modell','{}'),('task_max_tokens','{}'),('task_max_reservierung_usd_cent','{}');`);
  // Same isolated migration bootstrap selection as the source PG17 test; no test suite invoked.
  const migrations=readdirSync(join(SOURCE,'supabase/migrations')).filter(f=>f.endsWith('.sql')&&f>='20260809180000'&&f<'20260917000000'&&/radar|event_radar|private_pilot|private_export|automatic_ai_retry/.test(f)).sort();
  for(const file of migrations){
    if(file.startsWith('20260825120000'))sql('update public.kd_radar_settings set radar_aktiv=true,radar_provider_aktiv=true');
    try{sql(readFileSync(join(SOURCE,'supabase/migrations',file),'utf8'));}catch(e){throw new Error(`${file}: ${e.message}`);}
  }
  sql(`insert into auth.users(id) values ('${account}'); insert into public.kd_account_access(account_id,role,active,personal_ai) values ('${account}','member',true,true); insert into public.kd_radar_capabilities(account_id,radar_pilot,radar_review) values ('${account}',true,false);`);
  session(`select public.kd_radar_pilot_set_text_subscription(${quote(targetText)},'active',gen_random_uuid())`,'authenticated');
  const request=JSON.parse(session(`select public.kd_radar_websearch_prepare_text('${account}',${quote(targetId)},${quote(targetText)},gen_random_uuid())`));
  const payloadFor=(event,textContext={targetId,targetText,checkedAt})=>({targetKey:event.targetId||event.targetKey,
    textTargetKey:textContext.targetId,targetText:textContext.targetText,workTitle:event.title,workTargetType:event.targetType,
    category:event.category,eventType:event.eventType,date:event.date,region:event.region,platform:event.platform,
    seasonNumber:event.seasonNumber,checkedAt:textContext.checkedAt,evidence:event.evidence});
  const persist=(payload)=>JSON.parse(session(`select public.kd_radar_websearch_upsert_text_finding('${account}',gen_random_uuid(),${quote(JSON.stringify(payload))}::jsonb)`));

  globalThis.__mockClient=()=>({auth:{async getClaims(){return {data:{claims:{sub:account,role:'authenticated'}}};}},async rpc(name,p){
    try {
      if(name==='kd_radar_initial_claim')return {data:{claim:true,status:'claimed',accountId:account,targetId,targetText,targetType:'text',targetRowId:'c1000000-0000-4000-8000-000000000001',viennaDay:checkedAt.slice(0,10),fenceToken:'c1000000-0000-4000-8000-000000000002'}};
      if(name==='kd_radar_daily_assert_lease'||name==='kd_radar_daily_finish')return {data:{ok:true}};
      if(name==='kd_radar_websearch_prepare_text')return {data:request};
      if(name==='kd_radar_pilot_feed')return {data:JSON.parse(session("select public.kd_radar_pilot_feed('{}'::uuid[])",'authenticated'))};
      if(name==='kd_radar_websearch_upsert_text_finding'){
        if(failures&&p.p_payload.platform==='Platform B')throw new Error('synthetic storage failure');
        return {data:persist(p.p_payload)};
      }
      throw new Error(name);
    }catch(error){return {error};}
  }});
  let actualAdapter;
  const adapter={search:async req=>{
    actualAdapter=newClient.createAnthropicRadarWebsearchAdapter({apiKey:'mock-key',loadSetup:async()=>setup,
      now:()=>checkedAt,reserveCost:async()=>({ok:true,logId:1}),settleCost:async()=>{},
      fetchImpl:async()=>{providerRequests++;return new Response(JSON.stringify(providerBody(candidates)));}});
    return actualAdapter.search(req);
  },telemetry:()=>actualAdapter.telemetry()};
  const handlers=[oldClient.createRadarWebsearchHandler({adapter}),newClient.createRadarWebsearchHandler({adapter})];
  const oldKey=oldClient.createTextRadarReleaseId(candidates[0]);
  const evaluated=evaluateTextRadarWebsearchResponse(envelope(request,candidates),request,[]);
  const payload=payloadFor(evaluated.textResult.candidates[0]);
  const beforeAck=persist({...payload,targetKey:oldKey});
  const before=JSON.parse(sql('select row_to_json(f) from public.kd_radar_text_findings f'));
  for(const gen of [oldClient,newClient])assert.equal((await makePilot(gen).sync({state:gen.local.createEmptyLocalRadar({authority:'account-cache'})})).status,'ready');
  // The real filename order installs the compatible read boundary before v2.
  const rolloutMigrations=readdirSync(join(SOURCE,'supabase/migrations')).filter(f=>f.startsWith('20260917')&&f.includes('_review_radar_')).sort();
  assert.equal(rolloutMigrations[0],'20260917095000_review_radar_client_compat.sql');
  assert.equal(rolloutMigrations[1],'20260917100000_review_radar_text_identity.sql');
  for(const file of rolloutMigrations){
    sql(readFileSync(join(SOURCE,'supabase/migrations',file),'utf8'));
    assert.equal(oldClient.validateRadarPilotFeed(feed()).ok,true);
    if(file===rolloutMigrations[0])assert.deepEqual(JSON.parse(sql('select row_to_json(f) from public.kd_radar_text_findings f')),before);
  }
  const feedDefinition=sql("select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[])'::regprocedure)");
  const rowsBeforeReplay=sql('select row_to_json(f) from public.kd_radar_text_findings f');
  sql(readFileSync(join(SOURCE,'supabase/migrations',rolloutMigrations[0]),'utf8'));
  assert.equal(sql("select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[])'::regprocedure)"),feedDefinition);
  assert.equal(sql('select row_to_json(f) from public.kd_radar_text_findings f'),rowsBeforeReplay);
  const migrated=JSON.parse(sql('select row_to_json(f) from public.kd_radar_text_findings f'));
  assert.deepEqual({...migrated,release_key:before.release_key},before);
  assert.equal(migrated.release_key,evaluated.textResult.candidates[0].targetId);
  for(const key of [oldKey,migrated.release_key])assert.deepEqual(persist({...payload,targetKey:key}),{...beforeAck,status:'no_change'});
  for(const title of ['Ärger & Ω',' SPACE   Fold ','A|B'])for(const platform of ['Platform A','Platform B','-','Ö+']){
    const c={...candidates[0],title,platform};
    assert.equal(sql(`select public.kd_radar_text_wire_v1_key(${quote(title)},${quote(eventDate)},'streamingstart_at','work',null)`),oldClient.createTextRadarReleaseId(c));
  }
  console.log('PASS migrated v1 row retains UUIDs, metadata and exact legacy work-start hash; old/new replay is no_change');
  // Actual old/new HTTP writers against migrated SQL; actual old/new readers.
  for(const [writer,handler] of handlers.entries())for(const [reader,gen] of [oldClient,newClient].entries()){
    let body;
    const response=await makeSearch(gen,async(url,options)=>{const r=await handler(new Request(url,options));body=await r.clone().json();return r;}).checkNow(targetId,targetText);
    assert.ok(['confirmed','no_change'].includes(response.status),JSON.stringify({writer,reader,response,body}));
    assert.equal(body.feed.events.length,2);assert.equal(gen.validateRadarPilotFeed(body.feed).ok,true);
    assert.equal(new Set(body.feed.events.map(e=>e.targetId)).size,1);
    assert.equal(body.feed.events[0].targetId,oldKey);
    assert.equal(new Set(body.feed.events.map(e=>e.eventId)).size,2);
    assert.equal(new Set(body.feed.events.map(e=>e.eventVersionId)).size,2);
    assert.equal(new Set(body.textResult.candidates.map(e=>e.targetId)).size,1);
    const state=await makePilot(gen).sync({state:gen.local.createEmptyLocalRadar({authority:'account-cache'})});
    assert.equal(state.status,'ready');assert.equal(state.state.pilot.events.length,2);
    const projected=gen.projectEntdeckenRadarPilot({clientEnabled:true,radarAuthority:'account-cache',radarState:state.state});
    const cards=gen.projectRadarNews(projected.events,checkedAt.slice(0,10));
    assert.equal(cards.length,2);assert.deepEqual(cards.map(e=>e.platform).sort(),['Platform A','Platform B']);
    assert.deepEqual(cards.map(e=>e.evidence[0].url).sort(),candidates.map(e=>e.evidence[0].url).sort());
    console.log(`PASS HTTP writer ${writer===0?'old':'new'} -> SQL v2 -> reader ${reader===0?'old':'new'} -> actual UI projection: two cards and sources`);
  }
  candidates.reverse();
  const ids=feed().events.map(e=>[e.eventId,e.eventVersionId]);
  const replay=await makeSearch(newClient,(url,options)=>handlers[1](new Request(url,options))).checkNow(targetId,targetText);
  assert.equal(replay.status,'no_change');assert.equal(replay.writes,0);assert.deepEqual(feed().events.map(e=>[e.eventId,e.eventVersionId]),ids);
  candidates.reverse();
  assert.equal(sql('select count(distinct release_key) from public.kd_radar_text_findings'),'2');
  // Storage partial keeps honest writes + provider receipt; old strict client
  // gets its supported failure status and can reread the persisted sibling.
  sql('delete from public.kd_radar_text_findings');failures=true;
  for(const [i,gen] of [oldClient,newClient].entries()){
    sql('delete from public.kd_radar_text_findings');let wire;
    const r=await makeSearch(gen,async(url,options)=>{const resp=await handlers[1](new Request(url,options));wire=await resp.clone().json();return resp;}).checkNow(targetId,targetText);
    assert.equal(r.status,i===0?'storage_error':'confirmed');assert.equal(r.writes,1);
    assert.equal(wire.writes,1);assert.equal(wire.feed.events.length,1);
    assert.equal(wire.providerReceipt.resultMode,'structured');assert.equal(wire.providerReceipt.server.providerRequests,1);
    assert.equal(wire.responseMode,i===0?undefined:'partial');
    assert.equal(Object.hasOwn(wire,'persistence'),i===1);
    assert.equal((await makePilot(gen).sync({state:gen.local.createEmptyLocalRadar({authority:'account-cache'})})).state.pilot.events.length,1);
    console.log(`PASS ${i===0?'old':'new'} partial-storage reader: truthful 1 write and rereadable sibling`);
  }
  failures=false;
  await makeSearch(newClient,(url,options)=>handlers[1](new Request(url,options))).checkNow(targetId,targetText);

  // Mount the unchanged baseline controller after real SQL lifecycle changes.
  // The initial-search followup must install the persisted feed even when the
  // legacy result can only express storage_error for a partial write.
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM('<html><body><div id="app"></div></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
  for(const name of ['window','document','navigator','localStorage','HTMLElement','Node'])
    Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const {act,createElement:h}=require('react'),{createRoot}=require('react-dom/client');
  for(const [generation,gen] of [oldClient,newClient].entries())for(const partial of [false,true]){
    session(`select public.kd_radar_pilot_set_text_subscription(${quote(targetText)},'removed',gen_random_uuid())`,'authenticated');
    failures=partial;localStorage.clear();let controller;
    gen.setStorageDriver({name:'rollout-controller',owner:`account:${account}`,
      get:async key=>{const value=localStorage.getItem(key);return value===null?null:{key,value};},
      set:async(key,value)=>{localStorage.setItem(key,value);return {key,value};}});
    const pilot=gen.createRadarPilotService({config,auth:{getSnapshot:()=>sessionSnapshot},getAccount:()=>sessionSnapshot.account,getAccessToken:async()=>'mock',isTokenCurrent:()=>true,captureContext:gen.captureStorageContext,fetchImpl:rpcFetch});
    const search=makeSearch(gen,(url,options)=>handlers[1](new Request(url,options)));
    const setErr=message=>{throw new Error(message);};
    function Harness(){controller=gen.useEntdeckenRadarController({session:sessionSnapshot,remoteKontoAktiv:true,bootDone:true,master:[],setErr,radarPilotEnabled:true,radarPilotAdapter:pilot,radarWebsearchAdapter:search});return h(gen.RadarView,{radarState:controller.sichtbarerRadarState,accountMode:true,master:[],streamingKnown:[],streamingDiscover:[],radarPilotEvents:controller.radarPilotEvents,syncStatus:controller.radarPilotSyncStatus});}
    const root=createRoot(document.querySelector('#app'));
    try {
      await act(async()=>{root.render(h(Harness));await new Promise(r=>setTimeout(r,0));});
      let result;await act(async()=>{result=await controller.fuegeRadarTextHinzu(targetText);});
      assert.equal(result.status,generation===0&&partial?'storage_error':'confirmed');
      assert.equal(result.saved,true);assert.equal(controller.radarPilotEvents.length,partial?1:2);
      assert.equal(document.querySelectorAll('.kd-radar-neuigkeit').length,partial?1:2);
      for(const platform of partial?['Platform A']:['Platform A','Platform B'])assert.ok([...document.querySelectorAll('.kd-radar-neuigkeit-meta')].some(e=>e.textContent.includes(platform)));
      assert.equal(new Set(controller.radarPilotEvents.map(e=>e.eventVersionId)).size,partial?1:2);
      console.log(`PASS mounted ${generation===0?'baseline':'current'} initial-search followup ${partial?'partial':'full'}: persisted cards visible`);
    } finally {await act(async()=>root.unmount());}
  }
  dom.window.close();failures=false;
  await makeSearch(newClient,(url,options)=>handlers[1](new Request(url,options))).checkNow(targetId,targetText);
  // Existing text receipts are unsupported, before and after this change; do
  // not silently turn a text release into a structured review/import target.
  const textEvent=feed().events[0];
  assert.throws(()=>session(`select public.kd_radar_pilot_set_receipt('${textEvent.eventVersionId}','seen')`,'authenticated'),/radar_event_not_subscribed/);
  for(const gen of [oldClient,newClient]){
    const pilot=makePilot(gen);let synced=await pilot.sync({state:gen.local.createEmptyLocalRadar({authority:'account-cache'})});
    for(const action of ['pause','upsert','remove']){
      const queued=gen.local.queueAccountTextRadarChange(synced.state,{operationId:randomUUID(),action,targetText});assert.equal(queued.ok,true);
      synced=await pilot.sync({state:queued.state});assert.equal(synced.status,'ready');
      // Old service applies subscription ack first; normal next read clears its
      // cached events. The real server read hides paused/removed events at once.
      assert.equal(feed().events.length,action==='upsert'?2:0);
      synced=await pilot.sync({state:synced.state});assert.equal(synced.status,'ready');
      assert.equal(synced.state.pilot.events.length,action==='upsert'?2:0);
    }
    assert.equal(sql('select count(*) from public.kd_radar_text_findings'),'0');
    session(`select public.kd_radar_pilot_set_text_subscription(${quote(targetText)},'active',gen_random_uuid())`,'authenticated');
    await makeSearch(newClient,(url,options)=>handlers[1](new Request(url,options))).checkNow(targetId,targetText);
  }
  console.log('PASS actual old/new lifecycle queue + RPC + reload: pause/resume/remove; unsupported text receipt remains forbidden');

  sql(`update public.kd_radar_capabilities set radar_review=true where account_id='${account}';
    insert into public.kd_radar_targets(target_key,target_type,canonical_title) values('imdb:tt1234567','work','Structured review control');
    insert into public.kd_radar_sources(source_id,domain,publisher_family,source_class,rights_status,attribution_approved,active)
    values('rollout-a','a.example','family-a','official','approved',true,true),('rollout-b','b.example','family-b','editorial','approved',true,true);`);
  session("select public.kd_radar_pilot_set_subscription('imdb:tt1234567','all','active',gen_random_uuid())",'authenticated');
  const importPayload={targetKey:'imdb:tt1234567',eventType:'kinostart_at',date:eventDate,region:'AT',platform:'-',evidence:['a','b'].map(x=>({sourceId:`rollout-${x}`,url:`https://${x}.example/start`,retrievedAt:checkedAt}))};
  const operation=randomUUID();
  const importQuery=`select public.kd_radar_pilot_import_event('${operation}',${quote(JSON.stringify(importPayload))}::jsonb)`;
  const imported=JSON.parse(session(importQuery,'authenticated'));
  assert.deepEqual(JSON.parse(session(importQuery,'authenticated')),imported);
  assert.equal(sql(`select count(*) from public.kd_radar_reviews where event_version_id='${imported.eventVersionId}'`),'1');
  session(`select public.kd_radar_pilot_set_receipt('${imported.eventVersionId}','seen')`,'authenticated');
  for(const gen of [oldClient,newClient]){
    const synced=await makePilot(gen).sync({state:gen.local.createEmptyLocalRadar({authority:'account-cache'})});
    assert.equal(synced.status,'ready');
    assert.equal(synced.state.pilot.events.find(e=>e.eventVersionId===imported.eventVersionId)?.targetId,'imdb:tt1234567');
    assert.equal(synced.state.receipts.find(e=>e.versionId===imported.eventVersionId)?.status,'seen');
  }
  console.log('PASS structured Review/import, operation replay and UUID receipt through both clients remain unchanged');
  assert.equal(sql("select has_function_privilege('anon','public.kd_radar_pilot_feed(uuid[])','execute')"),'f');
  assert.equal(sql("select has_function_privilege('authenticated','public.kd_radar_text_wire_v1_key(text,date,text,text,integer)','execute')"),'f');
  console.log(`R-P05 PG PASS; ${providerRequests} synthetic adapter requests, zero network/provider calls`);
} finally {
  if(running)run('pg_ctl',['--pgdata',data,'--wait','stop']);
  rmSync(root,{recursive:true,force:true});
}
