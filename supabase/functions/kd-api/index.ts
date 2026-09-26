import { createClient } from "npm:@supabase/supabase-js@2";
import { createKdApiHandler } from "./core.js";

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

const url = Deno.env.get("SUPABASE_URL") || "";
const publicKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY") || "";
const secretKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function authUser(token: string): Promise<string | null> {
  if (!url || !publicKey) return null;
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user?.id || null;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function runAiJob(jobId: string) {
  const invocationKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || secretKey;
  if (!url || !invocationKey) return;
  try {
    const response = await fetch(`${url}/functions/v1/ai-task`, {
      method: "POST",
      headers: { Authorization: `Bearer ${invocationKey}`, "Content-Type": "application/json", "X-KD-API-Job": jobId },
      body: JSON.stringify({ kdApiJobId: jobId }),
    });
    if (!response.ok) await rpc("kd_api_mark_ai_job_unknown_v1", { p_job_id: jobId });
  } catch {
    // Transportausgang ist ohne Provider-Readback unklar. Derselbe Job bleibt
    // die einzige stabile Identität; Statuslesen erzeugt keinen Folgeauftrag.
    await rpc("kd_api_mark_ai_job_unknown_v1", { p_job_id: jobId }).catch(() => {});
  }
}

const handler = createKdApiHandler({
  env: (name: string) => Deno.env.get(name) || null,
  authUser,
  rpc,
  sha256,
  randomUUID: () => crypto.randomUUID(),
  dispatchAi(jobId: string) {
    const promise = runAiJob(jobId);
    const runtime = globalThis as unknown as { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } };
    if (runtime.EdgeRuntime?.waitUntil) runtime.EdgeRuntime.waitUntil(promise);
  },
});

if (Deno.env.get("KD_KEIN_SERVER") !== "1") Deno.serve(handler);
export { handler };
