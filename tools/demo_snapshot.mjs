#!/usr/bin/env node
/* ============================================================================
   Kinodreieck · Etappe 4 · Demo-Schnappschuss bauen
   ----------------------------------------------------------------------------
   Erzeugt aus einer echten Katalog-Payload eine oeffentlich zeigbare Fassung
   fuer die Zeilen `programm_demo` und `streaming_demo`.

   WOZU DAS UEBERHAUPT NOETIG IST
   Auf kinodreieck.at soll ein Besucher ohne Anmeldung die App sehen koennen —
   aber nicht das laufende Wiener Kinoprogramm. Die Programmdaten stammen aus
   nicht freigegebenen Quellen; sie oeffentlich zu servieren waere
   Wiederveroeffentlichung (docs/PROGRAMMDATEN_PLAN.md). Ein Demo-Schnappschuss
   loest das nur dann, wenn er KEINEN Gebrauchswert als Kinoprogramm hat:
   wenige Tage, wenige Haeuser, wenige Filme, datiert und befristet.
   Deshalb sind die Voreinstellungen absichtlich knapp. Im Zweifel weniger.

   POSITIVLISTE STATT NEGATIVLISTE
   Uebernommen wird nur, was unten ausdruecklich steht. Alles andere faellt
   weg — auch Felder, die es heute noch gar nicht gibt. Eine Verbotsliste
   wuerde jedes neue Feld der Quelle stillschweigend mitveroeffentlichen; genau
   so sind im Juli persoenliche Bewertungen ins oeffentliche Repo geraten.

   SCHREIBT NIE IN DIE DATENBANK
   Das Werkzeug erzeugt Dateien und fertiges SQL. Veroeffentlicht wird von Hand
   im Supabase-SQL-Editor — der Publish ist ein bewusster Handgriff, kein
   Nebenprodukt eines Skriptlaufs. Runbook: docs/RUNBOOK_DEMO_SNAPSHOT.md
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

/* ---------------------------------------------------------------- Positivlisten */

/* Ein Film. `film_at_id` ist eine Zahl ohne Aussagegehalt, dient der App als
   stabiler Schluessel. `beschreibung`, `film_at_uri` und alles Weitere fliegen
   raus: Beschreibungstexte sind lizenzierter Inhalt, die URI zeigt in die
   Quelle zurueck. */
const FILM_FELDER = ["film_at_id", "titel", "originaltitel", "jahr", "genres", "vorstellungen"];

/* Eine Vorstellung: die Fakten aus dem Programmdaten-Plan (Kino, Zeit, Fassung,
   Format). `im_abo` und `tags` bleiben draussen — Abo-Zugehoerigkeit ist eine
   Aussage ueber Max' Vertrag, nicht ueber die Vorstellung. */
const VORSTELLUNG_FELDER = ["kino", "kino_id", "zeit", "fassung", "format"];

/* Ein Streaming-Titel. KEINE `bewertung` (persoenliches Urteil), keine
   `begruendung`, keine `notiz`, keine `web_urls` (Deep Links in fremde
   Angebote). Mit --mit-bewertungen laesst sich das bewusst oeffnen. */
const TITEL_FELDER = ["watchmode_id", "titel", "jahr", "typ", "genres", "dienste"];
const TITEL_FELDER_MIT_BEWERTUNG = [...TITEL_FELDER, "bewertung"];

/* Betriebsangaben der Huelle, die nie mitgehen: Quota-Staende, Schluessel,
   Laufprotokolle. Sie stehen hier nur zur Dokumentation — durch die
   Positivliste faellt ohnehin alles weg, was nicht aufgezaehlt ist. */
const HUELLE_FELDER_STREAMING = ["region", "dienste", "verfuegbare_quellen"];

/* ---------------------------------------------------------------- Hilfen */

const entfernt = new Set();

function nurErlaubte(objekt, erlaubt, pfad) {
  const raus = {};
  for (const [k, v] of Object.entries(objekt || {})) {
    if (erlaubt.includes(k)) raus[k] = v;
    else entfernt.add(pfad + "." + k);
  }
  return raus;
}

