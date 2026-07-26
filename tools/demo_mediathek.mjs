#!/usr/bin/env node
/* ============================================================================
   Kinodreieck · Etappe 4 · Demo-Mediathek aus einem Backup bauen
   ----------------------------------------------------------------------------
   Erzeugt aus einem App-Backup die oeffentliche Demo-Beilage: die Zeilen mit
   `scope=demo` in `kd_store`, aus denen der Demo-Start seine Mediathek zieht.

   WICHTIG ZUM VERSTAENDNIS
   Der Demo-Bestand lebt NICHT nur im Browser. Er liegt in der Datenbank und ist
   ohne Anmeldung fuer jeden abrufbar — so funktioniert der Demo-Start ueberhaupt
   (die App holt ihn und haelt ihn dann im Arbeitsspeicher, bis jemand etwas
   aendert). Alles, was hier durchgeht, ist oeffentlich.

   POSITIVLISTE STATT VERBOTSLISTE
   Uebernommen wird nur, was unten ausdruecklich steht — auch Felder, die es
   heute noch gar nicht gibt, fallen weg. Genau so ist im Juli eine Datei mit
   100 persoenlichen Bewertungen ins oeffentliche Repo geraten: eine Verbotsliste
   kannte das neue Feld nicht.

   WAS BEWUSST DRAUSSEN BLEIBT
     quelle        verraet Besitz und Abos (dvd / prime / apple)
     notiz         private Sammlungsnotizen ("12-Disc-Box in Sammlung")
     bewertet_von  Urheberzuschreibung der Bewertung
     import_*      Betriebsdaten
     film_at_id    quellinterne Kennung
     artikel       Blogtexte samt Autornamen
     im_besitz     bei Must-Watch: Besitzangabe

   SCHREIBT NIE IN DIE DATENBANK — erzeugt Dateien und fertiges SQL.
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

/* Ein Film in der Demo: Werk, Einordnung, Urteil, Begruendung. Das ist der
   inhaltliche Kern der App — ohne ihn zeigt die Demo eine leere Huelle. */
const FILM_FELDER = [
  "id", "titel", "originaltitel", "jahr", "jahr_bis", "typ",
  "kategorie", "genre", "tags", "bewertung", "begruendung", "must_watch",
];

/* Must-Watch: Titel und Verknuepfung ins Werk. Ohne Besitzangabe und Notiz. */
const MUSTWATCH_FELDER = ["id", "titel", "verknuepfung"];

/* Neutrale Dienste-Vorauswahl statt der echten Abo-Liste. Zeigt die Funktion,
   ohne zu verraten, was der Betreiber tatsaechlich abonniert hat. */
const DIENSTE_DEMO = { quellen: ["Netflix", "Disney+", "Prime Video"], heuristik: true };

const entfernt = new Set();

function nurErlaubte(o, erlaubt, pfad) {
  const raus = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (erlaubt.includes(k)) raus[k] = v;
    else entfernt.add(pfad + "." + k);
  }
  return raus;
}

function zahl(w, s) { const n = Number(w); return Number.isFinite(n) && n > 0 ? Math.floor(n) : s; }

function argumente(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith("--")) { a._.push(t); continue; }
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[t.slice(2)] = true;
    else { a[t.slice(2)] = n; i += 1; }
  }
  return a;
}

function fehler(t) { console.error("\nAbbruch: " + t + "\n"); process.exit(2); }

const a = argumente(process.argv.slice(2));

if (a.hilfe || a.help || !a.backup) {
  console.log(`
Demo-Mediathek aus einem App-Backup bauen.

  node tools/demo_mediathek.mjs --backup <kinodreieck_backup_*.json> [Schalter]

  --filme N       wie viele Filme in die Demo      (Vorgabe 120)
  --mustwatch N   wie viele Must-Watch-Eintraege   (Vorgabe 25)
  --alle-felder   Positivliste umgehen             (NICHT verwenden)
  --out <verz>    Ausgabeverzeichnis               (Vorgabe ./demo-mediathek)

Bevorzugt werden Filme mit Bewertung UND Begruendung — sie zeigen, wofuer die
App da ist. Das Werkzeug schreibt nie in die Datenbank.
`);
  process.exit(a.hilfe || a.help ? 0 : 2);
}

let backup;
try { backup = JSON.parse(readFileSync(resolve(a.backup), "utf8")); }
catch (e) { fehler("Backup nicht lesbar: " + e.message); }

if (backup.format !== "kinodreieck-backup") {
  fehler("Das ist kein Kinodreieck-Backup (Feld `format` passt nicht).");
}

const alleFilme = backup?.masterliste?.filme;
if (!Array.isArray(alleFilme) || !alleFilme.length) fehler("Backup ohne masterliste.filme.");

