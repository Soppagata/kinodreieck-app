const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function canonicalIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("Ein persönlicher Erstellzeitpunkt muss ein gültiges Datum sein.");
  }
  return date.toISOString();
}

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/* Der Zeitpunkt beschreibt die Aufnahme in die persönliche Masterliste. Ein
   von außen mitgelieferter Wert darf diesen lokalen Vorgang nicht vortäuschen. */
export function stampPersonalMasterEntry(entry, createdAt = new Date()) {
  return { ...(entry || {}), erstellt_am: canonicalIso(createdAt) };
}

/* Normale Bearbeitungen dürfen den einmal vergebenen Zeitpunkt weder ersetzen
   noch löschen. Legacy-Einträge bleiben dabei ehrlich ohne erfundenes Datum. */
export function mergePersonalMasterEntry(existing, changes) {
  const { erstellt_am: _ignored, ...safeChanges } = changes || {};
  const merged = { ...(existing || {}), ...safeChanges };
  if (own(existing, "erstellt_am")) merged.erstellt_am = existing.erstellt_am;
  else delete merged.erstellt_am;
  return merged;
}

const label = (entry) => `${entry?.titel || "Ohne Titel"}${entry?.jahr ? ` (${entry.jahr})` : ""}`;

/* Belegte Zeitpunkte werden bereichsübergreifend echt sortiert. Alte
   Masterlisten besitzen keinen historischen Zeitvertrag; ihre stabile
   Einfügereihenfolge bleibt deshalb separat und ausdrücklich als Legacy
   sichtbar, statt mit erfundenen Daten in die Chronik gemischt zu werden. */
export function projectRecentPersonalEntries({
  master = [], mustwatch = [], merkliste = [], limit = 5,
} = {}) {
  const dated = [];
  let sequence = 0;
  const addDated = (entry, source, value, ref, target) => {
    const time = timestamp(value);
    if (time == null) return;
    dated.push({
      key: `${source}:${String(ref)}`,
      label: label(entry),
      source,
      target,
      ref,
      time,
      sequence: sequence++,
    });
  };

  for (const entry of master || []) {
    addDated(entry, "MASTER", entry?.erstellt_am, entry?.id, "mediathek");
  }
  for (const entry of mustwatch || []) {
    addDated(entry, "MUST-WATCH", entry?.erstellt_am, entry?.id, "mediathek");
  }
  for (const entry of merkliste || []) {
    addDated(entry, "MERKLISTE", entry?.hinzugefuegt_am, entry?.watchmode_id, "streaming");
  }

  const safeLimit = Number.isInteger(limit) && limit >= 0 ? limit : 5;
  dated.sort((left, right) => right.time - left.time || left.sequence - right.sequence);

  const legacyMaster = (master || [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => timestamp(entry?.erstellt_am) == null)
    .reverse()
    .slice(0, safeLimit)
    .map(({ entry, index }) => ({
      key: `MASTER-LEGACY:${String(entry?.id ?? index)}`,
      label: label(entry),
      source: "MASTER",
      target: "mediathek",
      ref: entry?.id ?? null,
      legacyIndex: index,
    }));

  return { dated: dated.slice(0, safeLimit), legacyMaster };
}
