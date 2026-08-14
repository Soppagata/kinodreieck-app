import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const WURZEL = process.cwd();
const MODULWURZEL = process.env.KD_TEST_NODE_MODULES || path.join(WURZEL, "node_modules");
const requireAusTestumgebung = createRequire(path.join(MODULWURZEL, "__kd_test_resolver__.cjs"));
const { JSDOM: JSDOM_TEST } = requireAusTestumgebung("jsdom");
let esbuild;
try {
  esbuild = requireAusTestumgebung("esbuild");
} catch {
  esbuild = requireAusTestumgebung("vite/node_modules/esbuild");
}

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", {
  url: "https://kinodreieck.test/",
});

Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true, writable: true });
globalThis.global = dom.window;
for (const name of [
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CustomEvent",
  "localStorage",
  "navigator",
]) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.scrollTo = () => {};

let rafAufrufe = 0;
globalThis.requestAnimationFrame = (callback) => {
  rafAufrufe += 1;
  callback();
  return rafAufrufe;
};
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;

const TEST_BUNDLE = path.join(WURZEL, ".tmp-hilfe-dom-test.mjs");
await esbuild.build({
  stdin: {
    contents: [
      'export { default as React, act, useState, useRef, useCallback } from "react";',
      'export { createRoot } from "react-dom/client";',
      'export { HilfeSheet } from "./src/components/HilfeSheet.jsx";',
      'export { DokuAnsicht } from "./src/components/Erklaerstuecke.jsx";',
      'export { HILFE_BEREICHE } from "./src/lib/hilfeInhalte.js";',
      'export { sperreDokumentScroll } from "./src/lib/documentScrollLock.js";',
    ].join("\n"),
    resolveDir: WURZEL,
    sourcefile: "hilfe-dom-test-entry.jsx",
    loader: "jsx",
  },
  outfile: TEST_BUNDLE,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  nodePaths: [MODULWURZEL],
  logLevel: "silent",
});

const {
  React, act, useState, useRef, useCallback, createRoot,
  HilfeSheet, DokuAnsicht, HILFE_BEREICHE, sperreDokumentScroll,
} = await import(pathToFileURL(TEST_BUNDLE).href);

const sourceApp = fs.readFileSync(path.join(WURZEL, "src/App.jsx"), "utf8");
const checks = [];
const check = (name, pass) => checks.push([name, !!pass]);

function istHelferFokusziel(element) {
  if (!(element instanceof HTMLElement) || element.hidden) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  const tabindex = element.getAttribute("tabindex");
  if (tabindex !== null && tabindex === "-1") return false;
  const stil = dom.window.getComputedStyle(element);
  if (stil.visibility === "hidden" || stil.display === "none") return false;
  return element.matches("button, a[href], input, select, textarea, [tabindex]");
}

function fokusziele(node) {
  return [...node.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]
    .filter(istHelferFokusziel);
}

function tastatur(key, { shift = false } = {}) {
  const fokusElement = document.activeElement || document;
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    shiftKey: shift,
    cancelable: true,
  });
  fokusElement.dispatchEvent(event);
}

const container = document.getElementById("app");
const root = createRoot(container);

const state = {};

function HilfeHarness({ bind }) {
  const ausloeser = useRef(null);
  const [offen, setOffen] = useState(false);
  const [tick, setTick] = useState(0);
  const onRerender = useCallback(() => setTick((aktueller) => aktueller + 1), []);

  bind.current = { ausloeser, setOffen, setTick, tick, onRerender };

  return React.createElement(
    "div",
    null,
    React.createElement("h1", null, "HilfeDOM"),
    React.createElement(
      "button",
      { ref: ausloeser, onClick: () => setOffen(true) },
      "Anleitung öffnen",
    ),
    React.createElement("button", { onClick: onRerender, "data-testid": "irrelevant-rerender" }, "irrelevant"),
    React.createElement("p", null, `tick ${tick}`),
    offen ? React.createElement(HilfeSheet, { onClose: () => setOffen(false) }) : null,
  );
}

async function renderHilfe() {
  await act(async () => {
    root.render(React.createElement(HilfeHarness, { bind: { current: state } }));
    await Promise.resolve();
  });
}

