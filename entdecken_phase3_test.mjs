/* Entdecken/Radar: lokale Verträge plus echte React-/JSDOM-Oberfläche.
   Kein Netz, kein Provider, keine KI, keine Migration. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  createCatalogSearchActions,
  createEntdeckenRecommendations,
  localRecommendationCandidates,
  rankLocalEntdeckenRecommendations,
  selectDailyRecommendations,
  shouldRefreshWebDiscovery,
  webDiscoveryCandidates,
} from "./src/lib/entdeckenUi.js";
import {
  applyPersonRadarCheckResult,
  createEmptyLocalRadar,
  decodeLocalRadar,
  reconcileAccountRadarPilotFeed,
  upsertGuestPersonRadarSubscription,
  upsertGuestRadarSubscription,
} from "./src/lib/localEventRadar.js";
import {
  RADAR_TARGET_SEARCH_MAX_RESULTS,
  searchRadarTargets,
} from "./src/lib/radarTargetSearch.js";
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
check("Radarzielsuche startet erst ab zwei Zeichen, bleibt bei acht ID-Treffern und verwirft ununterscheidbare Kollisionen", () => {
  assert.equal(searchRadarTargets({ query: "S" }).status, "idle");
  const many = searchRadarTargets({
    query: "Testfilm",
    streamingDiscover: {
      titel: Array.from({ length: 20 }, (_, index) => ({
        watchmode_id: 5000 + index, titel: `Testfilm ${index + 1}`, typ: "movie", jahr: 2026,
      })),
    },
  });
  assert.equal(many.entries.length, RADAR_TARGET_SEARCH_MAX_RESULTS);
  assert.ok(many.entries.every((entry) => entry.stableId.startsWith("watchmode:") && entry.category === "Film"));
  const ambiguous = searchRadarTargets({
    query: "Doppelter Titel",
    streamingDiscover: { titel: [
      { watchmode_id: 6101, titel: "Doppelter Titel", typ: "movie", jahr: 2026 },
      { watchmode_id: 6102, titel: "Doppelter Titel", typ: "movie", jahr: 2026 },
    ] },
  });
  assert.deepEqual(ambiguous.entries, []);
});
check("Person und Reihe erscheinen nur als kanonische, typisierte ID-Treffer", () => {
  const person = searchRadarTargets({ query: "Nicolas", personAvailable: true });
  assert.deepEqual(person.entries.map((entry) => [entry.category, entry.stableId]), [
    ["Person", "person:wikidata:Q42869:actor"],
  ]);
  const franchise = searchRadarTargets({ query: "Star Wars", franchiseAvailable: true });
  assert.deepEqual(franchise.entries.map((entry) => [entry.category, entry.stableId]), [
    ["Reihe", "title-group:v1:star-wars"],
  ]);
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
  katalogMengen: { rohkatalog: 24, masterbestand: 1, imMasterGefunden: 0, nachMasterAbzug: 24, umfang: "voll" },
  titel: Array.from({ length: 24 }, (_, index) => ({
    watchmode_id: 91 + index,
    titel: `Synthetischer Tipp ${String(index + 1).padStart(2, "0")}`,
    jahr: 2000 + index, typ: index % 5 === 0 ? "tv_series" : "movie",
    dienste: ["Testdienst"], genres: index === 0 ? ["drama"] : [],
  })),
};
const webDiscoveryFeed = {
  format: 3, feedId: "websearch:daily-tips-at", region: "AT",
  refreshedOn: "2026-08-20", validUntil: "2026-08-26", sourceId: "websearch:daily-tips",
  items: catalogTruthInput.titel.slice(1, 21).map((entry, index) => ({
    recordId: `webtip:${(index + 1).toString(16).padStart(16, "0")}`,
    title: entry.titel,
    mediaType: entry.typ === "tv_series" ? "series" : "film",
    releaseYear: entry.jahr,
    attributes: { genres: index < 14 ? ["drama"] : ["komödie"], tags: [] },
    evidence: [{
      domain: index % 2 === 0 ? "www.derstandard.at" : "www.film.at",
      url: index % 2 === 0
        ? `https://www.derstandard.at/story/tipp-${index + 1}`
        : `https://www.film.at/streaming/tipp-${index + 1}`,
      publishedOn: "2026-08-19", retrievedOn: "2026-08-20",
      positiveRecommendation: true,
    }],
    rank: index + 1,
  })),
};
const dailyInput = {
  streamingEntdecken: catalogTruthInput, profile: profileInput, master: [],
  selectedServices: ["Testdienst"], webDiscoveryFeed,
};
const stableSelection = createEntdeckenRecommendations({ ...dailyInput, dailyVariety: false, selectionDay: "2026-08-20" });
check("Persönliche Passung zeigt sechs verfügbare, ungesehene Titel in Passungsreihenfolge", () => {
  assert.equal(stableSelection.personal.length, 6);
  assert.ok(stableSelection.personal.every((entry) => entry.services.includes("Testdienst")
    && entry.reasons.some((reason) => /^Profil:/.test(reason))));
  assert.equal(new Set(stableSelection.personal.map((entry) => entry.targetId)).size, 6);
});
check("Explizit gesehene Titel bleiben aus persönlicher und weiterer Auswahl", () => {
  const seenTitle = catalogTruthInput.titel.find((entry) => entry.watchmode_id === 92)?.titel;
  const result = createEntdeckenRecommendations({
    ...dailyInput, entdeckenStatus: { 92: "gesehen" }, selectionDay: "2026-08-20",
  });
  const visible = [...result.personal, ...result.further];
  assert.ok(!visible.some((entry) => entry.targetId === "watchmode:92"));
  assert.ok(!visible.some((entry) => entry.title === seenTitle));

  const withoutCurrentAvailability = createEntdeckenRecommendations({
    ...dailyInput,
    streamingEntdecken: {
      ...catalogTruthInput,
      titel: catalogTruthInput.titel.filter((entry) => entry.watchmode_id !== 92),
    },
    entdeckenStatus: { 92: "gesehen" },
    webDiscoveryFeed: {
      ...webDiscoveryFeed,
      format: 4,
      feedId: "websearch:weekly-positive-at",
      sourceId: "websearch:weekly-positive",
      isoWeek: "2026-W34",
      validUntil: "2026-08-23",
      items: webDiscoveryFeed.items.map((item, index) => ({
        ...item,
        externalIds: { watchmode: String(92 + index) },
        attributes: { genres: item.attributes.genres, tones: [], themes: [] },
      })),
    },
    selectionDay: "2026-08-20",
  });
  assert.ok(![...withoutCurrentAvailability.personal, ...withoutCurrentAvailability.further]
    .some((entry) => entry.title === seenTitle));
});
check("Ein bloßer Mediathek-Eintrag bleibt auffindbar, eine vollständige Bewertung gilt als Sehbeleg", () => {
  const known = {
    region: "AT", titel: [
      { watchmode_id: 801, titel: "Synthetisch ungesehen", jahr: 2026, typ: "movie", dienste: ["Testdienst"], genre: ["drama"] },
      { watchmode_id: 802, titel: "Synthetisch gesehen", jahr: 2026, typ: "movie", dienste: ["Testdienst"], genre: ["drama"] },
    ],
  };
  const knownFeed = {
    ...webDiscoveryFeed,
    items: known.titel.map((entry, index) => ({
      ...webDiscoveryFeed.items[index],
      recordId: `webtip:${(240 + index).toString(16).padStart(16, "0")}`,
      title: entry.titel,
      mediaType: "film",
      releaseYear: entry.jahr,
      attributes: { genres: ["drama"], tags: [] },
      rank: index + 1,
    })),
  };
  const result = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] }, streamingKnown: known,
    profile: profileInput, selectedServices: ["Testdienst"], selectionDay: "2026-08-20",
    webDiscoveryFeed: knownFeed,
    master: [
      { watchmode_id: 801, titel: "Synthetisch ungesehen", bewertung: null, genre: ["drama"] },
      { watchmode_id: 802, titel: "Synthetisch gesehen", bewertung: { wie: 4, was: 3, warum: 3 }, genre: ["drama"] },
    ],
  });
  assert.deepEqual(result.personal.map((entry) => entry.targetId), ["watchmode:801"]);
});
check("Weitere Entdeckungen stammen nur aus positiv belegten Webfunden und nicht aus dem Streaming-Anfang", () => {
  assert.equal(stableSelection.further.length, 1);
  assert.equal(stableSelection.personal.length + stableSelection.further.length, 7);
  assert.ok(stableSelection.further.every((entry) => entry.externalEvidence.length > 0
    && !stableSelection.personal.some((personal) => personal.targetId === entry.targetId)));
  const catalogCandidates = localRecommendationCandidates(catalogTruthInput, { selectedServices: ["Testdienst"] });
  const invalid = webDiscoveryCandidates({
    webDiscoveryFeed: { ...webDiscoveryFeed, items: [{ ...webDiscoveryFeed.items[0], evidence: [] }] },
    catalogCandidates,
  });
  assert.deepEqual(invalid, []);
});
check("Ein Webtipp ohne lokales Profilsignal bleibt in Weitere statt Für mich", () => {
  const scoreOnlyItem = webDiscoveryFeed.items.find((entry) => entry.attributes.genres.includes("komödie"));
  const targetId = `watchmode:${catalogTruthInput.titel.find((entry) => entry.titel === scoreOnlyItem.title).watchmode_id}`;
  const result = createEntdeckenRecommendations({
    streamingEntdecken: catalogTruthInput, profile: profileInput, master: [],
    selectedServices: ["Testdienst"], selectionDay: "2026-08-20",
    webDiscoveryFeed: { ...webDiscoveryFeed, items: [scoreOnlyItem] },
  });
  assert.ok(!result.personal.some((entry) => entry.targetId === targetId));
  assert.ok(result.further.some((entry) => entry.targetId === targetId));
});
check("Tägliche Abwechslung ist am selben Tag stabil, wechselt zwischen Tagen und bewahrt den Passungsrang", () => {
  const ranked = Array.from({ length: 20 }, (_, index) => ({ targetId: `ranked:${index}`, rank: index }));
  const dayA = selectDailyRecommendations(ranked, { dailyVariety: true, selectionDay: "2026-08-20" });
  const dayARepeat = selectDailyRecommendations(ranked, { dailyVariety: true, selectionDay: "2026-08-20" });
  const dayB = selectDailyRecommendations(ranked, { dailyVariety: true, selectionDay: "2026-08-21" });
  assert.deepEqual(dayA, dayARepeat);
  assert.notDeepEqual(dayA.map((entry) => entry.targetId), dayB.map((entry) => entry.targetId));
  assert.deepEqual(dayA.map((entry) => entry.rank), [...dayA.map((entry) => entry.rank)].sort((a, b) => a - b));
  assert.equal(shouldRefreshWebDiscovery("2026-08-20", "2026-08-20"), false);
  assert.equal(shouldRefreshWebDiscovery("2026-08-20", "2026-08-21"), false);
  assert.equal(shouldRefreshWebDiscovery("2026-08-20", "2026-08-24"), true);
});

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const appNavigation = fs.readFileSync(path.join(wurzel, "src/components/AppNavigation.jsx"), "utf8");
const appSource = fs.readFileSync(path.join(wurzel, "src/App.jsx"), "utf8");
const datenSource = fs.readFileSync(path.join(wurzel, "src/tabs/DatenTab.jsx"), "utf8");
const entdeckenSource = fs.readFileSync(path.join(wurzel, "src/tabs/EntdeckenTab.jsx"), "utf8");
const entdeckenUiSource = fs.readFileSync(path.join(wurzel, "src/lib/entdeckenUi.js"), "utf8");
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
});
check("Tägliche Abwechslung ist eine persistierte Einstellung ohne Timer- oder Netzwerk-Loop", () => {
  assert.match(datenSource, /Täglich neue Entdecken-Auswahl/);
  assert.match(datenSource, /setzeEinstellung\("entdeckenTaeglich"/);
  assert.match(appSource, /dailyVariety=\{einstellungen\.entdeckenTaeglich === true\}/);
  assert.doesNotMatch(entdeckenUiSource, /fetch\s*\(|setInterval\s*\(|setTimeout\s*\(/);
});

async function loadEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}

const cacheDir = process.env.KD_ENTDECKEN_TEST_TMPDIR
  ? path.resolve(process.env.KD_ENTDECKEN_TEST_TMPDIR)
  : path.join(wurzel, ".tmp");
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
    assert.match(dialog.textContent, /Noch kein Ziel im Radar/);
    assert.doesNotMatch(dialog.textContent, /Pilot|Fixture|Proposal|Hash|Outbox|watchmode:/i);
    assert.equal(document.body.classList.contains("kd-scroll-gesperrt"), true);
  });
  await act(() => {
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await tick();
  check("Escape schließt die Verwaltung und gibt den Fokus zurück", () => {
    assert.equal(document.querySelector('[aria-labelledby="kd-entdecken-manage-title"]'), null);
    assert.equal(document.body.classList.contains("kd-scroll-gesperrt"), false);
    assert.equal(document.activeElement, manageTrigger);
  });
  await ui.cleanup();

  localStorage.setItem("kd:geschmacksprofil", JSON.stringify({
    format: 1, version: "p1", erstellt: null, geaendert: null, einwilligung: null,
    signale: [{ art: "genre", wert: "drama", richtung: "zieht_an", staerke: 4,
      sicherheit: "hoch", quelle: "schlagwort", beleg: "schlagwort:drama" }],
    offen: [], achsen: { wie: null, was: null, warum: null }, filme: [], nichtDeutbar: [],
  }));
  const catalogUi = await mount(EntdeckenTab, {
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: catalogTruthInput,
    selectedServices: ["Testdienst"], webDiscoveryFeed, calendarDay: "2026-08-20",
  });
  await act(async () => { await tick(); await tick(); });
  check("Entdecken zeigt kompakt sechs persönliche Passungen statt Mengenerklärung", () => {
    const personal = catalogUi.container.querySelector('[aria-labelledby="kd-entdecken-empfehlungen"]');
    const beforeFurther = [...personal.children].filter((element) => element.matches(".kd-entdecken-karten"))[0];
    assert.match(personal?.textContent || "", /Persönliche Passung/);
    assert.equal(beforeFurther?.querySelectorAll(".kd-entdecken-hub-karte").length, 6);
    assert.doesNotMatch(personal?.textContent || "", /Kataloggröße|Aktuelle Treffermenge|Kein LLM|Profil-Write/);
    assert.ok([...beforeFurther.querySelectorAll(".kd-entdecken-hub-karte")]
      .every((card) => !card.querySelector("ul") && /Profil:/.test(card.textContent)));
  });
  check("Diese Woche beliebt zeigt ausschließlich belegte Webtipps mit Quellenlink", () => {
    const section = catalogUi.container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
    const cards = [...(section?.querySelectorAll(".kd-entdecken-neutral") || [])];
    assert.match(section?.textContent || "", /Diese Woche beliebt/);
    assert.equal(cards.length, 1);
    assert.ok(cards.every((card) => {
      const link = card.querySelector('a[href^="https://"]');
      return link && /^(?:www\.)?(?:derstandard\.at|film\.at)$/.test(new URL(link.href).hostname)
        && /Quelle ansehen/.test(card.textContent);
    }));
  });
  await catalogUi.cleanup();
  localStorage.removeItem("kd:geschmacksprofil");

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
  const savedTextTargets = [];
  const workPicker = await mount(EntdeckenTab, {
    ...baseProps, radarState: createEmptyLocalRadar(),
    onRadarTextAdd: async (targetText) => {
      savedTextTargets.push(targetText);
      return { status: "active", writes: 1 };
    },
  });
  await act(async () => { button(workPicker.container, "Radar").click(); await tick(); });
  check("Radar öffnet genau ein leeres Suchfeld ohne Vollkatalog-Select oder Fehler", () => {
    assert.equal(workPicker.container.querySelectorAll("#kd-radar-target-search").length, 1);
    assert.equal(workPicker.container.querySelectorAll(".kd-radar-zielsuche select").length, 0);
    assert.equal(workPicker.container.querySelectorAll(".kd-radar-zieltreffer li").length, 0);
    assert.doesNotMatch(workPicker.container.textContent, /nicht verfügbar|Werk hinzufügen/i);
  });
  await setControl(workPicker.container.querySelector("#kd-radar-target-search"), "Passender Film");
  await act(async () => {
    button(workPicker.container, "Im Radar speichern").click();
    await tick();
  });
  check("Radar speichert den unveränderten Freitext ohne lokalen Katalogpicker", () => {
    assert.deepEqual(savedTextTargets, ["Passender Film"]);
    assert.equal(workPicker.container.querySelectorAll('[data-radar-target-kind]').length, 0);
    assert.doesNotMatch(workPicker.container.innerHTML, /watchmode:91|fixture:|work:/i);
  });
  await workPicker.cleanup();

  let previewConfirmed = 0;
  const preview = await mount(RadarSubscriptionPreview, {
    target: workTarget, radarState: createEmptyLocalRadar(), accountMode: false,
    onConfirm: async () => { previewConfirmed += 1; return true; }, onClose() {},
  });
  check("Radarziel entsteht erst nach expliziter Bestätigung", () => {
    assert.equal(previewConfirmed, 0);
    assert.equal(document.querySelector('.kd-radar-preview input[type="checkbox"]').disabled, true);
  });
  await act(async () => { button(document, "Ins Radar bestätigen").click(); await tick(); });
  check("Bestätigung ruft genau einen gekapselten Write auf", () => assert.equal(previewConfirmed, 1));
  await preview.cleanup();

  const checksum = "a".repeat(64);
  const now = "2026-08-18T10:00:00.000Z";
  const eventId = "00000000-0000-4000-8000-000000000001";
  const eventVersionId = "00000000-0000-4000-8000-000000000011";
  const feed = (events = []) => ({
    format: "kd-radar-pilot-feed-v1", revision: 1, checksum, reconciledAt: now,
    subscriptions: [{
      targetId: workTarget.targetId, targetType: "work", title: workTarget.title,
      region: "AT", scope: "all", status: "active", updatedAt: now,
    }],
    events, receipts: [], operationAcks: [], radarReview: true,
  });
  let accountState = reconcileAccountRadarPilotFeed(createEmptyLocalRadar({ authority: "account-cache" }), feed()).state;
  const renderWorkProps = () => ({
    ...baseProps, accountMode: true, radarState: accountState,
    radarPilotEvents: accountState.pilot.events,
  });
  const workUi = await mount(EntdeckenTab, renderWorkProps());
  await act(async () => { button(workUi.container, "Radar").click(); await tick(); });
  check("Kontoradar erklärt den täglichen Lauf und bietet keinen manuellen Prüfknopf", () => {
    assert.match(workUi.container.textContent, /täglicher automatischer Lauf prüft/i);
    assert.match(workUi.container.textContent, /Tagesaktuelle Neuigkeiten/);
    assert.equal(button(workUi.container, "Jetzt prüfen"), undefined);
  });
  const confirmedEvent = {
    eventId, eventVersionId, targetId: workTarget.targetId, eventType: "kinostart_at", date: "2026-09-03",
    region: "AT", platform: "-", lifecycleStatus: "scheduled", verificationStatus: "confirmed",
    evidence: [{ sourceId: "film-at", sourceDomain: "film.at", url: "https://film.at/start", retrievedAt: now }],
  };
  accountState = reconcileAccountRadarPilotFeed(accountState, feed([confirmedEvent])).state;
  await workUi.render(renderWorkProps());
  check("Bestätigter Film-Treffer zeigt Titel, Datum und Quelle", () => {
    assert.match(workUi.container.textContent, /Passender Film/);
    assert.match(workUi.container.textContent, /2026-09-03/);
    assert.match(workUi.container.textContent, /Kinostart in Österreich/);
    assert.equal(workUi.container.querySelector("a")?.textContent, "film.at");
  });
  const accountReload = decodeLocalRadar(JSON.stringify(accountState), { authority: "account-cache" });
  assert.equal(accountReload.ok, true);
  await workUi.cleanup();
  const workReloadUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: accountReload.state,
    radarPilotEvents: accountReload.state.pilot.events,
  });
  await act(async () => { button(workReloadUi.container, "Radar").click(); await tick(); });
  check("Film-Titel und validiertes Feed-Ereignis bleiben nach Reload sichtbar", () => {
    assert.match(workReloadUi.container.textContent, /Passender Film/);
    assert.match(workReloadUi.container.textContent, /2026-09-03/);
    assert.doesNotMatch(workReloadUi.container.textContent, /watchmode:|fixture:|work:/i);
  });
  await workReloadUi.cleanup();

  const identity = { personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor", canonical: true };
  const personCatalog = [{ targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023 }];
  let personState = upsertGuestPersonRadarSubscription(
    createEmptyLocalRadar(), { identity, now },
  ).state;
  let personUi;
  const renderPersonProps = () => ({
    ...baseProps, radarState: personState,
  });
  personUi = await mount(EntdeckenTab, renderPersonProps());
  await act(async () => { button(personUi.container, "Radar").click(); await tick(); });
  check("Bestehende Person bleibt mit Name und Rolle, aber ohne Roh-ID sichtbar", () => {
    assert.match(personUi.container.textContent, /Nicolas Cage/);
    assert.match(personUi.container.textContent, /Schauspiel · Aktiv/);
    assert.doesNotMatch(personUi.container.innerHTML, /wikidata:Q42869/);
    assert.equal(button(personUi.container, "Jetzt prüfen"), undefined);
  });
  const personResponse = {
    status: "confirmed", checkedAt: "2026-08-18T10:01:00.000Z",
    windowStart: "2026-08-18", windowEnd: "2026-08-24", person: identity,
    candidates: [{
      targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023,
      role: "actor", eventType: "kinostart_at", date: "2026-08-21", region: "AT", platform: "-",
      evidence: [{ sourceId: "news-a", sourceDomain: "news-a.example",
        url: "https://news-a.example/dream-scenario", retrievedAt: "2026-08-18T10:00:00.000Z" }],
    }],
  };
  const applied = applyPersonRadarCheckResult(personState, { identity, response: personResponse, catalog: personCatalog });
  assert.equal(applied.ok, true);
  personState = applied.state;
  await personUi.render(renderPersonProps());
  check("Validierter Personen-Treffer bleibt Vorschlag ohne Film-Abo", () => {
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
  check("Person, Rolle und Treffer überstehen Reload ohne irreführenden Suchfehler", () => {
    assert.match(personReloadUi.container.textContent, /Nicolas Cage/);
    assert.match(personReloadUi.container.textContent, /Schauspiel/);
    assert.match(personReloadUi.container.textContent, /Dream Scenario/);
    assert.doesNotMatch(personReloadUi.container.textContent, /Suche ist derzeit nicht verfügbar|Personensuche ist derzeit nicht verfügbar/);
    assert.doesNotMatch(personReloadUi.container.textContent, /wikidata:|watchmode:|fixture:|Proposal|Hash|Outbox|Pilot/i);
  });
  await personReloadUi.cleanup();

  const savedFranchiseTexts = [];
  const franchiseUi = await mount(EntdeckenTab, {
    ...baseProps, radarState: createEmptyLocalRadar(),
    onRadarTextAdd: async (targetText) => {
      savedFranchiseTexts.push(targetText);
      return { status: "active", writes: 1 };
    },
  });
  await act(async () => { button(franchiseUi.container, "Radar").click(); await tick(); });
  await setControl(franchiseUi.container.querySelector("#kd-radar-target-search"), "Star Wars");
  await act(async () => {
    button(franchiseUi.container, "Im Radar speichern").click();
    await tick();
  });
  check("Reihenname bleibt Freitext und erzeugt keine zweite Zielauflösung", () => {
    assert.deepEqual(savedFranchiseTexts, ["Star Wars"]);
    assert.match(franchiseUi.container.textContent, /Ziel gespeichert/);
    assert.doesNotMatch(franchiseUi.container.innerHTML, /wikidata:Q462|title-group:v1:star-wars/);
  });
  await franchiseUi.cleanup();

  let forbiddenManualCalls = 0;
  const automaticUi = await mount(EntdeckenTab, {
    ...baseProps,
    radarState: upsertGuestRadarSubscription(createEmptyLocalRadar(), {
      target: workTarget, now,
    }).state,
    onRadarWebsearchCheck: async () => { forbiddenManualCalls += 1; },
  });
  await act(async () => { button(automaticUi.container, "Radar").click(); await tick(); });
  check("Auch ein injizierter alter Prüfhandler ist über die Oberfläche nicht erreichbar", () => {
    assert.equal(forbiddenManualCalls, 0);
    assert.equal(button(automaticUi.container, "Jetzt prüfen"), undefined);
    assert.match(automaticUi.container.textContent, /automatische tägliche Prüfung ist im Kontomodus verfügbar/i);
  });
  await automaticUi.cleanup();
} finally {
  if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  if (dom) dom.window.close();
}

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("ENTDECKEN-PHASE3-TEST BESTANDEN");
