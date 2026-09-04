/* Echte React-/JSDOM-Regressionen für bestätigte asynchrone UI-Writes.
   Rein lokal: Komponenten werden mit esbuild gebündelt; kein Netz/Anbieter. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { mitBestaetigterStringId } from "./src/controllers/confirmedIdController.js";
import { erstelleBestaetigtenStateWriter } from "./src/controllers/useConfirmedStorageState.js";
import {
  istBeobachtet, mediathekIdVon, setzeSerienBeobachtung, statusVon, toggleGesehenInStatus,
} from "./src/lib/staffeln.js";

const wurzel = path.dirname(fileURLToPath(import.meta.url));
async function ladeEsbuild() {
  try { return await import("esbuild"); }
  catch { return createRequire(import.meta.resolve("vite"))("esbuild"); }
}
const ausgabeDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-async-persistence-ui-test-"));
const ausgabe = path.join(ausgabeDir, "bundle.mjs");
fs.symlinkSync(path.join(wurzel, "node_modules"), path.join(ausgabeDir, "node_modules"), "dir");
process.on("exit", () => fs.rmSync(ausgabeDir, { recursive: true, force: true }));
const esbuild = await ladeEsbuild();
await esbuild.build({
  stdin: {
    contents: [
      'export { FilmCard } from "./src/components/FilmCard.jsx";',
      'export { MedienForm } from "./src/components/MedienForm.jsx";',
      'export { StapelImport } from "./src/components/StapelImport.jsx";',
      'export { GlobalErrorQueue } from "./src/components/GlobalErrorQueue.jsx";',
      'export { Wochenplan } from "./src/components/Wochenplan.jsx";',
      'export { StreamingTab } from "./src/tabs/StreamingTab.jsx";',
      'export { ArtikelMaske } from "./src/tabs/BlogTab.jsx";',
      'export { KontoUebernahme } from "./src/components/KontoUebernahme.jsx";',
      'export { useBackupExportController } from "./src/controllers/useBackupExportController.js";',
      'export { useVokabularController } from "./src/controllers/useVokabularController.js";',
      'export { K, setStorageDriver as setGebundenerTestTreiber } from "./src/lib/storage.js";',
      'export { alleStimmungen, setzeEigeneStimmungen } from "./src/lib/finder.js";',
      'export { vokabularZuMap } from "./src/lib/vokabular.js";',
    ].join("\n"),
    loader: "js",
    resolveDir: wurzel,
  },
  bundle: true,
  format: "esm",
  outfile: ausgabe,
  jsx: "automatic",
  target: "es2022",
  logLevel: "warning",
  external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: "http://localhost/" });
for (const name of [
  "window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
  "Element", "Event", "MouseEvent", "Node", "NodeList", "getComputedStyle", "localStorage",
]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name],
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const {
  FilmCard, MedienForm, StapelImport, GlobalErrorQueue, ArtikelMaske, KontoUebernahme,
  Wochenplan, StreamingTab,
  useBackupExportController, useVokabularController, K, setGebundenerTestTreiber,
  alleStimmungen, setzeEigeneStimmungen, vokabularZuMap,
} = await import(ausgabe);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let checks = 0;
const check = (wert, text) => {
  assert.ok(wert, text);
  checks++;
  console.log("✓ " + text);
};
const knopf = (container, text) => [...container.querySelectorAll("button")]
  .find((element) => element.textContent.includes(text));
const setzeWert = (element, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  setter.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
};
async function mounte(Komponente, props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(h(Komponente, props)); await tick(); });
  return {
    container,
    async cleanup() { await act(async () => root.unmount()); container.remove(); },
  };
}

const dismissed = [];
const queueFixture = await mounte(GlobalErrorQueue, {
  errors: [
    { id: "programm:1", scope: "programm", text: "Programm kaputt" },
    { id: "streaming:1", scope: "streaming", text: "Streaming kaputt" },
  ],
  onDismiss: (id) => dismissed.push(id),
});
check(queueFixture.container.querySelectorAll('[role="alert"]').length === 2,
  "globale Queue rendert jeden Scope als eigenen Alert");
await act(async () => { queueFixture.container.querySelectorAll("button")[1].click(); await tick(); });
check(dismissed.join(",") === "streaming:1", "Queue-Dismiss adressiert exakt den gewählten Eintrag");
await queueFixture.cleanup();

/* FilmCard: Fehler behält Editor + Text, Erfolg schließt; Doppelklick genau 1 Write. */
let filmResolver = null;
const filmWrites = [];
const filmFixture = await mounte(FilmCard, {
  film: { id: "musik_1", titel: "Album", jahr: 2020, typ: "musik", beschreibung: "Alt", notiz: "" },
  expanded: true,
  onSave: (changes) => {
    filmWrites.push(changes);
    return new Promise((resolve) => { filmResolver = resolve; });
  },
});
await act(async () => { knopf(filmFixture.container, "Beschreibung bearbeiten").click(); await tick(); });
const beschreibung = filmFixture.container.querySelector(".kd-beschreibung-editor textarea");
await act(async () => { setzeWert(beschreibung, "Neu und ungesichert"); await tick(); });
await act(async () => {
  const speichern = knopf(filmFixture.container, "Speichern");
  speichern.click(); speichern.click(); await tick();
});
check(filmWrites.length === 1 && knopf(filmFixture.container, "Speichert").disabled,
  "FilmCard sperrt einen zweiten Write, solange die Bestätigung aussteht");
