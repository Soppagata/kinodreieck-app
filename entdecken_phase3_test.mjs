/* Entdecken/Radar: lokale Verträge plus echte React-/JSDOM-Oberfläche.
   Kein Netz, kein Provider, keine KI, keine Migration. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  createAdditionalServiceDiscoveries,
  createCatalogSearchActions,
  createEntdeckenCatalogSummary,
  rankLocalEntdeckenRecommendations,
} from "./src/lib/entdeckenUi.js";
import {
  applyPersonRadarCheckResult,
  createEmptyLocalRadar,
  decodeLocalRadar,
  reconcileAccountRadarPilotFeed,
  upsertGuestPersonRadarSubscription,
  upsertGuestRadarSubscription,
} from "./src/lib/localEventRadar.js";
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

const recommendationInput = {
  region: "AT", stand: "2026-08-18T00:00:00.000Z", titel: [{
    watchmode_id: 91, titel: "Passender Film", typ: "movie", dienste: ["Testdienst"],
    genres: ["drama"], tags: [], jahr: 2026,
  }],
};
const profileInput = { signals: [{ kind: "genre", value: "drama", direction: "positive", confirmed: true, strength: 2 }] };
const recommendationBefore = JSON.stringify({ recommendationInput, profileInput });
const recommendations = rankLocalEntdeckenRecommendations({ streamingEntdecken: recommendationInput, profile: profileInput, master: [] });
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
const personalRecommendations = [{ targetId: "watchmode:91", title: "Passender Film", reasons: ["Profil: Drama"] }];
const additional = createAdditionalServiceDiscoveries({
  streamingEntdecken: catalogTruthInput,
  selectedServices: ["Testdienst"],
  personalRecommendations,
});
check("Neutrale Dienstetreffer füllen stabil nur bis insgesamt sechs Karten", () => {
  assert.deepEqual(additional.map((entry) => entry.title), [
    "Alpha Neutral", "Bravo Neutral", "Charlie Neutral", "Delta Neutral", "Echo Neutral",
  ]);
  assert.equal(additional.length + personalRecommendations.length, 6);
  assert.ok(additional.every((entry) => entry.services.join() === "Testdienst"));
});
check("Neutrale Ergänzungen bleiben profilfrei, dublettenfrei und unabhängig von der Eingabereihenfolge", () => {
  const reversed = createAdditionalServiceDiscoveries({
    streamingEntdecken: { ...catalogTruthInput, titel: [...catalogTruthInput.titel].reverse() },
    selectedServices: ["Testdienst"], personalRecommendations,
  });
  assert.deepEqual(reversed.map((entry) => entry.targetId), additional.map((entry) => entry.targetId));
  assert.equal(new Set(additional.map((entry) => entry.targetId)).size, additional.length);
  assert.ok(additional.every((entry) => !("reasons" in entry) && !("bewertung" in entry) && !("profile" in entry)));
});
check("Ohne gewählte Dienste oder bei sechs persönlichen Treffern wird nichts neutral zugeschrieben", () => {
  assert.deepEqual(createAdditionalServiceDiscoveries({
    streamingEntdecken: catalogTruthInput, selectedServices: [], personalRecommendations,
  }), []);
  assert.deepEqual(createAdditionalServiceDiscoveries({
    streamingEntdecken: catalogTruthInput, selectedServices: ["Testdienst"],
    personalRecommendations: Array.from({ length: 6 }, (_, index) => ({ targetId: `personal:${index}` })),
  }), []);
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
        'export { EntdeckenTab } from "./src/tabs/EntdeckenTab.jsx";',
        'export { RadarSubscriptionPreview } from "./src/components/RadarSubscriptionPreview.jsx";',
      ].join("\n"),
      loader: "js", resolveDir: wurzel,
    },
    bundle: true, format: "esm", outfile: output, jsx: "automatic", target: "es2022", logLevel: "warning",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });
  const { EntdeckenTab, RadarSubscriptionPreview } = await import(output);

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
  check("Neutrale Ergänzungen stehen in einer eigenen, nicht personalisierten Sektion", () => {
    const section = catalogUi.container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
    const cards = [...(section?.querySelectorAll(".kd-entdecken-neutral") || [])];
    assert.match(section?.textContent || "", /Weitere Entdeckungen aus deinen Diensten/);
    assert.equal(cards.length, 6);
    assert.ok(cards.every((card) => /Aus deinen Diensten · neutral/.test(card.textContent)
      && /Keine Bewertung und keine persönliche Passungsbehauptung/.test(card.textContent)
      && !card.querySelector("ul")));
  });
  await catalogUi.cleanup();

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
  const workPicker = await mount(EntdeckenTab, {
    ...baseProps, radarState: createEmptyLocalRadar(), onRadarPreview: (target) => { previewTarget = target; },
  });
  await act(async () => { button(workPicker.container, "Radar").click(); await tick(); });
  await setControl(workPicker.container.querySelector("#kd-radar-work"), "werk-0");
  await act(async () => { button(workPicker.container, "Ins Radar").click(); await tick(); });
  check("Ziel wird nur über den vorbereiteten Katalog an die Bestätigung übergeben", () => {
    assert.deepEqual(previewTarget, workTarget);
    assert.match(workPicker.container.textContent, /Ziel hinzufügen/);
    assert.doesNotMatch(workPicker.container.innerHTML, /watchmode:91|fixture:|work:/i);
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
  const personCatalog = [{ targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023 }];
  let personState = createEmptyLocalRadar();
  let personAddCalls = 0;
  let personCheckCalls = 0;
  let personResolve;
  const personCheckPromise = new Promise((resolve) => { personResolve = resolve; });
  let personUi;
  const renderPersonProps = () => ({
    ...baseProps, radarState: personState, personRadarAvailable: true,
    onPersonRadarAdd: async ({ name, role }) => {
      personAddCalls += 1;
      assert.deepEqual({ name, role }, { name: "Nicolas Cage", role: "actor" });
      personState = upsertGuestPersonRadarSubscription(personState, { identity, now }).state;
      return { status: "active", writes: 1, identity };
    },
    onPersonRadarCheck: async () => { personCheckCalls += 1; return personCheckPromise; },
  });
  personUi = await mount(EntdeckenTab, renderPersonProps());
  await act(async () => { button(personUi.container, "Radar").click(); await tick(); });
  await setControl(personUi.container.querySelector("#kd-radar-person"), "Nicolas Cage");
  await act(async () => { button(personUi.container, "Person ins Radar").click(); await tick(); });
  await personUi.render(renderPersonProps());
  check("Person wird mit Name und Rolle, aber ohne Roh-ID sichtbar", () => {
    assert.equal(personAddCalls, 1);
    assert.match(personUi.container.textContent, /Nicolas Cage/);
    assert.match(personUi.container.textContent, /Schauspiel · Aktiv/);
    assert.doesNotMatch(personUi.container.innerHTML, /wikidata:Q42869/);
  });
  await act(async () => {
    const personButton = [...personUi.container.querySelectorAll("button")]
      .filter((entry) => entry.textContent.trim() === "Jetzt prüfen").at(-1);
    personButton.click(); await tick();
  });
  check("Personenprüfung zeigt Ladezustand und startet keinen zweiten Aufruf", () => {
    assert.equal(personCheckCalls, 1);
    assert.ok(button(personUi.container, "Wird geprüft…")?.disabled);
  });
  const personResponse = {
    status: "confirmed", checkedAt: "2026-08-18T10:01:00.000Z", person: identity,
    candidates: [{ targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023 }],
  };
  const applied = applyPersonRadarCheckResult(personState, { identity, response: personResponse, catalog: personCatalog });
  assert.equal(applied.ok, true);
  personState = applied.state;
  await act(async () => { personResolve({ status: "confirmed", writes: 1 }); await personCheckPromise; await tick(); });
  await personUi.render(renderPersonProps());
  check("Validierter Personen-Treffer bleibt Vorschlag ohne Werk-Abo", () => {
    assert.match(personUi.container.textContent, /Dream Scenario/);
    assert.match(personUi.container.textContent, /2023/);
    assert.equal(personState.subscriptions.length, 0);
  });
  const savedPersonState = JSON.stringify(personState);
  await personUi.cleanup();
  const reloadedPerson = decodeLocalRadar(savedPersonState, { authority: "guest" });
  const personReloadUi = await mount(EntdeckenTab, {
    ...baseProps, radarState: reloadedPerson.state, personRadarAvailable: false,
  });
  await act(async () => { button(personReloadUi.container, "Radar").click(); await tick(); });
  check("Person, Rolle und Treffer überstehen Reload bei ehrlich nicht verfügbarer Quelle", () => {
    assert.match(personReloadUi.container.textContent, /Nicolas Cage/);
    assert.match(personReloadUi.container.textContent, /Schauspiel/);
    assert.match(personReloadUi.container.textContent, /Dream Scenario/);
    assert.match(personReloadUi.container.textContent, /Personensuche ist derzeit nicht verfügbar/);
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
