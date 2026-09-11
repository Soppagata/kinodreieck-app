/* Fokussierte U2-DOM-Prüfung ohne Netz, Datenbank oder Anbieter. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { erstellePrognose, PROGNOSE_FORMAT } from "./src/lib/prognose.js";
import { FILMWISSEN_STATUS } from "./src/lib/filmwissen.js";
import { ENTDECKEN_MARKET_POOL_50 } from "./src/data/entdeckenMarketPool50.js";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

async function loadEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "kinodreieck-ui-copy-"));
let dom = null;
try {
  fs.symlinkSync(fs.realpathSync(path.join(rootDir, "node_modules")), path.join(outputDir, "node_modules"), "dir");
  const output = path.join(outputDir, "bundle.mjs");
  const esbuild = await loadEsbuild();
  await esbuild.build({
    stdin: {
      contents: [
        'export { FilmCard } from "./src/components/FilmCard.jsx";',
        'export { FilmwissenBereich } from "./src/components/FilmwissenBereich.jsx";',
        'export { EntdeckenTab } from "./src/tabs/EntdeckenTab.jsx";',
      ].join("\n"),
      loader: "js",
      resolveDir: rootDir,
    },
    bundle: true,
    format: "esm",
    outfile: output,
    jsx: "automatic",
    target: "es2022",
    logLevel: "warning",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });
  const { FilmCard, FilmwissenBereich, EntdeckenTab } = await import(pathToFileURL(output).href);

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
  globalThis.fetch = async () => { throw new Error("Netz im U2-Mockpfad verboten"); };

  const React = await import("react");
  const { act, createElement } = React;
  const { createRoot } = await import("react-dom/client");
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  async function mount(Component, props) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(createElement(Component, props)); await tick(); await tick(); });
    return {
      container,
      async cleanup() { await act(async () => root.unmount()); container.remove(); },
    };
  }
  const buttonByText = (container, text) => [...container.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === text);

  const filmwissenUi = await mount(FilmwissenBereich, {
    daten: { status: FILMWISSEN_STATUS.CACHE_MISS },
    rechercheMoeglich: true,
    onRecherchieren() {},
  });
  check("Filmwissen behält Erklärung und klaren KI-Button ohne Betriebsbudget", () => {
    assert.match(filmwissenUi.container.textContent, /noch keinen gemeinsamen Bericht/);
    assert.ok(buttonByText(filmwissenUi.container, "KI-Recherchebericht erstellen"));
    assert.doesNotMatch(filmwissenUi.container.textContent, /US-Cent|Dollar|Websuche|Aufruf/);
  });
  await filmwissenUi.cleanup();

  const gebaut = erstellePrognose({
    ergebnis: {
      format: PROGNOSE_FORMAT,
      achsen: { wie: 4, was: 3, warum: 2 },
      passung: 74,
      kategorie_vorschlag: "sehenswert",
      sicherheit: "mittel",
      begruendung: "Die ruhige Spannung passt zu deinem Profil.",
      verwendete_signale: [],
    },
    profilVersion: "p3",
    modell: "claude-sonnet-5-20260715",
    modellAlias: "gross",
    vorgangId: "ui-copy-test",
    verbrauch: { inputTokens: 800, outputTokens: 220, kostenUsdCent: 0.42, dauerMs: 2300 },
    jetzt: "2026-09-11T09:00:00.000Z",
  });
  assert.equal(gebaut.ok, true, gebaut.fehler?.join(", "));
  const filmUi = await mount(FilmCard, {
    film: { id: "film-1", titel: "Testfilm", jahr: 2026, typ: "film", bewertung: null, prognose: gebaut.prognose },
    expanded: true,
    onToggle() {},
    onSave: async () => true,
    vorbewertung: {
      laeuft: false, fehler: null, sperrgrund: null, aktuelleProfilVersion: "p3",
      onErstellen() {}, onAnnehmen() {}, onVerwerfen() {},
    },
  });
  check("Prognose zeigt keine technische Kosten-/Aufrufkopie und keinen Korrekturbutton", () => {
    assert.doesNotMatch(filmUi.container.textContent, /US-Cent|Dollar|Websuche|kostenpflichtig|Echt bewerten \/ korrigieren/);
    assert.ok(buttonByText(filmUi.container, "Als Bewertung übernehmen"));
  });
  await act(async () => { buttonByText(filmUi.container, "Als Bewertung übernehmen").click(); await tick(); });
  check("Normaler Übernahmeweg öffnet das vorausgefüllte Bewertungsfeld", () => {
    const panel = filmUi.container.querySelector(".kd-editpanel");
    assert.ok(panel);
    assert.match(panel.textContent, /KI-Prognose vorausgefüllt/);
    assert.deepEqual([...panel.querySelectorAll('input[type="number"]')].map((input) => input.value), ["4", "3", "2"]);
    assert.equal(panel.querySelector("select")?.value, "sehenswert");
    assert.equal(panel.querySelector('textarea[placeholder^="Begründung"]')?.value, "Die ruhige Spannung passt zu deinem Profil.");
  });
  await filmUi.cleanup();

  localStorage.setItem("kd:geschmacksprofil", JSON.stringify({
    format: 1, version: "p1", erstellt: null, geaendert: null, einwilligung: null,
    signale: [{
      art: "genre", wert: "drama", richtung: "zieht_an", staerke: 4,
      sicherheit: "hoch", quelle: "schlagwort", beleg: "schlagwort:drama",
    }],
    offen: [], achsen: { wie: null, was: null, warum: null }, filme: [], nichtDeutbar: [],
  }));
  const feedMitMatch = structuredClone(ENTDECKEN_MARKET_POOL_50);
  feedMitMatch.items[15].externalIds = { imdb: "tt12345" };
  const entdeckenUi = await mount(EntdeckenTab, {
    datenKontextKey: "ui-copy",
    blogProps: {},
    radarState: { subscriptions: [], personSubscriptions: [], personResults: [] },
    master: [],
    streamingDiscover: {
      region: "AT", stand: "2026-09-11T00:00:00.000Z",
      titel: [{
        watchmode_id: 9001, imdb_id: "tt12345", titel: "My Best Friend, His Girlfriend and Me",
        jahr: 2026, typ: "movie", dienste: ["Netflix"], genres: ["drama"], tags: [],
        beschreibung: "Diese Beschreibung startet geschlossen.",
      }],
    },
    webDiscoveryFeed: feedMitMatch,
    selectedServices: ["Netflix"],
    calendarDay: "2026-09-11",
  });
  const disclosure = entdeckenUi.container.querySelector(".kd-entdecken-auswahlkarten .kd-entdecken-beschreibung-toggle");
  check("Empfehlungsbeschreibung startet als zugängliches Chevron-Disclosure geschlossen", () => {
    assert.ok(disclosure, entdeckenUi.container.innerHTML);
    assert.equal(disclosure.getAttribute("aria-expanded"), "false");
    assert.ok(disclosure.getAttribute("aria-controls"));
    assert.ok(disclosure.querySelector(".kd-entdecken-aufklappzeichen svg"));
    assert.doesNotMatch(entdeckenUi.container.textContent, /Diese Beschreibung startet geschlossen/);
  });
  await act(async () => { disclosure.click(); await tick(); });
  check("Empfehlungsbeschreibung öffnet sich am kontrollierten Ziel", () => {
    assert.equal(disclosure.getAttribute("aria-expanded"), "true");
    const ziel = entdeckenUi.container.querySelector(`#${disclosure.getAttribute("aria-controls")}`);
    assert.match(ziel?.textContent || "", /Diese Beschreibung startet geschlossen/);
  });
  await entdeckenUi.cleanup();

  const entdeckenSource = fs.readFileSync(path.join(rootDir, "src/tabs/EntdeckenTab.jsx"), "utf8");
  const disclosureCss = fs.readFileSync(path.join(rootDir, "src/styles/ui-copy-disclosures.css"), "utf8");
  check("Empfehlungen und Beliebte Titel teilen Chevron und offene Drehrichtung", () => {
    assert.equal((entdeckenSource.match(/<IconChevronDown \/>/g) || []).length, 2);
    assert.doesNotMatch(entdeckenSource, /istBeschreibungOffen \? ["']−["'] : ["']\+["']/);
    assert.match(disclosureCss, /\[aria-expanded="true"\][^{]*\.kd-entdecken-aufklappzeichen\s*\{[^}]*rotate\(180deg\)/s);
  });

  const kinoSource = fs.readFileSync(path.join(rootDir, "src/components/KinoLinks.jsx"), "utf8");
  check("Kino-Links behalten Text und Link ohne Weiterleit-Pfeilglyphe", () => {
    assert.match(kinoSource, /<a href=\{kinoLink\(k\)\}/);
    assert.match(kinoSource, /\{k\}/);
    assert.doesNotMatch(kinoSource, /↗/);
  });

  console.log(`\n${checks}/${checks} U2 UI-Copy-/Disclosure-Checks bestanden.`);
} finally {
  dom?.window.close();
  fs.rmSync(outputDir, { recursive: true, force: true });
}
