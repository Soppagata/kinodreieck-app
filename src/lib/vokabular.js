const text = (wert) => String(wert || "").trim();

function eindeutig(werte) {
  const raus = [];
  const gesehen = new Set();
  for (const wert of werte || []) {
    const sauber = text(wert).toLowerCase();
    if (!sauber || gesehen.has(sauber)) continue;
    gesehen.add(sauber);
    raus.push(sauber);
  }
  return raus;
}

export function vokabularZuMap(liste) {
  const map = {};
  for (const eintrag of liste || []) {
    const wort = text(eintrag?.wort).toLowerCase();
    if (!wort) continue;
    map[wort] = {
      genres: eindeutig(eintrag.genres),
      tags: eindeutig(eintrag.tags),
    };
  }
  return map;
}

/* Eine KI-Deutung wird genau einmal in eine kleine lokale Regel übersetzt.
   Danach braucht der Finder weder Netz noch Modell: Das Wort verhält sich wie
   jede eingebaute Stimmung und boostet passende Genres/Tags deterministisch. */
export function vokabularEintragAusDeutung({
  wort,
  beschreibung,
  deutung,
  master = [],
  stimmungen = {},
}) {
  const sig = deutung?.sig || {};
  const genres = [...(sig.genres || [])];
  const tags = [];

  for (const stimmung of sig.stimmungen || []) {
    const definition = stimmungen[stimmung] || {};
    genres.push(...(definition.genres || []));
    tags.push(...(definition.tags || []));
  }

  const filmIds = new Set((sig.titel || []).map((film) => String(film.id)));
  for (const film of master || []) {
    if (!filmIds.has(String(film.id))) continue;
    genres.push(...(film.genre || []));
    tags.push(...(film.tags || []));
  }

  /* Kategorien wie „Kult“ sind im Bestand häufig gleichzeitig Tags. Als
     weiches Tag bleiben sie nützlich, ohne wie ein harter Kategorienfilter
     alle anderen Rule-of-Cool-Beispiele auszusortieren. */
  tags.push(...(sig.kategorien || []));

  return {
    wort: text(wort).toLowerCase(),
    beschreibung: text(beschreibung),
    interpretation: text(deutung?.klartext),
    genres: eindeutig(genres),
    tags: eindeutig(tags),
    erstellt_am: new Date().toISOString(),
  };
}

export function hatOfflineDefinition(eintrag) {
  return !!(eintrag?.wort && ((eintrag.genres || []).length || (eintrag.tags || []).length));
}
