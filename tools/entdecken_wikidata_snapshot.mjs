/* Providerfreie Wikidata-Anreicherung fuer den versionierten 50er-Pool.
   Offizielle Action API, CC0, streng seriell, ohne Retry. Fremde Payloads
   bleiben ausschliesslich im Arbeitsspeicher; persistiert wird pro Item nur
   der validierte Snapshotvertrag. */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  cachedEntdeckenFacts,
  createEntdeckenFactsInput,
  entdeckenFactsDiagnostics,
  mergeEntdeckenWikidataFactsSnapshot,
  projectEntdeckenFacts,
  validateEntdeckenFactsSnapshot,
} from "../src/lib/entdeckenFacts.js";
import { ENTDECKEN_MARKET_POOL_50 } from "../src/data/entdeckenMarketPool50.js";

export const WIKIDATA_ACTION_URL = "https://www.wikidata.org/w/api.php";
export const WIKIDATA_SNAPSHOT_USER_AGENT = "Kinodreieck-Wikidata-Snapshot/1.0 (https://kinodreieck.at/)";
export const WIKIDATA_SNAPSHOT_MIN_INTERVAL_MS = 350;
export const WIKIDATA_SNAPSHOT_REQUEST_CAP = 160;
export const WIKIDATA_ENTITY_BATCH_SIZE = 20;
export const WIKIDATA_LABEL_BATCH_SIZE = 50;

const QID = /^Q[1-9]\d{0,17}$/u;
const IMDB = /^tt\d{7,10}$/u;
const TMDB = /^[1-9]\d{0,8}$/u;
const FILM_TYPES = new Set([
  "Q11424", "Q24862", "Q24869", "Q202866", "Q506240", "Q93204", "Q229390", "Q226730",
]);
const SERIES_TYPES = new Set(["Q5398426", "Q1259759", "Q581714", "Q15416", "Q24856"]);

/* Exakte, explizite Bruecke in die bereits bestehende Profil-Taxonomie.
   Unbekannte Wikidata-Labels werden nicht erraten, sondern verworfen. */
const GENRE_LABELS = new Map(Object.entries({
  drama: ["drama"],
  "drama film": ["drama"],
  "dramatic film": ["drama"],
  dramafilm: ["drama"],
  "drama television series": ["drama"],
  "dramatic television series": ["drama"],
  "television drama": ["drama"],
  dramaserie: ["drama"],
  comedy: ["komoedie"],
  "comedy film": ["komoedie"],
  filmkomodie: ["komoedie"],
  komodie: ["komoedie"],
  sitcom: ["komoedie"],
  "comedy television series": ["komoedie"],
  comedyserie: ["komoedie"],
  "romance film": ["romantik"],
  "romantic film": ["romantik"],
  liebesfilm: ["romantik"],
  "romantic comedy film": ["romantik", "komoedie"],
  "romantische komodie": ["romantik", "komoedie"],
  "adventure film": ["abenteuer"],
  abenteuerfilm: ["abenteuer"],
  "adventure television series": ["abenteuer"],
  abenteuerserie: ["abenteuer"],
  "thriller film": ["thriller"],
  thriller: ["thriller"],
  "thriller television series": ["thriller"],
  thrillerserie: ["thriller"],
  "family film": ["familie"],
  familienfilm: ["familie"],
  "children's film": ["familie"],
  kinderfilm: ["familie"],
  "family television series": ["familie"],
  familienserie: ["familie"],
  "documentary film": ["doku"],
  dokumentarfilm: ["doku"],
  "documentary television series": ["doku"],
  dokumentarserie: ["doku"],
  "action film": ["action"],
  actionfilm: ["action"],
  "action television series": ["action"],
  actionserie: ["action"],
  "science fiction film": ["scifi"],
  "science fiction television series": ["scifi"],
  "science fiction": ["scifi"],
  "science fiction filmgenre": ["scifi"],
  "animated film": ["animation"],
  animationsfilm: ["animation"],
  "animated television series": ["animation"],
  animationsserie: ["animation"],
  "crime film": ["krimi"],
  kriminalfilm: ["krimi"],
  "crime television series": ["krimi"],
  krimiserie: ["krimi"],
  "fantasy film": ["fantasy"],
  fantasyfilm: ["fantasy"],
  "fantasy television series": ["fantasy"],
  fantasyserie: ["fantasy"],
  "musical film": ["musikfilm"],
  musikfilm: ["musikfilm"],
  "horror film": ["horror"],
  horrorfilm: ["horror"],
  "horror television series": ["horror"],
  horrorserie: ["horror"],
  "satirical film": ["satire"],
  "satire film": ["satire"],
  satirefilm: ["satire"],
  "action comedy film": ["action", "komoedie"],
  actionkomodie: ["action", "komoedie"],
  "science fiction action film": ["scifi", "action"],
}));

