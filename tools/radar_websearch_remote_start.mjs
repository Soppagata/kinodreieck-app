/* Radar-Websearch Paket B: lokaler, effektfreier Startzaun.
   ========================================================================
   Dieses Modul fuehrt selbst weder Keychain-, Netzwerk-, Supabase-, DB- noch
   Provideroperationen aus. Es bindet die Release-Closure an die beiden
   Paket-Commits, kapselt bekannte CLI-Schreibpfade unter /private/tmp und
   ordnet spaeter injizierte Effekte strikt seriell. Ein Lauf ist one-shot.
   ======================================================================== */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { delimiter, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

export const RADAR_PACKAGE_A_COMMIT = "b6b2dacf76139d778c8306a8ac954d93bd8caf22";
export const RADAR_PACKAGE_B_COMMIT = "6e14a7b72a73b7af6b9bdb411647ce899aadea6e";
export const ENTDECKEN_WEEKLY_COMMIT = "47d7ea995375cd7437ca3b858adf9b784156c692";
export const RADAR_TITLE_GROUP_V6_COMMIT = "12bbe874fdfbc99ff3b577c09f5a95670f2950e3";

export const SUPABASE_INFRA_KEYCHAIN = Object.freeze({
  service: "at.kinodreieck.codex.supabase.bscjgwcntapobyxsiyce",
  accounts: Object.freeze(["SUPABASE_ACCESS_TOKEN", "DB_POSTGRES_PASSWORD"]),
});
export const ANTHROPIC_PROVIDER_KEYCHAIN = Object.freeze({
  service: "at.kinodreieck.codex.provider.anthropic",
  account: "ANTHROPIC_API_KEY",
});

const DATEI = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(DATEI), "..");
const FUNCTION_ROOT = "supabase/functions/radar-websearch-task";
const FUNCTION_ENTRY = `${FUNCTION_ROOT}/index.ts`;
const ENTDECKEN_FUNCTION_ROOT = "supabase/functions/entdecken-daily-task";
const ENTDECKEN_FUNCTION_ENTRY = `${ENTDECKEN_FUNCTION_ROOT}/index.ts`;
const TEMP_PREFIX = "/private/tmp/kinodreieck-radar-b-local-";
const EXPECTED_SUPABASE_VERSION = "2.109.1";
const NODE_RUNTIME_DIRECTORY = resolve(dirname(process.execPath));

const FIXED_RELEASE_PATHS = Object.freeze([
  "package.json",
  "supabase/config.toml",
  "supabase/migrations/20260817180000_radar_websearch_mvp_package_a.sql",
  "supabase/migrations/20260817190000_radar_websearch_mvp_package_b.sql",
  "supabase/migrations/20260822190000_entdecken_weekly_feed.sql",
  "supabase/migrations/20260822200000_radar_title_group_discovery_v6.sql",
  FUNCTION_ENTRY,
  `${FUNCTION_ROOT}/mockAdapter.js`,
  `${ENTDECKEN_FUNCTION_ROOT}/anthropicAdapter.js`,
  `${ENTDECKEN_FUNCTION_ROOT}/contract.js`,
  ENTDECKEN_FUNCTION_ENTRY,
  `${ENTDECKEN_FUNCTION_ROOT}/runner.js`,
  "tools/keychain_runner.mjs",
  "tools/radar_websearch_live.mjs",
]);

/* Lokaler Rollbackzaun fuer die bereits deployte v5-Baseline. Der historische
   Paket-B-Runner darf nur noch starten, wenn Function und drei angewandte
   Migrationen exakt der belegten Serverprovenienz entsprechen. Eine spaetere
   v6 braucht deshalb einen ausdruecklich aktualisierten Vertrag. */
