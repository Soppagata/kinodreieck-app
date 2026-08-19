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
  createRadarE18DefaultExecutor,
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
  assert.equal(blueprints.length, 17);
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

await check("vier kanonische public-/Migrationsprojektionen behalten ihre exakten argv", () => {
  const blueprints = createRadarE18ProcessBlueprints();
  const backup = blueprints.find(({ id }) => id === "package-b-backup").process.steps;
  const restore = blueprints.find(({ id }) => id === "package-b-restore").process.steps;
  const scope = ["--schema=public", "--schema=supabase_migrations"];
  assert.deepEqual(
    backup.find(({ id }) => id === "package-b-backup-schema").argv,
    ["--schema-only", "--no-owner", "--no-privileges", ...scope, "--file", "$PROJECTION_FILE", "$BACKUP_FILE"],
  );
  assert.deepEqual(
    backup.find(({ id }) => id === "package-b-backup-data").argv,
    ["--data-only", "--no-owner", "--no-privileges", ...scope, "--file", "$PROJECTION_FILE", "$BACKUP_FILE"],
  );
  assert.deepEqual(
    restore.find(({ id }) => id === "package-b-restore-schema").argv,
    ["--schema-only", "--no-owner", "--no-privileges", ...scope, "--file", "$PROJECTION_FILE", "$RESTORED_BACKUP_FILE"],
  );
  assert.deepEqual(
    restore.find(({ id }) => id === "package-b-restore-data").argv,
    ["--data-only", "--no-owner", "--no-privileges", ...scope, "--file", "$PROJECTION_FILE", "$RESTORED_BACKUP_FILE"],
  );
});

await check("Auth-ID-Quelle nutzt den quieten E17B-PSQL-Projektionsvertrag", () => {
  const step = createRadarE18ProcessBlueprints()
    .find(({ id }) => id === "package-b-backup").process.steps
    .find(({ id }) => id === "package-b-backup-auth-ids");
  assert.deepEqual(step.argv, [
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set",
    "ON_ERROR_STOP=on", "--file", "-", "$REMOTE_DB_URL",
  ]);
  assert.equal(step.stdin, "sql:auth-id-projection");
  assert.equal(step.parser, "auth-id-projection");
});

await check("Default-Executor startet ohne gebundene Backup-/Restorebelege keine Migration", async () => {
  let processStarts = 0;
  const executor = createRadarE18DefaultExecutor({
    spawn() { processStarts += 1; throw new Error("must not start"); },
  });
  const migrationBlueprint = createRadarE18ProcessBlueprints()
    .find(({ id }) => id === "package-b-migrations");
  await assert.rejects(
    executor(migrationBlueprint),
    (error) => error instanceof RadarE18ProcessStop
      && error.code === "MIGRATION_RESTORE_RECEIPT_REQUIRED",
  );
  assert.equal(processStarts, 0);
});

