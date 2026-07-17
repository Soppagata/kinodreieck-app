/* ---------- Wiener Kinos: Abo-Erkennung & Buchungslinks ---------- */

/* Nonstop-Abo gilt PRO KINO (stabile Mitgliederliste) — kein Live-Abgleich noetig. */
const NONSTOP_ABO_RE = /filmcasino|votiv|de ?france|gartenbau|burg|admiral|stadtkino|schikaneder|top ?kino|haydn|metro|filmarchiv|filmhaus|breitenseer|cine ?center|actors|urania|bellaria|filmmuseum|kino ?wie ?noch ?nie/i;
export function istImAbo(name) { return NONSTOP_ABO_RE.test(name || ""); }

/* Buchungs-/Programmseiten der Häuser — pflegbar in src/data/kino_webseiten.json
   (Stichwort -> URL). Cineplexx-URLs enden auf "?date=" und bekommen das heutige
   Datum angehängt. Unbekannte Kinos fallen auf die Nonstop-Programmseite zurück. */
import kinoWebseiten from "../data/kino_webseiten.json";

export const NONSTOP_PROGRAMM_URL = "https://www.nonstopkino.at/programm";

const heuteISO = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

export function kinoLink(name) {
  const n = (name || "").toLowerCase();
  for (const k of (kinoWebseiten.kinos || [])) {
    if (k.match && n.includes(k.match)) {
      return k.url.endsWith("?date=") ? k.url + heuteISO() : k.url; // Cineplexx: heutiges Datum anhängen
    }
  }
  return NONSTOP_PROGRAMM_URL;
}

/* Streaming-Verfügbarkeit kommt ausschließlich von Watchmode
   (Streaming-Tab / streaming_config.json) — kein TMDB (ausgebaut 2026-07). */
