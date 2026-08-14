import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const WURZEL = process.cwd();
const MODULWURZEL = process.env.KD_TEST_NODE_MODULES || path.join(WURZEL, "node_modules");
const requireAusTestumgebung = createRequire(path.join(MODULWURZEL, "__kd_test_resolver__.cjs"));
const { JSDOM } = requireAusTestumgebung("jsdom");
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
  "getComputedStyle",
]) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.scrollTo = () => {};

let rafCalls = 0;
globalThis.requestAnimationFrame = (callback) => {
  rafCalls += 1;
  callback();
  return rafCalls;
};
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;

const TEST_BUNDLE_PREFIX = ".kd-cage-alphabet-dom-test-";

const TEST_BUNDLE = path.join(
  tmpdir(),
  `${TEST_BUNDLE_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`,
);

function cleanupBundle() {
  try {
    fs.unlinkSync(TEST_BUNDLE);
  } catch {
    // Kein sichtbarer Fehler bei Cleanup.
  }
}

function cleanupHarnessBundles() {
  try {
    for (const entry of fs.readdirSync(tmpdir())) {
      if (!entry.startsWith(TEST_BUNDLE_PREFIX) || !entry.endsWith(".mjs")) continue;
      try {
        fs.unlinkSync(path.join(tmpdir(), entry));
      } catch {
        // Best effort cleanup.
      }
    }
  } catch {
    // Best effort cleanup.
  }
}

let React;
let act;
let useState;
let useCallback;
let useRef;
let createRoot;
let CageAlphabet;
try {
  await esbuild.build({
    stdin: {
      contents: [
        'export { default as React, act, useState, useCallback, useRef } from "react";',
        'export { createRoot } from "react-dom/client";',
        'export { CageAlphabet } from "./src/components/CageAlphabet.jsx";',
      ].join("\n"),
      resolveDir: WURZEL,
      sourcefile: "cage-alphabet-dom-test-entry.jsx",
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
  esbuild.stop?.();

  ({
    React,
    act,
    useState,
    useCallback,
    useRef,
    createRoot,
    CageAlphabet,
  } = await import(pathToFileURL(TEST_BUNDLE).href));
} catch (error) {
  cleanupBundle();
  throw error;
}

const FILME = [
  { id: "a-1", typ: "film", titel: "Aardvark", originaltitel: "Aardvark", jahr: 1987, quelle: "dvd" },
  { id: "b-1", typ: "film", titel: "Bourne", originaltitel: "Bourne", jahr: 2002, quelle: "dvd" },
  { id: "c-1", typ: "film", titel: "Contact", originaltitel: "Contact", jahr: 1997, quelle: "dvd" },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 2500, intervalMs = 15, label = "Bedingung" } = {}) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`TIMEOUT: ${label}`);
    await wait(intervalMs);
  }
}

function click(node) {
  return act(async () => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function keydown(key, { shift = false } = {}) {
  const target = document.activeElement || document.body;
  return act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }));
  });
}

function buttonByText(label) {
  return [...document.querySelectorAll("button")].find((el) => el.textContent === label);
}

function dialog() {
  return document.querySelector('[role="dialog"]');
}

function scrim() {
  return document.querySelector(".kd-cage-scrim");
}

function panel() {
  return document.querySelector(".kd-cage-karte");
}

function dialogButtons() {
  const context = dialog();
  if (!context) return [];
  return [...context.querySelectorAll("button")].filter((el) => getComputedStyle(el).display !== "none");
}

function hookSnapshot() {
  const hook = window.__cage || {};
  return {
    stakkato: hook.stakkato ?? 0,
    ergebnis: hook.ergebnis ?? null,
  };
}

async function withDeterministicRandom(values, fn) {
  const original = Math.random;
  let index = 0;
  Math.random = () => {
    if (index < values.length) {
      return values[index++];
    }
    return values[values.length - 1] ?? 0.5;
  };
  try {
    await fn();
  } finally {
    Math.random = original;
  }
}

