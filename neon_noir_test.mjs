/* Native scene/lifecycle checks, also run by eggs_test.mjs. No backend or provider. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { THEMES } from "./src/lib/tokens.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");

export async function buildNeonNoirFixture() {
  const result = await esbuild.build({
    stdin: { resolveDir: rootDir, loader: "jsx", contents: `
      import React, { act, StrictMode } from "react";
      import { createRoot } from "react-dom/client";
      import { ModusFx } from "./src/components/ModusOverlay.jsx";
      const root = createRoot(document.getElementById("fixture"));
      window.neonTest = {
        act,
        mount: (modus = "neon-noir", copies = 1) => root.render(<StrictMode>
          {Array.from({length: copies}, (_, index) => <ModusFx key={index} modus={modus} />)}
        </StrictMode>),
        unmount: () => root.unmount(),
      };
    ` },
    outfile: "neon-fixture.js", write: false, bundle: true, format: "iife",
    jsx: "automatic", target: "es2022", define: { "import.meta.env": "{}" }, logLevel: "silent",
  });
  return {
    js: result.outputFiles.find(file => file.path.endsWith(".js")).text,
    css: result.outputFiles.find(file => file.path.endsWith(".css")).text
      + readFileSync(path.join(rootDir, "src/index.css"), "utf8")
        .split("/* ================= EGG-MODI: SHOWA & NEON NOIR =================")[1]
        .split("/* ================= ENDE EGG-MODI: SHOWA & NEON NOIR =================")[0]
        .replace(/^[\s\S]*?\*\//, ""),
  };
}

export async function runNeonNoirChecks() {
  const { JSDOM } = require("jsdom");
  const fixture = await buildNeonNoirFixture();
  const dom = new JSDOM('<!doctype html><html><body><div id="fixture"></div></body></html>', {
    url: "http://neon-fixture.test/", runScripts: "dangerously", pretendToBeVisual: true,
  });
  const { window } = dom;
  const doc = window.document;
  const visibilityListeners = new Set();
  const addListener = doc.addEventListener.bind(doc);
  const removeListener = doc.removeEventListener.bind(doc);
  doc.addEventListener = (type, listener, ...options) => {
    if (type === "visibilitychange") visibilityListeners.add(listener);
    return addListener(type, listener, ...options);
  };
  doc.removeEventListener = (type, listener, ...options) => {
    if (type === "visibilitychange") visibilityListeners.delete(listener);
    return removeListener(type, listener, ...options);
  };
  window.MessageChannel = class {
    port1 = {};
    port2 = { postMessage: () => window.setTimeout(() => this.port1.onmessage?.(), 0) };
  };
  window.IS_REACT_ACT_ENVIRONMENT = true;
  let requests = 0;
  window.fetch = async () => { requests++; throw new Error("Network forbidden"); };
  let stamp = 0;
  let nextFrame = 0;
  const frames = new Map();
  window.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const advance = milliseconds => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 16) {
      stamp += 16;
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(stamp));
    }
  };
  const media = new window.EventTarget();
  media.matches = false;
  window.matchMedia = () => media;
  const setReducedMotion = value => { media.matches = value; media.dispatchEvent(new window.Event("change")); };
  let hidden = false;
  Object.defineProperty(doc, "hidden", { get: () => hidden });
  const setHidden = value => { hidden = value; doc.dispatchEvent(new window.Event("visibilitychange")); };
  let bounds = { width: 393, height: 852 };
  window.SVGElement.prototype.getBoundingClientRect = () => bounds;
  const observers = new Set();
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this); }
    disconnect() { observers.delete(this); }
  };
  window.eval(fixture.js);
  const api = window.neonTest;
  const part = name => doc.querySelector(`[data-neon-part="${name}"]`);
  const scene = () => doc.querySelector(".kd-neon-noir__city");
  let checks = 0;
  const check = (name, run) => { run(); checks++; console.log(`✓ Neon Noir: ${name}`); };

  try {
    check("Neon erhält Textkontrast auf Saal, Karten, Eingaben und aktiven Controls", () => {
      const luminanz = hex => {
        const [r, g, b] = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
          .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
        return .2126 * r + .7152 * g + .0722 * b;
      };
      const neon = THEMES["neon-noir"];
      for (const [text, background] of [[neon.leinwand, neon.saal], [neon.leinwand, neon.saalHoch],
        [neon.rauch, neon.saalHoch], [neon.tinte, neon.leinwand], [neon.tinteWeich, neon.leinwand],
        [neon.tinte, neon.kartenFeld], [neon.tinte, neon.wolfram]]) {
        const [hell, dunkel] = [luminanz(text), luminanz(background)].sort((a, b) => b - a);
        assert.ok((hell + .05) / (dunkel + .05) >= 4.5, `${text} auf ${background}`);
      }
    });
    await api.act(async () => api.mount());
    check("ModusFx mountet eine dekorative adaptive Szene mit den drei Originalkonturen", () => {
      assert.equal(doc.querySelectorAll(".kd-neon-noir__city").length, 1);
      assert.equal(doc.querySelector(".kd-fx-neon-noir").getAttribute("aria-hidden"), "true");
      assert.equal(scene().getAttribute("focusable"), "false");
      assert.equal(scene().querySelectorAll('a, button, input, [tabindex], image:not([data-neon-part="fog-texture"]), foreignObject').length, 0);
      // Accepted source contours, independently bound before the JSX transfer.
      for (const [name, digest] of Object.entries({
        "loca-wordmark": "a180186b5fbf6530fed984da961483209791224bd4e15bcfa06f402b1a2a8677",
        "nyso-wordmark": "75defd4b2ef6591486cc1bfa41af1e861f2e9ac55f6605fb56fa06a25c34fb3a",
        "riata-wordmark": "b4ebf7db033310454d349893c711e70d1e422a4017fa6e47baa9420bd5ea7e60",
      })) assert.equal(createHash("sha256").update(part(name).getAttribute("d")).digest("hex"), digest);
      assert.equal(doc.querySelectorAll('[data-neon-part="hologram"]').length, 1);
      assert.equal(part("scanlines").firstElementChild.getAttribute("fill"), "#ff40c3");
      assert.equal(part("scanlines").firstElementChild.getAttribute("fill-opacity"), ".86");
      assert.equal(part("bob-scanlines").firstElementChild.getAttribute("fill"), "#16bcff");
    });
    check("Nebel bleibt eine lokale weiche Textur mit den Originalkonturen und ohne Vollbildfilter", () => {
      assert.equal(scene().querySelectorAll("image").length, 1);
      const href = part("fog-texture").getAttribute("href");
      assert.ok(href.startsWith("data:image/svg+xml;charset=utf-8,"));
      const texture = new window.DOMParser().parseFromString(decodeURIComponent(href.slice(href.indexOf(",") + 1)), "image/svg+xml");
      assert.equal(texture.querySelectorAll("parsererror, script, foreignObject, image, style").length, 0);
      const paths = [...texture.querySelectorAll("path")].map(element => element.getAttribute("d"));
      assert.equal(createHash("sha256").update(paths.join("\n")).digest("hex"), "a9f561b07f063dcfc61c200ccf45d4396dbb851df7044837619afec23222402a");
      assert.deepEqual([...texture.querySelectorAll("stop")].map(element => [element.getAttribute("stop-color"), element.getAttribute("stop-opacity")]), [
        ["#9cbecb", "0"], ["#85aebb", ".17"], ["#53798c", "0"],
      ]);
      for (const element of texture.querySelectorAll("*")) for (const { name, value } of element.attributes) {
        if (name === "href") assert.ok(value.startsWith("#"), "Textur darf keine fremden Ressourcen laden");
        const referencedId = value.match(/^url\(#(.+)\)$/)?.[1] || (name === "href" ? value.slice(1) : null);
        if (referencedId) assert.ok(texture.getElementById(referencedId), `fehlende Texturreferenz ${referencedId}`);
      }
      for (const name of ["fog-far", "fog-middle", "fog-front"]) assert.equal(part(name).getAttribute("filter"), null);
    });
    const still = scene().outerHTML;
    advance(2000);
    check("Regen, Kopf, Nebel und Dampf bewegen sich bei konstanter Hologrammhelligkeit", () => {
      for (const name of ["rain-far", "rain-near", "holo-head", "fog-far-pattern", "fog-middle-pattern", "fog-front-pattern", "steam-left"]) {
        assert.ok(!still.includes(part(name).outerHTML), `${name} bewegt sich nicht`);
      }
      assert.equal(part("hologram").getAttribute("opacity"), ".96");
      assert.equal(frames.size, 1, "StrictMode darf keine doppelten Loops hinterlassen");
      assert.equal(observers.size, 1);
    });
    advance(4000);
    check("gelegentliches Flugauto wird sichtbar und verschwindet wieder", () => {
      assert.ok(Number(part("flyby").getAttribute("opacity")) > 0);
      advance(5000);
      assert.equal(part("flyby").getAttribute("opacity"), "0");
    });
    setReducedMotion(true);
    const reduced = scene().outerHTML;
    advance(20_000);
    check("Reduced Motion friert das vollständige Motiv ein und beendet den Loop", () => {
      assert.equal(scene().outerHTML, reduced);
      assert.equal(frames.size, 0);
    });
    setReducedMotion(false);
    advance(1000);
    setHidden(true);
    const hiddenScene = scene().outerHTML;
    advance(20_000);
    check("verdecktes Dokument pausiert; Sichtbarkeit setzt die Bewegung fort", () => {
      assert.equal(scene().outerHTML, hiddenScene);
      assert.equal(frames.size, 0);
      setHidden(false);
      advance(1000);
      assert.notEqual(scene().outerHTML, hiddenScene);
    });
    bounds = { width: 1440, height: 900 };
    for (const observer of observers) observer.callback();
    check("Resize passt denselben Stadtaufbau an den Desktop an", () => {
      const viewBox = scene().getAttribute("viewBox").split(" ").map(Number);
      assert.equal(viewBox[2], 932 * 1440 / 900);
      assert.equal(part("sky-rect").getAttribute("width"), String(viewBox[2]));
      assert.equal(part("right-front").getAttribute("transform"), `translate(${viewBox[2] - 430} 0)`);
    });
    await api.act(async () => api.mount("neon-noir", 2));
    check("mehrere Instanzen haben eigene IDs und alle SVG-Referenzen bleiben lokal", () => {
      const ids = [...doc.querySelectorAll("[id]")].map(element => element.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const svg of doc.querySelectorAll(".kd-neon-noir__city")) {
        const localIds = new Set([...svg.querySelectorAll("[id]")].map(element => element.id));
        for (const element of svg.querySelectorAll("*")) for (const { name, value } of element.attributes) {
          const id = value.match(/^url\(#(.+)\)$/)?.[1] || (name === "href" && value.startsWith("#") ? value.slice(1) : null);
          if (id) assert.ok(localIds.has(id), `fehlende lokale Referenz ${id}`);
        }
      }
    });
    const detached = [...doc.querySelectorAll(".kd-neon-noir__city")];
    await api.act(async () => api.mount(""));
    const detachedHtml = detached.map(svg => svg.outerHTML);
    setReducedMotion(true); setReducedMotion(false); setHidden(true); setHidden(false);
    advance(30_000);
    check("Themewechsel räumt Loops und Observer auf; abgehängte SVGs bleiben unberührt", () => {
      assert.equal(scene(), null);
      assert.equal(frames.size, 0);
      assert.equal(observers.size, 0);
      assert.deepEqual(detached.map(svg => svg.outerHTML), detachedHtml);
    });
    setReducedMotion(true);
    await api.act(async () => api.mount());
    check("anfängliches Reduced Motion zeigt das volle Standbild ohne Flug oder Loop", () => {
      assert.ok(scene());
      assert.equal(part("flyby").getAttribute("opacity"), "0");
      assert.equal(frames.size, 0);
      assert.equal(requests, 0);
    });
    await api.act(async () => api.mount("showa"));
    const showa = doc.querySelector(".kd-fx-showa");
    check("Showa bewahrt alle 30 originalen Motivkonturen in einer dekorativen Szene", () => {
      const paths = [...showa.querySelectorAll("svg path")].map(element => element.getAttribute("d"));
      assert.equal(createHash("sha256").update(paths.sort().join("\n")).digest("hex"), "912362530bbdfc27c1de477a27c6fa12a219c11a3c2d51b9628d0b19d5174c2d");
      assert.equal(showa.querySelector("svg").getAttribute("focusable"), "false");
      assert.equal(showa.querySelectorAll('a, button, input, [tabindex], image, foreignObject').length, 0);
      for (const use of showa.querySelectorAll("use")) {
        assert.ok(showa.contains(doc.getElementById(use.getAttribute("href").slice(1))), "Hausreferenzen bleiben innerhalb derselben Szene");
      }
      assert.equal(frames.size, 0, "Showa benötigt keinen JavaScript-Animationsloop");
      assert.equal(visibilityListeners.size, 1, "StrictMode hinterlässt genau einen Sichtbarkeitslistener");
    });
    check("Showa pausiert beim Verbergen und nimmt bei Sichtbarkeit wieder auf", () => {
      setHidden(true);
      assert.equal(showa.dataset.paused, "true");
      setHidden(false);
      assert.equal(showa.dataset.paused, "false");
    });
    await api.act(async () => api.mount(""));
    const detachedShowa = showa.outerHTML;
    check("Showa räumt beim Themewechsel seinen Listener auf", () => {
      assert.equal(visibilityListeners.size, 0);
      setHidden(true);
      assert.equal(showa.outerHTML, detachedShowa);
      assert.equal(doc.querySelector(".kd-fx-showa"), null);
      assert.equal(requests, 0);
    });
    console.log(`\n${checks}/${checks} Neon-Noir-Checks bestanden; 0 Netzwerkrequests.`);
  } finally {
    await api.act(async () => api.unmount());
    window.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runNeonNoirChecks();
