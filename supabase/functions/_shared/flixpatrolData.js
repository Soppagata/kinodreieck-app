const ID_PATTERNS = Object.freeze({
  title: /^ttl_[A-Za-z0-9]{20,40}$/,
  company: /^cmp_[A-Za-z0-9]{20,40}$/,
  country: /^cnt_[A-Za-z0-9]{20,40}$/,
  genre: /^gnr_[A-Za-z0-9]{20,40}$/,
  keyword: /^kwd_[A-Za-z0-9]{20,40}$/,
  region: /^rgn_[A-Za-z0-9]{20,40}$/,
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PROVIDER_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?$/;

export const FLIXPATROL_TITLE_TYPES = Object.freeze({ film: 1, series: 2 });
export const FLIXPATROL_TOP10_TYPES = Object.freeze({ movies: 2, tvshows: 3 });
export const FLIXPATROL_VOCABULARY_TYPES = Object.freeze({ genres: "genres", keywords: "keywords" });
export const FLIXPATROL_AT_SOURCES = Object.freeze({
  country: Object.freeze({ id: "cnt_gGE4RaeXpyz2U9Q5tEMYDwri", code: "AT", name: "Austria" }),
  companies: Object.freeze({
    prime: Object.freeze({ id: "cmp_qypvowjqFhEIpCc0HlQ6VoYk", name: "Amazon Prime" }),
    disney: Object.freeze({ id: "cmp_oGtsgdpOrjIu3XzTEnWPt87Y", name: "Disney+" }),
    appleTv: Object.freeze({ id: "cmp_VvmYc7OphiUds0Hgjbz5MESn", name: "Apple TV" }),
    appleStore: Object.freeze({ id: "cmp_phDSns8OP1rtHnX6QwlEKhiq", name: "Apple TV Store" }),
  }),
});

export const FLIXPATROL_RESPONSE_SHAPE_VERSION = "flixpatrol-response-shape-v1";
const RESPONSE_CONTRACT_GROUPS = new Set([
  "quota", "top10-list", "title", "title-list", "genre-list", "keyword-list",
]);
const RESPONSE_FAILURE_CLASSES = new Set(["json-error", "contract-mismatch"]);
const RESPONSE_FIELDS = Object.freeze({
  quota: Object.freeze(["used", "available", "limit", "limitExtra", "resetAt"]),
  "top10-list": Object.freeze([
    "movie", "company", "country", "type", "date", "ranking", "rankingLast",
    "value", "valueLast", "daysTotal", "updatedAt",
  ]),
  title: Object.freeze([
    "id", "title", "premiere", "country", "company", "genre", "keyword",
    "description", "updatedAt", "link", "type", "premiereOnline", "length",
    "imdbId", "tmdbId",
  ]),
  "title-list": Object.freeze([
    "id", "title", "premiere", "country", "company", "genre", "keyword",
    "description", "updatedAt", "link", "type", "premiereOnline", "length",
    "imdbId", "tmdbId",
  ]),
  "genre-list": Object.freeze(["id", "name", "type"]),
  "keyword-list": Object.freeze(["id", "name"]),
});

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function responseValueClass(value) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return ["string", "number", "boolean"].includes(typeof value) ? typeof value : "other";
}

function responseEnumClass(value, allowed) {
  if (allowed.includes(value)) return `known:${String(value)}`;
  return `${responseValueClass(value)}:other`;
}

function responseFieldTypes(value, fields) {
  const source = record(value);
  return Object.freeze(Object.fromEntries(fields.map((field) => [field, responseValueClass(source?.[field])])));
}

function responseRelationShape(value, allowedTypes) {
  const wrapper = record(value);
  const data = record(wrapper?.data);
  return Object.freeze({
    kind: responseValueClass(value),
    typeClass: responseEnumClass(wrapper?.type, allowedTypes),
    dataKind: responseValueClass(wrapper?.data),
    idKind: responseValueClass(data?.id),
  });
}

function responseListLengthClass(value) {
  if (!Array.isArray(value)) return "not-array";
  if (value.length === 0) return "empty";
  return value.length <= 10 ? "one-to-ten" : "over-ten";
}

function responseRankingClass(value) {
  if (Number.isInteger(value)) {
    return value >= 1 && value <= 10 ? "integer:one-to-ten" : "integer:out-of-range";
  }
  if (typeof value === "number") return "number:non-integer";
  return `${responseValueClass(value)}:other`;
}

function responseNullableIntegerClass(value, min) {
  if (value === null) return "null";
  return Number.isSafeInteger(value) && value >= min ? "integer:valid" : "invalid";
}

function responseRankingLastClass(value) {
  if (value === null) return "null";
  if (!Number.isSafeInteger(value)) return "invalid";
  if (value === 0) return "integer:zero";
  return value < 0 ? "integer:negative" : "integer:positive";
}

function responseDateShape(value) {
  const wrapper = record(value);
  const wrapped = wrapper?.type === "daterange";
  const data = wrapped ? record(wrapper.data) : wrapper;
  return Object.freeze({
    kind: responseValueClass(value),
    formClass: wrapped ? "wrapped-daterange" : wrapper ? "direct-date" : "invalid",
    nodeKind: responseValueClass(data),
    fieldTypes: responseFieldTypes(data, ["type", "from", "to"]),
    rangeTypeClass: responseEnumClass(data?.type, [1]),
  });
}

function firstDuplicatePosition(values) {
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    if (seen.has(values[index])) return index + 1;
    seen.add(values[index]);
  }
  return null;
}

