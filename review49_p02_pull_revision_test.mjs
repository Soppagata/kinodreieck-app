/* P02/E03-001: deferred transport, real driver, store and remote subscribers. */
import assert from "node:assert/strict";
import { createAccountDriver, ACCT_KEYS } from "./src/lib/accountDriver.js";
import { store, setStorageDriver, notifyRemoteStorage, subscribeRemoteStorage } from "./src/lib/storage.js";

const key = "kd:mustwatch";
const A = '[{"id":"film-a"}]';
const B = '[{"id":"film-b"}]';
const C = '[{"id":"film-b"},{"id":"film-c"}]';
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
function gate() {
  let started, release;
  return {
    started: new Promise((resolve) => { started = resolve; }),
    done: new Promise((resolve) => { release = resolve; }),
    start: () => started(), release: () => release(),
  };
}

async function fixture() {
  const values = new Map();
  let snapshotFails = false;
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem(k, v) {
      if (snapshotFails && k === ACCT_KEYS.snap) throw Error("mock snapshot quota");
      values.set(k, String(v));
    },
    removeItem: (k) => values.delete(k),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  const remote = { key, value: A, revision: 1 };
  let getGate = null;
  let patchGate = null;
  let rejectPatch = null;
  let active = true;
  const writes = [];
  const changes = [];
  const unsubscribe = subscribeRemoteStorage((event) => changes.push(...event));
  const driver = createAccountDriver({
    config: { supabaseUrl: "https://p02-test.supabase.co", supabasePublishableKey: "sb_publishable_mock" },
    owner: "account:A", getAccessToken: async () => "mock-token", isActive: () => active,
    onRemoteChange: notifyRemoteStorage,
    fetchImpl: async (url, options) => {
      // A new local pot remains pending while its first upload is offline.
      if (options.method === "POST") throw new TypeError("mock offline insert");
      if (options.method === "GET") {
        const captured = [{ ...remote }];
        const wait = getGate;
        getGate = null;
        if (wait) { wait.start(); await wait.done; }
        return response(200, captured);
      }
      assert.equal(options.method, "PATCH");
      const query = new URL(url).searchParams;
      writes.push(Number(query.get("revision").slice(3)));
      const wait = patchGate;
      patchGate = null;
      if (wait) { wait.start(); await wait.done; }
      if (rejectPatch) return response(400, { code: "23514", message: rejectPatch });
      if (writes.at(-1) !== remote.revision) return response(200, []);
      remote.value = JSON.parse(options.body).value;
      remote.revision++;
      return response(200, [{ ...remote }]);
    },
  });
  setStorageDriver(driver);
  assert.equal((await driver.pull()).ok, true);
  changes.length = 0;
  return {
    values, driver, remote, writes, changes, unsubscribe,
    revision: () => JSON.parse(values.get(ACCT_KEYS.ver))[key],
    deferGet: () => (getGate = gate()),
    deferPatch: () => (patchGate = gate()),
    reject: (constraint) => { rejectPatch = constraint; },
    failSnapshots: () => { snapshotFails = true; },
    deactivate: () => { active = false; },
  };
}

let passed = 0;
async function test(name, action) {
  const f = await fixture();
  try { await action(f); passed++; console.log(`PASS ${name}`); }
  finally { f.unsubscribe(); setStorageDriver(null); }
}

await test("old GET after confirmed PATCH cannot roll back cache, revision or subscriber; follow-up uses B", async (f) => {
  const wait = f.deferGet();
  const pull = f.driver.pull();
  await wait.started;
  await store.set(key, B);
  await f.driver.syncFlush();
  assert.equal(f.remote.revision, 2);
  assert.deepEqual(f.driver.status().pending, []);
  const snapshots = f.values.get(ACCT_KEYS.snap);
  wait.release();
  assert.equal((await pull).ok, true);
  assert.equal((await store.get(key)).value, B);
  assert.equal(f.revision(), 2);
  assert.deepEqual(f.changes, []);
  assert.equal(f.values.get(ACCT_KEYS.snap), snapshots);
  const next = JSON.parse((await store.get(key)).value);
  next.push({ id: "film-c" });
  await store.set(key, JSON.stringify(next));
  await f.driver.syncFlush();
  assert.equal(f.remote.value, C);
  assert.equal(f.revision(), 3);
  assert.deepEqual(f.writes, [1, 2]);
  assert.deepEqual(f.driver.status().conflict, []);
});

await test("old GET with equal bytes cannot roll back revision", async (f) => {
  const wait = f.deferGet();
  const pull = f.driver.pull();
  await wait.started;
  await store.set(key, A);
  await f.driver.syncFlush();
  wait.release();
  await pull;
  assert.equal(f.revision(), 2);
  assert.deepEqual(f.changes, []);
});

