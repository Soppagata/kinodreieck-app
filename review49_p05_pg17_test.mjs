// E08-002, E08-004, E05-002 and E14-001: disposable PG16/17, real product RPCs.
import {randomUUID} from 'node:crypto';
import * as R from './src/lib/localEventRadar.js';
import {validateRadarPilotFeed} from './src/lib/radarPilotContracts.js';
import {createRadarPilotService} from './src/services/radarPilot.js';
import {createTextRadarReleaseId,validateRadarWebsearchRequest} from './supabase/functions/radar-websearch-task/contract.js';
import {baueFlixpatrolKontextIdentitaet,createFlixpatrolFactsContextReader} from './supabase/functions/_shared/flixpatrolFactsContext.js';
globalThis.fetch=async()=>{throw new Error('Unexpected network');};
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalTextRadarTargetId } from './src/lib/localEventRadar.js';
import { evaluateTextRadarWebsearchResponse } from './supabase/functions/radar-websearch-task/contract.js';
import { parseAnthropicRadarWebsearchResponse } from './supabase/functions/radar-websearch-task/anthropicAdapter.js';
import { runRadarWebsearchCheck } from './supabase/functions/radar-websearch-task/runner.js';
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
const root=mkdtempSync(join(tmpdir(),'review49-p05-pg-'));
const data=join(root,'data'), socket=join(root,'socket'); mkdirSync(socket);
let running=false;
function run(bin,args,input) {
  const r=spawnSync(join(PG,bin),args,{input,encoding:'utf8',timeout:60000,maxBuffer:8000000,env:{PATH:`${PG}:/usr/bin:/bin`,LANG:'C',LC_ALL:'C'}});
  if(r.status!==0) throw new Error(`${bin}: ${r.stderr || r.error}`);
  return r.stdout.trim();
}
function sql(q){return run('psql',['-h',socket,'-p','65452','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-f','-'],q);}
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
const account='e0800000-0000-4000-8000-000000000002';
const targetText='Synthetische Validator Filmreihe';
const targetId=createLocalTextRadarTargetId(targetText);
const session=(q,role='service_role')=>sql(`begin; set local role ${role}; select set_config('request.jwt.claim.sub','${account}',true); select set_config('request.jwt.claim.role','${role}',true); ${q}; commit;`).split('\n').at(-1);
const feed=()=>JSON.parse(session("select public.kd_radar_pilot_feed_search_access('{}'::uuid[],true)",'authenticated'));
const checkedAt=new Date().toISOString();
const eventDate=new Date(Date.now()+86400000*7).toISOString().slice(0,10);
const setup={radarEnabled:true,radarProviderEnabled:true,radarSchedulerEnabled:false,providerAllowed:true,modelAlias:'klein',model:'claude-haiku-4-5',maxTokens:2400,taskCapUsdCent:20,searchFeeUsdCent:1,globalRequestCapUsdCent:500,timeoutMs:30000,inputPriceUsdCentPerMtok:100,outputPriceUsdCentPerMtok:500,sourceRegistry:[]};
const candidates=['Platform A','Platform B'].map((platform,i)=>({title:'Synthetischer Film',targetType:'work',category:'film',eventType:'streamingstart_at',eventDate,region:'AT',platform,evidence:[{url:`https://press.example/platform-${i}`,sourceTitle:`Start auf ${platform}`,claim:`Synthetischer Film startet am ${eventDate} in AT auf ${platform}.`}]}));
function envelope(request,items){
  return parseAnthropicRadarWebsearchResponse({model:setup.model,stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:100,server_tool_use:{web_search_requests:1}},content:[{type:'server_tool_use',id:'mock-tool-1',name:'web_search',input:{}},{type:'web_search_tool_result',tool_use_id:'mock-tool-1',content:items.map(c=>({type:'web_search_result',url:c.evidence[0].url}))},{type:'text',text:JSON.stringify({status:'confirmed',candidates:items})}]},request,setup,checkedAt).envelope;
}
try {
  run('initdb',['--no-locale','--encoding=UTF8','--auth=trust','--username=postgres','--pgdata',data]);
  run('pg_ctl',['--pgdata',data,'--log',join(root,'postgres.log'),'--options',`-c listen_addresses= -c unix_socket_directories=${socket} -p 65452 -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,'--wait','start']);running=true;
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
  const evaluated=evaluateTextRadarWebsearchResponse(envelope(request,candidates),request,[]);
  assert.equal(evaluated.status,'confirmed');assert.equal(evaluated.textResult.candidates.length,2);
  assert.notEqual(evaluated.textResult.candidates[0].targetId,evaluated.textResult.candidates[1].targetId);
  // Seed an actual old-format row before installing the additive migration.
  const legacyPayload={...payloadFor(evaluated.textResult.candidates[0]),targetKey:'release:v1:0123456789abcdef'};
  const old=persist(legacyPayload);
  const before=JSON.parse(sql('select row_to_json(f) from public.kd_radar_text_findings f'));
  for(const file of ['20260917100000_review_radar_text_identity.sql','20260917101000_review_radar_context_year.sql'])sql(readFileSync(join(SOURCE,'supabase/migrations',file),'utf8'));
  const migrated=JSON.parse(sql('select row_to_json(f) from public.kd_radar_text_findings f'));
  assert.deepEqual({...migrated,release_key:before.release_key},before);
  assert.equal(migrated.release_key,evaluated.textResult.candidates[0].targetId);
  assert.deepEqual(persist(legacyPayload),{...old,status:'no_change'});
  assert.deepEqual(persist(payloadFor(evaluated.textResult.candidates[0])),{...old,status:'no_change'});
  assert.throws(()=>persist({...payloadFor(evaluated.textResult.candidates[0]),targetKey:'release:v2:0123456789abcdef'}),/radar_text_identity_mismatch/);
  // JS/SQL UTF-8 and platform sentinel parity, without fuzzy matching.
  for(const title of ['Ärger & Ω',' SPACE   Fold ','A|B'])for(const platform of ['Platform A','Platform B','-','unknown','N/A','Ö+']){
    const candidate={title,eventDate,eventType:'streamingstart_at',targetType:'work',seasonNumber:null,platform};
    assert.equal(sql(`select public.kd_radar_text_release_key(${quote(title)},${quote(eventDate)},'streamingstart_at','work',null,${quote(platform)})`),createTextRadarReleaseId(candidate));
  }
  const writes=[];let searches=0;
  const repository={loadAuthorizedTarget:async()=>request,resolveSources:async()=>[],loadFeed:async()=>feed(),
    upsertConfirmedEvent:async({event,textContext})=>{const ack=persist(payloadFor(event,textContext));writes.push(ack);return ack;}};
  const execute=items=>runRadarWebsearchCheck({accountId:account,targetId,targetText,repository,
    adapter:{search:async()=>{searches++;return envelope(request,items);}}});
  const result=await execute(candidates);
  assert.equal(result.status,'confirmed');assert.equal(result.writes,1);assert.equal(result.feed.events.length,2);
  const semantic=events=>events.map(e=>[e.targetId,e.platform,e.evidence[0].url]).sort((a,b)=>a[0].localeCompare(b[0]));
  const expected=semantic(result.feed.events);
  assert.deepEqual(result.feed.events.map(e=>e.platform).sort(),['Platform A','Platform B']);
  for(const e of result.feed.events)assert.equal(e.evidence[0].url,candidates.find(c=>c.platform===e.platform).evidence[0].url);
  const versions=result.feed.events.map(e=>e.eventVersionId).sort();
  const repeat=await execute([...candidates].reverse());
  assert.equal(repeat.status,'no_change');assert.equal(repeat.writes,0);
  assert.deepEqual(repeat.feed.events.map(e=>e.eventVersionId).sort(),versions);
  assert.equal(searches,2);
  sql('delete from public.kd_radar_text_findings');
  const reversed=await execute([...candidates].reverse());
  assert.equal(reversed.writes,2);assert.deepEqual(semantic(reversed.feed.events),expected);
  assert.deepEqual(reversed.feed.events.map(e=>e.platform),result.feed.events.map(e=>e.platform));
  assert.equal(validateRadarPilotFeed(reversed.feed).ok,true);
  // Pause/remove and account ownership remain enforced by the actual SQL.
  session(`select public.kd_radar_pilot_set_text_subscription(${quote(targetText)},'paused',gen_random_uuid())`,'authenticated');
  assert.equal(feed().events.length,0);assert.throws(()=>persist(legacyPayload),/forbidden/);
  session(`select public.kd_radar_pilot_set_text_subscription(${quote(targetText)},'active',gen_random_uuid())`,'authenticated');
  const other='e0800000-0000-4000-8000-000000000099';
  sql(`insert into auth.users(id) values('${other}');insert into public.kd_account_access(account_id,role,active,personal_ai) values('${other}','member',true,true);insert into public.kd_radar_capabilities(account_id,radar_pilot) values('${other}',true)`);
  const otherFeed=JSON.parse(sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${other}',true);select public.kd_radar_pilot_feed_search_access('{}',true);commit;`).split('\n').at(-1));
  assert.equal(otherFeed.events.length,0);assert.equal(otherFeed.subscriptions.length,0);
  assert.equal(sql("select has_function_privilege('authenticated','public.kd_radar_websearch_upsert_text_finding(uuid,uuid,jsonb)','execute')"),'f');
  console.log('PASS E08-002: both platforms and sources, reversed order, replay, legacy UUID/version preservation, account and pause guards');

  // Actual queue -> service -> SQL setter -> fresh SQL feed -> service readback.
  const snapshot={mode:'account',state:'ready',account:{id:account}};
  const calls=[],cache=[];
  const service=createRadarPilotService({config:{supabaseUrl:'https://mock.invalid',supabasePublishableKey:'mock',radarPilotClientEnabled:true},
    auth:{getSnapshot:()=>snapshot},getAccount:()=>snapshot.account,getAccessToken:async()=>'mock',isTokenCurrent:()=>true,
    captureContext:()=>({owner:`account:${account}`,isCurrent:()=>true,set:async(k,v)=>cache.push(JSON.parse(v))}),
    fetchImpl:async(url,options)=>{const name=url.split('/').at(-1),body=JSON.parse(options.body);calls.push(name);
      const query=name==='kd_radar_pilot_feed_search_access'
        ? `select public.kd_radar_pilot_feed_search_access(array[${body.p_operation_ids.map(quote).join(',')}]::uuid[],true)`
        : name==='kd_radar_pilot_set_text_subscription'
          ? `select public.kd_radar_pilot_set_text_subscription(${quote(body.p_target_text)},${quote(body.p_status)},${quote(body.p_operation_id)})`:null;
      assert.ok(query,name);return new Response(session(query,'authenticated'));}});
  let state=(await service.sync({state:R.createEmptyLocalRadar({authority:'account-cache'})})).state;
  for(const prefix of ['IMDb','tmdb','work','watchmode','fixture','catalog','wikidata']){
    const text=`${prefix}:tt0068646`;
    const queued=R.queueAccountTextRadarChange(state,{operationId:randomUUID(),action:'upsert',targetText:text});assert.equal(queued.ok,true);
    let synced=await service.sync({state:queued.state});assert.equal(synced.status,'ready');
    synced=await service.sync({state:R.createEmptyLocalRadar({authority:'account-cache'})});assert.equal(synced.status,'ready');
    assert.equal(synced.state.subscriptions.find(s=>s.targetText===text)?.title,text);
    assert.equal(synced.state.pilot.events.length,2);
    for(const action of ['pause','remove']){
      const change=R.queueAccountTextRadarChange(synced.state,{operationId:randomUUID(),action,targetText:text});assert.equal(change.ok,true);
      synced=await service.sync({state:change.state});assert.equal(synced.status,'ready');
      assert.equal(synced.state.subscriptions.find(s=>s.targetText===text)?.status,action==='pause'?'paused':undefined);
    }
    state=synced.state;
  }
  const validFeed=feed();
  for(const title of ['',{},'a'.repeat(161)])assert.equal(validateRadarPilotFeed({...validFeed,subscriptions:[{...validFeed.subscriptions[0],title}]}).ok,false);
  for(const targetType of ['work','series','franchise'])assert.equal(validateRadarPilotFeed({...validFeed,subscriptions:[{...validFeed.subscriptions[0],targetType,title:'IMDb:tt0068646'}]}).ok,false);
  assert.equal(state.pilot.events.length,2);assert.ok(cache.length>0);
  console.log('PASS E08-004: seven prefixes, fresh reconciliation with sibling findings, real pause/remove, invalid input and nontext guards');
  for(const file of ['20260909153000_flixpatrol_usage_ticker.sql','20260909190000_flixpatrol_data_cache.sql','20260911120000_title_facts_lookup.sql'])sql(readFileSync(join(SOURCE,'supabase/migrations',file),'utf8'));
  const series={premiereOnline:null,countryId:null,companyId:null,genreId:null,keywordId:null,providerUpdatedAt:'2026-09-16T10:00:00',sourceId:'ttl_SeriesValidator1234567890',mediaType:'series',title:'Validator Series',premiere:'2024-01-01',releaseYear:2024,runtimeMinutes:50,imdbNumericId:'7654321',imdbId:'tt07654321',tmdbId:'194',description:'Cached neutral series facts.',sourceUrl:'https://flixpatrol.com/title/validator-series/'};
  const film={...series,sourceId:'ttl_FilmValidator123456789012',mediaType:'film',title:'Validator Film',imdbNumericId:'1234567',imdbId:'tt01234567',tmdbId:'195'};
  const saveFact=item=>JSON.parse(session(`select public.kd_flixpatrol_data_save_title(${quote(JSON.stringify(item))}::jsonb,now(),now()+interval '30 days')`));
  for(const item of [series,film])assert.equal(saveFact(item).saved,true);
  async function context(identity,{chart=false,skipLookup=false}={}){
    const calls=[];
    const result=await createFlixpatrolFactsContextReader({timeoutMs:10000,rpc:async(name,args)=>{
      calls.push({name,args});
      if(name==='kd_title_facts_lookup')return skipLookup?{ok:true,items:[]}:JSON.parse(session(`select public.kd_title_facts_lookup(${quote(JSON.stringify(args.p_identities))}::jsonb)`));
      if(name==='kd_flixpatrol_titles_read')return JSON.parse(session(`select public.kd_flixpatrol_titles_read(array[${args.p_source_ids.map(quote).join(',')}])`));
      assert.equal(name,'kd_flixpatrol_chart_read');return {ok:true,chart:{companyId:args.p_company_id,countryId:args.p_country_id,chartType:args.p_chart_type,items:chart?[{sourceId:series.sourceId}]:[]}};
    }}).context(identity);
    return {result,calls};
  }
  for(const typ of ['serie','series'])for(const namespace of ['imdb','tmdb']){
    const built=baueFlixpatrolKontextIdentitaet({titel:series.title,jahr:2024,typ,externeIds:{[namespace]:namespace==='imdb'?series.imdbId:series.tmdbId}});assert.equal(built.ok,true);
    const found=await context(built.identity);assert.equal(found.calls.length,1);assert.equal(found.calls[0].args.p_identities[0].mediaType,'series');assert.equal(found.result.description,series.description);
  }
  const seriesIdentity={titel:series.title,jahr:2024,typ:'serie',imdb_id:series.imdbId};
  assert.equal((await context({...seriesIdentity,flixpatrol_id:series.sourceId})).result.description,series.description);
  assert.equal((await context(seriesIdentity,{chart:true,skipLookup:true})).result.description,series.description);
  assert.equal((await context({titel:film.title,jahr:2024,typ:'film',imdb_id:film.imdbId})).result.identity.mediaType,'film');
  for(const jahr of [undefined,null,2023,'unknown'])assert.equal((await context({...seriesIdentity,jahr})).result,null);
  assert.equal((await context({...seriesIdentity,tmdb_id:film.tmdbId})).result,null);
  assert.equal(baueFlixpatrolKontextIdentitaet({titel:series.title,jahr:2024,typ:'serie',externeIds:{imdb:series.imdbId},filmkennung:{namespace:'imdb',kennung:film.imdbId}}).ok,false);
  assert.equal(saveFact({...series,sourceId:'ttl_AmbiguousValidator1234567'}).saved,true);
  assert.equal((await context(seriesIdentity)).result,null);
  sql("delete from public.kd_flixpatrol_title_cache where source_id='ttl_AmbiguousValidator1234567'");
  const invalidEnum=JSON.parse(session(`select public.kd_title_facts_lookup('[{"imdbId":"${series.imdbId}","mediaType":"serie"}]')`));assert.equal(invalidEnum.code,'invalid-request');
  console.log('PASS E05-002: real strict SQL, IMDb/TMDb x serie/series, film/direct/chart, missing/conflicting year and conflicting/ambiguous IDs');

  // Create structured targets through the product group RPC, then subscribe
  // separately via the ordinary product RPC. Never hand-build the request year.
  const group={format:'kd-radar-title-group-v1',queryVersion:'title-group-query-v1',queryKey:'validator movies',displayName:'Validator Movies',members:[
    {targetId:'tmdb:movie:195',targetType:'work',title:film.title,year:2024},
    {targetId:'tmdb:tv:194',targetType:'series',title:series.title,year:2024}]};
  session(`select public.kd_radar_pilot_set_title_group('title-group:v1:validator-movies','all','active',gen_random_uuid(),${quote(JSON.stringify(group))}::jsonb)`,'authenticated');
  const index=readFileSync(join(SOURCE,'supabase/functions/radar-websearch-task/index.ts'),'utf8');
  const method=index.match(/async loadFactsContext\(request: Record<string, unknown>\) \{[\s\S]*?\n      \},\n      async upsertConfirmedEvent/)[0]
    .replace(/,\n      async upsertConfirmedEvent$/,'').replace('request: Record<string, unknown>','request').replace('name: string, args: Record<string, unknown>','name, args');
  for(const member of group.members){
    session(`select public.kd_radar_pilot_set_subscription(${quote(member.targetId)},'all','active',gen_random_uuid())`,'authenticated');
    for(const storedYear of [2024,null,'invalid',1887,9999,2023]){
      sql(`update public.kd_radar_targets set external_ids=jsonb_set(external_ids,'{releaseYear}',${quote(JSON.stringify(storedYear))}::jsonb) where target_key=${quote(member.targetId)}`);
      const request=JSON.parse(session(`select public.kd_radar_websearch_context('${account}',${quote(member.targetId)})`));
      const valid=[2024,2023].includes(storedYear);assert.equal(request.releaseYear,valid?storedYear:undefined);
      assert.equal(validateRadarWebsearchRequest(request).ok,true);
      let requests=0,writes=0,reads=0,received;
      const row=member.targetType==='work'?film:series;
      // E14 Mock-Faktenreader boundary, strict wire enum and production method.
      const admin={rpc:async(name,args)=>{reads++;assert.equal(name,'kd_title_facts_lookup');assert.deepEqual(args.p_identities,[{tmdbId:row.tmdbId,mediaType:row.mediaType}]);
        return {data:JSON.parse(session(`select public.kd_title_facts_lookup(${quote(JSON.stringify(args.p_identities))}::jsonb)`)),error:null};}};
      const productionRepo=new Function('admin','baueFlixpatrolKontextIdentitaet','createFlixpatrolFactsContextReader',`return ({${method}})`)(admin,baueFlixpatrolKontextIdentitaet,createFlixpatrolFactsContextReader);
      const result=await runRadarWebsearchCheck({accountId:account,targetId:request.targetId,repository:{...productionRepo,loadAuthorizedTarget:async()=>request,resolveSources:async()=>[],upsertConfirmedEvent:async()=>{writes++;throw Error('unexpected');},loadFeed:async()=>null},
        adapter:{search:async(value)=>{requests++;received=value;const {scopes,flixpatrolFakten,...target}=value;return {searchResultCount:0,response:{status:'no_change',checkedAt,target,events:[]}};}}});
      assert.equal(!!received.flixpatrolFakten,storedYear===2024);assert.equal(result.status,'no_change');assert.equal(writes,0);assert.equal(requests,1);assert.equal(reads,1);
    }
  }
  // No identity or authorization side effects; removing text still cascades.
  session(`select public.kd_radar_pilot_set_text_subscription(${quote(targetText)},'removed',gen_random_uuid())`,'authenticated');
  assert.equal(sql('select count(*) from public.kd_radar_text_findings'),'0');
  console.log('PASS E14-001: product RPC -> effective SQL year -> production facts method -> mock adapter; film+series, six year variants each, no extra searches/writes');
} finally {
  if(running)run('pg_ctl',['--pgdata',data,'--mode','immediate','--wait','stop']);
  rmSync(root,{recursive:true,force:true});
}
