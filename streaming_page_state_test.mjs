import assert from "node:assert/strict";
import {
  createStreamingPageController,
  STREAMING_PAGE_SESSION_FRESH_MS,
  streamingPageShouldBeActive,
} from "./src/controllers/useStreamingPageController.js";
import { STREAMING_PAGE_RPC_MISSING } from "./src/services/streamingPages.js";
import { buildStreamingPageLibrary, buildStreamingPagePersonal } from "./src/lib/streamingPageContext.js";
import {
  normalizeStreamingPageFilters,
  shouldDeferStreamingKnownLoad,
  streamingPageQueryKey,
} from "./src/lib/streamingPage.js";
import { baueStreamingAnsichten } from "./src/lib/katalog.js";
import { localRecommendationCandidates } from "./src/lib/entdeckenUi.js";

const page = ({ version = "v1", ids = [1], cursor = null, complete = cursor == null, expiry = null } = {}) => ({
  format: 1, status: "ready", version,
  counts: { all: 4, new: 1, library: 2 }, total: 4,
  items: ids.map((id) => ({ watchmode_id: id, titel: `Titel ${id}`, jahr: 2020, typ: "movie" })),
  nextCursor: cursor, complete, nextExpiryAt: expiry,
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const context = (accountKey = "account:a") => ({
  enabled: true, accountKey, services: ["Netflix"], library: [], personal: {}, revision: "r1",
});
let checks = 0;
const check = async (name, fn) => { await fn(); checks += 1; console.log("✓ " + name); };

await check("App-Kontext reduziert Identitaet und Markierungen ohne Werte oder Notizen", async () => {
  const master = [{
    id: "heat", watchmode_id: 10, imdb_id: "tt0113277", titel: "Heat", jahr: 1995, typ: "film",
    bewertung: { wie: 5, was: 4, warum: 5 }, notiz: "privat", begruendung: "privat",
  }];
  const library = buildStreamingPageLibrary(master);
  const personal = buildStreamingPagePersonal({
    status: { 10: { status: "gesehen", notiz: "privat" } },
    mustWatchIds: new Set(["heat"]), master,
    newEntries: [{ id: "10", fensterBeginn: 1, verbrauchtBis: 1 }],
  });
  assert.deepEqual(Object.keys(library[0]).sort(), [
    "id", "imdb_id", "jahr", "originaltitel", "streaming_id", "titel", "tmdb_id", "typ", "watchmode_id",
  ]);
  assert.deepEqual(personal.seenIds, ["10"]);
  assert.deepEqual(personal.mustWatchIds, ["heat"]);
  assert.deepEqual(personal.ratedIds, ["heat"]);
  assert.equal(JSON.stringify({ library, personal }).includes("privat"), false);
  assert.equal(JSON.stringify({ library, personal }).includes('"wie"'), false);
});

await check("UI-Sortierungen und kurze accountgebundene Query-Kennung bleiben exakt", async () => {
  for (const sort of ["titel", "jahr", "art", "anbieter"]) {
    assert.equal(normalizeStreamingPageFilters({ sort }).sort, sort);
  }
  const privateRequest = {
    ...context(), view: "library", filters: { suche: "Privater Titel", sort: "anbieter" },
    library: [{ id: "privat-1", titel: "Privater Titel", jahr: 2020 }],
  };
  const key = streamingPageQueryKey(privateRequest, "account:privat");
  assert.match(key, /^sp1-[0-9a-z]{13}$/);
  assert.equal(key.includes("Privater"), false);
  assert.equal(key.includes("account:privat"), false);
  assert.equal(key, streamingPageQueryKey(privateRequest, "account:privat"));
  assert.notEqual(key, streamingPageQueryKey(privateRequest, "account:anders"));
});

await check("PWA-Sichtbarkeit aktiviert Vorladen nur im sichtbaren Streaming-Tab", async () => {
  assert.equal(streamingPageShouldBeActive("streaming", "visible"), true);
  assert.equal(streamingPageShouldBeActive("streaming", "hidden"), false);
  assert.equal(streamingPageShouldBeActive("start", "visible"), false);
});

await check("direkter Streamingstart verschiebt Known nur bis zur ersten Seitenantwort", async () => {
  assert.equal(shouldDeferStreamingKnownLoad({
    tab: "streaming", accountReady: true, servicesReady: false, pageEnabled: false, pageStatus: "idle",
  }), true);
  assert.equal(shouldDeferStreamingKnownLoad({
    tab: "streaming", accountReady: true, servicesReady: true, pageEnabled: true, pageStatus: "loading",
  }), true);
  for (const pageStatus of ["refreshing", "ready", "error"]) {
    assert.equal(shouldDeferStreamingKnownLoad({
      tab: "streaming", accountReady: true, servicesReady: true, pageEnabled: true, pageStatus,
    }), false);
  }
  assert.equal(shouldDeferStreamingKnownLoad({
    tab: "kino", accountReady: true, servicesReady: false, pageEnabled: false, pageStatus: "idle",
  }), false);
});

await check("Cache erscheint vor unabhaengiger Hintergrundfrische", async () => {
  const network = deferred();
  let cacheCalls = 0, networkCalls = 0;
  const controller = createStreamingPageController({
    service: {
      async loadCachedPage() { cacheCalls += 1; return { ...page({ ids: [1] }), fromCache: true }; },
      async loadPage() { networkCalls += 1; return network.promise; },
    },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "all", filters: {} });
  await flush();
  assert.equal(controller.getSnapshot().fromCache, true);
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [1]);
  assert.equal(controller.getSnapshot().status, "refreshing");
  assert.equal(cacheCalls, 1);
  assert.equal(networkCalls, 1);
  network.resolve(page({ ids: [2] }));
  await flush();
  assert.equal(controller.getSnapshot().fromCache, false);
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [2]);
  controller.destroy();
});

