import {
  ENTDECKEN_DAILY_MAX_ITEMS,
  ENTDECKEN_DAILY_MAX_SEARCH_RESULTS,
  validateEntdeckenWeeklyQueryContext,
  validateEntdeckenSourceRegistry,
} from "./contract.js";

export const ENTDECKEN_DAILY_PROVIDER_TASK = "entdecken-daily";
export const ENTDECKEN_DAILY_PROVIDER_VERSION = "anthropic-web-search-20250305";
export const ENTDECKEN_DAILY_PROMPT_VERSION = "entdecken-weekly-v1";
export const ENTDECKEN_DAILY_MAX_TOKENS = 2800;
export const ENTDECKEN_DAILY_TASK_CAP_USD_CENT = 5;
export const ENTDECKEN_DAILY_SEARCH_FEE_USD_CENT = 1;
export const ENTDECKEN_DAILY_TIMEOUT_MAX_MS = 135_000;
export const ENTDECKEN_DAILY_RESPONSE_MAX_BYTES = 512_000;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL_FORM = /^claude-haiku-4-5(?:-[0-9]{8})?$/;
const MODEL_PRICE_FLOOR = Object.freeze({ input: 100, output: 500 });
const SAFE_ERROR_CODES = new Set([
  "already-used", "cost-gate-rejected", "cost-log-invalid", "cost-settlement-failed",
  "http-error", "provider-body-invalid", "provider-response-too-large", "provider-timeout",
  "provider-tool-error", "provider-tool-shape-invalid", "provider-usage-invalid",
  "provider-stop-reason-invalid", "provider-output-invalid", "provider-result-count-invalid",
  "provider-citation-invalid", "provider-domain-invalid", "provider-cost-invalid",
  "provider-query-context-invalid", "setup-invalid",
]);