check(filmFixture.container.querySelector(".kd-beschreibung-editor textarea").value === "Neu und ungesichert",
  "FilmCard lässt den Editor samt Eingabe während des Writes offen");
await act(async () => { filmResolver(false); await tick(); });
check(!!filmFixture.container.querySelector(".kd-beschreibung-editor")
  && filmFixture.container.querySelector(".kd-beschreibung-editor textarea").value === "Neu und ungesichert"
  && /nicht bestätigt gespeichert/.test(filmFixture.container.textContent),
"FilmCard bewahrt Editor und Eingabe nach bestätigtem false");
await act(async () => { knopf(filmFixture.container, "Speichern").click(); await tick(); });
await act(async () => { filmResolver(true); await tick(); });
check(!filmFixture.container.querySelector(".kd-beschreibung-editor") && filmWrites.length === 2,
  "FilmCard schließt erst nach erfolgreicher Write-Bestätigung");
await filmFixture.cleanup();

/* ArtikelMaske: harter Doppelklick-Lock und private Release-Schreibgrenze. */
let artikelResolver = null;
const artikelWrites = [];
const geteilterArtikel = {
  id: "blog_1", titel: "Titel", autor: "Max", text: "Text", geordnet: false,
  geteilt: true, liste: [],
};
const artikelFixture = await mounte(ArtikelMaske, {
  vorlage: geteilterArtikel,
  angemeldet: false,
  onErstellen: (daten) => {
    artikelWrites.push(daten);
    return new Promise((resolve) => { artikelResolver = resolve; });
  },
  onAbbrechen() {},
});
check(!artikelFixture.container.textContent.includes("Shared —"), "Gast sieht in der Artikelmaske kein Shared-Control");
await act(async () => {
  const speichern = knopf(artikelFixture.container, "Speichern");
  speichern.click(); speichern.click(); await tick();
});
check(artikelWrites.length === 1 && artikelWrites[0].geteilt === true,
  "Artikelmaske verhindert Doppelartikel und bewahrt bestehenden geteilt-Wert beim Gast");
await act(async () => { artikelResolver(null); await tick(); });
check(!!knopf(artikelFixture.container, "Speichern") && /Eingabe bleibt erhalten/.test(artikelFixture.container.textContent),
  "Artikelmaske bleibt nach fehlgeschlagenem Write mit sichtbarer Diagnose offen");
await artikelFixture.cleanup();

const kontoFixture = await mounte(ArtikelMaske, {
  vorlage: null, angemeldet: true, onErstellen: async () => null, onAbbrechen() {},
});
check(!kontoFixture.container.textContent.includes("Shared —"),
  "Auch ein bereites Konto sieht im Privatrelease kein Shared-Control");
await kontoFixture.cleanup();

/* Kontoaktivierung: async Reject bleibt im Assistenten, serialisiert Klicks
   und ruft onFertig niemals vor bestätigtem Abschluss. */
