import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const WURZEL = process.cwd();
const MODULWURZEL = process.env.KD_TEST_NODE_MODULES || path.join(WURZEL, "node_modules");
const requireAusTestumgebung = createRequire(path.join(MODULWURZEL, "__kd_test_resolver__.cjs"));
const { JSDOM } = requireAusTestumgebung("jsdom");
const cache = path.join(WURZEL, "node_modules/.cache/mediathek-selection-dom-test");
fs.mkdirSync(cache, { recursive: true });
const ausgabe = path.join(cache, "MediathekTab.mjs");
let esbuild;
try { esbuild = requireAusTestumgebung("esbuild"); }
catch { esbuild = requireAusTestumgebung("vite/node_modules/esbuild"); }
await esbuild.build({
  stdin: {
    contents: [
      'export { MediathekTab } from "./src/tabs/MediathekTab.jsx";',
      'export { LEERER_MEDIATHEK_MASTER } from "./src/App.jsx";',
      'export { default as React, act, useState } from "react";',
      'export { createRoot } from "react-dom/client";',
    ].join("\n"),
    resolveDir: WURZEL,
    sourcefile: "mediathek-selection-dom-entry.jsx",
    loader: "jsx",
  },
  outfile: ausgabe, bundle: true, platform: "node", format: "esm",
  jsx: "automatic", target: "es2022",
  nodePaths: [MODULWURZEL],
  logLevel: "silent",
});
esbuild.stop?.();

const dom = new JSDOM("<!doctype html><html><body><main id='app'></main></body></html>", {
  url: "https://kinodreieck.test/",
});
for (const name of [
  "window", "document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement",
  "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent",
  "CustomEvent", "localStorage",
]) {
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? dom.window : dom.window[name], configurable: true, writable: true,
  });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let rafAufrufe = 0;
globalThis.requestAnimationFrame = (fn) => { rafAufrufe++; fn(); return rafAufrufe; };
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;

let clipboardText = "";
let clipboardFehler = false;
let clipboardVerzoegern = false;
let clipboardAuftrag = null;
Object.defineProperty(dom.window.navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: (text) => {
      if (clipboardVerzoegern) {
        return new Promise((resolve, reject) => {
          clipboardAuftrag = { text, resolve, reject };
        });
      }
      if (clipboardFehler) return Promise.reject(new Error("clipboard-denied"));
      clipboardText = text;
      return Promise.resolve();
    },
  },
});

const testModul = await import(pathToFileURL(ausgabe).href + "?v=" + Date.now());
const {
  MediathekTab, LEERER_MEDIATHEK_MASTER, React, act, useState, createRoot,
} = testModul;
const MASTER = [
  { id: "z", typ: "film", titel: "Zulu", jahr: 1999, quelle: "dvd", genre: ["Action"], bewertung: { wie: 1, was: 1, warum: 1 }, begruendung: "Zulu-Details", notiz: "PRIVAT-Z" },
  { id: "a", typ: "film", titel: "Alpha", jahr: 2001, quelle: "dvd", genre: ["Drama"], bewertung: { wie: 3, was: 3, warum: 3 }, begruendung: "Alpha-Details", notiz: "PRIVAT-A" },
  { id: "s", typ: "serie", titel: "Serie Eins", jahr: 2020, quelle: "dvd", bewertung: { wie: 2, was: 2, warum: 2 }, begruendung: "Serien-Details" },
  { typ: "film", titel: "Ohne ID", jahr: 2010, quelle: "dvd", bewertung: { wie: 2, was: 2, warum: 2 } },
];
const ARTIKEL_MIT_ROTLINK = [{
  id: "artikel-offen", titel: "Artikel mit Rotlink", status: "entwurf",
  liste: [{ eingabe: "Rotlink Kandidat", jahr: 2024, typ: "film", ref: null }],
}];
const NACHTRAG_MIT_ENTWURF = [{ titel: "Nachtrag Kandidat", jahr: 2023, quellen: ["dvd"] }];
const E12_ROTLINK_BLEIBT = { eingabe: "Rotlink Kandidat", jahr: 2024, typ: "film", ref: null };
const E12_ARTIKEL_VORHER = [{
  id: "artikel-e12", titel: "Artikel E12", status: "entwurf",
  liste: [{ eingabe: "Zulu", jahr: 1999, typ: "film", ref: "z" }, E12_ROTLINK_BLEIBT],
}];
const E12_ARTIKEL_NACHHER = [{
  ...E12_ARTIKEL_VORHER[0],
  liste: [{ ...E12_ARTIKEL_VORHER[0].liste[0], ref: null }, E12_ROTLINK_BLEIBT],
}];
const E12_NACHTRAG_BLEIBT = { titel: "Nachtrag Kandidat", jahr: 2023, quellen: ["dvd"] };
const E12_NACHTRAG_NEU = { titel: "Neu vor bestehendem Nachtrag", jahr: 1998, quellen: ["dvd"] };
let mutationen = 0;
let updateVerzoegern = false;
let updateAufloeser = null;
let updateAblehner = null;
let addVerzoegern = false;
let addAufloeser = null;
let addAblehner = null;
let batchPreviewModus = "ok";
let batchPreviewAufrufe = [];
let batchAufrufe = [];
let letzterAuthentischerPlan = null;
let letztePreviewIdsRef = null;
let batchVerzoegern = false;
let batchAufloeser = null;
let batchErgebnis = true;
let confirmAufrufe = 0;
dom.window.confirm = () => { confirmAufrufe++; return true; };

function TestHarness({ master, datenKontextKey, artikel = [], nachtragFlach = [],
  normalisiereWieApp = false }) {
  const [expandedId, setExpandedId] = useState(null);
  return React.createElement(MediathekTab, {
    master: normalisiereWieApp ? (master ?? LEERER_MEDIATHEK_MASTER) : master,
    datenKontextKey, expandedId, setExpandedId,
    nachtragFlach, artikel, mustwatch: [],
    updateFilm: async () => {
      mutationen++;
      if (!updateVerzoegern) return true;
      return new Promise((resolve, reject) => { updateAufloeser = resolve; updateAblehner = reject; });
    },
    deleteFilm: () => { mutationen++; },
    onFilmBatchVorschau: (ids) => {
      letztePreviewIdsRef = ids;
      batchPreviewAufrufe.push([...ids]);
      if (batchPreviewModus === "exception") throw new Error("Preview absichtlich fehlgeschlagen");
      if (batchPreviewModus === "abbruch") return Object.freeze({
        ok: false, abgebrochen: true, fehlercode: "STALE",
        zielIds: Object.freeze([]), folgen: Object.freeze({}),
      });
      letzterAuthentischerPlan = Object.freeze({
        ok: true, abgebrochen: false, zielIds: Object.freeze([...ids]),
        folgen: Object.freeze({ masterEintraege: ids.length, artikelRefs: 2, mustwatchRefs: 1 }),
      });
      return letzterAuthentischerPlan;
    },
    onFilmBatchLoeschen: (ids, plan) => {
      mutationen++;
      batchAufrufe.push({ ids, plan });
      if (!batchVerzoegern) return Promise.resolve(batchErgebnis);
      return new Promise((resolve) => { batchAufloeser = resolve; });
    },
    addFilm: async () => {
      mutationen++;
      if (!addVerzoegern) return true;
      return new Promise((resolve, reject) => { addAufloeser = resolve; addAblehner = reject; });
    },
    addMustwatch: () => { mutationen++; }, updateMustwatch: () => { mutationen++; },
    deleteMustwatch: () => { mutationen++; },
  });
}

