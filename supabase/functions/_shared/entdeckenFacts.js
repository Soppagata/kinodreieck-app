/* Migrationsfreie Faktenanreicherung fuer den versionierten Entdecken-Pool.
   Der Anbieter darf Identitaet und neutrale Fakten liefern, aber weder
   Geschmack noch Score. Alle fremden Werte passieren diesen deterministischen
   Vertrag, bevor sie Snapshot oder Ranker erreichen. */

export const ENTDECKEN_FACTS_CONTRACT_VERSION = "entdecken-facts-batch-v1";
export const ENTDECKEN_FACTS_SNAPSHOT_VERSION = "entdecken-facts-snapshot-v1";
export const ENTDECKEN_FACTS_PROVIDER_VERSION = "anthropic-web-search-20250305";
export const ENTDECKEN_FACTS_PROMPT_VERSION = "entdecken-facts-v2";
export const ENTDECKEN_WIKIDATA_PROVIDER_VERSION = "wikidata-action-v1";
export const ENTDECKEN_WIKIDATA_LICENSE = "CC0-1.0";
export const ENTDECKEN_FACTS_BATCH_SIZE = 9;
export const ENTDECKEN_FACTS_MAX_BATCH_SIZE = 11;
export const ENTDECKEN_FACTS_RESUME_BATCH_SIZES = Object.freeze([9, 11, 10, 10, 10]);
export const ENTDECKEN_FACTS_RESUME_SEARCH_USES = Object.freeze([9, 8, 8, 8, 8]);
export const ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS = 5;
export const ENTDECKEN_FACTS_MAX_SEARCH_USES_PER_ITEM = 1;
export const ENTDECKEN_FACTS_MAX_SEARCH_USES_TOTAL = 41;
export const ENTDECKEN_FACTS_PILOT_RESOLVED_MIN = 7;
export const ENTDECKEN_FACTS_OK_TTL_DAYS = 90;
export const ENTDECKEN_FACTS_NEGATIVE_TTL_DAYS = 30;

export const ENTDECKEN_FACT_GENRES = Object.freeze([
  "drama", "komoedie", "romantik", "abenteuer", "thriller", "familie",
  "doku", "action", "scifi", "animation", "krimi", "fantasy",
  "musikfilm", "horror", "satire",
]);
export const ENTDECKEN_FACT_TAGS = Object.freeze([
  "kult", "trash", "bis_1979", "1980_1999", "2000_2019", "ab_2020",
]);

const GENRES = new Set(ENTDECKEN_FACT_GENRES);
const TAGS = new Set(ENTDECKEN_FACT_TAGS);
const PERSON_ROLES = new Set(["actor", "director", "creator", "writer"]);
const RESULT_STATUSES = new Set(["resolved", "ambiguous", "unresolved"]);
const CACHE_STATUSES = new Set(["ok", "ambiguous", "unresolved"]);
const MODEL_FORM = /^claude-haiku-4-5(?:-[0-9]{8})?$/;
const QID_FORM = /^Q[1-9]\d*$/;
const IMDB_FORM = /^tt\d{7,10}$/;
const TMDB_FORM = /^[1-9]\d{0,8}$/;

function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value) { return String(value == null ? "" : value).trim(); }
function unique(values) { return [...new Set(values)]; }
function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function safeTitle(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate && candidate === value && candidate.length <= 220
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(candidate)
    ? candidate : null;
}
function safeEntityName(value) {
  const candidate = safeTitle(value);
  return candidate && candidate.length <= 120 ? candidate : null;
}
function canonicalInstant(value) {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function directHttpsUrl(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      && !parsed.port && !parsed.hash ? parsed.href : null;
  } catch { return null; }
}

function wikidataEvidenceQid(value) {
  const url = directHttpsUrl(value);
  if (!url) return null;
  const match = /^https:\/\/www\.wikidata\.org\/wiki\/(Q[1-9]\d*)$/u.exec(url);
  return match ? match[1] : null;
}