let kontoConfirmResolver = null;
let kontoConfirmRejecter = null;
let kontoConfirmCalls = 0;
let kontoFertigCalls = 0;
const kontoServices = {
  inventurLaden: async () => ({
    fall: "beide-leer", lokaleWerte: {}, vorschau: [], accountBindung: { accountId: "A", generation: 1 },
  }),
  uebernahmeBestaetigen: () => {
    kontoConfirmCalls++;
    return new Promise((resolve, reject) => {
      kontoConfirmResolver = resolve; kontoConfirmRejecter = reject;
    });
  },
};
const kontoAktivFixture = await mounte(KontoUebernahme, {
  accountId: "A", services: kontoServices, onFertig: () => { kontoFertigCalls++; },
});
await act(async () => { await tick(); });
await act(async () => {
  const allesKlar = knopf(kontoAktivFixture.container, "Alles klar");
  allesKlar.click(); allesKlar.click(); await tick();
});
check(kontoConfirmCalls === 1 && knopf(kontoAktivFixture.container, "Aktiviert").disabled
  && kontoFertigCalls === 0,
"Kontoaktivierung serialisiert Doppelklick und meldet vor Persistenz keinen Erfolg");
await act(async () => { kontoConfirmRejecter(new Error("Marker nicht bestätigt")); await tick(); });
check(kontoFertigCalls === 0 && !!knopf(kontoAktivFixture.container, "Alles klar")
  && /Marker nicht bestätigt/.test(kontoAktivFixture.container.textContent),
"Fehlgeschlagene Kontoaktivierung bleibt mit Fehler und Retry im Assistenten offen");
await act(async () => { knopf(kontoAktivFixture.container, "Alles klar").click(); await tick(); });
await act(async () => { kontoConfirmResolver(); await tick(); });
check(kontoConfirmCalls === 2 && kontoFertigCalls === 1,
  "Kontoassistent schließt erst nach bestätigter Aktivierung erfolgreich ab");
await kontoAktivFixture.cleanup();

/* MedienForm: async false/null darf Form und Eingabe nicht vorzeitig schließen. */
let medienResolver = null;
let medienWrites = 0;
const medienFixture = await mounte(MedienForm, {
  typ: "musik", startOffen: true, initial: { titel: "Kind of Blue" },
  onAdd: () => { medienWrites++; return new Promise((resolve) => { medienResolver = resolve; }); },
});
await act(async () => {
  const add = knopf(medienFixture.container, "Hinzufügen");
  add.click(); add.click(); await tick();
});
check(medienWrites === 1 && knopf(medienFixture.container, "Speichert").disabled,
  "MedienForm serialisiert den Add-Doppelklick");
await act(async () => { medienResolver(false); await tick(); });
check(medienFixture.container.querySelector('input[placeholder="Titel *"]').value === "Kind of Blue"
  && /Eingabe bleibt erhalten/.test(medienFixture.container.textContent),
"MedienForm bleibt bei fehlgeschlagener Persistenz samt Eingabe offen");
await medienFixture.cleanup();

/* Stapelimport: blockierter/falscher Bulk-Write behält die geprüfte Vorschau. */
let stapelResolver = null;
let stapelWrites = 0;
const stapelFixture = await mounte(StapelImport, {
  master: [], kiAktiv: false,
  addFilme: () => { stapelWrites++; return new Promise((resolve) => { stapelResolver = resolve; }); },
});
const extern = stapelFixture.container.querySelector('textarea[placeholder^="JSON-Antwort"]');
const antwort = { data: { kandidaten: [
  { titel: "Alien", typ: "film", jahr: 1979, quelle: "bluray", staffeln: null, vorbeurteilung: "offen", begruendung: "", sicherheit: "hoch" },
], warnungen: [] } };
await act(async () => { setzeWert(extern, JSON.stringify(antwort)); await tick(); });
await act(async () => { knopf(stapelFixture.container, "Antwort prüfen").click(); await tick(); });
await act(async () => {
  const uebernehmen = knopf(stapelFixture.container, "Auswahl übernehmen");
  uebernehmen.click(); uebernehmen.click(); await tick();
});
check(stapelWrites === 1 && knopf(stapelFixture.container, "Übernimmt").disabled,
  "Stapelimport startet bei Doppelklick nur eine Übernahme");
await act(async () => { stapelResolver(null); await tick(); });
check(stapelFixture.container.textContent.includes("Vorschau – noch ist nichts gespeichert")
  && !stapelFixture.container.textContent.includes("Übernommen: 0"),
"Stapelimport behält bei Writefehler die geprüfte Vorschau und meldet keinen Scheinerfolg");
await stapelFixture.cleanup();

/* Gemeinsame ID-Barriere: Promise/Objekt erreicht weder Blogref noch Status. */
let idResolver = null;
const uebernommeneIds = [];
const idLauf = mitBestaetigterStringId(
  () => new Promise((resolve) => { idResolver = resolve; }),
  async (id) => { uebernommeneIds.push(id); return true; },
);
await tick();
check(uebernommeneIds.length === 0, "Folgezustand bleibt leer, solange addFilm nur ein offenes Promise ist");
idResolver("film_1979");
check(await idLauf === "film_1979" && uebernommeneIds[0] === "film_1979",
  "erst die bestätigte String-ID erreicht Blogref/Streaming-Status");