export const RADAR_DEPLOYED_V5_BUNDLE_SHA256 = "52f2e82d9909b36bd209b73e52eeb0d112ee4473ace30cb632913742e10d2bad";
export const RADAR_DEPLOYED_V5_CLOSURE_SHA256 = "841e395b80dd2580d21a10620b55da1f139908c767154ffaeb587404beb09e6f";
export const RADAR_DEPLOYED_V5_FILES = Object.freeze([
  Object.freeze({ path: `${FUNCTION_ROOT}/anthropicAdapter.js`, sha256: "abd64082191434eb91892303ca655926fc75916ddf4148ba2629082c1c52efcc" }),
  Object.freeze({ path: `${FUNCTION_ROOT}/contract.js`, sha256: "248da1034f320b6bed48e98f02c3e42b4a2899473e0a4232ef46b02bdfe5f2c8" }),
  Object.freeze({ path: `${FUNCTION_ROOT}/index.ts`, sha256: "6a79fab4386a6c634530fb7db936b70995786be02c9cab2c47ab3e2401c065ac" }),
  Object.freeze({ path: `${FUNCTION_ROOT}/mockAdapter.js`, sha256: "a7e02f1b98f7aa48ae0b0838a474071409cce9613c8758562a968aa29555a9c3" }),
  Object.freeze({ path: `${FUNCTION_ROOT}/runner.js`, sha256: "7e51264964f11a697178ad0d6fd319709132611764f3cfaafa636d5de44eab03" }),
]);
export const RADAR_DEPLOYED_V5_MIGRATIONS = Object.freeze([
  Object.freeze({ path: "supabase/migrations/20260819220000_radar_person_server_candidate.sql", sha256: "d23f80f7073deb1197fdcb0b5a73f4abd1ad002e0b3bded6ee08c691d937f658" }),
  Object.freeze({ path: "supabase/migrations/20260821120000_radar_person_catalog_repair.sql", sha256: "8d2624a4ee34dae6b8080ba1bdb74f402c8144328815d21c99762cc22c6af765" }),
  Object.freeze({ path: "supabase/migrations/20260821130000_radar_title_group.sql", sha256: "6e1b7b8a638536f223d82fd62220b80e130da0ba20e855336145d5afc31b228c" }),
]);

/* Exakter additive Releasevertrag fuer das kontrollierte v6-Fenster. Die
   historische v5-Provenienz bleibt oben als Rollbackbeleg erhalten; ein neuer
   Deploy darf jedoch nur noch aus diesen v6-/Wochenfeed-Bytes entstehen. */
export const RADAR_V6_SOURCE_BUNDLE_SHA256 = "6a04da389afb034e1c3ff2fb08671715e5f32a87078f1b71d5df63fe8c9e87c3";
export const RADAR_V6_FILES = Object.freeze([
  Object.freeze({ path: `${FUNCTION_ROOT}/anthropicAdapter.js`, sha256: "00789cd40a718afc4131e58dfc62bd8b625d41e04d45e1eabc3dbdf8903bf392" }),
  Object.freeze({ path: `${FUNCTION_ROOT}/contract.js`, sha256: "96b12e18243840f5e26372480256d5e25f932761f50acbfeba2bf62517bed379" }),
  Object.freeze({ path: `${FUNCTION_ROOT}/index.ts`, sha256: "d62a43e07d4560359d0a2e952b1509fc597e4b90dcf6b30f0d16a347f1669abf" }),
  Object.freeze({ path: `${FUNCTION_ROOT}/mockAdapter.js`, sha256: "1c7038b67870210befb9aa7ed77c1c7a0a887c973947a2016c3085fdfbe76d2d" }),
  Object.freeze({ path: `${FUNCTION_ROOT}/runner.js`, sha256: "2ae570110b61554450eb3542bfd7ed07445535650624b19cd97faa833c7e0e37" }),
]);
export const ENTDECKEN_WEEKLY_SOURCE_BUNDLE_SHA256 = "de854d0833a99c4ca8a0229820d05ef111aeab1b6c846417e2996e677a2fec36";
export const ENTDECKEN_WEEKLY_FILES = Object.freeze([
  Object.freeze({ path: `${ENTDECKEN_FUNCTION_ROOT}/anthropicAdapter.js`, sha256: "c0b9f9f211317bf1a080872405c1b275ae1993bd34212d96ef45266ad3810ba7" }),
  Object.freeze({ path: `${ENTDECKEN_FUNCTION_ROOT}/contract.js`, sha256: "a7ab3e41cd9ee9a7bdb4ad18a30e7e10defd314c8125a93463e4c208a6022d95" }),
  Object.freeze({ path: `${ENTDECKEN_FUNCTION_ROOT}/index.ts`, sha256: "da42fa14920dddefdfc76671b94a3d62d7d5a1e5ba954fde9d0d6a3f68c8f7ce" }),
  Object.freeze({ path: `${ENTDECKEN_FUNCTION_ROOT}/runner.js`, sha256: "0bad6951dc3f9ddf3aa36d6d7db7a220c2f44e6660c35b123c78911aa507cf40" }),
]);
export const RADAR_ENTDECKEN_V6_RELEASE_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "20260822190000",
    name: "entdecken_weekly_feed",
    path: "supabase/migrations/20260822190000_entdecken_weekly_feed.sql",
    sha256: "1da2ef5f676455e2924f36adc97269d82aac4f86829ceab7927dbfc76ac26e0d",
  }),
  Object.freeze({
    version: "20260822200000",
    name: "radar_title_group_discovery_v6",
    path: "supabase/migrations/20260822200000_radar_title_group_discovery_v6.sql",
    sha256: "303d64f1073177d7b1b7ae374dafb3f86468d83d73413039f2295689104aa1b4",
  }),
]);
export const RADAR_ENTDECKEN_V6_RELEASE_SHA256 = "65acd51a584c94ad255235902a46e561fcf05c42aef1dab796a91e3cd758f79d";