function normalizedWikidataExternalIds(value) {
  if (!plain(value) || Object.keys(value).some((key) => !["imdb", "tmdb"].includes(key))) return null;
  const normalized = {};
  if ("imdb" in value) {
    if (typeof value.imdb !== "string" || !IMDB_FORM.test(value.imdb)) return null;
    normalized.imdb = value.imdb;
  }
  if ("tmdb" in value) {
    if (typeof value.tmdb !== "string" || !TMDB_FORM.test(value.tmdb)) return null;
    normalized.tmdb = value.tmdb;
  }
  return Object.freeze(normalized);
}

function validSnapshotProvider(provider) {
  if (provider?.id === "anthropic") {
    return exactKeys(provider, [
      "id", "model", "origin", "version", "promptVersion", "userJudgment",
    ])
      && MODEL_FORM.test(provider.model)
      && provider.origin === "provider_model_generated"
      && provider.version === ENTDECKEN_FACTS_PROVIDER_VERSION
      && provider.promptVersion === ENTDECKEN_FACTS_PROMPT_VERSION
      && provider.userJudgment === false;
  }
  return provider?.id === "wikidata"
    && exactKeys(provider, ["id", "origin", "version", "license", "userJudgment"])
    && provider.origin === "wikidata_structured_data"
    && provider.version === ENTDECKEN_WIKIDATA_PROVIDER_VERSION
    && provider.license === ENTDECKEN_WIKIDATA_LICENSE
    && provider.userJudgment === false;
}

export function normalizeStrongExternalId(value) {
  const candidate = text(value);
  if (/^imdb:tt\d{7,10}$/i.test(candidate)) return candidate.toLowerCase();
  if (/^tmdb:[1-9]\d{0,8}$/.test(candidate)) return candidate;
  if (/^wikidata:Q[1-9]\d*$/.test(candidate)) return candidate;
  return null;
}

function normalizedIdentityTitle(value) {
  return text(value).normalize("NFKC").toLocaleLowerCase("de-AT");
}

export function entdeckenFactsPreResolutionKey(item) {
  const poolId = text(item?.sourceItemId);
  const title = safeTitle(item?.title);
  const year = Number(item?.releaseYear);
  const mediaType = text(item?.mediaType);
  if (!/^[fs]_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(poolId) || !title
      || !Number.isInteger(year) || year < 1888 || year > 2100
      || !["film", "series"].includes(mediaType)) return null;
  return `${poolId}|${mediaType}|${year}|${normalizedIdentityTitle(title)}`;
}

export function createEntdeckenFactsInput(item, poolVersion) {
  const preResolutionKey = entdeckenFactsPreResolutionKey(item);
  const sourceUrl = directHttpsUrl(item?.sourceUrl);
  const sourceStand = canonicalInstant(item?.fetchedAt);
  const version = text(poolVersion);
  const sourceId = text(item?.sourceId);
  if (!preResolutionKey || !sourceUrl || !sourceStand || !sourceId || sourceId.length > 160
      || !version) return null;
  return Object.freeze({
    poolId: item.sourceItemId,
    poolVersion: version,
    preResolutionKey,
    title: item.title,
    releaseYear: item.releaseYear,
    mediaType: item.mediaType,
    sourceId,
    sourceUrl,
    sourceStand,
    provider: text(item?.availability?.service) || null,
  });
}

export function validateEntdeckenFactsInputs(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > ENTDECKEN_FACTS_MAX_BATCH_SIZE) return null;
  const seen = new Set();
  const accepted = [];
  for (const input of value) {
    if (!exactKeys(input, [
      "poolId", "poolVersion", "preResolutionKey", "title", "releaseYear",
      "mediaType", "sourceId", "sourceUrl", "sourceStand", "provider",
    ]) || seen.has(input.poolId)) return null;
    const checked = createEntdeckenFactsInput({
      sourceItemId: input.poolId,
      title: input.title,
      releaseYear: input.releaseYear,
      mediaType: input.mediaType,
      sourceId: input.sourceId,
      sourceUrl: input.sourceUrl,
      fetchedAt: input.sourceStand,
      availability: { service: input.provider },
    }, input.poolVersion);
    if (!checked || checked.preResolutionKey !== input.preResolutionKey
        || Object.keys(checked).some((key) => checked[key] !== input[key])) return null;
    seen.add(input.poolId);
    accepted.push(Object.freeze({ ...checked }));
  }
  return Object.freeze(accepted);
}

