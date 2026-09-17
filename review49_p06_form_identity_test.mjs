/* Actual FilmForm -> save callback and forecast service, with local boundaries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
const dir = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-p06-form-'));
fs.symlinkSync(path.join(dir, 'node_modules'), path.join(tmp, 'node_modules'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const esbuild = createRequire(import.meta.resolve('vite'))('esbuild');
await esbuild.build({ stdin: { contents: [
  'export { FilmForm } from "./src/components/EintragForm.jsx";',
  'export { erstelleVorbewertungsErgebnis } from "./src/services/vorbewertung.js";',
  'export { filmwissenKennungen } from "./src/lib/filmwissen.js";',
  'export { leeresProfil, erteileEinwilligung } from "./src/lib/profil.js";',
].join('\n'), resolveDir: dir, loader: 'js' }, bundle: true, format: 'esm', jsx: 'automatic', target: 'es2022', outfile: path.join(tmp, 'bundle.mjs'), logLevel: 'silent', external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'] });
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Event','MouseEvent','Node','NodeList','getComputedStyle','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
let network = 0;
globalThis.fetch = async () => { network++; throw Error('Network forbidden'); };
const { act, createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const P = await import(path.join(tmp, 'bundle.mjs'));
const tick = () => new Promise(r => setTimeout(r, 0));
const button = (c, text) => [...c.querySelectorAll('button')].find(e => e.textContent.trim() === text);
const click = async e => { assert.ok(e); await act(async () => { e.click(); await tick(); }); };
const input = async (e, value) => { assert.ok(e); await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), 'value').set.call(e, value); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); await tick(); }); };
const profil = { ...P.erteileEinwilligung(P.leeresProfil(), '2026-07-29T12:00:00Z', 'v1'), version: 'p2', signale: [{ art: 'genre', wert: 'horror', richtung: 'zieht_an', staerke: 5, sicherheit: 'hoch', quelle: 'schlagwort', beleg: 'schlagwort:horror', erfasst: '2026-07-29T12:00:00Z', bestaetigt: '2026-07-29T12:00:00Z' }] };
let cases = 0;
async function scenario({ typ, editable, raw, valid = true }) {
  const c = document.createElement('div'); document.body.append(c); const root = createRoot(c);
  const saved = [], forecasts = [];
  try {
    await act(async () => { root.render(h(P.FilmForm, {
      startOffen: true, typOptionen: [typ], kennungenBearbeitbar: editable,
      initial: { titel: 'TMDB-only Fixture', jahr: 2000, ...(editable ? {} : { tmdb_id: raw }) },
      prognoseAktiv: true,
      onAdd: async entry => { localStorage.setItem('p06-saved', JSON.stringify(entry)); saved.push(JSON.parse(localStorage.getItem('p06-saved'))); return 'saved'; },
      onAddMitPrognose: async entry => {
        await P.erstelleVorbewertungsErgebnis(entry, { profil, ai: { runTask: async (task, payload) => {
          forecasts.push({ task, payload });
          // Stop at the actual provider boundary; no synthetic result is persisted.
          throw Error('Local forecast boundary reached');
        } } });
      },
    })); await tick(); });
    if (editable) await input(c.querySelector('input[placeholder="TMDB · 348"]'), raw);
    else assert.equal(c.querySelector('input[placeholder="TMDB · 348"]'), null);
    await click(button(c, 'KI-Bewertung erstellen'));
    if (valid) {
      assert.equal(forecasts.length, 1);
      assert.equal(forecasts[0].task, 'film-forecast');
      assert.equal(forecasts[0].payload.film.externeIds.tmdb, '77');
      assert.deepEqual(forecasts[0].payload.filmkennung, { namespace: 'tmdb', kennung: `${typ === 'film' ? 'movie' : 'tv'}:77` });
    } else if (editable) {
      assert.equal(forecasts.length, 0);
      assert.match(c.textContent, /Film-ID hat nicht das erwartete Format/);
    } else {
      assert.equal(forecasts.length, 1);
      assert.equal(forecasts[0].payload.filmkennung, null);
      assert.equal(forecasts[0].payload.film.externeIds?.tmdb, undefined);
    }
    await click(c.querySelector('input[type="checkbox"]'));
    await click(button(c, 'Hinzufügen'));
    if (!valid && editable) assert.equal(saved.length, 0);
    else {
      assert.equal(saved.length, 1);
      assert.equal(saved[0].typ, typ);
      assert.equal(saved[0].bewertung, null);
      assert.equal(saved[0].tmdb_id, valid ? '77' : undefined);
      assert.deepEqual(P.filmwissenKennungen(saved[0]), valid ? [{ namespace: 'tmdb', kennung: `${typ === 'film' ? 'movie' : 'tv'}:77` }] : []);
    }
    cases++;
    console.log(`PASS ${typ} ${editable ? 'manual' : 'prefilled'} ${JSON.stringify(raw)} ${valid ? 'kept numeric' : 'invalid'}`);
  } finally { await act(async () => root.unmount()); c.remove(); localStorage.clear(); }
}
for (const typ of ['film', 'serie']) {
  for (const raw of ['77', 77, '00077']) await scenario({ typ, editable: false, raw });
  await scenario({ typ, editable: true, raw: ' 00077 ' });
  for (const raw of ['0', '-77', '77x', '77.5', 'movie:77', 'tv:77', '1234567890123456789']) {
    await scenario({ typ, editable: true, raw, valid: false });
    await scenario({ typ, editable: false, raw, valid: false });
  }
}
assert.equal(network, 0);
console.log(`${cases}/${cases} actual FilmForm save/forecast scenarios; 0 network calls`);
dom.window.close();
