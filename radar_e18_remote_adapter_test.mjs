/* E18 committed Remoteadapter: ausschliesslich lokale Spies/Fakes. */
import assert from "node:assert/strict";
import {
  RADAR_E18_AUTHORIZATION_FLAG,
  RADAR_E18_BASELINE_MIGRATION,
  RADAR_E18_DRY_RUN_FLAG,
  RADAR_E18_EXECUTE_FLAG,
  RADAR_E18_FUNCTION,
  RADAR_E18_LIVE_COMMAND,
  RADAR_E18_MIGRATIONS,
  RADAR_E18_MUTATION_MIGRATIONS,
  RADAR_E18_PROJECT_REF,
  RadarE18AdapterStop,
  createRadarE18AuthorizationMarker,
  createRadarE18CommittedAdapter,
  createRadarE18ProcessBlueprints,
  main,
} from "./tools/radar_e18_remote_adapter.mjs";
import {
  RADAR_E17A_LEDGER_NAME,
  RADAR_E17A_MIGRATION_PATH,
  RADAR_E17A_MIGRATION_SHA256,
} from "./tools/radar_e17a_repair_once.mjs";
import {
  ANTHROPIC_PROVIDER_KEYCHAIN,
  SUPABASE_INFRA_KEYCHAIN,
} from "./tools/radar_websearch_remote_start.mjs";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const expectedReceipts = Object.freeze({
  "package-b-backup": { status: "BACKUP_CREATED" },
  "package-b-restore": { status: "DISPOSABLE_RESTORE_VERIFIED" },
  "package-b-migrations": { status: "MIGRATIONS_APPLIED" },
  "package-b-function": { status: "FUNCTION_DEPLOYED" },
  "package-b-provider-secret-write": { status: "PROVIDER_SECRET_CONFIGURED" },
  "package-b-secret-flags": { status: "SECRET_FLAGS_CONFIGURED" },
  "package-b-live-request": { status: "LIVE_REQUEST_COMPLETE" },
  "package-b-postflight": { status: "POSTFLIGHT_COMPLETE" },
  "package-b-cleanup": { status: "CLEANUP_COMPLETE" },
});

const baselineContract = Object.freeze({
  finalCommit: "f".repeat(40),
  migrationPath: RADAR_E17A_MIGRATION_PATH,
  migrationSha256: RADAR_E17A_MIGRATION_SHA256,
  expectedLedgerBaseline: Object.freeze([
    Object.freeze({ version: "20260816010000", name: "radar_deferred_trigger_privilege_fix" }),
  ]),
  targetHistory: Object.freeze({
    version: RADAR_E18_BASELINE_MIGRATION,
    name: RADAR_E17A_LEDGER_NAME,
  }),
  targetLedger: Object.freeze({
    version: RADAR_E18_BASELINE_MIGRATION,
    name: RADAR_E17A_LEDGER_NAME,
    statements: Object.freeze([]),
  }),
});

function appliedBaselineState(mode = "valid") {
  const valid = {
    ledger: [...baselineContract.expectedLedgerBaseline, baselineContract.targetHistory],
    limits: {
      task_modell: { stable: "klein", "blog-profile-extract": "klein" },
      task_max_tokens: { stable: 1000, "blog-profile-extract": 2048 },
      task_max_reservierung_usd_cent: { stable: 2, "blog-profile-extract": 5 },
    },
    targetLedger: baselineContract.targetLedger,
  };
  if (mode === "missing") {
    return { ...valid, ledger: baselineContract.expectedLedgerBaseline, targetLedger: null };
  }
  if (mode === "state-drift") {
    return { ...valid, targetLedger: { ...baselineContract.targetLedger, statements: ["unexpected"] } };
  }
  return valid;
}

