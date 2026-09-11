/* Disposable PostgreSQL test: synthetic data only, no Supabase/provider access. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const required = ["initdb", "pg_ctl", "postgres", "psql"];
const candidates = [process.env.KD_TEST_PG_BIN, configured.status === 0 ? configured.stdout.trim() : null,
  "/Applications/Postgres.app/Contents/Versions/17/bin", "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin"].filter(Boolean);
const selected = [...new Set(candidates)].map((dir) => required.every((name) => existsSync(join(dir, name))) ? dir : null).find(Boolean);
assert.ok(selected, "PostgreSQL 16 or 17 server binaries are required");
const root = mkdtempSync(join(tmpdir(), "kd-title-facts-"));
const data = join(root, "data");
const port = String(58000 + process.pid % 6000);
const env = { PATH: `${selected}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
const migrations = ["20260909153000_flixpatrol_usage_ticker.sql", "20260909190000_flixpatrol_data_cache.sql",
  "20260911120000_title_facts_lookup.sql"].map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"));
let running = false;
let checks = 0;
function run(binary, args, input) {
  const result = spawnSync(join(selected, binary), args, { input, encoding: "utf8", timeout: 60000, maxBuffer: 5000000, env });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
const args = ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", args, query);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const jsonb = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const sessionSql = (query, role = "service_role", active = true) =>
  `begin; set local role ${role}; select set_config('request.jwt.claim.role',${quote(role)},true); select set_config('test.account.active',${quote(active ? "true" : "false")},true); ${query}; commit;`;
const session = (query, role, active) => sql(sessionSql(query, role, active)).split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
function failure(query, role, active) {
  const result = spawnSync(join(selected, "psql"), args, { input: sessionSql(query, role, active), encoding: "utf8", timeout: 60000, env });
  assert.notEqual(result.status, 0);
  return result.stderr;
}
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }

const genre = "gnr_vkhlVlz6xabS78vHh0DCIc5e";
const keyword = "kwd_NLPueMUHlNqj02pZEBFyWIhu";
const filmId = "ttl_bHyGTvopBHPVtIKhR2CF68WD";
const duplicateImdbId = "ttl_DuplicateImdb123456789012";
const seriesId = "ttl_SeriesTmdbCollision12345678";
const title = (sourceId, mediaType, imdbId, tmdbId, name) => ({
  sourceId, mediaType, title: name, premiere: "2024-01-01", releaseYear: 2024, premiereOnline: null,
  runtimeMinutes: 100, imdbNumericId: imdbId.slice(2).replace(/^0+/, ""), imdbId, tmdbId,
  countryId: null, companyId: null, genreId: genre, keywordId: keyword,
  description: `${name} neutral`, providerUpdatedAt: "2026-09-11T10:00:00", sourceUrl: `https://flixpatrol.com/title/${name.toLowerCase()}/`,
});

try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set", "shared_memory_type=mmap", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options",
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`, "--wait", "start"]);
  running = true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    create function public.kd_account_active() returns boolean language sql stable security definer set search_path=pg_catalog,public
      as $$select current_setting('test.account.active',true) = 'true'$$;
    revoke all on function public.kd_account_active() from public,anon,authenticated;
    grant execute on function public.kd_account_active() to authenticated;`);
  migrations.forEach(sql);

  check("Genres und Keywords werden als eigene gezählte Ledger-Operationen akzeptiert", () => {
    for (const [index, kind] of ["genres", "keywords"].entries()) {
      const operation = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const begun = JSON.parse(session(`select public.kd_flixpatrol_usage_begin('${operation}','${kind}')`));
      assert.equal(begun.claim, true);
      assert.equal(JSON.parse(session(`select public.kd_flixpatrol_usage_finish('${operation}','succeeded',200,null)`)).status, "succeeded");
    }
    const invalid = JSON.parse(session(`select public.kd_flixpatrol_usage_begin('00000000-0000-4000-8000-000000000009','untracked')`));
    assert.equal(invalid.code, "invalid-request");
  });

  session(`select public.kd_flixpatrol_data_save_vocabulary('genres','${genre}','Science Fiction',null,'film',1,null,now(),now()+interval '30 days','https://flixpatrol.com/api2/endpoint-genres/')`);
  session(`select public.kd_flixpatrol_data_save_vocabulary('keywords','${keyword}','space',null,null,null,null,now(),now()+interval '30 days','https://flixpatrol.com/api2/endpoint-keywords/')`);
  for (const item of [title(filmId, "film", "tt01234567", "194", "Alpha"),
    title(duplicateImdbId, "film", "tt01234567", "999", "Beta"),
    title(seriesId, "series", "tt07654321", "194", "Gamma")]) {
    const saved = JSON.parse(session(`select public.kd_flixpatrol_data_save_title(${jsonb(item)},now(),now()+interval '30 days')`));
    assert.equal(saved.saved, true);
  }

  check("Bekannte FlixPatrol-, IMDb- und typisierte TMDB-IDs finden Titel außerhalb von Charts", () => {
    const identities = [{ flixpatrolId: filmId }, { imdbId: "tt07654321" }, { tmdbId: "194", mediaType: "film" }];
    const result = JSON.parse(session(`select public.kd_title_facts_lookup(${jsonb(identities)})`, "authenticated", true));
    assert.equal(result.schemaVersion, "title-facts-projection-v1");
    assert.deepEqual(result.items.map((item) => item.sourceId).sort(), [filmId, seriesId].sort());
    const film = result.items.find((item) => item.sourceId === filmId);
    assert.deepEqual(film.genres, [{ id: genre, name: "Science Fiction" }]);
    assert.deepEqual(film.keywords, [{ id: keyword, name: "space" }]);
    assert.equal(film.description, "Alpha neutral");
    assert.equal(film.fetchedAt !== undefined, true);
  });

  check("Mehrdeutige IMDb/TMDB-IDs und widersprüchliche ID-Paare bleiben leer", () => {
    const ambiguousImdb = JSON.parse(session(`select public.kd_title_facts_lookup(${jsonb([{ imdbId: "tt01234567" }])})`));
    const ambiguousTmdb = JSON.parse(session(`select public.kd_title_facts_lookup(${jsonb([{ tmdbId: "194" }])})`));
    const conflict = JSON.parse(session(`select public.kd_title_facts_lookup(${jsonb([{ flixpatrolId: filmId, imdbId: "tt07654321" }])})`));
    assert.deepEqual([ambiguousImdb.items, ambiguousTmdb.items, conflict.items], [[], [], []]);
  });

  check("Falsche Felder, doppelte alte Titel-IDs und mehr als 50 Identitäten werden abgewiesen", () => {
    assert.equal(JSON.parse(session(`select public.kd_title_facts_lookup(${jsonb([{ title: "private" }])})`)).code, "invalid-request");
    assert.equal(JSON.parse(session(`select public.kd_title_facts_lookup(${jsonb([{ mediaType: "film" }])})`)).code, "invalid-request");
    const tooMany = Array.from({ length: 51 }, () => ({ imdbId: "tt01234567" }));
    assert.equal(JSON.parse(session(`select public.kd_title_facts_lookup(${jsonb(tooMany)})`)).code, "invalid-request");
    assert.equal(JSON.parse(session(`select public.kd_flixpatrol_titles_read(array['${filmId}','${filmId}'])`)).code, "invalid-request");
  });

  check("RLS und Kontogrenze schützen Tabellen und Lookup-RPC", () => {
    assert.equal(sql("select count(*) from information_schema.role_table_grants where table_name in ('kd_flixpatrol_title_cache','kd_flixpatrol_vocabulary_cache') and grantee in ('anon','authenticated')"), "0");
    assert.match(failure(`select public.kd_title_facts_lookup(${jsonb([{ flixpatrolId: filmId }])})`, "authenticated", false), /account_inactive/);
    assert.match(failure(`select * from public.kd_flixpatrol_title_cache`, "authenticated", true), /permission denied/);
    assert.match(failure(`select public.kd_title_facts_lookup(${jsonb([{ flixpatrolId: filmId }])})`, "anon", true), /permission denied for function kd_title_facts_lookup/);
  });
} finally {
  if (running) spawnSync(join(selected, "pg_ctl"), ["--pgdata", data, "--mode", "immediate", "--wait", "stop"], { encoding: "utf8", timeout: 60000, env });
  rmSync(root, { recursive: true, force: true });
}
console.log(`data_plan_foundation_pg17_test: ${checks} Checks bestanden.`);