let objektUebernommen = false;
check(await mitBestaetigterStringId(async () => ({}), async () => { objektUebernommen = true; }) === null
  && objektUebernommen === false,
"Objekte und Promises können nicht als ID in den Folgezustand gelangen");

/* Der gemeinsame Writer bildet echte Storage-Rejects auf false ab und commitet
   weder Wochenplan noch Streamingstatus optimistisch in den sichtbaren State. */
for (const [key, start, next, label] of [
  ["kd:wochenplan", { version: 1, eintraege: [] }, { version: 1, eintraege: [{ id: "r1" }] }, "Wochenplan"],
  ["kd:entdecken-status", {}, { wm_1: { status: "gesehen" } }, "Streamingstatus"],
]) {
  let sichtbar = start;
  let meldungen = 0;
  const writer = erstelleBestaetigtenStateWriter({
    key,
    liesWert: () => sichtbar,
    commit: (wert) => { sichtbar = wert; },
    meldeFehler: () => { meldungen++; },
    captureContext: () => ({
      isCurrent: () => true,
      set: async () => { throw new Error("Storage voll"); },
    }),
  });
  const ergebnis = await writer(() => next);
  check(ergebnis === false && sichtbar === start && meldungen === 1,
    `${label} bleibt bei Storage-Reject auf dem bestätigten Ausgangsstand`);
}

/* App-Vokabular: dieselbe Writernaht bestätigt Storage und Kontext, bevor
   React-State/Finder-Projektion wechseln. Die App-Verkabelung wird ergänzend
   eng geprüft, weil ein vollständiger App-Mount Session- und Boot-Dienste
   unnötig in diesen fokussierten Persistenztest ziehen würde. */
const altesVokabular = [{ wort: "altwort", genres: ["Drama"], tags: [] }];
const neuesVokabular = [{ wort: "neuwort", genres: ["Komödie"], tags: ["leicht"] }];
const normalisiereVokabular = (wert) => {
  if (!Array.isArray(wert)) throw new TypeError("Vokabular muss eine Liste sein.");
  return wert;
};
let vokabularSichtbar = altesVokabular;
let vokabularFehler = 0;
setzeEigeneStimmungen(vokabularZuMap(vokabularSichtbar));
const vokabularCommit = (wert) => {
  vokabularSichtbar = wert;
  setzeEigeneStimmungen(vokabularZuMap(vokabularSichtbar));
};
const finderHat = (wort) => Object.prototype.hasOwnProperty.call(alleStimmungen(), wort);

const rejectWriter = erstelleBestaetigtenStateWriter({
  key: K.vokabular,
  liesWert: () => vokabularSichtbar,
  normalisiere: normalisiereVokabular,
  commit: vokabularCommit,
  meldeFehler: () => { vokabularFehler++; },
  captureContext: () => ({
    isCurrent: () => true,
    set: async () => { throw new Error("Storage voll"); },
  }),
});
check(await rejectWriter(neuesVokabular) === false
  && vokabularSichtbar === altesVokabular && finderHat("altwort") && !finderHat("neuwort")
  && vokabularFehler === 1,
"K.vokabular-Reject liefert false und lässt sichtbaren State sowie Finder-Projektion bestätigt");
check(await rejectWriter({ wort: "keine-liste" }) === false
  && vokabularSichtbar === altesVokabular && vokabularFehler === 1,
"K.vokabular weist formfremde Werte fail-closed ohne Scheinerfolg ab");

let loeseVokabularWrite;
let geschriebenerVokabularwert = null;
const vokabularWriteOffen = new Promise((resolve) => { loeseVokabularWrite = resolve; });
const erfolgWriter = erstelleBestaetigtenStateWriter({
  key: K.vokabular,
  liesWert: () => vokabularSichtbar,
  normalisiere: normalisiereVokabular,
  commit: vokabularCommit,
  captureContext: () => ({
    isCurrent: () => true,
    set: async (key, value) => {
      check(key === K.vokabular, "bestätigter Vokabular-Writer schreibt exakt K.vokabular");
      geschriebenerVokabularwert = value;
      await vokabularWriteOffen;
    },
  }),
});
const erfolgreicherLauf = erfolgWriter(neuesVokabular);
await tick();
check(vokabularSichtbar === altesVokabular && finderHat("altwort") && !finderHat("neuwort"),
  "offener K.vokabular-Write ändert weder sichtbaren State noch Finder-Projektion vorzeitig");
