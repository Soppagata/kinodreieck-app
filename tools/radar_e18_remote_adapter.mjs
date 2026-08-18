#!/usr/bin/env node
/* E18-Remoteadapter: commitfaehige, effektinjizierte Verbindung zwischen
   E17A-Reparatur-One-Shot und Radar-Websearch-Paket B.

   Das Modul startet selbst keine Credential-, Netzwerk-, DB-, Function- oder
   Provideroperation. Jeder moegliche Effekt passiert ausschliesslich hinter
   einem validierten Blueprint und einem injizierten Executor. Der direkte
   Dry-Run ist effektfrei; ein Effektlauf braucht den expliziten Startmarker.
*/

import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  RadarE17ARepairStop,
  createRadarE17ARepairOnce,
  loadRadarE17ARepairContract,
} from "./radar_e17a_repair_once.mjs";
import {
  ANTHROPIC_PROVIDER_KEYCHAIN,
  RadarRemoteStartStop,
  SUPABASE_INFRA_KEYCHAIN,
  createRadarRemotePreflightOnce,
} from "./radar_websearch_remote_start.mjs";

export const RADAR_E18_PROJECT_REF = "bscjgwcntapobyxsiyce";
export const RADAR_E18_MIGRATIONS = Object.freeze([
  "20260817120000",
  "20260817180000",
  "20260817190000",
]);
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
    migrations: Object.freeze([RADAR_E18_MIGRATIONS[0]]),
  }],
  ["e17a-backup", "backup", "e17a", { projectRef: RADAR_E18_PROJECT_REF }],
  ["e17a-restore", "disposable-restore", "e17a", { localOnly: true }],
  ["e17a-write", "migration-write", "e17a", {
    projectRef: RADAR_E18_PROJECT_REF,
    migrations: Object.freeze([RADAR_E18_MIGRATIONS[0]]),
  }],
  ["e17a-postflight", "remote-read", "e17a", {
    projectRef: RADAR_E18_PROJECT_REF,
    migrations: Object.freeze([RADAR_E18_MIGRATIONS[0]]),
  }],
  ["e17a-cleanup", "cleanup", "e17a", { localOnly: true }],
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
    migrations: Object.freeze(RADAR_E18_MIGRATIONS.slice(1)),
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
const PACKAGE_B_RECEIPTS = Object.freeze({
  "package-b-backup": "BACKUP_CREATED",
  "package-b-restore": "DISPOSABLE_RESTORE_VERIFIED",
  "package-b-migrations": "MIGRATIONS_APPLIED",
  "package-b-function": "FUNCTION_DEPLOYED",
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

function makeBlueprint([id, operation, stage, target]) {
  return deepFreeze({
    id,
    operation,
    stage,
    attempts: BLUEPRINT_ATTEMPTS,
    target: { ...target },
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

function requireExecutor(executeBlueprint) {
  if (typeof executeBlueprint !== "function") {
    stop("PROCESS_BLUEPRINT_EXECUTOR_REQUIRED", "E18-Effektmodus braucht einen injizierten Executor.");
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
  return new RadarE18AdapterStop(
    `STOP_${phase.toUpperCase().replaceAll("-", "_")}`,
    `E18 stoppte in ${phase}; keine automatische Wiederholung.`,
  );
}

export function createRadarE18CommittedAdapter({
  authorization,
  blueprints = createRadarE18ProcessBlueprints(),
  executeBlueprint,
  createE17AOnce = createRadarE17ARepairOnce,
  loadE17AContract = loadRadarE17ARepairContract,
  createPackageBPreflightOnce = createRadarRemotePreflightOnce,
} = {}) {
  requireAuthorization(authorization);
  const blueprintList = validateBlueprintSet(blueprints);
  const executor = requireExecutor(executeBlueprint);
  const e17aFactory = requireFactory("E17A", createE17AOnce);
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
    let stage = "e17a";
    let phase = "e17a-local-gate";
    let packageBCleanupNeeded = false;

    const invoke = async (id, input = {}) => {
      phase = id;
      const blueprint = byId.get(id);
      if (!blueprint) stop("BLUEPRINT_ID_REJECTED", "Unbekannter E18-Blueprint.");
      try {
        const result = await executor(blueprint, input);
        trace.push(id);
        return result;
      } catch (error) {
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

    const e17aRun = e17aFactory({
      async localGate() { return contractLoader(); },
      async remoteRead({ contract }) {
        await readSupabaseCredentials();
        return invoke("e17a-remote-read", { contract, secretContext });
      },
      async backup(input) {
        return invoke("e17a-backup", { ...input, secretContext });
      },
      async restore(input) { return invoke("e17a-restore", input); },
      async write(input) {
        return invoke("e17a-write", { ...input, secretContext });
      },
      async postflight(input) {
        return invoke("e17a-postflight", { ...input, secretContext });
      },
      async cleanup(input) {
        const receipt = await invoke("e17a-cleanup", input);
        if (input.stopped) {
          credentials.accessToken = null;
          credentials.dbPassword = null;
          credentials.anthropicApiKey = null;
        }
        return receipt;
      },
    });

    try {
      const e17aResult = await e17aRun();
      if (!plainObject(e17aResult) || e17aResult.status !== "E17A_REPAIR_COMPLETE") {
        stop("E17A_RESULT_INVALID", "E17A-One-Shot meldete keinen exakten Abschluss.");
      }
      trace.push("e17a-complete");

      stage = "package-b";
      packageBCleanupNeeded = true;
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
          const result = await invoke("package-b-provider-secret-write", { secretContext });
          credentials.anthropicApiKey = null;
          return result;
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
      if (stage === "package-b" && packageBCleanupNeeded) {
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
  createE17AOnce,
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
      migrations: RADAR_E18_MIGRATIONS,
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
      ...(createE17AOnce ? { createE17AOnce } : {}),
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
