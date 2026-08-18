/* E18 PG17-Roundtrip: ausschliesslich synthetische lokale Daten. */
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
const root = mkdtempSync("/private/tmp/kinodreieck-e18-pg17-");
chmodSync(root, 0o700);
const source = {
  data: join(root, "source-data"),
  log: join(root, "source.log"),
  socket: join(root, "source-socket"),
  port: "65441",
};
const restored = {
  data: join(root, "restore-data"),
  log: join(root, "restore.log"),
  socket: join(root, "restore-socket"),
  port: "65442",
};
const archive = join(root, "synthetic.dump");
const archivedSchemaProjection = join(root, "archive-schema.projection.sql");
const archivedDataProjection = join(root, "archive-data.projection.sql");
const restoredSchemaProjection = join(root, "restore-schema.projection.sql");
const restoredDataProjection = join(root, "restore-data.projection.sql");
const env = Object.freeze({
  LANG: "C",
  LC_ALL: "C",
  NO_COLOR: "1",
  PATH: `${PG}:/usr/bin:/bin`,
  TMPDIR: root,
});
const running = new Set();

function run(binary, argv, {
  input = null,
  ok = [0],
  timeout = 120_000,
  stdout = "pipe",
} = {}) {
  const result = spawnSync(`${PG}/${binary}`, argv, {
    cwd: root,
    env,
    encoding: null,
    input,
    maxBuffer: 4 * 1024 * 1024,
    timeout,
    shell: false,
    stdio: [input === null ? "ignore" : "pipe", stdout, "pipe"],
  });
  if (!result || result.error || result.signal || !ok.includes(result.status)) {
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
    "--wait",
    "start",
  ]);
  run("createdb", ["--host", cluster.socket, "--port", cluster.port, "radar_roundtrip"]);
}

function stop(cluster) {
  if (!running.has(cluster)) return;
  run("pg_ctl", ["--pgdata", cluster.data, "--wait", "stop"]);
  running.delete(cluster);
  assert.deepEqual(readdirSync(cluster.socket), []);
}

function psql(cluster, sql) {
  return run("psql", [
    "--host", cluster.socket,
    "--port", cluster.port,
    "--dbname", "radar_roundtrip",
    "--no-psqlrc", "--tuples-only", "--no-align",
    "--set", "ON_ERROR_STOP=on", "--file", "-",
  ], { input: sql }).toString("utf8").trim();
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

const schemaSql = String.raw`begin;
create schema spike;
create table spike.items (
  id integer primary key,
  title text not null,
  release_year integer not null check (release_year between 1888 and 2200),
  payload jsonb not null,
  note text
);
create unique index items_title_year_unique on spike.items (title, release_year);
create table spike.large_items (
  id integer primary key,
  payload text not null
);
insert into spike.items values
  (1, 'Die Bühne', 2026, '{"kind":"film","regions":["AT"]}'::jsonb, null),
  (2, 'Österreich Eins', 2025, '{"nested":{"b":2,"a":1}}'::jsonb, 'synthetisch'),
  (3, 'Radar Δ', 2024, '[true,false,3]'::jsonb, 'nur lokal');
insert into spike.large_items
select id, repeat(chr(96 + id), 1024 * 1024)
from generate_series(1, 5) id;
commit;`;

const projectionSql = String.raw`select jsonb_build_object(
  'columns', (select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) order by a.attnum)
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='spike' and c.relname='items' and a.attnum>0 and not a.attisdropped),
  'constraints', (select jsonb_agg(jsonb_build_object('type',con.contype,'definition',pg_catalog.pg_get_constraintdef(con.oid,true)) order by con.contype, pg_catalog.pg_get_constraintdef(con.oid,true))
    from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid=con.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='spike' and c.relname='items'),
  'indexes', (select jsonb_agg(indexdef order by indexname) from pg_catalog.pg_indexes where schemaname='spike' and tablename='items'),
  'count', (select count(*) from spike.items),
  'rows', (select jsonb_agg(jsonb_build_object('id',id,'title',title,'year',release_year,'payload',payload,'note',note) order by id) from spike.items),
  'largeCount', (select count(*) from spike.large_items),
  'largeBytes', (select sum(octet_length(payload)) from spike.large_items),
  'largeDigest', (select md5(string_agg(md5(payload), ',' order by id)) from spike.large_items)
)::text;`;

try {
  init(source);
  psql(source, schemaSql);
  const before = JSON.parse(psql(source, projectionSql));
  assert.equal(before.count, 3);
  assert.equal(before.columns.length, 5);
  assert.equal(before.constraints.length, 2);
  assert.equal(before.indexes.length, 2);
  assert.equal(before.largeCount, 5);
  assert.ok(before.largeBytes > 4 * 1024 * 1024);

  run("pg_dump", [
    "--format=custom", "--column-inserts", "--no-owner", "--no-privileges", "--file", archive,
    "--host", source.socket, "--port", source.port, "radar_roundtrip",
  ]);
  chmodSync(archive, 0o600);
  assert.equal(statSync(archive).mode & 0o077, 0);
  assert.ok(readFileSync(archive).length > 0);
  const archivedSchema = runProjection("pg_restore", [
    "--schema-only", "--no-owner", "--no-privileges",
    "--file", archivedSchemaProjection, archive,
  ], archivedSchemaProjection);
  const archivedData = runProjection("pg_restore", [
    "--data-only", "--no-owner", "--no-privileges",
    "--file", archivedDataProjection, archive,
  ], archivedDataProjection);

  init(restored);
  run("pg_restore", [
    "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges",
    "--host", restored.socket, "--port", restored.port,
    "--dbname", "radar_roundtrip", archive,
  ]);
  const after = JSON.parse(psql(restored, projectionSql));
  assert.deepEqual(after, before);
  const restoredSchema = runProjection("pg_dump", [
    "--schema-only", "--no-owner", "--no-privileges", "--file", restoredSchemaProjection,
    "--host", restored.socket, "--port", restored.port, "radar_roundtrip",
  ], restoredSchemaProjection);
  const restoredData = runProjection("pg_dump", [
    "--data-only", "--column-inserts", "--no-owner", "--no-privileges", "--file", restoredDataProjection,
    "--host", restored.socket, "--port", restored.port, "radar_roundtrip",
  ], restoredDataProjection);
  assert.deepEqual(restoredSchema, archivedSchema);
  assert.deepEqual(restoredData, archivedData);

  stop(restored);
  stop(source);
  console.log("1 E18-PG17-Roundtripcheck bestanden (synthetische Datenprojektion groesser 4 MiB).");
} finally {
  try { stop(restored); } catch { /* primaerer Testfehler bleibt massgeblich */ }
  try { stop(source); } catch { /* primaerer Testfehler bleibt massgeblich */ }
  rmSync(root, { recursive: true, force: true });
  assert.equal(existsSync(root), false);
}
