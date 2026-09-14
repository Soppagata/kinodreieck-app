/* Echter AccountDriver + Hook: Upgrade eines bereits gebundenen Kontocaches
   und bewusste Übernahme nach einem neuen/ungebundenen Kontokontext. Der
   PostgREST-Transport ist lokal gemockt; es gibt keine Außenwirkung. */
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { createAccountDriver } from "./src/lib/accountDriver.js";
import { useEntdeckenPins } from "./src/controllers/useEntdeckenPins.js";
import {
  K, localDriver, setStorageDriver,
} from "./src/lib/storage.js";
import {
  createEntdeckenPin, createEntdeckenPinsPot, decodeEntdeckenPinsPot,
  readEntdeckenPinsLegacy,
} from "./src/lib/entdeckenPins.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function deviceStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    storage: {
      getItem: (key) => data.has(key) ? data.get(key) : null,
      setItem: (key, value) => void data.set(key, String(value)),
      removeItem: (key) => void data.delete(key),
      clear: () => data.clear(),
      key: (index) => [...data.keys()][index] ?? null,
      get length() { return data.size; },
    },
  };
}

function accountBackend(accountId, rows = {}) {
  const table = new Map(Object.entries(rows).map(([key, value]) => [key, {
    key, value: String(value), revision: 1,
  }]));
  const response = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
  async function fetchImpl(url, options = {}) {
    assert.equal(options.headers?.Authorization, `Bearer token-${accountId}`);
    const method = options.method || "GET";
    const query = new URL(String(url)).searchParams;
    const key = String(query.get("key") || "").replace(/^eq\./, "");
    if (method === "GET") {
      const selected = key ? [table.get(key)].filter(Boolean) : [...table.values()];
      return response(200, selected.map((row) => ({ ...row })));
    }
    const body = JSON.parse(options.body || "{}");
    if (method === "POST") {
      if (table.has(body.key)) return response(409, { code: "23505" });
      const row = { key: body.key, value: String(body.value), revision: 1 };
      table.set(body.key, row);
      return response(201, [{ ...row }]);
    }
    if (method === "PATCH") {
      const row = table.get(key);
      const revision = Number(String(query.get("revision") || "").replace(/^eq\./, ""));
      if (!row || row.revision !== revision) return response(200, []);
      row.value = String(body.value);
      row.revision += 1;
      return response(200, [{ ...row }]);
    }
    return response(405, {});
  }
  return { table, fetchImpl };
}

function actualDriver(device, backend, accountId, legacyPinsBelongToOwner) {
  globalThis.localStorage = device.storage;
  return createAccountDriver({
    config: {
      supabaseUrl: "https://projekt.supabase.co",
      supabasePublishableKey: "sb_publishable_upgrade_test",
    },
    getAccessToken: async () => `token-${accountId}`,
    fetchImpl: backend.fetchImpl,
    owner: `account:${accountId}`,
    legacyPinsBelongToOwner,
  });
}

async function mount(device, driver, contextKey) {
  globalThis.localStorage = device.storage;
  setStorageDriver(driver);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let api;
  function Harness() {
    api = useEntdeckenPins({ contextKey });
    return React.createElement("output", null,
      `${api.entdeckenPins.length}/${api.legacyEntdeckenPins.length}`);
  }
  await act(async () => { root.render(React.createElement(Harness)); await tick(); await tick(); });
  return {
    api: () => api,
    async settle() { await act(async () => { await tick(); await tick(); }); },
    async close() { await act(async () => root.unmount()); container.remove(); },
  };
}

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (predicate()) return;
    await act(async () => { await tick(); });
  }
  assert.fail(message);
}

const oldPin = createEntdeckenPin({ title: "Alter Geräte-Pin", year: 2024, type: "film" }, 1000);
const remotePin = createEntdeckenPin({ title: "Konto-Pin", year: 2025, type: "film" }, 2000);
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log(`✓ ${name}`); }