export function emptyEntdeckenFactsSnapshot({ poolId, poolVersion } = {}) {
  return Object.freeze({
    schemaVersion: ENTDECKEN_FACTS_SNAPSHOT_VERSION,
    poolId: text(poolId),
    poolVersion: text(poolVersion),
    updatedAt: null,
    pilot: null,
    preResolution: Object.freeze({}),
    entries: Object.freeze({}),
  });
}

function validSnapshotEntry(entry, key) {
  if (!exactKeys(entry, [
    "cacheKey", "preResolutionKey", "poolId", "input", "status", "strongId",
    "facts", "evidenceUrls", "checkedAt", "expiresAt", "provider", "validation",
  ]) || entry.cacheKey !== key || !CACHE_STATUSES.has(entry.status)
      || !exactKeys(entry.input, [
        "poolId", "title", "releaseYear", "mediaType", "sourceId", "sourceUrl",
        "sourceStand", "provider",
      ]) || !validSnapshotProvider(entry.provider)
      || !exactKeys(entry.validation, ["status", "identity", "taxonomy", "evidence"])
      || entry.validation.status !== "machine_validated"
      || !directHttpsUrl(entry.input.sourceUrl) || !canonicalInstant(entry.input.sourceStand)
      || !entdeckenFactsPreResolutionKey({
        sourceItemId: entry.input?.poolId,
        title: entry.input?.title,
        releaseYear: entry.input?.releaseYear,
        mediaType: entry.input?.mediaType,
      }) || entry.preResolutionKey !== entdeckenFactsPreResolutionKey({
        sourceItemId: entry.input.poolId,
        title: entry.input.title,
        releaseYear: entry.input.releaseYear,
        mediaType: entry.input.mediaType,
      }) || !canonicalInstant(entry.checkedAt) || !canonicalInstant(entry.expiresAt)
      || !Array.isArray(entry.evidenceUrls)
      || entry.evidenceUrls.some((url) => !directHttpsUrl(url))
      || (entry.provider.id === "wikidata"
        && entry.evidenceUrls.some((url) => !wikidataEvidenceQid(url)))) return false;
  if (entry.status === "ok") {
    const wikidata = entry.provider.id === "wikidata";
    const factsShape = wikidata
      ? exactKeys(entry.facts, ["genres", "tags", "franchise", "persons", "externalIds"])
        && !!normalizedWikidataExternalIds(entry.facts.externalIds)
      : exactKeys(entry.facts, ["genres", "tags", "franchise", "persons"]);
    return normalizeStrongExternalId(entry.strongId) === key
      && (wikidata
        ? ["strong_id", "exact", "title_type_year_missing"].includes(entry.validation.identity)
        : entry.validation.identity === "exact")
      && entry.validation.taxonomy === "normalized"
      && entry.validation.evidence === "direct"
      && factsShape
      && Array.isArray(entry.facts.genres)
      && entry.facts.genres.every((value) => GENRES.has(value))
      && Array.isArray(entry.facts.tags)
      && entry.facts.tags.every((value) => TAGS.has(value))
      && (entry.facts.franchise === null || !!normalizedEntity(entry.facts.franchise))
      && Array.isArray(entry.facts.persons)
      && entry.facts.persons.every((person) => !!normalizedEntity(person, true));
  }
  return key === `pre:${entry.preResolutionKey}` && entry.strongId === null && entry.facts === null
    && entry.validation.identity === "not_resolved"
    && entry.validation.taxonomy === "not_applicable"
    && ["direct", "none"].includes(entry.validation.evidence);
}

