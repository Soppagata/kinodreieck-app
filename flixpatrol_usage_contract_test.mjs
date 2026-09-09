import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shared = readFileSync("supabase/functions/_shared/flixpatrolClient.js", "utf8");
const core = readFileSync("supabase/functions/flixpatrol-usage/core.js", "utf8");
const entry = readFileSync("supabase/functions/flixpatrol-usage/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260909153000_flixpatrol_usage_ticker.sql", "utf8");
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
assert.match(docs, /begin read only;/);
assert.match(docs, /werden nie addiert/);
assert.match(docs, /offene Naht für die spätere Quellenintegration/);

console.log("26 FlixPatrol-Vertragsprüfungen bestanden.");
