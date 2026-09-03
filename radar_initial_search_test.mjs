/* Explicit save → one initial request → persisted feed; mocks only. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const bundled = await build({ stdin: { contents: `
  export {useEntdeckenRadarController} from './src/controllers/useEntdeckenRadarController.js';
  export {EntdeckenTab} from './src/tabs/EntdeckenTab.jsx';
  export {createRadarPilotService} from './src/services/radarPilot.js';
  export {createRadarWebsearchService} from './src/services/radarWebsearch.js';
  export {createEmptyLocalRadar,createLocalTextRadarTargetId} from './src/lib/localEventRadar.js';
  export {setStorageDriver,captureStorageContext,K} from './src/lib/storage.js';
  export {createRadarWebsearchHandler} from './supabase/functions/radar-websearch-task/index.ts';
  export {parseAnthropicRadarWebsearchResponse} from './supabase/functions/radar-websearch-task/anthropicAdapter.js';
`, resolveDir: process.cwd(), loader: "js" }, bundle:true, write:false, format:"cjs", platform:"node",
  jsx:"automatic", external:["react","react/jsx-runtime"], define:{"import.meta.main":"false"}, logLevel:"silent",
  plugins:[{name:"mock-supabase",setup(b){b.onResolve({filter:/^npm:@supabase/},()=>({path:"mock",namespace:"mock"}));
    b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const createClient = (...args) => globalThis.__radarClient(...args);"}));}}],
});
const module = {exports:{}};
new Function("require","module","exports",bundled.outputFiles[0].text)(require,module,module.exports);
const {useEntdeckenRadarController,EntdeckenTab,createRadarPilotService,createRadarWebsearchService,
  createEmptyLocalRadar,createLocalTextRadarTargetId,setStorageDriver,captureStorageContext,K,
  createRadarWebsearchHandler,parseAnthropicRadarWebsearchResponse} = module.exports;
const dom = new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost/"});
for(const name of ["window","document","navigator","localStorage","HTMLElement","HTMLInputElement","Node","Event"])
  Object.defineProperty(globalThis,name,{value:name==="window"?dom.window:dom.window[name],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act,createElement:h,useCallback,useRef}=await import("react");
const {createRoot}=await import("react-dom/client");
const tick=()=>new Promise(r=>setTimeout(r,0));
const settle=()=>act(async()=>{await tick();await tick();});
const a="a1000000-0000-4000-8000-000000000001", b="a1000000-0000-4000-8000-000000000002";
const now=new Date(), instant=now.toISOString();
const viennaDayParts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
  timeZone:"Europe/Vienna",year:"numeric",month:"2-digit",day:"2-digit",
}).formatToParts(now).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
const day=`${viennaDayParts.year}-${viennaDayParts.month}-${viennaDayParts.day}`, query="Synthetische Sternenreihe";
const targetId=createLocalTextRadarTargetId(query);
const event={eventId:"b1000000-0000-4000-8000-000000000001",eventVersionId:"b1000000-0000-4000-8000-000000000002",
  targetId:"release:v1:1122334455667788",title:"Ein anderer Werktitel",targetType:"work",category:"film",
  eventType:"kinostart_at",date:day,region:"AT",platform:"-",lifecycleStatus:"scheduled",verificationStatus:"confirmed",
  evidence:[{sourceId:"web:press.example",sourceDomain:"press.example",url:"https://press.example/start",retrievedAt:instant}]};
const emptyFeed=()=>({format:"kd-radar-pilot-feed-v2",revision:0,checksum:null,reconciledAt:instant,
  subscriptions:[],events:[],receipts:[],operationAcks:[],radarReview:true,personResults:[]});
const subscription={targetId,targetType:"text",title:query,region:"AT",scope:"all",status:"active",updatedAt:instant};
const config={radarPilotClientEnabled:true,supabaseUrl:"https://mock.example",supabasePublishableKey:"public-test"};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
let checks=0;
async function check(name,fn){await fn();checks++;console.log(`✓ ${name}`);}
function textResponse(feed,status="confirmed") {return {ok:true,status,writes:status==="confirmed"?1:0,
  providerRequests:1,searchRequests:4,reservationStatus:"reserved",reservationUsdCent:20,reservationDecision:"accepted",
  feed,textDiagnostics:{normalizedCandidates:status==="confirmed"?1:0,acceptedCandidates:status==="confirmed"?1:0,rejectionCodes:[]},
  textResult:{status:status==="confirmed"?"confirmed":"insufficient_evidence",checkedAt:instant,candidates:status==="confirmed"?[event]:[]}};}
const authSession=(id=a)=>({mode:"account",state:"ready",account:{id},capabilities:{personalAi:true}});
let controller;
function Harness({context}){
  const statusRef=useRef({});const setErr=useCallback(()=>{},[]);
  controller=useEntdeckenRadarController({session:context.session,remoteKontoAktiv:context.session.mode==="account",
    bootDone:true,master:[],streamingKnown:null,streamingDiscover:null,entdeckenStatus:statusRef.current,
    entdeckenStatusRef:statusRef,schreibeEntdeckenStatus:async()=>{},serienKatalog:[],setErr,
    radarPilotEnabled:true,radarPilotAdapter:context.pilot,radarWebsearchAdapter:context.search});
  return h(EntdeckenTab,{datenKontextKey:context.session.account?.id||"guest",radarState:controller.sichtbarerRadarState,
    accountMode:context.session.mode==="account",radarPilotEvents:controller.radarPilotEvents,
    onRadarTextAdd:controller.fuegeRadarTextHinzu,onRadarChange:controller.aendereRadar,
    blogProps:{artikel:[],master:[]}});
}
async function mount({status="confirmed",saveFails=false,held=false,guest=false,capability=true}={}){
  localStorage.clear();
  const context={session:guest?{mode:"guest",state:"ready",account:null}:authSession(),calls:[],feed:emptyFeed()};
  if(!guest) context.session.capabilities.personalAi=capability;
  const install=(id)=>setStorageDriver({name:"test",owner:id?`account:${id}`:"guest-local",
    async get(key){const value=localStorage.getItem(key);return value===null?null:{key,value};},
    async set(key,value){localStorage.setItem(key,value);return {key,value};}});
  install(guest?null:a);
  let release;const wait=held?new Promise(r=>{release=r;}):Promise.resolve();
  const dependencies={config,auth:{getSnapshot:()=>context.session},getAccount:()=>context.session.account,
    getAccessToken:async()=>"mock-token",isTokenCurrent:()=>true,captureContext:captureStorageContext};
  context.pilot=createRadarPilotService({...dependencies,fetchImpl:async(url,options)=>{
    const name=url.split("/").at(-1);const body=JSON.parse(options.body);context.calls.push(name);
    if(name==="kd_radar_pilot_feed")return response({...context.feed,operationAcks:context.feed.operationAcks.filter(x=>body.p_operation_ids.includes(x.operationId))});
    assert.equal(name,"kd_radar_pilot_set_text_subscription");
    if(saveFails)return response({code:"unavailable"},503);
    const id=createLocalTextRadarTargetId(body.p_target_text),revision=context.feed.revision+1,checksum=String(revision).repeat(64).slice(0,64);
    const ack={operationId:body.p_operation_id,targetId:id,status:body.p_status,revision,checksum};
    context.feed={...context.feed,revision,checksum,subscriptions:body.p_status==="removed"?[]:[{...subscription,targetId:id,title:body.p_target_text,status:body.p_status}],
      events:body.p_status==="removed"?[]:context.feed.events,operationAcks:[ack]};return response(ack);
  }});
  context.search=createRadarWebsearchService({...dependencies,fetchImpl:async(_url,options)=>{
    context.calls.push("search");assert.deepEqual(JSON.parse(options.body),{targetId,targetText:query,initial:true});
    assert.equal(context.feed.subscriptions[0].status,"active");await wait;
    if(status==="throw")throw new Error("mock unavailable");
    if(status==="confirmed")context.feed={...context.feed,events:[event]};
    return response(textResponse({...context.feed,operationAcks:[]},status));
  }});
  const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
  await act(async()=>{root.render(h(Harness,{context}));await tick();});await settle();
  const render=async()=>{await act(async()=>{root.render(h(Harness,{context}));await tick();});await settle();};
  return {context,container,release,async switchAccount(){context.session=authSession(b);localStorage.clear();context.feed=emptyFeed();install(b);await render();},
    async remount(){await act(async()=>root.render(null));await render();},
    async radar(){await act(async()=>{[...container.querySelectorAll("button")].find(x=>x.textContent==="Radar").click();});},
    async cleanup(){await act(async()=>root.unmount());container.remove();},render};
}
try {
  await check("Neue Eingabe: Save vor genau einem Initialrequest; echte Pilot-Persistenz statt Rohkandidat",async()=>{
    const ui=await mount({held:true});assert.equal(ui.context.calls.includes("search"),false);
    let first,second;const progress=[];
    await act(async()=>{first=controller.fuegeRadarTextHinzu(query,{onProgress:s=>progress.push(s)});second=controller.fuegeRadarTextHinzu(query);await tick();});
    assert.equal((await second).status,"busy");assert.equal(ui.context.calls.filter(x=>x==="search").length,1);
    assert.deepEqual(progress,["saving","searching"]);
    await act(async()=>{ui.release();assert.equal((await first).status,"confirmed");});
    const saved=JSON.parse(localStorage.getItem(K.radar));assert.equal(saved.subscriptions[0].targetText,query);
    assert.equal(saved.pilot.events[0].title,event.title);await ui.radar();
    assert.match(ui.container.textContent,/Ein anderer Werktitel/);assert.doesNotMatch(ui.container.textContent,/alle sechs Tage|alle 6 Tage/);
    await act(async()=>{assert.equal((await controller.fuegeRadarTextHinzu(query)).status,"active");});
    assert.equal(ui.context.calls.filter(x=>x==="search").length,1);
    await ui.remount();assert.equal(ui.context.calls.filter(x=>x==="search").length,1);await ui.radar();
    await act(async()=>{await controller.aendereRadar(saved.subscriptions[0],"remove");});
    assert.equal(JSON.parse(localStorage.getItem(K.radar)).pilot.events.length,0);assert.doesNotMatch(ui.container.textContent,/Ein anderer Werktitel/);
    await ui.cleanup();
  });
  for(const options of [{guest:true},{capability:false},{saveFails:true}]) await check(`Keine unberechtigte Erstsuche: ${Object.keys(options)[0]}`,async()=>{
    const ui=await mount(options);await act(async()=>{await controller.fuegeRadarTextHinzu(query);});
    assert.equal(ui.context.calls.includes("search"),false);await ui.cleanup();
  });
  for(const status of ["insufficient_evidence","provider_error","throw"])await check(`${status}: gespeichertes Ziel bleibt ohne Wiederholung`,async()=>{
    const ui=await mount({status});let result;await act(async()=>{result=await controller.fuegeRadarTextHinzu(query);});
    assert.equal(result.saved,true);assert.equal(result.status,status==="throw"?"unavailable":status);
    const state=JSON.parse(localStorage.getItem(K.radar));assert.equal(state.subscriptions.length,1);assert.equal(state.pilot.events.length,0);
    assert.equal(ui.context.calls.filter(x=>x==="search").length,1);await ui.cleanup();
  });
  await check("Kontowechsel während Erstsuche installiert weder alten Feed noch alten Status",async()=>{
    const ui=await mount({held:true});let pending;await act(async()=>{pending=controller.fuegeRadarTextHinzu(query);await tick();});
    await ui.switchAccount();const before=localStorage.getItem(K.radar);await act(async()=>{ui.release();assert.equal((await pending).status,"forbidden");});
    assert.equal(localStorage.getItem(K.radar),before);assert.equal(controller.sichtbarerRadarState.subscriptions.length,0);await ui.cleanup();
  });
  await check("UI zeigt Suche und Leerfund; Doppelsubmit startet nur einmal und leert bestätigte Eingabe",async()=>{
    const ui=await mount({held:true,status:"insufficient_evidence"});await ui.radar();
    const input=ui.container.querySelector("#kd-radar-target-search");
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value").set.call(input,query);
      input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
    const form=input.closest("form");await act(async()=>{
      form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));
      form.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));await tick();});
    assert.match(ui.container.textContent,/Suche nach passenden Starts/);assert.equal(input.disabled,true);
    assert.equal(ui.context.calls.filter(x=>x==="search").length,1);
    await act(async()=>{ui.release();await tick();await tick();});await settle();
    assert.equal(input.value,"");assert.equal(input.disabled,false);assert.match(ui.container.textContent,/Ziel bleibt gespeichert.*Noch keinen passenden Starttermin/);
    assert.equal(controller.sichtbarerRadarState.subscriptions.length,1);await ui.cleanup();
  });
  await check("Zielentfernung während Erstsuche gewinnt gegen verspätetes Ergebnis",async()=>{
    const ui=await mount({held:true});let pending;await act(async()=>{pending=controller.fuegeRadarTextHinzu(query);await tick();});
    await act(async()=>{await controller.aendereRadar(controller.sichtbarerRadarState.subscriptions[0],"remove");});
    await act(async()=>{ui.release();await pending;});assert.equal(controller.sichtbarerRadarState.subscriptions.length,0);
    assert.equal(controller.radarPilotEvents.length,0);await ui.cleanup();
  });
  await check("TEXT-Antwortgrenzen binden Ziel, 4 Suchen und 20 Cent; Legacy bleibt 1/5",async()=>{
    const session=authSession();let payload=textResponse({...emptyFeed(),subscriptions:[subscription],events:[event]});let calls=0;
    const service=createRadarWebsearchService({config,auth:{getSnapshot:()=>session},getAccount:()=>session.account,
      getAccessToken:async()=>"token",fetchImpl:async()=>{calls++;return response(payload);}});
    assert.equal((await service.checkNow(targetId,query)).status,"confirmed");
    for(const patch of [{searchRequests:5},{reservationUsdCent:21},{feed:{...payload.feed,subscriptions:[]}}]){
      const prior=payload;payload={...payload,...patch};assert.equal((await service.checkNow(targetId,query)).status,"unavailable");payload=prior;
    }
    const before=calls;assert.equal((await service.checkNow("text:0123456789abcdef",query)).status,"forbidden");
    assert.equal((await service.checkNow("imdb:tt0000001",null,{initial:true})).status,"forbidden");assert.equal(calls,before);
    assert.equal((await service.checkNow("imdb:tt0000001")).status,"unavailable");
    const {textResult,textDiagnostics,...legacy}=payload;payload=legacy;
    assert.equal((await service.checkNow("imdb:tt0000001")).status,"unavailable");
  });
  await check("Kontowechsel während Antwort-JSON wird nach Bodyread erneut abgefangen",async()=>{
    let session=authSession();const service=createRadarWebsearchService({config,auth:{getSnapshot:()=>session},getAccount:()=>session.account,
      getAccessToken:async()=>"token",fetchImpl:async()=>({ok:true,status:200,async json(){session=authSession(b);return textResponse({...emptyFeed(),subscriptions:[subscription]});}})});
    assert.equal((await service.checkNow(targetId,query,{initial:true})).status,"forbidden");
  });
  // Actual Function handler, internal auth/claim/upsert/finish wiring; own RPC mocks.
  const env={SUPABASE_URL:"https://mock.example",SUPABASE_ANON_KEY:"public-test",SUPABASE_SERVICE_ROLE_KEY:"service-test"};
  globalThis.Deno={env:{get:key=>env[key]}};
  let calls=[],claimed=true,authenticated=true,stored=false;
  const claim={claim:true,status:"claimed",accountId:a,targetId,targetText:query,targetType:"text",
    targetRowId:"c1000000-0000-4000-8000-000000000001",viennaDay:day,fenceToken:"c1000000-0000-4000-8000-000000000002"};
  globalThis.__radarClient=()=>({auth:{async getClaims(){calls.push("auth");return authenticated?{data:{claims:{sub:a,role:"authenticated"}}}:{error:new Error("auth")};}},
    async rpc(name,args){calls.push(name);
      if(name==="kd_radar_initial_claim"){assert.deepEqual(args,{p_account_id:a,p_target_key:targetId,p_target_text:query});return {data:claimed?claim:{claim:false,status:"no_change"}};}
      if(name==="kd_radar_websearch_prepare_text")return {data:{kind:"text",targetId,targetText:query,region:"AT",scopes:["cinema"]}};
      if(name==="kd_radar_daily_assert_lease")return {data:{ok:true}};
      if(name==="kd_radar_websearch_upsert_text_finding"){stored=true;return {data:{status:"confirmed"}};}
      if(name==="kd_radar_pilot_feed")return {data:{...emptyFeed(),subscriptions:[subscription],events:stored?[event]:[]}};
      if(name==="kd_radar_daily_finish"){assert.equal(args.p_fence_token,claim.fenceToken);return {data:{ok:true}};}
      throw new Error(`Unexpected own RPC: ${name}`);
    }});
  const adapter={async search(request){calls.push("provider");return parseAnthropicRadarWebsearchResponse({model:"claude-haiku-4-5",stop_reason:"end_turn",
    usage:{input_tokens:100,output_tokens:100,server_tool_use:{web_search_requests:1}},content:[
      {type:"server_tool_use",id:"tool",name:"web_search",input:{}},
      {type:"web_search_tool_result",tool_use_id:"tool",content:[{type:"web_search_result",url:"https://press.example/start"}]},
      {type:"text",text:JSON.stringify({status:"confirmed",candidates:[{title:event.title,category:"film",eventType:"kinostart_at",eventDate:day,region:"AT",evidence:{url:"https://press.example/start"}}]})},
    ]},request,{radarEnabled:true,radarProviderEnabled:true,radarSchedulerEnabled:false,providerAllowed:true,
      modelAlias:"klein",model:"claude-haiku-4-5",maxTokens:2400,taskCapUsdCent:20,searchFeeUsdCent:1,
      globalRequestCapUsdCent:500,timeoutMs:30_000,inputPriceUsdCentPerMtok:100,outputPriceUsdCentPerMtok:500,sourceRegistry:[]},instant).envelope;}};
  const handler=createRadarWebsearchHandler({adapter});
  const request=(body={targetId,targetText:query,initial:true})=>new Request("https://mock.example/functions/v1/radar-websearch-task",{method:"POST",headers:{Authorization:"Bearer mock-token","Content-Type":"application/json"},body:JSON.stringify(body)});
  await check("Function: JWT → Initialclaim → Provider → Lease → Persistenz → Feed → 144h-Finish",async()=>{
    const result=await (await handler(request())).json();assert.equal(result.status,"confirmed");assert.equal(result.feed.events.length,1);
    assert.deepEqual(calls,["auth","kd_radar_initial_claim","kd_radar_websearch_prepare_text","provider","kd_radar_daily_assert_lease","kd_radar_websearch_upsert_text_finding","kd_radar_pilot_feed","kd_radar_daily_finish"]);
  });
  await check("Function: ungültiges JWT, Legacy-initial und doppelter Claim stoppen vor Provider",async()=>{
    for(const state of ["auth","legacy","duplicate"]){calls=[];authenticated=state!=="auth";claimed=state!=="duplicate";
      await handler(request(state==="legacy"?{targetId:"imdb:tt0000001",initial:true}:undefined));assert.equal(calls.includes("provider"),false);
      if(state!=="duplicate")assert.equal(calls.includes("kd_radar_initial_claim"),false);
    }
  });
  await check("Function: fehlgeschlagener Initialprovider verbraucht den Claim mit demselben Finish ohne Retry",async()=>{
    calls=[];authenticated=true;claimed=true;
    const failing=createRadarWebsearchHandler({adapter:{async search(){calls.push("provider");throw new Error("synthetic provider failure");}}});
    const result=await (await failing(request())).json();assert.equal(result.status,"provider_error");
    assert.equal(calls.filter(name=>name==="provider").length,1);assert.equal(calls.at(-1),"kd_radar_daily_finish");
    assert.equal(calls.includes("kd_radar_websearch_upsert_text_finding"),false);
  });
} finally {setStorageDriver(null);dom.window.close();delete globalThis.__radarClient;delete globalThis.Deno;}
console.log(`\n${checks} initial Radar save/search/feed checks passed (mocks only).`);
