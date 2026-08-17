#!/usr/bin/env node

/*
 * E17B Wave A: ausschließlich fail-closed Vertrags-, Evidence-, Argv- und
 * Protokollprimitives. Dieses Modul enthält keinen Prozess-, Fetch-, Keychain-,
 * Remote- oder Default-Executorpfad.
 */

import { createHash, randomBytes as secureRandomBytes } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder as NodeTextDecoder, types as utilTypes } from "node:util";

// Intrinsics werden einmal beim Laden gebunden. Untrusted Werte werden trotzdem
// stets zuerst per isProxy und Own-Deskriptoren eingegrenzt, bevor einer dieser
// Typ-/Internal-Slot-Checks sie beruehrt.
const intrinsicIsProxy = utilTypes.isProxy;
const intrinsicIsUint8Array = utilTypes.isUint8Array;
const intrinsicIsNativeError = utilTypes.isNativeError;
const intrinsicArrayIsArray = Array.isArray;
const intrinsicBufferIsBuffer = Buffer.isBuffer;
const intrinsicBufferFrom = Buffer.from;
const intrinsicBufferEquals = Buffer.prototype.equals;
const intrinsicGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const intrinsicGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const intrinsicGetPrototypeOf = Object.getPrototypeOf;
const intrinsicObjectHasOwn = Object.hasOwn;
const intrinsicOwnKeys = Reflect.ownKeys;
const intrinsicReflectApply = Reflect.apply;
const intrinsicWeakSetHas = WeakSet.prototype.has;
const intrinsicWeakSetAdd = WeakSet.prototype.add;
const intrinsicWeakMapGet = WeakMap.prototype.get;
const intrinsicWeakMapSet = WeakMap.prototype.set;
const intrinsicSetHas = Set.prototype.has;
const intrinsicSetAdd = Set.prototype.add;
const intrinsicMapGet = Map.prototype.get;
const intrinsicJsonStringify = JSON.stringify;
const intrinsicJsonParse = JSON.parse;
const intrinsicArraySome = Array.prototype.some;
const intrinsicArrayMap = Array.prototype.map;
const intrinsicArrayFilter = Array.prototype.filter;
const intrinsicArrayEvery = Array.prototype.every;
const intrinsicArrayIncludes = Array.prototype.includes;
const intrinsicArraySlice = Array.prototype.slice;
const intrinsicArraySort = Array.prototype.sort;
const intrinsicArrayPush = Array.prototype.push;
const intrinsicStringTrim = String.prototype.trim;
const intrinsicStringSplit = String.prototype.split;
const intrinsicStringStartsWith = String.prototype.startsWith;
const intrinsicStringEndsWith = String.prototype.endsWith;
const intrinsicStringIncludes = String.prototype.includes;
const intrinsicStringReplace = String.prototype.replace;
const intrinsicStringMatch = String.prototype.match;
const intrinsicStringCharCodeAt = String.prototype.charCodeAt;
const intrinsicRegExpTest = RegExp.prototype.test;
const intrinsicRegExp = RegExp;
const intrinsicTextDecoderDecode = NodeTextDecoder.prototype.decode;
const intrinsicUtf8Decoder = new NodeTextDecoder("utf-8", { fatal: true });
const intrinsicUint8Array = Uint8Array;
const intrinsicArrayPrototype = Array.prototype;
const intrinsicObjectPrototype = Object.prototype;
const intrinsicErrorPrototype = Error.prototype;
const intrinsicBufferPrototype = Buffer.prototype;
const intrinsicUint8ArrayPrototype = Uint8Array.prototype;
const intrinsicTypedArrayPrototype = intrinsicGetPrototypeOf(intrinsicUint8ArrayPrototype);
const intrinsicByteBufferGetter = intrinsicGetOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  "buffer",
).get;
const intrinsicByteOffsetGetter = intrinsicGetOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  "byteOffset",
).get;
const intrinsicByteLengthGetter = intrinsicGetOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  "byteLength",
).get;

function intrinsicSnapshot(target, key) {
  const descriptor = intrinsicGetOwnPropertyDescriptor(target, key);
  return Object.freeze({
    target,
    key,
    value: descriptor?.value,
    get: descriptor?.get,
    set: descriptor?.set,
    enumerable: descriptor?.enumerable,
    configurable: descriptor?.configurable,
    writable: descriptor?.writable,
  });
}

const SECURITY_INTRINSIC_SNAPSHOTS = Object.freeze([
  intrinsicSnapshot(WeakSet.prototype, "has"),
  intrinsicSnapshot(WeakSet.prototype, "add"),
  intrinsicSnapshot(WeakMap.prototype, "get"),
  intrinsicSnapshot(WeakMap.prototype, "set"),
  intrinsicSnapshot(Set.prototype, "has"),
  intrinsicSnapshot(Set.prototype, "add"),
  intrinsicSnapshot(Set.prototype, "size"),
  intrinsicSnapshot(Map.prototype, "get"),
  intrinsicSnapshot(Array, "isArray"),
  intrinsicSnapshot(Array.prototype, "some"),
  intrinsicSnapshot(Array.prototype, "map"),
  intrinsicSnapshot(Array.prototype, "filter"),
  intrinsicSnapshot(Array.prototype, "every"),
  intrinsicSnapshot(Array.prototype, "includes"),
  intrinsicSnapshot(Array.prototype, "slice"),
  intrinsicSnapshot(Array.prototype, "sort"),
  intrinsicSnapshot(Array.prototype, "push"),
  intrinsicSnapshot(Object, "hasOwn"),
  intrinsicSnapshot(Buffer, "from"),
  intrinsicSnapshot(Buffer, "isBuffer"),
  intrinsicSnapshot(Buffer.prototype, "equals"),
  intrinsicSnapshot(JSON, "parse"),
  intrinsicSnapshot(JSON, "stringify"),
  intrinsicSnapshot(RegExp.prototype, "test"),
  intrinsicSnapshot(String.prototype, "trim"),
  intrinsicSnapshot(String.prototype, "split"),
  intrinsicSnapshot(String.prototype, "startsWith"),
  intrinsicSnapshot(String.prototype, "endsWith"),
  intrinsicSnapshot(String.prototype, "includes"),
  intrinsicSnapshot(String.prototype, "replace"),
  intrinsicSnapshot(String.prototype, "match"),
  intrinsicSnapshot(String.prototype, "charCodeAt"),
  intrinsicSnapshot(NodeTextDecoder.prototype, "decode"),
]);

function assertSecurityRuntimeIntegrity() {
  for (let index = 0; index < SECURITY_INTRINSIC_SNAPSHOTS.length; index += 1) {
    const expected = SECURITY_INTRINSIC_SNAPSHOTS[index];
    const current = intrinsicGetOwnPropertyDescriptor(expected.target, expected.key);
    if (!current
        || current.value !== expected.value
        || current.get !== expected.get
        || current.set !== expected.set
        || current.enumerable !== expected.enumerable
        || current.configurable !== expected.configurable
        || current.writable !== expected.writable) {
      stop("RUNTIME_INTRINSIC_DRIFT", "Sicherheitsrelevante JavaScript-Intrinsics wurden verändert.");
    }
  }
}

function weakSetHas(set, value) {
  return intrinsicReflectApply(intrinsicWeakSetHas, set, [value]);
}

function weakSetAdd(set, value) {
  intrinsicReflectApply(intrinsicWeakSetAdd, set, [value]);
  return value;
}

function setHas(set, value) {
  return intrinsicReflectApply(intrinsicSetHas, set, [value]);
}

export const PROJECT_ID = "bscjgwcntapobyxsiyce";
export const FUNCTION_NAME = "ai-task";
export const TARGET_ID = `supabase:${PROJECT_ID}`;
export const TARGET_BRANCH = "codex/e17b-bloganalyse-remote";
export const ALLOWED_REMOTE_REF = "refs/heads/codex/e17b-bloganalyse-remote";
export const E17A_BASELINE = "e580341a307feac1543e5fb60efa00d263485848";
export const MIGRATION_PATH =
  "supabase/migrations/20260817120000_blog_profile_extract_config.sql";
export const MIGRATION_VERSION = "20260817120000";
export const LEDGER_NAME = "blog_profile_extract_config";
export const PREVIOUS_LEDGER_VERSION = "20260816010000";
export const REMOTE_PAYLOAD_PENDING = "REMOTE_PAYLOAD_PENDING";
export const EVIDENCE_SCHEMA = "kinodreieck-e17b-remote-window-v4";
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const THREAT_BOUNDARY = Object.freeze({
  protectsAgainst: Object.freeze([
    "operator-mistake",
    "cross-run-replay",
    "input-substitution",
    "symlink-mode-target-drift",
  ]),
  doesNotProtectAgainst: "malicious-process-same-macos-uid",
  persistedEvidence: "untrusted-transcript",
  authorizationPersistence: "forbidden",
});

export const RUNTIME_SINK_REQUIREMENTS = Object.freeze({
  "supabase-token-child": Object.freeze([
    "FreshGitContext", "RuntimeSecretContext",
  ]),
  "pg-password-child": Object.freeze([
    "FreshGitContext", "FreshRemotePgTarget", "RuntimeSecretContext",
  ]),
  "function-mutation": Object.freeze([
    "FreshGitContext", "FreshRemoteGit", "FreshRemotePgTarget", "FreshFunctionPreimage",
    "VerifiedOwnerAuthorization", "RuntimeSecretContext",
  ]),
  "db-mutation": Object.freeze([
    "FreshGitContext", "FreshRemoteGit", "FreshRemoteTarget", "FreshDbPreimage",
    "VerifiedOwnerAuthorization", "RuntimeSecretContext", "SecretProof",
    "CanonicalProof", "Pg17ToolchainClosure", "ExactMutationManifest",
  ]),
});

export const EXPECTED_SOURCE_SHA256 =
  "f3435b5be6cd274a9b84498ad744d11899ebe5043d537de72dd1e3bf237c828b";
export const EXPECTED_CONFIG_SHA256 =
  "d051796a827474deb407de73f75b6587b658433f393b7f94b699ad6bdeb1fa79";
export const EXPECTED_DEPLOY_CONTRACT_SHA256 =
  "fca05ffd23050bb33b679528401fe5e06b2e51d3a37c5f09a0bec229753bfe5b";
export const EXPECTED_MIGRATION_SHA256 =
  "887253d3323c059fd286bf3e66cae3f167cba4396e89e8f867baa7de42465134";
export const EXPECTED_MIGRATION_TRANSACTION_SHA256 =
  "3fdeb860fe21710583fa3d30bf11800761ef4aca0ef94395c650f81185546421";
export const EXPECTED_LEDGER_HISTORY_SHA256 =
  "c99f0c25f727064a6e3bc5d471ace296bb506818c234fb479c5de5fffc2bf17d";

export const MODES = Object.freeze([
  "local-contract",
  "read-preflight",
  "backup-restore",
  "function-release",
  "db-apply",
  "postflight",
  "cleanup-local",
]);

export const EVIDENCE_ROLES = Object.freeze([
  "00-contract",
  "10-read-preflight",
  "11-function-preimage",
  "12-db-preimage",
  "20-backup-manifest",
  "21-restore-proof",
  "22-canonical-detail",
  "23-canonical-detail",
  "30-function-checkpoint",
  "31-function-apply",
  "32-function-postflight",
  "40-db-checkpoint",
  "41-db-apply",
  "42-db-postflight",
  "90-remote-delta",
  "91-rollback-plan",
  "98-credential-cleanup",
  "99-final-checkpoint",
]);

export const ROLE_MODES = Object.freeze({
  "00-contract": Object.freeze(["local-contract"]),
  "10-read-preflight": Object.freeze(["read-preflight"]),
  "11-function-preimage": Object.freeze(["read-preflight"]),
  "12-db-preimage": Object.freeze(["read-preflight"]),
  "20-backup-manifest": Object.freeze(["backup-restore"]),
  "21-restore-proof": Object.freeze(["backup-restore"]),
  "22-canonical-detail": Object.freeze(["backup-restore"]),
  "23-canonical-detail": Object.freeze(["backup-restore"]),
  "30-function-checkpoint": Object.freeze(["function-release"]),
  "31-function-apply": Object.freeze(["function-release"]),
  "32-function-postflight": Object.freeze(["function-release"]),
  "40-db-checkpoint": Object.freeze(["db-apply"]),
  "41-db-apply": Object.freeze(["db-apply"]),
  "42-db-postflight": Object.freeze(["postflight"]),
  "90-remote-delta": Object.freeze(["postflight"]),
  "91-rollback-plan": Object.freeze(["postflight"]),
  "98-credential-cleanup": Object.freeze(["cleanup-local"]),
  "99-final-checkpoint": Object.freeze(["cleanup-local"]),
});

export const GREEN_ROLE_CHAIN = EVIDENCE_ROLES;

export const FUNCTION_SOURCES = Object.freeze([
  "supabase/functions/ai-task/index.ts",
  "supabase/functions/ai-task/providerContract.ts",
  "supabase/functions/ai-task/requestContract.ts",
  "supabase/functions/filmwissen-task/quellen.ts",
  "supabase/functions/filmwissen-task/vertrag.ts",
]);
export const FUNCTION_CONFIG = "supabase/config.toml";

export const OWNER_FLAGS = Object.freeze({
  "function-release": "--owner-approved-function-release",
  "db-apply": "--owner-approved-db-apply",
});

export const INFRA_KEYCHAIN = Object.freeze({
  service: `at.kinodreieck.codex.supabase.${PROJECT_ID}`,
  accessTokenAccount: "SUPABASE_ACCESS_TOKEN",
  databasePasswordAccount: "DB_POSTGRES_PASSWORD",
});
export const HEALTH_KEYCHAIN = Object.freeze({
  service: "at.kinodreieck.codex.live-tests.shared",
  account: "KD_TESTA_PASS",
});

export const CHILD_TIMEOUT_MS = 135_000;
export const CHILD_MAX_BUFFER = 512 * 1024;
export const SUPABASE_CLI_VERSION = "2.109.1";
export const SUPABASE_CLI_INTEGRITY =
  "sha512-N2yP2MHTxOxXBWhfn3poudpJn4pkPosAUo7J/46FTou/l7wOwFi9tox8NSN6HljWkfM0zhwPRimNNGC9XBMoxQ==";
export const SUPABASE_PLATFORM_PACKAGE = "@supabase/cli-darwin-arm64";
export const SUPABASE_PLATFORM_INTEGRITY =
  "sha512-tkn8tfunyqIL7RE+7DVjg6Ql2cJLPkGgh9cPafp2LbXI0qDgds0TaS+UOTHQEjci8JQXXe2wS00+122ko2QI8A==";
export const SUPABASE_PLATFORM_SHA256 =
  "b7be23f4e211b75c00a3df5fcd1f96f3905983c74ff3189bfc69ad5b0f7132c4";
export const PG17_BASES = Object.freeze([
  "/opt/homebrew/opt/postgresql@17/bin",
  "/usr/local/opt/postgresql@17/bin",
  "/Applications/Postgres.app/Contents/Versions/17/bin",
]);
export const PG_BINARIES = Object.freeze([
  "psql",
  "pg_dump",
  "pg_dumpall",
  "initdb",
  "pg_ctl",
]);
export const PG17_FROZEN_BASE = "/Applications/Postgres.app/Contents/Versions/17/bin";
export const PG17_FROZEN_VERSION = "17.10 (Postgres.app)";
export const PG17_TOOLCHAIN_SHA256 = Object.freeze({
  initdb: "6a64e212a6d7b679974dc68c99ae87658d172ed3056893e9e7fc5b9f6257db02",
  pg_ctl: "a1841dc81d4c8afdda433f986a91f315d77a9c9ae1fb33eaf1ce1c645914a0a6",
  pg_dump: "fcf942438ee1844a0ccc029bbce18d69bc94166fa3f9053e3611e65285478209",
  pg_dumpall: "588cedfc296a1acbe2460109c4637418eea12b682bea37d3fa37117c752c2120",
  postgres: "5c346ffb2faad6a6802bbf94af89b29f8ded1cb8faaaeb0af4b7291f9f18298d",
  psql: "e18000996705007127b49872d46551558c98e80a8d0f2b26a67f9128c54689bd",
});
export const PG17_CLOSURE_BINARIES = Object.freeze([
  "initdb",
  "pg_ctl",
  "pg_dump",
  "pg_dumpall",
  "postgres",
  "psql",
]);
export const PG17_SERVER_VERSION_NUM = 170010;
export const LOCAL_PG_PORT = 64321;
export const LOCAL_PG_ADMIN = "e17b_restore_admin";
export const LOCAL_ROLE_ALLOWLIST = Object.freeze([
  "anon",
  "authenticated",
  "authenticator",
  "postgres",
  "service_role",
  "supabase_admin",
]);

const EXPECTED_LEDGER_PATHS = Object.freeze([
  "supabase/migrations/20260725120000_kd_personal.sql",
  "supabase/migrations/20260725220000_etappe4_quellenregister_zugriff.sql",
  "supabase/migrations/20260726120000_etappe4_guard_ausbaustufe.sql",
  "supabase/migrations/20260726160000_etappe5_ki_unterbau.sql",
  "supabase/migrations/20260726180000_etappe5_ki_unterbau_haertung.sql",
  "supabase/migrations/20260727180000_etappe6_ausgabebudget_suche.sql",
  "supabase/migrations/20260727190000_etappe6_tageslimit_bauphase.sql",
  "supabase/migrations/20260727210000_etappe7_profil_topf.sql",
  "supabase/migrations/20260729200000_etappe7_structured_output_timeout.sql",
  "supabase/migrations/20260729210000_etappe8_film_forecast.sql",
  "supabase/migrations/20260729220000_etappe8_filmwissen_cache.sql",
  "supabase/migrations/20260730110000_etappe8_filmwissen_synthese_sicherung.sql",
  "supabase/migrations/20260730140000_etappe8_filmwissen_adapter_sperren.sql",
  "supabase/migrations/20260730160000_etappe8_filmwissen_atomarer_abschluss.sql",
  "supabase/migrations/20260730180000_etappe8_filmwissen_belegklassen.sql",
  "supabase/migrations/20260730210000_etappe8_filmwissen_adapter_betrieb.sql",
  "supabase/migrations/20260730230000_etappe9_beta_tageslimit.sql",
  "supabase/migrations/20260730231000_etappe9_beta_antwortlimit.sql",
  "supabase/migrations/20260731120000_shared_articles.sql",
  "supabase/migrations/20260731121000_archive_legacy_shared.sql",
  "supabase/migrations/20260731140000_demo_seed_catalog.sql",
  "supabase/migrations/20260731170000_split_streaming_catalog.sql",
  "supabase/migrations/20260801194500_stapelimport_medien.sql",
  "supabase/migrations/20260802120000_wochenplan_serienbeobachtung.sql",
  "supabase/migrations/20260802220000_shared_article_claim_tokens.sql",
  "supabase/migrations/20260808120000_ai_anbieter_request_kostenzaun.sql",
  "supabase/migrations/20260808225500_etappe9_beta_tageslimit_30.sql",
  "supabase/migrations/20260809120000_rollen_v1_access_basis.sql",
  "supabase/migrations/20260809121000_rollen_v1_access_enforcement.sql",
  "supabase/migrations/20260809180000_event_radar_local_basis.sql",
  "supabase/migrations/20260809220000_private_pilot_ops.sql",
  "supabase/migrations/20260810120000_private_pilot_retention_fix.sql",
  "supabase/migrations/20260814120000_radar_max_manual_pilot.sql",
  "supabase/migrations/20260815120000_private_export_radar_pilot_compat.sql",
  "supabase/migrations/20260816010000_radar_deferred_trigger_privilege_fix.sql",
]);

function migrationIdentity(path) {
  const match = path.match(/^supabase\/migrations\/([0-9]{14})_([a-z0-9_]+)\.sql$/);
  if (!match) throw new Error("Interner Migrationsvertrag ist ungültig.");
  return Object.freeze({ version: match[1], name: match[2], path });
}

export const EXPECTED_LEDGER_HISTORY = Object.freeze(
  EXPECTED_LEDGER_PATHS.map(migrationIdentity),
);
export const EXPECTED_LEDGER_VERSIONS = Object.freeze(
  EXPECTED_LEDGER_HISTORY.map(({ version }) => version),
);
export const EXPECTED_COMMITTED_MIGRATIONS = Object.freeze([
  ...EXPECTED_LEDGER_PATHS,
  MIGRATION_PATH,
]);

function inspectDescriptors(value, label = "Plain-Data") {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    if (intrinsicIsProxy(value)) {
      stop("SECRET_GUARD_UNINSPECTABLE", `${label} ist ein Proxy und wird nicht reflektiert.`);
    }
  }
  let descriptors;
  let prototype;
  try {
    descriptors = intrinsicGetOwnPropertyDescriptors(value);
    prototype = intrinsicGetPrototypeOf(value);
  } catch {
    stop("SECRET_GUARD_UNINSPECTABLE", `${label} kann nicht sicher inspiziert werden.`);
  }
  for (const key of intrinsicOwnKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof descriptor.get === "function"
        || typeof descriptor.set === "function"
        || !intrinsicReflectApply(intrinsicObjectHasOwn, Object, [descriptor, "value"])) {
      stop("SECRET_GUARD_UNINSPECTABLE", `${label} enthält einen Accessor-Deskriptor.`);
    }
  }
  return { descriptors, prototype };
}

function inspectOrdinaryDataObject(value, label) {
  assertSecurityRuntimeIntegrity();
  assertNoCanonicalV2Artifacts(value, label);
  if (value === null || typeof value !== "object") {
    stop("SECRET_GUARD_UNINSPECTABLE", `${label} ist kein gewöhnliches Datenobjekt.`);
  }
  const inspected = inspectDescriptors(value, label);
  if (inspected.prototype !== intrinsicObjectPrototype && inspected.prototype !== null) {
    stop("SECRET_GUARD_UNINSPECTABLE", `${label} besitzt eine geerbte Prototypkette.`);
  }
  return inspected.descriptors;
}

function descriptorDataValue(descriptors, key) {
  const descriptor = descriptors[key];
  return descriptor
    && intrinsicReflectApply(intrinsicObjectHasOwn, Object, [descriptor, "value"])
    ? descriptor.value
    : undefined;
}

function descriptorHasKey(descriptors, key) {
  return intrinsicReflectApply(intrinsicObjectHasOwn, Object, [descriptors, key]);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const { prototype } = inspectDescriptors(value);
  return prototype === intrinsicObjectPrototype || prototype === null;
}

function canonicalize(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") {
    stop("SECRET_GUARD_UNINSPECTABLE", "Kanonisierung akzeptiert nur einen Plain-Data-Tree.");
  }
  if (weakSetHas(ancestors, value)) {
    stop("SECRET_GUARD_UNINSPECTABLE", "Kanonisierung blockiert zyklische Daten.");
  }
  const { descriptors, prototype } = inspectDescriptors(value, "Kanonisierung");
  const array = intrinsicArrayIsArray(value);
  if ((array && prototype !== intrinsicArrayPrototype)
      || (!array && prototype !== intrinsicObjectPrototype && prototype !== null)) {
    stop("SECRET_GUARD_UNINSPECTABLE", "Kanonisierung blockiert manipulierte Prototypketten.");
  }
  for (const key of intrinsicOwnKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (array && key === "length") continue;
    if (typeof key === "symbol"
        || descriptor.enumerable !== true) {
      stop("SECRET_GUARD_UNINSPECTABLE", "Kanonisierung blockiert Accessor-/verdeckte Daten.");
    }
    if (key === "toJSON") {
      stop("SECRET_GUARD_UNINSPECTABLE", "Kanonisierung blockiert eigene toJSON-Hooks.");
    }
  }
  weakSetAdd(ancestors, value);
  let result;
  if (array) {
    const keys = Object.keys(descriptors).filter((key) => key !== "length");
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0
        || keys.some((key, index) => key !== String(index)) || keys.length !== length) {
      stop("SECRET_GUARD_UNINSPECTABLE", "Kanonisierung blockiert sparse/erweiterte Arrays.");
    }
    result = keys.map((key) => canonicalize(descriptors[key].value, ancestors));
  } else {
    result = Object.fromEntries(
      Object.keys(descriptors).sort().map((key) => [
        key,
        canonicalize(descriptors[key].value, ancestors),
      ]),
    );
  }
  ancestors.delete(value);
  return result;
}

function canonicalJson(value) {
  return intrinsicJsonStringify(canonicalize(value));
}

function hashBytes(bytes) {
  if (typeof bytes === "string") {
    return createHash("sha256").update(Buffer.from(bytes, "utf8")).digest("hex");
  }
  const copy = copyInspectableBytes(bytes, "Hashing");
  return createHash("sha256").update(copy).digest("hex");
}

if (hashBytes(Buffer.from(JSON.stringify(EXPECTED_LEDGER_VERSIONS), "utf8"))
    !== EXPECTED_LEDGER_HISTORY_SHA256) {
  throw new Error("Interner Ledgervertrag verletzt den eingefrorenen Array-Hash.");
}

const ROLE_INDEX = new Map(EVIDENCE_ROLES.map((role, index) => [role, index]));
const GREEN_PREREQUISITES = Object.freeze(Object.fromEntries(
  EVIDENCE_ROLES.map((role, index) => [role, Object.freeze(EVIDENCE_ROLES.slice(0, index))]),
));
const EARLY_STOP_ROLES = Object.freeze(
  EVIDENCE_ROLES.slice(0, ROLE_INDEX.get("91-rollback-plan")),
);
export const CLEANUP_STOP_VARIANTS = Object.freeze(
  EARLY_STOP_ROLES.map((role) => `stop-after-${role}`),
);
export const CLEANUP_PREREQUISITE_VARIANTS = Object.freeze(Object.fromEntries([
  ["green", GREEN_PREREQUISITES["98-credential-cleanup"]],
  ...EARLY_STOP_ROLES.map((role) => [
    `stop-after-${role}`,
    Object.freeze(EVIDENCE_ROLES.slice(0, ROLE_INDEX.get(role) + 1)),
  ]),
]));

function stopOutcome(variant, lastSuccessfulRole, stopReasonCode, remoteEffectState) {
  return Object.freeze({ variant, lastSuccessfulRole, stopReasonCode, remoteEffectState });
}

export const FINAL_CHECKPOINT_OUTCOMES = Object.freeze({
  green: Object.freeze([
    stopOutcome("green", "98-credential-cleanup", null, "remote-green-final-health-ready"),
  ]),
  "stop-after-00-contract": Object.freeze([
    stopOutcome("stop-after-00-contract", "00-contract", "READ_PREFLIGHT_NOT_STARTED", "no-remote-effect"),
  ]),
  "stop-after-10-read-preflight": Object.freeze([
    stopOutcome("stop-after-10-read-preflight", "00-contract", REMOTE_PAYLOAD_PENDING, "no-remote-effect"),
  ]),
  "stop-after-11-function-preimage": Object.freeze([
    stopOutcome("stop-after-11-function-preimage", "11-function-preimage", "FUNCTION_PREIMAGE_STOP", "read-only-remote-effect"),
  ]),
  "stop-after-12-db-preimage": Object.freeze([
    stopOutcome("stop-after-12-db-preimage", "12-db-preimage", "DB_PREIMAGE_STOP", "read-only-remote-effect"),
  ]),
  "stop-after-20-backup-manifest": Object.freeze([
    stopOutcome("stop-after-20-backup-manifest", "20-backup-manifest", "BACKUP_RESTORE_STOP", "read-only-remote-effect"),
  ]),
  "stop-after-21-restore-proof": Object.freeze([
    stopOutcome("stop-after-21-restore-proof", "21-restore-proof", "RESTORE_PROOF_STOP", "read-only-remote-effect"),
  ]),
  "stop-after-22-canonical-detail": Object.freeze([
    stopOutcome("stop-after-22-canonical-detail", "22-canonical-detail", "SOURCE_CANONICAL_STOP", "read-only-remote-effect"),
  ]),
  "stop-after-23-canonical-detail": Object.freeze([
    stopOutcome("stop-after-23-canonical-detail", "23-canonical-detail", "RESTORE_CANONICAL_STOP", "read-only-remote-effect"),
  ]),
  "stop-after-30-function-checkpoint": Object.freeze([
    stopOutcome("stop-after-30-function-checkpoint", "30-function-checkpoint", "FUNCTION_DEPLOY_FAILED", "function-deploy-not-proven"),
    stopOutcome("stop-after-30-function-checkpoint", "30-function-checkpoint", "FUNCTION_MARKER_FAILED", "function-deployed-marker-missing"),
  ]),
  "stop-after-31-function-apply": Object.freeze([
    stopOutcome("stop-after-31-function-apply", "31-function-apply", "FUNCTION_HEALTH_FAILED", "function-deployed-marker-set-health-missing"),
  ]),
  "stop-after-32-function-postflight": Object.freeze([
    stopOutcome("stop-after-32-function-postflight", "32-function-postflight", "DB_OWNER_GATE_STOP", "function-ready-false-db-not-applied"),
  ]),
  "stop-after-40-db-checkpoint": Object.freeze([
    stopOutcome("stop-after-40-db-checkpoint", "40-db-checkpoint", "DB_APPLY_FAILED", "function-ready-false-db-write-not-proven"),
  ]),
  "stop-after-41-db-apply": Object.freeze([
    stopOutcome("stop-after-41-db-apply", "41-db-apply", "DB_POSTFLIGHT_FAILED", "db-write-committed-final-health-missing"),
  ]),
  "stop-after-42-db-postflight": Object.freeze([
    stopOutcome("stop-after-42-db-postflight", "42-db-postflight", "REMOTE_DELTA_FAILED", "db-write-committed-final-health-ready"),
  ]),
  "stop-after-90-remote-delta": Object.freeze([
    stopOutcome("stop-after-90-remote-delta", "90-remote-delta", "ROLLBACK_PLAN_STOP", "remote-green-final-health-ready"),
  ]),
});

export const MODE_PREREQUISITES = Object.freeze({
  "local-contract": Object.freeze([]),
  "read-preflight": GREEN_PREREQUISITES["10-read-preflight"],
  "backup-restore": GREEN_PREREQUISITES["20-backup-manifest"],
  "function-release": GREEN_PREREQUISITES["30-function-checkpoint"],
  "db-apply": GREEN_PREREQUISITES["40-db-checkpoint"],
  postflight: GREEN_PREREQUISITES["42-db-postflight"],
  "cleanup-local": GREEN_PREREQUISITES["98-credential-cleanup"],
});

export class E17BStop extends Error {
  constructor(reasonCode, message = "E17B-Vertrag stoppt fail-closed.") {
    super(message);
    this.name = "E17BStop";
    this.code = "E17B_STOP";
    this.reasonCode = reasonCode;
  }
}

function stop(reasonCode, message) {
  throw new E17BStop(reasonCode, message);
}

export function decodeUtf8Fatal(bytes, label = "Blob") {
  assertSecurityRuntimeIntegrity();
  const copy = copyInspectableBytes(bytes, "UTF-8-Dekodierung");
  try {
    return intrinsicReflectApply(intrinsicTextDecoderDecode, intrinsicUtf8Decoder, [copy]);
  } catch {
    stop("INVALID_UTF8", `${label} ist kein gültiges UTF-8.`);
  }
}

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const RUN_BASENAME = /^kinodreieck-e17b-([0-9a-f]{40})-([0-9a-f]{16})$/;
const SNAPSHOT_ID = /^[0-9A-F]{8}-[0-9A-F]{8}-[1-9][0-9]*$/i;

export function assertCommit(value) {
  assertSecurityRuntimeIntegrity();
  if (typeof value !== "string"
      || !intrinsicReflectApply(intrinsicRegExpTest, COMMIT, [value])) {
    stop("INVALID_COMMIT", "Finalcommit muss exakt 40 lowercase Hex-Zeichen besitzen.");
  }
  return value;
}

function parseRunId(runId) {
  if (typeof runId !== "string") stop("INVALID_RUN_ID", "Run-ID fehlt.");
  const match = runId.match(RUN_BASENAME);
  if (!match) stop("INVALID_RUN_ID", "Run-ID verletzt den helper-eigenen Vertrag.");
  return { runId, finalCommit: match[1] };
}

function assertRunId(runId, finalCommit) {
  const parsed = parseRunId(runId);
  if (parsed.finalCommit !== assertCommit(finalCommit)) {
    stop("RUN_ID_COMMIT_MISMATCH", "Run-ID und Finalcommit gehören nicht zusammen.");
  }
  return runId;
}

export function assertSnapshotId(value) {
  if (typeof value !== "string" || !SNAPSHOT_ID.test(value)) {
    stop("INVALID_SNAPSHOT_ID", "Snapshot-ID verletzt das feste Format.");
  }
  return value.toUpperCase();
}

function expectedMode(role) {
  const modes = ROLE_MODES[role];
  if (!modes || modes.length !== 1) {
    stop("INVALID_EVIDENCE_ROLE", "Evidence-Rolle ist unbekannt oder mehrdeutig.");
  }
  return modes[0];
}

export function expectedPrerequisites(role, mode, variant = "green") {
  if (expectedMode(role) !== mode) {
    stop("INVALID_EVIDENCE_ROLE", "Evidence-Rolle gehört nicht zum angegebenen Modus.");
  }
  if (role !== "98-credential-cleanup" && role !== "99-final-checkpoint") {
    if (variant !== "green") {
      stop("INVALID_PREREQUISITE_VARIANT", "Nur Cleanup besitzt STOP-Varianten.");
    }
    return [...GREEN_PREREQUISITES[role]];
  }
  const cleanupPrefix = CLEANUP_PREREQUISITE_VARIANTS[variant];
  if (!cleanupPrefix) {
    stop("INVALID_PREREQUISITE_VARIANT", "Cleanup-Variante ist nicht allowlistet.");
  }
  return role === "98-credential-cleanup"
    ? [...cleanupPrefix]
    : [...cleanupPrefix, "98-credential-cleanup"];
}

const ALLOWED_OPERATIONS = new Set([
  "supabase-functions-list",
  "supabase-function-download",
  "pg-ledger-pre",
  "sequence-backup-restore",
  "pg-canonical-source",
  "pg-canonical-restore",
  "sequence-function-release",
  "sequence-db-apply",
  "pg-ledger-post",
  "sequence-postflight",
  "cleanup-fs",
]);

const SUCCESS_OPERATION = Object.freeze({
  "10-read-preflight": "supabase-functions-list",
  "11-function-preimage": "supabase-function-download",
  "12-db-preimage": "pg-ledger-pre",
  "20-backup-manifest": "sequence-backup-restore",
  "21-restore-proof": "sequence-backup-restore",
  "22-canonical-detail": "pg-canonical-source",
  "23-canonical-detail": "pg-canonical-restore",
  "31-function-apply": "sequence-function-release",
  "32-function-postflight": "sequence-function-release",
  "41-db-apply": "sequence-db-apply",
  "42-db-postflight": "pg-ledger-post",
  "90-remote-delta": "sequence-postflight",
  "98-credential-cleanup": "cleanup-fs",
});

