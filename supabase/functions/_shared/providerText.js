export const PROVIDER_TEXT_RESPONSE_MODES = Object.freeze([
  "structured", "partial", "degraded",
]);
export const PROVIDER_TEXT_MAX_DISPLAY_CHARS = 320;

const PROVIDER_TEXT_MAX_INPUT_CHARS = 64 * 1024;
const SECRET_VALUE_PATTERN = /(?:sk-ant-[a-z0-9_-]{12,}|sbp_[a-z0-9_-]{12,}|(?:bearer\s+)[a-z0-9._~+\/-]{16,})/i;
const SECRET_ASSIGNMENT_PATTERN = /(?:authorization|x-api-key|api[_ -]?key|password|passwort|service[_ -]?role|secret|token)\s*[=:]\s*["']?[^\s"']{8,}/i;
const PRIVATE_REASONING_PATTERN = /(?:<\/?(?:thinking|system|developer|prompt)\b|chain[ -]of[ -]thought|system(?:-| )prompt|developer(?:-| )message)/i;
const SENSITIVE_KEYS = new Set([
  "apikey", "api_key", "authorization", "password", "passwort", "secret",
  "service_role", "system", "system_prompt", "prompt", "messages", "tools",
  "thinking", "redacted_thinking",
]);
const API_ENVELOPE_KEYS = new Set([
  "content", "id", "model", "role", "stop_reason", "stop_sequence", "type", "usage",
]);

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(value) {
  return String(value || "").trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function assertSafeObject(value, depth = 0) {
  if (depth > 8) throw new ProviderTextSafetyError();
  if (Array.isArray(value)) {
    for (const entry of value) assertSafeObject(entry, depth + 1);
    return;
  }
  if (!plain(value)) return;
  const keys = Object.keys(value);
  const normalized = keys.map(normalizedKey);
  if (normalized.some((key) => SENSITIVE_KEYS.has(key))) throw new ProviderTextSafetyError();
  if (depth === 0 && normalized.filter((key) => API_ENVELOPE_KEYS.has(key)).length >= 3) {
    throw new ProviderTextSafetyError();
  }
  for (const entry of Object.values(value)) assertSafeObject(entry, depth + 1);
}

function assertSafeText(value) {
  if (typeof value !== "string" || value.length > PROVIDER_TEXT_MAX_INPUT_CHARS
      || SECRET_VALUE_PATTERN.test(value) || SECRET_ASSIGNMENT_PATTERN.test(value)
      || PRIVATE_REASONING_PATTERN.test(value)) {
    throw new ProviderTextSafetyError();
  }
}

function parsedObjectAt(value, start) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth !== 0) continue;
      const source = value.slice(start, index + 1);
      try {
        const parsed = JSON.parse(source);
        if (plain(parsed)) return { parsed, source, end: index + 1 };
      } catch { /* Die naechste ausgeglichene Objektklammer darf noch passen. */ }
      return null;
    }
  }
  return null;
}

function firstJsonObject(value) {
  for (let start = value.indexOf("{"); start >= 0; start = value.indexOf("{", start + 1)) {
    const candidate = parsedObjectAt(value, start);
    if (candidate) return { ...candidate, start };
  }
  return null;
}

function displayText(value) {
  const cleaned = value
    .replace(/```(?:json)?/gi, " ")
    .replace(/```/g, " ")
    .replace(/https:\/\/\S+/gi, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[*_>#`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length <= PROVIDER_TEXT_MAX_DISPLAY_CHARS
    ? cleaned
    : `${cleaned.slice(0, PROVIDER_TEXT_MAX_DISPLAY_CHARS - 1).trimEnd()}…`;
}

export class ProviderTextSafetyError extends Error {
  constructor() {
    super("provider-text-unsafe");
    this.name = "ProviderTextSafetyError";
    this.code = "provider-text-unsafe";
  }
}

export function parseProviderLooseJsonText(value) {
  assertSafeText(value);
  const trimmed = value.trim();
  const found = firstJsonObject(trimmed);
  if (!found) {
    const safeDisplayText = displayText(trimmed);
    return Object.freeze({
      mode: "degraded",
      value: null,
      displayText: safeDisplayText,
      warnings: Object.freeze([
        "unstructured-provider-text",
        ...(safeDisplayText?.endsWith("…") ? ["display-text-truncated"] : []),
      ]),
    });
  }
  assertSafeObject(found.parsed);
  const exact = found.start === 0 && found.end === trimmed.length;
  return Object.freeze({
    mode: exact ? "structured" : "partial",
    value: found.parsed,
    displayText: null,
    warnings: Object.freeze(exact ? [] : ["json-extracted-from-text"]),
  });
}
