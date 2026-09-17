import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {build} = require('esbuild');
const {JSDOM} = require('jsdom');
const source=process.cwd();
const bundled=await build({stdin:{contents:`
export {useEntdeckenRadarController} from './src/controllers/useEntdeckenRadarController.js';
export {EntdeckenTab} from './src/tabs/EntdeckenTab.jsx';
export {createRadarPilotService} from './src/services/radarPilot.js';
export {setStorageDriver,captureStorageContext,K} from './src/lib/storage.js';
export {validateLocalRadarState,queueAccountPersonRadarChange} from './src/lib/localEventRadar.js';
export {validateRadarPilotFeed} from './src/lib/radarPilotContracts.js';
export {PERSON_RADAR_CATALOG,findPersonRadarCatalogIdentity} from './src/lib/personRadarCatalog.js';
`,resolveDir:source,loader:'js'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',
external:['react','react-dom','react/jsx-runtime'],loader:{'.css':'empty'},logLevel:'silent'});
const module={exports:{}};
new Function('require','module','exports',bundled.outputFiles[0].text)(require,module,module.exports);
const {useEntdeckenRadarController,EntdeckenTab,createRadarPilotService,setStorageDriver,captureStorageContext,K,
validateLocalRadarState,queueAccountPersonRadarChange,validateRadarPilotFeed,PERSON_RADAR_CATALOG,findPersonRadarCatalogIdentity}=module.exports;
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
for(const name of ['window','document','navigator','localStorage','HTMLElement','HTMLInputElement','Node','Event','requestAnimationFrame','cancelAnimationFrame'])
 Object.defineProperty(globalThis,name,{value:typeof dom.window[name]==='function' && name.includes('AnimationFrame')?dom.window[name].bind(dom.window):dom.window[name],configurable:true,writable:true});
dom.window.scrollTo=()=>{}; // jsdom lacks scrolling; unrelated dialog cleanup only.
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.fetch=()=>{throw new Error('NETWORK FORBIDDEN');};
const {act,createElement:h}=require('react');
const {createRoot}=require('react-dom/client');
const tick=()=>new Promise(r=>setTimeout(r,0));
const settle=()=>act(async()=>{await tick();await tick();});
const accountId='a1000000-0000-4000-8000-000000000001';
const instant='2026-09-16T10:00:00.000Z';
const subscription={targetId:'person:wikidata:Q42869:actor',targetType:'person',title:'Nicolas Cage',region:'AT',scope:'all',status:'active',updatedAt:instant,personExternalId:'wikidata:Q42869',personRole:'actor'};
assert.equal(PERSON_RADAR_CATALOG.length,0);
const setErr=()=>{};
for(const mode of ['active','paused','rejected','sync-failure','storage-failure','context-change']){
 localStorage.clear();
 let session={mode:'account',state:'ready',account:{id:accountId},capabilities:{personalAi:true}};
 const feed={format:'kd-radar-pilot-feed-v2',revision:1,checksum:'a'.repeat(64),reconciledAt:instant,
  subscriptions:[{...subscription,status:mode==='paused'?'paused':'active'}],events:[],receipts:[],operationAcks:[],radarReview:true,radarSearch:true,personResults:[]};
 const calls=[],writes=[],results=[];let failureArmed=false,controller;
 setStorageDriver({name:'validator-mock',owner:`account:${accountId}`,
  async get(key){const value=localStorage.getItem(key);return value===null?null:{key,value};},
  async set(key,value){if(failureArmed && mode==='storage-failure')throw Error('mock disk error');writes.push(JSON.parse(value));localStorage.setItem(key,value);return {key,value};}});
 const pilot=createRadarPilotService({config:{radarPilotClientEnabled:true,supabaseUrl:'https://mock.example',supabasePublishableKey:'public-mock'},
  auth:{getSnapshot:()=>session},getAccount:()=>session.account,getAccessToken:async()=>{
    if(failureArmed && mode==='context-change')session={...session,account:{id:'a1000000-0000-4000-8000-000000000099'}};
    return 'mock-token';},isTokenCurrent:()=>true,captureContext:captureStorageContext,
  fetchImpl:async(url,options)=>{const rpc=url.split('/').at(-1),body=JSON.parse(options.body);calls.push({rpc,body});
    if(failureArmed && mode==='sync-failure')return new Response('{}',{status:500});
    if(rpc==='kd_radar_pilot_feed_search_access')return new Response(JSON.stringify(feed));
    assert.equal(rpc,'kd_radar_pilot_set_subscription');
    assert.equal(body.p_status,'removed');assert.equal(body.p_target_key,subscription.targetId);
    assert.equal(body.p_person_external_id,subscription.personExternalId);assert.equal(body.p_person_role,'actor');
    if(mode==='rejected')return new Response(JSON.stringify({code:'42501',message:'radar_pilot_forbidden'}),{status:403});
    feed.subscriptions=[];feed.revision=2;feed.checksum='b'.repeat(64);
    return new Response(JSON.stringify({operationId:body.p_operation_id,targetId:body.p_target_key,status:'removed',revision:2,checksum:feed.checksum}));
  }});
 function Harness(){
  controller=useEntdeckenRadarController({session,remoteKontoAktiv:true,bootDone:true,master:[],streamingKnown:null,streamingDiscover:null,setErr,radarPilotEnabled:true,radarPilotAdapter:pilot});
  return h(EntdeckenTab,{datenKontextKey:session.account.id,radarState:controller.sichtbarerRadarState,accountMode:true,radarAvailable:true,
    onPersonRadarChange:async(...args)=>{const result=await controller.aenderePersonRadar(...args);results.push(result);return result;},blogProps:{artikel:[],master:[]}});
 }
 const container=document.createElement('div');document.body.append(container);let root=createRoot(container);
 try{
  await act(async()=>{root.render(h(Harness));await tick();});await settle();
  assert.equal(controller.sichtbarerRadarState.personSubscriptions.length,1);
  assert.equal(validateLocalRadarState(controller.sichtbarerRadarState).ok,true);
  const before=calls.length;
  const invalid=[{personExternalId:'wikidata:Q123',name:'Unknown',role:'actor'},
    {personExternalId:subscription.personExternalId,name:'Foreign name',role:'actor'},
    {personExternalId:subscription.personExternalId,name:subscription.title,role:'director'}];
  for(const identity of invalid){let result;await act(async()=>{result=await controller.aenderePersonRadar(identity,'remove');});assert.equal(result.status,'unresolved');}
  assert.equal(calls.length,before);
  await act(async()=>container.querySelector('[aria-label="Entdecken verwalten"]').click());
  const remove=[...document.querySelectorAll('button')].find(x=>x.textContent==='Aus dem Radar entfernen');assert.ok(remove);
  failureArmed=true;
  await act(async()=>{remove.click();await tick();});await settle();
  const mutations=calls.filter(c=>c.rpc==='kd_radar_pilot_set_subscription');
  if(['active','paused'].includes(mode)){
    assert.deepEqual(results,[{status:'removed',writes:1}]);assert.equal(mutations.length,1);
    const queued=writes.flatMap(s=>s.outbox).filter(o=>o.action==='remove');
    assert.equal(new Set(queued.map(o=>o.operationId)).size,1);assert.equal(queued[0].personExternalId,subscription.personExternalId);
    assert.equal(controller.sichtbarerRadarState.personSubscriptions.length,0);
    assert.ok(!document.querySelector('.kd-entdecken-manage').textContent.includes('Nicolas Cage'));
    await act(async()=>root.unmount());root=createRoot(container);await act(async()=>{root.render(h(Harness));await tick();});await settle();
    assert.equal(controller.sichtbarerRadarState.personSubscriptions.length,0);
  }else{
    assert.notEqual(results[0].status,'removed');assert.ok(document.querySelector('[role="alert"]')?.textContent);
    assert.equal(mutations.length,mode==='rejected'?1:0);
    assert.equal(feed.subscriptions.length,1);
  }
  console.log(`PASS E08-003 ${mode}: actual controller/dialog/storage/outbox/service`);
 }finally{await act(async()=>root.unmount());container.remove();}
}
dom.window.close();