const SUCCESS_FACT_KEYS = Object.freeze({
  "10-read-preflight": Object.freeze(["executorOperation", "remoteTargetDigest"]),
  "11-function-preimage": Object.freeze([
    "executorOperation", "preimageDigest", "remoteTargetDigest",
  ]),
  "12-db-preimage": Object.freeze([
    "executorOperation", "ledgerCount", "preimageDigest", "remoteTargetDigest", "targetCount",
  ]),
  "20-backup-manifest": Object.freeze([
    "authArtifactSha256",
    "authIdSetSha256",
    "authSnapshotIdSha256",
    "canonicalSourceSnapshotIdSha256",
    "executorOperation",
    "migrationsSnapshotIdSha256",
    "migrationsDumpSha256",
    "publicDumpSha256",
    "publicSnapshotIdSha256",
    "remoteTargetDigest",
    "rolesDumpSha256",
    "snapshotIdSha256",
  ]),
  "21-restore-proof": Object.freeze([
    "aclSha256", "authIdSetSha256", "categorySetSha256", "dataHashSetSha256",
    "executorOperation", "ledgerCount", "ledgerHistorySha256", "ledgerRowsSha256",
    "nonTargetDataSha256", "nonTargetFlagsSha256", "nonTargetKeysSha256", "rlsSha256",
    "rowCountSetSha256", "structureSha256", "tableSetSha256", "targetCount",
  ]),
  "22-canonical-detail": Object.freeze([
    "aclSha256", "authIdSetSha256", "canonicalSide", "categorySetSha256",
    "dataHashSetSha256", "executorOperation", "ledgerCount", "ledgerHistorySha256",
    "ledgerRowsSha256", "nonTargetDataSha256", "nonTargetFlagsSha256",
    "nonTargetKeysSha256", "rlsSha256", "rowCountSetSha256", "structureSha256",
    "tableSetSha256", "targetCount",
  ]),
  "23-canonical-detail": Object.freeze([
    "aclSha256", "authIdSetSha256", "canonicalSide", "categorySetSha256",
    "dataHashSetSha256", "executorOperation", "ledgerCount", "ledgerHistorySha256",
    "ledgerRowsSha256", "nonTargetDataSha256", "nonTargetFlagsSha256",
    "nonTargetKeysSha256", "rlsSha256", "rowCountSetSha256", "structureSha256",
    "tableSetSha256", "targetCount",
  ]),
  "31-function-apply": Object.freeze(["buildCommit", "executorOperation", "markerCommit"]),
  "32-function-postflight": Object.freeze([
    "authStatus", "buildCommit", "capability", "executorOperation", "statusCode",
  ]),
  "41-db-apply": Object.freeze([
    "executorOperation", "migrationSha256", "transactionSha256",
  ]),
  "42-db-postflight": Object.freeze([
    "aclSha256", "authStatus", "buildCommit", "capability", "categorySetSha256", "executorOperation",
    "ledgerCount", "nonTargetDataSha256", "nonTargetFlagsSha256", "nonTargetKeysSha256",
    "rlsSha256", "rowCountSetSha256", "statusCode", "structureSha256", "tableSetSha256",
    "targetCount",
  ]),
  "90-remote-delta": Object.freeze([
    "aclSha256", "authStatus", "buildCommit", "capability", "categorySetSha256", "executorOperation",
    "ledgerCount", "nonTargetDataSha256", "nonTargetFlagsSha256", "nonTargetKeysSha256",
    "rlsSha256", "rowCountSetSha256", "statusCode", "structureSha256", "tableSetSha256",
    "targetCount",
  ]),
  "98-credential-cleanup": Object.freeze(["cleanupCount", "executorOperation"]),
});

const CONTRACT_FACT_KEYS = Object.freeze([
  "allowedRemoteRef",
  "configSha256",
  "deployContractSha256",
  "e17aBaseline",
  "evidenceRoleCount",
  "ledgerHistorySha256",
  "migrationSha256",
  "modeCount",
  "sourceClosureCount",
  "sourceSha256",
  "targetBranch",
]);

const RECORD_KEYS = Object.freeze([
  "allowedRemoteRef",
  "e17aBaseline",
  "executor",
  "facts",
  "finalCommit",
  "mode",
  "prerequisiteVariant",
  "prerequisites",
  "projectId",
  "role",
  "runId",
  "schema",
  "state",
  "targetBranch",
  "targetId",
]);

function exactKeys(value, expected) {
  assertNoCanonicalV2Artifacts(value, "Trustgrenze");
  if (value === null || typeof value !== "object") return false;
  const { descriptors, prototype } = inspectDescriptors(value, "Schemaobjekt");
  if (prototype !== intrinsicObjectPrototype && prototype !== null) return false;
  const ownKeys = intrinsicOwnKeys(descriptors);
  const enumerableKeys = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (typeof key !== "string" || descriptors[key].enumerable !== true) return false;
    intrinsicReflectApply(intrinsicArrayPush, enumerableKeys, [key]);
  }
  if (ownKeys.length !== expected.length) return false;
  const sortedActual = intrinsicReflectApply(intrinsicArraySlice, enumerableKeys, []);
  const sortedExpected = intrinsicReflectApply(intrinsicArraySlice, expected, []);
  intrinsicReflectApply(intrinsicArraySort, sortedActual, []);
  intrinsicReflectApply(intrinsicArraySort, sortedExpected, []);
  return intrinsicJsonStringify(sortedActual) === intrinsicJsonStringify(sortedExpected);
}

function validateDigest(value, reasonCode = "INVALID_DIGEST") {
  if (typeof value !== "string" || !SHA256.test(value)) {
    stop(reasonCode, "SHA-256-Fakt verletzt das feste Format.");
  }
  return value;
}

function validateExecutorSummary(summary, operation) {
  const keys = ["exitCode", "operation", "parsedOutputSha256", "signal", "timedOut"];
  if (!exactKeys(summary, keys)
      || summary.operation !== operation
      || !setHas(ALLOWED_OPERATIONS, summary.operation)
      || summary.exitCode !== 0
      || summary.signal !== null
      || summary.timedOut !== false
      || !SHA256.test(summary.parsedOutputSha256)) {
    stop("INVALID_EXECUTOR_SUMMARY", "Executorzusammenfassung ist nicht vollständig validiert.");
  }
}

export function validateExecutorProofBinding(proof, {
  role,
  mode,
  finalCommit,
  runId,
  prerequisites,
  facts,
} = {}) {
  assertNoCanonicalV2Artifacts(proof, "Executor-Proofsink");
  const operation = SUCCESS_OPERATION[role];
  if (expectedMode(role) !== mode || !operation) {
    stop("EXECUTOR_PROOF_ROLE_MISMATCH", "Executorproof gehört nicht zu einer Erfolgsrolle.");
  }
  const validCommit = assertCommit(finalCommit);
  assertRunId(runId, validCommit);
  const expectedFacts = Object.freeze({ ...facts, executorOperation: operation });
  const prerequisitesDigest = hashBytes(Buffer.from(canonicalJson(prerequisites), "utf8"));
  const factsDigest = hashBytes(Buffer.from(canonicalJson(expectedFacts), "utf8"));
  if (!exactKeys(proof, [
    "factsDigest",
    "finalCommit",
    "mode",
    "operation",
    "outputDigest",
    "prerequisitesDigest",
    "role",
    "runId",
    "summary",
    "targetId",
    "type",
  ])
      || proof.type !== "fresh-executor-proof"
      || proof.role !== role
      || proof.mode !== mode
      || proof.finalCommit !== validCommit
      || proof.runId !== runId
      || proof.targetId !== TARGET_ID
      || proof.operation !== operation
      || proof.prerequisitesDigest !== prerequisitesDigest
      || proof.factsDigest !== factsDigest
      || proof.outputDigest !== proof.summary?.parsedOutputSha256) {
    stop("EXECUTOR_PROOF_OBJECT_MISMATCH", "Executorproof ist cross-run/role/record substituiert.");
  }
  validateExecutorSummary(proof.summary, operation);
  return Object.freeze({
    role,
    mode,
    finalCommit: validCommit,
    runId,
    targetId: TARGET_ID,
    operation,
    prerequisitesDigest,
    factsDigest,
    outputDigest: proof.outputDigest,
    trusted: false,
  });
}

function validateContractFacts(facts) {
  if (!exactKeys(facts, CONTRACT_FACT_KEYS)
      || facts.modeCount !== 7
      || facts.evidenceRoleCount !== 18
      || facts.sourceClosureCount !== 5
      || facts.targetBranch !== TARGET_BRANCH
      || facts.allowedRemoteRef !== ALLOWED_REMOTE_REF
      || facts.e17aBaseline !== E17A_BASELINE
      || facts.sourceSha256 !== EXPECTED_SOURCE_SHA256
      || facts.configSha256 !== EXPECTED_CONFIG_SHA256
      || facts.deployContractSha256 !== EXPECTED_DEPLOY_CONTRACT_SHA256
      || facts.migrationSha256 !== EXPECTED_MIGRATION_SHA256
      || facts.ledgerHistorySha256 !== EXPECTED_LEDGER_HISTORY_SHA256) {
    stop("INVALID_CONTRACT_FACTS", "Contract-Evidence ist nicht vollständig eingefroren.");
  }
}

function validateFinalHealthFacts(record) {
  if (record.facts.statusCode !== 200
      || record.facts.authStatus !== "authenticated"
      || record.facts.buildCommit !== record.finalCommit
      || record.facts.capability !== "ready"
      || record.facts.ledgerCount !== 36
      || record.facts.targetCount !== 1) {
    stop("FINAL_HEALTH_OR_DELTA_DRIFT", "Finaler Health/Postwrite-Zustand ist nicht exakt grün.");
  }
}

function validateSuccessFacts(record) {
  const expectedKeys = SUCCESS_FACT_KEYS[record.role];
  const expectedOperation = SUCCESS_OPERATION[record.role];
  if (!expectedKeys || !exactKeys(record.facts, expectedKeys)) {
    stop("INVALID_SUCCESS_FACTS", "Rollenbezogene Erfolgsfacts fehlen oder enthalten Extras.");
  }
  if (record.facts.executorOperation !== expectedOperation) {
    stop("EXECUTOR_OPERATION_MISMATCH", "Executoroperation gehört nicht zur Evidence-Rolle.");
  }
  validateExecutorSummary(record.executor, expectedOperation);
  for (const [key, value] of Object.entries(record.facts)) {
    if (key.endsWith("Sha256") || key.endsWith("Digest")) validateDigest(value);
  }
  if ([
    "21-restore-proof",
    "22-canonical-detail",
    "23-canonical-detail",
    "42-db-postflight",
    "90-remote-delta",
  ].includes(record.role)
      && record.facts.categorySetSha256 !== EXPECTED_CATEGORY_SET_SHA256) {
    stop("CANONICAL_CATEGORY_SET_MISMATCH", "Canonical-Facts decken nicht alle Pflichtkategorien ab.");
  }
  switch (record.role) {
    case "10-read-preflight":
      validateDigest(record.facts.remoteTargetDigest, "REMOTE_TARGET_NOT_ATTESTED");
      break;
    case "11-function-preimage":
      validateDigest(record.facts.preimageDigest);
      validateDigest(record.facts.remoteTargetDigest, "REMOTE_TARGET_NOT_ATTESTED");
      break;
    case "12-db-preimage":
      validateDigest(record.facts.preimageDigest);
      validateDigest(record.facts.remoteTargetDigest, "REMOTE_TARGET_NOT_ATTESTED");
      if (record.facts.ledgerCount !== 35 || record.facts.targetCount !== 0) {
        stop("DB_PREIMAGE_DRIFT", "DB-Preimage entspricht nicht dem erwarteten Ledgerzustand.");
      }
      break;
    case "20-backup-manifest":
      validateDigest(record.facts.remoteTargetDigest, "REMOTE_TARGET_NOT_ATTESTED");
      if (record.facts.snapshotIdSha256 !== record.facts.publicSnapshotIdSha256
          || record.facts.snapshotIdSha256 !== record.facts.migrationsSnapshotIdSha256
          || record.facts.snapshotIdSha256 !== record.facts.authSnapshotIdSha256
          || record.facts.snapshotIdSha256 !== record.facts.canonicalSourceSnapshotIdSha256) {
        stop("SNAPSHOT_OBJECT_MISMATCH", "Alle Snapshotkonsumenten müssen exakt dieselbe Snapshot-ID binden.");
      }
      break;
    case "21-restore-proof":
      if (record.facts.ledgerHistorySha256 !== EXPECTED_LEDGER_HISTORY_SHA256) {
        stop("CANONICAL_LEDGER_HISTORY_MISMATCH", "Canonical-Proof bindet nicht den eingefrorenen Ledgerhash.");
      }
      if (record.facts.ledgerCount !== 35 || record.facts.targetCount !== 0) {
        stop("CANONICAL_PREWRITE_MISMATCH", "Restore-Proof ist keine echte Prewrite-Baseline.");
      }
      break;
    case "22-canonical-detail":
      if (record.facts.ledgerHistorySha256 !== EXPECTED_LEDGER_HISTORY_SHA256) {
        stop("CANONICAL_LEDGER_HISTORY_MISMATCH", "Canonical-Proof bindet nicht den eingefrorenen Ledgerhash.");
      }
      if (record.facts.canonicalSide !== "source") {
        stop("CANONICAL_SIDE_MISMATCH", "22 muss ausschließlich Canonical SOURCE sein.");
      }
      if (record.facts.ledgerCount !== 35 || record.facts.targetCount !== 0) {
        stop("CANONICAL_PREWRITE_MISMATCH", "22 ist keine echte Prewrite-SOURCE-Baseline.");
      }
      break;
    case "23-canonical-detail":
      if (record.facts.ledgerHistorySha256 !== EXPECTED_LEDGER_HISTORY_SHA256) {
        stop("CANONICAL_LEDGER_HISTORY_MISMATCH", "Canonical-Proof bindet nicht den eingefrorenen Ledgerhash.");
      }
      if (record.facts.canonicalSide !== "restore") {
        stop("CANONICAL_SIDE_MISMATCH", "23 muss ausschließlich Canonical RESTORE sein.");
      }
      if (record.facts.ledgerCount !== 35 || record.facts.targetCount !== 0) {
        stop("CANONICAL_PREWRITE_MISMATCH", "23 ist keine echte Prewrite-RESTORE-Baseline.");
      }
      break;
    case "31-function-apply":
      if (record.facts.buildCommit !== record.finalCommit
          || record.facts.markerCommit !== record.finalCommit) {
        stop("FUNCTION_COMMIT_MISMATCH", "Function-Apply bindet nicht denselben Finalcommit.");
      }
      break;
    case "32-function-postflight":
      if (record.facts.statusCode !== 200
          || record.facts.authStatus !== "authenticated"
          || record.facts.buildCommit !== record.finalCommit
          || record.facts.capability !== "not-ready") {
        stop("FUNCTION_HEALTH_MISMATCH", "Pre-DB-Health ist nicht authentifiziert/fail-closed.");
      }
      break;
    case "41-db-apply":
      if (record.facts.migrationSha256 !== EXPECTED_MIGRATION_SHA256) {
        stop("MIGRATION_HASH_MISMATCH", "DB-Apply bindet nicht den committed Migrationsblob.");
      }
      break;
    case "42-db-postflight":
      if (record.facts.ledgerCount !== 36
          || record.facts.targetCount !== 1) {
        stop("DB_POSTFLIGHT_DRIFT", "DB-Postflight entspricht nicht dem exakten Zielsatz.");
      }
      validateFinalHealthFacts(record);
      break;
    case "90-remote-delta":
      validateFinalHealthFacts(record);
      break;
    case "98-credential-cleanup":
      if (!Number.isSafeInteger(record.facts.cleanupCount) || record.facts.cleanupCount < 0) {
        stop("INVALID_CLEANUP_COUNT", "Cleanup-Count ist ungültig.");
      }
      break;
    default:
      break;
  }
}

function validatePrerequisiteShape(record) {
  const expected = expectedPrerequisites(
    record.role,
    record.mode,
    record.prerequisiteVariant,
  );
  if (!isPlainObject(record.prerequisites)
      || JSON.stringify(Object.keys(record.prerequisites)) !== JSON.stringify(expected)) {
    stop("INVALID_PREREQUISITE_EDGES", "Prerequisite-Kanten sind nicht exakt vollständig.");
  }
  for (const digest of Object.values(record.prerequisites)) validateDigest(digest);
}

export function validateEvidenceRecord(record) {
  if (!exactKeys(record, RECORD_KEYS)) {
    stop("INVALID_EVIDENCE", "Evidence besitzt nicht das exakte Record-Schema.");
  }
  if (record.schema !== EVIDENCE_SCHEMA
      || record.projectId !== PROJECT_ID
      || record.targetId !== TARGET_ID
      || record.targetBranch !== TARGET_BRANCH
      || record.allowedRemoteRef !== ALLOWED_REMOTE_REF
      || record.e17aBaseline !== E17A_BASELINE) {
    stop("EVIDENCE_OBJECT_MISMATCH", "Evidence gehört nicht zum eingefrorenen Zielobjekt.");
  }
  assertCommit(record.finalCommit);
  assertRunId(record.runId, record.finalCommit);
  if (expectedMode(record.role) !== record.mode) {
    stop("INVALID_EVIDENCE_ROLE", "Evidence-Rolle gehört zu anderem Modus.");
  }
  validatePrerequisiteShape(record);

  if (record.role === "00-contract") {
    if (record.state !== "contract" || record.prerequisiteVariant !== "green"
        || record.executor !== null) {
      stop("INVALID_CONTRACT_STATE", "Contract-Evidence besitzt falschen Zustand.");
    }
    validateContractFacts(record.facts);
    return record;
  }

  if (record.role === "10-read-preflight" && record.state === "pending") {
    if (!exactKeys(record.facts, ["reasonCode", "remotePayloadStatus"])
        || record.facts.reasonCode !== REMOTE_PAYLOAD_PENDING
        || record.facts.remotePayloadStatus !== REMOTE_PAYLOAD_PENDING
        || record.executor !== null
        || record.prerequisiteVariant !== "green") {
      stop("INVALID_PENDING_EVIDENCE", "Pending-Evidence verletzt den Fremdpayload-STOP.");
    }
    return record;
  }

  if (record.role === "30-function-checkpoint" || record.role === "40-db-checkpoint") {
    if (record.state !== "checkpoint" || record.executor !== null
        || record.prerequisiteVariant !== "green"
        || !exactKeys(record.facts, [
          "actionDigest",
          "contextDigest",
          "gateReceiptDigest",
          "preimageDigest",
          "reasonCode",
          "receiptType",
          "remoteTargetDigest",
        ])
        || record.facts.reasonCode !== "OWNER_GATE_RECEIPT"
        || record.facts.receiptType !== "owner-gate-receipt") {
      stop("INVALID_OWNER_GATE_RECEIPT", "Owner-Gate-Receipt besitzt nicht den exakten Vertrag.");
    }
    validateDigest(record.facts.actionDigest);
    validateDigest(record.facts.contextDigest);
    validateDigest(record.facts.gateReceiptDigest);
    validateDigest(record.facts.preimageDigest);
    validateDigest(record.facts.remoteTargetDigest, "REMOTE_TARGET_NOT_ATTESTED");
    return record;
  }

  if (record.role === "91-rollback-plan") {
    if (record.state !== "checkpoint" || record.executor !== null
        || record.prerequisiteVariant !== "green"
        || !exactKeys(record.facts, ["reasonCode", "rollbackAction"])
        || record.facts.reasonCode !== "ROLLBACK_PLAN_ONLY"
        || record.facts.rollbackAction !== "owner-stop-plan") {
      stop("INVALID_ROLLBACK_PLAN", "Rollbackplan ist nicht reiner Owner-STOP-Plan.");
    }
    return record;
  }

  if (record.role === "99-final-checkpoint") {
    if (record.state !== "checkpoint" || record.executor !== null
        || !exactKeys(record.facts, [
          "lastSuccessfulRole", "reasonCode", "remoteEffectState", "stopReasonCode",
        ])
        || record.facts.reasonCode !== "FINAL_CHECKPOINT") {
      stop("INVALID_FINAL_CHECKPOINT", "Finalcheckpoint besitzt falsche Facts.");
    }
    const allowed = FINAL_CHECKPOINT_OUTCOMES[record.prerequisiteVariant];
    if (!allowed || !allowed.some((outcome) =>
      outcome.lastSuccessfulRole === record.facts.lastSuccessfulRole
      && outcome.stopReasonCode === record.facts.stopReasonCode
      && outcome.remoteEffectState === record.facts.remoteEffectState)) {
      stop("INVALID_FINAL_CHECKPOINT", "Finalcheckpoint korreliert nicht mit STOP-/Wirkungsvariante.");
    }
    return record;
  }

  if (record.state !== "ok") {
    stop("INVALID_EVIDENCE_STATE", "Evidence-Rolle besitzt keinen zulässigen Zustand.");
  }
  validateSuccessFacts(record);
  return record;
}

export function canonicalRecordBytes(record) {
  validateEvidenceRecord(record);
  return Buffer.from(canonicalJson(record), "utf8");
}

export function evidenceDigest(record) {
  return hashBytes(canonicalRecordBytes(record));
}

function validateEvidenceItem(mapKey, item, finalCommit, runId) {
  if (item === null || typeof item !== "object") {
    stop("INVALID_EVIDENCE_ITEM", "Evidence-Map enthält kein vollständiges Item.");
  }
  const { descriptors, prototype } = inspectDescriptors(item, "Evidence-Item");
  if (prototype !== Object.prototype && prototype !== null) {
    stop("SECRET_GUARD_UNINSPECTABLE", "Evidence-Item besitzt eine manipulierte Prototypkette.");
  }
  const record = descriptors.record?.value;
  const bytes = descriptors.bytes?.value;
  const digest = descriptors.digest?.value;
  if (!record || !(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)
      || typeof digest !== "string") {
    stop("INVALID_EVIDENCE_ITEM", "Evidence-Map enthält kein vollständiges Item.");
  }
  validateEvidenceRecord(record);
  if (mapKey !== record.role) {
    stop("EVIDENCE_MAP_ROLE_MISMATCH", "Map-Key stimmt nicht mit record.role überein.");
  }
  if (record.finalCommit !== finalCommit
      || record.runId !== runId
      || record.targetId !== TARGET_ID) {
    stop("EVIDENCE_OBJECT_MISMATCH", "Prerequisite gehört zu anderem Run/Target/Commit.");
  }
  const canonicalBytes = canonicalRecordBytes(record);
  if (!Buffer.from(bytes).equals(canonicalBytes)) {
    stop("NON_CANONICAL_EVIDENCE", "Evidence-Bytes sind nicht die kanonischen Recordbytes.");
  }
  if (digest !== hashBytes(canonicalBytes)) {
    stop("EVIDENCE_DIGEST_MISMATCH", "Evidence-Digest gehört nicht zu den Recordbytes.");
  }
  return Object.freeze({ record, bytes, digest });
}

const CANONICAL_FACTS = Object.freeze([
  "categorySetSha256",
  "structureSha256",
  "tableSetSha256",
  "rowCountSetSha256",
  "dataHashSetSha256",
  "nonTargetDataSha256",
  "nonTargetKeysSha256",
  "nonTargetFlagsSha256",
  "authIdSetSha256",
  "ledgerHistorySha256",
  "ledgerRowsSha256",
  "rlsSha256",
  "aclSha256",
]);

export const CANONICAL_CATEGORIES = Object.freeze([
  "schema-owner",
  "relation-owner-kind-rls",
  "column-definition",
  "column-acl",
  "constraint-state",
  "index-state",
  "trigger-state",
  "policy-state",
  "function-state-acl",
  "view-definition",
  "type-state-acl",
  "sequence-parameters-state",
  "role-membership-owner-effect",
  "base-table-counts-data",
  "auth-users-id-only",
  "ledger-rows-history",
  "non-target-json-data-keys-flags",
]);
const EXPECTED_CATEGORY_SET_SHA256 = hashBytes(
  Buffer.from(CANONICAL_CATEGORIES.join("\n"), "utf8"),
);

const PREWRITE_INVARIANT_FACTS = Object.freeze([
  "categorySetSha256",
  "structureSha256",
  "tableSetSha256",
  "rowCountSetSha256",
  "rlsSha256",
  "aclSha256",
  "nonTargetDataSha256",
  "nonTargetKeysSha256",
  "nonTargetFlagsSha256",
]);

const POSTWRITE_CORRELATION_FACTS = Object.freeze([
  ...PREWRITE_INVARIANT_FACTS,
  "ledgerCount",
  "targetCount",
  "statusCode",
  "authStatus",
  "buildCommit",
  "capability",
]);

function validateGraphCorrelations(evidenceByRole) {
  const readTarget = evidenceByRole["10-read-preflight"]?.record?.facts?.remoteTargetDigest;
  if (readTarget !== undefined) {
    validateDigest(readTarget, "REMOTE_TARGET_NOT_ATTESTED");
    for (const role of ["11-function-preimage", "12-db-preimage", "20-backup-manifest"]) {
      const value = evidenceByRole[role]?.record?.facts?.remoteTargetDigest;
      if (value !== undefined && value !== readTarget) {
        stop("REMOTE_TARGET_OBJECT_MISMATCH", "Remote-Target-Digest driftet im Evidencegraph.");
      }
    }
  }
  const canonicalRecords = [
    evidenceByRole["21-restore-proof"]?.record,
    evidenceByRole["22-canonical-detail"]?.record,
    evidenceByRole["23-canonical-detail"]?.record,
  ].filter(Boolean);
  if (canonicalRecords.length >= 2) {
    const baseline = canonicalRecords[0].facts;
    for (const record of canonicalRecords.slice(1)) {
      for (const key of CANONICAL_FACTS) {
        if (record.facts[key] !== baseline[key]) {
          stop("CANONICAL_EVIDENCE_MISMATCH", "Source/Restore-Fakten korrelieren nicht.");
        }
      }
    }
  }
  const authProjection = evidenceByRole["20-backup-manifest"]?.record?.facts?.authIdSetSha256;
  if (authProjection !== undefined) {
    for (const record of canonicalRecords) {
      if (record.facts.authIdSetSha256 !== authProjection) {
        stop("AUTH_PROJECTION_MISMATCH", "Auth-ID-Projektion korreliert nicht mit Source/Restore.");
      }
    }
  }
  const postwriteRecords = [
    evidenceByRole["42-db-postflight"]?.record,
    evidenceByRole["90-remote-delta"]?.record,
  ].filter(Boolean);
  const prewriteBaseline = evidenceByRole["22-canonical-detail"]?.record?.facts
    ?? evidenceByRole["21-restore-proof"]?.record?.facts;
  if (prewriteBaseline) {
    for (const record of postwriteRecords) {
      for (const key of PREWRITE_INVARIANT_FACTS) {
        if (record.facts[key] !== prewriteBaseline[key]) {
          stop("POSTWRITE_BASELINE_MISMATCH", "Postwrite-Fakten driften von der Prewrite-Baseline.");
        }
      }
      if (record.facts.ledgerCount !== prewriteBaseline.ledgerCount + 1
          || record.facts.targetCount !== prewriteBaseline.targetCount + 1) {
        stop("POSTWRITE_LEDGER_DELTA_MISMATCH", "Postwrite-Ledger ist nicht exakt Baseline +1.");
      }
    }
  }
  if (postwriteRecords.length >= 2) {
    const baseline = postwriteRecords[0].facts;
    for (const record of postwriteRecords.slice(1)) {
      for (const key of POSTWRITE_CORRELATION_FACTS) {
        if (record.facts[key] !== baseline[key]) {
          stop("POSTWRITE_EVIDENCE_MISMATCH", "42/90-Fakten korrelieren nicht vollständig.");
        }
      }
    }
  }
}

export function collectPrerequisiteDigests({
  role,
  mode,
  finalCommit,
  runId,
  evidenceByRole,
  prerequisiteVariant = "green",
}) {
  const validCommit = assertCommit(finalCommit);
  assertRunId(runId, validCommit);
  const expectedRoles = expectedPrerequisites(role, mode, prerequisiteVariant);
  if (evidenceByRole === null || typeof evidenceByRole !== "object") {
    stop("INVALID_PREREQUISITE_SET", "Evidence-Map ist fehlend, extra oder umgeordnet.");
  }
  const inspected = inspectDescriptors(evidenceByRole, "Evidence-Map");
  if (inspected.prototype !== Object.prototype && inspected.prototype !== null) {
    stop("SECRET_GUARD_UNINSPECTABLE", "Evidence-Map besitzt eine manipulierte Prototypkette.");
  }
  const mapKeys = Reflect.ownKeys(inspected.descriptors);
  if (mapKeys.some((key) => typeof key !== "string"
      || inspected.descriptors[key].enumerable !== true)
      || JSON.stringify(mapKeys) !== JSON.stringify(expectedRoles)) {
    stop("INVALID_PREREQUISITE_SET", "Evidence-Map ist fehlend, extra oder umgeordnet.");
  }
  const safeEvidenceByRole = Object.fromEntries(
    expectedRoles.map((expectedRole) => [expectedRole, inspected.descriptors[expectedRole].value]),
  );
  const prerequisites = {};
  for (const prerequisiteRole of expectedRoles) {
    const item = validateEvidenceItem(
      prerequisiteRole,
      safeEvidenceByRole[prerequisiteRole],
      validCommit,
      runId,
    );
    const terminalStopRole = prerequisiteVariant.startsWith("stop-after-")
      ? prerequisiteVariant.slice("stop-after-".length)
      : null;
    const pendingTerminal = item.record.role === terminalStopRole
      && item.record.role === "10-read-preflight"
      && item.record.state === "pending";
    if (item.record.state === "pending" && !pendingTerminal) {
      stop(
        REMOTE_PAYLOAD_PENDING,
        "Pending-Preflight ist ein terminaler STOP und nie grüne Prerequisite.",
      );
    }
    prerequisites[prerequisiteRole] = item.digest;
    const nestedExpected = expectedPrerequisites(
      item.record.role,
      item.record.mode,
      item.record.prerequisiteVariant,
    );
    if (JSON.stringify(Object.keys(item.record.prerequisites)) !== JSON.stringify(nestedExpected)) {
      stop("INVALID_PREREQUISITE_EDGES", "Nested Prerequisite-Kanten sind unvollständig.");
    }
    for (const nestedRole of nestedExpected) {
      const nestedItem = safeEvidenceByRole[nestedRole];
      if (!nestedItem || nestedItem.record?.role !== nestedRole
          || nestedItem.digest !== item.record.prerequisites[nestedRole]) {
        stop("PREREQUISITE_GRAPH_MISMATCH", "Nested Evidence-Digest ist substituiert.");
      }
    }
  }
  if (role === "99-final-checkpoint"
      && safeEvidenceByRole["98-credential-cleanup"].record.prerequisiteVariant
        !== prerequisiteVariant) {
    stop("CLEANUP_VARIANT_MISMATCH", "98 und 99 schließen nicht dieselbe STOP-/Green-Variante.");
  }
  validateGraphCorrelations(safeEvidenceByRole);
  return Object.freeze({
    finalCommit: validCommit,
    runId,
    targetId: TARGET_ID,
    prerequisites: Object.freeze(prerequisites),
    trusted: false,
  });
}

const contractRecordBrand = new WeakSet();
const pendingRecordBrand = new WeakSet();
const executorProofBrand = new WeakSet();
const successRecordBrand = new WeakSet();
const localAttestationBrand = new WeakSet();
const localTestAttestationBrand = new WeakSet();
const ownerGateBrand = new WeakSet();
const canonicalGateBrand = new WeakSet();
const finalCheckpointRecordBrand = new WeakSet();
const writtenEvidenceItemBrand = new WeakSet();
// Diese Runtime-Brands erhalten in Wave A absichtlich keinen Erzeuger. Erst ein
// späterer Same-Process-Adapter darf sie nach frischer Revalidierung vergeben.
const functionPreimageContextBrand = new WeakSet();
const dbPreimageContextBrand = new WeakSet();
const verifiedOwnerAuthorizationBrand = new WeakSet();
const dbWriteAuthorizationBrand = new WeakSet();
const pg17VersionExecutorProofBrand = new WeakSet();
const pg17ToolchainClosureBrand = new WeakSet();
const pg17ClosureExecutorProofBrand = new WeakSet();
const pg17ServerVersionProofBrand = new WeakSet();
const dbMutationSinkCapabilityBrand = new WeakSet();

function buildRecord({
  role,
  state,
  finalCommit,
  runId,
  prerequisites,
  facts,
  executor = null,
  prerequisiteVariant = "green",
}) {
  const record = {
    schema: EVIDENCE_SCHEMA,
    role,
    mode: expectedMode(role),
    state,
    prerequisiteVariant,
    finalCommit: assertCommit(finalCommit),
    runId: assertRunId(runId, finalCommit),
    projectId: PROJECT_ID,
    targetId: TARGET_ID,
    targetBranch: TARGET_BRANCH,
    allowedRemoteRef: ALLOWED_REMOTE_REF,
    e17aBaseline: E17A_BASELINE,
    prerequisites,
    facts,
    executor,
  };
  validateEvidenceRecord(record);
  record.prerequisites = Object.freeze({ ...record.prerequisites });
  record.facts = Object.freeze({ ...record.facts });
  if (record.executor !== null) record.executor = Object.freeze({ ...record.executor });
  return Object.freeze(record);
}

export function makeContractEvidence({ localAttestation, runId } = {}) {
  if (!localAttestation
      || (!weakSetHas(localAttestationBrand, localAttestation)
        && !weakSetHas(localTestAttestationBrand, localAttestation))) {
    stop("LOCAL_ATTESTATION_REQUIRED", "Contract-Evidence benötigt intern attestierte Git-Inputs.");
  }
  const record = buildRecord({
    role: "00-contract",
    state: "contract",
    finalCommit: localAttestation.finalCommit,
    runId,
    prerequisites: {},
    facts: {
      modeCount: 7,
      evidenceRoleCount: 18,
      sourceClosureCount: 5,
      targetBranch: TARGET_BRANCH,
      allowedRemoteRef: ALLOWED_REMOTE_REF,
      e17aBaseline: E17A_BASELINE,
      sourceSha256: EXPECTED_SOURCE_SHA256,
      configSha256: EXPECTED_CONFIG_SHA256,
      deployContractSha256: EXPECTED_DEPLOY_CONTRACT_SHA256,
      migrationSha256: EXPECTED_MIGRATION_SHA256,
      ledgerHistorySha256: EXPECTED_LEDGER_HISTORY_SHA256,
    },
  });
  weakSetAdd(contractRecordBrand, record);
  return record;
}

export function makeRemotePendingEvidence({
  localAttestation,
  runId,
  evidenceByRole,
} = {}) {
  if (!localAttestation
      || (!weakSetHas(localAttestationBrand, localAttestation)
        && !weakSetHas(localTestAttestationBrand, localAttestation))) {
    stop("LOCAL_ATTESTATION_REQUIRED", "Pending-Evidence benötigt denselben attestierten Git-Run.");
  }
  const bound = collectPrerequisiteDigests({
    role: "10-read-preflight",
    mode: "read-preflight",
    finalCommit: localAttestation.finalCommit,
    runId,
    evidenceByRole,
  });
  const record = buildRecord({
    role: "10-read-preflight",
    state: "pending",
    finalCommit: localAttestation.finalCommit,
    runId,
    prerequisites: { ...bound.prerequisites },
    facts: {
      remotePayloadStatus: REMOTE_PAYLOAD_PENDING,
      reasonCode: REMOTE_PAYLOAD_PENDING,
    },
  });
  weakSetAdd(pendingRecordBrand, record);
  return record;
}

export function makeSuccessEvidence({
  role,
  mode,
  finalCommit,
  runId,
  evidenceByRole,
  facts,
  proof,
  canonicalGate,
  prerequisiteVariant = "green",
} = {}) {
  if (!proof || !weakSetHas(executorProofBrand, proof)) {
    stop("EXECUTOR_PROVENANCE_REQUIRED", "Wave A besitzt keinen internen Executorbeleg.");
  }
  if (["21-restore-proof", "22-canonical-detail", "23-canonical-detail"].includes(role)) {
    requireCanonicalArtifactGate({
      role,
      finalCommit,
      runId,
      facts,
      canonicalGate,
    });
  }
  const bound = collectPrerequisiteDigests({
    role,
    mode,
    finalCommit,
    runId,
    evidenceByRole,
    prerequisiteVariant,
  });
  validateExecutorProofBinding(proof, {
    role,
    mode,
    finalCommit,
    runId,
    prerequisites: bound.prerequisites,
    facts,
  });
  const record = buildRecord({
    role,
    state: "ok",
    finalCommit,
    runId,
    prerequisites: { ...bound.prerequisites },
    facts: { ...facts, executorOperation: proof.summary.operation },
    executor: { ...proof.summary },
    prerequisiteVariant,
  });
  validateGraphCorrelations({ ...evidenceByRole, [role]: { record } });
  weakSetAdd(successRecordBrand, record);
  return record;
}

