/* Fokussierte lokale Regression für den KI-Bewertungs-Entwurf und die
   Quellenzeile. Keine Netzwerk-, Provider- oder Shared-Data-Aufrufe. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const wurzel = path.dirname(fileURLToPath(import.meta.url));
async function ladeEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}
const ausgabeDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-rating-followup-"));
const ausgabe = path.join(ausgabeDir, "bundle.mjs");
fs.symlinkSync(path.join(wurzel, "node_modules"), path.join(ausgabeDir, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(ausgabeDir, { recursive: true, force: true }));
const esbuild = await ladeEsbuild();
await esbuild.build({
  stdin: {
    contents: [
      'export { FilmForm } from "./src/components/EintragForm.jsx";',
      'export { FilmCard } from "./src/components/FilmCard.jsx";',
      'export { erstellePrognose } from "./src/lib/prognose.js";',
      'export { istSichererFilmwissenQuellenstopp } from "./src/lib/kiBewertungFlow.js";',
    ].join("\n"),
    loader: "js",
    resolveDir: wurzel,
  },
  bundle: true,
  format: "esm",
  outfile: ausgabe,
  jsx: "automatic",
  target: "es2022",
  logLevel: "warning",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of [
  "window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
  "Element", "Event", "MouseEvent", "Node", "NodeList", "getComputedStyle", "localStorage",
]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name],
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;

const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const {
  FilmForm, FilmCard, erstellePrognose, istSichererFilmwissenQuellenstopp,
} = await import(ausgabe);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let checks = 0;
function check(wert, text) {
  assert.ok(wert, text);
  checks++;
  console.log("✓ " + text);
}
function knopf(container, text) {
  return [...container.querySelectorAll("button")].find((element) => element.textContent.includes(text));
}
function setzeWert(element, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  setter.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}
async function mounte(Komponente, props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(h(Komponente, props)); await tick(); });
  return {
    container,
    async cleanup() { await act(async () => root.unmount()); container.remove(); },
  };
}

const prognose = erstellePrognose({
  ergebnis: {
    format: "film-prognose-v1",
    achsen: { wie: 4, was: 3, warum: 4 },
    passung: 82,
    kategorie_vorschlag: "kult",
    sicherheit: "mittel",
    begruendung: "Dichte Inszenierung und präzise Motive passen zu deinem Profil.",
    verwendete_signale: [],
  },
  profilVersion: "p4",
  modell: "test-model-v1",
  modellAlias: "test",
  vorgangId: "rating-followup-test",
  verbrauch: { inputTokens: 1, outputTokens: 1, kostenUsdCent: 0, dauerMs: 1 },
  jetzt: "2026-09-11T20:00:00.000Z",
}).prognose;

let ersterResolver;
let prognoseAufrufe = 0;
const writes = [];
const form = await mounte(FilmForm, {
  startOffen: true,
  typOptionen: ["film"],
  initial: { titel: "Alien", jahr: 1979 },
  prognoseAktiv: true,
  onAdd: async (eintrag) => { writes.push(eintrag); return "alien_romulus_2024"; },
  onAddMitPrognose: async () => {
    prognoseAufrufe++;
    if (prognoseAufrufe === 1) return new Promise((resolve) => { ersterResolver = resolve; });
    return { status: "bereit", id: "alien_romulus_2024", prognose };
  },
});

await act(async () => {
  const starten = knopf(form.container, "KI-Bewertung erstellen");
  starten.click(); starten.click(); await tick();
});
check(writes.length === 0 && prognoseAufrufe === 1
  && /KI-Bewertung wird erstellt/.test(form.container.textContent),
"KI-Doppelklick startet genau einen Entwurf und zeigt den laufenden Zustand ohne Eintragswrite");
const titel = form.container.querySelector('input[placeholder="Titel *"]');
await act(async () => { setzeWert(titel, "Alien: Romulus"); await tick(); });
await act(async () => { ersterResolver({ status: "bereit", id: "alien_1979", prognose }); await tick(); });
check(titel.value === "Alien: Romulus" && writes.length === 0
  && /alte Antwort wurde verworfen/.test(form.container.textContent)
  && !form.container.querySelector(".kd-ki-bewertung"),
"Eine verspätete Antwort für eine alte Draft-Identität wird verworfen und die Eingabe bleibt stehen");

await act(async () => { knopf(form.container, "KI-Bewertung erstellen").click(); await tick(); });
check(writes.length === 0 && !!form.container.querySelector(".kd-ki-bewertung")
  && /WARUM ist vorläufig/.test(form.container.textContent),
"Die fertige KI-Bewertung bleibt inline und kennzeichnet einen unbelegten WARUM-Wert als vorläufig");
await act(async () => { knopf(form.container, "Vorschlag in Eingabe übernehmen").click(); await tick(); });
const achsen = [...form.container.querySelectorAll('input[type="number"]')];
check(achsen.map((element) => element.value).join(",") === "4,3,4",
  "Der Vorschlag füllt die weiterhin sichtbaren Bewertungsfelder erst nach Nutzeraktion");
await act(async () => { setzeWert(achsen[2], "5"); await tick(); });
await act(async () => { knopf(form.container, "Hinzufügen").click(); await tick(); });
check(writes.length === 1 && writes[0].titel === "Alien: Romulus"
  && writes[0].bewertung.warum === 5 && writes[0].prognose.status === "korrigiert"
  && !form.container.querySelector(".kd-mediathek-neuformular"),
"Erst Hinzufügen speichert den korrigierten Wert samt Prognose-Herkunft und schließt das Formular");
await form.cleanup();

const fehlerForm = await mounte(FilmForm, {
  startOffen: true,
  typOptionen: ["film"],
  initial: { titel: "Stalker", jahr: 1979 },
  prognoseAktiv: true,
  onAdd: async () => "stalker_1979",
  onAddMitPrognose: async () => ({ status: "fehler", fehler: "Dienst vorübergehend nicht erreichbar." }),
});
await act(async () => { knopf(fehlerForm.container, "KI-Bewertung erstellen").click(); await tick(); });
check(/Dienst vorübergehend nicht erreichbar/.test(fehlerForm.container.textContent)
  && fehlerForm.container.querySelector('input[placeholder="Titel *"]').value === "Stalker",
"Ein KI-Fehler bleibt sichtbar, ohne Titel oder Formular zu verlieren");
await fehlerForm.cleanup();

let abgebrochenerResolver;
const abbrechenForm = await mounte(FilmForm, {
  startOffen: true,
  typOptionen: ["film"],
  initial: { titel: "Vertigo", jahr: 1958 },
  prognoseAktiv: true,
  onAdd: async () => "vertigo_1958",
  onAddMitPrognose: async () => new Promise((resolve) => { abgebrochenerResolver = resolve; }),
});
await act(async () => { knopf(abbrechenForm.container, "KI-Bewertung erstellen").click(); await tick(); });
await act(async () => { knopf(abbrechenForm.container, "Abbrechen").click(); await tick(); });
await act(async () => { abgebrochenerResolver({ status: "bereit", prognose }); await tick(); });
await act(async () => { knopf(abbrechenForm.container, "+ Eintrag hinzufügen").click(); await tick(); });
check(!knopf(abbrechenForm.container, "KI-Bewertung erstellen").disabled
  && !abbrechenForm.container.querySelector(".kd-ki-bewertung"),
"Eine nach Abbrechen verspätete KI-Antwort bleibt verworfen und sperrt das wieder geöffnete Formular nicht");
await abbrechenForm.cleanup();

const sourceBadge = h("span", { "data-kd-source-labels": JSON.stringify(["Netflix", "Disney+"]) });
const card = await mounte(FilmCard, {
  film: {
    id: "alien_1979", titel: "Alien", jahr: 1979, typ: "film",
    quelle: "dvd+netflix", bewertung: null, prognose: null,
  },
  streamBadge: sourceBadge,
  expanded: true,
  onSave: async () => true,
  vorbewertung: {
    laeuft: false,
    fehler: null,
    sperrgrund: null,
    aktuelleProfilVersion: "p4",
    onErstellen: async () => true,
  },
  filmwissen: {
    phase: "fertig",
    daten: { status: "cache_miss" },
    fehler: null,
    rechercheLaeuft: false,
    rechercheMoeglich: false,
  },
});
const quellenTags = [...card.container.querySelectorAll(".kd-film-quellentag")].map((tag) => tag.textContent);
check(quellenTags.join(",") === "DVD,Netflix,Disney+"
  && card.container.querySelector(".kd-film-quellentag--physisch")?.textContent === "DVD"
  && [...card.container.querySelectorAll(".kd-film-quellentag--abo")]
    .map((tag) => tag.textContent).join(",") === "Netflix,Disney+"
  && card.container.querySelector(".kd-film-bewertungszeile").compareDocumentPosition(
    card.container.querySelector(".kd-film-quellenzeile"),
  ) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
"Gespeicherte und aktuelle Quellen erscheinen dedupliziert in einer eigenen Zeile unter Bewertung und Kategorie");
await act(async () => { knopf(card.container, "Jetzt bewerten").click(); await tick(); });
check(!!card.container.querySelector(".kd-editpanel") && !!card.container.querySelector(".kd-ki-bewertung")
  && card.container.querySelectorAll(".kd-ki-bewertung").length === 1
  && /Quellenbasis für WARUM/.test(card.container.textContent),
"Jetzt bewerten hält Editor, persönliche Prognose und Quellenbasis in einem sichtbaren KI-Bewertungsblock");
await card.cleanup();

const ablauf = [];
let rechercheOptionen = null;
const combined = await mounte(FilmCard, {
  film: { id: "arrival_2016", titel: "Arrival", jahr: 2016, typ: "film", bewertung: null },
  expanded: true,
  vorbewertung: { onErstellen: async () => { ablauf.push("prognose"); return true; } },
  filmwissen: {
    phase: "fertig", daten: { status: "cache_miss" }, rechercheMoeglich: true,
    onRecherchieren: async (optionen) => {
      rechercheOptionen = optionen;
      ablauf.push("quellen");
      return { status: "vorlaeufig", vorlaeufig: true };
    },
  },
});
await act(async () => { knopf(combined.container, "KI-Bewertung erstellen").click(); await tick(); });
check(ablauf.join(",") === "quellen,prognose" && rechercheOptionen?.bereitsAusgeloest === true,
  "Ein KI-Bewertungs-Klick überspringt den zweiten Dialog und setzt nach sicherem Quellenstopp mit einer vorläufigen Prognose fort");
await combined.cleanup();

const unklarerAblauf = [];
const unklar = await mounte(FilmCard, {
  film: { id: "heat_1995", titel: "Heat", jahr: 1995, typ: "film", bewertung: null },
  expanded: true,
  vorbewertung: { onErstellen: async () => { unklarerAblauf.push("prognose"); return true; } },
  filmwissen: {
    phase: "fertig", daten: { status: "cache_miss" }, rechercheMoeglich: true,
    onRecherchieren: async () => { unklarerAblauf.push("quellen"); return false; },
  },
});
await act(async () => { knopf(unklar.container, "KI-Bewertung erstellen").click(); await tick(); });
check(unklarerAblauf.join(",") === "quellen",
  "Ein unklarer Quellen- oder Providerfehler stoppt vor der persönlichen Prognose");
await unklar.cleanup();

check(
  istSichererFilmwissenQuellenstopp({
    code: "server", source: "ai", operation: "task.run",
    reason: "filmwissen-quelle:adapter-http-403",
  })
  && istSichererFilmwissenQuellenstopp({
    code: "server", source: "ai", operation: "task.run",
    reason: "filmwissen-quelle:wikidata-keine-fakten",
  })
  && !istSichererFilmwissenQuellenstopp({
    code: "server", source: "ai", operation: "task.run", reason: "timeout",
  })
  && !istSichererFilmwissenQuellenstopp({
    code: "server", source: "ai", operation: "task.run",
    reason: "filmwissen-quelle:fremder-grund",
  })
  && !istSichererFilmwissenQuellenstopp({
    code: "server", source: "filmwissen", operation: "research", reason: "filmwissen-quelle:adapter-http-403",
  }),
  "Nur bekannte serverseitige Filmwissen-Quellenstopps erlauben den klar vorläufigen Fallback",
);

const controllerQuelltext = fs.readFileSync(path.join(wurzel, "src/controllers/useIntelligenceController.js"), "utf8");
check(/optionen\?\.bereitsAusgeloest && !window\.confirm/.test(controllerQuelltext)
  && /vorlaeufig \? \{ status: "vorlaeufig", vorlaeufig: true \} : false/.test(controllerQuelltext),
"Der Controller unterdrückt nur beim bereits ausgelösten kombinierten Start den zweiten Dialog und gibt den sicheren Fallback explizit zurück");
const draftBlock = controllerQuelltext.slice(
  controllerQuelltext.indexOf("const addFilmMitPrognose"),
  controllerQuelltext.indexOf("const [filmwissenProFilm"),
);
check(!/mutiereMaster|schreibeArtikel/.test(draftBlock)
  && /status: "bereit"/.test(draftBlock)
  && /kontoIstAktuell\(startKonto\)/.test(draftBlock)
  && (draftBlock.match(/filmwissenDienst\.recherchiere/g) || []).length === 1
  && (draftBlock.match(/vorbewertungDienst\(kandidat/g) || []).length === 1
  && /istSichererFilmwissenQuellenstopp/.test(draftBlock),
"Der neue Draft prüft den Kontokontext, besitzt keinen Persistenzpfad und erlaubt höchstens einen Quellen- und Prognoseaufruf");

console.log(`\n${checks}/${checks} KI-Bewertungs-Follow-up-Checks bestanden.`);
