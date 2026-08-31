/* PR-08: isolierter angemeldeter Komponenten-Harness, keine App-/Auth-Fixture,
   kein Server und keine Anbieter. Auch von der eigenen Browser-Spec genutzt. */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");

export async function buildKinoFixture() {
  const result = await esbuild.build({
    stdin: { resolveDir: rootDir, loader: "jsx", contents: `
      import React, { act, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { KinoTab } from './src/tabs/KinoTab.jsx';
      import { grenzeInMinuten, hatVorstellungAb } from './src/lib/programm.js';
      import './src/index.css';
      const rest = [
        { t:'Filtereins', j:2026, f:'OmU', im_abo:true, k:['Gartenbaukino'], z:['Montag 31.8. 18:00 · Gartenbaukino (OmU)'] },
        { t:'Filterzwei', j:2026, f:'OV', im_abo:false, k:['Apollo'], z:['Montag 31.8. 20:00 · Apollo (OV)'] },
        { t:'Filterdrei', j:2026, f:'DF', im_abo:true, k:['Gartenbaukino'], z:['Dienstag 1.9. 10:00 · Gartenbaukino (DF)'] },
        { t:'Kreuzfall', j:2026, f:'DF', im_abo:false, k:['Gartenbaukino','Apollo'], z:['Montag 31.8. 21:00 · Apollo (DF)', 'Dienstag 1.9. 22:00 · Gartenbaukino (DF)'] },
      ];
      const film = { id:9, titel:'Listentreffer', jahr:2026, typ:'film' };
      const matched = [{ film, prog:{ t:film.titel, j:2026, f:'OmU', im_abo:true, k:['Gartenbaukino'], z:['Montag 31.8. 10:00 · Gartenbaukino (OmU)'] } }];
      function Fixture() {
        const [zeitgrenze, saveZeitgrenze] = useState('14:00');
        const [zeigeAlles, setZeigeAlles] = useState(true);
        const [expandedId, setExpandedId] = useState(null);
        const [fokusTreffer, setFokus] = useState(null);
        window.kinoTest.focus = setFokus;
        return <KinoTab angemeldet programm={{events:[], demnaechst:[]}} master={[film]}
          kinoMatches={{matched, rest}} restSichtbar={zeigeAlles ? rest : rest.filter(pf => hatVorstellungAb(pf, grenzeInMinuten(zeitgrenze)))}
          zeitgrenze={zeitgrenze} saveZeitgrenze={saveZeitgrenze} zeigeAlles={zeigeAlles} setZeigeAlles={setZeigeAlles}
          expandedId={expandedId} setExpandedId={setExpandedId} updateFilm={()=>{}} addFilm={()=>{}}
          fokusTreffer={fokusTreffer} onFokusVerbraucht={()=>{ window.kinoTest.focusConsumed += 1; }} />;
      }
      const root = createRoot(document.getElementById('fixture'));
      window.kinoTest = { act, focusConsumed:0, mount:()=>root.render(<Fixture/>), unmount:()=>root.unmount() };
    ` },
    outfile: "kino-fixture.js", write: false, bundle: true, format: "iife",
    jsx: "automatic", target: "es2022", define: { "import.meta.env": "{}" },
    loader: { ".woff2": "dataurl" }, logLevel: "silent",
  });
  return {
    js: result.outputFiles.find(file => file.path.endsWith(".js")).text,
    css: result.outputFiles.find(file => file.path.endsWith(".css")).text,
  };
}

