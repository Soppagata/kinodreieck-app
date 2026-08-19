#!/usr/bin/env node
/* E18-Remoteadapter: commitfaehige, effektinjizierte Verbindung zwischen
   ausstehender E17A-Basismigration und Radar-Websearch-Paket B.

   Jeder moegliche Effekt passiert ausschliesslich hinter einem validierten,
   commitgebundenen Prozessblueprint. Der direkte Dry-Run ist effektfrei; ein
   Effektlauf braucht den expliziten Startmarker und nutzt ohne Testinjektion
   den engen Default-Executor.
*/

import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  RADAR_E17A_LEDGER_NAME,
  RADAR_E17A_MIGRATION_PATH,
  RADAR_E17A_MIGRATION_SHA256,
  RADAR_E17A_MIGRATION_VERSION,
  RadarE17ARepairStop,
  loadRadarE17ARepairContract,
} from "./radar_e17a_repair_once.mjs";
import {
  ANTHROPIC_PROVIDER_KEYCHAIN,
  RadarRemoteStartStop,
  SUPABASE_INFRA_KEYCHAIN,
  createRadarRemotePreflightOnce,
  validateRadarLedgerBaseline,
} from "./radar_websearch_remote_start.mjs";
import {
  RadarE18ProcessStop,
  createRadarE18DefaultExecutor,
  createRadarE18ProcessContract,
  validateRadarE18ProcessContract,
} from "./radar_e18_process_executor.mjs";

export const RADAR_E18_PROJECT_REF = "bscjgwcntapobyxsiyce";
export const RADAR_E18_BASELINE_MIGRATION = RADAR_E17A_MIGRATION_VERSION;
export const RADAR_E18_MUTATION_MIGRATIONS = Object.freeze([
  RADAR_E18_BASELINE_MIGRATION,
  "20260817180000",
  "20260817190000",
]);
export const RADAR_E18_MIGRATIONS = Object.freeze([...RADAR_E18_MUTATION_MIGRATIONS]);
export const RADAR_E18_FUNCTION = "radar-websearch-task";
export const RADAR_E18_LIVE_COMMAND = Object.freeze([
  "npm", "run", "test:ai:live", "--", "--radar-websearch-once",
]);
export const RADAR_E18_AUTHORIZATION_FLAG = "--owner-authorized-e18-remote-once";
export const RADAR_E18_EXECUTE_FLAG = "--execute";
export const RADAR_E18_DRY_RUN_FLAG = "--dry-run";

const authorizationBrand = new WeakSet();
const blueprintSetBrand = new WeakSet();
const BLUEPRINT_ATTEMPTS = 1;

const BLUEPRINT_DEFINITIONS = Object.freeze([
  ["credential-supabase-access-token", "credential-read", "e17a", {
    keychain: Object.freeze({
      service: SUPABASE_INFRA_KEYCHAIN.service,
      account: SUPABASE_INFRA_KEYCHAIN.accounts[0],
    }),
  }],
  ["credential-db-postgres-password", "credential-read", "e17a", {
    keychain: Object.freeze({
      service: SUPABASE_INFRA_KEYCHAIN.service,
      account: SUPABASE_INFRA_KEYCHAIN.accounts[1],
    }),
  }],
  ["e17a-remote-read", "remote-read", "e17a", {
    projectRef: RADAR_E18_PROJECT_REF,
    migrations: Object.freeze([RADAR_E18_BASELINE_MIGRATION]),
  }],
  ["package-b-local-closure", "local-gate", "package-b", { localOnly: true }],
  ["package-b-local-workspace", "local-gate", "package-b", { localOnly: true }],
  ["package-b-local-cli", "local-gate", "package-b", { localOnly: true }],
  ["package-b-remote-read", "remote-read", "package-b", {
    projectRef: RADAR_E18_PROJECT_REF,
    migrations: RADAR_E18_MIGRATIONS,
    functionName: RADAR_E18_FUNCTION,
  }],
  ["credential-anthropic-api-key", "credential-read", "package-b", {
    condition: "remote-anthropic-secret-missing",
    keychain: ANTHROPIC_PROVIDER_KEYCHAIN,
  }],
  ["package-b-provider-secret-write", "secret-write", "package-b", {
    condition: "remote-anthropic-secret-missing",
    projectRef: RADAR_E18_PROJECT_REF,
    functionName: RADAR_E18_FUNCTION,
    secretName: ANTHROPIC_PROVIDER_KEYCHAIN.account,
  }],
  ["package-b-backup", "backup", "package-b", { projectRef: RADAR_E18_PROJECT_REF }],
  ["package-b-restore", "disposable-restore", "package-b", { localOnly: true }],
  ["package-b-migrations", "migration-write", "package-b", {
    projectRef: RADAR_E18_PROJECT_REF,
    migrations: RADAR_E18_MUTATION_MIGRATIONS,
  }],
  ["package-b-function", "function-deploy", "package-b", {
    projectRef: RADAR_E18_PROJECT_REF,
    functionName: RADAR_E18_FUNCTION,
  }],
  ["package-b-secret-flags", "secret-flag-write", "package-b", {
    projectRef: RADAR_E18_PROJECT_REF,
    functionName: RADAR_E18_FUNCTION,
  }],
  ["package-b-live-request", "live-command", "package-b", {
    projectRef: RADAR_E18_PROJECT_REF,
    functionName: RADAR_E18_FUNCTION,
    command: RADAR_E18_LIVE_COMMAND,
  }],
  ["package-b-postflight", "remote-read", "package-b", {
    projectRef: RADAR_E18_PROJECT_REF,
    migrations: RADAR_E18_MIGRATIONS,
    functionName: RADAR_E18_FUNCTION,
  }],
  ["package-b-cleanup", "cleanup", "package-b", { localOnly: true }],
]);