function zahl(wert, standard) {
  const n = Number(wert);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : standard;
}

function tagVon(iso) {
  return String(iso || "").slice(0, 10);
}

function argumente(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) { a._.push(t); continue; }
    const name = t.slice(2);
    const naechstes = argv[i + 1];
    if (naechstes === undefined || naechstes.startsWith("--")) a[name] = true;
    else { a[name] = naechstes; i += 1; }
  }
  return a;
}

function lies(pfad) {
  try { return JSON.parse(readFileSync(resolve(pfad), "utf8")); }
  catch (e) { fehler("Datei nicht lesbar oder kein gueltiges JSON: " + pfad + "\n  " + e.message); }
  return null;
}

function fehler(text) {
  console.error("\nAbbruch: " + text + "\n");
  process.exit(2);
}

/* ---------------------------------------------------------------- Programm */

function baueProgrammDemo(roh, opt) {
  const alleFilme = Array.isArray(roh?.filme) ? roh.filme
    : Array.isArray(roh?.data?.filme) ? roh.data.filme : null;
  if (!alleFilme) fehler("Programm-Payload ohne filme[] — ist das die richtige Datei?");

  /* 1. Zeitfenster: die fruehesten N Tage, die in den Daten vorkommen.
        Ein zusammenhaengendes Fenster ist ehrlicher als Rosinenpickerei. */
  const tage = [...new Set(alleFilme.flatMap((f) =>
    (f.vorstellungen || []).map((v) => tagVon(v.zeit)).filter(Boolean)))].sort();
  if (!tage.length) fehler("Keine Vorstellungen mit Zeitangabe gefunden.");
  const fenster = new Set(tage.slice(0, opt.tage));

  /* 2. Haeuser begrenzen: die mit den meisten Vorstellungen im Fenster,
        damit das Ergebnis nicht aus lauter Einzelterminen besteht. */
  const proKino = new Map();
  for (const f of alleFilme) {
    for (const v of f.vorstellungen || []) {
      if (!fenster.has(tagVon(v.zeit))) continue;
      const k = String(v.kino || "");
      proKino.set(k, (proKino.get(k) || 0) + 1);
    }
  }
  const kinos = new Set([...proKino.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, opt.kinos).map(([k]) => k));

  /* 3. Filme filtern, kuerzen und durch die Positivliste schicken. */
  const filme = [];
  for (const f of alleFilme) {
    const vorstellungen = (f.vorstellungen || [])
      .filter((v) => fenster.has(tagVon(v.zeit)) && kinos.has(String(v.kino || "")))
      .map((v) => nurErlaubte(v, VORSTELLUNG_FELDER, "vorstellung"));
    if (!vorstellungen.length) continue;
    const film = nurErlaubte(f, FILM_FELDER, "film");
    film.vorstellungen = vorstellungen;
    filme.push(film);
    if (filme.length >= opt.filme) break;
  }
  if (!filme.length) fehler("Nach der Kuerzung bleibt kein Film uebrig — Schalter zu eng?");

  const zeiten = filme.flatMap((f) => f.vorstellungen.map((v) => v.zeit)).sort();
  return {
    payload: {
      demo: true,
      hinweis: "Beispieldaten. Kein aktuelles Kinoprogramm.",
      stand: opt.stand,
      zeitraum: { von: tagVon(zeiten[0]), bis: tagVon(zeiten[zeiten.length - 1]) },
      filme,
    },
    statistik: {
      filme: filme.length,
      vorstellungen: zeiten.length,
      kinos: kinos.size,
      von: tagVon(zeiten[0]),
      bis: tagVon(zeiten[zeiten.length - 1]),
      quelleFilme: alleFilme.length,
    },
  };
}

/* ---------------------------------------------------------------- Streaming */