const root = createRoot(document.getElementById("app"));
const render = async (master = MASTER, datenKontextKey = "guest:ready:", extras = {}) => {
  await act(async () => {
    root.render(React.createElement(TestHarness, { master, datenKontextKey, ...extras }));
    await Promise.resolve();
  });
};
await render();

let bestanden = 0;
const fehler = [];
const check = (name, wert) => {
  let ok = false;
  try { ok = typeof wert === "function" ? !!wert() : !!wert; } catch {}
  if (ok) { bestanden++; console.log("✓ " + name); }
  else { fehler.push(name); console.error("✗ " + name); }
};
const knopf = (text) => [...document.querySelectorAll("button")].find((el) => el.textContent.trim() === text);
const knopfEnthaelt = (text) => [...document.querySelectorAll("button")].find((el) => el.textContent.includes(text));
const dialogKnopf = (text) => [...(document.querySelector('[role="dialog"]')?.querySelectorAll("button") || [])]
  .find((el) => el.textContent.trim() === text);
const karte = (id) => document.querySelector(`[data-film-id="${id}"] .kd-karte`);
const sende = async (ziel, art, optionen = {}) => {
  await act(async () => {
    const Ctor = art === "keydown" ? dom.window.KeyboardEvent
      : art === "click" ? dom.window.MouseEvent : dom.window.Event;
    ziel.dispatchEvent(new Ctor(art, { bubbles: true, cancelable: true, ...optionen }));
    await Promise.resolve();
  });
};
const setzeWert = async (ziel, wert) => {
  const setter = Object.getOwnPropertyDescriptor(ziel.constructor.prototype, "value")?.set;
  setter.call(ziel, wert);
  await sende(ziel, ziel.tagName === "SELECT" ? "change" : "input");
};
const klickeAlle = async (text) => {
  for (let i = 0; i < 8; i++) {
    const ziel = knopf(text);
    if (!ziel) return;
    await sende(ziel, "click");
  }
};

check("Karten öffnen außerhalb des Modus weiterhin Details", karte("a")?.getAttribute("role") === "button");
const appQuelltext = fs.readFileSync(path.join(WURZEL, "src/App.jsx"), "utf8");
const mediathekQuelltext = fs.readFileSync(path.join(WURZEL, "src/tabs/MediathekTab.jsx"), "utf8");
const batchNaht = appQuelltext.slice(
  appQuelltext.indexOf("const planeFilmBatchLoeschung"),
  appQuelltext.indexOf("const uebernehmeQuellenKlaerung"),
);
check("App-Batchnaht nutzt exakt Preview und gebundene Ausführungs-API mit Lade-Gates",
  batchNaht.includes("personalDataTransaktionen.planeFilmLoeschungen(ids)")
  && batchNaht.includes("personalDataTransaktionen.loescheFilme(ids, { plan")
  && (batchNaht.match(/!mustwatchGeladen \|\| !artikelGeladen/g) || []).length === 2
  && !batchNaht.includes("window.confirm") && !batchNaht.includes("loescheFilm("));
check("Künstlicher Nachtrag-Drafterhalt ist synchron an die authentische Löschprojektion gebunden",
  mediathekQuelltext.includes("const nachtraegeZumRendern = draftGrenzeRef.current.erwartet")
  && mediathekQuelltext.includes("&& bewahrterNachtrag && !nachtragFlach.includes(bewahrterNachtrag)"));
await sende(karte("a"), "click");
check("bestehendes Kartenverhalten zeigt den Inhalt", document.body.textContent.includes("Alpha-Details"));

await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
const editEntwurf = document.querySelector('textarea[placeholder^="Begründung"]');
await setzeWert(editEntwurf, "Alpha-Entwurf bleibt erhalten");
const editShell = document.querySelector(".kd-film-editor-shell");
const mutationenVorEditEntwurf = mutationen;
await sende(knopf("Auswählen"), "click");
check("Karten-Edit-Draft bleibt im Auswahlmodus gemountet und verborgen", editEntwurf.isConnected && editShell.isConnected && editShell.hidden);
await sende(knopf("Auswahl beenden"), "click");
check("Karten-Edit-Draft wird nach Auswahlende unverändert sichtbar", () => {
  const aktuell = document.querySelector('textarea[placeholder^="Begründung"]');
  return aktuell === editEntwurf && !editShell.hidden && aktuell.value === "Alpha-Entwurf bleibt erhalten";
});
check("Karten-Edit-Draft verursacht keine Mutation", mutationen === mutationenVorEditEntwurf);
if (!knopf("Abbrechen")) await sende(karte("a"), "click");
if (knopf("Abbrechen")) await sende(knopf("Abbrechen"), "click");
if (document.body.textContent.includes("Alpha-Details")) await sende(karte("a"), "click");

await sende(knopf("+ Eintrag hinzufügen"), "click");
const neuerTitelEntwurf = document.querySelector('input[placeholder="Titel *"]');
const neuesJahrEntwurf = document.querySelector('input[placeholder="Jahr *"]');
await setzeWert(neuerTitelEntwurf, "Ungespeicherter Neu-Entwurf");
await setzeWert(neuesJahrEntwurf, "2025");
const neuFormShell = document.querySelector('[data-tour="eintrag-neu"]');
const mutationenVorNeuEntwurf = mutationen;
await sende(knopf("Auswählen"), "click");
check("Neu-Draft bleibt im Auswahlmodus gemountet und verborgen", neuerTitelEntwurf.isConnected && neuFormShell.isConnected && neuFormShell.hidden);
await sende(knopf("Auswahl beenden"), "click");
check("Neu-Draft wird nach Auswahlende unverändert sichtbar", () => {
  const titel = document.querySelector('input[placeholder="Titel *"]');
  const jahr = document.querySelector('input[placeholder="Jahr *"]');
  return titel === neuerTitelEntwurf && titel.value === "Ungespeicherter Neu-Entwurf" && jahr.value === "2025" && !neuFormShell.hidden;
});
check("Neu-Draft verursacht keine Mutation", mutationen === mutationenVorNeuEntwurf);
if (knopf("Abbrechen")) await sende(knopf("Abbrechen"), "click");

/* Der Master-Controller repräsentiert einen leeren Bestand als `null`. Die
   App-Normalisierung darf bei einem beliebigen Parent-Render deshalb keine
   neue Master-Identität erfinden: offene Add-Drafts müssen dieselbe
   Komponenteninstanz behalten, auch wenn ein fehlgeschlagener Save zugleich
   einen Fehler-Render auslöst. */
check("App-Normalisierung liefert für null dieselbe leere Master-Instanz",
  Object.isFrozen(LEERER_MEDIATHEK_MASTER) && LEERER_MEDIATHEK_MASTER.length === 0);
check("App-Normalisierung reicht einen echten Master unverändert durch", (MASTER ?? LEERER_MEDIATHEK_MASTER) === MASTER);
await render(null, "guest:ready:", { normalisiereWieApp: true, parentRender: 0 });
await sende(knopf("+ Eintrag hinzufügen"), "click");
const leerFilmParentTitel = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(leerFilmParentTitel, "LEERER FILM-DRAFT BEI PARENT-RENDER");
await setzeWert(document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Jahr *"]'), "2026");
const mutationenVorLeerFilmParent = mutationen;
await render(null, "guest:ready:", { normalisiereWieApp: true, parentRender: 1 });
check("Leerer App-Master bewahrt Film-Neudraft bei beliebigem Parent-Render", leerFilmParentTitel.isConnected
  && document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]') === leerFilmParentTitel
  && leerFilmParentTitel.value === "LEERER FILM-DRAFT BEI PARENT-RENDER");
