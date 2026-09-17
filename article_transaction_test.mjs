/* Verhaltenstest der referenztragenden Mehrtopf-Transaktionen. Rein lokal:
   JSDOM + kontrollierter Storage-Treiber, keine Anbieter-/Netzaufrufe. */

import React, { act, useCallback, useMemo, useRef, useState } from "react";
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
import { useBlogPublicationController } from "./src/controllers/useBlogPublicationController.js";

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
  /* Mount-/Ladeeffekte gehören nicht zu den anschließend geprüften
     Mehrtopf-Operationen. */
  writes.length = 0;
  zaehler.clear();
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
  master: [
    { id: "film_a", titel: "A" },
    { id: "film_b", titel: "B" },
    { id: "film_c", titel: "C" },
  ],
  artikel: [{
    ...artikelMitRef("film_a"),
    liste: [
      { eingabe: "A", jahr: null, typ: "film", ref: "film_a" },
      { eingabe: "B", jahr: null, typ: "film", ref: "film_b" },
      { eingabe: "C", jahr: null, typ: "film", ref: "film_c" },
    ],
  }],
  mustwatch: [
    mwEintrag({ id: "mw_a", verknuepfung: { ziel: "master", id: "film_a" } }),
    mwEintrag({ id: "mw_b", verknuepfung: { ziel: "master", id: "film_b" } }),
  ],
});
let ergebnis;
let batchVorschau = fixture.api().actions.planeFilmLoeschungen(["film_a", "film_b"]);
await act(async () => {
  ergebnis = await fixture.api().actions.loescheFilme(["film_a", "film_b"], {
    plan: batchVorschau, meta: null, herkunft: { typ: "storage" },
  });
  await tick();
});
check("Gebundener Mehrzielbatch schreibt Artikel, MW und Master je genau einmal",
  ergebnis === true
  && fixture.writes.map((w) => `${w.art}:${w.key}`).join(",")
    === "set:kd:artikel,set:kd:mustwatch,set:kd:master"
  && fixture.api().master.map((film) => film.id).join(",") === "film_c"
  && fixture.api().art.artikelListe[0].liste.map((zeile) => zeile.ref).join(",") === ",,film_c"
  && fixture.api().mw.mustwatch.every((eintrag) => eintrag.verknuepfung === null));
await fixture.cleanup();

fixture = await mounteMehrtopf({
  master: [{ id: "film_a", titel: "A" }, { id: "film_b", titel: "B" }],
});
batchVorschau = fixture.api().actions.planeFilmLoeschungen(["film_a", "film_b"]);
await act(async () => {
  ergebnis = await fixture.api().actions.loescheFilme(["film_a", "film_b"], { vorschau: batchVorschau });
  await tick();
});
check("Gebundener Mehrzielbatch leert Master mit set statt delete",
  ergebnis === true
  && fixture.writes.length === 1
  && fixture.writes[0].art === "set" && fixture.writes[0].key === "kd:master"
  && JSON.parse(fixture.writes[0].value).filme.length === 0);
await fixture.cleanup();

fixture = await mounteMehrtopf({
  artikel: [artikelMitRef("mw_ziel")],
  mustwatch: [mwEintrag()],
});
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

/* ---------- Blog-v1 Private-first-Controller ---------- */
const v1Capability = {
  contractVersion: "blog-publication-v1", enabled: true, anonymousProjection: true,
  maxReferences: 15, cursorPagination: true, ownerReadback: true, legacyProjectionSafe: true,
  rpcs: ["kd_publish_blog_v1", "kd_update_blog_publication_v1", "kd_withdraw_blog_publication_v1", "kd_read_own_blog_publication_v1", "kd_list_shared_articles_v1"],
};
const publicSnapshot = {
  publicationId: "20000000-0000-4000-8000-000000000001",
  shareToken: "20000000-0000-4000-8000-000000000002",
  publicRevision: 3,
  publishedContentVersion: "10000000-0000-4000-8000-000000000002",
  updatedAt: "2032-05-04T11:00:00.000Z",
};

async function mounteBlogController({
  initialArticles = [], initialLibrary = [{ id: "library-1", titel: "Alien", jahr: 1979, typ: "film", imdb_id: "tt0078748" }],
  serviceOverrides = {}, addLibraryItem, navigateTarget, articlesReady = true,
} = {}) {
  const events = [];
  let api = null;
  const defaultService = {
    capability: async () => ({ ok: true, capability: v1Capability }),
    ownerReadback: async (privateArticleId, operationId = null) => ({
      contractVersion: "blog-publication-v1", privateArticleId,
      currentPublication: null, operation: operationId ? null : null, legacyReloadRequired: false,
    }),
    publishV1: async (request) => {
      events.push("publish");
      return {
        contractVersion: "blog-publication-v1", outcome: "published",
        operationId: request.operationId, contentVersion: request.contentVersion,
        publication: { ...publicSnapshot, publicRevision: 1, publishedContentVersion: request.contentVersion },
        referenceResults: [], decisionRequests: [],
      };
    },
    updateV1: async (request) => {
      events.push("update");
      return {
        contractVersion: "blog-publication-v1", outcome: "updated",
        operationId: request.operationId, contentVersion: request.contentVersion,
        publication: { ...publicSnapshot, publicRevision: request.expectedPublicRevision + 1, publishedContentVersion: request.contentVersion },
        referenceResults: [], decisionRequests: [],
      };
    },
    withdrawV1: async (request) => {
      events.push("withdraw");
      return { contractVersion: "blog-publication-v1", outcome: "withdrawn", operationId: request.operationId, publicationId: publicSnapshot.publicationId };
    },
    listV1: async () => ({ ok: true, page: { contractVersion: "blog-publication-v1", snapshotAt: "2032-05-04T12:00:00Z", items: [], nextCursor: null, complete: true } }),
    ...serviceOverrides,
  };

  function Harness() {
    const [scope, setScope] = useState("account:a");
    const [articles, setArticles] = useState(initialArticles);
    const [library, setLibrary] = useState(initialLibrary);
    const articlesRef = useRef(initialArticles);
    articlesRef.current = articles;
    const writeArticles = useCallback(async (calculate) => {
      const next = typeof calculate === "function" ? calculate(articlesRef.current) : calculate;
      if (!Array.isArray(next)) return false;
      events.push("private");
      articlesRef.current = next;
      setArticles(next);
      return true;
    }, []);
    const controller = useBlogPublicationController({
      accountScope: scope, enabled: true, articles, articlesReady,
      writeArticles, library,
      libraryReady: true, mustwatch: [], mustwatchReady: true,
      selectedServices: ["Netflix"], selectedServicesReady: true,
      service: defaultService,
      addLibraryItem: addLibraryItem || (async () => "library-1"),
      navigateTarget: navigateTarget || ((target) => { events.push(`navigate:${target.kind}`); return true; }),
      clock: () => "2032-05-04T12:00:00.000Z",
    });
    api = { controller, articles, articlesRef, library, setLibrary, setScope };
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Harness)); await tick(); await tick(); });
  events.length = 0;
  return {
    api: () => api, events,
    async cleanup() { await act(async () => root.unmount()); container.remove(); },
  };
}