function text(value) { return String(value == null ? "" : value).trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function safeInstant(value) {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function safeCode(value) {
  const candidate = text(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9_-]+/gu, "_");
  return candidate && candidate.length <= 80 ? candidate : "unknown";
}
function labelKey(value) {
  return text(value).normalize("NFKD").toLocaleLowerCase("de-AT")
    .replace(/[\u0300-\u036f]/gu, "").replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ").trim();
}
export function normalizeWikidataTitle(value) {
  return text(value).normalize("NFKC").toLocaleLowerCase("de-AT")
    .replace(/[‐‑‒–—―]/gu, "-")
    .replace(/[‘’‚‛`´]/gu, "'")
    .replace(/…/gu, "...")
    .replace(/\s+/gu, " ").replace(/\s*([:;,.!?&-])\s*/gu, "$1").trim();
}
function qidUrl(qid) { return `https://www.wikidata.org/wiki/${qid}`; }

export class WikidataSnapshotError extends Error {
  constructor(code) {
    super(code);
    this.name = "WikidataSnapshotError";
    this.code = code;
  }
}

async function boundedJson(response, maxBytes) {
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maxBytes)) {
    throw new WikidataSnapshotError("wikidata_response_too_large");
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new WikidataSnapshotError("wikidata_response_too_large");
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new WikidataSnapshotError("wikidata_invalid_json"); }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let payload = "";
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new WikidataSnapshotError("wikidata_invalid_body");
      length += value.byteLength;
      if (length > maxBytes) {
        try { await reader.cancel("too_large"); } catch { /* beendet */ }
        throw new WikidataSnapshotError("wikidata_response_too_large");
      }
      payload += decoder.decode(value, { stream: true });
    }
    payload += decoder.decode();
    return JSON.parse(payload);
  } catch (error) {
    if (error instanceof WikidataSnapshotError) throw error;
    throw new WikidataSnapshotError("wikidata_invalid_json");
  } finally {
    try { reader.releaseLock(); } catch { /* beendet */ }
  }
}

