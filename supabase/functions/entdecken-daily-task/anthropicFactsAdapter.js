/* Faktenadapter auf dem bereits belegten Anthropic-Messages-/Websearch-
   Envelope. Fremde Feldnamen entsprechen exakt dem bestehenden
   anthropicAdapter.js: content, server_tool_use, web_search_tool_result,
   text.citations und usage.server_tool_use.web_search_requests. */

import {
  ENTDECKEN_FACTS_CONTRACT_VERSION,
  ENTDECKEN_FACTS_MAX_SEARCH_USES_PER_ITEM,
  ENTDECKEN_FACTS_PROMPT_VERSION,
  validateEntdeckenFactsBatchOutput,
} from "../_shared/entdeckenFacts.js";
import {
  parseProviderLooseJsonText,
  ProviderTextSafetyError,
} from "../_shared/providerText.js";
import {
  createEntdeckenProviderFetchFailure,
  createEntdeckenProviderHttpFailure,
  normalizeEntdeckenProviderFailure,
} from "./providerFailureContract.js";

export const ENTDECKEN_FACTS_CONFIG_TASK = "entdecken-daily";
export const ENTDECKEN_FACTS_PROVIDER_TASK = "entdecken-facts-once";
export const ENTDECKEN_FACTS_MAX_TOKENS = 2800;
export const ENTDECKEN_FACTS_REQUEST_CAP_USD_CENT = 500;
export const ENTDECKEN_FACTS_SEARCH_FEE_USD_CENT = 1;
export const ENTDECKEN_FACTS_TIMEOUT_MAX_MS = 135_000;
export const ENTDECKEN_FACTS_RESPONSE_MAX_BYTES = 512_000;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL_FORM = /^claude-haiku-4-5(?:-[0-9]{8})?$/;
const MODEL_PRICE_FLOOR = Object.freeze({ input: 100, output: 500 });
const SAFE_ERROR_CODES = new Set([
  "already-used", "batch-invalid", "cost-gate-rejected", "cost-settlement-failed",
  "http-error", "provider-body-invalid", "provider-cost-invalid",
  "provider-envelope-invalid", "provider-output-invalid", "provider-receipt-invalid",
  "provider-timeout", "provider-tool-shape-invalid", "setup-invalid",
]);

