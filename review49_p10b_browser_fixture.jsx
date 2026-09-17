import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { StartTab } from './src/tabs/StartTab.jsx';
import { KinoTab } from './src/tabs/KinoTab.jsx';
import { useEntdeckenPins } from './src/controllers/useEntdeckenPins.js';
import { setStorageDriver, K } from './src/lib/storage.js';
import { createEntdeckenPinsPot, createEntdeckenPin } from './src/lib/entdeckenPins.js';
import { baueStreamingAnsichten } from './src/lib/katalog.js';
import { streamingPayloadMitMetadaten, zeitpunkt } from './src/lib/catalogProjection.js';
import { baueKinoMatches } from './src/controllers/libraryController.js';
import { erstelleFinderAntwort, kompakteFinderTreffer } from './src/tabs/FinderTab.jsx';
import { useAppContracts } from 'app-contracts';
import './src/index.css';
import './src/styles/design-foundation.css';
import './src/styles/design-primary.css';

const title = { title:'Verzögertes Prüfwerk', year:2026, type:'film', watchmodeId:901 };
const streaming = { watchmode_id:901,titel:title.title,jahr:2026,typ:'movie',dienste:['Netflix'] };
const pf = {film_at_id:'800001',t:'Kino Prüfwerk',j:2026,g:['Drama'],k:['Filmcasino'],z:['Fr, 18.09.2026 20:15 · Filmcasino'],b:'Synthetische Beschreibung'};
const program = {filme:[pf],events:[],demnaechst:[],status:{archiviert:false}};
const ownerKey = 'account:ready:p10b';
const profile = {signale:[{art:'genre',wert:'drama',richtung:'zieht_an',staerke:4}]};
const backend = new Map();
const root = createRoot(document.getElementById('app'));
const noop=()=>{};
let seq=0;
function driver(owner='p10b') {
 return {name:'mock-account-'+owner,owner:'account:'+owner,hasConfirmedRemote:()=>true,
  async get(key){const value=backend.get(owner+'|'+key);return value==null?null:{key,value}},
  async set(key,value){backend.set(owner+'|'+key,value);window.writes.push(key);return {key,value}}};
}
function PinSave() {
 const pins = useEntdeckenPins({contextKey:ownerKey});
 window.pinApi=pins;
 return <button disabled={!pins.entdeckenPinsGeladen} onClick={()=>pins.toggleRecommendationPin(title)}>Speichern</button>;
}
function Navigation({options}) {
 const pins=useEntdeckenPins({contextKey:ownerKey});
 const [tab,navigiere]=useState(options.initialKino?'kino':'start');
 const [kinoFokus,setKinoFokus]=useState(options.focusMount?{art:'programm',ref:'800001',titel:pf.t}:null);
 const [expandedId,setExpandedId]=useState(null);
 const [zeigeAlles,setZeigeAlles]=useState(!!options.focusMount);
 const [bekannt,setStreamingBekannt]=useState(null),[entdecken,setStreamingEntdecken]=useState(null);
 const [info,setStreamingInfo]=useState(null);
 const [hasProgram,setHasProgram]=useState(!options.delayedProgram);
 const [render,setRender]=useState(0);
 const master=useMemo(()=>options.matched?[{id:'library-1',titel:pf.t,jahr:2026,typ:'film',film_at_id:'800001'}]:[],[options]);
 const kinoMatches=useMemo(()=>baueKinoMatches(hasProgram?program:null,master),[hasProgram,master]);
 const initial=useMemo(()=>({
  snapshotFreigabe:true,snapshotFreigabeRef:{current:true},streamingKnownZurueckgestelltRef:{current:false},betriebsartGen:{current:1},
  streamingBekanntLaufRef:{current:null},streamingEntdeckenLaufRef:{current:null},streamingRohRef:{current:null},streamingGeladen:{current:false},entdeckenGeladen:{current:false},
  sichtbareAuswahl:[],sichtbareAuswahlGeladen:true,EINZELDATEI_BUILD:false,masterRef:{current:master},
  catalogService:{
   async loadArea(area){
    window.loads.push(area);
    if(area==='streamingEntdecken') await new Promise((resolve,reject)=>{window.releaseCatalog=()=>options.failure?reject(new Error('synthetic unavailable')):resolve()});
    const titel=area==='streamingBekannt'?(options.known?[streaming]:[]):options.missing?[]:options.ambiguous?[{...streaming,watchmode_id:902},{...streaming,watchmode_id:903}]:[streaming];
    return {payload:{stand:'2026-09-17T10:00:00Z',katalog_stand:'same',titel},stand:'2026-09-17T10:00:00Z',quelle:'datenbank',variante:'live'};
   },buildStreamingViews:baueStreamingAnsichten},
  reportError:(...args)=>window.errors.push(args),resolveError:noop,uebernehmeVollkatalog:noop,
  ERROR_CODES:{},ERROR_SCOPE:{STREAMING_KNOWN:'known',STREAMING_DISCOVER:'discover'},errorText:e=>e.message,
  streamingPayloadMitMetadaten,zeitpunkt,
 }),[options,master]);
 const setGlobaleSuchantwort=noop;
 const springeZuStreaming=fokus=>{window.streamingDestination=fokus;navigiere('streaming')};
 const contracts=useAppContracts({...initial,master,setStreamingBekannt,setStreamingEntdecken,setStreamingInfo,
  setZeigeAlles,setExpandedId,setKinoFokus,navigiere,setGlobaleSuchantwort,
  bestaetigeGlobalenAuswahlSprung:()=>true,springeZuStreaming,springeZuArtikel:noop,springeZuFilm:noop});
 useEffect(()=>{void contracts.ladeStreamingDateien(false)},[contracts.ladeStreamingDateien]);
 window.state={tab,kinoFokus,expandedId,zeigeAlles,pins:pins.entdeckenPins,loaded:pins.entdeckenPinsGeladen,render};
 window.refresh=()=>setRender(x=>x+1);
 window.deliverProgram=()=>setHasProgram(true);
 window.missingFocus=()=>setKinoFokus({art:'programm',ref:'missing',titel:'Fehlendes Ziel'});
 window.actualFocus=()=>setKinoFokus({art:'programm',ref:'800001',titel:pf.t});
 const finderItems=kompakteFinderTreffer(erstelleFinderAntwort({text:pf.t,master,kinoMatches,streamingBekannt:bekannt,streamingEntdecken:entdecken,artikel:[]}), 'kino').items;
 window.finderItems=finderItems;
 return <div data-ready={pins.entdeckenPinsGeladen} data-generation={seq}>
  <button id="finder" onClick={()=>contracts.oeffneGlobalenTreffer(finderItems.find(x=>x.bereich==='kino'||x.typ==='kino'))}>Suchtreffer öffnen</button>
  <button id="kino" onClick={()=>navigiere('kino')}>Kino öffnen</button>
  {tab==='start'&&<StartTab entdeckenPins={pins.entdeckenPins} pinOwnerKey={ownerKey}
    kinoPins={options.cinemaPin?[{t:pf.t,j:2026,z:pf.z[0],programm_ref:pf.film_at_id}]:[]}
    kinoMatches={kinoMatches} programm={hasProgram?program:null} progStand={hasProgram?'2026-09-17':null}
    streamingBekannt={bekannt} streamingEntdecken={entdecken} streamingInfo={info}
    onStreamingKatalogLaden={contracts.ladeStreamingDateien} onSpringeZuStreaming={springeZuStreaming}
    onSpringeZuKino={contracts.onSpringeZuKino} mustwatchReady
    mustwatch={options.mustwatch?[{id:'mw_one',titel:'Persönliches Prüfwerk',jahr:2026,typ:'film'}]:[]}/>}
  {tab==='kino'&&<KinoTab programm={hasProgram?program:null} progStand="2026-09-17" master={master}
    kinoMatches={kinoMatches} restSichtbar={kinoMatches.rest} geschmacksprofil={options.personal?profile:null}
    zeitgrenze="23:00" saveZeitgrenze={noop} zeigeAlles={zeigeAlles} setZeigeAlles={setZeigeAlles}
    expandedId={expandedId} setExpandedId={setExpandedId} addFilm={noop} updateFilm={noop}
    fokusTreffer={kinoFokus} onFokusVerbraucht={()=>{window.consumed++;contracts.onFokusVerbraucht()}}/>}
 </div>;
}
window.reset=(kind,options={})=>{
 window.loads=[];window.errors=[];window.writes=[];window.consumed=0;window.scrolls=[];
 setStorageDriver(driver());
 if(kind!=='restore'){
  backend.clear();localStorage.clear();
  if(options.cinemaTitle) backend.set('p10b|'+K.entdeckenPins,JSON.stringify(createEntdeckenPinsPot([createEntdeckenPin({title:pf.t,year:pf.j,type:'film',film_at_id:pf.film_at_id})],{owner:'account:p10b'})));
  if(options.mustwatch||options.foreignMustwatch){const owner=options.foreignMustwatch?'account:ready:other':ownerKey;
   backend.set('p10b|'+K.entdeckenPins,JSON.stringify(createEntdeckenPinsPot([createEntdeckenPin({title:'Persönliches Prüfwerk',mustwatchId:'mw_one',pinOwnerKey:owner})],{owner:'account:p10b'})))}
 }
 const id=++seq;
 root.render(<div key={id}>{kind==='save'?<PinSave/>:<Navigation options={options}/>}</div>);
 return id;
};
window.unmount=()=>root.render(null);
window.saved=()=>backend.get('p10b|'+K.entdeckenPins);
const originalScroll=Element.prototype.scrollIntoView;
Element.prototype.scrollIntoView=function(...args){window.scrolls.push(this.dataset.kinoSuchtreffer);return originalScroll.apply(this,args)};
window.reset('save');
