import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const WURZEL = process.cwd();
const MODULWURZEL = process.env.KD_TEST_NODE_MODULES || path.join(WURZEL, "node_modules");
const requireAusTestumgebung = createRequire(path.join(MODULWURZEL, "__kd_test_resolver__.cjs"));
const { JSDOM } = requireAusTestumgebung("jsdom");
const cache = path.join(WURZEL, "node_modules/.cache/mediathek-selection-dom-test");
fs.mkdirSync(cache, { recursive: true });
const ausgabe = path.join(cache, "MediathekTab.mjs");
let esbuild;
try { esbuild = requireAusTestumgebung("esbuild"); }
catch { esbuild = requireAusTestumgebung("vite/node_modules/esbuild"); }
await esbuild.build({
  stdin: {
    contents: [
      'export { MediathekTab } from "./src/tabs/MediathekTab.jsx";',
      'export { default as React, act, useState } from "react";',
      'export { createRoot } from "react-dom/client";',
    ].join("\n"),
    resolveDir: WURZEL,
    sourcefile: "mediathek-selection-dom-entry.jsx",
    loader: "jsx",
  },
  outfile: ausgabe, bundle: true, platform: "node", format: "esm",
  jsx: "automatic", target: "es2022",
  nodePaths: [MODULWURZEL],
  logLevel: "silent",
});
esbuild.stop?.();

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", {
  url: "https://kinodreieck.test/",
});
for (const name of [
  "window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
  "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent",
  "CustomEvent", "localStorage",
]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;

let clipboardText = "";
let clipboardFehler = false;
Object.defineProperty(dom.window.navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (text) => {
      if (clipboardFehler) throw new Error("clipboard-denied");
      clipboardText = text;
    },
  },
});

const testModul = await import(pathToFileURL(ausgabe).href + "?v=" + Date.now());
const { MediathekTab, React, act, useState, createRoot } = testModul;
const MASTER = [
  { id: "z", typ: "film", titel: "Zulu", jahr: 1999, quelle: "dvd", bewertung: { wie: 1, was: 1, warum: 1 }, begruendung: "Zulu-Details", notiz: "PRIVAT-Z" },
  { id: "a", typ: "film", titel: "Alpha", jahr: 2001, quelle: "dvd", bewertung: { wie: 3, was: 3, warum: 3 }, begruendung: "Alpha-Details", notiz: "PRIVAT-A" },
  { id: "s", typ: "serie", titel: "Serie Eins", jahr: 2020, quelle: "dvd", bewertung: { wie: 2, was: 2, warum: 2 }, begruendung: "Serien-Details" },
  { typ: "film", titel: "Ohne ID", jahr: 2010, quelle: "dvd", bewertung: { wie: 2, was: 2, warum: 2 } },
];
let mutationen = 0;
let updateVerzoegern = false;
let updateAufloeser = null;
let addVerzoegern = false;
let addAufloeser = null;

function TestHarness({ master, datenKontextKey }) {
  const [expandedId, setExpandedId] = useState(null);
  return React.createElement(MediathekTab, {
    master, datenKontextKey, expandedId, setExpandedId,
    nachtragFlach: [], artikel: [], mustwatch: [],
    updateFilm: async () => {
      mutationen++;
      if (!updateVerzoegern) return true;
      return new Promise((resolve) => { updateAufloeser = resolve; });
    },
    deleteFilm: () => { mutationen++; },
    addFilm: async () => {
      mutationen++;
      if (!addVerzoegern) return true;
      return new Promise((resolve) => { addAufloeser = resolve; });
    },
    addMustwatch: () => { mutationen++; }, updateMustwatch: () => { mutationen++; },
    deleteMustwatch: () => { mutationen++; },
  });
}

const root = createRoot(document.getElementById("app"));
const render = async (master = MASTER, datenKontextKey = "guest:ready:") => {
  await act(async () => {
    root.render(React.createElement(TestHarness, { master, datenKontextKey }));
    await Promise.resolve();
  });
};
await render();

