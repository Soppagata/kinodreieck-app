/* E18 schema-preflight + scoped PG17 roundtrip, synthetic local data only. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const PG = "/Applications/Postgres.app/Contents/Versions/17/bin";
const SCOPE = Object.freeze(["--schema=public", "--schema=supabase_migrations"]);
const root = mkdtempSync("/private/tmp/kinodreieck-e18-pg17-");
chmodSync(root, 0o700);
const source = Object.freeze({
  data: join(root, "source-data"),
  log: join(root, "source.log"),
  socket: join(root, "source-socket"),
  port: "65441",
});
const restored = Object.freeze({
  data: join(root, "restore-data"),
  log: join(root, "restore.log"),
  socket: join(root, "restore-socket"),
  port: "65442",
});
const env = Object.freeze({
  LANG: "C",
  LC_ALL: "C",
  NO_COLOR: "1",
  PATH: `${PG}:/usr/bin:/bin`,
  TMPDIR: root,
});
const running = new Set();
let fullRestoreStarts = 0;

function raw(binary, argv, { input = null, timeout = 120_000, stdout = "pipe" } = {}) {
  return spawnSync(`${PG}/${binary}`, argv, {
    cwd: root,
    env,
    encoding: null,
    input,
    maxBuffer: 4 * 1024 * 1024,
    timeout,
    shell: false,
    stdio: [input === null ? "ignore" : "pipe", stdout, "pipe"],
  });
}

function run(binary, argv, options = {}) {
  const result = raw(binary, argv, options);
  if (!result || result.error || result.signal || result.status !== 0) {
    throw new Error(`PG17_SYNTHETIC_${binary.toUpperCase()}_FAILED`);
  }
  return Buffer.from(result.stdout || []);
}

function init(cluster) {
  mkdirSync(cluster.socket, { mode: 0o700 });
  run("initdb", [
    "--no-locale", "--encoding=UTF8", "--auth=trust", "--pgdata", cluster.data,
  ]);
  running.add(cluster);
  run("pg_ctl", [
    "--pgdata", cluster.data,
    "--log", cluster.log,
    "--options",
    `-c listen_addresses= -c unix_socket_directories=${cluster.socket} -p ${cluster.port}`,
    "--wait", "start",
  ]);
}

function stop(cluster) {
  if (!running.has(cluster)) return;
  run("pg_ctl", ["--pgdata", cluster.data, "--wait", "stop"]);
  running.delete(cluster);
  assert.deepEqual(readdirSync(cluster.socket), []);
}

function createdb(cluster, database) {
  run("createdb", ["--host", cluster.socket, "--port", cluster.port, database]);
}

function psql(cluster, database, sql) {
  return run("psql", [
    "--host", cluster.socket,
    "--port", cluster.port,
    "--dbname", database,
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align",
    "--set", "ON_ERROR_STOP=on", "--file", "-",
  ], { input: Buffer.from(sql, "utf8") }).toString("utf8").trim();
}

function dump(cluster, database, archive) {
  run("pg_dump", [
    "--format=custom", "--column-inserts", "--no-owner", "--no-privileges",
    "--file", archive,
    "--host", cluster.socket, "--port", cluster.port, database,
  ]);
  chmodSync(archive, 0o600);
  assert.equal(statSync(archive).mode & 0o077, 0);
  assert.ok(readFileSync(archive).length > 0);
}

function canonicalDump(bytes) {
  return bytes.toString("utf8")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("--") && !line.startsWith("\\restrict ")
      && !line.startsWith("\\unrestrict "))
    .join("\n")
    .trim();
}

function projectionDigest(path) {
  try {
    const info = statSync(path);
    assert.equal(info.isFile(), true);
    assert.equal(info.mode & 0o077, 0);
    const canonical = canonicalDump(readFileSync(path));
    return Object.freeze({
      sha256: createHash("sha256").update(canonical).digest("hex"),
      lineCount: canonical === "" ? 0 : canonical.split("\n").length,
      bytes: Buffer.byteLength(canonical),
    });
  } finally {
    rmSync(path, { force: true });
    assert.equal(existsSync(path), false);
  }
}

function runProjection(binary, argv, path) {
  writeFileSync(path, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  run(binary, argv, { stdout: "ignore" });
  return projectionDigest(path);
}

function freshTarget(database) {
  createdb(restored, database);
  psql(restored, database, "create schema supabase_migrations;");
}

function schemaPreflight(database, archive) {
  return raw("pg_restore", [
    "--schema-only", "--exit-on-error", "--single-transaction",
    "--no-owner", "--no-privileges", ...SCOPE,
    "--host", restored.socket, "--port", restored.port,
    "--dbname", database, archive,
  ]);
}

function succeeded(result) {
  return Boolean(result && !result.error && !result.signal && result.status === 0);
}

function fullRestore(database, archive) {
  fullRestoreStarts += 1;
  run("pg_restore", [
    "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges",
    ...SCOPE,
    "--host", restored.socket, "--port", restored.port,
    "--dbname", database, archive,
  ]);
}

const sharedSql = String.raw`
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key,
  statements text[] not null,
  name text not null
);
insert into supabase_migrations.schema_migrations values
  ('20260817120000', array['synthetic'], 'blog_profile_extract_config');
`;
const mainSql = String.raw`
${sharedSql}
create schema managed_case;
create extension hstore with schema managed_case;
create table public.kd_items (
  id integer primary key,
  title text not null,
  release_year integer not null check (release_year between 1888 and 2200),
  payload jsonb not null
);
create unique index kd_items_title_year_idx on public.kd_items(title, release_year);
insert into public.kd_items values
  (1, 'Die Bühne', 2026, '{"region":"AT","kind":"film"}'::jsonb),
  (2, 'Radar Δ', 2025, '{"kind":"series","region":"AT"}'::jsonb);
create table public.large_items (id integer primary key, payload text not null);
insert into public.large_items
select id, repeat(chr(96 + id), 1024 * 1024) from generate_series(1, 5) id;
create table managed_case.irrelevant_items (id integer primary key, attrs managed_case.hstore);
`;
const allowedPolicySql = String.raw`
${sharedSql}
create table public.policy_items (id integer primary key, visible boolean not null);
alter table public.policy_items enable row level security;
create policy policy_items_read on public.policy_items for select to anon using (visible);
`;
const foreignPolicySql = String.raw`
${sharedSql}
create table public.policy_items (id integer primary key, visible boolean not null);
alter table public.policy_items enable row level security;
create policy policy_items_read on public.policy_items for select to kd_e18_foreign_role using (visible);
`;
const dependencySql = String.raw`
${sharedSql}
create schema managed_case;
create extension hstore with schema managed_case;
create table public.extension_dependent_items (
  id integer primary key,
  attrs managed_case.hstore not null
);
`;

const exactProjectionSql = String.raw`select jsonb_build_object(
  'columns', (select jsonb_agg(jsonb_build_object(
      'table', c.relname, 'name', a.attname,
      'type', pg_catalog.format_type(a.atttypid,a.atttypmod), 'notNull', a.attnotnull
    ) order by c.relname,a.attnum)
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','supabase_migrations') and c.relkind='r'
      and a.attnum>0 and not a.attisdropped),
  'constraints', (select jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'table', c.relname, 'type', con.contype,
      'definition', pg_catalog.pg_get_constraintdef(con.oid,true)
    ) order by n.nspname,c.relname,con.contype,pg_catalog.pg_get_constraintdef(con.oid,true))
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid=con.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','supabase_migrations')),
  'itemCount', (select count(*) from public.kd_items),
  'items', (select jsonb_agg(jsonb_build_object(
      'id',id,'title',title,'year',release_year,'payload',payload
    ) order by id) from public.kd_items),
  'largeCount', (select count(*) from public.large_items),
  'largeBytes', (select sum(octet_length(payload)) from public.large_items),
  'largeDigest', (select md5(string_agg(md5(payload), ',' order by id)) from public.large_items),
  'migrationCount', (select count(*) from supabase_migrations.schema_migrations),
  'migrations', (select jsonb_agg(jsonb_build_object(
      'version',version,'statements',statements,'name',name
    ) order by version) from supabase_migrations.schema_migrations)
)::text;`;

function exactProjection(cluster, database) {
  const value = JSON.parse(psql(cluster, database, exactProjectionSql));
  return Object.freeze({
    value,
    digest: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  });
}

try {
  init(source);
  init(restored);
  psql(source, "postgres", [
    "create role anon nologin;",
    "create role authenticated nologin;",
    "create role service_role nologin;",
    "create role kd_e18_foreign_role nologin;",
  ].join("\n"));
  psql(restored, "postgres", [
    "create role anon nologin;",
    "create role authenticated nologin;",
    "create role service_role nologin;",
  ].join("\n"));

  const fixtures = Object.freeze({
    main: Object.freeze(["source_main", mainSql, join(root, "main.dump")]),
    allowed: Object.freeze(["source_allowed", allowedPolicySql, join(root, "allowed.dump")]),
    foreign: Object.freeze(["source_foreign", foreignPolicySql, join(root, "foreign.dump")]),
    dependency: Object.freeze(["source_dependency", dependencySql, join(root, "dependency.dump")]),
  });
  for (const [database, sql, archive] of Object.values(fixtures)) {
    createdb(source, database);
    psql(source, database, sql);
    dump(source, database, archive);
  }

  const archiveSchemaPath = join(root, "archive-schema.sql");
  const archiveDataPath = join(root, "archive-data.sql");
  const archivedSchema = runProjection("pg_restore", [
    "--schema-only", "--no-owner", "--no-privileges", ...SCOPE,
    "--file", archiveSchemaPath, fixtures.main[2],
  ], archiveSchemaPath);
  const archivedData = runProjection("pg_restore", [
    "--data-only", "--no-owner", "--no-privileges", ...SCOPE,
    "--file", archiveDataPath, fixtures.main[2],
  ], archiveDataPath);
  assert.ok(archivedData.bytes > 4 * 1024 * 1024);

  freshTarget("scope_preflight");
  assert.equal(succeeded(schemaPreflight("scope_preflight", fixtures.main[2])), true);
  assert.equal(psql(restored, "scope_preflight", "select exists(select 1 from pg_extension where extname='hstore');"), "f");
  assert.equal(psql(restored, "scope_preflight", "select exists(select 1 from pg_namespace where nspname='managed_case');"), "f");

  freshTarget("allowed_preflight");
  assert.equal(succeeded(schemaPreflight("allowed_preflight", fixtures.allowed[2])), true);

  const beforeForeign = fullRestoreStarts;
  freshTarget("foreign_preflight");
  assert.equal(succeeded(schemaPreflight("foreign_preflight", fixtures.foreign[2])), false);
  assert.equal(fullRestoreStarts, beforeForeign);

  const beforeDependency = fullRestoreStarts;
  freshTarget("dependency_preflight");
  assert.equal(succeeded(schemaPreflight("dependency_preflight", fixtures.dependency[2])), false);
  assert.equal(fullRestoreStarts, beforeDependency);

  freshTarget("schema_preflight");
  assert.equal(succeeded(schemaPreflight("schema_preflight", fixtures.main[2])), true);
  const before = exactProjection(source, fixtures.main[0]);
  assert.equal(before.value.itemCount, 2);
  assert.equal(before.value.largeCount, 5);
  assert.ok(before.value.largeBytes > 4 * 1024 * 1024);

  freshTarget("radar_restore");
  fullRestore("radar_restore", fixtures.main[2]);
  const after = exactProjection(restored, "radar_restore");
  assert.deepEqual(after.value, before.value);
  assert.equal(after.digest, before.digest);
  assert.equal(fullRestoreStarts, 1);

  const restoredArchive = join(root, "restored-scoped.dump");
  run("pg_dump", [
    "--format=custom", "--column-inserts", "--no-owner", "--no-privileges", ...SCOPE,
    "--file", restoredArchive,
    "--host", restored.socket, "--port", restored.port, "radar_restore",
  ]);
  chmodSync(restoredArchive, 0o600);
  assert.equal(statSync(restoredArchive).mode & 0o077, 0);
  const restoredSchemaPath = join(root, "restored-schema.sql");
  const restoredDataPath = join(root, "restored-data.sql");
  const restoredSchema = runProjection("pg_restore", [
    "--schema-only", "--no-owner", "--no-privileges", ...SCOPE,
    "--file", restoredSchemaPath, restoredArchive,
  ], restoredSchemaPath);
  const restoredData = runProjection("pg_restore", [
    "--data-only", "--no-owner", "--no-privileges", ...SCOPE,
    "--file", restoredDataPath, restoredArchive,
  ], restoredDataPath);
  assert.deepEqual(restoredSchema, archivedSchema);
  assert.deepEqual(restoredData, archivedData);

  stop(restored);
  stop(source);
  console.log("1 E18-PG17-Schema-Preflight-Roundtrip bestanden (2 Schemas, Negativstopps, >4 MiB).");
} finally {
  try { stop(restored); } catch { /* primaerer Testfehler bleibt massgeblich */ }
  try { stop(source); } catch { /* primaerer Testfehler bleibt massgeblich */ }
  rmSync(root, { recursive: true, force: true });
  assert.equal(existsSync(root), false);
}
