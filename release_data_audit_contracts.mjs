import assert from "node:assert/strict";
import fs from "node:fs";

import {
  ACCOUNT_SELF_SERVICE_TIMEOUT_MS,
  createAccountSelfService,
} from "./src/services/accountSelfService.js";
import {
  createEntdeckenDailyFeedService,
  ENTDECKEN_DAILY_CLIENT_TIMEOUT_MS,
} from "./src/services/entdeckenDailyFeed.js";
import {
  createPrivateMailService,
  PRIVATE_MAIL_CLIENT_STATUS,
} from "./src/services/privateMail.js";
import {
  createRadarWebsearchService,
  RADAR_WEBSEARCH_CLIENT_TIMEOUT_MS,
} from "./src/services/radarWebsearch.js";
import { ERROR_CODES } from "./src/services/errors.js";

let checks = 0;
async function check(name, run) {
  await run();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

const accountId = "123e4567-e89b-42d3-a456-426614174000";
const session = Object.freeze({
  mode: "account",
  state: "ready",
  account: Object.freeze({ id: accountId }),
  capabilities: Object.freeze({ remoteStorage: true }),
});
const auth = Object.freeze({ getSnapshot: () => session });
const getAccount = () => ({ id: accountId });
const getAccessToken = async () => "synthetic-session-token";

function hangingBodyFetch(capture) {
  return async (_url, init = {}) => {
    capture.signal = init.signal;
    return {
      ok: true,
      status: 200,
      json() {
        return new Promise((_resolve, reject) => {
          const aborted = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          if (init.signal?.aborted) aborted();
          else init.signal?.addEventListener("abort", aborted, { once: true });
        });
      },
    };
  };
}

await check("täglicher Entdecken-Forward-Fix folgt dem Wiener Kalendertag", () => {
  const previousPath = "supabase/migrations/20260904140000_entdecken_daily_refresh_interval.sql";
  const fixPath = "supabase/migrations/20260905180000_entdecken_vienna_day_claim.sql";
  const previous = fs.readFileSync(previousPath, "utf8");
  const fix = fs.readFileSync(fixPath, "utf8");
  assert.ok(previousPath < fixPath);
  assert.match(previous, /v_anchor \+ interval '24 hours'/u);
  assert.match(fix, /v_last_attempt_day := coalesce\([\s\S]*at time zone 'Europe\/Vienna'/u);
  assert.match(fix, /v_due := v_last_attempt_day is null or v_last_attempt_day < v_today/u);
  assert.doesNotMatch(fix, /v_anchor \+ interval '24 hours'/u);
  assert.equal((fix.match(/create or replace function/gu) || []).length, 1);
  assert.match(fix, /extract\(hour from v_utc\)::integer <> 2/u);
  assert.match(fix, /for update/iu);
  assert.match(fix, /lease_expires_at = v_now \+ interval '180 seconds'/u);
  assert.match(fix, /not provider_enabled and not commercial_enabled/u);
  assert.match(fix, /revoke all on function[\s\S]*from public, anon, authenticated/u);
  assert.match(fix, /grant execute on function[\s\S]*to service_role/u);

  const previousRun = new Date("2026-09-04T02:00:10.000Z");
  const nextCron = new Date("2026-09-05T02:00:01.000Z");
  assert.equal(nextCron >= new Date(previousRun.getTime() + 86_400_000), false);
  const viennaDay = (instant) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(instant);
  assert.notEqual(viennaDay(previousRun), viennaDay(nextCron));
});

await check("jede deploybare Function besitzt einen expliziten JWT-Konfigvertrag", () => {
  const config = fs.readFileSync("supabase/config.toml", "utf8");
  const deployable = fs.readdirSync("supabase/functions", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(`supabase/functions/${entry.name}/index.ts`))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(deployable, [
    "account-self-service", "ai-task", "automatic-ai-check",
    "entdecken-daily-task", "private-mail-request", "radar-websearch-task",
  ]);
  for (const name of deployable) {
    assert.equal((config.match(new RegExp(`^\\[functions\\.${name}\\]$`, "gmu")) || []).length, 1, name);
  }
  assert.match(config, /\[functions\.account-self-service\][\s\S]*?verify_jwt = true/u);
});

await check("historischer Schema-Snapshot behauptet keinen aktuellen Restore-Gesamtstand", () => {
  const schema = fs.readFileSync("supabase/current_schema.sql", "utf8");
  const readme = fs.readFileSync("supabase/README.md", "utf8");
  const migrationReadme = fs.readFileSync("supabase/migrations/LIESMICH.md", "utf8");
  assert.match(schema, /Basis bis 20260809121000/u);
  assert.match(schema, /KEIN aktueller Ist-Stand/u);
  assert.match(schema, /KEINE\s+--\s+alleinige Wiederherstellungsreferenz/u);
  assert.match(readme, /späteren Radar-, Private-,\s+Mail-, Retry- und Entdecken-Objekte aber nicht/u);
  assert.match(migrationReadme, /kein aktueller Gesamtstand und keine alleinige Wiederherstellungsreferenz/u);
});

await check("Kontoexport-Client beendet auch einen hängenden Response-Body", async () => {
  const capture = {};
  const service = createAccountSelfService({
    config: {
      privateSelfServiceEnabled: true,
      accountSelfServiceEndpointName: "account-self-service",
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable",
    },
    tokenLoader: getAccessToken,
    fetchImpl: hangingBodyFetch(capture),
    timeoutMs: 5,
  });
  await assert.rejects(() => service.getOwnData(), (error) => error?.code === ERROR_CODES.OFFLINE);
  assert.equal(capture.signal?.aborted, true);
  assert.equal(ACCOUNT_SELF_SERVICE_TIMEOUT_MS, 20_000);
});

await check("Entdecken-Client beendet auch einen hängenden Response-Body", async () => {
  const capture = {};
  const service = createEntdeckenDailyFeedService({
    config: {
      entdeckenDailyFeedEnabled: true,
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable",
    },
    auth,
    getAccount,
    getAccessToken,
    fetchImpl: hangingBodyFetch(capture),
    fallbackFeed: null,
    timeoutMs: 5,
  });
  assert.deepEqual(await service.load(), {
    status: "unavailable",
    feed: null,
    responseMode: "structured",
    displayText: null,
    warnings: [],
  });
  assert.equal(capture.signal?.aborted, true);
  assert.equal(ENTDECKEN_DAILY_CLIENT_TIMEOUT_MS, 20_000);
});

await check("Radar-Client beendet auch einen hängenden Response-Body", async () => {
  const capture = {};
  const service = createRadarWebsearchService({
    config: {
      radarPilotClientEnabled: true,
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable",
    },
    auth,
    getAccount,
    getAccessToken,
    fetchImpl: hangingBodyFetch(capture),
    singleFile: false,
    timeoutMs: 5,
  });
  assert.deepEqual(await service.checkNow("work:imdb:tt1234567"), { status: "unavailable", writes: 0 });
  assert.equal(capture.signal?.aborted, true);
  assert.equal(RADAR_WEBSEARCH_CLIENT_TIMEOUT_MS, 140_000);
});

await check("Mail-Client beendet auch einen hängenden Response-Body", async () => {
  const capture = {};
  const service = createPrivateMailService({
    config: {
      privateMailEnabled: true,
      privateMailEndpointName: "private-mail-request",
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable",
    },
    auth,
    getAccount,
    getAccessToken,
    fetchImpl: hangingBodyFetch(capture),
    createOperationId: () => "123e4567-e89b-42d3-a456-426614174001",
    timeoutMs: 5,
  });
  assert.deepEqual(await service.submitFeedback("Test"), {
    status: PRIVATE_MAIL_CLIENT_STATUS.UNKNOWN,
    operationId: "123e4567-e89b-42d3-a456-426614174001",
  });
  assert.equal(capture.signal?.aborted, true);
});

console.log(`release_data_audit_contracts: ${checks}/${checks} checks passed`);
