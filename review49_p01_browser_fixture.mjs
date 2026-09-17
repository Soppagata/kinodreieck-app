import { createAuthDriver, AUTH_SESSION_KEY } from './src/lib/authDriver.js';
import { createAuthService } from './src/services/auth.js';
import { createSessionCoordinator } from './src/services/sessionCoordinator.js';
import { createAccountDriver } from './src/lib/accountDriver.js';
export function setup(withLocks) {
  const config = { supabaseUrl: 'https://p01.supabase.co', supabasePublishableKey: 'sb_publishable_mock' };
  let now = 1_800_000_000_000;
  let release;
  const f = { refreshCalls: 0, started: false, pending: null };
  const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
  const payload = (id, kind) => ({ access_token: `${id}-${kind}`, refresh_token: `${id}-rt-${kind}`,
    expires_in: 3600, user: { id, email: `${id}@login.kinodreieck.at` } });
  const fetchImpl = async (url, opts) => {
    if (url.includes('grant_type=password')) return response(200, payload(JSON.parse(opts.body).email.split('@')[0], 'login'));
    if (url.includes('grant_type=refresh_token')) {
      f.refreshCalls++; f.started = true;
      if (!f.delayed) return response(200, payload('a', 'rotated'));
      return new Promise(resolve => { release = resolve; });
    }
    if (url.endsWith('/logout')) throw new TypeError('logout offline');
    if (url.includes('kd_account_access')) return response(200, [{ role: 'member', active: true, personal_ai: false }]);
    throw new Error('Unexpected mock request');
  };
  f.driver = createAuthDriver({ config, fetchImpl, jetzt: () => now, locks: withLocks ? navigator.locks : null });
  f.coordinator = createSessionCoordinator({ auth: createAuthService({ driver: f.driver }), eventTarget: null,
    storage: { cacheOwner: () => null, active: () => false, status: () => ({}), cleanupOrphanMetadata: () => true,
      deactivate() {}, prepare() {}, preparedAccountId: () => null, masked: () => false },
    adoption: { isConfirmed: () => false },
  });
  f.expire = () => { now += 3600_000; };
  f.stored = () => JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
  f.resolve = outcome => release(outcome === 'success' ? response(200, payload('a', 'late')) : response(400, { error: 'invalid_grant' }));
  f.accountProbe = async () => {
    const bearers = [];
    const account = createAccountDriver({ config, getAccessToken: options => f.driver.getAccessToken({ ...options, erwarteteKontoId: 'a' }),
      fetchImpl: async (_url, options) => {
        bearers.push(options.headers.Authorization);
        return response(bearers.length === 1 ? 401 : 200, []);
      },
    });
    return { result: await account.connectionTest(), bearers, refreshCalls: f.refreshCalls };
  };
  globalThis.fetch = () => { throw new Error('Unexpected network'); };
  return f;
}
