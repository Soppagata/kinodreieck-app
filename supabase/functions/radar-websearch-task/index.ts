/* Paket B: schmale serverseitige Radar-Websearch-Grenze. Der Anbieteradapter
   erhaelt nur den bereits autorisierten globalen Zielvertrag. Radar-,
   Provider-, Quellen- und Kostenkonfiguration bleiben serverseitig. */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  RADAR_WEBSEARCH_PHASE_CODES,
  createAnthropicRadarWebsearchAdapter,
  normalizeRadarReservationDecision,
} from "./anthropicAdapter.js";
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

function limitRows(rows: unknown): Map<string, unknown> {
  const values = new Map<string, unknown>();
  if (!Array.isArray(rows)) return values;
  for (const row of rows) {
    if (typeof row?.schluessel === "string") values.set(row.schluessel, row.wert);
  }
  return values;
}

function safePhaseCode(value: unknown): string {
  return typeof value === "string" && RADAR_WEBSEARCH_PHASE_CODES.includes(value)
    ? value
    : "runtime-setup";
}

function rpcEvent(
  event: Record<string, unknown>,
  personContext: Record<string, unknown> | null = null,
  titleGroupContext: Record<string, unknown> | null = null,
) {
  const titleGroupDiscovery = titleGroupContext?.discoveryMode === "canonical-group-v1";
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
    ...(personContext ? {
      personTargetKey: personContext.targetId,
      personExternalId: personContext.personExternalId,
      personRole: personContext.role,
      personName: personContext.canonicalName,
      workTargetType: event.targetType,
      workTitle: event.title,
      workYear: event.year,
      checkedAt: personContext.checkedAt,
      windowStart: personContext.windowStart,
      windowEnd: personContext.windowEnd,
    } : titleGroupContext ? {
      titleGroupTargetKey: titleGroupContext.targetId,
      queryVersion: titleGroupContext.queryVersion,
      queryKey: titleGroupContext.queryKey,
      displayName: titleGroupContext.displayName,
      workTargetType: event.targetType,
      workTitle: event.title,
      workYear: event.year,
      checkedAt: titleGroupContext.checkedAt,
      ...(titleGroupDiscovery ? {
        discoveryMode: titleGroupContext.discoveryMode,
        groupExternalId: titleGroupContext.groupExternalId,
        canonicalGroupName: titleGroupContext.canonicalGroupName,
        windowStart: titleGroupContext.windowStart,
        windowEnd: titleGroupContext.windowEnd,
        membershipEvidence: Array.isArray(event.membershipEvidence)
          ? event.membershipEvidence.map((entry: Record<string, unknown>) => ({
            sourceId: entry.sourceId,
            url: entry.url,
            retrievedAt: entry.retrievedAt,
          })) : [],
      } : {}),
    } : {}),
  };
}

