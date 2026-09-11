import { ERROR_CODES } from "../services/errors.js";

/* Nur die bereits serverseitig klassifizierten Quellenfehler belegen, dass
   die Filmwissen-Recherche vor einer unklaren Anbieterwirkung beendet wurde.
   Alle anderen Fehler bleiben fail-closed und dürfen keine Prognose starten. */
export function istSichererFilmwissenQuellenstopp(error) {
  if (error?.code !== ERROR_CODES.SERVER
      || error?.source !== "ai"
      || error?.operation !== "task.run"
      || typeof error?.reason !== "string") return false;
  const match = /^filmwissen-quelle:([a-z0-9-]{1,80})$/.exec(error.reason);
  if (!match) return false;
  const grund = match[1];
  return /^(?:adapter-|antwort-|wikimedia-kontakt-fehlt$|wikidata-(?:voruebergehend|api-fehler|entity-schema|entity-identitaet|suchantwort|entity-anzahl)$|loc-(?:komponenten|json|markup|tabellen|header|body|zeilen|snapshot|jahr-ungueltig$))/.test(grund)
    || /^(?:kennung-ungueltig$|wikidata-(?:nicht-gefunden|kennung-mehrdeutig|kein-film|imdb-widerspruch|tmdb-widerspruch|label-fehlt|keine-fakten|provenienz)$|loc-(?:jahrgang|doppelte-identitaet|identitaet-ungeeignet|treffer-mehrdeutig))/.test(grund);
}
