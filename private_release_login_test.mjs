import assert from "node:assert/strict";
import { build, stop } from "esbuild";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://local.invalid/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "localStorage", "Event", "MouseEvent"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
const sources = {
  sessionCoordinator: `
    let session = { mode: "guest", state: "ready", account: null };
    let storageState = "guest";
    const listeners = new Set();
    export const harness = {
      calls: 0, refreshCalls: 0,
      login: async () => { throw new Error("synthetic-login-failure"); },
      refresh: async () => {},
      set(next, state) { session = next; storageState = state; for (const f of listeners) f(next); },
    };
    export const sessionCoordinator = {
      getSnapshot: () => session, getStorageState: () => storageState,
      subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
      signIn(...args) { harness.calls++; return harness.login(...args); },
      async signOut() { harness.set({ mode: "guest", state: "ready" }, "guest"); },
      refresh(...args) { harness.refreshCalls++; return harness.refresh(...args); },
    };
  `,
  storage: `
    export const K = { start: "kd:start", einstieg: "kd:einstieg", startVersion: "kd:start-version" };
    export const storageOwnerKennung = () => "account:test";
    export const subscribeStorageContext = () => () => {};
  `,
  catalog: 'export const catalogService = { storedVariant: () => "demo" };',
  personalDataRegistry: 'export const PERSONAL_DATA_KEYS = ["kd:master"];',
  errors: 'export const errorText = () => "Anmeldung nicht möglich. Bitte erneut versuchen.";',
  runtime: `
    let environment = "local";
    export const APP_ENVIRONMENTS = Object.freeze({ LOCAL: "local", STAGING: "staging", PRODUCTION: "production" });
    export const runtimeConfig = { get appEnvironment() { return environment; } };
    export const runtimeHarness = { set(next) { environment = next; } };
  `,
};
const result = await build({
  stdin: {
    contents: `
      export { default as React, act } from "react";
      export { createRoot } from "react-dom/client";
      export { EinstiegsGate } from "./src/components/EinstiegsGate.jsx";
      export { harness } from "./src/services/sessionCoordinator.js";
      export { runtimeHarness } from "./src/config/runtime.js";
    `,
    sourcefile: "login-test-entry.jsx", resolveDir: process.cwd(), loader: "jsx",
  },
  write: false, bundle: true, platform: "node", format: "esm", jsx: "automatic",
  plugins: [{
    name: "local-only-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /\/(sessionCoordinator|storage|catalog|personalDataRegistry|errors|runtime)\.js$/ }, (args) => {
        const name = args.path.split("/").at(-1).replace(".js", "");
        return { path: name, namespace: "login-mocks" };
      });
      builder.onLoad({ filter: /.*/, namespace: "login-mocks" }, (args) => ({ contents: sources[args.path], loader: "js" }));
    },
  }],
});
const { React, act, createRoot, EinstiegsGate, harness, runtimeHarness } = await import(
  "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
);
let root;
let checks = 0;
async function mount({
  environment = "local",
  url = "http://localhost/",
  session = { mode: "guest", state: "ready", account: null },
  storageState = "guest",
  storage = {},
} = {}) {
  if (root) await act(async () => root.unmount());
  dom.reconfigure({ url });
  localStorage.clear();
  for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  harness.calls = 0;
  harness.refreshCalls = 0;
  harness.refresh = async () => {};
  runtimeHarness.set(environment);
  harness.set(session, storageState);
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(EinstiegsGate, null,
    React.createElement("p", { "data-child": "app" }, "Synthetic app"))));
}
const buttons = () => [...document.querySelectorAll("button")];
const button = (name) => buttons().find((node) => node.textContent === name);
async function click(node) { await act(async () => node.click()); }
function check(name, callback) { callback(); checks++; console.log("✓ " + name); }

