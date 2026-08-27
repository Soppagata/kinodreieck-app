import assert from "node:assert/strict";
import fs from "node:fs";
import { isPositiveLibraryEvidence, rankRecommendations } from "./src/lib/recommendationRanking.js";

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`✓ ${name}`); };
const candidate = (targetId, extra = {}) => ({
  targetId, title: targetId, matchStatus: "matched", region: "AT", availabilityConfirmed: true,
  eligible: true, genres: [], tags: [], franchiseId: null, sourceId: "fixture:source:a",
  sourceRank: 5, freshnessAt: "2026-08-09T00:00:00.000Z", ...extra,
});

check("Positive Mediatheksevidenz verlangt drei vollständige Achsen und mindestens 10/15", () => {
  assert.equal(isPositiveLibraryEvidence({ bewertung: { wie: 4, was: 3, warum: 3 } }), true);
  assert.equal(isPositiveLibraryEvidence({ axes: { wie: 5, was: 5, warum: 0 } }), true);
  assert.equal(isPositiveLibraryEvidence({ axes: { wie: 3, was: 3, warum: 3 } }), false);
  assert.equal(isPositiveLibraryEvidence({ axes: { wie: 5, was: 5, warum: null } }), false);
  assert.equal(isPositiveLibraryEvidence({ axes: { wie: 5, was: 5 } }), false);
});

const context = {
  profile: {
    signale: [
      { art: "genre", wert: "noir", label: "Noir", richtung: "zieht_an", staerke: 4 },
      { art: "genre", wert: "komödie", richtung: "stoesst_ab", staerke: 3 },
      { art: "genre", wert: "gore", richtung: "stoesst_ab", staerke: 5, blocking: true },
    ],
    offen: [{ art: "genre", wert: "action", richtung: "zieht_an", staerke: 5 }],
  },
  library: [
    { targetId: "library:owned", bewertung: { wie: 4, was: 4, warum: 4 }, genre: ["noir"], franchiseId: "franchise:alpha" },
    { targetId: "library:alpha-2", bewertung: { wie: 4, was: 4, warum: 3 }, genre: ["science-fiction"], franchiseId: "franchise:alpha" },
    { targetId: "library:alpha-3", bewertung: null, genre: ["drama"], franchiseId: "franchise:alpha" },
  ],
};

check("Region, Match, Verfügbarkeit und vorhandenes identisches Werk filtern hart", () => {
  const rows = rankRecommendations([
    candidate("fixture:valid", { genres: ["noir"] }),
    candidate("fixture:unmatched", { matchStatus: "unmatched" }),
    candidate("fixture:us", { region: "US" }),
    candidate("fixture:no-at", { availabilityConfirmed: false }),
    candidate("library:owned"),
  ], context);
  assert.deepEqual(rows.map((row) => row.targetId), ["fixture:valid"]);
});

check("Bestätigte positive Profil- und Mediathekbelege ordnen deterministisch", () => {
  const rows = rankRecommendations([
    candidate("fixture:plain", { genres: ["science-fiction"] }),
    candidate("fixture:noir", { genres: ["noir"], franchiseId: "franchise:alpha" }),
  ], context);
  assert.deepEqual(rows.map((row) => row.targetId), ["fixture:noir", "fixture:plain"]);
  assert.ok(rows[0].reasons.includes("Profil: Noir"));
  assert.ok(rows[0].reasons.some((reason) => /positiv bewertete/.test(reason)));
  assert.ok(rows[0].reasons.includes("Mehrere Titel dieser Reihe in deiner Mediathek"));
  assert.ok(rows[0].reasons.length <= 3);
});

check("Blockierende Negativsignale entfernen, andere Negativsignale senken", () => {
  const rows = rankRecommendations([
    candidate("fixture:comedy", { genres: ["noir", "komödie"] }),
    candidate("fixture:plain", { genres: ["noir"] }),
    candidate("fixture:gore", { genres: ["noir", "gore"] }),
  ], context);
  assert.deepEqual(rows.map((row) => row.targetId), ["fixture:plain", "fixture:comedy"]);
  assert.equal(rows[1].negativeMatches, 1);
});

check("Unbewerteter Besitz liefert kein Genresignal", () => {
  const local = {
    profile: { signale: [], offen: [] },
    library: [{ targetId: "library:unrated", bewertung: null, genre: ["western"], franchiseId: null }],
  };
  const rows = rankRecommendations([candidate("fixture:western", { genres: ["western"] })], local);
  assert.deepEqual(rows, []);
});

check("Kandidaten ohne belastbaren Grund bleiben in der unpersonalisierten Quellenliste", () => {
  assert.deepEqual(rankRecommendations([candidate("fixture:plain")], { profile: {}, library: [] }), []);
});

check("Mediatheksprojektion kann vollständig deaktiviert werden", () => {
  const rows = rankRecommendations([
    candidate("library:owned", { genres: ["noir"] }),
  ], { ...context, useLibrary: false });
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].reasons.some((reason) => /Mediathek|Reihe/.test(reason)));
});

check("Quellenrang entscheidet auch innerhalb derselben Quelle nie persoenliche Gleichstaende", () => {
  const rankingContext = {
    profile: { signale: [{ art: "genre", wert: "noir", richtung: "zieht_an", staerke: 3 }] },
    library: [],
  };
  const sameSource = rankRecommendations([
    candidate("fixture:z", { sourceId: "fixture:source:same", sourceRank: 1, genres: ["noir"] }),
    candidate("fixture:a", { sourceId: "fixture:source:same", sourceRank: 99, genres: ["noir"] }),
  ], rankingContext);
  assert.deepEqual(sameSource.map((row) => row.targetId), ["fixture:a", "fixture:z"]);

  const differentSources = rankRecommendations([
    candidate("fixture:a", { sourceId: "fixture:source:a", sourceRank: 99, genres: ["noir"] }),
    candidate("fixture:z", { sourceId: "fixture:source:z", sourceRank: 1, genres: ["noir"] }),
  ], rankingContext);
  assert.deepEqual(differentSources.map((row) => row.targetId), ["fixture:a", "fixture:z"]);
});

check("Ranking mutiert weder Kandidaten noch Profil oder Mediathek", () => {
  const candidates = [candidate("fixture:immutable", { genres: ["noir"] })];
  const beforeCandidates = JSON.stringify(candidates);
  const beforeContext = JSON.stringify(context);
  rankRecommendations(candidates, context);
  assert.equal(JSON.stringify(candidates), beforeCandidates);
  assert.equal(JSON.stringify(context), beforeContext);
});

check("Rankingmodul besitzt keine Speicher-, Netzwerk- oder KI-Naht", () => {
  const source = fs.readFileSync(new URL("./src/lib/recommendationRanking.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\s*\(|aiService|speichereProfil|store\.set/);
});

console.log(`\n${checks}/${checks} Checks bestanden.`);
console.log("RECOMMENDATION-RANKING-TEST BESTANDEN");