let blogFixture = await mounteBlogController();
await act(async () => {
  blogFixture.api().controller.actions.onNewArticle();
  await tick();
});
await act(async () => {
  blogFixture.api().controller.actions.onEditorChange({ title: "Alien bleibt", text: "Privater Text", ordered: true });
  await tick();
});
await act(async () => {
  blogFixture.api().controller.actions.onAddReference({
    draftKey: blogFixture.api().controller.editor.draftKey,
    reference: { title: "Alien", year: 1979, mediaType: "film" },
  });
  await tick();
});
const neuerDraftKey = blogFixture.api().controller.editor.draftKey;
let blogSave;
await act(async () => {
  blogSave = await blogFixture.api().controller.actions.onSave({ draftKey: neuerDraftKey, anonymousPublication: false });
  await tick();
});
check("Checkbox aus speichert zuerst und ausschließlich privat",
  blogSave.private.status === "saved" && blogSave.publication.status === "not_requested"
  && blogFixture.events.join(",") === "private"
  && blogFixture.api().articles[0].contentVersion === blogSave.private.contentVersion);
check("Neue private Artikelzeilen erhalten stabile UUIDs",
  /^[0-9a-f-]{36}$/i.test(blogFixture.api().articles[0].liste[0].rowId)
  && /^[0-9a-f-]{36}$/i.test(blogFixture.api().articles[0].contentVersion));
check("Private Artikelzeilen heilen über die bestehende eindeutige Artikel-Abgleichlogik",
  blogFixture.api().articles[0].liste[0].ref === "library-1"
  && blogFixture.api().controller.editor.references[0].primaryTarget.ref === "library-1");

await act(async () => {
  blogFixture.api().controller.actions.onEditArticle({ articleId: blogSave.private.articleId });
  await tick();
});
await act(async () => {
  blogFixture.api().controller.actions.onEditorChange({ text: "Bewusst neue private Fassung" });
  await tick();
});
blogFixture.events.length = 0;
await act(async () => {
  blogSave = await blogFixture.api().controller.actions.onSave({
    draftKey: blogFixture.api().controller.editor.draftKey,
    anonymousPublication: true,
  });
  await tick();
});
check("Publish startet erst nach zwei bestätigten privaten Writes (Fassung und Operationsbeleg)",
  blogSave.private.status === "saved" && blogSave.publication.status === "published"
  && blogFixture.events.join(",") === "private,private,publish,private");
const publishedArticle = blogFixture.api().articles[0];
check("Bestätigtes Publish bindet öffentliche und private Fassung",
  publishedArticle.publikation.publicationId === publicSnapshot.publicationId
  && publishedArticle.publikation.publishedContentVersion === publishedArticle.contentVersion);

await act(async () => {
  blogFixture.api().controller.actions.onEditArticle({ articleId: publishedArticle.id });
  await tick();
});
check("Editor liefert die bestehende publicationId für den Update-Intent",
  blogFixture.api().controller.editor.publicationId === publicSnapshot.publicationId);
await act(async () => {
  blogFixture.api().controller.actions.onEditorChange({ text: "Nur privat weitergeschrieben" });
  await tick();
});
blogFixture.events.length = 0;
await act(async () => {
  blogSave = await blogFixture.api().controller.actions.onSave({
    draftKey: blogFixture.api().controller.editor.draftKey,
    anonymousPublication: false,
  });
  await tick();
});
check("Checkbox aus zieht eine bestehende Veröffentlichung nie zurück",
  blogFixture.events.join(",") === "private"
  && blogFixture.api().articles[0].publikation.publicationId === publicSnapshot.publicationId
  && blogFixture.api().controller.articleCards[0].displayState === "private_changes");