await check("Quellgate bindet E17B plus Migration und vier Runnerdateien sauber an HEAD", () => {
  const calls = [];
  const gitSpawn = (_binary, argv) => {
    calls.push([...argv]);
    const stdout = argv[0] === "rev-parse" ? `${"f".repeat(40)}\n` : "";
    return { status: 0, signal: null, error: null, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
  };
  const receipt = verifyRadarE18CommittedSources({ gitSpawn });
  assert.equal(receipt.status, "E18_COMMITTED_SOURCES_OK");
  assert.equal(receipt.paths.length, 6);
  assert.equal(receipt.paths.includes("tools/e17b-remote-window.mjs"), true);
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

function e17aState(contract, mode = "valid") {
  const valid = {
    ledger: contract.expectedLedgerBaseline,
    limits: {
      task_modell: { stable: "klein" },
      task_max_tokens: { stable: 1000 },
      task_max_reservierung_usd_cent: { stable: 2 },
    },
    targetLedger: null,
  };
  if (mode === "missing") {
    return { ...valid, ledger: contract.expectedLedgerBaseline.slice(0, -1) };
  }
  if (mode === "additional") {
    return {
      ...valid,
      ledger: [...contract.expectedLedgerBaseline, contract.targetHistory],
      targetLedger: contract.targetLedger,
    };
  }
  if (mode === "state-drift") {
    return {
      ...valid,
      limits: {
        ...valid.limits,
        task_max_tokens: { stable: 1000, "blog-profile-extract": 2048 },
      },
    };
  }
  if (mode === "target-drift") return { ...valid, targetLedger: contract.targetLedger };
  return valid;
}

function processFixture({
  baselineMode = "valid",
  failVersion = false,
  wrongPgVersion = false,
  providerInitiallyPresent = false,
  unknownFunctionField = false,
  liveBudgetUnknown = false,
  largeProjection = false,
  projectionBufferError = false,
  schemaPreflightFailure = null,
  authProjectionMode = "valid",
  postflightLedgerMode = "valid",
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
  const allAuthProjectionFiles = new Set();
  let packageMigrated = false;
  let functionDeployed = false;
  let providerSecretPresent = providerInitiallyPresent;
  let flagsEnabled = false;
  let providerFileObserved = false;
  let migrationWorkspaceObserved = false;
  let sourceGateCalls = 0;
  let liveCompleted = false;
  const authIds = Object.freeze([
    "00000000-0000-1000-8000-000000000001",
    "00000000-0000-1000-8000-000000000002",
  ]);

  function authProjectionOutput() {
    if (authProjectionMode === "unsorted") return `${[...authIds].reverse().join("\n")}\n`;
    if (authProjectionMode === "duplicate") return `${authIds[0]}\n${authIds[0]}\n`;
    if (authProjectionMode === "empty") return "";
    if (authProjectionMode === "form") return "not-a-uuid\n";
    if (authProjectionMode === "multicolumn") {
      return `${authIds[0]}\tmail@example.test password token metadata\n`;
    }
    return `${authIds.join("\n")}\n`;
  }

  const packageState = () => {
    let ledger = [
      ...contract.expectedLedgerBaseline,
      ...(packageMigrated ? [
        contract.targetHistory,
        { version: "20260817180000", name: "radar_websearch_mvp_package_a" },
        { version: "20260817190000", name: "radar_websearch_mvp_package_b" },
      ] : []),
    ];
    if (liveCompleted && postflightLedgerMode === "missing") {
      ledger = ledger.filter(({ version }) => version !== "20260817120000");
    } else if (liveCompleted && postflightLedgerMode === "additional") {
      ledger = [...ledger, { version: "20260817200000", name: "unexpected_migration" }];
    }
    return {
      ledger,
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
    };
  };

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
      if (sql === [
        "BEGIN;",
        "CREATE ROLE anon NOLOGIN;",
        "CREATE ROLE authenticated NOLOGIN;",
        "CREATE ROLE authenticator NOLOGIN;",
        "CREATE ROLE postgres NOLOGIN;",
        "CREATE ROLE service_role NOLOGIN;",
        "CREATE ROLE supabase_admin NOLOGIN;",
        "COMMIT;",
        "",
      ].join("\n")) return ok();
      if (sql.includes("COPY (SELECT id::text FROM auth.users ORDER BY id::text COLLATE \"C\") TO STDOUT;")) {
        assert.doesNotMatch(sql, /SNAPSHOT_CAPABILITY/);
        assert.doesNotMatch(sql, /email|phone|password|token|metadata/i);
        return ok(authProjectionOutput());
      }
      if (sql.includes("CREATE TABLE auth.users (id uuid PRIMARY KEY);")) {
        assert.match(sql, /CREATE OR REPLACE FUNCTION auth\.uid\(\) RETURNS uuid/);
        assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions/);
        assert.match(sql, /CREATE SCHEMA supabase_migrations/);
        assert.doesNotMatch(sql, /email|phone|password|token|metadata/i);
        return ok();
      }
      if (sql.startsWith("\\copy auth.users (id) FROM '")) {
        const match = sql.match(/^\\copy auth\.users \(id\) FROM '([^']+)' WITH \(FORMAT text\)\n$/);
        assert.ok(match);
        const authPath = match[1];
        allAuthProjectionFiles.add(authPath);
        assert.equal(statSync(authPath).mode & 0o077, 0);
        assert.equal(readFileSync(authPath, "utf8"), `${authIds.join("\n")}\n`);
        return ok();
      }
      if (sql.includes("'targetLedger'")) return ok(`${JSON.stringify(e17aState(contract, baselineMode))}\n`);
      if (sql.includes("INSERT INTO supabase_migrations.schema_migrations")) {
        assert.fail("E18 darf E17A nicht ausserhalb des geordneten CLI-Migrationsplans schreiben");
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
        if (argv.includes("radar_restore")) {
          assert.deepEqual(
            argv.filter((value) => value.startsWith("--schema=")),
            ["--schema=public", "--schema=supabase_migrations"],
          );
        }
        allBackupDirs.add(dirname(outputFile));
        writeFileSync(outputFile, "synthetic-custom-archive", { mode: 0o600 });
        return ok();
      }
      assert.deepEqual(
        argv.filter((value) => value.startsWith("--schema=")),
        ["--schema=public", "--schema=supabase_migrations"],
      );
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
      assert.deepEqual(
        argv.filter((value) => value.startsWith("--schema=")),
        ["--schema=public", "--schema=supabase_migrations"],
      );
      if (argv.includes("--schema-only")) {
        assert.equal(argv[argv.indexOf("--dbname") + 1], "schema_preflight");
        if (schemaPreflightFailure) {
          const opaqueInternal = schemaPreflightFailure === "foreign-role"
            ? "synthetic role detail"
            : "synthetic extension detail";
          return { ...ok(), status: 1, stderr: Buffer.from(opaqueInternal) };
        }
      } else {
        assert.equal(argv[argv.indexOf("--dbname") + 1], "radar_restore");
      }
      return ok();
    }
    if (binary.endsWith("/pg_restore") && argv.includes("--file")) {
      const outputFile = argv[argv.indexOf("--file") + 1];
      assert.deepEqual(
        argv.filter((value) => value.startsWith("--schema=")),
        ["--schema=public", "--schema=supabase_migrations"],
      );
      assert.notEqual(outputFile, "-");
      assert.equal(options.stdio[1], "ignore");
      assert.equal(statSync(outputFile).mode & 0o077, 0);
      allProjectionFiles.add(outputFile);
      if (projectionBufferError
          && argv.includes("--data-only")
          && outputFile.endsWith("package-b-data.projection.sql")) {
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
        "20260817120000_blog_profile_extract_config.sql",
        "20260817180000_radar_websearch_mvp_package_a.sql",
        "20260817190000_radar_websearch_mvp_package_b.sql",
      ]);
      assert.deepEqual(
        readFileSync(join(options.cwd, "supabase/migrations/20260817120000_blog_profile_extract_config.sql")),
        readFileSync("supabase/migrations/20260817120000_blog_profile_extract_config.sql"),
      );
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
      liveCompleted = true;
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
    allAuthProjectionFiles,
    committedSourceGate() {
      sourceGateCalls += 1;
      return Object.freeze({
        status: "E18_COMMITTED_SOURCES_OK",
        head: "f".repeat(40),
        paths: Object.freeze([
          "supabase/migrations/20260817120000_blog_profile_extract_config.sql",
          "tools/e17b-remote-window.mjs",
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
  assert.doesNotMatch(out[0], /00000000-0000-1000-8000-00000000000[12]/);
  assert.equal(fixture.visibleCalls.filter(({ binary }) => binary === "/usr/bin/security").length, 3);
  const secretReadIndex = fixture.visibleCalls.findIndex(({ argv }) => argv.includes("ANTHROPIC_API_KEY"));
  const remoteSecretReadIndex = fixture.visibleCalls.findIndex(({ argv }) => argv[0] === "secrets" && argv[1] === "list");
  assert.ok(remoteSecretReadIndex >= 0 && remoteSecretReadIndex < secretReadIndex);
  assert.deepEqual(fixture.facts(), {
    providerFileObserved: true,
    migrationWorkspaceObserved: true,
    flagsEnabled: false,
  });
  const backupIndex = fixture.visibleCalls.findIndex(({ binary, argv }) => (
    binary.endsWith("/pg_dump")
      && argv.includes("--format=custom")
      && argv.some((value) => value.endsWith?.("/package-b.dump"))
  ));
  const restoreVerifiedIndex = fixture.visibleCalls.findIndex(({ binary, argv }) => (
    binary.endsWith("/pg_ctl") && argv.at(-1) === "stop"
  ));
  const migrationIndex = fixture.visibleCalls.findIndex(({ argv }) => (
    argv[0] === "migration" && argv[1] === "up"
  ));
  assert.ok(backupIndex >= 0 && backupIndex < restoreVerifiedIndex);
  assert.ok(restoreVerifiedIndex < migrationIndex);
  assert.equal(fixture.sourceGateCalls(), 1);
  const schemaPreflights = fixture.visibleCalls.filter(({ binary, argv }) => (
    binary.endsWith("/pg_restore")
      && argv.includes("--schema-only")
      && argv.includes("--exit-on-error")
  ));
  const fullRestores = fixture.visibleCalls.filter(({ binary, argv }) => (
    binary.endsWith("/pg_restore")
      && argv.includes("--exit-on-error")
      && !argv.includes("--schema-only")
  ));
  assert.equal(schemaPreflights.length, 1);
  assert.equal(fullRestores.length, 1);
  assert.deepEqual(
    fixture.visibleCalls
      .filter(({ binary, argv }) => binary.endsWith("/pg_restore") && argv.includes("--exit-on-error"))
      .map(({ argv }) => argv[argv.indexOf("--dbname") + 1]),
    ["schema_preflight", "radar_restore"],
  );
  const roleScaffolds = fixture.visibleCalls.filter(({ input }) => String(input || "").startsWith("BEGIN;\nCREATE ROLE anon NOLOGIN;"));
  assert.equal(roleScaffolds.length, 1);
  assert.ok(roleScaffolds.every(({ input }) => String(input).includes("CREATE ROLE supabase_admin NOLOGIN;")));
  const schemaScaffolds = fixture.visibleCalls.filter(({ input }) => (
    String(input || "").includes("CREATE TABLE auth.users (id uuid PRIMARY KEY);")
  ));
  assert.equal(schemaScaffolds.length, 2);
  assert.ok(schemaScaffolds.every(({ input }) => (
    !/email|phone|password|token|metadata/i.test(String(input))
      && String(input).includes("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid")
      && String(input).includes("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;")
  )));
  const authLoads = fixture.visibleCalls.filter(({ input }) => (
    String(input || "").startsWith("\\copy auth.users (id) FROM '")
  ));
  assert.equal(authLoads.length, 2);
  assert.deepEqual(authLoads.map(({ argv }) => argv[argv.indexOf("--dbname") + 1]), [
    "schema_preflight",
    "radar_restore",
  ]);
  for (const database of ["schema_preflight", "radar_restore"]) {
    const authIndex = fixture.visibleCalls.findIndex(({ argv, input }) => (
      argv.includes(database) && String(input || "").startsWith("\\copy auth.users (id) FROM '")
    ));
    const restoreIndex = fixture.visibleCalls.findIndex(({ binary, argv }) => (
      binary.endsWith("/pg_restore") && argv.includes("--exit-on-error") && argv.includes(database)
    ));
    assert.ok(authIndex >= 0 && authIndex < restoreIndex);
  }
  assert.equal(fixture.visibleCalls.some(({ argv }) => argv.includes("--list") || argv.includes("--use-list")), false);
  for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false);
  for (const path of fixture.allBackupDirs) assert.equal(existsSync(path), false);
  for (const path of fixture.allProjectionFiles) assert.equal(existsSync(path), false);
  for (const path of fixture.allAuthProjectionFiles) assert.equal(existsSync(path), false);
});

await check("fehlender, zusaetzlicher oder funktional driftender 35er-Ausgangsledger stoppt vor Backup", async () => {
  for (const [baselineMode, expectedCode] of [
    ["missing", "LEDGER_BASELINE_DRIFT"],
    ["additional", "LEDGER_BASELINE_DRIFT"],
    ["state-drift", "BASELINE_MIGRATION_STATE_DRIFT"],
    ["target-drift", "BASELINE_MIGRATION_STATE_DRIFT"],
  ]) {
    const fixture = processFixture({ baselineMode });
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
    assert.equal(code, 75, baselineMode);
    assert.deepEqual(err, [expectedCode], baselineMode);
    assert.deepEqual(out, [], baselineMode);
    assert.equal(fixture.visibleCalls.filter(({ input }) => (
      String(input || "").includes("'targetLedger'")
    )).length, 1, baselineMode);
    assert.equal(fixture.visibleCalls.some(({ binary, argv }) => (
      binary.endsWith("/pg_dump") && argv.includes("--format=custom")
    )), false, baselineMode);
    assert.equal(fixture.visibleCalls.some(({ argv }) => argv[0] === "migration"), false, baselineMode);
    assert.equal(fixture.visibleCalls.some(({ argv }) => argv.includes("ANTHROPIC_API_KEY")), false, baselineMode);
    assert.equal(fixture.visibleCalls.some(({ binary }) => binary === "/usr/local/bin/node"), false, baselineMode);
    for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false, baselineMode);
  }
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
  assert.ok(projectionCalls.length >= 4);
  for (const call of projectionCalls) {
    assert.equal(call.stdio[1], "ignore");
    assert.equal(call.maxBuffer, 4 * 1024 * 1024);
    assert.equal(call.argv.includes("-"), false);
  }
  for (const path of fixture.allProjectionFiles) assert.equal(existsSync(path), false);
  for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false);
  for (const path of fixture.allBackupDirs) assert.equal(existsSync(path), false);
});

await check("Auth-ID-Projektion stoppt unsortiert, doppelt, leer, formfremd und mehrspaltig vor jedem Restore-Sink", async () => {
  for (const authProjectionMode of ["unsorted", "duplicate", "empty", "form", "multicolumn"]) {
    const fixture = processFixture({
      authProjectionMode,
      providerInitiallyPresent: true,
    });
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
    assert.equal(code, 75, authProjectionMode);
    assert.deepEqual(err, ["AUTH_ID_PROJECTION_INVALID"], authProjectionMode);
    assert.deepEqual(out, [], authProjectionMode);
    assert.doesNotMatch(err.join(" "), /mail|password|token|metadata|00000000-/i);
    assert.equal(fixture.visibleCalls.some(({ binary, argv }) => (
      binary.endsWith("/pg_restore") && argv.includes("--exit-on-error")
    )), false, authProjectionMode);
    assert.equal(fixture.visibleCalls.some(({ argv }) => argv[0] === "migration"), false);
    assert.equal(fixture.visibleCalls.some(({ argv }) => argv[0] === "functions" && argv[1] === "deploy"), false);
    assert.equal(fixture.visibleCalls.some(({ input }) => String(input || "").includes("provider_requests_enabled=true")), false);
    assert.equal(fixture.visibleCalls.some(({ binary }) => binary === "/usr/local/bin/node"), false);
    for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false);
    for (const path of fixture.allBackupDirs) assert.equal(existsSync(path), false);
    for (const path of fixture.allProjectionFiles) assert.equal(existsSync(path), false);
    for (const path of fixture.allAuthProjectionFiles) assert.equal(existsSync(path), false);
  }
});

for (const failure of ["foreign-role", "extension-dependency"]) {
  await check(`Schema-Preflight stoppt ${failure} opak vor Full-Restore und raeumt lokal auf`, async () => {
    const fixture = processFixture({
      providerInitiallyPresent: true,
      schemaPreflightFailure: failure,
    });
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
    assert.deepEqual(err, ["RESTORE_SCOPE_DEPENDENCY_UNSUPPORTED"]);
    assert.doesNotMatch(err.join(" "), /synthetic role detail|synthetic extension detail/);
    const preflightCalls = fixture.visibleCalls.filter(({ binary, argv }) => (
      binary.endsWith("/pg_restore") && argv.includes("--schema-only")
        && argv.includes("--exit-on-error")
    ));
    const fullRestoreCalls = fixture.visibleCalls.filter(({ binary, argv }) => (
      binary.endsWith("/pg_restore") && argv.includes("--exit-on-error")
        && !argv.includes("--schema-only")
    ));
    assert.equal(preflightCalls.length, 1);
    assert.equal(fullRestoreCalls.length, 0);
    assert.equal(fixture.visibleCalls.some(({ argv }) => argv[0] === "migration"), false);
    for (const path of fixture.allRunDirs) assert.equal(existsSync(path), false);
    for (const path of fixture.allBackupDirs) assert.equal(existsSync(path), false);
    for (const path of fixture.allProjectionFiles) assert.equal(existsSync(path), false);
  });
}

await check("synthetischer Paket-B-ENOBUFS wird exakt normalisiert, nicht wiederholt und rueckstandsfrei gestoppt", async () => {
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
  assert.deepEqual(err, ["PROCESS_PACKAGE_B_BACKUP_DATA_FAILED"]);
  const failedDataCalls = fixture.visibleCalls.filter(({ argv }) => (
    argv.includes("--data-only")
      && argv.some((value) => value.endsWith?.("package-b-data.projection.sql"))
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

await check("Postflight verlangt alle drei neuen Ledgerzeilen ohne fehlenden oder zusaetzlichen Eintrag", async () => {
  for (const postflightLedgerMode of ["missing", "additional"]) {
    const fixture = processFixture({ providerInitiallyPresent: true, postflightLedgerMode });
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
    assert.equal(code, 75, postflightLedgerMode);
    assert.deepEqual(err, ["PACKAGE_DEPLOYMENT_READBACK_DRIFT"], postflightLedgerMode);
    assert.equal(fixture.visibleCalls.filter(({ argv }) => (
      argv[0] === "migration" && argv[1] === "up"
    )).length, 1, postflightLedgerMode);
    assert.equal(fixture.visibleCalls.filter(({ binary }) => binary === "/usr/local/bin/node").length, 1);
    assert.equal(fixture.facts().flagsEnabled, false);
  }
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