const EXPECTED_BLUEPRINT_IDS = Object.freeze(BLUEPRINT_DEFINITIONS.map(([id]) => id));
const EXPECTED_LEDGER_BASELINE_COUNT = 35;
const EXPECTED_PREVIOUS_LEDGER_VERSION = "20260816010000";
const BASELINE_LIMIT_KEYS = Object.freeze({
  task_modell: "blog-profile-extract",
  task_max_tokens: "blog-profile-extract",
  task_max_reservierung_usd_cent: "blog-profile-extract",
});
const PACKAGE_B_RECEIPTS = Object.freeze({
  "package-b-backup": "BACKUP_CREATED",
  "package-b-restore": "DISPOSABLE_RESTORE_VERIFIED",
  "package-b-migrations": "MIGRATIONS_APPLIED",
  "package-b-function": "FUNCTION_DEPLOYED",
  "package-b-provider-secret-write": "PROVIDER_SECRET_CONFIGURED",
  "package-b-secret-flags": "SECRET_FLAGS_CONFIGURED",
  "package-b-live-request": "LIVE_REQUEST_COMPLETE",
  "package-b-postflight": "POSTFLIGHT_COMPLETE",
  "package-b-cleanup": "CLEANUP_COMPLETE",
});

export class RadarE18AdapterStop extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RadarE18AdapterStop";
    this.code = code;
  }
}

