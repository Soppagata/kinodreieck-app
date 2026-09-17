// Real baseline modules and current Edge handler; only transport/auth are doubles.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium, webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createEntdeckenDailyFeedService } from '../../src/services/entdeckenDailyFeed.js';
import { webDiscoveryFeedCards } from '../../src/lib/entdeckenUi.js';
import { targetTitle } from './review49_p08_feed.mjs';

export async function createReaderMatrix() {
  const root = mkdtempSync(join(tmpdir(), 'kd-review49-rollout-p08-readers-'));
  const baseline = '14804ce389d69114feed27b92fb11ac78423cc0e';
  const archive = execFileSync('git', ['archive', baseline, 'src', 'supabase', 'package.json'], { maxBuffer: 32_000_000 });
  execFileSync('tar', ['-xf', '-', '-C', root], { input: archive });
  symlinkSync(realpathSync('node_modules'), join(root, 'node_modules'), 'dir');
  mkdirSync(join(root, 'tests/fixtures'), { recursive: true });
  writeFileSync(join(root, 'tests/fixtures/review49_p08_feed.mjs'), readFileSync('tests/fixtures/review49_p08_feed.mjs'));
  const oldProducer = await import(join(root, 'tests/fixtures/review49_p08_feed.mjs'));
  const oldReader = await import(join(root, 'src/services/entdeckenDailyFeed.js'));
  const oldValidator = await import(join(root, 'src/lib/webDiscoveryFeed.js'));
  const esbuild = createRequire(import.meta.resolve('vite'))('esbuild');
  const handlers = {};
  const browserServices = {};
  for (const [name, dir] of [['new', resolve('.')], ['old', root]]) {
    const output = join(root, `${name}-handler.mjs`);
    await esbuild.build({ entryPoints: [join(dir, 'supabase/functions/entdecken-daily-task/index.ts')], outfile: output,
      bundle: true, platform: 'node', format: 'esm', target: 'es2022', logLevel: 'silent',
      plugins: [{ name: 'local-supabase-only', setup(build) {
        build.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: 'local-auth-rpc', namespace: 'p08' }));
        build.onLoad({ filter: /.*/, namespace: 'p08' }, () => ({ contents: 'export const createClient = (...args) => globalThis.__p08CreateClient(...args);', loader: 'js' }));
      } }],
    });
    handlers[name] = (await import(output)).createEntdeckenDailyHandler;
    const service = await esbuild.build({ entryPoints: [join(dir, 'src/services/entdeckenDailyFeed.js')], write: false, bundle: true, platform: 'browser',
      format: 'iife', globalName: 'P08Reader', logLevel: 'silent' });
    browserServices[name] = service.outputFiles[0].text;
  }
  esbuild.stop();
  const accountId = '00000000-0000-4000-8000-000000000001';
  const session = { mode: 'account', state: 'ready', account: { id: accountId }, capabilities: { remoteStorage: true } };
  const noNetwork = async () => { throw Error('External network forbidden'); };
  const previousFetch = globalThis.fetch, previousDeno = globalThis.Deno;
  globalThis.fetch = noNetwork;
  globalThis.Deno = { env: { get: (key) => ({ SUPABASE_URL: 'https://local.invalid', SUPABASE_ANON_KEY: 'synthetic-public', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' })[key] } };
  let statusRead, role = 'member', active = true, claimsRole = 'authenticated', calls = [];
  globalThis.__p08CreateClient = () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: accountId, role: claimsRole } } }),
      getUser: async () => ({ data: { user: { id: accountId } } }) },
    from: (table) => {
      assert.equal(table, 'kd_account_access');
      const query = { select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: { role, active, personal_ai: false } }) };
      return query;
    },
    rpc: async (name) => { calls.push(name); assert.equal(name, 'kd_entdecken_weekly_feed_status'); return { data: await statusRead() }; },
  });
  const handler = handlers.new({ fetchImpl: noNetwork });
  const oldHandler = handlers.old({ fetchImpl: noNetwork });
  const headers = { Authorization: 'Bearer synthetic-token', apikey: 'synthetic-public', Origin: 'https://staging.kinodreieck.at' };
  const url = 'https://local.invalid/functions/v1/entdecken-daily-task';
  async function request(accept, options = {}) {
    return handler(new Request(url, { method: 'GET', ...options, headers: { ...headers, ...(accept ? { Accept: accept } : {}), ...options.headers } }));
  }
  async function verify({ feed, today, readStatus, writer = 'new' }) {
    statusRead = readStatus;
    calls = []; role = 'member'; active = true; claimsRole = 'authenticated';
    const expectedBase = structuredClone(feed); delete expectedBase.annotations;
    const states = {};
    for (const [name, makeService] of [['old', oldReader.createEntdeckenDailyFeedService], ['new', createEntdeckenDailyFeedService]]) {
      let wire;
      const state = await makeService({ config: { entdeckenDailyFeedEnabled: true, supabaseUrl: 'https://local.invalid', supabasePublishableKey: 'synthetic-public' },
        auth: { getSnapshot: () => session }, getAccount: () => session.account, getAccessToken: async () => 'synthetic-token', currentDay: () => today,
        fetchImpl: async (target, init) => { const response = await handler(new Request(target, { ...init, headers: { ...init.headers, Origin: headers.Origin } }));
          assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(response.headers.get('vary'), /Accept/);
          wire = await response.clone().json(); return response; },
      }).load();
      assert.ok(['fresh', 'stale'].includes(state.status), `${writer}/${name}: ${state.status}`);
      assert.equal(state.feedOrigin, 'server'); assert.equal(state.feed.items.length, 50);
      assert.deepEqual(state.feed, name === 'old' ? expectedBase : feed);
      assert.equal(wire.providerRequests, 0); assert.equal(wire.writes, 0); assert.equal(wire.wikidataRequests, 0);
      states[name] = state;
    }
    assert.equal(calls.length, 2);
    for (const edge of [oldHandler, handler]) {
      const preflight = await edge(new Request(url, { method: 'OPTIONS', headers: {
        Origin: headers.Origin, 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'apikey,authorization',
      } }));
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), headers.Origin);
      for (const key of ['apikey', 'authorization']) assert.ok(preflight.headers.get('access-control-allow-headers').split(/,\s*/).includes(key));
    }
    if (writer === 'old') {
      const oldServerResponse = await oldHandler(new Request(url, { headers: { ...headers, Accept: 'application/json; kd-entdecken=oefi-v1' } }));
      assert.equal(oldServerResponse.status, 200);
      assert.deepEqual((await oldServerResponse.json()).feed, feed);
    }
    assert.equal(states.new.status, feed.validUntil < today ? 'stale' : 'fresh');
    assert.equal(states.old.status, states.new.status);
    assert.equal(oldValidator.validateWebDiscoveryFeed(states.old.feed).ok, true);
    if (feed.annotations?.length) assert.equal(oldValidator.validateWebDiscoveryFeed(feed).ok, false, 'negative control: unprojected new payload breaks baseline');
    const now = new Date(`${today}T10:00:00Z`);
    const film = { t: targetTitle, j: 2024, film_at_id: '95001', g: ['Drama'], z: [`${today}T23:59:59Z`] };
    const cards = (program) => webDiscoveryFeedCards({ webDiscoveryFeed: states.new.feed, program, now }).filter(r => r.sourceId === 'chart:oefi-weekend-at');
    const chart = cards({ filme: [film] });
    assert.equal(chart.length, feed.annotations?.length ? 1 : 0);
    if (chart.length) { assert.equal(chart[0].filmAtId, '95001'); assert.deepEqual(chart[0].popularity, feed.items[0].popularity);
      assert.equal(chart[0].externalEvidence[0].url, feed.items[0].sourceUrl); }
    for (const program of [null, { filme: [{ ...film, j: 1994 }] }, { filme: [film, { ...film, film_at_id: '95002' }] },
      { filme: [{ ...film, z: [] }] }, { filme: [{ ...film, z: ['2000-01-01T20:00:00Z'] }] }]) assert.equal(cards(program).length, 0);
    for (const accept of [null, 'application/json', 'application/json; kd-entdecken=oefi-v2', 'application/json; kd-entdecken=oefi-v1, */*']) {
      const body = await (await request(accept)).json(); assert.deepEqual(body.feed, expectedBase);
    }
    // Read negotiation never confers account/owner privileges.
    for (const mutation of [() => { active = false; }, () => { role = 'stranger'; }, () => { claimsRole = 'anon'; }]) {
      active = true; role = 'member'; claimsRole = 'authenticated'; mutation();
      const before = calls.length;
      assert.equal((await request('application/json; kd-entdecken=oefi-v1')).status, 403);
      assert.equal(calls.length, before);
    }
    active = true; role = 'owner'; claimsRole = 'authenticated';
    assert.equal((await request('application/json; kd-entdecken=oefi-v1')).status, 200);
    role = 'member';
    assert.equal((await request('application/json; kd-entdecken=oefi-v1', { method: 'POST' })).status, 403);
    assert.equal((await request('application/json; kd-entdecken=oefi-v1', { method: 'POST', headers: { 'x-kd-entdecken-refresh': 'owner-v1' } })).status, 403);
    // The real services retain the complete fallback on transport failure.
    for (const makeService of [oldReader.createEntdeckenDailyFeedService, createEntdeckenDailyFeedService]) {
      const state = await makeService({ config: { entdeckenDailyFeedEnabled: true, supabaseUrl: 'https://local.invalid', supabasePublishableKey: 'synthetic-public' },
        auth: { getSnapshot: () => session }, getAccount: () => session.account, getAccessToken: async () => 'synthetic-token', currentDay: () => today,
        fallbackFeed: expectedBase, fetchImpl: noNetwork }).load();
      assert.equal(state.feed.items.length, 50); assert.equal(state.feedOrigin, 'embedded_fallback'); assert.equal(state.retrievalStatus, 'unavailable');
    }
    return states;
  }
  async function verifyBrowser({ feed, today, readStatus, writer }) {
    statusRead = readStatus; role = 'member'; active = true; claimsRole = 'authenticated';
    const edge = writer === 'old' ? oldHandler : handler;
    const requests = [];
    const server = createServer(async (req, res) => {
      try {
        requests.push({ method: req.method, headers: req.headers });
        const response = await edge(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers }));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
      } catch (error) { console.error(error); res.writeHead(500); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    // A real second origin preserves native CORS/preflight behavior; routing
    // an intercepted page can bypass preflights in browser automation.
    const pageServer = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>P08 local transport</title>'); });
    try {
      await new Promise((resolve, reject) => { pageServer.once('error', reject); pageServer.listen(5173, 'localhost', resolve); });
      for (const engine of [chromium, webkit]) {
        const browser = await engine.launch({ headless: true });
        try {
          for (const [name, source] of Object.entries(browserServices)) {
            const page = await browser.newPage();
            const errors = []; page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
            page.on("requestfailed", req => errors.push(req.failure()?.errorText));
            await page.goto('http://localhost:5173/');
            await page.addScriptTag({ content: source });
            const before = requests.length;
            const state = await page.evaluate(async ({ base, today, accountId }) => {
              const session = { mode: 'account', state: 'ready', account: { id: accountId }, capabilities: { remoteStorage: true } };
              return P08Reader.createEntdeckenDailyFeedService({
                config: { entdeckenDailyFeedEnabled: true, supabaseUrl: base, supabasePublishableKey: 'synthetic-public' },
                auth: { getSnapshot: () => session }, getAccount: () => session.account,
                getAccessToken: async () => 'synthetic-token', currentDay: () => today,
              }).load();
            }, { base: `http://127.0.0.1:${server.address().port}`, today, accountId });
            assert.equal(state.feedOrigin, 'server', `${engine.name()}/${writer}/${name}: ${state.status} ${JSON.stringify(errors)} requests=${JSON.stringify(requests.slice(before))}`);
            assert.equal(state.feed.items.length, 50);
            const expected = structuredClone(feed); if (name === 'old') delete expected.annotations;
            assert.deepEqual(state.feed, expected);
            const actual = requests.slice(before);
            assert.ok(actual.some(r => r.method === 'OPTIONS'), `real browser preflight observed ${engine.name()}/${name} ${JSON.stringify(actual)}`);
            const get = actual.find(r => r.method === 'GET'); assert.ok(get);
            assert.equal(get.headers.accept, name === 'new' ? 'application/json; kd-entdecken=oefi-v1' : 'application/json');
            assert.ok(actual.filter(r => r.method === 'OPTIONS').every(r => !r.headers['access-control-request-headers'].includes('accept')), 'Accept value remains CORS safelisted');
            await page.close();
          }
        } finally { await browser.close(); }
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
      if (pageServer.listening) await new Promise(resolve => pageServer.close(resolve));
    }
  }
  return { oldProducer: oldProducer.createProducer, verify, verifyBrowser, close() {
    globalThis.fetch = previousFetch; globalThis.Deno = previousDeno; delete globalThis.__p08CreateClient;
    rmSync(root, { recursive: true, force: true });
  } };
}