function apiUrl(parameters) {
  const url = new URL(WIKIDATA_ACTION_URL);
  for (const [key, value] of Object.entries({ format: "json", formatversion: "2", ...parameters })) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function validateApiEnvelope(value) {
  if (!plain(value)) throw new WikidataSnapshotError("wikidata_invalid_envelope");
  if (plain(value.error)) {
    const code = safeCode(value.error.code);
    throw new WikidataSnapshotError(code === "maxlag"
      ? "wikidata_temporarily_unavailable" : `wikidata_api_${code}`);
  }
  return value;
}

export function createWikidataApiClient({
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  nowMs = () => Date.now(),
  minIntervalMs = WIKIDATA_SNAPSHOT_MIN_INTERVAL_MS,
  maxRequests = WIKIDATA_SNAPSHOT_REQUEST_CAP,
  requestTimeoutMs = 15_000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new WikidataSnapshotError("wikidata_fetch_unavailable");
  let requests = 0;
  let lastStartedAt = null;

  async function request(parameters, maxBytes) {
    if (requests >= maxRequests) throw new WikidataSnapshotError("wikidata_request_cap");
    if (lastStartedAt !== null) {
      const wait = Math.max(0, minIntervalMs - (nowMs() - lastStartedAt));
      if (wait > 0) await sleepImpl(wait);
    }
    lastStartedAt = nowMs();
    requests += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(apiUrl(parameters), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "User-Agent": WIKIDATA_SNAPSHOT_USER_AGENT,
        },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response?.ok) {
        throw new WikidataSnapshotError([429, 503].includes(response?.status)
          ? "wikidata_rate_limited" : `wikidata_http_${Number(response?.status) || 0}`);
      }
      const contentType = text(response.headers?.get?.("content-type")).split(";", 1)[0].toLowerCase();
      if (contentType && contentType !== "application/json" && !/^application\/[^/]+\+json$/u.test(contentType)) {
        throw new WikidataSnapshotError("wikidata_content_type");
      }
      return validateApiEnvelope(await boundedJson(response, maxBytes));
    } catch (error) {
      if (error instanceof WikidataSnapshotError) throw error;
      throw new WikidataSnapshotError(controller.signal.aborted || error?.name === "AbortError"
        ? "wikidata_timeout" : "wikidata_transport");
    } finally { clearTimeout(timer); }
  }

  async function searchTitle(title, language) {
    const json = await request({
      action: "wbsearchentities", search: title, language, uselang: language,
      type: "item", limit: "10",
    }, 512_000);
    if (!Array.isArray(json.search)) throw new WikidataSnapshotError("wikidata_search_shape");
    return json.search.map((raw) => {
      if (!plain(raw) || !QID.test(raw.id || "")) return null;
      return Object.freeze({
        id: raw.id,
        names: Object.freeze(unique([
          typeof raw.label === "string" ? raw.label : null,
          typeof raw.match?.text === "string" ? raw.match.text : null,
          ...list(raw.aliases).filter((value) => typeof value === "string"),
        ])),
      });
    }).filter(Boolean);
  }

  async function lookupExternalId(namespace, identifier, mediaType) {
    const property = namespace === "imdb" ? "P345"
      : mediaType === "film" ? "P4947" : "P4983";
    const json = await request({
      action: "query", list: "search",
      srsearch: `haswbstatement:${property}=${identifier}`,
      srnamespace: "0", srlimit: "10", srinfo: "totalhits", srprop: "",
    }, 512_000);
    const total = json.query?.searchinfo?.totalhits;
    const rows = json.query?.search;
    if (!Number.isInteger(total) || !Array.isArray(rows)) {
      throw new WikidataSnapshotError("wikidata_external_search_shape");
    }
    return Object.freeze({
      total,
      qids: Object.freeze(unique(rows.map((row) => (
        plain(row) && row.ns === 0 && QID.test(row.title || "") ? row.title : null
      )))),
    });
  }

  async function getEntities(qids) {
    if (!Array.isArray(qids) || qids.length < 1 || qids.length > WIKIDATA_ENTITY_BATCH_SIZE
        || qids.some((qid) => !QID.test(qid))) throw new WikidataSnapshotError("wikidata_entity_batch_invalid");
    const json = await request({
      action: "wbgetentities", ids: qids.join("|"), redirects: "yes",
      props: "info|labels|aliases|claims", languages: "de|en", languagefallback: "1",
    }, 24 * 1024 * 1024);
    if (!plain(json.entities)) throw new WikidataSnapshotError("wikidata_entities_shape");
    const result = new Map();
    for (const qid of qids) {
      const entity = json.entities[qid];
      if (plain(entity) && entity.missing === undefined && entity.id === qid && entity.type === "item"
          && plain(entity.claims)) result.set(qid, entity);
    }
    return result;
  }

  async function getLabels(qids) {
    if (!Array.isArray(qids) || qids.length < 1 || qids.length > WIKIDATA_LABEL_BATCH_SIZE
        || qids.some((qid) => !QID.test(qid))) throw new WikidataSnapshotError("wikidata_label_batch_invalid");
    const json = await request({
      action: "wbgetentities", ids: qids.join("|"), redirects: "yes",
      props: "labels", languages: "de|en", languagefallback: "1",
    }, 4 * 1024 * 1024);
    if (!plain(json.entities)) throw new WikidataSnapshotError("wikidata_labels_shape");
    const result = new Map();
    for (const qid of qids) {
      const label = entityLabel(json.entities[qid]);
      if (label) result.set(qid, label);
    }
    return result;
  }

  return Object.freeze({
    searchTitle, lookupExternalId, getEntities, getLabels,
    telemetry: () => Object.freeze({ requests, maxRequests, minIntervalMs }),
  });
}

