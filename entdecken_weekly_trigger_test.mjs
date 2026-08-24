/* Vertrag fuer den wiederkehrenden, providerpotenziellen Entdecken-POST.
   Rein statisch/lokal: kein Netzwerk, kein GitHub-Lauf, kein Anbieter. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS,
  ENTDECKEN_WEEKLY_REFRESH_MIN_ITEMS,
} from "./supabase/functions/entdecken-daily-task/contract.js";

let checks = 0;
function check(name, test) {
  test();
  checks += 1;
  console.log(`✓ ${name}`);
}

const workflow = readFileSync(".github/workflows/keepalive.yml", "utf8");
const hostingDoc = readFileSync("docs/ETAPPE_2_HOSTING.md", "utf8");
const weeklyClaimSql = readFileSync(
  "supabase/migrations/20260824140000_entdecken_weekly_refresh_lease.sql",
  "utf8",
);
const weeklySaveSql = readFileSync(
  "supabase/migrations/20260824120000_entdecken_weekly_live_proof.sql",
  "utf8",
);

const scheduleBlock = workflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1] || "";
const cronExpressions = [...scheduleBlock.matchAll(/cron:\s*["']([^"']+)["']/g)]
  .map((match) => match[1]);
const triggerJob = workflow.match(/^  entdecken-weekly-trigger:\n([\s\S]*?)\n  [a-z][a-z0-9-]+:\n/m)?.[0]
  || workflow.match(/^  entdecken-weekly-trigger:\n[\s\S]*$/m)?.[0]
  || "";
const stepStart = workflow.indexOf("      - name: Entdecken-Wochenfeed planmaessig anstossen");
const nextStep = workflow.indexOf("\n      - name:", stepStart + 1);
const triggerStep = stepStart < 0 ? "" : workflow.slice(
  stepStart,
  nextStep < 0 ? workflow.length : nextStep,
);
const triggerShell = (triggerStep.match(/\n        run: \|\n([\s\S]*)$/)?.[1] || "")
  .replace(/^          /gm, "");
const responseParser = triggerShell.match(/node -e '\n([\s\S]*?)\n\s*' "\$response_file"/)?.[1] || "";

function runResponseParser(rawBody) {
  const tempDir = mkdtempSync(join(tmpdir(), "kd-entdecken-trigger-"));
  const responseFile = join(tempDir, "response.json");
  try {
    writeFileSync(responseFile, rawBody, { encoding: "utf8", mode: 0o600 });
    return spawnSync(process.execPath, ["-e", responseParser, responseFile], { encoding: "utf8" });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function fieldMatches(value, expression, minimum, maximum) {
  return expression.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step <= 0) return false;
    let start;
    let end;
    if (range === "*") [start, end] = [minimum, maximum];
    else if (/^\d+$/.test(range)) start = end = Number(range);
    else {
      const match = range.match(/^(\d+)-(\d+)$/);
      if (!match) return false;
      [, start, end] = match.map(Number);
    }
    return value >= start && value <= end && (value - start) % step === 0;
  });
}

function cronMatchesDay(expression, date) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/);
  if ([minute, hour, dayOfMonth, month, dayOfWeek].some((field) => field === undefined)) return false;
  if (!fieldMatches(date.getUTCMinutes(), minute, 0, 59)
      || !fieldMatches(date.getUTCHours(), hour, 0, 23)
      || !fieldMatches(date.getUTCMonth() + 1, month, 1, 12)) return false;
  const domMatches = fieldMatches(date.getUTCDate(), dayOfMonth, 1, 31);
  const dowMatches = fieldMatches(date.getUTCDay(), dayOfWeek.replaceAll("7", "0"), 0, 6);
  return dayOfMonth === "*" ? dowMatches : dayOfWeek === "*" ? domMatches : domMatches || dowMatches;
}

function scheduledAttempts(expressions) {
  const attempts = new Set();
  const start = Date.UTC(2024, 0, 1);
  const end = Date.UTC(2033, 0, 8);
  for (let timestamp = start; timestamp <= end; timestamp += 24 * 60 * 60 * 1000) {
    for (const expression of expressions) {
      const [minute, hour] = expression.split(/\s+/).map(Number);
      const candidate = new Date(timestamp + hour * 60 * 60 * 1000 + minute * 60 * 1000);
      if (cronMatchesDay(expression, candidate)) attempts.add(candidate.getTime());
    }
  }
  return [...attempts].sort((a, b) => a - b);
}

check("Cron garantiert in jedem Kalenderabschnitt mindestens einen Versuch je sieben Tage", () => {
  assert.deepEqual(cronExpressions, ["17 6 */3 * *"]);
  const attempts = scheduledAttempts(cronExpressions);
  assert.ok(attempts.length > 1_000);
  const largestGapDays = Math.max(...attempts.slice(1).map((value, index) => (
    (value - attempts[index]) / (24 * 60 * 60 * 1000)
  )));
  assert.ok(largestGapDays <= 7, `groesste Cron-Luecke: ${largestGapDays} Tage`);
});

