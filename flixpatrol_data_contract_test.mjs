import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FLIXPATROL_AT_SOURCES,
  FLIXPATROL_TITLE_TYPES,
  FLIXPATROL_TOP10_TYPES,
  normalizeFlixPatrolTitle,
  normalizeFlixPatrolTitleList,
  normalizeFlixPatrolTop10List,
  normalizeTitleFingerprint,
  selectStrictFlixPatrolTitleCandidate,
} from "./supabase/functions/_shared/flixpatrolData.js";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const titleId = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
const secondTitleId = "ttl_K5H0Bes9dtvkV710raDBpXoK";
const countryId = "cnt_iMUHNbZvnNHK5YdhgwtOoP4u";
const companyId = FLIXPATROL_AT_SOURCES.companies.prime.id;
const genreId = "gnr_vkhlVlz6xabS78vHh0DCIc5e";
const keywordId = "kwd_NLPueMUHlNqj02pZEBFyWIhu";
const relation = (type, id) => ({ type, data: { id }, legacy: { id: 7 } });
const titlePayload = (overrides = {}) => ({
  type: "titles",
  data: {
    id: titleId,
    title: "Amélie",
    premiere: "2001-04-25",
    country: relation("countries", countryId),
    company: relation("companies", companyId),
    genre: relation("genres", genreId),
    keyword: relation("keywords", keywordId),
    description: "A neutral provider description.",
    updatedAt: "2026-09-09T10:57:43",
    link: "https://flixpatrol.com/title/amelie/",
    type: 1,
    premiereOnline: null,
    length: 122,
    imdbId: 211915,
    tmdbId: 194,
    ...overrides,
  },
});

check("Quellenvokabular hält Provider- und Titeltypen getrennt", () => {
  assert.deepEqual(FLIXPATROL_TITLE_TYPES, { film: 1, series: 2 });
  assert.deepEqual(FLIXPATROL_TOP10_TYPES, { movies: 2, tvshows: 3 });
  assert.notEqual(FLIXPATROL_AT_SOURCES.companies.appleTv.id, FLIXPATROL_AT_SOURCES.companies.appleStore.id);
  assert.equal(FLIXPATROL_AT_SOURCES.country.code, "AT");
});

check("Titelfakten werden auf das explizite neutrale Feldset reduziert", () => {
  const normalized = normalizeFlixPatrolTitle(titlePayload({ socials: { private: "discard" }, budget: 999 }));
  assert.deepEqual(Object.keys(normalized), [
    "sourceId", "mediaType", "title", "premiere", "releaseYear", "premiereOnline",
    "runtimeMinutes", "imdbNumericId", "imdbId", "tmdbId", "countryId", "companyId",
    "genreId", "keywordId", "description", "providerUpdatedAt", "sourceUrl",
  ]);
  assert.equal(normalized.imdbId, "tt0211915");
  assert.equal(normalized.releaseYear, 2001);
  assert.equal(JSON.stringify(normalized).includes("private"), false);
});

check("Nullable Fremd-IDs bleiben null und erfundene IDs entstehen nicht", () => {
  const normalized = normalizeFlixPatrolTitle(titlePayload({
    imdbId: null, tmdbId: null,
  }));
  assert.equal(normalized.imdbNumericId, null);
  assert.equal(normalized.imdbId, null);
  assert.equal(normalized.tmdbId, null);
});

check("Ungültige Kalenderdaten und falsch typisierte starke IDs verwerfen die Antwort", () => {
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ premiere: "2001-02-31" })), null);
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ imdbId: "tt0211915" })), null);
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ tmdbId: "194" })), null);
});

check("Eine teilweise ungültige Titelliste wird nicht als Teilresultat angenommen", () => {
  const broken = titlePayload({ id: secondTitleId, country: relation("companies", countryId) });
  assert.equal(normalizeFlixPatrolTitleList([titlePayload(), broken]), null);
  assert.deepEqual(normalizeFlixPatrolTitleList([]), []);
});

check("Striktes Matching verlangt Titel, Jahr, Typ und genau eine Quellen-ID", () => {
  const candidate = normalizeFlixPatrolTitle(titlePayload());
  assert.equal(normalizeTitleFingerprint("  AMÉLIE  "), "amélie");
  assert.deepEqual(selectStrictFlixPatrolTitleCandidate(
    { title: "Amélie", releaseYear: 2001, mediaType: "film" }, [candidate],
  ), { status: "resolved", sourceId: titleId, candidateCount: 1 });
  assert.deepEqual(selectStrictFlixPatrolTitleCandidate(
    { title: "Amélie", releaseYear: 2002, mediaType: "film" }, [candidate],
  ), { status: "not_found", sourceId: null, candidateCount: 0 });
  const duplicate = Object.freeze({ ...candidate, sourceId: secondTitleId });
  assert.equal(selectStrictFlixPatrolTitleCandidate(
    { title: "Amélie", releaseYear: 2001, mediaType: "film" }, [candidate, duplicate],
  ).status, "ambiguous_blocked");
});

check("Chartnormalisierung prüft Relationen und liefert Ränge stabil sortiert", () => {
  const expected = {
    companyId,
    countryId: FLIXPATROL_AT_SOURCES.country.id,
    chartType: "movies",
    date: "2026-09-09",
  };
  const row = (id, ranking) => ({ type: "top10s", data: {
    movie: relation("titles", id),
    company: relation("companies", expected.companyId),
    country: relation("countries", expected.countryId),
    type: 2,
    date: { type: "daterange", data: { type: 1, from: expected.date, to: expected.date } },
    ranking,
    rankingLast: null,
    value: 10,
    valueLast: null,
    daysTotal: 1,
    updatedAt: "2026-09-09T10:57:43",
  } });
  const normalized = normalizeFlixPatrolTop10List([row(secondTitleId, 2), row(titleId, 1)], expected);
  assert.deepEqual(normalized.map((item) => item.ranking), [1, 2]);
  const partial = row(titleId, 1);
  partial.data.company = null;
  assert.equal(normalizeFlixPatrolTop10List([partial], expected), null);
});

check("Migration und Doku begrenzen Suche, Rechte und Cache-Inhalte", () => {
  const migration = readFileSync("supabase/migrations/20260909190000_flixpatrol_data_cache.sql", "utf8");
  const docs = readFileSync("docs/FLIXPATROL_DATENVERTRAG.md", "utf8");
  assert.match(migration, /force row level security/g);
  assert.match(migration, /not public\.kd_account_active\(\)/);
  assert.match(migration, /v_count not between 1 and 50/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(/);
  assert.match(migration, /excluded\.chart_date >= kd_flixpatrol_chart_cache\.chart_date/);
  assert.doesNotMatch(migration, /email|profile|prompt|api_key|authorization/i);
  assert.match(docs, /title\[eq\]/);
  assert.match(docs, /premiere\[gte\]/);
  assert.match(docs, /mehrere IDs bleiben ambiguous_blocked/);
  assert.match(docs, /Unbekannte Importtitel dürfen offen bleiben/);
  assert.match(docs, /keine Pagination-Parameter/);
});

console.log(`${checks} FlixPatrol-Datenvertragsprüfungen bestanden.`);
