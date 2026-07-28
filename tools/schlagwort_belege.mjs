#!/usr/bin/env node
/* ============================================================================
   schlagwort_belege.mjs — Belegpflicht für die Geschmacks-Schlagwörter
   ----------------------------------------------------------------------------
   WOZU
   Jedes Schlagwort in src/data/geschmack_schlagwoerter.json behauptet eine
   Trefferzahl im echten Bestand. Dieses Skript RECHNET diese Zahlen neu und
   vergleicht sie mit den gespeicherten. Es schreibt keine Zahl ab.

   Der Grund ist das „E18-Muster": ein plausibel zusammengestelltes Vokabular,
   das die tatsächlichen Schreibweisen der Daten nicht traf und deshalb STILL
   ins Leere lief — kein Fehler, keine leere Liste, nur schlechtere Treffer.
   Etappe 6 fand denselben Fehler in genreKey() wieder ("komodie" vs
   "komoedie"). Ein Schlagwort, das der Nutzer wählt und das dann nichts
   bewirkt, ist totes Gewicht in seinem Profil.

   Deshalb wird hier mit DEMSELBEN genreKey()/norm() gemessen, das die App
   benutzt — importiert aus src/lib/, nicht nachgebaut. Ein Nachbau würde eine
   Wirkung messen, die es im Produkt nicht gibt.

   ERWARTETE DATEIEN (die Beta-Daten liegen NICHT im Repo — sie sind
   persönlich und stehen im privaten Daten-Repo bzw. im Beta-Build):
     <daten>/programm.json           Wiener Kinoprogramm  (Feld filme[])
     <daten>/streaming_bekannt.json  bewerteter Bestand   (Feld titel[])
     <daten>/streaming_entdecken.json  Streaming-Katalog  (Feld titel[]) — optional,
                                     dient nur der Reichweiten-Prüfung
   Standardpfad: /mnt/user-data/uploads/kinodreieck-app/dist-single-beta/
   Anderer Pfad: --daten=/pfad/zum/ordner  oder  KD_DATEN=/pfad/zum/ordner

   FEHLEN DIE DATEIEN, bricht das Skript mit Code 2 und einer Anleitung ab —
   NICHT mit „0 Treffer". Eine stille Null wäre genau die Lüge, gegen die das
   Skript existiert.

   AUFRUF
     node tools/schlagwort_belege.mjs                 # prüfen (Exit 1 bei Abweichung)
     node tools/schlagwort_belege.mjs --schreiben     # gemessene Zahlen in die Liste schreiben
     node tools/schlagwort_belege.mjs --kollisionen   # zusätzlich: Übertreffer-Bericht
     node tools/schlagwort_belege.mjs --daten=/pfad

   EXIT-CODES
     0 = alles deckungsgleich · 1 = Abweichung/Verstoß · 2 = Daten fehlen
   ============================================================================ */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { genreKey } from "../src/lib/finder.js";
import { norm, schlagseite } from "../src/lib/match.js";
import { SIGNAL_ARTEN, RICHTUNGEN, QUELLEN, pruefeSignal } from "../src/lib/profil.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const LISTE = join(HIER, "..", "src", "data", "geschmack_schlagwoerter.json");
const STANDARD_DATEN = "/mnt/user-data/uploads/kinodreieck-app/dist-single-beta";

const argv = process.argv.slice(2);
const flagge = (n) => argv.includes("--" + n);
const wert = (n, fallback) => {
  const t = argv.find((a) => a.startsWith("--" + n + "="));
  return t ? t.slice(n.length + 3) : fallback;
};
const DATEN = resolve(wert("daten", process.env.KD_DATEN || STANDARD_DATEN));

