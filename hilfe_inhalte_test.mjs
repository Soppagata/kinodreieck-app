/* Kontraktprüfung für Hilfe-Inhalte, Suchverträge, UI-Quellen und Ziel-IDs. */
import fs from "node:fs";
import path from "node:path";

import { appHilfeAntwort } from "./src/lib/appHilfe.js";
import {
  HILFE_BEREICHE,
  HILFE_AKTIONEN,
  HILFE_ZIELE,
  HILFE_FALLBACK,
  validiereHilfeInhalte,
} from "./src/lib/hilfeInhalte.js";

const checks = [];
const check = (name, pass) => checks.push([name, !!pass]);

const KONFIG = path.resolve(process.cwd());
const hilfeSheetSource = fs.readFileSync(path.join(KONFIG, "src/components/HilfeSheet.jsx"), "utf8");
const dokuSource = fs.readFileSync(path.join(KONFIG, "src/components/Erklaerstuecke.jsx"), "utf8");
const appSource = fs.readFileSync(path.join(KONFIG, "src/App.jsx"), "utf8");

const NAVIGATIONSZIELE = ["start", "kino", "mediathek", "streaming", "finder", "blog", "daten"];
const ERWARTETE_BEREICHE = [
  { id: "start", titel: "Start", ziel: "start" },
  { id: "kino", titel: "Kino", ziel: "kino" },
  { id: "mediathek", titel: "Mediathek", ziel: "mediathek" },
  { id: "streaming", titel: "Streaming", ziel: "streaming" },
  { id: "finder", titel: "Suche", ziel: "finder" },
  { id: "blog", titel: "Entdecken", ziel: "blog" },
  { id: "daten", titel: "Settings", ziel: "daten" },
];
const VERBOTE = [
  "kino_auto",
  "streaming_auto",
  "liefere_an_supabase",
  "auto_log",
  ".mjs",
  "fetch-job",
  "fetch job",
  "credits",
  "credits-",
  "quota",
  "quota-",
];

function tiefGefrohren(wert, besucht = new Set()) {
  if (!wert || typeof wert !== "object" || besucht.has(wert)) return true;
  if (!Object.isFrozen(wert)) return false;
  besucht.add(wert);
  if (Array.isArray(wert)) {
    return wert.every((eintrag) => tiefGefrohren(eintrag, besucht));
  }
  return Object.values(wert).every((eintrag) => tiefGefrohren(eintrag, besucht));
}

function flatText(wert) {
  if (wert == null) return [];
  if (typeof wert === "string") return [wert];
  if (Array.isArray(wert)) return wert.flatMap(flatText);
  if (typeof wert === "object") return Object.values(wert).flatMap(flatText);
  return [];
}

function answer(frage) {
  const result = appHilfeAntwort(frage);
  if (!result) return null;
  return {
    ...result,
    id: String(result.id),
    ziel: String(result.ziel || ""),
    text: String(result.text || ""),
    bereichId: result.bereichId || null,
  };
}

function enthältAlleWörter(text, worte) {
  return worte.every((wort) => text.includes(wort));
}

const BEREICHE_SCHLUESSEL = new Set(["id", "titel", "kurztext", "details", "suchwoerter", "ziel"]);
const AKTIONEN_SCHLUESSEL = new Set(["id", "titel", "text", "suchwoerter", "direkteSuchwoerter", "bereichId", "ziel"]);
const FALLBACK_SCHLUESSEL = new Set(["id", "titel", "text", "bereichId", "ziel"]);

const BEREICHE_SET = new Set(HILFE_BEREICHE.map((bereich) => bereich.id));
const DIREKTE_WOERTER = new Set(HILFE_AKTIONEN.flatMap((aktion) => aktion.direkteSuchwoerter));
const EINWORT_UND_NICHT_DIREKT = new Set(
  HILFE_AKTIONEN
    .flatMap((aktion) => aktion.suchwoerter)
    .filter((wort) => !DIREKTE_WOERTER.has(wort) && !/\s/.test(wort)),
);

const HILFE_TEXT = flatText([HILFE_BEREICHE, HILFE_AKTIONEN, HILFE_FALLBACK])
  .map((entry) => String(entry).toLowerCase());

try {
  validiereHilfeInhalte();
  check("validiereHilfeInhalte() läuft ohne Exceptions", true);
} catch (error) {
  check("validiereHilfeInhalte() läuft ohne Exceptions", false);
}

check(
  "BEREICHE: exakt 7 Einträge, in fixer Reihenfolge",
  HILFE_BEREICHE.length === ERWARTETE_BEREICHE.length
    && HILFE_BEREICHE.every((bereich, index) =>
      bereich.id === ERWARTETE_BEREICHE[index].id
      && bereich.titel === ERWARTETE_BEREICHE[index].titel
      && bereich.ziel === ERWARTETE_BEREICHE[index].ziel
    ),
);

