#!/usr/bin/env node
/* Rein lokales Gate fuer den einmaligen Mixed-Version-Uebergang.
   Der Aufrufer beschafft die Read-only-Evidenz ausserhalb dieses Prozesses.
   Dieses Modul erzeugt keine Live-Snapshots und fuehrt weder GitHub-,
   Supabase-, Cloudflare- noch Provideraufrufe aus. */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  evaluateReleaseManifestParity,
  localMigrationIds,
} from "./release-compatibility.mjs";

export const RELEASE_TRANSITION_FORMAT = "kinodreieck-release-transition-v1";
export const RELEASE_TRANSITION_MAX_SNAPSHOT_AGE_MS = 10 * 60 * 1000;
export const RELEASE_TRANSITION_MIGRATION =
  "20260905180000_entdecken_vienna_day_claim";
export const RELEASE_TRANSITION_FUNCTIONS = Object.freeze([
  "automatic-ai-check",
  "entdecken-daily-task",
]);
export const RELEASE_TRANSITION_WORKFLOWS = Object.freeze([
  ".github/workflows/automatic-ai-check.yml",
  ".github/workflows/entdecken-six-day.yml",
]);
export const RELEASE_TRANSITION_PHASES = Object.freeze([
  "pre-backend",
  "pre-resume",
  "post-resume",
]);

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ROLLOUT_ID = /^[a-z0-9][a-z0-9-]{7,79}$/;

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function canonicalInstant(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? parsed : null;
}

function uniqueExactNames(entries, names, key) {
  if (!Array.isArray(entries) || entries.length !== names.length) return false;
  const observed = entries.map((entry) => entry?.[key]).sort();
  return new Set(observed).size === names.length
    && JSON.stringify(observed) === JSON.stringify([...names].sort());
}

function push(errors, code, condition) {
  if (!condition && !errors.includes(code)) errors.push(code);
}

function validateExpected(expected, {
  localHead,
  localMigrations,
  localWorkflowHashes,
} = {}) {
  const errors = [];
  const shape = exactKeys(expected, [
    "format", "candidateCommit", "functions", "requiredMigration",
    "workflows", "releaseManifest",
  ]);
  push(errors, "TRANSITION_EXPECTED_INVALID", shape);
  if (!shape) return errors;

  push(errors, "TRANSITION_EXPECTED_INVALID",
    expected.format === RELEASE_TRANSITION_FORMAT
      && COMMIT.test(expected.candidateCommit)
      && expected.requiredMigration === RELEASE_TRANSITION_MIGRATION
      && expected.releaseManifest?.webCommit === expected.candidateCommit);

  const functionsValid = uniqueExactNames(
    expected.functions, RELEASE_TRANSITION_FUNCTIONS, "name",
  ) && expected.functions.every((entry) => exactKeys(entry, [
    "name", "verifyJwt", "sourceSha256",
  ]) && entry.verifyJwt === false && SHA256.test(entry.sourceSha256));
  push(errors, "TRANSITION_EXPECTED_INVALID", functionsValid);

  const workflowsValid = uniqueExactNames(
    expected.workflows, RELEASE_TRANSITION_WORKFLOWS, "path",
  ) && expected.workflows.every((entry) => exactKeys(entry, ["path", "sourceSha256"])
    && SHA256.test(entry.sourceSha256));
  push(errors, "TRANSITION_EXPECTED_INVALID", workflowsValid);

  const expectedParity = evaluateReleaseManifestParity({
    expected: expected.releaseManifest,
    observed: {
      format: expected.releaseManifest?.format,
      webCommit: expected.releaseManifest?.webCommit,
      functions: expected.releaseManifest?.functions,
      migrations: expected.releaseManifest?.requiredMigrations,
    },
    localWebCommit: expected.candidateCommit,
    localMigrations,
  });
  const releaseFunctions = new Map(
    Array.isArray(expected.releaseManifest?.functions)
      ? expected.releaseManifest.functions.map((entry) => [entry.name, entry])
      : [],
  );
  push(errors, "TRANSITION_EXPECTED_INVALID",
    expectedParity.ok
      && expected.releaseManifest.requiredMigrations.includes(RELEASE_TRANSITION_MIGRATION)
      && functionsValid
      && expected.functions.every((entry) => (
        releaseFunctions.get(entry.name)?.sourceSha256 === entry.sourceSha256
      )));

  if (localHead !== undefined) {
    push(errors, "RELEASE_COMMIT_DRIFT", expected.candidateCommit === localHead);
  }
  if (localWorkflowHashes !== undefined) {
    const localHashesValid = workflowsValid
      && plain(localWorkflowHashes)
      && Object.keys(localWorkflowHashes).length === RELEASE_TRANSITION_WORKFLOWS.length
      && expected.workflows.every(({ path, sourceSha256 }) => (
        localWorkflowHashes[path] === sourceSha256
      ));
    push(errors, "LOCAL_WORKFLOW_SOURCE_DRIFT", localHashesValid);
  }
  return errors;
}