await act(async () => {
  blogFixture.api().controller.actions.onEditArticle({ articleId: publishedArticle.id });
  await tick();
});
await act(async () => {
  blogFixture.api().controller.actions.onEditorChange({ text: "Bewusste Aktualisierung" });
  await tick();
});
blogFixture.events.length = 0;
await act(async () => {
  blogSave = await blogFixture.api().controller.actions.onSave({
    draftKey: blogFixture.api().controller.editor.draftKey,
    anonymousPublication: true,
  });
  await tick();
});
check("Nur eine bewusst angehakte neue Speicherung aktualisiert dieselbe Publikation",
  blogSave.publication.status === "updated" && blogFixture.events.join(",") === "private,private,update,private"
  && blogFixture.api().articles[0].publikation.publicRevision === 2);

let withdrawResult;
blogFixture.events.length = 0;
await act(async () => {
  withdrawResult = await blogFixture.api().controller.actions.onWithdraw({ articleId: publishedArticle.id });
  await tick();
});
check("Rücknahme ist eine eigene bewusste Aktion und bewahrt den privaten Artikel",
  withdrawResult.status === "withdrawn" && blogFixture.events.join(",") === "private,withdraw,private"
  && blogFixture.api().articles.length === 1 && !blogFixture.api().articles[0].publikation.publicationId);
await blogFixture.cleanup();

const unknownArticle = {
  id: "unknown-blog", titel: "Unklar", autor: "Max", text: "Alt", status: "freigegeben",
  contentVersion: "10000000-0000-4000-8000-000000000011", liste: [],
};
blogFixture = await mounteBlogController({
  initialArticles: [unknownArticle],
  serviceOverrides: {
    publishV1: async () => {
      const error = new Error("Verbindung nach Request abgebrochen");
      error.code = "offline";
      error.requestStarted = true;
      error.responseReceived = false;
      throw error;
    },
  },
});
await act(async () => { blogFixture.api().controller.actions.onEditArticle({ articleId: "unknown-blog" }); await tick(); });
await act(async () => { blogFixture.api().controller.actions.onEditorChange({ text: "Neue private Fassung" }); await tick(); });
await act(async () => {
  blogSave = await blogFixture.api().controller.actions.onSave({
    draftKey: blogFixture.api().controller.editor.draftKey,
    anonymousPublication: true,
  });
  await tick();
});
check("Unklarer Transportausgang bleibt vom bestätigten privaten Erfolg getrennt",
  blogSave.private.status === "saved" && blogSave.publication.status === "unknown"
  && blogFixture.api().articles[0].publikation.pending.status === "unknown"
  && blogFixture.api().articles[0].text === "Neue private Fassung"
  && blogFixture.api().controller.articleCards[0].publicationError.operationId === blogSave.publication.operationId);
await blogFixture.cleanup();

const conflictArticle = {
  id: "conflict-blog", titel: "Konflikt", autor: "Max", text: "Privat", status: "freigegeben",
  contentVersion: publicSnapshot.publishedContentVersion, liste: [],
  geteilt: true,
  publikation: { status: "published", ...publicSnapshot },
};
blogFixture = await mounteBlogController({
  initialArticles: [conflictArticle],
  serviceOverrides: {
    ownerReadback: async (privateArticleId) => ({
      contractVersion: "blog-publication-v1", privateArticleId,
      currentPublication: publicSnapshot, operation: null, legacyReloadRequired: false,
    }),
    withdrawV1: async (request) => ({
      contractVersion: "blog-publication-v1", outcome: "conflict", operationId: request.operationId,
      publicationId: publicSnapshot.publicationId,
      expectedPublicRevision: 3, actualPublicRevision: 4, errorCode: "PUBLIC_REVISION_CONFLICT",
    }),
  },
});
let deleteResult;
await act(async () => {
  deleteResult = await blogFixture.api().controller.actions.onDelete({ articleId: "conflict-blog" });
  await tick();
});
check("Withdraw-Konflikt übernimmt keinen Lösch-Erfolg und bewahrt den privaten Artikel",
  deleteResult.publication.status === "conflict" && deleteResult.publication.actualPublicRevision === 4
  && deleteResult.private.status === "kept" && blogFixture.api().articles.length === 1);
await blogFixture.cleanup();

blogFixture = await mounteBlogController({
  serviceOverrides: {
    listV1: async () => ({ ok: true, page: {
      contractVersion: "blog-publication-v1", snapshotAt: "2032-05-04T12:00:00Z",
      items: [{
        publicationId: publicSnapshot.publicationId, shareToken: publicSnapshot.shareToken,
        author: "Ohne Namensangabe", publicRevision: 3,
        contentVersion: publicSnapshot.publishedContentVersion,
        publishedAt: "2032-05-04T10:00:00Z", updatedAt: publicSnapshot.updatedAt,
        article: { id: publicSnapshot.publicationId, title: "Öffentlich", text: "Volltext", ordered: false, references: [] },
      }],
      nextCursor: null, complete: true,
    } }),
  },
});
let loadResult;
await act(async () => {
  loadResult = await blogFixture.api().controller.actions.onLoadPublished({ cursor: null, replace: true });
  await tick();
});
check("Geladene Veröffentlichung setzt kontrollierte Published-Liste und Kartenprojektion",
  loadResult.status === "loaded" && blogFixture.api().controller.view.area === "published"
  && blogFixture.api().controller.publishedPage.items[0].articleId === publicSnapshot.publicationId
  && blogFixture.api().controller.publishedPage.items[0].title === "Öffentlich"
  && Array.isArray(blogFixture.api().controller.publishedPage.items[0].referencePreview));
await act(async () => { blogFixture.api().controller.actions.onBack({ returnToken: null }); await tick(); });
check("Meine Artikel setzt über onBack(null) die kontrollierte private Liste",
  blogFixture.api().controller.view.area === "mine" && blogFixture.api().controller.view.mode === "list");
await blogFixture.cleanup();