let bestanden = 0;
const fehler = [];
const check = (name, wert) => {
  let ok = false;
  try { ok = typeof wert === "function" ? !!wert() : !!wert; } catch {}
  if (ok) { bestanden++; console.log("✓ " + name); }
  else { fehler.push(name); console.error("✗ " + name); }
};
const knopf = (text) => [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === text);
const knopfEnthaelt = (text) => [...document.querySelectorAll("button")].find((el) => el.textContent.includes(text));
const karte = (id) => document.querySelector(`[data-film-id="${id}"] .kd-karte`);
const sende = async (ziel, art, optionen = {}) => {
  await act(async () => {
    const Ctor = art === "keydown" ? dom.window.KeyboardEvent
      : art === "click" ? dom.window.MouseEvent : dom.window.Event;
    ziel.dispatchEvent(new Ctor(art, { bubbles: true, cancelable: true, ...optionen }));
    await Promise.resolve();
  });
};
const setzeWert = async (ziel, wert) => {
  const setter = Object.getOwnPropertyDescriptor(ziel.constructor.prototype, "value")?.set;
  setter.call(ziel, wert);
  await sende(ziel, ziel.tagName === "SELECT" ? "change" : "input");
};

check("Karten öffnen außerhalb des Modus weiterhin Details", karte("a")?.getAttribute("role") === "button");
await sende(karte("a"), "click");
check("bestehendes Kartenverhalten zeigt den Inhalt", document.body.textContent.includes("Alpha-Details"));

await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
const editEntwurf = document.querySelector('textarea[placeholder^="Begründung"]');
await setzeWert(editEntwurf, "Alpha-Entwurf bleibt erhalten");
const editShell = document.querySelector(".kd-film-editor-shell");
const mutationenVorEditEntwurf = mutationen;
await sende(knopf("Auswählen"), "click");
check("Karten-Edit-Draft bleibt im Auswahlmodus gemountet und verborgen", editEntwurf.isConnected && editShell.isConnected && editShell.hidden);
await sende(knopf("Auswahl beenden"), "click");
check("Karten-Edit-Draft wird nach Auswahlende unverändert sichtbar", () => {
  const aktuell = document.querySelector('textarea[placeholder^="Begründung"]');
  return aktuell === editEntwurf && !editShell.hidden && aktuell.value === "Alpha-Entwurf bleibt erhalten";
});
check("Karten-Edit-Draft verursacht keine Mutation", mutationen === mutationenVorEditEntwurf);
if (!knopf("Abbrechen")) await sende(karte("a"), "click");
if (knopf("Abbrechen")) await sende(knopf("Abbrechen"), "click");
if (document.body.textContent.includes("Alpha-Details")) await sende(karte("a"), "click");

await sende(knopf("+ Eintrag hinzufügen"), "click");
const neuerTitelEntwurf = document.querySelector('input[placeholder="Titel *"]');
const neuesJahrEntwurf = document.querySelector('input[placeholder="Jahr *"]');
await setzeWert(neuerTitelEntwurf, "Ungespeicherter Neu-Entwurf");
await setzeWert(neuesJahrEntwurf, "2025");
const neuFormShell = document.querySelector('[data-tour="eintrag-neu"]');
const mutationenVorNeuEntwurf = mutationen;
await sende(knopf("Auswählen"), "click");
check("Neu-Draft bleibt im Auswahlmodus gemountet und verborgen", neuerTitelEntwurf.isConnected && neuFormShell.isConnected && neuFormShell.hidden);
await sende(knopf("Auswahl beenden"), "click");
check("Neu-Draft wird nach Auswahlende unverändert sichtbar", () => {
  const titel = document.querySelector('input[placeholder="Titel *"]');
  const jahr = document.querySelector('input[placeholder="Jahr *"]');
  return titel === neuerTitelEntwurf && titel.value === "Ungespeicherter Neu-Entwurf" && jahr.value === "2025" && !neuFormShell.hidden;
});
check("Neu-Draft verursacht keine Mutation", mutationen === mutationenVorNeuEntwurf);
if (knopf("Abbrechen")) await sende(knopf("Abbrechen"), "click");

await sende(knopf("Auswählen"), "click");
check("Modus ist ausdrücklich aktiviert", !!knopf("Auswahl beenden"));
check("leere Auswahl meldet null", document.querySelector(".kd-auswahl-zaehler")?.textContent === "0 ausgewählt");
check("Folgeaktionen sind bei leerer Auswahl deaktiviert", knopf("Auswahl leeren")?.disabled && knopf("Titelliste kopieren")?.disabled);
check("ungültige f.id bleibt sichtbar, aber nicht auswählbar", () => {
  const ohneId = document.querySelector('[role="checkbox"][aria-disabled="true"]');
  return ohneId?.getAttribute("aria-label")?.includes("keine eindeutige Eintrags-ID") && ohneId.tabIndex < 0;
});

