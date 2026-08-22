import { RADAR_WEBSEARCH_MAX_RESULTS } from "./contract.js";

export const RADAR_WEBSEARCH_PROVIDER_TASK = "radar-websearch";
export const RADAR_WEBSEARCH_PROVIDER_VERSION = "anthropic-web-search-20250305";
export const RADAR_WEBSEARCH_PROMPT_VERSION = "radar-websearch-v1";
export const RADAR_WEBSEARCH_MAX_TOKENS = 1200;
export const RADAR_WEBSEARCH_TASK_CAP_USD_CENT = 5;
export const RADAR_WEBSEARCH_FEE_USD_CENT = 1;
export const RADAR_WEBSEARCH_MAX_DOMAINS = 10;
export const RADAR_WEBSEARCH_TIMEOUT_MAX_MS = 135_000;
export const RADAR_WEBSEARCH_RESPONSE_MAX_BYTES = 512_000;
export const RADAR_WEBSEARCH_PHASE_CODES = Object.freeze([
  "runtime-setup",
  "cost-reservation",
  "provider-request",
  "provider-complete",
]);
export const RADAR_WEBSEARCH_RESERVATION_STATUSES = Object.freeze([
  "not-started", "reserved", "rejected", "unknown",
]);
export const RADAR_WEBSEARCH_RESERVATION_DECISIONS = Object.freeze([
  "not-started", "accepted", "limit", "disabled", "forbidden", "server", "unknown",
]);

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL_FORM = /^claude-haiku-4-5(?:-[0-9]{8})?$/;
const MODEL_PRICE_FLOOR = Object.freeze({ input: 100, output: 500 });
const ALLOWED_STATUSES = new Set(["confirmed", "insufficient_evidence", "no_change"]);
const SAFE_ERROR_CODES = new Set([
  "already-used",
  "cost-gate-rejected",
  "cost-log-invalid",
  "cost-settlement-failed",
  "http-error",
  "provider-body-invalid",
  "provider-response-too-large",
  "provider-timeout",
  "provider-tool-error",
  "provider-tool-shape-invalid",
  "provider-usage-invalid",
  "provider-stop-reason-invalid",
  "provider-output-invalid",
  "provider-result-count-invalid",
  "provider-citation-invalid",
  "provider-domain-invalid",
  "provider-cost-invalid",
  "setup-invalid",
]);

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value) {
  return String(value == null ? "" : value).trim();
}
function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
export function normalizeRadarReservationDecision(value) {
  if (value === "ai-disabled") return "disabled";
  return ["limit", "disabled", "forbidden", "server"].includes(value) ? value : "unknown";
}
function validDomain(value) {
  return typeof value === "string" && value === value.toLowerCase()
    && value.length >= 4 && value.length <= 253
    && value.split(".").length >= 2
    && value.split(".").every((label) => (
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
    ));
}
function directUrl(value) {
  if (typeof value !== "string" || value !== text(value) || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      && !parsed.port && !parsed.hash ? parsed : null;
  } catch {
    return null;
  }
}
function hostAllowed(hostname, domains) {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}
function roundCost(value) {
  return Math.ceil(value * 10_000) / 10_000;
}
function costFromUsage(setup, inputTokens, outputTokens, searchRequests) {
  if (![inputTokens, outputTokens, searchRequests].every(Number.isInteger)
      || inputTokens < 0 || outputTokens < 0 || searchRequests < 0) return null;
  return roundCost(
    (inputTokens * setup.inputPriceUsdCentPerMtok) / 1_000_000
      + (outputTokens * setup.outputPriceUsdCentPerMtok) / 1_000_000
      + searchRequests * setup.searchFeeUsdCent,
  );
}

export class RadarWebsearchProviderError extends Error {
  constructor(code, usage = null) {
    const safe = SAFE_ERROR_CODES.has(code) ? code : "provider-body-invalid";
    super(safe);
    this.name = "RadarWebsearchProviderError";
    this.code = safe;
    this.usage = usage;
  }
}

