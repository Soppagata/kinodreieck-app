/* Tatsächlicher AccountDriver + SessionCoordinator, ausschließlich Mocknetz.
   Browser-Ereignisse und Timer werden deterministisch ausgelöst. */
import assert from "node:assert/strict";
import { setImmediate as settle } from "node:timers/promises";
import { createAccountDriver } from "./src/lib/accountDriver.js";
import { createSessionCoordinator } from "./src/services/sessionCoordinator.js";
import { startAccountAutoSync } from "./src/services/accountAutoSync.js";
import { syncStatusAnzeige } from "./src/lib/syncStatus.js";

let passed = 0;
async function test(name, run) { await run(); passed++; console.log("✓ " + name); }
async function drain() { for (let i = 0; i < 12; i++) await settle(); }

function setup({ empty = false } = {}) {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  };
  const key = "kd:master";
  const initial = JSON.stringify({ filme: [{ id: "probe", titel: "Test", score: 1 }] });
  let row = empty ? null : { key, value: initial, revision: 1 };
  let offline = false, loseReply = false, terminal = null, active = true;
  const changes = [], requests = [], timers = new Map();
  const reply = (status, data) => ({ status, ok: status < 300, json: async () => data });
  const session = { mode: "account", state: "ready", account: { id: "A", role: "member" },
    capabilities: { remoteStorage: true, personalAi: false } };
  const driver = createAccountDriver({
    config: { supabaseUrl: "https://projekt.supabase.co", supabasePublishableKey: "mock" },
    getAccessToken: async () => "mock", isActive: () => active,
    onRemoteChange: (items) => changes.push(...items),
    fetchImpl: async (url, options) => {
      requests.push(options.method);
      if (offline) throw new Error("offline");
      if (options.method === "GET") return reply(200, row ? [{ ...row }] : []);
      if (terminal) return reply(400, { message: terminal });
      const value = JSON.parse(options.body).value;
      if (options.method === "POST") {
        if (row) return reply(409, {});
        row = { key, value, revision: 1 };
      } else if (options.method === "PATCH") {
        if (new URL(url).searchParams.get("revision") !== `eq.${row?.revision}`) return reply(200, []);
        row = { key, value, revision: row.revision + 1 };
      } else throw new Error("Unexpected method");
      if (loseReply) { loseReply = false; throw new Error("response lost after commit"); }
      return reply(200, [{ ...row }]);
    },
  });
  const coordinator = createSessionCoordinator({
    auth: { getSnapshot: () => session, initialize: async () => session, refresh: async () => session },
    storage: {
      prepare() {}, confirm() { active = true; }, active: () => active,
      preparedAccountId: () => "A", cacheOwner: () => "A", masked: () => false,
      currentTransition: () => null, blockAccess() { active = false; },
      pull: () => driver.pull(), flush: () => driver.syncFlush(), status: () => driver.status(),
    },
    adoption: { isConfirmed: () => true }, eventTarget: new EventTarget(),
  });
  const events = new EventTarget(), doc = new EventTarget();
  doc.visibilityState = "visible";
  let seq = 0;
  const stop = startAccountAutoSync({ coordinator, status: () => driver.status(),
    eventTarget: events, documentTarget: doc, online: () => !offline,
    setTimer(fn, delay) { const id = ++seq; timers.set(id, { fn, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  return { key, initial, driver, coordinator, events, doc, changes, requests, timers, session, stop,
    get row() { return row; },
    remote(value) { row = { key, value, revision: (row?.revision || 0) + 1 }; },
    offline(value) { offline = value; }, loseReply() { loseReply = true; },
    terminal(value) { terminal = value; }, deactivate() { active = false; },
    async tick() { const [id, task] = timers.entries().next().value; timers.delete(id); await task.fn(); await drain(); },
  };
}

await test("Offline-Änderung und Bewertung werden durch online ohne Sync-Button bestätigt", async () => {
  const s = setup(); await s.coordinator.initialize(); s.offline(true);
  const edit = JSON.stringify({ filme: [{ id: "probe", titel: "Test", score: 8 }] });
  await s.driver.set(s.key, edit); await drain();
  assert.deepEqual(s.driver.status().pending, [s.key]);
  s.offline(false); s.events.dispatchEvent(new Event("online")); await drain();
  assert.equal(s.row.value, edit); assert.deepEqual(s.driver.status().pending, []);
  assert.deepEqual(s.driver.status().conflict, []); s.stop();
});

await test("Fokus lädt neuere Daten und meldet nur tatsächlich geänderte Werte", async () => {
  const s = setup(); await s.coordinator.initialize(); s.changes.length = 0;
  s.remote(JSON.stringify({ filme: [{ id: "anderes-geraet", titel: "Neu" }] }));
  s.events.dispatchEvent(new Event("focus")); await drain();
  assert.equal(localStorage.getItem(s.key), s.row.value);
  assert.deepEqual(s.changes, [{ key: s.key, value: s.row.value }]);
  s.changes.length = 0; s.events.dispatchEvent(new Event("focus")); await drain();
  assert.deepEqual(s.changes, []); s.stop();
});

await test("Timer sendet offene Writes erneut, fragt saubere Konten aber nicht dauernd ab", async () => {
  const s = setup(); await s.coordinator.initialize();
  const clean = s.requests.length; await s.tick(); assert.equal(s.requests.length, clean);
  s.offline(true); await s.driver.set(s.key, "retry"); await drain(); s.offline(false);
  await s.tick(); assert.equal(s.row.value, "retry");
  const done = s.requests.length; await s.tick(); assert.equal(s.requests.length, done); s.stop();
});

await test("Verborgene App pausiert; Sichtbarwerden bündelt Ereignisse in einen Abgleich", async () => {
  const s = setup(); await s.coordinator.initialize(); const before = s.requests.length;
  s.doc.visibilityState = "hidden"; s.doc.dispatchEvent(new Event("visibilitychange"));
  s.events.dispatchEvent(new Event("online")); await drain();
  assert.equal(s.timers.size, 0); assert.equal(s.requests.length, before);
  s.doc.visibilityState = "visible"; s.doc.dispatchEvent(new Event("visibilitychange"));
  s.events.dispatchEvent(new Event("online")); s.events.dispatchEvent(new Event("focus")); await drain();
  assert.equal(s.requests.length, before + 1); s.stop(); assert.equal(s.timers.size, 0);
});

await test("Unveränderte Serverrevision erzeugt beim Pull keinen falschen Offline-Konflikt", async () => {
  const s = setup(); await s.coordinator.initialize(); s.offline(true);
  await s.driver.set(s.key, "lokaler-entwurf"); await drain(); s.offline(false); await s.driver.pull();
  assert.equal(localStorage.getItem(s.key), "lokaler-entwurf");
  assert.deepEqual(s.driver.status().conflict, []); assert.deepEqual(s.driver.status().pending, [s.key]); s.stop();
});

await test("Echte konkurrierende Revision bleibt geschützt und wird nicht automatisch überschrieben", async () => {
  const s = setup(); await s.coordinator.initialize(); s.offline(true);
  await s.driver.set(s.key, "mein-entwurf"); await drain(); s.remote("anderer-entwurf"); s.offline(false);
  s.events.dispatchEvent(new Event("online")); await drain();
  assert.equal(s.row.value, "anderer-entwurf"); assert.equal(localStorage.getItem(s.key), "mein-entwurf");
  assert.deepEqual(s.driver.status().conflict, [s.key]);
  const count = s.requests.length; await s.tick(); assert.equal(s.requests.length, count); s.stop();
});

for (const empty of [false, true]) await test(`Verlorene ${empty ? "Insert" : "Update"}-Antwort wird rückgelesen und ohne Konflikt bestätigt`, async () => {
  const s = setup({ empty }); await s.coordinator.initialize(); s.loseReply();
  await s.driver.set(s.key, "bereits-gespeichert"); await drain();
  assert.deepEqual(s.driver.status().pending, [s.key]);
  s.events.dispatchEvent(new Event("online")); await drain();
  assert.equal(s.row.value, "bereits-gespeichert"); assert.deepEqual(s.driver.status().pending, []);
  assert.deepEqual(s.driver.status().conflict, []); s.stop();
});

for (const error of ["kd_personal_value_max", "kd_personal_key_erlaubt"]) await test(`${error}: Inhalt bleibt lokal erhalten, Anzeige meldet Fehler und Timer wiederholt nicht`, async () => {
  const s = setup(); await s.coordinator.initialize(); s.terminal(error);
  await s.driver.set(s.key, "abgelehnter-entwurf"); await drain();
  assert.notEqual(syncStatusAnzeige(s.driver.status()).text, "synchron");
  await s.driver.pull(); assert.equal(localStorage.getItem(s.key), "abgelehnter-entwurf");
  const count = s.requests.length; await s.tick(); assert.equal(s.requests.length, count); s.stop();
});

await test("Entzogene Kontofreigabe verhindert jeden automatischen Datenrequest", async () => {
  const s = setup(); await s.coordinator.initialize(); s.offline(true);
  await s.driver.set(s.key, "geschuetzt"); await drain(); s.offline(false);
  s.session.capabilities.remoteStorage = false; const count = s.requests.length;
  s.events.dispatchEvent(new Event("online")); await drain();
  assert.equal(s.requests.length, count); assert.equal(localStorage.getItem(s.key), "geschuetzt"); s.stop();
});

await test("Explizite Eintragslöschung und verlorener Cache laden den bestätigten leeren Kontostand", async () => {
  const s = setup(); await s.coordinator.initialize();
  await s.driver.set(s.key, JSON.stringify({ filme: [] })); await drain();
  localStorage.clear(); await s.coordinator.initialize();
  assert.deepEqual(JSON.parse(localStorage.getItem(s.key)), { filme: [] }); s.stop();
});

console.log(`\nACCOUNT-AUTOSYNC BESTANDEN (${passed}/${passed})`);
