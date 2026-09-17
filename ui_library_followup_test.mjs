import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const nodeModules = path.join(root, "node_modules");
const requireFromProject = createRequire(path.join(nodeModules, "__ui_library_followup__.cjs"));
const { JSDOM } = requireFromProject("jsdom");
let esbuild;
try { esbuild = requireFromProject("esbuild"); }
catch { esbuild = requireFromProject("vite/node_modules/esbuild"); }
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-ui-library-followup-"));
const bundle = path.join(temp, "bundle.mjs");
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));

await esbuild.build({
  stdin: {
    contents: [
      'export { KatalogRegler } from "./src/components/KatalogRegler.jsx";',
      'export { QuellenBadges } from "./src/components/ui.jsx";',
      'export { bestaetigteMediathekNavigationId } from "./src/tabs/StreamingTab.jsx";',
      'export { MediathekTab } from "./src/tabs/MediathekTab.jsx";',
      'export { istReinerPrognoseMasterwechsel } from "./src/tabs/MediathekTab.jsx";',
      'export { erstellePrognose } from "./src/lib/prognose.js";',
      'export { default as React, act } from "react";',
      'export { createRoot } from "react-dom/client";',
    ].join("\n"),
    resolveDir: root,
    loader: "jsx",
  },
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  loader: { ".css": "empty" },
  nodePaths: [nodeModules],
  logLevel: "silent",
});
esbuild.stop?.();

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", { url: "https://kinodreieck.test/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
  "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "CustomEvent", "localStorage"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? dom.window : dom.window[name], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
