/* Sollregressionen gegen den jeweils aktuellen Produktcode. Kein Netz/Provider. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
const dir = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-p04-'));
fs.symlinkSync(path.join(dir, 'node_modules'), path.join(tmp, 'node_modules'));
const esbuild = createRequire(import.meta.resolve('vite'))('esbuild');
const modules = {
  FilmForm: 'components/EintragForm.jsx', FilmCard: 'components/FilmCard.jsx',
  MustWatchListe: 'components/MustWatchListe.jsx', StapelImport: 'components/StapelImport.jsx',
  GeschmackBereich: 'components/GeschmackBereich.jsx', BlogTab: 'tabs/BlogTab.jsx',
  useMustwatchController: 'controllers/useMustwatchController.js',
  useMasterPersistenceController: 'controllers/useArticleController.js',
};
await esbuild.build({ stdin: { contents: [
  ...Object.entries(modules).map(([name, file]) => `export { ${name} } from './src/${file}';`),
  ...['match', 'profil', 'artikel', 'libraryProjection', 'prognose', 'stapelimport', 'personalEntryChronology', 'storage', 'mediathekSelection'].map(file => `export * from './src/lib/${file}.js';`),
].join('\n'), resolveDir: dir, loader: 'js' }, bundle: true, format: 'esm', jsx: 'automatic', target: 'es2022', outfile: path.join(tmp, 'bundle.mjs'), logLevel: 'silent',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  plugins: [{ name: 'local-storage-facade', setup(b) { b.onLoad({ filter: /\/services\/storage\.js$/ }, () => ({ contents: `export * from ${JSON.stringify(path.join(dir, 'src/lib/storage.js'))};`, loader: 'js' })); } }],
});
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Event','MouseEvent','Node','NodeList','getComputedStyle','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {}; window.confirm = () => true;
let network = 0;
globalThis.fetch = async () => { network++; throw Error('Netz ist gesperrt'); };
const React = await import('react');
const { act, createElement: h } = React;
const { createRoot } = await import('react-dom/client');
const P = await import(path.join(tmp,'bundle.mjs'));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let checks = 0;
const check = (value, label) => { assert.ok(value,label); checks++; console.log('✓ '+label); };
const button = (c,text) => [...c.querySelectorAll('button')].find(e=>e.textContent.trim()===text);
const input = async (e,value) => { assert.ok(e,'Input vorhanden'); await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));await tick();}); };
const click = async e => { assert.ok(e,'Button vorhanden'); await act(async()=>{e.click();await tick();}); };
async function mount(C,props={}) { const c=document.createElement('div');document.body.append(c);const root=createRoot(c);await act(async()=>{root.render(h(C,props));await tick();});return { c, async render(p) { await act(async()=>{root.render(h(C,p));await tick();}); }, async close(){await act(async()=>root.unmount());c.remove();} }; }

// E05-003: falsy IDs, Kollisionen, Stabilität und echte App-Callbacks + echte Masterqueue.
const raw = [null,'',undefined,false,0,NaN].map((id,i)=>({id,titel:i%2?'???':'!!!'}));
raw.push({id:'id',titel:'Bestehend'},{id:'id',titel:'Kollision'});
const fixed=P.ensureIds(raw);
check(fixed.every(f=>typeof f.id==='string'&&f.id)&&new Set(fixed.map(f=>f.id)).size===fixed.length,'E05 falsy IDs werden eindeutig repariert');
assert.deepEqual(P.ensureIds(fixed),fixed);
check(fixed[6].id==='id','E05 gültige ID bleibt erhalten; zweiter Lauf ist stabil');
const storeData=new Map();let failWrite=false;
P.setStorageDriver({ name:'p04-memory', async get(k){return storeData.has(k)?{value:storeData.get(k)}:null;}, async set(k,v){if(failWrite)throw Error('write');storeData.set(k,v);}, async delete(k){storeData.delete(k);} });
const app=fs.readFileSync(path.join(dir,'src/App.jsx'),'utf8');
function callback(name,end,env) { const s=app.indexOf(`  const ${name} = `);assert.ok(s>=0);const text=app.slice(s,app.indexOf(end,s)).trim();const expr=text.slice(text.indexOf('=')+1).trim().replace(/;$/,'');return Function(...Object.keys(env),`return (${expr});`)(...Object.values(env)); }
let addFilm,updateFilm;const masterRef={current:fixed};
function MasterHarness(){const {mutiereMaster}=P.useMasterPersistenceController({masterRef,setErr:()=>{},commitMaster:()=>{}});const env={...P,useCallback:f=>f,mutiereMaster,masterMetaRef:{current:null},naechsteHerkunft:()=>({}),mitMustwatch:P.baueRefUniversum,mustwatchRef:{current:[]},schreibeArtikel:async fn=>{fn([]);return true;},setErr:()=>{}};addFilm=callback('addFilm','\n\n  const serienKatalog',env);updateFilm=callback('updateFilm','\n  const deleteFilm',env);return null;}
const mh=await mount(MasterHarness);
const id1=await addFilm({titel:'!!!',typ:'musik',jahr:null});const id2=await addFilm({titel:'???',typ:'musik',jahr:null});
check(id1&&id2&&id1!==id2&&masterRef.current.at(-1).id===id2,'E05 App.addFilm speichert zwei Satzzeichentitel und gibt tatsächliche IDs zurück');
const persisted=JSON.parse(storeData.get(P.K.master)).filme;
check(P.analysiereAuswaehlbareIds(P.ensureIds(persisted)).auswaehlbareIds.has(id2),'E05 Anlage bleibt nach Reload auswählbar');
await updateFilm(fixed[0].id,{notiz:'einzeln'});
check(masterRef.current.filter(f=>f.notiz==='einzeln').length===1,'E05 Einzeledit reparierter Alt-ID verändert genau ein Werk');
failWrite=true;check(await addFilm({titel:'Fehler',jahr:2001})===null,'E05 fehlender Speichererfolg gibt keine ID zurück');failWrite=false;await mh.close();

// E04-001: beide Produktprojektionen und Heilung mit Remake-/Typguard.
const mw=[{id:'mw-thing',titel:'The Thing',jahr:1982,typ:'film'},{id:'mw-dark',titel:'Dark',jahr:2017,typ:'serie'}];
const article={id:'a',titel:'Liste',text:'Text',liste:[{eingabe:'The Thing',jahr:2011,typ:'film',ref:null},{eingabe:'Dark',jahr:2017,typ:'serie',ref:null}]};
const frozen=JSON.stringify(mw);const universe=P.baueRefUniversum([],mw);
for(const a of [P.gleicheArtikelAb(article,universe),P.heileRotlinks([article],universe)[0][0],P.planeMasterErsetzung([],[article],mw).artikel[0]]) check(a.liste[0].ref===null&&a.liste[1].ref==='mw-dark','E04-001 Remake bleibt offen und eindeutige Serie wird verlinkt');
check(JSON.stringify(mw)===frozen&&universe[0].jahr===1982&&universe[1].typ==='serie','E04-001 Projektion bewahrt Metadaten ohne Mutation');
check(P.gleicheArtikelAb(article,P.baueRefUniversum([{id:'thing2011',titel:'The Thing',jahr:2011,typ:'film'}],mw)).liste[0].ref==='thing2011','E04-001 passender Master-Jahrestreffer gewinnt');
check(P.gleicheArtikelAb(article,P.baueRefUniversum([], [...mw,{...mw[1],id:'dark2'}])).liste[1].abgleich.status==='mehrfach','E04-001 Mehrdeutigkeit bleibt Entscheidung');
check(P.baueRefUniversum([],[{id:'alt',titel:'Alt'}])[0].typ==='film','E04-001 Altbestand behält null/Film-Semantik');
check(P.gleicheArtikelAb({...article,liste:[{...article.liste[0],ref:'mw-thing'}]},universe).liste[0].ref==='mw-thing','E04-001 explizite bestehende Ref bleibt stabil');

// E09-001: echte UI, serialisierter Profiltopf und Remount; Bestand außerhalb Angebot.
const A={titel:'Alien',jahr:1979,masterId:'alien',sicher:true,richtung:'zieht_an'};
const B={id:'heat',titel:'Heat',jahr:1995,kategorie:'kult'};
let profile={...P.erteileEinwilligung(null,'2026-09-17T10:00:00Z'),filme:[A,{titel:'Außerhalb',jahr:1980,masterId:'other',sicher:true}],version:'p1'};
let writes=0;localStorage.setItem(P.K.geschmacksprofil,JSON.stringify(profile));
const profileProps={bekannteTitel:[{...A,id:'alien',kategorie:'kult'},B],kiAktiv:true,blogProfilAnalyseSichtbar:false,speicher:{ladeProfil:async()=>JSON.parse(localStorage.getItem(P.K.geschmacksprofil)),speichereProfil:async p=>{assert.deepEqual(P.pruefeProfil(p),[]);profile=JSON.parse(JSON.stringify(p));localStorage.setItem(P.K.geschmacksprofil,JSON.stringify(p));writes++;}}};
let ui=await mount(P.GeschmackBereich,profileProps);
async function more(c){await click(button(c,'Ändern'));await click(button(c,'Weitere Angaben machen'));await click(button(c,'Weiter'));}
await more(ui.c);await click([...ui.c.querySelectorAll('button')].find(e=>e.textContent.includes('Heat')));await click(button(ui.c,'Weiter'));await click(button(ui.c,'Zur Übersicht'));
check(writes===0&&/Bisherige Filme bleiben erhalten: Alien/.test(ui.c.textContent),'E09 Vorschau zeigt geschützten Bestand vor Schreiben');
await click(button(ui.c,'Ins Profil übernehmen'));check(profile.filme.length===3&&profile.version==='p2','E09 A plus B und Film außerhalb Angebot bleiben erhalten, genau ein Versionsschritt');await ui.close();
ui=await mount(P.GeschmackBereich,profileProps);await more(ui.c);await click([...ui.c.querySelectorAll('button')].find(e=>e.textContent.includes('Alien')));await click([...ui.c.querySelectorAll('button')].find(e=>e.textContent.includes('Alien')));await click(button(ui.c,'Weiter'));await click(button(ui.c,'Zur Übersicht'));
check(/Richtung ändern: zieht mich an → stößt mich ab/.test(ui.c.textContent),'E09 geänderte Filmrichtung wird ausdrücklich angezeigt');
await click(button(ui.c,'Ins Profil übernehmen'));check(profile.filme.length===3&&profile.filme[0].richtung==='stoesst_ab','E09 erneute Auswahl aktualisiert eindeutig ohne Dublette');
const before=JSON.stringify(profile);await more(ui.c);await click(button(ui.c,'Weiter'));await click(button(ui.c,'Zur Übersicht'));check(button(ui.c,'Ins Profil übernehmen').disabled,'E09 keine Auswahl kann Bestand nicht leeren');await click(button(ui.c,'Abbrechen'));check(JSON.stringify(profile)===before,'E09 Abbruch bewahrt gespeicherten Bestand');await ui.close();
let aiCalls=0;
ui=await mount(P.GeschmackBereich,{...profileProps,ai:{async runTask(){aiCalls++;return {data:{signale:[],filme:[{titel:'Solaris',jahr:1972},{titel:'Nicht bestätigen',jahr:2000}]}};}}});await click(button(ui.c,'Ändern'));await click(button(ui.c,'Geschmacksprofil mit KI verfeinern'));await input(ui.c.querySelector('textarea'),'Solaris und ein Gegenbeispiel');await click(button(ui.c,'Profilvorschläge erstellen'));await click([...ui.c.querySelectorAll('[data-vorschlag-art="film"]')][1]);await click(button(ui.c,'Ausgewähltes übernehmen'));
check(aiCalls===1&&profile.filme.length===4&&profile.filme.at(-1).titel==='Solaris'&&profile.filme.at(-1).sicher,'E09 gemockte KI-Teilliste ergänzt nur bestätigten Film');await ui.close();
check(P.ergaenzeProfilFilme([A],[{titel:'Alien',jahr:1979,sicher:true}])[0].richtung==='zieht_an','E09 bloße Nennung überschreibt keine bestätigte Richtung');
check(P.ergaenzeProfilFilme([A],[{...A,masterId:'anderes-werk'}]).length===2&&P.ergaenzeProfilFilme([A],[{titel:'Alien',jahr:2000}]).length===2&&P.ergaenzeProfilFilme([A],[{titel:'Alien',jahr:null}]).length===2,'E09 fremde starke IDs, Remakes und unbekanntes Jahr werden nicht titelbasiert vereinigt');
check(P.vorschlagRahmen(P.leeresProfil(),{filme:[A]},'t').fehler==='keine Einwilligung','E09 Einwilligung bleibt zwingend');
const pending=P.vorschlagRahmen(profile,{filme:[A]},'t');check(!!P.vorschlagRahmen(pending.profil,{filme:[A]},'t').fehler&&!!P.vorschlagRahmen(profile,{filme:[{titel:'bad',jahr:2}]},'t').fehler,'E09 offene Vorschau und Rahmenvalidierung bleiben wirksam');

// E04-004: wirkliche Must-Watch-Queue normalisiert erst bestätigten Jahresstring.
storeData.set(P.K.mustwatch,JSON.stringify({eintraege:[{id:'mw',titel:'Jahrestest',jahr:null,typ:'film'}]}));let mwController;
function MwHarness(){mwController=P.useMustwatchController({master:[],setErr:()=>{}});return h(P.MustWatchListe,{eintraege:mwController.mustwatch,onUpdate:mwController.updateMustwatch,onAdd:mwController.addMustwatch,kandidaten:{master:[],programm:[],streaming:[]}});}
ui=await mount(MwHarness);await click(ui.c.querySelector('#mw-mw'));
for(const v of ['1','19','198','1982']){await input(ui.c.querySelector('.kd-mustwatch-jahr'),v);check(ui.c.querySelector('.kd-mustwatch-jahr').value===v&&JSON.parse(storeData.get(P.K.mustwatch)).eintraege[0].jahr===null,`E04-004 ${v} bleibt lokaler String über Tick`);}
await click(button(ui.c,'Jahr speichern'));check(mwController.mustwatch[0].jahr===1982,'E04-004 Commit persistiert numerisch 1982');
await input(ui.c.querySelector('.kd-mustwatch-jahr'),'198');await click(button(ui.c,'Jahr speichern'));check(mwController.mustwatch[0].jahr===1982&&/vollständiges Jahr/.test(ui.c.textContent),'E04-004 unvollständiger Commit löscht gültiges Jahr nicht');await input(ui.c.querySelector('.kd-mustwatch-jahr'),'1983');await click(button(ui.c,'Jahr speichern'));check(mwController.mustwatch[0].jahr===1983,'E04-004 Korrektur auf 1983 speichert');
await input(ui.c.querySelector('.kd-mustwatch-jahr'),'');await click(button(ui.c,'Jahr abbrechen'));check(ui.c.querySelector('.kd-mustwatch-jahr').value==='1983','E04-004 Abbruch verwirft Leerentwurf');await input(ui.c.querySelector('.kd-mustwatch-jahr'),'');await click(button(ui.c,'Jahr speichern'));check(mwController.mustwatch[0].jahr===null,'E04-004 bewusste Leerung persistiert null');
failWrite=true;await input(ui.c.querySelector('.kd-mustwatch-jahr'),'2001');await click(button(ui.c,'Jahr speichern'));check(ui.c.querySelector('.kd-mustwatch-jahr').value==='2001'&&mwController.mustwatch[0].jahr===null&&/Entwurf bleibt erhalten/.test(ui.c.textContent),'E04-004 Speicherfehler bewahrt Entwurf und alten Topf');failWrite=false;await ui.close();

// Vollständiges Einsetzen/Retry, Tastaturabbruch und Neuanlage bleiben nutzbar.
ui=await mount(MwHarness);await click(ui.c.querySelector('#mw-mw'));
await input(ui.c.querySelector('.kd-mustwatch-jahr'),'2001');await click(button(ui.c,'Jahr speichern'));
check(mwController.mustwatch[0].jahr===2001,'E04-004 vollständiges Einsetzen nach Speicherfehler funktioniert');
await input(ui.c.querySelector('.kd-mustwatch-jahr'),'200');
await act(async()=>{ui.c.querySelector('.kd-mustwatch-jahr').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();});
check(ui.c.querySelector('.kd-mustwatch-jahr').value==='2001','E04-004 Escape verwirft nur Jahresentwurf');
await input(ui.c.querySelector('.kd-mustwatch-jahr'),'2002');
await act(async()=>{ui.c.querySelector('.kd-mustwatch-jahr').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();});
check(mwController.mustwatch[0].jahr===2002,'E04-004 Enter bestätigt das vollständige Jahr');
await click(button(ui.c,'+ Für später merken'));
await input(ui.c.querySelector('.kd-mustwatch-form input[placeholder="Titel *"]'),'Neu');
for(const v of ['1','19','198','1984'])await input(ui.c.querySelector('.kd-mustwatch-form .kd-mustwatch-jahr'),v);
check(mwController.mustwatch.length===1,'E04-004 schrittweise Neuanlage bleibt vor Submit ungespeichert');
await click(button(ui.c,'Für später merken'));check(mwController.mustwatch.find(e=>e.titel==='Neu').jahr===1984,'E04-004 Neuanlage persistiert das vollständige Jahr');await ui.close();

// E04-005: Produktions-Einzeladapter, Teil-/Totalausfall, Wiederanlauf ohne KI.
const batchData={kandidaten:[{titel:'Alien',jahr:1979,typ:'film',quelle:'dvd',sicherheit:'hoch'},{titel:'Dark',jahr:2017,typ:'serie',quelle:'dvd',sicherheit:'hoch'},{titel:'Heat',jahr:1995,typ:'film',quelle:'dvd',sicherheit:'hoch'}],warnungen:[]};
const facts=[{sourceId:'ttl_bHyGTvopBHPVtIKhR2CF68WD',flixpatrol_id:'ttl_bHyGTvopBHPVtIKhR2CF68WD',titel:'Dark',jahr:2017,typ:'serie',beschreibung:'Neutraler Cachetext',imdb_id:'tt5753856',fresh:true,checkedAt:'2026-09-17T00:00:00Z',charts:[]}];
for(const mode of ['partial','all-failed','success']) {
 const calls=[];let aiCount=0;let retry=false;
 ui=await mount(P.StapelImport,{kiAktiv:true,config:{appEnvironment:'production'},ai:{async runTask(){aiCount++;return {data:batchData};}},flixpatrolFacts:{async load(){return facts;}},addFilm:async film=>{calls.push(film);return retry||mode==='success'||(mode==='partial'&&film.titel!=='Dark')?`id-${film.titel}`:null;}});
 await input(ui.c.querySelector('textarea'),'Alien\nDark\nHeat');await click(button(ui.c,'Liste mit KI ordnen'));
 await input(ui.c.querySelector('[aria-label="Quelle für Dark"]'),'bluray');await input(ui.c.querySelector('[aria-label="Staffeln für Dark"]'),'1–3');
 const dark=()=>[...ui.c.querySelectorAll('.kd-stapel-kandidat')].find(e=>e.textContent.includes('Dark'));
 const factCheckbox=dark().querySelectorAll('input[type="checkbox"]')[1];assert.ok(factCheckbox);await click(factCheckbox);
 await act(async()=>{const b=button(ui.c,'Auswahl übernehmen');b.click();b.click();await tick();});
 check(calls.length===3&&aiCount===1,`E04-005 ${mode}: Doppelklick schreibt jeden Kandidaten einmal`);
 if(mode==='success'){check(!ui.c.querySelector('.kd-stapel-vorschau'),'E04-005 vollständiger Erfolg schließt Vorschau');}
 else {
   const expected=mode==='partial'?1:3;
   check(ui.c.querySelectorAll('.kd-stapel-kandidat').length===expected&&ui.c.querySelector('[aria-label="Quelle für Dark"]').value==='bluray'&&ui.c.querySelector('[aria-label="Staffeln für Dark"]').value==='1–3'&&!dark().querySelectorAll('input[type="checkbox"]')[1].checked&&dark().querySelector('input').checked,`E04-005 ${mode}: Rest bewahrt Quelle, Staffeln, Faktenwahl und Auswahl`);
   check(ui.c.textContent.includes(`Nicht gespeichert: ${expected}`),'E04-005 Bericht ordnet den Teilerfolg korrekt ein');
   retry=true;await click(button(ui.c,'Auswahl übernehmen'));
   check(calls.length===3+expected&&aiCount===1&&calls.slice(3).every(f=>mode==='all-failed'||f.titel==='Dark'),'E04-005 gezielter Retry schreibt nur Rest ohne neue KI');
 }
 await ui.close();
}
let release;const batchCalls=[];let key='a';
const batchProps={kiAktiv:true,datenKontextKey:key,config:{appEnvironment:'production'},ai:{async runTask(){return {data:batchData};}},flixpatrolFacts:{async load(){return [];}},addFilm:film=>{batchCalls.push(film);return new Promise(r=>{release=r;});}};
ui=await mount(P.StapelImport,batchProps);await input(ui.c.querySelector('textarea'),'Alien\nDark\nHeat');await click(button(ui.c,'Liste mit KI ordnen'));await click(button(ui.c,'Auswahl übernehmen'));await ui.render({...batchProps,datenKontextKey:'b'});await act(async()=>{release('alien');await tick();});check(batchCalls.length===1&&!ui.c.querySelector('.kd-stapel-vorschau')&&!ui.c.querySelector('.kd-stapel-bericht'),'E04-005 Kontextwechsel stoppt Rest und alte Abschlussanzeige');await ui.close();

// E04-006: beide tatsächlichen Blog-Aufrufer, beide Richtungen, Umwege und Guard.
for(const status of ['wartet','freigegeben']) for(const [from,to,via] of [['film','serie'],['serie','film'],['serie','serie'],['film','serie','musik'],['film','serie','sonstiges']]) {
 const saves=[],refs=[];
 const a={id:'blog',titel:'Artikel',autor:'Test',text:'Text',status,liste:[{eingabe:'Neu',jahr:2000,typ:from,ref:null}]};
 ui=await mount(P.BlogTab,{artikel:[a],master:[],fokusId:'blog',onAddFilm:async f=>{saves.push(f);check(refs.length===0,'E04-006 Referenz wartet auf bestätigte Anlage');return 'new-id';},onSetzeRef:(...v)=>{refs.push(v);return true;}});
 if(status==='wartet')await click(button(ui.c,'+ Neu anlegen'));else await click(ui.c.querySelector('a[title^="Eintrag existiert"]'));
 let outer=ui.c.querySelector('select');if(via){await input(outer,via);await input(ui.c.querySelector('select'),to);}else{await input(ui.c.querySelector('input[placeholder="Titel *"]'),'Eigener Entwurf');await input(outer,to);}
 check(ui.c.querySelector('select[title="Typ"]').value===to,`E04-006 ${status} ${from}→${to}: innerer und äußerer Typ synchron`);
 await click(button(ui.c,'Hinzufügen'));
 check(saves[0].typ===to&&refs.length===1&&(via||saves[0].titel==='Eigener Entwurf'),`E04-006 ${status} ${from}→${to}${via?' über '+via:''}: Save und Entwurf korrekt`);await ui.close();
}
ui=await mount(P.BlogTab,{artikel:[{id:'b',titel:'Artikel',autor:'Test',text:'Text',status:'wartet',liste:[{eingabe:'Alt',jahr:1900,typ:'film',ref:null}]}],master:[],fokusId:'b',onAddFilm:()=>{throw Error('Darf nicht speichern');},onSetzeRef:()=>{throw Error('Darf keine Ref setzen');}});await click(button(ui.c,'+ Neu anlegen'));await input(ui.c.querySelector('select'),'serie');await click(button(ui.c,'Hinzufügen'));check(/zwischen 1928/.test(ui.c.textContent),'E04-006 Validierung folgt aktuellem Serientyp');await ui.close();

// E04-002: Inhaltsvergleich, gespeicherter Status und UI nach Übernahme.
const prognose=P.erstellePrognose({ergebnis:{format:'film-prognose-v1',achsen:{wie:4,was:3,warum:4},passung:82,kategorie_vorschlag:'kult',sicherheit:'mittel',begruendung:'Dichte Inszenierung.',verwendete_signale:[]},profilVersion:'p4',modell:'test',modellAlias:'test',vorgangId:'p04',verbrauch:{inputTokens:1,outputTokens:1,kostenUsdCent:0,dauerMs:1},jetzt:'2026-09-17T10:00:00Z'}).prognose;
for(const state of ['offen','angenommen']) for(const change of ['none','axis','category','reason','note','reset']) {
 let saved;
 function Card(){const [film,setFilm]=React.useState({id:'a',titel:'Alien',typ:'film',jahr:1979,bewertung:null,prognose:{...prognose,status:state}});return h(P.FilmCard,{film,expanded:true,vorbewertung:{},onSave:async delta=>{saved=JSON.parse(JSON.stringify(P.mergePersonalMasterEntry(film,delta)));setFilm(saved);return true;}});}
 ui=await mount(Card);await click(button(ui.c,'Vorschlag in Eingabe übernehmen'));
 if(change==='axis'||change==='reset')await input(ui.c.querySelectorAll('input[type="number"]')[2],'5');
 if(change==='reset')await input(ui.c.querySelectorAll('input[type="number"]')[2],'4');
 if(change==='category')await input(ui.c.querySelector('.kd-editpanel select'),'sehenswert');
 if(change==='reason')await input(ui.c.querySelector('textarea'),'Eigene Begründung');
 if(change==='note')await input(ui.c.querySelectorAll('textarea')[1],'Nur Notiz');
 await click(button(ui.c,'Bewertung speichern'));
 const expected=['axis','category','reason'].includes(change)?'korrigiert':'angenommen';
 check(saved.prognose.status===expected&&ui.c.textContent.includes(`von dir ${expected}`),`E04-002 ${state}/${change}: gespeicherter und sichtbarer Status ${expected}`);
 assert.deepEqual(saved.prognose.ergebnis,prognose.ergebnis);
 check(saved.bewertet_von===`KI-Bewertung (${expected==='angenommen'?'übernommen':'korrigiert'})`,'E04-002 Herkunft entspricht endgültigem Bewertungsinhalt');await ui.close();
}
ui=await mount(P.FilmCard,{film:{id:'a',titel:'Alien',typ:'film',prognose},expanded:true,vorbewertung:{},onSave:async()=>false});await click(button(ui.c,'Vorschlag in Eingabe übernehmen'));await input(ui.c.querySelector('input[type="number"]'),'');check(button(ui.c,'Bewertung speichern').disabled,'E04-002 unvollständige Übernahme bleibt gesperrt');await input(ui.c.querySelector('input[type="number"]'),'5');await click(button(ui.c,'Bewertung speichern'));check(ui.c.querySelector('input[type="number"]').value==='5'&&/Eingabe bleibt erhalten/.test(ui.c.textContent),'E04-002 Speicherfehler bewahrt korrigierten Entwurf');await ui.close();
// Manueller Einstieg benutzt denselben Inhaltsvergleich und behält eigene Werte.
let manual;
ui=await mount(P.FilmCard,{film:{id:'manual',titel:'Alien',typ:'film',bewertung:null,prognose},expanded:true,vorbewertung:{},onSave:async delta=>{manual=delta;return true;}});
await click(button(ui.c,'✎ Jetzt bewerten'));
for(const [index,value] of ['5','2','1'].entries())await input(ui.c.querySelectorAll('input[type="number"]')[index],value);
await click(button(ui.c,'Speichern'));
check(manual.prognose.status==='korrigiert'&&manual.bewertung.wie===5,'E04-002 manueller Bewertungsweg bewahrt Korrekturstatus und Werte');await ui.close();
// Ein vorhandener ID-Slug bleibt ein kontrollierter Dublettenfall.
const mh2=await mount(MasterHarness);const ordinary=await addFilm({titel:'Ordentlich',jahr:2000,typ:'film'});
check(ordinary==='ordentlich_2000'&&await addFilm({titel:'Ordentlich',jahr:2000,typ:'film'})===null,'E05 normale Anlage und Dublettenregel bleiben erhalten');await mh2.close();
// Das gemeinsame Übernahme-Gate erhält Filme auch bei explizit leerer Teilliste.
const emptyFrame=P.vorschlagRahmen(profile,{filme:[]},'2026-09-17T10:00:00Z');
assert.deepEqual(P.uebernimmRahmen(emptyFrame.profil,'2026-09-17T10:01:00Z').profil.filme,profile.filme);
check(P.ergaenzeProfilFilme([A],[{...A,titel:'Geänderter Katalogtitel'}]).length===1,'E09 stabile Master-ID schlägt geänderten Titel; leere Teilliste erhält Bestand');
check(network===0,'Keine Netzwerk- oder Provideraufrufe');
console.log(`P04 PASS: ${checks} Prüfungen`);
dom.window.close();esbuild.stop();fs.rmSync(tmp,{recursive:true,force:true});
process.exit(0);