function activeClaims(entity, property) {
  const rows = list(entity?.claims?.[property]).filter((claim) => (
    plain(claim) && claim.rank !== "deprecated" && claim?.mainsnak?.snaktype === "value"
  ));
  const preferred = rows.filter((claim) => claim.rank === "preferred");
  return preferred.length ? preferred : rows.filter((claim) => claim.rank === "normal");
}
function claimValue(claim) { return claim?.mainsnak?.datavalue?.value ?? null; }
function claimQid(value) {
  const id = typeof value?.id === "string" ? value.id
    : Number.isInteger(value?.["numeric-id"]) ? `Q${value["numeric-id"]}` : null;
  return id && QID.test(id) ? id : null;
}
function itemClaims(entity, property) {
  return unique(activeClaims(entity, property).map((claim) => claimQid(claimValue(claim))));
}
function stringClaims(entity, property, form) {
  return unique(activeClaims(entity, property).map(claimValue)
    .filter((value) => typeof value === "string" && form.test(value)));
}
function claimYears(entity, properties) {
  return unique(properties.flatMap((property) => activeClaims(entity, property)).map((claim) => {
    const time = claimValue(claim)?.time;
    const match = typeof time === "string" ? /^\+?(\d{4})-/u.exec(time) : null;
    const year = match ? Number(match[1]) : null;
    return Number.isInteger(year) && year >= 1888 && year <= 2100 ? year : null;
  })).sort((left, right) => left - right);
}
function entityLabel(entity) {
  if (!plain(entity?.labels)) return null;
  for (const language of ["de", "en"]) {
    const candidate = entity.labels?.[language]?.value;
    if (typeof candidate === "string" && text(candidate) === candidate && candidate.length <= 120) return candidate;
  }
  for (const value of Object.values(entity.labels)) {
    const candidate = value?.value;
    if (typeof candidate === "string" && text(candidate) === candidate && candidate.length <= 120) return candidate;
  }
  return null;
}
function entityNames(entity) {
  const labels = plain(entity?.labels) ? Object.values(entity.labels).map((value) => value?.value) : [];
  const aliases = plain(entity?.aliases)
    ? Object.values(entity.aliases).flatMap((values) => list(values).map((value) => value?.value)) : [];
  return unique([...labels, ...aliases].filter((value) => typeof value === "string"));
}
function entityExternalIds(entity, mediaType) {
  const imdb = stringClaims(entity, "P345", IMDB);
  const tmdb = stringClaims(entity, mediaType === "film" ? "P4947" : "P4983", TMDB);
  return Object.freeze({
    ...(imdb.length === 1 ? { imdb: imdb[0] } : {}),
    ...(tmdb.length === 1 ? { tmdb: tmdb[0] } : {}),
  });
}
function entityMediaType(entity) {
  const movieIds = stringClaims(entity, "P4947", TMDB);
  const tvIds = stringClaims(entity, "P4983", TMDB);
  const types = itemClaims(entity, "P31");
  const film = (movieIds.length === 1 && tvIds.length === 0) || types.some((qid) => FILM_TYPES.has(qid));
  const series = (tvIds.length === 1 && movieIds.length === 0) || types.some((qid) => SERIES_TYPES.has(qid));
  return film !== series ? (film ? "film" : "series") : null;
}
function entityYears(entity, mediaType) {
  return claimYears(entity, mediaType === "film" ? ["P577"] : ["P577", "P580", "P571"]);
}

function negativeResult(input, status, qids, checkedAt) {
  const evidenceUrls = unique(qids.filter((qid) => QID.test(qid)).map(qidUrl));
  return Object.freeze({
    poolId: input.poolId,
    preResolutionKey: input.preResolutionKey,
    status,
    strongId: null,
    facts: null,
    evidenceUrls: Object.freeze(evidenceUrls),
    checkedAt,
    validation: Object.freeze({
      status: "machine_validated",
      identity: "not_resolved",
      taxonomy: "not_applicable",
      evidence: evidenceUrls.length ? "direct" : "none",
    }),
  });
}

