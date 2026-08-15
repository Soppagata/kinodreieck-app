/* Controller-Schnitt- und Bibliotheksprojektionstest. Rein lokal. */

import fs from "node:fs";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import {
  baueRefUniversum,
  baueKinoMatches,
  filtereAktiveKinoPins,
  gueltigerArtikel,
  planeFilmLoeschung,
  planeMasterErsetzung,
  planeMustwatchLoeschung,
  planeMustwatchSprung,
} from "./src/lib/libraryProjection.js";
import {
  zeitpunkt,
  IMPORT_INFO,
  streamingPayloadMitMetadaten,
} from "./src/lib/catalogProjection.js";
import { gruppiereDienstBadges } from "./src/lib/dienste.js";
import { appHilfeAntwort } from "./src/lib/appHilfe.js";
import { localDriver, setStorageDriver } from "./src/lib/storage.js";
import {
  erstelleMustwatchSchreibkette,
  parseMustwatchSicher,
  useMustwatchController,
} from "./src/controllers/useMustwatchController.js";
import * as R from "./src/lib/localEventRadar.js";
import { projectEntdeckenRadarPilot } from "./src/lib/radarPilotContracts.js";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const referenzen = baueRefUniversum(
  [{ id: "master", titel: "Master" }],
  [{ id: "mw_1", titel: "Später" }],
);
check("Bibliothekscontroller vereinigt Master und Must-Watch ohne Fremdfelder",
  referenzen.length === 2
  && JSON.stringify(referenzen[1]) === JSON.stringify({
    id: "mw_1", titel: "Später", jahr: null, typ: "film",
  }));

const master = [
  { id: "id-titel", titel: "Gleicher Titel", jahr: 2020, film_at_id: 11, quelle: "prime" },
  { id: "id-exakt", titel: "Anderer Titel", jahr: 2020, film_at_id: 22, quelle: "dvd" },
];
const matches = baueKinoMatches({
  filme: [
    { t: "Gleicher Titel", j: 2020, film_at_id: 22 },
    { t: "Ohne Treffer", j: 2024 },
  ],
}, master);
check("film_at-ID gewinnt im Bibliothekscontroller vor dem Titelmatch",
  matches.matched.length === 1 && matches.matched[0].film.id === "id-exakt");
check("Nicht gematchtes Kinoprogramm bleibt im Rest",
  matches.rest.length === 1 && matches.rest[0].t === "Ohne Treffer");

const pins = [{ t: "Gleicher Titel", z: "Mi 5.8. 20:15" }, { t: "Abgelaufen", z: "Mi 5.8. 22:15" }];
check("Kinopins laufen erst an einem autoritativen Programmstand ab",
  filtereAktiveKinoPins(pins, null).length === 2
  && filtereAktiveKinoPins(pins, { filme: [{ t: "Gleicher Titel", z: ["Mi 5.8. 20:15"] }] }).length === 1);

check("Artikelprüfung akzeptiert die echte Minimalform",
  gueltigerArtikel({ id: "a", titel: "A", text: "", liste: [] }));
check("Artikelprüfung weist die crashende Listenform ab",
  !gueltigerArtikel({ id: "a", titel: "A", text: "", liste: {} }));

const loeschPlan = planeFilmLoeschung(
  [{ id: "weg", titel: "Weg" }, { id: "bleibt", titel: "Bleibt" }],
  [{ id: "artikel", liste: [{ eingabe: "Weg", ref: "weg" }, { eingabe: "Bleibt", ref: "bleibt" }] }],
  [{ id: "mw_weg", verknuepfung: { ziel: "master", id: "weg" } }, { id: "mw_stream", verknuepfung: { ziel: "streaming", id: 7 } }],
  "weg",
);
check("Filmlöschung entfernt nur den gewählten Master-Eintrag",
  loeschPlan.master.length === 1 && loeschPlan.master[0].id === "bleibt");
check("Filmlöschung löst Blog- und Must-Watch-Verweise ohne die Einträge zu löschen",
  loeschPlan.artikel[0].liste[0].ref === null
  && loeschPlan.artikel[0].liste[1].ref === "bleibt"
  && loeschPlan.mustwatch[0].verknuepfung === null
  && loeschPlan.mustwatch[1].verknuepfung.ziel === "streaming"
  && loeschPlan.folgen.artikelRefs === 1 && loeschPlan.folgen.mustwatchRefs === 1);

const mwLoeschPlan = planeMustwatchLoeschung(
  [{ id: "artikel", liste: [{ eingabe: "Später", ref: "mw_1" }] }],
  [{ id: "mw_1", titel: "Später", im_besitz: true, beschreibung: "bleibt bis zur Löschung" }],
  "mw_1",
);
check("Must-Watch-Löschung macht Blogrefs zu Rotlinks statt truthy Leichen",
  mwLoeschPlan.mustwatch.length === 0
  && mwLoeschPlan.artikel[0].liste[0].ref === null
  && mwLoeschPlan.folgen.artikelRefs === 1);

