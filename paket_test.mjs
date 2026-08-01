import {
  parsePaket, analysierePaket, bauePaketUebernahme, ingestionPrompt,
} from "./src/lib/paket.js";
import { BEWERTUNGSKATEGORIE_IDS } from "./src/lib/kategorien.js";

let gesamt = 0;
let gruen = 0;
const check = (name, ok) => {
  gesamt++;
  if (ok) { gruen++; console.log("✓ " + name); }
  else { console.error("✗ " + name); process.exitCode = 1; }
};

const paket = parsePaket(JSON.stringify({
  format: "kinodreieck-paket",
  version: 1,
  autor: "Alt-KI",
  quelle: "ki-ingestion",
  bereiche: {
    serien: [{
      titel: "Prime Altserie",
      jahr: 2020,
      typ: "serie",
      quelle: "prime",
      kategorie: "kult",
      bewertung: { wie: 4, was: 3, warum: 99 },
      begruendung: "Automatisch geschätzter Text.",
      geschaetzt: true,
    }, {
      titel: "Selbst bewertete Serie",
      jahr: 2021,
      typ: "serie",
      quelle: "prime",
      kategorie: "immer_gut",
      bewertung: { wie: 5, was: 4, warum: 3 },
      begruendung: "Von mir bewertet.",
      geschaetzt: false,
    }],
  },
}));

const fenced = parsePaket("Hier ist die Datei:\n```json\n" + JSON.stringify({
  format: "kinodreieck-paket", version: 1, autor: "Max", bereiche: { filme: [] },
}) + "\n```");
check("KI-Antwort mit JSON-Codeblock wird tolerant gelesen", fenced.format === "kinodreieck-paket");

const analyse = analysierePaket(paket, [], []);
const { neueFilme, report } = bauePaketUebernahme(analyse, ["serien"], [], []);
const alt = neueFilme.find((f) => f.titel === "Prime Altserie");
const echt = neueFilme.find((f) => f.titel === "Selbst bewertete Serie");

check("KI-Ingestion-Schätzung wird als unbewertet importiert",
  alt?.bewertung === null && alt?.kategorie === null && alt?.bewertet_von === null);
check("geschätzte Begründung gelangt nicht in die echte Filmbegründung",
  alt?.begruendung === "");
check("Schätzung bleibt getrennt und streng bereinigt in der Quarantäne erhalten",
  alt?.import_schaetzung?.format === "ki-ingestion-schaetzung-v1"
  && alt.import_schaetzung.bewertung.wie === 4
  && alt.import_schaetzung.bewertung.warum === null
  && alt.import_schaetzung.kategorie === "kult"
  && alt.import_schaetzung.begruendung === "Automatisch geschätzter Text.");
check("Importbericht zählt quarantänisierte Schätzungen",
  report.schaetzungenQuarantiniert === 1);
check("ausdrücklich selbst bewerteter KI-Ingestion-Eintrag bleibt echte Bewertung",
  echt?.bewertung?.wie === 5 && echt?.kategorie === "immer_gut"
  && echt?.bewertet_von === "Alt-KI" && !echt?.import_schaetzung);

const prompt = ingestionPrompt("Max");
check("Ingestion-Prompt verbietet automatische Bewertungen",
  prompt.includes("KEINE automatische oder geschätzte Bewertung")
  && !prompt.includes('"geschaetzt":true'));
check("Ingestion-Prompt führt genau das kanonische Kategorienvokabular",
  BEWERTUNGSKATEGORIE_IDS.every((id) => prompt.includes(id)));

console.log(`\n${gruen}/${gesamt} Paket-Checks bestanden.`);
if (gruen !== gesamt) process.exitCode = 1;
