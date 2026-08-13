/* Fokussierter E12-Vertragstest für reine Batchprojektion und gebundene
   Drei-Topf-Ausführung. Rein lokal, ohne React, Netz oder Anbieteraufrufe. */

import {
  planeFilmBatchLoeschung,
  planeFilmLoeschung,
} from "./src/lib/libraryProjection.js";
import { erstellePersonalDataTransactionController } from "./src/controllers/personalDataTransactionController.js";
import { localDriver, setStorageDriver } from "./src/lib/storage.js";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

const masterA = { id: "a", titel: "A" };
const masterB = { id: "b", titel: "B" };
const masterC = { id: "c", titel: "C" };
const artikelBleibt = { id: "blog-bleibt", titel: "Bleibt", liste: [{ eingabe: "C", ref: "c" }] };
const artikelGemischt = {
  id: "blog-gemischt",
  titel: "Gemischt",
  abgleichStat: { verlinkt: 3 },
  liste: [
    { eingabe: "A", ref: " a ", abgleich: { status: "verlinkt" }, extra: "bleibt" },
    { eingabe: "B", ref: "b", abgleich: { status: "verlinkt" } },
    { eingabe: "C", ref: "c", abgleich: { status: "verlinkt" } },
    { eingabe: "Rot", ref: null },
  ],
};
const mwA = { id: "mw-a", titel: "A", notiz: "bleibt", verknuepfung: { ziel: "master", id: "a" } };
const mwB = { id: "mw-b", titel: "B", verknuepfung: { ziel: "master", id: " b " } };
const mwStreaming = { id: "mw-stream", titel: "Stream", verknuepfung: { ziel: "streaming", id: 7 } };

for (const [name, ids, code] of [
  ["leere Zielmenge", [], "ZIELE_LEER"],
  ["fehlende Zielmenge", undefined, "ZIELE_LEER"],
  ["ungültige Ziel-ID", [null], "ZIEL_ID_UNGUELTIG"],
  ["Number/String-Kollision", [1, "1"], "ZIEL_ID_KOLLISION"],
  ["Trim-Kollision", [" a", "a "], "ZIEL_ID_KOLLISION"],
]) {
  const plan = planeFilmBatchLoeschung([masterA], [], [], ids);
  check(`Projektion verwirft ${name} fail-closed`, !plan.ok && plan.fehlercode === code);
}

check("Jede Ziel-ID muss kanonisch exakt einmal im Master vorkommen",
  planeFilmBatchLoeschung([masterA], [], [], ["fehlt"]).fehlercode === "ZIEL_NICHT_EINDEUTIG_IM_MASTER"
  && planeFilmBatchLoeschung([{ id: 1 }, { id: "1" }], [], [], [1]).fehlercode === "ZIEL_NICHT_EINDEUTIG_IM_MASTER"
  && planeFilmBatchLoeschung([{ id: " a" }, { id: "a " }], [], [], ["a"]).fehlercode === "ZIEL_NICHT_EINDEUTIG_IM_MASTER");

check("Eine kanonische Must-Watch-ID-Kollision stoppt vor jeder Projektion",
  planeFilmBatchLoeschung([masterA], [], [{ id: " a " }], ["a"]).fehlercode === "MUSTWATCH_ID_KOLLISION");

const batchPlan = planeFilmBatchLoeschung(
  [masterA, masterB, masterC],
  [artikelGemischt, artikelBleibt],
  [mwA, mwB, mwStreaming],
  ["a", "b"],
);
check("Mehrzielprojektion entfernt Masterziele und aggregiert alle drei Folgen exakt",
  batchPlan.ok
  && batchPlan.master.length === 1 && batchPlan.master[0] === masterC
  && JSON.stringify(batchPlan.folgen) === JSON.stringify({ masterEintraege: 2, artikelRefs: 2, mustwatchRefs: 2 }));
check("Artikel werden nur an passenden Refs zu Rotlinks und verlieren Abgleichmetadaten",
  batchPlan.artikel[0] !== artikelGemischt
  && batchPlan.artikel[0].liste[0].ref === null
  && !("abgleich" in batchPlan.artikel[0].liste[0])
  && batchPlan.artikel[0].liste[0].extra === "bleibt"
  && batchPlan.artikel[0].liste[2] === artikelGemischt.liste[2]
  && !("abgleichStat" in batchPlan.artikel[0]));
