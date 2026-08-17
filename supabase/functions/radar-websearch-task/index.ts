/* Paket A: schmale serverseitige Radar-Websearch-Grenze.
   Der echte Provideradapter bleibt bis Paket B absichtlich unavailable. Die
   exportierte Handlerfabrik erhält im lokalen Test genau einen Mockadapter. */

import { createClient } from "npm:@supabase/supabase-js@2";
import { runRadarWebsearchCheck } from "./runner.js";

const ALLOWED_ORIGINS = new Set([
  "https://kinodreieck.at",
  "https://staging.kinodreieck.at",
  "http://localhost:5173",
]);
const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string { return String(value == null ? "" : value).trim(); }
function cors(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}
function envKey(newName: string, legacyName: string): string {
  const raw = Deno.env.get(newName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const candidate = parsed?.default ?? (parsed && typeof parsed === "object" ? Object.values(parsed)[0] : null);
      if (typeof candidate === "string" && candidate) return candidate;
    } catch { /* fail closed below */ }
  }
  return Deno.env.get(legacyName) || "";
}

async function accountFromRequest(req: Request, supabaseUrl: string, publishableKey: string): Promise<string> {
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
  if (!token || !supabaseUrl || !publishableKey) return "";
  try {
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getClaims(token);
    const claims = (data as { claims?: Record<string, unknown> } | null)?.claims;
    const accountId = typeof claims?.sub === "string" ? claims.sub : "";
    return !error && claims?.role === "authenticated" && UUID_FORM.test(accountId) ? accountId : "";
  } catch { return ""; }
}

function sourceRows(rows: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    sourceId: row?.source_id,
    domain: row?.domain,
    publisherFamily: row?.publisher_family,
    sourceClass: row?.source_class,
    rightsStatus: row?.rights_status,
    attributionApproved: row?.attribution_approved,
    subdomainsAllowed: row?.subdomains_allowed,
    active: row?.active,
  }));
}

function rpcEvent(event: Record<string, unknown>) {
  return {
    targetKey: event.targetKey,
    eventType: event.eventType,
    date: event.date,
    region: event.region,
    platform: event.platform,
    seasonNumber: event.seasonNumber,
    evidence: Array.isArray(event.evidence) ? event.evidence.map((entry: Record<string, unknown>) => ({
      sourceId: entry.sourceId,
      url: entry.url,
      retrievedAt: entry.retrievedAt,
    })) : [],
  };
}

export function createRadarWebsearchHandler({ adapter }: { adapter: { search(request: unknown): Promise<unknown> } }) {
  return async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get("Origin");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== "POST") return json({ ok: false, status: "forbidden", writes: 0 }, 405, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const serviceKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const accountId = await accountFromRequest(req, supabaseUrl, publishableKey);
    if (!accountId || !serviceKey) return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);

    let body: unknown;
    try { body = await req.json(); } catch { return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin); }
    if (!body || typeof body !== "object" || Array.isArray(body)
        || Object.keys(body).length !== 1 || typeof (body as { targetId?: unknown }).targetId !== "string") {
      return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin);
    }
    const targetId = text((body as { targetId: string }).targetId);
    if (!targetId || targetId.length > 160) return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
    const user = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const repository = {
      async loadAuthorizedTarget({ accountId: actor, targetId: key }: { accountId: string; targetId: string }) {
        const { data, error } = await admin.rpc("kd_radar_websearch_context", {
          p_account_id: actor,
          p_target_key: key,
        });
        if (error) throw error;
        return data;
      },
      async resolveSources() {
        const { data, error } = await admin.from("kd_radar_sources")
          .select("source_id,domain,publisher_family,source_class,rights_status,attribution_approved,subdomains_allowed,active")
          .eq("active", true)
          .eq("rights_status", "approved")
          .eq("attribution_approved", true)
          .order("source_id", { ascending: true })
          .limit(256);
        if (error) throw error;
        return sourceRows(data);
      },
      async upsertConfirmedEvent({ accountId: actor, operationId, event }: {
        accountId: string; operationId: string; event: Record<string, unknown>;
      }) {
        const { data, error } = await admin.rpc("kd_radar_websearch_upsert_event", {
          p_account_id: actor,
          p_operation_id: operationId,
          p_payload: rpcEvent(event),
        });
        if (error) throw error;
        return data;
      },
      async loadFeed() {
        const { data, error } = await user.rpc("kd_radar_pilot_feed", { p_operation_ids: [] });
        if (error) throw error;
        return data;
      },
    };
    const result = await runRadarWebsearchCheck({ accountId, targetId, adapter, repository });
    const status = result.status;
    const httpStatus = status === "forbidden" ? 403 : 200;
    return json({ ok: true, status, writes: result.writes || 0 }, httpStatus, origin);
  };
}

/* Paket A besitzt absichtlich keinen echten Anbieter. Selbst bei versehentlichem
   lokalen Start endet der Pfad nach genau diesem fehlgeschlagenen Adaptercall. */
const unavailableAdapter = Object.freeze({
  async search() { throw new Error("radar-websearch-provider-not-configured"); },
});

if (import.meta.main) Deno.serve(createRadarWebsearchHandler({ adapter: unavailableAdapter }));
