/* Entdecken-Wochenfeed: schmaler Mock-Nutzerweg ohne Netz, DB oder Anbieter. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createEntdeckenRecommendations } from "./src/lib/entdeckenUi.js";
import { matchWebDiscoveryFeed, validateWebDiscoveryFeed } from "./src/lib/webDiscoveryFeed.js";
import { createEntdeckenDailyFeedService } from "./src/services/entdeckenDailyFeed.js";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };
const checkAsync = async (name, fn) => { await fn(); checks += 1; console.log(`✓ ${name}`); };

const evidence = (index) => ({
  domain: index % 2 ? "www.film.at" : "www.derstandard.at",
  url: index % 2
    ? `https://www.film.at/streaming/wochentipp-${index}`
    : `https://www.derstandard.at/story/wochentipp-${index}`,
  publishedOn: "2026-08-18",
  retrievedOn: "2026-08-20",
  positiveRecommendation: true,
});

const catalogRows = Array.from({ length: 15 }, (_, index) => {
  const id = 5001 + index;
  return {
    watchmode_id: id,
    titel: index === 0 ? "Star Wars: Visions – The Ninth Jedi" : `Belegter Wochentipp ${String(index + 1).padStart(2, "0")}`,
    jahr: 2026,
    typ: index % 5 === 0 ? "tv_series" : "movie",
    dienste: index === 13 ? ["Netflix"] : ["Disney+"],
    genres: index >= 1 && index <= 7 ? ["drama"] : ["science-fiction"],
    tags: [],
  };
});
const catalog = { region: "AT", stand: "2026-08-20T00:00:00.000Z", titel: catalogRows };

const weeklyFeed = {
  format: 4,
  feedId: "websearch:weekly-positive-at",
  region: "AT",
  sourceId: "websearch:weekly-positive",
  isoWeek: "2026-W34",
  refreshedOn: "2026-08-20",
  validUntil: "2026-08-23",
  items: catalogRows.map((entry, index) => ({
    recordId: `webtip:${String(index + 1).padStart(16, "0")}`,
    title: index === 0 ? "The Ninth Jedi" : entry.titel,
    mediaType: entry.typ === "tv_series" ? "series" : "film",
    releaseYear: entry.jahr,
    externalIds: { watchmode: String(entry.watchmode_id) },
    attributes: {
      genres: index >= 1 && index <= 7 ? ["drama"] : ["science-fiction"],
      tones: index === 0 ? ["abenteuerlich"] : ["ruhig"],
      themes: index === 0 ? ["Vermächtnis"] : ["Neuanfang"],
    },
    evidence: [evidence(index + 1)],
    rank: index + 1,
  })),
};

check("ISO-Wochenfeed akzeptiert nur die kanonische Woche und neutrale Merkmale", () => {
  assert.equal(validateWebDiscoveryFeed(weeklyFeed).ok, true);
  assert.equal(validateWebDiscoveryFeed({
    ...weeklyFeed,
    items: [{
      ...weeklyFeed.items[0],
      evidence: [{
        ...weeklyFeed.items[0].evidence[0],
        domain: "tv.orf.at",
        url: "https://tv.orf.at/stories/wochentipp-1",
      }],
    }],
  }).ok, true);
  assert.equal(validateWebDiscoveryFeed({ ...weeklyFeed, isoWeek: "2026-W33" }).ok, false);
  assert.equal(validateWebDiscoveryFeed({
    ...weeklyFeed,
    items: [{ ...weeklyFeed.items[0], attributes: { genres: [], tones: [], themes: [], userScore: 99 } }],
  }).ok, false);
});

check("Starke externe ID gewinnt ohne Titelerfindung, Konflikte bleiben draußen", () => {
  const strong = matchWebDiscoveryFeed({ ...weeklyFeed, items: [weeklyFeed.items[0]] }, [{
    targetId: "watchmode:5001",
    title: "Star Wars: Visions – The Ninth Jedi",
    year: 2026,
    type: "tv_series",
    externalIds: { watchmode: "5001" },
  }]);
  assert.equal(strong[0].status, "matched");
  assert.equal(strong[0].matchedBy, "external-id:watchmode");

  const conflictRecord = {
    ...weeklyFeed.items[0],
    externalIds: { watchmode: "5001", tmdb: "99" },
  };
  const conflict = matchWebDiscoveryFeed({ ...weeklyFeed, items: [conflictRecord] }, [{
    targetId: "watchmode:5001", title: "The Ninth Jedi", year: 2026, type: "tv_series",
    externalIds: { watchmode: "5001", tmdb: "100" },
  }]);
  assert.equal(conflict[0].status, "unmatched");
});

check("Fallback verlangt exakt Titel, Jahr und Typ und blockiert Mehrdeutigkeit", () => {
  const item = {
    ...weeklyFeed.items[1], title: "Dune", releaseYear: 2021, mediaType: "film", externalIds: {},
  };
  const candidates = [
    { targetId: "watchmode:84", title: "Dune", year: 1984, type: "movie", externalIds: {} },
    { targetId: "watchmode:21", title: "Dune", year: 2021, type: "movie", externalIds: {} },
  ];
  const exact = matchWebDiscoveryFeed({ ...weeklyFeed, items: [item] }, candidates);
  assert.equal(exact[0].status, "matched");
  assert.equal(exact[0].candidate.targetId, "watchmode:21");
  const ambiguous = matchWebDiscoveryFeed({ ...weeklyFeed, items: [item] }, [
    ...candidates,
    { targetId: "catalog:dune-2021", title: "Dune", year: 2021, type: "film", externalIds: {} },
  ]);
  assert.equal(ambiguous[0].status, "ambiguous");
  assert.equal(ambiguous[0].candidate, null);
});

const profile = {
  signals: [{ kind: "genre", value: "drama", direction: "positive", confirmed: true, strength: 4 }],
};
const selectionInput = {
  streamingEntdecken: {
    ...catalog,
    titel: [...catalog.titel, {
      watchmode_id: 9999, titel: "Nur im lokalen Katalog", jahr: 2026, typ: "movie",
      dienste: ["Disney+"], genres: ["drama"], tags: [],
    }],
  },
  profile,
  master: [],
  selectedServices: ["Disney+"],
  entdeckenStatus: { 5015: "gesehen" },
  webDiscoveryFeed: weeklyFeed,
  selectionDay: "2026-08-22",
};
const selection = createEntdeckenRecommendations(selectionInput);

check("Insgesamt bleiben sieben belegte AT-Titel sichtbar", () => {
  assert.equal(selection.further.length, 1);
  assert.ok(selection.further.some((entry) => /The Ninth Jedi/.test(entry.title)));
  assert.ok(selection.further.every((entry) => entry.services.includes("Disney+")
    && entry.externalEvidence.length > 0));
  assert.ok(!selection.further.some((entry) => entry.targetId === "watchmode:5014"
    || entry.targetId === "watchmode:5015"));
});

check("Für mich sortiert nur denselben Wochenfeed lokal und schließt Gesehenes aus", () => {
  assert.equal(selection.personal.length, 6);
  assert.ok(selection.personal.every((entry) => entry.reasons.some((reason) => /^Profil:/.test(reason))));
  const visible = [...selection.personal, ...selection.further];
  assert.ok(!visible.some((entry) => entry.title === "Nur im lokalen Katalog"));
  assert.ok(!visible.some((entry) => entry.targetId === "watchmode:5015"));
  assert.equal(new Set(visible.map((entry) => entry.targetId)).size, visible.length);
  assert.equal(visible.length, 7);
});

check("Neutrale Webtreffer bleiben aus Für mich und folgen in Weitere der Quellenreihenfolge", () => {
  const neutral = createEntdeckenRecommendations({ ...selectionInput, profile: {} });
  assert.deepEqual(neutral.personal, []);
  assert.equal(neutral.further.length, 7);
  assert.deepEqual(neutral.further.map((entry) => entry.sourceRank), [1, 2, 3, 4, 5, 6, 7]);
});

check("Unbelegter positiver Status leert den Pfad fail-closed", () => {
  const invalidFeed = {
    ...weeklyFeed,
    items: [{
      ...weeklyFeed.items[0],
      evidence: [{ ...weeklyFeed.items[0].evidence[0], positiveRecommendation: false }],
    }],
  };
  assert.equal(validateWebDiscoveryFeed(invalidFeed).ok, false);
  const result = createEntdeckenRecommendations({ ...selectionInput, webDiscoveryFeed: invalidFeed });
  assert.deepEqual(result.personal, []);
  assert.deepEqual(result.further, []);
});

await checkAsync("Client akzeptiert denselben Feed in der Folgewoche nur als stale", async () => {
  const session = {
    mode: "account", state: "ready",
    account: { id: "00000000-0000-4000-8000-000000000001", role: "owner" },
    access: { status: "resolved", role: "owner" },
    capabilities: { remoteStorage: true, personalAi: true },
  };
  let calls = 0;
  const service = createEntdeckenDailyFeedService({
    config: {
      entdeckenDailyFeedEnabled: true,
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "public-key",
    },
    auth: { getSnapshot: () => session },
    getAccount: () => ({ id: session.account.id }),
    getAccessToken: async () => "owner-token",
    currentDay: () => "2026-08-24",
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, async json() {
        return {
          ok: true, status: "stale", feed: weeklyFeed,
          writes: 0, providerRequests: 0, searchRequests: 0,
          refresh: {
            requested: false, mode: "read", status: "read_only",
            attemptCount: 0, maxAttempts: 3,
          },
        };
      } };
    },
  });
  const result = await service.load();
  assert.equal(result.status, "stale");
  assert.equal(result.feed.isoWeek, "2026-W34");
  assert.equal(calls, 1);
});

async function loadEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}

const rootDir = path.dirname(fileURLToPath(import.meta.url));
let outputDir = null;
let dom = null;
try {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "kinodreieck-entdecken-weekly-"));
  fs.symlinkSync(fs.realpathSync(path.join(rootDir, "node_modules")), path.join(outputDir, "node_modules"), "dir");
  const output = path.join(outputDir, "bundle.mjs");
  const esbuild = await loadEsbuild();
  await esbuild.build({
    stdin: {
      contents: 'export { EntdeckenTab } from "./src/tabs/EntdeckenTab.jsx";',
      loader: "js", resolveDir: rootDir,
    },
    bundle: true,
    format: "esm",
    outfile: output,
    jsx: "automatic",
    target: "es2022",
    logLevel: "warning",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });
  const { EntdeckenTab } = await import(output);
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
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error("Netz im Mockpfad verboten"); };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  localStorage.setItem("kd:geschmacksprofil", JSON.stringify({
    format: 1, version: "weekly-test", erstellt: null, geaendert: null, einwilligung: null,
    signale: [{
      art: "genre", wert: "drama", richtung: "zieht_an", staerke: 4,
      sicherheit: "hoch", quelle: "schlagwort", beleg: "schlagwort:drama",
    }],
    offen: [], achsen: { wie: null, was: null, warum: null }, filme: [], nichtDeutbar: [],
  }));
  const React = await import("react");
  const { act, createElement } = React;
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const emptyBlogProps = {
    artikel: [], master: [], angemeldet: false,
    onFokusVerbraucht() {}, onErstellen: async () => null, onAktualisieren: async () => null,
    onSetzeRef() {}, onFreigeben: async () => false, onLoeschen: async () => false,
    onAddFilm: async () => null, onSpringeZuFilm() {},
  };
  await act(async () => {
    root.render(createElement(EntdeckenTab, {
      blogProps: emptyBlogProps,
      radarState: { subscriptions: [], personSubscriptions: [], personResults: [] },
      seriesCatalog: [],
      entdeckenStatus: selectionInput.entdeckenStatus,
      master: [],
      streamingKnown: null,
      streamingDiscover: selectionInput.streamingEntdecken,
      selectedServices: selectionInput.selectedServices,
      webDiscoveryFeed: weeklyFeed,
      webDiscoveryStatus: {
        status: "fresh", responseMode: "degraded",
        displayText: "Dieser freie Text darf nicht direkt angezeigt werden.", warnings: [],
      },
      calendarDay: "2026-08-22",
      onObserveToggle() {}, onRadarChange() {}, onRadarPreview() {}, onShareChange() {},
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  check("Mock-Nutzerweg zeigt insgesamt sieben Titel ohne zweite Suche", () => {
    const personalSection = container.querySelector('[aria-labelledby="kd-entdecken-empfehlungen"]');
    const furtherSection = container.querySelector('[aria-labelledby="kd-entdecken-weitere"]');
    assert.match(personalSection?.textContent || "", /Für mich/);
    assert.equal(personalSection?.querySelectorAll(":scope > .kd-entdecken-karten .kd-entdecken-hub-karte").length, 6);
    assert.equal(furtherSection?.querySelectorAll(".kd-entdecken-neutral").length, 1);
    assert.match(furtherSection?.textContent || "", /The Ninth Jedi/);
    assert.match(furtherSection?.textContent || "", /KW 34\/2026/);
    assert.match(container.textContent, /bisherige Feed bleibt sichtbar/);
    assert.doesNotMatch(container.textContent, /freie Text darf nicht direkt/);
    assert.ok([...container.querySelectorAll('button[aria-label*="Pinboard"]')].length > 0);
    assert.ok([...container.querySelectorAll("button")].every((button) => !/^(?:Beobachten|Beobachtet)$/.test(button.textContent.trim())));
    assert.ok([...furtherSection.querySelectorAll('a[href^="https://"]')]
      .every((link) => /derstandard\.at|film\.at/.test(new URL(link.href).hostname)));
    assert.doesNotMatch(container.textContent, /Nur im lokalen Katalog/);
    assert.equal(networkCalls, 0);
  });
  await act(async () => { root.unmount(); });
  container.remove();
} finally {
  dom?.window?.close();
  if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
}

console.log(`\n${checks}/${checks} Entdecken-Wochenfeed-Checks bestanden.`);
