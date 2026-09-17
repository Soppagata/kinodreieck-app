/* P02/E03-002: real Auth/Coordinator/Adoption/Storage/AccountDriver; only
   transport, browser storage and public runtime configuration are mocked. */
import assert from "node:assert/strict";
import { build, stop } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "kd-p02-load-"));
const bundle = join(directory, "product.mjs");
await build({
  stdin: { contents: `
    export * from './src/services/sessionCoordinator.js';
    export * from './src/services/storage.js';
    export * from './src/services/uebernahme.js';
    export { authService } from './src/services/auth.js';
    export { UEBERNAHME_SNAP } from './src/lib/uebernahme.js';
  `, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", outfile: bundle,
  define: { "import.meta.env": JSON.stringify({
    VITE_SUPABASE_URL: "https://p02-test.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mock",
  }) },
});
stop();

let count = 0;
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
try {
  for (const scenario of ["empty", "partial", "present-empty", "snapshot-failure", "pull-failure",
    "remove-failure", "silent-remove", "replace-failure", "silent-replace", "restore-failure", "explicit-adoption"]) {
    const values = new Map();
    let snapKey;
    let pullStarted = false;
    let removeFailed = false;
    let replaceFailed = false;
    globalThis.localStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (scenario === "snapshot-failure" && key === snapKey) throw Error("mock snapshot quota");
        if (pullStarted && key === "kd:master" && !replaceFailed
            && ["replace-failure", "silent-replace"].includes(scenario)) {
          replaceFailed = true;
          if (scenario === "replace-failure") throw Error("mock replacement quota");
          return;
        }
        if (scenario === "restore-failure" && pullStarted && key === "kd:master") throw Error("mock restore quota");
        values.set(key, String(value));
      },
      removeItem(key) {
        if (pullStarted && key === "kd:artikel" && !removeFailed
            && ["remove-failure", "silent-remove", "restore-failure"].includes(scenario)) {
          removeFailed = true;
          if (scenario !== "silent-remove") throw Error("mock remove denied");
          return;
        }
        values.delete(key);
      },
      key: (index) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    };
    const remote = new Map();
    const writes = [];
    let reads = 0;
    const remoteMaster = '{"filme":[{"id":"remote-film"}]}';
    if (["partial", "replace-failure", "silent-replace", "restore-failure"].includes(scenario)) {
      remote.set("kd:master", { key: "kd:master", value: remoteMaster, revision: 4 });
    }
    if (scenario === "present-empty") {
      remote.set("kd:master", { key: "kd:master", value: '{"filme":[]}', revision: 1 });
      remote.set("kd:artikel", { key: "kd:artikel", value: null, revision: 1 });
    }
    globalThis.fetch = async (url, options = {}) => {
      const parsed = new URL(url);
      const method = options.method || "GET";
      if (parsed.pathname === "/auth/v1/token") return response(200, {
        access_token: "mock-access", refresh_token: "mock-refresh", expires_in: 3600,
        user: { id: "account-A", email: "a@login.kinodreieck.at" },
      });
      if (parsed.pathname === "/auth/v1/logout") return response(204, null);
      if (parsed.pathname === "/rest/v1/kd_account_access") return response(200, [
        { role: "member", active: true, personal_ai: false },
      ]);
      assert.equal(parsed.pathname, "/rest/v1/kd_personal", "Unexpected network path");
      if (method === "GET") {
        reads++;
        pullStarted = reads >= 2;
        if (scenario === "pull-failure" && pullStarted) return response(503, {});
        return response(200, [...remote.values()].map((row) => ({ ...row })));
      }
      const body = JSON.parse(options.body);
      writes.push({ method, body });
      assert.equal(Object.hasOwn(body, "account_id"), false);
      if (method === "POST") {
        assert.equal(remote.has(body.key), false);
        const row = { ...body, revision: 1 };
        remote.set(body.key, row);
        return response(201, [{ ...row }]);
      }
      assert.equal(method, "PATCH");
      const key = parsed.searchParams.get("key").slice(3);
      const row = remote.get(key);
      assert.equal(row.revision, Number(parsed.searchParams.get("revision").slice(3)));
      Object.assign(row, body, { revision: row.revision + 1 });
      return response(200, [{ ...row }]);
    };
    const app = await import(pathToFileURL(bundle).href + `?case=${scenario}`);
    snapKey = app.UEBERNAHME_SNAP;
    // Seed every personal pot so a missing pot cannot escape this assertion.
    for (const key of app.ACCOUNT_SYNC_KEYS) values.set(key, JSON.stringify({ guest: key }));
    values.set("kd:master", ' { "filme": [{"id":"guest-film"}], "notiz": "äöü" }\n');
    values.set("kd:artikel", '{ "artikel": [{"id":"guest-article"}] }');
    const guest = Object.fromEntries(app.ACCOUNT_SYNC_KEYS.map((key) => [key, values.get(key)]));

    if (scenario === "explicit-adoption") {
      await app.authService.signIn("a", "mock-password");
      app.bereiteKontoTreiberVor("account-A");
      const inventory = await app.inventurLaden("account-A");
      const result = await app.uebernahmeStarten({ accountBindung: inventory.accountBindung });
      assert.equal(result.vollstaendig, true);
      await app.uebernahmeBestaetigen("account-A", inventory.accountBindung);
      for (const key of app.ACCOUNT_SYNC_KEYS) assert.equal(remote.get(key).value, guest[key]);
      assert.equal(writes.length, app.ACCOUNT_SYNC_KEYS.length);
      assert.equal(app.istKontoTreiberAktiv(), true);
    } else if (scenario.includes("failure") || scenario.startsWith("silent-")) {
      await assert.rejects(app.sessionCoordinator.signIn("a", "mock-password"));
      assert.notEqual(app.sessionCoordinator.getStorageState(), "account-ready");
      assert.equal(app.istKontoTreiberAktiv(), false);
      assert.equal(writes.length, 0);
      if (scenario === "restore-failure") {
        assert.equal(app.sessionCoordinator.getStorageState(), "privacy-locked");
        for (const key of app.ACCOUNT_SYNC_KEYS) assert.equal(await app.store.get(key), null);
      } else {
        for (const key of app.ACCOUNT_SYNC_KEYS) assert.equal(values.get(key), guest[key]);
      }
    } else {
      await app.sessionCoordinator.signIn("a", "mock-password");
      assert.equal(app.sessionCoordinator.getStorageState(), "account-ready");
      assert.equal(writes.length, 0, "Login must not upload personal pots");
      for (const key of app.ACCOUNT_SYNC_KEYS) {
        const expected = remote.get(key)?.value ?? null;
        assert.equal(localStorage.getItem(key), expected, `${scenario}: cache ${key}`);
        assert.equal((await app.store.get(key))?.value ?? null, expected, `${scenario}: store ${key}`);
      }
      assert.deepEqual(JSON.parse(values.get(snapKey)).werte, guest);
      const current = JSON.parse((await app.store.get("kd:master"))?.value || '{"filme":[]}');
      current.filme.push({ id: "new-account-film" });
      await app.store.set("kd:master", JSON.stringify(current));
      await app.accountSync.flush();
      assert.equal(remote.get("kd:master").value.includes("guest-film"), false);
      await app.sessionCoordinator.signOut();
      assert.equal(app.sessionCoordinator.getStorageState(), "guest");
      for (const key of app.ACCOUNT_SYNC_KEYS) assert.equal(localStorage.getItem(key), guest[key]);
    }
    count++;
    console.log(`PASS ${scenario}`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
console.log(`P02 ACCOUNT LOAD: ${count}/${count} scenarios passed`);