check("Providerpotenzieller Step laeuft ausschliesslich im schedule-Event", () => {
  assert.match(triggerJob, /^  entdecken-weekly-trigger:\n\s+if:\s*\$\{\{\s*github\.event_name\s*==\s*'schedule'\s*\}\}/);
  assert.doesNotMatch(triggerJob, /needs:\s*ping/);
  assert.ok(triggerStep);
  assert.match(triggerStep, /if:\s*\$\{\{\s*github\.event_name\s*==\s*'schedule'\s*\}\}/);
  assert.doesNotMatch(triggerStep, /workflow_dispatch|staging|github\.ref/);
});

check("Step sendet exakt einen retryfreien, nicht umgeleiteten Refresh-POST", () => {
  assert.equal((triggerStep.match(/^\s*curl\b/gm) || []).length, 1);
  assert.match(triggerStep, /--request POST/);
  assert.match(triggerStep, /--header "x-kd-entdecken-refresh: scheduled-v1"/);
  assert.doesNotMatch(triggerStep, /--retry|--location|\bcurl\s+[^\n]*\bcurl\b|\b(for|while|until)\b/);
});

check("Workflow-Shell und eingebetteter JSON-Parser sind syntaktisch gueltig", () => {
  assert.ok(triggerShell);
  assert.equal(spawnSync("bash", ["-n"], { input: triggerShell }).status, 0);
  assert.ok(responseParser);
  assert.equal(spawnSync(process.execPath, ["--check", "-"], { input: responseParser }).status, 0);
});

check("POST und gesamter Job besitzen harte kurze Zeitgrenzen", () => {
  const connectSeconds = Number(triggerStep.match(/--connect-timeout\s+(\d+)/)?.[1]);
  const maxSeconds = Number(triggerStep.match(/--max-time\s+(\d+)/)?.[1]);
  const stepMinutes = Number(triggerStep.match(/timeout-minutes:\s*(\d+)/)?.[1]);
  assert.ok(connectSeconds > 0 && connectSeconds <= 15);
  assert.ok(maxSeconds >= 135 && maxSeconds <= 150);
  assert.ok(stepMinutes > 0 && stepMinutes <= 3);
  assert.match(workflow, /jobs:\n\s+ping:[\s\S]*?timeout-minutes:\s*5/);
});

