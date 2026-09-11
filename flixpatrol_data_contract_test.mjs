import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FLIXPATROL_AT_SOURCES,
  FLIXPATROL_RESPONSE_SHAPE_VERSION,
  FLIXPATROL_TITLE_TYPES,
  FLIXPATROL_TOP10_TYPES,
  describeFlixPatrolResponseShape,
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

check("Belegte Laufzeit 0 wird null, andere ungültige Laufzeiten bleiben verworfen", () => {
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ length: 0 })).runtimeMinutes, null);
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ length: null })).runtimeMinutes, null);
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ length: 122 })).runtimeMinutes, 122);
  for (const length of [-1, 1.5, 2_001]) {
    assert.equal(normalizeFlixPatrolTitle(titlePayload({ length })), null);
  }
});

check("Ungültige Kalenderdaten und falsch typisierte starke IDs verwerfen die Antwort", () => {
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ premiere: "2001-02-31" })), null);
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ imdbId: "tt0211915" })), null);
  assert.equal(normalizeFlixPatrolTitle(titlePayload({ tmdbId: "194" })), null);
});

check("Eine teilweise ungültige Titelliste wird nicht als Teilresultat angenommen", () => {
  const broken = titlePayload({ id: secondTitleId, country: relation("companies", countryId) });
  assert.equal(normalizeFlixPatrolTitleList([titlePayload(), broken]), null);
  assert.equal(normalizeFlixPatrolTitleList({ type: "list", data: [titlePayload(), broken] }), null);
  assert.deepEqual(normalizeFlixPatrolTitleList({ type: "list", data: [titlePayload()] }), [
    normalizeFlixPatrolTitle(titlePayload()),
  ]);
  assert.equal(normalizeFlixPatrolTitleList({
    type: "list", data: [titlePayload(), { ...titlePayload(), type: "top10s" }],
  }), null);
  assert.equal(normalizeFlixPatrolTitleList({ type: "collection", data: [titlePayload()] }), null);
  assert.equal(normalizeFlixPatrolTitleList({ type: "list", data: [] }), null);
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
  const chartTitleId = (index) => `ttl_${String(index).padStart(24, "A")}`;
  const listRows = Array.from({ length: 10 }, (_, index) => row(chartTitleId(index), index + 1));
  listRows[6].data.date = { type: 1, from: expected.date, to: expected.date };
  listRows[6].data.rankingLast = 0;
  const listWrapped = normalizeFlixPatrolTop10List({ type: "list", data: listRows }, expected);
  assert.equal(listWrapped.length, 10);
  assert.equal(listWrapped[6].rankingLast, null);
  const positivePrevious = row(titleId, 1);
  positivePrevious.data.rankingLast = 3;
  assert.equal(normalizeFlixPatrolTop10List({ type: "list", data: [positivePrevious] }, expected)[0].rankingLast, 3);
  assert.equal(normalizeFlixPatrolTop10List({ type: "collection", data: listRows }, expected), null);
  assert.equal(normalizeFlixPatrolTop10List({ type: "list", data: listRows.map((item) => item.data) }, expected), null);
  assert.equal(normalizeFlixPatrolTop10List({
    type: "list", data: [...listRows.slice(0, 9), { ...listRows[9], type: "titles" }],
  }, expected), null);
  const negativePrevious = row(titleId, 1);
  negativePrevious.data.rankingLast = -1;
  assert.equal(normalizeFlixPatrolTop10List({ type: "list", data: [negativePrevious] }, expected), null);
  const partial = row(titleId, 1);
  partial.data.company = null;
  assert.equal(normalizeFlixPatrolTop10List([partial], expected), null);
});

