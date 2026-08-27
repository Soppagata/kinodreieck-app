/* Optionale, kostenfreie Wikidata-Anreicherung fuer unbekannte Joyn-IDs.
   ---------------------------------------------------------------------
   - nur offizielle Wikibase-Action-API, seriell und ohne Retry
   - maximal 20 unbekannte Titel / 40 Requests pro Sechs-Tage-Lauf
   - positive und fachlich negative Entscheidungen werden vor dem naechsten
     Titel persistent geschrieben und bei unveraendertem Joyn-Fingerprint nie
     erneut angefragt
   - 429, maxlag, Timeout oder Cachefehler beendet nur die Anreicherung; der
     bereits belegte Joyn-Basispool bleibt davon unabhaengig */

export const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
export const WIKIDATA_RESOLVER_VERSION = 1;
export const WIKIDATA_MAX_UNKNOWN_ITEMS = 20;
export const WIKIDATA_MAX_REQUESTS = 40;

const FILM_TYPES = new Set([
  "Q11424", "Q24862", "Q24869", "Q202866", "Q506240", "Q93204", "Q229390", "Q226730",
]);
const SERIES_TYPES = new Set(["Q5398426", "Q1259759", "Q581714", "Q15416", "Q24856"]);
const CACHE_STATUSES = new Set(["resolved", "not_found", "ambiguous_blocked", "incomplete_blocked"]);
const QID_FORM = /^Q[1-9]\d*$/u;
const MAX_JSON_BYTES = 512_000;