const reloadArticle = {
  id: "reload", titel: "Reload", autor: "Max", text: "Text", status: "freigegeben",
  contentVersion: "10000000-0000-4000-8000-000000000009", liste: [],
};
blogFixture = await mounteBlogController({
  initialArticles: [reloadArticle],
  serviceOverrides: {
    ownerReadback: async (privateArticleId) => ({
      contractVersion: "blog-publication-v1", privateArticleId,
      currentPublication: publicSnapshot, operation: null, legacyReloadRequired: false,
    }),
  },
});
check("Owner-Readback stellt Publikations-ID und Revision nach Reload wieder her",
  blogFixture.api().articles[0].publikation.publicationId === publicSnapshot.publicationId
  && blogFixture.api().articles[0].publikation.publicRevision === 3);
await act(async () => { blogFixture.api().setScope("account:b"); await tick(); await tick(); });
check("Kontowechsel verwirft Entwurf, Leser und alte veröffentlichte Seite",
  blogFixture.api().controller.editor === null
  && blogFixture.api().controller.view.mode === "list"
  && blogFixture.api().controller.publishedPage.items.length === 0);
await blogFixture.cleanup();

blogFixture = await mounteBlogController({
  initialArticles: [{
    id: "redlink-blog", titel: "Rotlink", autor: "Max", text: "Text", status: "freigegeben",
    contentVersion: "10000000-0000-4000-8000-000000000010",
    liste: [{ rowId: "row-red", eingabe: "Alien", jahr: 1979, typ: "film", ref: null, rotlink_ok: true }],
  }],
  addLibraryItem: async () => null,
});
let redlinkResult;
await act(async () => {
  blogFixture.api().controller.actions.onReadArticle({ scope: "private", articleId: "redlink-blog", returnToken: "mine:list" });
  await tick();
});
await act(async () => {
  blogFixture.api().controller.actions.onOpenRedlinkForm({ articleId: "redlink-blog", rowId: "row-red" });
  await tick();
  redlinkResult = await blogFixture.api().controller.actions.onConfirmRedlinkForm({
    articleId: "redlink-blog", rowId: "row-red", mediaInput: { titel: "Alien – eigene Fassung", jahr: 1980, typ: "film" },
  });
  await tick();
});
check("Fehler beim Rotlink-Anlegen erhält Formular, Entwurf und Rotlink",
  redlinkResult.status === "failed" && redlinkResult.mediaWriteConfirmed === false
  && blogFixture.api().controller.redlinkForm.status === "failed"
  && blogFixture.api().controller.redlinkForm.initial.titel === "Alien – eigene Fassung"
  && blogFixture.api().controller.redlinkForm.initial.jahr === 1980
  && blogFixture.api().articles[0].liste[0].ref === null);
await act(async () => {
  redlinkResult = blogFixture.api().controller.actions.onCancelRedlinkForm({ articleId: "redlink-blog", rowId: "row-red" });
  await tick();
});
check("Rotlink-Abbruch kehrt ohne Write in den Leser zurück",
  redlinkResult.status === "cancelled" && blogFixture.api().controller.view.mode === "reader"
  && blogFixture.api().articles[0].liste[0].rowId === "row-red");
await blogFixture.cleanup();

blogFixture = await mounteBlogController({
  initialArticles: [{
    id: "redlink-ok", titel: "Rotlink", autor: "Max", text: "Text", status: "freigegeben",
    contentVersion: "10000000-0000-4000-8000-000000000012",
    liste: [{ rowId: "row-ok", eingabe: "Alien", jahr: 1979, typ: "film", ref: null, rotlink_ok: true }],
  }],
});
await act(async () => {
  blogFixture.api().controller.actions.onReadArticle({ scope: "private", articleId: "redlink-ok", returnToken: "mine:list" });
  await tick();
});
await act(async () => {
  blogFixture.api().controller.actions.onOpenRedlinkForm({ articleId: "redlink-ok", rowId: "row-ok" });
  await tick();
});
await act(async () => {
  redlinkResult = await blogFixture.api().controller.actions.onConfirmRedlinkForm({
    articleId: "redlink-ok", rowId: "row-ok", mediaInput: { titel: "Alien", jahr: 1979, typ: "film" },
  });
  await tick();
});
check("Bestätigtes Rotlink-Anlegen schreibt Mediathek und private Referenz vor der Rückkehr",
  redlinkResult.status === "saved" && redlinkResult.mediaWriteConfirmed === true
  && blogFixture.api().articles[0].liste[0].ref === "library-1"
  && blogFixture.api().controller.view.mode === "reader");
blogFixture.events.length = 0;
const navigationResult = blogFixture.api().controller.actions.onNavigateReference({
  referenceId: "row-ok", target: { kind: "library", ref: "library-1", titel: "Alien" },
});
check("Referenznavigation reicht ausschließlich das bestätigte echte Ziel an die App weiter",
  navigationResult === undefined && blogFixture.events.join(",") === "navigate:library");
await blogFixture.cleanup();

/* Offener Editor: flache Projektion, exakte Rotlink-Rückkehr und Entwurfsschutz. */
const editorMediaEvents = [];
blogFixture = await mounteBlogController({
  initialLibrary: [],
  addLibraryItem: async () => { editorMediaEvents.push("media"); return "library-editor-new"; },
});
await act(async () => { blogFixture.api().controller.actions.onNewArticle(); await tick(); });
await act(async () => {
  const { controller } = blogFixture.api();
  controller.actions.onEditorChange({
    title: "Offener Entwurf", text: "Bleibt vollständig", ordered: true, anonymousPublication: true,
  });
  controller.actions.onAddReference({
    draftKey: controller.editor.draftKey,
    reference: { title: "Neuer Film", year: 2030, mediaType: "film" },
  });
  await tick();
});
const openDraftKey = blogFixture.api().controller.editor.draftKey;
const openRowId = blogFixture.api().controller.editor.references[0].rowId;
check("Editor liefert flache Referenzfelder und einen ehrlichen Anzeigezustand",
  blogFixture.api().controller.editor.references[0].title === "Neuer Film"
  && blogFixture.api().controller.editor.references[0].state === "redlink"
  && blogFixture.api().controller.editor.displayState === "private"
  && blogFixture.api().controller.editor.publicationId === null);
