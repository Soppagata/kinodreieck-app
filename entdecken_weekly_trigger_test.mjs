/* Providerfreier Sechs-Tage-Trigger: rein statischer/lokaler Vertragstest.
   Kein Netzwerk, kein GitHub-Lauf, kein Supabase-Write und kein Anbieter. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let checks = 0;
function check(name, test) { test(); checks += 1; console.log(`✓ ${name}`); }

const workflow = readFileSync(".github/workflows/entdecken-six-day.yml", "utf8");
const keepalive = readFileSync(".github/workflows/keepalive.yml", "utf8");
const hostingDoc = readFileSync("docs/ETAPPE_2_HOSTING.md", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260827140000_entdecken_public_six_day_pool.sql", "utf8",
);
const mixedPoolMigration = readFileSync(
  "supabase/migrations/20260828180000_entdecken_mixed_pool_format_6.sql", "utf8",
);
const forbiddenDiversePoolMigration =
  "supabase/migrations/20260828233000_entdecken_current_diverse_pool.sql";
const scheduleBlock = workflow.match(/^on:\n([\s\S]*?)^permissions:/m)?.[1] || "";
const cronExpressions = [...scheduleBlock.matchAll(/cron:\s*["']([^"']+)["']/g)].map((match) => match[1]);
const stepStart = workflow.indexOf("      - name: Entdecken um 02 Uhr UTC");
const triggerStep = stepStart < 0 ? "" : workflow.slice(stepStart);
const triggerShell = (triggerStep.match(/\n        run: \|\n([\s\S]*)$/)?.[1] || "").replace(/^          /gm, "");
const responseParser = triggerShell.match(/node -e '\n([\s\S]*?)\n\s*' "\$response_file"/)?.[1] || "";

function runResponseParser(rawBody) {
  const dir = mkdtempSync(join(tmpdir(), "kd-entdecken-six-day-trigger-"));
  const file = join(dir, "response.json");
  try {
    writeFileSync(file, rawBody, { encoding: "utf8", mode: 0o600 });
    return spawnSync(process.execPath, ["-e", responseParser, file], { encoding: "utf8" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

check("Eigener Trigger laeuft taeglich um 02:00 UTC ohne manuellen Einstieg", () => {
  assert.deepEqual(cronExpressions, ["0 2 * * *"]);
  assert.doesNotMatch(scheduleBlock, /timezone|workflow_dispatch/u);
  assert.doesNotMatch(keepalive, /entdecken|SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(workflow, /^jobs:\n  entdecken-six-day-trigger:/m);
});

check("02:00 UTC entspricht 03:00 CET und 04:00 CEST", () => {
  const viennaHour = (instant) => new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant)).find((part) => part.type === "hour")?.value;
  assert.equal(viennaHour("2026-01-15T02:00:00.000Z"), "03");
  assert.equal(viennaHour("2026-07-15T02:00:00.000Z"), "04");
});

check("Step sendet exakt einen retryfreien und nicht umgeleiteten POST", () => {
  assert.ok(triggerStep);
  assert.equal((triggerStep.match(/^\s*curl\b/gm) || []).length, 1);
  assert.match(triggerStep, /--request POST/u);
  assert.match(triggerStep, /x-kd-entdecken-refresh: scheduled-v1/u);
  assert.doesNotMatch(triggerStep, /--retry|--location|\b(for|while|until)\b/u);
  assert.match(triggerStep, /--connect-timeout 10/u);
  assert.match(triggerStep, /--max-time 150/u);
  assert.match(workflow, /timeout-minutes: 3/u);
});

check("Workflow-Shell und eingebetteter Parser sind syntaktisch gueltig", () => {
  assert.ok(triggerShell && responseParser);
  assert.equal(spawnSync("bash", ["-n"], { input: triggerShell }).status, 0);
  assert.equal(spawnSync(process.execPath, ["--check", "-"], { input: responseParser }).status, 0);
});

check("Parser akzeptiert nur providerfreie Refresh-/Haltezustaende", () => {
  const common = {
    ok: true, status: "fresh", responseMode: "structured",
    providerRequests: 0, searchRequests: 0, sourceRequests: 0,
    wikidataRequests: 0, writes: 0,
  };
  const refreshed = runResponseParser(JSON.stringify({
    ...common, sourceRequests: 2, wikidataRequests: 17, writes: 1,
    refresh: { requested: true, mode: "scheduled", status: "refreshed", attemptCount: 1, maxAttempts: 1 },
  }));
  const notDue = runResponseParser(JSON.stringify({
    ...common,
    refresh: { requested: true, mode: "scheduled", status: "not_due", attemptCount: 0, maxAttempts: 1 },
  }));
  const failed = runResponseParser(JSON.stringify({
    ...common, status: "stale", responseMode: "degraded", sourceRequests: 1,
    refresh: { requested: true, mode: "scheduled", status: "failed", attemptCount: 1, maxAttempts: 1 },
  }));
  assert.deepEqual([refreshed.status, refreshed.stdout], [0, "refreshed"]);
  assert.deepEqual([notDue.status, notDue.stdout], [0, "not_due"]);
  assert.deepEqual([failed.status, failed.stdout], [0, "failed"]);
  assert.notEqual(runResponseParser(JSON.stringify({
    ...common, providerRequests: 1,
    refresh: { requested: true, mode: "scheduled", status: "not_due", attemptCount: 0, maxAttempts: 1 },
  })).status, 0);
  assert.notEqual(runResponseParser("<!doctype html><title>Login</title>").status, 0);
});

check("Atomarer DB-Zaun nutzt exakt 144 Stunden und einen Versuch", () => {
  assert.match(migration, /for update/iu);
  assert.match(migration, /v_anchor \+ interval '144 hours'/u);
  assert.match(migration, /extract\(hour from v_utc\)::integer <> 2/u);
  assert.match(migration, /'maxAttempts',1/u);
  assert.match(migration, /last_success_at/u);
  assert.match(migration, /last_public_attempt_at/u);
  assert.doesNotMatch(migration.match(/create or replace function public\.kd_entdecken_weekly_refresh_claim[\s\S]*?\n\$\$;/u)?.[0] || "", /cooldown|failed_retry|abandoned_retry|attempt_count \+ 1/u);
  const plus144 = (instant) => new Date(new Date(instant).getTime() + 144 * 60 * 60 * 1000).toISOString();
  assert.equal(plus144("2026-08-28T02:00:00.000Z"), "2026-09-03T02:00:00.000Z");
  assert.equal(plus144("2026-03-27T02:00:00.000Z"), "2026-04-02T02:00:00.000Z");
  assert.equal(plus144("2026-10-23T02:00:00.000Z"), "2026-10-29T02:00:00.000Z");
});

check("Format 5, owner_private Quelle und Cache sind DB-seitig fail-closed", () => {
  assert.match(migration, /'chart:joyn-at', 'joyn.at'/u);
  assert.match(migration, /'owner_private'/u);
  assert.match(migration, /provider_enabled = false/u);
  assert.match(migration, /commercial_enabled = false/u);
  assert.match(migration, /jsonb_array_length\(p_payload->'items'\) is distinct from 50/u);
  for (const field of [
    "title", "sourceItemId", "mediaType", "genres", "licenseTypes",
    "sourcePosition", "listDate", "sourceUrl", "fetchedAt",
  ]) assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /create table public\.kd_entdecken_wikidata_cache/u);
  assert.match(migration, /'resolved','not_found','ambiguous_blocked','incomplete_blocked'/u);
  assert.match(migration, /force row level security/u);
  assert.match(migration, /create function public\.kd_entdecken_public_feed_readback/u);
});

check("Historische Format-6-Migration bleibt als additiver 50er-Marktmix belegt", () => {
  assert.match(mixedPoolMigration, /^begin;$/mu);
  assert.match(mixedPoolMigration, /^commit;$/mu);
  assert.match(mixedPoolMigration, /rename to kd_entdecken_public_payload_valid_v5/u);
  assert.match(mixedPoolMigration, /create function public\.kd_entdecken_public_payload_valid_v6/u);
  assert.match(mixedPoolMigration, /when '6' then public\.kd_entdecken_public_payload_valid_v6/u);
  assert.match(mixedPoolMigration, /when '5' then public\.kd_entdecken_public_payload_valid_v5/u);
  assert.match(mixedPoolMigration, /jsonb_array_length\(p_payload->'items'\) is distinct from 50/u);
  assert.match(mixedPoolMigration, /v_cinema is distinct from 15/u);
  assert.match(mixedPoolMigration, /v_streaming_film is distinct from 18/u);
  assert.match(mixedPoolMigration, /v_streaming_series is distinct from 17/u);
  assert.match(mixedPoolMigration, /'chart:joyn-at','chart:oefi-weekend-at'/u);
  assert.match(mixedPoolMigration, /p_source = 'owner' and not coalesce\(v_owner_override,false\)/u);
  assert.match(mixedPoolMigration, /p_source = 'scheduled' and not v_due/u);
  assert.match(mixedPoolMigration, /not provider_enabled and not commercial_enabled/u);
  assert.doesNotMatch(mixedPoolMigration, /cron\.schedule|radar-websearch-task|ANTHROPIC_API_KEY/u);
});

check("Verbotene 25er-Forward-Migration bleibt aus dem Kandidaten entfernt", () => {
  assert.equal(existsSync(forbiddenDiversePoolMigration), false);
});

check("Fehlerpfad behaelt Payload und verbrauchten Versuch ohne Retry", () => {
  const failFunction = migration.match(/create or replace function public\.kd_entdecken_daily_fail[\s\S]*?\n\$\$;/u)?.[0] || "";
  assert.match(failFunction, /status = 'error'/u);
  assert.match(failFunction, /last_failure_at = clock_timestamp\(\)/u);
  assert.doesNotMatch(failFunction, /payload\s*=|last_public_attempt_at\s*=\s*null/u);
});

check("Secrets bleiben Headerwerte und Antworten werden nie ausgegeben", () => {
  assert.match(triggerStep, /SUPABASE_URL:\s*\$\{\{ vars\.SUPABASE_URL \}\}/u);
  assert.match(triggerStep, /SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/u);
  assert.match(triggerStep, /Authorization: Bearer \$\{SUPABASE_SERVICE_ROLE_KEY\}/u);
  assert.doesNotMatch(triggerStep, /ANTHROPIC|cat\s+"?\$response_file|console\.log\(body|JSON\.stringify\(body/u);
});

check("Doku trennt lokale Vorbereitung von Default-Branch-Aktivierung", () => {
  assert.match(hostingDoc, /erst nach Aufnahme in den GitHub-Default-Branch/u);
  assert.match(hostingDoc, /Feature-Branch[^.]*keinen Zeitplan automatisch/u);
  assert.match(hostingDoc, /[Pp]roviderfrei/u);
});

console.log(`\n${checks}/${checks} Entdecken-Sechs-Tage-Triggerchecks bestanden.`);
