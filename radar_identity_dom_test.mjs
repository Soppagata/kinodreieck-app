import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build,stop} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createEmptyLocalRadar,createLocalTextRadarTargetId,reconcileAccountRadarPilotFeed} from './src/lib/localEventRadar.js';
import {renderRadarIdentityReview} from './tools/radar-identity-preview.mjs';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://test.kinodreieck.at/'});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','Element','Event','MouseEvent','Node','getComputedStyle','localStorage'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true,writable:true});
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);globalThis.cancelAnimationFrame=clearTimeout;globalThis.IS_REACT_ACT_ENVIRONMENT=true;dom.window.scrollTo=()=>{};
mkdirSync('.tmp',{recursive:true});const folder=mkdtempSync(path.join(process.cwd(),'.tmp/radar-identity-dom-'));const outfile=path.join(folder,'bundle.mjs');
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('✓ '+name);};
try{
 await build({stdin:{contents:'export {default as React,act} from "react"; export {createRoot} from "react-dom/client"; export {EntdeckenTab} from "./src/tabs/EntdeckenTab.jsx";',sourcefile:'identity-dom-entry.jsx',resolveDir:process.cwd(),loader:'jsx'},bundle:true,outfile,platform:'node',format:'esm',jsx:'automatic',define:{'import.meta.env.BASE_URL':'"/"'},external:['react','react-dom','react/jsx-runtime','react-dom/client']});
 const {React,act,createRoot,EntdeckenTab}=await import(pathToFileURL(outfile).href);
 const accountId=randomUUID(),workId=randomUUID();const targetA=createLocalTextRadarTargetId('Streifenreihe'),targetB=createLocalTextRadarTargetId('Personenliste');
 const specs=[['kinostart_at','-','AT','2027-01-01',0,targetA],['streamingstart_at','Beispiel+','AT','2027-02-01',1,targetA],['streamingstart_at','Beispiel+','AT','2027-02-03',1,targetB],['streamingstart_at','Beispiel+','global','2027-02-03',2,targetB],['kinostart_at','-','AT','2027-03-01',3,targetA]];
 const starts=[randomUUID(),randomUUID(),randomUUID()];
 const events=specs.map(([eventType,platform,region,date,s,target],i)=>({eventId:randomUUID(),eventVersionId:randomUUID(),targetId:`release:v1:${String(i+1).repeat(16)}`,sourceTargetKey:`text:${target}`,title:i===4?'Ungeprüfte Fortsetzung':i===2?'Polarlicht Original':'Polarlicht',targetType:'work',category:'film',eventType,platform,region,date,lifecycleStatus:'scheduled',verificationStatus:'confirmed',evidence:[{sourceId:'web:press.example',sourceDomain:'press.example',url:`https://press.example/${i}`,retrievedAt:'2026-10-19T10:00:00Z'}]}));
 const identities={format:'kd-radar-identities-v1',accountId,enabled:true,rows:events.slice(0,4).map((e,i)=>({eventId:e.eventId,eventVersionId:e.eventVersionId,workId,startId:starts[specs[i][4]],title:'Polarlicht',episodeNumber:null,editionKey:'original',licenseKey:i===0?'cinema':'subscription'})),history:events.slice(0,4).map((e,i)=>({observationId:randomUUID(),eventId:e.eventId,eventVersionId:e.eventVersionId,startId:starts[specs[i][4]],date:e.date,title:e.title,sourceUrl:e.evidence[0].url,sourceDomain:'press.example',checkedAt:'2026-10-19T10:00:00Z',sourceClaim:e.date}))};
 const feed={format:'kd-radar-pilot-feed-v2',revision:1,checksum:'a'.repeat(64),reconciledAt:'2026-10-19T10:00:00Z',subscriptions:[[targetA,'Streifenreihe'],[targetB,'Personenliste']].map(([targetId,title])=>({targetId,title,targetType:'text',scope:'all',region:'AT',status:'active',updatedAt:'2026-10-19T10:00:00Z'})),events,receipts:[],operationAcks:[],personResults:[],radarReview:true,radarSearch:true};
 const result=reconcileAccountRadarPilotFeed(createEmptyLocalRadar({authority:'account-cache'}),feed);assert.equal(result.ok,true,JSON.stringify(result.errors));
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 await act(async()=>{root.render(React.createElement(EntdeckenTab,{radarState:result.state,radarAvailable:true,accountMode:true,radarPilotEvents:events,radarIdentityProjection:identities,master:[],selectedServices:[]}));});
 await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent.trim()==='Radar').click();});
 check('Echte Radar-Ansicht zeigt einen Werkblock und den offenen Originalfund separat',()=>{
  const cards=[...container.querySelectorAll('.kd-radar-neuigkeit')];assert.equal(cards.length,2);assert.equal(cards.filter(c=>c.querySelector('h4').textContent==='Polarlicht').length,1);
  assert.ok(container.textContent.includes('Zuordnung offen'));
 });
 check('Kino, Streaming und verschiedene Märkte bleiben sichtbare getrennte Starts',()=>{
  const rows=[...container.querySelectorAll('.kd-radar-start')];assert.equal(rows.length,3);
  assert.ok(rows.some(r=>r.textContent.includes('Kinostart')&&r.textContent.includes('Österreich')));
  assert.ok(rows.some(r=>r.textContent.includes('Streamingstart')&&r.textContent.includes('Beispiel+')&&r.textContent.includes('Österreich')));
  assert.ok(rows.some(r=>r.textContent.includes('Streamingstart')&&r.textContent.includes('Weltweit')));
 });
 check('Datumswiderspruch zeigt beide Termine und sämtliche Quellenstände',()=>{
  const conflict=container.querySelector('.kd-radar-date-conflict');assert.match(conflict.textContent,/01\.02\.2027|1\.2\.2027/);assert.match(conflict.textContent,/03\.02\.2027|3\.2\.2027/);
  assert.equal(container.querySelectorAll('.kd-radar-belege a').length,4);
 });
 check('Mehrere Suchziele bleiben in der Herkunft sichtbar',()=>{const card=[...container.querySelectorAll('.kd-radar-neuigkeit')].find(c=>c.querySelector('h4').textContent==='Polarlicht');assert.match(card.textContent,/Streifenreihe/);assert.match(card.textContent,/Personenliste/);});
 await act(async()=>root.unmount());container.remove();
 check('Private Vorschau escaped Quellentexte und enthält keinen Netzwerk-/Übernahmepfad',()=>{
  const f={finding_id:randomUUID(),event_version_id:randomUUID(),title:'<script>danger</script>',target_type:'work',event_type:'kinostart_at',event_date:'2027-01-01',platform:'-',region:'AT',season_number:null,source_url:'https://press.example/release',source_domain:'press.example',source_claim:'<img src=x onerror=alert(1)>'};
  const html=renderRadarIdentityReview({accountId,snapshot:[f],works:[],assignments:[{eventId:f.finding_id,workId:null,editionKey:null,licenseKey:null,reason:'Ungeklärt'}]}).html;
  assert.ok(html.includes('&lt;script&gt;danger'));assert.ok(html.includes('&lt;img'));assert.doesNotMatch(html,/fetch\(|XMLHttpRequest|\/rest\/v1|onerror=alert\(1\)>/);
 });
 console.log(`${checks} Radar-Identitäts-DOMprüfungen bestanden.`);
}finally{stop();rmSync(folder,{recursive:true,force:true});dom.window.close();}
