/* Kanonisches Vokabular für persönliche Film-/Serienurteile.

   Etappe 8 schließt den Drift zwischen dem tatsächlichen Bestand und dem
   Finder: Neue Bewertungen und Prognosen verwenden diese sieben Werte.
   Frühere v3-Hypothesen bleiben ausschließlich als lesbare Legacy-Werte in
   KategorieTag erhalten; sie dürfen nicht mehr neu geschrieben werden. */

export const BEWERTUNGSKATEGORIEN = Object.freeze([
  Object.freeze({ id: "immer_gut", label: "Immer gut" }),
  Object.freeze({ id: "kult", label: "Kult" }),
  Object.freeze({ id: "kult_klassiker", label: "Kult-Klassiker" }),
  Object.freeze({ id: "daemlich_aber_herrlich", label: "Dämlich aber herrlich" }),
  Object.freeze({ id: "trash", label: "Trash" }),
  Object.freeze({ id: "sehenswert", label: "Sehenswert" }),
  Object.freeze({ id: "echter_schrott", label: "Echter Schrott" }),
]);

export const BEWERTUNGSKATEGORIE_IDS = Object.freeze(
  BEWERTUNGSKATEGORIEN.map((k) => k.id),
);

const LABELS = Object.freeze(Object.fromEntries(
  BEWERTUNGSKATEGORIEN.map((k) => [k.id, k.label]),
));

export function istBewertungskategorie(wert) {
  return typeof wert === "string" && Object.prototype.hasOwnProperty.call(LABELS, wert);
}

export function bewertungskategorieLabel(wert) {
  return LABELS[wert] || null;
}
