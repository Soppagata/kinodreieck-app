/* Kostenfreier Laufzeitvertrag der Edge Function, ohne Deno, Supabase oder
   Anbieter. Prüft die herausgelöste Request-Grenze direkt. */

import fs from "node:fs";
import {
  AufrufFehler,
  CODES,
  FUNCTION_CONTRACT_VERSION,
  functionBuildVersion,
  klassifiziereAufgabe,
  NOCH_NICHT_GEBAUTE_AUFGABEN,
  RESERVIERTE_AUFGABEN,
  STATUS,
} from "./supabase/functions/ai-task/requestContract.ts";
import {
  baueAnbieterKoerper,
  schaetzeAnbieterEingabeTokens,
} from "./supabase/functions/ai-task/providerContract.ts";

let ok = 0;
function check(name, wert) {
  if (!wert) throw new Error("Fehlgeschlagen: " + name);
  ok++;
  console.log("✓ " + name);
}

check("Clientstabile Fehlercodes besitzen eindeutige HTTP-Status",
  Object.values(CODES).every((code) => Number.isInteger(STATUS[code]))
  && new Set(Object.values(CODES)).size === Object.values(CODES).length);
check("Reservierte Diagnosepfade sind ein geschlossener Vertrag",
  JSON.stringify(RESERVIERTE_AUFGABEN)
  === JSON.stringify(["health", "anbieter-modelle"]));
check("Health gewinnt vor einer kollidierenden Aufgabentabelle",
  klassifiziereAufgabe("health", true) === "health");
check("Anbietermodelle gewinnt vor einer kollidierenden Aufgabentabelle",
  klassifiziereAufgabe("anbieter-modelle", true) === "anbieter-modelle");
check("Normale registrierte Aufgabe wird als gebaut aufgelöst",
  klassifiziereAufgabe("film-forecast", true) === "gebaut");
check("Noch nicht gebaute Fachaufgabe meldet geplant",
  NOCH_NICHT_GEBAUTE_AUFGABEN.every((task) =>
    klassifiziereAufgabe(task, false) === "geplant"));
check("Unbekannte und leere Aufgaben erreichen keinen gebauten Pfad",
  klassifiziereAufgabe("frei-erfunden", false) === "unbekannt"
  && klassifiziereAufgabe("", false) === "unbekannt");
check("Function-Vertrag und Build-Version sind stabil und fail-closed",
  FUNCTION_CONTRACT_VERSION === "ai-task-v4"
  && functionBuildVersion("3898152") === "3898152"
  && functionBuildVersion("  341d76b  ") === "341d76b"
  && functionBuildVersion("mit leerzeichen") === "unversioned"
  && functionBuildVersion(null) === "unversioned");

const verbrauch = { modell: "m", inputTokens: 2, outputTokens: 3 };
const fehler = new AufrufFehler(
  CODES.AI_REFUSED,
  "anbieter-verweigert",
  verbrauch,
);
check("Aufruffehler trägt stabilen Grund und Verbrauchsmetadaten",
  fehler.name === "AufrufFehler"
  && fehler.code === CODES.AI_REFUSED
  && fehler.grund === "anbieter-verweigert"
  && fehler.verbrauch === verbrauch);

const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};
const anbieterKoerper = baueAnbieterKoerper(
  "modell",
  "system",
  "nutzerdaten",
  512,
  schema,
);
check("Pure Anbietergrenze baut den verbindlichen Structured-Output-Request",
  anbieterKoerper.model === "modell"
  && anbieterKoerper.max_tokens === 512
  && anbieterKoerper.output_config.format.schema === schema);
check("Kostenschätzung wird aus genau demselben Anbieterkoerper abgeleitet",
  schaetzeAnbieterEingabeTokens("modell", "system", "nutzerdaten", 512, schema)
  === Math.ceil(new TextEncoder().encode(JSON.stringify(anbieterKoerper)).length / 3) + 300);

const bild = { media_type: "image/jpeg", data: "QUJDRA==" };
const medienKoerper = baueAnbieterKoerper("modell", "system", "lesen", 512, schema, [bild]);
check("Medienauftrag stellt Bilder vor den Text und sendet Base64 nicht als Text",
  Array.isArray(medienKoerper.messages[0].content)
  && medienKoerper.messages[0].content[0].type === "image"
  && medienKoerper.messages[0].content[0].source.data === bild.data
  && medienKoerper.messages[0].content[1].text === "lesen");
check("Base64-Laenge wird nicht als Texteingabe reserviert",
  schaetzeAnbieterEingabeTokens("modell", "system", "lesen", 512, schema, [bild]) < 3000);

const index = fs.readFileSync("supabase/functions/ai-task/index.ts", "utf8");
check("Der Endpunkt importiert den Vertrag statt Fehlercodes zu duplizieren",
  /from\s+"\.\/requestContract\.ts"/.test(index)
  && !/const CODES\s*=\s*\{/.test(index)
  && !/class AufrufFehler extends Error/.test(index));
check("Anbieter-Nutzlast und Reservierungsschätzung sind aus dem Handler gelöst",
  /from\s+"\.\/providerContract\.ts"/.test(index)
  && !/export function baueAnbieterKoerper/.test(index)
  && !/export function schaetzeAnbieterEingabeTokens/.test(index));
check("Der Endpunkt verwendet denselben Routingvertrag überall",
  (index.match(/klassifiziereAufgabe\(/g) || []).length >= 3);

console.log(`function_contracts_test: ${ok} Checks bestanden.`);