check("Leerer Film-Parent-Render erzeugt keine Mutation", mutationen === mutationenVorLeerFilmParent);
if (knopf("Abbrechen")) await sende(knopf("Abbrechen"), "click");

await sende(knopf("+ Eintrag hinzufügen"), "click");
const leerFilmFehlerTitel = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(leerFilmFehlerTitel, "LEERER FILM-DRAFT NACH SAVE-FEHLER");
await setzeWert(document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Jahr *"]'), "2026");
addVerzoegern = true;
const mutationenVorLeerFilmFehler = mutationen;
await sende(knopf("Hinzufügen"), "click");
await act(async () => {
  addAblehner(new Error("Leerer Film-Save absichtlich fehlgeschlagen"));
  await Promise.resolve();
  await Promise.resolve();
});
await render(null, "guest:ready:", { normalisiereWieApp: true, parentRender: 2 });
addVerzoegern = false;
check("Leerer App-Master bewahrt Film-Neudraft und Fehler nach fehlgeschlagenem Add", mutationen === mutationenVorLeerFilmFehler + 1
  && leerFilmFehlerTitel.isConnected && leerFilmFehlerTitel.value === "LEERER FILM-DRAFT NACH SAVE-FEHLER"
  && document.body.textContent.includes("Leerer Film-Save absichtlich fehlgeschlagen"));
if (knopf("Abbrechen")) await sende(knopf("Abbrechen"), "click");

await sende(knopfEnthaelt("Musik"), "click");
await sende(knopf("+ Musik hinzufügen"), "click");
const leerMedienParentTitel = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(leerMedienParentTitel, "LEERER MEDIEN-DRAFT BEI PARENT-RENDER");
const mutationenVorLeerMedienParent = mutationen;
await render(null, "guest:ready:", { normalisiereWieApp: true, parentRender: 3 });
check("Leerer App-Master bewahrt Medien-Neudraft bei beliebigem Parent-Render", leerMedienParentTitel.isConnected
  && document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]') === leerMedienParentTitel
  && leerMedienParentTitel.value === "LEERER MEDIEN-DRAFT BEI PARENT-RENDER");
check("Leerer Medien-Parent-Render erzeugt keine Mutation", mutationen === mutationenVorLeerMedienParent);
if (knopf("Abbrechen")) await sende(knopf("Abbrechen"), "click");

await sende(knopf("+ Musik hinzufügen"), "click");
const leerMedienFehlerTitel = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(leerMedienFehlerTitel, "LEERER MEDIEN-DRAFT NACH SAVE-FEHLER");
addVerzoegern = true;
const mutationenVorLeerMedienFehler = mutationen;
await sende(knopf("Hinzufügen"), "click");
await act(async () => {
  addAblehner(new Error("Leerer Medien-Save absichtlich fehlgeschlagen"));
  await Promise.resolve();
  await Promise.resolve();
});
await render(null, "guest:ready:", { normalisiereWieApp: true, parentRender: 4 });
addVerzoegern = false;
check("Leerer App-Master bewahrt Medien-Neudraft und Fehler nach fehlgeschlagenem Add", mutationen === mutationenVorLeerMedienFehler + 1
  && leerMedienFehlerTitel.isConnected && leerMedienFehlerTitel.value === "LEERER MEDIEN-DRAFT NACH SAVE-FEHLER"
  && document.body.textContent.includes("Leerer Medien-Save absichtlich fehlgeschlagen"));
if (knopf("Abbrechen")) await sende(knopf("Abbrechen"), "click");

await sende(knopfEnthaelt("Filme"), "click");
await sende(knopf("+ Eintrag hinzufügen"), "click");
const leerKontextTitel = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(leerKontextTitel, "LEERER DRAFT AUS GASTKONTEXT");
const mutationenVorLeerKontext = mutationen;
await render(null, "account:ready:konto-leer", { normalisiereWieApp: true, parentRender: 5 });
check("Datenkontextwechsel resettiert Draft auch bei leerem App-Master", !leerKontextTitel.isConnected
  && !!knopf("+ Eintrag hinzufügen") && mutationen === mutationenVorLeerKontext);

/* Die bestehende echte, nichtleere Master-Ersetzungsgrenze bleibt separat
   belegt; sie darf durch die Leer-Normalisierung nicht abgeschwächt werden. */
await render(MASTER, "account:ready:konto-leer");

/* Harte Account-/Datenkontextgrenze: Auch bei identischer Film-ID dürfen
   weder Karten- noch Neu-Drafts aus dem alten Kontext wieder erscheinen. */
await sende(karte("a"), "click");
await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
const kontextEditEntwurf = document.querySelector('.kd-film-editor-shell textarea[placeholder^="Begründung"]');
await setzeWert(kontextEditEntwurf, "ENTWURF AUS KONTEXT A");
await sende(knopf("+ Eintrag hinzufügen"), "click");
const kontextNeuEntwurf = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(kontextNeuEntwurf, "NEU AUS KONTEXT A");
await sende(knopf("Auswählen"), "click");
const mutationenVorKontextgrenze = mutationen;
await render(MASTER, "account:ready:konto-b");
check("Datenkontextwechsel remountet Karten-Edit-Draft trotz gleicher Film-ID", !kontextEditEntwurf.isConnected);
check("Datenkontextwechsel remountet Neu-Draft", !kontextNeuEntwurf.isConnected);
check("Datenkontextwechsel beendet Auswahl und erzeugt keine Mutation", !!knopf("Auswählen") && mutationen === mutationenVorKontextgrenze);
await klickeAlle("Abbrechen");
if (document.body.textContent.includes("Alpha-Details")) await sende(karte("a"), "click");

/* Echte Master-Ersetzung/Restore ist dieselbe harte Draft-Grenze. */
await sende(karte("a"), "click");
await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
const restoreEditEntwurf = document.querySelector('.kd-film-editor-shell textarea[placeholder^="Begründung"]');
await setzeWert(restoreEditEntwurf, "EDIT VOR RESTORE");
await sende(knopf("+ Eintrag hinzufügen"), "click");
const restoreNeuEntwurf = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(restoreNeuEntwurf, "NEU VOR RESTORE");
await sende(knopf("Auswählen"), "click");
const mutationenVorRestore = mutationen;
const restoreMaster = MASTER.map((eintrag) => ({ ...eintrag }));
await render(restoreMaster, "account:ready:konto-b");
check("Master-Ersetzung remountet Karten-Edit-Draft trotz gleicher Film-ID", !restoreEditEntwurf.isConnected);
check("Master-Ersetzung remountet Neu-Draft", !restoreNeuEntwurf.isConnected);
check("Master-Ersetzung beendet Auswahl und erzeugt keine Mutation", !!knopf("Auswählen") && mutationen === mutationenVorRestore);
await klickeAlle("Abbrechen");
if (document.body.textContent.includes("Alpha-Details")) await sende(karte("a"), "click");
await render(MASTER, "account:ready:konto-b");

/* Sämtliche vor Auswahlstart gemounteten Draft-Arten müssen dieselbe
   Komponenteninstanz durch Suche, Chip, Sortierung und Typ-Rückkehr tragen. */
await render(MASTER, "account:ready:konto-b", {
  artikel: ARTIKEL_MIT_ROTLINK,
  nachtragFlach: NACHTRAG_MIT_ENTWURF,
});
await sende(karte("a"), "click");
await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
const projektionsEdit = document.querySelector('.kd-film-editor-shell textarea[placeholder^="Begründung"]');
await setzeWert(projektionsEdit, "EDIT BLEIBT DURCH PROJEKTIONEN");
await sende(knopf("+ Eintrag hinzufügen"), "click");
const projektionsNeu = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(projektionsNeu, "NEU BLEIBT DURCH PROJEKTIONEN");
await sende(knopf("✎ Anlegen"), "click");
const rotlinkEntwurf = [...document.querySelectorAll('input[placeholder="Titel *"]')]
  .find((el) => el.value === "Rotlink Kandidat");
