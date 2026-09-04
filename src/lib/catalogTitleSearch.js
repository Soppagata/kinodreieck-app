import {
  normalizeTitleQuery,
  rankTitleMatches,
  titleVariants,
} from "./titleSearch.js";

/* Produktnahe Ergänzung des gemeinsamen Titelvertrags: Bei einem Volltitel
   wie „Obsession – Du sollst mich lieben“ darf auch ein eindeutiger Tippfehler
   im markanten Titelwort greifen. Die Foundation entscheidet weiterhin über
   Distanz und Eindeutigkeit; kurze oder mehrfach vorkommende Wörter bleiben
   bewusst ohne automatische Zuordnung. */
export function rankCatalogTitleMatches(query, items, options = {}) {
  const records = Array.isArray(items) ? items : [];
  const direct = rankTitleMatches(query, records, options);
  if (direct.length) return direct;

  const normalized = normalizeTitleQuery(
    query && typeof query === "object" ? query.text ?? query.title ?? query.titel : query,
  );
  if (normalized.length < 5 || normalized.includes(" ")) return [];

  const fragments = [];
  records.forEach((item, itemIndex) => {
    const seen = new Set();
    for (const variant of titleVariants(item)) {
      for (const word of variant.split(" ")) {
        if (word.length < 5 || seen.has(word)) continue;
        seen.add(word);
        fragments.push({
          titel: word,
          sourceItem: item,
          sourceIndex: itemIndex,
          sourceArea: options.getArea?.(item) ?? item?.bereich ?? item?.area ?? null,
        });
      }
    }
  });

  const fragmentMatches = rankTitleMatches(normalized, fragments, {
    currentArea: options.currentArea,
    getArea: (fragment) => fragment.sourceArea,
  });
  const seenItems = new Set();
  return fragmentMatches.flatMap((entry) => {
    if (seenItems.has(entry.item.sourceItem)) return [];
    seenItems.add(entry.item.sourceItem);
    return [{
      item: entry.item.sourceItem,
      index: entry.item.sourceIndex,
      match: entry.match,
    }];
  }).slice(0, Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : Infinity);
}
