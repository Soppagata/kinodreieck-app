const SCHEDULE_HEADER = "x-kd-flixpatrol-usage";
const SCHEDULE_VALUE = "scheduled-daily-v1";
const TOP10_DIAGNOSTIC_VALUE = "manual-top10-contract-v1";
const TITLE_DIAGNOSTIC_VALUE = "manual-title-contract-v1";
const TITLE_BATCH_DIAGNOSTIC_VALUE = "manual-title-batch-contract-v1";
const RESPONSE_VALUE_CLASSES = new Set(["missing", "null", "array", "object", "string", "number", "boolean", "other"]);
const RESPONSE_ENUM_CLASSES = new Set([
  ...[...RESPONSE_VALUE_CLASSES].map((value) => `${value}:other`),
  "known:apiquota", "known:top10s", "known:titles", "known:1", "known:2", "known:3",
  "known:daterange", "known:countries", "known:companies", "known:collection",
  "known:list", "known:array", "known:resultset", "known:genres", "known:keywords",
]);
const TOP10_FIELDS = Object.freeze([
  "movie", "company", "country", "type", "date", "ranking", "rankingLast",
  "value", "valueLast", "daysTotal", "updatedAt",
]);
const TOP10_LIST_PROBLEM_CLASSES = new Set([
  "outer-shape", "empty", "over-ten", "row-invalid",
  "duplicate-source-id", "duplicate-ranking", "none",
]);
const TITLE_LIST_PROBLEM_CLASSES = new Set([
  "outer-shape", "empty", "over-ten", "row-invalid", "duplicate-source-id",
  "unexpected-source-id", "media-type-mismatch", "exact-count-mismatch", "none",
]);
const RANKING_LAST_CLASSES = new Set([
  "null", "integer:zero", "integer:negative", "integer:positive", "invalid",
]);
const NULLABLE_INTEGER_CLASSES = new Set(["null", "integer:valid", "invalid"]);
const TOP10_CONTRACT_CHECKS = Object.freeze([
  "companyMatchesExpected", "countryMatchesExpected", "chartTypeMatchesExpected",
  "dateRangeMatchesExpected", "titleIdValid", "providerUpdatedAtValid",
]);
const TITLE_FIELDS = Object.freeze([
  "id", "title", "premiere", "country", "company", "genre", "keyword",
  "description", "updatedAt", "link", "type", "premiereOnline", "length",
  "imdbId", "tmdbId",
]);
const TITLE_DATE_FIELDS = Object.freeze(["premiere", "premiereOnline"]);
const TITLE_NUMBER_FIELDS = Object.freeze(["length", "imdbId", "tmdbId"]);
const TITLE_TEXT_FIELDS = Object.freeze(["id", "title", "description", "updatedAt", "link"]);
const TITLE_PATTERN_FIELDS = Object.freeze([
  "sourceId", "countryId", "companyId", "genreId", "keywordId", "providerUpdatedAt", "sourceUrl",
]);
const TITLE_EXPECTED_FIELDS = Object.freeze(["expectedTitleIdMatches", "expectedMediaTypeMatches"]);
const DATE_VALUE_CLASSES = new Set(["valid", "empty", "zero", "invalid", "null"]);
const NUMBER_VALUE_CLASSES = new Set([
  "valid", "zero", "negative", "fraction", "out-of-range", "null", "missing",
]);
const TEXT_VALUE_CLASSES = new Set([
  "valid", "empty", "leading-or-trailing-whitespace", "too-long", "missing",
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function instant(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return value;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function normalizeFlixPatrolUsage(value) {
  const keys = [
    "currentUtcMonth", "lastAttemptAt", "lastStatus", "lastSuccessAt",
    "planLimit", "quota", "sinceSetup",
  ];
  if (!exactKeys(value, keys)
      || !exactKeys(value.sinceSetup, ["attemptedRequests", "completedRequests", "failedRequests", "successfulRequests"])
      || ![value.sinceSetup.attemptedRequests, value.sinceSetup.completedRequests,
        value.sinceSetup.successfulRequests, value.sinceSetup.failedRequests].every(nonnegativeInteger)
      || value.sinceSetup.completedRequests !== value.sinceSetup.successfulRequests + value.sinceSetup.failedRequests
      || value.sinceSetup.attemptedRequests < value.sinceSetup.completedRequests
      || !exactKeys(value.currentUtcMonth, ["attemptedRequests", "month"])
      || typeof value.currentUtcMonth.month !== "string"
      || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.currentUtcMonth.month)
      || !nonnegativeInteger(value.currentUtcMonth.attemptedRequests)
      || value.currentUtcMonth.attemptedRequests > value.sinceSetup.attemptedRequests
      || value.planLimit !== 1000
      || !["empty", "claimed", "succeeded", "http_error", "invalid_response", "transport_error"].includes(value.lastStatus)
      || instant(value.lastAttemptAt) === undefined
      || instant(value.lastSuccessAt) === undefined) return null;
  let quota = null;
  if (value.quota !== null) {
    if (!exactKeys(value.quota, ["available", "limit", "limitExtra", "observedAt", "requestStartedAt", "resetAt", "used"])
        || ![value.quota.used, value.quota.available, value.quota.limit, value.quota.limitExtra].every(nonnegativeInteger)
        || value.quota.limit < 1
        || typeof value.quota.resetAt !== "string"
        || instant(value.quota.observedAt) === undefined
        || instant(value.quota.requestStartedAt) === undefined
        || Date.parse(value.quota.requestStartedAt) > Date.parse(value.quota.observedAt)) return null;
    quota = Object.freeze({ ...value.quota });
  }
  return Object.freeze({ ...value, quota });
}

export function parseFlixPatrolServiceKeys(raw, legacy = "") {
  const values = [];
  if (typeof raw === "string" && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const value of Object.values(parsed)) {
          if (typeof value === "string" && value) values.push(value);
        }
      }
    } catch { /* legacy below */ }
  }
  if (typeof legacy === "string" && legacy) values.push(legacy);
  return [...new Set(values)];
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % Math.max(a.length, 1)] || 0)
      ^ (b[index % Math.max(b.length, 1)] || 0);
  }
  return difference === 0;
}