export function selectWikidataIdentity({ item, input, candidateQids, entities, lookupKind }) {
  const qids = unique(candidateQids.filter((qid) => QID.test(qid)));
  if (lookupKind === "external_id") {
    if (qids.length > 1) return { result: negativeResult(input, "ambiguous", qids, null), chosen: null };
    const entity = qids.length === 1 ? entities.get(qids[0]) : null;
    if (!entity || entityMediaType(entity) !== item.mediaType) {
      return { result: negativeResult(input, "unresolved", qids, null), chosen: null };
    }
    const ids = entityExternalIds(entity, item.mediaType);
    const requested = item.externalIds || {};
    if ((requested.imdb && ids.imdb !== requested.imdb)
        || (requested.tmdb && ids.tmdb !== requested.tmdb)) {
      return { result: negativeResult(input, "unresolved", qids, null), chosen: null };
    }
    return { result: null, chosen: { qid: qids[0], entity, identity: "strong_id" } };
  }

  const expectedTitle = normalizeWikidataTitle(item.title);
  const compatible = qids.map((qid) => ({ qid, entity: entities.get(qid) })).filter(({ entity }) => (
    entity && entityNames(entity).some((name) => normalizeWikidataTitle(name) === expectedTitle)
      && entityMediaType(entity) === item.mediaType
  )).map((candidate) => ({
    ...candidate,
    years: entityYears(candidate.entity, item.mediaType),
  }));
  const exactYear = compatible.filter((candidate) => candidate.years.includes(item.releaseYear));
  if (exactYear.length > 1) {
    return { result: negativeResult(input, "ambiguous", exactYear.map((row) => row.qid), null), chosen: null };
  }
  if (exactYear.length === 1) {
    return { result: null, chosen: { ...exactYear[0], identity: "exact" } };
  }
  if (compatible.length > 1) {
    return { result: negativeResult(input, "ambiguous", compatible.map((row) => row.qid), null), chosen: null };
  }
  if (compatible.length === 1 && compatible[0].years.length === 0) {
    return { result: null, chosen: { ...compatible[0], identity: "title_type_year_missing" } };
  }
  return { result: negativeResult(input, "unresolved", qids, null), chosen: null };
}

function requiredFactQids(entity) {
  const genre = itemClaims(entity, "P136").slice(0, 12);
  const directors = itemClaims(entity, "P57").slice(0, 8);
  const actors = itemClaims(entity, "P161").slice(0, 8);
  const series = itemClaims(entity, "P179");
  return unique([...genre, ...directors, ...actors, ...(series.length === 1 ? series : [])]);
}

export function buildWikidataFacts(entity, labels, mediaType) {
  const genres = [];
  const evidenceQids = [];
  for (const qid of itemClaims(entity, "P136").slice(0, 12)) {
    const mapped = GENRE_LABELS.get(labelKey(labels.get(qid)));
    if (!mapped) continue;
    for (const genre of mapped) if (!genres.includes(genre) && genres.length < 12) genres.push(genre);
    evidenceQids.push(qid);
  }

  const people = new Map();
  for (const [property, role] of [["P57", "director"], ["P161", "actor"]]) {
    for (const qid of itemClaims(entity, property)) {
      const name = labels.get(qid);
      if (!name || people.size >= 8 && !people.has(qid)) continue;
      const current = people.get(qid) || { id: `wikidata:${qid}`, name, roles: [] };
      if (!current.roles.includes(role)) current.roles.push(role);
      people.set(qid, current);
      evidenceQids.push(qid);
    }
  }

  const series = itemClaims(entity, "P179");
  const franchiseQid = series.length === 1 && labels.get(series[0]) ? series[0] : null;
  const franchise = franchiseQid
    ? { id: `wikidata:${franchiseQid}`, name: labels.get(franchiseQid) } : null;
  if (franchiseQid) evidenceQids.push(franchiseQid);
  return Object.freeze({
    facts: Object.freeze({
      genres: Object.freeze(genres),
      tags: Object.freeze([]),
      franchise: franchise ? Object.freeze(franchise) : null,
      persons: Object.freeze([...people.values()].map((person) => Object.freeze({
        ...person, roles: Object.freeze(person.roles),
      }))),
      externalIds: entityExternalIds(entity, mediaType),
    }),
    evidenceQids: Object.freeze(unique(evidenceQids)),
  });
}

function resolvedResult(input, chosen, labels, checkedAt) {
  const normalized = buildWikidataFacts(chosen.entity, labels, input.mediaType);
  return Object.freeze({
    poolId: input.poolId,
    preResolutionKey: input.preResolutionKey,
    status: "resolved",
    strongId: `wikidata:${chosen.qid}`,
    facts: normalized.facts,
    evidenceUrls: Object.freeze(unique([
      qidUrl(chosen.qid), ...normalized.evidenceQids.map(qidUrl),
    ])),
    checkedAt,
    validation: Object.freeze({
      status: "machine_validated",
      identity: chosen.identity,
      taxonomy: "normalized",
      evidence: "direct",
    }),
  });
}

