/* Lokaler Verlauf fuer den zuletzt vollstaendig geladenen Streaming-Katalog.
   Die Run-Identitaet kommt ausschliesslich aus `kd_catalog.stand` (Fallback
   updated_at) der vollstaendigen streaming_entdecken-Zeile. Filter, Sortierung
   und Renderzyklen koennen deshalb keinen neuen Lauf vortaeuschen. */

export const STREAMING_NEU_FORMAT = 1;
export const STREAMING_NEU_KEY_PREFIX = "kd:streaming-neu:v1:";

function text(value) { return String(value == null ? "" : value).trim(); }

function watchmodeId(entry) {
  const value = entry?.watchmode_id ?? entry?.watchmodeId;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function streamingNeuStorageKey(owner) {
  const clean = text(owner);
  return clean ? STREAMING_NEU_KEY_PREFIX + encodeURIComponent(clean) : null;
}

export function streamingKatalogIds(titel) {
  const ids = new Set();
  for (const entry of Array.isArray(titel) ? titel : []) {
    const id = watchmodeId(entry);
    if (id != null) ids.add(id);
  }
  return Object.freeze([...ids].sort((a, b) => a - b));
}

export function parseStreamingNeuSnapshot(raw, owner) {
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.format !== STREAMING_NEU_FORMAT
      || text(value.owner) !== text(owner)
      || !text(value.runId)
      || !Array.isArray(value.ids)
      || !(value.neueIds === null || Array.isArray(value.neueIds))) return null;
  const ids = streamingKatalogIds(value.ids.map((id) => ({ watchmode_id: id })));
  if (ids.length !== value.ids.length) return null;
  const idSet = new Set(ids);
  const neueIds = value.neueIds === null
    ? null
    : streamingKatalogIds(value.neueIds.map((id) => ({ watchmode_id: id })))
      .filter((id) => idSet.has(id));
  if (value.neueIds !== null && neueIds.length !== value.neueIds.length) return null;
  return Object.freeze({
    format: STREAMING_NEU_FORMAT,
    owner: text(owner),
    runId: text(value.runId),
    ids,
    neueIds: neueIds === null ? null : Object.freeze(neueIds),
  });
}

/* Erstbestand: alle Titel sind neu. Folgestand: nur IDs, die im unmittelbar
   zuvor geladenen Vollstand fehlten. Derselbe Run bleibt byte-stabil; selbst
   eine versehentlich uebergebene Filtermenge darf ihn nicht umschreiben. */
export function aktualisiereStreamingNeuSnapshot(vorher, {
  owner, runId, titel,
} = {}) {
  const cleanOwner = text(owner);
  const cleanRunId = text(runId);
  if (!cleanOwner || !cleanRunId || !Array.isArray(titel)) return null;
  const alt = parseStreamingNeuSnapshot(vorher, cleanOwner);
  if (alt?.runId === cleanRunId) return Object.freeze({ snapshot: alt, geaendert: false });
  const ids = streamingKatalogIds(titel);
  const alteIds = new Set(alt?.ids || []);
  const neueIds = alt ? ids.filter((id) => !alteIds.has(id)) : null;
  const snapshot = Object.freeze({
    format: STREAMING_NEU_FORMAT,
    owner: cleanOwner,
    runId: cleanRunId,
    ids,
    neueIds: neueIds === null ? null : Object.freeze(neueIds),
  });
  return Object.freeze({ snapshot, geaendert: true });
}

export function streamingNeuIds(snapshot) {
  if (!snapshot) return Object.freeze([]);
  return snapshot.neueIds === null ? snapshot.ids : snapshot.neueIds;
}
