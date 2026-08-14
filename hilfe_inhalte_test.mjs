/* Kontraktprüfung für Hilfe-Inhalte, Suchverträge, UI-Quellen und Ziel-IDs. */
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { appHilfeAntwort } from "./src/lib/appHilfe.js";
import {
  normalisiereHilfeText,
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
  `.kd-hilfe-inhalte-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`,
);

function cleanup() {
  try {
    fs.unlinkSync(TEST_BUNDLE);
  } catch {
    // Aufräumen, falls Datei schon weg ist.
  }
}

function istGefrorenUndTief(wert, besucht = new Set()) {
  if (!wert || typeof wert !== "object") return true;
  if (besucht.has(wert)) return true;
  if (!Object.isFrozen(wert)) return false;
  besucht.add(wert);
  const kinder = Array.isArray(wert) ? wert : Object.values(wert);
  return kinder.every((eintrag) => istGefrorenUndTief(eintrag, besucht));
}

function arraysGleich(a, b) {
  if (a.length !== b.length) return false;
  return a.every((wert, index) => wert === b[index]);
}

function hatAntwortSchema(ergebnis) {
  if (!ergebnis || typeof ergebnis !== "object" || Array.isArray(ergebnis)) return false;
  const keys = Object.keys(ergebnis).sort();
  const erwartet = ["bereichId", "bereichTitel", "id", "titel", "text", "ziel"];
  if (keys.length !== erwartet.length) return false;
  return erwartet.every((feld, index) => keys[index] === feld)
    && keys.every((feld) => typeof ergebnis[feld] === "string" && ergebnis[feld].trim().length > 0);
}

function antwortSchemaSicher(ergebnis, expected) {
  if (!hatAntwortSchema(ergebnis)) return false;
  return ["id", "titel", "text", "ziel", "bereichId", "bereichTitel"]
    .every((feld) => ergebnis[feld] === String(expected?.[feld] || ""));
}

function containsAllWords(text, woerter) {
  return woerter.every((wort) => text.includes(wort));
}

function buildSignalwoerter(aktion) {
  const basis = new Set((aktion?.suchwoerter || []).map((wort) => normalisiereHilfeText(wort)).filter(Boolean));
  const alias = new Set(basis);
  for (const quelle of QUELLEN) {
    const key = normalisiereHilfeText(quelle.key);
    const label = normalisiereHilfeText(quelle.label);
    if (basis.has(key) || basis.has(label)) {
      if (key) alias.add(key);
      if (label) alias.add(label);
    }
  }
  return alias;
}

function antwortVon(frage) {
  const result = appHilfeAntwort(frage);
  if (!result) return null;
  const bereich = BEREICHE_BY_ID.get(result.bereichId);
  return {
    id: String(result.id || ""),
    titel: String(result.titel || ""),
    text: String(result.text || ""),
    ziel: String(result.ziel || ""),
    bereichId: String(result.bereichId || ""),
    bereichTitel: String(result.bereichTitel || bereich?.titel || ""),
  };
}

function erwartungAusAktion(aktion) {
  return {
    id: String(aktion.id || ""),
    titel: String(aktion.titel || ""),
    text: String(aktion.text || ""),
    ziel: String(aktion.ziel || ""),
    bereichId: String(aktion.bereichId || ""),
    bereichTitel: String(BEREICHE_BY_ID.get(aktion.bereichId)?.titel || ""),
  };
}

function erwartungAusBereich(bereich) {
  return {
    id: String(bereich.id || ""),
    titel: String(bereich.titel || ""),
    text: String(bereich.kurztext || ""),
    ziel: String(bereich.ziel || ""),
    bereichId: String(bereich.id || ""),
    bereichTitel: String(bereich.titel || ""),
  };
}

function repeatThree(name, fn) {
  for (let durchlauf = 1; durchlauf <= 3; durchlauf += 1) {
    check(`${name} [${durchlauf}/3]`, fn(durchlauf));
  }
}

let NAVIGATION;
let buildLoadError;
try {
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

  ({ NAVIGATION } = await import(pathToFileURL(TEST_BUNDLE).href));
} catch (error) {
  buildLoadError = error;
}

const NAVIGATION_IDS = Array.isArray(NAVIGATION) ? NAVIGATION.map((eintrag) => String(eintrag?.id || "")) : [];
const NAVIGATION_LABELS = Array.isArray(NAVIGATION) ? NAVIGATION.map((eintrag) => String(eintrag?.label || "")) : [];