loeseVokabularWrite();
check(await erfolgreicherLauf === neuesVokabular
  && geschriebenerVokabularwert === JSON.stringify(neuesVokabular)
  && vokabularSichtbar === neuesVokabular && !finderHat("altwort") && finderHat("neuwort"),
"bestätigter K.vokabular-Commit aktualisiert danach State und Finder-Projektion gemeinsam");

let kontextAktuell = true;
let loeseKontextWrite;
const kontextWriteOffen = new Promise((resolve) => { loeseKontextWrite = resolve; });
const kontextWriter = erstelleBestaetigtenStateWriter({
  key: K.vokabular,
  liesWert: () => vokabularSichtbar,
  normalisiere: normalisiereVokabular,
  commit: vokabularCommit,
  captureContext: () => ({
    isCurrent: () => kontextAktuell,
    set: async () => { await kontextWriteOffen; },
  }),
});
const fremderKontextWert = [{ wort: "fremdkontext", genres: ["Horror"], tags: [] }];
const kontextLauf = kontextWriter(fremderKontextWert);
await tick();
kontextAktuell = false;
loeseKontextWrite();
check(await kontextLauf === false && vokabularSichtbar === neuesVokabular
  && finderHat("neuwort") && !finderHat("fremdkontext"),
"Konto-/Treiberwechsel während K.vokabular-Write liefert false und commitet nicht in den neuen Sichtkontext");

let aktiveVokabularWrites = 0;
let maximaleVokabularWrites = 0;
let ersterQueueStart;
let loeseErstenQueueWrite;
const ersterQueueGestartet = new Promise((resolve) => { ersterQueueStart = resolve; });
const ersterQueueOffen = new Promise((resolve) => { loeseErstenQueueWrite = resolve; });
let queueWriteNr = 0;
const queueWriter = erstelleBestaetigtenStateWriter({
  key: K.vokabular,
  liesWert: () => vokabularSichtbar,
  normalisiere: normalisiereVokabular,
  commit: vokabularCommit,
  captureContext: () => ({
    isCurrent: () => true,
    set: async () => {
      const nr = ++queueWriteNr;
      aktiveVokabularWrites++;
      maximaleVokabularWrites = Math.max(maximaleVokabularWrites, aktiveVokabularWrites);
      if (nr === 1) { ersterQueueStart(); await ersterQueueOffen; }
      aktiveVokabularWrites--;
    },
  }),
});
const queueA = [{ wort: "klick-eins", genres: ["Drama"], tags: [] }];
const queueB = [{ wort: "klick-zwei", genres: ["Thriller"], tags: [] }];
const ersterKlick = queueWriter(queueA);
await ersterQueueGestartet;
const zweiterKlick = queueWriter(queueB);
await tick();
check(queueWriteNr === 1 && vokabularSichtbar === neuesVokabular,
  "Doppelklick-Äquivalent startet keinen zweiten K.vokabular-Write parallel und commitet nicht vorzeitig");
loeseErstenQueueWrite();
check(await ersterKlick === queueA && await zweiterKlick === queueB
  && queueWriteNr === 2 && maximaleVokabularWrites === 1 && vokabularSichtbar === queueB
  && finderHat("klick-zwei") && !finderHat("klick-eins"),
"K.vokabular serialisiert zwei schnelle Writes und projiziert den letzten bestätigten Stand");

const appQuelle = fs.readFileSync(path.join(wurzel, "src/App.jsx"), "utf8");
check(/useVokabularController\(\s*\{\s*setErr\s*\}\s*\)/.test(appQuelle),
  "App bindet den echten useVokabularController im Runtime-Pfad weiter");

const wortImFinder = (wort) => Object.prototype.hasOwnProperty.call(alleStimmungen(), wort);
async function mounteVokabularController() {
  let api = null;
  let setErrCalls = 0;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  function VokabularProbe() {
    api = useVokabularController({ setErr: () => { setErrCalls++; } });
    return null;
  }
  await act(async () => { root.render(h(VokabularProbe)); await tick(); });
  return {
    api: () => api,
    setErrCalls: () => setErrCalls,
    wortImFinder,
    async cleanup() {
      await act(async () => { root.unmount(); });
      container.remove();
      setGebundenerTestTreiber(null);
      setzeEigeneStimmungen(vokabularZuMap([]));
    },
  };
}

