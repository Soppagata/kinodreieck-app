import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createStreamingPageController } from "./src/controllers/useStreamingPageController.js";
import { buildStreamingPageLibrary, buildStreamingPagePersonal } from "./src/lib/streamingPageContext.js";
import { createStreamingPagesService } from "./src/services/streamingPages.js";
import {
  loadSyntheticMaster,
  startStreamingProgressivePgHarness,
} from "./tools/streaming-progressive-pg-harness.mjs";

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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitFor(read, predicate, label, timeout = 30_000) {
  const start = performance.now();
  while (true) {
    const value = read();
    if (predicate(value)) return value;
    if (performance.now() - start >= timeout) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timeout: ${label}`);
}

const pg = await startStreamingProgressivePgHarness();
const session = {
  value: {
    mode: "account", state: "ready", account: { id: pg.accountId },
    capabilities: { remoteStorage: true },
  },
};
const posted = [];
const sharedCache = cacheStorage();
let activeFetches = 0;
let maxFetches = 0;
let delayedRelease = null;
const FILTER_TARGET_TITLE = "xXx: Return of Xander Cage";
let initialTitles = [];

function service(cache = sharedCache) {
  return createStreamingPagesService({
    auth: { getSnapshot: () => session.value },
    driver: { getAccessToken: async () => "synthetic-local-pg-token" },
    getConnection: () => ({
      url: "https://abcdefghijklmnopqrst.supabase.co",
      key: "sb_publishable_synthetic_progressive_final",
    }),
    cacheStorage: cache,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body).p_request;
      posted.push(structuredClone(request));
      activeFetches += 1;
      maxFetches = Math.max(maxFetches, activeFetches);
      try {
        const result = pg.call(request, pg.accountId);
        if (delayedRelease) await delayedRelease;
        return { ok: true, status: 200, json: async () => result };
      } finally {
        activeFetches -= 1;
      }
    },
  });
}

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
};

try {
  const rawMaster = loadSyntheticMaster();
  const master = rawMaster.map((film, index) => ({
    ...film,
    ...(index === 5 ? { bewertung: { wie: 5, was: 4, warum: 5 } } : {}),
  }));
  const library = buildStreamingPageLibrary(master);
  const personal = buildStreamingPagePersonal({
    status: { [master[0].watchmode_id]: { status: "gesehen", notiz: "nur lokal" } },
    mustWatchIds: new Set([master[2].id]),
    master,
    newEntries: [{
      id: String(master[3].watchmode_id),
      fensterBeginn: Date.parse("2026-08-01T00:00:00.000Z"),
      verbrauchtBis: Date.parse("2026-08-01T00:00:00.000Z"),
    }],
  });
  const context = {
    enabled: true,
    accountKey: `account:${pg.accountId}:epoch:synthetic-final`,
    services: ["Netflix", "Disney+", "Prime Video"],
    library,
    personal,
    revision: "synthetic-final-epoch",
  };

  await check("echtes SQL erreicht Service und Controller mit erster 20er-Seite und vollständigen Zählern", async () => {
    const controller = createStreamingPageController({ service: service(), yieldMainThread: tick });
    let first = null;
    const unsubscribe = controller.subscribe(() => {
      const snapshot = controller.getSnapshot();
      if (!first && snapshot.items.length === 20 && snapshot.counts?.all > 20) {
        first = snapshot;
        controller.setActive(false);
      }
    });
    controller.setContext(context);
    controller.setActive(true);
    controller.query({ view: "all", filters: { sort: "titel", richtung: "auf" } });
    await waitFor(() => ({ first, snapshot: controller.getSnapshot() }), ({ first: value, snapshot }) => {
      if (snapshot.status === "error") throw snapshot.error;
      return Boolean(value);
    }, "erste echte Seite");
    assert.equal(first.items.length, 20);
    assert.equal(first.total, first.counts.all);
    assert.equal(first.hasMore, true);
    initialTitles = first.items.map((item) => item.titel);
    assert.equal(pg.calls.at(-1).limit, 20);
    assert.equal(pg.calls.length, 1);

    controller.setActive(true);
    await waitFor(controller.getSnapshot, (snapshot) => snapshot.items.length >= 40, "erste Folgeseite");
    controller.setActive(false);
    await tick();
    assert.equal(controller.getSnapshot().items.length, 40);
    assert.equal(pg.calls[1].limit, 20);
    assert.equal(maxFetches, 1);
    unsubscribe();
    controller.destroy();
  });

  await check("Serverfilter und Sortierung finden einen Titel jenseits der ersten Seite", async () => {
    const before = pg.calls.length;
    const controller = createStreamingPageController({ service: service(), yieldMainThread: tick });
    controller.setContext(context);
    controller.setActive(true);
    controller.query({ view: "all", filters: { suche: "xXx", sort: "jahr", richtung: "ab" } });
    const result = await waitFor(controller.getSnapshot,
      (snapshot) => snapshot.status === "ready" && snapshot.total === 1, "serverseitiger xXx-Filter");
    assert.equal(initialTitles.includes(FILTER_TARGET_TITLE), false);
    assert.equal(result.items[0].titel, FILTER_TARGET_TITLE);
    assert.equal(result.items.length, 1);
    assert.equal(pg.calls.length, before + 1);
    controller.destroy();
  });

  await check("App-Payloadbuilder senden nur reduzierte Identität und Marker", async () => {
    const serialized = JSON.stringify(posted);
    assert.equal(serialized.includes("nur lokal"), false);
    assert.equal(serialized.includes('"bewertung"'), false);
    assert.equal(serialized.includes('"wie"'), false);
    assert.ok(posted.some((request) => request.library.length === master.length));
    assert.ok(posted.some((request) => request.personal.seenIds.includes(String(master[0].watchmode_id))));
    assert.ok(posted.some((request) => request.personal.ratedIds.includes(master[5].id)));
  });

  await check("Cache wird sofort wiederverwendet und unabhängig im Hintergrund validiert", async () => {
    await tick();
    const before = pg.calls.length;
    const controller = createStreamingPageController({ service: service(), yieldMainThread: tick });
    let cached = null;
    const unsubscribe = controller.subscribe(() => {
      const snapshot = controller.getSnapshot();
      if (!cached && snapshot.fromCache) cached = snapshot;
    });
    controller.setContext(context);
    controller.setActive(true);
    controller.query({ view: "all", filters: { suche: "xXx", sort: "jahr", richtung: "ab" } });
    await waitFor(() => cached, Boolean, "Cacheanzeige");
    assert.equal(cached.items[0].titel, FILTER_TARGET_TITLE);
    await waitFor(controller.getSnapshot,
      (snapshot) => snapshot.status === "ready" && snapshot.fromCache === false, "Hintergrundfrische");
    assert.equal(pg.calls.length, before + 1);
    controller.setActive(false);
    const warmCalls = pg.calls.length;
    controller.setActive(true);
    await tick();
    assert.equal(pg.calls.length, warmCalls);
    unsubscribe();
    controller.destroy();
  });

  await check("Kontowechsel verwirft eine echte, aber verspätete SQL-Antwort", async () => {
    let release;
    delayedRelease = new Promise((resolve) => { release = resolve; });
    const pending = service(cacheStorage()).loadPage({
      services: ["Netflix"], view: "all", filters: { suche: "Heat" }, library, personal,
    });
    await waitFor(() => activeFetches, (count) => count === 1, "laufender Serviceaufruf");
    session.value = {
      mode: "account", state: "ready", account: { id: "00000000-0000-4000-8000-0000000000ee" },
      capabilities: { remoteStorage: true },
    };
    release();
    await assert.rejects(pending, (error) => error?.reason === "account-changed");
    delayedRelease = null;
    session.value = {
      mode: "account", state: "ready", account: { id: pg.accountId },
      capabilities: { remoteStorage: true },
    };
  });

  console.log(JSON.stringify({
    projectionItems: pg.projectionCount,
    projectionMs: pg.projectionMs,
    rpcCalls: pg.calls.length,
    maxConcurrentRpcCalls: maxFetches,
    firstPageMs: pg.calls[0]?.durationMs,
    followupPageMs: pg.calls[1]?.durationMs,
  }));
  console.log(`${checks}/${checks} integrierte SQL-Service-Controller-Prüfungen bestanden.`);
  console.log("STREAMING-PROGRESSIVE-INTEGRATION BESTANDEN");
} finally {
  pg.stop();
}