const ersetzPlan = planeMasterErsetzung(
  [{ id: "neu", titel: "Neuer Film" }],
  [{ id: "artikel", liste: [{ eingabe: "Alter Film", ref: "alt" }, { eingabe: "Wunsch", ref: "mw_bleibt" }] }],
  [{ id: "mw_bleibt", titel: "Wunsch", beschreibung: "privat", verknuepfung: { ziel: "master", id: "alt" } }],
);
check("Master-Ersatz löst tote Masterrefs und bewahrt gültige MW-Refs samt persönlichen Feldern",
  ersetzPlan.artikel[0].liste[0].ref === null
  && ersetzPlan.artikel[0].liste[1].ref === "mw_bleibt"
  && ersetzPlan.mustwatch[0].verknuepfung === null
  && ersetzPlan.mustwatch[0].beschreibung === "privat");

const masterSprung = planeMustwatchSprung(
  { ziel: "master", id: "film_1" }, { titel: "Mastertitel" }, [],
);
const kinoFilmSprung = planeMustwatchSprung(
  { ziel: "programm", id: "77" }, { titel: "Wunschtitel" },
  [{ id: "film_77", titel: "Katalogtitel", film_at_id: 77 }],
);
const kinoProgrammSprung = planeMustwatchSprung(
  { ziel: "programm", id: 88 }, { titel: "Nur Programm" }, [],
);
const streamingSprung = planeMustwatchSprung(
  { ziel: "streaming", id: 99 }, { titel: "Streamtitel" }, [],
);
check("Must-Watch-Sprungplan fokussiert Master, gematchtes Kino, reines Programm und Streaming eindeutig",
  JSON.stringify(masterSprung) === JSON.stringify({ bereich: "mediathek", fokus: "film_1" })
  && JSON.stringify(kinoFilmSprung) === JSON.stringify({
    bereich: "kino", zeigeAlles: true,
    fokus: { art: "film", ref: "film_77", titel: "Wunschtitel" },
  })
  && JSON.stringify(kinoProgrammSprung) === JSON.stringify({
    bereich: "kino", zeigeAlles: true,
    fokus: { art: "programm", ref: 88, titel: "Nur Programm" },
  })
  && JSON.stringify(streamingSprung) === JSON.stringify({
    bereich: "streaming",
    fokus: { art: "entdecken", ref: 99, titel: "Streamtitel" },
  })
  && planeMustwatchSprung({ ziel: "fremd", id: 1 }, null, []) === null);

const dienstGruppen = gruppiereDienstBadges([
  "Prime Video", "MUBI (Via Amazon Prime)", "MUBI (Via Prime)", "Netflix",
], { kompakt: true });
check("Amazon-Prime-Channels werden kompakt zu einem gemeinsamen Tag",
  JSON.stringify(dienstGruppen) === JSON.stringify([
    { label: "Prime Video", rohnamen: ["Prime Video"] },
    { label: "Amazon Channel", rohnamen: ["MUBI (Via Amazon Prime)", "MUBI (Via Prime)"] },
    { label: "Netflix", rohnamen: ["Netflix"] },
  ]));
check("App-Hilfe beantwortet Settings-Fragen ohne einen KI-Aufruf",
  appHilfeAntwort("Wo finde ich die Schriftgröße?")?.text.includes("Settings")
  && appHilfeAntwort("Wo kann ich einen Eintrag löschen?")?.ziel === "mediathek"
  && appHilfeAntwort("Wo kann ich einen neuen Eintrag erstellen?")?.titel === "Neuen Eintrag erstellen"
  && appHilfeAntwort("Zeig mir Kino") === null);

let loeseErsten;
const starts = [], fehler = [];
const schreibeMustwatch = erstelleMustwatchSchreibkette(async (payload) => {
  starts.push(payload);
  if (payload === "eins") await new Promise((resolve) => { loeseErsten = resolve; });
  if (payload === "zwei") throw new Error("Testfehler");
}, (e) => fehler.push(e.message));
const erster = schreibeMustwatch("eins");
const zweiter = schreibeMustwatch("zwei");
await Promise.resolve();
check("Must-Watch-Schreibkette startet Aufträge strikt seriell", starts.join(",") === "eins");
loeseErsten();
check("Must-Watch-Schreibkette meldet Fehler und bleibt danach verwendbar",
  await erster === true && await zweiter === false && fehler[0] === "Testfehler"
  && await schreibeMustwatch("drei") === true && starts.join(",") === "eins,zwei,drei");
check("Must-Watch-Leser akzeptiert beide Bestandsformate, aber keinen beschädigten Topf",
  parseMustwatchSicher('[{"id":"mw_1"}]')[0].id === "mw_1"
  && parseMustwatchSicher('{"eintraege":[]}').length === 0
  && (() => { try { parseMustwatchSicher("{}"); return false; } catch { return true; } })()
  && (() => { try { parseMustwatchSicher(""); return false; } catch { return true; } })());

