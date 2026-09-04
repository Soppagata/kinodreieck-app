import { rankCatalogTitleMatches } from "./catalogTitleSearch.js";

export const GLOBAL_SEARCH_AREAS = Object.freeze([
  "mediathek", "kino", "streaming", "blog", "daten",
]);

const areaOrder = (preferredArea) => (
  GLOBAL_SEARCH_AREAS.includes(preferredArea)
    ? [preferredArea, ...GLOBAL_SEARCH_AREAS.filter((area) => area !== preferredArea)]
    : [...GLOBAL_SEARCH_AREAS]
);

function mixAreas(items, order) {
  const byArea = new Map(order.map((area) => [area, []]));
  for (const item of items) {
    if (!byArea.has(item.bereich)) byArea.set(item.bereich, []);
    byArea.get(item.bereich).push(item);
  }
  const mixed = [];
  let keepGoing = true;
  while (keepGoing) {
    keepGoing = false;
    for (const area of byArea.keys()) {
      const item = byArea.get(area).shift();
      if (!item) continue;
      keepGoing = true;
      mixed.push(item);
    }
  }
  return mixed;
}

/* Titelrelevanz gilt global vor Semantik. Innerhalb derselben Titelstufe
   beziehungsweise derselben bereichsinternen Ergebnisposition wird fair
   gemischt; der aktuelle Bereich bestimmt nur, wer in diesem Gleichstand
   beginnt. Die übergebene Vollmenge bleibt unangetastet. */
export function projectCompactGlobalResults(items, {
  query = "", preferredArea = "alles", limit = 5,
} = {}) {
  const records = Array.isArray(items) ? items : [];
  const unique = records.filter((item, index) => (
    records.findIndex((candidate) => candidate.key === item.key) === index
  ));
  const order = areaOrder(preferredArea);
  const titleMatches = rankCatalogTitleMatches({
    text: query,
    identities: [query],
  }, unique, {
    currentArea: preferredArea,
    getArea: (item) => item.bereich,
  });
  const titleKeys = new Set(titleMatches.map(({ item }) => item.key));

  const titleGroups = new Map();
  for (const entry of titleMatches) {
    const key = `${entry.match.tier}:${entry.match.distance}`;
    if (!titleGroups.has(key)) titleGroups.set(key, []);
    titleGroups.get(key).push(entry.item);
  }
  const rankedTitles = [...titleGroups.values()].flatMap((group) => mixAreas(group, order));
  const semantic = mixAreas(unique.filter((item) => !titleKeys.has(item.key)), order);
  const safeLimit = Number.isInteger(limit) && limit >= 0 ? limit : 5;
  return {
    items: [...rankedTitles, ...semantic].slice(0, safeLimit),
    gesamt: unique.length,
  };
}