const BEREICHE_BY_ID = new Map(HILFE_BEREICHE.map((bereich) => [bereich.id, bereich]));
const BEREICHE_IDS = HILFE_BEREICHE.map((bereich) => bereich.id);
const BEREICHE_ZIEL = HILFE_BEREICHE.map((bereich) => bereich.ziel);
const BEREICHE_TITEL = HILFE_BEREICHE.map((bereich) => bereich.titel);
const AKTIONEN_BY_ID = new Map(HILFE_AKTIONEN.map((aktion) => [aktion.id, aktion]));

const BEREICHE_SET = new Set(BEREICHE_IDS);
const BEREICHE_TITEL_SET = new Set(BEREICHE_TITEL);
const AKTIONS_SET = new Set(HILFE_AKTIONEN.map((aktion) => aktion.id));

const DIREKTE_AKTIONEN = HILFE_AKTIONEN.flatMap((aktion) =>
  (aktion.direkteSuchwoerter || []).map((term) => ({
    term: normalisiereHilfeText(term),
    aktion,
  })).filter((eintrag) => !!eintrag.term),
);

const DIREKTE_TERME_EINDEUTIG = new Set(DIREKTE_AKTIONEN.map((eintrag) => eintrag.term));

const DIREKTE_FORMS = [
  { name: "direkt", query: (e) => e },
  { name: "hilfe zu", query: (e) => `hilfe zu ${e}` },
  { name: "settings", query: (e) => `settings ${e}` },
  { name: "wie kann ich", query: (e) => `wie kann ich ${e}` },
  { name: "wo finde ich", query: (e) => `wo finde ich ${e}` },
];

const PROVIDER_ALIAS_BY_NORMALISIERT = new Map();
for (const quelle of QUELLEN) {
  for (const alias of [quelle.key, quelle.label]) {
    const norm = normalisiereHilfeText(alias);
    if (!norm || PROVIDER_ALIAS_BY_NORMALISIERT.has(norm)) continue;
    PROVIDER_ALIAS_BY_NORMALISIERT.set(norm, alias);
  }
}

const PROVIDER_ALIASE = [...PROVIDER_ALIAS_BY_NORMALISIERT.entries()];
const STREAMING_AKTION = AKTIONEN_BY_ID.get("streamingdienste-waehlen");
const STREAMING_SIGNALWORTE = STREAMING_AKTION ? buildSignalwoerter(STREAMING_AKTION) : new Set();

const HILFE_TEXT = HILFE_BEREICHE
  .concat(HILFE_AKTIONEN)
  .concat([HILFE_FALLBACK])
  .flatMap((eintrag) => [
    JSON.stringify(eintrag).toLowerCase(),
    ...String(eintrag?.details || "").toLowerCase().split("\n"),
  ]);

try {
  validiereHilfeInhalte();
  check("validiereHilfeInhalte() läuft ohne Exceptions", true);
} catch (error) {
  check("validiereHilfeInhalte() läuft ohne Exceptions", false);
}

check("HILFE_ZIELE entspricht gefrorenem Bereichsfluss im selben Reihenfolge-Index", Array.isArray(HILFE_ZIELE)
  && HILFE_ZIELE.length === HILFE_BEREICHE.length
  && arraysGleich(HILFE_ZIELE, BEREICHE_IDS));
check("App-Navigation und Hilfe-Ziele sind vollständig konsistent", Array.isArray(NAVIGATION)
  && arraysGleich(NAVIGATION_IDS, HILFE_ZIELE)
  && arraysGleich(BEREICHE_IDS, NAVIGATION_IDS));
check("App-Navigation-Label-Contract matcht Hilfe-Titel", arraysGleich(BEREICHE_TITEL, NAVIGATION_LABELS));

check("Bereichsvertrag: Deep-Freeze", istGefrorenUndTief(HILFE_BEREICHE));
check("Aktionsvertrag: Deep-Freeze", istGefrorenUndTief(HILFE_AKTIONEN));
check("Fallback-Vertrag: Deep-Freeze", istGefrorenUndTief(HILFE_FALLBACK));

check("Bereiche besitzen exakt 6 Felder", HILFE_BEREICHE.length > 0 && HILFE_BEREICHE.every((bereich) => {
  const keys = new Set(Object.keys(bereich));
  const erwartet = new Set(["id", "titel", "kurztext", "details", "suchwoerter", "ziel"]);
  return keys.size === 6
    && [...keys].every((feld) => erwartet.has(feld))
    && erwartet.every((feld) => keys.has(feld));
}));