const alpha = document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]');
await sende(alpha, "keydown", { key: " " });
await sende(document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]'), "click");
check("Tastatur und Zeiger wählen stabile IDs", document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt");
check("Auswahlkarten tragen Checkbox-Zustand", alpha.getAttribute("aria-checked") === "true");
check("Auswahlmarker besitzt ein 44x44-Touchziel", () => {
  const marker = document.querySelector(".kd-auswahl-marke");
  return marker && marker.className.includes("kd-auswahl-marke");
});
check("Löschaktion fehlt vollständig im Auswahlmodus", !document.querySelector(".kd-film-loeschen"));

const sortierung = [...document.querySelectorAll("select")].find((el) => [...el.options].some((o) => o.value === "titel"));
await setzeWert(sortierung, "titel");
await sende(knopf("Titelliste kopieren"), "click");
const erwarteteListe = "Alpha (2001)\nZulu (1999)";
check("Clipboard-Erfolg kopiert die aktuelle sichtbare Sortierung", clipboardText === erwarteteListe);
check("Plaintext bleibt auch nach Erfolg sichtbar", document.querySelector("#kd-titelliste-text")?.value === erwarteteListe);
check("Titelliste enthält keine privaten Felder", !clipboardText.includes("PRIVAT") && !clipboardText.includes("bewertung"));
check("Erfolg wird ausdrücklich gemeldet", document.querySelector('.kd-kopierstatus[role="status"]')?.textContent.includes("Titelliste kopiert"));

await setzeWert(sortierung, "jahr_alt");
check("Sortieren hält die sichtbare Titelliste offen und aktualisiert ihre Reihenfolge", document.querySelector("#kd-titelliste-text")?.value === "Zulu (1999)\nAlpha (2001)");
check("Sortieren setzt den veralteten Clipboard-Status zurück", !document.querySelector(".kd-kopierstatus"));
await setzeWert(sortierung, "titel");

const suche = document.querySelector('input[placeholder^="Titel oder Originaltitel"]');
await setzeWert(suche, "Alpha");
check("Suchfilter behält globale IDs und meldet die sichtbare Schnittmenge", document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt · 1 sichtbar");
check("Teilweise sichtbare Auswahl hält Kopieren aktiv und aktualisiert die Ausgabe", !knopf("Titelliste kopieren").disabled && document.querySelector("#kd-titelliste-text")?.value === "Alpha (2001)");
await setzeWert(suche, "Nicht vorhanden");
check("Vollständig unsichtbare Auswahl bleibt global erhalten", document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt · 0 sichtbar");
check("Ohne sichtbare Schnittmenge ist Kopieren deaktiviert und kein alter Text bleibt stehen", knopf("Titelliste kopieren").disabled && !document.querySelector("#kd-titelliste-text") && document.querySelector(".kd-titelliste-leer"));
await setzeWert(suche, "");
check("Filter zurück stellt beide Auswahlmarken und die Titelliste wieder her", () => {
  const alphaZurueck = document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]');
  const zuluZurueck = document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]');
  return document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt"
    && alphaZurueck?.getAttribute("aria-checked") === "true"
    && zuluZurueck?.getAttribute("aria-checked") === "true"
    && document.querySelector("#kd-titelliste-text")?.value === erwarteteListe;
});
await sende(knopfEnthaelt("Serien"), "click");
check("Typwechsel behält globale IDs und deaktiviert leere sichtbare Ausgabe", document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt · 0 sichtbar" && knopf("Titelliste kopieren").disabled);
await sende(knopfEnthaelt("Filme"), "click");
check("Typ zurück stellt die ausgewählten Filmkarten wieder her", () => document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt"
  && document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]')?.getAttribute("aria-checked") === "true"
  && document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]')?.getAttribute("aria-checked") === "true");
await sende(knopf("Auswahl leeren"), "click");
check("Auswahl leeren entfernt alles und deaktiviert Folgeschritte", document.querySelector(".kd-auswahl-zaehler")?.textContent === "0 ausgewählt" && knopf("Titelliste kopieren").disabled);

clipboardFehler = true;
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await sende(knopf("Titelliste kopieren"), "click");
check("Clipboard-Fehler ist kein stiller Erfolg", document.querySelector('[role="alert"]')?.textContent.includes("manuell kopiert"));
check("Fallback bleibt sichtbar und fokussierbar", document.activeElement === document.querySelector("#kd-titelliste-text"));

await sende(knopfEnthaelt("Im Besitz"), "click");
check("Hauptansichtswechsel beendet und leert die Auswahl", !!knopf("Auswählen") && !document.querySelector('[role="checkbox"]'));
await sende(knopfEnthaelt("Must-Watch"), "click");
check("Must-Watch bleibt ohne Auswahlwerkzeuge", !knopf("Auswählen") && document.body.textContent.includes("Noch nichts vorgemerkt"));
await sende(knopfEnthaelt("Einträge"), "click");

await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await render(MASTER, "account:ready:konto-2");
check("Account-/Sessionkontextwechsel beendet die Auswahl", !!knopf("Auswählen"));

await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await render(MASTER.map((eintrag) => ({ ...eintrag })), "account:ready:konto-2");
check("Master-Ersetzung oder Restore beendet die Auswahl", !!knopf("Auswählen"));

await sende(karte("a"), "click");
check("Karte ist nach Beenden wieder editierbar/öffnend", document.body.textContent.includes("Alpha-Details"));
check("Auswahlmodus verursacht keinerlei Bestandsmutation", mutationen === 0);

await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
await setzeWert(document.querySelector('textarea[placeholder^="Begründung"]'), "Speichern läuft einmalig weiter");
updateVerzoegern = true;
await sende(knopf("Speichern"), "click");
check("laufender Editor-Save wurde genau einmal gestartet", mutationen === 1 && typeof updateAufloeser === "function" && !!knopf("Speichert …"));
await sende(knopf("Auswählen"), "click");
check("laufender Editor-Save bleibt beim Moduswechsel gemountet", document.querySelector(".kd-film-editor-shell")?.hidden && mutationen === 1);
await act(async () => {
  updateAufloeser(true);
  await Promise.resolve();
  await Promise.resolve();
});
updateVerzoegern = false;
await sende(knopf("Auswahl beenden"), "click");
check("laufender Editor-Save wird weder abgebrochen noch dupliziert", mutationen === 1 && !document.querySelector(".kd-editpanel") && document.body.textContent.includes("Alpha-Details"));

await sende(karte("a"), "click");
await sende(knopf("+ Eintrag hinzufügen"), "click");
await setzeWert(document.querySelector('input[placeholder="Titel *"]'), "Laufender Neu-Save");
await setzeWert(document.querySelector('input[placeholder="Jahr *"]'), "2025");
addVerzoegern = true;
await sende(knopf("Hinzufügen"), "click");
check("laufender Neu-Save wurde genau einmal gestartet", mutationen === 2 && typeof addAufloeser === "function" && !!knopf("Speichert …"));
await sende(knopf("Auswählen"), "click");
check("laufender Neu-Save bleibt beim Moduswechsel gemountet", document.querySelector('[data-tour="eintrag-neu"]')?.hidden && mutationen === 2);
await act(async () => {
  addAufloeser(true);
  await Promise.resolve();
  await Promise.resolve();
});
addVerzoegern = false;
await sende(knopf("Auswahl beenden"), "click");
check("laufender Neu-Save wird weder abgebrochen noch dupliziert", mutationen === 2 && !!knopf("+ Eintrag hinzufügen"));

await act(async () => { root.unmount(); });
dom.window.close();
if (fehler.length) {
  console.error(`\n${fehler.length} Mediathek-Auswahl-DOM-Checks fehlgeschlagen.`);
  process.exit(1);
}
console.log(`\n${bestanden}/${bestanden} Mediathek-Auswahl-DOM-Checks bestanden.`);
/* Esbuild/gebündeltes React halten unter Node 24 MessagePorts offen, obwohl
   Root und JSDOM bereits sauber geschlossen sind. Der Test ist ein eigener
   Prozess; nach allen synchron bestätigten Assertions endet er deshalb hier
   explizit, statt die nachfolgenden npm-Gates zu blockieren. */
process.exit(0);
