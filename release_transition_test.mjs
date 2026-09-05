#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RELEASE_CRITICAL_FUNCTIONS, RELEASE_MANIFEST_FORMAT } from "./tools/release-compatibility.mjs";
import {
  evaluateReleaseTransition,
  RELEASE_TRANSITION_FORMAT,
  RELEASE_TRANSITION_MIGRATION,
  RELEASE_TRANSITION_WORKFLOWS,
} from "./tools/release-transition.mjs";

const COMMIT = "a".repeat(40);
const OTHER_COMMIT = "b".repeat(40);
const AUTO_HASH = "1".repeat(64);
const ENTDECKEN_HASH = "2".repeat(64);
const WORKFLOW_HASHES = Object.freeze({
  [RELEASE_TRANSITION_WORKFLOWS[0]]: "3".repeat(64),
  [RELEASE_TRANSITION_WORKFLOWS[1]]: "4".repeat(64),
});
const MIGRATIONS = Object.freeze([
  "20260809180000_event_radar_local_basis",
  RELEASE_TRANSITION_MIGRATION,
]);

const releaseFunctions = RELEASE_CRITICAL_FUNCTIONS.map((name, index) => ({
  name,
  version: 40 + index,
  sourceSha256: name === "automatic-ai-check" ? AUTO_HASH
    : name === "entdecken-daily-task" ? ENTDECKEN_HASH
      : String(index + 5).repeat(64).slice(0, 64),
}));

const expected = Object.freeze({
  format: RELEASE_TRANSITION_FORMAT,
  candidateCommit: COMMIT,
  functions: Object.freeze([
    Object.freeze({ name: "automatic-ai-check", verifyJwt: false, sourceSha256: AUTO_HASH }),
    Object.freeze({ name: "entdecken-daily-task", verifyJwt: false, sourceSha256: ENTDECKEN_HASH }),
  ]),
  requiredMigration: RELEASE_TRANSITION_MIGRATION,
  workflows: Object.freeze(RELEASE_TRANSITION_WORKFLOWS.map((path) => Object.freeze({
    path, sourceSha256: WORKFLOW_HASHES[path],
  }))),
  releaseManifest: Object.freeze({
    format: RELEASE_MANIFEST_FORMAT,
    webCommit: COMMIT,
    functions: Object.freeze(releaseFunctions),
    requiredMigrations: MIGRATIONS,
  }),
});

function workflowState(state, { sources = false, active = 0 } = {}) {
  return RELEASE_TRANSITION_WORKFLOWS.map((path) => ({
    path,
    state,
    nonTerminalRuns: active,
    ...(sources ? { sourceSha256: WORKFLOW_HASHES[path] } : {}),
  }));
}

function functionCheckpoint(name, observedAt) {
  const release = releaseFunctions.find((entry) => entry.name === name);
  return {
    observedAt,
    function: {
      name,
      status: "ACTIVE",
      verifyJwt: false,
      version: release.version,
      sourceSha256: release.sourceSha256,
    },
  };
}

function allCheckpoints() {
  return {
    paused: {
      observedAt: "2026-09-05T12:00:00.000Z",
      workflows: workflowState("disabled_manually"),
    },
    automaticFunction: functionCheckpoint("automatic-ai-check", "2026-09-05T12:01:00.000Z"),
    migration: {
      observedAt: "2026-09-05T12:02:00.000Z",
      migrationId: RELEASE_TRANSITION_MIGRATION,
      present: true,
    },
    entdeckenFunction: functionCheckpoint("entdecken-daily-task", "2026-09-05T12:03:00.000Z"),
    staging: {
      observedAt: "2026-09-05T12:04:00.000Z",
      environment: "staging",
      webCommit: COMMIT,
      readbackPassed: true,
    },
    production: {
      observedAt: "2026-09-05T12:05:00.000Z",
      environment: "production",
      webCommit: COMMIT,
      readbackPassed: true,
    },
    preResume: {
      observedAt: "2026-09-05T12:06:00.000Z",
      workflows: workflowState("disabled_manually", { sources: true }),
      releaseSnapshot: {
        format: RELEASE_MANIFEST_FORMAT,
        webCommit: COMMIT,
        functions: structuredClone(releaseFunctions),
        migrations: [...MIGRATIONS],
      },
    },
    resume: {
      observedAt: "2026-09-05T12:07:00.000Z",
      workflows: workflowState("active", { sources: true }),
    },
    naturalRuns: {
      observedAt: "2026-09-05T12:09:00.000Z",
      workflows: workflowState("active"),
      runs: RELEASE_TRANSITION_WORKFLOWS.map((path, index) => ({
        path,
        runId: String(9000 + index),
        event: "schedule",
        status: "completed",
        conclusion: "success",
        startedAt: `2026-09-05T12:07:${10 + index}.000Z`,
        completedAt: `2026-09-05T12:08:${10 + index}.000Z`,
      })),
    },
  };
}

