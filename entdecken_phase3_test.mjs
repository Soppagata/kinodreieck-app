/* Entdecken/Radar: lokale Verträge plus echte React-/JSDOM-Oberfläche.
   Kein Netz, kein Provider, keine KI, keine Migration. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  ENTDECKEN_MARKET_POOL_50,
  VERSIONED_DISCOVERY_SEGMENT_COUNTS,
  VERSIONED_DISCOVERY_SOURCE_COUNTS,
} from "./src/data/entdeckenMarketPool50.js";
import {
  createCatalogSearchActions,
  createEntdeckenRecommendations,
  localRecommendationCandidates,
  radarSubscriptionForEvent,
  radarSyncProblem,
  rankLocalEntdeckenRecommendations,
  selectDailyRecommendations,
  shouldRefreshWebDiscovery,
  webDiscoveryCandidates,
} from "./src/lib/entdeckenUi.js";
import {
  createEntdeckenPin,
  isEntdeckenPinned,
  resolveEntdeckenPins,
  toggleEntdeckenPin,
} from "./src/lib/entdeckenPins.js";
import {
  applyPersonRadarCheckResult,
  acknowledgeAccountRadarPilotSubscription,
  createEmptyLocalRadar,
  decodeLocalRadar,
  queueAccountPersonRadarChange,
  rejectAccountRadarChange,
  reconcileAccountRadarPilotFeed,
  upsertGuestPersonRadarSubscription,
  upsertGuestRadarSubscription,
} from "./src/lib/localEventRadar.js";
import {
  RADAR_TARGET_SEARCH_MAX_RESULTS,
  searchRadarTargets,
} from "./src/lib/radarTargetSearch.js";
import { validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";
import { createEntdeckenDailyFeedService } from "./src/services/entdeckenDailyFeed.js";
import { radarViennaDay } from "./src/lib/radarNews.js";
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
check("Produktlogik enthaelt keine eingebauten Personen- oder Reihenbeispiele", () => {
  const person = searchRadarTargets({ query: "Nicolas", personAvailable: true });
  assert.deepEqual(person.entries, []);
  const franchise = searchRadarTargets({ query: "Star Wars", franchiseAvailable: true });
  assert.deepEqual(franchise.entries, []);
});

const pinTitel = { targetId: "watchmode:4711", watchmodeId: 4711, title: "Pin Film", year: 2026, type: "film" };
const pin = createEntdeckenPin(pinTitel, 1234);
check("Empfehlungspin schaltet mit stabilem, barrierefrei abfragbarem Zustand an und aus", () => {
  const an = toggleEntdeckenPin([], pinTitel, 1234);
  assert.equal(an.length, 1);
  assert.equal(isEntdeckenPinned(an, pinTitel), true);
  assert.deepEqual(toggleEntdeckenPin(an, pinTitel, 1234), []);
});
check("Empfehlungspin bleibt beim Refresh über den eindeutigen Streaming-Eintrag erreichbar", () => {
  const result = resolveEntdeckenPins([pin], {
    recommendations: [],
    streaming: [{ watchmode_id: 4711, titel: "Pin Film", jahr: 2026, typ: "movie", dienste: ["Testdienst"] }],
    cinema: [], recommendationReady: true, streamingReady: true, cinemaReady: true,
  });
  assert.equal(result.resolved[0]?.destination, "streaming");
  assert.equal(result.resolved[0]?.target.ref, 4711);
  assert.deepEqual(result.discardedPinIds, []);
});
check("Eine neue Feed-Record-ID desselben eindeutigen Titels löst den Pin weiterhin nach Entdecken auf", () => {
  const sourcePin = createEntdeckenPin({
    title: "Feed Pin", year: 2026, type: "film", sourceId: "quelle:a", sourceItemId: "alt",
  }, 1234);
  const result = resolveEntdeckenPins([sourcePin], {
    recommendations: [{
      title: "Feed Pin", year: 2026, type: "film", sourceId: "quelle:a", sourceItemId: "neu",
    }], recommendationReady: true,
  });
  assert.equal(result.resolved[0]?.destination, "entdecken");
  assert.deepEqual(result.discardedPinIds, []);
});
check("Empfehlungspin fällt nach dem Refresh eindeutig auf den Kinoprogramm-Eintrag zurück", () => {
  const cinemaPin = createEntdeckenPin({ title: "Kino Pin", year: 2026, type: "film" }, 1234);
  const result = resolveEntdeckenPins([cinemaPin], {
    recommendations: [], streaming: [],
    cinema: [{ titel: "Kino Pin", jahr: 2026, type: "film", programm_ref: "film-at-17" }],
    recommendationReady: true, streamingReady: true, cinemaReady: true,
  });
  assert.equal(result.resolved[0]?.destination, "kino");
  assert.equal(result.resolved[0]?.target.programm_ref, "film-at-17");
});
check("Nicht mehr vorhandene und mehrdeutige Pins verschwinden still statt geraten zu werden", () => {
  const stale = resolveEntdeckenPins([pin], {
    recommendations: [], streaming: [], cinema: [],
    recommendationReady: true, streamingReady: true, cinemaReady: true,
  });
  assert.deepEqual(stale.discardedPinIds, [pin.pinId]);
  const ambiguousPin = createEntdeckenPin({ title: "Doppel", year: 2026, type: "film" }, 1234);
  const ambiguous = resolveEntdeckenPins([ambiguousPin], {
    recommendations: [], streaming: [
      { watchmode_id: 1, titel: "Doppel", jahr: 2026, typ: "movie" },
      { watchmode_id: 2, titel: "Doppel", jahr: 2026, typ: "movie" },
    ], cinema: [], recommendationReady: true, streamingReady: true, cinemaReady: true,
  });
  assert.deepEqual(ambiguous.resolved, []);
  assert.deepEqual(ambiguous.discardedPinIds, [ambiguousPin.pinId]);
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
const mixedDiscoveryFeed = {
  format: 6,
  feedId: "public:weekly-market-mix-at",
  region: "AT",
  sourceId: "chart:market-mix-at",
  sourceIds: ["chart:joyn-at", "chart:oefi-weekend-at"],
  isoWeek: "2026-W35",
  refreshedOn: "2026-08-27",
  validUntil: "2026-09-02",
  items: [
    ...Array.from({ length: 15 }, (_, index) => ({
      title: `Synthetischer Kinotitel ${String(index + 1).padStart(2, "0")}`,
      sourceItemId: `f_oefi-${String(index + 1).padStart(2, "0")}`,
      sourceId: "chart:oefi-weekend-at",
      sourceLabel: "Österreichisches Filminstitut",
      mediaType: "film",
      genres: [],
      availability: { region: "AT", market: "cinema", service: null, licenseTypes: [] },
      popularity: { metric: "weekend-admissions", rank: index + 1, measuredOn: "2026-08-23", value: 10_000 - index },
      sourceUrl: "https://filminstitut.at/charts",
      fetchedAt: "2026-08-27T07:30:00.000Z",
    })),
    ...Array.from({ length: 18 }, (_, index) => ({
      title: `Synthetischer Streamingfilm ${String(index + 1).padStart(2, "0")}`,
      sourceItemId: `f_joyn-film-${String(index + 1).padStart(2, "0")}`,
      sourceId: "chart:joyn-at",
      sourceLabel: "Joyn Österreich",
      mediaType: "film",
      genres: ["Drama"],
      availability: { region: "AT", market: "streaming", service: "Joyn", licenseTypes: ["SVOD"] },
      popularity: { metric: "source-chart-rank", rank: index + 1, measuredOn: "2026-08-27", value: null },
      sourceUrl: `https://www.joyn.at/filme/testfilm-${index + 1}`,
      fetchedAt: "2026-08-27T07:30:00.000Z",
    })),
    ...Array.from({ length: 17 }, (_, index) => ({
      title: `Synthetische Streamingserie ${String(index + 1).padStart(2, "0")}`,
      sourceItemId: `s_joyn-serie-${String(index + 1).padStart(2, "0")}`,
      sourceId: "chart:joyn-at",
      sourceLabel: "Joyn Österreich",
      mediaType: "series",
      genres: ["Drama"],
      availability: { region: "AT", market: "streaming", service: "Joyn", licenseTypes: ["SVOD"] },
      popularity: { metric: "source-chart-rank", rank: index + 1, measuredOn: "2026-08-27", value: null },
      sourceUrl: `https://www.joyn.at/serien/testserie-${index + 1}`,
      fetchedAt: "2026-08-27T07:30:00.000Z",
    })),
  ],
  annotations: [],
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
const kinoSource = fs.readFileSync(path.join(wurzel, "src/tabs/KinoTab.jsx"), "utf8");
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
check("Radar bleibt bei 393 CSS-Pixel einspaltig, umbruchfest und mit 44-Pixel-Aktionen", () => {
  assert.match(cssSource, /@media \(max-width:760px\)[\s\S]*\.kd-entdecken-radar-grid[\s\S]*grid-template-columns:1fr/);
  assert.match(cssSource, /\.kd-radar-ablehnungen li[^}]*overflow-wrap:anywhere/);
  assert.match(cssSource, /\.kd-entdecken-panel li>\.kd-entdecken-sekundaer[^}]*min-height:44px/);
});
check("Tägliche Abwechslung ist eine persistierte Einstellung ohne Timer- oder Netzwerk-Loop", () => {
  assert.match(datenSource, /Täglich neue Entdecken-Auswahl/);
  assert.match(datenSource, /setzeEinstellung\("entdeckenTaeglich"/);
  assert.match(appSource, /dailyVariety=\{einstellungen\.entdeckenTaeglich === true\}/);
  assert.doesNotMatch(entdeckenUiSource, /fetch\s*\(|setInterval\s*\(|setTimeout\s*\(/);
});
check("Empfehlungen übernehmen ausschließlich die echten Kino-Stile und keine Kino-Funktionen", () => {
  assert.match(cssSource, /\.kd-dash-ticket[^}]*background:var\(--kd-leinwand\)[^}]*border-radius:8px[^}]*box-shadow:\s*0 3px 14px rgba\(0,0,0,\.4\)/);
  assert.match(cssSource, /\.kd-dash-film[^}]*font-family:\s*'Fraunces'[^}]*font-weight:\s*900[^}]*font-size:\s*20px[^}]*line-height:\s*1\.05/);
  assert.match(cssSource, /\.kd-entdecken-auswahlkarte[^}]*padding:11px 58px 11px 13px[^}]*border-radius:8px[^}]*background:var\(--leinwand[^}]*box-shadow:0 3px 14px rgba\(0,0,0,\.4\)/);
  assert.match(cssSource, /\.kd-entdecken-auswahlkarte h3[^}]*font:900 20px\/1\.05 'Fraunces'/);
  assert.match(kinoSource, /background:\s*T\.saalHoch, borderRadius:\s*6, padding:\s*"8px 12px"/);
  assert.match(cssSource, /\.kd-entdecken-beliebtliste \.kd-entdecken-neutral[^}]*padding:8px 12px[^}]*border-radius:6px[^}]*background:var\(--saalHoch/);
  assert.match(cssSource, /\.kd-entdecken-beliebtliste \.kd-entdecken-neutral h3[^}]*font:600 14px\/1\.3 'Space Grotesk'/);
  assert.doesNotMatch(entdeckenSource, /kd-kino-ticket|kd-dash-showtime|<KinoTicket|<KinoLinks|kd-quellenbadge/);
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
        'export { StartTab } from "./src/tabs/StartTab.jsx";',
        'export { RadarSubscriptionPreview } from "./src/components/RadarSubscriptionPreview.jsx";',
      ].join("\n"),
      loader: "js", resolveDir: wurzel,
    },
    bundle: true, format: "esm", outfile: output, jsx: "automatic", target: "es2022", logLevel: "warning",
    define: { "import.meta.env.BASE_URL": '"/"' },
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });
  const { EntdeckenTab, StartTab, RadarSubscriptionPreview } = await import(output);

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
    accountMode: false, radarAvailable: true,
    onObserveToggle() {}, onRadarChange() {}, onRadarPreview() {}, onShareChange() {},
  };

  const unavailableRadarUi = await mount(EntdeckenTab, {
    ...baseProps, radarAvailable: false, radarState: createEmptyLocalRadar(),
  });
  check("Fehlende Radar-Laufzeitfähigkeit entfernt Tab und Verwaltungs-Einstieg", () => {
    assert.deepEqual([...unavailableRadarUi.container.querySelectorAll('[role="tab"]')]
      .map((entry) => entry.textContent), ["Empfehlungen", "Blog"]);
  });
  await act(async () => {
    unavailableRadarUi.container.querySelector('button[aria-label="Entdecken verwalten"]').click();
    await tick();
  });
  check("Verwaltung bietet ohne Runtime-Capability kein sichtbares Radar an", () => {
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="kd-entdecken-manage-title"]');
    assert.ok(dialog);
    assert.doesNotMatch(dialog.textContent, /Mein Radar|Im Radar|Aus dem Radar/u);
  });
  await unavailableRadarUi.cleanup();

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
    assert.ok(beforeFurther?.classList.contains("kd-entdecken-auswahlkarten"));
    assert.ok(beforeFurther?.querySelector(".kd-entdecken-auswahlkarte"));
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

  const versionedCheck = validateWebDiscoveryFeed(ENTDECKEN_MARKET_POOL_50);
  check("Versionierter Staging-Pool hält exakt 50 deduplizierte Titel und den 15/10/10/10/5-Quellenmix", () => {
    assert.equal(versionedCheck.ok, true);
    assert.equal(versionedCheck.value.items.length, 50);
    assert.equal(new Set(versionedCheck.value.items.map((item) => item.title.toLocaleLowerCase("de-AT"))).size, 50);
    assert.deepEqual(Object.fromEntries(versionedCheck.value.sourceIds.map((sourceId) => [
      sourceId, versionedCheck.value.items.filter((item) => item.sourceId === sourceId).length,
    ])), VERSIONED_DISCOVERY_SOURCE_COUNTS);
    assert.deepEqual({
      cinema: versionedCheck.value.items.filter((item) => item.sourceId === "chart:oefi-weekend-at").length,
      netflixFilm: versionedCheck.value.items.filter((item) => item.sourceId === "chart:netflix-weekly-at" && item.mediaType === "film").length,
      netflixSeries: versionedCheck.value.items.filter((item) => item.sourceId === "chart:netflix-weekly-at" && item.mediaType === "series").length,
      primeFilm: versionedCheck.value.items.filter((item) => item.sourceId === "snapshot:prime-video-at" && item.mediaType === "film").length,
      primeSeries: versionedCheck.value.items.filter((item) => item.sourceId === "snapshot:prime-video-at" && item.mediaType === "series").length,
      disneyFilm: versionedCheck.value.items.filter((item) => item.sourceId === "snapshot:disney-plus-at" && item.mediaType === "film").length,
      disneySeries: versionedCheck.value.items.filter((item) => item.sourceId === "snapshot:disney-plus-at" && item.mediaType === "series").length,
      appleTotal: versionedCheck.value.items.filter((item) => item.sourceId === "snapshot:apple-tv-plus-at").length,
    }, VERSIONED_DISCOVERY_SEGMENT_COUNTS);
    assert.equal(versionedCheck.value.items.some((item) => /joyn/i.test(`${item.sourceId}|${item.sourceLabel}|${item.sourceUrl}`)), false);
  });

  let fallbackFetches = 0;
  const fallbackResult = await createEntdeckenDailyFeedService({
    fallbackFeed: ENTDECKEN_MARKET_POOL_50,
    currentDay: () => "2026-08-29",
    fetchImpl: async () => { fallbackFetches += 1; throw new Error("network-forbidden"); },
  }).load();
  check("Frontend-Fallback liefert den 50er-Pool ohne Runtime- oder Providerrequest", () => {
    assert.equal(fallbackResult.status, "fresh");
    assert.equal(fallbackResult.feed.items.length, 50);
    assert.equal(fallbackFetches, 0);
    assert.deepEqual(fallbackResult.refresh, {
      requested: false, mode: "read", status: "read_only", attemptCount: 0, maxAttempts: 1,
    });
  });

  const versionedRecommendations = createEntdeckenRecommendations({
    streamingEntdecken: { region: "AT", titel: [] },
    streamingKnown: { region: "AT", titel: [{
      watchmode_id: 9901, titel: "Reacher", typ: "tv_series", jahr: 2022,
      dienste: ["Prime Video"], genres: ["drama"],
    }] },
    selectedServices: ["Netflix"],
    master: [],
    profile: { signale: [{ art: "genre", wert: "drama", richtung: "zieht_an", staerke: 4 }] },
    webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
    selectionDay: "2026-08-29",
  });
  check("Für mich prüft alle 50, nutzt belegte Snapshot-Fakten und verändert den vollständigen Popularitätspool nicht", () => {
    assert.deepEqual(versionedRecommendations.diagnostics, {
      candidates: 50, metadata: 39, afterExclusions: 39,
      profileMatches: 5, visible: 5, duplicatesRemoved: 0,
    });
    assert.deepEqual(versionedRecommendations.personal.map((item) => item.title), [
      "Reacher", "Blood Sacrifice", "The Shards", "Sterling Point", "Facing El Chapo",
    ]);
    assert.equal(versionedRecommendations.personal[0].watchmodeId, 9901);
    assert.ok(versionedRecommendations.personal.every((item) => (
      item.reasons.includes("Profil: drama")
    )));
    assert.equal(versionedRecommendations.popular.length, 6);
    assert.equal(versionedRecommendations.popularPool.length, 50);
  });

  let angepinnterEintrag = null;
  const versionedProps = {
    ...baseProps, radarState: createEmptyLocalRadar(), streamingDiscover: { region: "AT", titel: [] },
    selectedServices: [], webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50, calendarDay: "2026-08-29",
    recommendationPins: [], onRecommendationPinToggle(entry) { angepinnterEintrag = entry; },
  };
  const versionedUi = await mount(EntdeckenTab, versionedProps);
  await act(async () => { await tick(); await tick(); });
  const versionedSection = versionedUi.container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
  const expandVersioned = button(versionedSection, "Weitere 44 Titel anzeigen");
  check("50er-UI startet unnummeriert mit sechs Karten, ehrlichem Stand und 44er-Ausklapper", () => {
    assert.equal(versionedSection.querySelectorAll(".kd-entdecken-neutral").length, 6);
    assert.equal(versionedSection.querySelector("ol"), null);
    assert.equal(expandVersioned?.getAttribute("aria-expanded"), "false");
    assert.match(versionedSection.textContent, /Prime-Video|Disney\+|Apple-TV\+/);
    assert.match(versionedSection.textContent, /Stand/);
  });
  const ersterPinKnopf = versionedSection.querySelector('button[aria-label$="am Pinboard anpinnen"]');
  await act(async () => { ersterPinKnopf.click(); await tick(); });
  const gesetztePins = toggleEntdeckenPin([], angepinnterEintrag, 1234);
  await versionedUi.render({ ...versionedProps, recommendationPins: gesetztePins });
  check("Echter Mock-Nutzerweg ersetzt Radar durch einen kompakten Pin mit gedrücktem Zustand", () => {
    assert.ok(angepinnterEintrag);
    assert.equal(versionedUi.container.querySelector(`button[aria-label="${angepinnterEintrag.title} vom Pinboard lösen"]`)?.getAttribute("aria-pressed"), "true");
    assert.doesNotMatch(versionedUi.container.textContent, /Ins Radar/i);
    assert.ok([...versionedUi.container.querySelectorAll("button")]
      .every((entry) => !/^(?:Beobachten|Beobachtet)$/.test(entry.textContent.trim())));
    assert.ok(versionedUi.container.querySelector(".kd-entdecken-beliebtliste"));
  });
  let pinboardSprung = null;
  const startUi = await mount(StartTab, {
    entdeckenPins: gesetztePins, webDiscoveryFeed: ENTDECKEN_MARKET_POOL_50,
    streamingEntdecken: { region: "AT", titel: [] }, streamingBekannt: { region: "AT", titel: [] },
    progStand: Date.now(), kinoMatches: { matched: [], rest: [] },
    wochenplan: { version: 1, eintraege: [] }, onWochenplanAendern() {},
    onSpringeZuEntdecken(target) { pinboardSprung = target; }, onEntdeckenPinsBereinigen() {},
  });
  await act(async () => { await tick(); });
  const pinboardEintrag = startUi.container.querySelector(".kd-pinboard-titel");
  await act(async () => { pinboardEintrag.click(); await tick(); });
  check("Der Pin erscheint im bestehenden Start-Pinboard und verweist zurück auf Entdecken", () => {
    assert.match(pinboardEintrag.textContent, new RegExp(angepinnterEintrag.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(pinboardEintrag.textContent, /Entdecken/);
    assert.equal(pinboardSprung?.pinId, gesetztePins[0].pinId);
  });
  await startUi.cleanup();
  await act(async () => { expandVersioned.click(); await tick(); });
  check("Ausgeklappt sind alle 50 Karten mit HTTPS-Quelllink sichtbar", () => {
    const cards = [...versionedSection.querySelectorAll(".kd-entdecken-neutral")];
    assert.equal(cards.length, 50);
    assert.equal(cards.filter((card) => card.querySelector('h3 > a[href^="https://"]')).length, 50);
    assert.equal(expandVersioned.textContent.trim(), "Weniger Titel anzeigen");
  });
  await versionedUi.cleanup();

  const mixedUi = await mount(EntdeckenTab, {
    ...baseProps, radarState: createEmptyLocalRadar(),
    streamingDiscover: { region: "AT", titel: [] }, selectedServices: ["Joyn"],
    webDiscoveryFeed: mixedDiscoveryFeed, calendarDay: "2026-08-27",
  });
  await act(async () => { await tick(); await tick(); });
  const mixedPopularSection = mixedUi.container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
  const expandPopular = button(mixedPopularSection, "Weitere 44 Titel anzeigen");
  check("Aktueller Marktmix startet kompakt und verlinkt jede sichtbare Titelüberschrift neutral", () => {
    const cards = [...mixedPopularSection.querySelectorAll(".kd-entdecken-neutral")];
    const links = cards.map((card) => card.querySelector("h3 > a.kd-entdecken-titellink"));
    assert.equal(cards.length, 6);
    assert.equal(links.filter(Boolean).length, 6);
    assert.ok(links.every((link) => link.target === "_blank"
      && link.getAttribute("rel") === "noopener noreferrer"
      && /Referenz bei/.test(link.getAttribute("aria-label") || "")));
    assert.equal(expandPopular?.getAttribute("aria-expanded"), "false");
    assert.doesNotMatch(mixedPopularSection.textContent, /Quelle ansehen|Bei Joyn ansehen/);
  });
  await act(async () => { expandPopular.click(); await tick(); });
  check("Restlicher 50er-Pool klappt vollständig auf und belegt den 15/35-Quellenvertrag", () => {
    const cards = [...mixedPopularSection.querySelectorAll(".kd-entdecken-neutral")];
    const links = cards.map((card) => card.querySelector("h3 > a.kd-entdecken-titellink"));
    const hosts = links.map((link) => new URL(link.href).hostname);
    assert.equal(cards.length, 50);
    assert.equal(links.filter(Boolean).length, 50);
    assert.equal(hosts.filter((host) => host === "filminstitut.at").length, 15);
    assert.equal(hosts.filter((host) => host === "www.joyn.at").length, 35);
    assert.equal(expandPopular.getAttribute("aria-expanded"), "true");
    assert.equal(expandPopular.textContent.trim(), "Weniger Titel anzeigen");
  });
  await mixedUi.cleanup();

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
    assert.doesNotMatch(workPicker.container.textContent, /Werk hinzufügen/i);
    assert.match(workPicker.container.textContent, /automatische Prüfung ist im Gastmodus nicht verfügbar/i);
  });
  await setControl(workPicker.container.querySelector("#kd-radar-target-search"), "Passender Film");
  await act(async () => {
    button(workPicker.container, "Ins Radar aufnehmen").click();
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
    assert.doesNotMatch(document.querySelector(".kd-radar-preview").textContent, /anonym|teilen|Von anderen entdeckt/i);
  });
  await act(async () => { button(document, "Ins Radar aufnehmen").click(); await tick(); });
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
  check("Kontoradar bleibt ohne bestätigte Fachverfügbarkeit ehrlich", () => {
    assert.match(workUi.container.textContent, /automatische Prüfung ist für dieses Konto derzeit nicht verfügbar/i);
    assert.match(workUi.container.textContent, /Neuigkeiten/);
    assert.equal(button(workUi.container, "Jetzt prüfen"), undefined);
  });
  const confirmedEvent = {
    eventId, eventVersionId, targetId: workTarget.targetId, title: "Passender Film",
    eventType: "kinostart_at", date: radarViennaDay(),
    region: "AT", platform: "-", lifecycleStatus: "scheduled", verificationStatus: "confirmed",
    evidence: [{ sourceId: "film-at", sourceDomain: "film.at", url: "https://film.at/start", retrievedAt: now }],
  };
  accountState = reconcileAccountRadarPilotFeed(accountState, feed([confirmedEvent])).state;
  await workUi.render(renderWorkProps());
  check("Bestätigter Film-Treffer zeigt nur Titel, Inhaltsdatum und Typ", () => {
    assert.match(workUi.container.textContent, /Passender Film/);
    assert.ok(workUi.container.textContent.includes(confirmedEvent.date));
    assert.match(workUi.container.textContent, /Film · Kinostart Österreich/);
    const news = [...workUi.container.querySelectorAll(".kd-entdecken-panel")]
      .find((entry) => entry.querySelector("h3")?.textContent === "Neuigkeiten");
    assert.equal(news.querySelectorAll("a").length, 0);
    assert.doesNotMatch(news.textContent, /film\.at|Quelle/);
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
    assert.ok(workReloadUi.container.textContent.includes(confirmedEvent.date));
    assert.doesNotMatch(workReloadUi.container.textContent, /watchmode:|fixture:|work:/i);
  });
  await workReloadUi.cleanup();

  const starWarsTarget = {
    targetId: "title-group:v1:star-wars", targetType: "franchise", targetStatus: "active",
    title: "Star Wars", canonical: true,
    titleGroup: {
      format: "kd-radar-title-group-v1", queryVersion: "title-group-query-v1",
      queryKey: "star wars", displayName: "Star Wars",
      members: [
        { targetId: "imdb:tt0076759", targetType: "work", title: "Star Wars", year: 1977 },
        { targetId: "imdb:tt12345678", targetType: "work", title: "Star Wars: Starfighter", year: 2027 },
      ],
    },
  };
  const starfighterEvent = {
    eventId: "00000000-0000-4000-8000-000000000021",
    eventVersionId: "00000000-0000-4000-8000-000000000022",
    targetId: "imdb:tt12345678",
    title: "Star Wars: Starfighter",
    eventType: "kinostart_at",
    date: radarViennaDay(),
    region: "AT",
    platform: "-",
    verificationStatus: "confirmed",
    evidence: [],
  };
  const targetFoundState = upsertGuestRadarSubscription(createEmptyLocalRadar(), {
    target: starWarsTarget,
    now,
  }).state;
  check("Abgeleiteter Reihenfund bindet über die starke Mitglieds-ID eindeutig an das Radarziel", () => {
    assert.equal(radarSubscriptionForEvent(starfighterEvent, targetFoundState.subscriptions)?.title, "Star Wars");
    assert.equal(radarSubscriptionForEvent({ ...starfighterEvent, targetId: "imdb:tt99999999" }, targetFoundState.subscriptions), null);
  });
  const targetFoundUi = await mount(EntdeckenTab, {
    ...baseProps,
    radarState: targetFoundState,
    radarPilotEvents: [starfighterEvent],
  });
  await act(async () => { button(targetFoundUi.container, "Radar").click(); await tick(); });
  check("Radar trennt abgeleiteten Fund und Suchziel ohne Zusatzmetadaten im Fund", () => {
    const targets = [...targetFoundUi.container.querySelectorAll(".kd-entdecken-panel")]
      .find((entry) => entry.querySelector("h3")?.textContent === "Meine Ziele");
    const news = [...targetFoundUi.container.querySelectorAll(".kd-entdecken-panel")]
      .find((entry) => entry.querySelector("h3")?.textContent === "Neuigkeiten");
    assert.match(targets.textContent, /Star Wars/);
    assert.doesNotMatch(targets.textContent, /Star Wars: Starfighter/);
    assert.match(news.textContent, /Star Wars: Starfighter/);
    assert.doesNotMatch(news.textContent, /Gefunden für:/);
    assert.equal(news.querySelectorAll("a,button").length, 0);
  });
  await targetFoundUi.cleanup();

  const episodeEvents = [6,2,5,3,4].map((number) => ({
    ...starfighterEvent, eventVersionId:`episode-${number}`, targetId:`release:v1:episode-${number}`,
    title:`Beispieldorf Staffel 29 Folge ${number}${number === 4 ? ": Nacht" : ""}`,
    category:"series",targetType:"series",seasonNumber:29,eventType:"staffelstart",
    date:`2099-09-0${number}`,platform:number === 3 ? "-" : "Beispiel+",region:"global",
  }));
  let detailRequests=0;
  const seasonUi=await mount(EntdeckenTab,{
    ...baseProps,accountMode:true,
    radarState:{...targetFoundState,pilot:{searchStatuses:[{
      targetId:starWarsTarget.targetId,status:"no_change",checkedAt:now,
    }]}},
    radarPilotEvents:episodeEvents,onRadarPilotSync:() => { detailRequests++; },
  });
  await act(async () => { button(seasonUi.container,"Radar").click(); await tick(); });
  check("Radar zeigt fünf Folgen als eine Staffelkarte mit nativer Detailsteuerung und Suchstatus",() => {
    const list=seasonUi.container.querySelector(".kd-radar-neuigkeiten");
    assert.equal(list.children.length,1);
    assert.match(list.firstElementChild.querySelector("strong").textContent,/Beispieldorf · Staffel 29/);
    assert.match(list.firstElementChild.querySelector("span").textContent,/2099-09-02 · Staffel · Nächste Folge/);
    assert.doesNotMatch(list.firstElementChild.querySelector("span").textContent,/Beispiel\+|Staffelstart/);
    assert.equal(list.querySelector("summary").textContent,"5 Folgen anzeigen");
    assert.equal(list.querySelectorAll("details ol li").length,5);
    assert.match(list.querySelector("details").textContent,/Folge 4 · Nacht/);
    assert.match(seasonUi.container.querySelector(".kd-radar-suchstatus").textContent,/Zuletzt gesucht.*keine neuen Treffer/);
  });
  await act(async () => { seasonUi.container.querySelector("summary").click(); await tick(); });
  check("Aufklappen bleibt requestfrei und zeigt Datum/optionale Plattform je Folge",() => {
    const details=seasonUi.container.querySelector("details");
    assert.equal(details.open,true); assert.equal(detailRequests,0);
    assert.match(details.querySelector("li").textContent,/Folge 2.*2099-09-02.*Beispiel\+/);
    assert.doesNotMatch(details.querySelectorAll("li")[1].textContent,/Beispiel\+|unknown/);
  });
  await seasonUi.cleanup();

  const RealDate=globalThis.Date;
  let radarClock="2099-09-05T21:59:59.000Z";
  let dayUi=null;
  try {
    globalThis.Date=class extends RealDate {
      constructor(...args){super(...(args.length?args:[radarClock]));}
      static now(){return new RealDate(radarClock).getTime();}
    };
    const stableEvents=[...episodeEvents,
      {...episodeEvents[0],eventVersionId:"premiere",title:"Beispieldorf Staffel 29",date:"2099-09-01"},
      {...starfighterEvent,eventVersionId:"old-film",title:"Vergangener Film",date:"2099-09-04"},
      {...starfighterEvent,eventVersionId:"today-film",title:"Film heute",date:"2099-09-05"},
      {...starfighterEvent,eventVersionId:"future-film",title:"Ferner Film",date:"2200-01-01"},
    ];
    const radarState={...targetFoundState,pilot:{searchStatuses:[{
      targetId:starWarsTarget.targetId,status:"no_change",checkedAt:now,
    }]}};
    const originalEvents=JSON.stringify(stableEvents),originalState=JSON.stringify(radarState);
    let dayRequests=0;
    const props={...baseProps,accountMode:true,radarState,radarPilotEvents:stableEvents,
      onRadarPilotSync:()=>{dayRequests++;},onRadarTextAdd:()=>{dayRequests++;}};
    dayUi=await mount(EntdeckenTab,props);
    await act(async()=>{button(dayUi.container,"Radar").click();await tick();});
    check("Wiener Tag blendet Altcache aus, lässt heute/ferne Zukunft und nur kommende Staffeldetails stehen",()=>{
      const news=dayUi.container.querySelector(".kd-radar-neuigkeiten");
      assert.equal(news.children.length,3);
      assert.match(news.textContent,/Film heute|Ferner Film/);
      assert.doesNotMatch(news.textContent,/Vergangener Film|2099-09-0[1234]|Staffelstart/);
      assert.equal(news.querySelector("summary").textContent,"2 Folgen anzeigen");
      assert.deepEqual([...news.querySelectorAll("details li strong")].map(node=>node.textContent),["Folge 5","Folge 6"]);
    });
    radarClock="2099-09-05T22:00:00.000Z";
    await dayUi.render(props);
    check("Identische Eventreferenz nach Wiener Mitternacht projiziert neu und hält letzte Folge gebündelt",()=>{
      const news=dayUi.container.querySelector(".kd-radar-neuigkeiten");
      assert.equal(news.children.length,2);
      assert.doesNotMatch(news.textContent,/Film heute|2099-09-05/);
      assert.match(news.textContent,/2099-09-06 · Staffel · Nächste Folge/);
      assert.equal(news.querySelector("summary").textContent,"1 Folge anzeigen");
      assert.equal(news.querySelectorAll("details li").length,1);
      assert.match(news.textContent,/Ferner Film/);
      assert.equal(dayRequests,0);
      assert.equal(JSON.stringify(stableEvents),originalEvents);
      assert.equal(JSON.stringify(radarState),originalState);
      assert.match(dayUi.container.querySelector(".kd-radar-suchstatus").textContent,/keine neuen Treffer/);
    });
  } finally {
    globalThis.Date=RealDate;
    if(dayUi)await dayUi.cleanup();
  }

  const targetFoundReload = decodeLocalRadar(JSON.stringify(targetFoundState), { authority: "guest" });
  const targetFoundReloadUi = await mount(EntdeckenTab, {
    ...baseProps, radarState: targetFoundReload.state, radarPilotEvents: [starfighterEvent],
  });
  await act(async () => { button(targetFoundReloadUi.container, "Radar").click(); await tick(); });
  check("Reihen-Suchziel und abgeleiteter Fund bleiben nach Reload getrennt", () => {
    assert.doesNotMatch(targetFoundReloadUi.container.textContent, /Gefunden für:/);
    assert.match(targetFoundReloadUi.container.textContent, /Star Wars: Starfighter/);
  });
  await targetFoundReloadUi.cleanup();

  const cageIdentity = { personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor", canonical: true };
  const cageOperationId = "10000000-0000-4000-8000-000000000099";
  const cageQueued = queueAccountPersonRadarChange(createEmptyLocalRadar({ authority: "account-cache" }), {
    operationId: cageOperationId, action: "upsert", identity: cageIdentity,
    targetId: "person:wikidata:Q42869:actor", now,
  });
  assert.equal(cageQueued.ok, true);
  const cageRejected = rejectAccountRadarChange(cageQueued.state, cageOperationId, "radar_person_target_unavailable");
  assert.equal(cageRejected.ok, true);
  let rejectedDismissed = null;
  const rejectedUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: cageRejected.state, syncStatus: "rejected",
    onRadarRejectedDismiss: async (operationId) => { rejectedDismissed = operationId; },
  });
  await act(async () => { button(rejectedUi.container, "Radar").click(); await tick(); });
  check("Terminale Nicolas-Ablehnung nennt Ziel, Vorgang und gemappten Grund statt globalem Banner", () => {
    assert.match(rejectedUi.container.textContent, /Nicolas Cage/);
    assert.match(rejectedUi.container.textContent, /Vorgang: Ins Radar aufnehmen/);
    assert.match(rejectedUi.container.textContent, /auf dem Server nicht mehr in der erwarteten Form verfügbar/);
    assert.doesNotMatch(rejectedUi.container.textContent, /Radar-Änderung abgelehnt|Entdecken verwalten/);
    assert.doesNotMatch(rejectedUi.container.innerHTML, /wikidata:Q42869|radar_person_target_unavailable/);
  });
  await act(async () => { button(rejectedUi.container, "Abgelehnte Änderung verwerfen").click(); await tick(); });
  assert.equal(rejectedDismissed, cageOperationId);
  await rejectedUi.cleanup();
  let cageSyncCalls = 0;
  const cageUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: cageQueued.state, syncStatus: "ready",
    onRadarPilotSync: async () => { cageSyncCalls += 1; },
  });
  await act(async () => { button(cageUi.container, "Radar").click(); await tick(); });
  check("Normale Nicolas-Cage-Outbox zeigt keinen irreführenden Bestätigungsbanner", () => {
    assert.equal(radarSyncProblem(cageQueued.state.outbox, "ready"), null);
    assert.doesNotMatch(cageUi.container.textContent, /Eine Änderung wartet noch auf Bestätigung/);
    assert.doesNotMatch(cageUi.container.textContent, /nicht synchronisieren/);
  });
  await cageUi.render({
    ...baseProps, accountMode: true, radarState: cageQueued.state, syncStatus: "pending",
    onRadarPilotSync: async () => { cageSyncCalls += 1; },
  });
  check("Echter Sync-Fehler bleibt sichtbar und erneut ausführbar", () => {
    assert.match(cageUi.container.textContent, /Radar konnte die Änderung nicht synchronisieren/);
    assert.ok(button(cageUi.container, "Erneut synchronisieren"));
  });
  await act(async () => { button(cageUi.container, "Erneut synchronisieren").click(); await tick(); });
  assert.equal(cageSyncCalls, 1);
  const cageAcked = acknowledgeAccountRadarPilotSubscription(cageQueued.state, cageOperationId, {
    operationId: cageOperationId, targetId: "person:wikidata:Q42869:actor",
    status: "active", revision: 1, checksum,
  });
  assert.equal(cageAcked.ok, true);
  const cageReload = decodeLocalRadar(JSON.stringify(cageAcked.state), { authority: "account-cache" });
  await cageUi.render({
    ...baseProps, accountMode: true, radarState: cageReload.state, syncStatus: "ready",
    onRadarPilotSync: async () => { cageSyncCalls += 1; },
  });
  check("Bestätigte Personen-Outbox ist nach Reload leer und Nicolas Cage bleibt Ziel", () => {
    assert.equal(cageReload.state.outbox.length, 0);
    assert.match(cageUi.container.textContent, /Nicolas Cage/);
    assert.doesNotMatch(cageUi.container.textContent, /Bestätigung|nicht synchronisieren/);
  });
  await cageUi.cleanup();

  const serverPersonIdentity = {
    personExternalId: "wikidata:Q999999", name: "Beispiel Person", role: "director", canonical: true,
  };
  const serverPersonTargetId = "person:wikidata:Q999999:director";
  const serverPersonUpsertId = "20000000-0000-4000-8000-000000000001";
  const serverPersonRemoveId = "20000000-0000-4000-8000-000000000002";
  const serverPersonQueued = queueAccountPersonRadarChange(
    createEmptyLocalRadar({ authority: "account-cache" }),
    {
      operationId: serverPersonUpsertId, action: "upsert", identity: serverPersonIdentity,
      targetId: serverPersonTargetId, now,
    },
  );
  assert.equal(serverPersonQueued.ok, true);
  const serverPersonAcked = acknowledgeAccountRadarPilotSubscription(serverPersonQueued.state, serverPersonUpsertId, {
    operationId: serverPersonUpsertId, targetId: serverPersonTargetId,
    status: "active", revision: 1, checksum,
  });
  assert.equal(serverPersonAcked.ok, true);
  const serverPersonChanges = [];
  let serverPersonRemoveQueue = null;
  const serverPersonUi = await mount(EntdeckenTab, {
    ...baseProps, accountMode: true, radarState: serverPersonAcked.state,
    onPersonRadarChange(entry, action) {
      serverPersonChanges.push({ entry, action });
      serverPersonRemoveQueue = queueAccountPersonRadarChange(serverPersonAcked.state, {
        operationId: serverPersonRemoveId, action,
        identity: {
          personExternalId: entry.personExternalId, name: entry.name, role: entry.role, canonical: true,
        },
        targetId: `person:${entry.personExternalId}:${entry.role}`, now,
      });
    },
  });
  await act(async () => {
    serverPersonUi.container.querySelector('button[aria-label="Entdecken verwalten"]').click();
    await tick();
  });
  const serverPersonRow = [...document.querySelectorAll(".kd-entdecken-verwalten-liste li")]
    .find((entry) => /Beispiel Person/.test(entry.textContent));
  check("Serverbestätigte Person bietet in Entdecken verwalten ausschließlich Radar-Entfernen an", () => {
    assert.ok(serverPersonRow);
    assert.deepEqual([...serverPersonRow.querySelectorAll("button")].map((entry) => entry.textContent), ["Aus dem Radar entfernen"]);
  });
  await act(async () => { button(serverPersonRow, "Aus dem Radar entfernen").click(); await tick(); });
  check("Serverbestätigte Person löst genau einen remove-Aufruf derselben Identity ohne Providerarbeit aus", () => {
    assert.equal(serverPersonChanges.length, 1);
    assert.equal(serverPersonChanges[0].action, "remove");
    assert.deepEqual({
      personExternalId: serverPersonChanges[0].entry.personExternalId,
      name: serverPersonChanges[0].entry.name,
      role: serverPersonChanges[0].entry.role,
    }, {
      personExternalId: serverPersonIdentity.personExternalId,
      name: serverPersonIdentity.name,
      role: serverPersonIdentity.role,
    });
    assert.equal(serverPersonRemoveQueue.ok, true);
    assert.equal(serverPersonRemoveQueue.createsProviderJob, false);
    assert.equal(serverPersonRemoveQueue.state.outbox.length, 1);
    assert.equal(serverPersonRemoveQueue.state.outbox[0].action, "remove");
    assert.equal(serverPersonRemoveQueue.state.outbox[0].personExternalId, serverPersonIdentity.personExternalId);
    assert.equal(serverPersonRemoveQueue.state.outbox[0].personRole, serverPersonIdentity.role);
  });
  await serverPersonUi.cleanup();

  const identity = { personExternalId: "wikidata:Q42869", name: "Nicolas Cage", role: "actor", canonical: true };
  const personCatalog = [{ targetId: "watchmode:101", targetType: "work", title: "Dream Scenario", year: 2023 }];
  let personState = upsertGuestPersonRadarSubscription(
    createEmptyLocalRadar(), { identity, now },
  ).state;
  let personUi;
  const renderPersonProps = () => ({
    ...baseProps, radarState: personState, onPersonRadarChange() {},
  });
  personUi = await mount(EntdeckenTab, renderPersonProps());
  await act(async () => { button(personUi.container, "Radar").click(); await tick(); });
  check("Bestehende Person bleibt mit Name und Rolle, aber ohne Roh-ID sichtbar", () => {
    assert.match(personUi.container.textContent, /Nicolas Cage/);
    assert.match(personUi.container.textContent, /Schauspiel · Im Radar/);
    assert.doesNotMatch(personUi.container.textContent, /tägliche Prüfung|täglichen Prüfungen/i);
    assert.doesNotMatch(personUi.container.innerHTML, /wikidata:Q42869/);
    assert.equal(button(personUi.container, "Jetzt prüfen"), undefined);
  });
  await act(async () => {
    personUi.container.querySelector('button[aria-label="Entdecken verwalten"]').click();
    await tick();
  });
  check("Lokale Person behält Pausieren und Radar-Entfernen in Entdecken verwalten", () => {
    const row = [...document.querySelectorAll(".kd-entdecken-verwalten-liste li")]
      .find((entry) => /Nicolas Cage/.test(entry.textContent));
    assert.deepEqual([...row.querySelectorAll("button")].map((entry) => entry.textContent), ["Pausieren", "Aus dem Radar entfernen"]);
  });
  await act(async () => {
    document.querySelector('button[aria-label="Entdecken verwalten schließen und zurück"]').click();
    await tick();
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
  check("Validierter Personen-Treffer bleibt intern ohne unvollstaendigen Neuigkeiten-Eintrag", () => {
    assert.doesNotMatch(personUi.container.textContent, /Dream Scenario|2023/);
    assert.equal(personState.personResults[0].decisions[0].work.title, "Dream Scenario");
    assert.equal(personState.subscriptions.length, 0);
  });
  const savedPersonState = JSON.stringify(personState);
  await personUi.cleanup();
  const reloadedPerson = decodeLocalRadar(savedPersonState, { authority: "guest" });
  const personReloadUi = await mount(EntdeckenTab, {
    ...baseProps, radarState: reloadedPerson.state, personRadarAvailable: false,
  });
  await act(async () => { button(personReloadUi.container, "Radar").click(); await tick(); });
  check("Person und Rolle überstehen Reload ohne unvollstaendigen Treffer oder Suchfehler", () => {
    assert.match(personReloadUi.container.textContent, /Nicolas Cage/);
    assert.match(personReloadUi.container.textContent, /Schauspiel/);
    assert.doesNotMatch(personReloadUi.container.textContent, /Dream Scenario/);
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
    button(franchiseUi.container, "Ins Radar aufnehmen").click();
    await tick();
  });
  check("Reihenname bleibt Freitext und erzeugt keine zweite Zielauflösung", () => {
    assert.deepEqual(savedFranchiseTexts, ["Star Wars"]);
    assert.match(franchiseUi.container.textContent, /Ziel gespeichert/);
    assert.doesNotMatch(franchiseUi.container.innerHTML, /wikidata:Q462|title-group:v1:star-wars/);
  });
  await franchiseUi.cleanup();

  const automaticUi = await mount(EntdeckenTab, {
    ...baseProps,
    radarState: upsertGuestRadarSubscription(createEmptyLocalRadar(), {
      target: workTarget, now,
    }).state,
    accountMode: true,
    radarAutomaticAvailable: true,
  });
  await act(async () => { button(automaticUi.container, "Radar").click(); await tick(); });
  check("Verfügbarer Kontopfad erklärt Suche und Automatik ohne Intervall-Techniktext", () => {
    assert.equal(button(automaticUi.container, "Jetzt prüfen"), undefined);
    assert.match(automaticUi.container.textContent, /automatisch auf dem Laufenden/i);
    assert.doesNotMatch(automaticUi.container.textContent, /alle sechs Tage|alle 6 Tage/i);
    assert.doesNotMatch(automaticUi.container.textContent, /manuell prüfbar|nur durch|Tagesaktuelle Neuigkeiten/i);
  });
  await automaticUi.cleanup();

  const guestAutomaticUi = await mount(EntdeckenTab, {
    ...baseProps,
    radarState: upsertGuestRadarSubscription(createEmptyLocalRadar(), {
      target: workTarget, now,
    }).state,
  });
  await act(async () => { button(guestAutomaticUi.container, "Radar").click(); await tick(); });
  check("Gastzustand behauptet keine automatische Prüfung", () => {
    assert.equal(button(guestAutomaticUi.container, "Jetzt prüfen"), undefined);
    assert.match(guestAutomaticUi.container.textContent, /automatische Prüfung ist im Gastmodus nicht verfügbar/i);
    assert.doesNotMatch(guestAutomaticUi.container.textContent, /alle sechs Tage geprüft|alle 6 Tage/i);
  });
  await guestAutomaticUi.cleanup();
} finally {
  if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  if (dom) dom.window.close();
}

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("ENTDECKEN-PHASE3-TEST BESTANDEN");
