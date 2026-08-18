/* E17A-Reparatur-One-Shot: ausschliesslich lokale Spies/Fakes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  RADAR_E17A_LEDGER_NAME,
  RADAR_E17A_MIGRATION_SHA256,
  RADAR_E17A_MIGRATION_VERSION,
  RADAR_E17A_TRANSACTION_SHA256,
  RadarE17ARepairStop,
  createRadarE17ARepairOnce,
  loadRadarE17ARepairContract,
} from "./tools/radar_e17a_repair_once.mjs";
import {
  RadarRemoteStartStop,
  createRadarRemotePreflightOnce,
} from "./tools/radar_websearch_remote_start.mjs";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const contract = loadRadarE17ARepairContract();
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
const digestC = "c".repeat(64);
const baseLimits = Object.freeze({
  task_modell: Object.freeze({ stable: "klein" }),
  task_max_tokens: Object.freeze({ stable: 1000 }),
  task_max_reservierung_usd_cent: Object.freeze({ stable: 2 }),
});

function reorderedBaselineLedger() {
  return contract.expectedLedgerBaseline.map(({ version, name }) => ({ name, version }));
}

function preflightState(overrides = {}) {
  return {
    ledger: reorderedBaselineLedger(),
    limits: {
      task_modell: { ...baseLimits.task_modell },
      task_max_tokens: { ...baseLimits.task_max_tokens },
      task_max_reservierung_usd_cent: { ...baseLimits.task_max_reservierung_usd_cent },
    },
    targetLedger: null,
    ...overrides,
  };
}

function postflightState(overrides = {}) {
  return {
    ledger: [
      ...reorderedBaselineLedger(),
      { name: RADAR_E17A_LEDGER_NAME, version: RADAR_E17A_MIGRATION_VERSION },
    ],
    limits: {
      task_modell: { ...baseLimits.task_modell, "blog-profile-extract": "klein" },
      task_max_tokens: { ...baseLimits.task_max_tokens, "blog-profile-extract": 2048 },
      task_max_reservierung_usd_cent: {
        ...baseLimits.task_max_reservierung_usd_cent,
        "blog-profile-extract": 5,
      },
    },
    targetLedger: {
      statements: [],
      name: RADAR_E17A_LEDGER_NAME,
      version: RADAR_E17A_MIGRATION_VERSION,
    },
    ...overrides,
  };
}

function makeEffects({ failAt = null, preflight = preflightState(), postflight = postflightState() } = {}) {
  const calls = [];
  const writes = [];
  const fail = (phase) => {
    if (failAt === phase) throw new Error(`synthetic-${phase}`);
  };
  const effects = {
    async localGate() {
      calls.push("local-gate");
      fail("local-gate");
      return contract;
    },
    async remoteRead() {
      calls.push("remote-read");
      fail("remote-read");
      return preflight;
    },
    async backup() {
      calls.push("backup");
      fail("backup");
      return {
        status: "BACKUP_CREATED",
        artifactPath: "/private/tmp/kd-e17a-one-shot.backup",
        bytes: 1,
        sha256: digestA,
      };
    },
    async restore({ backupReceipt }) {
      calls.push("restore");
      fail("restore");
      return {
        status: "DISPOSABLE_RESTORE_VERIFIED",
        backupSha256: backupReceipt.sha256,
        schemaSha256: digestB,
        dataSha256: digestC,
      };
    },
    async write(input) {
      calls.push("write");
      writes.push(input);
      fail("write");
      return {
        status: "ONE_BOUNDED_MUTATION",
        transactionSha256: input.transactionSha256,
        ledgerRows: 1,
      };
    },
    async postflight() {
      calls.push("postflight");
      fail("postflight");
      return postflight;
    },
    async cleanup() {
      calls.push("cleanup");
      fail("cleanup");
      return { status: "CLEANUP_COMPLETE" };
    },
  };
  return { calls, effects, writes };
}

function isStopCode(code) {
  return (error) => error instanceof RadarE17ARepairStop && error.code === code;
}

await check("Commitvertrag bindet exakten Migrationsblob und genau einen SQL-/Ledger-Write", () => {
  assert.equal(contract.migrationSha256, RADAR_E17A_MIGRATION_SHA256);
  assert.equal(contract.transactionSha256, RADAR_E17A_TRANSACTION_SHA256);
  assert.equal(
    createHash("sha256").update(contract.transactionSql).digest("hex"),
    RADAR_E17A_TRANSACTION_SHA256,
  );
  assert.equal(contract.expectedLedgerBaseline.length, 35);
  assert.equal((contract.transactionSql.match(/\bBEGIN\s*;/g) || []).length, 1);
  assert.equal((contract.transactionSql.match(/\bCOMMIT\s*;/g) || []).length, 1);
  assert.equal(
    (contract.transactionSql.match(/INSERT INTO supabase_migrations\.schema_migrations/g) || []).length,
    1,
  );
  assert.match(contract.transactionSql, /20260817120000.*blog_profile_extract_config/s);
  assert.doesNotMatch(contract.transactionSql, /\bdb\s+push\b/i);
});

await check("Gruenpfad laeuft strikt seriell, akzeptiert JSONB-Schluesselreihenfolge und raeumt auf", async () => {
  const fixture = makeEffects();
  const run = createRadarE17ARepairOnce(fixture.effects);
  const result = await run();
  assert.equal(result.status, "E17A_REPAIR_COMPLETE");
  assert.equal(result.transactionSha256, RADAR_E17A_TRANSACTION_SHA256);
  assert.deepEqual(result.trace, [
    "local-gate", "remote-read", "backup", "restore", "write", "postflight", "cleanup",
  ]);
  assert.deepEqual(fixture.calls, result.trace);
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.writes[0].sql, contract.transactionSql);
  await assert.rejects(run(), isStopCode("AUTONOMIE_STOPP_NO_RETRY"));
  assert.deepEqual(fixture.calls, result.trace);
});

await check("Echter Ledgerdrift stoppt vor Backup und erlaubt nur Cleanup", async () => {
  const ledger = reorderedBaselineLedger();
  ledger[0] = { ...ledger[0], name: "drift" };
  const fixture = makeEffects({ preflight: preflightState({ ledger }) });
  await assert.rejects(
    createRadarE17ARepairOnce(fixture.effects)(),
    (error) => error instanceof RadarE17ARepairStop && error.code === "LEDGER_BASELINE_DRIFT",
  );
  assert.deepEqual(fixture.calls, ["local-gate", "remote-read", "cleanup"]);
});

for (const [phase, expectedCalls] of [
  ["backup", ["local-gate", "remote-read", "backup", "cleanup"]],
  ["restore", ["local-gate", "remote-read", "backup", "restore", "cleanup"]],
  ["write", ["local-gate", "remote-read", "backup", "restore", "write", "cleanup"]],
  [
    "postflight",
    ["local-gate", "remote-read", "backup", "restore", "write", "postflight", "cleanup"],
  ],
]) {
  await check(`${phase}fehler stoppt ohne Folgeeffekt und fuehrt Cleanup genau einmal aus`, async () => {
    const fixture = makeEffects({ failAt: phase });
    await assert.rejects(
      createRadarE17ARepairOnce(fixture.effects)(),
      isStopCode(`STOP_${phase.toUpperCase()}`),
    );
    assert.deepEqual(fixture.calls, expectedCalls);
    assert.equal(fixture.calls.filter((call) => call === "cleanup").length, 1);
  });
}

await check("Zusaetzliche Postflight-Ledgerzeile wird nicht als erlaubte Aenderung akzeptiert", async () => {
  const normal = postflightState();
  const fixture = makeEffects({
    postflight: postflightState({
      ledger: [...normal.ledger, { version: "20260817120001", name: "unexpected" }],
    }),
  });
  await assert.rejects(
    createRadarE17ARepairOnce(fixture.effects)(),
    isStopCode("LEDGER_POSTFLIGHT_DRIFT"),
  );
  assert.deepEqual(fixture.calls.at(-1), "cleanup");
});

await check("Cleanupfehler bleibt terminal und startet keinen zweiten Effekt", async () => {
  const fixture = makeEffects({ failAt: "cleanup" });
  await assert.rejects(
    createRadarE17ARepairOnce(fixture.effects)(),
    isStopCode("STOP_CLEANUP"),
  );
  assert.equal(fixture.calls.filter((call) => call === "cleanup").length, 1);
});

await check("Paket-B-Startweg bleibt mit lokalen Fakes vor Credential und Remote fail-closed", async () => {
  const calls = [];
  const run = createRadarRemotePreflightOnce({
    async localClosureGate() {
      calls.push("local-closure");
      throw new RadarRemoteStartStop("SYNTHETIC_LOCAL_STOP", "offline");
    },
    async localWorkspaceGate() { calls.push("local-workspace"); },
    async localCliGate() { calls.push("local-cli"); },
    async readCredential() { calls.push("credential"); },
    async remoteRead() { calls.push("remote"); },
    async writeMissingProviderSecret() { calls.push("secret-write"); },
  });
  await assert.rejects(run(), (error) => error.code === "SYNTHETIC_LOCAL_STOP");
  assert.deepEqual(calls, ["local-closure"]);
});

console.log(`${checks} E17A-One-Shot-Offlinechecks bestanden.`);