function plain(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function finitePositive(value) { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function directUrl(value) {
  if (typeof value !== "string" || value !== value.trim() || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      && !parsed.port && !parsed.hash ? parsed.href : null;
  } catch { return null; }
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

export class EntdeckenFactsProviderError extends Error {
  constructor(code, usage = null, providerFailure = null) {
    const safe = SAFE_ERROR_CODES.has(code) ? code : "provider-body-invalid";
    super(safe);
    this.name = "EntdeckenFactsProviderError";
    this.code = safe;
    this.usage = usage;
    this.providerFailure = normalizeEntdeckenProviderFailure(providerFailure);
  }
}

function setupError() { throw new EntdeckenFactsProviderError("setup-invalid"); }

export function validateEntdeckenFactsProviderSetup(value) {
  if (!plain(value) || value.providerAllowed !== true || value.modelAlias !== "klein"
      || !MODEL_FORM.test(value.model) || value.maxTokens !== ENTDECKEN_FACTS_MAX_TOKENS
      || value.taskCapUsdCent !== ENTDECKEN_FACTS_REQUEST_CAP_USD_CENT
      || value.searchFeeUsdCent !== ENTDECKEN_FACTS_SEARCH_FEE_USD_CENT
      || !finitePositive(value.globalRequestCapUsdCent) || value.globalRequestCapUsdCent > 500
      || value.taskCapUsdCent > value.globalRequestCapUsdCent
      || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1
      || value.timeoutMs > ENTDECKEN_FACTS_TIMEOUT_MAX_MS
      || !finitePositive(value.inputPriceUsdCentPerMtok)
      || value.inputPriceUsdCentPerMtok < MODEL_PRICE_FLOOR.input
      || !finitePositive(value.outputPriceUsdCentPerMtok)
      || value.outputPriceUsdCentPerMtok < MODEL_PRICE_FLOOR.output) setupError();
  return Object.freeze({ ...value });
}

const SYSTEM_PROMPT = [
  "Du loest ausschliesslich die Identitaet oeffentlich gelisteter Filme und Serien auf und extrahierst neutrale Fakten.",
  "Du bewertest niemals Geschmack, Qualitaet, Relevanz oder Passung und erzeugst keinen Score.",
  "Fuehre pro Item hoechstens eine gezielte Websuche aus; vermische keine Identitaeten.",
  "Antworte ausschliesslich mit einem JSON-Objekt mit schemaVersion und items, ohne Markdown oder Freitext.",
  `schemaVersion ist exakt ${ENTDECKEN_FACTS_CONTRACT_VERSION}.`,
  "Jedes Item enthaelt exakt poolId, status, identity, facts und evidenceUrls.",
  "status ist resolved, ambiguous oder unresolved. Bei ambiguous/unresolved sind identity und facts null.",
  "resolved ist nur erlaubt, wenn Titel, Jahr und Typ exakt bestaetigt und eine starke ID direkt belegt sind.",
  "identity enthaelt exakt strongId, confirmedTitle, releaseYear und mediaType.",
  "strongId ist imdb:tt..., tmdb:<Zahl> oder wikidata:Q...; niemals raten.",
  "facts enthaelt exakt genres, tags, franchise und persons.",
  "Genres duerfen nur sein: drama, komoedie, romantik, abenteuer, thriller, familie, doku, action, scifi, animation, krimi, fantasy, musikfilm, horror, satire.",
  "Tags duerfen nur sein: kult, trash, bis_1979, 1980_1999, 2000_2019, ab_2020.",
  "franchise ist null oder exakt id und name; persons enthalten exakt id, name und roles mit actor, director, creator oder writer.",
  "Franchise- und Personen-ID muessen ebenfalls imdb:, tmdb: oder wikidata: entsprechen und direkt belegt sein.",
  "evidenceUrls enthaelt nur unveraenderte HTTPS-URLs aus den Websearch-Ergebnissen, die auch als automatische Websearch-Zitationen an der JSON-Antwort stehen.",
  "Wenn Identitaet oder Fakten nicht sicher sind, liefere ambiguous oder unresolved statt Vermutung.",
].join(" ");

export function buildAnthropicEntdeckenFactsBody(setupInput, items) {
  const setup = validateEntdeckenFactsProviderSetup(setupInput);
  if (!Array.isArray(items) || items.length < 1 || items.length > 9) {
    throw new EntdeckenFactsProviderError("batch-invalid");
  }
  const input = items.map((item) => ({
    poolId: item.poolId,
    title: item.title,
    releaseYear: item.releaseYear,
    mediaType: item.mediaType,
    provider: item.provider,
    chartSource: {
      sourceId: item.sourceId,
      url: item.sourceUrl,
      stand: item.sourceStand,
    },
  }));
  return Object.freeze({
    model: setup.model,
    max_tokens: setup.maxTokens,
    system: SYSTEM_PROMPT,
    messages: Object.freeze([Object.freeze({ role: "user", content: JSON.stringify({ items: input }) })]),
    tools: Object.freeze([Object.freeze({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: items.length * ENTDECKEN_FACTS_MAX_SEARCH_USES_PER_ITEM,
      allowed_callers: Object.freeze(["direct"]),
    })]),
  });
}

export function estimateEntdeckenFactsReservation(body, setupInput) {
  const setup = validateEntdeckenFactsProviderSetup(setupInput);
  const conservativeInputTokens = new TextEncoder().encode(JSON.stringify(body)).length + 4096;
  const cost = costFromUsage(
    setup,
    conservativeInputTokens,
    setup.maxTokens,
    body.tools[0].max_uses,
  );
  if (!finitePositive(cost) || cost > setup.taskCapUsdCent) {
    throw new EntdeckenFactsProviderError("provider-cost-invalid");
  }
  return cost;
}

function providerUsage(value, maxSearchUses) {
  const usage = value?.usage;
  const websearch = usage?.server_tool_use?.web_search_requests;
  if (!plain(usage) || !Number.isInteger(usage.input_tokens) || usage.input_tokens < 0
      || !Number.isInteger(usage.output_tokens) || usage.output_tokens < 0
      || !Number.isInteger(websearch) || websearch < 0 || websearch > maxSearchUses
      || typeof value?.model !== "string" || !MODEL_FORM.test(value.model)) return null;
  return Object.freeze({
    model: value.model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    searchRequests: websearch,
  });
}

export function parseAnthropicEntdeckenFactsResponse(value, requestedItems, checkedAt) {
  const maxSearchUses = requestedItems.length * ENTDECKEN_FACTS_MAX_SEARCH_USES_PER_ITEM;
  const usage = providerUsage(value, maxSearchUses);
  if (!usage || value?.stop_reason !== "end_turn" || !Array.isArray(value?.content)
      || value.content.some((block) => ["thinking", "redacted_thinking"].includes(block?.type))) {
    throw new EntdeckenFactsProviderError("provider-envelope-invalid", usage);
  }
  const uses = value.content.filter((block) => block?.type === "server_tool_use"
    && block?.name === "web_search" && typeof block?.id === "string" && block.id);
  const results = value.content.filter((block) => block?.type === "web_search_tool_result");
  const useIds = new Set(uses.map((entry) => entry.id));
  const resultIds = new Set(results.map((entry) => entry?.tool_use_id));
  if (uses.length !== usage.searchRequests || useIds.size !== uses.length
      || results.length !== usage.searchRequests || resultIds.size !== results.length
      || [...useIds].some((id) => !resultIds.has(id))
      || results.some((result) => !useIds.has(result?.tool_use_id)
        || !Array.isArray(result?.content))) {
    throw new EntdeckenFactsProviderError("provider-tool-shape-invalid", usage);
  }
  const resultUrls = new Set(results.flatMap((result) => result.content)
    .filter((entry) => entry?.type === "web_search_result")
    .map((entry) => directUrl(entry.url)).filter(Boolean));
  const textBlocks = value.content.filter((block) => block?.type === "text");
  if (textBlocks.length !== 1 || typeof textBlocks[0]?.text !== "string") {
    throw new EntdeckenFactsProviderError("provider-output-invalid", usage);
  }
  const citationUrls = new Set((Array.isArray(textBlocks[0].citations) ? textBlocks[0].citations : [])
    .filter((entry) => entry?.type === "web_search_result_location")
    .map((entry) => directUrl(entry.url)).filter((url) => url && resultUrls.has(url)));
  let parsed;
  try { parsed = parseProviderLooseJsonText(textBlocks[0].text); }
  catch (error) {
    if (error instanceof ProviderTextSafetyError) {
      throw new EntdeckenFactsProviderError("provider-output-invalid", usage);
    }
    throw error;
  }
  if (parsed.mode !== "structured") {
    throw new EntdeckenFactsProviderError("provider-output-invalid", usage);
  }
  const normalized = validateEntdeckenFactsBatchOutput(parsed.value, requestedItems, {
    allowedEvidenceUrls: [...citationUrls],
    checkedAt,
  });
  if (!normalized) throw new EntdeckenFactsProviderError("provider-output-invalid", usage);
  return Object.freeze({
    ...normalized,
    items: Object.freeze(normalized.items.map((item) => Object.freeze({
      ...item,
      providerModel: usage.model,
    }))),
    usage,
  });
}

async function responseJson(response) {
  let raw;
  try { raw = await response.text(); }
  catch { throw new EntdeckenFactsProviderError("provider-body-invalid"); }
  if (typeof raw !== "string"
      || new TextEncoder().encode(raw).length > ENTDECKEN_FACTS_RESPONSE_MAX_BYTES) {
    throw new EntdeckenFactsProviderError("provider-body-invalid");
  }
  try { return raw ? JSON.parse(raw) : null; }
  catch { throw new EntdeckenFactsProviderError("provider-body-invalid"); }
}

export function createAnthropicEntdeckenFactsAdapter({
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
  async function resolve(items) {
    if (used) throw new EntdeckenFactsProviderError("already-used");
    used = true;
    if (!apiKey || typeof loadSetup !== "function" || typeof reserveCost !== "function"
        || typeof settleCost !== "function" || typeof readSettledCost !== "function"
        || typeof fetchImpl !== "function") setupError();
    const setup = validateEntdeckenFactsProviderSetup(await loadSetup());
    const body = buildAnthropicEntdeckenFactsBody(setup, items);
    const reservationUsdCent = estimateEntdeckenFactsReservation(body, setup);
    const requestOperationId = operationId();
    const reservation = await reserveCost({
      operationId: requestOperationId,
      reservationUsdCent,
      providerRequests: 1,
    });
    const logId = Number(reservation?.logId);
    if (reservation?.ok !== true || !Number.isSafeInteger(logId) || logId <= 0) {
      throw new EntdeckenFactsProviderError("cost-gate-rejected");
    }
    let usage = null;
    let costUsdCent = null;
    let settled = false;
    const settle = async (status, errorClass = null) => {
      if (settled) throw new EntdeckenFactsProviderError("cost-settlement-failed");
      settled = true;
      try {
        await settleCost({
          logId,
          status,
          model: usage?.model ?? setup.model,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          costUsdCent,
          errorClass,
        });
      } catch { throw new EntdeckenFactsProviderError("cost-settlement-failed"); }
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), setup.timeoutMs);
    try {
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
        throw new EntdeckenFactsProviderError(
          error?.name === "AbortError" ? "provider-timeout" : "http-error",
          null,
          createEntdeckenProviderFetchFailure(),
        );
      }
      let providerBody;
      try { providerBody = await responseJson(response); }
      catch (error) {
        if (!response?.ok) {
          throw new EntdeckenFactsProviderError(
            "http-error",
            null,
            createEntdeckenProviderHttpFailure(response?.status, null),
          );
        }
        throw error;
      }
      usage = providerUsage(providerBody, items.length * ENTDECKEN_FACTS_MAX_SEARCH_USES_PER_ITEM);
      if (!response?.ok) {
        throw new EntdeckenFactsProviderError(
          "http-error",
          usage,
          createEntdeckenProviderHttpFailure(response?.status, providerBody),
        );
      }
      const parsed = parseAnthropicEntdeckenFactsResponse(providerBody, items, now());
      usage = parsed.usage;
      costUsdCent = costFromUsage(
        setup, usage.inputTokens, usage.outputTokens, usage.searchRequests,
      );
      if (!finitePositive(costUsdCent) || costUsdCent > setup.taskCapUsdCent
          || costUsdCent > setup.globalRequestCapUsdCent) {
        throw new EntdeckenFactsProviderError("provider-cost-invalid", usage);
      }
      await settle("fertig");
      const persisted = await readSettledCost({ logId, operationId: requestOperationId });
      if (!plain(persisted) || persisted.logId !== logId
          || persisted.operationId !== requestOperationId
          || persisted.task !== ENTDECKEN_FACTS_PROVIDER_TASK
          || persisted.status !== "fertig" || persisted.model !== usage.model
          || persisted.inputTokens !== usage.inputTokens
          || persisted.outputTokens !== usage.outputTokens
          || persisted.costUsdCent !== costUsdCent) {
        throw new EntdeckenFactsProviderError("provider-receipt-invalid", usage);
      }
      return Object.freeze({
        schemaVersion: ENTDECKEN_FACTS_CONTRACT_VERSION,
        items: parsed.items,
        quality: Object.freeze({
          returned: parsed.returned,
          accepted: parsed.accepted,
          dropped: parsed.dropped,
          missing: parsed.missing,
          warnings: parsed.warnings,
        }),
        receipt: Object.freeze({
          model: usage.model,
          providerRequests: 1,
          searchRequests: usage.searchRequests,
          reservationUsdCent,
          costUsdCent,
          serverLogId: logId,
        }),
      });
    } catch (error) {
      const safe = error instanceof EntdeckenFactsProviderError
        ? error : new EntdeckenFactsProviderError("provider-body-invalid", usage);
      usage = usage ?? safe.usage;
      if (usage && costUsdCent === null) {
        costUsdCent = costFromUsage(
          setup, usage.inputTokens, usage.outputTokens, usage.searchRequests,
        );
      }
      if (!settled) await settle("fehler", safe.code);
      throw safe;
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ resolve });
}
