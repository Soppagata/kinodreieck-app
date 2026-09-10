#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const REQUIRED_FIELDS = Object.freeze([
  "stagingBranch",
  "productionBranch",
  "stagingBuildTarget",
  "productionBuildTarget",
  "stagingCloudflareAccountId",
  "productionCloudflareAccountId",
  "stagingPagesProject",
  "productionPagesProject",
  "stagingDomain",
  "productionDomain",
  "stagingSupabaseUrl",
  "productionSupabaseUrl",
  "stagingSupabaseProjectRef",
  "productionSupabaseProjectRef",
  "providerEffects",
  "schedulerEffects",
]);

const OPTION_TO_FIELD = Object.freeze({
  "--staging-branch": "stagingBranch",
  "--production-branch": "productionBranch",
  "--staging-build-target": "stagingBuildTarget",
  "--production-build-target": "productionBuildTarget",
  "--staging-cloudflare-account-id": "stagingCloudflareAccountId",
  "--production-cloudflare-account-id": "productionCloudflareAccountId",
  "--staging-pages-project": "stagingPagesProject",
  "--production-pages-project": "productionPagesProject",
  "--staging-domain": "stagingDomain",
  "--production-domain": "productionDomain",
  "--staging-supabase-url": "stagingSupabaseUrl",
  "--production-supabase-url": "productionSupabaseUrl",
  "--staging-supabase-project-ref": "stagingSupabaseProjectRef",
  "--production-supabase-project-ref": "productionSupabaseProjectRef",
  "--provider-effects": "providerEffects",
  "--scheduler-effects": "schedulerEffects",
});

function normalizedIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function supabaseProjectRefFromUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function evaluateStagingSandbox(input = {}) {
  const reasons = [];
  const missing = REQUIRED_FIELDS.filter((field) => !String(input[field] || "").trim());
  if (missing.length > 0) reasons.push("MISSING_REQUIRED_INPUT");

  const distinctPairs = [
    ["stagingBranch", "productionBranch", "GIT_BRANCH_NOT_SEPARATE"],
    ["stagingBuildTarget", "productionBuildTarget", "BUILD_TARGET_NOT_SEPARATE"],
  ];
  for (const [stagingField, productionField, reason] of distinctPairs) {
    const staging = normalizedIdentity(input[stagingField]);
    const production = normalizedIdentity(input[productionField]);
    if (staging && production && staging === production) reasons.push(reason);
  }

  const stagingCloudflareAccountId = normalizedIdentity(input.stagingCloudflareAccountId);
  const productionCloudflareAccountId = normalizedIdentity(input.productionCloudflareAccountId);
  const stagingPagesProject = normalizedIdentity(input.stagingPagesProject);
  const productionPagesProject = normalizedIdentity(input.productionPagesProject);
  const validCloudflareAccountId = /^[a-f0-9]{32}$/;
  if (stagingCloudflareAccountId && !validCloudflareAccountId.test(stagingCloudflareAccountId)) {
    reasons.push("STAGING_CLOUDFLARE_ACCOUNT_ID_INVALID");
  }
  if (productionCloudflareAccountId && !validCloudflareAccountId.test(productionCloudflareAccountId)) {
    reasons.push("PRODUCTION_CLOUDFLARE_ACCOUNT_ID_INVALID");
  }
  if (
    stagingCloudflareAccountId && productionCloudflareAccountId
    && stagingPagesProject && productionPagesProject
    && stagingCloudflareAccountId === productionCloudflareAccountId
    && stagingPagesProject === productionPagesProject
  ) {
    reasons.push("PAGES_PROJECT_NOT_SEPARATE");
  }

  const stagingDomain = normalizedDomain(input.stagingDomain);
  const productionDomain = normalizedDomain(input.productionDomain);
  if (input.stagingDomain && !stagingDomain) reasons.push("STAGING_DOMAIN_INVALID");
  if (input.productionDomain && !productionDomain) reasons.push("PRODUCTION_DOMAIN_INVALID");
  if (stagingDomain && productionDomain && stagingDomain === productionDomain) reasons.push("DOMAIN_NOT_SEPARATE");

  const stagingUrlRef = supabaseProjectRefFromUrl(input.stagingSupabaseUrl);
  const productionUrlRef = supabaseProjectRefFromUrl(input.productionSupabaseUrl);
  const stagingDeclaredRef = normalizedIdentity(input.stagingSupabaseProjectRef);
  const productionDeclaredRef = normalizedIdentity(input.productionSupabaseProjectRef);
  const validRef = /^[a-z0-9]{20}$/;

  if (input.stagingSupabaseUrl && !stagingUrlRef) reasons.push("STAGING_SUPABASE_URL_INVALID");
  if (input.productionSupabaseUrl && !productionUrlRef) reasons.push("PRODUCTION_SUPABASE_URL_INVALID");
  if (stagingDeclaredRef && !validRef.test(stagingDeclaredRef)) reasons.push("STAGING_SUPABASE_REF_INVALID");
  if (productionDeclaredRef && !validRef.test(productionDeclaredRef)) reasons.push("PRODUCTION_SUPABASE_REF_INVALID");
  if (stagingUrlRef && stagingDeclaredRef && stagingUrlRef !== stagingDeclaredRef) reasons.push("STAGING_SUPABASE_URL_REF_MISMATCH");
  if (productionUrlRef && productionDeclaredRef && productionUrlRef !== productionDeclaredRef) reasons.push("PRODUCTION_SUPABASE_URL_REF_MISMATCH");
  if (stagingUrlRef && productionUrlRef && stagingUrlRef === productionUrlRef) reasons.push("SUPABASE_PROJECT_NOT_SEPARATE");
  if (stagingDeclaredRef && productionDeclaredRef && stagingDeclaredRef === productionDeclaredRef) reasons.push("SUPABASE_PROJECT_NOT_SEPARATE");

  if (normalizedIdentity(input.providerEffects) && normalizedIdentity(input.providerEffects) !== "disabled") {
    reasons.push("PROVIDER_EFFECTS_NOT_DISABLED");
  }
  if (normalizedIdentity(input.schedulerEffects) && normalizedIdentity(input.schedulerEffects) !== "disabled") {
    reasons.push("SCHEDULER_EFFECTS_NOT_DISABLED");
  }

  return Object.freeze({
    status: reasons.length === 0 ? "GO" : "BLOCKED",
    reasons: Object.freeze([...new Set(reasons)]),
  });
}

function parseArgs(argv) {
  const input = {};
  let invalid = false;

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const field = OPTION_TO_FIELD[option];
    const value = argv[index + 1];
    if (!field || value === undefined || value.startsWith("--") || Object.hasOwn(input, field)) {
      invalid = true;
      continue;
    }
    input[field] = value;
    index += 1;
  }

  return { input, invalid };
}

function main() {
  const { input, invalid } = parseArgs(process.argv.slice(2));
  const result = evaluateStagingSandbox(input);
  const reasons = invalid ? [...result.reasons, "INVALID_ARGUMENTS"] : result.reasons;
  const status = reasons.length === 0 ? "GO" : "BLOCKED";
  process.stdout.write(`${JSON.stringify({ status, reasons: [...new Set(reasons)] })}\n`);
  process.exitCode = status === "GO" ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
