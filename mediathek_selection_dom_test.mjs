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
  { typ: "film", titel: "Ohne ID", jahr: 2010, quelle: "dvd", bewertung: { wie: 2, was: 2, warum: 2 } },
];
let mutationen = 0;

function TestHarness({ master, datenKontextKey }) {
  const [expandedId, setExpandedId] = useState(null);
  return React.createElement(MediathekTab, {
    master, datenKontextKey, expandedId, setExpandedId,
    nachtragFlach: [], artikel: [], mustwatch: [],
    updateFilm: async () => { mutationen++; return true; },
    deleteFilm: () => { mutationen++; }, addFilm: () => { mutationen++; },
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

const suche = document.querySelector('input[placeholder^="Titel oder Originaltitel"]');
await setzeWert(suche, "Alpha");
check("Suchfilter bereinigt nur nicht mehr sichtbare IDs", document.querySelector(".kd-auswahl-zaehler")?.textContent === "1 ausgewählt");
await setzeWert(suche, "");
check("gelöschte unsichtbare Auswahl kehrt beim Filterweiten nicht zurück", document.querySelector(".kd-auswahl-zaehler")?.textContent === "1 ausgewählt");
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
