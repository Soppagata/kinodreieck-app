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
import {
  PROVIDER_DIAGNOSTIC_ENV,
  PROVIDER_DIAGNOSTIC_HEADER,
  providerDiagnosticAccess,
  providerDiagnosticField,
} from "../_shared/providerDiagnostic.js";

const ALLOWED_ORIGINS = new Set([
  "https://kinodreieck.at",
  "https://staging.kinodreieck.at",
  "http://localhost:5173",
]);
const RADAR_REFRESH_HEADER = "x-kd-radar-refresh";
const SCHEDULED_REFRESH_VALUE = "scheduled-v1";
const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIENNA_DAY_FORM = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function text(value: unknown): string { return String(value == null ? "" : value).trim(); }
function cors(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${RADAR_REFRESH_HEADER}, ${PROVIDER_DIAGNOSTIC_HEADER}`,
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
  textContext: Record<string, unknown> | null = null,
) {
  const titleGroupDiscovery = titleGroupContext?.discoveryMode === "canonical-group-v1";
  return {
    targetKey: textContext ? textContext.targetId : event.targetKey,
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
    ...(textContext ? {
      textTargetKey: textContext.targetId,
      targetText: textContext.targetText,
      workTargetType: event.targetType,
      workTitle: event.title,
      workYear: event.year,
      checkedAt: textContext.checkedAt,
      relationEvidence: textContext.relationEvidence,
    } : personContext ? {
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
  adapter?: {
    search(request: unknown): Promise<unknown>;
    telemetry?: () => Record<string, unknown>;
    takeProviderRawResponse?: () => string | null;
  } | null;
  fetchImpl?: typeof fetch;
} = {}) {
  return async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get("Origin");
    const providerDiagnosticHeader = req.headers.get(PROVIDER_DIAGNOSTIC_HEADER);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== "POST") return json({ ok: false, status: "forbidden", writes: 0 }, 405, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const serviceKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
    const refreshHeader = req.headers.get(RADAR_REFRESH_HEADER);
    const scheduledMode = refreshHeader === SCHEDULED_REFRESH_VALUE;
    if (!supabaseUrl || !publishableKey || !serviceKey
        || (refreshHeader !== null && !scheduledMode)) {
      return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
    }
    if (scheduledMode && (req.body !== null || origin !== null
        || providerDiagnosticHeader !== null
        || req.headers.get("apikey") !== serviceKey || token !== serviceKey)) {
      return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
    }

    let accountId = "";
    let targetId = "";
    let rawTargetText: string | null = null;
    let dailyClaim: {
      targetRowId: string;
      viennaDay: string;
      fenceToken: string;
    } | null = null;

    if (!scheduledMode) {
      accountId = await accountFromRequest(req, supabaseUrl, publishableKey);
      if (!accountId) return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
      let body: unknown;
      try { body = await req.json(); } catch { return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin); }
      if (!body || typeof body !== "object" || Array.isArray(body)
          || ![1, 2].includes(Object.keys(body).length)
          || typeof (body as { targetId?: unknown }).targetId !== "string"
          || Object.keys(body).some((key) => !["targetId", "targetText"].includes(key))) {
        return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin);
      }
      targetId = text((body as { targetId: string }).targetId);
      const hasTargetText = Object.prototype.hasOwnProperty.call(body, "targetText");
      const targetText = hasTargetText ? (body as { targetText?: unknown }).targetText : null;
      if (!targetId || targetId.length > 160
          || (hasTargetText && (typeof targetText !== "string" || !targetText.trim() || targetText.length > 160))) {
        return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin);
      }
      rawTargetText = hasTargetText ? targetText as string : null;
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (scheduledMode) {
      const { data: claim, error: claimError } = await admin.rpc("kd_radar_daily_claim");
      if (claimError) return json({ ok: false, status: "failed" }, 500, origin);
      if (claim?.claim !== true) {
        if (claim?.claim !== false || !["idle", "disabled"].includes(claim?.status)) {
          return json({ ok: false, status: "failed" }, 500, origin);
        }
        return new Response(null, {
          status: 204,
          headers: { ...cors(origin), "Cache-Control": "no-store" },
        });
      }
      accountId = typeof claim.accountId === "string" ? claim.accountId : "";
      targetId = typeof claim.targetId === "string" ? claim.targetId : "";
      const targetRowId = typeof claim.targetRowId === "string" ? claim.targetRowId : "";
      const viennaDay = typeof claim.viennaDay === "string" ? claim.viennaDay : "";
      const fenceToken = typeof claim.fenceToken === "string" ? claim.fenceToken : "";
      rawTargetText = claim.targetText === null ? null
        : typeof claim.targetText === "string" ? claim.targetText : "";
      if (!UUID_FORM.test(accountId) || !UUID_FORM.test(targetRowId)
          || !UUID_FORM.test(fenceToken) || !VIENNA_DAY_FORM.test(viennaDay)
          || !targetId || targetId.length > 160
          || (rawTargetText !== null && (!rawTargetText.trim() || rawTargetText.length > 160))) {
        return json({ ok: false, status: "failed" }, 500, origin);
      }
      dailyClaim = { targetRowId, viennaDay, fenceToken };
    }
    let providerDiagnostic = providerDiagnosticAccess({
      headerValue: providerDiagnosticHeader,
      enabled: Deno.env.get(PROVIDER_DIAGNOSTIC_ENV) === "true",
      owner: false,
    });
    if (providerDiagnostic.requested) {
      const { data: access, error: accessError } = await admin
        .from("kd_account_access")
        .select("role,active,personal_ai")
        .eq("account_id", accountId)
        .maybeSingle();
      providerDiagnostic = providerDiagnosticAccess({
        headerValue: providerDiagnosticHeader,
        enabled: Deno.env.get(PROVIDER_DIAGNOSTIC_ENV) === "true",
        owner: !accessError && access?.role === "owner"
          && access?.active === true && access?.personal_ai === true,
      });
      if (!providerDiagnostic.allowed) {
        return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
      }
    }
    const user = scheduledMode ? null : createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const assertDailyLease = async () => {
      if (!dailyClaim) return;
      const { data, error } = await admin.rpc("kd_radar_daily_assert_lease", {
        p_account_id: accountId,
        p_target_id: dailyClaim.targetRowId,
        p_vienna_day: dailyClaim.viennaDay,
        p_fence_token: dailyClaim.fenceToken,
      });
      if (error || data?.ok !== true) throw error || new Error("radar-daily-lease-invalid");
    };
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
      async loadAuthorizedTarget({
        accountId: actor, targetId: key, targetText: rawText = null,
      }: { accountId: string; targetId: string; targetText?: string | null }) {
        const rpc = rawText === null ? "kd_radar_websearch_context" : "kd_radar_websearch_prepare_text";
        const { data, error } = await admin.rpc(rpc, rawText === null ? {
          p_account_id: actor, p_target_key: key,
        } : {
          p_account_id: actor, p_target_key: key, p_target_text: rawText,
          p_operation_id: crypto.randomUUID(),
        });
        if (error) throw error;
        return data;
      },
      async resolveSources() {
        return await loadSources();
      },
      async upsertConfirmedEvent({
        accountId: actor, operationId, event, personContext = null, titleGroupContext = null, textContext = null,
      }: {
        accountId: string; operationId: string; event: Record<string, unknown>;
        personContext?: Record<string, unknown> | null;
        titleGroupContext?: Record<string, unknown> | null;
        textContext?: Record<string, unknown> | null;
      }) {
        await assertDailyLease();
        const { data, error } = await admin.rpc(
          textContext
            ? "kd_radar_websearch_upsert_text_event"
            : personContext
            ? "kd_radar_websearch_upsert_person_event"
            : titleGroupContext?.discoveryMode === "canonical-group-v1"
              ? "kd_radar_websearch_upsert_title_group_discovery_event"
              : titleGroupContext ? "kd_radar_websearch_upsert_title_group_event" : "kd_radar_websearch_upsert_event",
          {
          p_account_id: actor,
          p_operation_id: operationId,
          p_payload: rpcEvent(event, personContext, titleGroupContext, textContext),
          },
        );
        if (error) throw error;
        return data;
      },
      async loadFeed() {
        if (!user) return null;
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
        await assertDailyLease();
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
    let result;
    try {
      result = await runRadarWebsearchCheck({
        accountId, targetId, targetText: rawTargetText, adapter: productAdapter, repository,
      });
    } catch (error) {
      if (!scheduledMode) throw error;
      result = { status: "unavailable", writes: 0 };
    }
    if (dailyClaim) {
      const safeStatus = [
        "confirmed", "no_change", "insufficient_evidence", "provider_error",
        "storage_error", "forbidden", "unavailable",
      ].includes(result.status) ? result.status : "unavailable";
      const { data: finish, error: finishError } = await admin.rpc("kd_radar_daily_finish", {
        p_account_id: accountId,
        p_target_id: dailyClaim.targetRowId,
        p_vienna_day: dailyClaim.viennaDay,
        p_fence_token: dailyClaim.fenceToken,
        p_safe_status: safeStatus,
      });
      return finishError || finish?.ok !== true
        ? json({ ok: false, status: "failed" }, 500, origin)
        : json({ ok: true, status: "processed" }, 200, origin);
    }
    const status = result.status;
    const httpStatus = status === "forbidden" ? 403 : 200;
    const telemetry = typeof productAdapter.telemetry === "function"
      ? productAdapter.telemetry() : {};
    const providerRawResponse = providerDiagnostic.allowed
      && typeof productAdapter.takeProviderRawResponse === "function"
      ? productAdapter.takeProviderRawResponse()
      : null;
    if (providerDiagnostic.allowed && typeof providerRawResponse !== "string") {
      return json({ ok: false, status: "provider_error", writes: result.writes || 0 }, 500, origin);
    }
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
      ...(result.responseMode ? {
        responseMode: result.responseMode,
        displayText: result.displayText,
        warnings: result.warnings,
      } : {}),
      ...(result.providerReceipt
        ? { providerReceipt: result.providerReceipt }
        : {}),
      ...(providerDiagnostic.allowed
        ? providerDiagnosticField(providerRawResponse)
        : {}),
    }, httpStatus, origin);
  };
}

if (import.meta.main) Deno.serve(createRadarWebsearchHandler());
