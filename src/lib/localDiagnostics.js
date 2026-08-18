import { runtimeConfig } from "../config/runtime.js";

export const LOCAL_DIAGNOSTICS_VERSION = 1;
export const LOCAL_DIAGNOSTICS_MAX_ENTRIES = 20;
export const LOCAL_DIAGNOSTICS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCAL_DIAGNOSTICS_DEDUPE_MS = 15 * 60 * 1000;
export const LOCAL_DIAGNOSTICS_KEY = "kd:local-diagnostics:v1";
export const LOCAL_DIAGNOSTICS_ENABLED_KEY = "kd:local-diagnostics-enabled:v1";

export const DIAGNOSTIC_ERROR_CODES = Object.freeze(["UI_RENDER_CRASH"]);
export const DIAGNOSTIC_SOURCES = Object.freeze(["APP_ERROR_BOUNDARY"]);
export const DIAGNOSTIC_OPERATIONS = Object.freeze(["RENDER"]);

const CODE_SET = new Set(DIAGNOSTIC_ERROR_CODES);
const SOURCE_SET = new Set(DIAGNOSTIC_SOURCES);
const OPERATION_SET = new Set(DIAGNOSTIC_OPERATIONS);
const ENVIRONMENTS = new Set(["local", "staging", "production"]);
const PLATFORM_CLASSES = new Set(["mobile", "tablet", "desktop", "unknown"]);
const RUNTIME_MODES = new Set(["browser", "pwa", "single-file"]);
const INPUT_FIELDS = new Set(["code", "source", "operation", "reference"]);
const ENVELOPE_FIELDS = Object.freeze([
  "version", "code", "source", "operation", "buildVersion", "environment",
  "platformClass", "runtimeMode", "online", "timestamp", "reference", "count",
]);
const WRAPPER_FIELDS = new Set(["format", "version", "entries"]);
const REFERENCE_PATTERN = /^KD-DIAG-[A-F0-9]{16}$/;
const BUILD_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const MAX_COUNT = 9999;

function objectWithExactFields(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.size
    && keys.every((key) => typeof key === "string" && fields.has(key));
}

function storageFrom(options = {}) {
  if (options.storage) return options.storage;
  try { return globalThis.localStorage || null; }
  catch { return null; }
}

function remove(storage, key) {
  if (!storage?.removeItem) return false;
  try {
    storage.removeItem(key);
    return !storage.getItem || storage.getItem(key) == null;
  } catch { return false; }
}

function write(storage, key, value) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(key, value);
    return !storage.getItem || storage.getItem(key) === value;
  } catch { return false; }
}

function timestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  try { return new Date(parsed).toISOString() === value ? parsed : null; }
  catch { return null; }
}

function safeNow(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const parsed = new Date(numeric).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function safeBuildVersion(value) {
  const normalized = String(value || "").trim();
  return BUILD_PATTERN.test(normalized) ? normalized : "unknown";
}

function platformClass(navigatorObject) {
  if (navigatorObject?.userAgentData?.mobile === true) return "mobile";
  const userAgent = String(navigatorObject?.userAgent || "");
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/iphone|ipod|android|mobile/i.test(userAgent)) return "mobile";
  return userAgent ? "desktop" : "unknown";
}

function runtimeMode({ navigatorObject, locationObject, matchMedia }) {
  if (String(locationObject?.protocol || "").toLowerCase() === "file:") return "single-file";
  let standalone = navigatorObject?.standalone === true;
  try { standalone ||= matchMedia?.("(display-mode: standalone)")?.matches === true; }
  catch { /* Die grobe Laufzeitklasse bleibt im Zweifel Browser. */ }
  return standalone ? "pwa" : "browser";
}

export function createDiagnosticReference(options = {}) {
  const cryptoObject = options.cryptoObject || globalThis.crypto;
  try {
    const hex = String(cryptoObject?.randomUUID?.() || "")
      .replace(/[^a-f0-9]/gi, "")
      .toUpperCase();
    if (hex.length >= 16) return `KD-DIAG-${hex.slice(0, 16)}`;
  } catch { /* Fallback bleibt zufällig und accountfrei. */ }
  const random = typeof options.random === "function" ? options.random : Math.random;
  let hex = "";
  for (let index = 0; index < 16; index += 1) {
    const value = Number(random());
    hex += Math.min(15, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * 16))).toString(16);
  }
  return `KD-DIAG-${hex.toUpperCase()}`;
}

