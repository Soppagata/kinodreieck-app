#!/usr/bin/env node
/* Modul-Tests für tools/private-ops-check.mjs – vollständig mit injizierten Fetch-Mocks. */

import { readFileSync } from "node:fs";
import { runPrivateOpsCheck } from "./private-ops-check.mjs";

let ok = 0;
const fehler = [];
function check(name, bedingung) {
  if (bedingung) {
    ok += 1;
    console.log(`✓ ${name}`);
  } else {
    fehler.push(name);
    console.log(`✗ ${name}`);
  }
}

function fakeAntwort(status, daten) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return daten; },
  };
}

function createFetchMock(handler) {
  const calls = [];
  const impl = async (url, optionen = {}) => {
    calls.push({ url: String(url), optionen });
    return handler(String(url), optionen);
  };
  impl.calls = calls;
  return impl;
}

const BASIS_ENV = {
  KD_MONITOR_STAGING_URL: "https://staging.kd.test",
  KD_MONITOR_EXPECTED_BUILD: "build-v1",
  KD_MONITOR_EXPECTED_FUNCTION_BUILD: "fn-v1",
  KD_MONITOR_SUPABASE_URL: "https://xyzcompany.supabase.co",
  KD_MONITOR_PUBLISHABLE_KEY: "sb_publishable_test",
  KD_MONITOR_SERVICE_ROLE_KEY: "sb_service_role_test",
  KD_MONITOR_EMAIL: "monitor@example.com",
  KD_MONITOR_PASSWORD: "strikt-geheim",
};

const okFetch = createFetchMock((url) => {
  if (url.endsWith("/build-meta.json")) {
    return fakeAntwort(200, { buildVersion: "build-v1" });
  }
  if (url.includes("/auth/v1/token")) {
    return fakeAntwort(200, { access_token: "monitor-session-token" });
  }
  if (url.includes("/functions/v1/ai-task")) {
    return fakeAntwort(200, { buildVersion: "fn-v1", health: true });
  }
  if (url.includes("/rest/v1/kd_account_access")) {
    return fakeAntwort(200, [{ role: "member", active: true, personal_ai: false }]);
  }
  if (url.includes("/rest/v1/kd_private_settings")) {
    return fakeAntwort(200, [{ provider_requests_enabled: false, scheduler_enabled: false, purge_enabled: false, delete_enabled: false, export_enabled: false }]);
  }
  if (url.includes("/rest/v1/kd_radar_settings")) {
    return fakeAntwort(200, [{ radar_aktiv: false, radar_shares_aktiv: false, radar_provider_aktiv: false, radar_scheduler_aktiv: false, radar_proposal_import_aktiv: false }]);
  }
  if (url.includes("/rest/v1/kd_ai_limits")) {
    return fakeAntwort(200, [
      { schluessel: "ai_aktiv", wert: true },
      { schluessel: "monatsbudget_usd_cent", wert: 123 },
      { schluessel: "anbieter_request_max_usd_cent", wert: 500 },
    ]);
  }
  if (url.includes("/rest/v1/rpc/kd_private_retention_run")) {
    return fakeAntwort(200, { due: {} });
  }
  throw new Error(`Unhandled fetch in happy path: ${url}`);
});

const healthyReports = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: okFetch });
const healthy = Object.fromEntries(healthyReports.reports.map((r) => [r.id, r.code]));
check("grüner Build/Function/Rolle/Fünffeld-Flags/Budget/Purge", healthy.build === "OK" && healthy.function === "OK" && healthy.access === "OK" && healthy.flags === "OK" && healthy.radar_flags === "OK" && healthy.budget === "OK" && healthy.purge === "OK");
check("grüne Check-Läufe liefern kein kritisches Ergebnis", healthyReports.ok === true && healthyReports.critical.length === 0);
check("Purge als Warnung darf weiterlaufen und nicht kritisch sein", healthy.purge === "OK" && healthyReports.critical.includes("purge") === false);

