const wertLeser = Object.freeze({
  titel: (titel) => titel.titel || null,
  jahr: (titel) => Number.isFinite(titel.jahr) ? titel.jahr : null,
  art: (titel) => titel.typ || null,
  anbieter: (titel) => [...(titel.dienste || [])].sort((a, b) => a.localeCompare(b, "de"))[0] || null,
});

export function sortiereStreamingTitel(liste, feld = "titel", richtung = "auf") {
  const wertVon = wertLeser[feld] || wertLeser.titel;
  const faktor = richtung === "ab" ? -1 : 1;

  return [...liste].sort((a, b) => {
    const av = wertVon(a);
    const bv = wertVon(b);
    /* Fehlende Metadaten bleiben in beiden Richtungen am Listenende. */
    if (av == null && bv != null) return 1;
    if (av != null && bv == null) return -1;
    if (av !== bv) {
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv), "de", { sensitivity: "base", numeric: true }) * faktor;
      }
      return (av - bv) * faktor;
    }
    return (a.titel || "").localeCompare(b.titel || "", "de", { sensitivity: "base", numeric: true });
  });
}