/* Echte Hook-Proben: Die folgenden Fälle rendern den Controller mit React und
   einem kontrollierten Storage-Treiber. Damit prüfen sie nicht nur Quelltext,
   sondern die Reihenfolge der asynchronen State- und Persistenzübergänge. */
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mounteMustwatch({ master = [], get, set } = {}) {
  const writes = [], errors = [];
  const treiber = {
    name: "mustwatch-test",
    get: get || (async () => null),
    set: async (key, value) => {
      writes.push({ key, value });
      if (set) return set(key, value, writes.length);
      return { key, value };
    },
    async delete(key) { return { key, deleted: true }; },
    async list() { return { keys: [] }; },
  };
  setStorageDriver(treiber);
  const masterRef = { current: master };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let api = null;
  function Harness() {
    api = useMustwatchController({ master, masterRef, setErr: (meldung) => errors.push(meldung) });
    return null;
  }
  await act(async () => { root.render(React.createElement(Harness)); await tick(); });
  return {
    api: () => api,
    writes,
    errors,
    masterRef,
    async cleanup() {
      await act(async () => { root.unmount(); });
      container.remove();
      setStorageDriver(localDriver);
    },
  };
}

let fixture = await mounteMustwatch();
await act(async () => {
  const add = fixture.api().addMustwatch({ titel: "Neu" });
  const del = fixture.api().deleteMustwatch("mw_neu");
  check("Must-Watch Add→Delete wird gegen den jeweils aktuellen Queue-Stand berechnet",
    await add === true && await del === true);
  await tick();
});
check("Must-Watch Add→Delete hinterlässt weder Eintrag noch verlorene Schreibreihenfolge",
  fixture.api().mustwatch.length === 0
  && JSON.parse(fixture.writes[0].value).eintraege[0].id === "mw_neu"
  && JSON.parse(fixture.writes[1].value).eintraege.length === 0);
await fixture.cleanup();

fixture = await mounteMustwatch({
  get: async () => ({ value: JSON.stringify({ eintraege: [{ id: "mw_toggle", titel: "Toggle", im_besitz: false }] }) }),
});
await act(async () => {
  const toggle = (aktuell) => ({ im_besitz: !aktuell.im_besitz });
  await Promise.all([
    fixture.api().updateMustwatch("mw_toggle", toggle),
    fixture.api().updateMustwatch("mw_toggle", toggle),
  ]);
  await tick();
});
check("Zwei schnelle funktionale Besitz-Toggles ergeben false→true→false",
  fixture.api().mustwatch[0].im_besitz === false
  && JSON.parse(fixture.writes[0].value).eintraege[0].im_besitz === true
  && JSON.parse(fixture.writes[1].value).eintraege[0].im_besitz === false);
await fixture.cleanup();

fixture = await mounteMustwatch({ master: [{ id: "film_1", titel: "Film", quelle: "dvd", must_watch: true }] });
await act(async () => {
  const [ersterLauf, zweiterLauf] = await Promise.all([
    fixture.api().migriereMustwatch(),
    fixture.api().migriereMustwatch(),
  ]);
  check("Must-Watch-Migrationsdoppelklick bleibt erfolgreich und idempotent", ersterLauf && zweiterLauf);
  await tick();
});
check("Must-Watch-Migrationsdoppelklick erzeugt genau einen Eintrag und einen Write",
  fixture.api().mustwatch.length === 1 && fixture.writes.length === 1
  && fixture.api().migrationsBericht.angelegt === 0
  && fixture.api().migrationsBericht.uebersprungen === 1);
await fixture.cleanup();

fixture = await mounteMustwatch({
  master: [{ id: "film_weg", titel: "Weg" }],
  get: async () => ({ value: JSON.stringify({ eintraege: [{ id: "mw_alt", titel: "Alt" }] }) }),
});
await act(async () => {
  const barriere = fixture.api().transaktionMustwatch(
    (vorher) => vorher.filter((e) => e.id !== "mw_alt"),
    async () => { fixture.masterRef.current = []; return true; },
  );
  const add = fixture.api().addMustwatch({
    titel: "Danach",
    verknuepfung: { ziel: "master", id: "film_weg" },
  });
  check("Späteres Add wartet auf die Mehrtopf-Barriere", await barriere && await add);
  await tick();
});
check("Queue-Validator entfernt eine während der Barriere veraltete Master-Verknüpfung",
  fixture.api().mustwatch.length === 1
  && fixture.api().mustwatch[0].verknuepfung === null
  && fixture.errors.some((meldung) => /existiert nicht mehr/.test(meldung)));
await fixture.cleanup();

fixture = await mounteMustwatch({ master: [{ id: "film_flag", titel: "Flag", must_watch: true }] });
await act(async () => {
  const barriere = fixture.api().transaktionMustwatch((vorher) => vorher, async () => {
    fixture.masterRef.current = [];
    return true;
  });
  const migration = fixture.api().migriereMustwatch();
  check("Flagmigration wartet auf die Master-Barriere", await barriere && await migration);
  await tick();
});
check("Gequeue-te Flagmigration liest den Master erst nach der Barriere neu",
  fixture.api().mustwatch.length === 0 && fixture.writes.length === 0
  && fixture.api().migrationsBericht.angelegt === 0);
