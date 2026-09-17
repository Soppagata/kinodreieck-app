import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium,webkit} from '@playwright/test';
const require=createRequire(import.meta.url);let esbuild;try{esbuild=require('esbuild')}catch{esbuild=createRequire(import.meta.resolve('vite'))('esbuild')}
const app=fs.readFileSync(new URL('./src/App.jsx',import.meta.url),'utf8');
function section(start,end){const a=app.indexOf(start),b=app.indexOf(end,a);assert(a>=0&&b>a);return app.slice(a,b)}
const loader=section('  const ladeStreamingDateien = useCallback','  ladeStreamingDateienRef.current =');
const navigation=section('  const oeffneGlobalenTreffer = useCallback','  const toggleGlobalesMenu =');
const pinNavigation=section('            onSpringeZuKino={(eintrag) => {','            /* Dashboard-Datenquellen').trim().replace(/^onSpringeZuKino=\{/,'').replace(/\}$/,'');
const consumed=app.match(/fokusTreffer=\{kinoFokus\} onFokusVerbraucht=\{(\(\) => setKinoFokus\(null\))\}/)?.[1];assert(consumed);
const names=['snapshotFreigabe','snapshotFreigabeRef','streamingKnownZurueckgestelltRef','betriebsartGen','streamingBekanntLaufRef','streamingEntdeckenLaufRef','streamingRohRef','streamingGeladen','entdeckenGeladen','sichtbareAuswahl','sichtbareAuswahlGeladen','master','masterRef','EINZELDATEI_BUILD','catalogService','reportError','resolveError','uebernehmeVollkatalog','ERROR_CODES','ERROR_SCOPE','errorText','streamingPayloadMitMetadaten','zeitpunkt','setStreamingBekannt','setStreamingEntdecken','setStreamingInfo','setZeigeAlles','setExpandedId','setKinoFokus','navigiere','setGlobaleSuchantwort','bestaetigeGlobalenAuswahlSprung','springeZuStreaming','springeZuArtikel','springeZuFilm'];
// Verbatim App loader/navigation callbacks, mounted with React state and mocked boundaries.
// No reimplemented loader, destination mapping, or success-consumption logic in this fixture.
const contracts=`import {useCallback} from 'react'; export function useAppContracts({${names.join(',')}}){${loader}\n${navigation}\n const onSpringeZuKino=${pinNavigation};return {ladeStreamingDateien,oeffneGlobalenTreffer,onSpringeZuKino,onFokusVerbraucht:${consumed}}}`;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'review49-p10b-'));
await esbuild.build({entryPoints:[new URL('./review49_p10b_browser_fixture.jsx',import.meta.url).pathname],bundle:true,format:'iife',outfile:path.join(tmp,'bundle.js'),jsx:'automatic',loader:{'.woff2':'file'},define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'},logLevel:'silent',plugins:[{name:'actual-app-contracts',setup(build){build.onResolve({filter:/^app-contracts$/},()=>({path:'app-contracts',namespace:'actual'}));build.onLoad({filter:/.*/,namespace:'actual'},()=>({contents:contracts,resolveDir:process.cwd(),loader:'js'}))}}]});
let checks=0;
try{for(const [engine,type] of [['Chromium',chromium],['WebKit',webkit]]){
 const browser=await type.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];let outside=0;
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{const Original=Date;const now=new Original('2026-09-17T12:00:00Z').getTime();window.Date=class extends Original{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.local'){outside++;return route.abort()}
 const file=path.join(tmp,path.basename(u.pathname));return route.fulfill({contentType:u.pathname==='/'?'text/html':u.pathname.endsWith('.css')?'text/css':'text/javascript',body:u.pathname==='/'?'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><div id="app"></div><script src="/bundle.js"></script>':fs.readFileSync(file)})});
 try{
 await page.goto('http://fixture.local/');
 async function reset(kind,options={}){const id=await page.evaluate(({kind,options})=>window.reset(kind,options),{kind,options});if(kind!=='save')await page.locator(`[data-generation="${id}"][data-ready="true"]`).waitFor();else await page.getByRole('button',{name:'Speichern',exact:true}).waitFor();}
 async function save(){await reset('save');await page.getByRole('button',{name:'Speichern',exact:true}).click();await page.waitForFunction(()=>window.pinApi.entdeckenPins.length===1);const saved=await page.evaluate(()=>window.saved());await page.evaluate(()=>window.unmount());await page.locator('#app').filter({hasText:'Speichern'}).waitFor({state:'hidden'});return saved;}
 async function settle(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))))}
 const pending=page.locator('[data-tour="pinboard"] [role="status"]');
 for(const mode of ['success','missing','failure','ambiguous']){
  const saved=await save();await reset('restore',{[mode]:true});
  await pending.getByText('Gespeichert · Abgleich ausstehend',{exact:true}).waitFor();
  assert.match(await pending.textContent(),/Verzögertes Prüfwerk/);assert.doesNotMatch(await page.locator('[data-tour="pinboard"]').textContent(),/Noch leer/);
  await page.waitForFunction(()=>typeof window.releaseCatalog==='function'&&window.loads.includes('streamingEntdecken'));
  assert.deepEqual(await page.evaluate(()=>window.loads),['streamingBekannt','streamingEntdecken']);
  await page.evaluate(()=>window.releaseCatalog());await settle();
  if(mode==='success'){
   const pin=page.locator('button.kd-pinboard-titel');await pin.waitFor();assert.match(await pin.textContent(),/Verzögertes Prüfwerk/);await pin.click();
   assert.deepEqual(await page.evaluate(()=>window.streamingDestination),{art:'entdecken',ref:901,titel:'Verzögertes Prüfwerk'});
  }else{
   await pending.waitFor();assert.equal(await page.locator('button.kd-pinboard-titel').count(),0);
   for(let i=0;i<4;i++){await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.refresh()});await settle()}
   assert.deepEqual(await page.evaluate(()=>window.loads),['streamingBekannt','streamingEntdecken']);
  }
  assert.equal(await page.evaluate(()=>window.saved()),saved);assert.deepEqual(await page.evaluate(()=>window.writes),[]);checks++;
 }
 for(const options of [{},{known:true},{mustwatch:true},{foreignMustwatch:true},{cinemaPin:true},{cinemaTitle:true}]){
  if(options.known){await save();await reset('restore',options)}else await reset('start',options);
  await settle();assert.deepEqual(await page.evaluate(()=>window.loads),['streamingBekannt']);
  if(options.known||options.mustwatch||options.cinemaTitle)assert.equal(await page.locator('button.kd-pinboard-titel').count(),1);
  if(options.foreignMustwatch)assert.doesNotMatch(await page.locator('[data-tour="pinboard"]').textContent(),/Persönliches Prüfwerk/);
  checks++;
 }
 async function focusResult({matched=false,personal=false}={}){
  const key=matched?'film:library-1':'programm:800001';
  await page.waitForFunction(key=>document.activeElement?.dataset.kinoSuchtreffer===key,key);
  assert.equal(await page.locator(`[data-kino-suchtreffer="${key}"]`).count(),1);
  await page.waitForFunction(()=>window.state.kinoFokus===null);
  assert.deepEqual(await page.evaluate(()=>window.scrolls),[key]);assert.equal(await page.evaluate(()=>window.consumed),1);
  if(!matched){const detail=page.getByRole('button',{name:'Details zu Kino Prüfwerk',exact:true});assert.equal(await detail.getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('[data-testid="kino-personal-ausserhalb-mediathek"]').count(),personal?1:0);
   await detail.focus();await page.keyboard.press('Space');assert.equal(await detail.getAttribute('aria-expanded'),'false');await page.keyboard.press('Enter');assert.equal(await detail.getAttribute('aria-expanded'),'true');
  }else{assert.equal(await page.evaluate(()=>window.state.expandedId),'klibrary-1');assert.equal(await page.locator('.kd-kino-ticket-termine').count(),1)}
 }
 for(const personal of [false,true])for(const path of ['mount','finder-mounted','finder-tabchange','pin','title-pin']){
  const options={personal,initialKino:path==='mount'||path==='finder-mounted',focusMount:path==='mount',cinemaPin:path==='pin',cinemaTitle:path==='title-pin'};
  await reset('start',options);
  if(path.startsWith('finder'))await page.locator('#finder').click();
  if(path==='pin'){await page.locator('button.kd-pinboard-kino').click()}
  if(path==='title-pin'){await page.locator('button.kd-pinboard-titel').click()}
  await focusResult({personal});checks++;
 }
 for(const path of ['finder','pin']){await reset('start',{matched:true,cinemaPin:path==='pin',personal:true});await page.locator(path==='pin'?'button.kd-pinboard-kino':'#finder').click();await focusResult({matched:true});checks++}
 await reset('start',{initialKino:true,focusMount:true,delayedProgram:true,personal:true});await settle();
 assert.equal(await page.evaluate(()=>window.consumed),0);assert.notEqual(await page.evaluate(()=>window.state.kinoFokus),null);
 await page.evaluate(()=>window.deliverProgram());await focusResult({personal:true});checks++;
 await page.evaluate(()=>window.missingFocus());await settle();for(let i=0;i<3;i++){await page.evaluate(()=>window.refresh());await settle()}
 assert.equal(await page.evaluate(()=>window.consumed),1);assert.equal(await page.evaluate(()=>window.state.kinoFokus.ref),'missing');assert.deepEqual(await page.evaluate(()=>window.scrolls),['programm:800001']);checks++;
 assert.deepEqual(errors,[]);assert.equal(outside,0);console.log(`${engine}: pending pins, actual App loader/navigation, cinema focus and native disclosures passed`);
 }finally{await browser.close()}
}}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log(`${checks} mounted browser scenarios passed; external requests 0`);
