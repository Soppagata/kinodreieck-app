/* Providerfreier Joyn-Wochenpool.
   --------------------------------
   - genau ein oeffentlicher, unangemeldeter GET je freigegebener Listen-URL
   - keine Cookies, Tokens, Redirects, Retries oder Browser-Tarnung
   - HTML wird nur fluechtig gelesen; nach der Extraktion bleiben neun
     stabile, allowgelistete Listenfelder je Titel
   - eine unlesbare/gesperrte Quelle verwirft den gesamten neuen Snapshot,
     damit der letzte gute Wochenstand sichtbar bleibt */

export const ENTDECKEN_PUBLIC_FEED_FORMAT = 5;
export const ENTDECKEN_PUBLIC_FEED_ID = "public:weekly-popular-at";
export const ENTDECKEN_PUBLIC_SOURCE_ID = "chart:joyn-at";
export const ENTDECKEN_PUBLIC_POOL_SIZE = 50;
export const ENTDECKEN_PUBLIC_SOURCE_REQUESTS = 2;

export const JOYN_PUBLIC_CHARTS = Object.freeze([
  Object.freeze({
    listUrl: "https://www.joyn.at/collections/meistgesehene-filme",
    canonicalPath: "/collections/meistgesehene-filme",
    itemPathPrefix: "/filme/",
    mediaType: "film",
    heading: "Meistgesehene Filme",
  }),
  Object.freeze({
    listUrl: "https://www.joyn.at/collections/meistgesehene-serien",
    canonicalPath: "/collections/meistgesehene-serien",
    itemPathPrefix: "/serien/",
    mediaType: "series",
    heading: "Meistgesehene Serien",
  }),
]);

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
function normalizeTitle(value) {
  return text(value).normalize("NFKC").toLocaleLowerCase("de-AT")
    .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function decodeHtml(value) {
  const named = Object.freeze({
    amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
  });
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
    .replace(/<[^>]+>/gu, " "))
    .replace(/\s+/g, " ").trim();
}
function safeStringList(value, maxItems = 8) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result = [];
  const seen = new Set();
  for (const raw of value) {
    const clean = text(raw);
    const key = clean.toLocaleLowerCase("de-AT");
    if (!clean || clean.length > 80 || seen.has(key)) return null;
    seen.add(key); result.push(clean);
  }
  return result;
}
function attribute(tag, name) {
  const match = String(tag || "").match(new RegExp(`(?:^|\\s)${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "iu"));
  return match ? decodeHtml(match[2]) : null;
}
function semanticTag(tag, name, expected) {
  return text(attribute(tag, name)) === expected;
}
function expectedUrl(value, expectedPath) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.joyn.at"
      && url.pathname === expectedPath && !url.username && !url.password
      && !url.port && !url.hash;
  } catch { return false; }
}
function itemUrl(value, prefix) {
  try {
    const url = new URL(value, "https://www.joyn.at");
    return url.protocol === "https:" && url.hostname === "www.joyn.at"
      && url.pathname.startsWith(prefix) && url.pathname.length > prefix.length
      && !url.username && !url.password && !url.port && !url.hash
      ? `${url.origin}${url.pathname}` : null;
  } catch { return null; }
}
function sourceItemIdForUrl(value, chart) {
  try {
    const pathname = new URL(value).pathname;
    const slug = pathname.startsWith(chart.itemPathPrefix)
      ? pathname.slice(chart.itemPathPrefix.length) : "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 180) return null;
    return `${chart.mediaType === "film" ? "f" : "s"}_${slug}`;
  } catch { return null; }
}
function canonicalUrl(html) {
  for (const tag of String(html || "").match(/<link\b[^>]*>/giu) || []) {
    if (text(attribute(tag, "rel")).toLowerCase() === "canonical") return attribute(tag, "href");
  }
  return null;
}
function localeIsAustria(html) {
  for (const tag of String(html || "").match(/<meta\b[^>]*>/giu) || []) {
    if (text(attribute(tag, "property")).toLowerCase() === "og:locale") {
      return text(attribute(tag, "content")).toLowerCase() === "de_at";
    }
  }
  return false;
}
function headingExists(html, expected) {
  return (String(html || "").match(/<h1\b[^>]*>[\s\S]*?<\/h1>/giu) || [])
    .some((block) => visibleText(block).includes(expected));
}

/* Next liefert dieselben Karten serverseitig als RSC-initialData. Wir lesen
   daraus ausschliesslich die stabilen, strukturierten Kartenfelder und werfen
   Beschreibungen, Bilder, Logos und den gesamten Rohpayload danach weg. */
function jsonObjectAt(source, start) {
  if (source[start] !== "{") return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  return null;
}
function nextInitialData(html) {
  for (const script of String(html || "").match(/<script>self\.__next_f\.push\([\s\S]*?<\/script>/gu) || []) {
    const argument = script.match(/^<script>self\.__next_f\.push\(([\s\S]*)\)<\/script>$/u)?.[1];
    let chunk;
    try {
      const parsed = JSON.parse(argument);
      chunk = Array.isArray(parsed) && parsed[0] === 1 && typeof parsed[1] === "string" ? parsed[1] : null;
    } catch { chunk = null; }
    if (!chunk) continue;
    const marker = '"initialData":';
    const markerAt = chunk.indexOf(marker);
    if (markerAt < 0) continue;
    let start = markerAt + marker.length;
    while (/\s/u.test(chunk[start] || "")) start += 1;
    const json = jsonObjectAt(chunk, start);
    try { return json ? JSON.parse(json) : null; } catch { return null; }
  }
  return null;
}
function structuredChartCards(html, chart) {
  const initialData = nextInitialData(html);
  const grids = Array.isArray(initialData?.page?.blocks)
    ? initialData.page.blocks.filter((block) => (
      block?.__typename === "Grid" && block?.headline === chart.heading && Array.isArray(block?.assets)
    )) : [];
  if (grids.length !== 1 || grids[0].assets.length !== 50) return null;
  const expectedType = chart.mediaType === "film" ? "Movie" : "Series";
  const rows = [];
  for (const asset of grids[0].assets) {
    const upstreamAssetId = text(asset?.id);
    const title = text(asset?.title);
    const url = itemUrl(asset?.path, chart.itemPathPrefix);
    /* Die interne RSC-ID wird nur als Response-Crosscheck gelesen. Persistente
       Identitaet ist Typ + kanonischer oeffentlicher Joyn-Pfad. */
    const sourceItemId = sourceItemIdForUrl(url, chart);
    const genres = safeStringList((asset?.genres || []).map((genre) => genre?.name), 8);
    const licenseTypes = safeStringList(asset?.licenseTypes, 4);
    if (!/^[a-z]_[a-z0-9]{6,30}$/u.test(upstreamAssetId) || !sourceItemId
        || asset?.__typename !== expectedType
        || !title || title.length > 200 || !url || !genres || !licenseTypes
        || licenseTypes.some((license) => !["AVOD", "FVOD", "SVOD"].includes(license))) return null;
    rows.push(Object.freeze({ sourceItemId, title, url, mediaType: chart.mediaType, genres, licenseTypes }));
  }
  return rows;
}

export function extractJoynChartItems(html, chart) {
  if (!chart || !JOYN_PUBLIC_CHARTS.includes(chart) || typeof html !== "string"
      || html.length < 1 || BLOCK_PAGE_FORM.test(html)
      || !expectedUrl(canonicalUrl(html), chart.canonicalPath)
      || !localeIsAustria(html) || !headingExists(html, chart.heading)) return Object.freeze([]);

  const structured = structuredChartCards(html, chart);
  if (!structured) return Object.freeze([]);
  const structuredByUrl = new Map(structured.map((item) => [item.url, item]));
  if (structuredByUrl.size !== structured.length) return Object.freeze([]);
  const matchingLists = [];
  for (const block of html.match(/<ul\b[^>]*>[\s\S]*?<\/ul>/giu) || []) {
    const cards = [];
    for (const listItem of block.match(/<li\b[^>]*>[\s\S]*?<\/li>/giu) || []) {
      const anchorMatch = listItem.match(/<a\b[^>]*>[\s\S]*?<\/a>/iu);
      if (!anchorMatch || !semanticTag(anchorMatch[0].match(/^<a\b[^>]*>/iu)?.[0], "data-testid", "CSP")) continue;
      const url = itemUrl(attribute(anchorMatch[0].match(/^<a\b[^>]*>/iu)?.[0], "href"), chart.itemPathPrefix);
      const titleBlock = anchorMatch[0].match(/<div\b[^>]*data-testid\s*=\s*(["'])VISH\1[^>]*>[\s\S]*?<\/div>/iu)?.[0];
      const title = visibleText(titleBlock);
      if (!url || !title || title.length > 200) continue;
      const facts = structuredByUrl.get(url);
      if (!facts || facts.title !== title) return Object.freeze([]);
      cards.push(Object.freeze({ ...facts }));
    }
    if (cards.length) matchingLists.push(cards);
  }
  if (matchingLists.length !== 1) return Object.freeze([]);
  const unique = new Map();
  for (const card of matchingLists[0]) {
    const key = `${card.mediaType}|${normalizeTitle(card.title)}`;
    if (!normalizeTitle(card.title) || unique.has(key)) return Object.freeze([]);
    unique.set(key, Object.freeze({ ...card, sourcePosition: unique.size + 1 }));
  }
  if (unique.size !== structured.length
      || [...unique.values()].some((item) => !structuredByUrl.has(item.url))) return Object.freeze([]);
  return Object.freeze([...unique.values()]);
}

async function boundedHtml(response, maxBytes, abort) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    abort?.(); throw new Error("source_too_large");
  }
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) { abort?.(); throw new Error("source_too_large"); }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("source_body_invalid");
      length += value.byteLength;
      if (length > maxBytes) {
        abort?.();
        try { await reader.cancel("source_too_large"); } catch { /* bereits abgebrochen */ }
        throw new Error("source_too_large");
      }
      chunks.push(value);
    }
  } finally { try { reader.releaseLock(); } catch { /* beendet */ } }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function createJoynPublicChartAdapter({
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxHtmlBytes = MAX_HTML_BYTES,
} = {}) {
  let telemetry = Object.freeze({ sourceRequests: 0, sourceItemCount: 0, eligibleUniqueCount: 0 });
  return Object.freeze({
    mode: "public-chart",
    async search(_queryContext, { retrievedOn, claimedIsoWeek } = {}) {
      if (typeof fetchImpl !== "function" || !validDay(retrievedOn)
          || typeof claimedIsoWeek !== "string" || !/^\d{4}-W\d{2}$/.test(claimedIsoWeek)) {
        throw new Error("public_chart_setup_invalid");
      }
      const fetchedAt = now();
      if (!validInstant(fetchedAt)) throw new Error("public_chart_clock_invalid");
      const lists = [];
      let sourceRequests = 0;
      for (const chart of JOYN_PUBLIC_CHARTS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
        let response;
        try {
          sourceRequests += 1;
          telemetry = Object.freeze({
            sourceRequests,
            sourceItemCount: lists.reduce((sum, items) => sum + items.length, 0),
            eligibleUniqueCount: 0,
          });
          response = await fetchImpl(chart.listUrl, {
            method: "GET",
            headers: { Accept: "text/html" },
            redirect: "error",
            signal: controller.signal,
          });
          const contentType = text(response?.headers?.get?.("content-type")).toLowerCase();
          if (!response?.ok || !contentType.startsWith("text/html")) {
            const error = new Error([401, 403, 429].includes(response?.status)
              ? "public_chart_blocked" : "public_chart_transport_invalid");
            error.sourceStatus = Number(response?.status) || null;
            throw error;
          }
          const html = await boundedHtml(response, maxHtmlBytes, () => controller.abort());
          const items = extractJoynChartItems(html, chart);
          if (items.length !== 50) throw new Error("public_chart_structure_invalid");
          lists.push(items);
          telemetry = Object.freeze({
            sourceRequests,
            sourceItemCount: lists.reduce((sum, rows) => sum + rows.length, 0),
            eligibleUniqueCount: 0,
          });
        } finally {
          clearTimeout(timer);
        }
      }
      const combined = [];
      const seen = new Set();
      for (let position = 0; combined.length < ENTDECKEN_PUBLIC_POOL_SIZE; position += 1) {
        let added = false;
        for (const sourceItems of lists) {
          const item = sourceItems[position];
          if (!item) continue;
          added = true;
          const key = normalizeTitle(item.title);
          if (seen.has(key)) continue;
          seen.add(key);
          combined.push(Object.freeze({
            title: item.title,
            sourceItemId: item.sourceItemId,
            mediaType: item.mediaType,
            genres: Object.freeze([...item.genres]),
            licenseTypes: Object.freeze([...item.licenseTypes]),
            sourcePosition: item.sourcePosition,
            listDate: retrievedOn,
            sourceUrl: item.url,
            fetchedAt,
          }));
          if (combined.length === ENTDECKEN_PUBLIC_POOL_SIZE) break;
        }
        if (!added) break;
      }
      telemetry = Object.freeze({
        sourceRequests,
        sourceItemCount: lists.reduce((sum, items) => sum + items.length, 0),
        eligibleUniqueCount: combined.length,
      });
      if (combined.length !== ENTDECKEN_PUBLIC_POOL_SIZE) throw new Error("public_chart_pool_insufficient");
      return Object.freeze({
        sourceMode: "public-chart",
        sourceId: ENTDECKEN_PUBLIC_SOURCE_ID,
        queryContext: _queryContext,
        checkedAt: fetchedAt,
        retrievedOn,
        isoWeek: claimedIsoWeek,
        items: Object.freeze(combined),
      });
    },
    telemetry() { return telemetry; },
  });
}
