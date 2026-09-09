#!/usr/bin/env node
/* Modul-Tests für tools/private-ops-check.mjs – vollständig mit injizierten Fetch-Mocks. */

import { readFileSync } from "node:fs";
import {
  formatPrivateOpsGitHub,
  PRIVATE_OPS_FLAG_MATRICES,
  runPrivateOpsCheck,
} from "./private-ops-check.mjs";

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
  KD_MONITOR_ENVIRONMENT: "staging",
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
    return fakeAntwort(200, [{ ...PRIVATE_OPS_FLAG_MATRICES.staging.privateSettings }]);
  }
  if (url.includes("/rest/v1/kd_radar_settings")) {
    return fakeAntwort(200, [{ ...PRIVATE_OPS_FLAG_MATRICES.staging.radarSettings }]);
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
  if (url.includes("/rest/v1/kd_entdecken_daily_feed")) {
    return fakeAntwort(200, [{
      status: "ready",
      refreshed_on: "2026-09-09",
      valid_until: "2026-09-15",
      last_attempt_on: "2026-09-09",
      last_error_code: null,
      payload: { format: 7, sourceIds: ["source:a", "source:b"], items: [{ secret: "nicht-ausgeben" }] },
    }]);
  }
  throw new Error(`Unhandled fetch in happy path: ${url}`);
});

const healthyReports = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: okFetch });
const healthy = Object.fromEntries(healthyReports.reports.map((r) => [r.id, r.code]));
check("grüner Build/Function/Rolle/Flags/Budget/Purge/Feed", healthy.build === "OK" && healthy.function === "OK" && healthy.access === "OK" && healthy.flags === "OK" && healthy.radar_flags === "OK" && healthy.budget === "OK" && healthy.purge === "OK" && healthy.entdecken_feed === "OK");
check("grüne Check-Läufe liefern kein kritisches Ergebnis", healthyReports.ok === true && healthyReports.critical.length === 0);
check("Purge als Warnung darf weiterlaufen und nicht kritisch sein", healthy.purge === "OK" && healthyReports.critical.includes("purge") === false);

const missing = await runPrivateOpsCheck({ env: { KD_MONITOR_ENVIRONMENT: "staging" }, fetchImpl: createFetchMock(() => { throw new Error("should not run"); }) });
const missingById = Object.fromEntries(missing.reports.map((r) => [r.id, r.code]));
check("fehlende Secrets je Check melden NOT_CONFIGURED", missingById.build === "NOT_CONFIGURED" && missingById.function === "NOT_CONFIGURED" && missingById.access === "NOT_CONFIGURED" && missingById.flags === "NOT_CONFIGURED" && missingById.radar_flags === "NOT_CONFIGURED" && missingById.budget === "NOT_CONFIGURED" && missingById.purge === "NOT_CONFIGURED" && missingById.entdecken_feed === "NOT_CONFIGURED");
check("fehlende Secrets brechen den Ablauf nicht ab, aber machen ihn rot", missing.ok === false && missing.reports.map((r) => r.id).length === 8 && missing.critical.length === 8);

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

for (const changedFlag of Object.keys(PRIVATE_OPS_FLAG_MATRICES.staging.privateSettings)) {
  const mismatchedFlags = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
    if (url.includes("/rest/v1/kd_private_settings")) {
      const flags = { ...PRIVATE_OPS_FLAG_MATRICES.staging.privateSettings };
      flags[changedFlag] = !flags[changedFlag];
      return fakeAntwort(200, [flags]);
    }
    return okFetch(url);
  }) });
  const mismatchedById = Object.fromEntries(mismatchedFlags.reports.map((r) => [r.id, r.code]));
  check(`abweichender Privat-Flag '${changedFlag}' wird erkannt`, mismatchedById.flags === "FLAG_MATRIX_MISMATCH");
  check(`abweichender Privat-Flag '${changedFlag}' ist kritisch`, mismatchedFlags.critical.includes("flags"));
}

  const missingPrivateExportFlag = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
    if (url.includes("/rest/v1/kd_private_settings")) {
      const { export_enabled: _missing, ...incomplete } = PRIVATE_OPS_FLAG_MATRICES.staging.privateSettings;
      return fakeAntwort(200, [incomplete]);
    }
    return okFetch(url);
  }) });
  const missingPrivateExportFlagById = Object.fromEntries(missingPrivateExportFlag.reports.map((r) => [r.id, r.code]));
  check("fehlender export_enabled-Flag wird als FLAG_MATRIX_MISMATCH erkannt", missingPrivateExportFlagById.flags === "FLAG_MATRIX_MISMATCH");
  check("fehlender export_enabled-Flag ist kritisch", missingPrivateExportFlag.critical.includes("flags"));
  check("fehlender export_enabled-Flag macht Gesamtcheck rot", missingPrivateExportFlag.ok === false);

  const missingPrivateSettingsRow = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
    if (url.includes("/rest/v1/kd_private_settings")) return fakeAntwort(200, []);
    return okFetch(url);
  }) });
  const missingPrivateSettingsRowById = Object.fromEntries(missingPrivateSettingsRow.reports.map((r) => [r.id, r.code]));
  check("leere Singleton-Antwort der privaten Einstellungen wird fail-closed erkannt", missingPrivateSettingsRowById.flags === "DATABASE_UNAVAILABLE");
  check("leere Singleton-Antwort bleibt kritisch", missingPrivateSettingsRow.critical.includes("flags") && missingPrivateSettingsRow.ok === false);

  const privateSettingsQueryError = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
    if (url.includes("/rest/v1/kd_private_settings")) return fakeAntwort(400, { code: "PGRST204", message: "query error" });
    return okFetch(url);
  }) });
  const privateSettingsQueryErrorById = Object.fromEntries(privateSettingsQueryError.reports.map((r) => [r.id, r.code]));
  check("schema-/queryfehlerhafte private Einstellungen werden fail-closed erkannt", privateSettingsQueryErrorById.flags === "DATABASE_UNAVAILABLE");
  check("schema-/queryfehlerhafte private Einstellungen bleiben kritisch", privateSettingsQueryError.critical.includes("flags") && privateSettingsQueryError.ok === false);

