import {
  BLOG_IDENTITY_NAMESPACES,
  BLOG_MAX_REFERENCES,
  isBlogPublicIdentityHints,
  isBlogPublicCinemaTarget,
  isBlogPublicStreamingTarget,
  projectBlogReferenceForReader,
} from "./blogContract.js";
import { gleicheEintragAb } from "./artikel.js";
import { normalisiereTyp } from "./typen.js";

const SOURCE_ALIASES = new Map([
  ["netflix", "netflix"],
  ["prime", "prime"], ["prime video", "prime"], ["amazon prime video", "prime"],
  ["disney", "disney"], ["disney+", "disney"],
  ["apple", "apple"], ["apple tv", "apple"], ["apple tv+", "apple"], ["appletv+", "apple"],
  ["hbo", "hbo"], ["hbo max", "hbo"], ["max", "hbo"],
  ["paramount", "paramount"], ["paramount+", "paramount"], ["paramount plus", "paramount"],
  ["mubi", "mubi"],
  ["crunchyroll", "crunchyroll"], ["crunchyroll premium", "crunchyroll"],
  ["rtl", "rtl"], ["rtl+", "rtl"],
]);

const ID_FIELDS = Object.freeze({
  imdb: ["imdb_id", "imdbId"],
  tmdb: ["tmdb_id", "tmdbId"],
  watchmode: ["watchmode_id", "watchmodeId"],
  film_at: ["film_at_id", "filmAtId"],
});

function text(value) { return String(value == null ? "" : value).trim(); }

function identityValue(item, namespace) {
  for (const field of ID_FIELDS[namespace] || []) {
    const value = text(item?.[field]);
    if (value) return value;
  }
  const external = item?.externalIds || item?.external_ids || item?.identity || {};
  return text(external?.[namespace]);
}

export function canonicalBlogSourceIds(selectedServices) {
  const result = [];
  const seen = new Set();
  for (const service of Array.isArray(selectedServices) ? selectedServices : []) {
    const raw = text(service).toLocaleLowerCase("de-AT");
    const withoutChannel = raw.replace(/\s*\(via (?:amazon )?prime\)\s*$/i, "");
    const id = SOURCE_ALIASES.get(raw) || SOURCE_ALIASES.get(withoutChannel);
    if (id && !seen.has(id)) { seen.add(id); result.push(id); }
  }
  return result;
}

export function blogIdentityHints(item) {
  const hints = [];
  for (const namespace of BLOG_IDENTITY_NAMESPACES) {
    const value = identityValue(item, namespace);
    if (value) hints.push({ namespace, value });
  }
  return hints.slice(0, 4);
}

function workKeysForLibraryItem(item) {
  const keys = new Set();
  for (const field of ["workKey", "work_key", "public_work_key", "blog_work_key"]) {
    const value = text(item?.[field]);
    if (value) keys.add(value);
  }
  for (const hint of blogIdentityHints(item)) {
    keys.add(`${hint.namespace}:${hint.value}`);
  }
  return keys;
}

function targetForLibraryItem(item, fallbackTitle = "") {
  return item && text(item?.id) ? {
    kind: "library",
    ref: text(item.id),
    titel: text(item.titel || item.title) || text(fallbackTitle) || "Ohne Titel",
  } : null;
}

function identityRelation(publicHints, item) {
  const privateByNamespace = new Map(blogIdentityHints(item)
    .map((hint) => [hint.namespace, hint.value]));
  let matches = 0;
  let conflicts = 0;
  for (const hint of publicHints) {
    const privateValue = privateByNamespace.get(hint.namespace);
    if (!privateValue) continue;
    if (privateValue === text(hint.value)) matches += 1;
    else conflicts += 1;
  }
  return { matches, conflicts };
}

function sameMediaType(referenceMediaType, item) {
  return normalisiereTyp(item?.typ || item?.mediaType || "sonstiges")
    === normalisiereTyp(referenceMediaType || "sonstiges");
}

function resolveStrongIdentity(publicHints, library, fallbackTitle, mediaType) {
  if (!publicHints.length) return { target: null, blocksFallback: false };
  const matches = [];
  for (const item of library) {
    if (!sameMediaType(mediaType, item)) continue;
    const relation = identityRelation(publicHints, item);
    if (relation.matches > 0) matches.push({ item, relation });
  }
  if (matches.length !== 1) {
    return { target: null, blocksFallback: matches.length > 1 };
  }
  if (matches[0].relation.conflicts > 0) return { target: null, blocksFallback: true };
  return { target: targetForLibraryItem(matches[0].item, fallbackTitle), blocksFallback: true };
}

