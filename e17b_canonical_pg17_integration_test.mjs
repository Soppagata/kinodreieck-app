import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { createCanonicalV2UntrustedSession } from "./tools/e17b-remote-window.mjs";

const ROOT_PREFIX = "/private/tmp/kd-e17b-canonical-v2-pg17-";
const DATABASE = "e17b_fixture";
const BOOTSTRAP_ADMIN = "e17b_fixture_admin";
const SOURCE_PORT = 64341;
const RESTORE_PORT = 64342;
const PROCESS_TIMEOUT_MS = 135_000;
const SERVER_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MIGRATION_VERSION = "20260817120000";
const MIGRATION_NAME = "blog_profile_extract_config";
const MIGRATION_PATH = "supabase/migrations/20260817120000_blog_profile_extract_config.sql";
const MIGRATION_BLOB = "c9a44d1eb62cf35cf0f212afc39d78adac5d9138";
const MIGRATION_SHA256 = "887253d3323c059fd286bf3e66cae3f167cba4396e89e8f867baa7de42465134";

const PG_BASE = "/Applications/Postgres.app/Contents/Versions/17/bin";
const BINARIES = Object.freeze({
  initdb: Object.freeze({ path: `${PG_BASE}/initdb`, sha256: "6a64e212a6d7b679974dc68c99ae87658d172ed3056893e9e7fc5b9f6257db02" }),
  postgres: Object.freeze({ path: `${PG_BASE}/postgres`, sha256: "5c346ffb2faad6a6802bbf94af89b29f8ded1cb8faaaeb0af4b7291f9f18298d" }),
  pg_ctl: Object.freeze({ path: `${PG_BASE}/pg_ctl`, sha256: "a1841dc81d4c8afdda433f986a91f315d77a9c9ae1fb33eaf1ce1c645914a0a6" }),
  psql: Object.freeze({ path: `${PG_BASE}/psql`, sha256: "e18000996705007127b49872d46551558c98e80a8d0f2b26a67f9128c54689bd" }),
  pg_dump: Object.freeze({ path: `${PG_BASE}/pg_dump`, sha256: "fcf942438ee1844a0ccc029bbce18d69bc94166fa3f9053e3611e65285478209" }),
  pg_dumpall: Object.freeze({ path: `${PG_BASE}/pg_dumpall`, sha256: "588cedfc296a1acbe2460109c4637418eea12b682bea37d3fa37117c752c2120" }),
});

const LEDGER_IDENTITIES = Object.freeze([
  ["20260725120000", "kd_personal"],
  ["20260725220000", "etappe4_quellenregister_zugriff"],
  ["20260726120000", "etappe4_guard_ausbaustufe"],
  ["20260726160000", "etappe5_ki_unterbau"],
  ["20260726180000", "etappe5_ki_unterbau_haertung"],
  ["20260727180000", "etappe6_ausgabebudget_suche"],
  ["20260727190000", "etappe6_tageslimit_bauphase"],
  ["20260727210000", "etappe7_profil_topf"],
  ["20260729200000", "etappe7_structured_output_timeout"],
  ["20260729210000", "etappe8_film_forecast"],
  ["20260729220000", "etappe8_filmwissen_cache"],
  ["20260730110000", "etappe8_filmwissen_synthese_sicherung"],
  ["20260730140000", "etappe8_filmwissen_adapter_sperren"],
  ["20260730160000", "etappe8_filmwissen_atomarer_abschluss"],
  ["20260730180000", "etappe8_filmwissen_belegklassen"],
  ["20260730210000", "etappe8_filmwissen_adapter_betrieb"],
  ["20260730230000", "etappe9_beta_tageslimit"],
  ["20260730231000", "etappe9_beta_antwortlimit"],
  ["20260731120000", "shared_articles"],
  ["20260731121000", "archive_legacy_shared"],
  ["20260731140000", "demo_seed_catalog"],
  ["20260731170000", "split_streaming_catalog"],
  ["20260801194500", "stapelimport_medien"],
  ["20260802120000", "wochenplan_serienbeobachtung"],
  ["20260802220000", "shared_article_claim_tokens"],
  ["20260808120000", "ai_anbieter_request_kostenzaun"],
  ["20260808225500", "etappe9_beta_tageslimit_30"],
  ["20260809120000", "rollen_v1_access_basis"],
  ["20260809121000", "rollen_v1_access_enforcement"],
  ["20260809180000", "event_radar_local_basis"],
  ["20260809220000", "private_pilot_ops"],
  ["20260810120000", "private_pilot_retention_fix"],
  ["20260814120000", "radar_max_manual_pilot"],
  ["20260815120000", "private_export_radar_pilot_compat"],
  ["20260816010000", "radar_deferred_trigger_privilege_fix"],
]);