try {
  /* Upgrade eines bereits bestätigten ffec-Kontocaches: Die frühere
     owner-Marke beweist, dass der rohe Pin zu genau diesem Konto gehört. */
  const upgradeDevice = deviceStorage({ [K.entdeckenPins]: JSON.stringify([oldPin]) });
  const upgradeRemote = createEntdeckenPinsPot([remotePin], { owner: "account:konto-a", epoch: 4 });
  const upgradeBackend = accountBackend("konto-a", { [K.entdeckenPins]: JSON.stringify(upgradeRemote) });
  const upgradeDriver = actualDriver(upgradeDevice, upgradeBackend, "konto-a", true);
  setStorageDriver(upgradeDriver);
  await upgradeDriver.pull();
  check("AccountDriver sichert rohe Bestands-Pins vor dem Remote-Refresh",
    readEntdeckenPinsLegacy(upgradeDevice.storage).pins[0]?.pinId === oldPin.pinId
    && readEntdeckenPinsLegacy(upgradeDevice.storage).owner === "account:konto-a");
  let ui = await mount(upgradeDevice, upgradeDriver, "account:ready:konto-a");
  await waitUntil(() => {
    const raw = upgradeBackend.table.get(K.entdeckenPins)?.value;
    return raw && decodeEntdeckenPinsPot(JSON.parse(raw))?.pins.length === 2;
  }, "Sicher gebundener Altbestand wurde nicht automatisch ins bekannte Konto übernommen.");
  await ui.settle();
  check("Bekannte sichere Kontobindung vereinigt Altbestand und Serverpins ohne Nutzerverlust",
    ui.api().entdeckenPins.length === 2
    && readEntdeckenPinsLegacy(upgradeDevice.storage).pins.length === 0);
  await ui.close();

  /* Neuer Account nach ungebundenem Gerätestand: Der Pull darf den Altbestand
     nicht verlieren und die UI darf ihn erst nach der sichtbaren Aktion senden. */
  const switchDevice = deviceStorage({ [K.entdeckenPins]: JSON.stringify([oldPin]) });
  const switchRemote = createEntdeckenPinsPot([remotePin], { owner: "account:konto-b", epoch: 8 });
  const switchBackend = accountBackend("konto-b", { [K.entdeckenPins]: JSON.stringify(switchRemote) });
  const switchDriver = actualDriver(switchDevice, switchBackend, "konto-b", false);
  setStorageDriver(switchDriver);
  await switchDriver.pull();
  ui = await mount(switchDevice, switchDriver, "account:ready:konto-b");
  await ui.settle();
  check("Accountwechsel bewahrt ungebundene Alt-Pins und lädt nur den Kontostand",
    ui.api().entdeckenPins.length === 1
    && ui.api().legacyEntdeckenPins[0]?.pinId === oldPin.pinId
    && readEntdeckenPinsLegacy(switchDevice.storage).owner === null);
  check("Ohne sichtbare Übernahme lädt der echte AccountDriver keinen Alt-Pin hoch",
    decodeEntdeckenPinsPot(JSON.parse(switchBackend.table.get(K.entdeckenPins).value)).pins.length === 1);
  await act(async () => { assert.equal(await ui.api().uebernehmeLegacyPins(), true); });
  await waitUntil(() => {
    const raw = switchBackend.table.get(K.entdeckenPins)?.value;
    return raw && decodeEntdeckenPinsPot(JSON.parse(raw))?.pins.length === 2;
  }, "Bewusst übernommener Altbestand wurde nicht ins Konto übertragen.");
  check("Erst die bewusste Übernahme bindet, vereinigt und entfernt die lokale Quarantäne",
    ui.api().entdeckenPins.length === 2
    && readEntdeckenPinsLegacy(switchDevice.storage).pins.length === 0);
  await ui.close();
} finally {
  setStorageDriver(localDriver);
  dom.window.close();
}

console.log(`\n${checks}/${checks} echte AccountDriver-Pin-Upgradechecks bestanden.`);