export function createRadarWebsearchHandler({
  adapter = null,
  fetchImpl = fetch,
}: {
  adapter?: { search(request: unknown): Promise<unknown>; telemetry?: () => Record<string, unknown> } | null;
  fetchImpl?: typeof fetch;
} = {}) {
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
    let cachedSources: Array<Record<string, unknown>> | null = null;
    const loadSources = async () => {
      if (cachedSources) return cachedSources;
      const { data, error } = await admin.from("kd_radar_sources")
        .select("source_id,domain,publisher_family,source_class,rights_status,attribution_approved,subdomains_allowed,active")
        .eq("active", true)
        .eq("rights_status", "approved")
        .eq("attribution_approved", true)
        .in("source_class", ["official", "editorial"])
        .order("source_id", { ascending: true })
        /* Elften Eintrag als Overflow-Wache mitlesen; der Adapter akzeptiert
           hoechstens zehn Domains und faellt dann geschlossen aus. */
        .limit(11);
      if (error) throw error;
      cachedSources = sourceRows(data);
      return cachedSources;
    };
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
        return await loadSources();
      },
      async upsertConfirmedEvent({
        accountId: actor, operationId, event, personContext = null, titleGroupContext = null,
      }: {
        accountId: string; operationId: string; event: Record<string, unknown>;
        personContext?: Record<string, unknown> | null;
        titleGroupContext?: Record<string, unknown> | null;
      }) {
        const { data, error } = await admin.rpc(
          personContext
            ? "kd_radar_websearch_upsert_person_event"
            : titleGroupContext?.discoveryMode === "canonical-group-v1"
              ? "kd_radar_websearch_upsert_title_group_discovery_event"
              : titleGroupContext ? "kd_radar_websearch_upsert_title_group_event" : "kd_radar_websearch_upsert_event",
          {
          p_account_id: actor,
          p_operation_id: operationId,
          p_payload: rpcEvent(event, personContext, titleGroupContext),
          },
        );
        if (error) throw error;
        return data;
      },
      async loadFeed() {
        const { data, error } = await user.rpc("kd_radar_pilot_feed", { p_operation_ids: [] });
        if (error) throw error;
        return data;
      },
    };
    const productAdapter = adapter ?? createAnthropicRadarWebsearchAdapter({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
      fetchImpl,
      async loadSetup() {
        const [radarResult, providerResult, limitsResult, sources] = await Promise.all([
          admin.from("kd_radar_settings")
            .select("radar_aktiv,radar_provider_aktiv,radar_scheduler_aktiv")
            .eq("singleton", true)
            .maybeSingle(),
          admin.rpc("kd_private_provider_allowed", { p_provider_id: "anthropic" }),
          admin.from("kd_ai_limits")
            .select("schluessel,wert")
            .in("schluessel", [
              "anbieter_request_max_usd_cent",
              "modell_alias",
              "preise_usd_cent_pro_mtok",
              "task_max_reservierung_usd_cent",
              "task_max_tokens",
              "task_modell",
              "timeout_ms",
              "websearch_usd_cent_pro_request",
            ]),
          loadSources(),
        ]);
        if (radarResult.error || providerResult.error || limitsResult.error) {
          throw new Error("radar-websearch-setup-unavailable");
        }
        const limits = limitRows(limitsResult.data);
        const taskModels = limits.get("task_modell") as Record<string, unknown> | undefined;
        const aliases = limits.get("modell_alias") as Record<string, unknown> | undefined;
        const maxTokens = limits.get("task_max_tokens") as Record<string, unknown> | undefined;
        const taskCaps = limits.get("task_max_reservierung_usd_cent") as Record<string, unknown> | undefined;
        const prices = limits.get("preise_usd_cent_pro_mtok") as Record<string, Record<string, unknown>> | undefined;
        const modelAlias = taskModels?.["radar-websearch"];
        const model = typeof modelAlias === "string" ? aliases?.[modelAlias] : null;
        const price = typeof model === "string" ? prices?.[model] : null;
        return {
          radarEnabled: radarResult.data?.radar_aktiv,
          radarProviderEnabled: radarResult.data?.radar_provider_aktiv,
          radarSchedulerEnabled: radarResult.data?.radar_scheduler_aktiv,
          providerAllowed: providerResult.data?.ok === true
            && providerResult.data?.code === "PROVIDER_ALLOWED",
          modelAlias,
          model,
          maxTokens: maxTokens?.["radar-websearch"],
          taskCapUsdCent: taskCaps?.["radar-websearch"],
          searchFeeUsdCent: limits.get("websearch_usd_cent_pro_request"),
          globalRequestCapUsdCent: limits.get("anbieter_request_max_usd_cent"),
          timeoutMs: limits.get("timeout_ms"),
          inputPriceUsdCentPerMtok: price?.in,
          outputPriceUsdCentPerMtok: price?.out,
          sourceRegistry: sources,
        };
      },
      async reserveCost({ operationId, reservationUsdCent, searchRequests }: {
        operationId: string; reservationUsdCent: number; searchRequests: number;
      }) {
        const { data, error } = await admin.rpc("kd_radar_websearch_auftrag_starten", {
          p_account_id: accountId,
          p_target_key: targetId,
          p_operation_id: operationId,
          p_reservierung: reservationUsdCent,
          p_search_requests: searchRequests,
        });
        if (error) throw error;
        return {
          ok: data?.ok === true,
          logId: data?.log_id,
          decision: data?.ok === true ? "accepted" : normalizeRadarReservationDecision(data?.code),
        };
      },
      async settleCost({
        logId, status, model, inputTokens, outputTokens, costUsdCent, errorClass,
      }: Record<string, unknown>) {
        const { error } = await admin.rpc("kd_ai_auftrag_beenden", {
          p_id: logId,
          p_status: status,
          p_modell: model,
          p_input_tokens: inputTokens,
          p_output_tokens: outputTokens,
          p_kosten: costUsdCent,
          p_fehlerklasse: errorClass,
        });
        if (error) throw error;
      },
    });
    const result = await runRadarWebsearchCheck({
      accountId, targetId, adapter: productAdapter, repository,
    });
    const status = result.status;
    const httpStatus = status === "forbidden" ? 403 : 200;
    const telemetry = typeof productAdapter.telemetry === "function"
      ? productAdapter.telemetry() : {};
    return json({
      ok: true,
      status,
      writes: result.writes || 0,
      providerRequests: telemetry.providerRequests || 0,
      searchRequests: telemetry.searchRequests || 0,
      phaseCode: safePhaseCode(telemetry.phaseCode),
      reservationStatus: telemetry.reservationStatus || "unknown",
      reservationUsdCent: typeof telemetry.reservationUsdCent === "number"
        ? telemetry.reservationUsdCent : null,
      reservationDecision: telemetry.reservationDecision || "unknown",
      ...(result.personResult ? { personResult: result.personResult } : {}),
    }, httpStatus, origin);
  };
}

if (import.meta.main) Deno.serve(createRadarWebsearchHandler());