let passed = 0;
function check(label, condition) {
  assert.equal(Boolean(condition), true, label);
  passed += 1;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha1(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function requireHarness(condition, message) {
  if (!condition) throw new Error(`roles-restore-diagnostic: ${message}`);
}

function decodeStrictUtf8(bytes, label) {
  requireHarness(Buffer.isBuffer(bytes), `${label} ist kein Buffer`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`roles-restore-diagnostic: ${label} ist kein gueltiges UTF-8`);
  }
}

function validateExpectedRolesRestore(result, rolesBytes) {
  requireHarness(result?.exitCode === 0, "Exitcode ist nicht nullfrei 0");
  requireHarness(result.signal === null, "Signal ist nicht null");
  requireHarness(result.timedOut === false, "Timeout wurde gemeldet");
  requireHarness(result.overflow === false, "Outputoverflow wurde gemeldet");
  requireHarness(Buffer.isBuffer(result.stdout) && result.stdout.length === 0,
    "stdout ist nicht leer");

  const rolesSql = decodeStrictUtf8(rolesBytes, "roles.sql");
  const bootstrapCreateCount = rolesSql.split("\n")
    .filter((line) => line === `CREATE ROLE ${BOOTSTRAP_ADMIN};`).length;
  requireHarness(bootstrapCreateCount === 1,
    "roles.sql enthaelt nicht exakt ein passendes Bootstrap-CREATE-ROLE");

  requireHarness(Buffer.isBuffer(result.stderr), "stderr ist kein Buffer");
  requireHarness(result.stderr.length > 0 && result.stderr.length <= 1024,
    "stderr-Bytezahl liegt ausserhalb des engen Diagnosefensters");
  const stderr = decodeStrictUtf8(result.stderr, "stderr");
  requireHarness(Buffer.byteLength(stderr, "utf8") === result.stderr.length,
    "stderr-Bytezahl ist nicht kanonisch");
  requireHarness(!stderr.includes("\r") && stderr.endsWith("\n"),
    "stderr besitzt keine kanonischen C-locale-Zeilen");
  const lines = stderr.split("\n");
  requireHarness(lines.length === 3 && lines[2] === "",
    "stderr enthaelt nicht exakt zwei nichtleere Zeilen");
  requireHarness(lines[0] === `ERROR:  42710: role "${BOOTSTRAP_ADMIN}" already exists`,
    "unerwarteter SQLSTATE, Rollenname oder Fehlertext");
  const location = /^LOCATION:  CreateRole, user\.c:([1-9][0-9]*)$/.exec(lines[1]);
  requireHarness(location !== null,
    "unerwartete CreateRole-Location");
  return Object.freeze({
    sqlstate: "42710",
    stderrBytes: result.stderr.length,
    stderrLines: 2,
    locationLine: Number(location[1]),
  });
}

function runRolesRestoreDiagnosticUnitChecks() {
  const rolesBytes = Buffer.from(`CREATE ROLE ${BOOTSTRAP_ADMIN};\n`, "utf8");
  const stderr = Buffer.from(
    `ERROR:  42710: role "${BOOTSTRAP_ADMIN}" already exists\nLOCATION:  CreateRole, user.c:427\n`,
    "utf8",
  );
  const clean = Object.freeze({
    exitCode: 0,
    signal: null,
    timedOut: false,
    overflow: false,
    stdout: Buffer.alloc(0),
    stderr,
  });
  const accepted = validateExpectedRolesRestore(clean, rolesBytes);
  check("synthetische saubere 42710-Rollenrestore-Diagnose wird akzeptiert",
    accepted.sqlstate === "42710" && accepted.stderrLines === 2);

  const variants = Object.freeze([
    ["kein Fehler", { stderr: Buffer.alloc(0) }],
    ["falscher SQLSTATE", { stderr: Buffer.from(stderr.toString("utf8").replace("42710", "42501")) }],
    ["falsche Rolle", { stderr: Buffer.from(stderr.toString("utf8").replace(BOOTSTRAP_ADMIN, "other_role")) }],
    ["falscher Text", { stderr: Buffer.from(stderr.toString("utf8").replace("already exists", "duplicate")) }],
    ["falsche Funktion", { stderr: Buffer.from(stderr.toString("utf8").replace("CreateRole", "AlterRole")) }],
    ["falsche Datei", { stderr: Buffer.from(stderr.toString("utf8").replace("user.c", "acl.c")) }],
    ["nichtnumerische Zeile", { stderr: Buffer.from(stderr.toString("utf8").replace(":427", ":line")) }],
    ["zweiter ERROR", { stderr: Buffer.concat([stderr, Buffer.from("ERROR:  42501: extra\n")]) }],
    ["FATAL", { stderr: Buffer.concat([stderr, Buffer.from("FATAL:  extra\n")]) }],
    ["WARNING", { stderr: Buffer.concat([stderr, Buffer.from("WARNING:  extra\n")]) }],
    ["NOTICE", { stderr: Buffer.concat([stderr, Buffer.from("NOTICE:  extra\n")]) }],
    ["sonstige Zeile", { stderr: Buffer.concat([stderr, Buffer.from("extra\n")]) }],
    ["Nonzero-Exit", { exitCode: 1 }],
    ["Signal", { signal: "SIGTERM" }],
    ["Timeout", { timedOut: true }],
    ["Overflow", { overflow: true }],
    ["stdout", { stdout: Buffer.from("unexpected") }],
    ["CRLF", { stderr: Buffer.from(stderr.toString("utf8").replaceAll("\n", "\r\n")) }],
    ["kein finaler Newline", { stderr: stderr.subarray(0, -1) }],
    ["ungueltiges UTF-8", { stderr: Buffer.from([0xff]) }],
  ]);
  for (const [label, override] of variants) {
    assert.throws(() => validateExpectedRolesRestore(
      Object.freeze({ ...clean, ...override }), rolesBytes,
    ), /roles-restore-diagnostic:/);
    check(`synthetische Rollenrestore-Diagnose stoppt: ${label}`, true);
  }
  for (const [label, malformedRoles] of [
    ["Bootstrap-CREATE fehlt", Buffer.from("CREATE ROLE other_role;\n")],
    ["Bootstrap-CREATE doppelt", Buffer.concat([rolesBytes, rolesBytes])],
  ]) {
    assert.throws(() => validateExpectedRolesRestore(clean, malformedRoles),
      /roles-restore-diagnostic:/);
    check(`synthetische Rollenrestore-Diagnose stoppt: ${label}`, true);
  }
}

function processEnvironment(root) {
  return Object.freeze({
    PATH: "/usr/bin:/bin",
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
    TMPDIR: root,
    PGAPPNAME: "kd-e17b-canonical-v2-pg17-test",
  });
}

async function validatePrivateDirectory(path) {
  const [linkInfo, info, actual] = await Promise.all([lstat(path), stat(path), realpath(path)]);
  check(`privates Verzeichnis ${path}`, actual === path
    && !linkInfo.isSymbolicLink()
    && info.isDirectory()
    && info.uid === process.getuid()
    && (info.mode & 0o777) === 0o700);
}

async function validatePrivateFile(path, expectedBytes) {
  const [linkInfo, info, actual, bytes] = await Promise.all([
    lstat(path), stat(path), realpath(path), readFile(path),
  ]);
  check(`private Datei ${path}`, actual === path
    && !linkInfo.isSymbolicLink()
    && info.isFile()
    && info.nlink === 1
    && info.uid === process.getuid()
    && (info.mode & 0o777) === 0o600
    && bytes.equals(expectedBytes));
  return bytes;
}

async function writeNoClobber(path, bytes) {
  const handle = await open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return validatePrivateFile(path, bytes);
}

async function attestBinary(name, root) {
  const expected = BINARIES[name];
  assert.ok(expected, `unbekanntes Binary ${name}`);
  const [linkInfo, info, actual, bytes] = await Promise.all([
    lstat(expected.path), stat(expected.path), realpath(expected.path), readFile(expected.path),
  ]);
  check(`Binaryattestierung ${name}`, actual === expected.path
    && !linkInfo.isSymbolicLink()
    && info.isFile()
    && info.uid === process.getuid()
    && (info.mode & 0o111) !== 0
    && sha256(bytes) === expected.sha256
    && actual.startsWith(`${PG_BASE}/`));
  return expected.path;
}

const activeChildren = new Set();

async function runBinary(name, argv, {
  root,
  cwd = root,
  input = Buffer.alloc(0),
  timeoutMs = PROCESS_TIMEOUT_MS,
  allowFailure = false,
} = {}) {
  const binary = await attestBinary(name, root);
  assert.ok(Array.isArray(argv) && argv.every((arg) => typeof arg === "string"));
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binary, argv, {
      cwd,
      env: processEnvironment(root),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeChildren.add(child);
    const stdout = [];
    const stderr = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let timedOut = false;
    let overflow = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdoutLength += chunk.length;
      if (stdoutLength > MAX_OUTPUT_BYTES) {
        overflow = true;
        child.kill("SIGKILL");
      } else stdout.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrLength += chunk.length;
      if (stderrLength > MAX_OUTPUT_BYTES) {
        overflow = true;
        child.kill("SIGKILL");
      } else stderr.push(Buffer.from(chunk));
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      activeChildren.delete(child);
      rejectPromise(error);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      activeChildren.delete(child);
      const result = Object.freeze({
        exitCode,
        signal,
        timedOut,
        overflow,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
      if (!allowFailure && (exitCode !== 0 || signal !== null || timedOut || overflow)) {
        const diagnostic = result.stderr.toString("utf8")
          .replaceAll(root, "<TASK_ROOT>")
          .replace(/[^\x20-\x7e\n]/g, "?")
          .slice(0, 600);
        rejectPromise(new Error(`${name} failed exit=${exitCode} signal=${signal} timeout=${timedOut} overflow=${overflow} stderrSha256=${sha256(result.stderr)} diagnostic=${JSON.stringify(diagnostic)}`));
      } else resolvePromise(result);
    });
    child.stdin.end(input);
  });
}

function clusterPaths(root, name, port, admin) {
  const base = join(root, name);
  return {
    name,
    root,
    base,
    data: join(base, "data"),
    socket: join(base, "socket"),
    dump: join(base, "dump"),
    port,
    admin,
    server: null,
  };
}

async function prepareClusterDirectories(cluster) {
  await mkdir(cluster.base, { mode: 0o700 });
  await mkdir(cluster.data, { mode: 0o700 });
  await mkdir(cluster.socket, { mode: 0o700 });
  await mkdir(cluster.dump, { mode: 0o700 });
  await Promise.all([
    validatePrivateDirectory(cluster.base),
    validatePrivateDirectory(cluster.data),
    validatePrivateDirectory(cluster.socket),
    validatePrivateDirectory(cluster.dump),
  ]);
}

