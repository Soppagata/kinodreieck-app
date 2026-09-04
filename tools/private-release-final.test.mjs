import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  PRIVATE_RELEASE_FINAL_STEPS,
  runFinalGate,
  validateFinalGatePlan,
} from "./private-release-final.mjs";
import {
  resolveDistAssetReference,
  scanAddedCommittedDiff,
  scanVisibleSingleFilePromises,
  validateBuiltArtifacts,
} from "./private-release-integrity.mjs";

function createArtifactFixture(references) {
  const root = mkdtempSync(join(tmpdir(), "kd-private-release-artifacts-"));
  mkdirSync(join(root, "dist", "assets"), { recursive: true });
  mkdirSync(join(root, "dist-single"), { recursive: true });
  writeFileSync(join(root, "dist", "assets", "app.js"), "console.log('fixture');\n");
  writeFileSync(join(root, "dist", "assets", "app.css"), ":root { color: black; }\n");
  writeFileSync(join(root, "dist", "sw.js"), "// synthetic service worker\n");
  writeFileSync(join(root, "dist", "index.html"), [
    "<!doctype html><div id=\"root\"></div>",
    ...references.map((reference) => reference.endsWith(".css")
      ? `<link rel=\"stylesheet\" href=\"${reference}\">`
      : `<script src=\"${reference}\"></script>`),
  ].join("\n"));
  writeFileSync(join(root, "dist-single", "Kinodreieck.html"), [
    "<!doctype html><div data-kd-einzeldatei-seed></div>",
    "<script>window.__KD_DEMO_SEED__ = {};</script>",
    "Der letzte Vorführer · Sommer der Kometen · Der stille Zeuge",
  ].join("\n"));
  return root;
}

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

test("Dist-Asset-Resolver akzeptiert nur die zwei lokalen Vite-Formen", () => {
  const dist = resolve("/tmp", "private-release-candidate", "dist");
  assert.equal(resolveDistAssetReference(dist, "/assets/app.js"), join(dist, "assets", "app.js"));
  assert.equal(resolveDistAssetReference(dist, "./assets/app.js?v=1#bundle"), join(dist, "assets", "app.js"));
});

test("Dist-Asset-Resolver weist externe und Traversal-Pfade ab", () => {
  const dist = resolve("/tmp", "private-release-candidate", "dist");
  for (const reference of [
    "https://cdn.example/assets/app.js",
    "//cdn.example/assets/app.js",
    "assets/app.js",
    "/assets/../app.js",
    "./assets/%2e%2e/app.js",
    "./assets/app%2fescape.js",
    "./assets/app%5cescape.js",
  ]) assert.equal(resolveDistAssetReference(dist, reference), null, reference);
});

test("Artefaktpruefer akzeptiert root- und dot-relative lokale Vite-Assets", (context) => {
  for (const prefix of ["/assets/", "./assets/"]) {
    const root = createArtifactFixture([`${prefix}app.js`, `${prefix}app.css`]);
    context.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(validateBuiltArtifacts(root), { ok: true, errors: [] });
  }
});

test("Artefaktpruefer laesst externe oder Traversal-Referenzen nicht als lokale Assets gelten", (context) => {
  const externalRoot = createArtifactFixture([
    "https://cdn.example/assets/app.js",
    "https://cdn.example/assets/app.css",
  ]);
  context.after(() => rmSync(externalRoot, { recursive: true, force: true }));
  assert.ok(validateBuiltArtifacts(externalRoot).errors.includes("dist-asset-reference-missing"));

  const traversalRoot = createArtifactFixture(["./assets/../app.js", "./assets/app.css"]);
  writeFileSync(join(traversalRoot, "dist", "app.js"), "console.log('must not escape assets');\n");
  context.after(() => rmSync(traversalRoot, { recursive: true, force: true }));
  assert.ok(validateBuiltArtifacts(traversalRoot).errors.includes("dist-asset-reference-unsafe"));
});