await fixture.cleanup();

const rollbackStart = [{ id: "mw_bleibt", titel: "Bleibt" }];
fixture = await mounteMustwatch({
  get: async () => ({ value: JSON.stringify({ eintraege: rollbackStart }) }),
});
let transaktionOk;
await act(async () => {
  transaktionOk = await fixture.api().transaktionMustwatch(() => [], async () => false);
  await tick();
});
check("Externer Fehler sichert den vorherigen Must-Watch-Stand zurück",
  transaktionOk === false && fixture.api().mustwatch[0].id === "mw_bleibt"
  && JSON.parse(fixture.writes[0].value).eintraege.length === 0
  && JSON.parse(fixture.writes[1].value).eintraege[0].id === "mw_bleibt");
await fixture.cleanup();

fixture = await mounteMustwatch({
  get: async () => ({ value: JSON.stringify({ eintraege: rollbackStart }) }),
  set: async (_key, value, nummer) => {
    if (nummer === 2) throw new Error("Rollback absichtlich fehlgeschlagen");
    return { value };
  },
});
await act(async () => {
  transaktionOk = await fixture.api().transaktionMustwatch(() => [], async () => false);
  await tick();
});
check("Fehlgeschlagene Rücksicherung zeigt den tatsächlich persistierten Folgestand",
  transaktionOk === false && fixture.api().mustwatch.length === 0
  && fixture.errors.some((meldung) => /nicht zurückgesichert/.test(meldung)));
await fixture.cleanup();

fixture = await mounteMustwatch({ get: async () => ({ value: "" }) });
check("Vorhandener leerer Must-Watch-Topf sperrt Änderungen fail-closed",
  fixture.api().mustwatchGeladen === false
  && fixture.errors.some((meldung) => /nicht sicher geladen/.test(meldung))
  && await fixture.api().addMustwatch({ titel: "Darf nicht hinein" }) === false
  && fixture.writes.length === 0);
await fixture.cleanup();

let verwerfeAltesLesen;
fixture = await mounteMustwatch({
  get: () => new Promise((_resolve, reject) => { verwerfeAltesLesen = reject; }),
});
await act(async () => {
  fixture.api().setMustwatch([{ id: "mw_demo", titel: "Gesicherte Demo" }]);
  verwerfeAltesLesen(new Error("veralteter Lesefehler"));
  await tick();
});
check("Veralteter Load-Fehler sperrt keinen inzwischen bestätigten Demo-Stand",
  fixture.api().mustwatchGeladen === true && fixture.api().mustwatch[0].id === "mw_demo"
  && fixture.errors.length === 0);
await fixture.cleanup();

/* Schon WÄHREND B noch lädt, darf kein A-Eintrag mehr in der sichtbaren Liste
   oder in abgeleiteten Finder-/Referenzsignalen stehen. */
fixture = await mounteMustwatch({
  get: async () => ({ value: JSON.stringify({
    eintraege: [{ id: "mw_a_sichtbar", titel: "Nur A", verknuepfung: { ziel: "master", id: "film_a" } }],
  }) }),
});
check("Ausgangsstand A ist vor dem Treiberwechsel bestätigt sichtbar",
  fixture.api().mustwatchGeladen === true
  && fixture.api().mustwatch[0].id === "mw_a_sichtbar"
  && fixture.api().mustwatchMasterIds.has("film_a"));
let loeseBlockiertesBGet, meldeBGetGestartet;
const bGetGestartet = new Promise((resolve) => { meldeBGetGestartet = resolve; });
const langsamerTreiberB = {
  name: "konto-b-langsam",
  get: () => {
    meldeBGetGestartet();
    return new Promise((resolve) => { loeseBlockiertesBGet = resolve; });
  },
  async set(key, value) { return { key, value }; },
  async delete(key) { return { key, deleted: true }; },
  async list() { return { keys: [] }; },
};
await act(async () => {
  setStorageDriver(langsamerTreiberB);
  await bGetGestartet;
  await tick();
});
check("Während des blockierten B-Loads sind A-Liste und A-Referenzsignale sofort isoliert",
  fixture.api().mustwatchGeladen === false
  && fixture.api().mustwatch.length === 0
  && fixture.api().mustwatchMasterIds.size === 0);
await act(async () => {
  loeseBlockiertesBGet({ value: JSON.stringify({ eintraege: [{ id: "mw_b_neu", titel: "B" }] }) });
  await tick();
});
check("Nach dem B-Load wird ausschließlich der bestätigte B-Stand sichtbar",
  fixture.api().mustwatchGeladen === true
  && fixture.api().mustwatch.length === 1
  && fixture.api().mustwatch[0].id === "mw_b_neu");
