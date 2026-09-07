#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const monitor = read(".github/workflows/private-ops-monitor.yml");
const automaticAi = read(".github/workflows/automatic-ai-check.yml");
const entdecken = read(".github/workflows/entdecken-six-day.yml");
const deploy = read(".github/workflows/deploy.yml");
const checker = read("tools/private-ops-check.mjs");
const sandboxContract = read("docs/STAGING_SANDBOX_SCHUTZVERTRAG.md");
const accountBoundary = read("docs/privatrelease/e9c/ACCOUNT_CREATION_BOUNDARIES.md");

assert.match(monitor, /read-only-check:[\s\S]*?environment:\s*staging/);
assert.match(monitor, /ref:\s*staging/);
assert.match(monitor, /KD_MONITOR_EXPECTED_BUILD:\s*\$\{\{\s*steps\.staging-checkout\.outputs\.sha\s*\}\}/);

for (const [name, workflow] of [
  ["automatic-ai-check", automaticAi],
  ["entdecken-six-day", entdecken],
]) {
  assert.doesNotMatch(workflow, /workflow_dispatch\s*:/, `${name} darf keinen manuellen Start anbieten`);
}
assert.match(accountBoundary, /disabled_manually/);
assert.match(accountBoundary, /UNKNOWN_BLOCKS_ACCOUNT_CREATION/);

const stagingDeploy = deploy.match(/deploy-staging:[\s\S]*?^\s{2}deploy-production:/m)?.[0] || "";
const productionDeploy = deploy.match(/deploy-production:[\s\S]*$/m)?.[0] || "";
assert.match(stagingDeploy, /VITE_ACCOUNT_DELETE_ENABLED:\s*"false"/);
assert.match(productionDeploy, /VITE_ACCOUNT_DELETE_ENABLED:\s*"false"/);
assert.match(checker, /delete_enabled:\s*false/);
assert.match(accountBoundary, /SELF_DELETE_DISABLED/);

assert.match(sandboxContract, /SUPABASE_PROJECT_NOT_SEPARATE/);
assert.match(sandboxContract, /\*\*BLOCKED\*\*/);
assert.match(accountBoundary, /DEDICATED_PILOT_ACCOUNTS_ONLY/);
assert.match(accountBoundary, /NO_SANDBOX_EFFECTS/);
assert.match(accountBoundary, /kein(?:e|en) (?:Migration|Function|Scheduler|Provider|Loesch|Datenkop)/i);

console.log("ACCOUNT-READINESS-BOUNDARIES BESTANDEN");
