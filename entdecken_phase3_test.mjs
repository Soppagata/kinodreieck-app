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
fs.mkdirSync(cacheDir, { recursive: true });
const outputDir = fs.mkdtempSync(path.join(cacheDir, "entdecken-phase3-test-"));
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
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
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { EntdeckenTab, RadarSubscriptionPreview, GlobalSearchBar } = await import(output);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
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
await act(async () => { button(ui.container, "Radar").click(); await tick(); });
await act(async () => { button(ui.container, "Synthetisches Beispiel einsetzen").click(); await tick(); });
await act(async () => { button(ui.container, "Nur Vorschau prüfen").click(); await tick(); });
check("Radar-Ansicht kennzeichnet Fixture, geparkte Personen und die schreibfreie Proposal-Vorschau", () => {
  assert.match(ui.container.textContent, /Synthetische Fixture/);
  assert.match(ui.container.textContent, /Personen-Automatik/);
  assert.match(ui.container.textContent, /Writes: false · Routine: false · Auto-Retry: false/);
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
  targetType: "movie",
  eventType: "kinostart_at",
  date: "2026-08-09",
  region: "AT",
  platform: "-",
  lifecycleStatus: "active",
  verificationStatus: "confirmed",
};
const validPilotImportPayload = {
  targetKey: "tmdb:0001",
  eventType: "kinostart_at",
  date: "2026-08-09",
  region: "AT",
  platform: "-",
  evidence: [
    { sourceId: "s1", url: "https://example.org/1", retrievedAt: "2026-08-09T10:00:00.000Z" },
    { sourceId: "s2", url: "https://example.org/2", retrievedAt: "2026-08-09T10:00:01.000Z" },
  ],
};
const pilotState = createEmptyLocalRadar();

const mountPilotUi = async (props) => mount(EntdeckenTab, {
  blogProps: emptyBlogProps,
  radarState: pilotState,
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

const pilotReviewFalseUi = await mountPilotUi({
  radarPilotClientEnabled: true,
  radarPilotActive: false,
  radarPilotEvents: [pilotEvent],
  radarReview: false,
});
await act(async () => { button(pilotReviewFalseUi.container, "Radar").click(); await tick(); });
check("Flag true mit radarReview false blendet Pilot-Import aus", () => {
  assert.equal(pilotReviewFalseUi.container.querySelector("[aria-label='Pilot-Import JSON']"), null);
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
  radarPilotEvents: [pilotEvent],
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

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("ENTDECKEN-PHASE3-TEST BESTANDEN");