function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value) { return String(value == null ? "" : value).trim(); }
function finitePositive(value) { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function directUrl(value) {
  if (typeof value !== "string" || value !== text(value) || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      && !parsed.port && !parsed.hash ? parsed : null;
  } catch { return null; }
}
function hostAllowed(hostname, domains) {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}
function roundCost(value) { return Math.ceil(value * 10_000) / 10_000; }
function costFromUsage(setup, inputTokens, outputTokens, searchRequests) {
  if (![inputTokens, outputTokens, searchRequests].every(Number.isInteger)
      || inputTokens < 0 || outputTokens < 0 || searchRequests < 0) return null;
  return roundCost(
    (inputTokens * setup.inputPriceUsdCentPerMtok) / 1_000_000
      + (outputTokens * setup.outputPriceUsdCentPerMtok) / 1_000_000
      + searchRequests * setup.searchFeeUsdCent,
  );
}

export class EntdeckenDailyProviderError extends Error {
  constructor(code, usage = null) {
    const safe = SAFE_ERROR_CODES.has(code) ? code : "provider-body-invalid";
    super(safe);
    this.name = "EntdeckenDailyProviderError";
    this.code = safe;
    this.usage = usage;
  }
}

function setupError() { throw new EntdeckenDailyProviderError("setup-invalid"); }

export function validateEntdeckenDailyProviderSetup(value) {
  const sourceCheck = validateEntdeckenSourceRegistry(value?.sourceRegistry);
  if (!plain(value) || value.feedEnabled !== true || value.providerEnabled !== true
      || value.providerAllowed !== true || value.modelAlias !== "klein"
      || !MODEL_FORM.test(value.model) || value.maxTokens !== ENTDECKEN_DAILY_MAX_TOKENS
      || value.taskCapUsdCent !== ENTDECKEN_DAILY_TASK_CAP_USD_CENT
      || value.searchFeeUsdCent !== ENTDECKEN_DAILY_SEARCH_FEE_USD_CENT
      || !finitePositive(value.globalRequestCapUsdCent) || value.globalRequestCapUsdCent > 500
      || value.taskCapUsdCent > value.globalRequestCapUsdCent
      || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > ENTDECKEN_DAILY_TIMEOUT_MAX_MS
      || !finitePositive(value.inputPriceUsdCentPerMtok) || value.inputPriceUsdCentPerMtok < MODEL_PRICE_FLOOR.input
      || !finitePositive(value.outputPriceUsdCentPerMtok) || value.outputPriceUsdCentPerMtok < MODEL_PRICE_FLOOR.output
      || !sourceCheck.ok) setupError();
  return Object.freeze({
    ...value,
    sourceRegistry: sourceCheck.value,
    allowedDomains: Object.freeze(sourceCheck.value.map((source) => source.domain).sort()),
  });
}

const SYSTEM_PROMPT = [
  "Du erstellst einen allgemeinen, nicht personalisierten Wochenfeed fuer Oesterreich.",
  "Fuehre genau eine Websuche fuer das im Nutzerobjekt genannte ISO-Jahr und die dort genannte Kalenderwoche aus.",
  "Suche ausschliesslich aktuell und allgemein positiv besprochene Filme und Serien aus derstandard.at und film.at; nutze keine andere Quelle.",
  "Nenne nur Werke, deren Titel, Werktyp, Veroeffentlichungsjahr, Publikationsdatum und positive Empfehlung von der direkt verlinkten Fundstelle getragen werden.",
  "Genres, Ton und Themen sind kurze neutrale Eigenschaften aus der Fundstelle; erfinde keine externe ID und kein Nutzerurteil.",
  "externalIds enthaelt nur direkt belegte imdb-, tmdb- oder watchmode-IDs als Strings; sonst bleibt das Objekt leer.",
  "Gib niemals Rezensionstext, Zitat, Zusammenfassung, Bild, Logo, Autor oder redaktionelle Ueberschrift aus.",
  "Antworte im letzten Textblock ausschliesslich als JSON-Objekt mit dem Schluessel items.",
  "Jedes Item enthaelt exakt title, mediaType (film oder series), releaseYear, externalIds, attributes mit genres/tones/themes und evidence.",
  "evidence enthaelt exakt url, publishedOn im Format YYYY-MM-DD und positiveRecommendation mit dem booleschen Wert true.",
].join(" ");

export function buildAnthropicEntdeckenDailyBody(setupInput, queryContextInput) {
  const setup = validateEntdeckenDailyProviderSetup(setupInput);
  const queryContext = validateEntdeckenWeeklyQueryContext(queryContextInput);
  if (!queryContext) throw new EntdeckenDailyProviderError("provider-query-context-invalid");
  const globalInput = Object.freeze({
    queryContext,
    region: "AT",
    language: "de",
    maxItems: ENTDECKEN_DAILY_MAX_ITEMS,
  });
  return Object.freeze({
    model: setup.model,
    max_tokens: setup.maxTokens,
    system: SYSTEM_PROMPT,
    messages: Object.freeze([Object.freeze({ role: "user", content: JSON.stringify(globalInput) })]),
    tools: Object.freeze([Object.freeze({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 1,
      allowed_domains: setup.allowedDomains,
      allowed_callers: Object.freeze(["direct"]),
    })]),
  });
}

export function estimateEntdeckenDailyReservation(body, setupInput) {
  const setup = validateEntdeckenDailyProviderSetup(setupInput);
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
  const conservativeInputTokens = bytes + 4096;
  const cost = costFromUsage(setup, conservativeInputTokens, setup.maxTokens, 1);
  if (!finitePositive(cost) || cost > setup.taskCapUsdCent) throw new EntdeckenDailyProviderError("provider-cost-invalid");
  return cost;
}

function providerUsage(value) {
  const usage = value?.usage;
  const websearch = usage?.server_tool_use?.web_search_requests;
  if (!plain(usage) || !Number.isInteger(usage.input_tokens) || usage.input_tokens < 0
      || !Number.isInteger(usage.output_tokens) || usage.output_tokens < 0
      || !Number.isInteger(websearch) || websearch < 0) return null;
  return Object.freeze({
    model: typeof value?.model === "string" && MODEL_FORM.test(value.model) ? value.model : null,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    searchRequests: websearch,
  });
}
function responseTextBlock(content) {
  const blocks = content.filter((block) => block?.type === "text" && text(block.text));
  if (!blocks.length) throw new EntdeckenDailyProviderError("provider-output-invalid");
  return blocks[blocks.length - 1];
}
function parseProviderJson(block) {
  let value;
  try { value = JSON.parse(block.text); } catch { throw new EntdeckenDailyProviderError("provider-output-invalid"); }
  if (!plain(value) || Object.keys(value).length !== 1 || !Array.isArray(value.items)
      || value.items.length < 1 || value.items.length > ENTDECKEN_DAILY_MAX_ITEMS) {
    throw new EntdeckenDailyProviderError("provider-output-invalid");
  }
  return value;
}
function evidenceUrls(value) {
  const urls = [];
  for (const item of value.items) {
    if (!plain(item) || !plain(item.evidence) || typeof item.evidence.url !== "string") {
      throw new EntdeckenDailyProviderError("provider-output-invalid");
    }
    urls.push(item.evidence.url);
  }
  return urls;
}

export function parseAnthropicEntdeckenDailyResponse(value, setupInput, checkedAt, queryContextInput) {
  const setup = validateEntdeckenDailyProviderSetup(setupInput);
  const queryContext = validateEntdeckenWeeklyQueryContext(queryContextInput);
  if (!queryContext) throw new EntdeckenDailyProviderError("provider-query-context-invalid");
  const usage = providerUsage(value);
  if (!usage || usage.searchRequests !== 1) throw new EntdeckenDailyProviderError("provider-usage-invalid", usage);
  if (value?.stop_reason === "pause_turn") throw new EntdeckenDailyProviderError("provider-stop-reason-invalid", usage);
  if (value?.stop_reason !== "end_turn" || !Array.isArray(value?.content)) {
    throw new EntdeckenDailyProviderError("provider-stop-reason-invalid", usage);
  }
  const uses = value.content.filter((block) => block?.type === "server_tool_use" && block?.name === "web_search");
  const results = value.content.filter((block) => block?.type === "web_search_tool_result");
  if (uses.length !== 1 || results.length !== 1 || results[0].tool_use_id !== uses[0].id) {
    throw new EntdeckenDailyProviderError("provider-tool-shape-invalid", usage);
  }
  if (plain(results[0].content) && results[0].content.type === "web_search_tool_result_error") {
    throw new EntdeckenDailyProviderError("provider-tool-error", usage);
  }
  if (!Array.isArray(results[0].content) || results[0].content.length < 1
      || results[0].content.length > ENTDECKEN_DAILY_MAX_SEARCH_RESULTS) {
    throw new EntdeckenDailyProviderError("provider-result-count-invalid", usage);
  }
  const resultUrls = new Set();
  for (const item of results[0].content) {
    const parsed = item?.type === "web_search_result" ? directUrl(item.url) : null;
    if (!parsed || !hostAllowed(parsed.hostname.toLowerCase(), setup.allowedDomains)) {
      throw new EntdeckenDailyProviderError("provider-domain-invalid", usage);
    }
    resultUrls.add(item.url);
  }
  const citationUrls = new Set();
  for (const block of value.content.filter((item) => item?.type === "text")) {
    if (block.citations === undefined) continue;
    if (!Array.isArray(block.citations)) throw new EntdeckenDailyProviderError("provider-citation-invalid", usage);
    for (const citation of block.citations) {
      const parsed = citation?.type === "web_search_result_location" ? directUrl(citation.url) : null;
      if (!parsed || !resultUrls.has(citation.url)
          || !hostAllowed(parsed.hostname.toLowerCase(), setup.allowedDomains)) {
        throw new EntdeckenDailyProviderError("provider-citation-invalid", usage);
      }
      citationUrls.add(citation.url);
    }
  }
  const parsed = parseProviderJson(responseTextBlock(value.content));
  for (const url of evidenceUrls(parsed)) {
    if (!resultUrls.has(url) || !citationUrls.has(url)) {
      throw new EntdeckenDailyProviderError("provider-citation-invalid", usage);
    }
  }
  return Object.freeze({
    envelope: Object.freeze({
      searchResultCount: results[0].content.length,
      queryContext,
      response: Object.freeze({ checkedAt, items: parsed.items }),
    }),
    usage,
  });
}

async function responseJson(response) {
  let raw;
  try { raw = await response.text(); } catch { throw new EntdeckenDailyProviderError("provider-body-invalid"); }
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > ENTDECKEN_DAILY_RESPONSE_MAX_BYTES) {
    throw new EntdeckenDailyProviderError("provider-response-too-large");
  }
  try { return raw ? JSON.parse(raw) : null; } catch { throw new EntdeckenDailyProviderError("provider-body-invalid"); }
}