await fixture.cleanup();

/* Konto-/Treiberwechsel mitten in einer belegten Queue: Der erste A-Write ist
   bereits an Treiber A gebunden. Alle dahinter wartenden A-Aufträge müssen
   verworfen werden, statt beim späteren Start die dynamische B-Fassade zu
   treffen. Der Controller lädt anschließend den bestätigten B-Stand neu. */
let loeseLangsamenAWrite;
fixture = await mounteMustwatch({
  set: async (_key, value, nummer) => {
    if (nummer === 1) await new Promise((resolve) => { loeseLangsamenAWrite = resolve; });
    return { value };
  },
});
const bWrites = [];
const treiberB = {
  name: "konto-b",
  async get() {
    return { value: JSON.stringify({ eintraege: [{ id: "mw_b", titel: "Nur B" }] }) };
  },
  async set(key, value) { bWrites.push({ key, value }); return { key, value }; },
  async delete(key) { bWrites.push({ key, deleted: true }); return { key, deleted: true }; },
  async list() { return { keys: [] }; },
};
let raceErgebnisse, staleFolgeschritte = 0;
await act(async () => {
  const ersterAWrite = fixture.api().addMustwatch({ titel: "A läuft" });
  await tick();
  const gequeueTerAWrite = fixture.api().addMustwatch({ titel: "A wartet" });
  const gequeueTeATransaktion = fixture.api().transaktionMustwatch(
    (vorher) => vorher.slice(0, 0),
    async () => { staleFolgeschritte++; return true; },
  );
  setStorageDriver(treiberB);
  await tick();
  loeseLangsamenAWrite();
  raceErgebnisse = await Promise.all([ersterAWrite, gequeueTerAWrite, gequeueTeATransaktion]);
  await tick();
});
check("Treiberwechsel verwirft laufende und gequeue-te A-Aufträge vor jedem B-Write",
  raceErgebnisse.every((wert) => wert === false)
  && fixture.writes.length === 1 && bWrites.length === 0);
check("Eine veraltete MW-Transaktion führt ihren Folgeschritt nicht im neuen Kontext aus",
  staleFolgeschritte === 0
  && fixture.api().mustwatchGeladen === true
  && fixture.api().mustwatch[0].id === "mw_b");
await fixture.cleanup();

/* Wechselt der Kontext erst WÄHREND des Folgeschritts, darf weder dessen
   gebundener Speicherzugriff noch die MW-Rücksicherung in B landen. */
let folgeschrittFreigeben, folgeschrittGestartet;
const folgeschrittStart = new Promise((resolve) => { folgeschrittGestartet = resolve; });
fixture = await mounteMustwatch({
  get: async () => ({ value: JSON.stringify({ eintraege: rollbackStart }) }),
});
const bRollbackWrites = [];
const rollbackTreiberB = {
  name: "konto-b-rollback",
  async get() {
    return { value: JSON.stringify({ eintraege: [{ id: "mw_b2", titel: "B bleibt" }] }) };
  },
  async set(key, value) { bRollbackWrites.push({ key, value }); return { key, value }; },
  async delete(key) { bRollbackWrites.push({ key, deleted: true }); return { key, deleted: true }; },
  async list() { return { keys: [] }; },
};
let gebundenerFolgeWriteGesperrt = false;
await act(async () => {
  const lauf = fixture.api().transaktionMustwatch(() => [], async ({ storageContext }) => {
    folgeschrittGestartet();
    await new Promise((resolve) => { folgeschrittFreigeben = resolve; });
    try { await storageContext.set("kd:master", "DARF-NICHT-NACH-B"); }
    catch { gebundenerFolgeWriteGesperrt = true; }
    return false;
  });
  await folgeschrittStart;
  setStorageDriver(rollbackTreiberB);
  await tick();
  folgeschrittFreigeben();
  transaktionOk = await lauf;
  await tick();
});
check("Kontextwechsel im Folgeschritt sperrt Folge-Write und MW-Rollback gegen B",
  transaktionOk === false && gebundenerFolgeWriteGesperrt
  && fixture.writes.length === 1 && bRollbackWrites.length === 0
  && fixture.api().mustwatch[0].id === "mw_b2");
await fixture.cleanup();

check("Katalogcontroller normalisiert ISO-Zeit und lehnt Müll ab",
  Number.isFinite(zeitpunkt("2026-07-31T12:00:00Z")) && zeitpunkt("kein Datum") === null);
const importInfo = IMPORT_INFO(123);
check("Manueller Import erbt weder Variante noch Fehler- oder Ablaufetikett",
  importInfo.stand === 123 && importInfo.variante === null
  && importInfo.code === null && importInfo.abgelaufen === false);

