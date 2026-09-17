import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
const source = process.cwd();

globalThis.crypto ??= webcrypto;
globalThis.fetch = async () => { throw new Error('NETWORK FORBIDDEN'); };
const bundle = await build({stdin:{contents:`
export {createRadarWebsearchHandler} from './supabase/functions/radar-websearch-task/index.ts';
export {createAnthropicRadarWebsearchAdapter} from './supabase/functions/radar-websearch-task/anthropicAdapter.js';
export {createRadarWebsearchService} from './src/services/radarWebsearch.js';
export {createLocalTextRadarTargetId} from './src/lib/localEventRadar.js';
export {useEntdeckenRadarController} from './src/controllers/useEntdeckenRadarController.js';
export {setStorageDriver,captureStorageContext} from './src/lib/storage.js';
export {createRadarPilotService} from './src/services/radarPilot.js';
export {createEmptyLocalRadar} from './src/lib/localEventRadar.js';
export {validateRadarPilotFeed} from './src/lib/radarPilotContracts.js';
`, resolveDir:source,loader:'js'}, bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime'],define:{'import.meta.main':'false'},logLevel:'silent',plugins:[{name:'mock-supabase',setup(b){b.onResolve({filter:/^npm:@supabase/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClient = (...args) => globalThis.__mockClient(...args);'}));}}]});
const module={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {createRadarWebsearchHandler,createAnthropicRadarWebsearchAdapter,createRadarWebsearchService,createLocalTextRadarTargetId,validateRadarPilotFeed,createRadarPilotService,createEmptyLocalRadar,useEntdeckenRadarController,setStorageDriver,captureStorageContext}=module.exports;
const accountId='a1000000-0000-4000-8000-000000000001';
const targetText='Synthetische Alpenkrimis';
const targetId=createLocalTextRadarTargetId(targetText);
const instant='2026-09-16T10:00:00.000Z', day='2026-09-16';
const setup={radarEnabled:true,radarProviderEnabled:true,radarSchedulerEnabled:false,providerAllowed:true,modelAlias:'klein',model:'claude-haiku-4-5',maxTokens:2400,taskCapUsdCent:20,searchFeeUsdCent:1,globalRequestCapUsdCent:500,timeoutMs:30000,inputPriceUsdCentPerMtok:100,outputPriceUsdCentPerMtok:500,sourceRegistry:[]};
const env={SUPABASE_URL:'https://mock.example',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'service-test'};
globalThis.Deno={env:{get:key=>env[key]}};
function candidate(title){return {title,category:'film',eventType:'kinostart_at',eventDate:'2026-10-15',region:'AT',evidence:[{url:'https://press.example/start',sourceDomain:'press.example',sourceTitle:'Starttermine',claim:'Kinostart in Österreich am 15. Oktober 2026.'}]};}
function providerBody(partial){return {model:setup.model,stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:100,server_tool_use:{web_search_requests:1}},content:[{type:'server_tool_use',id:'tool1',name:'web_search',input:{query:targetText}},{type:'web_search_tool_result',tool_use_id:'tool1',content:[{type:'web_search_result',url:'https://press.example/start',title:'Starts'}]},{type:'text',text:JSON.stringify({status:'confirmed',candidates:[candidate('Erster Film'),candidate('Zweiter Film'),...(partial?[{evidence:'kaputt'}]:[])]})}]};}
const session={mode:'account',state:'ready',account:{id:accountId}};
function service(fetchImpl){return createRadarWebsearchService({config:{radarPilotClientEnabled:true,supabaseUrl:env.SUPABASE_URL,supabasePublishableKey:'public-test'},auth:{getSnapshot:()=>session},getAccount:()=>session.account,getAccessToken:async()=>'mock-token',singleFile:false,fetchImpl});}
async function scenario({failSecond=false,partial=false}={}){
 const calls=[], stored=[]; let providerCalls=0,settlements=0,payload;
 const feed=()=>({format:'kd-radar-pilot-feed-v2',revision:1,checksum:'a'.repeat(64),reconciledAt:instant,subscriptions:[{targetId,targetType:'text',title:targetText,region:'AT',scope:'all',status:'active',updatedAt:instant}],events:stored,receipts:[],operationAcks:[],radarReview:false,radarSearch:true,personResults:[]});
 globalThis.__mockClient=()=>({auth:{async getClaims(){calls.push('auth');return {data:{claims:{sub:accountId,role:'authenticated'}}};}},async rpc(name,args){
 calls.push(name);
 if(name==='kd_radar_initial_claim')return {data:{claim:true,status:'claimed',accountId,targetId,targetText,targetType:'text',targetRowId:'c1000000-0000-4000-8000-000000000001',viennaDay:day,fenceToken:'c1000000-0000-4000-8000-000000000002'}};
 if(name==='kd_radar_websearch_prepare_text')return {data:{kind:'text',targetId,targetText,region:'AT',scopes:['cinema']}};
 if(name==='kd_radar_daily_assert_lease')return {data:{ok:true}};
 if(name==='kd_radar_websearch_upsert_text_finding'){
  const p=args.p_payload;
  if(failSecond && p.workTitle==='Zweiter Film')return {error:new Error('synthetic per-record RPC failure')};
  const i=stored.length+1;
  stored.push({eventId:`b1000000-0000-4000-8000-00000000000${i}`,eventVersionId:`b2000000-0000-4000-8000-00000000000${i}`,targetId:p.targetKey,title:p.workTitle,targetType:p.workTargetType,category:p.category,sourceTargetKey:`text:${targetId}`,eventType:p.eventType,date:p.date,region:p.region,platform:p.platform,lifecycleStatus:'scheduled',verificationStatus:'confirmed',evidence:[{sourceId:'web:press.example',sourceDomain:'press.example',url:'https://press.example/start',retrievedAt:instant}]});
  return {data:{status:'confirmed'}};
 }
 if(name==='kd_radar_pilot_feed')return {data:feed()};
 if(name==='kd_radar_daily_finish'){assert.equal(args.p_safe_status,'confirmed');return {data:{ok:true}};}
 throw new Error(`Unexpected mock RPC ${name}`);
 }});
 const adapter=createAnthropicRadarWebsearchAdapter({apiKey:'mock-key',loadSetup:async()=>setup,reserveCost:async()=>({ok:true,logId:4}),settleCost:async x=>{assert.equal(x.status,'fertig');settlements++;},fetchImpl:async()=>{providerCalls++;return new Response(JSON.stringify(providerBody(partial)));},now:()=>instant});
 const handler=createRadarWebsearchHandler({adapter});
 const client=await service(async(url,options)=>{const response=await handler(new Request(url,options));payload=await response.clone().json();assert.equal(response.status,200);return response;}).checkNow(targetId,targetText,{initial:true});
 assert.equal(providerCalls,1);assert.equal(settlements,1);
 assert.equal(validateRadarPilotFeed(payload.feed).ok,true);
 assert.equal(payload.textDiagnostics.acceptedCandidates,2);
 assert.equal(payload.status,'confirmed');
 return {payload,client,calls,providerCalls,settlements,storedCount:stored.length};
}
const success=await scenario();
assert.equal(success.payload.providerReceipt.resultMode,'structured');assert.equal(success.payload.responseMode,'structured');assert.equal(success.client.status,'confirmed');assert.equal(success.client.writes,2);
const failure=await scenario({failSecond:true});
assert.equal(failure.storedCount,1);assert.equal(failure.payload.writes,1);assert.equal(failure.payload.responseMode,'partial');assert.equal(failure.payload.providerReceipt.resultMode,'structured');assert.ok(failure.payload.warnings.includes('text-finding-storage-dropped'));assert.equal(failure.client.status,'confirmed');assert.equal(failure.client.writes,1);assert.equal(failure.client.responseMode,'partial');assert.ok(failure.client.warnings.includes('text-finding-storage-dropped'));assert.equal(failure.client.feed.events.length,1);

