import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalisiereWochenplan, neuerFolgenReminder, automatischeReminderRef, kinoPinTermin, findeKinoPinImKatalog } from './src/lib/wochenplan.js';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const source = resolve('.');
const out = mkdtempSync(join(tmpdir(), 'review49-p09-product-'));
const read = p => readFileSync(resolve(p), 'utf8');
const app = read('src/App.jsx');
const week = read('src/components/Wochenplan.jsx');
const start = read('src/tabs/StartTab.jsx');
process.env.TZ = 'Europe/Vienna';
let checks = 0;
const passed = label => { checks++; console.log(`PASS ${label}`); };
const syncPlugin = { name: 'local-sync', setup(b) {
  b.onLoad({ filter: /SyncStatusChip\.jsx$/ }, () => ({ contents: 'export function useSyncStatus(){ return {configured:false,pending:[],conflict:[],stale:[]}; }', loader: 'js' }));
} };
await build({ stdin: { contents: "export { StartTab } from './src/tabs/StartTab.jsx'; export { normalisiereProgramm } from './src/lib/programm.js';", resolveDir: source },
  bundle:true,platform:'node',format:'cjs',jsx:'automatic',outfile:join(out,'start.cjs'),packages:'external',
  plugins: [syncPlugin, {name:'single-react',setup(b) { b.onResolve({filter:/^react(?:\/.*)?$/}, a => ({path:require.resolve(a.path),external:true})); } }],
});
const { StartTab, normalisiereProgramm } = require(join(out, 'start.cjs'));
const RealDate = Date;
let clock;
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const expirationSource = app.match(/const pinAbgelaufen = \(pin, jetzt = new Date\(\)\) => \{[\s\S]*?\n  \};/)[0];
const pinAbgelaufen = vm.runInNewContext(expirationSource + '\npinAbgelaufen', { Date });
try {
  const rollover = ['2026-12-31T18:00:00+01:00','2027-01-01T16:00:00+01:00','2027-01-01T20:00:00+01:00','2027-01-02T16:00:00+01:00','2027-01-02T20:00:00+01:00','2027-01-03T20:00:00+01:00'];
  const run = (label, now, slots, expected, rawIso = false) => {
    clock = new RealDate(now).getTime();
    const program = normalisiereProgramm({erstellt:now,filme:slots.map((zeit,i) => ({film_at_id:'p09-'+i,titel:'Film '+i,jahr:2026,vorstellungen:[{kino:'Filmcasino',zeit,fassung:'OV',im_abo:true}]}))}, new Date());
    assert.equal(program.filme.length, slots.length, 'all survive real four-day program normalization');
    const pins = program.filme.map((p,i) => ({t:p.t,j:p.j,z:rawIso ? slots[i] + ' · Filmcasino' : p.z[0],seit:Date.now()}));
    assert.equal(pins.filter(p => !pinAbgelaufen(p,new Date())).length, slots.length, 'actual App expiration retains fixtures');
    const catalog = program.filme.map(p => ({titel:p.t,jahr:p.j,kinos:p.k,termine:p.z,programm_ref:p.film_at_id}));
    assert.ok(pins.every(p => findeKinoPinImKatalog(p,catalog)), 'all pass real catalog resolution');
    const html = renderToStaticMarkup(React.createElement(StartTab,{kinoPins:[...pins].reverse(),kinoMatches:{matched:[],rest:program.filme},programm:program,progStand:program.stand,wochenplan:{version:1,eintraege:[]}}));
    const dom = new JSDOM(html);
    assert.deepEqual([...dom.window.document.querySelectorAll('.kd-pinboard-kino-name')].map(e => e.firstChild.textContent),expected);
    assert.deepEqual(pins.map(p => p.t), slots.map((_,i) => 'Film '+i), 'sorting never mutates input');
    dom.window.close(); passed(label);
  };
  run('rollover six valid pins: Film 0..4; Film 5 only removed by five limit','2026-12-31T10:00:00+01:00',rollover,['Film 0','Film 1','Film 2','Film 3','Film 4']);
  run('rollover two valid pins','2026-12-31T10:00:00+01:00',rollover.slice(0,2),['Film 0','Film 1']);
  run('same-year ordering including hours','2026-12-20T10:00:00+01:00',['2026-12-22T20:00:00+01:00','2026-12-20T18:00:00+01:00','2026-12-20T16:00:00+01:00'],['Film 2','Film 1','Film 0']);
  run('raw ISO year before formatting','2026-12-31T10:00:00+01:00',rollover.slice(0,2),['Film 0','Film 1'],true);
  run('raw ISO preserves local event-hour order despite transport offsets','2026-12-31T10:00:00+01:00',['2026-12-31T19:00:00+01:00','2026-12-31T20:30:00+09:00'],['Film 0','Film 1'],true);
  const local = kinoPinTermin({z:'2027-01-01T20:30:00+01:00'});
  assert.equal(local.getFullYear(),2027); assert.equal(local.getHours(),20); assert.equal(local.getMinutes(),30);
  const explicit = kinoPinTermin({z:'31.12. 12:00',termin_iso:'2028-01-01T20:30:00+09:00'});
  assert.equal(explicit.getFullYear(),2028); assert.equal(explicit.getHours(),20);
  passed('ISO year and local clock semantics');
  // Exercise the exact nullable constructor boundary independently of the editor's earlier validation.
  const saveSource = week.match(/const speichere = async \(roh\) => \{[\s\S]*?\n  \};/)[0];
  for (const existing of [[],[neuerFolgenReminder({id:'kept',titel:'Bleibt',startdatum:'2026-12-31'})]]) {
    let writes = 0;
    const save = vm.runInNewContext(saveSource + '\nspeichere', {planSchreibtRef:{current:false},automatischeReminderRef,neuerFolgenReminder,normalisiereWochenplan,plan:{version:1,eintraege:existing},jetzt:new Date(),kinoKatalog:[],katalog:[],master:[],schreibePlan:() => {writes++;}});
    assert.equal(await save({titel:'   ',link_modus:'keiner'}),false); assert.equal(writes,0);
  }
  passed('null constructor rejected before object access for empty and nonempty plans');
} finally { global.Date = RealDate; }

