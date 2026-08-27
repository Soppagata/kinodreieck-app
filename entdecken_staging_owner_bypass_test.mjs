/* Fokussierter Vertrag fuer den einmaligen providerfreien Staging-Owner-Claim.
   Rein lokal: kein Netzwerk, kein Supabase-Write und kein Anbieter. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "supabase/migrations/20260827190000_entdecken_staging_owner_refresh_bypass.sql";
const migration = readFileSync(path, "utf8");
const code = migration.replace(/^--.*$/gmu, "");
const claim = code.match(
  /create or replace function public\.kd_entdecken_weekly_refresh_claim[\s\S]*?\n\$\$;/u,
)?.[0] || "";
let checks = 0;
function check(name, test) { test(); checks += 1; console.log(`✓ ${name}`); }

check("Forward-Migration ersetzt nur die bestehende Claim-RPC", () => {
  assert.ok(claim);
  assert.equal((code.match(/create or replace function/giu) || []).length, 1);
  assert.doesNotMatch(code, /alter table|create table|drop table|create extension|cron\.|scheduler/iu);
  assert.doesNotMatch(code, /update\s+public\.kd_entdecken_daily_settings/iu);
  assert.doesNotMatch(code, /staging_owner_refresh_override\s*=\s*true/iu);
});

check("Owner braucht exakt den vorhandenen true-Override", () => {
  assert.match(claim, /p_source is null or p_source not in \('scheduled','owner'\)/u);
  assert.match(claim, /staging_owner_refresh_override\s+into v_enabled, v_owner_override/iu);
  assert.match(claim, /p_source = 'owner' and not coalesce\(v_owner_override,false\)[\s\S]*v_status := 'disabled'/u);
  assert.match(claim, /'requestMode',p_source/u);
});

check("Scheduled behaelt das UTC-02-Zeitfenster", () => {
  assert.match(claim, /p_source = 'scheduled' and extract\(hour from v_utc\)::integer <> 2[\s\S]*v_status := 'outside_window'/u);
  assert.doesNotMatch(claim, /p_source = 'owner'[\s\S]{0,100}outside_window/u);
});

check("Beide erlaubten Modi behalten 144h, Lease und genau einen Versuch", () => {
  assert.match(claim, /v_anchor \+ interval '144 hours'/u);
  assert.match(claim, /elsif not v_due then v_status := 'not_due'/u);
  assert.match(claim, /attempt_count = 1/u);
  assert.match(claim, /lease_expires_at = v_now \+ interval '180 seconds'/u);
  assert.match(claim, /'maxAttempts',1/u);
  assert.doesNotMatch(claim, /retry|attempt_count \+ 1|staging_owner_refresh_override\s*=/iu);
});

check("Migration startet und endet fail-closed mit Override false", () => {
  assert.match(migration, /^begin;$/mu);
  assert.match(migration, /^commit;$/mu);
  assert.match(migration, /where singleton and not staging_owner_refresh_override/u);
  assert.match(migration, /revoke all on function public\.kd_entdecken_weekly_refresh_claim\(text\)[\s\S]*from public, anon, authenticated/iu);
  assert.match(migration, /grant execute on function public\.kd_entdecken_weekly_refresh_claim\(text\) to service_role/iu);
});

console.log(`\n${checks}/${checks} Staging-Owner-Bypass-Checks bestanden.`);
