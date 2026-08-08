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
  ANBIETER_BILD_BASE64_MAX_ZEICHEN_GESAMT,
  ANBIETER_BILD_MAX_ANZAHL,
  ANBIETER_OWNER_PREISBODEN_USD_CENT_PRO_MTOK,
  ANBIETER_REQUEST_MAX_USD_CENT,
  ANBIETER_REQUEST_TIMEOUT_MAX_MS,
  ANBIETER_INTERNE_TOKEN_RESERVE,
  anbieterOwnerPreisboden,
  anbieterBildTokenMax,
  baueAnbieterKoerper,
  liesAnbieterRequestTimeoutMs,
  pruefeAnbieterKostenzaun,
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
  === new TextEncoder().encode(JSON.stringify(anbieterKoerper)).length
    + ANBIETER_INTERNE_TOKEN_RESERVE);

/* Vollstaendige, lesbare 1x1-PNG-Datei statt bloss syntaktischem Base64. */
const bild = {
  media_type: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
};
const medienKoerper = baueAnbieterKoerper("modell", "system", "lesen", 512, schema, [bild]);
check("Medienauftrag stellt Bilder vor den Text und sendet Base64 nicht als Text",
  Array.isArray(medienKoerper.messages[0].content)
  && medienKoerper.messages[0].content[0].type === "image"
  && medienKoerper.messages[0].content[0].source.data === bild.data
  && medienKoerper.messages[0].content[1].text === "lesen");
const haikuBildTokens = schaetzeAnbieterEingabeTokens(
  "claude-haiku-4-5-20251001", "system", "lesen", 512, schema, [bild],
);
check("Bekannte Bildmodelle reservieren den vollen offiziellen Vision-Tierdeckel",
  anbieterBildTokenMax("claude-haiku-4-5-20251001") === 1568
  && anbieterBildTokenMax("claude-sonnet-5") === 4784
  && Number.isFinite(haikuBildTokens)
  && haikuBildTokens >= 1568 + ANBIETER_INTERNE_TOKEN_RESERVE);
check("Unbekannte, formfremde, zu viele oder uebergrosse Bilder fallen geschlossen aus",
  ANBIETER_BILD_MAX_ANZAHL === 3
  && ANBIETER_BILD_BASE64_MAX_ZEICHEN_GESAMT === 900000
  && schaetzeAnbieterEingabeTokens("modell", "system", "lesen", 512, schema, [bild])
    === Number.POSITIVE_INFINITY
  && schaetzeAnbieterEingabeTokens(
    "claude-haiku-4-5", "system", "lesen", 512, schema,
    [{ ...bild, data: "nicht base64" }],
  ) === Number.POSITIVE_INFINITY
  && schaetzeAnbieterEingabeTokens(
    "claude-haiku-4-5", "system", "lesen", 512, schema,
    [{ ...bild, data: "QUJDRA==" }],
  ) === Number.POSITIVE_INFINITY
  && schaetzeAnbieterEingabeTokens(
    "claude-haiku-4-5", "system", "lesen", 512, schema,
    Array.from({ length: 4 }, () => bild),
  ) === Number.POSITIVE_INFINITY
  && schaetzeAnbieterEingabeTokens(
    "claude-haiku-4-5", "system", "lesen", 512, schema,
    [{ ...bild, data: "A".repeat(ANBIETER_BILD_BASE64_MAX_ZEICHEN_GESAMT + 4) }],
  ) === Number.POSITIVE_INFINITY);
check("Owner-Preisboden sperrt DB-Unterpreise und unbekannte Modellfamilien konzeptionell aus",
  ANBIETER_OWNER_PREISBODEN_USD_CENT_PRO_MTOK["claude-haiku-4-5"].out === 500
  && anbieterOwnerPreisboden("claude-haiku-4-5-20251001")?.in === 100
  && anbieterOwnerPreisboden("claude-sonnet-5")?.in === 300
  && anbieterOwnerPreisboden("claude-sonnet-5")?.out === 1500
  && anbieterOwnerPreisboden("claude-sonnet-5-future-expensive") === null
  && anbieterOwnerPreisboden("claude-frei-erfunden") === null);
check("Jeder zahlende Anbieterrequest besitzt vor dem Netz einen unverrueckbaren 500-Cent-Zaun",
  ANBIETER_REQUEST_MAX_USD_CENT === 500
  && pruefeAnbieterKostenzaun(500, 500).erlaubt === true
  && pruefeAnbieterKostenzaun(500.000001, 500).erlaubt === false
  && pruefeAnbieterKostenzaun(1, 500.000001).konfigurationGueltig === false);
check("Engere Task-Caps bleiben wirksam und Pflicht-Caps fallen geschlossen aus",
  pruefeAnbieterKostenzaun(4, 500, 4, true).erlaubt === true
  && pruefeAnbieterKostenzaun(4.000001, 500, 4, true).erlaubt === false
  && pruefeAnbieterKostenzaun(1, 500, undefined, true).konfigurationGueltig === false);
check("Provider-Zeitgrenze ist ganzzahlig, positiv und unabhaengig von Konfiguration gedeckelt",
  ANBIETER_REQUEST_TIMEOUT_MAX_MS === 135000
  && liesAnbieterRequestTimeoutMs(120000) === 120000
  && liesAnbieterRequestTimeoutMs(135001) === null
  && liesAnbieterRequestTimeoutMs("120000") === null);

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
const providerPfad = index.slice(
  index.indexOf("async function rufeAnbieter"),
  index.indexOf("function preisFuer"),
);
const modellDiagnosePfad = index.slice(
  index.indexOf("const diagUhr = new AbortController"),
  index.indexOf("const liste = ((daten as", index.indexOf("const diagUhr = new AbortController")),
);
check("Provider-Timeout bleibt bis nach dem Lesen des Antwortkoerpers aktiv",
  providerPfad.indexOf("daten = await antwort.json();")
      < providerPfad.indexOf("clearTimeout(stopp);")
  && providerPfad.includes("uhr.signal.aborted")
  && modellDiagnosePfad.indexOf("daten = await antwort.json();")
      < modellDiagnosePfad.indexOf("clearTimeout(diagStopp);")
  && modellDiagnosePfad.includes("diagUhr.signal.aborted")
  && !providerPfad.includes("antwort.json().catch(() => null)"));

console.log(`function_contracts_test: ${ok} Checks bestanden.`);
