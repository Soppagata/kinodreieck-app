#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const WURZEL = process.cwd();
const MODULWURZEL = process.env.KD_TEST_NODE_MODULES || path.join(WURZEL, "node_modules");
const requireAusTestumgebung = createRequire(path.join(MODULWURZEL, "__kd_test_resolver__.cjs"));
const { JSDOM } = requireAusTestumgebung("jsdom");
let esbuild;
try { esbuild = requireAusTestumgebung("esbuild"); }
catch { esbuild = requireAusTestumgebung("vite/node_modules/esbuild"); }

const source = (datei) => readFileSync(path.join(WURZEL, datei), "utf8");
const app = source("src/App.jsx");
const navigation = source("src/components/AppNavigation.jsx");
const start = source("src/tabs/StartTab.jsx");
const settings = source("src/tabs/DatenTab.jsx");
const einstieg = source("src/components/EinstiegsGate.jsx");
const privacy = source("src/components/PrivatePilotOps.jsx");

let checks = 0;
const check = (name, callback) => {
  callback();
  checks += 1;
  console.log(`✓ ${name}`);
};

check("Start enthält keinen zweiten Hilfe-Einstieg mehr", () => {
  assert.doesNotMatch(start, /\? Anleitung &amp; Hilfe|onHilfe/);
  assert.doesNotMatch(app, /anleitungAuftrag|setAnleitungAuftrag|oeffneHilfe|onHilfe=/);
});

check("Settings trennt die kanonische Hilfe von Datenschutz und Rechtlichem", () => {
  const hilfe = settings.indexOf('<Klappe titel="Hilfe & Anleitung">');
  const recht = settings.indexOf('<Klappe titel="Datenschutz & Rechtliches">');
  assert.ok(hilfe >= 0 && recht > hilfe);
  assert.equal((settings.match(/<UeberKinodreieck \/>/g) || []).length, 1);
  assert.doesNotMatch(settings, /anleitungAuftrag|anleitungKnopfRef|ueberOffen/);
});

check("Datenschutz bleibt im Login und in den Settings erreichbar", () => {
  assert.match(einstieg, />Datenschutz &amp; Rechtliches<\/a>/);
  assert.match(settings, /<Klappe titel="Datenschutz & Rechtliches">/);
  assert.doesNotMatch(navigation, /Anleitung &amp; Hilfe|kd-mobile-menu-hilfe|onHilfe/);
  assert.doesNotMatch(privacy, /standardmäßig geschlossen/);
  assert.match(privacy, /Katalogquellen und optionale KI getrennt/);
});

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://local.invalid/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const result = await esbuild.build({
  stdin: {
    contents: [
      'export { default as React, act } from "react";',
      'export { createRoot } from "react-dom/client";',
      'export { UeberKinodreieck } from "./src/components/Erklaerstuecke.jsx";',
      'export { HILFE_BEREICHE } from "./src/lib/hilfeInhalte.js";',
    ].join("\n"),
    sourcefile: "hilfe-dom-test-entry.jsx",
    resolveDir: WURZEL,
    loader: "jsx",
  },
  write: false,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  nodePaths: [MODULWURZEL],
  logLevel: "silent",
});
const { React, act, createRoot, UeberKinodreieck, HILFE_BEREICHE } = await import(
  "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
);
const root = createRoot(document.getElementById("root"));
await act(async () => root.render(React.createElement(UeberKinodreieck)));

check("Die zentrale Hilfe rendert alle Bereiche genau einmal und ohne zweite Öffnung", () => {
  assert.equal(document.querySelectorAll(".kd-doku-hilfe").length, 1);
  assert.equal(document.querySelectorAll(".kd-doku-bereich").length, HILFE_BEREICHE.length);
  assert.deepEqual(
    [...document.querySelectorAll(".kd-doku-bereich")].map((node) => node.dataset.hilfeZiel),
    HILFE_BEREICHE.map((bereich) => bereich.ziel),
  );
  assert.equal([...document.querySelectorAll("button")]
    .filter((node) => /Anleitung|Hilfe/.test(node.textContent || "")).length, 0);
});

await act(async () => root.unmount());
dom.window.close();
assert.equal(checks, 4);
console.log(`HILFE_NAVIGATION_DOM: ${checks}/${checks} checks passed`);
process.exit(0);
