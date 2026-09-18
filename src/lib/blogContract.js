/* Gemeinsamer v1-Vertrag fuer die anonyme Blogveroeffentlichung.
   Dieses Modul bleibt absichtlich klein: Konstanten, Fail-closed-Capability,
   UI-Intent und die eine leserseitige Referenzprojektion. Netzwerk, Storage,
   Matching und React-State gehoeren den jeweiligen Paketen. */

export const BLOG_LEGACY_CONTRACT_VERSION = "blog-publication-v1";
export const BLOG_CONTRACT_VERSION = "blog-publication-v2";
export const BLOG_LEGACY_MAX_REFERENCES = 15;
export const BLOG_MAX_REFERENCES = 50;
export const BLOG_PUBLICATION_MAX_BYTES = 128 * 1024;
export const BLOG_PRIVATE_STORE_MAX_BYTES = 1024 * 1024;
export const BLOG_LIST_DEFAULT_LIMIT = 20;
export const BLOG_LIST_MAX_LIMIT = 50;
export const BLOG_NEUTRAL_AUTHOR = "Ohne Namensangabe";

/* IDs aus dem vorhandenen zentralen Streaming-Backend. Das Blog fuehrt keine
   zweite Namens- oder Aliasliste ein. */
export const BLOG_STREAMING_SOURCE_IDS = Object.freeze([
  "netflix", "prime", "disney", "apple", "hbo", "paramount", "mubi",
  "crunchyroll", "rtl",
]);

export const BLOG_IDENTITY_NAMESPACES = Object.freeze([
  "imdb", "tmdb", "watchmode", "film_at",
]);

export const BLOG_RPC = Object.freeze({
  capability: "kd_blog_publication_capabilities_v2",
  publish: "kd_publish_blog_v2",
  update: "kd_update_blog_publication_v2",
  withdraw: "kd_withdraw_blog_publication_v2",
  ownerReadback: "kd_read_own_blog_publication_v2",
  list: "kd_list_shared_articles_v2",
  legacyList: "kd_list_shared_articles",
  legacyClaim: "kd_claim_shared_article",
});

export const BLOG_REFERENCE_RESOLUTION = Object.freeze({
  MATCHED: "matched",
  NOT_FOUND: "not_found",
  AMBIGUOUS: "ambiguous",
  UNCHECKED: "unchecked",
  ERROR: "error",
});

export const BLOG_SOURCE_STATUS = Object.freeze({
  CHECKED: "checked",
  UNCHECKED: "unchecked",
  ERROR: "error",
});

export const BLOG_REFERENCE_VIEW = Object.freeze({
  AVAILABLE: "available",
  REDLINK: "redlink",
  UNCHECKED: "unchecked",
});

export const BLOG_PUBLICATION_DISPLAY = Object.freeze({
  PRIVATE: "private",
  PUBLISHED: "published",
  PRIVATE_CHANGES: "private_changes",
});

export const BLOG_SAVE_INTENT = Object.freeze({
  PRIVATE_ONLY: "private_only",
  PUBLISH: "publish",
  UPDATE: "update",
});

export const BLOG_PRIVATE_OUTCOME = Object.freeze({
  SAVED: "saved",
  FAILED: "failed",
});

export const BLOG_PUBLIC_OUTCOME = Object.freeze({
  NOT_REQUESTED: "not_requested",
  PUBLISHED: "published",
  UPDATED: "updated",
  WITHDRAWN: "withdrawn",
  ABSENT: "absent",
  DECISION_REQUIRED: "decision_required",
  CONFLICT: "conflict",
  FAILED: "failed",
  UNKNOWN: "unknown",
});

