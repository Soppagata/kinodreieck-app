import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const rootDir = process.cwd();
const moduleRoot = process.env.KD_TEST_NODE_MODULES || path.join(rootDir, "node_modules");
const requireFromTestEnv = createRequire(path.join(moduleRoot, "__kd_test_resolver__.cjs"));
const { JSDOM } = requireFromTestEnv("jsdom");
let esbuild;
try { esbuild = requireFromTestEnv("esbuild"); }
catch { esbuild = requireFromTestEnv("vite/node_modules/esbuild"); }
const { build } = esbuild;
const source = fs.readFileSync(path.join(rootDir, "src/tabs/BlogTab.jsx"), "utf8");
const appSource = fs.readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
let checks = 0;
function check(name, callback) {
  callback();
  checks++;
  console.log("✓ " + name);
}

check("Der Lesepfad führt keine Veröffentlichung, Übernahme oder Rohimporte ein", () => {
  assert.doesNotMatch(source, /MasterImport|EntdeckenAnsicht|Blogs entdecken|service\.claim\(|service\.publish\(/);
  assert.doesNotMatch(source, /onRetryPublication|Erneut versuchen/);
  assert.doesNotMatch(source, /Artikel importieren|Artikel exportieren/);
});
check("Die Schreibgrenze legt neue Artikel privat an und bewahrt beim Edit Altzustand", () => {
  assert.match(source, /geteilt:\s*vorlage\s*\?\s*!!vorlage\.geteilt\s*:\s*false/);
  assert.doesNotMatch(source, /setGeteilt|Shared —|type="checkbox" checked=\{geteilt\}/);
  assert.match(source, /synchronisierePublikation:\s*false/);
  assert.match(appSource, /freigebeArtikel = useCallback\(async \(id, \{ synchronisierePublikation = true \} = \{\}\)/);
  assert.match(appSource, /if \(!synchronisierePublikation\) return true;/);
});
check("Die bestehende Schutzgrenze für möglicherweise öffentliche Altartikel bleibt erhalten", () => {
  assert.match(source, /needsPublicRemoval\(a, publikation\)/);
  assert.match(source, /Entfernt zuerst die öffentliche Kopie und löscht den Artikel erst nach der Bestätigung/);
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://local.invalid/",
});
for (const key of [
  "window", "document", "navigator", "HTMLElement", "HTMLInputElement",
  "HTMLTextAreaElement", "HTMLSelectElement", "Element", "Event",
  "MouseEvent", "KeyboardEvent", "Node", "NodeList", "getComputedStyle",
]) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? dom.window : dom.window[key],
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let netzAufrufe = 0;
globalThis.fetch = async () => {
  netzAufrufe++;
  throw new Error("NETZ_IM_BLOG_UI_TEST_VERBOTEN");
};
dom.window.fetch = globalThis.fetch;

const result = await build({
  stdin: {
    contents: `
      export { default as React, act } from "react";
      export { createRoot } from "react-dom/client";
      export { BlogTab } from "./src/tabs/BlogTab.jsx";
    `,
    sourcefile: "private-release-blog-surface-entry.jsx",
    resolveDir: rootDir,
    loader: "jsx",
  },
  write: false,
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  nodePaths: [moduleRoot],
});
const ui = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const { React, act, createRoot, BlogTab } = ui;

const MASTER = [{ id: "blade_runner_1982", titel: "Blade Runner", jahr: 1982, typ: "film" }];
const privat = {
  id: "privat-1",
  titel: "Mein privater Artikel",
  autor: "Max",
  text: "Ein privater Absatz.\n\nNoch ein Absatz.",
  geordnet: false,
  geteilt: false,
  status: "freigegeben",
  erstellt_am: "2026-09-03T10:00:00.000Z",
  liste: [{ eingabe: "Blade Runner", jahr: 1982, typ: "film", ref: "blade_runner_1982" }],
};
const altPubliziert = {
  id: "alt-1",
  titel: "Bestehender Altartikel",
  autor: "Eva",
  text: "Dieser Altartikel bleibt erhalten.",
  geordnet: false,
  geteilt: true,
  status: "freigegeben",
  erstellt_am: "2026-08-01T10:00:00.000Z",
  liste: [],
  publikation: {
    status: "error",
    action: "unpublish",
    operationId: null,
    publicationId: "11111111-1111-4111-8111-111111111111",
    shareToken: "22222222-2222-4222-8222-222222222222",
    errorCode: "server",
  },
};

function button(container, text) {
  return [...container.querySelectorAll("button")]
    .find((element) => element.textContent.trim() === text);
}
function buttonContains(container, text) {
  return [...container.querySelectorAll("button")]
    .find((element) => element.textContent.includes(text));
}
function card(container, title) {
  const artikel = [...container.querySelectorAll("article.kd-blog-karte")]
    .find((element) => element.textContent.includes(title));
  return artikel?.querySelector("button.kd-blog-expand");
}
async function click(element) {
  assert.ok(element, "erwartetes Bedienelement fehlt");
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}
async function setValue(element, value) {
  assert.ok(element, "erwartetes Eingabefeld fehlt");
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  assert.equal(typeof setter, "function");
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

async function mount(artikel, overrides = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const calls = {
    create: [], update: [], refs: [], release: [], delete: [], addFilm: [], jump: [],
    discover: 0, retry: 0, export: 0, import: 0,
  };
  const props = {
    artikel,
    master: MASTER,
    fokusId: null,
    onFokusVerbraucht: () => {},
    onErstellen: async (data) => { calls.create.push(structuredClone(data)); return "neu-1"; },
    onAktualisieren: async (id, data) => { calls.update.push([id, structuredClone(data)]); return id; },
    onSetzeRef: async (...args) => { calls.refs.push(args); return true; },
    onFreigeben: async (...args) => { calls.release.push(structuredClone(args)); return true; },
    onLoeschen: async (id) => { calls.delete.push(id); return true; },
    onAddFilm: async (film) => { calls.addFilm.push(film); return "film-neu"; },
    onSpringeZuFilm: (id) => calls.jump.push(id),
    angemeldet: true,
    onZiehe: async () => { calls.discover++; return "gezogen"; },
    onRetryPublication: () => { calls.retry++; },
    exportArtikel: () => { calls.export++; },
    importArtikel: () => { calls.import++; },
    ...overrides,
  };
  await act(async () => {
    root.render(React.createElement(BlogTab, props));
    await Promise.resolve();
  });
  return {
    host,
    calls,
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const hub = await mount([privat, altPubliziert]);
check("Der private Hub lädt keine veröffentlichten Blogs und behält seine Schreibgrenzen", () => {
  assert.equal(buttonContains(hub.host, "Blogs entdecken"), undefined);
  assert.equal(buttonContains(hub.host, "Erneut versuchen"), undefined);
  assert.doesNotMatch(hub.host.textContent, /Shared —|Artikel importieren|Artikel exportieren/);
  assert.equal(hub.host.querySelector('input[type="checkbox"]'), null);
  assert.deepEqual(
    [hub.calls.discover, hub.calls.retry, hub.calls.export, hub.calls.import, netzAufrufe],
    [0, 0, 0, 0, 0],
  );
});

await click(card(hub.host, privat.titel));
await click(button(hub.host, "Lesen"));
check("Eigene Artikel bleiben lesbar und ihre Referenzen navigierbar", () => {
  assert.match(hub.host.textContent, /Ein privater Absatz/);
  assert.ok([...hub.host.querySelectorAll("a")].some((link) => link.textContent.includes("Blade Runner")));
});
await click([...hub.host.querySelectorAll("a")].find((link) => link.textContent.includes("Blade Runner")));
check("Der bestehende Referenzsprung bleibt angebunden", () => {
  assert.deepEqual(hub.calls.jump, ["blade_runner_1982"]);
});
await click(button(hub.host, "← Blog"));

await click(button(hub.host, "+ Neuer Artikel"));
check("Der Erstellen-Weg bleibt ohne Veröffentlichungs-Opt-in erreichbar", () => {
  assert.match(hub.host.textContent, /Neuer Artikel/);
  assert.doesNotMatch(hub.host.textContent, /Shared|veröffentlichen/);
});
await setValue(hub.host.querySelector('input[placeholder="Titel *"]'), "Neu und privat");
await setValue(hub.host.querySelector('textarea[placeholder^="Text *"]'), "Privater Text");
await click(button(hub.host, "+ Referenz"));
const titelFelder = hub.host.querySelectorAll('input[placeholder="Titel *"]');
await setValue(titelFelder[1], "Blade Runner");
await setValue(hub.host.querySelector('input[placeholder="Jahr"]'), "1982");
await setValue(hub.host.querySelector("select"), "film");
await click(button(hub.host, "Erstellen"));
check("Ein neuer Artikel erreicht den bestehenden Writer mit privatem Referenz-Payload", () => {
  assert.equal(hub.calls.create.length, 1);
  assert.equal(hub.calls.create[0].geteilt, false);
  assert.deepEqual(hub.calls.create[0].liste, [{
    eingabe: "Blade Runner", jahr: 1982, typ: "film", ref: null,
  }]);
});
await hub.cleanup();

const altSnapshot = structuredClone(altPubliziert);
const edit = await mount([altPubliziert]);
await click(card(edit.host, altPubliziert.titel));
check("Bestehende Alt-Publikationen bleiben sichtbar, aber besitzen keinen separaten Retry", () => {
  assert.match(edit.host.textContent, /öffentliche Kopie konnte nicht entfernt werden/);
  assert.equal(buttonContains(edit.host, "Erneut versuchen"), undefined);
});
await click(buttonContains(edit.host, "Bearbeiten"));
await setValue(edit.host.querySelector('input[placeholder="Titel *"]'), "Altartikel privat bearbeitet");
await click(button(edit.host, "Speichern"));
check("Eine Bearbeitung bewahrt den lokalen Alt-Publikationszustand", () => {
  assert.equal(edit.calls.update.length, 1);
  assert.equal(edit.calls.update[0][0], altPubliziert.id);
  assert.equal(edit.calls.update[0][1].geteilt, true);
  assert.equal(edit.calls.update[0][1].titel, "Altartikel privat bearbeitet");
  assert.deepEqual(altPubliziert, altSnapshot);
  assert.equal(edit.calls.retry, 0);
});
await edit.cleanup();

const deletion = await mount([altPubliziert]);
await click(card(deletion.host, altPubliziert.titel));
await click(deletion.host.querySelector('button[aria-label="Artikel löschen"]'));
const deleteButton = button(deletion.host, "Endgültig löschen");
check("Die sichere Altartikel-Löschung warnt weiter vor der öffentlichen Kopie", () => {
  assert.match(deletion.host.textContent, /Entfernt zuerst die öffentliche Kopie/);
  assert.equal(deleteButton.disabled, true);
  assert.equal(deletion.calls.delete.length, 0);
});
await setValue(deletion.host.querySelector('input[placeholder="Autor"]'), "Eva");
await click(deleteButton);
check("Erst die Autorbestätigung delegiert genau eine sichere Löschoperation", () => {
  assert.deepEqual(deletion.calls.delete, [altPubliziert.id]);
  assert.deepEqual(altPubliziert, altSnapshot);
  assert.equal(deletion.calls.retry, 0);
  assert.equal(netzAufrufe, 0);
});
await deletion.cleanup();

const wartend = { ...privat, id: "wartend-1", status: "wartet" };
const match = await mount([wartend]);
await click(card(match.host, wartend.titel));
await click(button(match.host, "Abgleich öffnen"));
check("Der bestehende Referenzabgleich bleibt für wartende eigene Artikel erreichbar", () => {
  assert.match(match.host.textContent, /Abgleich abgeschlossen/);
  assert.match(match.host.textContent, /verlinkt/);
  assert.ok(button(match.host, "Freigeben"));
});
await click(button(match.host, "Freigeben"));
check("Der private Freigabeschritt bleibt an den vorhandenen Artikel-Callback gebunden", () => {
  assert.deepEqual(match.calls.release, [[wartend.id, { synchronisierePublikation: false }]]);
  assert.equal(match.calls.discover, 0);
  assert.equal(netzAufrufe, 0);
});
await match.cleanup();

let listCalls = 0;
const sharedService = { list: async () => {
  listCalls++;
  return { ok: true, blogs: [
    { publication_id: "publication-max", author: "Max", updated_at: "2026-08-02T21:20:58Z",
      artikel: { id: privat.id, titel: "Test Blog-Sharing", autor: "Max", text: "Ein veröffentlichter Absatz.\n\nZum Lesen für andere Konten.",
        erstellt_am: "2026-08-02T21:20:23Z", liste: [{ eingabe: "Alien", jahr: 1979, ref: MASTER[0].id }] } },
    { publication_id: "publication-eva", author: "Eva", artikel: { titel: "Ein anderer Blog", text: "Evas Text." } },
  ] };
} };
const reading = await mount([privat], { sharedService });
check("Veröffentlichte Inhalte werden erst beim Öffnen des Bereichs angefragt", () => {
  assert.equal(listCalls, 0);
  assert.ok(button(reading.host, "Veröffentlicht"));
});
await click(button(reading.host, "+ Neuer Artikel"));
await setValue(reading.host.querySelector('input[placeholder="Titel *"]'), "Mein noch ungespeicherter Entwurf");
await click(button(reading.host, "Veröffentlicht"));
const publicView = reading.host.querySelector(".kd-blog-veroeffentlicht");
check("Die veröffentlichte Liste zeigt Titel, Autor und beide öffentlichen Kopien", () => {
  assert.equal(listCalls, 1);
  assert.match(publicView.textContent, /Test Blog-Sharing/);
  assert.match(publicView.textContent, /Max/);
  assert.equal(publicView.querySelectorAll("article").length, 2);
});
await setValue(publicView.querySelector('input[type="search"]'), "max");
check("Die Suche findet den veröffentlichten Blog über seinen Autor", () => {
  assert.equal(publicView.querySelectorAll("article").length, 1);
  assert.match(publicView.textContent, /Test Blog-Sharing/);
});
await setValue(publicView.querySelector('input[type="search"]'), "test blog-sharing");
await click(button(publicView, "Lesen"));
const reader = reading.host.querySelector(".kd-blog-leseansicht");
check("Die vollständige veröffentlichte Kopie ist lesbar, ohne private Bearbeitungsrechte oder Referenzsprünge", () => {
  assert.match(reader.textContent, /Zum Lesen für andere Konten/);
  assert.match(reader.textContent, /Alien \(1979\)/);
  assert.equal(reader.querySelectorAll("button").length, 1);
  assert.equal(reader.querySelectorAll("a,input,textarea").length, 0);
  assert.equal(buttonContains(reader, "Bearbeiten"), undefined);
  assert.ok(button(reader, "← Veröffentlicht"));
  assert.deepEqual(Object.values(reading.calls).filter(Array.isArray).flat(), []);
});
await click(button(reader, "← Veröffentlicht"));
check("Zurück erhält die Suche", () => {
  assert.equal(reading.host.querySelector('input[type="search"]').value, "test blog-sharing");
});
await click(button(reading.host, "Meine Artikel"));
check("Der Wechsel zum Lesen bewahrt einen ungespeicherten privaten Entwurf", () => {
  assert.equal(reading.host.querySelector('input[placeholder="Titel *"]').value, "Mein noch ungespeicherter Entwurf");
  assert.equal(netzAufrufe, 0);
});
await reading.cleanup();

let attempts = 0;
const retry = await mount([], { sharedService: { list: async () => {
  if (++attempts === 1) throw new Error("offline");
  return { ok: true, blogs: [] };
} } });
await click(button(retry.host, "Veröffentlicht"));
check("Ein Lesefehler bleibt sichtbar und wird nicht als leere Liste ausgegeben", () => {
  assert.ok(retry.host.querySelector('[role="alert"]'));
  assert.doesNotMatch(retry.host.querySelector(".kd-blog-veroeffentlicht").textContent, /Noch keine veröffentlichten Blogs/);
});
await click(button(retry.host, "Neu laden"));
check("Bewusstes Neuladen kann einen Lesefehler beheben", () => {
  assert.equal(attempts, 2);
  assert.equal(retry.host.querySelector('[role="alert"]'), null);
  assert.match(retry.host.textContent, /Noch keine veröffentlichten Blogs/);
});
await retry.cleanup();

dom.window.close();
esbuild.stop?.();
console.log(`private_release_blog_surface_test: ${checks} Checks bestanden (nur Mocks).`);
process.exit(0);
