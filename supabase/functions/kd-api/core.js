const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT = /^[^.\s]+\.[^.\s]+\.[^.\s]+$/;
const MUTATION = new Set(["POST", "PATCH", "DELETE"]);
const ERROR_STATUS = {
  API_DISABLED: 503, UNAUTHENTICATED: 401, ACCESS_REVOKED: 401, ACCOUNT_INACTIVE: 403,
  FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_FAILED: 400, PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429, REVISION_REQUIRED: 428, REVISION_CONFLICT: 409,
  IDEMPOTENCY_REQUIRED: 400, IDEMPOTENCY_MISMATCH: 409, ORIGIN_REQUIRED: 400,
  AI_DISABLED: 403, BUDGET_EXHAUSTED: 429, ONLINE_REQUIRED: 503,
  TEMPORARILY_UNAVAILABLE: 503, INTERNAL_ERROR: 500,
};

const BUCKETS = {
  library: "kd:master", drafts: "kd:artikel", mustwatch: "kd:mustwatch",
  settings: "kd:einstellungen", schedule: "kd:wochenplan", radar: "kd:radar",
};

function headers(extra = {}) {
  return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra };
}
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: headers(extra) });
}
function problem(code, requestId, operationId = null, detail = {}) {
  const status = ERROR_STATUS[code] || 500;
  return json({ type: `https://kinodreieck.at/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title: code.replaceAll("_", " "), status, code, requestId, operationId,
    ...(detail.currentRevision == null ? {} : { currentRevision: detail.currentRevision }),
    retryable: ["RATE_LIMITED", "TEMPORARILY_UNAVAILABLE"].includes(code) }, status,
  { "content-type": "application/problem+json" });
}
function cleanPath(url) {
  const path = new URL(url).pathname;
  const marker = path.lastIndexOf("/v1/");
  if (path.endsWith("/v1")) return "/";
  return marker >= 0 ? path.slice(marker + 3) : path;
}
function parseRevision(value) {
  const match = value?.match(/^"(0|[1-9][0-9]*)"$/);
  return match ? Number(match[1]) : null;
}
function itemId(body) { return String(body?.id || ""); }
function query(url) {
  const u = new URL(url); return { cursor: u.searchParams.get("cursor"), limit: Number(u.searchParams.get("limit") || 20),
    query: u.searchParams.get("query") || "", type: u.searchParams.get("type") || "" };
}
async function body(req) {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 1_048_576) throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), { code: "PAYLOAD_TOO_LARGE" });
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("VALIDATION_FAILED");
  return parsed;
}
function rpcError(error) {
  const raw = String(error?.message || error || "");
  return Object.keys(ERROR_STATUS).find((code) => raw.includes(code)) || (error?.code === "P0002" ? "NOT_FOUND" : "INTERNAL_ERROR");
}
function origin(requestId, operationId, req) {
  return { requestId, rootOperationId: operationId, surface: "kd-api", clientVersion: req.headers.get("x-kd-client-version") || "unknown" };
}
function mutationInput(req, requestId) {
  const operationId = req.headers.get("idempotency-key") || "";
  const revision = parseRevision(req.headers.get("if-match"));
  if (!UUID.test(operationId)) throw Object.assign(new Error("IDEMPOTENCY_REQUIRED"), { code: "IDEMPOTENCY_REQUIRED" });
  if (revision === null) throw Object.assign(new Error("REVISION_REQUIRED"), { code: "REVISION_REQUIRED", operationId });
  return { operationId, revision, requestId };
}
function selection(item) {
  const allowed = ["titel","originaltitel","jahr","jahr_bis","typ","quelle","kategorie","bewertung","genre","tags","begruendung","beschreibung","art","film_at_id","bewertet_von"];
  return Object.fromEntries(allowed.filter((key) => Object.hasOwn(item, key)).map((key) => [key, item[key]]));
}
function selectionPackage(items) {
  const areas = {};
  const areaFor = (type) => type === "serie" ? "serien" : type === "musik" ? "musik" : type === "sonstiges" ? "sonstiges" : "filme";
  for (const item of items) (areas[areaFor(item.typ)] ||= []).push(selection(item));
  return { format: "kinodreieck-paket", version: 1, autor: "unbekannt", erstellt: new Date().toISOString(),
    quelle: "kinodreieck-export", hinweis: "Austauschdatei — vor der Übernahme werden die Bereiche bestätigt.", bereiche: areas };
}

export function createKdApiHandler(deps) {
  const env = deps.env;
  const handle = async function handle(req) {
    const started = Date.now();
    const requestId = deps.randomUUID();
    const path = cleanPath(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-headers": "authorization,content-type,idempotency-key,if-match,x-kd-client-version", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" } });
    if (path === "/_meta/version" && req.method === "GET") return json({ functionSlug: "kd-api", contractVersion: "kd-api-v1",
      sourceCommit: /^[0-9a-f]{40}$/.test(env("KD_API_SOURCE_COMMIT") || "") ? env("KD_API_SOURCE_COMMIT") : "0000000000000000000000000000000000000000",
      releaseId: env("KD_API_RELEASE_ID") || "local-unreleased", enabled: env("KD_API_ENABLED") === "true" });
    if (env("KD_API_ENABLED") !== "true") return problem("API_DISABLED", requestId);

    let contextId = null; let operationName = "unknown"; let operationId = null;
    try {
      const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
      if (!token) return problem("UNAUTHENTICATED", requestId);
      let resolved;
      if (JWT.test(token)) {
        const accountId = await deps.authUser(token);
        if (!accountId) return problem("UNAUTHENTICATED", requestId);
        resolved = await deps.rpc("kd_api_resolve_session_v1", { p_account_id: accountId, p_request_id: requestId, p_now: new Date().toISOString() });
      } else {
        const digest = await deps.sha256(token);
        resolved = await deps.rpc("kd_api_resolve_key_v1", { p_key_digest: digest, p_request_id: requestId, p_now: new Date().toISOString() });
      }
      if (!resolved?.ok) return problem(resolved?.code || "UNAUTHENTICATED", requestId);
      contextId = resolved.contextId;
      const call = (name, args = {}) => deps.rpc(name, { p_context_id: contextId, ...args });
      const q = query(req.url);
      const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
      let result; let status = 200; let etag = null;

      if (req.method === "GET" && path === "/capabilities") {
        operationName = "capabilities_get"; result = await call("kd_api_capabilities_v1");
      } else if (req.method === "GET" && path === "/library") {
        operationName = "library_search"; result = await call("kd_api_read_personal_v1", { p_bucket: BUCKETS.library, p_entity_id: null, p_query: q });
      } else if (req.method === "GET" && parts[0] === "library" && parts.length === 2) {
        operationName = "library_get"; result = await call("kd_api_read_personal_v1", { p_bucket: BUCKETS.library, p_entity_id: parts[1], p_query: {} }); etag = result.revision;
      } else if (req.method === "POST" && path === "/library/selection/export") {
        operationName = "library_export_selection"; const input = await body(req);
        if (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 100 || new Set(input.ids).size !== input.ids.length || !["text","json"].includes(input.format)) throw new Error("VALIDATION_FAILED");
        const items = [];
        for (const id of input.ids) items.push((await call("kd_api_read_personal_v1", { p_bucket: BUCKETS.library, p_entity_id: id, p_query: {} })).item);
        result = { format: input.format, filename: `kinodreieck-auswahl.${input.format === "json" ? "json" : "txt"}`,
          mimeType: input.format === "json" ? "application/json" : "text/plain;charset=utf-8", count: items.length, selectedIds: input.ids,
          content: input.format === "json" ? JSON.stringify(selectionPackage(items), null, 2) : items.map((x) => `${x.titel}${x.jahr == null ? "" : ` (${x.jahr})`}`).join("\n") };
      } else if (parts[0] === "library" && ((req.method === "POST" && parts.length === 1) || (["PATCH","DELETE"].includes(req.method) && parts.length === 2))) {
        operationName = req.method === "POST" ? "library_add" : req.method === "PATCH" ? "library_update" : "library_remove";
        const meta = mutationInput(req, requestId); operationId = meta.operationId; const input = req.method === "DELETE" ? {} : await body(req);
        const id = parts[1] || itemId(input) || deps.randomUUID();
        result = await call("kd_api_mutate_personal_v1", { p_bucket: BUCKETS.library, p_expected_revision: meta.revision,
          p_operation_id: meta.operationId, p_request_hash: await deps.sha256(JSON.stringify({ method: req.method, path, input })),
          p_action: req.method === "POST" ? "create" : req.method === "PATCH" ? "update" : "remove", p_entity_id: id,
          p_payload: input, p_origin: origin(requestId, meta.operationId, req) }); status = req.method === "POST" ? 201 : 200; etag = result.revision;
      } else if (req.method === "GET" && path === "/blog-drafts") {
        operationName = "blog_drafts_list"; result = await call("kd_api_read_personal_v1", { p_bucket: BUCKETS.drafts, p_entity_id: null, p_query: q });
      } else if (req.method === "GET" && parts[0] === "blog-drafts" && parts.length === 2) {
        operationName = "blog_draft_get"; result = await call("kd_api_read_personal_v1", { p_bucket: BUCKETS.drafts, p_entity_id: parts[1], p_query: {} }); etag = result.revision;
      } else if (parts[0] === "blog-drafts" && ((req.method === "POST" && parts.length === 1) || (["PATCH","DELETE"].includes(req.method) && parts.length === 2))) {
        operationName = req.method === "POST" ? "blog_draft_create" : req.method === "PATCH" ? "blog_draft_update" : "blog_draft_remove";
        const meta = mutationInput(req, requestId); operationId = meta.operationId; const input = req.method === "DELETE" ? {} : await body(req); const id = parts[1] || itemId(input) || deps.randomUUID();
        result = await call("kd_api_mutate_personal_v1", { p_bucket: BUCKETS.drafts, p_expected_revision: meta.revision,
          p_operation_id: meta.operationId, p_request_hash: await deps.sha256(JSON.stringify({ method: req.method, path, input })),
          p_action: req.method === "POST" ? "create" : req.method === "PATCH" ? "update" : "remove", p_entity_id: id,
          p_payload: input, p_origin: origin(requestId, meta.operationId, req) }); status = req.method === "POST" ? 201 : 200; etag = result.revision;
      } else if (req.method === "POST" && parts[0] === "blog-drafts" && parts[2] === "publish") {
        operationName = "blog_publish"; const meta = mutationInput(req, requestId); operationId = meta.operationId; const publish = await body(req);
        const draft = await call("kd_api_read_personal_v1", { p_bucket: BUCKETS.drafts, p_entity_id: parts[1], p_query: {} });
        result = await call("kd_api_mutate_blog_v1", { p_expected_private_revision: meta.revision, p_operation_id: meta.operationId,
          p_request_hash: await deps.sha256(JSON.stringify({ path, publish, draft: draft.item })), p_action: publish.expectedPublicRevision == null ? "publish" : "update",
          p_private_article_id: parts[1], p_expected_public_revision: publish.expectedPublicRevision,
          p_payload: { ...draft.item, ...publish }, p_origin: origin(requestId, meta.operationId, req) }); status = 202; etag = result.revision;
      } else if (req.method === "GET" && path === "/blog-publications") {
        operationName = "blog_publications_list"; result = await call("kd_api_list_blog_publications_v1", { p_cursor: q.cursor, p_limit: q.limit });
      } else if (req.method === "GET" && parts[0] === "blog-publications" && parts.length === 2) {
        operationName = "blog_publication_get"; if (!UUID.test(parts[1])) throw new Error("VALIDATION_FAILED");
        result = await call("kd_api_read_blog_publication_v1", { p_publication_id: parts[1] });
      } else if (req.method === "POST" && parts[0] === "blog-publications" && parts[2] === "unpublish") {
        operationName = "blog_unpublish"; const meta = mutationInput(req, requestId); operationId = meta.operationId;
        result = await call("kd_api_mutate_blog_v1", { p_expected_private_revision: meta.revision, p_operation_id: meta.operationId,
          p_request_hash: await deps.sha256(JSON.stringify({ path })), p_action: "unpublish", p_private_article_id: parts[1],
          p_expected_public_revision: meta.revision, p_payload: {}, p_origin: origin(requestId, meta.operationId, req) }); status = 202; etag = result.revision;
      } else if (["must-watch","schedule","radar"].includes(parts[0])) {
        const key = parts[0] === "must-watch" ? "mustwatch" : parts[0]; const bucket = BUCKETS[key];
        if (req.method === "GET" && parts.length === 1) {
          operationName = `${key}_list`; result = await call("kd_api_read_personal_v1", { p_bucket: bucket, p_entity_id: null, p_query: q });
        } else if (MUTATION.has(req.method) && (parts.length === 1 || parts.length === 2)) {
          operationName = `${key}_${req.method === "POST" ? "add" : req.method === "PATCH" ? "update" : "remove"}`;
          const meta = mutationInput(req, requestId); operationId = meta.operationId; const input = req.method === "DELETE" ? {} : await body(req); const id = parts[1] || itemId(input) || deps.randomUUID();
          result = await call("kd_api_mutate_personal_v1", { p_bucket: bucket, p_expected_revision: meta.revision,
            p_operation_id: meta.operationId, p_request_hash: await deps.sha256(JSON.stringify({ method:req.method,path,input })),
            p_action: req.method === "POST" ? "create" : req.method === "PATCH" ? "update" : "remove", p_entity_id: id,
            p_payload: input, p_origin: origin(requestId,meta.operationId,req) }); status = req.method === "POST" ? 201 : 200; etag = result.revision;
        } else throw new Error("NOT_FOUND");
      } else if (req.method === "GET" && path === "/settings") {
        operationName = "settings_get"; const row = await call("kd_api_read_personal_v1", { p_bucket: BUCKETS.settings, p_entity_id: null, p_query: {} });
        result = { revision: row.revision, value: row.items?.[0] || {} }; etag = row.revision;
      } else if (req.method === "PATCH" && path === "/settings") {
        operationName = "settings_update"; const meta = mutationInput(req,requestId); operationId=meta.operationId; const input=await body(req);
        const current=await call("kd_api_read_personal_v1",{p_bucket:BUCKETS.settings,p_entity_id:null,p_query:{}});
        const merged={...(current.items?.[0]||{}),...input};
        result=await call("kd_api_mutate_personal_v1",{p_bucket:BUCKETS.settings,p_expected_revision:meta.revision,p_operation_id:meta.operationId,
          p_request_hash:await deps.sha256(JSON.stringify(input)),p_action:"replace",p_entity_id:"settings",p_payload:merged,p_origin:origin(requestId,meta.operationId,req)}); etag=result.revision;
      } else if (req.method === "POST" && path === "/account/export") {
        operationName = "account_export"; result = await call("kd_api_account_export_v1");
      } else if (req.method === "POST" && path === "/packages/preview") {
        operationName = "package_preview"; const input = await body(req); result = await call("kd_api_preview_package_v1", { p_payload: input.package });
      } else if (req.method === "POST" && path === "/packages/apply") {
        operationName = "package_apply"; const meta=mutationInput(req,requestId); operationId=meta.operationId; const input=await body(req);
        result=await call("kd_api_apply_preview_v1",{p_preview_id:input.previewId,p_sections:input.sections,p_operation_id:meta.operationId,
          p_request_hash:await deps.sha256(JSON.stringify(input)),p_origin:origin(requestId,meta.operationId,req)}); etag=result.revision;
      } else if (req.method === "POST" && path === "/ai/jobs") {
        operationName="ai_job_start"; operationId=req.headers.get("idempotency-key")||""; if(!UUID.test(operationId)) throw Object.assign(new Error("IDEMPOTENCY_REQUIRED"),{code:"IDEMPOTENCY_REQUIRED"});
        const input=await body(req); result=await call("kd_api_enqueue_ai_job_v1",{p_operation_id:operationId,p_request_hash:await deps.sha256(JSON.stringify(input)),
          p_kind:input.kind,p_payload:input.payload,p_origin:origin(requestId,operationId,req)}); status=202;
        if(result?.id && !result.replayed) deps.dispatchAi(result.id);
      } else if (req.method === "GET" && parts[0] === "ai" && parts[1] === "jobs" && parts.length===3) {
        operationName="ai_job_get"; if(!UUID.test(parts[2])) throw new Error("VALIDATION_FAILED"); result=await call("kd_api_read_job_v1",{p_job_id:parts[2]});
      } else if (req.method === "GET" && path === "/assistant/requests") {
        operationName="requests_list"; result=await call("kd_api_requests_v1",{p_cursor:q.cursor,p_limit:q.limit});
      } else if (req.method === "GET" && path === "/assistant/backend/status") {
        operationName="backend_status_get"; result=await call("kd_api_backend_status_v1");
      } else if (req.method === "GET" && path === "/assistant/backend/diagnostics") {
        operationName="backend_diagnostics_get"; result=await call("kd_api_backend_diagnostics_v1",{p_cursor:q.cursor,p_limit:q.limit});
      } else if (req.method === "GET" && ["/assistant/usage","/assistant/backend/usage"].includes(path)) {
        operationName=path.includes("backend")?"backend_usage_get":"usage_get"; const u=new URL(req.url); const to=u.searchParams.get("to")||new Date().toISOString(); const from=u.searchParams.get("from")||new Date(Date.now()-30*86400000).toISOString();
        result=await call(operationName==="usage_get"?"kd_api_usage_v1":"kd_api_backend_usage_v1",{p_from:from,p_to:to});
      } else throw new Error("NOT_FOUND");

      if (result?.ok === false) return problem(result.code || "INTERNAL_ERROR",requestId,operationId,{currentRevision:result.currentRevision});
      const response = json(result,status,etag==null?{}:{etag:`"${etag}"`});
      deps.rpc("kd_api_record_request_v1",{p_context_id:contextId,p_request_id:requestId,p_operation:operationName,p_allowed:true,p_status_code:status,p_duration_ms:Date.now()-started,p_operation_id:operationId}).catch(()=>{});
      return response;
    } catch (error) {
      const code = error?.code || (error instanceof SyntaxError ? "VALIDATION_FAILED" : rpcError(error));
      const response = problem(code, requestId, operationId);
      if (contextId) deps.rpc("kd_api_record_request_v1",{p_context_id:contextId,p_request_id:requestId,p_operation:operationName,p_allowed:false,p_status_code:response.status,p_duration_ms:Date.now()-started,p_operation_id:operationId}).catch(()=>{});
      return response;
    }
  };
  return async (req) => {
    const response = await handle(req);
    const origin = req.headers.get("origin");
    const allowed = new Set(["https://kinodreieck.at", "https://staging.kinodreieck.at", "http://localhost:5173"]);
    if (!origin || !allowed.has(origin)) return response;
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("access-control-allow-origin", origin);
    responseHeaders.set("vary", "Origin");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  };
}