check("Nicht betroffene Artikel-, MW- und Objektidentitäten bleiben erhalten",
  batchPlan.artikel[1] === artikelBleibt
  && batchPlan.mustwatch[2] === mwStreaming
  && batchPlan.mustwatch[0] !== mwA && batchPlan.mustwatch[0].notiz === "bleibt"
  && batchPlan.mustwatch[0].verknuepfung === null);

const ohneRefsArtikel = [artikelBleibt];
const ohneRefsMw = [mwStreaming];
const ohneRefs = planeFilmBatchLoeschung([masterA, masterC], ohneRefsArtikel, ohneRefsMw, ["a"]);
check("Töpfe ohne passende Refs behalten ihre exakte Arrayidentität",
  ohneRefs.ok && ohneRefs.artikel === ohneRefsArtikel && ohneRefs.mustwatch === ohneRefsMw
  && ohneRefs.folgen.artikelRefs === 0 && ohneRefs.folgen.mustwatchRefs === 0);
check("Einzelprojektion delegiert ohne zweite Semantik auf den Batchvertrag",
  JSON.stringify(planeFilmLoeschung([masterA, masterC], ohneRefsArtikel, ohneRefsMw, "a"))
    === JSON.stringify(planeFilmBatchLoeschung([masterA, masterC], ohneRefsArtikel, ohneRefsMw, ["a"])));

function baueTransaktionsHarness({ master, artikel, mustwatch, fehler = {}, hooks = {} }) {
  const masterRef = { current: master };
  const artikelRef = { current: artikel };
  const mustwatchRef = { current: mustwatch };
  const writes = [];

  const transaktionMustwatchVorbereitet = async (berechne, folge, optionen = {}) => {
    hooks.vorMustwatch?.({ masterRef, artikelRef, mustwatchRef });
    if (!optionen.storageContext?.isCurrent?.()
      || (Object.hasOwn(optionen, "erwarteteBasis") && mustwatchRef.current !== optionen.erwarteteBasis)) return false;
    const vorher = mustwatchRef.current;
    let next = berechne(vorher);
    if (!Array.isArray(next)) return false;
    let geaendert = next !== vorher;
    let bestaetigt = !geaendert;
    let rollbackVersucht = false;
    let rollbackOk = !geaendert;
    const setzeNext = (liste) => {
      if (!Array.isArray(liste) || rollbackVersucht || (geaendert && bestaetigt)) return false;
      next = liste;
      geaendert = next !== vorher;
      bestaetigt = !geaendert;
      rollbackOk = !geaendert;
      return true;
    };
    const persistiere = async () => {
      if (bestaetigt) return true;
      writes.push({ topf: "mustwatch", phase: "vorwaerts", next });
      if (fehler.mustwatchWrite) return false;
      bestaetigt = true;
      return true;
    };
    const rolleZurueck = async () => {
      rollbackVersucht = true;
      if (!geaendert || !bestaetigt) return true;
      writes.push({ topf: "mustwatch", phase: "rollback", next: vorher });
      rollbackOk = !fehler.mustwatchRollback;
      if (!rollbackOk) mustwatchRef.current = next;
      return rollbackOk;
    };
    let folgeResultat = false;
    try {
      folgeResultat = await folge({
        vorher, next, storageContext: optionen.storageContext, persistiere, rolleZurueck, setzeNext,
      });
    } catch { folgeResultat = false; }
    const folgeOk = folgeResultat !== false
      && !(folgeResultat && typeof folgeResultat === "object" && folgeResultat.ok === false);
    if (folgeOk && bestaetigt) {
      if (geaendert) mustwatchRef.current = next;
      return true;
    }
    if (bestaetigt && geaendert && !rollbackVersucht) await rolleZurueck();
    return false;
  };
  transaktionMustwatchVorbereitet.basisRef = mustwatchRef;

  const transaktionArtikel = async (berechne, folge, optionen = {}) => {
    hooks.vorArtikel?.({ masterRef, artikelRef, mustwatchRef });
    if (!optionen.storageContext?.isCurrent?.()
      || (Object.hasOwn(optionen, "erwarteteBasis") && artikelRef.current !== optionen.erwarteteBasis)) return false;
    const vorher = artikelRef.current;
    const next = berechne(vorher);
    if (!Array.isArray(next) || (optionen.pruefeVorWrite && optionen.pruefeVorWrite() !== true)) return false;
    const geaendert = next !== vorher;
    if (geaendert) {
      writes.push({ topf: "artikel", phase: "vorwaerts", next });
      if (fehler.artikelWrite) return false;
    }
    hooks.nachArtikelWrite?.({ masterRef, artikelRef, mustwatchRef });
    let folgeResultat = false;
    try { folgeResultat = await folge({ vorher, next, storageContext: optionen.storageContext }); }
    catch { folgeResultat = false; }
    const folgeOk = folgeResultat === true
      || (!!folgeResultat && typeof folgeResultat === "object" && folgeResultat.ok !== false);
    if (folgeOk) {
      if (geaendert) artikelRef.current = next;
      return true;
    }
    const sollRollback = !(folgeResultat && typeof folgeResultat === "object"
      && folgeResultat.artikelRollback === false);
    if (geaendert && sollRollback) {
      writes.push({ topf: "artikel", phase: "rollback", next: vorher });
      artikelRef.current = fehler.artikelRollback ? next : vorher;
    } else if (geaendert) artikelRef.current = next;
    return false;
  };
  transaktionArtikel.basisRef = artikelRef;

  const transaktionMaster = async (plan, optionen = {}) => {
    hooks.vorMaster?.({ masterRef, artikelRef, mustwatchRef });
    if (!optionen.storageContext?.isCurrent?.()
      || (Object.hasOwn(optionen, "erwarteteBasis") && masterRef.current !== optionen.erwarteteBasis)) return false;
    writes.push({ topf: "master", phase: "vorwaerts", art: plan.loeschen ? "delete" : "set", next: plan.master });
    if (fehler.masterWrite) return false;
    masterRef.current = plan.master;
    return true;
  };

  const actions = erstellePersonalDataTransactionController({
    transaktionMustwatchVorbereitet,
    transaktionArtikel,
    transaktionMaster,
    masterRef,
    artikelRef,
    mustwatchRef,
  });
  return { actions, masterRef, artikelRef, mustwatchRef, writes };
}

