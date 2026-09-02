import {
  PRIVATE_MAIL_ERROR_CODES,
  PRIVATE_MAIL_LIMITS,
  PRIVATE_MAIL_TYPES,
  createPrivateMailFailureResponse,
  createPrivateMailSuccessResponse,
  isPrivateMailOperationId,
  validatePrivateMailRequest,
} from "../_shared/privateMailContract.js";
import {
  PRIVATE_MAIL_DISPATCH_CODES,
  buildPrivateAccountDeletionMessage,
  buildPrivateFeedbackMessage,
  createPrivateAccountDeletionDispatcher,
  createPrivateFeedbackDispatcher,
} from "../_shared/privateMailMessages.js";

export const PRIVATE_MAIL_ALLOWED_ORIGINS = Object.freeze([
  "https://staging.kinodreieck.at",
]);

export const PRIVATE_MAIL_RATE_LIMITS = Object.freeze({
  [PRIVATE_MAIL_TYPES.FEEDBACK]: Object.freeze({
    globalLimit: 120,
    globalWindowSeconds: 10 * 60,
    subjectLimit: 5,
    subjectWindowSeconds: 60 * 60,
  }),
  [PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST]: Object.freeze({
    globalLimit: 60,
    globalWindowSeconds: 60 * 60,
    subjectLimit: 2,
    subjectWindowSeconds: 24 * 60 * 60,
  }),
});

const ALLOWED_ORIGINS = new Set(PRIVATE_MAIL_ALLOWED_ORIGINS);
const ALLOWED_PREFLIGHT_HEADERS = new Set([
  "authorization",
  "apikey",
  "content-type",
  "x-client-info",
]);
const UTF8 = new TextEncoder();
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i;
const MIN_SECRET_BYTES = 32;

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function statusFor(code) {
  switch (code) {
    case PRIVATE_MAIL_ERROR_CODES.REQUEST_TOO_LARGE: return 413;
    case PRIVATE_MAIL_ERROR_CODES.UNAUTHENTICATED: return 401;
    case PRIVATE_MAIL_ERROR_CODES.FORBIDDEN: return 403;
    case PRIVATE_MAIL_ERROR_CODES.RATE_LIMITED: return 429;
    case PRIVATE_MAIL_ERROR_CODES.IDEMPOTENCY_CONFLICT:
    case PRIVATE_MAIL_ERROR_CODES.REQUEST_IN_PROGRESS: return 409;
    case PRIVATE_MAIL_ERROR_CODES.DELIVERY_REJECTED:
    case PRIVATE_MAIL_ERROR_CODES.DELIVERY_STATUS_UNKNOWN: return 502;
    case PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE: return 503;
    default: return 400;
  }
}

function jsonResponse(codeOrBody, origin, status = null) {
  const body = typeof codeOrBody === "string"
    ? createPrivateMailFailureResponse(codeOrBody)
    : codeOrBody;
  const responseStatus = status ?? statusFor(body.code);
  return new Response(JSON.stringify(body), {
    status: responseStatus,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

function preflightAllowed(request) {
  const requestedMethod = request.headers.get("Access-Control-Request-Method");
  if (requestedMethod && requestedMethod !== "POST") return false;
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
  if (!requestedHeaders) return true;
  return requestedHeaders.split(",").every((header) => {
    const normalized = header.trim().toLowerCase();
    return normalized && ALLOWED_PREFLIGHT_HEADERS.has(normalized);
  });
}

async function readBoundedBody(request) {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST };
    }
    if (Number(contentLength) > PRIVATE_MAIL_LIMITS.requestBytes) {
      return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.REQUEST_TOO_LARGE };
    }
  }

  if (!request.body) {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST };
  }
  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > PRIVATE_MAIL_LIMITS.requestBytes) {
        try { await reader.cancel(); } catch { /* best effort only */ }
        return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.REQUEST_TOO_LARGE };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST };
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST };
  }
  try {
    return { ok: true, value: JSON.parse(text), byteLength };
  } catch {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST };
  }
}

