/* Globaler Entdecken-Wochenfeed auf dem kompatiblen Tagesfeed-Endpoint.
   Der accountlose Browser uebergibt weder Token noch Suchtext oder lokale
   Daten. Wochenclaim und Fencing-Token erlauben hoechstens einen Providerlauf
   je ISO-Woche; bei Fehler bleibt der letzte erfolgreiche Feed sichtbar. */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createAnthropicEntdeckenDailyAdapter } from "./anthropicAdapter.js";
import { validateEntdeckenDailyFeed } from "./contract.js";
import { runEntdeckenDailyRefresh } from "./runner.js";

const ALLOWED_ORIGINS = new Set([
  "https://kinodreieck.at",
  "https://staging.kinodreieck.at",
  "https://codex-entdecken-tagesfeed.kinodreieck.pages.dev",
  "http://localhost:5173",
]);
const RECOVERY_HEADER = "x-kd-entdecken-recovery";
const RECOVERY_HEADER_VALUE = "owner-once-v1";
const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string { return String(value == null ? "" : value).trim(); }
function cors(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": `authorization, apikey, content-type, ${RECOVERY_HEADER}`,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" },
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
    termsUrl: row?.terms_url,
    termsCheckedOn: row?.terms_checked_on,
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

export function createEntdeckenDailyHandler({
  adapter = null,
  fetchImpl = fetch,
}: {
  adapter?: { search(): Promise<unknown>; telemetry?: () => Record<string, unknown> } | null;
  fetchImpl?: typeof fetch;
} = {}) {
  return async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get("Origin");
    if (req.method === "OPTIONS") {
      if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403, headers: cors(origin) });
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (req.method !== "GET" || req.body !== null
        || (origin !== null && !ALLOWED_ORIGINS.has(origin))) {
      return json({ ok: false, status: "disabled", feed: null }, 405, origin);
    }
    const recoveryHeader = req.headers.get(RECOVERY_HEADER);
    const recoveryRequested = recoveryHeader !== null;
    if (recoveryRequested && recoveryHeader !== RECOVERY_HEADER_VALUE) {
      return json({ ok: false, status: "disabled", feed: null }, 403, origin);
    }

    const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
    const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const serviceKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !publishableKey || !serviceKey
        || req.headers.get("apikey") !== publishableKey) {
      return json({ ok: false, status: "disabled", feed: null }, 403, origin);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let preclaimedRecovery: Record<string, unknown> | null = null;
    if (recoveryRequested) {
      const token = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
      const user = createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claimsData, error: claimsError } = await user.auth.getClaims(token);
      const claims = (claimsData as { claims?: Record<string, unknown> } | null)?.claims;
      const accountId = typeof claims?.sub === "string" ? claims.sub : "";
      const { data: userData, error: userError } = token
        ? await user.auth.getUser(token)
        : { data: null, error: new Error("missing-token") };
      if (claimsError || userError || claims?.role !== "authenticated"
          || !UUID_FORM.test(accountId) || userData?.user?.id !== accountId) {
        return json({ ok: false, status: "disabled", feed: null }, 403, origin);
      }
      const { data: access, error: accessError } = await admin
        .from("kd_account_access")
        .select("role,active,personal_ai")
        .eq("account_id", accountId)
        .maybeSingle();
      if (accessError || access?.role !== "owner" || access?.active !== true
          || access?.personal_ai !== true) {
        return json({ ok: false, status: "disabled", feed: null }, 403, origin);
      }
      const { data: recoveryClaim, error: recoveryError } = await admin
        .rpc("kd_entdecken_daily_recovery_claim");
      if (recoveryError) {
        return json({ ok: false, status: "recovery_unavailable", feed: null }, 503, origin);
      }
      if (!recoveryClaim || typeof recoveryClaim !== "object" || Array.isArray(recoveryClaim)
          || recoveryClaim.refresh !== true) {
        return json({ ok: false, status: "recovery_unavailable", feed: null }, 409, origin);
      }
      preclaimedRecovery = recoveryClaim as Record<string, unknown>;
    }
    let claimContext: Record<string, unknown> | null = null;
    let cachedSources: Array<Record<string, unknown>> | null = null;
    const loadSources = async () => {
      if (cachedSources) return cachedSources;
      const { data, error } = await admin.from("kd_entdecken_sources")
        .select("source_id,domain,publisher_family,source_class,rights_status,attribution_approved,subdomains_allowed,active,terms_url,terms_checked_on")
        .eq("active", true)
        .eq("rights_status", "approved")
        .eq("attribution_approved", true)
        .eq("source_class", "editorial")
        .order("source_id", { ascending: true })
        .limit(11);
      if (error) throw error;
      cachedSources = sourceRows(data);
      return cachedSources;
    };
    const repository = {
      async claimRefresh() {
        if (preclaimedRecovery) {
          const data = preclaimedRecovery;
          preclaimedRecovery = null;
          claimContext = data;
          return data;
        }
        const { data, error } = await admin.rpc("kd_entdecken_daily_claim");
        if (error) throw error;
        claimContext = data;
        return data;
      },
      async loadSources() { return await loadSources(); },
      async saveFeed(feed: unknown, { fenceToken }: { fenceToken: number }) {
        const checked = validateEntdeckenDailyFeed(feed);
        if (!checked.ok) throw new Error("entdecken-daily-feed-invalid");
        const { data, error } = await admin.rpc("kd_entdecken_daily_save", {
          p_payload: checked.value,
          p_fence_token: fenceToken,
        });
        if (error || data?.ok !== true) throw error || new Error("entdecken-daily-save-rejected");
      },
      async markFailure({ code, fenceToken }: { code: string; fenceToken: number }) {
        const { error } = await admin.rpc("kd_entdecken_daily_fail", {
          p_code: code,
          p_fence_token: fenceToken,
        });
        if (error) throw error;
      },
    };

    const productAdapter = adapter ?? createAnthropicEntdeckenDailyAdapter({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
      fetchImpl,
      async loadSetup() {
        const [providerResult, limitsResult, sources] = await Promise.all([
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
        if (providerResult.error || limitsResult.error || !claimContext) {
          throw new Error("entdecken-daily-setup-unavailable");
        }
        const limits = limitRows(limitsResult.data);
        const taskModels = limits.get("task_modell") as Record<string, unknown> | undefined;
        const aliases = limits.get("modell_alias") as Record<string, unknown> | undefined;
        const maxTokens = limits.get("task_max_tokens") as Record<string, unknown> | undefined;
        const taskCaps = limits.get("task_max_reservierung_usd_cent") as Record<string, unknown> | undefined;
        const prices = limits.get("preise_usd_cent_pro_mtok") as Record<string, Record<string, unknown>> | undefined;
        const modelAlias = taskModels?.["entdecken-daily"];
        const model = typeof modelAlias === "string" ? aliases?.[modelAlias] : null;
        const price = typeof model === "string" ? prices?.[model] : null;
        return {
          feedEnabled: claimContext.feedEnabled,
          providerEnabled: claimContext.providerEnabled,
          providerAllowed: providerResult.data?.ok === true
            && providerResult.data?.code === "PROVIDER_ALLOWED",
          modelAlias,
          model,
          maxTokens: maxTokens?.["entdecken-daily"],
          taskCapUsdCent: taskCaps?.["entdecken-daily"],
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
        const { data, error } = await admin.rpc("kd_entdecken_daily_auftrag_starten", {
          p_operation_id: operationId,
          p_reservierung: reservationUsdCent,
          p_search_requests: searchRequests,
          p_fence_token: claimContext?.fenceToken,
        });
        if (error) throw error;
        return { ok: data?.ok === true, logId: data?.log_id };
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

    const result = await runEntdeckenDailyRefresh({ repository, adapter: productAdapter });
    const telemetry = typeof productAdapter.telemetry === "function"
      ? productAdapter.telemetry() : {};
    return json({
      ok: true,
      status: result.status,
      feed: result.feed,
      writes: Number.isInteger(result.writes) ? result.writes : 0,
      providerRequests: Number.isInteger(telemetry?.providerRequests) ? telemetry.providerRequests : 0,
      searchRequests: Number.isInteger(telemetry?.searchRequests) ? telemetry.searchRequests : 0,
    }, 200, origin);
  };
}

if (import.meta.main) Deno.serve(createEntdeckenDailyHandler());
