const text = (value) => String(value == null ? "" : value).trim();

export function streamingTitelKennung(titel) {
  const id = titel?.watchmode_id ?? titel?.watchmodeId;
  return id == null || !text(id) ? null : text(id);
}

export function streamingKatalogstaendePassen(bekannt, entdecken) {
  const bekanntStand = text(bekannt?.katalog_stand_bekannt ?? bekannt?.katalog_stand);
  const entdeckenStand = text(entdecken?.katalog_stand_entdecken ?? entdecken?.katalog_stand);
  return !!bekanntStand && bekanntStand === entdeckenStand;
}

function vereinigeListen(links, rechts) {
  return [...new Set([...(Array.isArray(links) ? links : []), ...(Array.isArray(rechts) ? rechts : [])])];
}

function vereinigeTitel(bisher, titel) {
  if (!bisher) return {
    ...titel,
    dienste: vereinigeListen([], titel?.dienste),
    genres: vereinigeListen([], titel?.genres ?? titel?.genre),
  };
  return {
    ...bisher,
    ...titel,
    dienste: vereinigeListen(bisher.dienste, titel?.dienste),
    genres: vereinigeListen(bisher.genres ?? bisher.genre, titel?.genres ?? titel?.genre),
    dienst_diffs: Array.isArray(titel?.dienst_diffs)
      ? titel.dienst_diffs
      : bisher.dienst_diffs,
  };
}

/* Known und Discover sind Auslieferungslanes, keine getrennten Produktmengen.
   Diese Projektion erzeugt die eine deduplizierte Titelmenge, aus der Alles,
   Mein Programm, Neu und der Settings-Zähler abgeleitet werden. */
export function vereinigeStreamingTitel(bekannt, entdecken) {
  const map = new Map();
  for (const titel of entdecken?.titel || []) {
    const id = streamingTitelKennung(titel);
    if (id) map.set(id, vereinigeTitel(map.get(id), titel));
  }
  /* Die Known-Lane enthält die lokalen Mediathekfelder und gewinnt deshalb
     bei überlappenden Feldern; Dienste und Genres bleiben verlustfrei vereint. */
  for (const titel of bekannt?.titel || []) {
    const id = streamingTitelKennung(titel);
    if (id) map.set(id, vereinigeTitel(map.get(id), titel));
  }
  return Object.freeze([...map.values()].map(Object.freeze));
}

export function istStreamingDienstAusgewaehlt(titel, auswahl, auswahlGeladen = true) {
  if (!auswahlGeladen || !Array.isArray(auswahl) || auswahl.length === 0) return false;
  const gewaehlt = new Set(auswahl.map(text).filter(Boolean));
  return (titel?.dienste || []).some((dienst) => gewaehlt.has(text(dienst)));
}

export function projiziereStreamingAnsichten({
  bekannt,
  entdecken,
  auswahl = [],
  auswahlGeladen = true,
} = {}) {
  const alleTitel = vereinigeStreamingTitel(bekannt, entdecken);
  const bereit = !!(bekannt?.stand || entdecken?.stand);
  const vollstaendig = entdecken?.katalogMengen?.umfang === "voll"
    && streamingKatalogstaendePassen(bekannt, entdecken);
  const ausgewaehlt = auswahlGeladen
    ? alleTitel.filter((titel) => istStreamingDienstAusgewaehlt(titel, auswahl, true))
    : [];
  const meinProgramm = auswahlGeladen
    ? (bekannt?.titel || []).filter((titel) => istStreamingDienstAusgewaehlt(titel, auswahl, true))
    : [];
  return Object.freeze({
    status: !auswahlGeladen ? "auswahl-laedt" : bereit ? "bereit" : "katalog-laedt",
    vollstaendig,
    gesamtbestand: alleTitel.length,
    alleTitel,
    ausgewaehlt: Object.freeze(ausgewaehlt),
    meinProgramm: Object.freeze(meinProgramm),
  });
}
