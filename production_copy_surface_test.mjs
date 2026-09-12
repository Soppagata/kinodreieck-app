/* Production-/Staging-Copy-Vertrag: reine DOM-Mocks, kein Netz oder Provider. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const rootDir = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-production-copy-"));
let dom;
let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

try {
  fs.symlinkSync(path.join(rootDir, "node_modules"), path.join(temp, "node_modules"), "dir");
  const outfile = path.join(temp, "bundle.mjs");
  let esbuild;
  try { esbuild = await import("esbuild"); }
  catch { esbuild = createRequire(import.meta.resolve("vite"))("esbuild"); }
  await esbuild.build({
    stdin: {
      contents: [
        'export { EinstiegsGate } from "./src/components/EinstiegsGate.jsx";',
        'export { DatenschutzUebersicht, SupportDaten } from "./src/components/PrivatePilotOps.jsx";',
        'export { PrivateMailPrivacyNote } from "./src/components/PrivateMailRequests.jsx";',
        'export { RadarSubscriptionPreview } from "./src/components/RadarSubscriptionPreview.jsx";',
        'export { ErklaerHero } from "./src/components/Erklaerstuecke.jsx";',
      ].join("\n"),
      loader: "js",
      resolveDir: rootDir,
    },
    bundle: true,
    format: "esm",
    outfile,
    jsx: "automatic",
    target: "es2022",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });

  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: "https://kinodreieck.at/", pretendToBeVisual: true,
  });
  dom.window.scrollTo = () => {};
  for (const name of [
    "window", "document", "navigator", "location", "HTMLElement", "HTMLInputElement",
    "HTMLButtonElement", "Element", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent",
    "Node", "NodeList", "Blob", "URL", "localStorage", "getComputedStyle",
    "requestAnimationFrame", "cancelAnimationFrame",
  ]) Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error("Netz im Copy-Test verboten"); };

  const React = await import("react");
  const { act, createElement: h } = React;
  const { createRoot } = await import("react-dom/client");
  const components = await import(pathToFileURL(outfile).href);
  const production = { appEnvironment: "production", privateMailEnabled: false };
  const staging = { appEnvironment: "staging", privateMailEnabled: false };

  check("Veraltete Settings-Pfade sind aus allen sichtbaren Anleitungen entfernt", () => {
    const sources = [
      "src/App.jsx", "src/tabs/KinoTab.jsx", "src/tabs/StreamingTab.jsx",
      "src/components/StreamingEinstellungen.jsx", "src/lib/hilfeInhalte.js",
    ].map((file) => fs.readFileSync(path.join(rootDir, file), "utf8")).join("\n");
    assert.doesNotMatch(sources, /Settings → Datenmodus &(?:amp;|) Verbindung|unter „Datenmodus & Verbindung“/);
    const datenTab = fs.readFileSync(path.join(rootDir, "src/tabs/DatenTab.jsx"), "utf8");
    assert.match(datenTab, /showKatalogzugang = runtimeConfig\.appEnvironment !== "production"/);
    assert.match(datenTab, /showKatalogzugang && onKatalogVerbinden/);
  });

  async function render(Component, props = {}) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(h(Component, props)); await new Promise((resolve) => setTimeout(resolve, 0)); });
    return {
      host,
      text: () => host.textContent.replace(/\s+/g, " ").trim(),
      async close() { await act(async () => root.unmount()); host.remove(); },
    };
  }

  const prodLegal = await render(components.EinstiegsGate, { config: production, children: h("div", null, "App") });
  check("Production zeigt kurze, nutzbare Rechts- und Kontaktinformationen", () => {
    assert.match(prodLegal.text(), /privaten Kontaktweg, über den du deinen Zugang erhalten hast/);
    assert.match(prodLegal.text(), /privaten Feedbackweg unter Settings → Datenschutz & Rechtliches/);
    assert.match(prodLegal.text(), /Auskunft, Berichtigung, Einschränkung, Übertragbarkeit, Löschung/);
    assert.match(prodLegal.text(), /Supabase Auth/);
    assert.match(prodLegal.text(), /Anthropic/);
  });
  check("Production zeigt keine Staging-Analyse oder detaillierte Betriebsdiagnose", () => {
    assert.doesNotMatch(prodLegal.text(), /ENTWURF|Staging-Fassung|Betreiber-API-Key|DPA-Aussage|Build- und Umgebungsangaben|Statuscodes|revisionsbasiert|@hotmail\.com/i);
    assert.doesNotMatch(fs.readFileSync(outfile, "utf8"), /@hotmail\.com/i);
  });
  await prodLegal.close();

  const stageLegal = await render(components.EinstiegsGate, { config: staging, children: h("div", null, "App") });
  check("Staging behält die ausführliche Analysefassung", () => {
    assert.match(stageLegal.text(), /ENTWURF/);
    assert.match(stageLegal.text(), /Staging-Fassung/);
    assert.match(stageLegal.text(), /Betreiber-API-Key/);
    assert.match(stageLegal.text(), /DPA-Aussage/);
  });
  await stageLegal.close();

  const prodPrivacy = await render(components.DatenschutzUebersicht, { accountActive: true, config: production });
  check("Production-Datenschutz behält Datenwege und Rechte ohne Registerzähler", () => {
    assert.match(prodPrivacy.text(), /Persönliche Inhalte liegen in diesem Browser/);
    assert.match(prodPrivacy.text(), /Speicherung und Aufbewahrung/);
    assert.match(prodPrivacy.text(), /Datenrechte manuell anfragen/);
    assert.doesNotMatch(prodPrivacy.text(), /feste Datenklassen|Persönliche Töpfe|registriert|Betreiber-API-Key|Technische Quelle/);
  });
  await prodPrivacy.close();

  const stagePrivacy = await render(components.DatenschutzUebersicht, { accountActive: true, config: staging });
  check("Staging-Datenschutz behält Register und Quellenanalyse", () => {
    assert.match(stagePrivacy.text(), /feste Datenklassen/);
    assert.match(stagePrivacy.text(), /Persönliche Töpfe/);
    assert.match(stagePrivacy.text(), /Betreiber-API-Key/);
  });
  await stagePrivacy.close();

  const prodSupport = await render(components.SupportDaten, { ownerBestaetigt: true, config: production });
  check("Production blendet Supportdiagnose auch für bestätigte Owner aus", () => assert.equal(prodSupport.text(), ""));
  await prodSupport.close();

  const mailConfig = {
    ...production, privateMailEnabled: true, supabaseUrl: "https://copy-test.supabase.co",
    supabasePublishableKey: "publishable-test", privateMailEndpointName: "private-mail",
  };
  const prodMail = await render(components.PrivateMailPrivacyNote, { config: mailConfig });
  check("Production-Mailhinweis behält Resend-Transparenz ohne internen Freigabekommentar", () => {
    assert.match(prodMail.text(), /Resend in den USA/);
    assert.match(prodMail.text(), /30 Tage/);
    assert.doesNotMatch(prodMail.text(), /juristische Endfreigabe/);
  });
  await prodMail.close();

  const radarProps = {
    target: { targetId: "film-1", title: "Testfilm", targetType: "movie" },
    radarState: { subscriptions: [] }, onConfirm: async () => true, onClose() {},
  };
  const prodRadar = await render(components.RadarSubscriptionPreview, { ...radarProps, config: production });
  check("Production-Radar behält Kapazität und Privatsphäre, aber keine Providerdiagnose", () => {
    const text = document.body.textContent.replace(/\s+/g, " ");
    assert.match(text, /Kapazität/);
    assert.match(text, /Privatsphäre/);
    assert.doesNotMatch(text, /Provider-Aufruf|Kosten/);
  });
  await prodRadar.close();

  const stageRadar = await render(components.RadarSubscriptionPreview, { ...radarProps, config: staging });
  check("Staging-Radar behält den Provider-/Kostenhinweis", () => {
    const text = document.body.textContent.replace(/\s+/g, " ");
    assert.match(text, /Kosten/);
    assert.match(text, /Provider-Aufruf/);
  });
  await stageRadar.close();

  const hero = await render(components.ErklaerHero);
  check("Hero beschreibt die konto- und onlinefähige persönliche Plattform", () => {
    assert.match(hero.text(), /PERSÖNLICHE FILM-PLATTFORM/);
    assert.doesNotMatch(hero.text(), /LOKALE FILM-PLATTFORM/);
    assert.match(hero.text(), /über dein Konto zwischen Geräten synchronisiert/);
  });
  await hero.close();

  console.log(`\n${checks}/${checks} Production-Copy-Checks bestanden.`);
} finally {
  dom?.window.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