export function createAnthropicEntdeckenDailyAdapter({
  apiKey = "",
  loadSetup = null,
  reserveCost = null,
  settleCost = null,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  operationId = () => crypto.randomUUID(),
} = {}) {
  let used = false;
  const telemetry = { providerRequests: 0, searchRequests: 0, resultCount: 0, costUsdCent: null };
  async function search(queryContextInput) {
    if (used) throw new EntdeckenDailyProviderError("already-used");
    used = true;
    if (typeof apiKey !== "string" || !apiKey || typeof loadSetup !== "function"
        || typeof reserveCost !== "function" || typeof settleCost !== "function"
        || typeof fetchImpl !== "function") setupError();
    const setup = validateEntdeckenDailyProviderSetup(await loadSetup());
    const queryContext = validateEntdeckenWeeklyQueryContext(queryContextInput);
    if (!queryContext) throw new EntdeckenDailyProviderError("provider-query-context-invalid");
    const body = buildAnthropicEntdeckenDailyBody(setup, queryContext);
    const reservationUsdCent = estimateEntdeckenDailyReservation(body, setup);
    const reservation = await reserveCost({
      operationId: operationId(), reservationUsdCent, searchRequests: 1,
    });
    const logId = Number(reservation?.logId);
    if (reservation?.ok !== true) throw new EntdeckenDailyProviderError("cost-gate-rejected");
    if (!Number.isInteger(logId) || logId <= 0) throw new EntdeckenDailyProviderError("cost-log-invalid");

    let usage = null;
    let costUsdCent = null;
    let settled = false;
    const settle = async (status, code = null) => {
      if (settled) throw new EntdeckenDailyProviderError("cost-settlement-failed");
      settled = true;
      try {
        await settleCost({
          logId, status, model: usage?.model ?? setup.model,
          inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
          costUsdCent, errorClass: code,
        });
      } catch { throw new EntdeckenDailyProviderError("cost-settlement-failed"); }
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), setup.timeoutMs);
    try {
      telemetry.providerRequests = 1;
      let response;
      try {
        response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        throw new EntdeckenDailyProviderError(error?.name === "AbortError" ? "provider-timeout" : "http-error");
      }
      const providerBody = await responseJson(response);
      usage = providerUsage(providerBody);
      if (!response?.ok) throw new EntdeckenDailyProviderError("http-error", usage);
      const parsed = parseAnthropicEntdeckenDailyResponse(providerBody, setup, now(), queryContext);
      usage = parsed.usage;
      costUsdCent = costFromUsage(setup, usage.inputTokens, usage.outputTokens, usage.searchRequests);
      if (!finitePositive(costUsdCent) || costUsdCent > setup.taskCapUsdCent
          || costUsdCent > setup.globalRequestCapUsdCent) {
        throw new EntdeckenDailyProviderError("provider-cost-invalid", usage);
      }
      await settle("fertig");
      telemetry.searchRequests = usage.searchRequests;
      telemetry.resultCount = parsed.envelope.searchResultCount;
      telemetry.costUsdCent = costUsdCent;
      return parsed.envelope;
    } catch (error) {
      const safe = error instanceof EntdeckenDailyProviderError
        ? error : new EntdeckenDailyProviderError("provider-body-invalid");
      usage = usage ?? safe.usage;
      if (usage && costUsdCent === null) {
        costUsdCent = costFromUsage(setup, usage.inputTokens, usage.outputTokens, usage.searchRequests);
      }
      if (!settled) await settle("fehler", safe.code);
      telemetry.searchRequests = usage?.searchRequests ?? 0;
      telemetry.costUsdCent = costUsdCent;
      throw safe;
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ search, telemetry: () => Object.freeze({ ...telemetry }) });
}
