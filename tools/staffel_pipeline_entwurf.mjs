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
    const folgen = positiveGanzzahl(q.episodes);
    const folgeAktuell = positiveGanzzahl(q.episode_number ?? q.last_episode_number ?? q.latest_episode?.episode_number);
    if (staffeln == null && folgen == null && folgeAktuell == null) continue;
    treffer.push({ name, staffeln, folgen, folgeAktuell });
  }
  if (!treffer.length) return null;
  const staffeln = treffer.map((q) => q.staffeln).filter(Boolean);
  const folgen = treffer.map((q) => q.folgen).filter(Boolean);
  const exakteFolgen = treffer.map((q) => q.folgeAktuell).filter(Boolean);
  const max = staffeln.length ? Math.max(...staffeln) : null;
  const maxFolgen = folgen.length ? Math.max(...folgen) : null;
  const folgeAktuell = exakteFolgen.length ? Math.max(...exakteFolgen) : null;
  return {
    ...(max != null ? { staffeln_verfuegbar: max } : {}),
    ...(maxFolgen != null ? { folgen_verfuegbar: maxFolgen } : {}),
    ...(folgeAktuell != null ? { folge_aktuell: folgeAktuell } : {}),
    staffel_dienste: [...new Set(treffer.filter((q) => (
      max != null ? q.staffeln === max : maxFolgen != null ? q.folgen === maxFolgen : q.folgeAktuell === folgeAktuell
    )).map((q) => q.name))].sort((a, b) => a.localeCompare(b, "de")),
  };
}

/* Der planmäßige Job liest die aktiven Kontobeobachtungen einmal aus der DB
   und führt sie mit einer optionalen statischen Config zusammen. Die Anzahl
   der Zeitpunkte bleibt gleich; nur die deduplizierte ID-Menge kann wachsen. */
export function verbindeBeobachteteIds(config = {}, serverRows = []) {
  const statisch = Array.isArray(config.serien_beobachten) ? config.serien_beobachten : [];
  const server = (Array.isArray(serverRows) ? serverRows : [])
    .filter((r) => r?.active !== false).map((r) => ({ watchmode_id: r?.watchmode_id }));
  const ids = [...new Set([...statisch, ...server].map((e) => positiveGanzzahl(e?.watchmode_id)).filter(Boolean))];
  return { ...config, serien_beobachten: ids.sort((a, b) => a - b).map((watchmode_id) => ({ watchmode_id })) };
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
