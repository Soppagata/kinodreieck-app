import {
  ENTDECKEN_DAILY_MAX_ITEMS,
  ENTDECKEN_DAILY_MAX_SEARCH_RESULTS,
  ENTDECKEN_WEEKLY_DEGRADED_NOTICE,
  ENTDECKEN_WEEKLY_PARTIAL_NOTICE,
  validateEntdeckenWeeklyQueryContext,
  validateEntdeckenSourceRegistry,
} from "./contract.js";
import {
  parseProviderLooseJsonText,
  ProviderTextSafetyError,
} from "../_shared/providerText.js";
import { createProviderReceipt } from "../_shared/providerReceipt.js";

export const ENTDECKEN_DAILY_PROVIDER_TASK = "entdecken-daily";
export const ENTDECKEN_DAILY_PROVIDER_VERSION = "anthropic-web-search-20250305";
export const ENTDECKEN_DAILY_PROMPT_VERSION = "entdecken-weekly-v1";
export const ENTDECKEN_DAILY_MAX_TOKENS = 2800;
export const ENTDECKEN_DAILY_TASK_CAP_USD_CENT = 5;
export const ENTDECKEN_DAILY_SEARCH_FEE_USD_CENT = 1;
export const ENTDECKEN_DAILY_TIMEOUT_MAX_MS = 135_000;
export const ENTDECKEN_DAILY_RESPONSE_MAX_BYTES = 512_000;
export const ENTDECKEN_DAILY_MAX_SEARCH_USES = 2;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL_FORM = /^claude-haiku-4-5(?:-[0-9]{8})?$/;
const MODEL_PRICE_FLOOR = Object.freeze({ input: 100, output: 500 });
const SAFE_ERROR_CODES = new Set([
  "already-used", "cost-gate-rejected", "cost-log-invalid", "cost-settlement-failed",
  "http-error", "provider-body-invalid", "provider-response-too-large", "provider-timeout",
  "provider-tool-error", "provider-tool-shape-invalid", "provider-usage-invalid",
  "provider-stop-reason-invalid", "provider-output-invalid", "provider-result-count-invalid",
  "provider-receipt-invalid",
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
  "Suche nach aktuellen, allgemein positiv bewerteten Film- und Serien-Charts oder redaktionellen Tipps fuer das im Nutzerobjekt genannte ISO-Jahr und die Kalenderwoche.",
  "Nutze innerhalb dieses einen Requests hoechstens zwei kleine Websuchen und nur die serverseitig erlaubten Quellen.",
  "Bevorzuge Oesterreich-Bezug; liefere bis zu zwoelf unterschiedliche, aktuell relevante Kandidaten in absteigender Empfehlungsstaerke, aber nur wenn sie sicher belegt sind.",
  "Der Server verwirft unzureichend belegte Kandidaten und zeigt danach hoechstens sieben Titel; erfinde nie Fuellmaterial.",
  "Nenne nur Werke, deren Titel, Werktyp, Veroeffentlichungsjahr, Publikationsdatum und positive Empfehlung von der direkt verlinkten Fundstelle getragen werden.",
  "Genres, Ton und Themen sind kurze neutrale Eigenschaften aus der Fundstelle; erfinde keine externe ID und kein Nutzerurteil.",
  "externalIds enthaelt nur direkt belegte imdb-, tmdb- oder watchmode-IDs als Strings; sonst bleibt das Objekt leer.",
  "Gib niemals Rezensionstext, Zitat, Zusammenfassung, Bild, Logo, Autor oder redaktionelle Ueberschrift aus.",
  "Antworte ausschliesslich mit einem einzigen JSON-Objekt mit dem Schluessel items; kein Vorspann, kein Markdown und kein Nachsatz.",
  "Wenn die sichere Quellenlage es erlaubt, liefere mindestens fuenf belegte Titel; andernfalls liefere weniger statt Fuellmaterial oder erfundener Daten.",
  "Jedes Item enthaelt exakt title, mediaType (film oder series), releaseYear, externalIds, attributes mit genres/tones/themes und evidence.",
  "evidence enthaelt exakt url, publishedOn im Format YYYY-MM-DD und positiveRecommendation mit dem booleschen Wert true; evidence.url ist unveraendert exakt eine URL aus den Websearch-Ergebnissen.",
  "Nutze die automatischen Websearch-Zitate auch in der strukturierten JSON-Antwort; jeder evidence.url-Wert muss von einer solchen Websearch-Zitation getragen sein.",
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
      max_uses: ENTDECKEN_DAILY_MAX_SEARCH_USES,
      allowed_domains: setup.allowedDomains,
      allowed_callers: Object.freeze(["direct"]),
      user_location: Object.freeze({
        type: "approximate",
        country: "AT",
        timezone: "Europe/Vienna",
      }),
    })]),
  });
}

