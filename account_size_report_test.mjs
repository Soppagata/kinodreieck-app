import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EXECUTION_MARKER,
  EXIT,
  PROJECT_REF,
  REQUIRED_DATA_CLASSES,
  SERVICE_ROLE_KEYCHAIN,
  formatReport,
  main,
  readServiceRoleKey,
  requestAccountSizeReport,
  validateReportResponse,
} from "./tools/account_size_report.mjs";
import { ACCOUNT_EXPORT_REQUIRED_SCOPE } from "./src/lib/privatePilotOps.js";

const sql = readFileSync(
  "supabase/migrations/20260902130000_private_account_size_report.sql",
  "utf8",
);
const ACCOUNT_ID = "123e4567-e89b-12d3-a456-426614174000";
const SECRET = "sb_secret_synthetic_service_role_value_1234567890";
const PG17 = "/Applications/Postgres.app/Contents/Versions/17/bin";
let checks = 0;
const check = async (name, run) => {
  await run();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
};

const rows = REQUIRED_DATA_CLASSES.map((dataClass, index) => ({
  dataClass,
  rows: index % 3,
  bytes: (index % 3) * 41,
}));
const totals = rows.reduce(
  (sum, entry) => ({ rows: sum.rows + entry.rows, bytes: sum.bytes + entry.bytes }),
  { rows: 0, bytes: 0 },
);
const validPayload = {
  schemaVersion: "kinodreieck-account-size-report-v1",
  classes: rows,
  totals,
};

await check("Migration definiert genau den service-role-only UUID-RPC ohne Browser-Execute", () => {
  assert.match(sql, /create function public\.kd_private_account_size_report\(p_account_id uuid\)/i);
  assert.match(sql, /security definer[\s\S]*set search_path = pg_catalog, public/i);
  assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(sql, /revoke all on function public\.kd_private_account_size_report\(uuid\)\s+from public, anon, authenticated, service_role;/i);
  assert.match(sql, /grant execute on function public\.kd_private_account_size_report\(uuid\)\s+to service_role;/i);
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function[^;]+\bto\s+(?:public|anon|authenticated)\b/i);
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)\s+on\s+table/i);
});

await check("Scope ist bytegleich zu allen 13 eingefrorenen Release-IDs und enthält 0/0-Metaklassen", () => {
  const sourceIds = ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => entry.id);
  assert.equal(sourceIds.length, 13);
  assert.deepEqual(REQUIRED_DATA_CLASSES, sourceIds);
  for (const id of sourceIds) assert.match(sql, new RegExp(`'${id}'`, "g"));
  assert.match(sql, /\(12, 'retention-information'::text\)/);
  assert.match(sql, /coalesce\(sum\(m\.row_count\), 0\)/i);
  assert.match(sql, /left join measurements m on m\.sort_order = s\.sort_order/i);
});