function validateWorkflowState(entries, expectedState, { sourceByPath = null } = {}) {
  const errors = [];
  const keys = sourceByPath
    ? ["path", "state", "nonTerminalRuns", "sourceSha256"]
    : ["path", "state", "nonTerminalRuns"];
  if (!uniqueExactNames(entries, RELEASE_TRANSITION_WORKFLOWS, "path")
      || entries.some((entry) => !exactKeys(entry, keys))) {
    return ["WORKFLOW_SET_DRIFT"];
  }
  push(errors,
    expectedState === "active"
      ? "WORKFLOW_NOT_ACTIVE_AFTER_RESUME"
      : "WORKFLOW_NOT_DISABLED_MANUALLY",
    entries.every(({ state }) => state === expectedState));
  push(errors, "WORKFLOW_RUN_ACTIVE",
    entries.every(({ nonTerminalRuns }) => nonTerminalRuns === 0));
  if (sourceByPath) {
    push(errors, "WORKFLOW_SOURCE_DRIFT",
      entries.every(({ path, sourceSha256 }) => (
        SHA256.test(sourceSha256) && sourceByPath.get(path) === sourceSha256
      )));
  }
  return errors;
}

function validateFunctionCheckpoint(checkpoint, expectedFunction) {
  if (!exactKeys(checkpoint, ["observedAt", "function"])
      || !exactKeys(checkpoint.function, [
        "name", "status", "verifyJwt", "version", "sourceSha256",
      ])) return ["FUNCTION_READBACK_INVALID"];
  const errors = [];
  const observed = checkpoint.function;
  push(errors, "FUNCTION_AUTH_DRIFT",
    observed.name === expectedFunction?.name
      && observed.status === "ACTIVE"
      && observed.verifyJwt === expectedFunction?.verifyJwt
      && Number.isSafeInteger(observed.version) && observed.version >= 1);
  push(errors, "FUNCTION_SOURCE_DRIFT",
    observed.sourceSha256 === expectedFunction?.sourceSha256
      && SHA256.test(observed.sourceSha256));
  return errors;
}

function validateEnvironmentCheckpoint(checkpoint, environment, candidateCommit) {
  if (!exactKeys(checkpoint, ["observedAt", "environment", "webCommit", "readbackPassed"])) {
    return ["ENVIRONMENT_READBACK_INVALID"];
  }
  return checkpoint.environment === environment
      && checkpoint.webCommit === candidateCommit
      && checkpoint.readbackPassed === true
    ? [] : ["RELEASE_COMMIT_DRIFT"];
}

function validateNaturalRuns(checkpoint, resumeAt, capturedAt) {
  if (!exactKeys(checkpoint, ["observedAt", "workflows", "runs"])) {
    return ["NATURAL_RUN_READBACK_INVALID"];
  }
  const errors = validateWorkflowState(checkpoint.workflows, "active", {
    sourceByPath: null,
  });
  if (!uniqueExactNames(checkpoint.runs, RELEASE_TRANSITION_WORKFLOWS, "path")
      || checkpoint.runs.some((run) => !exactKeys(run, [
        "path", "runId", "runAttempt", "event", "status", "conclusion",
        "startedAt", "completedAt",
      ]))) {
    push(errors, "NATURAL_RUN_READBACK_INVALID", false);
    return errors;
  }
  const observedAt = canonicalInstant(checkpoint.observedAt);
  let timesValid = true;
  for (const run of checkpoint.runs) {
    const startedAt = canonicalInstant(run.startedAt);
    const completedAt = canonicalInstant(run.completedAt);
    timesValid = timesValid
      && (typeof run.runId === "string" || Number.isSafeInteger(run.runId))
      && String(run.runId).length > 0 && String(run.runId).length <= 40
      && Number.isSafeInteger(run.runAttempt) && run.runAttempt === 1
      && run.event === "schedule" && run.status === "completed"
      && run.conclusion === "success"
      && startedAt !== null && completedAt !== null
      && observedAt !== null && capturedAt !== null
      && startedAt > resumeAt
      && startedAt <= completedAt
      && completedAt <= observedAt
      && observedAt <= capturedAt;
  }
  push(errors, "NATURAL_RUN_READBACK_INVALID", timesValid);
  return errors;
}