await setzeWert(rotlinkEntwurf, "ROTLINK BLEIBT DURCH PROJEKTIONEN");
await sende(knopf("✎ Bewerten"), "click");
const nachtragEntwurf = [...document.querySelectorAll('input[placeholder="Titel *"]')]
  .find((el) => el.value === "Nachtrag Kandidat");
await setzeWert(nachtragEntwurf, "NACHTRAG BLEIBT DURCH PROJEKTIONEN");
const mutationenVorProjektionen = mutationen;
await sende(knopf("Auswählen"), "click");
const projektionsSuche = document.querySelector('input[placeholder^="Titel oder Originaltitel"]');
await setzeWert(projektionsSuche, "Zulu");
await setzeWert([...document.querySelectorAll("select")].find((el) => [...el.options].some((o) => o.value === "jahr_alt")), "jahr_alt");
await setzeWert(projektionsSuche, "");
await sende(knopf("▸ Filter"), "click");
await sende(knopf("Action"), "click");
await sende(knopfEnthaelt("Serien"), "click");
await sende(knopf("Auswahl beenden"), "click");
await sende(knopfEnthaelt("Filme"), "click");
await sende(knopf("Action"), "click");
check("Karten-Edit-Draft behält DOM-Identität und Wert über alle Auswahlprojektionen", projektionsEdit.isConnected && projektionsEdit.value === "EDIT BLEIBT DURCH PROJEKTIONEN");
check("Film-Neudraft behält DOM-Identität und Wert über alle Auswahlprojektionen", projektionsNeu.isConnected && projektionsNeu.value === "NEU BLEIBT DURCH PROJEKTIONEN");
check("Rotlink-Draft behält DOM-Identität und Wert über alle Auswahlprojektionen", rotlinkEntwurf.isConnected && rotlinkEntwurf.value === "ROTLINK BLEIBT DURCH PROJEKTIONEN");
check("Nachtrag-Draft behält DOM-Identität und Wert über alle Auswahlprojektionen", nachtragEntwurf.isConnected && nachtragEntwurf.value === "NACHTRAG BLEIBT DURCH PROJEKTIONEN");
check("Draft-Projektionen verursachen keine Mutation", mutationen === mutationenVorProjektionen);
await klickeAlle("Abbrechen");
if (document.body.textContent.includes("Alpha-Details")) await sende(karte("a"), "click");
await render(MASTER, "account:ready:konto-b");

await sende(knopfEnthaelt("Musik"), "click");
await sende(knopf("+ Musik hinzufügen"), "click");
const medienNeuEntwurf = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(medienNeuEntwurf, "MEDIEN-DRAFT BLEIBT");
const mutationenVorMedienDraft = mutationen;
await sende(knopf("Auswählen"), "click");
await sende(knopfEnthaelt("Filme"), "click");
await setzeWert([...document.querySelectorAll("select")].find((el) => [...el.options].some((o) => o.value === "jahr_alt")), "jahr_alt");
await sende(knopf("Auswahl beenden"), "click");
await sende(knopfEnthaelt("Musik"), "click");
check("Medien-Neudraft behält DOM-Identität und Wert über Typ/Sortierung", medienNeuEntwurf.isConnected && medienNeuEntwurf.value === "MEDIEN-DRAFT BLEIBT");
check("Medien-Neudraft über Auswahlprojektionen erzeugt keine Mutation", mutationen === mutationenVorMedienDraft);
await klickeAlle("Abbrechen");
await sende(knopfEnthaelt("Filme"), "click");

const mutationenVorAuswahlmodus = mutationen;
await sende(knopf("Auswählen"), "click");
check("Modus ist ausdrücklich aktiviert", !!knopf("Auswahl beenden"));
check("leere Auswahl meldet null", document.querySelector(".kd-auswahl-zaehler")?.textContent === "0 ausgewählt");
check("Folgeaktionen sind bei leerer Auswahl deaktiviert", knopf("Auswahl leeren")?.disabled && knopf("Titelliste kopieren")?.disabled);
check("ungültige f.id bleibt sichtbar, aber nicht auswählbar", () => {
  const ohneId = document.querySelector('[role="checkbox"][aria-disabled="true"]');
  return ohneId?.getAttribute("aria-label")?.includes("keine eindeutige Eintrags-ID") && ohneId.tabIndex < 0;
});

const alpha = document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]');
await sende(alpha, "keydown", { key: " " });
await sende(document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]'), "click");
check("Tastatur und Zeiger wählen stabile IDs", document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt");
check("Auswahlkarten tragen Checkbox-Zustand", alpha.getAttribute("aria-checked") === "true");
check("Auswahlmarker besitzt ein 44x44-Touchziel", () => {
  const marker = document.querySelector(".kd-auswahl-marke");
  return marker && marker.className.includes("kd-auswahl-marke");
});
check("Löschaktion fehlt vollständig im Auswahlmodus", !document.querySelector(".kd-film-loeschen"));

const sortierung = [...document.querySelectorAll("select")].find((el) => [...el.options].some((o) => o.value === "titel"));
await setzeWert(sortierung, "titel");
const suche = document.querySelector('input[placeholder^="Titel oder Originaltitel"]');

clipboardVerzoegern = true;
clipboardAuftrag = null;
await sende(knopf("Titelliste kopieren"), "click");
const kopierenVorTeilfilter = clipboardAuftrag;
await setzeWert(suche, "Alpha");
await act(async () => {
  kopierenVorTeilfilter.resolve();
  await Promise.resolve();
  await Promise.resolve();
});
check("Verspätetes Clipboard-Resolve setzt keinen Status für veraltete Teilausgabe", !document.querySelector(".kd-kopierstatus") && document.querySelector("#kd-titelliste-text")?.value === "Alpha (2001)");

await setzeWert(suche, "");
clipboardAuftrag = null;
await sende(knopf("Titelliste kopieren"), "click");
const kopierenRejectVorTeilfilter = clipboardAuftrag;
await setzeWert(suche, "Alpha");
await act(async () => {
  kopierenRejectVorTeilfilter.reject(new Error("clipboard-denied-teilfilter"));
  await Promise.resolve();
  await Promise.resolve();
});
check("Verspätetes Clipboard-Reject setzt keinen Status für veraltete Teilausgabe", !document.querySelector(".kd-kopierstatus") && document.querySelector("#kd-titelliste-text")?.value === "Alpha (2001)");

await setzeWert(suche, "");
clipboardAuftrag = null;
await sende(knopf("Titelliste kopieren"), "click");
const kopierenResolveVorLeerfilter = clipboardAuftrag;
await setzeWert(suche, "Nicht vorhanden");
await act(async () => {
  kopierenResolveVorLeerfilter.resolve();
  await Promise.resolve();
  await Promise.resolve();
});
check("Verspätetes Clipboard-Resolve bleibt bei leerer Sichtmenge wirkungslos", !document.querySelector(".kd-kopierstatus") && !document.querySelector("#kd-titelliste-text") && !!document.querySelector(".kd-titelliste-leer"));

await setzeWert(suche, "");
clipboardAuftrag = null;
await sende(knopf("Titelliste kopieren"), "click");
const kopierenVorLeerfilter = clipboardAuftrag;
await setzeWert(suche, "Nicht vorhanden");
await act(async () => {
  kopierenVorLeerfilter.reject(new Error("clipboard-denied-spaet"));
  await Promise.resolve();
  await Promise.resolve();
});
check("Verspätetes Clipboard-Reject behauptet bei leerer Sichtmenge keinen manuellen Text", !document.querySelector(".kd-kopierstatus") && !document.querySelector("#kd-titelliste-text") && !!document.querySelector(".kd-titelliste-leer"));

await setzeWert(suche, "");
clipboardAuftrag = null;
await sende(knopf("Titelliste kopieren"), "click");
const kopierenVorBeenden = clipboardAuftrag;
const rafVorBeenden = rafAufrufe;
await sende(knopf("Auswahl beenden"), "click");
await act(async () => {
  kopierenVorBeenden.reject(new Error("clipboard-denied-nach-ende"));
  await Promise.resolve();
  await Promise.resolve();
});
check("Verspätetes Clipboard-Ergebnis nach Beenden bleibt vollständig wirkungslos", !!knopf("Auswählen") && !document.querySelector(".kd-kopierstatus") && rafAufrufe === rafVorBeenden);

await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]'), "click");
clipboardAuftrag = null;
await sende(knopf("Titelliste kopieren"), "click");
const kopierenResolveVorBeenden = clipboardAuftrag;
await sende(knopf("Auswahl beenden"), "click");
await act(async () => {
  kopierenResolveVorBeenden.resolve();
  await Promise.resolve();
  await Promise.resolve();
});
check("Verspätetes Clipboard-Resolve nach Beenden setzt keinen alten Erfolg", !!knopf("Auswählen") && !document.querySelector(".kd-kopierstatus"));