const REQUIRED_PROVENANCE = Object.freeze({
  [RADAR_PACKAGE_A_COMMIT]: Object.freeze([
    "supabase/migrations/20260817180000_radar_websearch_mvp_package_a.sql",
    `${FUNCTION_ROOT}/contract.js`,
    FUNCTION_ENTRY,
    `${FUNCTION_ROOT}/runner.js`,
  ]),
  [RADAR_PACKAGE_B_COMMIT]: Object.freeze([
    "package.json",
    "supabase/config.toml",
    "supabase/migrations/20260817190000_radar_websearch_mvp_package_b.sql",
    `${FUNCTION_ROOT}/anthropicAdapter.js`,
    FUNCTION_ENTRY,
    "tools/keychain_runner.mjs",
    "tools/radar_websearch_live.mjs",
  ]),
  [ENTDECKEN_WEEKLY_COMMIT]: Object.freeze([
    "supabase/migrations/20260822190000_entdecken_weekly_feed.sql",
    `${ENTDECKEN_FUNCTION_ROOT}/anthropicAdapter.js`,
    `${ENTDECKEN_FUNCTION_ROOT}/contract.js`,
    ENTDECKEN_FUNCTION_ENTRY,
    `${ENTDECKEN_FUNCTION_ROOT}/runner.js`,
  ]),
  [RADAR_TITLE_GROUP_V6_COMMIT]: Object.freeze([
    "supabase/migrations/20260822200000_radar_title_group_discovery_v6.sql",
    `${FUNCTION_ROOT}/anthropicAdapter.js`,
    `${FUNCTION_ROOT}/contract.js`,
    FUNCTION_ENTRY,
    `${FUNCTION_ROOT}/mockAdapter.js`,
    `${FUNCTION_ROOT}/runner.js`,
  ]),
});

const CLI_WRITE_ENV_NAMES = Object.freeze([
  "SUPABASE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "TMPDIR",
]);
const CLI_ENV_NAMES = Object.freeze([
  "DO_NOT_TRACK",
  "LANG",
  "LC_ALL",
  "NO_COLOR",
  "PATH",
  "SUPABASE_HOME",
  "SUPABASE_NO_KEYRING",
  "SUPABASE_TELEMETRY_DISABLED",
  "TMPDIR",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
]);
const FORBIDDEN_HOME_NAMES = Object.freeze(["HOME", "home", "CODEX_HOME"]);

export class RadarRemoteStartStop extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RadarRemoteStartStop";
    this.code = code;
  }
}

function stop(code, message) {
  throw new RadarRemoteStartStop(code, message);
}

export function validateRadarLedgerBaseline(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)
      || !isDeepStrictEqual(actual, expected)) {
    stop(
      "LEDGER_BASELINE_DRIFT",
      "Remote-Ledger weicht von der semantisch exakten Baseline ab.",
    );
  }
  return true;
}

function normalizeRepoPath(value) {
  if (typeof value !== "string" || value === "" || value.includes("\\")
      || value.startsWith("/") || value.split("/").includes("..")) {
    stop("CLOSURE_PATH_INVALID", "Release-Closure enthaelt einen ungueltigen Pfad.");
  }
  const normalized = posix.normalize(value);
  if (normalized !== value || normalized.startsWith("../")) {
    stop("CLOSURE_PATH_INVALID", "Release-Closure enthaelt einen ungueltigen Pfad.");
  }
  return normalized;
}

function absoluteRepoPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  const absolute = resolve(REPO_ROOT, ...normalized.split("/"));
  const rel = relative(REPO_ROOT, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    stop("CLOSURE_PATH_ESCAPE", "Release-Closure verlaesst den Worktree.");
  }
  return absolute;
}