export function makeFinalCheckpointEvidence({
  finalCommit,
  runId,
  evidenceByRole,
  prerequisiteVariant,
  stopReasonCode,
} = {}) {
  if (evidenceByRole === null || typeof evidenceByRole !== "object") {
    stop("CLEANUP_PROVENANCE_REQUIRED", "99 braucht einen vollständigen Evidencegraph.");
  }
  const evidenceDescriptors = inspectDescriptors(evidenceByRole, "Evidence-Map").descriptors;
  const cleanupItem = evidenceDescriptors["98-credential-cleanup"]?.value;
  if (!cleanupItem || !weakSetHas(writtenEvidenceItemBrand, cleanupItem)
      || cleanupItem.record.role !== "98-credential-cleanup"
      || cleanupItem.record.prerequisiteVariant !== prerequisiteVariant) {
    stop("CLEANUP_PROVENANCE_REQUIRED", "99 braucht denselben frisch geschriebenen 98-Cleanupbeleg.");
  }
  const bound = collectPrerequisiteDigests({
    role: "99-final-checkpoint",
    mode: "cleanup-local",
    finalCommit,
    runId,
    evidenceByRole,
    prerequisiteVariant,
  });
  const allowed = FINAL_CHECKPOINT_OUTCOMES[prerequisiteVariant];
  const outcome = allowed?.find((candidate) => candidate.stopReasonCode === stopReasonCode);
  if (!outcome) {
    stop("INVALID_FINAL_CHECKPOINT", "99 besitzt keine passende allowlistete STOP-/Green-Variante.");
  }
  const record = buildRecord({
    role: "99-final-checkpoint",
    state: "checkpoint",
    finalCommit,
    runId,
    prerequisites: { ...bound.prerequisites },
    prerequisiteVariant,
    facts: {
      reasonCode: "FINAL_CHECKPOINT",
      lastSuccessfulRole: outcome.lastSuccessfulRole,
      stopReasonCode: outcome.stopReasonCode,
      remoteEffectState: outcome.remoteEffectState,
    },
  });
  weakSetAdd(finalCheckpointRecordBrand, record);
  return record;
}

function requireCanonicalArtifactGate({ role, finalCommit, runId, facts, canonicalGate }) {
  if (!canonicalGate || !weakSetHas(canonicalGateBrand, canonicalGate)) {
    stop("CANONICAL_PROVENANCE_REQUIRED", "Freie Hashsets sind kein Canonical-Datenbeleg.");
  }
  const canonicalFacts = Object.fromEntries(
    CANONICAL_FACTS.map((key) => [key, facts?.[key]]),
  );
  for (const value of Object.values(canonicalFacts)) validateDigest(value);
  const side = role === "22-canonical-detail" ? "source" : "restore";
  const factsDigest = hashBytes(Buffer.from(canonicalJson({ role, side, canonicalFacts }), "utf8"));
  if (canonicalGate.type !== "fresh-canonical-artifact-proof"
      || canonicalGate.role !== role
      || canonicalGate.side !== side
      || canonicalGate.finalCommit !== finalCommit
      || canonicalGate.runId !== runId
      || canonicalGate.targetId !== TARGET_ID
      || canonicalGate.factsDigest !== factsDigest
      || typeof canonicalGate.artifactDigest !== "string"
      || !SHA256.test(canonicalGate.artifactDigest)) {
    stop("CANONICAL_PROVENANCE_MISMATCH", "Canonical-Proof bindet nicht Daten/Struktur/Run.");
  }
  return canonicalGate;
}

export function validateCanonicalEvidenceGate({
  role,
  finalCommit,
  runId,
  facts,
  evidenceByRole,
  canonicalGate,
} = {}) {
  requireCanonicalArtifactGate({ role, finalCommit, runId, facts, canonicalGate });
  validateGraphCorrelations(evidenceByRole || {});
  return canonicalGate;
}

function toBuffer(value) {
  if (typeof value === "string") {
    return intrinsicReflectApply(intrinsicBufferFrom, Buffer, [value, "utf8"]);
  }
  return copyInspectableBytes(value, "Bytekonvertierung");
}

function runGitBytes(git, args, label) {
  if (typeof git !== "function") {
    stop("FRESH_GIT_ADAPTER_REQUIRED", "Lokale Attestierung benötigt einen frischen Git-Adapter.");
  }
  inspectDescriptors(git, "Git-Adapter");
  try {
    return toBuffer(git([...args], { encoding: null }));
  } catch {
    stop("GIT_ATTESTATION_FAILED", `${label} konnte nicht frisch validiert werden.`);
  }
}

function runGitText(git, args, label) {
  return decodeUtf8Fatal(runGitBytes(git, args, label), label).trim();
}

function updateFramed(hash, value) {
  const bytes = toBuffer(value);
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(length);
  hash.update(bytes);
}

function computeSourceHash(blobs) {
  const hash = createHash("sha256");
  hash.update("release-source-v1\0", "utf8");
  updateFramed(hash, Buffer.from(String(FUNCTION_SOURCES.length), "ascii"));
  for (const path of FUNCTION_SOURCES) {
    updateFramed(hash, Buffer.from(path, "utf8"));
    updateFramed(hash, blobs.get(path));
  }
  return hash.digest("hex");
}

function stripTomlComment(line) {
  let single = false;
  let double = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && double) {
      escaped = true;
      continue;
    }
    if (character === "'" && !double) single = !single;
    if (character === '"' && !single) double = !double;
    if (character === "#" && !single && !double) return line.slice(0, index);
  }
  return line;
}

function parseFunctionConfig(configBytes) {
  const source = decodeUtf8Fatal(configBytes, FUNCTION_CONFIG);
  let section = null;
  let projectId;
  let projectCount = 0;
  let functionSectionCount = 0;
  let verifyCount = 0;
  let verifyJwt;
  for (const line of source.split(/\r?\n/)) {
    const visible = stripTomlComment(line).trim();
    if (!visible) continue;
    const sectionMatch = visible.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section === "functions.ai-task") functionSectionCount += 1;
      continue;
    }
    const assignment = visible.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!assignment) stop("FUNCTION_CONFIG_MISMATCH", "Config enthält unerwartete Syntax.");
    const [, key, rawValue] = assignment;
    if (section === null && key === "project_id") {
      projectCount += 1;
      const match = rawValue.match(/^["']([^"']+)["']$/);
      if (!match) stop("FUNCTION_CONFIG_MISMATCH", "project_id ist kein TOML-String.");
      projectId = match[1];
    }
    if (section === "functions.ai-task" && key === "verify_jwt") {
      verifyCount += 1;
      if (rawValue !== "true" && rawValue !== "false") {
        stop("FUNCTION_CONFIG_MISMATCH", "verify_jwt ist kein boolescher TOML-Wert.");
      }
      verifyJwt = rawValue === "true";
    }
  }
  if (projectCount !== 1 || projectId !== PROJECT_ID
      || functionSectionCount !== 1 || verifyCount !== 1 || verifyJwt !== true) {
    stop("FUNCTION_CONFIG_MISMATCH", "Function-Config bindet Projekt/Function/verify_jwt nicht exakt.");
  }
  return { projectId, verifyJwt };
}

function computeDeployContractHash({ sourceSha256, configSha256 }) {
  const bytes = [
    "version=release-contract-v1\n",
    `projectId=${PROJECT_ID}\n`,
    `functionName=${FUNCTION_NAME}\n`,
    "verifyJwt=true\n",
    `sourceSha256=${sourceSha256}\n`,
    `configSha256=${configSha256}\n`,
  ].join("");
  return hashBytes(Buffer.from(bytes, "utf8"));
}

function functionAttestationFromGit(git, finalCommit) {
  const blobs = new Map();
  for (const path of FUNCTION_SOURCES) {
    blobs.set(path, runGitBytes(git, ["show", `${finalCommit}:${path}`], "Function-Raw-Blob"));
  }
  const configBytes = runGitBytes(
    git,
    ["show", `${finalCommit}:${FUNCTION_CONFIG}`],
    "Function-Config-Raw-Blob",
  );
  const migrationBytes = runGitBytes(
    git,
    ["show", `${finalCommit}:${MIGRATION_PATH}`],
    "Migration-Raw-Blob",
  );
  decodeUtf8Fatal(migrationBytes, MIGRATION_PATH);
  const sourceSha256 = computeSourceHash(blobs);
  const configSha256 = hashBytes(configBytes);
  const migrationSha256 = hashBytes(migrationBytes);
  const { projectId, verifyJwt } = parseFunctionConfig(configBytes);
  const deployContractSha256 = computeDeployContractHash({ sourceSha256, configSha256 });
  if (sourceSha256 !== EXPECTED_SOURCE_SHA256
      || configSha256 !== EXPECTED_CONFIG_SHA256
      || deployContractSha256 !== EXPECTED_DEPLOY_CONTRACT_SHA256
      || migrationSha256 !== EXPECTED_MIGRATION_SHA256) {
    stop("FUNCTION_RAW_BLOB_MISMATCH", "Raw-Git-Blobs weichen von der Attestierung ab.");
  }
  return Object.freeze({
    finalCommit,
    commit: finalCommit,
    buildVersion: finalCommit,
    localRefCommit: finalCommit,
    targetBranch: TARGET_BRANCH,
    localRef: ALLOWED_REMOTE_REF,
    e17aBaseline: E17A_BASELINE,
    projectId,
    functionName: FUNCTION_NAME,
    verifyJwt,
    configDatei: FUNCTION_CONFIG,
    dateien: Object.freeze([...FUNCTION_SOURCES]),
    sourceSha256,
    configSha256,
    deployContractSha256,
    migrationSha256,
  });
}

export function attestLocalContract(options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "Lokale Git-Attestierungsoptionen");
  const finalCommit = descriptorDataValue(optionDescriptors, "finalCommit");
  const git = descriptorDataValue(optionDescriptors, "git");
  const validCommit = assertCommit(finalCommit);
  if (runGitText(git, ["rev-parse", "HEAD"], "HEAD") !== validCommit) {
    stop("HEAD_COMMIT_MISMATCH", "HEAD weicht vom angeforderten Finalcommit ab.");
  }
  if (runGitText(
    git,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    "Git-Status",
  ) !== "") {
    stop("DIRTY_WORKTREE", "Contractattestierung verlangt einen vollständig cleanen Worktree.");
  }
  const branch = runGitText(git, ["symbolic-ref", "-q", "HEAD"], "Zielbranch");
  if (branch !== ALLOWED_REMOTE_REF) {
    stop("TARGET_BRANCH_MISMATCH", "HEAD ist nicht exakt auf dem erlaubten Zielbranch.");
  }
  const refLine = runGitText(
    git,
    ["show-ref", "--verify", ALLOWED_REMOTE_REF],
    "Erlaubte Ref",
  );
  if (refLine !== `${validCommit} ${ALLOWED_REMOTE_REF}`) {
    stop("REMOTE_REF_OBJECT_MISMATCH", "Erlaubte Ref zeigt nicht exakt auf den Finalcommit.");
  }
  runGitBytes(
    git,
    ["merge-base", "--is-ancestor", E17A_BASELINE, validCommit],
    "E17A-Baseline",
  );
  const migrationPaths = runGitText(
    git,
    ["ls-tree", "-r", "--name-only", validCommit, "supabase/migrations"],
    "Committed Migrationssatz",
  ).split(/\r?\n/).filter(Boolean);
  validateCommittedMigrationSet(migrationPaths);
  const functionAttestation = functionAttestationFromGit(git, validCommit);
  const attestation = Object.freeze({
    type: "fresh-local-git-context",
    finalCommit: validCommit,
    branch,
    allowedRemoteRef: ALLOWED_REMOTE_REF,
    refCommit: validCommit,
    localRefCommit: validCommit,
    functionAttestation,
    adapterProvenance: "injected-test-only",
    runtimeAuthorized: false,
  });
  weakSetAdd(localTestAttestationBrand, attestation);
  return attestation;
}

export function validateFunctionAttestation(info, finalCommit, localAttestation) {
  assertNoCanonicalV2Artifacts(info, "Function-Sink");
  const validCommit = assertCommit(finalCommit);
  if (!localAttestation
      || (!weakSetHas(localAttestationBrand, localAttestation)
        && !weakSetHas(localTestAttestationBrand, localAttestation))
      || localAttestation.finalCommit !== validCommit) {
    stop("FRESH_GIT_CONTEXT_REQUIRED", "Function-Attestierung braucht frische Same-Process-Gitprovenienz.");
  }
  const expected = localAttestation.functionAttestation;
  if (!isPlainObject(info)
      || canonicalJson(info) !== canonicalJson(expected)
      || info.finalCommit !== validCommit
      || info.buildVersion !== validCommit
      || info.localRefCommit !== validCommit
      || Object.hasOwn(info, "remoteRefCommit")) {
    stop("FUNCTION_ATTESTATION_MISMATCH", "Function-Attestierung stimmt nicht mit Raw-Git-Kontext überein.");
  }
  return info;
}

const FRESH_REMOTE_GIT_ACTIONS = new Set(["function-release", "db-apply"]);
const freshRemoteGitBrand = new WeakSet();
const freshRemoteGitExecutorProofBrand = new WeakSet();

export function describeFreshRemoteGitContract({ finalCommit, runId, action } = {}) {
  const validCommit = assertCommit(finalCommit);
  const validRunId = assertRunId(runId, validCommit);
  if (!setHas(FRESH_REMOTE_GIT_ACTIONS, action)) {
    stop("FRESH_REMOTE_GIT_ACTION_MISMATCH", "FreshRemoteGit braucht eine feste Mutationsaktion.");
  }
  return Object.freeze({
    operation: "git-ls-remote",
    executable: "git",
    argv: Object.freeze(["ls-remote", "--exit-code", "origin", ALLOWED_REMOTE_REF]),
    origin: "origin",
    ref: ALLOWED_REMOTE_REF,
    finalCommit: validCommit,
    runId: validRunId,
    targetId: TARGET_ID,
    action,
    expectedOutput: `${validCommit}\t${ALLOWED_REMOTE_REF}\n`,
    sinkConsumable: false,
    transcriptTrusted: false,
  });
}

export function parseFreshRemoteGitOutput(output, options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "FreshRemoteGit-Optionen");
  const finalCommit = descriptorDataValue(optionDescriptors, "finalCommit");
  const runId = descriptorDataValue(optionDescriptors, "runId");
  const action = descriptorDataValue(optionDescriptors, "action");
  const suppliedExpectedRunId = descriptorDataValue(optionDescriptors, "expectedRunId");
  const suppliedExpectedAction = descriptorDataValue(optionDescriptors, "expectedAction");
  const suppliedExpectedTargetId = descriptorDataValue(optionDescriptors, "expectedTargetId");
  const suppliedSecrets = descriptorDataValue(optionDescriptors, "secrets");
  const expectedRunId = suppliedExpectedRunId === undefined ? runId : suppliedExpectedRunId;
  const expectedAction = suppliedExpectedAction === undefined ? action : suppliedExpectedAction;
  const expectedTargetId = suppliedExpectedTargetId === undefined
    ? TARGET_ID
    : suppliedExpectedTargetId;
  const secrets = suppliedSecrets === undefined ? [] : suppliedSecrets;
  const contract = describeFreshRemoteGitContract({ finalCommit, runId, action });
  if (contract.runId !== expectedRunId
      || contract.action !== expectedAction
      || contract.targetId !== expectedTargetId) {
    stop("FRESH_REMOTE_GIT_CONTEXT_MISMATCH", "FreshRemoteGit ist cross-run/target/action substituiert.");
  }
  assertNoSecretExposure(output, secrets);
  const text = decodeUtf8Fatal(output, "git ls-remote");
  if (text !== contract.expectedOutput) {
    stop("FRESH_REMOTE_GIT_OUTPUT_MISMATCH", "git ls-remote lieferte nicht exakt eine gebundene Refzeile.");
  }
  return Object.freeze({
    type: "observed-fresh-remote-git-transcript",
    origin: contract.origin,
    ref: contract.ref,
    finalCommit: contract.finalCommit,
    runId: contract.runId,
    targetId: contract.targetId,
    action: contract.action,
    outputDigest: hashBytes(toBuffer(output)),
    trusted: false,
  });
}

function brandFreshRemoteGitProof(observed, executorProof) {
  if (!executorProof || !weakSetHas(freshRemoteGitExecutorProofBrand, executorProof)) {
    stop("FRESH_REMOTE_GIT_EXECUTOR_REQUIRED", "Nur ein späterer same-process Executorbeleg darf FreshRemoteGit branden.");
  }
  if (!observed || observed.type !== "observed-fresh-remote-git-transcript"
      || observed.trusted !== false
      || !exactKeys(observed, [
        "action", "finalCommit", "origin", "outputDigest", "ref", "runId", "targetId",
        "trusted", "type",
      ])
      || executorProof.operation !== "git-ls-remote"
      || executorProof.origin !== observed.origin
      || executorProof.ref !== observed.ref
      || executorProof.finalCommit !== observed.finalCommit
      || executorProof.runId !== observed.runId
      || executorProof.targetId !== observed.targetId
      || executorProof.action !== observed.action
      || executorProof.outputDigest !== observed.outputDigest) {
    stop("FRESH_REMOTE_GIT_EXECUTOR_MISMATCH", "Executorbeleg und strikt geparstes Remote-Git-Objekt driften.");
  }
  const proof = Object.freeze({
    type: "fresh-remote-git-proof",
    origin: observed.origin,
    ref: observed.ref,
    finalCommit: observed.finalCommit,
    runId: observed.runId,
    targetId: observed.targetId,
    action: observed.action,
    outputDigest: observed.outputDigest,
  });
  weakSetAdd(freshRemoteGitBrand, proof);
  return proof;
}

function ownerReceiptParts({ role, finalCommit, runId, preimageRole, preimageDigest, remoteTargetDigest, prerequisites }) {
  const context = {
    schema: "e17b-owner-gate-context-v1",
    role,
    mode: expectedMode(role),
    finalCommit,
    runId,
    projectId: PROJECT_ID,
    targetId: TARGET_ID,
    targetBranch: TARGET_BRANCH,
    allowedRemoteRef: ALLOWED_REMOTE_REF,
    e17aBaseline: E17A_BASELINE,
    prerequisites,
  };
  const action = {
    schema: "e17b-owner-gate-action-v1",
    role,
    mode: expectedMode(role),
    finalCommit,
    runId,
    targetId: TARGET_ID,
    preimageRole,
    preimageDigest,
    remoteTargetDigest,
  };
  const contextDigest = hashBytes(Buffer.from(canonicalJson(context), "utf8"));
  const actionDigest = hashBytes(Buffer.from(canonicalJson(action), "utf8"));
  const receipt = {
    schema: "e17b-owner-gate-receipt-v1",
    receiptType: "owner-gate-receipt",
    contextDigest,
    actionDigest,
  };
  return Object.freeze({
    contextDigest,
    actionDigest,
    gateReceiptDigest: hashBytes(Buffer.from(canonicalJson(receipt), "utf8")),
  });
}

function checkpointRole(mode) {
  if (mode === "function-release") return "30-function-checkpoint";
  if (mode === "db-apply") return "40-db-checkpoint";
  stop("OWNER_GATE_NOT_ALLOWED", "Nur Function- und DB-Apply besitzen Owner-Gate-Receipts.");
}

export function inspectOwnerCheckpoint(options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "Owner-Checkpoint-Optionen");
  const mode = descriptorDataValue(optionDescriptors, "mode");
  const finalCommit = descriptorDataValue(optionDescriptors, "finalCommit");
  const runId = descriptorDataValue(optionDescriptors, "runId");
  const checkpoint = descriptorDataValue(optionDescriptors, "checkpoint");
  const evidenceByRole = descriptorDataValue(optionDescriptors, "evidenceByRole");
  inspectOrdinaryDataObject(checkpoint, "Owner-Checkpoint");
  inspectOrdinaryDataObject(evidenceByRole, "Owner-Evidencegraph");
  const role = checkpointRole(mode);
  const validCommit = assertCommit(finalCommit);
  assertRunId(runId, validCommit);
  const bound = collectPrerequisiteDigests({
    role,
    mode,
    finalCommit: validCommit,
    runId,
    evidenceByRole,
  });
  validateEvidenceRecord(checkpoint);
  if (checkpoint.role !== role
      || checkpoint.finalCommit !== validCommit
      || checkpoint.runId !== runId
      || canonicalJson(checkpoint.prerequisites) !== canonicalJson(bound.prerequisites)) {
    stop("OWNER_GATE_RECEIPT_MISMATCH", "Owner-Gate-Receipt gehört zu anderem Objekt.");
  }
  const preimageRole = mode === "function-release"
    ? "11-function-preimage"
    : "12-db-preimage";
  const preimageItem = evidenceByRole[preimageRole];
  const readPreflight = evidenceByRole["10-read-preflight"];
  const preimageDigest = preimageItem.digest;
  const remoteTargetDigest = readPreflight.record.facts.remoteTargetDigest;
  if (checkpoint.facts.preimageDigest !== preimageDigest
      || checkpoint.facts.remoteTargetDigest !== remoteTargetDigest) {
    stop("OWNER_GATE_RECEIPT_MISMATCH", "Receipt bindet nicht das tatsächliche Preimage/Target.");
  }
  const expected = ownerReceiptParts({
    role,
    finalCommit: validCommit,
    runId,
    preimageRole,
    preimageDigest,
    remoteTargetDigest,
    prerequisites: bound.prerequisites,
  });
  const prerequisitesDigest = hashBytes(Buffer.from(
    canonicalJson(bound.prerequisites),
    "utf8",
  ));
  const roleGraphDigest = hashBytes(Buffer.from(canonicalJson({
    role,
    mode,
    prerequisites: bound.prerequisites,
    facts: checkpoint.facts,
  }), "utf8"));
  if (checkpoint.facts.contextDigest !== expected.contextDigest
      || checkpoint.facts.actionDigest !== expected.actionDigest
      || checkpoint.facts.gateReceiptDigest !== expected.gateReceiptDigest) {
    stop("OWNER_GATE_RECEIPT_MISMATCH", "Receipt-Digests sind substituiert.");
  }
  return Object.freeze({
    receiptType: "owner-gate-receipt",
    role,
    preimageRole,
    preimageDigest,
    remoteTargetDigest,
    contextDigest: expected.contextDigest,
    actionDigest: expected.actionDigest,
    gateReceiptDigest: expected.gateReceiptDigest,
    prerequisitesDigest,
    roleGraphDigest,
    trusted: false,
  });
}

export function inspectOwnerGateReceipt(options = {}) {
  return inspectOwnerCheckpoint(options);
}

export function validateOwnerCheckpoint(options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "Owner-Validierungsoptionen");
  const ownerGate = descriptorDataValue(optionDescriptors, "ownerGate");
  const localAttestation = descriptorDataValue(optionDescriptors, "localAttestation");
  const targetBinding = descriptorDataValue(optionDescriptors, "targetBinding");
  const finalCommit = descriptorDataValue(optionDescriptors, "finalCommit");
  const runId = descriptorDataValue(optionDescriptors, "runId");
  const mode = descriptorDataValue(optionDescriptors, "mode");
  const preimageContext = descriptorDataValue(optionDescriptors, "preimageContext");
  const inspected = inspectOwnerCheckpoint(options);
  if (!ownerGate || !weakSetHas(ownerGateBrand, ownerGate)) {
    stop(
      "OWNER_GATE_PROVENANCE_REQUIRED",
      "Persistiertes Receipt ist keine frische prozedurale Owner-Authorization.",
    );
  }
  if (!localAttestation || !weakSetHas(localAttestationBrand, localAttestation)
      || localAttestation.finalCommit !== finalCommit) {
    stop("FRESH_GIT_CONTEXT_REQUIRED", "Owner-Gate braucht frische Same-Process-Gitprovenienz.");
  }
  const target = requireFreshRemoteTarget(
    targetBinding,
    finalCommit,
    runId,
  );
  if (target.runtimeDigest !== inspected.remoteTargetDigest) {
    stop("REMOTE_TARGET_OBJECT_MISMATCH", "Owner-Gate und Runtime-Target weichen ab.");
  }
  const expectedPreimageBrand = mode === "function-release"
    ? functionPreimageContextBrand
    : dbPreimageContextBrand;
  if (!preimageContext || !weakSetHas(expectedPreimageBrand, preimageContext)
      || preimageContext.finalCommit !== finalCommit
      || preimageContext.runId !== runId
      || preimageContext.targetId !== TARGET_ID
      || preimageContext.preimageRole !== inspected.preimageRole
      || preimageContext.preimageDigest !== inspected.preimageDigest
      || preimageContext.remoteTargetDigest !== inspected.remoteTargetDigest) {
    stop("FRESH_PREIMAGE_CONTEXT_REQUIRED", "Owner-Gate braucht frisch revalidiertes Preimage.");
  }
  if (ownerGate.finalCommit !== finalCommit
      || ownerGate.runId !== runId
      || ownerGate.targetId !== TARGET_ID
      || ownerGate.mode !== mode
      || ownerGate.contextDigest !== inspected.contextDigest
      || ownerGate.actionDigest !== inspected.actionDigest
      || ownerGate.gateReceiptDigest !== inspected.gateReceiptDigest) {
    stop("OWNER_GATE_OBJECT_MISMATCH", "Prozedurale Owner-Authorization gehört zu anderem Objekt.");
  }
  const authorization = Object.freeze({
    ...inspected,
    type: "verified-owner-authorization",
    mode,
    finalCommit,
    runId,
    targetId: TARGET_ID,
    runtimeAuthorized: true,
  });
  weakSetAdd(verifiedOwnerAuthorizationBrand, authorization);
  return authorization;
}

export function validateDbPrewrite(options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "DB-Prewrite-Optionen");
  const finalCommit = descriptorDataValue(optionDescriptors, "finalCommit");
  const runId = descriptorDataValue(optionDescriptors, "runId");
  const checkpoint = descriptorDataValue(optionDescriptors, "checkpoint");
  const evidenceByRole = descriptorDataValue(optionDescriptors, "evidenceByRole");
  const authorized = validateOwnerCheckpoint({
    mode: "db-apply",
    finalCommit,
    runId,
    checkpoint,
    evidenceByRole,
    ownerGate: descriptorDataValue(optionDescriptors, "ownerGate"),
    localAttestation: descriptorDataValue(optionDescriptors, "localAttestation"),
    targetBinding: descriptorDataValue(optionDescriptors, "targetBinding"),
    preimageContext: descriptorDataValue(optionDescriptors, "preimageContext"),
  });
  const evidenceDescriptors = inspectOrdinaryDataObject(evidenceByRole, "DB-Prewrite-Evidencegraph");
  const dbPreimage = descriptorDataValue(evidenceDescriptors, "12-db-preimage");
  if (!dbPreimage
      || dbPreimage.digest !== authorized.preimageDigest
      || dbPreimage.record.finalCommit !== finalCommit
      || dbPreimage.record.runId !== runId
      || dbPreimage.record.targetId !== TARGET_ID
      || dbPreimage.record.facts.remoteTargetDigest !== authorized.remoteTargetDigest) {
    stop("DB_PREWRITE_OBJECT_MISMATCH", "DB-Preimage/Receipt/Run gehören nicht zum selben Objekt.");
  }
  weakSetAdd(dbWriteAuthorizationBrand, authorized);
  return authorized;
}

function isCanonicalIndexKey(key, length) {
  if (typeof key !== "string" || key === "" || key === "-0") return false;
  if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && `${index}` === key;
}

function assertExactIndexedDescriptors(descriptors, length, label, { allowLength = false } = {}) {
  const keys = intrinsicOwnKeys(descriptors);
  let numericCount = 0;
  for (const key of keys) {
    if (allowLength && key === "length") continue;
    if (typeof key === "symbol" || !isCanonicalIndexKey(key, length)) {
      stop("SECRET_GUARD_UNINSPECTABLE", `${label} enthält zusätzliche Properties.`);
    }
    numericCount += 1;
  }
  if (numericCount !== length) {
    stop("SECRET_GUARD_UNINSPECTABLE", `${label} ist sparse oder unvollständig.`);
  }
}

function inspectByteValue(value, label) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return null;
  const inspected = inspectDescriptors(value, label);
  const isBuffer = intrinsicBufferIsBuffer(value);
  const isBytes = intrinsicIsUint8Array(value);
  if (!isBuffer && !isBytes) return null;
  const expectedPrototype = isBuffer ? intrinsicBufferPrototype : intrinsicUint8ArrayPrototype;
  if (inspected.prototype !== expectedPrototype) {
    stop("SECRET_GUARD_UNINSPECTABLE", `${label} besitzt eine manipulierte Byte-Prototypkette.`);
  }
  let buffer;
  let byteOffset;
  let byteLength;
  try {
    buffer = intrinsicReflectApply(intrinsicByteBufferGetter, value, []);
    byteOffset = intrinsicReflectApply(intrinsicByteOffsetGetter, value, []);
    byteLength = intrinsicReflectApply(intrinsicByteLengthGetter, value, []);
  } catch {
    stop("SECRET_GUARD_UNINSPECTABLE", `${label} besitzt keine stabilen Byte-Internal-Slots.`);
  }
  assertExactIndexedDescriptors(inspected.descriptors, byteLength, label);
  const view = new intrinsicUint8Array(buffer, byteOffset, byteLength);
  const copy = intrinsicReflectApply(intrinsicBufferFrom, Buffer, [view]);
  return { copy, descriptors: inspected.descriptors, byteLength };
}

function copyInspectableBytes(value, label) {
  const inspected = inspectByteValue(value, label);
  if (!inspected) {
    stop("SECRET_GUARD_UNINSPECTABLE", `${label} akzeptiert nur native Buffer/Uint8Array.`);
  }
  return inspected.copy;
}

function assertSecretList(secrets) {
  if (secrets === null || (typeof secrets !== "object" && typeof secrets !== "function")) {
    stop("INVALID_SECRET_SET", "Secretguard benötigt eine explizite Liste.");
  }
  const { descriptors, prototype } = inspectDescriptors(secrets, "Secretliste");
  if (!intrinsicArrayIsArray(secrets) || prototype !== intrinsicArrayPrototype) {
    stop("INVALID_SECRET_SET", "Secretguard benötigt ein gewöhnliches Array.");
  }
  const lengthDescriptor = descriptors.length;
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > 256) {
    stop("INVALID_SECRET_SET", "Secretguard erhielt eine ungültige Listengröße.");
  }
  try {
    assertExactIndexedDescriptors(descriptors, length, "Secretliste", { allowLength: true });
  } catch (error) {
    if (error?.reasonCode === "SECRET_GUARD_UNINSPECTABLE") {
      stop("INVALID_SECRET_SET", "Secretguard benötigt ein dichtes unverziertes Array.");
    }
    throw error;
  }
  const needles = [];
  for (let index = 0; index < length; index += 1) {
    const secret = descriptors[`${index}`].value;
    if (typeof secret !== "string" || secret.length < 1 || secret.length > 8192
        || /[\0\r\n]/.test(secret)) {
      stop("INVALID_SECRET_SET", "Secretguard erhielt einen ungültigen Marker.");
    }
    needles.push({
      text: secret,
      bytes: intrinsicReflectApply(intrinsicBufferFrom, Buffer, [secret, "utf8"]),
    });
  }
  return needles;
}