await check("Nur accountgebundene Release-Flächen werden serverseitig als Zeilen und pg_column_size aggregiert", () => {
  const requiredTables = [
    "auth.users", "auth.identities", "kd_account_access", "kd_personal", "kd_ai_log",
    "kd_series_watch", "kd_shared_articles", "kd_shared_article_claims",
    "kd_radar_capabilities", "kd_radar_account_state", "kd_radar_subscriptions",
    "kd_radar_receipts", "kd_radar_target_shares", "kd_radar_operations",
    "kd_radar_share_operations", "kd_radar_reviews", "kd_radar_pilot_import_operations",
    "kd_radar_text_findings", "kd_private_delete_operations",
  ];
  for (const table of requiredTables) assert.match(sql, new RegExp(table.replace(".", "\\.")));
  assert.ok((sql.match(/pg_column_size\(/g) || []).length >= requiredTables.length);
  assert.doesNotMatch(sql, /\bfrom\s+(?:public\.)?(?:kd_store|kd_catalog|kd_radar_targets|kd_radar_events|kd_radar_event_versions|kd_radar_evidence|kd_entdecken\w*)\b/i);
  assert.doesNotMatch(sql, /jsonb_agg\(to_jsonb|select\s+\*/i);
});

await check("Response-Validator akzeptiert nur exakte Reihenfolge, Zahlen und prüfbare Gesamtsumme", () => {
  const report = validateReportResponse(validPayload);
  assert.deepEqual(report.totals, totals);
  assert.deepEqual(report.classes.map((entry) => entry.dataClass), REQUIRED_DATA_CLASSES);
  assert.throws(() => validateReportResponse({ ...validPayload, accountId: ACCOUNT_ID }), /ACCOUNT_SIZE_RESPONSE_INVALID/);
  assert.throws(() => validateReportResponse({ ...validPayload, classes: rows.slice(1) }), /ACCOUNT_SIZE_RESPONSE_INVALID/);
  assert.throws(() => validateReportResponse({ ...validPayload, classes: [...rows].reverse() }), /ACCOUNT_SIZE_RESPONSE_INVALID/);
  assert.throws(() => validateReportResponse({ ...validPayload, totals: { ...totals, bytes: totals.bytes + 1 } }), /ACCOUNT_SIZE_RESPONSE_INVALID/);
  assert.throws(() => validateReportResponse({
    ...validPayload,
    classes: rows.map((entry, index) => index === 0 ? { ...entry, payload: "verboten" } : entry),
  }), /ACCOUNT_SIZE_RESPONSE_INVALID/);
});

await check("Formatter gibt ausschließlich Klasse, rows, bytes und total aus", () => {
  const output = formatReport(validateReportResponse(validPayload));
  assert.equal(output.length, 14);
  assert.equal(output[0], `${REQUIRED_DATA_CLASSES[0]}\trows=0\tbytes=0`);
  assert.equal(output.at(-1), `total\trows=${totals.rows}\tbytes=${totals.bytes}`);
  assert.ok(output.every((line) => /^(?:[a-z][a-z-]+|total)\trows=\d+\tbytes=\d+$/.test(line)));
  assert.ok(output.every((line) => !line.includes(ACCOUNT_ID) && !line.includes(SECRET)));
});

await check("Keychain-Leser ist auf das feste Projektkonto gebunden und nutzt keine Shell", () => {
  let call;
  const result = readServiceRoleKey({
    platform: "darwin",
    securityRun(binary, argv, options) {
      call = { binary, argv, options };
      return { status: 0, stdout: `${SECRET}\n`, stderr: "" };
    },
  });
  assert.equal(result, SECRET);
  assert.equal(SERVICE_ROLE_KEYCHAIN.service, `at.kinodreieck.codex.supabase.${PROJECT_REF}`);
  assert.deepEqual(call.argv, [
    "find-generic-password", "-s", SERVICE_ROLE_KEYCHAIN.service,
    "-a", "SUPABASE_SERVICE_ROLE_KEY", "-w",
  ]);
  assert.equal(call.binary, "/usr/bin/security");
  assert.equal(call.options.shell, false);
  assert.throws(() => readServiceRoleKey({ platform: "linux" }), /ACCOUNT_SIZE_KEYCHAIN_UNAVAILABLE/);
});

await check("RPC-Transport sendet nur UUID und gibt keine rohe Antwort weiter", async () => {
  let request;
  const report = await requestAccountSizeReport({
    baseUrl: `https://${PROJECT_REF}.supabase.co`,
    serviceRoleKey: SECRET,
    accountId: ACCOUNT_ID,
    signalFactory: () => ({ synthetic: true }),
    async fetchImpl(url, init) {
      request = { url, init };
      return { ok: true, async json() { return validPayload; } };
    },
  });
  assert.equal(request.url, `https://${PROJECT_REF}.supabase.co/rest/v1/rpc/kd_private_account_size_report`);
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.apikey, SECRET);
  assert.equal(request.init.headers.Authorization, `Bearer ${SECRET}`);
  assert.deepEqual(JSON.parse(request.init.body), { p_account_id: ACCOUNT_ID });
  assert.deepEqual(report.totals, totals);
});

await check("Ohne exakten Marker oder kanonische UUID stoppt main vor Konfig, Keychain und Netzwerk", async () => {
  for (const argv of [[], [ACCOUNT_ID], [EXECUTION_MARKER, ACCOUNT_ID.toUpperCase()]]) {
    let effects = 0;
    const errors = [];
    const code = await main(argv, {
      configReader() { effects += 1; },
      keychainReader() { effects += 1; },
      fetchImpl() { effects += 1; },
      logError: (line) => errors.push(line),
    });
    assert.equal(code, EXIT.NOT_STARTED);
    assert.equal(effects, 0);
    assert.equal(errors.length, 1);
  }
});

await check("Fehlendes Credential stoppt nach Zielprüfung und vor jedem Netzwerkaufruf", async () => {
  let network = 0;
  const code = await main([EXECUTION_MARKER, ACCOUNT_ID], {
    configReader: () => ({ KD_SB_URL: `https://${PROJECT_REF}.supabase.co` }),
    keychainReader() { throw new Error("missing"); },
    fetchImpl() { network += 1; },
    logError() {},
  });
  assert.equal(code, EXIT.KEYCHAIN_MISSING);
  assert.equal(network, 0);
});

await check("Erfolg protokolliert weder Account-ID, Secret noch Inhaltsfelder", async () => {
  const output = [];
  const errors = [];
  const code = await main([EXECUTION_MARKER, ACCOUNT_ID], {
    configReader: () => ({ KD_SB_URL: `https://${PROJECT_REF}.supabase.co` }),
    keychainReader: () => SECRET,
    async fetchImpl() { return { ok: true, async json() { return validPayload; } }; },
    signalFactory: () => ({ synthetic: true }),
    log: (line) => output.push(line),
    logError: (line) => errors.push(line),
  });
  assert.equal(code, EXIT.OK);
  assert.deepEqual(output, formatReport(validateReportResponse(validPayload)));
  assert.deepEqual(errors, []);
  const serialized = output.join("\n");
  assert.ok(!serialized.includes(ACCOUNT_ID));
  assert.ok(!serialized.includes(SECRET));
  assert.ok(!/(?:title|payload|url|key|id)=/i.test(serialized));
});

await check("Formfremde oder inhaltstragende Serverantwort wird ohne Rohdaten gestoppt", async () => {
  const privateMarker = "PRIVATE_TITLE_OR_URL_MUST_NOT_LEAK";
  const output = [];
  const errors = [];
  const code = await main([EXECUTION_MARKER, ACCOUNT_ID], {
    configReader: () => ({ KD_SB_URL: `https://${PROJECT_REF}.supabase.co` }),
    keychainReader: () => SECRET,
    async fetchImpl() {
      return {
        ok: true,
        async json() { return { ...validPayload, title: privateMarker }; },
      };
    },
    signalFactory: () => ({ synthetic: true }),
    log: (line) => output.push(line),
    logError: (line) => errors.push(line),
  });
  assert.equal(code, EXIT.RESPONSE_INVALID);
  assert.deepEqual(output, []);
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes(privateMarker));
  assert.ok(!errors[0].includes(ACCOUNT_ID));
});