setzeEigeneStimmungen(vokabularZuMap([]));
const vokabularFixture = await mounteVokabularController();
const bootVokabular = [{ wort: "bootwort", genres: ["Drama"], tags: ["hell"] }];
const neuerVokabular = [{ wort: "zielwort", genres: ["Komödie"], tags: ["leicht"] }];
const ablehnVokabular = [{ wort: "ablehnwort", genres: ["Doku"], tags: [] }];
const kontextVokabular = [{ wort: "kontextwort", genres: ["Horror"], tags: ["wechsel"] }];
await act(async () => {
  vokabularFixture.api().setVokabular(bootVokabular);
  await tick();
});
check(vokabularFixture.api().vokabular === bootVokabular
  && vokabularFixture.wortImFinder("bootwort") && !vokabularFixture.wortImFinder("zielwort"),
  "setVokabular projiziert bestätigte geladene Vokabulardaten in State und Finder");

let gespeichertePayload = null;
let loeseVokabularControllerWrite;
const writeBlock = new Promise((resolve) => { loeseVokabularControllerWrite = resolve; });
setGebundenerTestTreiber({
  name: "lokal", owner: "guest-local",
  async get() { return null; },
  async set(key, value) {
    check(key === K.vokabular, "saveVokabular schreibt gegen den bestätigten Vokabular-Key");
    gespeichertePayload = value;
    await writeBlock;
    return { key, value };
  },
  async delete() { return { key: "ignore", deleted: true }; },
  async list() { return { keys: [] }; },
});
const pendingWrite = vokabularFixture.api().saveVokabular(neuerVokabular);
check(vokabularFixture.api().vokabular === bootVokabular
  && !vokabularFixture.wortImFinder("zielwort") && vokabularFixture.wortImFinder("bootwort")
  && gespeichertePayload === null,
  "saveVokabular verändert vor Promise-Erfolg weder sichtbaren State noch Finder-Projektion");
loeseVokabularControllerWrite();
const writeErgebnis = await act(async () => await pendingWrite);
check(writeErgebnis === neuerVokabular
  && vokabularFixture.api().vokabular === neuerVokabular
  && vokabularFixture.wortImFinder("zielwort") && !vokabularFixture.wortImFinder("bootwort"),
  "bestätigter saveVokabular-Commit aktualisiert State und Finder gemeinsam");
check(gespeichertePayload === JSON.stringify(neuerVokabular),
  "bestätigter Vokabular-Write serialisiert den exakten persistierten Stand");

let loeseAbbruch;
const writeReject = new Promise((_, reject) => { loeseAbbruch = reject; });
setGebundenerTestTreiber({
  name: "lokal-reject", owner: "guest-local",
  async get() { return null; },
  async set() { return writeReject; },
  async delete() { return { key: "ignore", deleted: true }; },
  async list() { return { keys: [] }; },
});
const rejectWrite = vokabularFixture.api().saveVokabular(ablehnVokabular);
check(vokabularFixture.api().vokabular === neuerVokabular
  && !vokabularFixture.wortImFinder("ablehnwort"),
  "Ablehnung eines saveVokabular-Laufs hält vor dem Resolve den alten Stand");
loeseAbbruch(new Error("Testablehnung"));
const rejectErgebnis = await rejectWrite;
check(rejectErgebnis === false && vokabularFixture.api().vokabular === neuerVokabular
  && !vokabularFixture.wortImFinder("ablehnwort"),
  "Reject/false hält Vokabular-State und Finder unverändert");

let loeseTreiberAWrite;
const treiberAWrite = new Promise((resolve) => { loeseTreiberAWrite = resolve; });
let treiberAStart;
const treiberAStartSignal = new Promise((resolve) => { treiberAStart = resolve; });
let treiberASet = 0;
let treiberBSet = 0;
const treiberA = {
  name: "konto-a", owner: "account:A",
  async get() { return null; },
  async set() {
    treiberASet += 1;
    treiberAStart();
    await treiberAWrite;
    return { key: K.vokabular, value: JSON.stringify(kontextVokabular) };
  },
  async delete() { return { key: "ignore", deleted: true }; },
  async list() { return { keys: [] }; },
};
const treiberB = {
  name: "konto-b", owner: "account:B",
  async get() { return null; },
  async set() { treiberBSet += 1; return { key: K.vokabular, value: JSON.stringify(kontextVokabular) }; },
  async delete() { return { key: "ignore", deleted: true }; },
  async list() { return { keys: [] }; },
};
setGebundenerTestTreiber(treiberA);
const kontextWrite = vokabularFixture.api().saveVokabular(kontextVokabular);
check(vokabularFixture.api().vokabular === neuerVokabular
  && !vokabularFixture.wortImFinder("kontextwort"),
  "Contextwechsel wird während offener Bestätigung sauber vorbereitet");