function setupError() {
  throw new RadarWebsearchProviderError("setup-invalid");
}

export function validateRadarWebsearchProviderSetup(value) {
  if (!plain(value)
      || value.radarEnabled !== true
      || value.radarProviderEnabled !== true
      || value.radarSchedulerEnabled !== false
      || value.providerAllowed !== true
      || value.modelAlias !== "klein"
      || !MODEL_FORM.test(value.model)
      || value.maxTokens !== RADAR_WEBSEARCH_MAX_TOKENS
      || value.taskCapUsdCent !== RADAR_WEBSEARCH_TASK_CAP_USD_CENT
      || value.searchFeeUsdCent !== RADAR_WEBSEARCH_FEE_USD_CENT
      || !finitePositive(value.globalRequestCapUsdCent)
      || value.globalRequestCapUsdCent > 500
      || value.taskCapUsdCent > value.globalRequestCapUsdCent
      || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1
      || value.timeoutMs > RADAR_WEBSEARCH_TIMEOUT_MAX_MS
      || !finitePositive(value.inputPriceUsdCentPerMtok)
      || value.inputPriceUsdCentPerMtok < MODEL_PRICE_FLOOR.input
      || !finitePositive(value.outputPriceUsdCentPerMtok)
      || value.outputPriceUsdCentPerMtok < MODEL_PRICE_FLOOR.output
      || !Array.isArray(value.sourceRegistry)
      || value.sourceRegistry.length < 1
      || value.sourceRegistry.length > RADAR_WEBSEARCH_MAX_DOMAINS) setupError();

  const domains = [];
  for (const source of value.sourceRegistry) {
    if (!plain(source) || !validDomain(source.domain)
        || source.active !== true || source.rightsStatus !== "approved"
        || source.attributionApproved !== true
        || !["official", "editorial"].includes(source.sourceClass)) setupError();
    domains.push(source.domain);
  }
  if (new Set(domains).size !== domains.length) setupError();
  return Object.freeze({
    ...value,
    sourceRegistry: Object.freeze(value.sourceRegistry.map((source) => Object.freeze({ ...source }))),
    allowedDomains: Object.freeze([...domains].sort()),
  });
}

const SYSTEM_PROMPT = [
  "Du extrahierst nur belegte Kinodreieck-Radarereignisse fuer das exakt genannte Werk und die Region AT.",
  "Nutze hoechstens eine Websuche und nur die serverseitig erlaubten Domains.",
  "Ein Ereignis braucht Werkidentitaet, AT-Bezug, taggenaues Datum und bei Streaming eine Plattform.",
  "Antworte im letzten Textblock ausschliesslich als JSON mit den Schluesseln status und events.",
  "status ist confirmed, insufficient_evidence oder no_change.",
  "events enthaelt nur eventType, eventDate, optional platform/seasonNumber und evidence.",
  "Jede evidence enthaelt url, sourceDomain, sourceTitle, optional publishedAt und claim; zitiere jede verwendete URL.",
].join(" ");
const PERSON_SYSTEM_PROMPT = [
  "Du extrahierst nur belegte Starttermine fuer Werke der exakt genannten Person in der exakt genannten Rolle.",
  "Nutze hoechstens eine Websuche, nur die erlaubten Domains und nur Werke aus dem mitgegebenen kleinen Katalog.",
  "Ein Kandidat braucht dieselbe starke Werk-ID, dieselbe Rolle, Region AT und ein Datum im angegebenen Sieben-Tage-Fenster.",
  "Antworte im letzten Textblock ausschliesslich als JSON mit den Schluesseln status und candidates.",
  "status ist confirmed, insufficient_evidence oder no_change; candidates enthaelt hoechstens drei Eintraege.",
  "Jeder Eintrag enthaelt targetId, targetType, title, year, role, eventType, eventDate, region, platform und evidence.",
  "Jede evidence enthaelt url, sourceDomain, sourceTitle, optional publishedAt und claim; keine Bewertungen oder Urteile.",
].join(" ");
const TITLE_GROUP_SYSTEM_PROMPT = [
  "Du extrahierst nur belegte Starttermine fuer die konkret aufgelisteten Werke einer Kinodreieck-Titelgruppe.",
  "Nutze hoechstens eine Websuche und nur die erlaubten Domains; erfinde oder matche keine weiteren Werke.",
  "Jeder Kandidat muss dieselbe starke Werk-ID, denselben Titel, dasselbe Jahr und denselben Typ wie ein Katalogeintrag tragen.",
  "Antworte im letzten Textblock ausschliesslich als JSON mit den Schluesseln status und candidates.",
  "status ist confirmed, insufficient_evidence oder no_change; candidates enthaelt hoechstens sechs Eintraege.",
  "Jeder Eintrag enthaelt targetId, targetType, title, year, eventType, eventDate, region, platform, seasonNumber und evidence.",
  "Jede evidence enthaelt url, sourceDomain, sourceTitle, optional publishedAt und claim; keine Bewertungen oder Urteile.",
].join(" ");

