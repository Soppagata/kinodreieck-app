/* ---------- Typ-System der Mediathek ----------
   Ein Bestand, typ als Diskriminator. Tabs sind Filter, keine eigenen Listen. */
export const TYP_GRUPPEN = {
  filme: ["film"],
  serien: ["serie"], // franchise 2026-07 gestrichen
  musik: ["musik"],
  sonstiges: ["sonstiges"],
};

export const TAB_LABELS = { filme: "Filme", serien: "Serien", musik: "Musik", sonstiges: "Sonstiges" };

export const ALLE_TYPEN = ["film", "serie", "musik", "sonstiges"];

/* Alte Import-/Backupwerte bleiben lesbar, werden im aktuellen Modell aber
   nicht mehr als eigene Typen weitergeschrieben. */
export function normalisiereTyp(typ) {
  if (typ === "trilogie" || typ === "filmreihe") return "film";
  if (typ === "franchise") return "serie";
  return typ || "film";
}

/* musik & sonstiges bekommen kein Dreieck — bewertung bleibt hart null.
   Das Modell ist auf Filmwirkung kalibriert; Achsen dort würden die
   Kalibrierung der bestehenden Einträge verwässern. */
export const OHNE_DREIECK = ["musik", "sonstiges"];
export function hatDreieck(typ) { return !OHNE_DREIECK.includes(normalisiereTyp(typ)); }

export function tabVonTyp(typ) {
  const aktuell = normalisiereTyp(typ);
  for (const [tab, typen] of Object.entries(TYP_GRUPPEN)) {
    if (typen.includes(aktuell)) return tab;
  }
  return "sonstiges";
}
