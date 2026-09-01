import assert from "node:assert/strict";
import { build, stop } from "esbuild";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "https://local.invalid/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "localStorage", "Event", "MouseEvent"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const result = await build({
  stdin: {
    contents: `
      export { default as React, act } from "react";
      export { createRoot } from "react-dom/client";
      export { KontoDatenrechte } from "./src/components/PrivatePilotOps.jsx";
      export {
        ACCOUNT_EXPORT_REQUIRED_SCOPE,
        ACCOUNT_EXPORT_SCOPE_VERSION,
      } from "./src/lib/privatePilotOps.js";
    `,
    sourcefile: "account-export-release-ui-entry.jsx",
    resolveDir: process.cwd(),
    loader: "jsx",
  },
  write: false,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
});

const {
  React,
  act,
  createRoot,
  KontoDatenrechte,
  ACCOUNT_EXPORT_REQUIRED_SCOPE,
  ACCOUNT_EXPORT_SCOPE_VERSION,
} = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));

const root = createRoot(document.getElementById("root"));
const configAn = { privateSelfServiceEnabled: true, accountDeleteEnabled: true };
const konto = {
  accountActive: true,
  accountId: "11111111-2222-4333-8444-555555555555",
  accountEmail: "test@example.invalid",
};
const exakt = Object.freeze({
  schemaVersion: ACCOUNT_EXPORT_SCOPE_VERSION,
  status: "VERIFIED",
  dataClasses: Object.freeze(ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => entry.id)),
});
let exportCalls = 0;
let deleteCalls = 0;
const exportAccountData = async () => { exportCalls++; return true; };
const selfService = { deleteCurrentAccount: async () => { deleteCalls++; } };
let checks = 0;

async function render(extra = {}) {
  await act(async () => {
    root.render(React.createElement(KontoDatenrechte, {
      ...konto,
      config: configAn,
      exportAccountData,
      selfService,
      ...extra,
    }));
    await Promise.resolve();
  });
}

function check(name, callback) {
  callback();
  checks++;
  console.log("✓ " + name);
}

const buttonMit = (text) => [...document.querySelectorAll("button")]
  .find((button) => button.textContent.includes(text));

await render();
check("Beide Runtime-Flags öffnen ohne belegten Releaseumfang keinen Export- oder Löschknopf", () => {
  assert.equal(buttonMit("Kontoexport herunterladen"), undefined);
  assert.equal(buttonMit("Konto endgültig löschen"), undefined);
  assert.equal(exportCalls, 0);
  assert.equal(deleteCalls, 0);
});
check("Statt eines Zukunftsbuttons ist der ehrliche manuelle Rechteweg sichtbar", () => {
  const weg = document.querySelector('[data-manual-data-rights="private-contact"]');
  assert.ok(weg);
  assert.match(weg.textContent, /Auskunft/);
  assert.match(weg.textContent, /privaten Kontaktweg/);
  assert.match(weg.textContent, /keine Anfrage automatisch/);
  assert.doesNotMatch(weg.textContent, /@|mailto:/);
});

await render({ accountExportContract: { ...exakt, dataClasses: exakt.dataClasses.slice(0, -1) } });
check("Ein nur teilweise belegter Umfang bleibt unsichtbar und nicht ausführbar", () => {
  assert.equal(buttonMit("Kontoexport herunterladen"), undefined);
  assert.equal(exportCalls, 0);
});

await render({
  config: { privateSelfServiceEnabled: true, accountDeleteEnabled: false },
  accountExportContract: exakt,
});
check("Der exakte Umfang ersetzt keines der beiden bestehenden Runtime-Flags", () => {
  assert.equal(buttonMit("Kontoexport herunterladen"), undefined);
  assert.equal(exportCalls, 0);
});

await render({ accountExportContract: exakt });
check("Nur Flags plus exakter Vertrag zeigen den vollständigen Umfang und den Exportknopf", () => {
  const scope = document.querySelector('[data-account-export-scope="verified"]');
  assert.ok(scope);
  assert.equal(scope.querySelectorAll("li").length, ACCOUNT_EXPORT_REQUIRED_SCOPE.length);
  assert.deepEqual([...scope.querySelectorAll("li")].map((item) => item.textContent),
    ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => entry.label));
  assert.ok(buttonMit("Vollständigen Kontoexport herunterladen"));
  const rechteWeg = document.querySelector('[data-manual-data-rights="private-contact"]');
  assert.ok(rechteWeg);
  assert.match(rechteWeg.textContent, /unten separat verfügbar/);
  assert.doesNotMatch(rechteWeg.textContent, /nicht als Self-Service freigeschaltet/);
});
check("Auch der VERIFIED-Exportpfad schaltet niemals den alten Self-Delete frei", () => {
  assert.equal(buttonMit("Konto endgültig löschen"), undefined);
  assert.equal(document.querySelector('input[type="password"]'), null);
  assert.equal(deleteCalls, 0);
});

await act(async () => {
  buttonMit("Vollständigen Kontoexport herunterladen").click();
  await Promise.resolve();
});
check("Der Exporthandler ist ausschließlich im exakt freigegebenen Pfad ausführbar", () => {
  assert.equal(exportCalls, 1);
  assert.equal(deleteCalls, 0);
  assert.match(document.body.textContent, /Prüfe und verwahre die Datei selbst/);
});

await act(async () => root.unmount());
dom.window.close();
stop();
console.log(`account_export_release_ui_test: ${checks} Checks bestanden (nur Mocks).`);
/* Gebündeltes React kann unter Node einen MessagePort offen halten. Nach
   geschlossenem Root, JSDOM und Esbuild-Service beendet der isolierte Test
   deshalb explizit, damit nachfolgende Gates nicht warten. */
process.exit(0);