function top10Sample(items, expected, detectDuplicates) {
  const normalized = [];
  const inspected = items.slice(0, 10);
  for (let index = 0; index < inspected.length; index += 1) {
    const one = normalizeFlixPatrolTop10List([inspected[index]], expected);
    if (!one) return { sample: inspected[index], samplePosition: index + 1, normalized };
    normalized.push(one[0]);
  }
  if (detectDuplicates) {
    const sourceDuplicate = firstDuplicatePosition(normalized.map((item) => item.sourceId));
    if (sourceDuplicate !== null) {
      return { sample: inspected[sourceDuplicate - 1], samplePosition: sourceDuplicate, normalized };
    }
    const rankingDuplicate = firstDuplicatePosition(normalized.map((item) => item.ranking));
    if (rankingDuplicate !== null) {
      return { sample: inspected[rankingDuplicate - 1], samplePosition: rankingDuplicate, normalized };
    }
  }
  return { sample: inspected[0], samplePosition: inspected.length > 0 ? 1 : null, normalized };
}

function top10DiagnosticState(value, expected) {
  const items = listItems(value, "top10s");
  if (!items) {
    const structuralItems = Array.isArray(record(value)?.data) ? record(value).data : null;
    const selected = structuralItems ? top10Sample(structuralItems, expected, false) : null;
    return {
      items: structuralItems,
      sample: selected?.sample,
      samplePosition: selected?.samplePosition ?? null,
      listProblemClass: "outer-shape",
    };
  }
  if (items.length === 0) return { items, sample: undefined, samplePosition: null, listProblemClass: "empty" };
  if (items.length > 10) return { items, sample: undefined, samplePosition: null, listProblemClass: "over-ten" };
  const selected = top10Sample(items, expected, true);
  const { normalized } = selected;
  if (normalized.length !== items.length) {
    return { items, sample: selected.sample, samplePosition: selected.samplePosition, listProblemClass: "row-invalid" };
  }
  const sourceDuplicate = firstDuplicatePosition(normalized.map((item) => item.sourceId));
  if (sourceDuplicate !== null) {
    return {
      items, sample: items[sourceDuplicate - 1], samplePosition: sourceDuplicate,
      listProblemClass: "duplicate-source-id",
    };
  }
  const rankingDuplicate = firstDuplicatePosition(normalized.map((item) => item.ranking));
  if (rankingDuplicate !== null) {
    return {
      items, sample: items[rankingDuplicate - 1], samplePosition: rankingDuplicate,
      listProblemClass: "duplicate-ranking",
    };
  }
  return { items, sample: items[0], samplePosition: 1, listProblemClass: "none" };
}

function relationMatchesExpected(value, type, pattern, expectedId) {
  if (value === undefined || value === null || typeof expectedId !== "string" || !pattern.test(expectedId)) return null;
  const relation = relationData(value, type, pattern);
  return Boolean(relation && relation.id === expectedId);
}