const CAPABILITY_KEYS = Object.freeze([
  "contractVersion", "enabled", "anonymousProjection", "maxReferences",
  "cursorPagination", "ownerReadback", "legacyProjectionSafe", "rpcs",
]);
const REQUIRED_V1_RPCS = Object.freeze([
  BLOG_RPC.publish, BLOG_RPC.update, BLOG_RPC.withdraw,
  BLOG_RPC.ownerReadback, BLOG_RPC.list,
]);

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function instantMs(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isBlogStreamingSourceId(value) {
  return BLOG_STREAMING_SOURCE_IDS.includes(String(value || "").trim());
}

/* Oeffentliche Identitaeten sind ein optionaler, kleiner Nachweis des vom
   Backend bestaetigten Werks. Das Format allein belegt keine Verifikation;
   erzeugen darf das Feld ausschliesslich der serverseitige Resolver. */
export function isBlogPublicIdentityHints(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return false;
  const namespaces = new Set();
  return value.every((hint) => {
    if (!exactKeys(hint, ["namespace", "value"])
        || !BLOG_IDENTITY_NAMESPACES.includes(hint.namespace)
        || !nonEmptyString(hint.value)
        || namespaces.has(hint.namespace)) return false;
    namespaces.add(hint.namespace);
    return true;
  });
}

export function isBlogPublicStreamingTarget(target) {
  return plain(target)
    && target.kind === "streaming"
    && isBlogStreamingSourceId(target.sourceId)
    && ["programm", "entdecken"].includes(target.art)
    && nonEmptyString(target.ref)
    && nonEmptyString(target.titel);
}

/* Oeffentliche Kinoziele duerfen nur auf das zentrale Programm zeigen.
   `art: film` waere eine private Mediathek-ID und ist deshalb ungueltig. */
export function isBlogPublicCinemaTarget(target) {
  return plain(target)
    && target.kind === "cinema"
    && target.art === "programm"
    && nonEmptyString(target.ref)
    && nonEmptyString(target.titel);
}

/* Der neue Einstieg bleibt bei alter, unvollstaendiger oder unerwartet
   erweiterter Capability geschlossen. Ein HTTP-200 allein genuegt nicht. */
export function hasBlogPublicationCapability(value) {
  if (!exactKeys(value, CAPABILITY_KEYS)) return false;
  if (value.contractVersion !== BLOG_CONTRACT_VERSION
      || value.enabled !== true
      || value.anonymousProjection !== true
      || value.maxReferences !== BLOG_MAX_REFERENCES
      || value.cursorPagination !== true
      || value.ownerReadback !== true
      || value.legacyProjectionSafe !== true
      || !Array.isArray(value.rpcs)
      || value.rpcs.length !== REQUIRED_V1_RPCS.length) return false;
  return REQUIRED_V1_RPCS.every((rpc, index) => value.rpcs[index] === rpc);
}

export function blogSaveIntent({ hasPublication = false, anonymousPublication = false } = {}) {
  if (!anonymousPublication) return BLOG_SAVE_INTENT.PRIVATE_ONLY;
  return hasPublication ? BLOG_SAVE_INTENT.UPDATE : BLOG_SAVE_INTENT.PUBLISH;
}

export function blogPublicationDisplayState({
  publicationId = null,
  contentVersion = null,
  publishedContentVersion = null,
} = {}) {
  if (!publicationId) return BLOG_PUBLICATION_DISPLAY.PRIVATE;
  return contentVersion && publishedContentVersion && contentVersion === publishedContentVersion
    ? BLOG_PUBLICATION_DISPLAY.PUBLISHED
    : BLOG_PUBLICATION_DISPLAY.PRIVATE_CHANGES;
}

/* Streaming-/Kinoziele sind nur bei explizit injizierter Uhr aktuell. Ohne
   Revision, Pruefzeit oder gueltiges Ende entsteht kein navigierbares Ziel. */
export function isBlogSourceTargetCurrent(target, now) {
  const at = instantMs(now);
  const checkedAt = instantMs(target?.checkedAt);
  const validUntil = instantMs(target?.validUntil);
  return at !== null
    && checkedAt !== null
    && validUntil !== null
    && checkedAt <= at
    && at < validUntil
    && typeof target?.sourceRevision === "string"
    && target.sourceRevision.trim().length > 0;
}

/* Einziger gemeinsamer Ableiter fuer B und C. `libraryTarget` ist eine zuvor
   von B stark aufgeloeste, rein private Zielkennung des aktuellen Lesers.
   C rendert nur das Ergebnis und fuehrt kein eigenes Matching aus. */
export function projectBlogReferenceForReader(reference, {
  selectedSourceIds = [],
  libraryTarget = null,
  libraryReady = false,
  now,
} = {}) {
  const selected = new Set((Array.isArray(selectedSourceIds) ? selectedSourceIds : [])
    .map((sourceId) => String(sourceId || "").trim()).filter(isBlogStreamingSourceId));
  const sources = plain(reference?.sources) ? reference.sources : {};
  const allStreaming = Array.isArray(sources.streaming) ? sources.streaming : [];
  const allCinema = Array.isArray(sources.cinema) ? sources.cinema : [];
  const validStreaming = allStreaming.filter(isBlogPublicStreamingTarget);
  const validCinema = allCinema.filter(isBlogPublicCinemaTarget);
  const selectedStreaming = validStreaming
    .filter((target) => selected.has(String(target?.sourceId || "").trim()))
  const streaming = selectedStreaming.filter((target) => isBlogSourceTargetCurrent(target, now));
  const cinema = validCinema.filter((target) => isBlogSourceTargetCurrent(target, now));
  const targets = libraryTarget ? [libraryTarget, ...streaming, ...cinema] : [...streaming, ...cinema];
  if (targets.length) {
    return Object.freeze({
      state: BLOG_REFERENCE_VIEW.AVAILABLE,
      primaryTarget: targets[0],
      secondaryTargets: Object.freeze(targets.slice(1)),
    });
  }
  const resolution = reference?.resolution?.status;
  const projectedAt = instantMs(now);
  const sourcesCheckedAt = instantMs(sources.checkedAt);
  const sourcesValidUntil = instantMs(sources.validUntil);
  const sourcesChecked = sources.status === BLOG_SOURCE_STATUS.CHECKED
    && projectedAt !== null && sourcesCheckedAt !== null && sourcesValidUntil !== null
    && sourcesCheckedAt <= projectedAt && projectedAt < sourcesValidUntil;
  const relevantTargets = [...selectedStreaming, ...validCinema];
  const staleRelevantTarget = relevantTargets.length > 0
    && !relevantTargets.some((target) => isBlogSourceTargetCurrent(target, now));
  const targetsValid = validStreaming.length === allStreaming.length
    && validCinema.length === allCinema.length;
  const resolutionCanProveAbsence = [
    BLOG_REFERENCE_RESOLUTION.MATCHED,
    BLOG_REFERENCE_RESOLUTION.NOT_FOUND,
  ].includes(resolution);
  if (!libraryReady || !sourcesChecked || !targetsValid || staleRelevantTarget
      || !resolutionCanProveAbsence) {
    return Object.freeze({
      state: BLOG_REFERENCE_VIEW.UNCHECKED,
      primaryTarget: null,
      secondaryTargets: Object.freeze([]),
    });
  }
  return Object.freeze({
    state: BLOG_REFERENCE_VIEW.REDLINK,
    primaryTarget: null,
    secondaryTargets: Object.freeze([]),
  });
}

export const BLOG_CAPABILITY_REQUIRED_RPCS = REQUIRED_V1_RPCS;