check("Bereichs-ID-/Zielvertrag ist stabil", new Set(BEREICHE_IDS).size === BEREICHE_IDS.length
  && new Set(BEREICHE_ZIEL).size === BEREICHE_ZIEL.length
  && BEREICHE_ZIEL.every((ziel) => BEREICHE_SET.has(ziel))
);
check("Bereichstexte sind eindeutig und kanonisch", BEREICHE_TITEL.length === BEREICHE_TITEL_SET.size);

for (const bereich of HILFE_BEREICHE) {
  const keys = new Set(Object.keys(bereich));
  const erwartet = new Set(["id", "titel", "kurztext", "details", "suchwoerter", "ziel"]);
  check(`Bereich ${bereich.id}: Pflichtfelder vollständig`, keys.size === 6
    && [...keys].every((feld) => erwartet.has(feld))
    && erwartet.every((feld) => keys.has(feld))
    && BEREICHE_SET.has(bereich.id)
    && bereich.ziel === bereich.id);
}

check("Aktionen besitzen exakt 7 Felder", HILFE_AKTIONEN.length > 0 && HILFE_AKTIONEN.every((aktion) => {
  const keys = new Set(Object.keys(aktion));
  const erwartet = new Set(["id", "titel", "text", "suchwoerter", "direkteSuchwoerter", "bereichId", "ziel"]);
  return keys.size === 7
    && [...keys].every((feld) => erwartet.has(feld))
    && erwartet.every((feld) => keys.has(feld));
}));

for (const aktion of HILFE_AKTIONEN) {
  const bereich = BEREICHE_BY_ID.get(aktion.bereichId);
  const direktSet = new Set((aktion.direkteSuchwoerter || []).map((term) => normalisiereHilfeText(term)).filter(Boolean));
  const suchSet = new Set((aktion.suchwoerter || []).map((term) => normalisiereHilfeText(term)).filter(Boolean));
  check(`Aktion ${aktion.id}: Pflichtfelder, Bereich und Ziel sind stabil`, !!bereich
    && AKTIONS_SET.has(aktion.id)
    && aktion.bereichId === bereich.id
    && aktion.ziel === bereich.id);
  check(`Aktion ${aktion.id}: direkteSuchwoerter ist echte nicht-leere Teilmenge`, direktSet.size > 0
    && direktSet.size < suchSet.size
    && [...direktSet].every((term) => suchSet.has(term)));
}

check("Fallback enthält exakt 5 Pflichtfelder", HILFE_FALLBACK
  && Object.keys(HILFE_FALLBACK).length === 5
  && ["id", "titel", "text", "bereichId", "ziel"]
    .every((feld) => Object.hasOwn(HILFE_FALLBACK, feld)));

check("direkte Suchbegriffe sind vollständig", DIREKTE_AKTIONEN.length === 51);
check("direkte Suchbegriffe sind eindeutig", DIREKTE_TERME_EINDEUTIG.size === DIREKTE_AKTIONEN.length);

for (const bereich of HILFE_BEREICHE) {
  const expected = erwartungAusBereich(bereich);
  for (const query of [
    `wo finde ich die ${normalisiereHilfeText(bereich.titel).replace(/\s+/g, " ")}`,
    `wo ist die ${normalisiereHilfeText(bereich.titel).replace(/\s+/g, " ")}`,
  ]) {
    repeatThree(`Bereich-Abfrage ${query}`, () => antwortSchemaSicher(antwortVon(query), expected));
  }
}

const mediathekErwartung = erwartungAusBereich(BEREICHE_BY_ID.get("mediathek"));
check("Canonicaler Mediatherk-Bereich direkt erkannt (wie finde ich die Mediathek)",
  mediathekErwartung
    ? antwortSchemaSicher(antwortVon("wo finde ich die mediathek"), mediathekErwartung)
    : false,
);
check("Canonicaler Mediatherk-Bereich direkt erkannt (wie ist die Mediathek)",
  mediathekErwartung
    ? antwortSchemaSicher(antwortVon("wo ist die mediathek"), mediathekErwartung)
    : false,
);