export function validateEntdeckenFactsSnapshot(value, { poolId, poolVersion } = {}) {
  if (!exactKeys(value, [
    "schemaVersion", "poolId", "poolVersion", "updatedAt", "pilot", "preResolution", "entries",
  ])
      || value.schemaVersion !== ENTDECKEN_FACTS_SNAPSHOT_VERSION
      || value.poolId !== text(poolId) || value.poolVersion !== text(poolVersion)
      || (value.updatedAt !== null && !canonicalInstant(value.updatedAt))
      || (value.pilot !== null && (!exactKeys(value.pilot, [
        "status", "batchSize", "threshold", "resolvedReady", "evaluatedAt", "providerRequests",
      ]) || !["passed", "failed"].includes(value.pilot.status)
        || value.pilot.batchSize !== ENTDECKEN_FACTS_BATCH_SIZE
        || value.pilot.threshold !== ENTDECKEN_FACTS_PILOT_RESOLVED_MIN
        || !Number.isInteger(value.pilot.resolvedReady) || value.pilot.resolvedReady < 0
        || value.pilot.resolvedReady > ENTDECKEN_FACTS_BATCH_SIZE
        || !canonicalInstant(value.pilot.evaluatedAt)
        || value.pilot.providerRequests !== 1))
      || !plain(value.preResolution) || !plain(value.entries)) return null;
  for (const [key, entry] of Object.entries(value.entries)) {
    if (!validSnapshotEntry(entry, key) || entry.poolId !== value.poolId) return null;
  }
  for (const [preKey, cacheKey] of Object.entries(value.preResolution)) {
    if (typeof cacheKey !== "string" || value.entries[cacheKey]?.preResolutionKey !== preKey) return null;
  }
  return value;
}

export function cachedEntdeckenFacts(snapshot, item, { now = new Date().toISOString() } = {}) {
  const preKey = typeof item?.preResolutionKey === "string" && item.preResolutionKey
    ? item.preResolutionKey : entdeckenFactsPreResolutionKey(item);
  const cacheKey = preKey ? snapshot?.preResolution?.[preKey] : null;
  const entry = cacheKey ? snapshot?.entries?.[cacheKey] : null;
  if (!entry || Date.parse(entry.expiresAt) <= Date.parse(now)) return null;
  return entry.status === "ok" ? entry : Object.freeze({ ...entry, facts: null });
}

export function createEntdeckenFactsBatchPlan(pool, snapshot, { now = new Date().toISOString() } = {}) {
  const checked = validateEntdeckenFactsSnapshot(snapshot, {
    poolId: pool?.feedId,
    poolVersion: pool?.poolVersion,
  });
  if (!checked || !Array.isArray(pool?.items) || pool.items.length !== 50) return null;
  const pending = pool.items.map((item) => createEntdeckenFactsInput(item, pool.poolVersion))
    .filter((item) => item && !cachedEntdeckenFacts(checked, item, { now }));
  const batches = [];
  const maxSearchUsesByBatch = [];
  let offset = 0;
  for (let index = 0; offset < pending.length; index += 1) {
    const size = ENTDECKEN_FACTS_RESUME_BATCH_SIZES[index];
    const searchUses = ENTDECKEN_FACTS_RESUME_SEARCH_USES[index];
    if (!Number.isInteger(size) || !Number.isInteger(searchUses)) return null;
    const batch = Object.freeze(pending.slice(offset, offset + size));
    batches.push(batch);
    maxSearchUsesByBatch.push(Math.min(batch.length, searchUses));
    offset += size;
  }
  if (batches.length > ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS) return null;
  return Object.freeze({
    pending: Object.freeze(pending),
    batches: Object.freeze(batches),
    maxSearchUsesByBatch: Object.freeze(maxSearchUsesByBatch),
    providerRequests: batches.length,
    maxSearchUses: maxSearchUsesByBatch.reduce((sum, value) => sum + value, 0),
  });
}

