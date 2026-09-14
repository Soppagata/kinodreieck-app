/* Persönliche Titelpins.
   Der Topf speichert nur die Identitaet, nie eine zweite Empfehlungsliste.
   Die Startansicht loest jeden Pin gegen die aktuell geladenen Bereiche auf:
   Entdecken zuerst, danach Streaming und Kino. Format 2 ergänzt ausschließlich
   ownergebundene Must-Watch-IDs; öffentliche Format-1-Pins bleiben byte- und
   verhaltenskompatibel. */

const MEDIA_TYPES = Object.freeze({
  film: "film", movie: "film",
  series: "series", serie: "series", tv: "series", tv_series: "series",
});
const ID_NAMESPACES = Object.freeze(["watchmode", "wikidata", "imdb", "tmdb", "film_at", "record"]);
export const ENTDECKEN_PINS_POT_FORMAT = "kd-entdecken-pins-v1";
export const ENTDECKEN_PINS_LEGACY_KEY = "kd:entdecken-pins:legacy-unbound";
export const ENTDECKEN_PINS_LEGACY_FORMAT = "kd-entdecken-pins-legacy-v1";

function text(value) { return String(value == null ? "" : value).trim(); }
function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
function year(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1888 && number <= new Date().getUTCFullYear() + 10
    ? number : null;
}
export function normalizeEntdeckenPinTitle(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT").replace(/[^a-z0-9]+/g, " ").trim();
}
export function normalizeEntdeckenPinType(value) {
  return MEDIA_TYPES[text(value).toLocaleLowerCase("de-AT")] || null;
}

function putId(ids, namespace, value) {
  const clean = text(value);
  if (!clean || ids[namespace]) return;
  ids[namespace] = namespace === "imdb" ? clean.toLowerCase() : clean;
}

function identityIds(entry) {
  const ids = {};
  const saved = entry?.ids || {};
  for (const namespace of ID_NAMESPACES) putId(ids, namespace, saved[namespace]);
  const external = entry?.externalIds || entry?.external_ids || {};
  putId(ids, "watchmode", positiveInteger(entry?.watchmodeId ?? entry?.watchmode_id ?? external.watchmode));
  putId(ids, "wikidata", external.wikidata ?? external.qid ?? entry?.qid ?? entry?.wikidata?.qid);
  putId(ids, "imdb", external.imdb ?? entry?.imdb_id ?? entry?.imdbId);
  putId(ids, "tmdb", external.tmdb ?? entry?.tmdb_id ?? entry?.tmdbId);
  putId(ids, "film_at", entry?.filmAtId ?? entry?.film_at_id ?? entry?.programm_ref);

  const targetId = text(entry?.targetId ?? entry?.target_id);
  const targetMatch = targetId.match(/^(watchmode|wikidata|imdb|tmdb|film-at):(.+)$/i);
  if (targetMatch) putId(ids, targetMatch[1].toLowerCase().replace("-", "_"), targetMatch[2]);
  const sourceId = text(entry?.sourceId ?? entry?.source_id);
  const sourceItemId = text(entry?.sourceItemId ?? entry?.source_item_id);
  if (sourceId && sourceItemId) putId(ids, "record", `${sourceId}|${sourceItemId}`);
  return ids;
}

function entryIdentity(entry) {
  const title = text(entry?.title ?? entry?.titel);
  const releaseYear = year(entry?.year ?? entry?.jahr ?? entry?.releaseYear);
  const type = normalizeEntdeckenPinType(entry?.type ?? entry?.typ ?? entry?.mediaType);
  if (!title || !releaseYear || !type) return null;
  return { title, normalizedTitle: normalizeEntdeckenPinTitle(title), year: releaseYear, type, ids: identityIds(entry) };
}

function primaryId(ids) {
  for (const namespace of ID_NAMESPACES) {
    if (ids?.[namespace]) return `${namespace}:${ids[namespace]}`;
  }
  return null;
}

function mustwatchPinIdentity(entry) {
  const sourceId = text(entry?.sourceId ?? entry?.source_id);
  const sourceItemId = text(entry?.sourceItemId ?? entry?.source_item_id);
  const mustwatchId = text(entry?.mustwatchId ?? (sourceId === "mustwatch" ? sourceItemId : ""));
  const ownerKey = text(entry?.pinOwnerKey ?? entry?.ownerKey);
  const title = text(entry?.title ?? entry?.titel);
  if (!mustwatchId.startsWith("mw_") || !ownerKey || !title) return null;
  return {
    mustwatchId, ownerKey, title,
    year: year(entry?.year ?? entry?.jahr ?? entry?.releaseYear),
    type: normalizeEntdeckenPinType(entry?.type ?? entry?.typ ?? entry?.mediaType),
  };
}

