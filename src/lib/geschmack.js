/* ---------- Deterministisches Geschmacks-Onboarding (Etappe 7, Phase 2c) ----------

   Der VOLLWERTIGE Erhebungsweg ohne KI. Steckbrief 26.07.: „Schlagwort-
   Auswahl aus kuratierter Liste + Verknüpfung mit passenden Filmen".
   Abnahme-Anker der Etappe: Ein KI-loser Start ist vollwertig — dieses
   Modul darf deshalb NICHTS aus `services/ai.js` brauchen und tut es nicht.

   WARUM DIESE SCHICHT VON DER OBERFLÄCHE GETRENNT IST
   Die Umrechnung „angekreuzte Chips → gültige Profil-Signale" ist der Ort,
   an dem die Zusagen aus `profil.js` eingehalten oder gebrochen werden:
   Belegpflicht, Richtungs-Exklusivität, Opt-in. In einer JSX-Datei wäre sie
   nur über das Rendern prüfbar. Hier ist sie eine reine Funktion.

   DIE BELEGPFLICHT IM DETERMINISTISCHEN FALL
   `pruefeSignal` verlangt für JEDES Signal einen Beleg. Beim KI-Weg ist das
   eine Textstelle aus der Antwort. Hier ist es das gewählte Schlagwort
   selbst — `schlagwort:<id>`. Das ist keine Formalie: Die Profil-Ansicht
   kann daran später zeigen, WORAUS ein Zug stammt, und der Eval in Phase 4
   unterscheidet daran den deterministischen vom extrahierten Anteil.

   WARUM ALLE SCHLAGWORT-SIGNALE DIESELBE STÄRKE TRAGEN
   Ein Chip trägt genau ein Bit: „das zieht mich an" oder „das stößt mich
   ab". Er sagt NICHT, wie stark. Jede Abstufung, die dieses Modul hier
   erfände, wäre genau die Sorte Behauptung, die `profil.js` an jeder
   anderen Stelle verbietet. Also ein einheitlicher Wert, ausdrücklich
   dokumentiert — die Abstufung entsteht später aus dem KI-Weg und aus
   wiederholten Belegen, nicht aus einem Häkchen.

   Die Sicherheit ist trotzdem `hoch`: Der Nutzer hat es selbst angekreuzt.
   Das ist die sicherste Quelle, die das Modell kennt — sicherer als jede
   Extraktion. `hoch` beschreibt die HERKUNFT, nicht die Stärke. */

import { RICHTUNGEN, SIGNAL_ARTEN } from "./profil.js";
import { norm } from "./match.js";
import liste from "../data/geschmack_schlagwoerter.json" with { type: "json" };

/* Einheitlich für jedes angekreuzte Schlagwort — siehe Modulkopf. */
export const SCHLAGWORT_STAERKE = 4;
export const SCHLAGWORT_SICHERHEIT = "hoch";
export const SCHLAGWORT_QUELLE = "schlagwort";

/* Der Beleg-Präfix ist Teil des Datenvertrags, nicht nur ein Textbaustein:
   Phase 4 zählt daran den deterministischen Anteil, und die Profil-Ansicht
   erkennt daran, welche Züge sie zum Bearbeiten anbieten darf. */
export const BELEG_PRAEFIX = "schlagwort:";
/* BEWUSST OHNE ERZEUGER. Filmwahlen sind keine Signale: `filmeAusAuswahl`
   schreibt sie ausschließlich nach `profil.filme`, wo die bestätigte
   Auswahl bereits vollständig und ohne `beleg`-Feld abgebildet ist. Der
   Präfix reserviert nur einen kollisionsfreien Namensraum für eine mögliche
   spätere, ausdrücklich bestätigte Ableitung. Solange es die nicht gibt,
   darf weder die Extraktion noch ein Eval Filmwahlen als Signale zählen. */
export const FILM_BELEG_PRAEFIX = "filmwahl:";

/* ---------- Die kuratierte Liste ---------- */

/* Jedes Schlagwort ist an echten Daten gemessen (`tools/schlagwort_belege.mjs`,
   Kuration 28.07.2026). Die E18-Lehre lautet: ein Schlagwort, das ausgewählt
   wird und dann nichts bewirkt, ist eine Lüge im Produkt — der Nutzer glaubt,
   sein Profil sage etwas über ihn aus, und es steht totes Gewicht drin.
   Deshalb trägt jeder Eintrag seine gemessene Trefferzahl mit. */
export function schlagwoerter() {
  return Array.isArray(liste.schlagwoerter) ? liste.schlagwoerter : [];
}

export function gruppen() {
  const nachId = new Map((liste.gruppen || []).map((g) => [g.id, g]));
  const aus = [];
  for (const s of schlagwoerter()) {
    let g = aus.find((x) => x.id === s.gruppe);
    if (!g) {
      const def = nachId.get(s.gruppe);
      g = { id: s.gruppe, titel: def?.titel || s.gruppe, hinweis: def?.hinweis || null, eintraege: [] };
      aus.push(g);
    }
    g.eintraege.push(s);
  }
  return aus;
}