function bearerToken(request) {
  return request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

async function authenticate(request, dependencies) {
  const token = bearerToken(request);
  if (!token || typeof dependencies.getClaims !== "function" || typeof dependencies.getUser !== "function") {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.UNAUTHENTICATED };
  }
  let claimsResult;
  let userResult;
  try {
    claimsResult = await dependencies.getClaims(token);
    userResult = await dependencies.getUser(token);
  } catch {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.UNAUTHENTICATED };
  }
  const claims = claimsResult?.data?.claims;
  const accountId = claims?.sub;
  if (claimsResult?.error || userResult?.error
      || claims?.role !== "authenticated"
      || !isPrivateMailOperationId(accountId)
      || userResult?.data?.user?.id !== accountId) {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.UNAUTHENTICATED };
  }
  if (typeof dependencies.getAccountAccess !== "function") {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE };
  }
  let accessResult;
  try {
    accessResult = await dependencies.getAccountAccess(accountId);
  } catch {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE };
  }
  if (accessResult?.error) return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE };
  if (accessResult?.data?.active !== true) {
    return { ok: false, code: PRIVATE_MAIL_ERROR_CODES.FORBIDDEN };
  }
  return { ok: true, accountId };
}

function secretReady(value) {
  return typeof value === "string" && UTF8.encode(value).byteLength >= MIN_SECRET_BYTES;
}

async function hmacSha256(secret, value, cryptoImplementation) {
  const cryptoApi = cryptoImplementation ?? globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error("webcrypto-unavailable");
  const key = await cryptoApi.subtle.importKey(
    "raw",
    UTF8.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await cryptoApi.subtle.sign("HMAC", key, UTF8.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalRequest(request, accountId) {
  const content = request.type === PRIVATE_MAIL_TYPES.FEEDBACK
    ? { schemaVersion: request.schemaVersion, type: request.type, operationId: request.operationId, text: request.text }
    : { schemaVersion: request.schemaVersion, type: request.type, operationId: request.operationId };
  return `private-mail-request:v1\n${accountId}\n${JSON.stringify(content)}`;
}

async function createDigests(request, accountId, secret, cryptoImplementation) {
  const [requestHash, globalBucket, subjectBucket, accountHash] = await Promise.all([
    hmacSha256(secret, canonicalRequest(request, accountId), cryptoImplementation),
    hmacSha256(secret, `private-mail-rate:v1\nglobal\n${request.type}`, cryptoImplementation),
    hmacSha256(secret, `private-mail-rate:v1\nsubject\n${request.type}\n${accountId}`, cryptoImplementation),
    request.type === PRIVATE_MAIL_TYPES.ACCOUNT_DELETION_REQUEST
      ? hmacSha256(secret, `private-mail-account:v1\n${accountId}`, cryptoImplementation)
      : Promise.resolve(null),
  ]);
  return { requestHash, globalBucket, subjectBucket, accountHash };
}

function normalizedState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.ok === false && typeof value.code === "string") {
    return { ok: false, code: value.code };
  }
  if (value.ok !== true || typeof value.replay !== "boolean") return null;
  if (!["claimed", "accepted", "rejected", "unknown"].includes(value.status)) return null;
  const expectedCode = {
    claimed: "request-in-progress",
    accepted: "accepted",
    rejected: "delivery-rejected",
    unknown: "delivery-status-unknown",
  }[value.status];
  if (value.resultCode !== expectedCode) return null;
  return {
    ok: true,
    replay: value.replay,
    status: value.status,
    resultCode: value.resultCode,
  };
}

function mapRpcFailure(code) {
  switch (code) {
    case "forbidden": return PRIVATE_MAIL_ERROR_CODES.FORBIDDEN;
    case "invalid-request": return PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST;
    case "rate-limited": return PRIVATE_MAIL_ERROR_CODES.RATE_LIMITED;
    case "idempotency-conflict": return PRIVATE_MAIL_ERROR_CODES.IDEMPOTENCY_CONFLICT;
    default: return PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE;
  }
}

function responseForState(state, request, origin) {
  if (!state) return jsonResponse(PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE, origin);
  if (!state.ok) return jsonResponse(mapRpcFailure(state.code), origin);
  switch (state.status) {
    case "accepted":
      return jsonResponse(createPrivateMailSuccessResponse(request), origin, 200);
    case "rejected":
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.DELIVERY_REJECTED, origin);
    case "unknown":
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.DELIVERY_STATUS_UNKNOWN, origin);
    default:
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.REQUEST_IN_PROGRESS, origin);
  }
}

function messageInput(request, accountId, timestamp) {
  if (request.type === PRIVATE_MAIL_TYPES.FEEDBACK) {
    return {
      schemaVersion: request.schemaVersion,
      type: request.type,
      operationId: request.operationId,
      submittedAt: timestamp,
      text: request.text,
    };
  }
  return {
    schemaVersion: request.schemaVersion,
    type: request.type,
    operationId: request.operationId,
    requestedAt: timestamp,
    accountId,
  };
}

