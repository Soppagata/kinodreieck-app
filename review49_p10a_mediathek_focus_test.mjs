import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const cwd = process.cwd();
const require = createRequire(path.join(cwd, 'node_modules/__p10a__.cjs'));
const { JSDOM } = require('jsdom');
let esbuild;
try { esbuild = require('esbuild'); } catch { esbuild = require('vite/node_modules/esbuild'); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review49-p10a-'));
const app = fs.readFileSync('src/App.jsx', 'utf8');
// Execute the current App callbacks verbatim. Fail loudly if their contract moves.
function callback(name) {
  const start = app.indexOf(`  const ${name} = useCallback(`);
  assert.ok(start >= 0, `App callback ${name}`);
  const tail = app.slice(start);
  const end = tail.indexOf('\n');
  if (tail.slice(0, end).endsWith(');')) return tail.slice(0, end);
  const close = tail.match(/^  \}, \[[^\n]*\]\);/m);
  assert.ok(close, `App callback boundary ${name}`);
  return tail.slice(0, close.index + close[0].length);
}
const consume = app.match(/fokusFilmId=\{mediathekFokus\} onFokusVerbraucht=\{(\(\) => setMediathekFokus\(null\))\}/)?.[1];
assert.ok(consume, 'App focus prop contract');
assert.match(app, /onSpringeZuMustwatchRef=\{springeZuMustwatchRef\}/);
const entry = `
import React, { useState, useCallback, useRef } from 'react';
import { MediathekTab } from './src/tabs/MediathekTab.jsx';
import { planeMustwatchSprung } from './src/controllers/libraryController.js';
export { store, K } from './src/services/storage.js';
export { default as React, act } from 'react';
export { createRoot } from 'react-dom/client';
export function Harness({ master, mustwatch, probe }) {
  const [expandedId, setExpandedId] = useState(null);
  const [mediathekFokus, setMediathekFokus] = useState(null);
  const [tab, setTab] = useState('mediathek');
  const [, setMehrOffen] = useState(false);
  const tabRef = useRef(tab); tabRef.current = tab;
  const scrollProBereichRef = useRef(new Map());
  const navigationRevisionRef = useRef(0);
  const remoteKontoAktiv = true;
  const aktuelleScrolltiefe = useCallback(() => 0, []);
  const setZeigeAlles = probe.unexpected, setKinoFokus = probe.unexpected;
  const springeZuStreaming = probe.unexpected;
  ${callback('navigiere')}
  ${callback('springeZuFilm')}
  ${callback('springeZuMustwatchRef')}
  probe.focus = mediathekFokus;
  probe.jump = springeZuFilm;
  probe.tab = tab;
  return <MediathekTab master={master} mustwatch={mustwatch} mustwatchGeladen
    nachtragFlach={[]} expandedId={expandedId} setExpandedId={setExpandedId}
    fokusFilmId={mediathekFokus} onFokusVerbraucht={() => {
      probe.consumed(mediathekFokus);
      (${consume})();
    }}
    onSpringeZuMustwatchRef={springeZuMustwatchRef}
    mwKandidaten={{master, programm: [], streaming: []}}
    updateFilm={probe.write} deleteFilm={probe.write} addFilm={probe.write}
    addMustwatch={probe.write} updateMustwatch={probe.write} deleteMustwatch={probe.write} />;
}`;
await esbuild.build({ stdin: { contents: entry, resolveDir: cwd, sourcefile: 'review49_p10a_entry.jsx', loader: 'jsx' },
  outfile: path.join(tmp, 'bundle.mjs'), bundle: true, platform: 'node', format: 'esm',
  jsx: 'automatic', target: 'es2022', logLevel: 'silent' });