function authorized(request, serviceKeys) {
  if (!Array.isArray(serviceKeys) || serviceKeys.length === 0) return false;
  const apiKey = request.headers.get("apikey") || "";
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const bearer = authorization.slice(7);
  return serviceKeys.some((key) => constantTimeEqual(apiKey, key) && constantTimeEqual(bearer, key));
}

async function hasBody(request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && contentLength !== "0") return true;
  if (request.body === null) return false;
  // Supabase can forward an empty POST as a stream. Test its bytes, not
  // the presence of the stream, just as the existing server jobs do.
  const reader = request.body.getReader();
  try {
    for (let emptyChunks = 0; emptyChunks < 8; emptyChunks += 1) {
      const chunk = await reader.read();
      if (chunk.done) return false;
      if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > 0) return true;
    }
    return true;
  } catch {
    return true;
  } finally {
    try { await reader.cancel(); } catch { /* invalid stream remains rejected */ }
  }
}

function response(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safeError(error) {
  const code = typeof error?.code === "string" && /^FLIXPATROL_[A-Z0-9_]{1,48}$/.test(error.code)
    ? error.code : "FLIXPATROL_USAGE_FAILED";
  const providerRequests = error?.providerRequests === 1 ? 1 : 0;
  return { code, providerRequests };
}

function safeNullableCount(value) {
  return value === null || nonnegativeInteger(value);
}

function safeResponseClass(value) {
  return typeof value === "string" && RESPONSE_VALUE_CLASSES.has(value);
}

function safeEnumClass(value) {
  return typeof value === "string" && RESPONSE_ENUM_CLASSES.has(value);
}

function safeBooleanCheck(value) {
  return value === null || typeof value === "boolean";
}

function normalizeRelationShape(value) {
  if (!exactKeys(value, ["kind", "typeClass", "dataKind", "idKind"])
      || !safeResponseClass(value.kind) || !safeEnumClass(value.typeClass)
      || !safeResponseClass(value.dataKind) || !safeResponseClass(value.idKind)) return null;
  return Object.freeze({
    kind: value.kind, typeClass: value.typeClass, dataKind: value.dataKind, idKind: value.idKind,
  });
}

function normalizeTop10Diagnostic(value) {
  const keys = [
    "schemaVersion", "contractGroup", "failureClass", "rootKind", "rootArrayLength",
    "rootTypeClass", "dataKind", "dataArrayLength", "itemCount", "listLengthClass",
    "listProblemClass", "samplePosition", "sampleItemKind", "sampleItemTypeClass",
    "sampleDataKind", "whitelistFieldTypes", "enumClasses", "relations", "rankingClass",
    "nullableIntegerClasses", "dateShape", "contractChecks", "titleValidity",
  ];
  if (!exactKeys(value, keys) || value.schemaVersion !== "flixpatrol-response-shape-v1"
      || value.contractGroup !== "top10-list"
      || !["json-error", "contract-mismatch"].includes(value.failureClass)
      || !safeResponseClass(value.rootKind) || !safeNullableCount(value.rootArrayLength)
      || !safeEnumClass(value.rootTypeClass) || !safeResponseClass(value.dataKind)
      || !safeNullableCount(value.dataArrayLength) || !nonnegativeInteger(value.itemCount)
      || !["not-array", "empty", "one-to-ten", "over-ten"].includes(value.listLengthClass)
      || !TOP10_LIST_PROBLEM_CLASSES.has(value.listProblemClass)
      || !(value.samplePosition === null
        || (Number.isSafeInteger(value.samplePosition) && value.samplePosition >= 1 && value.samplePosition <= 10))
      || !safeResponseClass(value.sampleItemKind) || !safeEnumClass(value.sampleItemTypeClass)
      || !safeResponseClass(value.sampleDataKind)
      || !exactKeys(value.whitelistFieldTypes, TOP10_FIELDS)
      || TOP10_FIELDS.some((field) => !safeResponseClass(value.whitelistFieldTypes[field]))
      || !exactKeys(value.enumClasses, ["chartType"]) || !safeEnumClass(value.enumClasses.chartType)
      || !exactKeys(value.relations, ["movie", "company", "country"])
      || !["missing:other", "null:other", "string:other", "number:other", "boolean:other",
        "object:other", "array:other", "other:other", "integer:one-to-ten",
        "integer:out-of-range", "number:non-integer"].includes(value.rankingClass)
      || !exactKeys(value.nullableIntegerClasses, ["rankingLast", "valueLast", "daysTotal"])
      || !RANKING_LAST_CLASSES.has(value.nullableIntegerClasses.rankingLast)
      || !NULLABLE_INTEGER_CLASSES.has(value.nullableIntegerClasses.valueLast)
      || !NULLABLE_INTEGER_CLASSES.has(value.nullableIntegerClasses.daysTotal)
      || !exactKeys(value.contractChecks, TOP10_CONTRACT_CHECKS)
      || TOP10_CONTRACT_CHECKS.some((field) => !safeBooleanCheck(value.contractChecks[field]))
      || value.titleValidity !== null
      || !exactKeys(value.dateShape, ["kind", "formClass", "nodeKind", "fieldTypes", "rangeTypeClass"])
      || !safeResponseClass(value.dateShape.kind)
      || !["wrapped-daterange", "direct-date", "invalid"].includes(value.dateShape.formClass)
      || !safeResponseClass(value.dateShape.nodeKind)
      || !exactKeys(value.dateShape.fieldTypes, ["type", "from", "to"])
      || !["type", "from", "to"].every((field) => safeResponseClass(value.dateShape.fieldTypes[field]))
      || !safeEnumClass(value.dateShape.rangeTypeClass)) return null;
  const relations = {};
  for (const name of ["movie", "company", "country"]) {
    const relation = normalizeRelationShape(value.relations[name]);
    if (!relation) return null;
    relations[name] = relation;
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    contractGroup: value.contractGroup,
    failureClass: value.failureClass,
    rootKind: value.rootKind,
    rootArrayLength: value.rootArrayLength,
    rootTypeClass: value.rootTypeClass,
    dataKind: value.dataKind,
    dataArrayLength: value.dataArrayLength,
    itemCount: value.itemCount,
    listLengthClass: value.listLengthClass,
    listProblemClass: value.listProblemClass,
    samplePosition: value.samplePosition,
    sampleItemKind: value.sampleItemKind,
    sampleItemTypeClass: value.sampleItemTypeClass,
    sampleDataKind: value.sampleDataKind,
    whitelistFieldTypes: Object.freeze(Object.fromEntries(
      TOP10_FIELDS.map((field) => [field, value.whitelistFieldTypes[field]]),
    )),
    enumClasses: Object.freeze({ chartType: value.enumClasses.chartType }),
    relations: Object.freeze(relations),
    rankingClass: value.rankingClass,
    nullableIntegerClasses: Object.freeze({
      rankingLast: value.nullableIntegerClasses.rankingLast,
      valueLast: value.nullableIntegerClasses.valueLast,
      daysTotal: value.nullableIntegerClasses.daysTotal,
    }),
    contractChecks: Object.freeze(Object.fromEntries(
      TOP10_CONTRACT_CHECKS.map((field) => [field, value.contractChecks[field]]),
    )),
    dateShape: Object.freeze({
      kind: value.dateShape.kind,
      formClass: value.dateShape.formClass,
      nodeKind: value.dateShape.nodeKind,
      fieldTypes: Object.freeze({
        type: value.dateShape.fieldTypes.type,
        from: value.dateShape.fieldTypes.from,
        to: value.dateShape.fieldTypes.to,
      }),
      rangeTypeClass: value.dateShape.rangeTypeClass,
    }),
    titleValidity: null,
  });
}