function chartTypeMatchesExpected(value, expectedType) {
  if (value === undefined || value === null || !Object.hasOwn(FLIXPATROL_TOP10_TYPES, expectedType ?? "")) return null;
  return normalizeChartType(value) === expectedType;
}

function dateRangeMatchesExpected(value, expectedDate) {
  if (value === undefined || value === null || typeof expectedDate !== "string" || !DATE_PATTERN.test(expectedDate)) return null;
  const wrapper = record(value);
  const date = wrapper?.type === "daterange" ? record(wrapper.data) : wrapper;
  return Boolean(date && date.type === 1 && date.from === expectedDate && date.to === expectedDate);
}

function validTitleIdCheck(value) {
  if (value === undefined || value === null) return null;
  return ID_PATTERNS.title.test(record(record(value)?.data)?.id ?? "");
}

function validProviderUpdatedAtCheck(value) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && PROVIDER_DATETIME_PATTERN.test(value);
}

function responseDateValueClass(value) {
  if (value === undefined) return null;
  if (value === null) return "null";
  if (value === "") return "empty";
  if (value === 0 || value === "0" || value === "0000-00-00") return "zero";
  return nullableDate(value) === value ? "valid" : "invalid";
}

function responseNumberValueClass(value, { min, max }) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value !== "number") return null;
  if (value === 0) return "zero";
  if (value < 0) return "negative";
  if (!Number.isFinite(value) || (!Number.isSafeInteger(value) && Number.isInteger(value))) return "out-of-range";
  if (!Number.isInteger(value)) return "fraction";
  return value >= min && value <= max ? "valid" : "out-of-range";
}

function responseTextValueClass(value, maxLength) {
  if (value === undefined) return "missing";
  if (value === null || typeof value !== "string") return null;
  if (value.length === 0) return "empty";
  if (value.trim() !== value) return "leading-or-trailing-whitespace";
  return value.length <= maxLength ? "valid" : "too-long";
}

function responsePatternCheck(value, pattern) {
  if (value === undefined || value === null || typeof value !== "string") return null;
  return pattern.test(value);
}

function responseRelationIdPatternCheck(value, pattern) {
  if (value === undefined || value === null) return null;
  return responsePatternCheck(record(record(value)?.data)?.id, pattern);
}

function expectedTitleIdMatches(value, expectedSourceId) {
  if (typeof value !== "string" || typeof expectedSourceId !== "string"
      || !ID_PATTERNS.title.test(expectedSourceId)) return null;
  return value === expectedSourceId;
}

function expectedMediaTypeMatches(value, expectedMediaType) {
  if (value === undefined || value === null || !["film", "series"].includes(expectedMediaType)) return null;
  return normalizeTitleType(value) === expectedMediaType;
}

function titleBatchExpectation(expected) {
  if (!Array.isArray(expected?.sourceIds) || !Array.isArray(expected?.mediaTypes)
      || expected.sourceIds.length < 1 || expected.sourceIds.length > 10
      || expected.mediaTypes.length !== expected.sourceIds.length
      || new Set(expected.sourceIds).size !== expected.sourceIds.length
      || expected.sourceIds.some((id) => !ID_PATTERNS.title.test(id))
      || expected.mediaTypes.some((type) => !Object.hasOwn(FLIXPATROL_TITLE_TYPES, type))) return null;
  return new Map(expected.sourceIds.map((id, index) => [id, expected.mediaTypes[index]]));
}