async function initCluster(cluster) {
  await runBinary("initdb", [
    "--pgdata", cluster.data,
    "--auth=trust",
    "--encoding=UTF8",
    "--locale=C",
    "--username", cluster.admin,
  ], { root: cluster.root, cwd: cluster.base });
}

async function startCluster(cluster) {
  const binary = await attestBinary("postgres", cluster.root);
  await validatePrivateDirectory(cluster.data);
  await validatePrivateDirectory(cluster.socket);
  const child = spawn(binary, [
    "-D", cluster.data,
    "-c", "listen_addresses=",
    "-c", `unix_socket_directories=${cluster.socket}`,
    "-c", "unix_socket_permissions=0700",
    "-c", `port=${cluster.port}`,
    "-c", "logging_collector=off",
  ], {
    cwd: cluster.base,
    env: processEnvironment(cluster.root),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  cluster.server = child;
  activeChildren.add(child);
  let outputLength = 0;
  let outputTail = "";
  let settled = false;
  await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        rejectPromise(new Error(`${cluster.name} server readiness timeout`));
      }
    }, SERVER_TIMEOUT_MS);
    const inspect = (chunk) => {
      outputLength += chunk.length;
      if (outputLength > MAX_OUTPUT_BYTES && !settled) {
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        rejectPromise(new Error(`${cluster.name} server output overflow`));
        return;
      }
      outputTail = `${outputTail}${chunk.toString("utf8")}`.slice(-512);
      if (!settled && outputTail.includes("database system is ready to accept connections")) {
        settled = true;
        clearTimeout(timer);
        resolvePromise();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("close", (exitCode, signal) => {
      activeChildren.delete(child);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectPromise(new Error(`${cluster.name} server exited early exit=${exitCode} signal=${signal}`));
      }
    });
    child.once("error", (error) => {
      activeChildren.delete(child);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectPromise(error);
      }
    });
  });
  check(`${cluster.name} startete socket-only`, child.exitCode === null);
}

function psqlArgv(cluster, database) {
  return [
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--host", cluster.socket,
    "--port", String(cluster.port),
    "--username", cluster.admin,
    "--dbname", database,
    "--quiet",
    "--no-align",
    "--tuples-only",
  ];
}

function rolesRestoreArgv(cluster) {
  return [
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=0",
    "--set", "VERBOSITY=verbose",
    "--host", cluster.socket,
    "--port", String(cluster.port),
    "--username", BOOTSTRAP_ADMIN,
    "--dbname", "postgres",
    "--quiet",
    "--no-align",
    "--tuples-only",
  ];
}

async function psql(cluster, database, input, { allowFailure = false } = {}) {
  try {
    return await runBinary("psql", psqlArgv(cluster, database), {
      root: cluster.root,
      cwd: cluster.base,
      input: Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8"),
      allowFailure,
    });
  } catch (error) {
    throw new Error(`psql-context=${cluster.name}/${database} ${error.message}`);
  }
}

async function restoreRoles(cluster, rolesBytes) {
  const result = await runBinary("psql", rolesRestoreArgv(cluster), {
    root: cluster.root,
    cwd: cluster.base,
    input: rolesBytes,
    allowFailure: true,
  });
  const diagnostic = validateExpectedRolesRestore(result, rolesBytes);
  check("Rollenrestore akzeptiert exakt einen erwarteten 42710-Datensatz",
    diagnostic.sqlstate === "42710"
      && diagnostic.stderrLines === 2
      && diagnostic.stderrBytes === result.stderr.length);
  return diagnostic;
}

async function readSystemIdentifier(cluster) {
  const result = await psql(cluster, "postgres",
    "SELECT system_identifier::text FROM pg_control_system();");
  const identifier = result.stdout.toString("ascii").trimEnd();
  check(`${cluster.name} besitzt echte numerische Cluster-System-ID`,
    /^[1-9][0-9]{10,}$/.test(identifier));
  return identifier;
}

async function verifyBootstrapAndMembership(cluster) {
  const bootstrap = await psql(cluster, "postgres", `
SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls
FROM pg_roles
WHERE rolname='${BOOTSTRAP_ADMIN}';
`);
  check(`${cluster.name} besitzt exakte synthetische Bootstrapattribute`,
    bootstrap.stdout.toString("utf8") === `${BOOTSTRAP_ADMIN}|t|t|t|t|t|t|t\n`);

  const memberships = await psql(cluster, "postgres", `
SELECT granted.rolname,member.rolname,grantor.rolname,
       membership.admin_option,membership.inherit_option,membership.set_option
FROM pg_auth_members AS membership
JOIN pg_roles AS granted ON granted.oid=membership.roleid
JOIN pg_roles AS member ON member.oid=membership.member
JOIN pg_roles AS grantor ON grantor.oid=membership.grantor
WHERE granted.rolname IN ('kd_fixture_reader','kd_fixture_member','kd_fixture_leaf')
   OR member.rolname IN ('kd_fixture_reader','kd_fixture_member','kd_fixture_leaf')
ORDER BY granted.rolname COLLATE "C",member.rolname COLLATE "C",grantor.rolname COLLATE "C";
`);
  check(`${cluster.name} besitzt komplette zweistufige Membership mit Grantor/Optionen`,
    memberships.stdout.toString("utf8") === [
      `kd_fixture_member|kd_fixture_leaf|${BOOTSTRAP_ADMIN}|f|t|f`,
      `kd_fixture_reader|kd_fixture_member|${BOOTSTRAP_ADMIN}|t|f|t`,
      "",
    ].join("\n"));
}

async function startSnapshotKeeper(cluster, database) {
  const binary = await attestBinary("psql", cluster.root);
  const child = spawn(binary, psqlArgv(cluster, database), {
    cwd: cluster.base,
    env: processEnvironment(cluster.root),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  activeChildren.add(child);
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  const snapshotId = await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        rejectPromise(new Error("snapshot keeper timeout"));
      }
    }, PROCESS_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout = Buffer.concat([stdout, Buffer.from(chunk)]);
      if (stdout.length > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
      const newline = stdout.indexOf(0x0a);
      if (!settled && newline >= 0) {
        const value = stdout.subarray(0, newline).toString("ascii");
        if (!/^[0-9A-F]{8}-[0-9A-F]{8}-[1-9][0-9]*$/i.test(value)) {
          settled = true;
          clearTimeout(timer);
          rejectPromise(new Error("non-canonical snapshot id"));
        } else {
          settled = true;
          clearTimeout(timer);
          resolvePromise(value);
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = Buffer.concat([stderr, Buffer.from(chunk)]);
      if (stderr.length > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
    });
    child.once("error", (error) => {
      activeChildren.delete(child);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectPromise(error);
      }
    });
    child.once("close", (exitCode, signal) => {
      activeChildren.delete(child);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        rejectPromise(new Error(`snapshot keeper exited exit=${exitCode} signal=${signal} stderrSha256=${sha256(stderr)}`));
      }
    });
    child.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n");
  });
  let closed = false;
  return Object.freeze({
    snapshotId,
    async close() {
      if (closed) throw new Error("snapshot keeper replay");
      closed = true;
      const closedPromise = new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          rejectPromise(new Error("snapshot keeper close timeout"));
        }, 20_000);
        child.once("close", (exitCode, signal) => {
          clearTimeout(timer);
          activeChildren.delete(child);
          if (exitCode === 0 && signal === null) resolvePromise();
          else rejectPromise(new Error(`snapshot keeper close exit=${exitCode} signal=${signal}`));
        });
      });
      child.stdin.end("ROLLBACK;\n\\q\n");
      await closedPromise;
    },
  });
}