function checkpointTimes(checkpoints, phase) {
  const order = phase === "pre-backend" ? ["paused"] : [
    "paused", "automaticFunction", "migration", "entdeckenFunction",
    "staging", "production", "preResume",
    ...(phase === "post-resume" ? ["resume", "naturalRuns"] : []),
  ];
  const times = order.map((name) => canonicalInstant(checkpoints?.[name]?.observedAt));
  return {
    order,
    times,
    ok: times.every((value) => value !== null)
      && times.every((value, index) => index === 0 || value > times[index - 1]),
  };
}

function expectedCheckpointKeys(phase) {
  if (phase === "pre-backend") return ["paused"];
  const keys = [
    "paused", "automaticFunction", "migration", "entdeckenFunction",
    "staging", "production", "preResume",
  ];
  return phase === "post-resume" ? [...keys, "resume", "naturalRuns"] : keys;
}

export function evaluateReleaseTransition({
  phase,
  expected,
  observed,
  nowMs = Date.now(),
  localHead,
  localMigrations,
  localWorkflowHashes,
} = {}) {
  const errors = validateExpected(expected, {
    localHead, localMigrations, localWorkflowHashes,
  });
  push(errors, "TRANSITION_PHASE_INVALID", RELEASE_TRANSITION_PHASES.includes(phase));
  const observedShape = exactKeys(observed, [
    "format", "phase", "rolloutId", "candidateCommit", "capturedAt", "checkpoints",
  ]);
  push(errors, "TRANSITION_SNAPSHOT_INVALID", observedShape);
  if (!observedShape || !RELEASE_TRANSITION_PHASES.includes(phase)) {
    return Object.freeze({ ok: false, phase: phase || null, errors: Object.freeze(errors) });
  }
  push(errors, "TRANSITION_SNAPSHOT_INVALID",
    observed.format === RELEASE_TRANSITION_FORMAT
      && observed.phase === phase
      && ROLLOUT_ID.test(observed.rolloutId));
  push(errors, "RELEASE_COMMIT_DRIFT",
    observed.candidateCommit === expected?.candidateCommit);

  const capturedAt = canonicalInstant(observed.capturedAt);
  push(errors, "TRANSITION_SNAPSHOT_STALE",
    capturedAt !== null && Number.isFinite(nowMs)
      && nowMs >= capturedAt
      && nowMs - capturedAt <= RELEASE_TRANSITION_MAX_SNAPSHOT_AGE_MS);

  const checkpointKeys = expectedCheckpointKeys(phase);
  push(errors, "TRANSITION_SNAPSHOT_INVALID",
    exactKeys(observed.checkpoints, checkpointKeys));
  if (!exactKeys(observed.checkpoints, checkpointKeys)) {
    return Object.freeze({ ok: false, phase, errors: Object.freeze(errors) });
  }

  const timing = checkpointTimes(observed.checkpoints, phase);
  push(errors, "TRANSITION_ORDER_INVALID", timing.ok
    && timing.times.every((value) => capturedAt !== null && value <= capturedAt));
  const currentCheckpointAt = timing.times.at(-1);
  push(errors, "TRANSITION_SNAPSHOT_STALE",
    currentCheckpointAt !== null && capturedAt !== null
      && capturedAt - currentCheckpointAt <= RELEASE_TRANSITION_MAX_SNAPSHOT_AGE_MS);

  const expectedFunctions = new Map(
    (Array.isArray(expected?.functions) ? expected.functions : [])
      .map((entry) => [entry.name, entry]),
  );
  const expectedWorkflowSources = new Map(
    (Array.isArray(expected?.workflows) ? expected.workflows : [])
      .map((entry) => [entry.path, entry.sourceSha256]),
  );
  for (const code of validateWorkflowState(
    observed.checkpoints.paused?.workflows,
    "disabled_manually",
  )) push(errors, code, false);
  push(errors, "TRANSITION_SNAPSHOT_INVALID",
    exactKeys(observed.checkpoints.paused, ["observedAt", "workflows"]));

  if (phase !== "pre-backend") {
    for (const code of validateFunctionCheckpoint(
      observed.checkpoints.automaticFunction,
      expectedFunctions.get("automatic-ai-check"),
    )) push(errors, code, false);
    for (const code of validateFunctionCheckpoint(
      observed.checkpoints.entdeckenFunction,
      expectedFunctions.get("entdecken-daily-task"),
    )) push(errors, code, false);

    const migration = observed.checkpoints.migration;
    push(errors, "MIGRATION_MISSING",
      exactKeys(migration, ["observedAt", "migrationId", "present"])
        && migration.migrationId === RELEASE_TRANSITION_MIGRATION
        && migration.present === true);

    for (const code of validateEnvironmentCheckpoint(
      observed.checkpoints.staging, "staging", expected?.candidateCommit,
    )) push(errors, code, false);
    for (const code of validateEnvironmentCheckpoint(
      observed.checkpoints.production, "production", expected?.candidateCommit,
    )) push(errors, code, false);

    const preResume = observed.checkpoints.preResume;
    push(errors, "TRANSITION_SNAPSHOT_INVALID",
      exactKeys(preResume, ["observedAt", "workflows", "releaseSnapshot"]));
    for (const code of validateWorkflowState(
      preResume?.workflows,
      "disabled_manually",
      { sourceByPath: expectedWorkflowSources },
    )) push(errors, code, false);

    const parity = evaluateReleaseManifestParity({
      expected: expected?.releaseManifest,
      observed: preResume?.releaseSnapshot,
      localWebCommit: localHead ?? expected?.candidateCommit,
      localMigrations,
    });
    push(errors, "RELEASE_PARITY_FAILED", parity.ok);
    if (parity.ok) {
      const releaseFunctions = new Map(
        parity.ok && Array.isArray(preResume.releaseSnapshot.functions)
          ? preResume.releaseSnapshot.functions.map((entry) => [entry.name, entry])
          : [],
      );
      push(errors, "FUNCTION_RELEASE_PARITY_DRIFT",
        RELEASE_TRANSITION_FUNCTIONS.every((name) => {
          const checkpoint = observed.checkpoints[
            name === "automatic-ai-check" ? "automaticFunction" : "entdeckenFunction"
          ]?.function;
          const release = releaseFunctions.get(name);
          return checkpoint && release
            && checkpoint.version === release.version
            && checkpoint.sourceSha256 === release.sourceSha256;
        }));
      push(errors, "MIGRATION_MISSING",
        preResume.releaseSnapshot.migrations.includes(RELEASE_TRANSITION_MIGRATION));
    }
  }

  if (phase === "post-resume") {
    const resume = observed.checkpoints.resume;
    push(errors, "TRANSITION_SNAPSHOT_INVALID",
      exactKeys(resume, ["observedAt", "workflows"]));
    for (const code of validateWorkflowState(
      resume?.workflows,
      "active",
      { sourceByPath: expectedWorkflowSources },
    )) push(errors, code, false);
    const resumeAt = canonicalInstant(resume?.observedAt);
    for (const code of validateNaturalRuns(
      observed.checkpoints.naturalRuns,
      resumeAt ?? Number.POSITIVE_INFINITY,
      capturedAt,
    )) push(errors, code, false);
  }

  return Object.freeze({
    ok: errors.length === 0,
    phase,
    errors: Object.freeze(errors),
  });
}

