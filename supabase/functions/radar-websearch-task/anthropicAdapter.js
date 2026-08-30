import {
  RADAR_WEBSEARCH_MAX_RESULTS,
  RADAR_WEBSEARCH_TITLE_GROUP_DISCOVERY_MODE,
} from "./contract.js";
import {
  ProviderTextSafetyError,
  parseProviderLooseJsonText,
} from "../_shared/providerText.js";
import { createProviderReceipt } from "../_shared/providerReceipt.js";

export const RADAR_WEBSEARCH_PROVIDER_TASK = "radar-websearch";
export const RADAR_WEBSEARCH_PROVIDER_VERSION = "anthropic-web-search-20250305";
export const RADAR_WEBSEARCH_PROMPT_VERSION = "radar-websearch-v1";
export const RADAR_WEBSEARCH_MAX_TOKENS = 1200;
export const RADAR_WEBSEARCH_TASK_CAP_USD_CENT = 5;
export const RADAR_WEBSEARCH_FEE_USD_CENT = 1;
export const RADAR_WEBSEARCH_MAX_DOMAINS = 10;
export const RADAR_TEXT_MAX_USES = 4;
export const RADAR_TEXT_MAX_TOKENS = 2400;
export const RADAR_TEXT_TASK_CAP_USD_CENT = 20;
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
  "provider-receipt-invalid",
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

