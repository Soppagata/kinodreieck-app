import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const LAB_ROOT = "/private/tmp/kd-streaming-performance-20260913";
const USE_LAB_FIXTURE = process.env.KD_STREAMING_FINAL_USE_LAB_FIXTURE === "1";
const ACCOUNT_ID = "00000000-0000-4000-8000-0000000000d3";
const TITLE_FIELDS = Object.freeze([
  "watchmode_id", "streaming_id", "streaming_aliases", "imdb_id", "tmdb_id",
  "titel", "originaltitel", "jahr", "typ", "genres", "genre", "dienste",
  "web_urls", "dienst_diffs", "motn_zugaenge", "motn_match", "motn_id",
]);
const SHOW_FIELDS = Object.freeze([
  "motn_id", "imdb_id", "tmdb_id", "titel", "originaltitel", "jahr", "typ",
  "genres", "at_subscription_services", "at_subscription_offers",
]);

function pick(value, fields) {
  return Object.fromEntries(fields.filter((field) => value?.[field] != null)
    .map((field) => [field, structuredClone(value[field])]));
}

function neutralPayload(row) {
  const source = row?.payload || {};
  return {
    stand: source.stand || row?.stand,
    katalog_stand: source.katalog_stand || row?.stand,
    region: source.region || "AT",
    dienste: Array.isArray(source.dienste) ? [...source.dienste] : [],
    stand_pro_quelle: source.stand_pro_quelle || {},
    vergleich_stand_pro_quelle: source.vergleich_stand_pro_quelle || {},
    titel: Array.isArray(source.titel) ? source.titel.map((title) => pick(title, TITLE_FIELDS)) : [],
  };
}

function loadFixture() {
  if (!USE_LAB_FIXTURE) {
    const now = "2026-09-13T12:00:00.000Z";
    const titles = Array.from({ length: 1260 }, (_, index) => ({
      watchmode_id: 900001 + index,
      imdb_id: `tt${String(9_000_001 + index)}`,
      tmdb_id: 800001 + index,
      titel: index === 1258 ? "Zodiac Fixture Target"
        : index === 1259 ? "xXx: Return of Xander Cage"
          : `Fixture Film ${String(index + 1).padStart(4, "0")}`,
      jahr: 1980 + index % 45,
      typ: index % 7 === 0 ? "tv_series" : "movie",
      genres: index % 2 === 0 ? ["Drama"] : ["Action"],
      dienste: [["Netflix"], ["Disney+"], ["Prime Video"]][index % 3],
      ...(index >= 220 && index < 244 ? { motn_zugaenge: [{
        dienst: [["Netflix"], ["Disney+"], ["Prime Video"]][index % 3][0],
        erkannt_am: "2026-09-12T12:00:00.000Z",
      }] } : {}),
    }));
    const payload = (items) => ({
      stand: now,
      katalog_stand: now,
      region: "AT",
      dienste: ["Netflix", "Disney+", "Prime Video"],
      stand_pro_quelle: { Netflix: now, "Disney+": now, "Prime Video": now },
      vergleich_stand_pro_quelle: { Netflix: now, "Disney+": now, "Prime Video": now },
      titel: items,
    });
    return {
      known: payload(titles.slice(0, 220)),
      discover: payload(titles.slice(220)),
      offers: [],
      stand: now,
      updatedAt: now,
    };
  }
  for (const name of ["streaming_bekannt.json", "streaming_entdecken.json", "synthetic-master.json"]) {
    if (!existsSync(join(LAB_ROOT, name))) throw new Error(`Explizite Lab-Fixture fehlt: ${join(LAB_ROOT, name)}`);
  }
  const knownRow = JSON.parse(readFileSync(join(LAB_ROOT, "streaming_bekannt.json"), "utf8"))[0];
  const discoverRow = JSON.parse(readFileSync(join(LAB_ROOT, "streaming_entdecken.json"), "utf8"))[0];
  const offers = discoverRow?.payload?.motn?.offers || knownRow?.payload?.motn?.offers || [];
  return {
    known: neutralPayload(knownRow),
    discover: neutralPayload(discoverRow),
    offers: offers.map((offer) => ({
      show_id: String(offer.show_id),
      service_id: String(offer.service_id),
      country: String(offer.country || "AT"),
      available: offer.available === true,
      event_at: offer.event_at,
      added_at: offer.added_at,
      checked_at: offer.checked_at,
      watchmode_seen_at: offer.watchmode_seen_at,
      link: offer.link,
      show_data: pick(offer.show_data, SHOW_FIELDS),
    })),
    stand: discoverRow.stand,
    updatedAt: discoverRow.updated_at,
  };
}

