/* Globaler Entdecken-Wochenfeed auf dem kompatiblen Tagesfeed-Endpoint.
   Der accountlose Browser uebergibt weder Token noch Suchtext oder lokale
   Daten; GET liest ausschliesslich. Nur das explizite scheduled-POST darf den
   begrenzten Produktclaim samt Fencing-Lease beanspruchen; der Ownerpfad
   bleibt ausschliesslich fuer die getrennte Legacy-Diagnose erhalten. */

import { createClient } from "npm:@supabase/supabase-js@2";
import { requestHasForbiddenBody, validateEntdeckenDailyFeed } from "./contract.js";
import { runEntdeckenDailyRefresh } from "./runner.js";
import { createEntdeckenDailyResponse } from "./responseContract.js";
import { createMixedPublicChartAdapter } from "./publicMixAdapter.js";
import { createWikidataResolver } from "./wikidataResolver.js";
import {
  createAnthropicEntdeckenProviderProbe,
  ENTDECKEN_PROVIDER_PROBE_HEADER,
  ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE,
  ENTDECKEN_PROVIDER_PROBE_PROMPT_VERSION,
  ENTDECKEN_PROVIDER_PROBE_TASK,
} from "./providerProbe.js";
import {
  PROVIDER_DIAGNOSTIC_ENV,
  PROVIDER_DIAGNOSTIC_HEADER,
  providerDiagnosticAccess,
  providerDiagnosticField,
} from "../_shared/providerDiagnostic.js";

const ALLOWED_ORIGINS = new Set([
  "https://kinodreieck.at",
  "https://staging.kinodreieck.at",
  "https://codex-entdecken-tagesfeed.kinodreieck.pages.dev",
  "http://localhost:5173",
]);
const REFRESH_HEADER = "x-kd-entdecken-refresh";
const SCHEDULED_REFRESH_VALUE = "scheduled-v1";
const OWNER_REFRESH_VALUE = "owner-v1";
const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown): string { return String(value == null ? "" : value).trim(); }
function cors(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": `authorization, apikey, content-type, ${REFRESH_HEADER}, ${PROVIDER_DIAGNOSTIC_HEADER}, ${ENTDECKEN_PROVIDER_PROBE_HEADER}`,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
function canonicalInstant(value: unknown): string | null {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function normalizedWikidataCacheRows(rows: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return [];
  const result: Array<Record<string, unknown>> = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const sourceItemId = text(row.source_item_id);
    const titleFingerprint = text(row.title_fingerprint);
    const mediaType = text(row.media_type);
    const resolverVersion = Number(row.resolver_version);
    const status = text(row.status);
    const checkedAt = canonicalInstant(row.checked_at);
    if (!/^[fs]_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceItemId) || sourceItemId.length > 182
        || !/^[a-f0-9]{16}$/.test(titleFingerprint)
        || !["film", "series"].includes(mediaType)
        || !Number.isSafeInteger(resolverVersion) || resolverVersion <= 0
        || !["resolved", "not_found", "ambiguous_blocked", "incomplete_blocked"].includes(status)
        || !checkedAt) continue;
    if (status !== "resolved") {
      result.push({ sourceItemId, titleFingerprint, mediaType, resolverVersion, status, facts: null, checkedAt });
      continue;
    }
    const qid = text(row.qid);
    const resolvedAt = canonicalInstant(row.resolved_at);
    const releaseYear = row.release_year === null ? null : Number(row.release_year);
    const imdb = row.imdb_id === null ? null : text(row.imdb_id).toLowerCase();
    const tmdb = row.tmdb_id === null ? null : text(row.tmdb_id);
    if (!/^Q[1-9]\d*$/.test(qid) || !resolvedAt
        || (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2100))
        || (imdb !== null && !/^tt\d{7,10}$/.test(imdb))
        || (tmdb !== null && !/^[1-9]\d{0,8}$/.test(tmdb))
        || (releaseYear === null && imdb === null && tmdb === null)) continue;
    result.push({
      sourceItemId, titleFingerprint, mediaType, resolverVersion, status,
      checkedAt,
      facts: {
        qid, mediaType, releaseYear,
        externalIds: { ...(imdb ? { imdb } : {}), ...(tmdb ? { tmdb } : {}) },
        resolvedAt,
      },
    });
  }
  return result;
}