await check("gleicher Query-Key baut fertige Seiten und Zuordnungen nicht neu", async () => {
  let calls = 0, mapped = 0;
  const controller = createStreamingPageController({
    service: { loadCachedPage: async () => null, loadPage: async () => { calls += 1; return page({ ids: [1] }); } },
    mapItems(items) { mapped += 1; return items; },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "all", filters: { suche: "Heat" } });
  await flush();
  controller.query({ filters: { suche: "Heat" }, view: "all" });
  await flush();
  assert.equal(calls, 1);
  assert.equal(mapped, 1);
  controller.destroy();
});

await check("fertiger Sitzungsrecord bleibt bei schnellem Wechsel warm und prueft nach fuenf Minuten neu", async () => {
  let zeit = 1_000, calls = 0;
  const controller = createStreamingPageController({
    now: () => zeit,
    service: { loadCachedPage: async () => null, loadPage: async () => { calls += 1; return page({ ids: [calls] }); } },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "all", filters: {} });
  await flush();
  assert.equal(calls, 1);
  controller.setActive(false);
  zeit += STREAMING_PAGE_SESSION_FRESH_MS - 1;
  controller.setActive(true);
  await flush();
  assert.equal(calls, 1);
  controller.setActive(false);
  zeit += 1;
  controller.setActive(true);
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [2]);
  controller.destroy();
});

await check("Rueckkehr zu abgelaufenem Neu-Record verwirft Items und Zaehler vor Wiederverwendung", async () => {
  let zeit = Date.parse("2026-09-13T12:00:00Z"), newCalls = 0;
  const controller = createStreamingPageController({
    now: () => zeit,
    service: {
      loadCachedPage: async () => null,
      async loadPage(request) {
        if (request.view === "new") {
          newCalls += 1;
          return page({
            ids: [newCalls],
            expiry: newCalls === 1 ? "2026-09-13T12:00:01.000Z" : "2026-09-14T12:00:00.000Z",
          });
        }
        return page({ ids: [9] });
      },
    },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "new", filters: {} });
  await flush();
  controller.query({ view: "all", filters: {} });
  await flush();
  zeit += 2_000;
  controller.query({ view: "new", filters: {} });
  assert.deepEqual(controller.getSnapshot().items, []);
  assert.equal(controller.getSnapshot().counts, null);
  await flush();
  assert.equal(newCalls, 2);
  controller.destroy();
});

await check("Sichtbarwerden prueft Neu-Ablauf sofort und laedt ohne Cache neu", async () => {
  let zeit = Date.parse("2026-09-13T12:00:00Z"), calls = 0, cacheCalls = 0;
  const controller = createStreamingPageController({
    now: () => zeit,
    service: {
      loadCachedPage: async () => { cacheCalls += 1; return null; },
      loadPage: async () => {
        calls += 1;
        return page({
          ids: [calls],
          expiry: calls === 1 ? "2026-09-13T12:00:01.000Z" : "2026-09-14T12:00:00.000Z",
        });
      },
    },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "new", filters: {} });
  await flush();
  controller.setActive(false);
  zeit += 2_000;
  controller.setActive(true);
  assert.deepEqual(controller.getSnapshot().items, []);
  assert.equal(controller.getSnapshot().counts, null);
  await flush();
  assert.equal(calls, 2);
  assert.equal(cacheCalls, 1);
  controller.destroy();
});