function fixture(phase = "pre-resume") {
  const checkpoints = allCheckpoints();
  const names = phase === "pre-backend" ? ["paused"] : [
    "paused", "automaticFunction", "migration", "entdeckenFunction",
    "staging", "production", "preResume",
    ...(phase === "post-resume" ? ["resume", "naturalRuns"] : []),
  ];
  return {
    phase,
    expected: structuredClone(expected),
    observed: {
      format: RELEASE_TRANSITION_FORMAT,
      phase,
      rolloutId: "release-20260905",
      candidateCommit: COMMIT,
      capturedAt: phase === "pre-backend" ? "2026-09-05T12:00:30.000Z"
        : phase === "pre-resume" ? "2026-09-05T12:06:30.000Z"
          : "2026-09-05T12:09:30.000Z",
      checkpoints: Object.fromEntries(names.map((name) => [name, checkpoints[name]])),
    },
    nowMs: Date.parse(phase === "pre-backend" ? "2026-09-05T12:01:00.000Z"
      : phase === "pre-resume" ? "2026-09-05T12:07:00.000Z"
        : "2026-09-05T12:10:00.000Z"),
    localHead: COMMIT,
    localMigrations: [...MIGRATIONS],
    localWorkflowHashes: { ...WORKFLOW_HASHES },
  };
}

function expectStop(input, code) {
  const result = evaluateReleaseTransition(input);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes(code), `${code}: ${result.errors.join(", ")}`);
}

test("alle drei Phasen akzeptieren nur die vollstaendige geordnete Evidenz", () => {
  for (const phase of ["pre-backend", "pre-resume", "post-resume"]) {
    const result = evaluateReleaseTransition(fixture(phase));
    assert.deepEqual(result, { ok: true, phase, errors: [] });
  }
});

test("Snapshot muss exakt, kanonisch, frisch und streng monoton sein", () => {
  const stale = fixture();
  stale.nowMs += 11 * 60 * 1000;
  expectStop(stale, "TRANSITION_SNAPSHOT_STALE");

  const staleCurrentReadback = fixture("pre-backend");
  staleCurrentReadback.observed.capturedAt = "2026-09-05T12:11:00.001Z";
  staleCurrentReadback.nowMs = Date.parse("2026-09-05T12:11:01.000Z");
  expectStop(staleCurrentReadback, "TRANSITION_SNAPSHOT_STALE");

  const nonCanonical = fixture();
  nonCanonical.observed.checkpoints.migration.observedAt = "2026-09-05T12:02:00Z";
  expectStop(nonCanonical, "TRANSITION_ORDER_INVALID");

  const reordered = fixture();
  reordered.observed.checkpoints.entdeckenFunction.observedAt = "2026-09-05T12:01:30.000Z";
  expectStop(reordered, "TRANSITION_ORDER_INVALID");

  const extra = fixture("pre-backend");
  extra.observed.checkpoints.extra = {};
  expectStop(extra, "TRANSITION_SNAPSHOT_INVALID");
});

test("vor Backend und Resume sind exakt zwei manuell pausierte, ruhende Workflows Pflicht", () => {
  const active = fixture("pre-backend");
  active.observed.checkpoints.paused.workflows[0].state = "active";
  expectStop(active, "WORKFLOW_NOT_DISABLED_MANUALLY");

  const running = fixture();
  running.observed.checkpoints.preResume.workflows[1].nonTerminalRuns = 1;
  expectStop(running, "WORKFLOW_RUN_ACTIVE");

  const duplicate = fixture("pre-backend");
  duplicate.observed.checkpoints.paused.workflows[1].path = RELEASE_TRANSITION_WORKFLOWS[0];
  expectStop(duplicate, "WORKFLOW_SET_DRIFT");
});

