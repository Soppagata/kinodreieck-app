import assert from "node:assert/strict";
import { createStreamingPagesService, STREAMING_PAGE_RPC_MISSING } from "./src/services/streamingPages.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const ready = (extra = {}) => ({
  format: 1, status: "ready", region: "AT", version: "v1",
  generatedAt: "2026-09-13T12:00:00.000Z",
  counts: { all: 2, new: 1, library: 1 }, total: 2,
  items: [{ watchmode_id: 1, titel: "A", jahr: 2020, typ: "movie" }],
  nextCursor: null, complete: true,
  nextExpiryAt: "2026-09-20T12:00:00.000Z", meta: {}, ...extra,
});

function cacheStorage() {
  const values = new Map();
  return {
    values,
    async open() {
      return {
        async match(key) { return values.has(key) ? new Response(values.get(key)) : null; },
        async put(key, response) { values.set(key, await response.text()); },
        async delete(key) { return values.delete(key); },
      };
    },
  };
}

function harness({ response = ready(), current = null, cache = cacheStorage(), now = Date.parse("2026-09-13T13:00:00Z") } = {}) {
  const session = current || { value: { mode: "account", state: "ready", account: { id: "a" }, capabilities: { remoteStorage: true } } };
  let calls = 0, release = null;
  const wait = new Promise((resolve) => { release = resolve; });
  let delayed = false;
  const service = createStreamingPagesService({
    auth: { getSnapshot: () => session.value },
    driver: { getAccessToken: async () => "token" },
    getConnection: () => ({ url: "https://test.supabase.co", key: "publishable-key-123456789" }),
    cacheStorage: cache,
    now: () => now,
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (delayed) await wait;
      return { ok: true, status: 200, json: async () => response, request: JSON.parse(options.body) };
    },
  });
  return { service, session, cache, calls: () => calls, delay: () => { delayed = true; }, release };
}

const request = { services: ["Netflix"], view: "all", filters: {}, library: [], personal: {} };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log("✓ " + name); };

await check("Netzantwort wird accountgebunden persistiert und aus CacheStorage gelesen", async () => {
  const shared = cacheStorage();
  const first = harness({ cache: shared });
  const network = await first.service.loadPage(request);
  await flush();
  const second = harness({ cache: shared });
  const cached = await second.service.loadCachedPage(request);
  assert.equal(network.version, "v1");
  assert.equal(cached.fromCache, true);
  assert.equal(second.calls(), 0);
});

await check("automatische Folgeseiten erzeugen keine ungenutzten persistenten Cacheeintraege", async () => {
  const shared = cacheStorage();
  const h = harness({ cache: shared });
  await h.service.loadPage(request);
  await flush();
  assert.equal(shared.values.size, 1);
  await h.service.loadPage({ ...request, cursor: "c1", limit: 1000 });
  await flush();
  assert.equal(shared.values.size, 1);
});

await check("gleicher Request laeuft serviceintern nur einmal", async () => {
  const h = harness();
  h.delay();
  const one = h.service.loadPage(request);
  const two = h.service.loadPage(request);
  await Promise.resolve();
  assert.equal(h.calls(), 1);
  h.release();
  assert.deepEqual(await one, await two);
});

await check("Kontowechsel verwirft eine verspaetete Antwort vor Cache und Ergebnis", async () => {
  const h = harness();
  h.delay();
  const pending = h.service.loadPage(request);
  await Promise.resolve();
  h.session.value = { mode: "account", state: "ready", account: { id: "b" }, capabilities: { remoteStorage: true } };
  h.release();
  await assert.rejects(pending, (error) => error?.reason === "account-changed");
  assert.equal(h.cache.values.size, 0);
});

await check("Caller-Abort erreicht fetch und der neueste Account startet unabhaengig", async () => {
  const session = { value: { mode: "account", state: "ready", account: { id: "a" }, capabilities: { remoteStorage: true } } };
  const fetches = [];
  const service = createStreamingPagesService({
    auth: { getSnapshot: () => session.value },
    driver: { getAccessToken: async ({ erwarteteKontoId }) => `token-${erwarteteKontoId}` },
    getConnection: () => ({ url: "https://test.supabase.co", key: "publishable-key-123456789" }),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      fetches.push({ auth: options.headers.Authorization, filter: body.p_request.filters.buchstabe, signal: options.signal });
      if (body.p_request.filters.buchstabe === "A") {
        return await new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("abgebrochen"), { name: "AbortError" }));
          }, { once: true });
        });
      }
      return { ok: true, status: 200, json: async () => ready() };
    },
  });
  const oldController = new AbortController();
  const old = service.loadPage({ ...request, filters: { buchstabe: "A" } }, { signal: oldController.signal });
  const oldRejected = assert.rejects(old, (error) => error?.reason === "cancelled");
  await flush();
  session.value = { mode: "account", state: "ready", account: { id: "b" }, capabilities: { remoteStorage: true } };
  oldController.abort();
  const latest = await service.loadPage({ ...request, filters: { buchstabe: "Z" } }, { signal: new AbortController().signal });
  await oldRejected;
  assert.equal(latest.status, "ready");
  assert.deepEqual(fetches.map(({ auth, filter }) => [auth, filter]), [
    ["Bearer token-a", "A"], ["Bearer token-b", "Z"],
  ]);
  assert.equal(fetches[0].signal.aborted, true);
  assert.equal(fetches[1].signal.aborted, false);
});

