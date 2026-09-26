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
  assert.doesNotMatch(workflow, /test:kd-api:final/);
});

test("gezielter Workflow ist manuell, serialisiert und deployt nur kd-api", async () => {
  const workflow = await read(".github/workflows/kd-api.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /functions deploy kd-api/);
  assert.match(workflow, /--no-verify-jwt/);
  assert.match(workflow, /kd-api-readback\.mjs/);
  assert.match(workflow, /kinodreieck-kd-api-shared-supabase/);
  assert.doesNotMatch(workflow, /supabase (?:db|config) push/);
  assert.ok(RELEASE_CRITICAL_FUNCTIONS.includes("kd-api"));
});
