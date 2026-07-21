/* Deterministischer Staffel-Abgleich.
   Der Katalog liefert Staffelstände nur für ausdrücklich beobachtete Serien.
   Fehlende/unklare Werte sind immer folgenlos; alte String-Status bleiben lesbar. */

export function statusVon(wert) {
  if (typeof wert === "string") return wert;
  return wert && typeof wert === "object" && typeof wert.status === "string" ? wert.status : null;
}

export function staffelzahl(wert) {
  const n = Number(wert);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function istSerie(t) {
  return t && (t.typ === "tv_series" || t.typ === "serie");
}

export function neuerGesehenEintrag(t, jetzt = new Date()) {
  const aktuell = staffelzahl(t && t.staffeln_verfuegbar);
  return {
    status: "gesehen",
    typ: "tv_series",
    titel: t && t.titel ? t.titel : "",
    gesehen_am: jetzt.toISOString(),
    ...(aktuell != null ? { staffel_bestaetigt: aktuell } : {}),
  };
}

export function initialisiereStaffelstaende(statusMap, titel, jetzt = new Date()) {
  const liste = Array.isArray(titel) ? titel : [];
  const katalog = new Map(liste.map((t) => [String(t.watchmode_id), t]));
  let next = statusMap || {};
  let geaendert = false;

  for (const [id, roh] of Object.entries(statusMap || {})) {
    if (statusVon(roh) !== "gesehen") continue;
    const t = katalog.get(String(id));
    if (!istSerie(t)) continue;
    const aktuell = staffelzahl(t.staffeln_verfuegbar);
    const bestaetigt = staffelzahl(roh && typeof roh === "object" ? roh.staffel_bestaetigt : null);
    if (aktuell == null || bestaetigt != null) continue;
    if (!geaendert) { next = { ...(statusMap || {}) }; geaendert = true; }
    const basis = roh && typeof roh === "object" ? roh : { status: "gesehen" };
    next[id] = {
      ...basis,
      status: "gesehen",
      typ: basis.typ || "tv_series",
      titel: basis.titel || t.titel || "",
      gesehen_am: basis.gesehen_am || jetzt.toISOString(),
      staffel_bestaetigt: aktuell,
    };
  }
  return next;
}

export function staffelHinweis(t, rohStatus) {
  if (!istSerie(t) || statusVon(rohStatus) !== "gesehen") return null;
  const aktuell = staffelzahl(t.staffeln_verfuegbar);
  const bestaetigt = staffelzahl(rohStatus && typeof rohStatus === "object" ? rohStatus.staffel_bestaetigt : null);
  if (aktuell == null || bestaetigt == null || aktuell <= bestaetigt) return null;
  return {
    watchmode_id: t.watchmode_id,
    titel: t.titel,
    staffel_verfuegbar: aktuell,
    staffel_bestaetigt: bestaetigt,
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
  if (aktuell == null || statusVon(rohStatus) !== "gesehen") return rohStatus;
  const basis = rohStatus && typeof rohStatus === "object" ? rohStatus : neuerGesehenEintrag(t, jetzt);
  const alt = staffelzahl(basis.staffel_bestaetigt);
  return {
    ...basis,
    status: "gesehen",
    typ: basis.typ || "tv_series",
    titel: basis.titel || (t && t.titel) || "",
    staffel_bestaetigt: alt == null ? aktuell : Math.max(alt, aktuell),
    staffel_bestaetigt_am: jetzt.toISOString(),
  };
}

export function serienBeobachten(statusMap, titel) {
  const katalog = new Map((Array.isArray(titel) ? titel : []).map((t) => [String(t.watchmode_id), t]));
  const aus = [];
  for (const [id, roh] of Object.entries(statusMap || {})) {
    if (statusVon(roh) !== "gesehen") continue;
    const t = katalog.get(String(id));
    const typ = roh && typeof roh === "object" ? roh.typ : t && t.typ;
    if (typ !== "tv_series" && typ !== "serie") continue;
    const watchmodeId = Number(id);
    if (!Number.isInteger(watchmodeId) || watchmodeId <= 0) continue;
    const bestaetigt = staffelzahl(roh && typeof roh === "object" ? roh.staffel_bestaetigt : null);
    aus.push({ watchmode_id: watchmodeId, ...(bestaetigt != null ? { staffel_bestaetigt: bestaetigt } : {}) });
  }
  return aus.sort((a, b) => a.watchmode_id - b.watchmode_id);
}
