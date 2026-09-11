import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const WURZEL = process.cwd();
const requireAusTestumgebung = createRequire(path.join(WURZEL, "node_modules/__kd_test_resolver__.cjs"));
const { JSDOM } = requireAusTestumgebung("jsdom");
let esbuild;
try { esbuild = requireAusTestumgebung("esbuild"); }
catch { esbuild = requireAusTestumgebung("vite/node_modules/esbuild"); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-mustwatch-cards-"));
const ausgabe = path.join(tmp, "bundle.mjs");
await esbuild.build({
  stdin: {
    contents: [
      'export { MustWatchListe } from "./src/components/MustWatchListe.jsx";',
      'export { default as React, act, useState } from "react";',
      'export { createRoot } from "react-dom/client";',
    ].join("\n"),
    resolveDir: WURZEL,
    sourcefile: "mustwatch-cards-entry.jsx",
    loader: "jsx",
  },
  outfile: ausgabe,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  nodePaths: [path.join(WURZEL, "node_modules")],
  logLevel: "silent",
});
esbuild.stop?.();

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", {
  url: "https://kinodreieck.test/",
});
for (const name of ["window", "document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "localStorage"]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { MustWatchListe, React, act, useState, createRoot } = await import(pathToFileURL(ausgabe).href);
const streamingKandidat = {
  id: 7001, watchmode_id: 7001, titel: "Stalker", jahr: 1979, typ: "movie",
  dienste: ["MUBI"], imdb_id: "tt0079944",
};
const start = [
  { id: "mw_stalker", titel: "Stalker", jahr: 1979, typ: "film", im_besitz: false, notiz: "Tarkowski", verknuepfung: { ziel: "streaming", id: 7001 } },
  { id: "mw_offen", titel: "Ohne sichere Referenz", jahr: null, typ: "", im_besitz: false, notiz: "", verknuepfung: null },
];
const pins = [];
const pinAufrufe = [];
const filmWrites = [];
const deletes = [];
const updates = [];

function Harness() {
  const [eintraege, setEintraege] = useState(start);
  return React.createElement(MustWatchListe, {
    eintraege,
    kandidaten: { master: [], programm: [], streaming: [streamingKandidat] },
    recommendationPins: pins,
    onRecommendationPinToggle: (entry) => pinAufrufe.push(entry),
    onAdd: async () => true,
    onAddFilm: async (film) => { filmWrites.push(film); return "stalker_1979"; },
    onUpdate: async (id, changes) => {
      updates.push({ id, changes });
      setEintraege((aktuell) => aktuell.map((entry) => {
        if (entry.id !== id) return entry;
        const delta = typeof changes === "function" ? changes(entry) : changes;
        return delta ? { ...entry, ...delta } : entry;
      }));
      return true;
    },
    onDelete: async (id) => {
      deletes.push(id);
      setEintraege((aktuell) => aktuell.filter((entry) => entry.id !== id));
      return true;
    },
  });
}

const root = createRoot(document.getElementById("app"));
await act(async () => { root.render(React.createElement(Harness)); await Promise.resolve(); });
const button = (label) => document.querySelector(`button[aria-label="${label}"]`);
const click = async (element) => {
  assert.ok(element, "erwartetes Bedienelement fehlt");
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const stalker = document.querySelector("#mw-mw_stalker");
const offen = document.querySelector("#mw-mw_offen");
assert.ok(stalker?.classList.contains("kd-titelaktionskarte"));
assert.equal(stalker.querySelectorAll(".kd-titelkarten-aktionen button").length, 3);
assert.equal(offen.querySelector(".kd-entdecken-pin")?.disabled, true);

await click(button("Stalker am Pinboard anpinnen"));
assert.equal(pinAufrufe.length, 1);
assert.equal(pinAufrufe[0].watchmode_id, 7001);

await click(button("Stalker: markieren"));
assert.ok(button("Stalker: Markierung entfernen"));
const markiertChip = [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === "Markiert (1)");
await click(markiertChip);
assert.ok(document.querySelector("#mw-mw_stalker"));
assert.equal(document.querySelector("#mw-mw_offen"), null);

await click(button("Stalker als gesehen abschließen"));
const uebernehmen = [...document.querySelectorAll("button")]
  .find((el) => el.textContent.trim() === "In Mediathek übernehmen und abschließen");
await click(uebernehmen);
assert.equal(filmWrites.length, 1);
assert.equal(filmWrites[0].watchmode_id, 7001);
assert.deepEqual(deletes, ["mw_stalker"]);
assert.equal(document.querySelector("#mw-mw_stalker"), null);
assert.equal(updates.length, 0);

console.log("Must-Watch-Karten: 12/12 Checks bestanden.");
await act(async () => { root.unmount(); await Promise.resolve(); });
dom.window.close();
process.exit(0);
