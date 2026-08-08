/* Verhaltenstest der referenztragenden Mehrtopf-Transaktionen. Rein lokal:
   JSDOM + kontrollierter Storage-Treiber, keine Anbieter-/Netzaufrufe. */

import React, { act, useMemo, useRef, useState } from "react";
import { JSDOM } from "jsdom";
import { localDriver, setStorageDriver } from "./src/lib/storage.js";
import { useMustwatchController } from "./src/controllers/useMustwatchController.js";
import {
  parseArtikelSicher,
  useArticleController,
  useMasterPersistenceController,
} from "./src/controllers/useArticleController.js";
import {
  bereiteStartwahlVor,
  erstellePersonalDataTransactionController,
} from "./src/controllers/personalDataTransactionController.js";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

check("Artikelparser akzeptiert Array und Topfform, lehnt beschädigte Artikel aber fail-closed ab",
  parseArtikelSicher('[{"id":"a","titel":"A","text":"","liste":[]}]').liste.length === 1
  && parseArtikelSicher('{"artikel":[],"gespeichertAm":17}').gespeichertAm === 17
  && (() => { try { parseArtikelSicher('{"artikel":[{"id":"a","titel":"A","liste":{}}]}'); return false; } catch { return true; } })());

const startWerte = new Map([["start", "clean"], ["version", "alt"], ["seed", "demo-alt"]]);
const startStorage = {
  getItem: (key) => startWerte.get(key) ?? null,
  setItem: (key, value) => startWerte.set(key, value),
  removeItem: (key) => startWerte.delete(key),
};
let startSchritt = bereiteStartwahlVor({
  storage: startStorage, wahl: "demo",
  startKey: "start", versionKey: "version", seedKey: "seed", version: "neu",
});
check("Vorbereitete Startwahl schreibt vollständig und kann exakt zurückrollen",
  startSchritt.ok && startWerte.get("start") === "demo" && !startWerte.has("seed")
  && startSchritt.rollback() && startWerte.get("start") === "clean"
  && startWerte.get("version") === "alt" && startWerte.get("seed") === "demo-alt");

let startFehlerEinmal = true;
const startFehlerStorage = {
  ...startStorage,
  setItem(key, value) {
    if (key === "version" && startFehlerEinmal) { startFehlerEinmal = false; throw new Error("voll"); }
    startWerte.set(key, value);
  },
};
startSchritt = bereiteStartwahlVor({
  storage: startFehlerStorage, wahl: "demo",
  startKey: "start", versionKey: "version", seedKey: "seed", version: "neu",
});
check("Teilweiser Startwahl-Writefehler stellt den vorherigen Gerätestand wieder her",
  !startSchritt.ok && startWerte.get("start") === "clean"
  && startWerte.get("version") === "alt" && startWerte.get("seed") === "demo-alt");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const topf = (artikel, gespeichertAm = 1) => JSON.stringify({ artikel, gespeichertAm });
const mwTopf = (eintraege) => JSON.stringify({ eintraege, gespeichertAm: 1 });
const masterTopf = (filme) => JSON.stringify({ filme, meta: null, herkunft: { typ: "storage" }, gespeichertAm: 1 });

