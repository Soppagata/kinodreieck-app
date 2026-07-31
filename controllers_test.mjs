/* Controller-Schnitt- und Bibliotheksprojektionstest. Rein lokal. */

import fs from "node:fs";
import {
  baueRefUniversum,
  baueKinoMatches,
  gueltigerArtikel,
} from "./src/lib/libraryProjection.js";
import { zeitpunkt, IMPORT_INFO } from "./src/lib/catalogProjection.js";

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