check(
  "Ziele treffen genau die echte Navigation",
  HILFE_ZIELE.length === NAVIGATIONSZIELE.length
    && HILFE_ZIELE.every((ziel, index) => ziel === NAVIGATIONSZIELE[index]),
);

for (const bereich of HILFE_BEREICHE) {
  const keys = Object.keys(bereich);
  check(
    `Bereich ${bereich.id}: Pflichtfelder vollständig und stabil`,
    keys.length === BEREICHE_SCHLUESSEL.size
      && keys.every((feld) => BEREICHE_SCHLUESSEL.has(feld))
      && BEREICHE_SET.has(bereich.id)
      && NAVIGATIONSZIELE.includes(bereich.ziel),
  );
}

for (const aktion of HILFE_AKTIONEN) {
  const keys = Object.keys(aktion);
  const direkts = new Set(aktion.direkteSuchwoerter);
  const allw = new Set(aktion.suchwoerter);
  check(
    `Aktion ${aktion.id}: Pflichtfelder vollständig`,
    keys.length === AKTIONEN_SCHLUESSEL.size
      && keys.every((feld) => AKTIONEN_SCHLUESSEL.has(feld))
      && direkts.size === aktion.direkteSuchwoerter.length
      && [...direkts].every((wort) => allw.has(wort))
      && aktion.suchwoerter.length > aktion.direkteSuchwoerter.length
      && BEREICHE_SET.has(aktion.bereichId),
  );
}

check(
  "Fallback: Feldkontrakt stabil",
  HILFE_FALLBACK
    && Object.keys(HILFE_FALLBACK).length === FALLBACK_SCHLUESSEL.size
    && Object.keys(HILFE_FALLBACK).every((feld) => FALLBACK_SCHLUESSEL.has(feld)),
);

check("BEREICHE: eindeutige IDs", new Set(HILFE_BEREICHE.map((bereich) => bereich.id)).size === HILFE_BEREICHE.length);
check("AKTIONEN: eindeutige IDs", new Set(HILFE_AKTIONEN.map((aktion) => aktion.id)).size === HILFE_AKTIONEN.length);
check("Direkte Suchwörter exakt 51", DIREKTE_WOERTER.size === 51);
check("Einwortige indirekte Suchwörter exakt 33", EINWORT_UND_NICHT_DIREKT.size === 33);
check(
  "HILFE-Daten sind deep-frozen bis in den Unterbaum",
  tiefGefrohren(HILFE_BEREICHE) && tiefGefrohren(HILFE_AKTIONEN) && tiefGefrohren(HILFE_FALLBACK),
);
check(
  "Keine Operatorlecks in Hilfedaten",
  VERBOTE.every((token) => !HILFE_TEXT.some((text) => text.includes(token.toLowerCase()))),
);
check(
  "Keine Roh-HTML-/Kontrollzeichen in Hilfedaten",
  HILFE_TEXT.every((text) => !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)),
);

