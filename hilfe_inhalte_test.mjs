/* Kontraktprüfung für Hilfe-Inhalte, Suchverträge, UI-Quellen und Ziel-IDs. */
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { appHilfeAntwort } from "./src/lib/appHilfe.js";
import {
  HILFE_BEREICHE,
  HILFE_AKTIONEN,
  HILFE_ZIELE,
  HILFE_FALLBACK,
  validiereHilfeInhalte,
} from "./src/lib/hilfeInhalte.js";
import { QUELLEN } from "./src/lib/quellen.js";

const MODULWURZEL = process.env.KD_TEST_NODE_MODULES || path.join(process.cwd(), "node_modules");
const requireAusTestumgebung = createRequire(path.join(MODULWURZEL, "__kd_test_resolver__.cjs"));
let esbuild;
try {
  esbuild = requireAusTestumgebung("esbuild");
} catch {
  esbuild = requireAusTestumgebung("vite/node_modules/esbuild");
}

const checks = [];
const check = (name, pass) => checks.push([name, !!pass]);

const TEST_BUNDLE = path.join(
  tmpdir(),
  `.kd-appnavigation-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`,
);

const { NAVIGATION } = await (async () => {
  await esbuild.build({
    stdin: {
      contents: 'export { NAVIGATION } from "./src/components/AppNavigation.jsx";',
      resolveDir: process.cwd(),
      sourcefile: "kd-appnavigation-entry.js",
      loader: "js",
    },
    outfile: TEST_BUNDLE,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    nodePaths: [MODULWURZEL],
    logLevel: "silent",
  });

  const gebundelteNavigation = await import(pathToFileURL(TEST_BUNDLE).href);
  return gebundelteNavigation;
})();

const NAVIGATION_IDS = Array.isArray(NAVIGATION)
  ? NAVIGATION.map((eintrag) => String(eintrag?.id || ""))
  : [];

function cleanup() {
  try {
    requireAusTestumgebung("fs").unlinkSync(TEST_BUNDLE);
  } catch {
    // Aufräumen: kein sichtbarer Fehler, wenn der Test bereits beendet wurde.
  }
}