function fixture({
  failAt = null,
  anthropicState = "PRESENT",
  baselineMode = "valid",
  baselineHash = RADAR_E17A_MIGRATION_SHA256,
} = {}) {
  const calls = [];
  const inputs = [];
  const secrets = Object.freeze({
    access: "synthetic-access-secret",
    database: "synthetic-db-secret",
    anthropic: "synthetic-anthropic-secret",
  });
  const executeBlueprint = async (blueprint, input) => {
    calls.push(blueprint.id);
    inputs.push(input);
    if (blueprint.id === failAt) throw new Error("synthetic failure");
    if (blueprint.id === "credential-supabase-access-token") return secrets.access;
    if (blueprint.id === "credential-db-postgres-password") return secrets.database;
    if (blueprint.id === "credential-anthropic-api-key") return secrets.anthropic;
    if (blueprint.id === "e17a-remote-read") return appliedBaselineState(baselineMode);
    if (blueprint.id === "package-b-remote-read") {
      return { anthropicApiKey: anthropicState };
    }
    return expectedReceipts[blueprint.id] || {};
  };
  const run = createRadarE18CommittedAdapter({
    authorization: createRadarE18AuthorizationMarker(RADAR_E18_AUTHORIZATION_FLAG),
    executeBlueprint,
    loadE17AContract: () => Object.freeze({ ...baselineContract, migrationSha256: baselineHash }),
  });
  return { calls, inputs, run, secrets };
}

function isStop(code) {
  return (error) => error instanceof RadarE18AdapterStop && error.code === code;
}

await check("Blueprintsatz ist one-shot; Baseline bleibt reine Vorbedingung und nur Paket A/B sind Mutationen", () => {
  const blueprints = createRadarE18ProcessBlueprints();
  assert.ok(blueprints.every(({ attempts }) => attempts === 1));
  const projects = new Set(blueprints.flatMap(({ target }) => (
    target.projectRef ? [target.projectRef] : []
  )));
  const migrations = new Set(blueprints.flatMap(({ target }) => target.migrations || []));
  const functions = new Set(blueprints.flatMap(({ target }) => (
    target.functionName ? [target.functionName] : []
  )));
  const commands = blueprints.flatMap(({ target }) => target.command ? [target.command] : []);
  assert.deepEqual([...projects], [RADAR_E18_PROJECT_REF]);
  assert.deepEqual([...migrations].sort(), [...RADAR_E18_MIGRATIONS].sort());
  assert.deepEqual([...functions], [RADAR_E18_FUNCTION]);
  assert.deepEqual(commands, [RADAR_E18_LIVE_COMMAND]);
  const migrationWrites = blueprints.filter(({ operation }) => operation === "migration-write");
  assert.deepEqual(migrationWrites.map(({ id }) => id), ["package-b-migrations"]);
  assert.deepEqual(migrationWrites[0].target.migrations, RADAR_E18_MUTATION_MIGRATIONS);
  assert.equal(migrationWrites[0].target.migrations.includes(RADAR_E18_BASELINE_MIGRATION), false);
  assert.equal(blueprints.some(({ id }) => /^e17a-(?:backup|restore|write|postflight|cleanup)$/.test(id)), false);
});

await check("Nur die zwei freigegebenen Keychain-Referenzen und ihre drei exakten Accounts sind adressierbar", () => {
  const refs = createRadarE18ProcessBlueprints()
    .flatMap(({ target }) => target.keychain ? [target.keychain] : []);
  assert.deepEqual(refs, [
    { service: SUPABASE_INFRA_KEYCHAIN.service, account: SUPABASE_INFRA_KEYCHAIN.accounts[0] },
    { service: SUPABASE_INFRA_KEYCHAIN.service, account: SUPABASE_INFRA_KEYCHAIN.accounts[1] },
    ANTHROPIC_PROVIDER_KEYCHAIN,
  ]);
  assert.equal(new Set(refs.map(({ service }) => service)).size, 2);
});