function baueStreamingDemo(bekanntRoh, entdeckenRoh, opt) {
  const felder = opt.mitBewertungen ? TITEL_FELDER_MIT_BEWERTUNG : TITEL_FELDER;
  const teil = (roh, name) => {
    const titel = Array.isArray(roh?.titel) ? roh.titel : [];
    const gekuerzt = titel.slice(0, opt.titel)
      .map((t) => nurErlaubte(t, felder, name));
    return { ...nurErlaubte(roh, HUELLE_FELDER_STREAMING, name + ".huelle"), titel: gekuerzt };
  };
  const bekannt = teil(bekanntRoh, "bekannt");
  const entdecken = teil(entdeckenRoh, "entdecken");
  return {
    payload: {
      demo: true,
      hinweis: "Beispieldaten. Kein aktueller Streamingkatalog.",
      stand: opt.stand,
      bekannt, entdecken,
    },
    statistik: { bekannt: bekannt.titel.length, entdecken: entdecken.titel.length },
  };
}

/* ---------------------------------------------------------------- SQL */

function sqlFuer(zeile, payload, opt, herkunft) {
  const json = JSON.stringify(payload);
  const marke = "kddemo";
  if (json.includes("$" + marke + "$")) fehler("Payload enthaelt die SQL-Trennmarke — bitte melden.");
  return [
    "-- " + zeile + " veroeffentlichen. Der Guard verlangt quelle, stand und gueltig_bis.",
    "insert into public.kd_catalog (name, payload, quelle, stand, gueltig_bis)",
    "values ('" + zeile + "', $" + marke + "$" + json + "$" + marke + "$::jsonb,",
    "        '" + herkunft.quelle + "', timestamptz '" + herkunft.stand + "', timestamptz '" + opt.gueltigBis + "')",
    "on conflict (name) do update set",
    "  payload = excluded.payload, quelle = excluded.quelle,",
    "  stand = excluded.stand, gueltig_bis = excluded.gueltig_bis, updated_at = now();",
  ].join("\n");
}

/* ---------------------------------------------------------------- Hauptlauf */

const a = argumente(process.argv.slice(2));

if (a.hilfe || a.help || (!a.programm && !a["streaming-bekannt"])) {
  console.log(`
Demo-Schnappschuss fuer den oeffentlichen Katalog bauen.

  node tools/demo_snapshot.mjs --programm <datei.json> [Schalter]
  node tools/demo_snapshot.mjs --streaming-bekannt <a.json> --streaming-entdecken <b.json>

Schalter (Voreinstellungen bewusst knapp — der Schnappschuss soll die App
zeigen, nicht als Kinoprogramm brauchbar sein):

  --tage N            Programmtage im Fenster          (Vorgabe 3)
  --kinos N           Spielstaetten                    (Vorgabe 5)
  --filme N           Filme                            (Vorgabe 12)
  --titel N           Streaming-Titel je Liste         (Vorgabe 15)
  --gueltig-tage N    Gueltigkeit ab jetzt             (Vorgabe 30)
  --stand <ISO>       Datenstand der Quelle            (Vorgabe: aus den Daten)
  --quelle <slug>     Herkunft aus kd_quellen          (Vorgabe film_at bzw. watchmode)
  --mit-bewertungen   persoenliche Bewertungen mitveroeffentlichen (Vorgabe: nein)
  --out <verzeichnis> Ausgabeverzeichnis               (Vorgabe ./demo-schnappschuss)

Das Werkzeug schreibt nie in die Datenbank. Es legt die Payloads und eine
SQL-Datei ab; ausgefuehrt wird von Hand im Supabase-SQL-Editor.
`);
  process.exit(a.hilfe || a.help ? 0 : 2);
}

const jetzt = new Date();
const opt = {
  tage: zahl(a.tage, 3),
  kinos: zahl(a.kinos, 5),
  filme: zahl(a.filme, 12),
  titel: zahl(a.titel, 15),
  mitBewertungen: !!a["mit-bewertungen"],
  out: String(a.out || "demo-schnappschuss"),
  gueltigBis: new Date(jetzt.getTime() + zahl(a["gueltig-tage"], 30) * 864e5).toISOString(),
  stand: null,
  quelle: null,
};