await treiberAStartSignal;
setGebundenerTestTreiber(treiberB);
loeseTreiberAWrite();
const kontextErgebnis = await kontextWrite;
check(kontextErgebnis === false
  && vokabularFixture.api().vokabular === neuerVokabular
  && !vokabularFixture.wortImFinder("kontextwort")
  && treiberASet === 1 && treiberBSet === 0,
  "Contextwechsel verhindert Commit von saveVokabular und schützt den sichtbaren Stand");
await vokabularFixture.cleanup();

async function pruefeStatusReihenfolge(erster, zweiter) {
  const titel = {
    watchmode_id: "wm_race", titel: "Race-Serie", typ: "tv_series",
    staffeln_verfuegbar: 4, folgen_verfuegbar: 30,
  };
  let sichtbar = { wm_race: { status: "erstellt", mediathek_id: "master_race" } };
  let kontextNr = 0;
  let ersterWriteGestartet;
  let loeseErstenWrite;
  const ersterStart = new Promise((resolve) => { ersterWriteGestartet = resolve; });
  const ersteBlockade = new Promise((resolve) => { loeseErstenWrite = resolve; });
  const writer = erstelleBestaetigtenStateWriter({
    key: "kd:entdecken-status",
    liesWert: () => sichtbar,
    commit: (wert) => { sichtbar = wert; },
    captureContext: () => {
      const nr = ++kontextNr;
      return {
        isCurrent: () => true,
        set: async () => {
          if (nr === 1) { ersterWriteGestartet(); await ersteBlockade; }
        },
      };
    },
  });
  const aktionen = {
    gesehen: (prev) => toggleGesehenInStatus(prev, titel, new Date("2026-08-08T10:00:00Z")),
    beobachten: (prev) => ({
      ...prev,
      wm_race: setzeSerienBeobachtung(prev.wm_race, titel, true, new Date("2026-08-08T10:00:00Z")),
    }),
  };
  const ersterLauf = writer(aktionen[erster]);
  await ersterStart;
  const zweiterLauf = writer(aktionen[zweiter]);
  loeseErstenWrite();
  await Promise.all([ersterLauf, zweiterLauf]);
  return sichtbar.wm_race;
}
for (const reihenfolge of [["beobachten", "gesehen"], ["gesehen", "beobachten"]]) {
  const endstand = await pruefeStatusReihenfolge(...reihenfolge);
  check(statusVon(endstand) === "gesehen" && istBeobachtet(endstand)
    && mediathekIdVon(endstand) === "master_race" && endstand.staffel_alarm_basis === 4,
  `${reihenfolge.join(" → ")} bewahrt Gesehen-, Beobachten-, Staffel- und Mediathekstatus queue-zeitig`);
}

/* Wochenplan: Die verknüpfte Master-ID gilt erst, wenn der Wochenplanwrite
   bestätigt ist; während des offenen Writes bleibt die Aktion gesperrt. */
