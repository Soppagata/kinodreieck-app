/* E18 committed Remoteadapter: ausschliesslich lokale Spies/Fakes. */
import assert from "node:assert/strict";
import {
  RADAR_E18_AUTHORIZATION_FLAG,
  RADAR_E18_DRY_RUN_FLAG,
  RADAR_E18_EXECUTE_FLAG,
  RADAR_E18_FUNCTION,
  RADAR_E18_LIVE_COMMAND,
  RADAR_E18_MIGRATIONS,
  RADAR_E18_PROJECT_REF,
  RadarE18AdapterStop,
  createRadarE18AuthorizationMarker,
  createRadarE18CommittedAdapter,
  createRadarE18ProcessBlueprints,
  main,
} from "./tools/radar_e18_remote_adapter.mjs";
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

function fakeE17AFactory(effects) {
  let used = false;
  return async () => {
    if (used) throw Object.assign(new Error("used"), { code: "AUTONOMIE_STOPP_NO_RETRY" });
    used = true;
    let stopped = true;
    try {
      const contract = await effects.localGate();
      const preflight = await effects.remoteRead({ contract });
      const backupReceipt = await effects.backup({ contract, preflight });
      const restoreReceipt = await effects.restore({ backupReceipt, contract, preflight });
      const writeReceipt = await effects.write({ transactionSha256: "synthetic", sql: "synthetic" });
      await effects.postflight({ backupReceipt, contract, preflight, restoreReceipt, writeReceipt });
      stopped = false;
      return { status: "E17A_REPAIR_COMPLETE" };
    } finally {
      await effects.cleanup({ stopped, phase: stopped ? "synthetic-stop" : "postflight" });
    }
  };
}

const expectedReceipts = Object.freeze({
  "e17a-backup": { status: "BACKUP_CREATED" },
  "e17a-restore": { status: "DISPOSABLE_RESTORE_VERIFIED" },
  "e17a-write": { status: "ONE_BOUNDED_MUTATION" },
  "e17a-cleanup": { status: "CLEANUP_COMPLETE" },
  "package-b-backup": { status: "BACKUP_CREATED" },
  "package-b-restore": { status: "DISPOSABLE_RESTORE_VERIFIED" },
  "package-b-migrations": { status: "MIGRATIONS_APPLIED" },
  "package-b-function": { status: "FUNCTION_DEPLOYED" },
  "package-b-secret-flags": { status: "SECRET_FLAGS_CONFIGURED" },
  "package-b-live-request": { status: "LIVE_REQUEST_COMPLETE" },
  "package-b-postflight": { status: "POSTFLIGHT_COMPLETE" },
  "package-b-cleanup": { status: "CLEANUP_COMPLETE" },
});

function fixture({ failAt = null, anthropicState = "PRESENT" } = {}) {
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
    if (blueprint.id === "package-b-remote-read") {
      return { anthropicApiKey: anthropicState };
    }
    return expectedReceipts[blueprint.id] || {};
  };
  const run = createRadarE18CommittedAdapter({
    authorization: createRadarE18AuthorizationMarker(RADAR_E18_AUTHORIZATION_FLAG),
    executeBlueprint,
    createE17AOnce: fakeE17AFactory,
    loadE17AContract: () => Object.freeze({ synthetic: true }),
  });
  return { calls, inputs, run, secrets };
}

function isStop(code) {
  return (error) => error instanceof RadarE18AdapterStop && error.code === code;
}

await check("Blueprintsatz ist exakt one-shot und auf Projekt, Migrationen, Function und Live-Befehl begrenzt", () => {
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
    loadE17AContract() { contractLoads += 1; },
    ausgabe() {},
    fehlerAusgabe: (line) => exactErr.push(line),
  });
  assert.equal(exactCode, 75);
  assert.deepEqual(exactErr, ["PROCESS_BLUEPRINT_EXECUTOR_REQUIRED"]);
  assert.equal(contractLoads, 0);
});

await check("Gruenpfad verbindet E17A und Paket B strikt seriell und ohne doppelte Supabase-Credentialreads", async () => {
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
    "e17a-backup",
    "e17a-restore",
    "e17a-write",
    "e17a-postflight",
    "e17a-cleanup",
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
  assert.equal(result.providerSecretAction, "written-after-remote-missing");
  assert.doesNotMatch(JSON.stringify(result), /synthetic-.*-secret/);
});

await check("Jedes rote E17A-Gate stoppt vor Paket B, fuehrt E17A-Cleanup einmal aus und wird nie wiederholt", async () => {
  for (const failed of [
    "credential-supabase-access-token",
    "credential-db-postgres-password",
    "e17a-remote-read",
    "e17a-backup",
    "e17a-restore",
    "e17a-write",
    "e17a-postflight",
  ]) {
    const f = fixture({ failAt: failed });
    await assert.rejects(f.run(), (error) => error instanceof RadarE18AdapterStop);
    assert.equal(f.calls.filter((id) => id === failed).length, 1, failed);
    assert.equal(f.calls.filter((id) => id === "e17a-cleanup").length, 1, failed);
    assert.equal(f.calls.some((id) => id.startsWith("package-b-")), false, failed);
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
