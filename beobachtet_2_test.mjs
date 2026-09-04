import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const productFiles = [
  "src/App.jsx",
  "src/tabs/StartTab.jsx",
  "src/tabs/StreamingTab.jsx",
  "src/tabs/EntdeckenTab.jsx",
  "src/components/GlobalSearchBar.jsx",
  "src/components/StreamingEinstellungen.jsx",
  "src/components/Wochenplan.jsx",
  "src/controllers/useEntdeckenRadarController.js",
  "src/lib/wochenplan.js",
  "src/lib/radarContracts.js",
  "src/lib/entdeckenUi.js",
];
const source = productFiles.map((path) => read(path)).join("\n");

assert.doesNotMatch(source, /seriesWatchService|setObserved|series-watch/);
assert.doesNotMatch(source, /searchActions\.watch|intent:\s*["']watch/);
assert.doesNotMatch(source, />\s*(?:⚑\s*)?Beobachtet\s*</i);
assert.doesNotMatch(source, />\s*Beobachten\s*</i);
assert.doesNotMatch(source, /Aus deiner Beobachtet-Liste/);
assert.doesNotMatch(read("src/tabs/StartTab.jsx"), /serienPins|neueStaffeln|beobachteteSerien/);
assert.doesNotMatch(read("src/lib/wochenplan.js"), /beobachteteSerienEreignisse/);
assert.equal(fs.existsSync("src/services/seriesWatch.js"), false);
assert.equal(fs.existsSync("src/lib/seriesWatchEvents.js"), false);

/* Datenrechts- und Shared-Schema-Verträge bleiben bewusst erhalten. */
assert.match(read("src/services/accountSelfService.js"), /seriesWatch/);
assert.match(read("src/lib/privatePilotOps.js"), /series-watch/);

console.log("BEOBACHTET-ABLÖSUNG: aktive Oberfläche und Client-Schreibpfade entfernt; Legacy-Datenrechte erhalten.");
