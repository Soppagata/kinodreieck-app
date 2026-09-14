/* Titel-Pins über zwei getrennte Browser-/PWA-Speicher mit gemeinsamem
   kontogebundenem Mockbackend. Keine Remoteverbindung, keine Anbieterwirkung. */
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { useEntdeckenPins } from "./src/controllers/useEntdeckenPins.js";
import {
  K, localDriver, notifyRemoteStorage, setStorageDriver,
} from "./src/lib/storage.js";
import {
  createEntdeckenPin, createEntdeckenPinsPot, decodeEntdeckenPinsPot, resolveEntdeckenPins,
} from "./src/lib/entdeckenPins.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function browserStorage(seed = {}) {
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

function accountDriver(device, backend, accountId, { confirmed = new Set(), online = true } = {}) {
  let netz = online;
  const remoteKey = (key) => `${accountId}|${key}`;
  return {
    name: `mock-account-${accountId}`,
    owner: `account:${accountId}`,
    hasConfirmedRemote: (key) => confirmed.has(key),
    setOnline(value) { netz = value; },
    async get(key) {
      const value = device.data.get(key);
      return value == null ? null : { key, value };
    },
    async set(key, value) {
      device.data.set(key, String(value));
      if (netz) { backend.set(remoteKey(key), String(value)); confirmed.add(key); }
      return { key, value };
    },
    async delete(key) { device.data.delete(key); return { key, deleted: true }; },
    async list() { return { keys: [...device.data.keys()] }; },
    flush(key) {
      const value = device.data.get(key);
      if (netz && value != null) { backend.set(remoteKey(key), value); confirmed.add(key); }
    },
    pull(key) {
      const value = backend.get(remoteKey(key));
      if (value == null) return;
      device.data.set(key, value); confirmed.add(key);
      notifyRemoteStorage([{ key, value }]);
    },
  };
}

async function mount(device, driver, contextKey) {
  globalThis.localStorage = device.storage;
  setStorageDriver(driver);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let api;
  const errors = [];
  function Harness() {
    api = useEntdeckenPins({ contextKey, setErr: (message) => errors.push(message) });
    return React.createElement("output", null, api.entdeckenPins.map((pin) => pin.title).join("|"));
  }
  await act(async () => { root.render(React.createElement(Harness)); await tick(); });
  return {
    api: () => api,
    errors,
    container,
    async settle() { await act(async () => { await tick(); await tick(); }); },
    async close() { await act(async () => root.unmount()); container.remove(); },
  };
}

const title = { title: "Gerätewechsel", year: 2026, type: "film", watchmodeId: 4711 };
const second = { title: "Offline-Pin", year: 2025, type: "series", watchmodeId: 4812 };
const backend = new Map();
let checks = 0;
function check(name, value) { assert.ok(value, name); checks++; console.log(`✓ ${name}`); }

