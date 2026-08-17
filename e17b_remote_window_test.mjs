/* Rein lokale, dependency-freie Wave-A-Vertrags- und Forgerytests. */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder as NodeTextDecoder } from "node:util";
import { inflateRawSync } from "node:zlib";

const helperUrl = new URL("./tools/e17b-remote-window.mjs", import.meta.url);
const helperPath = fileURLToPath(helperUrl);
const remote = await import(helperUrl.href);

let ok = 0;
function check(name, value) {
  if (!value) throw new Error(`Fehlgeschlagen: ${name}`);
  ok += 1;
  console.log(`✓ ${name}`);
}

function expectStop(name, fn, reasonCode) {
  let error;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  check(
    name,
    error instanceof Error
      && (!reasonCode || error.reasonCode === reasonCode)
      && error.code === "E17B_STOP",
  );
  return error;
}

function invokeWhileBuiltinIsPatched(target, key, replacement, invoke) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(target, key);
  let error;
  let value;
  try {
    Object.defineProperty(target, key, { ...originalDescriptor, value: replacement });
    try {
      value = invoke();
    } catch (caught) {
      error = caught;
    }
  } finally {
    Object.defineProperty(target, key, originalDescriptor);
  }
  return { error, value };
}

function checkIntrinsicDrift(name, outcome) {
  check(name,
    outcome.value === undefined
      && outcome.error instanceof Error
      && outcome.error.code === "E17B_STOP"
      && outcome.error.reasonCode === "RUNTIME_INTRINSIC_DRIFT");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function independentCanonicalize(value) {
  if (Array.isArray(value)) return value.map(independentCanonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, independentCanonicalize(value[key])]),
    );
  }
  return value;
}

function independentCanonicalBytes(value) {
  return Buffer.from(JSON.stringify(independentCanonicalize(value)), "utf8");
}

const LITERAL_MODES = [
  "local-contract",
  "read-preflight",
  "backup-restore",
  "function-release",
  "db-apply",
  "postflight",
  "cleanup-local",
];

const LITERAL_ROLES = [
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
];

const LITERAL_ROLE_MODES = {
  "00-contract": ["local-contract"],
  "10-read-preflight": ["read-preflight"],
  "11-function-preimage": ["read-preflight"],
  "12-db-preimage": ["read-preflight"],
  "20-backup-manifest": ["backup-restore"],
  "21-restore-proof": ["backup-restore"],
  "22-canonical-detail": ["backup-restore"],
  "23-canonical-detail": ["backup-restore"],
  "30-function-checkpoint": ["function-release"],
  "31-function-apply": ["function-release"],
  "32-function-postflight": ["function-release"],
  "40-db-checkpoint": ["db-apply"],
  "41-db-apply": ["db-apply"],
  "42-db-postflight": ["postflight"],
  "90-remote-delta": ["postflight"],
  "91-rollback-plan": ["postflight"],
  "98-credential-cleanup": ["cleanup-local"],
  "99-final-checkpoint": ["cleanup-local"],
};

const LITERAL_FUNCTION_SOURCES = [
  "supabase/functions/ai-task/index.ts",
  "supabase/functions/ai-task/providerContract.ts",
  "supabase/functions/ai-task/requestContract.ts",
  "supabase/functions/filmwissen-task/quellen.ts",
  "supabase/functions/filmwissen-task/vertrag.ts",
];

const LITERAL_LOCAL_ROLES = [
  "anon",
  "authenticated",
  "authenticator",
  "postgres",
  "service_role",
  "supabase_admin",
];

const LITERAL_MIGRATION_PATHS = [
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
  "supabase/migrations/20260817120000_blog_profile_extract_config.sql",
];

const LITERAL_LEDGER_HISTORY = LITERAL_MIGRATION_PATHS.slice(0, -1).map((path) => {
  const match = path.match(/\/([0-9]{14})_([a-z0-9_]+)\.sql$/);
  return { version: match[1], name: match[2] };
});
const LITERAL_LEDGER_VERSIONS = LITERAL_LEDGER_HISTORY.map(({ version }) => version);

const FINAL_COMMIT = "d".repeat(40);
const OTHER_COMMIT = "e".repeat(40);
const RUN_ID = `kinodreieck-e17b-${FINAL_COMMIT}-0123456789abcdef`;
const TARGET_ID = "supabase:bscjgwcntapobyxsiyce";
const HASH_A = "1".repeat(64);
const HASH_B = "2".repeat(64);
const HASH_C = "3".repeat(64);
const HASH_D = "4".repeat(64);
const HASH_CATEGORY = "fd80f5a9313f65b7fd93e2922ec25a7cf9fa9789554b0b6de3b913f842d22ae9";
const TARGET_DIGEST = "5".repeat(64);

const rawGitFiles = new Map([
  ...LITERAL_FUNCTION_SOURCES.map((path) => [path, readFileSync(new URL(`./${path}`, import.meta.url))]),
  ["supabase/config.toml", readFileSync(new URL("./supabase/config.toml", import.meta.url))],
  [
    "supabase/migrations/20260817120000_blog_profile_extract_config.sql",
    readFileSync(new URL(
      "./supabase/migrations/20260817120000_blog_profile_extract_config.sql",
      import.meta.url,
    )),
  ],
]);

function localGitFixture({
  head = FINAL_COMMIT,
  status = "",
  branch = "refs/heads/codex/e17b-bloganalyse-remote",
  refCommit = FINAL_COMMIT,
  files = rawGitFiles,
  paths = LITERAL_MIGRATION_PATHS,
} = {}) {
  return (args) => {
    if (args[0] === "rev-parse" && args[1] === "HEAD") return Buffer.from(`${head}\n`);
    if (args[0] === "status") return Buffer.from(status);
    if (args[0] === "symbolic-ref") return Buffer.from(`${branch}\n`);
    if (args[0] === "show-ref") {
      return Buffer.from(`${refCommit} refs/heads/codex/e17b-bloganalyse-remote\n`);
    }
    if (args[0] === "merge-base") return Buffer.alloc(0);
    if (args[0] === "ls-tree") return Buffer.from(`${paths.join("\n")}\n`);
    if (args[0] === "show") {
      const path = args[1].slice(FINAL_COMMIT.length + 1);
      const value = files.get(path);
      if (!value) throw new Error(`fehlender Git-Testblob ${path}`);
      return value;
    }
    throw new Error(`unerwarteter lokaler Git-Aufruf ${JSON.stringify(args)}`);
  };
}

const SUCCESS_OPERATIONS = {
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
};

function literalMode(role) {
  return LITERAL_ROLE_MODES[role][0];
}

function literalPrerequisites(role, variant = "green") {
  const index = LITERAL_ROLES.indexOf(role);
  if (index < 0) throw new Error("unbekannte Testrolle");
  if ((role === "98-credential-cleanup" || role === "99-final-checkpoint")
      && variant !== "green") {
    const stopRole = variant.slice("stop-after-".length);
    const stopIndex = LITERAL_ROLES.indexOf(stopRole);
    const prefix = LITERAL_ROLES.slice(0, stopIndex + 1);
    return role === "98-credential-cleanup" ? prefix : [...prefix, "98-credential-cleanup"];
  }
  return LITERAL_ROLES.slice(0, index);
}

function executor(operation) {
  return {
    operation,
    exitCode: 0,
    signal: null,
    timedOut: false,
    parsedOutputSha256: HASH_D,
  };
}

function successFacts(role) {
  const operation = SUCCESS_OPERATIONS[role];
  const base = { executorOperation: operation };
  switch (role) {
    case "10-read-preflight":
      return { ...base, remoteTargetDigest: TARGET_DIGEST };
    case "11-function-preimage":
      return { ...base, preimageDigest: HASH_A, remoteTargetDigest: TARGET_DIGEST };
    case "12-db-preimage":
      return {
        ...base,
        preimageDigest: HASH_B,
        remoteTargetDigest: TARGET_DIGEST,
        ledgerCount: 35,
        targetCount: 0,
      };
    case "20-backup-manifest":
      return {
        ...base,
        remoteTargetDigest: TARGET_DIGEST,
        snapshotIdSha256: HASH_A,
        publicDumpSha256: HASH_B,
        migrationsDumpSha256: HASH_C,
        rolesDumpSha256: HASH_D,
        authIdSetSha256: HASH_A,
        authArtifactSha256: HASH_B,
        publicSnapshotIdSha256: HASH_A,
        migrationsSnapshotIdSha256: HASH_A,
        authSnapshotIdSha256: HASH_A,
        canonicalSourceSnapshotIdSha256: HASH_A,
      };
    case "21-restore-proof":
      return {
        ...base,
        structureSha256: HASH_A,
        tableSetSha256: HASH_B,
        rowCountSetSha256: HASH_C,
        dataHashSetSha256: HASH_D,
        categorySetSha256: HASH_CATEGORY,
        nonTargetDataSha256: HASH_C,
        nonTargetKeysSha256: HASH_D,
        nonTargetFlagsSha256: HASH_A,
        authIdSetSha256: HASH_A,
        ledgerHistorySha256: "c99f0c25f727064a6e3bc5d471ace296bb506818c234fb479c5de5fffc2bf17d",
        ledgerRowsSha256: HASH_B,
        ledgerCount: 35,
        targetCount: 0,
        rlsSha256: HASH_A,
        aclSha256: HASH_B,
      };
    case "22-canonical-detail":
      return { ...successFacts("21-restore-proof"), executorOperation: operation, canonicalSide: "source" };
    case "23-canonical-detail":
      return { ...successFacts("21-restore-proof"), executorOperation: operation, canonicalSide: "restore" };
    case "31-function-apply":
      return { ...base, buildCommit: FINAL_COMMIT, markerCommit: FINAL_COMMIT };
    case "32-function-postflight":
      return {
        ...base,
        statusCode: 200,
        authStatus: "authenticated",
        buildCommit: FINAL_COMMIT,
        capability: "not-ready",
      };
    case "41-db-apply":
      return {
        ...base,
        migrationSha256: "887253d3323c059fd286bf3e66cae3f167cba4396e89e8f867baa7de42465134",
        transactionSha256: HASH_A,
      };
    case "42-db-postflight":
      return {
        ...base,
        ledgerCount: 36,
        targetCount: 1,
        structureSha256: HASH_A,
        tableSetSha256: HASH_B,
        rowCountSetSha256: HASH_C,
        categorySetSha256: HASH_CATEGORY,
        rlsSha256: HASH_A,
        aclSha256: HASH_B,
        nonTargetDataSha256: HASH_C,
        nonTargetKeysSha256: HASH_D,
        nonTargetFlagsSha256: HASH_A,
        statusCode: 200,
        authStatus: "authenticated",
        buildCommit: FINAL_COMMIT,
        capability: "ready",
      };
    case "90-remote-delta":
      return { ...successFacts("42-db-postflight"), executorOperation: operation };
    case "98-credential-cleanup":
      return { ...base, cleanupCount: 2 };
    default:
      throw new Error(`keine Success-Testfacts für ${role}`);
  }
}

function literalFinalFacts(variant = "green", stopReasonCode) {
  const fixed = {
    green: ["98-credential-cleanup", null, "remote-green-final-health-ready"],
    "stop-after-00-contract": ["00-contract", "READ_PREFLIGHT_NOT_STARTED", "no-remote-effect"],
    "stop-after-10-read-preflight": ["00-contract", "REMOTE_PAYLOAD_PENDING", "no-remote-effect"],
    "stop-after-11-function-preimage": ["11-function-preimage", "FUNCTION_PREIMAGE_STOP", "read-only-remote-effect"],
    "stop-after-12-db-preimage": ["12-db-preimage", "DB_PREIMAGE_STOP", "read-only-remote-effect"],
    "stop-after-20-backup-manifest": ["20-backup-manifest", "BACKUP_RESTORE_STOP", "read-only-remote-effect"],
    "stop-after-21-restore-proof": ["21-restore-proof", "RESTORE_PROOF_STOP", "read-only-remote-effect"],
    "stop-after-22-canonical-detail": ["22-canonical-detail", "SOURCE_CANONICAL_STOP", "read-only-remote-effect"],
    "stop-after-23-canonical-detail": ["23-canonical-detail", "RESTORE_CANONICAL_STOP", "read-only-remote-effect"],
    "stop-after-30-function-checkpoint": ["30-function-checkpoint", "FUNCTION_DEPLOY_FAILED", "function-deploy-not-proven"],
    "stop-after-31-function-apply": ["31-function-apply", "FUNCTION_HEALTH_FAILED", "function-deployed-marker-set-health-missing"],
    "stop-after-32-function-postflight": ["32-function-postflight", "DB_OWNER_GATE_STOP", "function-ready-false-db-not-applied"],
    "stop-after-40-db-checkpoint": ["40-db-checkpoint", "DB_APPLY_FAILED", "function-ready-false-db-write-not-proven"],
    "stop-after-41-db-apply": ["41-db-apply", "DB_POSTFLIGHT_FAILED", "db-write-committed-final-health-missing"],
    "stop-after-42-db-postflight": ["42-db-postflight", "REMOTE_DELTA_FAILED", "db-write-committed-final-health-ready"],
    "stop-after-90-remote-delta": ["90-remote-delta", "ROLLBACK_PLAN_STOP", "remote-green-final-health-ready"],
  };
  const [lastSuccessfulRole, defaultStopReasonCode, remoteEffectState] = fixed[variant];
  return {
    reasonCode: "FINAL_CHECKPOINT",
    lastSuccessfulRole,
    stopReasonCode: stopReasonCode ?? defaultStopReasonCode,
    remoteEffectState,
  };
}

function ownerReceiptFacts({ role, prerequisites, preimageRole, preimageDigest }) {
  const context = {
    schema: "e17b-owner-gate-context-v1",
    role,
    mode: literalMode(role),
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    projectId: "bscjgwcntapobyxsiyce",
    targetId: TARGET_ID,
    targetBranch: "codex/e17b-bloganalyse-remote",
    allowedRemoteRef: "refs/heads/codex/e17b-bloganalyse-remote",
    e17aBaseline: "e580341a307feac1543e5fb60efa00d263485848",
    prerequisites,
  };
  const action = {
    schema: "e17b-owner-gate-action-v1",
    role,
    mode: literalMode(role),
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    targetId: TARGET_ID,
    preimageRole,
    preimageDigest,
    remoteTargetDigest: TARGET_DIGEST,
  };
  const contextDigest = sha256(independentCanonicalBytes(context));
  const actionDigest = sha256(independentCanonicalBytes(action));
  const receipt = {
    schema: "e17b-owner-gate-receipt-v1",
    receiptType: "owner-gate-receipt",
    contextDigest,
    actionDigest,
  };
  return {
    reasonCode: "OWNER_GATE_RECEIPT",
    receiptType: "owner-gate-receipt",
    preimageDigest,
    remoteTargetDigest: TARGET_DIGEST,
    contextDigest,
    actionDigest,
    gateReceiptDigest: sha256(independentCanonicalBytes(receipt)),
  };
}

function baseRecord({ role, state, facts, prerequisites, variant = "green", executorSummary = null }) {
  return {
    schema: "kinodreieck-e17b-remote-window-v4",
    role,
    mode: literalMode(role),
    state,
    prerequisiteVariant: variant,
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    projectId: "bscjgwcntapobyxsiyce",
    targetId: TARGET_ID,
    targetBranch: "codex/e17b-bloganalyse-remote",
    allowedRemoteRef: "refs/heads/codex/e17b-bloganalyse-remote",
    e17aBaseline: "e580341a307feac1543e5fb60efa00d263485848",
    prerequisites,
    facts,
    executor: executorSummary,
  };
}

function makeItem(record) {
  const bytes = independentCanonicalBytes(record);
  return { record, bytes, digest: sha256(bytes), provenance: "fixture" };
}

function buildFixtureChain() {
  const items = {};
  for (const role of LITERAL_ROLES) {
    const prerequisiteRoles = literalPrerequisites(role);
    const prerequisites = Object.fromEntries(
      prerequisiteRoles.map((prerequisiteRole) => [prerequisiteRole, items[prerequisiteRole].digest]),
    );
    let state;
    let facts;
    let executorSummary = null;
    if (role === "00-contract") {
      state = "contract";
      facts = {
        modeCount: 7,
        evidenceRoleCount: 18,
        sourceClosureCount: 5,
        targetBranch: "codex/e17b-bloganalyse-remote",
        allowedRemoteRef: "refs/heads/codex/e17b-bloganalyse-remote",
        e17aBaseline: "e580341a307feac1543e5fb60efa00d263485848",
        sourceSha256: "f3435b5be6cd274a9b84498ad744d11899ebe5043d537de72dd1e3bf237c828b",
        configSha256: "d051796a827474deb407de73f75b6587b658433f393b7f94b699ad6bdeb1fa79",
        deployContractSha256: "fca05ffd23050bb33b679528401fe5e06b2e51d3a37c5f09a0bec229753bfe5b",
        migrationSha256: "887253d3323c059fd286bf3e66cae3f167cba4396e89e8f867baa7de42465134",
        ledgerHistorySha256: "c99f0c25f727064a6e3bc5d471ace296bb506818c234fb479c5de5fffc2bf17d",
      };
    } else if (role === "30-function-checkpoint" || role === "40-db-checkpoint") {
      state = "checkpoint";
      const preimageRole = role === "30-function-checkpoint"
        ? "11-function-preimage"
        : "12-db-preimage";
      facts = ownerReceiptFacts({
        role,
        prerequisites,
        preimageRole,
        preimageDigest: items[preimageRole].digest,
      });
    } else if (role === "91-rollback-plan") {
      state = "checkpoint";
      facts = { reasonCode: "ROLLBACK_PLAN_ONLY", rollbackAction: "owner-stop-plan" };
    } else if (role === "99-final-checkpoint") {
      state = "checkpoint";
      facts = literalFinalFacts();
    } else {
      state = "ok";
      facts = successFacts(role);
      executorSummary = executor(SUCCESS_OPERATIONS[role]);
    }
    items[role] = makeItem(baseRecord({
      role,
      state,
      facts,
      prerequisites,
      executorSummary,
    }));
  }
  return items;
}

function subsetForRole(items, role, variant = "green") {
  return Object.fromEntries(
    literalPrerequisites(role, variant).map((prerequisiteRole) => [prerequisiteRole, items[prerequisiteRole]]),
  );
}

function cleanupTree(path) {
  if (typeof path !== "string" || !path.startsWith("/private/tmp/kinodreieck-e17b-")) {
    throw new Error("Test-Cleanupziel ist nicht eng genug begrenzt");
  }
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink() || stat.isFile()) {
    unlinkSync(path);
    return;
  }
  for (const entry of readdirSync(path)) cleanupTree(join(path, entry));
  rmdirSync(path);
}

// Import-/Runtimegate: eine zweite, cache-unabhängige Auswertung deckt Top-Level-TypeErrors ab.
const runtimeImport = await import(`${helperUrl.href}?runtime=${randomBytes(8).toString("hex")}`);
check("Modul importiert und wertet Top-Level-Code ohne Runtimefehler aus", runtimeImport.__wave === "A");
check("Kein generischer makeEvidenceRecord-Erzeuger ist exportiert", !("makeEvidenceRecord" in remote));
check("Kein generischer unbewachter JSON-Serializer ist exportiert", !("canonicalJson" in remote));
check("Threat Boundary benennt Persistenz ehrlich als untrusted Transcript",
  remote.THREAT_BOUNDARY.persistedEvidence === "untrusted-transcript"
    && remote.THREAT_BOUNDARY.doesNotProtectAgainst === "malicious-process-same-macos-uid"
    && remote.THREAT_BOUNDARY.authorizationPersistence === "forbidden");
check("Gefährliche Sinks verlangen ausschließlich nicht serialisierbare Fresh-Runtime-Kontexte",
  remote.RUNTIME_SINK_REQUIREMENTS["function-mutation"].includes("VerifiedOwnerAuthorization")
    && remote.RUNTIME_SINK_REQUIREMENTS["function-mutation"].includes("FreshRemoteGit")
    && remote.RUNTIME_SINK_REQUIREMENTS["db-mutation"].includes("FreshDbPreimage")
    && remote.RUNTIME_SINK_REQUIREMENTS["pg-password-child"].includes("FreshRemotePgTarget")
    && remote.RUNTIME_SINK_REQUIREMENTS["db-mutation"].includes("FreshRemoteGit")
    && remote.RUNTIME_SINK_REQUIREMENTS["db-mutation"].includes("RuntimeSecretContext")
    && remote.RUNTIME_SINK_REQUIREMENTS["db-mutation"].includes("CanonicalProof")
    && remote.RUNTIME_SINK_REQUIREMENTS["db-mutation"].includes("Pg17ToolchainClosure"));
check("Beide Keychain-Services und Accounts entsprechen unabhängigen Literalen",
  JSON.stringify(remote.INFRA_KEYCHAIN) === JSON.stringify({
    service: "at.kinodreieck.codex.supabase.bscjgwcntapobyxsiyce",
    accessTokenAccount: "SUPABASE_ACCESS_TOKEN",
    databasePasswordAccount: "DB_POSTGRES_PASSWORD",
  })
    && JSON.stringify(remote.HEALTH_KEYCHAIN) === JSON.stringify({
      service: "at.kinodreieck.codex.live-tests.shared",
      account: "KD_TESTA_PASS",
    }));
check("Lokale Restore-Rollenliste entspricht exakt unabhängigem Literal",
  JSON.stringify(remote.LOCAL_ROLE_ALLOWLIST) === JSON.stringify(LITERAL_LOCAL_ROLES));

check("Exakt sieben Modi entsprechen dem unabhängigen Literalorakel",
  JSON.stringify(remote.MODES) === JSON.stringify(LITERAL_MODES));
check("Kein all/autoresume/retry-Modus existiert",
  !remote.MODES.some((mode) => ["all", "autoresume", "retry"].includes(mode)));
check("Exakt 18 eindeutige Rollen entsprechen dem unabhängigen Literalorakel",
  remote.EVIDENCE_ROLES.length === 18
    && new Set(remote.EVIDENCE_ROLES).size === 18
    && JSON.stringify(remote.EVIDENCE_ROLES) === JSON.stringify(LITERAL_ROLES));
check("Rollen-/Modusmatrix ist exakt und ohne Mehrfachzuordnung",
  JSON.stringify(remote.ROLE_MODES) === JSON.stringify(LITERAL_ROLE_MODES));
check("42 gehört ausschließlich zu postflight",
  JSON.stringify(remote.ROLE_MODES["42-db-postflight"]) === JSON.stringify(["postflight"]));
check("91 gehört ausschließlich zu postflight",
  JSON.stringify(remote.ROLE_MODES["91-rollback-plan"]) === JSON.stringify(["postflight"]));
check("99 gehört ausschließlich zu cleanup-local",
  JSON.stringify(remote.ROLE_MODES["99-final-checkpoint"]) === JSON.stringify(["cleanup-local"]));