const {
  KatalogRegler, QuellenBadges, bestaetigteMediathekNavigationId, MediathekTab,
  istReinerPrognoseMasterwechsel, erstellePrognose, React, act, createRoot,
} = await import(pathToFileURL(bundle).href);
const app = document.getElementById("app");
const reactRoot = createRoot(app);
const changes = [];
await act(async () => {
  reactRoot.render(React.createElement("div", null,
    React.createElement(KatalogRegler, {
      name: "Mediathek", buchstabe: null, onBuchstabe: (wert) => changes.push(["abc", wert]),
      jahrzehnt: null, jahrzehnte: [1990, 2000], onJahrzehnt: (wert) => changes.push(["dekade", wert]),
    }),
    React.createElement(QuellenBadges, { quelle: "dvd+dvd+netflix+netflix", kompakt: true }),
  ));
});
const regler = [...app.querySelectorAll('input[type="range"]')];
assert.equal(regler.length, 2, "Alphabet und Jahrzehnt werden gemeinsam gerendert");
await act(async () => {
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  setValue.call(regler[0], "1");
  regler[0].dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  setValue.call(regler[1], "2");
  regler[1].dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
assert.deepEqual(changes, [["abc", "A"], ["dekade", 2000]], "beide Regler liefern dieselben Werteverträge");
assert.equal(app.querySelectorAll(".kd-quellenbadge").length, 2, "gespeicherte Quellen werden stabil dedupliziert");
assert.ok(app.querySelector(".kd-quellenbadges--kompakt"), "kompakte Badgegröße ist optional verfügbar");

// E06-002/E11-003: gespeicherte oder voraufgelöste IDs ersetzen keinen
// aktuellen vollständigen Identitätsbeleg. Der gebündelte Export ist Produktcode.
const alpha = { titel: "Alpha", watchmode_id: 101, imdb_id: "tt1234567", jahr: 2001, typ: "movie" };
const master = [
  { ...alpha, id: "film-a", typ: "film" },
  { id: "film-b", titel: "Beta", watchmode_id: 202, jahr: 2002, typ: "film" },
  { id: "film-ohne-id", titel: "Streng voraufgelöst", jahr: 2003, typ: "film" },
];
let navigationChecks = 0;
const navigation = (input, expected, message) => {
  assert.equal(bestaetigteMediathekNavigationId(input), expected, message);
  navigationChecks++;
};
navigation({ titel: alpha, master, statusMap: { 101: { mediathek_id: "film-a" } } },
  "film-a", "vollständige konfliktfreie Watchmode-Identität navigiert");
navigation({ titel: alpha, master, statusMap: { 101: { mediathek_id: "film-b" } } },
  "film-a", "aktuelle Identität korrigiert eine gespeicherte fremde ID");
navigation({ titel: alpha, master, bekannteId: "film-b" },
  "film-a", "eine falsche Known-ID überschreibt die aktuelle eindeutige Identität nicht");
const knownTitle = { titel: "Streng voraufgelöst", jahr: 2003, typ: "movie" };
navigation({ titel: knownTitle, master, bekannteId: "film-ohne-id" },
  "film-ohne-id", "Known-Zuordnung bleibt mit bestätigtem Titel/Jahr/Typ nutzbar");
navigation({ titel: knownTitle, master },
  "film-ohne-id", "eindeutiger vollständiger Titelabgleich benötigt keinen Known-Shortcut");
navigation({ titel: { titel: "Fremd", watchmode_id: 303, jahr: 2002, typ: "movie" }, master,
  statusMap: { 303: { mediathek_id: "film-b" } } },
  null, "fremde existente Status-ID ohne gemeinsame Identität navigiert nicht");
navigation({ titel: { watchmode_id: 404 }, master, bekannteId: "film-ohne-id" },
  null, "bloße existente Known-ID ohne Identitätsbeleg navigiert nicht");
navigation({ titel: knownTitle, master: master.slice(0, 2), bekannteId: "film-ohne-id" },
  null, "gelöschtes Known-Ziel navigiert trotz vollständigem externen Titel nicht");
navigation({ titel: alpha, master: null, statusMap: { 101: { mediathek_id: "film-a" } }, bekannteId: "film-a" },
  null, "ungeladener Master bestätigt weder Status- noch Known-ID");
navigation({ titel: { watchmode_id: 101 }, master: [{ id: "film-a", titel: "Alpha", watchmode_id: 101 }],
  statusMap: { 101: { mediathek_id: "film-a" } }, bekannteId: "film-a" },
  null, "historische ID-only-Fixture ist ausdrücklich kein positiver Identitätsnachweis");
for (const field of ["jahr", "typ"]) {
  navigation({ titel: { ...alpha, [field]: undefined }, master, bekannteId: "film-a" },
    null, `fehlendes externes ${field} wird nicht durch eine Known-ID ersetzt`);
  navigation({ titel: alpha, master: [{ ...master[0], [field]: undefined }], bekannteId: "film-a" },
    null, `fehlendes Master-${field} wird nicht durch eine Known-ID ersetzt`);
}
for (const [name, overrides] of [
  ["Werkart", { typ: "serie" }], ["Jahr", { jahr: 2002 }], ["weitere starke ID", { imdb_id: "tt7654321" }],
]) {
  navigation({ titel: alpha, master: [{ ...master[0], ...overrides }],
    statusMap: { 101: { status: "gesehen", mediathek_id: "film-a" } }, bekannteId: "film-a" },
    null, `${name}-Konflikt bleibt trotz noch existenter Status-/Known-ID gesperrt`);
}
for (const candidates of [
  [master[0], { ...master[0], id: "duplikat" }],
  [master[0], { ...master[0], id: "konflikt", jahr: 2002 }],
]) {
  for (const records of [candidates, [...candidates].reverse()]) {
    navigation({ titel: alpha, master: records, bekannteId: "film-a" },
      null, "mehrdeutige oder widersprüchliche starke IDs bleiben in jeder Masterreihenfolge gesperrt");
  }
}
navigation({ titel: knownTitle, master: [master[2], { ...master[2], id: "titelduplikat" }],
  bekannteId: "film-ohne-id" }, null, "Known-ID löst keinen mehrdeutigen Titel/Jahr/Typ-Abgleich auf");

const css = fs.readFileSync("src/styles/library-followup.css", "utf8");
assert.match(css, /\.kd-streaming-tab > \.kd-streaming-ansichten\s*\{[\s\S]*grid-template-columns:/u);
assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.kd-streaming-tab > \.kd-streaming-ansichten/u);
assert.match(css, /\.kd-streaming-mediathek-link\s*\{[\s\S]*min-height: 44px/u);
const mediathek = fs.readFileSync("src/tabs/MediathekTab.jsx", "utf8");
assert.match(mediathek, /name="Must-Watch"[\s\S]*alphabetBuchstabe=\{buchstabe\} jahrzehnt=\{dekade\}/u);
assert.match(mediathek, /streamingAnfangsbuchstabe\(f\.titel\)[\s\S]*passtInJahrzehntMitKulanz\(f\.jahr, dekade\)/u);
assert.match(mediathek, /onRecherchieren: \(optionen\) => onFilmwissenRecherchieren\?\.\(f, optionen\)/u);
assert.match(fs.readFileSync("src/tabs/StreamingTab.jsx", "utf8"),
  /onRecherchieren: \(optionen\) => onFilmwissenRecherchieren\?\.\(kartenFilm, optionen\)/u);

await act(async () => reactRoot.unmount());
const mediathekRoot = createRoot(app);
await act(async () => {
  mediathekRoot.render(React.createElement(MediathekTab, {
    master: [
      { id: "alpha", typ: "film", titel: "Alpha", jahr: 1995, quelle: "dvd", bewertung: null },
      { id: "zulu", typ: "film", titel: "Zulu", jahr: 2005, quelle: "dvd", bewertung: null },
    ],
    nachtragFlach: [], expandedId: null, setExpandedId: () => {}, updateFilm: () => {}, deleteFilm: () => {},
    addFilm: () => {}, badgeFuer: () => null, mustwatch: [
      { id: "mw-alpha", titel: "Alpha", jahr: 1995 }, { id: "mw-zulu", titel: "Zulu", jahr: 2005 },
    ],
    mwKandidaten: { master: [], programm: [], streaming: [] }, datenKontextKey: "followup-test",
  }));
});
const mediathekAlphabet = app.querySelector('input[aria-label="Mediathek: Anfangsbuchstaben filtern"]');
assert.ok(mediathekAlphabet, "Mediathek-Einträge bieten den gemeinsamen Alphabetregler");
await act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(mediathekAlphabet, "26");
  mediathekAlphabet.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
assert.equal(app.querySelectorAll("[data-film-id]").length, 1, "Alphabetregler filtert die Mediathekkarten funktional");
assert.equal(app.querySelector("[data-film-id]")?.dataset.filmId, "zulu");
await act(async () => {
  [...app.querySelectorAll("button")].find((button) => button.textContent.startsWith("Must-Watch"))
    .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
});
assert.ok(app.querySelector('input[aria-label="Must-Watch: Anfangsbuchstaben filtern"]'), "Must-Watch bietet denselben Regler");
assert.equal(app.querySelectorAll(".kd-mustwatch-karte").length, 1, "Must-Watch kombiniert den Regler mit seiner eigenen Projektion");
assert.match(app.querySelector(".kd-mustwatch-karte")?.textContent || "", /Zulu/u);
await act(async () => mediathekRoot.unmount());

const prognose = erstellePrognose({
  ergebnis: {
    format: "film-prognose-v1", achsen: { wie: 4, was: 3, warum: 4 }, passung: 72,
    kategorie_vorschlag: "sehenswert", sicherheit: "mittel",
    begruendung: "Formale Energie und trockener Humor passen zu deinem Profil.",
    verwendete_signale: [{ id: "S1", art: "genre", wert: "drama", richtung: "zieht_an" }],
  },
  profilVersion: "p3", modell: "claude-sonnet-5-20260715", modellAlias: "gross",
  vorgangId: "forecast-followup", verbrauch: { inputTokens: 10, outputTokens: 10, kostenUsdCent: 0.1, dauerMs: 20 },
  jetzt: "2026-09-11T12:00:00.000Z",
}).prognose;
const prognoseBasis = [{ id: "offen", typ: "film", titel: "Offener Editor", jahr: 2001, quelle: "dvd", bewertung: null }];
const prognoseMaster = [{ ...prognoseBasis[0], prognose }];
assert.equal(istReinerPrognoseMasterwechsel(prognoseBasis, prognoseMaster, "boffen"), true,
  "nur gültige Prognosemetadaten am geöffneten stabilen Eintrag sind erlaubt");
assert.equal(istReinerPrognoseMasterwechsel(prognoseBasis, [{ ...prognoseMaster[0], titel: "Geändert" }], "boffen"), false,
  "sonstige Datenänderung bleibt harte Mastergrenze");
assert.equal(istReinerPrognoseMasterwechsel(prognoseBasis, [{ ...prognoseBasis[0], prognose: { status: "offen" } }], "boffen"), false,
  "ungültige Prognose lockert die Grenze nicht");

function PrognoseHarness({ master, kontext = "followup-prognose" }) {
  const [expandedId, setExpandedId] = React.useState(null);
  return React.createElement(MediathekTab, {
    master, datenKontextKey: kontext, expandedId, setExpandedId, nachtragFlach: [], mustwatch: [],
    updateFilm: async () => true, deleteFilm: () => {}, addFilm: async () => true, badgeFuer: () => null,
    vorbewertungAktiv: true,
  });
}
const prognoseRoot = createRoot(app);
await act(async () => prognoseRoot.render(React.createElement(PrognoseHarness, { master: prognoseBasis })));
await act(async () => {
  [...app.querySelectorAll("button")].find((button) => button.textContent.includes("Jetzt bewerten"))
    .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
});
const offenerEditor = app.querySelector('.kd-film-editor-shell textarea[placeholder^="Begründung"]');
await act(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(offenerEditor, "MEIN OFFENER ENTWURF");
  offenerEditor.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
});
await act(async () => prognoseRoot.render(React.createElement(PrognoseHarness, { master: prognoseMaster })));
assert.equal(app.querySelector('.kd-film-editor-shell textarea[placeholder^="Begründung"]'), offenerEditor,
  "reine erfüllte Prognose bewahrt dieselbe offene Editorinstanz");
assert.equal(offenerEditor.value, "MEIN OFFENER ENTWURF", "offener Bewertungsentwurf bleibt unverändert");
await act(async () => prognoseRoot.unmount());
console.log(`ui_library_followup_test: ${22 + navigationChecks} Checks bestanden (${navigationChecks} Navigation, 22 UI-/Editor-Verträge).`);
process.exit(0);