export function buildAnthropicRadarWebsearchBody(request, setupInput) {
  const setup = validateRadarWebsearchProviderSetup(setupInput);
  const person = request.kind === "person";
  const titleGroup = request.kind === "title_group";
  const providerInput = person ? {
    personExternalId: request.personExternalId,
    canonicalName: request.canonicalName,
    role: request.role,
    region: request.region,
    windowStart: request.windowStart,
    windowEnd: request.windowEnd,
    catalog: request.catalog,
  } : titleGroup ? {
    queryVersion: request.queryVersion,
    queryKey: request.queryKey,
    displayName: request.displayName,
    region: request.region,
    catalog: request.catalog,
  } : {
    targetId: request.targetId,
    canonicalTitle: request.canonicalTitle,
    ...(request.releaseYear === undefined ? {} : { releaseYear: request.releaseYear }),
    mediaType: request.mediaType,
    region: request.region,
    scopes: request.scopes,
    ...(request.knownEvidenceUrls === undefined ? {} : {
      knownEvidenceUrls: request.knownEvidenceUrls,
    }),
  };
  return Object.freeze({
    model: setup.model,
    max_tokens: setup.maxTokens,
    system: person ? PERSON_SYSTEM_PROMPT : titleGroup ? TITLE_GROUP_SYSTEM_PROMPT : SYSTEM_PROMPT,
    messages: Object.freeze([Object.freeze({
      role: "user",
      content: JSON.stringify(providerInput),
    })]),
    tools: Object.freeze([Object.freeze({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 1,
      allowed_domains: setup.allowedDomains,
      allowed_callers: Object.freeze(["direct"]),
    })]),
  });
}

export function estimateRadarWebsearchReservation(body, setupInput) {
  const setup = validateRadarWebsearchProviderSetup(setupInput);
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
  const conservativeInputTokens = bytes + 4096;
  const cost = costFromUsage(
    setup,
    conservativeInputTokens,
    setup.maxTokens,
    1,
  );
  if (!finitePositive(cost) || cost > setup.taskCapUsdCent) {
    throw new RadarWebsearchProviderError("provider-cost-invalid");
  }
  return cost;
}

function providerUsage(value) {
  const usage = value?.usage;
  const websearch = usage?.server_tool_use?.web_search_requests;
  if (!plain(usage) || !Number.isInteger(usage.input_tokens) || usage.input_tokens < 0
      || !Number.isInteger(usage.output_tokens) || usage.output_tokens < 0
      || !Number.isInteger(websearch) || websearch < 0) return null;
  return Object.freeze({
    model: typeof value?.model === "string" && MODEL_FORM.test(value.model)
      ? value.model : null,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    searchRequests: websearch,
  });
}

