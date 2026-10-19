import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
globalThis.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
const {createRadarPilotService}=await import('./src/services/radarPilot.js');
const {createEmptyLocalRadar,createLocalTextRadarTargetId,decodeLocalRadar}=await import('./src/lib/localEventRadar.js');
const {K}=await import('./src/lib/storage.js');
const accountId=randomUUID(),workId=randomUUID(),startId=randomUUID();
const textTarget=createLocalTextRadarTargetId('Polarlicht-Reihe');
const events=[0,1].map(i=>({eventId:randomUUID(),eventVersionId:randomUUID(),targetId:`release:v1:${String(i+1).repeat(16)}`,sourceTargetKey:`text:${textTarget}`,title:i?'Polarlicht Original':'Polarlicht',targetType:'work',category:'film',eventType:'streamingstart_at',date:'2027-01-01',region:'AT',platform:'Beispiel+',lifecycleStatus:'scheduled',verificationStatus:'confirmed',evidence:[{sourceId:'web:press.example',sourceDomain:'press.example',url:`https://press.example/${i}`,retrievedAt:'2026-10-19T10:00:00Z'}]}));
const feed={format:'kd-radar-pilot-feed-v2',revision:1,checksum:'a'.repeat(64),reconciledAt:'2026-10-19T10:00:00Z',subscriptions:[{targetId:textTarget,targetType:'text',title:'Polarlicht-Reihe',scope:'all',region:'AT',status:'active',updatedAt:'2026-10-19T10:00:00Z'}],events,receipts:[],operationAcks:[],personResults:[],radarReview:true,radarSearch:true};
const identities={format:'kd-radar-identities-v1',accountId,enabled:true,rows:events.map(e=>({eventId:e.eventId,eventVersionId:e.eventVersionId,workId,startId,title:'Polarlicht',episodeNumber:null,editionKey:'original',licenseKey:'subscription'})),history:events.map(e=>({observationId:randomUUID(),eventId:e.eventId,eventVersionId:e.eventVersionId,startId,date:e.date,title:e.title,sourceUrl:e.evidence[0].url,sourceDomain:'press.example',checkedAt:'2026-10-19T10:00:00Z',sourceClaim:e.date}))};
const envelope={format:'kd-radar-stable-feed-v1',feed,identities};
function harness(handler){
 let account={id:accountId},session={mode:'account',state:'ready',account};const disk=new Map(),calls=[];let generation=1,commits=0;
 const service=createRadarPilotService({config:{radarPilotClientEnabled:true,radarStableIdentityClientEnabled:true,supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'public-test'},auth:{getSnapshot:()=>session},getAccount:()=>account,getAccessToken:async()=> 'test-session',isTokenCurrent:()=>true,captureContext:()=>{const g=generation;return {name:'account',owner:`account:${account.id}`,generation:g,isCurrent:()=>g===generation,get:async k=>disk.has(k)?{value:disk.get(k)}:null,set:async(k,v)=>{if(g!==generation)throw new Error('stale');disk.set(k,v);}};},fetchImpl:async(url,options)=>{const name=url.split('/').at(-1);calls.push(name);return handler(name,options,h);}});
 const h={service,disk,calls,switchAccount(){account={id:randomUUID()};session={mode:'account',state:'ready',account};generation++;},sync:()=>service.sync({state:createEmptyLocalRadar({authority:'account-cache'}),commit:()=>{commits++;return true;}}),commits:()=>commits};return h;
}
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let checks=0;const check=async(name,fn)=>{await fn();checks++;console.log('✓ '+name);};
await check('Versionierter Feed speichert Metadaten separat; alter Radar-Cache bleibt lesbar',async()=>{
 const h=harness(()=>response(envelope));const r=await h.sync();assert.equal(r.status,'ready',JSON.stringify(r));
 assert.deepEqual(r.identityProjection,identities);assert.deepEqual(await h.service.loadIdentities(),identities);
 const raw=h.disk.get(K.radar);assert.equal(raw.includes('identityProjection'),false);assert.equal(decodeLocalRadar(raw,{authority:'account-cache'}).ok,true);
});
await check('Nur ein belegter 404 führt genau einmal auf den alten Feed zurück',async()=>{
 const h=harness(name=>name==='kd_radar_pilot_feed_stable_v1'?response({code:'PGRST202'},404):response(feed));
 assert.equal((await h.sync()).status,'ready');assert.deepEqual(h.calls,['kd_radar_pilot_feed_stable_v1','kd_radar_pilot_feed_search_access']);assert.equal(h.disk.has(K.radarIdentities),false);
});
await check('Auth-, Server- und Netzfehler erzeugen keinen versteckten Wiederholungsrequest',async()=>{
 for(const type of ['auth','server','network']){
  const h=harness(()=>{if(type==='network')throw new Error('offline');return response({},type==='auth'?401:503);});
  const r=await h.sync();assert.notEqual(r.status,'ready');assert.equal(h.calls.length,1);assert.equal(h.disk.size,0);
 }
});
await check('Fremdes Konto, neue unbekannte Version und zusätzliche Envelope-Felder blockieren vor jedem Cachewrite',async()=>{
 for(const invalid of [{...envelope,identities:{...identities,accountId:randomUUID()}},{...envelope,identities:{...identities,rows:[{...identities.rows[0],eventVersionId:randomUUID()}]}},{...envelope,extra:true}]){
  const h=harness(()=>response(invalid));const r=await h.sync();assert.equal(r.reason,'pilot-identity-feed-invalid');assert.equal(h.disk.size,0);assert.equal(h.commits(),0);
 }
});
await check('Kontowechsel während des Feeds verändert weder alten noch neuen Cache',async()=>{
 const h=harness((name,options,h)=>{h.switchAccount();return response(envelope);});
 assert.equal((await h.sync()).status,'context-changed');assert.equal(h.disk.size,0);assert.equal(h.commits(),0);
});
await check('Offline-Cache lehnt die Metadaten eines anderen Kontos ab',async()=>{
 const h=harness(()=>response(envelope));h.disk.set(K.radarIdentities,JSON.stringify(identities));assert.deepEqual(await h.service.loadIdentities(),identities);
 h.switchAccount();assert.equal(await h.service.loadIdentities(),null);
});
await check('Server-Rollback entfernt die aktive Projektion auch aus einem bestehenden Offline-Cache',async()=>{
 const disabled={...identities,enabled:false,rows:[],history:[]};const h=harness(()=>response({...envelope,identities:disabled}));h.disk.set(K.radarIdentities,JSON.stringify(identities));
 assert.equal((await h.sync()).status,'ready');assert.equal((await h.service.loadIdentities()).enabled,false);
});
console.log(`${checks} Radar-Identitäts-Clientprüfungen bestanden.`);
