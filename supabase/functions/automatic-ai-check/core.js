/* Server-only orchestrator for one due automatic AI check plus the active,
   bounded drain wrapper.

   The database owns due/retry/mail idempotency. This handler performs no
   retry of its own: one claimed job can cause at most one bodyless Radar call
   and, after the separate DB mail claim, one mail send. The drain wrapper
   only awaits up to three complete handler invocations serially. */

import {
  PRIVATE_MAIL_SCHEMA_VERSION,
  PRIVATE_MAIL_TYPES,
} from "../_shared/privateMailContract.js";
import {
  OPERATIONAL_RETRY_MAIL_CODES,
} from "../_shared/operationalRetryMail.js";

export const AUTOMATIC_AI_CHECK_HEADER = "x-kd-automatic-check";
export const AUTOMATIC_AI_CHECK_HEADER_VALUE = "scheduled-v1";
export const AUTOMATIC_AI_CHECK_TASK = "radar-websearch-task";

export const AUTOMATIC_AI_CHECK_CODES = Object.freeze({
  IDLE: "idle",
  INITIAL_SUCCEEDED: "initial-succeeded",
  RETRY_FINISHED: "retry-finished",
  DRAINED: "drained",
  BACKLOG: "backlog",
  FORBIDDEN: "forbidden",
  UNAVAILABLE: "unavailable",
});

export const AUTOMATIC_AI_DRAIN_MAX_JOBS = 3;
export const AUTOMATIC_AI_DRAIN_TIME_BUDGET_MS = 225_000;
export const AUTOMATIC_AI_DRAIN_SETTLEMENT_RESERVE_MS = 15_000;
export const AUTOMATIC_AI_RADAR_TIMEOUT_MS = 120_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INITIAL_API_CALL = new Set(["made", "unproven"]);
const INITIAL_COST = new Set(["confirmed", "unproven"]);
const INITIAL_REASON = new Set([
  "initial-call-unproven",
  "initial-completion-unproven",
  "initial-cost-unproven",
  "initial-usage-unproven",
  "initial-execution-failed",
]);
const RETRY_RESULT = new Set(["succeeded", "failed", "unproven"]);
const RETRY_REASON = new Set([
  "retry-blocked",
  "retry-execution-failed",
  "retry-status-unproven",
]);
const MAIL_CODE = new Set(Object.values(OPERATIONAL_RETRY_MAIL_CODES));
const RADAR_BLOCKED_HTTP = new Set([401, 403, 409, 429]);

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function exactKeys(value, keys) {
  if (!plain(value)) return false;
  try {
    return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
  } catch {
    return false;
  }
}

function validUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

