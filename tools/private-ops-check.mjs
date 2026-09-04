#!/usr/bin/env node
/* Payloadfreier, ausschließlich lesender Private-Pilot-Check. Jeder einzelne
   Netzruf endet nach 20 Sekunden, der gesamte Lauf spätestens nach fünf
   Minuten. Fehlende Secrets werden je Check NOT_CONFIGURED und verhindern
   nicht, dass unabhängige Prüfungen weiterlaufen. */
const NETWORK_TIMEOUT_MS = 20_000;
const RUN_TIMEOUT_MS = 5 * 60_000;

const safeCode = (value) => String(value || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "_").slice(0, 60).toUpperCase();
const result = (id, code, extra = {}) => ({ id, code: safeCode(code), ...extra });

const STAGING_PRIVATE_FLAGS = Object.freeze({
  provider_requests_enabled: true,
  scheduler_enabled: false,
  purge_enabled: false,
  delete_enabled: false,
  export_enabled: false,
});
const STAGING_RADAR_FLAGS = Object.freeze({
  radar_aktiv: true,
  radar_shares_aktiv: false,
  radar_provider_aktiv: true,
  radar_scheduler_aktiv: true,
  radar_proposal_import_aktiv: false,
});

/* Staging and Production currently share one Supabase project. Keeping both
   profiles explicit prevents a hidden all-false default if that topology
   changes later. */
export const PRIVATE_OPS_FLAG_MATRICES = Object.freeze({
  staging: Object.freeze({
    privateSettings: STAGING_PRIVATE_FLAGS,
    radarSettings: STAGING_RADAR_FLAGS,
  }),
  production: Object.freeze({
    privateSettings: Object.freeze({ ...STAGING_PRIVATE_FLAGS }),
    radarSettings: Object.freeze({ ...STAGING_RADAR_FLAGS }),
  }),
});

function matchesExactMatrix(row, expected) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(row).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && expectedKeys.every((key) => typeof row[key] === "boolean" && row[key] === expected[key]);
}

async function jsonFetch(fetchImpl, url, init = {}) {
  const signal = AbortSignal.timeout(NETWORK_TIMEOUT_MS);
  const response = await fetchImpl(url, { ...init, signal, headers: { Accept: "application/json", ...(init.headers || {}) } });
  let data = null;
  try { data = await response.json(); } catch { /* invalid below */ }
  return { ok: response.ok, status: response.status, data };
}