function externalIdentifiers(item) {
  const values = [];
  if (item?.externalIds?.imdb) {
    if (!IMDB.test(item.externalIds.imdb)) throw new WikidataSnapshotError("pool_external_id_invalid");
    values.push(["imdb", item.externalIds.imdb]);
  }
  if (item?.externalIds?.tmdb) {
    if (!TMDB.test(item.externalIds.tmdb)) throw new WikidataSnapshotError("pool_external_id_invalid");
    values.push(["tmdb", item.externalIds.tmdb]);
  }
  return values;
}

function exactSearchQids(results, title) {
  const expected = normalizeWikidataTitle(title);
  return unique(results.filter((row) => row.names.some((name) => (
    normalizeWikidataTitle(name) === expected
  ))).map((row) => row.id));
}

function sourceDiagnostics(pool, snapshot, now) {
  const sources = {};
  for (const item of pool.items) {
    const source = sources[item.sourceId] || {
      items: 0, resolved: 0, ambiguous: 0, unresolved: 0, open: 0, rankingCapable: 0,
    };
    source.items += 1;
    const cached = cachedEntdeckenFacts(snapshot, item, { now });
    if (!cached) source.open += 1;
    else if (cached.status === "ok") source.resolved += 1;
    else source[cached.status] += 1;
    const projected = projectEntdeckenFacts(snapshot, item, { now });
    if (projected && (projected.genres.length || projected.tags.length || projected.franchiseId)) {
      source.rankingCapable += 1;
    }
    sources[item.sourceId] = source;
  }
  return Object.freeze(Object.fromEntries(Object.entries(sources)
    .map(([sourceId, counts]) => [sourceId, Object.freeze(counts)])));
}

function summaryFor({ pool, snapshot, now, processed, cached, api, stopped = false, stopCode = null }) {
  const diagnostics = entdeckenFactsDiagnostics(pool, snapshot, { now });
  return Object.freeze({
    stopped,
    stopCode,
    requests: api.telemetry?.().requests ?? null,
    requestCap: api.telemetry?.().maxRequests ?? WIKIDATA_SNAPSHOT_REQUEST_CAP,
    processed,
    cached,
    resolved: diagnostics.ok,
    ambiguous: diagnostics.ambiguous,
    unresolved: diagnostics.unresolved,
    open: diagnostics.unknownOrExpired,
    rankingCapable: diagnostics.rankingReady,
    sources: sourceDiagnostics(pool, snapshot, now),
    snapshot,
  });
}