check("Antwortdiagnose wählt den ersten später verworfenen Eintrag ohne Fremdwerte", () => {
  const expected = {
    companyId,
    countryId: FLIXPATROL_AT_SOURCES.country.id,
    chartType: "movies",
    date: "2026-09-09",
  };
  const secrets = [
    "A Highly Sensitive Title", "provider description secret", titleId,
    companyId, "Basic private-api-key", "attacker-controlled-field-name", "n/a",
  ];
  const row = (id, ranking, overrides = {}) => ({
    type: "top10s",
    data: {
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
      ...overrides,
    },
  });
  const malicious = {
    type: "top10s",
    Authorization: secrets[4],
    "attacker-controlled-field-name": "must stay absent",
    data: [
      row(titleId, 1),
      row(secondTitleId, 2, {
        date: { type: 1, from: expected.date, to: expected.date },
        rankingLast: null,
        valueLast: 4,
        daysTotal: secrets[6],
        title: secrets[0],
        description: secrets[1],
      }),
    ],
  };
  const shape = describeFlixPatrolResponseShape(malicious, {
    contractGroup: "top10-list", failureClass: "contract-mismatch", expected,
  });
  assert.equal(shape.schemaVersion, FLIXPATROL_RESPONSE_SHAPE_VERSION);
  assert.equal(shape.contractGroup, "top10-list");
  assert.equal(shape.rootKind, "object");
  assert.equal(shape.rootTypeClass, "known:top10s");
  assert.equal(shape.dataKind, "array");
  assert.equal(shape.dataArrayLength, 2);
  assert.equal(shape.listLengthClass, "one-to-ten");
  assert.equal(shape.listProblemClass, "row-invalid");
  assert.equal(shape.samplePosition, 2);
  assert.equal(shape.whitelistFieldTypes.movie, "object");
  assert.equal(shape.whitelistFieldTypes.ranking, "number");
  assert.equal(shape.enumClasses.chartType, "known:2");
  assert.equal(shape.rankingClass, "integer:one-to-ten");
  assert.deepEqual(shape.nullableIntegerClasses, {
    rankingLast: "null", valueLast: "integer:valid", daysTotal: "invalid",
  });
  assert.deepEqual(shape.contractChecks, {
    companyMatchesExpected: true,
    countryMatchesExpected: true,
    chartTypeMatchesExpected: true,
    dateRangeMatchesExpected: true,
    titleIdValid: true,
    providerUpdatedAtValid: true,
  });
  assert.equal(shape.dateShape.kind, "object");
  assert.equal(shape.dateShape.formClass, "direct-date");
  assert.equal(shape.dateShape.nodeKind, "object");
  assert.equal(shape.dateShape.fieldTypes.from, "string");
  assert.equal(shape.dateShape.rangeTypeClass, "known:1");
  assert.equal(shape.relations.movie.typeClass, "known:titles");
  const serialized = JSON.stringify(shape);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false);

  const empty = describeFlixPatrolResponseShape({ type: "top10s", data: [] }, {
    contractGroup: "top10-list", expected,
  });
  assert.equal(empty.listProblemClass, "empty");
  assert.equal(empty.samplePosition, null);
  const outer = describeFlixPatrolResponseShape({ type: "unknown", data: [row(titleId, 1)] }, {
    contractGroup: "top10-list", expected,
  });
  assert.equal(outer.listProblemClass, "outer-shape");
  assert.equal(outer.samplePosition, 1);
  assert.equal(outer.whitelistFieldTypes.movie, "object");
  assert.equal(outer.contractChecks.companyMatchesExpected, true);

  const diagnosticTitleId = (index) => `ttl_${String(index).padStart(24, "A")}`;
  for (const rootType of ["collection", "list", "array", "resultset"]) {
    const classified = describeFlixPatrolResponseShape({ type: rootType, data: [row(titleId, 1)] }, {
      contractGroup: "top10-list", expected,
    });
    assert.equal(classified.rootTypeClass, `known:${rootType}`);
  }
  const directRow = describeFlixPatrolResponseShape({ type: "list", data: [row(titleId, 1).data] }, {
    contractGroup: "top10-list", expected,
  });
  assert.equal(directRow.listProblemClass, "outer-shape");
  assert.equal(directRow.sampleItemTypeClass, "number:other");
  assert.equal(directRow.sampleDataKind, "missing");
  assert.equal(directRow.whitelistFieldTypes.ranking, "number");
  assert.equal(directRow.contractChecks.dateRangeMatchesExpected, true);
  const outerRows = Array.from({ length: 10 }, (_, index) => row(diagnosticTitleId(index), index + 1));
  outerRows[6] = row(diagnosticTitleId(6), 7, {
    date: { type: 1, from: expected.date, to: expected.date },
    rankingLast: 0,
    updatedAt: "invalid",
  });
  const collection = describeFlixPatrolResponseShape({ type: "collection", data: outerRows }, {
    contractGroup: "top10-list", expected,
  });
  assert.equal(collection.rootTypeClass, "known:collection");
  assert.equal(collection.dataArrayLength, 10);
  assert.equal(collection.itemCount, 10);
  assert.equal(collection.listLengthClass, "one-to-ten");
  assert.equal(collection.listProblemClass, "outer-shape");
  assert.equal(collection.samplePosition, 7);
  assert.equal(collection.nullableIntegerClasses.rankingLast, "integer:zero");
  assert.equal(collection.dateShape.formClass, "direct-date");
  assert.deepEqual(collection.contractChecks, {
    companyMatchesExpected: true,
    countryMatchesExpected: true,
    chartTypeMatchesExpected: true,
    dateRangeMatchesExpected: true,
    titleIdValid: true,
    providerUpdatedAtValid: false,
  });
  assert.equal(JSON.stringify(collection).includes(diagnosticTitleId(6)), false);
  const boundedRows = Array.from({ length: 11 }, (_, index) => row(diagnosticTitleId(index), index + 1));
  Object.defineProperty(boundedRows, 10, {
    get() { throw new Error("elfte Zeile darf nicht gelesen werden"); },
  });
  const bounded = describeFlixPatrolResponseShape({ type: "array", data: boundedRows }, {
    contractGroup: "top10-list", expected,
  });
  assert.equal(bounded.listProblemClass, "outer-shape");
  assert.equal(bounded.listLengthClass, "over-ten");
  assert.equal(bounded.samplePosition, 1);
  for (const [rankingLast, expectedClass] of [
    [null, "null"], [0, "integer:zero"], [-1, "integer:negative"],
    [2, "integer:positive"], ["0", "invalid"],
  ]) {
    const classified = describeFlixPatrolResponseShape({
      type: "resultset", data: [row(titleId, 1, { rankingLast })],
    }, { contractGroup: "top10-list", expected });
    assert.equal(classified.rootTypeClass, "known:resultset");
    assert.equal(classified.nullableIntegerClasses.rankingLast, expectedClass);
  }
  const duplicateSource = describeFlixPatrolResponseShape({
    type: "top10s", data: [row(titleId, 1), row(titleId, 2)],
  }, { contractGroup: "top10-list", expected });
  assert.equal(duplicateSource.listProblemClass, "duplicate-source-id");
  assert.equal(duplicateSource.samplePosition, 2);
  const duplicateRanking = describeFlixPatrolResponseShape({
    type: "top10s", data: [row(titleId, 1), row(secondTitleId, 1)],
  }, { contractGroup: "top10-list", expected });
  assert.equal(duplicateRanking.listProblemClass, "duplicate-ranking");
  assert.equal(duplicateRanking.samplePosition, 2);
  assert.equal(describeFlixPatrolResponseShape({}, {
    contractGroup: "attacker-controlled-field-name", failureClass: "contract-mismatch",
  }), null);
});

