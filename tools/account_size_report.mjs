#!/usr/bin/env node
/* Einmaliger, read-only Kontogroessenbericht fuer Max.
   Der Erfolgsweg gibt ausschliesslich Datenklasse, Zeilen, Bytes und Summe aus.
   Account-ID, Schluessel und Serverantworten werden nie protokolliert. */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { liesLokaleKonfig } from "./keychain_runner.mjs";
import { ACCOUNT_EXPORT_REQUIRED_SCOPE } from "../src/lib/privatePilotOps.js";

export const EXECUTION_MARKER = "--account-size-report-once";
export const REPORT_SCHEMA_VERSION = "kinodreieck-account-size-report-v1";
export const NETWORK_TIMEOUT_MS = 20_000;
export const PROJECT_REF = "bscjgwcntapobyxsiyce";
export const SERVICE_ROLE_KEYCHAIN = Object.freeze({
  service: `at.kinodreieck.codex.supabase.${PROJECT_REF}`,
  account: "SUPABASE_SERVICE_ROLE_KEY",
});
export const REQUIRED_DATA_CLASSES = Object.freeze(
  ACCOUNT_EXPORT_REQUIRED_SCOPE.map((entry) => entry.id),
);

export const EXIT = Object.freeze({
  OK: 0,
  NOT_STARTED: 64,
  CONFIG_INVALID: 65,
  KEYCHAIN_MISSING: 66,
  NETWORK_FAILED: 69,
  RESPONSE_INVALID: 70,
});

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class AccountSizeReportFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "AccountSizeReportFailure";
    this.code = code;
  }
}

function removeOneLineEnding(value) {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

export function readServiceRoleKey({
  platform = process.platform,
  securityRun = spawnSync,
} = {}) {
  if (platform !== "darwin") {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_KEYCHAIN_UNAVAILABLE");
  }
  const result = securityRun(
    "/usr/bin/security",
    [
      "find-generic-password",
      "-s",
      SERVICE_ROLE_KEYCHAIN.service,
      "-a",
      SERVICE_ROLE_KEYCHAIN.account,
      "-w",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    },
  );
  if (result?.error || result?.signal || result?.status !== 0) {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_KEYCHAIN_UNAVAILABLE");
  }
  const stdout = typeof result.stdout === "string"
    ? result.stdout
    : Buffer.from(result.stdout || "").toString("utf8");
  const secret = removeOneLineEnding(stdout);
  if (secret.length < 32 || /\s/.test(secret)) {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_KEYCHAIN_UNAVAILABLE");
  }
  return secret;
}

export function canonicalAccountUuid(value) {
  return typeof value === "string" && CANONICAL_UUID.test(value) ? value : null;
}

export function validateSupabaseUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_CONFIG_INVALID");
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.hostname !== `${PROJECT_REF}.supabase.co`
    || (url.pathname !== "/" && url.pathname !== "")
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_CONFIG_INVALID");
  }
  return url.origin;
}

function hasExactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateReportResponse(value) {
  if (!hasExactKeys(value, ["schemaVersion", "classes", "totals"])
      || value.schemaVersion !== REPORT_SCHEMA_VERSION
      || !Array.isArray(value.classes)
      || value.classes.length !== REQUIRED_DATA_CLASSES.length
      || !hasExactKeys(value.totals, ["rows", "bytes"])) {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_RESPONSE_INVALID");
  }

  let rows = 0;
  let bytes = 0;
  const classes = value.classes.map((entry, index) => {
    if (!hasExactKeys(entry, ["dataClass", "rows", "bytes"])
        || entry.dataClass !== REQUIRED_DATA_CLASSES[index]
        || !isNonNegativeSafeInteger(entry.rows)
        || !isNonNegativeSafeInteger(entry.bytes)
        || (entry.rows > 0 && entry.bytes === 0)) {
      throw new AccountSizeReportFailure("ACCOUNT_SIZE_RESPONSE_INVALID");
    }
    rows += entry.rows;
    bytes += entry.bytes;
    if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(bytes)) {
      throw new AccountSizeReportFailure("ACCOUNT_SIZE_RESPONSE_INVALID");
    }
    return Object.freeze({
      dataClass: entry.dataClass,
      rows: entry.rows,
      bytes: entry.bytes,
    });
  });

  if (!isNonNegativeSafeInteger(value.totals.rows)
      || !isNonNegativeSafeInteger(value.totals.bytes)
      || value.totals.rows !== rows
      || value.totals.bytes !== bytes) {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_RESPONSE_INVALID");
  }

  return Object.freeze({
    classes: Object.freeze(classes),
    totals: Object.freeze({ rows, bytes }),
  });
}