await check("Disposable PostgreSQL prüft Migration, Aggregation und ACL-Grenze wenn lokal ausführbar", () => {
  if (!existsSync(join(PG17, "initdb"))) return;

  const root = mkdtempSync(join(tmpdir(), "kd-account-size-pg-"));
  const data = join(root, "data");
  const socket = join(root, "socket");
  const log = join(root, "postgres.log");
  const port = String(46_000 + (process.pid % 1_000));
  mkdirSync(socket, { mode: 0o700 });
  let started = false;
  const run = (binary, argv, input) => {
    const result = spawnSync(join(PG17, binary), argv, {
      encoding: "utf8",
      input,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      shell: false,
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(result.error, undefined, `${binary} konnte nicht starten`);
    return result;
  };
  const psql = (args = [], input) => run("psql", [
    "--host", socket,
    "--port", port,
    "--dbname", "postgres",
    "--no-psqlrc",
    "--tuples-only",
    "--no-align",
    "--set", "ON_ERROR_STOP=on",
    ...args,
  ], input);

  try {
    const init = run("initdb", [
      "--pgdata", data,
      "--no-locale",
      "--encoding=UTF8",
      "--auth=trust",
    ]);
    if (init.status !== 0 && /could not create shared memory segment: Operation not permitted/i.test(init.stderr)) {
      return;
    }
    assert.equal(init.status, 0, init.stderr);
    const start = run("pg_ctl", [
      "--pgdata", data,
      "--log", log,
      "--options", `-k ${socket} -h '' -p ${port}`,
      "--wait",
      "start",
    ]);
    assert.equal(start.status, 0, start.stderr);
    started = true;

    const scaffold = psql([], `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create schema extensions;
      create extension pgcrypto with schema extensions;
      create function auth.role() returns text language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
      create table auth.users(id uuid, payload text);
      create table auth.identities(user_id uuid, payload text);
      create table public.kd_account_access(account_id uuid, payload text);
      create table public.kd_personal(account_id uuid, payload text);
      create table public.kd_ai_log(account_id uuid, payload text);
      create table public.kd_series_watch(account_id uuid, payload text);
      create table public.kd_shared_articles(account_id uuid, payload text);
      create table public.kd_shared_article_claims(account_id uuid, payload text);
      create table public.kd_radar_capabilities(account_id uuid, payload text);
      create table public.kd_radar_account_state(account_id uuid, payload text);
      create table public.kd_radar_subscriptions(account_id uuid, payload text);
      create table public.kd_radar_receipts(account_id uuid, payload text);
      create table public.kd_radar_target_shares(account_id uuid, payload text);
      create table public.kd_radar_operations(account_id uuid, payload text);
      create table public.kd_radar_share_operations(account_id uuid, payload text);
      create table public.kd_radar_reviews(actor_id uuid, payload text);
      create table public.kd_radar_pilot_import_operations(actor_id uuid, payload text);
      create table public.kd_radar_text_findings(account_id uuid, payload text);
      create table public.kd_private_delete_operations(account_hash text, payload text);
    `);
    assert.equal(scaffold.status, 0, scaffold.stderr);

    const migration = psql(["--file", "supabase/migrations/20260902130000_private_account_size_report.sql"]);
    assert.equal(migration.status, 0, migration.stderr);

    const accountTables = [
      "kd_account_access", "kd_personal", "kd_ai_log", "kd_series_watch",
      "kd_shared_articles", "kd_shared_article_claims", "kd_radar_capabilities",
      "kd_radar_account_state", "kd_radar_subscriptions", "kd_radar_receipts",
      "kd_radar_target_shares", "kd_radar_operations", "kd_radar_share_operations",
      "kd_radar_text_findings",
    ];
    const actorTables = ["kd_radar_reviews", "kd_radar_pilot_import_operations"];
    const fixtures = psql([], `
      insert into auth.users values ('${ACCOUNT_ID}', 'synthetic');
      insert into auth.identities values ('${ACCOUNT_ID}', 'synthetic');
      ${accountTables.map((table) => `insert into public.${table} values ('${ACCOUNT_ID}', 'synthetic');`).join("\n")}
      ${actorTables.map((table) => `insert into public.${table} values ('${ACCOUNT_ID}', 'synthetic');`).join("\n")}
      insert into public.kd_private_delete_operations values (
        encode(extensions.digest(convert_to('${ACCOUNT_ID}'::uuid::text, 'UTF8'), 'sha256'), 'hex'),
        'synthetic'
      );
    `);
    assert.equal(fixtures.status, 0, fixtures.stderr);

    const reportResult = psql(["--command", `
      set request.jwt.claim.role = 'service_role';
      select public.kd_private_account_size_report('${ACCOUNT_ID}'::uuid);
    `]);
    assert.equal(reportResult.status, 0, reportResult.stderr);
    const lines = reportResult.stdout.trim().split(/\r?\n/).filter((line) => line.startsWith("{"));
    assert.equal(lines.length, 1);
    const report = validateReportResponse(JSON.parse(lines[0]));
    assert.equal(report.classes.length, 13);
    assert.equal(report.classes[11].dataClass, "retention-information");
    assert.deepEqual(
      { rows: report.classes[11].rows, bytes: report.classes[11].bytes },
      { rows: 0, bytes: 0 },
    );
    assert.equal(report.totals.rows, 19);
    assert.ok(report.totals.bytes > 0);

    const acl = psql(["--command", `select
      has_function_privilege('public', 'public.kd_private_account_size_report(uuid)', 'execute'),
      has_function_privilege('anon', 'public.kd_private_account_size_report(uuid)', 'execute'),
      has_function_privilege('authenticated', 'public.kd_private_account_size_report(uuid)', 'execute'),
      has_function_privilege('service_role', 'public.kd_private_account_size_report(uuid)', 'execute');`]);
    assert.equal(acl.status, 0, acl.stderr);
    assert.equal(acl.stdout.trim(), "f|f|f|t");

    const denied = psql(["--command", `
      set request.jwt.claim.role = 'authenticated';
      select public.kd_private_account_size_report('${ACCOUNT_ID}'::uuid);
    `]);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /service role required/i);
  } finally {
    if (started) run("pg_ctl", ["--pgdata", data, "--wait", "stop"]);
    rmSync(root, { recursive: true, force: true });
  }
});

console.log(`account_size_report_test: ${checks} Checks bestanden (nur Mocks/Parser, kein Netzwerk).`);
