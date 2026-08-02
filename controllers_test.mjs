/* Controller-Schnitt- und Bibliotheksprojektionstest. Rein lokal. */

import fs from "node:fs";
import {
  baueRefUniversum,
  baueKinoMatches,
  gueltigerArtikel,
  planeFilmLoeschung,
} from "./src/lib/libraryProjection.js";
import { zeitpunkt, IMPORT_INFO } from "./src/lib/catalogProjection.js";
import { gruppiereDienstBadges } from "./src/lib/dienste.js";
import { appHilfeAntwort } from "./src/lib/appHilfe.js";

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

check("Katalogcontroller normalisiert ISO-Zeit und lehnt Müll ab",
  Number.isFinite(zeitpunkt("2026-07-31T12:00:00Z")) && zeitpunkt("kein Datum") === null);
const importInfo = IMPORT_INFO(123);
check("Manueller Import erbt weder Variante noch Fehler- oder Ablaufetikett",
  importInfo.stand === 123 && importInfo.variante === null
  && importInfo.code === null && importInfo.abgelaufen === false);

const app = fs.readFileSync("src/App.jsx", "utf8");
const onboarding = fs.readFileSync("src/controllers/onboardingController.js", "utf8");
const libraryController = fs.readFileSync("src/controllers/libraryController.js", "utf8");
const catalogController = fs.readFileSync("src/controllers/catalogController.js", "utf8");
for (const name of [
  "onboardingController",
  "catalogController",
  "libraryController",
  "useIntelligenceController",
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
check("App.jsx ist durch die Controller sichtbar schmaler als der Audit-Ausgang",
  app.split("\n").length < 2200);

console.log(`controllers_test: ${ok} Checks bestanden.`);