await check("abgebrochener Singleflight blockiert keinen sofortigen Same-Key-Neustart", async () => {
  let calls = 0;
  const service = createStreamingPagesService({
    auth: { getSnapshot: () => ({ mode: "account", state: "ready", account: { id: "a" }, capabilities: { remoteStorage: true } }) },
    driver: { getAccessToken: async () => "token-a" },
    getConnection: () => ({ url: "https://test.supabase.co", key: "publishable-key-123456789" }),
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) {
        return await new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("abgebrochen"), { name: "AbortError" }));
          }, { once: true });
        });
      }
      return { ok: true, status: 200, json: async () => ready() };
    },
  });
  const oldController = new AbortController();
  const old = service.loadPage(request, { signal: oldController.signal });
  const oldRejected = assert.rejects(old, (error) => error?.reason === "cancelled");
  await flush();
  oldController.abort();
  const latest = await service.loadPage(request, { signal: new AbortController().signal });
  await oldRejected;
  assert.equal(latest.status, "ready");
  assert.equal(calls, 2);
});

await check("Cache-Schreiben blockiert die erste Netzantwort nicht", async () => {
  const put = deferred();
  let putStarted = false;
  const cache = {
    async open() {
      return {
        async match() { return null; },
        async put() { putStarted = true; await put.promise; },
        async delete() { return true; },
      };
    },
  };
  const h = harness({ cache });
  const result = await h.service.loadPage(request);
  assert.equal(result.version, "v1");
  await flush();
  assert.equal(putStarted, true);
  put.resolve();
});

await check("Kontowechsel waehrend caches.open verhindert den alten Cache-Write", async () => {
  const opened = deferred();
  let puts = 0;
  const cache = {
    async open() {
      await opened.promise;
      return {
        async match() { return null; },
        async put() { puts += 1; },
        async delete() { return true; },
      };
    },
  };
  const h = harness({ cache });
  await h.service.loadPage(request);
  h.session.value = { mode: "account", state: "ready", account: { id: "b" }, capabilities: { remoteStorage: true } };
  opened.resolve();
  await flush();
  assert.equal(puts, 0);
});

await check("Kontowechsel waehrend cache.put entfernt den gerade geschriebenen alten Eintrag", async () => {
  const releasePut = deferred();
  let stored = false, deletes = 0;
  const cache = {
    async open() {
      return {
        async match() { return null; },
        async put() { stored = true; await releasePut.promise; },
        async delete() { stored = false; deletes += 1; return true; },
      };
    },
  };
  const h = harness({ cache });
  await h.service.loadPage(request);
  await flush();
  assert.equal(stored, true);
  h.session.value = { mode: "account", state: "ready", account: { id: "b" }, capabilities: { remoteStorage: true } };
  releasePut.resolve();
  await flush();
  assert.equal(stored, false);
  assert.equal(deletes, 1);
});

await check("Logout sperrt selbst einen vorhandenen accountgebundenen Cache", async () => {
  const h = harness();
  await h.service.loadPage(request);
  h.session.value = { mode: "guest", state: "ready", account: null, capabilities: { remoteStorage: false } };
  await assert.rejects(h.service.loadCachedPage(request), (error) => error?.code === "forbidden");
});

await check("abgelaufene Neu-Frist wird nicht durch den Cachezeitpunkt verlaengert", async () => {
  const expiry = "2026-09-13T12:30:00.000Z";
  const h = harness({ response: ready({ nextExpiryAt: expiry }) });
  const page = await h.service.loadPage(request);
  await flush();
  assert.equal(page.nextExpiryAt, expiry);
  assert.equal(await h.service.loadCachedPage(request), null);
  assert.equal(h.cache.values.size, 0);
});

await check("nur ein eindeutig fehlendes RPC traegt die Legacy-Fallback-Marke", async () => {
  const session = { value: { mode: "account", state: "ready", account: { id: "a" }, capabilities: { remoteStorage: true } } };
  const service = createStreamingPagesService({
    auth: { getSnapshot: () => session.value },
    driver: { getAccessToken: async () => "token" },
    getConnection: () => ({ url: "https://test.supabase.co", key: "publishable-key-123456789" }),
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ code: "PGRST202", message: "Could not find kd_streaming_page" }) }),
  });
  await assert.rejects(service.loadPage(request), (error) => error?.reason === STREAMING_PAGE_RPC_MISSING);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("STREAMING-PAGE-CACHE-TEST BESTANDEN");