await check("Ablauf-Epoch blockiert eine alte laufende Hintergrundseite", async () => {
  const oldPage = deferred();
  let zeit = Date.parse("2026-09-13T12:00:00Z"), initialCalls = 0, expiryCallback = null;
  const controller = createStreamingPageController({
    now: () => zeit,
    setTimer(callback) { expiryCallback = callback; return 1; },
    clearTimer() {},
    yieldMainThread: async () => {},
    service: {
      loadCachedPage: async () => null,
      async loadPage(request) {
        if (request.cursor) return oldPage.promise;
        initialCalls += 1;
        return initialCalls === 1
          ? page({ ids: [1], cursor: "c1", complete: false, expiry: "2026-09-13T12:00:01.000Z" })
          : page({ ids: [3], expiry: "2026-09-14T12:00:00.000Z" });
      },
    },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "new", filters: {} });
  await flush();
  assert.equal(typeof expiryCallback, "function");
  zeit += 2_000;
  expiryCallback();
  await flush();
  oldPage.resolve(page({ ids: [2], expiry: "2026-09-14T12:00:00.000Z" }));
  await flush();
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [3]);
  controller.destroy();
});

await check("Paging behaelt MotN-Removals fuer Known-Badges und Entdecken-Kandidaten", async () => {
  const showData = {
    motn_id: "1364", imdb_id: "tt1302011", tmdb_id: 49444,
    titel: "Kung Fu Panda 2", jahr: 2011, typ: "film",
    at_subscription_services: ["disney"],
  };
  const offer = (service_id, available, link) => ({
    show_id: "1364", service_id, country: "AT", available,
    added_at: available ? "2020-01-01T00:00:00.000Z" : null,
    checked_at: "2020-01-02T00:00:00.000Z", link, show_data: showData,
  });
  const motn = { format: 1, country: "AT", offers: [
    offer("netflix", false, null),
    offer("disney", true, "https://www.disneyplus.com/browse/fixture"),
  ] };
  const watchmode = {
    watchmode_id: 1209560, imdb_id: "tt1302011", tmdb_id: 49444,
    titel: "Kung Fu Panda 2", jahr: 2011, typ: "movie",
    dienste: ["Netflix"], web_urls: { Netflix: "https://netflix.com/old" },
  };
  const raw = {
    bekannt: { stand: "2020-01-02T00:00:00.000Z", region: "AT", titel: [watchmode], motn },
    entdecken: { stand: "2020-01-02T00:00:00.000Z", region: "AT", titel: [] },
    entdeckenUmfang: "begrenzt",
  };
  const master = [{ id: "badge-film", ...watchmode, typ: "film", dienste: undefined, web_urls: undefined }];
  const badgeProjection = baueStreamingAnsichten(raw, master);
  assert.deepEqual(badgeProjection.bekannt.titel[0].dienste, ["Disney+"]);
  assert.equal(badgeProjection.bekannt.titel[0].web_urls.Netflix, undefined);

  const discoverProjection = baueStreamingAnsichten(raw, []);
  assert.deepEqual(discoverProjection.entdecken.titel[0].dienste, ["Disney+"]);
  assert.equal(localRecommendationCandidates(discoverProjection.entdecken, {
    selectedServices: ["Disney+"],
  }).length, 1);
  assert.equal(localRecommendationCandidates(discoverProjection.entdecken, {
    selectedServices: ["Netflix"],
  }).length, 0);
});

await check("wirkliche Kontextrevision baut denselben sichtbaren Query genau einmal neu", async () => {
  let calls = 0;
  const controller = createStreamingPageController({
    service: { loadCachedPage: async () => null, loadPage: async () => { calls += 1; return page({ ids: [calls] }); } },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "library", filters: {} });
  await flush();
  controller.setContext({ ...context(), revision: "r2", library: [{ id: "neu" }] });
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [2]);
  controller.destroy();
});

await check("Hintergrundseiten laufen seriell und pausieren ohne Zwischenstandverlust", async () => {
  const second = deferred();
  const calls = [];
  const controller = createStreamingPageController({
    service: {
      loadCachedPage: async () => null,
      async loadPage(request) {
        calls.push({ cursor: request.cursor, limit: request.limit });
        if (!request.cursor) return page({ ids: [1], cursor: "c1", complete: false });
        if (request.cursor === "c1") return second.promise;
        return page({ ids: [3] });
      },
    },
    yieldMainThread: async () => {},
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "all", filters: {} });
  await flush();
  assert.deepEqual(calls, [{ cursor: null, limit: 20 }, { cursor: "c1", limit: 200 }]);
  controller.setActive(false);
  second.resolve(page({ ids: [2], cursor: "c2", complete: false }));
  await flush();
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [1, 2]);
  assert.equal(calls.length, 2);
  controller.setActive(true);
  await flush();
  assert.deepEqual(calls.at(-1), { cursor: "c2", limit: 200 });
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [1, 2, 3]);
  controller.destroy();
});