if (!existsSync(opt.out)) mkdirSync(opt.out, { recursive: true });

const ergebnisse = [];

if (a.programm) {
  const roh = lies(a.programm);
  opt.stand = String(a.stand || roh?.erstellt || roh?.stand || "");
  if (!/^\d{4}-\d{2}-\d{2}/.test(opt.stand)) {
    fehler("Kein Datenstand bestimmbar. Setze ihn mit --stand <ISO-Zeitpunkt>.\n"
      + "  Der Stand ist Pflicht: ohne ihn ist ein Schnappschuss von aktuellen Daten\n"
      + "  nicht zu unterscheiden, und der Datenbank-Guard weist ihn ab.");
  }
  opt.quelle = String(a.quelle || "film_at");
  const { payload, statistik } = baueProgrammDemo(roh, opt);
  writeFileSync(join(opt.out, "programm_demo.json"), JSON.stringify(payload, null, 1));
  /* Herkunft je Zeile festhalten: Programm und Streaming haben eigene
     Datenstaende und eigene Quellen. Sie sich teilen zu lassen hiesse, die
     eine Zeile mit dem Stand der anderen zu etikettieren. */
  ergebnisse.push({ zeile: "programm_demo", payload, statistik, herkunft: { stand: opt.stand, quelle: opt.quelle } });
}

if (a["streaming-bekannt"] || a["streaming-entdecken"]) {
  const bekannt = a["streaming-bekannt"] ? lies(a["streaming-bekannt"]) : {};
  const entdecken = a["streaming-entdecken"] ? lies(a["streaming-entdecken"]) : {};
  opt.stand = String(a.stand || bekannt?.stand || entdecken?.stand || opt.stand || "");
  if (!/^\d{4}-\d{2}-\d{2}/.test(opt.stand)) fehler("Kein Datenstand bestimmbar. Setze --stand <ISO>.");
  opt.quelle = String(a.quelle || "watchmode");
  const { payload, statistik } = baueStreamingDemo(bekannt, entdecken, opt);
  writeFileSync(join(opt.out, "streaming_demo.json"), JSON.stringify(payload, null, 1));
  ergebnisse.push({ zeile: "streaming_demo", payload, statistik, herkunft: { stand: opt.stand, quelle: opt.quelle } });
}

const sql = ergebnisse.map((e) => sqlFuer(e.zeile, e.payload, opt, e.herkunft)).join("\n\n");
writeFileSync(join(opt.out, "publish_demo.sql"), sql + "\n");

/* ---------------------------------------------------------------- Vorschau */

console.log("\n=== Demo-Schnappschuss — Vorschau vor dem Veroeffentlichen ===\n");
for (const e of ergebnisse) {
  console.log("  " + e.zeile + ":");
  for (const [k, v] of Object.entries(e.statistik)) console.log("    " + k.padEnd(16) + v);
  console.log("    " + "stand".padEnd(16) + e.herkunft.stand);
  console.log("    " + "quelle".padEnd(16) + e.herkunft.quelle);
}
console.log("\n  Gueltig bis:          " + opt.gueltigBis);
console.log("  Bewertungen:          " + (opt.mitBewertungen ? "MIT (bewusst gesetzt)" : "ohne"));

const rausgeworfen = [...entfernt].sort();
console.log("\n  Entfernte Felder (" + rausgeworfen.length + "):");
if (!rausgeworfen.length) console.log("    (keine — Eingabe enthielt nur erlaubte Felder)");
for (const f of rausgeworfen) console.log("    - " + f);

console.log("\n  Geschrieben nach: " + resolve(opt.out));
console.log("\n  NAECHSTER SCHRITT: publish_demo.sql ansehen, dann im Supabase-SQL-Editor");
console.log("  ausfuehren. Alles darin ist danach OHNE Anmeldung oeffentlich lesbar.\n");
