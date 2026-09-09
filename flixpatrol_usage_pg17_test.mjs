/* Disposable PostgreSQL test: synthetic data only, no Supabase/provider access. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const candidates = [process.env.KD_TEST_PG_BIN, "/Applications/Postgres.app/Contents/Versions/17/bin", configured.status === 0 ? configured.stdout.trim() : null, "/usr/lib/postgresql/17/bin"].filter(Boolean);
const required = ["initdb", "pg_ctl", "psql"];
const PG = [...new Set(candidates)].find((dir) => required.every((name) => existsSync(join(dir, name))));
assert.ok(PG, `PostgreSQL server binaries are required (${required.join(", ")})`);

const root = mkdtempSync(join(tmpdir(), "kd-flixpatrol-usage-"));
const data = join(root, "data");
const socket = join(root, "socket");
const port = String(56000 + process.pid % 8000);
const migration = readFileSync("supabase/migrations/20260909153000_flixpatrol_usage_ticker.sql", "utf8");
const env = { PATH: `${PG}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
let running = false;
let checks = 0;
mkdirSync(socket);

function run(binary, args, input) {
  const result = spawnSync(join(PG, binary), args, { input, encoding: "utf8", timeout: 60_000, maxBuffer: 4_000_000, env });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function runFailure(binary, binaryArgs, input) {
  const result = spawnSync(join(PG, binary), binaryArgs, { input, encoding: "utf8", timeout: 60_000, maxBuffer: 4_000_000, env });
  assert.notEqual(result.status, 0);
  return result.stderr;
}
function runAsync(binary, args, stdinText) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(PG, binary), args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => { clearTimeout(timer); status === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)); });
    child.on("error", reject);
    child.stdin.end(stdinText);
  });
}
const args = ["-h", socket, "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", args, query);
const sessionSql = (query, role = "service_role") => `begin; set local role ${role}; select set_config('request.jwt.claim.role','${role}',true); ${query}; commit;`;
const session = (query, role) => sql(sessionSql(query, role)).split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
const sessionAsync = (query, role) => runAsync("psql", args, sessionSql(query, role)).then((output) => output.split("\n").map((line) => line.trim()).filter(Boolean).at(-1));
const id = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, "0")}`;
const begin = (operation) => JSON.parse(session(`select public.kd_flixpatrol_usage_begin('${operation}'::uuid,'quota')`));
const finish = (operation, status, httpStatus, quota = null) => JSON.parse(session(`select public.kd_flixpatrol_usage_finish('${operation}'::uuid,'${status}',${httpStatus ?? "null"},${quota ? `'${JSON.stringify(quota)}'::jsonb` : "null"})`));
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }

try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set", "shared_memory_type=mmap", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options", `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`, "--wait", "start"]);
  running = true;
  sql("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;");
  sql(migration);

  check("Migration ist explizit transaktional", () => {
    assert.match(migration, /^begin;/);
    assert.match(migration, /commit;\s*$/);
  });
  check("Direkter Tabellenzugriff bleibt anon/authenticated entzogen", () => {
    const privileges = sql("select count(*) from information_schema.role_table_grants where table_name like 'kd_flixpatrol_usage_%' and grantee in ('anon','authenticated')");
    assert.equal(privileges, "0");
    const denied = runFailure("psql", args, sessionSql("select public.kd_flixpatrol_usage_status()", "anon"));
    assert.match(denied, /permission denied for function kd_flixpatrol_usage_status/);
  });

  const first = id(1);
  check("Begin zählt vorab und ein Replay kein zweites Mal", () => {
    assert.deepEqual(begin(first), { ok: true, claim: true, replay: false, status: "claimed" });
    assert.deepEqual(begin(first), { ok: true, claim: false, replay: true, status: "claimed" });
    const state = JSON.parse(session("select public.kd_flixpatrol_usage_status()"));
    assert.equal(state.sinceSetup.attemptedRequests, 1);
    assert.equal(state.sinceSetup.completedRequests, 0);
    assert.equal(state.currentUtcMonth.month, new Date().toISOString().slice(0, 7));
    assert.equal(state.currentUtcMonth.attemptedRequests, 1);
  });

  const quota = { used: 23, available: 977, limit: 1000, limitExtra: 0, resetAt: "2026-10-01T00:00:00Z" };
  check("Erfolg finalisiert einmal und speichert den offiziellen Snapshot getrennt", () => {
    const done = finish(first, "succeeded", 200, quota);
    assert.equal(done.replay, false);
    assert.equal(done.usage.sinceSetup.attemptedRequests, 1);
    assert.equal(done.usage.sinceSetup.successfulRequests, 1);
    assert.equal(done.usage.quota.used, 23);
    const replay = finish(first, "succeeded", 200, quota);
    assert.equal(replay.replay, true);
    assert.equal(replay.usage.sinceSetup.completedRequests, 1);
  });

  check("Fehler bleibt terminal und überschreibt den letzten guten Snapshot nicht", () => {
    const second = id(2);
    begin(second);
    const done = finish(second, "http_error", 429);
    assert.equal(done.usage.sinceSetup.attemptedRequests, 2);
    assert.equal(done.usage.sinceSetup.failedRequests, 1);
    assert.deepEqual({ used: done.usage.quota.used, available: done.usage.quota.available }, { used: 23, available: 977 });
  });

  const concurrent = id(3);
  const claims = await Promise.all([
    sessionAsync(`select public.kd_flixpatrol_usage_begin('${concurrent}'::uuid,'quota')`),
    sessionAsync(`select public.kd_flixpatrol_usage_begin('${concurrent}'::uuid,'quota')`),
  ]);
  check("Gleichzeitige Begins claimen und zählen dieselbe Operation nur einmal", () => {
    assert.deepEqual(claims.map((value) => JSON.parse(value).claim).sort(), [false, true]);
    assert.equal(JSON.parse(session("select public.kd_flixpatrol_usage_status()")).sinceSetup.attemptedRequests, 3);
  });

  check("Kaputtes Quota-Payload kann den Snapshot nicht ersetzen", () => {
    const invalid = finish(concurrent, "succeeded", 200, { ...quota, used: null });
    assert.deepEqual(invalid, { ok: false, code: "invalid-quota" });
    const state = JSON.parse(session("select public.kd_flixpatrol_usage_status()"));
    assert.equal(state.sinceSetup.completedRequests, 2);
    assert.equal(state.quota.used, 23);
  });

  check("Später gestarteter Request besitzt den Snapshot auch bei früherem Abschluss", () => {
    const older = id(4);
    const newer = id(5);
    begin(older);
    begin(newer);
    finish(newer, "succeeded", 200, { ...quota, used: 40, available: 960 });
    const olderDone = finish(older, "succeeded", 200, { ...quota, used: 39, available: 961 });
    assert.equal(olderDone.usage.quota.used, 40);
    assert.equal(olderDone.usage.currentUtcMonth.attemptedRequests, 5);
  });
} finally {
  if (running) run("pg_ctl", ["--pgdata", data, "--wait", "stop", "--mode", "immediate"]);
  rmSync(root, { recursive: true, force: true });
}

console.log(`${checks} FlixPatrol-PG-Prüfungen bestanden.`);