await act(async () => {
  blogFixture.api().controller.actions.onOpenRedlinkForm({ articleId: null, rowId: openRowId });
  await tick();
});
await act(async () => {
  redlinkResult = blogFixture.api().controller.actions.onCancelRedlinkForm({ articleId: null, rowId: openRowId });
  await tick();
});
check("Rotlink-Abbruch aus einem neuen Entwurf kehrt exakt in denselben Editor zurück",
  redlinkResult.status === "cancelled"
  && blogFixture.api().controller.view.mode === "editor"
  && blogFixture.api().controller.editor.draftKey === openDraftKey
  && blogFixture.api().controller.editor.text === "Bleibt vollständig"
  && blogFixture.api().controller.editor.anonymousPublication === true);
await act(async () => {
  blogFixture.api().controller.actions.onOpenRedlinkForm({ articleId: null, rowId: openRowId });
  await tick();
});
blogFixture.events.length = 0;
await act(async () => {
  redlinkResult = await blogFixture.api().controller.actions.onConfirmRedlinkForm({
    articleId: null, rowId: openRowId,
    mediaInput: { titel: "Neuer Film", jahr: 2030, typ: "film" },
  });
  await tick();
});
await act(async () => {
  blogFixture.api().setLibrary([{ id: "library-editor-new", titel: "Neuer Film", jahr: 2030, typ: "film" }]);
  await tick();
});
check("Bestätigter Editor-Rotlink schreibt erst Mediathek, dann eigenen Artikel und bewahrt den Entwurf",
  editorMediaEvents.join(",") === "media" && blogFixture.events.join(",") === "private"
  && redlinkResult.mediaWriteConfirmed === true
  && blogFixture.api().articles[0].liste[0].ref === "library-editor-new"
  && blogFixture.api().controller.editor.text === "Bleibt vollständig"
  && blogFixture.api().controller.editor.ordered === true
  && blogFixture.api().controller.editor.anonymousPublication === true
  && blogFixture.api().controller.editor.references[0].state === "available"
  && blogFixture.api().controller.view.mode === "editor");
const protectedDraftKey = blogFixture.api().controller.editor.draftKey;
await act(async () => {
  blogFixture.api().controller.actions.onEditorChange({ text: "Ungespeicherte Ergänzung" });
  await tick();
});
await act(async () => {
  await blogFixture.api().controller.actions.onLoadPublished({ cursor: null, replace: true });
  await tick();
  blogFixture.api().controller.actions.onBack({ returnToken: null });
  await tick();
});
check("Tabwechsel zur Veröffentlichungsliste und zurück bewahrt den offenen Entwurf",
  blogFixture.api().controller.view.area === "mine"
  && blogFixture.api().controller.editor.draftKey === protectedDraftKey
  && blogFixture.api().controller.editor.text === "Ungespeicherte Ergänzung");
await act(async () => {
  blogFixture.api().controller.actions.onEditArticle({ articleId: blogFixture.api().controller.editor.articleId });
  await tick();
});
check("Rückkehr in denselben Editor lädt keinen älteren gespeicherten Inhalt",
  blogFixture.api().controller.view.mode === "editor"
  && blogFixture.api().controller.editor.draftKey === protectedDraftKey
  && blogFixture.api().controller.editor.text === "Ungespeicherte Ergänzung");
const newWhileDirty = blogFixture.api().controller.actions.onNewArticle();
check("Neuer Artikel ersetzt keinen ungespeicherten offenen Entwurf",
  newWhileDirty.errorCode === "unsaved-draft"
  && blogFixture.api().controller.editor.draftKey === protectedDraftKey
  && blogFixture.api().controller.editor.text === "Ungespeicherte Ergänzung");
await blogFixture.cleanup();

/* Entscheidungskandidaten und Entscheidungen aktualisieren den offenen Entwurf in-place. */
blogFixture = await mounteBlogController({
  serviceOverrides: {
    publishV1: async (request) => ({
      contractVersion: "blog-publication-v1", outcome: "decision_required",
      operationId: request.operationId, contentVersion: request.contentVersion,
      referenceResults: [],
      decisionRequests: [{ rowId: request.article.references[0].rowId,
        candidates: [{ workKey: "work:candidate", title: "Kandidat", year: 1979, mediaType: "film" }] }],
      errorCode: "REFERENCE_DECISION_REQUIRED",
    }),
  },
});
await act(async () => { blogFixture.api().controller.actions.onNewArticle(); await tick(); });
await act(async () => {
  const { controller } = blogFixture.api();
  controller.actions.onEditorChange({ title: "Entscheidung", text: "Offener Text", anonymousPublication: true });
  controller.actions.onAddReference({ draftKey: controller.editor.draftKey,
    reference: { title: "Alien", year: 1979, mediaType: "film" } });
  await tick();
});
await act(async () => {
  blogSave = await blogFixture.api().controller.actions.onSave({
    draftKey: blogFixture.api().controller.editor.draftKey, anonymousPublication: true,
  });
  await tick();
});
const decisionArticleId = blogSave.private.articleId;
const decisionRowId = blogFixture.api().controller.editor.references[0].rowId;
check("Decision-required erscheint im offenen Editor ohne Text- oder Checkboxverlust",
  blogSave.publication.status === "decision_required"
  && blogFixture.api().controller.editor.text === "Offener Text"
  && blogFixture.api().controller.editor.anonymousPublication === true
  && blogFixture.api().controller.editor.references[0].decisionCandidates.length === 1);