function gitResult(args, { spawn = spawnSync, allowExitOne = false } = {}) {
  const result = spawn("/usr/bin/git", args, {
    cwd: REPO_ROOT,
    env: { LANG: "C", LC_ALL: "C", NO_COLOR: "1", PATH: "/usr/bin:/bin" },
    encoding: null,
    maxBuffer: 2 * 1024 * 1024,
    timeout: 10_000,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result?.error || result?.signal
      || (result?.status !== 0 && !(allowExitOne && result?.status === 1))) {
    stop("LOCAL_GIT_FAILED", "Lokale Git-Provenienz konnte nicht fail-closed belegt werden.");
  }
  return result;
}

function changedPathsAtCommit(commit, options = {}) {
  const result = gitResult([
    "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "--diff-filter=AM", commit,
  ], options);
  const text = Buffer.from(result.stdout || []).toString("utf8");
  if (text.includes("\0")) stop("COMMIT_PATH_LIST_INVALID", "Commitpfade sind nicht textuell lesbar.");
  return Object.freeze(text.split(/\r?\n/).filter(Boolean).map(normalizeRepoPath));
}

function requireAncestor(older, newer, options = {}) {
  const result = gitResult(["merge-base", "--is-ancestor", older, newer], {
    ...options,
    allowExitOne: true,
  });
  if (result.status !== 0) {
    stop("PACKAGE_COMMIT_NOT_ANCESTOR", "Paket-Commit ist nicht Teil des aktuellen Arbeitsstands.");
  }
}

function requireClosureClean(paths, options = {}) {
  const result = gitResult([
    "status", "--porcelain=v1", "--untracked-files=no", "--", ...paths,
  ], options);
  if (Buffer.from(result.stdout || []).length !== 0) {
    stop("RELEASE_CLOSURE_DIRTY", "Mindestens eine Release-Datei ist uncommitted veraendert.");
  }
}

function readRegularFile(repoPath, { readFile = readFileSync, stat = lstatSync } = {}) {
  const absolute = absoluteRepoPath(repoPath);
  let info;
  let bytes;
  try {
    info = stat(absolute);
    bytes = readFile(absolute);
  } catch {
    stop("CLOSURE_FILE_MISSING", "Mindestens eine Release-Datei fehlt.");
  }
  if (!info?.isFile?.() || info?.isSymbolicLink?.()) {
    stop("CLOSURE_FILE_NOT_REGULAR", "Release-Closure akzeptiert nur regulaere Dateien.");
  }
  return Buffer.from(bytes);
}

export function requireRadarDeployedV5Provenance(options = {}) {
  const files = RADAR_DEPLOYED_V5_FILES.map(({ path, sha256 }) => {
    const bytes = readRegularFile(path, options);
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== sha256) {
      stop("RADAR_V5_PROVENANCE_DRIFT", "Lokale Radar-v5-Quelle weicht von der deployten Provenienz ab.");
    }
    return { path, sha256: actual };
  });
  const closure = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  if (closure !== RADAR_DEPLOYED_V5_CLOSURE_SHA256) {
    stop("RADAR_V5_PROVENANCE_DRIFT", "Lokale Radar-v5-Closure weicht von der deployten Provenienz ab.");
  }
  for (const entry of RADAR_DEPLOYED_V5_MIGRATIONS) {
    const actual = createHash("sha256").update(readRegularFile(entry.path, options)).digest("hex");
    if (actual !== entry.sha256) {
      stop("RADAR_V5_PROVENANCE_DRIFT", "Lokale Radar-v5-Migration weicht von der angewandten Provenienz ab.");
    }
  }
  return Object.freeze({
    bundleSha256: RADAR_DEPLOYED_V5_BUNDLE_SHA256,
    closureSha256: closure,
    files: Object.freeze(files.map((entry) => Object.freeze(entry))),
  });
}

function requireExactFileRows(entries, expectedClosure, code, options = {}) {
  const files = entries.map(({ path, sha256 }) => {
    const actual = createHash("sha256").update(readRegularFile(path, options)).digest("hex");
    if (actual !== sha256) stop(code, "Lokale Releasequelle weicht vom exakten Bytevertrag ab.");
    return { path, sha256: actual };
  });
  const closureSha256 = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  if (closureSha256 !== expectedClosure) {
    stop(code, "Lokale Releaseclosure weicht vom exakten Bytevertrag ab.");
  }
  return Object.freeze(files.map((entry) => Object.freeze(entry)));
}

