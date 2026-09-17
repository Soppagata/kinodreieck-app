import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium, webkit } = require('playwright');
const source = resolve('.');
const out = await mkdtemp(join(tmpdir(), 'review49-p09-browser-'));
const built = await build({ entryPoints: [resolve('review49_p09_browser_fixture.jsx')], bundle: true, write: false,
  jsx: 'automatic', format: 'iife', platform: 'browser', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'local-sync', setup(b) { b.onLoad({ filter: /SyncStatusChip\.jsx$/ }, () => ({ contents: 'export function useSyncStatus(){ return {configured:false,pending:[],conflict:[],stale:[]}; }', loader: 'js' })); } }] });
const styles = ['index.css','styles/design-foundation.css','styles/design-primary.css','styles/design-secondary.css','styles/design-shell.css','styles/rating-followup.css','styles/library-followup.css'];
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(s => `<link rel="stylesheet" href="/src/${s}">`).join('')}</head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://local').pathname;
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
    if (path === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(built.outputFiles[0].text); }
    if (!path.startsWith('/src/') || path.includes('..')) return res.writeHead(404).end();
    res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'text/javascript');
    res.end(await readFile(source + path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const results = [];
const state = page => page.locator('.kd-wochen-tage input').evaluateAll(es => es.map(e => e.checked));
async function edit(page) {
  const row = page.locator('.kd-wochen-tag:not([hidden]) details').first();
  if (!(await row.evaluate(el => el.open))) await row.locator('summary').click();
  await row.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
}
async function reset(page, existing = false, ende = { typ: 'nie' }) {
  const generation = await page.evaluate(({ existing, ende }) => window.reset(existing ? [window.seed(ende)] : []), { existing, ende });
  await page.locator(`[data-fixture-generation="${generation}"]`).waitFor();
  await page.locator('#kd-wochen-editor').waitFor({ state: 'detached' });
}
async function openNew(page) { await page.getByRole('button', { name: 'Eintrag', exact: true }).click(); }
async function save(page) {
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.locator('#kd-wochen-editor').waitFor({ state: 'detached' });
}
async function geometry(page, context) {
  await page.locator('.kd-wochen-tage').scrollIntoViewIfNeeded();
  const measure = () => page.locator('.kd-wochen-tage').evaluate(el => {
    const rect = e => { const r = e.getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height }; };
    return { fieldset: rect(el), labels: [...el.querySelectorAll('label')].map(rect) };
  });
  const boxes = await measure();
  assert.equal(boxes.labels.length, 7);
  for (const [i, r] of boxes.labels.entries()) {
    assert.ok(r.width >= 44 && r.height >= 44, `${context} day ${i}: 44x44`);
    assert.ok(r.left >= boxes.fieldset.left && r.right <= boxes.fieldset.right + .01 && r.top >= boxes.fieldset.top && r.bottom <= boxes.fieldset.bottom + .01, `${context}: contained`);
    for (const s of boxes.labels.slice(i + 1)) assert.ok(r.right <= s.left || s.right <= r.left || r.bottom <= s.top || s.bottom <= r.top, `${context}: disjoint`);
  }
  // Start with all selected, keeping an independent guard day during each tap pair.
  for (let i = 0; i < 7; i++) if (!(await state(page))[i]) await page.locator('.kd-wochen-tage label').nth(i).click();
  let taps = 0;
  for (let i = 0; i < 7; i++) for (const point of ['center', 'left', 'right', 'top', 'bottom']) {
    const r = (await measure()).labels[i];
    const x = point === 'left' ? r.left + 1 : point === 'right' ? r.right - 1 : (r.left + r.right) / 2;
    const y = point === 'top' ? r.top + 1 : point === 'bottom' ? r.bottom - 1 : (r.top + r.bottom) / 2;
    assert.equal(await page.evaluate(({x,y}) => [...document.querySelectorAll('.kd-wochen-tage label')].indexOf(document.elementFromPoint(x,y)?.closest('label')), {x,y}), i);
    const before = await state(page);
    if (point === 'center') await page.mouse.click(x, y); else await page.touchscreen.tap(x, y);
    const after = await state(page);
    assert.deepEqual(after.map((v,j) => v !== before[j] ? j : -1).filter(j => j >= 0), [i], `${context} ${i} ${point}`);
    await page.touchscreen.tap(x, y); taps += 2;
  }
  for (let i = 1; i < 7; i++) await page.locator('.kd-wochen-tage label').nth(i).click();
  await page.locator('.kd-wochen-tage label').first().click();
  assert.deepEqual(await state(page), [true,false,false,false,false,false,false], 'at least one day');
  return { ...boxes, taps };
}
try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch({ headless: true });
    try {
      for (const theme of (process.env.KD_P09_GEOMETRY && process.env.KD_P09_GEOMETRY !== engine ? [] : ['dunkel','hell','showa','neon-noir'])) for (const width of [320,375,393,430]) {
        const page = await browser.newPage({ viewport: {width,height:852}, hasTouch: true, isMobile: true, timezoneId: 'Europe/Vienna' });
        const errors = [], blocked = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', r => r.request().url().startsWith(url) ? r.continue() : (blocked.push(r.request().url()), r.abort()));
        await page.clock.install({ time: new Date('2026-12-31T10:00:00+01:00') });
        await page.goto(`${url}?theme=${theme}`);
        await openNew(page);
        await page.evaluate(() => document.fonts.ready);
        const created = await geometry(page, `${engine}/${theme}/${width}/new`);
        await reset(page, true);
        await edit(page);
        const edited = await geometry(page, `${engine}/${theme}/${width}/edit`);
        assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
        results.push({ engine, version: browser.version(), theme, width, created, edited });
        await page.close();
      }
      if (!process.env.KD_P09_GEOMETRY || process.env.KD_P09_GEOMETRY === engine) console.log(`${engine}: 32 editor layouts; centers and four edges of all seven labels PASS`);
      if (process.env.KD_P09_FORMS === '0') continue;
      const page = await browser.newPage({ viewport: {width:393,height:852}, timezoneId: 'Europe/Vienna' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => r.request().url().startsWith(url) ? r.continue() : r.abort());
      await page.clock.install({ time: new Date('2026-12-31T10:00:00+01:00') });
      await page.goto(url);
      // Real new/edit forms, persisted through normalization and JSON/localStorage readback.
      for (const art of ['termin','kino','konzert','folge','staffel']) {
        await reset(page); await openNew(page);
        await page.getByRole('textbox', {name:'Titel',exact:true}).fill(`Standard ${art}`);
        await page.getByRole('combobox', {name:'Art',exact:true}).selectOption(art);
        await page.getByRole('combobox', {name:'Wiederholen bis',exact:true}).selectOption('anzahl');
        assert.equal(await page.getByRole('spinbutton', {name:'Anzahl Termine'}).inputValue(), '12');
        await save(page);
        const result = await page.evaluate(() => window.inspectSaved());
        assert.deepEqual(result.entry.ende, {typ:'anzahl',anzahl:12});
        assert.equal(result.twelfthDue, true); assert.equal(result.thirteenthDue, false); assert.match(result.ics, /COUNT=12/);
      }
      for (const initial of [{typ:'nie'},{typ:'datum',datum:'2027-12-31'},{typ:'anzahl',anzahl:7}]) {
        await reset(page, true, initial); await edit(page); await save(page);
        assert.deepEqual(await page.evaluate(() => window.saved.eintraege[0].ende), initial, 'existing ending retained');
        await edit(page);
        await page.getByRole('combobox', {name:'Wiederholen bis',exact:true}).selectOption('anzahl');
        if (initial.typ === 'anzahl') await page.getByRole('spinbutton', {name:'Anzahl Termine'}).fill('9');
        await save(page);
        assert.deepEqual(await page.evaluate(() => window.saved.eintraege[0].ende), {typ:'anzahl',anzahl:initial.typ === 'anzahl' ? 9 : 12});
      }
      for (const mode of ['new','edit']) for (const nonempty of [false,true]) for (const title of ['', '   ']) {
        await reset(page, nonempty || mode === 'edit');
        if (mode === 'edit') { await edit(page); if (!nonempty) await page.evaluate(() => window.replacePlan({version:1,eintraege:[]})); }
        else await openNew(page);
        const before = await page.evaluate(() => JSON.stringify(window.saved));
        await page.getByPlaceholder('Was möchtest du vormerken?').fill(title);
        await page.getByRole('button', {name:'Speichern',exact:true}).click();
        await page.locator('#kd-wochen-titelfehler').waitFor({state:'visible'});
        assert.equal(await page.locator('#kd-wochen-titelfehler').textContent(), 'Bitte gib einen Titel ein.');
        assert.equal(await page.evaluate(() => window.writes.length), 0);
        assert.equal(await page.evaluate(() => JSON.stringify(window.saved)), before);
        await page.getByPlaceholder('Was möchtest du vormerken?').fill('Korrigiert');
        await save(page);
        assert.equal(await page.evaluate(() => window.writes.length), 1);
        assert.equal(await page.evaluate(() => window.saved.eintraege.at(-1).titel), 'Korrigiert');
      }
      assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.rejections), []);
      console.log(`${engine}: five default-count creations, six ending edits, eight invalid/corrected title paths PASS`);
      await page.close();
    } finally { await browser.close(); }
  }
  await writeFile(join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} browser/theme/width combinations, each new + edit. Geometry evidence: ${out}/results.json`);
} finally { await new Promise(r => server.close(r)); }
