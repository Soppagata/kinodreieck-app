/* PHASE-4-ENTWURF — absichtlich NICHT an streaming_auto/build_streaming_ansicht
   verdrahtet. Der reale AT-Payload muss nach der Beweiswoche mit einem von Max
   freigegebenen Spike bestätigt werden. Bis dahin wird nur mit Fixtures getestet. */

const TAG = 86400000;

function positiveGanzzahl(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export function cacheGueltig(e, jetzt = Date.now(), ttlTage = 2) {
  if (!e || !e.geprueft_am) return false;
  const t = new Date(e.geprueft_am).getTime();
  return Number.isFinite(t) && jetzt - t < ttlTage * TAG;
}

export function staffelstandAusQuellen(quellen, ausgewaehlt, setup = {}) {
  const erlaubte = new Set(Array.isArray(ausgewaehlt) ? ausgewaehlt : []);
  const namenById = new Map((setup.quellen_at || []).map((q) => [Number(q.id), q.name]));
  const treffer = [];
  for (const q of Array.isArray(quellen) ? quellen : []) {
    if (q && q.region && q.region !== "AT") continue;
    const name = q && (namenById.get(Number(q.source_id)) || q.name);
    if (!name || !erlaubte.has(name)) continue;
    const staffeln = positiveGanzzahl(q.seasons);
    if (staffeln == null) continue;
    treffer.push({ name, staffeln });
  }
  if (!treffer.length) return null;
  const max = Math.max(...treffer.map((q) => q.staffeln));
  return {
    staffeln_verfuegbar: max,
    staffel_dienste: [...new Set(treffer.filter((q) => q.staffeln === max).map((q) => q.name))].sort((a, b) => a.localeCompare(b, "de")),
  };
}

export async function pruefeBeobachteteSerien({
  config, setup, cache = {}, holeQuellen, quotaGuard = () => true,
  jetzt = new Date(), cacheTage = 2,
}) {
  if (typeof holeQuellen !== "function") throw new Error("holeQuellen-Funktion fehlt");
  const ids = [...new Set((config && Array.isArray(config.serien_beobachten) ? config.serien_beobachten : [])
    .map((e) => positiveGanzzahl(e && e.watchmode_id)).filter(Boolean))];
  const neueCache = { ...cache };
  const staende = {};
  const fehler = [];
  const offen = [];

  for (const id of ids) {
    const c = cache[id];
    if (cacheGueltig(c, jetzt.getTime(), cacheTage)) {
      if (c.wert) staende[id] = c.wert;
    } else offen.push(id);
  }

  if (offen.length && !quotaGuard(`Staffelstände (${offen.length} Serien)`)) {
    return { staende, cache: neueCache, fehler: ["Quota-Guard hat den Staffel-Abgleich gestoppt."], calls: 0 };
  }

  let calls = 0;
  for (const id of offen) {
    try {
      const payload = await holeQuellen(id, { regions: "AT" });
      calls++;
      const roh = staffelstandAusQuellen(payload, config.quellen, setup);
      const wert = roh ? { ...roh, staffelstand_geprueft_am: jetzt.toISOString() } : null;
      neueCache[id] = { geprueft_am: jetzt.toISOString(), wert };
      if (wert) staende[id] = wert;
    } catch (e) {
      calls++;
      fehler.push({ watchmode_id: id, meldung: e && e.message ? e.message : String(e) });
    }
  }
  return { staende, cache: neueCache, fehler, calls };
}

export function reichereBeobachteteSerienAn(titel, staende) {
  return (Array.isArray(titel) ? titel : []).map((t) => {
    const stand = t && staende && staende[t.watchmode_id];
    return stand ? { ...t, ...stand } : t;
  });
}
