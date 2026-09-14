/* Reale lokale PostgreSQL-Probe für Allowlist und RLS des persönlichen Topfs. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const required = ["initdb", "pg_ctl", "postgres", "psql"];
const candidates = [
  process.env.KD_TEST_PG_BIN,
  configured.status === 0 ? configured.stdout.trim() : null,
  "/Applications/Postgres.app/Contents/Versions/17/bin",
  "/usr/lib/postgresql/17/bin",
  "/usr/lib/postgresql/16/bin",
].filter(Boolean);
const PG = [...new Set(candidates)].find((directory) => (
  required.every((binary) => existsSync(join(directory, binary)))
));
assert.ok(PG, "Local PostgreSQL server binaries are required; set KD_TEST_PG_BIN if needed");
const root = mkdtempSync("/private/tmp/kd-pins-pg-");
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket);
let running = false;
function run(binary, args, input, allowFailure = false) {
  const result = spawnSync(join(PG, binary), args, {
    input, encoding: "utf8", timeout: 60_000, maxBuffer: 8_000_000,
    env: { PATH: `${PG}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" },
  });
  if (!allowFailure && result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result;
}
function sql(query, allowFailure = false) {
  return run("psql", ["-h", socket, "-p", "65451", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"], query, allowFailure);
}
const a = "a2000000-0000-4000-8000-000000000001";
const b = "a2000000-0000-4000-8000-000000000002";
const claim = (id, query) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${id}',true); select set_config('request.jwt.claim.role','authenticated',true); ${query}; commit;`).stdout.trim().split("\n").at(-1);
try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options", `-c listen_addresses= -c unix_socket_directories=${socket} -p 65451 -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`, "--wait", "start"]);
  running = true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth,extensions to anon,authenticated,service_role;`);
  sql(readFileSync("supabase/current_schema.sql", "utf8"));
  sql(readFileSync("supabase/migrations/20260914230000_entdecken_pins_personal.sql", "utf8"));
  sql(`insert into auth.users(id) values ('${a}'),('${b}');
    insert into public.kd_account_access(account_id,role,active,personal_ai) values
      ('${a}','member',true,true),('${b}','member',true,true);`);
  const value = JSON.stringify({ format: "kd-entdecken-pins-v1", owner: `account:${a}`, epoch: 7, pins: [] }).replaceAll("'", "''");
  claim(a, `insert into public.kd_personal(key,value) values ('kd:entdecken-pins','${value}');`);
  assert.equal(claim(a, "select count(*) from public.kd_personal where key='kd:entdecken-pins';"), "1");
  assert.equal(claim(b, "select count(*) from public.kd_personal where key='kd:entdecken-pins';"), "0");
  const bad = sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${a}',true);
    insert into public.kd_personal(key,value) values ('kd:boeser-topf','[]'); commit;`, true);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /kd_personal_key_erlaubt|check constraint/i);
  console.log("✓ Authentifiziertes Mitglied kann den neuen eigenen Titel-Pin-Topf schreiben und lesen");
  console.log("✓ RLS verbirgt denselben Topf vor einem anderen Mitglied");
  console.log("✓ Die additive Allowlist lehnt unbekannte Töpfe weiterhin mit CHECK ab");
  console.log("ENTDECKEN_PINS_POSTGRES: 3/3 checks passed");
} finally {
  if (running) run("pg_ctl", ["--pgdata", data, "--mode", "fast", "--wait", "stop"], undefined, true);
  rmSync(root, { recursive: true, force: true });
}
