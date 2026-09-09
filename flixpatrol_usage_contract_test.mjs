import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shared = readFileSync("supabase/functions/_shared/flixpatrolClient.js", "utf8");
const core = readFileSync("supabase/functions/flixpatrol-usage/core.js", "utf8");
const entry = readFileSync("supabase/functions/flixpatrol-usage/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260909153000_flixpatrol_usage_ticker.sql", "utf8");
const dataMigration = readFileSync("supabase/migrations/20260909190000_flixpatrol_data_cache.sql", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const docs = readFileSync("docs/FLIXPATROL_TICKER.md", "utf8");

assert.match(shared, /https:\/\/api\.flixpatrol\.com/);
assert.match(shared, /\/v2\/quota/);
assert.match(shared, /redirect: "error"/);
assert.match(shared, /AbortSignal\.timeout\(timeoutMs\)/);
assert.doesNotMatch(shared, /retry|setTimeout|location/i);
assert.ok(shared.indexOf("await beginOperation") < shared.indexOf("await fetchImpl"));

assert.match(entry, /Deno\.env\.get\("FLIXPATROL_API_KEY"\)/);
assert.match(entry, /SUPABASE_SECRET_KEYS/);
assert.match(entry, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(core, /scheduled-daily-v1/);
assert.match(config, /\[functions\.flixpatrol-usage\][\s\S]*?verify_jwt = false/);

assert.match(migration, /^begin;/);
assert.match(migration, /on conflict \(operation_id\) do nothing/);
assert.match(migration, /for update/);
assert.match(migration, /'sinceSetup'/);
assert.match(migration, /'currentUtcMonth'/);
assert.match(migration, /operation\.claimed_at >= m\.starts_at and operation\.claimed_at < m\.ends_at/);
assert.match(migration, /quota_request_started_at/);
assert.match(migration, /v_operation\.claimed_at >= quota_request_started_at/);
assert.match(migration, /force row level security/);
assert.match(migration, /revoke all on table[\s\S]*anon, authenticated, service_role/);
assert.match(migration, /grant select[\s\S]*to service_role/);
assert.doesNotMatch(migration, /title|film|payload\s+(json|jsonb|text)|email|prompt/i);
assert.match(dataMigration, /request_kind in \('quota','top10s','titles'\)/);
assert.match(dataMigration, /create or replace function public\.kd_flixpatrol_usage_begin/);
assert.match(dataMigration, /create or replace function public\.kd_flixpatrol_usage_finish/);
assert.match(dataMigration, /v_operation\.request_kind = 'quota' and p_status = 'succeeded'/);
assert.match(dataMigration, /elsif p_quota is not null then/);
assert.match(dataMigration, /on conflict \(operation_id\) do nothing/);
assert.match(dataMigration, /force row level security/g);
assert.match(dataMigration, /auth\.role\(\) = 'authenticated' and not public\.kd_account_active\(\)/);
assert.match(dataMigration, /grant execute on function public\.kd_flixpatrol_chart_read\(text,text,text\) to authenticated, service_role/);
assert.doesNotMatch(dataMigration, /FLIXPATROL_API_KEY|authorization|password|email|profile|prompt/i);
assert.match(docs, /begin read only;/);
assert.match(docs, /werden nie addiert/);
assert.match(docs, /offene Naht für die spätere Quellenintegration/);

console.log("36 FlixPatrol-Vertragsprüfungen bestanden.");
