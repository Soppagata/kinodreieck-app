/* Etappe 6 — Modultest für src/lib/finder.js
   ===========================================================================
   ZWEI TEILE, GETRENNTE HAND (Personalunion-Regel)
   ---------------------------------------------------------------------------
   [A] IST-VERHALTEN PINNEN
       Geschrieben nach Lesen von src/lib/finder.js, src/lib/match.js und
       src/data/finder_vokabular.json. Diese Checks halten das heutige, als
       richtig befundene Verhalten fest. Sie müssen grün sein und bleiben.
       Wer sie rot macht, hat entweder einen Regressionsfehler gebaut oder
       muss den Check bewusst mit Begründung ändern.

   [B] SOLL-VERHALTEN (Negation, Jahresbereiche, Robustheit)
       Geschrieben AUSSCHLIESSLICH aus der Spezifikation zu Etappe 6 —
       ohne Blick auf eine Implementierung, weil es zum Zeitpunkt des
       Schreibens keine gab. Beim ersten Lauf waren 38 von 46 rot; das war
       beabsichtigt. Seit dem Bau sind sie grün und wirken ab jetzt wie
       A-Checks: sie halten das neue Verhalten fest.
       Der Abschnitt "Nachträge" am Ende kam nach dem Bau hinzu — aus den
       ENTSCHEIDUNGEN zu offenen Spezifikationsfragen (E11/E15/E16), nicht
       aus dem Code.

   ABDECKUNGS-CHECK (am Ende, zählt zu [A])
       Prüft jedes Genre-Ziel des Vokabulars gegen realistische deutsche
       Genre-Schreibweisen. Fängt die Fehlerklasse, die im positiven Fall
       nur eine leere Suche ist, im Ausschlussfall aber STILL falsch liefert.

   EXIT-CODE-POLITIK
   ---------------------------------------------------------------------------
     ohne FINDER_SOLL=1   A-Tests scharf (Exit 1, sobald ein A-Check rot ist),
                          B-Tests werden nur BERICHTET (kein Exit 1).
                          -> Der Test kann so in die bestehende grüne Kette
                             (npm test) aufgenommen werden, ohne sie zu brechen.
     mit  FINDER_SOLL=1   beide Teile scharf (Exit 1 bei rotem A ODER B).
                          -> So wird der Test nach dem Bau abgenommen.

   Kein Framework, keine Dependencies (Muster wie architekturgrenzen_test.mjs /
   ai_test.mjs). Alle Checks laufen durch; ein roter Check verdeckt nichts.

   BEHOBENER FEHLER, NIE ALS [A] GEPINNT (Historie — bitte so lassen)
   ---------------------------------------------------------------------------
   Vor Etappe 6 lieferte parseAnfrage("kein Horror") sig.genres = ["horror"]
   und sucheFinder damit GENAU Horrorfilme — das Gegenteil der Anfrage;
   dasselbe für "nicht lustig", "ohne Trash", "nicht aus den 2000ern". Es gab
   dazu bewusst KEINEN A-Check, der das festschreibt: ein Pin auf falsches
   Verhalten macht die Reparatur später zur "Regression". Die korrekte
   Erwartung stand von Anfang an in Teil B (B2/B4) und ist jetzt grün.
   =========================================================================== */

import fs from "node:fs";

const F = await import("./src/lib/finder.js");
const { score, schlagseite, norm } = await import("./src/lib/match.js");
const VOK = JSON.parse(fs.readFileSync(new URL("./src/data/finder_vokabular.json", import.meta.url), "utf8"));

/* ---------------------------------------------------------------- Zählwerk */
let okA = 0, okB = 0;
const rotA = [], rotB = [];
const lauf = (teil, name, wert) => {
  let ergebnis;
  try {
    ergebnis = typeof wert === "function" ? wert() : wert;
  } catch (e) {
    ergebnis = false;
    name += "  [Ausnahme: " + e.message + "]";
  }
  const voll = "[" + teil + "] " + name;
  if (ergebnis) {
    if (teil === "A") okA++; else okB++;
    console.log("✓ " + voll);
  } else {
    (teil === "A" ? rotA : rotB).push(voll);
    console.log("✗ FEHLGESCHLAGEN: " + voll);
  }
};
const checkA = (name, wert) => lauf("A", name, wert);
const checkB = (name, wert) => lauf("B", name, wert);

/* Hilfen */
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const menge = (a) => JSON.stringify([...a].sort());
const gleichMenge = (a, b) => menge(a) === menge(b);
const feld = (x) => (Array.isArray(x) ? x : []);          // fehlendes Soll-Feld: leer, nicht Absturz
const ids = (treffer) => treffer.map((t) => t.film.id);
const fallend = (treffer) => treffer.every((t, i) => i === 0 || treffer[i - 1].wert >= t.wert);
const relFallend = (treffer) => treffer.every((t, i) => i === 0 || treffer[i - 1].rel >= t.rel);

/* =========================================================================
   FIXTURES — klein, sprechend, deterministisch.
   Genre-Schreibweisen sind die ECHTEN aus Max' Masterliste (177 Einträge,
   geprüft 26.07.2026): durchgehend klein, "sci-fi", "romance", "komödie",
   "crime", "film-noir". NICHT die Formen aus src/data/masterliste.json — das
   ist die Demo-Datei, die lange eine andere Datenform behauptete ("Romanze",
   "Science-Fiction") und damit echte Vokabular-Lücken verdeckte. Prüfmaßstab
   ist die Nutzerdatenform, nicht die bequemste Datei im Repo.
   Titel enthalten bewusst KEINES der Abfragewörter der Tests — sonst würde
   die Titel-Erkennung (umgeht alle Filter) die Filtertests verfälschen.
   bewertung: { wie, was, warum } 0-5 (Form aus src/data/masterliste.json,
   ausgewertet von match.js score()/schlagseite()).
   ========================================================================= */
const MASTER = [
  { id: "nacht_der_glut_1984", titel: "Nacht der Glut", originaltitel: "Night of Embers", jahr: 1984, typ: "film",
    quelle: "dvd", kategorie: "wahrscheinlich_passend", genre: ["horror"], tags: ["duester", "boese", "kult"],
    bewertung: { wie: 4, was: 2, warum: 4 }, reihe: ["Glutnacht Zyklus"], regie: ["Orla Vendt"] },            // score 12.5, schlagseite wie
  { id: "stiller_hafen_1972", titel: "Stiller Hafen", originaltitel: "Quiet Harbour", jahr: 1972, typ: "film",
    quelle: "dvd", kategorie: "wahrscheinlich_passend", genre: ["drama"], tags: ["melancholisch", "klassiker"],
    bewertung: { wie: 3, was: 5, warum: 2 } },                                                                // score 12.5, schlagseite was
  { id: "zwei_linke_pfoten_2015", titel: "Zwei linke Pfoten", originaltitel: "Two Left Paws", jahr: 2015, typ: "film",
    quelle: "netflix", kategorie: "sicher_gut", genre: ["komödie"], tags: ["feelgood"],
    bewertung: { wie: 2, was: 3, warum: 2 } },                                                                // score 9
  { id: "herz_aus_papier_2004", titel: "Herz aus Papier", originaltitel: "Herz aus Papier", jahr: 2004, typ: "film",
    quelle: "dvd", kategorie: "referenz", genre: ["romance"], tags: ["liebe"],
    bewertung: { wie: 3, was: 3, warum: 3 } },                                                                // score 9
  { id: "gebrochene_bahn_1994", titel: "Gebrochene Bahn", originaltitel: "Broken Track", jahr: 1994, typ: "film",
    quelle: "prime", kategorie: "zu_pruefen", genre: ["thriller"], tags: ["spannung"],
    bewertung: { wie: 2, was: 4, warum: 2 } },                                                                // score 9.5
  { id: "sternenpfad_2019", titel: "Sternenpfad", originaltitel: "Starpath", jahr: 2019, typ: "film",
    quelle: "kino", kategorie: "zu_pruefen", genre: ["sci-fi"], tags: ["weltenbau"],
    bewertung: { wie: 5, was: 3, warum: 3 }, franchise: ["Kosmoswacht Saga"] },                               // score 12.5, schlagseite wie
  { id: "lange_funke_2021", titel: "Der lange Funke", originaltitel: "The Long Spark", jahr: 2021, typ: "film",
    quelle: "disney", kategorie: "zu_pruefen", genre: ["sci-fi"], tags: [],
    bewertung: { wie: 3, was: 3, warum: 4 }, franchise: ["Kosmoswacht Saga"] },                               // score 10
  { id: "billiger_schund_1988", titel: "Billiger Schund", originaltitel: "Cheap Junk", jahr: 1988, typ: "film",
    quelle: "dvd", kategorie: "zu_pruefen", genre: ["horror"], tags: ["trash", "camp"],
    bewertung: { wie: 1, was: 1, warum: 2 } },                                                                // score 4
  { id: "letzte_kurve_1979", titel: "Letzte Kurve", originaltitel: "Last Bend", jahr: 1979, typ: "film",
    quelle: "dvd", kategorie: "zu_pruefen", genre: ["action"], tags: ["spannung"],
    bewertung: { wie: 3, was: 2, warum: 3 } },                                                                // score 8
];
const ALLE_IDS = MASTER.map((f) => f.id);
const OHNE = (...weg) => ALLE_IDS.filter((i) => !weg.includes(i));

