import React,{useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {KinoTab} from './src/tabs/KinoTab.jsx';
import {StreamingTab} from './src/tabs/StreamingTab.jsx';
import {verknuepfeStreamingPageMitMediathek} from './src/lib/staffeln.js';
import {baueStreamingAnsichten} from './src/lib/katalog.js';
import {erstellePersonalDataTransactionController} from './src/controllers/personalDataTransactionController.js';
import {setStorageDriver} from './src/lib/storage.js';
import './src/index.css';
import './src/styles/design-foundation.css';
import './src/styles/design-primary.css';
import './src/styles/design-secondary.css';
import './src/styles/design-shell.css';
setStorageDriver({name:'synthetic-browser',owner:'account:p07',async get(){return null},async set(k,v){return {key:k,value:v}}});
window.calls=[];
const root=createRoot(document.getElementById('app'));let sequence=0;
const t={watchmode_id:101,tmdb_id:201,imdb_id:'tt1234567',titel:'Streaming Prüfwerk',typ:'movie',jahr:2026,dienste:['Netflix'],web_urls:{Netflix:'http://fixture.local/provider'},genres:['Drama'],beschreibung:'Streaming Beschreibung',laufzeit_minuten:100};
const pf={film_at_id:'800001',t:'Kino Prüfwerk',j:2026,g:['Drama'],k:['Filmcasino'],z:['Freitag, 18.09. 20:15 Filmcasino'],b:'Kino Beschreibung'};
const mock=name=>(...args)=>{window.calls.push(name);return Promise.resolve(true)};
function StreamingFixture({options}){
 const [master,setMaster]=useState(options.masterPending?null:options.known?[{...t,typ:options.conflict?'serie':'film',id:'library-101'}]:[]);
 const [status,setStatus]=useState(options.seen?{101:{status:'gesehen',gesehen_am:'2026-09-01',historisch:true,...(options.known?{mediathek_id:'library-101'}:{})}}:options.known?{101:{status:'erstellt',mediathek_id:'library-101'}}:{});
 const masterRef=useRef(master),articleRef=useRef([]),mwRef=useRef([]);masterRef.current=master;
 const controller=erstellePersonalDataTransactionController({masterRef,artikelRef:articleRef,mustwatchRef:mwRef,
  transaktionMustwatchVorbereitet:async(derive,follow,opts)=>{const vorher=mwRef.current;let next=derive(vorher);return follow({vorher,storageContext:opts.storageContext,setzeNext(v){next=v;return true},async persistiere(){mwRef.current=next;return true},async rolleZurueck(){mwRef.current=vorher;return true}})},
  transaktionArtikel:async(derive,follow,opts)=>{const next=derive(articleRef.current);if(!Array.isArray(next)||!opts.pruefeVorWrite())return false;const ok=await follow();if(ok)articleRef.current=next;return ok},
  transaktionMaster:async(plan,opts)=>{if(opts.erwarteteBasis!==masterRef.current)return false;masterRef.current=plan.master;setMaster(plan.master);window.calls.push('delete');return true}
 });
 const views=baueStreamingAnsichten({bekannt:{stand:'B',katalog_stand:'B',titel:[]},entdecken:{stand:'B',katalog_stand:'B',titel:[t]},entdeckenUmfang:'voll'},master||[]);
 window.fixtureState={master,status};
 return <><button id="fixture-delete" onClick={()=>void controller.loescheFilm(master?.[0]?.id)}>Lokal löschen</button><StreamingTab
  bekannt={views.bekannt} entdecken={views.entdecken} master={master} auswahl={['Netflix']} auswahlGeladen
  streamingNeu={{status:'ready',neueIds:['101']}}
  streamingPage={options.legacy?null:{enabled:true,status:options.expired?'stale':'ready',sourceExpired:!!options.expired,view:options.view||'all',queryKey:`fixture-${sequence}`,items:verknuepfeStreamingPageMitMediathek([t],master||[]),total:1,counts:{all:1,new:1,library:master?.length||0},hasMore:false}}
  addFilm={async film=>{const entry={...film,id:'library-101'};setMaster(old=>[...(old||[]),entry]);window.calls.push('add');return entry.id}}
  toggleMerk={mock('merk')} onRecommendationPinToggle={mock('pin')} onEintragKlick={mock('navigate')}
  entdeckenStatus={status} schreibeEntdeckenStatus={async fn=>{setStatus(prev=>{const next=fn(prev);if(next!==prev)window.calls.push('status');return next});return true}}
  fokusTreffer={options.focus?{art:'entdecken',ref:'101',titel:t.titel}:null}
  katalogInfo={{abgelaufen:false}}/>
 </>;
}
window.renderCase=(kind,options={})=>{
 window.calls=[];sessionStorage.clear();const id=++sequence;
 const kino={programm:{status:{archiviert:false},events:[],demnaechst:[]},progStand:'2026-09-16',master:[],kinoMatches:{matched:[],rest:[pf]},restSichtbar:[pf],zeitgrenze:'14:00',saveZeitgrenze:mock('zeit'),zeigeAlles:true,setZeigeAlles:mock('all'),expandedId:null,setExpandedId:mock('expand'),updateFilm:mock('update'),addFilm:mock('add'),badgeFuer:()=>null,loading:null,kinoPins:[],toggleKinoPin:mock('termin'),programmInfo:{abgelaufen:false},
 geschmacksprofil:options.personal?{signale:[{art:'genre',wert:'drama',richtung:'zieht_an',staerke:4}]}:null,
 fokusTreffer:options.focus?{art:'programm',ref:'800001',titel:pf.t}:null};
 root.render(<div key={id} data-render-seq={id}>{kind==='kino'?<KinoTab {...kino}/>:<StreamingFixture options={options}/>}</div>);return id;
};