function stringContains(haystack, needle) {
  if (needle.length > haystack.length) return false;
  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function bytesContain(haystack, needle) {
  if (needle.length > haystack.length) return false;
  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

export function assertNoSecretExposure(value, secrets) {
  assertSecurityRuntimeIntegrity();
  assertNoCanonicalV2Artifacts(value, "Secret-/Ausgabesink");
  const needles = assertSecretList(secrets);
  const visited = new WeakSet();
  function visit(current) {
    if (typeof current === "symbol") {
      stop("SECRET_GUARD_UNINSPECTABLE", "Secretguard stringifiziert keine Symbole.");
    }
    if (typeof current === "string") {
      for (const needle of needles) {
        if (stringContains(current, needle.text)) {
          stop("SECRET_EXPOSURE", "Secretguard blockiert einen Ausgabepfad.");
        }
      }
      return;
    }
    if (current === null || (typeof current !== "object" && typeof current !== "function")) return;
    const byteValue = inspectByteValue(current, "Secretguard-Bytes");
    if (byteValue) {
      for (const needle of needles) {
        if (bytesContain(byteValue.copy, needle.bytes)) {
          stop("SECRET_EXPOSURE", "Secretguard blockiert einen Byte-Ausgabepfad.");
        }
      }
      return;
    }
    if (weakSetHas(visited, current)) return;
    weakSetAdd(visited, current);
    const { descriptors, prototype } = inspectDescriptors(current, "Secretguard");
    const ownKeys = intrinsicOwnKeys(descriptors);
    for (const key of ownKeys) {
      if (typeof key === "symbol") {
        stop("SECRET_GUARD_UNINSPECTABLE", "Secretguard stringifiziert keine Symbol-Keys.");
      }
      visit(key);
      if (key === "toJSON") {
        stop("SECRET_GUARD_UNINSPECTABLE", "Secretguard blockiert eigene toJSON-Hooks.");
      }
      const descriptor = descriptors[key];
      visit(descriptor.value);
    }
    if (typeof current === "function") {
      stop("SECRET_GUARD_UNINSPECTABLE", "Secretguard führt oder stringifiziert keine Funktionen.");
    }
    const array = intrinsicArrayIsArray(current);
    const nativeError = intrinsicIsNativeError(current);
    if (array) {
      const length = descriptors.length?.value;
      if (prototype !== intrinsicArrayPrototype || !Number.isSafeInteger(length) || length < 0) {
        stop("SECRET_GUARD_UNINSPECTABLE", "Secretguard blockiert manipulierte Arrays.");
      }
      assertExactIndexedDescriptors(descriptors, length, "Secretguard-Array", { allowLength: true });
    }
    const allowedPrototype = prototype === null
      || prototype === intrinsicObjectPrototype
      || (array && prototype === intrinsicArrayPrototype)
      || (nativeError && prototype === intrinsicErrorPrototype);
    if (!allowedPrototype) {
      // Deskriptoren einer fremden Prototypkette werden niemals als Daten gelesen.
      // Schon ihre Existenz macht den Pfad für Ausgabe/Hashing uninspizierbar.
      stop("SECRET_GUARD_UNINSPECTABLE", "Secretguard blockiert manipulierte Prototypketten.");
    }
  }
  visit(value);
  return true;
}

const SAFE_OUTPUT_REASON_CODES = new Set([
  "ERROR",
  "REMOTE_PAYLOAD_PENDING",
  "INVALID_ARGUMENTS",
  "INVALID_COMMIT",
  "INVALID_RUN_ID",
  "RUN_ID_COMMIT_MISMATCH",
  "INVALID_SNAPSHOT_ID",
  "INVALID_EVIDENCE",
  "INVALID_EVIDENCE_STATE",
  "INVALID_PREREQUISITE_SET",
  "INVALID_PREREQUISITE_EDGES",
  "PREREQUISITE_GRAPH_MISMATCH",
  "EXECUTOR_PROVENANCE_REQUIRED",
  "EXECUTOR_PROOF_OBJECT_MISMATCH",
  "SECRET_EXPOSURE",
  "SECRET_GUARD_UNINSPECTABLE",
  "SUPABASE_CLI_TOCTOU",
  "SUPABASE_COMMAND_REJECTED",
  "PG_COMMAND_REJECTED",
  "MIGRATION_TRANSACTION_INJECTION",
  "INVALID_FINAL_CHECKPOINT",
]);

export function safeErrorForOutput(error, secrets = []) {
  try {
    assertNoSecretExposure(error, secrets);
  } catch (guardError) {
    if (guardError?.reasonCode === "SECRET_EXPOSURE"
        || guardError?.reasonCode === "SECRET_GUARD_UNINSPECTABLE") {
      return "E17B_STOP:REDACTED";
    }
    throw guardError;
  }
  function ownDataString(value, key) {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return null;
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    return descriptor && Object.hasOwn(descriptor, "value")
      && typeof descriptor.value === "string" ? descriptor.value : null;
  }
  const candidate = ownDataString(error, "reasonCode")
    ?? ownDataString(error, "code")
    ?? "ERROR";
  const code = setHas(SAFE_OUTPUT_REASON_CODES, candidate)
    ? candidate
    : /^[A-Z][A-Z0-9_]{0,63}$/.test(candidate) ? "REDACTED" : "ERROR";
  return `E17B_STOP:${code}`;
}

function runDirIdentity(runDir) {
  if (typeof runDir !== "string" || !isAbsolute(runDir) || dirname(runDir) !== "/private/tmp") {
    stop("INVALID_RUN_DIR", "RunDir muss direkt unter /private/tmp liegen.");
  }
  const parsed = parseRunId(basename(runDir));
  return { ...parsed, runDir };
}

export function validateRunDir(runDir, {
  fsApi = { lstatSync, statSync, realpathSync },
  uid = process.getuid?.(),
  finalCommit,
} = {}) {
  const identity = runDirIdentity(runDir);
  if (finalCommit !== undefined && identity.finalCommit !== assertCommit(finalCommit)) {
    stop("RUN_DIR_COMMIT_MISMATCH", "RunDir gehört zu einem anderen Finalcommit.");
  }
  let linkStat;
  let stat;
  let real;
  try {
    linkStat = fsApi.lstatSync(runDir);
    stat = fsApi.statSync(runDir);
    real = fsApi.realpathSync(runDir);
  } catch {
    stop("INVALID_RUN_DIR", "RunDir ist nicht vollständig validierbar.");
  }
  if (linkStat.isSymbolicLink?.()
      || !stat.isDirectory?.()
      || real !== runDir
      || (stat.mode & 0o777) !== 0o700
      || !Number.isSafeInteger(uid)
      || stat.uid !== uid) {
    stop("INVALID_RUN_DIR", "RunDir verletzt Realpath/Owner/Mode/Target-Gates.");
  }
  return Object.freeze(identity);
}

export function createRunDir(finalCommit, {
  randomBytes = secureRandomBytes,
  fsApi = { mkdirSync, lstatSync, statSync, realpathSync },
  uid = process.getuid?.(),
} = {}) {
  const validCommit = assertCommit(finalCommit);
  const suffix = toBuffer(randomBytes(8)).toString("hex");
  if (!/^[0-9a-f]{16}$/.test(suffix)) {
    stop("INVALID_RUN_RANDOMNESS", "RunDir-Suffix besitzt nicht exakt 64 Bit.");
  }
  const runDir = `/private/tmp/kinodreieck-e17b-${validCommit}-${suffix}`;
  try {
    fsApi.mkdirSync(runDir, { mode: 0o700, recursive: false });
  } catch {
    stop("RUN_DIR_CREATE_FAILED", "RunDir konnte nicht atomar angelegt werden.");
  }
  validateRunDir(runDir, { fsApi, uid, finalCommit: validCommit });
  return runDir;
}

function validateOwnedDirectory(path, {
  fsApi,
  uid,
  reasonCode,
}) {
  let linkStat;
  let stat;
  let real;
  try {
    linkStat = fsApi.lstatSync(path);
    stat = fsApi.statSync(path);
    real = fsApi.realpathSync(path);
  } catch {
    stop(reasonCode, "Lokales Layoutverzeichnis fehlt oder ist nicht prüfbar.");
  }
  if (linkStat.isSymbolicLink?.()
      || !stat.isDirectory?.()
      || real !== path
      || (stat.mode & 0o777) !== 0o700
      || !Number.isSafeInteger(uid)
      || stat.uid !== uid) {
    stop(reasonCode, "Lokales Layout verletzt Realpath/Owner/Mode/Link-Gates.");
  }
  return path;
}

export function createFunctionDownloadDir(runDir, {
  fsApi = { mkdirSync, lstatSync, statSync, realpathSync, readdirSync },
  uid = process.getuid?.(),
  finalCommit,
} = {}) {
  const run = validateRunDir(runDir, { fsApi, uid, finalCommit });
  const path = join(run.runDir, "function-preimage");
  try {
    fsApi.mkdirSync(path, { mode: 0o700, recursive: false });
  } catch {
    stop("FUNCTION_DOWNLOAD_DIR_CLOBBER", "Function-Download-RunDir existiert bereits.");
  }
  return validateFunctionDownloadDir(runDir, { fsApi, uid, finalCommit: run.finalCommit });
}

export function validateFunctionDownloadDir(runDir, {
  fsApi = { lstatSync, statSync, realpathSync, readdirSync },
  uid = process.getuid?.(),
  finalCommit,
  requireEmpty = true,
} = {}) {
  const run = validateRunDir(runDir, { fsApi, uid, finalCommit });
  const path = validateOwnedDirectory(join(run.runDir, "function-preimage"), {
    fsApi,
    uid,
    reasonCode: "INVALID_FUNCTION_DOWNLOAD_DIR",
  });
  let entries;
  try {
    entries = fsApi.readdirSync(path);
  } catch {
    stop("INVALID_FUNCTION_DOWNLOAD_DIR", "Function-Download-RunDir ist nicht lesbar.");
  }
  if (requireEmpty && entries.length !== 0) {
    stop("FUNCTION_DOWNLOAD_DIR_CLOBBER", "Function-Download darf keinen bestehenden Inhalt überschreiben.");
  }
  return path;
}

function evidencePath(runDir, role) {
  if (!EVIDENCE_ROLES.includes(role)) {
    stop("INVALID_EVIDENCE_ROLE", "Evidence-Dateipfad besitzt unbekannte Rolle.");
  }
  return join(runDir, `${role}.json`);
}

function validateEvidenceFile(path, runDir, stat, linkStat, real, uid) {
  const rel = relative(runDir, path);
  if (linkStat.isSymbolicLink?.()
      || !stat.isFile?.()
      || stat.nlink !== 1
      || (stat.mode & 0o777) !== 0o600
      || stat.uid !== uid
      || real !== path
      || rel.startsWith(`..${sep}`)
      || rel === ".."
      || isAbsolute(rel)) {
    stop("INVALID_EVIDENCE_FILE", "Evidence verletzt File/Link/Owner/Mode/Target-Gates.");
  }
}

export function readEvidence(runDir, role, {
  fsApi = { lstatSync, statSync, realpathSync, readFileSync },
  uid = process.getuid?.(),
  finalCommit,
  secrets = [],
} = {}) {
  const run = validateRunDir(runDir, { fsApi, uid, finalCommit });
  const path = evidencePath(runDir, role);
  let linkStat;
  let stat;
  let real;
  let bytes;
  try {
    linkStat = fsApi.lstatSync(path);
    stat = fsApi.statSync(path);
    real = fsApi.realpathSync(path);
    validateEvidenceFile(path, runDir, stat, linkStat, real, uid);
    bytes = toBuffer(fsApi.readFileSync(path));
  } catch (error) {
    if (error instanceof E17BStop) throw error;
    stop("EVIDENCE_READ_FAILED", "Evidence konnte nicht sicher gelesen werden.");
  }
  assertNoSecretExposure(bytes, secrets);
  const text = decodeUtf8Fatal(bytes, "Evidence");
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    stop("INVALID_EVIDENCE_JSON", "Evidence ist kein JSON-Record.");
  }
  validateEvidenceRecord(record);
  if (record.role !== role
      || record.runId !== run.runId
      || record.finalCommit !== run.finalCommit
      || record.targetId !== TARGET_ID) {
    stop("EVIDENCE_OBJECT_MISMATCH", "Evidence-Datei gehört zu anderem Run/Target/Commit.");
  }
  const canonicalBytes = canonicalRecordBytes(record);
  if (!bytes.equals(canonicalBytes)) {
    stop("NON_CANONICAL_EVIDENCE", "Persistierte Evidence ist nicht kanonisch codiert.");
  }
  return Object.freeze({
    path,
    record,
    bytes,
    digest: hashBytes(bytes),
    provenance: "observed",
    trusted: false,
  });
}

function assertWritableRecordProvenance(record) {
  if (record.state === "contract" && !weakSetHas(contractRecordBrand, record)) {
    stop("CONTRACT_PROVENANCE_REQUIRED", "Contractrecord wurde nicht im aktuellen Prozess gebaut.");
  }
  if (record.state === "pending" && !weakSetHas(pendingRecordBrand, record)) {
    stop("PENDING_PROVENANCE_REQUIRED", "Pendingrecord wurde nicht im aktuellen Prozess gebaut.");
  }
  if (record.state === "ok" && !weakSetHas(successRecordBrand, record)) {
    stop("SUCCESS_PROVENANCE_REQUIRED", "Persistierte/freie Successfields sind kein Runtimebeleg.");
  }
  if (record.state === "checkpoint") {
    if (record.role !== "99-final-checkpoint" || !weakSetHas(finalCheckpointRecordBrand, record)) {
      stop(
        "TRANSCRIPT_PROVENANCE_REQUIRED",
        "Persistierte/freie Owner-/Final-Receipts besitzen keine Runtimeprovenienz.",
      );
    }
  }
}

function loadPrerequisiteMap(runDir, record, options) {
  const roles = expectedPrerequisites(
    record.role,
    record.mode,
    record.prerequisiteVariant,
  );
  return Object.fromEntries(roles.map((role) => [
    role,
    readEvidence(runDir, role, {
      fsApi: options.fsApi,
      uid: options.uid,
      finalCommit: record.finalCommit,
      secrets: options.secrets,
    }),
  ]));
}

export function writeEvidence(runDir, record, {
  fsApi = {
    lstatSync,
    statSync,
    realpathSync,
    readFileSync,
    openSync,
    writeFileSync,
    fchmodSync,
    fsyncSync,
    closeSync,
    linkSync,
    unlinkSync,
  },
  uid = process.getuid?.(),
  secrets = [],
  randomBytes = secureRandomBytes,
} = {}) {
  validateEvidenceRecord(record);
  assertWritableRecordProvenance(record);
  const run = validateRunDir(runDir, { fsApi, uid, finalCommit: record.finalCommit });
  if (record.runId !== run.runId || record.targetId !== TARGET_ID) {
    stop("EVIDENCE_OBJECT_MISMATCH", "Write-Record gehört zu anderem Run/Target.");
  }
  const prerequisiteMap = loadPrerequisiteMap(runDir, record, {
    fsApi,
    uid,
    secrets,
  });
  const bound = collectPrerequisiteDigests({
    role: record.role,
    mode: record.mode,
    finalCommit: record.finalCommit,
    runId: record.runId,
    evidenceByRole: prerequisiteMap,
    prerequisiteVariant: record.prerequisiteVariant,
  });
  if (canonicalJson(record.prerequisites) !== canonicalJson(bound.prerequisites)) {
    stop("PREREQUISITE_GRAPH_MISMATCH", "Write-Record bindet nicht die gelesene Hashkette.");
  }
  assertNoSecretExposure(record, secrets);
  const bytes = canonicalRecordBytes(record);
  assertNoSecretExposure(bytes, secrets);
  const target = evidencePath(runDir, record.role);
  const suffix = toBuffer(randomBytes(8)).toString("hex");
  if (!/^[0-9a-f]{16}$/.test(suffix)) {
    stop("INVALID_WRITE_RANDOMNESS", "Evidence-Tempname besitzt nicht exakt 64 Bit.");
  }
  const temporary = join(runDir, `.${record.role}.${suffix}.tmp`);
  let fd;
  let temporaryExists = false;
  try {
    fd = fsApi.openSync(
      temporary,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW || 0),
      0o600,
    );
    temporaryExists = true;
    fsApi.fchmodSync(fd, 0o600);
    fsApi.writeFileSync(fd, bytes);
    fsApi.fsyncSync(fd);
    fsApi.closeSync(fd);
    fd = undefined;
    fsApi.linkSync(temporary, target);
    fsApi.unlinkSync(temporary);
    temporaryExists = false;
  } catch (error) {
    if (fd !== undefined) {
      try { fsApi.closeSync(fd); } catch { /* fixed local cleanup only */ }
    }
    if (temporaryExists) {
      try { fsApi.unlinkSync(temporary); } catch { /* fixed local cleanup only */ }
    }
    if (error instanceof E17BStop) throw error;
    stop("EVIDENCE_WRITE_FAILED", "Evidence konnte nicht atomar/no-clobber geschrieben werden.");
  }
  const written = readEvidence(runDir, record.role, {
    fsApi,
    uid,
    finalCommit: record.finalCommit,
    secrets,
  });
  weakSetAdd(writtenEvidenceItemBrand, written);
  return written;
}

export function parseSupabaseLock(packageLockBytes) {
  const text = decodeUtf8Fatal(packageLockBytes, "package-lock.json");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    stop("INVALID_PACKAGE_LOCK", "package-lock.json ist kein JSON.");
  }
  const entry = parsed?.packages?.["node_modules/supabase"];
  const platformEntry = parsed?.packages?.[`node_modules/${SUPABASE_PLATFORM_PACKAGE}`];
  if (!isPlainObject(entry)
      || entry.version !== SUPABASE_CLI_VERSION
      || entry.integrity !== SUPABASE_CLI_INTEGRITY
      || !isPlainObject(entry.bin)
      || !exactKeys(entry.bin, ["supabase"])
      || entry.bin.supabase !== "dist/supabase.js"
      || !isPlainObject(entry.optionalDependencies)
      || entry.optionalDependencies[SUPABASE_PLATFORM_PACKAGE] !== SUPABASE_CLI_VERSION
      || !isPlainObject(platformEntry)
      || platformEntry.version !== SUPABASE_CLI_VERSION
      || platformEntry.integrity !== SUPABASE_PLATFORM_INTEGRITY
      || platformEntry.optional !== true
      || !Array.isArray(platformEntry.os)
      || canonicalJson(platformEntry.os) !== canonicalJson(["darwin"])
      || !Array.isArray(platformEntry.cpu)
      || canonicalJson(platformEntry.cpu) !== canonicalJson(["arm64"])) {
    stop("SUPABASE_LOCK_MISMATCH", "Supabase-CLI ist nicht exakt package-lock-gebunden.");
  }
  return Object.freeze({
    version: entry.version,
    integrity: entry.integrity,
    bin: entry.bin.supabase,
    platformPackage: SUPABASE_PLATFORM_PACKAGE,
    platformIntegrity: platformEntry.integrity,
  });
}

const supabaseCliBrand = new WeakSet();
const supabaseCliTestBrand = new WeakSet();
const runtimeSecretContextBrand = new WeakSet();
const runtimeSecretProofBrand = new WeakSet();
const childEnvironmentAuthorizationBrand = new WeakSet();
const functionDeploySuccessBrand = new WeakSet();
const functionMarkerCapabilityBrand = new WeakSet();
const consumedFunctionMarkerCapabilities = new WeakSet();

function regularExecutable(stat, reasonCode) {
  if (!stat?.isFile?.() || (stat.mode & 0o111) === 0 || stat.nlink !== 1) {
    stop(reasonCode, "Executable verletzt File/Mode/Hardlink-Gates.");
  }
}

function regularFile(stat, bytes, reasonCode) {
  if (!stat?.isFile?.() || stat.nlink !== 1 || stat.size !== bytes.length) {
    stop(reasonCode, "Datei verletzt File/Size/Hardlink-Gates.");
  }
}

function cliIdentity(stat, sha256) {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    mode: stat.mode,
    sha256,
  });
}

function sameCliIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.mode === right.mode
    && left.sha256 === right.sha256;
}

export function validateSupabaseCli(options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "CLI-Attestierungsoptionen");
  const injectedAdapter = descriptorHasKey(optionDescriptors, "repoRoot")
    || descriptorHasKey(optionDescriptors, "fsApi");
  const repoRoot = descriptorDataValue(optionDescriptors, "repoRoot") ?? REPO_ROOT;
  const fsApi = descriptorDataValue(optionDescriptors, "fsApi")
    ?? { readFileSync, readlinkSync, realpathSync, lstatSync, statSync };
  inspectDescriptors(fsApi, "CLI-fsApi");
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)) {
    stop("SUPABASE_REPO_ROOT_MISMATCH", "CLI-Attestierung braucht einen absoluten Repo-Root.");
  }
  let repoReal;
  let repoLinkStat;
  let repoStat;
  try {
    repoReal = fsApi.realpathSync(repoRoot);
    repoLinkStat = fsApi.lstatSync(repoRoot);
    repoStat = fsApi.statSync(repoRoot);
  } catch {
    stop("SUPABASE_REPO_ROOT_MISMATCH", "CLI-Repo-Root ist nicht vollständig attestierbar.");
  }
  if (repoReal !== repoRoot || repoLinkStat.isSymbolicLink?.() || !repoStat.isDirectory?.()) {
    stop("SUPABASE_REPO_ROOT_MISMATCH", "CLI-Repo-Root verletzt Realpath-/Directory-Gates.");
  }
  const lockPath = join(repoRoot, "package-lock.json");
  const packageRoot = join(repoRoot, "node_modules", "supabase");
  const packagePath = join(packageRoot, "package.json");
  const cliEntry = join(packageRoot, "dist", "supabase.js");
  const wrapperPath = join(repoRoot, "node_modules", ".bin", "supabase");
  const platformRoot = join(repoRoot, "node_modules", ...SUPABASE_PLATFORM_PACKAGE.split("/"));
  const platformPackagePath = join(platformRoot, "package.json");
  const platformBinaryPath = join(platformRoot, "bin", "supabase");
  let lockBytes;
  let lockReal;
  let lockLinkStat;
  let lockStat;
  try {
    lockBytes = toBuffer(fsApi.readFileSync(lockPath));
    lockReal = fsApi.realpathSync(lockPath);
    lockLinkStat = fsApi.lstatSync(lockPath);
    lockStat = fsApi.statSync(lockPath);
  } catch {
    stop("SUPABASE_LOCK_MISMATCH", "package-lock.json ist nicht vollständig attestierbar.");
  }
  regularFile(lockStat, lockBytes, "SUPABASE_LOCK_MISMATCH");
  if (lockReal !== lockPath || lockLinkStat.isSymbolicLink?.()) {
    stop("SUPABASE_LOCK_MISMATCH", "package-lock.json verletzt Realpath-/Symlink-Gates.");
  }
  const lock = parseSupabaseLock(lockBytes);
  let packageJson;
  let platformPackageJson;
  let packageBytes;
  let platformPackageBytes;
  try {
    packageBytes = toBuffer(fsApi.readFileSync(packagePath));
    platformPackageBytes = toBuffer(fsApi.readFileSync(platformPackagePath));
    if (fsApi.realpathSync(packagePath) !== packagePath
        || fsApi.lstatSync(packagePath).isSymbolicLink?.()
        || fsApi.realpathSync(platformPackagePath) !== platformPackagePath
        || fsApi.lstatSync(platformPackagePath).isSymbolicLink?.()) {
      stop("SUPABASE_PACKAGE_MISMATCH", "Lokale Paketmetadaten verletzen Realpath-/Symlink-Gates.");
    }
    packageJson = JSON.parse(decodeUtf8Fatal(packageBytes, "Supabase package.json"));
    platformPackageJson = JSON.parse(decodeUtf8Fatal(
      platformPackageBytes,
      "Supabase Plattform-package.json",
    ));
  } catch (error) {
    if (error instanceof E17BStop) throw error;
    stop("SUPABASE_PACKAGE_MISMATCH", "Lokales Supabase-Paket ist kein JSON.");
  }
  if (packageJson?.name !== "supabase"
      || packageJson.version !== lock.version
      || !isPlainObject(packageJson.bin)
      || !exactKeys(packageJson.bin, ["supabase"])
      || packageJson.bin.supabase !== lock.bin
      || platformPackageJson?.name !== SUPABASE_PLATFORM_PACKAGE
      || platformPackageJson.version !== SUPABASE_CLI_VERSION) {
    stop("SUPABASE_PACKAGE_MISMATCH", "Lokales Paket stimmt nicht mit package-lock überein.");
  }
  let entryReal;
  let wrapperReal;
  let wrapperLinkStat;
  let wrapperStat;
  let wrapperBytes;
  let wrapperTarget;
  let platformReal;
  let platformLinkStat;
  let platformStat;
  let platformBytes;
  try {
    entryReal = fsApi.realpathSync(cliEntry);
    wrapperReal = fsApi.realpathSync(wrapperPath);
    wrapperLinkStat = fsApi.lstatSync(wrapperPath);
    wrapperStat = fsApi.statSync(wrapperPath);
    wrapperBytes = toBuffer(fsApi.readFileSync(wrapperPath));
    wrapperTarget = fsApi.readlinkSync(wrapperPath);
    platformReal = fsApi.realpathSync(platformBinaryPath);
    platformLinkStat = fsApi.lstatSync(platformBinaryPath);
    platformStat = fsApi.statSync(platformBinaryPath);
    platformBytes = toBuffer(fsApi.readFileSync(platformBinaryPath));
  } catch {
    stop("SUPABASE_CLI_MISSING", "Wrapper oder gebundenes Supabase-Plattformbinary fehlt.");
  }
  const rel = relative(packageRoot, entryReal);
  if (entryReal !== cliEntry
      || wrapperReal !== entryReal
      || !wrapperLinkStat.isSymbolicLink?.()
      || wrapperTarget !== "../supabase/dist/supabase.js"
      || rel.startsWith(`..${sep}`)
      || rel === ".."
      || isAbsolute(rel)
      || decodeUtf8Fatal(wrapperBytes, "Supabase Wrapper").split(/\r?\n/, 1)[0] !== "#!/usr/bin/env node"
      || !/@supabase\/cli-\$\{suffix\}\/package\.json/.test(
        decodeUtf8Fatal(wrapperBytes, "Supabase Wrapper"),
      )
      || platformReal !== platformBinaryPath
      || platformLinkStat.isSymbolicLink?.()) {
    stop("SUPABASE_CLI_REALPATH", "./node_modules/.bin/supabase löst nicht exakt zum Lock-Entry auf.");
  }
  regularExecutable(wrapperStat, "SUPABASE_CLI_MODE");
  regularExecutable(platformStat, "SUPABASE_CLI_MODE");
  const wrapperIdentity = cliIdentity(wrapperStat, hashBytes(wrapperBytes));
  const platformIdentity = cliIdentity(platformStat, hashBytes(platformBytes));
  if (!injectedAdapter && platformIdentity.sha256 !== SUPABASE_PLATFORM_SHA256) {
    stop("SUPABASE_PLATFORM_HASH_MISMATCH", "Produktions-CLI besitzt nicht den eingefrorenen Plattformhash.");
  }
  const wrapperLinkIdentity = Object.freeze({
    dev: wrapperLinkStat.dev,
    ino: wrapperLinkStat.ino,
    mode: wrapperLinkStat.mode,
    mtimeMs: wrapperLinkStat.mtimeMs,
    size: wrapperLinkStat.size,
  });
  const binding = Object.freeze({
    type: "fresh-supabase-cli-attestation",
    repoRoot,
    version: lock.version,
    integrity: lock.integrity,
    platformPackage: lock.platformPackage,
    platformIntegrity: lock.platformIntegrity,
    launchCommand: platformBinaryPath,
    launchPath: platformBinaryPath,
    launchRealpath: platformReal,
    cliEntryRealpath: entryReal,
    packagePath,
    packageSha256: hashBytes(packageBytes),
    packageRoot,
    platformRoot,
    platformPackagePath,
    platformPackageSha256: hashBytes(platformPackageBytes),
    platformIdentity,
    wrapperPath,
    wrapperIdentity,
    wrapperLinkIdentity,
    lockPath,
    lockIdentity: cliIdentity(lockStat, hashBytes(lockBytes)),
    adapterProvenance: injectedAdapter ? "injected-test-only" : "local-production",
    runtimeAuthorized: !injectedAdapter,
  });
  weakSetAdd(injectedAdapter ? supabaseCliTestBrand : supabaseCliBrand, binding);
  return binding;
}

function revalidateSupabaseCli(binding, fsApi) {
  if (!binding || (!weakSetHas(supabaseCliBrand, binding)
      && !weakSetHas(supabaseCliTestBrand, binding))) {
    stop("SUPABASE_CLI_BINDING_REQUIRED", "CLI-Blueprint benötigt frische Same-Process-Attestierung.");
  }
  let platformReal;
  let platformStat;
  let platformLinkStat;
  let platformBytes;
  let wrapperReal;
  let wrapperStat;
  let wrapperLinkStat;
  let wrapperBytes;
  let wrapperTarget;
  let lockReal;
  let lockStat;
  let lockLinkStat;
  let lockBytes;
  let packageBytes;
  let platformPackageBytes;
  try {
    platformReal = fsApi.realpathSync(binding.launchPath);
    platformLinkStat = fsApi.lstatSync(binding.launchPath);
    platformStat = fsApi.statSync(binding.launchPath);
    platformBytes = toBuffer(fsApi.readFileSync(binding.launchPath));
    wrapperReal = fsApi.realpathSync(binding.wrapperPath);
    wrapperLinkStat = fsApi.lstatSync(binding.wrapperPath);
    wrapperStat = fsApi.statSync(binding.wrapperPath);
    wrapperBytes = toBuffer(fsApi.readFileSync(binding.wrapperPath));
    wrapperTarget = fsApi.readlinkSync(binding.wrapperPath);
    lockReal = fsApi.realpathSync(binding.lockPath);
    lockLinkStat = fsApi.lstatSync(binding.lockPath);
    lockStat = fsApi.statSync(binding.lockPath);
    lockBytes = toBuffer(fsApi.readFileSync(binding.lockPath));
    if (fsApi.realpathSync(binding.packagePath) !== binding.packagePath
        || fsApi.lstatSync(binding.packagePath).isSymbolicLink?.()
        || fsApi.realpathSync(binding.platformPackagePath) !== binding.platformPackagePath
        || fsApi.lstatSync(binding.platformPackagePath).isSymbolicLink?.()) {
      stop("SUPABASE_CLI_TOCTOU", "CLI-Paketmetadaten drifteten am Sink-Gate.");
    }
    packageBytes = toBuffer(fsApi.readFileSync(binding.packagePath));
    platformPackageBytes = toBuffer(fsApi.readFileSync(binding.platformPackagePath));
  } catch {
    stop("SUPABASE_CLI_TOCTOU", "CLI-Datei ist beim Sink-Gate nicht mehr validierbar.");
  }
  regularExecutable(platformStat, "SUPABASE_CLI_TOCTOU");
  regularExecutable(wrapperStat, "SUPABASE_CLI_TOCTOU");
  regularFile(lockStat, lockBytes, "SUPABASE_CLI_TOCTOU");
  const currentPlatform = cliIdentity(platformStat, hashBytes(platformBytes));
  const currentWrapper = cliIdentity(wrapperStat, hashBytes(wrapperBytes));
  const currentLock = cliIdentity(lockStat, hashBytes(lockBytes));
  const currentWrapperLinkIdentity = {
    dev: wrapperLinkStat.dev,
    ino: wrapperLinkStat.ino,
    mode: wrapperLinkStat.mode,
    mtimeMs: wrapperLinkStat.mtimeMs,
    size: wrapperLinkStat.size,
  };
  if (platformLinkStat.isSymbolicLink?.()
      || platformReal !== binding.launchRealpath
      || !wrapperLinkStat.isSymbolicLink?.()
      || wrapperReal !== binding.cliEntryRealpath
      || wrapperTarget !== "../supabase/dist/supabase.js"
      || lockReal !== binding.lockPath
      || lockLinkStat.isSymbolicLink?.()
      || canonicalJson(currentWrapperLinkIdentity) !== canonicalJson(binding.wrapperLinkIdentity)
      || !sameCliIdentity(currentWrapper, binding.wrapperIdentity)
      || !sameCliIdentity(currentPlatform, binding.platformIdentity)
      || !sameCliIdentity(currentLock, binding.lockIdentity)
      || hashBytes(packageBytes) !== binding.packageSha256
      || hashBytes(platformPackageBytes) !== binding.platformPackageSha256) {
    stop("SUPABASE_CLI_TOCTOU", "CLI-Realpath/Hash/Inode driftete seit der Attestierung.");
  }
  return Object.freeze({ platform: currentPlatform, wrapper: currentWrapper });
}

function buildSupabaseArgv(operation, { finalCommit } = {}) {
  const project = ["--project-ref", PROJECT_ID];
  const table = Object.freeze({
    "functions-list": Object.freeze(["functions", "list", ...project]),
    "function-download": Object.freeze(["functions", "download", FUNCTION_NAME, ...project]),
    "function-deploy": Object.freeze(["functions", "deploy", FUNCTION_NAME, ...project]),
    "secrets-list": Object.freeze(["secrets", "list", ...project]),
  });
  if (operation === "secret-set") {
    return Object.freeze([
      "secrets",
      "set",
      `KD_FUNCTION_BUILD_VERSION=${assertCommit(finalCommit)}`,
      ...project,
    ]);
  }
  if (!Object.hasOwn(table, operation) || finalCommit !== undefined) {
    stop("SUPABASE_COMMAND_REJECTED", "Supabase-Argv verletzt die feste Allowlist.");
  }
  return Object.freeze([...table[operation]]);
}

export function describeSupabaseArgvContract(operation) {
  const descriptions = Object.freeze({
    "functions-list": Object.freeze(["functions", "list", "--project-ref", "<ATTESTED_PROJECT>"]),
    "function-download": Object.freeze(["functions", "download", FUNCTION_NAME, "--project-ref", "<ATTESTED_PROJECT>"]),
    "function-deploy": Object.freeze(["functions", "deploy", FUNCTION_NAME, "--project-ref", "<ATTESTED_PROJECT>"]),
    "secrets-list": Object.freeze(["secrets", "list", "--project-ref", "<ATTESTED_PROJECT>"]),
    "secret-set": Object.freeze(["secrets", "set", "KD_FUNCTION_BUILD_VERSION=<ATTESTED_COMMIT>", "--project-ref", "<ATTESTED_PROJECT>"]),
  });
  if (!Object.hasOwn(descriptions, operation)) {
    stop("SUPABASE_COMMAND_REJECTED", "Supabase-Operation verletzt die feste Allowlist.");
  }
  return Object.freeze({
    operation,
    argvTemplate: descriptions[operation],
    sinkConsumable: false,
    targetPlaceholders: true,
  });
}

export function validateSupabaseArgv(argv) {
  assertSecurityRuntimeIntegrity();
  const candidates = [
    buildSupabaseArgv("functions-list"),
    buildSupabaseArgv("function-download"),
    buildSupabaseArgv("secrets-list"),
  ];
  if (!Array.isArray(argv)
      || !candidates.some((candidate) => canonicalJson(candidate) === canonicalJson(argv))) {
    stop(
      "SUPABASE_COMMAND_REJECTED",
      "Öffentliche Argv-Validierung akzeptiert nur nicht mutierende Supabase-Operationen.",
    );
  }
  return Object.freeze([...argv]);
}

export function buildChildEnvironmentBlueprint(options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "Child-Environment-Blueprint-Optionen");
  const kind = descriptorDataValue(descriptors, "kind");
  const cliBinding = descriptorDataValue(descriptors, "cliBinding");
  const ambientEnv = descriptorHasKey(descriptors, "ambientEnv")
    ? descriptorDataValue(descriptors, "ambientEnv")
    : {};
  void ambientEnv;
  if (kind === "supabase") {
    if (!cliBinding || (!weakSetHas(supabaseCliBrand, cliBinding)
        && !weakSetHas(supabaseCliTestBrand, cliBinding))) {
      stop("SUPABASE_CLI_BINDING_REQUIRED", "Supabase-Environment braucht CLI-Attestierung.");
    }
    return Object.freeze({
      LANG: "C",
      LC_ALL: "C",
      NO_COLOR: "1",
      PATH: dirname(cliBinding.launchPath),
      SUPABASE_TELEMETRY_DISABLED: "1",
    });
  }
  if (kind === "pg" || kind === "local-pg") {
    return Object.freeze({ LANG: "C", LC_ALL: "C", NO_COLOR: "1" });
  }
  stop("INVALID_ENV_KIND", "Child-Environment-Art ist nicht allowlistet.");
}

export function buildChildEnvironment(options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "Child-Environment-Optionen");
  const kind = descriptorDataValue(descriptors, "kind");
  const cliBinding = descriptorDataValue(descriptors, "cliBinding");
  const ambientEnv = descriptorHasKey(descriptors, "ambientEnv")
    ? descriptorDataValue(descriptors, "ambientEnv")
    : {};
  const secret = descriptorDataValue(descriptors, "secret");
  const runtimeSecretContext = descriptorDataValue(descriptors, "runtimeSecretContext");
  const launchAuthorization = descriptorDataValue(descriptors, "launchAuthorization");
  if (!runtimeSecretContext || !weakSetHas(runtimeSecretContextBrand, runtimeSecretContext)) {
    stop(
      "RUNTIME_SECRET_CONTEXT_REQUIRED",
      "Secret-Child braucht frische, nicht serialisierbare Same-Process-Provenienz.",
    );
  }
  if (!launchAuthorization || !weakSetHas(childEnvironmentAuthorizationBrand, launchAuthorization)
      || launchAuthorization.kind !== kind) {
    stop(
      "SINK_AUTHORIZATION_REQUIRED",
      "Secret-Environment ist nur innerhalb eines vollständig revalidierten Child-Sinks zulässig.",
    );
  }
  const env = { ...buildChildEnvironmentBlueprint({ kind, cliBinding, ambientEnv }) };
  if (typeof secret !== "string" || secret.length < 1 || /[\0\r\n]/.test(secret)) {
    stop("INVALID_SECRET", "Kindlokales Secret besitzt kein zulässiges Format.");
  }
  if (kind === "supabase") env.SUPABASE_ACCESS_TOKEN = secret;
  if (kind === "pg") {
    env.PGPASSWORD = secret;
    env.PGSSLMODE = "require";
    env.PGCONNECT_TIMEOUT = "20";
  }
  return Object.freeze(env);
}

export function buildSupabaseVersionLaunchBlueprint(options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "Supabase-Version-Blueprint-Optionen");
  const cliBinding = descriptorDataValue(descriptors, "cliBinding");
  const fsApi = descriptorHasKey(descriptors, "fsApi")
    ? descriptorDataValue(descriptors, "fsApi")
    : { readFileSync, readlinkSync, realpathSync, lstatSync, statSync };
  const cliAttestation = revalidateSupabaseCli(cliBinding, fsApi);
  return Object.freeze({
    executable: cliBinding.launchPath,
    executableRealpath: cliBinding.launchRealpath,
    argv: Object.freeze(["--version"]),
    cwd: REPO_ROOT,
    env: buildChildEnvironmentBlueprint({ kind: "supabase", cliBinding }),
    shell: false,
    timeoutMs: CHILD_TIMEOUT_MS,
    maxBuffer: CHILD_MAX_BUFFER,
    attempts: 1,
    cliAttestation,
    transcriptTrusted: false,
  });
}

export function validateSupabaseVersionOutput(output, options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "Supabase-Versionsoptionen");
  const secrets = descriptorHasKey(descriptors, "secrets")
    ? descriptorDataValue(descriptors, "secrets")
    : [];
  assertNoSecretExposure(output, secrets);
  const text = decodeUtf8Fatal(output, "Supabase-Version");
  if (!/^2\.109\.1(?:\r?\n)?$/.test(text)) {
    stop("SUPABASE_VERSION_MISMATCH", "Supabase-CLI meldet nicht exakt 2.109.1.");
  }
  return SUPABASE_CLI_VERSION;
}

export function buildSupabaseLaunchBlueprint(options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "Supabase-Launch-Blueprint-Optionen");
  const operation = descriptorDataValue(descriptors, "operation");
  const finalCommit = descriptorDataValue(descriptors, "finalCommit");
  const runDir = descriptorDataValue(descriptors, "runDir");
  const cliBinding = descriptorDataValue(descriptors, "cliBinding");
  const ambientEnv = descriptorHasKey(descriptors, "ambientEnv")
    ? descriptorDataValue(descriptors, "ambientEnv")
    : {};
  const fsApi = descriptorHasKey(descriptors, "fsApi")
    ? descriptorDataValue(descriptors, "fsApi")
    : { readFileSync, readlinkSync, readdirSync, realpathSync, lstatSync, statSync };
  const uid = descriptorHasKey(descriptors, "uid")
    ? descriptorDataValue(descriptors, "uid")
    : process.getuid?.();
  const currentIdentity = revalidateSupabaseCli(cliBinding, fsApi);
  const mutating = operation === "function-deploy" || operation === "secret-set";
  if (mutating) {
    stop("FUNCTION_SINK_CAPABILITY_REQUIRED", "Öffentliche Builder geben keine Function-Mutationssinks frei.");
  }
  const commandArgv = operation === "secret-set"
    ? buildSupabaseArgv(operation, { finalCommit })
    : buildSupabaseArgv(operation);
  const cwd = operation === "functions-list" || operation === "function-download"
    ? validateFunctionDownloadDir(runDir, { fsApi, uid, finalCommit })
    : REPO_ROOT;
  return Object.freeze({
    executable: cliBinding.launchCommand,
    executableRealpath: cliBinding.launchRealpath,
    argv: Object.freeze([...commandArgv]),
    cwd,
    env: buildChildEnvironmentBlueprint({ kind: "supabase", cliBinding, ambientEnv }),
    shell: false,
    timeoutMs: CHILD_TIMEOUT_MS,
    maxBuffer: CHILD_MAX_BUFFER,
    attempts: 1,
    cliAttestation: currentIdentity,
    transcriptTrusted: false,
  });
}