await act(async () => {
  blogFixture.api().controller.actions.onEditorChange({ text: "Noch nicht gespeicherter Text" });
  await tick();
  await blogFixture.api().controller.actions.onReferenceDecision({
    articleId: decisionArticleId, rowId: decisionRowId,
    decision: { kind: "confirm_work", workKey: "work:candidate" },
  });
  await tick();
});
check("Referenzentscheidung ersetzt keinen neueren offenen Entwurf",
  blogFixture.api().controller.editor.text === "Noch nicht gespeicherter Text"
  && blogFixture.api().controller.editor.anonymousPublication === true
  && blogFixture.api().controller.editor.references[0].resolutionIntent.workKey === "work:candidate");
await blogFixture.cleanup();

/* Saving-Phase und gemeinsame Sperre. */
let releasePublish;
const heldPublish = new Promise((resolve) => { releasePublish = resolve; });
blogFixture = await mounteBlogController({
  serviceOverrides: { publishV1: async () => heldPublish },
});
await act(async () => { blogFixture.api().controller.actions.onNewArticle(); await tick(); });
await act(async () => {
  blogFixture.api().controller.actions.onEditorChange({ title: "Busy", text: "Text" });
  await tick();
});
let heldSave;
await act(async () => {
  heldSave = blogFixture.api().controller.actions.onSave({
    draftKey: blogFixture.api().controller.editor.draftKey, anonymousPublication: true,
  });
  await tick();
});
const busyResult = await blogFixture.api().controller.actions.onSave({
  draftKey: blogFixture.api().controller.editor.draftKey, anonymousPublication: false,
});
check("OnSave zeigt die laufende Phase und blockiert widersprüchliche Mehrfachklicks",
  blogFixture.api().controller.editor.saveStatus === "saving"
  && busyResult.private.errorCode === "busy");
await act(async () => {
  const savedVersion = blogFixture.api().articles[0].contentVersion;
  releasePublish({
    contractVersion: "blog-publication-v1", outcome: "published",
    operationId: blogFixture.api().articles[0].publikation.pending.operationId,
    contentVersion: savedVersion,
    publication: { ...publicSnapshot, publicRevision: 1, publishedContentVersion: savedVersion },
    referenceResults: [], decisionRequests: [],
  });
  await heldSave; await tick();
});
check("Nach bestätigter Antwort endet die Saving-Phase mit aktueller Publikations-ID",
  blogFixture.api().controller.editor.saveStatus === "published"
  && blogFixture.api().controller.editor.publicationId === publicSnapshot.publicationId);
await blogFixture.cleanup();

/* Fremder öffentlicher Rotlink ergänzt ausschließlich die persönliche Mediathek. */
const publicReference = {
  referenceId: "public-red", rank: 1, title: "Öffentlicher Neuzugang", year: 2031, mediaType: "film",
  resolution: { status: "matched", workKey: "work:opaque-public" },
  sources: { status: "checked", checkedAt: "2032-05-04T11:00:00.000Z",
    validUntil: "2032-05-05T12:00:00.000Z", streaming: [], cinema: [] },
};
const publicMediaEvents = [];
blogFixture = await mounteBlogController({
  initialLibrary: [],
  addLibraryItem: async () => { publicMediaEvents.push("media"); return "public-added-library"; },
  serviceOverrides: {
    listV1: async () => ({ ok: true, page: {
      contractVersion: "blog-publication-v1", snapshotAt: "2032-05-04T12:00:00Z",
      items: [{ publicationId: publicSnapshot.publicationId, shareToken: publicSnapshot.shareToken,
        author: "Ohne Namensangabe", publicRevision: 3, contentVersion: publicSnapshot.publishedContentVersion,
        publishedAt: "2032-05-04T10:00:00Z", updatedAt: publicSnapshot.updatedAt,
        article: { id: publicSnapshot.publicationId, title: "Fremd", text: "Lesetext", ordered: true,
          references: [publicReference, ...Array.from({ length: 4 }, (_, index) => ({
            ...publicReference, referenceId: `public-more-${index}`, rank: index + 2,
            title: `Öffentlich ${index}`,
          }))] } }],
      nextCursor: null, complete: true,
    } }),
  },
});
await act(async () => {
  await blogFixture.api().controller.actions.onLoadPublished({ cursor: null, replace: true });
  await tick();
});
check("Öffentliche Karten liefern ordered und die Vorschau oberhalb der sichtbaren Dreiergrenze",
  blogFixture.api().controller.publishedPage.items[0].ordered === true
  && blogFixture.api().controller.publishedPage.items[0].referencePreview.length === 5);
