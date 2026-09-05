import assert from "node:assert/strict";
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

const ACCOUNT_ID = "123e4567-e89b-12d3-a456-426614174000";
const SECRET = "sb_secret_synthetic_service_role_value_1234567890";
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

await check("Lokaler Diagnoseumfang entspricht den 13 eingefrorenen Datenklassen", () => {
  const sourceIds = ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => entry.id);
  assert.equal(sourceIds.length, 13);
  assert.deepEqual(REQUIRED_DATA_CLASSES, sourceIds);
  assert.ok(sourceIds.includes("retention-information"));
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

await check("Synthetischer Transport sendet nur UUID und gibt keine rohe Antwort weiter", async () => {
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

await check("Ohne exakten Marker oder kanonische UUID stoppt main vor Konfig, Keychain und Transport", async () => {
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

await check("Fehlendes Credential stoppt nach Zielprüfung und vor jedem Transportaufruf", async () => {
  let transport = 0;
  const code = await main([EXECUTION_MARKER, ACCOUNT_ID], {
    configReader: () => ({ KD_SB_URL: `https://${PROJECT_REF}.supabase.co` }),
    keychainReader() { throw new Error("missing"); },
    fetchImpl() { transport += 1; },
    logError() {},
  });
  assert.equal(code, EXIT.KEYCHAIN_MISSING);
  assert.equal(transport, 0);
});

await check("Synthetischer Erfolg protokolliert weder Account-ID, Secret noch Inhaltsfelder", async () => {
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

await check("Formfremde synthetische Antwort wird ohne Rohdaten gestoppt", async () => {
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

console.log(`account_size_report_test: ${checks} Checks bestanden (nur Mocks/Parser, kein Netzwerk).`);
