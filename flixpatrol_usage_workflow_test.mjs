#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  formatiereFlixPatrolUsageSummary,
  pruefeFlixPatrolUsageAntwort,
} from "./tools/flixpatrol-usage.mjs";

const workflow = readFileSync(".github/workflows/flixpatrol-usage.yml", "utf8");
const jobStart = workflow.indexOf("  quota:");
const quotaJob = jobStart >= 0 ? workflow.slice(jobStart) : "";
const runMatch = quotaJob.match(/        run: \|\n([\s\S]*)/u);
const shell = runMatch
  ? runMatch[1].split("\n").map((line) => line.startsWith("          ") ? line.slice(10) : line).join("\n")
  : "";

const validResponse = {
  ok: true,
  providerRequests: 1,
  status: "refreshed",
  usage: {
    sinceSetup: {
      attemptedRequests: 4,
      completedRequests: 4,
      successfulRequests: 3,
      failedRequests: 1,
    },
    currentUtcMonth: { month: "2026-09", attemptedRequests: 4 },
    planLimit: 1000,
    lastStatus: "succeeded",
    lastAttemptAt: "2026-09-09T05:11:00.000Z",
    lastSuccessAt: "2026-09-09T05:11:01.000Z",
    quota: {
      used: 3,
      available: 997,
      limit: 1000,
      limitExtra: 0,
      resetAt: "2026-10-01T00:00:00",
      requestStartedAt: "2026-09-09T05:11:00.000Z",
      observedAt: "2026-09-09T05:11:01.000Z",
    },
  },
};

