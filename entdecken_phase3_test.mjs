/* Entdecken/Radar: lokale Verträge plus echte React-/JSDOM-Oberfläche.
   Kein Netz, kein Provider, keine KI, keine Migration. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  createEntdeckenRecommendations,
  createRadarCatalogIndex,
  createCatalogSearchActions,
  createEntdeckenCatalogSummary,
  createEntdeckenRecommendationFunnel,
  RADAR_CATALOG_SEARCH_LIMIT,
  rankLocalEntdeckenRecommendations,
  searchRadarCatalog,
  selectDailyRecommendations,
} from "./src/lib/entdeckenUi.js";
import {
  applyPersonRadarCheckResult,
  createEmptyLocalRadar,
  decodeLocalRadar,
  queueAccountRadarChange,
  reconcileAccountRadarPilotFeed,
  upsertGuestPersonRadarSubscription,
  upsertGuestRadarSubscription,
} from "./src/lib/localEventRadar.js";
import { createEntdeckenDailyFeedService } from "./src/services/entdeckenDailyFeed.js";
import "./radar_websearch_mvp_test.mjs";

let checks = 0;
let act = async (callback) => callback();
let tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const check = (name, fn) => {
  fn(); checks += 1;
  console.log(`✓ ${name}`);
};

const seriesActions = createCatalogSearchActions({
  watchmodeId: 4711, title: "Synthetische Serie", type: "tv_series",
});
check("Seriensuche trennt Beobachten und Radar in zwei Intent-Verträge", () => {
  assert.equal(seriesActions.watch.intent, "watch");
  assert.equal(seriesActions.radar.intent, "radar");
  assert.equal(seriesActions.watch.setsRadar, false);
  assert.equal(seriesActions.radar.setsObserved, false);
});
check("Titeltext allein wird niemals zur Radaridentität", () => {
  const actions = createCatalogSearchActions({ title: "Nur ein Name", type: "movie" });
  assert.equal(actions.target, null);
  assert.equal(actions.radar, null);
});

const radarCatalogIndex = createRadarCatalogIndex({
  master: [
    { id: "mediathek-geheimnis-2001", titel: "Das Geheimnis", originaltitel: "Library Secret", jahr: 2001, typ: "film" },
    { id: "dune-1984", titel: "Dune", jahr: 1984, typ: "film" },
    { id: "dune-2021", titel: "Dune", jahr: 2021, typ: "film" },
    { id: "passender-film", watchmode_id: 91, titel: "Passender Film", jahr: 2026, typ: "film" },
    { id: "guarded-merge", titel: "Guarded Merge", jahr: 2024, typ: "film" },
    { id: "guarded-ambiguous", titel: "Guarded Ambiguous", jahr: 2025, typ: "film" },
  ],
  streamingKnown: { titel: [
    { watchmode_id: 91, titel: "Passender Film", jahr: 2026, typ: "movie" },
    { watchmode_id: 92, titel: "Guarded Merge", jahr: 2024, typ: "movie" },
    { watchmode_id: 93, titel: "Guarded Ambiguous", jahr: 2025, typ: "movie" },
    { watchmode_id: 94, titel: "Guarded Ambiguous", jahr: 2025, typ: "movie" },
  ] },
  streamingDiscover: { titel: [
    ...Array.from({ length: 10_050 }, (_, index) => ({
      watchmode_id: 10_000 + index, titel: `Katalog Titel ${index}`, jahr: 2020, typ: "movie",
    })),
  ] },
});
check("Radar-Suchindex vereinigt Mediathek und Streaming nur über starke Ziel-IDs", () => {
  const shared = radarCatalogIndex.filter((entry) => entry.targetId === "watchmode:91");
  assert.equal(shared.length, 1);
  assert.deepEqual(shared[0].sources, ["Mediathek", "Streaming"]);
  const dunes = searchRadarCatalog(radarCatalogIndex, "Dune");
  assert.deepEqual(dunes.map((entry) => entry.year), [1984, 2021]);
});
check("Ohne gemeinsame ID vereinigt nur ein eindeutiger Titel+Jahr+Typ-Guard die Quellen", () => {
  const guarded = radarCatalogIndex.filter((entry) => entry.title === "Guarded Merge");
  assert.deepEqual(guarded.map((entry) => entry.targetId), ["watchmode:92"]);
  assert.deepEqual(guarded[0].sources, ["Mediathek", "Streaming"]);
  const ambiguous = radarCatalogIndex.filter((entry) => entry.title === "Guarded Ambiguous");
  assert.equal(ambiguous.length, 3);
  assert.ok(ambiguous.some((entry) => entry.targetId === "catalog:guarded-ambiguous"));
});
check("Radar-Suche findet Mediathek-Originaltitel und begrenzt große Kataloge hart", () => {
  assert.equal(searchRadarCatalog(radarCatalogIndex, "Library Secret")[0]?.targetId, "catalog:mediathek-geheimnis-2001");
  const viele = searchRadarCatalog(radarCatalogIndex, "Katalog Titel");
  assert.equal(viele.length, RADAR_CATALOG_SEARCH_LIMIT);
  assert.ok(viele.every((entry) => entry.searchKeys.length > 0));
});

const recommendationInput = {
  region: "AT", stand: "2026-08-18T00:00:00.000Z", titel: [{
    watchmode_id: 91, titel: "Passender Film", typ: "movie", dienste: ["Testdienst"],
    genres: ["drama"], tags: [], jahr: 2026,
  }],
};
const profileInput = { signals: [{ kind: "genre", value: "drama", direction: "positive", confirmed: true, strength: 2 }] };
const recommendationBefore = JSON.stringify({ recommendationInput, profileInput });
const recommendations = rankLocalEntdeckenRecommendations({
  streamingEntdecken: recommendationInput, profile: profileInput, master: [],
  selectedServices: ["Testdienst"],
});
check("Lokale Empfehlung ist begründet und mutiert weder Katalog noch Profil", () => {
  assert.equal(recommendations.length, 1);
  assert.match(recommendations[0].reasons[0], /^Profil:/);
  assert.equal(JSON.stringify({ recommendationInput, profileInput }), recommendationBefore);
});

const catalogTruthInput = {
  region: "AT", stand: "2026-08-18T00:00:00.000Z",
  katalogMengen: { rohkatalog: 12, masterbestand: 3, imMasterGefunden: 3, nachMasterAbzug: 9, umfang: "voll" },
  titel: [
    { watchmode_id: 91, titel: "Passender Film", jahr: 2026, typ: "movie", dienste: ["Testdienst"], genres: ["drama"] },
    { watchmode_id: 92, titel: "Alpha Neutral", jahr: 2020, typ: "movie", dienste: ["Testdienst"] },
    { watchmode_id: 93, titel: "Bravo Neutral", jahr: 2021, typ: "movie", dienste: ["Testdienst"] },
    { watchmode_id: 94, titel: "Charlie Neutral", jahr: 2022, typ: "movie", dienste: ["Testdienst"] },
    { watchmode_id: 95, titel: "Delta Neutral", jahr: 2023, typ: "movie", dienste: ["Testdienst"] },
    { watchmode_id: 96, titel: "Echo Neutral", jahr: 2024, typ: "movie", dienste: ["Testdienst"] },
    { watchmode_id: 97, titel: "Foxtrot Neutral", jahr: 2025, typ: "movie", dienste: ["Testdienst"] },
    { watchmode_id: 98, titel: "Gamma Neutral", jahr: 2026, typ: "movie", dienste: ["Testdienst"] },
    { watchmode_id: 99, titel: "Fremder Dienst", jahr: 2026, typ: "movie", dienste: ["Anderer Dienst"] },
  ],
};
const discoveryFeed = {
  format: 3, feedId: "websearch:daily-tips-at", region: "AT", sourceId: "websearch:daily-tips",
  refreshedOn: "2026-08-21", validUntil: "2026-08-22", items: [{
    recordId: "webtip:aaaaaaaaaaaaaaaa", title: "Alpha Neutral", mediaType: "film", releaseYear: 2020,
    attributes: { genres: [], tags: ["kritik-tipp"] }, rank: 1,
    evidence: [{ domain: "film.at", url: "https://film.at/alpha-neutral", publishedOn: "2026-08-21", retrievedOn: "2026-08-21", positiveRecommendation: true }],
  }],
};
const ohneFeed = createEntdeckenRecommendations({
  streamingEntdecken: catalogTruthInput, profile: profileInput,
  selectedServices: ["Testdienst"],
});
check("Ohne belegten Tagesfeed bleibt Weitere Entdeckungen leer statt alphabetisch aufzufüllen", () => {
  assert.deepEqual(ohneFeed.personal.map((entry) => entry.targetId), ["watchmode:91"]);
  assert.deepEqual(ohneFeed.further, []);
});
check("Ohne gewählten Streamingdienst bleiben persönliche und weitere Karten leer", () => {
  assert.deepEqual(createEntdeckenRecommendations({
    streamingEntdecken: catalogTruthInput, profile: profileInput, webDiscoveryFeed: discoveryFeed,
  }), { personal: [], further: [] });
});
check("Weitere Entdeckungen enthält nur den streng lokal gematchten Webtipp", () => {
  const withFeed = createEntdeckenRecommendations({
    streamingEntdecken: catalogTruthInput, profile: profileInput,
    selectedServices: ["Testdienst"], webDiscoveryFeed: discoveryFeed,
  });
  assert.deepEqual(withFeed.personal.map((entry) => entry.targetId), ["watchmode:91"]);
  assert.deepEqual(withFeed.further.map((entry) => entry.targetId), ["watchmode:92"]);
  assert.equal(withFeed.further[0].externalEvidence[0].domain, "film.at");
});
check("Mehrdeutiger Titel+Jahr+Typ-Treffer wird nicht als Webentdeckung geraten", () => {
  const ambiguous = createEntdeckenRecommendations({
    streamingEntdecken: {
      ...catalogTruthInput,
      titel: [...catalogTruthInput.titel, {
        watchmode_id: 192, titel: "Alpha Neutral", jahr: 2020, typ: "movie", dienste: ["Testdienst"],
      }],
    },
    profile: profileInput, selectedServices: ["Testdienst"], webDiscoveryFeed: discoveryFeed,
  });
  assert.ok(!ambiguous.further.some((entry) => entry.title === "Alpha Neutral"));
});
const topTwentyOne = Array.from({ length: 21 }, (_, index) => ({
  targetId: `watchmode:${1000 + index}`, title: `Passung ${String(index + 1).padStart(2, "0")}`,
}));
check("Tagesoption ist pro Tag stabil, wechselt zwischen Tagen und bleibt in den Top 20", () => {
  const fixed = selectDailyRecommendations(topTwentyOne, { dailyVariety: false, selectionDay: "2026-08-21" });
  const todayA = selectDailyRecommendations(topTwentyOne, { dailyVariety: true, selectionDay: "2026-08-21" });
  const todayB = selectDailyRecommendations(topTwentyOne, { dailyVariety: true, selectionDay: "2026-08-21" });
  const tomorrow = selectDailyRecommendations(topTwentyOne, { dailyVariety: true, selectionDay: "2026-08-22" });
  assert.deepEqual(fixed.map((entry) => entry.targetId), topTwentyOne.slice(0, 6).map((entry) => entry.targetId));
  assert.deepEqual(todayA, todayB);
  assert.notDeepEqual(todayA.map((entry) => entry.targetId), tomorrow.map((entry) => entry.targetId));
  assert.ok([...todayA, ...tomorrow].every((entry) => entry.targetId !== "watchmode:1020"));
});
const ownerSession = Object.freeze({
  mode: "account", state: "ready", account: Object.freeze({ id: "account-1", role: "owner" }),
  access: Object.freeze({ status: "resolved", role: "owner" }),
  capabilities: Object.freeze({ remoteStorage: true, personalAi: true }),
});
let dailyFetches = 0;
const dailyRequests = [];
const dailyService = createEntdeckenDailyFeedService({
  config: {
    entdeckenDailyFeedEnabled: true,
    supabaseUrl: "https://project.example.supabase.co",
    supabasePublishableKey: "public-key",
  },
  auth: { getSnapshot: () => ownerSession },
  getAccount: () => ({ id: "account-1" }),
  getAccessToken: async () => "session-token",
  currentDay: () => "2026-08-21",
  fetchImpl: async (...request) => {
    dailyFetches += 1; dailyRequests.push(request);
    return { ok: true, json: async () => ({ ok: true, status: "fresh", feed: discoveryFeed, writes: 0, providerRequests: 0, searchRequests: 0 }) };
  },
});
const dailyResult = await dailyService.load();
check("Daily-Feed-Client lädt genau einmal bodylos und übernimmt nur den validierten Feed", () => {
  assert.equal(dailyFetches, 1);
  assert.equal(dailyResult.status, "fresh");
  assert.equal(dailyResult.feed.items[0].recordId, "webtip:aaaaaaaaaaaaaaaa");
  assert.match(dailyRequests[0][0], /\/functions\/v1\/entdecken-daily-task$/);
  assert.equal(dailyRequests[0][1].method, "GET");
  assert.equal("body" in dailyRequests[0][1], false);
});
let disabledSideEffects = 0;
const disabledDaily = await createEntdeckenDailyFeedService({
  config: { entdeckenDailyFeedEnabled: false },
  auth: { getSnapshot: () => { disabledSideEffects += 1; return ownerSession; } },
  getAccessToken: async () => { disabledSideEffects += 1; return "token"; },
  fetchImpl: async () => { disabledSideEffects += 1; return null; },
}).load();
check("Daily-Feed-Buildgate sperrt vor Sitzung, Token und Netzwerk", () => {
  assert.equal(disabledDaily.status, "disabled");
  assert.equal(disabledSideEffects, 0);
});
check("Kataloggröße und aktuelle Dienstetreffer bleiben getrennte Zahlen", () => {
  const summary = createEntdeckenCatalogSummary({
    streamingEntdecken: catalogTruthInput, selectedServices: ["Testdienst"],
  });
  assert.deepEqual(summary, {
    catalogSize: 12, currentCount: 8, afterLibraryCount: 9, selectedServiceCount: 1, coverage: "full",
  });
  assert.equal(createEntdeckenCatalogSummary({
    streamingEntdecken: { titel: catalogTruthInput.titel }, selectedServices: ["Testdienst"],
  }).coverage, "limited");
});

const funnelCatalog = {
  region: "AT", stand: "2026-08-18T00:00:00.000Z", titel: [
    { watchmode_id: 201, titel: "Fixture 201", dienste: ["Testdienst"], genres: ["drama"] },
    { watchmode_id: 202, titel: "Fixture 202", dienste: ["Testdienst"] },
    { watchmode_id: 203, titel: "Fixture 203", dienste: ["Testdienst"] },
    { watchmode_id: 204, titel: "Fixture 204", dienste: ["Testdienst"], genres: ["gore"] },
    { watchmode_id: 205, titel: "Fixture 205", dienste: ["Testdienst"], available_from: "2026-08-10", relevanz: 2 },
    { watchmode_id: 206, titel: "Fixture 206", dienste: ["Testdienst"], available_from: "2026-08-10", relevanz: 4 },
    { watchmode_id: 207, titel: "Fixture 207", dienste: ["Testdienst"], available_from: "2026-08-09", relevanz: 5 },
    { watchmode_id: 208, titel: "Fixture 208", dienste: ["Testdienst"], available_from: "2026-08-08", relevanz: 3 },
    { watchmode_id: 209, titel: "Fixture 209", dienste: ["Testdienst"], available_from: "2026-08-07", relevanz: 1 },
    { watchmode_id: 210, titel: "Fixture 210", dienste: ["Anderer Dienst"] },
    { watchmode_id: 211, titel: "Fixture 211", dienste: [] },
  ],
};
const funnelProfile = { signals: [
  { kind: "genre", value: "drama", direction: "positive", confirmed: true, strength: 3 },
  { kind: "genre", value: "gore", direction: "negative", confirmed: true, strength: 5, blocking: true },
] };
const funnelMaster = [{ watchmode_id: 202, titel: "Fixture 202", bewertung: null }];
const funnelMustwatch = [{
  id: "mw_fixture", titel: "Fixture 203", verknuepfung: { ziel: "streaming", id: 203 },
}];
const funnel = createEntdeckenRecommendationFunnel({
  streamingEntdecken: funnelCatalog, profile: funnelProfile, master: funnelMaster,
  mustwatch: funnelMustwatch, selectedServices: ["Testdienst"],
});
check("Realistischer Trichter belegt rein numerisch genau eine persönliche Karte", () => {
  assert.deepEqual(funnel, {
    catalogCount: 11, serviceAvailableCount: 9, hardEligibleCount: 6,
    reasonedCount: 1, personalCount: 1,
  });
  assert.ok(Object.values(funnel).every(Number.isInteger));
  assert.doesNotMatch(JSON.stringify(funnel), /"(?:titel|title|profil|profile|signals?|reasons?)"\s*:|fixture:/i);
});
check("Persönliche Passung bleibt getrennt; ohne Feed entstehen keine weiteren Füllkarten", () => {
  const personal = rankLocalEntdeckenRecommendations({
    streamingEntdecken: funnelCatalog, profile: funnelProfile, master: funnelMaster,
    mustwatch: funnelMustwatch, selectedServices: ["Testdienst"],
  });
  const projected = createEntdeckenRecommendations({
    streamingEntdecken: funnelCatalog, selectedServices: ["Testdienst"],
    master: funnelMaster, profile: funnelProfile,
  });
  assert.equal(personal.length, 1);
  assert.deepEqual(projected.further, []);
});

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const appNavigation = fs.readFileSync(path.join(wurzel, "src/components/AppNavigation.jsx"), "utf8");
const appSource = fs.readFileSync(path.join(wurzel, "src/App.jsx"), "utf8");
const entdeckenSource = fs.readFileSync(path.join(wurzel, "src/tabs/EntdeckenTab.jsx"), "utf8");
const cssSource = fs.readFileSync(path.join(wurzel, "src/index.css"), "utf8");
check("Sichtbar heißt es Blog; technischer blog/meinungen-Deep-Link bleibt kompatibel", () => {
  assert.match(appNavigation, /id:\s*"blog",\s*label:\s*"Entdecken"/);
  assert.match(appSource, /setBlogFokus\(id\);\s*setTab\("blog"\)/);
  assert.match(entdeckenSource, /\["meinungen", "Blog"\]/);
  assert.match(entdeckenSource, /if \(fokusId\) setAnsicht\("meinungen"\)/);
});
check("Verwaltung nutzt SVG, 44-Pixel-Ziel und App-Font im Portal", () => {
  assert.match(entdeckenSource, /aria-label="Entdecken verwalten"/);
  assert.match(entdeckenSource, /<svg aria-hidden="true"/);
  assert.doesNotMatch(entdeckenSource, /⚙/);
  assert.match(cssSource, /\.kd-entdecken-tabs \.kd-entdecken-verwalten[^}]*44px/);
  assert.match(cssSource, /\.kd-entdecken-layer[^}]*font-family:'Space Grotesk'/);
  assert.doesNotMatch(entdeckenSource, /kd-pilot-quellen/);
  assert.match(appSource, /mustwatch=\{mustwatch\}/);
});

async function loadEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}

const cacheDir = path.join(wurzel, ".tmp");
let outputDir = null;
let dom = null;
try {
  fs.mkdirSync(cacheDir, { recursive: true });
  outputDir = fs.mkdtempSync(path.join(cacheDir, "entdecken-radar-test-"));
  const output = path.join(outputDir, "bundle.mjs");
  const esbuild = await loadEsbuild();
  await esbuild.build({
    stdin: {
      contents: [
        'import React from "react";',
        'import { EntdeckenTab } from "./src/tabs/EntdeckenTab.jsx";',
        'import { useWebDiscoveryFeed } from "./src/controllers/useWebDiscoveryFeed.js";',
        'export { EntdeckenTab };',
        'export { RadarSubscriptionPreview } from "./src/components/RadarSubscriptionPreview.jsx";',
        'export function DailyFeedHarness({ dailyService, ...props }) {',
        '  const webDiscoveryFeed = useWebDiscoveryFeed(true, true, dailyService);',
        '  return React.createElement(EntdeckenTab, { ...props, webDiscoveryFeed });',
        '}',
      ].join("\n"),
      loader: "js", resolveDir: wurzel,
    },
    bundle: true, format: "esm", outfile: output, jsx: "automatic", target: "es2022", logLevel: "warning",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });
  const { DailyFeedHarness, EntdeckenTab, RadarSubscriptionPreview } = await import(output);

  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  for (const name of [
    "window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement",
    "Element", "Event", "MouseEvent", "KeyboardEvent", "Node", "NodeList", "getComputedStyle", "localStorage",
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
    });
  }
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
  dom.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
  dom.window.scrollTo = () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import("react");
  const { act: reactAct, createElement: h } = React;
  act = reactAct;
  const { createRoot } = await import("react-dom/client");
  tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  const button = (root, label) => [...root.querySelectorAll("button")]
    .find((entry) => entry.textContent.trim() === label);
  const setControl = async (control, value) => {
    const prototype = control instanceof dom.window.HTMLSelectElement
      ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    await act(async () => {
      descriptor.set.call(control, value);
      control.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      control.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      await tick();
    });
  };
  async function mount(Component, props) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = async (nextProps) => {
      await act(async () => { root.render(h(Component, nextProps)); await tick(); });
    };
    await render(props);
    return {
      container, root, render,
      async cleanup() { await act(async () => { root.unmount(); await tick(); }); container.remove(); },
    };
  }

  const emptyBlogProps = {
    artikel: [], master: [], angemeldet: false,
    onFokusVerbraucht() {}, onErstellen: async () => null, onAktualisieren: async () => null,
    onSetzeRef() {}, onFreigeben: async () => false, onLoeschen: async () => false,
    onAddFilm: async () => null, onSpringeZuFilm() {},
  };
  const baseProps = {
    blogProps: emptyBlogProps, seriesCatalog: [], entdeckenStatus: {}, master: [],
    streamingKnown: null, streamingDiscover: recommendationInput,
    accountMode: false, onObserveToggle() {}, onRadarChange() {}, onRadarPreview() {}, onShareChange() {},
  };

  const ui = await mount(EntdeckenTab, { ...baseProps, radarState: createEmptyLocalRadar() });
  check("Entdecken zeigt Blog und ein direkt anschließendes Icon-only-Control", () => {
    const tabs = [...ui.container.querySelectorAll('[role="tab"]')];
    assert.deepEqual(tabs.map((entry) => entry.textContent), ["Empfehlungen", "Radar", "Blog"]);
    const manage = ui.container.querySelector('button[aria-label="Entdecken verwalten"]');
    assert.ok(manage?.querySelector("svg"));
    assert.equal(manage.previousElementSibling?.textContent, "Blog");
    assert.equal(manage.getAttribute("title"), "Entdecken verwalten");
  });
  const manageTrigger = ui.container.querySelector('button[aria-label="Entdecken verwalten"]');
  manageTrigger.focus();
  await act(async () => { manageTrigger.click(); await tick(); });
  check("Verwaltung hat verständliche Leerzustände ohne technische Schlüssel", () => {
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="kd-entdecken-manage-title"]');
    assert.ok(dialog);
    assert.match(dialog.textContent, /Noch kein Werk im Radar/);
    assert.doesNotMatch(dialog.outerHTML, /Pilot|Fixture|Proposal|JSON|Hash|Outbox|Serverrevision|watchmode:/i);
    assert.equal(document.body.classList.contains("kd-scroll-gesperrt"), true);
  });
  await act(async () => {
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
  });
  check("Escape schließt die Verwaltung und gibt den Fokus zurück", () => {
    assert.equal(document.querySelector('[aria-labelledby="kd-entdecken-manage-title"]'), null);
    assert.equal(document.body.classList.contains("kd-scroll-gesperrt"), false);
    assert.equal(document.activeElement, manageTrigger);
  });
  await ui.cleanup();

  const catalogUi = await mount(EntdeckenTab, {
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: catalogTruthInput,
    selectedServices: ["Testdienst"],
  });
  check("Entdecken trennt Vollkatalog und Dienstetreffer sichtbar", () => {
    const catalog = catalogUi.container.querySelector('[aria-label="Katalog und aktuelle Treffermenge"]');
    assert.match(catalog?.textContent || "", /Kataloggröße12 Titel/);
    assert.match(catalog?.textContent || "", /Aktuelle Treffermenge8 Titel aus deinen Diensten/);
    assert.match(catalog?.textContent || "", /Sie verändert die Kataloggröße nicht/);
  });
  check("Ohne Tagesfeed zeigt Weitere Entdeckungen einen ehrlichen Leerzustand ohne Katalogfüller", () => {
    const section = catalogUi.container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
    assert.match(section?.textContent || "", /Weitere Entdeckungen/);
    assert.match(section?.textContent || "", /keine Katalogtitel als Ersatz aufgefüllt/);
    assert.equal(section?.querySelectorAll("article").length, 0);
    assert.doesNotMatch(section?.textContent || "", /Alpha Neutral|Bravo Neutral|Charlie Neutral/);
  });
  let dailyHookRequests = 0;
  const dailyHookService = {
    async load() {
      dailyHookRequests += 1;
      return { status: "fresh", feed: discoveryFeed };
    },
  };
  const dailyHookUi = await mount(DailyFeedHarness, {
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: catalogTruthInput,
    selectedServices: ["Testdienst"], dailyService: dailyHookService,
  });
  await act(async () => { await tick(); });
  check("Taböffnung lädt genau einmal und zeigt nur den streng gematchten Tagesfeed-Titel", () => {
    const section = dailyHookUi.container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
    assert.equal(dailyHookRequests, 1);
    assert.equal(section?.querySelectorAll(".kd-entdecken-webtipp").length, 1);
    assert.match(section?.textContent || "", /Alpha Neutral.*film.at/);
    assert.doesNotMatch(section?.textContent || "", /Bravo Neutral|Charlie Neutral/);
  });
  await dailyHookUi.render({
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: catalogTruthInput,
    selectedServices: ["Testdienst"], dailyService: dailyHookService,
  });
  check("Ein Re-Render desselben Tabs startet keinen zweiten Tagesfeed-Request", () => {
    assert.equal(dailyHookRequests, 1);
  });
  await dailyHookUi.cleanup();

  const unavailableDailyUi = await mount(DailyFeedHarness, {
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: catalogTruthInput,
    selectedServices: ["Testdienst"],
    dailyService: { load: async () => ({ status: "unavailable", feed: null }) },
  });
  await act(async () => { await tick(); });
  check("Fehler ohne validierten Cache bleibt ein ehrlicher Leerzustand ohne Füllkarten", () => {
    const section = unavailableDailyUi.container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
    assert.equal(section?.querySelectorAll("article").length, 0);
    assert.match(section?.textContent || "", /keine Katalogtitel als Ersatz aufgefüllt/);
  });
  await unavailableDailyUi.cleanup();

  await catalogUi.render({
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: catalogTruthInput,
    selectedServices: ["Testdienst"], webDiscoveryFeed: discoveryFeed,
  });
  check("Ein streng gematchter Webtipp erscheint mit Beleg statt neutraler Passungsbehauptung", () => {
    const section = catalogUi.container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
    const cards = [...(section?.querySelectorAll(".kd-entdecken-webtipp") || [])];
    assert.equal(cards.length, 1);
    assert.match(cards[0].textContent, /Alpha Neutral.*film.at/);
    assert.doesNotMatch(cards[0].textContent, /persönliche Passung/i);
  });
  await catalogUi.cleanup();

  const loadingUi = await mount(EntdeckenTab, {
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: null,
    selectedServices: ["Testdienst"], catalogLoading: true,
  });
  check("Entdecken benennt Laden und Fehler ohne einen leeren Vollkatalog vorzutäuschen", () => {
    assert.match(loadingUi.container.querySelector('[role="status"]')?.textContent || "", /Katalog wird geladen/);
    assert.equal(loadingUi.container.querySelector('[aria-label="Katalog und aktuelle Treffermenge"]'), null);
  });
  await loadingUi.render({
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: catalogTruthInput,
    selectedServices: ["Testdienst"], catalogError: true,
  });
  check("Fehlgeschlagener Vollkatalog bleibt als verständlicher Ersatzstand erkennbar", () => {
    const alert = loadingUi.container.querySelector('[role="alert"]');
    assert.match(alert?.textContent || "", /vollständige Katalog konnte nicht geladen werden/);
    assert.doesNotMatch(alert?.textContent || "", /RPC|HTTP|Cache|Payload|Exception/i);
  });
  await loadingUi.cleanup();

  const deepLinkUi = await mount(EntdeckenTab, {
    ...baseProps, fokusId: "blog:fehlend", radarState: createEmptyLocalRadar(),
  });
  check("Ein bestehender Blog-Deep-Link öffnet weiterhin den Blog", () => {
    assert.equal(deepLinkUi.container.querySelector('[role="tab"][aria-selected="true"]').textContent, "Blog");
    assert.equal(deepLinkUi.container.querySelector('[role="tabpanel"]').getAttribute("aria-label"), "Blog");
  });
  await deepLinkUi.cleanup();

  const workTarget = {
    targetId: "watchmode:91", targetType: "work", targetStatus: "active",
    title: "Passender Film", canonical: true,
  };
  let previewTarget = null;
  const starWarsCatalog = {
    region: "AT", stand: "2026-08-21T00:00:00.000Z", titel: [
      { watchmode_id: 71001, titel: "Star Wars: Episode I", jahr: 1999, typ: "movie", dienste: ["Testdienst"] },
      { watchmode_id: 71002, titel: "Star Wars: Episode II", jahr: 2002, typ: "movie", dienste: ["Testdienst"] },
      { watchmode_id: 71003, titel: "Star Wars: Episode III", jahr: 2005, typ: "movie", dienste: ["Testdienst"] },
      { watchmode_id: 71004, titel: "Star Wars: Episode IV", jahr: 1977, typ: "movie", dienste: ["Testdienst"] },
    ],
  };
  const workPicker = await mount(EntdeckenTab, {
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: starWarsCatalog,
    onRadarPreview: (target) => { previewTarget = target; },
  });
  await act(async () => { button(workPicker.container, "Radar").click(); await tick(); });
  const workSearch = workPicker.container.querySelector("#kd-radar-work");
  check("Radar materialisiert den Katalog nicht mehr als Options-Dropdown", () => {
    assert.equal(workSearch?.getAttribute("type"), "search");
    assert.equal(workPicker.container.querySelectorAll("#kd-radar-work option").length, 0);
    assert.equal(workPicker.container.querySelectorAll(".kd-radar-work-results li").length, 0);
  });
  await setControl(workSearch, "Star Wars");
  check("Radar-Suchtreffer bleiben begrenzt und stammen aus dem vorbereiteten Katalog", () => {
    const results = workPicker.container.querySelectorAll(".kd-radar-work-results li");
    assert.equal(results.length, 4);
    assert.ok(results.length <= RADAR_CATALOG_SEARCH_LIMIT);
    assert.match(results[0].textContent, /Star Wars: Episode I.*1999.*Streaming/);
  });
  for (const resultButton of workPicker.container.querySelectorAll(".kd-radar-work-results button")) {
    await act(async () => { resultButton.click(); await tick(); });
  }
  check("Breite Suchbegriffe wählen nur die vier ausdrücklich angeklickten starken Ziele", () => {
    assert.equal(workPicker.container.querySelectorAll('.kd-radar-work-results button[aria-pressed="true"]').length, 4);
    assert.match(workPicker.container.textContent, /4 Titel ausgewählt/);
    assert.match(workPicker.container.textContent, /Kein Reihen- oder Franchise-Abo/);
  });
  await act(async () => { button(workPicker.container, "4 Titel prüfen").click(); await tick(); });
  check("Exakte Mehrfachauswahl wird gemeinsam an die Bestätigung übergeben", () => {
    assert.deepEqual(previewTarget.map((entry) => entry.targetId), [
      "watchmode:71001", "watchmode:71002", "watchmode:71003", "watchmode:71004",
    ]);
    assert.deepEqual(previewTarget.map((entry) => [entry.year, ...entry.sources]), [
      [1999, "Streaming"], [2002, "Streaming"], [2005, "Streaming"], [1977, "Streaming"],
    ]);
    assert.match(workPicker.container.textContent, /Ziel hinzufügen/);
    assert.doesNotMatch(workPicker.container.innerHTML, /watchmode:7100|fixture:|work:/i);
  });
  await workPicker.cleanup();

  let previewConfirmed = 0;
  const preview = await mount(RadarSubscriptionPreview, {
    target: workTarget, radarState: createEmptyLocalRadar(), accountMode: false,
    onConfirm: async () => { previewConfirmed += 1; return true; }, onClose() {},
  });
  check("Werk-Abo entsteht erst nach expliziter Bestätigung", () => {
    assert.equal(previewConfirmed, 0);
    assert.equal(document.querySelector('.kd-radar-preview input[type="checkbox"]').disabled, true);
    assert.doesNotMatch(document.querySelector('.kd-radar-preview').outerHTML, /watchmode:91|fixture:|work:/i);
    assert.match(document.querySelector('.kd-radar-preview').textContent, /Im Gastmodus läuft keine serverseitige Prüfung/);
  });
  await act(async () => { button(document, "Ins Radar bestätigen").click(); await tick(); });
  check("Bestätigung ruft genau einen gekapselten Write auf", () => assert.equal(previewConfirmed, 1));
  await preview.cleanup();

  let multiConfirmed = null;
  const multiTargets = starWarsCatalog.titel.map((entry) => ({
    targetId: `watchmode:${entry.watchmode_id}`, targetType: "work", targetStatus: "active",
    title: entry.titel, year: entry.jahr, sources: ["Streaming"], canonical: true,
  }));
  const multiPreview = await mount(RadarSubscriptionPreview, {
    target: multiTargets, radarState: createEmptyLocalRadar(), accountMode: false,
    onConfirm: async (selected) => { multiConfirmed = selected; return true; }, onClose() {},
  });
  check("Gemeinsame Vorschau nennt jeden exakten Titel und erfindet kein Franchise-Ziel", () => {
    const dialog = document.querySelector(".kd-radar-preview");
    assert.match(dialog.textContent, /4 ausgewählte Titel/);
    for (const entry of multiTargets) {
      assert.match(dialog.textContent, new RegExp(entry.title));
      assert.match(dialog.textContent, new RegExp(`${entry.year}.*Streaming`));
    }
    assert.doesNotMatch(dialog.innerHTML, /franchise:/i);
  });
  await act(async () => { button(document, "4 Titel ins Radar bestätigen").click(); await tick(); });
  check("Eine gemeinsame Bestätigung übergibt exakt die vier ausgewählten Ziele", () => {
    assert.deepEqual(multiConfirmed.map((entry) => entry.targetId), multiTargets.map((entry) => entry.targetId));
  });
  await multiPreview.cleanup();

  const checksum = "a".repeat(64);
  const now = "2026-08-18T10:00:00.000Z";
  const eventId = "00000000-0000-4000-8000-000000000001";
  const eventVersionId = "00000000-0000-4000-8000-000000000011";
  const feedTarget = {
    targetId: "work:imdb:tt0137523", targetType: "work", targetStatus: "active",
    title: "Fight Club", canonical: true,
  };
  const feed = (events = []) => ({
    format: "kd-radar-pilot-feed-v1", revision: 1, checksum, reconciledAt: now,
    subscriptions: [{
      targetId: feedTarget.targetId, targetType: feedTarget.targetType, title: feedTarget.title,
      region: "AT", scope: "all", status: "active", updatedAt: now,
    }],
    events, receipts: [], operationAcks: [], radarReview: true,
  });
  let accountState = reconcileAccountRadarPilotFeed(createEmptyLocalRadar({ authority: "account-cache" }), feed()).state;
  let workResolve;
  const workCheck = new Promise((resolve) => { workResolve = resolve; });
  let workCalls = 0;
  const renderWorkProps = () => ({
    ...baseProps, accountMode: true, radarState: accountState,
    radarPilotEvents: accountState.pilot.events, radarCheckAvailable: true,
    today: "2026-09-01",
    onRadarWebsearchCheck: async () => { workCalls += 1; return workCheck; },
  });
  const workUi = await mount(EntdeckenTab, renderWorkProps());
  await act(async () => { button(workUi.container, "Radar").click(); await tick(); });
  await act(async () => { button(workUi.container, "Jetzt prüfen").click(); await tick(); });
  check("Werkprüfung zeigt einen klaren Ladezustand und startet genau einmal", () => {
    assert.equal(workCalls, 1);
    assert.ok(button(workUi.container, "Wird geprüft…")?.disabled);
  });
  const confirmedEvent = {
    eventId, eventVersionId, targetId: feedTarget.targetId, eventType: "kinostart_at", date: "2026-09-03",
    region: "AT", platform: "-", lifecycleStatus: "scheduled", verificationStatus: "confirmed",
    evidence: [{ sourceId: "film-at", sourceDomain: "film.at", url: "https://film.at/start", retrievedAt: now }],
  };
  await act(async () => { workResolve({ status: "confirmed", writes: 1 }); await workCheck; await tick(); });
  accountState = reconcileAccountRadarPilotFeed(accountState, feed([confirmedEvent])).state;
  await workUi.render(renderWorkProps());
  check("Typfähige Zielkarte zeigt Produktstatus und direkte Verwaltung", () => {
    const card = workUi.container.querySelector(".kd-entdecken-zielkarte");
    assert.match(card?.textContent || "", /Fight Club/);
    assert.match(card?.textContent || "", /Film oder Werk · Aktiv/);
    assert.ok(button(card, "Pausieren"));
    assert.ok(button(card, "Entfernen"));
  });
  check("Bestätigtes Werk-Ereignis erscheint im Sieben-Tage-Fenster", () => {
    assert.match(workUi.container.textContent, /Diese Woche/);
    assert.match(workUi.container.textContent, /Bestätigtes Ereignis/);
    assert.match(workUi.container.textContent, /Fight Club/);
    assert.match(workUi.container.textContent, /Kinostart in Österreich/);
    assert.equal(workUi.container.querySelector("a")?.textContent, "film.at");
  });
  const accountReload = decodeLocalRadar(JSON.stringify(accountState), { authority: "account-cache" });
  assert.equal(accountReload.ok, true);
  await workUi.cleanup();

  const pendingState = queueAccountRadarChange(accountState, {
    operationId: "10000000-0000-4000-8000-000000000090", action: "upsert", target: workTarget, now,
  }).state;
  let pendingSyncCalls = 0;
  let pendingSyncResolve;
  const pendingSync = new Promise((resolve) => { pendingSyncResolve = resolve; });
  const pendingUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: pendingState, syncStatus: "pending",
    onRadarPilotSync: async () => { pendingSyncCalls += 1; return pendingSync; },
  });
  await act(async () => { button(pendingUi.container, "Radar").click(); await tick(); });
  check("Ausstehende Kontoänderung hat eine sichtbare echte Bestätigung", () => {
    assert.match(pendingUi.container.textContent, /1 Änderung wartet noch auf Bestätigung/);
    assert.ok(button(pendingUi.container, "Änderung bestätigen"));
  });
  await act(async () => { button(pendingUi.container, "Änderung bestätigen").click(); await tick(); });
  check("Bestätigung zeigt Busy und startet den Sync exakt einmal", () => {
    assert.equal(pendingSyncCalls, 1);
    assert.ok(button(pendingUi.container, "Wird bestätigt…")?.disabled);
  });
  await act(async () => { pendingSyncResolve({ status: "ready", state: accountState }); await pendingSync; await tick(); });
  check("Erfolgreicher Sync benennt Commit und Feed-Reload verständlich", () => {
    assert.match(pendingUi.container.textContent, /Änderung bestätigt.*Radar wurde neu geladen/);
  });
  await act(async () => { pendingUi.container.querySelector('button[aria-label="Entdecken verwalten"]').click(); await tick(); });
  check("Auch die Verwaltungsfläche bietet für denselben Pending-Stand die echte Bestätigung an", () => {
    const manage = document.querySelector('[role="dialog"][aria-labelledby="kd-entdecken-manage-title"]');
    assert.ok(button(manage, "Änderung bestätigen"));
  });
  await act(async () => { document.querySelector('button[aria-label="Entdecken verwalten schließen und zurück"]').click(); await tick(); });
  await pendingUi.cleanup();
  const settledOutboxUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true,
    radarState: {
      ...pendingState,
      outbox: pendingState.outbox.map((entry) => ({ ...entry, status: "rejected" })),
    },
    syncStatus: "pending", onRadarPilotSync: async () => ({ status: "ready" }),
  });
  await act(async () => { button(settledOutboxUi.container, "Radar").click(); await tick(); });
  check("Nur wirklich ausstehende Outbox-Einträge bieten die Bestätigung an", () => {
    assert.equal(button(settledOutboxUi.container, "Änderung bestätigen"), undefined);
    assert.doesNotMatch(settledOutboxUi.container.textContent, /wartet noch auf Bestätigung/);
  });
  await settledOutboxUi.cleanup();
  const workReloadUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: accountReload.state,
    radarPilotEvents: accountReload.state.pilot.events, radarCheckAvailable: true, today: "2026-09-01",
  });
  await act(async () => { button(workReloadUi.container, "Radar").click(); await tick(); });
  check("Kanonischer Feed-Titel und Ereignis bleiben ohne Katalogfallback nach Reload sichtbar", () => {
    assert.match(workReloadUi.container.textContent, /Fight Club/);
    assert.match(workReloadUi.container.textContent, /Diese Woche/);
    assert.match(workReloadUi.container.textContent, /Bestätigtes Ereignis/);
    assert.doesNotMatch(workReloadUi.container.innerHTML, /Pilot|Fixture|Proposal|JSON|Outbox|Serverrevision|(?:watchmode|fixture|work):/i);
  });
  await workReloadUi.cleanup();

  const identity = { personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor", canonical: true };
  const selectedIdentity = {
    targetId: "person:wikidata:Q42869:actor",
    personExternalId: identity.personExternalId, name: identity.name, role: identity.role,
  };
  const personCatalog = [{ targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023 }];
  let personState = createEmptyLocalRadar();
  let personAddCalls = 0;
  let personUi;
  const renderPersonProps = () => ({
    ...baseProps, radarState: personState, personRadarAvailable: true,
    onPersonRadarAdd: async (selected) => {
      personAddCalls += 1;
      assert.deepEqual(selected, selectedIdentity);
      personState = upsertGuestPersonRadarSubscription(personState, { identity, now }).state;
      return { status: "active", writes: 1, identity };
    },
  });
  personUi = await mount(EntdeckenTab, renderPersonProps());
  await act(async () => { button(personUi.container, "Radar").click(); await tick(); });
  await setControl(personUi.container.querySelector("#kd-radar-person"), "Nicolas Cage");
  await setControl(personUi.container.querySelector("#kd-radar-person-result"), "person-0");
  const personPanel = [...personUi.container.querySelectorAll(".kd-entdecken-panel")]
    .find((entry) => /Person hinzufügen/.test(entry.textContent));
  await act(async () => { button(personPanel, "Ins Radar").click(); await tick(); });
  await personUi.render(renderPersonProps());
  check("Kuratierte Person wird mit Name und Rolle, aber ohne Roh-ID lokal sichtbar", () => {
    assert.equal(personAddCalls, 1);
    assert.match(personUi.container.textContent, /Nicolas Cage/);
    assert.match(personUi.container.textContent, /Schauspiel · Aktiv/);
    assert.doesNotMatch(personUi.container.innerHTML, /wikidata:Q42869/);
    assert.equal(button(personUi.container, "Jetzt prüfen"), undefined);
    assert.match(personUi.container.textContent, /Es läuft keine serverseitige Prüfung/);
  });
  await personUi.cleanup();

  const gatedPersonUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: createEmptyLocalRadar({ authority: "account-cache" }),
    personRadarAvailable: false,
  });
  await act(async () => { button(gatedPersonUi.container, "Radar").click(); await tick(); });
  await setControl(gatedPersonUi.container.querySelector("#kd-radar-person"), "Nicolas Cage");
  check("Lokaler Personenindex bleibt sichtbar, wenn nur die Kontoaktivierung fehlt", () => {
    assert.match(gatedPersonUi.container.textContent, /Nicolas Cage/);
    assert.match(gatedPersonUi.container.textContent, /Hinzufügen ist in diesem Konto noch nicht freigeschaltet/);
    assert.ok(button(gatedPersonUi.container, "Ins Radar")?.disabled);
    assert.doesNotMatch(gatedPersonUi.container.textContent, /Personensuche ist derzeit nicht verfügbar/);
  });
  await gatedPersonUi.cleanup();

  const personFeed = {
    ...feed(),
    subscriptions: [{
      targetId: selectedIdentity.targetId, targetType: "person", title: identity.name,
      personExternalId: identity.personExternalId, personRole: identity.role,
      region: "AT", scope: "all", status: "active", updatedAt: now,
    }],
    events: [],
  };
  personState = reconcileAccountRadarPilotFeed(createEmptyLocalRadar({ authority: "account-cache" }), personFeed).state;
  let personCheckCalls = 0;
  let personResolve;
  const personCheckPromise = new Promise((resolve) => { personResolve = resolve; });
  const renderAccountPersonProps = () => ({
    ...baseProps, accountMode: true, radarState: personState,
    radarPilotEvents: personState.pilot.events, personRadarAvailable: true,
    personRadarCheckAvailable: true, today: "2026-08-18",
    onPersonRadarCheck: async () => { personCheckCalls += 1; return personCheckPromise; },
  });
  personUi = await mount(EntdeckenTab, renderAccountPersonProps());
  await act(async () => { button(personUi.container, "Radar").click(); await tick(); });
  await act(async () => { button(personUi.container, "Jetzt prüfen").click(); await tick(); });
  check("Personenprüfung zeigt Ladezustand und startet genau einen manuellen Aufruf", () => {
    assert.equal(personCheckCalls, 1);
    assert.ok(button(personUi.container, "Wird geprüft…")?.disabled);
  });
  const personResponse = {
    status: "confirmed", checkedAt: "2026-08-18T10:01:00.000Z",
    windowStart: "2026-08-18", windowEnd: "2026-08-24", person: identity,
    candidates: [{
      targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023,
      role: "actor", eventType: "streamingstart_at", date: "2026-08-21", region: "AT", platform: "Netflix",
      evidence: [{
        sourceId: "netflix-at", sourceDomain: "netflix.example", url: "https://netflix.example/dream-scenario",
        retrievedAt: "2026-08-18T10:01:00.000Z",
      }],
    }],
  };
  const applied = applyPersonRadarCheckResult(personState, { identity, response: personResponse, catalog: personCatalog });
  assert.equal(applied.ok, true);
  personState = applied.state;
  await act(async () => { personResolve({ status: "confirmed", writes: 1 }); await personCheckPromise; await tick(); });
  await personUi.render(renderAccountPersonProps());
  check("Validierter Personen-Treffer erscheint belegt in Diese Woche, ohne Werk-Abo", () => {
    assert.match(personUi.container.textContent, /Dream Scenario/);
    assert.match(personUi.container.textContent, /Kuratierter Treffer/);
    assert.match(personUi.container.textContent, /Netflix/);
    assert.equal(personUi.container.querySelector("a")?.textContent, "netflix.example");
    assert.equal(personState.subscriptions.length, 0);
  });
  const savedPersonState = JSON.stringify(personState);
  await personUi.cleanup();
  const reloadedPerson = decodeLocalRadar(savedPersonState, { authority: "account-cache" });
  const personReloadUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: reloadedPerson.state,
    radarPilotEvents: reloadedPerson.state.pilot.events,
    personRadarAvailable: true, personRadarCheckAvailable: false, today: "2026-08-18",
  });
  await act(async () => { button(personReloadUi.container, "Radar").click(); await tick(); });
  check("Person, Rolle und Treffer überstehen Reload bei ehrlich nicht verfügbarer Quelle", () => {
    assert.match(personReloadUi.container.textContent, /Nicolas Cage/);
    assert.match(personReloadUi.container.textContent, /Schauspiel/);
    assert.match(personReloadUi.container.textContent, /Dream Scenario/);
    assert.match(personReloadUi.container.textContent, /manuelle Online-Prüfung ist derzeit nicht verfügbar/);
    assert.doesNotMatch(personReloadUi.container.textContent, /wikidata:|watchmode:|fixture:|Proposal|Hash|Outbox|Pilot/i);
  });
  await personReloadUi.cleanup();

  const guestUi = await mount(EntdeckenTab, {
    ...baseProps,
    radarState: upsertGuestRadarSubscription(createEmptyLocalRadar(), {
      target: workTarget, now,
    }).state,
    radarCheckAvailable: true,
  });
  await act(async () => { button(guestUi.container, "Radar").click(); await tick(); });
  check("Gast und Einzeldatei zeigen trotz irrtümlichem Availability-Prop keine Serverprüfung", () => {
    assert.equal(button(guestUi.container, "Jetzt prüfen"), undefined);
    assert.match(guestUi.container.textContent, /Es läuft keine serverseitige Prüfung/);
  });
  await guestUi.cleanup();

  const errorUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: accountReload.state,
    radarPilotEvents: accountReload.state.pilot.events,
    radarCheckAvailable: true,
    onRadarWebsearchCheck: async () => { throw new Error("mock failure"); },
  });
  await act(async () => { button(errorUi.container, "Radar").click(); await tick(); });
  await act(async () => { button(errorUi.container, "Jetzt prüfen").click(); await tick(); });
  check("Fehlerzustand bleibt verständlich und enthält keine Rohantwort", () => {
    const alert = errorUi.container.querySelector('[role="alert"]');
    assert.equal(alert?.textContent, "Die Suche ist derzeit nicht erreichbar.");
    assert.doesNotMatch(errorUi.container.textContent, /mock failure/);
  });
  await errorUi.cleanup();
} finally {
  if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  if (dom) dom.window.close();
}

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("ENTDECKEN-PHASE3-TEST BESTANDEN");
