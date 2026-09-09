/* Disposable PostgreSQL test: synthetic data only, no Supabase/provider access. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
const selected = [...new Set(candidates)].map((dir) => {
  if (!required.every((name) => existsSync(join(dir, name)))) return false;
  const version = spawnSync(join(dir, "postgres"), ["--version"], { encoding: "utf8" });
  const match = version.status === 0 ? version.stdout.match(/\b(16|17)\.\d+\b/) : null;
  return match ? { dir, version: match[0] } : null;
}).find(Boolean);
assert.ok(selected, "PostgreSQL 16 or 17 server binaries are required");
const PG = selected.dir;
const PG_VERSION = selected.version;
const root = mkdtempSync(join(tmpdir(), "kd-flixpatrol-data-"));
const data = join(root, "data");
const port = String(57000 + process.pid % 7000);
const env = { PATH: `${PG}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
const usageMigration = readFileSync("supabase/migrations/20260909153000_flixpatrol_usage_ticker.sql", "utf8");
const dataMigration = readFileSync("supabase/migrations/20260909190000_flixpatrol_data_cache.sql", "utf8");
let running = false;
let checks = 0;

function run(binary, binaryArgs, input) {
  const result = spawnSync(join(PG, binary), binaryArgs, {
    input, encoding: "utf8", timeout: 60_000, maxBuffer: 5_000_000, env,
  });
  if (result.status !== 0) {
    const log = join(root, "postgres.log");
    const serverDetail = binary === "pg_ctl" && existsSync(log)
      ? readFileSync(log, "utf8").slice(-2000) : "";
    throw new Error(`${binary}: ${result.stderr || result.error}\n${serverDetail}`);
  }
  return result.stdout.trim();
}
function runFailure(binaryArgs, input) {
  const result = spawnSync(join(PG, "psql"), binaryArgs, {
    input, encoding: "utf8", timeout: 60_000, maxBuffer: 5_000_000, env,
  });
  assert.notEqual(result.status, 0);
  return result.stderr;
}
function runAsync(binary, binaryArgs, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(PG, binary), binaryArgs, { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => {
      clearTimeout(timer);
      if (status === 0) resolve(stdout.trim());
      else reject(new Error(stderr));
    });
    child.on("error", reject);
    child.stdin.end(input);
  });
}
const args = ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", args, query);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const jsonb = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const sessionSql = (query, role = "service_role", active = true) =>
  `begin; set local role ${role}; select set_config('request.jwt.claim.role',${quote(role)},true); select set_config('test.account.active',${quote(active ? "true" : "false")},true); ${query}; commit;`;
const session = (query, role, active) => sql(sessionSql(query, role, active))
  .split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
const sessionAsync = (query, role = "service_role", active = true) =>
  runAsync("psql", args, sessionSql(query, role, active))
    .then((output) => output.split("\n").map((line) => line.trim()).filter(Boolean).at(-1));
const failure = (query, role, active) => runFailure(args, sessionSql(query, role, active));
const uuid = (tail) => `00000000-0000-4000-8000-${String(tail).padStart(12, "0")}`;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`✓ ${name}`);
}

const titleId = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
const titleId2 = "ttl_K5H0Bes9dtvkV710raDBpXoK";
const companyId = "cmp_qypvowjqFhEIpCc0HlQ6VoYk";
const countryId = "cnt_gGE4RaeXpyz2U9Q5tEMYDwri";
const title = {
  sourceId: titleId, mediaType: "film", title: "Amélie",
  premiere: "2001-04-25", releaseYear: 2001, premiereOnline: null,
  runtimeMinutes: 122, imdbNumericId: "211915", imdbId: "tt0211915", tmdbId: "194",
  countryId: null, companyId: null, genreId: null, keywordId: null,
  description: "Last good neutral description.",
  providerUpdatedAt: "2026-09-09T10:57:43",
  sourceUrl: "https://flixpatrol.com/title/amelie/",
};
const chartItem = (sourceId, ranking) => ({
  sourceId, mediaType: "film", ranking, rankingLast: null, value: 10,
  valueLast: null, daysTotal: 1, providerUpdatedAt: "2026-09-09T10:57:43",
});
const chart = (overrides = {}) => ({
  companyId, countryId, chartType: "movies", chartDate: "2026-09-09",
  items: [chartItem(titleId, 1), chartItem(titleId2, 2)],
  fetchedAt: "2026-09-09T11:00:00Z", freshUntil: "2026-09-10T11:00:00Z",
  ...overrides,
});

try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set", "shared_memory_type=mmap", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options",
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,
    "--wait", "start"]);
  running = true;
  sql(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable
      as $$select current_setting('request.jwt.claim.role',true)$$;
    create function public.kd_account_active() returns boolean language sql stable security definer
      set search_path=pg_catalog,public
      as $$select current_setting('test.account.active',true) = 'true'$$;
    revoke all on function public.kd_account_active() from public, anon, authenticated;
    grant execute on function public.kd_account_active() to authenticated;
  `);
  sql(usageMigration);
  sql(dataMigration);

  check("Migration ist transaktional und legt drei zentrale Caches an", () => {
    assert.match(dataMigration, /begin;[\s\S]*commit;\s*$/);
    assert.equal(sql("select count(*) from pg_tables where schemaname='public' and tablename like 'kd_flixpatrol_%_cache'"), "3");
    assert.equal(sql("select count(*) from public.kd_flixpatrol_vocabulary_cache"), "5");
  });

  check("Alle Requesttypen claimen und finalisieren idempotent", () => {
    ["quota", "top10s", "titles"].forEach((kind, index) => {
      const operation = uuid(index + 1);
      const first = JSON.parse(session(`select public.kd_flixpatrol_usage_begin('${operation}','${kind}')`));
      const replay = JSON.parse(session(`select public.kd_flixpatrol_usage_begin('${operation}','${kind}')`));
      assert.deepEqual([first.claim, replay.claim], [true, false]);
      const quota = kind === "quota"
        ? jsonb({ used: 0, available: 1000, limit: 1000, limitExtra: 0, resetAt: "2026-10-01T00:00:00Z" })
        : "null";
      const done = JSON.parse(session(`select public.kd_flixpatrol_usage_finish('${operation}','succeeded',200,${quota})`));
      const doneReplay = JSON.parse(session(`select public.kd_flixpatrol_usage_finish('${operation}','succeeded',200,${quota})`));
      assert.deepEqual([done.replay, doneReplay.replay], [false, true]);
    });
    const state = JSON.parse(session("select public.kd_flixpatrol_usage_status()"));
    assert.equal(state.sinceSetup.attemptedRequests, 3);
    assert.equal(state.sinceSetup.successfulRequests, 3);
    assert.equal(state.quota.available, 1000);
  });

  check("Chart erzeugt unresolved Claims und aktive Konten dürfen lesen", () => {
    const saved = JSON.parse(session(`select public.kd_flixpatrol_data_save_chart(${jsonb(chart())})`));
    assert.deepEqual({ saved: saved.saved, itemCount: saved.itemCount }, { saved: true, itemCount: 2 });
    const activeRead = JSON.parse(session(
      `select public.kd_flixpatrol_chart_read('${companyId}','${countryId}','movies')`, "authenticated", true,
    ));
    assert.equal(activeRead.chart.items.length, 2);
    assert.equal(activeRead.chart.items[0].facts.status, "unresolved");
    assert.match(failure(
      `select public.kd_flixpatrol_chart_read('${companyId}','${countryId}','movies')`, "authenticated", false,
    ), /account_inactive/);
    assert.match(failure(
      `select public.kd_flixpatrol_chart_read('${companyId}','${countryId}','movies')`, "anon", true,
    ), /permission denied/);
  });

  check("Nullfelder erhalten positive Fakten und ein Negativtreffer überschreibt sie nicht", () => {
    assert.equal(JSON.parse(session(
      `select public.kd_flixpatrol_data_save_title(${jsonb(title)},'2026-09-09T11:05:00Z','2026-10-09T11:05:00Z')`,
    )).saved, true);
    const sparse = { ...title, description: null, imdbNumericId: null, imdbId: null, tmdbId: null, providerUpdatedAt: "2026-09-09T12:00:00" };
    assert.equal(JSON.parse(session(
      `select public.kd_flixpatrol_data_save_title(${jsonb(sparse)},'2026-09-09T12:05:00Z','2026-10-09T12:05:00Z')`,
    )).saved, true);
    assert.equal(sql(`select description || '|' || imdb_id || '|' || tmdb_id from public.kd_flixpatrol_title_cache where source_id='${titleId}'`),
      "Last good neutral description.|tt0211915|194");
    const malformed = { ...title, description: { private: "must not persist" }, providerUpdatedAt: "2026-09-09T12:30:00" };
    assert.equal(JSON.parse(session(
      `select public.kd_flixpatrol_data_save_title(${jsonb(malformed)},'2026-09-09T12:35:00Z','2026-10-09T12:35:00Z')`,
    )).code, "invalid-response");
    const preserved = JSON.parse(session(
      `select public.kd_flixpatrol_data_save_title_miss('${titleId}','film','not_found','2026-09-09T13:00:00Z','2026-09-16T13:00:00Z')`,
    ));
    assert.deepEqual({ saved: preserved.saved, preserved: preserved.preserved, status: preserved.status },
      { saved: false, preserved: true, status: "resolved" });
  });

  check("Negative Treffer werden separat gecacht", () => {
    const negative = JSON.parse(session(
      `select public.kd_flixpatrol_data_save_title_miss('${titleId2}','film','not_found','2026-09-09T11:10:00Z','2026-09-16T11:10:00Z')`,
    ));
    assert.equal(negative.status, "not_found");
    assert.equal(sql(`select status from public.kd_flixpatrol_title_cache where source_id='${titleId2}'`), "not_found");
  });

  const positiveRaceId = "ttl_ParallelPositive123456789";
  const positiveRaceTitle = { ...title, sourceId: positiveRaceId };
  const positiveMissRace = await Promise.all([
    sessionAsync(
      `select public.kd_flixpatrol_data_save_title(${jsonb(positiveRaceTitle)},'2026-09-09T14:00:00Z','2026-10-09T14:00:00Z')`,
    ),
    sessionAsync(
      `select public.kd_flixpatrol_data_save_title_miss('${positiveRaceId}','film','not_found','2026-09-09T14:00:00Z','2026-09-16T14:00:00Z')`,
    ),
  ]);
  check("Paralleler positiver und negativer Claim endet immer positiv", () => {
    const outcomes = positiveMissRace.map((value) => JSON.parse(value));
    assert.ok(outcomes.some((outcome) => outcome.status === "resolved"));
    assert.equal(sql(`select status from public.kd_flixpatrol_title_cache where source_id='${positiveRaceId}'`), "resolved");
  });

  const conflictRaceId = "ttl_ParallelConflict123456789";
  const conflictA = { ...title, sourceId: conflictRaceId, imdbNumericId: "211915", imdbId: "tt0211915", tmdbId: "194" };
  const conflictB = { ...title, sourceId: conflictRaceId, imdbNumericId: "1234567", imdbId: "tt1234567", tmdbId: "999" };
  const positiveConflictRace = await Promise.all([
    sessionAsync(
      `select public.kd_flixpatrol_data_save_title(${jsonb(conflictA)},'2026-09-09T14:05:00Z','2026-10-09T14:05:00Z')`,
    ),
    sessionAsync(
      `select public.kd_flixpatrol_data_save_title(${jsonb(conflictB)},'2026-09-09T14:05:00Z','2026-10-09T14:05:00Z')`,
    ),
  ]);
  check("Parallele widersprechende starke IDs überschreiben einander nicht", () => {
    const outcomes = positiveConflictRace.map((value) => JSON.parse(value));
    assert.equal(outcomes.filter((outcome) => outcome.saved === true).length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.code === "id-conflict").length, 1);
    assert.ok(["tt0211915", "tt1234567"].includes(
      sql(`select imdb_id from public.kd_flixpatrol_title_cache where source_id='${conflictRaceId}'`),
    ));
  });

  check("Leere, partielle, nichtganzzahlige und ältere Charts verdrängen keinen guten Stand", () => {
    for (const invalid of [
      chart({ items: [] }),
      chart({ items: [{ ...chartItem(titleId, 1), providerUpdatedAt: null }] }),
      chart({ items: [{ ...chartItem(titleId, 1), ranking: 1.5 }] }),
    ]) {
      assert.equal(JSON.parse(session(`select public.kd_flixpatrol_data_save_chart(${jsonb(invalid)})`)).code, "invalid-response");
    }
    const older = chart({ chartDate: "2026-09-08", items: [chartItem(titleId, 1)],
      fetchedAt: "2026-09-10T11:00:00Z", freshUntil: "2026-09-11T11:00:00Z" });
    assert.equal(JSON.parse(session(`select public.kd_flixpatrol_data_save_chart(${jsonb(older)})`)).saved, false);
    assert.equal(sql(`select chart_date || '|' || jsonb_array_length(entries) from public.kd_flixpatrol_chart_cache where company_id='${companyId}'`),
      "2026-09-09|2");
  });

  check("ID-Konflikte und payloadfreie Fehler erhalten den letzten guten Titel", () => {
    const conflicting = { ...title, imdbNumericId: "1234567", imdbId: "tt1234567", providerUpdatedAt: "2026-09-09T13:00:00" };
    assert.equal(JSON.parse(session(
      `select public.kd_flixpatrol_data_save_title(${jsonb(conflicting)},'2026-09-09T13:05:00Z','2026-10-09T13:05:00Z')`,
    )).code, "id-conflict");
    const operation = uuid(20);
    session(`select public.kd_flixpatrol_usage_begin('${operation}','titles')`);
    session(`select public.kd_flixpatrol_usage_finish('${operation}','http_error',503,null)`);
    const logged = JSON.parse(session(
      `select public.kd_flixpatrol_data_record_failure('${operation}','title','${titleId}','film','http_error','2026-09-09T13:06:00Z')`,
    ));
    const replay = JSON.parse(session(
      `select public.kd_flixpatrol_data_record_failure('${operation}','title','${titleId}','film','http_error','2026-09-09T13:06:00Z')`,
    ));
    assert.deepEqual([logged.saved, replay.saved], [true, false]);
    assert.equal(sql(`select imdb_id from public.kd_flixpatrol_title_cache where source_id='${titleId}'`), "tt0211915");
  });

  check("Direktzugriff, Admin-RPCs und private Fehlertexte bleiben Browserrollen entzogen", () => {
    assert.equal(sql("select count(*) from information_schema.role_table_grants where table_name like 'kd_flixpatrol_%' and grantee in ('anon','authenticated')"), "0");
    assert.match(failure(
      `select public.kd_flixpatrol_data_save_title_miss('${titleId2}','film','not_found',now(),now())`, "authenticated", true,
    ), /permission denied/);
    assert.match(failure(`select public.kd_flixpatrol_titles_read(array['${titleId}'])`, "anon", true), /permission denied/);
    const rejected = JSON.parse(session(
      `select public.kd_flixpatrol_data_record_failure('${uuid(21)}','title','private search text','film','not_found',now())`,
    ));
    assert.equal(rejected.code, "invalid-failure");
  });
} finally {
  if (running) {
    spawnSync(join(PG, "pg_ctl"), ["--pgdata", data, "--mode", "immediate", "--wait", "stop"], {
      encoding: "utf8", timeout: 60_000, env,
    });
  }
  rmSync(root, { recursive: true, force: true });
}

console.log(`${checks} FlixPatrol-Datenprüfungen mit PostgreSQL ${PG_VERSION} bestanden.`);