function createMustwatchPin(entry, now = Date.now()) {
  const identity = mustwatchPinIdentity(entry);
  if (!identity) return null;
  return Object.freeze({
    format: 2,
    kind: "mustwatch",
    pinId: `mustwatch:${encodeURIComponent(identity.ownerKey)}:${encodeURIComponent(identity.mustwatchId)}`,
    title: identity.title,
    year: identity.year,
    type: identity.type,
    ownerKey: identity.ownerKey,
    mustwatchId: identity.mustwatchId,
    ids: Object.freeze({ record: `mustwatch|${identity.mustwatchId}` }),
    pinnedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
  });
}

export function createEntdeckenPin(entry, now = Date.now()) {
  const mustwatchPin = createMustwatchPin(entry, now);
  if (mustwatchPin) return mustwatchPin;
  const identity = entryIdentity(entry);
  if (!identity?.normalizedTitle) return null;
  const stable = primaryId(identity.ids);
  return Object.freeze({
    format: 1,
    pinId: stable || `title:${identity.normalizedTitle}|${identity.year}|${identity.type}`,
    title: identity.title,
    year: identity.year,
    type: identity.type,
    ids: Object.freeze({ ...identity.ids }),
    pinnedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
  });
}

export function normalizeEntdeckenPins(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = new Map();
  for (const raw of value.slice(0, 100)) {
    if (raw?.format === 2 && raw?.kind === "mustwatch") {
      const pin = createMustwatchPin({
        title: raw.title,
        year: raw.year,
        type: raw.type,
        mustwatchId: raw.mustwatchId,
        pinOwnerKey: raw.ownerKey,
      }, raw.pinnedAt);
      if (pin && !unique.has(pin.pinId)) unique.set(pin.pinId, pin);
      continue;
    }
    if (raw?.format !== 1) continue;
    const pin = createEntdeckenPin({
      title: raw.title,
      year: raw.year,
      type: raw.type,
      ids: raw.ids,
    }, raw.pinnedAt);
    if (!pin) continue;
    const restored = Object.freeze({ ...pin, pinId: text(raw.pinId) || pin.pinId });
    if (!unique.has(restored.pinId)) unique.set(restored.pinId, restored);
  }
  return Object.freeze([...unique.values()]);
}

export function createEntdeckenPinsPot(pins, { owner, epoch = null } = {}) {
  const normalizedOwner = text(owner);
  if (!normalizedOwner) return null;
  return Object.freeze({
    format: ENTDECKEN_PINS_POT_FORMAT,
    owner: normalizedOwner,
    epoch: Number.isInteger(epoch) && epoch >= 0 ? epoch : null,
    pins: normalizeEntdeckenPins(pins),
  });
}

export function decodeEntdeckenPinsPot(value) {
  if (Array.isArray(value)) return Object.freeze({
    pins: normalizeEntdeckenPins(value), owner: null, epoch: null, legacy: true,
  });
  if (!value || value.format !== ENTDECKEN_PINS_POT_FORMAT
      || typeof value.owner !== "string" || !Array.isArray(value.pins)
      || (value.epoch !== null && (!Number.isInteger(value.epoch) || value.epoch < 0))) return null;
  return Object.freeze({
    pins: normalizeEntdeckenPins(value.pins),
    owner: text(value.owner),
    epoch: value.epoch,
    legacy: false,
  });
}

export function readEntdeckenPinsLegacy(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem?.(ENTDECKEN_PINS_LEGACY_KEY) || "[]");
    if (Array.isArray(value)) return Object.freeze({ pins: normalizeEntdeckenPins(value), owner: null });
    if (!value || value.format !== ENTDECKEN_PINS_LEGACY_FORMAT
        || !Array.isArray(value.pins) || (value.owner !== null && typeof value.owner !== "string")) {
      return Object.freeze({ pins: normalizeEntdeckenPins([]), owner: null });
    }
    return Object.freeze({
      pins: normalizeEntdeckenPins(value.pins),
      owner: text(value.owner) || null,
    });
  } catch { return Object.freeze({ pins: normalizeEntdeckenPins([]), owner: null }); }
}

/* Sichert einen noch nicht eindeutig kontogebundenen Bestand vor jedem
   Account-Refresh in einem geraetelokalen Topf. Der aktive Konto-Pull darf
   erst danach denselben Haupttopf ersetzen. */