test("Workflow besitzt genau einen täglichen natürlichen Einstieg", () => {
  assert.match(workflow, /^name: FlixPatrol – Nutzung täglich erfassen$/mu);
  assert.deepEqual([...workflow.matchAll(/cron:\s*"([^"]+)"/gu)].map((match) => match[1]), ["11 5 * * *"]);
  assert.doesNotMatch(workflow, /workflow_dispatch|push:|pull_request:/u);
  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.match(quotaJob, /^    environment: staging$/mu);
  assert.match(workflow, /group: kinodreieck-flixpatrol-usage[\s\S]*?cancel-in-progress: false/u);
  assert.equal(Math.max(...Array.from({ length: 12 }, (_, month) => (
    new Date(Date.UTC(2026, month + 1, 0)).getUTCDate()
  ))), 31);
});

test("Ein Lauf startet genau einen bodylosen, retryfreien Quota-Abgleich", () => {
  assert.equal((shell.match(/^\s*curl\b/gmu) || []).length, 1);
  assert.match(shell, /--request POST/u);
  assert.match(shell, /\/functions\/v1\/flixpatrol-usage/u);
  assert.match(shell, /x-kd-flixpatrol-usage: scheduled-daily-v1/u);
  assert.match(shell, /--connect-timeout 10/u);
  assert.match(shell, /--max-time 60/u);
  assert.doesNotMatch(shell, /--data|--form|--retry|--location|\b(for|while|until)\b/u);
  assert.match(quotaJob, /timeout-minutes: 3/u);
});

test("Workflow bindet nur die belegte Staging-Konfiguration und hält den Provider-Key serverseitig", () => {
  assert.match(quotaJob, /SUPABASE_URL:\s*\$\{\{ vars\.SUPABASE_URL \}\}/u);
  assert.match(quotaJob, /SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/u);
  assert.match(shell, /case "\$SUPABASE_SERVICE_ROLE_KEY"[\s\S]*?sb_secret_\*/u);
  assert.match(shell, /--header "apikey: \$\{SUPABASE_SERVICE_ROLE_KEY\}"/u);
  assert.match(shell, /--header "Authorization: Bearer \$\{SUPABASE_SERVICE_ROLE_KEY\}"/u);
  assert.doesNotMatch(workflow, /FLIXPATROL_API_KEY|FLIXPATROL_KEY|secrets\.VITE_|SUPABASE_ANON/u);
});

test("Transport, HTTP, Content-Type und Antwortvertrag bleiben klare rote Fehler", () => {
  assert.match(shell, /if ! response_meta=/u);
  assert.match(shell, /http_status" != "200"/u);
  assert.match(shell, /content_type" != application\/json\*/u);
  assert.match(shell, /if ! node tools\/flixpatrol-usage\.mjs/u);
  assert.equal((shell.match(/exit 1/g) || []).length, 1);
  assert.match(shell, /::error title=FlixPatrol-Nutzung/u);
  assert.match(shell, /GITHUB_STEP_SUMMARY/u);
  assert.doesNotMatch(shell, /\bcat\b|tee|continue-on-error/u);
});

test("Workflow-Shell ist syntaktisch gültig", () => {
  assert.ok(shell);
  assert.equal(spawnSync("bash", ["-n"], { input: shell }).status, 0);
});

test("Zählerparser trennt eigene Monatszählung vom offiziellen Quota-Snapshot", () => {
  const parsed = pruefeFlixPatrolUsageAntwort(validResponse);
  assert.deepEqual(parsed, {
    attemptedRequestsSinceSetup: 4,
    completedRequestsSinceSetup: 4,
    successfulRequestsSinceSetup: 3,
    failedRequestsSinceSetup: 1,
    currentUtcMonth: "2026-09",
    currentMonthAttemptedRequests: 4,
    providerUsed: 3,
    providerAvailable: 997,
    providerLimit: 1000,
    providerLimitExtra: 0,
    providerResetAt: "2026-10-01T00:00:00",
    providerObservedAt: "2026-09-09T05:11:01.000Z",
  });
  const summary = formatiereFlixPatrolUsageSummary(parsed);
  assert.match(summary, /aktueller UTC-Monat 2026-09: 4 eigene Requests begonnen/u);
  assert.match(summary, /offizieller Snapshot: 3 verwendet, 997 verfügbar/u);
  assert.match(summary, /getrennte Messwerte und werden nicht addiert/u);
});

test("Parser verwirft ungezählte, mehrdeutige und unvollständige Erfolge", () => {
  assert.equal(pruefeFlixPatrolUsageAntwort({ ...validResponse, providerRequests: 0 }), null);
  assert.equal(pruefeFlixPatrolUsageAntwort({
    ...validResponse,
    usage: { ...validResponse.usage, lastStatus: "claimed" },
  }), null);
  assert.equal(pruefeFlixPatrolUsageAntwort({
    ...validResponse,
    usage: {
      ...validResponse.usage,
      sinceSetup: { ...validResponse.usage.sinceSetup, completedRequests: 3 },
    },
  }), null);
  assert.equal(pruefeFlixPatrolUsageAntwort({
    ...validResponse,
    usage: { ...validResponse.usage, quota: { ...validResponse.usage.quota, available: -1 } },
  }), null);
});

test("CLI schreibt nur den validierten Bericht und leakt keine Antwortpayload", () => {
  const directory = mkdtempSync(join(tmpdir(), "kd-flixpatrol-workflow-test-"));
  try {
    const validPath = join(directory, "valid.json");
    const invalidPath = join(directory, "invalid.json");
    writeFileSync(validPath, JSON.stringify(validResponse));
    writeFileSync(invalidPath, JSON.stringify({ secret: "DARF_NICHT_IN_AUSGABE" }));
    const valid = spawnSync(process.execPath, ["tools/flixpatrol-usage.mjs", validPath], { encoding: "utf8" });
    const invalid = spawnSync(process.execPath, ["tools/flixpatrol-usage.mjs", invalidPath], { encoding: "utf8" });
    assert.equal(valid.status, 0);
    assert.match(valid.stdout, /FlixPatrol-Nutzung: OK/u);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /^FLIXPATROL_RESPONSE_INVALID_CONTRACT\n$/u);
    assert.doesNotMatch(`${invalid.stdout}${invalid.stderr}`, /DARF_NICHT_IN_AUSGABE/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
