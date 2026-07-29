/* Etappe 7, Phase 2 — src/lib/kiSchalter.js festgenagelt.
   ===========================================================================
   WARUM DIESE DATEI EXISTIERT
   ---------------------------------------------------------------------------
   Der KI-Schalter ist die einzige Stelle, die entscheidet, ob ein bezahlter
   Pfad überhaupt angeboten wird. Er trägt vier Zusagen, und jede einzelne
   kostet Geld oder Vertrauen, wenn sie fällt:

     1. FAIL-CLOSED   Ohne beantwortete Frage ist KI AUS. Eine unbeantwortete
                      Frage darf nie „dann halt an" heißen — sonst öffnet der
                      erste Start einen bezahlten Pfad, bevor der Nutzer
                      gefragt wurde.
     2. DACH-REGEL    Steht der globale Schalter auf aus, hilft kein
                      Einzelwert. Eine Funktion kann nie „an" sein, wenn das
                      Dach zu ist.
     3. VERSIONSMARKE Nur eine Wahl, die im AKTUELLEN Dialog getroffen wurde,
                      zählt. Ein alter Wert aus einem früheren Build darf die
                      ausdrücklich verlangte Entscheidung nicht überspringen.
     4. GESCHLOSSENE  Nur bekannte Funktionsnamen sind schaltbar. Ein
        LISTE         Tippfehler darf nicht in ein stilles „an" laufen.

   Reines Modul: kein JSDOM, kein Netz, kein Anbieter. Jede Funktion nimmt
   den Storage als letztes Argument — die Suite injiziert ihn und braucht
   deshalb kein globales `localStorage`. Der Storage ist zugleich der Ort, an
   dem realistisch etwas schiefgeht (Privatmodus, blockierte Cookies), und
   wird entsprechend gequält.

   AUSTAUSCHBARE QUELLE (Mutationstest)
   ---------------------------------------------------------------------------
       KISCHALTER_QUELLE=/tmp/mut1.js node kischalter_test.mjs

   GRUPPEN
   ---------------------------------------------------------------------------
     A  Modell und Konstanten
     B  FAIL-CLOSED in allen Spielarten
     C  Dach-Regel
     D  Versionsmarke
     E  Schreiben: setzeGlobal, setzeFunktion
     F  Storage-Unfälle: blockiert, kaputt, fremd
     G  Funktionsnamen: geschlossene Liste, __proto__, Tippfehler
     H  verhaltenBeiAus
     X  BEFUNDE. Heute rot, NICHT exit-relevant — ein Pin auf falsches
        Verhalten macht die Reparatur später zur „Regression" (Regel aus dem
        Kopf von finder_test.mjs). KISCHALTER_STRENG=1 schaltet sie scharf.

   Aufruf: node kischalter_test.mjs
   =========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.dirname(fileURLToPath(import.meta.url));
const startZeit = Date.now();

/* ---------------------------------------------------------------- Zählwerk */
const gruppen = new Map();
const rot = [];
const rotX = [];
let okX = 0;
const check = (gruppe, name, wert) => {
  let ergebnis;
  try {
    ergebnis = typeof wert === "function" ? wert() : wert;
  } catch (e) {
    ergebnis = false;
    name += "  [Ausnahme: " + e.message + "]";
  }
  /* `check` ist SYNCHRON. Ein Promise wäre truthy und der Check immer grün,
     ohne je etwas zu prüfen — deshalb ist ein Thenable hier ein Fehler. */
  if (ergebnis && typeof ergebnis.then === "function") {
    ergebnis = false;
    name += "  [FEHLER IM TEST: Promise an das synchrone check() übergeben]";
  }
  const voll = "[" + gruppe + "] " + name;
  if (gruppe === "X") {
    if (ergebnis) { okX++; console.log("✓ " + voll); } else { rotX.push(voll); console.log("○ OFFEN: " + voll); }
    return;
  }
  const z = gruppen.get(gruppe) || { ok: 0, rot: 0 };
  if (ergebnis) { z.ok++; console.log("✓ " + voll); } else { z.rot++; rot.push(voll); console.log("✗ FEHLGESCHLAGEN: " + voll); }
  gruppen.set(gruppe, z);
};

/* ------------------------------------------------------------------ Modul */
const QUELL_DATEI = process.env.KISCHALTER_QUELLE || path.join(WURZEL, "src/lib/kiSchalter.js");
const QUELLTEXT = fs.readFileSync(QUELL_DATEI, "utf8");
const K = await import("data:text/javascript;base64," + Buffer.from(QUELLTEXT, "utf8").toString("base64"));

/* Kein globales localStorage: Die Suite injiziert überall ausdrücklich einen
   Storage. Bliebe eines stehen, prüfte der Test am Ende die Vorgabe statt der
   Injektion — und ein Aufruf, der den Storage vergisst, fiele nicht auf. */
if ("localStorage" in globalThis) delete globalThis.localStorage;

const T0 = "2026-07-27T22:00:00.000Z";
const T1 = "2026-07-28T09:00:00.000Z";

/* Storage-Attrappe mit Protokoll — damit prüfbar ist, WELCHE Schlüssel der
   Schalter überhaupt anfasst. */
