/* Phase 3: reine lokale Verträge plus echte React-/JSDOM-Oberfläche.
   Kein Netz, kein Provider, keine KI, keine Migration. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import radarFixtures from "./src/data/radar_phase2_fixtures.json" with { type: "json" };
import {
  createCatalogSearchActions,
  createFixtureRadarLedger,
  rankLocalEntdeckenRecommendations,
} from "./src/lib/entdeckenUi.js";
import {
  createEmptyLocalRadar,
  projectLocalRadarWeek,
  removeGuestRadarSubscription,
  setLocalRadarReceipt,
  upsertGuestRadarSubscription,
} from "./src/lib/localEventRadar.js";
import { decodeAndValidateLocalProposal } from "./src/lib/radarProposalValidator.js";

let checks = 0;
let act = async (callback) => callback();
let tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const check = (name, fn) => {
  fn(); checks++;
  console.log(`✓ ${name}`);
};

const textareas = (root, name) => [...root.querySelectorAll("textarea")].find((entry) => entry.getAttribute("aria-label") === name);

async function setTextareaValue(root, name, value) {
  const field = textareas(root, name);
  if (!field) return;
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    if (descriptor?.set) descriptor.set.call(field, value);
    else field.value = value;
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    field.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await tick();
  });
}

const seriesActions = createCatalogSearchActions({
  watchmodeId: 4711, title: "Synthetische Serie", type: "tv_series",
});
check("Seriensuche trennt Beobachten und Ins Radar in zwei Intent-Verträge", () => {
  assert.equal(seriesActions.watch.intent, "watch");
  assert.equal(seriesActions.radar.intent, "radar");
  assert.equal(seriesActions.watch.setsRadar, false);
  assert.equal(seriesActions.radar.setsObserved, false);
  assert.notEqual(seriesActions.watch.writePath, seriesActions.radar.writePath);
});
check("Ein Werk erhält Radar, aber keinen erfundenen Serien-Beobachten-Pfad", () => {
  const actions = createCatalogSearchActions({ watchmodeId: 815, title: "Film", type: "movie" });
  assert.equal(actions.watch, null);
  assert.equal(actions.radar.intent, "radar");
});
check("Titeltext allein wird niemals zur Radaridentität", () => {
  const actions = createCatalogSearchActions({ title: "Nur ein Name", type: "movie" });
  assert.equal(actions.target, null);
  assert.equal(actions.radar, null);
});

const recommendationInput = {
  region: "AT", stand: "2026-08-09T00:00:00.000Z", titel: [{
    watchmode_id: 91, titel: "Passender Film", typ: "movie", dienste: ["Testdienst"],
    genres: ["drama"], tags: [],
  }],
};
const profileInput = { signals: [{ kind: "genre", value: "drama", direction: "positive", confirmed: true, strength: 2 }] };
const recommendationBefore = JSON.stringify({ recommendationInput, profileInput });
const recommendations = rankLocalEntdeckenRecommendations({ streamingEntdecken: recommendationInput, profile: profileInput, master: [] });
check("Lokale Empfehlung ist erklärbar und mutiert weder Katalog noch Profil", () => {
  assert.equal(recommendations.length, 1);
  assert.match(recommendations[0].reasons[0], /^Profil:/);
  assert.equal(JSON.stringify({ recommendationInput, profileInput }), recommendationBefore);
});

let radarState = upsertGuestRadarSubscription(createEmptyLocalRadar(), {
  target: radarFixtures.catalog[0], now: "2026-08-09T12:00:00.000Z",
}).state;
const ledger = createFixtureRadarLedger(radarFixtures);
const week = projectLocalRadarWeek({ state: radarState, ledger, startDate: "2026-08-09" });
check("Fixture-Radar projiziert bestätigte Ereignisse ausschließlich read-only", () => {
  assert.equal(week.length, 1);
  assert.equal(week[0].readOnly, true);
  assert.equal(week[0].createsReminder, false);
  assert.equal(week[0].createsCalendarEntry, false);
});
radarState = setLocalRadarReceipt(radarState, {
  eventId: week[0].eventId, versionId: week[0].versionId, status: "seen",
  now: "2026-08-09T12:01:00.000Z",
}).state;
const removed = removeGuestRadarSubscription(radarState, radarFixtures.catalog[0].targetId);
check("Lokales Entfernen löscht das Abo, bewahrt aber den Ereignisbeleg", () => {
  assert.equal(removed.ok, true);
  assert.equal(removed.createsProviderJob, false);
  assert.equal(removed.state.subscriptions.length, 0);
  assert.equal(removed.state.receipts.length, 1);
});

const proposal = decodeAndValidateLocalProposal(JSON.stringify(radarFixtures.radarProposal), {
  sourceRegistry: radarFixtures.sourceRegistry,
  catalog: radarFixtures.catalog,
  expectedInputHash: radarFixtures.radarProposal.inputHash,
});
check("Proposal-Prüfung bleibt Vorschau ohne Write, Routine oder Auto-Retry", () => {
  assert.equal(proposal.ok, true);
  assert.equal(proposal.status, "preview-ready");
  assert.equal(proposal.writes, false);
  assert.equal(proposal.routineActivated, false);
  assert.equal(proposal.automaticRetry, false);
});

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const appNavigation = fs.readFileSync(path.join(wurzel, "src/components/AppNavigation.jsx"), "utf8");
const appSource = fs.readFileSync(path.join(wurzel, "src/App.jsx"), "utf8");
const entdeckenSource = fs.readFileSync(path.join(wurzel, "src/tabs/EntdeckenTab.jsx"), "utf8");
check("Sichtbares Entdecken bewahrt den technischen Key blog und den Deep-Link-Pfad", () => {
  assert.match(appNavigation, /id:\s*"blog",\s*label:\s*"Entdecken"/);
  assert.match(appSource, /setBlogFokus\(id\);\s*setTab\("blog"\)/);
  assert.match(entdeckenSource, /if \(fokusId\) setAnsicht\("meinungen"\)/);
});
check("Personen-Automatik ist sichtbar geparkt und hat keine Phase-3-Aktion", () => {
  assert.match(entdeckenSource, /Personen-Automatik/);
  assert.match(entdeckenSource, /weder Personen-Schalter noch automatische Beobachtung oder Radar-Aktion/);
});

async function loadEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}
const cacheDir = path.join(wurzel, ".tmp");
let outputDir = null;
let esbuildOutput;
let dom = null;
const heuteIso = new Date().toISOString().slice(0, 10);
const plusSiebenTageIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
try {
  fs.mkdirSync(cacheDir, { recursive: true });
  outputDir = fs.mkdtempSync(path.join(cacheDir, "entdecken-phase3-test-"));
  const output = path.join(outputDir, "bundle.mjs");
  fs.mkdirSync(outputDir, { recursive: true });
  const esbuild = await loadEsbuild();
  await esbuild.build({
    stdin: {
      contents: [
        'export { EntdeckenTab } from "./src/tabs/EntdeckenTab.jsx";',
        'export { RadarSubscriptionPreview } from "./src/components/RadarSubscriptionPreview.jsx";',
        'export { GlobalSearchBar } from "./src/components/GlobalSearchBar.jsx";',
      ].join("\n"),
      loader: "js", resolveDir: wurzel,
    },
    bundle: true, format: "esm", outfile: output, jsx: "automatic", target: "es2022", logLevel: "warning",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });
  esbuildOutput = await import(output);

  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  for (const name of [
    "window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
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
  const { EntdeckenTab, RadarSubscriptionPreview, GlobalSearchBar } = esbuildOutput;

  tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const button = (root, label) => [...root.querySelectorAll("button")].find((entry) => entry.textContent.trim() === label);
  async function mount(Component, props) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(h(Component, props)); await tick(); });
    return { container, root, async cleanup() { await act(async () => { root.unmount(); await tick(); }); container.remove(); } };
  }

  const emptyBlogProps = {
    artikel: [], master: [], angemeldet: false,
    onFokusVerbraucht() {}, onErstellen: async () => null, onAktualisieren: async () => null,
    onSetzeRef() {}, onFreigeben: async () => false, onLoeschen: async () => false,
    onAddFilm: async () => null, onSpringeZuFilm() {},
  };
  const ui = await mount(EntdeckenTab, {
    blogProps: emptyBlogProps,
    radarState,
    seriesCatalog: [], entdeckenStatus: {}, master: [],
    streamingKnown: null, streamingDiscover: recommendationInput,
    accountMode: false, onObserveToggle() {}, onRadarChange() {}, onRadarPreview() {}, onShareChange() {},
  });
  check("Entdecken rendert die drei internen Ansichten und startet bei Empfehlungen", () => {
    const tabs = [...ui.container.querySelectorAll('[role="tab"]')];
    assert.deepEqual(tabs.map((entry) => entry.textContent), ["Empfehlungen", "Radar", "Meinungen"]);
    assert.equal(tabs[0].getAttribute("aria-selected"), "true");
  });
  const manageTrigger = button(ui.container, "⚙ Entdecken verwalten");
  manageTrigger.focus();
  await act(async () => { manageTrigger.click(); await tick(); });
  check("Entdecken verwalten zeigt gefüllten Radar und leeren Beobachten-Zustand", () => {
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="kd-entdecken-manage-title"]');
    assert.ok(dialog);
    assert.match(dialog.textContent, /Synthetischer Kinofilm/);
    assert.match(dialog.textContent, /Noch keine Serie beobachtet/);
    assert.equal(document.body.classList.contains("kd-scroll-gesperrt"), true);
  });
  await act(async () => {
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
  });
  check("Escape schließt die Verwaltung, löst Scroll-Lock und gibt den Fokus zurück", () => {
    assert.equal(document.querySelector('[aria-labelledby="kd-entdecken-manage-title"]'), null);
    assert.equal(document.body.classList.contains("kd-scroll-gesperrt"), false);
    assert.equal(document.activeElement, manageTrigger);
  });
  await ui.cleanup();

  const deepLinkUi = await mount(EntdeckenTab, {
    blogProps: emptyBlogProps, fokusId: "blog:fehlend", radarState: createEmptyLocalRadar(),
  });
  check("Ein bestehender Blog-Deep-Link öffnet automatisch Meinungen", () => {
    const selected = deepLinkUi.container.querySelector('[role="tab"][aria-selected="true"]');
    assert.equal(selected.textContent, "Meinungen");
  });
  await deepLinkUi.cleanup();

  let previewConfirmed = 0;
  let previewClosed = 0;
  const preview = await mount(RadarSubscriptionPreview, {
    target: radarFixtures.catalog[0], radarState: createEmptyLocalRadar(), accountMode: false,
    onConfirm: async () => { previewConfirmed++; return true; }, onClose: () => { previewClosed++; },
  });
  check("Radar-Vorschau schreibt vor der expliziten Bestätigung nichts und sperrt Gast-Share", () => {
    assert.equal(previewConfirmed, 0);
    assert.equal(document.querySelector('.kd-radar-preview input[type="checkbox"]').disabled, true);
  });
  await act(async () => { button(document, "Ins Radar bestätigen").click(); await tick(); });
  check("Radar-Vorschau ruft nach Bestätigung genau einen gekapselten Write auf", () => {
    assert.equal(previewConfirmed, 1);
    assert.equal(previewClosed, 1);
  });
await preview.cleanup();

const pilotEvent = {
  eventId: "00000000-0000-4000-8000-000000000001",
  eventVersionId: "00000000-0000-4000-8000-000000000011",
  targetId: "tmdb:0001",
  eventType: "kinostart_at",
  date: heuteIso,
  region: "AT",
  platform: "-",
  lifecycleStatus: "scheduled",
  verificationStatus: "confirmed",
};
const comparePilotEvidence = (left, right) => {
  if (left.sourceId < right.sourceId) return -1;
  if (left.sourceId > right.sourceId) return 1;
  if (left.url < right.url) return -1;
  if (left.url > right.url) return 1;
  if (left.retrievedAt < right.retrievedAt) return -1;
  if (left.retrievedAt > right.retrievedAt) return 1;
  return 0;
};
const pilotEventWithEvidence = {
  ...pilotEvent,
  evidence: [
    { sourceId: "source-official", sourceDomain: "example.com", url: "https://example.com/official", retrievedAt: `${heuteIso}T10:00:00.000Z` },
    { sourceId: "source-editorial", sourceDomain: "news.example.com", url: "https://news.example.com/editorial", retrievedAt: `${heuteIso}T10:00:01.000Z` },
  ].sort(comparePilotEvidence),
};
const pilotEventOutsideWeek = {
  eventId: "00000000-0000-4000-8000-000000000013",
  eventVersionId: "00000000-0000-4000-8000-000000000023",
  targetId: "tmdb:0009",
  eventType: "kinostart_at",
  date: plusSiebenTageIso,
  region: "AT",
  platform: "-",
  lifecycleStatus: "scheduled",
  verificationStatus: "confirmed",
};
const validPilotImportPayload = {
  targetKey: "tmdb:0001",
  eventType: "kinostart_at",
  date: heuteIso,
  region: "AT",
  platform: "-",
  evidence: [
    { sourceId: "s1", url: "https://example.org/1", retrievedAt: `${heuteIso}T10:00:00.000Z` },
    { sourceId: "s2", url: "https://example.org/2", retrievedAt: `${heuteIso}T10:00:01.000Z` },
  ],
};

const mountPilotUi = async (props) => mount(EntdeckenTab, {
  blogProps: emptyBlogProps,
  radarState: createEmptyLocalRadar({ authority: "account-cache" }),
  seriesCatalog: [], entdeckenStatus: {}, master: [],
  streamingKnown: null, streamingDiscover: recommendationInput,
  accountMode: true,
  onObserveToggle() {}, onRadarChange() {}, onRadarPreview() {}, onShareChange() {},
  ...props,
});

const pilotNoImportUi = await mountPilotUi({
  radarPilotClientEnabled: false,
  radarPilotActive: false,
  radarPilotEvents: [pilotEvent],
  radarReview: true,
});
await act(async () => { button(pilotNoImportUi.container, "Radar").click(); await tick(); });
check("Flag false zeigt trotz Review keine Pilot-Importfläche und behält Fixture-Inhalt", () => {
  const fixtureTitle = pilotNoImportUi.container.querySelector(".kd-entdecken-kicker")?.textContent;
  const hasImport = pilotNoImportUi.container.querySelector("[aria-label='Pilot-Import JSON']");
  assert.equal(!!fixtureTitle && fixtureTitle.includes("Synthetische Fixture"), true);
  assert.equal(hasImport, null);
});
await pilotNoImportUi.cleanup();

const RestoreDate = Date;
Date = class extends RestoreDate {
  constructor(value) {
    return value == null
      ? new RestoreDate("2026-08-09T00:00:00.000Z")
      : new RestoreDate(value);
  }
  static now() {
    return new RestoreDate("2026-08-09T00:00:00.000Z").getTime();
  }
};
const pilotGuestConflictUi = await mountPilotUi({
  accountMode: false,
  radarPilotClientEnabled: true,
  radarPilotActive: true,
  radarPilotEvents: [pilotEvent, pilotEventOutsideWeek],
  radarReview: true,
  radarState: upsertGuestRadarSubscription(createEmptyLocalRadar({ authority: "guest" }), {
    target: radarFixtures.catalog[0], now: `${heuteIso}T12:00:00.000Z`,
  }).state,
});
await act(async () => { button(pilotGuestConflictUi.container, "Radar").click(); await tick(); });
check("Gast mit widersprüchlichen Pilot-Flags zeigt exakt Fixture-Preview, kein Pilot-Sync und kein Pilot-DOM", () => {
  const weekPanel = [...pilotGuestConflictUi.container.querySelectorAll("article.kd-entdecken-panel")]
    .find((entry) => entry.querySelector("h3")?.textContent === "Diese Woche");
  const listItem = weekPanel?.querySelector("li");
  assert.equal(pilotGuestConflictUi.container.querySelector("[aria-label='Pilot-Import JSON']"), null);
  assert.equal(button(pilotGuestConflictUi.container, "Pilot-Sync starten"), undefined);
  assert.ok(listItem && listItem.textContent.includes("nur Vorschau"));
  assert.equal(listItem?.querySelector("button"), null);
  assert.equal(listItem?.querySelectorAll(".kd-pilot-quellen-link")?.length || 0, 0);
});
await pilotGuestConflictUi.cleanup();
Date = RestoreDate;

const pilotReviewFalseUi = await mountPilotUi({
  radarPilotClientEnabled: true,
  radarPilotActive: false,
  radarPilotEvents: [pilotEventWithEvidence],
  radarReview: false,
});
await act(async () => { button(pilotReviewFalseUi.container, "Radar").click(); await tick(); });
check("Flag true mit radarReview false blendet Pilot-Import aus", () => {
  assert.equal(pilotReviewFalseUi.container.querySelector("[aria-label='Pilot-Import JSON']"), null);
  const weekPanel = [...pilotReviewFalseUi.container.querySelectorAll("article.kd-entdecken-panel")]
    .find((entry) => entry.querySelector("h3")?.textContent === "Diese Woche");
  const listItem = weekPanel?.querySelector("li");
  assert.equal(listItem?.querySelectorAll(".kd-pilot-quellen-link")?.length || 0, 0);
});
await pilotReviewFalseUi.cleanup();

let pilotImportCalls = 0;
const pilotImportUi = await mountPilotUi({
  radarPilotClientEnabled: true,
  radarPilotActive: true,
  radarPilotEvents: [pilotEvent],
  radarReview: true,
  onRadarPilotImport: async () => { pilotImportCalls += 1; return true; },
});
await act(async () => { button(pilotImportUi.container, "Radar").click(); await tick(); });
check("Flag true + radarReview true blendet Pilot-Import ein", () => {
  assert.ok(pilotImportUi.container.querySelector("[aria-label='Pilot-Import JSON']"));
  assert.ok(button(pilotImportUi.container, "Pilot-Import bestätigen"));
});

await setTextareaValue(pilotImportUi.container, "Pilot-Import JSON", "{ ");
await act(async () => { button(pilotImportUi.container, "Pilot-Import bestätigen").click(); await tick(); });
await setTextareaValue(pilotImportUi.container, "Pilot-Import JSON", JSON.stringify([1,2,3]));
await act(async () => { button(pilotImportUi.container, "Pilot-Import bestätigen").click(); await tick(); });
await setTextareaValue(pilotImportUi.container, "Pilot-Import JSON", JSON.stringify({ ...validPilotImportPayload, extra: true }));
await act(async () => { button(pilotImportUi.container, "Pilot-Import bestätigen").click(); await tick(); });
check("Malformed/Array/Extra-Key-Import führt zu null Callbacks", () => {
  assert.equal(pilotImportCalls, 0);
});

await setTextareaValue(pilotImportUi.container, "Pilot-Import JSON", JSON.stringify(validPilotImportPayload));
await act(async () => { button(pilotImportUi.container, "Pilot-Import bestätigen").click(); await tick(); });
check("Gültiger exakter Payload führt genau zu einem Importcallback", () => {
  assert.equal(pilotImportCalls, 1);
});
await pilotImportUi.cleanup();

const pilotEvidenceUi = await mountPilotUi({
  radarPilotClientEnabled: true,
  radarPilotActive: true,
  radarPilotEvents: [pilotEventWithEvidence],
  radarReview: true,
});
await act(async () => { button(pilotEvidenceUi.container, "Radar").click(); await tick(); });
check("Aktive Pilot-Ereignisse zeigen Quellen als zwei sichere Links", () => {
  const weekPanel = [...pilotEvidenceUi.container.querySelectorAll("article.kd-entdecken-panel")]
    .find((entry) => entry.querySelector("h3")?.textContent === "Diese Woche");
  const links = [...(weekPanel?.querySelectorAll(".kd-pilot-quellen-link") || [])];
  assert.equal(links.length, 2);
  assert.ok(weekPanel?.textContent.includes("Quellen:"));
  const expectedLinks = pilotEventWithEvidence.evidence.map((entry) => ({
    label: entry.sourceDomain,
    href: entry.url,
    target: "_blank",
    rel: "noopener noreferrer",
  }));
  assert.deepEqual(links.map((link) => ({
    label: link.textContent,
    href: link.getAttribute("href"),
    target: link.getAttribute("target"),
    rel: link.getAttribute("rel"),
  })), expectedLinks);
});
await pilotEvidenceUi.cleanup();

const pilotEmptyActiveUi = await mountPilotUi({
  radarPilotClientEnabled: true,
  radarPilotActive: true,
  radarPilotEvents: [],
  radarReview: true,
});
await act(async () => { button(pilotEmptyActiveUi.container, "Radar").click(); await tick(); });
check("Aktiver Pilot mit leerem Feed hat keine Vorbefüllungs-Woche", () => {
  const currentWeek = [...pilotEmptyActiveUi.container.querySelectorAll("article.kd-entdecken-panel")]
    .find((entry) => entry.querySelector("h3")?.textContent === "Diese Woche");
  assert.equal(currentWeek?.querySelector("li"), null);
  assert.ok(currentWeek?.textContent.includes("Keine lokal bestätigten Ereignisse für deine aktiven Ziele."));
});
await pilotEmptyActiveUi.cleanup();

let receiptCalls = 0;
const receiptUi = await mountPilotUi({
  radarPilotClientEnabled: true,
  radarPilotActive: true,
  radarPilotEvents: [pilotEvent, pilotEventOutsideWeek],
  radarReview: true,
  onRadarPilotReceipt: async () => {
    receiptCalls += 1;
    return true;
  },
});
await act(async () => { button(receiptUi.container, "Radar").click(); await tick(); });
await act(async () => {
  const btn = button(receiptUi.container, "Gesehen");
  btn.click();
  btn.click();
  await tick();
});
check("Pilot-Ereignisse außerhalb der 7-Tage-Woche sind nicht in der Ansicht", () => {
  const weekPanel = [...receiptUi.container.querySelectorAll("article.kd-entdecken-panel")]
    .find((entry) => entry.querySelector("h3")?.textContent === "Diese Woche");
  assert.equal(weekPanel?.textContent.includes(pilotEventOutsideWeek.targetId), false);
});
check("Pilot-Ereignis-Receipt klickt genau einmal, ohne optimistischen Status", () => {
  assert.equal(receiptCalls, 1);
  assert.equal(receiptUi.container.textContent.includes("Status: seen"), false);
});
await receiptUi.cleanup();

const searchCalls = [];
const searchUi = await mount(GlobalSearchBar, {
  bereich: "blog", onSuchen: async () => {}, onTreffer: () => searchCalls.push("open"),
  onSuchaktion: (_item, intent) => searchCalls.push(intent), onAlleErgebnisse() {}, onMenu() {},
  antwort: {
    frage: "Serie", gesamt: 1, items: [{
      key: "series:4711", titel: "Synthetische Serie", bereichLabel: "Streaming", meta: "Serie",
      searchActions: seriesActions,
    }],
  },
});
await act(async () => { button(searchUi.container, "Beobachten").click(); await tick(); });
await act(async () => { button(searchUi.container, "Ins Radar").click(); await tick(); });
  await act(async () => { searchUi.container.querySelector("[data-globaler-suchtreffer]").click(); await tick(); });
  check("Globale Suche hält Beobachten, Ins Radar und Öffnen als getrennte Bedienelemente", () => {
    assert.deepEqual(searchCalls, ["watch", "radar", "open"]);
    assert.equal(searchUi.container.querySelectorAll(".kd-globalsuche-aktionen button").length, 2);
  });
  await searchUi.cleanup();
} finally {
  if (outputDir) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  if (dom) {
    dom.window.close();
  }
}

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("ENTDECKEN-PHASE3-TEST BESTANDEN");