check("Function-URL und Scheduler-Credentials bleiben im Secret und nicht im Payload", () => {
  assert.match(triggerStep, /SUPABASE_URL:\s*\$\{\{\s*vars\.SUPABASE_URL\s*\}\}/);
  assert.match(triggerStep, /SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{\s*secrets\.SUPABASE_SERVICE_ROLE_KEY\s*\}\}/);
  assert.match(triggerStep, /"\$\{SUPABASE_URL%\/\}\/functions\/v1\/entdecken-daily-task"/);
  assert.match(triggerStep, /--header "apikey: \$\{SUPABASE_SERVICE_ROLE_KEY\}"/);
  assert.match(triggerStep, /--header "Authorization: Bearer \$\{SUPABASE_SERVICE_ROLE_KEY\}"/);
  assert.match(triggerStep, /x-kd-entdecken-refresh: scheduled-v1/);
  assert.doesNotMatch(triggerStep, /SUPABASE_PUBLISHABLE_KEY|ANTHROPIC|x-kd-entdecken-recovery|https:\/\/[^\s"']+\.supabase\.co|set\s+-x|printenv/);
});

check("Antwortpfad trennt Refresh, Claimzustaende und Fehler ohne Payload-Log", () => {
  for (const outcome of ["refreshed", "already_fresh", "in_progress", "cooldown", "exhausted", "failed"]) {
    assert.match(triggerStep, new RegExp(outcome));
  }
  assert.match(triggerStep, /body\.ok !== true/);
  assert.match(triggerStep, /application\/json/);
  assert.match(triggerStep, /::warning::[\s\S]*degraded; kein Retry/);
  assert.match(triggerStep, /::error::Entdecken-Wochenfeed lieferte keinen gueltigen Produktvertrag/);
  assert.doesNotMatch(triggerStep, /cat\s+"?\$response_file|console\.log\(body|JSON\.stringify\(body/);
});

check("JSON-Parser klassifiziert Refresh, Hold und Fehler und verwirft HTML/Authvertraege", () => {
  const refreshed = runResponseParser(JSON.stringify({
    ok: true, status: "fresh", responseMode: "structured", providerRequests: 1,
    searchRequests: 1, writes: 1,
    refresh: { requested: true, mode: "scheduled", status: "refreshed", attemptCount: 2, maxAttempts: 3 },
  }));
  const claimHeld = runResponseParser(JSON.stringify({
    ok: true, status: "stale", responseMode: "structured", providerRequests: 0,
    searchRequests: 0, writes: 0,
    refresh: { requested: true, mode: "scheduled", status: "cooldown", attemptCount: 1, maxAttempts: 3 },
  }));
  const degraded = runResponseParser(JSON.stringify({
    ok: true, status: "empty", responseMode: "degraded", providerRequests: 1,
    searchRequests: 1, writes: 0,
    refresh: { requested: true, mode: "scheduled", status: "failed", attemptCount: 1, maxAttempts: 3 },
  }));
  assert.deepEqual([refreshed.status, refreshed.stdout], [0, "refreshed"]);
  assert.deepEqual([claimHeld.status, claimHeld.stdout], [0, "cooldown"]);
  assert.deepEqual([degraded.status, degraded.stdout], [0, "failed"]);
  assert.notEqual(runResponseParser("<!doctype html><title>Login</title>").status, 0);
  assert.notEqual(runResponseParser(JSON.stringify({
    ok: false, status: "disabled", responseMode: "structured", providerRequests: 0, writes: 0,
  })).status, 0);
});

check("DB bleibt alleiniger Wochenzaun; GET ist read-only und Scheduled nutzt den expliziten Claim", () => {
  assert.match(weeklyClaimSql, /create function public\.kd_entdecken_weekly_feed_status\(\)[\s\S]*?stable/);
  assert.match(weeklyClaimSql, /create function public\.kd_entdecken_weekly_refresh_claim/);
  assert.match(weeklyClaimSql, /v_feed\.refreshed_iso_week = v_iso_week/);
  assert.match(weeklyClaimSql, /v_attempt_count >= 3/);
  assert.match(weeklyClaimSql, /for update/);
  assert.match(weeklyClaimSql, /kd_entdecken_daily_claim\(\)[\s\S]*kd_entdecken_weekly_feed_status\(\)/);
  assert.doesNotMatch(triggerStep, /x-kd-entdecken-recovery|owner-once-v1/i);
});

check("Wochenfeed bleibt auf exakt fuenf bis sieben gespeicherte Titel begrenzt", () => {
  assert.equal(ENTDECKEN_WEEKLY_REFRESH_MIN_ITEMS, 5);
  assert.equal(ENTDECKEN_WEEKLY_REFRESH_MAX_ITEMS, 7);
  assert.match(weeklySaveSql, /if v_count < 5 or v_count > 7 then/);
  assert.match(weeklySaveSql, /p_payload->>'isoWeek' is distinct from v_iso_week/);
});

check("Doku nennt die Default-Branch-Aktivierungsgrenze", () => {
  assert.match(hostingDoc, /erst nach Aufnahme in den GitHub-Default-Branch/);
  assert.match(hostingDoc, /Staging- oder Feature-Branch[^.]*keinen Zeitplan automatisch/);
  assert.match(hostingDoc, /workflow_dispatch[^.]*Entdecken-Step[^.]*nicht/);
});

console.log(`\n${checks}/${checks} Entdecken-Wochentrigger-Vertragschecks bestanden.`);