check(
  "HilfeSheet liest Titel/Ziele direkt aus HILFE_BEREICHE",
  /HILFE_BEREICHE\.map/.test(hilfeSheetSource)
    && /data-hilfe-ziel=\{bereich\.ziel\}/.test(hilfeSheetSource)
    && /{bereich\.titel}/.test(hilfeSheetSource),
);
check(
  "Doku-Ansicht liest Titel/Ziele direkt aus HILFE_BEREICHE",
  /HILFE_BEREICHE\.map/.test(dokuSource)
    && /<summary>/.test(dokuSource)
    && /<h3>\{bereich\.titel\}<\/h3>/.test(dokuSource)
    && /data-hilfe-ziel=\{bereich\.ziel\}/.test(dokuSource),
);
check(
  "Drei Konsumenten beziehen Namen/Ziele aus derselben Quelle",
  /HILFE_BEREICHE\.map/.test(hilfeSheetSource)
    && /HILFE_BEREICHE\.map/.test(dokuSource)
    && /<HilfeSheet/.test(appSource)
    && /const \[hilfeOffen/.test(appSource),
);
check(
  "Keine harte globale Titel-Hardcoding in Konsumenten",
  !/titel\s*:\s*["'][^"']*["']/.test(hilfeSheetSource)
    && !/titel\s*:\s*["'][^"']*["']/.test(dokuSource),
);
const EINWORT_AUSNAHMEN = new Set(["netflix", "prime"]);
check(
  "App-Callback für Hilfe ist stabiler useCallback",
  /const\s+schliesseHilfe\s*=\s*useCallback\(\(\)\s*=>\s*setHilfeOffen\(false\),\s*\[\]\)/.test(appSource),
);

const bereichNamen = HILFE_BEREICHE.map((bereich) => bereich.titel);
const mediathekDetails = (HILFE_BEREICHE.find((bereich) => bereich.id === "mediathek")?.details || []).join(" ").toLowerCase();

for (const [query, erwartet] of [
  ["hilfe", "allgemeine-hilfe"],
  ["anleitung", "allgemeine-hilfe"],
  ["wie kann ich eintrag erstellen", "eintrag-erstellen"],
  ["wie kann ich den eintrag erstellen", "eintrag-erstellen"],
  ["wo finde ich die schriftgröße", "schriftgroesse-aendern"],
  ["settings", "daten"],
  ["einstellungen", "daten"],
  ["wie kann ich mein konto verwalten", "konto-verwalten"],
]) {
  const resultat = answer(query);
  check(`Determinismus: ${query} → ${erwartet}`, resultat?.id === erwartet);
}

for (const term of [...DIREKTE_WOERTER].sort()) {
  const direct = answer(term);
  const action = HILFE_AKTIONEN.find((aktion) => aktion.direkteSuchwoerter.includes(term));
  check(
    `Direktes Suchwort "${term}" bleibt stabil`,
    !!direct && !!action && direct.id === action.id && direct.ziel === action.ziel && typeof direct.text === "string",
  );
}

for (const term of [...EINWORT_UND_NICHT_DIREKT].sort()) {
  if (EINWORT_AUSNAHMEN.has(term)) continue;
  const resultat = answer(`wie kann ich ${term}`);
  check(`Einwort-Indikator "${term}" bleibt erreichbar`, !!resultat);
}

check("Mediathek-Details nennt die E12-Grundregeln", enthältAlleWörter(mediathekDetails, [
  "suche",
  "filter",
  "typ",
  "sortierung",
]));
check("Mediathek-Details benennt die sichtbare Schnittmenge", enthältAlleWörter(mediathekDetails, ["sichtbare auswahl löschen", "sichtbare schnittmenge", "verborgene"]));
check("Mediathek-Details nennt Vorschau und Referenzziel", enthältAlleWörter(mediathekDetails, ["vorschau nennt", "mediathek", "artikel", "must-watch"]));
check("Mediathek-Details ist lokal/referenziell/fail-safe formuliert", enthältAlleWörter(mediathekDetails, ["lokal", "referenziell", "fail-safe"]));
check("Mediathek-Details verneint Crash-/Server-/Geräte-/ACID-Kombinationsgarantie", /keine\s+crash-/.test(mediathekDetails) && /server-/.test(mediathekDetails)
  && /geräteübergreifend/.test(mediathekDetails) && /\bacid\b/.test(mediathekDetails));
check("Spezifische Löschphrase gewinnt vor generischer Auswahl", answer("sichtbare auswahl löschen")?.id === "sichtbare-auswahl-loeschen");
check("Diverse Zwei-Aktionsanfragen sind disjunkt", [
  answer("wie kann ich die sichtbare auswahl löschen und mein konto verwalten"),
  answer("eintrag erstellen und sichtbare auswahl löschen"),
  answer("wie kann ich den eintrag erstellen und den gesehen status"),
  answer("wie kann ich gesehen markieren und streamingdienste waehlen"),
  answer("wie kann ich mein konto verwalten und ki funktionen einstellen"),
  answer("wie kann ich den gesehen status und die sichtbare auswahl löschen"),
].every((r) => r === null));

check("Provider-Pfade werden getrennt behandelt", answer("wie kann ich netflix einstellen")?.id === "streamingdienste-waehlen");
check("Prime-Video wird als separate Providerabfrage behandelt", answer("wie kann ich prime video einstellen")?.id === "streamingdienste-waehlen");
check("Ort und Ziel für Suche sind stabil", answer("wo finde ich die mediathek")?.id === "mediathek" && answer("wo ist die mediathek")?.id === "mediathek");

check("Unicode-/ASCII-Änderungsgrenzen", answer("wie kann ich die schriftgröße ändern")?.id === "schriftgroesse-aendern");
check("ASCII-Variante bleibt kompatibel", answer("wie kann ich die schriftgroesse ändern")?.id === "schriftgroesse-aendern");
check("ASCII-Alternative bleibt kompatibel", answer("wie kann ich die schriftgroesse aendern")?.id === "schriftgroesse-aendern");
check("Possessiver Sprachmodus bleibt funktional", answer("wie kann ich meinen eintrag löschen")?.id === "eintrag-loeschen");
check("Keine Doppel-Verb-Wortsalat-Lösung", answer("wie kann ich die sichtbare auswahl löschen löschen") === null);
check("Providerfälle bleiben getrennt und neutral behandelt", answer("wie kann ich netflix einstellen")?.id === "streamingdienste-waehlen"
  && answer("wie kann ich prime video einstellen")?.id === "streamingdienste-waehlen");

check("Name- und Hilfetexte sind kanonisch", bereichNamen.length === 7 && bereichNamen.every((titel) => HILFE_BEREICHE.some((bereich) => bereich.titel === titel)));

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? "HILFE_INHALTE-TEST BESTANDEN" : "HILFE_INHALTE-TEST FEHLGESCHLAGEN");
process.exit(ok ? 0 : 1);