await check("Dry-Run startet weder Prozess- noch Credentialeffekt und gibt nur den sicheren Plan aus", async () => {
  let effects = 0;
  const out = [];
  const err = [];
  const code = await main([RADAR_E18_DRY_RUN_FLAG], {
    executeBlueprint() { effects += 1; throw new Error("must not run"); },
    ausgabe: (line) => out.push(line),
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 0);
  assert.equal(effects, 0);
  assert.deepEqual(err, []);
  const payload = JSON.parse(out[0]);
  assert.equal(payload.status, "E18_REMOTE_ADAPTER_DRY_RUN");
  assert.equal(payload.attempts, 1);
  assert.equal(payload.baselineMigration, RADAR_E18_BASELINE_MIGRATION);
  assert.deepEqual(payload.requiredMigrations, RADAR_E18_MIGRATIONS);
  assert.deepEqual(payload.mutationMigrations, RADAR_E18_MUTATION_MIGRATIONS);
  assert.equal(payload.mutationMigrations.includes(RADAR_E18_BASELINE_MIGRATION), false);
  assert.equal(payload.liveCommand, RADAR_E18_LIVE_COMMAND.join(" "));
  assert.doesNotMatch(out[0], /synthetic-.*-secret/);
});

await check("Effektmodus stoppt ohne exakten Startmarker vor Executor und Credential", async () => {
  let effects = 0;
  assert.throws(
    () => createRadarE18CommittedAdapter({
      authorization: Object.freeze({ kind: "radar-e18-authorized-once" }),
      executeBlueprint() { effects += 1; },
    }),
    isStop("REMOTE_AUTHORIZATION_REQUIRED"),
  );
  const err = [];
  const code = await main(["--execute"], {
    executeBlueprint() { effects += 1; },
    ausgabe() {},
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 75);
  assert.deepEqual(err, ["REMOTE_AUTHORIZATION_REQUIRED"]);
  assert.equal(effects, 0);

  const exactErr = [];
  let contractLoads = 0;
  const exactCode = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    executeBlueprint: null,
    loadE17AContract() { contractLoads += 1; },
    ausgabe() {},
    fehlerAusgabe: (line) => exactErr.push(line),
  });
  assert.equal(exactCode, 75);
  assert.deepEqual(exactErr, ["PROCESS_BLUEPRINT_EXECUTOR_INVALID"]);
  assert.equal(contractLoads, 0);
});

await check("Vorhandene unveraenderte E17A-Baseline laesst Paket B strikt seriell fortfahren", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.status, "E18_REMOTE_CHAIN_COMPLETE");
  assert.equal(result.providerSecretAction, "untouched");
  assert.equal(result.trace[0], "start-marker");
  assert.equal(result.trace.at(-1), "package-b-complete");
  assert.deepEqual(f.calls, [
    "credential-supabase-access-token",
    "credential-db-postgres-password",
    "e17a-remote-read",
    "package-b-local-closure",
    "package-b-local-workspace",
    "package-b-local-cli",
    "package-b-remote-read",
    "package-b-backup",
    "package-b-restore",
    "package-b-migrations",
    "package-b-function",
    "package-b-secret-flags",
    "package-b-live-request",
    "package-b-postflight",
    "package-b-cleanup",
  ]);
  assert.equal(f.calls.filter((id) => id === "credential-supabase-access-token").length, 1);
  assert.equal(f.calls.filter((id) => id === "credential-db-postgres-password").length, 1);
  assert.equal(f.calls.filter((id) => id === "package-b-live-request").length, 1);
  assert.equal(result.trace.includes("e17a-baseline-confirmed"), true);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-.*-secret/);
  assert.doesNotMatch(JSON.stringify(f.inputs), /synthetic-.*-secret/);
  await assert.rejects(f.run(), isStop("AUTONOMIE_STOPP_NO_RETRY"));
  assert.equal(f.calls.filter((id) => id === "package-b-live-request").length, 1);
});

await check("Provider-Key bleibt bei PRESENT unangetastet und folgt bei MISSING strikt dem Remote-Read", async () => {
  const present = fixture({ anthropicState: "PRESENT" });
  await present.run();
  assert.equal(present.calls.includes("credential-anthropic-api-key"), false);
  assert.equal(present.calls.includes("package-b-provider-secret-write"), false);

  const missing = fixture({ anthropicState: "MISSING" });
  const result = await missing.run();
  const remoteIndex = missing.calls.indexOf("package-b-remote-read");
  const keyIndex = missing.calls.indexOf("credential-anthropic-api-key");
  const writeIndex = missing.calls.indexOf("package-b-provider-secret-write");
  assert.ok(remoteIndex >= 0 && remoteIndex < keyIndex && keyIndex < writeIndex);
  assert.ok(missing.calls.indexOf("package-b-function") < writeIndex);
  assert.equal(result.providerSecretAction, "written-after-remote-missing");
  assert.doesNotMatch(JSON.stringify(result), /synthetic-.*-secret/);
});