export function describeFunctionMutationSequenceContract({ finalCommit, runId } = {}) {
  const validCommit = assertCommit(finalCommit);
  const validRunId = assertRunId(runId, validCommit);
  return Object.freeze({
    action: "function-release",
    finalCommit: validCommit,
    runId: validRunId,
    targetId: TARGET_ID,
    remoteProof: Object.freeze([
      "origin", "ref", "finalCommit", "runId", "targetId", "action", "outputDigest",
    ]),
    steps: Object.freeze([
      "fresh-remote-git", "function-deploy", "strict-deploy-success",
      "one-shot-marker-capability", "secret-set",
    ]),
    markerBeforeDeploy: "forbidden",
    markerReuse: "forbidden",
    sinkConsumable: false,
  });
}

export function buildSupabaseLaunch(options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "Supabase-Launch-Optionen");
  const runtimeSecretContext = descriptorDataValue(descriptors, "runtimeSecretContext");
  const localAttestation = descriptorDataValue(descriptors, "localAttestation");
  const operation = descriptorDataValue(descriptors, "operation");
  const cliBinding = descriptorDataValue(descriptors, "cliBinding");
  const ambientEnv = descriptorDataValue(descriptors, "ambientEnv");
  const accessToken = descriptorDataValue(descriptors, "accessToken");
  if (!runtimeSecretContext
      || !weakSetHas(runtimeSecretContextBrand, runtimeSecretContext)) {
    stop("RUNTIME_SECRET_CONTEXT_REQUIRED", "Wave A erzeugt keinen Secret-Child-Sink.");
  }
  const validCommit = assertCommit(descriptorDataValue(descriptors, "finalCommit"));
  if (!localAttestation
      || !weakSetHas(localAttestationBrand, localAttestation)
      || localAttestation.finalCommit !== validCommit) {
    stop("FRESH_GIT_CONTEXT_REQUIRED", "Supabase-Child braucht frische Gitprovenienz.");
  }
  const mutating = operation === "function-deploy" || operation === "secret-set";
  if (mutating) {
    stop("FUNCTION_SINK_CAPABILITY_REQUIRED", "Wave A besitzt keinen Function-Mutationssequenz-Executor.");
  }
  const blueprint = buildSupabaseLaunchBlueprint(options);
  const launchAuthorization = Object.freeze({
    kind: "supabase",
    finalCommit: validCommit,
  });
  weakSetAdd(childEnvironmentAuthorizationBrand, launchAuthorization);
  return Object.freeze({
    ...blueprint,
    env: buildChildEnvironment({
      kind: "supabase",
      cliBinding,
      ambientEnv,
      secret: accessToken,
      runtimeSecretContext,
      launchAuthorization,
    }),
  });
}

export function validatePgBinary(binaryPath, {
  fsApi = { realpathSync, statSync },
} = {}) {
  if (typeof binaryPath !== "string" || !isAbsolute(binaryPath)
      || !PG_BINARIES.includes(basename(binaryPath))) {
    stop("PG_BINARY_NOT_ALLOWED", "PG-Binary/Pfad ist nicht allowlistet.");
  }
  let real;
  let stat;
  try {
    real = fsApi.realpathSync(binaryPath);
    stat = fsApi.statSync(binaryPath);
  } catch {
    stop("PG_BINARY_MISSING", "Gewählte PG17-Binary ist nicht vorhanden.");
  }
  const base = dirname(binaryPath);
  if (!PG17_BASES.includes(base) || real !== binaryPath) {
    stop("PG_BINARY_REALPATH", "Gewählte PG-Binary liegt nicht real in einer festen PG17-Basis.");
  }
  regularExecutable(stat, "PG_BINARY_MODE");
  return real;
}

export function attestPg17Binary(binaryPath, options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "PG17-Attestierungsoptionen");
  const finalCommit = descriptorDataValue(optionDescriptors, "finalCommit");
  const runId = descriptorDataValue(optionDescriptors, "runId");
  const suppliedTargetId = descriptorDataValue(optionDescriptors, "targetId");
  const targetId = suppliedTargetId === undefined ? TARGET_ID : suppliedTargetId;
  const action = descriptorDataValue(optionDescriptors, "action");
  const versionProof = descriptorDataValue(optionDescriptors, "versionProof");
  const fsApi = descriptorDataValue(optionDescriptors, "fsApi")
    ?? { readFileSync, realpathSync, lstatSync, statSync };
  inspectDescriptors(fsApi, "PG17-fsApi");
  const validCommit = assertCommit(finalCommit);
  const validRunId = assertRunId(runId, validCommit);
  if (targetId !== TARGET_ID || !["backup-restore", "db-apply"].includes(action)) {
    stop("PG_VERSION_PROOF_CONTEXT", "PG17-Beleg braucht exakt gebundene Run-/Target-/Actiondaten.");
  }
  if (!versionProof || !weakSetHas(pg17VersionExecutorProofBrand, versionProof)) {
    stop("PG_VERSION_EXECUTOR_REQUIRED", "Nur ein ausgeführter same-process --version-Beleg darf PG17 branden.");
  }
  const real = validatePgBinary(binaryPath, { fsApi });
  if (dirname(real) !== PG17_FROZEN_BASE) {
    stop("PG_BINARY_NOT_FROZEN", "Nur die eingefrorene Postgres.app-17.10-Toolchain ist attestierbar.");
  }
  let linkStat;
  let stat;
  let bytes;
  try {
    linkStat = fsApi.lstatSync(real);
    stat = fsApi.statSync(real);
    bytes = toBuffer(fsApi.readFileSync(real));
  } catch {
    stop("PG_BINARY_MISSING", "PG17-Binary ist nicht vollständig attestierbar.");
  }
  inspectDescriptors(linkStat, "PG17-lstat");
  inspectDescriptors(stat, "PG17-stat");
  regularExecutable(stat, "PG_BINARY_MODE");
  if (linkStat.isSymbolicLink?.() || stat.size !== bytes.length) {
    stop("PG_BINARY_REALPATH", "PG17-Binary verletzt Link-/Size-Gates.");
  }
  const binaryName = basename(real);
  const identity = cliIdentity(stat, hashBytes(bytes));
  if (identity.sha256 !== PG17_TOOLCHAIN_SHA256[binaryName]
      || !exactKeys(versionProof, [
        "action", "binaryName", "binaryPath", "finalCommit", "outputDigest", "runId",
        "targetId", "type", "version",
      ])
      || versionProof.type !== "pg17-version-executor-proof"
      || versionProof.binaryName !== binaryName
      || versionProof.binaryPath !== real
      || versionProof.version !== PG17_FROZEN_VERSION
      || versionProof.finalCommit !== validCommit
      || versionProof.runId !== validRunId
      || versionProof.targetId !== TARGET_ID
      || versionProof.action !== action
      || !SHA256.test(versionProof.outputDigest)) {
    stop("PG_VERSION_PROOF_MISMATCH", "PG17-Bytes und ausgeführter --version-Beleg sind nicht exakt korreliert.");
  }
  const observationCore = {
    type: "observed-pg17-binary-only",
    path: real,
    binaryName,
    identity,
    version: versionProof.version,
    versionOutputDigest: versionProof.outputDigest,
    finalCommit: validCommit,
    runId: validRunId,
    targetId: TARGET_ID,
    action,
    trusted: false,
    sinkConsumable: false,
  };
  return Object.freeze({
    ...observationCore,
    observationDigest: hashBytes(Buffer.from(canonicalJson(observationCore), "utf8")),
  });
}

export function selectPgBinary(binaryName, {
  fsApi = { realpathSync, statSync },
} = {}) {
  if (!PG_BINARIES.includes(binaryName)) {
    stop("PG_BINARY_NOT_ALLOWED", "PG-Binaryname ist nicht allowlistet.");
  }
  for (const base of PG17_BASES) {
    const candidate = join(base, binaryName);
    try {
      return validatePgBinary(candidate, { fsApi });
    } catch (error) {
      if (error?.reasonCode !== "PG_BINARY_MISSING") throw error;
    }
  }
  stop("PG_BINARY_MISSING", "Keine gewählte PG17-Binary ist vorhanden.");
}

export function describePg17ToolchainContract(options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "PG17-Toolchain-Vertragsoptionen");
  const finalCommit = descriptorDataValue(descriptors, "finalCommit");
  const runId = descriptorDataValue(descriptors, "runId");
  const action = descriptorDataValue(descriptors, "action");
  const validCommit = assertCommit(finalCommit);
  const validRunId = assertRunId(runId, validCommit);
  if (!["backup-restore", "db-apply"].includes(action)) {
    stop("PG_VERSION_PROOF_CONTEXT", "PG17-Toolchain braucht eine feste Aktion.");
  }
  const paths = {};
  for (const binaryName of intrinsicOwnKeys(PG17_TOOLCHAIN_SHA256)) {
    paths[binaryName] = join(PG17_FROZEN_BASE, binaryName);
  }
  return Object.freeze({
    type: "pg17-toolchain-contract",
    base: PG17_FROZEN_BASE,
    version: PG17_FROZEN_VERSION,
    hashes: PG17_TOOLCHAIN_SHA256,
    paths: Object.freeze(paths),
    finalCommit: validCommit,
    runId: validRunId,
    targetId: TARGET_ID,
    action,
    versionProbe: Object.freeze(["--version"]),
    serverVersionNum: PG17_SERVER_VERSION_NUM,
    serverVersionProof: "required-after-server-start",
    sinkConsumable: false,
  });
}

function inspectPg17Identity(identity, binaryName) {
  const descriptors = inspectOrdinaryDataObject(identity, `PG17-${binaryName}-Identity`);
  if (!exactKeys(identity, ["dev", "ino", "mode", "mtimeMs", "sha256", "size"])
      || descriptorDataValue(descriptors, "sha256") !== PG17_TOOLCHAIN_SHA256[binaryName]
      || typeof descriptorDataValue(descriptors, "dev") !== "number"
      || typeof descriptorDataValue(descriptors, "ino") !== "number"
      || typeof descriptorDataValue(descriptors, "mode") !== "number"
      || typeof descriptorDataValue(descriptors, "mtimeMs") !== "number"
      || typeof descriptorDataValue(descriptors, "size") !== "number") {
    stop("PG17_CLOSURE_IDENTITY_MISMATCH", "PG17-Closure besitzt eine falsche Binary-Identity.");
  }
  return Object.freeze({
    dev: descriptorDataValue(descriptors, "dev"),
    ino: descriptorDataValue(descriptors, "ino"),
    mode: descriptorDataValue(descriptors, "mode"),
    mtimeMs: descriptorDataValue(descriptors, "mtimeMs"),
    sha256: descriptorDataValue(descriptors, "sha256"),
    size: descriptorDataValue(descriptors, "size"),
  });
}

export function inspectPg17ToolchainObservation(options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "PG17-Closure-Beobachtung");
  const finalCommit = assertCommit(descriptorDataValue(descriptors, "finalCommit"));
  const runId = assertRunId(descriptorDataValue(descriptors, "runId"), finalCommit);
  const targetId = descriptorDataValue(descriptors, "targetId");
  const action = descriptorDataValue(descriptors, "action");
  const base = descriptorDataValue(descriptors, "base");
  const binaries = descriptorDataValue(descriptors, "binaries");
  if (targetId !== TARGET_ID || base !== PG17_FROZEN_BASE
      || !["backup-restore", "db-apply"].includes(action)) {
    stop("PG17_CLOSURE_CONTEXT_MISMATCH", "PG17-Closure gehört zu anderem Base-/Run-/Target-/Actionobjekt.");
  }
  const inspectedArray = inspectDescriptors(binaries, "PG17-Closure-Binaries");
  if (!intrinsicArrayIsArray(binaries)
      || inspectedArray.prototype !== intrinsicArrayPrototype
      || inspectedArray.descriptors.length?.value !== PG17_CLOSURE_BINARIES.length) {
    stop("PG17_CLOSURE_INCOMPLETE", "PG17-Closure braucht exakt sechs geordnete Binaries.");
  }
  assertExactIndexedDescriptors(
    inspectedArray.descriptors,
    PG17_CLOSURE_BINARIES.length,
    "PG17-Closure-Binaries",
    { allowLength: true },
  );
  const observed = [];
  for (let index = 0; index < PG17_CLOSURE_BINARIES.length; index += 1) {
    const binaryName = PG17_CLOSURE_BINARIES[index];
    const entry = inspectedArray.descriptors[`${index}`].value;
    const entryDescriptors = inspectOrdinaryDataObject(entry, `PG17-${binaryName}-Beobachtung`);
    if (!exactKeys(entry, ["binaryName", "identity", "path", "versionProof"])
        || descriptorDataValue(entryDescriptors, "binaryName") !== binaryName
        || descriptorDataValue(entryDescriptors, "path") !== join(base, binaryName)) {
      stop("PG17_CLOSURE_INCOMPLETE", "PG17-Closure ist fehlend, extra oder umgeordnet.");
    }
    const identity = inspectPg17Identity(
      descriptorDataValue(entryDescriptors, "identity"),
      binaryName,
    );
    const versionProof = descriptorDataValue(entryDescriptors, "versionProof");
    const versionDescriptors = inspectOrdinaryDataObject(
      versionProof,
      `PG17-${binaryName}-Versionsbeobachtung`,
    );
    const versionArgv = descriptorDataValue(versionDescriptors, "argv");
    const versionArgvInspection = inspectDescriptors(
      versionArgv,
      `PG17-${binaryName}-Versionsargv`,
    );
    if (!intrinsicArrayIsArray(versionArgv)
        || versionArgvInspection.prototype !== intrinsicArrayPrototype
        || versionArgvInspection.descriptors.length?.value !== 1) {
      stop("PG17_CLOSURE_VERSION_MISMATCH", "PG17-Versionbeleg braucht exakt ein gewöhnliches --version-Argv.");
    }
    assertExactIndexedDescriptors(
      versionArgvInspection.descriptors,
      1,
      `PG17-${binaryName}-Versionsargv`,
      { allowLength: true },
    );
    if (!exactKeys(versionProof, [
      "action", "argv", "binaryName", "binaryPath", "finalCommit", "outputDigest",
      "runId", "targetId", "version",
    ])
        || descriptorDataValue(versionDescriptors, "binaryName") !== binaryName
        || descriptorDataValue(versionDescriptors, "binaryPath") !== join(base, binaryName)
        || descriptorDataValue(versionDescriptors, "finalCommit") !== finalCommit
        || descriptorDataValue(versionDescriptors, "runId") !== runId
        || descriptorDataValue(versionDescriptors, "targetId") !== TARGET_ID
        || descriptorDataValue(versionDescriptors, "action") !== action
        || descriptorDataValue(versionDescriptors, "version") !== PG17_FROZEN_VERSION
        || versionArgvInspection.descriptors["0"]?.value !== "--version"
        || !SHA256.test(descriptorDataValue(versionDescriptors, "outputDigest"))) {
      stop("PG17_CLOSURE_VERSION_MISMATCH", "PG17-Closure bindet nicht sechs exakte 17.10-Versionbelege.");
    }
    intrinsicReflectApply(intrinsicArrayPush, observed, [Object.freeze({
      binaryName,
      path: join(base, binaryName),
      identity,
      versionProof: Object.freeze({
        binaryName,
        binaryPath: join(base, binaryName),
        argv: Object.freeze(["--version"]),
        version: PG17_FROZEN_VERSION,
        outputDigest: descriptorDataValue(versionDescriptors, "outputDigest"),
        finalCommit,
        runId,
        targetId: TARGET_ID,
        action,
      }),
    })]);
  }
  const closureCore = Object.freeze({
    schema: "e17b-pg17-toolchain-closure-v1",
    base,
    finalCommit,
    runId,
    targetId: TARGET_ID,
    action,
    binaries: Object.freeze(observed),
  });
  return Object.freeze({
    ...closureCore,
    closureDigest: hashBytes(Buffer.from(canonicalJson(closureCore), "utf8")),
    trusted: false,
    sinkConsumable: false,
  });
}

export function attestPg17ToolchainClosure(observation, options = {}) {
  const observed = inspectPg17ToolchainObservation(observation);
  const optionDescriptors = inspectOrdinaryDataObject(options, "PG17-Closure-Executoroptionen");
  const executorProof = descriptorDataValue(optionDescriptors, "executorProof");
  if (!executorProof || !weakSetHas(pg17ClosureExecutorProofBrand, executorProof)
      || executorProof.closureDigest !== observed.closureDigest
      || executorProof.finalCommit !== observed.finalCommit
      || executorProof.runId !== observed.runId
      || executorProof.targetId !== TARGET_ID
      || executorProof.action !== observed.action) {
    stop("PG17_CLOSURE_EXECUTOR_REQUIRED", "Nur sechs same-process Versions-/Identity-Ausführungsbelege dürfen die Closure branden.");
  }
  const attestation = Object.freeze({
    ...observed,
    type: "fresh-pg17-toolchain-closure",
    trusted: true,
    attestationDigest: hashBytes(Buffer.from(canonicalJson({
      closureDigest: observed.closureDigest,
      finalCommit: observed.finalCommit,
      runId: observed.runId,
      targetId: observed.targetId,
      action: observed.action,
    }), "utf8")),
  });
  weakSetAdd(pg17ToolchainClosureBrand, attestation);
  return attestation;
}

function requirePg17ServerVersionProof(closure, proof) {
  if (!proof || !weakSetHas(pg17ServerVersionProofBrand, proof)
      || proof.closureDigest !== closure.closureDigest
      || proof.finalCommit !== closure.finalCommit
      || proof.runId !== closure.runId
      || proof.targetId !== closure.targetId
      || proof.action !== closure.action
      || proof.serverVersionNum !== PG17_SERVER_VERSION_NUM) {
    stop("PG17_SERVER_VERSION_PROOF_REQUIRED", "Gestarteter Server braucht einen separaten same-process server_version_num-Beleg.");
  }
  return proof;
}

function revalidatePg17ToolchainClosure(closure, {
  finalCommit,
  runId,
  action,
  operationBinary,
  fsApi = { readFileSync, realpathSync, lstatSync, statSync },
} = {}) {
  if (!closure || !weakSetHas(pg17ToolchainClosureBrand, closure)
      || closure.finalCommit !== finalCommit
      || closure.runId !== runId
      || closure.targetId !== TARGET_ID
      || closure.action !== action
      || !intrinsicReflectApply(intrinsicArrayIncludes, PG17_CLOSURE_BINARIES, [operationBinary])) {
    stop("PG17_CLOSURE_REQUIRED", "Sink braucht die korrelierte nicht serialisierbare PG17-Full-Closure.");
  }
  let selected;
  for (let index = 0; index < PG17_CLOSURE_BINARIES.length; index += 1) {
    const binaryName = PG17_CLOSURE_BINARIES[index];
    const observed = closure.binaries[index];
    const path = join(PG17_FROZEN_BASE, binaryName);
    let real;
    let linkStat;
    let stat;
    let bytes;
    try {
      real = fsApi.realpathSync(path);
      linkStat = fsApi.lstatSync(path);
      stat = fsApi.statSync(path);
      bytes = toBuffer(fsApi.readFileSync(path));
    } catch {
      stop("PG_BINARY_TOCTOU", "PG17-Full-Closure ist unmittelbar vor dem Sink nicht lesbar.");
    }
    inspectDescriptors(linkStat, `PG17-${binaryName}-Revalidation-lstat`);
    inspectDescriptors(stat, `PG17-${binaryName}-Revalidation-stat`);
    const identity = cliIdentity(stat, hashBytes(bytes));
    if (real !== path
        || linkStat.isSymbolicLink?.()
        || stat.nlink !== 1
        || stat.size !== bytes.length
        || observed.binaryName !== binaryName
        || observed.path !== path
        || observed.versionProof.version !== PG17_FROZEN_VERSION
        || !sameCliIdentity(identity, observed.identity)) {
      stop("PG_BINARY_TOCTOU", "Mindestens ein Element der PG17-Full-Closure driftete vor dem Sink.");
    }
    if (binaryName === operationBinary) selected = observed;
  }
  return Object.freeze({ closure, selected });
}

export function validatePgVersionOutput(binaryName, output, options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "PG17-Versionsoptionen");
  const secrets = descriptorHasKey(descriptors, "secrets")
    ? descriptorDataValue(descriptors, "secrets")
    : [];
  let binaryAllowed = binaryName === "postgres";
  for (let index = 0; index < PG_BINARIES.length; index += 1) {
    if (PG_BINARIES[index] === binaryName) binaryAllowed = true;
  }
  if (!binaryAllowed) stop("PG_BINARY_NOT_ALLOWED", "PG-Binary ist unbekannt.");
  assertNoSecretExposure(output, secrets);
  const text = decodeUtf8Fatal(output, "PG-Version");
  const escaped = intrinsicReflectApply(
    intrinsicStringReplace,
    binaryName,
    [/[.*+?^${}()|[\]\\]/g, "\\$&"],
  );
  const versionPattern = new intrinsicRegExp(
    `^${escaped} \\(PostgreSQL\\) 17\\.10 \\(Postgres\\.app\\)\\n?$`,
  );
  if (!intrinsicReflectApply(intrinsicRegExpTest, versionPattern, [text])) {
    stop("PG_VERSION_MISMATCH", "PG-Binary meldet nicht exakt Postgres.app 17.10 in einer Zeile.");
  }
  return PG17_FROZEN_VERSION;
}

export function buildLocalRoleScaffoldSql() {
  return [
    "BEGIN;",
    ...LOCAL_ROLE_ALLOWLIST.map((role) => `CREATE ROLE ${role} NOLOGIN;`),
    "CREATE SCHEMA IF NOT EXISTS auth;",
    "CREATE TABLE auth.users (id uuid PRIMARY KEY);",
    "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;",
    "CREATE SCHEMA IF NOT EXISTS extensions;",
    "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;",
    "COMMIT;",
    "",
  ].join("\n");
}

function localPgPaths(runDir) {
  return Object.freeze({
    clusterDir: join(runDir, "restore-cluster"),
    socketDir: join(runDir, "restore-socket"),
    logPath: join(runDir, "restore-postgres.log"),
    publicDump: join(runDir, "public.sql"),
    migrationsDump: join(runDir, "supabase_migrations.sql"),
    authIds: join(runDir, "auth_ids.txt"),
    rolesDump: join(runDir, "roles.sql"),
  });
}

export function createLocalRestoreLayout(runDir, {
  fsApi = { mkdirSync, lstatSync, statSync, realpathSync },
  uid = process.getuid?.(),
  finalCommit,
} = {}) {
  const run = validateRunDir(runDir, { fsApi, uid, finalCommit });
  const paths = localPgPaths(run.runDir);
  try {
    fsApi.mkdirSync(paths.socketDir, { mode: 0o700, recursive: false });
  } catch {
    stop("LOCAL_SOCKET_CLOBBER", "Restore-Socketverzeichnis konnte nicht no-clobber angelegt werden.");
  }
  validateLocalRestoreLayout(runDir, {
    fsApi,
    uid,
    finalCommit: run.finalCommit,
    phase: "before-init",
  });
  return paths;
}

export function validateLocalRestoreLayout(runDir, {
  fsApi = { lstatSync, statSync, realpathSync },
  uid = process.getuid?.(),
  finalCommit,
  phase,
} = {}) {
  const run = validateRunDir(runDir, { fsApi, uid, finalCommit });
  const paths = localPgPaths(run.runDir);
  validateOwnedDirectory(paths.socketDir, {
    fsApi,
    uid,
    reasonCode: "INVALID_LOCAL_SOCKET_LAYOUT",
  });
  if (phase === "before-init") {
    try {
      fsApi.lstatSync(paths.clusterDir);
      stop("LOCAL_CLUSTER_CLOBBER", "initdb-Ziel existiert bereits.");
    } catch (error) {
      if (error instanceof E17BStop) throw error;
    }
  } else if (phase === "server-ready") {
    validateOwnedDirectory(paths.clusterDir, {
      fsApi,
      uid,
      reasonCode: "INVALID_LOCAL_CLUSTER_LAYOUT",
    });
  } else {
    stop("INVALID_LOCAL_LAYOUT_PHASE", "Lokaler Layoutvertrag braucht eine feste Phase.");
  }
  return paths;
}

export function buildLocalPgLaunchBlueprint(operation, options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "Local-PG-Blueprint-Optionen");
  const binaryPath = descriptorDataValue(optionDescriptors, "binaryPath");
  const finalCommit = descriptorDataValue(optionDescriptors, "finalCommit");
  const runDir = descriptorDataValue(optionDescriptors, "runDir");
  const fsApi = descriptorDataValue(optionDescriptors, "fsApi")
    ?? { lstatSync, statSync, realpathSync };
  const validCommit = assertCommit(finalCommit);
  const run = validateRunDir(runDir, { fsApi, finalCommit: validCommit });
  const binaryByOperation = Object.freeze({
    initdb: "initdb",
    "server-start": "pg_ctl",
    "server-stop": "pg_ctl",
    "role-scaffold": "psql",
    "restore-auth-ids": "psql",
    "restore-public": "psql",
    "restore-migrations": "psql",
    "canonical-restore": "psql",
  });
  const expectedBinary = binaryByOperation[operation];
  if (!expectedBinary || basename(binaryPath || "") !== expectedBinary) {
    stop("LOCAL_PG_OPERATION_REJECTED", "Lokale PG-Operation/Binary ist nicht allowlistet.");
  }
  const paths = validateLocalRestoreLayout(runDir, {
    fsApi,
    finalCommit: validCommit,
    phase: operation === "initdb" ? "before-init" : "server-ready",
  });
  const executable = validatePgBinary(binaryPath, { fsApi });
  const connection = [
    "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
    "--host", paths.socketDir,
    "--port", String(LOCAL_PG_PORT),
    "--username", LOCAL_PG_ADMIN,
    "--dbname", "postgres",
  ];
  let argv;
  let stdinSql = null;
  switch (operation) {
    case "initdb":
      argv = [
        "--pgdata", paths.clusterDir,
        `--username=${LOCAL_PG_ADMIN}`,
        "--auth-local=trust",
        "--auth-host=reject",
        "--encoding=UTF8",
        "--locale=C",
        "--no-instructions",
      ];
      break;
    case "server-start":
      argv = [
        "--pgdata", paths.clusterDir,
        "--wait",
        "--timeout", "60",
        "--log", paths.logPath,
        "--options",
        `-c listen_addresses='' -c unix_socket_directories='${paths.socketDir}' -c port=${LOCAL_PG_PORT}`,
        "start",
      ];
      break;
    case "server-stop":
      argv = [
        "--pgdata", paths.clusterDir,
        "--wait",
        "--timeout", "60",
        "--mode", "fast",
        "stop",
      ];
      break;
    case "role-scaffold":
      argv = connection;
      stdinSql = buildLocalRoleScaffoldSql();
      break;
    case "restore-public":
      argv = [...connection, "--file", paths.publicDump];
      break;
    case "restore-auth-ids":
      argv = connection;
      stdinSql = `\\copy auth.users (id) FROM '${paths.authIds}' WITH (FORMAT text)\n`;
      break;
    case "restore-migrations":
      argv = [...connection, "--file", paths.migrationsDump];
      break;
    case "canonical-restore":
      argv = [...connection, "--quiet", "--no-align", "--tuples-only"];
      stdinSql = buildCanonicalProjectionSql({ side: "restore" });
      break;
    default:
      stop("LOCAL_PG_OPERATION_REJECTED", "Lokale PG-Operation ist nicht allowlistet.");
  }
  return Object.freeze({
    operation,
    executable,
    argv: Object.freeze(argv),
    cwd: run.runDir,
    env: buildChildEnvironmentBlueprint({ kind: "local-pg" }),
    shell: false,
    timeoutMs: CHILD_TIMEOUT_MS,
    maxBuffer: CHILD_MAX_BUFFER,
    attempts: 1,
    stdinSql,
    paths,
    managedAuthSemanticsProven: false,
    transcriptTrusted: false,
    sinkConsumable: false,
    requiredRuntimeCapability: "Pg17ToolchainClosure",
    operationBinary: expectedBinary,
    requiresServerVersionProof: operation !== "initdb" && operation !== "server-start",
  });
}

const remoteTargetBrand = new WeakSet();
const snapshotCapabilityBrand = new WeakSet();
const SAFE_REMOTE_HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/;
const SAFE_REMOTE_USER = /^[A-Za-z0-9_][A-Za-z0-9_.:@-]{0,127}$/;
const SAFE_REMOTE_DATABASE = /^[A-Za-z_][A-Za-z0-9_$.-]{0,62}$/;

export function parseRemoteReadPreflightPayload(rawPayload, {
  finalCommit,
  runId,
  secrets = [],
} = {}) {
  assertCommit(finalCommit);
  assertRunId(runId, finalCommit);
  assertNoSecretExposure(rawPayload, secrets);
  stop(
    REMOTE_PAYLOAD_PENDING,
    "Wave A besitzt keinen empirisch validierten Remote-Payloadadapter.",
  );
}

function requireFreshRemoteTarget(targetBinding, finalCommit, runId) {
  if (!targetBinding || !weakSetHas(remoteTargetBrand, targetBinding)) {
    stop(REMOTE_PAYLOAD_PENDING, "PG-Sink benötigt frische Same-Process-Remote-Target-Provenienz.");
  }
  if (targetBinding.finalCommit !== finalCommit
      || targetBinding.runId !== runId
      || targetBinding.projectId !== PROJECT_ID
      || targetBinding.targetId !== TARGET_ID) {
    stop("REMOTE_TARGET_OBJECT_MISMATCH", "Runtime-Target gehört zu anderem Objekt.");
  }
  const connection = targetBinding.connection;
  if (!exactKeys(connection, ["database", "host", "port", "user"])
      || typeof connection.host !== "string" || !SAFE_REMOTE_HOST.test(connection.host)
      || !Number.isSafeInteger(connection.port) || connection.port < 1 || connection.port > 65535
      || typeof connection.user !== "string" || !SAFE_REMOTE_USER.test(connection.user)
      || typeof connection.database !== "string" || !SAFE_REMOTE_DATABASE.test(connection.database)
      || typeof targetBinding.runtimeDigest !== "string" || !SHA256.test(targetBinding.runtimeDigest)) {
    stop("INVALID_REMOTE_CONNECTION", "Runtime-Target-Tupel verletzt den empirischen Adaptervertrag.");
  }
  return targetBinding;
}

function requireSnapshotCapability(snapshotCapability, {
  finalCommit,
  runId,
  targetRuntimeDigest,
} = {}) {
  if (!snapshotCapability || !weakSetHas(snapshotCapabilityBrand, snapshotCapability)) {
    stop("SNAPSHOT_CAPABILITY_REQUIRED", "Rohe oder rehydrierte Snapshot-IDs sind nicht konsumierbar.");
  }
  if ((finalCommit !== undefined && snapshotCapability.finalCommit !== finalCommit)
      || (runId !== undefined && snapshotCapability.runId !== runId)
      || (targetRuntimeDigest !== undefined
        && snapshotCapability.targetRuntimeDigest !== targetRuntimeDigest)
      || snapshotCapability.targetId !== TARGET_ID) {
    stop("SNAPSHOT_CAPABILITY_MISMATCH", "Snapshot-Capability gehört zu anderem Run/Commit/Target.");
  }
  return snapshotCapability;
}

function remoteConnectionArgv(connection, databaseOption = "--dbname", database = connection.database) {
  return [
    "--host", connection.host,
    "--port", String(connection.port),
    "--username", connection.user,
    databaseOption, database,
    "--no-password",
  ];
}

function pgArgvForConnection(operation, connection, { runDir, snapshotId } = {}) {
  const psql = [
    "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
    ...remoteConnectionArgv(connection),
  ];
  switch (operation) {
    case "snapshot-keeper":
      return [...psql, "--quiet", "--no-align", "--tuples-only"];
    case "dump-public":
      return [
        ...remoteConnectionArgv(connection),
        "--format=p",
        "--snapshot", assertSnapshotId(snapshotId),
        "--schema=public",
        "--file", join(runDir, "public.sql"),
      ];
    case "dump-migrations":
      return [
        ...remoteConnectionArgv(connection),
        "--format=p",
        "--snapshot", assertSnapshotId(snapshotId),
        "--schema=supabase_migrations",
        "--file", join(runDir, "supabase_migrations.sql"),
      ];
    case "dump-roles":
      return [
        "--roles-only",
        "--no-role-passwords",
        ...remoteConnectionArgv(connection, "--database", "postgres"),
        "--file", join(runDir, "roles.sql"),
      ];
    case "auth-ids":
    case "canonical-source":
    case "ledger-pre":
    case "ledger-post":
    case "db-apply":
      return [...psql, "--quiet", "--no-align", "--tuples-only"];
    default:
      stop("PG_COMMAND_REJECTED", "PG-Operation verletzt die feste Allowlist.");
  }
}

export function describePgArgvContract(operation, { runDir, snapshotId } = {}) {
  const run = runDirIdentity(runDir);
  const connection = Object.freeze({
    host: "<ATTESTED_HOST>",
    port: "<ATTESTED_PORT>",
    user: "<ATTESTED_USER>",
    database: "<ATTESTED_DATABASE>",
  });
  const binaryName = operation === "dump-public" || operation === "dump-migrations"
    ? "pg_dump"
    : operation === "dump-roles" ? "pg_dumpall" : "psql";
  return Object.freeze({
    operation,
    binaryName,
    argv: Object.freeze(pgArgvForConnection(operation, connection, {
      runDir: run.runDir,
      snapshotId,
    })),
    sinkConsumable: false,
    targetPlaceholders: true,
  });
}