function validDay(value) {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function canonicalInstant(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function validModernServiceKey(value) {
  return typeof value === "string"
    && value === value.trim()
    && value.startsWith("sb_secret_")
    && value.length > "sb_secret_".length
    && value.length <= 512
    && !/[\s\u0000-\u001f\u007f-\u009f]/u.test(value);
}

export function parseAutomaticAiServiceKeys(rawValue) {
  if (typeof rawValue !== "string" || !rawValue) return Object.freeze([]);
  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return Object.freeze([]);
  }
  if (!plain(parsed)) return Object.freeze([]);
  const values = Object.values(parsed);
  if (!values.length || values.some((value) => !validModernServiceKey(value))) {
    return Object.freeze([]);
  }
  return Object.freeze([...new Set(values)]);
}

function safeResponse(code, status) {
  const ok = status === 200;
  return new Response(JSON.stringify({ ok, code }), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function validSingleSuccess(value) {
  return exactKeys(value, ["ok", "code"])
    && value.ok === true
    && [
      AUTOMATIC_AI_CHECK_CODES.IDLE,
      AUTOMATIC_AI_CHECK_CODES.INITIAL_SUCCEEDED,
      AUTOMATIC_AI_CHECK_CODES.RETRY_FINISHED,
    ].includes(value.code);
}

function backlogTelemetry(value, asOfMs) {
  if (!exactKeys(value, ["remainingDueJobs", "oldestDueAt"])
      || !Number.isSafeInteger(value.remainingDueJobs)
      || value.remainingDueJobs < 0
      || value.remainingDueJobs > 1_000_000) return null;
  if (value.remainingDueJobs === 0) {
    return value.oldestDueAt === null
      ? Object.freeze({ remainingDueJobs: 0, oldestLagSeconds: null })
      : null;
  }
  const oldestDueAt = canonicalInstant(value.oldestDueAt);
  const oldestDueAtMs = oldestDueAt ? Date.parse(oldestDueAt) : Number.NaN;
  if (!Number.isFinite(oldestDueAtMs) || oldestDueAtMs > asOfMs) return null;
  return Object.freeze({
    remainingDueJobs: value.remainingDueJobs,
    oldestLagSeconds: Math.floor((asOfMs - oldestDueAtMs) / 1000),
  });
}

function safeDrainResponse({
  code,
  processedJobs,
  initialSucceededJobs,
  retryFinishedJobs,
  telemetry,
  stopReason,
  maxJobs,
  timeBudgetMs,
}) {
  return new Response(JSON.stringify({
    ok: true,
    code,
    processedJobs,
    initialSucceededJobs,
    retryFinishedJobs,
    remainingDueJobs: telemetry.remainingDueJobs,
    oldestLagSeconds: telemetry.oldestLagSeconds,
    stopReason,
    maxJobs,
    timeBudgetMs,
  }), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

function requestServiceKey(request, serviceKeys) {
  if (!Array.isArray(serviceKeys)
      || !serviceKeys.length
      || serviceKeys.some((value) => !validModernServiceKey(value))) return null;
  const supplied = request.headers.get("apikey");
  return serviceKeys.find((value) => value === supplied) || null;
}

async function requestHasNonEmptyBody(request) {
  if (request.body === null) return false;
  const reader = request.body.getReader();
  try {
    for (let emptyChunks = 0; emptyChunks < 8; emptyChunks += 1) {
      const chunk = await reader.read();
      if (chunk.done) return false;
      if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > 0) {
        return true;
      }
    }
    return true;
  } catch {
    return true;
  } finally {
    try { await reader.cancel(); } catch { /* fail closed above */ }
  }
}

function dueClaim(value) {
  if (exactKeys(value, ["claim", "status"])
      && value.claim === false && value.status === "idle") {
    return Object.freeze({ kind: AUTOMATIC_AI_CHECK_CODES.IDLE });
  }

  const sharedKeys = [
    "claim", "status", "action", "logicalJobId", "taskId",
    "initialProviderOperationId",
  ];
  if (exactKeys(value, sharedKeys)
      && value.claim === true
      && value.status === "initial-succeeded"
      && value.action === "none"
      && value.taskId === AUTOMATIC_AI_CHECK_TASK
      && validUuid(value.logicalJobId)
      && validUuid(value.initialProviderOperationId)) {
    return Object.freeze({ kind: AUTOMATIC_AI_CHECK_CODES.INITIAL_SUCCEEDED });
  }

  const retryKeys = [
    ...sharedKeys, "accountId", "targetId", "radarViennaDay",
    "retryProviderOperationId", "initialApiCall", "initialCost",
    "initialReasonCode",
  ];
  if (!exactKeys(value, retryKeys)
      || value.claim !== true
      || value.status !== "retry-claimed"
      || value.action !== "retry"
      || value.taskId !== AUTOMATIC_AI_CHECK_TASK
      || !validUuid(value.logicalJobId)
      || !validUuid(value.accountId)
      || !validUuid(value.targetId)
      || !validUuid(value.initialProviderOperationId)
      || !validUuid(value.retryProviderOperationId)
      || !validDay(value.radarViennaDay)
      || !INITIAL_API_CALL.has(value.initialApiCall)
      || !INITIAL_COST.has(value.initialCost)
      || !INITIAL_REASON.has(value.initialReasonCode)
      || value.logicalJobId === value.initialProviderOperationId
      || value.logicalJobId === value.retryProviderOperationId
      || value.initialProviderOperationId === value.retryProviderOperationId
      || (value.initialApiCall === "unproven"
        && (value.initialCost !== "unproven"
          || value.initialReasonCode !== "initial-call-unproven"))
      || (value.initialApiCall === "made"
        && value.initialReasonCode === "initial-call-unproven")
      || (value.initialCost === "confirmed"
        && value.initialReasonCode === "initial-cost-unproven")) return null;

  return Object.freeze({
    kind: "retry",
    logicalJobId: value.logicalJobId,
    taskId: value.taskId,
    initialProviderOperationId: value.initialProviderOperationId,
    retryProviderOperationId: value.retryProviderOperationId,
  });
}

async function radarResult(invokeRadar, claim, serviceKey) {
  let response;
  try {
    response = await invokeRadar(claim, serviceKey);
  } catch {
    return Object.freeze({ result: "unproven", reasonCode: "retry-status-unproven" });
  }
  if (!response || !Number.isInteger(response.status)
      || typeof response.text !== "function") {
    return Object.freeze({ result: "unproven", reasonCode: "retry-status-unproven" });
  }
  if (response.status !== 200) {
    return Object.freeze({
      result: "failed",
      reasonCode: RADAR_BLOCKED_HTTP.has(response.status)
        ? "retry-blocked" : "retry-execution-failed",
    });
  }
  const contentType = response.headers?.get?.("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return Object.freeze({ result: "unproven", reasonCode: "retry-status-unproven" });
  }
  let raw;
  try {
    raw = await response.text();
  } catch {
    return Object.freeze({ result: "unproven", reasonCode: "retry-status-unproven" });
  }
  if (typeof raw !== "string" || raw.length > 2048) {
    return Object.freeze({ result: "unproven", reasonCode: "retry-status-unproven" });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Object.freeze({ result: "unproven", reasonCode: "retry-status-unproven" });
  }
  if (!exactKeys(body, ["ok", "code", "providerRequests", "websearchRequests"])
      || body.ok !== true
      || body.code !== "retry-finished"
      || ![0, 1].includes(body.providerRequests)
      || !Number.isInteger(body.websearchRequests)
      || body.websearchRequests < 0
      || body.websearchRequests > 4) {
    return Object.freeze({ result: "unproven", reasonCode: "retry-status-unproven" });
  }
  return Object.freeze({ result: "succeeded", reasonCode: null });
}

function validRetryFinish(value) {
  if (!plain(value) || value.ok !== true || typeof value.replay !== "boolean"
      || !RETRY_RESULT.has(value.status)) return false;
  if (value.replay === true) {
    return exactKeys(value, ["ok", "replay", "status", "reasonCode"])
      && (value.status === "succeeded"
        ? value.reasonCode === null
        : RETRY_REASON.has(value.reasonCode));
  }
  return exactKeys(value, ["ok", "replay", "status", "reasonCode", "mailStatus"])
    && value.mailStatus === "pending"
    && (value.status === "succeeded"
      ? value.reasonCode === null
      : RETRY_REASON.has(value.reasonCode));
}

function operationalMailInput(value, claim, mailOperationId) {
  const keys = [
    "ok", "replay", "status", "mailOperationId", "occurredAt", "taskId",
    "initialOperationId", "initialApiCall", "initialCost", "initialReasonCode",
    "retryTriggered", "retryOperationId", "retryResult", "retryReasonCode",
  ];
  const occurredAt = canonicalInstant(value?.occurredAt);
  if (!exactKeys(value, keys)
      || value.ok !== true
      || value.replay !== false
      || value.status !== "claimed"
      || value.mailOperationId !== mailOperationId
      || value.taskId !== AUTOMATIC_AI_CHECK_TASK
      || value.initialOperationId !== claim.initialProviderOperationId
      || value.retryOperationId !== claim.retryProviderOperationId
      || !occurredAt
      || !INITIAL_API_CALL.has(value.initialApiCall)
      || !INITIAL_COST.has(value.initialCost)
      || !INITIAL_REASON.has(value.initialReasonCode)
      || value.retryTriggered !== true
      || !RETRY_RESULT.has(value.retryResult)
      || (value.retryResult === "succeeded" && value.retryReasonCode !== null)
      || (value.retryResult !== "succeeded" && !RETRY_REASON.has(value.retryReasonCode))) {
    return null;
  }
  return Object.freeze({
    schemaVersion: PRIVATE_MAIL_SCHEMA_VERSION,
    type: PRIVATE_MAIL_TYPES.OPERATIONAL_RETRY,
    operationId: mailOperationId,
    occurredAt,
    taskId: value.taskId,
    initialOperationId: value.initialOperationId,
    initialApiCall: value.initialApiCall,
    initialCost: value.initialCost,
    initialErrorCode: null,
    initialReasonCode: value.initialReasonCode,
    retryTriggered: true,
    retryOperationId: value.retryOperationId,
    retryResult: value.retryResult,
    retryErrorCode: null,
    retryReasonCode: value.retryReasonCode,
  });
}

function validMailFinish(value, status) {
  return exactKeys(value, ["ok", "replay", "status"])
    && value.ok === true
    && typeof value.replay === "boolean"
    && value.status === status;
}

async function bestEffortMailFinish(finishMail, claim, mailOperationId, status) {
  try {
    return await finishMail({
      logicalJobId: claim.logicalJobId,
      mailOperationId,
      status,
    });
  } catch {
    return null;
  }
}

export function createAutomaticAiCheckHandler(dependencies = {}) {
  return async function automaticAiCheck(request) {
    if (!(request instanceof Request)
        || request.method !== "POST"
        || request.headers.has("Origin")
        || request.headers.has("Authorization")
        || request.headers.get(AUTOMATIC_AI_CHECK_HEADER)
          !== AUTOMATIC_AI_CHECK_HEADER_VALUE) {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.FORBIDDEN, 403);
    }
    if (await requestHasNonEmptyBody(request)) {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.FORBIDDEN, 403);
    }

    const serviceKey = requestServiceKey(request, dependencies.serviceKeys);
    if (!serviceKey
        || typeof dependencies.claimDue !== "function"
        || typeof dependencies.invokeRadar !== "function"
        || typeof dependencies.finishRetry !== "function"
        || typeof dependencies.claimMail !== "function"
        || typeof dependencies.sendOperationalMail !== "function"
        || typeof dependencies.finishMail !== "function"
        || typeof dependencies.randomUUID !== "function") {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.FORBIDDEN, 403);
    }

    let claimedRaw;
    try {
      claimedRaw = await dependencies.claimDue();
    } catch {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    }
    const claimed = dueClaim(claimedRaw);
    if (!claimed) return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    if (claimed.kind === AUTOMATIC_AI_CHECK_CODES.IDLE) {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.IDLE, 200);
    }
    if (claimed.kind === AUTOMATIC_AI_CHECK_CODES.INITIAL_SUCCEEDED) {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.INITIAL_SUCCEEDED, 200);
    }

    const radar = await radarResult(dependencies.invokeRadar, claimed, serviceKey);
    let retryFinishRaw = null;
    try {
      retryFinishRaw = await dependencies.finishRetry({
        logicalJobId: claimed.logicalJobId,
        retryOperationId: claimed.retryProviderOperationId,
        result: radar.result,
        reasonCode: radar.reasonCode,
      });
    } catch {
      retryFinishRaw = null;
    }

    let mailOperationId = null;
    try {
      const candidate = dependencies.randomUUID();
      if (validUuid(candidate)
          && candidate !== claimed.logicalJobId
          && candidate !== claimed.initialProviderOperationId
          && candidate !== claimed.retryProviderOperationId) {
        mailOperationId = candidate;
      }
    } catch {
      mailOperationId = null;
    }
    if (!mailOperationId) {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    }

    let mailClaimRaw;
    try {
      mailClaimRaw = await dependencies.claimMail({
        logicalJobId: claimed.logicalJobId,
        mailOperationId,
      });
    } catch {
      await bestEffortMailFinish(
        dependencies.finishMail,
        claimed,
        mailOperationId,
        OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN,
      );
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    }

    const mailInput = operationalMailInput(mailClaimRaw, claimed, mailOperationId);
    if (!mailInput) {
      if (mailClaimRaw?.ok === true) {
        await bestEffortMailFinish(
          dependencies.finishMail,
          claimed,
          mailOperationId,
          OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN,
        );
      }
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    }

    let mailCode = OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN;
    try {
      const mailResult = await dependencies.sendOperationalMail(mailInput);
      if (exactKeys(mailResult, ["code"]) && MAIL_CODE.has(mailResult.code)) {
        mailCode = mailResult.code;
      }
    } catch {
      mailCode = OPERATIONAL_RETRY_MAIL_CODES.UNKNOWN;
    }
    const mailFinishRaw = await bestEffortMailFinish(
      dependencies.finishMail,
      claimed,
      mailOperationId,
      mailCode,
    );
    if (!validRetryFinish(retryFinishRaw)
        || !validMailFinish(mailFinishRaw, mailCode)) {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    }
    return safeResponse(AUTOMATIC_AI_CHECK_CODES.RETRY_FINISHED, 200);
  };
}