function normalizedTaxonomyList(value, allowed, warnings, code) {
  if (!Array.isArray(value)) return null;
  const accepted = [];
  for (const raw of value) {
    const candidate = typeof raw === "string" ? raw.trim().toLocaleLowerCase("de-AT") : "";
    if (!candidate || raw !== raw?.trim() || !allowed.has(candidate)) {
      warnings.add(code);
      continue;
    }
    if (!accepted.includes(candidate) && accepted.length < 12) accepted.push(candidate);
  }
  return accepted;
}

function normalizedEntity(value, roles = false) {
  const keys = roles ? ["id", "name", "roles"] : ["id", "name"];
  if (!exactKeys(value, keys)) return null;
  const id = normalizeStrongExternalId(value.id);
  const name = safeEntityName(value.name);
  if (!id || !name) return null;
  if (!roles) return Object.freeze({ id, name });
  if (!Array.isArray(value.roles) || value.roles.some((role) => !PERSON_ROLES.has(role))) return null;
  const normalizedRoles = unique(value.roles.filter((role) => PERSON_ROLES.has(role))).slice(0, 4);
  if (!normalizedRoles.length) return null;
  return Object.freeze({ id, name, roles: Object.freeze(normalizedRoles) });
}

export function validateEntdeckenFactsBatchOutput(
  value,
  requestedItems,
  { allowedEvidenceUrls = [], checkedAt = new Date().toISOString() } = {},
) {
  if (!exactKeys(value, ["schemaVersion", "items"])
      || value.schemaVersion !== ENTDECKEN_FACTS_CONTRACT_VERSION
      || !Array.isArray(value.items) || !canonicalInstant(checkedAt)) return null;
  const requested = new Map((Array.isArray(requestedItems) ? requestedItems : [])
    .map((item) => [item?.poolId, item]));
  const evidence = new Set(allowedEvidenceUrls.map(directHttpsUrl).filter(Boolean));
  const warnings = new Set();
  const accepted = [];
  const seen = new Set();
  for (const raw of value.items) {
    if (!exactKeys(raw, ["poolId", "status", "identity", "facts", "evidenceUrls"])
        || seen.has(raw.poolId) || !requested.has(raw.poolId)
        || !RESULT_STATUSES.has(raw.status) || !Array.isArray(raw.evidenceUrls)) {
      warnings.add("item-dropped");
      continue;
    }
    const urls = unique(raw.evidenceUrls.map(directHttpsUrl).filter((url) => url && evidence.has(url)));
    if (urls.length !== raw.evidenceUrls.length || (raw.status !== "unresolved" && urls.length === 0)) {
      warnings.add("evidence-dropped");
      continue;
    }
    const input = requested.get(raw.poolId);
    if (raw.status !== "resolved") {
      if (raw.identity !== null || raw.facts !== null) {
        warnings.add("item-dropped");
        continue;
      }
      seen.add(raw.poolId);
      accepted.push(Object.freeze({
        poolId: raw.poolId,
        preResolutionKey: input.preResolutionKey,
        status: raw.status,
        strongId: null,
        facts: null,
        evidenceUrls: Object.freeze(urls),
        checkedAt: canonicalInstant(checkedAt),
        validation: Object.freeze({
          status: "machine_validated",
          identity: "not_resolved",
          taxonomy: "not_applicable",
          evidence: urls.length ? "direct" : "none",
        }),
      }));
      continue;
    }
    if (!exactKeys(raw.identity, ["strongId", "confirmedTitle", "releaseYear", "mediaType"])
        || raw.identity.confirmedTitle !== input.title
        || raw.identity.releaseYear !== input.releaseYear
        || raw.identity.mediaType !== input.mediaType) {
      warnings.add("identity-dropped");
      continue;
    }
    const strongId = normalizeStrongExternalId(raw.identity.strongId);
    if (!strongId || !exactKeys(raw.facts, ["genres", "tags", "franchise", "persons"])) {
      warnings.add("identity-dropped");
      continue;
    }
    const genres = normalizedTaxonomyList(raw.facts.genres, GENRES, warnings, "unknown-genre-dropped");
    const tags = normalizedTaxonomyList(raw.facts.tags, TAGS, warnings, "unknown-tag-dropped");
    if (!genres || !tags || !Array.isArray(raw.facts.persons)) {
      warnings.add("facts-dropped");
      continue;
    }
    const franchise = raw.facts.franchise === null ? null : normalizedEntity(raw.facts.franchise);
    if (raw.facts.franchise !== null && !franchise) warnings.add("franchise-dropped");
    const persons = raw.facts.persons.map((person) => normalizedEntity(person, true)).filter(Boolean);
    if (persons.length !== raw.facts.persons.length) warnings.add("person-dropped");
    seen.add(raw.poolId);
    accepted.push(Object.freeze({
      poolId: raw.poolId,
      preResolutionKey: input.preResolutionKey,
      status: "resolved",
      strongId,
      facts: Object.freeze({
        genres: Object.freeze(genres),
        tags: Object.freeze(tags),
        franchise,
        persons: Object.freeze(persons.slice(0, 8)),
      }),
      evidenceUrls: Object.freeze(urls),
      checkedAt: canonicalInstant(checkedAt),
      validation: Object.freeze({
        status: "machine_validated",
        identity: "exact",
        taxonomy: "normalized",
        evidence: "direct",
      }),
    }));
  }
  return Object.freeze({
    items: Object.freeze(accepted),
    returned: value.items.length,
    accepted: accepted.length,
    dropped: value.items.length - accepted.length,
    missing: requested.size - accepted.length,
    warnings: Object.freeze([...warnings]),
  });
}

