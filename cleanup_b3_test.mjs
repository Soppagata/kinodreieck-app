#!/usr/bin/env node
/* Fokussierte, vollständig lokale Vertragschecks für Cleanup-Paket B3. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PRIVATE_OPS_FLAG_MATRICES } from "./tools/private-ops-check.mjs";

const read = (path) => readFileSync(path, "utf8");

test("Entdecken meldet fachliches failed rot, erwartete No-ops bleiben erlaubt", () => {
  const workflow = read(".github/workflows/entdecken-six-day.yml");
  const failedBranch = workflow.match(/failed\)[\s\S]*?;;/)?.[0] || "";
  assert.match(failedBranch, /::error::Entdecken/);
  assert.match(failedBranch, /exit 1/);
  assert.doesNotMatch(failedBranch, /::warning::/);
  for (const code of ["not_due", "outside_window", "in_progress", "held"]) {
    assert.match(workflow, new RegExp(`${code}\\)`));
  }
  assert.equal((workflow.match(/curl[^\n]*--retry/g) || []).length, 0);
});

test("Keep-alive validiert nur den belegten Auth-Health-Vertrag und mutiert nichts", () => {
  const workflow = read(".github/workflows/keepalive.yml");
  assert.match(workflow, /\/auth\/v1\/health/);
  assert.match(workflow, /keys !== "description,name,version"/);
  assert.match(workflow, /http_status" != "200"/);
  assert.match(workflow, /content_type" != application\/json/);
  assert.match(workflow, /--connect-timeout 10/);
  assert.match(workflow, /--max-time 60/);
  assert.doesNotMatch(workflow, /kd_store|kd_catalog|--request\s+(?:POST|PUT|PATCH|DELETE)|\s-X\s/);
  assert.equal((workflow.match(/\bcurl\b/g) || []).length, 1);
});

test("Private Ops bindet exakte, fail-closed ausgewählte Umgebungsmatrizen", () => {
  const privateExpected = {
    provider_requests_enabled: true,
    scheduler_enabled: false,
    purge_enabled: false,
    delete_enabled: false,
    export_enabled: false,
  };
  const radarExpected = {
    radar_aktiv: true,
    radar_shares_aktiv: false,
    radar_provider_aktiv: true,
    radar_scheduler_aktiv: true,
    radar_proposal_import_aktiv: false,
  };
  assert.deepEqual(PRIVATE_OPS_FLAG_MATRICES.staging.privateSettings, privateExpected);
  assert.deepEqual(PRIVATE_OPS_FLAG_MATRICES.staging.radarSettings, radarExpected);
  assert.deepEqual(PRIVATE_OPS_FLAG_MATRICES.production.privateSettings, privateExpected);
  assert.deepEqual(PRIVATE_OPS_FLAG_MATRICES.production.radarSettings, radarExpected);
  assert.ok(Object.isFrozen(PRIVATE_OPS_FLAG_MATRICES));

  const checker = read("tools/private-ops-check.mjs");
  const workflow = read(".github/workflows/private-ops-monitor.yml");
  assert.match(checker, /EXPECTED_MATRIX_NOT_CONFIGURED/);
  assert.match(checker, /FLAG_MATRIX_MISMATCH/);
  assert.match(workflow, /KD_MONITOR_ENVIRONMENT:\s*staging/);
});

test("R-04 verdrahtet höchstens drei serielle Retries ohne Workflow-Retry", () => {
  const core = read("supabase/functions/automatic-ai-check/core.js");
  const runtime = read("supabase/functions/automatic-ai-check/index.ts");
  const workflow = read(".github/workflows/automatic-ai-check.yml");
  assert.match(core, /AUTOMATIC_AI_DRAIN_MAX_JOBS = 3/);
  assert.match(core, /for \(let index = 0; index < maxJobs; index \+= 1\)/);
  assert.match(core, /const response = await createAutomaticAiCheckHandler/);
  assert.equal((runtime.match(/createAutomaticAiDrainHandler\(runtimeDependencies\(\)\)/g) || []).length, 1);
  assert.equal((workflow.match(/\bcurl\b/g) || []).length, 1);
  assert.doesNotMatch(workflow, /seq\s+1\s+5|workflow_dispatch|--retry/);
});

test("Run-Audit deckt alle fünf Workflows und die vier Zustandsklassen ab", () => {
  const audit = read("docs/CLEANUP_RUN_AUDIT_2026-09-04.md");
  for (const name of [
    "Automatic AI six-hour checker",
    "Test and deploy Cloudflare Pages",
    "Entdecken und Radar im Sechs-Tage-Takt",
    "Supabase Keep-alive",
    "Private Ops Monitor",
  ]) assert.match(audit, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const state of ["Erfolg", "No-op", "Warten", "Fehler"]) {
    assert.match(audit, new RegExp(state, "i"));
  }
  assert.match(audit, /WIRKUNGSGESPERRT/);
  assert.match(audit, /kein Workflow gestartet, wiederholt, abgebrochen/);
});