/* The single-job handler remains the atomic provider/mail boundary. This
   wrapper awaits each complete terminal response before it creates the next
   bodyless request, caps the whole invocation at three jobs, and exposes only
   aggregate read-only backlog telemetry. */
export function createAutomaticAiDrainHandler(dependencies = {}, options = {}) {
  const maxJobs = Number.isInteger(options.maxJobs)
      && options.maxJobs > 0
      && options.maxJobs <= AUTOMATIC_AI_DRAIN_MAX_JOBS
    ? options.maxJobs : AUTOMATIC_AI_DRAIN_MAX_JOBS;
  const timeBudgetMs = Number.isInteger(options.timeBudgetMs)
      && options.timeBudgetMs > AUTOMATIC_AI_DRAIN_SETTLEMENT_RESERVE_MS
      && options.timeBudgetMs <= AUTOMATIC_AI_DRAIN_TIME_BUDGET_MS
    ? options.timeBudgetMs : AUTOMATIC_AI_DRAIN_TIME_BUDGET_MS;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : Date.now;

  return async function automaticAiDrain(request) {
    const startedAt = nowMs();
    if (!Number.isFinite(startedAt)
        || typeof dependencies.inspectBacklog !== "function") {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    }

    let processedJobs = 0;
    let initialSucceededJobs = 0;
    let retryFinishedJobs = 0;
    let stopReason = "job_limit";

    for (let index = 0; index < maxJobs; index += 1) {
      const beforeJob = nowMs();
      if (!Number.isFinite(beforeJob)) {
        return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
      }
      const remainingMs = timeBudgetMs - (beforeJob - startedAt);
      if (remainingMs <= AUTOMATIC_AI_DRAIN_SETTLEMENT_RESERVE_MS) {
        stopReason = "time_budget";
        break;
      }

      const singleRequest = index === 0
        ? request
        : new Request(request.url, { method: "POST", headers: request.headers });
      const invokeRadar = typeof dependencies.invokeRadar === "function"
        ? (claim, serviceKey) => dependencies.invokeRadar(claim, serviceKey, {
          timeoutMs: Math.max(1, Math.min(
            AUTOMATIC_AI_RADAR_TIMEOUT_MS,
            remainingMs - AUTOMATIC_AI_DRAIN_SETTLEMENT_RESERVE_MS,
          )),
        })
        : dependencies.invokeRadar;
      const response = await createAutomaticAiCheckHandler({
        ...dependencies,
        invokeRadar,
      })(singleRequest);
      if (response.status !== 200) return response;

      let body;
      try {
        body = await response.json();
      } catch {
        return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
      }
      if (!validSingleSuccess(body)) {
        return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
      }
      if (body.code === AUTOMATIC_AI_CHECK_CODES.IDLE) {
        stopReason = "idle";
        break;
      }
      processedJobs += 1;
      if (body.code === AUTOMATIC_AI_CHECK_CODES.INITIAL_SUCCEEDED) {
        initialSucceededJobs += 1;
      } else {
        retryFinishedJobs += 1;
      }
    }

    const inspectedAt = nowMs();
    if (!Number.isFinite(inspectedAt)) {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    }
    let rawTelemetry;
    try {
      rawTelemetry = await dependencies.inspectBacklog({
        asOf: new Date(inspectedAt).toISOString(),
      });
    } catch {
      return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);
    }
    const telemetry = backlogTelemetry(rawTelemetry, inspectedAt);
    if (!telemetry) return safeResponse(AUTOMATIC_AI_CHECK_CODES.UNAVAILABLE, 500);

    const code = telemetry.remainingDueJobs > 0
      ? AUTOMATIC_AI_CHECK_CODES.BACKLOG
      : processedJobs > 0
        ? AUTOMATIC_AI_CHECK_CODES.DRAINED
        : AUTOMATIC_AI_CHECK_CODES.IDLE;
    return safeDrainResponse({
      code,
      processedJobs,
      initialSucceededJobs,
      retryFinishedJobs,
      telemetry,
      stopReason,
      maxJobs,
      timeBudgetMs,
    });
  };
}