clipboardVerzoegern = false;
await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]'), "click");
await sende(knopf("Titelliste kopieren"), "click");
const erwarteteListe = "Alpha (2001)\nZulu (1999)";
check("Clipboard-Erfolg kopiert die aktuelle sichtbare Sortierung", clipboardText === erwarteteListe);
check("Plaintext bleibt auch nach Erfolg sichtbar", document.querySelector("#kd-titelliste-text")?.value === erwarteteListe);
check("Titelliste enthält keine privaten Felder", !clipboardText.includes("PRIVAT") && !clipboardText.includes("bewertung"));
check("Erfolg wird ausdrücklich gemeldet", document.querySelector('.kd-kopierstatus[role="status"]')?.textContent.includes("Titelliste kopiert"));

await setzeWert(sortierung, "jahr_alt");
check("Sortieren hält die sichtbare Titelliste offen und aktualisiert ihre Reihenfolge", document.querySelector("#kd-titelliste-text")?.value === "Zulu (1999)\nAlpha (2001)");
check("Sortieren setzt den veralteten Clipboard-Status zurück", !document.querySelector(".kd-kopierstatus"));
await setzeWert(sortierung, "titel");

await setzeWert(suche, "Alpha");
check("Suchfilter behält globale IDs und meldet die sichtbare Schnittmenge", document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt · 1 sichtbar");
check("Teilweise sichtbare Auswahl hält Kopieren aktiv und aktualisiert die Ausgabe", !knopf("Titelliste kopieren").disabled && document.querySelector("#kd-titelliste-text")?.value === "Alpha (2001)");
await setzeWert(suche, "Nicht vorhanden");
check("Vollständig unsichtbare Auswahl bleibt global erhalten", document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt · 0 sichtbar");
check("Ohne sichtbare Schnittmenge ist Kopieren deaktiviert und kein alter Text bleibt stehen", knopf("Titelliste kopieren").disabled && !document.querySelector("#kd-titelliste-text") && document.querySelector(".kd-titelliste-leer"));
await setzeWert(suche, "");
check("Filter zurück stellt beide Auswahlmarken und die Titelliste wieder her", () => {
  const alphaZurueck = document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]');
  const zuluZurueck = document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]');
  return document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt"
    && alphaZurueck?.getAttribute("aria-checked") === "true"
    && zuluZurueck?.getAttribute("aria-checked") === "true"
    && document.querySelector("#kd-titelliste-text")?.value === erwarteteListe;
});
await sende(knopfEnthaelt("Serien"), "click");
check("Typwechsel behält globale IDs und deaktiviert leere sichtbare Ausgabe", document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt · 0 sichtbar" && knopf("Titelliste kopieren").disabled);
await sende(knopfEnthaelt("Filme"), "click");
check("Typ zurück stellt die ausgewählten Filmkarten wieder her", () => document.querySelector(".kd-auswahl-zaehler")?.textContent === "2 ausgewählt"
  && document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]')?.getAttribute("aria-checked") === "true"
  && document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]')?.getAttribute("aria-checked") === "true");
await sende(knopf("Auswahl leeren"), "click");
check("Auswahl leeren entfernt alles und deaktiviert Folgeschritte", document.querySelector(".kd-auswahl-zaehler")?.textContent === "0 ausgewählt" && knopf("Titelliste kopieren").disabled);

clipboardFehler = true;
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await sende(knopf("Titelliste kopieren"), "click");
check("Clipboard-Fehler ist kein stiller Erfolg", document.querySelector('[role="alert"]')?.textContent.includes("manuell kopiert"));
check("Fallback bleibt sichtbar und fokussierbar", document.activeElement === document.querySelector("#kd-titelliste-text"));

await sende(knopfEnthaelt("Im Besitz"), "click");
check("Hauptansichtswechsel beendet und leert die Auswahl", !!knopf("Auswählen") && !document.querySelector('[role="checkbox"]'));
await sende(knopfEnthaelt("Must-Watch"), "click");
check("Must-Watch bleibt ohne Auswahlwerkzeuge", !knopf("Auswählen") && document.body.textContent.includes("Noch nichts vorgemerkt"));
await sende(knopfEnthaelt("Einträge"), "click");

await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await render(MASTER, "account:ready:konto-2");
check("Account-/Sessionkontextwechsel beendet die Auswahl", !!knopf("Auswählen"));

await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await render(MASTER.map((eintrag) => ({ ...eintrag })), "account:ready:konto-2");
check("Master-Ersetzung oder Restore beendet die Auswahl", !!knopf("Auswählen"));

await sende(karte("a"), "click");
check("Karte ist nach Beenden wieder editierbar/öffnend", document.body.textContent.includes("Alpha-Details"));
check("Auswahlmodus verursacht keinerlei Bestandsmutation", mutationen === mutationenVorAuswahlmodus);

await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
await setzeWert(document.querySelector('textarea[placeholder^="Begründung"]'), "Speichern läuft einmalig weiter");
updateVerzoegern = true;
const mutationenVorEditorSave = mutationen;
await sende(knopf("Speichern"), "click");
check("laufender Editor-Save wurde genau einmal gestartet", mutationen === mutationenVorEditorSave + 1 && typeof updateAufloeser === "function" && !!knopf("Speichert …"));
await sende(knopf("Auswählen"), "click");
check("laufender Editor-Save bleibt beim Moduswechsel gemountet", document.querySelector(".kd-film-editor-shell")?.hidden && mutationen === mutationenVorEditorSave + 1);
await act(async () => {
  updateAufloeser(true);
  await Promise.resolve();
  await Promise.resolve();
});
updateVerzoegern = false;
await sende(knopf("Auswahl beenden"), "click");
check("laufender Editor-Save wird weder abgebrochen noch dupliziert", mutationen === mutationenVorEditorSave + 1 && !document.querySelector(".kd-editpanel") && document.body.textContent.includes("Alpha-Details"));

