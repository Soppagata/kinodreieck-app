import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function nonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function instant(value, nullable = true) {
  return (nullable && value === null)
    || (typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value)));
}

export function pruefeFlixPatrolUsageAntwort(value) {
  if (!exactKeys(value, ["ok", "providerRequests", "status", "usage"])
      || value.ok !== true || value.status !== "refreshed" || value.providerRequests !== 1) return null;
  const usage = value.usage;
  if (!exactKeys(usage, [
    "currentUtcMonth", "lastAttemptAt", "lastStatus", "lastSuccessAt",
    "planLimit", "quota", "sinceSetup",
  ]) || !exactKeys(usage.sinceSetup, ["attemptedRequests", "completedRequests", "failedRequests", "successfulRequests"])
      || ![
    usage.sinceSetup.attemptedRequests, usage.sinceSetup.completedRequests,
    usage.sinceSetup.successfulRequests, usage.sinceSetup.failedRequests,
  ].every(nonnegative)
      || usage.sinceSetup.completedRequests !== usage.sinceSetup.successfulRequests + usage.sinceSetup.failedRequests
      || usage.sinceSetup.attemptedRequests < usage.sinceSetup.completedRequests
      || !exactKeys(usage.currentUtcMonth, ["attemptedRequests", "month"])
      || typeof usage.currentUtcMonth.month !== "string"
      || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(usage.currentUtcMonth.month)
      || !nonnegative(usage.currentUtcMonth.attemptedRequests)
      || usage.currentUtcMonth.attemptedRequests > usage.sinceSetup.attemptedRequests
      || usage.planLimit !== 1000
      || usage.lastStatus !== "succeeded"
      || !instant(usage.lastAttemptAt, false)
      || !instant(usage.lastSuccessAt, false)) return null;
  const quota = usage.quota;
  if (!exactKeys(quota, ["available", "limit", "limitExtra", "observedAt", "requestStartedAt", "resetAt", "used"])
      || ![quota.used, quota.available, quota.limit, quota.limitExtra].every(nonnegative)
      || quota.limit < 1 || typeof quota.resetAt !== "string"
      || !instant(quota.observedAt, false) || !instant(quota.requestStartedAt, false)
      || Date.parse(quota.requestStartedAt) > Date.parse(quota.observedAt)) return null;
  return Object.freeze({
    attemptedRequestsSinceSetup: usage.sinceSetup.attemptedRequests,
    completedRequestsSinceSetup: usage.sinceSetup.completedRequests,
    successfulRequestsSinceSetup: usage.sinceSetup.successfulRequests,
    failedRequestsSinceSetup: usage.sinceSetup.failedRequests,
    currentUtcMonth: usage.currentUtcMonth.month,
    currentMonthAttemptedRequests: usage.currentUtcMonth.attemptedRequests,
    providerUsed: quota.used,
    providerAvailable: quota.available,
    providerLimit: quota.limit,
    providerLimitExtra: quota.limitExtra,
    providerResetAt: quota.resetAt,
    providerObservedAt: quota.observedAt,
  });
}

export function formatiereFlixPatrolUsageSummary(result) {
  return [
    "## FlixPatrol-Nutzung: OK",
    "",
    "Der tägliche Quota-Abruf startete genau einen Providerrequest und wurde persistent abgeschlossen.",
    "",
    `- aktueller UTC-Monat ${result.currentUtcMonth}: ${result.currentMonthAttemptedRequests} eigene Requests begonnen`,
    `- seit Einrichtung: ${result.attemptedRequestsSinceSetup} begonnen, ${result.completedRequestsSinceSetup} abgeschlossen (${result.successfulRequestsSinceSetup} erfolgreich, ${result.failedRequestsSinceSetup} fehlgeschlagen)`,
    `- offizieller Snapshot: ${result.providerUsed} verwendet, ${result.providerAvailable} verfügbar, Limit ${result.providerLimit} + ${result.providerLimitExtra} extra`,
    `- Provider-Reset: ${result.providerResetAt}`,
    `- Snapshot gespeichert: ${result.providerObservedAt}`,
    "",
    "Eigene Requestzahlen und Provider-Quota sind getrennte Messwerte und werden nicht addiert.",
    "",
  ].join("\n");
}

function main(argv) {
  if (argv.length !== 1) throw new Error("usage: node tools/flixpatrol-usage.mjs RESPONSE.json");
  let parsed;
  try { parsed = JSON.parse(readFileSync(argv[0], "utf8")); }
  catch { throw new Error("FLIXPATROL_RESPONSE_INVALID_JSON"); }
  const result = pruefeFlixPatrolUsageAntwort(parsed);
  if (!result) throw new Error("FLIXPATROL_RESPONSE_INVALID_CONTRACT");
  process.stdout.write(formatiereFlixPatrolUsageSummary(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "FLIXPATROL_RESPONSE_INVALID");
    process.exitCode = 1;
  }
}
