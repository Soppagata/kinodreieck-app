/* Providerfreier, marktuebergreifender Entdecken-Wochenpool.
   ---------------------------------------------------------
   - behaelt den bewaehrten Joyn-50er als eigenstaendigen Adapter/Fallback
   - ergaenzt genau eine offizielle oesterreichische Kinochart-Quelle
   - drei retryfreie, unangemeldete GETs pro neuem Pool (2 Joyn + 1 OeFI)
   - scheitert eine Quelle oder driftet ihre Struktur, wird kein Teilpool
     gespeichert; der Runner behaelt den letzten guten Gesamtpool
   - Popularitaet, Verfuegbarkeit und spaetere persoenliche Passung bleiben
     als getrennte Fakten modelliert */

import { createJoynPublicChartAdapter } from "./publicChartAdapter.js";

export const ENTDECKEN_MIXED_FEED_FORMAT = 6;
export const ENTDECKEN_MIXED_FEED_ID = "public:weekly-market-mix-at";
export const ENTDECKEN_MIXED_SOURCE_ID = "chart:market-mix-at";
export const ENTDECKEN_OEFI_SOURCE_ID = "chart:oefi-weekend-at";
export const ENTDECKEN_MIXED_POOL_SIZE = 50;
export const ENTDECKEN_MIXED_SOURCE_REQUESTS = 3;
export const ENTDECKEN_MIXED_MARKET_COUNTS = Object.freeze({
  cinema: 15,
  streamingFilm: 18,
  streamingSeries: 17,
});

export const OEFI_WEEKEND_CHART = Object.freeze({
  listUrl: "https://filminstitut.at/charts",
  canonicalPath: "/charts",
  sourceId: ENTDECKEN_OEFI_SOURCE_ID,
  sourceLabel: "Österreichisches Filminstitut",
});

const JOYN_SOURCE_ID = "chart:joyn-at";
const JOYN_SOURCE_LABEL = "Joyn Österreich";
const MAX_HTML_BYTES = 512_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const BLOCK_PAGE_FORM = /(?:captcha|verify\s+(?:that\s+)?you\s+are\s+human|access\s+denied|unusual\s+traffic)/iu;