await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
const fehlerEditEntwurf = document.querySelector('.kd-film-editor-shell textarea[placeholder^="Begründung"]');
await setzeWert(fehlerEditEntwurf, "FEHLER-DRAFT BLEIBT AM URSPRUNG");
updateVerzoegern = true;
await sende(knopf("Speichern"), "click");
const mutationenBeimEditorFehler = mutationen;
await sende(knopf("Auswählen"), "click");
await setzeWert(suche, "Zulu");
await sende(knopfEnthaelt("Serien"), "click");
await sende(knopfEnthaelt("Filme"), "click");
await setzeWert(suche, "");
await act(async () => {
  updateAblehner(new Error("Editor-Save absichtlich fehlgeschlagen"));
  await Promise.resolve();
  await Promise.resolve();
});
updateVerzoegern = false;
await sende(knopf("Auswahl beenden"), "click");
check("fehlgeschlagener Editor-Save bleibt genau einmal und mit Draft am Ursprung", mutationen === mutationenBeimEditorFehler
  && fehlerEditEntwurf.isConnected && fehlerEditEntwurf.value === "FEHLER-DRAFT BLEIBT AM URSPRUNG"
  && document.body.textContent.includes("Editor-Save absichtlich fehlgeschlagen"));
await sende(knopf("Abbrechen"), "click");

await sende(karte("a"), "click");
await sende(knopf("+ Eintrag hinzufügen"), "click");
await setzeWert(document.querySelector('input[placeholder="Titel *"]'), "Laufender Neu-Save");
await setzeWert(document.querySelector('input[placeholder="Jahr *"]'), "2025");
addVerzoegern = true;
const mutationenVorNeuSave = mutationen;
await sende(knopf("Hinzufügen"), "click");
check("laufender Neu-Save wurde genau einmal gestartet", mutationen === mutationenVorNeuSave + 1 && typeof addAufloeser === "function" && !!knopf("Speichert …"));
await sende(knopf("Auswählen"), "click");
check("laufender Neu-Save bleibt beim Moduswechsel gemountet", document.querySelector('[data-tour="eintrag-neu"]')?.hidden && mutationen === mutationenVorNeuSave + 1);
await act(async () => {
  addAufloeser(true);
  await Promise.resolve();
  await Promise.resolve();
});
addVerzoegern = false;
await sende(knopf("Auswahl beenden"), "click");
check("laufender Neu-Save wird weder abgebrochen noch dupliziert", mutationen === mutationenVorNeuSave + 1 && !!knopf("+ Eintrag hinzufügen"));

await sende(knopf("+ Eintrag hinzufügen"), "click");
const fehlerNeuEntwurf = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(fehlerNeuEntwurf, "NEU-FEHLER-DRAFT BLEIBT");
await setzeWert(document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Jahr *"]'), "2025");
addVerzoegern = true;
await sende(knopf("Hinzufügen"), "click");
const mutationenBeimNeuFehler = mutationen;
await sende(knopf("Auswählen"), "click");
await sende(knopfEnthaelt("Serien"), "click");
await sende(knopfEnthaelt("Filme"), "click");
await act(async () => {
  addAblehner(new Error("Neu-Save absichtlich fehlgeschlagen"));
  await Promise.resolve();
  await Promise.resolve();
});
addVerzoegern = false;
await sende(knopf("Auswahl beenden"), "click");
check("fehlgeschlagener Neu-Save bleibt genau einmal und mit Draft am Ursprung", mutationen === mutationenBeimNeuFehler
  && fehlerNeuEntwurf.isConnected && fehlerNeuEntwurf.value === "NEU-FEHLER-DRAFT BLEIBT"
  && document.body.textContent.includes("Neu-Save absichtlich fehlgeschlagen"));
await sende(knopf("Abbrechen"), "click");

/* E12: Preview und Transaktion erhalten ausschließlich die beim Löschwunsch
   sichtbare Schnittmenge, einmalig in ihrer aktuellen Sortierreihenfolge. */
await render(MASTER, "account:ready:e12-preview");
const e12Suche = document.querySelector('input[placeholder^="Titel oder Originaltitel"]');
await setzeWert(e12Suche, "");
await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]'), "click");
await setzeWert(e12Suche, "Alpha");
batchPreviewAufrufe = [];
batchAufrufe = [];
batchPreviewModus = "abbruch";
const mutationenVorPreviewfehler = mutationen;
await sende(knopf("Sichtbare Auswahl löschen"), "click");
check("Previewabbruch erhält nur sichtbare Schnittmenge und mutiert nichts",
  batchPreviewAufrufe.length === 1 && batchPreviewAufrufe[0].join(",") === "a"
  && batchAufrufe.length === 0 && mutationen === mutationenVorPreviewfehler);
check("Previewabbruch ist sichtbar und öffnet keinen Dialog",
  document.querySelector('[role="alert"]')?.textContent.includes("nicht sicher geprüft")
  && !document.querySelector('[role="dialog"]'));
batchPreviewModus = "exception";
await sende(knopf("Sichtbare Auswahl löschen"), "click");
check("Previewexception bleibt ebenfalls ohne Mutation", batchPreviewAufrufe.length === 2
  && batchAufrufe.length === 0 && mutationen === mutationenVorPreviewfehler);

batchPreviewModus = "ok";
await sende(knopf("Sichtbare Auswahl löschen"), "click");
const previewDialog = document.querySelector('[role="dialog"]');
check("Batchdialog besitzt Rolle, Modalität, Name und Beschreibung", previewDialog
  && previewDialog.getAttribute("aria-modal") === "true"
  && previewDialog.getAttribute("aria-labelledby") === "kd-film-batch-dialog-titel"
  && previewDialog.getAttribute("aria-describedby") === "kd-film-batch-dialog-beschreibung");
check("Dialog bindet exakten Titel/Jahr-Snapshot und genaue Folgen",
  previewDialog.textContent.includes("Alpha") && previewDialog.textContent.includes("2001")
  && !previewDialog.textContent.includes("Zulu (1999)")
  && previewDialog.textContent.includes("1 Masterlöschung")
  && previewDialog.textContent.includes("2 Blogrefs werden zu Rotlinks")
  && previewDialog.textContent.includes("1 Must-Watch-Masterlink wird gelöst"));
check("Verborgene Auswahl wird ausdrücklich ausgeschlossen",
  previewDialog.textContent.includes("1 weiterer verborgener ausgewählter Eintrag ist")
  && previewDialog.textContent.includes("nicht Ziel und werden nicht gelöscht"));
check("Dialog nennt die erhaltenen Datensätze und E12-Grenze",
  previewDialog.textContent.includes("Artikel und Must-Watch-Einträge bleiben bestehen")
  && previewDialog.textContent.includes("Master, Artikelverweise und Must-Watch-Masterlinks"));
check("Initialfokus liegt auf Abbrechen", document.activeElement === dialogKnopf("Abbrechen"));
await sende(document.activeElement, "keydown", { key: "Tab", shiftKey: true });
check("Fokusfalle führt rückwärts zum letzten Dialogknopf", document.activeElement === knopf("1 endgültig löschen"));
await sende(document.activeElement, "keydown", { key: "Tab" });
check("Fokusfalle führt vorwärts zurück zu Abbrechen", document.activeElement === dialogKnopf("Abbrechen"));
const batchRueckkehr = knopf("Sichtbare Auswahl löschen");
await sende(previewDialog, "keydown", { key: "Escape" });
check("Escape vor Pending bricht ohne Mutation ab und gibt Fokus zurück",
  !document.querySelector('[role="dialog"]') && document.activeElement === batchRueckkehr
  && batchAufrufe.length === 0 && mutationen === mutationenVorPreviewfehler);