for (const changedFlag of Object.keys(PRIVATE_OPS_FLAG_MATRICES.staging.radarSettings)) {
  const mismatchedRadarFlags = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
    if (url.includes("/rest/v1/kd_radar_settings")) {
      const flags = { ...PRIVATE_OPS_FLAG_MATRICES.staging.radarSettings };
      flags[changedFlag] = !flags[changedFlag];
      return fakeAntwort(200, [flags]);
    }
    return okFetch(url);
  }) });
  const mismatchedById = Object.fromEntries(mismatchedRadarFlags.reports.map((r) => [r.id, r.code]));
  check(`${changedFlag} wird fail-closed erkannt`, mismatchedById.radar_flags === "FLAG_MATRIX_MISMATCH");
  check(`${changedFlag} macht den Lauf kritisch`, mismatchedRadarFlags.critical.includes("radar_flags"));
}

const unknownEnvironment = await runPrivateOpsCheck({
  env: { ...BASIS_ENV, KD_MONITOR_ENVIRONMENT: "preview" },
  fetchImpl: okFetch,
});
const unknownEnvironmentById = Object.fromEntries(unknownEnvironment.reports.map((r) => [r.id, r.code]));
check("unbekannte Umgebung besitzt keinen stillen Flag-Fallback", unknownEnvironmentById.flags === "EXPECTED_MATRIX_NOT_CONFIGURED" && unknownEnvironmentById.radar_flags === "EXPECTED_MATRIX_NOT_CONFIGURED");
check("unbekannte Umgebung macht beide Flagchecks kritisch", unknownEnvironment.critical.includes("flags") && unknownEnvironment.critical.includes("radar_flags"));

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
  if (url.includes("/rest/v1/kd_private_settings")) return fakeAntwort(200, [{ ...PRIVATE_OPS_FLAG_MATRICES.staging.privateSettings }]);
  if (url.includes("/rest/v1/kd_radar_settings")) return fakeAntwort(200, [{ ...PRIVATE_OPS_FLAG_MATRICES.staging.radarSettings }]);
  if (url.includes("/rest/v1/kd_ai_limits")) return fakeAntwort(200, [
    { schluessel: "ai_aktiv", wert: true },
    { schluessel: "monatsbudget_usd_cent", wert: 111 },
    { schluessel: "anbieter_request_max_usd_cent", wert: 500 },
  ]);
  if (url.includes("/rest/v1/rpc/kd_private_retention_run")) return fakeAntwort(200, { due: {} });
  if (url.includes("/rest/v1/kd_entdecken_daily_feed")) return okFetch(url);
  return okFetch(url);
}) });
const redactedText = JSON.stringify(redactedRun.reports);
const sensitiveFound = Object.entries(redactedPayload).some(([_, wert]) => redactedText.includes(wert));
check("keine IDs/Secrets/Payload in Reports", sensitiveFound === false);
check("Reports enthalten nur erlaubte Felder", redactedRun.reports.every((entry) => {
  const keys = Object.keys(entry);
  return keys.every((key) => [
    "id", "code", "warningCount", "status", "refreshedOn", "validUntil",
    "lastAttemptOn", "lastErrorCode", "payloadFormat", "sourceCount",
  ].includes(key))
    && keys.includes("id")
    && keys.includes("code")
    && keys.length <= 10;
}));
check("Feedreport enthält nur Metadaten, nie Payload oder Quellen-IDs",
  redactedText.includes("nicht-ausgeben") === false
  && redactedText.includes("source:a") === false
  && redactedRun.reports.find((entry) => entry.id === "entdecken_feed")?.sourceCount === 2);

