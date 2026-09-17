/* Sollregressionen gegen den jeweils aktuellen Produktcode. Kein Netz/Provider. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire('/private/tmp/kd-review49-verifier-delta-20260917/package.json'); const { JSDOM } = require('jsdom');
const dir = '/private/tmp/kd-review49-verifier-delta-20260917';
const tmp = fs.mkdtempSync(path.join('/private/tmp/kd-review49-verification-evidence', 'form-bundle-'));
fs.symlinkSync(path.join(dir, 'node_modules'), path.join(tmp, 'node_modules'));
const esbuild = createRequire(require.resolve('vite'))('esbuild');
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
const React = await import(require.resolve('react'));
const { act, createElement: h } = React;
const { createRoot } = await import(require.resolve('react-dom/client'));
const P = await import(path.join(tmp,'bundle.mjs'));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let checks = 0;
const check = (value, label) => { assert.ok(value,label); checks++; console.log('✓ '+label); };
const button = (c,text) => [...c.querySelectorAll('button')].find(e=>e.textContent.trim()===text);
const input = async (e,value) => { assert.ok(e,'Input vorhanden'); await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));await tick();}); };
const click = async e => { assert.ok(e,'Button vorhanden'); await act(async()=>{e.click();await tick();}); };
async function mount(C,props={}) { const c=document.createElement('div');document.body.append(c);const root=createRoot(c);await act(async()=>{root.render(h(C,props));await tick();});return { c, async render(p) { await act(async()=>{root.render(h(C,p));await tick();}); }, async close(){await act(async()=>root.unmount());c.remove();} }; }


let saved = null;
const ui=await mount(P.FilmForm,{startOffen:true,typOptionen:['film'],kennungenBearbeitbar:false,initial:{titel:'TMDB-only Fixture',jahr:2000,tmdb_id:'77'},onAdd:async f=>{saved=f;return 'saved';}});
await click(ui.c.querySelector('input[type="checkbox"]'));
await click(button(ui.c,'Hinzufügen'));
assert.ok(saved);
console.log(JSON.stringify({candidateCommit:'ac8fca5fc23b55bb0c583eb86f1dcfeedda2c142',inputTmdbId:'77',savedTmdbId:saved.tmdb_id??null,savedTitle:saved.titel,networkCalls:network}));
assert.equal(saved.tmdb_id,'77','Fixed: real FilmForm preserves the numeric personal TMDB identity');
await ui.close();fs.rmSync(tmp,{recursive:true,force:true});