export async function runEntdeckenWikidataSnapshot({
  pool,
  snapshot,
  api = createWikidataApiClient(),
  persistSnapshot = async () => {},
  now = new Date().toISOString(),
} = {}) {
  const checkedAt = safeInstant(now);
  const checkedSnapshot = validateEntdeckenFactsSnapshot(snapshot, {
    poolId: pool?.feedId,
    poolVersion: pool?.poolVersion,
  });
  if (!checkedAt || !checkedSnapshot || !Array.isArray(pool?.items)
      || pool.items.length < 1 || pool.items.length > 50) {
    throw new WikidataSnapshotError("wikidata_run_contract_invalid");
  }
  let current = checkedSnapshot;
  let processed = 0;
  let cacheHits = 0;
  const pending = [];
  for (const item of pool.items) {
    const input = createEntdeckenFactsInput(item, pool.poolVersion);
    if (!input) throw new WikidataSnapshotError("wikidata_pool_item_invalid");
    if (cachedEntdeckenFacts(current, input, { now: checkedAt })) cacheHits += 1;
    else pending.push({ item, input });
  }

  async function persist(context, result) {
    const timed = Object.freeze({ ...result, checkedAt });
    const next = mergeEntdeckenWikidataFactsSnapshot(current, context.input, timed);
    if (!next) throw new WikidataSnapshotError("wikidata_snapshot_merge_invalid");
    await persistSnapshot(next);
    current = next;
    processed += 1;
  }

  const contexts = [];
  try {
    for (const context of pending) {
      const strong = externalIdentifiers(context.item);
      if (strong.length) {
        const qids = [];
        let terminal = null;
        for (const [namespace, identifier] of strong) {
          const result = await api.lookupExternalId(namespace, identifier, context.item.mediaType);
          qids.push(...result.qids);
          if (result.total === 0) terminal = "unresolved";
          else if (result.total !== 1 || result.qids.length !== 1) terminal = "ambiguous";
        }
        if (terminal || unique(qids).length !== 1) {
          await persist(context, negativeResult(
            context.input,
            terminal || "ambiguous",
            unique(qids),
            checkedAt,
          ));
        } else contexts.push({ ...context, lookupKind: "external_id", candidateQids: unique(qids) });
        continue;
      }
      const found = [];
      for (const language of ["de", "en"]) {
        found.push(...exactSearchQids(await api.searchTitle(context.item.title, language), context.item.title));
      }
      const candidateQids = unique(found);
      if (!candidateQids.length) {
        await persist(context, negativeResult(context.input, "unresolved", [], checkedAt));
      } else contexts.push({ ...context, lookupKind: "title", candidateQids });
    }

    const entities = new Map();
    for (const batch of chunks(unique(contexts.flatMap((context) => context.candidateQids)), WIKIDATA_ENTITY_BATCH_SIZE)) {
      for (const [qid, entity] of await api.getEntities(batch)) entities.set(qid, entity);
    }

    const chosen = [];
    for (const context of contexts) {
      const selection = selectWikidataIdentity({ ...context, entities });
      if (selection.result) await persist(context, selection.result);
      else chosen.push({ ...context, chosen: selection.chosen });
    }

    const labels = new Map();
    const labelQids = unique(chosen.flatMap((context) => requiredFactQids(context.chosen.entity)));
    for (const batch of chunks(labelQids, WIKIDATA_LABEL_BATCH_SIZE)) {
      for (const [qid, label] of await api.getLabels(batch)) labels.set(qid, label);
    }
    for (const context of chosen) {
      await persist(context, resolvedResult(context.input, context.chosen, labels, checkedAt));
    }
  } catch (error) {
    if (error instanceof WikidataSnapshotError
        && !["wikidata_snapshot_merge_invalid", "wikidata_pool_item_invalid"].includes(error.code)) {
      return summaryFor({
        pool, snapshot: current, now: checkedAt, processed, cached: cacheHits,
        api, stopped: true, stopCode: error.code,
      });
    }
    throw error;
  }
  return summaryFor({ pool, snapshot: current, now: checkedAt, processed, cached: cacheHits, api });
}

export async function writeSnapshotAtomic(snapshot, targetPath) {
  const absolute = path.resolve(targetPath);
  const temporary = `${absolute}.tmp-${process.pid}`;
  const bytes = `${JSON.stringify(snapshot, null, 2)}\n`;
  let handle = null;
  try {
    handle = await fs.open(temporary, "wx", 0o644);
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, absolute);
  } catch (error) {
    try { await handle?.close(); } catch { /* cleanup */ }
    try { await fs.unlink(temporary); } catch { /* cleanup */ }
    throw error;
  }
}

export async function main() {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const snapshotPath = path.join(repository, "src/data/entdeckenFactsSnapshot.json");
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
  if (ENTDECKEN_MARKET_POOL_50.items.length !== 50) {
    throw new WikidataSnapshotError("wikidata_pool_size_invalid");
  }
  const result = await runEntdeckenWikidataSnapshot({
    pool: ENTDECKEN_MARKET_POOL_50,
    snapshot,
    persistSnapshot: (next) => writeSnapshotAtomic(next, snapshotPath),
  });
  const printable = {
    stopped: result.stopped,
    stopCode: result.stopCode,
    requests: result.requests,
    requestCap: result.requestCap,
    processed: result.processed,
    cached: result.cached,
    resolved: result.resolved,
    ambiguous: result.ambiguous,
    unresolved: result.unresolved,
    open: result.open,
    rankingCapable: result.rankingCapable,
    sources: result.sources,
  };
  process.stdout.write(`${JSON.stringify(printable)}\n`);
  if (result.stopped) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    const code = error instanceof WikidataSnapshotError ? error.code : "wikidata_local_failure";
    process.stderr.write(`WIKIDATA_SNAPSHOT_FAILED code=${code}\n`);
    process.exitCode = 1;
  });
}
