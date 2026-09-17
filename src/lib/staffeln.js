/* Lokaler Gesehen- und Mediathekstatus für Streamingtitel. Alte String-Status
   bleiben lesbar; historische Zusatzfelder werden beim Umschalten bewahrt. */
import { streamingTitelKennung, streamingStatus } from "./streamingProjection.js";
import {
  externeTitelKennungen,
  normalisiereExternenTitel,
  ordneExternenTitelZu,
} from "./externalTitleIdentity.js";

const mediathekIndexCache = new WeakMap();

/* Der Index veraendert die Matchentscheidung nicht. Er begrenzt lediglich die
   Kandidaten auf Eintraege, die ueber einen normalisierten Titel oder eine
   starke ID ueberhaupt matchen beziehungsweise einen Konflikt belegen koennen. */
export function erstelleMediathekIdentitaetsIndex(master = []) {
  const filme = Array.isArray(master) ? master : [];
  if (mediathekIndexCache.has(filme)) return mediathekIndexCache.get(filme);
  const byTitle = new Map(), byStrongId = new Map(), byMasterId = new Map(), order = new Map();
  const add = (map, key, film) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(film);
  };
  filme.forEach((film, index) => {
    order.set(film, index);
    if (film?.id != null) byMasterId.set(String(film.id), film);
    for (const title of [film?.titel, film?.title, film?.originaltitel, film?.originalTitle]) {
      add(byTitle, normalisiereExternenTitel(title), film);
    }
    for (const [namespace, value] of Object.entries(externeTitelKennungen(film))) {
      add(byStrongId, `${namespace}:${value}`, film);
    }
  });
  const candidates = (title) => {
    const found = new Set();
    for (const value of [title?.titel, title?.title, title?.originaltitel, title?.originalTitle]) {
      for (const film of byTitle.get(normalisiereExternenTitel(value)) || []) found.add(film);
    }
    for (const [namespace, value] of Object.entries(externeTitelKennungen(title))) {
      for (const film of byStrongId.get(`${namespace}:${value}`) || []) found.add(film);
    }
    return [...found].sort((a, b) => order.get(a) - order.get(b));
  };
  const index = Object.freeze({ filme, byMasterId, candidates });
  mediathekIndexCache.set(filme, index);
  return index;
}

export function ordneStreamingPageTitelZu(title, indexOrMaster = []) {
  const index = indexOrMaster?.candidates
    ? indexOrMaster : erstelleMediathekIdentitaetsIndex(indexOrMaster);
  const result = ordneExternenTitelZu(title, index.candidates(title));
  return result.status === "matched" ? result.match : null;
}

export function verknuepfeStreamingPageMitMediathek(items, master = []) {
  const index = erstelleMediathekIdentitaetsIndex(master);
  return (Array.isArray(items) ? items : []).map((item) => {
    const film = ordneStreamingPageTitelZu(item, index);
    if (film?.id != null) return { ...item, library_id: film.id };
    if (!Object.prototype.hasOwnProperty.call(item || {}, "library_id")) return item;
    const { library_id: _unbestaetigt, ...rest } = item;
    return rest;
  });
}

export function statusVon(wert) {
  if (typeof wert === "string") return wert;
  return wert && typeof wert === "object" && typeof wert.status === "string" ? wert.status : null;
}

export function mediathekIdVon(wert) {
  if (wert === "erstellt") return true;
  const id = wert && typeof wert === "object" ? wert.mediathek_id : null;
  return typeof id === "string" || typeof id === "number" || id === true ? id : null;
}

function statusObjekt(wert) {
  if (wert && typeof wert === "object") return { ...wert };
  return typeof wert === "string" ? { status: wert } : {};
}

export function mitMediathekEintrag(rohStatus, t, mediathekId, jetzt = new Date()) {
  const basis = statusObjekt(rohStatus);
  const id = typeof mediathekId === "string" || typeof mediathekId === "number" || mediathekId === true
    ? mediathekId
    : null;
  return {
    ...basis,
    status: statusVon(rohStatus) === "gesehen" ? "gesehen" : "erstellt",
    mediathek_id: id,
  };
}