export function preserveEntdeckenPinsLegacy(raw, { owner = null } = {}, storage = globalThis.localStorage) {
  if (raw == null) return true;
  try {
    const decoded = decodeEntdeckenPinsPot(JSON.parse(raw));
    if (!decoded) return false;
    const current = readEntdeckenPinsLegacy(storage);
    const merged = normalizeEntdeckenPins([
      ...current.pins,
      ...decoded.pins,
    ]);
    const ownerHint = text(owner) || null;
    const gebundenerOwner = current.pins.length === 0
      ? ownerHint
      : (current.owner && current.owner === ownerHint ? current.owner : null);
    const payload = JSON.stringify({
      format: ENTDECKEN_PINS_LEGACY_FORMAT,
      owner: gebundenerOwner,
      pins: merged,
    });
    storage.setItem(ENTDECKEN_PINS_LEGACY_KEY, payload);
    return storage.getItem(ENTDECKEN_PINS_LEGACY_KEY) === payload;
  } catch { return false; }
}

export function clearEntdeckenPinsLegacy(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(ENTDECKEN_PINS_LEGACY_KEY);
    return storage?.getItem?.(ENTDECKEN_PINS_LEGACY_KEY) == null;
  } catch { return false; }
}

function identitiesConflict(left, right) {
  return ID_NAMESPACES.filter((namespace) => namespace !== "record")
    .some((namespace) => left?.[namespace] && right?.[namespace]
    && left[namespace] !== right[namespace]);
}
function sharedIdentity(left, right) {
  return ID_NAMESPACES.find((namespace) => left?.[namespace] && left[namespace] === right?.[namespace]) || null;
}
function exactComposite(pinIdentity, candidateIdentity) {
  return !!pinIdentity?.normalizedTitle
    && pinIdentity.normalizedTitle === candidateIdentity?.normalizedTitle
    && pinIdentity.year === candidateIdentity?.year
    && pinIdentity.type === candidateIdentity?.type;
}

function matchCandidates(pin, candidates) {
  const pinIdentity = entryIdentity(pin);
  if (!pinIdentity) return { status: "unmatched", candidate: null };
  const rows = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({ candidate, identity: entryIdentity(candidate) }))
    .filter((row) => row.identity);
  const strong = rows.filter((row) => pinIdentity.type === row.identity.type
    && sharedIdentity(pinIdentity.ids, row.identity.ids)
    && !identitiesConflict(pinIdentity.ids, row.identity.ids));
  if (strong.length) {
    const identities = new Set(strong.map((row) => {
      const namespace = sharedIdentity(pinIdentity.ids, row.identity.ids);
      return `${namespace}:${row.identity.ids[namespace]}`;
    }));
    return identities.size === 1
      ? { status: "matched", candidate: strong[0].candidate }
      : { status: "ambiguous", candidate: null };
  }

  const exact = rows.filter((row) => exactComposite(pinIdentity, row.identity));
  if (!exact.length) return { status: "unmatched", candidate: null };
  if (exact.some((row) => identitiesConflict(pinIdentity.ids, row.identity.ids))) {
    return { status: "ambiguous", candidate: null };
  }
  const identities = new Set(exact.map((row) => primaryId(row.identity.ids) || `row:${rows.indexOf(row)}`));
  return identities.size === 1
    ? { status: "matched", candidate: exact[0].candidate }
    : { status: "ambiguous", candidate: null };
}

export function isEntdeckenPinned(pins, entry) {
  const candidate = createEntdeckenPin(entry, 0);
  if (!candidate) return false;
  if (candidate.format === 2) {
    return normalizeEntdeckenPins(pins).some((pin) => pin.format === 2
      && pin.ownerKey === candidate.ownerKey && pin.mustwatchId === candidate.mustwatchId);
  }
  return normalizeEntdeckenPins(pins).some((pin) => {
    if (pin.format !== 1) return false;
    const left = entryIdentity(pin);
    const right = entryIdentity(candidate);
    return (left.type === right.type && !!sharedIdentity(left.ids, right.ids)
      && !identitiesConflict(left.ids, right.ids))
      || (!identitiesConflict(left.ids, right.ids) && exactComposite(left, right));
  });
}

export function toggleEntdeckenPin(pins, entry, now = Date.now()) {
  const current = normalizeEntdeckenPins(pins);
  const candidate = createEntdeckenPin(entry, now);
  if (!candidate) return current;
  const exists = isEntdeckenPinned(current, candidate);
  return Object.freeze(exists
    ? current.filter((pin) => !isEntdeckenPinned([pin], candidate))
    : [...current, candidate]);
}