assert.deepEqual(failure.payload.persistence,{stored:1,failed:1});
assert.equal(failure.payload.providerReceipt.resultMode,'structured');
const alreadyPartial=await scenario({failSecond:true,partial:true});
assert.equal(alreadyPartial.payload.providerReceipt.resultMode,'partial');assert.equal(alreadyPartial.client.status,'confirmed');assert.equal(alreadyPartial.client.writes,1);
const providerPartial=await scenario({partial:true});assert.equal(providerPartial.client.responseMode,'partial');assert.equal(providerPartial.client.writes,2);
for(const mutate of [
 p=>delete p.persistence, p=>p.persistence.failed=0, p=>p.persistence.stored=2,
 p=>p.persistence.extra=true, p=>p.warnings=[], p=>p.status='unavailable',
 p=>p.responseMode='degraded',p=>p.providerReceipt.resultMode='degraded',
 p=>p.feed.events=[],p=>p.writes=3,p=>p.textDiagnostics.acceptedCandidates=1,
]){
 const payload=structuredClone(failure.payload);mutate(payload);
 const rejected=await service(async()=>new Response(JSON.stringify(payload))).checkNow(targetId,targetText,{initial:true});
 assert.equal(rejected.status,'unavailable');assert.equal(rejected.writes,0);
}
// Existing persisted feed sync retains the successful sibling; never install
// the two model candidates as if both had been saved.
const cache=[];
const pilot=createRadarPilotService({config:{radarPilotClientEnabled:true,supabaseUrl:env.SUPABASE_URL,supabasePublishableKey:'mock'},
 auth:{getSnapshot:()=>session},getAccount:()=>session.account,getAccessToken:async()=>'mock',isTokenCurrent:()=>true,
 captureContext:()=>({owner:`account:${accountId}`,isCurrent:()=>true,set:async(k,v)=>cache.push(JSON.parse(v))}),
 fetchImpl:async()=>new Response(JSON.stringify(failure.payload.feed))});
