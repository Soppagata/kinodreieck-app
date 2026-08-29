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
  createRadarWebsearchTargetKey,
  projectVisibleRadarWebsearchEvents,
  radarWebsearchFranchiseRelation,
  radarWebsearchPersonRelation,
  radarWebsearchResponseFor,
  radarWebsearchWorkRelation,
} from "./src/lib/radarWebsearchFlow.js";
import {
  createEmptyLocalRadar,
  reconcileAccountRadarPilotFeed,
} from "./src/lib/localEventRadar.js";

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
  kind: "person", personExternalId: "wikidata:Q42869", name: "Nicolas Cage",
  role: "actor", canonical: true,
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
const cacheDir = process.env.KD_RADAR_TEST_TMPDIR
  ? path.resolve(process.env.KD_RADAR_TEST_TMPDIR)
  : path.join(rootDir, ".tmp");
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

  function Harness({ flowExecutor, accountHarness = null }) {
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
    const session = accountHarness?.session
      || { mode: "guest", state: "ready", account: null };
    const controller = useEntdeckenRadarController({
      session,
      remoteKontoAktiv: accountHarness !== null,
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
      radarPilotAdapter: accountHarness?.pilotAdapter,
      radarPilotEnabled: accountHarness !== null,
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
      accountMode: accountHarness !== null,
      radarPilotEvents: controller.radarPilotEvents,
      radarAutomaticAvailable: controller.radarAutomaticAvailable,
      onObserveToggle: controller.aendereSerienBeobachtung,
      onRadarChange: controller.aendereRadar,
      onRadarPreview: (target) => { void controller.bestaetigeRadarVorschau(target); },
      onShareChange: controller.aendereRadarShare,
      onRadarPilotReceipt: controller.fuehreRadarPilotReceipt,
      onRadarTextAdd: controller.fuegeRadarTextHinzu,
      personRadarAvailable: controller.personRadarAvailable,
      onPersonRadarAdd: controller.fuegePersonRadarHinzu,
      onPersonRadarChange: controller.aenderePersonRadar,
      franchiseRadarAvailable: controller.franchiseRadarAvailable,
      onFranchiseRadarAdd: controller.fuegeFranchiseRadarHinzu,
    });
  }

  async function mount(flowExecutor, accountHarness = null) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(h(Harness, { flowExecutor, accountHarness })); await tick(); });
    await settle();
    return {
      container,
      async cleanup() { await act(async () => { root.unmount(); await tick(); }); container.remove(); },
    };
  }

  localStorage.removeItem("kd:radar");
  localStorage.removeItem("kd:radar-websearch-cache");
  const testSafeId = (prefix, value) => {
    let hash = 0xcbf29ce484222325n;
    for (const character of String(value).trim()) {
      hash ^= BigInt(character.codePointAt(0));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return `${prefix}:${hash.toString(16).padStart(16, "0")}`;
  };
  const visibleTextEvent = (sourceTargetId) => {
    const sourceTargetKey = `work:${sourceTargetId}`;
    const targetId = "imdb:tt14409336";
    const eventType = "streamingstart_at";
    const region = "AT";
    const platform = "Beispiel+";
    const date = "2026-08-29";
    const url = "https://radar.example/mutter-teresa/start";
    const targetBoundIdentity = `${sourceTargetKey}|${targetId}|${eventType}|${region}|${platform}|-`;
    const proofIdentity = `release:studio-official|${url}`;
    return Object.freeze({
      eventId: testSafeId("radar:event", targetBoundIdentity),
      eventVersionId: testSafeId("radar:version", `${targetBoundIdentity}|${date}|${proofIdentity}`),
      sourceTargetKey,
      sourceTargetKind: "work",
      targetId,
      targetType: "work",
      title: "Mother Teresa: No Greater Love",
      year: 2022,
      eventType,
      date,
      region,
      platform,
      seasonNumber: null,
      lifecycleStatus: "scheduled",
      verificationStatus: "confirmed",
      evidence: Object.freeze([Object.freeze({
        sourceId: "studio-official",
        sourceDomain: "radar.example",
        url,
        retrievedAt: checkedAt,
      })]),
      franchiseEvidence: null,
    });
  };
  const textChecks = [];
  const textExecutor = Object.freeze({
    valid: true,
    async loadEvents() { return []; },
    async check(payload) {
      textChecks.push(payload);
      return Object.freeze({
        status: "confirmed",
        writes: 1,
        responseMode: "partial",
        displayText: "Teile der Antwort waren unvollständig. Nur belegte Funde wurden berücksichtigt.",
        warnings: Object.freeze(["json-extracted-from-text", "finding-dropped"]),
        events: Object.freeze([visibleTextEvent(payload.target.targetId)]),
      });
    },
  });
  const textUi = await mount(textExecutor);
  await act(async () => { button(textUi.container, "Radar").click(); await tick(); });
  const textInput = textUi.container.querySelector("#kd-radar-target-search");
  await setControl(textInput, "Mutter Teresa");
  await check("Freitext bleibt unverändert, ohne einen Browser-Check zu starten", async () => {
    assert.equal(textChecks.length, 0);
    assert.equal(textUi.container.querySelectorAll("#kd-radar-target-search").length, 1);
    assert.equal(textUi.container.querySelectorAll("#kd-radar-target-results").length, 0);
    await act(async () => { button(textUi.container, "Im Radar speichern").click(); await tick(); });
    await settle();
    assert.equal(textChecks.length, 0);
    assert.match(textUi.container.textContent, /Mutter Teresa/);
    assert.equal(controllerRef.current.sichtbarerRadarState.subscriptions.length, 1);
    assert.equal(controllerRef.current.sichtbarerRadarState.subscriptions[0].targetText, "Mutter Teresa");
    assert.equal(JSON.parse(localStorage.getItem("kd:radar")).subscriptions[0].targetText, "Mutter Teresa");
    assert.equal(button(textUi.container, "Jetzt prüfen"), undefined);
    assert.equal(textChecks.length, 0);
    assert.match(textUi.container.textContent, /automatische Prüfung ist im Gastmodus nicht verfügbar/i);
  });
  await textUi.cleanup();

  localStorage.removeItem("kd:radar");
  const degradedChecks = [];
  const degradedExecutor = Object.freeze({
    valid: true,
    async loadEvents() { return []; },
    async check(payload) {
      degradedChecks.push(payload);
      return Object.freeze({
        status: "insufficient_evidence",
        writes: 0,
        responseMode: "degraded",
        displayText: "Keine eindeutig belegte Zuordnung zu einem Österreich-Termin gefunden.",
        warnings: Object.freeze(["unstructured-provider-text"]),
        events: Object.freeze([]),
      });
    },
  });
  const degradedUi = await mount(degradedExecutor);
  await act(async () => { button(degradedUi.container, "Radar").click(); await tick(); });
  await setControl(degradedUi.container.querySelector("#kd-radar-target-search"), "Tommy Wiseau");
  await check("Gast-Freitext bleibt ohne verdeckten Suchaufruf und ohne Fund", async () => {
    await act(async () => { button(degradedUi.container, "Im Radar speichern").click(); await tick(); });
    await settle();
    assert.equal(degradedChecks.length, 0);
    assert.equal(button(degradedUi.container, "Jetzt prüfen"), undefined);
    assert.equal(degradedChecks.length, 0);
    assert.match(degradedUi.container.textContent, /Noch keine belegte Neuigkeit/);
    assert.doesNotMatch(degradedUi.container.textContent, /Mother Teresa: No Greater Love/);
  });
  await degradedUi.cleanup();

  localStorage.removeItem("kd:radar");
  const fallbackUi = await mount(degradedExecutor);
  await act(async () => { button(fallbackUi.container, "Radar").click(); await tick(); });
  const fallbackText = "Star Wars: Starfighter Kinostart Österreich";
  await setControl(fallbackUi.container.querySelector("#kd-radar-target-search"), fallbackText);
  await act(async () => { button(fallbackUi.container, "Im Radar speichern").click(); await tick(); });
  await settle();
  await check("Eindeutige Star-Wars-Terminfrage bleibt Freitext, wenn der strukturierte Pfad fehlt", async () => {
    const [subscription] = controllerRef.current.sichtbarerRadarState.subscriptions;
    assert.equal(subscription.targetType, "text");
    assert.equal(subscription.targetText, fallbackText);
    assert.match(fallbackUi.container.textContent, /Freitext/);
  });
  await fallbackUi.cleanup();

  localStorage.removeItem("kd:radar");
  const starfighterResponses = new Map([[
    createRadarWebsearchTargetKey(franchiseTarget),
    (request) => radarWebsearchResponseFor(request, [franchiseEvent(request, {
      work: { targetId: "imdb:tt13622970", targetType: "work", title: "Star Wars: Starfighter", year: 2027 },
      eventType: "kinostart_at", date: request.windowEnd, region: "AT", platform: "-",
    })]),
  ]]);
  const starfighterExecutor = createRadarWebsearchExecutor({
    adapter: createRadarWebsearchMockAdapter({ franchises: [franchiseTarget], responses: starfighterResponses }),
    store: createRadarWebsearchMemoryStore(), sources: [officialSource],
    now: () => checkedAt, timeoutMs: 2_000, leaseMs: 3_000,
  });
  const starfighterUi = await mount(starfighterExecutor);
  await act(async () => { button(starfighterUi.container, "Radar").click(); await tick(); });
  await setControl(starfighterUi.container.querySelector("#kd-radar-target-search"), "Star Wars: Starfighter Kinostart Österreich");
  await act(async () => { button(starfighterUi.container, "Im Radar speichern").click(); await tick(); });
  await settle();
  await check("Sichtbare Terminfrage speichert nur das kanonische Star-Wars-Ziel", async () => {
    const [subscription] = controllerRef.current.sichtbarerRadarState.subscriptions;
    assert.equal(subscription.targetType, "franchise");
    assert.equal(subscription.title, "Star Wars");
    assert.equal("targetText" in subscription, false);
    const targets = [...starfighterUi.container.querySelectorAll(".kd-entdecken-panel")]
      .find((entry) => /Meine Ziele/.test(entry.textContent));
    assert.match(targets.textContent, /Star Wars/);
    assert.doesNotMatch(targets.textContent, /Starfighter|Kinostart Österreich/);
  });
  await check("Der kanonische Gastpfad bietet keinen manuellen Suchknopf", async () => {
    assert.equal(button(starfighterUi.container, "Jetzt prüfen"), undefined);
    assert.doesNotMatch(starfighterUi.container.textContent, /Star Wars: Starfighter/);
  });
  await starfighterUi.cleanup();

  localStorage.removeItem("kd:radar");
  const accountTargetId = "title-group:v1:star-wars";
  const accountBaseMembers = Object.freeze([
    Object.freeze({ targetId: "watchmode:71001", targetType: "work", title: "Star Wars: Episode I", year: 1999 }),
    Object.freeze({ targetId: "watchmode:71004", targetType: "work", title: "Star Wars: Episode IV", year: 1977 }),
  ]);
  const accountStarfighterMember = Object.freeze({
    targetId: "imdb:tt13622970", targetType: "work", title: "Star Wars: Starfighter", year: 2027,
  });
  const accountTitleGroup = (members) => Object.freeze({
    format: "kd-radar-title-group-v1", queryVersion: "title-group-query-v1",
    queryKey: "star wars", displayName: "Star Wars", members: Object.freeze([...members]),
  });
  const accountSubscription = (members) => Object.freeze({
    targetId: accountTargetId, targetType: "franchise", title: "Star Wars",
    region: "AT", scope: "all", status: "active", updatedAt: checkedAt,
    titleGroup: accountTitleGroup(members),
  });
  const accountInitialFeed = Object.freeze({
    format: "kd-radar-pilot-feed-v2", revision: 1, checksum: "a".repeat(64),
    reconciledAt: checkedAt, subscriptions: Object.freeze([accountSubscription(accountBaseMembers)]),
    events: Object.freeze([]), receipts: Object.freeze([]), operationAcks: Object.freeze([]),
    radarReview: true, personResults: Object.freeze([]),
  });
  const accountAutomation = Object.freeze({
    contractVersion: "radar-auto-v1", schedulerActive: true, intervalHours: 144,
  });
  const accountStarfighterFeed = Object.freeze({
    ...accountInitialFeed,
    automation: accountAutomation,
    revision: 2,
    checksum: "b".repeat(64),
    subscriptions: Object.freeze([accountSubscription([...accountBaseMembers, accountStarfighterMember])]),
    events: Object.freeze([Object.freeze({
      eventId: "33333333-3333-4333-8333-333333333333",
      eventVersionId: "44444444-4444-4444-8444-444444444444",
      targetId: accountStarfighterMember.targetId,
      title: accountStarfighterMember.title,
      eventType: "kinostart_at", date: "2027-05-20", region: "AT", platform: "-",
      lifecycleStatus: "scheduled", verificationStatus: "confirmed",
      evidence: Object.freeze([
        Object.freeze({ sourceId: "source:official", sourceDomain: "starwars.com", url: "https://starwars.com/starfighter", retrievedAt: checkedAt }),
        Object.freeze({ sourceId: "source:trade", sourceDomain: "variety.com", url: "https://variety.com/starfighter-at", retrievedAt: checkedAt }),
      ]),
    })]),
  });
  const accountInitialState = reconcileAccountRadarPilotFeed(
    createEmptyLocalRadar({ authority: "account-cache" }), accountInitialFeed,
  );
  assert.equal(accountInitialState.ok, true, accountInitialState.errors?.join(","));
  localStorage.setItem("kd:radar", JSON.stringify(accountInitialState.state));
  const accountSession = Object.freeze({
    mode: "account", state: "ready", account: Object.freeze({ id: "max-account" }),
  });
  let accountFeedSyncs = 0;
  const unattestedUi = await mount(null, Object.freeze({
    session: accountSession,
    pilotAdapter: Object.freeze({ async sync({ state }) {
      return { status: "ready", state };
    } }),
  }));
  await act(async () => { button(unattestedUi.container, "Radar").click(); await tick(); });
  await settle();
  await check("Alter Account-Feed ohne Server-Attestation verspricht keine Sechs-Tage-Automatik", async () => {
    assert.match(unattestedUi.container.textContent, /automatische Prüfung ist für dieses Konto derzeit nicht verfügbar/i);
    assert.doesNotMatch(unattestedUi.container.textContent, /automatisch alle sechs Tage geprüft/i);
  });
  await unattestedUi.cleanup();
  const inactiveUi = await mount(null, Object.freeze({
    session: accountSession,
    pilotAdapter: Object.freeze({ async sync({ state }) {
      return {
        status: "ready", state,
        automation: Object.freeze({ ...accountAutomation, schedulerActive: false }),
      };
    } }),
  }));
  await act(async () => { button(inactiveUi.container, "Radar").click(); await tick(); });
  await settle();
  await check("Server-attestiertes Flag- oder Provider-Off bleibt als Automatik nicht verfügbar", async () => {
    assert.match(inactiveUi.container.textContent, /automatische Prüfung ist für dieses Konto derzeit nicht verfügbar/i);
    assert.doesNotMatch(inactiveUi.container.textContent, /automatisch alle sechs Tage geprüft/i);
  });
  await inactiveUi.cleanup();
  const accountHarness = Object.freeze({
    session: accountSession,
    pilotAdapter: Object.freeze({ async sync({ state, commit }) {
      accountFeedSyncs += 1;
      const reconciled = reconcileAccountRadarPilotFeed(state, accountStarfighterFeed);
      assert.equal(reconciled.ok, true, reconciled.errors?.join(","));
      localStorage.setItem("kd:radar", JSON.stringify(reconciled.state));
      await commit(reconciled.state);
      return { status: "ready", state: reconciled.state, automation: accountAutomation };
    } }),
  });
  const accountUi = await mount(null, accountHarness);
  await act(async () => { button(accountUi.container, "Radar").click(); await tick(); });
  await settle();
  await check("Automatisch erzeugter Account-Feed wird beim normalen Sync sichtbar und gespeichert", async () => {
    assert.equal(accountFeedSyncs, 1);
    assert.equal(button(accountUi.container, "Jetzt prüfen"), undefined);
    assert.match(accountUi.container.textContent, /automatisch alle sechs Tage geprüft/i);
    assert.match(accountUi.container.textContent, /Star Wars: Starfighter/);
    assert.match(accountUi.container.textContent, /Gefunden für: Star Wars/);
    assert.match(accountUi.container.textContent, /2027-05-20 · AT · Kinostart in Österreich/);
    assert.equal(accountUi.container.querySelectorAll("a.kd-pilot-quellen-link").length, 2);
    const stored = JSON.parse(localStorage.getItem("kd:radar"));
    assert.equal(stored.pilot.events[0].title, "Star Wars: Starfighter");
  });
  await accountUi.cleanup();
  const accountReload = await mount(null, accountHarness);
  await act(async () => { button(accountReload.container, "Radar").click(); await tick(); });
  await settle();
  await check("Account-Feedfund bleibt nach Reload sichtbar, ohne Browser-Suchpfad", async () => {
    assert.equal(accountFeedSyncs, 2);
    assert.equal(button(accountReload.container, "Jetzt prüfen"), undefined);
    assert.match(accountReload.container.textContent, /Star Wars: Starfighter/);
    assert.match(accountReload.container.textContent, /Gefunden für: Star Wars/);
  });
  await accountReload.cleanup();
} finally {
  if (dom) dom.window.close();
  if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  try { fs.rmdirSync(cacheDir); } catch { /* Ein fremder paralleler Test darf seinen Cache behalten. */ }
}

console.log(`\n${checks} Radar-Websearch-Flow-Checks bestanden.`);
console.log("Betrieb: lokaler Mockadapter · kein Netz · keine DB · kein Anbieter · kein Retry");