async function capture(session, cluster, role, snapshotId) {
  const plan = session.prepareCapture({ role, snapshotId });
  const result = await psql(cluster, DATABASE, plan.stdinSql, { allowFailure: true });
  const transcript = plan.parseUntrustedStdout(result.stdout, { secrets: [
    "synthetic-secret-marker-not-present",
    "synthetic-password-marker-not-present",
  ] });
  if (result.exitCode !== 0 || result.signal !== null || result.timedOut || result.overflow) {
    throw new Error(`canonical psql failed exit=${result.exitCode} signal=${result.signal} timeout=${result.timedOut} overflow=${result.overflow} stderrSha256=${sha256(result.stderr)}`);
  }
  return transcript;
}

async function requirePathAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} blieb nach Cleanup bestehen`);
}

async function requireDirectoryEmptyOrAbsent(path, label) {
  let entries;
  try {
    entries = await readdir(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (entries.length !== 0) throw new Error(`${label} ist nicht leer`);
}

async function awaitChildClose(child, label, { sendTerm = false } = {}) {
  if (!child || !activeChildren.has(child)) return;
  await new Promise((resolvePromise, rejectPromise) => {
    let escalated = false;
    const killTimer = setTimeout(() => {
      if (activeChildren.has(child)) {
        escalated = true;
        child.kill("SIGKILL");
      }
    }, 10_000);
    const finalTimer = setTimeout(() => {
      rejectPromise(new Error(`${label} child cleanup timeout`));
    }, 20_000);
    child.once("close", () => {
      clearTimeout(killTimer);
      clearTimeout(finalTimer);
      activeChildren.delete(child);
      if (escalated) check(`${label} fallback benötigte bounded SIGKILL`, true);
      resolvePromise();
    });
    if (sendTerm) child.kill("SIGTERM");
  });
}

async function stopCluster(cluster, { forcePgCtlFailure = false } = {}) {
  const errors = [];
  let stopResult;
  if (cluster.server && activeChildren.has(cluster.server)) {
    if (forcePgCtlFailure) {
      try { await chmod(cluster.data, 0o000); } catch (error) { errors.push(error); }
    }
    try {
      stopResult = await runBinary("pg_ctl", [
        "--pgdata", cluster.data,
        "--wait",
        "--timeout", "60",
        "--mode", "fast",
        "stop",
      ], { root: cluster.root, cwd: cluster.base, allowFailure: true });
    } catch (error) {
      errors.push(error);
    } finally {
      if (forcePgCtlFailure) {
        try { await chmod(cluster.data, 0o700); } catch (error) { errors.push(error); }
      }
    }
    const pgCtlFailed = !stopResult
      || stopResult.exitCode !== 0
      || stopResult.signal !== null
      || stopResult.timedOut
      || stopResult.overflow;
    if (forcePgCtlFailure && !pgCtlFailed) {
      errors.push(new Error("empirischer pg_ctl-Failure wurde nicht erzwungen"));
    }
    if (!forcePgCtlFailure && pgCtlFailed) {
      errors.push(new Error(`pg_ctl fast stop failed exit=${stopResult?.exitCode}`));
    }
    try {
      await awaitChildClose(cluster.server, `${cluster.name} postgres`, {
        sendTerm: pgCtlFailed,
      });
    } catch (error) {
      errors.push(error);
    }
    if (forcePgCtlFailure && pgCtlFailed) {
      check("empirischer pg_ctl-Failure wurde erzwungen", true);
    }
  }
  const pathResults = await Promise.allSettled([
    requirePathAbsent(join(cluster.data, "postmaster.pid"), `${cluster.name} postmaster.pid`),
    requireDirectoryEmptyOrAbsent(cluster.socket, `${cluster.name} Socketverzeichnis`),
  ]);
  for (const result of pathResults) {
    if (result.status === "rejected") errors.push(result.reason);
  }
  if (errors.length !== 0) {
    throw new Error(errors.map((error) => error.message).join(" | "));
  }
  check(`${cluster.name} vollständig gestoppt`, !cluster.server || !activeChildren.has(cluster.server));
}

function fixtureSql() {
  const ledgerRows = LEDGER_IDENTITIES.map(([version, name], index) => {
    const statements = index === 3
      ? "ARRAY['alpha',NULL,E'line1\\nline2',E'unit\\x1fseparator','alpha']::text[]"
      : index === 7 ? "NULL::text[]" : "ARRAY[]::text[]";
    return `(${sqlLiteral(version)},${sqlLiteral(name)},${statements})`;
  }).join(",\n");
  return `
CREATE SCHEMA auth AUTHORIZATION kd_fixture_owner;
CREATE SCHEMA supabase_migrations AUTHORIZATION kd_fixture_owner;
CREATE SCHEMA fixture_extension AUTHORIZATION kd_fixture_owner;
CREATE EXTENSION hstore WITH SCHEMA fixture_extension;
SET ROLE kd_fixture_owner;
CREATE TYPE public.fixture_enum AS ENUM ('first','second','東京');
CREATE DOMAIN public.fixture_domain AS varchar(12) COLLATE "C" DEFAULT 'seed' CHECK (length(VALUE)>0);
CREATE TYPE public.fixture_composite AS (label text, amount numeric(12,3));
CREATE TYPE public.fixture_range AS RANGE (subtype=numeric, multirange_type_name=public.fixture_multirange);
CREATE TABLE public.fixture_parent (
  id integer NOT NULL,
  label varchar(24) COLLATE "C" DEFAULT 'label',
  note text,
  payload jsonb,
  raw_payload json,
  tags text[],
  amount public.fixture_domain,
  CONSTRAINT fixture_parent_pk PRIMARY KEY(id)
) PARTITION BY RANGE(id);
CREATE TABLE public.fixture_parent_p0 PARTITION OF public.fixture_parent FOR VALUES FROM (0) TO (100);
CREATE TABLE public.fixture_misc (
  id bigint GENERATED ALWAYS AS IDENTITY,
  txt text COLLATE "C",
  flag boolean,
  n numeric(10,2),
  raw_json json,
  normalized_json jsonb,
  bytes bytea,
  arr text[],
  generated_txt text GENERATED ALWAYS AS (coalesce(txt,'')||':'||coalesce(n::text,'')) STORED
);
CREATE TABLE public.fixture_empty (id integer);
CREATE TABLE public.fixture_duplicates (value text);
CREATE TABLE public.kd_ai_limits (
  schluessel text PRIMARY KEY,
  wert jsonb NOT NULL,
  flags jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  encrypted_password text
);
CREATE TABLE supabase_migrations.schema_migrations (
  version text NOT NULL,
  name text NOT NULL,
  statements text[]
);
CREATE SEQUENCE public.fixture_seq AS bigint START WITH 10 INCREMENT BY 3 MINVALUE 1 CACHE 4 OWNED BY public.fixture_misc.id;
SELECT setval('public.fixture_seq',42,false);
CREATE FUNCTION public.fixture_trigger_fn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path=pg_catalog,public AS $$ BEGIN NEW.note:=coalesce(NEW.note,'triggered'); RETURN NEW; END $$;
CREATE TRIGGER fixture_trigger BEFORE INSERT ON public.fixture_parent FOR EACH ROW EXECUTE FUNCTION public.fixture_trigger_fn();
ALTER TABLE public.fixture_parent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_empty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixture_empty FORCE ROW LEVEL SECURITY;
CREATE POLICY fixture_policy ON public.fixture_parent AS RESTRICTIVE FOR ALL
  TO kd_fixture_owner,kd_fixture_reader,kd_fixture_writer USING (id>=0) WITH CHECK (id<1000);
CREATE POLICY fixture_owner_policy ON public.fixture_parent AS PERMISSIVE FOR ALL
  TO kd_fixture_owner USING (true) WITH CHECK (true);