function plusDays(instant, days) {
  return new Date(Date.parse(instant) + days * 86_400_000).toISOString();
}

export function mergeEntdeckenFactsSnapshot(snapshot, input, result) {
  const checked = validateEntdeckenFactsSnapshot(snapshot, {
    poolId: snapshot?.poolId,
    poolVersion: snapshot?.poolVersion,
  });
  if (!checked || input?.preResolutionKey !== result?.preResolutionKey
      || input?.poolId !== result?.poolId || !MODEL_FORM.test(result?.providerModel)
      || result?.validation?.status !== "machine_validated") return null;
  const cacheStatus = result.status === "resolved" ? "ok" : result.status;
  const cacheKey = cacheStatus === "ok" ? result.strongId : `pre:${input.preResolutionKey}`;
  if (!cacheKey || (cacheStatus === "ok" && normalizeStrongExternalId(cacheKey) !== cacheKey)) return null;
  const oldKey = checked.preResolution[input.preResolutionKey];
  const entries = { ...checked.entries };
  if (oldKey && oldKey !== cacheKey) delete entries[oldKey];
  const existing = entries[cacheKey];
  if (existing && existing.preResolutionKey !== input.preResolutionKey) return null;
  const ttl = cacheStatus === "ok" ? ENTDECKEN_FACTS_OK_TTL_DAYS : ENTDECKEN_FACTS_NEGATIVE_TTL_DAYS;
  entries[cacheKey] = {
    cacheKey,
    preResolutionKey: input.preResolutionKey,
    poolId: snapshot.poolId,
    input: {
      poolId: input.poolId,
      title: input.title,
      releaseYear: input.releaseYear,
      mediaType: input.mediaType,
      sourceId: input.sourceId,
      sourceUrl: input.sourceUrl,
      sourceStand: input.sourceStand,
      provider: input.provider,
    },
    status: cacheStatus,
    strongId: cacheStatus === "ok" ? result.strongId : null,
    facts: cacheStatus === "ok" ? result.facts : null,
    evidenceUrls: [...result.evidenceUrls],
    checkedAt: result.checkedAt,
    expiresAt: plusDays(result.checkedAt, ttl),
    validation: { ...result.validation },
    provider: {
      id: "anthropic",
      model: result.providerModel,
      origin: "provider_model_generated",
      version: ENTDECKEN_FACTS_PROVIDER_VERSION,
      promptVersion: ENTDECKEN_FACTS_PROMPT_VERSION,
      userJudgment: false,
    },
  };
  return {
    schemaVersion: ENTDECKEN_FACTS_SNAPSHOT_VERSION,
    poolId: checked.poolId,
    poolVersion: checked.poolVersion,
    updatedAt: result.checkedAt,
    pilot: checked.pilot,
    preResolution: { ...checked.preResolution, [input.preResolutionKey]: cacheKey },
    entries,
  };
}

