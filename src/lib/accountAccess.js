/* Fachliche Kontofreigabe (Rollen-v1).
   Authentifizierung und Produktzugriff sind absichtlich getrennt: Dieser
   Client liest per Own-Row-RLS genau die eigene Freigabe. Jeder unklare Stand
   ergibt eine tokenfreie, fail-closed Projektion und niemals optimistische
   Capabilities. */

import { istSupabaseProjektUrl } from "./supabasePublic.js";

export const ACCOUNT_ROLES = Object.freeze(["member", "owner"]);
export const ACCOUNT_ACCESS_STATUS = Object.freeze({
  RESOLVED: "resolved",
  MISSING: "missing",
  UNAVAILABLE: "unavailable",
  INVALID: "invalid",
  UNAUTHENTICATED: "unauthenticated",
});

const DEFAULT_TIMEOUT_MS = 10000;

function denied(status) {
  return Object.freeze({
    status,
    role: null,
    active: false,
    personalAi: false,
  });
}

export function normalizeAccountAccessRows(rows) {
  if (!Array.isArray(rows)) return denied(ACCOUNT_ACCESS_STATUS.INVALID);
  if (rows.length === 0) return denied(ACCOUNT_ACCESS_STATUS.MISSING);
  if (rows.length !== 1) return denied(ACCOUNT_ACCESS_STATUS.INVALID);

  const row = rows[0];
  const role = typeof row?.role === "string" ? row.role.trim() : "";
  if (!ACCOUNT_ROLES.includes(role)
      || typeof row?.active !== "boolean"
      || typeof row?.personal_ai !== "boolean"
      || (row.personal_ai && !row.active)) {
    return denied(ACCOUNT_ACCESS_STATUS.INVALID);
  }
  return Object.freeze({
    status: ACCOUNT_ACCESS_STATUS.RESOLVED,
    role,
    active: row.active,
    personalAi: row.active && row.personal_ai,
  });
}

export async function loadOwnAccountAccess({
  config = {}, token = null, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const basis = String(config.supabaseUrl || "").trim().replace(/\/+$/, "");
  const anon = String(config.supabasePublishableKey || "").trim();
  const bearer = String(token || "").trim();
  if (!bearer) return denied(ACCOUNT_ACCESS_STATUS.UNAUTHENTICATED);
  if (!istSupabaseProjektUrl(basis) || !anon) return denied(ACCOUNT_ACCESS_STATUS.UNAVAILABLE);

  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) return denied(ACCOUNT_ACCESS_STATUS.UNAVAILABLE);
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await f(
      basis + "/rest/v1/kd_account_access?select=role%2Cactive%2Cpersonal_ai&limit=2",
      {
        method: "GET",
        headers: {
          apikey: anon,
          Authorization: "Bearer " + bearer,
          Accept: "application/json",
        },
        signal: ctrl ? ctrl.signal : undefined,
      },
    );
    if (!res?.ok) return denied(ACCOUNT_ACCESS_STATUS.UNAVAILABLE);
    let rows;
    try { rows = await res.json(); }
    catch { return denied(ACCOUNT_ACCESS_STATUS.INVALID); }
    return normalizeAccountAccessRows(rows);
  } catch {
    return denied(ACCOUNT_ACCESS_STATUS.UNAVAILABLE);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