const EARLY_STOP_ROLES = LITERAL_ROLES.slice(0, LITERAL_ROLES.indexOf("91-rollback-plan"));
check("Es gibt genau eine frühe STOP-Variante je Rolle bis einschließlich 90",
  JSON.stringify(remote.CLEANUP_STOP_VARIANTS)
    === JSON.stringify(EARLY_STOP_ROLES.map((role) => `stop-after-${role}`)));
for (const stopRole of EARLY_STOP_ROLES) {
  const variant = `stop-after-${stopRole}`;
  const expected98 = literalPrerequisites("98-credential-cleanup", variant);
  const expected99 = literalPrerequisites("99-final-checkpoint", variant);
  check(`Cleanup 98 schließt ${variant} exakt ohne 91`,
    JSON.stringify(remote.expectedPrerequisites("98-credential-cleanup", "cleanup-local", variant))
      === JSON.stringify(expected98)
      && !expected98.includes("91-rollback-plan"));
  check(`Cleanup 99 schließt ${variant} exakt über 98 ohne Erfolgskettenzwang`,
    JSON.stringify(remote.expectedPrerequisites("99-final-checkpoint", "cleanup-local", variant))
      === JSON.stringify(expected99)
      && expected99.at(-1) === "98-credential-cleanup"
      && !expected99.includes("91-rollback-plan"));
}

check("Fünf Functionpfade und Reihenfolge entsprechen unabhängigen Literalen",
  JSON.stringify(remote.FUNCTION_SOURCES) === JSON.stringify(LITERAL_FUNCTION_SOURCES));
check("Branch, Ref und Baseline sind exakt literal gebunden",
  remote.TARGET_BRANCH === "codex/e17b-bloganalyse-remote"
    && remote.ALLOWED_REMOTE_REF === "refs/heads/codex/e17b-bloganalyse-remote"
    && remote.E17A_BASELINE === "e580341a307feac1543e5fb60efa00d263485848");
check("Vier Inhaltsattestierungen sind exakt literal gebunden",
  remote.EXPECTED_SOURCE_SHA256 === "f3435b5be6cd274a9b84498ad744d11899ebe5043d537de72dd1e3bf237c828b"
    && remote.EXPECTED_CONFIG_SHA256 === "d051796a827474deb407de73f75b6587b658433f393b7f94b699ad6bdeb1fa79"
    && remote.EXPECTED_DEPLOY_CONTRACT_SHA256 === "fca05ffd23050bb33b679528401fe5e06b2e51d3a37c5f09a0bec229753bfe5b"
    && remote.EXPECTED_MIGRATION_SHA256 === "887253d3323c059fd286bf3e66cae3f167cba4396e89e8f867baa7de42465134");

const literalLedgerBytes = Buffer.from(JSON.stringify(LITERAL_LEDGER_VERSIONS), "utf8");
check("Ledgererwartung enthält exakt 35 Vorgängerversionen bis 20260816010000",
  remote.EXPECTED_LEDGER_VERSIONS.length === 35
    && remote.EXPECTED_LEDGER_VERSIONS.at(-1) === "20260816010000"
    && JSON.stringify(remote.EXPECTED_LEDGER_VERSIONS) === JSON.stringify(LITERAL_LEDGER_VERSIONS));
check("Ledgerhash ist exakt SHA-256 von JSON.stringify(array) ohne Wrapper/Newline",
  sha256(literalLedgerBytes) === "c99f0c25f727064a6e3bc5d471ace296bb506818c234fb479c5de5fffc2bf17d"
    && remote.EXPECTED_LEDGER_HISTORY_SHA256 === sha256(literalLedgerBytes));

const ledgerSql = remote.buildLedgerProtocolSql({ phase: "pre" });
check("Ledger-SQL behandelt absent separat und verlangt beim Ziel exakt leeres text[]",
  /count\(\*\)\s*=\s*0[\s\S]*'absent'/i.test(ledgerSql)
    && /statements\s+is\s+null/i.test(ledgerSql)
    && /statements\s*<>\s*'\{\}'::text\[\]/i.test(ledgerSql)
    && !/bool_and/i.test(ledgerSql));

function ledgerOutput(phase) {
  const history = phase === "pre"
    ? LITERAL_LEDGER_HISTORY
    : [...LITERAL_LEDGER_HISTORY, {
      version: "20260817120000",
      name: "blog_profile_extract_config",
    }];
  const target = phase === "pre"
    ? "E17B_TARGET|0||absent"
    : "E17B_TARGET|1|blog_profile_extract_config|empty";
  const json = phase === "pre"
    ? [
      "E17B_JSON|task_modell|absent",
      "E17B_JSON|task_max_tokens|absent",
      "E17B_JSON|task_max_reservierung_usd_cent|absent",
    ]
    : [
      "E17B_JSON|task_modell|klein",
      "E17B_JSON|task_max_tokens|2048",
      "E17B_JSON|task_max_reservierung_usd_cent|5",
    ];
  return [
    ...history.map(({ version, name }) => `E17B_LEDGER_ROW|${version}|${name}`),
    target,
    ...json,
    `E17B_CONTRACT|${phase}|c99f0c25f727064a6e3bc5d471ace296bb506818c234fb479c5de5fffc2bf17d`,
    "",
  ].join("\n");
}

const parsedPre = remote.parseLedgerProtocol(Buffer.from(ledgerOutput("pre")), { phase: "pre" });
const parsedPost = remote.parseLedgerProtocol(Buffer.from(ledgerOutput("post")), { phase: "post" });
check("Reales absent-Protokoll ist nullsicher parsebar",
  parsedPre.targetCount === 0 && parsedPre.targetStatements === "absent" && parsedPre.ledgerCount === 35);
check("Post-Protokoll verlangt exakt eine Zielzeile mit leerem statements-Array",
  parsedPost.targetCount === 1 && parsedPost.targetStatements === "empty" && parsedPost.ledgerCount === 36);
for (const [name, mutate] of [
  ["fehlende Ledgerzeile", (lines) => lines.splice(3, 1)],
  ["zusätzliche Ledgerzeile", (lines) => lines.splice(3, 0, lines[3])],
  ["umgeordnete Ledgerzeile", (lines) => [lines[2], lines[3]] = [lines[3], lines[2]]],
  ["NULL-Name als verschwundene Leerzeile", (lines) => { lines[5] = ""; }],
  ["leerer Historyname", (lines) => {
    lines[5] = `E17B_LEDGER_ROW|${LITERAL_LEDGER_HISTORY[5].version}|`;
  }],
  ["NULL-statements-Marker", (lines) => {
    const index = lines.findIndex((line) => line.startsWith("E17B_TARGET|"));
    lines[index] = "E17B_TARGET|1|blog_profile_extract_config|invalid";
  }],
]) {
  const lines = ledgerOutput(name === "NULL-statements-Marker" ? "post" : "pre").trimEnd().split("\n");
  mutate(lines);
  expectStop(`Ledgerparser stoppt ${name}`, () => remote.parseLedgerProtocol(
    Buffer.from(`${lines.join("\n")}\n`),
    { phase: name === "NULL-statements-Marker" ? "post" : "pre" },
  ));
}

const fixture = buildFixtureChain();
for (const stopRole of EARLY_STOP_ROLES) {
  const variant = `stop-after-${stopRole}`;
  const roles98 = literalPrerequisites("98-credential-cleanup", variant);
  const map98 = Object.fromEntries(roles98.map((role) => [role, fixture[role]]));
  if (stopRole === "10-read-preflight") {
    const pending10 = baseRecord({
      role: "10-read-preflight",
      state: "pending",
      facts: {
        reasonCode: "REMOTE_PAYLOAD_PENDING",
        remotePayloadStatus: "REMOTE_PAYLOAD_PENDING",
      },
      prerequisites: { "00-contract": fixture["00-contract"].digest },
    });
    map98["10-read-preflight"] = makeItem(pending10);
  }
  const record98 = baseRecord({
    role: "98-credential-cleanup",
    state: "ok",
    facts: successFacts("98-credential-cleanup"),
    prerequisites: Object.fromEntries(roles98.map((role) => [role, map98[role].digest])),
    variant,
    executorSummary: executor("cleanup-fs"),
  });
  const item98 = makeItem(record98);
  const roles99 = literalPrerequisites("99-final-checkpoint", variant);
  const map99 = { ...map98, "98-credential-cleanup": item98 };
  const record99 = baseRecord({
    role: "99-final-checkpoint",
    state: "checkpoint",
    facts: literalFinalFacts(variant),
    prerequisites: Object.fromEntries(roles99.map((role) => [role, map99[role].digest])),
    variant,
  });
  remote.validateEvidenceRecord(record98);
  remote.collectPrerequisiteDigests({
    role: "98-credential-cleanup",
    mode: "cleanup-local",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: map98,
    prerequisiteVariant: variant,
  });
  remote.validateEvidenceRecord(record99);
  remote.collectPrerequisiteDigests({
    role: "99-final-checkpoint",
    mode: "cleanup-local",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: map99,
    prerequisiteVariant: variant,
  });
  check(`Früher STOP ${variant} bildet tatsächlich einen geschlossenen 98→99-Recordgraph`, true);
}
const stop30Variant = "stop-after-30-function-checkpoint";
const stop30Roles = literalPrerequisites("99-final-checkpoint", stop30Variant);
const stop30Prerequisites = Object.fromEntries(stop30Roles.map((role) => [role, HASH_A]));
check("99 unterscheidet Deploy fehlgeschlagen von Deploy ok/Marker fehlgeschlagen literal",
  remote.validateEvidenceRecord(baseRecord({
    role: "99-final-checkpoint",
    state: "checkpoint",
    facts: {
      reasonCode: "FINAL_CHECKPOINT",
      lastSuccessfulRole: "30-function-checkpoint",
      stopReasonCode: "FUNCTION_MARKER_FAILED",
      remoteEffectState: "function-deployed-marker-missing",
    },
    prerequisites: stop30Prerequisites,
    variant: stop30Variant,
  })).facts.stopReasonCode === "FUNCTION_MARKER_FAILED");
expectStop("99 blockiert freie STOP-Texte und unkorrelierte Wirkungsbehauptungen", () =>
  remote.validateEvidenceRecord(baseRecord({
    role: "99-final-checkpoint",
    state: "checkpoint",
    facts: {
      reasonCode: "FINAL_CHECKPOINT",
      lastSuccessfulRole: "30-function-checkpoint",
      stopReasonCode: "beliebiger Text",
      remoteEffectState: "alles ok",
    },
    prerequisites: stop30Prerequisites,
    variant: stop30Variant,
  })), "INVALID_FINAL_CHECKPOINT");
expectStop("99 kann keine andere STOP-Variante als sein 98-Vorgänger behaupten", () => {
  const cleanupRecord = baseRecord({
    role: "98-credential-cleanup",
    state: "ok",
    facts: successFacts("98-credential-cleanup"),
    prerequisites: { "00-contract": fixture["00-contract"].digest },
    variant: "stop-after-00-contract",
    executorSummary: executor("cleanup-fs"),
  });
  remote.collectPrerequisiteDigests({
    role: "99-final-checkpoint",
    mode: "cleanup-local",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: {
      "00-contract": fixture["00-contract"],
      "10-read-preflight": fixture["10-read-preflight"],
      "98-credential-cleanup": makeItem(cleanupRecord),
    },
    prerequisiteVariant: "stop-after-10-read-preflight",
  });
}, "CLEANUP_VARIANT_MISMATCH");
for (const role of LITERAL_ROLES) {
  check(`Evidence-Schema validiert Pflichtfacts für ${role}`,
    remote.validateEvidenceRecord(fixture[role].record) === fixture[role].record);
  const map = subsetForRole(fixture, role);
  const result = remote.collectPrerequisiteDigests({
    role,
    mode: literalMode(role),
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: map,
  });
  check(`Evidencegraph bindet vollständige Kanten für ${role}`,
    JSON.stringify(result.prerequisites) === JSON.stringify(fixture[role].record.prerequisites));
}

const contractRecord = fixture["00-contract"].record;
expectStop("Contractrecord mit leeren Facts wird im Lese-/Validierungsweg blockiert", () =>
  remote.validateEvidenceRecord({ ...contractRecord, facts: {} }));
expectStop("Contractrecord mit fremden Facts wird blockiert", () =>
  remote.validateEvidenceRecord({ ...contractRecord, facts: { ...contractRecord.facts, rawLog: "x" } }));
expectStop("Generische Success-Felder ohne internen Executorbeleg erzeugen keinen Erfolg", () =>
  remote.makeSuccessEvidence({
    role: "10-read-preflight",
    mode: "read-preflight",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: subsetForRole(fixture, "10-read-preflight"),
    facts: { remoteTargetDigest: TARGET_DIGEST },
    proof: { summary: executor("supabase-functions-list") },
  }), "EXECUTOR_PROVENANCE_REQUIRED");

const pending10Record = baseRecord({
  role: "10-read-preflight",
  state: "pending",
  facts: {
    reasonCode: "REMOTE_PAYLOAD_PENDING",
    remotePayloadStatus: "REMOTE_PAYLOAD_PENDING",
  },
  prerequisites: { "00-contract": fixture["00-contract"].digest },
});
expectStop("Pending-10 ist terminal und kann niemals Prerequisite der grünen 11 werden", () =>
  remote.collectPrerequisiteDigests({
    role: "11-function-preimage",
    mode: "read-preflight",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: {
      "00-contract": fixture["00-contract"],
      "10-read-preflight": makeItem(pending10Record),
    },
  }), "REMOTE_PAYLOAD_PENDING");

const proofPrerequisites = { "00-contract": fixture["00-contract"].digest };
const proofFacts = { remoteTargetDigest: TARGET_DIGEST };
const literalExecutorProof = {
  type: "fresh-executor-proof",
  role: "10-read-preflight",
  mode: "read-preflight",
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  targetId: TARGET_ID,
  operation: "supabase-functions-list",
  prerequisitesDigest: sha256(independentCanonicalBytes(proofPrerequisites)),
  factsDigest: sha256(independentCanonicalBytes({
    ...proofFacts,
    executorOperation: "supabase-functions-list",
  })),
  outputDigest: HASH_D,
  summary: executor("supabase-functions-list"),
};
check("Executorproof bindet unabhängig Rolle/Mode/Run/Commit/Target/Prerequisites/Facts/Output",
  remote.validateExecutorProofBinding(literalExecutorProof, {
    role: "10-read-preflight",
    mode: "read-preflight",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    prerequisites: proofPrerequisites,
    facts: proofFacts,
  }).trusted === false);
for (const [name, mutate] of [
  ["cross-run", (proof) => { proof.runId = `kinodreieck-e17b-${FINAL_COMMIT}-fedcba9876543210`; }],
  ["cross-role", (proof) => { proof.role = "11-function-preimage"; }],
  ["cross-record", (proof) => { proof.factsDigest = HASH_A; }],
  ["cross-output", (proof) => { proof.outputDigest = HASH_A; }],
]) {
  const proof = structuredClone(literalExecutorProof);
  mutate(proof);
  expectStop(`Executorproof blockiert ${name}-Replay`, () =>
    remote.validateExecutorProofBinding(proof, {
      role: "10-read-preflight",
      mode: "read-preflight",
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      prerequisites: proofPrerequisites,
      facts: proofFacts,
    }), "EXECUTOR_PROOF_OBJECT_MISMATCH");
}

const exact10Map = subsetForRole(fixture, "10-read-preflight");
expectStop("Fehlendes Prerequisite wird blockiert", () => remote.collectPrerequisiteDigests({
  role: "10-read-preflight",
  mode: "read-preflight",
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  evidenceByRole: {},
}));
expectStop("Extra Prerequisite wird blockiert", () => remote.collectPrerequisiteDigests({
  role: "10-read-preflight",
  mode: "read-preflight",
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  evidenceByRole: { ...exact10Map, foreign: fixture["00-contract"] },
}));
expectStop("Substituierter Map-Key/record.role wird blockiert", () => remote.collectPrerequisiteDigests({
  role: "10-read-preflight",
  mode: "read-preflight",
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  evidenceByRole: { "00-contract": { ...fixture["00-contract"], record: fixture["10-read-preflight"].record } },
}));
expectStop("Substituierter Digest wird blockiert", () => remote.collectPrerequisiteDigests({
  role: "10-read-preflight",
  mode: "read-preflight",
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  evidenceByRole: { "00-contract": { ...fixture["00-contract"], digest: HASH_A } },
}));
expectStop("Prerequisite aus fremdem target/finalCommit/runId-Objekt wird blockiert", () => {
  const record = {
    ...fixture["00-contract"].record,
    targetId: "supabase:fremd",
    finalCommit: OTHER_COMMIT,
    runId: `kinodreieck-e17b-${OTHER_COMMIT}-0123456789abcdef`,
  };
  remote.collectPrerequisiteDigests({
    role: "10-read-preflight",
    mode: "read-preflight",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: { "00-contract": makeItem(record) },
  });
});
expectStop("Substituierte Record-Prerequisite wird blockiert", () => {
  const record = {
    ...fixture["11-function-preimage"].record,
    prerequisites: { ...fixture["11-function-preimage"].record.prerequisites, "00-contract": HASH_B },
  };
  const item = makeItem(record);
  remote.collectPrerequisiteDigests({
    role: "12-db-preimage",
    mode: "read-preflight",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: {
      ...subsetForRole(fixture, "12-db-preimage"),
      "11-function-preimage": item,
    },
  });
});

const ownerInspection = remote.inspectOwnerCheckpoint({
  mode: "function-release",
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  checkpoint: fixture["30-function-checkpoint"].record,
  evidenceByRole: subsetForRole(fixture, "30-function-checkpoint"),
});
check("Owner-Checkpoint-Inspektion bindet das exakte 11-Objekt und Digest",
  ownerInspection.preimageRole === "11-function-preimage"
    && ownerInspection.preimageDigest === fixture["11-function-preimage"].digest
    && ownerInspection.receiptType === "owner-gate-receipt"
    && ownerInspection.gateReceiptDigest
      === fixture["30-function-checkpoint"].record.facts.gateReceiptDigest
    && ownerInspection.prerequisitesDigest === sha256(independentCanonicalBytes(
      fixture["30-function-checkpoint"].record.prerequisites,
    ))
    && ownerInspection.trusted === false);
const dbReceiptInspection = remote.inspectOwnerCheckpoint({
  mode: "db-apply",
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  checkpoint: fixture["40-db-checkpoint"].record,
  evidenceByRole: subsetForRole(fixture, "40-db-checkpoint"),
});
check("DB-Gate-Receipt bindet intern exakt den tatsächlichen Digest von 12",
  dbReceiptInspection.preimageRole === "12-db-preimage"
    && dbReceiptInspection.preimageDigest === fixture["12-db-preimage"].digest
    && dbReceiptInspection.prerequisitesDigest === sha256(independentCanonicalBytes(
      fixture["40-db-checkpoint"].record.prerequisites,
    ))
    && dbReceiptInspection.roleGraphDigest === sha256(independentCanonicalBytes({
      role: "40-db-checkpoint",
      mode: "db-apply",
      prerequisites: fixture["40-db-checkpoint"].record.prerequisites,
      facts: fixture["40-db-checkpoint"].record.facts,
    }))
    && dbReceiptInspection.receiptType === "owner-gate-receipt"
    && dbReceiptInspection.trusted === false);
let ownerOptionsProxyTrapCalls = 0;
const ownerOptionsProxy = new Proxy({}, {
  get() { ownerOptionsProxyTrapCalls += 1; return undefined; },
  ownKeys() { ownerOptionsProxyTrapCalls += 1; return []; },
  getOwnPropertyDescriptor() { ownerOptionsProxyTrapCalls += 1; return undefined; },
});
expectStop("Owner-Evidenceoptionen blockieren Proxy vor Propertyzugriff", () =>
  remote.inspectOwnerCheckpoint(ownerOptionsProxy), "SECRET_GUARD_UNINSPECTABLE");
check("Owner-Evidenceproxy löste keinen Trap aus", ownerOptionsProxyTrapCalls === 0);
let dbPrewriteProxyTrapCalls = 0;
const dbPrewriteProxy = new Proxy({}, {
  get() { dbPrewriteProxyTrapCalls += 1; return undefined; },
  ownKeys() { dbPrewriteProxyTrapCalls += 1; return []; },
  getOwnPropertyDescriptor() { dbPrewriteProxyTrapCalls += 1; return undefined; },
});
expectStop("DB-Prewrite blockiert Proxy vor Spread/Optional-Chaining/Propertyzugriff", () =>
  remote.validateDbPrewrite(dbPrewriteProxy), "SECRET_GUARD_UNINSPECTABLE");
check("DB-Prewrite-Proxy löste keinen Trap aus", dbPrewriteProxyTrapCalls === 0);
for (const [name, invoke] of [
  ["DB-Sink", (value) => remote.authorizeDbMutationSink(value)],
  ["Supabase-Sink", (value) => remote.buildSupabaseLaunch(value)],
  ["Secret-Child-Sink", (value) => remote.buildChildEnvironment(value)],
  ["DB-Argv-Sink", (value) => remote.buildPgArgv("db-apply", value)],
]) {
  let trapCalls = 0;
  const value = new Proxy({}, {
    get() { trapCalls += 1; return undefined; },
    ownKeys() { trapCalls += 1; return []; },
    getOwnPropertyDescriptor() { trapCalls += 1; return undefined; },
  });
  expectStop(`${name} blockiert Proxy vor jeder Trustoperation`, () => invoke(value),
  "SECRET_GUARD_UNINSPECTABLE");
  check(`${name}-Proxy löste keinen Trap aus`, trapCalls === 0);
}
let inheritedOwnerGetterCalls = 0;
const inheritedOwnerOptions = Object.create({
  get mode() {
    inheritedOwnerGetterCalls += 1;
    return "function-release";
  },
});
expectStop("Owner-Inspektion blockiert geerbte Getter vor Ausführung", () =>
  remote.inspectOwnerCheckpoint(inheritedOwnerOptions), "SECRET_GUARD_UNINSPECTABLE");
check("Geerbter Owner-Getter wurde nicht ausgeführt", inheritedOwnerGetterCalls === 0);
expectStop("Passende Ownerfelder ohne interne Gate-Provenienz autorisieren nie", () =>
  remote.validateOwnerCheckpoint({
    mode: "function-release",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    checkpoint: fixture["30-function-checkpoint"].record,
    evidenceByRole: subsetForRole(fixture, "30-function-checkpoint"),
    ownerGate: { gateReceiptDigest: ownerInspection.gateReceiptDigest },
  }), "OWNER_GATE_PROVENANCE_REQUIRED");
expectStop("Callergewählter unvollständiger Owner-Prerequisitesatz stoppt", () =>
  remote.inspectOwnerCheckpoint({
    mode: "function-release",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    checkpoint: fixture["30-function-checkpoint"].record,
    evidenceByRole: { "11-function-preimage": fixture["11-function-preimage"] },
  }));