await check("spaetere Seiten verlaengern den fruehesten Neu-Ablauf nicht", async () => {
  const early = "2026-09-14T10:00:00.000Z";
  const late = "2026-09-15T10:00:00.000Z";
  const controller = createStreamingPageController({
    service: {
      loadCachedPage: async () => null,
      loadPage: async (request) => request.cursor
        ? page({ ids: [2], expiry: late })
        : page({ ids: [1], cursor: "c1", complete: false, expiry: early }),
    },
    yieldMainThread: async () => {},
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "new", filters: {} });
  await flush();
  await flush();
  assert.equal(controller.getSnapshot().nextExpiryAt, early);
  controller.destroy();
});

await check("Filterwechsel verwirft eine verspaetete alte Antwort", async () => {
  const old = deferred();
  const controller = createStreamingPageController({
    service: {
      loadCachedPage: async () => null,
      loadPage: async (request) => request.filters.suche === "alt" ? old.promise : page({ ids: [2] }),
    },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "all", filters: { suche: "alt" } });
  await flush();
  controller.query({ view: "all", filters: { suche: "neu" } });
  await flush();
  old.resolve(page({ ids: [1] }));
  await flush();
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [2]);
  controller.destroy();
});

await check("Accountwechsel und Logout leeren State und blockieren alte Antworten", async () => {
  const old = deferred();
  const controller = createStreamingPageController({
    service: { loadCachedPage: async () => null, loadPage: async () => old.promise },
  });
  controller.setContext(context("account:a"));
  controller.setActive(true);
  controller.query({ view: "library", filters: {} });
  await flush();
  controller.setContext({ ...context("account:b"), enabled: false });
  old.resolve(page({ ids: [1] }));
  await flush();
  assert.equal(controller.getSnapshot().enabled, false);
  assert.deepEqual(controller.getSnapshot().items, []);
  controller.destroy();
});

await check("Accountwechsel im versteckten PWA-Zustand startet erst beim Sichtbarwerden neu", async () => {
  const old = deferred();
  let calls = 0;
  const controller = createStreamingPageController({
    service: {
      loadCachedPage: async () => null,
      loadPage: async () => (++calls === 1 ? old.promise : page({ ids: [2] })),
    },
  });
  controller.setContext(context("account:a"));
  controller.setActive(true);
  controller.query({ view: "library", filters: {} });
  await flush();
  controller.setActive(false);
  controller.setContext({ ...context("account:b"), revision: "r2" });
  old.resolve(page({ ids: [1] }));
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(controller.getSnapshot().items, []);
  controller.setActive(true);
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [2]);
  controller.destroy();
});

await check("spaeter Seitenfehler behaelt sichtbare Inhalte und startet keine Schleife", async () => {
  let calls = 0;
  const controller = createStreamingPageController({
    service: {
      loadCachedPage: async () => null,
      async loadPage(request) {
        calls += 1;
        if (!request.cursor) return page({ ids: [1], cursor: "c1", complete: false });
        throw new Error("offline");
      },
    },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "all", filters: {} });
  await flush();
  await flush();
  assert.deepEqual(controller.getSnapshot().items.map((item) => item.watchmode_id), [1]);
  assert.equal(controller.getSnapshot().status, "error");
  controller.query({ view: "all", filters: {} });
  await flush();
  assert.equal(calls, 2);
  controller.destroy();
});

await check("nur die Missing-RPC-Marke aktiviert genau einmal den Legacy-Fallback", async () => {
  let fallbacks = 0;
  const controller = createStreamingPageController({
    service: {
      loadCachedPage: async () => null,
      loadPage: async () => { throw Object.assign(new Error("missing"), { reason: STREAMING_PAGE_RPC_MISSING }); },
    },
    legacyFallback: async () => { fallbacks += 1; },
  });
  controller.setContext(context());
  controller.setActive(true);
  controller.query({ view: "all", filters: {} });
  await flush();
  assert.equal(fallbacks, 1);
  assert.equal(controller.getSnapshot().enabled, false);
  controller.query({ view: "all", filters: {} });
  await flush();
  assert.equal(fallbacks, 1);
  controller.destroy();
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("STREAMING-PAGE-STATE-TEST BESTANDEN");