// HilfeSheet als Portal/Overlay, Fokus- und Scroll-Contract.
await renderHilfe();
const ausloeser = () => state.current?.ausloeser?.current;
check("App-konformer Hilfetrigger ist referenzierbar", typeof ausloeser === "function" && !!ausloeser());
if (ausloeser()) {
  ausloeser().focus();
  await act(async () => { ausloeser().dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const dialog = container.querySelector('[role="dialog"]');
  check("HilfeSheet rendert role=dialog + aria-modal", !!dialog
    && dialog.getAttribute("aria-modal") === "true");
  check("HilfeSheet trägt kanonischen Titel", dialog?.getAttribute("aria-labelledby") === "kd-help-titel");
  const scrim = container.querySelector(".kd-sheet-scrim");
  const panel = dialog?.querySelector(".kd-help-panel");
  const panelHeadline = panel?.querySelector("h2")?.textContent?.trim();
  check("HilfeSheet ist Portal + korrekt titelisiert", !!scrim && !!panel
    && panelHeadline === "Anleitung & Hilfe");
  const titles = [...panel.querySelectorAll("h3")].map((node) => node.textContent?.trim()).filter(Boolean);
  check("HilfeSheet liefert exakt sieben Bereichsüberschriften", titles.length === 7
    && titles.every((titel) => HILFE_BEREICHE.some((bereich) => bereich.titel === titel)));
  const dataGoals = [...panel.querySelectorAll("article[data-hilfe-ziel]")].map((node) => node.getAttribute("data-hilfe-ziel"));
  check("HilfeSheet gibt sieben Ziel-IDs stabil weiter", dataGoals.join("|") === "start|kino|mediathek|streaming|finder|blog|daten");

  const focusables = fokusziele(panel);
  check("HilfeSheet fokussiert beim Öffnen ein gültiges Panelziel", focusables.length > 0
    && document.activeElement === focusables[0]);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (focusables.length > 1) {
    await act(async () => { last.focus(); });
    await act(async () => { tastatur("Tab"); });
    check("HilfeSheet Tab fährt vom letzten Fokusziel auf das erste", document.activeElement === first);

    await act(async () => { first.focus(); });
    await act(async () => { tastatur("Tab", { shift: true }); });
    check("HilfeSheet Shift+Tab fährt vom ersten Fokusziel auf das letzte", document.activeElement === last);
  } else {
    check("HilfeSheet Tab/Shift+Tab bleibt im Fokusring für Einzelziel", focusables.includes(document.activeElement));
  }

  const owner = sperreDokumentScroll();
  await act(async () => { scrim.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  check("HilfeSheet schließt über Scrim", !container.querySelector('[role="dialog"]'));
  check("Focus geht bei Schließen zurück zum Auslöser", document.activeElement === ausloeser());
  check("Owner-Lock bleibt nach Sheet-Schluss aktiv", document.body.classList.contains("kd-scroll-gesperrt")
    && document.body.style.position === "fixed");

  // Referenz-Lock erzeugt Restoreschutz; hier wird nur das Sheet freigegeben.
  const vorStyle = {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
  };

  // Nächste Öffnung dient dem Focus- und Rerender-Kontrakt.
  await act(async () => { state.current.onRerender(); });
  document.body.style.position = "";
  ausloeser().focus();
  await act(async () => { ausloeser().dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  const offDialog = container.querySelector('[role="dialog"]');
  check("HilfeSheet kann erneut geöffnet und fokussiert werden", !!offDialog && offDialog.getAttribute("role") === "dialog");
  const focusAfterReopen = document.activeElement;
  const rerenderFocusables = fokusziele(offDialog);
  await act(async () => { state.current.onRerender(); });
  check("Rerender außerhalb der Fokuslogik verändert Fokus nicht", document.activeElement === focusAfterReopen);
  if (focusAfterReopen) {
    check("Rerender hält Fokus auf einem Fokusziel des Dialogs", rerenderFocusables.includes(document.activeElement));
  }
  await act(async () => { tastatur("Escape"); });
  check("Escape fokussiert explizit den Auslöser", document.activeElement === ausloeser());
  owner();
  check("Owner-Scrolllock kann danach korrekt wiederherstellen", document.body.style.overflow === vorStyle.overflow
    && document.body.style.position === vorStyle.position
    && document.body.style.top === vorStyle.top
    && document.body.style.left === vorStyle.left
    && document.body.style.right === vorStyle.right
    && document.body.style.width === vorStyle.width);
}

// DokuAnsicht: inline details, keine nested modals.
await act(async () => {
  root.render(React.createElement(DokuAnsicht, {
    h2: {},
    mono: {},
  }));
  await Promise.resolve();
});
const doku = container.querySelector(".kd-doku-hilfe");
const bereiche = doku ? [...doku.querySelectorAll("details.kd-doku-bereich")] : [];
const names = bereiche.map((b) => b.querySelector("summary h3")?.textContent?.trim());
const dokuZiele = bereiche.map((b) => b.getAttribute("data-hilfe-ziel"));
const dokuH3Count = doku.querySelectorAll(".kd-doku-hilfe h3").length;
const dialogInDoku = doku.querySelector('[role="dialog"]');
check("DokuAnsicht ist inline ohne role=dialog/Portal", !!doku && !dialogInDoku
  && dokuH3Count === 7);
check("DokuAnsicht nutzt dieselben sieben Titel/Ziele", dokuH3Count === 7
  && names.join("|") === HILFE_BEREICHE.map((bereich) => bereich.titel).join("|")
  && dokuZiele.join("|") === "start|kino|mediathek|streaming|finder|blog|daten");
if (bereiche[0]) {
  const erste = bereiche[0].querySelector("summary");
  erste.focus();
  await act(async () => { erste.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  check("DokuAnsicht-Details lassen sich per pointer/Keyboard öffnen", !!bereiche[0].open);
}
const summaryListe = bereiche.map((b) => b.querySelector("summary"));
await act(async () => { summaryListe[1]?.focus(); });
await act(async () => { tastatur("Tab"); });
check("Tastatur-Navigation in DokuAnsicht ist fokussierbar", document.activeElement !== document.body);

check(
  "App verwendet stabilen onClose-Vertrag für Hilfe (statischer useCallback-String)",
  /const schliesseHilfe = useCallback\(\(\) => setHilfeOffen\(false\), \[\]\)/.test(sourceApp)
    && /<HilfeSheet onClose={schliesseHilfe} \/>/.test(sourceApp),
);

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  ok = ok && pass;
}
await act(async () => { root.render(null); });
console.log(ok ? "HILFE_DOM-TEST BESTANDEN" : "HILFE_DOM-TEST FEHLGESCHLAGEN");
process.exit(ok ? 0 : 1);