CREATE VIEW public.fixture_view WITH (security_barrier=true) AS SELECT id,label FROM public.fixture_parent;
CREATE MATERIALIZED VIEW public.fixture_matview AS SELECT count(*) AS total FROM public.fixture_parent;
CREATE INDEX fixture_misc_txt_idx ON public.fixture_misc USING btree (txt) WHERE txt IS NOT NULL;
ALTER DEFAULT PRIVILEGES FOR ROLE kd_fixture_owner IN SCHEMA public GRANT SELECT ON TABLES TO kd_fixture_reader;
GRANT USAGE ON SCHEMA public TO kd_fixture_reader;
GRANT SELECT ON public.fixture_parent TO kd_fixture_reader;
GRANT SELECT(label) ON public.fixture_parent TO kd_fixture_writer;
GRANT EXECUTE ON FUNCTION public.fixture_trigger_fn() TO kd_fixture_reader;
GRANT USAGE ON TYPE public.fixture_enum TO kd_fixture_reader;
INSERT INTO public.fixture_parent(id,label,note,payload,raw_payload,tags,amount) VALUES
  (1,'','line1\nline2','1'::jsonb,E'{ "raw" : "a|b" }'::json,array_fill('x'::text,ARRAY[2],ARRAY[0]),'1.000'),
  (2,'unicode-ä','separator|wert','"1"'::jsonb,'{"raw":"東京"}'::json,ARRAY['','|',E'\\n','東京'],'2.500');
INSERT INTO public.fixture_misc(txt,flag,n,raw_json,normalized_json,bytes,arr) VALUES
  ('',NULL,1.00,E'{ "n" : 1 }'::json,'1'::jsonb,decode('00ff','hex'),array_fill('x'::text,ARRAY[2],ARRAY[0])),
  ('1',true,1.0,E'{"n":1}'::json,'"1"'::jsonb,decode('7c0a','hex'),ARRAY['|',E'\\n','東京']);
INSERT INTO public.fixture_duplicates(value) VALUES ('same'),('same');
INSERT INTO public.kd_ai_limits(schluessel,wert,flags) VALUES
  ('task_modell','{"stable":"m"}','{"enabled":true}'),
  ('task_max_tokens','{"stable":"t"}','{"enabled":true}'),
  ('task_max_reservierung_usd_cent','{"stable":"r"}','{"enabled":true}'),
  ('scalar_decoy','42'::jsonb,'{"visible":true}');
INSERT INTO auth.users(id,email,encrypted_password) VALUES
  ('00000000-0000-0000-0000-000000000001','synthetic-one@example.invalid','synthetic-hash-one'),
  ('abcdefab-cdef-ffff-ffff-abcdefabcdef','synthetic-two@example.invalid','synthetic-hash-two');
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES
${ledgerRows};
RESET ROLE;
`;
}

async function createSourceFixture(cluster) {
  await psql(cluster, "postgres", `