/* Erfolgsprojektion: alle Nichtziel-Drafts behalten exakt ihre DOM-Instanz. */
const e12Master = MASTER.map((eintrag) => ({ ...eintrag }));
await render(e12Master, "account:ready:e12-success", {
  artikel: E12_ARTIKEL_VORHER, nachtragFlach: [E12_NACHTRAG_BLEIBT],
});
await setzeWert(document.querySelector('input[placeholder^="Titel oder Originaltitel"]'), "");
await sende(karte("a"), "click");
await sende(knopfEnthaelt("Bewertung bearbeiten"), "click");
const e12EditDraft = document.querySelector('.kd-film-editor-shell textarea[placeholder^="Begründung"]');
await setzeWert(e12EditDraft, "E12 EDIT BLEIBT");
await sende(knopf("+ Eintrag hinzufügen"), "click");
const e12NeuDraft = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(e12NeuDraft, "E12 NEU BLEIBT");
await sende(knopf("✎ Anlegen"), "click");
const e12RotlinkDraft = [...document.querySelectorAll('input[placeholder="Titel *"]')]
  .find((el) => el.value === "Rotlink Kandidat");
await setzeWert(e12RotlinkDraft, "E12 ROTLINK BLEIBT");
await sende(knopf("✎ Bewerten"), "click");
const e12NachtragDraft = [...document.querySelectorAll('input[placeholder="Titel *"]')]
  .find((el) => el.value === "Nachtrag Kandidat");
await setzeWert(e12NachtragDraft, "E12 NACHTRAG BLEIBT");
await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]'), "click");
batchPreviewAufrufe = [];
batchAufrufe = [];
batchVerzoegern = true;
await sende(knopf("Sichtbare Auswahl löschen"), "click");
const erfolgsPlan = letzterAuthentischerPlan;
const erfolgsDialog = document.querySelector('[role="dialog"]');
await sende(knopf("1 endgültig löschen"), "click");
check("Bestätigen startet genau einen authentischen Batch in Zielreihenfolge",
  batchAufrufe.length === 1 && batchAufrufe[0].ids.join(",") === "z"
  && batchAufrufe[0].ids === letztePreviewIdsRef && batchAufrufe[0].plan === erfolgsPlan
  && confirmAufrufe === 0);
check("Pending ist sichtbar und sperrt Doppelklick, Abbrechen, Escape und Hintergrund",
  erfolgsDialog.textContent.includes("Löschung läuft")
  && dialogKnopf("Abbrechen").disabled && dialogKnopf("Löscht …").disabled
  && document.querySelector(".kd-mediathek-dialog-hintergrund")?.hasAttribute("inert"));
await sende(erfolgsDialog, "keydown", { key: "Escape" });
check("Escape während Pending lässt Dialog und Auftrag bestehen", !!document.querySelector('[role="dialog"]') && batchAufrufe.length === 1);
const e12ErfolgsMaster = e12Master.filter((eintrag) => eintrag.id !== "z");
await render(e12ErfolgsMaster, "account:ready:e12-success", {
  artikel: E12_ARTIKEL_NACHHER, nachtragFlach: [E12_NACHTRAG_NEU, E12_NACHTRAG_BLEIBT],
});
await act(async () => {
  batchAufloeser(true);
  await Promise.resolve();
  await Promise.resolve();
});
batchVerzoegern = false;
check("Erfolg entfernt nur Zielkarte und beendet/leert die gesamte Auswahl",
  !document.querySelector('[data-film-id="z"]') && !!knopf("Auswählen") && !document.querySelector('[role="checkbox"]'));
check("Erfolg bewahrt Nichtziel-Edit- und Neu-Draft DOM-identisch und wertgleich",
  e12EditDraft.isConnected && e12EditDraft.value === "E12 EDIT BLEIBT"
  && e12NeuDraft.isConnected && e12NeuDraft.value === "E12 NEU BLEIBT");
check("Erfolg bewahrt Nichtziel-Rotlink- und Nachtrag-Draft DOM-identisch und wertgleich",
  e12RotlinkDraft.isConnected && e12RotlinkDraft.value === "E12 ROTLINK BLEIBT"
  && e12NachtragDraft.isConnected && e12NachtragDraft.value === "E12 NACHTRAG BLEIBT");
check("Erfolgsfokus kehrt sicher zum Auswahlmodus zurück", document.activeElement === knopf("Auswählen"));

/* Delete-all normalisiert den App-Master zu null und reicht dadurch vorübergehend
   einen leeren Nachtrag weiter. Der bereits offene, fachlich nicht betroffene
   Nachtrag-Draft muss trotzdem exakt dieselbe Komponenteninstanz behalten. */
const e12DeleteAllMaster = MASTER.filter((eintrag) => eintrag.id === "z" || eintrag.id === "a")
  .map((eintrag) => ({ ...eintrag }));
await render(e12DeleteAllMaster, "account:ready:e12-delete-all", {
  nachtragFlach: [E12_NACHTRAG_BLEIBT], normalisiereWieApp: true,
});
await sende(knopf("✎ Bewerten"), "click");
const e12DeleteAllNachtragDraft = [...document.querySelectorAll('input[placeholder="Titel *"]')]
  .find((el) => el.value === "Nachtrag Kandidat");
await setzeWert(e12DeleteAllNachtragDraft, "E12 DELETE ALL NACHTRAG BLEIBT");
await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Zulu auswählen"]'), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
batchPreviewAufrufe = [];
batchAufrufe = [];
batchVerzoegern = true;
await sende(knopf("Sichtbare Auswahl löschen"), "click");
const deleteAllPlan = letzterAuthentischerPlan;
await sende(knopf("2 endgültig löschen"), "click");
check("Delete-all startet einen authentischen Batch mit wirklich allen Mastereinträgen",
  batchAufrufe.length === 1 && batchAufrufe[0].ids.join(",") === "a,z"
  && batchAufrufe[0].plan === deleteAllPlan);
await render(null, "account:ready:e12-delete-all", {
  nachtragFlach: [], normalisiereWieApp: true,
});
check("App-normalisierter Delete-all-Übergang hält den offenen Nachtrag-Draft gemountet",
  e12DeleteAllNachtragDraft.isConnected
  && e12DeleteAllNachtragDraft.value === "E12 DELETE ALL NACHTRAG BLEIBT");
await act(async () => {
  batchAufloeser(true);
  await Promise.resolve();
  await Promise.resolve();
});
batchVerzoegern = false;
check("Delete-all-Erfolg bewahrt Nachtrag-Draft DOM-identisch und wertgleich",
  e12DeleteAllNachtragDraft.isConnected
  && e12DeleteAllNachtragDraft.value === "E12 DELETE ALL NACHTRAG BLEIBT"
  && !!knopf("Auswählen"));

/* false/stale verbraucht das DTO einmalig, behält Auswahl und Drafts und darf
   keinen später zufällig passenden Masterwechsel als Erfolg behandeln. */
const e12FehlerMaster = MASTER.map((eintrag) => ({ ...eintrag }));
await render(e12FehlerMaster, "account:ready:e12-error");
await sende(knopf("+ Eintrag hinzufügen"), "click");
const e12FehlerDraft = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
await setzeWert(e12FehlerDraft, "E12 FEHLER BLEIBT");
await sende(knopf("Auswählen"), "click");
await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
batchAufrufe = [];
batchErgebnis = false;
await sende(knopf("Sichtbare Auswahl löschen"), "click");
await sende(knopf("1 endgültig löschen"), "click");
check("false zeigt Stale-Fehler, erhält Auswahl und alle Drafts",
  document.querySelector('[role="alert"]')?.textContent.includes("Datenstand, Konto oder Sitzung")
  && document.querySelector(".kd-auswahl-zaehler")?.textContent === "1 ausgewählt"
  && e12FehlerDraft.isConnected && e12FehlerDraft.value === "E12 FEHLER BLEIBT");
