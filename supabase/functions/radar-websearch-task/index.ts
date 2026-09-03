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
  authorizeScheduledRadarRequest,
  resolveSupabaseAdminKey,
} from "./contract.js";
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
const SCHEDULED_REFRESH_VALUE = "scheduled-144h-v1";
const RETRY_REFRESH_VALUE = "retry-6h-v1";
const RETRY_JOB_HEADER = "x-kd-automatic-job-id";
const RETRY_OPERATION_HEADER = "x-kd-radar-retry-operation";
const AUTOMATIC_RETRY_TASK_ID = "radar-websearch-task";
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

type AuthenticatedRadarRequest = Readonly<{ accountId: string; token: string }>;

async function accountFromRequest(
  req: Request,
  supabaseUrl: string,
  publishableKey: string,
): Promise<AuthenticatedRadarRequest | null> {
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
  if (!token || !supabaseUrl || !publishableKey) return null;
  try {
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getClaims(token);
    const claims = (data as { claims?: Record<string, unknown> } | null)?.claims;
    const accountId = typeof claims?.sub === "string" ? claims.sub : "";
    return !error && claims?.role === "authenticated" && UUID_FORM.test(accountId)
      ? { accountId, token }
      : null;
  } catch { return null; }
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
  if (textContext) return {
    targetKey: event.targetKey, textTargetKey: textContext.targetId,
    targetText: textContext.targetText, workTitle: event.title, workTargetType: event.targetType,
    category: event.category, eventType: event.eventType, date: event.date, region: event.region,
    platform: event.platform, seasonNumber: event.seasonNumber, checkedAt: textContext.checkedAt,
    evidence: event.evidence,
  };
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

async function scheduledRequestHasNonEmptyBody(req: Request): Promise<boolean> {
  if (req.body === null) return false;
  const reader = req.body.getReader();
  try {
    for (let emptyChunks = 0; emptyChunks < 8; emptyChunks += 1) {
      const chunk = await reader.read();
      if (chunk.done) return false;
      if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > 0) return true;
    }
    return true;
  } catch {
    return true;
  } finally {
    try { await reader.cancel(); } catch { /* fail-closed result above */ }
  }
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
    const refreshHeader = req.headers.get(RADAR_REFRESH_HEADER);
    const scheduledMode = refreshHeader === SCHEDULED_REFRESH_VALUE;
    const retryMode = refreshHeader === RETRY_REFRESH_VALUE;
    const automaticMode = scheduledMode || retryMode;
    const retryJobHeader = req.headers.get(RETRY_JOB_HEADER);
    const retryOperationHeader = req.headers.get(RETRY_OPERATION_HEADER);
    if (!supabaseUrl || (refreshHeader !== null && !automaticMode)
        || (!retryMode && (retryJobHeader !== null || retryOperationHeader !== null))) {
      return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
    }

    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
    let publishableKey = "";
    let serviceKey = "";
    if (automaticMode) {
      if (retryMode && (!UUID_FORM.test(retryJobHeader || "")
          || !UUID_FORM.test(retryOperationHeader || ""))) {
        return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
      }
      const scheduledAccess = authorizeScheduledRadarRequest({
        refreshHeader,
        expectedRefreshHeader: retryMode ? RETRY_REFRESH_VALUE : SCHEDULED_REFRESH_VALUE,
        apiKey: req.headers.get("apikey"),
        authorizationHeaderPresent: req.headers.has("Authorization"),
        bodyPresent: await scheduledRequestHasNonEmptyBody(req),
        originPresent: origin !== null,
        providerDiagnosticPresent: providerDiagnosticHeader !== null,
        secretKeysRaw,
      });
      if (!scheduledAccess.ok) {
        return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
      }
      serviceKey = scheduledAccess.serviceKey;
    } else {
      publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
      serviceKey = resolveSupabaseAdminKey(
        secretKeysRaw,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      );
      if (!publishableKey || !serviceKey) {
        return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
      }
    }

    let accountId = "";
    let userToken = "";
    let targetId = "";
    let rawTargetText: string | null = null;
    let initialMode = false;
    let providerOperationId: string | null = null;
    let initialAutomaticJob: {
      logicalJobId: string;
      providerOperationId: string;
      targetRowId: string;
      viennaDay: string;
    } | null = null;
    let retryBinding: {
      logicalJobId: string;
      providerOperationId: string;
      request: Record<string, unknown>;
    } | null = null;
    let dailyClaim: {
      targetRowId: string;
      viennaDay: string;
      fenceToken: string;
    } | null = null;

    if (!automaticMode) {
      const authenticatedRequest = await accountFromRequest(req, supabaseUrl, publishableKey);
      if (!authenticatedRequest) return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
      accountId = authenticatedRequest.accountId;
      userToken = authenticatedRequest.token;
      let body: unknown;
      try { body = await req.json(); } catch { return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin); }
      if (!body || typeof body !== "object" || Array.isArray(body)
          || ![1, 2, 3].includes(Object.keys(body).length)
          || typeof (body as { targetId?: unknown }).targetId !== "string"
          || Object.keys(body).some((key) => !["targetId", "targetText", "initial"].includes(key))) {
        return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin);
      }
      targetId = text((body as { targetId: string }).targetId);
      const hasTargetText = Object.prototype.hasOwnProperty.call(body, "targetText");
      const targetText = hasTargetText ? (body as { targetText?: unknown }).targetText : null;
      const hasInitial = Object.prototype.hasOwnProperty.call(body, "initial");
      initialMode = hasInitial && (body as { initial?: unknown }).initial === true;
      if (!targetId || targetId.length > 160
          || (hasInitial && (!initialMode || !hasTargetText || !/^text:[a-f0-9]{16}$/.test(targetId)))
          || (hasTargetText && (typeof targetText !== "string" || !targetText.trim() || targetText.length > 160))) {
        return json({ ok: false, status: "forbidden", writes: 0 }, 400, origin);
      }
      rawTargetText = hasTargetText ? targetText as string : null;
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (retryMode) {
      const logicalJobId = retryJobHeader || "";
      const retryProviderOperationId = retryOperationHeader || "";
      const { data: binding, error: bindingError } = await admin.rpc(
        "kd_radar_automatic_retry_context",
        {
          p_logical_job_id: logicalJobId,
          p_retry_provider_operation_id: retryProviderOperationId,
        },
      );
      const request = binding?.request;
      accountId = typeof binding?.accountId === "string" ? binding.accountId : "";
      targetId = typeof binding?.targetId === "string" ? binding.targetId : "";
      rawTargetText = binding?.targetText === null ? null
        : typeof binding?.targetText === "string" ? binding.targetText : "";
      if (bindingError || binding?.ok !== true || binding?.code !== "retry-bound"
          || binding?.logicalJobId !== logicalJobId
          || binding?.retryProviderOperationId !== retryProviderOperationId
          || !UUID_FORM.test(accountId) || !UUID_FORM.test(binding?.targetRowId || "")
          || !VIENNA_DAY_FORM.test(binding?.radarViennaDay || "")
          || !targetId || targetId.length > 160
          || !request || typeof request !== "object" || Array.isArray(request)
          || request.targetId !== targetId
          || (rawTargetText !== null
            && (!rawTargetText.trim() || rawTargetText.length > 160
              || request.targetText !== rawTargetText))) {
        return json({ ok: false, status: "failed" }, 500, origin);
      }
      providerOperationId = retryProviderOperationId;
      retryBinding = {
        logicalJobId,
        providerOperationId: retryProviderOperationId,
        request,
      };
    } else if (scheduledMode) {
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
      const logicalJobId = crypto.randomUUID();
      const initialProviderOperationId = crypto.randomUUID();
      if (!UUID_FORM.test(logicalJobId) || !UUID_FORM.test(initialProviderOperationId)
          || logicalJobId === initialProviderOperationId) {
        return json({ ok: false, status: "failed" }, 500, origin);
      }
      providerOperationId = initialProviderOperationId;
      initialAutomaticJob = {
        logicalJobId,
        providerOperationId: initialProviderOperationId,
        targetRowId,
        viennaDay,
      };
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
    const user = automaticMode ? null : createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
    if (initialMode) {
      const { data: claim, error: claimError } = await admin.rpc("kd_radar_initial_claim", {
        p_account_id: accountId, p_target_key: targetId, p_target_text: rawTargetText,
      });
      if (claimError) return json({ ok: false, status: "forbidden", writes: 0 }, 403, origin);
      if (claim?.claim !== true) {
        if (claim?.claim !== false || !["no_change", "busy", "disabled", "forbidden"].includes(claim.status)) {
          return json({ ok: false, status: "unavailable", writes: 0 }, 500, origin);
        }
        const status = claim.status === "disabled" ? "unavailable" : claim.status;
        return json({ ok: true, status, writes: 0, providerRequests: 0, searchRequests: 0 }, status === "forbidden" ? 403 : 200, origin);
      }
      if (claim.accountId !== accountId || claim.targetId !== targetId || claim.targetText !== rawTargetText
        || claim.targetType !== "text" || !UUID_FORM.test(claim.targetRowId)
        || !UUID_FORM.test(claim.fenceToken) || !VIENNA_DAY_FORM.test(claim.viennaDay)) {
        return json({ ok: false, status: "unavailable", writes: 0 }, 500, origin);
      }
      dailyClaim = { targetRowId: claim.targetRowId, viennaDay: claim.viennaDay, fenceToken: claim.fenceToken };
    }
    const assertExecutionFence = async () => {
      if (retryBinding) {
        const { data, error } = await admin.rpc("kd_radar_automatic_retry_assert", {
          p_logical_job_id: retryBinding.logicalJobId,
          p_retry_provider_operation_id: retryBinding.providerOperationId,
        });
        if (error || data?.ok !== true || data?.code !== "retry-claimed") {
          throw error || new Error("radar-automatic-retry-invalid");
        }
        return;
      }
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
        if (retryBinding) {
          if (actor !== accountId || key !== targetId || rawText !== rawTargetText) {
            throw new Error("radar-automatic-retry-context-drift");
          }
          return retryBinding.request;
        }
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
        await assertExecutionFence();
        const { data, error } = await admin.rpc(
          textContext
            ? "kd_radar_websearch_upsert_text_finding"
            : personContext
            ? "kd_radar_websearch_upsert_person_event"
            : titleGroupContext?.discoveryMode === "canonical-group-v1"
              ? "kd_radar_websearch_upsert_title_group_discovery_event"
              : titleGroupContext ? "kd_radar_websearch_upsert_title_group_event" : "kd_radar_websearch_upsert_event",
          {
          ...(textContext ? { p_user_id: actor } : { p_account_id: actor }),
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
    const fixedProviderOperationId = providerOperationId;
    const productAdapter = adapter ?? createAnthropicRadarWebsearchAdapter({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
      fetchImpl,
      async loadSetup(request: { kind?: string }) {
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
          request.kind === "text" ? [] : loadSources(),
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
        if (providerOperationId && operationId !== providerOperationId) {
          throw new Error("radar-automatic-provider-operation-drift");
        }
        await assertExecutionFence();
        const { data, error } = await admin.rpc("kd_radar_websearch_auftrag_starten", {
          p_account_id: accountId,
          p_target_key: targetId,
          p_operation_id: operationId,
          p_reservierung: reservationUsdCent,
          p_search_requests: searchRequests,
        });
        if (error) throw error;
        const logId = Number(data?.log_id);
        const automaticJob = initialAutomaticJob;
        if (automaticJob && data?.ok === true) {
          let begin: Record<string, unknown> | null = null;
          let beginError: unknown = null;
          try {
            const response = await admin.rpc(
              "kd_automatic_ai_retry_job_begin",
              {
                p_logical_job_id: automaticJob.logicalJobId,
                p_task_id: AUTOMATIC_RETRY_TASK_ID,
                p_account_id: accountId,
                p_target_id: automaticJob.targetRowId,
                p_radar_vienna_day: automaticJob.viennaDay,
                p_initial_provider_operation_id: automaticJob.providerOperationId,
              },
            );
            begin = response.data;
            beginError = response.error;
          } catch (error) {
            beginError = error;
          }
          if (beginError || begin?.ok !== true || begin?.replay !== false
              || begin?.status !== "pending"
              || begin?.logicalJobId !== automaticJob.logicalJobId
              || !Number.isInteger(logId) || logId <= 0) {
            if (Number.isInteger(logId) && logId > 0) {
              try {
                const { error: abortError } = await admin.rpc("kd_ai_auftrag_beenden", {
                  p_id: logId,
                  p_status: "fehler",
                  p_modell: null,
                  p_input_tokens: null,
                  p_output_tokens: null,
                  p_kosten: null,
                  p_fehlerklasse: "automatic-retry-bind-failed",
                });
                if (abortError) throw abortError;
              } catch { /* Best-effort: der Anbieterpfad bleibt trotzdem gesperrt. */ }
            }
            return { ok: false, logId, decision: "server" };
          }
        }
        return {
          ok: data?.ok === true,
          logId,
          decision: data?.ok === true ? "accepted" : normalizeRadarReservationDecision(data?.code),
        };
      },
      async settleCost({
        logId, status, model, inputTokens, outputTokens, costUsdCent, errorClass,
      }: Record<string, unknown>) {
        if (retryBinding) await assertExecutionFence();
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
      operationId: fixedProviderOperationId ? () => fixedProviderOperationId : undefined,
    });
    let result;
    try {
      result = await runRadarWebsearchCheck({
        accountId, targetId, targetText: rawTargetText, adapter: productAdapter, repository,
      });
    } catch (error) {
      if (!automaticMode && !initialMode) throw error;
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
      if (finishError || finish?.ok !== true) {
        return json({ ok: false, status: scheduledMode ? "failed" : "storage_error", writes: result.writes || 0 }, 500, origin);
      }
      if (scheduledMode) return json({ ok: true, status: "processed" }, 200, origin);
    }
    if (retryBinding) {
      const telemetry = typeof productAdapter.telemetry === "function"
        ? productAdapter.telemetry() : {};
      const providerRequests = typeof telemetry.providerRequests === "number"
        ? telemetry.providerRequests : Number.NaN;
      const websearchRequests = typeof telemetry.searchRequests === "number"
        ? telemetry.searchRequests : Number.NaN;
      const { data: proof, error: proofError } = await admin.rpc(
        "kd_radar_automatic_retry_result_proven",
        {
          p_logical_job_id: retryBinding.logicalJobId,
          p_retry_provider_operation_id: retryBinding.providerOperationId,
        },
      );
      if (proofError || proof?.ok !== true || proof?.code !== "retry-succeeded"
          || !Number.isInteger(providerRequests) || providerRequests < 0 || providerRequests > 1
          || !Number.isInteger(websearchRequests) || websearchRequests < 0 || websearchRequests > 4) {
        return json({ ok: false, code: "retry-unproven" }, 500, origin);
      }
      return json({
        ok: true,
        code: "retry-finished",
        providerRequests,
        websearchRequests,
      }, 200, origin);
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
      ...(result.feed ? { feed: result.feed } : {}),
      ...(result.personResult ? { personResult: result.personResult } : {}),
      ...(result.textDiagnostics ? {
        textDiagnostics: result.textDiagnostics,
        textResult: result.textResult,
      } : {}),
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