async function runDomChecks() {
  const { JSDOM } = require("jsdom");
  const bundle = await buildKinoFixture();
  const dom = new JSDOM('<!doctype html><html><body><main id="fixture"></main></body></html>', {
    url: "http://kino-fixture.test/", runScripts: "dangerously", pretendToBeVisual: true,
  });
  const { window } = dom;
  // JSDOM stellt MessageChannel nicht bereit; React act braucht nur diese
  // asynchrone Task-Zustellung, keine echten Worker oder offenen Ports.
  window.MessageChannel = class {
    port1 = {};
    port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) };
  };
  window.IS_REACT_ACT_ENVIRONMENT = true;
  let requests = 0;
  window.fetch = async () => { requests++; throw new Error("Network forbidden"); };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.eval(bundle.js);
  const api = window.kinoTest;
  const doc = window.document;
  const button = name => [...doc.querySelectorAll("button")].find(el => el.textContent.trim() === name);
  const toggle = () => doc.querySelector(".kd-kino-filter-toggle");
  const click = async el => { assert.ok(el); await api.act(async () => el.click()); };
  const select = async (label, value) => {
    await api.act(async () => {
      const el = doc.querySelector(`select[aria-label="${label}"]`);
      el.value = value;
      el.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  };
  const titles = () => [...doc.querySelectorAll('[data-kino-suchtreffer^="programm:"]')].map(el => el.dataset.kinoSuchtreffer.slice(9)).sort();
  let checks = 0;
  const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
  try {
    await api.act(async () => api.mount());
    check("Lokale Suche entfernt; Datum/Kino und zugeklappter Filter vorhanden", () => {
      assert.equal(doc.querySelectorAll('input[placeholder="Programm durchsuchen …"]').length, 0);
      assert.equal(doc.querySelectorAll('.kd-kino-programmfilter select').length, 2);
      assert.equal(toggle().getAttribute("aria-expanded"), "false");
      assert.ok(doc.getElementById(toggle().getAttribute("aria-controls")).hidden);
      assert.equal(button("Filter zurücksetzen"), undefined);
    });
    await select("Datum im Kinoprogramm", "31.8.");
    await select("Kino im Kinoprogramm", "Gartenbaukino");
    check("Kino und Datum schneiden dieselbe Vorstellung; Anzahl zwei", () => {
      assert.deepEqual(titles(), ["Filtereins"]);
      assert.match(toggle().textContent, /Filter · 2/);
    });
    await click(button("Filter zurücksetzen"));
    await click(toggle());
    await click(button("Abo: alle"));
    check("Nur NonStop greift", () => assert.deepEqual(titles(), ["Filterdrei", "Filtereins"]));
    await click(button("Nur NonStop"));
    check("Kein NonStop greift", () => assert.deepEqual(titles(), ["Filterzwei", "Kreuzfall"]));
    await click(button("Kein NonStop"));
    for (const [fassung, expected] of [["OmU", ["Filtereins"]], ["OV", ["Filterzwei"]], ["DF", ["Filterdrei", "Kreuzfall"]]]) {
      await click(button(fassung));
      check(`${fassung} filtert und zeigt aktiven Zustand`, () => {
        assert.deepEqual(titles(), expected);
        assert.equal(button(fassung).getAttribute("aria-pressed"), "true");
      });
      await click(button(fassung));
    }
    await click(button("Zeitfilter an"));
    check("Rest ab wirkt nur auf Rest, Listentreffer bleibt", () => {
      assert.deepEqual(titles(), ["Filtereins", "Filterzwei", "Kreuzfall"]);
      assert.ok(doc.querySelector('[data-kino-suchtreffer="film:9"]'));
      assert.match(toggle().textContent, /Filter · 1/);
      assert.match(doc.querySelector('.kd-kino-filterhinweis').textContent, /Rest ab 14:00/);
    });
    await click(button("Ganzes Tagesprogramm"));
    check("Ganzes Tagesprogramm löst die Zeitgrenze", () => assert.equal(titles().length, 4));
    await api.act(async () => api.focus({ art: "programm", ref: "Filtereins", titel: "Filtereins" }));
    await new Promise(resolve => window.setTimeout(resolve, 70));
    check("Globaler Suchauftrag fokussiert ohne lokale Suche", () => {
      assert.deepEqual(titles(), ["Filtereins"]);
      assert.equal(doc.activeElement.dataset.kinoSuchtreffer, "programm:Filtereins");
      assert.equal(api.focusConsumed, 1);
      assert.match(doc.querySelector('.kd-kino-filterhinweis').textContent, /Suchfokus: Filtereins/);
    });
    await click(button("Zeitfilter an"));
    await click(button("Filter zurücksetzen"));
    check("Reset löst Fokus und Zeitgrenze, behält Uhrzeit, verschwindet", () => {
      assert.equal(titles().length, 4);
      assert.equal(doc.querySelector('.kd-kino-zeitgrenze input').value, '14:00');
      assert.equal(button("Filter zurücksetzen"), undefined);
      assert.equal(requests, 0);
    });
    console.log(`\n${checks}/${checks} Kino-Mobil-DOM-Checks bestanden; 0 Netzwerkrequests.`);
  } finally {
    await api.act(async () => api.unmount());
    window.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runDomChecks();