const missing = await runPrivateOpsCheck({ env: {}, fetchImpl: createFetchMock(() => { throw new Error("should not run"); }) });
const missingById = Object.fromEntries(missing.reports.map((r) => [r.id, r.code]));
check("fehlende Secrets je Check melden NOT_CONFIGURED", missingById.build === "NOT_CONFIGURED" && missingById.function === "NOT_CONFIGURED" && missingById.access === "NOT_CONFIGURED" && missingById.flags === "NOT_CONFIGURED" && missingById.radar_flags === "NOT_CONFIGURED" && missingById.budget === "NOT_CONFIGURED" && missingById.purge === "NOT_CONFIGURED");
check("fehlende Secrets brechen den Ablauf nicht ab, aber machen ihn rot", missing.ok === false && missing.reports.map((r) => r.id).length === 7 && missing.critical.length === 7);

const buildMismatch = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
  if (url.endsWith("/build-meta.json")) return fakeAntwort(200, { buildVersion: "build-v2" });
  return okFetch(url);
}) });
const buildMismatchById = Object.fromEntries(buildMismatch.reports.map((r) => [r.id, r.code]));
check("Build-Mismatch wird erkannt", buildMismatchById.build === "BUILD_MISMATCH");
check("Build-Mismatch gilt als kritisch", buildMismatch.critical.includes("build") && buildMismatch.ok === false);

const functionMismatch = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
  if (url.endsWith("/build-meta.json")) return fakeAntwort(200, { buildVersion: "build-v1" });
  if (url.includes("/functions/v1/ai-task")) return fakeAntwort(200, { buildVersion: "fn-v0", health: true });
  return okFetch(url);
}) });
const functionMismatchById = Object.fromEntries(functionMismatch.reports.map((r) => [r.id, r.code]));
check("Function-Mismatch wird erkannt", functionMismatchById.function === "FUNCTION_BUILD_MISMATCH");
check("Function-Mismatch gilt als kritisch", functionMismatch.critical.includes("function") && functionMismatch.ok === false);

const inactiveAccess = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
  if (url.includes("/rest/v1/kd_account_access")) return fakeAntwort(200, [{ role: "member", active: false, personal_ai: false }]);
  return okFetch(url);
}) });
check("inaktive oder fehlende Rollen-v1-Freigabe macht Monitoring rot", inactiveAccess.reports.find((r) => r.id === "access")?.code === "ACCESS_DENIED" && inactiveAccess.critical.includes("access"));

const PRIVATE_FLAGS = [
  "provider_requests_enabled",
  "scheduler_enabled",
  "purge_enabled",
  "delete_enabled",
  "export_enabled",
];
for (const activeFlag of PRIVATE_FLAGS) {
  const dangerousFlags = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
    if (url.includes("/rest/v1/kd_private_settings")) {
      const safeFlags = Object.fromEntries(PRIVATE_FLAGS.map((name) => [name, false]));
      safeFlags[activeFlag] = true;
      return fakeAntwort(200, [safeFlags]);
    }
    return okFetch(url);
  }) });
  const dangerousFlagsById = Object.fromEntries(dangerousFlags.reports.map((r) => [r.id, r.code]));
  check(`gefährlicher Privat-Flag '${activeFlag}' wird erkannt`, dangerousFlagsById.flags === "UNEXPECTED_DANGEROUS_FLAG");
  check(`gefährlicher Privat-Flag '${activeFlag}' ist kritisch`, dangerousFlags.critical.includes("flags"));
}

const missingPrivateExportFlag = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
  if (url.includes("/rest/v1/kd_private_settings")) return fakeAntwort(200, [{ provider_requests_enabled: false, scheduler_enabled: false, purge_enabled: false, delete_enabled: false }]);
  return okFetch(url);
}) });
const missingPrivateExportFlagById = Object.fromEntries(missingPrivateExportFlag.reports.map((r) => [r.id, r.code]));
check("fehlender export_enabled-Flag wird als UNEXPECTED_DANGEROUS_FLAG erkannt", missingPrivateExportFlagById.flags === "UNEXPECTED_DANGEROUS_FLAG");
check("fehlender export_enabled-Flag ist kritisch", missingPrivateExportFlag.critical.includes("flags"));

