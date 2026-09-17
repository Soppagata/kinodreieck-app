import { createRequire } from 'node:module';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium, webkit } = require('playwright');
const source = process.cwd();
const out = await mkdtemp('/private/tmp/review49-p05-layout-');
const styles = ['index.css', 'styles/design-foundation.css', 'styles/design-primary.css', 'styles/design-secondary.css', 'styles/design-shell.css', 'styles/rating-followup.css', 'styles/library-followup.css'];
await build({
  stdin: { contents: `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RadarSubscriptionPreview} from '${source}/src/components/RadarSubscriptionPreview.jsx';
import {EntdeckenTab} from '${source}/src/tabs/EntdeckenTab.jsx';
function Harness() { const [open,setOpen] = useState(false); return <><EntdeckenTab blogProps={{artikel:[],master:[]}} radarAvailable={true} radarState={{subscriptions:[],personSubscriptions:[],outbox:[]}} /><button id="open" onClick={()=>setOpen(true)}>Ins Radar</button>{open && <RadarSubscriptionPreview target={{targetId:'watchmode:12345',targetType:'work',targetStatus:'active',canonical:true,title:'Testfilm'}} radarState={{subscriptions:[]}} accountMode={true} config={{appEnvironment:'production'}} onClose={()=>{window.closeCount=(window.closeCount||0)+1;setOpen(false)}} onConfirm={async()=>true} />}</>; }
createRoot(document.getElementById('root')).render(<Harness/>);`, loader: 'jsx', resolveDir: source },
  loader: {'.css':'empty'},
  bundle: true, jsx: 'automatic', format: 'esm', platform: 'browser', outfile: `${out}/bundle.js`,
  define: {'import.meta.env':'{}', 'process.env.NODE_ENV':'"production"'},
});
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${styles.map(s=>`<link rel="stylesheet" href="/src/${s}">`).join('')}<div id="root"></div><script type="module" src="/bundle.js"></script>`;
const server = createServer(async(req,res)=>{try {
  if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end(html);return;}
  const name = req.url==='/bundle.js' ? `${out}/bundle.js` : `${source}${req.url}`;
  if(!name.startsWith(`${source}/src/`) && name!==`${out}/bundle.js`) {res.writeHead(404).end();return;}
  res.setHeader('Content-Type', name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'text/javascript');
  res.end(await readFile(name));
} catch {res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const results=[];
const measure = async page => page.evaluate(()=>{
  const layer=document.querySelector('.kd-entdecken-layer'), dialog=document.querySelector('.kd-radar-preview');
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
  const header=dialog.querySelector('header'), close=header.querySelector('button');
  return {layer:rect(layer), dialog:rect(dialog), header:rect(header), close:rect(close), kicker:rect(header.querySelector('span')), heading:rect(header.querySelector('h2')),
    layerPadding:getComputedStyle(layer).padding, alignItems:getComputedStyle(layer).alignItems, dialogPadding:getComputedStyle(dialog).padding,
    scrollTop:dialog.scrollTop, scrollHeight:dialog.scrollHeight, clientHeight:dialog.clientHeight, bodyPosition:getComputedStyle(document.body).position,
    activeElement:document.activeElement.className, windowScrollY:window.scrollY};
});
try {
 for(const [engine,type] of Object.entries({chromium,webkit})) {
  const browser=await type.launch({headless:true});
  try {for(const [width,height] of [[393,852],[520,800],[521,800],[600,800],[667,375],[760,800],[761,800],[1280,900]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:true});
    const blocked=[];
    await context.route('**/*',route=>route.request().url().startsWith(url)?route.continue():(blocked.push(route.request().url()),route.abort()));
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url); await page.locator('#open').click(); await page.locator('.kd-radar-preview').waitFor();
    await page.evaluate(async()=>{await document.fonts.ready; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const initial=await measure(page);
    await page.locator('.kd-radar-preview').evaluate(e=>{e.scrollTop=10000; e.scrollTop=0;});
    const resetToTop=await measure(page);
    if(width===600 || width===667) await page.screenshot({path:`${out}/${engine}-${width}x${height}.png`});
    const visibleCenter={x:initial.close.x+initial.close.width/2,y:Math.max(0,initial.close.y)+(Math.min(height,initial.close.bottom)-Math.max(0,initial.close.y))/2};
    await page.touchscreen.tap(visibleCenter.x,visibleCenter.y);
    await page.waitForFunction(()=>window.closeCount===1);
    const partialCloseTapWorks=await page.locator('.kd-radar-preview').count()===0;
    assert.equal(partialCloseTapWorks,true);
    // Keyboard and cancel use the original callbacks and scroll/focus logic.
    await page.locator('#open').click();await page.locator('.kd-radar-preview').waitFor();
    await page.keyboard.press('Escape');await page.waitForFunction(()=>window.closeCount===2);
    await page.locator('#open').click();await page.locator('.kd-radar-preview').waitFor();
    await page.getByRole('button',{name:'Abbrechen',exact:true}).tap();await page.waitForFunction(()=>window.closeCount===3);
    for(const snapshot of [initial,resetToTop])for(const key of ['dialog','header','close','kicker','heading']){
      assert.ok(snapshot[key].y>=0,`${engine} ${width}: ${key} top`);
      assert.ok(snapshot[key].bottom<=height+0.5,`${engine} ${width}: ${key} bottom`);
    }
    assert.equal(initial.close.height,44);assert.equal(initial.scrollTop,0);
    assert.equal(resetToTop.dialog.y,initial.dialog.y);
    if(width<=760)assert.equal(initial.dialog.y,0);
    else assert.ok(initial.dialog.y>0 && initial.dialog.bottom<height);
    // Original manager exception stays later and more specific in the cascade.
    await page.getByRole('button',{name:'Entdecken verwalten',exact:true}).click();
    const manager=await page.locator('.kd-entdecken-manage').boundingBox();
    const managerPadding=await page.locator('.kd-entdecken-manage-layer').evaluate(e=>getComputedStyle(e).paddingTop);
    if(width<=760){assert.equal(manager.y,24);assert.equal(managerPadding,'24px');assert.ok(Math.abs(manager.y+manager.height-height)<0.5);}
    await page.keyboard.press('Escape');assert.equal(await page.locator('.kd-entdecken-manage').count(),0);
    assert.equal(errors.length,0); assert.equal(blocked.length,0);
    results.push({engine,viewport:{width,height},initial,resetToTop,manager,managerPadding});
    console.log(`PASS E12-001 ${engine} ${width}x${height}: full close/header, touch/cancel/Escape, manager exception`);
    await context.close();
  }} finally {await browser.close();}
 }
 await writeFile(`${out}/results.json`,JSON.stringify({source,base_sha:'84cde78b18bc2ba060f348613ba4304668901ffc',method:'Original React component and all seven app CSS files; isolated local harness, no backend',results},null,2)+'\n');
} finally {await new Promise(resolve=>server.close(resolve));await rm(out,{recursive:true,force:true});}
