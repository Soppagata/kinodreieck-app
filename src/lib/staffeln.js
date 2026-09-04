/* Lokaler Gesehen- und Mediathekstatus für Streamingtitel. Alte String-Status
   bleiben lesbar; historische Zusatzfelder werden beim Umschalten bewahrt. */

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
  const filme = Array.isArray(master) ? master : [];
  let next = statusMap || {};
  const findeFilm = (t) => filme.find((film) => (
    t.watchmode_id != null && film.watchmode_id != null
    && String(film.watchmode_id) === String(t.watchmode_id)
  ) || (
    t.imdb_id && film.imdb_id && String(film.imdb_id) === String(t.imdb_id)
  ) || (
    t.tmdb_id && film.tmdb_id && String(film.tmdb_id) === String(t.tmdb_id)
  ));

  for (const t of Array.isArray(titel) ? titel : []) {
    const film = findeFilm(t);
    if (!film || mediathekIdVon(next[t.watchmode_id]) === film.id) continue;
    if (next === statusMap) next = { ...(statusMap || {}) };
    next[t.watchmode_id] = mitMediathekEintrag(next[t.watchmode_id], t, film.id);
  }

  for (const [watchmodeId, roh] of Object.entries(next)) {
    const mediathekId = mediathekIdVon(roh);
    if (!mediathekId) continue;
    const vorhanden = filme.some((film) => (
      mediathekId !== true && film.id != null && String(film.id) === String(mediathekId)
    ) || String(film.watchmode_id) === String(watchmodeId));
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
  const id = t?.watchmode_id;
  if (id == null) return statusMap;
  const roh = statusMap?.[id];
  const next = { ...(statusMap || {}) };
  const basis = statusObjekt(roh);
  if (statusVon(roh) === "gesehen") {
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