for (const { query, expectedId } of [
  { query: "hilfe", expectedId: "allgemeine-hilfe" },
  { query: "anleitung", expectedId: "allgemeine-hilfe" },
]) {
  const fallback = HILFE_FALLBACK;
  const bereich = BEREICHE_BY_ID.get(fallback?.bereichId);
  repeatThree(`Fallback ${query}`, () => antwortSchemaSicher(antwortVon(query), {
    id: fallback.id,
    titel: fallback.titel,
    text: fallback.text,
    ziel: fallback.ziel,
    bereichId: fallback.bereichId,
    bereichTitel: bereich?.titel || "",
  }));
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
  { query: "Wie kann ich die schriftgröße aendern", erwarteteId: "schriftgroesse-aendern" },
  { query: "Wie kann ich eintrag erstellen", erwarteteId: "eintrag-erstellen" },
  { query: "wie kann ich den eintrag erstellen", erwarteteId: "eintrag-erstellen" },
];

for (const { query, erwarteteId } of POSITIVE_AKTIONEN) {
  const aktion = AKTIONEN_BY_ID.get(erwarteteId);
  if (!aktion || !BEREICHE_BY_ID.has(aktion.bereichId)) {
    check(`Positiv: ${query}`, false);
    continue;
  }

  const expected = erwartungAusAktion(aktion);
  repeatThree(`Positiv ${query}`, () => antwortSchemaSicher(antwortVon(query), expected));
}

for (const { term, aktion } of DIREKTE_AKTIONEN) {
  const expected = erwartungAusAktion(aktion);
  for (const form of DIREKTE_FORMS) {
    repeatThree(`Direkt (${form.name}) ${aktion.id}: ${term}`, () => {
      const query = form.query(term);
      return antwortSchemaSicher(antwortVon(query), expected);
    });
  }
}

for (const [norm, alias] of PROVIDER_ALIASE) {
  const frage = `wie kann ich ${alias} einstellen`;
  if (STREAMING_SIGNALWORTE.has(norm)) {
    const expected = erwartungAusAktion(STREAMING_AKTION);
    repeatThree(`Provider-Einstellung ${alias}`, () => antwortSchemaSicher(antwortVon(frage), expected));
  } else {
    check(`Provider-Neutral ${alias}`, antwortVon(frage) === null);
  }
}

for (const query of ["wie kann ich netflix", "wie kann ich prime", "wie kann ich prime video"]) {
  repeatThree(`Provider ohne Einstellform bleibt null (${query})`, () => antwortVon(query) === null);
}

for (const query of ["Wie finde ich den Film Hilfe, ich bin ein Fisch?"]) {
  check(`Fail-closed (${query})`, antwortVon(query) === null);
}

const KANONISCHE_AKTIONEN = HILFE_AKTIONEN
  .map((aktion) => {
    const term = normalisiereHilfeText(aktion.direkteSuchwoerter?.[0] || "");
    return term ? { id: aktion.id, term } : null;
  })
  .filter(Boolean);

const SAME_ID_BELEGSFALTE = KANONISCHE_AKTIONEN
  .map(({ id }) => {
    const aktion = AKTIONEN_BY_ID.get(id);
    const direkte = (aktion?.direkteSuchwoerter || [])
      .map((term) => normalisiereHilfeText(term))
      .filter(Boolean);
    if (direkte.length < 2) return null;
    return {
      id,
      query: `wie kann ich ${direkte[0]} ${direkte[1]}`,
      expected: erwartungAusAktion(aktion),
    };
  })
  .filter(Boolean)
  .slice(0, 3);

const OVERLAP_BELEGSFALTE = SAME_ID_BELEGSFALTE
  .map(({ id, expected }) => {
    const aktion = AKTIONEN_BY_ID.get(id);
    const bereich = BEREICHE_BY_ID.get(aktion?.bereichId);
    const direkter = normalisiereHilfeText(aktion?.direkteSuchwoerter?.[0] || "");
    if (!aktion || !bereich || !direkter) return null;
    return {
      id,
      query: `wie kann ich ${direkter} in ${normalisiereHilfeText(bereich.titel || "")}`,
      expected,
    };
  })
  .filter(Boolean)
  .slice(0, 3);

for (const probe of SAME_ID_BELEGSFALTE) {
  repeatThree(`Same-ID-Beleg (${probe.id}): ${probe.query}`, () => antwortSchemaSicher(antwortVon(probe.query), probe.expected));
}

