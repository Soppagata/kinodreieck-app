#!/usr/bin/env node
/* Key-Lebenszyklus fuer kd-api. Rohkeys entstehen lokal, liegen nur im
   macOS-Schluesselbund und werden nie als Argument, Log oder Ergebnis ausgegeben. */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const KD_API_KEYCHAIN_SERVICE = "at.kinodreieck.kd-api.access-v1";
export const KD_API_ADMIN_KEYCHAIN_SERVICE = "at.kinodreieck.supabase.admin";
export const KD_API_ADMIN_KEYCHAIN_ACCOUNT = "SUPABASE_SERVICE_ROLE_KEY";
const RECORD_VERSION = "kd-api-keychain-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const PROFILE = new Set(["personal_owner", "member"]);
const REASON = /^[A-Z][A-Z0-9_]{1,63}$/;
const SECURITY_TOKEN = /^[A-Za-z0-9._:-]+$/;
const META_KEYS = Object.freeze([
  "operationId", "accessId", "accountId", "assistantProfile", "permissions",
  "keyFingerprint", "keyEpoch", "createdAt", "expiresAt", "revokedAt",
]);

function safeSecurityError(action) {
  return new Error(`KEYCHAIN_${action}_FAILED`);
}

function readGenericCredential({ service, account, run, missing = false, errorCode }) {
  const result = run("/usr/bin/security", [
    "find-generic-password", "-s", service, "-a", account, "-w",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    if (missing) return null;
    throw new Error(errorCode);
  }
  return String(result.stdout || "").replace(/\r?\n$/, "");
}

function writeGenericCredential({ service, account, value, run, errorCode }) {
  if (!SECURITY_TOKEN.test(service) || !SECURITY_TOKEN.test(account)
      || typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) {
    throw new Error(errorCode);
  }
  const passwordHex = Buffer.from(value, "utf8").toString("hex");
  const result = run("/usr/bin/security", ["-i"], {
    input: `add-generic-password -U -s ${service} -a ${account} -X ${passwordHex}\n`,
    encoding: "utf8",
    stdio: ["pipe", "ignore", "ignore"],
  });
  if (result.status !== 0) throw new Error(errorCode);
  const stored = readGenericCredential({ service, account, run, errorCode });
  if (stored !== value) throw new Error(errorCode);
}

export function createMacKeychain({ run = spawnSync } = {}) {
  return Object.freeze({
    read(account, { missing = false } = {}) {
      return readGenericCredential({
        service: KD_API_KEYCHAIN_SERVICE,
        account,
        run,
        missing,
        errorCode: "KEYCHAIN_READ_FAILED",
      });
    },
    write(account, value) {
      writeGenericCredential({
        service: KD_API_KEYCHAIN_SERVICE,
        account,
        value,
        run,
        errorCode: "KEYCHAIN_WRITE_FAILED",
      });
    },
    delete(account, { missing = false } = {}) {
      const result = run("/usr/bin/security", [
        "delete-generic-password", "-s", KD_API_KEYCHAIN_SERVICE, "-a", account,
      ], { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
      if (result.status !== 0 && !missing) throw safeSecurityError("DELETE");
    },
  });
}

export function readAdminCredential({ run = spawnSync } = {}) {
  const credential = readGenericCredential({
    service: KD_API_ADMIN_KEYCHAIN_SERVICE,
    account: KD_API_ADMIN_KEYCHAIN_ACCOUNT,
    run,
    errorCode: "ADMIN_KEYCHAIN_READ_FAILED",
  });
  if (!credential) throw new Error("ADMIN_KEYCHAIN_EMPTY");
  return credential;
}

export function writeAdminCredential(credential, { run = spawnSync } = {}) {
  writeGenericCredential({
    service: KD_API_ADMIN_KEYCHAIN_SERVICE,
    account: KD_API_ADMIN_KEYCHAIN_ACCOUNT,
    value: credential,
    run,
    errorCode: "ADMIN_KEYCHAIN_WRITE_FAILED",
  });
}

function parseStored(raw, account) {
  let record;
  try { record = JSON.parse(raw); } catch { throw new Error(`KEYCHAIN_RECORD_INVALID: ${account}`); }
  if (!record || record.version !== RECORD_VERSION || record.alias !== account.split("::")[0]) {
    throw new Error(`KEYCHAIN_RECORD_INVALID: ${account}`);
  }
  return record;
}

function readStored(keychain, account) {
  const raw = keychain.read(account, { missing: true });
  return raw === null ? null : parseStored(raw, account);
}

function store(keychain, account, record) {
  keychain.write(account, JSON.stringify({ version: RECORD_VERSION, ...record }));
}

function digest(rawKey) {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

function fingerprint(rawKey) {
  return `kd_${digest(rawKey).slice(0, 16)}`;
}

function generateRawKey(random = randomBytes) {
  return `kd_v1_${random(32).toString("base64url")}`;
}

function parseOptions(argv) {
  if (argv.length === 0 || !["issue", "rotate", "revoke"].includes(argv[0])) {
    throw new Error("Aufruf: node tools/kd-api-keychain.mjs issue|rotate|revoke ...");
  }
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("KEYCHAIN_ARGUMENTS_INVALID");
    }
    const key = name.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`KEYCHAIN_ARGUMENT_DUPLICATE: ${name}`);
    options[key] = value;
  }
  const allowed = {
    issue: new Set(["base-url", "keychain-account", "account-id", "assistant-profile", "permissions", "operation-id", "expires-at", "label"]),
    rotate: new Set(["base-url", "keychain-account", "access-id", "expected-key-epoch", "operation-id"]),
    revoke: new Set(["base-url", "keychain-account", "access-id", "expected-key-epoch", "reason-code", "operation-id"]),
  }[command];
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`KEYCHAIN_ARGUMENT_UNKNOWN: --${key}`);
  return { command, options };
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new Error(`KEYCHAIN_ARGUMENT_REQUIRED: --${name}`);
  return value;
}

function parseBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("BASE_URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("BASE_URL_INVALID");
  if (url.pathname !== "/" && url.pathname !== "") throw new Error("BASE_URL_MUST_BE_SUPABASE_ORIGIN");
  return url.origin;
}

function parseEpoch(value) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new Error("EXPECTED_KEY_EPOCH_INVALID");
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch)) throw new Error("EXPECTED_KEY_EPOCH_INVALID");
  return epoch;
}

function operationId(value, uuid) {
  const id = value || uuid();
  if (!UUID.test(id)) throw new Error("OPERATION_ID_INVALID");
  return id.toLowerCase();
}

function parsePermissions(value) {
  const permissions = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (permissions.length === 0 || new Set(permissions).size !== permissions.length
      || permissions.some((entry) => !/^[a-z][a-z0-9.*_-]{0,63}$/.test(entry))) {
    throw new Error("PERMISSIONS_INVALID");
  }
  return permissions.sort();
}

function sameRequest(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactMetadata(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === META_KEYS.length
    && Object.keys(value).every((key) => META_KEYS.includes(key))
    && UUID.test(value.operationId || "") && UUID.test(value.accessId || "")
    && UUID.test(value.accountId || "") && PROFILE.has(value.assistantProfile)
    && Array.isArray(value.permissions) && value.permissions.every((entry) => typeof entry === "string")
    && /^kd_[a-f0-9]{16}$/.test(value.keyFingerprint || "")
    && Number.isSafeInteger(value.keyEpoch) && value.keyEpoch >= 0
    && typeof value.createdAt === "string"
    && (value.expiresAt === null || typeof value.expiresAt === "string")
    && (value.revokedAt === null || typeof value.revokedAt === "string");
}

async function callRpc({ baseUrl, rpcName, payload, credential, fetchImpl, timeoutMs = 20_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        apikey: credential,
        authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    const failure = new Error(error?.name === "AbortError" ? "KEY_LIFECYCLE_TIMEOUT" : "KEY_LIFECYCLE_TRANSPORT_UNKNOWN");
    failure.uncertain = true;
    throw failure;
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 300 && response.status < 400) throw new Error("KEY_LIFECYCLE_REDIRECT_REJECTED");
  if (response.status < 200 || response.status >= 300) throw new Error(`KEY_LIFECYCLE_HTTP_${response.status}`);
  let value;
  try { value = await response.json(); } catch { throw new Error("KEY_LIFECYCLE_RESPONSE_INVALID"); }
  if (!exactMetadata(value)) throw new Error("KEY_LIFECYCLE_METADATA_INVALID");
  return value;
}

async function mutateAndReadback(context) {
  const first = await callRpc(context);
  const second = await callRpc(context);
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("KEY_LIFECYCLE_READBACK_MISMATCH");
  return first;
}

function validateMetadata(metadata, request, rawKey, command) {
  if (metadata.operationId !== request.operationId) throw new Error("KEY_LIFECYCLE_OPERATION_MISMATCH");
  if (command === "issue" && metadata.accountId !== request.accountId) throw new Error("KEY_LIFECYCLE_ACCOUNT_MISMATCH");
  if (command !== "issue" && metadata.accessId !== request.accessId) throw new Error("KEY_LIFECYCLE_ACCESS_MISMATCH");
  if (rawKey && metadata.keyFingerprint !== fingerprint(rawKey)) throw new Error("KEY_LIFECYCLE_FINGERPRINT_MISMATCH");
  if (command === "revoke" && metadata.revokedAt === null) throw new Error("KEY_LIFECYCLE_REVOKE_UNCONFIRMED");
}

function rpcCall(command, request, rawKey) {
  if (command === "issue") return {
    rpcName: "kd_api_issue_access_v1",
    payload: {
      p_operation_id: request.operationId,
      p_account_id: request.accountId,
      p_assistant_profile: request.assistantProfile,
      p_permissions: request.permissions,
      p_key_digest: digest(rawKey),
      p_key_fingerprint: fingerprint(rawKey),
      p_expires_at: request.expiresAt,
      p_label: request.label,
    },
  };
  if (command === "rotate") return {
    rpcName: "kd_api_rotate_access_v1",
    payload: {
      p_operation_id: request.operationId,
      p_access_id: request.accessId,
      p_new_key_digest: digest(rawKey),
      p_new_key_fingerprint: fingerprint(rawKey),
      p_expected_key_epoch: request.expectedKeyEpoch,
    },
  };
  return {
    rpcName: "kd_api_revoke_access_v1",
    payload: {
      p_operation_id: request.operationId,
      p_access_id: request.accessId,
      p_expected_key_epoch: request.expectedKeyEpoch,
      p_reason_code: request.reasonCode,
    },
  };
}

export async function executeKeyLifecycle(argv, {
  keychain = createMacKeychain(),
  adminCredentialReader = () => readAdminCredential(),
  fetchImpl = globalThis.fetch,
  random = randomBytes,
  uuid = randomUUID,
} = {}) {
  const { command, options } = parseOptions(argv);
  const baseUrl = parseBaseUrl(required(options, "base-url"));
  const alias = required(options, "keychain-account");
  if (!ALIAS.test(alias)) throw new Error("KEYCHAIN_ACCOUNT_INVALID");
  const suppliedOperationId = options["operation-id"]?.toLowerCase();
  if (suppliedOperationId && !UUID.test(suppliedOperationId)) throw new Error("OPERATION_ID_INVALID");
  const activeAccount = alias;
  const pendingAccount = `${alias}::${command}-pending`;
  const tombstoneAccount = `${alias}::revoked`;
  let active = readStored(keychain, activeAccount);
  let pending = readStored(keychain, pendingAccount);
  const tombstone = command === "revoke" ? readStored(keychain, tombstoneAccount) : null;

  let request;
  if (command === "issue") {
    const accountId = required(options, "account-id").toLowerCase();
    if (!UUID.test(accountId)) throw new Error("ACCOUNT_ID_INVALID");
    const assistantProfile = required(options, "assistant-profile");
    if (!PROFILE.has(assistantProfile)) throw new Error("ASSISTANT_PROFILE_INVALID");
    const permissions = parsePermissions(required(options, "permissions"));
    if (assistantProfile === "member" && permissions.some((permission) => permission.startsWith("ai.") || permission.startsWith("diagnostics."))) {
      throw new Error("MEMBER_PERMISSION_FORBIDDEN");
    }
    const expiresAt = options["expires-at"] || null;
    if (expiresAt !== null && Number.isNaN(Date.parse(expiresAt))) throw new Error("EXPIRES_AT_INVALID");
    const label = options.label || null;
    if (label !== null && (label.length > 120 || /[\r\n]/.test(label))) throw new Error("LABEL_INVALID");
    const candidate = { operationId: operationId(suppliedOperationId || pending?.request?.operationId, uuid), accountId, assistantProfile, permissions, expiresAt, label };
    if (active) {
      if (!suppliedOperationId || active.request?.operationId !== suppliedOperationId || !sameRequest(active.request, candidate)) {
        throw new Error("KEYCHAIN_ACCOUNT_ALREADY_ISSUED");
      }
      pending = active;
    }
    request = candidate;
  } else {
    const accessId = required(options, "access-id").toLowerCase();
    if (!UUID.test(accessId)) throw new Error("ACCESS_ID_INVALID");
    const expectedKeyEpoch = parseEpoch(required(options, "expected-key-epoch"));
    if (command === "rotate") {
      request = { operationId: operationId(suppliedOperationId || pending?.request?.operationId, uuid), accessId, expectedKeyEpoch };
      if (!active) throw new Error("KEYCHAIN_ACTIVE_KEY_MISSING");
      if (suppliedOperationId && active.request?.operationId === suppliedOperationId) pending = active;
    } else {
      const reasonCode = required(options, "reason-code");
      if (!REASON.test(reasonCode)) throw new Error("REASON_CODE_INVALID");
      request = { operationId: operationId(suppliedOperationId || pending?.request?.operationId || tombstone?.request?.operationId, uuid), accessId, expectedKeyEpoch, reasonCode };
      if (!active && !(tombstone && suppliedOperationId && tombstone.request?.operationId === suppliedOperationId)) {
        throw new Error("KEYCHAIN_ACTIVE_KEY_MISSING");
      }
      if (!active && tombstone) pending = tombstone;
    }
  }

  if (pending && !sameRequest(pending.request, request)) throw new Error("KEYCHAIN_PENDING_OPERATION_MISMATCH");
  let rawKey = pending?.rawKey || null;
  if ((command === "issue" || command === "rotate") && !rawKey) rawKey = generateRawKey(random);
  if (!pending || pending === active || pending === tombstone) {
    store(keychain, pendingAccount, { alias, command, request, rawKey });
  }

  const credential = adminCredentialReader();
  const call = rpcCall(command, request, rawKey);
  let metadata;
  try {
    metadata = await mutateAndReadback({ baseUrl, ...call, credential, fetchImpl });
  } catch (error) {
    const wrapped = new Error(`${error?.message || "KEY_LIFECYCLE_FAILED"}; operationId=${request.operationId}; keychainService=${KD_API_KEYCHAIN_SERVICE}; keychainAccount=${alias}; denselben Befehl erneut verwenden`);
    wrapped.cause = error;
    throw wrapped;
  }
  validateMetadata(metadata, request, rawKey, command);

  if (command === "revoke") {
    store(keychain, tombstoneAccount, { alias, command, request, metadata });
    keychain.delete(activeAccount, { missing: true });
  } else {
    store(keychain, activeAccount, { alias, command, request, rawKey, metadata });
  }
  keychain.delete(pendingAccount, { missing: true });
  const { accountId: _privateAccountId, ...publicMetadata } = metadata;
  return Object.freeze({
    command,
    keychainService: KD_API_KEYCHAIN_SERVICE,
    keychainAccount: alias,
    keychainEnvelopeVersion: RECORD_VERSION,
    ...publicMetadata,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    console.log(JSON.stringify(await executeKeyLifecycle(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}
