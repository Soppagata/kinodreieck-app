/* Cage-Inhalt kommt aus verfügbaren Quellen, unabhängig vom Mediathek-Unlock.
   Die Referenzidentität verbindet Sprachalias und Quellen; Anzeigeziele bleiben
   die tatsächlich vorhandenen Karten. Kein allgemeines/fuzzy Film-Matching. */
import { SCHWELLEN_EGGS } from "./eggs.js";
import { norm } from "./match.js";
import { hatPhysischeQuelle } from "./quellen.js";
import { sichtbareDienste } from "./dienste.js";
import { zeitpunkt } from "./catalogProjection.js";
import { buchstabeUndTitel } from "./cageAlphabet.js";

const referenzen = SCHWELLEN_EGGS.find(egg => egg.id === "cage-alphabet").referenz;
const schluessel = (titel, jahr) => `${norm(titel)}|${jahr}`;
const istFilm = film => film && (!film.typ || ["film", "movie"].includes(film.typ));
const index = new Map();
for (const [id, ref] of referenzen.entries()) {
  for (const titel of [ref.titel, ref.originaltitel].filter(Boolean)) {
    const key = schluessel(titel, ref.jahr);
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(id);
  }
}

export function cageReferenz(film) {
  if (!istFilm(film) || !Number.isInteger(Number(film.jahr)) || !film.jahr) return { status: "kein-match" };
  const ids = new Set([film.titel, film.originaltitel].filter(Boolean)
    .flatMap(titel => [...(index.get(schluessel(titel, Number(film.jahr))) || [])]));
  if (ids.size !== 1) return { status: ids.size ? "mehrdeutig" : "kein-match" };
  const id = [...ids][0];
  return { status: "gematcht", id, referenz: referenzen[id] };
}

/* Ein bekanntes Ablaufdatum ist der Verfügbarkeitsbeleg. Ein alter oder
   undatierter Beilagen-/Cache-Stand wird nicht als gerade verfügbar etikettiert.
   Beim Sichtbarwerden erneut mit der aktuellen Uhr prüfen. */
export function cageSnapshotAktuell(snapshot, jetzt = new Date()) {
  const bis = zeitpunkt(snapshot?.gueltigBis);
  return !!snapshot && snapshot.abgelaufen !== true && bis != null && bis > +jetzt;
}

export function baueCagePool({ master = [], kinoMatches, programmInfo,
  streamingRoh, streamingBekannt, streamingEntdecken, auswahl = [], jetzt = new Date() } = {}) {
  const pool = new Map();
  const aufnehmen = (film, ziel, herkunft, erwarteteReferenz = null) => {
    const match = cageReferenz(film);
    if (match.status !== "gematcht" || (erwarteteReferenz != null && match.id !== erwarteteReferenz)) return;
    const kandidat = { ...film, originaltitel: film.originaltitel || match.referenz.originaltitel,
      cageReferenz: match.id, cageZiel: ziel, cageHerkunft: { text: herkunft, tab: ziel.tab } };
    if (!pool.has(match.id) && buchstabeUndTitel(kandidat)) pool.set(match.id, kandidat);
  };

  // Die bisherige Herkunftspriorität bleibt Kino → gewähltes Streaming → Besitz.
  if (cageSnapshotAktuell(programmInfo, jetzt)) {
    for (const { film, prog } of kinoMatches?.matched || []) {
      const kandidat = { titel: prog?.t, originaltitel: prog?.ot, jahr: prog?.j };
      const match = cageReferenz(kandidat);
      // Ein großzügiger allgemeiner Kino-Match darf Cage nicht auf ein Remake
      // oder eine fremde Mediathek-Karte lotsen.
      if (match.status === "gematcht" && film?.id != null && cageReferenz(film).id === match.id) {
        aufnehmen({ ...film, ...kandidat }, { tab: "kino", art: "film", ref: film.id, titel: film.titel }, "Läuft gerade im Kino", match.id);
      }
    }
    for (const prog of kinoMatches?.rest || []) {
      aufnehmen({ titel: prog.t, originaltitel: prog.ot, jahr: prog.j },
        { tab: "kino", art: "programm", ref: prog.film_at_id || prog.t, titel: prog.t }, "Läuft gerade im Kino");
    }
  }

  const karten = new Map();
  for (const [art, ansicht] of [["programm", streamingBekannt], ["entdecken", streamingEntdecken]]) {
    for (const film of ansicht?.titel || []) {
      if (film.watchmode_id == null) continue;
      const key = String(film.watchmode_id);
      if (!karten.has(key)) karten.set(key, []);
      karten.get(key).push({ art, film });
    }
  }
  for (const snapshot of [streamingRoh?.bekannt, streamingRoh?.entdecken]) {
    if (!cageSnapshotAktuell(snapshot, jetzt)) continue;
    for (const film of snapshot.titel || []) {
      const dienste = sichtbareDienste(film.dienste, auswahl);
      const ziele = karten.get(String(film.watchmode_id)) || [];
      if (!dienste.length || ziele.length !== 1) continue;
      const { art, film: karte } = ziele[0];
      const match = cageReferenz(film);
      if (art === "programm" && (karte.id == null || match.status !== "gematcht" || cageReferenz(karte).id !== match.id)) continue;
      aufnehmen(film, { tab: "streaming", art, ref: art === "programm" ? karte.id : film.watchmode_id, titel: karte.titel },
        "Streamst du auf " + dienste.slice(0, 2).join(" / "));
    }
  }
  for (const film of master || []) {
    if (film.id != null && hatPhysischeQuelle(film.quelle)) {
      aufnehmen(film, { tab: "mediathek", ref: film.id, titel: film.titel }, "In deinem Besitz");
    }
  }
  return [...pool.values()];
}