export function createLocalDiagnosticEnvelope(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Reflect.ownKeys(input);
  if (keys.length < 3 || keys.length > 4
      || !keys.every((key) => typeof key === "string" && INPUT_FIELDS.has(key))) return null;
  if (!Object.prototype.hasOwnProperty.call(input, "code")
      || !Object.prototype.hasOwnProperty.call(input, "source")
      || !Object.prototype.hasOwnProperty.call(input, "operation")
      || !CODE_SET.has(input.code)
      || !SOURCE_SET.has(input.source)
      || !OPERATION_SET.has(input.operation)) return null;

  const reference = Object.prototype.hasOwnProperty.call(input, "reference")
    ? input.reference
    : createDiagnosticReference(options);
  if (typeof reference !== "string" || !REFERENCE_PATTERN.test(reference)) return null;

  const now = safeNow(options.now);
  const config = options.config || runtimeConfig;
  const navigatorObject = options.navigatorObject || globalThis.navigator;
  const locationObject = options.locationObject || globalThis.location;
  const environment = ENVIRONMENTS.has(config?.appEnvironment) ? config.appEnvironment : "local";
  return Object.freeze({
    version: LOCAL_DIAGNOSTICS_VERSION,
    code: input.code,
    source: input.source,
    operation: input.operation,
    buildVersion: safeBuildVersion(config?.buildVersion),
    environment,
    platformClass: platformClass(navigatorObject),
    runtimeMode: runtimeMode({
      navigatorObject,
      locationObject,
      matchMedia: options.matchMedia || globalThis.matchMedia,
    }),
    online: navigatorObject?.onLine !== false,
    timestamp: new Date(now).toISOString(),
    reference,
    count: 1,
  });
}

export function validateLocalDiagnosticEnvelope(value) {
  if (!objectWithExactFields(value, new Set(ENVELOPE_FIELDS))) return false;
  return value.version === LOCAL_DIAGNOSTICS_VERSION
    && CODE_SET.has(value.code)
    && SOURCE_SET.has(value.source)
    && OPERATION_SET.has(value.operation)
    && typeof value.buildVersion === "string"
    && BUILD_PATTERN.test(value.buildVersion)
    && ENVIRONMENTS.has(value.environment)
    && PLATFORM_CLASSES.has(value.platformClass)
    && RUNTIME_MODES.has(value.runtimeMode)
    && typeof value.online === "boolean"
    && timestamp(value.timestamp) != null
    && typeof value.reference === "string"
    && REFERENCE_PATTERN.test(value.reference)
    && Number.isInteger(value.count)
    && value.count >= 1
    && value.count <= MAX_COUNT;
}

export function sanitizeLocalDiagnosticEntries(entries, options = {}) {
  if (!Array.isArray(entries)) return Object.freeze([]);
  const now = safeNow(options.now);
  const valid = entries.filter((entry) => {
    if (!validateLocalDiagnosticEnvelope(entry)) return false;
    const created = timestamp(entry.timestamp);
    return created <= now && now - created < LOCAL_DIAGNOSTICS_TTL_MS;
  }).slice(-LOCAL_DIAGNOSTICS_MAX_ENTRIES).map((entry) => Object.freeze({ ...entry }));
  return Object.freeze(valid);
}

function wrapper(entries) {
  return { format: "kinodreieck-local-diagnostics", version: LOCAL_DIAGNOSTICS_VERSION, entries };
}

function validWrapper(value) {
  return objectWithExactFields(value, WRAPPER_FIELDS)
    && value.format === "kinodreieck-local-diagnostics"
    && value.version === LOCAL_DIAGNOSTICS_VERSION
    && Array.isArray(value.entries);
}

export function purgeLocalDiagnostics(options = {}) {
  const storage = storageFrom(options);
  const result = { entries: Object.freeze([]), removed: false, pruned: 0 };
  if (!storage?.getItem) return result;
  let raw;
  try { raw = storage.getItem(LOCAL_DIAGNOSTICS_KEY); }
  catch { return result; }
  if (raw == null) return result;
  let stored;
  try { stored = JSON.parse(raw); }
  catch {
    result.removed = remove(storage, LOCAL_DIAGNOSTICS_KEY);
    return result;
  }
  if (!validWrapper(stored)) {
    result.removed = remove(storage, LOCAL_DIAGNOSTICS_KEY);
    return result;
  }
  const entries = sanitizeLocalDiagnosticEntries(stored.entries, { now: options.now });
  result.entries = entries;
  result.pruned = stored.entries.length - entries.length;
  if (!entries.length) {
    result.removed = remove(storage, LOCAL_DIAGNOSTICS_KEY);
    return result;
  }
  const cleaned = JSON.stringify(wrapper(entries));
  if (cleaned !== raw) write(storage, LOCAL_DIAGNOSTICS_KEY, cleaned);
  return result;
}