/* Der Index kennt ausschließlich gemeinsame Werkkennungen oder starke IDs.
   Titel, Alias und Rang sind absichtlich keine Matchschlüssel. */
export function buildBlogLibraryIndex(library) {
  const candidates = new Map();
  for (const item of Array.isArray(library) ? library : []) {
    const ref = text(item?.id);
    if (!ref) continue;
    for (const key of workKeysForLibraryItem(item)) {
      if (!candidates.has(key)) candidates.set(key, []);
      candidates.get(key).push(item);
    }
  }
  const index = new Map();
  for (const [workKey, items] of candidates) {
    if (items.length !== 1) continue;
    const item = items[0];
    index.set(workKey, Object.freeze({
      kind: "library",
      ref: text(item.id),
      titel: text(item.titel || item.title) || "Ohne Titel",
    }));
  }
  return index;
}

export function buildPrivateBlogTargetIndex(library, mustwatch) {
  const targets = new Map();
  for (const item of Array.isArray(library) ? library : []) {
    const ref = text(item?.id);
    if (ref) targets.set(ref, { kind: "library", ref, titel: text(item?.titel) || "Ohne Titel" });
  }
  for (const item of Array.isArray(mustwatch) ? mustwatch : []) {
    const rowRef = text(item?.id);
    const linkRef = text(item?.verknuepfung?.id);
    const linkKind = item?.verknuepfung?.ziel;
    if (!rowRef || !linkRef) continue;
    if (linkKind === "master") {
      const masterTarget = targets.get(linkRef);
      if (masterTarget) targets.set(rowRef, masterTarget);
    } else if (linkKind === "streaming") {
      targets.set(rowRef, { kind: "streaming", art: "entdecken", ref: linkRef, titel: text(item?.titel) || "Ohne Titel" });
    } else if (linkKind === "programm") {
      targets.set(rowRef, { kind: "cinema", art: "programm", ref: linkRef, titel: text(item?.titel) || "Ohne Titel" });
    }
  }
  return targets;
}

export function projectPrivateReferenceForPublication(row, rank, libraryById = new Map()) {
  const privateTarget = row?.ref == null ? null : libraryById.get(String(row.ref));
  const title = text(row?.title || row?.eingabe);
  const yearRaw = row?.year ?? row?.jahr;
  const year = Number.isInteger(yearRaw) ? yearRaw : null;
  const mediaType = normalisiereTyp(row?.mediaType || row?.typ || "sonstiges");
  const resolutionIntent = row?.resolutionIntent && typeof row.resolutionIntent === "object"
    ? row.resolutionIntent
    : row?.rotlink_ok ? { kind: "keep_redlink" } : { kind: "auto" };
  const result = {
    rowId: text(row?.rowId), rank, title, year, mediaType, resolutionIntent,
  };
  const identityHints = isBlogPublicIdentityHints(row?.identityHints)
    ? row.identityHints.map((hint) => ({ ...hint }))
    : blogIdentityHints(privateTarget || row);
  if (identityHints.length) result.identityHints = identityHints;
  return result;
}

export function projectPrivateArticleForPublication(article, library) {
  const libraryById = new Map((Array.isArray(library) ? library : [])
    .filter((item) => text(item?.id)).map((item) => [text(item.id), item]));
  return {
    title: text(article?.titel || article?.title),
    text: String(article?.text == null ? "" : article.text),
    ordered: article?.geordnet === true || article?.ordered === true,
    references: (() => {
      const rows = Array.isArray(article?.liste) ? article.liste : article?.references || [];
      if (rows.length > BLOG_MAX_REFERENCES) {
        throw new Error(`Ein Blogartikel darf höchstens ${BLOG_MAX_REFERENCES} Referenzen enthalten.`);
      }
      return rows.map((row, index) => projectPrivateReferenceForPublication(row, index + 1, libraryById));
    })(),
  };
}

function flatReferenceView(reference, projection, rowId) {
  return Object.freeze({
    rowId,
    referenceId: text(reference?.referenceId) || undefined,
    rank: Number.isInteger(reference?.rank) ? reference.rank : 0,
    title: text(reference?.title || reference?.eingabe),
    year: Number.isInteger(reference?.year ?? reference?.jahr) ? (reference?.year ?? reference?.jahr) : null,
    mediaType: normalisiereTyp(reference?.mediaType || reference?.typ || "sonstiges"),
    state: projection.state,
    primaryTarget: projection.primaryTarget,
    secondaryTargets: projection.secondaryTargets,
  });
}