function titleListDiagnosticState(value, expected) {
  const items = listItems(value, "titles");
  const expectation = titleBatchExpectation(expected);
  if (!items) {
    const structuralItems = Array.isArray(record(value)?.data) ? record(value).data : null;
    return {
      items: structuralItems, sample: structuralItems?.[0], samplePosition: structuralItems?.length ? 1 : null,
      listProblemClass: "outer-shape", expectedMediaType: null,
    };
  }
  if (items.length === 0) {
    return { items, sample: undefined, samplePosition: null, listProblemClass: "empty", expectedMediaType: null };
  }
  if (items.length > 10) {
    return { items, sample: undefined, samplePosition: null, listProblemClass: "over-ten", expectedMediaType: null };
  }
  const normalized = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = normalizeFlixPatrolTitle(items[index]);
    if (!item) {
      const rawId = record(record(items[index])?.data)?.id;
      return {
        items, sample: items[index], samplePosition: index + 1, listProblemClass: "row-invalid",
        expectedMediaType: typeof rawId === "string" ? expectation?.get(rawId) ?? null : null,
      };
    }
    normalized.push(item);
  }
  const duplicatePosition = firstDuplicatePosition(normalized.map((item) => item.sourceId));
  if (duplicatePosition !== null) {
    return {
      items, sample: items[duplicatePosition - 1], samplePosition: duplicatePosition,
      listProblemClass: "duplicate-source-id",
      expectedMediaType: expectation?.get(normalized[duplicatePosition - 1].sourceId) ?? null,
    };
  }
  if (expectation) {
    const unexpectedPosition = normalized.findIndex((item) => !expectation.has(item.sourceId));
    if (unexpectedPosition >= 0) {
      return {
        items, sample: items[unexpectedPosition], samplePosition: unexpectedPosition + 1,
        listProblemClass: "unexpected-source-id", expectedMediaType: null,
      };
    }
    const mediaTypePosition = normalized.findIndex((item) => expectation.get(item.sourceId) !== item.mediaType);
    if (mediaTypePosition >= 0) {
      return {
        items, sample: items[mediaTypePosition], samplePosition: mediaTypePosition + 1,
        listProblemClass: "media-type-mismatch",
        expectedMediaType: expectation.get(normalized[mediaTypePosition].sourceId),
      };
    }
    if (normalized.length !== expectation.size) {
      return {
        items, sample: undefined, samplePosition: null,
        listProblemClass: "exact-count-mismatch", expectedMediaType: null,
      };
    }
  }
  return {
    items, sample: items[0], samplePosition: 1, listProblemClass: "none",
    expectedMediaType: expectation?.get(normalized[0].sourceId) ?? null,
  };
}

/* Rein strukturelle Diagnose fuer verworfene Providerantworten. Feldnamen und
   Enumwerte stammen ausschliesslich aus festen Whitelists; Fremdwerte werden
   nie kopiert. Bei TOP-10 wird hoechstens bis zum ersten vom vorhandenen
   Normalisierer verworfenen Eintrag (maximal zehn) gegangen. */
