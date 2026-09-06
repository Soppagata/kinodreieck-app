/* Fokussierter Nutzerweg fuer Streaming-Pins und den lokalen 14-Tage-Diff.
   Rein lokal: keine Datenbank, kein Provider, keine KI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  aktualisiereStreamingNeuSnapshot,
  bereinigeStreamingNeuSnapshot,
  parseStreamingNeuSnapshot,
  STREAMING_NEU_DAUER_MS,
  streamingCoverageSignatur,
  streamingNeuIds,
  streamingNeuLegacyStorageKey,
  streamingNeuStorageKey,
} from "./src/lib/streamingNeu.js";
import { toggleEntdeckenPin } from "./src/lib/entdeckenPins.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };

const ownerA = "account:00000000-0000-4000-8000-0000000000aa";
const ownerB = "account:00000000-0000-4000-8000-0000000000bb";
const titel = (id, name, dienst = "Netflix") => ({
  watchmode_id: id, titel: name, jahr: 2024, typ: "movie", genres: ["Drama"], dienste: [dienst],
});
const iso = (ms) => new Date(ms).toISOString();
const TAG = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-08-01T08:00:00.000Z");
const BASIS_DIENSTE = ["Netflix", "Disney+", "Prime Video"];

const erster = aktualisiereStreamingNeuSnapshot(null, {
  owner: ownerA, runId: iso(T0), now: T0, dienste: BASIS_DIENSTE,
  titel: [titel(1, "Bekannt"), titel(2, "Entdeckung"), titel(2, "Dublette")],
});
check("Erster vollständiger Stand ist eine deduplizierte leere Baseline", () => {
  assert.equal(erster.geaendert, true);
  assert.equal(erster.initialisiert, true);
  assert.deepEqual(erster.snapshot.ids, [1, 2]);
  assert.deepEqual(streamingNeuIds(erster.snapshot, T0), []);
});

const reload = parseStreamingNeuSnapshot(JSON.stringify(erster.snapshot), ownerA);
check("Reload bleibt ownergebunden und v2-validiert", () => {
  assert.deepEqual(reload, erster.snapshot);
  assert.equal(parseStreamingNeuSnapshot(JSON.stringify(erster.snapshot), ownerB), null);
  assert.notEqual(streamingNeuStorageKey(ownerA), streamingNeuStorageKey(ownerB));
  assert.notEqual(streamingNeuStorageKey(ownerA), streamingNeuLegacyStorageKey(ownerA));
});

const nurGefilterterRender = aktualisiereStreamingNeuSnapshot(reload, {
  owner: ownerA, runId: iso(T0), now: T0 + TAG, dienste: BASIS_DIENSTE, titel: [titel(2, "Entdeckung")],
});
check("Derselbe katalog_stand schreibt eine Filter-/Render-Teilmenge nicht als Lauf", () => {
  assert.equal(nurGefilterterRender.geaendert, false);
  assert.deepEqual(nurGefilterterRender.snapshot.ids, [1, 2]);
  assert.deepEqual(streamingNeuIds(nurGefilterterRender.snapshot, T0 + TAG), []);
});

const zweiter = aktualisiereStreamingNeuSnapshot(reload, {
  owner: ownerA, runId: iso(T0 + 2 * TAG), now: T0 + 2 * TAG, dienste: BASIS_DIENSTE,
  titel: [titel(2, "Entdeckung"), titel(3, "Neu A"), titel(3, "Neu A doppelt")],
});
const dritter = aktualisiereStreamingNeuSnapshot(zweiter.snapshot, {
  owner: ownerA, runId: iso(T0 + 5 * TAG), now: T0 + 5 * TAG, dienste: BASIS_DIENSTE,
  titel: [titel(2, "Entdeckung"), titel(3, "Neu A"), titel(4, "Neu B")],
});
check("Neue IDs sammeln sich über mehrere echte Läufe", () => {
  assert.deepEqual(streamingNeuIds(zweiter.snapshot, T0 + 2 * TAG), [3]);
  assert.deepEqual(streamingNeuIds(dritter.snapshot, T0 + 5 * TAG), [3, 4]);
  assert.deepEqual(dritter.snapshot.neu.map((entry) => entry.firstSeenAt), [T0 + 2 * TAG, T0 + 5 * TAG]);
});

const ohneDrei = aktualisiereStreamingNeuSnapshot(dritter.snapshot, {
  owner: ownerA, runId: iso(T0 + 6 * TAG), now: T0 + 6 * TAG, dienste: BASIS_DIENSTE,
  titel: [titel(2, "Entdeckung"), titel(4, "Neu B")],
});
const dreiWiederDa = aktualisiereStreamingNeuSnapshot(ohneDrei.snapshot, {
  owner: ownerA, runId: iso(T0 + 7 * TAG), now: T0 + 7 * TAG, dienste: BASIS_DIENSTE,
  titel: [titel(2, "Entdeckung"), titel(3, "Neu A zurück"), titel(4, "Neu B")],
});
check("Verschwundene IDs werden entfernt und beim Wiederauftauchen erneut neu", () => {
  assert.deepEqual(streamingNeuIds(ohneDrei.snapshot, T0 + 6 * TAG), [4]);
  assert.deepEqual(streamingNeuIds(dreiWiederDa.snapshot, T0 + 7 * TAG), [4, 3]);
  assert.equal(dreiWiederDa.snapshot.neu.find((entry) => entry.id === 3).firstSeenAt, T0 + 7 * TAG);
});

check("Ein Titel bleibt 14 volle Tage sichtbar und verschwindet exakt an der Grenze", () => {
  const fastVierzehn = T0 + 2 * TAG + STREAMING_NEU_DAUER_MS - 1;
  assert.deepEqual(streamingNeuIds(zweiter.snapshot, fastVierzehn), [3]);
  const ablauf = bereinigeStreamingNeuSnapshot(zweiter.snapshot, fastVierzehn + 1);
  assert.equal(ablauf.geaendert, true);
  assert.deepEqual(streamingNeuIds(ablauf.snapshot, fastVierzehn + 1), []);
});

const legacy = {
  format: 1, owner: ownerA, runId: iso(T0), ids: [1, 2], neueIds: null,
};
const migration = aktualisiereStreamingNeuSnapshot(JSON.stringify(legacy), {
  owner: ownerA, runId: iso(T0), now: T0, dienste: BASIS_DIENSTE, titel: [titel(1, "Alt"), titel(2, "Alt")],
});
check("v1 migriert als leere Baseline statt den Altbestand als neu zu zeigen", () => {
  assert.equal(migration.snapshot.format, 2);
  assert.equal(migration.geaendert, true);
  assert.deepEqual(streamingNeuIds(migration.snapshot, T0), []);
});

check("v1 übernimmt unabhängig von früherer oder späterer alter Zeitachse stets den aktuellen Vollstand", () => {
  for (const alterRunId of [iso(T0 - 10 * TAG), iso(T0 + 10 * TAG)]) {
    const migriert = aktualisiereStreamingNeuSnapshot(JSON.stringify({
      format: 1, owner: ownerA, runId: alterRunId, ids: [1, 99], neueIds: [99],
    }), {
      owner: ownerA, runId: iso(T0), now: T0, dienste: BASIS_DIENSTE,
      titel: [titel(2, "Aktuell"), titel(3, "Aktuell neu gegenüber v1")],
    });
    assert.equal(migriert.snapshot.runId, iso(T0));
    assert.deepEqual(migriert.snapshot.ids, [2, 3]);
    assert.deepEqual(migriert.snapshot.neu, []);
    assert.equal(migriert.migriert, true);
  }
});

check("Coverage-Signatur ist dedupliziert und stabil sortiert", () => {
  assert.equal(
    streamingCoverageSignatur(["Prime Video", "Netflix", "Disney+", "Netflix"]),
    JSON.stringify(["Disney+", "Netflix", "Prime Video"]),
  );
});

const vorCoverageWechsel = aktualisiereStreamingNeuSnapshot(erster.snapshot, {
  owner: ownerA, runId: iso(T0 + 2 * TAG), now: T0 + 2 * TAG,
  dienste: BASIS_DIENSTE, titel: [titel(1, "Bekannt"), titel(2, "Alt"), titel(3, "Neu")],
});
const nachCoverageWechsel = aktualisiereStreamingNeuSnapshot(vorCoverageWechsel.snapshot, {
  owner: ownerA, runId: iso(T0 + 3 * TAG), now: T0 + 3 * TAG,
  dienste: [...BASIS_DIENSTE, "MUBI"], titel: [titel(1, "Bekannt"), titel(2, "Alt"), titel(3, "Neu"), titel(4, "Coverage-Alt")],
});
const nachNormalemFolgelauf = aktualisiereStreamingNeuSnapshot(nachCoverageWechsel.snapshot, {
  owner: ownerA, runId: iso(T0 + 4 * TAG), now: T0 + 4 * TAG,
  dienste: ["MUBI", ...BASIS_DIENSTE].reverse(), titel: [titel(1, "Bekannt"), titel(2, "Alt"), titel(3, "Neu"), titel(4, "Coverage-Alt"), titel(5, "Echt neu")],
});
check("Coverage-Wechsel rebasiert still; gleicher Coverage folgt wieder der normalen Diff-Logik", () => {
  assert.deepEqual(streamingNeuIds(vorCoverageWechsel.snapshot, T0 + 2 * TAG), [3]);
  assert.equal(nachCoverageWechsel.coverageRebase, true);
  assert.deepEqual(streamingNeuIds(nachCoverageWechsel.snapshot, T0 + 3 * TAG), []);
  assert.deepEqual(nachCoverageWechsel.snapshot.ids, [1, 2, 3, 4]);
  assert.deepEqual(streamingNeuIds(nachNormalemFolgelauf.snapshot, T0 + 4 * TAG), [5]);
});

const v2OhneCoverage = { ...dritter.snapshot };
delete v2OhneCoverage.coverage;
const v2Rebase = aktualisiereStreamingNeuSnapshot(v2OhneCoverage, {
  owner: ownerA, runId: iso(T0 + 8 * TAG), now: T0 + 8 * TAG,
  dienste: BASIS_DIENSTE, titel: [titel(20, "Aktueller Vollstand")],
});
check("Bestehendes v2 ohne Coverage wird defensiv als leere aktuelle Baseline migriert", () => {
  assert.equal(v2Rebase.migriert, true);
  assert.equal(v2Rebase.coverageRebase, true);
  assert.deepEqual(v2Rebase.snapshot.ids, [20]);
  assert.deepEqual(streamingNeuIds(v2Rebase.snapshot, T0 + 8 * TAG), []);
});

check("Korrupte Historien und rückwärts laufende Katalogstände bleiben fail-closed", () => {
  assert.equal(parseStreamingNeuSnapshot(JSON.stringify({
    ...dritter.snapshot, neu: [{ id: 4, firstSeenAt: T0 + 9 * TAG }],
  }), ownerA), null);
  const stale = aktualisiereStreamingNeuSnapshot(dritter.snapshot, {
    owner: ownerA, runId: iso(T0 + 4 * TAG), now: T0 + 6 * TAG, dienste: BASIS_DIENSTE, titel: [titel(99, "Stale")],
  });
  assert.deepEqual(stale.snapshot.ids, dritter.snapshot.ids);
  assert.deepEqual(streamingNeuIds(stale.snapshot, T0 + 6 * TAG), [3, 4]);
  const staleAndereCoverage = aktualisiereStreamingNeuSnapshot(dritter.snapshot, {
    owner: ownerA, runId: iso(T0 + 4 * TAG), now: T0 + 6 * TAG,
    dienste: [...BASIS_DIENSTE, "MUBI"], titel: [titel(99, "Stale mit anderer Coverage")],
  });
  assert.deepEqual(staleAndereCoverage.snapshot.ids, dritter.snapshot.ids);
  assert.equal(staleAndereCoverage.snapshot.coverage, dritter.snapshot.coverage);
});

const appSource = fs.readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
check("App verwendet katalog_stand und lädt den Vollkatalog beim Öffnen von Streaming", () => {
  assert.equal((appSource.match(/runId:\s*[^\n]*\?\.katalog_stand/g) || []).length, 2);
  assert.equal((appSource.match(/dienste:\s*[^\n]*\?\.dienste/g) || []).length, 2);
  assert.match(appSource, /tab === "streaming"[\s\S]{0,180}ladeStreamingDateien\(true\)/u);
  const streamingSource = fs.readFileSync(new URL("./src/tabs/StreamingTab.jsx", import.meta.url), "utf8");
  assert.match(streamingSource, /new Date\(bekannt\.katalog_stand \|\| bekannt\.stand\)/u);
});

const wurzel = path.dirname(fileURLToPath(import.meta.url));
async function ladeEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}
const ausgabeDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-streaming-pin-neu-test-"));
const ausgabe = path.join(ausgabeDir, "bundle.mjs");
fs.symlinkSync(path.join(wurzel, "node_modules"), path.join(ausgabeDir, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(ausgabeDir, { recursive: true, force: true }));
const esbuild = await ladeEsbuild();
await esbuild.build({
  stdin: {
    contents: [
      'export { StreamingTab } from "./src/tabs/StreamingTab.jsx";',
      'export { StartTab } from "./src/tabs/StartTab.jsx";',
      'export { useStreamingNeuController } from "./src/controllers/useStreamingNeuController.js";',
      'export { setStorageDriver } from "./src/lib/storage.js";',
    ].join("\n"),
    loader: "js", resolveDir: wurzel,
  },
  bundle: true, format: "esm", outfile: ausgabe, jsx: "automatic", target: "es2022",
  logLevel: "warning", external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of [
  "window", "document", "navigator", "HTMLElement", "Element", "Event", "MouseEvent", "Node", "NodeList",
  "getComputedStyle", "localStorage",
]) Object.defineProperty(globalThis, name, {
  value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { StreamingTab, StartTab, useStreamingNeuController, setStorageDriver } = await import(ausgabe);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(Component, props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (next) => act(async () => { root.render(h(Component, next)); await tick(); });
  await render(props);
  return { container, render, async cleanup() { await act(async () => root.unmount()); container.remove(); } };
}

const gespeicherteWerte = new Map();
let blockierterGet = null;
const testDriver = {
  name: "test", owner: ownerA,
  async get(key) {
    if (blockierterGet) {
      const blockade = blockierterGet;
      blockierterGet = null;
      blockade.gestartet();
      await blockade.warte;
    }
    return gespeicherteWerte.has(key) ? { key, value: gespeicherteWerte.get(key) } : null;
  },
  async set(key, value) { gespeicherteWerte.set(key, value); return { key, value }; },
  async delete(key) { gespeicherteWerte.delete(key); return { key, deleted: true }; },
  async list(prefix = "") { return { keys: [...gespeicherteWerte.keys()].filter((key) => key.startsWith(prefix)) }; },
};
setStorageDriver(testDriver);
let controller = null;
function ControllerProbe() {
  controller = useStreamingNeuController();
  return h("output", null, `${controller.streamingNeu.status}:${controller.streamingNeu.neueIds.join(",")}`);
}
const controllerUi = await mount(ControllerProbe, {});
const realNow = Date.now();
await act(async () => {
  await controller.uebernehmeVollkatalog({
    runId: iso(realNow - STREAMING_NEU_DAUER_MS - 1_000), dienste: BASIS_DIENSTE, titel: [titel(10, "Baseline")],
  });
  await tick();
});
await act(async () => {
  await controller.uebernehmeVollkatalog({
    runId: iso(realNow - STREAMING_NEU_DAUER_MS + 250), dienste: BASIS_DIENSTE,
    titel: [titel(10, "Baseline"), titel(11, "Controller neu")],
  });
  await tick();
});
check("Controller persistiert v2 asynchron und übernimmt nur den echten Folgelauf-Diff", () => {
  assert.equal(controllerUi.container.textContent, "ready:11");
  assert.equal(JSON.parse(gespeicherteWerte.get(streamingNeuStorageKey(ownerA))).format, 2);
  assert.equal(JSON.parse(gespeicherteWerte.get(streamingNeuStorageKey(ownerA))).coverage, streamingCoverageSignatur(BASIS_DIENSTE));
});
let getGestartet;
let getFreigeben;
const getGestartetPromise = new Promise((resolve) => { getGestartet = resolve; });
const getBlockade = new Promise((resolve) => { getFreigeben = resolve; });
blockierterGet = { gestartet: getGestartet, warte: getBlockade };
const raceRunId = iso(Date.now());
let raceLauf;
await act(async () => {
  raceLauf = controller.uebernehmeVollkatalog({
    runId: raceRunId, dienste: BASIS_DIENSTE,
    titel: [titel(10, "Baseline"), titel(11, "Läuft ab"), titel(12, "Race neu")],
  });
  await getGestartetPromise;
});
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
await act(async () => { getFreigeben(); await raceLauf; await tick(); });
check("Ablauf-Cleanup verdrängt keinen gleichzeitig laufenden Vollkatalog-Read", () => {
  assert.equal(controllerUi.container.textContent, "ready:12");
  const gespeichert = JSON.parse(gespeicherteWerte.get(streamingNeuStorageKey(ownerA)));
  assert.equal(gespeichert.runId, raceRunId);
  assert.deepEqual(gespeichert.ids, [10, 11, 12]);
  assert.deepEqual(gespeichert.neu.map((entry) => entry.id), [12]);
});
await controllerUi.cleanup();
setStorageDriver(null);

const bekannt = {
  stand: iso(realNow), katalog_stand: iso(realNow), dienste: ["Netflix"],
  katalogMengen: { umfang: "voll" },
  titel: [{ ...titel(1, "Bekannt"), id: "bekannt-master", bewertung: null, quelle: "streaming", typ: "film" }],
};
const entdeckenVoll = {
  stand: iso(realNow), katalog_stand: iso(realNow), dienste: ["Netflix", "MUBI"],
  katalogMengen: { umfang: "voll" },
  titel: [titel(2, "Entdeckung"), titel(3, "Nur MUBI", "MUBI"), titel(4, "Noch Netflix")],
};
const entdeckenBegrenzt = {
  ...entdeckenVoll, katalogMengen: { umfang: "begrenzt" }, titel: [titel(2, "Entdeckung")],
};
let letzterToggle = null;
let vollLadungen = 0;
let synchronisierterStatus = {};
let addFilmRufe = 0;
const basisProps = {
  bekannt, entdecken: entdeckenBegrenzt, auswahl: ["Netflix"], merkliste: [], toggleMerk() {},
  master: bekannt.titel, mustwatchIds: new Set(), entdeckenStatus: {},
  schreibeEntdeckenStatus: async (update) => {
    synchronisierterStatus = update(synchronisierterStatus);
    return true;
  },
  addFilm: async () => { addFilmRufe += 1; return "unerwartetes-duplikat"; },
  onAllesKatalogLaden() { vollLadungen++; },
  recommendationPins: [], onRecommendationPinToggle(entry) { letzterToggle = entry; },
  streamingNeu: { status: "ready", runId: iso(realNow), neueIds: [1, 2, 3, 4], naechsterAblauf: null },
};
const ui = await mount(StreamingTab, basisProps);
const pin = (name, action = "anpinnen") => ui.container.querySelector(`button[aria-label="${name} ${action === "lösen" ? "vom Pinboard lösen" : "am Pinboard anpinnen"}"]`);
const tabButton = (name) => [...ui.container.querySelectorAll("button")]
  .find((button) => button.textContent.trim().startsWith(name));

check("Begrenzter Startbestand zeigt bei Alles keine irreführende Teilzahl", () => {
  assert.equal(tabButton("Alles").textContent.trim(), "Alles");
});
await ui.render({ ...basisProps, entdecken: entdeckenVoll });
check("Nach Vollabdeckung zeigt Alles die echte Zahl für ausgewählte Dienste", () => {
  assert.equal(tabButton("Alles").textContent.trim(), "Alles (2)");
});

await act(async () => { pin("Bekannt").click(); await tick(); });
const gesetztePins = toggleEntdeckenPin([], letzterToggle, 1234);
await ui.render({ ...basisProps, entdecken: entdeckenVoll, recommendationPins: gesetztePins });
check("Jeder Titel in Mein Programm lässt sich über denselben Pin-Mechanismus pinnen", () => {
  assert.equal(letzterToggle.watchmode_id, 1);
  assert.equal(pin("Bekannt", "lösen")?.getAttribute("aria-pressed"), "true");
});

await act(async () => { tabButton("Alles").click(); await tick(); await tick(); });
check("Auch jede Karte in Alles besitzt den Pin-Button", () => {
  assert.ok(pin("Entdeckung"));
  assert.equal(vollLadungen, 1);
});

await act(async () => { tabButton("Neu").click(); await tick(); await tick(); });
await ui.render({
  ...basisProps, entdecken: entdeckenVoll, entdeckenStatus: synchronisierterStatus,
});
check("Neu nutzt 14-Tage-Menge, Dienstewahl und dieselben Pin-Karten", () => {
  assert.match(ui.container.textContent, /14 Tage/u);
  assert.match(ui.container.textContent, /Bekannt/u);
  assert.match(ui.container.textContent, /Entdeckung/u);
  assert.match(ui.container.textContent, /Noch Netflix/u);
  assert.doesNotMatch(ui.container.textContent, /Nur MUBI/u);
  assert.ok((pin("Bekannt") || pin("Bekannt", "lösen")) && pin("Entdeckung"));
  assert.equal(vollLadungen, 2);
});
const bekannteNeuKarte = [...ui.container.querySelectorAll(".kd-entdecken-karte")]
  .find((karte) => /Bekannt/u.test(karte.textContent));
await act(async () => { bekannteNeuKarte.click(); await tick(); });
check("Ein bereits eindeutig gematchter Neu-Titel verlinkt die Mediathek und bietet keinen Duplikat-Create-Pfad", () => {
  assert.match(bekannteNeuKarte.textContent, /in deiner Mediathek/u);
  assert.equal([...bekannteNeuKarte.querySelectorAll("button")]
    .some((entry) => /^(?:Eintrag erstellen|In Mediathek übernehmen)$/u.test(entry.textContent.trim())), false);
  assert.equal(addFilmRufe, 0);
});

let dashboardSprung = null;
const dashboard = await mount(StartTab, {
  entdeckenPins: gesetztePins, streamingBekannt: bekannt, streamingEntdecken: entdeckenVoll,
  webDiscoveryFeed: null, progStand: Date.now(), kinoMatches: { matched: [], rest: [] },
  wochenplan: { version: 1, eintraege: [] }, onWochenplanAendern() {},
  onSpringeZuStreaming(target) { dashboardSprung = target; }, onEntdeckenPinsBereinigen() {},
});
const dashboardPin = dashboard.container.querySelector(".kd-pinboard-titel");
await act(async () => { dashboardPin.click(); await tick(); });
check("Ein Streaming-Pin erscheint zuverlässig im Dashboard-Pinboard", () => {
  assert.match(dashboardPin.textContent, /Bekannt/u);
  assert.equal(dashboardSprung?.ref, 1);
  assert.equal(dashboardSprung?.art, "programm");
});

await dashboard.cleanup();
await ui.cleanup();
console.log(`\nSTREAMING-PIN-NEU-TEST BESTANDEN (${checks}/${checks})`);