export function projectPublicBlogReferences(references, {
  selectedSourceIds = [], libraryIndex = new Map(), library = [], libraryReady = false, now,
} = {}) {
  return (Array.isArray(references) ? references : []).map((reference) => {
    const referenceId = text(reference?.referenceId);
    const workKey = text(reference?.resolution?.workKey);
    const libraryItems = Array.isArray(library) ? library : [];
    const publicHints = isBlogPublicIdentityHints(reference?.resolution?.identityHints)
      ? reference.resolution.identityHints : [];
    const strongIdentity = resolveStrongIdentity(publicHints, libraryItems,
      reference?.title, reference?.mediaType);
    let libraryTarget = strongIdentity.target;
    let fallbackBlocked = strongIdentity.blocksFallback && !strongIdentity.target;
    const indexedTarget = !libraryTarget && workKey ? libraryIndex.get(workKey) || null : null;
    if (indexedTarget) {
      const indexedItem = libraryItems.find((item) => text(item?.id) === text(indexedTarget.ref));
      const relation = indexedItem && publicHints.length ? identityRelation(publicHints, indexedItem) : null;
      if ((!indexedItem || sameMediaType(reference?.mediaType, indexedItem))
          && (!relation || relation.conflicts === 0)) libraryTarget = indexedTarget;
      else fallbackBlocked = true;
    }
    const strongWorkKey = BLOG_IDENTITY_NAMESPACES.some((namespace) => workKey.startsWith(`${namespace}:`));
    const explicitWorkKeyConflict = !!workKey && !libraryTarget
      && libraryItems.some((item) => workKeysForLibraryItem(item).has(workKey));
    if (!libraryTarget && !fallbackBlocked && !strongWorkKey && !explicitWorkKeyConflict && libraryReady) {
      const match = gleicheEintragAb({
        eingabe: text(reference?.title),
        jahr: Number.isInteger(reference?.year) ? reference.year : null,
        typ: normalisiereTyp(reference?.mediaType || "sonstiges"),
      }, libraryItems);
      if (match.status === "verlinkt") {
        const item = libraryItems.find((entry) => text(entry?.id) === text(match.ref));
        const referenceYear = Number.isInteger(reference?.year) ? reference.year : null;
        const itemYear = Number.isInteger(item?.jahr ?? item?.year) ? (item.jahr ?? item.year) : null;
        const relation = item && publicHints.length ? identityRelation(publicHints, item) : null;
        if (item && referenceYear !== null && itemYear === referenceYear
            && (!relation || relation.conflicts === 0)) {
          libraryTarget = targetForLibraryItem(item, reference?.title);
        }
      }
    }
    const projection = projectBlogReferenceForReader(reference, {
      selectedSourceIds,
      libraryTarget,
      libraryReady,
      now,
    });
    return flatReferenceView(reference, projection, referenceId);
  });
}

export function projectPrivateBlogReferences(references, targetById = new Map(), { ready = true } = {}) {
  return (Array.isArray(references) ? references : []).map((reference, index) => {
    const rowId = text(reference?.rowId);
    const storedTarget = isBlogPublicStreamingTarget(reference?.sourceTarget)
      || isBlogPublicCinemaTarget(reference?.sourceTarget) ? reference.sourceTarget : null;
    const target = storedTarget || (reference?.ref == null ? null : targetById.get(String(reference.ref)));
    return Object.freeze({
      rowId,
      rank: index + 1,
      title: text(reference?.title || reference?.eingabe),
      year: Number.isInteger(reference?.year ?? reference?.jahr) ? (reference?.year ?? reference?.jahr) : null,
      mediaType: normalisiereTyp(reference?.mediaType || reference?.typ || "sonstiges"),
      state: target ? "available" : ready ? "redlink" : "unchecked",
      primaryTarget: target || null,
      secondaryTargets: Object.freeze([]),
      resolutionIntent: reference?.resolutionIntent || (reference?.rotlink_ok
        ? { kind: "keep_redlink" } : { kind: "auto" }),
      decisionCandidates: Array.isArray(reference?.decisionCandidates) ? reference.decisionCandidates : [],
      decisionRequired: reference?.decisionRequired === true
        || (reference?.decisionRequired == null && Array.isArray(reference?.decisionCandidates)
          && reference.decisionCandidates.length > 0),
    });
  });
}