function stop(code, message) {
  throw new RadarE18AdapterStop(code, message);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function plainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactPlainObject(value, keys) {
  return plainObject(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function validateBaselineContract(contract) {
  const ledgerVersions = Array.isArray(contract?.expectedLedgerBaseline)
    ? contract.expectedLedgerBaseline.map((row) => row?.version)
    : [];
  if (!plainObject(contract)
      || !/^[0-9a-f]{40}$/.test(String(contract.finalCommit || ""))
      || contract.migrationPath !== RADAR_E17A_MIGRATION_PATH
      || !Array.isArray(contract.expectedLedgerBaseline)
      || contract.expectedLedgerBaseline.length !== EXPECTED_LEDGER_BASELINE_COUNT
      || contract.expectedLedgerBaseline.some((row, index) => (
        !exactPlainObject(row, ["name", "version"])
        || !/^[0-9]{14}$/.test(row.version)
        || !/^[a-z0-9_]+$/.test(row.name)
        || row.version >= RADAR_E18_BASELINE_MIGRATION
        || (index > 0 && row.version <= ledgerVersions[index - 1])
      ))
      || new Set(ledgerVersions).size !== EXPECTED_LEDGER_BASELINE_COUNT
      || ledgerVersions.at(-1) !== EXPECTED_PREVIOUS_LEDGER_VERSION
      || !isDeepStrictEqual(contract.targetHistory, {
        version: RADAR_E18_BASELINE_MIGRATION,
        name: RADAR_E17A_LEDGER_NAME,
      })
      || !isDeepStrictEqual(contract.targetLedger, {
        version: RADAR_E18_BASELINE_MIGRATION,
        name: RADAR_E17A_LEDGER_NAME,
        statements: [],
      })) {
    stop("BASELINE_MIGRATION_CONTRACT_DRIFT", "Lokaler E17A-Baselinevertrag ist nicht exakt.");
  }
  if (contract.migrationSha256 !== RADAR_E17A_MIGRATION_SHA256) {
    stop("BASELINE_MIGRATION_HASH_DRIFT", "Lokaler E17A-Migrationshash driftet.");
  }
  return contract;
}

function isJsonScalar(value) {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

function validatePendingBaseline(state, contract) {
  if (!exactPlainObject(state, ["ledger", "limits", "targetLedger"])
      || !exactPlainObject(state.limits, Object.keys(BASELINE_LIMIT_KEYS))) {
    stop("BASELINE_MIGRATION_STATE_DRIFT", "Remote E17A-Baselinezustand ist formfremd.");
  }
  validateRadarLedgerBaseline(state.ledger, contract.expectedLedgerBaseline);
  if (state.targetLedger !== null) {
    stop("BASELINE_MIGRATION_STATE_DRIFT", "Remote E17A-Zielmigration ist nicht absent.");
  }
  for (const [rowName, targetKey] of Object.entries(BASELINE_LIMIT_KEYS)) {
    const row = state.limits[rowName];
    if (!plainObject(row) || !Object.values(row).every(isJsonScalar)
        || Object.hasOwn(row, targetKey)) {
      stop("BASELINE_MIGRATION_STATE_DRIFT", "Remote E17A-Limitzustand ist nicht exakt.");
    }
  }
  return state;
}

function makeBlueprint([id, operation, stage, target]) {
  const targetCopy = deepFreeze({ ...target });
  return deepFreeze({
    id,
    operation,
    stage,
    attempts: BLUEPRINT_ATTEMPTS,
    target: targetCopy,
    process: createRadarE18ProcessContract(id, targetCopy),
  });
}

export function createRadarE18ProcessBlueprints() {
  const blueprints = Object.freeze(BLUEPRINT_DEFINITIONS.map(makeBlueprint));
  blueprintSetBrand.add(blueprints);
  return blueprints;
}

function validateBlueprintSet(blueprints) {
  if (!Array.isArray(blueprints) || !blueprintSetBrand.has(blueprints)
      || !isDeepStrictEqual(blueprints.map(({ id }) => id), EXPECTED_BLUEPRINT_IDS)) {
    stop("BLUEPRINT_SET_INVALID", "E18 braucht den intern erzeugten exakten Blueprintsatz.");
  }
  for (const blueprint of blueprints) {
    if (!plainObject(blueprint) || blueprint.attempts !== 1 || !plainObject(blueprint.target)) {
      stop("BLUEPRINT_INVALID", "E18-Blueprint ist formfremd oder erlaubt Wiederholung.");
    }
    try {
      validateRadarE18ProcessContract(blueprint);
    } catch (error) {
      if (error instanceof RadarE18ProcessStop) {
        stop(error.code, "E18-Prozessblueprint ist nicht exakt.");
      }
      throw error;
    }
    const target = blueprint.target;
    if (Object.hasOwn(target, "projectRef") && target.projectRef !== RADAR_E18_PROJECT_REF) {
      stop("BLUEPRINT_PROJECT_REJECTED", "E18-Blueprint adressiert ein fremdes Projekt.");
    }
    if (Object.hasOwn(target, "migrations")
        && (!Array.isArray(target.migrations)
          || target.migrations.some((version) => !RADAR_E18_MIGRATIONS.includes(version)))) {
      stop("BLUEPRINT_MIGRATION_REJECTED", "E18-Blueprint adressiert eine fremde Migration.");
    }
    if (Object.hasOwn(target, "functionName") && target.functionName !== RADAR_E18_FUNCTION) {
      stop("BLUEPRINT_FUNCTION_REJECTED", "E18-Blueprint adressiert eine fremde Function.");
    }
    if (Object.hasOwn(target, "command")
        && !isDeepStrictEqual(target.command, RADAR_E18_LIVE_COMMAND)) {
      stop("BLUEPRINT_COMMAND_REJECTED", "E18-Blueprint adressiert einen fremden Live-Befehl.");
    }
    if (Object.hasOwn(target, "keychain")) {
      const allowed = [
        ...SUPABASE_INFRA_KEYCHAIN.accounts.map((account) => ({
          service: SUPABASE_INFRA_KEYCHAIN.service,
          account,
        })),
        ANTHROPIC_PROVIDER_KEYCHAIN,
      ];
      if (!allowed.some((entry) => isDeepStrictEqual(entry, target.keychain))) {
        stop("BLUEPRINT_KEYCHAIN_REJECTED", "E18-Blueprint adressiert einen fremden Keychain-Eintrag.");
      }
    }
  }
  return blueprints;
}

export function createRadarE18AuthorizationMarker(flag) {
  if (flag !== RADAR_E18_AUTHORIZATION_FLAG) {
    stop("REMOTE_AUTHORIZATION_REQUIRED", "E18-Effektmodus braucht den exakten Startmarker.");
  }
  const marker = Object.freeze({ kind: "radar-e18-authorized-once" });
  authorizationBrand.add(marker);
  return marker;
}

function requireAuthorization(marker) {
  if (!marker || !authorizationBrand.has(marker)) {
    stop("REMOTE_AUTHORIZATION_REQUIRED", "E18-Effektmodus ist ohne gebrandeten Startmarker gesperrt.");
  }
  return marker;
}

function requireExecutor(executeBlueprint, defaultExecutorOptions) {
  if (executeBlueprint === undefined) {
    return createRadarE18DefaultExecutor(defaultExecutorOptions);
  }
  if (typeof executeBlueprint !== "function") {
    stop("PROCESS_BLUEPRINT_EXECUTOR_INVALID", "E18-Executor ist nicht aufrufbar.");
  }
  return executeBlueprint;
}

function requireFactory(name, value) {
  if (typeof value !== "function") stop("ADAPTER_FACTORY_INVALID", `E18-Factory ${name} fehlt.`);
  return value;
}

function validateCredential(value) {
  if (typeof value !== "string" || value.length < 1 || /[\0\r\n]/.test(value)) {
    stop("CREDENTIAL_RESULT_INVALID", "Credential-Executor lieferte keinen prozessinternen Wert.");
  }
  return value;
}

function validatePackageBReceipt(id, receipt) {
  const expected = PACKAGE_B_RECEIPTS[id];
  if (!plainObject(receipt)
      || !isDeepStrictEqual(Object.keys(receipt).sort(), ["status"])
      || receipt.status !== expected) {
    stop("PACKAGE_B_RECEIPT_INVALID", `Paket-B-Beleg fuer ${id} ist nicht exakt.`);
  }
  return receipt;
}

function normalizeFailure(error, phase) {
  if (error instanceof RadarE18AdapterStop) return error;
  if (error instanceof RadarE17ARepairStop || error instanceof RadarRemoteStartStop) {
    return new RadarE18AdapterStop(error.code, "Untervertrag stoppte fail-closed.");
  }
  if (error instanceof RadarE18ProcessStop) {
    return new RadarE18AdapterStop(error.code, "Prozessvertrag stoppte fail-closed.");
  }
  return new RadarE18AdapterStop(
    `STOP_${phase.toUpperCase().replaceAll("-", "_")}`,
    `E18 stoppte in ${phase}; keine automatische Wiederholung.`,
  );
}

export function createRadarE18CommittedAdapter({
  authorization,
  blueprints = createRadarE18ProcessBlueprints(),
  executeBlueprint,
  defaultExecutorOptions,
  loadE17AContract = loadRadarE17ARepairContract,
  createPackageBPreflightOnce = createRadarRemotePreflightOnce,
} = {}) {
  requireAuthorization(authorization);
  const blueprintList = validateBlueprintSet(blueprints);
  const executor = requireExecutor(executeBlueprint, defaultExecutorOptions);
  const contractLoader = requireFactory("E17A-Contract", loadE17AContract);
  const packageBFactory = requireFactory("Paket-B-Preflight", createPackageBPreflightOnce);
  const byId = new Map(blueprintList.map((blueprint) => [blueprint.id, blueprint]));
  let used = false;

  return async function runOnce() {
    if (used) stop("AUTONOMIE_STOPP_NO_RETRY", "Dieser E18-Adapter wurde bereits verbraucht.");
    used = true;
    const trace = ["start-marker"];
    const credentials = { accessToken: null, dbPassword: null, anthropicApiKey: null };
    const secretContext = Object.freeze({
      kind: "radar-e18-runtime-secrets",
      read(name) {
        const table = {
          "supabase-access-token": credentials.accessToken,
          "db-postgres-password": credentials.dbPassword,
          "anthropic-api-key": credentials.anthropicApiKey,
        };
        if (!Object.hasOwn(table, name) || table[name] === null) {
          stop("RUNTIME_SECRET_UNAVAILABLE", "Angefragtes Laufzeitsecret ist nicht freigegeben.");
        }
        return table[name];
      },
    });
    let phase = "e17a-baseline-local-gate";
    let packageBCleanupNeeded = false;
    let providerSecretPending = false;

    const invoke = async (id, input = {}) => {
      phase = id;
      const blueprint = byId.get(id);
      if (!blueprint) stop("BLUEPRINT_ID_REJECTED", "Unbekannter E18-Blueprint.");
      try {
        const result = await executor(blueprint, input);
        trace.push(id);
        return result;
      } catch (error) {
        if (error instanceof RadarE18ProcessStop) {
          throw new RadarRemoteStartStop(error.code, "Prozessvertrag stoppte fail-closed.");
        }
        if (error instanceof RadarRemoteStartStop || error instanceof RadarE17ARepairStop) {
          throw error;
        }
        throw normalizeFailure(error, id);
      }
    };

    const readSupabaseCredentials = async () => {
      if (credentials.accessToken === null) {
        credentials.accessToken = validateCredential(
          await invoke("credential-supabase-access-token"),
        );
      }
      if (credentials.dbPassword === null) {
        credentials.dbPassword = validateCredential(
          await invoke("credential-db-postgres-password"),
        );
      }
      return credentials;
    };

    try {
      const baselineContract = validateBaselineContract(await contractLoader());
      packageBCleanupNeeded = true;
      await readSupabaseCredentials();
      validatePendingBaseline(
        await invoke("e17a-remote-read", { secretContext }),
        baselineContract,
      );
      trace.push("e17a-baseline-absent-confirmed");

      const packageBPreflight = packageBFactory({
        async localClosureGate() { return invoke("package-b-local-closure"); },
        async localWorkspaceGate(input) { return invoke("package-b-local-workspace", input); },
        async localCliGate(input) { return invoke("package-b-local-cli", input); },
        async readCredential(ref) {
          if (ref.service === SUPABASE_INFRA_KEYCHAIN.service
              && ref.account === SUPABASE_INFRA_KEYCHAIN.accounts[0]) {
            return credentials.accessToken;
          }
          if (ref.service === SUPABASE_INFRA_KEYCHAIN.service
              && ref.account === SUPABASE_INFRA_KEYCHAIN.accounts[1]) {
            return credentials.dbPassword;
          }
          if (isDeepStrictEqual(ref, ANTHROPIC_PROVIDER_KEYCHAIN)) {
            credentials.anthropicApiKey = validateCredential(
              await invoke("credential-anthropic-api-key"),
            );
            return credentials.anthropicApiKey;
          }
          stop("KEYCHAIN_REFERENCE_REJECTED", "Paket-B-Preflight fragte einen fremden Keychain-Eintrag an.");
        },
        async remoteRead({ accessToken, dbPassword, closure, workspace }) {
          if (accessToken !== credentials.accessToken || dbPassword !== credentials.dbPassword) {
            stop("RUNTIME_SECRET_CONTEXT_MISMATCH", "Paket-B-Preflight verlor den Secret-Kontext.");
          }
          return invoke("package-b-remote-read", { closure, workspace, secretContext });
        },
        async writeMissingProviderSecret({ anthropicApiKey }) {
          if (anthropicApiKey !== credentials.anthropicApiKey) {
            stop("RUNTIME_SECRET_CONTEXT_MISMATCH", "Providerwrite verlor den Secret-Kontext.");
          }
          providerSecretPending = true;
          return Object.freeze({ status: "PROVIDER_SECRET_DEFERRED_UNTIL_BACKUP" });
        },
      });
      const preflightResult = await packageBPreflight();
      if (!plainObject(preflightResult) || preflightResult.status !== "REMOTE_READ_COMPLETE") {
        stop("PACKAGE_B_PREFLIGHT_INVALID", "Paket-B-Preflight meldete keinen exakten Abschluss.");
      }
      trace.push("package-b-preflight-complete");

      for (const id of [
        "package-b-backup",
        "package-b-restore",
        "package-b-migrations",
        "package-b-function",
      ]) {
        validatePackageBReceipt(id, await invoke(id, {
          preflight: preflightResult,
          secretContext,
        }));
      }
      if (providerSecretPending) {
        validatePackageBReceipt(
          "package-b-provider-secret-write",
          await invoke("package-b-provider-secret-write", { preflight: preflightResult, secretContext }),
        );
        providerSecretPending = false;
        credentials.anthropicApiKey = null;
      }
      for (const id of [
        "package-b-secret-flags",
        "package-b-live-request",
        "package-b-postflight",
      ]) {
        validatePackageBReceipt(id, await invoke(id, {
          preflight: preflightResult,
          secretContext,
        }));
      }

      packageBCleanupNeeded = false;
      validatePackageBReceipt("package-b-cleanup", await invoke("package-b-cleanup", {
        stopped: false,
      }));
      credentials.accessToken = null;
      credentials.dbPassword = null;
      credentials.anthropicApiKey = null;
      trace.push("package-b-complete");
      return Object.freeze({
        status: "E18_REMOTE_CHAIN_COMPLETE",
        providerSecretAction: preflightResult.providerSecretAction,
        trace: Object.freeze([...trace]),
      });
    } catch (error) {
      const failure = normalizeFailure(error, phase);
      if (packageBCleanupNeeded) {
        packageBCleanupNeeded = false;
        try {
          validatePackageBReceipt("package-b-cleanup", await invoke("package-b-cleanup", {
            stopped: true,
            failedPhase: phase,
          }));
        } catch (cleanupError) {
          credentials.accessToken = null;
          credentials.dbPassword = null;
          credentials.anthropicApiKey = null;
          throw normalizeFailure(cleanupError, "package-b-cleanup");
        }
      }
      credentials.accessToken = null;
      credentials.dbPassword = null;
      credentials.anthropicApiKey = null;
      throw failure;
    }
  };
}

export async function main(argv = process.argv.slice(2), {
  ausgabe = console.log,
  fehlerAusgabe = console.error,
  executeBlueprint,
  defaultExecutorOptions,
  loadE17AContract,
  createPackageBPreflightOnce,
} = {}) {
  if (isDeepStrictEqual(argv, [RADAR_E18_DRY_RUN_FLAG])) {
    const blueprints = validateBlueprintSet(createRadarE18ProcessBlueprints());
    ausgabe(JSON.stringify({
      status: "E18_REMOTE_ADAPTER_DRY_RUN",
      attempts: 1,
      blueprintIds: blueprints.map(({ id }) => id),
      projectRef: RADAR_E18_PROJECT_REF,
      baselineMigration: RADAR_E18_BASELINE_MIGRATION,
      baselineMigrationState: "absent",
      expectedLedgerCount: EXPECTED_LEDGER_BASELINE_COUNT,
      requiredMigrations: RADAR_E18_MIGRATIONS,
      mutationMigrations: RADAR_E18_MUTATION_MIGRATIONS,
      functionName: RADAR_E18_FUNCTION,
      liveCommand: RADAR_E18_LIVE_COMMAND.join(" "),
    }));
    return 0;
  }
  if (!isDeepStrictEqual(argv, [RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG])) {
    fehlerAusgabe("REMOTE_AUTHORIZATION_REQUIRED");
    return 75;
  }
  try {
    const run = createRadarE18CommittedAdapter({
      authorization: createRadarE18AuthorizationMarker(argv[1]),
      executeBlueprint,
      defaultExecutorOptions,
      ...(loadE17AContract ? { loadE17AContract } : {}),
      ...(createPackageBPreflightOnce ? { createPackageBPreflightOnce } : {}),
    });
    const result = await run();
    ausgabe(JSON.stringify(result));
    return 0;
  } catch (error) {
    fehlerAusgabe(error instanceof RadarE18AdapterStop ? error.code : "E18_ADAPTER_FAILED");
    return 75;
  }
}

const direktGestartet = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direktGestartet) {
  main().then((code) => { process.exitCode = code; });
}