/* ---------- Daten laden (laut oder gar nicht) ---------- */
function lade(name, pflicht = true) {
  const p = join(DATEN, name);
  if (!existsSync(p)) {
    if (!pflicht) return null;
    console.error(`\nFEHLT: ${p}\n`);
    console.error("Die Beta-Daten liegen bewusst nicht im Repo (persönliche Bewertungen).");
    console.error("So kommst du an sie:");
    console.error("  1. Beta-Build/Datenordner mit programm.json, streaming_bekannt.json,");
    console.error("     streaming_entdecken.json besorgen (privates Daten-Repo).");
    console.error("  2. Skript mit --daten=/pfad/zum/ordner starten (oder KD_DATEN setzen).");
    console.error("\nAbbruch OHNE Ergebnis — eine Messung ohne Daten waere eine Behauptung.\n");
    process.exit(2);
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

const progRoh = lade("programm.json");
const bekRoh = lade("streaming_bekannt.json");
const entRoh = lade("streaming_entdecken.json", false);

/* ---------- Korpora auf eine gemeinsame Form bringen ----------
   Bewusst nur die Felder, die es in den echten Daten WIRKLICH gibt:
   - Kino:  genres[] (deutsche Anzeigeform), jahr
   - Bekannt: genre[] (kleingeschrieben), jahr, kategorie, bewertung
   Ein Feld, das hier nicht steht, trägt auch kein Schlagwort (siehe
   `verworfen` in der Liste: regie, land, tags gibt es in diesen Daten nicht). */
const kino = (progRoh.filme || []).map((f) => ({
  titel: String(f.titel || ""),
  jahr: f.jahr || null,
  gkeys: (f.genres || []).map(genreKey),
  tkeys: (f.tags || []).map(genreKey),          // gibt es in diesen Daten NICHT — bleibt leer, absichtlich
  text: norm(f.beschreibung || ""),
  kategorie: null,
  achse: null,
}));
const bekannt = (bekRoh.titel || []).map((t) => ({
  titel: String(t.titel || ""),
  jahr: t.jahr || null,
  gkeys: (t.genre || []).map(genreKey),
  tkeys: (t.tags || []).map(genreKey),          // dito: streaming_bekannt.json fuehrt kein tags-Feld
  text: norm(t.begruendung || ""),
  kategorie: t.kategorie || null,
  achse: schlagseite(t.bewertung),
}));
const entdecken = entRoh ? (entRoh.titel || []).map((t) => ({
  titel: String(t.titel || ""), jahr: t.jahr || null,
  gkeys: (t.genres || []).map(genreKey), tkeys: [], text: "", kategorie: null, achse: null,
})) : null;
/* Fuehrt dieser Korpus ueberhaupt Genres? Im Beta-Bestand trugen ALLE 12.540
   Eintraege `genres: null` -- und damit stand bei jedem Genre-Schlagwort eine
   "0" in der Entdecken-Spalte, die wie ein Messergebnis aussah ("trifft im
   Streaming-Katalog nichts"), tatsaechlich aber nur hiess "dieser Korpus
   kennt das Feld nicht". Das ist das E18-Muster eine Ebene hoeher: eine Zahl,
   die Wirkung behauptet, wo gar nicht gemessen werden konnte. Die Spalte
   sagt jetzt "—" statt "0". */
const entdeckenHatGenres = entdecken ? entdecken.some((t) => t.gkeys.length > 0) : false;

/* hatWort ist in finder.js:32 nicht exportiert — hier ZEICHENGLEICH kopiert.
   Wird nur für `ziele.text` gebraucht (Nachweis, dass Freitext-Schlagwörter
   nicht tragen). Ändert sich die Regel dort, muss sie hier mitwandern; der
   Nachbau ist die Ausnahme, nicht das Verfahren. */
const hatWort = (text, phrase) => {
  if (phrase.includes(" ")) return text.includes(phrase);
  if ((" " + text + " ").includes(" " + phrase + " ")) return true;
  return phrase.length >= 5 && text.split(" ").some((tok) => tok.startsWith(phrase));
};

/* ---------- Trefferregel ----------
   EXAKTER genreKey-Vergleich, nicht die tolerante Teilzeichen-Variante aus
   sucheKino()/sucheEntdecken() (finder.js:483, :750). Absicht: Der exakte
   Vergleich ist die STRENGERE der beiden Regeln, die in der App vorkommen.
   Wer die tolerante Regel benutzt, bekommt mindestens diese Treffer — die
   gemessene Zahl ist damit eine Untergrenze und nie geschönt.
   Deshalb nennt jedes Schlagwort seine Zielschreibweisen EINZELN, so wie sie
   in den Daten stehen ("sci-fi" UND "Science Fiction"), statt sich auf eine
   Teilzeichen-Tolerierung zu verlassen, die es im Master-Pfad nicht gibt. */
function trifft(film, ziele) {
  const gz = (ziele.genres || []).map(genreKey);
  if (gz.length && film.gkeys.some((k) => gz.includes(k))) return true;
  const tz = (ziele.tags || []).map(genreKey);
  if (tz.length && film.tkeys.some((k) => tz.includes(k))) return true;
  if ((ziele.kategorien || []).length && film.kategorie && ziele.kategorien.includes(film.kategorie)) return true;
  if (ziele.achse && film.achse === ziele.achse) return true;
  /* Freitext: Beschreibung (Kino) bzw. Begründung (bewertet). KEIN Suchpfad
     der App liest diese Felder — die Zahl belegt hier nur, OB der Begriff im
     Bestand überhaupt vorkommt, nicht dass er wirkt. Genau deshalb stehen
     text-basierte Kandidaten in `verworfen`. */
  if ((ziele.text || []).length && film.text && ziele.text.some((w) => hatWort(film.text, norm(w)))) return true;
  if (ziele.jahr_min || ziele.jahr_max) {
    if (!film.jahr) return false;                    // ohne Jahr keine Aussage
    if (ziele.jahr_min && film.jahr < ziele.jahr_min) return false;
    if (ziele.jahr_max && film.jahr > ziele.jahr_max) return false;
    return true;
  }
  return false;
}

/* Reihen-Konzentration: Wie groß ist der größte Titel-Cluster unter den
   Treffern? Proxy ist das erste Wort des normalisierten Titels (norm() wirft
   führende Artikel weg). Grund: „stunt" hatte 5 Treffer — alle fünf hießen
   Jackass. Eine Zahl, die von einer einzigen Reihe getragen wird, belegt
   keinen Geschmack, sondern einen Sammlungszufall. Ein Feld `reihe` oder
   `franchise` gibt es in diesen Daten nicht (nur in der Masterliste), sonst
   stuende hier der echte Wert. */
function konzentration(treffer) {
  if (!treffer.length) return 0;
  const m = new Map();
  for (const f of treffer) {
    const c = norm(f.titel).split(" ")[0] || f.titel;
    m.set(c, (m.get(c) || 0) + 1);
  }
  return Math.max(...m.values()) / treffer.length;
}

function messe(ziele) {
  const tk = kino.filter((f) => trifft(f, ziele));
  const tb = bekannt.filter((f) => trifft(f, ziele));
  const alle = [...tk, ...tb];
  const r = {
    kino: tk.length,
    bekannt: tb.length,
    gesamt: tk.length + tb.length,
    konzentration: Number(konzentration(alle).toFixed(2)),
  };
  if (entdecken) r.entdecken = entdecken.filter((f) => trifft(f, ziele)).length;
  return r;
}

/* ---------- Liste lesen ---------- */
if (!existsSync(LISTE)) {
  console.error("FEHLT: " + LISTE + " — ohne Liste gibt es nichts zu belegen.");
  process.exit(2);
}
const liste = JSON.parse(readFileSync(LISTE, "utf8"));
const schwelle = liste.schwelle || {};
const MIN_KINO = schwelle.min_kino ?? 10;
const MIN_BEKANNT = schwelle.min_bekannt ?? 5;
const MAX_KONZ = schwelle.max_konzentration ?? 0.5;

/* ---------- Sicherheitsform des gespeicherten Werts ----------
   Die Schlagwörter reisen ab Etappe 8 in JEDE Prompt-Fassung
   (profil.js:promptFassung baut daraus Bullet-Zeilen). Sie sehen dort nicht
   wie Nutzereingabe aus — genau deshalb nennt der injection-Auftrag der
   Phase 4 sie als Angriffsfläche. profil.js verbietet nur Steuerzeichen
   (VERBOTENE_ZEICHEN, profil.js:88); hier gilt eine SCHÄRFERE Form: nur
   ASCII-Kleinbuchstaben, Ziffern und Unterstrich. Damit ist kein
   Anführungszeichen, kein Backtick, kein Doppelpunkt, keine Klammer und kein
   Unicode-Trennzeichen möglich, das eine Prompt-Struktur aufbrechen könnte. */
const WERT_FORM = /^[a-z0-9_]{1,32}$/;

const zeilen = [];
const fehler = [];
const warnungen = [];

function pruefeEintrag(e, { istVerworfen }) {
  const gemessen = messe(e.ziele || {});
  const gespeichert = e.treffer || null;
  /* ALLE gespeicherten Zahlen vergleichen, nicht nur die drei, die in die
     Schwellenregel eingehen. `konzentration` und `entdecken` liessen sich
     vorher beliebig verfaelschen, ohne dass das Skript ein Wort sagte --
     zwei Zahlen, die in der Datei stehen, belegt aussehen und es nicht
     waren. Die Durchsetzung war nie betroffen (die Regel rechnet auf der
     GEMESSENEN Konzentration), die Dokumentation schon.
     `entdecken` nur, wenn der Korpus ueberhaupt geladen ist -- sonst
     verglichen wir gegen eine Null, die "nicht gemessen" bedeutet. */
  const felder = ["kino", "bekannt", "gesamt", "konzentration"];
  if (entdecken) felder.push("entdecken");
  const abw = gespeichert
    ? felder.filter((k) => gespeichert[k] !== gemessen[k])
    : ["(keine gespeicherte Zahl)"];
  if (flagge("schreiben")) e.treffer = gemessen;
  else if (abw.length) fehler.push(`${e.id}: Trefferzahl weicht ab (${abw.join(", ")}) — gespeichert ${JSON.stringify(gespeichert)}, gemessen ${JSON.stringify(gemessen)}`);

  if (!istVerworfen) {
    if (!WERT_FORM.test(e.wert || "")) fehler.push(`${e.id}: wert "${e.wert}" verletzt die Prompt-Sicherheitsform ${WERT_FORM}`);
    if (!SIGNAL_ARTEN.includes(e.art)) fehler.push(`${e.id}: art "${e.art}" steht nicht in SIGNAL_ARTEN`);
    if (!e.anzeige || e.anzeige === e.wert) warnungen.push(`${e.id}: Anzeige und Wert sollten getrennt sein`);
    /* Schwelle: mindestens EIN Pfad muss tragen. Kino und Mediathek sind in
       der App zwei getrennte Antwortwege (sucheKino vs. sucheFinder) — ein
       Schlagwort, das nur einen davon bedient, wirkt dort trotzdem echt. */
    const traegt = gemessen.kino >= MIN_KINO || gemessen.bekannt >= MIN_BEKANNT;
    if (!traegt) fehler.push(`${e.id}: unter Schwelle (kino ${gemessen.kino} < ${MIN_KINO} UND bekannt ${gemessen.bekannt} < ${MIN_BEKANNT}) — gehoert nach "verworfen"`);
    if (gemessen.gesamt >= 5 && gemessen.konzentration > MAX_KONZ)
      fehler.push(`${e.id}: ${(gemessen.konzentration * 100).toFixed(0)}% der Treffer sind EINE Reihe (max ${MAX_KONZ * 100}%) — belegt keinen Geschmack`);

    /* Gegenprobe: Das Schlagwort muss als Signal in BEIDEN Richtungen durch
       pruefeSignal() gehen. „Ich mag keine Musicals" hilft nur, wenn die
       Ablehnung ein gültiges Signal ergibt UND etwas trifft (Zahl oben). */
    for (const richtung of ["zieht_an", "stoesst_ab"]) {
      const probe = {
        art: e.art, wert: e.wert, richtung, staerke: 3, sicherheit: "hoch",
        quelle: "schlagwort", beleg: e.beleg,
      };
      const f = pruefeSignal(probe);
      if (f.length) fehler.push(`${e.id}/${richtung}: pruefeSignal meldet ${JSON.stringify(f)}`);
    }
    /* `ziele_unbelegt` ist eine HYPOTHESE ueber einen Bestand, der hier nicht
       vorliegt (v3-Masterliste). Sie wird bewusst NICHT mitgemessen und nicht
       in `treffer` eingerechnet — sie soll aber bei jedem Lauf sichtbar
       bleiben, damit niemand sie fuer belegt haelt. Genau so entstand E18. */
    if (e.ziele_unbelegt) warnungen.push(`${e.id}: traegt ziele_unbelegt ${JSON.stringify(e.ziele_unbelegt)} — NICHT gemessen, vor Gebrauch an der echten Masterliste pruefen`);
    if (!QUELLEN.includes("schlagwort")) fehler.push("profil.js kennt die Quelle 'schlagwort' nicht mehr");
    if (!RICHTUNGEN.includes("stoesst_ab")) fehler.push("profil.js kennt die Richtung 'stoesst_ab' nicht mehr");
  }

  zeilen.push({
    id: e.id, anzeige: e.anzeige, art: e.art || "-", gruppe: e.gruppe || (istVerworfen ? "VERWORFEN" : "-"),
    ...gemessen, grund: e.grund || "",
    /* Ist die Entdecken-Zahl fuer DIESEN Eintrag ueberhaupt eine Messung?
       Genre-Ziele sind es nur, wenn der Korpus Genres fuehrt; Jahresziele
       immer, denn `jahr` steht dort bei jedem Titel. */
    messbarImEntdecken: entdeckenHatGenres
      || !!(e.ziele && (e.ziele.jahr_min || e.ziele.jahr_max)),
  });
  return gemessen;
}

for (const e of liste.schlagwoerter || []) pruefeEintrag(e, { istVerworfen: false });
for (const e of liste.verworfen || []) pruefeEintrag(e, { istVerworfen: true });

/* ---------- Übertreffer-Bericht (--kollisionen) ----------
   Das E18-Muster hat zwei Seiten. Untertreffen (Ziel trifft nichts) fängt die
   Schwelle ab. Übertreffen fängt niemand ab: sucheKino()/sucheEntdecken()
   vergleichen Genre-Schlüssel mit `includes` in BEIDE Richtungen — ein Ziel
   "musik" trifft dort auch "Musikfilm / Musical". Meist gewollt, manchmal
   nicht. Diese Liste zeigt, was ein Ziel unter der toleranten Regel ZUSÄTZLICH
   einfängt, damit die Entscheidung sichtbar getroffen wird statt still. */
if (flagge("kollisionen")) {
  const keys = [...new Set([...kino, ...bekannt].flatMap((f) => f.gkeys))];
  console.log("\n--- Uebertreffer unter der toleranten Regel (finder.js:483/:750) ---");
  for (const e of liste.schlagwoerter || []) {
    const ziele = (e.ziele?.genres || []).map(genreKey);
    if (!ziele.length) continue;
    const extra = keys.filter((k) => !ziele.includes(k) && ziele.some((z) => k.includes(z) || z.includes(k)));
    if (extra.length) console.log(`  ${e.id}: zusaetzlich ${extra.join(", ")}`);
  }
}

/* ---------- Ausgabe ---------- */
const p = (s, n) => String(s).padEnd(n).slice(0, n);
const z = (s, n) => String(s).padStart(n);
console.log("\nDaten: " + DATEN);
console.log(`Korpora: Kino ${kino.length} · bewertet ${bekannt.length}` + (entdecken ? ` · entdecken ${entdecken.length}` : " · entdecken (nicht geladen)"));
if (entdecken && !entdeckenHatGenres) {
  console.log(`HINWEIS: Kein einziger der ${entdecken.length} Entdecken-Titel fuehrt Genres.`);
  console.log("         Die Entdecken-Spalte steht bei Genre-Schlagwoertern deshalb auf \"—\" (nicht messbar),");
  console.log("         nicht auf 0 (gemessen, trifft nichts). Wirksam sind dort nur Jahr und Jahrzehnt.");
}
console.log(`Schwelle: kino >= ${MIN_KINO} ODER bekannt >= ${MIN_BEKANNT}; Reihen-Konzentration <= ${MAX_KONZ * 100}%\n`);
console.log(p("id", 20) + p("art", 8) + p("gruppe", 12) + z("kino", 6) + z("bekannt", 8) + z("gesamt", 7) + z("konz", 6) + (entdecken ? z("entd.", 7) : "") + "  grund");
console.log("-".repeat(entdecken ? 108 : 101));
for (const r of zeilen) {
  console.log(p(r.id, 20) + p(r.art, 8) + p(r.gruppe, 12) + z(r.kino, 6) + z(r.bekannt, 8) + z(r.gesamt, 7)
    + z((r.konzentration * 100).toFixed(0) + "%", 6)
    /* Die Marke gilt JE EINTRAG, nicht je Korpus. Fuehrt der Korpus keine
       Genres, ist eine Genre-Zahl nicht messbar ("—") -- aber die
       Epochen-Schlagwoerter messen ueber `jahr` und haben dort sehr wohl
       echte Treffer (526 bis 5632). Die Marke pauschal ueber die Spalte zu
       legen versteckte ausgerechnet die einzigen Zahlen, die die Kopfzeile
       darueber ausdruecklich als wirksam bezeichnet. */
    + (entdecken ? z(r.messbarImEntdecken ? (r.entdecken ?? "-") : "—", 7) : "") + "  " + r.grund);
}

if (flagge("schreiben")) {
  writeFileSync(LISTE, JSON.stringify(liste, null, 1) + "\n");
  console.log("\nGeschrieben: " + LISTE);
}
for (const w of warnungen) console.log("HINWEIS: " + w);
if (fehler.length) {
  console.error("\n" + fehler.length + " VERSTOSS/ABWEICHUNG:");
  for (const f of fehler) console.error("  - " + f);
  process.exit(1);
}
console.log("\nAlle Schlagwoerter belegt: gespeicherte Zahlen = gemessene Zahlen.");
