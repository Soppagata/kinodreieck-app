/* E13-001: execute the unchanged Core and the actual workflow shell with a
   local curl function returning synthetic JSON; no request leaves the process. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAutomaticAiDrainHandler } from "./supabase/functions/automatic-ai-check/core.js";

const workflow = readFileSync(".github/workflows/automatic-ai-check.yml", "utf8");
const shell = workflow.slice(workflow.indexOf("          set -euo pipefail"))
  .split("\n").map((line) => line.replace(/^ {10}/, "")).join("\n");
function runWorkflow(body) {
  const dir = mkdtempSync(join(tmpdir(), "kd-p12-workflow-"));
  const response = join(dir, "input.json");
  const summary = join(dir, "summary.md");
  writeFileSync(response, JSON.stringify(body));
  writeFileSync(summary, "");
  try {
    const result = spawnSync("/bin/bash", ["-c", `
      curl() {
        local target=""
        while [ "$#" -gt 0 ]; do
          if [ "$1" = "--output" ]; then target="$2"; shift; fi
          shift
        done
        cp "$P12_RESPONSE" "$target"
        printf '200 application/json'
      }
      ${shell}
    `], {
      encoding: "utf8",
      env: { PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf("/"))}:/usr/bin:/bin`,
        SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_RADAR_SCHEDULER: "sb_secret_synthetic",
        P12_RESPONSE: response, GITHUB_STEP_SUMMARY: summary },
    });
    return { ...result, summary: readFileSync(summary, "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

let coreBody;
test("E13-001: a job due after an idle claim reaches the actual backlog warning with lag zero", async () => {
  let now = Date.parse("2026-09-17T12:37:00.000Z");
  const dueAt = now + 100;
  const calls = [];
  const forbiddenEffect = async () => { assert.fail("No provider, mail or settlement effect allowed"); };
  const handler = createAutomaticAiDrainHandler({
    serviceKeys: ["sb_secret_synthetic"],
    claimDue: async () => {
      calls.push("claimDue");
      assert.ok(now < dueAt);
      now += 200;
      return { claim: false, status: "idle" };
    },
    inspectBacklog: async ({ asOf }) => {
      calls.push("inspectBacklog");
      assert.ok(Date.parse(asOf) >= dueAt);
      return { remainingDueJobs: 1, oldestDueAt: new Date(dueAt).toISOString() };
    },
    invokeRadar: forbiddenEffect, finishRetry: forbiddenEffect, claimMail: forbiddenEffect,
    sendOperationalMail: forbiddenEffect, finishMail: forbiddenEffect, randomUUID: forbiddenEffect,
  }, { nowMs: () => now });
  const response = await handler(new Request("https://synthetic.invalid/check", {
    method: "POST", headers: { apikey: "sb_secret_synthetic", "x-kd-automatic-check": "scheduled-v1" },
  }));
  assert.equal(response.status, 200);
  coreBody = await response.json();
  assert.deepEqual(coreBody, { ok: true, code: "backlog", processedJobs: 0,
    initialSucceededJobs: 0, retryFinishedJobs: 0, remainingDueJobs: 1,
    oldestLagSeconds: 0, stopReason: "idle", maxJobs: 3, timeBudgetMs: 225000 });
  assert.deepEqual(calls, ["claimDue", "inspectBacklog"]);
  const result = runWorkflow(coreBody);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::warning title=Automatic AI: Rückstand::/);
  assert.match(result.summary, /## Automatic AI: Rückstand/);
  assert.doesNotMatch(result.stdout, /keinen gültigen Antwortvertrag/);
});

test("E13-001: inconsistent states, counters, extras and limits remain fail-closed", () => {
  for (const patch of [
    { code: "idle" }, { code: "drained" }, { remainingDueJobs: 0, oldestLagSeconds: null },
    { oldestLagSeconds: null }, { oldestLagSeconds: -1 }, { oldestLagSeconds: 0.1 },
    { remainingDueJobs: 1000001 }, { remainingDueJobs: "1" },
    { processedJobs: 1 }, { initialSucceededJobs: 1 }, { retryFinishedJobs: 1 },
    { processedJobs: 4, initialSucceededJobs: 4 }, { extra: true },
    { maxJobs: 4 }, { timeBudgetMs: 225001 }, { stopReason: "unexpected" },
  ]) {
    const result = runWorkflow({ ...coreBody, ...patch });
    assert.notEqual(result.status, 0, JSON.stringify(patch));
    assert.match(result.stdout, /keinen gültigen Antwortvertrag/);
    assert.doesNotMatch(result.stdout, /::warning/);
  }
});
