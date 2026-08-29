/* Migrationsfreie Faktenanreicherung fuer den versionierten Entdecken-Pool.
   Der Anbieter darf Identitaet und neutrale Fakten liefern, aber weder
   Geschmack noch Score. Alle fremden Werte passieren diesen deterministischen
   Vertrag, bevor sie Snapshot oder Ranker erreichen. */

export const ENTDECKEN_FACTS_CONTRACT_VERSION = "entdecken-facts-batch-v1";
export const ENTDECKEN_FACTS_SNAPSHOT_VERSION = "entdecken-facts-snapshot-v1";
export const ENTDECKEN_FACTS_PROVIDER_VERSION = "anthropic-web-search-20250305";
export const ENTDECKEN_FACTS_PROMPT_VERSION = "entdecken-facts-v1";
export const ENTDECKEN_FACTS_BATCH_SIZE = 9;
export const ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS = 6;
export const ENTDECKEN_FACTS_MAX_SEARCH_USES = 1;
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
  if (!Array.isArray(value) || value.length < 1 || value.length > ENTDECKEN_FACTS_BATCH_SIZE) return null;
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
    preResolution: Object.freeze({}),
    entries: Object.freeze({}),
  });
}

function validSnapshotEntry(entry, key) {
  if (!exactKeys(entry, [
    "cacheKey", "preResolutionKey", "poolId", "input", "status", "strongId",
    "facts", "evidenceUrls", "checkedAt", "expiresAt", "provider",
  ]) || entry.cacheKey !== key || !CACHE_STATUSES.has(entry.status)
      || !exactKeys(entry.input, [
        "poolId", "title", "releaseYear", "mediaType", "sourceId", "sourceUrl",
        "sourceStand", "provider",
      ]) || !exactKeys(entry.provider, ["id", "version", "promptVersion"])
      || entry.provider.id !== "anthropic"
      || entry.provider.version !== ENTDECKEN_FACTS_PROVIDER_VERSION
      || entry.provider.promptVersion !== ENTDECKEN_FACTS_PROMPT_VERSION
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
      || entry.evidenceUrls.some((url) => !directHttpsUrl(url))) return false;
  if (entry.status === "ok") {
    return normalizeStrongExternalId(entry.strongId) === key
      && exactKeys(entry.facts, ["genres", "tags", "franchise", "persons"])
      && Array.isArray(entry.facts.genres)
      && entry.facts.genres.every((value) => GENRES.has(value))
      && Array.isArray(entry.facts.tags)
      && entry.facts.tags.every((value) => TAGS.has(value))
      && (entry.facts.franchise === null || !!normalizedEntity(entry.facts.franchise))
      && Array.isArray(entry.facts.persons)
      && entry.facts.persons.every((person) => !!normalizedEntity(person, true));
  }
  return key === `pre:${entry.preResolutionKey}` && entry.strongId === null && entry.facts === null;
}

export function validateEntdeckenFactsSnapshot(value, { poolId, poolVersion } = {}) {
  if (!exactKeys(value, ["schemaVersion", "poolId", "poolVersion", "updatedAt", "preResolution", "entries"])
      || value.schemaVersion !== ENTDECKEN_FACTS_SNAPSHOT_VERSION
      || value.poolId !== text(poolId) || value.poolVersion !== text(poolVersion)
      || (value.updatedAt !== null && !canonicalInstant(value.updatedAt))
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
  for (let index = 0; index < pending.length; index += ENTDECKEN_FACTS_BATCH_SIZE) {
    batches.push(Object.freeze(pending.slice(index, index + ENTDECKEN_FACTS_BATCH_SIZE)));
  }
  if (batches.length > ENTDECKEN_FACTS_MAX_PROVIDER_REQUESTS) return null;
  return Object.freeze({
    pending: Object.freeze(pending),
    batches: Object.freeze(batches),
    providerRequests: batches.length,
    maxSearchUses: batches.length * ENTDECKEN_FACTS_MAX_SEARCH_USES,
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
      || input?.poolId !== result?.poolId) return null;
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
    provider: {
      id: "anthropic",
      version: ENTDECKEN_FACTS_PROVIDER_VERSION,
      promptVersion: ENTDECKEN_FACTS_PROMPT_VERSION,
    },
  };
  return {
    schemaVersion: ENTDECKEN_FACTS_SNAPSHOT_VERSION,
    poolId: checked.poolId,
    poolVersion: checked.poolVersion,
    updatedAt: result.checkedAt,
    preResolution: { ...checked.preResolution, [input.preResolutionKey]: cacheKey },
    entries,
  };
}

export function projectEntdeckenFacts(snapshot, item, options = {}) {
  const cached = cachedEntdeckenFacts(snapshot, item, options);
  if (!cached || cached.status !== "ok") return null;
  const externalIds = {};
  const [namespace, value] = cached.strongId.split(":", 2);
  if (["imdb", "tmdb"].includes(namespace)) externalIds[namespace] = value;
  const facts = cached.facts;
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