function text(value) { return String(value == null ? "" : value).trim(); }
function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function validInstant(value) {
  return typeof value === "string" && value === text(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function normalizedTitle(value) {
  return text(value).normalize("NFKC").toLocaleLowerCase("de-AT")
    .replace(/[‐‑‒–—―]/gu, "-").replace(/[‘’‚‛`´]/gu, "'").replace(/…/gu, "...")
    .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/gu, " ").trim();
}
function decodeHtml(value) {
  const named = Object.freeze({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " });
  return String(value || "").replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/giu, (whole, entity) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? whole;
    const hex = entity[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    try {
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint) : whole;
    } catch { return whole; }
  });
}
function visibleText(value) {
  return decodeHtml(String(value || "")
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/giu, " ")
    .replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();
}
function attribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag || "").match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*([\"'])([\\s\\S]*?)\\1`, "iu"));
  return match ? decodeHtml(match[2]) : null;
}
function canonicalUrl(html) {
  for (const tag of String(html || "").match(/<link\b[^>]*>/giu) || []) {
    if (text(attribute(tag, "rel")).toLowerCase() === "canonical") return attribute(tag, "href");
  }
  return null;
}
function expectedOefiCanonical(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "filminstitut.at"
      && url.pathname === OEFI_WEEKEND_CHART.canonicalPath
      && !url.username && !url.password && !url.port && !url.hash;
  } catch { return false; }
}
function hash64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
function germanInteger(value) {
  const clean = text(value);
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+)$/.test(clean)) return null;
  const parsed = Number(clean.replaceAll(".", ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function isoDay(day, month, year) {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return validDay(value) ? value : null;
}
function weekendPeriod(value) {
  const match = text(value).match(/^TOP\s+15\s+vom\s+(\d{2})\.(\d{2})\.\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/u);
  if (!match) return null;
  const end = isoDay(Number(match[3]), Number(match[4]), Number(match[5]));
  let start = isoDay(Number(match[1]), Number(match[2]), Number(match[5]));
  if (!start || !end) return null;
  if (start > end) start = isoDay(Number(match[1]), Number(match[2]), Number(match[5]) - 1);
  const duration = start ? (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 : -1;
  return Number.isInteger(duration) && duration >= 0 && duration <= 4
    ? Object.freeze({ start, end }) : null;
}
function sourcePeriodLabel(period) {
  const startDay = period.start.slice(8, 10);
  const startMonth = period.start.slice(5, 7);
  const endDay = period.end.slice(8, 10);
  const endMonth = period.end.slice(5, 7);
  const endYear = period.end.slice(0, 4);
  return period.start.slice(0, 7) === period.end.slice(0, 7)
    ? `${startDay}.-${endDay}.${endMonth}.${endYear}`
    : `${startDay}.${startMonth}.-${endDay}.${endMonth}.${endYear}`;
}

export function extractOefiWeekendChartItems(html) {
  if (typeof html !== "string" || !html || html.length > MAX_HTML_BYTES
      || BLOCK_PAGE_FORM.test(html) || !expectedOefiCanonical(canonicalUrl(html))) {
    return Object.freeze([]);
  }
  const headings = [...html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/giu)]
    .filter((match) => visibleText(match[0]) === "Wochenendcharts");
  if (headings.length !== 1) return Object.freeze([]);
  const startAt = headings[0].index + headings[0][0].length;
  const nextSection = html.indexOf('<div class="charts-shortcode container">', startAt);
  const block = html.slice(startAt, nextSection < 0 ? html.length : nextSection);
  const description = block.match(/<div\b[^>]*class\s*=\s*(["'])[^"']*charts-shortcode__description[^"']*\1[^>]*>[\s\S]*?<\/div>/iu);
  const period = weekendPeriod(visibleText(description?.[0]));
  const table = block.match(/<table\b[^>]*>[\s\S]*?<\/table>/iu)?.[0];
  const sourceNote = visibleText(block.match(/<span\b[^>]*tablepress-table-description[^>]*>[\s\S]*?<\/span>/iu)?.[0]);
  if (!period || !table || !/Quelle:\s*Comscore,\s*Wochenendcharts/iu.test(sourceNote)
      || !sourceNote.includes(`Zeitraum: ${sourcePeriodLabel(period)}`)) {
    return Object.freeze([]);
  }
  const headers = (table.match(/<th\b[^>]*>[\s\S]*?<\/th>/giu) || []).map(visibleText);
  if (JSON.stringify(headers) !== JSON.stringify([
    "Rang", "Filmtitel", "Verleih", "Besuche Wochenende", "Besuche gesamt",
  ])) return Object.freeze([]);
  const rows = [];
  const body = table.match(/<tbody\b[^>]*>[\s\S]*?<\/tbody>/iu)?.[0] || "";
  for (const row of body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu) || []) {
    const cells = (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/giu) || []).map(visibleText);
    if (cells.length !== 5) return Object.freeze([]);
    const rank = Number(cells[0]);
    const title = text(cells[1]);
    const weekendAdmissions = germanInteger(cells[3]);
    const totalAdmissions = germanInteger(cells[4]);
    if (rank !== rows.length + 1 || !title || title.length > 200
        || weekendAdmissions === null || totalAdmissions === null) return Object.freeze([]);
    rows.push(Object.freeze({
      sourceItemId: `f_oefi-${hash64(`film|${normalizedTitle(title)}`)}`,
      title,
      mediaType: "film",
      sourcePosition: rank,
      weekendAdmissions,
      totalAdmissions,
      measuredOn: period.end,
      url: OEFI_WEEKEND_CHART.listUrl,
    }));
  }
  return rows.length === ENTDECKEN_MIXED_MARKET_COUNTS.cinema
    ? Object.freeze(rows) : Object.freeze([]);
}

async function boundedHtml(response, maxBytes, abort) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    abort?.(); throw new Error("public_mix_source_too_large");
  }
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) { abort?.(); throw new Error("public_mix_source_too_large"); }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("public_mix_source_body_invalid");
      length += value.byteLength;
      if (length > maxBytes) {
        abort?.();
        try { await reader.cancel("public_mix_source_too_large"); } catch { /* beendet */ }
        throw new Error("public_mix_source_too_large");
      }
      chunks.push(value);
    }
  } finally { try { reader.releaseLock(); } catch { /* beendet */ } }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function joynItem(item, fetchedAt, retrievedOn) {
  return Object.freeze({
    title: item.title,
    sourceItemId: item.sourceItemId,
    sourceId: JOYN_SOURCE_ID,
    sourceLabel: JOYN_SOURCE_LABEL,
    mediaType: item.mediaType,
    genres: Object.freeze([...item.genres]),
    availability: Object.freeze({
      region: "AT",
      market: "streaming",
      service: "Joyn",
      licenseTypes: Object.freeze([...item.licenseTypes]),
    }),
    popularity: Object.freeze({
      metric: "source-chart-rank",
      rank: item.sourcePosition,
      measuredOn: retrievedOn,
      value: null,
    }),
    sourceUrl: item.sourceUrl,
    fetchedAt,
  });
}
function oefiItem(item, fetchedAt) {
  return Object.freeze({
    title: item.title,
    sourceItemId: item.sourceItemId,
    sourceId: ENTDECKEN_OEFI_SOURCE_ID,
    sourceLabel: OEFI_WEEKEND_CHART.sourceLabel,
    mediaType: "film",
    genres: Object.freeze([]),
    availability: Object.freeze({
      region: "AT", market: "cinema", service: null, licenseTypes: Object.freeze([]),
    }),
    popularity: Object.freeze({
      metric: "weekend-admissions",
      rank: item.sourcePosition,
      measuredOn: item.measuredOn,
      value: item.weekendAdmissions,
    }),
    sourceUrl: item.url,
    fetchedAt,
  });
}
function takeUnique(rows, limit, seen) {
  const chosen = [];
  for (const row of rows) {
    const identity = normalizedTitle(row.title);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity); chosen.push(row);
    if (chosen.length === limit) break;
  }
  return chosen;
}
function interleave(groups) {
  const rows = [];
  for (let index = 0; rows.length < ENTDECKEN_MIXED_POOL_SIZE; index += 1) {
    let added = false;
    for (const group of groups) {
      if (!group[index]) continue;
      rows.push(group[index]); added = true;
    }
    if (!added) break;
  }
  return rows;
}