function normalizeTitleDiagnostic(value, contractGroup = "title") {
  const keys = [
    "schemaVersion", "contractGroup", "failureClass", "rootKind", "rootArrayLength",
    "rootTypeClass", "dataKind", "dataArrayLength", "itemCount", "listLengthClass",
    "listProblemClass", "samplePosition", "sampleItemKind", "sampleItemTypeClass",
    "sampleDataKind", "whitelistFieldTypes", "enumClasses", "relations", "rankingClass",
    "nullableIntegerClasses", "dateShape", "contractChecks", "titleValidity",
  ];
  const validity = value?.titleValidity;
  const titleList = contractGroup === "title-list";
  if (!exactKeys(value, keys) || value.schemaVersion !== "flixpatrol-response-shape-v1"
      || !["title", "title-list"].includes(contractGroup) || value.contractGroup !== contractGroup
      || !["json-error", "contract-mismatch"].includes(value.failureClass)
      || !safeResponseClass(value.rootKind) || !safeNullableCount(value.rootArrayLength)
      || !safeEnumClass(value.rootTypeClass) || !safeResponseClass(value.dataKind)
      || !safeNullableCount(value.dataArrayLength) || !nonnegativeInteger(value.itemCount)
      || (titleList
        ? !["not-array", "empty", "one-to-ten", "over-ten"].includes(value.listLengthClass)
          || !TITLE_LIST_PROBLEM_CLASSES.has(value.listProblemClass)
          || !(value.samplePosition === null
            || (Number.isSafeInteger(value.samplePosition) && value.samplePosition >= 1 && value.samplePosition <= 10))
        : value.listLengthClass !== "not-array" || value.listProblemClass !== "not-applicable"
          || value.samplePosition !== null)
      || !safeResponseClass(value.sampleItemKind) || !safeEnumClass(value.sampleItemTypeClass)
      || !safeResponseClass(value.sampleDataKind)
      || !exactKeys(value.whitelistFieldTypes, TITLE_FIELDS)
      || TITLE_FIELDS.some((field) => !safeResponseClass(value.whitelistFieldTypes[field]))
      || !exactKeys(value.enumClasses, ["titleType"]) || !safeEnumClass(value.enumClasses.titleType)
      || !exactKeys(value.relations, ["country", "company", "genre", "keyword"])
      || value.rankingClass !== "not-applicable" || value.nullableIntegerClasses !== null
      || value.dateShape !== null || value.contractChecks !== null
      || !exactKeys(validity, ["dateClasses", "numberClasses", "textClasses", "patternChecks", "expectedChecks"])
      || !exactKeys(validity.dateClasses, TITLE_DATE_FIELDS)
      || TITLE_DATE_FIELDS.some((field) => validity.dateClasses[field] !== null
        && !DATE_VALUE_CLASSES.has(validity.dateClasses[field]))
      || !exactKeys(validity.numberClasses, TITLE_NUMBER_FIELDS)
      || TITLE_NUMBER_FIELDS.some((field) => validity.numberClasses[field] !== null
        && !NUMBER_VALUE_CLASSES.has(validity.numberClasses[field]))
      || !exactKeys(validity.textClasses, TITLE_TEXT_FIELDS)
      || TITLE_TEXT_FIELDS.some((field) => validity.textClasses[field] !== null
        && !TEXT_VALUE_CLASSES.has(validity.textClasses[field]))
      || !exactKeys(validity.patternChecks, TITLE_PATTERN_FIELDS)
      || TITLE_PATTERN_FIELDS.some((field) => !safeBooleanCheck(validity.patternChecks[field]))
      || !exactKeys(validity.expectedChecks, TITLE_EXPECTED_FIELDS)
      || TITLE_EXPECTED_FIELDS.some((field) => !safeBooleanCheck(validity.expectedChecks[field]))) return null;
  const relations = {};
  for (const name of ["country", "company", "genre", "keyword"]) {
    const relation = normalizeRelationShape(value.relations[name]);
    if (!relation) return null;
    relations[name] = relation;
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    contractGroup: value.contractGroup,
    failureClass: value.failureClass,
    rootKind: value.rootKind,
    rootArrayLength: value.rootArrayLength,
    rootTypeClass: value.rootTypeClass,
    dataKind: value.dataKind,
    dataArrayLength: value.dataArrayLength,
    itemCount: value.itemCount,
    listLengthClass: value.listLengthClass,
    listProblemClass: value.listProblemClass,
    samplePosition: value.samplePosition,
    sampleItemKind: value.sampleItemKind,
    sampleItemTypeClass: value.sampleItemTypeClass,
    sampleDataKind: value.sampleDataKind,
    whitelistFieldTypes: Object.freeze(Object.fromEntries(
      TITLE_FIELDS.map((field) => [field, value.whitelistFieldTypes[field]]),
    )),
    enumClasses: Object.freeze({ titleType: value.enumClasses.titleType }),
    relations: Object.freeze(relations),
    rankingClass: value.rankingClass,
    nullableIntegerClasses: null,
    dateShape: null,
    contractChecks: null,
    titleValidity: Object.freeze({
      dateClasses: Object.freeze(Object.fromEntries(
        TITLE_DATE_FIELDS.map((field) => [field, validity.dateClasses[field]]),
      )),
      numberClasses: Object.freeze(Object.fromEntries(
        TITLE_NUMBER_FIELDS.map((field) => [field, validity.numberClasses[field]]),
      )),
      textClasses: Object.freeze(Object.fromEntries(
        TITLE_TEXT_FIELDS.map((field) => [field, validity.textClasses[field]]),
      )),
      patternChecks: Object.freeze(Object.fromEntries(
        TITLE_PATTERN_FIELDS.map((field) => [field, validity.patternChecks[field]]),
      )),
      expectedChecks: Object.freeze(Object.fromEntries(
        TITLE_EXPECTED_FIELDS.map((field) => [field, validity.expectedChecks[field]]),
      )),
    }),
  });
}