export function mergeEntdeckenWikidataFactsSnapshot(snapshot, input, result) {
  const checked = validateEntdeckenFactsSnapshot(snapshot, {
    poolId: snapshot?.poolId,
    poolVersion: snapshot?.poolVersion,
  });
  const status = result?.status === "resolved" ? "ok" : result?.status;
  const checkedAt = canonicalInstant(result?.checkedAt);
  const evidenceUrls = Array.isArray(result?.evidenceUrls)
    ? unique(result.evidenceUrls.map(directHttpsUrl).filter(Boolean)) : null;
  const validation = result?.validation;
  if (!checked || input?.preResolutionKey !== result?.preResolutionKey
      || input?.poolId !== result?.poolId || !["ok", "ambiguous", "unresolved"].includes(status)
      || !checkedAt || !evidenceUrls
      || evidenceUrls.some((url) => !wikidataEvidenceQid(url))
      || !exactKeys(validation, ["status", "identity", "taxonomy", "evidence"])
      || validation.status !== "machine_validated") return null;

  let strongId = null;
  let facts = null;
  if (status === "ok") {
    strongId = normalizeStrongExternalId(result.strongId);
    const expectedQid = strongId?.startsWith("wikidata:") ? strongId.slice("wikidata:".length) : null;
    if (!expectedQid || !QID_FORM.test(expectedQid)
        || !["strong_id", "exact", "title_type_year_missing"].includes(validation.identity)
        || validation.taxonomy !== "normalized" || validation.evidence !== "direct"
        || !evidenceUrls.includes(`https://www.wikidata.org/wiki/${expectedQid}`)
        || !exactKeys(result.facts, ["genres", "tags", "franchise", "persons", "externalIds"])) return null;
    const genres = normalizedTaxonomyList(result.facts.genres, GENRES, new Set(), "invalid");
    const tags = normalizedTaxonomyList(result.facts.tags, TAGS, new Set(), "invalid");
    const franchise = result.facts.franchise === null ? null : normalizedEntity(result.facts.franchise);
    const persons = Array.isArray(result.facts.persons)
      ? result.facts.persons.map((person) => normalizedEntity(person, true)) : [];
    const externalIds = normalizedWikidataExternalIds(result.facts.externalIds);
    if (!genres || genres.length !== result.facts.genres.length
        || !tags || tags.length !== result.facts.tags.length
        || (result.facts.franchise !== null && !franchise)
        || !Array.isArray(result.facts.persons) || persons.some((person) => !person)
        || persons.length !== result.facts.persons.length || !externalIds) return null;
    facts = {
      genres: [...genres], tags: [...tags], franchise,
      persons: persons.slice(0, 8), externalIds: { ...externalIds },
    };
  } else if (result.strongId !== null || result.facts !== null
      || validation.identity !== "not_resolved"
      || validation.taxonomy !== "not_applicable"
      || !["direct", "none"].includes(validation.evidence)) return null;

  const cacheKey = status === "ok" ? strongId : `pre:${input.preResolutionKey}`;
  const oldKey = checked.preResolution[input.preResolutionKey];
  const entries = { ...checked.entries };
  if (oldKey && oldKey !== cacheKey) delete entries[oldKey];
  const existing = entries[cacheKey];
  if (existing && existing.preResolutionKey !== input.preResolutionKey) return null;
  const ttl = status === "ok" ? ENTDECKEN_FACTS_OK_TTL_DAYS : ENTDECKEN_FACTS_NEGATIVE_TTL_DAYS;
  entries[cacheKey] = {
    cacheKey,
    preResolutionKey: input.preResolutionKey,
    poolId: checked.poolId,
    input: {
      poolId: input.poolId,
      title: input.title,
      releaseYear: input.releaseYear,
      mediaType: input.mediaType,
      sourceId: input.sourceId,
      sourceUrl: input.sourceUrl,
      sourceStand: input.sourceStand,
      provider: input.provider,
    },
    status,
    strongId: status === "ok" ? strongId : null,
    facts: status === "ok" ? facts : null,
    evidenceUrls,
    checkedAt,
    expiresAt: plusDays(checkedAt, ttl),
    validation: { ...validation },
    provider: {
      id: "wikidata",
      origin: "wikidata_structured_data",
      version: ENTDECKEN_WIKIDATA_PROVIDER_VERSION,
      license: ENTDECKEN_WIKIDATA_LICENSE,
      userJudgment: false,
    },
  };
  const next = {
    schemaVersion: checked.schemaVersion,
    poolId: checked.poolId,
    poolVersion: checked.poolVersion,
    updatedAt: checkedAt,
    pilot: checked.pilot,
    preResolution: { ...checked.preResolution, [input.preResolutionKey]: cacheKey },
    entries,
  };
  return validateEntdeckenFactsSnapshot(next, {
    poolId: checked.poolId,
    poolVersion: checked.poolVersion,
  });
}