await act(async () => {
  blogFixture.api().controller.actions.onReadArticle({ scope: "published",
    articleId: publicSnapshot.publicationId, returnToken: "published:list" });
  await tick();
});
await act(async () => {
  blogFixture.api().controller.actions.onOpenRedlinkForm({ articleId: publicSnapshot.publicationId, rowId: "public-red" });
  await tick();
});
blogFixture.events.length = 0;
await act(async () => {
  redlinkResult = await blogFixture.api().controller.actions.onConfirmRedlinkForm({
    articleId: publicSnapshot.publicationId, rowId: "public-red",
    mediaInput: { titel: "Öffentlicher Neuzugang", jahr: 2031, typ: "film" },
  });
  await tick();
});
await act(async () => {
  blogFixture.api().setLibrary([{ id: "public-added-library", titel: "Öffentlicher Neuzugang", jahr: 2031, typ: "film" }]);
  await tick();
});
check("Öffentlicher Rotlink verändert keinen fremden Artikel und kehrt in denselben Leser zurück",
  redlinkResult.status === "saved" && publicMediaEvents.join(",") === "media"
  && blogFixture.events.length === 0 && blogFixture.api().articles.length === 0
  && blogFixture.api().controller.view.mode === "reader"
  && blogFixture.api().controller.reader.scope === "published"
  && blogFixture.api().controller.reader.referenceViews[0].primaryTarget.ref === "public-added-library");
await blogFixture.cleanup();

/* Karten liefern Reihenfolge und die ganze kompakte Vorschau bis zum Vertragslimit. */
const fiveRows = Array.from({ length: 5 }, (_, index) => ({
  rowId: `preview-${index}`, eingabe: `Film ${index}`, jahr: 2000 + index, typ: "film", ref: null, rotlink_ok: true,
}));
blogFixture = await mounteBlogController({
  initialArticles: [{ id: "preview-blog", titel: "Vorschau", text: "Text", geordnet: true,
    status: "freigegeben", contentVersion: "10000000-0000-4000-8000-000000000099", liste: fiveRows }],
});
check("Private Karten liefern ordered und mehr als drei kompakte Referenzen",
  blogFixture.api().controller.articleCards[0].ordered === true
  && blogFixture.api().controller.articleCards[0].referencePreview.length === 5);
await blogFixture.cleanup();

const invalidateArticle = {
  id: "invalidate-blog", titel: "Invalidate", text: "Privat", status: "freigegeben", geteilt: true,
  contentVersion: publicSnapshot.publishedContentVersion, liste: [],
  publikation: { status: "published", pending: null, errorCode: null, ...publicSnapshot },
};
blogFixture = await mounteBlogController({
  initialArticles: [invalidateArticle], articlesReady: false,
  serviceOverrides: {
    listV1: async () => ({ ok: true, page: {
      contractVersion: "blog-publication-v1", snapshotAt: "2032-05-04T12:00:00Z",
      items: [{ publicationId: publicSnapshot.publicationId, shareToken: publicSnapshot.shareToken,
        author: "Ohne Namensangabe", publicRevision: 3, contentVersion: publicSnapshot.publishedContentVersion,
        publishedAt: "2032-05-04T10:00:00Z", updatedAt: publicSnapshot.updatedAt,
        article: { id: publicSnapshot.publicationId, title: "Alt", text: "Alt", ordered: false, references: [] } }],
      nextCursor: null, complete: true,
    } }),
  },
});
await act(async () => {
  await blogFixture.api().controller.actions.onLoadPublished({ cursor: null, replace: true });
  await tick();
});
await act(async () => {
  withdrawResult = await blogFixture.api().controller.actions.onWithdraw({ articleId: "invalidate-blog" });
  await tick();
});
check("Bestätigte Rücknahme invalidiert den offenen Veröffentlichungslistenstand",
  withdrawResult.status === "withdrawn"
  && blogFixture.api().controller.publishedPage.status === "idle"
  && blogFixture.api().controller.publishedPage.items.length === 0);
await blogFixture.cleanup();

const retryOperationId = "30000000-0000-4000-8000-000000000009";
const retryArticle = {
  id: "retry-blog", titel: "Retry", text: "Privat", status: "freigegeben",
  contentVersion: "10000000-0000-4000-8000-000000000088", liste: [],
  publikation: { status: "error", action: "publish", operationId: retryOperationId,
    pending: { action: "publish", operationId: retryOperationId,
      contentVersion: "10000000-0000-4000-8000-000000000088",
      request: { contractVersion: "blog-publication-v1", operationId: retryOperationId,
        contentVersion: "10000000-0000-4000-8000-000000000088", privateArticleId: "retry-blog",
        expectedPublicRevision: null, article: { title: "Retry", text: "Privat", ordered: false, references: [] } } },
    errorCode: "unknown", publicationId: null, publicRevision: null, publishedContentVersion: null },
};
blogFixture = await mounteBlogController({
  initialArticles: [retryArticle], articlesReady: false,
  serviceOverrides: {
    ownerReadback: async (privateArticleId, operationId) => ({
      contractVersion: "blog-publication-v1", privateArticleId, currentPublication: null,
      operation: { operationId, status: "not_applied", result: null, errorCode: null },
      legacyReloadRequired: false,
    }),
  },
});
let retryResult;
await act(async () => {
  retryResult = await blogFixture.api().controller.actions.onRetryPublication({
    articleId: "retry-blog", operationId: retryOperationId,
  });
  await tick();
});
check("Gezielte Wiederholung liest zuerst den Ownerstand und sendet nur den bestätigten nicht angewandten Vorgang",
  retryResult.publication.status === "published"
  && blogFixture.events.join(",") === "private,publish,private"
  && blogFixture.api().articles[0].publikation.pending === null);
await blogFixture.cleanup();

