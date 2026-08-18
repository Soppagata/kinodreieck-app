/* E17A-Reparatur: commitgebundener, effektinjizierter One-Shot.
   Dieses Modul fuehrt selbst weder Credentials-, Netzwerk-, Backup-, Restore-
   noch Datenbankoperationen aus. */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual, TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import {
  RadarRemoteStartStop,
  validateRadarLedgerBaseline,
} from "./radar_websearch_remote_start.mjs";

export const RADAR_E17A_REPAIR_BASELINE = "698d4b678fb921128e14b8111b68bdb0a4bdc037";
export const RADAR_E17A_MIGRATION_PATH =
  "supabase/migrations/20260817120000_blog_profile_extract_config.sql";
export const RADAR_E17A_MIGRATION_VERSION = "20260817120000";
export const RADAR_E17A_LEDGER_NAME = "blog_profile_extract_config";
export const RADAR_E17A_MIGRATION_SHA256 =
  "887253d3323c059fd286bf3e66cae3f167cba4396e89e8f867baa7de42465134";
export const RADAR_E17A_TRANSACTION_SHA256 =
  "3fdeb860fe21710583fa3d30bf11800761ef4aca0ef94395c650f81185546421";

const DATEI = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(DATEI), "..");
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MIGRATION_PATH_PATTERN =
  /^supabase\/migrations\/([0-9]{14})_([a-z0-9_]+)\.sql$/;
const EXPECTED_MIGRATION_COUNT = 38;
const EXPECTED_LEDGER_BASELINE_COUNT = 35;
const EXPECTED_PREVIOUS_LEDGER_VERSION = "20260816010000";
const EFFECT_NAMES = Object.freeze([
  "backup",
  "cleanup",
  "localGate",
  "postflight",
  "remoteRead",
  "restore",
  "write",
]);
const LIMIT_PATCHES = Object.freeze({
  task_modell: Object.freeze({ key: "blog-profile-extract", value: "klein" }),
  task_max_tokens: Object.freeze({ key: "blog-profile-extract", value: 2048 }),
  task_max_reservierung_usd_cent: Object.freeze({ key: "blog-profile-extract", value: 5 }),
});

const repairContractBrand = new WeakSet();

export class RadarE17ARepairStop extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RadarE17ARepairStop";
    this.code = code;
  }
}