await check("Fehlende oder driftende Basismigration stoppt vor Backup, Write und Provider ohne Retry", async () => {
  for (const [baselineMode, code] of [
    ["missing", "LEDGER_BASELINE_DRIFT"],
    ["state-drift", "BASELINE_MIGRATION_STATE_DRIFT"],
  ]) {
    const f = fixture({ baselineMode });
    await assert.rejects(f.run(), isStop(code));
    assert.equal(f.calls.filter((id) => id === "e17a-remote-read").length, 1, baselineMode);
    assert.equal(f.calls.filter((id) => id === "package-b-cleanup").length, 1, baselineMode);
    assert.equal(f.calls.some((id) => [
      "package-b-backup",
      "package-b-migrations",
      "credential-anthropic-api-key",
      "package-b-provider-secret-write",
      "package-b-live-request",
    ].includes(id)), false, baselineMode);
    const count = f.calls.length;
    await assert.rejects(f.run(), isStop("AUTONOMIE_STOPP_NO_RETRY"));
    assert.equal(f.calls.length, count, baselineMode);
    assert.doesNotMatch(JSON.stringify(f.inputs), /synthetic-.*-secret/);
  }
});

await check("Unerwarteter lokaler Basismigrationshash stoppt vor Credential und jedem Executoraufruf", async () => {
  const f = fixture({ baselineHash: "0".repeat(64) });
  await assert.rejects(f.run(), isStop("BASELINE_MIGRATION_HASH_DRIFT"));
  assert.deepEqual(f.calls, []);
  await assert.rejects(f.run(), isStop("AUTONOMIE_STOPP_NO_RETRY"));
  assert.deepEqual(f.calls, []);
});

await check("Jedes rote Baseline-Zugriffsgate stoppt vor Paket-B-Wirkungen und wird nie wiederholt", async () => {
  for (const failed of [
    "credential-supabase-access-token",
    "credential-db-postgres-password",
    "e17a-remote-read",
  ]) {
    const f = fixture({ failAt: failed });
    await assert.rejects(f.run(), (error) => error instanceof RadarE18AdapterStop);
    assert.equal(f.calls.filter((id) => id === failed).length, 1, failed);
    assert.equal(f.calls.filter((id) => id === "package-b-cleanup").length, 1, failed);
    assert.equal(f.calls.some((id) => id.startsWith("package-b-")
      && id !== "package-b-cleanup"), false, failed);
    const count = f.calls.length;
    await assert.rejects(f.run(), isStop("AUTONOMIE_STOPP_NO_RETRY"));
    assert.equal(f.calls.length, count, failed);
  }
});

await check("Jedes rote Paket-B-Gate stoppt alle Folgeeffekte und fuehrt Cleanup genau einmal aus", async () => {
  const phases = [
    "package-b-local-closure",
    "package-b-local-workspace",
    "package-b-local-cli",
    "package-b-remote-read",
    "package-b-backup",
    "package-b-restore",
    "package-b-migrations",
    "package-b-function",
    "package-b-secret-flags",
    "package-b-live-request",
    "package-b-postflight",
  ];
  for (const failed of phases) {
    const f = fixture({ failAt: failed });
    await assert.rejects(f.run(), (error) => error instanceof RadarE18AdapterStop);
    assert.equal(f.calls.filter((id) => id === failed).length, 1, failed);
    assert.equal(f.calls.filter((id) => id === "package-b-cleanup").length, 1, failed);
    const failedIndex = f.calls.indexOf(failed);
    assert.equal(f.calls.slice(failedIndex + 1, -1).length, 0, failed);
    const count = f.calls.length;
    await assert.rejects(f.run(), isStop("AUTONOMIE_STOPP_NO_RETRY"));
    assert.equal(f.calls.length, count, failed);
  }
});

await check("Cleanupfehler bleibt terminal und loest kein zweites Cleanup oder einen Retry aus", async () => {
  const f = fixture({ failAt: "package-b-cleanup" });
  await assert.rejects(f.run(), isStop("STOP_PACKAGE_B_CLEANUP"));
  assert.equal(f.calls.filter((id) => id === "package-b-cleanup").length, 1);
  const count = f.calls.length;
  await assert.rejects(f.run(), isStop("AUTONOMIE_STOPP_NO_RETRY"));
  assert.equal(f.calls.length, count);
});

console.log(`${checks} E18-Remoteadapter-Offlinechecks bestanden.`);
