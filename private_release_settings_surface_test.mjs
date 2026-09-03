/* Paket K: Die Release-Settings projizieren nur freigegebene Kernwege.
   Reiner DOM-/Mocktest: kein Netz, kein Provider, keine Persistenzmutation. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const WURZEL = process.cwd();
let checks = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  checks += 1;
  console.log(`✓ ${name}`);
};

async function ladeEsbuild() {
  try { return await import("esbuild"); }
  catch {
    const requireFromVite = createRequire(import.meta.resolve("vite"));
    return requireFromVite("esbuild");
  }
}

const datenQuelle = fs.readFileSync(path.join(WURZEL, "src/tabs/DatenTab.jsx"), "utf8");
const geschmackQuelle = fs.readFileSync(path.join(WURZEL, "src/components/GeschmackBereich.jsx"), "utf8");
const hilfeQuelle = fs.readFileSync(path.join(WURZEL, "src/lib/hilfeInhalte.js"), "utf8");
const kinoQuelle = fs.readFileSync(path.join(WURZEL, "src/tabs/KinoTab.jsx"), "utf8");
check("Release-Nebenwege sind an einer expliziten, geschlossenen DOM-Projektion gebunden",
  datenQuelle.includes("const RELEASE_NEBENWEGE_SICHTBAR = false")
    && datenQuelle.includes("blogProfilAnalyseSichtbar={RELEASE_NEBENWEGE_SICHTBAR}"));
check("Bloganalyse-Code und Handler bleiben erhalten, nur sein Release-Einstieg ist bedingt",
  geschmackQuelle.includes('import { BlogProfilAnalyse } from "./BlogProfilAnalyse.jsx"')
    && geschmackQuelle.includes("blogProfilAnalyseSichtbar = true")
    && geschmackQuelle.includes("{blogProfilAnalyseSichtbar && <BlogProfilAnalyse"));
check("Hilfetexte verweisen nicht auf entfernte Settings-Einstiege",
  !hilfeQuelle.includes("Masterliste und vorgesehene Importe findest du")
    && !hilfeQuelle.includes("Katalog- und Cache-Werkzeuge liegen")
    && hilfeQuelle.includes("Ein Rohdatenimport ist in diesem Privatrelease nicht freigeschaltet"));
check("Kino verweist nicht auf den entfernten technischen Statusbereich",
  !kinoQuelle.includes("Settings → Kinoprogramm-Status"));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-private-release-settings-"));
process.on("exit", () => {
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
});
fs.symlinkSync(path.join(WURZEL, "node_modules"), path.join(temp, "node_modules"), "dir");
const ziel = path.join(temp, "settings.bundle.mjs");
const esbuild = await ladeEsbuild();
await esbuild.build({
  stdin: {
    contents: 'export { DatenTab } from "./tabs/DatenTab.jsx";',
    loader: "js",
    resolveDir: path.join(WURZEL, "src"),
    sourcefile: "private-release-settings-entry.js",
  },
  bundle: true,
  format: "esm",
  outfile: ziel,
  jsx: "automatic",
  target: "es2022",
  logLevel: "warning",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "https://staging.kinodreieck.at/",
  pretendToBeVisual: true,
});
dom.window.scrollTo = () => {};
dom.window.confirm = () => false;
dom.window.navigator.clipboard = { writeText: async () => {} };
if (!dom.window.URL.createObjectURL) dom.window.URL.createObjectURL = () => "blob:settings-test";
if (!dom.window.URL.revokeObjectURL) dom.window.URL.revokeObjectURL = () => {};
for (const name of [
  "window", "document", "navigator", "location", "HTMLElement", "HTMLInputElement",
  "HTMLTextAreaElement", "HTMLButtonElement", "HTMLSelectElement", "HTMLOptionElement",
  "SVGElement", "Element", "Event", "MouseEvent", "CustomEvent", "Node", "NodeList",
  "FileReader", "Blob", "URL", "getComputedStyle", "localStorage", "requestAnimationFrame",
  "cancelAnimationFrame",
]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name],
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const netzVersuche = [];
const netzFalle = (...args) => {
  netzVersuche.push(String(args[0] || ""));
  throw new Error("Settings-Release-Test verbietet Netz");
};
globalThis.fetch = netzFalle;
dom.window.fetch = netzFalle;
dom.window.XMLHttpRequest = function XMLHttpRequestVerboten() { netzFalle("XMLHttpRequest"); };
globalThis.XMLHttpRequest = dom.window.XMLHttpRequest;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act, createElement: h } = React;
const { DatenTab } = await import(pathToFileURL(ziel).href);
const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

const altHandlerRufe = [];
const modusWahlen = [];
const kiWahlen = [];
const streamingWahlen = [];
let sicherungen = 0;
let recoveryRufe = 0;
const persoByte = '{"unveraendert":true,"titel":"Mein Film"}';
localStorage.setItem("kd:e5-persoenlich", persoByte);

await act(async () => {
  root.render(h(DatenTab, {
    master: [{ id: "film-1", titel: "Mein Film", genre: ["Drama"], tags: ["ruhig"] }],
    masterMeta: { version: 7 }, masterHerkunft: { basis: "konto" }, nachtragCount: 1,
    exportMaster: () => altHandlerRufe.push("master-export"),
    importMaster: () => altHandlerRufe.push("master-import"),
    importProgramm: () => altHandlerRufe.push("programm-import"),
    importNonstop: () => altHandlerRufe.push("nonstop-import"),
    programm: { stand: "2026-09-03T12:00:00Z", filme: [], status: {} },
    clearProgrammCache: () => altHandlerRufe.push("cache"),
    startWahl: "clean", demoAktiv: false,
    onStartWahl: () => altHandlerRufe.push("startwahl"),
    katalogVerbunden: false,
    onKatalogVerbinden: () => altHandlerRufe.push("katalog-verbinden"),
    onKatalogRefresh: () => { recoveryRufe += 1; },
    onTechnikKatalogRefresh: () => altHandlerRufe.push("technik-refresh"),
    programmInfo: { art: "remote", variante: "live", fehler: true, stand: "2026-09-03T12:00:00Z" },
    ungesichertMaster: true,
    einstellungen: { theme: "dunkel", basisTheme: "dunkel", startTab: "start" },
    setzeEinstellung: () => {},
    waehleModus: (modus) => modusWahlen.push(modus),
    sicherheitskopieGeraet: () => { sicherungen += 1; },
    kontoExportVollstaendig: null,
    kiStand: { global: false, funktionen: {} },
    onKiGlobal: (wert) => kiWahlen.push(wert),
    onKiFunktion: () => {},
    kiProfilFaehig: true,
    vokabular: [], saveVokabular: async () => true,
    speicher: {
      ladeProfil: async () => null,
      speichereProfil: async () => { throw new Error("unerwarteter Profilwrite"); },
      loescheProfil: async () => { throw new Error("unerwartete Profilloeschnung"); },
    },
    streamingBekannt: { stand: "2026-09-03T12:00:00Z", titel: [], dienste: [] },
    streamingEntdecken: { stand: "2026-09-03T12:00:00Z", titel: [] },
    streamingInfo: { art: "remote", variante: "live" },
    auswahl: ["Netflix"],
    toggleQuelle: (name) => streamingWahlen.push(name),
    offeneFlags: 2,
    migriereMustwatch: () => altHandlerRufe.push("migration"),
    importiereBesitz: () => altHandlerRufe.push("besitz-import"),
    artikelListe: [{ id: "blog-1", titel: "Privat", text: "Inhalt" }],
    autorName: "Max", addFilm: () => altHandlerRufe.push("stapel-eins"),
    addFilme: () => altHandlerRufe.push("stapel-viele"),
    kontoModus: true, kontoAktiv: true, kontoId: "konto-1", kontoEmail: "max@example.invalid",
    ownerTechnikBestaetigt: true,
    einzeldatei: false,
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const text = () => rootElement.textContent.replace(/\s+/g, " ").trim();
const summaries = () => [...rootElement.querySelectorAll("summary")]
  .map((node) => (node.textContent || "").trim());
const hatSummary = (label) => summaries().some((text) => text === label || text.startsWith(label));
const button = (label) => [...rootElement.querySelectorAll("button")]
  .find((node) => (node.textContent || "").trim() === label);

for (const label of [
  "Darstellung & Verhalten", "KI-Funktionen", "Geschmacksprofil",
  "Konto & Geräte-Sync", "Datenrechte & Konto", "Sicherheitskopie dieses Geräts",
  "Streaming-Quellen", "KI-Vokabular", "Über & Rechtliches",
]) {
  check(`Release-Kernfläche bleibt sichtbar: ${label}`, hatSummary(label));
}
check("Deterministisches Geschmacksprofil bleibt ohne KI erreichbar",
  !!button("Profil anlegen") && !text().includes("Eigene Blogartikel für dein Profil auswerten"));
check("Manueller Datenrechteweg bleibt erreichbar",
  text().includes("Datenrechte manuell anfragen"));
check("Legal-Datenübersicht bleibt im Rechtliches-Block erreichbar",
  hatSummary("Datenschutz & Datenübersicht"));
check("Bestätigter Owner behält bei echtem Katalogfehler den begrenzten Recoveryweg",
  hatSummary("Verbindung wiederherstellen") && !!button("Katalog neu laden"));
await act(async () => { button("Katalog neu laden").click(); });
check("Owner-Recovery erreicht weiterhin ausschließlich seinen bestehenden Handler", recoveryRufe === 1);

for (const label of [
  "Datenmodus & Verbindung", "Technik & Support", "Kinoprogramm-Status",
  "Katalog-Status", "Erweitert — manuelle Aktualisierung & Wartung",
  "Stapelimport", "Masterliste",
]) {
  check(`Nicht-Release-Fläche fehlt selbst für bestätigten Owner: ${label}`, !hatSummary(label));
}
check("Rohimport/-export und externe Foto-KI besitzen keinen sichtbaren Einstieg",
  !text().includes("Masterliste exportieren")
    && !text().includes("Masterliste importieren")
    && !text().includes("Workflow kopieren")
    && !text().includes("extern mit GPT, Claude"));
check("Blogprofilanalyse besitzt weder Text noch Container in der Release-DOM",
  !text().includes("Eigene Blogartikel für dein Profil auswerten")
    && !rootElement.querySelector(".kd-blogprofilanalyse"));
check("Einzeldatei-Download besitzt keinen Link in der Release-DOM",
  ![...rootElement.querySelectorAll("a")].some((link) => /\/download\/?$/.test(link.getAttribute("href") || ""))
    && !text().includes("Einzeldatei herunterladen"));
const maxName = [...rootElement.querySelectorAll("span")]
  .find((node) => (node.textContent || "").trim() === "Max");
check("Max bleibt Legal-Text ohne verstecktes Modus-Touchziel",
  !!maxName && maxName.style.cursor !== "pointer" && !maxName.title
    && !button("Classix") && !button("Schon kuhl"));

await act(async () => { button("Mit KI").click(); });
check("KI-Wahl bleibt funktional verdrahtet", kiWahlen.length === 1 && kiWahlen[0] === true);
await act(async () => { button("Foyer (hell)").click(); });
check("Normale Darstellungswahl bleibt funktional verdrahtet",
  modusWahlen.length === 1 && modusWahlen[0] === "foyer");
await act(async () => { button("Sicherheitskopie dieses Geräts herunterladen").click(); });
check("Sicherheitsdownload bleibt funktional verdrahtet", sicherungen === 1);
const netflix = [...rootElement.querySelectorAll("button")]
  .find((node) => (node.textContent || "").includes("Netflix"));
await act(async () => { netflix.click(); });
check("Streamingquellen bleiben funktional verdrahtet",
  streamingWahlen.length === 1 && streamingWahlen[0] === "Netflix");
check("Verborgene Alt-Handler wurden nicht ausgelöst", altHandlerRufe.length === 0);
check("Persönlicher Teststand blieb bytegleich", localStorage.getItem("kd:e5-persoenlich") === persoByte);
check("Der DOM-Lauf blieb vollständig ohne Netz", netzVersuche.length === 0);

await act(async () => { root.unmount(); });
dom.window.close();
console.log(`private_release_settings_surface_test: ${checks} Checks bestanden.`);