await mount();
check("Minimaler Erstlogin ohne Demo, Installation, Einführung oder KI-Auswahl", () => {
  assert.deepEqual([...document.querySelectorAll("label")].map((n) => n.textContent), ["Benutzername", "Passwort"]);
  assert.equal(document.querySelectorAll("a").length, 1);
  assert.equal(document.querySelector("h1").textContent, "Kinodreieck");
  assert.ok(document.querySelector("#datenschutz-rechtliches").hidden);
  assert.doesNotMatch(document.querySelector('[aria-label="Anmeldung"]').textContent, /Demo|Registrier|Install|Mit KI|Einführung/);
});
const link = document.querySelector("a");
await click(link);
check("Legal erhält Fokus und bleibt klar Entwurf", () => {
  assert.equal(document.activeElement.id, "datenschutz-rechtliches");
  assert.match(document.activeElement.textContent, /ENTWURF/);
  assert.ok(document.querySelector('[aria-label="Anmeldung"]').hidden);
});
await click(button("Zurück zum Login"));
check("Rückkehr fokussiert genau den einzigen Legal-Link", () => assert.equal(document.activeElement, link));
await click(button("Ohne Konto fortfahren"));
check("Lokaler Einstieg wird bestätigt gespeichert, ohne KI-/Tutorialwrite", () => {
  assert.ok(document.querySelector("[data-child]"));
  assert.equal(localStorage.getItem("kd:start"), "clean");
  assert.equal(localStorage.getItem("kd:start-version"), "local-v1");
  assert.equal(JSON.parse(localStorage.getItem("kd:einstieg")).abgeschlossen, true);
  assert.equal(localStorage.getItem("kd:ki"), null);
  assert.equal(localStorage.getItem("kd:tutorial"), null);
});

const gastMasterOnline = JSON.stringify({ filme: [{ id: "bleibt-unsichtbar", titel: "Gastbestand" }] });
const abgeschlossenerGastmarker = JSON.stringify({ version: "private-v1", abgeschlossen: true, weg: "gast" });
for (const environment of ["staging", "production"]) {
  await mount({
    environment,
    url: `https://${environment}.kinodreieck.test/`,
  });
  check(`${environment}: frischer Online-Gast sieht zuerst ausschließlich den Minimal-Login`, () => {
    assert.ok(document.querySelector(".kd-entry-login"));
    assert.ok(!document.querySelector("[data-child]"));
    assert.ok(button("Ohne Konto fortfahren"));
    assert.equal(localStorage.getItem("kd:master"), null);
    assert.equal(localStorage.getItem("kd:einstieg"), null);
  });
  await click(button("Ohne Konto fortfahren"));
  check(`${environment}: bewusster Gastklick öffnet nur den bestehenden lokalen Stand`, () => {
    assert.ok(document.querySelector("[data-child]"));
    assert.equal(localStorage.getItem("kd:master"), null);
    assert.equal(localStorage.getItem("kd:start"), "clean");
    assert.equal(localStorage.getItem("kd:start-version"), "local-v1");
    assert.equal(JSON.parse(localStorage.getItem("kd:einstieg")).weg, "gast");
  });
  const bestaetigteWahl = {
    "kd:master": gastMasterOnline,
    "kd:start": "clean",
    "kd:start-version": "local-v1",
    "kd:einstieg": abgeschlossenerGastmarker,
  };
  await mount({ environment, url: `https://${environment}.kinodreieck.test/`, storage: bestaetigteWahl });
  check(`${environment}: bestätigter Localmodus überlebt den Reload ohne erneuten Login-Gate`, () => {
    assert.ok(document.querySelector("[data-child]"));
    assert.ok(!document.querySelector(".kd-entry-login"));
    assert.equal(localStorage.getItem("kd:master"), gastMasterOnline);
  });
}

await mount({
  environment: "production",
  url: "https://kinodreieck.test/",
  session: { mode: "account", state: "ready", account: { id: "test" }, capabilities: { remoteStorage: true } },
  storageState: "account-ready",
});
check("Online erhält ein sicher gebundenes Konto unverändert die bestehende App", () => {
  assert.ok(document.querySelector("[data-child]"));
  assert.ok(!document.querySelector(".kd-entry-login"));
});

for (const session of [
  { mode: "account", state: "ready", account: { id: "test" }, capabilities: { remoteStorage: false }, access: { status: "missing" } },
  { mode: "account", state: "degraded", account: { id: "test" }, capabilities: { remoteStorage: false }, access: { status: "unavailable" } },
]) {
  await mount({
    environment: "production",
    url: "https://kinodreieck.test/",
    session,
    /* Ein alter lokaler Ready-Marker darf die Serverfreigabe nicht ersetzen. */
    storageState: "account-ready",
  });
  check(`Kontorecht ${session.access.status} bleibt trotz altem Storage-Marker fail-closed`, () => {
    assert.ok(!document.querySelector("[data-child]"));
    assert.match(document.body.textContent, /nicht freigegeben/);
  });
}

