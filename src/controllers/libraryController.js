/* Reine Bibliotheksprojektionen.
   React-State bleibt in App, die fachlichen Ableitungen von Master, Must-Watch,
   Kinoprogramm und Nachtrag haben hier eine testbare Heimat. */

import nachtragDatei from "../data/nachtrag.json";
import masterWikidata from "../data/master_wikidata.json";
import { norm } from "../lib/match.js";

export {
  baueRefUniversum,
  baueKinoMatches,
  filtereAktiveKinoPins,
  gueltigerArtikel,
  planeFilmLoeschung,
  planeMustwatchSprung,
} from "../lib/libraryProjection.js";

export const NACHTRAG_FLACH = Object.freeze([].concat(
  nachtragDatei.beide || [],
  nachtragDatei.nur_dvd || [],
  nachtragDatei.nur_prime || [],
  nachtragDatei.nur_apple || [],
));

export function reicheFinderMasterAn(master) {
  const eintraege = masterWikidata?.eintraege || {};
  if (!master || !Object.keys(eintraege).length) return master;
  return master.map((film) => {
    const wissen = eintraege[film.id];
    return wissen
      ? {
        ...film,
        reihe: wissen.reihe || [],
        franchise: wissen.franchise || [],
        regie: wissen.regie || [],
      }
      : film;
  });
}

export function sichtbarerNachtrag(master) {
  if (!master) return NACHTRAG_FLACH;
  const masterNorms = [...new Set(
    master.flatMap((film) => [norm(film.titel), norm(film.originaltitel)]).filter(Boolean),
  )];
  const vorhanden = new Set(masterNorms);
  const edition = /^(the\s+)?(complete|collection|collector|edition|box|vol(ume)?\b)/;
  return NACHTRAG_FLACH.filter((eintrag) => {
    const titel = norm(eintrag.titel);
    if (vorhanden.has(titel)) return false;
    return !masterNorms.some((masterTitel) => (
      masterTitel.length >= 8
      && titel.startsWith(masterTitel + " ")
      && edition.test(titel.slice(masterTitel.length + 1))
    ));
  });
}
