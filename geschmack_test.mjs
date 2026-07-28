/* Etappe 7, Phase 2c — src/lib/geschmack.js und die Filmrichtungen in profil.js.
   ===========================================================================
   WARUM DIESE DATEI EXISTIERT
   ---------------------------------------------------------------------------
   `geschmack.js` ist die Umrechnung „angekreuzte Chips → gültige Profil-
   Signale". Sie ist bewusst aus der Oberfläche herausgezogen worden, weil
   genau hier die Zusagen aus `profil.js` eingehalten oder gebrochen werden.
   Vier davon trägt dieses Modul allein:

     1. BELEGPFLICHT   Jedes erzeugte Signal muss `pruefeSignal` bestehen —
                       nicht an einem Beispiel, sondern für JEDES Schlagwort
                       der Liste in JEDER Richtung. Ein Loch hier erzeugt
                       Signale, die `sammle` still verwirft: der Nutzer klickt
                       21 Chips und im Profil steht nichts.
     2. RICHTUNGS-     Ein Schlagwort kann nicht gleichzeitig `zieht_an` und
        EXKLUSIVITÄT   `stoesst_ab` sein. `profil.js` verhindert das NICHT
                       (die Richtung steckt in `signalId`, beide Züge sind
                       dort gültig) — die Datenform `id -> richtung` ist die
                       einzige Wache. Deshalb wird BEIDES nachgewiesen: dass
                       profil.js es durchlässt und dass geschmack.js es nicht
                       erzeugen kann.
     3. SICHERHEITS-   Jeder gespeicherte `wert` erfüllt /^[a-z0-9_]{1,32}$/ —
        FORM DER WERTE schärfer als `profil.js`, das nur Steuerzeichen
                       verbietet. Die Werte reisen ab Etappe 8 in JEDE
                       Prompt-Fassung; ein Wert mit Anführungszeichen,
                       Backtick, Doppelpunkt oder Umbruch wäre die
                       Injektionsstrecke.
     4. UNBERÜHRTE     Wer eine Achse nicht anfasst, erzeugt keine
        ACHSEN         Achsen-Angabe. `pickRahmen` liest eine fehlende Achse
                       als „unbekannt, nicht ändern"; ein mitgeschickter
                       Startwert bestätigte eine Aussage, die der Nutzer nie
                       gemacht hat.

   Dazu die eine additive Änderung an `profil.js`: `profil.filme` trägt ein
   optionales `richtung`, und `promptFassung` weist Filme nach Richtung
   GETRENNT aus. Der Grund steht im Code: „Genannte Filme: Alien, Jackass"
   lädt jedes Modell dazu ein, beide als Vorlieben zu lesen. Geprüft wird
   deshalb die Trennung, die Disjunktheit der Zeilen UND die Zusage
   „additiv" — ein Profil ohne `richtung` muss zeichengleich denselben Text
   erzeugen wie vor der Änderung.

   KEINE DOPPELABDECKUNG mit profil_test.mjs. Dort steht das Modell von
   profil.js (Belegpflicht über Quellen × Arten, Opt-in, Vorschau, Version,
   Kürzung, Speicher). Hier steht nur, was seit Phase 2c dazugekommen ist,
   und alles, was geschmack.js selbst zusagt.

   ERST MESSEN, DANN PINNEN
   ---------------------------------------------------------------------------
   Kein Check auf ein Verhalten, das nicht vorher gemessen wurde.
   Überraschende Messwerte stehen mit `[gemessen: …]` in der Beschriftung und,
   wo sie ein Defekt sind, als offener Befund in Gruppe X — nicht als grüner
   Pin auf das Ist-Verhalten (Regel aus dem Kopf von finder_test.mjs).

   ECHTE DATEN
   ---------------------------------------------------------------------------
   Gruppe E misst `filmAuswahl` an den echten Beta-Daten (100 bewertete Titel
   unter `titel`). Die Daten liegen bewusst NICHT im Repo — sie sind
   persönlich. Fehlen sie, bleibt Gruppe E LEER (0/0) und die Zusammenfassung
   sagt das laut; sie wird nicht durch grüne Ersatz-Checks vorgetäuscht, und
   es wandern auch keine bewerteten Titel als Fixture in dieses Repo.
     Standardpfad: /mnt/user-data/uploads/kinodreieck-app/dist-single-beta
     Anderer Pfad: KD_DATEN=/pfad/zum/ordner node geschmack_test.mjs
   Gruppe F prüft dieselben Zusagen an einem SYNTHETISCHEN Korpus, der die an
   den echten Daten gemessene Form nachbildet (Kategorienmischung, Reihen-
   Cluster, Titel mit führendem Artikel) — der läuft immer.

   AUSTAUSCHBARE QUELLEN (Mutationstest)
   ---------------------------------------------------------------------------
       GESCHMACK_QUELLE=/tmp/mut1.js node geschmack_test.mjs
       PROFIL_QUELLE=/tmp/mut2.js   node geschmack_test.mjs

   BEFUND AM EIGENEN WERKZEUG (28.07., Runde 2). Die erste Fassung dieses
   Harnischs lud beide Module aus einer `data:`-URL und schrieb dafür JEDEN
   relativen Import von Hand um. Das hielt genau so lange, wie die
   Importliste sich nicht änderte: Die B4-Reparatur fügte `import { norm }
   from "./match.js"` hinzu, und die ganze Datei brach mit
   ERR_UNSUPPORTED_RESOLVE_REQUEST ab — aus einer `data:`-URL lässt sich kein
   relativer Pfad auflösen. Ein Abbruch meldet KEINE roten Checks; das
   Werkzeug hörte einfach auf zu prüfen, und zwar unbemerkt.

   Jetzt zwei Lehren, beide eingebaut:
     1. Im Normalfall werden die ECHTEN Dateien direkt importiert. Kein
        Umschreiben, also immun gegen jeden Import, den jemand hinzufügt.
     2. Für einen Mutationslauf landet die getauschte Fassung als echte
        Datei NEBEN dem Original (`profil.__mut<pid>.js`); relative Importe
        lösen dann normal auf. Genau EINE Ersetzung bleibt übrig — die
        Verlinkung der beiden Kopien untereinander.
     3. Die Kopierstrecke läuft bei JEDEM Lauf einmal mit unveränderten
        Dateien mit (Gruppe A, „der Harnisch trägt"). Reißt sie beim
        nächsten neuen Import wieder, ist das ein ROTER CHECK mit Namen und
        kein stiller Abbruch. Und der Erstimport selbst ist eingefasst: wo
        er scheitert, steht ein benannter Fehlschlag und Exit 1.

   GRUPPEN
   ---------------------------------------------------------------------------
     A  Modell, Konstanten, Liste — und der Harnisch selbst
     B  Belegpflicht: jedes Schlagwort × jede Richtung durch pruefeSignal
     C  Richtungs-Exklusivität — beide Seiten des Nachweises
     D  signaleAusAuswahl: Ränder, Übergangenes, Unversehrtheit
     E  filmAuswahl an den ECHTEN Beta-Daten
     F  filmAuswahl: Zusagen und Ränder am synthetischen Korpus
     G  filmeAusAuswahl
     H  onboardingErgebnis und die unberührten Achsen
     I  Durchstich: echte Schlagwort-Signale durch promptFassung
     J  Die Trennung der Filmrichtungen im Prompt
     K  Rückwärtskompatibilität: Filme ohne `richtung`
     M  Das Messskript tools/schlagwort_belege.mjs — misst es wirklich?
     X  BEFUNDE an geschmack.js / profil.js / der Kuration. Heute rot, NICHT
        exit-relevant. GESCHMACK_STRENG=1 schaltet sie scharf.

   Aufruf: node geschmack_test.mjs
   =========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WURZEL = path.dirname(fileURLToPath(import.meta.url));
const startZeit = Date.now();

/* ---------------------------------------------------------------- Zählwerk */
/* Konvention aus profil_test.mjs / kischalter_test.mjs, samt der Wache gegen
   den eigenen Fehler: `check` ist SYNCHRON, ein Promise wäre truthy und damit
   immer grün. */
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

/* --------------------------------------------------- Module laden (tauschbar) */
/* localStorage muss stehen, bevor storage.js über profil.js geladen wird. */
const _ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => void _ls.set(k, String(v)),
  removeItem: (k) => void _ls.delete(k),
  clear: () => _ls.clear(),
};

const PROFIL_ORIG = path.join(WURZEL, "src/lib/profil.js");
const GESCHMACK_ORIG = path.join(WURZEL, "src/lib/geschmack.js");
const PROFIL_DATEI = process.env.PROFIL_QUELLE || PROFIL_ORIG;
const GESCHMACK_DATEI = process.env.GESCHMACK_QUELLE || GESCHMACK_ORIG;
const MUTATIONSLAUF = !!(process.env.PROFIL_QUELLE || process.env.GESCHMACK_QUELLE);

/* Aufräumen ist Pflicht, nicht Kür: Die Kopien liegen im Quellbaum. Bleibt
   eine liegen, sieht `git status` sie und der Strukturtest womöglich auch. */
const TEMPDATEIEN = [];
const raeumeAuf = () => { for (const f of TEMPDATEIEN.splice(0)) { try { fs.unlinkSync(f); } catch { /* schon weg */ } } };
process.on("exit", raeumeAuf);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { raeumeAuf(); process.exit(130); });

/* Legt `quelle` als Geschwisterdatei neben `vorbild` und gibt den Pfad
   zurück. Weil die Kopie IM SELBEN VERZEICHNIS liegt, lösen alle relativen
   Importe unverändert auf — auch die, die es heute noch nicht gibt. */
let kopieZaehler = 0;
function alsGeschwister(quelle, vorbild, ersetzungen = []) {
  let text = fs.readFileSync(quelle, "utf8");
  for (const [muster, ziel] of ersetzungen) text = text.replace(muster, ziel);
  const ziel = path.join(path.dirname(vorbild),
    path.basename(vorbild, ".js") + ".__mut" + process.pid + "_" + (++kopieZaehler) + ".js");
  fs.writeFileSync(ziel, text);
  TEMPDATEIEN.push(ziel);
  return ziel;
}
const alsUrl = (p2) => "file://" + p2;

/* Beim Mutationslauf müssen BEIDE Module dieselbe Profil-Instanz sehen,
   sonst prüfte man zwei verschiedene Module gegeneinander. Das ist die
   einzige verbliebene Ersetzung — und Gruppe A prüft bei jedem Lauf, dass
   sie noch greift. */
