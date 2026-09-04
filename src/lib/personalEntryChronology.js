const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export const RECENT_MASTER_MARKER = "zuletzt_ticker";
export const RECENT_MASTER_LIMIT = 5;

function marker(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= RECENT_MASTER_LIMIT
    ? number
    : null;
}

function withoutMarker(entry) {
  const { [RECENT_MASTER_MARKER]: _ignored, ...rest } = entry || {};
  return rest;
}

/* Ein echter Anlagevorgang schiebt ausschließlich bereits markierte neue
   Einträge weiter. Altbestand wird nie aus Reihenfolge oder Zeitstempeln
   hergeleitet. Bei Batches ist das zuletzt angehängte Element das neueste. */
export function markNewPersonalMasterEntries(master = [], newEntries = []) {
  const additions = Array.isArray(newEntries) ? newEntries : [];
  if (!additions.length) return Array.isArray(master) ? master : [];
  const shift = additions.length;
  const previous = (Array.isArray(master) ? master : []).map((entry) => {
    const current = marker(entry?.[RECENT_MASTER_MARKER]);
    if (current == null) return withoutMarker(entry);
    const next = current + shift;
    return next <= RECENT_MASTER_LIMIT
      ? { ...withoutMarker(entry), [RECENT_MASTER_MARKER]: next }
      : withoutMarker(entry);
  });
  const markedAdditions = additions.map((entry, index) => {
    const next = additions.length - index;
    return next <= RECENT_MASTER_LIMIT
      ? { ...withoutMarker(entry), [RECENT_MASTER_MARKER]: next }
      : withoutMarker(entry);
  });
  return [...previous, ...markedAdditions];
}

/* Bearbeiten bewahrt den Marker des bestehenden Eintrags; ein übergebenes
   Feld kann weder einen Altbestand einschleusen noch einen Marker umnummerieren.
   Historische erstellt_am-Werte bleiben als fremde Bestandsdaten unverändert,
   werden für diese Funktion aber nirgends gelesen. */
export function mergePersonalMasterEntry(existing, changes) {
  const {
    [RECENT_MASTER_MARKER]: _ignoredMarker,
    erstellt_am: _ignoredCreatedAt,
    ...safeChanges
  } = changes || {};
  const merged = { ...(existing || {}), ...safeChanges };
  if (own(existing, RECENT_MASTER_MARKER)) {
    const current = marker(existing[RECENT_MASTER_MARKER]);
    if (current != null) merged[RECENT_MASTER_MARKER] = current;
    else delete merged[RECENT_MASTER_MARKER];
  } else delete merged[RECENT_MASTER_MARKER];
  if (own(existing, "erstellt_am")) merged.erstellt_am = existing.erstellt_am;
  else delete merged.erstellt_am;
  return merged;
}

const label = (entry) => entry?.titel || "Ohne Titel";

/* Dashboard-Projektion: ausschließlich explizite 1–5-Marker, neueste zuerst.
   Weder Must-Watch/Merkliste noch Zeitstempel oder Altbestandsreihenfolge sind
   Eingaben dieser Projektion. */
export function projectRecentPersonalEntries({ master = [], limit = RECENT_MASTER_LIMIT } = {}) {
  const safeLimit = Number.isInteger(limit) && limit >= 0
    ? Math.min(limit, RECENT_MASTER_LIMIT)
    : RECENT_MASTER_LIMIT;
  return (Array.isArray(master) ? master : [])
    .map((entry, index) => ({ entry, index, ticker: marker(entry?.[RECENT_MASTER_MARKER]) }))
    .filter(({ ticker }) => ticker != null)
    .sort((left, right) => left.ticker - right.ticker || right.index - left.index)
    .slice(0, safeLimit)
    .map(({ entry, ticker, index }) => ({
      key: `MASTER-NEU:${String(entry?.id ?? index)}`,
      label: label(entry),
      target: "mediathek",
      ref: entry?.id ?? null,
      ticker,
    }));
}