const grenzeFilme = zahl(a.filme, 120);
const grenzeMw = zahl(a.mustwatch, 25);
const out = String(a.out || "demo-mediathek");
if (!existsSync(out)) mkdirSync(out, { recursive: true });

/* Auswahl: erst Filme mit Urteil UND Begruendung (die tragen die Demo), dann
   nur mit Urteil, dann der Rest. Innerhalb der Gruppen die Reihenfolge des
   Bestands — keine Rosinenpickerei nach Note. */
const wert = (f) => (f.bewertung && f.bewertung.wie != null ? 2 : 0)
  + (f.begruendung && f.begruendung.trim().length > 20 ? 1 : 0);
const sortiert = alleFilme.map((f, i) => ({ f, i })).sort((x, y) => (wert(y.f) - wert(x.f)) || (x.i - y.i));

const felder = a["alle-felder"] ? null : FILM_FELDER;
const filme = sortiert.slice(0, grenzeFilme)
  .map(({ f }) => (felder ? nurErlaubte(f, felder, "film") : f));

const mwRoh = Array.isArray(backup.must_watch_liste) ? backup.must_watch_liste : [];
const mustwatch = mwRoh.slice(0, grenzeMw)
  .map((e) => (felder ? nurErlaubte(e, MUSTWATCH_FELDER, "mustwatch") : e));

if (Array.isArray(backup.artikel) && backup.artikel.length) entfernt.add("artikel (Blogtexte samt Autor)");
if (backup.streaming_dienste) entfernt.add("streaming_dienste (echte Abo-Liste -> neutrale Vorauswahl)");
if (backup.autor) entfernt.add("autor");
if (backup.einstellungen) entfernt.add("einstellungen");
if (backup.achievements) entfernt.add("achievements");

const master = {
  meta: {
    name: "Kinodreieck Demo-Mediathek",
    version: "demo-2",
    erstellt_am: new Date().toISOString().slice(0, 10),
    hinweis: "Beispieldaten fuer den Demo-Start. Gekuerzter Auszug ohne persoenliche Angaben.",
    bewertungsmodell: backup?.masterliste?.meta?.bewertungsmodell || undefined,
  },
  filme,
};

/* Die Bloecke, die der Demo-Start aus kd_store liest (siehe demoLadung in
   src/App.jsx): kd:master, kd:mustwatch, kd:streaming-dienste, kd:kino-pins,
   kd:artikel. Was hier fehlt, bleibt in der Demo einfach leer. */
const bloecke = {
  "kd:master": master,
  "kd:mustwatch": { eintraege: mustwatch },
  "kd:streaming-dienste": DIENSTE_DEMO,
  "kd:kino-pins": [],
};

writeFileSync(join(out, "demo_bloecke.json"), JSON.stringify(bloecke, null, 1));

const marke = "kddemo";
const zeilen = Object.entries(bloecke).map(([key, wertObj]) => {
  const json = JSON.stringify(wertObj);
  if (json.includes("$" + marke + "$")) fehler("Inhalt enthaelt die SQL-Trennmarke — bitte melden.");
  return "  ('demo', '" + key + "', $" + marke + "$" + json + "$" + marke + "$)";
});

const sql = [
  "-- Demo-Mediathek veroeffentlichen (kd_store, scope=demo).",
  "-- ACHTUNG: alles hier ist danach OHNE Anmeldung oeffentlich lesbar.",
  "insert into public.kd_store (scope, key, value) values",
  zeilen.join(",\n"),
  "on conflict (scope, key) do update set value = excluded.value;",
  "",
  "-- Gegenprobe:",
  "--   begin; set local role anon;",
  "--   select key, length(value) from public.kd_store where scope = 'demo' order by key;",
  "--   rollback;",
].join("\n");

writeFileSync(join(out, "publish_demo_mediathek.sql"), sql + "\n");

console.log("\n=== Demo-Mediathek — Vorschau vor dem Veroeffentlichen ===\n");
console.log("  Filme in der Demo:      " + filme.length + " (von " + alleFilme.length + " im Backup)");
console.log("    davon mit Bewertung:  " + filme.filter((f) => f.bewertung && f.bewertung.wie != null).length);
console.log("    davon mit Begruendung:" + filme.filter((f) => f.begruendung && String(f.begruendung).trim().length > 20).length);
console.log("  Must-Watch-Eintraege:   " + mustwatch.length + " (von " + mwRoh.length + ")");
console.log("  Dienste-Vorauswahl:     " + DIENSTE_DEMO.quellen.join(", "));

const raus = [...entfernt].sort();
console.log("\n  Entfernt (" + raus.length + "):");
for (const f of raus) console.log("    - " + f);

console.log("\n  Geschrieben nach: " + resolve(out));
console.log("\n  NAECHSTER SCHRITT: publish_demo_mediathek.sql ansehen, dann im");
console.log("  Supabase-SQL-Editor ausfuehren.\n");