const heute = new Date();
const isoHeute = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}-${String(heute.getDate()).padStart(2, "0")}`;
const wochentag = heute.getDay() || 7;
let planResolver = null;
let planWrites = 0;
const wochenFixture = await mounte(Wochenplan, {
  plan: { version: 1, eintraege: [{
    id: "reminder_1", titel: "Serienabend", art: "folge", jahr: 2020,
    wochentage: [wochentag], intervall_wochen: 1, startdatum: isoHeute,
    uhrzeit: "", ende: { typ: "nie" }, ref: null, link_modus: "keiner",
    erstellt_am: `${isoHeute}T08:00:00.000Z`,
  }] },
  onPlanAendern: () => {
    planWrites++;
    return new Promise((resolve) => { planResolver = resolve; });
  },
  onFilmAnlegen: async () => "master_1",
});
await act(async () => { knopf(wochenFixture.container, "Titel anlegen").click(); await tick(); });
check(planWrites === 1 && knopf(wochenFixture.container, "Legt an").disabled,
  "Wochenplan meldet nach addFilm keinen Erfolg vor bestätigtem Referenz-Write");
await act(async () => { planResolver(false); await tick(); });
check(!!knopf(wochenFixture.container, "Titel anlegen") && !wochenFixture.container.textContent.includes("Verknüpft:"),
  "fehlgeschlagener Wochenplan-Write lässt die Referenz sichtbar unverändert");
await wochenFixture.cleanup();

/* Streaming: Nach bestätigter Film-ID bleibt die Gesehen-Maske offen, solange
   der Statuswrite aussteht, und ebenso nach dessen bestätigtem Fehlschlag. */
let statusResolver = null;
let statusWrites = 0;
const streamingFixture = await mounte(StreamingTab, {
  bekannt: { stand: new Date().toISOString(), titel: [] },
  entdecken: { stand: new Date().toISOString(), titel: [{
    watchmode_id: "wm_1", titel: "Testfilm", jahr: 2024, typ: "movie", genres: [], dienste: [],
  }] },
  auswahl: [], merkliste: [], toggleMerk() {}, addFilm: async () => "master_1", master: null,
  mustwatchIds: new Set(),
  entdeckenStatus: {},
  schreibeEntdeckenStatus: () => {
    statusWrites++;
    return new Promise((resolve) => { statusResolver = resolve; });
  },
});
await act(async () => { knopf(streamingFixture.container, "Alles").click(); await tick(); });
await act(async () => {
  streamingFixture.container.querySelector('button[title="Als gesehen markieren"]').click();
  await tick();
});
await act(async () => { knopf(streamingFixture.container, "Ja, in die Mediathek").click(); await tick(); });
check(statusWrites === 1 && knopf(streamingFixture.container, "Speichert").disabled,
  "Streaming wartet nach addFilm auf die bestätigte Statuspersistenz");
await act(async () => { statusResolver(false); await tick(); });
check(!!knopf(streamingFixture.container, "Ja, in die Mediathek")
  && !streamingFixture.container.textContent.includes("in deiner Mediathek"),
"fehlgeschlagener Streaming-Statuswrite zeigt keinen Scheinerfolg");
await streamingFixture.cleanup();

/* Exportmarker: Ein verspäteter Konto-A-Read und sogar ein alter A-Callback
   dürfen nach dem Wechsel weder B-Warnungen ausblenden noch in B schreiben. */
let starteMarkerReadA;
let loeseMarkerReadA;
const markerReadA = new Promise((resolve) => { starteMarkerReadA = resolve; });
const markerBlockadeA = new Promise((resolve) => { loeseMarkerReadA = resolve; });
let writesB = 0;
const markerDriverA = {
  name: "konto", owner: "account:A",
  async get(key) {
    starteMarkerReadA();
    await markerBlockadeA;
    return { key, value: JSON.stringify({ version: 2, owner: "account:A", master: 1000, artikel: 1000 }) };
  },
  async set() {}, async delete() {}, async list() { return { keys: [] }; },
};
const markerDriverB = {
  name: "konto", owner: "account:B",
  async get(key) {
    /* Das geräteglobale Legacyfach enthält noch A. B muss es als 0 lesen. */
    return { key, value: JSON.stringify({ version: 2, owner: "account:A", master: 1000, artikel: 1000 }) };
  },
  async set() { writesB++; }, async delete() {}, async list() { return { keys: [] }; },
};
setGebundenerTestTreiber(markerDriverA);
let letzterBackupHook = null;
function BackupHookProbe(props) {
  letzterBackupHook = useBackupExportController(props);
  return h("span", null, letzterBackupHook.ungesichertMaster ? "ungesichert" : "gesichert");
}
const markerContainer = document.createElement("div");
document.body.appendChild(markerContainer);
const markerRoot = createRoot(markerContainer);
await act(async () => {
  markerRoot.render(h(BackupHookProbe, {
    owner: "account:A", masterHerkunft: { typ: "storage", zeit: 1200 },
    artikelListe: [], artikelGespeichertAm: 0,
  }));
  await tick();
});
await markerReadA;
const alterMarkiererA = letzterBackupHook.markiereExport;
await act(async () => {
  setGebundenerTestTreiber(markerDriverB);
  markerRoot.render(h(BackupHookProbe, {
    owner: "account:B", masterHerkunft: { typ: "storage", zeit: 500 },
    artikelListe: [], artikelGespeichertAm: 0,
  }));
  await tick(); await tick();
});
check(letzterBackupHook.ungesichertMaster && markerContainer.textContent === "ungesichert",
  "Konto B ignoriert den höheren Exportmarker von Konto A sofort");
check(alterMarkiererA("master", 1500) === false && writesB === 0,
  "ein alter Konto-A-Markierer schreibt nach dem Kontextwechsel nicht in Konto B");
await act(async () => { loeseMarkerReadA(); await tick(); await tick(); });
check(letzterBackupHook.ungesichertMaster && markerContainer.textContent === "ungesichert",
  "eine verspätete Konto-A-Antwort kann den Exportstand von Konto B nicht setzen");
await act(async () => markerRoot.unmount());
markerContainer.remove();
setGebundenerTestTreiber(null);

console.log(`\nASYNC-PERSISTENCE-UI-TEST BESTANDEN (${checks}/${checks})`);
