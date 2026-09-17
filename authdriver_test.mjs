/* P01: real product modules, delayed mock responses, no provider/network. */
import assert from 'node:assert/strict';
import { createAuthDriver, AUTH_SESSION_KEY } from './src/lib/authDriver.js';
import { createAuthService } from './src/services/auth.js';
import { createSessionCoordinator } from './src/services/sessionCoordinator.js';
import { createAccountDriver } from './src/lib/accountDriver.js';

const config = { supabaseUrl: 'https://p01.supabase.co', supabasePublishableKey: 'sb_publishable_mock' };
const reply = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const serialLocks = () => {
  const tails = new Map();
  return { request(name, fn) {
    const p = (tails.get(name) || Promise.resolve()).catch(() => {}).then(fn);
    tails.set(name, p.catch(() => {}));
    return p;
  } };
};
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('✓ ' + name); }
function fixture(locks = null, clockSkewMs = 0) {
  const data = new Map();
  globalThis.localStorage = {
    getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k), key: i => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  globalThis.fetch = () => { throw new Error('Unexpected real network'); };
  let now = 1_800_000_000_000;
  const calls = [];
  let refreshReply = null;
  let refreshStarted = deferred();
  const payload = (id = 'a', suffix = 'login') => ({
    access_token: `${id}-${suffix}`, refresh_token: `${id}-rt-${suffix}`,
    expires_at: (now + 3600_000) / 1000, user: { id, email: `${id}@login.kinodreieck.at` },
  });
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('grant_type=password')) return reply(200, payload(JSON.parse(opts.body).email.split('@')[0]));
    if (url.includes('grant_type=refresh_token')) {
      refreshStarted.resolve();
      return refreshReply ? refreshReply.promise : reply(200, payload('a', 'rotated'));
    }
    if (url.endsWith('/logout')) throw new TypeError('Server logout offline');
    if (url.includes('kd_account_access')) return reply(200, [{ role: 'member', active: true, personal_ai: false }]);
    throw new Error('Unexpected mock route');
  };
  const driver = () => createAuthDriver({ config, fetchImpl, jetzt: () => now - clockSkewMs, locks });
  const coordinator = d => createSessionCoordinator({
    auth: createAuthService({ driver: d }), eventTarget: null,
    storage: {
      cacheOwner: () => null, active: () => false, status: () => ({}),
      cleanupOrphanMetadata: () => true, deactivate() {}, prepare() {},
      preparedAccountId: () => null, masked: () => false,
    }, adoption: { isConfirmed: () => false },
  });
  return { driver, coordinator, data, calls, payload,
    expire() { now += 3600_000; },
    delay() { refreshReply = deferred(); refreshStarted = deferred(); return { ...refreshReply, started: refreshStarted.promise }; },
    stored: () => JSON.parse(data.get(AUTH_SESSION_KEY) || 'null'),
  };
}
for (const withLocks of [false, true]) {
  const label = withLocks ? 'Web Lock' : 'process fallback';
  for (const response of ['success', 'invalid_grant', 'offline']) {
    for (const transition of ['logout', 'b', 'same-login']) {
      await test(`${label}: late ${response} after ${transition}, snapshot + resume`, async () => {
        const f = fixture(withLocks ? serialLocks() : null);
        const a = f.driver(), ca = f.coordinator(a);
        await ca.signIn('a', 'mock');
        const oldId = f.stored().sitzungsId;
        f.expire();
        const delayed = f.delay();
        const pending = a.getAccessToken();
        await delayed.started;
        let current = ca;
        if (transition !== 'b') await ca.signOut();
        if (transition !== 'logout') {
          current = f.coordinator(f.driver());
          await current.signIn(transition === 'b' ? 'b' : 'a', 'mock');
          assert.notEqual(f.stored().sitzungsId, oldId);
        }
        const afterTransition = f.data.get(AUTH_SESSION_KEY);
        if (response === 'offline') delayed.reject(new TypeError('offline'));
        else delayed.resolve(response === 'success' ? reply(200, f.payload('a', 'late')) : reply(400, { error: 'invalid_grant' }));
        assert.equal(await pending, null, 'old caller must not obtain old or replacement bearer');
        assert.equal(f.data.get(AUTH_SESSION_KEY), afterTransition);
        assert.equal(current.getSnapshot().mode, transition === 'logout' ? 'guest' : 'account');
        await current.refresh();
        assert.equal(current.getSnapshot().account?.id ?? null, transition === 'logout' ? null : transition === 'b' ? 'b' : 'a');
        assert.equal(/access_token|refresh_token/.test(JSON.stringify(current.getSnapshot())), false);
      });
    }
  }
  await test(`${label}: fresh normal token, force, single-flight, account guard`, async () => {
    const f = fixture(withLocks ? serialLocks() : null), d = f.driver();
    await d.signIn('a', 'mock');
    assert.equal(await d.getAccessToken(), 'a-login');
    assert.equal(f.calls.filter(c => c.url.includes('refresh_token')).length, 0);
    assert.equal(await d.getAccessToken({ erwarteteKontoId: 'b', erzwingeErneuerung: true }), null);
    const delayed = f.delay();
    const all = [d.refresh(), d.getAccessToken({ erzwingeErneuerung: true }), d.getAccessToken({ erzwingeErneuerung: true })];
    await delayed.started;
    delayed.resolve(reply(200, f.payload('a', 'forced')));
    const result = await Promise.all(all);
    assert.equal(result[1], 'a-forced'); assert.equal(result[2], 'a-forced');
    assert.equal(f.calls.filter(c => c.url.includes('refresh_token')).length, 1);
  });
  for (const outcome of ['ok', '401', 'invalid_grant', 'offline']) {
    await test(`${label}: real account 401 / clock skew / ${outcome} bounded retry`, async () => {
      const f = fixture(withLocks ? serialLocks() : null, 600_000), d = f.driver();
      await d.signIn('a', 'mock'); // absolute server expiry from password response
      f.expire(); // server expiry reached, device still ten minutes behind
      f.data.set('kd:master', 'KEEP');
      const delayed = f.delay();
      const bearers = [];
      const account = createAccountDriver({ config, getAccessToken: opts => d.getAccessToken({ ...opts, erwarteteKontoId: 'a' }),
        fetchImpl: async (_url, opts) => {
          bearers.push(opts.headers.Authorization);
          return reply(bearers.length === 1 || outcome !== 'ok' ? 401 : 200, []);
        },
      });
      const call = account.connectionTest();
      await delayed.started;
      if (outcome === 'offline') delayed.reject(new TypeError('offline'));
      else delayed.resolve(outcome === 'invalid_grant' ? reply(400, { error: 'invalid_grant' }) : reply(200, f.payload('a', 'forced')));
      const result = await call;
      assert.equal(result.ok, outcome === 'ok');
      assert.equal(bearers.length, outcome === 'invalid_grant' ? 1 : 2);
      if (outcome === 'ok' || outcome === '401') assert.deepEqual(bearers, ['Bearer a-login', 'Bearer a-forced']);
      assert.equal(f.calls.filter(c => c.url.includes('refresh_token')).length, 1);
      assert.equal(f.data.get('kd:master'), 'KEEP');
      if (outcome === 'offline') assert.equal(f.stored().access_token, 'a-login');
      if (outcome === 'invalid_grant') assert.equal(f.stored(), null);
    });
  }
}
for (const withLocks of [false, true]) {
  await test(`Mixed near-expiry regular + forced calls share one actual refresh / web=${withLocks}`, async () => {
    const f = fixture(withLocks ? serialLocks() : null), d = f.driver();
    await d.signIn('a', 'mock'); f.expire();
    const delayed = f.delay();
    const regular = d.getAccessToken(); await delayed.started;
    const forced = d.getAccessToken({ erzwingeErneuerung: true });
    delayed.resolve(reply(200, f.payload('a', 'mixed')));
    assert.deepEqual(await Promise.all([regular, forced]), ['a-mixed', 'a-mixed']);
    assert.equal(f.calls.filter(c => c.url.includes('refresh_token')).length, 1);
  });
}
await test('Late force after request-free rotation adoption is not lost', async () => {
  const acquired = deferred(), resume = deferred(), adopted = deferred(), finish = deferred();
  let first = true;
  const f = fixture({ async request(name, fn) {
    if (name !== 'kd:auth:refresh' || !first) return fn();
    first = false; acquired.resolve(); await resume.promise;
    const value = await fn(); adopted.resolve(); await finish.promise; return value;
  } });
  const a = f.driver(); await a.signIn('a', 'mock'); f.expire();
  const normal = a.getAccessToken(); await acquired.promise;
  // Another real driver commits a rotation before the waiting lock is entered.
  const b = createAuthDriver({ config, jetzt: () => 1_800_003_600_000,
    fetchImpl: async () => reply(200, f.payload('a', 'other')) });
  await b.getAccessToken({ erzwingeErneuerung: true });
  resume.resolve(); await adopted.promise;
  const force = a.getAccessToken({ erzwingeErneuerung: true });
  finish.resolve(); await normal;
  assert.equal(await force, 'a-rotated');
  assert.equal(f.calls.filter(c => c.url.includes('refresh_token')).length, 1);
});
await test('Web Lock waiting force adopts a genuinely rotated same-login token', async () => {
  const locks = serialLocks(), f = fixture(locks), a = f.driver(), b = f.driver();
  await a.signIn('a', 'mock');
  const delayed = f.delay();
  const first = a.getAccessToken({ erzwingeErneuerung: true });
  await delayed.started;
  const second = b.getAccessToken({ erzwingeErneuerung: true });
  delayed.resolve(reply(200, f.payload('a', 'other-tab')));
  assert.deepEqual(await Promise.all([first, second]), ['a-other-tab', 'a-other-tab']);
  assert.equal(f.calls.filter(c => c.url.includes('refresh_token')).length, 1);
});
for (const outcome of ['success', 'invalid_grant']) {
  await test(`Late ${outcome} cannot replace/delete a newer token rotation of the same login`, async () => {
    const f = fixture(), a = f.driver(); await a.signIn('a', 'mock'); f.expire();
    const delayed = f.delay(); const pending = a.getAccessToken(); await delayed.started;
    const b = createAuthDriver({ config, jetzt: () => 1_800_003_600_000,
      fetchImpl: async () => reply(200, f.payload('a', 'winner')) });
    assert.equal(await b.getAccessToken(), 'a-winner');
    const committed = f.data.get(AUTH_SESSION_KEY);
    delayed.resolve(outcome === 'success' ? reply(200, f.payload('a', 'loser')) : reply(400, { error: 'invalid_grant' }));
    assert.equal(await pending, 'a-winner');
    assert.equal(f.data.get(AUTH_SESSION_KEY), committed);
  });
}
await test('Commit lock rejection never falls back to an unprotected credential write', async () => {
  const f = fixture({ request: async () => { throw new Error('denied'); } });
  await assert.rejects(f.driver().signIn('a', 'mock'));
  assert.equal(f.stored(), null);
});
for (const target of ['a', 'b']) {
  await test(`Forced request waiting in Web Lock rejects a new ${target} login`, async () => {
    const locks = serialLocks(), f = fixture(locks), a = f.driver(), b = f.driver();
    await a.signIn('a', 'mock');
    const gate = deferred();
    const blocker = locks.request('kd:auth:refresh', () => gate.promise);
    const pending = a.getAccessToken({ erzwingeErneuerung: true });
    await b.signIn(target, 'mock');
    gate.resolve(); await blocker;
    assert.equal(await pending, null);
    assert.equal(f.stored().kontoId, target);
    assert.equal(f.calls.filter(c => c.url.includes('refresh_token')).length, 0);
  });
}
await test('Reauthentication cannot overwrite a login committed while password response was pending', async () => {
  const f = fixture(), a = f.driver();
  await a.signIn('a', 'mock');
  const gate = deferred();
  const stale = createAuthDriver({ config, jetzt: () => 1_800_000_000_000, fetchImpl: () => gate.promise });
  const pending = stale.reauthenticate('mock');
  await f.driver().signIn('b', 'mock');
  gate.resolve(reply(200, f.payload('a', 'reauth')));
  await assert.rejects(pending);
  assert.equal(f.stored().kontoId, 'b');
});
await test('Browser without a safe mutex preserves credentials and rejects commits', async () => {
  const f = fixture(), d = f.driver();
  await d.signIn('a', 'mock'); f.expire();
  const before = f.data.get(AUTH_SESSION_KEY);
  globalThis.window = {};
  try {
    assert.equal(await d.getAccessToken(), null);
    await assert.rejects(d.signOut());
    await assert.rejects(d.signIn('b', 'mock'));
    assert.equal(f.data.get(AUTH_SESSION_KEY), before);
  } finally { delete globalThis.window; }
});
console.log(`P01 AUTH DRIVER: ${checks}/${checks}`);
