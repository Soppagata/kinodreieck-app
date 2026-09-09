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
export const FLIXPATROL_AT_SOURCES = Object.freeze({
  country: Object.freeze({ id: "cnt_gGE4RaeXpyz2U9Q5tEMYDwri", code: "AT", name: "Austria" }),
  companies: Object.freeze({
    prime: Object.freeze({ id: "cmp_qypvowjqFhEIpCc0HlQ6VoYk", name: "Amazon Prime" }),
    disney: Object.freeze({ id: "cmp_oGtsgdpOrjIu3XzTEnWPt87Y", name: "Disney+" }),
    appleTv: Object.freeze({ id: "cmp_VvmYc7OphiUds0Hgjbz5MESn", name: "Apple TV" }),
    appleStore: Object.freeze({ id: "cmp_phDSns8OP1rtHnX6QwlEKhiq", name: "Apple TV Store" }),
  }),
});

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
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
  return wrapper?.type === expectedType && Array.isArray(wrapper.data) ? wrapper.data : null;
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
  const runtimeMinutes = nullableInteger(data.length, { min: 1, max: 2_000 });
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
    if (!wrapper || wrapper.type !== "top10s" || !data || !movie || !company || !country || !date
        || company.id !== expected.companyId || country.id !== expected.countryId || chartType !== expected.chartType
        || date.type !== 1 || date.from !== expected.date || date.to !== expected.date
        || !Number.isInteger(data.ranking) || data.ranking < 1 || data.ranking > 10
        || !providerNullableInt(data.rankingLast, 1) || !Number.isSafeInteger(data.value) || data.value < 0
        || !providerNullableInt(data.valueLast, 0) || !providerNullableInt(data.daysTotal, 0)
        || typeof data.updatedAt !== "string" || !PROVIDER_DATETIME_PATTERN.test(data.updatedAt)) return null;
    return Object.freeze({
      sourceId: movie.id,
      mediaType: expectedMediaType,
      ranking: data.ranking,
      rankingLast: data.rankingLast,
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