async function mounteMehrtopf({ master = [], artikel = [], mustwatch = [], onSet, onDelete } = {}) {
  const writes = [];
  const errors = [];
  const werte = new Map([
    ["kd:master", masterTopf(master)],
    ["kd:artikel", topf(artikel)],
    ["kd:mustwatch", mwTopf(mustwatch)],
  ]);
  const zaehler = new Map();
  const treiber = {
    name: "mehrtopf-test",
    async get(key) {
      const value = werte.get(key);
      return value == null ? null : { key, value };
    },
    async set(key, value) {
      const nummer = (zaehler.get(key) || 0) + 1;
      zaehler.set(key, nummer);
      writes.push({ art: "set", key, value, nummer });
      if (onSet) await onSet({ key, value, nummer, writes, werte });
      werte.set(key, value);
      return { key, value };
    },
    async delete(key) {
      const nummer = (zaehler.get("delete:" + key) || 0) + 1;
      zaehler.set("delete:" + key, nummer);
      writes.push({ art: "delete", key, nummer });
      if (onDelete) await onDelete({ key, nummer, writes, werte });
      werte.delete(key);
      return { key, deleted: true };
    },
    async list() { return { keys: [...werte.keys()] }; },
  };
  setStorageDriver(treiber);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let api = null;

  function Harness() {
    const [masterState, setMasterState] = useState(master);
    const masterRef = useRef(masterState);
    masterRef.current = masterState;
    const mw = useMustwatchController({
      master: masterState,
      masterRef,
      setErr: (meldung) => errors.push(meldung),
    });
    const art = useArticleController({ setErr: (meldung) => errors.push(meldung) });
    const masterPersistenz = useMasterPersistenceController({
      setErr: (meldung) => errors.push(meldung),
      masterRef,
      commitMaster: ({ master: next }) => {
        masterRef.current = next.length ? next : null;
        setMasterState(next);
      },
    });
    const actions = useMemo(() => erstellePersonalDataTransactionController({
      transaktionMustwatchVorbereitet: mw.transaktionMustwatchVorbereitet,
      transaktionArtikel: art.transaktionArtikel,
      transaktionMaster: masterPersistenz.transaktionMaster,
      masterRef,
    }), [mw.transaktionMustwatchVorbereitet, art.transaktionArtikel, masterPersistenz.transaktionMaster]);
    api = { mw, art, actions, masterPersistenz, master: masterState, masterRef };
    return null;
  }

  await act(async () => { root.render(React.createElement(Harness)); await tick(); await tick(); });
  return {
    api: () => api,
    writes,
    errors,
    werte,
    treiber,
    async cleanup() {
      await act(async () => { root.unmount(); });
      container.remove();
      setStorageDriver(localDriver);
    },
  };
}

const artikelMitRef = (ref, extra = {}) => ({
  id: "blog", titel: "Blog", autor: "Max", text: "Text", status: "freigegeben",
  liste: [{ eingabe: "Ziel", jahr: null, typ: "film", ref }],
  ...extra,
});
const mwEintrag = (extra = {}) => ({
  id: "mw_ziel", titel: "Ziel", im_besitz: true,
  beschreibung: "Beschreibung bleibt", notiz: "Notiz bleibt", ...extra,
});

let fixture = await mounteMehrtopf({
  artikel: [artikelMitRef("mw_ziel")],
  mustwatch: [mwEintrag()],
});
let ergebnis;
await act(async () => {
  ergebnis = await fixture.api().actions.loescheMustwatch("mw_ziel");
  await tick();
});
check("Direktes MW-Löschen bestätigt zuerst den Rotlink und danach die Liste",
  ergebnis === true
  && fixture.writes.map((w) => w.key).join(",") === "kd:artikel,kd:mustwatch"
  && fixture.api().art.artikelListe[0].liste[0].ref === null
  && fixture.api().mw.mustwatch.length === 0);
await fixture.cleanup();

fixture = await mounteMehrtopf({
  artikel: [artikelMitRef("mw_ziel")],
  mustwatch: [mwEintrag()],
  onSet: async ({ key }) => { if (key === "kd:artikel") throw new Error("Artikelwrite kaputt"); },
});
await act(async () => {
  ergebnis = await fixture.api().actions.loescheMustwatch("mw_ziel");
  await tick();
});
check("Artikel-Writefehler lässt MW und seinen weiterhin gültigen Blogref unangetastet",
  ergebnis === false
  && fixture.writes.length === 1 && fixture.writes[0].key === "kd:artikel"
  && fixture.api().mw.mustwatch[0].beschreibung === "Beschreibung bleibt"
  && fixture.api().art.artikelListe[0].liste[0].ref === "mw_ziel");
await fixture.cleanup();

fixture = await mounteMehrtopf({
  artikel: [artikelMitRef("mw_ziel")],
  mustwatch: [mwEintrag()],
  onSet: async ({ key }) => { if (key === "kd:mustwatch") throw new Error("MW write kaputt"); },
});
await act(async () => {
  ergebnis = await fixture.api().actions.loescheMustwatch("mw_ziel");
  await tick();
});
check("MW-Writefehler rollt den zuvor gesicherten Artikelstand zurück",
  ergebnis === false
  && fixture.writes.map((w) => w.key).join(",") === "kd:artikel,kd:mustwatch,kd:artikel"
  && fixture.api().mw.mustwatch[0].id === "mw_ziel"
  && fixture.api().art.artikelListe[0].liste[0].ref === "mw_ziel");
await fixture.cleanup();