check("Titeldiagnose klassifiziert Parsergrenzen ohne Providerwerte", () => {
  const expected = { sourceId: titleId, mediaType: "film" };
  const diagnose = (overrides = {}) => describeFlixPatrolResponseShape(titlePayload(overrides), {
    contractGroup: "title", failureClass: "contract-mismatch", expected,
  });
  const sensitive = [" SECRET_TITLE", "https://evil.example/SECRET_URL", "cmp_SECRET_ID"];
  const shape = diagnose({
    title: sensitive[0],
    premiere: "0000-00-00",
    premiereOnline: "",
    description: "x".repeat(4_001),
    link: sensitive[1],
    length: 0,
    imdbId: -7,
    tmdbId: 1.5,
    company: relation("companies", sensitive[2]),
  });
  assert.deepEqual(shape.titleValidity.dateClasses, { premiere: "zero", premiereOnline: "empty" });
  assert.deepEqual(shape.titleValidity.numberClasses, {
    length: "zero", imdbId: "negative", tmdbId: "fraction",
  });
  assert.deepEqual(shape.titleValidity.textClasses, {
    id: "valid",
    title: "leading-or-trailing-whitespace",
    description: "too-long",
    updatedAt: "valid",
    link: "valid",
  });
  assert.deepEqual(shape.titleValidity.patternChecks, {
    sourceId: true,
    countryId: true,
    companyId: false,
    genreId: true,
    keywordId: true,
    providerUpdatedAt: true,
    sourceUrl: false,
  });
  assert.deepEqual(shape.titleValidity.expectedChecks, {
    expectedTitleIdMatches: true,
    expectedMediaTypeMatches: true,
  });
  assert.deepEqual(diagnose({ id: secondTitleId, type: 2 }).titleValidity.expectedChecks, {
    expectedTitleIdMatches: false,
    expectedMediaTypeMatches: false,
  });
  for (const [value, expectedClass] of [
    ["2001-04-25", "valid"], ["", "empty"], ["0000-00-00", "zero"],
    ["2001-02-31", "invalid"], [null, "null"], [undefined, null],
  ]) assert.equal(diagnose({ premiere: value }).titleValidity.dateClasses.premiere, expectedClass);
  for (const [value, expectedClass] of [
    [122, "valid"], [0, "zero"], [-1, "negative"], [1.5, "fraction"],
    [2_001, "out-of-range"], [Number.MAX_SAFE_INTEGER + 1, "out-of-range"],
    [null, "null"], [undefined, "missing"], ["122", null],
  ]) assert.equal(diagnose({ length: value }).titleValidity.numberClasses.length, expectedClass);
  for (const [value, expectedClass] of [
    ["Film", "valid"], ["", "empty"], [" Film", "leading-or-trailing-whitespace"],
    ["x".repeat(241), "too-long"], [undefined, "missing"], [null, null],
  ]) assert.equal(diagnose({ title: value }).titleValidity.textClasses.title, expectedClass);
  const serialized = JSON.stringify(shape);
  for (const secret of sensitive) assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("x".repeat(100)), false);
});

