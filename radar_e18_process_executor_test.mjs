/* E18-Default-Executor: ausschliesslich lokale Prozess-Spies/Fakes. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  RADAR_E18_AUTHORIZATION_FLAG,
  RADAR_E18_EXECUTE_FLAG,
  RadarE18AdapterStop,
  createRadarE18AuthorizationMarker,
  createRadarE18CommittedAdapter,
  createRadarE18ProcessBlueprints,
  main,
} from "./tools/radar_e18_remote_adapter.mjs";
import {
  RadarE18ProcessStop,
  validateRadarE18ProcessContract,
  verifyRadarE18CommittedSources,
} from "./tools/radar_e18_process_executor.mjs";
import { loadRadarE17ARepairContract } from "./tools/radar_e17a_repair_once.mjs";

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

function isProcessStop(error) {
  return error instanceof RadarE18ProcessStop;
}

await check("alle committed Rezepte sind tief immutable, one-shot, shell-frei und exakt allowlistet", () => {
  const blueprints = createRadarE18ProcessBlueprints();
  assert.equal(blueprints.length, 22);
  for (const blueprint of blueprints) {
    assert.equal(Object.isFrozen(blueprint), true);
    assert.equal(Object.isFrozen(blueprint.process), true);
    validateRadarE18ProcessContract(blueprint);
    for (const processStep of blueprint.process.steps) {
      assert.equal(Object.isFrozen(processStep), true);
      assert.deepEqual(Object.keys(processStep).sort(), [
        "argv", "attempts", "binary", "cwd", "envNames", "id", "parser", "shell",
        "stdin", "stdout", "timeoutMs",
      ].sort());
      assert.equal(processStep.attempts, 1);
      assert.equal(processStep.shell, false);
      assert.equal(processStep.binary.startsWith("/"), true);
      assert.equal(new Set(processStep.envNames).size, processStep.envNames.length);
      assert.deepEqual([...processStep.envNames].sort(), processStep.envNames);
      assert.doesNotMatch(JSON.stringify(processStep), /db push|--no-verify-jwt|--prune/);
    }
  }
});

await check("exakte Kopien bleiben gleich; Erweiterungen und Formdrift werden fail-closed verworfen", () => {
  const original = createRadarE18ProcessBlueprints()[0];
  assert.equal(validateRadarE18ProcessContract({ ...original }).id, original.id);
  assert.throws(
    () => validateRadarE18ProcessContract({ ...original, unknown: true }),
    isProcessStop,
  );
  assert.throws(
    () => validateRadarE18ProcessContract({
      ...original,
      process: { ...original.process, steps: [...original.process.steps, { unknown: true }] },
    }),
    isProcessStop,
  );
  const baseStep = original.process.steps[0];
  for (const drift of [
    { binary: "/bin/false" },
    { argv: [...baseStep.argv, "--extra"] },
    { cwd: "/private/tmp" },
    { envNames: [...baseStep.envNames, "EXTRA"] },
    { stdin: "pipe-anything" },
    { stdout: "inherit" },
    { timeoutMs: baseStep.timeoutMs + 1 },
    { parser: "unknown" },
    { attempts: 2 },
    { shell: true },
    { unknown: true },
  ]) {
    assert.throws(
      () => validateRadarE18ProcessContract({
        ...original,
        process: {
          ...original.process,
          steps: [{ ...baseStep, ...drift }],
        },
      }),
      isProcessStop,
    );
  }
});

await check("Quellgate akzeptiert nur vier getrackte, saubere HEAD-Dateien und stoppt bei Dirty-State", () => {
  const calls = [];
  const gitSpawn = (_binary, argv) => {
    calls.push([...argv]);
    const stdout = argv[0] === "rev-parse" ? `${"f".repeat(40)}\n` : "";
    return { status: 0, signal: null, error: null, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
  };
  const receipt = verifyRadarE18CommittedSources({ gitSpawn });
  assert.equal(receipt.status, "E18_COMMITTED_SOURCES_OK");
  assert.equal(receipt.paths.length, 4);
  assert.deepEqual(calls.map(([command]) => command), ["rev-parse", "ls-files", "status", "diff"]);

  assert.throws(() => verifyRadarE18CommittedSources({
    gitSpawn(_binary, argv) {
      const stdout = argv[0] === "rev-parse"
        ? `${"f".repeat(40)}\n`
        : (argv[0] === "status" ? " M tools/radar_e18_remote_adapter.mjs\n" : "");
      return { status: 0, signal: null, error: null, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
    },
  }), (error) => error instanceof RadarE18ProcessStop && error.code === "COMMITTED_SOURCE_DIRTY");
});

function e17aState(contract, applied) {
  const baseLimits = {
    task_modell: { stable: "klein" },
    task_max_tokens: { stable: 1000 },
    task_max_reservierung_usd_cent: { stable: 2 },
  };
  if (!applied) {
    return { ledger: contract.expectedLedgerBaseline, limits: baseLimits, targetLedger: null };
  }
  return {
    ledger: [...contract.expectedLedgerBaseline, contract.targetHistory],
    limits: {
      task_modell: { stable: "klein", "blog-profile-extract": "klein" },
      task_max_tokens: { stable: 1000, "blog-profile-extract": 2048 },
      task_max_reservierung_usd_cent: { stable: 2, "blog-profile-extract": 5 },
    },
    targetLedger: contract.targetLedger,
  };
}

function processFixture({
  failVersion = false,
  wrongPgVersion = false,
  providerInitiallyPresent = false,
  unknownFunctionField = false,
  liveBudgetUnknown = false,
  largeProjection = false,
  projectionBufferError = false,
} = {}) {
  const contract = loadRadarE17ARepairContract();
  const privateSecrets = Object.freeze({
    access: "fixture_access_value",
    database: "fixture_database_value",
    anthropic: "fixture_anthropic_value",
  });
  const visibleCalls = [];
  const allRunDirs = new Set();
  const allBackupDirs = new Set();
  const allProjectionFiles = new Set();
  let e17aApplied = false;
  let packageMigrated = false;
  let functionDeployed = false;
  let providerSecretPresent = providerInitiallyPresent;
  let flagsEnabled = false;
  let providerFileObserved = false;
  let migrationWorkspaceObserved = false;
  let sourceGateCalls = 0;

  const packageState = () => ({
    ledger: [
      ...contract.expectedLedgerBaseline,
      contract.targetHistory,
      ...(packageMigrated ? [
        { version: "20260817180000", name: "radar_websearch_mvp_package_a" },
        { version: "20260817190000", name: "radar_websearch_mvp_package_b" },
      ] : []),
    ],
    radar: {
      radar_aktiv: flagsEnabled,
      radar_provider_aktiv: flagsEnabled,
      radar_shares_aktiv: false,
      radar_scheduler_aktiv: false,
      radar_proposal_import_aktiv: false,
    },
    private: { provider_requests_enabled: flagsEnabled, scheduler_enabled: false },
    provider: {
      feature_enabled: flagsEnabled,
      rights_confirmed: true,
      dpa_transfer_confirmed: true,
      retention_confirmed: true,
      price_budget_confirmed: true,
      legal_status: "APPROVED",
      review_current: true,
    },
    providerGate: {
      ok: flagsEnabled,
      code: flagsEnabled ? "PROVIDER_ALLOWED" : "PROVIDER_GLOBAL_OFF",
    },
    limits: packageMigrated ? {
      task_modell: "klein",
      task_max_tokens: 1200,
      task_max_reservierung_usd_cent: 5,
      websearch_usd_cent_pro_request: 1,
    } : {
      task_modell: null,
      task_max_tokens: null,
      task_max_reservierung_usd_cent: null,
      websearch_usd_cent_pro_request: null,
    },
  });

  function ok(stdout = "") {
    return { status: 0, signal: null, error: null, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
  }

  function projectionContent(schemaOnly) {
    if (schemaOnly) return Buffer.from("-- volatile header\nCREATE TABLE t (id integer);\n");
    const prefix = Buffer.from("-- volatile header\nCOPY t (id) FROM stdin;\n");
    const suffix = Buffer.from("\n\\.\n");
    return largeProjection
      ? Buffer.concat([prefix, Buffer.alloc(5 * 1024 * 1024, 120), suffix])
      : Buffer.concat([prefix, Buffer.from("1"), suffix]);
  }

  function spawn(binary, argv, options) {
    const envNames = Object.keys(options.env || {}).sort();
    const visible = JSON.stringify({ binary, argv, cwd: options.cwd, envNames });
    assert.doesNotMatch(visible, /fixture_(?:access|database|anthropic)_value/);
    assert.equal(options.shell, false);
    assert.equal(Object.hasOwn(options.env || {}, "CODEX_HOME"), false);
    assert.equal(Object.hasOwn(options.env || {}, "home"), false);
    if (binary.startsWith("/Applications/Postgres.app/Contents/Versions/17/bin/")) {
      assert.match(options.env.TMPDIR, /^\/private\/tmp\/kinodreieck-radar-b-local-/);
    }
    if (binary.includes("@supabase/cli-darwin-arm64/bin/supabase")) {
      const runDir = dirname(options.env.SUPABASE_HOME);
      for (const name of ["SUPABASE_HOME", "TMPDIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME"]) {
        assert.equal(options.env[name] === runDir || options.env[name].startsWith(`${runDir}/`), true);
      }
      assert.equal(Object.hasOwn(options.env, "HOME"), false);
    }
    visibleCalls.push({
      binary,
      argv: [...argv],
      cwd: options.cwd,
      envNames,
      input: options.input,
      maxBuffer: options.maxBuffer,
      stdio: [...options.stdio],
    });
    if (options.env?.SUPABASE_HOME) allRunDirs.add(dirname(options.env.SUPABASE_HOME));

    if (argv.length === 1 && argv[0] === "--version") {
      if (binary.includes("@supabase/cli-darwin-arm64/bin/supabase")) {
        return failVersion ? { ...ok(), status: 1 } : ok("2.109.1\n");
      }
      const name = binary.split("/").at(-1);
      return ok(`${name} (PostgreSQL) ${wrongPgVersion ? "18.0" : "17.10"} (Postgres.app)\n`);
    }
    if (binary === "/usr/bin/security") {
      const account = argv[argv.indexOf("-a") + 1];
      if (account === "SUPABASE_ACCESS_TOKEN") return ok(`${privateSecrets.access}\n`);
      if (account === "DB_POSTGRES_PASSWORD") return ok(`${privateSecrets.database}\n`);
      if (account === "ANTHROPIC_API_KEY") return ok(`${privateSecrets.anthropic}\n`);
      return { ...ok(), status: 1 };
    }
    if (argv[0] === "link") {
      const metadataDir = join(options.cwd, "supabase/.temp");
      mkdirSync(metadataDir, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(metadataDir, "pooler-url"),
        "postgresql://postgres.bscjgwcntapobyxsiyce@aws-0-eu-central-1.pooler.supabase.com:6543/postgres\n",
        { mode: 0o600 },
      );
      return ok("{}\n");
    }
    if (binary.endsWith("/psql")) {
      const sql = String(options.input || "");
      if (sql.includes("'targetLedger'")) return ok(`${JSON.stringify(e17aState(contract, e17aApplied))}\n`);
      if (sql.includes("INSERT INTO supabase_migrations.schema_migrations")) {
        e17aApplied = true;
        return ok();
      }
      if (sql.includes("'providerGate'")) return ok(`${JSON.stringify(packageState())}\n`);
      if (sql.includes("E18 provider approval is not current")) {
        flagsEnabled = true;
        return ok();
      }
      if (sql.includes("update public.kd_private_settings set provider_requests_enabled=false")) {
        flagsEnabled = false;
        return ok();
      }
      return { ...ok(), status: 1 };
    }
    if (binary.endsWith("/pg_dump")) {
      const outputFile = argv[argv.indexOf("--file") + 1];
      if (argv.includes("--format=custom")) {
        allBackupDirs.add(dirname(outputFile));
        writeFileSync(outputFile, "synthetic-custom-archive", { mode: 0o600 });
        return ok();
      }
      assert.notEqual(outputFile, "-");
      assert.equal(options.stdio[1], "ignore");
      assert.equal(statSync(outputFile).mode & 0o077, 0);
      allProjectionFiles.add(outputFile);
      writeFileSync(outputFile, projectionContent(argv.includes("--schema-only")));
      return ok();
    }
    if (binary.endsWith("/pg_restore") && argv.includes("--exit-on-error")) {
      const backup = argv.at(-1);
      assert.equal(statSync(backup).mode & 0o077, 0);
      return ok();
    }
    if (binary.endsWith("/pg_restore") && argv.includes("--file")) {
      const outputFile = argv[argv.indexOf("--file") + 1];
      assert.notEqual(outputFile, "-");
      assert.equal(options.stdio[1], "ignore");
      assert.equal(statSync(outputFile).mode & 0o077, 0);
      allProjectionFiles.add(outputFile);
      if (projectionBufferError
          && argv.includes("--data-only")
          && outputFile.endsWith("e17a-data.projection.sql")) {
        return {
          status: null,
          signal: "SIGTERM",
          error: Object.assign(new Error("synthetic buffer overflow"), { code: "ENOBUFS" }),
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        };
      }
      writeFileSync(outputFile, projectionContent(argv.includes("--schema-only")));
      return ok();
    }
    if (binary.endsWith("/initdb") || binary.endsWith("/pg_ctl") || binary.endsWith("/createdb")) {
      return ok();
    }
    if (argv[0] === "secrets" && argv[1] === "list") {
      return ok(`${JSON.stringify(providerSecretPresent ? [
        { name: "ANTHROPIC_API_KEY", value: "non-secret-digest" },
      ] : [])}\n`);
    }
    if (argv[0] === "functions" && argv[1] === "list") {
      if (unknownFunctionField) {
        return ok(`${JSON.stringify([{
          slug: "unrelated-function",
          status: "ACTIVE",
          verify_jwt: true,
          version: 1,
          unexpected: "drift",
        }])}\n`);
      }
      return ok(`${JSON.stringify(functionDeployed ? [
        { slug: "radar-websearch-task", status: "ACTIVE", verify_jwt: true, version: 1 },
      ] : [])}\n`);
    }
    if (argv[0] === "secrets" && argv[1] === "set") {
      const envFile = argv[argv.indexOf("--env-file") + 1];
      assert.equal(statSync(envFile).mode & 0o077, 0);
      assert.equal(readFileSync(envFile, "utf8"), `ANTHROPIC_API_KEY=${privateSecrets.anthropic}\n`);
      providerFileObserved = true;
      providerSecretPresent = true;
      return ok("{}\n");
    }
    if (argv[0] === "migration" && argv[1] === "up") {
      const migrationFiles = readdirSync(join(options.cwd, "supabase/migrations")).sort();
      assert.deepEqual(migrationFiles, [
        "20260817180000_radar_websearch_mvp_package_a.sql",
        "20260817190000_radar_websearch_mvp_package_b.sql",
      ]);
      assert.equal(existsSync(join(options.cwd, "supabase/migrations/20260817120000_blog_profile_extract_config.sql")), false);
      migrationWorkspaceObserved = true;
      packageMigrated = true;
      return ok("{}\n");
    }
    if (argv[0] === "functions" && argv[1] === "deploy") {
      assert.deepEqual(argv.slice(0, 3), ["functions", "deploy", "radar-websearch-task"]);
      assert.equal(argv.includes("--no-verify-jwt"), false);
      functionDeployed = true;
      return ok("{}\n");
    }
    if (binary === "/usr/local/bin/node" && argv[0].endsWith("/npm-cli.js")) {
      assert.deepEqual(argv.slice(1), ["run", "test:ai:live", "--", "--radar-websearch-once"]);
      if (liveBudgetUnknown) {
        return { ...ok(), status: 75, stderr: Buffer.from("BUDGET_UNBEKANNT\n") };
      }
      return ok("RADAR-WEBSEARCH-EINMAL: confirmed\n");
    }
    return { ...ok(), status: 1 };
  }

  return {
    contract,
    spawn,
    visibleCalls,
    allRunDirs,
    allBackupDirs,
    allProjectionFiles,
    committedSourceGate() {
      sourceGateCalls += 1;
      return Object.freeze({
        status: "E18_COMMITTED_SOURCES_OK",
        head: "f".repeat(40),
        paths: Object.freeze([
          "tools/radar_e17a_repair_once.mjs",
          "tools/radar_e18_process_executor.mjs",
          "tools/radar_e18_remote_adapter.mjs",
          "tools/radar_websearch_remote_start.mjs",
        ]),
      });
    },
    sourceGateCalls() { return sourceGateCalls; },
    facts() {
      return { providerFileObserved, migrationWorkspaceObserved, flagsEnabled };
    },
  };
}

await check("synthetische Ausgabe oberhalb 4 MiB belegt ENOBUFS im bisherigen spawnSync-Vertrag", () => {
  const result = spawnSync(process.execPath, [
    "-e", "process.stdout.write(Buffer.alloc(5 * 1024 * 1024, 120))",
  ], {
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 20_000,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.error?.code, "ENOBUFS");
  assert.equal(result.status, null);
  assert.equal(result.signal, "SIGTERM");
});

await check("direkter CLI-Einstieg nutzt ohne High-Level-Executor den seriellen Default-Executor", async () => {
  const fixture = processFixture();
  const out = [];
  const err = [];
  const code = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
    ausgabe: (line) => out.push(line),
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(
    code,
    0,
    `${err.join(",")} after ${fixture.visibleCalls.length} calls`,
  );
  assert.deepEqual(err, []);
  assert.equal(JSON.parse(out[0]).status, "E18_REMOTE_CHAIN_COMPLETE");
  assert.doesNotMatch(out[0], /fixture_(?:access|database|anthropic)_value/);
  assert.equal(fixture.visibleCalls.filter(({ binary }) => binary === "/usr/bin/security").length, 3);
  const secretReadIndex = fixture.visibleCalls.findIndex(({ argv }) => argv.includes("ANTHROPIC_API_KEY"));
  const remoteSecretReadIndex = fixture.visibleCalls.findIndex(({ argv }) => argv[0] === "secrets" && argv[1] === "list");
  assert.ok(remoteSecretReadIndex >= 0 && remoteSecretReadIndex < secretReadIndex);
  assert.deepEqual(fixture.facts(), {
    providerFileObserved: true,
    migrationWorkspaceObserved: true,
    flagsEnabled: false,
  });
  assert.equal(fixture.sourceGateCalls(), 1);
  for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false);
  for (const path of fixture.allBackupDirs) assert.equal(existsSync(path), false);
  for (const path of fixture.allProjectionFiles) assert.equal(existsSync(path), false);
});

await check("private Datei-/Digest-Projektionen verarbeiten synthetisch mehr als 4 MiB ohne stdout-Puffer", async () => {
  const fixture = processFixture({ largeProjection: true, providerInitiallyPresent: true });
  const err = [];
  const code = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
    ausgabe() {},
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 0, err.join(","));
  const projectionCalls = fixture.visibleCalls.filter(({ argv }) => (
    argv.includes("--file") && argv.some((value) => value.endsWith?.(".projection.sql"))
  ));
  assert.ok(projectionCalls.length >= 8);
  for (const call of projectionCalls) {
    assert.equal(call.stdio[1], "ignore");
    assert.equal(call.maxBuffer, 4 * 1024 * 1024);
    assert.equal(call.argv.includes("-"), false);
  }
  for (const path of fixture.allProjectionFiles) assert.equal(existsSync(path), false);
  for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false);
  for (const path of fixture.allBackupDirs) assert.equal(existsSync(path), false);
});

await check("synthetischer ENOBUFS wird exakt normalisiert, nicht wiederholt und rueckstandsfrei gestoppt", async () => {
  const fixture = processFixture({ projectionBufferError: true });
  const err = [];
  const code = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
    ausgabe() {},
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 75);
  assert.deepEqual(err, ["PROCESS_E17A_BACKUP_DATA_FAILED"]);
  const failedDataCalls = fixture.visibleCalls.filter(({ argv }) => (
    argv.includes("--data-only")
      && argv.some((value) => value.endsWith?.("e17a-data.projection.sql"))
  ));
  assert.equal(failedDataCalls.length, 1);
  assert.equal(fixture.visibleCalls.some(({ argv }) => argv[0] === "migration"), false);
  for (const path of fixture.allProjectionFiles) assert.equal(existsSync(path), false);
  for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false);
  for (const path of fixture.allBackupDirs) assert.equal(existsSync(path), false);
});

await check("lokaler CLI-Fehler stoppt vor Keychain und wird nicht automatisch wiederholt", async () => {
  const fixture = processFixture({ failVersion: true });
  const err = [];
  const code = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
    ausgabe() {},
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 75);
  assert.deepEqual(err, ["LOCAL_CLI_VERSION_FAILED"]);
  assert.equal(fixture.visibleCalls.length, 1);
  assert.deepEqual(fixture.visibleCalls[0].argv, ["--version"]);
  assert.equal(fixture.visibleCalls.some(({ binary }) => binary === "/usr/bin/security"), false);
  for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false);
});

await check("PostgreSQL-Versionsdrift stoppt seriell nach Supabase und vor jedem Credential", async () => {
  const fixture = processFixture({ wrongPgVersion: true });
  const err = [];
  const code = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
    ausgabe() {},
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 75);
  assert.deepEqual(err, ["POSTGRESQL_VERSION_MISMATCH"]);
  assert.deepEqual(fixture.visibleCalls.map(({ argv }) => argv), [["--version"], ["--version"]]);
  assert.equal(fixture.visibleCalls.some(({ binary }) => binary === "/usr/bin/security"), false);
});

await check("remote PRESENT laesst den lokalen Provider-Key und die Secretmutation unangetastet", async () => {
  const fixture = processFixture({ providerInitiallyPresent: true });
  const err = [];
  const code = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
    ausgabe() {},
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 0, err.join(","));
  assert.equal(fixture.visibleCalls.filter(({ binary }) => binary === "/usr/bin/security").length, 2);
  assert.equal(fixture.visibleCalls.some(({ argv }) => argv.includes("ANTHROPIC_API_KEY")), false);
  assert.equal(fixture.visibleCalls.some(({ argv }) => argv[0] === "secrets" && argv[1] === "set"), false);
});

await check("unbekanntes Remote-Functionfeld stoppt vor Backup, Mutation und Provider-Key", async () => {
  const fixture = processFixture({ unknownFunctionField: true });
  const err = [];
  const code = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
    ausgabe() {},
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 75);
  assert.deepEqual(err, ["REMOTE_FUNCTIONS_SHAPE_UNKNOWN"]);
  assert.equal(fixture.visibleCalls.some(({ argv }) => argv.includes("ANTHROPIC_API_KEY")), false);
  assert.equal(fixture.visibleCalls.some(({ argv }) => argv.some((value) => value.endsWith?.("/package-b.dump"))), false);
  assert.equal(fixture.visibleCalls.some(({ argv }) => argv[0] === "migration"), false);
});

await check("Budget-unbekannt im Live-One-Shot ist terminal, einmalig und fuehrt nur Cleanup aus", async () => {
  const fixture = processFixture({ providerInitiallyPresent: true, liveBudgetUnknown: true });
  const err = [];
  const code = await main([RADAR_E18_EXECUTE_FLAG, RADAR_E18_AUTHORIZATION_FLAG], {
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
    ausgabe() {},
    fehlerAusgabe: (line) => err.push(line),
  });
  assert.equal(code, 75);
  assert.deepEqual(err, ["BUDGET_UNBEKANNT"]);
  assert.equal(fixture.visibleCalls.filter(({ binary }) => binary === "/usr/local/bin/node").length, 1);
  const liveIndex = fixture.visibleCalls.findIndex(({ binary }) => binary === "/usr/local/bin/node");
  assert.equal(fixture.visibleCalls.slice(liveIndex + 1).some(({ argv }) => argv[0] === "functions"), false);
  assert.equal(fixture.facts().flagsEnabled, false);
});

await check("Default-Executor ist auch als Adapterfabrik one-shot und akzeptiert keinen zweiten Lauf", async () => {
  const fixture = processFixture({ failVersion: true });
  const run = createRadarE18CommittedAdapter({
    authorization: createRadarE18AuthorizationMarker(RADAR_E18_AUTHORIZATION_FLAG),
    defaultExecutorOptions: {
      spawn: fixture.spawn,
      ambientEnv: { HOME: "/private/tmp/synthetic-home" },
      committedSourceGate: fixture.committedSourceGate,
      retainBackups: false,
    },
  });
  await assert.rejects(run(), (error) => error instanceof RadarE18AdapterStop);
  const count = fixture.visibleCalls.length;
  await assert.rejects(run(), (error) => error instanceof RadarE18AdapterStop
    && error.code === "AUTONOMIE_STOPP_NO_RETRY");
  assert.equal(fixture.visibleCalls.length, count);
});

console.log(`${checks} E18-Prozessvertrag-Offlinechecks bestanden.`);