const streamingDemo = streamingPayloadMitMetadaten({
  payload: { titel: [{ watchmode_id: 1 }], region: "AT" },
  stand: "2026-07-15T11:00:00Z",
  gueltigBis: "2026-08-29T22:13:00Z",
  variante: "demo",
});
check("Getrennte Streaming-Demo übernimmt Katalogmetadaten in die Anzeigepayload",
  streamingDemo.stand === "2026-07-15T11:00:00Z"
  && streamingDemo.gueltigBis === "2026-08-29T22:13:00Z"
  && streamingDemo.demo === true
  && streamingDemo.titel.length === 1);
const streamingEigen = streamingPayloadMitMetadaten({
  payload: { titel: [], stand: "payload-stand", gueltigBis: "payload-ablauf", demo: false },
  stand: "zeilen-stand", gueltigBis: "zeilen-ablauf", variante: "demo",
});
check("Vorhandene Streaming-Payloadmetadaten werden nicht überschrieben",
  streamingEigen.stand === "payload-stand"
  && streamingEigen.gueltigBis === "payload-ablauf"
  && streamingEigen.demo === false);

const app = fs.readFileSync("src/App.jsx", "utf8");
const onboarding = fs.readFileSync("src/controllers/onboardingController.js", "utf8");
const libraryController = fs.readFileSync("src/controllers/libraryController.js", "utf8");
const catalogController = fs.readFileSync("src/controllers/catalogController.js", "utf8");
for (const name of [
  "onboardingController",
  "catalogController",
  "libraryController",
  "useIntelligenceController",
  "useMustwatchController",
  "useEntdeckenRadarController",
  "useArticleController",
  "personalDataTransactionController",
  "useEggController",
]) {
  check(`App verdrahtet ${name}`, app.includes(name));
}
check("Bezahlte KI- und Filmwissen-Services sind aus App.jsx herausgelöst",
  !/services\/(?:vorbewertung|filmwissen)\.js/.test(app));
check("Egg-Frequenz und Achievements sind aus App.jsx herausgelöst",
  !/lib\/(?:eggFrequenz|eggs|momentEggs)\.js/.test(app));
