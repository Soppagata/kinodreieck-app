#!/usr/bin/env node
/* Read-only Releaseparitaet fuer Web, Edge Functions und Migrationen.
   Der Aufrufer beschafft zwei explizite JSON-Snapshots. Dieses Gate liest nur
   lokale Dateien/Git und wertet die Snapshots aus; es startet weder Deploys
   noch Function- oder Migrationswirkung. */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { evaluateReleaseCompatibility } from "../src/lib/releaseCompatibility.js";

export const RELEASE_MANIFEST_FORMAT = "kinodreieck-release-compatibility-v1";
export const RELEASE_CRITICAL_FUNCTIONS = Object.freeze([
  "account-self-service",
  "ai-task",
  "automatic-ai-check",
  "entdecken-daily-task",
  "private-mail-request",
  "radar-websearch-task",
]);

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MIGRATION = /^\d{8,20}_[a-z0-9_]+$/;

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function sortedUniqueStrings(values, pattern, code) {
  if (!Array.isArray(values) || values.length === 0
      || values.some((value) => typeof value !== "string" || !pattern.test(value))) {
    throw new Error(code);
  }
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) throw new Error(code);
  return Object.freeze(sorted);
}

function normalizeFunctions(value, code) {
  if (!Array.isArray(value) || value.length !== RELEASE_CRITICAL_FUNCTIONS.length) {
    throw new Error(code);
  }
  const normalized = value.map((entry) => {
    if (!exactKeys(entry, ["name", "version", "sourceSha256"])
        || !RELEASE_CRITICAL_FUNCTIONS.includes(entry.name)
        || !Number.isSafeInteger(entry.version) || entry.version < 1
        || typeof entry.sourceSha256 !== "string" || !SHA256.test(entry.sourceSha256)) {
      throw new Error(code);
    }
    return Object.freeze({
      name: entry.name,
      version: entry.version,
      sourceSha256: entry.sourceSha256,
    });
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(normalized.map(({ name }) => name)).size !== RELEASE_CRITICAL_FUNCTIONS.length
      || JSON.stringify(normalized.map(({ name }) => name)) !== JSON.stringify(RELEASE_CRITICAL_FUNCTIONS)) {
    throw new Error(code);
  }
  return Object.freeze(normalized);
}

export function localMigrationIds(root = process.cwd()) {
  const directory = resolve(root, "supabase/migrations");
  return Object.freeze(readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name.slice(0, -4))
    .sort());
}

export function normalizeExpectedReleaseManifest(value, {
  localWebCommit,
  localMigrations,
} = {}) {
  if (!exactKeys(value, ["format", "webCommit", "functions", "requiredMigrations"])
      || value.format !== RELEASE_MANIFEST_FORMAT
      || typeof value.webCommit !== "string" || !COMMIT.test(value.webCommit)) {
    throw new Error("EXPECTED_MANIFEST_INVALID");
  }
  const functions = normalizeFunctions(value.functions, "EXPECTED_FUNCTIONS_INCOMPLETE");
  const requiredMigrations = sortedUniqueStrings(
    value.requiredMigrations, MIGRATION, "EXPECTED_MIGRATIONS_INVALID",
  );
  if (localWebCommit && value.webCommit !== localWebCommit) {
    throw new Error("EXPECTED_WEB_COMMIT_NOT_LOCAL_HEAD");
  }
  if (localMigrations
      && JSON.stringify(requiredMigrations) !== JSON.stringify([...localMigrations].sort())) {
    throw new Error("EXPECTED_MIGRATIONS_NOT_LOCAL_SET");
  }
  return Object.freeze({
    format: RELEASE_MANIFEST_FORMAT,
    webCommit: value.webCommit,
    functions,
    requiredMigrations,
  });
}

export function normalizeObservedReleaseSnapshot(value) {
  if (!exactKeys(value, ["format", "webCommit", "functions", "migrations"])
      || value.format !== RELEASE_MANIFEST_FORMAT
      || typeof value.webCommit !== "string" || !COMMIT.test(value.webCommit)) {
    throw new Error("OBSERVED_SNAPSHOT_INVALID");
  }
  return Object.freeze({
    format: RELEASE_MANIFEST_FORMAT,
    webCommit: value.webCommit,
    functions: normalizeFunctions(value.functions, "OBSERVED_FUNCTIONS_INCOMPLETE"),
    migrations: sortedUniqueStrings(value.migrations, MIGRATION, "OBSERVED_MIGRATIONS_INVALID"),
  });
}

export function evaluateReleaseManifestParity({ expected, observed, localWebCommit, localMigrations } = {}) {
  let normalizedExpected;
  let normalizedObserved;
  try {
    normalizedExpected = normalizeExpectedReleaseManifest(expected, { localWebCommit, localMigrations });
    normalizedObserved = normalizeObservedReleaseSnapshot(observed);
  } catch (error) {
    return Object.freeze({
      ok: false,
      status: "incompatible",
      errors: Object.freeze([String(error?.message || "RELEASE_MANIFEST_INVALID")]),
      checks: Object.freeze([]),
    });
  }
  const evaluated = evaluateReleaseCompatibility({
    expected: normalizedExpected,
    observed: normalizedObserved,
  });
  const migrationSetEqual = JSON.stringify(normalizedExpected.requiredMigrations)
    === JSON.stringify(normalizedObserved.migrations);
  const checks = Object.freeze([
    ...evaluated.checks,
    Object.freeze({
      code: "migration-set-match",
      ok: migrationSetEqual,
      detail: migrationSetEqual
        ? "Lokaler Pflichtsatz und beobachtetes Migrationsledger stimmen exakt überein."
        : "Beobachtetes Migrationsledger weicht vom lokalen Pflichtsatz ab.",
    }),
  ]);
  const errors = Object.freeze(checks.filter(({ ok }) => !ok).map(({ code }) => code));
  return Object.freeze({
    format: RELEASE_MANIFEST_FORMAT,
    ok: errors.length === 0,
    status: errors.length === 0 ? "compatible" : "incompatible",
    errors,
    checks,
  });
}

function cliArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--expected" || argv[2] !== "--observed") {
    throw new Error("Aufruf: node tools/release-compatibility.mjs --expected <manifest.json> --observed <snapshot.json>");
  }
  return Object.freeze({ expectedPath: resolve(argv[1]), observedPath: resolve(argv[3]) });
}

function readJson(path, code) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(code); }
}

export function runReleaseCompatibilityCli(argv = process.argv.slice(2), {
  root = process.cwd(),
  git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
} = {}) {
  const { expectedPath, observedPath } = cliArgs(argv);
  const result = evaluateReleaseManifestParity({
    expected: readJson(expectedPath, "EXPECTED_MANIFEST_UNREADABLE"),
    observed: readJson(observedPath, "OBSERVED_SNAPSHOT_UNREADABLE"),
    localWebCommit: git(["rev-parse", "HEAD"]),
    localMigrations: localMigrationIds(root),
  });
  if (!result.ok) throw new Error(`RELEASE_INCOMPATIBLE: ${result.errors.join(", ")}`);
  return Object.freeze({
    status: result.status,
    functions: RELEASE_CRITICAL_FUNCTIONS.length,
    migrations: localMigrationIds(root).length,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const result = runReleaseCompatibilityCli();
    console.log(`Release-Parität bestätigt: ${result.functions} Functions, ${result.migrations} Migrationen.`);
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}