/**
 * @param {{
 *   serviceKeys?: string[],
 *   readUsage?: () => Promise<unknown>,
 *   refreshUsage?: () => Promise<{usage: unknown, providerRequests: number}>,
 *   diagnoseTop10?: () => Promise<{items: unknown[], providerRequests: number}>,
 *   diagnoseTitle?: () => Promise<{title: unknown, providerRequests: number}>,
 *   diagnoseTitleBatch?: () => Promise<{items: unknown[], providerRequests: number}>
 * }} dependencies
 */
export function createFlixPatrolUsageHandler({
  serviceKeys = [],
  readUsage,
  refreshUsage,
  diagnoseTop10,
  diagnoseTitle,
  diagnoseTitleBatch,
} = {}) {
  return async function handler(request) {
    if (request.headers.get("origin") !== null || !authorized(request, serviceKeys)) {
      return response({ ok: false, status: "forbidden", providerRequests: 0 }, 403);
    }
    if (await hasBody(request)) {
      return response({ ok: false, status: "invalid-request", providerRequests: 0 }, 400);
    }

    if (request.method === "GET" && request.headers.get(SCHEDULE_HEADER) === null) {
      try {
        const usage = normalizeFlixPatrolUsage(await readUsage?.());
        return usage
          ? response({ ok: true, status: "read", providerRequests: 0, usage }, 200)
          : response({ ok: false, status: "unavailable", providerRequests: 0 }, 503);
      } catch {
        return response({ ok: false, status: "unavailable", providerRequests: 0 }, 503);
      }
    }

    if (request.method !== "POST" || request.headers.get(SCHEDULE_HEADER) !== SCHEDULE_VALUE) {
      if (request.method === "POST" && request.headers.get(SCHEDULE_HEADER) === TOP10_DIAGNOSTIC_VALUE) {
        try {
          const result = await diagnoseTop10?.();
          if (!Array.isArray(result?.items) || result.items.length < 1 || result.items.length > 10
              || result?.providerRequests !== 1) {
            return response({
              ok: false, status: "failed", code: "FLIXPATROL_TOP10_UNPROVEN",
              providerRequests: result?.providerRequests === 1 ? 1 : 0,
            }, 500);
          }
          return response({
            ok: true, status: "valid-contract", providerRequests: 1, itemCount: result.items.length,
          }, 200);
        } catch (error) {
          const safe = safeError(error);
          const diagnostic = safe.code === "FLIXPATROL_INVALID_RESPONSE"
            ? normalizeTop10Diagnostic(error?.diagnostic) : null;
          return response({
            ok: false,
            status: diagnostic ? "invalid-response" : "failed",
            ...safe,
            ...(diagnostic ? { diagnostic } : {}),
          }, 502);
        }
      }
      if (request.method === "POST" && request.headers.get(SCHEDULE_HEADER) === TITLE_BATCH_DIAGNOSTIC_VALUE) {
        try {
          const result = await diagnoseTitleBatch?.();
          if (!Array.isArray(result?.items) || result.items.length !== 10 || result?.providerRequests !== 1) {
            return response({
              ok: false, status: "failed", code: "FLIXPATROL_TITLE_BATCH_UNPROVEN",
              providerRequests: result?.providerRequests === 1 ? 1 : 0,
            }, 500);
          }
          return response({
            ok: true, status: "valid-contract", providerRequests: 1, itemCount: result.items.length,
          }, 200);
        } catch (error) {
          const safe = safeError(error);
          const diagnostic = safe.code === "FLIXPATROL_INVALID_RESPONSE"
            ? normalizeTitleDiagnostic(error?.diagnostic, "title-list") : null;
          return response({
            ok: false,
            status: diagnostic ? "invalid-response" : "failed",
            ...safe,
            ...(diagnostic ? { diagnostic } : {}),
          }, 502);
        }
      }
      if (request.method === "POST" && request.headers.get(SCHEDULE_HEADER) === TITLE_DIAGNOSTIC_VALUE) {
        try {
          const result = await diagnoseTitle?.();
          if (!result?.title || typeof result.title !== "object" || Array.isArray(result.title)
              || result?.providerRequests !== 1) {
            return response({
              ok: false, status: "failed", code: "FLIXPATROL_TITLE_UNPROVEN",
              providerRequests: result?.providerRequests === 1 ? 1 : 0,
            }, 500);
          }
          return response({ ok: true, status: "valid-contract", providerRequests: 1 }, 200);
        } catch (error) {
          const safe = safeError(error);
          const diagnostic = safe.code === "FLIXPATROL_INVALID_RESPONSE"
            ? normalizeTitleDiagnostic(error?.diagnostic) : null;
          return response({
            ok: false,
            status: diagnostic ? "invalid-response" : "failed",
            ...safe,
            ...(diagnostic ? { diagnostic } : {}),
          }, 502);
        }
      }
      return response({ ok: false, status: "invalid-request", providerRequests: 0 }, 405);
    }

    try {
      const result = await refreshUsage?.();
      const usage = normalizeFlixPatrolUsage(result?.usage);
      if (!usage || result?.providerRequests !== 1) {
        const providerRequests = result?.providerRequests === 1 ? 1 : 0;
        return response({ ok: false, status: "failed", code: "FLIXPATROL_USAGE_UNPROVEN", providerRequests }, 500);
      }
      return response({ ok: true, status: "refreshed", providerRequests: 1, usage }, 200);
    } catch (error) {
      const safe = safeError(error);
      return response({ ok: false, status: "failed", ...safe }, 502);
    }
  };
}

export const FLIXPATROL_USAGE_SCHEDULE_HEADER = SCHEDULE_HEADER;
export const FLIXPATROL_USAGE_SCHEDULE_VALUE = SCHEDULE_VALUE;
export const FLIXPATROL_USAGE_TOP10_DIAGNOSTIC_VALUE = TOP10_DIAGNOSTIC_VALUE;
export const FLIXPATROL_USAGE_TITLE_DIAGNOSTIC_VALUE = TITLE_DIAGNOSTIC_VALUE;
export const FLIXPATROL_USAGE_TITLE_BATCH_DIAGNOSTIC_VALUE = TITLE_BATCH_DIAGNOSTIC_VALUE;
