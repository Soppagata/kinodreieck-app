/* Datenfreie Projektionen für Bibliothek, Kinoprogramm und Artikel.
   Die Funktionen kennen weder React noch die mitgelieferten JSON-Beilagen und
   lassen sich deshalb unabhängig vom Browser testen und wiederverwenden. */

import { matchFilm, score } from "./match.js";
import { hatPhysischeQuelle } from "./quellen.js";

export function gueltigerArtikel(a) {
  return !!a && typeof a === "object"
    && typeof a.id === "string" && a.id.length > 0
    && typeof a.titel === "string"
    && Array.isArray(a.liste)
    && a.liste.every((eintrag) => !!eintrag && typeof eintrag === "object")
    && (a.text === undefined || a.text === null || typeof a.text === "string");
}

export function baueRefUniversum(master, mustwatch) {
  return [
    ...(master || []),
    ...(mustwatch || []).map((eintrag) => ({
      id: eintrag.id,
      titel: eintrag.titel,
      jahr: null,
      typ: "film",
    })),
  ];
}

export function baueKinoMatches(programm, master) {
  if (!programm?.filme || !master) {
    return { matched: [], rest: programm?.filme || [] };
  }
  const nachFilmAtId = new Map(
    master.filter((film) => film.film_at_id).map((film) => [film.film_at_id, film]),
  );
  const matched = [];
  const rest = [];
  for (const programmFilm of programm.filme) {
    const film = (programmFilm.film_at_id && nachFilmAtId.get(programmFilm.film_at_id))
      || matchFilm(programmFilm.t, programmFilm.j, master)
      || (programmFilm.ot && programmFilm.ot !== programmFilm.t
        ? matchFilm(programmFilm.ot, programmFilm.j, master)
        : null);
    if (film) matched.push({ prog: programmFilm, film });
    else rest.push(programmFilm);
  }
  const besitzRang = (film) => (hatPhysischeQuelle(film.quelle) ? 0 : 1);
  matched.sort((a, b) => (
    besitzRang(a.film) - besitzRang(b.film)
    || score(b.film) - score(a.film)
  ));
  return { matched, rest };
}

export function filtereAktiveKinoPins(pins, programm) {
  const liste = Array.isArray(pins) ? [...pins] : [];
  if (!Array.isArray(programm?.filme)) return liste;
  const slots = new Set(programm.filme.flatMap((film) => (film.z || []).map((termin) => `${film.t}\n${termin}`)));
  return liste.filter((pin) => slots.has(`${pin.t}\n${pin.z}`));
}

/* Entfernt einen Mediathek-Eintrag, ohne abhängige persönliche Listen zu
   beschädigen: Blog-Verweise werden wieder zu Rotlinks, Must-Watch-Einträge
   bleiben erhalten und verlieren nur ihre Master-Verknüpfung. */
export function planeFilmLoeschung(master, artikel, mustwatch, id) {
  const filme = Array.isArray(master) ? master : [];
  const artikelListe = Array.isArray(artikel) ? artikel : [];
  const mustwatchListe = Array.isArray(mustwatch) ? mustwatch : [];
  let artikelRefs = 0;
  let mustwatchRefs = 0;
  const plan = {
    master: filme.filter((film) => film.id !== id),
    artikel: artikelListe.map((eintrag) => ({
      ...eintrag,
      liste: (eintrag.liste || []).map((zeile) => {
        if (zeile.ref !== id) return zeile;
        artikelRefs++;
        return { ...zeile, ref: null, abgleich: undefined };
      }),
      abgleichStat: undefined,
    })),
    mustwatch: mustwatchListe.map((eintrag) => {
      if (eintrag.verknuepfung?.ziel !== "master" || eintrag.verknuepfung.id !== id) return eintrag;
      mustwatchRefs++;
      return { ...eintrag, verknuepfung: null };
    }),
  };
  return { ...plan, folgen: { artikelRefs, mustwatchRefs } };
}
