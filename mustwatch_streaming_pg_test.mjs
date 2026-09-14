/* Disposable PostgreSQL contract test for the bounded Must-Watch Streaming RPC. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const candidates = [process.env.KD_TEST_PG_BIN, "/Applications/Postgres.app/Contents/Versions/17/bin",
  configured.status === 0 ? configured.stdout.trim() : null, "/usr/lib/postgresql/17/bin"].filter(Boolean);
const required = ["initdb", "pg_ctl", "psql"];
const PG = [...new Set(candidates)].find((dir) => required.every((name) => existsSync(join(dir, name))));
assert.ok(PG, `PostgreSQL server binaries are required (${required.join(", ")})`);

const root = mkdtempSync(join(tmpdir(), "kd-mustwatch-pg-"));
const data = join(root, "data");
const socket = join(root, "s");
const port = String(59000 + process.pid % 5000);
const migrations = [
  "20260913200000_streaming_pages_backend.sql",
  "20260914100000_streaming_pages_latency.sql",
  "20260914120000_mustwatch_streaming_candidates.sql",
].map((name) => readFileSync(join("supabase/migrations", name), "utf8"));
const env = { PATH: `${PG}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
let running = false;
let checks = 0;
mkdirSync(socket);

function run(binary, args, input) {
  const result = spawnSync(join(PG, binary), args, { input, encoding: "utf8", timeout: 90_000,
    maxBuffer: 20_000_000, env });
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
const psqlArgs = ["-h", socket, "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt",
  "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", psqlArgs, query);
function failure(query) {
  const result = spawnSync(join(PG, "psql"), psqlArgs, { input: query, encoding: "utf8", timeout: 90_000,
    maxBuffer: 4_000_000, env });
  assert.notEqual(result.status, 0);
  return result.stderr;
}
const account = "00000000-0000-4000-8000-000000000001";
const sessionSql = (query, role = "authenticated", active = true) => `begin; set local role ${role};
  select set_config('request.jwt.claim.role','${role}',true);
  select set_config('request.jwt.claim.sub','${account}',true);
  select set_config('fixture.active','${active}',true); ${query}; rollback;`;
const session = (query, role = "authenticated", active = true) => sql(sessionSql(query, role, active))
  .split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
const request = (overrides = {}) => ({ format: 1, ids: [], query: "", limit: 6, ...overrides });
const call = (value, active = true) => JSON.parse(session(
  `select public.kd_mustwatch_streaming_candidates('${JSON.stringify(value).replaceAll("'", "''")}'::jsonb)`,
  "authenticated", active));
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }

const stand = new Date(Date.now() - 3600_000).toISOString();
const future = new Date(Date.now() + 24 * 3600_000).toISOString();
const regular = Array.from({ length: 30 }, (_, index) => ({
  watchmode_id: 1000 + index,
  titel: `Catalog Film ${String(index).padStart(3, "0")}`,
  originaltitel: `Catalog Original ${String(index).padStart(3, "0")}`,
  jahr: 1990 + index,
  typ: "movie",
  genres: [index % 2 ? "Drama" : "Komödie"],
  dienste: [index % 2 ? "Netflix" : "Disney+"],
}));
const titles = [
  ...regular,
  { watchmode_id: 7001, streaming_aliases: ["unique-old", "shared"], titel: "Alias One", jahr: 2020,
    typ: "movie", dienste: ["Netflix"], imdb_id: "tt7000001", tmdb_id: 7001 },
  { watchmode_id: 7002, streaming_aliases: ["shared"], titel: "Alias Two", jahr: 2021,
    typ: "movie", dienste: ["Netflix"] },
  { watchmode_id: 7003, streaming_aliases: ["7002"], titel: "Alias Three", jahr: 2022,
    typ: "movie", dienste: ["Disney+"] },
  { watchmode_id: 8001, titel: "Removed By MotN", jahr: 2023, typ: "movie", dienste: ["Netflix"],
    imdb_id: "tt8000001", tmdb_id: 8001 },
  { streaming_id: "neutral-safe", titel: "Neutral Safe", originaltitel: "Safe Original", jahr: 2024,
    typ: "tv_series", dienste: ["Netflix"], genres: ["Thriller"], notiz: "private note",
    bewertung: { was: 5 }, must_watch: true, eigene_stimmungen: ["secret"], quelle: "private" },
];
const discoverPayload = { stand, katalog_stand: stand, titel: titles };
const knownPayload = { stand, katalog_stand: stand, titel: [] };
const json = (value) => JSON.stringify(value).replaceAll("'", "''");

try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set",
    "shared_memory_type=mmap", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options",
    `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix -c work_mem=2184kB`,
    "--wait", "start"]); running = true;
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.kd_account_active() returns boolean language sql stable as $$select coalesce(current_setting('fixture.active',true),'false')='true'$$;
    create table public.kd_catalog(name text primary key,payload jsonb,updated_at timestamptz,quelle text,stand timestamptz,gueltig_bis timestamptz);
    create table public.kd_motn_offers(show_id text not null,service_id text not null,country text not null default 'AT',available boolean not null,
      event_at timestamptz not null,added_at timestamptz,checked_at timestamptz not null,watchmode_seen_at timestamptz,link text,show_data jsonb not null,
      primary key(show_id,service_id));
    insert into public.kd_catalog values
      ('streaming_bekannt','${json(knownPayload)}',now(),'fixture','${stand}','${future}'),
      ('streaming_entdecken','${json(discoverPayload)}',now(),'fixture','${stand}','${future}');
    insert into public.kd_motn_offers values
      ('removed','netflix','AT',true,now(),now(),now(),now(),'https://example.invalid/removed',
       '{"motn_id":"removed","typ":"film","jahr":2023,"titel":"Removed By MotN","imdb_id":"tt8000001","tmdb_id":8001,"at_subscription_services":["netflix"]}'::jsonb);`);
  for (const migration of migrations) sql(migration);

  const readHash = () => sql(`select md5(coalesce((select string_agg(name||payload::text,'|' order by name) from public.kd_catalog),'')
    ||coalesce((select string_agg(show_id||service_id||available::text||show_data::text,'|' order by show_id,service_id) from public.kd_motn_offers),''))`);
  const beforeReads = readHash();

  check("only active authenticated accounts can execute the RPC", () => {
    assert.equal(sql("select has_function_privilege('authenticated','public.kd_mustwatch_streaming_candidates(jsonb)','execute')"), "t");
    assert.equal(sql("select has_function_privilege('anon','public.kd_mustwatch_streaming_candidates(jsonb)','execute')"), "f");
    assert.equal(sql("select has_function_privilege('service_role','public.kd_mustwatch_streaming_candidates(jsonb)','execute')"), "f");
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request())}'::jsonb)`,
      "authenticated", false)), /account_inactive/);
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request())}'::jsonb)`,
      "anon", true)), /permission denied/);
  });

  check("empty search is ready but never dumps the catalog", () => {
    const result = call(request());
    assert.equal(result.status, "ready");
    assert.deepEqual(result.items, []);
    assert.equal(Date.parse(result.expiresAt), Date.parse(future));
  });

  check("lookup resolves current IDs and unique aliases while discarding ambiguous aliases", () => {
    const result = call(request({ ids: ["unique-old", "shared", "7002"] }));
    assert.deepEqual(result.items.map((item) => item.id), ["7001", "7002"]);
    assert.equal(result.items[1].watchmode_id, "7002");
    assert.ok(!result.items.some((item) => item.id === "7003"));
    assert.deepEqual(result.items[0].streaming_aliases, ["7001", "unique-old"]);
    assert.deepEqual(result.items[1].streaming_aliases, ["7002"]);
  });

  check("DTO aliases stay globally safe for mixed lookups, exact-ID collisions and search", () => {
    const mixed = call(request({ ids: ["7001", "shared"] }));
    assert.deepEqual(mixed.items.map((item) => item.id), ["7001"]);
    assert.ok(!mixed.items[0].streaming_aliases.includes("shared"));
    const exactWins = call(request({ ids: ["7002"] }));
    assert.deepEqual(exactWins.items.map((item) => item.id), ["7002"]);
    const search = call(request({ query: "Alias", limit: 6 }));
    assert.deepEqual(search.items.map((item) => item.id), ["7001", "7003", "7002"]);
    assert.deepEqual(search.items.find((item) => item.id === "7001").streaming_aliases,
      ["7001", "unique-old"]);
    assert.deepEqual(search.items.find((item) => item.id === "7002").streaming_aliases, ["7002"]);
    assert.deepEqual(search.items.find((item) => item.id === "7003").streaming_aliases, ["7003"]);
  });

  check("lookup returns an explicit neutral DTO without private payload fields", () => {
    const result = call(request({ ids: ["neutral-safe"] }));
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, "neutral-safe");
    assert.equal(result.items[0].streaming_id, "neutral-safe");
    assert.deepEqual(result.items[0].dienste, ["Netflix"]);
    assert.deepEqual(result.items[0].genres, ["Thriller"]);
    assert.deepEqual(Object.keys(result.items[0]).sort(),
      ["dienste", "genres", "id", "jahr", "originaltitel", "streaming_aliases", "streaming_id", "titel", "typ"].sort());
    for (const forbidden of ["notiz", "bewertung", "must_watch", "eigene_stimmungen", "quelle"])
      assert.ok(!(forbidden in result.items[0]));
  });

  check("search covers the whole projection and stays deterministically limited", () => {
    const first = call(request({ query: "Catalog Film", limit: 6 }));
    const repeated = call(request({ query: "Catalog Film", limit: 6 }));
    assert.equal(first.items.length, 6);
    assert.deepEqual(repeated, first);
    assert.deepEqual(first.items.map((item) => item.id), ["1000", "1001", "1002", "1003", "1004", "1005"]);
    const beyond = call(request({ query: "Catalog Film 029", limit: 6 }));
    assert.deepEqual(beyond.items.map((item) => item.id), ["1029"]);
    const original = call(request({ query: "Catalog Original 029", limit: 6 }));
    assert.deepEqual(original.items.map((item) => item.id), ["1029"]);
  });

  check("request shape, mode, uniqueness and hard bounds fail closed", () => {
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json({ ...request(), note: "x" })}'::jsonb)`)), /invalid must-watch streaming request/);
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request({ ids: ["7001"], query: "Alias" }))}'::jsonb)`)), /invalid must-watch streaming mode/);
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request({ ids: ["same", " same "] }))}'::jsonb)`)), /invalid must-watch streaming mode/);
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request({ ids: [`id-${"x".repeat(254)}`] }))}'::jsonb)`)), /invalid must-watch streaming mode/);
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request({ limit: 21 }))}'::jsonb)`)), /invalid must-watch streaming request/);
    const fiveHundred = Array.from({ length: 500 }, (_, index) => `requested-${index}`);
    assert.equal(call(request({ ids: fiveHundred })).items.length, 0);
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request({ ids: [...fiveHundred, "one-too-many"] }))}'::jsonb)`)), /invalid must-watch streaming mode/);
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request({ query: "x".repeat(161) }))}'::jsonb)`)), /invalid must-watch streaming mode/);
    assert.match(failure(sessionSql(`select public.kd_mustwatch_streaming_candidates('${json(request({ query: `${" ".repeat(160)}x` }))}'::jsonb)`)), /invalid must-watch streaming mode/);
  });

  check("bounded reads do not mutate catalog or MotN source data", () => assert.equal(readHash(), beforeReads));

  check("MotN removal immediately removes the overridden current candidate", () => {
    assert.deepEqual(call(request({ ids: ["8001"] })).items.map((item) => item.id), ["8001"]);
    const version = call(request({ ids: ["8001"] })).version;
    sql("update public.kd_motn_offers set available=false,link=null where show_id='removed'");
    const removed = call(request({ ids: ["8001"] }));
    assert.deepEqual(removed.items, []);
    assert.notEqual(removed.version, version);
  });

  const scaleCount = Number(process.env.KD_MUSTWATCH_SIZE_COUNT || 25_000);
  assert.ok(Number.isInteger(scaleCount) && scaleCount >= 25_000 && scaleCount <= 30_000,
    "KD_MUSTWATCH_SIZE_COUNT must stay between 25000 and 30000");
  const padding = "Realistische neutrale Katalogbeschreibung mit Darstellern, Handlung und Herkunft. ".repeat(9);
  const largeTitles = Array.from({ length: scaleCount }, (_, index) => ({
    watchmode_id: 100_000 + index,
    titel: index === scaleCount - 1 ? "Zulu Tail Target" : `Scale Catalog ${String(index).padStart(5, "0")}`,
    originaltitel: `Scale Original ${String(index).padStart(5, "0")}`,
    jahr: 1980 + index % 45,
    typ: index % 7 === 0 ? "tv_series" : "movie",
    genres: index % 2 ? ["Drama", "Mystery"] : ["Komödie", "Familie"],
    dienste: [index % 3 ? "Netflix" : "Disney+"],
    streaming_aliases: [`scale-old-${index}`],
    beschreibung: `${padding}${index}`,
    web_urls: { Netflix: `https://example.invalid/title/${index}` },
    relevanz_signale: ["synthetic-size-probe", `bucket-${index % 20}`],
  }));
  const largePayload = { stand, katalog_stand: stand, titel: largeTitles };
  const rebuildStarted = performance.now();
  sql(`update public.kd_catalog set payload='${json(largePayload)}'::jsonb
    where name='streaming_entdecken'`);
  const rebuildMs = performance.now() - rebuildStarted;
  const batchIds = [...Array.from({ length: 499 }, (_, index) => String(100_000 + index)),
    String(100_000 + scaleCount - 1)];
  const batchRequest = request({ ids: batchIds });
  const searchRequest = request({ query: "Zulu Tail Target", limit: 6 });
  const batchStarted = performance.now();
  const batchResult = call(batchRequest);
  const batchMs = performance.now() - batchStarted;
  const searchStarted = performance.now();
  const searchResult = call(searchRequest);
  const searchMs = performance.now() - searchStarted;
  const explain = (value) => JSON.parse(sql(`begin; set local role authenticated;
    set local "request.jwt.claim.role"='authenticated';
    set local "request.jwt.claim.sub"='${account}'; set local "fixture.active"='true';
    explain (analyze,buffers,format json) select public.kd_mustwatch_streaming_candidates(
      '${json(value)}'::jsonb); rollback;`))[0].Plan;
  const batchPlan = explain(batchRequest);
  const searchPlan = explain(searchRequest);
  const batchTemp = { read: Number(batchPlan["Temp Read Blocks"] || 0),
    written: Number(batchPlan["Temp Written Blocks"] || 0) };
  const searchTemp = { read: Number(searchPlan["Temp Read Blocks"] || 0),
    written: Number(searchPlan["Temp Written Blocks"] || 0) };
  check(`${scaleCount}-title projection keeps ID batches and tail search bounded`, () => {
    assert.equal(batchResult.items.length, 500);
    assert.equal(batchResult.items.at(-1).id, String(100_000 + scaleCount - 1));
    assert.deepEqual(searchResult.items.map((item) => item.id), [String(100_000 + scaleCount - 1)]);
    assert.ok(batchMs < 3000, `500-ID batch took ${batchMs.toFixed(0)} ms`);
    assert.ok(searchMs < 1500, `tail search took ${searchMs.toFixed(0)} ms`);
    assert.ok(batchTemp.written < 3000, `500-ID batch wrote ${batchTemp.written} temp blocks`);
    assert.ok(searchTemp.written < 3000, `tail search wrote ${searchTemp.written} temp blocks`);
  });
  console.log(`${scaleCount}-title size probe at work_mem=2184kB: projection ${rebuildMs.toFixed(0)} ms, `
    + `500-ID batch ${batchMs.toFixed(0)} ms/${batchTemp.read} read/${batchTemp.written} written temp blocks, `
    + `tail search ${searchMs.toFixed(0)} ms/${searchTemp.read} read/${searchTemp.written} written temp blocks`);

  check("expired or missing projection state returns unavailable without candidates", () => {
    const expired = new Date(Date.now() - 3600_000).toISOString();
    sql(`update public.kd_catalog set gueltig_bis='${expired}' where name='streaming_entdecken'`);
    const stale = call(request({ ids: ["7001"] }));
    assert.equal(stale.status, "unavailable");
    assert.deepEqual(stale.items, []);
    assert.equal(Date.parse(stale.expiresAt), Date.parse(expired));
    sql("update public.kd_streaming_page_state set source_revision=0,meta='{}'::jsonb where singleton");
    const missing = call(request({ ids: ["7001"] }));
    assert.equal(missing.status, "unavailable");
    assert.deepEqual(missing.items, []);
    assert.equal(missing.expiresAt, null);
  });

  console.log(`${checks} Must-Watch Streaming PostgreSQL checks passed.`);
} finally {
  if (running) run("pg_ctl", ["--pgdata", data, "--wait", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