/* Verlorene Publish-Antwort: Löschen liest den Ownerstand vor der Rücknahme. */
const lostOperationId = "30000000-0000-4000-8000-000000000001";
const lostArticle = {
  id: "lost-publish", titel: "Verloren", text: "Privat", status: "freigegeben", geteilt: true,
  contentVersion: "10000000-0000-4000-8000-000000000077", liste: [],
  publikation: { status: "error", action: "publish", operationId: lostOperationId,
    pending: { action: "publish", operationId: lostOperationId,
      contentVersion: "10000000-0000-4000-8000-000000000077", request: {} },
    errorCode: "unknown", publicationId: null, publicRevision: null, publishedContentVersion: null },
};
const lostEvents = [];
blogFixture = await mounteBlogController({
  initialArticles: [lostArticle], articlesReady: false,
  serviceOverrides: {
    ownerReadback: async (privateArticleId, operationId) => {
      lostEvents.push(`readback:${operationId}`);
      return { contractVersion: "blog-publication-v1", privateArticleId,
        currentPublication: publicSnapshot, operation: null, legacyReloadRequired: false };
    },
    withdrawV1: async (request) => {
      lostEvents.push("withdraw");
      return { contractVersion: "blog-publication-v1", outcome: "withdrawn",
        operationId: request.operationId, publicationId: publicSnapshot.publicationId };
    },
  },
});
await act(async () => {
  deleteResult = await blogFixture.api().controller.actions.onDelete({ articleId: "lost-publish" });
  await tick();
});
check("Löschen nach verlorener Publish-Antwort bestätigt Ownerstand und Rücknahme vor privater Löschung",
  lostEvents.join(",") === `readback:${lostOperationId},withdraw`
  && deleteResult.publication.status === "withdrawn"
  && deleteResult.private.status === "deleted"
  && blogFixture.api().articles.length === 0);
await blogFixture.cleanup();

/* Verspätete Antworten dürfen nach einem Kontowechsel weder navigieren noch schreiben. */
let releaseList;
const heldList = new Promise((resolve) => { releaseList = resolve; });
blogFixture = await mounteBlogController({ serviceOverrides: { listV1: async () => heldList } });
let lateLoad;
await act(async () => {
  lateLoad = blogFixture.api().controller.actions.onLoadPublished({ cursor: null, replace: true });
  await tick();
});
await act(async () => {
  blogFixture.api().setScope("account:b");
  await tick();
});
await act(async () => {
  releaseList({ ok: true, page: { contractVersion: "blog-publication-v1", snapshotAt: "2032-05-04T12:00:00Z",
    items: [], nextCursor: null, complete: true } });
  loadResult = await lateLoad;
  await tick();
});
check("Verspätete Published-Antwort bleibt nach Kontowechsel ohne Navigation und Seitenwrite",
  loadResult.errorCode === "account-changed"
  && blogFixture.api().controller.view.area === "mine"
  && blogFixture.api().controller.publishedPage.items.length === 0);
await blogFixture.cleanup();

let releaseMedia;
const heldMedia = new Promise((resolve) => { releaseMedia = resolve; });
blogFixture = await mounteBlogController({ initialLibrary: [], addLibraryItem: async () => heldMedia });
await act(async () => { blogFixture.api().controller.actions.onNewArticle(); await tick(); });
await act(async () => {
  const { controller } = blogFixture.api();
  controller.actions.onEditorChange({ title: "Kontowechsel", text: "A" });
  controller.actions.onAddReference({ draftKey: controller.editor.draftKey,
    reference: { title: "Spät", year: 2032, mediaType: "film" } });
  await tick();
});
const lateRowId = blogFixture.api().controller.editor.references[0].rowId;
await act(async () => {
  blogFixture.api().controller.actions.onOpenRedlinkForm({ articleId: null, rowId: lateRowId });
  await tick();
});
let lateRedlink;
await act(async () => {
  lateRedlink = blogFixture.api().controller.actions.onConfirmRedlinkForm({ articleId: null, rowId: lateRowId,
    mediaInput: { titel: "Spät", jahr: 2032, typ: "film" } });
  await tick();
});
blogFixture.events.length = 0;
await act(async () => { blogFixture.api().setScope("account:b"); await tick(); });
await act(async () => { releaseMedia("late-library"); redlinkResult = await lateRedlink; await tick(); });
check("Verspäteter Rotlink-Abschluss schreibt nach Kontowechsel keinen Artikel und navigiert nicht",
  redlinkResult.errorCode === "account-changed"
  && redlinkResult.mediaWriteConfirmed === true
  && blogFixture.events.length === 0
  && blogFixture.api().controller.editor === null
  && blogFixture.api().controller.view.area === "mine");
await blogFixture.cleanup();

let releaseWithdraw;
const heldWithdraw = new Promise((resolve) => { releaseWithdraw = resolve; });
blogFixture = await mounteBlogController({
  initialArticles: [invalidateArticle], articlesReady: false,
  serviceOverrides: { withdrawV1: async () => heldWithdraw },
});
let lateWithdraw;
await act(async () => {
  lateWithdraw = blogFixture.api().controller.actions.onWithdraw({ articleId: "invalidate-blog" });
  await tick();
});
check("Rücknahme persistiert den Vorgang vor dem Remoteaufruf", blogFixture.events.join(",") === "private");
await act(async () => { blogFixture.api().setScope("account:b"); await tick(); });
await act(async () => {
  releaseWithdraw({ contractVersion: "blog-publication-v1", outcome: "withdrawn",
    operationId: "late", publicationId: publicSnapshot.publicationId });
  withdrawResult = await lateWithdraw; await tick();
});
check("Verspätete Withdraw-Antwort schreibt nach Kontowechsel keinen Abschluss",
  withdrawResult.errorCode === "account-changed"
  && blogFixture.events.join(",") === "private"
  && blogFixture.api().controller.view.area === "mine");
await blogFixture.cleanup();

console.log(`article_transaction_test: ${ok} Checks bestanden.`);
