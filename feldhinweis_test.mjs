import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const WURZEL = process.cwd();
const cache = path.join(WURZEL, "node_modules/.cache/feldhinweis-test");
fs.mkdirSync(cache, { recursive: true });
const ausgabe = path.join(cache, "FeldHinweis.mjs");
let esbuild;
try { esbuild = await import("esbuild"); }
catch { esbuild = createRequire(import.meta.resolve("vite"))("esbuild"); }
await esbuild.build({
  entryPoints: [path.join(WURZEL, "src/components/FeldHinweis.jsx")],
  outfile: ausgabe, bundle: true, platform: "node", format: "esm",
  jsx: "automatic",
  external: ["react", "react-dom", "react-dom/client"], logLevel: "silent",
});

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", {
  url: "https://kinodreieck.test/",
});
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
const { FeldHinweis } = await import(pathToFileURL(ausgabe).href + "?v=" + Date.now());
const root = createRoot(document.getElementById("app"));
await act(async () => { root.render(React.createElement(FeldHinweis, { feld: "backup" })); });

let bestanden = 0;
const fehler = [];
const check = (name, wert) => {
  let ok = false;
  try { ok = typeof wert === "function" ? !!wert() : !!wert; } catch {}
  if (ok) { bestanden++; console.log("✓ " + name); }
  else { fehler.push(name); console.log("✗ " + name); }
};
const knopf = () => document.querySelector("button");
const tooltip = () => document.querySelector('[role="tooltip"]');
const sende = async (ziel, art, optionen = {}) => {
  await act(async () => {
    const Ctor = art === "keydown" ? dom.window.KeyboardEvent
      : art.startsWith("mouse") || art === "click" ? dom.window.MouseEvent : dom.window.Event;
    ziel.dispatchEvent(new Ctor(art, { bubbles: true, cancelable: true, ...optionen }));
  });
};

check("Touchziel ist mindestens 32 × 32 CSS-Pixel", () =>
  parseInt(knopf().style.width, 10) >= 32 && parseInt(knopf().style.height, 10) >= 32);
check("geschlossener Auslöser meldet aria-expanded=false", knopf().getAttribute("aria-expanded") === "false");

await sende(knopf(), "mouseover");
check("Hover öffnet den Hinweis", !!tooltip());
await sende(knopf(), "click", { detail: 1 });
check("Klick auf den bereits per Hover offenen Hinweis schließt ihn nicht", !!tooltip());
await sende(knopf(), "mouseout");
check("angeklickter Hinweis bleibt nach Mouseleave fest geöffnet", !!tooltip());
await sende(knopf(), "click", { detail: 1 });
check("zweiter Zeigerklick schließt den fest geöffneten Hinweis", !tooltip());

await sende(knopf(), "click", { detail: 1 });
check("Touch-artiger Klick öffnet ohne vorherigen Hover", !!tooltip());
await sende(document.body, "pointerdown");
check("Zeigerklick außerhalb schließt einen fest geöffneten Hinweis", !tooltip());

await act(async () => { knopf().focus(); });
check("Tastaturfokus öffnet den Hinweis", !!tooltip());
await sende(knopf(), "click", { detail: 0 });
check("Tastaturaktivierung klappt einen fokussierten Hinweis nicht zu", !!tooltip());
check("offener Auslöser verweist per aria-describedby auf den Tooltip", () =>
  knopf().getAttribute("aria-expanded") === "true"
    && knopf().getAttribute("aria-describedby") === tooltip()?.id);
await act(async () => { knopf().blur(); });
check("Blur schließt den Tastaturhinweis", !tooltip());

await sende(knopf(), "click", { detail: 1 });
await sende(document, "keydown", { key: "Escape" });
check("Escape schließt den Hinweis", !tooltip());

await act(async () => { root.unmount(); });
if (fehler.length) {
  console.error(`\n${fehler.length} Feldhinweis-Checks fehlgeschlagen.`);
  process.exit(1);
}
console.log(`\n${bestanden}/${bestanden} Feldhinweis-Checks bestanden.`);