function findPg() {
  const configured = spawnSync("pg_config", ["--bindir"], { encoding: "utf8" });
  const candidates = [
    process.env.KD_TEST_PG_BIN,
    "/Applications/Postgres.app/Contents/Versions/17/bin",
    configured.status === 0 ? configured.stdout.trim() : null,
    "/usr/lib/postgresql/17/bin",
  ].filter(Boolean);
  const required = ["initdb", "pg_ctl", "psql"];
  const bin = [...new Set(candidates)].find((dir) => required.every((name) => existsSync(join(dir, name))));
  if (!bin) throw new Error(`PostgreSQL server binaries are required (${required.join(", ")})`);
  return bin;
}

export function loadSyntheticMaster() {
  if (USE_LAB_FIXTURE) return JSON.parse(readFileSync(join(LAB_ROOT, "synthetic-master.json"), "utf8"));
  return Array.from({ length: 226 }, (_, index) => ({
    id: `fixture-library-${index + 1}`,
    watchmode_id: 900001 + index,
    imdb_id: `tt${String(9_000_001 + index)}`,
    tmdb_id: 800001 + index,
    titel: `Fixture Film ${String(index + 1).padStart(3, "0")}`,
    jahr: 1980 + index % 45,
    typ: index % 7 === 0 ? "serie" : "film",
  }));
}

