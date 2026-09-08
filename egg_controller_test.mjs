/* Native hook lifecycle with local storage, injected browser time/visibility
   and no network. Also used by the focused Chromium/WebKit regression. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");

export async function buildEggControllerFixture() {
  const result = await esbuild.build({
    stdin: { resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "jsx", contents: `
      import React, { act, StrictMode } from "react";
      import { createRoot } from "react-dom/client";
      import { useEggController } from "./src/controllers/useEggController.js";
      import { useDeepSpaceHorror } from "./src/controllers/useDeepSpaceHorror.js";
      let current, horror, props = { master: [], kinoMatches: {matched:[]}, streamingBekannt: {titel:[]}, auswahl: [], bootDone: true, setupWarnung: false, startModalOffen: false, neon: true, serial: 0 };
      const zufall = () => window.eggTest.draw();
      const ladeCageKatalog = () => window.eggTest.load();
      const springeZuFilm = ref => window.eggTest.sprung = {tab:"mediathek",ref};
      const springeZuKino = ziel => window.eggTest.sprung = ziel;
      const springeZuStreaming = ziel => window.eggTest.sprung = ziel;
      function Harness(p) {
        current = useEggController({...p,ladeCageKatalog,springeZuFilm,springeZuKino,springeZuStreaming,zufall});
        horror = useDeepSpaceHorror({achievements:current.achievements,bootDone:p.bootDone,neonNoirAktiv:p.neon,manuellerEintritt:p.serial,ownerKey:"gast",zufall});
        return <output data-cage-open={String(current.cageOffen)} data-space-active={String(horror.deepSpaceAktiv)} />;
      }
      const root = createRoot(document.getElementById("fixture"));
      window.eggTest = {
        act, draw: () => Math.random(), load: async () => {}, render: patch => {props={...props,...patch};root.render(<StrictMode><Harness {...props}/></StrictMode>)},
        clear: () => root.render(null), unmount: () => root.unmount(),
        close: () => current.setCageOffen(false), open: () => current.zeigeCage(),
        navigate: index => current.eggZeigeEintrag(current.cageFilmeRef.current[index]),
        state: () => ({cageOffen:current.cageOffen,filme:current.cageFilmeRef.current,achievements:[...(current.achievements||[])],toasts:current.toasts,deepSpaceAktiv:horror.deepSpaceAktiv}),
      };
    ` },
    outfile: "egg-controller-fixture.js", write: false, bundle: true, format: "iife", jsx: "automatic", target: "es2022",
    define: { "import.meta.env": "{}" }, logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

export async function runEggControllerChecks() {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM('<!doctype html><div id="fixture"></div>', {url:"http://egg-fixture.test/",runScripts:"dangerously",pretendToBeVisual:true});
  const {window} = dom;
  window.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({matches:false});
  window.MessageChannel = class {
    port1 = {};
    port2 = {postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0)};
  };
  let requests=0, hidden=true, now=new window.Date(2026,8,8), draws=0, draw=0.9;
  window.fetch = async () => {requests++;throw new Error("Network forbidden");};
  Object.defineProperty(window.document,"hidden",{get:()=>hidden});
  Object.defineProperty(window.document,"visibilityState",{get:()=>hidden?"hidden":"visible"});
  window.eval(await buildEggControllerFixture());
  const NativeDate=window.Date;
  window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[+now]));} static now(){return +now;}};
  window.eggTest.draw=()=>{draws++;return draw;};
  const api=window.eggTest, storage=window.localStorage;
  const film={id:"cage-con-air",typ:"film",titel:"Con Air",originaltitel:"Con Air",jahr:1997,quelle:"dvd"};
  const render=patch=>api.act(async()=>api.render(patch));
  const clear=()=>api.act(async()=>api.clear());
  const visible=async value=>{hidden=!value;await api.act(async()=>window.document.dispatchEvent(new window.Event("visibilitychange")));};
  const state=()=>api.state();
  let checks=0;
  const check=(name,run)=>{run();checks++;console.log(`✓ Egg-Controller: ${name}`);};
  try {
    storage.setItem("kd:achievements",JSON.stringify({eggs:["cage-alphabet"]}));
    await render({master:[film],setupWarnung:true});
    await visible(true);
    check("Setup blockiert Wurf und Karte",()=>{assert.equal(draws,0);assert.equal(storage.getItem("kd:eggroll:cage"),null);assert.equal(state().cageOffen,false);});
    await render({setupWarnung:false,startModalOffen:true});
    await render({startModalOffen:false,bootDone:false});
    check("Einstiegsdialog und unfertiger Boot zählen keinen Nutzungstag",()=>assert.equal(draws,0));
    await render({bootDone:true});
    check("geeigneter sichtbarer Tag würfelt einmal",()=>{assert.equal(draws,1);assert.equal(state().cageOffen,false);});
    await render({master:[{...film}]});await clear();await render({master:[film]});
    check("Rerender und Reload behalten den Tagesmiss",()=>{assert.equal(draws,1);assert.equal(JSON.parse(storage.getItem("kd:eggroll:cage")).fehlTage,1);});
    now=new NativeDate(2026,8,9);draw=0;
    await visible(false);
    check("neuer Tag im Hintergrund bleibt unbenutzt",()=>assert.equal(draws,1));
    await visible(true);
    check("sichtbar werdende offene PWA prüft neuen Tag mit aktuellem Pool",()=>{assert.equal(draws,2);assert.equal(state().cageOffen,true);assert.equal(state().filme[0].id,film.id);});
    await api.act(async()=>api.close());await visible(true);
    check("Schließen und weitere Sichtbarkeit feuern nicht erneut",()=>{assert.equal(draws,2);assert.equal(state().cageOffen,false);});
    now=new NativeDate(2026,8,10);
    await render({master:[]});await visible(true);
    await render({master:[{id:"8mm",typ:"film",titel:"8MM – Acht Millimeter",originaltitel:"8MM",jahr:1999,quelle:"dvd"}]});
    const stream = {...film,watchmode_id:9001,dienste:["Netflix"]};
    await render({master:[{...film,quelle:""}],streamingBekannt:{titel:[stream]},streamingRoh:{bekannt:{gueltigBis:"2026-09-12T10:00:00Z",titel:[stream]}},auswahl:["Disney+"]});
    check("leerer Pool, Zahlentitel und abgewähltes Abo erzeugen weder Wurf noch leere Karte",()=>{assert.equal(draws,2);assert.equal(state().cageOffen,false);});
    await render({auswahl:["Netflix"]});
    check("erst der live verfügbare A–Z-Film macht den Tag geeignet",()=>{assert.equal(draws,3);assert.equal(state().cageOffen,true);});
    await clear();storage.clear();now=new NativeDate(2026,8,11);
    await render({master:[film],auswahl:[],streamingBekannt:{titel:[]}});
    let opened;await api.act(async()=>{opened=api.open();});
    check("ohne Unlock ist auch manuelles Öffnen gesperrt",()=>{assert.equal(draws,3);assert.equal(opened,false);assert.equal(state().cageOffen,false);});
    await clear();storage.clear();storage.setItem("kd:achievements",JSON.stringify({eggs:["deep-space-horror"]}));
    await render({master:[],neon:true});await render({neon:false,serial:1});await render({neon:true,serial:2});
    check("Space-Pause sperrt alten Unlock, gespeichertes Neon und manuelle Eintritte ohne RNG",()=>{assert.equal(draws,3);assert.equal(state().deepSpaceAktiv,false);assert.ok(state().achievements.includes("deep-space-horror"));});
    await clear();storage.clear();
    const aliens=[{titel:"Alien",jahr:1979},{titel:"Aliens",jahr:1986},{titel:"Alien³",jahr:1992},{titel:"Alien: Romulus",jahr:2024}].map((f,index)=>({...f,id:`alien-${index}`,typ:"film",quelle:"dvd"}));
    await render({master:aliens.slice(0,3),serial:0});await render({master:aliens});
    check("neue Space-Schwelle erzeugt weder Achievement noch Unlock-Toast",()=>{assert.equal(draws,3);assert.equal(state().achievements.includes("deep-space-horror"),false);assert.equal(state().toasts.length,0);});

    await clear();storage.clear();storage.setItem("kd:achievements",JSON.stringify({eggs:["cage-alphabet"]}));
    now=new NativeDate(2026,8,12);let loads=0,release;
    api.load=()=>{loads++;return new Promise(resolve=>{release=resolve;});};
    await visible(false);
    await render({master:[film],streamingBekannt:null,streamingRoh:null,katalogFreigegeben:true,bootDone:false});
    await render({bootDone:true,setupWarnung:true});await visible(true);
    check("Vollkatalog wird vor Boot/Setup weder geladen noch vorzeitig gewürfelt",()=>{assert.equal(loads,0);assert.equal(draws,3);});
    await visible(false);await render({setupWarnung:false});
    check("unsichtbare PWA beginnt kein Katalog-Nachladen",()=>assert.equal(loads,0));
    await visible(true);await render({master:[{...film}]});await render({master:[film]});
    check("StrictMode und Rerender teilen einen laufenden Katalogversuch; kleiner Pool feuert nicht",()=>{assert.equal(loads,1);assert.equal(draws,3);assert.equal(state().cageOffen,false);assert.equal(storage.getItem("kd:eggroll:cage"),null);});
    const extern={watchmode_id:42,titel:"Mandy",jahr:2018,dienste:["Netflix"]};
    await render({startModalOffen:true,streamingRoh:{entdecken:{gueltigBis:"2026-09-13T10:00:00Z",titel:[extern]}},streamingEntdecken:{titel:[extern]}});
    await api.act(async()=>release());
    await render({startModalOffen:false,kinoLaedt:true});
    check("fertiger Katalog wartet weiterhin auf Modalgrenze und laufendes Kinoprogramm",()=>assert.equal(draws,3));
    await render({kinoLaedt:false});
    check("erst vollständige Bereitschaft friert den erweiterten Pool ein und würfelt einmal",()=>{assert.equal(draws,4);assert.equal(state().cageOffen,true);assert.equal(state().filme.length,2);assert.equal(loads,1);});
    await render({master:[]});
    check("angezeigter Pool bleibt während des Ergebnisses eingefroren",()=>assert.equal(state().filme.length,2));
    await api.act(async()=>api.navigate(state().filme.findIndex(f=>f.titel==="Mandy")));
    check("externer Streaming-Eintrag verwendet Entdecken-/Watchmode-Ziel",()=>assert.deepEqual(JSON.parse(JSON.stringify(api.sprung)),{tab:"streaming",art:"entdecken",ref:42,titel:"Mandy"}));
    now=new NativeDate(2026,8,14);await visible(true);
    check("nach Ablauf verbraucht der nur noch alte Snapshot keinen weiteren Tag",()=>{assert.equal(draws,4);assert.equal(state().cageOffen,false);assert.equal(loads,1);});
    api.load=async()=>{loads++;throw new Error("Katalog nicht verfügbar");};
    await render({master:[film],katalogKontext:"anderer-kontext"});await render({master:[{...film}]});
    check("ein gescheiterter Katalogversuch lässt bewiesenen Besitz zu und wird nicht pro Render wiederholt",()=>{assert.equal(loads,2);assert.equal(draws,5);assert.equal(state().cageOffen,true);assert.equal(state().filme.length,1);});
    await clear();storage.clear();storage.setItem("kd:achievements",JSON.stringify({eggs:["cage-alphabet"]}));
    await render({master:[],katalogKontext:"leer-nach-fehler",streamingRoh:null,streamingEntdecken:null});
    check("persistenter Unlock mit leerem Master und fehlgeschlagenem Katalog verbraucht keinen Tag",()=>{assert.equal(loads,3);assert.equal(draws,5);assert.equal(storage.getItem("kd:eggroll:cage"),null);});
    await render({programmInfo:{gueltigBis:"2026-09-15T10:00:00Z"},kinoMatches:{rest:[{t:"Con Air",j:1997,film_at_id:"kino-only"}]}});
    check("späteres aktuelles Kino öffnet ohne Master und ohne weiteren Katalogversuch",()=>{assert.equal(loads,3);assert.equal(draws,6);assert.equal(state().cageOffen,true);});
    await api.act(async()=>api.navigate(0));
    check("Kino-only-Ergebnis behält den externen Programmref statt Mediathek-ID",()=>assert.deepEqual(JSON.parse(JSON.stringify(api.sprung)),{tab:"kino",art:"programm",ref:"kino-only",titel:"Con Air"}));
    await api.act(async()=>api.unmount());await visible(true);
    check("Unmount räumt Sichtbarkeitsprüfung auf",()=>assert.equal(draws,6));
    assert.equal(requests,0);
    console.log(`\n${checks}/${checks} Egg-Controller-Checks bestanden; 0 Netzwerkrequests.`);
  } finally {dom.window.close();}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runEggControllerChecks();
