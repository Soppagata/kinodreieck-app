/* Zielgebundener Radar-Websearch: reiner Mock-/JSDOM-Pfad.
   Kein Netz, keine Datenbank, kein Anbieter, kein Scheduler und keine Retries. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  createRadarWebsearchExecutor,
  createRadarWebsearchMemoryStore,
  createRadarWebsearchMockAdapter,
  createRadarWebsearchStorageStore,
  createRadarWebsearchTargetKey,
  projectVisibleRadarWebsearchEvents,
  radarWebsearchFranchiseRelation,
  radarWebsearchPersonRelation,
  radarWebsearchResponseFor,
  radarWebsearchWorkRelation,
} from "./src/lib/radarWebsearchFlow.js";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const checkedAt = "2026-08-22T10:00:00.000Z";
const workTarget = Object.freeze({
  kind: "work", targetId: "watchmode:91", targetType: "work",
  title: "Passender Film", year: 2026, canonical: true,
});
const personTarget = Object.freeze({
  kind: "person", personExternalId: "wikidata:Q123456", name: "Test Person",
  role: "director", canonical: true,
});
const franchiseTarget = Object.freeze({
  kind: "franchise", franchiseId: "wikidata:Q462", title: "Star Wars",
  aliases: Object.freeze(["Star Wars", "Krieg der Sterne"]), canonical: true,
});
const catalog = Object.freeze([
  { targetId: "watchmode:91", targetType: "work", title: "Passender Film", year: 2026 },
  { targetId: "watchmode:92", targetType: "work", title: "Gleicher Name", year: 2026 },
]);
const officialSource = Object.freeze({
  sourceId: "studio-official", domain: "radar.example", publisherFamily: "studio-family",
  sourceClass: "official", rightsStatus: "approved", attributionApproved: true,
  subdomainsAllowed: false, active: true,
});
const evidence = Object.freeze([{
  sourceId: officialSource.sourceId,
  url: "https://radar.example/releases/termin",
  sourceTitle: "Offizielle Terminankündigung",
  publishedAt: "2026-08-21",
  claim: "Der konkrete Starttermin und die Zielzuordnung wurden offiziell angekündigt.",
}]);
const franchiseEvidence = Object.freeze([{
  sourceId: officialSource.sourceId,
  url: "https://radar.example/franchises/star-wars",
  sourceTitle: "Offizielle Star-Wars-Werkübersicht",
  publishedAt: "2026-08-20",
  claim: "The Ninth Jedi wird auf der offiziellen Werkseite eindeutig der Reihe Star Wars zugeordnet.",
}]);

function workEvent(request, patch = {}) {
  return {
    work: { targetId: workTarget.targetId, targetType: "work", title: workTarget.title, year: 2026 },
    relation: radarWebsearchWorkRelation(workTarget.targetId),
    eventType: "streamingstart_at", date: request.windowEnd, region: "GLOBAL",
    platform: "Teststream", seasonNumber: null, evidence, franchiseEvidence: null,
    ...patch,
  };
}
function personEvent(request, patch = {}) {
  return {
    work: { targetId: "imdb:tt99999998", targetType: "work", title: "Neues Regieprojekt", year: 2026 },
    relation: radarWebsearchPersonRelation(personTarget.personExternalId, personTarget.role),
    eventType: "kinostart_at", date: request.windowEnd, region: "AT",
    platform: "-", seasonNumber: null, evidence, franchiseEvidence: null,
    ...patch,
  };
}
function franchiseEvent(request, patch = {}) {
  return {
    work: { targetId: "imdb:tt99999999", targetType: "work", title: "The Ninth Jedi", year: 2026 },
    relation: radarWebsearchFranchiseRelation(franchiseTarget.franchiseId),
    eventType: "streamingstart_at", date: request.windowEnd, region: "GLOBAL",
    platform: "Teststream", seasonNumber: null, evidence, franchiseEvidence,
    ...patch,
  };
}

const responses = new Map([
  [createRadarWebsearchTargetKey(workTarget), (request) => radarWebsearchResponseFor(request, [workEvent(request)])],
  [createRadarWebsearchTargetKey(personTarget), (request) => radarWebsearchResponseFor(request, [personEvent(request)])],
  [createRadarWebsearchTargetKey(franchiseTarget), (request) => radarWebsearchResponseFor(request, [franchiseEvent(request)])],
]);
const adapter = createRadarWebsearchMockAdapter({ people: [personTarget], franchises: [franchiseTarget], responses });
const store = createRadarWebsearchMemoryStore();
const executor = createRadarWebsearchExecutor({
  adapter, store, sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
});

await check("Aktives Werk liefert genau einen regions- und zeitgeprüften neuen Fund", async () => {
  const result = await executor.check({ target: workTarget, catalog });
  assert.equal(result.status, "confirmed");
  assert.equal(result.writes, 1);
  assert.equal(result.adapterCalls, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].sourceTargetKey, `work:${workTarget.targetId}`);
  assert.equal(result.events[0].region, "GLOBAL");
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(adapter.calls[0].regionPolicy, {
    cinema: ["AT", "DE", "CH"], streaming: ["GLOBAL", "AT", "DE", "CH"],
  });
  assert.equal(adapter.calls[0].maxResults, 6);
  assert.equal(adapter.calls[0].maxEvents, 4);
  assert.equal("accountId" in adapter.calls[0], false);
});

await check("Derselbe belegte Fund bleibt nach erneutem manuellen Prüfen idempotent", async () => {
  const result = await executor.check({ target: workTarget, catalog });
  assert.equal(result.status, "no_change");
  assert.equal(result.writes, 0);
  assert.equal(result.events.length, 1);
  assert.equal(adapter.calls.length, 2);
});

await check("Nur neue oder manuell angepinnte Eventversionen werden projiziert", async () => {
  const [event] = await executor.loadEvents();
  const base = {
    events: [event], activeWorkTargetIds: [workTarget.targetId], activePersonKeys: [],
  };
  assert.equal(projectVisibleRadarWebsearchEvents({ ...base, receipts: [] })[0].receiptStatus, "new");
  assert.equal(projectVisibleRadarWebsearchEvents({
    ...base, receipts: [{ eventId: event.eventId, versionId: event.eventVersionId, status: "accepted_week" }],
  })[0].receiptStatus, "accepted_week");
  assert.deepEqual(projectVisibleRadarWebsearchEvents({
    ...base, receipts: [{ eventId: event.eventId, versionId: event.eventVersionId, status: "seen" }],
  }), []);
});

await check("Ein Werkziel darf keinen vorher unbekannten anderen Titel einschleusen", async () => {
  const wrongAdapter = createRadarWebsearchMockAdapter({ responses: new Map([[
    createRadarWebsearchTargetKey(workTarget),
    (request) => radarWebsearchResponseFor(request, [workEvent(request, {
      work: { targetId: "imdb:tt99999999", targetType: "work", title: "The Ninth Jedi", year: 2026 },
    })]),
  ]]) });
  const result = await createRadarWebsearchExecutor({
    adapter: wrongAdapter, sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  }).check({ target: workTarget, catalog });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.writes, 0);
  assert.equal(result.events.length, 0);
});

await check("Ein Personenziel darf einen neuen Titel nur mit starker Werk-ID und exakter Personenbindung liefern", async () => {
  const personOnlyStore = createRadarWebsearchMemoryStore();
  const personOnly = createRadarWebsearchExecutor({
    adapter: createRadarWebsearchMockAdapter({ people: [personTarget], responses }),
    store: personOnlyStore, sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  });
  const result = await personOnly.check({ target: personTarget, catalog });
  assert.equal(result.status, "confirmed");
  assert.equal(result.events[0].title, "Neues Regieprojekt");
  assert.equal(result.events[0].targetId, "imdb:tt99999998");

  const weakAdapter = createRadarWebsearchMockAdapter({ responses: new Map([[
    createRadarWebsearchTargetKey(personTarget),
    (request) => radarWebsearchResponseFor(request, [personEvent(request, {
      work: { targetId: null, targetType: "series", title: "Gleicher Name", year: 2026 },
    })]),
  ]]) });
  const blocked = await createRadarWebsearchExecutor({
    adapter: weakAdapter, sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  }).check({ target: personTarget, catalog });
  assert.equal(blocked.status, "insufficient_evidence");
  assert.equal(blocked.writes, 0);
});

await check("Reihenresolver akzeptiert nur einen exakten kanonischen Alias und kein ähnlich benanntes Stichwort", async () => {
  assert.equal((await executor.resolveFranchise({ name: "Krieg der Sterne" }))?.franchiseId, franchiseTarget.franchiseId);
  assert.equal(await executor.resolveFranchise({ name: "Star Wards" }), null);
});

await check("Star Wars im Radar liefert The Ninth Jedi nur mit starker Werk-ID und eigenem Reihenbeleg", async () => {
  const franchiseOnly = createRadarWebsearchExecutor({
    adapter: createRadarWebsearchMockAdapter({ franchises: [franchiseTarget], responses }),
    sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  });
  const result = await franchiseOnly.check({ target: franchiseTarget, catalog });
  assert.equal(result.status, "confirmed");
  assert.equal(result.writes, 1);
  assert.equal(result.events[0].title, "The Ninth Jedi");
  assert.equal(result.events[0].targetId, "imdb:tt99999999");
  assert.equal(result.events[0].sourceTargetKey, `franchise:${franchiseTarget.franchiseId}`);
  assert.equal(result.events[0].franchiseEvidence.length, 1);
});

await check("Ein nur ähnlich benannter Titel ohne exakte Reihenbindung wird fail-closed verworfen", async () => {
  const similarAdapter = createRadarWebsearchMockAdapter({ responses: new Map([[
    createRadarWebsearchTargetKey(franchiseTarget),
    (request) => radarWebsearchResponseFor(request, [franchiseEvent(request, {
      work: { targetId: "imdb:tt88888888", targetType: "work", title: "Star Wards: The Ninth Pilot", year: 2026 },
      relation: radarWebsearchFranchiseRelation("wikidata:Q999999"),
      franchiseEvidence: null,
    })]),
  ]]) });
  const result = await createRadarWebsearchExecutor({
    adapter: similarAdapter, sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  }).check({ target: franchiseTarget, catalog });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.writes, 0);
  assert.equal(result.events.length, 0);
  assert.ok(result.errors.includes("event-target-relation-mismatch"));
});

await check("Claim sperrt einen parallelen zweiten Lauf ohne zweiten Adapteraufruf", async () => {
  let release;
  let calls = 0;
  const slowAdapter = {
    async search(request) {
      calls += 1;
      return new Promise((resolve) => {
        release = () => resolve(radarWebsearchResponseFor(request, [workEvent(request)]));
      });
    },
  };
  const slow = createRadarWebsearchExecutor({
    adapter: slowAdapter, sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  });
  const first = slow.check({ target: workTarget, catalog });
  await new Promise((resolve) => setImmediate(resolve));
  const second = await slow.check({ target: workTarget, catalog });
  assert.equal(second.status, "busy");
  assert.equal(calls, 1);
  release();
  assert.equal((await first).status, "confirmed");
  assert.equal(calls, 1);
});

async function loadEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(rootDir, ".tmp");
let outputDir = null;
let dom = null;
try {
  fs.mkdirSync(cacheDir, { recursive: true });
  outputDir = fs.mkdtempSync(path.join(cacheDir, "radar-websearch-flow-"));
  const output = path.join(outputDir, "bundle.mjs");
  const esbuild = await loadEsbuild();
  await esbuild.build({
    stdin: {
      contents: [
        'export { EntdeckenTab } from "./src/tabs/EntdeckenTab.jsx";',
        'export { useEntdeckenRadarController } from "./src/controllers/useEntdeckenRadarController.js";',
      ].join("\n"),
      loader: "js", resolveDir: rootDir,
    },
    bundle: true, format: "esm", outfile: output, jsx: "automatic", target: "es2022", logLevel: "warning",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });

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
  const { act, createElement: h, useCallback, useRef, useState } = React;
  const { createRoot } = await import("react-dom/client");
  const { EntdeckenTab, useEntdeckenRadarController } = await import(output);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const settle = async () => { await act(async () => { await tick(); await tick(); }); };
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

  const streamingDiscover = {
    region: "AT", stand: checkedAt, titel: [{
      watchmode_id: 91, titel: "Passender Film", jahr: 2026, typ: "movie", dienste: ["Teststream"],
    }],
  };
  const emptyBlogProps = {
    artikel: [], master: [], angemeldet: false,
    onFokusVerbraucht() {}, onErstellen: async () => null, onAktualisieren: async () => null,
    onSetzeRef() {}, onFreigeben: async () => false, onLoeschen: async () => false,
    onAddFilm: async () => null, onSpringeZuFilm() {},
  };
  const controllerRef = { current: null };

  function Harness({ flowExecutor }) {
    const [entdeckenStatus, setEntdeckenStatus] = useState({});
    const statusRef = useRef(entdeckenStatus);
    statusRef.current = entdeckenStatus;
    const schreibeEntdeckenStatus = useCallback(async (update) => {
      let next;
      setEntdeckenStatus((previous) => {
        next = typeof update === "function" ? update(previous) : update;
        statusRef.current = next;
        return next;
      });
      return next;
    }, []);
    const setErr = useCallback(() => {}, []);
    const controller = useEntdeckenRadarController({
      session: { mode: "guest", state: "ready", account: null },
      remoteKontoAktiv: false,
      bootDone: true,
      master: [],
      streamingKnown: null,
      streamingDiscover,
      entdeckenStatus,
      entdeckenStatusRef: statusRef,
      schreibeEntdeckenStatus,
      serienKatalog: streamingDiscover.titel,
      setErr,
      radarWebsearchExecutor: flowExecutor,
    });
    controllerRef.current = controller;
    return h(EntdeckenTab, {
      blogProps: emptyBlogProps,
      radarState: controller.sichtbarerRadarState,
      seriesCatalog: streamingDiscover.titel,
      entdeckenStatus,
      master: [],
      streamingKnown: null,
      streamingDiscover,
      selectedServices: ["Teststream"],
      accountMode: false,
      radarPilotEvents: controller.radarPilotEvents,
      radarCheckAvailable: controller.radarCheckAvailable,
      onObserveToggle: controller.aendereSerienBeobachtung,
      onRadarChange: controller.aendereRadar,
      onRadarPreview: (target) => { void controller.bestaetigeRadarVorschau(target); },
      onShareChange: controller.aendereRadarShare,
      onRadarPilotReceipt: controller.fuehreRadarPilotReceipt,
      onRadarWebsearchCheck: controller.fuehreRadarWebsearchCheck,
      personRadarAvailable: controller.personRadarAvailable,
      onPersonRadarAdd: controller.fuegePersonRadarHinzu,
      onPersonRadarChange: controller.aenderePersonRadar,
      onPersonRadarCheck: controller.fuehrePersonRadarCheck,
      franchiseRadarAvailable: controller.franchiseRadarAvailable,
      onFranchiseRadarAdd: controller.fuegeFranchiseRadarHinzu,
    });
  }

  async function mount(flowExecutor) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(h(Harness, { flowExecutor })); await tick(); });
    await settle();
    return {
      container,
      async cleanup() { await act(async () => { root.unmount(); await tick(); }); container.remove(); },
    };
  }

  async function chooseWork(container) {
    const control = container.querySelector("#kd-radar-work");
    assert.ok(control);
    if (control instanceof dom.window.HTMLSelectElement) {
      assert.ok(control.options.length > 1);
      await setControl(control, control.options[1].value);
    } else {
      await setControl(control, "Passender Film");
      const resultButton = container.querySelector(".kd-radar-work-results button");
      assert.ok(resultButton);
      await act(async () => { resultButton.click(); await tick(); });
    }
  }

  localStorage.removeItem("kd:radar");
  localStorage.removeItem("kd:radar-websearch-cache");
  const uiStorage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value === null ? null : { key, value };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value };
    },
  };
  const uiStore = createRadarWebsearchStorageStore({ storage: uiStorage });
  const uiAdapter = createRadarWebsearchMockAdapter({
    people: [personTarget], franchises: [franchiseTarget], responses,
  });
  const uiExecutor = createRadarWebsearchExecutor({
    adapter: uiAdapter, store: uiStore, sources: [officialSource],
    now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  });
  const workUi = await mount(uiExecutor);
  await act(async () => { button(workUi.container, "Radar").click(); await tick(); });
  await chooseWork(workUi.container);
  await act(async () => { button(workUi.container, "Werk ins Radar").click(); await tick(); });
  await settle();
  await check("Mock-Nutzerweg startet Websearch erst vom bestätigten aktiven Werkziel", async () => {
    assert.match(workUi.container.textContent, /Passender Film/);
    assert.ok(button(workUi.container, "Jetzt prüfen"));
    assert.equal(uiAdapter.calls.length, 0);
    await act(async () => { button(workUi.container, "Jetzt prüfen").click(); await tick(); });
    await settle();
    assert.equal(uiAdapter.calls.length, 1);
    assert.match(workUi.container.textContent, /Neue Funde/);
    assert.match(workUi.container.textContent, /GLOBAL/);
    assert.equal(workUi.container.querySelectorAll(".kd-pilot-quellen-link").length, 1);
  });
  await check("Konkreter Fund wird nur per Nutzeraktion angepinnt", async () => {
    assert.ok(button(workUi.container, "Fund anpinnen"));
    await act(async () => { button(workUi.container, "Fund anpinnen").click(); await tick(); });
    await settle();
    assert.ok(button(workUi.container, "Angepinnt")?.disabled);
    assert.equal(controllerRef.current.sichtbarerRadarState.receipts[0].status, "accepted_week");
  });
  await workUi.cleanup();

  const reloadAdapter = createRadarWebsearchMockAdapter({
    people: [personTarget], franchises: [franchiseTarget], responses,
  });
  const reloadExecutor = createRadarWebsearchExecutor({
    adapter: reloadAdapter,
    store: createRadarWebsearchStorageStore({ storage: uiStorage }),
    sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  });
  const reloadUi = await mount(reloadExecutor);
  await act(async () => { button(reloadUi.container, "Radar").click(); await tick(); });
  await settle();
  await check("Fund und Pin bleiben nach Reload sichtbar und derselbe Lauf erzeugt kein Duplikat", async () => {
    assert.ok(button(reloadUi.container, "Angepinnt")?.disabled);
    assert.equal(reloadUi.container.querySelectorAll(".kd-pilot-quellen-link").length, 1);
    await act(async () => { button(reloadUi.container, "Jetzt prüfen").click(); await tick(); });
    await settle();
    assert.equal((await reloadExecutor.loadEvents()).length, 1);
    assert.equal(uiAdapter.calls.length, 1);
    assert.equal(reloadAdapter.calls.length, 1);
  });
  await reloadUi.cleanup();

  localStorage.removeItem("kd:radar");
  const personUi = await mount(reloadExecutor);
  await act(async () => { button(personUi.container, "Radar").click(); await tick(); });
  await setControl(personUi.container.querySelector("#kd-radar-person"), personTarget.name);
  await setControl(personUi.container.querySelector("#kd-radar-role"), personTarget.role);
  await act(async () => { button(personUi.container, "Person ins Radar").click(); await tick(); });
  await settle();
  await check("Personenziel findet unbekannten Titel mit starker ID ohne automatisches Werk-Abo", async () => {
    assert.ok(button(personUi.container, "Jetzt prüfen"));
    await act(async () => { button(personUi.container, "Jetzt prüfen").click(); await tick(); });
    await settle();
    assert.match(personUi.container.textContent, /Neues Regieprojekt/);
    assert.equal(controllerRef.current.sichtbarerRadarState.subscriptions.length, 0);
    assert.equal(controllerRef.current.sichtbarerRadarState.personSubscriptions.length, 1);
    assert.ok(button(personUi.container, "Fund anpinnen"));
  });
  await personUi.cleanup();

  localStorage.removeItem("kd:radar");
  localStorage.removeItem("kd:radar-websearch-cache");
  const franchiseAdapter = createRadarWebsearchMockAdapter({ franchises: [franchiseTarget], responses });
  const franchiseExecutor = createRadarWebsearchExecutor({
    adapter: franchiseAdapter,
    store: createRadarWebsearchStorageStore({ storage: uiStorage }),
    sources: [officialSource], now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  });
  const franchiseUi = await mount(franchiseExecutor);
  await act(async () => { button(franchiseUi.container, "Radar").click(); await tick(); });
  await setControl(franchiseUi.container.querySelector("#kd-radar-franchise"), franchiseTarget.title);
  await act(async () => { button(franchiseUi.container, "Reihe ins Radar").click(); await tick(); });
  await settle();
  await check("Star Wars im Radar zeigt The Ninth Jedi und pinnt den Fund nur auf Nutzeraktion", async () => {
    assert.match(franchiseUi.container.textContent, /Star Wars/);
    assert.match(franchiseUi.container.textContent, /Aktiv · Reihe/);
    assert.equal(controllerRef.current.sichtbarerRadarState.subscriptions[0].targetId, franchiseTarget.franchiseId);
    assert.equal(controllerRef.current.sichtbarerRadarState.subscriptions[0].targetType, "franchise");
    assert.equal(franchiseAdapter.calls.length, 0);
    await act(async () => { button(franchiseUi.container, "Jetzt prüfen").click(); await tick(); });
    await settle();
    assert.equal(franchiseAdapter.calls.length, 1);
    assert.match(franchiseUi.container.textContent, /The Ninth Jedi/);
    assert.equal(franchiseUi.container.querySelectorAll(".kd-pilot-quellen-link").length, 2);
    assert.ok(button(franchiseUi.container, "Fund anpinnen"));
    await act(async () => { button(franchiseUi.container, "Fund anpinnen").click(); await tick(); });
    await settle();
    assert.ok(button(franchiseUi.container, "Angepinnt")?.disabled);
    assert.equal(controllerRef.current.sichtbarerRadarState.receipts[0].status, "accepted_week");
  });
  await franchiseUi.cleanup();
} finally {
  if (dom) dom.window.close();
  if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  try { fs.rmdirSync(cacheDir); } catch { /* Ein fremder paralleler Test darf seinen Cache behalten. */ }
}

console.log(`\n${checks} Radar-Websearch-Flow-Checks bestanden.`);
console.log("Betrieb: lokaler Mockadapter · kein Netz · keine DB · kein Anbieter · kein Retry");