const feedErrorRun = await runPrivateOpsCheck({ env: BASIS_ENV, now: () => new Date("2026-09-09T12:00:00Z"), fetchImpl: createFetchMock((url) => {
  if (url.includes("/rest/v1/kd_entdecken_daily_feed")) return fakeAntwort(200, [{
    status: "error", refreshed_on: "2026-09-06", valid_until: "2026-09-12",
    last_attempt_on: "2026-09-09", last_error_code: "source_error",
    payload: { format: 7, sourceIds: ["source:a"] },
  }]);
  return okFetch(url);
}) });
const feedError = feedErrorRun.reports.find((entry) => entry.id === "entdecken_feed");
check("fachlicher Feedfehler wird mit sicherem Grundcode rot", feedError?.code === "FEED_ERROR_SOURCE_ERROR"
  && feedErrorRun.critical.includes("entdecken_feed") && feedErrorRun.ok === false);
check("Feedfehler nennt letzte Versuchs- und Bestandsdaten ohne Payload", feedError?.lastAttemptOn === "2026-09-09"
  && feedError?.refreshedOn === "2026-09-06" && feedError?.validUntil === "2026-09-12");

const expiredFeedRun = await runPrivateOpsCheck({ env: BASIS_ENV, now: () => new Date("2026-09-16T12:00:00Z"), fetchImpl: createFetchMock((url) => {
  if (url.includes("/rest/v1/kd_entdecken_daily_feed")) return fakeAntwort(200, [{
    status: "ready", refreshed_on: "2026-09-09", valid_until: "2026-09-15",
    last_attempt_on: "2026-09-09", last_error_code: null,
    payload: { format: 19, sourceIds: ["source:a", "source:b", "source:c"] },
  }]);
  return okFetch(url);
}) });
const expiredFeed = expiredFeedRun.reports.find((entry) => entry.id === "entdecken_feed");
check("Monitor erkennt abgelaufenen Feed ohne feste Format- oder Quellenzahl", expiredFeed?.code === "FEED_EXPIRED"
  && expiredFeed?.payloadFormat === 19 && expiredFeed?.sourceCount === 3
  && expiredFeedRun.critical.includes("entdecken_feed"));

const invalidFeedRun = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
  if (url.includes("/rest/v1/kd_entdecken_daily_feed")) return fakeAntwort(200, [{
    status: "ready", refreshed_on: "2026-09-09", valid_until: "2026-09-15",
    last_attempt_on: "2026-09-09", last_error_code: null,
    payload: { format: 7, sourceIds: [] },
  }]);
  return okFetch(url);
}) });
check("leerer Quellenvertrag wird fail-closed statt über 25/50-Annahmen bewertet",
  invalidFeedRun.reports.find((entry) => entry.id === "entdecken_feed")?.code === "FEED_CONTRACT_INVALID"
  && invalidFeedRun.critical.includes("entdecken_feed"));

const refreshingFeedRun = await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: createFetchMock((url) => {
  if (url.includes("/rest/v1/kd_entdecken_daily_feed")) return fakeAntwort(200, [{
    status: "refreshing", refreshed_on: "2026-09-09", valid_until: "2026-09-15",
    last_attempt_on: "2026-09-09", last_error_code: null,
    payload: { format: 7, sourceIds: ["source:a"] },
  }]);
  return okFetch(url);
}) });
check("laufender Feedrefresh bleibt sichtbare Warnung ohne falschen Fehler",
  refreshingFeedRun.reports.find((entry) => entry.id === "entdecken_feed")?.code === "FEED_REFRESHING"
  && refreshingFeedRun.critical.includes("entdecken_feed") === false && refreshingFeedRun.ok === true);

const githubReport = formatPrivateOpsGitHub(feedErrorRun);
check("GitHub-Ausgabe enthält Fehlerannotation und verständliche Schrittzusammenfassung",
  githubReport.annotations.some((line) => line.startsWith("::error title=Private Ops: Entdecken-Feed::"))
  && githubReport.markdown.includes("## Private Ops Monitor: Störung")
  && githubReport.markdown.includes("letzter Versuch: 2026-09-09"));
