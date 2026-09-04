/* Periodischer, serverinterner Checker fuer bis zu drei faellige +6h-Claims.
   Authentisierung, Ledger, Radar-Retry und Betriebs-Mail bleiben ausschliesslich
   auf serverseitig gebundenen Secrets und geben keine fachlichen Inhalte aus. */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createOperationalRetryMailSender } from "../_shared/operationalRetryMail.js";
import {
  createAutomaticAiDrainHandler,
  parseAutomaticAiServiceKeys,
} from "./core.js";

const RADAR_RETRY_HEADER_VALUE = "retry-6h-v1";

function supabaseBaseUrl(value: string | undefined): string {
  if (typeof value !== "string" || !value) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  return url.protocol === "https:"
      && /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
      && url.username === ""
      && url.password === ""
      && url.port === ""
      && (url.pathname === "/" || url.pathname === "")
      && url.search === ""
      && url.hash === ""
    ? url.origin : "";
}

function runtimeDependencies() {
  const supabaseUrl = supabaseBaseUrl(Deno.env.get("SUPABASE_URL"));
  const serviceKeys = parseAutomaticAiServiceKeys(
    Deno.env.get("SUPABASE_SECRET_KEYS") || "",
  );
  const admin = supabaseUrl && serviceKeys[0]
    ? createClient(supabaseUrl, serviceKeys[0], {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;
  const operationalMail = createOperationalRetryMailSender({
    transportActivationSecret:
      Deno.env.get("KD_PRIVATE_MAIL_TRANSPORT_ACTIVATION_SECRET") || null,
    apiKey: Deno.env.get("RESEND_API_KEY") || null,
    sender: Deno.env.get("KD_PRIVATE_MAIL_SENDER") || null,
    recipient: Deno.env.get("KD_PRIVATE_MAIL_RECIPIENT") || null,
  });

  async function rpc(name: string, args?: Record<string, unknown>) {
    if (!admin) throw new Error("automatic-ai-check-unavailable");
    const result = args === undefined
      ? await admin.rpc(name)
      : await admin.rpc(name, args);
    if (result.error) throw new Error("automatic-ai-check-rpc-failed");
    return result.data;
  }

  return {
    serviceKeys,
    claimDue: () => rpc("kd_automatic_ai_retry_due_claim"),
    invokeRadar: (
      claim: { logicalJobId: string; retryProviderOperationId: string },
      serviceKey: string,
      { timeoutMs }: { timeoutMs: number },
    ) => fetch(`${supabaseUrl}/functions/v1/radar-websearch-task`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        "x-kd-radar-refresh": RADAR_RETRY_HEADER_VALUE,
        "x-kd-automatic-job-id": claim.logicalJobId,
        "x-kd-radar-retry-operation": claim.retryProviderOperationId,
      },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    }),
    finishRetry: ({
      logicalJobId,
      retryOperationId,
      result,
      reasonCode,
    }: {
      logicalJobId: string;
      retryOperationId: string;
      result: string;
      reasonCode: string | null;
    }) => rpc("kd_automatic_ai_retry_finish", {
      p_logical_job_id: logicalJobId,
      p_retry_provider_operation_id: retryOperationId,
      p_retry_result: result,
      p_retry_reason_code: reasonCode,
    }),
    claimMail: ({
      logicalJobId,
      mailOperationId,
    }: {
      logicalJobId: string;
      mailOperationId: string;
    }) => rpc("kd_automatic_ai_retry_mail_claim", {
      p_logical_job_id: logicalJobId,
      p_mail_operation_id: mailOperationId,
    }),
    sendOperationalMail: (input: unknown) => operationalMail.send(input),
    finishMail: ({
      logicalJobId,
      mailOperationId,
      status,
    }: {
      logicalJobId: string;
      mailOperationId: string;
      status: string;
    }) => rpc("kd_automatic_ai_retry_mail_finish", {
      p_logical_job_id: logicalJobId,
      p_mail_operation_id: mailOperationId,
      p_terminal_status: status,
    }),
    async inspectBacklog({ asOf }: { asOf: string }) {
      if (!admin) throw new Error("automatic-ai-check-unavailable");
      const result = await admin
        .from("kd_automatic_ai_retry_jobs")
        .select("check_due_at", { count: "exact" })
        .eq("initial_evidence_status", "pending")
        .lte("check_due_at", asOf)
        .order("check_due_at", { ascending: true })
        .limit(1);
      if (result.error || !Number.isSafeInteger(result.count)
          || !Array.isArray(result.data)
          || (result.count === 0 && result.data.length !== 0)
          || (result.count > 0 && result.data.length !== 1)) {
        throw new Error("automatic-ai-check-backlog-unavailable");
      }
      return {
        remainingDueJobs: result.count,
        oldestDueAt: result.count === 0 ? null : result.data[0]?.check_due_at,
      };
    },
    randomUUID: () => crypto.randomUUID(),
  };
}

Deno.serve((request) => createAutomaticAiDrainHandler(runtimeDependencies())(request));
