import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
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

const dom = new JSDOM_TEST("<!doctype html><html><body><main id='app'></main></body></html>", {
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

const TEST_BUNDLE = path.join(tmpdir(), `.kd-hilfe-dom-test-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
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

const checks = [];
const check = (name, pass) => checks.push([name, !!pass]);

const pflicht = {
  refGebunden: 0,
  triggerGefunden: 0,
  triggerGeoeffnet: 0,
  dialogPortal: 0,
  dialogTitel: 0,
  panelGefunden: 0,
  titelUndZiele: 0,
  focusErster: 0,
  focusRingVorwaerts: 0,
  focusRingRueckwaerts: 0,
  lockVor: 0,
  scrimClose: 0,
  focusReturn: 0,
  lockReopen: 0,
  rerenderCloseAufheben: 0,
  rerenderFokus: 0,
  escapeClose: 0,
  scrollRestore: 0,
  dokuRender: 0,
  dokuKeyboard: 0,
};

function step(name) {
  if (Object.hasOwn(pflicht, name)) pflicht[name] += 1;
}

function pflichtAusgedrueckt() {
  return Object.values(pflicht).every((v) => v > 0);
}

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
  return [...(node?.querySelectorAll("button, a[href], input, select, textarea, [tabindex]") || [])].filter(istHelferFokusziel);
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

function bodyStyleSnapshot() {
  return {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
  };
}

const container = document.getElementById("app");
const root = createRoot(container);
const bindState = { current: null };

function HilfeHarness({ bind }) {
  const ausloeser = useRef(null);
  const [offen, setOffen] = useState(false);
  const [tick, setTick] = useState(0);
  const onRerender = useCallback(() => setTick((aktueller) => aktueller + 1), []);
  const schliesseHilfe = useCallback(() => setOffen(false), []);
  const oeffneHilfe = useCallback(() => setOffen(true), []);

  if (bind) {
    bind.current = {
      ausloeser,
      setOffen,
      onRerender,
      schliesseHilfe,
      oeffneHilfe,
      tick,
    };
  }

  return React.createElement(
    "div",
    null,
    React.createElement("h1", null, "HilfeDOM"),
    React.createElement(
      "button",
      { ref: ausloeser, onClick: oeffneHilfe },
      "Anleitung öffnen",
    ),
    React.createElement("button", { onClick: onRerender, "data-testid": "irrelevant-rerender" }, "irrelevant"),
    React.createElement("p", null, `tick ${tick}`),
    offen ? React.createElement(HilfeSheet, { onClose: schliesseHilfe }) : null,
  );
}

async function renderHilfe() {
  await act(async () => {
    root.render(React.createElement(HilfeHarness, { bind: bindState }));
    await Promise.resolve();
  });
}

async function runHilfeDomTest() {
  await renderHilfe();

  const ausloeser = bindState.current?.ausloeser?.current;
  check("App-Kontrakt: stabile Ref-Übertragung", !!bindState.current);
  check("App-konformer Hilfetrigger ist referenzierbar", !!ausloeser);
  if (!ausloeser) {
    throw new Error("Auslöser konnte nicht gebunden werden");
  }
  step("refGebunden");
  step("triggerGefunden");

  const vorLock = bodyStyleSnapshot();
  const baselineClass = document.body.className;

  ausloeser.focus();
  step("triggerGeoeffnet");
  await act(async () => { ausloeser.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  step("triggerGeoeffnet");

  const dialog = document.body.querySelector('[role="dialog"]');
  const panel = dialog?.querySelector(".kd-help-panel");
  const scrim = document.body.querySelector(".kd-sheet-scrim");

  check("HilfeSheet rendert role=dialog + aria-modal im Body-Portal", !!dialog && dialog.getAttribute("aria-modal") === "true");
  check("HilfeSheet liegt im Body-Portal", !!dialog && !!(dialog.parentElement === document.body));
  check("HilfeSheet trägt kanonischen Titel", dialog?.getAttribute("aria-labelledby") === "kd-help-titel");
  check("HilfeSheet enthält 7 Titel mit stabilen Datenzielen", !!panel
    && panel.querySelectorAll("h3").length === 7
    && [...panel.querySelectorAll("article[data-hilfe-ziel]")].map((node) => node.getAttribute("data-hilfe-ziel")).join("|") === "start|kino|mediathek|streaming|finder|blog|daten");
  const titles = [...(panel?.querySelectorAll("h3") || [])].map((node) => node.textContent?.trim()).filter(Boolean);
  const dataGoals = [...(panel?.querySelectorAll("article[data-hilfe-ziel]") || [])].map((node) => node.getAttribute("data-hilfe-ziel"));
  check("HilfeSheet liest Titel aus HILFE_BEREICHE", titles.length === HILFE_BEREICHE.length
    && titles.every((titel) => HILFE_BEREICHE.some((bereich) => bereich.titel === titel))
    && dataGoals.length === HILFE_BEREICHE.length
    && dataGoals.every((ziel) => HILFE_BEREICHE.some((bereich) => bereich.ziel === ziel)));

  step("dialogPortal");
  step("dialogTitel");
  step("panelGefunden");
  step("titelUndZiele");

  const panelFocusables = fokusziele(panel);
  check("HilfeSheet fokussiert beim Öffnen ein gültiges Panelziel", panelFocusables.length > 0
    && panel?.contains(document.activeElement));
  if (panelFocusables.length > 0) step("focusErster");
  else {
    check("HilfeSheet kann Fokusziel bestimmen", false);
  }

  const first = panelFocusables[0];
  const last = panelFocusables[panelFocusables.length - 1];
  const outerTarget = container.querySelector('[data-testid="irrelevant-rerender"]');
  if (panelFocusables.length > 1) {
    await act(async () => { last.focus(); });
    await act(async () => { tastatur("Tab"); });
    check("HilfeSheet Tab fährt vom letzten Fokusziel auf das erste", document.activeElement === first);
    if (document.activeElement === first) step("focusRingVorwaerts");

    await act(async () => { first.focus(); });
    await act(async () => { tastatur("Tab", { shift: true }); });
    check("HilfeSheet Shift+Tab fährt vom ersten Fokusziel auf das letzte", document.activeElement === last);
    if (document.activeElement === last) step("focusRingRueckwaerts");
  } else {
    check("HilfeSheet Tab/Shift+Tab bleibt bei Einzelziel im Dialog", panelFocusables.includes(document.activeElement));
  }
  if (outerTarget) {
    await act(async () => { outerTarget.focus(); });
    await act(async () => { tastatur("Tab"); });
    check("HilfeSheet fängt Fokus nach externem Fokus korrekt zurück", document.activeElement === first);
  }

  const ownerRef = sperreDokumentScroll();
  step("lockVor");
  check("Scrim ist vorhanden", !!scrim);
  check("Owner-Lock bleibt während Sheet offen", document.body.classList.contains("kd-scroll-gesperrt")
    && document.body.style.position === "fixed");

  await act(async () => { scrim?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  check("HilfeSheet schließt über Scrim", !document.body.querySelector('[role="dialog"]'));
  if (!document.body.querySelector('[role="dialog"]')) step("scrimClose");
  check("Focus geht bei Scrim-Schluss auf Auslöser zurück", document.activeElement === ausloeser);
  if (document.activeElement === ausloeser) step("focusReturn");
  check("Owner-Lock kann durch verschachtelte Sperre noch aktiv sein", document.body.classList.contains("kd-scroll-gesperrt")
    && document.body.style.position === "fixed");
  step("lockReopen");

  await act(async () => { bindState.current?.oeffneHilfe?.(); });
  const reopenDialog = document.body.querySelector('[role="dialog"]');
  const reopenPanel = reopenDialog?.querySelector(".kd-help-panel");
  const reopenFocus = document.activeElement;
  check("HilfeSheet kann erneut geöffnet werden", !!reopenDialog && reopenDialog.getAttribute("role") === "dialog");

  await act(async () => { bindState.current?.onRerender?.(); });
  check("Rerender erhält späteres Fokusziel unverändert", !!reopenFocus && reopenFocus === document.activeElement);
  if (!!reopenFocus && reopenFocus === document.activeElement) step("rerenderFokus");
  const reopenFocusables = fokusziele(reopenPanel);
  check("Rerender bleibt auf Fokusziel innerhalb des Dialogs", reopenFocusables.includes(document.activeElement));
  step("rerenderCloseAufheben");

  await act(async () => { tastatur("Escape"); });
  check("Escape fokussiert den Auslöser", document.activeElement === ausloeser);
  if (document.activeElement === ausloeser) step("escapeClose");

  ownerRef?.();
  const afterBody = bodyStyleSnapshot();
  check("Owner-Scrolllock kann danach korrekt wiederherstellen", afterBody.overflow === vorLock.overflow
    && afterBody.position === vorLock.position
    && afterBody.top === vorLock.top
    && afterBody.left === vorLock.left
    && afterBody.right === vorLock.right
    && afterBody.width === vorLock.width
    && document.body.className === baselineClass);
  step("scrollRestore");
}

async function runDokuAnsichtTest() {
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
  const dokuH3Count = doku ? doku.querySelectorAll(".kd-doku-hilfe h3").length : 0;
  const dialogInDoku = doku?.querySelector('[role="dialog"]');
  check("DokuAnsicht ist inline ohne nested Modals", !!doku && !dialogInDoku && dokuH3Count === 7);
  if (!!doku && dokuH3Count === 7) {
    step("dokuRender");
  }
  check("DokuAnsicht nutzt dieselben sieben Titel/Ziele", dokuH3Count === 7
    && names.join("|") === HILFE_BEREICHE.map((bereich) => bereich.titel).join("|")
    && dokuZiele.join("|") === "start|kino|mediathek|streaming|finder|blog|daten");

  if (bereiche[0]) {
    const erste = bereiche[0].querySelector("summary");
    erste.focus();
    await act(async () => { erste.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    check("DokuAnsicht-Details öffnen sich via Keyboard", !!bereiche[0].open);
    if (bereiche[0].open) {
      step("dokuKeyboard");
    }
  }

  const summaryListe = bereiche.map((b) => b.querySelector("summary")).filter(Boolean);
  await act(async () => { summaryListe[1]?.focus(); });
  await act(async () => { tastatur("Tab"); });
  check("Tastatur-Navigation in DokuAnsicht ist fokussierbar", document.activeElement !== document.body);
}

(async () => {
  let ok = true;
  try {
    await runHilfeDomTest();
    await runDokuAnsichtTest();
  } finally {
    await act(async () => { root.render(null); });
    if (TEST_BUNDLE) {
      try {
        fs.unlinkSync(TEST_BUNDLE);
      } catch {
        // Aufräumen: kein sichtbarer Fehler bei vorhandenen Testabbruchwegen.
      }
    }
  }

  check("Ausführungszähler-Pflichtvertrag vollständig", pflichtAusgedrueckt());

  for (const [name, pass] of checks) {
    console.log(`${pass ? "✓" : "✗"} ${name}`);
    ok = ok && pass;
  }

  console.log(ok ? "HILFE_DOM-TEST BESTANDEN" : "HILFE_DOM-TEST FEHLGESCHLAGEN");
  process.exit(ok ? 0 : 1);
})();