fixture = await mounteMehrtopf({
  master: [{ id: "film_ziel", titel: "Ziel" }],
  artikel: [artikelMitRef("film_ziel")],
  mustwatch: [mwEintrag({ verknuepfung: { ziel: "master", id: "film_ziel" } })],
  onSet: async ({ key }) => { if (key === "kd:master") throw new Error("Master kaputt"); },
});
await act(async () => {
  ergebnis = await fixture.api().actions.loescheFilm("film_ziel", {
    meta: null, herkunft: { typ: "storage" },
  });
  await tick();
});
check("Master-Writefehler kompensiert MW vor Artikel und stellt den Ausgangsstand vollständig her",
  ergebnis === false
  && fixture.writes.map((w) => w.key).join(",") === "kd:artikel,kd:mustwatch,kd:master,kd:mustwatch,kd:artikel"
  && fixture.api().master[0].id === "film_ziel"
  && fixture.api().mw.mustwatch[0].verknuepfung.id === "film_ziel"
  && fixture.api().art.artikelListe[0].liste[0].ref === "film_ziel");
await fixture.cleanup();

/* Master scheitert, MW-Rollback gelingt, Artikel-Rollback scheitert: Der
   sichere Rotlink bleibt vorwärts bestehen. */
fixture = await mounteMehrtopf({
  master: [{ id: "film_ziel", titel: "Ziel" }],
  artikel: [artikelMitRef("film_ziel")],
  mustwatch: [mwEintrag({ verknuepfung: { ziel: "master", id: "film_ziel" } })],
  onSet: async ({ key, nummer }) => {
    if (key === "kd:master") throw new Error("Master kaputt");
    if (key === "kd:artikel" && nummer === 2) throw new Error("Artikelrollback kaputt");
  },
});
await act(async () => {
  ergebnis = await fixture.api().actions.loescheFilm("film_ziel", {
    meta: null, herkunft: { typ: "storage" },
  });
  await tick();
});
check("Fehlgeschlagener Artikel-Rollback bleibt ehrlich beim sicheren Rotlink-Stand",
  ergebnis === false
  && fixture.writes.map((w) => w.key).join(",") === "kd:artikel,kd:mustwatch,kd:master,kd:mustwatch,kd:artikel"
  && fixture.api().master.some((film) => film.id === "film_ziel")
  && fixture.api().mw.mustwatch[0].verknuepfung.id === "film_ziel"
  && fixture.api().art.artikelListe[0].liste[0].ref === null
  && fixture.errors.some((meldung) => /Artikel konnten nicht zurückgesichert/.test(meldung)));
await fixture.cleanup();

/* Master und anschließender MW-Rollback scheitern. Artikel darf dann gerade
   NICHT zurückrollen, weil der persistierte MW-Stand bereits gelöst ist. */
fixture = await mounteMehrtopf({
  master: [{ id: "film_ziel", titel: "Ziel" }],
  artikel: [artikelMitRef("film_ziel")],
  mustwatch: [mwEintrag({ verknuepfung: { ziel: "master", id: "film_ziel" } })],
  onSet: async ({ key, nummer }) => {
    if (key === "kd:master") throw new Error("Master kaputt");
    if (key === "kd:mustwatch" && nummer === 2) throw new Error("MW rollback kaputt");
  },
});
await act(async () => {
  ergebnis = await fixture.api().actions.loescheFilm("film_ziel", {
    meta: null, herkunft: { typ: "storage" },
  });
  await tick();
});
check("Fehlgeschlagener MW-Rollback erzeugt keinen truthy toten Blogref",
  ergebnis === false
  && fixture.writes.map((w) => w.key).join(",") === "kd:artikel,kd:mustwatch,kd:master,kd:mustwatch"
  && fixture.api().master.some((film) => film.id === "film_ziel")
  && fixture.api().mw.mustwatch[0].verknuepfung === null
  && fixture.api().mw.mustwatch[0].notiz === "Notiz bleibt"
  && fixture.api().art.artikelListe[0].liste[0].ref === null
  && fixture.errors.some((meldung) => /Blogrefs bleiben vorsichtshalber als Rotlinks/.test(meldung)));
await fixture.cleanup();