await test("newer remote publishes after snapshot; identical repeat is quiet", async (f) => {
  Object.assign(f.remote, { value: B, revision: 2 });
  assert.equal((await f.driver.pull()).ok, true);
  assert.equal((await store.get(key)).value, B);
  assert.equal(f.revision(), 2);
  assert.deepEqual(f.changes, [{ key, value: B }]);
  assert.equal(f.driver.getSnapshots(key).at(-1).value, A);
  const snapshots = f.values.get(ACCT_KEYS.snap);
  await f.driver.pull();
  assert.equal(f.values.get(ACCT_KEYS.snap), snapshots);
  assert.equal(f.changes.length, 1);
});

await test("snapshot failure blocks newer remote", async (f) => {
  f.failSnapshots();
  Object.assign(f.remote, { value: B, revision: 2 });
  const result = await f.driver.pull();
  assert.equal(result.ok, false);
  assert.equal(result.fehler[0].grund, "snapshot-fehlgeschlagen");
  assert.equal((await store.get(key)).value, A);
  assert.equal(f.revision(), 1);
  assert.deepEqual(f.changes, []);
});

await test("pending edit survives old response before PATCH acknowledgement", async (f) => {
  const wait = f.deferGet();
  const pull = f.driver.pull();
  await wait.started;
  const patch = f.deferPatch();
  await store.set(key, B);
  await patch.started;
  wait.release();
  await pull;
  assert.equal((await store.get(key)).value, B);
  assert.deepEqual(f.driver.status().pending, [key]);
  assert.deepEqual(f.changes, []);
  patch.release();
  await f.driver.syncFlush();
  assert.equal(f.revision(), 2);
});

await test("ordinary pull preserves a pending new account pot absent on server", async (f) => {
  const newKey = "kd:artikel";
  const draft = '{"artikel":[{"id":"account-draft"}]}';
  await store.set(newKey, draft);
  await f.driver.syncFlush();
  assert.deepEqual(f.driver.status().pending, [newKey]);
  assert.equal((await f.driver.pull()).ok, true);
  assert.equal((await store.get(newKey)).value, draft);
  assert.deepEqual(f.driver.status().pending, [newKey]);
  assert.deepEqual(f.driver.status().conflict, []);
  assert.deepEqual(f.changes, []);
});

for (const constraint of ["kd_personal_value_max", "kd_personal_key_erlaubt"]) {
  await test(`${constraint}: terminal local value and conflict remain protected`, async (f) => {
    f.reject(constraint);
    await store.set(key, B);
    await f.driver.syncFlush();
    const field = constraint === "kd_personal_value_max" ? "zuGross" : "schemaVeraltet";
    assert.deepEqual(f.driver.status()[field], [key]);
    await f.driver.pull();
    assert.equal((await store.get(key)).value, B);
    assert.equal(f.revision(), 1);
    Object.assign(f.remote, { value: C, revision: 3 });
    const pull = await f.driver.pull();
    assert.deepEqual(pull.konflikt, [key]);
    assert.equal((await store.get(key)).value, B);
    assert.equal(f.revision(), 1);
    assert.deepEqual(f.driver.status()[field], [key]);
    assert.deepEqual(f.changes, []);
  });
}

await test("existing revision conflict survives pull", async (f) => {
  Object.assign(f.remote, { value: C, revision: 4 });
  await store.set(key, B);
  await f.driver.syncFlush();
  assert.deepEqual(f.driver.status().conflict, [key]);
  await f.driver.pull();
  assert.equal((await store.get(key)).value, B);
  assert.equal(f.revision(), 1);
  assert.deepEqual(f.driver.status().conflict, [key]);
  assert.deepEqual(f.changes, []);
});

await test("invalidated account ignores deferred response completely", async (f) => {
  Object.assign(f.remote, { value: B, revision: 2 });
  const wait = f.deferGet();
  const pull = f.driver.pull();
  await wait.started;
  f.deactivate();
  const before = [...f.values.entries()];
  wait.release();
  assert.equal((await pull).inactive, true);
  assert.deepEqual([...f.values.entries()], before);
  assert.deepEqual(f.changes, []);
});

await test("overlapping pulls cannot replace a newer accepted revision", async (f) => {
  const wait = f.deferGet();
  const oldPull = f.driver.pull();
  await wait.started;
  Object.assign(f.remote, { value: B, revision: 2 });
  await f.driver.pull();
  wait.release();
  await oldPull;
  assert.equal((await store.get(key)).value, B);
  assert.equal(f.revision(), 2);
  assert.deepEqual(f.changes, [{ key, value: B }]);
});

console.log(`P02 PULL REVISION: ${passed}/${passed} scenarios passed`);
