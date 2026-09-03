/* KD-OBS-015–018: echte React-DOM-Projektion der normalen Release-Settings
   und des begrenzten Recoverywegs. Alle Netzwerkprimitiven sind Wurffallen. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

import { hatBestaetigteOwnerRolle } from "./src/lib/accountAccess.js";

const WURZEL = process.cwd();
let checks = 0;
function check(name, condition) {
  assert.ok(condition, name);
  checks += 1;
  console.log(`✓ ${name}`);
}

async function ladeEsbuild() {
  try { return await import("esbuild"); }
  catch {
    const requireFromVite = createRequire(import.meta.resolve("vite"));
    return requireFromVite("esbuild");
  }
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-settings-diagnostics-"));
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
    sourcefile: "settings-diagnostics-entry.js",
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
  url: "http://localhost/",
  pretendToBeVisual: true,
});
dom.window.scrollTo = () => {};
dom.window.confirm = () => false;
dom.window.navigator.clipboard = { writeText: async () => {} };
if (!dom.window.URL.createObjectURL) dom.window.URL.createObjectURL = () => "blob:settings-test";
if (!dom.window.URL.revokeObjectURL) dom.window.URL.revokeObjectURL = () => {};
for (const name of [
  "window", "document", "navigator", "HTMLElement", "HTMLInputElement",
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
  throw new Error("Settings-Test verbietet Netz");
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

const ownerSession = {
  mode: "account", state: "ready",
  account: { id: "owner-1", displayName: "Beliebig", email: "beliebig@example.invalid", role: "owner" },
  access: { status: "resolved", role: "owner" },
  capabilities: { remoteStorage: true, personalAi: true },
};
const memberMitOwnerIdentitaet = {
  mode: "account", state: "ready",
  account: { id: "member-1", displayName: "Max", email: "max@example.invalid", role: "member" },
  access: { status: "resolved", role: "member" },
  capabilities: { remoteStorage: true, personalAi: true },
};
check("Rollenfunktion erkennt die serverbestätigte Ownerrolle", hatBestaetigteOwnerRolle(ownerSession));
check("Name und E-Mail stufen ein Member nicht zum Owner hoch", !hatBestaetigteOwnerRolle(memberMitOwnerIdentitaet));
check("Unbekannte, degradierte und Gastrollen fallen geschlossen aus",
  !hatBestaetigteOwnerRolle({ ...ownerSession, access: { status: "unavailable", role: null } })
    && !hatBestaetigteOwnerRolle({ ...ownerSession, state: "degraded" })
    && !hatBestaetigteOwnerRolle({ ...ownerSession, account: { ...ownerSession.account, role: "member" } })
    && !hatBestaetigteOwnerRolle({ ...ownerSession, access: { status: "resolved", role: "member" } })
    && !hatBestaetigteOwnerRolle({ ...ownerSession, capabilities: { remoteStorage: false } })
    && !hatBestaetigteOwnerRolle({ mode: "guest", state: "ready" }));

let cacheRufe = 0;
let technikRefreshRufe = 0;
let recoveryRufe = 0;
const basisProps = {
  master: [], masterMeta: null, masterHerkunft: null, nachtragCount: 0,
  exportMaster: () => {}, importMaster: () => {},
  importProgramm: () => {}, importNonstop: () => {},
  programm: { stand: "2026-08-18T10:00:00Z", filme: [], status: {} },
  clearProgrammCache: () => { cacheRufe += 1; },
  startWahl: "clean", demoAktiv: false, onStartWahl: () => {},
  katalogVerbunden: true, onKatalogVerbinden: () => {},
  onKatalogRefresh: () => { recoveryRufe += 1; },
  onTechnikKatalogRefresh: () => { technikRefreshRufe += 1; },
  programmInfo: { art: "remote", variante: "live", stand: "2026-08-18T10:00:00Z" },
  einstellungen: { theme: "dunkel" }, setzeEinstellung: () => {}, waehleModus: () => {},
  backupGesamt: async () => true,
  kiStand: { global: false, funktionen: {} },
  streamingBekannt: { stand: "2026-08-18T10:00:00Z", titel: [], dienste: [] },
  streamingEntdecken: { stand: "2026-08-18T10:00:00Z", titel: [] },
  streamingInfo: { art: "remote", variante: "live" },
  auswahl: [], toggleQuelle: () => {}, datenGesperrt: false,
  offeneFlags: 1, migriereMustwatch: () => {}, importiereBesitz: () => {},
  artikelListe: [], addFilm: () => {}, addFilme: () => {},
  kontoId: "", kontoEmail: "", onKontoGeloescht: () => {},
};

async function render(overrides = {}) {
  await act(async () => { root.render(h(DatenTab, { ...basisProps, ...overrides })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const text = () => rootElement.textContent.replace(/\s+/g, " ").trim();
const summary = (label) => [...rootElement.querySelectorAll("summary")]
  .find((node) => (node.textContent || "").trim() === label);
const button = (label) => [...rootElement.querySelectorAll("button")]
  .find((node) => (node.textContent || "").trim() === label);
const diagnoseToggle = () => rootElement.querySelector('[data-local-diagnostics-toggle="true"]');
const keineTechnik = () => !summary("Datenmodus & Verbindung")
  && !summary("Technik & Support")
  && !summary("Kinoprogramm-Status")
  && !summary("Katalog-Status")
  && !summary("Erweitert — manuelle Aktualisierung & Wartung")
  && !button("Demo-Daten entfernen")
  && !button("Supportdaten kopieren")
  && !button("Programm-Cache leeren")
  && !diagnoseToggle();

await render({
  kontoModus: false, kontoAktiv: false, demoAktiv: true, startWahl: "demo",
  einzeldatei: false, ownerTechnikBestaetigt: false,
});
check("Gesunder Gast sieht weder Datenmodus, Demo-Löschung noch Betriebs-/Supportflächen",
  keineTechnik() && !summary("Verbindung wiederherstellen"));
check("Gast sieht keine Kontolöschung", !summary("Konto löschen"));
const rechtliches = summary("Über & Rechtliches");
const datenschutz = summary("Datenschutz & Datenübersicht");
const hauptklappen = [...rootElement.querySelectorAll("section > details.kd-klappe")];
check("Datenschutz bleibt niedrig und verschachtelt unter Über & Rechtliches erreichbar",
  !!rechtliches && !!datenschutz
    && datenschutz.closest("details.kd-klappe") === rechtliches.parentElement
    && hauptklappen.at(-1) === rechtliches.parentElement);
check("Datenschutz besitzt ein sicheres 44-Pixel-Touchziel", datenschutz.style.minHeight === "44px");

await render({
  kontoModus: true, kontoAktiv: true,
  kontoId: memberMitOwnerIdentitaet.account.id,
  kontoEmail: memberMitOwnerIdentitaet.account.email,
  demoAktiv: true, startWahl: "demo", einzeldatei: false,
  ownerTechnikBestaetigt: hatBestaetigteOwnerRolle(memberMitOwnerIdentitaet),
});
check("Member mit Owner-Namen sieht keine Technik oder Supportdaten", keineTechnik());
check("Kontolöschung bleibt als eigener Kontoweg erreichbar", !!summary("Konto löschen"));

await render({
  kontoModus: true, kontoAktiv: true, katalogVerbunden: false,
  programmInfo: { fehler: true }, einzeldatei: false, ownerTechnikBestaetigt: false,
});
check("Ein echter Verbindungsfehler zeigt nur den begrenzten Recoveryweg",
  summary("Verbindung wiederherstellen") && button("Katalog neu laden") && keineTechnik());
await act(async () => { button("Katalog neu laden").click(); });
check("Der Recoveryweg erreicht ausschließlich seinen begrenzten Handler", recoveryRufe === 1);

await render({
  kontoModus: false, kontoAktiv: false, katalogVerbunden: false,
  programmInfo: { fehler: true }, einzeldatei: true, ownerTechnikBestaetigt: false,
});
check("Single File behauptet keine Verbindung und rendert keine technische Bedienfläche",
  !summary("Verbindung wiederherstellen") && keineTechnik());

const diagnoseZeit = new Date(Date.now() - 1000).toISOString();
localStorage.setItem("kd:local-diagnostics:v1", JSON.stringify({
  format: "kinodreieck-local-diagnostics",
  version: 1,
  entries: [{
    version: 1, code: "UI_RENDER_CRASH", source: "APP_ERROR_BOUNDARY", operation: "RENDER",
    buildVersion: "test-build", environment: "local", platformClass: "desktop",
    runtimeMode: "browser", online: true, timestamp: diagnoseZeit,
    reference: "KD-DIAG-0123456789ABCDEF", count: 2,
  }],
}));
await render({
  kontoModus: true, kontoAktiv: true, kontoId: ownerSession.account.id,
  kontoEmail: ownerSession.account.email, demoAktiv: true, startWahl: "demo",
  einzeldatei: false, ownerTechnikBestaetigt: hatBestaetigteOwnerRolle(ownerSession),
});
check("Bestätigter Owner erhält dieselbe bereinigte Releasefläche ohne Technikprojektion",
  keineTechnik() && !summary("Verbindung wiederherstellen"));
check("Verborgene Diagnostik verändert den vorhandenen lokalen Puffer nicht",
  /UI_RENDER_CRASH/.test(localStorage.getItem("kd:local-diagnostics:v1") || "")
    && localStorage.getItem("kd:local-diagnostics-enabled:v1") === null);

await render({
  kontoModus: true, kontoAktiv: true, kontoId: ownerSession.account.id,
  kontoEmail: ownerSession.account.email, katalogVerbunden: false,
  programmInfo: { fehler: true }, einzeldatei: false,
  ownerTechnikBestaetigt: hatBestaetigteOwnerRolle(ownerSession),
});
check("Auch ein bestätigter Owner behält bei echtem Fehler den begrenzten Recoveryweg",
  summary("Verbindung wiederherstellen") && button("Katalog neu laden") && keineTechnik());
await act(async () => { button("Katalog neu laden").click(); });
check("Owner-Recovery nutzt denselben begrenzten Handler ohne Technikmutation",
  recoveryRufe === 2 && cacheRufe === 0 && technikRefreshRufe === 0);

const appQuelle = fs.readFileSync(path.join(WURZEL, "src/App.jsx"), "utf8");
const mainQuelle = fs.readFileSync(path.join(WURZEL, "src/main.jsx"), "utf8");
const kontoQuelle = fs.readFileSync(path.join(WURZEL, "src/components/KontoBereich.jsx"), "utf8");
check("App und Fehlergrenze leiten Ownerzugriff zentral aus derselben Rollenfunktion ab",
  appQuelle.includes("hatBestaetigteOwnerRolle(session)")
    && mainQuelle.includes("hatBestaetigteOwnerRolle(sessionCoordinator.getSnapshot())"));
check("App reicht technische Mutationshandler an Nicht-Owner gar nicht weiter",
  appQuelle.includes("importProgramm={ownerTechnikBestaetigt ? importProgramm : undefined}")
    && appQuelle.includes("clearProgrammCache={ownerTechnikBestaetigt ? clearProgrammCache : undefined}")
    && appQuelle.includes("onTechnikKatalogRefresh={ownerTechnikBestaetigt ? refreshKatalog : undefined}"));
check("Auch die KI-Verbindungsdiagnose im Kontoweg verlangt bestätigten Owner",
  kontoQuelle.includes('ownerTechnikBestaetigt && personalAiFreigegeben && kiAn("diagnose")'));
check("Der DOM-Lauf hat weder Netz noch automatischen Diagnosetransport ausgelöst", netzVersuche.length === 0);

await act(async () => { root.unmount(); });
dom.window.close();

console.log(`settings_diagnostics_test: ${checks} Checks bestanden.`);