export function findeSchlagwort(id) {
  return schlagwoerter().find((s) => s.id === id) || null;
}

/* ---------- Auswahl → Signale ---------- */

/* Die Auswahl ist eine Abbildung `id -> richtung`. Bewusst KEINE Liste von
   Objekten: Eine Abbildung kann pro Schlagwort nur EINE Richtung tragen, und
   damit ist die Exklusivität in der Datenform erzwungen statt in einer
   Prüfung, die man vergessen kann.

   Das ist kein theoretischer Vorzug. `profil.js` nimmt die Richtung in die
   Signal-Identität auf (`signalId`), also stehen „mag Drama" und „meidet
   Drama" dort friedlich nebeneinander — das Modul widerspricht nicht. Wer
   die Auswahl als Liste führte, könnte beide erzeugen, und der Prompt trüge
   danach zwei Zeilen, die einander aufheben. */
export function signaleAusAuswahl(auswahl) {
  const signale = [];
  const uebergangen = [];
  for (const [id, richtung] of Object.entries(auswahl || {})) {
    if (richtung == null) continue;                       // abgewählt = kein Signal
    const s = findeSchlagwort(id);
    if (!s) { uebergangen.push({ id, grund: "unbekanntes Schlagwort" }); continue; }
    if (!RICHTUNGEN.includes(richtung)) { uebergangen.push({ id, grund: "unbekannte Richtung" }); continue; }
    /* Die Liste ist eine Datei — sie kann von einem alten Build stammen oder
       von Hand bearbeitet worden sein. Eine Art, die `profil.js` nicht kennt,
       würde sonst erst tief in `pruefeSignal` auffallen, wo der Bezug zum
       Schlagwort verloren ist. */
    if (!SIGNAL_ARTEN.includes(s.art)) { uebergangen.push({ id, grund: "Art nicht im Modell: " + s.art }); continue; }
    signale.push({
      art: s.art,
      wert: s.wert,
      richtung,
      staerke: SCHLAGWORT_STAERKE,
      sicherheit: SCHLAGWORT_SICHERHEIT,
      quelle: SCHLAGWORT_QUELLE,
      beleg: BELEG_PRAEFIX + id,
    });
  }
  return { signale, uebergangen };
}

/* ---------- Die Filmauswahl ---------- */

/* Regel statt Handauswahl, damit sie sich bei wachsendem Bestand neu
   ableitet — eine eingefrorene Titelliste veraltet still.

   ZWEI TÖPFE MIT VERSCHIEDENEN AUFGABEN. Der Kult-/Immer-gut-Block liefert
   WIEDERERKENNBARKEIT: Filme, die man am Titel erkennt, ohne nachzudenken.
   Der Trash-Block liefert TRENNSCHÄRFE: Wer Jackass ankreuzt — in welche
   Richtung auch immer — sagt etwas über sich, das kein Genre-Chip sagen
   kann. Die weiche Mitte (`sehenswert`, im Beta-Bestand 48 Titel) bleibt
   bewusst draußen: Ein Häkchen dort trägt kaum Information. */
export const FILM_KATEGORIEN = {
  wiedererkennbar: ["kult", "kult_klassiker", "immer_gut"],
  trennscharf: ["trash", "daemlich_aber_herrlich"],
};

/* Ein Film je Reihe. Ohne das füllt eine einzige Reihe die Auswahl: Im
   gemessenen Bestand sind fünf von fünf `stunt`-Titeln Jackass und vier von
   sechs `anime`-Titeln Evangelion. Zehn Evangelion-Kacheln fragen nicht nach
   Geschmack, sie fragen nach einer Sammlung.

   Der Reihenschlüssel ist das erste Wort des normalisierten Titels — grob,
   aber diese Daten führen kein `reihe`- oder `franchise`-Feld, und ein
   grober Schlüssel ist hier ehrlicher als ein erfundenes Feld.

   NORMALISIERT MIT `norm()` AUS `match.js`, nicht mit einer eigenen Fassung.
   Die eigene warf den führenden Artikel nicht weg — und damit galten
   *The Godfather*, *The Fly*, *The Truman Show*, *The Incredibles* und zehn
   weitere als EINE Reihe. Gemessen am echten Bestand: 13 von 14 „The"-Titeln
   fielen aus der Auswahl, 29 statt 39 Filme, und es traf ausgerechnet die
   wiedererkennbarsten — also genau das, wofür der `wiedererkennbar`-Topf da
   ist. Das Messskript, das die Konzentration belegt, benutzt `norm()`; zwei
   Regeln für dieselbe Frage widersprachen einander. */
const reihenSchluessel = (titel) => norm(titel).split(" ").filter(Boolean)[0] || "";

