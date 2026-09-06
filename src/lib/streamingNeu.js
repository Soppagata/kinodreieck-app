/* Lokaler Verlauf fuer vollstaendige Streaming-Kataloglaeufe.
   Ein Lauf wird ausschliesslich durch `katalog_stand` identifiziert. Der bei
   einer blossen Neuveroeffentlichung gesetzte Payload-/DB-`stand` darf diese
   Historie weder leeren noch neu starten. */

export const STREAMING_NEU_FORMAT = 2;
export const STREAMING_NEU_KEY_PREFIX = "kd:streaming-neu:v2:";
export const STREAMING_NEU_LEGACY_KEY_PREFIX = "kd:streaming-neu:v1:";
export const STREAMING_NEU_DAUER_MS = 14 * 24 * 60 * 60 * 1000;

function text(value) { return String(value == null ? "" : value).trim(); }

function watchmodeId(entry) {
  const value = entry?.watchmode_id ?? entry?.watchmodeId;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function zeitpunkt(value) {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rawValue(raw) {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function key(prefix, owner) {
  const clean = text(owner);
  return clean ? prefix + encodeURIComponent(clean) : null;
}

export function streamingNeuStorageKey(owner) {
  return key(STREAMING_NEU_KEY_PREFIX, owner);
}

export function streamingNeuLegacyStorageKey(owner) {
  return key(STREAMING_NEU_LEGACY_KEY_PREFIX, owner);
}

export function streamingKatalogIds(titel) {
  const ids = new Set();
  for (const entry of Array.isArray(titel) ? titel : []) {
    const id = watchmodeId(entry);
    if (id != null) ids.add(id);
  }
  return Object.freeze([...ids].sort((a, b) => a - b));
}

export function streamingCoverageSignatur(dienste) {
  if (!Array.isArray(dienste)) return null;
  const namen = dienste.map(text);
  if (!namen.length || namen.some((name) => !name)) return null;
  return JSON.stringify([...new Set(namen)].sort());
}

function parseCoverage(value) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  try {
    const dienste = JSON.parse(value);
    const signatur = streamingCoverageSignatur(dienste);
    return signatur === value ? signatur : undefined;
  } catch { return undefined; }
}

function parseIds(value) {
  if (!Array.isArray(value)) return null;
  const ids = streamingKatalogIds(value.map((id) => ({ watchmode_id: id })));
  return ids.length === value.length ? ids : null;
}

function parseV1(value, owner) {
  if (value?.format !== 1 || text(value.owner) !== text(owner)
      || zeitpunkt(value.runId) == null) return null;
  const ids = parseIds(value.ids);
  if (!ids || !(value.neueIds === null || Array.isArray(value.neueIds))) return null;
  /* Der alte Erststand zeigte absichtlich den ganzen Bestand. Diese Bedeutung
     darf nicht in v2 uebernommen werden: v1 wird nur als bekannte Baseline
     migriert, niemals als Liste vermeintlich neuer Titel. */
  return Object.freeze({
    format: STREAMING_NEU_FORMAT,
    owner: text(owner),
    runId: text(value.runId),
    coverage: null,
    ids,
    neu: Object.freeze([]),
  });
}

export function parseStreamingNeuSnapshot(raw, owner) {
  const value = rawValue(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.format === 1) return parseV1(value, owner);
  const runAt = zeitpunkt(value.runId);
  if (value.format !== STREAMING_NEU_FORMAT
      || text(value.owner) !== text(owner)
      || !text(value.runId)
      || runAt == null) return null;
  const ids = parseIds(value.ids);
  const coverage = parseCoverage(value.coverage);
  if (!ids || coverage === undefined || !Array.isArray(value.neu)) return null;
  const idSet = new Set(ids);
  const seen = new Set();
  const neu = [];
  for (const entry of value.neu) {
    const id = Number(entry?.id);
    const firstSeenAt = zeitpunkt(entry?.firstSeenAt);
    if (!Number.isInteger(id) || id <= 0 || firstSeenAt == null || firstSeenAt > runAt
        || !idSet.has(id) || seen.has(id)) return null;
    seen.add(id);
    neu.push(Object.freeze({ id, firstSeenAt }));
  }
  neu.sort((a, b) => a.firstSeenAt - b.firstSeenAt || a.id - b.id);
  return Object.freeze({
    format: STREAMING_NEU_FORMAT,
    owner: text(owner),
    runId: text(value.runId),
    coverage,
    ids,
    neu: Object.freeze(neu),
  });
}

function aktiveNeueEintraege(snapshot, now, ids = snapshot?.ids || []) {
  const currentIds = new Set(ids);
  return Object.freeze((snapshot?.neu || []).filter((entry) => (
    currentIds.has(entry.id)
    && now < entry.firstSeenAt + STREAMING_NEU_DAUER_MS
  )));
}

function gleicherSnapshot(snapshot, ids, neu) {
  return snapshot.ids.length === ids.length
    && snapshot.ids.every((id, index) => id === ids[index])
    && snapshot.neu.length === neu.length
    && snapshot.neu.every((entry, index) => (
      entry.id === neu[index].id && entry.firstSeenAt === neu[index].firstSeenAt
    ));
}

function snapshotMit(snapshot, ids, neu) {
  return Object.freeze({
    format: STREAMING_NEU_FORMAT,
    owner: snapshot.owner,
    runId: snapshot.runId,
    coverage: snapshot.coverage,
    ids,
    neu,
  });
}

export function bereinigeStreamingNeuSnapshot(snapshot, now = Date.now()) {
  const aktuell = parseStreamingNeuSnapshot(snapshot, snapshot?.owner);
  const zeit = zeitpunkt(now);
  if (!aktuell || zeit == null) return null;
  const neu = aktiveNeueEintraege(aktuell, zeit);
  const next = gleicherSnapshot(aktuell, aktuell.ids, neu)
    ? aktuell
    : snapshotMit(aktuell, aktuell.ids, neu);
  return Object.freeze({ snapshot: next, geaendert: next !== aktuell });
}

/* Der erste Vollstand ist nur die Baseline. Jeder spaetere echte Kataloglauf
   fuegt die Differenz zum unmittelbar vorherigen Bestand hinzu. Schon aktive
   Eintraege behalten ihren ersten Erkennungszeitpunkt ueber weitere Laeufe. */
export function aktualisiereStreamingNeuSnapshot(vorher, {
  owner, runId, titel, dienste, now = Date.now(),
} = {}) {
  const cleanOwner = text(owner);
  const cleanRunId = text(runId);
  const runAt = zeitpunkt(cleanRunId);
  const zeit = zeitpunkt(now);
  const coverage = streamingCoverageSignatur(dienste);
  if (!cleanOwner || runAt == null || zeit == null || !Array.isArray(titel) || coverage == null) return null;

  const raw = rawValue(vorher);
  const warLegacy = raw?.format === 1;
  const alt = parseStreamingNeuSnapshot(raw, cleanOwner);
  const ids = streamingKatalogIds(titel);

  /* v1 verwendete den Publikations-`stand`, v2 den echten `katalog_stand`.
     Die beiden Zeitachsen sind nicht vergleichbar. Deshalb wird bei jeder
     v1-Migration ausnahmslos der JETZT geladene Vollkatalog zur leeren
     Baseline; weder alte IDs noch der alte runId duerfen weiterleben. */
  if (warLegacy || !alt) {
    const snapshot = Object.freeze({
      format: STREAMING_NEU_FORMAT,
      owner: cleanOwner,
      runId: cleanRunId,
      coverage,
      ids,
      neu: Object.freeze([]),
    });
    return Object.freeze({
      snapshot, geaendert: true, initialisiert: true,
      migriert: warLegacy,
      coverageRebase: false,
    });
  }

  const altRunAt = zeitpunkt(alt.runId);
  const coverageGeaendert = alt.coverage !== coverage;
  /* Ein älterer Payload darf auch mit anderer Coverage niemals die neuere
     Baseline zurückdrehen. Altes v2 ohne Signatur darf beim identischen Stand
     einmalig still auf die aktuelle Coverage migrieren. */
  if (runAt < altRunAt || (runAt === altRunAt && coverageGeaendert && alt.coverage != null)) {
    const neu = aktiveNeueEintraege(alt, zeit);
    const snapshot = gleicherSnapshot(alt, alt.ids, neu)
      ? alt
      : snapshotMit(alt, alt.ids, neu);
    return Object.freeze({ snapshot, geaendert: snapshot !== alt, initialisiert: false });
  }
  if (coverageGeaendert) {
    const snapshot = Object.freeze({
      format: STREAMING_NEU_FORMAT,
      owner: cleanOwner,
      runId: cleanRunId,
      coverage,
      ids,
      neu: Object.freeze([]),
    });
    return Object.freeze({
      snapshot, geaendert: true, initialisiert: true,
      migriert: alt.coverage == null,
      coverageRebase: true,
    });
  }
  /* Derselbe oder ein aelterer Cache-Stand darf die Baseline nicht mit einer
     moeglicherweise gefilterten bzw. rueckwaerts gelaufenen Menge ersetzen.
     Ablauf wird trotzdem anhand der Uhr bereinigt. */
  if (cleanRunId === alt.runId || (altRunAt != null && runAt <= altRunAt)) {
    const neu = aktiveNeueEintraege(alt, zeit);
    const snapshot = gleicherSnapshot(alt, alt.ids, neu)
      ? alt
      : snapshotMit(alt, alt.ids, neu);
    return Object.freeze({
      snapshot,
      geaendert: snapshot !== alt,
      initialisiert: false,
    });
  }

  const alteIds = new Set(alt.ids);
  const neu = [...aktiveNeueEintraege(alt, zeit, ids)];
  const schonNeu = new Set(neu.map((entry) => entry.id));
  for (const id of ids) {
    if (alteIds.has(id) || schonNeu.has(id)) continue;
    if (zeit >= runAt + STREAMING_NEU_DAUER_MS) continue;
    neu.push(Object.freeze({ id, firstSeenAt: runAt }));
  }
  neu.sort((a, b) => a.firstSeenAt - b.firstSeenAt || a.id - b.id);
  const snapshot = Object.freeze({
    format: STREAMING_NEU_FORMAT,
    owner: cleanOwner,
    runId: cleanRunId,
    coverage,
    ids,
    neu: Object.freeze(neu),
  });
  return Object.freeze({ snapshot, geaendert: true, initialisiert: false });
}

export function streamingNeuIds(snapshot, now = Date.now()) {
  const zeit = zeitpunkt(now);
  if (!snapshot || zeit == null) return Object.freeze([]);
  return Object.freeze(aktiveNeueEintraege(snapshot, zeit).map((entry) => entry.id));
}

export function naechsterStreamingNeuAblauf(snapshot, now = Date.now()) {
  const zeit = zeitpunkt(now);
  if (!snapshot || zeit == null) return null;
  let next = null;
  for (const entry of aktiveNeueEintraege(snapshot, zeit)) {
    const ablauf = entry.firstSeenAt + STREAMING_NEU_DAUER_MS;
    if (next == null || ablauf < next) next = ablauf;
  }
  return next;
}