check("Titellistendiagnose findet die erste verworfene Zeile und exakte Mengenfehler", () => {
  const broken = titlePayload({ id: secondTitleId, premiereOnline: "0000-00-00" });
  const expected = { sourceIds: [titleId, secondTitleId], mediaTypes: ["film", "film"] };
  const invalid = describeFlixPatrolResponseShape({ type: "list", data: [titlePayload(), broken] }, {
    contractGroup: "title-list", failureClass: "contract-mismatch", expected,
  });
  assert.equal(invalid.listProblemClass, "row-invalid");
  assert.equal(invalid.samplePosition, 2);
  assert.equal(invalid.titleValidity.dateClasses.premiereOnline, "zero");
  assert.deepEqual(invalid.titleValidity.expectedChecks, {
    expectedTitleIdMatches: true, expectedMediaTypeMatches: true,
  });
  const incomplete = describeFlixPatrolResponseShape({ type: "list", data: [titlePayload()] }, {
    contractGroup: "title-list", failureClass: "contract-mismatch", expected,
  });
  assert.equal(incomplete.listProblemClass, "exact-count-mismatch");
  assert.equal(incomplete.samplePosition, null);
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
  assert.match(docs, /flixpatrol-response-shape-v1/);
  assert.match(docs, /keine Titel, Beschreibungen, IDs, Schlüssel oder\s+Authorization/);
});

console.log(`${checks} FlixPatrol-Datenvertragsprüfungen bestanden.`);