for (const probe of OVERLAP_BELEGSFALTE) {
  check(`Overlap-Beleg (${probe.id}) bleibt spezifisch`, antwortSchemaSicher(antwortVon(probe.query), probe.expected));
}

check("Mehraktions-Matrix nutzt alle 13 Aktions-IDs", KANONISCHE_AKTIONEN.length === 13);
check("Mehraktions-Matrix nutzt eindeutig kanonische Direktbegriffe",
  new Set(KANONISCHE_AKTIONEN.map((eintrag) => eintrag.id)).size === KANONISCHE_AKTIONEN.length
    && new Set(KANONISCHE_AKTIONEN.map((eintrag) => eintrag.term)).size === KANONISCHE_AKTIONEN.length,
);

const FAIL_CLOSED = [
  "Wo finde ich Filme auf Netflix?",
  "Wo finde ich Nacht der Glut im Kino?",
  "Wo finde ich Zwei linke Pfoten auf Netflix?",
  "Netflix",
  "Prime",
  "Kino",
  "Anleitung zum Unglücklichsein",
  "Wie funktioniert Netflix?",
  "Wie funktioniert Prime Video?",
  "Prime Video",
  "Suche den Film Daten sichern",
  "Wie stelle ich Netflix und Backup ein?",
  "Settings Konto Backup",
  "Settings Schriftgröße Darstellung ändern",
  "Wie ändere ich Schriftgröße Darstellung?",
];

for (const query of FAIL_CLOSED) {
  check(`Fail-closed (${query})`, antwortVon(query) === null);
}

check(
  "Unicode-/ASCII-Änderungsgrenzen für Schriftgröße sind stabil",
  antwortSchemaSicher(antwortVon("wie kann ich die schriftgröße ändern"), erwartungAusAktion(AKTIONEN_BY_ID.get("schriftgroesse-aendern"))),
);
check(
  "ASCII-Alternative bleibt kompatibel",
  antwortSchemaSicher(antwortVon("wie kann ich die schriftgroesse ändern"), erwartungAusAktion(AKTIONEN_BY_ID.get("schriftgroesse-aendern"))),
);
check(
  "Possessiver Sprachmodus bleibt funktional",
  antwortSchemaSicher(antwortVon("wie kann ich meinen eintrag löschen"), erwartungAusAktion(AKTIONEN_BY_ID.get("eintrag-loeschen"))),
);
check("Keine Doppel-Verb-Wortsalat-Lösung", antwortVon("wie kann ich die sichtbare auswahl löschen löschen") === null);

check(
  "Mediathek-Details nennt die E12-Grundregeln",
  (() => {
    const details = (BEREICHE_BY_ID.get("mediathek")?.details || []).join(" ").toLowerCase();
    return containsAllWords(details, ["suche", "filter", "typ", "sortierung"]) &&
      containsAllWords(details, ["sichtbare auswahl löschen", "sichtbare schnittmenge", "verborgene"])
      && containsAllWords(details, ["vorschau nennt", "mediathek", "artikel", "must-watch"])
      && containsAllWords(details, ["lokal", "referenziell", "fail-safe"]);
  })(),
);
check(
  "Mediathek-Details verneint Crash-/Server-/Geräte-/ACID-Kombinationsgarantie",
  (() => {
    const details = (BEREICHE_BY_ID.get("mediathek")?.details || []).join(" ").toLowerCase();
    return /keine\s+crash-/.test(details)
      && /server-/.test(details)
      && /geräteübergreifend/.test(details)
      && /\bacid\b/.test(details);
  })(),
);

check(
  "Keine Operatorlecks in Hilfedaten",
  !HILFE_TEXT.some((text) => /kino_auto|streaming_auto|liefere_an_supabase|auto_log|fetch-job|fetch job|credits|credits-|quota|quota-|\.mjs|script\b/u.test(String(text))),
);
check(
  "Keine Roh-HTML-/Kontrollzeichen in Hilfedaten",
  HILFE_TEXT.every((text) => !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(String(text))),
);

let ok = true;
try {
  if (buildLoadError) {
    throw buildLoadError;
  }
  for (const [name, pass] of checks) {
    console.log(`${pass ? "✓" : "✗"} ${name}`);
    ok = ok && !!pass;
  }
} finally {
  cleanup();
}
console.log(ok ? "HILFE_INHALTE-TEST BESTANDEN" : "HILFE_INHALTE-TEST FEHLGESCHLAGEN");
process.exit(ok ? 0 : 1);