const RADAR_FLAGS = [
  "radar_aktiv",
  "radar_shares_aktiv",
  "radar_provider_aktiv",
  "radar_scheduler_aktiv",
  "radar_proposal_import_aktiv",
];
for (const activeFlag of RADAR_FLAGS) {
  const dangerousRadarFlags = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
    if (url.includes("/rest/v1/kd_radar_settings")) {
      return fakeAntwort(200, [Object.fromEntries(RADAR_FLAGS.map((flag) => [flag, flag === activeFlag]))]);
    }
    return okFetch(url);
  }) });
  const dangerousRadarFlagsById = Object.fromEntries(dangerousRadarFlags.reports.map((r) => [r.id, r.code]));
  check(`${activeFlag} wird fail-closed erkannt`, dangerousRadarFlagsById.radar_flags === "UNEXPECTED_DANGEROUS_FLAG");
  check(`${activeFlag} macht den Lauf kritisch`, dangerousRadarFlags.critical.includes("radar_flags"));
}

const unknownBudget = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
  if (url.includes("/rest/v1/kd_ai_limits")) {
    return fakeAntwort(200, [
      { schluessel: "ai_aktiv", wert: true },
      { schluessel: "monatsbudget_usd_cent", wert: "unbekannt" },
      { schluessel: "anbieter_request_max_usd_cent", wert: 500 },
    ]);
  }
  return okFetch(url);
}) });
const unknownBudgetById = Object.fromEntries(unknownBudget.reports.map((r) => [r.id, r.code]));
check("Budget unbekannt wird als BUDGET_UNKNOWN eingestuft", unknownBudgetById.budget === "BUDGET_UNKNOWN");
check("Budget unbekannt ist kritisch", unknownBudget.critical.includes("budget") && unknownBudget.ok === false);

const purgeWarning = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
  if (url.includes("/rest/v1/rpc/kd_private_retention_run")) {
    return fakeAntwort(200, { due: { inAktivitaeten: 3, inTerminen: 2 } });
  }
  return okFetch(url);
}) });
const purgeWarningEntry = purgeWarning.reports.find((r) => r.id === "purge");
check("Purge liefert nur Warning bei fälligen Daten", purgeWarningEntry?.code === "PURGE_DUE" && purgeWarningEntry?.warningCount === 5);
check("Purge-Warnung bleibt nicht kritisch", purgeWarning.critical.includes("purge") === false && purgeWarning.ok === true);

const redactedPayload = {
  KD_MONITOR_SUPABASE_URL: "https://secret.supabase.io",
  KD_MONITOR_PUBLISHABLE_KEY: "sb-pub-sensitive-xyz",
  KD_MONITOR_SERVICE_ROLE_KEY: "sb-secret-svc",
  KD_MONITOR_PASSWORD: "geheime-passphrase",
  KD_MONITOR_EMAIL: "monitor+redact@kd.test",
};
const redactedRun = await runPrivateOpsCheck({ env: { ...BASIS_ENV, ...redactedPayload }, fetchImpl: createFetchMock((url) => {
  if (url.endsWith("/build-meta.json")) return fakeAntwort(200, { buildVersion: "build-v1" });
  if (url.includes("/auth/v1/token")) return fakeAntwort(200, { access_token: "monitor-session-token" });
  if (url.includes("/functions/v1/ai-task")) return fakeAntwort(200, { buildVersion: "fn-v1", health: true });
  if (url.includes("/rest/v1/kd_account_access")) return fakeAntwort(200, [{ role: "member", active: true, personal_ai: false }]);
  if (url.includes("/rest/v1/kd_private_settings")) return fakeAntwort(200, [{ provider_requests_enabled: false, scheduler_enabled: false, purge_enabled: false, delete_enabled: false, export_enabled: false }]);
  if (url.includes("/rest/v1/kd_radar_settings")) return fakeAntwort(200, [{ radar_aktiv: false, radar_shares_aktiv: false, radar_provider_aktiv: false, radar_scheduler_aktiv: false, radar_proposal_import_aktiv: false }]);
  if (url.includes("/rest/v1/kd_ai_limits")) return fakeAntwort(200, [
    { schluessel: "ai_aktiv", wert: true },
    { schluessel: "monatsbudget_usd_cent", wert: 111 },
    { schluessel: "anbieter_request_max_usd_cent", wert: 500 },
  ]);
  if (url.includes("/rest/v1/rpc/kd_private_retention_run")) return fakeAntwort(200, { due: {} });
  return okFetch(url);
}) });
const redactedText = JSON.stringify(redactedRun.reports);
const sensitiveFound = Object.entries(redactedPayload).some(([_, wert]) => redactedText.includes(wert));
check("keine IDs/Secrets/Payload in Reports", sensitiveFound === false);
check("Reports enthalten nur erlaubte Felder", redactedRun.reports.every((entry) => {
  const keys = Object.keys(entry);
  return keys.every((key) => ["id", "code", "warningCount"].includes(key))
    && keys.includes("id")
    && keys.includes("code")
    && keys.length <= 3;
}));