const synced=await pilot.sync({state:createEmptyLocalRadar({authority:'account-cache'})});
assert.equal(synced.status,'ready');assert.equal(synced.state.pilot.events.length,1);
assert.equal(synced.state.pilot.events[0].title,'Erster Film');
console.log('PASS E08-001: real adapter/receipt/handler/browser/pilot, success and provider/storage partial, 11 tamper guards, sibling feed, one provider request per scenario');

const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
for(const name of ['window','document','navigator','localStorage','HTMLElement','Node','requestAnimationFrame','cancelAnimationFrame'])
 Object.defineProperty(globalThis,name,{value:typeof dom.window[name]==='function'&&name.includes('AnimationFrame')?dom.window[name].bind(dom.window):dom.window[name],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act,createElement:h}=require('react'),{createRoot}=require('react-dom/client');
setStorageDriver({name:'partial-controller',owner:`account:${accountId}`,
 get:async key=>{const value=localStorage.getItem(key);return value===null?null:{key,value};},
 set:async(key,value)=>{localStorage.setItem(key,value);return {key,value};}});
let active=false,searched=false,controller;
const pilotForController=createRadarPilotService({config:{radarPilotClientEnabled:true,supabaseUrl:env.SUPABASE_URL,supabasePublishableKey:'mock'},
 auth:{getSnapshot:()=>session},getAccount:()=>session.account,getAccessToken:async()=>'mock',isTokenCurrent:()=>true,captureContext:captureStorageContext,
 fetchImpl:async(url,options)=>{
  const name=url.split('/').at(-1),body=JSON.parse(options.body);
  if(name==='kd_radar_pilot_set_text_subscription'){active=true;return new Response(JSON.stringify({operationId:body.p_operation_id,targetId,status:'active',revision:1,checksum:'a'.repeat(64)}));}
  assert.equal(name,'kd_radar_pilot_feed_search_access');
  return new Response(JSON.stringify({...failure.payload.feed,revision:active?1:0,checksum:active?'a'.repeat(64):null,subscriptions:active?failure.payload.feed.subscriptions:[],events:searched?failure.payload.feed.events:[]}));
 }});
const searchForController=service(async()=>{searched=true;return new Response(JSON.stringify(failure.payload));});
const setErr=()=>{};
function Harness(){controller=useEntdeckenRadarController({session,remoteKontoAktiv:true,bootDone:true,master:[],setErr,radarPilotEnabled:true,radarPilotAdapter:pilotForController,radarWebsearchAdapter:searchForController});return null;}
const root=createRoot(document.querySelector('#app'));
try{
 await act(async()=>{root.render(h(Harness));await new Promise(r=>setTimeout(r,0));});
 let result;await act(async()=>{result=await controller.fuegeRadarTextHinzu(targetText);});
 assert.equal(result.status,'confirmed');assert.equal(result.saved,true);assert.equal(controller.radarPilotEvents.length,1);
 assert.equal(controller.radarPilotEvents[0].title,'Erster Film');
 console.log('PASS E08-001 initial controller: accepted storage partial and sibling persisted feed stay confirmed');
}finally{await act(async()=>root.unmount());dom.window.close();}