export function requireRadarEntdeckenV6ReleaseProvenance(options = {}) {
  const radarFiles = requireExactFileRows(
    RADAR_V6_FILES,
    RADAR_V6_SOURCE_BUNDLE_SHA256,
    "RADAR_V6_RELEASE_PROVENANCE_DRIFT",
    options,
  );
  const entdeckenFiles = requireExactFileRows(
    ENTDECKEN_WEEKLY_FILES,
    ENTDECKEN_WEEKLY_SOURCE_BUNDLE_SHA256,
    "ENTDECKEN_WEEKLY_RELEASE_PROVENANCE_DRIFT",
    options,
  );
  const migrations = RADAR_ENTDECKEN_V6_RELEASE_MIGRATIONS.map((entry) => {
    const actual = createHash("sha256").update(readRegularFile(entry.path, options)).digest("hex");
    if (actual !== entry.sha256) {
      stop("RADAR_V6_RELEASE_PROVENANCE_DRIFT", "Lokale Forward-Migration weicht vom exakten Bytevertrag ab.");
    }
    return Object.freeze({ ...entry, sha256: actual });
  });
  const rows = [
    { kind: "function", name: "radar-websearch-task", sha256: RADAR_V6_SOURCE_BUNDLE_SHA256 },
    { kind: "function", name: "entdecken-daily-task", sha256: ENTDECKEN_WEEKLY_SOURCE_BUNDLE_SHA256 },
    ...migrations.map(({ version, name, sha256 }) => ({ kind: "migration", name: `${version}_${name}`, sha256 })),
  ];
  const releaseSha256 = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  if (releaseSha256 !== RADAR_ENTDECKEN_V6_RELEASE_SHA256) {
    stop("RADAR_V6_RELEASE_PROVENANCE_DRIFT", "Lokaler v6-Releasevertrag driftet.");
  }
  return Object.freeze({
    releaseSha256,
    functions: Object.freeze({ radar: radarFiles, entdecken: entdeckenFiles }),
    migrations: Object.freeze(migrations),
  });
}

function localImports(repoPath, bytes) {
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    stop("FUNCTION_SOURCE_NOT_UTF8", "Function-Quelle ist nicht gueltiges UTF-8.");
  }
  const imports = [];
  const pattern = /\bfrom\s*["'](\.\.?\/[^"']+)["']/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const resolved = posix.normalize(posix.join(posix.dirname(repoPath), match[1]));
    if (!resolved.startsWith(`${FUNCTION_ROOT}/`) || resolved === FUNCTION_ROOT) {
      stop("FUNCTION_IMPORT_ESCAPE", "Function-Import verlaesst die autorisierte Closure.");
    }
    imports.push(normalizeRepoPath(resolved));
  }
  return imports;
}

function collectFunctionGraph(options = {}) {
  const pending = [FUNCTION_ENTRY];
  const visited = new Set();
  while (pending.length > 0) {
    const repoPath = pending.shift();
    if (visited.has(repoPath)) continue;
    const bytes = readRegularFile(repoPath, options);
    visited.add(repoPath);
    for (const imported of localImports(repoPath, bytes)) {
      if (!visited.has(imported)) pending.push(imported);
    }
  }
  return visited;
}

function framedHash(commits, files) {
  const hash = createHash("sha256");
  const update = (bytes) => {
    const payload = Buffer.from(bytes);
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(payload.length));
    hash.update(length);
    hash.update(payload);
  };
  update("radar-websearch-package-b-release-closure-v1");
  for (const commit of commits) update(commit);
  for (const file of files) {
    update(file.path);
    update(file.bytes);
  }
  return hash.digest("hex");
}

