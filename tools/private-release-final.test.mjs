import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRIVATE_RELEASE_FINAL_STEPS,
  runFinalGate,
  validateFinalGatePlan,
} from "./private-release-final.mjs";
import {
  scanAddedCommittedDiff,
  scanVisibleSingleFilePromises,
  validateBuiltArtifacts,
} from "./private-release-integrity.mjs";

test("Gateplan enthaelt alle sechs providerfreien Teilgates exakt einmal und ohne Retry", () => {
  assert.deepEqual(validateFinalGatePlan(), { ok: true, errors: [] });
  assert.equal(PRIVATE_RELEASE_FINAL_STEPS.length, 6);
  assert.deepEqual(PRIVATE_RELEASE_FINAL_STEPS.map((step) => step.id), [
    "mock-suite", "function-suite", "account-ready-browsers",
    "vite-build", "single-file-build", "candidate-integrity",
  ]);
});

test("Aggregation fuehrt nach fruehen Fehlern jedes Teilgate genau einmal aus", () => {
  const calls = [];
  const exits = [1, 0, 2, 0, 0, 3];
  const result = runFinalGate({
    runner(command, args) {
      calls.push([command, ...args]);
      return { status: exits[calls.length - 1], signal: null, error: null };
    },
    log() {},
    error() {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.results.length, 6);
  assert.deepEqual(calls, PRIVATE_RELEASE_FINAL_STEPS.map((step) => [step.command, ...step.args]));
  assert.deepEqual(result.results.map((entry) => entry.ok), [false, true, false, true, true, false]);
});

test("Startfehler wird rot aggregiert und stoppt folgende Teilgates nicht", () => {
  let calls = 0;
  const result = runFinalGate({
    runner() {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error("synthetic runner failure"), { code: "SYNTHETIC" });
      return { status: 0, signal: null, error: null };
    },
    log() {},
    error() {},
  });
  assert.equal(calls, 6);
  assert.equal(result.ok, false);
  assert.match(result.results[1].detail, /Startfehler/u);
});

test("Added-Delta-Scanner meldet echte Muster redigiert und erlaubt nur klare Test-/Envmarker", () => {
  const githubLike = `ghp_${"A".repeat(36)}`;
  const openAiLike = `sk-${"b".repeat(28)}`;
  const diff = [
    "diff --git a/src/x.js b/src/x.js",
    "--- a/src/x.js",
    "+++ b/src/x.js",
    "@@ -0,0 +1,6 @@",
    `+const access_token = \"${githubLike}\";`,
    `+const api_key = \"${openAiLike}\";`,
    "+const access_token = \"synthetic-private-v1-access\";",
    "+const api_key = process.env.PRIVATE_API_KEY;",
    "+token: \"$" + "{{ secrets.RELEASE_TOKEN }}\"",
    "+const note = \"unauffaellig\";",
  ].join("\n");
  const findings = scanAddedCommittedDiff(diff);
  assert.deepEqual(findings.map(({ rule, path, line }) => ({ rule, path, line })), [
    { rule: "github-token", path: "src/x.js", line: 1 },
    { rule: "hardcoded-access_token", path: "src/x.js", line: 1 },
    { rule: "openai-token", path: "src/x.js", line: 2 },
    { rule: "hardcoded-api_key", path: "src/x.js", line: 2 },
  ]);
  assert.equal(JSON.stringify(findings).includes(githubLike), false);
  assert.equal(JSON.stringify(findings).includes(openAiLike), false);
  assert.deepEqual(scanAddedCommittedDiff([
    "diff --git a/cleanup_b1_test.mjs b/cleanup_b1_test.mjs",
    "--- a/cleanup_b1_test.mjs",
    "+++ b/cleanup_b1_test.mjs",
    "@@ -0,0 +1,2 @@",
    "+const access_token = \"access-b1\";",
    "+const refresh_token = \"refresh-neu\";",
  ].join("\n")), []);
});

test("Artefakt- und Sichtbarkeitspruefer sind fail-closed", () => {
  const missing = validateBuiltArtifacts("/definitely/not/a/private-release-candidate");
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.includes("dist-index-missing"));
  assert.ok(missing.errors.includes("single-file-missing"));
  assert.deepEqual(scanVisibleSingleFilePromises("/definitely/not/a/private-release-candidate"), []);
});