export function authorizeDbMutationSink(options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "DB-Sink-Optionen");
  const finalCommit = descriptorDataValue(descriptors, "finalCommit");
  const runId = descriptorDataValue(descriptors, "runId");
  const action = descriptorDataValue(descriptors, "action");
  const freshRemoteGit = descriptorDataValue(descriptors, "freshRemoteGit");
  const git = descriptorDataValue(descriptors, "git");
  const localAttestation = descriptorDataValue(descriptors, "localAttestation");
  const targetBinding = descriptorDataValue(descriptors, "targetBinding");
  const dbAuthorization = descriptorDataValue(descriptors, "dbAuthorization");
  const runtimeSecretContext = descriptorDataValue(descriptors, "runtimeSecretContext");
  const secretProof = descriptorDataValue(descriptors, "secretProof");
  const canonicalGate = descriptorDataValue(descriptors, "canonicalGate");
  const pgToolchainAttestation = descriptorDataValue(descriptors, "pgToolchainAttestation");
  const pgFsApi = descriptorDataValue(descriptors, "pgFsApi");
  const committedMigration = descriptorDataValue(descriptors, "committedMigration");
  const manifest = descriptorDataValue(descriptors, "manifest");
  const validCommit = assertCommit(finalCommit);
  const validRunId = assertRunId(runId, validCommit);
  if (action !== "db-apply") {
    stop("DB_SINK_ACTION_MISMATCH", "DB-Sink ist nur für exakt db-apply autorisierbar.");
  }
  const remoteGit = freshRemoteGit;
  if (!remoteGit || !weakSetHas(freshRemoteGitBrand, remoteGit)) {
    stop("FRESH_REMOTE_GIT_REQUIRED", "DB-Sink braucht einen fresh same-process Remote-Git-Beleg.");
  }
  if (remoteGit.origin !== "origin"
      || remoteGit.ref !== ALLOWED_REMOTE_REF
      || remoteGit.finalCommit !== validCommit
      || remoteGit.runId !== validRunId
      || remoteGit.targetId !== TARGET_ID
      || remoteGit.action !== "db-apply") {
    stop("FRESH_REMOTE_GIT_CONTEXT_MISMATCH", "FreshRemoteGit gehört zu anderem Run/Target/Action.");
  }
  const freshGit = attestLocalContract({ finalCommit: validCommit, git });
  if (!localAttestation
      || !weakSetHas(localAttestationBrand, localAttestation)
      || canonicalJson(localAttestation.functionAttestation)
        !== canonicalJson(freshGit.functionAttestation)) {
    stop("FRESH_GIT_CONTEXT_REQUIRED", "DB-Sink braucht unmittelbar revalidierte Gitprovenienz.");
  }
  const target = requireFreshRemoteTarget(targetBinding, validCommit, validRunId);
  const owner = dbAuthorization;
  if (!owner || !weakSetHas(dbWriteAuthorizationBrand, owner)
      || owner.mode !== "db-apply"
      || owner.finalCommit !== validCommit
      || owner.runId !== validRunId
      || owner.targetId !== TARGET_ID
      || owner.remoteTargetDigest !== target.runtimeDigest) {
    stop("DB_WRITE_AUTHORIZATION_REQUIRED", "DB-Sink braucht korrelierte Preimage-/Owner-Autorisierung.");
  }
  const secretContext = runtimeSecretContext;
  if (!secretContext || !weakSetHas(runtimeSecretContextBrand, secretContext)
      || !secretProof || !weakSetHas(runtimeSecretProofBrand, secretProof)
      || secretContext.finalCommit !== validCommit
      || secretContext.runId !== validRunId
      || secretContext.targetId !== TARGET_ID
      || secretProof.finalCommit !== validCommit
      || secretProof.runId !== validRunId
      || secretProof.targetId !== TARGET_ID
      || secretProof.runtimeSecretContext !== secretContext) {
    stop("RUNTIME_SECRET_CONTEXT_REQUIRED", "DB-Sink braucht korrelierte Runtime-Secret-Provenienz.");
  }
  if (!canonicalGate || !weakSetHas(canonicalGateBrand, canonicalGate)
      || canonicalGate.finalCommit !== validCommit
      || canonicalGate.runId !== validRunId
      || canonicalGate.targetId !== TARGET_ID) {
    stop("CANONICAL_PROVENANCE_REQUIRED", "DB-Sink braucht frische Canonical-Provenienz.");
  }
  const pg = pgToolchainAttestation;
  if (!pg || !weakSetHas(pg17ToolchainClosureBrand, pg)) {
    stop("PG17_CLOSURE_REQUIRED", "DB-Sink braucht die vollständige frisch attestierte PG17-Closure.");
  }
  const pgRuntime = revalidatePg17ToolchainClosure(pg, {
    finalCommit: validCommit,
    runId: validRunId,
    action: "db-apply",
    operationBinary: "psql",
    fsApi: pgFsApi,
  });
  if (!committedMigration || !weakSetHas(committedMigrationBrand, committedMigration)
      || committedMigration.finalCommit !== validCommit
      || committedMigration.path !== MIGRATION_PATH
      || committedMigration.sha256 !== EXPECTED_MIGRATION_SHA256) {
    stop("COMMITTED_MIGRATION_REQUIRED", "DB-Sink braucht den exakten gebrandeten Raw-git-show-Blob.");
  }
  const transaction = buildMigrationLedgerTransaction(committedMigration);
  const manifestKeys = [
    "action", "canonicalDigest", "canonicalParityDigest", "canonicalRole",
    "canonicalSide", "contextDigest", "finalCommit", "migrationSha256",
    "pgAttestationDigest", "prerequisitesDigest", "remoteGitOutputDigest",
    "role40GraphDigest", "runId", "targetDigest", "targetId", "transactionSha256",
  ];
  if (!exactKeys(manifest, manifestKeys)
      || manifest.action !== "db-apply"
      || manifest.finalCommit !== validCommit
      || manifest.runId !== validRunId
      || manifest.targetId !== TARGET_ID
      || manifest.targetDigest !== target.runtimeDigest
      || manifest.contextDigest !== owner.contextDigest
      || manifest.canonicalDigest !== canonicalGate.factsDigest
      || manifest.canonicalParityDigest !== canonicalGate.parityDigest
      || manifest.canonicalRole !== canonicalGate.role
      || manifest.canonicalSide !== canonicalGate.side
      || manifest.pgAttestationDigest !== pg.attestationDigest
      || manifest.prerequisitesDigest !== owner.prerequisitesDigest
      || manifest.role40GraphDigest !== owner.roleGraphDigest
      || manifest.remoteGitOutputDigest !== remoteGit.outputDigest
      || manifest.migrationSha256 !== EXPECTED_MIGRATION_SHA256
      || manifest.transactionSha256 !== transaction.sha256) {
    stop("DB_MUTATION_MANIFEST_MISMATCH", "DB-Sink-Manifest korreliert nicht exakt mit Capabilities.");
  }
  for (const key of [
    "canonicalDigest", "canonicalParityDigest", "contextDigest", "migrationSha256",
    "pgAttestationDigest", "prerequisitesDigest", "remoteGitOutputDigest",
    "role40GraphDigest", "targetDigest", "transactionSha256",
  ]) validateDigest(manifest[key]);
  const capability = Object.freeze({
    type: "db-mutation-sink-capability",
    finalCommit: validCommit,
    runId: validRunId,
    targetId: TARGET_ID,
    action: "db-apply",
    targetDigest: target.runtimeDigest,
    manifestDigest: hashBytes(Buffer.from(canonicalJson(manifest), "utf8")),
    migrationSha256: EXPECTED_MIGRATION_SHA256,
    transactionSha256: transaction.sha256,
    pgAttestationDigest: pg.attestationDigest,
    pgBinaryPath: pgRuntime.selected.path,
    pgClosureDigest: pg.closureDigest,
  });
  weakSetAdd(dbMutationSinkCapabilityBrand, capability);
  return capability;
}

export function buildPgArgv(operation, options = {}) {
  const descriptors = inspectOrdinaryDataObject(options, "PG-Argv-Optionen");
  const targetBinding = descriptorDataValue(descriptors, "targetBinding");
  const finalCommit = descriptorDataValue(descriptors, "finalCommit");
  const runDir = descriptorDataValue(descriptors, "runDir");
  const snapshotCapability = descriptorDataValue(descriptors, "snapshotCapability");
  const dbSinkCapability = descriptorDataValue(descriptors, "dbSinkCapability");
  const fsApi = descriptorHasKey(descriptors, "fsApi")
    ? descriptorDataValue(descriptors, "fsApi")
    : { lstatSync, statSync, realpathSync };
  const validCommit = assertCommit(finalCommit);
  const run = runDirIdentity(runDir);
  if (run.finalCommit !== validCommit) {
    stop("RUN_DIR_COMMIT_MISMATCH", "PG-Argv gehört zu anderem Run.");
  }
  const target = requireFreshRemoteTarget(targetBinding, validCommit, run.runId);
  validateRunDir(runDir, { fsApi, finalCommit: validCommit });
  if (operation === "db-apply"
      && (!dbSinkCapability || !weakSetHas(dbMutationSinkCapabilityBrand, dbSinkCapability)
        || dbSinkCapability.action !== "db-apply"
        || dbSinkCapability.finalCommit !== validCommit
        || dbSinkCapability.runId !== run.runId
        || dbSinkCapability.targetId !== TARGET_ID
        || dbSinkCapability.targetDigest !== target.runtimeDigest)) {
    stop(
      "DB_SINK_CAPABILITY_REQUIRED",
      "DB-Apply-Argv braucht die vollständige frisch korrelierte Sink-Capability.",
    );
  }
  const connection = target.connection;
  const snapshotId = operation === "dump-public" || operation === "dump-migrations"
    ? requireSnapshotCapability(snapshotCapability, {
      finalCommit: validCommit,
      runId: run.runId,
      targetRuntimeDigest: target.runtimeDigest,
    }).snapshotId
    : undefined;
  return Object.freeze(pgArgvForConnection(operation, connection, { runDir, snapshotId }));
}

export function validatePgArgv(operation, argv, options) {
  const expected = buildPgArgv(operation, options);
  if (!intrinsicArrayIsArray(argv) || canonicalJson(argv) !== canonicalJson(expected)) {
    stop("PG_COMMAND_REJECTED", "PG-Argv ist nicht an das frische Runtime-Target gebunden.");
  }
  return Object.freeze(intrinsicReflectApply(intrinsicArraySlice, argv, []));
}

export function buildBackupRestoreArgvSet({
  targetBinding,
  finalCommit,
  runDir,
  snapshotCapability,
  fsApi,
} = {}) {
  const run = runDirIdentity(runDir);
  const target = requireFreshRemoteTarget(targetBinding, assertCommit(finalCommit), run.runId);
  const validSnapshot = requireSnapshotCapability(snapshotCapability, {
    finalCommit,
    runId: run.runId,
    targetRuntimeDigest: target.runtimeDigest,
  });
  const common = { targetBinding, finalCommit, runDir, fsApi };
  return Object.freeze({
    snapshotIdSha256: hashBytes(Buffer.from(validSnapshot.snapshotId, "utf8")),
    snapshotKeeperArgv: buildPgArgv("snapshot-keeper", common),
    publicDumpArgv: buildPgArgv("dump-public", { ...common, snapshotCapability: validSnapshot }),
    migrationsDumpArgv: buildPgArgv("dump-migrations", { ...common, snapshotCapability: validSnapshot }),
    rolesDumpArgv: buildPgArgv("dump-roles", common),
    authProjectionArgv: buildPgArgv("auth-ids", common),
    authProjectionSql: buildAuthProjectionSql(validSnapshot, {
      finalCommit,
      runId: run.runId,
      targetRuntimeDigest: target.runtimeDigest,
    }),
    canonicalSourceArgv: buildPgArgv("canonical-source", common),
    canonicalSourceSql: buildCanonicalProjectionSql({
      side: "source",
      snapshotCapability: validSnapshot,
      finalCommit,
      runId: run.runId,
      targetRuntimeDigest: target.runtimeDigest,
    }),
    transcriptTrusted: false,
  });
}

export function buildSnapshotKeeperSql() {
  return [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    "SET LOCAL statement_timeout = '120s';",
    "SELECT 'E17B_SNAPSHOT|' || pg_export_snapshot();",
    "SELECT 'E17B_TARGET|db=' || current_database() || '|user=' || current_user || '|port=' || inet_server_port();",
    "SELECT 'E17B_KEEPER_READY';",
    "",
  ].join("\n");
}

export function parseSnapshotKeeperOutput(output, {
  targetBinding,
  finalCommit,
  runId,
  secrets = [],
} = {}) {
  assertNoSecretExposure(output, secrets);
  const target = requireFreshRemoteTarget(
    targetBinding,
    assertCommit(finalCommit),
    assertRunId(runId, finalCommit),
  );
  const lines = decodeUtf8Fatal(output, "Snapshot-Protokoll").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const expectedTarget = [
    "E17B_TARGET|db=",
    target.connection.database,
    "|user=",
    target.connection.user,
    "|port=",
    String(target.connection.port),
  ].join("");
  if (lines.length !== 3
      || !lines[0].startsWith("E17B_SNAPSHOT|")
      || lines[1] !== expectedTarget
      || lines[2] !== "E17B_KEEPER_READY") {
    stop("INVALID_SNAPSHOT_PROTOCOL", "Snapshot-Protokoll bindet nicht das frische Runtime-Target.");
  }
  const capability = Object.freeze({
    type: "fresh-snapshot-capability",
    snapshotId: assertSnapshotId(lines[0].slice("E17B_SNAPSHOT|".length)),
    finalCommit,
    runId,
    targetId: TARGET_ID,
    targetRuntimeDigest: target.runtimeDigest,
  });
  weakSetAdd(snapshotCapabilityBrand, capability);
  return capability;
}

function authProjectionSqlForId(snapshotId) {
  const validSnapshot = assertSnapshotId(snapshotId);
  return [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    `SET TRANSACTION SNAPSHOT '${validSnapshot}';`,
    "COPY (SELECT id::text FROM auth.users ORDER BY id::text COLLATE \"C\") TO STDOUT;",
    "COMMIT;",
    "",
  ].join("\n");
}

export function buildAuthProjectionSql(snapshotCapability, {
  finalCommit,
  runId,
  targetRuntimeDigest,
} = {}) {
  assertCommit(finalCommit);
  assertRunId(runId, finalCommit);
  validateDigest(targetRuntimeDigest, "REMOTE_TARGET_NOT_ATTESTED");
  return authProjectionSqlForId(requireSnapshotCapability(snapshotCapability, {
    finalCommit,
    runId,
    targetRuntimeDigest,
  }).snapshotId);
}

export function describeAuthProjectionSql() {
  return Object.freeze({
    sqlTemplate: authProjectionSqlForId("00000001-00000001-1")
      .replace("00000001-00000001-1", "<SNAPSHOT_CAPABILITY>"),
    sinkConsumable: false,
    snapshotPlaceholder: true,
  });
}

function canonicalProjectionSql({ side, snapshotId } = {}) {
  if (side !== "source" && side !== "restore" && side !== "postwrite") {
    stop("INVALID_CANONICAL_SIDE", "Canonical-SQL braucht die explizite Seite source/restore.");
  }
  if (side !== "source" && snapshotId !== undefined) {
    stop("INVALID_CANONICAL_SNAPSHOT", "Restore darf keine Remote-Snapshot-ID behaupten.");
  }
  const snapshotSql = side === "source"
    ? `SET TRANSACTION SNAPSHOT '${assertSnapshotId(snapshotId)}';`
    : null;
  return [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    snapshotSql,
    "SET LOCAL statement_timeout = '120s';",
    "SET LOCAL TIME ZONE 'UTC';",
    "SET LOCAL DateStyle = 'ISO, YMD';",
    "SET LOCAL extra_float_digits = 3;",
    "SET LOCAL bytea_output = 'hex';",
    `SELECT 'E17B_SIDE|${side}';`,
    ...CANONICAL_CATEGORIES.map((category) => `SELECT 'E17B_CATEGORY|${category}';`),
    `SELECT 'E17B_CATEGORY_SET|${EXPECTED_CATEGORY_SET_SHA256}';`,
    "WITH e17b_structure_parts(part) AS (",
    "  SELECT concat_ws('|', 'schema-owner', n.nspname, pg_get_userbyid(n.nspowner)) FROM pg_namespace n WHERE n.nspname IN ('public', 'supabase_migrations')",
    "  UNION ALL SELECT concat_ws('|', 'relation', n.nspname, c.relname, c.relkind::text, pg_get_userbyid(c.relowner), c.relrowsecurity::text, c.relforcerowsecurity::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND c.relkind IN ('r','p','v','m','S')",
    "  UNION ALL SELECT concat_ws('|', 'column', table_schema, table_name, ordinal_position::text, column_name, udt_schema, udt_name, is_nullable, coalesce(column_default,'<NULL>'), is_identity, identity_generation, identity_start, identity_increment, identity_maximum, identity_minimum, identity_cycle, is_generated, coalesce(generation_expression,'<NULL>')) FROM information_schema.columns WHERE table_schema IN ('public','supabase_migrations')",
    "  UNION ALL SELECT concat_ws('|', 'constraint', n.nspname, c.relname, con.conname, con.contype::text, con.convalidated::text, con.condeferrable::text, con.condeferred::text, pg_get_constraintdef(con.oid,true)) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','supabase_migrations')",
    "  UNION ALL SELECT concat_ws('|', 'index', n.nspname, c.relname, i.relname, x.indisvalid::text, x.indisready::text, x.indislive::text, x.indisunique::text, x.indisprimary::text, pg_get_indexdef(i.oid)) FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','supabase_migrations')",
    "  UNION ALL SELECT concat_ws('|', 'trigger', n.nspname, c.relname, t.tgname, t.tgenabled::text, pn.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_triggerdef(t.oid,true)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname IN ('public','supabase_migrations') AND NOT t.tgisinternal",
    "  UNION ALL SELECT concat_ws('|', 'policy', schemaname, tablename, policyname, permissive, (SELECT string_agg(role, ',' ORDER BY role COLLATE \"C\") FROM unnest(roles) role), cmd, coalesce(qual,'<NULL>'), coalesce(with_check,'<NULL>')) FROM pg_policies WHERE schemaname IN ('public','supabase_migrations')",
    "  UNION ALL SELECT concat_ws('|', 'function', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_userbyid(p.proowner), l.lanname, pg_get_function_result(p.oid), p.provolatile::text, p.proparallel::text, p.proisstrict::text, p.proleakproof::text, p.prosecdef::text, coalesce(to_jsonb(p.proconfig)::text,'null'), p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','supabase_migrations')",
    "  UNION ALL SELECT concat_ws('|', 'view', schemaname, viewname, viewowner, definition) FROM pg_views WHERE schemaname IN ('public','supabase_migrations')",
    "  UNION ALL SELECT concat_ws('|', 'type', n.nspname, t.typname, t.typtype::text, t.typcategory::text, pg_get_userbyid(t.typowner), t.typnotnull::text, coalesce(t.typdefault,'<NULL>')) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','supabase_migrations') AND t.typtype IN ('c','d','e','r')",
    "  UNION ALL SELECT concat_ws('|', 'sequence', schemaname, sequencename, sequenceowner, data_type, start_value::text, min_value::text, max_value::text, increment_by::text, cycle::text, cache_size::text, coalesce(last_value::text,'<NULL>')) FROM pg_sequences WHERE schemaname IN ('public','supabase_migrations')",
    "  UNION ALL SELECT concat_ws('|', 'role-membership', member.rolname, role.rolname, m.admin_option::text, m.inherit_option::text, m.set_option::text) FROM pg_auth_members m JOIN pg_roles role ON role.oid=m.roleid JOIN pg_roles member ON member.oid=m.member",
    ") SELECT 'E17B_STRUCTURE|' || encode(extensions.digest(convert_to(coalesce(string_agg(part,E'\\n' ORDER BY part COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') FROM e17b_structure_parts;",
    "WITH e17b_tables AS (SELECT table_schema||'.'||table_name identity FROM information_schema.tables WHERE table_schema IN ('public','supabase_migrations') AND table_type='BASE TABLE') SELECT 'E17B_TABLE_SET|' || encode(extensions.digest(convert_to(coalesce(string_agg(identity,E'\\n' ORDER BY identity COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') FROM e17b_tables;",
    "WITH e17b_auth_ids(part) AS (SELECT id::text FROM auth.users) SELECT 'E17B_AUTH_ID_SET|' || encode(extensions.digest(convert_to(coalesce(string_agg(part,E'\\n' ORDER BY part COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') FROM e17b_auth_ids;",
    "WITH rows(part) AS (SELECT jsonb_build_object('version',version,'name',name)::text FROM supabase_migrations.schema_migrations) SELECT 'E17B_LEDGER_HISTORY|' || encode(extensions.digest(convert_to(coalesce(string_agg(part,E'\\n' ORDER BY part COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') FROM rows;",
    "WITH rows(part) AS (SELECT jsonb_build_object('version',version,'name',name,'statements',to_jsonb(statements))::text FROM supabase_migrations.schema_migrations) SELECT 'E17B_LEDGER_ROWS|' || encode(extensions.digest(convert_to(coalesce(string_agg(part,E'\\n' ORDER BY part COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') FROM rows;",
    `SELECT 'E17B_LEDGER_STATE|' || count(*)::text || '|' || count(*) FILTER (WHERE version='${MIGRATION_VERSION}')::text FROM supabase_migrations.schema_migrations;`,
    "WITH rows(part) AS (SELECT concat_ws('|',n.nspname,c.relname,c.relrowsecurity::text,c.relforcerowsecurity::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND c.relkind IN ('r','p')) SELECT 'E17B_RLS|' || encode(extensions.digest(convert_to(coalesce(string_agg(part,E'\\n' ORDER BY part COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') FROM rows;",
    "WITH acl_parts(part) AS (",
    " SELECT concat_ws('|','schema',n.nspname,pg_get_userbyid(n.nspowner),CASE WHEN n.nspacl IS NULL THEN '<DEFAULT>' WHEN cardinality(n.nspacl)=0 THEN '<EMPTY>' ELSE '<EXPLICIT>' END,coalesce(x.grantor::regrole::text,'<NULL>'),coalesce(x.grantee::regrole::text,'PUBLIC'),coalesce(x.privilege_type,'<NULL>'),coalesce(x.is_grantable::text,'<NULL>')) FROM pg_namespace n LEFT JOIN LATERAL aclexplode(n.nspacl) x ON true WHERE n.nspname IN ('public','supabase_migrations')",
    " UNION ALL SELECT concat_ws('|','relation',n.nspname,c.relkind::text,c.relname,pg_get_userbyid(c.relowner),CASE WHEN c.relacl IS NULL THEN '<DEFAULT>' WHEN cardinality(c.relacl)=0 THEN '<EMPTY>' ELSE '<EXPLICIT>' END,coalesce(x.grantor::regrole::text,'<NULL>'),coalesce(x.grantee::regrole::text,'PUBLIC'),coalesce(x.privilege_type,'<NULL>'),coalesce(x.is_grantable::text,'<NULL>')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN LATERAL aclexplode(c.relacl) x ON true WHERE n.nspname IN ('public','supabase_migrations') AND c.relkind IN ('r','p','v','m','S')",
    " UNION ALL SELECT concat_ws('|','column',n.nspname,c.relname,a.attname,CASE WHEN a.attacl IS NULL THEN '<DEFAULT>' WHEN cardinality(a.attacl)=0 THEN '<EMPTY>' ELSE '<EXPLICIT>' END,coalesce(x.grantor::regrole::text,'<NULL>'),coalesce(x.grantee::regrole::text,'PUBLIC'),coalesce(x.privilege_type,'<NULL>'),coalesce(x.is_grantable::text,'<NULL>')) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN LATERAL aclexplode(a.attacl) x ON true WHERE n.nspname IN ('public','supabase_migrations') AND a.attnum>0 AND NOT a.attisdropped",
    " UNION ALL SELECT concat_ws('|','function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),CASE WHEN p.proacl IS NULL THEN '<DEFAULT>' WHEN cardinality(p.proacl)=0 THEN '<EMPTY>' ELSE '<EXPLICIT>' END,coalesce(x.grantor::regrole::text,'<NULL>'),coalesce(x.grantee::regrole::text,'PUBLIC'),coalesce(x.privilege_type,'<NULL>'),coalesce(x.is_grantable::text,'<NULL>')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN LATERAL aclexplode(p.proacl) x ON true WHERE n.nspname IN ('public','supabase_migrations')",
    " UNION ALL SELECT concat_ws('|','type',n.nspname,t.typname,pg_get_userbyid(t.typowner),CASE WHEN t.typacl IS NULL THEN '<DEFAULT>' WHEN cardinality(t.typacl)=0 THEN '<EMPTY>' ELSE '<EXPLICIT>' END,coalesce(x.grantor::regrole::text,'<NULL>'),coalesce(x.grantee::regrole::text,'PUBLIC'),coalesce(x.privilege_type,'<NULL>'),coalesce(x.is_grantable::text,'<NULL>')) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN LATERAL aclexplode(t.typacl) x ON true WHERE n.nspname IN ('public','supabase_migrations') AND t.typtype IN ('c','d','e','r')",
    " UNION ALL SELECT concat_ws('|','default',d.defaclrole::regrole::text,coalesce(n.nspname,''),d.defaclobjtype::text,CASE WHEN d.defaclacl IS NULL THEN '<DEFAULT>' WHEN cardinality(d.defaclacl)=0 THEN '<EMPTY>' ELSE '<EXPLICIT>' END,coalesce(x.grantor::regrole::text,'<NULL>'),coalesce(x.grantee::regrole::text,'PUBLIC'),coalesce(x.privilege_type,'<NULL>'),coalesce(x.is_grantable::text,'<NULL>')) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace LEFT JOIN LATERAL aclexplode(d.defaclacl) x ON true WHERE n.nspname IN ('public','supabase_migrations') OR d.defaclnamespace=0",
    ") SELECT 'E17B_ACL|' || encode(extensions.digest(convert_to(coalesce(string_agg(part,E'\\n' ORDER BY part COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') FROM acl_parts;",
    "SELECT format($e17b$SELECT %L || count(*) FILTER (WHERE NOT (%L='supabase_migrations.schema_migrations' AND to_jsonb(t)->>'version'=%L))::text || '|' || encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') || '|' || encode(extensions.digest(convert_to(coalesce(string_agg(CASE WHEN %L='public.kd_ai_limits' THEN jsonb_set(to_jsonb(t),'{wert}',coalesce(to_jsonb(t)->'wert','{}'::jsonb)-'blog-profile-extract')::text WHEN %L='supabase_migrations.schema_migrations' AND to_jsonb(t)->>'version'=%L THEN NULL ELSE to_jsonb(t)::text END,E'\\n' ORDER BY CASE WHEN %L='public.kd_ai_limits' THEN jsonb_set(to_jsonb(t),'{wert}',coalesce(to_jsonb(t)->'wert','{}'::jsonb)-'blog-profile-extract')::text ELSE to_jsonb(t)::text END COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') || '|' || encode(extensions.digest(convert_to(coalesce(string_agg(CASE WHEN %L='supabase_migrations.schema_migrations' AND to_jsonb(t)->>'version'=%L THEN NULL WHEN %L='public.kd_ai_limits' THEN jsonb_build_object('schluessel',to_jsonb(t)->>'schluessel','keys',(SELECT jsonb_agg(k ORDER BY k COLLATE \"C\") FROM jsonb_object_keys((to_jsonb(t)->'wert')-'blog-profile-extract') k))::text ELSE '{}' END,E'\\n' ORDER BY to_jsonb(t)::text COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') || '|' || encode(extensions.digest(convert_to(coalesce(string_agg(CASE WHEN %L='supabase_migrations.schema_migrations' AND to_jsonb(t)->>'version'=%L THEN NULL WHEN %L='public.kd_ai_limits' THEN jsonb_build_object('schluessel',to_jsonb(t)->>'schluessel','wertType',jsonb_typeof(to_jsonb(t)->'wert'))::text ELSE '{}' END,E'\\n' ORDER BY to_jsonb(t)::text COLLATE \"C\"),''),'UTF8'),'sha256'),'hex') FROM %I.%I t;$e17b$,'E17B_CANONICAL|'||table_schema||'.'||table_name||'|',table_schema||'.'||table_name,'${MIGRATION_VERSION}',table_schema||'.'||table_name,table_schema||'.'||table_name,'${MIGRATION_VERSION}',table_schema||'.'||table_name,table_schema||'.'||table_name,'${MIGRATION_VERSION}',table_schema||'.'||table_name,table_schema||'.'||table_name,'${MIGRATION_VERSION}',table_schema||'.'||table_name,table_schema,table_name) FROM information_schema.tables WHERE table_schema IN ('public','supabase_migrations') AND table_type='BASE TABLE' ORDER BY (table_schema||'.'||table_name) COLLATE \"C\";",
    "\\gexec",
    "SELECT 'E17B_TARGET_JSON|' || coalesce((SELECT wert->>'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_modell'),'<NULL>') || '|' || coalesce((SELECT wert->>'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_max_tokens'),'<NULL>') || '|' || coalesce((SELECT wert->>'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_max_reservierung_usd_cent'),'<NULL>');",
    "COMMIT;",
    "",
  ].filter((line) => line !== null).join("\n");
}

export function buildCanonicalProjectionSql({
  side,
  snapshotCapability,
  finalCommit,
  runId,
  targetRuntimeDigest,
} = {}) {
  const snapshotId = side === "source"
    ? requireSnapshotCapability(snapshotCapability, {
      finalCommit: assertCommit(finalCommit),
      runId: assertRunId(runId, finalCommit),
      targetRuntimeDigest: validateDigest(targetRuntimeDigest, "REMOTE_TARGET_NOT_ATTESTED"),
    }).snapshotId
    : undefined;
  return canonicalProjectionSql({ side, snapshotId });
}

export function buildPostwriteProjectionSql() {
  return canonicalProjectionSql({ side: "postwrite" });
}

export function describeCanonicalProjectionSql({ side } = {}) {
  if (side === "source") {
    return Object.freeze({
      sqlTemplate: canonicalProjectionSql({ side, snapshotId: "00000001-00000001-1" })
        .replace("00000001-00000001-1", "<SNAPSHOT_CAPABILITY>"),
      sinkConsumable: false,
      snapshotPlaceholder: true,
    });
  }
  return Object.freeze({
    sqlTemplate: canonicalProjectionSql({ side }),
    sinkConsumable: false,
    snapshotPlaceholder: false,
  });
}

export function buildLedgerProtocolSql({ phase } = {}) {
  if (phase !== "pre" && phase !== "post") {
    stop("INVALID_LEDGER_PHASE", "Ledgerphase ist nicht pre/post.");
  }
  return [
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    "SET LOCAL statement_timeout = '120s';",
    "SELECT 'E17B_LEDGER_ROW|' || coalesce(version, '<NULL>') || '|' || coalesce(name, '<NULL>')",
    "  FROM supabase_migrations.schema_migrations",
    " ORDER BY version COLLATE \"C\", name COLLATE \"C\";",
    "WITH e17b_target AS (",
    "  SELECT version, name, statements",
    "    FROM supabase_migrations.schema_migrations",
    `   WHERE version = '${MIGRATION_VERSION}'`,
    ")",
    "SELECT 'E17B_TARGET|' || count(*)::text || '|' || coalesce(min(name), '') || '|' ||",
    "       CASE",
    "         WHEN count(*) = 0 THEN 'absent'",
    "         WHEN count(*) = 1",
    "          AND count(*) FILTER (WHERE statements IS NULL OR statements <> '{}'::text[]) = 0",
    "           THEN 'empty'",
    "         ELSE 'invalid'",
    "       END",
    "  FROM e17b_target;",
    "SELECT 'E17B_JSON|task_modell|' || CASE",
    "  WHEN NOT (wert ? 'blog-profile-extract') THEN 'absent'",
    "  WHEN wert->'blog-profile-extract' = to_jsonb('klein'::text) THEN 'klein' ELSE 'drift' END",
    "  FROM public.kd_ai_limits WHERE schluessel = 'task_modell';",
    "SELECT 'E17B_JSON|task_max_tokens|' || CASE",
    "  WHEN NOT (wert ? 'blog-profile-extract') THEN 'absent'",
    "  WHEN wert->'blog-profile-extract' = to_jsonb(2048) THEN '2048' ELSE 'drift' END",
    "  FROM public.kd_ai_limits WHERE schluessel = 'task_max_tokens';",
    "SELECT 'E17B_JSON|task_max_reservierung_usd_cent|' || CASE",
    "  WHEN NOT (wert ? 'blog-profile-extract') THEN 'absent'",
    "  WHEN wert->'blog-profile-extract' = to_jsonb(5) THEN '5' ELSE 'drift' END",
    "  FROM public.kd_ai_limits WHERE schluessel = 'task_max_reservierung_usd_cent';",
    `SELECT 'E17B_CONTRACT|${phase}|${EXPECTED_LEDGER_HISTORY_SHA256}';`,
    "COMMIT;",
    "",
  ].join("\n");
}

function protocolLines(output, label, secrets) {
  assertNoSecretExposure(output, secrets);
  const lines = decodeUtf8Fatal(output, label).split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.some((line) => line === "")) {
    stop("INVALID_PROTOCOL", `${label} enthält eine verschwundene/NULL-Zeile.`);
  }
  return lines;
}

export function parseAuthIdProjectionOutput(output, { secrets = [] } = {}) {
  const ids = protocolLines(output, "Auth-ID-Projektion", secrets);
  if (!ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
      || new Set(ids).size !== ids.length
      || JSON.stringify(ids) !== JSON.stringify([...ids].sort())) {
    stop("INVALID_AUTH_ID_PROJECTION", "Auth-ID-Projektion ist NULL/formfremd/dupliziert/unsortiert.");
  }
  return Object.freeze({
    authIdSetSha256: hashBytes(Buffer.from(ids.join("\n"), "utf8")),
    authIdCount: ids.length,
    artifactSha256: hashBytes(toBuffer(output)),
    trusted: false,
  });
}

export function parseCanonicalProjectionOutput(output, { side, secrets = [] } = {}) {
  const lines = protocolLines(output, "Canonical-Protokoll", secrets);
  if (!['source', 'restore', 'postwrite'].includes(side)) {
    stop("INVALID_CANONICAL_SIDE", "Canonical-Parser braucht die erwartete Seite.");
  }
  const categoryLines = CANONICAL_CATEGORIES.map((category) => `E17B_CATEGORY|${category}`);
  const header = [
    `E17B_SIDE|${side}`,
    ...categoryLines,
    `E17B_CATEGORY_SET|${EXPECTED_CATEGORY_SET_SHA256}`,
  ];
  const cursor = header.length;
  if (lines.length < cursor + 9
      || JSON.stringify(lines.slice(0, cursor)) !== JSON.stringify(header)
      || !/^E17B_STRUCTURE\|[0-9a-f]{64}$/.test(lines[cursor])
      || !/^E17B_TABLE_SET\|[0-9a-f]{64}$/.test(lines[cursor + 1])
      || !/^E17B_AUTH_ID_SET\|[0-9a-f]{64}$/.test(lines[cursor + 2])
      || !/^E17B_LEDGER_HISTORY\|[0-9a-f]{64}$/.test(lines[cursor + 3])
      || !/^E17B_LEDGER_ROWS\|[0-9a-f]{64}$/.test(lines[cursor + 4])
      || !/^E17B_LEDGER_STATE\|(?:0|[1-9][0-9]*)\|[01]$/.test(lines[cursor + 5])
      || !/^E17B_RLS\|[0-9a-f]{64}$/.test(lines[cursor + 6])
      || !/^E17B_ACL\|[0-9a-f]{64}$/.test(lines[cursor + 7])
      || !/^E17B_TARGET_JSON\|[^|]*\|[^|]*\|[^|]*$/.test(lines.at(-1))) {
    stop("INVALID_CANONICAL_PROTOCOL", "Canonical-Protokoll besitzt keine exakten Kopfmarker.");
  }
  const structureSha256 = lines[cursor].slice("E17B_STRUCTURE|".length);
  const declaredTableSetSha256 = lines[cursor + 1].slice("E17B_TABLE_SET|".length);
  const ledgerState = lines[cursor + 5].split("|");
  const ledgerCount = Number(ledgerState[1]);
  const targetCount = Number(ledgerState[2]);
  const targetJson = lines.at(-1).split("|").slice(1);
  const expectedTargetJson = side === "postwrite"
    ? ["klein", "2048", "5"]
    : ["<NULL>", "<NULL>", "<NULL>"];
  if (!Number.isSafeInteger(ledgerCount)
      || targetCount !== (side === "postwrite" ? 1 : 0)
      || JSON.stringify(targetJson) !== JSON.stringify(expectedTargetJson)) {
    stop("CANONICAL_TARGET_STATE_MISMATCH", "Canonical-Ziel-/Ledgerzustand passt nicht zur Seite.");
  }
  const rows = lines.slice(cursor + 8, -1).map((line) => {
    const fields = line.split("|");
    if (fields.length !== 7
        || fields[0] !== "E17B_CANONICAL"
        || !/^(?:public|supabase_migrations)\.[a-z_][a-z0-9_$]*$/.test(fields[1])
        || !/^(?:0|[1-9][0-9]*)$/.test(fields[2])
        || !fields.slice(3).every((value) => SHA256.test(value))) {
      stop("INVALID_CANONICAL_PROTOCOL", "Canonical-Tabellenmarker ist formfremd.");
    }
    const rowCount = Number(fields[2]);
    if (!Number.isSafeInteger(rowCount)) {
      stop("INVALID_CANONICAL_PROTOCOL", "Canonical-Rowcount ist nicht sicher darstellbar.");
    }
    return Object.freeze({
      table: fields[1],
      rowCount,
      dataSha256: fields[3],
      nonTargetDataSha256: fields[4],
      nonTargetKeysSha256: fields[5],
      nonTargetFlagsSha256: fields[6],
    });
  });
  const identities = rows.map(({ table }) => table);
  if (new Set(identities).size !== identities.length
      || JSON.stringify(identities) !== JSON.stringify([...identities].sort())
      || !identities.includes("public.kd_ai_limits")
      || !identities.includes("supabase_migrations.schema_migrations")) {
    stop("INVALID_CANONICAL_PROTOCOL", "Canonical-Tabellen sind dupliziert oder nicht C-sortiert.");
  }
  const tableSetSha256 = hashBytes(Buffer.from(identities.join("\n"), "utf8"));
  if (tableSetSha256 !== declaredTableSetSha256) {
    stop("CANONICAL_TABLE_SET_MISMATCH", "Canonical-Tabellenmengenmarker ist substituiert.");
  }
  const rowCountSet = rows.map(({ table, rowCount }) => ({ table, rowCount }));
  const dataHashSet = rows.map(({ table, dataSha256 }) => ({ table, dataSha256 }));
  const hashFactSet = (key) => rows.map(({ table, [key]: sha256 }) => ({ table, sha256 }));
  return Object.freeze({
    facts: Object.freeze({
      categorySetSha256: EXPECTED_CATEGORY_SET_SHA256,
      structureSha256,
      tableSetSha256,
      rowCountSetSha256: hashBytes(Buffer.from(JSON.stringify(rowCountSet), "utf8")),
      dataHashSetSha256: hashBytes(Buffer.from(JSON.stringify(dataHashSet), "utf8")),
      nonTargetDataSha256: hashBytes(Buffer.from(JSON.stringify(hashFactSet("nonTargetDataSha256")), "utf8")),
      nonTargetKeysSha256: hashBytes(Buffer.from(JSON.stringify(hashFactSet("nonTargetKeysSha256")), "utf8")),
      nonTargetFlagsSha256: hashBytes(Buffer.from(JSON.stringify(hashFactSet("nonTargetFlagsSha256")), "utf8")),
      authIdSetSha256: lines[cursor + 2].slice("E17B_AUTH_ID_SET|".length),
      ledgerHistorySha256: lines[cursor + 3].slice("E17B_LEDGER_HISTORY|".length),
      ledgerRowsSha256: lines[cursor + 4].slice("E17B_LEDGER_ROWS|".length),
      ledgerCount,
      targetCount,
      rlsSha256: lines[cursor + 6].slice("E17B_RLS|".length),
      aclSha256: lines[cursor + 7].slice("E17B_ACL|".length),
    }),
    side,
    tableCount: rows.length,
    artifactSha256: hashBytes(toBuffer(output)),
    trusted: false,
  });
}