export function filmAuswahl(titel, { proReihe = 1, max = 40 } = {}) {
  const alle = Array.isArray(titel) ? titel : [];
  const gruppe = (k) => {
    for (const [name, werte] of Object.entries(FILM_KATEGORIEN)) if (werte.includes(k)) return name;
    return null;
  };
  const gezaehlt = new Map();
  const aus = [];
  for (const f of alle) {
    /* Grenze am SCHLEIFENANFANG, nicht am Ende. Nachher geprueft war
       `aus.length >= 0` erst nach dem ersten Anhaengen wahr -- `max: 0`
       lieferte einen Film, `max: -5` ebenfalls. Eine Obergrenze, die genau
       bei ihrem kleinsten Wert nicht gilt, ist keine. */
    if (aus.length >= max) break;
    if (!f || typeof f !== "object") continue;
    const g = gruppe(f.kategorie);
    if (!g) continue;
    if (typeof f.titel !== "string" || !f.titel.trim()) continue;
    const r = reihenSchluessel(f.titel);
    const bisher = gezaehlt.get(r) || 0;
    if (bisher >= proReihe) continue;
    gezaehlt.set(r, bisher + 1);
    aus.push({
      id: String(f.id || f.titel),
      titel: f.titel,
      jahr: Number.isInteger(f.jahr) ? f.jahr : null,
      gruppe: g,
    });
  }
  return aus;
}

/* Die Filmwahl wird zum Rahmen-Vorschlag, nicht zu Signalen: `profil.filme`
   ist der dafür vorgesehene Platz, und der Weg über `vorschlagRahmen` hält
   die Zwei-Bühnen-Regel ein (nichts landet ohne Bestätigung im Profil).

   `richtung` ist seit Phase 2c Teil des Film-Eintrags. Ohne sie konnte ein
   Film nur „genannt" sein — und die Ablehnung, oft die trennschärfere
   Hälfte, hatte im Modell keinen Platz. */
export function filmeAusAuswahl(auswahl, angebot) {
  /* `Array.isArray` statt `|| []`: Letzteres faengt nur `null`/`undefined`,
     und ein Angebot, das versehentlich ein Objekt oder ein String ist,
     riss die Funktion mit einem TypeError auf. Die Schwesterfunktion
     `filmAuswahl` macht es weiter oben schon richtig. */
  const nachId = new Map((Array.isArray(angebot) ? angebot : []).map((f) => [f.id, f]));
  const filme = [];
  const uebergangen = [];
  for (const [id, richtung] of Object.entries(auswahl || {})) {
    if (richtung == null) continue;
    const f = nachId.get(id);
    if (!f) { uebergangen.push({ id, grund: "nicht im Angebot" }); continue; }
    if (!RICHTUNGEN.includes(richtung)) { uebergangen.push({ id, grund: "unbekannte Richtung" }); continue; }
    filme.push({ titel: f.titel, jahr: f.jahr, masterId: f.id, sicher: true, richtung });
  }
  return { filme, uebergangen };
}

/* ---------- Zusammenführung ---------- */

/* Was das Onboarding am Ende produziert, in EINEM Rückgabewert: die
   Signale für `sammle` und der Rahmen für `vorschlagRahmen`.

   Ausdrücklich getrennt gehalten, weil `profil.js` zwei verschiedene Wege
   dafür hat und beide ihre eigene Bestätigung führen. Diese Funktion
   SCHREIBT nichts — sie rechnet nur um. Wer sie aufruft, hat danach noch
   jede Freiheit, dem Nutzer erst die Vorschau zu zeigen. */
export function onboardingErgebnis(eingabe) {
  /* Nicht als Vorgabewert in der Zerlegung: `= {}` greift nur bei
     `undefined`. Ein `null` -- der Wert, den ein Aufrufer fuer „nichts
     ausgewaehlt" am naechsten liegend uebergibt -- warf einen TypeError. */
  const { schlagwoerter: auswahl, filme: filmwahl, angebot, achsen } = eingabe || {};
  const s = signaleAusAuswahl(auswahl);
  const f = filmeAusAuswahl(filmwahl, angebot);
  const rahmen = {};
  if (f.filme.length) rahmen.filme = f.filme;
  /* Nur gesetzte Achsen weitergeben. `pickRahmen` behandelt `null` als
     „unbekannt, nicht ändern" — wer hier eine unberührte Achse als 0
     schickte, überschriebe eine frühere Angabe mit einer Aussage, die der
     Nutzer nie gemacht hat. */
  if (achsen && typeof achsen === "object") {
    const a = {};
    for (const k of ["wie", "was", "warum"]) {
      if (Number.isInteger(achsen[k])) a[k] = achsen[k];
    }
    if (Object.keys(a).length) rahmen.achsen = a;
  }
  return {
    signale: s.signale,
    rahmen: Object.keys(rahmen).length ? rahmen : null,
    uebergangen: [...s.uebergangen, ...f.uebergangen],
  };
}

/* Für die Profil-Ansicht: Stammt dieser Zug aus dem Schlagwort-Onboarding?
   Nur solche Züge lassen sich dort sinnvoll als Chip zurück-darstellen. */
export function ausSchlagwort(signal) {
  return !!(signal && typeof signal.beleg === "string" && signal.beleg.startsWith(BELEG_PRAEFIX));
}

export function schlagwortIdVon(signal) {
  return ausSchlagwort(signal) ? signal.beleg.slice(BELEG_PRAEFIX.length) : null;
}
