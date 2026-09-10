import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateStagingSandbox } from "./tools/check-staging-sandbox.mjs";

const TOOL = fileURLToPath(new URL("./tools/check-staging-sandbox.mjs", import.meta.url));
const CURRENT_PRODUCTION_REF = "bscjgwcntapobyxsiyce";

const GO_INPUT = Object.freeze({
  stagingBranch: "sandbox/max",
  productionBranch: "main",
  stagingBuildTarget: "staging-sandbox",
  productionBuildTarget: "production",
  stagingCloudflareAccountId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  productionCloudflareAccountId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  stagingPagesProject: "kinodreieck-sandbox-max",
  productionPagesProject: "kinodreieck",
  stagingDomain: "sandbox.kinodreieck.at",
  productionDomain: "kinodreieck.at",
  stagingSupabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  productionSupabaseUrl: `https://${CURRENT_PRODUCTION_REF}.supabase.co`,
  stagingSupabaseProjectRef: "abcdefghijklmnopqrst",
  productionSupabaseProjectRef: CURRENT_PRODUCTION_REF,
  providerEffects: "disabled",
  schedulerEffects: "disabled",
});

function cliArgs(input) {
  return [
    "--staging-branch", input.stagingBranch,
    "--production-branch", input.productionBranch,
    "--staging-build-target", input.stagingBuildTarget,
    "--production-build-target", input.productionBuildTarget,
    "--staging-cloudflare-account-id", input.stagingCloudflareAccountId,
    "--production-cloudflare-account-id", input.productionCloudflareAccountId,
    "--staging-pages-project", input.stagingPagesProject,
    "--production-pages-project", input.productionPagesProject,
    "--staging-domain", input.stagingDomain,
    "--production-domain", input.productionDomain,
    "--staging-supabase-url", input.stagingSupabaseUrl,
    "--production-supabase-url", input.productionSupabaseUrl,
    "--staging-supabase-project-ref", input.stagingSupabaseProjectRef,
    "--production-supabase-project-ref", input.productionSupabaseProjectRef,
    "--provider-effects", input.providerEffects,
    "--scheduler-effects", input.schedulerEffects,
  ];
}

test("vollstaendig getrennte, effektfreie Ziele ergeben GO", () => {
  assert.deepEqual(evaluateStagingSandbox(GO_INPUT), { status: "GO", reasons: [] });
});

test("heute gleiche Staging-/Production-Supabase-Identitaet bleibt BLOCKED", () => {
  const result = evaluateStagingSandbox({
    ...GO_INPUT,
    stagingSupabaseUrl: `https://${CURRENT_PRODUCTION_REF}.supabase.co`,
    stagingSupabaseProjectRef: CURRENT_PRODUCTION_REF,
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasons, ["SUPABASE_PROJECT_NOT_SEPARATE"]);
});

test("fehlende Eingabe sperrt fail-closed", () => {
  const result = evaluateStagingSandbox({ ...GO_INPUT, stagingSupabaseUrl: "" });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.includes("MISSING_REQUIRED_INPUT"));
});

test("eine andere Domain im selben Cloudflare-Pages-Projekt genuegt nicht", () => {
  const result = evaluateStagingSandbox({ ...GO_INPUT, stagingPagesProject: GO_INPUT.productionPagesProject });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.includes("PAGES_PROJECT_NOT_SEPARATE"));
});

test("CLI gibt weder vorhandene Keys noch andere Eingabewerte aus", () => {
  const secrets = ["publishable-test-secret", "provider-test-secret", "service-role-test-secret"];
  const run = spawnSync(process.execPath, [TOOL, ...cliArgs(GO_INPUT)], {
    encoding: "utf8",
    env: {
      ...process.env,
      VITE_SUPABASE_PUBLISHABLE_KEY: secrets[0],
      PROVIDER_API_KEY: secrets[1],
      SUPABASE_SERVICE_ROLE_KEY: secrets[2],
    },
  });

  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { status: "GO", reasons: [] });
  for (const value of [...secrets, ...Object.values(GO_INPUT)]) {
    assert.equal(`${run.stdout}${run.stderr}`.includes(value), false);
  }
});
