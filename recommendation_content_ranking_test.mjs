import assert from "node:assert/strict";
import { inhaltsthemen } from "./src/lib/recommendationContent.js";
import { rankRecommendations } from "./src/lib/recommendationRanking.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const candidate = (targetId, extra = {}) => ({
  targetId, title: targetId, matchStatus: "matched", region: "AT", availabilityConfirmed: true,
  eligible: true, genres: [], tags: [], franchiseId: null, sourceId: "flixpatrol:at",
  freshnessAt: "2026-09-10T00:00:00Z", ...extra,
});
const positive = { wie: 4, was: 4, warum: 4 };

check("Feste deutsche und englische Begriffe ergeben dasselbe überprüfbare Inhaltsthema", () => {
  assert.deepEqual(inhaltsthemen("Astronauten auf einer Mission im Weltraum"), ["space"]);
  assert.deepEqual(inhaltsthemen("Astronauts aboard a spacecraft in deep space"), ["space"]);
});

const context = {
  includeNeutral: true,
  excludedTargetIds: [],
  profile: {
    signale: [
      { art: "genre", wert: "Science-Fiction", richtung: "zieht_an", staerke: 4 },
      { art: "genre", wert: "Horror", richtung: "zieht_an", staerke: 3 },
      { art: "thema", wert: "Rache", richtung: "stoesst_ab", staerke: 3 },
      { art: "thema", wert: "Serienmörder", richtung: "stoesst_ab", staerke: 5, blocking: true },
    ],
    offen: [{ art: "thema", wert: "Künstliche Intelligenz", richtung: "zieht_an", staerke: 5 }],
  },
  library: [
    { targetId: "library:haunted", bewertung: positive,
      beschreibung: "Eine Familie zieht in ein verfluchtes Haus und begegnet einem Geist." },
    { targetId: "library:mafia", bewertung: null,
      description: "A mafia family fights for control of organized crime." },
  ],
};

const rows = rankRecommendations([
  candidate("candidate:science-fiction", { description: "A science fiction film about a distant research station." }),
  candidate("candidate:haunted", { description: "A family spends one night in a haunted house." }),
  candidate("candidate:generic", { description: "A young woman begins a new life and faces difficult choices in the world." }),
  candidate("candidate:revenge", { description: "A detective returns home seeking revenge." }),
  candidate("candidate:killer", { description: "A reporter investigates a notorious serial killer." }),
  candidate("candidate:ai", { beschreibung: "Eine künstliche Intelligenz lernt die Menschheit kennen." }),
  candidate("candidate:mafia", { description: "An ambitious son enters the world of organized crime." }),
], context);

check("Englische Kandidatenbeschreibung belegt einen deutschen bestätigten Profilzug", () => {
  const row = rows.find((entry) => entry.targetId === "candidate:science-fiction");
  assert.ok(row?.reasons.includes("Inhalt: Science-Fiction aus deinem bestätigten Profil"));
});
check("Positive Mediatheksbeschreibung liefert einen konkreten zweisprachigen Grund", () => {
  const row = rows.find((entry) => entry.targetId === "candidate:haunted");
  assert.ok(row?.reasons.includes("Inhalt: Spukhaus wie in positiv bewerteter Mediathek"));
});
check("Generische Wörter erzeugen keine Geschmacksbehauptung", () => {
  assert.deepEqual(rows.find((entry) => entry.targetId === "candidate:generic")?.reasons, []);
});
check("Unbestätigtes Profil.offen erzeugt auch bei exaktem Thema keinen Grund", () => {
  assert.deepEqual(rows.find((entry) => entry.targetId === "candidate:ai")?.reasons, []);
});
check("Unbewertete Mediatheksbeschreibung erzeugt keinen positiven Grund", () => {
  assert.deepEqual(rows.find((entry) => entry.targetId === "candidate:mafia")?.reasons, []);
});
check("Neutraler Fallback verwirft Kandidaten mit ausschließlich negativer Evidenz", () => {
  assert.equal(rows.some((entry) => entry.targetId === "candidate:revenge"), false);
});
check("Blockierendes Negativsignal bleibt auch über eine konkrete Beschreibung hart", () => {
  assert.equal(rows.some((entry) => entry.targetId === "candidate:killer"), false);
});
check("Belegte Inhaltsgründe stehen vor neutralen Explorationszeilen", () => {
  const ids = rows.map((entry) => entry.targetId);
  assert.ok(ids.indexOf("candidate:science-fiction") < ids.indexOf("candidate:generic"));
  assert.ok(ids.indexOf("candidate:haunted") < ids.indexOf("candidate:generic"));
});
check("Standardaufrufer ohne includeNeutral behalten das bisherige Ranking", () => {
  const standard = rankRecommendations([
    candidate("candidate:science-fiction", { description: "A science fiction film about a research station." }),
  ], { ...context, includeNeutral: false });
  assert.deepEqual(standard, []);
});
check("Epochen- und fremde Signalarten werden nicht aus Handlungsbeschreibungen abgeleitet", () => {
  const scoped = rankRecommendations([
    candidate("candidate:period-setting", { year: 2026, description: "A detective works in the 1980s." }),
    candidate("candidate:director-word", { description: "A horror story unfolds in a remote village." }),
  ], { includeNeutral: true, excludedTargetIds: [], profile: { signale: [
    { art: "epoche", wert: "80er", richtung: "zieht_an", staerke: 5 },
    { art: "regie", wert: "Horror", richtung: "zieht_an", staerke: 5 },
  ] }, library: [] });
  assert.deepEqual(scoped.map((row) => row.reasons), [[], []]);
});
check("Inhaltsvergleich mutiert keine Eingabe und erweitert die Ergebnisform nicht", () => {
  const candidates = [candidate("candidate:immutable", { description: "A horror movie set in the 1980s." })];
  const localContext = { includeNeutral: true, excludedTargetIds: [],
    profile: { signale: [{ art: "genre", wert: "Horror", richtung: "zieht_an", staerke: 4 }] },
    library: [] };
  const before = JSON.stringify({ candidates, context: localContext });
  const [result] = rankRecommendations(candidates, localContext);
  assert.equal(JSON.stringify({ candidates, context: localContext }), before);
  assert.ok(result.reasons.includes("Inhalt: Horror aus deinem bestätigten Profil"));
  assert.equal(Object.hasOwn(result, "description"), false);
  assert.deepEqual(Object.keys(result), [
    "targetId", "title", "reasons", "negativeMatches", "sourceId", "sourceLabel", "sourceRank",
    "sourcePosition", "watchmodeId", "sourceItemId", "services", "availability", "popularity",
    "year", "type", "externalDiscovery", "wikidata", "externalEvidence",
  ]);
});

console.log(`recommendation_content_ranking_test: ${checks} Checks bestanden.`);