export async function runPrivateOpsCheck({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const reports = [];
  const critical = [];
  const add = (entry, isCritical = false) => {
    reports.push(entry);
    if (isCritical && entry.code !== "OK" && entry.code !== "PURGE_DUE") critical.push(entry.id);
  };
  const base = String(env.KD_MONITOR_SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = String(env.KD_MONITOR_SERVICE_ROLE_KEY || "");
  const publicKey = String(env.KD_MONITOR_PUBLISHABLE_KEY || "");
  const expectedFlags = PRIVATE_OPS_FLAG_MATRICES[String(env.KD_MONITOR_ENVIRONMENT || "")];

  try {
    if (!env.KD_MONITOR_STAGING_URL || !env.KD_MONITOR_EXPECTED_BUILD) add(result("build", "NOT_CONFIGURED"), true);
    else {
      const response = await jsonFetch(fetchImpl, `${String(env.KD_MONITOR_STAGING_URL).replace(/\/+$/, "")}/build-meta.json`);
      add(result("build", !response.ok ? "BUILD_UNREACHABLE" : response.data?.buildVersion === env.KD_MONITOR_EXPECTED_BUILD ? "OK" : "BUILD_MISMATCH"), true);
    }
  } catch { add(result("build", "BUILD_UNREACHABLE"), true); }

  let accessToken = "";
  try {
    if (!base || !publicKey || !env.KD_MONITOR_EMAIL || !env.KD_MONITOR_PASSWORD) add(result("function", "NOT_CONFIGURED"), true);
    else {
      const login = await jsonFetch(fetchImpl, `${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: publicKey, "Content-Type": "application/json" }, body: JSON.stringify({ email: env.KD_MONITOR_EMAIL, password: env.KD_MONITOR_PASSWORD }) });
      accessToken = login.ok && typeof login.data?.access_token === "string" ? login.data.access_token : "";
      if (!accessToken) add(result("function", "AUTH_UNREACHABLE"), true);
      else {
        const health = await jsonFetch(fetchImpl, `${base}/functions/v1/ai-task`, { method: "POST", headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ task: "health", promptVersion: "monitor-v1", profilVersion: "monitor-v1", payload: {} }) });
        const expectedFunction = String(env.KD_MONITOR_EXPECTED_FUNCTION_BUILD || "");
        const code = !health.ok ? "FUNCTION_UNAVAILABLE"
          : !expectedFunction ? "NOT_CONFIGURED"
            : health.data?.buildVersion === expectedFunction ? "OK" : "FUNCTION_BUILD_MISMATCH";
        add(result("function", code), true);
      }
    }
  } catch { add(result("function", "FUNCTION_UNAVAILABLE"), true); }

  try {
    if (!base || !publicKey || !accessToken) add(result("access", "NOT_CONFIGURED"), true);
    else {
      const response = await jsonFetch(fetchImpl, `${base}/rest/v1/kd_account_access?select=role,active,personal_ai`, { headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}` } });
      const rows = Array.isArray(response.data) ? response.data : [];
      const row = rows.length === 1 ? rows[0] : null;
      const valid = row && (row.role === "member" || row.role === "owner")
        && row.active === true && typeof row.personal_ai === "boolean";
      add(result("access", !response.ok ? "ACCESS_UNAVAILABLE" : valid ? "OK" : "ACCESS_DENIED"), true);
    }
  } catch { add(result("access", "ACCESS_UNAVAILABLE"), true); }

  const adminHeaders = serviceKey ? { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } : null;
  try {
    if (!expectedFlags) add(result("flags", "EXPECTED_MATRIX_NOT_CONFIGURED"), true);
    else if (!base || !adminHeaders) add(result("flags", "NOT_CONFIGURED"), true);
    else {
      const response = await jsonFetch(fetchImpl, `${base}/rest/v1/kd_private_settings?select=provider_requests_enabled,scheduler_enabled,purge_enabled,delete_enabled,export_enabled&singleton=eq.true`, { headers: adminHeaders });
      const row = Array.isArray(response.data) && response.data.length === 1 ? response.data[0] : null;
      const code = !response.ok || !row
        ? "DATABASE_UNAVAILABLE"
        : matchesExactMatrix(row, expectedFlags.privateSettings)
          ? "OK" : "FLAG_MATRIX_MISMATCH";
      add(result("flags", code), true);
    }
  } catch { add(result("flags", "DATABASE_UNAVAILABLE"), true); }

  try {
    if (!expectedFlags) add(result("radar_flags", "EXPECTED_MATRIX_NOT_CONFIGURED"), true);
    else if (!base || !adminHeaders) add(result("radar_flags", "NOT_CONFIGURED"), true);
    else {
      const response = await jsonFetch(fetchImpl, `${base}/rest/v1/kd_radar_settings?select=radar_aktiv,radar_shares_aktiv,radar_provider_aktiv,radar_scheduler_aktiv,radar_proposal_import_aktiv&singleton=eq.true`, { headers: adminHeaders });
      const row = Array.isArray(response.data) && response.data.length === 1 ? response.data[0] : null;
      const code = !response.ok || !row
        ? "DATABASE_UNAVAILABLE"
        : matchesExactMatrix(row, expectedFlags.radarSettings)
          ? "OK" : "FLAG_MATRIX_MISMATCH";
      add(result("radar_flags", code), true);
    }
  } catch { add(result("radar_flags", "DATABASE_UNAVAILABLE"), true); }

  try {
    if (!base || !adminHeaders) add(result("budget", "NOT_CONFIGURED"), true);
    else {
      const response = await jsonFetch(fetchImpl, `${base}/rest/v1/kd_ai_limits?select=schluessel,wert&schluessel=in.(ai_aktiv,monatsbudget_usd_cent,anbieter_request_max_usd_cent)`, { headers: adminHeaders });
      const values = Object.fromEntries(Array.isArray(response.data) ? response.data.map((row) => [row.schluessel, row.wert]) : []);
      const known = typeof values.ai_aktiv === "boolean" && Number.isFinite(values.monatsbudget_usd_cent) && Number.isFinite(values.anbieter_request_max_usd_cent) && values.anbieter_request_max_usd_cent > 0 && values.anbieter_request_max_usd_cent <= 500;
      add(result("budget", response.ok && known ? "OK" : "BUDGET_UNKNOWN"), true);
    }
  } catch { add(result("budget", "BUDGET_UNKNOWN"), true); }

  try {
    if (!base || !adminHeaders) add(result("purge", "NOT_CONFIGURED"), true);
    else {
      const response = await jsonFetch(fetchImpl, `${base}/rest/v1/rpc/kd_private_retention_run`, { method: "POST", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ p_dry_run: true, p_limit: 500 }) });
      const due = response.data?.due && typeof response.data.due === "object" ? Object.values(response.data.due).reduce((sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0), 0) : null;
      add(result("purge", !response.ok || due == null ? "DATABASE_UNAVAILABLE" : due > 0 ? "PURGE_DUE" : "OK", due == null ? {} : { warningCount: due }), true);
    }
  } catch { add(result("purge", "DATABASE_UNAVAILABLE"), true); }

  return { ok: critical.length === 0, reports, critical };
}

async function main() {
  const timeout = setTimeout(() => {
    console.log(JSON.stringify({ ok: false, reports: [result("run", "RUN_TIMEOUT")], critical: ["run"] }));
    process.exit(1);
  }, RUN_TIMEOUT_MS);
  timeout.unref?.();
  const output = await runPrivateOpsCheck();
  clearTimeout(timeout);
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exitCode = 1;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) await main();
