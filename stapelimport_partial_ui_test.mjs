/* Fokussierter React-/JSDOM-Mockpfad fuer partielle Medienstapel.
   Kein Netz, kein Anbieter und keine Persistenz ausser dem injizierten Spy. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = process.env.KD_NODE_MODULES_DIR || path.join(wurzel, "node_modules");
const dependencyRequire = createRequire(path.join(nodeModules, "..", "package.json"));
async function ladePaket(name) {
  try { return await import(name); }
  catch { return dependencyRequire(name); }
}
async function ladeEsbuild() {
  try { return await ladePaket("esbuild"); }
  catch { return createRequire(dependencyRequire.resolve("vite"))("esbuild"); }
}
const { JSDOM } = await ladePaket("jsdom");
const ausgabeDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-stapel-partial-ui-"));
const ausgabe = path.join(ausgabeDir, "bundle.mjs");
fs.symlinkSync(nodeModules, path.join(ausgabeDir, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(ausgabeDir, { recursive: true, force: true }));
const esbuild = await ladeEsbuild();
await esbuild.build({
  stdin: {
    contents: 'export { StapelImport } from "./src/components/StapelImport.jsx";',
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
const React = await ladePaket("react");
const { act, createElement: h } = React;
const { createRoot } = await ladePaket("react-dom/client");
const { StapelImport } = await import(ausgabe);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let checks = 0;
const check = (wert, text) => {
  assert.ok(wert, text);
  checks++;
  console.log("✓ " + text);
};
const knopf = (container, text) => [...container.querySelectorAll("button")]
  .find((element) => element.textContent.includes(text));
const setzeWert = (element, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  setter.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
};
async function mounte(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(h(StapelImport, props)); await tick(); });
  return {
    container,
    async cleanup() { await act(async () => root.unmount()); container.remove(); },
  };
}

const teilJson = {
  kandidaten: [
    { titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch", zusatz: true },
    { titel: "", typ: "film", jahr: null, quelle: "dvd", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "niedrig" },
    { titel: "Kind of Blue", typ: "musik", jahr: 1959, quelle: "cd", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch" },
  ],
  warnungen: [],
  zusatzfeld: "ignorieren",
};
const imports = [];
const fehler = [];
const teilFixture = await mounte({
  master: [],
  kiAktiv: false,
  setErr: (wert) => fehler.push(wert),
  addFilme: async (medien) => {
    imports.push(medien);
    return medien.map((_, index) => `film-${index}`);
  },
});
const extern = teilFixture.container.querySelector('textarea[placeholder^="JSON-Antwort"]');
const codeblock = `Kurzer Zusatz.\n\`\`\`json\n${JSON.stringify(teilJson)}\n\`\`\`\nEnde.`;
await act(async () => { setzeWert(extern, codeblock); await tick(); });
await act(async () => { knopf(teilFixture.container, "Antwort prüfen").click(); await tick(); });
check(teilFixture.container.querySelectorAll(".kd-stapel-kandidat").length === 2,
  "JSON-Codeblock zeigt zwei sichere Vorschauitems");
check(/1 Eintrag bleibt offen/.test(teilFixture.container.textContent)
  && /Zeile 2: Der Titel fehlt/.test(teilFixture.container.textContent),
"das kaputte Item erscheint einzeln als sichere Fehlmenge");
check(imports.length === 0 && teilFixture.container.textContent.includes("noch ist nichts gespeichert"),
  "die Vorschau importiert nichts still");
check(knopf(teilFixture.container, "Antwort prüfen").disabled,
  "eine offene Vorschau kann auch extern nicht blind überschrieben werden");
const auswahl = teilFixture.container.querySelectorAll('.kd-stapel-kandidat input[type="checkbox"]');
await act(async () => { auswahl[1].click(); await tick(); });
await act(async () => { knopf(teilFixture.container, "Auswahl übernehmen").click(); await tick(); });
check(imports.length === 1 && imports[0].length === 1 && imports[0][0].titel === "Alien",
  "Bestätigung importiert nur das ausgewählte sichere Item");
check(fehler.every((wert) => !wert) && /Übernommen: 1/.test(teilFixture.container.textContent),
  "bestätigter Import meldet genau einen neuen Eintrag");
await teilFixture.cleanup();

let aiAufrufe = 0;
let degradedImports = 0;
const degradedFixture = await mounte({
  master: [],
  kiAktiv: true,
  ai: {
    async runTask() {
      aiAufrufe++;
      return {
        ok: true,
        data: null,
        responseMode: "degraded",
        displayText: "Sicherer, aber unstrukturierter Anbietertext.",
        warnings: ["unstructured-provider-text"],
        verbrauch: { kostenUsdCent: 0.01 },
      };
    },
  },
  addFilme: async () => { degradedImports++; return []; },
});
const liste = degradedFixture.container.querySelector(".kd-stapelimport > textarea");
await act(async () => { setzeWert(liste, "Alien\nUnlesbarer Rücken"); await tick(); });
await act(async () => { knopf(degradedFixture.container, "Liste mit KI ordnen").click(); await tick(); });
check(aiAufrufe === 1 && /konnte nicht sicher in Medieneinträge/.test(degradedFixture.container.textContent),
  "degraded zeigt nur den festen sicheren Hinweis");
check(degradedFixture.container.querySelectorAll(".kd-stapel-kandidat").length === 0
  && degradedFixture.container.querySelector(".kd-stapel-fehlmenge").textContent.includes("2 Einträge bleiben offen"),
"degraded erzeugt null Medienitems und hält beide Zeilen offen");
check(knopf(degradedFixture.container, "Auswahl übernehmen").disabled && degradedImports === 0,
  "degraded besitzt keinen ausführbaren Importweg");
check(!knopf(degradedFixture.container, "Liste mit KI ordnen"),
  "eine bestehende Vorschau bietet keinen blinden Vollretry an");
await degradedFixture.cleanup();

console.log(`stapelimport_partial_ui_test: ${checks} Checks bestanden.`);
