/* Gemeinsamer Inhaltsvergleich; Notizen sind keine Bewertungsänderung. */
export function prognosePasstZurBewertung(prognose, eintrag) {
  const vorschlag = prognose?.ergebnis;
  const bewertung = eintrag?.bewertung;
  return !!vorschlag && !!bewertung
    && vorschlag.achsen?.wie === bewertung.wie
    && vorschlag.achsen?.was === bewertung.was
    && vorschlag.achsen?.warum === bewertung.warum
    && vorschlag.kategorie_vorschlag === eintrag.kategorie
    && (vorschlag.begruendung || "") === (eintrag.begruendung || "");
}