expectStop("Copied Owner-Checkpoint mit fremdem Preimagedigest stoppt", () =>
  remote.inspectOwnerCheckpoint({
    mode: "function-release",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    checkpoint: {
      ...fixture["30-function-checkpoint"].record,
      facts: { ...fixture["30-function-checkpoint"].record.facts, preimageDigest: HASH_B },
    },
    evidenceByRole: subsetForRole(fixture, "30-function-checkpoint"),
  }));
expectStop("DB-Prewrite akzeptiert kein callergebautes Gate und keine behauptete Frische", () =>
  remote.validateDbPrewrite({
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    checkpoint: fixture["40-db-checkpoint"].record,
    evidenceByRole: subsetForRole(fixture, "40-db-checkpoint"),
    ownerGate: {},
    freshness: "now",
  }), "OWNER_GATE_PROVENANCE_REQUIRED");

for (const [name, mutate] of [
  ["31 fremder Buildcommit", (record) => { record.facts.buildCommit = OTHER_COMMIT; }],
  ["31 fremder Markercommit", (record) => { record.facts.markerCommit = OTHER_COMMIT; }],
  ["32 HTTP 500", (record) => { record.facts.statusCode = 500; }],
  ["32 ready vor DB", (record) => { record.facts.capability = "ready"; }],
  ["32 unauthentifiziert", (record) => { record.facts.authStatus = "anonymous"; }],
  ["32 fremder Buildcommit", (record) => { record.facts.buildCommit = OTHER_COMMIT; }],
]) {
  const role = name.startsWith("31") ? "31-function-apply" : "32-function-postflight";
  const record = structuredClone(fixture[role].record);
  mutate(record);
  expectStop(`${name} stoppt rollenbezogene Erfolgsfacts`, () => remote.validateEvidenceRecord(record));
}
const missingFinalHealth = structuredClone(fixture["42-db-postflight"].record);
delete missingFinalHealth.facts.capability;
expectStop("42 blockiert fehlenden zweiten authentifizierten Final-Health", () =>
  remote.validateEvidenceRecord(missingFinalHealth), "INVALID_SUCCESS_FACTS");
const foreignFinalHealth = structuredClone(fixture["90-remote-delta"].record);
foreignFinalHealth.facts.buildCommit = OTHER_COMMIT;
expectStop("90 blockiert zweiten Health eines fremden Builds", () =>
  remote.validateEvidenceRecord(foreignFinalHealth), "FINAL_HEALTH_OR_DELTA_DRIFT");

const canonicalMap = subsetForRole(fixture, "23-canonical-detail");
for (const fact of [
  "publicSnapshotIdSha256",
  "migrationsSnapshotIdSha256",
  "authSnapshotIdSha256",
  "canonicalSourceSnapshotIdSha256",
]) {
  const record = structuredClone(fixture["20-backup-manifest"].record);
  record.facts[fact] = HASH_B;
  expectStop(`Backupmanifest stoppt fremde Snapshot-ID: ${fact}`, () =>
    remote.validateEvidenceRecord(record), "SNAPSHOT_OBJECT_MISMATCH");
}
const badCanonicalRecord = structuredClone(fixture["22-canonical-detail"].record);
badCanonicalRecord.facts.rowCountSetSha256 = HASH_A;
const badCanonicalItem = makeItem(badCanonicalRecord);
expectStop("Abweichender rowCountSetSha256 stoppt im tatsächlichen Evidencegraph", () =>
  remote.collectPrerequisiteDigests({
    role: "23-canonical-detail",
    mode: "backup-restore",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: { ...canonicalMap, "22-canonical-detail": badCanonicalItem },
  }), "CANONICAL_EVIDENCE_MISMATCH");
check("rowCountSetSha256 bleibt als exakter kanonischer Fact zulässig",
  remote.validateEvidenceRecord(fixture["21-restore-proof"].record) === fixture["21-restore-proof"].record);
for (const fact of [
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
]) {
  const record = structuredClone(fixture["22-canonical-detail"].record);
  record.facts[fact] = record.facts[fact] === HASH_A ? HASH_B : HASH_A;
  expectStop(`Evidencegraph stoppt Mutation jedes Canonical-Facts: ${fact}`, () =>
    remote.collectPrerequisiteDigests({
      role: "23-canonical-detail",
      mode: "backup-restore",
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      evidenceByRole: { ...canonicalMap, "22-canonical-detail": makeItem(record) },
    }));
}

const pairedDrift42 = structuredClone(fixture["42-db-postflight"].record);
pairedDrift42.facts.nonTargetDataSha256 = HASH_B;
const pairedDrift42Item = makeItem(pairedDrift42);
const pairedDrift90 = structuredClone(fixture["90-remote-delta"].record);
pairedDrift90.facts.nonTargetDataSha256 = HASH_B;
pairedDrift90.prerequisites["42-db-postflight"] = pairedDrift42Item.digest;
const pairedDrift90Item = makeItem(pairedDrift90);
expectStop("42 und 90 können denselben fremden Hash nicht gemeinsam gegen die Prewrite-Baseline binden", () =>
  remote.collectPrerequisiteDigests({
    role: "91-rollback-plan",
    mode: "postflight",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    evidenceByRole: {
      ...subsetForRole(fixture, "91-rollback-plan"),
      "42-db-postflight": pairedDrift42Item,
      "90-remote-delta": pairedDrift90Item,
    },
  }), "POSTWRITE_BASELINE_MISMATCH");

for (const fact of [
  "structureSha256", "tableSetSha256", "rowCountSetSha256", "rlsSha256", "aclSha256",
  "nonTargetDataSha256", "nonTargetKeysSha256", "nonTargetFlagsSha256",
  "ledgerCount", "targetCount", "statusCode", "authStatus", "buildCommit", "capability",
]) {
  const record = structuredClone(fixture["42-db-postflight"].record);
  const current = record.facts[fact];
  record.facts[fact] = typeof current === "string" && /^[0-9a-f]{64}$/.test(current)
    ? (current === HASH_A ? HASH_B : HASH_A)
    : typeof current === "number" ? current + 1 : `${current}-drift`;
  expectStop(`42/90-Graph stoppt Postwrite-Mutation: ${fact}`, () =>
    remote.collectPrerequisiteDigests({
      role: "91-rollback-plan",
      mode: "postflight",
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      evidenceByRole: {
        ...subsetForRole(fixture, "91-rollback-plan"),
        "42-db-postflight": makeItem(record),
      },
    }));
}
const canonicalRows = [
  {
    table: "public.kd_ai_limits",
    rowCount: 0,
    dataSha256: HASH_A,
    nonTargetDataSha256: HASH_B,
    nonTargetKeysSha256: HASH_C,
    nonTargetFlagsSha256: HASH_D,
  },
  {
    table: "supabase_migrations.schema_migrations",
    rowCount: 35,
    dataSha256: HASH_B,
    nonTargetDataSha256: HASH_C,
    nonTargetKeysSha256: HASH_D,
    nonTargetFlagsSha256: HASH_A,
  },
];
const literalCanonicalCategories = [
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
];
const literalCategorySetSha256 = sha256(Buffer.from(literalCanonicalCategories.join("\n")));
const canonicalTableSetSha256 = sha256(Buffer.from(
  canonicalRows.map(({ table }) => table).join("\n"),
));
const canonicalHeaderLines = [
  "E17B_SIDE|source",
  ...literalCanonicalCategories.map((category) => `E17B_CATEGORY|${category}`),
  `E17B_CATEGORY_SET|${literalCategorySetSha256}`,
  `E17B_STRUCTURE|${HASH_C}`,
  `E17B_TABLE_SET|${canonicalTableSetSha256}`,
  `E17B_AUTH_ID_SET|${HASH_A}`,
  `E17B_LEDGER_HISTORY|${HASH_D}`,
  `E17B_LEDGER_ROWS|${HASH_B}`,
  "E17B_LEDGER_STATE|35|0",
  `E17B_RLS|${HASH_C}`,
  `E17B_ACL|${HASH_D}`,
];
const canonicalOutput = Buffer.from([
  ...canonicalHeaderLines,
  ...canonicalRows.map((row) => [
    "E17B_CANONICAL",
    row.table,
    row.rowCount,
    row.dataSha256,
    row.nonTargetDataSha256,
    row.nonTargetKeysSha256,
    row.nonTargetFlagsSha256,
  ].join("|")),
  "E17B_TARGET_JSON|<NULL>|<NULL>|<NULL>",
  "",
].join("\n"));
const parsedCanonical = remote.parseCanonicalProjectionOutput(canonicalOutput, { side: "source" });
check("Canonical-Parser leitet erlaubte Hashfacts ohne Zeilenwerte ab",
  parsedCanonical.side === "source"
    && parsedCanonical.facts.categorySetSha256 === literalCategorySetSha256
    && parsedCanonical.facts.structureSha256 === HASH_C
    && parsedCanonical.facts.tableSetSha256 === canonicalTableSetSha256
    && parsedCanonical.facts.rowCountSetSha256 === sha256(Buffer.from(JSON.stringify(
      canonicalRows.map(({ table, rowCount }) => ({ table, rowCount })),
    )))
    && parsedCanonical.facts.dataHashSetSha256 === sha256(Buffer.from(JSON.stringify(
      canonicalRows.map(({ table, dataSha256 }) => ({ table, dataSha256 })),
    )))
    && parsedCanonical.facts.authIdSetSha256 === HASH_A
    && parsedCanonical.facts.ledgerHistorySha256 === HASH_D
    && parsedCanonical.facts.ledgerRowsSha256 === HASH_B
    && parsedCanonical.facts.ledgerCount === 35
    && parsedCanonical.facts.targetCount === 0
    && parsedCanonical.facts.rlsSha256 === HASH_C
    && parsedCanonical.facts.aclSha256 === HASH_D
    && parsedCanonical.tableCount === 2
    && parsedCanonical.trusted === false);
expectStop("Canonical-Parser stoppt umgeordnete Tabellenmarker", () =>
  remote.parseCanonicalProjectionOutput(Buffer.from([
    ...canonicalHeaderLines,
    ...canonicalRows.slice().reverse().map((row) => [
      "E17B_CANONICAL", row.table, row.rowCount, row.dataSha256,
      row.nonTargetDataSha256, row.nonTargetKeysSha256, row.nonTargetFlagsSha256,
    ].join("|")),
    "E17B_TARGET_JSON|<NULL>|<NULL>|<NULL>",
    "",
  ].join("\n")), { side: "source" }), "INVALID_CANONICAL_PROTOCOL");
expectStop("Canonical-Parser stoppt substituierten Tabellenmengenhash", () =>
  remote.parseCanonicalProjectionOutput(Buffer.from(
    canonicalOutput.toString("utf8").replace(canonicalTableSetSha256, HASH_D),
  ), { side: "source" }), "CANONICAL_TABLE_SET_MISMATCH");
expectStop("Canonical-Parser stoppt entfernte Canonical-Kategorie", () =>
  remote.parseCanonicalProjectionOutput(Buffer.from(
    canonicalOutput.toString("utf8").replace("E17B_CATEGORY|view-definition\n", ""),
  ), { side: "source" }), "INVALID_CANONICAL_PROTOCOL");
expectStop("Canonical-Parser stoppt behaupteten Postwrite-Zielzustand auf SOURCE", () =>
  remote.parseCanonicalProjectionOutput(Buffer.from(
    canonicalOutput.toString("utf8").replace(
      "E17B_TARGET_JSON|<NULL>|<NULL>|<NULL>",
      "E17B_TARGET_JSON|klein|2048|5",
    ),
  ), { side: "source" }), "CANONICAL_TARGET_STATE_MISMATCH");
expectStop("Frei identische Source/Restore-Hashsets besitzen keine Canonical-Provenienz", () =>
  remote.validateCanonicalEvidenceGate({
    evidenceByRole: {
      "21-restore-proof": fixture["21-restore-proof"],
      "22-canonical-detail": fixture["22-canonical-detail"],
      "23-canonical-detail": fixture["23-canonical-detail"],
    },
    canonicalGate: { sourceArtifactDigest: HASH_A, restoreArtifactDigest: HASH_A },
  }), "CANONICAL_PROVENANCE_REQUIRED");

expectStop("REMOTE_PAYLOAD_PENDING kann nicht durch Caller-Tupel aufgehoben werden", () =>
  remote.parseRemoteReadPreflightPayload(Buffer.from('{"host":"example.invalid","port":6543,"user":"u"}'), {
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
  }), "REMOTE_PAYLOAD_PENDING");
const LITERAL_SNAPSHOT_ID = "00000003-0000001B-1";
const keeperSql = remote.buildSnapshotKeeperSql();
const authProjectionSql = remote.describeAuthProjectionSql().sqlTemplate;
const canonicalSourceSql = remote.describeCanonicalProjectionSql({ side: "source" }).sqlTemplate;
const canonicalRestoreSql = remote.buildCanonicalProjectionSql({ side: "restore" });
check("Snapshot-Keeper ist read-only und exportiert genau das eigene Markerprotokoll",
  keeperSql.includes("REPEATABLE READ READ ONLY")
    && keeperSql.includes("pg_export_snapshot()")
    && keeperSql.includes("E17B_SNAPSHOT|")
    && !/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(keeperSql));
check("Auth-Snapshot konsumiert exakt dieselbe ID und projiziert ausschließlich auth.users.id",
  authProjectionSql.includes("SET TRANSACTION SNAPSHOT '<SNAPSHOT_CAPABILITY>';" )
    && authProjectionSql.includes("SELECT id::text FROM auth.users")
    && !/email|phone|password|token|metadata/i.test(authProjectionSql));
const literalAuthIds = [
  "00000000-0000-1000-8000-000000000001",
  "00000000-0000-1000-8000-000000000002",
];
const parsedAuthIds = remote.parseAuthIdProjectionOutput(Buffer.from(`${literalAuthIds.join("\n")}\n`));
check("Auth-ID-Parser hasht ausschließlich die C-sortierte ID-Menge semantisch",
  parsedAuthIds.authIdCount === 2
    && parsedAuthIds.authIdSetSha256 === sha256(Buffer.from(literalAuthIds.join("\n")))
    && parsedAuthIds.artifactSha256 === sha256(Buffer.from(`${literalAuthIds.join("\n")}\n`))
    && parsedAuthIds.trusted === false);