/* Kino-Termine: relativ zum Lauf gebaut (finder.js vergleicht gegen
   "T.M." von heute bzw. morgen) — deterministisch, aber datumsunabhängig. */
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const termin = (versatzTage, uhr, kino) => {
  const d = new Date(Date.now() + versatzTage * 86400000);
  return WT[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + ". " + uhr + " · " + kino;
};
const T_HEUTE = termin(0, "20:00", "Gartenbaukino");
const T_HEUTE_2 = termin(0, "22:30", "Votivkino");
const T_MORGEN = termin(1, "18:15", "Gartenbaukino");
const T_UEBER = termin(2, "19:45", "Filmcasino");

const KINO_MATCHES = {
  matched: [
    { film: MASTER[5], prog: { t: "Sternenpfad", j: 2019, k: ["Gartenbaukino", "Votivkino"],
      z: [T_HEUTE, T_HEUTE_2, T_MORGEN, T_UEBER], b: "Weltraum-Utopie", ot: "Starpath" } },
    { film: MASTER[2], prog: { t: "Zwei linke Pfoten", j: 2015, k: ["Filmcasino"], z: [T_UEBER] } },
  ],
  rest: [],
};
const STREAMING_BEKANNT = {
  titel: [{ id: "gebrochene_bahn_1994", dienste: ["prime"], web_urls: { prime: "https://example.invalid/gb" } }],
};
const KTX = { master: MASTER, kinoMatches: KINO_MATCHES, streamingBekannt: STREAMING_BEKANNT };

/* Kino-Programmfilme OHNE Masterlisten-Eintrag (kinoMatches.rest).
   "Horror am Freitag" trägt das Abfragewort im Titel — nur so lässt sich der
   Titel-Vorrang in der Sortierung neben einem Genre-Signal prüfen: sucheKino
   verlangt für einen Titeltreffer, dass ALLE Query-Wörter (>=3) im Titel stehen. */
const KINO_REST = [
  { t: "Fremder Sommer", ot: "Foreign Summer", j: 2026, g: ["drama"], k: ["Votivkino"], z: [T_HEUTE] },
  { t: "Grelle Fratze", ot: "Garish Grin", j: 1985, g: ["horror", "thriller"], k: ["Filmcasino"], z: [T_MORGEN] },
  { t: "Weites Feld", ot: "Wide Field", j: 2024, g: ["komödie"], k: ["Admiral"], z: [T_HEUTE] },
  { t: "Horror am Freitag", ot: "Horror on Friday", j: 1973, g: ["horror"], k: ["Metrokino"], z: [T_MORGEN] },
];
const KINO_REST_VIEL = Array.from({ length: 20 }, (_, i) => (
  { t: "Kinofremd " + (i + 1), ot: "Alien Screening " + (i + 1), j: 2001 + i, g: ["drama"], k: ["Testkino"], z: [T_HEUTE] }));

/* Streaming-Entdecken-Katalog (ungeprüft, keine Bewertung) */
const ENTDECKEN = { titel: [
  { titel: "Blutrote Kammer", originaltitel: "Crimson Chamber", jahr: 2018, genres: ["horror"], relevanz: 9 },
  { titel: "Zorn im Nebel", originaltitel: "Wrath in Fog", jahr: 1993, genres: ["action"], relevanz: 7 },
  { titel: "Leises Vorspiel", originaltitel: "Quiet Prelude", jahr: 1968, genres: ["drama"], relevanz: 5 },
] };
const ENTDECKEN_VIEL = { titel: Array.from({ length: 15 }, (_, i) => (
  { titel: "Katalogtitel " + (i + 1), originaltitel: "Catalog Item " + (i + 1), jahr: 1990 + i,
    genres: ["drama"], relevanz: 100 - i })) };

/* Masterliste allein für die Kappungs-Checks (Reihen > 20, Titel > 12) */
const MASTER_MANY = Array.from({ length: 21 }, (_, i) => (
  { id: "sammelfilm_" + (i + 1), titel: "Sammelfilm " + (i + 1), originaltitel: "Sammelfilm " + (i + 1),
    jahr: 1980 + i, typ: "film", quelle: "dvd", kategorie: "zu_pruefen", genre: ["drama"], tags: [],
    bewertung: { wie: 3, was: 3, warum: 3 }, reihe: ["Sammelsaga " + (i + 1)] }));

const P = (text, master = MASTER, zusatz = []) => F.parseAnfrage(text, master, zusatz);

/* =========================================================================
   TEIL A — IST-VERHALTEN
   ========================================================================= */
console.log("\n--- TEIL A: Ist-Verhalten gepinnt ---");

/* --- A1 Signal-Objekt und Signalerkennung je Art --------------------------- */
/* Der Schlüsselvergleich ist absichtlich exakt: er MELDET jede Erweiterung des
   Signalobjekts, statt sie durchzulassen. Die acht Etappe-6-Felder sind hier
   nachgetragen (vorher hat der Check die Erweiterung korrekt angezeigt). */
checkA("parseAnfrage liefert das vollständige Signal-Gerüst mit den bekannten Feldern", () => {
  const s = P("");
  return gleichMenge(Object.keys(s), ["genres", "achsen", "kategorien", "dekaden", "quellen", "zeit",
    "stimmungen", "reihen", "jahrMin", "jahrMax", "entdecken", "frage", "titel", "nichtZugeordnet",
    "genresAusschluss", "dekadenAusschluss", "kategorienAusschluss", "stimmungenAbschlag",
    "achsenAbschlag", "jahrExplizitMin", "jahrExplizitMax", "jahrUnterdrueckt", "negiertIgnoriert"]);
});
checkA("parseAnfrage trägt den Originaltext unverändert in sig.frage", () => P("Was läuft HEUTE?").frage === "Was läuft HEUTE?");
checkA("Genres kommen dynamisch aus der Masterliste (normalisiert)", () => gleich(P("Horror").genres, ["horror"]));
checkA("Genres aus zusatzGenres (film.at-Kino-Genres) werden erkannt", () =>
  gleich(P("Western", MASTER, ["Western"]).genres, ["western"]));
checkA("Genre-Synonyme mappen auf das Zielgenre: krimi -> crime", () => gleich(P("krimi").genres, ["crime"]));
/* Das Synonymziel ist "sci-fi" — die echte Schreibweise der Masterliste;
   norm() macht daraus "sci fi". Der Check prüft nicht nur das Mapping, sondern
   dass die getippten Wörter die Filme WIRKLICH finden: das Mapping allein sagt
   nichts, solange nicht belegt ist, dass es eine echte Genre-Schreibweise
   trifft. Genau diese Lücke war der Befund aus Etappe 6. */
checkA("Genre-Synonyme: scifi / 'science fiction' mappen auf 'sci fi' und finden die Filme", () =>
  gleich(P("scifi").genres, ["sci fi"]) && gleich(P("science fiction").genres, ["sci fi"])
  && gleichMenge(ids(F.sucheFinder(P("scifi"), KTX)), ["sternenpfad_2019", "lange_funke_2021"]));
checkA("genreKey() zieht Trennzeichen und oe/ue/ae ein — 'lustig' findet die 'komödie'", () =>
  F.genreKey("komödie") === F.genreKey("komoedie") && F.genreKey("sci-fi") === F.genreKey("sci fi")
  && F.genreKey("film-noir") === F.genreKey("film noir")
  && gleichMenge(ids(F.sucheFinder(P("lustig"), KTX)), ["zwei_linke_pfoten_2015"]));
checkA("Achse 'wie' über Vokabular-Wort 'stylisch'", () => gleich(P("stylisch").achsen, ["wie"]));
checkA("Achse 'was' über 'tiefgang', Achse 'warum' über 'ikonisch'", () =>
  gleich(P("tiefgang").achsen, ["was"]) && gleich(P("ikonisch").achsen, ["warum"]));
/* Ein Wort kann weiterhin zwei Signale setzen — seit v3 nur andere: "klassiker"
   ist keine Kategorie mehr (die gibt es in den echten Daten nicht), sondern ein
   TAG, und damit eine Stimmung. Die Achse bleibt. */
checkA("Ein Wort kann zwei Signale setzen: 'klassiker' -> Achse warum + Stimmung klassiker", () => {
  const s = P("klassiker");
  return gleich(s.achsen, ["warum"]) && gleich(s.stimmungen, ["klassiker"]) && gleich(s.kategorien, []);
});
/* "kult" und "trash" waren Kategorien und sind in v3 TAGS — die Wörter müssen
   weiter erkannt werden, nur im richtigen Feld. Und sie müssen wirken: ein
   Signal, das keinen Film erreicht, ist so gut wie keins (die Lehre aus den
   Genre-Lücken). Beide Prüfungen deshalb zusammen. */
checkA("'kult' und 'trash' werden als Stimmung erkannt und erreichen ihre Filme über die Tags", () => {
  const k = P("kult"), t = P("trash");
  const kt = F.sucheFinder(k, KTX).find((x) => x.film.id === "nacht_der_glut_1984");   // tag: kult
  const tt = F.sucheFinder(t, KTX).find((x) => x.film.id === "billiger_schund_1988");  // tags: trash, camp
  return gleich(k.stimmungen, ["kult"]) && gleich(k.kategorien, [])
    && gleich(t.stimmungen, ["trash"]) && gleich(t.kategorien, [])
    && kt.rel === 2 && kt.gruende.includes("stimmung:kult")
    && tt.rel === 2 && tt.gruende.includes("stimmung:trash");
});
checkA("Quellen: kino / streaming (netflix) / dvd", () =>
  gleich(P("kino").quellen, ["kino"]) && gleich(P("netflix").quellen, ["streaming"]) && gleich(P("dvd").quellen, ["dvd"]));
checkA("Zeit: heute und morgen", () => gleich(P("heute").zeit, ["heute"]) && gleich(P("morgen").zeit, ["morgen"]));
checkA("Entdecken-Signal über 'neues'", () => P("was Neues").entdecken === true && P("Horror").entdecken === false);
checkA("Stimmungen werden erkannt und setzen ihre Jahresgrenzen: oldschool -> jahrMax 1989", () => {
  const s = P("oldschool");
  return gleich(s.stimmungen, ["oldschool"]) && s.jahrMax === 1989 && s.jahrMin === null;
});
checkA("Stimmung 'modern' setzt jahrMin 2010, 'klassisch' setzt jahrMax 1979", () =>
  P("modern").jahrMin === 2010 && P("klassisch").jahrMax === 1979);
checkA("Mehrere Stimmungen: die engere Grenze gewinnt (oldschool 1989 + klassisch 1979 -> 1979)", () =>
  P("oldschool klassisch").jahrMax === 1979);
checkA("Stimmung ohne Jahresgrenze lässt jahrMin/jahrMax leer", () => {
  const s = P("melancholisch");
  return gleich(s.stimmungen, ["melancholisch"]) && s.jahrMin === null && s.jahrMax === null;
});
checkA("Dekaden: '80er' -> 1980, '1990er' -> 1990, 'aus den 70ern' -> 1970", () =>
  gleich(P("80er").dekaden, [1980]) && gleich(P("1990er").dekaden, [1990]) && gleich(P("aus den 70ern").dekaden, [1970]));
checkA("Dekaden zweistellig: '20er' wird als 2020 gelesen (nicht 1920)", () => gleich(P("20er").dekaden, [2020]));
checkA("Reihe/Franchise/Regie aus dem Sidecar: markantes Wort genügt", () => {
  const a = P("Kosmoswacht"), b = P("Orla Vendt");
  return gleich(a.reihen, [{ typ: "franchise", name: "Kosmoswacht Saga" }])
    && gleich(b.reihen, [{ typ: "regie", name: "Orla Vendt" }]);
});
checkA("Direkter Titeltreffer wird als sig.titel mit id und label geführt", () =>
  gleich(P("Sternenpfad").titel, [{ id: "sternenpfad_2019", label: "Sternenpfad" }]));
checkA("Titeltreffer greift auch über den Originaltitel", () =>
  gleich(P("Quiet Harbour").titel, [{ id: "stiller_hafen_1972", label: "Stiller Hafen" }]));
checkA("nichtZugeordnet zeigt Vokabular-Lücken ('One Piece' steht nicht im Master)", () =>
  gleichMenge(P("One Piece").nichtZugeordnet, ["one", "piece"]));
checkA("nichtZugeordnet filtert Füllwörter heraus", () => gleich(P("zeig mir was").nichtZugeordnet, []));
checkA("Erkannte Wörter landen nicht in nichtZugeordnet", () => !P("Horror im Kino heute").nichtZugeordnet.includes("horror"));

/* --- A2 Kappungen --------------------------------------------------------- */
checkA("Kappung: mehr als 20 Reihen-Treffer sind unspezifisch -> sig.reihen wird geleert", () => {
  const viele = P("sammelsaga", MASTER_MANY);
  const zwanzig = P("sammelsaga", MASTER_MANY.slice(0, 20));
  return viele.reihen.length === 0 && zwanzig.reihen.length === 20;
});
checkA("Kappung: mehr als 12 Titel-Treffer sind zu generisch -> sig.titel wird geleert", () => {
  const viele = P("film", MASTER_MANY);
  const zwoelf = P("film", MASTER_MANY.slice(0, 12));
  return viele.titel.length === 0 && zwoelf.titel.length === 12;
});

/* --- A3 hatSignal-Gate ---------------------------------------------------- */
checkA("sucheFinder ohne jedes Signal liefert [] (kein Grundrauschen aus der Top-Score-Liste)", () =>
  gleich(F.sucheFinder(P("One Piece"), KTX), []));
checkA("sucheFinder mit reinem Füllwort-Text liefert [] ", () => gleich(F.sucheFinder(P("zeig mir was"), KTX), []));
checkA("Ein einziges Signal (Zeit) reicht als Gate-Öffner", () => F.sucheFinder(P("heute"), KTX).length > 0);

/* --- A4 Hart gegen weich -------------------------------------------------- */
checkA("HART: Quellen-Signal dvd schließt Nicht-DVD-Filme aus", () =>
  gleichMenge(ids(F.sucheFinder(P("dvd"), KTX)),
    ["nacht_der_glut_1984", "stiller_hafen_1972", "herz_aus_papier_2004", "billiger_schund_1988", "letzte_kurve_1979"]));
checkA("HART: Quellen-Signal streaming lässt nur bekannte Streaming-Titel durch", () =>
  gleichMenge(ids(F.sucheFinder(P("netflix"), KTX)), ["gebrochene_bahn_1994"]));
checkA("HART: Quellen-Signal kino lässt nur Filme mit Kino-Programm durch", () =>
  gleichMenge(ids(F.sucheFinder(P("kino"), KTX)), ["sternenpfad_2019", "zwei_linke_pfoten_2015"]));
checkA("HART: Zeit filtert NUR zusammen mit quellen:kino (heute + Kino -> nur der Film mit Termin heute)", () =>
  gleichMenge(ids(F.sucheFinder(P("heute im Kino"), KTX)), ["sternenpfad_2019"]));
checkA("WEICH: Zeit allein (ohne quellen:kino) schließt niemanden aus", () =>
  gleichMenge(ids(F.sucheFinder(P("heute"), KTX)), ALLE_IDS));
checkA("Zeit-Signal kürzt die ausgewiesenen Kino-Termine auf den gewünschten Tag", () => {
  const t = F.sucheFinder(P("heute im Kino"), KTX)[0];
  return gleich(t.herkunft.kino.zeitenAlle, [T_HEUTE, T_HEUTE_2]);
});
checkA("HART: jahrMax aus Stimmung (oldschool) schließt neuere Filme aus", () =>
  gleichMenge(ids(F.sucheFinder(P("oldschool"), KTX)),
    ["nacht_der_glut_1984", "stiller_hafen_1972", "billiger_schund_1988", "letzte_kurve_1979"]));
checkA("HART: jahrMin aus Stimmung (modern) schließt ältere Filme aus", () =>
  gleichMenge(ids(F.sucheFinder(P("modern"), KTX)),
    ["zwei_linke_pfoten_2015", "sternenpfad_2019", "lange_funke_2021"]));
checkA("HART: Filme ohne Jahr fallen bei jahrMin/jahrMax immer heraus", () => {
  const m = [...MASTER, { id: "ohne_jahr", titel: "Undatiertes Fragment", originaltitel: "", jahr: null,
    typ: "film", quelle: "dvd", kategorie: "zu_pruefen", genre: ["drama"], tags: [], bewertung: { wie: 3, was: 3, warum: 3 } }];
  const r = F.sucheFinder(P("oldschool", m), { ...KTX, master: m });
  return !ids(r).includes("ohne_jahr");
});
checkA("HART: Genre verlangt = Filter (nur Horrorfilme bei 'Horror')", () =>
  gleichMenge(ids(F.sucheFinder(P("Horror"), KTX)), ["nacht_der_glut_1984", "billiger_schund_1988"]));
checkA("Genre-Treffer gibt +2 und einen sichtbaren Grund", () => {
  const t = F.sucheFinder(P("Horror"), KTX).find((x) => x.film.id === "nacht_der_glut_1984");
  return t.rel === 2 && t.gruende.includes("genre:horror");
});
checkA("HART: Kategorie verlangt = Filter (+3 Bonus) — mit v3-Werten", () => {
  const a = F.sucheFinder(P("immer gut"), KTX);        // -> sicher_gut
  const b = F.sucheFinder(P("referenz"), KTX);         // -> referenz
  return gleichMenge(ids(a), ["zwei_linke_pfoten_2015"]) && a[0].gruende.includes("kategorie:sicher_gut")
    && a[0].rel === 3
    && gleichMenge(ids(b), ["herz_aus_papier_2004"]) && b[0].gruende.includes("kategorie:referenz");
});
checkA("HART: Reihe/Franchise verlangt = Filter (+3 Bonus)", () => {
  const r = F.sucheFinder(P("Kosmoswacht"), KTX);
  return gleichMenge(ids(r), ["sternenpfad_2019", "lange_funke_2021"])
    && r.every((t) => t.rel === 3 && t.gruende.includes("franchise:Kosmoswacht Saga"));
});
checkA("HART: Dekade verlangt = Filter (+1.5 Bonus)", () => {
  const r = F.sucheFinder(P("80er"), KTX);
  return gleichMenge(ids(r), ["nacht_der_glut_1984", "billiger_schund_1988"])
    && r.every((t) => t.rel === 1.5 && t.gruende.includes("jahrzehnt:1980er"));
});
checkA("WEICH: Stimmung boostet nur — niemand fällt heraus", () => {
  const r = F.sucheFinder(P("melancholisch"), KTX);
  const treff = r.find((t) => t.film.id === "stiller_hafen_1972");
  return gleichMenge(ids(r), ALLE_IDS) && treff.rel === 2 && treff.gruende.includes("stimmung:melancholisch");
});
checkA("WEICH: Stimmung greift über Genres UND Tags der Masterliste", () => {
  const r = F.sucheFinder(P("verstörend"), KTX);          // def: genres [horror], tags [verstoerend, boese]
  const ueberTag = r.find((t) => t.film.id === "nacht_der_glut_1984");     // tags: boese
  const ueberGenre = r.find((t) => t.film.id === "billiger_schund_1988");  // genre: Horror
  return ueberTag.rel === 2 && ueberGenre.rel === 2 && gleichMenge(ids(r), ALLE_IDS);
});
checkA("WEICH: Achse boostet nur die passende Schlagseite (+2.5), schließt aber nichts aus", () => {
  const r = F.sucheFinder(P("stylisch"), KTX);
  const mitWie = r.filter((t) => t.rel === 2.5).map((t) => t.film.id);
  return gleichMenge(ids(r), ALLE_IDS) && gleichMenge(mitWie, ["nacht_der_glut_1984", "sternenpfad_2019"])
    && r[0].gruende.includes("schlagseite:WIE");
});
checkA("Titeltreffer umgeht ALLE harten Filter und bekommt +100", () => {
  const r = F.sucheFinder(P("Sternenpfad aus den 80ern"), KTX);
  const t = r.find((x) => x.film.id === "sternenpfad_2019");
  return !!t && t.rel === 100 && t.gruende.includes("titel-treffer") && r[0].film.id === "sternenpfad_2019";
});
checkA("Titeltreffer umgeht auch den Quellen-Filter", () => {
  const r = F.sucheFinder(P("Stiller Hafen im Kino"), KTX);
  return ids(r).includes("stiller_hafen_1972");
});

/* --- A5 Sortierregel ------------------------------------------------------ */
checkA("Sortierung: rel (Query-Relevanz) vor wert (Dreieck-Score)", () => {
  const r = F.sucheFinder(P("verstörend"), KTX);
  const iBillig = ids(r).indexOf("billiger_schund_1988");   // wert 6, rel 2
  const iStern = ids(r).indexOf("sternenpfad_2019");         // wert 12.5, rel 0
  return relFallend(r) && iBillig < iStern;
});
checkA("Bei gleichem rel entscheidet der Dreieck-Score", () => {
  const r = F.sucheFinder(P("heute"), KTX);
  return r.every((t) => t.rel === 0) && fallend(r) && r[0].wert === Math.max(...MASTER.map(score));
});
checkA("wert = Dreieck-Score + Boni, rel = nur die Boni", () => {
  const t = F.sucheFinder(P("Horror"), KTX).find((x) => x.film.id === "billiger_schund_1988");
  return t.wert === Number((score(MASTER[7]) + 2).toFixed(1)) && t.rel === 2;
});
checkA("sucheFinder liefert höchstens 20 Treffer", () => {
  const m = MASTER_MANY;
  return F.sucheFinder(P("Drama", m), { ...KTX, master: m }).length === 20;
});

/* --- A6 Herkunft ---------------------------------------------------------- */
checkA("herkunft weist Kino, DVD und Streaming getrennt aus", () => {
  const r = F.sucheFinder(P("heute"), KTX);
  const stern = r.find((t) => t.film.id === "sternenpfad_2019");
  const bahn = r.find((t) => t.film.id === "gebrochene_bahn_1994");
  const glut = r.find((t) => t.film.id === "nacht_der_glut_1984");
  return gleich(stern.herkunft.kino.kinos, ["Gartenbaukino", "Votivkino"]) && stern.herkunft.dvd === false
    && gleich(bahn.herkunft.streaming.dienste, ["prime"]) && glut.herkunft.dvd === true
    && glut.herkunft.kino === null && glut.herkunft.streaming === null;
});
checkA("herkunft.kino.zeiten ist auf 3 gekürzt, zeitenAlle bleibt vollständig", () => {
  const t = F.sucheFinder(P("kino"), KTX).find((x) => x.film.id === "sternenpfad_2019");
  return t.herkunft.kino.zeiten.length === 3 && t.herkunft.kino.zeitenAlle.length === 4;
});
checkA("filmHerkunft liefert dieselbe Herkunft für einen einzelnen Film (ohne Zeitfilter)", () => {
  const h = F.filmHerkunft(MASTER[5], { kinoMatches: KINO_MATCHES, streamingBekannt: STREAMING_BEKANNT });
  return h.kino.zeiten.length === 3 && h.kino.zeitenAlle.length === 4 && h.kino.beschreibung === "Weltraum-Utopie"
    && h.kino.ot === "Starpath" && h.dvd === false && h.streaming === null;
});
checkA("filmHerkunft erkennt DVD-Besitz und Streaming-Verfügbarkeit", () => {
  const a = F.filmHerkunft(MASTER[0], { kinoMatches: KINO_MATCHES, streamingBekannt: STREAMING_BEKANNT });
  const b = F.filmHerkunft(MASTER[4], { kinoMatches: KINO_MATCHES, streamingBekannt: STREAMING_BEKANNT });
  return a.dvd === true && a.kino === null && b.streaming.dienste[0] === "prime" && b.dvd === false;
});

/* --- A7 sucheKino -------------------------------------------------------- */
checkA("sucheKino ist selbst-gated: ohne relevantes Signal und ohne Titel-Freitext leer", () =>
  gleich(F.sucheKino(P("dvd"), KINO_REST), []));
checkA("sucheKino ohne Katalog liefert []", () => gleich(F.sucheKino(P("Horror"), []), []));
checkA("sucheKino: Genre verlangt = Filter über die Programm-Genres", () => {
  const r = F.sucheKino(P("Horror"), KINO_REST);
  return gleichMenge(r.map((x) => x.pf.t), ["Grelle Fratze", "Horror am Freitag"])
    && r.every((x) => x.gruende.includes("genre:horror"));
});
checkA("sucheKino: Dekade verlangt = Filter", () => {
  const r = F.sucheKino(P("80er"), KINO_REST);
  return r.length === 1 && r[0].pf.t === "Grelle Fratze" && r[0].gruende.includes("jahrzehnt:1980er");
});
checkA("sucheKino: nurTitel-Modus — reine Titelsuche zeigt ausschließlich Titeltreffer", () => {
  const r = F.sucheKino(P("Fremder Sommer"), KINO_REST);
  return r.length === 1 && r[0].pf.t === "Fremder Sommer" && r[0].gruende.includes("titel");
});
checkA("sucheKino: quellen:kino hebt den nurTitel-Modus auf und zeigt das ganze Restprogramm", () =>
  gleich(F.sucheKino(P("was im Kino"), KINO_REST).map((r) => r.pf.t),
    ["Fremder Sommer", "Weites Feld", "Grelle Fratze", "Horror am Freitag"]));
checkA("sucheKino sortiert Titeltreffer nach oben — vor dem neueren Nicht-Titeltreffer", () => {
  const r = F.sucheKino(P("Horror"), KINO_REST);
  return r[0].pf.t === "Horror am Freitag" && r[0].gruende.includes("titel")
    && r[1].pf.t === "Grelle Fratze" && !r[1].gruende.includes("titel");
});
checkA("sucheKino sortiert ohne Titeltreffer nach Jahr (neu zuerst)", () =>
  gleich(F.sucheKino(P("was im Kino"), KINO_REST).map((r) => r.pf.j), [2026, 2024, 1985, 1973]));
checkA("sucheKino: ein Titeltreffer braucht ALLE Query-Wörter (>=3) im Titel", () =>
  gleich(F.sucheKino(P("Grelle Fratze im Kino"), KINO_REST).filter((r) => r.gruende.includes("titel")), []));
checkA("sucheKino liefert höchstens 15 Treffer", () => F.sucheKino(P("Drama"), KINO_REST_VIEL).length === 15);
checkA("sucheKino: jahrMin/jahrMax filtern das Restprogramm hart", () =>
  gleich(F.sucheKino(P("oldschool im Kino"), KINO_REST).map((r) => r.pf.t), ["Grelle Fratze", "Horror am Freitag"]));

/* --- A8 sucheEntdecken --------------------------------------------------- */
checkA("sucheEntdecken ohne Katalog liefert []", () => gleich(F.sucheEntdecken(P("Horror"), { titel: [] }), []));
checkA("sucheEntdecken ist selbst-gated: ohne Genre/Dekade/Jahr/Entdecken-Signal und ohne Freitext leer", () =>
  gleich(F.sucheEntdecken(P("dvd"), ENTDECKEN), []));
checkA("sucheEntdecken: Genre filtert den ungeprüften Katalog", () => {
  const r = F.sucheEntdecken(P("Horror"), ENTDECKEN);
  return r.length === 1 && r[0].titel === "Blutrote Kammer";
});
checkA("sucheEntdecken: explizites Entdecken-Signal öffnet den ganzen Katalog", () =>
  gleich(F.sucheEntdecken(P("was Neues"), ENTDECKEN).map((t) => t.titel),
    ["Blutrote Kammer", "Zorn im Nebel", "Leises Vorspiel"]));
checkA("sucheEntdecken sortiert nach relevanz (absteigend)", () => {
  const r = F.sucheEntdecken(P("was Neues"), ENTDECKEN_VIEL);
  return r.every((t, i) => i === 0 || r[i - 1].relevanz >= t.relevanz);
});
checkA("sucheEntdecken liefert höchstens 12 Treffer", () => F.sucheEntdecken(P("was Neues"), ENTDECKEN_VIEL).length === 12);
checkA("sucheEntdecken: Titel-Freitext filtert, wenn kein Genre/Dekade/Jahr vorliegt", () => {
  const r = F.sucheEntdecken(P("Leises Vorspiel"), ENTDECKEN);
  return r.length === 1 && r[0].titel === "Leises Vorspiel";
});
checkA("sucheEntdecken: Jahresgrenze aus Stimmung filtert hart", () =>
  gleich(F.sucheEntdecken(P("klassisch"), ENTDECKEN).map((t) => t.titel), ["Leises Vorspiel"]));

/* --- A9 ohneStimmung (Ist-Verhalten) ------------------------------------- */
checkA("ohneStimmung entfernt die Stimmung und leitet die Jahresgrenzen neu ab", () => {
  const s = F.ohneStimmung(P("oldschool klassisch"), "klassisch");
  return gleich(s.stimmungen, ["oldschool"]) && s.jahrMax === 1989;
});
checkA("ohneStimmung lässt alle übrigen Signale unverändert", () => {
  const sig = P("oldschool Horror im Kino");
  const s = F.ohneStimmung(sig, "oldschool");
  return gleich(s.genres, sig.genres) && gleich(s.quellen, sig.quellen) && s.jahrMax === null && gleich(s.stimmungen, []);
});

/* --- A10 eigenes Vokabular ---------------------------------------------- */
checkA("alleStimmungen enthält die eingebauten Stimmungen", () => {
  const a = F.alleStimmungen();
  return !!a.oldschool && !!a.melancholisch && a.oldschool.jahr_max === 1989;
});
checkA("setzeEigeneStimmungen ergänzt eigene Wörter und überschreibt bei Namensgleichheit", () => {
  F.setzeEigeneStimmungen({ kuschelig: { genres: ["Komoedie"], tags: ["feelgood"] }, oldschool: { jahr_max: 1969 } });
  const a = F.alleStimmungen();
  const s = P("kuschelig");
  const alt = P("oldschool");
  const ok = !!a.kuschelig && a.oldschool.jahr_max === 1969 && gleich(s.stimmungen, ["kuschelig"]) && alt.jahrMax === 1969;
  F.setzeEigeneStimmungen({});   // Modul-Singleton zurücksetzen
  return ok;
});
checkA("setzeEigeneStimmungen({}) stellt den Ausgangszustand wieder her", () =>
  F.alleStimmungen().kuschelig === undefined && F.alleStimmungen().oldschool.jahr_max === 1989);
checkA("Eigene Stimmung wirkt als weicher Boost in sucheFinder", () => {
  F.setzeEigeneStimmungen({ kuschelig: { genres: ["Komoedie"], tags: ["feelgood"] } });
  const r = F.sucheFinder(P("kuschelig"), KTX);
  const ok = gleichMenge(ids(r), ALLE_IDS) && r[0].film.id === "zwei_linke_pfoten_2015" && r[0].rel === 2;
  F.setzeEigeneStimmungen({});
  return ok;
});

/* =========================================================================
   TEIL B — SOLL-VERHALTEN (nur aus der Spezifikation; heute rot)
   ========================================================================= */
console.log("\n--- TEIL B: Soll-Verhalten (rot bis zur Umsetzung) ---");

/* --- B1 Neue Felder am Signal-Objekt ------------------------------------ */
checkB("B1: sig hat die neuen Felder genresAusschluss und dekadenAusschluss als Arrays", () => {
  const s = P("Horror");
  return Array.isArray(s.genresAusschluss) && Array.isArray(s.dekadenAusschluss);
});
checkB("B1: sig hat jahrExplizitMin/jahrExplizitMax (null, wenn nichts genannt)", () => {
  const s = P("Horror");
  return "jahrExplizitMin" in s && "jahrExplizitMax" in s && s.jahrExplizitMin === null && s.jahrExplizitMax === null;
});
checkB("B1: Vorrang je Seite — 'oldschool ab 1975' -> jahrMin 1975 (explizit), jahrMax 1989 (aus Stimmung)", () => {
  const s = P("oldschool ab 1975");
  return s.jahrExplizitMin === 1975 && s.jahrExplizitMax === null && s.jahrMin === 1975 && s.jahrMax === 1989;
});
checkB("B1: Vorrang je Seite — 'modern bis 2015' -> jahrMin 2010 (Stimmung), jahrMax 2015 (explizit)", () => {
  const s = P("modern bis 2015");
  return s.jahrExplizitMax === 2015 && s.jahrExplizitMin === null && s.jahrMin === 2010 && s.jahrMax === 2015;
});
checkB("B1: explizite Grenze schlägt die Stimmungsgrenze auch dann, wenn sie weiter ist", () => {
  const s = P("oldschool bis 1995");
  return s.jahrExplizitMax === 1995 && s.jahrMax === 1995;
});
checkB("B1: wirksame Grenzen bleiben in jahrMin/jahrMax — die Sucher lesen unverändert dieses Feld", () =>
  gleichMenge(ids(F.sucheFinder(P("von 1970 bis 1985"), KTX)),
    ["nacht_der_glut_1984", "stiller_hafen_1972", "letzte_kurve_1979"]));

/* --- B2 Negationserkennung ---------------------------------------------- */
checkB("B2: 'kein Horror' -> genresAusschluss ['horror'], genres []", () => {
  const s = P("kein Horror");
  return gleich(feld(s.genresAusschluss), ["horror"]) && gleich(s.genres, []);
});
checkB("B2: 'kein Liebesfilm' -> genresAusschluss ['romance'] (über das Synonym)", () => {
  const s = P("kein Liebesfilm");
  return gleich(feld(s.genresAusschluss), ["romance"]) && gleich(s.genres, []);
});
checkB("B2: 'nicht lustig' -> genresAusschluss ['komoedie']", () => {
  const s = P("nicht lustig");
  return gleich(feld(s.genresAusschluss), ["komoedie"]) && gleich(s.genres, []);
});
checkB("B2: 'ohne Trash' -> Kategorie trash steht NICHT positiv in sig.kategorien", () =>
  !P("ohne Trash").kategorien.includes("trash"));
checkB("B2: 'nicht aus den 2000ern' -> dekadenAusschluss [2000], dekaden []", () => {
  const s = P("nicht aus den 2000ern");
  return gleich(feld(s.dekadenAusschluss), [2000]) && gleich(s.dekaden, []);
});
checkB("B2: alle Negationsmarker wirken (kein/keine/keinen/keinem/nicht/nix/ohne/ausser/niemals)", () => {
  const marker = ["kein", "keine", "keinen", "keinem", "nicht", "nix", "ohne", "ausser", "niemals"];
  return marker.every((m) => gleich(feld(P(m + " Horror").genresAusschluss), ["horror"]));
});
checkB("B2: Fenster = bis zu drei folgende Tokens ('ohne viel echten Horror' negiert noch)", () => {
  const s = P("ohne viel echten Horror");
  return gleich(feld(s.genresAusschluss), ["horror"]) && gleich(s.genres, []);
});
checkB("B2: Fenster endet nach drei Tokens ('ohne wirklich viel echten Horror' negiert nicht mehr)", () => {
  const s = P("ohne wirklich viel echten Horror");
  return gleich(s.genres, ["horror"]) && gleich(feld(s.genresAusschluss), []);
});
checkB("B2: Grenzwort beendet das Fenster früher ('kein Horror aber lustig')", () => {
  const s = P("kein Horror aber lustig");
  return gleich(feld(s.genresAusschluss), ["horror"]) && gleich(s.genres, ["komoedie"]);
});
checkB("B2: alle Grenzwörter beenden das Fenster (aber/und/oder/sondern/jedoch/trotzdem/dafuer)", () => {
  const grenzen = ["aber", "und", "oder", "sondern", "jedoch", "trotzdem", "dafuer"];
  return grenzen.every((g) => {
    const s = P("kein Drama " + g + " Horror");
    return gleich(feld(s.genresAusschluss), ["drama"]) && gleich(s.genres, ["horror"]);
  });
});
checkB("B2: Echtfall 'Irgendwas nettes, nicht so spannend, kein powpow, aber nett' negiert spannend/Action", () => {
  const s = P("Irgendwas nettes, nicht so spannend, kein powpow, aber nett");
  return !s.stimmungen.includes("spannend") && !s.genres.includes("action");
});
/* Die positive Seite hinter dem Grenzwort wird an "gemütlich" belegt, nicht an
   "nett": "nett" kommt bewusst NICHT ins Vokabular (Entscheidung — "gemütlich"
   deckt es ab, Umgangsformulierungen soll der KI-Pfad abbilden). Ein Testfall,
   der an "nett" hängt, würde eine Vokabelforderung behaupten, die es nicht gibt. */
checkB("B2: Grenzwort trennt Negation und Wunsch ('kein powpow, aber gemütlich')", () => {
  const s = P("kein powpow, aber gemütlich");
  return gleich(feld(s.genresAusschluss), ["action"]) && gleich(s.genres, [])
    && gleich(s.stimmungen, ["gemutlich"]) && gleich(feld(s.stimmungenAbschlag), []);
});
checkB("B2: Echtfall 'melancholisch, aber kein Liebesfilm' — Stimmung positiv, Genre ausgeschlossen", () => {
  const s = P("melancholisch, aber kein Liebesfilm");
  return gleich(s.stimmungen, ["melancholisch"]) && gleich(feld(s.genresAusschluss), ["romance"]) && gleich(s.genres, []);
});
checkB("B2: Gegenprobe — 'Horror' ohne Marker bleibt positiv", () => {
  const s = P("Horror");
  return gleich(s.genres, ["horror"]) && gleich(feld(s.genresAusschluss), []);
});
checkB("B2: Gegenprobe — 'kein' allein erzeugt keinen Ausschluss", () => {
  const s = P("kein");
  return gleich(feld(s.genresAusschluss), []) && gleich(feld(s.dekadenAusschluss), []);
});
checkB("B2: Marker und negierte Wörter erscheinen nicht in nichtZugeordnet", () => {
  const a = P("kein Horror"), b = P("nicht lustig"), c = P("ohne Trash"), d = P("nicht aus den 2000ern");
  return !a.nichtZugeordnet.includes("kein") && !b.nichtZugeordnet.includes("nicht")
    && !c.nichtZugeordnet.includes("ohne") && !d.nichtZugeordnet.includes("nicht");
});

/* --- B3 Jahresbereiche -------------------------------------------------- */
checkB("B3: 'von 1970 bis 1985' -> jahrExplizitMin 1970, jahrExplizitMax 1985", () => {
  const s = P("von 1970 bis 1985");
  return s.jahrExplizitMin === 1970 && s.jahrExplizitMax === 1985 && s.jahrMin === 1970 && s.jahrMax === 1985;
});
checkB("B3: 'zwischen 1970 und 1985' -> 1970/1985", () => {
  const s = P("zwischen 1970 und 1985");
  return s.jahrExplizitMin === 1970 && s.jahrExplizitMax === 1985;
});
checkB("B3: '1970 bis 1985' -> 1970/1985", () => {
  const s = P("1970 bis 1985");
  return s.jahrExplizitMin === 1970 && s.jahrExplizitMax === 1985;
});
checkB("B3: 'ab 1990' / 'seit 1990' / 'nach 1990' -> jahrExplizitMin 1990", () =>
  ["ab 1990", "seit 1990", "nach 1990"].every((q) => {
    const s = P(q);
    return s.jahrExplizitMin === 1990 && s.jahrExplizitMax === null && s.jahrMin === 1990;
  }));
checkB("B3: 'bis 1990' / 'vor 1990' -> jahrExplizitMax 1990", () =>
  ["bis 1990", "vor 1990"].every((q) => {
    const s = P(q);
    return s.jahrExplizitMax === 1990 && s.jahrExplizitMin === null && s.jahrMax === 1990;
  }));
checkB("B3: nur vierstellige Jahre 1900-2099 gelten ('ab 1899' und 'ab 2100' sind keine Grenze)", () =>
  P("ab 1899").jahrExplizitMin === null && P("ab 2100").jahrExplizitMin === null
  && P("ab 1900").jahrExplizitMin === 1900 && P("ab 2099").jahrExplizitMin === 2099);
checkB("B3: '80er' bleibt Dekade und wird NICHT zum Jahresbereich", () => {
  const s = P("80er");
  return gleich(s.dekaden, [1980]) && s.jahrExplizitMin === null && s.jahrExplizitMax === null;
});
checkB("B3: Bereichswörter und Jahreszahlen erscheinen nicht in nichtZugeordnet", () =>
  ["von 1970 bis 1985", "zwischen 1970 und 1985", "ab 1990", "seit 1990", "nach 1990", "bis 1990", "vor 1990"]
    .every((q) => P(q).nichtZugeordnet.every((w) => !/^\d{4}$/.test(w)
      && !["von", "bis", "zwischen", "seit", "nach", "vor"].includes(w))));

/* --- B4 Ausschlüsse wirken in der Suche --------------------------------- */
checkB("B4/E11: 'kein Horror' allein liefert die Masterliste OHNE Horrorfilme (nicht [])", () => {
  const r = F.sucheFinder(P("kein Horror"), KTX);
  return gleichMenge(ids(r), OHNE("nacht_der_glut_1984", "billiger_schund_1988")) && fallend(r);
});
checkB("B4: dekadenAusschluss wirft die betroffene Dekade aus sucheFinder", () =>
  gleichMenge(ids(F.sucheFinder(P("nicht aus den 2000ern"), KTX)), OHNE("herz_aus_papier_2004")));
/* Semantikwechsel mit v3: "trash" ist keine Kategorie mehr, sondern ein Tag —
   also eine Stimmung, und Stimmungen sind ausnahmslos weich. "ohne Trash"
   schließt deshalb nicht mehr hart aus, sondern wertet ab: die Trash-Filme
   rutschen ans Ende, verschwinden aber nicht. Geprüft wird die RANGFOLGE, nicht
   nur die Liste — sonst bliebe offen, ob der Abschlag überhaupt wirkt. */
checkB("B4: 'ohne Trash' schließt nicht aus, sondern wertet ab (Trash landet hinten)", () => {
  const s = P("ohne Trash");
  const r = F.sucheFinder(s, KTX);
  const t = r[r.length - 1];
  return gleich(feld(s.stimmungenAbschlag), ["trash"]) && gleich(s.kategorien, [])
    && gleich(feld(s.kategorienAusschluss), [])
    && gleichMenge(ids(r), ALLE_IDS)                       // niemand fällt raus
    && t.film.id === "billiger_schund_1988" && t.rel === -2
    && t.gruende.includes("nicht-stimmung:trash") && relFallend(r);
});
checkB("B4: ein direkter Titeltreffer umgeht auch den Genre-Ausschluss", () => {
  const r = F.sucheFinder(P("Nacht der Glut, aber kein Horror"), KTX);
  return ids(r).includes("nacht_der_glut_1984") && !ids(r).includes("billiger_schund_1988");
});
checkB("B4: Ausschluss und positives Signal wirken zusammen ('duster, kein Horror')", () => {
  const r = F.sucheFinder(P("duster, kein Horror"), KTX);
  return !ids(r).includes("nacht_der_glut_1984") && !ids(r).includes("billiger_schund_1988")
    && ids(r).includes("gebrochene_bahn_1994");
});
checkB("B4: sucheKino behält sein Selbst-Gate — ein reiner Ausschluss erzeugt kein Grundrauschen", () =>
  gleich(F.sucheKino(P("kein Horror"), KINO_REST), [])
  && gleich(F.sucheKino(P("nicht aus den 2000ern"), KINO_REST), []));
checkB("B4: sucheEntdecken behält sein Selbst-Gate — ein reiner Ausschluss bleibt leer", () =>
  gleich(F.sucheEntdecken(P("kein Horror"), ENTDECKEN), [])
  && gleich(F.sucheEntdecken(P("nicht aus den 2000ern"), ENTDECKEN), []));
checkB("B4: sucheKino wendet den Genre-Ausschluss an, wenn es ohnehin liefert", () => {
  const r = F.sucheKino(P("was im Kino, kein Horror"), KINO_REST);
  return r.length > 0 && !r.some((x) => x.pf.g.map(norm).includes("horror"));
});
checkB("B4: sucheEntdecken wendet den Genre-Ausschluss an, wenn es ohnehin liefert", () => {
  const r = F.sucheEntdecken(P("was Neues, kein Horror"), ENTDECKEN);
  return r.length > 0 && !r.some((t) => t.titel === "Blutrote Kammer");
});

/* --- B5 ohneStimmung darf ausdrückliche Grenzen nicht löschen ----------- */
checkB("B5: 'oldschool von 1975 bis 1985' -> nach ohneStimmung('oldschool') stehen 1975/1985 weiter", () => {
  const sig = P("oldschool von 1975 bis 1985");
  const s = F.ohneStimmung(sig, "oldschool");
  return gleich(s.stimmungen, []) && s.jahrMin === 1975 && s.jahrMax === 1985
    && s.jahrExplizitMin === 1975 && s.jahrExplizitMax === 1985;
});
checkB("B5: nur die aus Stimmungen abgeleitete Grenze wird neu berechnet", () => {
  const sig = P("oldschool modern ab 1975");   // jahrMin explizit 1975, jahrMax 1989 aus oldschool
  const s = F.ohneStimmung(sig, "oldschool");
  return s.jahrMin === 1975 && s.jahrMax === null;
});
checkB("B5: die erhaltene Grenze wirkt auch in der Suche weiter", () => {
  const s = F.ohneStimmung(P("oldschool von 1975 bis 1985"), "oldschool");
  return gleichMenge(ids(F.sucheFinder(s, KTX)), ["nacht_der_glut_1984", "letzte_kurve_1979"]);
});

/* --- B6 Robustheit gegen fremd gebaute Signalobjekte -------------------- */
const MINIMAL = () => ({ genres: ["horror"], achsen: [], kategorien: [], dekaden: [], quellen: [], zeit: [],
  stimmungen: [], reihen: [], jahrMin: null, jahrMax: null, entdecken: false, frage: "" });
checkB("B6: sucheFinder verkraftet ein sig ohne die neuen Felder", () =>
  gleichMenge(ids(F.sucheFinder(MINIMAL(), KTX)), ["nacht_der_glut_1984", "billiger_schund_1988"]));
checkB("B6: sucheKino verkraftet ein sig ohne die neuen Felder", () => {
  const r = F.sucheKino(MINIMAL(), KINO_REST);
  return Array.isArray(r) && gleich(r.map((x) => x.pf.t), ["Grelle Fratze", "Horror am Freitag"]);
});
checkB("B6: sucheEntdecken verkraftet ein sig ohne die neuen Felder", () => {
  const r = F.sucheEntdecken(MINIMAL(), ENTDECKEN);
  return Array.isArray(r) && r.length === 1 && r[0].titel === "Blutrote Kammer";
});
checkB("B6: ohneStimmung verkraftet ein sig ohne die neuen Felder", () => {
  const s = F.ohneStimmung(MINIMAL(), "oldschool");
  return gleich(s.stimmungen, []) && s.jahrMin === null && s.jahrMax === null;
});
checkB("B6: ein sig ganz ohne Ausschluss-Felder verhält sich wie eines mit leeren Ausschlusslisten", () => {
  const a = F.sucheFinder(MINIMAL(), KTX);
  const b = F.sucheFinder({ ...MINIMAL(), genresAusschluss: [], dekadenAusschluss: [],
    jahrExplizitMin: null, jahrExplizitMax: null }, KTX);
  return gleich(ids(a), ids(b));
});

/* =========================================================================
   TEIL B — NACHTRÄGE aus den Entscheidungen zu meinen Rückfragen
   -------------------------------------------------------------------------
   Geschrieben aus den Entscheidungen der Bau-Session (E11/E15/E16 und die
   Antworten 2/4/5/6/7/8/10/11), nicht aus dem Code. Sie halten fest, was
   ausdrücklich entschieden wurde — damit keine dieser Festlegungen später
   still zurückgedreht wird.
   ========================================================================= */
console.log("\n--- TEIL B: Nachträge aus den Entscheidungen ---");

/* E16 — verneinte Stimmung/Achse = Abschlag, kein Ausschluss */
checkB("E16: verneinte Stimmung landet in stimmungenAbschlag, nicht in einer Ausschlussliste", () => {
  const s = P("nicht traurig");
  return gleich(feld(s.stimmungenAbschlag), ["traurig"]) && gleich(s.stimmungen, []);
});
checkB("E16: Abschlag ist -2 mit Grund 'nicht-stimmung:<name>' — der Film bleibt drin", () => {
  const r = F.sucheFinder(P("nicht traurig"), KTX);
  const t = r.find((x) => x.film.id === "stiller_hafen_1972");   // genre Drama = Stimmungs-Genre
  return gleichMenge(ids(r), ALLE_IDS) && t.rel === -2 && t.gruende.includes("nicht-stimmung:traurig");
});
checkB("E16: verneinte Achse gibt -2.5 mit Grund 'nicht-schlagseite:<ACHSE>'", () => {
  const s = P("nicht stylisch");
  const r = F.sucheFinder(s, KTX);
  const t = r.find((x) => x.film.id === "sternenpfad_2019");     // Schlagseite wie
  return gleich(feld(s.achsenAbschlag), ["wie"]) && gleich(s.achsen, [])
    && t.rel === -2.5 && t.gruende.includes("nicht-schlagseite:WIE");
});
checkB("E16: abgewertete Filme rutschen nach unten, statt zu verschwinden", () => {
  const r = F.sucheFinder(P("nicht traurig"), KTX);
  return relFallend(r) && r[r.length - 1].rel === -2;
});
checkB("Antwort 2: die Jahresgrenze einer verneinten Stimmung gilt NICHT (keine geratene Umkehrung)", () => {
  const s = P("nicht oldschool");
  return gleich(feld(s.stimmungenAbschlag), ["oldschool"]) && s.jahrMax === null && s.jahrMin === null;
});
checkB("Positiv genannt schlägt verneint genannt ('Horror, aber kein Horror' bleibt positiv)", () => {
  const s = P("Horror und Drama, aber kein Horror");
  return s.genres.includes("horror") && !feld(s.genresAusschluss).includes("horror");
});

/* E15 — der Lern-Kreislauf darf nicht blind werden */
checkB("E15/Antwort 4: unerkannte Wörter IM Negationsfenster bleiben in nichtZugeordnet sichtbar", () => {
  const s = P("kein Gedöns");
  return s.nichtZugeordnet.includes("gedons") && !s.nichtZugeordnet.includes("kein");
});
checkB("Antwort 5: Grenzwörter gelten als zugeordnet und erscheinen nicht als Vokabellücke", () =>
  !P("melancholisch, aber kein Liebesfilm").nichtZugeordnet.includes("aber"));

/* Antwort 6/7 — Gate und Titeltreffer-Ausnahme */
/* "kein alter Film" trifft die Vokabelphrase "alter film" -> Kategorie referenz.
   ACHTUNG: "ohne alte Filme" greift NICHT — die Phrase wird als Zeichenkette
   gesucht, die Flexion "alte Filme" trifft "alter film" nicht. */
checkB("Antwort 6: reiner Kategorie-Ausschluss öffnet das hatSignal-Gate", () => {
  const s = P("kein alter Film");
  return gleich(feld(s.kategorienAusschluss), ["referenz"]) && gleich(s.kategorien, [])
    && gleichMenge(ids(F.sucheFinder(s, KTX)), OHNE("herz_aus_papier_2004"));
});
checkB("Antwort 6: reiner Stimmungs-/Achsen-Abschlag öffnet das hatSignal-Gate", () =>
  F.sucheFinder(P("nicht traurig"), KTX).length === ALLE_IDS.length
  && F.sucheFinder(P("nicht stylisch"), KTX).length === ALLE_IDS.length);
checkB("Antwort 7: Titeltreffer umgeht auch den Kategorie-Ausschluss", () =>
  ids(F.sucheFinder(P("Billiger Schund, aber ohne Trash"), KTX)).includes("billiger_schund_1988"));

/* Antwort 8 — bewusste Asymmetrie: Ausschluss braucht positive Evidenz */
checkB("Antwort 8: Dekaden-Ausschluss BEHÄLT Filme ohne Jahr (Ausschluss braucht positive Evidenz)", () => {
  const m = [...MASTER, { id: "ohne_jahr", titel: "Undatiertes Fragment", originaltitel: "", jahr: null,
    typ: "film", quelle: "dvd", kategorie: "zu_pruefen", genre: ["drama"], tags: [], bewertung: { wie: 3, was: 3, warum: 3 } }];
  const r = F.sucheFinder(P("nicht aus den 2000ern", m), { ...KTX, master: m });
  return ids(r).includes("ohne_jahr") && !ids(r).includes("herz_aus_papier_2004");
});
checkB("Antwort 8: jahrMin/jahrMax sieben Filme ohne Jahr weiter aus — die Asymmetrie ist gewollt", () => {
  const m = [...MASTER, { id: "ohne_jahr", titel: "Undatiertes Fragment", originaltitel: "", jahr: null,
    typ: "film", quelle: "dvd", kategorie: "zu_pruefen", genre: ["drama"], tags: [], bewertung: { wie: 3, was: 3, warum: 3 } }];
  return !ids(F.sucheFinder(P("ab 1990", m), { ...KTX, master: m })).includes("ohne_jahr");
});

/* Antwort 10 — Widersprüchliches wird übernommen, nicht still korrigiert */
checkB("Antwort 10: 'ab 1990 bis 1980' wird übernommen wie genannt (Ergebnis leer, keine stille Korrektur)", () => {
  const s = P("ab 1990 bis 1980");
  return s.jahrExplizitMin === 1990 && s.jahrExplizitMax === 1980
    && s.jahrMin === 1990 && s.jahrMax === 1980 && gleich(F.sucheFinder(s, KTX), []);
});
checkB("Antwort 10: bei Mehrfachnennung derselben Seite gewinnt die engste Grenze", () => {
  const a = P("ab 1990 seit 1995"), b = P("bis 1990 vor 1985");
  return a.jahrExplizitMin === 1995 && b.jahrExplizitMax === 1985;
});
/* Antwort 10 geschärft (Revision der Bau-Session, ausgelöst durch den
   empirischen Fixture-Fall gs-04 "Sci-Fi, aber nichts nach 1985"):
   Die Pauschale "verneinte Jahresangaben bleiben ungedeutet" war für den
   BEREICH richtig und für die OFFENE Grenze falsch. Die Trennung ist der Kern
   der Regel und wird deshalb in beiden Zweigen belegt:
     offene Grenze -> eindeutig umkehrbar, also gedeutet
     Bereich       -> sagt nicht, was stattdessen gelten soll, also ungedeutet */
checkB("Antwort 10a: verneinte OFFENE Grenze kehrt sich um (alle vier Richtungen)", () => {
  const f = (q) => { const s = P(q); return [s.jahrMin, s.jahrMax]; };
  return gleich(f("nichts nach 1985"), [null, 1985]) && gleich(f("nichts vor 1990"), [1990, null])
    && gleich(f("nicht ab 1990"), [null, 1990]) && gleich(f("nicht bis 1990"), [1990, null]);
});
checkB("Antwort 10a: die umgekehrte Grenze bleibt eingeschlossen (kein Off-by-one)", () => {
  const oben = ids(F.sucheFinder(P("nichts nach 1984"), KTX));
  const unten = ids(F.sucheFinder(P("nichts vor 1984"), KTX));
  return oben.includes("nacht_der_glut_1984") && !oben.includes("gebrochene_bahn_1994")
    && unten.includes("nacht_der_glut_1984") && !unten.includes("letzte_kurve_1979");
});
checkB("Antwort 10a: die umgekehrte Grenze landet in jahrExplizit* (nicht nur in jahrMin/jahrMax)", () => {
  const s = P("nichts nach 1985");
  return s.jahrExplizitMax === 1985 && s.jahrExplizitMin === null
    && !s.nichtZugeordnet.includes("1985") && !s.nichtZugeordnet.includes("nichts");
});
checkB("Antwort 10b: verneinter BEREICH bleibt ungedeutet, die Jahre erscheinen als Lücke", () => {
  for (const q of ["nicht von 1970 bis 1985", "nicht zwischen 1970 und 1985"]) {
    const s = P(q);
    if (s.jahrMin !== null || s.jahrMax !== null) return false;
    if (s.jahrExplizitMin !== null || s.jahrExplizitMax !== null) return false;
    if (!s.nichtZugeordnet.includes("1970") || !s.nichtZugeordnet.includes("1985")) return false;
  }
  return true;
});

/* Antwort 11 — eine gemeinsame Quelle für die Vorrangregel */
checkB("Antwort 11: jahrGrenzen(sig) ist exportiert und wendet die Vorrangregel je Seite an", () => {
  if (typeof F.jahrGrenzen !== "function") return false;
  const a = F.jahrGrenzen({ stimmungen: ["oldschool"], jahrExplizitMin: 1975, jahrExplizitMax: null });
  const b = F.jahrGrenzen({ stimmungen: [], jahrExplizitMin: null, jahrExplizitMax: null });
  return a.jahrMin === 1975 && a.jahrMax === 1989 && b.jahrMin === null && b.jahrMax === null;
});
checkB("Vokabular: 'powpow' ist als Action-Synonym ergänzt", () => gleich(P("powpow").genres, ["action"]));

/* Nachtrag: genreKey() gilt auch für Stimmungs-TAGS (fTagKeys) — dieselbe
   Fehlerklasse wie bei den Genres, eine Ebene tiefer. Der Vokabel-Tag ist
   transliteriert ("duester"), die Masterliste schreibt mit Umlaut ("düster").
   Der Film hier ist ein Drama, trifft also KEINES der Genres von "duster" —
   der Boost kann nur über den Tag kommen. */
checkB("Nachtrag: Stimmungs-Tags werden über genreKey() verglichen — 'duester' trifft 'düster'", () => {
  const m = [{ id: "umlaut_tag", titel: "Schattenspiel im Regen", originaltitel: "", jahr: 1990, typ: "film",
    quelle: "dvd", kategorie: "zu_pruefen", genre: ["drama"], tags: ["düster"], bewertung: { wie: 3, was: 3, warum: 3 } }];
  const t = F.sucheFinder(P("duster", m), { ...KTX, master: m })[0];
  return !!t && t.gruende.includes("stimmung:duster") && t.rel === 2;
});

/* Nachtrag: Entdoppelung nach Vergleichsschlüssel. "komödie" trifft das
   Master-Genre UND das Synonymziel "komoedie" — beides derselbe Schlüssel.
   Ohne Entdoppelung zwei Chips im UI und ein doppelter Boost (+4 statt +2),
   der die Rangfolge verzerrt. */
checkB("Nachtrag: sig.genres wird nach Vergleichsschlüssel entdoppelt (ein Chip, ein Boost)", () => {
  const s = P("komödie");
  const t = F.sucheFinder(s, KTX).find((x) => x.film.id === "zwei_linke_pfoten_2015");
  return s.genres.length === 1 && t.rel === 2 && t.gruende.filter((g) => g.startsWith("genre:")).length === 1;
});
checkB("Nachtrag: auch sig.genresAusschluss wird nach Vergleichsschlüssel entdoppelt", () => {
  const s = P("keine komödie");
  return feld(s.genresAusschluss).length === 1 && gleich(s.genres, [])
    && !ids(F.sucheFinder(s, KTX)).includes("zwei_linke_pfoten_2015");
});

/* Nachtrag: verneinte Quelle/Zeit ergibt keinen Filter. Ein Film liegt oft in
   mehreren Quellen — "nicht im Kino" ist kein sinnvolles Ausschlusskriterium.
   Der alte Stand las die Verneinung als Zustimmung ("nicht im Kino" lieferte
   genau die Kinofilme); jetzt wird sie ehrlich als nicht filterbar vermerkt. */
checkB("Nachtrag: verneinte Quelle landet in negiertIgnoriert, nicht als Zustimmung in sig.quellen", () => {
  const s = P("nicht im Kino");
  return gleich(s.quellen, []) && feld(s.negiertIgnoriert).includes("kino")
    && !s.nichtZugeordnet.includes("kino");
});
checkB("Nachtrag: verneinte Zeitangabe landet ebenfalls in negiertIgnoriert", () => {
  const s = P("nicht heute");
  return gleich(s.zeit, []) && feld(s.negiertIgnoriert).includes("heute");
});
checkB("Nachtrag: positiv genannte Quelle schlägt die verneinte Nennung", () => {
  const s = P("im Kino, nicht im Kino");
  return gleich(s.quellen, ["kino"]) && gleich(feld(s.negiertIgnoriert), []);
});

/* E-2: eine aus einer Stimmung abgeleitete Jahresgrenze ist ein eigener,
   einzeln abwählbarer Chip. Ohne das Flag würde jahrGrenzen() die Grenze
   sofort wieder aus der Stimmung herleiten — das Abwählen wäre wirkungslos.
   Die Stimmung selbst bleibt dabei erhalten: abgewählt wird die Jahresfolge,
   nicht der Wunsch. */
checkB("E-2: jahrUnterdrueckt.max entfernt die Stimmungsgrenze, die Stimmung bleibt", () => {
  const s = { ...P("oldschool"), jahrUnterdrueckt: { min: false, max: true } };
  const g = F.jahrGrenzen(s);
  return g.jahrMax === null && g.jahrMin === null && gleich(s.stimmungen, ["oldschool"]);
});
checkB("E-2: die unterdrückte Grenze filtert auch in der Suche nicht mehr", () => {
  const roh = P("oldschool");
  const s = { ...roh, jahrUnterdrueckt: { min: false, max: true } };
  Object.assign(s, F.jahrGrenzen(s));
  return gleichMenge(ids(F.sucheFinder(s, KTX)), ALLE_IDS)     // ohne Flag nur die Filme bis 1989
    && gleichMenge(ids(F.sucheFinder(roh, KTX)),
      ["nacht_der_glut_1984", "stiller_hafen_1972", "billiger_schund_1988", "letzte_kurve_1979"]);
});
checkB("E-2: jahrUnterdrueckt.min wirkt getrennt von .max", () => {
  const s = { ...P("modern"), jahrUnterdrueckt: { min: true, max: false } };
  return F.jahrGrenzen(s).jahrMin === null;
});
checkB("E-2: eine AUSDRÜCKLICH genannte Grenze bleibt von der Unterdrückung unberührt", () => {
  const s = { ...P("oldschool von 1975 bis 1985"), jahrUnterdrueckt: { min: true, max: true } };
  const g = F.jahrGrenzen(s);
  return g.jahrMax === 1985 && g.jahrMin === 1975;   // entfernt wird sie durch Leeren von jahrExplizit*
});
checkB("E-2: ausdrückliche Grenze wird durch Leeren von jahrExplizit* entfernt, nicht durch das Flag", () => {
  const s = { ...P("oldschool von 1975 bis 1985"), jahrExplizitMin: null, jahrExplizitMax: null };
  return F.jahrGrenzen(s).jahrMax === 1989;          // die Stimmungsgrenze greift wieder
});
checkB("E-2: ein sig ohne jahrUnterdrueckt verhält sich wie eines mit beiden Flags false", () => {
  const ohne = F.jahrGrenzen({ stimmungen: ["oldschool"], jahrExplizitMin: null, jahrExplizitMax: null });
  const mit = F.jahrGrenzen({ stimmungen: ["oldschool"], jahrExplizitMin: null, jahrExplizitMax: null,
    jahrUnterdrueckt: { min: false, max: false } });
  return gleich(ohne, mit) && ohne.jahrMax === 1989;
});

/* =========================================================================
   EMPIRISCHE FIXTURE-FÄLLE (/tmp/fix.json, erhoben 26.07.2026)
   -------------------------------------------------------------------------
   Echte Formulierungen, verbatim gegen den alten Stand gemessen. Hier stehen
   NUR die ziel_1b-Werte als Soll — die ist_heute-Werte der Datei sind ein
   Schnappschuss des alten Standes und teilweise überholt (ihr
   nichtZugeordnet enthält noch Negationsmarker, die inzwischen als zugeordnet
   gelten). Genre-Schreibweisen sind von den alten falschen Formen der Datei
   ("romanze", "komoedie") auf die echten übersetzt.
   Beachte gs-02: die Entdoppelung behält die Schreibweise der MASTERLISTE,
   nicht die des Vokabulars — bei Master "komödie" steht in sig.genres die
   norm-Form "komodie", nicht das Synonymziel "komoedie".
   ========================================================================= */
console.log("\n--- TEIL B: empirische Fixture-Fälle (gs-*) ---");
const FIXTURE_FAELLE = [
  { id: "gs-02", eingabe: "Irgendeine Komödie, aber bitte kein Liebesfilm",
    soll: { genres: ["komodie"], genresAusschluss: ["romance"], dekaden: [], dekadenAusschluss: [],
      jahrMin: null, jahrMax: null },
    nichtIn: ["kein", "aber"] },
  { id: "gs-03", eingabe: "Ein Thriller aus den Jahren 1990 bis 1999",
    soll: { genres: ["thriller"], jahrMin: 1990, jahrMax: 1999, jahrExplizitMin: 1990,
      jahrExplizitMax: 1999, dekaden: [] },
    nichtIn: ["1990", "1999", "bis"] },
  { id: "gs-04", eingabe: "Sci-Fi, aber nichts nach 1985",
    soll: { genres: ["sci fi"], jahrMin: null, jahrMax: 1985, jahrExplizitMin: null,
      jahrExplizitMax: 1985, dekaden: [] },
    nichtIn: ["nichts", "nach", "1985"] },
  { id: "gs-05", eingabe: "Action, nur nicht aus den 80ern",
    soll: { genres: ["action"], dekaden: [], dekadenAusschluss: [1980], jahrMin: null, jahrMax: null },
    nichtIn: ["nicht"] },
  { id: "gs-13", eingabe: "Was Oldschool-mäßiges",
    soll: { genres: [], dekaden: [], stimmungen: ["oldschool"], stimmungenAbschlag: [],
      jahrMin: null, jahrMax: 1989 } },
  /* Nebenfalle laut Fixture: "nicht so alt" darf NICHT als Ausschluss von
     irgendetwas gelesen werden — der Marker steht vor Wörtern, für die es
     keine Vokabel gibt. Deshalb hier ALLE Gegenlisten auf leer geprüft. */
  { id: "gs-14", eingabe: "Was Modernes, nicht so alt",
    soll: { genres: [], dekaden: [], stimmungen: ["modern"], jahrMin: 2010, jahrMax: null,
      genresAusschluss: [], dekadenAusschluss: [], kategorienAusschluss: [],
      stimmungenAbschlag: [], achsenAbschlag: [] },
    nichtIn: ["nicht"] },
  { id: "gs-22", eingabe: "Ein Sci-Fi aus den 70ern",
    soll: { genres: ["sci fi"], dekaden: [1970], dekadenAusschluss: [], jahrMin: null,
      jahrMax: null, nichtZugeordnet: [] } },
];
for (const fall of FIXTURE_FAELLE) {
  checkB("Fixture " + fall.id + ': "' + fall.eingabe + '"', () => {
    const s = P(fall.eingabe);
    const fehler = [];
    for (const [k, erwartet] of Object.entries(fall.soll)) {
      if (!gleich(s[k], erwartet)) {
        fehler.push("      " + k + ": erwartet " + JSON.stringify(erwartet) + ", ist " + JSON.stringify(s[k]));
      }
    }
    for (const w of fall.nichtIn || []) {
      if (s.nichtZugeordnet.includes(w)) fehler.push('      "' + w + '" darf nicht in nichtZugeordnet stehen');
    }
    for (const z of fehler) console.log(z);
    return fehler.length === 0;
  });
}

/* =========================================================================
   ABDECKUNGS-CHECK — die Fehlerklasse hinter dem sci-fi-Befund zumauern
   -------------------------------------------------------------------------
   Ein Vokabelziel, das keine echte Genre-Schreibweise trifft, fällt im
   positiven Fall als leere Suche auf, im Ausschlussfall STILL. Darum wird
   hier jedes Genre-Ziel des Vokabulars gegen eine Fixture mit realistischen
   deutschen Schreibweisen geprüft: findet das getippte Wort den Film?

   Der Check ist NICHT "alles muss treffen" — er pinnt die BEKANNTEN Lücken.
   Rot wird er, sobald eine NEUE dazukommt (und auch, wenn eine bekannte
   behoben ist und aus der Liste raus muss). Die vollständige Liste steht in
   der Zusammenfassung, damit Max entscheiden kann, was Vokabular-Korrektur
   und was Altlast ist.

   PRÜFMASSSTAB: die vollständige Genre-Liste aus Max' ECHTER Masterliste
   (177 Einträge, geprüft 26.07.2026) — nicht aus src/data/masterliste.json.
   Die Demo-Datei behauptete jahrelang eine andere Datenform ("Romanze",
   "Science-Fiction"); wer gegen sie prüft, prüft gegen eine Fiktion und
   verdeckt genau die Lücken, die dieser Check finden soll. Ändert sich die
   echte Liste, wird sie HIER nachgezogen — dann meldet der Check, welche
   Vokabelziele ins Leere zeigen.
   ========================================================================= */
const GENRE_SCHREIBWEISEN = ["sci-fi", "romance", "komödie", "crime", "film-noir", "neo-noir",
  "horror", "drama", "thriller", "action", "abenteuer", "fantasy", "anime", "animation",
  "western", "satire", "parodie", "mystery", "familie", "musical", "musikfilm", "arthouse",
  "exploitation", "superheldenfilm", "monsterfilm", "martial-arts", "kriegsfilm",
  "historienfilm", "tragikomödie", "biopic", "stunt"];
const VOKAB_MASTER = GENRE_SCHREIBWEISEN.map((g, i) => ({
  id: "probe_" + F.genreKey(g), titel: "Probestueck " + (i + 1), originaltitel: "Probestueck " + (i + 1),
  jahr: 1995, typ: "film", quelle: "dvd", kategorie: "zu_pruefen", genre: [g], tags: [],
  bewertung: { wie: 3, was: 3, warum: 3 },
}));
const VOKAB_KTX = { master: VOKAB_MASTER, kinoMatches: { matched: [], rest: [] }, streamingBekannt: { titel: [] } };
const filmFuerGenre = (ziel) => VOKAB_MASTER.find((f) => F.genreKey(f.genre[0]) === F.genreKey(ziel));

/* Wächter über die Kategorieschlüssel. Anders als bei den Genres gibt es hier
   eine geschlossene, kurze Menge — die vier Werte der Masterliste v3. Der
   Finder kannte davor sechs Werte (immer_gut, kult, kult_klassiker,
   daemlich_aber_herrlich, trash, sehenswert), von denen KEINER in den echten
   Daten vorkam: jeder Kategorie-Filter lief still ins Leere. Ein exakter
   Mengenvergleich verhindert, dass ein Legacy-Wert zurückschleicht. */
const KATEGORIEN_V3 = ["sicher_gut", "wahrscheinlich_passend", "referenz", "zu_pruefen"];
checkA("Wächter: vokabular.kategorien kennt genau die vier Kategorien der Masterliste v3", () =>
  gleichMenge(Object.keys(VOK.kategorien || {}), KATEGORIEN_V3));
checkA("Wächter: kein gestrichener Legacy-Kategoriewert im Vokabular", () => {
  const legacy = ["immer_gut", "kult", "kult_klassiker", "daemlich_aber_herrlich", "trash", "sehenswert", "gut"];
  const schluessel = Object.keys(VOK.kategorien || {});
  return legacy.every((l) => !schluessel.includes(l));
});

const abdeckung = [];   // { schluessel, text }
for (const [wort, ziel] of Object.entries(VOK.genre_synonyme || {})) {
  const schluessel = 'genre_synonyme["' + wort + '"] -> "' + ziel + '"';
  const film = filmFuerGenre(ziel);
  if (!film) {
    abdeckung.push({ schluessel, text: schluessel + ": Ziel trifft KEINE der realistischen Schreibweisen "
      + "(" + GENRE_SCHREIBWEISEN.join(", ") + ")" });
    continue;
  }
  const r = F.sucheFinder(P(wort, VOKAB_MASTER), VOKAB_KTX);
  if (!ids(r).includes(film.id)) {
    abdeckung.push({ schluessel, text: schluessel + ': getipptes "' + wort + '" findet den Film mit Genre "'
      + film.genre[0] + '" nicht' });
  }
}
for (const [name, def] of Object.entries(F.alleStimmungen())) {
  for (const ziel of def.genres || []) {
    const schluessel = 'stimmungen["' + name + '"].genres -> "' + ziel + '"';
    const film = filmFuerGenre(ziel);
    if (!film) {
      abdeckung.push({ schluessel, text: schluessel + ": Genre-Referenz trifft KEINE der realistischen Schreibweisen" });
      continue;
    }
    const t = F.sucheFinder(P(name, VOKAB_MASTER), VOKAB_KTX).find((x) => x.film.id === film.id);
    if (!t || !t.gruende.includes("stimmung:" + name)) {
      abdeckung.push({ schluessel, text: schluessel + ': Stimmung "' + name + '" boostet den Film mit Genre "'
        + film.genre[0] + '" nicht' });
    }
  }
}
/* Dieselbe Prüfung eine Ebene höher: JEDES Vokabelwort einer Kategorie muss
   seinen Schlüssel setzen UND einen Film dieser Kategorie erreichen. Genau das
   fehlte, als der Finder sechs Kategorien kannte, die es nicht gab. Geprüft
   wird gegen die Haupt-Fixture, die alle vier v3-Werte belegt. */
for (const [kat, woerter] of Object.entries(VOK.kategorien || {})) {
  const filmDa = MASTER.some((f) => f.kategorie === kat);
  if (!filmDa) {
    abdeckung.push({ schluessel: 'kategorien["' + kat + '"]',
      text: 'kategorien["' + kat + '"]: kein Film dieser Kategorie in der Fixture — nicht prüfbar' });
    continue;
  }
  for (const wort of woerter) {
    const schluessel = 'kategorien["' + kat + '"] <- "' + wort + '"';
    const s = P(wort);
    if (!s.kategorien.includes(kat)) {
      abdeckung.push({ schluessel, text: schluessel + ": Wort setzt den Kategorieschlüssel nicht" });
      continue;
    }
    if (!F.sucheFinder(s, KTX).some((t) => t.film.kategorie === kat)) {
      abdeckung.push({ schluessel, text: schluessel + ": Schlüssel gesetzt, aber kein Film der Kategorie gefunden" });
    }
  }
}

/* Bekannte, gemeldete Lücken. Neue Einträge hier aufzunehmen ist eine bewusste
   Entscheidung — kein stilles Nachziehen, wenn der Check rot wird. */
const BEKANNTE_LUECKEN = new Set([
  /* "dokumentation" ist KEIN Genre der echten Masterliste (177 Einträge, geprüft
     26.07.2026) — die Liste kennt überhaupt kein Dokumentar-Genre. Getipptes
     "doku" zeigt damit ins Leere. Offen: Genre in den Daten ergänzen, Ziel auf
     eine echte Schreibweise umbiegen, oder das Synonym streichen. */
  'genre_synonyme["doku"] -> "dokumentation"',
]);
const neueLuecken = abdeckung.filter((l) => !BEKANNTE_LUECKEN.has(l.schluessel));
const behobeneLuecken = [...BEKANNTE_LUECKEN].filter((k) => !abdeckung.some((l) => l.schluessel === k));
console.log("\n--- ABDECKUNG: Vokabular-Ziele gegen echte Genres und Kategorien ---");
checkA("Abdeckung: keine NEUE Vokabular-Lücke (jedes Genre- und Kategorieziel findet seinen Film)", () => {
  for (const l of neueLuecken) console.log("    NEUE LÜCKE: " + l.text);
  return neueLuecken.length === 0;
});
checkA("Abdeckung: die bekannten Lücken sind noch da — behobene müssen aus der Liste raus", () => {
  for (const k of behobeneLuecken) console.log("    BEHOBEN (bitte aus BEKANNTE_LUECKEN entfernen): " + k);
  return behobeneLuecken.length === 0;
});

/* =========================================================================
   ZUSAMMENFASSUNG
   ========================================================================= */
const scharf = process.env.FINDER_SOLL === "1";
const gesamtA = okA + rotA.length, gesamtB = okB + rotB.length;
console.log("\n===========================================================");
console.log(`TEIL A (Ist-Verhalten):    ${okA}/${gesamtA} bestanden`);
console.log(`TEIL B (Soll-Verhalten):   ${okB}/${gesamtB} bestanden, ${rotB.length} rot`);
if (rotA.length) {
  console.log("\nROTE A-CHECKS (Regression am bestehenden Verhalten):");
  for (const n of rotA) console.log("  ✗ " + n);
}
if (rotB.length) {
  console.log("\nROTE B-CHECKS (noch nicht gebaut — erwartet bis zur Umsetzung):");
  for (const n of rotB) console.log("  ✗ " + n);
}
console.log("\nABDECKUNGSBERICHT Vokabular -> echte Datenwerte"
  + "\n  Genres (Prüfmaßstab): " + GENRE_SCHREIBWEISEN.join(", ")
  + "\n  Kategorien v3:        " + KATEGORIEN_V3.join(", "));
if (!abdeckung.length) console.log("  keine Lücke — jedes Genre- und Kategorieziel findet seinen Film.");
for (const l of abdeckung) {
  console.log("  " + (BEKANNTE_LUECKEN.has(l.schluessel) ? "bekannt: " : "NEU:     ") + l.text);
}
console.log("  Tag-Seite: Stimmungs-Tags werden ebenfalls über genreKey() verglichen (fTagKeys) —"
  + " 'duester' trifft 'düster'. Belegt durch den Nachtrags-Check oben, keine offene Lücke.");
console.log(`\nModus: ${scharf ? "FINDER_SOLL=1 — A UND B scharf" : "A scharf, B nur berichtet (FINDER_SOLL=1 setzt B scharf)"}`);
const fehlschlag = rotA.length > 0 || (scharf && rotB.length > 0);
console.log(fehlschlag ? "FINDER-TEST: BEFUNDE OBEN" : "FINDER-TEST BESTANDEN");
process.exit(fehlschlag ? 1 : 0);