function stop(code, message) {
  throw new RadarE17ARepairStop(code, message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactPlainObject(value, keys) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function defaultGit(args) {
  return spawnSync("/usr/bin/git", args, {
    cwd: REPO_ROOT,
    env: { LANG: "C", LC_ALL: "C", NO_COLOR: "1", PATH: "/usr/bin:/bin" },
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10_000,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitResult(git, args, label) {
  if (typeof git !== "function") stop("LOCAL_GIT_ADAPTER_REQUIRED", "Lokaler Git-Adapter fehlt.");
  const result = git([...args]);
  if (!result || result.error || result.signal || result.status !== 0) {
    stop("LOCAL_GIT_FAILED", `${label} konnte nicht commitgebunden belegt werden.`);
  }
  return Buffer.from(result.stdout || []);
}

function gitText(git, args, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(gitResult(git, args, label));
  } catch (error) {
    if (error instanceof RadarE17ARepairStop) throw error;
    stop("LOCAL_GIT_INVALID_UTF8", `${label} ist kein gueltiges UTF-8.`);
  }
  return text.trim();
}

function buildTransactionSql(migrationSql) {
  const normalizedMigration = migrationSql.endsWith("\n") ? migrationSql : `${migrationSql}\n`;
  return [
    "BEGIN;\n",
    normalizedMigration,
    "INSERT INTO supabase_migrations.schema_migrations (version, name, statements)\n",
    `VALUES ('${RADAR_E17A_MIGRATION_VERSION}', '${RADAR_E17A_LEDGER_NAME}', ARRAY[]::text[]);\n`,
    "COMMIT;\n",
  ].join("");
}

function migrationIdentity(path) {
  const match = path.match(MIGRATION_PATH_PATTERN);
  return match ? Object.freeze({ version: match[1], name: match[2] }) : null;
}

export function loadRadarE17ARepairContract({ git = defaultGit } = {}) {
  const finalCommit = gitText(git, ["rev-parse", "HEAD"], "HEAD");
  if (!COMMIT.test(finalCommit)) stop("HEAD_COMMIT_INVALID", "HEAD ist kein exakter Commit.");
  gitResult(
    git,
    ["merge-base", "--is-ancestor", RADAR_E17A_REPAIR_BASELINE, finalCommit],
    "E17A-Baseline",
  );
  const dirty = gitText(
    git,
    ["status", "--porcelain=v1", "--untracked-files=all", "--", "supabase/migrations"],
    "Migrationsstatus",
  );
  if (dirty !== "") stop("MIGRATION_TREE_DIRTY", "Migrationsbaum ist nicht clean.");

  const treeArgs = ["ls-tree", "-r", "--name-only"];
  const baselinePaths = gitText(
    git,
    [...treeArgs, RADAR_E17A_REPAIR_BASELINE, "supabase/migrations"],
    "Baseline-Migrationsbaum",
  ).split(/\r?\n/).filter(Boolean);
  const headPaths = gitText(
    git,
    [...treeArgs, finalCommit, "supabase/migrations"],
    "HEAD-Migrationsbaum",
  ).split(/\r?\n/).filter(Boolean);
  if (!isDeepStrictEqual(headPaths, baselinePaths)) {
    stop("MIGRATION_TREE_DRIFT", "Migrationsbaum driftet von der freigegebenen Baseline.");
  }
  const identities = headPaths.map(migrationIdentity).filter(Boolean);
  const baselineLedger = identities.filter(
    ({ version }) => version < RADAR_E17A_MIGRATION_VERSION,
  );
  if (identities.length !== EXPECTED_MIGRATION_COUNT
      || baselineLedger.length !== EXPECTED_LEDGER_BASELINE_COUNT
      || baselineLedger.at(-1)?.version !== EXPECTED_PREVIOUS_LEDGER_VERSION
      || !headPaths.includes(RADAR_E17A_MIGRATION_PATH)
      || new Set(identities.map(({ version }) => version)).size !== identities.length) {
    stop("MIGRATION_TREE_INVALID", "Migrationsbaum verletzt den eingefrorenen E17A-Vertrag.");
  }

  const migrationBytes = gitResult(
    git,
    ["show", `${finalCommit}:${RADAR_E17A_MIGRATION_PATH}`],
    "E17A-Migrationsblob",
  );
  if (sha256(migrationBytes) !== RADAR_E17A_MIGRATION_SHA256) {
    stop("MIGRATION_HASH_MISMATCH", "E17A-Migrationsblob besitzt den falschen Hash.");
  }
  let migrationSql;
  try {
    migrationSql = new TextDecoder("utf-8", { fatal: true }).decode(migrationBytes);
  } catch {
    stop("MIGRATION_INVALID_UTF8", "E17A-Migrationsblob ist kein gueltiges UTF-8.");
  }
  const transactionSql = buildTransactionSql(migrationSql);
  if (sha256(Buffer.from(transactionSql, "utf8")) !== RADAR_E17A_TRANSACTION_SHA256) {
    stop("TRANSACTION_HASH_MISMATCH", "E17A-Migration und Ledger bilden nicht den exakten Write.");
  }

  const targetHistory = Object.freeze({
    version: RADAR_E17A_MIGRATION_VERSION,
    name: RADAR_E17A_LEDGER_NAME,
  });
  const targetLedger = Object.freeze({
    version: RADAR_E17A_MIGRATION_VERSION,
    name: RADAR_E17A_LEDGER_NAME,
    statements: Object.freeze([]),
  });
  const contract = Object.freeze({
    finalCommit,
    migrationPath: RADAR_E17A_MIGRATION_PATH,
    migrationSha256: RADAR_E17A_MIGRATION_SHA256,
    transactionSha256: RADAR_E17A_TRANSACTION_SHA256,
    transactionSql,
    expectedLedgerBaseline: Object.freeze(baselineLedger),
    targetHistory,
    targetLedger,
  });
  repairContractBrand.add(contract);
  return contract;
}

function validateContract(contract) {
  if (!contract || !repairContractBrand.has(contract)) {
    stop("COMMITTED_REPAIR_CONTRACT_REQUIRED", "One-Shot braucht den commitgebundenen E17A-Vertrag.");
  }
  return contract;
}

function isJsonScalar(value) {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

function validateLimits(limits) {
  const rows = Object.keys(LIMIT_PATCHES);
  if (!exactPlainObject(limits, rows)) {
    stop("LIMIT_BASELINE_INVALID", "E17A-Limitprojektion ist formfremd.");
  }
  const copy = {};
  for (const [rowName, patch] of Object.entries(LIMIT_PATCHES)) {
    const row = limits[rowName];
    if (row === null || typeof row !== "object" || Array.isArray(row)
        || Object.getPrototypeOf(row) !== Object.prototype
        || !Object.values(row).every(isJsonScalar)) {
      stop("LIMIT_BASELINE_INVALID", "E17A-Limitzeile ist formfremd.");
    }
    if (Object.hasOwn(row, patch.key) && !isDeepStrictEqual(row[patch.key], patch.value)) {
      stop("LIMIT_BASELINE_DRIFT", "E17A-Limitwert driftet.");
    }
    copy[rowName] = Object.freeze({ ...row });
  }
  return Object.freeze(copy);
}

function expectedPostLimits(preflightLimits) {
  return Object.freeze(Object.fromEntries(
    Object.entries(LIMIT_PATCHES).map(([rowName, patch]) => [
      rowName,
      Object.freeze({ ...preflightLimits[rowName], [patch.key]: patch.value }),
    ]),
  ));
}

function validatePreflightState(state, contract) {
  if (!exactPlainObject(state, ["ledger", "limits", "targetLedger"])
      || state.targetLedger !== null) {
    stop("READ_PREFLIGHT_INVALID", "E17A-Read-Preflight ist formfremd oder vorgezogen.");
  }
  validateRadarLedgerBaseline(state.ledger, contract.expectedLedgerBaseline);
  const limits = validateLimits(state.limits);
  return Object.freeze({
    ledger: contract.expectedLedgerBaseline,
    limits,
    expectedPostLimits: expectedPostLimits(limits),
    targetLedger: null,
  });
}

function validatePostflightState(state, preflight, contract) {
  if (!exactPlainObject(state, ["ledger", "limits", "targetLedger"])) {
    stop("POSTFLIGHT_INVALID", "E17A-Postflight ist formfremd.");
  }
  const expectedLedger = Object.freeze([
    ...contract.expectedLedgerBaseline,
    contract.targetHistory,
  ]);
  try {
    validateRadarLedgerBaseline(state.ledger, expectedLedger);
  } catch (error) {
    if (error instanceof RadarRemoteStartStop) {
      stop("LEDGER_POSTFLIGHT_DRIFT", "E17A-Postflight enthaelt nicht exakt eine Ledgeraenderung.");
    }
    throw error;
  }
  if (!isDeepStrictEqual(state.targetLedger, contract.targetLedger)) {
    stop("LEDGER_TARGET_INVALID", "E17A-Zielledger besitzt nicht die exakte Identitaet.");
  }
  const limits = validateLimits(state.limits);
  if (!isDeepStrictEqual(limits, preflight.expectedPostLimits)) {
    stop("LIMIT_POSTFLIGHT_DRIFT", "E17A-Postflight enthaelt nicht exakt die drei Limitwerte.");
  }
  return Object.freeze({ ledger: expectedLedger, limits, targetLedger: contract.targetLedger });
}

function pathIsInsideRepo(path) {
  const rel = relative(REPO_ROOT, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function validateBackupReceipt(receipt) {
  if (!exactPlainObject(receipt, ["artifactPath", "bytes", "sha256", "status"])
      || receipt.status !== "BACKUP_CREATED"
      || typeof receipt.artifactPath !== "string"
      || !isAbsolute(receipt.artifactPath)
      || resolve(receipt.artifactPath) !== receipt.artifactPath
      || pathIsInsideRepo(receipt.artifactPath)
      || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1
      || typeof receipt.sha256 !== "string" || !SHA256.test(receipt.sha256)) {
    stop("BACKUP_RECEIPT_INVALID", "E17A-Backupbeleg ist unvollstaendig oder liegt im Repo.");
  }
  return Object.freeze({ ...receipt });
}

function validateRestoreReceipt(receipt, backupReceipt) {
  if (!exactPlainObject(
    receipt,
    ["backupSha256", "dataSha256", "schemaSha256", "status"],
  ) || receipt.status !== "DISPOSABLE_RESTORE_VERIFIED"
      || receipt.backupSha256 !== backupReceipt.sha256
      || !SHA256.test(String(receipt.schemaSha256 || ""))
      || !SHA256.test(String(receipt.dataSha256 || ""))) {
    stop("RESTORE_RECEIPT_INVALID", "E17A-Wegwerf-Restore ist nicht an das Backup gebunden.");
  }
  return Object.freeze({ ...receipt });
}

function validateWriteReceipt(receipt, contract) {
  if (!exactPlainObject(receipt, ["ledgerRows", "status", "transactionSha256"])
      || receipt.status !== "ONE_BOUNDED_MUTATION"
      || receipt.transactionSha256 !== contract.transactionSha256
      || receipt.ledgerRows !== 1) {
    stop("WRITE_RECEIPT_INVALID", "E17A-Writebeleg entspricht nicht dem einen SQL-/Ledger-Write.");
  }
  return Object.freeze({ ...receipt });
}

function validateCleanupReceipt(receipt) {
  if (!exactPlainObject(receipt, ["status"]) || receipt.status !== "CLEANUP_COMPLETE") {
    stop("CLEANUP_RECEIPT_INVALID", "E17A-Cleanup wurde nicht vollstaendig belegt.");
  }
  return receipt;
}

function normalizeFailure(error, phase) {
  if (error instanceof RadarE17ARepairStop) return error;
  if (error instanceof RadarRemoteStartStop) {
    return new RadarE17ARepairStop(error.code, error.message);
  }
  return new RadarE17ARepairStop(
    `STOP_${phase.toUpperCase().replaceAll("-", "_")}`,
    `E17A-One-Shot stoppte in ${phase}; keine automatische Wiederholung.`,
  );
}

function requireEffects(effects) {
  if (!exactPlainObject(effects, EFFECT_NAMES)
      || EFFECT_NAMES.some((name) => typeof effects[name] !== "function")) {
    stop("REPAIR_EFFECTS_INVALID", "E17A-One-Shot braucht exakt die sieben injizierten Effekte.");
  }
  return effects;
}

export function createRadarE17ARepairOnce(options = {}) {
  const effects = requireEffects(options);
  let used = false;

  return async function runOnce() {
    if (used) {
      stop("AUTONOMIE_STOPP_NO_RETRY", "Dieser E17A-One-Shot wurde bereits verbraucht.");
    }
    used = true;
    const trace = [];
    let phase = "local-gate";
    let contract = null;
    let primaryFailure = null;
    let postflightState = null;

    try {
      contract = validateContract(await effects.localGate());
      trace.push("local-gate");

      phase = "remote-read";
      const preflight = validatePreflightState(await effects.remoteRead({ contract }), contract);
      trace.push("remote-read");

      phase = "backup";
      const backupReceipt = validateBackupReceipt(await effects.backup({ contract, preflight }));
      trace.push("backup");

      phase = "restore";
      const restoreReceipt = validateRestoreReceipt(
        await effects.restore({ backupReceipt, contract, preflight }),
        backupReceipt,
      );
      trace.push("restore");

      phase = "write";
      const writeReceipt = validateWriteReceipt(await effects.write(Object.freeze({
        finalCommit: contract.finalCommit,
        migrationPath: contract.migrationPath,
        migrationSha256: contract.migrationSha256,
        sql: contract.transactionSql,
        transactionSha256: contract.transactionSha256,
      })), contract);
      trace.push("write");

      phase = "postflight";
      postflightState = validatePostflightState(
        await effects.postflight({
          backupReceipt,
          contract,
          preflight,
          restoreReceipt,
          writeReceipt,
        }),
        preflight,
        contract,
      );
      trace.push("postflight");
    } catch (error) {
      primaryFailure = normalizeFailure(error, phase);
    }

    try {
      validateCleanupReceipt(await effects.cleanup(Object.freeze({
        finalCommit: contract?.finalCommit ?? null,
        phase,
        stopped: primaryFailure !== null,
      })));
      trace.push("cleanup");
    } catch (error) {
      primaryFailure = normalizeFailure(error, "cleanup");
    }

    if (primaryFailure) throw primaryFailure;
    return Object.freeze({
      status: "E17A_REPAIR_COMPLETE",
      finalCommit: contract.finalCommit,
      migrationSha256: contract.migrationSha256,
      transactionSha256: contract.transactionSha256,
      ledgerRows: postflightState.ledger.length,
      trace: Object.freeze([...trace]),
    });
  };
}