test("Function-, Migration-, Environment- und Workflowdrift stoppen pre-resume", () => {
  const auth = fixture();
  auth.observed.checkpoints.automaticFunction.function.verifyJwt = true;
  expectStop(auth, "FUNCTION_AUTH_DRIFT");

  const functionSource = fixture();
  functionSource.observed.checkpoints.entdeckenFunction.function.sourceSha256 = "f".repeat(64);
  expectStop(functionSource, "FUNCTION_SOURCE_DRIFT");

  const migration = fixture();
  migration.observed.checkpoints.migration.present = false;
  expectStop(migration, "MIGRATION_MISSING");

  const staging = fixture();
  staging.observed.checkpoints.staging.webCommit = OTHER_COMMIT;
  expectStop(staging, "RELEASE_COMMIT_DRIFT");

  const workflowSource = fixture();
  workflowSource.observed.checkpoints.preResume.workflows[0].sourceSha256 = "e".repeat(64);
  expectStop(workflowSource, "WORKFLOW_SOURCE_DRIFT");
});

test("pre-resume nutzt die vorhandene vollstaendige Releaseparitaet", () => {
  const parity = fixture();
  parity.observed.checkpoints.preResume.releaseSnapshot.webCommit = OTHER_COMMIT;
  expectStop(parity, "RELEASE_PARITY_FAILED");

  const crossCheck = fixture();
  crossCheck.observed.checkpoints.automaticFunction.function.version += 1;
  expectStop(crossCheck, "FUNCTION_RELEASE_PARITY_DRIFT");

  const missingMigration = fixture();
  missingMigration.observed.checkpoints.preResume.releaseSnapshot.migrations = [MIGRATIONS[0]];
  expectStop(missingMigration, "RELEASE_PARITY_FAILED");
});

test("lokaler Commit und lokale Workflowbytes duerfen das Soll nicht widerlegen", () => {
  const commit = fixture("pre-backend");
  commit.localHead = OTHER_COMMIT;
  expectStop(commit, "RELEASE_COMMIT_DRIFT");

  const workflow = fixture("pre-backend");
  workflow.localWorkflowHashes[RELEASE_TRANSITION_WORKFLOWS[0]] = "0".repeat(64);
  expectStop(workflow, "LOCAL_WORKFLOW_SOURCE_DRIFT");
});

test("post-resume verlangt aktive Workflows und je einen spaeteren natuerlichen Erfolg", () => {
  const disabled = fixture("post-resume");
  disabled.observed.checkpoints.resume.workflows[0].state = "disabled_manually";
  expectStop(disabled, "WORKFLOW_NOT_ACTIVE_AFTER_RESUME");

  const manual = fixture("post-resume");
  manual.observed.checkpoints.naturalRuns.runs[0].event = "workflow_dispatch";
  expectStop(manual, "NATURAL_RUN_READBACK_INVALID");

  const oldRun = fixture("post-resume");
  oldRun.observed.checkpoints.naturalRuns.runs[1].startedAt = "2026-09-05T12:06:59.000Z";
  expectStop(oldRun, "NATURAL_RUN_READBACK_INVALID");
});

test("unbekannte Phase und abweichender Sollvertrag failen geschlossen", () => {
  const phase = fixture("pre-backend");
  phase.phase = "deploy-now";
  expectStop(phase, "TRANSITION_PHASE_INVALID");

  const wrongMigration = fixture("pre-backend");
  wrongMigration.expected.requiredMigration = "20260905180001_wrong";
  expectStop(wrongMigration, "TRANSITION_EXPECTED_INVALID");

  const wrongReleaseSource = fixture("pre-backend");
  wrongReleaseSource.expected.releaseManifest.functions.find(
    ({ name }) => name === "automatic-ai-check",
  ).sourceSha256 = "f".repeat(64);
  expectStop(wrongReleaseSource, "TRANSITION_EXPECTED_INVALID");
});

test("Gate bleibt lokal und ist im npm-Lauf genau einmal verdrahtet", () => {
  const source = readFileSync("tools/release-transition.mjs", "utf8");
  assert.equal((source.match(/execFileSync\(/gu) || []).length, 1);
  assert.match(source, /execFileSync\("git", args/u);
  assert.doesNotMatch(source, /\bfetch\s*\(|\bcurl\b|functions\s+deploy|migration\s+up/iu);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["check:release-transition"],
    "node tools/release-transition.mjs");
  assert.equal(packageJson.scripts["test:release-transition"],
    "node --test release_transition_test.mjs");
  assert.equal((packageJson.scripts.pretest.match(/test:release-transition/gu) || []).length, 1);
  assert.equal((packageJson.scripts.test.match(/release.transition/gu) || []).length, 0);
  assert.doesNotMatch(readFileSync("tools/private-release-final.mjs", "utf8"),
    /release-transition|release_transition/u);
});