const abortCalls = [];
const originalTimeout = AbortSignal.timeout;
AbortSignal.timeout = (ms) => {
  abortCalls.push(ms);
  return originalTimeout(ms);
};
const timeoutCheckFetch = createFetchMock((url) => {
  if (url.endsWith("/build-meta.json")) return fakeAntwort(200, { buildVersion: "build-v1" });
  if (url.includes("/auth/v1/token")) return fakeAntwort(200, { access_token: "monitor-session-token" });
  if (url.includes("/functions/v1/ai-task")) return fakeAntwort(200, { buildVersion: "fn-v1", health: true });
  if (url.includes("/rest/v1/kd_account_access")) return fakeAntwort(200, [{ role: "member", active: true, personal_ai: false }]);
  if (url.includes("/rest/v1/kd_private_settings")) return fakeAntwort(200, [{ provider_requests_enabled: false, scheduler_enabled: false, purge_enabled: false, delete_enabled: false, export_enabled: false }]);
  if (url.includes("/rest/v1/kd_radar_settings")) return fakeAntwort(200, [{ radar_aktiv: false, radar_shares_aktiv: false, radar_provider_aktiv: false, radar_scheduler_aktiv: false, radar_proposal_import_aktiv: false }]);
  if (url.includes("/rest/v1/kd_ai_limits")) return fakeAntwort(200, [
    { schluessel: "ai_aktiv", wert: true },
    { schluessel: "monatsbudget_usd_cent", wert: 123 },
    { schluessel: "anbieter_request_max_usd_cent", wert: 500 },
  ]);
  if (url.includes("/rest/v1/rpc/kd_private_retention_run")) return fakeAntwort(200, { due: {} });
  throw new Error(`Unhandled fetch in timeout test: ${url}`);
});
await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: timeoutCheckFetch });
AbortSignal.timeout = originalTimeout;
check("je Netzcheck max 20s Timeout", abortCalls.length >= 7 && abortCalls.every((ms) => ms === 20000));

const monitorCheckSource = readFileSync("tools/private-ops-check.mjs", "utf8");
check("Run-Timeout für den Check ist 5 Minuten", /RUN_TIMEOUT_MS\s*=\s*5\s*\*\s*60_000/.test(monitorCheckSource));
const monitorWorkflow = readFileSync(".github/workflows/private-ops-monitor.yml", "utf8");
check("Workflow ist auf 5 Minuten begrenzt", /timeout-minutes:\s*5/.test(monitorWorkflow));
check("Workflow verwendet ausschließlich den Check-Entrypoint", /node tools\/private-ops-check\.mjs/.test(monitorWorkflow));

console.log(`\n${ok}/${ok + fehler.length} Private-Ops-Monitor-Checks bestanden.`);
if (fehler.length) {
  console.log("PRIVATE-OPS-MONITOR-TEST FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("PRIVATE-OPS-MONITOR-TEST BESTANDEN (0 echte Netzzugriffe)");