function normalisiereHilfeText(wert) {
  return String(wert ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("de-AT")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function answer(frage) {
  const result = appHilfeAntwort(frage);
  if (!result) return null;
  return {
    ...result,
    id: String(result.id),
    ziel: String(result.ziel || ""),
    bereichId: result.bereichId || null,
    text: String(result.text || ""),
  };
}

function enthältAlleWörter(text, worte) {
  return worte.every((wort) => text.includes(wort));
}

function wiederholeDreiMal(name, fn) {
  for (let durchlauf = 1; durchlauf <= 3; durchlauf += 1) {
    check(`${name} [${durchlauf}/3]`, fn(durchlauf));
  }
}

function checkAktion(frage, erwarteteId, namePrefix = frage) {
  return wiederholeDreiMal(namePrefix, () => {
    const result = answer(frage);
    const erwartet = AKTIONEN_NACH_ID.get(erwarteteId);
    if (!result || !erwartet) return false;
    return result.id === erwarteteId
      && result.ziel === erwartet.ziel
      && result.bereichId === erwartet.bereichId
      && result.text === erwartet.text;
  });
}

const BEREICHE_SET = new Set(HILFE_BEREICHE.map((bereich) => bereich.id));
const DIREKTE_WOERTER = new Set(HILFE_AKTIONEN.flatMap((aktion) => aktion.direkteSuchwoerter));
const EINWORT_UND_NICHT_DIREKT = new Set(
  HILFE_AKTIONEN
    .flatMap((aktion) => aktion.suchwoerter)
    .filter((wort) => !DIREKTE_WOERTER.has(wort) && !/\s/.test(wort)),
);
const AKTIONEN_NACH_ID = new Map(HILFE_AKTIONEN.map((aktion) => [aktion.id, aktion]));
const AKTIONEN_NACH_BEREICH = new Map();
for (const aktion of HILFE_AKTIONEN) {
  if (!AKTIONEN_NACH_BEREICH.has(aktion.bereichId)) AKTIONEN_NACH_BEREICH.set(aktion.bereichId, []);
  AKTIONEN_NACH_BEREICH.get(aktion.bereichId).push(aktion);
}

const HILFE_TEXT = HILFE_BEREICHE
  .concat(HILFE_AKTIONEN)
  .concat([HILFE_FALLBACK])
  .map((eintrag) => JSON.stringify(eintrag)
    .toLowerCase());

try {
  validiereHilfeInhalte();
  check("validiereHilfeInhalte() läuft ohne Exceptions", true);
} catch (error) {
  check("validiereHilfeInhalte() läuft ohne Exceptions", false);
}

const ERWARTETE_BEREICHE = [
  { id: "start", titel: "Start", ziel: "start" },
  { id: "kino", titel: "Kino", ziel: "kino" },
  { id: "mediathek", titel: "Mediathek", ziel: "mediathek" },
  { id: "streaming", titel: "Streaming", ziel: "streaming" },
  { id: "finder", titel: "Suche", ziel: "finder" },
  { id: "blog", titel: "Entdecken", ziel: "blog" },
  { id: "daten", titel: "Settings", ziel: "daten" },
];

const NAVIGATION_LABELS = NAVIGATION.map((eintrag) => String(eintrag?.label || ""));
const ERWARTETE_ZIEL_NAMEN = ERWARTETE_BEREICHE.map((bereich) => bereich.titel);
const ERWARTETE_ZIELE = NAVIGATION_IDS;

check(
  "Ziele aus Produkt-Quellen und HILFE_ZIELE sind identisch (inkl. Reihenfolge)",
  Array.isArray(NAVIGATION)
    && HILFE_ZIELE.length === ERWARTETE_BEREICHE.length
    && HILFE_ZIELE.length === NAVIGATION.length
    && HILFE_ZIELE.every((ziel, index) => ziel === ERWARTETE_ZIELE[index] && ziel === ERWARTETE_BEREICHE[index].id),
);

check(
  "Hilfe-Ziele entsprechen den AppNavigation-Labeln",
  NAVIGATION.length === ERWARTETE_BEREICHE.length
    && ERWARTETE_ZIEL_NAMEN.every((titel, index) => titel === NAVIGATION_LABELS[index]),
);

for (const bereich of HILFE_BEREICHE) {
  const keys = Object.keys(bereich);
  const erwartet = ERWARTETE_BEREICHE.find((eintrag) => eintrag.id === bereich.id);
  check(
    `Bereich ${bereich.id}: Pflichtfelder vollständig und stabil`,
    keys.length === 6
      && new Set(keys).has("id")
      && new Set(keys).has("titel")
      && new Set(keys).has("kurztext")
      && new Set(keys).has("details")
      && new Set(keys).has("suchwoerter")
      && new Set(keys).has("ziel")
      && BEREICHE_SET.has(bereich.id)
      && HILFE_ZIELE.includes(bereich.ziel)
      && !!erwartet
      && erwartet.ziel === bereich.ziel
      && erwartet.titel === bereich.titel,
  );
}

for (const aktion of HILFE_AKTIONEN) {
  const keys = Object.keys(aktion);
  const bereich = HILFE_BEREICHE.find((eintrag) => eintrag.id === aktion.bereichId);
  const erwartete = AKTIONEN_NACH_BEREICH.get(aktion.bereichId)?.find((eintrag) => eintrag.id === aktion.id);
  check(
    `Aktion ${aktion.id}: Pflichtfelder vollständig`,
    keys.length === 6
      && new Set(keys).has("id")
      && new Set(keys).has("titel")
      && new Set(keys).has("text")
      && new Set(keys).has("suchwoerter")
      && new Set(keys).has("direkteSuchwoerter")
      && new Set(keys).has("bereichId")
      && expectedActionDetailsValid(aktion)
      && !!bereich
      && !!erwartete,
  );
}

function expectedActionDetailsValid(aktion) {
  const schluessel = new Set(HILFE_AKTIONEN.map((eintrag) => eintrag.id));
  return schluessel.has(aktion.id)
    && aktion.suchwoerter.length > aktion.direkteSuchwoerter.length;
}

function kanonischerTerm(aktion) {
  const kandidat = (aktion?.direkteSuchwoerter?.[0] || aktion?.suchwoerter?.[0] || "").trim();
  return normalisiereHilfeText(kandidat);
}

function sindDisjunkt(a, b) {
  const woerterA = new Set(normalisiereHilfeText(a).split(" ").filter(Boolean));
  const woerterB = new Set(normalisiereHilfeText(b).split(" ").filter(Boolean));
  return [...woerterA].every((wort) => !woerterB.has(wort));
}

check(
  "Fallback: Feldkontrakt stabil",
  HILFE_FALLBACK
    && Object.keys(HILFE_FALLBACK).length === 5
    && Object.keys(HILFE_FALLBACK).every((feld) => new Set(["id", "titel", "text", "bereichId", "ziel"]).has(feld)),
);

check("BEREICHE: eindeutige IDs", new Set(HILFE_BEREICHE.map((bereich) => bereich.id)).size === HILFE_BEREICHE.length);
check("AKTIONEN: eindeutige IDs", new Set(HILFE_AKTIONEN.map((aktion) => aktion.id)).size === HILFE_AKTIONEN.length);
check("Direkte Suchwörter exakt 51", DIREKTE_WOERTER.size === 51);
check("Einwortige indirekte Suchwörter exakt 33", EINWORT_UND_NICHT_DIREKT.size === 33);

check(
  "Keine Operatorlecks in Hilfedaten",
  !HILFE_TEXT.some((text) => /kino_auto|streaming_auto|liefere_an_supabase|auto_log|fetch-job|fetch job|credits|credits-|quota|quota-/u.test(text)),
);
check(
  "Keine Roh-HTML-/Kontrollzeichen in Hilfedaten",
  HILFE_TEXT.every((text) => !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)),
);

const bereichNamen = HILFE_BEREICHE.map((bereich) => bereich.titel);
const mediathekDetails = (HILFE_BEREICHE.find((bereich) => bereich.id === "mediathek")?.details || []).join(" ").toLowerCase();
check("Name und Hilfetexte sind kanonisch",
  bereichNamen.length === 7 && bereichNamen.every((titel) => HILFE_BEREICHE.some((bereich) => bereich.titel === titel)),
);

check(
  "Mediathek-Details nennt die E12-Grundregeln",
  enthältAlleWörter(mediathekDetails, [
    "suche",
    "filter",
    "typ",
    "sortierung",
  ]),
);
check("Mediathek-Details benennt sichtbare Schnittmenge", enthältAlleWörter(mediathekDetails, [
  "sichtbare auswahl löschen",
  "sichtbare schnittmenge",
  "verborgene",
]));
check("Mediathek-Details nennt Vorschau und Referenzziel", enthältAlleWörter(mediathekDetails, ["vorschau nennt", "mediathek", "artikel", "must-watch"]));
check("Mediathek-Details ist lokal/referenziell/fail-safe formuliert", enthältAlleWörter(mediathekDetails, ["lokal", "referenziell", "fail-safe"]));
check(
  "Mediathek-Details verneint Crash-/Server-/Geräte-/ACID-Kombinationsgarantie",
  /keine\s+crash-/.test(mediathekDetails)
    && /server-/.test(mediathekDetails)
    && /geräteübergreifend/.test(mediathekDetails)
    && /\bacid\b/.test(mediathekDetails),
);
check("Spezifische Löschphrase gewinnt vor generischer Auswahl", answer("sichtbare auswahl löschen")?.id === "sichtbare-auswahl-loeschen");

const streamingAction = AKTIONEN_NACH_ID.get("streamingdienste-waehlen");
const STREAMING_PROVIDER_TERMS = new Set();
for (const quelle of QUELLEN) {
  const key = normalisiereHilfeText(quelle.key);
  const label = normalisiereHilfeText(quelle.label);
  const passt = !!streamingAction?.suchwoerter && (streamingAction.suchwoerter.includes(key) || streamingAction.suchwoerter.includes(label));
  if (passt) {
    STREAMING_PROVIDER_TERMS.add(key);
    STREAMING_PROVIDER_TERMS.add(label);
  }
}

const POSITIVE_FALLBACKS = [
  { query: "hilfe", erwarteteId: "allgemeine-hilfe" },
  { query: "anleitung", erwarteteId: "allgemeine-hilfe" },
];
for (const { query, erwarteteId } of POSITIVE_FALLBACKS) {
  wiederholeDreiMal(`${query} -> ${erwarteteId}`, () => {
    const result = answer(query);
    return !!result && result.id === erwarteteId;
  });
}

const POSITIVE_AKTIONEN = [
  { query: "Schriftgröße", erwarteteId: "schriftgroesse-aendern" },
  { query: "Wie kann ich die Schriftgröße ändern?", erwarteteId: "schriftgroesse-aendern" },
  { query: "Ich brauche Hilfe zur Schriftgröße", erwarteteId: "schriftgroesse-aendern" },
  { query: "Wie kann ich die Darstellung ändern?", erwarteteId: "darstellung-aendern" },
  { query: "Wie kann ich die Farben ändern?", erwarteteId: "darstellung-aendern" },
  { query: "Wie aendere ich meine Darstellung?", erwarteteId: "darstellung-aendern" },
  { query: "Wie aendere ich meine Farben?", erwarteteId: "darstellung-aendern" },
  { query: "Wie kann ich meine Darstellung aendern?", erwarteteId: "darstellung-aendern" },
  { query: "Wie kann ich meine Farben aendern?", erwarteteId: "darstellung-aendern" },
  { query: "Wie kann ich KI einstellen", erwarteteId: "ki-funktionen-einstellen" },
  { query: "Wie ändere ich mein Passwort?", erwarteteId: "konto-verwalten" },
  { query: "Wie stelle ich Prime Video ein?", erwarteteId: "streamingdienste-waehlen" },
  { query: "Settings Backup", erwarteteId: "daten-sichern" },
  { query: "Settings Startseite", erwarteteId: "startbereich-waehlen" },
  { query: "Settings sichtbare Auswahl löschen", erwarteteId: "sichtbare-auswahl-loeschen" },
  { query: "Hilfe zu sichtbare Auswahl löschen", erwarteteId: "sichtbare-auswahl-loeschen" },
  { query: "Wie kann ich die Darstellung ändern", erwarteteId: "darstellung-aendern" },
  { query: "Wie kann ich die Farben ändern", erwarteteId: "darstellung-aendern" },
  { query: "Wie kann ich die Schriftgröße ändern", erwarteteId: "schriftgroesse-aendern" },
  { query: "Wie kann ich die Schriftgröße aendern", erwarteteId: "schriftgroesse-aendern" },
  { query: "Wie kann ich eintrag erstellen", erwarteteId: "eintrag-erstellen" },
  { query: "wie kann ich den eintrag erstellen", erwarteteId: "eintrag-erstellen" },
];

for (const { query, erwarteteId } of POSITIVE_AKTIONEN) {
  checkAktion(query, erwarteteId, `${query} → ${erwarteteId}`);
}

for (const term of [...DIREKTE_WOERTER].sort()) {
  const aktion = HILFE_AKTIONEN.find((eintrag) => eintrag.direkteSuchwoerter.includes(term));
  const title = `Direktes Suchwort "${term}" bleibt stabil`;
  wiederholeDreiMal(title, () => {
    const result = answer(term);
    return !!result && !!aktion && result.id === aktion.id
      && result.bereichId === aktion.bereichId
      && result.ziel === aktion.ziel
      && result.text === aktion.text;
  });
}

for (const term of [...EINWORT_UND_NICHT_DIREKT].sort()) {
  const result = answer(`wie kann ich ${term}`);
  check(`Einwort-Indikator "${term}" bleibt erreichbar`, !!result);
}

for (const quelle of [...STREAMING_PROVIDER_TERMS]) {
  if (!quelle) continue;
  const erwarteteId = "streamingdienste-waehlen";
  check(`Streaming-Quelle ${quelle} bleibt an ` + `Streamingdienste gebunden`,
    answer(`wie kann ich ${quelle} einstellen`)?.id === erwarteteId,
  );
}

const MULTI_AKTIONEN = [
  "sichtbare-auswahl-loeschen",
  "konto-verwalten",
  "schriftgroesse-aendern",
  "darstellung-aendern",
  "ki-funktionen-einstellen",
  "eintrag-erstellen",
  "startbereich-waehlen",
  "daten-sichern",
];

const MULTI_AKTIONEN_DISJOINT = [];
for (const aktionId of MULTI_AKTIONEN) {
  const aktion = AKTIONEN_NACH_ID.get(aktionId);
  if (!aktion) continue;
  const term = kanonischerTerm(aktion);
  if (!term) continue;
  const bereitsDisjunkt = MULTI_AKTIONEN_DISJOINT.every((eintrag) => sindDisjunkt(term, eintrag.term));
  if (bereitsDisjunkt) {
    MULTI_AKTIONEN_DISJOINT.push({ id: aktionId, term });
  }
}

for (let start = 0; start < MULTI_AKTIONEN_DISJOINT.length; start += 1) {
  const erste = MULTI_AKTIONEN_DISJOINT[start];
  for (let next = start + 1; next < MULTI_AKTIONEN_DISJOINT.length; next += 1) {
    const zweite = MULTI_AKTIONEN_DISJOINT[next];
    const query = `wie kann ich ${erste.term} und ${zweite.term}`;
    check(`Disjunktive Mehraktionsfrage bleibt null (${erste.id}/${zweite.id})`, answer(query) === null);
  }
}

const FAIL_CLOSED = [
  "Wo finde ich Filme auf Netflix?",
  "Wo finde ich Nacht der Glut im Kino?",
  "Wo finde ich Zwei linke Pfoten auf Netflix?",
  "Netflix",
  "Prime",
  "Kino",
  "Anleitung zum Unglücklichsein",
  "Wie finde ich den Film Hilfe, ich bin ein Fisch?",
  "Wie funktioniert Netflix?",
  "Wie funktioniert Prime Video?",
  "Prime Video",
  "Suche den Film Daten sichern",
  "Wie stelle ich Netflix und Backup ein?",
  "Settings Konto Backup",
  "Settings Schriftgröße Darstellung ändern",
  "Wie ändere ich Schriftgröße Darstellung?",
  "Wie stelle ich das Passwort?",
];

for (const query of FAIL_CLOSED) {
  check(`Fail-closed (${query})`, answer(query) === null);
}

check("Ort- und Suchzielfrage bleibt auf Mediathek-Navigation stabil", answer("wo finde ich die mediathek")?.id === "finder" && answer("wo ist die mediathek")?.id === "finder");

check("Unicode-/ASCII-Änderungsgrenzen für Schriftgröße sind stabil", answer("wie kann ich die schriftgröße ändern")?.id === "schriftgroesse-aendern");
check("ASCII-Alternative bleibt kompatibel", answer("wie kann ich die schriftgroesse ändern")?.id === "schriftgroesse-aendern");
check("Possessiver Sprachmodus bleibt funktional", answer("wie kann ich meinen eintrag löschen")?.id === "eintrag-loeschen");
check("Keine Doppel-Verb-Wortsalat-Lösung", answer("wie kann ich die sichtbare auswahl löschen löschen") === null);

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  ok = ok && !!pass;
}

cleanup();
console.log(ok ? "HILFE_INHALTE-TEST BESTANDEN" : "HILFE_INHALTE-TEST FEHLGESCHLAGEN");
process.exit(ok ? 0 : 1);