export function estimateEntdeckenDailyReservation(body, setupInput) {
  const setup = validateEntdeckenDailyProviderSetup(setupInput);
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
  const conservativeInputTokens = bytes + 4096;
  const cost = costFromUsage(
    setup, conservativeInputTokens, setup.maxTokens, ENTDECKEN_DAILY_MAX_SEARCH_USES,
  );
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
const PROVIDER_WARNING_MAX = 8;
const PROVIDER_ITEM_FIELDS = new Set([
  "title", "mediaType", "releaseYear", "externalIds", "attributes", "evidence",
]);

function addWarning(warnings, code) {
  if (warnings.size < PROVIDER_WARNING_MAX) warnings.add(code);
}
function safeWarnings(warnings) {
  return Object.freeze([...warnings].slice(0, PROVIDER_WARNING_MAX));
}
function parseProviderText(content, warnings) {
  if (content.some((block) => ["thinking", "redacted_thinking"].includes(block?.type))) {
    throw new EntdeckenDailyProviderError("provider-output-invalid");
  }
  const textBlocks = [];
  try {
    for (const block of content.filter((entry) => entry?.type === "text")) {
      if (block.text === undefined || block.text === null || block.text === "") continue;
      if (typeof block.text !== "string") throw new ProviderTextSafetyError();
      if (text(block.text)) textBlocks.push(block.text);
    }
    if (!textBlocks.length) {
      addWarning(warnings, "provider-text-missing");
      return Object.freeze({ mode: "degraded", value: null, consumedText: null });
    }
    if (textBlocks.length > 1) addWarning(warnings, "multiple-text-blocks-normalized");
    const consumedText = textBlocks.join("");
    const parsed = parseProviderLooseJsonText(consumedText);
    for (const warning of parsed.warnings) addWarning(warnings, warning);
    return Object.freeze({ ...parsed, consumedText });
  } catch (error) {
    if (error instanceof ProviderTextSafetyError) {
      throw new EntdeckenDailyProviderError("provider-output-invalid");
    }
    throw error;
  }
}
function normalizedTextList(value, warnings) {
  if (value === undefined) {
    addWarning(warnings, "optional-fields-filled");
    return [];
  }
  if (!Array.isArray(value)) {
    addWarning(warnings, "attribute-list-dropped");
    return [];
  }
  const normalized = [];
  const keys = new Set();
  for (const entry of value) {
    const clean = typeof entry === "string" ? text(entry) : "";
    const key = clean.toLocaleLowerCase("de-AT");
    if (!clean || clean !== entry || clean.length > 80 || keys.has(key)) {
      addWarning(warnings, "attribute-item-dropped");
      continue;
    }
    keys.add(key);
    if (normalized.length < 8) normalized.push(clean);
    else addWarning(warnings, "attribute-list-truncated");
  }
  return normalized;
}
function normalizedExternalIds(value, warnings) {
  if (value === undefined) {
    addWarning(warnings, "optional-fields-filled");
    return {};
  }
  if (!plain(value)) {
    addWarning(warnings, "external-ids-dropped");
    return {};
  }
  const normalized = {};
  for (const [namespace, raw] of Object.entries(value)) {
    const id = text(raw);
    if (namespace === "imdb" && /^tt\d{5,12}$/i.test(id)) normalized.imdb = id.toLowerCase();
    else if (["tmdb", "watchmode"].includes(namespace) && /^[1-9]\d{0,14}$/.test(id)) {
      normalized[namespace] = id;
    } else addWarning(warnings, "external-id-dropped");
  }
  return normalized;
}
function normalizeProviderItem(value, resultUrls, citationUrls, warnings) {
  if (!plain(value)) {
    addWarning(warnings, "item-dropped");
    return null;
  }
  if (Object.keys(value).some((key) => !PROVIDER_ITEM_FIELDS.has(key))) {
    addWarning(warnings, "extra-fields-ignored");
  }
  if (typeof value.title !== "string" || !value.title || text(value.title) !== value.title
      || value.title.length > 200 || !["film", "series"].includes(value.mediaType)
      || !Number.isInteger(value.releaseYear) || value.releaseYear < 1888
      || value.releaseYear > new Date().getUTCFullYear() + 10) {
    addWarning(warnings, "item-dropped");
    return null;
  }
  if (!plain(value.evidence)) {
    addWarning(warnings, "item-dropped");
    return null;
  }
  if (Object.keys(value.evidence).some((key) => ![
    "url", "publishedOn", "positiveRecommendation",
  ].includes(key))) addWarning(warnings, "extra-fields-ignored");
  const evidenceUrl = directUrl(value.evidence.url);
  if (!evidenceUrl || !resultUrls.has(value.evidence.url) || !citationUrls.has(value.evidence.url)
      || typeof value.evidence.publishedOn !== "string"
      || value.evidence.positiveRecommendation !== true) {
    addWarning(warnings, "item-dropped");
    return null;
  }
  const rawAttributes = plain(value.attributes) ? value.attributes : {};
  if (!plain(value.attributes)) addWarning(warnings, "optional-fields-filled");
  if (Object.keys(rawAttributes).some((key) => !["genres", "tones", "themes"].includes(key))) {
    addWarning(warnings, "extra-fields-ignored");
  }
  return Object.freeze({
    title: value.title,
    mediaType: value.mediaType,
    releaseYear: value.releaseYear,
    externalIds: Object.freeze(normalizedExternalIds(value.externalIds, warnings)),
    attributes: Object.freeze({
      genres: Object.freeze(normalizedTextList(rawAttributes.genres, warnings)),
      tones: Object.freeze(normalizedTextList(rawAttributes.tones, warnings)),
      themes: Object.freeze(normalizedTextList(rawAttributes.themes, warnings)),
    }),
    evidence: Object.freeze({
      url: value.evidence.url,
      publishedOn: value.evidence.publishedOn,
      positiveRecommendation: true,
    }),
  });
}
function normalizeProviderJson(parsedText, resultUrls, citationUrls, warnings) {
  if (!plain(parsedText.value)) return [];
  if (Object.keys(parsedText.value).some((key) => key !== "items")) {
    addWarning(warnings, "extra-fields-ignored");
  }
  if (!Array.isArray(parsedText.value.items)) {
    addWarning(warnings, "item-list-missing");
    return [];
  }
  if (parsedText.value.items.length > ENTDECKEN_DAILY_MAX_ITEMS) {
    addWarning(warnings, "item-list-truncated");
  }
  return parsedText.value.items.slice(0, ENTDECKEN_DAILY_MAX_ITEMS)
    .map((item) => normalizeProviderItem(item, resultUrls, citationUrls, warnings))
    .filter(Boolean);
}
function responsePresentation(parsedText, warnings, itemCount) {
  const allWarnings = safeWarnings(warnings);
  const responseMode = parsedText.mode === "degraded" || itemCount === 0
    ? "degraded" : parsedText.mode === "partial" || allWarnings.length ? "partial" : "structured";
  return Object.freeze({
    responseMode,
    displayText: responseMode === "degraded" ? ENTDECKEN_WEEKLY_DEGRADED_NOTICE
      : responseMode === "partial" ? ENTDECKEN_WEEKLY_PARTIAL_NOTICE : null,
    warnings: allWarnings,
  });
}

export function parseAnthropicEntdeckenDailyResponse(value, setupInput, checkedAt, queryContextInput) {
  const setup = validateEntdeckenDailyProviderSetup(setupInput);
  const queryContext = validateEntdeckenWeeklyQueryContext(queryContextInput);
  if (!queryContext) throw new EntdeckenDailyProviderError("provider-query-context-invalid");
  const usage = providerUsage(value);
  if (!usage || usage.searchRequests < 1
      || usage.searchRequests > ENTDECKEN_DAILY_MAX_SEARCH_USES) {
    throw new EntdeckenDailyProviderError("provider-usage-invalid", usage);
  }
  if (!Array.isArray(value?.content)) {
    throw new EntdeckenDailyProviderError("provider-stop-reason-invalid", usage);
  }
  const warnings = new Set();
  if (value?.stop_reason !== "end_turn") addWarning(warnings, "stop-reason-normalized");
  const uses = value.content.filter((block) => block?.type === "server_tool_use" && block?.name === "web_search");
  const results = value.content.filter((block) => block?.type === "web_search_tool_result");
  if (uses.length !== usage.searchRequests || results.length !== usage.searchRequests) {
    addWarning(warnings, "tool-blocks-normalized");
  }
  const useIds = new Set(uses.slice(0, ENTDECKEN_DAILY_MAX_SEARCH_USES)
    .map((entry) => entry.id).filter((entry) => typeof entry === "string" && entry));
  const resultUrls = new Set();
  for (const result of results) {
    if (plain(result.content) && result.content.type === "web_search_tool_result_error") {
      addWarning(warnings, "search-result-dropped");
      continue;
    }
    if (!Array.isArray(result.content) || !useIds.has(result.tool_use_id)) {
      addWarning(warnings, "tool-blocks-normalized");
      continue;
    }
    for (const item of result.content) {
      const parsed = item?.type === "web_search_result" ? directUrl(item.url) : null;
      if (!parsed || !hostAllowed(parsed.hostname.toLowerCase(), setup.allowedDomains)) {
        addWarning(warnings, "search-result-dropped");
        continue;
      }
      if (resultUrls.size < ENTDECKEN_DAILY_MAX_SEARCH_RESULTS) resultUrls.add(item.url);
      else addWarning(warnings, "search-results-truncated");
    }
  }
  const citationUrls = new Set();
  for (const block of value.content.filter((item) => item?.type === "text")) {
    if (block.citations === undefined) continue;
    if (!Array.isArray(block.citations)) {
      addWarning(warnings, "citation-dropped");
      continue;
    }
    for (const citation of block.citations) {
      const parsed = citation?.type === "web_search_result_location" ? directUrl(citation.url) : null;
      if (!parsed || !resultUrls.has(citation.url)
          || !hostAllowed(parsed.hostname.toLowerCase(), setup.allowedDomains)) {
        addWarning(warnings, "citation-dropped");
        continue;
      }
      citationUrls.add(citation.url);
    }
  }
  const parsedText = parseProviderText(value.content, warnings);
  const items = normalizeProviderJson(parsedText, resultUrls, citationUrls, warnings);
  const presentation = responsePresentation(parsedText, warnings, items.length);
  return Object.freeze({
    envelope: Object.freeze({
      searchResultCount: resultUrls.size,
      queryContext,
      ...presentation,
      response: Object.freeze({ checkedAt, items: Object.freeze(items) }),
    }),
    usage,
    consumedProviderText: parsedText.consumedText,
  });
}

function settledCostReadback(value, {
  logId, operationId, usage, costUsdCent,
}) {
  const operationForm = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!plain(value)
      || Object.keys(value).sort().join(",") !== [
        "costUsdCent", "inputTokens", "logId", "model", "operationId",
        "outputTokens", "status", "task",
      ].sort().join(",")
      || value.logId !== logId
      || value.operationId !== operationId || !operationForm.test(value.operationId)
      || value.task !== ENTDECKEN_DAILY_PROVIDER_TASK || value.status !== "fertig"
      || value.model !== usage.model
      || value.inputTokens !== usage.inputTokens
      || value.outputTokens !== usage.outputTokens
      || value.costUsdCent !== costUsdCent || !finitePositive(value.costUsdCent)) return null;
  return Object.freeze({ ...value });
}

