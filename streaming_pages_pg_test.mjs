/* Disposable PostgreSQL contract test. Synthetic fixtures only; no network or shared writes. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { vereinigeStreamingTitel } from "./src/lib/streamingProjection.js";
import { applyMotnStreaming, motnEnvelope } from "./src/lib/streamingMotn.js";

const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
const candidates = [process.env.KD_TEST_PG_BIN, "/Applications/Postgres.app/Contents/Versions/17/bin",
  configured.status === 0 ? configured.stdout.trim() : null, "/usr/lib/postgresql/17/bin"].filter(Boolean);
const required = ["initdb", "pg_ctl", "psql"];
const PG = [...new Set(candidates)].find((dir) => required.every((name) => existsSync(join(dir, name))));
assert.ok(PG, `PostgreSQL server binaries are required (${required.join(", ")})`);

const root = mkdtempSync("/private/tmp/kd-streaming-pages-pg-");
const data = join(root, "data");
const socket = join(root, "socket");
const port = String(57000 + process.pid % 7000);
const migration = readFileSync("supabase/migrations/20260913200000_streaming_pages_backend.sql", "utf8");
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
function failure(input) {
  const result = spawnSync(join(PG, "psql"), psqlArgs, { input, encoding: "utf8", timeout: 90_000,
    maxBuffer: 4_000_000, env });
  assert.notEqual(result.status, 0); return result.stderr;
}
const psqlArgs = ["-h", socket, "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt",
  "-v", "ON_ERROR_STOP=1", "-f", "-"];
const sql = (query) => run("psql", psqlArgs, query);
const account = "00000000-0000-4000-8000-000000000001";
const sessionSql = (query, role = "authenticated", active = true) => `begin; set local role ${role};
  select set_config('request.jwt.claim.role','${role}',true);
  select set_config('request.jwt.claim.sub','${account}',true);
  select set_config('fixture.active','${active}',true); ${query}; rollback;`;
const session = (query, role = "authenticated", active = true) => sql(sessionSql(query, role, active))
  .split("\n").map((line) => line.trim()).filter(Boolean).at(-1);
const request = (overrides = {}) => ({
  format: 1, services: ["Netflix", "Disney+"], view: "all", limit: 20, cursor: null,
  filters: { suche: "", plattform: null, typ: null, genre: null, dekade: null, buchstabe: null,
    sort: "titel", richtung: "auf", status: null, nurWunsch: false, nurBewertet: false },
  library: [], personal: { seenIds: [], mustWatchIds: [], ratedIds: [], newEntries: [], legacyNew: [] },
  ...overrides,
});
const call = (value, active = true) => JSON.parse(session(
  `select public.kd_streaming_page('${JSON.stringify(value).replaceAll("'", "''")}'::jsonb)`, "authenticated", active));
function check(name, fn) { fn(); checks += 1; console.log(`✓ ${name}`); }

const now = Date.now();
const recent = new Date(now - 24 * 3600_000).toISOString();
const old = new Date(now - 14 * 24 * 3600_000).toISOString();
const stand = new Date(now - 3600_000).toISOString();
const titles = Array.from({ length: 218 }, (_, index) => ({
  watchmode_id: 1000 + index, titel: `Film ${String(index).padStart(3, "0")}`, originaltitel: `Movie ${index}`,
  jahr: 1980 + index % 45, typ: index % 7 === 0 ? "tv_series" : "movie",
  genres: index % 2 ? ["Drama"] : ["Komödie"], dienste: [index % 3 ? "Netflix" : "Disney+"],
  imdb_id: `tt${String(1000000 + index)}`, tmdb_id: 5000 + index,
}));
titles.push({ watchmode_id: 5001, titel: "Neu innerhalb", jahr: 2020, typ: "movie", genres: ["Neu"],
  dienste: ["Disney+"], imdb_id: "tt8000001", tmdb_id: 8001,
  dienst_diffs: [{ dienst: "Disney+", vorher: false, nachher: true, erkannt_am: recent }] });
titles.push({ watchmode_id: 5002, titel: "Genau abgelaufen", jahr: 2020, typ: "movie", genres: ["Neu"],
  dienste: ["Disney+"], imdb_id: "tt8000002", tmdb_id: 8002,
  dienst_diffs: [{ dienst: "Disney+", vorher: false, nachher: true, erkannt_am: old }] });
titles.push({ watchmode_id: 5003, titel: "Kung Fu Panda 2", originaltitel: "Kung Fu Panda 2", jahr: 2011,
  typ: "movie", genres: ["Animation"], dienste: ["Netflix", "Disney+"], imdb_id: "tt1302011", tmdb_id: 49444 });
titles.push({ watchmode_id: 5004, titel: "The Road to El Dorado", originaltitel: "El Dorado", jahr: 2000,
  typ: "movie", genres: ["Animation"], dienste: ["Netflix"] });
titles.push({ watchmode_id: 5005, titel: "Widerspruch", jahr: 2021, typ: "movie", dienste: ["Netflix"],
  imdb_id: "tt8000005", tmdb_id: 8005 });
titles.push({ watchmode_id: 5006, titel: "Sort 10", jahr: 2022, typ: "movie", dienste: ["Netflix"] });
titles.push({ watchmode_id: 5007, titel: "Sort 2", jahr: 2022, typ: "movie", dienste: ["Netflix"] });
const known = [{ ...titles[0], id: "private-library-id", bewertung: { was: 5 }, must_watch: true,
  dienste: [...titles[0].dienste, "MUBI"] }];
const discoverPayload = { stand, katalog_stand: stand, stand_pro_quelle: { Netflix: stand, "Disney+": stand },
  vergleich_stand_pro_quelle: { Netflix: stand, "Disney+": stand }, titel: titles };
const knownPayload = { ...discoverPayload, titel: known };

try {
  run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set",
    "shared_memory_type=mmap", "--pgdata", data]);
  run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options",
    `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,
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
      ('streaming_bekannt','${JSON.stringify(knownPayload).replaceAll("'", "''")}',now(),'fixture','${stand}',null),
      ('streaming_entdecken','${JSON.stringify(discoverPayload).replaceAll("'", "''")}',now(),'fixture','${stand}',null);`);
  const before = sql("select md5(string_agg(name||payload::text,'|' order by name)) from public.kd_catalog");
  sql(`insert into public.kd_motn_offers values
    ('kfp','disney','AT',true,'${recent}','${recent}',now(),now(),'https://disney.example/kfp',
      '{"motn_id":"kfp","typ":"film","jahr":2011,"titel":"Kung Fu Panda 2","imdb_id":"tt1302011","tmdb_id":49444,"at_subscription_services":["disney"],"at_subscription_offers":[{"service":"disney","link":"https://disney.example/kfp","added_at":"${recent}"}]}'::jsonb),
    ('road','netflix','AT',true,'${recent}','${recent}',now(),null,'https://netflix.example/road',
      '{"motn_id":"road","typ":"film","jahr":2000,"titel":"Road to El Dorado","originaltitel":"The Road to El Dorado","imdb_id":"tt0240890","tmdb_id":10501,"at_subscription_services":["netflix"]}'::jsonb),
    ('conflict','netflix','AT',true,'${recent}','${recent}',now(),null,'https://netflix.example/conflict',
      '{"motn_id":"conflict","typ":"film","jahr":2021,"titel":"Widerspruch","imdb_id":"tt8000005","tmdb_id":9999,"at_subscription_services":["netflix"]}'::jsonb),
    ('only','netflix','AT',true,'${recent}','${recent}',now(),null,'https://netflix.example/only',
      '{"motn_id":"only","typ":"film","jahr":2024,"titel":"Nur MotN","imdb_id":"tt8999999","tmdb_id":8999,"at_subscription_services":["netflix"]}'::jsonb);`);
  sql(migration);

  check("initialization preserves original catalog bytes", () => assert.equal(
    sql("select md5(string_agg(name||payload::text,'|' order by name)) from public.kd_catalog"), before));
  const first = call(request());
  check("first page is 20 while counts cover the complete selected union", () => {
    assert.equal(first.status, "ready"); assert.equal(first.items.length, 20); assert.ok(first.counts.all > 220);
    assert.equal(first.total, first.counts.all); assert.equal(first.complete, false); assert.ok(first.nextCursor);
  });
  check("second request may return at most 200 and cursor is stable", () => {
    const second = call(request({ limit: 200, cursor: first.nextCursor }));
    assert.equal(second.status, "ready"); assert.equal(second.items.length, 200);
    assert.equal(second.version, first.version); assert.equal(second.counts.all, first.counts.all);
  });
  check("all filters and all sort selectors are server-side", () => {
    const filtered = call(request({ filters: { ...request().filters, suche: "Neu innerhalb", plattform: "Disney+",
      typ: "movie", genre: "Neu", dekade: 2020, buchstabe: "N", status: "ungesehen" } }));
    assert.equal(filtered.total, 1); assert.equal(filtered.items[0].titel, "Neu innerhalb");
    for (const sort of ["titel", "jahr", "art", "anbieter"]) for (const richtung of ["auf", "ab"]) {
      assert.equal(call(request({ limit: 2, filters: { ...request().filters, sort, richtung } })).items.length, 2);
    }
    assert.deepEqual(call(request({ filters: { ...request().filters, suche: "Sort" } })).items.map((x) => x.titel),
      ["Sort 2", "Sort 10"]);
  });
  const withLibrary = request({ view: "library", library: [
    { id: "lib-watch", watchmode_id: 1001, titel: "Film 001", jahr: 1981, typ: "movie" },
    { id: "lib-title", titel: "The Road to El Dorado", originaltitel: "The Road to El Dorado", jahr: 2000, typ: "movie" },
    { id: "lib-conflict", watchmode_id: 5005, imdb_id: "tt8000005", tmdb_id: 7777, titel: "Widerspruch", jahr: 2021, typ: "movie" },
  ], personal: { ...request().personal, seenIds: ["1001"], mustWatchIds: ["lib-watch"], ratedIds: ["lib-title"] } });
  check("library identity is strict and contradictory IDs do not match", () => {
    const result = call(withLibrary); const ids = result.items.map((x) => x.library_id);
    assert.deepEqual(new Set(ids), new Set(["lib-watch", "lib-title"])); assert.equal(result.counts.library, 2);
    assert.equal(call({ ...withLibrary, filters: { ...withLibrary.filters, nurWunsch: true } }).total, 1);
    assert.equal(call({ ...withLibrary, filters: { ...withLibrary.filters, nurBewertet: true } }).total, 1);
    assert.equal(call({ ...withLibrary, filters: { ...withLibrary.filters, status: "gesehen" } }).total, 1);
  });
  check("MotN availability wins, title fallback stays unique, and private known fields are stripped", () => {
    const kfp = call(request({ filters: { ...request().filters, suche: "Kung Fu Panda 2" } })).items[0];
    assert.deepEqual(kfp.dienste, ["Disney+"]); assert.equal(kfp.motn_match, "strong-id");
    const road = call(request({ filters: { ...request().filters, suche: "The Road to El Dorado" } })).items[0];
    assert.equal(road.motn_match, "title-year-type");
    const knownResult = call(request({ services: ["MUBI"], filters: { ...request().filters, suche: "Film 000" } })).items[0];
    assert.equal(knownResult.id, undefined); assert.equal(knownResult.bewertung, undefined); assert.equal(knownResult.must_watch, undefined);
  });
  check("14 times 24 hours is exact and Watchmode catch-up does not restart the MotN anchor", () => {
    const newResult = call(request({ view: "new", limit: 200 }));
    const names = new Set(newResult.items.map((x) => x.titel));
    assert.ok(names.has("Neu innerhalb")); assert.ok(names.has("Kung Fu Panda 2"));
    assert.ok(!names.has("Genau abgelaufen")); assert.equal(newResult.counts.new, newResult.total);
    assert.equal(Date.parse(newResult.items.find((x) => x.titel === "Kung Fu Panda 2").neu_seit), Date.parse(recent));
  });
  check("removals rebuild incrementally and old cursors report version_changed", () => {
    sql("update public.kd_motn_offers set available=false,link=null where show_id='only'");
    const changed = call(request({ cursor: first.nextCursor })); assert.equal(changed.status, "version_changed");
    const absent = call(request({ filters: { ...request().filters, suche: "Nur MotN" } })); assert.equal(absent.total, 0);
  });
  check("catalog removals invalidate the reusable projection without a page rebuild", () => {
    const beforeCount = call(request()).counts.all;
    sql("update public.kd_catalog set payload=jsonb_set(payload,'{titel}',(payload->'titel')-1) where name='streaming_entdecken'");
    assert.equal(call(request()).counts.all, beforeCount - 1);
  });
  check("inactive and anonymous roles are denied before data leaves the projection", () => {
    assert.match(failure(sessionSql(`select public.kd_streaming_page('${JSON.stringify(request()).replaceAll("'", "''")}'::jsonb)`, "authenticated", false)), /account_inactive/);
    assert.match(failure(sessionSql(`select public.kd_streaming_page('${JSON.stringify(request()).replaceAll("'", "''")}'::jsonb)`, "anon", true)), /permission denied/);
    assert.match(failure(sessionSql("select count(*) from public.kd_streaming_page_base", "authenticated", true)), /permission denied/);
  });
  check("payload and cursor guards reject personal fields and tampering", () => {
    assert.match(failure(sessionSql("select public.kd_streaming_page('{\"format\":1}'::jsonb)")), /invalid streaming page request/);
    const bad = request({ library: [{ id: "x", titel: "x", notiz: "secret" }] });
    assert.match(failure(sessionSql(`select public.kd_streaming_page('${JSON.stringify(bad)}'::jsonb)`)), /invalid streaming page identities/);
    assert.match(failure(sessionSql(`select public.kd_streaming_page('${JSON.stringify({ ...request(), note: "no" })}'::jsonb)`)), /invalid streaming page request fields/);
    assert.match(failure(sessionSql(`select public.kd_streaming_page('${JSON.stringify(request({ cursor: "tampered" }))}'::jsonb)`)), /invalid streaming page cursor/);
  });
  const realRoot = "/private/tmp/kd-streaming-performance-20260913";
  const realKnownRow = JSON.parse(readFileSync(join(realRoot, "streaming_bekannt.json"), "utf8"))[0];
  const realDiscoverRow = JSON.parse(readFileSync(join(realRoot, "streaming_entdecken.json"), "utf8"))[0];
  const realOffers = realDiscoverRow.payload.motn?.offers || realKnownRow.payload.motn?.offers || [];
  const realKnown = { ...realKnownRow.payload }; delete realKnown.motn;
  const realDiscover = { ...realDiscoverRow.payload }; delete realDiscover.motn;
  const realBefore = performance.now();
  sql(`alter table public.kd_motn_offers disable trigger kd_streaming_page_motn_row;
    truncate public.kd_motn_offers;
    insert into public.kd_motn_offers(show_id,service_id,country,available,event_at,added_at,checked_at,watchmode_seen_at,link,show_data)
    select * from jsonb_to_recordset('${JSON.stringify(realOffers).replaceAll("'", "''")}'::jsonb)
      as x(show_id text,service_id text,country text,available boolean,event_at timestamptz,added_at timestamptz,
        checked_at timestamptz,watchmode_seen_at timestamptz,link text,show_data jsonb);
    alter table public.kd_motn_offers enable trigger kd_streaming_page_motn_row;
    update public.kd_catalog set payload=case name
      when 'streaming_bekannt' then '${JSON.stringify(realKnown).replaceAll("'", "''")}'::jsonb
      else '${JSON.stringify(realDiscover).replaceAll("'", "''")}'::jsonb end,
      stand='${realDiscoverRow.stand}'::timestamptz,updated_at='${realDiscoverRow.updated_at}'::timestamptz
      where name in ('streaming_bekannt','streaming_entdecken');`);
  const rebuildMs = performance.now() - realBefore;
  const realServices = ["Netflix", "Disney+", "Prime Video"];
  const jsCombined = applyMotnStreaming(vereinigeStreamingTitel(realKnown, realDiscover),
    motnEnvelope(realDiscoverRow.payload.motn, realKnownRow.payload.motn));
  const expected = jsCombined.filter((title) => title.dienste?.some((service) => realServices.includes(service))).length;
  const pageBefore = performance.now();
  const realPage = call(request({ services: realServices }));
  const pageMs = performance.now() - pageBefore;
  check("real neutral catalogs keep selected-service count parity and a 20-item first page", () => {
    assert.equal(realPage.counts.all, expected); assert.equal(realPage.items.length, 20);
    assert.equal(Number(sql("select count(*) from public.kd_streaming_page_base")),
      new Set(vereinigeStreamingTitel(realKnown, realDiscover).map((x) => String(x.watchmode_id ?? x.streaming_id))).size);
  });
  console.log(`real fixture: ${realPage.counts.all}/${jsCombined.length} selected/all, projection ${rebuildMs.toFixed(0)} ms, page ${pageMs.toFixed(0)} ms`);
  console.log(`${checks} Streaming-pages PostgreSQL checks passed.`);
} finally {
  if (running) run("pg_ctl", ["--pgdata", data, "--wait", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