function recommendationDestination(pin, entry) {
  return Object.freeze({
    pinId: pin.pinId, title: entry.title ?? pin.title, year: entry.year ?? pin.year, type: pin.type,
    destination: "entdecken", label: "Entdecken", target: Object.freeze({ pinId: pin.pinId }),
  });
}
function streamingDestination(pin, entry) {
  const watchmodeId = positiveInteger(entry?.watchmode_id ?? entry?.watchmodeId);
  const ref = watchmodeId ?? (/^motn:\d{1,12}$/.test(entry?.streaming_id || "") ? entry.streaming_id : null);
  if (!ref) return null;
  const services = Array.isArray(entry?.dienste) ? entry.dienste.filter(Boolean) : [];
  return Object.freeze({
    pinId: pin.pinId, title: entry.titel ?? entry.title ?? pin.title, year: entry.jahr ?? entry.year ?? pin.year, type: pin.type,
    destination: "streaming", label: services[0] ? `${services[0]} · Streaming` : "Streaming",
    target: Object.freeze({ art: entry?.wochen_bereich || "entdecken", ref, titel: entry.titel ?? entry.title ?? pin.title }),
  });
}
function cinemaDestination(pin, entry) {
  return Object.freeze({
    pinId: pin.pinId, title: entry.titel ?? entry.title ?? pin.title, year: entry.jahr ?? entry.year ?? pin.year, type: "film",
    destination: "kino", label: "Kinoprogramm",
    target: Object.freeze({
      programm_ref: entry.programm_ref ?? entry.film_at_id ?? entry.id ?? null,
      ...(entry.film_ref != null ? { film_ref: entry.film_ref } : {}),
      titel: entry.titel ?? entry.title ?? pin.title,
    }),
  });
}
function mustwatchDestination(pin, entry) {
  return Object.freeze({
    pinId: pin.pinId,
    title: entry?.titel ?? entry?.title ?? pin.title,
    year: year(entry?.jahr ?? entry?.year) ?? pin.year,
    type: normalizeEntdeckenPinType(entry?.typ ?? entry?.type) ?? pin.type,
    destination: "mustwatch",
    label: "Must-Watch",
    target: Object.freeze({ id: pin.mustwatchId }),
  });
}

export function resolveEntdeckenPins(pins, {
  recommendations = [], streaming = [], cinema = [], mustwatch = [], pinOwnerKey = null,
  recommendationReady = false, streamingReady = false, cinemaReady = false, mustwatchReady = false,
} = {}) {
  const resolved = [];
  const discardedPinIds = [];
  const pendingPinIds = [];
  for (const pin of normalizeEntdeckenPins(pins)) {
    if (pin.format === 2 && pin.kind === "mustwatch") {
      /* Fremde Konten bleiben im geraetelokalen Topf erhalten, sind im
         aktuellen Datenkontext aber weder sichtbar noch loeschbar. */
      if (!text(pinOwnerKey) || pin.ownerKey !== text(pinOwnerKey)) {
        pendingPinIds.push(pin.pinId);
        continue;
      }
      const treffer = (Array.isArray(mustwatch) ? mustwatch : [])
        .filter((entry) => text(entry?.id) === pin.mustwatchId);
      if (treffer.length === 1) resolved.push(mustwatchDestination(pin, treffer[0]));
      else pendingPinIds.push(pin.pinId);
      continue;
    }
    const recommendation = matchCandidates(pin, recommendations);
    if (recommendation.status === "matched") {
      resolved.push(recommendationDestination(pin, recommendation.candidate));
      continue;
    }
    if (recommendation.status === "ambiguous") { pendingPinIds.push(pin.pinId); continue; }

    const streamingMatch = matchCandidates(pin, streaming);
    if (streamingMatch.status === "matched") {
      const destination = streamingDestination(pin, streamingMatch.candidate);
      if (destination) resolved.push(destination);
      else pendingPinIds.push(pin.pinId);
      continue;
    }
    if (streamingMatch.status === "ambiguous") { pendingPinIds.push(pin.pinId); continue; }

    const cinemaMatch = matchCandidates(pin, cinema);
    if (cinemaMatch.status === "matched") {
      resolved.push(cinemaDestination(pin, cinemaMatch.candidate));
      continue;
    }
    if (cinemaMatch.status === "ambiguous") { pendingPinIds.push(pin.pinId); continue; }

    pendingPinIds.push(pin.pinId);
  }
  return Object.freeze({
    resolved: Object.freeze(resolved),
    discardedPinIds: Object.freeze(discardedPinIds),
    pendingPinIds: Object.freeze(pendingPinIds),
  });
}
