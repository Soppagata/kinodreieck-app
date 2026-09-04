import { norm } from "./match.js";

/*
 * Gemeinsamer, rein deterministischer Titelvertrag fuer lokale Suchpfade.
 * Die Reihenfolge ist absichtlich grob gestuft: Identitaet, exakter Titel,
 * belastbarer Wort-/Teiltreffer und erst danach ein eindeutiger Tippfehler.
 * Semantische Signale und Bereichspraeferenzen duerfen ausserhalb dieses
 * Moduls nur innerhalb derselben Stufe als Tie-Breaker wirken.
 */

export const TITLE_MATCH_KIND = Object.freeze({
  IDENTITY: "identity",
  EXACT: "exact",
  STRONG: "strong",
  FUZZY: "fuzzy",
});

export const TITLE_MATCH_TIER = Object.freeze({
  [TITLE_MATCH_KIND.IDENTITY]: 0,
  [TITLE_MATCH_KIND.EXACT]: 1,
  [TITLE_MATCH_KIND.STRONG]: 2,
  [TITLE_MATCH_KIND.FUZZY]: 3,
});

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const array = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const unique = (values) => [...new Set(values.filter(Boolean))];

export function normalizeTitleQuery(value) {
  return norm(text(value));
}

export function titleVariants(item) {
  const aliases = [
    ...array(item?.alternativtitel),
    ...array(item?.alternativeTitles),
    ...array(item?.aliases),
  ];
  return unique([
    item?.titel,
    item?.title,
    item?.originaltitel,
    item?.originalTitle,
    ...aliases,
  ].map(normalizeTitleQuery));
}

const identityToken = (namespace, value) => {
  const normalized = text(value).toLocaleLowerCase("de-AT");
  return normalized ? `${namespace}:${normalized}` : null;
};

/* Namespaces verhindern, dass etwa eine numerische TMDB-ID versehentlich
   mit einer Watchmode-ID gleichgesetzt wird. Freie IDs gelten als interne
   stabile ID; externe IDs muessen ihr Namespace tragen. */
export function titleIdentityTokens(item) {
  return unique([
    identityToken("id", item?.id),
    identityToken("stable", item?.stableId ?? item?.stable_id),
    identityToken("watchmode", item?.watchmode_id ?? item?.watchmodeId),
    identityToken("tmdb", item?.tmdb_id ?? item?.tmdbId),
    identityToken("imdb", item?.imdb_id ?? item?.imdbId),
    ...array(item?.identityTokens).map((value) => text(value).toLocaleLowerCase("de-AT")),
  ]);
}

function normalizeQueryIdentity(value) {
  const normalized = text(value).toLocaleLowerCase("de-AT");
  if (!normalized) return [];
  return normalized.includes(":")
    ? [normalized]
    : [`id:${normalized}`, `stable:${normalized}`];
}

function queryParts(query, queryIdentities = []) {
  if (query && typeof query === "object" && !Array.isArray(query)) {
    return {
      normalized: normalizeTitleQuery(query.text ?? query.title ?? query.titel),
      identities: unique([
        ...array(query.identities),
        ...array(query.identityTokens),
        ...array(query.id),
        ...queryIdentities,
      ].flatMap(normalizeQueryIdentity)),
    };
  }
  return {
    normalized: normalizeTitleQuery(query),
    identities: unique(array(queryIdentities).flatMap(normalizeQueryIdentity)),
  };
}

function hasIdentityMatch(item, identities) {
  if (!identities.length) return false;
  const itemIdentities = new Set(titleIdentityTokens(item));
  return identities.some((identity) => itemIdentities.has(identity));
}

const words = (value) => value.split(" ").filter(Boolean);

function strongTitleMatch(query, candidate) {
  if (!query || !candidate || query === candidate) return false;
  const queryWords = words(query);
  const candidateWords = words(candidate);
  const shorter = query.length <= candidate.length ? query : candidate;

  /* Ein einzelnes sehr kurzes Fragment wie "it" oder "pi" ist keine
     belastbare Titelnaehe. Ein Wort ab fuenf Zeichen darf dagegen als
     Wortanfang dienen ("obsess" -> "obsession"). */
  if (queryWords.length === 1 && query.length >= 5
      && candidateWords.some((word) => word.startsWith(query))) return true;

  /* Ganze Wortfolgen sind erlaubt, solange die kuerzere Seite Substanz hat.
     Dadurch bleibt "Blade Runner" -> "Blade Runner Final Cut" moeglich,
     waehrend beliebige Teilzeichenketten mitten in Woertern draussen bleiben. */
  if (shorter.length < 8 || words(shorter).length < 2) return false;
  return (` ${candidate} `).includes(` ${query} `)
    || (` ${query} `).includes(` ${candidate} `);
}