const batchNachFehler = batchAufrufe.length;
await sende(knopf("1 endgültig löschen"), "click");
check("Verbrauchtes DTO kann nicht erneut bestätigt werden", batchAufrufe.length === batchNachFehler
  && knopf("1 endgültig löschen").disabled);
await sende(dialogKnopf("Abbrechen"), "click");
check("Schließen nach Fehler behält Auswahl und gibt Fokus zurück",
  document.querySelector(".kd-auswahl-zaehler")?.textContent === "1 ausgewählt"
  && document.activeElement === knopf("Sichtbare Auswahl löschen"));
await render(e12FehlerMaster.filter((eintrag) => eintrag.id !== "a"), "account:ready:e12-error");
check("Nach false bleibt selbst passende spätere Projektion eine harte Draftgrenze",
  !e12FehlerDraft.isConnected && !!knopf("Auswählen"));
batchErgebnis = true;

const pruefeGenerischenStaleAlert = () => {
  const alert = document.querySelector('.kd-film-batch-vorschaufehler[role="alert"]');
  const text = alert?.textContent || "";
  return !!alert && text.includes("Datenstand") && text.includes("Konto oder Sitzung")
    && text.includes("erneut auswählen") && !text.includes("Alpha") && !text.includes("2001");
};

async function pruefeStaleVorBestaetigung({ name, ersterMaster, ersterKontext,
  zweiterMaster, zweiterKontext }) {
  await render(ersterMaster, ersterKontext, { nachtragFlach: [E12_NACHTRAG_BLEIBT] });
  await sende(knopf("✎ Bewerten"), "click");
  const nachtragDraft = [...document.querySelectorAll('input[placeholder="Titel *"]')]
    .find((el) => el.value === "Nachtrag Kandidat");
  await setzeWert(nachtragDraft, `E12 ALTER NACHTRAG VORHER ${name}`);
  await sende(knopf("+ Eintrag hinzufügen"), "click");
  const draft = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
  await setzeWert(draft, `E12 STALE VORHER ${name}`);
  await sende(knopf("Auswählen"), "click");
  await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
  batchAufrufe = [];
  await sende(knopf("Sichtbare Auswahl löschen"), "click");
  const mutationenVorWechsel = mutationen;
  await render(zweiterMaster, zweiterKontext);
  check(`${name} vor Bestätigung schließt fail-closed und meldet generisch stale`,
    !document.querySelector('[role="dialog"]') && !!knopf("Auswählen")
    && pruefeGenerischenStaleAlert() && batchAufrufe.length === 0
    && mutationen === mutationenVorWechsel);
  check(`${name} vor Bestätigung hält die harte E11-Draftgrenze synchron ohne alten Nachtrag`,
    !draft.isConnected && !nachtragDraft.isConnected
    && !document.body.textContent.includes("Nachtrag Kandidat"));
  check(`${name} vor Bestätigung gibt Fokus zum aktuellen Auswahlknopf zurück`,
    document.activeElement === knopf("Auswählen"));
}

const e12StaleVorMaster = MASTER.map((eintrag) => ({ ...eintrag }));
await pruefeStaleVorBestaetigung({
  name: "Fremder Masterwechsel",
  ersterMaster: e12StaleVorMaster,
  ersterKontext: "account:ready:e12-stale-before-master",
  zweiterMaster: e12StaleVorMaster.map((eintrag) => ({ ...eintrag })),
  zweiterKontext: "account:ready:e12-stale-before-master",
});
await pruefeStaleVorBestaetigung({
  name: "Datenkontextwechsel",
  ersterMaster: MASTER,
  ersterKontext: "account:ready:e12-stale-before-context-a",
  zweiterMaster: MASTER,
  zweiterKontext: "account:ready:e12-stale-before-context-b",
});

async function pruefeStaleWaehrendPending({ name, ersterMaster, ersterKontext,
  zweiterMaster, zweiterKontext }) {
  await render(ersterMaster, ersterKontext, { nachtragFlach: [E12_NACHTRAG_BLEIBT] });
  await sende(knopf("✎ Bewerten"), "click");
  const nachtragDraft = [...document.querySelectorAll('input[placeholder="Titel *"]')]
    .find((el) => el.value === "Nachtrag Kandidat");
  await setzeWert(nachtragDraft, `E12 ALTER NACHTRAG PENDING ${name}`);
  await sende(knopf("+ Eintrag hinzufügen"), "click");
  const draft = document.querySelector('[data-tour="eintrag-neu"] input[placeholder="Titel *"]');
  await setzeWert(draft, `E12 STALE PENDING ${name}`);
  await sende(knopf("Auswählen"), "click");
  await sende(document.querySelector('[role="checkbox"][aria-label="Alpha auswählen"]'), "click");
  batchAufrufe = [];
  batchVerzoegern = true;
  await sende(knopf("Sichtbare Auswahl löschen"), "click");
  await sende(knopf("1 endgültig löschen"), "click");
  const mutationenNachStart = mutationen;
  await render(zweiterMaster, zweiterKontext);
  check(`${name} während Pending schließt fail-closed und meldet generisch stale`,
    !document.querySelector('[role="dialog"]') && !!knopf("Auswählen")
    && pruefeGenerischenStaleAlert() && batchAufrufe.length === 1
    && mutationen === mutationenNachStart);
  check(`${name} während Pending hält die harte E11-Draftgrenze synchron ohne alten Nachtrag`,
    !draft.isConnected && !nachtragDraft.isConnected
    && !document.body.textContent.includes("Nachtrag Kandidat"));
  check(`${name} während Pending gibt Fokus zum aktuellen Auswahlknopf zurück`,
    document.activeElement === knopf("Auswählen"));
  await act(async () => {
    batchAufloeser(true);
    await Promise.resolve();
    await Promise.resolve();
  });
  batchVerzoegern = false;
  check(`${name}: spätes Pending-Ergebnis bleibt wirkungslos und überschreibt den Alert nicht`,
    !document.querySelector('[role="dialog"]') && !!knopf("Auswählen")
    && pruefeGenerischenStaleAlert() && batchAufrufe.length === 1
    && mutationen === mutationenNachStart);
}

const e12StalePendingMaster = MASTER.map((eintrag) => ({ ...eintrag }));
await pruefeStaleWaehrendPending({
  name: "Fremder Masterwechsel",
  ersterMaster: e12StalePendingMaster,
  ersterKontext: "account:ready:e12-stale-pending-master",
  zweiterMaster: e12StalePendingMaster.map((eintrag) => ({ ...eintrag })),
  zweiterKontext: "account:ready:e12-stale-pending-master",
});
await pruefeStaleWaehrendPending({
  name: "Datenkontextwechsel",
  ersterMaster: MASTER,
  ersterKontext: "account:ready:e12-stale-pending-context-a",
  zweiterMaster: MASTER,
  zweiterKontext: "account:ready:e12-stale-pending-context-b",
});

await act(async () => { root.unmount(); });
dom.window.close();
if (fehler.length) {
  console.error(`\n${fehler.length} Mediathek-Auswahl-DOM-Checks fehlgeschlagen.`);
  process.exit(1);
}
console.log(`\n${bestanden}/${bestanden} Mediathek-Auswahl-DOM-Checks bestanden.`);
/* Esbuild/gebündeltes React halten unter Node 24 MessagePorts offen, obwohl
   Root und JSDOM bereits sauber geschlossen sind. Der Test ist ein eigener
   Prozess; nach allen synchron bestätigten Assertions endet er deshalb hier
   explizit, statt die nachfolgenden npm-Gates zu blockieren. */
process.exit(0);