export function ohneMediathekEintrag(rohStatus) {
  if (rohStatus === "erstellt") return null;
  if (!rohStatus || typeof rohStatus !== "object" || !rohStatus.mediathek_id) return rohStatus;
  const { mediathek_id: _entfernt, status, ...rest } = rohStatus;
  if (status === "gesehen") return { ...rest, status };
  return Object.keys(rest).length ? rest : null;
}

/* Eindeutige Anbieterkennungen verbinden Entdecken und Mediathek. Die
   Verbindung ist orthogonal zu „gesehen“: Ein Bibliothekseintrag allein ist
   kein Beleg dafür, dass der Film bereits angesehen wurde. */
export function gleicheMediathekStatusAb(statusMap, titel, master) {
  const index = erstelleMediathekIdentitaetsIndex(master);
  let next = statusMap || {};
  const findeFilm = (t) => ordneStreamingPageTitelZu(t, index);

  for (const t of Array.isArray(titel) ? titel : []) {
    const key = streamingTitelKennung(t);
    if (!key) continue;
    const prior = streamingStatus(next,t);
    if (prior !== undefined && next[key] === undefined) {
      if (next === statusMap) next = { ...(statusMap || {}) };
      next[key] = prior;
    }
    const film = findeFilm(t);
    if (!film) {
      const bereinigt = ohneMediathekEintrag(next[key]);
      if (bereinigt !== next[key]) {
        if (next === statusMap) next = { ...(statusMap || {}) };
        if (bereinigt) next[key] = bereinigt;
        else delete next[key];
      }
      continue;
    }
    if (mediathekIdVon(next[key]) === film.id) continue;
    if (next === statusMap) next = { ...(statusMap || {}) };
    next[key] = mitMediathekEintrag(next[key], t, film.id);
  }

  for (const [watchmodeId, roh] of Object.entries(next)) {
    const mediathekId = mediathekIdVon(roh);
    if (!mediathekId) continue;
    const vorhanden = (mediathekId !== true && index.byMasterId.has(String(mediathekId)))
      || index.candidates({ watchmode_id: watchmodeId }).some((film) =>
        String(film.watchmode_id) === String(watchmodeId));
    if (vorhanden) continue;
    if (next === statusMap) next = { ...(statusMap || {}) };
    const bereinigt = ohneMediathekEintrag(roh);
    if (bereinigt) next[watchmodeId] = bereinigt;
    else delete next[watchmodeId];
  }
  return next;
}

function istSerie(t) {
  return t && (t.typ === "tv_series" || t.typ === "serie");
}

export function neuerGesehenEintrag(t, jetzt = new Date()) {
  return {
    status: "gesehen",
    typ: istSerie(t) ? "tv_series" : "movie",
    titel: t && t.titel ? t.titel : "",
    gesehen_am: jetzt.toISOString(),
  };
}

/* Persistierter Gesehen-Toggle vollständig aus dem Queue-Stand. Ein äußerer
   Render-Snapshot darf nur entscheiden, ob statt des Toggles zuerst das Modal
   gezeigt wird; unbekannte historische Zusatzfelder bleiben erhalten. */
export function toggleGesehenInStatus(statusMap, t, jetzt = new Date()) {
  const id = streamingTitelKennung(t);
  if (id == null) return statusMap;
  const roh = streamingStatus(statusMap,t);
  const next = { ...(statusMap || {}) };
  const basis = statusObjekt(roh);
  if (statusVon(roh) === "gesehen") {
    for (const alias of t?.streaming_aliases || []) delete next[alias];
    const { status: _status, gesehen_am: _gesehenAm, ...rest } = basis;
    if (Object.keys(rest).length) next[id] = rest;
    else delete next[id];
    return next;
  }
  const mediathekId = mediathekIdVon(roh);
  if (!mediathekId) return statusMap;
  next[id] = mitMediathekEintrag({ ...basis, ...neuerGesehenEintrag(t, jetzt) }, t, mediathekId);
  return next;
}
