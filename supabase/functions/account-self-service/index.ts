/* Private-Pilot Eigendaten und Kontolöschung.
   Der Service-Role-Schlüssel bleibt ausschließlich in dieser Function. Der
   Browser sendet nie eine Account-ID; das aktuelle Konto stammt nur aus dem
   serverseitig verifizierten Bearer-Token. Löschung ist doppelt fail-closed:
   Edge-Secret + DB-Not-Aus + SHA-256-Allowlist. */
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = new Set(["https://kinodreieck.at", "https://staging.kinodreieck.at", "http://localhost:5173"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FRESH_SECONDS = 10 * 60;

function cors(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function envKey(newName: string, legacyName: string): string | null {
  const raw = Deno.env.get(newName);
  if (raw) {
    try {
      const values = JSON.parse(raw);
      const candidate = values?.default ?? Object.values(values || {})[0];
      if (typeof candidate === "string" && candidate) return candidate;
    } catch { /* legacy fallback */ }
  }
  return Deno.env.get(legacyName) || null;
}

function clients(authorization: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !secretKey) return null;
  return {
    user: createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } }),
    admin: createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function freshAuthentication(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const issued = Number(claims.iat || 0);
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  const recentMethod = amr.some((entry) => {
    const item = entry as Record<string, unknown>;
    return ["password", "otp", "totp", "webauthn"].includes(String(item?.method || ""))
      && now - Number(item?.timestamp || 0) <= FRESH_SECONDS;
  });
  return issued > 0 && now - issued <= FRESH_SECONDS && recentMethod;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return ORIGINS.has(origin || "") ? new Response(null, { status: 204, headers: cors(origin) }) : json({ ok: false, code: "FORBIDDEN_ORIGIN" }, 403, origin);
  if (!origin || !ORIGINS.has(origin)) return json({ ok: false, code: "FORBIDDEN_ORIGIN" }, 403, origin);
  if (req.method !== "GET" && req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (req.method === "POST" && !/^application\/json(?:;|$)/i.test(req.headers.get("Content-Type") || "")) return json({ ok: false, code: "INVALID_CONTENT_TYPE" }, 415, origin);
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
  if (!token) return json({ ok: false, code: "UNAUTHENTICATED" }, 401, origin);
  const api = clients(authorization);
  if (!api) return json({ ok: false, code: "NOT_CONFIGURED" }, 503, origin);

  const { data: claimsData, error: claimsError } = await api.user.auth.getClaims(token);
  const claims = claimsData?.claims as Record<string, unknown> | undefined;
  const accountId = String(claims?.sub || "");
  if (claimsError || claims?.role !== "authenticated" || !UUID.test(accountId)) return json({ ok: false, code: "UNAUTHENTICATED" }, 401, origin);
  const { data: userData, error: userError } = await api.user.auth.getUser(token);
  if (userError || userData?.user?.id !== accountId) return json({ ok: false, code: "UNAUTHENTICATED" }, 401, origin);
  const { data: access, error: accessError } = await api.admin
    .from("kd_account_access")
    .select("active")
    .eq("account_id", accountId)
    .maybeSingle();
  if (accessError) return json({ ok: false, code: "ACCOUNT_ACCESS_UNAVAILABLE" }, 503, origin);
  if (access?.active !== true) return json({ ok: false, code: "ACCOUNT_INACTIVE" }, 403, origin);

  if (req.method === "GET") {
    const { data: exportSettings, error: exportSettingsError } = await api.admin
      .from("kd_private_settings")
      .select("export_enabled")
      .eq("singleton", true)
      .maybeSingle();
    if (exportSettingsError || exportSettings?.export_enabled !== true) return json({ ok: false, code: "EXPORT_DISABLED" }, 403, origin);
    const { data, error } = await api.admin.rpc("kd_private_own_data", { p_account_id: accountId });
    if (error || !data || typeof data !== "object") return json({ ok: false, code: "OWN_DATA_UNAVAILABLE" }, 503, origin);
    return json({
      ok: true,
      schemaVersion: 1,
      data: {
        auth: { createdAt: userData.user.created_at || null, lastSignInAt: userData.user.last_sign_in_at || null, providers: (userData.user.identities || []).map((identity) => identity.provider).filter(Boolean) },
        ...(data as Record<string, unknown>),
      },
    }, 200, origin);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, code: "INVALID_REQUEST" }, 400, origin); }
  const allowedKeys = new Set(["action", "operationId", "confirmation"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key)) || body.action !== "delete" || !UUID.test(String(body.operationId || ""))) {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400, origin);
  }
  if (Deno.env.get("KD_ACCOUNT_DELETE_ENABLED") !== "true") return json({ ok: false, code: "DELETE_DISABLED" }, 403, origin);
  if (!freshAuthentication(claims || {})) return json({ ok: false, code: "REAUTH_REQUIRED" }, 403, origin);
  const expectedConfirmation = `DELETE ${userData.user.email || ""}`;
  if (!userData.user.email || body.confirmation !== expectedConfirmation) return json({ ok: false, code: "CONFIRMATION_MISMATCH" }, 400, origin);
  const accountHash = await sha256(accountId);
  const allowlist = new Set((Deno.env.get("KD_ACCOUNT_DELETE_ALLOWLIST_SHA256") || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (!allowlist.has(accountHash)) return json({ ok: false, code: "DELETE_NOT_ALLOWLISTED" }, 403, origin);

  const operationId = String(body.operationId);
  const { data: begin, error: beginError } = await api.admin.rpc("kd_private_delete_begin", { p_account_id: accountId, p_operation_id: operationId, p_account_hash: accountHash });
  if (beginError || !begin?.ok) {
    const code = begin?.code === "DELETE_RATE_LIMIT" ? "DELETE_RATE_LIMIT" : begin?.code === "DELETE_DISABLED" ? "DELETE_DISABLED" : "DELETE_PREPARE_FAILED";
    return json({ ok: false, code, operationId }, code === "DELETE_RATE_LIMIT" ? 429 : 503, origin);
  }
  if (begin.already_deleted === true) return json({ ok: true, deleted: true, operationId }, 200, origin);

  const { error: deleteError } = await api.admin.auth.admin.deleteUser(accountId, false);
  if (deleteError) {
    await api.admin.rpc("kd_private_delete_finish", { p_operation_id: operationId, p_account_hash: accountHash, p_succeeded: false });
    return json({ ok: false, code: "AUTH_DELETE_FAILED", operationId }, 503, origin);
  }
  const { data: finish, error: finishError } = await api.admin.rpc("kd_private_delete_finish", { p_operation_id: operationId, p_account_hash: accountHash, p_succeeded: true });
  return json({ ok: true, deleted: true, operationId, ledgerConfirmed: !finishError && finish?.ok === true }, 200, origin);
});
