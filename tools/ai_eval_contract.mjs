/* Pure, kostenfreie Auswertungsregeln fuer den Live-Eval. Kein Netzwerk,
   keine Umgebung und keine Dateizugriffe. */

export function fremdeEvalWerte(d = {}, listen = {}) {
  const h = d.harte_filter || {};
  const w = d.weiche_wuensche || {};
  const a = d.ausschluesse || {};
  const pruefe = (feld, roh, erlaubt) => {
    const erlaubte = new Set(Array.isArray(erlaubt) ? erlaubt : []);
    return (Array.isArray(roh) ? roh : [])
      .filter((x) => typeof x === "string" && !erlaubte.has(x))
      .map((x) => `${feld}=${x}`);
  };
  return [
    ...pruefe("harte_filter.genres", h.genres, listen.genres),
    ...pruefe("harte_filter.kategorien", h.kategorien, listen.kategorien),
    ...pruefe("harte_filter.quellen", h.quellen, listen.quellen),
    ...pruefe("harte_filter.zeit", h.zeit, listen.zeit),
    ...pruefe("weiche_wuensche.stimmungen", w.stimmungen, listen.stimmungen),
    ...pruefe("ausschluesse.genres", a.genres, listen.genres),
  ];
}

export function hatWirkendeEvalDeutung(d = {}) {
  const h = d.harte_filter || {};
  const w = d.weiche_wuensche || {};
  const a = d.ausschluesse || {};
  const hatListe = (wert) => Array.isArray(wert) && wert.length > 0;
  return hatListe(h.genres) || hatListe(h.kategorien) || hatListe(h.quellen)
    || hatListe(h.zeit) || hatListe(h.dekaden) || hatListe(h.titel)
    || hatListe(h.reihen) || h.jahrMin !== null && h.jahrMin !== undefined
    || h.jahrMax !== null && h.jahrMax !== undefined
    || hatListe(w.stimmungen) || hatListe(a.genres) || hatListe(a.dekaden)
    || d.entdecken === true;
}
