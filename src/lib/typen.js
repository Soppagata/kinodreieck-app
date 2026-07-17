/* ---------- Typ-System der Mediathek ----------
   Ein Bestand, typ als Diskriminator. Tabs sind Filter, keine eigenen Listen. */
export const TYP_GRUPPEN = {
  filme: ["film", "filmreihe"], // trilogie 2026-07 gestrichen — filmreihe deckt sie ab
  serien: ["serie"], // franchise 2026-07 gestrichen
  musik: ["musik"],
  sonstiges: ["sonstiges"],
};

export const TAB_LABELS = { filme: "Filme", serien: "Serien", musik: "Musik", sonstiges: "Sonstiges" };

export const ALLE_TYPEN = ["film", "filmreihe", "serie", "musik", "sonstiges"];

/* musik & sonstiges bekommen kein Dreieck — bewertung bleibt hart null.
   Das Modell ist auf Filmwirkung kalibriert; Achsen dort würden die
   Kalibrierung der bestehenden Einträge verwässern. */
export const OHNE_DREIECK = ["musik", "sonstiges"];
export function hatDreieck(typ) { return !OHNE_DREIECK.includes(typ || "film"); }

export function tabVonTyp(typ) {
  for (const [tab, typen] of Object.entries(TYP_GRUPPEN)) {
    if (typen.includes(typ || "film")) return tab;
  }
  return "sonstiges";
}