export function describeFlixPatrolResponseShape(value, {
  contractGroup,
  failureClass = "contract-mismatch",
  expected = null,
} = {}) {
  if (!RESPONSE_CONTRACT_GROUPS.has(contractGroup) || !RESPONSE_FAILURE_CLASSES.has(failureClass)) return null;
  const root = record(value);
  const rootData = root?.data;
  const genericList = Array.isArray(value) ? value : Array.isArray(rootData) ? rootData : null;
  const top10State = contractGroup === "top10-list" ? top10DiagnosticState(value, expected) : null;
  const titleListState = contractGroup === "title-list" ? titleListDiagnosticState(value, expected) : null;
  const listState = top10State ?? titleListState;
  const list = listState ? listState.items : genericList;
  const sample = contractGroup === "quota" || contractGroup === "title"
    ? value : listState ? listState.sample : list?.[0];
  const sampleWrapper = record(sample);
  const sampleData = record(sampleWrapper?.data);
  const top10FieldsTarget = sampleData ?? sampleWrapper;
  const fieldsTarget = contractGroup === "quota" || contractGroup === "title"
    ? rootData : contractGroup === "top10-list" ? top10FieldsTarget : sampleWrapper?.data;
  const relations = contractGroup === "top10-list"
    ? {
      movie: responseRelationShape(top10FieldsTarget?.movie, ["titles"]),
      company: responseRelationShape(top10FieldsTarget?.company, ["companies"]),
      country: responseRelationShape(top10FieldsTarget?.country, ["countries"]),
    }
    : ["title", "title-list"].includes(contractGroup) ? {
      country: responseRelationShape(record(fieldsTarget)?.country, ["countries"]),
      company: responseRelationShape(record(fieldsTarget)?.company, ["companies"]),
      genre: responseRelationShape(record(fieldsTarget)?.genre, ["genres"]),
      keyword: responseRelationShape(record(fieldsTarget)?.keyword, ["keywords"]),
    } : {};
  const enumClasses = contractGroup === "top10-list"
    ? {
      chartType: responseEnumClass(record(fieldsTarget)?.type, [2, 3]),
    }
    : ["title", "title-list"].includes(contractGroup) ? {
      titleType: responseEnumClass(record(fieldsTarget)?.type, [1, 2]),
    } : {};
  const titleData = contractGroup === "title" ? rootData
    : contractGroup === "title-list" ? sampleData : null;
  return Object.freeze({
    schemaVersion: FLIXPATROL_RESPONSE_SHAPE_VERSION,
    contractGroup,
    failureClass,
    rootKind: responseValueClass(value),
    rootArrayLength: Array.isArray(value) ? value.length : null,
    rootTypeClass: responseEnumClass(root?.type, [
      "apiquota", "top10s", "titles", "collection", "list", "array", "resultset",
    ]),
    dataKind: responseValueClass(rootData),
    dataArrayLength: Array.isArray(rootData) ? rootData.length : null,
    itemCount: list?.length ?? (sample === undefined ? 0 : 1),
    listLengthClass: responseListLengthClass(list),
    listProblemClass: listState?.listProblemClass ?? "not-applicable",
    samplePosition: listState?.samplePosition ?? null,
    sampleItemKind: responseValueClass(sample),
    sampleItemTypeClass: responseEnumClass(sampleWrapper?.type, ["apiquota", "top10s", "titles"]),
    sampleDataKind: responseValueClass(sampleWrapper?.data),
    whitelistFieldTypes: responseFieldTypes(fieldsTarget, RESPONSE_FIELDS[contractGroup]),
    enumClasses: Object.freeze(enumClasses),
    relations: Object.freeze(relations),
    rankingClass: contractGroup === "top10-list"
      ? responseRankingClass(top10FieldsTarget?.ranking) : "not-applicable",
    nullableIntegerClasses: contractGroup === "top10-list" ? Object.freeze({
      rankingLast: responseRankingLastClass(top10FieldsTarget?.rankingLast),
      valueLast: responseNullableIntegerClass(top10FieldsTarget?.valueLast, 0),
      daysTotal: responseNullableIntegerClass(top10FieldsTarget?.daysTotal, 0),
    }) : null,
    dateShape: contractGroup === "top10-list" ? responseDateShape(top10FieldsTarget?.date) : null,
    contractChecks: contractGroup === "top10-list" ? Object.freeze({
      companyMatchesExpected: relationMatchesExpected(
        top10FieldsTarget?.company, "companies", ID_PATTERNS.company, expected?.companyId,
      ),
      countryMatchesExpected: relationMatchesExpected(
        top10FieldsTarget?.country, "countries", ID_PATTERNS.country, expected?.countryId,
      ),
      chartTypeMatchesExpected: chartTypeMatchesExpected(top10FieldsTarget?.type, expected?.chartType),
      dateRangeMatchesExpected: dateRangeMatchesExpected(top10FieldsTarget?.date, expected?.date),
      titleIdValid: validTitleIdCheck(top10FieldsTarget?.movie),
      providerUpdatedAtValid: validProviderUpdatedAtCheck(top10FieldsTarget?.updatedAt),
    }) : null,
    titleValidity: ["title", "title-list"].includes(contractGroup) ? Object.freeze({
      dateClasses: Object.freeze({
        premiere: responseDateValueClass(titleData?.premiere),
        premiereOnline: responseDateValueClass(titleData?.premiereOnline),
      }),
      numberClasses: Object.freeze({
        length: responseNumberValueClass(titleData?.length, { min: 1, max: 2_000 }),
        imdbId: responseNumberValueClass(titleData?.imdbId, { min: 1, max: 9_999_999_999 }),
        tmdbId: responseNumberValueClass(titleData?.tmdbId, { min: 1, max: 999_999_999 }),
      }),
      textClasses: Object.freeze({
        id: responseTextValueClass(titleData?.id, 48),
        title: responseTextValueClass(titleData?.title, 240),
        description: responseTextValueClass(titleData?.description, 4_000),
        updatedAt: responseTextValueClass(titleData?.updatedAt, 40),
        link: responseTextValueClass(titleData?.link, 500),
      }),
      patternChecks: Object.freeze({
        sourceId: responsePatternCheck(titleData?.id, ID_PATTERNS.title),
        countryId: responseRelationIdPatternCheck(titleData?.country, ID_PATTERNS.country),
        companyId: responseRelationIdPatternCheck(titleData?.company, ID_PATTERNS.company),
        genreId: responseRelationIdPatternCheck(titleData?.genre, ID_PATTERNS.genre),
        keywordId: responseRelationIdPatternCheck(titleData?.keyword, ID_PATTERNS.keyword),
        providerUpdatedAt: responsePatternCheck(titleData?.updatedAt, PROVIDER_DATETIME_PATTERN),
        sourceUrl: responsePatternCheck(titleData?.link, /^https:\/\/flixpatrol\.com\/title\/[^?#\s]+\/$/),
      }),
      expectedChecks: Object.freeze({
        expectedTitleIdMatches: contractGroup === "title-list"
          ? (typeof titleData?.id === "string" && titleBatchExpectation(expected)
            ? titleBatchExpectation(expected).has(titleData.id) : null)
          : expectedTitleIdMatches(titleData?.id, expected?.sourceId),
        expectedMediaTypeMatches: expectedMediaTypeMatches(
          titleData?.type,
          contractGroup === "title-list" ? titleListState?.expectedMediaType : expected?.mediaType,
        ),
      }),
    }) : null,
  });
}

function cleanText(value, maxLength) {
  if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > maxLength) return null;
  return value;
}

function nullableText(value, maxLength) {
  if (value === null) return null;
  const cleaned = cleanText(value, maxLength);
  return cleaned === null ? undefined : cleaned;
}

function nullableDate(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? value
    : undefined;
}

function nullableInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  return value === null ? null : Number.isSafeInteger(value) && value >= min && value <= max ? value : undefined;
}

