import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const KD_API_KEYCHAIN_SERVICE = "at.kinodreieck.kd-api.access-v1";
const KEYCHAIN_RECORD_VERSION = "kd-api-keychain-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const RAW_KEY = /^kd_v1_[A-Za-z0-9_-]{43}$/;
const ACTIVE_COMMANDS = new Set(["issue", "rotate"]);
const ACTIVE_METADATA_KEYS = Object.freeze([
  "operationId", "accessId", "accountId", "assistantProfile", "permissions",
  "keyFingerprint", "keyEpoch", "createdAt", "expiresAt", "revokedAt",
]);

function clean(value) {
  const key = String(value || "").trim();
  if (!key) throw new Error("KD API key is empty.");
  return key;
}

async function fromFile(path) {
  const info = await stat(path);
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    throw new Error("KD_API_KEY_FILE must be readable only by its owner (mode 0600 or stricter).");
  }
  return clean(await readFile(path, "utf8"));
}

async function fromMacKeychain(service, account) {
  if (process.platform !== "darwin") throw new Error("macOS Keychain lookup is available only on macOS.");
  try {
    const { stdout } = await execFileAsync("/usr/bin/security", [
      "find-generic-password", "-w", "-s", service, "-a", account,
    ], { encoding: "utf8", maxBuffer: 64 * 1024 });
    return clean(stdout);
  } catch {
    throw new Error("KD_API_KEYCHAIN_READ_FAILED");
  }
}

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function fingerprint(rawKey) {
  return `kd_${createHash("sha256").update(rawKey, "utf8").digest("hex").slice(0, 16)}`;
}

function failRecord() {
  throw new Error("KD_API_KEYCHAIN_ACTIVE_RECORD_INVALID");
}

function validateRequest(record) {
  const request = record.request;
  if (!plain(request) || !UUID.test(request.operationId || "")) failRecord();
  if (record.command === "issue") {
    const keys = ["operationId", "accountId", "assistantProfile", "permissions", "expiresAt", "label"];
    if (!exactKeys(request, keys) || !UUID.test(request.accountId || "")
      || !["personal_owner", "member"].includes(request.assistantProfile)
      || !Array.isArray(request.permissions) || new Set(request.permissions).size !== request.permissions.length
      || request.permissions.some((permission) => typeof permission !== "string" || !/^[a-z][a-z0-9.*_-]{0,63}$/.test(permission))
      || (request.expiresAt !== null && !validTimestamp(request.expiresAt))
      || (request.label !== null && (typeof request.label !== "string" || request.label.length > 120))) failRecord();
  } else {
    const keys = ["operationId", "accessId", "expectedKeyEpoch"];
    if (!exactKeys(request, keys) || !UUID.test(request.accessId || "")
      || !Number.isSafeInteger(request.expectedKeyEpoch) || request.expectedKeyEpoch < 0) failRecord();
  }
}

function validateMetadata(record, now) {
  const metadata = record.metadata;
  if (!exactKeys(metadata, ACTIVE_METADATA_KEYS)
    || !UUID.test(metadata.operationId || "") || !UUID.test(metadata.accessId || "")
    || !UUID.test(metadata.accountId || "")
    || !["personal_owner", "member"].includes(metadata.assistantProfile)
    || !Array.isArray(metadata.permissions) || new Set(metadata.permissions).size !== metadata.permissions.length
    || metadata.permissions.some((permission) => typeof permission !== "string" || !/^[a-z][a-z0-9.*_-]{0,63}$/.test(permission))
    || !/^kd_[a-f0-9]{16}$/.test(metadata.keyFingerprint || "")
    || !Number.isSafeInteger(metadata.keyEpoch) || metadata.keyEpoch < 0
    || !validTimestamp(metadata.createdAt)
    || (metadata.expiresAt !== null && (!validTimestamp(metadata.expiresAt) || Date.parse(metadata.expiresAt) <= now))
    || metadata.revokedAt !== null
    || metadata.operationId !== record.request.operationId
    || metadata.keyFingerprint !== fingerprint(record.rawKey)
    || (record.command === "issue" && (metadata.accountId !== record.request.accountId
      || metadata.assistantProfile !== record.request.assistantProfile
      || JSON.stringify(metadata.permissions) !== JSON.stringify(record.request.permissions)))
    || (record.command === "rotate" && (metadata.accessId !== record.request.accessId
      || metadata.keyEpoch !== record.request.expectedKeyEpoch + 1))) failRecord();
  if (metadata.assistantProfile === "member"
    && metadata.permissions.some((permission) => permission.startsWith("ai.") || permission.startsWith("diagnostics."))) failRecord();
}

export function projectKeychainCredential(value, { alias, now = Date.now() } = {}) {
  const raw = clean(value);
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    if (/^[{[\"]/.test(raw)) failRecord();
    return raw;
  }
  const allowedKeys = ["version", "service", "alias", "command", "request", "rawKey", "metadata"];
  const keys = Object.keys(record || {});
  if (!plain(record) || ![6, 7].includes(keys.length)
    || keys.some((key) => !allowedKeys.includes(key))
    || record.version !== KEYCHAIN_RECORD_VERSION
    || (Object.hasOwn(record, "service") && record.service !== KD_API_KEYCHAIN_SERVICE)
    || !ALIAS.test(alias || "") || record.alias !== alias
    || !ACTIVE_COMMANDS.has(record.command) || !RAW_KEY.test(record.rawKey || "")) failRecord();
  validateRequest(record);
  validateMetadata(record, now);
  return record.rawKey;
}

export function createCredentialProvider(env = process.env, { keychainRead = fromMacKeychain, now = () => Date.now() } = {}) {
  const direct = env.KD_API_KEY;
  const file = env.KD_API_KEY_FILE;
  const service = env.KD_API_KEYCHAIN_SERVICE;
  const account = env.KD_API_KEYCHAIN_ACCOUNT;
  const configured = [Boolean(direct), Boolean(file), Boolean(service || account)].filter(Boolean).length;
  if (configured !== 1) {
    throw new Error("Configure exactly one credential source: KD_API_KEY, KD_API_KEY_FILE, or both KD_API_KEYCHAIN_SERVICE and KD_API_KEYCHAIN_ACCOUNT.");
  }
  if ((service && !account) || (!service && account)) throw new Error("Keychain service and account must be configured together.");
  if (direct) return async () => clean(direct);
  if (file) return async () => fromFile(file);
  if (service !== KD_API_KEYCHAIN_SERVICE) throw new Error("KD_API_KEYCHAIN_SERVICE_INVALID");
  if (!ALIAS.test(account) || /::(?:issue-pending|rotate-pending|revoke-pending|revoked)$/.test(account)) {
    throw new Error("KD_API_KEYCHAIN_ACCOUNT_INACTIVE");
  }
  return async () => projectKeychainCredential(await keychainRead(service, account), { alias: account, now: now() });
}