function responseTextBlock(content) {
  const blocks = content.filter((block) => block?.type === "text" && text(block.text));
  if (!blocks.length) throw new RadarWebsearchProviderError("provider-output-invalid");
  return blocks[blocks.length - 1];
}

function parseProviderJson(block, kind = "work") {
  let value;
  try { value = JSON.parse(block.text); } catch {
    throw new RadarWebsearchProviderError("provider-output-invalid");
  }
  const listKey = ["person", "title_group"].includes(kind) ? "candidates" : "events";
  const maxItems = kind === "person" ? 3 : kind === "title_group" ? 6 : 4;
  if (!plain(value) || Object.keys(value).length !== 2
      || !("status" in value) || !(listKey in value)
      || !ALLOWED_STATUSES.has(value.status) || !Array.isArray(value[listKey])
      || value[listKey].length > maxItems
      || (value.status !== "confirmed" && value[listKey].length !== 0)) {
    throw new RadarWebsearchProviderError("provider-output-invalid");
  }
  return value;
}

function urlsFromEvidence(value, kind = "work") {
  const urls = [];
  for (const finding of value[["person", "title_group"].includes(kind) ? "candidates" : "events"]) {
    if (!plain(finding) || !Array.isArray(finding.evidence)) {
      throw new RadarWebsearchProviderError("provider-output-invalid");
    }
    for (const evidence of finding.evidence) {
      if (!plain(evidence) || typeof evidence.url !== "string") {
        throw new RadarWebsearchProviderError("provider-output-invalid");
      }
      urls.push(evidence.url);
    }
  }
  return urls;
}

export function parseAnthropicRadarWebsearchResponse(value, request, setupInput, checkedAt) {
  const setup = validateRadarWebsearchProviderSetup(setupInput);
  const usage = providerUsage(value);
  if (!usage || usage.searchRequests !== 1) {
    throw new RadarWebsearchProviderError("provider-usage-invalid", usage);
  }
  if (value?.stop_reason === "pause_turn") {
    throw new RadarWebsearchProviderError("provider-stop-reason-invalid", usage);
  }
  if (value?.stop_reason !== "end_turn" || !Array.isArray(value?.content)) {
    throw new RadarWebsearchProviderError("provider-stop-reason-invalid", usage);
  }

  const uses = value.content.filter((block) => (
    block?.type === "server_tool_use" && block?.name === "web_search"
  ));
  const results = value.content.filter((block) => block?.type === "web_search_tool_result");
  if (uses.length !== 1 || results.length !== 1 || results[0].tool_use_id !== uses[0].id) {
    throw new RadarWebsearchProviderError("provider-tool-shape-invalid", usage);
  }
  if (plain(results[0].content) && results[0].content.type === "web_search_tool_result_error") {
    throw new RadarWebsearchProviderError("provider-tool-error", usage);
  }
  if (!Array.isArray(results[0].content)) {
    throw new RadarWebsearchProviderError("provider-tool-shape-invalid", usage);
  }
  if (results[0].content.length > RADAR_WEBSEARCH_MAX_RESULTS) {
    throw new RadarWebsearchProviderError("provider-result-count-invalid", usage);
  }

  const resultUrls = new Set();
  for (const item of results[0].content) {
    const parsed = item?.type === "web_search_result" ? directUrl(item.url) : null;
    if (!parsed || !hostAllowed(parsed.hostname.toLowerCase(), setup.allowedDomains)) {
      throw new RadarWebsearchProviderError("provider-domain-invalid", usage);
    }
    resultUrls.add(item.url);
  }

  const citationUrls = new Set();
  for (const block of value.content.filter((item) => item?.type === "text")) {
    if (block.citations === undefined) continue;
    if (!Array.isArray(block.citations)) {
      throw new RadarWebsearchProviderError("provider-citation-invalid", usage);
    }
    for (const citation of block.citations) {
      const parsed = citation?.type === "web_search_result_location"
        ? directUrl(citation.url) : null;
      if (!parsed || !resultUrls.has(citation.url)
          || !hostAllowed(parsed.hostname.toLowerCase(), setup.allowedDomains)) {
        throw new RadarWebsearchProviderError("provider-citation-invalid", usage);
      }
      citationUrls.add(citation.url);
    }
  }

  const kind = request.kind === "person" ? "person" : request.kind === "title_group" ? "title_group" : "work";
  const parsed = parseProviderJson(responseTextBlock(value.content), kind);
  for (const url of urlsFromEvidence(parsed, kind)) {
    if (!resultUrls.has(url) || !citationUrls.has(url)) {
      throw new RadarWebsearchProviderError("provider-citation-invalid", usage);
    }
  }
  if (kind === "person") {
    return Object.freeze({
      envelope: Object.freeze({
        searchResultCount: results[0].content.length,
        response: Object.freeze({
          status: parsed.status,
          checkedAt,
          person: Object.freeze({
            personExternalId: request.personExternalId,
            canonicalName: request.canonicalName,
            role: request.role,
          }),
          candidates: parsed.candidates,
        }),
      }),
      usage,
    });
  }
  if (kind === "title_group") {
    return Object.freeze({
      envelope: Object.freeze({
        searchResultCount: results[0].content.length,
        response: Object.freeze({
          status: parsed.status,
          checkedAt,
          titleGroup: Object.freeze({
            queryVersion: request.queryVersion,
            queryKey: request.queryKey,
            displayName: request.displayName,
          }),
          candidates: parsed.candidates,
        }),
      }),
      usage,
    });
  }
  const target = {
    targetId: request.targetId,
    canonicalTitle: request.canonicalTitle,
    ...(request.releaseYear === undefined ? {} : { releaseYear: request.releaseYear }),
    mediaType: request.mediaType,
    region: request.region,
  };
  return Object.freeze({
    envelope: Object.freeze({
      searchResultCount: results[0].content.length,
      response: Object.freeze({
        status: parsed.status,
        checkedAt,
        target: Object.freeze(target),
        events: parsed.events,
      }),
    }),
    usage,
  });
}