function dispatcherFor(request, transport) {
  return request.type === PRIVATE_MAIL_TYPES.FEEDBACK
    ? createPrivateFeedbackDispatcher({ transport })
    : createPrivateAccountDeletionDispatcher({ transport });
}

function builtMessageFor(request, input) {
  return request.type === PRIVATE_MAIL_TYPES.FEEDBACK
    ? buildPrivateFeedbackMessage(input)
    : buildPrivateAccountDeletionMessage(input);
}

async function callRpc(dependency, argumentsObject) {
  if (typeof dependency !== "function") return { data: null, error: new Error("rpc-unavailable") };
  try {
    return await dependency(argumentsObject);
  } catch (error) {
    return { data: null, error };
  }
}

export function createPrivateMailRequestHandler(dependencies = {}) {
  return async function handlePrivateMailRequest(request) {
    const origin = request.headers.get("Origin");
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.FORBIDDEN, origin);
    }
    if (request.method === "OPTIONS") {
      if (!preflightAllowed(request)) {
        return jsonResponse(PRIVATE_MAIL_ERROR_CODES.FORBIDDEN, origin);
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST, origin, 405);
    }
    if (!JSON_CONTENT_TYPE.test(request.headers.get("Content-Type") ?? "")) {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST, origin, 415);
    }

    const raw = await readBoundedBody(request);
    if (!raw.ok) return jsonResponse(raw.code, origin);
    const validated = validatePrivateMailRequest(raw.value, { rawByteLength: raw.byteLength });
    if (!validated.ok) return jsonResponse(validated.code, origin);
    const mailRequest = validated.request;

    const authenticated = await authenticate(request, dependencies);
    if (!authenticated.ok) return jsonResponse(authenticated.code, origin);
    const { accountId } = authenticated;

    if (!secretReady(dependencies.hmacSecret)
        || !secretReady(dependencies.transportActivationSecret)
        || typeof dependencies.transport !== "function") {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE, origin);
    }

    let timestamp;
    let digests;
    try {
      const nowValue = typeof dependencies.now === "function" ? dependencies.now() : new Date();
      timestamp = new Date(nowValue).toISOString();
      digests = await createDigests(
        mailRequest,
        accountId,
        dependencies.hmacSecret,
        dependencies.crypto,
      );
    } catch {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE, origin);
    }

    const input = messageInput(mailRequest, accountId, timestamp);
    if (!builtMessageFor(mailRequest, input).ok) {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.INVALID_REQUEST, origin);
    }
    const rate = PRIVATE_MAIL_RATE_LIMITS[mailRequest.type];
    const beginArguments = {
      p_kind: mailRequest.type,
      p_operation_id: mailRequest.operationId,
      p_request_sha256: digests.requestHash,
      p_account_sha256: digests.accountHash,
      p_global_bucket_sha256: digests.globalBucket,
      p_subject_bucket_sha256: digests.subjectBucket,
      p_global_limit: rate.globalLimit,
      p_global_window_seconds: rate.globalWindowSeconds,
      p_subject_limit: rate.subjectLimit,
      p_subject_window_seconds: rate.subjectWindowSeconds,
    };
    const beginResult = await callRpc(dependencies.beginRequest, beginArguments);
    if (beginResult?.error) return jsonResponse(PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE, origin);
    const beginState = normalizedState(beginResult?.data);
    if (!beginState) return jsonResponse(PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE, origin);
    if (!beginState.ok || beginState.replay) {
      return responseForState(beginState, mailRequest, origin);
    }
    if (beginState.status !== "claimed") {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.UNAVAILABLE, origin);
    }

    const dispatch = await dispatcherFor(mailRequest, dependencies.transport).send(input);
    let terminalStatus;
    if (dispatch.ok === true && dispatch.status === "accepted") {
      terminalStatus = "accepted";
    } else if (dispatch.code === PRIVATE_MAIL_DISPATCH_CODES.DELIVERY_REJECTED) {
      terminalStatus = "rejected";
    } else {
      terminalStatus = "unknown";
    }

    const finishResult = await callRpc(dependencies.finishRequest, {
      p_kind: mailRequest.type,
      p_operation_id: mailRequest.operationId,
      p_request_sha256: digests.requestHash,
      p_terminal_status: terminalStatus,
    });
    if (finishResult?.error) {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.DELIVERY_STATUS_UNKNOWN, origin);
    }
    const finishState = normalizedState(finishResult?.data);
    if (!finishState || !finishState.ok) {
      return jsonResponse(PRIVATE_MAIL_ERROR_CODES.DELIVERY_STATUS_UNKNOWN, origin);
    }
    return responseForState(finishState, mailRequest, origin);
  };
}