export function createMixedPublicChartAdapter({
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxHtmlBytes = MAX_HTML_BYTES,
} = {}) {
  let telemetry = Object.freeze({
    sourceRequests: 0, sourceItemCount: 0, eligibleUniqueCount: 0,
    marketCounts: ENTDECKEN_MIXED_MARKET_COUNTS,
  });
  return Object.freeze({
    mode: "public-mix",
    async search(queryContext, { retrievedOn, claimedIsoWeek } = {}) {
      if (typeof fetchImpl !== "function" || !validDay(retrievedOn)
          || typeof claimedIsoWeek !== "string" || !/^\d{4}-W\d{2}$/.test(claimedIsoWeek)) {
        throw new Error("public_mix_setup_invalid");
      }
      const fetchedAt = now();
      if (!validInstant(fetchedAt)) throw new Error("public_mix_clock_invalid");
      const joyn = createJoynPublicChartAdapter({
        fetchImpl, now: () => fetchedAt, timeoutMs, maxHtmlBytes,
      });
      const joynEnvelope = await joyn.search(queryContext, { retrievedOn, claimedIsoWeek });
      telemetry = Object.freeze({
        sourceRequests: joyn.telemetry().sourceRequests,
        sourceItemCount: joyn.telemetry().sourceItemCount,
        eligibleUniqueCount: 0,
        marketCounts: ENTDECKEN_MIXED_MARKET_COUNTS,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      let response;
      try {
        response = await fetchImpl(OEFI_WEEKEND_CHART.listUrl, {
          method: "GET", headers: { Accept: "text/html" }, redirect: "error", signal: controller.signal,
        });
        telemetry = Object.freeze({
          sourceRequests: joyn.telemetry().sourceRequests + 1,
          sourceItemCount: joyn.telemetry().sourceItemCount,
          eligibleUniqueCount: 0,
          marketCounts: ENTDECKEN_MIXED_MARKET_COUNTS,
        });
        const contentType = text(response?.headers?.get?.("content-type")).toLowerCase();
        if (!response?.ok || !contentType.startsWith("text/html")) {
          const error = new Error([401, 403, 429].includes(response?.status)
            ? "public_mix_source_blocked" : "public_mix_source_transport_invalid");
          error.sourceStatus = Number(response?.status) || null;
          throw error;
        }
        const html = await boundedHtml(response, maxHtmlBytes, () => controller.abort());
        const cinemaRows = extractOefiWeekendChartItems(html);
        if (cinemaRows.length !== ENTDECKEN_MIXED_MARKET_COUNTS.cinema) {
          throw new Error("public_mix_source_structure_invalid");
        }

        const seen = new Set();
        const cinema = takeUnique(cinemaRows.map((item) => oefiItem(item, fetchedAt)),
          ENTDECKEN_MIXED_MARKET_COUNTS.cinema, seen);
        const joynFilms = takeUnique(joynEnvelope.items.filter((item) => item.mediaType === "film")
          .map((item) => joynItem(item, fetchedAt, retrievedOn)),
        ENTDECKEN_MIXED_MARKET_COUNTS.streamingFilm, seen);
        const joynSeries = takeUnique(joynEnvelope.items.filter((item) => item.mediaType === "series")
          .map((item) => joynItem(item, fetchedAt, retrievedOn)),
        ENTDECKEN_MIXED_MARKET_COUNTS.streamingSeries, seen);
        if (cinema.length !== ENTDECKEN_MIXED_MARKET_COUNTS.cinema
            || joynFilms.length !== ENTDECKEN_MIXED_MARKET_COUNTS.streamingFilm
            || joynSeries.length !== ENTDECKEN_MIXED_MARKET_COUNTS.streamingSeries) {
          throw new Error("public_mix_pool_insufficient");
        }
        const items = interleave([cinema, joynFilms, joynSeries]);
        if (items.length !== ENTDECKEN_MIXED_POOL_SIZE) throw new Error("public_mix_pool_insufficient");
        telemetry = Object.freeze({
          sourceRequests: ENTDECKEN_MIXED_SOURCE_REQUESTS,
          sourceItemCount: joyn.telemetry().sourceItemCount + cinemaRows.length,
          eligibleUniqueCount: items.length,
          marketCounts: ENTDECKEN_MIXED_MARKET_COUNTS,
        });
        return Object.freeze({
          sourceMode: "public-mix",
          sourceId: ENTDECKEN_MIXED_SOURCE_ID,
          sourceIds: Object.freeze([JOYN_SOURCE_ID, ENTDECKEN_OEFI_SOURCE_ID]),
          queryContext,
          checkedAt: fetchedAt,
          retrievedOn,
          isoWeek: claimedIsoWeek,
          items: Object.freeze(items),
        });
      } finally { clearTimeout(timer); }
    },
    telemetry() { return telemetry; },
  });
}