export function createEntdeckenDailyHandler({
  adapter = null,
  fetchImpl = fetch,
}: {
  adapter?: {
    mode?: string;
    search(): Promise<unknown>;
    telemetry?: () => Record<string, unknown>;
    takeProviderRawResponse?: () => string | null;
  } | null;
  fetchImpl?: typeof fetch;
} = {}) {
  return async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get("Origin");
    const providerDiagnosticHeader = req.headers.get(PROVIDER_DIAGNOSTIC_HEADER);
    const providerProbeHeader = req.headers.get(ENTDECKEN_PROVIDER_PROBE_HEADER);
    if (req.method === "OPTIONS") {
      if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403, headers: cors(origin) });
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (!["GET", "POST"].includes(req.method) || requestHasForbiddenBody(req)
        || (origin !== null && !ALLOWED_ORIGINS.has(origin))) {
      return json({ ok: false, status: "disabled", feed: null }, 405, origin);
    }
    const refreshHeader = req.headers.get(REFRESH_HEADER);
    const requestMode = req.method === "GET" && refreshHeader === null ? "read"
      : req.method === "POST" && refreshHeader === SCHEDULED_REFRESH_VALUE ? "scheduled"
      : req.method === "POST" && refreshHeader === OWNER_REFRESH_VALUE ? "owner"
      : null;
    if (!requestMode) {
      return json({ ok: false, status: "disabled", feed: null }, 403, origin);
    }
    if (providerProbeHeader !== null
        && (requestMode !== "owner"
          || providerProbeHeader !== ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE)) {
      return json({ ok: false, status: "disabled", feed: null }, 403, origin);
    }

    const supabaseUrl = text(Deno.env.get("SUPABASE_URL"));
    const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const serviceKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const bearerToken = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
    const scheduledAuthorized = requestMode === "scheduled"
      && req.headers.get("apikey") === serviceKey && bearerToken === serviceKey;
    const publicKeyAuthorized = requestMode !== "scheduled"
      && req.headers.get("apikey") === publishableKey;
    if (!supabaseUrl || !publishableKey || !serviceKey
        || (!scheduledAuthorized && !publicKeyAuthorized)) {
      return json({ ok: false, status: "disabled", feed: null }, 403, origin);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let ownerRefreshConfirmed = false;
    let ownerRefreshAccountId: string | null = null;
    let providerDiagnostic = providerDiagnosticAccess({
      headerValue: providerDiagnosticHeader,
      enabled: Deno.env.get(PROVIDER_DIAGNOSTIC_ENV) === "true",
      owner: false,
    });
    if (requestMode === "owner") {
      const token = bearerToken;
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
      ownerRefreshConfirmed = true;
      ownerRefreshAccountId = accountId;
      providerDiagnostic = providerDiagnosticAccess({
        headerValue: providerDiagnosticHeader,
        enabled: Deno.env.get(PROVIDER_DIAGNOSTIC_ENV) === "true",
        owner: ownerRefreshConfirmed,
      });
      if (providerDiagnostic.requested && !providerDiagnostic.allowed) {
        return json({ ok: false, status: "disabled", feed: null }, 403, origin);
      }
    }
    if (providerDiagnostic.requested && !providerDiagnostic.allowed) {
      return json({ ok: false, status: "disabled", feed: null }, 403, origin);
    }

    /* Der Probeheader wird nur im bereits voll bestaetigten Ownerpfad und nur
       zusammen mit der privaten Providerdiagnose akzeptiert. Der fruehe
       Ruecksprung liegt bewusst vor Repository, Claim und Feedlogik. */
    if (providerProbeHeader === ENTDECKEN_PROVIDER_PROBE_HEADER_VALUE) {
      if (requestMode !== "owner" || !ownerRefreshConfirmed
          || !ownerRefreshAccountId || !providerDiagnostic.allowed) {
        return json({ ok: false, status: "disabled", feed: null }, 403, origin);
      }
      try {
        const probe = createAnthropicEntdeckenProviderProbe({
          apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "",
          fetchImpl,
          async loadSetup() {
            const [providerResult, limitsResult] = await Promise.all([
              admin.rpc("kd_private_provider_allowed", { p_provider_id: "anthropic" }),
              admin.from("kd_ai_limits")
                .select("schluessel,wert")
                .in("schluessel", [
                  "anbieter_request_max_usd_cent",
                  "modell_alias",
                  "preise_usd_cent_pro_mtok",
                  "task_max_reservierung_usd_cent",
                  "task_modell",
                  "timeout_ms",
                ]),
            ]);
            if (providerResult.error || limitsResult.error) {
              throw new Error("entdecken-provider-probe-setup-unavailable");
            }
            const limits = limitRows(limitsResult.data);
            const taskModels = limits.get("task_modell") as Record<string, unknown> | undefined;
            const aliases = limits.get("modell_alias") as Record<string, unknown> | undefined;
            const taskCaps = limits.get("task_max_reservierung_usd_cent") as Record<string, unknown> | undefined;
            const prices = limits.get("preise_usd_cent_pro_mtok") as Record<string, Record<string, unknown>> | undefined;
            const modelAlias = taskModels?.["entdecken-daily"];
            const model = typeof modelAlias === "string" ? aliases?.[modelAlias] : null;
            const price = typeof model === "string" ? prices?.[model] : null;
            return {
              providerAllowed: providerResult.data?.ok === true
                && providerResult.data?.code === "PROVIDER_ALLOWED",
              modelAlias,
              model,
              inputPriceUsdCentPerMtok: price?.in,
              outputPriceUsdCentPerMtok: price?.out,
              taskCapUsdCent: taskCaps?.["entdecken-daily"],
              globalRequestCapUsdCent: limits.get("anbieter_request_max_usd_cent"),
              timeoutMs: limits.get("timeout_ms"),
            };
          },
          async reserveCost({ operationId, reservationUsdCent, providerRequests }) {
            if (providerRequests !== 1) return { ok: false, logId: null };
            const { data, error } = await admin.rpc("kd_ai_auftrag_starten", {
              p_account: ownerRefreshAccountId,
              p_task: ENTDECKEN_PROVIDER_PROBE_TASK,
              p_vorgang: operationId,
              p_modell_alias: "klein",
              p_prompt_version: ENTDECKEN_PROVIDER_PROBE_PROMPT_VERSION,
              p_profil_version: null,
              p_reservierung: reservationUsdCent,
            });
            if (error) throw error;
            return { ok: data?.ok === true, logId: data?.log_id };
          },
          async settleCost({
            logId, status, model, inputTokens, outputTokens, costUsdCent, errorClass,
          }) {
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
          async readSettledCost({ logId, operationId }) {
            const { data, error } = await admin.from("kd_ai_log")
              .select("id,account_id,vorgang_id,task,status,kosten_usd_cent")
              .eq("id", logId)
              .eq("vorgang_id", operationId)
              .maybeSingle();
            if (error || !data || data.account_id !== ownerRefreshAccountId) {
              throw error || new Error("entdecken-provider-probe-log-unavailable");
            }
            return {
              logId: data.id,
              operationId: data.vorgang_id,
              task: data.task,
              status: data.status,
              costUsdCent: Number(data.kosten_usd_cent),
            };
          },
        });
        const outcome = await probe.run();
        return json({
          ok: outcome.safe.cause === "authenticated",
          status: "provider_probe",
          probe: outcome.safe,
          ...(typeof outcome.rawResponse === "string"
            ? providerDiagnosticField(outcome.rawResponse)
            : {}),
        }, 200, origin);
      } catch {
        return json({ ok: false, status: "provider_probe_error", probe: null }, 503, origin);
      }
    }
    let claimContext: Record<string, unknown> | null = null;
    let cachedSources: Array<Record<string, unknown>> | null = null;
    const publicProduct = adapter === null || ["public-chart", "public-mix"].includes(adapter?.mode || "");
    const loadSources = async () => {
      if (cachedSources) return cachedSources;
      let query = admin.from("kd_entdecken_sources")
        .select("source_id,domain,publisher_family,source_class,rights_status,attribution_approved,subdomains_allowed,active,terms_url,terms_checked_on")
        .eq("active", true)
        .eq("attribution_approved", true);
      query = publicProduct
        ? query.eq("rights_status", "owner_private").eq("source_class", "chart")
        : query.eq("rights_status", "approved").eq("source_class", "editorial");
      const { data, error } = await query.order("source_id", { ascending: true }).limit(11);
      if (error) throw error;
      cachedSources = sourceRows(data);
      return cachedSources;
    };
    const repository = {
      async claimRefresh() {
        const { data, error } = requestMode === "read"
          ? await admin.rpc("kd_entdecken_weekly_feed_status")
          : await admin.rpc("kd_entdecken_weekly_refresh_claim", {
            p_source: requestMode,
          });
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
      async readFeed({ fenceToken, providerReceipt, sourceMode }: {
        fenceToken: number;
        providerReceipt?: { server?: { logId?: unknown } };
        sourceMode?: string;
      }) {
        if (["public-chart", "public-mix"].includes(sourceMode || "")) {
          const { data, error } = await admin.rpc("kd_entdecken_public_feed_readback", {
            p_fence_token: fenceToken,
          });
          if (error) throw error;
          return data;
        }
        const logId = Number(providerReceipt?.server?.logId);
        if (!Number.isSafeInteger(logId) || logId <= 0) {
          throw new Error("entdecken-weekly-readback-log-invalid");
        }
        const { data, error } = await admin.rpc("kd_entdecken_weekly_feed_readback", {
          p_fence_token: fenceToken,
          p_provider_log_id: logId,
        });
        if (error) throw error;
        return data;
      },
      async markFailure({ code, fenceToken }: { code: string; fenceToken: number }) {
        const { error } = await admin.rpc("kd_entdecken_daily_fail", {
          p_code: code,
          p_fence_token: fenceToken,
        });
        if (error) throw error;
      },
      async enrichPublicItems(items: Array<Record<string, unknown>>) {
        return await wikidataResolver.resolve(items);
      },
    };
    const wikidataResolver = createWikidataResolver({
      fetchImpl,
      maxUnknownItems: 12,
      async loadCache(sourceItemIds: Array<string> = []) {
        if (!sourceItemIds.length) return [];
        const { data, error } = await admin.from("kd_entdecken_wikidata_cache")
          .select("source_item_id,title_fingerprint,media_type,resolver_version,status,qid,release_year,imdb_id,tmdb_id,resolved_at,checked_at")
          .in("source_item_id", sourceItemIds);
        if (error) throw error;
        return normalizedWikidataCacheRows(data);
      },
      async saveCache(row: Record<string, unknown> = {}) {
        const facts = row.facts as Record<string, unknown> | null;
        const externalIds = facts?.externalIds as Record<string, unknown> | undefined;
        const { error } = await admin.from("kd_entdecken_wikidata_cache").upsert({
          source_item_id: row.sourceItemId,
          title_fingerprint: row.titleFingerprint,
          media_type: row.mediaType,
          resolver_version: row.resolverVersion,
          status: row.status,
          qid: facts?.qid ?? null,
          release_year: facts?.releaseYear ?? null,
          imdb_id: externalIds?.imdb ?? null,
          tmdb_id: externalIds?.tmdb ?? null,
          wikidata_revision_id: facts?.revisionId ?? null,
          resolved_at: facts?.resolvedAt ?? row.checkedAt,
          checked_at: row.checkedAt,
        }, { onConflict: "source_item_id" });
        if (error) throw error;
      },
    });
    const productAdapter = (adapter ?? createMixedPublicChartAdapter({ fetchImpl })) as {
      mode?: string;
      search(...args: Array<unknown>): Promise<unknown>;
      telemetry?: () => Record<string, unknown>;
      takeProviderRawResponse?: () => string | null;
    };

    const result = await runEntdeckenDailyRefresh({ repository, adapter: productAdapter });
    const telemetry = {
      ...(typeof productAdapter.telemetry === "function" ? productAdapter.telemetry() : {}),
      wikidataRequests: wikidataResolver.telemetry().requests,
    };
    const providerRawResponse = providerDiagnostic.allowed && !publicProduct
      && typeof productAdapter.takeProviderRawResponse === "function"
      ? productAdapter.takeProviderRawResponse()
      : null;
    if (providerDiagnostic.allowed && !publicProduct && typeof providerRawResponse !== "string") {
      return json({ ok: false, status: "provider_error", feed: result.feed, writes: 0 }, 500, origin);
    }
    return json({
      ...createEntdeckenDailyResponse(result, telemetry),
      ...(providerDiagnostic.allowed && !publicProduct && typeof providerRawResponse === "string"
        ? providerDiagnosticField(providerRawResponse)
        : {}),
    }, 200, origin);
  };
}

if (import.meta.main) Deno.serve(createEntdeckenDailyHandler());
