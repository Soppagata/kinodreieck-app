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
assert.match(monitor, /workflow_dispatch\s*:/);
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
assert.match(accountBoundary, /workflow_dispatch[^\n]*Ref `staging`/);
assert.match(accountBoundary, /Schedules[\s\S]*Default-Branch/);
assert.match(accountBoundary, /kein(?:e|en) (?:Migration|Function|Scheduler|Provider|Loesch|Datenkop)/i);

assert.match(accountBoundary, /SUPABASE_REMOTE_PROVENANCE/);
assert.match(accountBoundary, /FUNCTION_HEALTH_IS_NOT_SOURCE_PROOF/);
assert.match(accountBoundary, /Remote-Migrationsliste/);
assert.match(accountBoundary, /Pfade, Dateizahl und SHA-256/);
assert.match(accountBoundary, /keine fehlende, zusaetzliche[\s\S]*Migration/);
assert.match(accountBoundary, /Healthmarker[\s\S]*zusaetzlicher Laufzeitbeleg/);

assert.match(accountBoundary, /PUBLIC_SIGNUP_DISABLED/);
assert.match(accountBoundary, /Auth-Konfigurations-Readback[\s\S]*oeffentliche Registrierung[\s\S]*deaktiviert/);
assert.match(accountBoundary, /ACCOUNT_BOOTSTRAP_ATOMIC/);
assert.match(accountBoundary, /genau ein neues dediziertes Authkonto/i);
assert.match(accountBoundary, /genau eine `kd_account_access`-Zeile/);
assert.match(accountBoundary, /`role=member`, `active=true` und `personal_ai=false`/);
assert.match(accountBoundary, /Kein Retry[\s\S]*unklarem Ergebnis/);
assert.match(accountBoundary, /PARTIAL_ACCOUNT_BLOCKED/);
assert.match(accountBoundary, /Abschluss-Readback[\s\S]*null Zeilen/);
assert.match(accountBoundary, /eigenen\s+ausdruecklichen Remote-Write-Freigabe/);

assert.match(accountBoundary, /RESEND_READ_ONLY_READY/);
assert.match(accountBoundary, /Resend-Absenderdomain `kinodreieck\.at`[\s\S]*`verified`/);
assert.match(accountBoundary, /SPF-\/DKIM-DNS-Werte/);
assert.match(accountBoundary, /`private-mail-request` ist `ACTIVE`, `verify_jwt=true`/);
for (const secretName of [
  "RESEND_API_KEY",
  "KD_PRIVATE_MAIL_SENDER",
  "KD_PRIVATE_MAIL_RECIPIENT",
  "KD_PRIVATE_MAIL_HMAC_SECRET",
  "KD_PRIVATE_MAIL_TRANSPORT_ACTIVATION_SECRET",
]) assert.match(accountBoundary, new RegExp(`\\b${secretName}\\b`));
assert.match(accountBoundary, /Secret-Readback belegt nur Namen\/Versionen[\s\S]*niemals Werte/);
assert.match(accountBoundary, /keine Testmail[\s\S]*gesendet/);

console.log("ACCOUNT-READINESS-BOUNDARIES BESTANDEN");