CREATE ROLE kd_fixture_owner NOLOGIN;
CREATE ROLE kd_fixture_writer NOLOGIN;
CREATE ROLE kd_fixture_leaf NOLOGIN;
CREATE ROLE kd_fixture_member NOLOGIN;
CREATE ROLE kd_fixture_reader NOLOGIN;
GRANT kd_fixture_reader TO kd_fixture_member WITH ADMIN TRUE, INHERIT FALSE, SET TRUE;
GRANT kd_fixture_member TO kd_fixture_leaf WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
CREATE DATABASE ${DATABASE} OWNER kd_fixture_owner TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C';
`);
  await psql(cluster, DATABASE, fixtureSql());
}

function verifyRolesDump(rolesBytes) {
  const text = decodeStrictUtf8(rolesBytes, "roles.sql");
  const lines = text.split("\n");
  const bootstrapCreates = lines.filter(
    (line) => line === `CREATE ROLE ${BOOTSTRAP_ADMIN};`,
  );
  const readerGrant = lines.filter((line) => line.startsWith(
    "GRANT kd_fixture_reader TO kd_fixture_member ",
  ) && line.endsWith(` GRANTED BY ${BOOTSTRAP_ADMIN};`));
  const memberGrant = lines.filter((line) => line.startsWith(
    "GRANT kd_fixture_member TO kd_fixture_leaf ",
  ) && line.endsWith(` GRANTED BY ${BOOTSTRAP_ADMIN};`));
  const bootstrapGrantorCount = lines.filter(
    (line) => line.endsWith(` GRANTED BY ${BOOTSTRAP_ADMIN};`),
  ).length;
  check("roles.sql enthaelt Bootstrap und beide echten Memberships mit festem Grantor",
    bootstrapCreates.length === 1
      && readerGrant.length === 1
      && memberGrant.length === 1
      && bootstrapGrantorCount === 2);
}

async function dumpSource(cluster, snapshotId) {
  const roles = await runBinary("pg_dumpall", [
    "--roles-only",
    "--no-role-passwords",
    "--host", cluster.socket,
    "--port", String(cluster.port),
    "--username", cluster.admin,
    "--database=postgres",
  ], { root: cluster.root, cwd: cluster.dump });
  const database = await runBinary("pg_dump", [
    "--host", cluster.socket,
    "--port", String(cluster.port),
    "--username", cluster.admin,
    "--dbname", DATABASE,
    "--snapshot", snapshotId,
    "--format=p",
    "--create",
    "--clean",
  ], { root: cluster.root, cwd: cluster.dump });
  const rolesPath = join(cluster.dump, "roles.sql");
  const databasePath = join(cluster.dump, "database.sql");
  const rolesReadback = await writeNoClobber(rolesPath, roles.stdout);
  const databaseReadback = await writeNoClobber(databasePath, database.stdout);
  check("Roles-/DB-Dumps wurden no-clobber und hashstabil persistiert",
    rolesReadback.equals(roles.stdout)
      && sha256(rolesReadback) === sha256(roles.stdout)
      && sha256(databaseReadback) === sha256(database.stdout)
      && rolesReadback.includes(Buffer.from("CREATE ROLE kd_fixture_owner", "utf8"))
      && !rolesReadback.includes(Buffer.from("PASSWORD", "utf8")));
  verifyRolesDump(rolesReadback);
  return Object.freeze({ roles: rolesReadback, database: databaseReadback });
}

async function restoreDumps(cluster, dumps) {
  const rolesDiagnostic = await restoreRoles(cluster, dumps.roles);
  await verifyBootstrapAndMembership(cluster);
  await psql(cluster, "postgres", `CREATE DATABASE ${DATABASE} TEMPLATE template0;`);
  await psql(cluster, "postgres", dumps.database);
  return rolesDiagnostic;
}

async function resetDatabase(cluster, databaseDump) {
  await psql(cluster, "postgres", databaseDump);
}

async function expectExactStopReason(label, expectedReasonCode, operation) {
  let actualReasonCode;
  try {
    await operation();
  } catch (error) {
    if (error?.code !== "E17B_STOP") throw error;
    actualReasonCode = error.reasonCode;
  }
  check(
    `${label} stoppt mit ${expectedReasonCode}; actual=${actualReasonCode || "<NONE>"}`,
    actualReasonCode === expectedReasonCode,
  );
}

async function expectRealMutationRed(
  cluster,
  databaseDump,
  label,
  expectedReasonCode,
  mutation,
  cleanup = null,
) {
  await resetDatabase(cluster, databaseDump);
  const session = createCanonicalV2UntrustedSession();
  const beforeKeeper = await startSnapshotKeeper(cluster, DATABASE);
  let before;
  try {
    before = await capture(session, cluster, "22-canonical-detail", beforeKeeper.snapshotId);
  } finally {
    await beforeKeeper.close();
  }
  await psql(cluster, DATABASE, mutation);
  const afterKeeper = await startSnapshotKeeper(cluster, DATABASE);
  try {
    await expectExactStopReason(`reale PG17-Mutation wird rot: ${label}`, expectedReasonCode, async () => {
      const after = await capture(session, cluster, "23-canonical-detail", afterKeeper.snapshotId);
      session.compareBaseline(before, after);
    });
  } finally {
    await afterKeeper.close();
    if (cleanup) await psql(cluster, "postgres", cleanup);
  }
}

async function captureRealBaseline(session, cluster) {
  const sourceKeeper = await startSnapshotKeeper(cluster, DATABASE);
  let source;
  try {
    source = await capture(session, cluster, "22-canonical-detail", sourceKeeper.snapshotId);
  } finally {
    await sourceKeeper.close();
  }
  const restoreKeeper = await startSnapshotKeeper(cluster, DATABASE);
  let restore;
  try {
    restore = await capture(session, cluster, "23-canonical-detail", restoreKeeper.snapshotId);
  } finally {
    await restoreKeeper.close();
  }
  session.compareBaseline(source, restore);
}

async function expectRealPostwriteMutationRed(
  cluster,
  databaseDump,
  repoRoot,
  label,
  expectedReasonCode,
  mutation,
) {
  await resetDatabase(cluster, databaseDump);
  const session = createCanonicalV2UntrustedSession();
  await captureRealBaseline(session, cluster);
  await applyCommittedMigration(cluster, repoRoot);
  await psql(cluster, DATABASE, mutation);
  const postKeeper = await startSnapshotKeeper(cluster, DATABASE);
  try {
    await expectExactStopReason(`reale PG17-Postwrite-Mutation wird rot: ${label}`, expectedReasonCode, async () => {
      await capture(session, cluster, "42-db-postflight", postKeeper.snapshotId);
    });
  } finally {
    await postKeeper.close();
  }
}

async function applyCommittedMigration(cluster, repoRoot) {
  const migrationPath = join(repoRoot, MIGRATION_PATH);
  const bytes = await readFile(migrationPath);
  check("committed Migration besitzt eingefrorenen Blob-/Raw-SHA-Vertrag",
    gitBlobSha1(bytes) === MIGRATION_BLOB && sha256(bytes) === MIGRATION_SHA256);
  const newline = bytes.at(-1) === 0x0a ? Buffer.alloc(0) : Buffer.from("\n");
  const transaction = Buffer.concat([
    Buffer.from("BEGIN;\n", "utf8"),
    bytes,
    newline,
    Buffer.from(
      `insert into supabase_migrations.schema_migrations (version, name, statements) values ('${MIGRATION_VERSION}', '${MIGRATION_NAME}', ARRAY[]::text[]);\nCOMMIT;\n`,
      "utf8",
    ),
  ]);
  await psql(cluster, DATABASE, transaction);
}

const categoryMutationCases = Object.freeze([
  ["schema owner", "CANONICAL_V2_BASELINE_DRIFT", "ALTER SCHEMA public OWNER TO kd_fixture_reader;"],
  ["relation kind/options/RLS", "CANONICAL_V2_BASELINE_DRIFT", "ALTER TABLE public.fixture_parent FORCE ROW LEVEL SECURITY; ALTER TABLE public.fixture_misc SET (fillfactor=70);"],
  ["column type/typmod", "CANONICAL_V2_BASELINE_DRIFT", "ALTER TABLE public.fixture_parent ALTER COLUMN note TYPE varchar(30);"],
  ["column null/default", "CANONICAL_V2_BASELINE_DRIFT", "ALTER TABLE public.fixture_misc ALTER COLUMN txt SET NOT NULL; ALTER TABLE public.fixture_misc ALTER COLUMN n SET DEFAULT 7;"],
  ["column identity/generated/collation/ACL", "CANONICAL_V2_BASELINE_DRIFT", "GRANT UPDATE(txt) ON public.fixture_misc TO kd_fixture_writer;"],
  ["constraint", "CANONICAL_V2_BASELINE_DRIFT", "ALTER TABLE public.fixture_misc ADD CONSTRAINT fixture_n_positive CHECK (n>0);"],
  ["index status/definition", "CANONICAL_V2_BASELINE_DRIFT", "CREATE INDEX fixture_misc_n_idx ON public.fixture_misc USING btree(n DESC);"],
  ["trigger enabled/function/definition", "CANONICAL_V2_BASELINE_DRIFT", "ALTER TABLE public.fixture_parent DISABLE TRIGGER fixture_trigger;"],
  ["policy roles/qual/check/permissive", "CANONICAL_V2_BASELINE_DRIFT", "ALTER POLICY fixture_policy ON public.fixture_parent TO kd_fixture_reader USING (id>1) WITH CHECK (id<9);"],
  ["view definition", "CANONICAL_V2_BASELINE_DRIFT", "CREATE OR REPLACE VIEW public.fixture_view WITH (security_barrier=true) AS SELECT id,label,note FROM public.fixture_parent;"],
  ["matview population", "CANONICAL_V2_BASELINE_DRIFT", "REFRESH MATERIALIZED VIEW public.fixture_matview WITH NO DATA;"],
  ["routine definition/config", "CANONICAL_V2_BASELINE_DRIFT", "CREATE OR REPLACE FUNCTION public.fixture_trigger_fn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RETURN NEW; END $$;"],
  ["enum", "CANONICAL_V2_BASELINE_DRIFT", "ALTER TYPE public.fixture_enum ADD VALUE 'third';"],
  ["domain", "CANONICAL_V2_BASELINE_DRIFT", "ALTER DOMAIN public.fixture_domain SET NOT NULL;"],
  ["composite", "CANONICAL_V2_BASELINE_DRIFT", "ALTER TYPE public.fixture_composite ADD ATTRIBUTE changed boolean;"],
  ["range/multirange", "CANONICAL_V2_BASELINE_DRIFT", "CREATE TYPE public.extra_range AS RANGE (subtype=integer,multirange_type_name=public.extra_multirange);"],
  ["sequence parameters", "CANONICAL_V2_BASELINE_DRIFT", "ALTER SEQUENCE public.fixture_seq INCREMENT BY 5;"],
  ["sequence value", "CANONICAL_V2_BASELINE_DRIFT", "SELECT setval('public.fixture_seq',99,true);"],
  ["sequence dependency", "CANONICAL_V2_BASELINE_DRIFT", "ALTER SEQUENCE public.fixture_seq OWNED BY NONE;"],
  ["extension", "CANONICAL_V2_BASELINE_DRIFT", "ALTER EXTENSION hstore SET SCHEMA supabase_migrations;"],
  ["relation/function/type ACL", "CANONICAL_V2_BASELINE_DRIFT", "GRANT UPDATE ON public.fixture_misc TO kd_fixture_writer; REVOKE USAGE ON TYPE public.fixture_enum FROM kd_fixture_reader;"],
  ["default ACL", "CANONICAL_V2_BASELINE_DRIFT", "ALTER DEFAULT PRIVILEGES FOR ROLE kd_fixture_owner IN SCHEMA public GRANT INSERT ON TABLES TO kd_fixture_writer;"],
  ["dynamic role attributes", "CANONICAL_V2_BASELINE_DRIFT", "ALTER ROLE kd_fixture_reader CREATEDB;", "ALTER ROLE kd_fixture_reader NOCREATEDB;"],
  ["direct/transitive membership options", "CANONICAL_V2_BASELINE_DRIFT", "CREATE ROLE kd_fixture_membership_extra NOLOGIN ADMIN kd_fixture_reader; CREATE ROLE kd_fixture_membership_leaf NOLOGIN ADMIN kd_fixture_membership_extra;", "DROP ROLE kd_fixture_membership_leaf; DROP ROLE kd_fixture_membership_extra;"],
  ["inheritance/partition bound", "CANONICAL_V2_BASELINE_DRIFT", "ALTER TABLE public.fixture_parent DETACH PARTITION public.fixture_parent_p0;"],
  ["table set 0/N", "CANONICAL_V2_BASELINE_DRIFT", "CREATE TABLE public.fixture_added(id integer);"],
  ["rowcount/duplicate rows", "CANONICAL_V2_BASELINE_DRIFT", "INSERT INTO public.fixture_duplicates(value) VALUES ('same');"],
  ["typed data/raw JSON vs JSONB/scalar JSONB", "CANONICAL_V2_BASELINE_DRIFT", "UPDATE public.fixture_misc SET raw_json=E'{  \"n\" : 1 }'::json,normalized_json='false'::jsonb WHERE id=1;"],
  ["array lower bound", "CANONICAL_V2_BASELINE_DRIFT", "UPDATE public.fixture_misc SET arr=array_fill('x'::text,ARRAY[2],ARRAY[-2]) WHERE id=1;"],
  ["auth UUID set", "CANONICAL_V2_BASELINE_DRIFT", "INSERT INTO auth.users(id,email,encrypted_password) VALUES ('00000000-0000-0000-0000-000000000003','synthetic-three@example.invalid','synthetic-hash-three');"],
  ["ledger name/statements/NULL/U+001F/duplicate", "CANONICAL_V2_BASELINE_DRIFT", "UPDATE supabase_migrations.schema_migrations SET name=E'drift\\x1fline',statements=ARRAY['x',NULL,'x'] WHERE version='20260816010000';"],
]);

const prewriteTargetCases = Object.freeze([
  ["Blog-Key in task_modell", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=wert||'{\"blog-profile-extract\":\"klein\"}'::jsonb WHERE schluessel='task_modell';"],
  ["Blog-Key in task_max_tokens", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=wert||'{\"blog-profile-extract\":2048}'::jsonb WHERE schluessel='task_max_tokens';"],
  ["Blog-Key in task_max_reservierung_usd_cent", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=wert||'{\"blog-profile-extract\":5}'::jsonb WHERE schluessel='task_max_reservierung_usd_cent';"],
  ["fehlende Zielzeile", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "DELETE FROM public.kd_ai_limits WHERE schluessel='task_modell';"],
  ["skalare Zielzeile", "INVALID_CANONICAL_V2_RECORD", "UPDATE public.kd_ai_limits SET wert='42'::jsonb WHERE schluessel='task_modell';"],
  ["Blog-Key auf fremder Zeile", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert='{\"blog-profile-extract\":1}'::jsonb WHERE schluessel='scalar_decoy';"],
  ["vorgezogene Ziel-Ledgerzeile", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", `INSERT INTO supabase_migrations.schema_migrations VALUES ('${MIGRATION_VERSION}','${MIGRATION_NAME}',ARRAY[]::text[]);`],
]);

const postwriteTargetCases = Object.freeze([
  ["task_modell falscher Wert", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=jsonb_set(wert,'{blog-profile-extract}','\"gross\"'::jsonb) WHERE schluessel='task_modell';"],
  ["task_modell falscher JSON-Typ", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=jsonb_set(wert,'{blog-profile-extract}','1'::jsonb) WHERE schluessel='task_modell';"],
  ["task_max_tokens falscher Wert", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=jsonb_set(wert,'{blog-profile-extract}','2049'::jsonb) WHERE schluessel='task_max_tokens';"],
  ["task_max_tokens falscher JSON-Typ", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=jsonb_set(wert,'{blog-profile-extract}','\"2048\"'::jsonb) WHERE schluessel='task_max_tokens';"],
  ["task_max_reservierung_usd_cent falscher Wert", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=jsonb_set(wert,'{blog-profile-extract}','6'::jsonb) WHERE schluessel='task_max_reservierung_usd_cent';"],
  ["task_max_reservierung_usd_cent falscher JSON-Typ", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=jsonb_set(wert,'{blog-profile-extract}','\"5\"'::jsonb) WHERE schluessel='task_max_reservierung_usd_cent';"],
  ["fehlender Blog-Key", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert=wert-'blog-profile-extract' WHERE schluessel='task_modell';"],
  ["zusätzlicher Blog-Key auf fremder Zeile", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "UPDATE public.kd_ai_limits SET wert='{\"blog-profile-extract\":1}'::jsonb WHERE schluessel='scalar_decoy';"],
]);

const postwriteLedgerCases = Object.freeze([
  ["Zielzeile fehlt", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", `DELETE FROM supabase_migrations.schema_migrations WHERE version='${MIGRATION_VERSION}';`],
  ["falsche Version", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", `UPDATE supabase_migrations.schema_migrations SET version='20260817120001' WHERE version='${MIGRATION_VERSION}';`],
  ["falscher Name", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", `UPDATE supabase_migrations.schema_migrations SET name='wrong' WHERE version='${MIGRATION_VERSION}';`],
  ["statements NULL", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", `UPDATE supabase_migrations.schema_migrations SET statements=NULL WHERE version='${MIGRATION_VERSION}';`],
  ["statements nicht leer", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", `UPDATE supabase_migrations.schema_migrations SET statements=ARRAY['x']::text[] WHERE version='${MIGRATION_VERSION}';`],
  ["doppelte Zielversion", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", `INSERT INTO supabase_migrations.schema_migrations VALUES ('${MIGRATION_VERSION}','${MIGRATION_NAME}',ARRAY[]::text[]);`],
  ["zusätzliche Zielzeile", "CANONICAL_V2_TARGET_CONTRACT_DRIFT", "INSERT INTO supabase_migrations.schema_migrations VALUES ('20260817120001','unexpected_after_target',ARRAY[]::text[]);"],
]);

const repoRoot = resolve(new URL(".", import.meta.url).pathname);
let root;
let sourceCluster;
let restoreCluster;
let sourceKeeper;
let restoreKeeper;
const cleanupErrors = [];
let originalError;
let rolesRestoreEvidence;

function collectCleanupResults(label, results) {
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === "rejected") {
      cleanupErrors.push(new Error(`${label}[${index}]: ${result.reason?.message || result.reason}`));
    }
  }
}

runRolesRestoreDiagnosticUnitChecks();
try {
  root = await mkdtemp(ROOT_PREFIX);
  await chmod(root, 0o700);
  await validatePrivateDirectory(root);
  sourceCluster = clusterPaths(root, "source", SOURCE_PORT, BOOTSTRAP_ADMIN);
  restoreCluster = clusterPaths(root, "restore", RESTORE_PORT, BOOTSTRAP_ADMIN);

  for (const name of Object.keys(BINARIES)) {
    const version = await runBinary(name, ["--version"], { root });
    check(`${name} meldet 17.10 (Postgres.app)`,
      version.exitCode === 0 && version.stdout.toString("utf8").includes("17.10 (Postgres.app)"));
  }

  await prepareClusterDirectories(sourceCluster);
  await initCluster(sourceCluster);
  await startCluster(sourceCluster);
  const sourceSystemIdentifier = await readSystemIdentifier(sourceCluster);
  await createSourceFixture(sourceCluster);
  await verifyBootstrapAndMembership(sourceCluster);

  const mainSession = createCanonicalV2UntrustedSession();
  sourceKeeper = await startSnapshotKeeper(sourceCluster, DATABASE);
  const sourceSnapshotId = sourceKeeper.snapshotId;
  const dumps = await dumpSource(sourceCluster, sourceSnapshotId);
  const sourceTranscript = await capture(
    mainSession, sourceCluster, "22-canonical-detail", sourceSnapshotId,
  );
  await sourceKeeper.close();
  sourceKeeper = null;
  await stopCluster(sourceCluster);
  check("SOURCE ist vollständig gestoppt bevor RESTORE startet", sourceCluster.server.exitCode !== null);

  await prepareClusterDirectories(restoreCluster);
  await initCluster(restoreCluster);
  await startCluster(restoreCluster);
  const restoreSystemIdentifier = await readSystemIdentifier(restoreCluster);
  check("SOURCE und RESTORE sind physisch getrennte Cluster mit gleichem Bootstrapnamen",
    sourceSystemIdentifier !== restoreSystemIdentifier
      && sourceCluster.data !== restoreCluster.data
      && sourceCluster.socket !== restoreCluster.socket
      && sourceCluster.server.pid !== restoreCluster.server.pid
      && sourceCluster.admin === BOOTSTRAP_ADMIN
      && restoreCluster.admin === BOOTSTRAP_ADMIN);
  rolesRestoreEvidence = await restoreDumps(restoreCluster, dumps);
  await psql(restoreCluster, DATABASE, "SELECT txid_current();");
  restoreKeeper = await startSnapshotKeeper(restoreCluster, DATABASE);
  const restoreSnapshotId = restoreKeeper.snapshotId;
  check("SOURCE- und RESTORE-Snapshot-IDs sind echt und verschieden",
    sourceSnapshotId !== restoreSnapshotId);
  const restoreTranscript = await capture(
    mainSession, restoreCluster, "23-canonical-detail", restoreSnapshotId,
  );
  await restoreKeeper.close();
  restoreKeeper = null;
  const baselineSummary = mainSession.compareBaseline(sourceTranscript, restoreTranscript);
  check("echter Dump/Restore ist Canonical-v2-semantisch gleich und untrusted",
    baselineSummary.kind === "canonical-v2-untrusted-baseline-summary"
      && baselineSummary.trusted === false);

  for (const [label, expectedReasonCode, mutation, cleanup] of categoryMutationCases) {
    await expectRealMutationRed(
      restoreCluster, dumps.database, label, expectedReasonCode, mutation, cleanup,
    );
  }
  for (const [label, expectedReasonCode, mutation] of prewriteTargetCases) {
    await expectRealMutationRed(
      restoreCluster, dumps.database, label, expectedReasonCode, mutation,
    );
  }
  for (const [label, expectedReasonCode, mutation] of [
    ...postwriteTargetCases,
    ...postwriteLedgerCases,
  ]) {
    await expectRealPostwriteMutationRed(
      restoreCluster, dumps.database, repoRoot, label, expectedReasonCode, mutation,
    );
  }
  await resetDatabase(restoreCluster, dumps.database);

  const sharedDriftSession = createCanonicalV2UntrustedSession();
  const driftPre22Keeper = await startSnapshotKeeper(restoreCluster, DATABASE);
  const driftPre22 = await capture(
    sharedDriftSession, restoreCluster, "22-canonical-detail", driftPre22Keeper.snapshotId,
  );
  await driftPre22Keeper.close();
  const driftPre23Keeper = await startSnapshotKeeper(restoreCluster, DATABASE);
  const driftPre23 = await capture(
    sharedDriftSession, restoreCluster, "23-canonical-detail", driftPre23Keeper.snapshotId,
  );
  await driftPre23Keeper.close();
  sharedDriftSession.compareBaseline(driftPre22, driftPre23);

  await applyCommittedMigration(restoreCluster, repoRoot);
  const post42Keeper = await startSnapshotKeeper(restoreCluster, DATABASE);
  const post42 = await capture(
    mainSession, restoreCluster, "42-db-postflight", post42Keeper.snapshotId,
  );
  await post42Keeper.close();
  const post90Keeper = await startSnapshotKeeper(restoreCluster, DATABASE);
  const post90 = await capture(
    mainSession, restoreCluster, "90-remote-delta", post90Keeper.snapshotId,
  );
  await post90Keeper.close();
  const postSummary = mainSession.comparePostwrite(post42, post90);
  check("42/90 beweisen exakten Postwrite gegen echte Prebaseline und bleiben untrusted",
    postSummary.kind === "canonical-v2-untrusted-postwrite-summary"
      && postSummary.trusted === false);

  await psql(restoreCluster, DATABASE,
    "UPDATE public.kd_ai_limits SET flags=flags||'{\"foreign_drift\":true}'::jsonb WHERE schluessel='scalar_decoy';");
  const drift42Keeper = await startSnapshotKeeper(restoreCluster, DATABASE);
  const drift42 = await capture(
    sharedDriftSession, restoreCluster, "42-db-postflight", drift42Keeper.snapshotId,
  );
  await drift42Keeper.close();
  const drift90Keeper = await startSnapshotKeeper(restoreCluster, DATABASE);
  const drift90 = await capture(
    sharedDriftSession, restoreCluster, "90-remote-delta", drift90Keeper.snapshotId,
  );
  await drift90Keeper.close();
  await expectExactStopReason(
    "identisch manipulierte echte 42/90 bleiben gegen Prebaseline rot",
    "CANONICAL_V2_PREWRITE_BASELINE_DRIFT",
    async () => {
    sharedDriftSession.comparePostwrite(drift42, drift90);
    },
  );
} catch (error) {
  originalError = error;
} finally {
  const keepers = [sourceKeeper, restoreKeeper].filter(Boolean);
  collectCleanupResults("keeper", await Promise.allSettled(
    keepers.map((keeper) => keeper.close()),
  ));

  const clusters = [sourceCluster, restoreCluster].filter(Boolean);
  collectCleanupResults("cluster", await Promise.allSettled(
    clusters.map((cluster) => stopCluster(cluster, {
      forcePgCtlFailure: cluster === restoreCluster && originalError === undefined,
    })),
  ));

  const remainingChildren = [...activeChildren];
  collectCleanupResults("child", await Promise.allSettled(
    remainingChildren.map((child, index) => awaitChildClose(
      child, `held child ${index}`, { sendTerm: true },
    )),
  ));
  if (activeChildren.size !== 0) {
    cleanupErrors.push(new Error(`held child handles remained: ${activeChildren.size}`));
  }

  if (root) {
    try {
      await validatePrivateDirectory(root);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await rm(root, { recursive: true, force: false });
    } catch (error) {
      cleanupErrors.push(error);
    }
    const cleanupPaths = [
      [root, "task temp root"],
      ...clusters.flatMap((cluster) => [
        [cluster.base, `${cluster.name} cluster temp`],
        [cluster.data, `${cluster.name} data temp`],
        [join(cluster.data, "postmaster.pid"), `${cluster.name} postmaster.pid`],
        [cluster.socket, `${cluster.name} socket temp`],
        [join(cluster.socket, `.s.PGSQL.${cluster.port}`), `${cluster.name} socket`],
        [join(cluster.socket, `.s.PGSQL.${cluster.port}.lock`), `${cluster.name} socket lock`],
      ]),
    ];
    const pathResults = await Promise.allSettled(
      cleanupPaths.map(([path, label]) => requirePathAbsent(path, label)),
    );
    collectCleanupResults("path", pathResults);
    if (pathResults.every((result) => result.status === "fulfilled")) {
      check("taskeigener Tempbaum wurde vollständig entfernt", true);
    }
  }
}

if (originalError || cleanupErrors.length !== 0) {
  const parts = [];
  if (originalError) parts.push(`original=${originalError.message}`);
  for (const error of cleanupErrors) parts.push(`cleanup=${error.message}`);
  throw new Error(parts.join(" | "));
}

console.log(`e17b_canonical_pg17_integration_test: ${passed} Checks bestanden; Rollenrestore 42710/CreateRole user.c:${rolesRestoreEvidence.locationLine}, ${rolesRestoreEvidence.stderrBytes} stderr-Bytes; Wave-A-Summary bleibt trusted:false.`);