let loeseBlogWrite;
fixture = await mounteMehrtopf({
  master: [{ id: "film_ziel", titel: "Ziel" }],
  artikel: [artikelMitRef("film_ziel")],
  onSet: async ({ key, nummer }) => {
    if (key === "kd:artikel" && nummer === 1) {
      await new Promise((resolve) => { loeseBlogWrite = resolve; });
    }
  },
});
await act(async () => {
  const edit = fixture.api().art.schreibeArtikel((vorher) => vorher.map((artikel) => (
    artikel.id === "blog" ? { ...artikel, text: "Parallel bearbeitet" } : artikel
  )));
  await tick();
  const loeschung = fixture.api().actions.loescheFilm("film_ziel", {
    meta: null, herkunft: { typ: "storage" },
  });
  loeseBlogWrite();
  const resultate = await Promise.all([edit, loeschung]);
  ergebnis = resultate.every(Boolean);
  await tick();
});
check("Parallel gequeue-ter Blogedit bleibt bei der Filmlöschung vollständig erhalten",
  ergebnis
  && fixture.api().art.artikelListe[0].text === "Parallel bearbeitet"
  && fixture.api().art.artikelListe[0].liste[0].ref === null
  && fixture.api().master.length === 0);
await fixture.cleanup();

/* Während der Artikelstufe darf ein unabhängiger Masterauftrag nicht durch
   die ältere Löschprojektion überschrieben werden. Der Revisionskonflikt
   bricht die Löschung ab und rollt ihren Rotlink zurück. */
let loeseTransaktionsArtikel, meldeTransaktionsArtikel;
const transaktionsArtikelGestartet = new Promise((resolve) => { meldeTransaktionsArtikel = resolve; });
let parallelMasterOk = false;
fixture = await mounteMehrtopf({
  master: [{ id: "film_ziel", titel: "Ziel" }, { id: "film_bleibt", titel: "Bleibt", notiz: "alt" }],
  artikel: [artikelMitRef("film_ziel")],
  onSet: async ({ key, nummer }) => {
    if (key === "kd:artikel" && nummer === 1) {
      meldeTransaktionsArtikel();
      await new Promise((resolve) => { loeseTransaktionsArtikel = resolve; });
    }
  },
});
await act(async () => {
  const loeschung = fixture.api().actions.loescheFilm("film_ziel", {
    meta: null, herkunft: { typ: "storage" },
  });
  await transaktionsArtikelGestartet;
  const parallel = fixture.api().masterPersistenz.mutiereMaster((aktuell) => ({
    master: [
      ...aktuell.map((film) => film.id === "film_bleibt" ? { ...film, notiz: "parallel" } : film),
      { id: "film_neu", titel: "Neu" },
    ],
    meta: null, herkunft: { typ: "storage" },
  }));
  parallelMasterOk = await parallel;
  loeseTransaktionsArtikel();
  ergebnis = await loeschung;
  await tick();
});
check("Paralleler Masteredit gewinnt gegen eine auf alter Basis wartende Mehrtopf-Projektion",
  parallelMasterOk && ergebnis === false
  && fixture.api().master.find((film) => film.id === "film_bleibt")?.notiz === "parallel"
  && fixture.api().master.some((film) => film.id === "film_neu")
  && fixture.api().master.some((film) => film.id === "film_ziel")
  && fixture.api().art.artikelListe[0].liste[0].ref === "film_ziel"
  && fixture.errors.some((meldung) => /parallel geändert/.test(meldung)));
await fixture.cleanup();

/* Ist der Transaktionsauftrag bereits zuerst in der Masterqueue, berechnet ein
   danach eingereihter normaler Edit seine Projektion auf dem bestätigten
   Löschstand und darf das Ziel nicht aus einem alten UI-Snapshot zurückholen. */
let loeseMasterWrite, meldeMasterWrite;
const masterWriteGestartet = new Promise((resolve) => { meldeMasterWrite = resolve; });
fixture = await mounteMehrtopf({
  master: [{ id: "film_ziel", titel: "Ziel" }, { id: "film_bleibt", titel: "Bleibt", notiz: "alt" }],
  artikel: [artikelMitRef("film_ziel")],
  onSet: async ({ key, nummer }) => {
    if (key === "kd:master" && nummer === 1) {
      meldeMasterWrite();
      await new Promise((resolve) => { loeseMasterWrite = resolve; });
    }
  },
});
let spaeterMasterOk = false;
await act(async () => {
  const loeschung = fixture.api().actions.loescheFilm("film_ziel", {
    meta: null, herkunft: { typ: "storage" },
  });
  await masterWriteGestartet;
  const spaeter = fixture.api().masterPersistenz.mutiereMaster((aktuell) => ({
    master: [
      ...aktuell.map((film) => film.id === "film_bleibt" ? { ...film, notiz: "nachher" } : film),
      { id: "film_neu", titel: "Neu" },
    ],
    meta: null, herkunft: { typ: "storage" },
  }));
  loeseMasterWrite();
  ergebnis = await loeschung;
  spaeterMasterOk = await spaeter;
  await tick();
});
check("Nachgereihter Masteredit baut auf der Löschung auf und lässt das Ziel gelöscht",
  ergebnis && spaeterMasterOk
  && !fixture.api().master.some((film) => film.id === "film_ziel")
  && fixture.api().master.find((film) => film.id === "film_bleibt")?.notiz === "nachher"
  && fixture.api().master.some((film) => film.id === "film_neu")
  && fixture.api().art.artikelListe[0].liste[0].ref === null);