function speicher(inhalt = {}) {
  const m = new Map(Object.entries(inhalt));
  const zugriffe = [];
  return {
    getItem: (k) => { zugriffe.push(["get", k]); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { zugriffe.push(["set", k]); m.set(k, String(v)); },
    removeItem: (k) => { zugriffe.push(["del", k]); m.delete(k); },
    _m: m, _zugriffe: zugriffe,
  };
}
const AN = (extra = {}) => ({
  "kd:ki": JSON.stringify({ global: true, funktionen: {}, gefragtAm: T0, ...extra }),
  "kd:ki-version": K.KI_WAHL_VERSION,
});
const AUS = () => ({
  "kd:ki": JSON.stringify({ global: false, funktionen: {}, gefragtAm: T0 }),
  "kd:ki-version": K.KI_WAHL_VERSION,
});
const NAMEN = () => Object.keys(K.KI_FUNKTIONEN);

const ABSCHNITTE = [];
const abschnitt = (name, lauf) => ABSCHNITTE.push([name, lauf]);

/* =========================================================================
   A — MODELL UND KONSTANTEN
   ========================================================================= */
abschnitt("A", async () => {
console.log("\n--- A: Modell und Konstanten ---");
check("A", "leererStand() ist der fail-closed Zustand: global null, keine Funktionen",
  () => { const s = K.leererStand();
    return s.global === null && JSON.stringify(s.funktionen) === "{}" && s.gefragtAm === null
      && Object.keys(s).sort().join(",") === "funktionen,gefragtAm,global"; });
check("A", "KI_FUNKTIONEN führt genau die vier Kern-KI-Funktionen",
  () => NAMEN().join(",") === "suche,profil,vorbewertung,diagnose");
check("A", "jede Funktion hat Label, Beschreibung und ein Verhalten bei Aus",
  () => NAMEN().every((n) => { const f = K.KI_FUNKTIONEN[n];
    return typeof f.label === "string" && f.label.length > 0
      && typeof f.beschreibung === "string" && f.beschreibung.length > 0
      && typeof f.beiAus === "string" && f.beiAus.length > 0; }));
/* „ausblenden" ist die Doktrin: Bei KI=aus existiert der Knopf nicht. Ein
   Erklärtext wäre die falsche Auskunft — `ai-disabled` heißt „der Betreiber
   hat abgeschaltet", nicht „du hast abgeschaltet". */
check("A", "alle vier blenden bei Aus AUS — keine erklärt sich nach dem Klick",
  () => NAMEN().every((n) => K.KI_FUNKTIONEN[n].beiAus === "ausblenden"));
check("A", "KI_WAHL_VERSION ist eine nicht-leere Marke",
  () => typeof K.KI_WAHL_VERSION === "string" && K.KI_WAHL_VERSION.length > 0);
/* Der Topf ist gerätelokal und darf NICHT in den Sync- oder Backup-Weg.
   `kd:einstellungen` wird von Anmeldung, Restore und Übernahme überschrieben —
   ein Zweitgerät könnte den Schalter sonst still umlegen. */
const AD = await import("./src/lib/accountDriver.js");
check("A", "der Topf `kd:ki` steht NICHT in ACCOUNT_SYNC_KEYS — eine Geräteentscheidung reist nicht mit",
  () => !AD.ACCOUNT_SYNC_KEYS.includes("kd:ki") && !AD.ACCOUNT_SYNC_KEYS.includes("kd:ki-version"));
check("A", "und auch nicht im Backup",
  () => { const b = fs.readFileSync(path.join(WURZEL, "src/lib/backup.js"), "utf8");
    return !/kd:ki\b/.test(b) && !/kiSchalter/.test(b); });
check("A", "und nicht im Restore",
  () => { const r = fs.readFileSync(path.join(WURZEL, "src/lib/restore.js"), "utf8");
    return !/kd:ki\b/.test(r) && !/kiSchalter/.test(r); });
/* Kommentare abziehen: der Modulkopf ERWÄHNT `kd:einstellungen` ausdrücklich,
   um zu begründen, warum der Schalter dort NICHT liegt. Gemeint ist der Code. */
const OHNE_KOMMENTARE = QUELLTEXT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
check("A", "der Schalter fasst im CODE keinen fremden Topf an — nur kd:ki und kd:ki-version"
  + "  [gefunden: " + JSON.stringify([...new Set((OHNE_KOMMENTARE.match(/"kd:[a-z:-]+"/g) || []))]) + "]",
  () => { const toepfe = [...new Set((OHNE_KOMMENTARE.match(/"kd:[a-z:-]+"/g) || []))];
    return toepfe.length === 2 && toepfe.includes("\"kd:ki\"") && toepfe.includes("\"kd:ki-version\""); });
});

/* =========================================================================
   B — FAIL-CLOSED
   Zusage 1. Über alle Spielarten von „nicht beantwortet", nicht an einer.
   ========================================================================= */
abschnitt("B", async () => {
console.log("\n--- B: fail-closed ---");

/* Jede Form, in der die Frage NICHT beantwortet ist. Für jede gilt: kiAn
   liefert false, und zwar für jede Funktion einzeln UND für die globale
   Frage. */
const UNBEANTWORTET = [
  ["leerer Storage", {}],
  ["Topf fehlt, Marke da", { "kd:ki-version": K.KI_WAHL_VERSION }],
  ["Topf leer", { "kd:ki": "", "kd:ki-version": K.KI_WAHL_VERSION }],
  ["global null", { "kd:ki": JSON.stringify({ global: null, funktionen: {}, gefragtAm: null }), "kd:ki-version": K.KI_WAHL_VERSION }],
  ["global fehlt", { "kd:ki": JSON.stringify({ funktionen: {} }), "kd:ki-version": K.KI_WAHL_VERSION }],
  ["global \"true\" (Zeichenkette)", { "kd:ki": JSON.stringify({ global: "true" }), "kd:ki-version": K.KI_WAHL_VERSION }],
  ["global 1", { "kd:ki": JSON.stringify({ global: 1 }), "kd:ki-version": K.KI_WAHL_VERSION }],
  ["global \"an\"", { "kd:ki": JSON.stringify({ global: "an" }), "kd:ki-version": K.KI_WAHL_VERSION }],
  ["kaputtes JSON", { "kd:ki": "{kein json", "kd:ki-version": K.KI_WAHL_VERSION }],
  ["JSON null", { "kd:ki": "null", "kd:ki-version": K.KI_WAHL_VERSION }],
  ["JSON Zeichenkette", { "kd:ki": "\"an\"", "kd:ki-version": K.KI_WAHL_VERSION }],
  ["JSON Liste", { "kd:ki": "[]", "kd:ki-version": K.KI_WAHL_VERSION }],
  ["JSON Zahl", { "kd:ki": "42", "kd:ki-version": K.KI_WAHL_VERSION }],
  ["nur funktionen gesetzt", { "kd:ki": JSON.stringify({ funktionen: { suche: true, profil: true, vorbewertung: true, diagnose: true } }), "kd:ki-version": K.KI_WAHL_VERSION }],
];
const offen = [];
for (const [name, inhalt] of UNBEANTWORTET) {
  const s = speicher(inhalt);
  for (const n of NAMEN()) if (K.kiAn(n, s) !== false) offen.push(name + " / " + n);
  if (K.kiAn("suche", s) !== false) offen.push(name + " / suche (Wiederholung)");
}
check("B", "FAIL-CLOSED: " + UNBEANTWORTET.length + " Spielarten von „nicht beantwortet“ × "
  + NAMEN().length + " Funktionen ergeben alle AUS  [offen: " + offen.length
  + (offen[0] ? ", zuerst " + offen[0] : "") + "]",
  () => offen.length === 0);
check("B", "FAIL-CLOSED: wahlBestaetigt ist in all diesen Fällen false",
  () => UNBEANTWORTET.every(([, inhalt]) => K.wahlBestaetigt(speicher(inhalt)) === false));
check("B", "FAIL-CLOSED: ladeStand liefert dabei nie ein `global: true`",
  () => UNBEANTWORTET.every(([, inhalt]) => K.ladeStand(speicher(inhalt)).global !== true));
/* Der interessanteste Fall: alle Einzelfunktionen ausdrücklich AN, aber die
   Grundfrage nie beantwortet. Das darf nichts öffnen. */
const nurFunktionen = speicher({ "kd:ki": JSON.stringify({ funktionen: { suche: true, profil: true, vorbewertung: true, diagnose: true } }), "kd:ki-version": K.KI_WAHL_VERSION });
check("B", "FAIL-CLOSED: vier ausdrücklich eingeschaltete Funktionen ohne Grundentscheidung bleiben AUS",
  () => NAMEN().every((n) => K.kiAn(n, nurFunktionen) === false));
/* Und der Normalfall zur Eichung — ohne ihn wäre „alles aus" trivial grün. */
const an = speicher(AN());
check("B", "EICHUNG: mit beantworteter Frage und global an sind alle vier AN",
  () => NAMEN().every((n) => K.kiAn(n, an) === true));
check("B", "ein fehlender Storage (undefined/null) ist ebenfalls AUS, ohne zu werfen",
  () => K.kiAn("suche", undefined) === false && K.kiAn("suche", null) === false
    && K.ladeStand(null).global === null && K.wahlBestaetigt(null) === false);
});

/* =========================================================================
   C — DIE DACH-REGEL
   Zusage 2. Steht der globale Schalter auf aus, hilft kein Einzelwert.
   ========================================================================= */
abschnitt("C", async () => {
console.log("\n--- C: Dach-Regel ---");
/* Alle 3⁴ Kombinationen der vier Einzelwerte unter einem geschlossenen Dach.
   Nicht ein Beispiel — alle, damit keine Kombination durchrutscht. */
const durchgerutscht = [];
for (const suche of [true, false, undefined]) for (const profil of [true, false, undefined])
for (const vorbewertung of [true, false, undefined]) for (const diagnose of [true, false, undefined]) {
  const f = {};
  if (suche !== undefined) f.suche = suche;
  if (profil !== undefined) f.profil = profil;
  if (vorbewertung !== undefined) f.vorbewertung = vorbewertung;
  if (diagnose !== undefined) f.diagnose = diagnose;
  const s = speicher({ "kd:ki": JSON.stringify({ global: false, funktionen: f, gefragtAm: T0 }), "kd:ki-version": K.KI_WAHL_VERSION });
  for (const n of NAMEN()) if (K.kiAn(n, s) !== false) durchgerutscht.push(JSON.stringify(f) + " / " + n);
}
check("C", "DACH: 81 Kombinationen der Einzelwerte unter global=false — keine ist an"
  + "  [durchgerutscht: " + durchgerutscht.length + (durchgerutscht[0] ? ", zuerst " + durchgerutscht[0] : "") + "]",
  () => durchgerutscht.length === 0);
check("C", "DACH: auch die globale Frage `kiAn()` ist unter geschlossenem Dach aus",
  () => K.kiAn(undefined, speicher(AUS())) === false);
/* Unter offenem Dach zählt der Einzelwert — sonst wäre das Dach kein Dach,
   sondern ein Hauptschalter ohne Untergliederung. */
const offenesDach = speicher({ "kd:ki": JSON.stringify({ global: true, funktionen: { suche: false }, gefragtAm: T0 }), "kd:ki-version": K.KI_WAHL_VERSION });
check("C", "unter offenem Dach schaltet der Einzelwert die Funktion ab — und nur sie",
  () => K.kiAn("suche", offenesDach) === false
    && K.kiAn("profil", offenesDach) === true && K.kiAn("diagnose", offenesDach) === true);
check("C", "eine nicht erwähnte Funktion ist unter offenem Dach AN (Voreinstellung: mitgemeint)",
  () => K.kiAn("diagnose", speicher(AN())) === true);
check("C", "nur ausdrückliches `false` schaltet ab — 0, \"\", null tun es nicht",
  () => [0, "", null, "false"].every((v) => {
    const s = speicher({ "kd:ki": JSON.stringify({ global: true, funktionen: { suche: v }, gefragtAm: T0 }), "kd:ki-version": K.KI_WAHL_VERSION });
    return K.kiAn("suche", s) === true; }));
});

/* =========================================================================
   D — DIE VERSIONSMARKE
   Zusage 3. Nur eine Wahl im AKTUELLEN Dialog zählt.
   ========================================================================= */
abschnitt("D", async () => {
console.log("\n--- D: Versionsmarke ---");
check("D", "wahlBestaetigt verlangt die aktuelle Marke UND eine getroffene Wahl",
  () => K.wahlBestaetigt(speicher(AN())) === true);
const MARKEN = [
  ["Marke fehlt", null],
  ["Marke leer", ""],
  ["Marke aus früherem Build", "e6-v1"],
  ["Marke mit Tippfehler", K.KI_WAHL_VERSION + " "],
  ["Marke ist eine Zahl", "1"],
];
for (const [name, marke] of MARKEN) {
  const inhalt = { "kd:ki": JSON.stringify({ global: true, funktionen: {}, gefragtAm: T0 }) };
  if (marke !== null) inhalt["kd:ki-version"] = marke;
  check("D", "wahlBestaetigt ist false, wenn die " + name.replace("Marke", "Marke") + "",
    () => K.wahlBestaetigt(speicher(inhalt)) === false);
}
check("D", "die richtige Marke allein genügt nicht — ohne getroffene Wahl bleibt es false",
  () => K.wahlBestaetigt(speicher({ "kd:ki": JSON.stringify({ global: null }), "kd:ki-version": K.KI_WAHL_VERSION })) === false);
check("D", "setzeGlobal setzt die Marke mit, sonst zählte die frische Wahl selbst nicht",
  () => { const s = speicher(); K.setzeGlobal(true, T0, s);
    return s._m.get("kd:ki-version") === K.KI_WAHL_VERSION && K.wahlBestaetigt(s) === true; });
check("D", "auch eine Wahl gegen die KI setzt die Marke — „nein“ ist eine Antwort",
  () => { const s = speicher(); K.setzeGlobal(false, T0, s);
    return K.wahlBestaetigt(s) === true && K.kiAn("suche", s) === false; });
});

/* =========================================================================
   E — SCHREIBEN
   ========================================================================= */
abschnitt("E", async () => {
console.log("\n--- E: setzeGlobal und setzeFunktion ---");
const s = speicher();
const stand = K.setzeGlobal(true, T0, s);
/* VERTRAGSÄNDERUNG (dein Befund K3): Die Schreibfunktionen geben jetzt
   `{ stand, gespeichert }` statt des Stands allein. Grund war deine eigene
   Messung: Bei blockiertem Storage schluckt der catch den Fehler — richtig,
   der Lesepfad bleibt fail-closed —, aber die Rückgabe behauptete trotzdem
   `global: true`. Wer sie in seinen React-State legt, zeigt einen
   eingeschalteten Schalter, während der Nutzer keine KI-Funktion findet. */
check("E", "setzeGlobal schreibt Stand und Marke und merkt sich den Zeitpunkt",
  () => stand.stand.global === true && stand.stand.gefragtAm === T0
    && stand.gespeichert === true
    && JSON.parse(s._m.get("kd:ki")).global === true);
check("E", "setzeGlobal fasst NUR die beiden eigenen Schlüssel an"
  + "  [angefasst: " + JSON.stringify([...new Set(s._zugriffe.map((z) => z[1]))]) + "]",
  () => [...new Set(s._zugriffe.map((z) => z[1]))].every((k) => k === "kd:ki" || k === "kd:ki-version"));
check("E", "nur `true` heißt an — alles andere heißt aus",
  () => [1, "true", "an", {}, [], "yes"].every((v) => {
    const t = speicher(); K.setzeGlobal(v, T0, t); return K.ladeStand(t).global === false; }));
check("E", "setzeGlobal bewahrt bereits gesetzte Einzelwerte",
  () => { const t = speicher(); K.setzeGlobal(true, T0, t); K.setzeFunktion("suche", false, t);
    K.setzeGlobal(true, T1, t);
    return K.ladeStand(t).funktionen.suche === false && K.ladeStand(t).gefragtAm === T1; });

const f = speicher(); K.setzeGlobal(true, T0, f);
check("E", "setzeFunktion schaltet genau eine Funktion und lässt die anderen unberührt",
  () => { K.setzeFunktion("suche", false, f);
    return K.kiAn("suche", f) === false && K.kiAn("profil", f) === true && K.kiAn("diagnose", f) === true; });
check("E", "und lässt sich wieder einschalten",
  () => { K.setzeFunktion("suche", true, f); return K.kiAn("suche", f) === true; });
check("E", "setzeFunktion fasst die Versionsmarke NICHT an — sie gehört zur Grundfrage",
  () => { const t = speicher(AN()); t._zugriffe.length = 0; K.setzeFunktion("suche", false, t);
    return !t._zugriffe.some(([art, k]) => art === "set" && k === "kd:ki-version"); });
check("E", "setzeFunktion ändert den globalen Schalter nicht",
  () => { const t = speicher(AN()); K.setzeFunktion("suche", false, t);
    return K.ladeStand(t).global === true; });
check("E", "beide Schreibfunktionen geben { stand, gespeichert } zurück",
  () => { const t = speicher();
    const a = K.setzeGlobal(true, T0, t);
    const b = K.setzeFunktion("suche", false, t);
    return a.stand.global === true && a.gespeichert === true
      && b.stand.funktionen.suche === false && b.gespeichert === true; });
/* Die eigentliche Zusage hinter K3: ein blockierter Storage meldet ehrlich,
   dass nichts geschrieben wurde — und der Lesepfad bleibt trotzdem aus. */
check("E", "blockierter Storage: gespeichert=false, und die Wahl wirkt NICHT",
  () => { const tot = { getItem: () => null, setItem: () => { throw new Error("Quota"); } };
    const r = K.setzeGlobal(true, T0, tot);
    return r.gespeichert === false && K.kiAn("suche", tot) === false; });
});

/* =========================================================================
   F — STORAGE-UNFÄLLE
   Privatmodus, blockierte Cookies, voller Speicher: alles real, und alles
   muss fail-closed enden statt zu werfen.
   ========================================================================= */
abschnitt("F", async () => {
console.log("\n--- F: Storage-Unfälle ---");
const wirft = () => ({
  getItem: () => { throw new Error("SecurityError: blockiert"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("blockiert"); },
});
const nurLesenWirft = () => ({ getItem: () => { throw new Error("blockiert"); }, setItem: () => {}, removeItem: () => {} });
const nurSchreibenWirft = (inhalt) => { const s = speicher(inhalt); return { ...s, setItem: () => { throw new Error("QuotaExceededError"); } }; };

check("F", "getItem wirft: kiAn ist aus und wirft nicht weiter",
  () => NAMEN().every((n) => K.kiAn(n, wirft()) === false));
check("F", "getItem wirft: ladeStand liefert den leeren Stand",
  () => JSON.stringify(K.ladeStand(wirft())) === JSON.stringify(K.leererStand()));
check("F", "getItem wirft: wahlBestaetigt ist false",
  () => K.wahlBestaetigt(wirft()) === false && K.wahlBestaetigt(nurLesenWirft()) === false);
check("F", "setItem wirft: setzeGlobal wirft nicht weiter",
  () => { let geworfen = false;
    try { K.setzeGlobal(true, T0, wirft()); } catch { geworfen = true; }
    return !geworfen; });
check("F", "setItem wirft: der Schalter bleibt danach AUS — fail-closed bis ans Ende",
  () => { const s = wirft(); K.setzeGlobal(true, T0, s); return K.kiAn("suche", s) === false; });
check("F", "setItem wirft: setzeFunktion wirft ebenfalls nicht",
  () => { let geworfen = false;
    try { K.setzeFunktion("suche", false, wirft()); } catch { geworfen = true; }
    return !geworfen; });
check("F", "ein Storage, der nur beim Schreiben scheitert, verfälscht den gelesenen Stand nicht",
  () => { const s = nurSchreibenWirft(AUS()); K.setzeGlobal(true, T0, s); return K.kiAn("suche", s) === false; });
check("F", "scheitert das AUSSCHALTEN eines zuvor aktiven Stands, sperrt die Laufzeitsicherung trotzdem jede KI",
  () => {
    const s = nurSchreibenWirft(AN());
    const r = K.setzeGlobal(false, T1, s);
    return r.gespeichert === false && r.stand.global === false
      && NAMEN().every((n) => K.kiAn(n, s) === false);
  });
check("F", "scheitert das Ausschalten einer Einzelfunktion, schließt die Laufzeitsicherung vorsichtshalber das ganze KI-Dach",
  () => {
    const s = nurSchreibenWirft(AN());
    const r = K.setzeFunktion("suche", false, s);
    return r.gespeichert === false && r.stand.global === false
      && NAMEN().every((n) => K.kiAn(n, s) === false);
  });
/* Fremde Objekte statt eines Storage: ein Aufrufer könnte versehentlich
   irgendetwas übergeben. Nichts davon darf werfen oder öffnen. */
const FREMD = [{}, [], 0, "", "text", true, false, () => {}, { getItem: 5 }, { getItem: () => ({}) }, Object.create(null)];
const unfaelle = FREMD.filter((x) => {
  try { return K.kiAn("suche", x) !== false || K.wahlBestaetigt(x) !== false; }
  catch { return true; }
});
check("F", "fremde Objekte als Storage: " + FREMD.length + " Varianten enden aus, ohne zu werfen"
  + "  [Unfälle: " + unfaelle.length + "]",
  () => unfaelle.length === 0);
check("F", "ein Storage, der Objekte statt Zeichenketten liefert, öffnet nichts",
  () => K.kiAn("suche", { getItem: () => ({ global: true }) }) === false);
/* Der Zugriff auf `getItem` selbst kann werfen — ein widerrufener Proxy, ein
   Getter mit Nebenwirkung, ein Objekt aus einem fremden Realm. `lies()` fängt
   nur Ausnahmen INNERHALB des Aufrufs; die äußere Absicherung in `ladeStand`
   ist genau für diesen Fall da und wäre sonst nicht beobachtbar. */
const zugriffWirft = () => new Proxy({}, { get(_, k) { throw new Error("Zugriff auf " + String(k) + " verweigert"); } });
const widerrufen = () => { const r = Proxy.revocable({ getItem: () => null, setItem: () => {} }, {}); r.revoke(); return r.proxy; };
for (const [name, bau] of [["Proxy, dessen Eigenschaftszugriff wirft", zugriffWirft], ["widerrufener Proxy", widerrufen]]) {
  check("F", name + ": ladeStand liefert den leeren Stand, ohne zu werfen",
    () => JSON.stringify(K.ladeStand(bau())) === JSON.stringify(K.leererStand()));
  check("F", name + ": kiAn ist aus, ohne zu werfen",
    () => NAMEN().every((n) => K.kiAn(n, bau()) === false));
  check("F", name + ": wahlBestaetigt ist false, ohne zu werfen",
    () => K.wahlBestaetigt(bau()) === false);
  check("F", name + ": setzeGlobal und setzeFunktion werfen nicht",
    () => { let g = false;
      try { K.setzeGlobal(true, T0, bau()); K.setzeFunktion("suche", false, bau()); } catch { g = true; }
      return !g; });
}
});

/* =========================================================================
   G — FUNKTIONSNAMEN
   Zusage 4. Die Liste ist geschlossen; ein Tippfehler darf nicht öffnen.
   ========================================================================= */
abschnitt("G", async () => {
console.log("\n--- G: Funktionsnamen ---");
const an = speicher(AN());
const FREMDE_NAMEN = ["such", "sucheX", "Suche", "SUCHE", " suche", "suche ", "unbekannt", "blog", "chat",
  "__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf"];
const geoeffnet = FREMDE_NAMEN.filter((n) => K.kiAn(n, an) !== false);
check("G", "ein unbekannter Name ist AUS — " + FREMDE_NAMEN.length + " Varianten inkl. __proto__ und Groß/Klein"
  + "  [geöffnet: " + JSON.stringify(geoeffnet) + "]",
  () => geoeffnet.length === 0);
check("G", "auch unter geschlossenem Dach bleibt jeder fremde Name aus",
  () => FREMDE_NAMEN.every((n) => K.kiAn(n, speicher(AUS())) === false));
/* Vererbte Eigenschaften dürfen nicht als Funktion durchgehen: `KI_FUNKTIONEN`
   erbt von Object.prototype, ein reiner `in`- oder Wahrheitstest hätte
   `toString` und `constructor` als gültige Namen behandelt. */
check("G", "die Prüfung nutzt eine EIGENE-Eigenschaft-Prüfung, kein `in`",
  () => K.kiAn("toString", an) === false && K.kiAn("constructor", an) === false
    && K.kiAn("__proto__", an) === false);
check("G", "setzeFunktion mit unbekanntem Namen schreibt nichts",
  () => { const s = speicher(AN()); const vorher = s._m.get("kd:ki");
    K.setzeFunktion("unbekannt", false, s); K.setzeFunktion("__proto__", false, s);
    K.setzeFunktion("constructor", false, s); K.setzeFunktion("", false, s);
    return s._m.get("kd:ki") === vorher; });
check("G", "setzeFunktion mit unbekanntem Namen gibt den unveränderten Stand zurück",
  () => { const s = speicher(AN());
    const r = K.setzeFunktion("unbekannt", false, s);
    return JSON.stringify(r.stand) === JSON.stringify(K.ladeStand(s)) && r.gespeichert === false; });
/* Prototype Pollution: weder über den Namen noch über den gespeicherten Topf. */
check("G", "keine Prototype Pollution über setzeFunktion",
  () => { const s = speicher(AN()); K.setzeFunktion("__proto__", true, s);
    return ({}).suche === undefined && Object.prototype.suche === undefined && ({}).global === undefined; });
check("G", "keine Prototype Pollution über einen manipulierten Topf",
  () => { const s = speicher({ "kd:ki": '{"global":true,"funktionen":{"__proto__":{"suche":true}}}', "kd:ki-version": K.KI_WAHL_VERSION });
    K.kiAn("suche", s); K.setzeFunktion("suche", false, s);
    return ({}).suche === undefined && Object.prototype.suche === undefined; });
check("G", "und ein solcher Topf öffnet auch keine Funktion, die es nicht gibt",
  () => { const s = speicher({ "kd:ki": '{"global":true,"funktionen":{"__proto__":{"blog":true}}}', "kd:ki-version": K.KI_WAHL_VERSION });
    return K.kiAn("blog", s) === false; });
/* Jeder bekannte Name muss dagegen funktionieren — sonst wäre „alles aus"
   trivial richtig. */
check("G", "jeder bekannte Name ist unter offenem Dach an und einzeln abschaltbar",
  () => NAMEN().every((n) => { const s = speicher(AN());
    if (K.kiAn(n, s) !== true) return false;
    K.setzeFunktion(n, false, s);
    return K.kiAn(n, s) === false; }));
});

/* =========================================================================
   H — verhaltenBeiAus
   ========================================================================= */
abschnitt("H", async () => {
console.log("\n--- H: verhaltenBeiAus ---");
check("H", "jede bekannte Funktion meldet „ausblenden“",
  () => NAMEN().every((n) => K.verhaltenBeiAus(n) === "ausblenden"));
check("H", "ein unbekannter Name fällt auf „ausblenden“ zurück, statt undefined zu liefern",
  () => ["unbekannt", "", null, undefined, 0].every((n) => K.verhaltenBeiAus(n) === "ausblenden"));
/* `KI_FUNKTIONEN["__proto__"]` liefert Object.prototype — truthy. Ohne den
   Rückfall käme hier `undefined` heraus und die Oberfläche wüsste nicht,
   was sie tun soll. */
check("H", "auch __proto__, constructor und toString fallen auf „ausblenden“ zurück",
  () => ["__proto__", "constructor", "toString", "valueOf"].every((n) => K.verhaltenBeiAus(n) === "ausblenden"));
});

/* =========================================================================
   U — DIE OBERFLÄCHEN-NAHT (DatenTab)
   Der KI-Block in DatenTab.jsx wird NICHT gerendert: der Tab zieht neun
   Geschwister-Komponenten nach (MasterImport, TeilenBlock, KontoBereich,
   RestoreImport …), und der Block selbst ist reine Darstellung über drei
   Props. Ein Rendertest kostete den halben Komponentengraphen für drei
   Aussagen — und zwei davon prüfen die Module oben schon.
   Was ein Rendertest NICHT ersetzen könnte und hier stattdessen steht: die
   drei Stellen, an denen die Oberfläche die Modulregeln DUPLIZIERT und
   deshalb still auseinanderlaufen kann. Läuft eine, zeigt die App einen
   Zustand an, den `kiAn` anders beantwortet — und der Nutzer sieht „an“,
   während die Funktion aus ist.
   ========================================================================= */
abschnitt("U", async () => {
console.log("\n--- U: Oberflächen-Naht (DatenTab, statisch) ---");
const NAHT_WURZEL = process.env.NAHT_WURZEL || WURZEL;
const dt = fs.readFileSync(path.join(NAHT_WURZEL, "src/tabs/DatenTab.jsx"), "utf8");
/* Genau der eine Klappen-Block. „Konto & Geräte-Sync" kommt weiter oben schon
   in einem Kommentar vor, deshalb wird ab der Klappe gesucht, nicht ab dem
   ersten Vorkommen. */
const blockStart = dt.indexOf('<Klappe titel="KI-Funktionen">');
const block = blockStart < 0 ? "" : dt.slice(blockStart, dt.indexOf("Konto & Geräte-Sync", blockStart));
check("U", "der KI-Block ist als eigene Klappe „KI-Funktionen“ auffindbar",
  () => blockStart > 0 && block.length > 400);

check("U", "der KI-Block bekommt Stand und Setter als PROPS — nicht über `einstellungen`",
  () => /kiStand[^=]*=|kiStand\s*=/.test(dt) && /onKiGlobal/.test(dt) && /onKiFunktion/.test(dt)
    && !/setzeEinstellung\(\s*["'`]ki/.test(dt));
/* Die Dach-Regel in der Oberfläche: Einzelschalter unter geschlossenem Dach
   anzubieten hätte suggeriert, sie bewirkten etwas. */
check("U", "die Einzelschalter hängen sichtbar an `kiStand.global === true` (Dach-Regel gespiegelt)",
  () => /kiStand\.global === true &&/.test(block));
/* Die Voreinstellung: „nicht ausdrücklich abgewählt" heißt AN — dieselbe
   Regel wie `kiAn` (`funktionen[name] !== false`). Prüfte die Oberfläche auf
   `=== true`, stünde bei einer nie berührten Funktion „aus", während sie
   tatsächlich an ist. */
check("U", "der Einzelschalter leitet seinen Wert aus `=== false` ab, wie kiAn — nicht aus `=== true`",
  () => /kiStand\.funktionen\?\.\[id\] === false \? "aus" : "an"/.test(block));
/* Die Liste wird aus KI_FUNKTIONEN aufgebaut, nicht abgeschrieben: eine neue
   Funktion taucht sonst im Modul auf, aber nie in den Einstellungen. */
/* Die Labels dürfen NICHT im Tab stehen: sonst hat eine neue Funktion im
   Modul zwar einen Namen, aber keinen Schalter — oder zwei verschiedene. */
check("U", "die Liste kommt aus KI_FUNKTIONEN, und kein Label ist abgeschrieben"
  + "  [abgeschrieben: " + JSON.stringify(NAMEN().filter((n) => block.includes(K.KI_FUNKTIONEN[n].label))) + "]",
  () => /Object\.entries\(KI_FUNKTIONEN\)/.test(block)
    && NAMEN().every((n) => !block.includes(K.KI_FUNKTIONEN[n].label)));
check("U", "und der Block nennt die Gerätelokalität, damit niemand sie im Konto sucht",
  () => /nur für dieses Gerät|nicht mit dem Konto/.test(block));
check("U", "der Block sagt zu, dass ohne KI alles funktioniert — dieselbe Zusage wie die Willkommens-Karte",
  () => /Ohne KI funktioniert alles/.test(block));
});

/* =========================================================================
   X — BEFUNDE AN kiSchalter.js
   Heute rot, NICHT exit-relevant.
   ========================================================================= */
abschnitt("X", async () => {
console.log("\n--- X: Befunde (offen, nicht exit-relevant) ---");

/* K1 — `kiAn()` PRÜFT DIE VERSIONSMARKE NICHT.
   `wahlBestaetigt()` verlangt sie; `kiAn()` — die Funktion, die laut
   Modulkopf „die einzige Frage ist, die der Rest der App stellen muss" —
   liest `kd:ki-version` nie. Eine „mit KI"-Wahl aus einem früheren Build
   wirkt damit weiter, obwohl der Modulkopf ausdrücklich sagt: „Nur eine
   Wahl, die im aktuellen Dialog bewusst getroffen wurde, zählt. Ein alter
   Wert aus einem früheren Build darf die ausdrücklich verlangte Entscheidung
   nicht für immer überspringen."
   Wirkung: Build N+1 hebt KI_WAHL_VERSION, weil sich der Dialog geändert hat.
   Der Nutzer öffnet die App — `wahlBestaetigt` ist false, der Dialog erscheint
   also. Aber `kiAn("suche")` ist schon beim ersten Render true, und der
   bezahlte Knopf steht da, bevor der neue Dialog beantwortet ist. Genau das
   Fenster, das die Marke schließen soll.
   Eine Zeile: `if (!wahlBestaetigt(storage)) return false;` als erste Zeile
   in `kiAn`. Belegt auch in findertab_test.mjs (F6/F6a). */
const alteMarke = speicher({ "kd:ki": JSON.stringify({ global: true, funktionen: {}, gefragtAm: "2026-01-01T00:00:00.000Z" }), "kd:ki-version": "e6-alte-marke" });
const ohneMarke = speicher({ "kd:ki": JSON.stringify({ global: true, funktionen: {}, gefragtAm: "2026-01-01T00:00:00.000Z" }) });
check("X", "K1: eine Wahl mit VERALTETER Versionsmarke schaltet keine Funktion frei"
  + "  [gemessen: wahlBestaetigt=" + K.wahlBestaetigt(alteMarke) + ", kiAn('suche')=" + K.kiAn("suche", alteMarke) + "]",
  () => NAMEN().every((n) => K.kiAn(n, alteMarke) === false));
check("X", "K1a: eine Wahl OHNE Versionsmarke ebenso"
  + "  [gemessen: wahlBestaetigt=" + K.wahlBestaetigt(ohneMarke) + ", kiAn('suche')=" + K.kiAn("suche", ohneMarke) + "]",
  () => NAMEN().every((n) => K.kiAn(n, ohneMarke) === false));
check("X", "K1b: `kiAn` und `wahlBestaetigt` widersprechen sich nie"
  + "  [gemessen: " + [alteMarke, ohneMarke].filter((s) => K.kiAn("suche", s) && !K.wahlBestaetigt(s)).length + " Widersprüche]",
  () => [alteMarke, ohneMarke, speicher(AN()), speicher(AUS()), speicher()]
    .every((s) => !(K.kiAn("suche", s) === true && K.wahlBestaetigt(s) === false)));

/* K2 — EIN FEHLENDER NAME IST FAIL-OPEN, EIN FALSCHER FAIL-CLOSED.
   Das ist die Antwort auf die Frage nach der Tippfehler-Falle: Der Tippfehler
   ist sicher — `kiAn("such")` liefert false. Gefährlich ist der Fall, den man
   nicht sieht: `kiAn("")`, `kiAn(null)`, `kiAn(undefined)`, `kiAn(0)` und
   `kiAn(false)` liefern alle TRUE, weil `!name` als „globale Frage" gilt.
   Ein Aufrufer, der `kiAn(FEATURES.suche)` schreibt und dessen Konstante
   undefined ist — falscher Import, umbenanntes Feld, Tippfehler im
   Objektschlüssel —, bekommt „ja, an" und hält die Funktion für geprüft.
   Der Unterschied zwischen „ich frage global" und „mein Name ist
   abhandengekommen" ist genau ein `arguments.length`. Sauberer wäre, die
   globale Frage in eine eigene Funktion zu ziehen (`kiGrundsaetzlichAn()`)
   und `kiAn(name)` einen Namen verlangen zu lassen. */
const FALSY = [["\"\"", ""], ["null", null], ["undefined", undefined], ["0", 0], ["false", false], ["NaN", NaN]];
const failOpen = FALSY.filter(([, v]) => K.kiAn(v, an2()) === true);
function an2() { return speicher(AN()); }
check("X", "K2: ein leerer oder fehlender Funktionsname öffnet nicht"
  + "  [gemessen: " + failOpen.length + " von " + FALSY.length + " liefern true: "
  + JSON.stringify(failOpen.map(([n]) => n)) + "]",
  () => failOpen.length === 0);
check("X", "K2a: der Tippfehler ist dagegen sicher (Eichung — dieser Teil stimmt)"
  + "  [kiAn('such') = " + K.kiAn("such", an2()) + "]",
  () => K.kiAn("such", an2()) === false);

/* K3 — `setzeGlobal` MELDET ERFOLG, AUCH WENN NICHTS GESCHRIEBEN WURDE.
   Bei blockiertem Storage (Privatmodus, volle Quote) schluckt der catch den
   Fehler — richtig, denn der Lesepfad bleibt fail-closed. Der RÜCKGABEWERT
   behauptet aber `{ global: true }`. Ein Aufrufer, der ihn in seinen
   React-State legt (die naheliegende Verwendung), zeigt „KI an" in der
   Oberfläche, während `kiAn` überall false liefert: Der Nutzer sieht einen
   eingeschalteten Schalter und findet keine einzige KI-Funktion.
   `{ stand, gespeichert: boolean }` genügt. */
const blockiert = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => {} };
const behauptet = K.setzeGlobal(true, T0, blockiert);
check("X", "K3: setzeGlobal meldet bei blockiertem Storage nicht „an“, obwohl nichts gespeichert wurde"
  + "  [gemessen: Rückgabe global=" + JSON.stringify(behauptet.global)
  + ", tatsächlich kiAn='" + K.kiAn("suche", blockiert) + "']",
  () => !(behauptet.global === true && K.kiAn("suche", blockiert) === false));
});

/* ------------------------------------------------------------------ Lauf */
for (const [name, lauf] of ABSCHNITTE) {
  try { await lauf(); }
  catch (e) { check(name, "Abschnitt " + name + " abgebrochen: " + e.message, false); }
}

/* =========================================================================
   BILANZ
   ========================================================================= */
const TITEL = {
  A: "Modell und Konstanten",
  B: "fail-closed",
  C: "Dach-Regel",
  D: "Versionsmarke",
  E: "Schreiben",
  F: "Storage-Unfälle",
  G: "Funktionsnamen",
  H: "verhaltenBeiAus",
  U: "Oberflächen-Naht (DatenTab)",
};
/* Wache: eine Gruppe ohne TITEL-Eintrag würde weder gezählt noch
   exit-relevant sein — ihre roten Checks verschwänden lautlos. */
const unbekannteGruppen = [...gruppen.keys()].filter((g) => g !== "X" && !TITEL[g]);
let ok = 0, schlecht = 0;
console.log("\n===========================================================");
console.log("Quelle:   " + path.relative(WURZEL, QUELL_DATEI) + (process.env.KISCHALTER_QUELLE ? "   (MUTATIONSLAUF)" : ""));
console.log("Betrieb:  reines Modul · kein JSDOM · kein Netz · Storage injiziert");
for (const [g, t] of Object.entries(TITEL)) {
  const z = gruppen.get(g) || { ok: 0, rot: 0 };
  ok += z.ok; schlecht += z.rot;
  console.log(`${g}  ${(t + " ").padEnd(46, ".")} ${z.ok}/${z.ok + z.rot}`);
}
console.log(`\n${ok}/${ok + schlecht} Checks bestanden.   Laufzeit ${((Date.now() - startZeit) / 1000).toFixed(1)} s`);
if (unbekannteGruppen.length) {
  console.log("\nFEHLER IM TEST: Gruppen ohne Eintrag in TITEL — nicht gezählt: " + unbekannteGruppen.join(", "));
}
if (rot.length) {
  console.log("\nROTE CHECKS:");
  for (const n of rot) console.log("  ✗ " + n);
}
console.log(`\nX  Befunde an kiSchalter.js: ${okX}/${okX + rotX.length} unauffällig`
  + (rotX.length ? " — " + rotX.length + " offen:" : ""));
for (const n of rotX) console.log("  ○ " + n);
if (rotX.length) {
  console.log("  (Bewusst NICHT als grüner Check auf das Ist-Verhalten gepinnt und nicht");
  console.log("   exit-relevant. KISCHALTER_STRENG=1 schaltet sie scharf.)");
}
const streng = process.env.KISCHALTER_STRENG === "1";
const fehlschlag = schlecht > 0 || unbekannteGruppen.length > 0 || (streng && rotX.length > 0);
console.log(fehlschlag ? "\nKISCHALTER-TEST: BEFUNDE OBEN" : "\nKISCHALTER-TEST BESTANDEN");
process.exit(fehlschlag ? 1 : 0);