check("GitHub-Ausgabe enthält keine Secrets, Kontodaten, Payloads oder Quellen-IDs",
  ![...Object.values(BASIS_ENV), "source:a", "nicht-ausgeben", "items"].some((value) => githubReport.markdown.includes(String(value)))
  && !githubReport.annotations.some((line) => /source:a|nicht-ausgeben|monitor@example/.test(line)));

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
  if (url.includes("/rest/v1/kd_private_settings")) return fakeAntwort(200, [{ ...PRIVATE_OPS_FLAG_MATRICES.staging.privateSettings }]);
  if (url.includes("/rest/v1/kd_radar_settings")) return fakeAntwort(200, [{ ...PRIVATE_OPS_FLAG_MATRICES.staging.radarSettings }]);
  if (url.includes("/rest/v1/kd_ai_limits")) return fakeAntwort(200, [
    { schluessel: "ai_aktiv", wert: true },
    { schluessel: "monatsbudget_usd_cent", wert: 123 },
    { schluessel: "anbieter_request_max_usd_cent", wert: 500 },
  ]);
  if (url.includes("/rest/v1/rpc/kd_private_retention_run")) return fakeAntwort(200, { due: {} });
  if (url.includes("/rest/v1/kd_entdecken_daily_feed")) return okFetch(url);
  throw new Error(`Unhandled fetch in timeout test: ${url}`);
});
await runPrivateOpsCheck({ env: BASIS_ENV, fetchImpl: timeoutCheckFetch });
AbortSignal.timeout = originalTimeout;
check("je Netzcheck max 20s Timeout", abortCalls.length >= 8 && abortCalls.every((ms) => ms === 20000));

const monitorCheckSource = readFileSync("tools/private-ops-check.mjs", "utf8");
check("Run-Timeout für den Check ist 5 Minuten", /RUN_TIMEOUT_MS\s*=\s*5\s*\*\s*60_000/.test(monitorCheckSource));
const monitorWorkflow = readFileSync(".github/workflows/private-ops-monitor.yml", "utf8");
check("Workflow ist auf 5 Minuten begrenzt", /timeout-minutes:\s*5/.test(monitorWorkflow));
check("Workflow verwendet ausschließlich den Check-Entrypoint", /node tools\/private-ops-check\.mjs/.test(monitorWorkflow));
check("Workflow bindet die explizite Staging-Sollmatrix", /KD_MONITOR_ENVIRONMENT:\s*staging/.test(monitorWorkflow));
check("Workflow bindet das GitHub-Environment staging", /read-only-check:[\s\S]*?environment:\s*staging/.test(monitorWorkflow));
check("Workflow checkt unabhängig vom Schedule-Default den staging-Ref aus",
  /uses:\s*actions\/checkout@v7[\s\S]*?with:\s*\n\s+ref:\s*staging/.test(monitorWorkflow));
check("App-Build-Soll stammt aus dem tatsächlich ausgecheckten staging-Commit",
  /id:\s*staging-checkout[\s\S]*?git rev-parse HEAD[\s\S]*?KD_MONITOR_EXPECTED_BUILD:\s*\$\{\{\s*steps\.staging-checkout\.outputs\.sha\s*\}\}/.test(monitorWorkflow));
check("Workflow verwendet die kanonischen Environment-Variablen des Deployments",
  /KD_MONITOR_STAGING_URL:\s*\$\{\{\s*vars\.APP_URL\s*\}\}/.test(monitorWorkflow)
  && /KD_MONITOR_SUPABASE_URL:\s*\$\{\{\s*vars\.SUPABASE_URL\s*\}\}/.test(monitorWorkflow)
  && /KD_MONITOR_PUBLISHABLE_KEY:\s*\$\{\{\s*vars\.SUPABASE_PUBLISHABLE_KEY\s*\}\}/.test(monitorWorkflow));
check("alte driftende App-Sollvariablen und falsche Supabase-Secret-Namen sind entfernt",
  !/STAGING_APP_URL|STAGING_EXPECTED_BUILD|secrets\.VITE_SUPABASE_(?:URL|PUBLISHABLE_KEY)/.test(monitorWorkflow));
check("Workflow schreibt annotierte Gründe und eine GitHub-Schrittzusammenfassung über den Check",
  /GITHUB_STEP_SUMMARY/.test(monitorCheckSource)
  && /::\$\{level\} title=/.test(monitorCheckSource)
  && /formatPrivateOpsGitHub/.test(monitorCheckSource));

console.log(`\n${ok}/${ok + fehler.length} Private-Ops-Monitor-Checks bestanden.`);
if (fehler.length) {
  console.log("PRIVATE-OPS-MONITOR-TEST FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("PRIVATE-OPS-MONITOR-TEST BESTANDEN (0 echte Netzzugriffe)");