function text(value) { return String(value == null ? "" : value).trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function normalizedTitle(value) {
  return text(value).normalize("NFKC").toLocaleLowerCase("de-AT")
    .replace(/[‐‑‒–—―]/gu, "-").replace(/[‘’‚‛`´]/gu, "'").replace(/…/gu, "...")
    .replace(/\s+/gu, " ").replace(/\s*([:;,.!?&-])\s*/gu, "$1").trim();
}
export function wikidataTitleFingerprint(item) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(
    `${WIKIDATA_RESOLVER_VERSION}|${item.mediaType}|${normalizedTitle(item.title)}`,
  )) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
function activeClaims(entity, property) {
  return list(entity?.claims?.[property]).filter((claim) => (
    claim?.rank !== "deprecated" && claim?.mainsnak?.snaktype === "value"
    && claim?.mainsnak?.datavalue?.value != null
  ));
}
function stringClaims(entity, property, form) {
  return unique(activeClaims(entity, property).map((claim) => (
    typeof claim.mainsnak.datavalue.value === "string" ? claim.mainsnak.datavalue.value : null
  ))).filter((value) => form.test(value));
}
function itemClaims(entity, property) {
  return unique(activeClaims(entity, property).map((claim) => {
    const value = claim.mainsnak.datavalue.value;
    return value && typeof value === "object" && QID_FORM.test(value.id) ? value.id : null;
  }));
}
function claimYears(entity, property) {
  return unique(activeClaims(entity, property).map((claim) => {
    const value = claim.mainsnak.datavalue.value;
    const match = value && typeof value === "object" && typeof value.time === "string"
      ? /^\+?(\d{4})-/u.exec(value.time) : null;
    const year = match ? Number(match[1]) : null;
    return Number.isInteger(year) && year >= 1888 && year <= new Date().getUTCFullYear() + 10 ? year : null;
  })).sort((left, right) => left - right);
}
function entityNames(entity) {
  const names = [];
  for (const language of ["de", "en"]) {
    if (entity?.labels?.[language]?.value) names.push(entity.labels[language].value);
    for (const alias of list(entity?.aliases?.[language])) if (alias?.value) names.push(alias.value);
  }
  return unique(names);
}
function resolvedMediaType(entity) {
  const movieIds = stringClaims(entity, "P4947", /^[1-9]\d{0,8}$/u);
  const tvIds = stringClaims(entity, "P4983", /^[1-9]\d{0,8}$/u);
  const types = itemClaims(entity, "P31");
  const film = (movieIds.length === 1 && tvIds.length === 0) || types.some((qid) => FILM_TYPES.has(qid));
  const series = (tvIds.length === 1 && movieIds.length === 0) || types.some((qid) => SERIES_TYPES.has(qid));
  return film !== series ? (film ? "film" : "series") : null;
}
function factsForEntity(entity, expectedTitle, expectedType, resolvedAt) {
  if (!entity || entity.missing !== undefined || entity.type !== "item"
      || !entityNames(entity).some((name) => normalizedTitle(name) === expectedTitle)
      || resolvedMediaType(entity) !== expectedType) return null;
  const imdb = stringClaims(entity, "P345", /^tt\d{7,10}$/u);
  const tmdb = expectedType === "film"
    ? stringClaims(entity, "P4947", /^[1-9]\d{0,8}$/u)
    : stringClaims(entity, "P4983", /^[1-9]\d{0,8}$/u);
  const years = expectedType === "film"
    ? claimYears(entity, "P577")
    : unique([...claimYears(entity, "P580"), ...claimYears(entity, "P577")]).sort((a, b) => a - b);
  const complete = years.length > 0 || imdb.length === 1 || tmdb.length === 1;
  return Object.freeze({
    qid: entity.id,
    mediaType: expectedType,
    releaseYear: years[0] ?? null,
    externalIds: Object.freeze({
      ...(imdb.length === 1 ? { imdb: imdb[0] } : {}),
      ...(tmdb.length === 1 ? { tmdb: tmdb[0] } : {}),
    }),
    revisionId: Number.isSafeInteger(entity.lastrevid) ? entity.lastrevid : null,
    resolvedAt,
    complete,
  });
}
function annotation(sourceItemId, facts) {
  if (!facts || !QID_FORM.test(facts.qid) || !["film", "series"].includes(facts.mediaType)) return null;
  return Object.freeze({
    sourceItemId,
    qid: facts.qid,
    mediaType: facts.mediaType,
    releaseYear: Number.isInteger(facts.releaseYear) ? facts.releaseYear : null,
    externalIds: Object.freeze({ ...(facts.externalIds || {}) }),
    resolvedAt: facts.resolvedAt,
  });
}
function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function boundedJson(response, abort) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    abort?.(); throw new Error("wikidata_response_too_large");
  }
  if (!response.body?.getReader) return await response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let textPayload = "";
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("wikidata_body_invalid");
      length += value.byteLength;
      if (length > MAX_JSON_BYTES) {
        abort?.();
        try { await reader.cancel("wikidata_response_too_large"); } catch { /* beendet */ }
        throw new Error("wikidata_response_too_large");
      }
      textPayload += decoder.decode(value, { stream: true });
    }
    textPayload += decoder.decode();
    return JSON.parse(textPayload);
  } finally { try { reader.releaseLock(); } catch { /* beendet */ } }
}

/**
 * @param {{
 *   fetchImpl?: typeof globalThis.fetch,
 *   loadCache?: (sourceItemIds: string[]) => Promise<Array<Record<string, unknown>>>,
 *   saveCache?: (row: Record<string, unknown>) => Promise<void>,
 *   now?: () => string,
 *   maxUnknownItems?: number,
 *   requestTimeoutMs?: number,
 *   totalTimeoutMs?: number,
 *   serialPauseMs?: number,
 * }} [options]
 */
export function createWikidataResolver({
  fetchImpl = globalThis.fetch,
  loadCache = async () => [],
  saveCache = async () => {},
  now = () => new Date().toISOString(),
  maxUnknownItems = WIKIDATA_MAX_UNKNOWN_ITEMS,
  requestTimeoutMs = 4_000,
  totalTimeoutMs = 60_000,
  serialPauseMs = 100,
} = {}) {
  let telemetry = Object.freeze({ requests: 0, cacheHits: 0, negativeHits: 0, resolved: 0, stopped: false });

  async function request(params, deadline, state) {
    if (state.requests >= WIKIDATA_MAX_REQUESTS || Date.now() >= deadline) {
      const error = new Error("wikidata_deadline"); error.stopEnrichment = true; throw error;
    }
    const url = new URL(WIKIDATA_API_URL);
    for (const [key, value] of Object.entries({
      ...params, format: "json", formatversion: "2", maxlag: "1",
    })) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const remaining = Math.max(1, Math.min(requestTimeoutMs, deadline - Date.now()));
    const timer = setTimeout(() => controller.abort(), remaining);
    let payload;
    try {
      state.requests += 1;
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Api-User-Agent": "Kinodreieck/1.0 (https://kinodreieck.at)",
        },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response?.ok || response.status === 429) {
        const error = new Error(response?.status === 429 ? "wikidata_rate_limited" : "wikidata_http_error");
        error.stopEnrichment = true; throw error;
      }
      try {
        payload = await boundedJson(response, () => controller.abort());
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") throw error;
        const invalid = new Error("wikidata_invalid_payload");
        invalid.stopEnrichment = true; throw invalid;
      }
      if (!payload || payload.error) {
        const error = new Error(payload?.error?.code === "maxlag" ? "wikidata_maxlag" : "wikidata_invalid_payload");
        error.stopEnrichment = true; throw error;
      }
    } catch (error) {
      if (error?.stopEnrichment === true) throw error;
      const stopped = new Error(controller.signal.aborted || error?.name === "AbortError"
        ? "wikidata_timeout" : "wikidata_transport");
      stopped.stopEnrichment = true; throw stopped;
    } finally { clearTimeout(timer); }
    if (serialPauseMs > 0) await sleep(serialPauseMs);
    return payload;
  }

  async function resolve(items) {
    const started = Date.now();
    const deadline = started + Math.max(1, totalTimeoutMs);
    const state = { requests: 0, cacheHits: 0, negativeHits: 0, resolved: 0, stopped: false, stopReason: null };
    let cachedRows = [];
    try { cachedRows = await loadCache(items.map((item) => item.sourceItemId)); }
    catch { state.stopped = true; state.stopReason = "cache_read_error"; }
    const cache = new Map(list(cachedRows).map((row) => [row?.sourceItemId, row]));
    const annotations = [];
    const unknown = [];
    for (const item of items) {
      const expectedFingerprint = wikidataTitleFingerprint(item);
      const cached = cache.get(item.sourceItemId);
      if (cached && cached.resolverVersion === WIKIDATA_RESOLVER_VERSION
          && cached.titleFingerprint === expectedFingerprint && cached.mediaType === item.mediaType
          && CACHE_STATUSES.has(cached.status)) {
        if (cached.status === "resolved") {
          const value = annotation(item.sourceItemId, cached.facts);
          if (value) annotations.push(value);
          state.cacheHits += 1;
        } else state.negativeHits += 1;
      } else unknown.push({ item, titleFingerprint: expectedFingerprint });
    }

    if (!state.stopped) {
      for (const pending of unknown.slice(0, Math.max(0, Math.min(WIKIDATA_MAX_UNKNOWN_ITEMS, maxUnknownItems)))) {
        const { item, titleFingerprint } = pending;
        const resolvedAt = now();
        try {
          const searchPayload = await request({
            action: "wbsearchentities", search: item.title, language: "de", uselang: "de",
            type: "item", limit: "10", strictlanguage: "1",
          }, deadline, state);
          const expectedTitle = normalizedTitle(item.title);
          const qids = unique(list(searchPayload.search).filter((candidate) => (
            normalizedTitle(candidate?.label) === expectedTitle
            || normalizedTitle(candidate?.match?.text) === expectedTitle
          )).map((candidate) => QID_FORM.test(candidate?.id || "") ? candidate.id : null));
          if (!qids.length) {
            await saveCache({
              sourceItemId: item.sourceItemId, titleFingerprint, mediaType: item.mediaType,
              resolverVersion: WIKIDATA_RESOLVER_VERSION, status: "not_found", facts: null, checkedAt: resolvedAt,
            });
            continue;
          }
          const entitiesPayload = await request({
            action: "wbgetentities", ids: qids.join("|"), props: "info|labels|aliases|claims",
            languages: "de|en", languagefallback: "1",
          }, deadline, state);
          const candidates = qids.map((qid) => factsForEntity(
            entitiesPayload.entities?.[qid], expectedTitle, item.mediaType, resolvedAt,
          )).filter(Boolean);
          const complete = candidates.filter((candidate) => candidate.complete);
          const status = candidates.length > 1 ? "ambiguous_blocked"
            : candidates.length === 1 && complete.length === 0 ? "incomplete_blocked"
              : candidates.length === 1 && complete.length === 1 ? "resolved" : "not_found";
          const facts = status === "resolved" ? complete[0] : null;
          await saveCache({
            sourceItemId: item.sourceItemId, titleFingerprint, mediaType: item.mediaType,
            resolverVersion: WIKIDATA_RESOLVER_VERSION, status, facts, checkedAt: resolvedAt,
          });
          if (facts) {
            annotations.push(annotation(item.sourceItemId, facts));
            state.resolved += 1;
          }
        } catch (error) {
          state.stopped = true;
          state.stopReason = error?.stopEnrichment ? text(error.message) : "cache_write_error";
          break;
        }
      }
    }
    telemetry = Object.freeze({
      requests: state.requests, cacheHits: state.cacheHits, negativeHits: state.negativeHits,
      resolved: state.resolved, stopped: state.stopped,
      ...(state.stopReason ? { stopReason: state.stopReason } : {}),
    });
    return Object.freeze(annotations.filter(Boolean));
  }

  return Object.freeze({ resolve, telemetry: () => telemetry });
}