async function ladeModule(profilQuelle, geschmackQuelle, erzwingeKopie = false) {
  if (!erzwingeKopie && profilQuelle === PROFIL_ORIG && geschmackQuelle === GESCHMACK_ORIG) {
    return { P: await import(alsUrl(PROFIL_ORIG)), G: await import(alsUrl(GESCHMACK_ORIG)), kopiert: false };
  }
  const pDatei = alsGeschwister(profilQuelle, PROFIL_ORIG);
  const gDatei = alsGeschwister(geschmackQuelle, GESCHMACK_ORIG,
    [[/(from\s+["'])\.\/profil\.js(["'])/g, "$1./" + path.basename(pDatei) + "$2"]]);
  const g = await import(alsUrl(gDatei));
  const p = await import(alsUrl(pDatei));
  /* Sofort wieder weg — die Module sind geladen und leben im Speicher
     weiter; die Dateien werden nicht mehr gebraucht. */
  raeumeAuf();
  return { P: p, G: g, kopiert: true };
}

let P, G;
try {
  ({ P, G } = await ladeModule(PROFIL_DATEI, GESCHMACK_DATEI));
} catch (e) {
  /* Kein stiller Abbruch. Ein Ladefehler ist ein benannter Fehlschlag mit
     Exit 1 — genau der Unterschied, den der Befund am alten Harnisch
     ausgemacht hat. */
  raeumeAuf();
  console.log("\n✗ FEHLGESCHLAGEN: [A] Die Modul-Ladestrecke trägt: profil.js und geschmack.js lassen sich laden");
  console.log("    " + String(e && e.message ? e.message : e).split("\n")[0]);
  console.log("\nGESCHMACK-TEST: BEFUNDE OBEN — die Ladestrecke ist gerissen, es wurde NICHTS geprüft.");
  process.exit(1);
}

const ST = await import("./src/lib/storage.js");
const topf = new Map();
ST.setStorageDriver({
  name: "test",
  get: async (k) => (topf.has(k) ? { key: k, value: topf.get(k) } : null),
  set: async (k, v) => void topf.set(k, v),
  delete: async (k) => void topf.delete(k),
  list: async () => ({ keys: [...topf.keys()] }),
});

/* --------------------------------------------------------------- Fixtures */
const T0 = "2026-07-28T20:00:00.000Z";
const T1 = "2026-07-28T21:00:00.000Z";
const T2 = "2026-07-28T22:00:00.000Z";
const ein = () => P.erteileEinwilligung(P.leeresProfil(), T0);
const LISTE_ROH = JSON.parse(fs.readFileSync(path.join(WURZEL, "src/data/geschmack_schlagwoerter.json"), "utf8"));
const ALLE = G.schlagwoerter();

/* Dieselbe Form, die tools/schlagwort_belege.mjs erzwingt (dort WERT_FORM).
   Hier zeichengleich wiederholt, weil sie eine Zusage AN DIE LISTE ist und
   nicht am Werkzeug hängen darf: wer das Skript nicht laufen lässt, soll den
   Verstoß trotzdem im Test sehen. */
const WERT_FORM = /^[a-z0-9_]{1,32}$/;

/* Die echten Beta-Daten. Nicht im Repo (persönliche Bewertungen) — siehe
   Dateikopf. */
const DATEN = process.env.KD_DATEN || "/mnt/user-data/uploads/kinodreieck-app/dist-single-beta";
const BEKANNT_DATEI = path.join(DATEN, "streaming_bekannt.json");
const ECHT = fs.existsSync(BEKANNT_DATEI)
  ? (JSON.parse(fs.readFileSync(BEKANNT_DATEI, "utf8")).titel || [])
  : null;

/* Synthetischer Korpus. Er bildet die an den echten Daten GEMESSENE Form nach
   und erfindet sie nicht: 100 Einträge, davon 52 in FILM_KATEGORIEN und 48 in
   der bewusst ausgeschlossenen weichen Mitte `sehenswert`; Reihen-Cluster von
   4 / 4 / 3 / 2 Titeln; 14 Titel mit führendem Artikel „The". Titel und IDs
   sind erfunden — Max' bewertete Titel gehören nicht ins öffentliche Repo. */
const KORPUS = (() => {
  const aus = [];
  const push = (titel, kategorie, jahr) => aus.push({ id: "s" + aus.length, titel, jahr, kategorie });
  /* Reihe mit 4 Titeln (entspricht Evangelion/Jackass im echten Bestand) */
  for (let i = 1; i <= 4; i++) push("Zephyr " + i + ".0 Der Anfang", "kult", 2000 + i);
  for (let i = 1; i <= 4; i++) push("Krawall " + i, "trash", 2005 + i);
  /* Reihe mit 3 Titeln hinter einem Artikel (entspricht „The Lord of the …") */
  for (const t of ["Der Wanderer: Erstes Buch", "Der Wanderer: Zweites Buch", "Der Wanderer: Drittes Buch"]) push(t, "immer_gut", 2003);
  /* Zwei Zweier-Reihen */
  push("Nachtklinge", "kult_klassiker", 1982); push("Nachtklinge 2049", "kult", 2017);
  push("Umformer", "daemlich_aber_herrlich", 2007); push("Umformer: Neue Zeit", "trash", 2014);
  /* 14 Titel mit führendem „The" — im echten Bestand inhaltlich völlig
     unverwandt (Der Pate, Die Fliege, Die Unglaublichen …). */
  for (let i = 1; i <= 14; i++) push("The Sache " + i, i % 3 ? "kult" : "immer_gut", 1970 + i);
  /* Auffüllen auf 52 Kandidaten mit klar getrennten Anfangswörtern */
  const rest = ["Aurora", "Basalt", "Comet", "Delta", "Eiszeit", "Fangschuss", "Grauzone", "Hafenlicht",
    "Inselzeit", "Jagdruf", "Kaltfront", "Lawine", "Mondphase", "Nordwand", "Ostwind", "Passat",
    "Quarz", "Regenbogen", "Salzweg", "Talfahrt", "Uferlos", "Vollmond", "Wetterfahne"];
  const kats = ["kult", "kult_klassiker", "immer_gut", "trash", "daemlich_aber_herrlich"];
  rest.forEach((t, i) => push(t, kats[i % kats.length], 1990 + i));
  /* Die weiche Mitte, die draußen bleiben muss */
  for (let i = 0; i < 48; i++) push("Mittelmass " + i, "sehenswert", 2010);
  return aus;
})();
const KAT_ALLE = Object.values(G.FILM_KATEGORIEN).flat();
const KORPUS_KANDIDATEN = KORPUS.filter((f) => KAT_ALLE.includes(f.kategorie));

/* Der Reihenschlüssel des Moduls ist privat. Hier steht seine Referenz:
   `norm()` aus match.js, erstes Wort — dieselbe Regel, die
   tools/schlagwort_belege.mjs für die Konzentration benutzt. Genau das
   Auseinanderlaufen dieser beiden war Befund B4, deshalb wird hier gegen die
   fremde Fassung gerechnet und nicht gegen eine dritte eigene. */
const { norm } = await import("./src/lib/match.js");
const reihenSchluessel = (titel) => norm(titel).split(" ").filter(Boolean)[0] || "";
const reihenZaehlung = (liste) => {
  const m = new Map();
  for (const f of liste) m.set(reihenSchluessel(f.titel), (m.get(reihenSchluessel(f.titel)) || 0) + 1);
  return m;
};

const ABSCHNITTE = [];
const abschnitt = (name, lauf) => ABSCHNITTE.push([name, lauf]);

/* =========================================================================
   A — MODELL, KONSTANTEN UND DIE KURATIERTE LISTE
   ========================================================================= */
abschnitt("A", async () => {
console.log("\n--- A: Modell, Konstanten, Liste — und der Harnisch selbst ---");

/* DER HARNISCH PRÜFT SICH SELBST. Die Kopierstrecke läuft hier bei JEDEM
   Lauf einmal mit UNVERÄNDERTEN Dateien mit. Reißt sie — weil jemand einen
   Import hinzufügt, den sie nicht verträgt —, steht hier ein roter Check mit
   Namen. Vorher brach die ganze Datei ab und meldete gar nichts; ein
   Prüfwerkzeug, das bei einer harmlosen Codeänderung verstummt, hört genau
   dann auf zu prüfen, wenn geprüft werden müsste. */
let erzwungen = null, ladeFehler = null;
try { erzwungen = await ladeModule(PROFIL_ORIG, GESCHMACK_ORIG, true); }
catch (e) { ladeFehler = String(e && e.message ? e.message : e).split("\n")[0]; }
check("A", "DER HARNISCH TRÄGT: eine Kopie beider Module lässt sich als Geschwisterdatei laden"
  + (ladeFehler ? "  [gescheitert: " + ladeFehler + "]" : "  [Kopierstrecke gelaufen]"),
  () => !ladeFehler && !!erzwungen && erzwungen.kopiert === true);
check("A", "…und die Kopie liefert dieselben Exporte wie das Original — kein halb geladenes Modul",
  () => !!erzwungen
    && Object.keys(erzwungen.G).sort().join(",") === Object.keys(G).sort().join(",")
    && Object.keys(erzwungen.P).sort().join(",") === Object.keys(P).sort().join(","));
check("A", "…und dasselbe Verhalten: gleiche Schlagwortzahl, gleiche Signale, gleiche Filmauswahl",
  () => {
    if (!erzwungen) return false;
    const a = erzwungen.G, b = G;
    return a.schlagwoerter().length === b.schlagwoerter().length
      && JSON.stringify(a.signaleAusAuswahl({ [b.schlagwoerter()[0].id]: "zieht_an" }))
        === JSON.stringify(b.signaleAusAuswahl({ [b.schlagwoerter()[0].id]: "zieht_an" }))
      && JSON.stringify(a.filmAuswahl(KORPUS)) === JSON.stringify(b.filmAuswahl(KORPUS));
  });
check("A", "…und die Verlinkung der Kopien untereinander greift: geschmack sieht die kopierte Profil-Fassung",
  () => {
    if (!erzwungen) return false;
    /* Prüfbar am Verhalten: Die kopierte geschmack-Fassung muss RICHTUNGEN
       aus der kopierten profil-Fassung kennen. Wäre die Ersetzung
       durchgerutscht, liefe sie gegen das Original — das fiele erst bei
       einer Profil-Mutation auf, also genau dann, wenn es zu spät ist. */
    return P.RICHTUNGEN.every((r) => erzwungen.G.signaleAusAuswahl({ [ALLE[0].id]: r }).signale.length === 1)
      && erzwungen.G.signaleAusAuswahl({ [ALLE[0].id]: "gibtsnicht" }).uebergangen.length === 1;
  });
check("A", "…und der Quellbaum bleibt sauber: keine Kopie liegt danach noch herum",
  () => !fs.readdirSync(path.join(WURZEL, "src/lib")).some((n) => n.includes("__mut")));

/* Die Konstanten sind kein Geschmack, sondern ein Vertrag: `staerke` muss im
   von pruefeSignal erlaubten Bereich liegen, `sicherheit` in SICHERHEITEN,
   `quelle` in QUELLEN. Fällt eine davon aus dem Modell, erzeugt das Modul
   ausschließlich ungültige Signale — und `sammle` verwirft sie still. */
check("A", "SCHLAGWORT_STAERKE ist eine Ganzzahl im Bereich 1..5  [gemessen: " + G.SCHLAGWORT_STAERKE + "]",
  () => Number.isInteger(G.SCHLAGWORT_STAERKE) && G.SCHLAGWORT_STAERKE >= 1 && G.SCHLAGWORT_STAERKE <= 5);
check("A", "SCHLAGWORT_SICHERHEIT steht in SICHERHEITEN und ist `hoch` — der Nutzer hat selbst angekreuzt",
  () => G.SCHLAGWORT_SICHERHEIT === "hoch" && P.SICHERHEITEN.includes(G.SCHLAGWORT_SICHERHEIT));
check("A", "SCHLAGWORT_QUELLE steht in QUELLEN",
  () => G.SCHLAGWORT_QUELLE === "schlagwort" && P.QUELLEN.includes(G.SCHLAGWORT_QUELLE));
check("A", "BELEG_PRAEFIX ist `schlagwort:` — Phase 4 zählt daran den deterministischen Anteil",
  () => G.BELEG_PRAEFIX === "schlagwort:" && G.FILM_BELEG_PRAEFIX === "filmwahl:");
/* Ein Chip trägt ein Bit, keine Abstufung. Eine Stärke, die je Schlagwort
   variiert, wäre genau die Behauptung, die profil.js sonst überall verbietet. */
check("A", "ALLE Schlagwörter tragen dieselbe Stärke — ein Chip sagt nicht, wie stark",
  () => new Set(ALLE.flatMap((s) => P.RICHTUNGEN.map((r) =>
    G.signaleAusAuswahl({ [s.id]: r }).signale[0].staerke))).size === 1);

check("A", "die kuratierte Liste ist nicht leer  [gemessen: " + ALLE.length + " Schlagwörter, "
  + (LISTE_ROH.verworfen || []).length + " verworfen]",
  () => ALLE.length > 0 && Array.isArray(LISTE_ROH.verworfen));
check("A", "KERNZUSAGE DER KURATION: jeder `wert` erfüllt " + WERT_FORM + " — schärfer als profil.js"
  + "  [Verstöße: " + ALLE.filter((s) => !WERT_FORM.test(s.wert)).length + "]",
  () => ALLE.length > 0 && ALLE.every((s) => WERT_FORM.test(s.wert)));
/* Einzeln benannt, nicht nur über die Form: Wer die Form später lockert, soll
   im Testtext lesen, WAS sie eigentlich fernhält. */
check("A", "kein `wert` trägt Anführungszeichen, Backtick, Doppelpunkt, Klammer, Umbruch oder Unicode-Trenner",
  () => ALLE.every((s) => !/["'`:(){}<>\[\]\\\r\n\u0000-\u001f\u2028\u2029]/.test(s.wert)));
check("A", "jede `art` steht in SIGNAL_ARTEN  [gemessen: " + [...new Set(ALLE.map((s) => s.art))].join(", ") + "]",
  () => ALLE.every((s) => P.SIGNAL_ARTEN.includes(s.art)));
/* `kult` und `trash` werden aus Kategorien abgeleitet. Sie beschreiben die
   Haltung zu Filmen, nicht deren Tonfall. Eine eigene Signalart hält diese
   Messgrundlage auch in der späteren Prompt-Fassung ehrlich. */
const HALTUNGS_WOERTER = ALLE.filter((s) => s.gruppe === "haltung");
check("A", "Haltungschips tragen die eigene Art `haltung`, nicht den irreführenden Tonfall"
  + "  [gemessen: " + HALTUNGS_WOERTER.map((s) => s.id + "=" + s.art).join(", ") + "]",
  () => HALTUNGS_WOERTER.length > 0 && HALTUNGS_WOERTER.every((s) => s.art === "haltung"));
/* Die Richtungs-Exklusivität aus Gruppe C ruht auf dieser Eindeutigkeit:
   Zwei IDs mit demselben (art, wert) könnten über zwei Chips beide Richtungen
   desselben Zuges erzeugen — die Abbildung `id -> richtung` schützt dann
   nicht mehr. Weder geschmack.js noch das Messskript prüfen das. */
check("A", "die IDs sind eindeutig", () => new Set(ALLE.map((s) => s.id)).size === ALLE.length);
check("A", "TRAGENDE INVARIANTE: kein (art, wert) kommt zweimal vor — sonst trägt die Exklusivität nicht",
  () => new Set(ALLE.map((s) => s.art + "\u0001" + s.wert)).size === ALLE.length);
check("A", "jeder Eintrag trägt eine eigene Anzeige, die nicht der `wert` ist",
  () => ALLE.every((s) => typeof s.anzeige === "string" && s.anzeige.trim() && s.anzeige !== s.wert));
/* geschmack.js leitet den Beleg aus `id` ab und liest das Feld `beleg` NIE.
   Läuft beides auseinander, prüft das Messskript (das `e.beleg` nimmt) eine
   Zeichenkette, die im Produkt nicht vorkommt. */
check("A", "das Feld `beleg` der Liste stimmt mit dem abgeleiteten BELEG_PRAEFIX + id überein",
  () => ALLE.every((s) => s.beleg === G.BELEG_PRAEFIX + s.id));

const grp = G.gruppen();
check("A", "gruppen() verteilt JEDES Schlagwort auf genau eine Gruppe, ohne Verlust  [gemessen: "
  + grp.map((g) => g.id + " " + g.eintraege.length).join(", ") + "]",
  () => grp.reduce((n, g) => n + g.eintraege.length, 0) === ALLE.length
    && new Set(grp.flatMap((g) => g.eintraege.map((s) => s.id))).size === ALLE.length);
check("A", "jede Gruppe trägt Titel und Hinweis aus der Liste, nicht die nackte ID",
  () => grp.every((g) => {
    const def = (LISTE_ROH.gruppen || []).find((x) => x.id === g.id);
    return def ? g.titel === def.titel && g.hinweis === def.hinweis : g.titel === g.id;
  }));
check("A", "findeSchlagwort trifft jede ID und gibt für Unbekanntes null — auch für `__proto__` und `constructor`",
  () => ALLE.every((s) => G.findeSchlagwort(s.id) === s)
    && ["nicht_da", "__proto__", "constructor", "", null, undefined, 42].every((k) => G.findeSchlagwort(k) === null));
check("A", "ausSchlagwort/schlagwortIdVon sind der Rückweg und stolpern nicht über fremde Belege",
  () => ALLE.every((s) => {
    const sig = G.signaleAusAuswahl({ [s.id]: "zieht_an" }).signale[0];
    return G.ausSchlagwort(sig) === true && G.schlagwortIdVon(sig) === s.id;
  })
    && [null, undefined, {}, { beleg: 123 }, { beleg: "Blade Runner, Kommentar" }].every(
      (x) => G.ausSchlagwort(x) === false && G.schlagwortIdVon(x) === null));
});

/* =========================================================================
   B — BELEGPFLICHT
   Zusage 1. Über die VOLLE Liste × RICHTUNGEN, nicht an einer Handvoll
   Beispiele. Die E6-Lehre lautet wörtlich: der bequemste Testwert war der
   einzige, der den Bug überlebte.
   ========================================================================= */
abschnitt("B", async () => {
console.log("\n--- B: Belegpflicht über die volle Liste × RICHTUNGEN ---");
const KOMBIS = ALLE.length * P.RICHTUNGEN.length;
const schlecht = [];
const belegFehlt = [];
for (const s of ALLE) for (const r of P.RICHTUNGEN) {
  const { signale, uebergangen } = G.signaleAusAuswahl({ [s.id]: r });
  if (signale.length !== 1 || uebergangen.length) { schlecht.push(s.id + "/" + r + ": " + signale.length + " Signale, " + uebergangen.length + " übergangen"); continue; }
  const f = P.pruefeSignal(signale[0]);
  if (f.length) schlecht.push(s.id + "/" + r + ": " + f.join("; "));
  if (signale[0].beleg !== G.BELEG_PRAEFIX + s.id) belegFehlt.push(s.id + "/" + r + " → " + signale[0].beleg);
}
check("B", "KERNZUSAGE: jedes erzeugte Signal besteht pruefeSignal — " + KOMBIS
  + " Kombinationen (" + ALLE.length + " Schlagwörter × " + P.RICHTUNGEN.length + " Richtungen)"
  + "  [Fehler: " + schlecht.length + (schlecht[0] ? ", zuerst " + schlecht[0] : "") + "]",
  () => KOMBIS > 0 && schlecht.length === 0);
check("B", "und jedes trägt seinen Beleg `schlagwort:<id>` — über dieselben " + KOMBIS + " Kombinationen"
  + "  [Fehler: " + belegFehlt.length + "]",
  () => belegFehlt.length === 0);

/* Die Felder einzeln, damit ein Ausfall sagt, WELCHES Feld gekippt ist —
   `pruefeSignal` meldet sonst nur „ungültig". */
const feldFehler = [];
for (const s of ALLE) for (const r of P.RICHTUNGEN) {
  const sig = G.signaleAusAuswahl({ [s.id]: r }).signale[0];
  if (sig.art !== s.art) feldFehler.push(s.id + ": art");
  if (sig.wert !== s.wert) feldFehler.push(s.id + ": wert");
  if (sig.richtung !== r) feldFehler.push(s.id + ": richtung");
  if (sig.staerke !== G.SCHLAGWORT_STAERKE) feldFehler.push(s.id + ": staerke");
  if (sig.sicherheit !== G.SCHLAGWORT_SICHERHEIT) feldFehler.push(s.id + ": sicherheit");
  if (sig.quelle !== G.SCHLAGWORT_QUELLE) feldFehler.push(s.id + ": quelle");
}
check("B", "jedes Signal übernimmt art und wert unverändert aus der Liste und trägt die dokumentierten Konstanten"
  + "  [Abweichungen: " + feldFehler.length + (feldFehler[0] ? ", zuerst " + feldFehler[0] : "") + "]",
  () => feldFehler.length === 0);

/* Der Weg, den die Oberfläche wirklich geht: nicht `pruefeSignal` direkt,
   sondern `sammle`. Ein Signal, das die Prüfung besteht, aber von `sammle`
   verworfen wird, wäre für den Nutzer dasselbe Nichts. */
const sw = {};
ALLE.forEach((s, i) => { sw[s.id] = P.RICHTUNGEN[i % P.RICHTUNGEN.length]; });
const erg = G.onboardingErgebnis({ schlagwoerter: sw });
const gesammelt = P.sammle(ein(), erg.signale, T1);
check("B", "alle " + ALLE.length + " Schlagwörter auf einmal überstehen `sammle` ohne Verwerfung"
  + "  [gemessen: übernommen " + gesammelt.uebernommen + ", verworfen " + gesammelt.verworfen.length + "]",
  () => gesammelt.uebernommen === ALLE.length && gesammelt.verworfen.length === 0);
check("B", "…und landen in `offen`, nie direkt in `signale` (Zusage 3 von profil.js gilt auch hier)",
  () => gesammelt.profil.offen.length === ALLE.length && gesammelt.profil.signale.length === 0);
const nachUebernahme = P.uebernimmAlle(gesammelt.profil, T2);
check("B", "nach der Bestätigung ist das Profil speicherbar — pruefeProfil meldet nichts",
  () => nachUebernahme.uebernommen === ALLE.length && P.pruefeProfil(nachUebernahme.profil).length === 0);
});

/* =========================================================================
   C — RICHTUNGS-EXKLUSIVITÄT
   Die Behauptung im Modulkopf: die Datenform `id -> richtung` macht es
   UNMÖGLICH, dass ein Schlagwort gleichzeitig zieht_an und stoesst_ab ist.
   Der Nachweis hat zwei Hälften, und die zweite ist der Grund für die erste.
   ========================================================================= */
abschnitt("C", async () => {
console.log("\n--- C: Richtungs-Exklusivität ---");

/* HÄLFTE 1: profil.js widerspricht NICHT. Die Richtung steckt in `signalId`,
   also stehen „mag Drama" und „meidet Drama" dort friedlich nebeneinander —
   gültig, speicherbar, und im Prompt zwei Zeilen, die einander aufheben. */
const beide = [
  { art: "genre", wert: "drama", richtung: "zieht_an", staerke: 4, sicherheit: "hoch", quelle: "schlagwort", beleg: "schlagwort:drama" },
  { art: "genre", wert: "drama", richtung: "stoesst_ab", staerke: 4, sicherheit: "hoch", quelle: "schlagwort", beleg: "schlagwort:drama" },
];
const widerspruch = { ...ein(), signale: beide };
check("C", "profil.js LÄSST beide Richtungen desselben Zuges zu — pruefeProfil meldet nichts",
  () => P.pruefeProfil(widerspruch).length === 0);
check("C", "…auch `sammle` führt sie nicht zusammen, sondern legt zwei Züge an — die Richtung steckt in signalId",
  () => P.sammle(ein(), beide, T1).uebernommen === 2);
const wtext = P.promptFassung(widerspruch).text;
check("C", "…und der Prompt trüge dann zwei Zeilen, die einander aufheben  [gemessen: "
  + wtext.split("\n").map((z) => z.slice(2, 14)).join(" / ") + "]",
  () => wtext.includes("mag drama") && wtext.includes("meidet drama"));

/* HÄLFTE 2: geschmack.js kann das nicht erzeugen. Nicht an einem Beispiel,
   sondern über die volle Liste: Für jedes Schlagwort werden nacheinander alle
   Richtungen in DIESELBE Auswahl geschrieben — eine Abbildung kann nur die
   letzte behalten. */
const doppelt = [];
for (const s of ALLE) {
  const auswahl = {};
  for (const r of P.RICHTUNGEN) auswahl[s.id] = r;      // überschreibt sich selbst
  const { signale } = G.signaleAusAuswahl(auswahl);
  if (signale.length !== 1) doppelt.push(s.id + " → " + signale.length);
}
check("C", "KERNZUSAGE: eine Auswahl kann pro Schlagwort nur EINE Richtung tragen — über alle "
  + ALLE.length + " Schlagwörter  [Verstöße: " + doppelt.length + "]",
  () => ALLE.length > 0 && doppelt.length === 0);

/* Der schärfere Nachweis: die volle Auswahl auf einmal. Kein (art, wert) darf
   zweimal mit verschiedener Richtung herauskommen — egal, was man hineinkippt. */
const volleAuswahl = {};
ALLE.forEach((s, i) => { volleAuswahl[s.id] = P.RICHTUNGEN[i % P.RICHTUNGEN.length]; });
const alleSignale = G.signaleAusAuswahl(volleAuswahl).signale;
const paare = new Map();
for (const sig of alleSignale) {
  const k = sig.art + "\u0001" + sig.wert;
  paare.set(k, (paare.get(k) || new Set()).add(sig.richtung));
}
check("C", "aus der VOLLEN Auswahl entsteht kein (art, wert) mit zwei Richtungen  [gemessen: "
  + alleSignale.length + " Signale, " + paare.size + " verschiedene (art, wert)]",
  () => alleSignale.length === ALLE.length && paare.size === ALLE.length
    && [...paare.values()].every((r) => r.size === 1));
/* Die Gegenprobe zur Datenform: Wer die Auswahl als LISTE führte — das
   Verworfene aus dem Modulkopf —, bekäme genau den Widerspruch. Hier wird
   nachgewiesen, dass die Signatur diese Form gar nicht annimmt. */
check("C", "eine LISTE als Auswahl erzeugt keine Signale — die Signatur nimmt nur die Abbildung an"
  + "  [gemessen: " + JSON.stringify(G.signaleAusAuswahl([{ id: "drama", richtung: "zieht_an" }, { id: "drama", richtung: "stoesst_ab" }]).signale) + "]",
  () => G.signaleAusAuswahl([{ id: "drama", richtung: "zieht_an" }, { id: "drama", richtung: "stoesst_ab" }]).signale.length === 0);
});

/* =========================================================================
   D — signaleAusAuswahl: RÄNDER
   ========================================================================= */
abschnitt("D", async () => {
console.log("\n--- D: signaleAusAuswahl, Ränder und Übergangenes ---");
check("D", "leere und unbrauchbare Eingaben erzeugen KEIN Signal und werfen nicht",
  () => [null, undefined, {}, "abc", 42, true, [], [1, 2]].every((x) => {
    const r = G.signaleAusAuswahl(x);
    return Array.isArray(r.signale) && r.signale.length === 0 && Array.isArray(r.uebergangen);
  }));
/* Eine Zeichenkette ist iterierbar — `Object.entries("abc")` ergibt drei
   Paare. Das Modul meldet sie sauber als unbekannte Schlagwörter statt zu
   werfen; die Zahl steht hier, damit ein späterer Umbau sie nicht
   unbemerkt verändert. */
check("D", "eine Zeichenkette als Auswahl wird zeichenweise als unbekanntes Schlagwort gemeldet"
  + "  [gemessen: \"abc\" → " + G.signaleAusAuswahl("abc").uebergangen.length + " übergangen]",
  () => G.signaleAusAuswahl("abc").uebergangen.length === 3
    && G.signaleAusAuswahl("abc").uebergangen.every((u) => /unbekanntes Schlagwort/.test(u.grund)));
check("D", "eine abgewählte Richtung (null/undefined) erzeugt KEIN Signal und keinen Übergangen-Eintrag",
  () => {
    const a = G.signaleAusAuswahl({ [ALLE[0].id]: null, [ALLE[1].id]: undefined });
    return a.signale.length === 0 && a.uebergangen.length === 0;
  });
/* Der Unterschied ist wichtig: „abgewählt" ist kein Fehler, „Quatsch" schon.
   Wer beides in denselben Topf legte, könnte dem Nutzer nicht sagen, was
   nicht angekommen ist. */
check("D", "falsy, aber nicht null (0, false, \"\") ist ein FEHLER, kein Abwählen  [gemessen: "
  + G.signaleAusAuswahl({ [ALLE[0].id]: 0, [ALLE[1].id]: false, [ALLE[2].id]: "" }).uebergangen.length + " übergangen]",
  () => {
    const a = G.signaleAusAuswahl({ [ALLE[0].id]: 0, [ALLE[1].id]: false, [ALLE[2].id]: "" });
    return a.signale.length === 0 && a.uebergangen.length === 3
      && a.uebergangen.every((u) => u.grund === "unbekannte Richtung");
  });
check("D", "ein unbekanntes Schlagwort wird mit Grund übergangen, nicht still verschluckt",
  () => {
    const a = G.signaleAusAuswahl({ gibtsnicht: "zieht_an" });
    return a.signale.length === 0 && a.uebergangen.length === 1
      && a.uebergangen[0].id === "gibtsnicht" && /unbekanntes Schlagwort/.test(a.uebergangen[0].grund);
  });
check("D", "eine Richtung außerhalb von RICHTUNGEN ebenso — auch Großschreibung ist keine Richtung",
  () => ["ZIEHT_AN", "zieht an", "mag", "zieht_an "].every((r) => {
    const a = G.signaleAusAuswahl({ [ALLE[0].id]: r });
    return a.signale.length === 0 && a.uebergangen.length === 1 && /unbekannte Richtung/.test(a.uebergangen[0].grund);
  }));
check("D", "Gutes und Schlechtes in einer Auswahl: das Gute kommt durch, das Schlechte steht im Bericht",
  () => {
    const a = G.signaleAusAuswahl({ [ALLE[0].id]: "zieht_an", quatsch: "zieht_an", [ALLE[1].id]: "seitwaerts" });
    return a.signale.length === 1 && a.signale[0].wert === ALLE[0].wert && a.uebergangen.length === 2;
  });
/* Die Liste ist eine DATEI — sie kann aus einem alten Build stammen. Eine Art,
   die profil.js nicht kennt, muss hier auffallen, wo der Bezug zum Schlagwort
   noch da ist, nicht erst tief in pruefeSignal. */
check("D", "ein Schlagwort mit einer Art außerhalb von SIGNAL_ARTEN wird mit sprechendem Grund übergangen",
  () => {
    const alt = ALLE[0].art;
    ALLE[0].art = "stimmung";                       // dieselbe Objektinstanz, die das Modul liest
    const a = G.signaleAusAuswahl({ [ALLE[0].id]: "zieht_an" });
    ALLE[0].art = alt;
    return a.signale.length === 0 && a.uebergangen.length === 1 && /Art nicht im Modell: stimmung/.test(a.uebergangen[0].grund);
  });
check("D", "signaleAusAuswahl verändert die kuratierte Liste nicht (kein geteilter Zustand zwischen Aufrufen)",
  () => {
    const vorher = JSON.stringify(G.schlagwoerter());
    G.signaleAusAuswahl({ [ALLE[0].id]: "zieht_an", [ALLE[1].id]: "stoesst_ab" });
    return JSON.stringify(G.schlagwoerter()) === vorher;
  });
});

/* =========================================================================
   E — filmAuswahl AN DEN ECHTEN BETA-DATEN
   Gemessen, nicht behauptet. Fehlen die Daten, bleibt die Gruppe leer.
   ========================================================================= */
abschnitt("E", async () => {
console.log("\n--- E: filmAuswahl an den echten Beta-Daten ---");
if (!ECHT) {
  console.log("  ÜBERSPRUNGEN: " + BEKANNT_DATEI + " nicht gefunden.");
  console.log("  Die Beta-Daten liegen bewusst nicht im Repo. KD_DATEN=/pfad setzen, um sie zu messen.");
  return;
}
const kandidaten = ECHT.filter((t) => t && KAT_ALLE.includes(t.kategorie));
const aus = G.filmAuswahl(ECHT);
console.log("  [Korpus: " + ECHT.length + " bewertete Titel, " + kandidaten.length + " in FILM_KATEGORIEN, Auswahl " + aus.length + "]");
check("E", "die Auswahl ist nicht leer  [gemessen: " + aus.length + " von " + kandidaten.length + " Kandidaten aus " + ECHT.length + " Titeln]",
  () => aus.length > 0);
check("E", "ZUSAGE: nur Titel aus FILM_KATEGORIEN — die weiche Mitte `sehenswert` bleibt draußen"
  + "  [gemessen: " + ECHT.filter((t) => t.kategorie === "sehenswert").length + " sehenswert im Bestand, 0 in der Auswahl]",
  () => aus.every((f) => kandidaten.some((k) => k.titel === f.titel && KAT_ALLE.includes(k.kategorie))));
check("E", "ZUSAGE: höchstens ein Film je Reihe — keine Reihe füllt die Auswahl"
  + "  [gemessen: größte Reihe " + Math.max(...reihenZaehlung(aus).values()) + " von " + aus.length + "]",
  () => Math.max(...reihenZaehlung(aus).values()) <= 1);
/* Die Zusage, die die Reihen-Regel begründet: Zehn Kacheln derselben Reihe
   fragen nicht nach Geschmack, sondern nach einer Sammlung. Der echte
   Bestand enthält die Cluster, an denen das gemessen wurde. */
const cluster = [...reihenZaehlung(kandidaten).entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
check("E", "der echte Bestand enthält überhaupt Reihen-Cluster — sonst prüfte die Regel nichts"
  + "  [gemessen: " + cluster.slice(0, 4).map(([r, n]) => r + "×" + n).join(", ") + "]",
  () => cluster.length > 0 && cluster[0][1] >= 3);
check("E", "die Reihen-Regel entfernt wirklich etwas: die Auswahl ist kleiner als die Kandidatenmenge"
  + "  [gemessen: " + kandidaten.length + " → " + aus.length + "]",
  () => aus.length < kandidaten.length);
/* B4, am echten Bestand. Vor der Reparatur galten alle 14 Titel mit
   führendem „The" als EINE Reihe; die Auswahl fiel von 39 auf 29, und es
   traf ausgerechnet die wiedererkennbarsten Titel. Die Zahl steht hier, weil
   sie beim nächsten Umbau des Reihenschlüssels als Erste kippt. */
const artikelTitel = kandidaten.filter((k) => /^(the|der|die|das|ein|eine|a|an) /i.test(k.titel));
const artikelDrin = aus.filter((f) => /^(the|der|die|das|ein|eine|a|an) /i.test(f.titel));
check("E", "B4: Titel mit führendem Artikel kollabieren NICHT zu einer Reihe"
  + "  [gemessen: " + artikelTitel.length + " Kandidaten mit Artikel, " + artikelDrin.length + " davon in der Auswahl]",
  () => artikelTitel.length >= 5 && artikelDrin.length >= Math.min(5, artikelTitel.length - 3));
/* Die Gegenrechnung: Die Auswahlgröße muss genau der Zahl verschiedener
   Reihenschlüssel entsprechen, gerechnet mit `norm()` aus match.js — der
   Normalisierung, die auch das Messskript benutzt. */
check("E", "die Auswahlgröße entspricht genau der Zahl verschiedener norm()-Reihenschlüssel"
  + "  [gemessen: " + reihenZaehlung(kandidaten).size + " Schlüssel, " + aus.length + " Filme]",
  () => reihenZaehlung(kandidaten).size === aus.length);
check("E", "keine Dubletten in der Auswahl — weder Titel noch ID",
  () => new Set(aus.map((f) => f.titel)).size === aus.length && new Set(aus.map((f) => f.id)).size === aus.length);
check("E", "jeder Eintrag trägt id, titel, jahr (Ganzzahl oder null) und eine Gruppe aus FILM_KATEGORIEN",
  () => aus.every((f) => typeof f.id === "string" && f.id
    && typeof f.titel === "string" && f.titel.trim()
    && (f.jahr === null || Number.isInteger(f.jahr))
    && Object.keys(G.FILM_KATEGORIEN).includes(f.gruppe)));
check("E", "beide Töpfe sind vertreten — Wiedererkennbarkeit UND Trennschärfe  [gemessen: "
  + JSON.stringify(aus.reduce((o, f) => (o[f.gruppe] = (o[f.gruppe] || 0) + 1, o), {})) + "]",
  () => new Set(aus.map((f) => f.gruppe)).size === Object.keys(G.FILM_KATEGORIEN).length);

/* DURCHSTICH mit den echten Titeln: Sie sind Fremdtext aus einer Datei und
   reisen über `profil.filme` in die Prompt-Fassung. */
const wahl = {};
aus.forEach((f, i) => { wahl[f.id] = P.RICHTUNGEN[i % P.RICHTUNGEN.length]; });
const { filme, uebergangen } = G.filmeAusAuswahl(wahl, aus);
check("E", "jeder echte Titel überlebt filmeAusAuswahl und pruefeProfil  [gemessen: " + filme.length + " Filme, "
  + uebergangen.length + " übergangen]",
  () => filme.length === aus.length && uebergangen.length === 0
    && P.pruefeProfil({ ...P.leeresProfil(), filme }).length === 0);
const echtProfil = { ...ein(), filme };
const echtText = P.promptFassung(echtProfil, { maxBytes: 100000 }).text;
check("E", "…und die Prompt-Struktur hält: jede Zeile ist eine bekannte Filmzeile, keine bricht aus"
  + "  [gemessen: " + echtText.split("\n").length + " Zeilen, " + Buffer.byteLength(echtText, "utf8") + " Bytes]",
  () => echtText.split("\n").every((z) =>
    /^(Filme, die ihn treffen|Filme, die ihn abstoßen|Filme, zu denen er zwiespältig steht|Genannte Filme): /.test(z)));
});

/* =========================================================================
   F — filmAuswahl: ZUSAGEN UND RÄNDER AM SYNTHETISCHEN KORPUS
   Derselbe Form-Aufbau wie die echten Daten, aber ohne persönliche Titel —
   damit die Zusagen auch ohne Beta-Daten geprüft werden.
   ========================================================================= */
abschnitt("F", async () => {
console.log("\n--- F: filmAuswahl, Zusagen und Ränder ---");
console.log("  [synthetischer Korpus: " + KORPUS.length + " Einträge, " + KORPUS_KANDIDATEN.length + " in FILM_KATEGORIEN]");
const aus = G.filmAuswahl(KORPUS);
check("F", "FILM_KATEGORIEN hat genau die zwei Töpfe mit verschiedenen Aufgaben",
  () => Object.keys(G.FILM_KATEGORIEN).join(",") === "wiedererkennbar,trennscharf"
    && G.FILM_KATEGORIEN.wiedererkennbar.length > 0 && G.FILM_KATEGORIEN.trennscharf.length > 0);
check("F", "ZUSAGE: nur Titel aus FILM_KATEGORIEN  [gemessen: " + aus.length + " von " + KORPUS_KANDIDATEN.length + " Kandidaten]",
  () => aus.length > 0 && aus.every((f) => KORPUS_KANDIDATEN.some((k) => k.titel === f.titel)));
check("F", "die weiche Mitte `sehenswert` bleibt vollständig draußen  [im Korpus: "
  + KORPUS.filter((f) => f.kategorie === "sehenswert").length + "]",
  () => !aus.some((f) => /^Mittelmass/.test(f.titel)));
check("F", "ZUSAGE: höchstens `proReihe` Filme je Reihe — Vorgabe 1",
  () => Math.max(...reihenZaehlung(aus).values()) === 1);
check("F", "proReihe wirkt als Zahl, nicht als Schalter  [gemessen: proReihe 1→" + G.filmAuswahl(KORPUS, { proReihe: 1 }).length
  + ", 2→" + G.filmAuswahl(KORPUS, { proReihe: 2 }).length + ", 4→" + G.filmAuswahl(KORPUS, { proReihe: 4 }).length + "]",
  () => G.filmAuswahl(KORPUS, { proReihe: 1 }).length < G.filmAuswahl(KORPUS, { proReihe: 2 }).length
    && G.filmAuswahl(KORPUS, { proReihe: 2 }).length <= G.filmAuswahl(KORPUS, { proReihe: 4 }).length);
check("F", "proReihe 0 liefert nichts — kein Film je Reihe heißt kein Film",
  () => G.filmAuswahl(KORPUS, { proReihe: 0 }).length === 0 && G.filmAuswahl(KORPUS, { proReihe: -1 }).length === 0);
/* B3, repariert: Die Grenze steht jetzt am Schleifenanfang. Vorher war
   `aus.length >= 0` erst nach dem ersten Anhängen wahr — `max: 0` lieferte
   einen Film. Der Bereich beginnt deshalb bei 0 und geht ins Negative. */
check("F", "ZUSAGE: höchstens `max` insgesamt — geprüft über den Bereich 0..60 UND für negative Werte"
  + "  [gemessen: max 0 → " + G.filmAuswahl(KORPUS, { max: 0 }).length + ", max -5 → " + G.filmAuswahl(KORPUS, { max: -5 }).length
  + ", Verstöße 0..60: " + (() => { let n = 0; for (let m = 0; m <= 60; m++) if (G.filmAuswahl(KORPUS, { max: m }).length > m) n++; return n; })() + "]",
  () => {
    for (let m = 0; m <= 60; m++) if (G.filmAuswahl(KORPUS, { max: m }).length > m) return false;
    return [-1, -5, -100].every((m) => G.filmAuswahl(KORPUS, { max: m }).length === 0);
  });
check("F", "die Vorgabe max 40 greift, wenn genug Kandidaten da sind  [gemessen: "
  + G.filmAuswahl(KORPUS, { proReihe: 9 }).length + " bei proReihe 9]",
  () => G.filmAuswahl(KORPUS, { proReihe: 9 }).length === 40);
check("F", "leere und unbrauchbare Eingaben ergeben eine leere Liste statt einer Ausnahme",
  () => [[], null, undefined, "abc", 42, {}, true].every((x) => G.filmAuswahl(x).length === 0));
/* Der Bestand ist eine Datei aus einem fremden Lauf — Nicht-Objekte, fehlende
   Titel und Titel aus reinem Weißraum sind der Normalfall, nicht der Angriff. */
check("F", "Müll im Bestand wird übersprungen, nicht übernommen: Nicht-Objekte, fehlender Titel, Leertitel, falsche Kategorie",
  () => {
    const r = G.filmAuswahl([null, undefined, 42, "x", [], { kategorie: "kult" }, { kategorie: "kult", titel: "   " },
      { kategorie: "kult", titel: 7 }, { kategorie: "sehenswert", titel: "Nope" }, { titel: "Ohne Kategorie" },
      { kategorie: "kult", titel: "Gut", jahr: 1999 }]);
    return r.length === 1 && r[0].titel === "Gut" && r[0].jahr === 1999;
  });
check("F", "ein unbrauchbares `jahr` wird zu null, nicht durchgereicht — pruefeProfil nimmt nur Ganzzahlen",
  () => {
    const r = G.filmAuswahl([{ kategorie: "kult", titel: "A", jahr: "1999" }, { kategorie: "kult", titel: "B", jahr: 1999.5 },
      { kategorie: "kult", titel: "C", jahr: null }]);
    return r.length === 3 && r.every((f) => f.jahr === null || Number.isInteger(f.jahr)) && r[0].jahr === null && r[1].jahr === null;
  });
check("F", "ohne `id` dient der Titel als ID — der Bestand führt sie nicht überall",
  () => G.filmAuswahl([{ kategorie: "kult", titel: "Ohne ID" }])[0].id === "Ohne ID");
/* Reihenschlüssel: erstes Wort des normalisierten Titels. Diakritika und
   Satzzeichen dürfen keine zweite Reihe erfinden. */
check("F", "der Reihenschlüssel ignoriert Groß-/Kleinschreibung, Diakritika und Satzzeichen"
  + "  [gemessen: 4 Schreibweisen von „Zephyr“ → " + G.filmAuswahl([{ kategorie: "kult", titel: "Zephyr eins" },
    { kategorie: "kult", titel: "ZEPHYR zwei" }, { kategorie: "kult", titel: "Zéphyr drei" },
    { kategorie: "kult", titel: "»Zephyr« vier" }]).length + " Film(e)]",
  () => G.filmAuswahl([{ kategorie: "kult", titel: "Zephyr eins" }, { kategorie: "kult", titel: "ZEPHYR zwei" },
    { kategorie: "kult", titel: "Zéphyr drei" }, { kategorie: "kult", titel: "»Zephyr« vier" }]).length === 1);
check("F", "die Auswahl behält die Reihenfolge des Bestands — deterministisch, gleiche Eingabe gleiche Ausgabe",
  () => JSON.stringify(G.filmAuswahl(KORPUS)) === JSON.stringify(G.filmAuswahl(KORPUS))
    && aus.map((f) => f.titel).join("|") === KORPUS_KANDIDATEN.filter((k) => aus.some((a) => a.titel === k.titel)).map((k) => k.titel).join("|"));

/* ---------- B4: der führende Artikel ----------
   Der eigentliche Fehler war nicht der Artikel, sondern dass ZWEI Regeln für
   dieselbe Frage existierten: `geschmack.js` mit eigener Normalisierung,
   `tools/schlagwort_belege.mjs` mit `norm()` aus match.js. Die eine belegte,
   was die andere nicht tat. Deshalb wird beides gepinnt — das Verhalten und
   die gemeinsame Quelle. */
const kult = (t) => ({ kategorie: "kult", titel: t });
const NUR_ARTIKEL_GEMEINSAM = ["The Godfather", "The Fly", "The Truman Show", "The Incredibles", "The Menu"];
check("F", "B4: Titel, die NUR den führenden Artikel gemeinsam haben, sind verschiedene Reihen"
  + "  [gemessen: " + NUR_ARTIKEL_GEMEINSAM.length + " „The“-Titel → "
  + G.filmAuswahl(NUR_ARTIKEL_GEMEINSAM.map(kult)).length + " Filme]",
  () => G.filmAuswahl(NUR_ARTIKEL_GEMEINSAM.map(kult)).length === NUR_ARTIKEL_GEMEINSAM.length);
check("F", "B4: …und das gilt für jeden Artikel, den norm() kennt — deutsch wie englisch"
  + "  [gemessen: Der Pate / Die Fliege / Das Boot / A Clockwork Orange / An Education → "
  + G.filmAuswahl(["Der Pate", "Die Fliege", "Das Boot", "A Clockwork Orange", "An Education"].map(kult)).length + " Filme]",
  () => G.filmAuswahl(["Der Pate", "Die Fliege", "Das Boot", "A Clockwork Orange", "An Education"].map(kult)).length === 5);
/* Die Gegenrichtung ist genauso wichtig: Der Artikel darf keine Reihe
   ZERREISSEN, die wirklich eine ist. Sonst hätte die Reparatur die
   Reihen-Regel selbst ausgehebelt. */
check("F", "B4-GEGENPROBE: echte Reihenteile hinter dem Artikel kollabieren weiterhin"
  + "  [gemessen: Godfather I+II → " + G.filmAuswahl(["The Godfather", "The Godfather Part II"].map(kult)).length
  + ", drei LOTR-Teile → " + G.filmAuswahl(["The Lord of the Rings: The Fellowship of the Ring",
    "The Lord of the Rings: The Two Towers", "The Lord of the Rings: The Return of the King"].map(kult)).length + "]",
  () => G.filmAuswahl(["The Godfather", "The Godfather Part II"].map(kult)).length === 1
    && G.filmAuswahl(["The Lord of the Rings: The Fellowship of the Ring",
      "The Lord of the Rings: The Two Towers", "The Lord of the Rings: The Return of the King"].map(kult)).length === 1
    && G.filmAuswahl(["Jackass 3D", "Jackass Forever", "Jackass: The Movie"].map(kult)).length === 1);
check("F", "B4: ein Titel, der NUR aus einem Artikel besteht, behält ihn als Schlüssel — kein leerer Schlüssel"
  + "  [gemessen: „The“ und „Der“ → " + G.filmAuswahl(["The", "Der"].map(kult)).length + " Filme]",
  () => G.filmAuswahl(["The", "Der"].map(kult)).length === 2);
/* KERNZUSAGE dieser Reparatur: eine Regel, eine Quelle. Über einen Bereich
   gemischter Titel gemessen — jede Kollision, die `norm()` vorhersagt, muss
   das Modul auch machen, und keine andere. */
const PROBE_TITEL = [...NUR_ARTIKEL_GEMEINSAM, "The Godfather Part II", "Der Pate", "Der Pate 2",
  "Jackass 3D", "Jackass Forever", "Zéphyr eins", "»Zephyr« zwei", "ZEPHYR drei",
  "A Clockwork Orange", "An Education", "The", "Der", "Blade Runner", "Blade Runner 2049"];
const vorhergesagt = new Set(PROBE_TITEL.map((t) => reihenSchluessel(t))).size;
const gemessenZahl = G.filmAuswahl(PROBE_TITEL.map(kult)).length;
check("F", "KERNZUSAGE B4: geschmack.js und die Referenz `norm()` aus match.js gruppieren identisch"
  + "  [gemessen: " + PROBE_TITEL.length + " Titel, norm() sagt " + vorhergesagt + " Reihen voraus, das Modul liefert " + gemessenZahl + "]",
  () => vorhergesagt === gemessenZahl);
/* Quellen-Pin: Beide Seiten müssen dieselbe Funktion IMPORTIEREN, nicht nur
   zufällig dasselbe tun. Ein Nachbau in einer der beiden Dateien wäre genau
   die Konstellation, die B4 erzeugt hat. */
const QUELLE_G = fs.readFileSync(GESCHMACK_ORIG, "utf8");
const QUELLE_TOOL = fs.existsSync(path.join(WURZEL, "tools/schlagwort_belege.mjs"))
  ? fs.readFileSync(path.join(WURZEL, "tools/schlagwort_belege.mjs"), "utf8") : "";
check("F", "KERNZUSAGE B4: beide Seiten IMPORTIEREN norm() aus match.js — kein Nachbau auf einer der beiden",
  () => /import\s*\{[^}]*\bnorm\b[^}]*\}\s*from\s*["']\.\/match\.js["']/.test(QUELLE_G)
    && /import\s*\{[^}]*\bnorm\b[^}]*\}\s*from\s*["']\.\.\/src\/lib\/match\.js["']/.test(QUELLE_TOOL));
check("F", "…und geschmack.js baut den Reihenschlüssel nicht mehr selbst aus toLowerCase/normalize",
  () => !/reihenSchluessel[\s\S]{0,200}toLowerCase\(\)/.test(QUELLE_G));
});

/* =========================================================================
   G — filmeAusAuswahl
   ========================================================================= */
abschnitt("G", async () => {
console.log("\n--- G: filmeAusAuswahl ---");
const angebot = G.filmAuswahl(KORPUS);
const fehler = [];
for (const f of angebot) for (const r of P.RICHTUNGEN) {
  const { filme, uebergangen } = G.filmeAusAuswahl({ [f.id]: r }, angebot);
  if (filme.length !== 1 || uebergangen.length) { fehler.push(f.id + "/" + r); continue; }
  if (filme[0].richtung !== r || filme[0].masterId !== f.id || filme[0].sicher !== true) fehler.push(f.id + "/" + r + ": Felder");
  const e = P.pruefeProfil({ ...P.leeresProfil(), filme });
  if (e.length) fehler.push(f.id + "/" + r + ": " + e.join("; "));
}
check("G", "jeder Film × jede Richtung ergibt einen gültigen `profil.filme`-Eintrag — "
  + (angebot.length * P.RICHTUNGEN.length) + " Kombinationen  [Fehler: " + fehler.length + (fehler[0] ? ", zuerst " + fehler[0] : "") + "]",
  () => angebot.length > 0 && fehler.length === 0);
check("G", "`sicher: true` — die Filmwahl ist die sicherste Quelle, die es gibt: der Nutzer hat geklickt",
  () => G.filmeAusAuswahl({ [angebot[0].id]: "zieht_an" }, angebot).filme[0].sicher === true);
check("G", "ein Film, der nicht im Angebot steht, wird mit Grund übergangen — keine Titel aus der Luft",
  () => {
    const a = G.filmeAusAuswahl({ untergeschoben: "zieht_an" }, angebot);
    return a.filme.length === 0 && a.uebergangen.length === 1 && /nicht im Angebot/.test(a.uebergangen[0].grund);
  });
check("G", "die Titel stammen aus dem ANGEBOT, nicht aus der Auswahl — eine ID kann keinen Titel schmuggeln",
  () => G.filmeAusAuswahl({ [angebot[0].id]: "zieht_an" }, angebot).filme[0].titel === angebot[0].titel);
check("G", "eine unbekannte Richtung wird übergangen, nicht als `null` gespeichert (das hieße „nur genannt“)",
  () => {
    const a = G.filmeAusAuswahl({ [angebot[0].id]: "begeistert" }, angebot);
    return a.filme.length === 0 && a.uebergangen.length === 1 && /unbekannte Richtung/.test(a.uebergangen[0].grund);
  });
check("G", "abgewählt (null/undefined) ist kein Fehler und erzeugt keinen Eintrag",
  () => {
    const a = G.filmeAusAuswahl({ [angebot[0].id]: null, [angebot[1].id]: undefined }, angebot);
    return a.filme.length === 0 && a.uebergangen.length === 0;
  });
check("G", "leere Eingaben ergeben leere Listen statt Ausnahmen",
  () => [[null, null], [{}, angebot], [null, angebot], [{ a: "zieht_an" }, null], [{ a: "zieht_an" }, undefined], [undefined, undefined]]
    .every(([a, b]) => { const r = G.filmeAusAuswahl(a, b); return r.filme.length === 0; }));
/* B7, repariert: Der Schutz war `angebot || []` und fing damit nur nullish.
   Ein Angebot, das aus einem halb geladenen Zustand als Objekt oder String
   kam, riss die Funktion mit einem TypeError auf — mitten im Filmschritt des
   Onboardings. `filmAuswahl` macht es eine Funktion weiter oben mit
   `Array.isArray` seit jeher richtig. */
check("G", "B7: ein Angebot, das KEIN Array ist, wird wie ein leeres behandelt — statt zu werfen"
  + "  [gemessen: " + [{}, "abc", 42, true].map((b) => {
    try { return JSON.stringify(b) + "→" + G.filmeAusAuswahl({ a: "zieht_an" }, b).filme.length; }
    catch (e) { return JSON.stringify(b) + "→wirft"; }
  }).join(", ") + "]",
  () => [{}, "abc", 42, true, 0, ""].every((b) => {
    try { const r = G.filmeAusAuswahl({ a: "zieht_an" }, b); return r.filme.length === 0 && r.uebergangen.length === 1; }
    catch { return false; }
  }));
});

/* =========================================================================
   H — onboardingErgebnis UND DIE UNBERÜHRTEN ACHSEN
   Zusage 4. `pickRahmen` liest eine fehlende Achse als „unbekannt, nicht
   ändern"; ein mitgeschickter Startwert bestätigte eine Aussage, die der
   Nutzer nie gemacht hat.
   ========================================================================= */
abschnitt("H", async () => {
console.log("\n--- H: onboardingErgebnis und die unberührten Achsen ---");
const angebot = G.filmAuswahl(KORPUS);
/* B6, repariert: Der Vorgabewert `= {}` greift nur bei `undefined`, nicht bei
   `null` — `onboardingErgebnis(null)` warf beim Zerlegen. Ein abgebrochenes
   Onboarding liefert schnell `null`, und dann fiel der ganze Schritt mit
   einer TypeError-Meldung aus statt mit einem leeren Ergebnis. */
check("H", "ohne jede Eingabe entsteht nichts: keine Signale, KEIN Rahmen (null, nicht {})"
  + "  [geprüft: undefined, null, {}, false, 0, \"\"]",
  () => [undefined, null, {}, false, 0, ""].every((x) => {
    try {
      const r = G.onboardingErgebnis(x);
      return r.signale.length === 0 && r.rahmen === null && r.uebergangen.length === 0;
    } catch { return false; }
  }));
check("H", "B6: auch ohne JEDES Argument — der Aufruf ohne Klammerinhalt ist der Normalfall der Oberfläche",
  () => { const r = G.onboardingErgebnis(); return r.signale.length === 0 && r.rahmen === null; });
check("H", "KERNZUSAGE: eine unberührte Achse erzeugt keine Achsen-Angabe — nicht angefasst heißt nicht gesagt",
  () => [undefined, null, {}, { wie: null, was: null, warum: null }, "abc", [1, 2, 3], { WIE: 4 }]
    .every((a) => G.onboardingErgebnis({ achsen: a }).rahmen === null));
check("H", "nicht-ganzzahlige Achsen bleiben draußen — Zeichenkette, Kommazahl, NaN"
  + "  [gemessen: " + JSON.stringify(["4", 3.5, NaN, Infinity].map((v) => G.onboardingErgebnis({ achsen: { wie: v } }).rahmen)) + "]",
  () => ["4", 3.5, NaN, Infinity, true, [], {}].every((v) => G.onboardingErgebnis({ achsen: { wie: v } }).rahmen === null));
check("H", "eine berührte Achse kommt durch — und 0 ist ein ECHTER Wert, kein fehlender",
  () => {
    const a = G.onboardingErgebnis({ achsen: { wie: 4 } }).rahmen;
    const b = G.onboardingErgebnis({ achsen: { wie: 0 } }).rahmen;
    return a && a.achsen.wie === 4 && Object.keys(a.achsen).join(",") === "wie"
      && b && b.achsen.wie === 0;
  });
check("H", "nur die drei bekannten Achsennamen wandern weiter",
  () => {
    const a = G.onboardingErgebnis({ achsen: { wie: 1, was: 2, warum: 3, wieso: 4, weshalb: 5 } }).rahmen.achsen;
    return Object.keys(a).sort().join(",") === "warum,was,wie";
  });

/* DER DURCHSTICH. Das eigentliche Risiko: nicht die leere Achse im Ergebnis,
   sondern die bestehende Angabe im Profil, die dabei verlorengeht. */
let p = ein();
p = P.uebernimmRahmen(P.vorschlagRahmen(p, { achsen: { wie: 5, was: 4, warum: 3 } }, T1).profil, T1).profil;
const erg = G.onboardingErgebnis({ schlagwoerter: { [ALLE[0].id]: "zieht_an" }, achsen: { was: 2 } });
const v = P.vorschlagRahmen(p, erg.rahmen, T2);
const u = P.uebernimmRahmen(v.profil, T2);
check("H", "KERNZUSAGE: wer nur EINE Achse anfasst, verliert die beiden anderen nicht"
  + "  [gemessen: {wie:5,was:4,warum:3} + {was:2} → " + JSON.stringify(u.profil.achsen) + "]",
  () => v.fehler === null && u.uebernommen === true
    && u.profil.achsen.wie === 5 && u.profil.achsen.was === 2 && u.profil.achsen.warum === 3);
const ergOhne = G.onboardingErgebnis({ schlagwoerter: { [ALLE[0].id]: "zieht_an" } });
check("H", "ein Onboarding ganz ohne Achsen erzeugt keinen Rahmen — und damit keinen leeren Vorschlag",
  () => ergOhne.rahmen === null && P.vorschlagRahmen(p, ergOhne.rahmen, T2).fehler === "leerer Vorschlag");
/* Der Bereich 0..5 gehört profil.js, nicht diesem Modul — aber der Weg muss
   halten: eine Achse außerhalb darf nicht ins Profil sickern. */
check("H", "eine Achse außerhalb von 0..5 kommt durch onboardingErgebnis, wird aber von vorschlagRahmen abgewiesen"
  + "  [gemessen: " + JSON.stringify([-3, 6, 99].map((v2) => P.vorschlagRahmen(ein(), G.onboardingErgebnis({ achsen: { wie: v2 } }).rahmen, T1).fehler)) + "]",
  () => [-3, 6, 99].every((v2) => /achsen\.wie muss 0\.\.5/.test(
    P.vorschlagRahmen(ein(), G.onboardingErgebnis({ achsen: { wie: v2 } }).rahmen, T1).fehler || "")));

/* Trennung der beiden Bühnen: onboardingErgebnis SCHREIBT nichts. */
const gross = G.onboardingErgebnis({
  schlagwoerter: Object.fromEntries(ALLE.map((s, i) => [s.id, P.RICHTUNGEN[i % 3]])),
  filme: Object.fromEntries(angebot.map((f, i) => [f.id, P.RICHTUNGEN[i % 3]])),
  angebot, achsen: { wie: 4, was: 3, warum: 5 },
});
check("H", "Signale und Rahmen kommen GETRENNT zurück — zwei Wege in profil.js, zwei eigene Bestätigungen"
  + "  [gemessen: " + gross.signale.length + " Signale, " + gross.rahmen.filme.length + " Filme, Achsen " + JSON.stringify(gross.rahmen.achsen) + "]",
  () => Array.isArray(gross.signale) && gross.signale.length === ALLE.length
    && gross.rahmen.filme.length === angebot.length && gross.rahmen.achsen.wie === 4
    && gross.signale.every((s) => s.beleg.startsWith(G.BELEG_PRAEFIX)));
check("H", "onboardingErgebnis schreibt nichts — der Speicher bleibt unberührt",
  () => topf.size === 0);
check("H", "Übergangenes aus BEIDEN Teilen steht in EINER Liste — der Nutzer soll alles erfahren",
  () => {
    const r = G.onboardingErgebnis({ schlagwoerter: { quatsch: "zieht_an" }, filme: { nixda: "zieht_an" }, angebot });
    return r.uebergangen.length === 2 && r.uebergangen.some((u2) => u2.id === "quatsch") && r.uebergangen.some((u2) => u2.id === "nixda");
  });

/* VOLLER DURCHSTICH bis zum speicherbaren Profil. */
let voll = ein();
const s1 = P.sammle(voll, gross.signale, T1);
const u1 = P.uebernimmAlle(s1.profil, T1);
const v1 = P.vorschlagRahmen(u1.profil, gross.rahmen, T2);
const u2 = P.uebernimmRahmen(v1.profil, T2);
check("H", "DURCHSTICH: Onboarding → sammle → uebernimm → vorschlagRahmen → uebernimmRahmen ergibt ein gültiges Profil"
  + "  [gemessen: " + u2.profil.signale.length + " Signale, " + u2.profil.filme.length + " Filme, Version " + u2.profil.version + "]",
  () => s1.verworfen.length === 0 && u1.fehler === null && v1.fehler === null && u2.uebernommen === true
    && P.pruefeProfil(u2.profil).length === 0);
});

/* =========================================================================
   I — DURCHSTICH: ECHTE SCHLAGWORT-SIGNALE DURCH promptFassung
   Die Werte reisen ab Etappe 8 in JEDE Prompt-Fassung. Sie sehen dort nicht
   wie Nutzereingabe aus — genau deshalb sind sie die Angriffsfläche.
   ========================================================================= */
abschnitt("I", async () => {
console.log("\n--- I: Durchstich echter Schlagwort-Signale durch promptFassung ---");
/* Eine Signalzeile darf NUR diese Gestalt haben. Der Wert steht mitten drin,
   unmaskiert — die Form der Zeile ist die einzige Struktur, die ein Modell
   sieht. */
const ZEILE = new RegExp("^- (mag|meidet|ambivalent zu) [a-z0-9_]{1,32} \\((" + P.SIGNAL_ARTEN.join("|") + "), Stärke \\d/5, Sicherheit (hoch|mittel|niedrig)\\)$");
const kaputt = [];
for (const s of ALLE) for (const r of P.RICHTUNGEN) {
  const sig = G.signaleAusAuswahl({ [s.id]: r }).signale[0];
  const t = P.promptFassung({ ...ein(), signale: [sig] }).text;
  if (t.split("\n").length !== 1) { kaputt.push(s.id + "/" + r + ": " + t.split("\n").length + " Zeilen"); continue; }
  if (!ZEILE.test(t)) kaputt.push(s.id + "/" + r + ": " + JSON.stringify(t));
}
check("I", "KERNZUSAGE: jedes Schlagwort erzeugt GENAU EINE Zeile in strenger Form — "
  + (ALLE.length * P.RICHTUNGEN.length) + " Kombinationen  [Fehler: " + kaputt.length + (kaputt[0] ? ", zuerst " + kaputt[0] : "") + "]",
  () => kaputt.length === 0);

/* Die volle Liste auf einmal: kein Wert bricht die Bullet-Struktur auf. */
const alleSig = G.signaleAusAuswahl(Object.fromEntries(ALLE.map((s, i) => [s.id, P.RICHTUNGEN[i % 3]]))).signale;
const f = P.promptFassung({ ...ein(), achsen: { wie: 3, was: 3, warum: 3 }, signale: alleSig }, { maxBytes: 100000 });
const zeilen = f.text.split("\n");
check("I", "…und alle " + ALLE.length + " gemeinsam ergeben genau " + ALLE.length
  + " Signalzeilen plus die Achsenzeile  [gemessen: " + zeilen.length + " Zeilen, " + f.bytes + " Bytes]",
  () => zeilen.length === ALLE.length + 1
    && zeilen[0].startsWith("Achsen-Tendenz: ")
    && zeilen.slice(1).every((z) => ZEILE.test(z)));
check("I", "kein Wert schmuggelt eine eigene Anweisungszeile ein — nichts sieht aus wie eine Rolle oder ein Befehl",
  () => !/(^|\n)\s*(system|assistant|user|instruction|anweisung)\b/i.test(f.text)
    && !/[`"'{}<>\[\]]/.test(f.text.split("\n").slice(1).join("\n").replace(/[()]/g, "")));
/* Die Werte müssen im Prompt WIEDERZUFINDEN sein — ein Schlagwort, das
   ausgewählt wird und dann nicht mal im Text steht, ist das E18-Muster in
   Reinform. */
check("I", "jeder gewählte Wert taucht im Prompt tatsächlich auf",
  () => ALLE.every((s) => f.text.includes(" " + s.wert + " (")));
check("I", "die Fassung ist deterministisch: dieselbe Auswahl in anderer Reihenfolge ergibt zeichengleich denselben Text",
  () => {
    const misch = [...alleSig].reverse();
    return P.promptFassung({ ...ein(), achsen: { wie: 3, was: 3, warum: 3 }, signale: misch }, { maxBytes: 100000 }).text === f.text;
  });
/* Größenordnung für Etappe 8: Der Leitfaden nennt 800–1500 Tokens. Kein
   Grenzwert-Check, sondern eine sichtbare Zahl, die auffällt, wenn sie
   explodiert. */
check("I", "die volle Auswahl bleibt weit unter der Vorgabegrenze von 6000 Bytes  [gemessen: " + f.bytes + " Bytes]",
  () => f.bytes < 6000 && f.gekuerzt === false);
});

/* =========================================================================
   J — DIE TRENNUNG DER FILMRICHTUNGEN IM PROMPT
   Der Kern der profil.js-Änderung. Die Begründung steht im Code: „Genannte
   Filme: Alien, Jackass" lädt jedes Modell dazu ein, beide als Vorlieben zu
   lesen — ein Profil, das Abneigung als Zuneigung ausliefert, ist schlechter
   als eines ohne Filme.
   ========================================================================= */
abschnitt("J", async () => {
console.log("\n--- J: Trennung der Filmrichtungen im Prompt ---");
const FILME = [
  { titel: "Alien", jahr: 1979, sicher: true, richtung: "zieht_an" },
  { titel: "Jackass", jahr: 2002, sicher: true, richtung: "stoesst_ab" },
  { titel: "Irreversible", jahr: 2002, sicher: true, richtung: "ambivalent" },
  { titel: "Solaris", jahr: 1972, sicher: true },
];
const text = P.promptFassung({ ...ein(), filme: FILME }).text;
const zeilen = text.split("\n");
const WORT = { zieht_an: "Filme, die ihn treffen", stoesst_ab: "Filme, die ihn abstoßen", ambivalent: "Filme, zu denen er zwiespältig steht", null: "Genannte Filme" };
check("J", "KERNZUSAGE: vier Richtungen ergeben VIER Zeilen, nicht eine  [gemessen: " + zeilen.length + " Zeilen]",
  () => zeilen.length === 4);
check("J", "jede Richtung bekommt ihren eigenen Wortlaut",
  () => P.RICHTUNGEN.every((r) => text.includes(WORT[r] + ": ")) && text.includes("Genannte Filme: "));
/* Das eigentliche Schadensbild: Ein abgelehnter Film in der Zeile der
   Zuneigung. Deshalb wird jede Zeile einzeln daraufhin gelesen, dass NUR ihr
   eigener Titel darin steht. */
const TITEL = { zieht_an: "Alien", stoesst_ab: "Jackass", ambivalent: "Irreversible", null: "Solaris" };
const vermischt = [];
for (const [r, wort] of Object.entries(WORT)) {
  const z = zeilen.find((x) => x.startsWith(wort + ": "));
  if (!z) { vermischt.push(wort + ": Zeile fehlt"); continue; }
  for (const [r2, t] of Object.entries(TITEL)) {
    if (r2 === r ? !z.includes(t) : z.includes(t)) vermischt.push(wort + " ↔ " + t);
  }
}
check("J", "KERNZUSAGE: keine Richtung taucht in der Zeile einer anderen auf  [Vermischungen: " + vermischt.length
  + (vermischt[0] ? ", zuerst " + vermischt[0] : "") + "]",
  () => vermischt.length === 0);
check("J", "die Zeilen stehen in fester Reihenfolge — zieht_an, stoesst_ab, ambivalent, dann die richtungslose",
  () => zeilen[0].startsWith(WORT.zieht_an) && zeilen[1].startsWith(WORT.stoesst_ab)
    && zeilen[2].startsWith(WORT.ambivalent) && zeilen[3].startsWith("Genannte Filme"));
check("J", "…auch wenn die Filme in umgekehrter Reihenfolge im Profil stehen — deterministisch",
  () => P.promptFassung({ ...ein(), filme: [...FILME].reverse() }).text.split("\n")
    .map((z) => z.split(":")[0]).join("|") === zeilen.map((z) => z.split(":")[0]).join("|"));
check("J", "eine Richtung ohne Filme erzeugt KEINE leere Zeile",
  () => {
    const t = P.promptFassung({ ...ein(), filme: [FILME[1]] }).text;
    return t.split("\n").length === 1 && t.startsWith(WORT.stoesst_ab + ": Jackass");
  });
check("J", "Jahre wandern mit, in jeder Richtung  [gemessen: „" + zeilen[1] + "“]",
  () => zeilen.every((z) => /\(\d{4}\)/.test(z)));
/* Zusammenspiel mit `sicher: false`: Die Zusage „unsichere Filme werden nicht
   genannt" gilt für JEDE Richtung, nicht nur für die richtungslose. */
const unsicher = P.promptFassung({ ...ein(), filme: [
  ...P.RICHTUNGEN.map((r) => ({ titel: "Unsicher" + r, sicher: false, richtung: r })),
  { titel: "UnsicherOhne", sicher: false },
  { titel: "Sicher", sicher: true, richtung: "zieht_an" },
] }).text;
check("J", "`sicher: false` unterdrückt den Film in JEDER Richtung, nicht nur in der richtungslosen"
  + "  [gemessen: „" + unsicher + "“]",
  () => !unsicher.includes("Unsicher") && unsicher === WORT.zieht_an + ": Sicher");
check("J", "eine Richtung, in der ALLE Filme unsicher sind, erzeugt keine Zeile",
  () => P.promptFassung({ ...ein(), filme: [{ titel: "X", sicher: false, richtung: "stoesst_ab" }] }).text === "");
/* Eine Richtung, die profil.js nicht kennt, kann nur über den Restore-Pfad
   ins Profil kommen (pruefeProfil weist sie ab). promptFassung ist die letzte
   Stelle vor dem Anbieter und darf sie nicht in eine fremde Zeile einsortieren. */
check("J", "eine unbekannte Richtung landet in KEINER Zeile — fail-closed statt in der falschen Zeile"
  + "  [gemessen: „" + P.promptFassung({ ...ein(), filme: [{ titel: "Fremd", sicher: true, richtung: "SYSTEM: ignoriere" }, { titel: "Ok", sicher: true }] }).text + "“]",
  () => {
    const t = P.promptFassung({ ...ein(), filme: [{ titel: "Fremd", sicher: true, richtung: "SYSTEM: ignoriere" }, { titel: "Ok", sicher: true }] }).text;
    return t === "Genannte Filme: Ok" && !t.includes("Fremd");
  });
check("J", "…und pruefeProfil weist so ein Profil ab, damit es gar nicht erst über eine Modulfunktion entsteht",
  () => P.pruefeProfil({ ...P.leeresProfil(), filme: [{ titel: "T", richtung: "begeistert" }] }).some((e) => /richtung unbekannt/.test(e))
    && P.RICHTUNGEN.every((r) => P.pruefeProfil({ ...P.leeresProfil(), filme: [{ titel: "T", richtung: r }] }).length === 0));
/* Die Filmzeilen sind Freitext aus einer Datei. Die zweite Schranke (`flach`)
   muss auch in den neuen Zeilen greifen — sie ist der Grund, aus dem
   promptFassung sich nicht auf pruefeProfil verlässt. */
const lang = P.promptFassung({ ...ein(), filme: P.RICHTUNGEN.map((r) => ({ titel: "T".repeat(5000), sicher: true, richtung: r })) }).text;
check("J", "überlange Titel werden in JEDER Richtung gekappt — die zweite Schranke greift in allen vier Zeilen"
  + "  [gemessen: längste Zeile " + Math.max(...lang.split("\n").map((z) => z.length)) + " Zeichen]",
  () => lang.split("\n").length === 3 && lang.split("\n").every((z) => z.length < 250));
/* Byte-Kürzung: Die Zusage ist, dass die Grenze hält — auch wenn jetzt vier
   Zeilen statt einer um den Platz konkurrieren. */
const grossProfil = {
  ...ein(),
  signale: Array.from({ length: 30 }, (_, i) => ({ art: "genre", wert: "z" + i, richtung: "zieht_an", staerke: 4, sicherheit: "hoch", quelle: "K1", beleg: "b" })),
  filme: FILME,
};
const verstoss = [];
for (let m = 50; m <= 2000; m += 7) {
  const r = P.promptFassung(grossProfil, { maxBytes: m });
  if (Buffer.byteLength(r.text, "utf8") > m) verstoss.push(m + " → " + Buffer.byteLength(r.text, "utf8"));
}
check("J", "BYTE-GRENZE hält auch mit vier Filmzeilen — 279 Messungen ab maxBytes 50  [Verstöße: "
  + verstoss.length + (verstoss[0] ? ", zuerst " + verstoss[0] : "") + "]",
  () => verstoss.length === 0);
check("J", "die Kürzung schneidet auf Zeilengrenze — keine halbe Filmzeile im Prompt",
  () => {
    for (let m = 60; m <= 1200; m += 3) {
      const t = P.promptFassung(grossProfil, { maxBytes: m }).text;
      for (const z of t.split("\n")) {
        if (z === "(weitere Züge aus Platzgründen ausgelassen)" || z === "") continue;
        if (!z.startsWith("- ") && !/^(Filme, die ihn treffen|Filme, die ihn abstoßen|Filme, zu denen er zwiespältig steht|Genannte Filme): .+$/.test(z)) return false;
      }
    }
    return true;
  });

/* ---------- B1/B2: die gemeldete Signalzahl ----------
   Die alte Rechnung war zweifach falsch. Sie zog `filmZeile` als EINS ab,
   obwohl seit der Aufteilung nach Richtung bis zu VIER Filmzeilen entstehen
   (gemessen: 1 Signal + 4 Filme meldete `signale: 4` bei `signaleGesamt: 1`
   — eine Teilmenge größer als ihre Menge). Und unter Kürzung zog sie
   Rahmenzeilen ab, die längst weggefallen waren, meldete also zu wenig.
   Deshalb wird die Zusage jetzt über die ganze Matrix gemessen: 0/1/5/30
   Signale × 0..4 Filmzeilen × mit und ohne Achsen × der ganze
   Kürzungsbereich. Ein einzelner Testwert hätte beide Hälften überlebt. */
const zaehlProfil = (nSig, filme, mitAchsen) => ({
  ...ein(),
  achsen: mitAchsen ? { wie: 4, was: 2, warum: 5 } : { wie: null, was: null, warum: null },
  signale: Array.from({ length: nSig }, (_, i) => ({ art: "genre", wert: "z" + i, richtung: "zieht_an", staerke: 4, sicherheit: "hoch", quelle: "K1", beleg: "b" })),
  filme,
});
const FILMSTUFEN = [[], FILME.slice(0, 1), FILME.slice(0, 2), FILME.slice(0, 3), FILME];
let messungen = 0, zaehlFehler = 0, zuGross = 0, ersterFehler = null;
for (const nSig of [0, 1, 5, 30]) for (const filme of FILMSTUFEN) for (const mitAchsen of [false, true]) {
  for (let mb = 60; mb <= 2000; mb += 13) {
    const r = P.promptFassung(zaehlProfil(nSig, filme, mitAchsen), { maxBytes: mb });
    const echt = r.text.split("\n").filter((z) => z.startsWith("- ")).length;
    messungen++;
    if (r.signale !== echt) { zaehlFehler++; ersterFehler = ersterFehler || (nSig + " Sig/" + filme.length + " Filme/@" + mb + ": meldet " + r.signale + ", im Text " + echt); }
    if (r.signale > r.signaleGesamt) zuGross++;
  }
}
check("J", "KERNZUSAGE B1: die gemeldete Signalzahl entspricht IMMER den Signalzeilen im Text"
  + "  [gemessen: " + messungen + " Messungen über 0/1/5/30 Signale × 0..4 Filmzeilen × mit/ohne Achsen × 150 Byte-Grenzen, Fehler: "
  + zaehlFehler + (ersterFehler ? ", zuerst " + ersterFehler : "") + "]",
  () => messungen > 5000 && zaehlFehler === 0);
check("J", "KERNZUSAGE B1a: `signale` ist nie größer als `signaleGesamt` — eine Teilmenge, keine Behauptung"
  + "  [Verstöße: " + zuGross + " von " + messungen + "]",
  () => zuGross === 0);
/* Der konkrete Fall, an dem der Fehler auffiel — als eigener Check, damit er
   im Protokoll namentlich steht und nicht in einer Matrixzahl verschwindet. */
const vier = P.promptFassung(zaehlProfil(1, FILME, false), { maxBytes: 100000 });
check("J", "B1: der Fundfall — 1 Signal und 4 Filmrichtungen melden 1, nicht 4"
  + "  [gemessen: signale=" + vier.signale + ", signaleGesamt=" + vier.signaleGesamt + ", Zeilen im Text=" + vier.text.split("\n").length + "]",
  () => vier.signale === 1 && vier.signaleGesamt === 1 && vier.text.split("\n").length === 5);
check("J", "B2: unter Kürzung wird nicht zu WENIG gemeldet — die Rahmenzeilen sind da schon weg"
  + "  [gemessen: @100 Bytes meldet " + P.promptFassung(zaehlProfil(30, FILME, false), { maxBytes: 100 }).signale
  + ", im Text " + P.promptFassung(zaehlProfil(30, FILME, false), { maxBytes: 100 }).text.split("\n").filter((z) => z.startsWith("- ")).length + "]",
  () => {
    const r = P.promptFassung(zaehlProfil(30, FILME, false), { maxBytes: 100 });
    return r.gekuerzt === true && r.signale === r.text.split("\n").filter((z) => z.startsWith("- ")).length && r.signale > 0;
  });
});

/* =========================================================================
   K — RÜCKWÄRTSKOMPATIBILITÄT
   Die Zusage lautet „additiv". Ein Profil aus der Zeit vor Phase 2c — Filme
   ganz ohne `richtung` — muss gültig bleiben, speicherbar sein und
   ZEICHENGLEICH denselben Prompt erzeugen wie vorher.
   ========================================================================= */
abschnitt("K", async () => {
console.log("\n--- K: Rückwärtskompatibilität (Filme ohne `richtung`) ---");
/* Der erwartete Wortlaut ist an der Fassung VOR der Änderung gemessen
   (git HEAD:src/lib/profil.js, Stand 2026-07-28) und hier als Literal
   festgehalten. Ein Pin auf die eigene Ausgabe wäre wertlos — er würde jede
   Änderung mitmachen, statt sie zu melden. */
const ALTPROFIL = {
  ...ein(),
  achsen: { wie: 4, was: 2, warum: 5 },
  signale: [{ art: "genre", wert: "neo-noir", richtung: "zieht_an", staerke: 4, sicherheit: "hoch", quelle: "K1", beleg: "Blade Runner, Kommentar vom 12.03." }],
  filme: [
    { titel: "Blade Runner", jahr: 1982, sicher: true },
    { titel: "Solaris", sicher: true },
    { titel: "Weggelassen", sicher: false },
    { titel: "Alien", jahr: 1979, sicher: true },
  ],
};
const ALT_ERWARTET = [
  "Achsen-Tendenz: WIE 4, WAS 2, WARUM 5 (von 5)",
  "- mag neo-noir (genre, Stärke 4/5, Sicherheit hoch)",
  "Genannte Filme: Blade Runner (1982), Solaris, Alien (1979)",
].join("\n");
const alt = P.promptFassung(ALTPROFIL);
check("K", "KERNZUSAGE: ein Profil ohne `richtung` erzeugt zeichengleich den Prompt von vor Phase 2c",
  () => alt.text === ALT_ERWARTET);
check("K", "…und die richtungslosen Filme laufen weiterhin unter „Genannte Filme“, in Eingabereihenfolge",
  () => alt.text.split("\n")[2] === "Genannte Filme: Blade Runner (1982), Solaris, Alien (1979)");
check("K", "…und keine der drei neuen Zeilen taucht auf, wenn keine Richtung gesetzt ist",
  () => !/Filme, die ihn|Filme, zu denen/.test(alt.text));
check("K", "ein Altprofil ist unverändert gültig — pruefeProfil meldet nichts",
  () => P.pruefeProfil(ALTPROFIL).length === 0);
const gespeichert = await P.speichereProfil(ALTPROFIL).then(() => true).catch(() => false);
check("K", "…und speicherbar", () => gespeichert === true);
const geladen = await P.ladeProfil();
check("K", "…und wieder ladbar, ohne Schadensmarke",
  () => geladen && !geladen.beschaedigt && geladen.filme.length === 4 && geladen.filme.every((f) => f.richtung === undefined));
topf.clear();
/* `richtung` ist OPTIONAL und bleibt es. Ein Vorgabewert `zieht_an` machte
   aus jeder KI-Nennung eine Zuneigung — genau die erfundene Behauptung, die
   das Modul sonst überall verbietet. */
check("K", "`richtung` bleibt optional: fehlend, null und undefined sind alle gültig",
  () => [{}, { richtung: null }, { richtung: undefined }].every(
    (extra) => P.pruefeProfil({ ...P.leeresProfil(), filme: [{ titel: "T", ...extra }] }).length === 0));
check("K", "…und alle drei landen unter „Genannte Filme“, nicht in einer Richtungszeile",
  () => [{}, { richtung: null }, { richtung: undefined }].every(
    (extra) => P.promptFassung({ ...ein(), filme: [{ titel: "T", sicher: true, ...extra }] }).text === "Genannte Filme: T"));
/* Gemischt: ein Altprofil, das durch das neue Onboarding ergänzt wird. Genau
   der Fall, der in der Praxis zuerst auftritt. */
const gemischt = P.promptFassung({ ...ein(), filme: [
  { titel: "Alt1", sicher: true }, { titel: "Neu", sicher: true, richtung: "zieht_an" }, { titel: "Alt2", sicher: true },
] }).text;
check("K", "ein gemischtes Profil trennt sauber: Altbestand unter „Genannte Filme“, Neues in seiner Richtung"
  + "  [gemessen: „" + gemischt.replace(/\n/g, " ⏎ ") + "“]",
  () => gemischt === "Filme, die ihn treffen: Neu\nGenannte Filme: Alt1, Alt2");
check("K", "leeresProfil() ist unverändert — die Änderung fügt kein Feld hinzu",
  () => Object.keys(P.leeresProfil()).sort().join(",")
    === "achsen,einwilligung,erstellt,filme,format,geaendert,nichtDeutbar,offen,signale,version"
    && P.leeresProfil().filme.length === 0);
});

/* =========================================================================
   M — DAS MESSSKRIPT
   Es ist die EINZIGE Absicherung gegen das E18-Muster: ein Schlagwort, das
   ausgewählt wird und dann nichts bewirkt. Bestätigt es sich selbst, statt zu
   messen, ist die ganze Belegpflicht wertlos. Deshalb wird hier ausdrücklich
   misstraut: Verfälscht man die LISTE, muss es meckern; verfälscht man die
   DATEN, ebenfalls — sonst rechnet es nicht, sondern schreibt ab.
   ========================================================================= */
abschnitt("M", async () => {
console.log("\n--- M: tools/schlagwort_belege.mjs — misst es wirklich? ---");
const SKRIPT = path.join(WURZEL, "tools/schlagwort_belege.mjs");
if (!fs.existsSync(SKRIPT)) { console.log("  ÜBERSPRUNGEN: " + SKRIPT + " fehlt."); return; }
if (!ECHT) {
  console.log("  ÜBERSPRUNGEN: ohne Beta-Daten lässt sich nicht prüfen, ob das Skript misst.");
  return;
}
/* Gespiegelter Baum in /tmp: eine Kopie des Skripts, die echten src/lib per
   Symlink, eine EIGENE Kopie der Liste. So lassen sich Liste und Daten
   verfälschen, ohne das Repo anzufassen. */
const SPIEGEL = fs.mkdtempSync(path.join(require$fs_tmp(), "kd-mess-"));
function require$fs_tmp() { return (process.env.TMPDIR || "/tmp"); }
fs.mkdirSync(path.join(SPIEGEL, "tools"), { recursive: true });
fs.mkdirSync(path.join(SPIEGEL, "src", "data"), { recursive: true });
fs.copyFileSync(SKRIPT, path.join(SPIEGEL, "tools", "schlagwort_belege.mjs"));
fs.symlinkSync(path.join(WURZEL, "src", "lib"), path.join(SPIEGEL, "src", "lib"));
const SP_LISTE = path.join(SPIEGEL, "src", "data", "geschmack_schlagwoerter.json");
const schreibeListe = (o) => fs.writeFileSync(SP_LISTE, JSON.stringify(o, null, 1) + "\n");
schreibeListe(LISTE_ROH);

const SP_DATEN = path.join(SPIEGEL, "daten");
fs.mkdirSync(SP_DATEN, { recursive: true });
for (const n of ["programm.json", "streaming_bekannt.json", "streaming_entdecken.json"]) {
  const q = path.join(DATEN, n);
  if (fs.existsSync(q)) fs.copyFileSync(q, path.join(SP_DATEN, n));
}
/* `aus` ist alles, `meldung` NUR die Fehlerausgabe. Die Trennung ist nicht
   Kosmetik: Die Tabelle auf stdout trägt die Begründungstexte der
   verworfenen Kandidaten, und darin steht wörtlich „EINE Reihe". Ein Check,
   der in `aus` nach dieser Wendung sucht, findet sie IMMER. Genau so war der
   Konzentrations-Check in Runde 1 grün: bei Exit 0 war `aus` leer, und er
   bestand aus dem falschen Grund. Ein zweiter Befund am eigenen Werkzeug. */
const lauf = (daten = SP_DATEN) => {
  try {
    const out = execFileSync(process.execPath, [path.join(SPIEGEL, "tools", "schlagwort_belege.mjs"), "--daten=" + daten],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, aus: String(out || ""), meldung: "" };
  } catch (e) {
    return { code: e.status, aus: String(e.stderr || "") + String(e.stdout || ""), meldung: String(e.stderr || "") };
  }
};

const sauber = lauf();
check("M", "gegen die unveränderte Liste und die echten Daten läuft es sauber durch  [Exit " + sauber.code + "]",
  () => sauber.code === 0);

/* PROBE 1: gespeicherte Zahl verfälschen. Fällt sie nicht auf, vergleicht
   das Skript gar nicht. */
const p1 = JSON.parse(JSON.stringify(LISTE_ROH));
p1.schlagwoerter[0].treffer.kino = p1.schlagwoerter[0].treffer.kino + 1;
p1.schlagwoerter[0].treffer.gesamt = p1.schlagwoerter[0].treffer.gesamt + 1;
schreibeListe(p1);
const r1 = lauf();
check("M", "eine verfälschte GESPEICHERTE Zahl fällt auf  [Exit " + r1.code + "]",
  () => r1.code === 1 && /Trefferzahl weicht ab/.test(r1.aus) && r1.aus.includes(p1.schlagwoerter[0].id));

/* PROBE 2: die DATEN verfälschen, Liste unverändert. Das ist die eigentliche
   Frage — rechnet es aus den Daten, oder liest es die JSON zurück? */
schreibeListe(LISTE_ROH);
const progDatei = path.join(SP_DATEN, "programm.json");
const prog = JSON.parse(fs.readFileSync(progDatei, "utf8"));
let entfernt = 0;
for (const film of prog.filme || []) {
  if (entfernt >= 3) break;
  if ((film.genres || []).some((g) => /^drama$/i.test(g))) { film.genres = film.genres.filter((g) => !/^drama$/i.test(g)); entfernt++; }
}
fs.writeFileSync(progDatei, JSON.stringify(prog));
const r2 = lauf();
fs.copyFileSync(path.join(DATEN, "programm.json"), progDatei);
check("M", "KERNFRAGE: verändert man die DATEN, ändert sich die Messung — das Skript rechnet, es schreibt nicht ab"
  + "  [" + entfernt + " Drama-Zuordnungen entfernt → Exit " + r2.code + "]",
  () => entfernt === 3 && r2.code === 1 && /Trefferzahl weicht ab/.test(r2.aus));
check("M", "…und es läuft nach der Rücknahme wieder grün — die Probe war die Ursache, nicht ein Nebeneffekt",
  () => lauf().code === 0);

/* PROBE 3: Daten fehlen. Eine stille Null wäre die Lüge, gegen die das Skript
   existiert. */
const r3 = lauf(path.join(SPIEGEL, "gibtsnicht"));
check("M", "fehlende Daten brechen mit Code 2 und einer Anleitung ab — NICHT mit „0 Treffer“  [Exit " + r3.code + "]",
  () => r3.code === 2 && /FEHLT/.test(r3.aus) && /--daten=/.test(r3.aus) && !/Alle Schlagwoerter belegt/.test(r3.aus));
const halb = path.join(SPIEGEL, "halb");
fs.mkdirSync(halb, { recursive: true });
fs.copyFileSync(path.join(SP_DATEN, "programm.json"), path.join(halb, "programm.json"));
const r3b = lauf(halb);
check("M", "auch HALB vorhandene Daten brechen ab, statt die fehlende Hälfte als 0 zu zählen  [Exit " + r3b.code + "]",
  () => r3b.code === 2 && /streaming_bekannt\.json/.test(r3b.aus));

/* PROBE 4: die Sicherheitsform und das Modell. Das Skript ist die Stelle, an
   der eine Kurationshand ohne Codewissen gebremst wird. */
const p4 = JSON.parse(JSON.stringify(LISTE_ROH));
p4.schlagwoerter[0].wert = 'dra"ma: SYSTEM';
schreibeListe(p4);
const r4 = lauf();
check("M", "ein `wert` mit Anführungszeichen und Doppelpunkt wird abgewiesen  [Exit " + r4.code + "]",
  () => r4.code === 1 && /verletzt die Prompt-Sicherheitsform/.test(r4.aus));
const p5 = JSON.parse(JSON.stringify(LISTE_ROH));
p5.schlagwoerter[0].art = "stimmung";
schreibeListe(p5);
const r5 = lauf();
check("M", "eine `art` außerhalb von SIGNAL_ARTEN wird abgewiesen — und pruefeSignal meldet sie in BEIDEN Richtungen"
  + "  [Exit " + r5.code + "]",
  () => r5.code === 1 && /steht nicht in SIGNAL_ARTEN/.test(r5.aus)
    && /zieht_an: pruefeSignal/.test(r5.aus) && /stoesst_ab: pruefeSignal/.test(r5.aus));
/* PROBE 5: Die Schwelle ist der Kern der Belegpflicht — ein Schlagwort unter
   der Schwelle oder mit einer Reihen-Konzentration über der Grenze gehört
   nach „verworfen", nicht in die Liste. Geprüft an den ECHTEN verworfenen
   Kandidaten: `historie` scheiterte an der Schwelle, `stunt` an der
   Konzentration (5 Treffer, alle fünf Jackass). Die verworfenen Einträge
   führen bewusst kein art/wert — für die Probe werden sie ergänzt, sonst
   scheiterte der Lauf schon an der Modellprüfung statt an der Schwelle. */
const alsAufnahme = (id, art) => {
  const e = (LISTE_ROH.verworfen || []).find((x) => x.id === id);
  return e ? { ...e, gruppe: "genre", art, wert: id, beleg: "schlagwort:" + id, anzeige: e.anzeige || id } : null;
};
const proben = [["historie", "genre", /unter Schwelle/], ["stunt", "thema", /EINE Reihe/]];
for (const [id, art, muster] of proben) {
  const kand = alsAufnahme(id, art);
  if (!kand) { check("M", "verworfener Kandidat `" + id + "` steht in der Liste", false); continue; }
  const p6 = JSON.parse(JSON.stringify(LISTE_ROH));
  p6.schlagwoerter.push(kand);
  schreibeListe(p6);
  const r6 = lauf();
  check("M", "der verworfene Kandidat `" + id + "` fällt sofort auf, wenn er in die Liste zurückwandert"
    + "  [Exit " + r6.code + ", Grund: " + (muster.test(r6.aus) ? "erkannt" : "NICHT erkannt") + "]",
    () => r6.code === 1 && muster.test(r6.aus));
}
schreibeListe(LISTE_ROH);

/* PROBE 6 (M1, repariert): Bis zur zweiten Runde verglich das Skript nur
   kino/bekannt/gesamt. `konzentration` und `entdecken` standen in der Datei,
   sahen belegt aus und waren es nicht — verfälscht schwieg das Skript und
   ging auf Exit 0. Beide Felder werden jetzt EINZELN nachgeprüft, damit ein
   Ausfall sagt, WELCHES Feld ungewacht ist. */
const einzelProben = [
  ["konzentration", (o) => { o.schlagwoerter[0].treffer.konzentration = 0.99; }],
  ["entdecken", (o) => { o.schlagwoerter[0].treffer.entdecken = 4242; }],
];
for (const [feld, verfaelsche] of einzelProben) {
  const pk = JSON.parse(JSON.stringify(LISTE_ROH));
  verfaelsche(pk);
  schreibeListe(pk);
  const rk = lauf();
  schreibeListe(LISTE_ROH);
  check("M", "M1: eine verfälschte `" + feld + "`-Zahl fällt auf — sie steht in der Datei und muss belegt sein"
    + "  [Exit " + rk.code + (rk.code === 1 ? ", gemeldet als: " + (new RegExp("weicht ab \\([^)]*" + feld).test(rk.aus) ? feld : "ANDERES FELD") : "") + "]",
    () => rk.code === 1 && new RegExp("weicht ab \\([^)]*" + feld).test(rk.aus));
}
/* Beides zusammen — und die Gegenprobe: Die Schwellenregel selbst rechnet
   weiter auf der GEMESSENEN Konzentration, nicht auf der gespeicherten. Wer
   0.99 in die Datei schreibt, löst keine Reihen-Meldung aus; die Zahl wird
   verglichen, nicht geglaubt. */
const p7 = JSON.parse(JSON.stringify(LISTE_ROH));
p7.schlagwoerter[0].treffer.konzentration = 0.99;
p7.schlagwoerter[0].treffer.entdecken = 4242;
schreibeListe(p7);
const r7 = lauf();
schreibeListe(LISTE_ROH);
check("M", "M1: beide Felder gemeinsam verfälscht ergeben genau EINE Abweichungsmeldung mit beiden Namen"
  + "  [Exit " + r7.code + "]",
  () => r7.code === 1 && /weicht ab \([^)]*konzentration[^)]*\)/.test(r7.aus) && /weicht ab \([^)]*entdecken[^)]*\)/.test(r7.aus));
check("M", "…die Schwellenregel greift trotzdem auf der GEMESSENEN Konzentration, nicht auf der gespeicherten"
  + "  [gemessen: verfälschte 0.99 erzeugt " + (r7.meldung.match(/^ {2}- /gm) || []).length
  + " Meldung(en), darunter Reihen-Meldung: " + (/EINE Reihe/.test(r7.meldung) ? "ja" : "nein") + "]",
  () => !/EINE Reihe/.test(r7.meldung) && /weicht ab/.test(r7.meldung));

/* PROBE 7 (K1, repariert): Der Entdecken-Korpus führt in den Beta-Daten bei
   ALLEN 12 540 Einträgen `genres: null`. Vorher stand deshalb bei jedem
   Genre-Schlagwort eine „0" in der Spalte — eine Zahl, die wie ein
   Messergebnis aussah („trifft im Streaming-Katalog nichts"), tatsächlich
   aber nur hieß „dieser Korpus kennt das Feld nicht". Das ist das
   E18-Muster eine Ebene höher. Jetzt steht dort „—". Geprüft wird BEIDE
   Richtungen: dass die Marke bei fehlenden Genres erscheint UND dass sie
   verschwindet, sobald der Korpus welche führt — sonst wäre sie nur eine
   zweite, festverdrahtete Behauptung. */
const entDatei = path.join(SP_DATEN, "streaming_entdecken.json");
const entVorhanden = fs.existsSync(entDatei);
const entRoh = entVorhanden ? JSON.parse(fs.readFileSync(entDatei, "utf8")) : null;
const ohneGenres = entVorhanden ? (entRoh.titel || []).every((t) => !Array.isArray(t.genres) || !t.genres.length) : false;
/* `lauf()` meldet nur den Exit-Code; für die Textprüfung braucht es die
   Ausgabe auch im Erfolgsfall. */
const ausgabe = (daten = SP_DATEN) => {
  try {
    return execFileSync(process.execPath, [path.join(SPIEGEL, "tools", "schlagwort_belege.mjs"), "--daten=" + daten],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) { return String(e.stdout || "") + String(e.stderr || ""); }
};
const textOhne = ausgabe();
/* Die Entdecken-Spalte liegt an festen Zeichenpositionen (id 20 · art 8 ·
   gruppe 12 · kino 6 · bekannt 8 · gesamt 7 · konz 6 = 67, Breite 7).
   Über feste Offsets gelesen und nicht über „letztes Wort der Zeile" — bei
   den verworfenen Kandidaten folgt danach noch der Begründungstext. */
const spalte = (text, id) => {
  const z = text.split("\n").find((x) => new RegExp("^" + id + "\\s").test(x)) || "";
  return z.slice(67, 74).trim();
};
check("M", "K1: führt der Entdecken-Korpus keine Genres, sagt der Kopf das ausdrücklich"
  + "  [gemessen: " + (entVorhanden ? (entRoh.titel || []).length + " Titel, alle ohne Genres: " + ohneGenres : "Korpus fehlt") + "]",
  () => entVorhanden && ohneGenres
    && /Kein einziger der \d+ Entdecken-Titel fuehrt Genres/.test(textOhne)
    && /nicht messbar/.test(textOhne) && /gemessen, trifft nichts/.test(textOhne));
check("M", "K1: und die Genre-Zeilen tragen die Marke „—“ statt einer 0"
  + "  [gemessen: Spalte bei `drama` = „" + spalte(textOhne, "drama") + "“]",
  () => spalte(textOhne, "drama") === "—");
/* Gegenprobe: ein Entdecken-Korpus MIT Genres. Die Marke muss verschwinden
   und echte Zahlen müssen erscheinen — sonst wäre „—" nur eine zweite
   Behauptung an der Stelle der ersten. */
if (entVorhanden) {
  const mitGenres = { ...entRoh, titel: (entRoh.titel || []).slice(0, 200).map((t, i) => ({ ...t, genres: i % 2 ? ["Drama"] : ["Action"] })) };
  fs.writeFileSync(entDatei, JSON.stringify(mitGenres));
  const textMit = ausgabe();
  fs.copyFileSync(path.join(DATEN, "streaming_entdecken.json"), entDatei);
  check("M", "K1-GEGENPROBE: führt der Korpus Genres, verschwindet die Marke und es steht eine echte Zahl"
    + "  [gemessen: Spalte bei `drama` = „" + spalte(textMit, "drama") + "“, bei `action` = „" + spalte(textMit, "action") + "“]",
    () => !/Kein einziger der \d+ Entdecken-Titel fuehrt Genres/.test(textMit)
      && /^\d+$/.test(spalte(textMit, "drama")) && Number(spalte(textMit, "drama")) > 0);
}
/* NEUER BEFUND aus der Gegenprobe: Die Marke gilt für die GANZE Spalte,
   nicht je Eintrag. Die vier Epochen-Schlagwörter messen im
   Entdecken-Korpus über `jahr` echte Treffer (526 bis 5632) — und sehen
   trotzdem ein „—", obwohl der Hinweis darüber ausdrücklich sagt, dass Jahr
   und Jahrzehnt dort wirksam bleiben. Text und Tabelle widersprechen sich. */
check("X", "BEFUND K1a: die „—“-Marke trifft nur die Einträge, die wirklich nicht messbar sind —"
  + " jahresbasierte Schlagwörter behalten ihre gemessene Zahl"
  + "  [gemessen: bis_1979 zeigt „" + spalte(textOhne, "bis_1979") + "“, gespeichert sind "
  + ((LISTE_ROH.schlagwoerter.find((s) => s.id === "bis_1979") || {}).treffer || {}).entdecken + " Treffer]",
  () => /^\d+$/.test(spalte(textOhne, "bis_1979")));

fs.rmSync(SPIEGEL, { recursive: true, force: true });
});

/* =========================================================================
   X — BEFUNDE
   Heute rot, NICHT exit-relevant. Ein Pin auf falsches Verhalten machte die
   Reparatur später zur „Regression".

   ERLEDIGT AM 28.07.: B1, B1a, B2, B3, B4, B5, B6, B7, K2 und M1
   sind gebaut. Sie stehen nicht mehr hier, sondern als harte Checks in den
   Gruppen, deren Zusage sie betreffen — F (max, Artikel), G (Angebot kein
   Array), H (null-Eingabe), J (Signalzahl), M (Messskript). Ein reparierter
   Befund, der als Befund stehen bleibt, verliert seine Wache.
   ========================================================================= */
abschnitt("X", async () => {
console.log("\n--- X: Befunde (offen, nicht exit-relevant) ---");

/* B5 ist nicht durch Code erledigt, sondern durch eine ausdrückliche
   Kennzeichnung: `FILM_BELEG_PRAEFIX` hat weiterhin keinen Erzeuger, ist
   aber jetzt als Reservierung für Phase 3 markiert, samt Warnung an Phase 4,
   keinen Zähler darauf zu bauen. Gewacht wird deshalb die KENNZEICHNUNG —
   verschwindet sie, ist der Präfix wieder eine unbelegte Zusage. */
const QUELLE_GESCHMACK = fs.readFileSync(GESCHMACK_ORIG, "utf8");
check("X", "B5: FILM_BELEG_PRAEFIX ist als Reservierung gekennzeichnet, solange nichts ihn erzeugt"
  + "  [gemessen: Erzeuger im Modul: " + (JSON.stringify(G.filmeAusAuswahl(
    { [G.filmAuswahl(KORPUS)[0].id]: "zieht_an" }, G.filmAuswahl(KORPUS)).filme).includes(G.FILM_BELEG_PRAEFIX) ? "ja" : "nein") + "]",
  () => {
    const angebot = G.filmAuswahl(KORPUS);
    const { filme } = G.filmeAusAuswahl({ [angebot[0].id]: "zieht_an" }, angebot);
    const hatErzeuger = JSON.stringify(filme).includes(G.FILM_BELEG_PRAEFIX);
    const istGekennzeichnet = /RESERVIERT F(Ü|UE)R PHASE 3/i.test(QUELLE_GESCHMACK)
      && /FILM_BELEG_PRAEFIX/.test(QUELLE_GESCHMACK);
    return hatErzeuger || istGekennzeichnet;
  });

});

/* =========================================================================
   LAUF
   ========================================================================= */
for (const [name, lauf] of ABSCHNITTE) {
  try { await lauf(); }
  catch (e) { check(name, "ABSCHNITT ABGEBROCHEN: " + (e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e), false); }
}

const TITEL = {
  A: "Modell, Konstanten, Liste, Harnisch",
  B: "Belegpflicht (volle Liste × Richtungen)",
  C: "Richtungs-Exklusivität",
  D: "signaleAusAuswahl: Ränder",
  E: "filmAuswahl an echten Beta-Daten",
  F: "filmAuswahl: Zusagen und Ränder",
  G: "filmeAusAuswahl",
  H: "onboardingErgebnis und die Achsen",
  I: "Durchstich durch promptFassung",
  J: "Trennung der Filmrichtungen",
  K: "Rückwärtskompatibilität",
  M: "Das Messskript",
};
/* Wache gegen den Fehler, der in profil_test.mjs schon einmal passiert ist:
   Eine Gruppe, die es gibt, aber in TITEL fehlt, würde weder gezählt noch
   exit-relevant sein — ihre roten Checks verschwänden lautlos. */
const unbekannteGruppen = [...gruppen.keys()].filter((g) => g !== "X" && !TITEL[g]);
let ok = 0, schlecht = 0;
console.log("\n===========================================================");
console.log("Quellen:  " + path.relative(WURZEL, GESCHMACK_DATEI) + " · " + path.relative(WURZEL, PROFIL_DATEI)
  + (MUTATIONSLAUF ? "   (MUTATIONSLAUF)" : ""));
console.log("Betrieb:  reines Modul · kein JSDOM · kein Netz · kein Anbieter");
console.log("Daten:    " + (ECHT ? DATEN + " (" + ECHT.length + " bewertete Titel)" : "NICHT GEFUNDEN — Gruppen E und M bleiben leer"));
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
console.log(`\nX  Befunde an geschmack.js / profil.js / Kuration: ${okX}/${okX + rotX.length} unauffällig`
  + (rotX.length ? " — " + rotX.length + " offen:" : ""));
for (const n of rotX) console.log("  ○ " + n);
if (rotX.length) {
  console.log("  (Bewusst NICHT als grüner Check auf das Ist-Verhalten gepinnt und nicht");
  console.log("   exit-relevant. GESCHMACK_STRENG=1 schaltet sie scharf.)");
}
const streng = process.env.GESCHMACK_STRENG === "1";
const fehlschlag = schlecht > 0 || unbekannteGruppen.length > 0 || (streng && rotX.length > 0);
console.log(fehlschlag ? "\nGESCHMACK-TEST: BEFUNDE OBEN" : "\nGESCHMACK-TEST BESTANDEN");
process.exit(fehlschlag ? 1 : 0);
