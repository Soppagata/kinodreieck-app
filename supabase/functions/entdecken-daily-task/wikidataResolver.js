/* Optionale, kostenfreie Wikidata-Anreicherung fuer den oeffentlichen Pool.
   ------------------------------------------------------------------------
   - offizielle stabile Wikibase-REST-API v1, seriell und ohne Retry
   - exakt ein Titel-Suchergebnis, bevor eine Entity gelesen wird
   - Typ, Jahr und externe IDs werden nur bei eindeutigen Aussagen uebernommen
   - positive und zeitlich begrenzte negative Entscheidungen werden persistent
     gecacht; Rohpayloads und Beschreibungen gelangen nie in den Cache
   - 429, Timeout, Transport- oder Cachefehler stoppt nur die Anreicherung;
     der letzte belegte Basispool bleibt davon unabhaengig */

export const WIKIDATA_REST_API_URL = "https://www.wikidata.org/w/rest.php/wikibase/v1";
export const WIKIDATA_RESOLVER_VERSION = 2;
export const WIKIDATA_MAX_UNKNOWN_ITEMS = 20;
export const WIKIDATA_MAX_REQUESTS = 40;
export const WIKIDATA_NEGATIVE_CACHE_DAYS = 30;

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
function validInstant(value) {
  return typeof value === "string" && value === text(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
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
function activeStatementValues(entity, property) {
  return list(entity?.statements?.[property]).filter((statement) => (
    statement?.rank !== "deprecated" && statement?.value?.type === "value"
    && statement.value.content != null
  )).map((statement) => statement.value.content);
}
function stringStatements(entity, property, form) {
  return unique(activeStatementValues(entity, property)
    .filter((value) => typeof value === "string" && form.test(value)));
}
function itemStatements(entity, property) {
  return unique(activeStatementValues(entity, property)
    .filter((value) => typeof value === "string" && QID_FORM.test(value)));
}
function statementYears(entity, property) {
  return unique(activeStatementValues(entity, property).map((value) => {
    const match = value && typeof value === "object" && typeof value.time === "string"
      ? /^\+?(\d{4})-/u.exec(value.time) : null;
    const year = match ? Number(match[1]) : null;
    return Number.isInteger(year) && year >= 1888 && year <= new Date().getUTCFullYear() + 10 ? year : null;
  })).sort((left, right) => left - right);
}
function entityNames(entity) {
  return unique(["de", "en"].flatMap((language) => [
    typeof entity?.labels?.[language] === "string" ? entity.labels[language] : null,
    ...list(entity?.aliases?.[language]).filter((value) => typeof value === "string"),
  ]));
}
function resolvedMediaType(entity) {
  const movieIds = stringStatements(entity, "P4947", /^[1-9]\d{0,8}$/u);
  const tvIds = stringStatements(entity, "P4983", /^[1-9]\d{0,8}$/u);
  const types = itemStatements(entity, "P31");
  const film = (movieIds.length === 1 && tvIds.length === 0) || types.some((qid) => FILM_TYPES.has(qid));
  const series = (tvIds.length === 1 && movieIds.length === 0) || types.some((qid) => SERIES_TYPES.has(qid));
  return film !== series ? (film ? "film" : "series") : null;
}
function factsForEntity(entity, expectedTitle, expectedType, resolvedAt) {
  if (!entity || entity.type !== "item" || !QID_FORM.test(entity.id || "")
      || !entityNames(entity).some((name) => normalizedTitle(name) === expectedTitle)
      || resolvedMediaType(entity) !== expectedType) return null;
  const imdb = stringStatements(entity, "P345", /^tt\d{7,10}$/u);
  const tmdb = expectedType === "film"
    ? stringStatements(entity, "P4947", /^[1-9]\d{0,8}$/u)
    : stringStatements(entity, "P4983", /^[1-9]\d{0,8}$/u);
  const years = expectedType === "film"
    ? statementYears(entity, "P577")
    : unique([...statementYears(entity, "P580"), ...statementYears(entity, "P577")]).sort((a, b) => a - b);
  const releaseYear = years.length === 1 ? years[0] : null;
  const externalIds = Object.freeze({
    ...(imdb.length === 1 ? { imdb: imdb[0] } : {}),
    ...(tmdb.length === 1 ? { tmdb: tmdb[0] } : {}),
  });
  return Object.freeze({
    qid: entity.id,
    mediaType: expectedType,
    releaseYear,
    externalIds,
    revisionId: null,
    resolvedAt,
    complete: releaseYear !== null || Object.keys(externalIds).length > 0,
  });
}
function annotation(sourceItemId, facts) {
  if (!facts || !QID_FORM.test(facts.qid) || !["film", "series"].includes(facts.mediaType)
      || !facts.complete) return null;
  return Object.freeze({
    sourceItemId,
    qid: facts.qid,
    mediaType: facts.mediaType,
    releaseYear: Number.isInteger(facts.releaseYear) ? facts.releaseYear : null,
    externalIds: Object.freeze({ ...(facts.externalIds || {}) }),
    resolvedAt: facts.resolvedAt,
  });
}
function negativeCacheFresh(row, checkedAt) {
  if (!validInstant(row?.checkedAt) || !validInstant(checkedAt)) return false;
  const age = Date.parse(checkedAt) - Date.parse(row.checkedAt);
  return age >= 0 && age <= WIKIDATA_NEGATIVE_CACHE_DAYS * 86_400_000;
}
function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
async function boundedJson(response, abort) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    abort?.(); throw new Error("wikidata_response_too_large");
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_JSON_BYTES) { abort?.(); throw new Error("wikidata_response_too_large"); }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let payload = "";
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
      payload += decoder.decode(value, { stream: true });
    }
    payload += decoder.decode();
    return JSON.parse(payload);
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

  async function request(path, searchParams, deadline, state) {
    if (state.requests >= WIKIDATA_MAX_REQUESTS || Date.now() >= deadline) {
      const error = new Error("wikidata_deadline"); error.stopEnrichment = true; throw error;
    }
    const url = new URL(`${WIKIDATA_REST_API_URL}${path}`);
    for (const [key, value] of Object.entries(searchParams || {})) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const remaining = Math.max(1, Math.min(requestTimeoutMs, deadline - Date.now()));
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      state.requests += 1;
      const response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Kinodreieck/1.0 (https://kinodreieck.at)",
        },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response?.ok) {
        const error = new Error(response?.status === 429 ? "wikidata_rate_limited" : "wikidata_http_error");
        error.stopEnrichment = true; throw error;
      }
      let payload;
      try { payload = await boundedJson(response, () => controller.abort()); }
      catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") throw error;
        const invalid = new Error("wikidata_invalid_payload"); invalid.stopEnrichment = true; throw invalid;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        const error = new Error("wikidata_invalid_payload"); error.stopEnrichment = true; throw error;
      }
      if (serialPauseMs > 0) await sleep(serialPauseMs);
      return payload;
    } catch (error) {
      if (error?.stopEnrichment === true) throw error;
      const stopped = new Error(controller.signal.aborted || error?.name === "AbortError"
        ? "wikidata_timeout" : "wikidata_transport");
      stopped.stopEnrichment = true; throw stopped;
    } finally { clearTimeout(timer); }
  }

  async function resolve(items) {
    const deadline = Date.now() + Math.max(1, totalTimeoutMs);
    const checkedAt = now();
    const state = { requests: 0, cacheHits: 0, negativeHits: 0, resolved: 0, stopped: false, stopReason: null };
    if (!validInstant(checkedAt)) { state.stopped = true; state.stopReason = "resolver_clock_invalid"; }
    let cachedRows = [];
    if (!state.stopped) {
      try { cachedRows = await loadCache(list(items).map((item) => item.sourceItemId)); }
      catch { state.stopped = true; state.stopReason = "cache_read_error"; }
    }
    const cache = new Map(list(cachedRows).map((row) => [row?.sourceItemId, row]));
    const annotations = [];
    const unknown = [];
    for (const item of list(items)) {
      const titleFingerprint = wikidataTitleFingerprint(item);
      const cached = cache.get(item.sourceItemId);
      const reusable = cached && cached.resolverVersion === WIKIDATA_RESOLVER_VERSION
        && cached.titleFingerprint === titleFingerprint && cached.mediaType === item.mediaType
        && CACHE_STATUSES.has(cached.status)
        && (cached.status === "resolved" || negativeCacheFresh(cached, checkedAt));
      if (reusable) {
        if (cached.status === "resolved") {
          const value = annotation(item.sourceItemId, { ...cached.facts, complete: true });
          if (value) { annotations.push(value); state.cacheHits += 1; }
          else unknown.push({ item, titleFingerprint });
        } else state.negativeHits += 1;
      } else unknown.push({ item, titleFingerprint });
    }

    if (!state.stopped) {
      for (const { item, titleFingerprint } of unknown
        .slice(0, Math.max(0, Math.min(WIKIDATA_MAX_UNKNOWN_ITEMS, maxUnknownItems)))) {
        const resolvedAt = now();
        if (!validInstant(resolvedAt)) { state.stopped = true; state.stopReason = "resolver_clock_invalid"; break; }
        try {
          const search = await request("/search/items", {
            q: item.title, language: "de", limit: "10",
          }, deadline, state);
          if (!Array.isArray(search.results)) {
            const error = new Error("wikidata_invalid_payload"); error.stopEnrichment = true; throw error;
          }
          const expectedTitle = normalizedTitle(item.title);
          const qids = unique(search.results.filter((candidate) => (
            normalizedTitle(candidate?.["display-label"]?.value) === expectedTitle
            || normalizedTitle(candidate?.match?.text) === expectedTitle
          )).map((candidate) => QID_FORM.test(candidate?.id || "") ? candidate.id : null));
          if (qids.length !== 1) {
            await saveCache({
              sourceItemId: item.sourceItemId, titleFingerprint, mediaType: item.mediaType,
              resolverVersion: WIKIDATA_RESOLVER_VERSION,
              status: qids.length ? "ambiguous_blocked" : "not_found", facts: null, checkedAt: resolvedAt,
            });
            continue;
          }
          const entity = await request(`/entities/items/${encodeURIComponent(qids[0])}`, {}, deadline, state);
          const candidate = factsForEntity(entity, expectedTitle, item.mediaType, resolvedAt);
          const status = candidate?.complete ? "resolved" : "incomplete_blocked";
          const facts = status === "resolved" ? candidate : null;
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