async function responseJson(response, onRawResponse = () => {}) {
  let raw;
  try { raw = await response.text(); } catch { throw new EntdeckenDailyProviderError("provider-body-invalid"); }
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > ENTDECKEN_DAILY_RESPONSE_MAX_BYTES) {
    throw new EntdeckenDailyProviderError("provider-response-too-large");
  }
  onRawResponse(raw);
  try { return raw ? JSON.parse(raw) : null; } catch { throw new EntdeckenDailyProviderError("provider-body-invalid"); }
}

/**
 * @param {{
 *   apiKey?: string,
 *   loadSetup?: (() => Promise<unknown>) | null,
 *   reserveCost?: ((input: {operationId: string, reservationUsdCent: number, providerRequests: number}) => Promise<{ok?: boolean, logId?: unknown}>) | null,
 *   settleCost?: ((input: Record<string, unknown>) => Promise<void>) | null,
 *   readSettledCost?: ((input: {logId: number, operationId: string}) => Promise<unknown>) | null,
 *   fetchImpl?: typeof fetch,
 *   now?: () => string,
 *   operationId?: () => string
 * }} [options]
 */
export function createAnthropicEntdeckenDailyAdapter({
  apiKey = "",
  loadSetup = null,
  reserveCost = null,
  settleCost = null,
  readSettledCost = null,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  operationId = () => crypto.randomUUID(),
} = {}) {
  let used = false;
  let providerRawResponse = null;
  const telemetry = { providerRequests: 0, searchRequests: 0, resultCount: 0, costUsdCent: null };
  async function search(queryContextInput) {
    if (used) throw new EntdeckenDailyProviderError("already-used");
    used = true;
    if (typeof apiKey !== "string" || !apiKey || typeof loadSetup !== "function"
        || typeof reserveCost !== "function" || typeof settleCost !== "function"
        || typeof readSettledCost !== "function"
        || typeof fetchImpl !== "function") setupError();
    const setup = validateEntdeckenDailyProviderSetup(await loadSetup());
    const queryContext = validateEntdeckenWeeklyQueryContext(queryContextInput);
    if (!queryContext) throw new EntdeckenDailyProviderError("provider-query-context-invalid");
    const body = buildAnthropicEntdeckenDailyBody(setup, queryContext);
    const reservationUsdCent = estimateEntdeckenDailyReservation(body, setup);
    const requestOperationId = operationId();
    const reservation = await reserveCost({
      operationId: requestOperationId, reservationUsdCent, providerRequests: 1,
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
      const providerBody = await responseJson(response, (raw) => {
        providerRawResponse = raw;
      });
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
      let persistedCost = null;
      try {
        persistedCost = settledCostReadback(
          await readSettledCost({ logId, operationId: requestOperationId }),
          { logId, operationId: requestOperationId, usage, costUsdCent },
        );
      } catch { /* Der Serverlog ist der einzige gueltige Kostenbeleg. */ }
      if (!persistedCost || typeof parsed.consumedProviderText !== "string"
          || !parsed.consumedProviderText) {
        throw new EntdeckenDailyProviderError("provider-receipt-invalid", usage);
      }
      let providerReceipt = null;
      try {
        providerReceipt = await createProviderReceipt({
          provider: "anthropic",
          providerResponseText: parsed.consumedProviderText,
          model: persistedCost.model,
          inputTokens: persistedCost.inputTokens,
          outputTokens: persistedCost.outputTokens,
          webSearchRequests: usage.searchRequests,
          resultMode: parsed.envelope.responseMode,
          serverLogId: persistedCost.logId,
          providerRequests: 1,
          reservationUsdCent,
          costUsdCent: persistedCost.costUsdCent,
        });
      } catch { /* Der Hash ist Teil des fail-closed Produktvertrags. */ }
      if (!providerReceipt) {
        throw new EntdeckenDailyProviderError("provider-receipt-invalid", usage);
      }
      telemetry.searchRequests = usage.searchRequests;
      telemetry.resultCount = parsed.envelope.searchResultCount;
      telemetry.costUsdCent = costUsdCent;
      return Object.freeze({ ...parsed.envelope, providerReceipt });
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
  return Object.freeze({
    search,
    telemetry: () => Object.freeze({ ...telemetry }),
    takeProviderRawResponse: () => {
      const raw = providerRawResponse;
      providerRawResponse = null;
      return raw;
    },
  });
}