check("Onboarding-Reset verwendet das PersonalDataRegistry statt einer zweiten 16er-Liste",
  /PERSONAL_DATA_KEYS/.test(onboarding)
  && !/\[K\.master,\s*K\.artikel/.test(onboarding));
check("Datenhaltende Controller verwenden die isolierten Projektionen",
  /lib\/libraryProjection\.js/.test(libraryController)
  && /lib\/catalogProjection\.js/.test(catalogController));
check("App.jsx liegt innerhalb der E14-Zeilenobergrenze von 2215",
  app.split("\n").length <= 2215);
check("Master- und Artikelimport persistieren keine ungenutzten Rohdaten-Snapshots",
  !/kd:import:vorher/.test(app)
  && !/schreibeImportSnapshot/.test(app)
  && !/schreibeImportSnapshot/.test(libraryController));
const mustwatchListe = fs.readFileSync("src/components/MustWatchListe.jsx", "utf8");
const startTab = fs.readFileSync("src/tabs/StartTab.jsx", "utf8");
const mustwatchController = fs.readFileSync("src/controllers/useMustwatchController.js", "utf8");
const articleController = fs.readFileSync("src/controllers/useArticleController.js", "utf8");
const personalDataController = fs.readFileSync("src/controllers/personalDataTransactionController.js", "utf8");
const intelligenceController = fs.readFileSync("src/controllers/useIntelligenceController.js", "utf8");
const radarController = fs.readFileSync("src/controllers/useEntdeckenRadarController.js", "utf8");
check("App leitet Radarpilot-Flags und Callbacks auf EntdeckenTab durch", /<EntdeckenTab/.test(app)
  && /radarPilotClientEnabled=\{radarPilotClientEnabled\}/.test(app)
  && /radarPilotActive=\{radarPilotActive\}/.test(app)
  && /radarPilotEvents=\{radarPilotEvents\}/.test(app)
  && /radarReview=\{radarReview\}/.test(app)
  && /syncStatus=\{radarPilotSyncStatus\}/.test(app)
  && /onRadarPilotReceipt=\{fuehreRadarPilotReceipt\}/.test(app)
  && /onRadarPilotImport=\{fuehreRadarPilotImport\}/.test(app)
  && /onRadarPilotSync=\{fuehreRadarPilotSync\}/.test(app));
  check("Controller liest Radar-Initialwert aus localStorage und decodiert ihn pro Authority", /const radarInitial = useMemo\(\(\) => \{[\s\S]*decodeLocalRadar\(localStorage\.getItem\(K\.radar\), \{ authority: radarAuthority \}\)[\s\S]*return decoded\.ok \? decoded\.state/.test(radarController));
  check("Controller liest Kd-Radar-Boot aus Store und decodiert pro Authority", /store\.get\(K\.radar\)/.test(radarController)
    && /decodeLocalRadar\(gespeicherterRadar\?\.value/.test(radarController)
    && /setRadarState\(decoded\.state\)/.test(radarController));
  check("Controller meldet Boot-Malformed und Lesefehler mit W3-Texten", /setErr\("Der lokale Radar-Stand passt nicht zur aktuellen Anmeldung oder ist beschädigt\. Er wurde nicht verändert und bleibt vorsichtshalber ausgeblendet\."\)/.test(radarController)
    && /setErr\("Der lokale Radar-Stand konnte nicht gelesen werden\. Es wurde nichts verändert\."\)/.test(radarController));
  check("Boot-Sync nutzt decoded.state als Sync-Payload und aktiv-guarded commit", /setRadarPilotSyncStatus\("syncing"\)/.test(radarController)
    && /await radarPilotService\.sync\(\{[\s\S]*state: decoded\.state,[\s\S]*commit: \(next\) => \(aktiv \? setRadarState\(next\) : false\)[\s\S]*\}\)/.test(radarController));
  check("Store-Lesefehler wird vorläufig unmounted-safe abgefangen", /} catch \{[\s\S]*if \(!aktiv\) return;[\s\S]*setRadarState\(createEmptyLocalRadar\(\{ authority: radarAuthority \}\)\);[\s\S]*setErr\("Der lokale Radar-Stand konnte nicht gelesen werden\. Es wurde nichts verändert\."\)/.test(radarController));
  check("Controller-Sync ruft radarPilotService exakt mit state und commit auf", /const syncRadarPilot = useCallback\(async \(stateForSync = null\) => \{[\s\S]*radarPilotService\.sync\(\{[\s\S]*state,/.test(radarController)
    && /commit:\s*\(next\) => setRadarState\(next\)/.test(radarController));
  check("Manualer Pilot-Sync mapped unerwartete Errors auf pending/pilot-unknown ohne globale Fehlerqueue", /const syncRadarPilot = useCallback\(async \(stateForSync = null\) => \{[\s\S]*catch \{[\s\S]*setRadarPilotSyncStatus\("pending"\);[\s\S]*return \{ status: "pending", state, reason: "pilot-unknown" \}/.test(radarController));
  check("Share-Pfad bleibt ohne Pilot-Sync", (() => {
    const start = radarController.indexOf("const aendereRadarShare = useCallback(async (targetId, shareEnabled) => {");
    const ende = radarController.indexOf("const fuehreRadarPilotReceipt = useCallback", start);
    if (start < 0 || ende < 0) return false;
    return !/syncRadarPilot/.test(radarController.slice(start, ende));
  })());
  check("Controller schreibt bestätigt bestätigten Subscription-/Receipt-/Import-Stand nur über Queuewrite-Ergebnis in Pilot-Sync", /void syncRadarPilot\(gespeichert\)/.test(radarController)
    && !/let gespeicherterStand = null;/.test(radarController)
    && /const gespeichert = await schreibeRadarState\([\s\S]*queueAccountRadarPilotReceipt[\s\S]*return result\.ok \? result\.state : null;[\s\S]*await syncRadarPilot\(gespeichert\)/.test(radarController)
    && /const gespeichert = await schreibeRadarState\([\s\S]*queueAccountRadarPilotImport[\s\S]*return result\.ok \? result\.state : null;[\s\S]*await syncRadarPilot\(gespeichert\)/.test(radarController));
  check("Controller hat keinen Pilot-Timer/Retry/Serial für den W2-Pfad", !/radarPilotSyncSerialRef|setTimeout|setInterval|clearTimeout|clearInterval/.test(radarController));
  check("Pilot-Gates richten sich nur an Flag/Authority/Active-Account", /const fuehreRadarPilotImport = useCallback\(async \(payload\) => \{/ .test(radarController)
    && /!radarPilotClientEnabled/.test(radarController)
    && /!remoteKontoAktiv/.test(radarController)
  && /radarAuthority !== "account-cache"/.test(radarController)
  && /radarStateRef\.current\?\.pilot\?\.radarReview !== true/.test(radarController));
check("Must-Watch-Verknüpfungen springen stabil in alle drei Katalogbereiche",
  /\["master", "programm", "streaming"\]/.test(mustwatchListe)
  && /onSpringeZuMustwatchRef=\{springeZuMustwatchRef\}/.test(app));
check("Must-Watch-Controller migriert keine Merkliste und erhält Bestandsfelder",
  !/K\.merkliste|migriereMerkliste/.test(mustwatchController)
  && /im_besitz/.test(mustwatchController) && /beschreibung/.test(mustwatchController)
  && /kommtVorInMap/.test(mustwatchListe) && /Rotlinks heilen/.test(app));
check("Must-Watch-Flagmigration berechnet neue Einträge erst innerhalb der Schreibkette",
  /schreibeMustwatch\(\(vorher\) => \{[\s\S]*migriereFlags\([\s\S]*externerMasterRef\?\.current \|\| master \|\| \[\], vorher/.test(mustwatchController));
check("Must-Watch prüft gequeue-te Master-Verknüpfungen erst beim tatsächlichen Schreiben erneut",
  /sichereVerknuepfung\(daten\.verknuepfung\)/.test(mustwatchController)
  && /typeof changes === "function" \? changes\(aktuell\)/.test(mustwatchController)
  && /sichereVerknuepfung\(normalisiert\.verknuepfung\)/.test(mustwatchController)
  && /masterRef\.current/.test(app));
check("Must-Watch-Besitzcheckbox toggelt funktional innerhalb der Schreibqueue",
  /onUpdate\(e\.id, \(aktuell\) => \(\{ im_besitz: !aktuell\.im_besitz \}\)\)/.test(mustwatchListe));
check("Must-Watch normalisiert optionales Jahr und Typ an der Schreibgrenze",
  /jahr: mustwatchJahr\(daten\.jahr\), typ: mustwatchTyp\(daten\.typ\)/.test(mustwatchController)
  && /normalisiereMetadaten\(berechnet\)/.test(mustwatchController));
check("Must-Watch-Oberfläche und Dashboard verwenden dieselbe reine Projektion",
  /projiziereMustwatch/.test(mustwatchListe)
  && /mustwatchVerfuegbarkeit/.test(mustwatchListe)
  && /sortiereMustwatch\(mustwatch, mwKandidatenSicher\)\.slice\(0, 5\)/.test(startTab)
  && /mustwatchVerfuegbarkeit\(e, mwKandidatenSicher\)/.test(startTab)
  && /mwKandidaten=\{mwKandidaten\}/.test(app));
check("Must-Watch speichert keinen Verfügbarkeitsstatus und rät keine Titel",
  !/verfuegbar(?:keit)?:/.test(mustwatchController)
  && !/mustwatchVerfuegbarkeit/.test(mustwatchController)
  && !/norm\(k\.titel\)[\s\S]{0,80}verknuepfung/.test(mustwatchListe));
check("Demo-Boot bestätigt Must-Watch erst nach erfolgreichem lokalem Schreiben",
  /localStorage\.setItem\(K\.mustwatch,[^\n]+\); setMustwatch\(mw\)/.test(app));
check("Master-Add und -Update kanonisieren Typen an der gemeinsamen Schreibgrenze",
  /master: ensureIds\(aktuell\.map/.test(app)
  && (app.match(/ensureIds\(\[\{ \.\.\.film, id \}\]\)\[0\]/g) || []).length === 2
  && /neu = ensureIds\(\[\{ \.\.\.kandidat, id \}\]\)\[0\]/.test(intelligenceController));
check("Mehrtopf-Löschungen warten fail-closed auf den sicheren Must-Watch-Ladestand",
  /mustwatch, setMustwatch, mustwatchGeladen, ersetzeMustwatch/.test(app)
  && (app.match(/if \(!mustwatchGeladen \|\| !artikelGeladen\)/g) || []).length >= 2
  && /transaktionMustwatchVorbereitet/.test(mustwatchController)
  && /transaktionArtikel/.test(articleController)
  && /Artikel → Must-Watch → Master/.test(personalDataController)
  && /Es wurde nichts verändert/.test(app));
check("Radarcontroller projiziert den Kontopilot getrennt und lässt Gast-Fixtures lokal",
  /projectEntdeckenRadarPilot/.test(radarController)
  && /radarPilotEvents: radarPilotProjection\.events/.test(radarController)
  && /radarReview: radarPilotProjection\.radarReview/.test(radarController));
const pilotImportProjectionQueued = R.queueAccountRadarPilotImport(
  R.reconcileAccountRadarPilotFeed(
    R.createEmptyLocalRadar({ authority: "account-cache" }),
    {
      format: "kd-radar-pilot-feed-v1", revision: 1, checksum: "a".repeat(64),
      reconciledAt: "2026-08-14T08:00:00.000Z",
      subscriptions: [],
      events: [],
      receipts: [],
      operationAcks: [],
      radarReview: true,
    },
  ).state,
  {
    operationId: "11111111-1111-4111-8111-111111111111", now: "2026-08-14T08:00:00.000Z",
    payload: {
      targetKey: "tmdb:0001", eventType: "kinostart_at", date: "2026-08-20",
      region: "AT", platform: "-",
      evidence: [
        { sourceId: "source:official", url: "https://example.com/official", retrievedAt: "2026-08-14T08:00:00.000Z" },
        { sourceId: "source:editorial", url: "https://news.example.com/editorial", retrievedAt: "2026-08-14T08:00:01.000Z" },
      ],
    },
  },
);
check("Pilot-Import-Queue akzeptiert den Eingangssatz als erfolgreich", pilotImportProjectionQueued.ok === true);
const pilotImportProjectionState = pilotImportProjectionQueued.state;
check("Pilot-Import-Queue bleibt in aktiver Projektion ohne sichtbares Event", (() => {
  const projection = projectEntdeckenRadarPilot({
    clientEnabled: true,
    radarAuthority: "account-cache",
    radarState: pilotImportProjectionState,
    localEvents: [],
  });
  return projection.active === true
    && projection.radarReview === true
    && projection.events.length === 0;
})());

console.log(`controllers_test: ${ok} Checks bestanden.`);
