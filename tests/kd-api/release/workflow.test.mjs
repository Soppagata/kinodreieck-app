import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RELEASE_CRITICAL_FUNCTIONS } from "../../../tools/release-compatibility.mjs";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("bestehende CI behält Pages-Deploys und ergänzt alle KD-API-Paketprüfungen", async () => {
  const workflow = await read(".github/workflows/deploy.yml");
  assert.match(workflow, /pages deploy dist/);
  for (const suite of ["contract", "backend", "db", "assistant", "release", "integration"]) {
    assert.match(workflow, new RegExp(`npm run test:kd-api:${suite}`));
  }
  assert.match(workflow, /npm ci --prefix integrations\/kd-assistant/);
  assert.ok(workflow.indexOf("npm ci --prefix integrations/kd-assistant") < workflow.indexOf("npm run test:kd-api:assistant"));
  assert.doesNotMatch(workflow, /test:kd-api:final/);
});

test("gezielter Workflow liefert den gebundenen Zweifunctionsatz bei geschlossenem API-Gate", async () => {
  const workflow = await read(".github/workflows/kd-api.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /functions deploy ai-task/);
  assert.match(workflow, /functions deploy kd-api/);
  assert.match(workflow, /--no-verify-jwt/);
  assert.match(workflow, /kd-api-readback\.mjs/);
  assert.match(workflow, /liesOwnerFunctionBuildMarker/);
  assert.match(workflow, /kd-api-function-set-readback\.mjs/);
  assert.match(workflow, /kinodreieck-kd-api-shared-supabase/);
  assert.doesNotMatch(workflow, /supabase (?:db|config) push/);
  assert.ok(RELEASE_CRITICAL_FUNCTIONS.includes("kd-api"));
  const aiDeploy = workflow.indexOf("functions deploy ai-task");
  const marker = workflow.indexOf("KD_FUNCTION_BUILD_VERSION");
  const health = workflow.indexOf("liesOwnerFunctionBuildMarker");
  const kdDeploy = workflow.indexOf("functions deploy kd-api");
  assert.ok(aiDeploy > 0 && aiDeploy < marker && marker < health && health < kdDeploy);
  const aiStep = workflow.slice(aiDeploy, marker);
  assert.doesNotMatch(aiStep, /--no-verify-jwt/);
  assert.match(workflow.slice(kdDeploy), /--no-verify-jwt/);
  const deployed = [...workflow.matchAll(/functions deploy ([a-z0-9-]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(deployed)].sort(), ["ai-task", "kd-api"]);
});

test("Runbook benennt ai-task als Shared-Wirkung und bindet beide Versionsreadbacks", async () => {
  const runbook = await read("docs/KD_API_LIEFERUNG.md");
  assert.match(runbook, /Zweifunctionsatz `ai-task`/);
  assert.match(runbook, /X-KD-API-Job/);
  assert.match(runbook, /Shared-Backend-Wirkung/);
  assert.match(runbook, /Owner-Health, KD-API-Version, Management-/);
});

test("Runbook bindet den aktiven Keychain-Envelope und sperrt interne Einträge für Clients", async () => {
  const runbook = await read("docs/KD_API_LIEFERUNG.md");
  assert.match(runbook, /KD_API_KEYCHAIN_SERVICE=at\.kinodreieck\.kd-api\.access-v1/);
  assert.match(runbook, /KD_API_KEYCHAIN_ACCOUNT=<lokaler-alias>/);
  assert.match(runbook, /kd-api-keychain-v1/);
  assert.match(runbook, /\{version, alias, command, request, rawKey, metadata\}/);
  for (const internal of ["::issue-pending", "::rotate-pending", "::revoke-pending", "::revoked"]) {
    assert.match(runbook, new RegExp(internal.replaceAll(":", "\\:")));
  }
  assert.match(runbook, /private `accountId`/);
});