function TestHarness({ reduced = false, onClose, onZeigeEintrag }) {
  const [offen, setOffen] = useState(false);
  const [phase, setPhase] = useState(0);

  const oeffne = useCallback(() => {
    setOffen(true);
  }, []);

  const schliesse = useCallback(() => {
    onClose(phase);
    setOffen(false);
    setPhase((v) => v + 1);
  }, [onClose, phase]);

  const rerender = useCallback(() => setPhase((v) => v + 1), []);

  return React.createElement(
    "div",
    null,
    React.createElement("button", { "data-testid": "cage-open", onClick: oeffne }, "Cage öffnen"),
    React.createElement("button", { "data-testid": "parent-rerender", onClick: rerender }, "Parent neu rendern"),
    offen
      ? React.createElement(CageAlphabet, {
          filme: FILME,
          reduced,
          onClose: schliesse,
          herkunftVon: () => ({ text: "Cage-Herkunft", tab: "mediathek" }),
          onZeigeEintrag,
        })
      : null,
  );
}

const container = document.getElementById("app");
const root = createRoot(container);

const checks = [];
function check(name, passed) {
  const ok = !!passed;
  checks.push([name, ok]);
  console.log((ok ? "✓ " : "✗ ") + name);
}

async function resetView() {
  await act(async () => {
    root.render(null);
  });
  window.__cage = {};
}