export async function startStreamingProgressivePgHarness() {
  const pg = findPg();
  const root = mkdtempSync(join(tmpdir(), "kd-pg-"));
  const data = join(root, "data");
  const socket = join(root, "s");
  const port = String(50000 + process.pid % 10000);
  const env = { PATH: `${pg}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C" };
  const psqlArgs = ["-h", socket, "-p", port, "-U", "postgres", "-d", "postgres", "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-f", "-"];
  let running = false;

  const run = (binary, args, input, maxBuffer = 64_000_000) => {
    const result = spawnSync(join(pg, binary), args, {
      input, encoding: "utf8", timeout: 120_000, maxBuffer, env,
    });
    if (result.status !== 0) throw new Error(`${binary}: ${result.stderr || result.error}`);
    return result.stdout.trim();
  };
  const sql = (query) => run("psql", psqlArgs, query);
  const sqlAsync = (query, maxBuffer = 64_000_000) => new Promise((resolve, reject) => {
    const child = spawn(join(pg, "psql"), psqlArgs, { env, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let size = 0;
    let finished = false;
    const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBuffer) child.kill("SIGKILL");
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8").trim());
      else reject(new Error(`psql: ${Buffer.concat(stderr).toString("utf8") || signal || code}`));
    });
    child.stdin.end(query);
  });
  const fixture = loadFixture();
  const migrations = [
    "supabase/migrations/20260913200000_streaming_pages_backend.sql",
    "supabase/migrations/20260914100000_streaming_pages_latency.sql",
  ].map((path) => readFileSync(path, "utf8"));

  try {
    mkdirSync(socket);
    run("initdb", ["--no-locale", "--encoding=UTF8", "--auth=trust", "--username=postgres", "--set",
      "shared_memory_type=mmap", "--pgdata", data]);
    run("pg_ctl", ["--pgdata", data, "--log", join(root, "postgres.log"), "--options",
      `-c listen_addresses= -c unix_socket_directories=${socket} -p ${port} -c shared_memory_type=mmap -c dynamic_shared_memory_type=posix`,
      "--wait", "start"]);
    running = true;
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
        ('streaming_bekannt','${JSON.stringify(fixture.known).replaceAll("'", "''")}',now(),'neutral-local-final','${fixture.stand}',null),
        ('streaming_entdecken','${JSON.stringify(fixture.discover).replaceAll("'", "''")}',now(),'neutral-local-final','${fixture.stand}',null);`);
    if (fixture.offers.length) {
      sql(`insert into public.kd_motn_offers(show_id,service_id,country,available,event_at,added_at,checked_at,watchmode_seen_at,link,show_data)
        select * from jsonb_to_recordset('${JSON.stringify(fixture.offers).replaceAll("'", "''")}'::jsonb)
        as x(show_id text,service_id text,country text,available boolean,event_at timestamptz,added_at timestamptz,
          checked_at timestamptz,watchmode_seen_at timestamptz,link text,show_data jsonb);`);
    }
    const buildStarted = performance.now();
    for (const migration of migrations) sql(migration);
    const projectionMs = performance.now() - buildStarted;
    const projectionCount = Number(sql("select count(*) from public.kd_streaming_page_base"));
    const calls = [];

    const call = (request, accountId = ACCOUNT_ID) => {
      const started = performance.now();
      const escaped = JSON.stringify(request).replaceAll("'", "''");
      const query = `begin; set local role authenticated;
        select set_config('request.jwt.claim.role','authenticated',true);
        select set_config('request.jwt.claim.sub','${String(accountId).replaceAll("'", "''")}',true);
        select set_config('fixture.active','true',true);
        select public.kd_streaming_page('${escaped}'::jsonb); rollback;`;
      const lines = sql(query).split("\n").map((line) => line.trim()).filter(Boolean);
      const response = JSON.parse(lines.at(-1));
      calls.push(Object.freeze({
        view: request.view,
        limit: request.limit,
        cursor: request.cursor ? "set" : "initial",
        status: response.status,
        items: response.items?.length || 0,
        total: response.total,
        counts: response.counts ? structuredClone(response.counts) : null,
        durationMs: Number((performance.now() - started).toFixed(1)),
      }));
      return response;
    };

    const callAsync = async (request, accountId = ACCOUNT_ID) => {
      const started = performance.now();
      const escaped = JSON.stringify(request).replaceAll("'", "''");
      const query = `begin; set local role authenticated;
        select set_config('request.jwt.claim.role','authenticated',true);
        select set_config('request.jwt.claim.sub','${String(accountId).replaceAll("'", "''")}',true);
        select set_config('fixture.active','true',true);
        select public.kd_streaming_page('${escaped}'::jsonb); rollback;`;
      const lines = (await sqlAsync(query)).split("\n").map((line) => line.trim()).filter(Boolean);
      const response = JSON.parse(lines.at(-1));
      calls.push(Object.freeze({
        view: request.view,
        limit: request.limit,
        cursor: request.cursor ? "set" : "initial",
        status: response.status,
        items: response.items?.length || 0,
        total: response.total,
        counts: response.counts ? structuredClone(response.counts) : null,
        durationMs: Number((performance.now() - started).toFixed(1)),
      }));
      return response;
    };

    return Object.freeze({
      accountId: ACCOUNT_ID,
      projectionMs: Number(projectionMs.toFixed(1)),
      projectionCount,
      calls,
      call,
      callAsync,
      catalogRow(name) {
        const payload = name === "streaming_bekannt" ? fixture.known : fixture.discover;
        return [{
          payload: {
            ...structuredClone(payload),
            motn: { format: 1, country: "AT", offers: structuredClone(fixture.offers) },
          },
          updated_at: fixture.updatedAt,
          quelle: "neutral-local-final",
          stand: fixture.stand,
          gueltig_bis: null,
        }];
      },
      stop() {
        if (running) {
          run("pg_ctl", ["--pgdata", data, "--wait", "stop"]);
          running = false;
        }
        rmSync(root, { recursive: true, force: true });
      },
    });
  } catch (error) {
    if (running) {
      try { run("pg_ctl", ["--pgdata", data, "--wait", "stop"]); } catch { /* retain original error */ }
    }
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