export function validateRadarWebsearchProviderSetup(value, { textTarget = false } = {}) {
  if (!plain(value)
      || value.radarEnabled !== true
      || value.radarProviderEnabled !== true
      || typeof value.radarSchedulerEnabled !== "boolean"
      || value.providerAllowed !== true
      || value.modelAlias !== "klein"
      || !MODEL_FORM.test(value.model)
      || ![RADAR_WEBSEARCH_MAX_TOKENS, RADAR_TEXT_MAX_TOKENS].includes(value.maxTokens)
      || ![RADAR_WEBSEARCH_TASK_CAP_USD_CENT, RADAR_TEXT_TASK_CAP_USD_CENT].includes(value.taskCapUsdCent)
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
      || (!textTarget && (!Array.isArray(value.sourceRegistry)
        || value.sourceRegistry.length < 1
        || value.sourceRegistry.length > RADAR_WEBSEARCH_MAX_DOMAINS))) setupError();

  const domains = [];
  for (const source of textTarget ? [] : value.sourceRegistry) {
    if (!plain(source) || !validDomain(source.domain)
        || source.active !== true || source.rightsStatus !== "approved"
        || source.attributionApproved !== true
        || !["official", "editorial"].includes(source.sourceClass)) setupError();
    domains.push(source.domain);
  }
  if (new Set(domains).size !== domains.length) setupError();
  return Object.freeze({
    ...value,
    sourceRegistry: Object.freeze((textTarget ? [] : value.sourceRegistry).map((source) => Object.freeze({ ...source }))),
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
const TITLE_GROUP_DISCOVERY_SYSTEM_PROMPT = [
  "Du suchst nur neue belegte Starttermine fuer die exakt genannte kanonische Titelgruppe mit ihrer exakten externen Gruppen-ID.",
  "Nutze genau eine Websuche und nur die erlaubten Domains; fuehre keinen Vollkatalogscan und kein Stichwort-, Alias- oder Fuzzy-Matching aus.",
  "Ein noch unbekanntes Werk ist nur zulaessig, wenn targetId eine starke IMDb- oder TMDB-Werk-ID ist und groupExternalId exakt der Anfrage entspricht.",
  "Jeder Kandidat braucht einen separaten Zugehoerigkeitsbeleg in membershipEvidence und einen anderen Termin- oder Verfuegbarkeitsbeleg in evidence.",
  "Das Ereignis muss Region AT und ein Datum im mitgegebenen Fenster tragen; Streaming braucht eine konkrete Plattform.",
  "Antworte im letzten Textblock ausschliesslich als JSON mit den Schluesseln status und candidates.",
  "status ist confirmed, insufficient_evidence oder no_change; candidates enthaelt hoechstens sechs Eintraege.",
  "Jeder Eintrag enthaelt targetId, targetType, title, year, eventType, eventDate, region, platform, seasonNumber, groupExternalId, membershipEvidence und evidence.",
  "Jede Evidence enthaelt url, sourceDomain, sourceTitle, optional publishedAt und claim; keine Bewertungen oder Urteile.",
].join(" ");
const TEXT_SYSTEM_PROMPT = [
  "Du suchst neue belegte Starttermine, die sich eindeutig auf den unveraenderten Freitext der Nutzerin beziehen.",
  "Der Freitext kann eine Person, Titelgruppe, Serie oder ein Werk nennen; rate keine Kategorie und erfinde keine Identitaet.",
  "Nutze offene Websuche in zwei Schritten innerhalb von maximal vier Toolaufrufen: erst wenige komplementaere Discoveryanfragen zu neuen Filmen, Serien, Staffeln und Specials. Nutze englische Suchbegriffe wenn deutsch duenn bleibt, ohne erzwungenes Oesterreich-Keyword in Discovery.",
  "Danach nur fuer gefundene Titel mit fehlendem Startdatum gezielt Datum nachsuchen. Ist eine gelesene Quelle bereits vollstaendig, uebernimm den Fund sofort ohne Pflicht-Zusatzrunde. Keine Endlossuche, keine Retries. Keine IMDb/TMDB-ID oder Werkjahr erforderlich.",
  "Ein Websearch-Beleg in evidence darf sowohl Bezug zum Freitext als auch Starttermin belegen. Keine zweite Quelle oder separate relationEvidence erforderlich.",
  "eventDate ist ausschliesslich der explizite Starttag DES WERKS in YYYY-MM-DD, niemals das Publikationsdatum des Artikels. Alte Ankuendigungen duerfen kommende Starts belegen; kein Artikel-Neuheitsfilter. Bevorzuge oesterreichische Termine. US-only Daten niemals als AT ausgeben; solche Funde ohne brauchbaren Termin weglassen. region AT nur mit AT-Beleg, global fuer belegten weltweiten Start, sonst unspecified ohne Laenderbehauptung.",
  "Antworte im letzten Textblock ausschliesslich als JSON mit status und candidates.",
  "status ist confirmed, insufficient_evidence oder no_change; lasse nur unklare Einzelergebnisse weg, behalte gueltige Geschwister. Maximal sechs Kandidaten.",
  "Pflicht je Kandidat: title, eventDate, eventType und evidence. eventType: kinostart_at, streamingstart_at, serienstart oder staffelstart. Bei streamingstart_at nenne category film, series oder special (alternativ targetType work oder series).",
  "Optional: targetType, region, seasonNumber, category (film, series, season, special) und platform. Behalte erkannte Plattformen auch bei Serien- und Staffelstarts, sonst weglassen. Specials als Kategorie special mit passender Startart. Keine Links fuer die Anzeige noetig.",
  "evidence enthaelt url, sourceDomain, sourceTitle, claim und optional publishedAt. claim benennt den Starttermin und den Bezug; url muss aus der verwendeten Websuche stammen.",
].join(" ");

export function buildAnthropicRadarWebsearchBody(request, setupInput) {
  const setup = validateRadarWebsearchProviderSetup(setupInput, { textTarget: request.kind === "text" });
  const person = request.kind === "person";
  const titleGroup = request.kind === "title_group";
  const textTarget = request.kind === "text";
  const titleGroupDiscovery = titleGroup
    && request.discoveryMode === RADAR_WEBSEARCH_TITLE_GROUP_DISCOVERY_MODE;
  const providerInput = textTarget ? {
    targetText: request.targetText,
    discoveryQueries: [
      `${request.targetText} neue Filme kommende Projekte`,
      `${request.targetText} neue Serien Staffeln Specials`,
    ],
    englishFallback: `${request.targetText} upcoming movie series season release`,
    dateFollowup: "Nur fehlende Startdaten gefundener Titel gezielt nachschlagen; AT bevorzugen.",
    region: request.region,
    scopes: request.scopes,
  } : person ? {
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
    searchQuery: `${request.displayName} neuer Film neue Serie Start Österreich`,
    region: request.region,
    catalog: request.catalog,
    ...(titleGroupDiscovery ? {
      discoveryMode: request.discoveryMode,
      groupExternalId: request.groupExternalId,
      canonicalGroupName: request.canonicalGroupName,
      windowStart: request.windowStart,
      windowEnd: request.windowEnd,
    } : {}),
  } : {
    targetId: request.targetId,
    canonicalTitle: request.canonicalTitle,
    searchQuery: `${request.canonicalTitle} neuer Film neue Serie Start Österreich`,
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
    max_tokens: textTarget ? setup.maxTokens : RADAR_WEBSEARCH_MAX_TOKENS,
    system: textTarget ? TEXT_SYSTEM_PROMPT : person ? PERSON_SYSTEM_PROMPT
      : titleGroupDiscovery ? TITLE_GROUP_DISCOVERY_SYSTEM_PROMPT
        : titleGroup ? TITLE_GROUP_SYSTEM_PROMPT : SYSTEM_PROMPT,
    messages: Object.freeze([Object.freeze({
      role: "user",
      content: JSON.stringify(providerInput),
    })]),
    tools: Object.freeze([Object.freeze({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: textTarget ? RADAR_TEXT_MAX_USES : 1,
      ...(textTarget ? {} : { allowed_domains: setup.allowedDomains }),
      allowed_callers: Object.freeze(["direct"]),
    })]),
  });
}

export function estimateRadarWebsearchReservation(body, setupInput) {
  const setup = validateRadarWebsearchProviderSetup(setupInput, { textTarget: body.tools[0].max_uses > 1 });
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length;
  const maxUses = body.tools[0].max_uses;
  const conservativeInputTokens = bytes + (maxUses > 1 ? maxUses * 16384 : 4096);
  const cost = costFromUsage(
    setup,
    conservativeInputTokens,
    body.max_tokens,
    maxUses,
  );
  if (!finitePositive(cost) || cost > Math.min(setup.taskCapUsdCent,
    maxUses > 1 ? RADAR_TEXT_TASK_CAP_USD_CENT : RADAR_WEBSEARCH_TASK_CAP_USD_CENT)) {
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

const RADAR_WEBSEARCH_EVENT_TYPES = new Set([
  "kinostart_at", "streamingstart_at", "serienstart", "staffelstart",
]);
const PROVIDER_WARNING_MAX = 8;

function addWarning(warnings, code) {
  if (warnings.size < PROVIDER_WARNING_MAX) warnings.add(code);
}

function safeWarnings(warnings) {
  return Object.freeze([...warnings].slice(0, PROVIDER_WARNING_MAX));
}

function parseProviderText(content, warnings) {
  if (content.some((block) => ["thinking", "redacted_thinking"].includes(block?.type))) {
    throw new RadarWebsearchProviderError("provider-output-invalid");
  }
  const parsedBlocks = [];
  try {
    for (const block of content.filter((entry) => entry?.type === "text" && text(entry.text))) {
      parsedBlocks.push(parseProviderLooseJsonText(block.text));
    }
  } catch (error) {
    if (error instanceof ProviderTextSafetyError) {
      throw new RadarWebsearchProviderError("provider-output-invalid");
    }
    throw error;
  }
  if (!parsedBlocks.length) {
    addWarning(warnings, "provider-text-missing");
    return Object.freeze({
      mode: "degraded", value: null, displayText: null, warnings: Object.freeze([]),
    });
  }
  if (parsedBlocks.length > 1) addWarning(warnings, "multiple-text-blocks-normalized");
  const selected = [...parsedBlocks].reverse().find((entry) => entry.value) || parsedBlocks.at(-1);
  for (const warning of selected.warnings) addWarning(warnings, warning);
  return selected;
}

function normalizeEvidenceList(value, resultUrls, citationUrls, warnings, requireCitation = true) {
  if (!Array.isArray(value)) {
    addWarning(warnings, "evidence-list-dropped");
    return [];
  }
  const normalized = [];
  for (const entry of value.slice(0, RADAR_WEBSEARCH_MAX_RESULTS)) {
    if (!plain(entry)) {
      addWarning(warnings, "evidence-item-dropped");
      continue;
    }
    const parsedUrl = directUrl(entry.url);
    const sourceDomain = typeof entry.sourceDomain === "string" ? entry.sourceDomain : "";
    if (!parsedUrl || parsedUrl.hostname.toLowerCase() !== sourceDomain
        || !resultUrls.has(entry.url) || (requireCitation && !citationUrls.has(entry.url))
        || typeof entry.sourceTitle !== "string" || !text(entry.sourceTitle)
        || typeof entry.claim !== "string" || !text(entry.claim)) {
      addWarning(warnings, "evidence-item-dropped");
      continue;
    }
    const normalizedEntry = {
      url: entry.url,
      sourceDomain,
      sourceTitle: entry.sourceTitle,
      claim: entry.claim,
      ...(typeof entry.publishedAt === "string" ? { publishedAt: entry.publishedAt } : {}),
    };
    if (Object.keys(entry).some((key) => !["url", "sourceDomain", "sourceTitle", "claim", "publishedAt"].includes(key))) {
      addWarning(warnings, "extra-fields-ignored");
    }
    normalized.push(normalizedEntry);
  }
  if (value.length > RADAR_WEBSEARCH_MAX_RESULTS) addWarning(warnings, "evidence-list-truncated");
  return normalized;
}

function normalizePlatform(value, eventType) {
  const normalized = typeof value === "string" ? text(value).slice(0, 80) : "";
  if (eventType !== "streamingstart_at") return "-";
  return normalized && !/^(?:-|unknown|unbekannt|n\/a)$/iu.test(normalized) ? normalized : "unknown";
}

function normalizeFinding(value, kind, request, resultUrls, citationUrls, warnings) {
  if (!plain(value)) {
    addWarning(warnings, "finding-dropped");
    return null;
  }
  const evidence = normalizeEvidenceList(value.evidence, resultUrls, citationUrls, warnings, kind !== "text");
  if (!evidence.length) {
    addWarning(warnings, "finding-dropped");
    return null;
  }
  if (kind === "text") {
    return {
      title: value.title, eventType: value.eventType, eventDate: value.eventDate, evidence,
      ...Object.fromEntries(["targetId", "targetType", "year", "region", "platform", "seasonNumber", "category"]
        .filter((key) => value[key] != null).map((key) => [key, value[key]])),
    };
  }
  if (kind === "work") {
    const allowed = ["eventType", "eventDate", "platform", "seasonNumber", "evidence"];
    if (Object.keys(value).some((key) => !allowed.includes(key))) addWarning(warnings, "extra-fields-ignored");
    if (!RADAR_WEBSEARCH_EVENT_TYPES.has(value.eventType)) {
      addWarning(warnings, "finding-dropped");
      return null;
    }
    return {
      eventType: value.eventType,
      eventDate: value.eventDate,
      ...(value.eventType === "streamingstart_at" ? { platform: value.platform } : {}),
      ...(value.eventType === "staffelstart" ? { seasonNumber: value.seasonNumber } : {}),
      evidence,
    };
  }

  const commonAllowed = [
    "targetId", "targetType", "title", "year", "role", "eventType", "eventDate",
    "region", "platform", "seasonNumber", "groupExternalId", "membershipEvidence",
    "relationEvidence", "evidence",
  ];
  if (Object.keys(value).some((key) => !commonAllowed.includes(key))) addWarning(warnings, "extra-fields-ignored");
  const normalizedPlatform = normalizePlatform(value.platform, value.eventType);
  const base = {
    targetId: value.targetId,
    targetType: value.targetType,
    title: value.title,
    year: value.year,
    ...(kind === "person" ? { role: value.role } : {}),
    eventType: value.eventType,
    eventDate: value.eventDate,
    region: value.region,
    platform: normalizedPlatform,
    ...(kind === "person" ? {} : {
      seasonNumber: value.seasonNumber ?? (value.eventType === "staffelstart" ? undefined : null),
    }),
    evidence,
  };
  if (value.platform === undefined && value.eventType !== "streamingstart_at") {
    addWarning(warnings, "optional-fields-filled");
  }
  if (kind !== "person" && value.seasonNumber === undefined && value.eventType !== "staffelstart") {
    addWarning(warnings, "optional-fields-filled");
  }
  if (kind === "title_group"
      && request.discoveryMode === RADAR_WEBSEARCH_TITLE_GROUP_DISCOVERY_MODE) {
    const membershipEvidence = normalizeEvidenceList(
      value.membershipEvidence, resultUrls, citationUrls, warnings,
    );
    if (!membershipEvidence.length) {
      addWarning(warnings, "finding-dropped");
      return null;
    }
    return { ...base, groupExternalId: value.groupExternalId, membershipEvidence };
  }
  return base;
}

function normalizeProviderJson(parsedText, kind, request, resultUrls, citationUrls, warnings) {
  const listKey = ["person", "title_group", "text"].includes(kind) ? "candidates" : "events";
  const maxItems = kind === "person" ? 3 : kind === "work" ? 4 : 6;
  if (!plain(parsedText.value)) {
    return { status: "insufficient_evidence", [listKey]: [] };
  }
  if (Object.keys(parsedText.value).some((key) => !["status", listKey].includes(key))) {
    addWarning(warnings, "extra-fields-ignored");
  }
  const rawItems = Array.isArray(parsedText.value[listKey]) ? parsedText.value[listKey] : [];
  if (!Array.isArray(parsedText.value[listKey])) addWarning(warnings, "finding-list-missing");
  if (rawItems.length > maxItems) addWarning(warnings, "finding-list-truncated");
  const normalized = rawItems.slice(0, maxItems)
    .map((entry) => normalizeFinding(entry, kind, request, resultUrls, citationUrls, warnings))
    .filter(Boolean);
  let status = ALLOWED_STATUSES.has(parsedText.value.status)
    ? parsedText.value.status : normalized.length ? "confirmed" : "insufficient_evidence";
  if (!ALLOWED_STATUSES.has(parsedText.value.status)) addWarning(warnings, "status-normalized");
  if (normalized.length && status !== "confirmed") {
    status = "confirmed";
    addWarning(warnings, "status-normalized");
  }
  if (!normalized.length && status === "confirmed") {
    status = "insufficient_evidence";
    addWarning(warnings, "status-normalized");
  }
  return { status, [listKey]: normalized };
}

function responsePresentation(parsedText, warnings) {
  const allWarnings = safeWarnings(warnings);
  const mode = parsedText.mode === "degraded"
    ? "degraded" : allWarnings.length || parsedText.mode === "partial" ? "partial" : "structured";
  const safeDisplay = mode === "degraded"
    ? parsedText.displayText || "Die Suche lieferte einen unstrukturierten Hinweis. Es wurde nichts gespeichert."
    : mode === "partial"
      ? "Teile der Antwort waren unvollständig. Nur belegte Funde wurden berücksichtigt."
      : null;
  return Object.freeze({ responseMode: mode, displayText: safeDisplay, warnings: allWarnings });
}

export function parseAnthropicRadarWebsearchResponse(value, request, setupInput, checkedAt) {
  const setup = validateRadarWebsearchProviderSetup(setupInput, { textTarget: request.kind === "text" });
  const usage = providerUsage(value);
  const textTarget = request.kind === "text";
  const maxUses = textTarget ? RADAR_TEXT_MAX_USES : 1;
  if (!usage || usage.searchRequests < 1 || usage.searchRequests > maxUses) {
    throw new RadarWebsearchProviderError("provider-usage-invalid", usage);
  }
  if (!Array.isArray(value?.content)) {
    throw new RadarWebsearchProviderError("provider-stop-reason-invalid", usage);
  }
  const warnings = new Set();
  if (value?.stop_reason !== "end_turn") addWarning(warnings, "stop-reason-normalized");

  const uses = value.content.filter((block) => (
    block?.type === "server_tool_use" && block?.name === "web_search"
  ));
  const results = value.content.filter((block) => block?.type === "web_search_tool_result");
  if (textTarget && (uses.length > maxUses || results.length > maxUses)) throw new RadarWebsearchProviderError("provider-tool-shape-invalid", usage);
  if (uses.length !== usage.searchRequests || results.length !== uses.length) addWarning(warnings, "tool-blocks-normalized");
  const useIds = new Set(uses.map((entry) => entry.id).filter((entry) => typeof entry === "string"));

  const resultUrls = new Set();
  for (const result of results) {
    if (plain(result.content) && result.content.type === "web_search_tool_result_error") {
      if (textTarget) { addWarning(warnings, "search-step-failed"); continue; }
      throw new RadarWebsearchProviderError("provider-tool-error", usage);
    }
    if (!Array.isArray(result.content)) {
      addWarning(warnings, "tool-blocks-normalized");
      continue;
    }
    if (useIds.size && !useIds.has(result.tool_use_id)) {
      addWarning(warnings, "tool-blocks-normalized");
      if (textTarget) continue;
    }
    for (const item of result.content) {
      const parsed = item?.type === "web_search_result" ? directUrl(item.url) : null;
      if (!parsed || (!textTarget && !hostAllowed(parsed.hostname.toLowerCase(), setup.allowedDomains))) {
        addWarning(warnings, "search-result-dropped");
        continue;
      }
      if (resultUrls.size < (textTarget ? 100 : RADAR_WEBSEARCH_MAX_RESULTS)) resultUrls.add(item.url);
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
      const parsed = citation?.type === "web_search_result_location"
        ? directUrl(citation.url) : null;
      if (!parsed || !resultUrls.has(citation.url)
          || (!textTarget && !hostAllowed(parsed.hostname.toLowerCase(), setup.allowedDomains))) {
        addWarning(warnings, "citation-dropped");
        continue;
      }
      citationUrls.add(citation.url);
    }
  }

  const kind = request.kind === "person" ? "person"
    : request.kind === "title_group" ? "title_group" : request.kind === "text" ? "text" : "work";
  const parsedText = parseProviderText(value.content, warnings);
  const parsed = normalizeProviderJson(
    parsedText, kind, request, resultUrls, citationUrls, warnings,
  );
  const presentation = responsePresentation(parsedText, warnings);
  if (kind === "person") {
    return Object.freeze({
      envelope: Object.freeze({
        searchResultCount: resultUrls.size,
        ...presentation,
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
        searchResultCount: resultUrls.size,
        ...presentation,
        response: Object.freeze({
          status: parsed.status,
          checkedAt,
          titleGroup: Object.freeze({
            queryVersion: request.queryVersion,
            queryKey: request.queryKey,
            displayName: request.displayName,
            ...(request.discoveryMode === RADAR_WEBSEARCH_TITLE_GROUP_DISCOVERY_MODE ? {
              groupExternalId: request.groupExternalId,
              canonicalGroupName: request.canonicalGroupName,
            } : {}),
          }),
          candidates: parsed.candidates,
        }),
      }),
      usage,
    });
  }
  if (kind === "text") {
    return Object.freeze({
      envelope: Object.freeze({
        searchResultCount: Math.min(resultUrls.size, RADAR_WEBSEARCH_MAX_RESULTS),
        ...presentation,
        response: Object.freeze({
          status: parsed.status,
          checkedAt,
          textTarget: Object.freeze({ targetId: request.targetId, targetText: request.targetText }),
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
      searchResultCount: resultUrls.size,
      ...presentation,
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

async function responseJson(response, onRawResponse = () => {}) {
  let raw;
  try { raw = await response.text(); } catch {
    throw new RadarWebsearchProviderError("provider-body-invalid");
  }
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > RADAR_WEBSEARCH_RESPONSE_MAX_BYTES) {
    throw new RadarWebsearchProviderError("provider-response-too-large");
  }
  onRawResponse(raw);
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
  let providerRawResponse = null;
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

    const setup = validateRadarWebsearchProviderSetup(await loadSetup(request), { textTarget: request.kind === "text" });
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
        searchRequests: body.tools[0].max_uses,
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
    let providerRawForReceipt = "";
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
      const providerBody = await responseJson(response, (raw) => {
        providerRawResponse = raw;
        providerRawForReceipt = raw;
      });
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
      let providerReceipt = null;
      try {
        providerReceipt = await createProviderReceipt({
          provider: "anthropic",
          providerResponseText: providerRawForReceipt,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          webSearchRequests: usage.searchRequests,
          resultMode: parsed.envelope.responseMode,
          serverLogId: logId,
          providerRequests: 1,
          reservationUsdCent,
          costUsdCent,
        });
      } catch { /* Der Hash ist Teil des fail-closed Produktvertrags. */ }
      if (!providerReceipt) {
        throw new RadarWebsearchProviderError("provider-receipt-invalid", usage);
      }
      await settle("fertig");
      telemetry.searchRequests = usage.searchRequests;
      telemetry.resultCount = parsed.envelope.searchResultCount;
      telemetry.costUsdCent = costUsdCent;
      telemetry.phaseCode = "provider-complete";
      return Object.freeze({ ...parsed.envelope, providerReceipt });
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
    takeProviderRawResponse: () => {
      const raw = providerRawResponse;
      providerRawResponse = null;
      return raw;
    },
  });
}
