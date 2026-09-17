/* Two isolated JS realms, shared real localStorage/IndexedDB/Web Locks.
   Only local static files are served; every Auth/REST request is injected. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const root = new URL('./', import.meta.url);
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.end('<!doctype html><title>P01 local tests</title>'); return; }
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!path.startsWith('/src/') && path !== '/review49_p01_browser_fixture.mjs') throw new Error('Denied');
    const file = new URL('.' + path, root);
    if (!file.href.startsWith(root.href)) throw new Error('Denied');
    res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, checks = 0;
try {
  browser = await chromium.launch({ headless: true });
  for (const withLocks of [false, true]) {
    for (const transition of ['logout', 'b', 'same-login']) {
      for (const outcome of ['success', 'invalid_grant']) {
        const context = await browser.newContext();
        await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
        const a = await context.newPage(), b = await context.newPage();
        for (const page of [a, b]) {
          await page.goto(origin);
          await page.evaluate(async enabled => { const { setup } = await import('/review49_p01_browser_fixture.mjs'); window.f = setup(enabled); }, withLocks);
        }
        await a.evaluate(async () => {
          await f.coordinator.signIn('a', 'mock'); f.expire(); f.delayed = true;
          f.pending = f.driver.getAccessToken();
        });
        await a.waitForFunction(() => f.started);
        if (transition !== 'b') await b.evaluate(() => f.coordinator.signOut());
        if (transition !== 'logout') await b.evaluate(id => f.coordinator.signIn(id, 'mock'), transition === 'b' ? 'b' : 'a');
        const expected = await b.evaluate(() => localStorage.getItem('kd:auth:session'));
        await a.evaluate(outcome => f.resolve(outcome), outcome);
        assert.equal(await a.evaluate(() => f.pending), null);
        assert.equal(await a.evaluate(() => localStorage.getItem('kd:auth:session')), expected);
        await b.evaluate(() => f.coordinator.refresh());
        const snapshot = await b.evaluate(() => f.coordinator.getSnapshot());
        assert.equal(snapshot.account?.id ?? null, transition === 'logout' ? null : transition === 'b' ? 'b' : 'a');
        assert.equal(/access_token|refresh_token/.test(JSON.stringify(snapshot)), false);
        // The coordination store is empty: no duplicated tokens or personal data.
        const count = await b.evaluate(() => new Promise((resolve, reject) => {
          const r = indexedDB.open('kd-auth-commit', 1);
          r.onsuccess = () => { const db = r.result; const t = db.transaction('mutex'); const q = t.objectStore('mutex').count(); q.onsuccess = () => resolve(q.result); t.oncomplete = () => db.close(); };
          r.onerror = () => reject(r.error);
        }));
        assert.equal(count, 0);
        console.log(`✓ two tabs / ${withLocks ? 'Web Locks + IDB' : 'IDB fallback'} / ${transition} / ${outcome}`); checks++;
        await context.close();
      }
    }
    const context = await browser.newContext(), page = await context.newPage();
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await page.goto(origin);
    const probe = await page.evaluate(async enabled => {
      const { setup } = await import('/review49_p01_browser_fixture.mjs'); const f = setup(enabled);
      await f.driver.signIn('a', 'mock'); return f.accountProbe();
    }, withLocks);
    assert.equal(probe.result.ok, true); assert.equal(probe.refreshCalls, 1);
    assert.deepEqual(probe.bearers, ['Bearer a-login', 'Bearer a-rotated']);
    console.log(`✓ browser account 401 force / ${withLocks ? 'Web Locks + IDB' : 'IDB fallback'}`); checks++;
    await context.close();
  }
  // Hold a native readwrite transaction in one realm. Both a Web-Lock tab
  // and the no-Web-Lock fallback must wait before touching the session key.
  for (const withLocks of [false, true]) {
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const a = await context.newPage(), b = await context.newPage();
    for (const page of [a, b]) {
      await page.goto(origin);
      await page.evaluate(async enabled => { const { setup } = await import('/review49_p01_browser_fixture.mjs'); window.f = setup(enabled); }, withLocks);
    }
    await b.evaluate(() => f.driver.signIn('a', 'mock'));
    await b.evaluate(() => new Promise(resolve => {
      const r = indexedDB.open('kd-auth-commit', 1);
      r.onsuccess = () => {
        const db = r.result, tx = db.transaction('mutex', 'readwrite');
        window.holdCommit = true;
        const keep = () => {
          const q = tx.objectStore('mutex').get('hold');
          q.onsuccess = () => { resolve(); if (window.holdCommit) keep(); };
        };
        tx.oncomplete = () => db.close(); keep();
      };
    }));
    await a.evaluate(() => { f.done = false; f.pending = f.driver.signIn('b', 'mock').then(() => { f.done = true; }); });
    // A full event-loop turn plus its password response has run. The native
    // transaction must still prevent the credential commit in the other tab.
    await a.evaluate(() => new Promise(resolve => setTimeout(resolve, 40)));
    assert.equal(await a.evaluate(() => f.done), false);
    assert.equal(await b.evaluate(() => f.stored().kontoId), 'a');
    await b.evaluate(() => { window.holdCommit = false; });
    await a.evaluate(() => f.pending);
    assert.equal(await a.evaluate(() => f.stored().kontoId), 'b');
    console.log(`✓ native IDB transaction excludes credential commit / web=${withLocks}`); checks++;
    await context.close();
  }
  for (const failure of ['missing', 'denied']) {
    const context = await browser.newContext(), page = await context.newPage();
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await page.goto(origin);
    const result = await page.evaluate(async failure => {
      const { setup } = await import('/review49_p01_browser_fixture.mjs'); const f = setup(false);
      await f.driver.signIn('a', 'mock'); const before = localStorage.getItem('kd:auth:session');
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: failure === 'missing' ? undefined : { open() { throw new DOMException('denied', 'SecurityError'); } } });
      f.expire();
      const token = await f.driver.getAccessToken();
      let signOutRejected = false, signInRejected = false;
      try { await f.driver.signOut(); } catch { signOutRejected = true; }
      try { await f.driver.signIn('b', 'mock'); } catch { signInRejected = true; }
      return { token, signOutRejected, signInRejected, unchanged: before === localStorage.getItem('kd:auth:session'), refreshCalls: f.refreshCalls };
    }, failure);
    assert.deepEqual(result, { token: null, signOutRejected: true, signInRejected: true, unchanged: true, refreshCalls: 0 });
    console.log(`✓ browser IDB ${failure} fails closed without credential mutation`); checks++;
    await context.close();
  }
  console.log(`P01 BROWSER: ${checks}/${checks}`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