async function runCageAlphabetDomTests() {
  const onCloseLog = [];
  const aufrufLog = [];

  // Karte: Schließen-Action vorhanden, 44x44, Escape/Scrim, Stop-Propagation.
  await resetView();
  await act(async () => {
    root.render(
      React.createElement(TestHarness, {
        onClose: (v) => onCloseLog.push(v),
      }),
    );
  });
  const openButton = document.querySelector("[data-testid='cage-open']");
  openButton?.focus();
  await click(openButton);
  await waitFor(() => !!dialog(), { label: "Karte öffnet" });
  const closeCard = buttonByText("Schließen");
  check("Karte zeigt explizit Schließen", !!closeCard && closeCard.closest(".kd-cage-karte"));
  const closeStyle = closeCard ? getComputedStyle(closeCard) : null;
  check("Karte-Schließen >= 44x44", !!closeStyle && closeStyle.minWidth === "44px" && closeStyle.minHeight === "44px");

  await click(closeCard);
  await waitFor(() => !dialog(), { label: "Karte-Close via Button" });
  const postCardClose = hookSnapshot();
  check("Karte-Übergreifendes Click-Start ist verhindert", onCloseLog.length === 1);
  check("Kartenscrim/Start bleibt aus, kein Stakkato nach Close", !document.body.textContent.includes("Er kann alles sein.") && postCardClose.stakkato === 0 && !postCardClose.ergebnis);

  const openButtonEsc = document.querySelector("[data-testid='cage-open']");
  openButtonEsc.focus();
  await click(openButtonEsc);
  await waitFor(() => !!dialog(), { label: "Neu geöffnete Karte für Escape" });
  await keydown("Escape");
  await waitFor(() => !dialog(), { label: "Karte per Escape" });
  check("Karte schließt über Escape", onCloseLog.length === 2 && document.activeElement === openButtonEsc);

  const openButtonScrim = document.querySelector("[data-testid='cage-open']");
  openButtonScrim.focus();
  await click(openButtonScrim);
  await waitFor(() => !!dialog(), { label: "Neu geöffnete Karte für Scrim" });
  await click(scrim());
  await waitFor(() => !dialog(), { label: "Karte per Scrim" });
  check("Karte-Schluss per Scrim und Fokusrückgabe", onCloseLog.length === 3 && document.activeElement === openButtonScrim);

  // Stakkato deterministisch, Parent-Rerender während Lauf, Fokus-Rückgabe + Focus Trap + konkurrierende Dismiss.
  onCloseLog.length = 0;
  aufrufLog.length = 0;
  await resetView();
  await withDeterministicRandom(
    [0, 0.6, 0.2, 0.4, 0.8, 0.1, 0.3, 0.5, 0.7, 0.9, 0.11, 0.22, 0.33, 0.44, 0.55],
    async () => {
      await act(async () => {
        root.render(
          React.createElement(TestHarness, {
            onClose: (v) => onCloseLog.push(v),
            onZeigeEintrag: (film, tab) => aufrufLog.push({ film, tab }),
          }),
        );
      });
      const openButtonStakkato = document.querySelector("[data-testid='cage-open']");
      await click(openButtonStakkato);
      await waitFor(() => !!panel(), { label: "Stakkato-Panel da" });
      await click(panel());
      await waitFor(() => (window.__cage?.stakkato || 0) >= 1, { label: "Stakkato startet" });
      await click(document.querySelector("[data-testid='parent-rerender']"));
      await waitFor(() => window.__cage?.ergebnis, { timeoutMs: 2600, label: "Stakkato führt zu Ergebnis" });
      check("Stakkato läuft trotz Parent-Rerender weiter", dialog() && document.body.textContent.includes("Er kann alles sein."));
      check("Deterministische Stakkato-Länge ist 15", window.__cage?.stakkato === 15);
      check("Stakkato auf OnClose-Path stabil", onCloseLog.length === 0);
      const closeButtons = dialogButtons();
      check("Ergebnis enthält Schließen + Zum Eintrag", closeButtons.length === 2 && closeButtons.some((b) => b.textContent === "Zum Eintrag"));
      const closeBtn = buttonByText("Schließen");
      const closeResultStyle = closeBtn ? getComputedStyle(closeBtn) : null;
      check("Ergebnis-Schließen >= 44x44", !!closeResultStyle && closeResultStyle.minWidth === "44px" && closeResultStyle.minHeight === "44px");
      closeBtn?.focus();
      await keydown("Tab");
      const afterTab = document.activeElement;
      check("Tab verbleibt im Dialog (auch nach Fokuswechsel)", !!afterTab && !!afterTab.closest(".kd-cage-scrim"));
      await keydown("Tab", { shift: true });
      const afterShiftTab = document.activeElement;
      check("Shift+Tab bleibt im Dialog", !!afterShiftTab && !!afterShiftTab.closest(".kd-cage-scrim"));

      // Zusätzlicher konkurrierender Scrim+Escape-Check auf frischer Stakkato-Runde.
      onCloseLog.length = 0;
      await resetView();
    },
  );

  await resetView();
  await withDeterministicRandom(
    [0, 0.6, 0.2, 0.4, 0.8, 0.1, 0.3, 0.5],
    async () => {
      await act(async () => {
        root.render(
          React.createElement(TestHarness, {
            onClose: (v) => onCloseLog.push(v),
            onZeigeEintrag: (film, tab) => aufrufLog.push({ film, tab }),
          }),
        );
      });
      const openButtonStakkatoDismiss = document.querySelector("[data-testid='cage-open']");
      await click(openButtonStakkatoDismiss);
      await waitFor(() => !!panel(), { label: "Dismiss-Stakkato-Panel da" });
      await click(panel());
      await waitFor(() => (window.__cage?.stakkato || 0) >= 1, { label: "Dismiss-Test: Stakkato startet" });
      const stakkatoSnapshotBeforeDismiss = hookSnapshot();
      check(
        "Dismiss findet bei laufendem Stakkato statt",
        stakkatoSnapshotBeforeDismiss.stakkato >= 1 && stakkatoSnapshotBeforeDismiss.ergebnis === null,
      );
      const closeBefore = onCloseLog.length;
      await keydown("Escape");
      await waitFor(() => !dialog(), { label: "Dismiss-Test: Stakkato Escape" });
      await wait(1600);
      const stakkatoSnapshotAfterDismiss = hookSnapshot();
      check("Dismiss erfasst vollständigen Hook-Snapshot", stakkatoSnapshotBeforeDismiss.stakkato === stakkatoSnapshotAfterDismiss.stakkato);
      check("Dismiss verhindert spät ein Ergebnis", stakkatoSnapshotAfterDismiss.ergebnis === stakkatoSnapshotBeforeDismiss.ergebnis);
      check("Dismiss erlaubt keinen Stakkato-Fortschritt nachher", stakkatoSnapshotBeforeDismiss.stakkato === stakkatoSnapshotAfterDismiss.stakkato);
      check("Stakkato-Dismiss schließt über Escape", onCloseLog.length === closeBefore + 1 && !dialog());
      onCloseLog.length = 0;
      await resetView();
    },
  );

  await resetView();
  await act(async () => {
    root.render(
      React.createElement(TestHarness, {
        onClose: (v) => onCloseLog.push(v),
        onZeigeEintrag: (film, tab) => aufrufLog.push({ film, tab }),
      }),
    );
  });
  const openButtonConcurrent = document.querySelector("[data-testid='cage-open']");
  await click(openButtonConcurrent);
  await waitFor(() => !!panel(), { label: "Concurrent-Fall: Karte offen" });
  await click(panel());
  await waitFor(() => (window.__cage?.stakkato || 0) >= 1, { label: "Concurrent-Fall: Stakkato läuft" });
  await keydown("Escape");
  const closeScrim = scrim();
  if (closeScrim) await click(closeScrim);
  await wait(1200);
  check("onClose bleibt bei konkurrierenden Dismiss-Signalen bei 1", onCloseLog.length === 1);

  // Ergebnis-Reihenfolge: Reduced Motion + Zum Eintrag + Escape/Scrim.
  onCloseLog.length = 0;
  aufrufLog.length = 0;
  await resetView();
  await act(async () => {
    root.render(
      React.createElement(TestHarness, {
        reduced: true,
        onClose: (v) => onCloseLog.push(v),
        onZeigeEintrag: (film, tab) => aufrufLog.push({ film, tab }),
      }),
    );
  });
  const openButtonReduced = document.querySelector("[data-testid='cage-open']");
  await click(openButtonReduced);
  await click(panel());
  await waitFor(() => document.body.textContent.includes("Er kann alles sein."), { label: "Reduced Motion direkt Ergebnis" });
  const zuEintrag = buttonByText("Zum Eintrag");
  await click(zuEintrag);
  check("Zum Eintrag kann aufgerufen werden", aufrufLog.length === 1 && !!aufrufLog[0].film && aufrufLog[0].tab === "mediathek");
  const focusList = dialogButtons();
  if (focusList.length > 0) {
    document.body.focus();
    await keydown("Tab");
    check("Tab fängt Fokus im Ergebnis", !!document.activeElement && !!document.activeElement.closest(".kd-cage-scrim"));
    await keydown("Tab", { shift: true });
    check("Shift+Tab bleibt im Ergebnis", !!document.activeElement && !!document.activeElement.closest(".kd-cage-scrim"));
  }
  await keydown("Escape");
  await waitFor(() => !dialog(), { label: "Ergebnis Escape (reduced)" });
  check("Ergebnis schließt via Escape", onCloseLog.length >= 1 && !dialog());

  await act(async () => {
    root.render(
      React.createElement(TestHarness, {
        reduced: true,
        onClose: (v) => onCloseLog.push(v),
      }),
    );
  });
  const openButtonReducedScrim = document.querySelector("[data-testid='cage-open']");
  await click(openButtonReducedScrim);
  await click(panel());
  await waitFor(() => document.body.textContent.includes("Er kann alles sein."), { label: "Ergebnis für Scrim (reduced)" });
  await click(scrim());
  await waitFor(() => !dialog(), { label: "Ergebnis Scrim (reduced)" });
  check("Ergebnis schließt per Scrim", !dialog());

  const bestanden = checks.filter(([, p]) => p).length;
  const total = checks.length;
  console.log(`\n${bestanden}/${total} Checks bestanden.`);
  if (bestanden < total) {
    console.log("CAGE-DOM-TEST: BEFUNDE OBEN");
    process.exitCode = 1;
  } else {
    console.log("CAGE-DOM-TEST BESTANDEN");
    process.exitCode = 0;
  }
}

async function teardownCageAlphabetDomHarness() {
  await act(async () => {
    root.render(null);
  });
  cleanupBundle();
  cleanupHarnessBundles();
  delete window.__cage;
  if (typeof dom.window.close === "function") {
    dom.window.close();
  }
}

let exitCode = 0;
(async () => {
  try {
    await runCageAlphabetDomTests();
  } catch (error) {
    exitCode = 1;
    console.error(error);
  }
  try {
    await teardownCageAlphabetDomHarness();
  } catch (error) {
    exitCode = 1;
    console.error(error);
  }
  process.exit(exitCode);
})();