const catalogExpr = start.match(/const kinoKatalog = useMemo\(\(\) => (\[[\s\S]*?\n  \]), \[kinoMatches\]\);/)[1];
const appCallback = app.match(/onSpringeZuKino=\{(\(eintrag\) => \{[\s\S]*?\n            \})\}/)[1];
const built = await build({stdin:{resolveDir:source,loader:'jsx',contents:`
 import React, {act,useState} from 'react';
 import {createRoot} from 'react-dom/client';
 import {StartTab} from './src/tabs/StartTab.jsx';
 import {KinoTab} from './src/tabs/KinoTab.jsx';
 import {baueKinoMatches} from './src/lib/libraryProjection.js';
 import {automatischeReminderRef,neuerFolgenReminder,datumLokal} from './src/lib/wochenplan.js';
 const now=new Date('2026-12-31T10:00:00+01:00');
 const film={id:'p09-film',film_at_id:987654,titel:'P09 Kinofilm',jahr:2026,typ:'film',quelle:'must_watch',genre:[],tags:[]};
 const prog={film_at_id:987654,t:film.titel,j:2026,k:['Apollo'],z:['31.12. 20:00 · Apollo']};
 const result=window.result={networkRequests:0};
 const root=createRoot(document.getElementById('root'));
 function Fixture({kind}) {
   const [added,setAdded]=useState(kind!=='late'); window.addToLibrary=()=>setAdded(true);
   const master=kind==='neutral'||kind==='missing'||!added?[]:[film];
   const programm={filme:kind==='missing'?[]:[prog],events:[],demnaechst:[]};
   const kinoMatches=baueKinoMatches(programm,master);
   const kinoKatalog=${catalogExpr};
   // Create once: late mapping must use the current projection, not saved film_ref.
   const [reminder]=useState(()=>{
     const draft={id:'p09-reminder',art:'kino',titel:film.titel,jahr:2026,plattform:'Apollo',startdatum:datumLokal(now),wochentage:[4],uhrzeit:'20:00'};
     const ref=kind==='detached'?null:kind==='manual'||kind==='missing'?{kino_programm_id:987654}:automatischeReminderRef(draft,{kinoKatalog,master},now);
     return neuerFolgenReminder({...draft,ref,link_modus:kind==='detached'?'keiner':kind==='manual'?'manuell':'auto'},now);
   });
   const [tab,navigiere]=useState('start');
   const [fokusTreffer,setKinoFokus]=useState(null);
   const [zeigeAlles,setZeigeAlles]=useState(false);
   const [expandedId,setExpandedId]=useState(null);
   result.expandedId=expandedId;result.reminder=reminder;
   const callback=${appCallback};
   if(tab==='start') return <StartTab wochenplan={{version:1,eintraege:kind==='pin'||kind==='suggestion'?[]:[reminder]}}
     onWochenplanAendern={()=>true} kinoMatches={kinoMatches} programm={programm} progStand={datumLokal(now)} master={master}
     kinoPins={kind==='pin'?[{t:film.titel,j:2026,z:prog.z[0]}]:[]}
     onSpringeZuKino={e=>{result.sent=e;callback(e);}}/>;
   result.fokus=fokusTreffer;
   return <KinoTab angemeldet programm={programm} progStand={datumLokal(now)} master={master} kinoMatches={kinoMatches} restSichtbar={kinoMatches.rest}
     zeitgrenze='14:00' saveZeitgrenze={()=>{}} zeigeAlles={zeigeAlles} setZeigeAlles={setZeigeAlles}
     expandedId={expandedId} setExpandedId={setExpandedId} updateFilm={()=>{}} addFilm={()=>{}} kinoGenreFacts={[]}
     fokusTreffer={fokusTreffer} onFokusVerbraucht={()=>{result.consumed++;}}/>;
 }
 window.api={act,mount:(kind)=>root.render(<Fixture key={kind} kind={kind}/>),unmount:()=>root.unmount()};
`},bundle:true,write:false,format:'iife',jsx:'automatic',target:'es2022',define:{'import.meta.env':'{}'},loader:{'.css':'empty'},plugins:[syncPlugin],logLevel:'silent'});
const dom = new JSDOM('<html><body><div id="root"></div></body></html>',{url:'http://isolated.test',runScripts:'dangerously',pretendToBeVisual:true});
const w = dom.window;
const WindowDate = w.Date;
w.Date = class extends WindowDate { constructor(...args) { super(...(args.length ? args : ['2026-12-31T10:00:00+01:00'])); } static now() {return new WindowDate('2026-12-31T10:00:00+01:00').getTime();} };
w.IS_REACT_ACT_ENVIRONMENT = true;
w.MessageChannel = class {port1={};port2={postMessage:()=>w.setTimeout(()=>this.port1.onmessage?.(),0)}};
w.fetch = async () => {w.result.networkRequests++;throw Error('network forbidden');};
w.HTMLElement.prototype.scrollIntoView = function(){w.result.scrolled.push(this.dataset.kinoSuchtreffer);};
w.eval(built.outputFiles[0].text);
try {
  for (const kind of ['auto','manual','late','neutral','missing','detached','pin','suggestion']) {
    w.result.scrolled=[];w.result.consumed=0;w.result.sent=null;
    await w.api.act(async()=>w.api.mount(kind));
    if (kind==='late') await w.api.act(async()=>w.addToLibrary());
    const button=[...w.document.querySelectorAll('.kd-wochenplan button')].find(e=>e.textContent===(kind==='pin'?'Termin ansehen':kind==='suggestion'?'Termine ansehen':'Eintrag ansehen'));
    if (kind==='missing'||kind==='detached') {
      assert.equal(button,undefined); assert.equal(w.result.sent,null); passed(`${kind}: no misleading personal open action`); continue;
    }
    assert.ok(button, `${kind}: action reachable`);
    await w.api.act(async()=>button.click());
    await w.api.act(async()=>new Promise(r=>w.setTimeout(r,90)));
    const anchor=kind==='neutral'?'programm:987654':'film:p09-film';
    assert.deepEqual([...w.result.scrolled],[anchor], `${kind}: actual card scrolled`);
    assert.equal(w.document.activeElement?.dataset.kinoSuchtreffer,anchor, `${kind}: actual card focused`);
    assert.equal(w.result.consumed,1);
    if(kind!=='neutral') { assert.equal(w.result.sent.film_ref,'p09-film');assert.equal(w.result.expandedId,'kp09-film');
      assert.equal(w.document.querySelector('[data-kino-suchtreffer="film:p09-film"] [aria-expanded]').getAttribute('aria-expanded'),'true','actual ticket is expanded');
      assert.ok(w.document.querySelector('[data-kino-suchtreffer="film:p09-film"] .kd-kino-ticket-termine'),'expanded ticket renders its showtimes'); }
    else assert.equal(w.result.fokus.art,'programm');
    assert.equal(w.result.reminder.film_ref,undefined,'no saved film-reference migration');
    passed(`${kind}: real StartTab -> Wochenplan projection/click -> actual App callback -> KinoTab card`);
  }
  assert.equal(w.result.networkRequests,0);
} finally { await w.api.act(async()=>w.api.unmount()); w.close(); }
console.log(`${checks} product regression checks PASS (no App/auth shell, no remote persistence)`);
