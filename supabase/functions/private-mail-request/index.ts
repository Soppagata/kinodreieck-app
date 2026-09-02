/* Providerunabhaengiger Browser-Endpunkt fuer private Mailanforderungen.
   Authentisierung, Accountfreigabe, HMAC und RPCs liegen serverseitig. Bis ein
   separat belegter Transport integriert UND durch ein Server-Secret aktiviert
   ist, bleibt jeder gueltige Request ohne Claim/Send sicher unavailable. */
import { createClient } from "npm:@supabase/supabase-js@2";
import { createPrivateMailRequestHandler } from "./core.js";

function envKey(newName, legacyName) {
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

function runtimeDependencies() {
  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const serviceKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const user = url && publicKey
    ? createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  const admin = url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  return {
    hmacSecret: Deno.env.get("KD_PRIVATE_MAIL_HMAC_SECRET") || null,
    transportActivationSecret:
      Deno.env.get("KD_PRIVATE_MAIL_TRANSPORT_ACTIVATION_SECRET") || null,
    // Absichtlich kein Transport: Adapterintegration folgt erst auf belegten
    // Providervertrag. Ein Aktivierungssecret allein kann niemals senden.
    transport: null,
    getClaims: (token) => user
      ? user.auth.getClaims(token)
      : Promise.resolve({ data: null, error: new Error("auth-unavailable") }),
    getUser: (token) => user
      ? user.auth.getUser(token)
      : Promise.resolve({ data: null, error: new Error("auth-unavailable") }),
    getAccountAccess: (accountId) => admin
      ? admin.from("kd_account_access").select("active").eq("account_id", accountId).maybeSingle()
      : Promise.resolve({ data: null, error: new Error("access-unavailable") }),
    beginRequest: (args) => admin
      ? admin.rpc("kd_private_mail_request_begin", args)
      : Promise.resolve({ data: null, error: new Error("rpc-unavailable") }),
    finishRequest: (args) => admin
      ? admin.rpc("kd_private_mail_request_finish", args)
      : Promise.resolve({ data: null, error: new Error("rpc-unavailable") }),
  };
}

Deno.serve((request) => createPrivateMailRequestHandler(runtimeDependencies())(request));