expectStop("Auth-ID-Parser stoppt umgeordnete IDs", () =>
  remote.parseAuthIdProjectionOutput(Buffer.from(`${literalAuthIds.slice().reverse().join("\n")}\n`)),
"INVALID_AUTH_ID_PROJECTION");
expectStop("Auth-ID-Parser stoppt NULL-/Leerzeilen", () =>
  remote.parseAuthIdProjectionOutput(Buffer.from(`${literalAuthIds[0]}\n\n${literalAuthIds[1]}\n`)),
"INVALID_PROTOCOL");
check("Canonical SOURCE bindet dieselbe Snapshot-ID; Restore behauptet keine",
  canonicalSourceSql.includes("SET TRANSACTION SNAPSHOT '<SNAPSHOT_CAPABILITY>';" )
    && !canonicalRestoreSql.includes("SET TRANSACTION SNAPSHOT")
    && (canonicalSourceSql.match(/COLLATE \"C\"/g) || []).length >= 10
    && canonicalSourceSql.includes("E17B_AUTH_ID_SET|")
    && canonicalSourceSql.includes("E17B_LEDGER_ROWS|")
    && canonicalSourceSql.includes("relrowsecurity")
    && canonicalSourceSql.includes("relforcerowsecurity")
    && canonicalSourceSql.includes("E17B_ACL|")
    && canonicalSourceSql.includes("pg_default_acl"));
expectStop("Rohe Snapshot-ID erreicht keinen Auth-SQL-Konsumenten", () =>
  remote.buildAuthProjectionSql(LITERAL_SNAPSHOT_ID, {
    finalCommit: FINAL_COMMIT, runId: RUN_ID, targetRuntimeDigest: HASH_A,
  }), "SNAPSHOT_CAPABILITY_REQUIRED");
expectStop("Kopierte Snapshot-Capability erreicht keinen Canonical-Konsumenten", () =>
  remote.buildCanonicalProjectionSql({
    side: "source",
    snapshotCapability: {
      type: "fresh-snapshot-capability",
      snapshotId: LITERAL_SNAPSHOT_ID,
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      targetId: TARGET_ID,
      targetRuntimeDigest: HASH_A,
    },
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    targetRuntimeDigest: HASH_A,
  }), "SNAPSHOT_CAPABILITY_REQUIRED");
expectStop("Snapshot-Capability aus behauptetem fremdem Run ist nicht rehydrierbar", () =>
  remote.buildAuthProjectionSql({
    type: "fresh-snapshot-capability",
    snapshotId: LITERAL_SNAPSHOT_ID,
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID.replace(/[0-9a-f]$/, "f"),
    targetId: TARGET_ID,
    targetRuntimeDigest: HASH_A,
  }, {
    finalCommit: FINAL_COMMIT, runId: RUN_ID, targetRuntimeDigest: HASH_A,
  }), "SNAPSHOT_CAPABILITY_REQUIRED");
const literalRunDir = `/private/tmp/${RUN_ID}`;
const literalRemoteConnection = [
  "--host", "<ATTESTED_HOST>",
  "--port", "<ATTESTED_PORT>",
  "--username", "<ATTESTED_USER>",
  "--dbname", "<ATTESTED_DATABASE>",
  "--no-password",
];
const literalPsql = [
  "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
  ...literalRemoteConnection,
  "--quiet", "--no-align", "--tuples-only",
];
const literalPgContracts = [
  ["snapshot-keeper", "psql", literalPsql],
  ["dump-public", "pg_dump", [
    ...literalRemoteConnection,
    "--format=p", "--snapshot", LITERAL_SNAPSHOT_ID,
    "--schema=public", "--file", join(literalRunDir, "public.sql"),
  ]],
  ["dump-migrations", "pg_dump", [
    ...literalRemoteConnection,
    "--format=p", "--snapshot", LITERAL_SNAPSHOT_ID,
    "--schema=supabase_migrations", "--file", join(literalRunDir, "supabase_migrations.sql"),
  ]],
  ["dump-roles", "pg_dumpall", [
    "--roles-only", "--no-role-passwords",
    "--host", "<ATTESTED_HOST>", "--port", "<ATTESTED_PORT>",
    "--username", "<ATTESTED_USER>", "--database", "postgres", "--no-password",
    "--file", join(literalRunDir, "roles.sql"),
  ]],
  ["auth-ids", "psql", literalPsql],
  ["canonical-source", "psql", literalPsql],
  ["ledger-pre", "psql", literalPsql],
  ["ledger-post", "psql", literalPsql],
  ["db-apply", "psql", literalPsql],
];
for (const [operation, binaryName, expectedArgv] of literalPgContracts) {
  const contract = remote.describePgArgvContract(operation, {
    runDir: literalRunDir,
    snapshotId: operation.startsWith("dump-") ? LITERAL_SNAPSHOT_ID : undefined,
  });
  check(`PG-Argv-Vertrag entspricht unabhängigem vollständigem Literal: ${operation}`,
    contract.binaryName === binaryName
      && JSON.stringify(contract.argv) === JSON.stringify(expectedArgv)
      && contract.sinkConsumable === false
      && contract.targetPlaceholders === true);
}
check("Public/Migrations/Auth/Canonical-SOURCE binden exakt dieselbe Snapshot-ID",
  literalPgContracts.filter(([operation]) => operation === "dump-public" || operation === "dump-migrations")
    .every(([, , argv]) => argv[argv.indexOf("--snapshot") + 1] === LITERAL_SNAPSHOT_ID)
    && authProjectionSql.includes("<SNAPSHOT_CAPABILITY>")
    && canonicalSourceSql.includes("<SNAPSHOT_CAPABILITY>"));
expectStop("Gemeinsamer Backupplan kann Caller-Target trotz Snapshot-ID nicht branden", () =>
  remote.buildBackupRestoreArgvSet({
    targetBinding: {
      projectId: "bscjgwcntapobyxsiyce",
      targetId: TARGET_ID,
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      connection: { host: "example.invalid", port: 6543, user: "u", database: "db" },
    },
    finalCommit: FINAL_COMMIT,
    runDir: `/private/tmp/${RUN_ID}`,
    snapshotId: LITERAL_SNAPSHOT_ID,
  }), "REMOTE_PAYLOAD_PENDING");
for (const targetBinding of [undefined, {
  projectId: "bscjgwcntapobyxsiyce",
  targetId: TARGET_ID,
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  connection: { host: "example.invalid", port: 6543, user: "u", database: "db" },
}]) {
  expectStop("PG argv besitzt keinen ambienten oder callergebauten Target-Fallback", () =>
    remote.buildPgArgv("ledger-pre", {
      targetBinding,
      finalCommit: FINAL_COMMIT,
      runDir: `/private/tmp/${RUN_ID}`,
    }), "REMOTE_PAYLOAD_PENDING");
}

const sourceText = readFileSync(helperPath, "utf8");
for (const [name, pattern] of [
  ["node:child_process", /node:child_process/],
  ["spawn", /\bspawn(?:Sync)?\b/],
  ["exec", /\bexec(?:File|FileSync|Sync)?\b/],
  ["fetch", /\bfetch\b/],
  ["security", /\bsecurity\b/],
  ["curl", /\bcurl\b/],
  ["jq", /\bjq\b/],
  ["gh", /\bgh\b/],
  ["rm", /\brm\b/],
  ["npx", /\bnpx\b/],
  ["Docker", /\bDocker\b/],
  [".pgpass", /\.pgpass/],
  ["PGPASSFILE", /PGPASSFILE/],
]) {
  check(`Wave-A-Quellvertrag enthält keinen Executor-/Credentialpfad: ${name}`,
    !pattern.test(sourceText));
}
check("Produktionshelper hardcodiert weder Supabase-Host noch Remote-Port/User",
  sourceText.indexOf("db.bscjgwcntapobyxsiyce") < 0
    && !/port\s*:\s*["']5432["']/.test(sourceText)
    && !/user\s*:\s*["']postgres["']/.test(sourceText)
    && !/["']--port["']\s*,\s*["']5432["']/.test(sourceText)
    && !/["']--username["']\s*,\s*["']postgres["']/.test(sourceText));
check("Canonical-SQL belegt Owner, semantische ACLs und alle geforderten Zustandskategorien",
  sourceText.indexOf("pg_get_userbyid(n.nspowner)") >= 0
    && sourceText.indexOf("aclexplode") >= 0
    && sourceText.indexOf('ORDER BY part COLLATE \\"C\\"') >= 0
    && sourceText.indexOf("is_identity") >= 0
    && sourceText.indexOf("identity_generation") >= 0
    && sourceText.indexOf("t.tgenabled") >= 0
    && sourceText.indexOf("pg_get_triggerdef") >= 0
    && sourceText.indexOf("pg_views") >= 0
    && sourceText.indexOf("pg_sequences") >= 0
    && sourceText.indexOf("last_value") >= 0
    && sourceText.indexOf("pg_auth_members") >= 0);
const aclStateExpressions = ["n.nspacl", "c.relacl", "a.attacl", "p.proacl", "t.typacl", "d.defaclacl"]
  .map((acl) => `CASE WHEN ${acl} IS NULL THEN '<DEFAULT>' WHEN cardinality(${acl})=0 THEN '<EMPTY>' ELSE '<EXPLICIT>' END`);
const hasCompleteAclStateBinding = (sql) => aclStateExpressions.every((expression) =>
  sql.includes(expression));
check("ACL-Projektion unterscheidet objekttypübergreifend NULL/Default, leer und explizit",
  hasCompleteAclStateBinding(canonicalRestoreSql));
check("Unabhängiges ACL-Negativorakel wird bei entferntem Function-Defaultmarker rot",
  !hasCompleteAclStateBinding(canonicalRestoreSql.replace(aclStateExpressions[3], "<REMOVED>")));
const membershipProjection = canonicalRestoreSql.slice(
  canonicalRestoreSql.indexOf("FROM pg_auth_members"),
  canonicalRestoreSql.indexOf(") SELECT 'E17B_STRUCTURE|'"),
);
const projectsAllMembershipEdges = (sql) => sql.startsWith("FROM pg_auth_members")
  && sql.includes("JOIN pg_roles role ON role.oid=m.roleid")
  && sql.includes("JOIN pg_roles member ON member.oid=m.member")
  && !/\bWHERE\b/i.test(sql);
check("Membership-Projektion hasht alle Kanten und damit transitive Zwischenrollen vollständig",
  projectsAllMembershipEdges(membershipProjection));
check("Unabhängiges Membership-Negativorakel stoppt einen direkten Allowlist-Kantenfilter",
  !projectsAllMembershipEdges(`${membershipProjection} WHERE member.rolname IN ('authenticated')`));
check("Ledger-Serialisierung ist injektiv und kollisionsfest statt Separatorverkettung",
  sourceText.indexOf("jsonb_build_object('version',version,'name',name,'statements',to_jsonb(statements))") >= 0
    && sourceText.indexOf("array_to_string(statements, E'\\x1f')") < 0);
check("Gefährliche Low-Level-Builder sind nicht öffentlich exportiert",
  !("buildSupabaseArgv" in remote)
    && !("buildMigrationLedgerTransaction" in remote)
    && remote.describeMigrationLedgerTransaction instanceof Function
    && !("buildAuthorizedMigrationLedgerTransaction" in remote));
const rolesCase = sourceText.slice(
  sourceText.indexOf('case "dump-roles"'),
  sourceText.indexOf('case "auth-ids"'),
);
check("Rollen-Dump ist exakt roles-only/no-passwords auf Datenbank postgres",
  rolesCase.includes('"--roles-only"')
    && rolesCase.includes('"--no-role-passwords"')
    && rolesCase.includes('"--database", "postgres"'));
check("Wave A besitzt keinen Erzeuger für Remote/Preimage/Owner/Secret/Executor-Brands",
  !("brandFreshRemoteGitProof" in remote)
    && !("makeRuntimeSecretContext" in remote)
    && !("makeOwnerGate" in remote)
    && !("makeExecutorProof" in remote)
    && !("makeCanonicalGate" in remote)
    && !("makePg17VersionProof" in remote)
    && !("makePg17ServerVersionProof" in remote));
const dbManifestSource = sourceText.slice(
  sourceText.indexOf("const manifestKeys = ["),
  sourceText.indexOf("export function buildPgArgv"),
);
check("DB-Manifest bindet intern Prerequisites, Role-40-Graph, Transaction und volle PG-Attestierung",
  dbManifestSource.includes('"prerequisitesDigest"')
    && dbManifestSource.includes('"role40GraphDigest"')
    && dbManifestSource.includes('"transactionSha256"')
    && dbManifestSource.includes('"pgAttestationDigest"')
    && dbManifestSource.includes('"canonicalRole"')
    && dbManifestSource.includes('"canonicalSide"')
    && dbManifestSource.includes('"canonicalParityDigest"')
    && dbManifestSource.includes("manifest.prerequisitesDigest !== owner.prerequisitesDigest")
    && dbManifestSource.includes("manifest.role40GraphDigest !== owner.roleGraphDigest"));

const selectedPgPath = "/usr/local/opt/postgresql@17/bin/psql";
const pgFs = {
  realpathSync(path) {
    if (path === selectedPgPath) return path;
    const error = new Error("missing candidate");
    error.code = "ENOENT";
    throw error;
  },
  statSync(path) {
    if (path !== selectedPgPath) throw new Error("ungewählte PG-Basis darf nicht statted werden");
    return { isFile: () => true, mode: 0o100755, nlink: 1 };
  },
};
check("PG17-Auswahl akzeptiert eine gültige Basis trotz fehlender ungewählter Alternative",
  remote.selectPgBinary("psql", { fsApi: pgFs }) === selectedPgPath);
check("PG-Versionbeleg akzeptiert ausschließlich eingefrorenes Postgres.app 17.10",
  remote.validatePgVersionOutput("psql", Buffer.from("psql (PostgreSQL) 17.10 (Postgres.app)\n"))
    === "17.10 (Postgres.app)");
expectStop("PG-Versionbeleg stoppt fremden Major", () =>
  remote.validatePgVersionOutput("psql", Buffer.from("psql (PostgreSQL) 16.9\n")));
expectStop("PG-Versionbeleg stoppt fremden 17er Minor/Distribution", () =>
  remote.validatePgVersionOutput("psql", Buffer.from("psql (PostgreSQL) 17.5\n")));
check("E17B friert die vollständige Postgres.app-17.10-Closure auf Primärhashes ein",
  remote.PG17_FROZEN_BASE === "/Applications/Postgres.app/Contents/Versions/17/bin"
    && JSON.stringify(remote.PG17_TOOLCHAIN_SHA256) === JSON.stringify({
      initdb: "6a64e212a6d7b679974dc68c99ae87658d172ed3056893e9e7fc5b9f6257db02",
      pg_ctl: "a1841dc81d4c8afdda433f986a91f315d77a9c9ae1fb33eaf1ce1c645914a0a6",
      pg_dump: "fcf942438ee1844a0ccc029bbce18d69bc94166fa3f9053e3611e65285478209",
      pg_dumpall: "588cedfc296a1acbe2460109c4637418eea12b682bea37d3fa37117c752c2120",
      postgres: "5c346ffb2faad6a6802bbf94af89b29f8ded1cb8faaaeb0af4b7291f9f18298d",
      psql: "e18000996705007127b49872d46551558c98e80a8d0f2b26a67f9128c54689bd",
    }));
const pgToolchainContract = remote.describePg17ToolchainContract({
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  action: "db-apply",
});
check("PG17-Toolchain-Vertrag bindet same-base Closure und separaten Serverbeleg",
  pgToolchainContract.base === "/Applications/Postgres.app/Contents/Versions/17/bin"
    && Object.keys(pgToolchainContract.paths).every((binaryName) =>
      pgToolchainContract.paths[binaryName]
        === `/Applications/Postgres.app/Contents/Versions/17/bin/${binaryName}`)
    && JSON.stringify(pgToolchainContract.versionProbe) === JSON.stringify(["--version"])
    && pgToolchainContract.serverVersionNum === 170010
    && pgToolchainContract.serverVersionProof === "required-after-server-start"
    && pgToolchainContract.sinkConsumable === false);
const literalPgClosureHashes = {
  initdb: "6a64e212a6d7b679974dc68c99ae87658d172ed3056893e9e7fc5b9f6257db02",
  pg_ctl: "a1841dc81d4c8afdda433f986a91f315d77a9c9ae1fb33eaf1ce1c645914a0a6",
  pg_dump: "fcf942438ee1844a0ccc029bbce18d69bc94166fa3f9053e3611e65285478209",
  pg_dumpall: "588cedfc296a1acbe2460109c4637418eea12b682bea37d3fa37117c752c2120",
  postgres: "5c346ffb2faad6a6802bbf94af89b29f8ded1cb8faaaeb0af4b7291f9f18298d",
  psql: "e18000996705007127b49872d46551558c98e80a8d0f2b26a67f9128c54689bd",
};
const literalPgClosureNames = ["initdb", "pg_ctl", "pg_dump", "pg_dumpall", "postgres", "psql"];
function literalPgClosureInput() {
  return {
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    targetId: TARGET_ID,
    action: "db-apply",
    base: "/Applications/Postgres.app/Contents/Versions/17/bin",
    binaries: literalPgClosureNames.map((binaryName, index) => ({
      binaryName,
      path: `/Applications/Postgres.app/Contents/Versions/17/bin/${binaryName}`,
      identity: {
        dev: 1,
        ino: 100 + index,
        mode: 0o100755,
        mtimeMs: 1_723_000_000_000 + index,
        sha256: literalPgClosureHashes[binaryName],
        size: 10_000 + index,
      },
      versionProof: {
        binaryName,
        binaryPath: `/Applications/Postgres.app/Contents/Versions/17/bin/${binaryName}`,
        argv: ["--version"],
        version: "17.10 (Postgres.app)",
        outputDigest: [HASH_A, HASH_B, HASH_C, HASH_D, HASH_A, HASH_B][index],
        finalCommit: FINAL_COMMIT,
        runId: RUN_ID,
        targetId: TARGET_ID,
        action: "db-apply",
      },
    })),
  };
}
const pgClosureObservation = remote.inspectPg17ToolchainObservation(literalPgClosureInput());
check("PG17-Observation bindet sechs beobachtete Identities und Versionsbelege in einen untrusted Digest",
  pgClosureObservation.trusted === false
    && pgClosureObservation.sinkConsumable === false
    && pgClosureObservation.binaries.length === 6
    && /^[0-9a-f]{64}$/.test(pgClosureObservation.closureDigest)
    && pgClosureObservation.binaries.every((entry, index) =>
      entry.binaryName === literalPgClosureNames[index]
        && entry.identity.sha256 === literalPgClosureHashes[entry.binaryName]));
const changedPgClosureInput = literalPgClosureInput();
changedPgClosureInput.binaries[2].identity.mtimeMs += 1;
const changedPgClosureObservation = remote.inspectPg17ToolchainObservation(changedPgClosureInput);
check("PG17-Closure-Digest entsteht aus beobachteten Objekten und nicht nur der Konstantenmap",
  changedPgClosureObservation.closureDigest !== pgClosureObservation.closureDigest);
const incompletePgClosureInput = literalPgClosureInput();
incompletePgClosureInput.binaries.pop();
expectStop("Ein-Datei-/unvollständige PG-Attestierung ist keine Full-Closure", () =>
  remote.inspectPg17ToolchainObservation(incompletePgClosureInput), "PG17_CLOSURE_INCOMPLETE");
const driftedPgClosureInput = literalPgClosureInput();
driftedPgClosureInput.binaries[5].identity.sha256 = HASH_D;
expectStop("Eine driftende Binary stoppt die gesamte PG17-Closure", () =>
  remote.inspectPg17ToolchainObservation(driftedPgClosureInput),
"PG17_CLOSURE_IDENTITY_MISMATCH");
expectStop("Kopierte oder synthetische PG17-Observation kann keinen Productionbrand prägen", () =>
  remote.attestPg17ToolchainClosure(structuredClone(pgClosureObservation), {
    executorProof: {
      closureDigest: pgClosureObservation.closureDigest,
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      targetId: TARGET_ID,
      action: "db-apply",
    },
  }), "PG17_CLOSURE_EXECUTOR_REQUIRED");
expectStop("Synthetic Plattformbinary kann keine echte PG17-Attestierung prägen", () =>
  remote.attestPg17Binary("/Applications/Postgres.app/Contents/Versions/17/bin/psql", {
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    targetId: TARGET_ID,
    action: "db-apply",
    versionProof: {
      type: "pg17-version-executor-proof",
      binaryName: "psql",
      binaryPath: "/Applications/Postgres.app/Contents/Versions/17/bin/psql",
      version: "17.10 (Postgres.app)",
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      targetId: TARGET_ID,
      action: "db-apply",
      outputDigest: HASH_A,
    },
    fsApi: {},
  }), "PG_VERSION_EXECUTOR_REQUIRED");

const lockFixture = Buffer.from(JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "node_modules/supabase": {
      version: "2.109.1",
      integrity: "sha512-N2yP2MHTxOxXBWhfn3poudpJn4pkPosAUo7J/46FTou/l7wOwFi9tox8NSN6HljWkfM0zhwPRimNNGC9XBMoxQ==",
      bin: { supabase: "dist/supabase.js" },
      optionalDependencies: { "@supabase/cli-darwin-arm64": "2.109.1" },
    },
    "node_modules/@supabase/cli-darwin-arm64": {
      version: "2.109.1",
      integrity: "sha512-tkn8tfunyqIL7RE+7DVjg6Ql2cJLPkGgh9cPafp2LbXI0qDgds0TaS+UOTHQEjci8JQXXe2wS00+122ko2QI8A==",
      optional: true,
      os: ["darwin"],
      cpu: ["arm64"],
    },
  },
}), "utf8");
const packageFixture = Buffer.from(JSON.stringify({
  name: "supabase",
  version: "2.109.1",
  bin: { supabase: "dist/supabase.js" },
}), "utf8");
const platformPackageFixture = Buffer.from(JSON.stringify({
  name: "@supabase/cli-darwin-arm64",
  version: "2.109.1",
}), "utf8");
const cliFixture = Buffer.from([
  "#!/usr/bin/env node",
  "const suffix = `${process.platform}-${process.arch}`;",
  "require.resolve(`@supabase/cli-${suffix}/package.json`);",
  "",
].join("\n"), "utf8");
const fixedPlatformCliFixture = Buffer.from(
  "#!/usr/bin/env node\nrequire.resolve('@supabase/cli-darwin-arm64/package.json');\n",
  "utf8",
);
const platformFixture = Buffer.from("synthetic-platform-binary", "utf8");
const repoRoot = dirname(dirname(helperPath));
const cliEntry = join(repoRoot, "node_modules", "supabase", "dist", "supabase.js");
const cliWrapperPath = join(repoRoot, "node_modules", ".bin", "supabase");
const platformRoot = join(repoRoot, "node_modules", "@supabase", "cli-darwin-arm64");
const platformPackagePath = join(platformRoot, "package.json");
const cliLaunchPath = join(platformRoot, "bin", "supabase");
const packagePath = join(repoRoot, "node_modules", "supabase", "package.json");
const lockPath = join(repoRoot, "package-lock.json");
const fakeExecutableStat = Object.freeze({
  isFile: () => true,
  isDirectory: () => false,
  isSymbolicLink: () => false,
  mode: 0o100755,
  uid: process.getuid?.() ?? 0,
  nlink: 1,
  dev: 11,
  ino: 22,
  size: cliFixture.length,
  mtimeMs: 1234,
});
const fakePlatformStat = Object.freeze({
  ...fakeExecutableStat,
  ino: 33,
  size: platformFixture.length,
});
const fakeLockStat = Object.freeze({
  ...fakeExecutableStat,
  mode: 0o100644,
  ino: 35,
  size: lockFixture.length,
});
const fakeLinkStat = Object.freeze({
  ...fakeExecutableStat,
  isFile: () => false,
  isSymbolicLink: () => true,
  mode: 0o120777,
  ino: 21,
});
const fakeDirectoryStat = Object.freeze({
  isFile: () => false,
  isDirectory: () => true,
  isSymbolicLink: () => false,
  mode: 0o40700,
  uid: process.getuid?.() ?? 0,
  nlink: 1,
  dev: 11,
  ino: 44,
  size: 0,
  mtimeMs: 1234,
});
const functionDownloadDir = join(literalRunDir, "function-preimage");
const fakeCliFs = {
  readFileSync(path) {
    if (path === lockPath) return lockFixture;
    if (path === packagePath) return packageFixture;
    if (path === platformPackagePath) return platformPackageFixture;
    if (path === cliEntry || path === cliWrapperPath) return cliFixture;
    if (path === cliLaunchPath) return platformFixture;
    throw new Error(`unerwarteter readFileSync-Pfad: ${path}`);
  },
  realpathSync(path) {
    return path === cliWrapperPath ? cliEntry : path;
  },
  readlinkSync(path) {
    if (path === cliWrapperPath) return "../supabase/dist/supabase.js";
    throw new Error(`unerwarteter readlinkSync-Pfad: ${path}`);
  },
  lstatSync(path) {
    if (path === cliWrapperPath) return fakeLinkStat;
    if (path === repoRoot || path === literalRunDir || path === functionDownloadDir) return fakeDirectoryStat;
    if (path === lockPath) return fakeLockStat;
    return path === cliLaunchPath ? fakePlatformStat : fakeExecutableStat;
  },
  statSync(path) {
    if (path === repoRoot || path === literalRunDir || path === functionDownloadDir) return fakeDirectoryStat;
    if (path === lockPath) return fakeLockStat;
    return path === cliLaunchPath ? fakePlatformStat : fakeExecutableStat;
  },
  readdirSync(path) {
    if (path === functionDownloadDir) return [];
    throw new Error(`unerwarteter readdirSync-Pfad: ${path}`);
  },
};
const cliBinding = remote.validateSupabaseCli({ fsApi: fakeCliFs });
check("Injizierter CLI-Testadapter prägt ausschließlich test-only Provenienz",
  cliBinding.adapterProvenance === "injected-test-only"
    && cliBinding.runtimeAuthorized === false
    && remote.SUPABASE_PLATFORM_SHA256
      === "b7be23f4e211b75c00a3df5fcd1f96f3905983c74ff3189bfc69ad5b0f7132c4");
let cliOptionsProxyTrapCalls = 0;
const cliOptionsProxy = new Proxy({ fsApi: fakeCliFs }, {
  get() { cliOptionsProxyTrapCalls += 1; return undefined; },
  ownKeys() { cliOptionsProxyTrapCalls += 1; return []; },
  getOwnPropertyDescriptor() { cliOptionsProxyTrapCalls += 1; return undefined; },
});
expectStop("CLI-Adapteroptionen blockieren Proxy vor Propertyzugriff", () =>
  remote.validateSupabaseCli(cliOptionsProxy), "SECRET_GUARD_UNINSPECTABLE");
check("CLI-Options-Proxy löste keinen Trap aus", cliOptionsProxyTrapCalls === 0);
const versionBlueprint = remote.buildSupabaseVersionLaunchBlueprint({
  cliBinding,
  fsApi: fakeCliFs,
});
check("Lokale Supabase-Versionprobe ist direkt, telemetriearm und exakt auf --version begrenzt",
  versionBlueprint.executable === cliLaunchPath
    && JSON.stringify(versionBlueprint.argv) === JSON.stringify(["--version"])
    && versionBlueprint.cwd === repoRoot
    && versionBlueprint.env.SUPABASE_TELEMETRY_DISABLED === "1"
    && !("HOME" in versionBlueprint.env)
    && versionBlueprint.shell === false
    && versionBlueprint.attempts === 1
    && remote.validateSupabaseVersionOutput(Buffer.from("2.109.1\n")) === "2.109.1");
expectStop("Lokale Supabase-Versionprobe blockiert fremde Version", () =>
  remote.validateSupabaseVersionOutput(Buffer.from("2.109.2\n")), "SUPABASE_VERSION_MISMATCH");
expectStop("Deserialisierte CLI-Attestierung verliert ihre Runtime-Brand", () =>
  remote.buildSupabaseLaunchBlueprint({
    operation: "functions-list",
    cliBinding: structuredClone(cliBinding),
    finalCommit: FINAL_COMMIT,
    runDir: literalRunDir,
    fsApi: fakeCliFs,
  }), "SUPABASE_CLI_BINDING_REQUIRED");
const launchEmptyPath = remote.buildSupabaseLaunchBlueprint({
  operation: "functions-list",
  cliBinding,
  finalCommit: FINAL_COMMIT,
  runDir: literalRunDir,
  ambientEnv: { PATH: "" },
  fsApi: fakeCliFs,
});
const launchMaliciousPath = remote.buildSupabaseLaunchBlueprint({
  operation: "functions-list",
  cliBinding,
  finalCommit: FINAL_COMMIT,
  runDir: literalRunDir,
  ambientEnv: { PATH: "/tmp/malicious", PGPASSWORD: "ambient-secret" },
  fsApi: fakeCliFs,
});
const downloadBlueprint = remote.buildSupabaseLaunchBlueprint({
  operation: "function-download",
  cliBinding,
  finalCommit: FINAL_COMMIT,
  runDir: literalRunDir,
  fsApi: fakeCliFs,
});
check("Supabase-Launch bindet das attestierte Plattformbinary direkt ohne PATH-Interpreter",
  launchEmptyPath.executable === cliLaunchPath
    && launchEmptyPath.executableRealpath === cliLaunchPath
    && JSON.stringify(launchEmptyPath.argv) === JSON.stringify([
      "functions", "list", "--project-ref", "bscjgwcntapobyxsiyce",
    ])
    && launchEmptyPath.shell === false
    && launchEmptyPath.attempts === 1
    && launchEmptyPath.cliAttestation.platform.sha256 === sha256(platformFixture)
    && launchEmptyPath.cliAttestation.wrapper.sha256 === sha256(cliFixture)
    && launchEmptyPath.cliAttestation.platform.ino === 33);
check("Function-Download läuft read-only im eigenen validierten RunDir statt REPO_ROOT",
  downloadBlueprint.cwd === functionDownloadDir
    && downloadBlueprint.executable === cliLaunchPath
    && JSON.stringify(downloadBlueprint.argv) === JSON.stringify([
      "functions", "download", "ai-task", "--project-ref", "bscjgwcntapobyxsiyce",
    ]));
expectStop("Function-Download stoppt vor Clobber eines nichtleeren RunDirs", () =>
  remote.buildSupabaseLaunchBlueprint({
    operation: "function-download",
    cliBinding,
    finalCommit: FINAL_COMMIT,
    runDir: literalRunDir,
    fsApi: { ...fakeCliFs, readdirSync: () => ["existing"] },
  }), "FUNCTION_DOWNLOAD_DIR_CLOBBER");
check("Leerer und bösartiger ambient PATH ergeben denselben gebundenen Child-PATH",
  launchEmptyPath.env.PATH === dirname(cliLaunchPath)
    && launchMaliciousPath.env.PATH === dirname(cliLaunchPath)
    && !("PGPASSWORD" in launchMaliciousPath.env)
    && launchEmptyPath.env.SUPABASE_TELEMETRY_DISABLED === "1"
    && !("HOME" in launchEmptyPath.env)
    && JSON.stringify(launchEmptyPath.env) === JSON.stringify(launchMaliciousPath.env));
expectStop("Raw Supabase-Token ohne frische Runtime-Secret-Brand erreicht keinen Child-Sink", () =>
  remote.buildSupabaseLaunch({
    operation: "functions-list",
    cliBinding,
    finalCommit: FINAL_COMMIT,
    runDir: literalRunDir,
    accessToken: "synthetic-token",
    fsApi: fakeCliFs,
  }), "RUNTIME_SECRET_CONTEXT_REQUIRED");
expectStop("Abweichende Supabase-Lockversion stoppt", () => remote.parseSupabaseLock(
  Buffer.from(lockFixture.toString("utf8").replace("2.109.1", "2.109.2")),
));
expectStop("Abweichende Supabase-Lockintegrität stoppt", () => remote.parseSupabaseLock(
  Buffer.from(lockFixture.toString("utf8").replace("sha512-N2yP2MHTxOxX", "sha512-AAAAAAAAAAAA")),
));
expectStop("Abweichende Plattform-Lockintegrität stoppt", () => remote.parseSupabaseLock(
  Buffer.from(lockFixture.toString("utf8").replace("sha512-tkn8tfunyqI", "sha512-BBBBBBBBBBBB")),
));
expectStop("Erfundenes festes Plattformliteral ersetzt keinen dynamischen Wrapper", () =>
  remote.validateSupabaseCli({
    fsApi: {
      ...fakeCliFs,
      readFileSync(path) {
        if (path === cliEntry || path === cliWrapperPath) return fixedPlatformCliFixture;
        return fakeCliFs.readFileSync(path);
      },
      statSync(path) {
        if (path === cliEntry || path === cliWrapperPath) {
          return { ...fakeExecutableStat, size: fixedPlatformCliFixture.length };
        }
        return fakeCliFs.statSync(path);
      },
    },
  }), "SUPABASE_CLI_REALPATH");
expectStop("Freies Supabase-Subcommand stoppt", () => remote.validateSupabaseArgv(["db", "push"]));
expectStop("Nicht eingefrorenes --output json stoppt", () => remote.validateSupabaseArgv([
  "functions", "list", "--project-ref", "bscjgwcntapobyxsiyce", "--output", "json",
]));
expectStop("Erfundener JWT-Schalter stoppt", () => remote.validateSupabaseArgv([
  "functions", "deploy", "ai-task", "--project-ref", "bscjgwcntapobyxsiyce", "--no-verify-jwt",
]));
for (const [operation, expected] of [
  ["functions-list", ["functions", "list", "--project-ref", "<ATTESTED_PROJECT>"]],
  ["function-download", ["functions", "download", "ai-task", "--project-ref", "<ATTESTED_PROJECT>"]],
  ["function-deploy", ["functions", "deploy", "ai-task", "--project-ref", "<ATTESTED_PROJECT>"]],
  ["secrets-list", ["secrets", "list", "--project-ref", "<ATTESTED_PROJECT>"]],
  ["secret-set", ["secrets", "set", "KD_FUNCTION_BUILD_VERSION=<ATTESTED_COMMIT>", "--project-ref", "<ATTESTED_PROJECT>"]],
]) {
  const description = remote.describeSupabaseArgvContract(operation);
  check(`Supabase-Describe-API liefert nur nicht sinkfähiges Literal: ${operation}`,
    JSON.stringify(description.argvTemplate) === JSON.stringify(expected)
      && description.sinkConsumable === false
      && description.targetPlaceholders === true);
}
for (const argv of [
  ["functions", "deploy", "ai-task", "--project-ref", "bscjgwcntapobyxsiyce"],
  ["secrets", "set", `KD_FUNCTION_BUILD_VERSION=${FINAL_COMMIT}`, "--project-ref", "bscjgwcntapobyxsiyce"],
]) {
  expectStop("Öffentlicher Validator gibt keine mutierenden Supabase-Argv zurück", () =>
    remote.validateSupabaseArgv(argv), "SUPABASE_COMMAND_REJECTED");
}
for (const operation of ["function-deploy", "secret-set"]) {
  expectStop(`Mutierender ${operation}-Blueprint bleibt ohne volle Runtime-Capability unexportierbar`, () =>
    remote.buildSupabaseLaunchBlueprint({
      operation,
      finalCommit: FINAL_COMMIT,
      cliBinding,
      fsApi: fakeCliFs,
    }), "FUNCTION_SINK_CAPABILITY_REQUIRED");
}
expectStop("Serialisierter/forgierter Sink-Capability-Record autorisiert keinen Deploy-Blueprint", () =>
  remote.buildSupabaseLaunchBlueprint({
    operation: "function-deploy",
    finalCommit: FINAL_COMMIT,
    cliBinding,
    sinkCapability: {
      operation: "function-deploy",
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      targetId: TARGET_ID,
      preimageDigest: HASH_A,
      actionDigest: HASH_B,
      contextDigest: HASH_C,
    },
    fsApi: fakeCliFs,
  }), "FUNCTION_SINK_CAPABILITY_REQUIRED");
const swappedCliFs = {
  ...fakeCliFs,
  statSync(path) {
    return path === cliLaunchPath ? { ...fakePlatformStat, ino: 34 } : fakeCliFs.statSync(path);
  },
};
expectStop("CLI-Inodewechsel zwischen Validierung und Launch-Attestierung stoppt", () =>
  remote.buildSupabaseLaunchBlueprint({
    operation: "functions-list",
    cliBinding,
    finalCommit: FINAL_COMMIT,
    runDir: literalRunDir,
    fsApi: swappedCliFs,
  }), "SUPABASE_CLI_TOCTOU");
const rehashedCliFs = {
  ...fakeCliFs,
  readFileSync(path) {
    if (path === cliLaunchPath) return Buffer.from(`${platformFixture.toString("utf8")}drift`);
    return fakeCliFs.readFileSync(path);
  },
};
expectStop("CLI-Hashwechsel zwischen Validierung und Launch-Attestierung stoppt", () =>
  remote.buildSupabaseLaunchBlueprint({
    operation: "functions-list",
    cliBinding,
    finalCommit: FINAL_COMMIT,
    runDir: literalRunDir,
    fsApi: rehashedCliFs,
  }), "SUPABASE_CLI_TOCTOU");
const redirectedCliFs = {
  ...fakeCliFs,
  realpathSync(path) {
    return path === cliLaunchPath ? join(platformRoot, "bin", "other")
      : fakeCliFs.realpathSync(path);
  },
};
expectStop("CLI-Realpathwechsel zwischen Validierung und Launch-Attestierung stoppt", () =>
  remote.buildSupabaseLaunchBlueprint({
    operation: "functions-list",
    cliBinding,
    finalCommit: FINAL_COMMIT,
    runDir: literalRunDir,
    fsApi: redirectedCliFs,
  }), "SUPABASE_CLI_TOCTOU");
const relinkedCliFs = {
  ...fakeCliFs,
  lstatSync(path) {
    return path === cliWrapperPath ? { ...fakeLinkStat, ino: 99 } : fakeCliFs.lstatSync(path);
  },
};
expectStop("CLI-Symlinkwechsel zwischen Validierung und Launch-Attestierung stoppt", () =>
  remote.buildSupabaseLaunchBlueprint({
    operation: "functions-list",
    cliBinding,
    finalCommit: FINAL_COMMIT,
    runDir: literalRunDir,
    fsApi: relinkedCliFs,
  }), "SUPABASE_CLI_TOCTOU");
const changedLockFs = {
  ...fakeCliFs,
  readFileSync(path) {
    if (path === lockPath) return Buffer.from(`${lockFixture.toString("utf8")} `);
    return fakeCliFs.readFileSync(path);
  },
  statSync(path) {
    return path === lockPath ? { ...fakeLockStat, size: fakeLockStat.size + 1 }
      : fakeCliFs.statSync(path);
  },
};
expectStop("Lockfile-Hashwechsel zwischen CLI-Attestierung und Launch stoppt", () =>
  remote.buildSupabaseLaunchBlueprint({
    operation: "functions-list",
    cliBinding,
    finalCommit: FINAL_COMMIT,
    runDir: literalRunDir,
    fsApi: changedLockFs,
  }), "SUPABASE_CLI_TOCTOU");
const changedPlatformPackageFs = {
  ...fakeCliFs,
  readFileSync(path) {
    if (path === platformPackagePath) return Buffer.from(`${platformPackageFixture.toString("utf8")} `);
    return fakeCliFs.readFileSync(path);
  },
};
expectStop("Plattform-package.json-Hashwechsel zwischen CLI-Attestierung und Launch stoppt", () =>
  remote.buildSupabaseVersionLaunchBlueprint({
    cliBinding,
    fsApi: changedPlatformPackageFs,
  }), "SUPABASE_CLI_TOCTOU");

const secret = "synthetic-secret-marker";
for (const [name, value] of [
  ["String", `prefix-${secret}-suffix`],
  ["Buffer", Buffer.from(`prefix-${secret}-suffix`)],
  ["Uint8Array", new Uint8Array(Buffer.from(`prefix-${secret}-suffix`))],
  ["Array", ["clean", { nested: secret }]],
  ["Plain Object", { a: { b: secret } }],
  ["Error.message", new Error(secret)],
  ["Error.cause", new Error("outer", { cause: new Error(secret) })],
  ["Error.stack", Object.defineProperty(new Error("clean"), "stack", {
    value: `stack:${secret}`,
    enumerable: false,
  })],
  ["Error.reasonCode", Object.assign(new Error("clean"), { reasonCode: secret })],
]) {
  const error = expectStop(`Secretguard prüft rekursiv ${name}`, () =>
    remote.assertNoSecretExposure(value, [secret]));
  check(`Secretguard gibt ${name}-Secret nie in Fehlertext aus`,
    !String(error.message).includes(secret) && !String(error.stack).includes(secret));
}
const nonEnumerableSecret = {};
Object.defineProperty(nonEnumerableSecret, "hidden", { value: secret, enumerable: false });
const prototypeSecret = Object.create(Object.defineProperty({}, secret, {
  value: "clean",
  enumerable: false,
}));
const symbolSecret = { [Symbol(secret)]: "clean" };
const symbolValueSecret = { symbol: Symbol(secret) };
for (const [name, value, reasonCode = "SECRET_EXPOSURE"] of [
  ["non-enumerable Descriptorwert", nonEnumerableSecret],
  ["prototypischer Propertyname", prototypeSecret, "SECRET_GUARD_UNINSPECTABLE"],
  ["Symbolbeschreibung", symbolSecret, "SECRET_GUARD_UNINSPECTABLE"],
  ["Symbolwert", symbolValueSecret, "SECRET_GUARD_UNINSPECTABLE"],
]) {
  expectStop(`Secretguard prüft ${name}`, () =>
    remote.assertNoSecretExposure(value, [secret]), reasonCode);
}
let getterCalls = 0;
const getterObject = {};
Object.defineProperty(getterObject, "safe", {
  enumerable: true,
  get() {
    getterCalls += 1;
    return secret;
  },
});
expectStop("Secretguard blockiert Getter ohne Ausführung", () =>
  remote.assertNoSecretExposure(getterObject, [secret]), "SECRET_GUARD_UNINSPECTABLE");
check("Secretguard hat den Getter nicht ausgeführt", getterCalls === 0);
let setterCalls = 0;
const setterObject = {};
Object.defineProperty(setterObject, "safe", {
  enumerable: true,
  set() {
    setterCalls += 1;
  },
});
expectStop("Secretguard blockiert Setter ohne Ausführung", () =>
  remote.assertNoSecretExposure(setterObject, [secret]), "SECRET_GUARD_UNINSPECTABLE");
check("Secretguard hat den Setter nicht ausgeführt", setterCalls === 0);
let hiddenGetterCalls = 0;
const hiddenGetterObject = {};
Object.defineProperty(hiddenGetterObject, "hidden", {
  enumerable: false,
  get() {
    hiddenGetterCalls += 1;
    return secret;
  },
});
expectStop("Secretguard blockiert nicht enumerierbare Getter ohne Ausführung", () =>
  remote.assertNoSecretExposure(hiddenGetterObject, [secret]), "SECRET_GUARD_UNINSPECTABLE");
check("Nicht enumerierbarer Getter blieb unangetastet", hiddenGetterCalls === 0);
let symbolGetterCalls = 0;
const symbolGetterObject = {};
Object.defineProperty(symbolGetterObject, Symbol("hidden"), {
  enumerable: true,
  get() {
    symbolGetterCalls += 1;
    return secret;
  },
});
expectStop("Secretguard blockiert Symbol-Getter ohne Ausführung", () =>
  remote.assertNoSecretExposure(symbolGetterObject, [secret]), "SECRET_GUARD_UNINSPECTABLE");
check("Symbol-Getter blieb unangetastet", symbolGetterCalls === 0);
let prototypeGetterCalls = 0;
const poisonedPrototype = {};
Object.defineProperty(poisonedPrototype, "reasonCode", {
  get() {
    prototypeGetterCalls += 1;
    return secret;
  },
});
const poisonedPrototypeObject = Object.create(poisonedPrototype);
expectStop("Secretguard verwirft manipulierte Prototypketten ohne Getterausführung", () =>
  remote.assertNoSecretExposure(poisonedPrototypeObject, [secret]), "SECRET_GUARD_UNINSPECTABLE");
check("Prototypischer Getter blieb unangetastet", prototypeGetterCalls === 0);
let toJsonCalls = 0;
const poisonedToJson = {
  toJSON() {
    toJsonCalls += 1;
    return secret;
  },
};
expectStop("Kanonisierung akzeptiert kein manipuliertes toJSON", () =>
  remote.validateExecutorProofBinding({}, {
    role: "10-read-preflight",
    mode: "read-preflight",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    prerequisites: poisonedToJson,
    facts: { remoteTargetDigest: HASH_A },
  }), "SECRET_GUARD_UNINSPECTABLE");
check("Manipuliertes toJSON wurde nie ausgeführt", toJsonCalls === 0);
expectStop("Nachgeschaltete Kanonisierung blockiert Getter ebenfalls ohne Ausführung", () =>
  remote.validateExecutorProofBinding({}, {
    role: "10-read-preflight",
    mode: "read-preflight",
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    prerequisites: getterObject,
    facts: { remoteTargetDigest: HASH_A },
  }), "SECRET_GUARD_UNINSPECTABLE");
check("Auch der Serializer hat den Getter nie ausgeführt", getterCalls === 0);
check("Secretguard akzeptiert secretfreie rekursive Struktur",
  remote.assertNoSecretExposure({ clean: [Buffer.from("ok"), { message: "also ok" }] }, [secret]) === true);

let secretIndexGetterCalls = 0;
const accessorSecrets = [];
Object.defineProperty(accessorSecrets, "0", {
  enumerable: true,
  get() {
    secretIndexGetterCalls += 1;
    return secret;
  },
});
Object.defineProperty(accessorSecrets, "length", { value: 1 });
expectStop("Secretliste blockiert Index-Getter ohne Ausführung", () =>
  remote.assertNoSecretExposure("clean", accessorSecrets), "SECRET_GUARD_UNINSPECTABLE");
check("Secretlisten-Index-Getter blieb unangetastet", secretIndexGetterCalls === 0);

let secretMapGetterCalls = 0;
const shadowMapSecrets = [secret];
Object.defineProperty(shadowMapSecrets, "map", {
  get() {
    secretMapGetterCalls += 1;
    return () => [];
  },
});
expectStop("Secretliste blockiert own map-Shadow ohne Ausführung", () =>
  remote.assertNoSecretExposure("clean", shadowMapSecrets));
check("Secretlisten-map-Getter blieb unangetastet", secretMapGetterCalls === 0);

for (const [name, secretList] of [
  ["sparse", Object.assign(new Array(2), { 1: secret })],
  ["extra", Object.assign([secret], { extra: "clean" })],
  ["Symbol-extra", Object.assign([secret], { [Symbol("extra")]: "clean" })],
  ["Subclass", new (class SecretArray extends Array {})(secret)],
]) {
  expectStop(`Secretliste blockiert ${name}`, () =>
    remote.assertNoSecretExposure("clean", secretList));
}
let secretListProxyTrapCalls = 0;
const proxySecrets = new Proxy([secret], {
  ownKeys() {
    secretListProxyTrapCalls += 1;
    return ["0", "length"];
  },
  getOwnPropertyDescriptor() {
    secretListProxyTrapCalls += 1;
    return undefined;
  },
  get() {
    secretListProxyTrapCalls += 1;
    return undefined;
  },
});
expectStop("Secretliste blockiert Proxy ohne Trap", () =>
  remote.assertNoSecretExposure("clean", proxySecrets), "SECRET_GUARD_UNINSPECTABLE");
check("Secretlisten-Proxy löste keinen Trap aus", secretListProxyTrapCalls === 0);

for (const [name, decorate] of [
  ["own indexOf", (value) => Object.defineProperty(value, "indexOf", { value: () => -1 })],
  ["own toJSON", (value) => Object.defineProperty(value, "toJSON", { value: () => "clean" })],
  ["extra Secret", (value) => Object.defineProperty(value, "extra", { value: secret })],
]) {
  const value = decorate(Buffer.from("clean"));
  expectStop(`Secretguard blockiert Buffer ${name}`, () =>
    remote.assertNoSecretExposure(value, [secret]), "SECRET_GUARD_UNINSPECTABLE");
}
for (const [name, property, value] of [
  ["own buffer", "buffer", new ArrayBuffer(0)],
  ["own byteOffset", "byteOffset", 0],
  ["own byteLength", "byteLength", 0],
]) {
  const bytes = new Uint8Array(Buffer.from("clean"));
  Object.defineProperty(bytes, property, { value });
  expectStop(`Secretguard blockiert Uint8Array ${name}`, () =>
    remote.assertNoSecretExposure(bytes, [secret]), "SECRET_GUARD_UNINSPECTABLE");
}

const functionWithSecret = function harmless() {};
Object.defineProperty(functionWithSecret, "payload", { value: secret, enumerable: true });
expectStop("Secretguard prüft Function-Datawerte ohne Aufruf/Stringifizierung", () =>
  remote.assertNoSecretExposure(functionWithSecret, [secret]), "SECRET_EXPOSURE");
expectStop("Secretguard blockiert auch saubere Funktionen konservativ", () =>
  remote.assertNoSecretExposure(function harmless() {}, [secret]), "SECRET_GUARD_UNINSPECTABLE");
expectStop("Secretguard blockiert Object-own-toJSON ohne Aufruf", () =>
  remote.assertNoSecretExposure({ toJSON() { return secret; } }, [secret]),
"SECRET_GUARD_UNINSPECTABLE");

for (const [name, makeProxy] of [
  ["Record", () => new Proxy({ safe: "clean" }, {})],
  ["Value", () => ({ value: new Proxy({ safe: "clean" }, {}) })],
]) {
  let trapCalls = 0;
  const traps = {
    get() { trapCalls += 1; return undefined; },
    ownKeys() { trapCalls += 1; return []; },
    getOwnPropertyDescriptor() { trapCalls += 1; return undefined; },
    getPrototypeOf() { trapCalls += 1; return null; },
  };
  const value = name === "Record"
    ? new Proxy({ safe: "clean" }, traps)
    : { value: new Proxy({ safe: "clean" }, traps) };
  expectStop(`Secretguard blockiert Proxy-${name} ohne Reflection`, () =>
    remote.assertNoSecretExposure(value, [secret]), "SECRET_GUARD_UNINSPECTABLE");
  check(`Proxy-${name} löste keinen Trap aus`, trapCalls === 0);
}

const originalArrayMap = Array.prototype.map;
const originalArraySome = Array.prototype.some;
const originalArrayIncludes = Array.prototype.includes;
const originalBufferIndexOf = Buffer.prototype.indexOf;
try {
  Array.prototype.map = () => { throw new Error("poisoned map"); };
  Array.prototype.some = () => { throw new Error("poisoned some"); };
  Array.prototype.includes = () => { throw new Error("poisoned includes"); };
  Buffer.prototype.indexOf = () => { throw new Error("poisoned indexOf"); };
  expectStop("Secretguard stoppt bei monkeypatched Sicherheitsintrinsics fail-closed", () =>
    remote.assertNoSecretExposure({ clean: [Buffer.from("ok"), new Uint8Array([1, 2])] }, [secret]),
  "RUNTIME_INTRINSIC_DRIFT");
} finally {
  Array.prototype.map = originalArrayMap;
  Array.prototype.some = originalArraySome;
  Array.prototype.includes = originalArrayIncludes;
  Buffer.prototype.indexOf = originalBufferIndexOf;
}

const intrinsicRemoteGitBytes = Buffer.from(
  `${FINAL_COMMIT}\trefs/heads/codex/e17b-bloganalyse-remote\n`,
);
for (const [name, target, key, replacement, invoke] of [
  ["WeakSet.has kann Secretprüfung nicht vortäuschen", WeakSet.prototype, "has", () => false,
    () => remote.assertNoSecretExposure({ nested: secret }, [secret])],
  ["WeakSet.add kann keine Produktionsbrandgrenze umdeuten", WeakSet.prototype, "add", () => ({}),
    () => remote.assertNoSecretExposure({ clean: "value" }, [secret])],
  ["Set.has kann keine ungültige Mutationsaktion erlauben", Set.prototype, "has", () => true,
    () => remote.describeFreshRemoteGitContract({
      finalCommit: FINAL_COMMIT, runId: RUN_ID, action: "db-action",
    })],
  ["Array.some kann kein mutierendes Function-Argv freigeben", Array.prototype, "some", () => false,
    () => remote.validateSupabaseArgv([
      "functions", "deploy", "ai-task", "--project-ref", "bscjgwcntapobyxsiyce",
    ])],
  ["Array.isArray kann kein mutierendes Function-Argv freigeben", Array, "isArray", () => true,
    () => remote.validateSupabaseArgv({ 0: "functions", 1: "deploy", length: 2 })],
  ["Buffer.from kann FreshRemoteGit-Bytes nicht semantisch ersetzen", Buffer, "from",
    () => Buffer.alloc(0),
    () => remote.parseFreshRemoteGitOutput(intrinsicRemoteGitBytes, {
      finalCommit: FINAL_COMMIT, runId: RUN_ID, action: "db-apply",
    })],
  ["Object.hasOwn kann descriptorbasierte Trustgrenzen nicht umgehen", Object, "hasOwn", () => true,
    () => remote.assertNoSecretExposure({ nested: secret }, [secret])],
  ["Buffer.equals kann keine Byteidentity vortäuschen", Buffer.prototype, "equals", () => true,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["TextDecoder.decode kann Raw-Bytes nicht umdeuten", NodeTextDecoder.prototype, "decode",
    () => `${OTHER_COMMIT}\trefs/heads/codex/e17b-bloganalyse-remote\n`,
    () => remote.parseFreshRemoteGitOutput(intrinsicRemoteGitBytes, {
      finalCommit: FINAL_COMMIT, runId: RUN_ID, action: "db-apply",
    })],
  ["JSON.parse kann keinen Productionbeleg prägen", JSON, "parse", () => ({}),
    () => remote.assertCommit(FINAL_COMMIT)],
  ["RegExp.test kann keinen Commitcheck vortäuschen", RegExp.prototype, "test", () => true,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["String.trim kann keinen Trustinput umdeuten", String.prototype, "trim", () => FINAL_COMMIT,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Set.add driftet vor einer Trustgrenze fail-closed", Set.prototype, "add", () => ({}),
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Map.get driftet vor einer Trustgrenze fail-closed", Map.prototype, "get", () => undefined,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Buffer.isBuffer driftet vor einer Trustgrenze fail-closed", Buffer, "isBuffer", () => false,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Array.map driftet einzeln fail-closed", Array.prototype, "map", () => [],
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Array.filter driftet einzeln fail-closed", Array.prototype, "filter", () => [],
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Array.every driftet einzeln fail-closed", Array.prototype, "every", () => true,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Array.includes driftet einzeln fail-closed", Array.prototype, "includes", () => true,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Array.slice driftet einzeln fail-closed", Array.prototype, "slice", () => [],
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Array.sort driftet einzeln fail-closed", Array.prototype, "sort", () => [],
    () => remote.assertCommit(FINAL_COMMIT)],
  ["Array.push driftet einzeln fail-closed", Array.prototype, "push", () => 0,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["JSON.stringify driftet vor einer Trustgrenze fail-closed", JSON, "stringify", () => "{}",
    () => remote.assertCommit(FINAL_COMMIT)],
  ["String.split driftet einzeln fail-closed", String.prototype, "split", () => [],
    () => remote.assertCommit(FINAL_COMMIT)],
  ["String.startsWith driftet einzeln fail-closed", String.prototype, "startsWith", () => true,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["String.endsWith driftet einzeln fail-closed", String.prototype, "endsWith", () => true,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["String.includes driftet einzeln fail-closed", String.prototype, "includes", () => true,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["String.replace driftet einzeln fail-closed", String.prototype, "replace", () => "",
    () => remote.assertCommit(FINAL_COMMIT)],
  ["String.match driftet einzeln fail-closed", String.prototype, "match", () => null,
    () => remote.assertCommit(FINAL_COMMIT)],
  ["String.charCodeAt driftet einzeln fail-closed", String.prototype, "charCodeAt", () => 0,
    () => remote.assertCommit(FINAL_COMMIT)],
]) {
  const outcome = invokeWhileBuiltinIsPatched(target, key, replacement, invoke);
  checkIntrinsicDrift(name, outcome);
}
expectStop("SQL-Protokollparser koppelt Secretguard vor Output-Parsing", () =>
  remote.parseLedgerProtocol(Buffer.from(secret), { phase: "pre", secrets: [secret] }),
"SECRET_EXPOSURE");
const safeError = remote.safeErrorForOutput(
  Object.assign(new Error("clean"), { stack: `trace:${secret}` }),
  [secret],
);
check("Error-Outputpfad redigiert vor Serialisierung einschließlich stack",
  safeError === "E17B_STOP:REDACTED" && !safeError.includes(secret));
check("Error-Outputpfad übernimmt keine freien Steuerzeichen oder Codes",
  remote.safeErrorForOutput({ reasonCode: "INJECTED\nOUTPUT" }) === "E17B_STOP:ERROR");
check("Error-Outputpfad redigiert beliebige scheinbar gültige Fremdcodes",
  remote.safeErrorForOutput({ reasonCode: "TOPSECRETTOKEN" }) === "E17B_STOP:REDACTED"
    && remote.safeErrorForOutput({ reasonCode: "INVALID_COMMIT" }) === "E17B_STOP:INVALID_COMMIT");
let errorGetterCalls = 0;
const getterError = Object.defineProperty({}, "reasonCode", {
  get() {
    errorGetterCalls += 1;
    return "INVALID_COMMIT";
  },
});
check("Error-Outputpfad liest keine beliebigen Error-Getter",
  remote.safeErrorForOutput(getterError) === "E17B_STOP:REDACTED" && errorGetterCalls === 0);

const localAttestation = remote.attestLocalContract({
  finalCommit: FINAL_COMMIT,
  git: localGitFixture(),
});
check("Injizierter Git-Testadapter prägt keine Produktionsauthorization",
  localAttestation.adapterProvenance === "injected-test-only"
    && localAttestation.runtimeAuthorized === false
    && !/localAttestationBrand\.add\s*\(/.test(sourceText));
check("Contractinput ist intern aus HEAD, cleanem Zielbranch, erlaubter Ref und Raw-Blobs attestiert",
  localAttestation.finalCommit === FINAL_COMMIT
    && localAttestation.branch === "refs/heads/codex/e17b-bloganalyse-remote"
    && localAttestation.allowedRemoteRef === "refs/heads/codex/e17b-bloganalyse-remote"
    && localAttestation.refCommit === FINAL_COMMIT);
check("FreshGit behauptet keinen Remotecommit aus lokalem show-ref",
  localAttestation.localRefCommit === FINAL_COMMIT
    && !("remoteRefCommit" in localAttestation)
    && localAttestation.functionAttestation.localRefCommit === FINAL_COMMIT
    && !("remoteRefCommit" in localAttestation.functionAttestation));

const remoteGitContract = remote.describeFreshRemoteGitContract({
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
  action: "db-apply",
});
check("FreshRemoteGit-Blueprint ist exakt origin/ref-gebunden und nicht sinkfähig",
  remoteGitContract.origin === "origin"
    && remoteGitContract.ref === "refs/heads/codex/e17b-bloganalyse-remote"
    && JSON.stringify(remoteGitContract.argv) === JSON.stringify([
      "ls-remote", "--exit-code", "origin", "refs/heads/codex/e17b-bloganalyse-remote",
    ])
    && remoteGitContract.sinkConsumable === false
    && remoteGitContract.transcriptTrusted === false);
const parsedRemoteGit = remote.parseFreshRemoteGitOutput(
  Buffer.from(`${FINAL_COMMIT}\trefs/heads/codex/e17b-bloganalyse-remote\n`),
  { finalCommit: FINAL_COMMIT, runId: RUN_ID, action: "db-apply" },
);
check("FreshRemoteGit-Parser bindet exakt Commit/Run/Target/Action ohne Trust-Rehydration",
  parsedRemoteGit.finalCommit === FINAL_COMMIT
    && parsedRemoteGit.runId === RUN_ID
    && parsedRemoteGit.targetId === TARGET_ID
    && parsedRemoteGit.action === "db-apply"
    && /^[0-9a-f]{64}$/.test(parsedRemoteGit.outputDigest)
    && parsedRemoteGit.trusted === false);
let remoteProofOptionsProxyTrapCalls = 0;
const remoteProofOptionsProxy = new Proxy({}, {
  get() { remoteProofOptionsProxyTrapCalls += 1; return undefined; },
  ownKeys() { remoteProofOptionsProxyTrapCalls += 1; return []; },
  getOwnPropertyDescriptor() { remoteProofOptionsProxyTrapCalls += 1; return undefined; },
});
expectStop("Remote-Proofoptionen blockieren Proxy vor Propertyzugriff", () =>
  remote.parseFreshRemoteGitOutput(Buffer.alloc(0), remoteProofOptionsProxy),
"SECRET_GUARD_UNINSPECTABLE");
check("Remote-Proofproxy löste keinen Trap aus", remoteProofOptionsProxyTrapCalls === 0);
const functionMutationSequence = remote.describeFunctionMutationSequenceContract({
  finalCommit: FINAL_COMMIT,
  runId: RUN_ID,
});
check("Function-Mutation ist ausschließlich als nicht sinkfähige one-shot Reihenfolge beschrieben",
  functionMutationSequence.action === "function-release"
    && functionMutationSequence.finalCommit === FINAL_COMMIT
    && functionMutationSequence.runId === RUN_ID
    && functionMutationSequence.targetId === TARGET_ID
    && JSON.stringify(functionMutationSequence.remoteProof) === JSON.stringify([
      "origin", "ref", "finalCommit", "runId", "targetId", "action", "outputDigest",
    ])
    && JSON.stringify(functionMutationSequence.steps) === JSON.stringify([
      "fresh-remote-git", "function-deploy", "strict-deploy-success",
      "one-shot-marker-capability", "secret-set",
    ])
    && functionMutationSequence.markerBeforeDeploy === "forbidden"
    && functionMutationSequence.markerReuse === "forbidden"
    && functionMutationSequence.sinkConsumable === false);
for (const [name, output, options] of [
  ["falscher Commit", `${OTHER_COMMIT}\trefs/heads/codex/e17b-bloganalyse-remote\n`, {}],
  ["falscher Ref", `${FINAL_COMMIT}\trefs/heads/main\n`, {}],
  ["zusätzliche Zeile", `${FINAL_COMMIT}\trefs/heads/codex/e17b-bloganalyse-remote\nextra\n`, {}],
  ["fehlende Zeile", "", {}],
  ["cross-run", `${FINAL_COMMIT}\trefs/heads/codex/e17b-bloganalyse-remote\n`, {
    runId: `kinodreieck-e17b-${FINAL_COMMIT}-fedcba9876543210`,
  }],
  ["cross-action", `${FINAL_COMMIT}\trefs/heads/codex/e17b-bloganalyse-remote\n`, {
    action: "function-release",
  }],
]) {
  expectStop(`FreshRemoteGit blockiert ${name}`, () => remote.parseFreshRemoteGitOutput(
    Buffer.from(output),
    {
      finalCommit: FINAL_COMMIT,
      runId: RUN_ID,
      action: "db-apply",
      ...options,
      expectedRunId: RUN_ID,
      expectedAction: "db-apply",
    },
  ));
}
expectStop("Serialisierte FreshRemoteGit-Capability autorisiert keinen DB-Sink", () =>
  remote.authorizeDbMutationSink({
    freshRemoteGit: structuredClone(parsedRemoteGit),
    finalCommit: FINAL_COMMIT,
    runId: RUN_ID,
    action: "db-apply",
  }), "FRESH_REMOTE_GIT_REQUIRED");
for (const [name, options] of [
  ["fremder HEAD", { head: OTHER_COMMIT }],
  ["Dirty-State", { status: "?? injected.txt\n" }],
  ["falscher Branch", { branch: "refs/heads/main" }],
  ["fremdes Ref-Objekt", { refCommit: OTHER_COMMIT }],
]) {
  expectStop(`Lokale Contractattestierung stoppt ${name}`, () => remote.attestLocalContract({
    finalCommit: FINAL_COMMIT,
    git: localGitFixture(options),
  }));
}
let gitOptionsProxyTrapCalls = 0;
const gitOptionsProxy = new Proxy({ finalCommit: FINAL_COMMIT, git: localGitFixture() }, {
  get() { gitOptionsProxyTrapCalls += 1; return undefined; },
  ownKeys() { gitOptionsProxyTrapCalls += 1; return []; },
  getOwnPropertyDescriptor() { gitOptionsProxyTrapCalls += 1; return undefined; },
});
expectStop("Git-Adapteroptionen blockieren Proxy vor Propertyzugriff", () =>
  remote.attestLocalContract(gitOptionsProxy), "SECRET_GUARD_UNINSPECTABLE");
check("Git-Options-Proxy löste keinen Trap aus", gitOptionsProxyTrapCalls === 0);
let gitFunctionProxyTrapCalls = 0;
const gitFunctionProxy = new Proxy(localGitFixture(), {
  apply() { gitFunctionProxyTrapCalls += 1; return Buffer.alloc(0); },
  get() { gitFunctionProxyTrapCalls += 1; return undefined; },
  ownKeys() { gitFunctionProxyTrapCalls += 1; return []; },
  getOwnPropertyDescriptor() { gitFunctionProxyTrapCalls += 1; return undefined; },
});
expectStop("Git-Funktionsadapter blockiert Proxy ohne Aufruf", () =>
  remote.attestLocalContract({ finalCommit: FINAL_COMMIT, git: gitFunctionProxy }),
"SECRET_GUARD_UNINSPECTABLE");
check("Git-Funktionsproxy löste keinen Trap/Call aus", gitFunctionProxyTrapCalls === 0);
const mutatedFiles = new Map(rawGitFiles);
mutatedFiles.set(LITERAL_FUNCTION_SOURCES[0], Buffer.from("mutated", "utf8"));
expectStop("Lokale Contractattestierung stoppt veränderten Raw-Functionblob", () =>
  remote.attestLocalContract({
    finalCommit: FINAL_COMMIT,
    git: localGitFixture({ files: mutatedFiles }),
  }));
expectStop("Beliebiger 40hex/RunDirname reicht nie für Contract-Evidence", () =>
  remote.makeContractEvidence({ finalCommit: FINAL_COMMIT, runId: RUN_ID }));
expectStop("Deserialisierte FreshGit-Brand kann nicht rehydriert werden", () =>
  remote.makeContractEvidence({
    localAttestation: structuredClone(localAttestation),
    runId: RUN_ID,
  }), "LOCAL_ATTESTATION_REQUIRED");

const functionAttestation = {
  finalCommit: FINAL_COMMIT,
  commit: FINAL_COMMIT,
  buildVersion: FINAL_COMMIT,
  localRefCommit: FINAL_COMMIT,
  targetBranch: "codex/e17b-bloganalyse-remote",
  localRef: "refs/heads/codex/e17b-bloganalyse-remote",
  e17aBaseline: "e580341a307feac1543e5fb60efa00d263485848",
  projectId: "bscjgwcntapobyxsiyce",
  functionName: "ai-task",
  verifyJwt: true,
  configDatei: "supabase/config.toml",
  dateien: LITERAL_FUNCTION_SOURCES,
  sourceSha256: "f3435b5be6cd274a9b84498ad744d11899ebe5043d537de72dd1e3bf237c828b",
  configSha256: "d051796a827474deb407de73f75b6587b658433f393b7f94b699ad6bdeb1fa79",
  deployContractSha256: "fca05ffd23050bb33b679528401fe5e06b2e51d3a37c5f09a0bec229753bfe5b",
  migrationSha256: "887253d3323c059fd286bf3e66cae3f167cba4396e89e8f867baa7de42465134",
};
check("Function-Attestierung bindet einen dynamischen Finalcommit",
  remote.validateFunctionAttestation(functionAttestation, FINAL_COMMIT, localAttestation) === functionAttestation);
expectStop("Frei geliefertes Functionobjekt ohne Raw-Git-Attestierung stoppt", () =>
  remote.validateFunctionAttestation(functionAttestation, FINAL_COMMIT));
for (const [field, value] of [
  ["finalCommit", OTHER_COMMIT],
  ["buildVersion", OTHER_COMMIT],
  ["localRefCommit", OTHER_COMMIT],
  ["targetBranch", "main"],
  ["localRef", "refs/heads/main"],
  ["e17aBaseline", OTHER_COMMIT],
  ["sourceSha256", HASH_A],
  ["configSha256", HASH_A],
  ["deployContractSha256", HASH_A],
  ["migrationSha256", HASH_A],
]) {
  expectStop(`Function-Attestierung stoppt Mutation ${field}`, () =>
    remote.validateFunctionAttestation(
      { ...functionAttestation, [field]: value },
      FINAL_COMMIT,
      localAttestation,
    ));
}
expectStop("Function-Attestierung stoppt drei statt fünf Closurepfade", () =>
  remote.validateFunctionAttestation(
    { ...functionAttestation, dateien: LITERAL_FUNCTION_SOURCES.slice(0, 3) },
    FINAL_COMMIT,
    localAttestation,
  ));
expectStop("Function-Attestierung stoppt umgeordnete Closurepfade", () =>
  remote.validateFunctionAttestation({
    ...functionAttestation,
    dateien: [LITERAL_FUNCTION_SOURCES[1], LITERAL_FUNCTION_SOURCES[0], ...LITERAL_FUNCTION_SOURCES.slice(2)],
  }, FINAL_COMMIT, localAttestation));

const migrationBytes = readFileSync(new URL(
  "./supabase/migrations/20260817120000_blog_profile_extract_config.sql",
  import.meta.url,
));
function gitFixture({
  head = FINAL_COMMIT,
  status = "",
  paths = LITERAL_MIGRATION_PATHS,
  blob = migrationBytes,
} = {}) {
  return (args, options = {}) => {
    if (args[0] === "rev-parse") return Buffer.from(`${head}\n`);
    if (args[0] === "status") return Buffer.from(status);
    if (args[0] === "ls-tree") return Buffer.from(`${paths.join("\n")}\n`);
    if (args[0] === "show") return blob;
    throw new Error(`unerwarteter Git-Aufruf ${JSON.stringify(args)} ${JSON.stringify(options)}`);
  };
}
const committedMigration = remote.loadCommittedMigration({
  finalCommit: FINAL_COMMIT,
  git: gitFixture(),
});
const transactionDescription = remote.describeMigrationLedgerTransaction(committedMigration);
check("Committed Migration wird raw-bytegebunden geladen",
  committedMigration.sha256 === "887253d3323c059fd286bf3e66cae3f167cba4396e89e8f867baa7de42465134"
    && committedMigration.finalCommit === FINAL_COMMIT
    && !/committedMigrationBrand\.add\s*\(/.test(sourceText));
let migrationOptionsProxyTrapCalls = 0;
const migrationOptionsProxy = new Proxy({}, {
  get() { migrationOptionsProxyTrapCalls += 1; return undefined; },
  ownKeys() { migrationOptionsProxyTrapCalls += 1; return []; },
  getOwnPropertyDescriptor() { migrationOptionsProxyTrapCalls += 1; return undefined; },
});
expectStop("Migration-Loaderoptionen blockieren Proxy vor Propertyzugriff", () =>
  remote.loadCommittedMigration(migrationOptionsProxy), "SECRET_GUARD_UNINSPECTABLE");
check("Migration-Loaderproxy löste keinen Trap aus", migrationOptionsProxyTrapCalls === 0);
check("Nicht-SQL-Begleitdatei verändert den committed Migrationssatz nicht",
  JSON.stringify(remote.validateCommittedMigrationSet([
    ...LITERAL_MIGRATION_PATHS,
    "supabase/migrations/LIESMICH.md",
  ])) === JSON.stringify(LITERAL_MIGRATION_PATHS));
expectStop("Unversionierte SQL-Datei im Migrationsbaum stoppt", () =>
  remote.validateCommittedMigrationSet([
    ...LITERAL_MIGRATION_PATHS,
    "supabase/migrations/unversioned.sql",
  ]));
check("Migration+Ledger-Describe gibt nur Digest und nicht sinkfähigen Platzhalter aus",
  transactionDescription.finalCommit === FINAL_COMMIT
    && transactionDescription.migrationSha256 === committedMigration.sha256
    && transactionDescription.transactionSha256
      === "3fdeb860fe21710583fa3d30bf11800761ef4aca0ef94395c650f81185546421"
    && remote.EXPECTED_MIGRATION_TRANSACTION_SHA256 === transactionDescription.transactionSha256
    && transactionDescription.sinkConsumable === false
    && transactionDescription.sqlTemplate === "<FRESH_DB_AUTHORIZATION_REQUIRED>"
    && !("sql" in transactionDescription));
check("Vollständige DB-Transactionbytes sind nicht über einen Public-Export erreichbar",
  !("buildAuthorizedMigrationLedgerTransaction" in remote));
expectStop("Freies/unbranded Migrationobjekt erreicht auch keinen Describe-Builder", () =>
  remote.describeMigrationLedgerTransaction({
    sql: committedMigration.sql,
    sha256: committedMigration.sha256,
    finalCommit: FINAL_COMMIT,
  }), "COMMITTED_MIGRATION_REQUIRED");
expectStop("Caller-migrationSql wird ausdrücklich blockiert", () => remote.loadCommittedMigration({
  finalCommit: FINAL_COMMIT,
  git: gitFixture(),
  migrationSql: "SELECT 1",
}));
expectStop("Ungültige UTF-8-Migration stoppt", () => remote.loadCommittedMigration({
  finalCommit: FINAL_COMMIT,
  git: gitFixture({ blob: Buffer.from([0xff]) }),
}));
expectStop("Dirty Migration stoppt vor Blobverwendung", () => remote.loadCommittedMigration({
  finalCommit: FINAL_COMMIT,
  git: gitFixture({ status: " M supabase/migrations/20260817120000_blog_profile_extract_config.sql\n" }),
}));
expectStop("Fehlende committed Vorgängerversion stoppt", () => remote.loadCommittedMigration({
  finalCommit: FINAL_COMMIT,
  git: gitFixture({ paths: LITERAL_MIGRATION_PATHS.slice(1) }),
}));
expectStop("Extra committed Vorgängerversion stoppt", () => remote.loadCommittedMigration({
  finalCommit: FINAL_COMMIT,
  git: gitFixture({ paths: ["supabase/migrations/20260724120000_extra.sql", ...LITERAL_MIGRATION_PATHS] }),
}));
for (const sql of [
  "BEGIN; SELECT 1; COMMIT;",
  "START TRANSACTION; SELECT 1;",
  "SAVEPOINT injected;",
  "ROLLBACK;",
  "COMMIT;",
  "RELEASE SAVEPOINT injected;",
  "PREPARE TRANSACTION 'x';",
  "SET TRANSACTION READ ONLY;",
  "ABORT;",
  "END;",
  "END WORK;",
  "END TRANSACTION;",
  "ABORT WORK AND CHAIN;",
  "ABORT TRANSACTION AND NO CHAIN;",
  "END AND CHAIN;",
  "END WORK AND NO CHAIN;",
  "END TRANSACTION AND CHAIN;",
  "COMMIT WORK AND CHAIN;",
  "COMMIT TRANSACTION AND NO CHAIN;",
  "ROLLBACK WORK AND CHAIN;",
  "ROLLBACK TRANSACTION AND NO CHAIN;",
  "RELEASE s;",
  "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;",
  "SELECT E'a\\\'b'; COMMIT; -- ';",
  "SELECT foo$tag$still_code$tag$; COMMIT;",
  "-- nur bis CR versteckt\rCOMMIT;",
  "SELECT ä$tag$COMMIT;$tag$;",
  "SELECT Ж$tag$ROLLBACK;$tag$;",
  "SELECT 'regular\\backslash';",
  "SET standard_conforming_strings = off; SELECT 'x\\y';",
  "SET LOCAL standard_conforming_strings = on;",
  "SET SESSION standard_conforming_strings TO off;",
  "SELECT 'COMMIT;' \\gexec;",
  "\\! echo blocked",
  "\\i blocked.sql",
  "\\ir blocked.sql",
  "\\include blocked.sql",
  "\\copy x from 'blocked'",
  "\\g",
  "\\gset",
  "\\set x y",
  "\\c blocked",
  "SELECT U&'unsupported\\0041';",
  "SELECT U&\"unsupported\\0041\";",
]) {
  expectStop(`Globale Transaktionssteuerung wird blockiert: ${sql.split(";")[0]}`, () =>
    remote.validateMigrationSqlBoundary(sql));
}
for (const sql of [
  "SELECT 'ABORT WORK AND CHAIN';",
  "SELECT $$END TRANSACTION AND NO CHAIN$$;",
  "-- COMMIT WORK AND CHAIN\nSELECT 1;",
  "-- COMMIT WORK AND CHAIN\rSELECT 1;",
  "/* ROLLBACK TRANSACTION AND NO CHAIN */ SELECT 1;",
  "SELECT 'prefix END WORK AND CHAIN suffix';",
  "SELECT E'escaped quote: \\\' COMMIT as data';",
  "SELECT \"COMMIT\" FROM x;",
  "SELECT $tag$COMMIT; RELEASE s;$tag$;",
  "/* outer /* nested COMMIT; */ RELEASE s; */ SELECT 1;",
]) {
  check(`Transaction-Guard lässt Literal/Kommentar unverändert: ${sql.split("\n").at(-1)}`,
    remote.validateMigrationSqlBoundary(sql) === sql);
}

check("CLI akzeptiert genau einen Modus mit finalCommit- und RunDir-Bindung",
  remote.parseCliArgs([
    "local-contract", "--commit", FINAL_COMMIT, "--run-dir", `/private/tmp/${RUN_ID}`,
  ]).mode === "local-contract");
for (const mode of ["all", "autoresume", "retry", "unknown"] ) {
  expectStop(`CLI stoppt Modus ${mode}`, () => remote.parseCliArgs([
    mode, "--commit", FINAL_COMMIT, "--run-dir", `/private/tmp/${RUN_ID}`,
  ]));
}
expectStop("Function-Ownerflag kann DB-Modus nicht autorisieren", () => remote.parseCliArgs([
  "db-apply", "--commit", FINAL_COMMIT, "--run-dir", `/private/tmp/${RUN_ID}`,
  "--owner-approved-function-release",
]));
const ownerCliOnly = remote.parseCliArgs([
  "function-release", "--commit", FINAL_COMMIT, "--run-dir", `/private/tmp/${RUN_ID}`,
  "--owner-approved-function-release",
]);
check("Owner-CLI-String bleibt bloße Intention und erzeugt keine Gate-Provenienz",
  ownerCliOnly.ownerIntent === "function-release"
    && !("ownerGate" in ownerCliOnly));

const testRunDirs = [];
try {
  const absentSocketRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(absentSocketRunDir);
  expectStop("Lokaler Restore stoppt bei fehlendem Socketverzeichnis", () =>
    remote.buildLocalPgLaunchBlueprint("initdb", {
      binaryPath: "/usr/local/opt/postgresql@17/bin/initdb",
      finalCommit: FINAL_COMMIT,
      runDir: absentSocketRunDir,
      fsApi: {
        lstatSync,
        realpathSync(path) {
          return path.startsWith("/usr/local/opt/postgresql@17/bin/") ? path : realpathSync(path);
        },
        statSync(path) {
          return path.startsWith("/usr/local/opt/postgresql@17/bin/") ? fakeExecutableStat : statSync(path);
        },
      },
    }), "INVALID_LOCAL_SOCKET_LAYOUT");

  const symlinkSocketRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(symlinkSocketRunDir);
  symlinkSync(symlinkSocketRunDir, join(symlinkSocketRunDir, "restore-socket"));
  expectStop("Lokaler Restore stoppt bei symlinkendem Socketverzeichnis", () =>
    remote.validateLocalRestoreLayout(symlinkSocketRunDir, {
      finalCommit: FINAL_COMMIT,
      phase: "before-init",
    }), "INVALID_LOCAL_SOCKET_LAYOUT");

  const modeSocketRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(modeSocketRunDir);
  mkdirSync(join(modeSocketRunDir, "restore-socket"), { mode: 0o755 });
  chmodSync(join(modeSocketRunDir, "restore-socket"), 0o755);
  expectStop("Lokaler Restore stoppt bei Socket-Mode ungleich 0700", () =>
    remote.validateLocalRestoreLayout(modeSocketRunDir, {
      finalCommit: FINAL_COMMIT,
      phase: "before-init",
    }), "INVALID_LOCAL_SOCKET_LAYOUT");

  const runDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(runDir);
  const runId = runDir.split("/").at(-1);
  const localPgBinary = (name) => `/usr/local/opt/postgresql@17/bin/${name}`;
  const localPgFs = {
    mkdirSync,
    lstatSync,
    realpathSync(path) {
      return path.startsWith("/usr/local/opt/postgresql@17/bin/") ? path : realpathSync(path);
    },
    statSync(path) {
      return path.startsWith("/usr/local/opt/postgresql@17/bin/")
        ? fakeExecutableStat
        : statSync(path);
    },
  };
  const restorePaths = remote.createLocalRestoreLayout(runDir, {
    finalCommit: FINAL_COMMIT,
    fsApi: localPgFs,
  });
  const initdbBlueprint = remote.buildLocalPgLaunchBlueprint("initdb", {
    binaryPath: localPgBinary("initdb"), finalCommit: FINAL_COMMIT, runDir, fsApi: localPgFs,
  });
  mkdirSync(restorePaths.clusterDir, { mode: 0o700 });
  const startBlueprint = remote.buildLocalPgLaunchBlueprint("server-start", {
    binaryPath: localPgBinary("pg_ctl"), finalCommit: FINAL_COMMIT, runDir, fsApi: localPgFs,
  });
  const scaffoldBlueprint = remote.buildLocalPgLaunchBlueprint("role-scaffold", {
    binaryPath: localPgBinary("psql"), finalCommit: FINAL_COMMIT, runDir, fsApi: localPgFs,
  });
  const publicRestoreBlueprint = remote.buildLocalPgLaunchBlueprint("restore-public", {
    binaryPath: localPgBinary("psql"), finalCommit: FINAL_COMMIT, runDir, fsApi: localPgFs,
  });
  const authRestoreBlueprint = remote.buildLocalPgLaunchBlueprint("restore-auth-ids", {
    binaryPath: localPgBinary("psql"), finalCommit: FINAL_COMMIT, runDir, fsApi: localPgFs,
  });
  const migrationRestoreBlueprint = remote.buildLocalPgLaunchBlueprint("restore-migrations", {
    binaryPath: localPgBinary("psql"), finalCommit: FINAL_COMMIT, runDir, fsApi: localPgFs,
  });
  const canonicalRestoreBlueprint = remote.buildLocalPgLaunchBlueprint("canonical-restore", {
    binaryPath: localPgBinary("psql"), finalCommit: FINAL_COMMIT, runDir, fsApi: localPgFs,
  });
  const literalLocalConnection = [
    "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
    "--host", join(runDir, "restore-socket"),
    "--port", "64321",
    "--username", "e17b_restore_admin",
    "--dbname", "postgres",
  ];
  check("Alle lokalen Restore-Argv entsprechen unabhängigen vollständigen Literalen",
    JSON.stringify(initdbBlueprint.argv) === JSON.stringify([
      "--pgdata", join(runDir, "restore-cluster"),
      "--username=e17b_restore_admin",
      "--auth-local=trust",
      "--auth-host=reject",
      "--encoding=UTF8",
      "--locale=C",
      "--no-instructions",
    ])
      && JSON.stringify(scaffoldBlueprint.argv) === JSON.stringify(literalLocalConnection)
      && JSON.stringify(authRestoreBlueprint.argv) === JSON.stringify(literalLocalConnection)
      && JSON.stringify(publicRestoreBlueprint.argv) === JSON.stringify([
        ...literalLocalConnection, "--file", join(runDir, "public.sql"),
      ])
      && JSON.stringify(migrationRestoreBlueprint.argv) === JSON.stringify([
        ...literalLocalConnection, "--file", join(runDir, "supabase_migrations.sql"),
      ])
      && JSON.stringify(canonicalRestoreBlueprint.argv) === JSON.stringify([
        ...literalLocalConnection, "--quiet", "--no-align", "--tuples-only",
      ]));
  check("Lokaler Restore-Server ist ausschließlich socket-only und host-auth reject",
    initdbBlueprint.argv.includes("--auth-host=reject")
      && startBlueprint.argv.join(" ").includes("listen_addresses=''" )
      && startBlueprint.argv.join(" ").includes(startBlueprint.paths.socketDir)
      && !/127\.0\.0\.1|0\.0\.0\.0|::1/.test(startBlueprint.argv.join(" "))
      && startBlueprint.shell === false
      && startBlueprint.attempts === 1);
  check("Lokales Rollenscaffold ist exakt allowlistet und ausschließlich NOLOGIN",
    LITERAL_LOCAL_ROLES.every((role) =>
      scaffoldBlueprint.stdinSql.includes(`CREATE ROLE ${role} NOLOGIN;`))
      && (scaffoldBlueprint.stdinSql.match(/^CREATE ROLE /gm) || []).length
        === LITERAL_LOCAL_ROLES.length
      && scaffoldBlueprint.stdinSql.includes(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;",
      )
      && scaffoldBlueprint.stdinSql.includes("CREATE TABLE auth.users (id uuid PRIMARY KEY);")
      && scaffoldBlueprint.stdinSql.includes("SELECT NULL::uuid")
      && (scaffoldBlueprint.stdinSql.match(/^CREATE EXTENSION /gm) || []).length === 1
      && !/PASSWORD|\bLOGIN\s*;/i.test(scaffoldBlueprint.stdinSql));
  check("Auth-Restore lädt ausschließlich die ID-Projektion und behauptet keine Managed-Semantik",
    authRestoreBlueprint.stdinSql
      === `\\copy auth.users (id) FROM '${join(runDir, "auth_ids.txt")}' WITH (FORMAT text)\n`
      && authRestoreBlueprint.managedAuthSemanticsProven === false
      && !/email|phone|password|token|metadata/i.test(authRestoreBlueprint.stdinSql));
  check("Lokale Restores konsumieren unveränderte feste Dump-Pfade über den Socket",
    publicRestoreBlueprint.argv.at(-1) === join(runDir, "public.sql")
      && migrationRestoreBlueprint.argv.at(-1) === join(runDir, "supabase_migrations.sql")
      && publicRestoreBlueprint.argv.includes(join(runDir, "restore-socket"))
      && migrationRestoreBlueprint.argv.includes(join(runDir, "restore-socket")));
  check("Lokale PG-Blueprints bleiben bis zur korrelierten Full-Closure und Serverversion nicht sinkfähig",
    [
      [initdbBlueprint, "initdb", false],
      [startBlueprint, "pg_ctl", false],
      [scaffoldBlueprint, "psql", true],
      [publicRestoreBlueprint, "psql", true],
      [authRestoreBlueprint, "psql", true],
      [migrationRestoreBlueprint, "psql", true],
      [canonicalRestoreBlueprint, "psql", true],
    ].every(([blueprint, binaryName, serverProofRequired]) =>
      blueprint.sinkConsumable === false
        && blueprint.requiredRuntimeCapability === "Pg17ToolchainClosure"
        && blueprint.operationBinary === binaryName
        && blueprint.requiresServerVersionProof === serverProofRequired));
  check("Canonical-Projektion ist read-only, C-sortiert und gibt nur Counts/Hashes aus",
    canonicalRestoreBlueprint.stdinSql === remote.buildCanonicalProjectionSql({ side: "restore" })
      && (canonicalRestoreBlueprint.stdinSql.match(/COLLATE \"C\"/g) || []).length >= 10
      && canonicalRestoreBlueprint.stdinSql.includes("to_jsonb(t)::text")
      && canonicalRestoreBlueprint.stdinSql.includes("extensions.digest")
      && !/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(canonicalRestoreBlueprint.stdinSql));
  expectStop("Lokaler PG-Builder blockiert Binary/Operation-Verwechslung", () =>
    remote.buildLocalPgLaunchBlueprint("initdb", {
      binaryPath: localPgBinary("psql"), finalCommit: FINAL_COMMIT, runDir, fsApi: localPgFs,
    }), "LOCAL_PG_OPERATION_REJECTED");
  const contract = remote.makeContractEvidence({ localAttestation, runId });
  const written = remote.writeEvidence(runDir, contract);
  const observed = remote.readEvidence(runDir, "00-contract", { finalCommit: FINAL_COMMIT });
  check("Evidencewriter schreibt kanonische 0600-Bytes mit Digest der Recordbytes",
    written.digest === sha256(independentCanonicalBytes(contract))
      && observed.digest === written.digest
      && observed.bytes.equals(independentCanonicalBytes(contract)));
  check("Generic Reader erzeugt ausdrücklich keine Vertrauensprovenienz",
    observed.provenance === "observed" && observed.trusted === false);

  const copiedRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(copiedRunDir);
  writeFileSync(join(copiedRunDir, "00-contract.json"), observed.bytes, {
    mode: 0o600,
    flag: "wx",
  });
  expectStop("Kanonische Evidence-Kopie in zweites RunDir stoppt wegen runId-Objektbindung", () =>
    remote.readEvidence(copiedRunDir, "00-contract", { finalCommit: FINAL_COMMIT }));

  const forgedRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(forgedRunDir);
  const forgedRunId = forgedRunDir.split("/").at(-1);
  const forgedContract = remote.makeContractEvidence({ localAttestation, runId: forgedRunId });
  const forgedContractItem = remote.writeEvidence(forgedRunDir, forgedContract);
  const forged10 = baseRecord({
    role: "10-read-preflight",
    state: "ok",
    facts: successFacts("10-read-preflight"),
    prerequisites: { "00-contract": forgedContractItem.digest },
    executorSummary: executor("supabase-functions-list"),
  });
  forged10.runId = forgedRunId;
  const forgedBytes = independentCanonicalBytes(forged10);
  const forgedPath = join(forgedRunDir, "10-read-preflight.json");
  writeFileSync(forgedPath, forgedBytes, { mode: 0o600, flag: "wx" });
  chmodSync(forgedPath, 0o600);
  const forgedObserved = remote.readEvidence(forgedRunDir, "10-read-preflight", {
    finalCommit: FINAL_COMMIT,
  });
  check("Caller-konstruiertes kanonisches 0600-Successfile bleibt observed/untrusted",
    forgedObserved.provenance === "observed" && forgedObserved.trusted === false);
  expectStop("Caller-konstruiertes Successrecord kann nicht durch Writer geadelt werden", () =>
    remote.writeEvidence(forgedRunDir, forged10), "SUCCESS_PROVENANCE_REQUIRED");

  const prettyRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(prettyRunDir);
  const prettyRunId = prettyRunDir.split("/").at(-1);
  const prettyContract = remote.makeContractEvidence({ localAttestation, runId: prettyRunId });
  writeFileSync(join(prettyRunDir, "00-contract.json"), JSON.stringify(prettyContract, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  expectStop("Re-encodierte nichtkanonische Evidence wird vom Reader blockiert", () =>
    remote.readEvidence(prettyRunDir, "00-contract", { finalCommit: FINAL_COMMIT }));

  const emptyFactsRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(emptyFactsRunDir);
  const emptyRunId = emptyFactsRunDir.split("/").at(-1);
  const emptyFacts = {
    ...remote.makeContractEvidence({ localAttestation, runId: emptyRunId }),
    facts: {},
  };
  writeFileSync(join(emptyFactsRunDir, "00-contract.json"), independentCanonicalBytes(emptyFacts), {
    mode: 0o600,
    flag: "wx",
  });
  expectStop("Reader blockiert caller-konstruiertes Contractfile mit leeren Facts", () =>
    remote.readEvidence(emptyFactsRunDir, "00-contract", { finalCommit: FINAL_COMMIT }));

  const hardlinkRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(hardlinkRunDir);
  const hardlinkRunId = hardlinkRunDir.split("/").at(-1);
  const hardlinkContract = remote.makeContractEvidence({ localAttestation, runId: hardlinkRunId });
  remote.writeEvidence(hardlinkRunDir, hardlinkContract);
  linkSync(
    join(hardlinkRunDir, "00-contract.json"),
    join(hardlinkRunDir, "copied-hardlink.json"),
  );
  expectStop("Evidence-Reader blockiert Hardlinks", () =>
    remote.readEvidence(hardlinkRunDir, "00-contract", { finalCommit: FINAL_COMMIT }));

  const realRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(realRunDir);
  const symlinkPath = `/private/tmp/kinodreieck-e17b-${FINAL_COMMIT}-${randomBytes(8).toString("hex")}`;
  symlinkSync(realRunDir, symlinkPath);
  testRunDirs.push(symlinkPath);
  expectStop("RunDir-Validator blockiert Symlinkziele", () =>
    remote.validateRunDir(symlinkPath, { finalCommit: FINAL_COMMIT }));

  const guardedWriteRunDir = remote.createRunDir(FINAL_COMMIT);
  testRunDirs.push(guardedWriteRunDir);
  const guardedRunId = guardedWriteRunDir.split("/").at(-1);
  const guardedContract = remote.makeContractEvidence({ localAttestation, runId: guardedRunId });
  expectStop("Evidencewriter koppelt Secretguard vor Serialisierung und Dateischreibpfad", () =>
    remote.writeEvidence(guardedWriteRunDir, guardedContract, {
      secrets: ["codex/e17b-bloganalyse-remote"],
    }), "SECRET_EXPOSURE");
} finally {
  for (const path of [...testRunDirs].reverse()) cleanupTree(path);
}

const CANONICAL_V2_TEST_CATEGORIES = [
  "schema", "relation", "column", "constraint", "index", "trigger", "policy",
  "view", "matview", "routine", "type", "sequence", "extension", "acl",
  "default_acl", "role", "membership", "inheritance", "table_set",
  "table_rowcount", "table_data", "auth_id", "ledger", "target_contract",
];

const CANONICAL_V2_LITERAL_FIXTURE_DEFLATE_BASE64 =
  "5Vptb+M2DP5+/6WAJVmk/XG7FsNwQA84bPtaOLLcGkiTLnF3d4B+/EDKTmwnuJlq15etRdGEMi2Jrw8pfbr8Q4efr3759TqooPWF" +
  "qzbbTeuq9UXtu6pdhyz+mIv+w08XKuj8wyfi+/j59+vfwt7d+fsqqEj7cvXx85fLAzFYHezKrrRGAwYKsFCD0lo7rRFAgUMLlr4b" +
  "RTSDptDa1toRDzSI4MGi/mcOW48XtfPrqmu3m9myjuSg0T5lZR4U1HH8uXfSc6ygBA/50ucxo7ejgRIN5mDBg1m+PtTg0CxeG0CD" +
  "mt5vGxknarCYgYMSDCjbQAm8VsyhxBxLwW4V6sgFJTTgBZrIBp4l657alduuH+/nVjUQgwF8gk2RbMCBku4IM2hY71JJCG2Y9ENW" +
  "Zpuk3fXc8tmghma5H4CBBtxYjmnrPX2PQK4N5pbsi/TpFvORJwAo4sLl+030IECOERY179AukfDcFzb7ble1m+7EH44DQZfwCj6R" +
  "atuLn+cnWPaLpTfRMsVqDQo0OEEWGfMK5uSnmW/IC5AnevH5N6VqKe6H8pwgek2tsN3U/tvMAHtaMPAqtsd5GywW/yI6UEA7smjQ" +
  "cIS0mEMhiZNHCxbJQ4EkxjgoEUQo5FnQARgajzhI6ClZfD6ugPgXz2mxiNykk5f3g27X3t763cwTDtSgIXsHcZijSh8VQZIDfa9r" +
  "4l6ecQE5ij0RKczekj47YVpAAQ5/Brt52K5b931mNgMxaKXeQ/bm2gdqrn2MOOYQzrMCqRMyrEkOovrMclTwgIJ5SN4GVlKd/tX6" +
  "rzONRlJQGbztqvcZLPq+6s4I4EANCvSblgHXcxkOniOJg8La9vlkvts+du3Gz9stAzXkKn9JmQt7Jwl2OkMmCbHbcfxAJEyFQoxk" +
  "ZDUiAse4GIddSqeFsSLl5MW5ldAXkpyMoJZ1jDBXjKMaaACWz0aREikLDPo4WrVErxTbPfOhYO6GZxb02yBWCdTDKsVI7/vD3NEi" +
  "KRhb/Le8rMfggNRvFOB/6mlItPFeej2W56ltw/3XXGzZ9ahXKOk6NIx2SsaoJmYX9m4Vkbeo/8tRb8nsU6vf+z8f/cbNLf9IDnmG" +
  "bzuvS3tMVBlwl3vxmmrSh+BpJehRlFyraJYqZz6JF0d9LOdAqr+dXBupfa0Jf2rVMnpHjCjkqwJ+mtNQNJk+u0w73Acyhzwt7ub6" +
  "b53f7E+PzEb0oLKy9zBxhZZSPcJwoiU6DYnaa/rcsbjDOpVG5dYzOTAl6NwMEpCezyVZJWioGNkI5kELSZwJ+RljPMec8lECl5XU" +
  "+IztgBGslSDm0XyJ1lD7pnpcdzenVjEZCaocMlBCdjixjzGmOHw+fDpnI7aR5pj/iwZ32/VpcUqkoAubHNPQxs6TKIcW0FcpgmzI" +
  "nXeSNmenRpQZJ9yQgxbkowZQgiim/Xtx/tRsuyqeaQhvJMS6zUc/OPRTaSW1TNaS+m/Wd/L3K7/b37UP89bTaCAoO2QQsSZrjg76" +
  "BSK0glyIJZMsm2o0zOUnfnd+13bVaTEwGQk6P9QDsYfBqDXx3HP0BlH/lmJdnnwDoecXyZNqSuHtH64k84jSbUMxjU8wRd3q0xs5" +
  "toEV2Kfc6bGU2xo+JRFbSVet1v5m7+eXE0b0oLLiNU435De7xHedzslit/3qto+b8wI5DobiVQ4KTVQ0Jiq6rrrq7MbiQCjo3IMx" +
  "iGUEUcKQW/QwwRArzj9Bo3EZozPzDNAeKw3Ol9rHnoiJlXUdeX6wKWN64catxd9JLfLY3d209bweGahBHy4yWrTLDvSnE6x9fXpy" +
  "PBCDUofjkqSCLAFWDZdq+kaD6Cij7LlM6hW/rtrd+u7GbTfdrnKn3jIbDXl2zDLFD/qOBU8Jhv6UQWMMGGsA6H9pACx9Hy/n6vpy" +
  "+aXcD38D";
const CANONICAL_V2_LITERAL_BASELINE_TARGET_FRAME =
  "KDV2|RECORD|target_contract|1|40|5b5b227068617365222c2276616c7565222c382c2236323631373336353663363936653635225d5d";
const CANONICAL_V2_LITERAL_POSTWRITE_TARGET_FRAME =
  "KDV2|RECORD|target_contract|1|42|5b5b227068617365222c2276616c7565222c392c22373036663733373437373732363937343635225d5d";
const CANONICAL_V2_LITERAL_SCHEMA_FRAME =
  "KDV2|RECORD|schema|1|52|5b5b22736368656d61222c2276616c7565222c312c223738225d2c5b226f776e6572222c2276616c7565222c312c223738225d5d";
const CANONICAL_V2_LITERAL_SEQUENCE_OWNED_FRAME =
  "KDV2|RECORD|sequence|1|407|5b5b22736368656d61222c2276616c7565222c312c223738225d2c5b226e616d65222c2276616c7565222c312c223738225d2c5b226f776e6572222c2276616c7565222c312c223738225d2c5b2274797065222c2276616c7565222c312c223738225d2c5b227374617274222c2276616c7565222c312c223738225d2c5b226d696e222c2276616c7565222c312c223738225d2c5b226d6178222c2276616c7565222c312c223738225d2c5b22696e6372656d656e74222c2276616c7565222c312c223738225d2c5b226361636865222c2276616c7565222c312c223738225d2c5b226379636c65222c2276616c7565222c312c223738225d2c5b226f776e65645f736368656d61222c2276616c7565222c312c223738225d2c5b226f776e65645f72656c6174696f6e222c2276616c7565222c312c223738225d2c5b226f776e65645f636f6c756d6e222c2276616c7565222c312c223738225d2c5b226c6173745f76616c7565222c2276616c7565222c312c223738225d2c5b2269735f63616c6c6564222c2276616c7565222c312c223738225d5d";
const CANONICAL_V2_LITERAL_SEQUENCE_NONE_FRAME =
  "KDV2|RECORD|sequence|1|413|5b5b22736368656d61222c2276616c7565222c312c223738225d2c5b226e616d65222c2276616c7565222c312c223738225d2c5b226f776e6572222c2276616c7565222c312c223738225d2c5b2274797065222c2276616c7565222c312c223738225d2c5b227374617274222c2276616c7565222c312c223738225d2c5b226d696e222c2276616c7565222c312c223738225d2c5b226d6178222c2276616c7565222c312c223738225d2c5b22696e6372656d656e74222c2276616c7565222c312c223738225d2c5b226361636865222c2276616c7565222c312c223738225d2c5b226379636c65222c2276616c7565222c312c223738225d2c5b226f776e65645f736368656d61222c226e756c6c222c6e756c6c2c6e756c6c5d2c5b226f776e65645f72656c6174696f6e222c226e756c6c222c6e756c6c2c6e756c6c5d2c5b226f776e65645f636f6c756d6e222c226e756c6c222c6e756c6c2c6e756c6c5d2c5b226c6173745f76616c7565222c2276616c7565222c312c223738225d2c5b2269735f63616c6c6564222c2276616c7565222c312c223738225d5d";

function mutateCanonicalV2LiteralRecord(text, category) {
  const marker = `KDV2|RECORD|${category}|1|`;
  const start = text.indexOf(marker);
  const end = text.indexOf("\n", start);
  if (start < 0 || end < 0) throw new Error(`Fixturekategorie fehlt: ${category}`);
  const frame = text.slice(start, end);
  const mutated = frame.replace("22373822", "22373922");
  if (mutated === frame) throw new Error(`Fixturekategorie ist nicht mutierbar: ${category}`);
  return `${text.slice(0, start)}${mutated}${text.slice(end)}`;
}

function canonicalV2LiteralOutput(role, snapshotId, phase, mutations = {}) {
  let text = inflateRawSync(
    Buffer.from(CANONICAL_V2_LITERAL_FIXTURE_DEFLATE_BASE64, "base64"),
  ).toString("utf8");
  text = text.replaceAll("22-canonical-detail", role).replaceAll("00000003-0000000A-1", snapshotId);
  if (phase === "postwrite") {
    text = text.replace(
      CANONICAL_V2_LITERAL_BASELINE_TARGET_FRAME,
      CANONICAL_V2_LITERAL_POSTWRITE_TARGET_FRAME,
    );
  }
  for (const category of Object.keys(mutations)) {
    text = mutateCanonicalV2LiteralRecord(text, category);
  }
  return Buffer.from(text, "utf8");
}

function canonicalV2Plan(session, role, snapshotId) {
  return session.prepareCapture({ role, snapshotId });
}

const canonicalV2Session = remote.createCanonicalV2UntrustedSession();
check("Canonical-v2 exportiert genau die drei untrusted Sessionmethoden",
  Object.isFrozen(canonicalV2Session)
    && JSON.stringify(Object.keys(canonicalV2Session))
      === JSON.stringify(["prepareCapture", "compareBaseline", "comparePostwrite"]));
const sourceSnapshot = "00000003-0000000A-1";
const restoreSnapshot = "00000004-0000000B-1";
const post42Snapshot = "00000004-0000000B-2";
const post90Snapshot = "00000004-0000000B-3";
const sourcePlan = canonicalV2Plan(canonicalV2Session, "22-canonical-detail", sourceSnapshot);
check("Canonical-v2-Plan ist frozen, snapshotgebunden, read-only und frei von Runnerinputs",
  Object.isFrozen(sourcePlan)
    && JSON.stringify(Object.keys(sourcePlan)) === JSON.stringify(["stdinSql", "parseUntrustedStdout"])
    && sourcePlan.stdinSql.startsWith("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n")
    && sourcePlan.stdinSql.includes(`SET TRANSACTION SNAPSHOT '${sourceSnapshot}';`)
    && sourcePlan.stdinSql.includes("FROM ONLY")
    && sourcePlan.stdinSql.includes("\\gexec")
    && !sourcePlan.stdinSql.includes("\${MIGRATION_VERSION}")
    && !/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(sourcePlan.stdinSql));
check("Canonical-v2 erfasst globale Default-ACLs und seedet deren Rollen dynamisch",
  sourcePlan.stdinSql.includes("d.defaclnamespace=0")
    && sourcePlan.stdinSql.includes("UNION SELECT d.defaclrole")
    && sourcePlan.stdinSql.includes("UNION SELECT a.grantor FROM object_acls")
    && sourcePlan.stdinSql.includes("UNION SELECT a.grantee FROM object_acls"));
check("Canonical-v2-Sequenzen binden die exakte pg_depend-OWNED-BY-Beziehung",
  sourcePlan.stdinSql.includes("JOIN pg_depend")
    && sourcePlan.stdinSql.includes("owned_schema")
    && sourcePlan.stdinSql.includes("owned_relation")
    && sourcePlan.stdinSql.includes("owned_column"));
const sourceTranscript = sourcePlan.parseUntrustedStdout(
  canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline"),
  { secrets: ["synthetic-secret-not-present"] },
);
expectStop("Canonical-v2-Plan ist strikt one-shot", () => sourcePlan.parseUntrustedStdout(
  canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline"),
  { secrets: [] },
), "CANONICAL_V2_PLAN_CONSUMED");
const restorePlan = canonicalV2Plan(canonicalV2Session, "23-canonical-detail", restoreSnapshot);
const restoreTranscript = restorePlan.parseUntrustedStdout(
  canonicalV2LiteralOutput("23-canonical-detail", restoreSnapshot, "baseline"),
  { secrets: [] },
);
const baselineSummary = canonicalV2Session.compareBaseline(sourceTranscript, restoreTranscript);
check("Canonical-v2-Baseline erlaubt verschiedene Snapshot-IDs und bleibt untrusted",
  baselineSummary.kind === "canonical-v2-untrusted-baseline-summary"
    && baselineSummary.trusted === false
    && /^[0-9a-f]{64}$/.test(baselineSummary.semanticSha256));
expectStop("Canonical-v2-Baselinevergleich ist one-shot", () =>
  canonicalV2Session.compareBaseline(sourceTranscript, restoreTranscript),
"CANONICAL_V2_BASELINE_REPLAY");
const post42Plan = canonicalV2Plan(canonicalV2Session, "42-db-postflight", post42Snapshot);
const post42Transcript = post42Plan.parseUntrustedStdout(
  canonicalV2LiteralOutput("42-db-postflight", post42Snapshot, "postwrite"),
  { secrets: [] },
);
const post90Plan = canonicalV2Plan(canonicalV2Session, "90-remote-delta", post90Snapshot);
const post90Transcript = post90Plan.parseUntrustedStdout(
  canonicalV2LiteralOutput("90-remote-delta", post90Snapshot, "postwrite"),
  { secrets: [] },
);
const postwriteSummary = canonicalV2Session.comparePostwrite(post42Transcript, post90Transcript);
check("Canonical-v2-Postwrite korreliert 42/90 gegen echte Baseline und bleibt untrusted",
  postwriteSummary.kind === "canonical-v2-untrusted-postwrite-summary"
    && postwriteSummary.trusted === false
    && /^[0-9a-f]{64}$/.test(postwriteSummary.semanticSha256));
expectStop("Canonical-v2-Postwritevergleich ist one-shot", () =>
  canonicalV2Session.comparePostwrite(post42Transcript, post90Transcript),
"CANONICAL_V2_POSTWRITE_ORDER");

const postBeforeBaseline = remote.createCanonicalV2UntrustedSession();
expectStop("Canonical-v2 stoppt Postwrite-Plan vor erfolgreicher Baseline", () => {
  postBeforeBaseline.prepareCapture({ role: "42-db-postflight", snapshotId: post42Snapshot });
}, "CANONICAL_V2_ROLE_ORDER");
expectStop("Canonical-v2 stoppt Rollen-Replay und Rollenlücken", () => {
  postBeforeBaseline.prepareCapture({ role: "23-canonical-detail", snapshotId: restoreSnapshot });
}, "CANONICAL_V2_ROLE_ORDER");
expectStop("Canonical-v2 stoppt Extra-Key vor Propertynutzung", () => {
  postBeforeBaseline.prepareCapture({ role: "22-canonical-detail", snapshotId: sourceSnapshot, extra: true });
}, "CANONICAL_V2_UNINSPECTABLE");
let canonicalGetterCalls = 0;
const accessorOptions = {};
Object.defineProperty(accessorOptions, "role", {
  enumerable: true,
  get() { canonicalGetterCalls += 1; return "22-canonical-detail"; },
});
Object.defineProperty(accessorOptions, "snapshotId", {
  enumerable: true,
  value: sourceSnapshot,
});
expectStop("Canonical-v2 stoppt Accessor ohne Getterausführung", () =>
  postBeforeBaseline.prepareCapture(accessorOptions), "SECRET_GUARD_UNINSPECTABLE");
check("Canonical-v2 hat den Accessor-Getter nicht ausgeführt", canonicalGetterCalls === 0);
const throwingProxy = new Proxy({}, { ownKeys() { throw new Error("trap"); } });
expectStop("Canonical-v2 stoppt Proxy ohne Trap-Ausführung", () =>
  postBeforeBaseline.prepareCapture(throwingProxy), "SECRET_GUARD_UNINSPECTABLE");

const secretSession = remote.createCanonicalV2UntrustedSession();
const secretPlan = canonicalV2Plan(secretSession, "22-canonical-detail", sourceSnapshot);
expectStop("Canonical-v2 scannt unveränderte Outputbytes vor Parsing auf Secrets", () =>
  secretPlan.parseUntrustedStdout(
    canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline"),
    { secrets: ["KDV2|BEGIN"] },
  ), "SECRET_EXPOSURE");

const driftSession = remote.createCanonicalV2UntrustedSession();
const driftSourcePlan = canonicalV2Plan(driftSession, "22-canonical-detail", sourceSnapshot);
const driftSource = driftSourcePlan.parseUntrustedStdout(
  canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline"), { secrets: [] },
);
const driftRestorePlan = canonicalV2Plan(driftSession, "23-canonical-detail", restoreSnapshot);
const driftRestore = driftRestorePlan.parseUntrustedStdout(
  canonicalV2LiteralOutput("23-canonical-detail", restoreSnapshot, "baseline", { role: "changed" }),
  { secrets: [] },
);
expectStop("Canonical-v2 erkennt Baseline-Drift kategoriengenau", () =>
  driftSession.compareBaseline(driftSource, driftRestore), "CANONICAL_V2_BASELINE_DRIFT");
expectStop("Fehlgeschlagener Canonical-v2-Vergleich konsumiert beide Transcripts vor Semantik", () =>
  driftSession.compareBaseline(driftSource, driftRestore), "CANONICAL_V2_TRANSCRIPT_REQUIRED");

const sequenceOwnershipSession = remote.createCanonicalV2UntrustedSession();
const sequenceOwned = canonicalV2Plan(
  sequenceOwnershipSession, "22-canonical-detail", sourceSnapshot,
).parseUntrustedStdout(
  canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline"),
  { secrets: [] },
);
const sequenceNoneFixture = canonicalV2LiteralOutput(
  "23-canonical-detail", restoreSnapshot, "baseline",
).toString("utf8").replace(
  CANONICAL_V2_LITERAL_SEQUENCE_OWNED_FRAME,
  CANONICAL_V2_LITERAL_SEQUENCE_NONE_FRAME,
);
const sequenceNone = canonicalV2Plan(
  sequenceOwnershipSession, "23-canonical-detail", restoreSnapshot,
).parseUntrustedStdout(Buffer.from(sequenceNoneFixture, "utf8"), { secrets: [] });
expectStop("Canonical-v2 erkennt reine Sequenzdrift zu OWNED BY NONE", () =>
  sequenceOwnershipSession.compareBaseline(sequenceOwned, sequenceNone),
"CANONICAL_V2_BASELINE_DRIFT");

const sharedDriftSession = remote.createCanonicalV2UntrustedSession();
const sharedS = canonicalV2Plan(sharedDriftSession, "22-canonical-detail", sourceSnapshot)
  .parseUntrustedStdout(canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline"), { secrets: [] });
const sharedR = canonicalV2Plan(sharedDriftSession, "23-canonical-detail", restoreSnapshot)
  .parseUntrustedStdout(canonicalV2LiteralOutput("23-canonical-detail", restoreSnapshot, "baseline"), { secrets: [] });
sharedDriftSession.compareBaseline(sharedS, sharedR);
const shared42 = canonicalV2Plan(sharedDriftSession, "42-db-postflight", post42Snapshot)
  .parseUntrustedStdout(canonicalV2LiteralOutput("42-db-postflight", post42Snapshot, "postwrite", { relation: "same-foreign-drift" }), { secrets: [] });
const shared90 = canonicalV2Plan(sharedDriftSession, "90-remote-delta", post90Snapshot)
  .parseUntrustedStdout(canonicalV2LiteralOutput("90-remote-delta", post90Snapshot, "postwrite", { relation: "same-foreign-drift" }), { secrets: [] });
expectStop("Identisch manipulierte 42/90 bleiben gegen Prebaseline rot", () =>
  sharedDriftSession.comparePostwrite(shared42, shared90), "CANONICAL_V2_PREWRITE_BASELINE_DRIFT");

const crossSession = remote.createCanonicalV2UntrustedSession();
const crossS = canonicalV2Plan(crossSession, "22-canonical-detail", sourceSnapshot)
  .parseUntrustedStdout(canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline"), { secrets: [] });
const crossR = canonicalV2Plan(crossSession, "23-canonical-detail", restoreSnapshot)
  .parseUntrustedStdout(canonicalV2LiteralOutput("23-canonical-detail", restoreSnapshot, "baseline"), { secrets: [] });
const foreignSession = remote.createCanonicalV2UntrustedSession();
const foreignS = canonicalV2Plan(foreignSession, "22-canonical-detail", sourceSnapshot)
  .parseUntrustedStdout(canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline"), { secrets: [] });
canonicalV2Plan(foreignSession, "23-canonical-detail", restoreSnapshot);
expectStop("Canonical-v2 stoppt Cross-session-Transcript", () =>
  foreignSession.compareBaseline(crossS, crossR), "CANONICAL_V2_TRANSCRIPT_CONTEXT_MISMATCH");
expectStop("Canonical-v2 stoppt literal/clone/JSON-Transcript", () =>
  crossSession.compareBaseline({}, structuredClone(crossR)), "CANONICAL_V2_TRANSCRIPT_REQUIRED");

const malformedSession = remote.createCanonicalV2UntrustedSession();
const malformedPlan = canonicalV2Plan(malformedSession, "22-canonical-detail", sourceSnapshot);
const malformed = canonicalV2LiteralOutput("22-canonical-detail", sourceSnapshot, "baseline");
const malformedText = malformed.toString("utf8").replace("|target_contract|1|40|", "|target_contract|1|41|");
expectStop("Canonical-v2 stoppt falsche Lengthframes", () =>
  malformedPlan.parseUntrustedStdout(Buffer.from(malformedText, "utf8"), { secrets: [] }),
"INVALID_CANONICAL_V2_LENGTH");

const canonicalV2MalformedSchemaFrames = [
  ["falsches Label", "KDV2|RECORD|schema|1|52|5b5b22787878787878222c2276616c7565222c312c223738225d2c5b226f776e6572222c2276616c7565222c312c223738225d5d"],
  ["falsche Reihenfolge", "KDV2|RECORD|schema|1|52|5b5b226f776e6572222c2276616c7565222c312c223738225d2c5b22736368656d61222c2276616c7565222c312c223738225d5d"],
  ["falsche Zellarity", "KDV2|RECORD|schema|1|60|5b5b22736368656d61222c2276616c7565222c312c223738222c226578747261225d2c5b226f776e6572222c2276616c7565222c312c223738225d5d"],
  ["falscher Nullmarker", "KDV2|RECORD|schema|1|52|5b5b22736368656d61222c224e554c4c21222c312c223738225d2c5b226f776e6572222c2276616c7565222c312c223738225d5d"],
  ["falscher Typ", "KDV2|RECORD|schema|1|54|5b5b22736368656d61222c2276616c7565222c2231222c223738225d2c5b226f776e6572222c2276616c7565222c312c223738225d5d"],
  ["falsche deklarierte Länge", "KDV2|RECORD|schema|1|52|5b5b22736368656d61222c2276616c7565222c322c223738225d2c5b226f776e6572222c2276616c7565222c312c223738225d5d"],
  ["ungültige Hexbytes", "KDV2|RECORD|schema|1|52|5b5b22736368656d61222c2276616c7565222c312c227a7a225d2c5b226f776e6572222c2276616c7565222c312c223738225d5d"],
  ["Extrafeld", "KDV2|RECORD|schema|1|77|5b5b22736368656d61222c2276616c7565222c312c223738225d2c5b226f776e6572222c2276616c7565222c312c223738225d2c5b226578747261222c2276616c7565222c312c223738225d5d"],
];
for (const [label, replacementFrame] of canonicalV2MalformedSchemaFrames) {
  const session = remote.createCanonicalV2UntrustedSession();
  const plan = canonicalV2Plan(session, "22-canonical-detail", sourceSnapshot);
  const fixtureText = canonicalV2LiteralOutput(
    "22-canonical-detail", sourceSnapshot, "baseline",
  ).toString("utf8");
  expectStop(`Canonical-v2-Payload stoppt ${label}`, () => plan.parseUntrustedStdout(
    Buffer.from(fixtureText.replace(CANONICAL_V2_LITERAL_SCHEMA_FRAME, replacementFrame), "utf8"),
    { secrets: [] },
  ), "INVALID_CANONICAL_V2_PAYLOAD");
}
const unknownCategorySession = remote.createCanonicalV2UntrustedSession();
const unknownCategoryPlan = canonicalV2Plan(
  unknownCategorySession, "22-canonical-detail", sourceSnapshot,
);
expectStop("Canonical-v2-Payload stoppt unbekannte Kategorie", () =>
  unknownCategoryPlan.parseUntrustedStdout(
    Buffer.from(canonicalV2LiteralOutput(
      "22-canonical-detail", sourceSnapshot, "baseline",
    ).toString("utf8").replace("KDV2|COUNT|schema|1", "KDV2|COUNT|unknown|1"), "utf8"),
    { secrets: [] },
  ), "INVALID_CANONICAL_V2_COUNT");

check("Canonical-v2 fügt dem Produktnamespace nur den einen freigegebenen Export hinzu",
  typeof remote.createCanonicalV2UntrustedSession === "function"
    && !Object.keys(remote).some((name) => /CanonicalV2/.test(name)
      && name !== "createCanonicalV2UntrustedSession"));
const namespaceKeys = Object.keys(remote).sort();
check("Canonical-v2-Namespace bleibt exakt beim eingefrorenen 133-Export-Orakel",
  namespaceKeys.length === 133
    && sha256(Buffer.from(JSON.stringify(namespaceKeys), "utf8"))
      === "6f178f3758d60fe1368d11dc93e2669e9f8d37c72a097be3d5485e7f06489b99"
    && namespaceKeys.filter((name) => name === "createCanonicalV2UntrustedSession").length === 1);

const canonicalV2Artifacts = [
  ["Session", canonicalV2Session],
  ["Plan", sourcePlan],
  ["Transcript", sourceTranscript],
  ["Summary", baselineSummary],
];
const canonicalV2ArtifactSinks = [
  ["Evidence", (value) => remote.validateEvidenceRecord(value)],
  ["Canonical", (value) => remote.compareCanonicalProof(value, {})],
  ["Function", (value) => remote.validateFunctionAttestation(value, FINAL_COMMIT, {})],
  ["DB", (value) => remote.validateDbPrewrite(value)],
  ["Proof", (value) => remote.validateExecutorProofBinding(value)],
];
for (const [artifactName, artifact] of canonicalV2Artifacts) {
  for (const [sinkName, invoke] of canonicalV2ArtifactSinks) {
    expectStop(`Canonical-v2-${artifactName} wird direkt am ${sinkName}-Sink geblockt`, () =>
      invoke(artifact), "CANONICAL_V2_ARTIFACT_REJECTED");
    expectStop(`Canonical-v2-${artifactName} wird verschachtelt am ${sinkName}-Sink geblockt`, () =>
      invoke({ nested: { artifact } }), "CANONICAL_V2_ARTIFACT_REJECTED");
  }
}
let canonicalV2NestedGetterCalls = 0;
const canonicalV2NestedAccessor = {};
Object.defineProperty(canonicalV2NestedAccessor, "artifact", {
  enumerable: true,
  get() { canonicalV2NestedGetterCalls += 1; return baselineSummary; },
});
expectStop("Canonical-v2-Artefaktguard blockiert verschachtelte Accessors descriptor-first", () =>
  remote.validateDbPrewrite({ nested: canonicalV2NestedAccessor }),
"SECRET_GUARD_UNINSPECTABLE");
check("Canonical-v2-Artefaktguard führte verschachtelten Getter nicht aus",
  canonicalV2NestedGetterCalls === 0);
for (const [label, rehydrated] of [
  ["structuredClone", structuredClone(baselineSummary)],
  ["JSON", JSON.parse(JSON.stringify(baselineSummary))],
  ["Plain", { ...baselineSummary }],
]) {
  const error = expectStop(`Canonical-v2-Summary-${label} bleibt unbranded`, () =>
    remote.validateEvidenceRecord(rehydrated));
  check(`Canonical-v2-Summary-${label} besitzt keine modulinterne Provenienz`,
    error.reasonCode !== "CANONICAL_V2_ARTIFACT_REJECTED");
}
for (const [label, sink] of [
  ["Evidencevalidator", () => remote.validateEvidenceRecord(canonicalV2Session)],
  ["Evidencebytes", () => remote.canonicalRecordBytes(canonicalV2Session)],
  ["Evidencewriter", () => remote.writeEvidence("/private/tmp/not-used", canonicalV2Session)],
  ["Canonical-Gate", () => remote.validateCanonicalEvidenceGate({
    role: "22-canonical-detail", finalCommit: FINAL_COMMIT,
    runId: `${FINAL_COMMIT}-${"a".repeat(16)}`, facts: {}, evidenceByRole: {},
    canonicalGate: sourceTranscript,
  })],
]) {
  expectStop(`Canonical-v2-Untrusted-Artefakt bleibt am ${label} fail-closed`, sink);
}

check("Test selbst hat keine echte Remote-/Executoroperation aufgerufen", remote.__wave === "A");
console.log(`e17b_remote_window_test: ${ok} Checks bestanden.`);