export function parseLedgerProtocol(output, { phase, secrets = [] } = {}) {
  if (phase !== "pre" && phase !== "post") {
    stop("INVALID_LEDGER_PHASE", "Ledgerphase ist nicht pre/post.");
  }
  const lines = protocolLines(output, "Ledger-Protokoll", secrets);
  const targetIdentity = { version: MIGRATION_VERSION, name: LEDGER_NAME };
  const expectedHistory = phase === "pre"
    ? EXPECTED_LEDGER_HISTORY
    : [...EXPECTED_LEDGER_HISTORY, targetIdentity];
  const ledgerLines = expectedHistory.map(
    ({ version, name }) => `E17B_LEDGER_ROW|${version}|${name}`,
  );
  const tail = lines.slice(ledgerLines.length);
  if (JSON.stringify(lines.slice(0, ledgerLines.length)) !== JSON.stringify(ledgerLines)
      || tail.length !== 5
      || !tail[0].startsWith("E17B_TARGET|")
      || !tail[1].startsWith("E17B_JSON|task_modell|")
      || !tail[2].startsWith("E17B_JSON|task_max_tokens|")
      || !tail[3].startsWith("E17B_JSON|task_max_reservierung_usd_cent|")
      || tail[4] !== `E17B_CONTRACT|${phase}|${EXPECTED_LEDGER_HISTORY_SHA256}`) {
    stop("INVALID_LEDGER_PROTOCOL", "Ledgerhistorie ist fehlend/extra/umgeordnet/formfremd.");
  }
  const target = tail[0].split("|");
  if (target.length !== 4 || !/^(?:0|1)$/.test(target[1])) {
    stop("INVALID_LEDGER_PROTOCOL", "Targetmarker besitzt kein reales Aggregatformat.");
  }
  const targetCount = Number(target[1]);
  const targetName = target[2];
  const targetStatements = target[3];
  const expectedTarget = phase === "pre"
    ? targetCount === 0 && targetName === "" && targetStatements === "absent"
    : targetCount === 1 && targetName === LEDGER_NAME && targetStatements === "empty";
  const jsonStates = {
    task_modell: tail[1].slice("E17B_JSON|task_modell|".length),
    task_max_tokens: tail[2].slice("E17B_JSON|task_max_tokens|".length),
    task_max_reservierung_usd_cent: tail[3].slice(
      "E17B_JSON|task_max_reservierung_usd_cent|".length,
    ),
  };
  const expectedJson = phase === "pre"
    ? {
      task_modell: "absent",
      task_max_tokens: "absent",
      task_max_reservierung_usd_cent: "absent",
    }
    : {
      task_modell: "klein",
      task_max_tokens: "2048",
      task_max_reservierung_usd_cent: "5",
    };
  if (!expectedTarget || canonicalJson(jsonStates) !== canonicalJson(expectedJson)) {
    stop("LEDGER_DRIFT", "Target-Ledger/JSON-Konfiguration weicht fail-closed ab.");
  }
  return Object.freeze({
    phase,
    ledgerCount: expectedHistory.length,
    targetCount,
    targetName,
    targetStatements,
    jsonStates: Object.freeze(jsonStates),
    ledgerHistorySha256: EXPECTED_LEDGER_HISTORY_SHA256,
  });
}

export function compareCanonicalProof(source, restored) {
  if (!exactKeys(source, CANONICAL_FACTS) || !exactKeys(restored, CANONICAL_FACTS)) {
    stop("CANONICAL_PROOF_SHAPE", "Canonical-Hashset besitzt nicht exakt vier Facts.");
  }
  for (const key of CANONICAL_FACTS) {
    validateDigest(source[key]);
    validateDigest(restored[key]);
    if (source[key] !== restored[key]) {
      stop("CANONICAL_MISMATCH", "Canonical SOURCE/RESTORE weichen ab.");
    }
  }
  return Object.freeze({
    facts: Object.freeze(Object.fromEntries(CANONICAL_FACTS.map((key) => [key, source[key]]))),
    trusted: false,
  });
}

const CANONICAL_V2_PROTOCOL = "KDV2";
const CANONICAL_V2_PROTOCOL_VERSION = "1";
const CANONICAL_V2_ROLES = Object.freeze([
  "22-canonical-detail",
  "23-canonical-detail",
  "42-db-postflight",
  "90-remote-delta",
]);
const CANONICAL_V2_ROLE_PHASE = Object.freeze({
  "22-canonical-detail": "baseline",
  "23-canonical-detail": "baseline",
  "42-db-postflight": "postwrite",
  "90-remote-delta": "postwrite",
});
const CANONICAL_V2_CATEGORIES = Object.freeze([
  "schema",
  "relation",
  "column",
  "constraint",
  "index",
  "trigger",
  "policy",
  "view",
  "matview",
  "routine",
  "type",
  "sequence",
  "extension",
  "acl",
  "default_acl",
  "role",
  "membership",
  "inheritance",
  "table_set",
  "table_rowcount",
  "table_data",
  "auth_id",
  "ledger",
  "target_contract",
]);
const CANONICAL_V2_INVARIANT_CATEGORIES = Object.freeze(
  CANONICAL_V2_CATEGORIES.filter((category) => category !== "target_contract"),
);
const CANONICAL_V2_SNAPSHOT_ID = /^[0-9A-F]{8}-[0-9A-F]{8}-[1-9][0-9]*$/i;
const CANONICAL_V2_HEX = /^(?:[0-9a-f]{2})*$/;
const CANONICAL_V2_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

const canonicalV2SessionBrand = new WeakSet();
const canonicalV2SessionMeta = new WeakMap();
const canonicalV2PlanBrand = new WeakSet();
const canonicalV2PlanMeta = new WeakMap();
const canonicalV2ConsumedPlans = new WeakSet();
const canonicalV2TranscriptBrand = new WeakSet();
const canonicalV2TranscriptMeta = new WeakMap();
const canonicalV2ConsumedTranscripts = new WeakSet();
const canonicalV2SummaryBrand = new WeakSet();
const canonicalV2SummaryMeta = new WeakMap();

const CANONICAL_V2_CELL_SCHEMAS = Object.freeze({
  schema: Object.freeze(["schema", "owner"]),
  relation: Object.freeze([
    "schema", "name", "owner", "kind", "persistence", "rls", "force_rls",
    "replica_identity", "partition", "options",
  ]),
  column: Object.freeze([
    "schema", "relation", "position", "name", "type_schema", "type", "type_mod",
    "collation_schema", "collation", "not_null", "default", "identity", "generated",
  ]),
  constraint: Object.freeze([
    "schema", "relation", "name", "type", "validated", "deferrable", "deferred",
    "referenced_schema", "referenced_relation", "definition",
  ]),
  index: Object.freeze([
    "schema", "relation", "index", "owner", "access_method", "valid", "ready", "live",
    "replica_identity", "clustered", "predicate", "expression", "definition",
  ]),
  trigger: Object.freeze([
    "schema", "relation", "name", "enabled", "internal", "function_schema", "function",
    "function_args", "definition",
  ]),
  policy: Object.freeze([
    "schema", "relation", "name", "permissive", "roles", "command", "using", "check",
  ]),
  view: Object.freeze(["schema", "name", "owner", "definition"]),
  matview: Object.freeze(["schema", "name", "owner", "populated", "options", "definition"]),
  routine: Object.freeze([
    "schema", "name", "kind", "owner", "identity_args", "language", "result", "volatility",
    "parallel", "strict", "leakproof", "security_definer", "config", "source", "binary",
  ]),
  type: Object.freeze([
    "schema", "name", "kind", "owner", "category", "base", "collation", "not_null",
    "default", "enum_order", "composite", "domain_constraints", "range",
  ]),
  sequence: Object.freeze([
    "schema", "name", "owner", "type", "start", "min", "max", "increment", "cache",
    "cycle", "owned_schema", "owned_relation", "owned_column", "last_value", "is_called",
  ]),
  extension: Object.freeze(["name", "schema", "version", "relocatable"]),
  acl: Object.freeze([
    "kind", "schema", "object", "subobject", "owner", "grantor", "grantee", "privilege",
    "grantable",
  ]),
  default_acl: Object.freeze([
    "owner", "schema", "object_type", "grantor", "grantee", "privilege", "grantable",
  ]),
  role: Object.freeze([
    "name", "super", "inherit", "create_role", "create_db", "login", "replication",
    "bypass_rls", "connection_limit", "config",
  ]),
  membership: Object.freeze(["role", "member", "grantor", "admin", "inherit", "set"]),
  inheritance: Object.freeze([
    "parent_schema", "parent", "child_schema", "child", "sequence", "detach_pending",
    "partition_key", "partition_bound",
  ]),
  table_set: Object.freeze(["schema", "relation", "kind", "partition"]),
  table_rowcount: Object.freeze(["schema", "relation", "count"]),
  auth_id: Object.freeze(["uuid"]),
  ledger: Object.freeze(["version", "name", "statements", "dimensions"]),
  target_contract: Object.freeze(["phase"]),
});

function canonicalV2IsArtifact(value) {
  return weakSetHas(canonicalV2SessionBrand, value)
    || weakSetHas(canonicalV2PlanBrand, value)
    || weakSetHas(canonicalV2TranscriptBrand, value)
    || weakSetHas(canonicalV2SummaryBrand, value);
}

function assertNoCanonicalV2Artifacts(value, label = "Trustgrenze") {
  const visited = new WeakSet();
  function visit(current) {
    if (current === null || (typeof current !== "object" && typeof current !== "function")) return;
    if (canonicalV2IsArtifact(current)) {
      stop(
        "CANONICAL_V2_ARTIFACT_REJECTED",
        `${label} akzeptiert keine Canonical-v2-Session-, Plan-, Transcript- oder Summary-Artefakte.`,
      );
    }
    if (weakSetHas(visited, current)) return;
    weakSetAdd(visited, current);
    const byteValue = inspectByteValue(current, `${label}-Bytes`);
    if (byteValue) return;
    const { descriptors, prototype } = inspectDescriptors(current, label);
    if (typeof current === "function") return;
    const array = intrinsicArrayIsArray(current);
    if (array) {
      const length = descriptors.length?.value;
      if (prototype !== intrinsicArrayPrototype || !Number.isSafeInteger(length) || length < 0) {
        stop("SECRET_GUARD_UNINSPECTABLE", `${label} enthält ein manipuliertes Array.`);
      }
      assertExactIndexedDescriptors(descriptors, length, label, { allowLength: true });
    } else if (prototype !== intrinsicObjectPrototype && prototype !== null) {
      return;
    }
    for (const key of intrinsicOwnKeys(descriptors)) {
      if (key === "length" && array) continue;
      visit(descriptors[key].value);
    }
  }
  visit(value);
  return true;
}

function weakMapGet(map, key) {
  return intrinsicReflectApply(intrinsicWeakMapGet, map, [key]);
}

function weakMapSet(map, key, value) {
  intrinsicReflectApply(intrinsicWeakMapSet, map, [key, value]);
  return value;
}

function canonicalV2ExactDescriptorKeys(descriptors, expected, label) {
  const actual = intrinsicOwnKeys(descriptors);
  if (actual.length !== expected.length
      || actual.some((key, index) => key !== expected[index])) {
    stop("CANONICAL_V2_UNINSPECTABLE", `${label} besitzt fehlende, zusätzliche oder umgeordnete Keys.`);
  }
}

function canonicalV2InspectOptions(value, expected, label) {
  const descriptors = inspectOrdinaryDataObject(value, label);
  canonicalV2ExactDescriptorKeys(descriptors, expected, label);
  return descriptors;
}

function canonicalV2AssertSnapshotId(snapshotId) {
  if (typeof snapshotId !== "string" || !CANONICAL_V2_SNAPSHOT_ID.test(snapshotId)) {
    stop("INVALID_CANONICAL_V2_SNAPSHOT", "Snapshot-ID ist nicht kanonisch.");
  }
  return snapshotId;
}

function canonicalV2Cell(type, expression) {
  return `jsonb_build_array('${type}',CASE WHEN (${expression}) IS NULL THEN 'null' ELSE 'value' END,CASE WHEN (${expression}) IS NULL THEN NULL ELSE octet_length(convert_to((${expression})::text,'UTF8')) END,CASE WHEN (${expression}) IS NULL THEN NULL ELSE encode(convert_to((${expression})::text,'UTF8'),'hex') END)`;
}

function canonicalV2Record(...cells) {
  return `jsonb_build_array(${cells.join(",")})`;
}

function canonicalV2StaticQueries() {
  const c = canonicalV2Cell;
  const r = canonicalV2Record;
  const relevantRoles = `WITH RECURSIVE object_acls(acl) AS (
    SELECT n.nspacl FROM pg_namespace n WHERE n.nspname IN ('public','supabase_migrations')
    UNION ALL SELECT x.relacl FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations')
    UNION ALL SELECT p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','supabase_migrations') AND l.lanname<>'internal'
    UNION ALL SELECT t.typacl FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','supabase_migrations')
    UNION ALL SELECT a.attacl FROM pg_attribute a JOIN pg_class x ON x.oid=a.attrelid JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT d.defaclacl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN ('public','supabase_migrations') OR d.defaclnamespace=0
  ), seed(oid) AS (
    SELECT n.nspowner FROM pg_namespace n WHERE n.nspname IN ('public','supabase_migrations')
    UNION SELECT c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','supabase_migrations')
    UNION SELECT p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','supabase_migrations') AND l.lanname<>'internal'
    UNION SELECT t.typowner FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','supabase_migrations')
    UNION SELECT d.defaclrole FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN ('public','supabase_migrations') OR d.defaclnamespace=0
    UNION SELECT a.grantor FROM object_acls o CROSS JOIN LATERAL aclexplode(o.acl) a
    UNION SELECT a.grantee FROM object_acls o CROSS JOIN LATERAL aclexplode(o.acl) a WHERE a.grantee<>0
  ), relevant(oid) AS (
    SELECT oid FROM seed
    UNION
    SELECT endpoint.oid FROM pg_auth_members m JOIN relevant x ON x.oid IN (m.roleid,m.member,m.grantor)
    CROSS JOIN LATERAL (VALUES (m.roleid),(m.member),(m.grantor)) endpoint(oid)
  )`;
  return Object.freeze({
    schema: `SELECT ${r(c("schema", "n.nspname"),c("owner", "pg_get_userbyid(n.nspowner)"))} payload FROM pg_namespace n WHERE n.nspname IN ('public','supabase_migrations')`,
    relation: `SELECT ${r(
      c("schema", "n.nspname"), c("name", "x.relname"),
      c("owner", "pg_get_userbyid(x.relowner)"), c("kind", "x.relkind"),
      c("persistence", "x.relpersistence"), c("rls", "x.relrowsecurity"),
      c("force_rls", "x.relforcerowsecurity"), c("replica_identity", "x.relreplident"),
      c("partition", "x.relispartition"),
      c("options", "(SELECT jsonb_agg(v ORDER BY v COLLATE \"C\") FROM unnest(x.reloptions) v)"),
    )} payload FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind IN ('r','p','v','m','S')`,
    column: `SELECT ${r(
      c("schema", "n.nspname"),c("relation", "x.relname"),c("position", "a.attnum"),
      c("name", "a.attname"),c("type_schema", "tn.nspname"),c("type", "t.typname"),
      c("type_mod", "a.atttypmod"),c("collation_schema", "cn.nspname"),
      c("collation", "co.collname"),c("not_null", "a.attnotnull"),
      c("default", "pg_get_expr(d.adbin,d.adrelid,true)"),c("identity", "a.attidentity"),
      c("generated", "a.attgenerated")
    )} payload FROM pg_attribute a JOIN pg_class x ON x.oid=a.attrelid JOIN pg_namespace n ON n.oid=x.relnamespace JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped`,
    constraint: `SELECT ${r(
      c("schema", "n.nspname"),c("relation", "x.relname"),c("name", "k.conname"),
      c("type", "k.contype"),c("validated", "k.convalidated"),
      c("deferrable", "k.condeferrable"),c("deferred", "k.condeferred"),
      c("referenced_schema", "rn.nspname"),c("referenced_relation", "rx.relname"),
      c("definition", "pg_get_constraintdef(k.oid,true)")
    )} payload FROM pg_constraint k JOIN pg_class x ON x.oid=k.conrelid JOIN pg_namespace n ON n.oid=x.relnamespace LEFT JOIN pg_class rx ON rx.oid=k.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rx.relnamespace WHERE n.nspname IN ('public','supabase_migrations')`,
    index: `SELECT ${r(
      c("schema", "n.nspname"),c("relation", "x.relname"),c("index", "i.relname"),
      c("owner", "pg_get_userbyid(i.relowner)"),c("access_method", "am.amname"),
      c("valid", "k.indisvalid"),c("ready", "k.indisready"),c("live", "k.indislive"),
      c("replica_identity", "k.indisreplident"),c("clustered", "k.indisclustered"),
      c("predicate", "pg_get_expr(k.indpred,k.indrelid,true)"),
      c("expression", "pg_get_expr(k.indexprs,k.indrelid,true)"),
      c("definition", "pg_get_indexdef(i.oid)")
    )} payload FROM pg_index k JOIN pg_class x ON x.oid=k.indrelid JOIN pg_class i ON i.oid=k.indexrelid JOIN pg_namespace n ON n.oid=x.relnamespace JOIN pg_am am ON am.oid=i.relam WHERE n.nspname IN ('public','supabase_migrations')`,
    trigger: `SELECT ${r(
      c("schema", "n.nspname"),c("relation", "x.relname"),c("name", "g.tgname"),
      c("enabled", "g.tgenabled"),c("internal", "g.tgisinternal"),
      c("function_schema", "pn.nspname"),c("function", "p.proname"),
      c("function_args", "pg_get_function_identity_arguments(p.oid)"),
      c("definition", "pg_get_triggerdef(g.oid,true)")
    )} payload FROM pg_trigger g JOIN pg_class x ON x.oid=g.tgrelid JOIN pg_namespace n ON n.oid=x.relnamespace JOIN pg_proc p ON p.oid=g.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname IN ('public','supabase_migrations')`,
    policy: `SELECT ${r(
      c("schema", "p.schemaname"),c("relation", "p.tablename"),c("name", "p.policyname"),
      c("permissive", "p.permissive"),
      c("roles", "(SELECT jsonb_agg(v ORDER BY v COLLATE \"C\") FROM unnest(p.roles) v)"),
      c("command", "p.cmd"),c("using", "p.qual"),c("check", "p.with_check")
    )} payload FROM pg_policies p WHERE p.schemaname IN ('public','supabase_migrations')`,
    view: `SELECT ${r(
      c("schema", "v.schemaname"),c("name", "v.viewname"),c("owner", "v.viewowner"),
      c("definition", "v.definition")
    )} payload FROM pg_views v WHERE v.schemaname IN ('public','supabase_migrations')`,
    matview: `SELECT ${r(
      c("schema", "n.nspname"),c("name", "x.relname"),c("owner", "pg_get_userbyid(x.relowner)"),
      c("populated", "x.relispopulated"),
      c("options", "(SELECT jsonb_agg(v ORDER BY v COLLATE \"C\") FROM unnest(x.reloptions) v)"),
      c("definition", "pg_get_viewdef(x.oid,true)")
    )} payload FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind='m'`,
    routine: `SELECT ${r(
      c("schema", "n.nspname"),c("name", "p.proname"),c("kind", "p.prokind"),
      c("owner", "pg_get_userbyid(p.proowner)"),c("identity_args", "pg_get_function_identity_arguments(p.oid)"),
      c("language", "l.lanname"),c("result", "pg_get_function_result(p.oid)"),
      c("volatility", "p.provolatile"),c("parallel", "p.proparallel"),
      c("strict", "p.proisstrict"),c("leakproof", "p.proleakproof"),c("security_definer", "p.prosecdef"),
      c("config", "(SELECT jsonb_agg(v ORDER BY v COLLATE \"C\") FROM unnest(p.proconfig) v)"),
      c("source", "p.prosrc"),c("binary", "p.probin")
    )} payload FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','supabase_migrations') AND l.lanname<>'internal'`,
    type: `SELECT ${r(
      c("schema", "n.nspname"),c("name", "t.typname"),c("kind", "t.typtype"),
      c("owner", "pg_get_userbyid(t.typowner)"),c("category", "t.typcategory"),
      c("base", "format_type(t.typbasetype,t.typtypmod)"),c("collation", "t.typcollation::regcollation::text"),
      c("not_null", "t.typnotnull"),c("default", "t.typdefault"),
      c("enum_order", "(SELECT jsonb_agg(jsonb_build_array(e.enumsortorder,e.enumlabel) ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)"),
      c("composite", "(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.typrelid AND a.attnum>0 AND NOT a.attisdropped)"),
      c("domain_constraints", "(SELECT jsonb_agg(pg_get_constraintdef(k.oid,true) ORDER BY k.conname COLLATE \"C\") FROM pg_constraint k WHERE k.contypid=t.oid)"),
      c("range", "(SELECT jsonb_build_array(format_type(g.rngsubtype,NULL),g.rngcollation::regcollation::text,g.rngsubopc::regclass::text,g.rngcanonical::regprocedure::text,g.rngsubdiff::regprocedure::text,mt.typname) FROM pg_range g LEFT JOIN pg_type mt ON mt.oid=g.rngmultitypid WHERE g.rngtypid=t.oid OR g.rngmultitypid=t.oid LIMIT 1)")
    )} payload FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','supabase_migrations') AND t.typtype IN ('c','d','e','r','m')`,
    extension: `SELECT ${r(c("name", "e.extname"),c("schema", "n.nspname"),c("version", "e.extversion"),c("relocatable", "e.extrelocatable"))} payload FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace`,
    acl: `SELECT ${r(
      c("kind", "o.kind"),c("schema", "o.schema_name"),c("object", "o.object_name"),
      c("subobject", "o.sub_name"),c("owner", "pg_get_userbyid(o.owner_oid)"),
      c("grantor", "CASE WHEN a.grantor IS NULL THEN NULL ELSE a.grantor::regrole::text END"),
      c("grantee", "CASE WHEN a.grantee IS NULL THEN NULL WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END"),
      c("privilege", "a.privilege_type"),c("grantable", "a.is_grantable")
    )} payload FROM (
      SELECT 'schema'::text kind,n.nspname schema_name,n.nspname object_name,NULL::text sub_name,n.nspowner owner_oid,n.nspacl acl,'n'::"char" default_code FROM pg_namespace n WHERE n.nspname IN ('public','supabase_migrations')
      UNION ALL SELECT 'relation',n.nspname,x.relname,NULL,x.relowner,x.relacl,CASE WHEN x.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind IN ('r','p','v','m','S')
      UNION ALL SELECT 'routine',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.proowner,p.proacl,'f'::"char" FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','supabase_migrations') AND l.lanname<>'internal'
      UNION ALL SELECT 'type',n.nspname,t.typname,NULL,t.typowner,t.typacl,'T'::"char" FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','supabase_migrations') AND t.typtype IN ('c','d','e','r','m')
      UNION ALL SELECT 'column',n.nspname,x.relname,a.attname,x.relowner,a.attacl,'c'::"char" FROM pg_attribute a JOIN pg_class x ON x.oid=a.attrelid JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND a.attnum>0 AND NOT a.attisdropped
    ) o CROSS JOIN LATERAL aclexplode(CASE WHEN o.acl IS NULL OR cardinality(o.acl)=0 THEN acldefault(o.default_code,o.owner_oid) ELSE o.acl END) a`,
    default_acl: `SELECT ${r(
      c("owner", "d.defaclrole::regrole::text"),c("schema", "n.nspname"),c("object_type", "d.defaclobjtype"),
      c("grantor", "a.grantor::regrole::text"),
      c("grantee", "CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END"),
      c("privilege", "a.privilege_type"),c("grantable", "a.is_grantable")
    )} payload FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE n.nspname IN ('public','supabase_migrations') OR d.defaclnamespace=0`,
    role: `${relevantRoles} SELECT ${r(
      c("name", "x.rolname"),c("super", "x.rolsuper"),c("inherit", "x.rolinherit"),
      c("create_role", "x.rolcreaterole"),c("create_db", "x.rolcreatedb"),c("login", "x.rolcanlogin"),
      c("replication", "x.rolreplication"),c("bypass_rls", "x.rolbypassrls"),
      c("connection_limit", "x.rolconnlimit"),
      c("config", "(SELECT jsonb_agg(v ORDER BY v COLLATE \"C\") FROM unnest(x.rolconfig) v)")
    )} payload FROM pg_roles x JOIN relevant z ON z.oid=x.oid`,
    membership: `${relevantRoles} SELECT ${r(
      c("role", "r.rolname"),c("member", "mbr.rolname"),c("grantor", "g.rolname"),
      c("admin", "m.admin_option"),c("inherit", "m.inherit_option"),c("set", "m.set_option")
    )} payload FROM pg_auth_members m JOIN relevant role_relevant ON role_relevant.oid=m.roleid JOIN relevant member_relevant ON member_relevant.oid=m.member JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles mbr ON mbr.oid=m.member JOIN pg_roles g ON g.oid=m.grantor`,
    inheritance: `SELECT ${r(
      c("parent_schema", "pn.nspname"),c("parent", "p.relname"),c("child_schema", "cn.nspname"),
      c("child", "x.relname"),c("sequence", "i.inhseqno"),c("detach_pending", "i.inhdetachpending"),
      c("partition_key", "pg_get_partkeydef(p.oid)"),c("partition_bound", "pg_get_expr(x.relpartbound,x.oid,true)")
    )} payload FROM pg_inherits i JOIN pg_class p ON p.oid=i.inhparent JOIN pg_namespace pn ON pn.oid=p.relnamespace JOIN pg_class x ON x.oid=i.inhrelid JOIN pg_namespace cn ON cn.oid=x.relnamespace WHERE pn.nspname IN ('public','supabase_migrations') OR cn.nspname IN ('public','supabase_migrations')`,
    table_set: `SELECT ${r(c("schema", "n.nspname"),c("relation", "x.relname"),c("kind", "x.relkind"),c("partition", "x.relispartition"))} payload FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind IN ('r','p')`,
    auth_id: `SELECT ${r(c("uuid", "u.id::text"))} payload FROM auth.users u`,
    ledger: `SELECT ${r(
      c("version", "m.version"),c("name", "m.name"),
      c("statements", "m.statements"),c("dimensions", "array_dims(m.statements)")
    )} payload FROM supabase_migrations.schema_migrations m WHERE m.version<>'${MIGRATION_VERSION}'`,
  });
}

function canonicalV2CategorySql(category, selectSql) {
  return [
    `COPY (SELECT '${CANONICAL_V2_PROTOCOL}|COUNT|${category}|'||count(*)::text FROM (${selectSql}) canonical_v2_records) TO STDOUT;`,
    `COPY (SELECT '${CANONICAL_V2_PROTOCOL}|RECORD|${category}|'||row_number() OVER (ORDER BY payload::text COLLATE "C")::text||'|'||octet_length(convert_to(payload::text,'UTF8'))::text||'|'||encode(convert_to(payload::text,'UTF8'),'hex') FROM (${selectSql}) canonical_v2_records ORDER BY payload::text COLLATE "C") TO STDOUT;`,
  ].join("\n");
}

function canonicalV2TableRowcountSql() {
  return [
    `COPY (SELECT '${CANONICAL_V2_PROTOCOL}|COUNT|table_rowcount|'||count(*)::text FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind IN ('r','p')) TO STDOUT;`,
    `SELECT format($canonical_v2$COPY (SELECT '${CANONICAL_V2_PROTOCOL}|RECORD|table_rowcount|%1$s|'||octet_length(convert_to(payload::text,'UTF8'))::text||'|'||encode(convert_to(payload::text,'UTF8'),'hex') FROM (SELECT jsonb_build_array(jsonb_build_array('schema','value',octet_length(convert_to(%2$L,'UTF8')),encode(convert_to(%2$L,'UTF8'),'hex')),jsonb_build_array('relation','value',octet_length(convert_to(%3$L,'UTF8')),encode(convert_to(%3$L,'UTF8'),'hex')),jsonb_build_array('count','value',octet_length(convert_to(count(*)::text,'UTF8')),encode(convert_to(count(*)::text,'UTF8'),'hex'))) payload FROM ONLY %4$I.%5$I t %6$s) framed) TO STDOUT;$canonical_v2$,ordinal,nspname,relname,nspname,relname,CASE WHEN nspname='supabase_migrations' AND relname='schema_migrations' THEN 'WHERE t.version<>''${MIGRATION_VERSION}''' ELSE '' END) FROM (SELECT n.nspname,x.relname,row_number() OVER (ORDER BY n.nspname COLLATE "C",x.relname COLLATE "C") ordinal FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind IN ('r','p')) tables ORDER BY ordinal`,
    "\\gexec",
  ].join("\n");
}

function canonicalV2TableDataSql() {
  return [
    `COPY (SELECT '${CANONICAL_V2_PROTOCOL}|COUNT|table_data|'||count(*)::text FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind IN ('r','p')) TO STDOUT;`,
    `WITH tables AS (
      SELECT x.oid,n.nspname,x.relname,row_number() OVER (ORDER BY n.nspname COLLATE "C",x.relname COLLATE "C") ordinal
      FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace
      WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind IN ('r','p')
    ), cells AS (
      SELECT q.oid,q.nspname,q.relname,q.ordinal,
        string_agg(format('jsonb_build_array(%s,%L,%L,%s,%L,CASE WHEN (%s) IS NULL THEN ''null'' ELSE ''value'' END,CASE WHEN (%s) IS NULL THEN NULL ELSE octet_length(convert_to((%s)::text,''UTF8'')) END,CASE WHEN (%s) IS NULL THEN NULL ELSE encode(convert_to((%s)::text,''UTF8''),''hex'') END,%s)',
          a.attnum,a.attname,tn.nspname||'.'||t.typname,a.atttypmod,coalesce(cn.nspname||'.'||co.collname,''),
          CASE WHEN q.nspname='public' AND q.relname='kd_ai_limits' AND a.attname='wert' THEN '(CASE WHEN t.schluessel IN (''task_modell'',''task_max_tokens'',''task_max_reservierung_usd_cent'') THEN t.wert-''blog-profile-extract'' ELSE t.wert END)' ELSE format('t.%I',a.attname) END,
          CASE WHEN q.nspname='public' AND q.relname='kd_ai_limits' AND a.attname='wert' THEN '(CASE WHEN t.schluessel IN (''task_modell'',''task_max_tokens'',''task_max_reservierung_usd_cent'') THEN t.wert-''blog-profile-extract'' ELSE t.wert END)' ELSE format('t.%I',a.attname) END,
          CASE WHEN q.nspname='public' AND q.relname='kd_ai_limits' AND a.attname='wert' THEN '(CASE WHEN t.schluessel IN (''task_modell'',''task_max_tokens'',''task_max_reservierung_usd_cent'') THEN t.wert-''blog-profile-extract'' ELSE t.wert END)' ELSE format('t.%I',a.attname) END,
          CASE WHEN q.nspname='public' AND q.relname='kd_ai_limits' AND a.attname='wert' THEN '(CASE WHEN t.schluessel IN (''task_modell'',''task_max_tokens'',''task_max_reservierung_usd_cent'') THEN t.wert-''blog-profile-extract'' ELSE t.wert END)' ELSE format('t.%I',a.attname) END,
          CASE WHEN q.nspname='public' AND q.relname='kd_ai_limits' AND a.attname='wert' THEN '(CASE WHEN t.schluessel IN (''task_modell'',''task_max_tokens'',''task_max_reservierung_usd_cent'') THEN t.wert-''blog-profile-extract'' ELSE t.wert END)' ELSE format('t.%I',a.attname) END,
          CASE WHEN t.typelem<>0 THEN format('coalesce(array_dims(t.%I),'''')',a.attname) ELSE '''''' END
        ),',' ORDER BY a.attnum) cell_sql
      FROM tables q JOIN pg_attribute a ON a.attrelid=q.oid AND a.attnum>0 AND NOT a.attisdropped
      JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace
      LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace
      GROUP BY q.oid,q.nspname,q.relname,q.ordinal
    )
    SELECT format($canonical_v2$COPY (WITH rows AS (SELECT jsonb_build_array(%2$L,%3$L,jsonb_build_array(%4$s)) payload FROM ONLY %5$I.%6$I t %7$s), doc AS (SELECT jsonb_build_array(%2$L,%3$L,count(*),coalesce(jsonb_agg(payload ORDER BY payload::text COLLATE "C"),'[]'::jsonb))::text body FROM rows) SELECT '${CANONICAL_V2_PROTOCOL}|RECORD|table_data|%1$s|'||octet_length(convert_to(body,'UTF8'))::text||'|'||encode(convert_to(body,'UTF8'),'hex') FROM doc) TO STDOUT;$canonical_v2$,ordinal,nspname,relname,cell_sql,nspname,relname,CASE WHEN nspname='supabase_migrations' AND relname='schema_migrations' THEN 'WHERE t.version<>''${MIGRATION_VERSION}''' ELSE '' END)
    FROM cells ORDER BY ordinal`,
    "\\gexec",
  ].join("\n");
}

