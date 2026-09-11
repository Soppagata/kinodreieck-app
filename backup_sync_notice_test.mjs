import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { K, setStorageDriver } from "./src/lib/storage.js";
import { useBackupExportController } from "./src/controllers/useBackupExportController.js";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://local.invalid/" });
for (const key of ["window", "document", "localStorage", "Event", "Blob", "URL"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let checks = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  checks += 1;
  console.log("✓ " + name);
};
const warte = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let syncStatus = {
  configured: true,
  pending: [K.master], conflict: [], stale: [], zuGross: [], schemaVeraltet: [],
};
const kontoDriver = {
  name: "konto",
  owner: "account:A",
  status: () => syncStatus,
  async get() { return null; },
  async set(key, value) { return { key, value }; },
  async delete(key) { return { key, deleted: true }; },
  async list() { return { keys: [] }; },
};

setStorageDriver(kontoDriver);
let renders = 0;
let letzterStand = null;
function Probe() {
  renders += 1;
  letzterStand = useBackupExportController({
    owner: "account:A",
    masterHerkunft: { typ: "storage", zeit: 200 },
    artikelListe: [],
    artikelGespeichertAm: 0,
  });
  return React.createElement("span", null, letzterStand.ungesichertMaster ? "offen" : "bestätigt");
}

const root = createRoot(document.getElementById("root"));
await act(async () => {
  root.render(React.createElement(Probe));
  await warte(20);
});
check("laufender Konto-Sync bleibt bis zur Bestätigung sichtbar",
  document.body.textContent === "offen");

const rendersBeiPending = renders;
await act(async () => { await warte(1100); });
check("unveränderter Pending-Status löst keinen Root-Render aus", renders === rendersBeiPending);

syncStatus = { ...syncStatus, pending: [] };
await act(async () => { await warte(1100); });
check("Pending zu bestätigt aktualisiert den Sicherungsstatus zeitnah",
  document.body.textContent === "bestätigt" && renders === rendersBeiPending + 1);

const rendersImIdle = renders;
await act(async () => { await warte(1100); });
check("bestätigter Idle-Status erzeugt keine weiteren Timer-Renders", renders === rendersImIdle);

syncStatus = { ...syncStatus, conflict: [K.master] };
await act(async () => { window.dispatchEvent(new Event("focus")); await Promise.resolve(); });
check("Fokus nimmt einen relevanten späteren Konflikt auf",
  document.body.textContent === "offen" && renders === rendersImIdle + 1);
const rendersNachFokus = renders;
await act(async () => { window.dispatchEvent(new Event("focus")); await Promise.resolve(); });
check("Fokus ohne Statuswechsel rendert nicht erneut", renders === rendersNachFokus);

await act(async () => { setStorageDriver(null); await warte(20); });
const gastRenders = renders;
await act(async () => { await warte(1100); });
check("Gastmodus startet keinen dauernden Sicherungs-Tick", renders === gastRenders);

const quelle = readFileSync(new URL("./src/controllers/useBackupExportController.js", import.meta.url), "utf8");
check("Controller enthält kein dauerhaftes Intervall und begrenzt Pending-Prüfungen",
  !quelle.includes("setInterval") && quelle.includes("SYNC_PRUEFUNG_MAX"));

await act(async () => root.unmount());
setStorageDriver(null);
dom.window.close();
console.log(`\nBACKUP-SYNC-NOTICE-TEST BESTANDEN (${checks}/${checks})`);