/* Optimal-String-Alignment-Distanz: eine benachbarte Vertauschung kostet
   genau einen Schritt. Das deckt den typischen mobilen Tippfehler ab, ohne
   grosszuegige phonetische oder semantische Gleichsetzungen einzufuehren. */
export function titleEditDistance(left, right) {
  const a = normalizeTitleQuery(left);
  const b = normalizeTitleQuery(right);
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let twoRowsBack = null;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = Array(b.length + 1).fill(0);
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitution,
      );
      if (twoRowsBack && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], twoRowsBack[j - 2] + 1);
      }
    }
    twoRowsBack = previous;
    previous = current;
  }
  return previous[b.length];
}

export function maxTitleEditDistance(length) {
  if (!Number.isInteger(length) || length < 5) return 0;
  if (length <= 7) return 1;
  if (length <= 11) return 2;
  return 3;
}

function fuzzyDistance(query, variants) {
  const maxDistance = maxTitleEditDistance(query.length);
  if (!maxDistance) return null;
  let best = null;
  for (const candidate of variants) {
    /* Sehr unterschiedliche Laengen werden nicht erst teuer verglichen und
       koennen den relativen Zaun ohnehin nicht bestehen. */
    if (Math.abs(candidate.length - query.length) > maxDistance) continue;
    const distance = titleEditDistance(query, candidate);
    const relative = distance / Math.max(query.length, candidate.length, 1);
    if (distance <= maxDistance && relative <= 0.2
        && (best == null || distance < best)) best = distance;
  }
  return best;
}

function directMatch(item, query) {
  const variants = titleVariants(item);
  if (!query) return null;
  if (variants.includes(query)) return { kind: TITLE_MATCH_KIND.EXACT, distance: 0 };
  if (variants.some((candidate) => strongTitleMatch(query, candidate))) {
    return { kind: TITLE_MATCH_KIND.STRONG, distance: 0 };
  }
  return null;
}

const defaultArea = (item) => item?.bereich ?? item?.area ?? item?.scope ?? null;

/*
 * Liefert nur sachlich passende Kandidaten. Fuzzy wird ausschliesslich dann
 * aufgenommen, wenn kein direkter Titel- oder ID-Treffer existiert und genau
 * EIN Datensatz die kleinste zulaessige Distanz besitzt. Zwei gleich gute
 * Schreibfehler bleiben damit bewusst ohne automatische Zuordnung.
 */
export function rankTitleMatches(query, items, {
  queryIdentities = [],
  currentArea = null,
  getArea = defaultArea,
  limit = Infinity,
} = {}) {
  const records = Array.isArray(items) ? items : [];
  const parsed = queryParts(query, queryIdentities);
  if (!parsed.normalized && !parsed.identities.length) return [];

  const direct = [];
  const fuzzy = [];
  records.forEach((item, index) => {
    let match = hasIdentityMatch(item, parsed.identities)
      ? { kind: TITLE_MATCH_KIND.IDENTITY, distance: 0 }
      : directMatch(item, parsed.normalized);
    if (match) {
      direct.push({ item, index, match: { ...match, tier: TITLE_MATCH_TIER[match.kind] } });
      return;
    }
    const distance = fuzzyDistance(parsed.normalized, titleVariants(item));
    if (distance != null) fuzzy.push({ item, index, distance });
  });

  let result = direct;
  if (!result.length && fuzzy.length) {
    const minimum = Math.min(...fuzzy.map((entry) => entry.distance));
    const best = fuzzy.filter((entry) => entry.distance === minimum);
    if (best.length === 1) {
      result = best.map(({ item, index, distance }) => ({
        item,
        index,
        match: { kind: TITLE_MATCH_KIND.FUZZY, tier: TITLE_MATCH_TIER.fuzzy, distance },
      }));
    }
  }

  const preferredArea = text(currentArea);
  result.sort((left, right) => left.match.tier - right.match.tier
    || left.match.distance - right.match.distance
    || (preferredArea
      ? Number(text(getArea(right.item)) === preferredArea) - Number(text(getArea(left.item)) === preferredArea)
      : 0)
    || left.index - right.index);
  const finiteLimit = Number.isInteger(limit) && limit >= 0 ? limit : Infinity;
  return result.slice(0, finiteLimit);
}