export function readLocalDiagnostics(options = {}) {
  if (options.ownerConfirmed !== true) return Object.freeze([]);
  return purgeLocalDiagnostics(options).entries;
}

export function localDiagnosticsEnabled(options = {}) {
  if (options.ownerConfirmed !== true) return false;
  const storage = storageFrom(options);
  if (!storage?.getItem) return false;
  let value;
  try { value = storage.getItem(LOCAL_DIAGNOSTICS_ENABLED_KEY); }
  catch { return false; }
  if (value === "1") return true;
  if (value != null) remove(storage, LOCAL_DIAGNOSTICS_ENABLED_KEY);
  return false;
}

export function setLocalDiagnosticsEnabled(enabled, options = {}) {
  if (options.ownerConfirmed !== true) return false;
  const storage = storageFrom(options);
  if (!storage) return false;
  if (enabled === true) return write(storage, LOCAL_DIAGNOSTICS_ENABLED_KEY, "1");
  if (enabled === false) return remove(storage, LOCAL_DIAGNOSTICS_ENABLED_KEY);
  return false;
}

export function clearLocalDiagnostics(options = {}) {
  if (options.ownerConfirmed !== true) return false;
  return remove(storageFrom(options), LOCAL_DIAGNOSTICS_KEY);
}

function sameFingerprint(left, right) {
  return left.version === right.version
    && left.code === right.code
    && left.source === right.source
    && left.operation === right.operation
    && left.buildVersion === right.buildVersion
    && left.environment === right.environment
    && left.platformClass === right.platformClass
    && left.runtimeMode === right.runtimeMode
    && left.online === right.online;
}

export function recordLocalDiagnostic(input, options = {}) {
  if (options.ownerConfirmed !== true || !localDiagnosticsEnabled(options)) return null;
  const entry = createLocalDiagnosticEnvelope(input, options);
  if (!entry) return null;
  const storage = storageFrom(options);
  if (!storage) return null;
  const entries = [...purgeLocalDiagnostics(options).entries];
  const entryTime = timestamp(entry.timestamp);
  let duplicateIndex = -1;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const candidateTime = timestamp(entries[index].timestamp);
    const distance = entryTime - candidateTime;
    if (distance >= 0 && distance < LOCAL_DIAGNOSTICS_DEDUPE_MS
        && sameFingerprint(entries[index], entry)) {
      duplicateIndex = index;
      break;
    }
  }
  let saved = entry;
  if (duplicateIndex >= 0) {
    const previous = entries.splice(duplicateIndex, 1)[0];
    saved = Object.freeze({ ...entry, count: Math.min(MAX_COUNT, previous.count + 1) });
  }
  entries.push(saved);
  const bounded = entries.slice(-LOCAL_DIAGNOSTICS_MAX_ENTRIES);
  if (!write(storage, LOCAL_DIAGNOSTICS_KEY, JSON.stringify(wrapper(bounded)))) return null;
  return saved;
}

/* Späterer DB-Ingestion-Haken: Ohne bestätigte Ownerrolle, separate
   Servercapability, default-off Flag UND injizierten Adapter wird niemals ein
   Transport aufgerufen. Der Vertrag kennt weder Endpoint noch Mail und führt
   genau einen Versuch ohne Retry aus. */
export async function sendLocalDiagnosticsOnce({
  ownerConfirmed = false,
  serverCapabilityConfirmed = false,
  featureFlagEnabled = false,
  diagnostics = [],
  transport = null,
  now = Date.now(),
} = {}) {
  if (ownerConfirmed !== true || serverCapabilityConfirmed !== true
      || featureFlagEnabled !== true || typeof transport !== "function") {
    return Object.freeze({ status: "disabled", sent: false, count: 0 });
  }
  const entries = sanitizeLocalDiagnosticEntries(diagnostics, { now });
  if (!entries.length) return Object.freeze({ status: "empty", sent: false, count: 0 });
  const payload = Object.freeze({
    format: "kinodreieck-diagnostic-ingest",
    version: 1,
    createdAt: new Date(safeNow(now)).toISOString(),
    diagnostics: entries,
  });
  try {
    await transport(payload);
    return Object.freeze({ status: "sent", sent: true, count: entries.length });
  } catch {
    return Object.freeze({ status: "failed", sent: false, count: 0 });
  }
}