await fixture.cleanup();

fixture = await mounteMehrtopf({
  master: [{ id: "alt", titel: "Ziel" }],
  artikel: [artikelMitRef("alt")],
  mustwatch: [mwEintrag({ titel: "Anderes Ziel", verknuepfung: { ziel: "master", id: "alt" } })],
});
await act(async () => {
  ergebnis = await fixture.api().actions.ersetzeMaster(
    [{ id: "neu", titel: "Ziel" }],
    { meta: { version: 2 }, herkunft: { typ: "manuell" } },
  );
  await tick();
});
check("Vollimport löst alte MW-IDs, heilt Artikel gegen den neuen Master und bewahrt MW-Felder",
  ergebnis
  && fixture.api().master[0].id === "neu"
  && fixture.api().mw.mustwatch[0].verknuepfung === null
  && fixture.api().mw.mustwatch[0].beschreibung === "Beschreibung bleibt"
  && fixture.api().art.artikelListe[0].liste[0].ref === "neu");

await act(async () => {
  ergebnis = await fixture.api().actions.ersetzeMaster([], { loeschen: true });
  await tick();
});
check("Startmodus-Leerung löscht Master bestätigt und lässt Artikel/MW sichtbar reparierbar",
  ergebnis
  && fixture.api().master.length === 0
  && fixture.api().mw.mustwatch.length === 1
  && fixture.api().mw.mustwatch[0].beschreibung === "Beschreibung bleibt"
  && fixture.api().art.artikelListe[0].liste[0].ref === null
  && !fixture.werte.has("kd:master"));
await fixture.cleanup();

/* Kontextwechsel während des ersten Artikelwrites: Der gebundene A-Treiber
   darf noch seinen begonnenen, sicheren Rotlinkwrite abschließen; kein
   nachfolgender MW-/Masterwrite darf in B landen, sichtbar ist nur B. */
let loeseAArtikel, meldeAArtikel;
const aArtikelGestartet = new Promise((resolve) => { meldeAArtikel = resolve; });
fixture = await mounteMehrtopf({
  master: [{ id: "film_a", titel: "Ziel" }],
  artikel: [artikelMitRef("film_a")],
  mustwatch: [mwEintrag({ verknuepfung: { ziel: "master", id: "film_a" } })],
  onSet: async ({ key }) => {
    if (key === "kd:artikel") {
      meldeAArtikel();
      await new Promise((resolve) => { loeseAArtikel = resolve; });
    }
  },
});
const bWrites = [];
const treiberB = {
  name: "konto-b-mehrtopf",
  async get(key) {
    if (key === "kd:artikel") return { value: topf([artikelMitRef(null, { id: "blog_b", titel: "B", text: "Nur B" })]) };
    if (key === "kd:mustwatch") return { value: mwTopf([mwEintrag({ id: "mw_b", titel: "B" })]) };
    if (key === "kd:master") return { value: masterTopf([{ id: "film_b", titel: "B" }]) };
    return null;
  },
  async set(key, value) { bWrites.push({ key, value }); return { key, value }; },
  async delete(key) { bWrites.push({ key, deleted: true }); return { key, deleted: true }; },
  async list() { return { keys: [] }; },
};
await act(async () => {
  const lauf = fixture.api().actions.loescheFilm("film_a", {
    meta: null, herkunft: { typ: "storage" },
  });
  await aArtikelGestartet;
  setStorageDriver(treiberB);
  await tick();
  loeseAArtikel();
  ergebnis = await lauf;
  await tick(); await tick();
});
check("Kontextwechsel stoppt die Mehrtopf-Kette nach dem gebundenen A-Write fail-closed",
  ergebnis === false
  && fixture.writes.length === 1 && fixture.writes[0].key === "kd:artikel"
  && bWrites.length === 0
  && fixture.api().art.artikelListe[0].id === "blog_b"
  && fixture.api().mw.mustwatch[0].id === "mw_b");
await fixture.cleanup();

console.log(`article_transaction_test: ${ok} Checks bestanden.`);
