import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const supabaseConfig = readFileSync("supabase/config.toml", "utf8");
const staging = workflow.match(/deploy-staging:[\s\S]*?^\s{2}deploy-production:/m)?.[0] || "";
const production = workflow.match(/deploy-production:[\s\S]*$/m)?.[0] || "";

assert.match(staging, /VITE_PRIVATE_MAIL_ENABLED:\s*"true"/);
assert.match(staging, /VITE_PRIVATE_MAIL_ENDPOINT_NAME:\s*"private-mail-request"/);
assert.match(production, /VITE_PRIVATE_MAIL_ENABLED:\s*"false"/);
assert.match(production, /VITE_PRIVATE_MAIL_ENDPOINT_NAME:\s*""/);
assert.doesNotMatch(production, /VITE_PRIVATE_MAIL_ENDPOINT_NAME:\s*"private-mail-request"/);

const functionSections = supabaseConfig.match(/^\[functions\.private-mail-request\]$/gm) || [];
assert.equal(functionSections.length, 1, "private-mail-request braucht genau eine Function-Konfiguration");
assert.match(
  supabaseConfig,
  /\[functions\.private-mail-request\][\s\S]*?verify_jwt\s*=\s*true(?:\s*$|\s*\n\s*\[)/m,
);

const baseEnv = {
  PATH: process.env.PATH || "",
  DEPLOY_TARGET: "staging",
  VITE_APP_ENV: "staging",
  VITE_APP_URL: "https://staging.kinodreieck.at",
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnop",
  VITE_BUILD_VERSION: "0123456789abcdef",
  VITE_PRIVATE_MAIL_ENABLED: "true",
  VITE_PRIVATE_MAIL_ENDPOINT_NAME: "private-mail-request",
};

function deployCheck(overrides = {}) {
  return spawnSync(process.execPath, ["tools/check-deploy-env.mjs"], {
    cwd: process.cwd(),
    env: { ...baseEnv, ...overrides },
    encoding: "utf8",
  });
}

assert.equal(deployCheck().status, 0, "gültige Staging-Konfiguration muss passieren");
assert.notEqual(deployCheck({ VITE_PRIVATE_MAIL_ENABLED: "false" }).status, 0,
  "Staging darf den privaten Mailweg nicht deaktivieren");
assert.notEqual(deployCheck({ VITE_PRIVATE_MAIL_ENDPOINT_NAME: "anderer-endpoint" }).status, 0,
  "Staging darf keinen abweichenden Function-Namen verwenden");
assert.equal(deployCheck({
  DEPLOY_TARGET: "production",
  VITE_APP_ENV: "production",
  VITE_APP_URL: "https://kinodreieck.at",
  VITE_PRIVATE_MAIL_ENABLED: "false",
  VITE_PRIVATE_MAIL_ENDPOINT_NAME: "",
}).status, 0, "deaktivierte Production-Konfiguration ohne Endpoint muss passieren");
assert.notEqual(deployCheck({
  DEPLOY_TARGET: "production",
  VITE_APP_ENV: "production",
  VITE_APP_URL: "https://kinodreieck.at",
  VITE_PRIVATE_MAIL_ENABLED: "true",
}).status, 0, "Production darf den privaten Mailweg nicht aktivieren");
assert.notEqual(deployCheck({
  DEPLOY_TARGET: "production",
  VITE_APP_ENV: "production",
  VITE_APP_URL: "https://kinodreieck.at",
  VITE_PRIVATE_MAIL_ENABLED: "false",
}).status, 0, "Production darf keinen nutzbaren Mail-Endpoint enthalten");

console.log("private_mail_release_wiring_test: 13/13 Checks bestanden");