function cliArgs(argv) {
  if (argv.length !== 6
      || argv[0] !== "--phase"
      || argv[2] !== "--expected"
      || argv[4] !== "--observed") {
    throw new Error(
      "Aufruf: node tools/release-transition.mjs --phase <pre-backend|pre-resume|post-resume> --expected <expected.json> --observed <snapshot.json>",
    );
  }
  return Object.freeze({
    phase: argv[1],
    expectedPath: resolve(argv[3]),
    observedPath: resolve(argv[5]),
  });
}

function readJson(path, code) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(code); }
}

function localWorkflowHashes(root) {
  return Object.fromEntries(RELEASE_TRANSITION_WORKFLOWS.map((path) => [
    path,
    createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex"),
  ]));
}

export function runReleaseTransitionCli(argv = process.argv.slice(2), {
  root = process.cwd(),
  nowMs = Date.now(),
  git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
} = {}) {
  const { phase, expectedPath, observedPath } = cliArgs(argv);
  const result = evaluateReleaseTransition({
    phase,
    expected: readJson(expectedPath, "TRANSITION_EXPECTED_UNREADABLE"),
    observed: readJson(observedPath, "TRANSITION_SNAPSHOT_UNREADABLE"),
    nowMs,
    localHead: git(["rev-parse", "HEAD"]),
    localMigrations: localMigrationIds(root),
    localWorkflowHashes: localWorkflowHashes(root),
  });
  if (!result.ok) {
    throw new Error(`RELEASE_TRANSITION_STOP: ${result.errors.join(", ")}`);
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const result = runReleaseTransitionCli();
    console.log(`Release-Uebergang ${result.phase} bestaetigt.`);
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 75;
  }
}