export async function requestAccountSizeReport({
  baseUrl,
  serviceRoleKey,
  accountId,
  fetchImpl = globalThis.fetch,
  signalFactory = () => AbortSignal.timeout(NETWORK_TIMEOUT_MS),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_NETWORK_FAILED");
  }
  let response;
  try {
    response = await fetchImpl(
      `${baseUrl}/rest/v1/rpc/kd_private_account_size_report`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_account_id: accountId }),
        redirect: "error",
        signal: signalFactory(),
      },
    );
  } catch {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_NETWORK_FAILED");
  }
  if (!response?.ok) {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_NETWORK_FAILED");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AccountSizeReportFailure("ACCOUNT_SIZE_RESPONSE_INVALID");
  }
  return validateReportResponse(payload);
}

export function formatReport(report) {
  return [
    ...report.classes.map((entry) => (
      `${entry.dataClass}\trows=${entry.rows}\tbytes=${entry.bytes}`
    )),
    `total\trows=${report.totals.rows}\tbytes=${report.totals.bytes}`,
  ];
}

export async function main(argv = process.argv.slice(2), {
  configReader = liesLokaleKonfig,
  keychainReader = readServiceRoleKey,
  fetchImpl = globalThis.fetch,
  signalFactory = () => AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  log = (line) => console.log(line),
  logError = (line) => console.error(line),
} = {}) {
  if (argv.length !== 2 || argv[0] !== EXECUTION_MARKER) {
    logError("ACCOUNT_SIZE_REPORT_NOT_STARTED: exakter Einmalmarker und kanonische Account-UUID erforderlich.");
    return EXIT.NOT_STARTED;
  }
  const accountId = canonicalAccountUuid(argv[1]);
  if (!accountId) {
    logError("ACCOUNT_SIZE_REPORT_NOT_STARTED: kanonische Account-UUID erforderlich.");
    return EXIT.NOT_STARTED;
  }

  let baseUrl;
  try {
    baseUrl = validateSupabaseUrl(configReader()?.KD_SB_URL);
  } catch {
    logError("ACCOUNT_SIZE_REPORT_NOT_STARTED: öffentliche, projektgebundene Zielkonfiguration fehlt.");
    return EXIT.CONFIG_INVALID;
  }

  let serviceRoleKey;
  try {
    serviceRoleKey = keychainReader();
  } catch {
    logError("ACCOUNT_SIZE_REPORT_NOT_STARTED: lokaler Service-Role-Schlüsselbund-Eintrag fehlt oder ist nicht lesbar.");
    return EXIT.KEYCHAIN_MISSING;
  }

  try {
    const report = await requestAccountSizeReport({
      baseUrl,
      serviceRoleKey,
      accountId,
      fetchImpl,
      signalFactory,
    });
    for (const line of formatReport(report)) log(line);
    return EXIT.OK;
  } catch (error) {
    if (error instanceof AccountSizeReportFailure
        && error.code === "ACCOUNT_SIZE_RESPONSE_INVALID") {
      logError("ACCOUNT_SIZE_REPORT_STOPPED: aggregierte Antwortform oder Scope-Vollständigkeit ist ungültig.");
      return EXIT.RESPONSE_INVALID;
    }
    logError("ACCOUNT_SIZE_REPORT_STOPPED: Datenbank-RPC nicht erreichbar; kein Retry.");
    return EXIT.NETWORK_FAILED;
  }
}

function isDirectExecution() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) process.exitCode = await main();
