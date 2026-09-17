import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium,webkit} from '@playwright/test';
const require=createRequire(import.meta.url);let esbuild;try{esbuild=require('esbuild')}catch{esbuild=createRequire(import.meta.resolve('vite'))('esbuild')}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'review49-p07-browser-'));
await esbuild.build({entryPoints:[new URL('./review49_p07_browser_fixture.jsx',import.meta.url).pathname],bundle:true,format:'iife',outfile:path.join(tmp,'bundle.js'),jsx:'automatic',loader:{'.woff2':'file','.woff':'file','.svg':'file','.png':'file'},define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'},logLevel:'silent'});
let checks=0;
try{for(const [engine,type] of [['Chromium',chromium],['WebKit',webkit]]){
 const browser=await type.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];let externalAttempts=0;
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='fixture.local'){externalAttempts++;return route.fulfill({contentType:'text/html',body:'Intercepted synthetic child navigation; no external network'})}
 if(url.pathname==='/provider')return route.fulfill({contentType:'text/html',body:'Synthetic provider destination'});
 const file=path.join(tmp,path.basename(url.pathname));if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><button id="before">Vorher</button><div id="app" style="padding:12px;max-width:900px;margin:auto"></div><button id="after">Nachher</button><script src="/bundle.js"></script>'});
 return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'font/woff2',body:fs.existsSync(file)?fs.readFileSync(file):Buffer.from('local child link')});});
 await page.goto('http://fixture.local/');
 async function render(kind,options={}){const id=await page.evaluate(({kind,options})=>window.renderCase(kind,options),{kind,options});await page.locator(`[data-render-seq="${id}"]`).waitFor();if(options.legacy)await page.getByRole('button',{name:/^Alles/}).click();await page.getByRole('button',{name:/^Details zu/}).waitFor();}
 async function tabTo(locator){await page.locator('#before').focus();for(let i=0;i<90;i++){await page.keyboard.press(engine==='WebKit' && process.platform==='darwin'?'Alt+Tab':'Tab');if(await locator.evaluate(el=>el===document.activeElement))return}throw new Error('Disclosure/action not reached by native Tab')}
 async function expanded(button,value){assert.equal(await button.getAttribute('aria-expanded'),String(value));}
 async function disclosure(kind,opts={}){
  await render(kind,opts);const button=page.getByRole('button',{name:kind==='kino'?'Details zu Kino Prüfwerk':'Details zu Streaming Prüfwerk',exact:true});
  await tabTo(button);await expanded(button,false);await page.keyboard.press('Enter');await expanded(button,true);assert.deepEqual(await page.evaluate(()=>window.calls),[]);
  if(kind==='streaming')assert.equal(await page.locator('[data-title-facts]').count(),1);
  else assert.equal(await page.getByRole('button',{name:'Eintrag erstellen',exact:true}).count(),1);
  await page.keyboard.press('Space');await expanded(button,false);await page.keyboard.press('Space');await expanded(button,true);
  assert.equal(await page.locator('button button, button a, a button').count(),0);
  const childLink=kind==='kino'?page.locator('.kd-kompakt-eintrag a').first():page.locator('.kd-streaming-neu-dienste a').first();
  await tabTo(childLink);
  const popupPromise=context.waitForEvent('page');await page.keyboard.press('Enter');const popup=await popupPromise;
  await popup.waitForLoadState('domcontentloaded');await popup.close();await expanded(button,true);

  if(kind==='kino'){
   if(opts.personal)assert.equal(await page.locator('[data-testid="kino-personal-ausserhalb-mediathek"]').count(),1);
   const pin=page.getByRole('button',{name:/18.09/});await tabTo(pin);await page.keyboard.press('Enter');await expanded(button,true);assert.deepEqual(await page.evaluate(()=>window.calls),['termin']);
  }else{
   const pin=page.getByRole('button',{name:/am Pinboard anpinnen/});await tabTo(pin);await page.keyboard.press('Enter');await expanded(button,true);
   const merk=page.getByRole('button',{name:'Auf die Merkliste',exact:true});await tabTo(merk);await page.keyboard.press('Space');await expanded(button,true);assert.deepEqual(await page.evaluate(()=>window.calls),['pin','merk']);
  }
  const create=page.getByRole('button',{name:opts.seen?'In Mediathek übernehmen':'Eintrag erstellen',exact:true});
  if(!opts.known){await tabTo(create);await page.keyboard.press('Enter');await expanded(button,true);assert.equal(await page.getByRole('button',{name:'Hinzufügen',exact:true}).count(),1);}
  if(kind==='streaming' && opts.known){const seen=page.getByRole('button',{name:'Als gesehen markieren',exact:true});await tabTo(seen);await page.keyboard.press('Space');await expanded(button,true);assert.equal((await page.evaluate(()=>window.fixtureState)).status[101].status,'gesehen');}
  checks++;
 }
 try{
  await disclosure('kino');await disclosure('kino',{personal:true});
  for(const view of ['all','new'])for(const options of [{},{seen:true},{known:true}])await disclosure('streaming',{view,...options});
  await disclosure('streaming',{legacy:true});
  for(const view of ['all','new']){
   await render('streaming',{view});const detail=page.getByRole('button',{name:'Details zu Streaming Prüfwerk'});await tabTo(detail);await page.keyboard.press('Enter');
   await page.getByRole('button',{name:'Eintrag erstellen',exact:true}).click();await page.getByRole('button',{name:'Hinzufügen',exact:true}).click();await page.locator('.kd-streaming-mediathek-link').waitFor();
   assert.equal(await page.getByRole('button',{name:'Eintrag erstellen',exact:true}).count(),0);
   await page.locator('#fixture-delete').click();await page.getByRole('button',{name:'Eintrag erstellen',exact:true}).waitFor();assert.equal(await page.locator('.kd-streaming-mediathek-link').count(),0);
   assert.equal((await page.evaluate(()=>window.fixtureState)).status[101].mediathek_id,'library-101');
   await page.getByRole('button',{name:'Als gesehen markieren',exact:true}).click();await page.getByRole('button',{name:'Ja, in die Mediathek',exact:true}).waitFor();
   await page.getByRole('button',{name:'Ja, in die Mediathek',exact:true}).click();await page.locator('.kd-streaming-mediathek-link').waitFor();assert.equal((await page.evaluate(()=>window.fixtureState)).status[101].status,'gesehen');
   await page.locator('#fixture-delete').click();await page.getByRole('button',{name:'In Mediathek übernehmen',exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.fixtureState)).status[101].status,'gesehen');checks++;
  }
  await render('streaming',{legacy:true,known:true,conflict:true,seen:true});await page.getByRole('button',{name:'Details zu Streaming Prüfwerk'}).click();assert.equal(await page.locator('.kd-streaming-mediathek-link').count(),0);await page.getByRole('button',{name:'In Mediathek übernehmen',exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.fixtureState)).status[101].historisch,true);checks++;
  await render('streaming',{masterPending:true,known:true,seen:true});await page.getByRole('button',{name:'Details zu Streaming Prüfwerk'}).click();assert.equal(await page.getByRole('button',{name:'Eintrag erstellen',exact:true}).count(),0);assert.deepEqual(await page.evaluate(()=>window.calls),[]);assert.equal((await page.evaluate(()=>window.fixtureState)).status[101].mediathek_id,'library-101');assert.equal((await page.evaluate(()=>window.fixtureState)).status[101].status,'gesehen');checks++;
  await render('streaming',{expired:true});await page.getByText('Verfügbarkeiten nicht mehr aktuell.',{exact:true}).waitFor();checks++;
  for(const kind of ['kino','streaming']){await render(kind,{focus:true});await expanded(page.getByRole('button',{name:/Details zu/}),true);checks++;}
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});for(const kind of ['kino','streaming']){await render(kind);await page.getByRole('button',{name:/Details zu/}).click();const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,rect:[...document.querySelectorAll('[aria-expanded]')].filter(x=>x.getAttribute('aria-label')?.startsWith('Details zu')).map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}))}));assert.ok(metrics.scroll<=metrics.width+1,`${engine} ${kind} ${width}: overflow ${metrics.scroll}`);assert.ok(metrics.rect[0].height>=44);checks++;}}
  assert.deepEqual(errors,[]);assert.equal(externalAttempts,2);console.log(`${engine}: native keyboard, creation/delete/recreate, legacy conflicts, source warning and 320/390/1280px passed`);
 }finally{await browser.close()}
}}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log(`${checks} browser scenarios passed; external requests 0`);
