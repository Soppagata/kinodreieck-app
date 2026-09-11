import { createClient } from "npm:@supabase/supabase-js@2";
import { createFlixPatrolClient } from "../_shared/flixpatrolClient.js";
import { FLIXPATROL_AT_SOURCES } from "../_shared/flixpatrolData.js";
import {
  createFlixPatrolUsageHandler,
  parseFlixPatrolServiceKeys,
} from "./core.js";

function supabaseBaseUrl(value: string | undefined): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:"
        && /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
        && !url.username && !url.password && !url.port
        && (url.pathname === "/" || url.pathname === "")
        && !url.search && !url.hash
      ? url.origin : "";
  } catch {
    return "";
  }
}

function runtimeDependencies() {
  const supabaseUrl = supabaseBaseUrl(Deno.env.get("SUPABASE_URL"));
  const serviceKeys = parseFlixPatrolServiceKeys(
    Deno.env.get("SUPABASE_SECRET_KEYS") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
  const admin = supabaseUrl && serviceKeys[0]
    ? createClient(supabaseUrl, serviceKeys[0], {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;

  async function rpc(name: string, args?: Record<string, unknown>) {
    if (!admin) throw new Error("flixpatrol-usage-rpc-unavailable");
    const result = args === undefined ? await admin.rpc(name) : await admin.rpc(name, args);
    if (result.error) throw new Error("flixpatrol-usage-rpc-failed");
    return result.data;
  }

  const client = createFlixPatrolClient({
    apiKey: Deno.env.get("FLIXPATROL_API_KEY") || "",
    beginOperation: ({ operationId, requestKind }) => rpc("kd_flixpatrol_usage_begin", {
      p_operation_id: operationId,
      p_request_kind: requestKind,
    }),
    finishOperation: ({ operationId, status, httpStatus, quota }) => rpc("kd_flixpatrol_usage_finish", {
      p_operation_id: operationId,
      p_status: status,
      p_http_status: httpStatus,
      p_quota: quota,
    }),
  });

  return {
    serviceKeys,
    readUsage: () => rpc("kd_flixpatrol_usage_status"),
    refreshUsage: () => client.fetchQuota(),
    diagnoseTop10: () => client.fetchTop10({
      companyId: FLIXPATROL_AT_SOURCES.companies.prime.id,
      countryId: FLIXPATROL_AT_SOURCES.country.id,
      chartType: "movies",
      date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    }),
    diagnoseTitle: () => client.fetchTitle({
      sourceId: "ttl_kVkeFHRGi3CIYLPg7FTEJ9XK",
      mediaType: "film",
    }),
    diagnoseTitleBatch: () => client.fetchTitles({
      sourceIds: [
        "ttl_4TDOmMWPSCaKxwn2tVzTXmcg", "ttl_7nlnk4wZBnc8VylGpH5aTR6M",
        "ttl_UExUK0k2lQEVcb5uWXZtGhTg", "ttl_fihnSsnlNXyvuVZT8gBAweRj",
        "ttl_4tKCmMWPSCaKxwn2tVzTXmcg", "ttl_Foflx2P39fsIlph6zrCydxTG",
        "ttl_pgs8ns8OP1rtHnX6QwlEKhiq", "ttl_G4nYyVoYqxjfPUJzt21NZ6yg",
        "ttl_89dO3PlONbeWiHX60xVfZLm4", "ttl_fYTRSsnlNXyvuVZT8gBAweRj",
      ],
      mediaTypes: ["film", "film", "film", "film", "film", "series", "series", "series", "series", "series"],
    }),
  };
}

export function createRuntimeFlixPatrolUsageHandler() {
  return createFlixPatrolUsageHandler(runtimeDependencies());
}

if (import.meta.main) Deno.serve(createRuntimeFlixPatrolUsageHandler());