const basis = () => ({
  master: [masterA, masterB, masterC],
  artikel: [artikelGemischt, artikelBleibt],
  mustwatch: [mwA, mwB, mwStreaming],
});

let fixture = baueTransaktionsHarness(basis());
let vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
check("Controllerplan bindet Zielreihenfolge, drei Arraybasen und Speicherkontext",
  vorschau.ok && Object.isFrozen(vorschau) && Object.isFrozen(vorschau.zielIds)
  && vorschau.masterBasis === fixture.masterRef.current
  && vorschau.artikelBasis === fixture.artikelRef.current
  && vorschau.mustwatchBasis === fixture.mustwatchRef.current
  && vorschau.storageContext.isCurrent());
let ergebnis = await fixture.actions.loescheFilme(["a", "b"], { vorschau, meta: null, herkunft: { typ: "test" } });
check("Ein öffentlicher Batch führt je verändertem Topf genau einen Vorwärtswrite aus",
  ergebnis
  && fixture.writes.filter((w) => w.phase === "vorwaerts").map((w) => w.topf).join(",") === "artikel,mustwatch,master"
  && fixture.masterRef.current.length === 1);

fixture = baueTransaktionsHarness({ master: [masterA, masterB], artikel: [], mustwatch: [] });
vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
ergebnis = await fixture.actions.loescheFilme(["a", "b"], { plan: vorschau });
check("Vollständige Masterleerung verwendet genau ein set und niemals delete",
  ergebnis && fixture.masterRef.current.length === 0
  && fixture.writes.length === 1
  && fixture.writes[0].topf === "master" && fixture.writes[0].art === "set");

fixture = baueTransaktionsHarness(basis());
vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
check("Eine abweichende Zielreihenfolge kann einen gebundenen Plan nicht ausführen",
  await fixture.actions.loescheFilme(["b", "a"], { plan: vorschau }) === false && fixture.writes.length === 0);
check("Ein formfremder fremder Plan wird ohne Ausnahme und ohne Write abgewiesen",
  await fixture.actions.loescheFilme(["a", "b"], { plan: { ok: true, zielIds: "ab" } }) === false
  && fixture.writes.length === 0);