function canonicalV2SequenceSql() {
  return [
    `COPY (SELECT '${CANONICAL_V2_PROTOCOL}|COUNT|sequence|'||count(*)::text FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname IN ('public','supabase_migrations') AND x.relkind='S') TO STDOUT;`,
    `SELECT format($canonical_v2$COPY (SELECT '${CANONICAL_V2_PROTOCOL}|RECORD|sequence|%1$s|'||octet_length(convert_to(payload::text,'UTF8'))::text||'|'||encode(convert_to(payload::text,'UTF8'),'hex') FROM (SELECT jsonb_build_array(jsonb_build_array('schema','value',octet_length(convert_to(%2$L,'UTF8')),encode(convert_to(%2$L,'UTF8'),'hex')),jsonb_build_array('name','value',octet_length(convert_to(%3$L,'UTF8')),encode(convert_to(%3$L,'UTF8'),'hex')),jsonb_build_array('owner','value',octet_length(convert_to(%4$L,'UTF8')),encode(convert_to(%4$L,'UTF8'),'hex')),jsonb_build_array('type','value',octet_length(convert_to(%5$L,'UTF8')),encode(convert_to(%5$L,'UTF8'),'hex')),jsonb_build_array('start','value',octet_length(convert_to(%6$L,'UTF8')),encode(convert_to(%6$L,'UTF8'),'hex')),jsonb_build_array('min','value',octet_length(convert_to(%7$L,'UTF8')),encode(convert_to(%7$L,'UTF8'),'hex')),jsonb_build_array('max','value',octet_length(convert_to(%8$L,'UTF8')),encode(convert_to(%8$L,'UTF8'),'hex')),jsonb_build_array('increment','value',octet_length(convert_to(%9$L,'UTF8')),encode(convert_to(%9$L,'UTF8'),'hex')),jsonb_build_array('cache','value',octet_length(convert_to(%10$L,'UTF8')),encode(convert_to(%10$L,'UTF8'),'hex')),jsonb_build_array('cycle','value',octet_length(convert_to(%11$L,'UTF8')),encode(convert_to(%11$L,'UTF8'),'hex')),jsonb_build_array('owned_schema',CASE WHEN %12$L IS NULL THEN 'null' ELSE 'value' END,CASE WHEN %12$L IS NULL THEN NULL ELSE octet_length(convert_to(%12$L,'UTF8')) END,CASE WHEN %12$L IS NULL THEN NULL ELSE encode(convert_to(%12$L,'UTF8'),'hex') END),jsonb_build_array('owned_relation',CASE WHEN %13$L IS NULL THEN 'null' ELSE 'value' END,CASE WHEN %13$L IS NULL THEN NULL ELSE octet_length(convert_to(%13$L,'UTF8')) END,CASE WHEN %13$L IS NULL THEN NULL ELSE encode(convert_to(%13$L,'UTF8'),'hex') END),jsonb_build_array('owned_column',CASE WHEN %14$L IS NULL THEN 'null' ELSE 'value' END,CASE WHEN %14$L IS NULL THEN NULL ELSE octet_length(convert_to(%14$L,'UTF8')) END,CASE WHEN %14$L IS NULL THEN NULL ELSE encode(convert_to(%14$L,'UTF8'),'hex') END),jsonb_build_array('last_value','value',octet_length(convert_to(last_value::text,'UTF8')),encode(convert_to(last_value::text,'UTF8'),'hex')),jsonb_build_array('is_called','value',octet_length(convert_to(is_called::text,'UTF8')),encode(convert_to(is_called::text,'UTF8'),'hex'))) payload FROM ONLY %15$I.%16$I) framed) TO STDOUT;$canonical_v2$,ordinal,nspname,relname,owner_name,type_name,start_value,min_value,max_value,increment_by,cache_size,cycle,owned_schema,owned_relation,owned_column,nspname,relname) FROM (SELECT n.nspname,x.relname,pg_get_userbyid(x.relowner) owner_name,format_type(s.seqtypid,NULL) type_name,s.seqstart::text start_value,s.seqmin::text min_value,s.seqmax::text max_value,s.seqincrement::text increment_by,s.seqcache::text cache_size,s.seqcycle::text cycle,onsp.nspname owned_schema,orel.relname owned_relation,oatt.attname owned_column,row_number() OVER (ORDER BY n.nspname COLLATE "C",x.relname COLLATE "C") ordinal FROM pg_sequence s JOIN pg_class x ON x.oid=s.seqrelid JOIN pg_namespace n ON n.oid=x.relnamespace LEFT JOIN pg_depend dep ON dep.classid='pg_class'::regclass AND dep.objid=x.oid AND dep.objsubid=0 AND dep.refclassid='pg_class'::regclass AND dep.deptype IN ('a','i') LEFT JOIN pg_class orel ON orel.oid=dep.refobjid LEFT JOIN pg_namespace onsp ON onsp.oid=orel.relnamespace LEFT JOIN pg_attribute oatt ON oatt.attrelid=dep.refobjid AND oatt.attnum=dep.refobjsubid WHERE n.nspname IN ('public','supabase_migrations')) sequences ORDER BY ordinal`,
    "\\gexec",
  ].join("\n");
}

function canonicalV2TargetContractSql(phase) {
  const postwrite = phase === "postwrite";
  const jsonPredicate = postwrite
    ? `jsonb_typeof((SELECT wert->'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_modell'))='string'
       AND (SELECT wert->>'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_modell')='klein'
       AND jsonb_typeof((SELECT wert->'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_max_tokens'))='number'
       AND (SELECT wert->'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_max_tokens')='2048'::jsonb
       AND jsonb_typeof((SELECT wert->'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_max_reservierung_usd_cent'))='number'
       AND (SELECT wert->'blog-profile-extract' FROM public.kd_ai_limits WHERE schluessel='task_max_reservierung_usd_cent')='5'::jsonb`
    : `NOT EXISTS (SELECT 1 FROM public.kd_ai_limits WHERE schluessel IN ('task_modell','task_max_tokens','task_max_reservierung_usd_cent') AND wert ? 'blog-profile-extract')`;
  const ledgerPredicate = postwrite
    ? `count(*) FILTER (WHERE version='${MIGRATION_VERSION}')=1
       AND count(*) FILTER (WHERE version='${MIGRATION_VERSION}' AND name='${LEDGER_NAME}' AND statements=ARRAY[]::text[])=1`
    : `count(*) FILTER (WHERE version='${MIGRATION_VERSION}')=0`;
  const query = `SELECT ${canonicalV2Record(canonicalV2Cell("phase", `'${phase}'`))} payload
    FROM supabase_migrations.schema_migrations
    WHERE (SELECT count(*) FROM public.kd_ai_limits WHERE schluessel IN ('task_modell','task_max_tokens','task_max_reservierung_usd_cent'))=3
      AND NOT EXISTS (SELECT 1 FROM public.kd_ai_limits WHERE schluessel IN ('task_modell','task_max_tokens','task_max_reservierung_usd_cent') AND jsonb_typeof(wert)<>'object')
      AND NOT EXISTS (SELECT 1 FROM public.kd_ai_limits WHERE schluessel NOT IN ('task_modell','task_max_tokens','task_max_reservierung_usd_cent') AND wert ? 'blog-profile-extract')
      AND ${jsonPredicate}
    HAVING count(*) FILTER (WHERE version<>'${MIGRATION_VERSION}')=35
      AND count(DISTINCT version) FILTER (WHERE version<>'${MIGRATION_VERSION}')=35
      AND max(version) FILTER (WHERE version<>'${MIGRATION_VERSION}')='${PREVIOUS_LEDGER_VERSION}'
      AND ${ledgerPredicate}`;
  return canonicalV2CategorySql("target_contract", query);
}

function canonicalV2ProjectionSql(role, snapshotId) {
  const phase = CANONICAL_V2_ROLE_PHASE[role];
  const queries = canonicalV2StaticQueries();
  const sql = [
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;",
    `SET TRANSACTION SNAPSHOT '${snapshotId}';`,
    "SET LOCAL statement_timeout='120s';",
    "SET LOCAL lock_timeout='10s';",
    "SET LOCAL TIME ZONE 'UTC';",
    "SET LOCAL DateStyle='ISO, YMD';",
    "SET LOCAL IntervalStyle='postgres';",
    "SET LOCAL extra_float_digits=3;",
    "SET LOCAL bytea_output='hex';",
    `COPY (SELECT '${CANONICAL_V2_PROTOCOL}|BEGIN|${CANONICAL_V2_PROTOCOL_VERSION}|${role}|${snapshotId}|${CANONICAL_V2_CATEGORIES.length}') TO STDOUT;`,
  ];
  for (const category of CANONICAL_V2_CATEGORIES) {
    if (category === "table_rowcount") sql.push(canonicalV2TableRowcountSql());
    else if (category === "table_data") sql.push(canonicalV2TableDataSql());
    else if (category === "sequence") sql.push(canonicalV2SequenceSql());
    else if (category === "target_contract") sql.push(canonicalV2TargetContractSql(phase));
    else sql.push(canonicalV2CategorySql(category, queries[category]));
  }
  sql.push(
    `COPY (SELECT '${CANONICAL_V2_PROTOCOL}|END|${CANONICAL_V2_PROTOCOL_VERSION}|${role}|${snapshotId}') TO STDOUT;`,
    "COMMIT;",
    "",
  );
  const result = sql.join("\n");
  if (result.includes("${MIGRATION_VERSION}") || /;\s*\\gexec/.test(result)) {
    stop("INVALID_CANONICAL_V2_SQL", "Canonical-v2-SQL enthält einen unresolved/gexec Grenzfehler.");
  }
  return result;
}

function canonicalV2ParseInteger(value, reasonCode) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) stop(reasonCode, "Integerframe ist nicht kanonisch.");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) stop(reasonCode, "Integerframe ist nicht sicher darstellbar.");
  return number;
}

function canonicalV2ValidateEncodedValue(marker, length, hex, label) {
  if (marker === "null") {
    if (length !== null || hex !== null) {
      stop("INVALID_CANONICAL_V2_PAYLOAD", `${label} besitzt inkonsistente NULL-Metadaten.`);
    }
    return null;
  }
  if (marker !== "value" || !Number.isSafeInteger(length) || length < 0
      || typeof hex !== "string" || !CANONICAL_V2_HEX.test(hex)) {
    stop("INVALID_CANONICAL_V2_PAYLOAD", `${label} besitzt ungültigen Typ/Nullmarker.`);
  }
  const bytes = intrinsicReflectApply(intrinsicBufferFrom, Buffer, [hex, "hex"]);
  if (bytes.length !== length || hex.length !== length * 2) {
    stop("INVALID_CANONICAL_V2_PAYLOAD", `${label} besitzt inkonsistente Länge/Hexbytes.`);
  }
  return decodeUtf8Fatal(bytes, label);
}

function canonicalV2ValidateCellPayload(decoded, labels, category) {
  if (!intrinsicArrayIsArray(decoded) || decoded.length !== labels.length) {
    stop("INVALID_CANONICAL_V2_PAYLOAD", `Payload ${category} besitzt falsche Zellarity.`);
  }
  const values = [];
  for (let index = 0; index < labels.length; index += 1) {
    const cell = decoded[index];
    if (!intrinsicArrayIsArray(cell) || cell.length !== 4
        || typeof cell[0] !== "string" || cell[0] !== labels[index]) {
      stop("INVALID_CANONICAL_V2_PAYLOAD", `Payload ${category} besitzt falsches Label/Reihenfolge.`);
    }
    intrinsicReflectApply(intrinsicArrayPush, values, [
      canonicalV2ValidateEncodedValue(cell[1], cell[2], cell[3], `${category}.${labels[index]}`),
    ]);
  }
  return values;
}

function canonicalV2ValidateTableDataPayload(decoded) {
  if (!intrinsicArrayIsArray(decoded) || decoded.length !== 4
      || typeof decoded[0] !== "string" || decoded[0].length === 0
      || typeof decoded[1] !== "string" || decoded[1].length === 0
      || !Number.isSafeInteger(decoded[2]) || decoded[2] < 0
      || !intrinsicArrayIsArray(decoded[3]) || decoded[3].length !== decoded[2]) {
    stop("INVALID_CANONICAL_V2_PAYLOAD", "Payload table_data besitzt falsche Struktur/Typen.");
  }
  for (let rowIndex = 0; rowIndex < decoded[3].length; rowIndex += 1) {
    const row = decoded[3][rowIndex];
    if (!intrinsicArrayIsArray(row) || row.length !== 3
        || row[0] !== decoded[0] || row[1] !== decoded[1]
        || !intrinsicArrayIsArray(row[2])) {
      stop("INVALID_CANONICAL_V2_PAYLOAD", "Payload table_data besitzt fremde/fehlgeformte Zeilen.");
    }
    let previousPosition = 0;
    for (let cellIndex = 0; cellIndex < row[2].length; cellIndex += 1) {
      const cell = row[2][cellIndex];
      if (!intrinsicArrayIsArray(cell) || cell.length !== 9
          || !Number.isSafeInteger(cell[0]) || cell[0] <= previousPosition
          || typeof cell[1] !== "string" || cell[1].length === 0
          || typeof cell[2] !== "string" || cell[2].length === 0
          || !Number.isSafeInteger(cell[3])
          || typeof cell[4] !== "string" || typeof cell[8] !== "string") {
        stop("INVALID_CANONICAL_V2_PAYLOAD", "Payload table_data besitzt falsche Zellarity/Typen.");
      }
      previousPosition = cell[0];
      canonicalV2ValidateEncodedValue(cell[5], cell[6], cell[7], `table_data.${cell[1]}`);
    }
  }
}

function canonicalV2ValidatePayload(category, decoded, phase) {
  if (category === "table_data") {
    canonicalV2ValidateTableDataPayload(decoded);
    return;
  }
  const labels = CANONICAL_V2_CELL_SCHEMAS[category];
  if (!labels) {
    stop("INVALID_CANONICAL_V2_PAYLOAD", `Payloadkategorie ${category} besitzt kein Schema.`);
  }
  const values = canonicalV2ValidateCellPayload(decoded, labels, category);
  if (category === "target_contract" && values[0] !== phase) {
    stop("CANONICAL_V2_TARGET_CONTRACT_DRIFT", "Zielvertrag behauptet falsche Phase.");
  }
}

function canonicalV2ParseStdout(bytes, { role, snapshotId, phase, secrets }) {
  const copy = copyInspectableBytes(bytes, "Canonical-v2-Stdout");
  if (copy.length === 0 || copy.length > CANONICAL_V2_MAX_OUTPUT_BYTES) {
    stop("INVALID_CANONICAL_V2_OUTPUT_SIZE", "Canonical-v2-Stdout ist leer oder zu groß.");
  }
  assertNoSecretExposure(copy, secrets);
  const text = decodeUtf8Fatal(copy, "Canonical-v2-Stdout");
  if (!text.endsWith("\n") || text.endsWith("\n\n") || text.includes("\r") || text.includes("\0")) {
    stop("INVALID_CANONICAL_V2_FRAMING", "Canonical-v2-Stdout ist nicht exakt LF-gerahmt.");
  }
  const lines = intrinsicReflectApply(intrinsicStringSplit, text.slice(0, -1), ["\n"]);
  let cursor = 0;
  const begin = `${CANONICAL_V2_PROTOCOL}|BEGIN|${CANONICAL_V2_PROTOCOL_VERSION}|${role}|${snapshotId}|${CANONICAL_V2_CATEGORIES.length}`;
  if (lines[cursor++] !== begin) stop("INVALID_CANONICAL_V2_BEGIN", "Canonical-v2-Begin bindet Rolle/Snapshot nicht.");
  const digests = Object.create(null);
  for (const category of CANONICAL_V2_CATEGORIES) {
    const countParts = intrinsicReflectApply(intrinsicStringSplit, lines[cursor++] || "", ["|"]);
    if (countParts.length !== 4 || countParts[0] !== CANONICAL_V2_PROTOCOL
        || countParts[1] !== "COUNT" || countParts[2] !== category) {
      stop("INVALID_CANONICAL_V2_COUNT", `Countframe ${category} fehlt oder ist umgeordnet.`);
    }
    const count = canonicalV2ParseInteger(countParts[3], "INVALID_CANONICAL_V2_COUNT");
    if (category === "target_contract" && count !== 1) {
      stop("CANONICAL_V2_TARGET_CONTRACT_DRIFT", "Zielvertrag ist nicht exakt erfüllt.");
    }
    const records = [];
    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      const parts = intrinsicReflectApply(intrinsicStringSplit, lines[cursor++] || "", ["|"]);
      if (parts.length !== 6 || parts[0] !== CANONICAL_V2_PROTOCOL || parts[1] !== "RECORD"
          || parts[2] !== category || canonicalV2ParseInteger(parts[3], "INVALID_CANONICAL_V2_RECORD") !== ordinal
          || !CANONICAL_V2_HEX.test(parts[5])) {
        stop("INVALID_CANONICAL_V2_RECORD", `Recordframe ${category}/${ordinal} ist formfremd.`);
      }
      const length = canonicalV2ParseInteger(parts[4], "INVALID_CANONICAL_V2_RECORD");
      const payload = intrinsicReflectApply(intrinsicBufferFrom, Buffer, [parts[5], "hex"]);
      if (payload.length !== length || parts[5].length !== length * 2) {
        stop("INVALID_CANONICAL_V2_LENGTH", `Recordframe ${category}/${ordinal} hat falsche Länge.`);
      }
      let decoded;
      try {
        decoded = intrinsicJsonParse(decodeUtf8Fatal(payload, `Canonical-v2-${category}`));
      } catch (error) {
        if (error instanceof E17BStop) throw error;
        stop("INVALID_CANONICAL_V2_PAYLOAD", `Recordframe ${category}/${ordinal} ist kein JSON.`);
      }
      canonicalV2ValidatePayload(category, decoded, phase);
      intrinsicReflectApply(intrinsicArrayPush, records, [hashBytes(payload)]);
    }
    digests[category] = hashBytes(intrinsicReflectApply(intrinsicBufferFrom, Buffer, [
      intrinsicJsonStringify(records), "utf8",
    ]));
  }
  const end = `${CANONICAL_V2_PROTOCOL}|END|${CANONICAL_V2_PROTOCOL_VERSION}|${role}|${snapshotId}`;
  if (lines[cursor++] !== end || cursor !== lines.length) {
    stop("INVALID_CANONICAL_V2_END", "Canonical-v2-Ende fehlt oder besitzt Trailing-Daten.");
  }
  return Object.freeze({
    role,
    snapshotId,
    phase,
    outputDigest: hashBytes(copy),
    categoryDigests: Object.freeze(digests),
  });
}

function canonicalV2TranscriptForSession(transcript, session, role) {
  if (!transcript || !weakSetHas(canonicalV2TranscriptBrand, transcript)
      || weakSetHas(canonicalV2ConsumedTranscripts, transcript)) {
    stop("CANONICAL_V2_TRANSCRIPT_REQUIRED", "Canonical-v2 akzeptiert nur frische eigene Transcripts.");
  }
  const meta = weakMapGet(canonicalV2TranscriptMeta, transcript);
  if (!meta || meta.session !== session || meta.role !== role) {
    stop("CANONICAL_V2_TRANSCRIPT_CONTEXT_MISMATCH", "Transcript gehört zu anderer Session/Rolle.");
  }
  return meta;
}

function canonicalV2ConsumeTranscript(transcript) {
  weakSetAdd(canonicalV2ConsumedTranscripts, transcript);
}

function canonicalV2Summary(session, kind, categoryDigests) {
  const summary = Object.freeze({
    kind,
    trusted: false,
    semanticSha256: hashBytes(intrinsicReflectApply(intrinsicBufferFrom, Buffer, [
      intrinsicJsonStringify(categoryDigests), "utf8",
    ])),
  });
  weakSetAdd(canonicalV2SummaryBrand, summary);
  weakMapSet(canonicalV2SummaryMeta, summary, Object.freeze({
    session,
    kind,
    semanticSha256: summary.semanticSha256,
  }));
  return summary;
}

function canonicalV2CompareCategory(left, right, category, reasonCode) {
  if (left.categoryDigests[category] !== right.categoryDigests[category]) {
    stop(reasonCode, `Canonical-v2-Kategorie ${category} driftet.`);
  }
}

export function createCanonicalV2UntrustedSession() {
  assertSecurityRuntimeIntegrity();
  const session = Object.create(null);
  const state = {
    nextRoleIndex: 0,
    baselineComplete: false,
    postwriteComplete: false,
    baseline: null,
  };

  const prepareCapture = (options = {}) => {
    assertSecurityRuntimeIntegrity();
    if (!weakSetHas(canonicalV2SessionBrand, session)) {
      stop("CANONICAL_V2_SESSION_REQUIRED", "Sessionprovenienz fehlt.");
    }
    const descriptors = canonicalV2InspectOptions(options, ["role", "snapshotId"], "Canonical-v2-Planoptionen");
    const role = descriptorDataValue(descriptors, "role");
    const snapshotId = canonicalV2AssertSnapshotId(descriptorDataValue(descriptors, "snapshotId"));
    if (role !== CANONICAL_V2_ROLES[state.nextRoleIndex]) {
      stop("CANONICAL_V2_ROLE_ORDER", "Canonical-v2-Rolle fehlt, ist dupliziert oder außer Reihenfolge.");
    }
    if (state.nextRoleIndex >= 2 && !state.baselineComplete) {
      stop("CANONICAL_V2_BASELINE_REQUIRED", "Postwrite braucht eine erfolgreiche Baseline.");
    }
    state.nextRoleIndex += 1;
    const phase = CANONICAL_V2_ROLE_PHASE[role];
    const plan = Object.create(null);
    const parseUntrustedStdout = (stdout, parserOptions = {}) => {
      assertSecurityRuntimeIntegrity();
      if (!weakSetHas(canonicalV2PlanBrand, plan) || weakSetHas(canonicalV2ConsumedPlans, plan)) {
        stop("CANONICAL_V2_PLAN_CONSUMED", "Canonical-v2-Plan ist fremd oder bereits verbraucht.");
      }
      const parserDescriptors = canonicalV2InspectOptions(parserOptions, ["secrets"], "Canonical-v2-Parseroptionen");
      const secrets = descriptorDataValue(parserDescriptors, "secrets");
      weakSetAdd(canonicalV2ConsumedPlans, plan);
      const parsed = canonicalV2ParseStdout(stdout, { role, snapshotId, phase, secrets });
      const transcript = Object.freeze(Object.create(null));
      weakSetAdd(canonicalV2TranscriptBrand, transcript);
      weakMapSet(canonicalV2TranscriptMeta, transcript, Object.freeze({
        ...parsed,
        session,
      }));
      return transcript;
    };
    Object.defineProperties(plan, {
      stdinSql: { value: canonicalV2ProjectionSql(role, snapshotId), enumerable: true },
      parseUntrustedStdout: { value: parseUntrustedStdout, enumerable: true },
    });
    Object.freeze(plan);
    weakSetAdd(canonicalV2PlanBrand, plan);
    weakMapSet(canonicalV2PlanMeta, plan, Object.freeze({ session, role, snapshotId }));
    return plan;
  };

  const compareBaseline = (sourceTranscript, restoreTranscript) => {
    assertSecurityRuntimeIntegrity();
    if (state.baselineComplete || state.postwriteComplete || state.nextRoleIndex !== 2) {
      stop("CANONICAL_V2_BASELINE_REPLAY", "Baselinevergleich ist nicht in der erlaubten Phase.");
    }
    const source = canonicalV2TranscriptForSession(sourceTranscript, session, "22-canonical-detail");
    const restore = canonicalV2TranscriptForSession(restoreTranscript, session, "23-canonical-detail");
    canonicalV2ConsumeTranscript(sourceTranscript);
    canonicalV2ConsumeTranscript(restoreTranscript);
    for (const category of CANONICAL_V2_CATEGORIES) {
      canonicalV2CompareCategory(source, restore, category, "CANONICAL_V2_BASELINE_DRIFT");
    }
    state.baseline = source;
    state.baselineComplete = true;
    return canonicalV2Summary(
      session, "canonical-v2-untrusted-baseline-summary", source.categoryDigests,
    );
  };

  const comparePostwrite = (postflight42Transcript, remoteDelta90Transcript) => {
    assertSecurityRuntimeIntegrity();
    if (!state.baselineComplete || state.postwriteComplete || state.nextRoleIndex !== 4) {
      stop("CANONICAL_V2_POSTWRITE_ORDER", "Postwritevergleich ist nicht in der erlaubten Phase.");
    }
    const post42 = canonicalV2TranscriptForSession(postflight42Transcript, session, "42-db-postflight");
    const post90 = canonicalV2TranscriptForSession(remoteDelta90Transcript, session, "90-remote-delta");
    canonicalV2ConsumeTranscript(postflight42Transcript);
    canonicalV2ConsumeTranscript(remoteDelta90Transcript);
    for (const category of CANONICAL_V2_CATEGORIES) {
      canonicalV2CompareCategory(post42, post90, category, "CANONICAL_V2_POSTWRITE_PAIR_DRIFT");
    }
    for (const category of CANONICAL_V2_INVARIANT_CATEGORIES) {
      canonicalV2CompareCategory(state.baseline, post42, category, "CANONICAL_V2_PREWRITE_BASELINE_DRIFT");
      canonicalV2CompareCategory(state.baseline, post90, category, "CANONICAL_V2_PREWRITE_BASELINE_DRIFT");
    }
    state.postwriteComplete = true;
    return canonicalV2Summary(
      session, "canonical-v2-untrusted-postwrite-summary", post42.categoryDigests,
    );
  };

  Object.defineProperties(session, {
    prepareCapture: { value: prepareCapture, enumerable: true },
    compareBaseline: { value: compareBaseline, enumerable: true },
    comparePostwrite: { value: comparePostwrite, enumerable: true },
  });
  Object.freeze(session);
  weakSetAdd(canonicalV2SessionBrand, session);
  weakMapSet(canonicalV2SessionMeta, session, state);
  return session;
}

export function validateCommittedMigrationSet(paths) {
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string")) {
    stop("INVALID_COMMITTED_MIGRATION_SET", "Committed Migrationssatz ist keine Pfadliste.");
  }
  const versionedPattern = /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/;
  const migrationPaths = paths.filter((path) => versionedPattern.test(path));
  const malformedSql = paths.filter(
    (path) => path.endsWith(".sql") && !versionedPattern.test(path),
  );
  if (malformedSql.length !== 0
      || JSON.stringify(migrationPaths) !== JSON.stringify(EXPECTED_COMMITTED_MIGRATIONS)) {
    stop(
      "INVALID_COMMITTED_MIGRATION_SET",
      "Committed Migrationssatz ist fehlend/extra/umgeordnet und nie Remote-Autorität.",
    );
  }
  return [...migrationPaths];
}

function maskSqlDataRegions(sql) {
  let result = "";
  let index = 0;
  let blockDepth = 0;
  let state = "code";
  let dollarTag = null;
  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];
    if (state === "line-comment") {
      if (current === "\n" || current === "\r") {
        state = "code";
        result += current;
      } else result += " ";
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (current === "/" && next === "*") {
        blockDepth += 1;
        result += "  ";
        index += 2;
      } else if (current === "*" && next === "/") {
        blockDepth -= 1;
        result += "  ";
        index += 2;
        if (blockDepth === 0) state = "code";
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (state === "single" || state === "escape-single" || state === "double") {
      const quote = state === "double" ? '"' : "'";
      if (state === "escape-single" && current === "\\") {
        if (next === undefined) {
          stop("INVALID_SQL", "Migration endet in einem E-String-Escape.");
        }
        result += next === "\n" ? " \n" : "  ";
        index += 2;
        continue;
      }
      if (state === "single" && current === "\\") {
        stop("INVALID_SQL", "Migration enthält einen Backslash im regulären Standardstring.");
      }
      if (current === quote && next === quote) {
        result += "  ";
        index += 2;
      } else if (current === quote) {
        result += " ";
        index += 1;
        state = "code";
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (state === "dollar") {
      if (sql.startsWith(dollarTag, index)) {
        result += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        state = "code";
        dollarTag = null;
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if ((current === "U" || current === "u") && next === "&"
        && (sql[index + 2] === "'" || sql[index + 2] === '"')) {
      stop("INVALID_SQL", "Migration enthält eine nicht unterstützte U&-Literalform.");
    } else if (current === "\0") {
      stop("INVALID_SQL", "Migration enthält ein NUL-Byte.");
    } else if (current === "-" && next === "-") {
      state = "line-comment";
      result += "  ";
      index += 2;
    } else if (current === "/" && next === "*") {
      state = "block-comment";
      blockDepth = 1;
      result += "  ";
      index += 2;
    } else if ((current === "E" || current === "e") && next === "'"
        && (index === 0 || !isConservativePgIdentifierContinuation(sql[index - 1]))) {
      state = "escape-single";
      result += "  ";
      index += 2;
    } else if (current === "'") {
      state = "single";
      result += " ";
      index += 1;
    } else if (current === '"') {
      state = "double";
      result += " ";
      index += 1;
    } else if (current === "\\") {
      stop("INVALID_SQL", "Migration enthält eine psql-Metacommand-Grenze.");
    } else if (current === "$"
        && (index === 0 || !isConservativePgIdentifierContinuation(sql[index - 1]))) {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        state = "dollar";
        result += " ".repeat(dollarTag.length);
        index += dollarTag.length;
      } else {
        result += current;
        index += 1;
      }
    } else {
      result += current;
      index += 1;
    }
  }
  if (state === "block-comment" || state === "single" || state === "escape-single"
      || state === "double" || state === "dollar") {
    stop("INVALID_SQL", "Migration enthält eine nicht geschlossene SQL-Region.");
  }
  return result;
}

function isConservativePgIdentifierContinuation(codeUnit) {
  if (typeof codeUnit !== "string" || codeUnit.length !== 1) return false;
  const code = intrinsicReflectApply(intrinsicStringCharCodeAt, codeUnit, [0]);
  return code > 0x7f || /[A-Za-z0-9_$]/.test(codeUnit);
}

export function validateMigrationSqlBoundary(sql) {
  assertSecurityRuntimeIntegrity();
  if (typeof sql !== "string") stop("INVALID_SQL", "Migration ist kein Text.");
  const visible = maskSqlDataRegions(sql);
  const statements = visible.split(";").map((statement) => statement.trim()).filter(Boolean);
  const forbidden = statements.some((statement) =>
    /^(?:abort\b|begin\b|commit\b|end\b|rollback\b|savepoint\b|release\b|start\s+transaction\b|prepare\s+transaction\b|set\s+transaction\b|set\s+session\s+characteristics\s+as\s+transaction\b|set(?:\s+(?:local|session))?\s+standard_conforming_strings\b)/i.test(statement));
  if (forbidden) {
    stop("MIGRATION_TRANSACTION_INJECTION", "Migration enthält globale Transaktionssteuerung.");
  }
  return sql;
}

const committedMigrationBrand = new WeakSet();
const committedMigrationTestBrand = new WeakSet();

export function loadCommittedMigration(options = {}) {
  const optionDescriptors = inspectOrdinaryDataObject(options, "Migration-Loader-Optionen");
  if (descriptorHasKey(optionDescriptors, "migrationSql")) {
    stop("CALLER_SQL_REJECTED", "Caller-SQL ist kein zulässiger Migrationseingang.");
  }
  const validCommit = assertCommit(descriptorDataValue(optionDescriptors, "finalCommit"));
  const git = descriptorDataValue(optionDescriptors, "git");
  if (runGitText(git, ["rev-parse", "HEAD"], "HEAD") !== validCommit) {
    stop("HEAD_COMMIT_MISMATCH", "Migration wird nur vom exakten HEAD geladen.");
  }
  if (runGitText(git, ["status", "--short", "--", MIGRATION_PATH], "Migration-Status") !== "") {
    stop("DIRTY_MIGRATION", "Zielmigration ist nicht committed/clean.");
  }
  const paths = runGitText(
    git,
    ["ls-tree", "-r", "--name-only", validCommit, "supabase/migrations"],
    "Committed Migrationssatz",
  ).split(/\r?\n/).filter(Boolean);
  validateCommittedMigrationSet(paths);
  const bytes = runGitBytes(git, ["show", `${validCommit}:${MIGRATION_PATH}`], "Migration-Raw-Blob");
  const sql = decodeUtf8Fatal(bytes, MIGRATION_PATH);
  const sha256 = hashBytes(bytes);
  if (sha256 !== EXPECTED_MIGRATION_SHA256) {
    stop("MIGRATION_HASH_MISMATCH", "Committed Raw-Migrationsblob besitzt falschen SHA-256.");
  }
  validateMigrationSqlBoundary(sql);
  const result = Object.freeze({
    type: "committed-migration-raw-blob",
    finalCommit: validCommit,
    path: MIGRATION_PATH,
    bytes,
    sql,
    sha256,
  });
  weakSetAdd(committedMigrationTestBrand, result);
  return result;
}

function buildMigrationLedgerTransaction(committedMigration) {
  if (!committedMigration
      || (!weakSetHas(committedMigrationBrand, committedMigration)
        && !weakSetHas(committedMigrationTestBrand, committedMigration))
      || committedMigration.sha256 !== EXPECTED_MIGRATION_SHA256) {
    stop("COMMITTED_MIGRATION_REQUIRED", "Nur der frische Raw-Git-Migrationsblob ist zulässig.");
  }
  const migrationSql = committedMigration.sql.endsWith("\n")
    ? committedMigration.sql
    : `${committedMigration.sql}\n`;
  const sql = [
    "BEGIN;\n",
    migrationSql,
    "INSERT INTO supabase_migrations.schema_migrations (version, name, statements)\n",
    `VALUES ('${MIGRATION_VERSION}', '${LEDGER_NAME}', ARRAY[]::text[]);\n`,
    "COMMIT;\n",
  ].join("");
  const transactionSha256 = hashBytes(Buffer.from(sql, "utf8"));
  if (transactionSha256 !== EXPECTED_MIGRATION_TRANSACTION_SHA256) {
    stop("INVALID_TRANSACTION", "Migration+Ledger verletzen den eingefrorenen Bytevertrag.");
  }
  const visible = maskSqlDataRegions(sql);
  if ((visible.match(/\bBEGIN\s*;/gi) || []).length !== 1
      || (visible.match(/\bCOMMIT\s*;/gi) || []).length !== 1
      || (visible.match(/\bINSERT\s+INTO\s+supabase_migrations\.schema_migrations\b/gi) || []).length !== 1
      || /\bON\s+CONFLICT\b/i.test(visible)) {
    stop("INVALID_TRANSACTION", "Migration+Ledger bilden nicht genau eine äußere Transaktion.");
  }
  return Object.freeze({
    sql,
    sha256: transactionSha256,
    migrationSha256: committedMigration.sha256,
    finalCommit: committedMigration.finalCommit,
  });
}

export function describeMigrationLedgerTransaction(committedMigration) {
  const transaction = buildMigrationLedgerTransaction(committedMigration);
  return Object.freeze({
    finalCommit: transaction.finalCommit,
    migrationSha256: transaction.migrationSha256,
    transactionSha256: transaction.sha256,
    sinkConsumable: false,
    sqlTemplate: "<FRESH_DB_AUTHORIZATION_REQUIRED>",
  });
}

function buildAuthorizedMigrationLedgerTransaction({
  committedMigration,
  finalCommit,
  runId,
  dbSinkCapability,
} = {}) {
  const validCommit = assertCommit(finalCommit);
  const validRunId = assertRunId(runId, validCommit);
  if (!dbSinkCapability || !weakSetHas(dbMutationSinkCapabilityBrand, dbSinkCapability)
      || dbSinkCapability.action !== "db-apply"
      || dbSinkCapability.finalCommit !== validCommit
      || dbSinkCapability.runId !== validRunId
      || dbSinkCapability.targetId !== TARGET_ID
      || dbSinkCapability.migrationSha256 !== EXPECTED_MIGRATION_SHA256) {
    stop("DB_SINK_CAPABILITY_REQUIRED", "DB-Transaction braucht die vollständige Runtime-Sink-Capability.");
  }
  if (!committedMigration || !weakSetHas(committedMigrationBrand, committedMigration)
      || committedMigration.finalCommit !== validCommit) {
    stop("COMMITTED_MIGRATION_REQUIRED", "DB-Transaction braucht den frischen Raw-Git-Migrationsblob.");
  }
  return buildMigrationLedgerTransaction(committedMigration);
}

export function parseCliArgs(argv) {
  assertSecurityRuntimeIntegrity();
  if (!Array.isArray(argv) || argv.length < 5) {
    stop("INVALID_ARGUMENTS", "CLI-Argumente fehlen.");
  }
  const [mode, ...rest] = argv;
  if (!MODES.includes(mode)) stop("UNKNOWN_MODE", "Unbekannter Einzelmodus.");
  let finalCommit;
  let runDir;
  let ownerIntent = null;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--commit" && finalCommit === undefined && rest[index + 1] !== undefined) {
      finalCommit = rest[index + 1];
      index += 1;
    } else if (arg === "--run-dir" && runDir === undefined && rest[index + 1] !== undefined) {
      runDir = rest[index + 1];
      index += 1;
    } else if (arg === OWNER_FLAGS["function-release"] && ownerIntent === null) {
      ownerIntent = "function-release";
    } else if (arg === OWNER_FLAGS["db-apply"] && ownerIntent === null) {
      ownerIntent = "db-apply";
    } else {
      stop("INVALID_ARGUMENTS", "CLI enthält doppelte/fremde Argumente.");
    }
  }
  const validCommit = assertCommit(finalCommit);
  const run = runDirIdentity(runDir);
  if (run.finalCommit !== validCommit) {
    stop("RUN_DIR_COMMIT_MISMATCH", "CLI-RunDir gehört zu anderem Finalcommit.");
  }
  if (ownerIntent !== null && ownerIntent !== mode) {
    stop("OWNER_FLAG_MISMATCH", "Owner-Intent gehört zu anderem Modus.");
  }
  return Object.freeze({
    mode,
    finalCommit: validCommit,
    runDir,
    runId: run.runId,
    ownerIntent,
    transcriptTrusted: false,
  });
}

export const __wave = "A";
