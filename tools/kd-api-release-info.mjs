#!/usr/bin/env node
/* Rein lokaler, nicht geheimer Liefernachweis fuer die gezielt deploybare
   kd-api-Function. Das Werkzeug liest ausschliesslich den gebundenen Git-Commit. */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  localImportClosure,
  parseFunctionConfigBlob,
  sourceHash,
} from "./function-release-info.mjs";

export const KD_API_RELEASE_FORMAT = "kd-api-release-info-v1";
export const KD_API_FUNCTION_SLUG = "kd-api";
export const KD_API_CONTRACT_VERSION = "kd-api-v1";
export const KD_API_ENTRY = "supabase/functions/kd-api/index.ts";
export const KD_API_CONFIG = "supabase/config.toml";
const PROJECT_ID = "bscjgwcntapobyxsiyce";
const COMMIT = /^[a-f0-9]{40}$/;
const RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const MIGRATION_PATH = /^supabase\/migrations\/(\d{8,20}_[a-z0-9_]+)\.sql$/;

function toBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
}

function framedHash(domain, entries) {
  const hash = createHash("sha256");
  hash.update(`${domain}\0`, "utf8");
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const valueBytes = toBuffer(value);
    for (const bytes of [nameBytes, valueBytes]) {
      const length = Buffer.alloc(8);
      length.writeBigUInt64BE(BigInt(bytes.length));
      hash.update(length);
      hash.update(bytes);
    }
  }
  return hash.digest("hex");
}

function gitBytes(git, args) {
  const value = git(args, { encoding: null });
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
}

function gitText(git, args) {
  const value = git(args, { encoding: "utf8" });
  return (Buffer.isBuffer(value) ? value.toString("utf8") : String(value)).trim();
}

export function parseReleaseInfoArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--source-commit" || argv[2] !== "--release-id") {
    throw new Error("Aufruf: node tools/kd-api-release-info.mjs --source-commit <40hex> --release-id <id>");
  }
  const sourceCommit = argv[1];
  const releaseId = argv[3];
  if (!COMMIT.test(sourceCommit)) throw new Error("SOURCE_COMMIT_INVALID");
  if (!RELEASE_ID.test(releaseId)) throw new Error("RELEASE_ID_INVALID");
  return Object.freeze({ sourceCommit, releaseId });
}

export function kdApiReleaseInfo({
  sourceCommit,
  releaseId,
  git = (args, options) => execFileSync("git", args, options),
} = {}) {
  if (!COMMIT.test(sourceCommit || "")) throw new Error("SOURCE_COMMIT_INVALID");
  if (!RELEASE_ID.test(releaseId || "")) throw new Error("RELEASE_ID_INVALID");
  const head = gitText(git, ["rev-parse", "HEAD"]);
  if (head !== sourceCommit) throw new Error("SOURCE_COMMIT_NOT_HEAD");

  const blobs = new Map();
  const readBlob = (path) => {
    if (!blobs.has(path)) blobs.set(path, gitBytes(git, ["show", `${sourceCommit}:${path}`]));
    return blobs.get(path);
  };
  const sourceFiles = localImportClosure(readBlob, KD_API_ENTRY);
  const configBlob = readBlob(KD_API_CONFIG);
  const config = parseFunctionConfigBlob(configBlob, {
    functionName: KD_API_FUNCTION_SLUG,
    expectedVerifyJwt: false,
    expectedProjectId: PROJECT_ID,
  });

  const migrationPaths = gitText(git, [
    "ls-tree", "-r", "--name-only", sourceCommit, "--", "supabase/migrations",
  ]).split("\n").filter(Boolean).filter((path) => path.endsWith(".sql")).sort();
  if (migrationPaths.length === 0) throw new Error("SCHEMA_MIGRATIONS_MISSING");
  const migrations = migrationPaths.map((path) => {
    const match = path.match(MIGRATION_PATH);
    if (!match) throw new Error(`SCHEMA_MIGRATION_NAME_INVALID: ${path}`);
    const blob = readBlob(path);
    return Object.freeze({
      id: match[1],
      path,
      sha256: createHash("sha256").update(blob).digest("hex"),
    });
  });

  const trackedPaths = [...new Set([...sourceFiles, KD_API_CONFIG, ...migrationPaths])].sort();
  const dirty = gitText(git, ["status", "--short", "--", ...trackedPaths]);
  if (dirty) throw new Error("KD_API_RELEASE_INPUTS_NOT_COMMITTED");

  const sourceSha256 = sourceHash(sourceFiles, readBlob);
  const configSha256 = createHash("sha256").update(configBlob).digest("hex");
  const schemaSha256 = framedHash(
    "kd-api-schema-v1",
    migrations.map(({ path }) => [path, readBlob(path)]),
  );
  const releaseSha256 = framedHash("kd-api-release-v1", [
    ["sourceCommit", sourceCommit],
    ["releaseId", releaseId],
    ["sourceSha256", sourceSha256],
    ["configSha256", configSha256],
    ["schemaSha256", schemaSha256],
  ]);

  return Object.freeze({
    format: KD_API_RELEASE_FORMAT,
    functionSlug: KD_API_FUNCTION_SLUG,
    contractVersion: KD_API_CONTRACT_VERSION,
    sourceCommit,
    releaseId,
    releaseSha256,
    enabledDefault: false,
    projectId: config.projectId,
    verifyJwt: config.verifyJwt,
    functionSources: Object.freeze({ files: Object.freeze(sourceFiles), sha256: sourceSha256 }),
    config: Object.freeze({ path: KD_API_CONFIG, sha256: configSha256 }),
    schema: Object.freeze({ migrations: Object.freeze(migrations), sha256: schemaSha256 }),
  });
}

export function runKdApiReleaseInfoCli(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseReleaseInfoArgs(argv);
  return kdApiReleaseInfo({ ...args, ...dependencies });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    console.log(JSON.stringify(runKdApiReleaseInfoCli(), null, 2));
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}