export function markEntdeckenFactsPilot(snapshot, {
  status,
  resolvedReady,
  evaluatedAt,
} = {}) {
  const checked = validateEntdeckenFactsSnapshot(snapshot, {
    poolId: snapshot?.poolId,
    poolVersion: snapshot?.poolVersion,
  });
  if (!checked || checked.pilot !== null || !["passed", "failed"].includes(status)
      || !Number.isInteger(resolvedReady) || resolvedReady < 0
      || resolvedReady > ENTDECKEN_FACTS_BATCH_SIZE || !canonicalInstant(evaluatedAt)) return null;
  const next = {
    ...checked,
    updatedAt: canonicalInstant(evaluatedAt),
    pilot: {
      status,
      batchSize: ENTDECKEN_FACTS_BATCH_SIZE,
      threshold: ENTDECKEN_FACTS_PILOT_RESOLVED_MIN,
      resolvedReady,
      evaluatedAt: canonicalInstant(evaluatedAt),
      providerRequests: 1,
    },
  };
  return validateEntdeckenFactsSnapshot(next, {
    poolId: checked.poolId,
    poolVersion: checked.poolVersion,
  });
}

export function projectEntdeckenFacts(snapshot, item, options = {}) {
  const cached = cachedEntdeckenFacts(snapshot, item, options);
  if (!cached || cached.status !== "ok") return null;
  const externalIds = {};
  const [namespace, value] = cached.strongId.split(":", 2);
  if (["imdb", "tmdb"].includes(namespace)) externalIds[namespace] = value;
  const facts = cached.facts;
  const wikidataExternalIds = normalizedWikidataExternalIds(facts.externalIds || {});
  if (wikidataExternalIds) Object.assign(externalIds, wikidataExternalIds);
  return Object.freeze({
    strongId: cached.strongId,
    externalIds: Object.freeze(externalIds),
    genres: Object.freeze([...facts.genres]),
    tags: Object.freeze([...facts.tags, ...facts.persons.map((person) => person.name)]),
    franchiseId: facts.franchise?.name || null,
    persons: Object.freeze([...facts.persons]),
    evidenceUrls: Object.freeze([...cached.evidenceUrls]),
    checkedAt: cached.checkedAt,
  });
}

export function entdeckenFactsDiagnostics(pool, snapshot, options = {}) {
  const counts = { items: 0, ok: 0, ambiguous: 0, unresolved: 0, unknownOrExpired: 0, rankingReady: 0 };
  for (const item of Array.isArray(pool?.items) ? pool.items : []) {
    counts.items += 1;
    const cached = cachedEntdeckenFacts(snapshot, item, options);
    if (!cached) counts.unknownOrExpired += 1;
    else counts[cached.status] += 1;
    const facts = projectEntdeckenFacts(snapshot, item, options);
    if (facts && (facts.genres.length || facts.tags.length || facts.franchiseId)) counts.rankingReady += 1;
  }
  return Object.freeze(counts);
}