esbuild.stop?.();
const dom = new JSDOM('<html><body><main id="app"></main></body></html>', { url: 'https://p10a.test/' });
for (const name of ['window','document','HTMLElement','Element','Node','Event','MouseEvent','localStorage']) {
  Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
let writes = 0, network = 0;
globalThis.fetch = async () => { network++; throw new Error('Network forbidden'); };
const { React, act, createRoot, Harness, store, K } = await import(pathToFileURL(path.join(tmp, 'bundle.mjs')));
store.get = async (key) => key === K.filterMediathek ? { value: '1' } : null;
store.set = async () => { writes++; };
store.del = async () => { writes++; };
for (const method of ['setItem','removeItem','clear']) dom.window.Storage.prototype[method] = () => { writes++; };
const visible = (el) => !!el?.isConnected && !el.closest('[hidden], [aria-hidden="true"], [inert]');
let scrolls = [], consumed = [], root, probe, section, mountedData, snapshot;
dom.window.HTMLElement.prototype.scrollIntoView = function () {
  assert.ok(visible(this), 'Scroll target must be visible');
  assert.ok(this.textContent.includes('TARGET DETAILS'), 'Scroll target must be expanded');
  scrolls.push(this.id);
};
const target = (typ = 'film') => ({ id: 'zulu_1999', typ, titel: 'Zulu', jahr: 1999,
  quelle: 'prime', genre: ['Action'], kategorie: 'sehenswert',
  bewertung: { wie: 2, was: 2, warum: 2 }, begruendung: 'TARGET DETAILS', beschreibung: 'TARGET DETAILS' });
const alpha = { id: 'alpha_2024', typ: 'film', titel: 'Alpha', jahr: 2024, quelle: 'dvd',
  genre: ['Drama'], kategorie: 'kult', bewertung: { wie: 3, was: 3, warum: 3 } };
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
async function setup({ typ = 'film', alias = false, missing = false } = {}) {
  if (root) await act(async () => root.unmount());
  scrolls = []; consumed = [];
  mountedData = freeze({ master: [alpha, target(typ)], mustwatch: [{ id: 'mw_link',
    titel: alias ? 'Alpha Alias' : 'Zulu', jahr: alias ? 2024 : 1999, typ: 'film',
    verknuepfung: { ziel: 'master', id: missing ? 'missing-id' : 'zulu_1999' } }] });
  snapshot = JSON.stringify(mountedData);
  probe = { unexpected: () => assert.fail('Unexpected App navigation'), write: () => { writes++; },
    consumed: (id) => { assert.ok(visible(document.getElementById('film-' + id))); consumed.push(id); } };
  root = createRoot(document.getElementById('app'));
  await act(async () => root.render(React.createElement(Harness, { ...mountedData, probe })));
  section = document.querySelector('.kd-mediathek-tab');
}
const button = (text) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === text);
const viewButton = (text) => [...document.querySelectorAll('.kd-mediathek-ansichten button')].find((el) => el.textContent.startsWith(text));
const search = () => document.querySelector('input[placeholder^="Titel oder Originaltitel"]');
const card = () => document.getElementById('film-zulu_1999');
async function click(el) {
  assert.ok(visible(el), 'Clicked control exists and is visible');
  await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })));
}
async function value(el, text) {
  assert.ok(el, 'Input exists');
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, text);
  await act(async () => el.dispatchEvent(new dom.window.Event('input', { bubbles: true })));
}
async function tick() { await act(async () => new Promise((resolve) => setTimeout(resolve, 180))); }
async function link() {
  await click(viewButton('Must-Watch'));
  const anchor = document.querySelector('#mw-mw_link a');
  assert.ok(visible(anchor), 'Explicit link remains reachable with current filters');
  await click(anchor);
  assert.equal(document.querySelector('.kd-mediathek-tab'), section, 'Same mounted Mediathek instance');
  assert.equal(probe.tab, 'mediathek', 'Actual App early-return keeps main tab');
}
function successful() {
  assert.ok(visible(card()), 'Target is visible');
  assert.ok(card().textContent.includes('TARGET DETAILS'), 'Real FilmCard is expanded');
  assert.deepEqual(scrolls, ['film-zulu_1999']);
  assert.deepEqual(consumed, ['zulu_1999']);
  assert.equal(probe.focus, null);
  assert.equal(JSON.stringify(mountedData), snapshot, 'Master and explicit links unchanged');
  assert.equal(writes, 0, 'No persistence callbacks or storage writes');
}
let passed = 0;
async function scenario(name, run) { await run(); passed++; console.log('PASS ' + name); }
try {
  for (const [name, filter] of [
    ['search Alpha → Zulu', async () => value(search(), 'Alpha')],
    ['genre exclusion', async () => click(button('Drama'))],
    ['category exclusion', async () => click(button('Kult'))],
    ['ownership exclusion', async () => click(button('DVD'))],
    ['reachable A–Z alias', async () => value(document.querySelector('[aria-label="Mediathek: Anfangsbuchstaben filtern"]'), '1')],
    ['reachable decade alias', async () => value(document.querySelector('[aria-label="Mediathek: Jahrzehnt filtern"]'), '4')],
  ]) await scenario(name, async () => {
    await setup({ alias: name.includes('alias') });
    await filter();
    assert.ok(!visible(card()), 'Filter really excludes target before navigation');
    await link(); await tick(); successful();
  });
  await scenario('no-filter control', async () => { await setup(); await link(); await tick(); successful(); });
  for (const typ of ['serie', 'musik', 'sonstiges']) await scenario('automatic type ' + typ, async () => {
    await setup({ typ }); assert.ok(!card()); await link(); await tick(); successful();
    const active = document.querySelector('.kd-mediathek-typen [aria-pressed="true"]');
    assert.ok(active?.textContent.toLowerCase().includes(typ === 'serie' ? 'serien' : typ));
  });
  await scenario('missing target is explained and not consumed', async () => {
    await setup({ missing: true }); await link(); await tick();
    assert.match(document.querySelector('[role="status"]').textContent, /nicht vorhanden/);
    assert.deepEqual(scrolls, []); assert.deepEqual(consumed, []); assert.equal(probe.focus, 'missing-id');
    assert.equal(writes, 0);
    await act(async () => probe.jump('zulu_1999')); await tick(); successful();
    assert.ok(!document.querySelector('[role="status"]'));
  });
  for (const attribute of ['hidden', 'aria-hidden', 'inert']) await scenario('hidden DOM guard: ' + attribute, async () => {
    await setup(); await link();
    card().setAttribute(attribute, attribute === 'aria-hidden' ? 'true' : '');
    await tick(); assert.deepEqual(consumed, []); assert.deepEqual(scrolls, []); assert.equal(probe.focus, 'zulu_1999');
    card().removeAttribute(attribute);
    await value(search(), 'Zulu'); await tick(); successful();
  });
  await scenario('filter race retains pending focus until visible', async () => {
    await setup(); await link(); await value(search(), 'Alpha'); await tick();
    assert.ok(!visible(card())); assert.equal(probe.focus, 'zulu_1999'); assert.deepEqual(consumed, []);
    await value(search(), ''); await tick(); successful();
  });
  await scenario('selection-preserved hidden card becomes visible before consumption', async () => {
    await setup(); await click(card().querySelector('.kd-karte')); await click(button('Auswählen'));
    await value(search(), 'Alpha'); assert.ok(card()?.hidden, 'Real preserved card is hidden');
    await act(async () => probe.jump('zulu_1999')); await tick(); successful();
  });
  assert.equal(network, 0); assert.equal(writes, 0);
  await act(async () => root.unmount()); root = null;
  dom.window.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${passed}/${passed} P10a mounted navigation scenarios passed; 0 writes; 0 network calls.`);
  process.exit(0);
} catch (error) { console.error(error); if (root) await act(async () => root.unmount()); dom.window.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); }
