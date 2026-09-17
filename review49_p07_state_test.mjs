import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createStreamingPageController } from './src/controllers/useStreamingPageController.js';
import { normalizeStreamingPageResponse, isStreamingPageCacheFresh } from './src/lib/streamingPage.js';
import { gleicheMediathekStatusAb, mediathekIdVon, verknuepfeStreamingPageMitMediathek } from './src/lib/staffeln.js';
import { baueStreamingAnsichten } from './src/lib/katalog.js';
const tick = () => new Promise(r => setTimeout(r, 0));
const ctx = { enabled:true, accountKey:'account:a',services:['Netflix'],library:[],personal:{},revision:'0' };
const title = {watchmode_id:777,tmdb_id:88,imdb_id:'tt1234567',titel:'Werk',typ:'movie',jahr:2020,dienste:['Netflix']};
const page = (extras={}) => normalizeStreamingPageResponse({format:1,status:'ready',version:'v1',items:[title],counts:{all:1,new:0,library:0},total:1,nextCursor:null,complete:true,...extras});
let checks=0;
async function check(name, fn){await fn();console.log('✓ '+name);checks++;}
await check('E11-003: type/year/strong-ID/ambiguity reject both new and stored links independent of order',()=>{
 const good={...title,id:'good'};
 for(const candidates of [[{...good,typ:'serie'}],[{...good,jahr:2021}],[{...good,imdb_id:'tt7777777'}],[good,{...good,id:'other'}],[good,{...good,id:'conflict',typ:'serie'}]]) {
  for(const master of [candidates,[...candidates].reverse()]) {
   const views=baueStreamingAnsichten({entdecken:{stand:'B',katalog_stand:'B',titel:[title]},bekannt:{stand:'B',katalog_stand:'B',titel:[]}},master);
   assert.equal(views.bekannt.titel.length,0);
   const prior={777:{status:'gesehen',mediathek_id:master[0].id,historisch:'bleibt',gesehen_am:'2026-01-01'}};
   const next=gleicheMediathekStatusAb(prior,[title],master);
   assert.deepEqual(next[777],{status:'gesehen',historisch:'bleibt',gesehen_am:'2026-01-01'});
   assert.equal(mediathekIdVon(gleicheMediathekStatusAb({},[title],master)[777]),null);
   assert.equal(verknuepfeStreamingPageMitMediathek([{...title,library_id:master[0].id}],master)[0].library_id,undefined);
  }
 }
 assert.equal(mediathekIdVon(gleicheMediathekStatusAb({},[title],[good])[777]),'good');
 const outside={id:'outside',watchmode_id:888,titel:'Andere Seite',typ:'movie',jahr:2020};
 const prior={888:{status:'gesehen',mediathek_id:'outside',historisch:true}};
 assert.deepEqual(gleicheMediathekStatusAb(prior,[title],[good,outside])[888],prior[888]);
});
await check('E06-001: source expiry survives normalization/cache and null remains unbounded',()=>{
 const p=page({meta:{gueltig_bis:'2026-09-17T12:00:00Z'}}); const before=Date.parse('2026-09-17T11:59:00Z');
 assert.equal(p.sourceExpiresAt,'2026-09-17T12:00:00.000Z');
 assert.equal(isStreamingPageCacheFresh(p,before,before+59000),true);
 assert.equal(isStreamingPageCacheFresh(p,before,before+60000),false);
 assert.equal(isStreamingPageCacheFresh(page(),before,before+60000),true);
 assert.equal(page({newAnchors:[{id:'777',fensterBeginn:1,verbrauchtBis:2},{id:'777',fensterBeginn:3,verbrauchtBis:2},{id:'778',fensterBeginn:null,verbrauchtBis:2}]}).newAnchors.length,1);
});
await check('E06-001: open expiry, stale200, resume and valid next source without refresh loop',async()=>{
 let clock=1000000,reads=0,timer=null,next=page({sourceExpiresAt:new Date(clock+1000).toISOString()});
 const c=createStreamingPageController({now:()=>clock,setTimer:fn=>(timer=fn,1),clearTimer:()=>{timer=null},service:{loadPage:async()=>{reads++;return next;}}});
 c.setContext(ctx);c.setActive(true);c.query({view:'all'});await tick();
 assert.equal(c.getSnapshot().sourceExpired,false);assert.ok(timer);
 clock+=1001;const fire=timer;timer=null;fire();await tick();
 assert.equal(c.getSnapshot().status,'stale');assert.equal(c.getSnapshot().sourceExpired,true);assert.equal(reads,2);assert.equal(timer,null);
 await tick();assert.equal(reads,2);
 c.setActive(false);c.setActive(true);await tick();assert.equal(c.getSnapshot().sourceExpired,true);assert.equal(reads,3);
 next=page({version:'v2',sourceExpiresAt:new Date(clock+10000).toISOString()});
 c.setContext({...ctx,revision:'new'});await tick();
 assert.equal(c.getSnapshot().sourceExpired,false);assert.equal(c.getSnapshot().version,'v2');
 c.destroy();
 const start=createStreamingPageController({now:()=>clock,service:{loadPage:async()=>page({sourceExpiresAt:new Date(clock-1).toISOString()})}});
 start.setContext(ctx);start.setActive(true);start.query({view:'all'});await tick();
 assert.equal(start.getSnapshot().sourceExpired,true);start.destroy();
});
await check('E14-002: actual App refresh revision invalidates inactive fresh record once and fences old response',async()=>{
 let reads=0,resolveOld; const c=createStreamingPageController({service:{loadPage:()=>{reads++;return reads===2?new Promise(r=>resolveOld=r):Promise.resolve(page({version:`v${reads}`,items:[{...title,titel:`Titel ${reads}`}]}));}}});
 let revision=0;const apply=()=>c.setContext({...ctx,revision:String(revision)});
 apply();c.setActive(true);c.query({view:'all'});await tick();
 c.setActive(false);c.setActive(true);await tick();assert.equal(reads,1);
 const app=readFileSync(new URL('./src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/revision: `\$\{streamingKontextKey\}:\$\{storageOwnerKennung\(\)\}:\$\{streamingRefreshRevision\}`/);
 const raw=app.slice(app.indexOf('async () => {',app.indexOf('const refreshKatalog = useCallback')),app.indexOf('\n  }, [ladeProgrammDatei, ladeStreamingDateien]'))+'\n}';
 const ref=()=>({current:null});let legacyReads=0;
 const refresh=vm.runInNewContext(`(${raw})`,{setStreamingRefreshRevision:fn=>{revision=fn(revision);apply()},betriebsartGen:{current:0},streamingGeladen:ref(),entdeckenGeladen:ref(),streamingRohRef:ref(),streamingBekanntLaufRef:ref(),streamingEntdeckenLaufRef:ref(),ladeProgrammDatei:async()=>{},ladeStreamingDateien:async()=>{legacyReads++}});
 c.setActive(false);await refresh();apply();apply();assert.equal(reads,1);
 c.setActive(true);await tick();assert.equal(reads,2);
 await refresh();await tick();assert.equal(reads,3);assert.equal(c.getSnapshot().items[0].titel,'Titel 3');
 resolveOld(page({version:'late',items:[{...title,titel:'Alt'}]}));await tick();assert.equal(c.getSnapshot().version,'v3');
 assert.equal(legacyReads,2);c.destroy();
});
await check('E06-003: rejected account/epoch responses do not publish anchors',async()=>{
 let resolve;const accepted=[];const c=createStreamingPageController({service:{loadPage:()=>new Promise(r=>resolve=r)},onPageAccepted:(p,x)=>accepted.push([p,x])});
 c.setContext(ctx);c.setActive(true);c.query({view:'new'});await tick();const old=resolve;
 c.setContext({...ctx,accountKey:'account:b'});await tick();old(page({newAnchors:[{id:'777',fensterBeginn:1,verbrauchtBis:2}]}));await tick();assert.equal(accepted.length,0);c.destroy();
});
console.log(`${checks}/${checks} review49 P07 state checks passed`);