await mount({
  environment: "production",
  url: "file:///tmp/Kinodreieck.html",
  storage: { "kd:master": gastMasterOnline, "kd:einstieg": abgeschlossenerGastmarker },
});
check("Heruntergeladene file-Einzeldatei behält den bisherigen Localmodus", () => {
  assert.ok(document.querySelector("[data-child]"));
  assert.equal(localStorage.getItem("kd:master"), gastMasterOnline);
});

await mount();
const originalSet = dom.window.Storage.prototype.setItem;
const personalVorFehler = JSON.stringify({ filme: [{ id: "bleibt-lokal" }] });
localStorage.setItem("kd:master", personalVorFehler);
dom.window.Storage.prototype.setItem = function(key, value) {
  if (key === "kd:start-version") throw new Error("synthetic-storage-failure");
  return originalSet.call(this, key, value);
};
await click(button("Ohne Konto fortfahren"));
check("Storagefehler behauptet keinen fertigen Einstieg", () => {
  assert.ok(!document.querySelector("[data-child]"));
  assert.match(document.querySelector('[role="alert"]').textContent, /nicht gespeichert/);
  assert.equal(localStorage.getItem("kd:master"), personalVorFehler);
});
dom.window.Storage.prototype.setItem = originalSet;

await mount();
let rejectLogin;
harness.login = () => new Promise((_resolve, reject) => { rejectLogin = reject; });
await act(async () => {
  const form = document.querySelector("form");
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});
check("Parallele Submits starten nur eine Anmeldung und sperren den Gastweg", () => {
  assert.equal(harness.calls, 1);
  assert.ok(button("Ohne Konto fortfahren").disabled);
  assert.ok(document.querySelector('[role="status"]'));
});
await act(async () => rejectLogin(new Error("synthetic-private-payload")));
check("Loginfehler bleibt neutral und zeigt keine Backenddetails", () => {
  assert.match(document.querySelector('[role="alert"]').textContent, /Anmeldung nicht möglich/);
  assert.doesNotMatch(document.body.textContent, /synthetic-private-payload/);
});
await act(async () => harness.set({ mode: "account", state: "ready", account: { id: "test" }, capabilities: { remoteStorage: true } }, "account-awaiting-adoption"));
check("Noch blockierter Kontoübergang zeigt weder Gastdaten noch Erfolg", () => {
  assert.ok(!document.querySelector("[data-child]"));
  assert.match(document.body.textContent, /Kontostand ist noch nicht verfügbar/);
  assert.ok(button("Kontostand erneut laden"));
  assert.doesNotMatch(document.body.textContent, /übernehmen|zusammenführen|importieren/i);
});
harness.refresh = async () => harness.set(
  { mode: "account", state: "ready", account: { id: "test" }, capabilities: { remoteStorage: true } },
  "account-ready",
);
await click(button("Kontostand erneut laden"));
check("Wiederholter sicherer Ladevorgang verlässt awaiting-adoption und zeigt die App", () => {
  assert.equal(harness.refreshCalls, 1);
  assert.ok(document.querySelector("[data-child]"));
});

await mount({
  session: { mode: "account", state: "ready", account: { id: "test" }, capabilities: { remoteStorage: true } },
  storageState: "account-awaiting-adoption",
});
harness.refresh = async () => {
  const error = new Error("synthetic-private-remote-payload");
  error.code = "ACCOUNT_LOAD_FAILED";
  throw error;
};
await click(button("Kontostand erneut laden"));
check("Fehlgeschlagenes Nachladen bleibt ehrlich, neutral und wiederholbar", () => {
  assert.equal(harness.refreshCalls, 1);
  assert.match(document.querySelector('[role="alert"]').textContent, /nicht sicher geladen/);
  assert.doesNotMatch(document.body.textContent, /synthetic-private-remote-payload/);
  assert.ok(button("Kontostand erneut laden"));
  assert.ok(!document.querySelector("[data-child]"));
});
await act(async () => root.unmount());
dom.window.close();
console.log(`private_release_login_test: ${checks} Checks bestanden (nur Mocks).`);
stop();
/* Reacts gebündelter Node-Scheduler kann einen MessagePort offen halten. */
process.exit(0);