try {
  const browser = browserStorage();
  const browserDriver = accountDriver(browser, backend, "konto-a");
  let ui = await mount(browser, browserDriver, "account:ready:konto-a");
  await act(async () => { assert.equal(await ui.api().toggleRecommendationPin(title), true); });
  check("Browser zeigt den bestätigten Pin direkt", ui.api().entdeckenPins[0]?.title === title.title);
  check("Der Kontotopf ist owner- und Aktivierungsepoch-gebunden",
    decodeEntdeckenPinsPot(JSON.parse(backend.get(`konto-a|${K.entdeckenPins}`)))?.owner === "account:konto-a"
    && Number.isInteger(JSON.parse(backend.get(`konto-a|${K.entdeckenPins}`)).epoch));
  await ui.close();

  const pwa = browserStorage({ [K.entdeckenPins]: backend.get(`konto-a|${K.entdeckenPins}`) });
  const pwaConfirmed = new Set([K.entdeckenPins]);
  const pwaDriver = accountDriver(pwa, backend, "konto-a", { confirmed: pwaConfirmed });
  ui = await mount(pwa, pwaDriver, "account:ready:konto-a");
  check("Frische PWA liest denselben Account-Pin", ui.api().entdeckenPins[0]?.title === title.title);
  await act(async () => { assert.equal(await ui.api().toggleRecommendationPin(title), true); });
  check("Unpin synchronisiert einen leeren, weiterhin gebundenen Topf",
    decodeEntdeckenPinsPot(JSON.parse(backend.get(`konto-a|${K.entdeckenPins}`)))?.pins.length === 0);
  await ui.close();

  const reload = browserStorage({ [K.entdeckenPins]: backend.get(`konto-a|${K.entdeckenPins}`) });
  ui = await mount(reload, accountDriver(reload, backend, "konto-a", { confirmed: new Set([K.entdeckenPins]) }), "account:ready:konto-a");
  check("Reload erfindet den entfernten Pin nicht neu", ui.api().entdeckenPins.length === 0);
  await ui.close();

  const offlineDevice = browserStorage({ [K.entdeckenPins]: backend.get(`konto-a|${K.entdeckenPins}`) });
  const offlineDriver = accountDriver(offlineDevice, backend, "konto-a", { confirmed: new Set([K.entdeckenPins]), online: false });
  ui = await mount(offlineDevice, offlineDriver, "account:ready:konto-a");
  await act(async () => { assert.equal(await ui.api().toggleRecommendationPin(second), true); });
  check("Offline bleibt der Pin im gebundenen lokalen Kontocache sichtbar", ui.api().entdeckenPins[0]?.title === second.title);
  check("Offline verändert den gemeinsamen Backendstand nicht",
    decodeEntdeckenPinsPot(JSON.parse(backend.get(`konto-a|${K.entdeckenPins}`)))?.pins.length === 0);
  offlineDriver.setOnline(true); offlineDriver.flush(K.entdeckenPins);
  await ui.close();
  const freshAfterFlush = browserStorage({ [K.entdeckenPins]: backend.get(`konto-a|${K.entdeckenPins}`) });
  ui = await mount(freshAfterFlush, accountDriver(freshAfterFlush, backend, "konto-a", { confirmed: new Set([K.entdeckenPins]) }), "account:ready:konto-a");
  check("Nach dem Offline-Flush erreicht der Pin eine frische PWA", ui.api().entdeckenPins[0]?.title === second.title);
  const pushed = createEntdeckenPinsPot([createEntdeckenPin(title), createEntdeckenPin(second)], {
    owner: "account:konto-a", epoch: 99,
  });
  backend.set(`konto-a|${K.entdeckenPins}`, JSON.stringify(pushed));
  await act(async () => {
    notifyRemoteStorage([{ key: K.entdeckenPins, value: JSON.stringify(pushed) }]);
    await tick();
  });
  check("Ein bestätigtes Remote-Update aktualisiert die offene PWA ohne Reload", ui.api().entdeckenPins.length === 2);
  await ui.close();

  const other = browserStorage();
  ui = await mount(other, accountDriver(other, backend, "konto-b"), "account:ready:konto-b");
  check("Ein zweites Konto sieht keine Pins von Konto A", ui.api().entdeckenPins.length === 0);
  await ui.close();

  const legacyPin = createEntdeckenPin({ title: "Ungebundener Alt-Pin", year: 2024, type: "film" }, 1234);
  const legacy = browserStorage({ [K.entdeckenPins]: JSON.stringify([legacyPin]) });
  ui = await mount(legacy, accountDriver(legacy, backend, "konto-b"), "account:ready:konto-b");
  check("Ungebundener Altbestand wird dem nächsten Konto nicht zugeschlagen", ui.api().entdeckenPins.length === 0);
  check("Unklarer Altbestand bleibt in der lokalen Quarantäne vollständig erhalten",
    JSON.parse(legacy.data.get(K.entdeckenPinsLegacy))[0].pinId === legacyPin.pinId);
  await ui.close();

  const adopted = browserStorage({ [K.entdeckenPins]: JSON.stringify([legacyPin]) });
  ui = await mount(adopted, accountDriver(adopted, backend, "konto-b", { confirmed: new Set([K.entdeckenPins]) }), "account:ready:konto-b");
  check("Eine serverbestätigte bewusste Legacy-Übernahme wird dem Konto zugeordnet", ui.api().entdeckenPins[0]?.pinId === legacyPin.pinId);
  await act(async () => { assert.equal(await ui.api().toggleRecommendationPin(second), true); });
  check("Der nächste bestätigte Write bindet übernommenen Altbestand an Konto und Epoch",
    decodeEntdeckenPinsPot(JSON.parse(adopted.data.get(K.entdeckenPins)))?.owner === "account:konto-b");
  await ui.close();

  const incomplete = resolveEntdeckenPins([legacyPin], {
    recommendations: [], streaming: [], cinema: [],
    recommendationReady: true, streamingReady: true, cinemaReady: true,
  });
  check("Ein vollständiger gemeldeter, aber lückenhafter Katalog löscht keinen synchronisierten Pin",
    incomplete.discardedPinIds.length === 0 && incomplete.pendingPinIds[0] === legacyPin.pinId);
} finally {
  setStorageDriver(localDriver);
  dom.window.close();
}

console.log(`\n${checks}/${checks} Titel-Pin Konto-/Gerätewechsel-Checks bestanden.`);