function relationData(value, type, idPattern) {
  const wrapper = record(value);
  const data = record(wrapper?.data);
  if (!wrapper || wrapper.type !== type || !data || typeof data.id !== "string" || !idPattern.test(data.id)) return null;
  return data;
}

function listItems(value, expectedType) {
  if (Array.isArray(value)) return value;
  const wrapper = record(value);
  if (!Array.isArray(wrapper?.data)) return null;
  if (wrapper.type === expectedType) return wrapper.data;
  if (wrapper.type === "list" && wrapper.data.length > 0
      && wrapper.data.every((item) => record(item)?.type === expectedType)) return wrapper.data;
  return null;
}

function normalizeTitleType(value) {
  if (value === FLIXPATROL_TITLE_TYPES.film) return "film";
  if (value === FLIXPATROL_TITLE_TYPES.series) return "series";
  return null;
}

function normalizeChartType(value) {
  if (value === FLIXPATROL_TOP10_TYPES.movies) return "movies";
  if (value === FLIXPATROL_TOP10_TYPES.tvshows) return "tvshows";
  return null;
}

export function normalizeFlixPatrolTitle(value) {
  const wrapper = record(value);
  const data = record(wrapper?.data);
  if (!wrapper || wrapper.type !== "titles" || !data) return null;

  const sourceId = cleanText(data.id, 48);
  const title = cleanText(data.title, 240);
  const mediaType = normalizeTitleType(data.type);
  const premiere = nullableDate(data.premiere);
  const premiereOnline = nullableDate(data.premiereOnline);
  const runtimeMinutes = data.length === 0
    ? null
    : nullableInteger(data.length, { min: 1, max: 2_000 });
  const imdbNumericId = nullableInteger(data.imdbId, { min: 1, max: 9_999_999_999 });
  const tmdbNumericId = nullableInteger(data.tmdbId, { min: 1, max: 999_999_999 });
  const providerUpdatedAt = cleanText(data.updatedAt, 40);
  const sourceUrl = cleanText(data.link, 500);
  if (!sourceId || !ID_PATTERNS.title.test(sourceId) || !title || !mediaType
      || premiere === undefined || premiereOnline === undefined || runtimeMinutes === undefined
      || imdbNumericId === undefined || tmdbNumericId === undefined
      || !providerUpdatedAt || !PROVIDER_DATETIME_PATTERN.test(providerUpdatedAt)
      || !sourceUrl || !/^https:\/\/flixpatrol\.com\/title\/[^?#\s]+\/$/.test(sourceUrl)) return null;

  const country = data.country === null ? null : relationData(data.country, "countries", ID_PATTERNS.country);
  const company = data.company === null ? null : relationData(data.company, "companies", ID_PATTERNS.company);
  const genre = data.genre === null ? null : relationData(data.genre, "genres", ID_PATTERNS.genre);
  const keyword = data.keyword === null ? null : relationData(data.keyword, "keywords", ID_PATTERNS.keyword);
  if ((data.country !== null && !country) || (data.company !== null && !company)
      || (data.genre !== null && !genre) || (data.keyword !== null && !keyword)) return null;

  const description = nullableText(data.description, 4_000);
  if (description === undefined) return null;
  return Object.freeze({
    sourceId,
    mediaType,
    title,
    premiere,
    releaseYear: premiere === null ? null : Number(premiere.slice(0, 4)),
    premiereOnline,
    runtimeMinutes,
    imdbNumericId: imdbNumericId === null ? null : String(imdbNumericId),
    imdbId: imdbNumericId === null ? null : `tt${String(imdbNumericId).padStart(7, "0")}`,
    tmdbId: tmdbNumericId === null ? null : String(tmdbNumericId),
    countryId: country?.id ?? null,
    companyId: company?.id ?? null,
    genreId: genre?.id ?? null,
    keywordId: keyword?.id ?? null,
    description,
    providerUpdatedAt,
    sourceUrl,
  });
}

export function normalizeFlixPatrolTitleList(value) {
  const items = listItems(value, "titles");
  if (!items) return null;
  const normalized = items.map(normalizeFlixPatrolTitle);
  if (normalized.some((item) => !item)) return null;
  if (new Set(normalized.map((item) => item.sourceId)).size !== normalized.length) return null;
  return Object.freeze(normalized);
}

export function selectExactFlixPatrolTitleBatch(items, sourceIds, mediaTypes) {
  if (!Array.isArray(items) || !Array.isArray(sourceIds) || !Array.isArray(mediaTypes)
      || sourceIds.length < 1 || sourceIds.length > 10 || mediaTypes.length !== sourceIds.length
      || new Set(sourceIds).size !== sourceIds.length
      || sourceIds.some((id) => !ID_PATTERNS.title.test(id))
      || mediaTypes.some((type) => !Object.hasOwn(FLIXPATROL_TITLE_TYPES, type))) return null;
  const expected = new Map(sourceIds.map((id, index) => [id, mediaTypes[index]]));
  if (items.length !== expected.size || new Set(items.map((item) => item?.sourceId)).size !== items.length) return null;
  if (items.some((item) => !item || expected.get(item.sourceId) !== item.mediaType)) return null;
  return Object.freeze(sourceIds.map((id) => items.find((item) => item.sourceId === id)));
}

export function normalizeFlixPatrolVocabularyList(value, resourceType) {
  if (!Object.hasOwn(FLIXPATROL_VOCABULARY_TYPES, resourceType)) return null;
  const items = listItems(value, resourceType);
  if (!items || items.length < 1 || items.length > 10) return null;
  const idPattern = resourceType === "genres" ? ID_PATTERNS.genre : ID_PATTERNS.keyword;
  const normalized = items.map((item) => {
    const wrapper = record(item);
    const data = record(wrapper?.data);
    const sourceId = cleanText(data?.id, 48);
    const name = cleanText(data?.name, 240);
    if (!wrapper || wrapper.type !== resourceType || !sourceId || !idPattern.test(sourceId) || !name) return null;
    if (resourceType === "genres") {
      const mediaType = normalizeTitleType(data.type);
      if (!mediaType) return null;
      return Object.freeze({ sourceId, name, mediaType, providerType: data.type });
    }
    return Object.freeze({ sourceId, name, mediaType: null, providerType: null });
  });
  if (normalized.some((item) => !item)
      || new Set(normalized.map((item) => item.sourceId)).size !== normalized.length) return null;
  return Object.freeze(normalized);
}

export function selectExactFlixPatrolVocabularyBatch(items, sourceIds) {
  if (!Array.isArray(items) || !Array.isArray(sourceIds) || sourceIds.length < 1 || sourceIds.length > 10
      || new Set(sourceIds).size !== sourceIds.length || items.length !== sourceIds.length) return null;
  const expected = new Set(sourceIds);
  if (items.some((item) => !item || !expected.has(item.sourceId))
      || new Set(items.map((item) => item.sourceId)).size !== items.length) return null;
  return Object.freeze(sourceIds.map((id) => items.find((item) => item.sourceId === id)));
}

export function normalizeFlixPatrolTop10List(value, expected) {
  const items = listItems(value, "top10s");
  const expectedMediaType = expected?.chartType === "movies" ? "film" : expected?.chartType === "tvshows" ? "series" : null;
  if (!items || items.length < 1 || items.length > 10 || !expectedMediaType || !DATE_PATTERN.test(expected?.date ?? "")
      || !ID_PATTERNS.company.test(expected?.companyId ?? "") || !ID_PATTERNS.country.test(expected?.countryId ?? "")) return null;

  const normalized = items.map((item) => {
    const wrapper = record(item);
    const data = record(wrapper?.data);
    const movie = relationData(data?.movie, "titles", ID_PATTERNS.title);
    const company = relationData(data?.company, "companies", ID_PATTERNS.company);
    const country = relationData(data?.country, "countries", ID_PATTERNS.country);
    const dateWrapper = record(data?.date);
    const date = dateWrapper?.type === "daterange" ? record(dateWrapper.data) : dateWrapper;
    const chartType = normalizeChartType(data?.type);
    const rankingLast = data?.rankingLast === 0 ? null : data?.rankingLast;
    if (!wrapper || wrapper.type !== "top10s" || !data || !movie || !company || !country || !date
        || company.id !== expected.companyId || country.id !== expected.countryId || chartType !== expected.chartType
        || date.type !== 1 || date.from !== expected.date || date.to !== expected.date
        || !Number.isInteger(data.ranking) || data.ranking < 1 || data.ranking > 10
        || !providerNullableInt(rankingLast, 1) || !Number.isSafeInteger(data.value) || data.value < 0
        || !providerNullableInt(data.valueLast, 0) || !providerNullableInt(data.daysTotal, 0)
        || typeof data.updatedAt !== "string" || !PROVIDER_DATETIME_PATTERN.test(data.updatedAt)) return null;
    return Object.freeze({
      sourceId: movie.id,
      mediaType: expectedMediaType,
      ranking: data.ranking,
      rankingLast,
      value: data.value,
      valueLast: data.valueLast,
      daysTotal: data.daysTotal,
      providerUpdatedAt: data.updatedAt,
    });
  });
  if (normalized.some((item) => !item)
      || new Set(normalized.map((item) => item.sourceId)).size !== normalized.length
      || new Set(normalized.map((item) => item.ranking)).size !== normalized.length) return null;
  return Object.freeze(normalized.sort((a, b) => a.ranking - b.ranking));
}

function providerNullableInt(value, min) {
  return value === null || (Number.isSafeInteger(value) && value >= min);
}

export function normalizeTitleFingerprint(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().toLocaleLowerCase("und").replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ")
    : "";
}

export function selectStrictFlixPatrolTitleCandidate({ title, mediaType, releaseYear }, candidates) {
  if (!cleanText(title, 240) || !["film", "series"].includes(mediaType)
      || !Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2100 || !Array.isArray(candidates)) {
    return Object.freeze({ status: "invalid_request", sourceId: null, candidateCount: 0 });
  }
  const fingerprint = normalizeTitleFingerprint(title);
  const matches = candidates.filter((candidate) => candidate && candidate.mediaType === mediaType
    && candidate.releaseYear === releaseYear && normalizeTitleFingerprint(candidate.title) === fingerprint);
  const ids = [...new Set(matches.map((candidate) => candidate.sourceId))];
  if (ids.length === 0) return Object.freeze({ status: "not_found", sourceId: null, candidateCount: 0 });
  if (ids.length !== 1) return Object.freeze({ status: "ambiguous_blocked", sourceId: null, candidateCount: ids.length });
  return Object.freeze({ status: "resolved", sourceId: ids[0], candidateCount: 1 });
}

export function isFlixPatrolId(kind, value) {
  return typeof value === "string" && Boolean(ID_PATTERNS[kind]?.test(value));
}