for (const topf of ["master", "artikel", "mustwatch"]) {
  fixture = baueTransaktionsHarness(basis());
  vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
  fixture[`${topf}Ref`].current = [...fixture[`${topf}Ref`].current];
  check(`Stale ${topf}-Basis bricht vor dem ersten Write ab`,
    await fixture.actions.loescheFilme(["a", "b"], { plan: vorschau }) === false
    && fixture.writes.length === 0);
}

fixture = baueTransaktionsHarness(basis());
vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
setStorageDriver({ ...localDriver, name: "anderer-kontext" });
check("Storage-/Accountkontextwechsel macht die Vorschau vor dem ersten Write ungültig",
  await fixture.actions.loescheFilme(["a", "b"], { plan: vorschau }) === false && fixture.writes.length === 0);
setStorageDriver(localDriver);

for (const [name, fehler, erwartete] of [
  ["Artikel-Writefehler", { artikelWrite: true }, "artikel"],
  ["MW-Writefehler", { mustwatchWrite: true }, "artikel,mustwatch,artikel"],
  ["Master-Writefehler", { masterWrite: true }, "artikel,mustwatch,master,mustwatch,artikel"],
]) {
  fixture = baueTransaktionsHarness({ ...basis(), fehler });
  vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
  ergebnis = await fixture.actions.loescheFilme(["a", "b"], { plan: vorschau });
  check(`${name} bleibt fail-closed mit erwarteter Kompensationsfolge`,
    ergebnis === false && fixture.writes.map((w) => w.topf).join(",") === erwartete
    && fixture.masterRef.current.length === 3);
}

fixture = baueTransaktionsHarness({
  ...basis(),
  fehler: { masterWrite: true, mustwatchRollback: true },
});
vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
ergebnis = await fixture.actions.loescheFilme(["a", "b"], { plan: vorschau });
check("MW-Rollbackfehler bewahrt die sichere vorwärts gelöste Rotlink-Restlage",
  ergebnis === false
  && fixture.mustwatchRef.current[0].verknuepfung === null
  && fixture.artikelRef.current[0].liste[0].ref === null
  && fixture.writes.map((w) => w.topf).join(",") === "artikel,mustwatch,master,mustwatch");

fixture = baueTransaktionsHarness({
  ...basis(),
  fehler: { masterWrite: true, artikelRollback: true },
});
vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
ergebnis = await fixture.actions.loescheFilme(["a", "b"], { plan: vorschau });
check("Artikel-Rollbackfehler bleibt ehrlich beim sicheren Rotlink-Stand",
  ergebnis === false
  && fixture.mustwatchRef.current[0].verknuepfung.id === "a"
  && fixture.artikelRef.current[0].liste[0].ref === null);

fixture = baueTransaktionsHarness({
  ...basis(),
  hooks: { vorArtikel: ({ artikelRef }) => { artikelRef.current = [...artikelRef.current, { id: "parallel", titel: "Parallel", liste: [] }]; } },
});
vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
ergebnis = await fixture.actions.loescheFilme(["a", "b"], { plan: vorschau });
check("Parallele Artikeländerung überschreibt keinen fremden Stand",
  ergebnis === false && fixture.writes.length === 0
  && fixture.artikelRef.current.some((artikel) => artikel.id === "parallel"));

fixture = baueTransaktionsHarness({
  ...basis(),
  hooks: { nachArtikelWrite: ({ masterRef }) => { masterRef.current = [...masterRef.current, { id: "parallel", titel: "Parallel" }]; } },
});
vorschau = fixture.actions.planeFilmLoeschungen(["a", "b"]);
ergebnis = await fixture.actions.loescheFilme(["a", "b"], { plan: vorschau });
check("Parallele Masteränderung nach dem ersten Write wird kompensiert und bleibt erhalten",
  ergebnis === false
  && fixture.masterRef.current.some((film) => film.id === "parallel")
  && fixture.writes.map((w) => w.topf).join(",") === "artikel,mustwatch,mustwatch,artikel");

fixture = baueTransaktionsHarness(basis());
ergebnis = await fixture.actions.loescheFilm("a", {});
check("Öffentlicher Einzelpfad delegiert nachweislich auf denselben gebundenen Batchvertrag",
  ergebnis && fixture.writes.map((w) => w.topf).join(",") === "artikel,mustwatch,master"
  && fixture.masterRef.current.map((film) => film.id).join(",") === "b,c");

setStorageDriver(localDriver);
console.log(`film_batch_contract_test: ${ok} Checks bestanden.`);
