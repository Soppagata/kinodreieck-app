import assert from "node:assert/strict";
import { formatiereFlixPatrolUsageSummary, pruefeFlixPatrolUsageAntwort } from "./tools/flixpatrol-usage.mjs";

const response = {
  ok: true,
  status: "refreshed",
  providerRequests: 1,
  usage: {
    attemptedRequests: 5, completedRequests: 5, successfulRequests: 4, failedRequests: 1,
    lastStatus: "succeeded", lastAttemptAt: "2026-09-09T15:30:00Z",
    lastSuccessAt: "2026-09-09T15:30:01Z", planLimit: 1000,
    quota: { used: 31, available: 969, limit: 1000, limitExtra: 0, resetAt: "2026-10-01T00:00:00Z", observedAt: "2026-09-09T15:30:01Z" },
  },
};

const result = pruefeFlixPatrolUsageAntwort(response);
assert.deepEqual(result, {
  attemptedRequests: 5, completedRequests: 5, successfulRequests: 4, failedRequests: 1,
  providerUsed: 31, providerAvailable: 969, providerLimit: 1000, providerLimitExtra: 0,
  providerResetAt: "2026-10-01T00:00:00Z", providerObservedAt: "2026-09-09T15:30:01Z",
});
const summary = formatiereFlixPatrolUsageSummary(result);
assert.match(summary, /genau einen Providerrequest/);
assert.match(summary, /5 begonnen/);
assert.match(summary, /31 verwendet, 969 verfügbar, Limit 1000/);
assert.match(summary, /nicht addiert/);
assert.equal(pruefeFlixPatrolUsageAntwort({ ...response, providerRequests: 0 }), null);
assert.equal(pruefeFlixPatrolUsageAntwort({ ...response, secret: "verboten" }), null);
assert.equal(pruefeFlixPatrolUsageAntwort({ ...response, usage: { ...response.usage, planLimit: 999 } }), null);
assert.equal(summary.includes("secret"), false);

console.log("8 FlixPatrol-Auswertetool-Prüfungen bestanden.");
