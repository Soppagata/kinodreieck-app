/* Deterministischer Staffel-Abgleich.
   Der Katalog liefert Staffelstände nur für ausdrücklich beobachtete Serien.
   Fehlende/unklare Werte sind immer folgenlos; alte String-Status bleiben lesbar. */

export function statusVon(wert) {
  if (typeof wert === "string") return wert;
  return wert && typeof wert === "object" && typeof wert.status === "string" ? wert.status : null;
}

export function mediathekIdVon(wert) {
  if (wert === "erstellt") return true;
  return wert && typeof wert === "object" && wert.mediathek_id ? wert.mediathek_id : null;
}

export function istBeobachtet(wert) {
  return !!(wert && typeof wert === "object" && wert.beobachtet === true);
}

function statusObjekt(wert) {
  if (wert && typeof wert === "object") return { ...wert };
  return typeof wert === "string" ? { status: wert } : {};
}

export function mitMediathekEintrag(rohStatus, t, mediathekId, jetzt = new Date()) {
  const basis = statusObjekt(rohStatus);
  return {
    ...basis,
    status: statusVon(rohStatus) === "gesehen" ? "gesehen" : "erstellt",
    mediathek_id: mediathekId,
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

export function staffelzahl(wert) {
  const n = Number(wert);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function folgenzahl(wert) {
  const n = Number(wert);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function katalogFolgenstand(t) {
  return folgenzahl(t && (t.folgen_verfuegbar ?? t.letzte_folge?.gesamtfolge));
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

/* „Beobachten“ ist ein eigener Pin und ausdrücklich unabhängig von „gesehen“.
   Beim Setzen wird der aktuelle Katalogstand still als Alarm-Basis übernommen,
   damit nicht sofort ein alter Stand als neue Staffel/Folge gemeldet wird. */
export function setzeSerienBeobachtung(rohStatus, t, aktiv = true, jetzt = new Date()) {
  if (!istSerie(t)) return rohStatus;
  const basis = statusObjekt(rohStatus);
  if (aktiv) {
    const aktuell = staffelzahl(t && t.staffeln_verfuegbar);
    const folgen = katalogFolgenstand(t);
    return {
      ...basis,
      beobachtet: true,
      beobachtet_am: basis.beobachtet_am || jetzt.toISOString(),
      typ: basis.typ || "tv_series",
      titel: basis.titel || t.titel || "",
      ...(aktuell != null ? { staffel_bestaetigt: aktuell, staffel_alarm_basis: aktuell } : {}),
      ...(folgen != null ? { folgen_alarm_basis: folgen } : {}),
    };
  }
  const {
    beobachtet: _beobachtet, beobachtet_am: _beobachtetAm,
    staffel_bestaetigt: _staffelBestaetigt, staffel_alarm_basis: _staffelBasis,
    folgen_alarm_basis: _folgenBasis, staffel_bestaetigt_am: _bestaetigtAm,
    letzter_staffelsprung: _sprung, ...rest
  } = basis;
  if (!rest.status && !rest.mediathek_id) return null;
  return rest;
}

export function initialisiereStaffelstaende(statusMap, titel, jetzt = new Date()) {
  const liste = Array.isArray(titel) ? titel : [];
  const katalog = new Map(liste.map((t) => [String(t.watchmode_id), t]));
  let next = statusMap || {};
  let geaendert = false;

  for (const [id, roh] of Object.entries(statusMap || {})) {
    if (!istBeobachtet(roh)) continue;
    const t = katalog.get(String(id));
    if (!istSerie(t)) continue;
    const aktuell = staffelzahl(t.staffeln_verfuegbar);
    const folgen = katalogFolgenstand(t);
    const bestaetigt = staffelzahl(roh && typeof roh === "object" ? (roh.staffel_alarm_basis ?? roh.staffel_bestaetigt) : null);
    const folgenBasis = folgenzahl(roh && typeof roh === "object" ? roh.folgen_alarm_basis : null);
    if ((aktuell == null || bestaetigt != null) && (folgen == null || folgenBasis != null)) continue;
    if (!geaendert) { next = { ...(statusMap || {}) }; geaendert = true; }
    const basis = roh && typeof roh === "object" ? roh : { status: "gesehen" };
    next[id] = {
      ...basis,
      beobachtet: true,
      typ: basis.typ || "tv_series",
      titel: basis.titel || t.titel || "",
      ...(aktuell != null ? { staffel_bestaetigt: aktuell, staffel_alarm_basis: aktuell } : {}),
      ...(folgen != null ? { folgen_alarm_basis: folgen } : {}),
    };
  }
  return next;
}

export function staffelHinweis(t, rohStatus) {
  if (!istSerie(t) || !istBeobachtet(rohStatus)) return null;
  const aktuell = staffelzahl(t.staffeln_verfuegbar);
  const folgen = katalogFolgenstand(t);
  const bestaetigt = staffelzahl(rohStatus && typeof rohStatus === "object" ? (rohStatus.staffel_alarm_basis ?? rohStatus.staffel_bestaetigt) : null);
  const folgenBasis = folgenzahl(rohStatus && typeof rohStatus === "object" ? rohStatus.folgen_alarm_basis : null);
  const staffelNeu = aktuell != null && bestaetigt != null && aktuell > bestaetigt;
  const folgenNeu = folgen != null && folgenBasis != null && folgen > folgenBasis;
  if (!staffelNeu && !folgenNeu) return null;
  return {
    watchmode_id: t.watchmode_id,
    titel: t.titel,
    staffel_verfuegbar: aktuell,
    staffel_bestaetigt: bestaetigt,
    staffel_neu: staffelNeu,
    folgen_verfuegbar: folgen,
    folgen_bestaetigt: folgenBasis,
    folgen_neu: folgenNeu,
    folge_aktuell: folgenzahl(t.folge_aktuell ?? t.letzte_folge?.episode_number ?? t.letzte_folge?.nummer),
    letzte_folge: t.letzte_folge || null,
    dienste: Array.isArray(t.staffel_dienste) ? t.staffel_dienste.filter(Boolean) : [],
    geprueft_am: t.staffelstand_geprueft_am || null,
  };
}

export function neueStaffeln(titel, statusMap) {
  return (Array.isArray(titel) ? titel : [])
    .map((t) => staffelHinweis(t, statusMap && statusMap[t.watchmode_id]))
    .filter(Boolean)
    .sort((a, b) => (a.titel || "").localeCompare(b.titel || "", "de"));
}

export function bestaetigeStaffel(rohStatus, t, jetzt = new Date()) {
  const aktuell = staffelzahl(t && t.staffeln_verfuegbar);
  const folgen = katalogFolgenstand(t);
  if ((aktuell == null && folgen == null) || !istBeobachtet(rohStatus)) return rohStatus;
  const basis = statusObjekt(rohStatus);
  const alt = staffelzahl(basis.staffel_alarm_basis ?? basis.staffel_bestaetigt);
  const altFolgen = folgenzahl(basis.folgen_alarm_basis);
  const neueStaffel = aktuell == null ? alt : (alt == null ? aktuell : Math.max(alt, aktuell));
  const neueFolgen = folgen == null ? altFolgen : (altFolgen == null ? folgen : Math.max(altFolgen, folgen));
  return {
    ...basis,
    beobachtet: true,
    typ: basis.typ || "tv_series",
    titel: basis.titel || (t && t.titel) || "",
    ...(neueStaffel != null ? { staffel_bestaetigt: neueStaffel, staffel_alarm_basis: neueStaffel } : {}),
    ...(neueFolgen != null ? { folgen_alarm_basis: neueFolgen } : {}),
    staffel_bestaetigt_am: jetzt.toISOString(),
    letzter_staffelsprung: {
      von_staffel: alt, zu_staffel: neueStaffel,
      von_folgen: altFolgen, zu_folgen: neueFolgen,
      bestaetigt_am: jetzt.toISOString(),
    },
  };
}

export function serienBeobachten(statusMap, titel) {
  const katalog = new Map((Array.isArray(titel) ? titel : []).map((t) => [String(t.watchmode_id), t]));
  const aus = [];
  for (const [id, roh] of Object.entries(statusMap || {})) {
    if (!istBeobachtet(roh)) continue;
    const t = katalog.get(String(id));
    const typ = roh && typeof roh === "object" ? roh.typ : t && t.typ;
    if (typ !== "tv_series" && typ !== "serie") continue;
    const watchmodeId = Number(id);
    if (!Number.isInteger(watchmodeId) || watchmodeId <= 0) continue;
    const bestaetigt = staffelzahl(roh && typeof roh === "object" ? (roh.staffel_alarm_basis ?? roh.staffel_bestaetigt) : null);
    const folgen = folgenzahl(roh && typeof roh === "object" ? roh.folgen_alarm_basis : null);
    aus.push({ watchmode_id: watchmodeId,
      ...(bestaetigt != null ? { staffel_bestaetigt: bestaetigt } : {}),
      ...(folgen != null ? { folgen_bestaetigt: folgen } : {}),
    });
  }
  return aus.sort((a, b) => a.watchmode_id - b.watchmode_id);
}

export function beobachteteSerien(statusMap, titel) {
  const katalog = new Map((Array.isArray(titel) ? titel : []).map((t) => [String(t.watchmode_id), t]));
  return serienBeobachten(statusMap, titel).map((beobachtung) => {
    const t = katalog.get(String(beobachtung.watchmode_id)) || {};
    const roh = statusMap && statusMap[beobachtung.watchmode_id];
    return {
      ...t,
      ...beobachtung,
      titel: t.titel || (roh && typeof roh === "object" ? roh.titel : "") || `Serie ${beobachtung.watchmode_id}`,
      status: roh,
    };
  }).sort((a, b) => String(a.titel).localeCompare(String(b.titel), "de"));
}