export function deriveRadarPackageBReleaseClosure(options = {}) {
  requireAncestor(RADAR_PACKAGE_A_COMMIT, RADAR_PACKAGE_B_COMMIT, options);
  requireAncestor(RADAR_PACKAGE_B_COMMIT, "HEAD", options);
  requireAncestor(ENTDECKEN_WEEKLY_COMMIT, "HEAD", options);
  requireAncestor(RADAR_TITLE_GROUP_V6_COMMIT, "HEAD", options);
  requireRadarEntdeckenV6ReleaseProvenance(options);

  const changedByCommit = new Map();
  const contractCommits = [
    RADAR_PACKAGE_A_COMMIT,
    RADAR_PACKAGE_B_COMMIT,
    ENTDECKEN_WEEKLY_COMMIT,
    RADAR_TITLE_GROUP_V6_COMMIT,
  ];
  for (const commit of contractCommits) {
    changedByCommit.set(commit, new Set(changedPathsAtCommit(commit, options)));
  }
  for (const [commit, paths] of Object.entries(REQUIRED_PROVENANCE)) {
    const changed = changedByCommit.get(commit);
    if (!changed || paths.some((path) => !changed.has(path))) {
      stop("COMMITTED_CONTRACT_DRIFT", "Paket-Commit traegt nicht mehr die erwartete Radar-Provenienz.");
    }
  }

  const closure = new Set(FIXED_RELEASE_PATHS);
  for (const path of collectFunctionGraph(options)) closure.add(path);
  const union = new Set([...changedByCommit.values()].flatMap((set) => [...set]));
  const paths = [...closure].sort();
  if (paths.some((path) => !union.has(path))) {
    stop("UNCOMMITTED_CLOSURE_PATH", "Release-Closure enthaelt eine nicht paketgebundene Datei.");
  }
  if (paths.includes("tools/radar_websearch_contract.mjs")) {
    stop("NONEXISTENT_LEGACY_CLOSURE_PATH", "Veralteter, nicht vorhandener Closurepfad ist verboten.");
  }

  const files = paths.map((path) => {
    const bytes = readRegularFile(path, options);
    return Object.freeze({
      path,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  });
  requireClosureClean(paths, options);
  return Object.freeze({
    contractCommits: Object.freeze(contractCommits),
    paths: Object.freeze([...paths]),
    files: Object.freeze(files.map(({ path, sha256 }) => Object.freeze({ path, sha256 }))),
    sha256: framedHash(contractCommits, files),
  });
}

function isWithin(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function validateRadarCliWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
    stop("CLI_WORKSPACE_INVALID", "CLI-Arbeitsraum fehlt.");
  }
  const runDir = resolve(String(workspace.runDir || ""));
  if (!runDir.startsWith(TEMP_PREFIX) || runDir === TEMP_PREFIX.slice(0, -1)) {
    stop("CLI_WORKSPACE_OUTSIDE_TMP", "CLI-Arbeitsraum liegt nicht im Radar-Tempzaun.");
  }
  const expected = {
    supabaseHome: join(runDir, "supabase-home"),
    xdgConfig: join(runDir, "xdg-config"),
    xdgCache: join(runDir, "xdg-cache"),
    tmp: join(runDir, "tmp"),
  };
  for (const [name, path] of Object.entries(expected)) {
    if (resolve(String(workspace[name] || "")) !== path || !isWithin(runDir, path)) {
      stop("CLI_WRITE_PATH_OUTSIDE_TMP", "CLI-Schreibpfad verlaesst den Radar-Tempzaun.");
    }
  }
  return Object.freeze({ runDir, ...expected });
}

export function createRadarCliWorkspace({
  mkdtemp = mkdtempSync,
  mkdir = mkdirSync,
  chmod = chmodSync,
  realpath = realpathSync,
  stat = lstatSync,
} = {}) {
  const runDir = mkdtemp(TEMP_PREFIX);
  chmod(runDir, 0o700);
  const workspace = validateRadarCliWorkspace({
    runDir,
    supabaseHome: join(runDir, "supabase-home"),
    xdgConfig: join(runDir, "xdg-config"),
    xdgCache: join(runDir, "xdg-cache"),
    tmp: join(runDir, "tmp"),
  });
  if (resolve(realpath(runDir)) !== workspace.runDir) {
    stop("CLI_WORKSPACE_SYMLINK", "CLI-Arbeitsraum darf kein umgeleiteter Pfad sein.");
  }
  const info = stat(runDir);
  if (!info?.isDirectory?.() || info?.isSymbolicLink?.()
      || (typeof process.getuid === "function" && info.uid !== process.getuid())) {
    stop("CLI_WORKSPACE_OWNERSHIP", "CLI-Arbeitsraum ist nicht exklusiv kontrolliert.");
  }
  for (const path of [
    workspace.supabaseHome,
    workspace.xdgConfig,
    workspace.xdgCache,
    workspace.tmp,
  ]) {
    mkdir(path, { recursive: false, mode: 0o700 });
  }
  return workspace;
}

export function cleanupRadarCliWorkspace(workspace, { remove = rmSync } = {}) {
  const valid = validateRadarCliWorkspace(workspace);
  remove(valid.runDir, { recursive: true, force: false });
}

export function buildRadarSupabaseCliEnvironment(workspace, { cliDirectory } = {}) {
  const valid = validateRadarCliWorkspace(workspace);
  const rawCliDir = String(cliDirectory || "");
  if (!rawCliDir || !isAbsolute(rawCliDir)) {
    stop("CLI_DIRECTORY_INVALID", "Supabase-CLI-Verzeichnis ist nicht eng gebunden.");
  }
  const cliDir = resolve(rawCliDir);
  if (cliDir === "/" || cliDir.includes(delimiter)
      || NODE_RUNTIME_DIRECTORY === "/" || NODE_RUNTIME_DIRECTORY.includes(delimiter)) {
    stop("CLI_DIRECTORY_INVALID", "Supabase-CLI-Verzeichnis ist nicht eng gebunden.");
  }
  const env = Object.freeze({
    DO_NOT_TRACK: "1",
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
    PATH: [cliDir, NODE_RUNTIME_DIRECTORY].join(delimiter),
    SUPABASE_HOME: valid.supabaseHome,
    SUPABASE_NO_KEYRING: "1",
    SUPABASE_TELEMETRY_DISABLED: "1",
    TMPDIR: valid.tmp,
    XDG_CACHE_HOME: valid.xdgCache,
    XDG_CONFIG_HOME: valid.xdgConfig,
  });
  validateRadarSupabaseCliEnvironment(env, valid);
  return env;
}

export function validateRadarSupabaseCliEnvironment(env, workspace) {
  const valid = validateRadarCliWorkspace(workspace);
  if (!env || typeof env !== "object" || Array.isArray(env)
      || JSON.stringify(Object.keys(env).sort()) !== JSON.stringify([...CLI_ENV_NAMES].sort())) {
    stop("CLI_ENV_ALLOWLIST_VIOLATION", "CLI-Umgebung ist nicht exakt allowlistet.");
  }
  if (FORBIDDEN_HOME_NAMES.some((name) => Object.hasOwn(env, name))) {
    stop("CLI_HOME_OVERRIDE_FORBIDDEN", "HOME-, home- und CODEX_HOME-Umlenkung ist verboten.");
  }
  if (env.SUPABASE_TELEMETRY_DISABLED !== "1" || env.DO_NOT_TRACK !== "1"
      || env.SUPABASE_NO_KEYRING !== "1") {
    stop("CLI_TELEMETRY_GUARD_MISSING", "CLI-Telemetrie-/Keyring-Zaun fehlt.");
  }
  const readPath = String(env.PATH || "").split(delimiter);
  if (readPath.length !== 2
      || readPath.some((path) => !isAbsolute(path) || resolve(path) !== path || path === "/")
      || readPath[1] !== NODE_RUNTIME_DIRECTORY) {
    stop(
      "CLI_RUNTIME_PATH_INVALID",
      "CLI-Lesepfad muss genau CLI-Verzeichnis und laufende Node-Runtime enthalten.",
    );
  }
  const expected = {
    SUPABASE_HOME: valid.supabaseHome,
    XDG_CONFIG_HOME: valid.xdgConfig,
    XDG_CACHE_HOME: valid.xdgCache,
    TMPDIR: valid.tmp,
  };
  for (const name of CLI_WRITE_ENV_NAMES) {
    if (resolve(String(env[name] || "")) !== expected[name]
        || !isWithin(valid.runDir, expected[name])) {
      stop("CLI_WRITE_PATH_OUTSIDE_TMP", "CLI-Schreibpfad verlaesst den Radar-Tempzaun.");
    }
  }
  return true;
}

export function buildRadarSupabaseVersionBlueprint({ workspace, executable } = {}) {
  const valid = validateRadarCliWorkspace(workspace);
  const rawCli = String(executable || "");
  if (!rawCli || !isAbsolute(rawCli)) {
    stop("CLI_EXECUTABLE_INVALID", "Supabase-CLI-Binary ist nicht direkt gebunden.");
  }
  const cli = resolve(rawCli);
  if (cli === "/") stop("CLI_EXECUTABLE_INVALID", "Supabase-CLI-Binary ist nicht direkt gebunden.");
  const env = buildRadarSupabaseCliEnvironment(valid, { cliDirectory: dirname(cli) });
  return Object.freeze({
    executable: cli,
    argv: Object.freeze(["--version"]),
    cwd: REPO_ROOT,
    env,
    shell: false,
    attempts: 1,
    timeoutMs: 10_000,
    maxBuffer: 64 * 1024,
  });
}

export function runRadarSupabaseVersionProbe(blueprint, { spawn = spawnSync } = {}) {
  if (!blueprint || blueprint.attempts !== 1 || blueprint.shell !== false
      || JSON.stringify(blueprint.argv) !== JSON.stringify(["--version"])
      || resolve(String(blueprint.cwd || "")) !== REPO_ROOT
      || !blueprint.env || typeof blueprint.env !== "object") {
    stop("CLI_VERSION_BLUEPRINT_INVALID", "Lokale CLI-Probe ist nicht exakt one-shot gebunden.");
  }
  const workspace = {
    runDir: dirname(blueprint.env.SUPABASE_HOME),
    supabaseHome: blueprint.env.SUPABASE_HOME,
    xdgConfig: blueprint.env.XDG_CONFIG_HOME,
    xdgCache: blueprint.env.XDG_CACHE_HOME,
    tmp: blueprint.env.TMPDIR,
  };
  validateRadarSupabaseCliEnvironment(blueprint.env, workspace);
  if (dirname(resolve(blueprint.executable)) !== blueprint.env.PATH.split(delimiter)[0]) {
    stop("CLI_EXECUTABLE_PATH_MISMATCH", "CLI-Executable liegt nicht im engen CLI-Lesepfad.");
  }
  const result = spawn(blueprint.executable, blueprint.argv, {
    cwd: blueprint.cwd,
    env: blueprint.env,
    encoding: null,
    maxBuffer: blueprint.maxBuffer,
    timeout: blueprint.timeoutMs,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result?.error || result?.signal || result?.status !== 0) {
    stop("LOCAL_CLI_VERSION_FAILED", "Lokale Supabase-Versionsprobe schlug fail-closed fehl.");
  }
  const version = Buffer.from(result.stdout || []).toString("utf8").trim();
  if (version !== EXPECTED_SUPABASE_VERSION) {
    stop("SUPABASE_VERSION_MISMATCH", "Lokale Supabase-CLI-Version driftet.");
  }
  return version;
}

function parseRemoteAnthropicSecretState(payload) {
  if (!payload || Object.getPrototypeOf(payload) !== Object.prototype
      || JSON.stringify(Object.keys(payload).sort()) !== JSON.stringify(["anthropicApiKey"])) {
    stop("REMOTE_SECRET_STATE_INVALID", "Remote-Secretstatus ist nicht exakt allowlistet.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(payload, "anthropicApiKey");
  if (!descriptor || !("value" in descriptor)
      || !["PRESENT", "MISSING"].includes(descriptor.value)) {
    stop("REMOTE_SECRET_STATE_INVALID", "Remote-Secretstatus ist nicht exakt allowlistet.");
  }
  return descriptor.value;
}

function requireEffect(name, value) {
  if (typeof value !== "function") {
    stop("START_EFFECT_MISSING", `Startfolge hat keinen injizierten Effekt fuer ${name}.`);
  }
  return value;
}

export function createRadarRemotePreflightOnce({
  localClosureGate,
  localWorkspaceGate,
  localCliGate,
  readCredential,
  remoteRead,
  writeMissingProviderSecret,
} = {}) {
  const closureGate = requireEffect("local-closure", localClosureGate);
  const workspaceGate = requireEffect("local-workspace", localWorkspaceGate);
  const cliGate = requireEffect("local-cli", localCliGate);
  const credentialReader = requireEffect("credential-read", readCredential);
  const remoteReader = requireEffect("remote-read", remoteRead);
  const providerWriter = requireEffect("provider-secret-write", writeMissingProviderSecret);
  let used = false;

  return async function runOnce() {
    if (used) {
      stop("AUTONOMIE_STOPP_NO_RETRY", "Dieser Preflight-Start wurde bereits verbraucht.");
    }
    used = true;
    const trace = [];
    let phase = "local-closure";
    try {
      const closure = await closureGate();
      trace.push("local-closure");
      phase = "local-workspace";
      const workspace = await workspaceGate({ closure });
      trace.push("local-workspace");
      phase = "local-cli";
      await cliGate({ closure, workspace });
      trace.push("local-cli");

      phase = "supabase-credentials";
      const accessToken = await credentialReader({
        service: SUPABASE_INFRA_KEYCHAIN.service,
        account: SUPABASE_INFRA_KEYCHAIN.accounts[0],
      });
      const dbPassword = await credentialReader({
        service: SUPABASE_INFRA_KEYCHAIN.service,
        account: SUPABASE_INFRA_KEYCHAIN.accounts[1],
      });
      trace.push("supabase-credentials");

      phase = "remote-read";
      const remoteState = await remoteReader({ accessToken, dbPassword, closure, workspace });
      const anthropicState = parseRemoteAnthropicSecretState(remoteState);
      trace.push("remote-read");

      let providerSecretAction = "untouched";
      if (anthropicState === "MISSING") {
        phase = "anthropic-credential";
        const anthropicApiKey = await credentialReader({
          service: ANTHROPIC_PROVIDER_KEYCHAIN.service,
          account: ANTHROPIC_PROVIDER_KEYCHAIN.account,
        });
        trace.push("anthropic-credential");
        phase = "anthropic-secret-write";
        await providerWriter({ anthropicApiKey });
        trace.push("anthropic-secret-write");
        providerSecretAction = "written-after-remote-missing";
      }
      return Object.freeze({
        status: "REMOTE_READ_COMPLETE",
        anthropicState,
        providerSecretAction,
        trace: Object.freeze([...trace]),
      });
    } catch (error) {
      if (error instanceof RadarRemoteStartStop) throw error;
      stop(`STOP_${phase.toUpperCase().replaceAll("-", "_")}`,
        "Startfolge stoppte fail-closed; keine automatische Wiederholung.");
    }
  };
}
