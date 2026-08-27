/* Fokussierte lokale Regression fuer die Kino-Erweiterung. Kein Netz, keine
   Anbieter und keine Dateischreibvorgaenge ausser dem temporaeren Bundle. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { rankKinoProgramRecommendations } from "./src/lib/kinoRecommendations.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = process.env.KD_NODE_MODULES_DIR || path.join(rootDir, "node_modules");
const dependencyRequire = createRequire(path.join(nodeModules, "..", "package.json"));
async function loadPackage(name) {
  try { return await import(name); }
  catch { return dependencyRequire(name); }
}
const { JSDOM } = await loadPackage("jsdom");

let checks = 0;
function check(name, test) { test(); checks += 1; console.log(`✓ ${name}`); }

const drama = {
  film_at_id: "800001", t: "Neuer Kinofilm", j: 2026, g: ["Drama"],
  k: ["Filmcasino"], z: ["Freitag, 28.08. 20:15 Filmcasino"],
};
const neutral = {
  film_at_id: "800002", t: "Neutrale Premiere", j: 2026, g: ["Reality"],
  k: ["Votivkino"], z: ["Freitag, 28.08. 21:00 Votivkino"],
};
const profile = {
  signale: [{ art: "genre", wert: "Drama", richtung: "zieht_an", staerke: 4 }],
};

check("Eindeutiger aktueller Kinoeintrag ausserhalb der Mediathek wird persoenlich", () => {
  const result = rankKinoProgramRecommendations({ programEntries: [drama, neutral], profile, master: [] });
  assert.deepEqual(result.map((entry) => entry.filmAtId), ["800001"]);
  assert.match(result[0].reasons[0], /^Profil:/u);
  assert.equal(result[0].program, drama);
});

check("Unpassende Fakten, Mediathek-Treffer und mehrdeutige IDs werden nicht empfohlen", () => {
  assert.deepEqual(rankKinoProgramRecommendations({ programEntries: [neutral], profile, master: [] }), []);
  assert.deepEqual(rankKinoProgramRecommendations({
    programEntries: [drama], profile,
    master: [{ id: 1, titel: drama.t, jahr: drama.j, typ: "film" }],
  }), []);
  assert.deepEqual(rankKinoProgramRecommendations({
    programEntries: [drama, { ...drama, t: "Andere Vorstellung" }], profile, master: [],
  }), []);
  assert.deepEqual(rankKinoProgramRecommendations({
    programEntries: [drama], profile,
    master: [{ id: 2, film_at_id: "999999", titel: drama.t, jahr: drama.j, typ: "film" }],
  }).map((entry) => entry.filmAtId), ["800001"]);
});

check("Kino-Genrebruecke nutzt den persistierten Profilwert", () => {
  const comedy = { ...drama, film_at_id: "800003", t: "Komische Premiere", g: ["Comedy"] };
  const result = rankKinoProgramRecommendations({
    programEntries: [comedy], master: [],
    profile: { signale: [{ art: "genre", wert: "komoedie", richtung: "zieht_an", staerke: 4 }] },
  });
  assert.deepEqual(result.map((entry) => entry.filmAtId), ["800003"]);
});

async function loadEsbuild() {
  try { return await loadPackage("esbuild"); }
  catch { return createRequire(dependencyRequire.resolve("vite"))("esbuild"); }
}

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "kinodreieck-kino-personal-"));
let dom = null;
try {
  fs.symlinkSync(fs.realpathSync(nodeModules), path.join(outputDir, "node_modules"), "dir");
  const output = path.join(outputDir, "bundle.mjs");
  const esbuild = await loadEsbuild();
  await esbuild.build({
    stdin: { contents: 'export { KinoTab } from "./src/tabs/KinoTab.jsx";', loader: "js", resolveDir: rootDir },
    bundle: true, format: "esm", outfile: output, jsx: "automatic", target: "es2022", logLevel: "warning",
    external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
  });
  const { KinoTab } = await import(output);
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  for (const name of [
    "window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement",
    "Element", "Event", "MouseEvent", "KeyboardEvent", "Node", "NodeList", "getComputedStyle", "localStorage",
  ]) Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error("Netz im Mockpfad verboten"); };
  const React = await loadPackage("react");
  const { act, createElement } = React;
  const { createRoot } = await loadPackage("react-dom/client");

  async function renderWithProfile(value) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(KinoTab, {
        programm: { status: { archiviert: false }, events: [], demnaechst: [] },
        progStand: "2026-08-27T02:00:00.000Z", master: [],
        kinoMatches: { matched: [], rest: [drama, neutral] }, restSichtbar: [drama, neutral],
        zeitgrenze: "14:00", saveZeitgrenze() {}, zeigeAlles: true, setZeigeAlles() {},
        expandedId: null, setExpandedId() {}, updateFilm() {}, addFilm() {}, badgeFuer() {},
        loading: null, kinoPins: [], toggleKinoPin() {}, geschmacksprofil: value,
        programmInfo: { abgelaufen: false },
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return { container, root };
  }

  const before = await renderWithProfile(null);
  const linksBefore = [...before.container.querySelectorAll("a[href]")].map((link) => ({
    text: link.textContent, href: link.href, target: link.target, rel: link.rel,
  }));
  assert.equal(before.container.querySelectorAll('[data-testid="kino-personal-ausserhalb-mediathek"]').length, 0);
  await act(async () => { before.root.unmount(); });
  before.container.remove();

  const after = await renderWithProfile(profile);
  const linksAfter = [...after.container.querySelectorAll("a[href]")].map((link) => ({
    text: link.textContent, href: link.href, target: link.target, rel: link.rel,
  }));
  check("Empfehlung wandert ohne Duplikat in die bestehende Kino-Lane", () => {
    const personal = after.container.querySelectorAll('[data-testid="kino-personal-ausserhalb-mediathek"]');
    assert.equal(personal.length, 1);
    assert.match(personal[0].textContent, /Neuer Kinofilm/u);
    assert.doesNotMatch(personal[0].textContent, /Neutrale Premiere/u);
    assert.equal((after.container.textContent.match(/Neuer Kinofilm/gu) || []).length, 1);
    assert.match(after.container.textContent, /Läuft & passt zu dir \(1\)/u);
    assert.match(after.container.textContent, /Läuft auch, nicht in deiner Liste \(1\)/u);
  });
  check("Bestehende Kino-Linkziele bleiben beim Verschieben bytegleich", () => {
    assert.deepEqual(linksAfter, linksBefore);
    assert.ok(linksAfter.every((link) => link.target === "_blank" && link.rel === "noopener noreferrer"));
    assert.equal(networkCalls, 0);
  });
  await act(async () => { after.root.unmount(); });
  after.container.remove();
} finally {
  dom?.window?.close();
  fs.rmSync(outputDir, { recursive: true, force: true });
}

console.log(`\n${checks}/${checks} Kino-Empfehlungschecks bestanden.`);