async function responseJson(response) {
  let raw;
  try { raw = await response.text(); } catch {
    throw new RadarWebsearchProviderError("provider-body-invalid");
  }
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > RADAR_WEBSEARCH_RESPONSE_MAX_BYTES) {
    throw new RadarWebsearchProviderError("provider-response-too-large");
  }
  try { return raw ? JSON.parse(raw) : null; } catch {
    throw new RadarWebsearchProviderError("provider-body-invalid");
  }
}

/**
 * @param {{
 *   apiKey?: string,
 *   loadSetup?: (() => Promise<unknown>) | null,
 *   reserveCost?: ((input: {targetId: string, operationId: string, reservationUsdCent: number, searchRequests: number}) => Promise<{ok?: boolean, logId?: unknown, decision?: unknown}>) | null,
 *   settleCost?: ((input: Record<string, unknown>) => Promise<void>) | null,
 *   fetchImpl?: typeof fetch,
 *   now?: () => string,
 *   operationId?: () => string
 * }} [options]
 */
export function createAnthropicRadarWebsearchAdapter({
  apiKey = "",
  loadSetup = null,
  reserveCost = null,
  settleCost = null,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  operationId = () => crypto.randomUUID(),
} = {}) {
  let used = false;
  const telemetry = {
    providerRequests: 0,
    searchRequests: 0,
    resultCount: 0,
    costUsdCent: null,
    phaseCode: "runtime-setup",
    reservationStatus: "not-started",
    reservationUsdCent: null,
    reservationDecision: "not-started",
  };
  async function search(request) {
    if (used) throw new RadarWebsearchProviderError("already-used");
    used = true;
    if (typeof apiKey !== "string" || !apiKey || typeof loadSetup !== "function"
        || typeof reserveCost !== "function" || typeof settleCost !== "function"
        || typeof fetchImpl !== "function") setupError();

    const setup = validateRadarWebsearchProviderSetup(await loadSetup());
    const body = buildAnthropicRadarWebsearchBody(request, setup);
    const reservationUsdCent = estimateRadarWebsearchReservation(body, setup);
    telemetry.phaseCode = "cost-reservation";
    const providerOperationId = operationId();
    let reservation;
    try {
      reservation = await reserveCost({
        targetId: request.targetId,
        operationId: providerOperationId,
        reservationUsdCent,
        searchRequests: 1,
      });
    } catch {
      telemetry.reservationStatus = "unknown";
      telemetry.reservationDecision = "unknown";
      throw new RadarWebsearchProviderError("cost-gate-rejected");
    }
    const logId = Number(reservation?.logId);
    if (reservation?.ok !== true) {
      telemetry.reservationStatus = "rejected";
      telemetry.reservationDecision = normalizeRadarReservationDecision(reservation?.decision);
      throw new RadarWebsearchProviderError("cost-gate-rejected");
    }
    if (!Number.isInteger(logId) || logId <= 0) {
      telemetry.reservationStatus = "unknown";
      telemetry.reservationDecision = "unknown";
      throw new RadarWebsearchProviderError("cost-log-invalid");
    }
    telemetry.reservationStatus = "reserved";
    telemetry.reservationUsdCent = reservationUsdCent;
    telemetry.reservationDecision = "accepted";
    telemetry.phaseCode = "provider-request";

    let usage = null;
    let costUsdCent = null;
    let settled = false;
    const settle = async (status, code = null) => {
      if (settled) throw new RadarWebsearchProviderError("cost-settlement-failed");
      settled = true;
      try {
        await settleCost({
          logId,
          status,
          model: usage?.model ?? setup.model,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
          costUsdCent,
          errorClass: code,
        });
      } catch {
        throw new RadarWebsearchProviderError("cost-settlement-failed");
      }
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
        throw new RadarWebsearchProviderError(
          error?.name === "AbortError" ? "provider-timeout" : "http-error",
        );
      }
      const providerBody = await responseJson(response);
      usage = providerUsage(providerBody);
      if (!response?.ok) throw new RadarWebsearchProviderError("http-error", usage);
      const parsed = parseAnthropicRadarWebsearchResponse(
        providerBody,
        request,
        setup,
        now(),
      );
      usage = parsed.usage;
      costUsdCent = costFromUsage(
        setup,
        usage.inputTokens,
        usage.outputTokens,
        usage.searchRequests,
      );
      if (!finitePositive(costUsdCent) || costUsdCent > setup.taskCapUsdCent
          || costUsdCent > setup.globalRequestCapUsdCent) {
        throw new RadarWebsearchProviderError("provider-cost-invalid", usage);
      }
      await settle("fertig");
      telemetry.searchRequests = usage.searchRequests;
      telemetry.resultCount = parsed.envelope.searchResultCount;
      telemetry.costUsdCent = costUsdCent;
      telemetry.phaseCode = "provider-complete";
      return parsed.envelope;
    } catch (error) {
      const safe = error instanceof RadarWebsearchProviderError
        ? error : new RadarWebsearchProviderError("provider-body-invalid");
      usage = usage ?? safe.usage;
      if (usage && costUsdCent === null) {
        costUsdCent = costFromUsage(
          setup,
          usage.inputTokens,
          usage.outputTokens,
          usage.searchRequests,
        );
      }
      if (!settled) await settle("fehler", safe.code);
      telemetry.searchRequests = usage?.searchRequests ?? 0;
      telemetry.costUsdCent = costUsdCent;
      throw safe;
    } finally {
      clearTimeout(timer);
    }
  }
  return Object.freeze({
    search,
    telemetry: () => Object.freeze({ ...telemetry }),
  });
}
