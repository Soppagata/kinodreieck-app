import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { startBlogPublicationPgHarness } from "../../../tools/blog-publication-pg-harness.mjs";
import { createKdApiHandler } from "../../../supabase/functions/kd-api/core.js";

const execFileAsync = promisify(execFile);
const ROOT = new URL("../../../", import.meta.url);
const OWNER = "10000000-0000-4000-8000-000000000001";
const MEMBER = "10000000-0000-4000-8000-000000000002";
const INACTIVE = "10000000-0000-4000-8000-000000000003";
const FOREIGN = "10000000-0000-4000-8000-000000000004";
const SERVICE_KEY = "synthetic-local-service-role-key";

const TYPES = Object.freeze({
  kd_api_resolve_key_v1: { p_key_digest: "text", p_request_id: "uuid", p_now: "timestamptz" },
  kd_api_resolve_session_v1: { p_account_id: "uuid", p_request_id: "uuid", p_now: "timestamptz" },
  kd_api_capabilities_v1: { p_context_id: "uuid" },
  kd_api_read_personal_v1: { p_context_id: "uuid", p_bucket: "text", p_entity_id: "text", p_query: "jsonb" },
  kd_api_mutate_personal_v1: { p_context_id: "uuid", p_bucket: "text", p_expected_revision: "bigint", p_operation_id: "uuid", p_request_hash: "text", p_action: "text", p_entity_id: "text", p_payload: "jsonb", p_origin: "jsonb" },
  kd_api_preview_package_v1: { p_context_id: "uuid", p_payload: "jsonb" },
  kd_api_apply_preview_v1: { p_context_id: "uuid", p_preview_id: "uuid", p_sections: "text[]", p_operation_id: "uuid", p_request_hash: "text", p_origin: "jsonb" },
  kd_api_mutate_blog_v1: { p_context_id: "uuid", p_expected_private_revision: "bigint", p_operation_id: "uuid", p_request_hash: "text", p_action: "text", p_private_article_id: "text", p_expected_public_revision: "bigint", p_payload: "jsonb", p_origin: "jsonb" },
  kd_api_list_blog_publications_v1: { p_context_id: "uuid", p_cursor: "text", p_limit: "integer" },
  kd_api_read_blog_publication_v1: { p_context_id: "uuid", p_publication_id: "uuid" },
  kd_api_enqueue_ai_job_v1: { p_context_id: "uuid", p_operation_id: "uuid", p_request_hash: "text", p_kind: "text", p_payload: "jsonb", p_origin: "jsonb" },
  kd_api_read_job_v1: { p_context_id: "uuid", p_job_id: "uuid" },
  kd_api_claim_ai_job_v1: { p_job_id: "uuid" },
  kd_api_finish_ai_job_v1: { p_job_id: "uuid", p_succeeded: "boolean", p_result: "jsonb", p_error: "jsonb" },
  kd_api_mark_ai_job_unknown_v1: { p_job_id: "uuid" },
  kd_api_usage_v1: { p_context_id: "uuid", p_from: "timestamptz", p_to: "timestamptz" },
  kd_api_backend_usage_v1: { p_context_id: "uuid", p_from: "timestamptz", p_to: "timestamptz" },
  kd_api_requests_v1: { p_context_id: "uuid", p_cursor: "text", p_limit: "integer" },
  kd_api_backend_status_v1: { p_context_id: "uuid" },
  kd_api_backend_diagnostics_v1: { p_context_id: "uuid", p_cursor: "text", p_limit: "integer" },
  kd_api_account_export_v1: { p_context_id: "uuid" },
  kd_api_record_request_v1: { p_context_id: "uuid", p_request_id: "uuid", p_operation: "text", p_allowed: "boolean", p_status_code: "integer", p_duration_ms: "integer", p_operation_id: "uuid" },
  kd_api_issue_access_v1: { p_operation_id: "uuid", p_account_id: "uuid", p_assistant_profile: "text", p_permissions: "text[]", p_key_digest: "text", p_key_fingerprint: "text", p_expires_at: "timestamptz", p_label: "text" },
  kd_api_rotate_access_v1: { p_operation_id: "uuid", p_access_id: "uuid", p_new_key_digest: "text", p_new_key_fingerprint: "text", p_expected_key_epoch: "bigint" },
  kd_api_revoke_access_v1: { p_operation_id: "uuid", p_access_id: "uuid", p_expected_key_epoch: "bigint", p_reason_code: "text" },
  kd_private_provider_allowed: { p_provider_id: "text" },
  kd_ai_auftrag_starten: { p_account: "uuid", p_task: "text", p_vorgang: "uuid", p_modell_alias: "text", p_prompt_version: "text", p_profil_version: "text", p_reservierung: "numeric" },
  kd_ai_auftrag_beenden: { p_id: "bigint", p_status: "text", p_modell: "text", p_input_tokens: "integer", p_output_tokens: "integer", p_kosten: "numeric", p_fehlerklasse: "text" },
});

const OWNER_PERMISSIONS = Object.freeze(["library.read","library.write","blog.read","blog.write","blog.publish","personal.read","personal.write","account.export","package.preview","package.apply","schedule.read","schedule.write","radar.read","radar.write","ai.run","diagnostics.read"]);
const MEMBER_PERMISSIONS = Object.freeze(["library.read","library.write","blog.read","blog.write","blog.publish","personal.read","personal.write","account.export","package.preview","package.apply","schedule.read","schedule.write","radar.read","radar.write"]);

function quote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function sqlValue(value, type) {
  if (value === null || value === undefined) return `null::${type}`;
  if (type === "jsonb") return `${quote(JSON.stringify(value))}::jsonb`;
  if (type === "text[]") return `array[${value.map(quote).join(",")}]::text[]`;
  if (type === "boolean") return `${value ? "true" : "false"}::boolean`;
  if (["bigint", "integer", "numeric"].includes(type)) return `${Number(value)}::${type}`;
  return `${quote(value)}::${type}`;
}
function invocation(name, args) {
  const types = TYPES[name];
  if (!types) throw new Error(`E6_RPC_UNMAPPED:${name}`);
  const unknown = Object.keys(args || {}).filter((key) => !Object.hasOwn(types, key));
  if (unknown.length) throw new Error(`E6_RPC_ARGS_UNMAPPED:${name}:${unknown.join(",")}`);
  const values = Object.entries(types).filter(([key]) => Object.hasOwn(args || {}, key)).map(([key, type]) => `${key} => ${sqlValue(args[key], type)}`);
  return `public.${name}(${values.join(",")})`;
}
function inMemoryKeychain() {
  const records = new Map();
  return Object.freeze({
    read(account, { missing = false } = {}) { if (!records.has(account)) { if (missing) return null; throw new Error("KEYCHAIN_MISSING"); } return records.get(account); },
    write(account, value) { records.set(account, value); },
    delete(account, { missing = false } = {}) { if (!records.delete(account) && !missing) throw new Error("KEYCHAIN_MISSING"); },
  });
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
  return server.address().port;
}
async function close(server) { if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
function toRequest(request, port) {
  return new Request(`http://127.0.0.1:${port}${request.url}`, { method: request.method, headers: request.headers, body: ["GET","HEAD"].includes(request.method) ? undefined : request, duplex: "half" });
}
async function sendResponse(response, target) { target.writeHead(response.status, Object.fromEntries(response.headers)); target.end(Buffer.from(await response.arrayBuffer())); }

export async function startLocalKdApiHarness({ sourceCommit, releaseId = "e6-local" } = {}) {
  const pg = await startBlogPublicationPgHarness({ applyAuthorMigration: true, applyLegacyNullMigration: true });
  let apiServer; let restServer;
  const dispatched = new Map(); const providerRuns = []; const keychain = inMemoryKeychain(); const envState = { enabled: false };
  const sqlFile = async (path) => pg.sql(await readFile(new URL(path, ROOT), "utf8"), { role: "postgres" });
  try {
    pg.sql(`
      create schema if not exists extensions;
      create function extensions.gen_random_uuid() returns uuid language sql volatile as $$select public.gen_random_uuid()$$;
      create function extensions.gen_random_bytes(integer) returns bytea language sql volatile as $$select public.gen_random_bytes($1)$$;
      create function extensions.digest(bytea,text) returns bytea language sql immutable as $$select public.digest($1,$2)$$;
      create function extensions.hmac(bytea,bytea,text) returns bytea language sql immutable as $$select public.hmac($1,$2,$3)$$;
      alter table public.kd_account_access add column role text not null default 'member';
      alter table public.kd_account_access add column personal_ai boolean not null default false;
      alter table public.kd_account_access add column created_at timestamptz not null default now();
      alter table public.kd_account_access add column updated_at timestamptz not null default now();
      alter table public.kd_personal drop constraint if exists kd_personal_key_erlaubt;
      alter table public.kd_personal add constraint kd_personal_key_erlaubt check (key in (
        'kd:master','kd:artikel','kd:kino-pins','kd:entdecken-pins','kd:wochenplan','kd:radar',
        'kd:merkliste','kd:vokabular','kd:einstellungen','kd:entdecken-status','kd:autor-name',
        'kd:streaming-dienste','kd:mustwatch','kd:achievements','kd:zeitgrenze','kd:filter-mediathek',
        'kd:filter-kino','kd:filter-streaming','kd:geschmacksprofil'
      ));
      insert into auth.users(id,email) values('${FOREIGN}','foreign@login.kinodreieck.at');
      insert into public.kd_account_access(account_id,active,role,personal_ai) values('${FOREIGN}',true,'member',false);
      update public.kd_account_access set role='owner',personal_ai=true where account_id='${OWNER}';
      grant select,insert,update,delete on public.kd_account_access to service_role;
    `, { role: "postgres" });
    await sqlFile("supabase/migrations/20260726160000_etappe5_ki_unterbau.sql");
    await sqlFile("supabase/migrations/20260726180000_etappe5_ki_unterbau_haertung.sql");
    pg.sql("alter function public.kd_ai_auftrag_starten(uuid,text,uuid,text,text,text,numeric) rename to kd_ai_auftrag_starten_ohne_task_cap;", { role: "postgres" });
    await sqlFile("supabase/migrations/20260808120000_ai_anbieter_request_kostenzaun.sql");
    pg.sql(`
      grant select,insert,update,delete on public.kd_ai_limits,public.kd_ai_log to service_role;
      grant usage,select on all sequences in schema public to service_role;
      grant execute on function public.kd_ai_auftrag_beenden(bigint,text,text,integer,integer,numeric,text) to service_role;
      create table public.kd_private_settings(singleton boolean primary key default true check(singleton),provider_requests_enabled boolean not null default false);
      insert into public.kd_private_settings(singleton,provider_requests_enabled) values(true,true);
      create table public.kd_private_provider_registry(provider_id text primary key,feature_enabled boolean not null,rights_confirmed boolean not null,dpa_transfer_confirmed boolean not null,retention_confirmed boolean not null,price_budget_confirmed boolean not null,legal_status text not null,reviewed_at date);
      insert into public.kd_private_provider_registry values('anthropic',true,true,true,true,true,'APPROVED',current_date);
      create function public.kd_private_provider_allowed(p_provider_id text) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
        select jsonb_build_object('ok',coalesce(s.provider_requests_enabled,false) and coalesce(p.feature_enabled,false) and coalesce(p.rights_confirmed,false) and coalesce(p.dpa_transfer_confirmed,false) and coalesce(p.retention_confirmed,false) and coalesce(p.price_budget_confirmed,false) and p.legal_status='APPROVED' and p.reviewed_at>=current_date-90,
          'code',case when coalesce(s.provider_requests_enabled,false) and coalesce(p.feature_enabled,false) and coalesce(p.rights_confirmed,false) and coalesce(p.dpa_transfer_confirmed,false) and coalesce(p.retention_confirmed,false) and coalesce(p.price_budget_confirmed,false) and p.legal_status='APPROVED' and p.reviewed_at>=current_date-90 then 'PROVIDER_ALLOWED' else 'PROVIDER_REGISTRY_OFF' end)
        from public.kd_private_settings s left join public.kd_private_provider_registry p on p.provider_id=p_provider_id where s.singleton
      $$;
      revoke all on table public.kd_private_settings,public.kd_private_provider_registry from public,anon,authenticated;
      revoke all on function public.kd_private_provider_allowed(text) from public,anon,authenticated;
      grant execute on function public.kd_private_provider_allowed(text) to service_role;
    `, { role: "postgres" });
    await sqlFile("supabase/migrations/20260926120000_kd_api_v1.sql");

    const rpc = async (name, args = {}) => pg.sqlJson(`select coalesce(to_jsonb(${invocation(name,args)}),'null'::jsonb);`, { role: "service_role" });
    const sql = (statement, options = {}) => pg.sql(statement, options);
    const sqlJson = (statement, options = {}) => pg.sqlJson(statement, options);
    restServer = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (request.method === "GET" && url.pathname === "/rest/v1/kd_ai_limits") {
          const data = sqlJson("select coalesce(jsonb_agg(jsonb_build_object('schluessel',schluessel,'wert',wert) order by schluessel),'[]'::jsonb) from public.kd_ai_limits;", { role: "service_role" });
          response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(data)); return;
        }
        const match = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
        if (!match || request.method !== "POST") { response.writeHead(404); response.end(); return; }
        let raw = ""; for await (const chunk of request) raw += chunk;
        const value = await rpc(match[1], raw ? JSON.parse(raw) : {});
        response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value));
      } catch (error) { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ code: "E6_PG", message: String(error?.message || error) })); }
    });
    const restPort = await listen(restServer);
    const runAiTask = async (jobId) => {
      const deno = new URL("../../../node_modules/.bin/deno", import.meta.url).pathname;
      const runner = new URL("./ai-task-runner.ts", import.meta.url).pathname;
      const { stdout, stderr } = await execFileAsync(deno, ["run","--allow-env","--allow-net","--allow-read","--node-modules-dir=manual","--no-lock",runner,jobId], {
        cwd: new URL("../../../", import.meta.url).pathname,
        env: { ...process.env, KD_KEIN_SERVER:"1", KD_AI_TASK_ENABLED:"true", SUPABASE_URL:`http://127.0.0.1:${restPort}`, SUPABASE_SERVICE_ROLE_KEY:SERVICE_KEY, SUPABASE_SECRET_KEYS:JSON.stringify({default:SERVICE_KEY}), SUPABASE_ANON_KEY:"synthetic-anon", SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:"synthetic-anon"}), ANTHROPIC_API_KEY:"synthetic-provider-key" },
        maxBuffer: 8_000_000,
      });
      const line = stdout.trim().split("\n").filter(Boolean).at(-1);
      if (!line) throw new Error(`AI_TASK_NO_RESULT:${stderr}`);
      const result = JSON.parse(line); providerRuns.push(result); return result;
    };
    const handler = createKdApiHandler({
      env(name) { if(name==="KD_API_ENABLED") return envState.enabled?"true":"false"; if(name==="KD_API_SOURCE_COMMIT") return sourceCommit; if(name==="KD_API_RELEASE_ID") return releaseId; return null; },
      async authUser(token) { return ({"owner.header.payload":OWNER,"member.header.payload":MEMBER,"foreign.header.payload":FOREIGN})[token] || null; },
      rpc,
      dispatchAi(jobId) { const promise=runAiTask(jobId); dispatched.set(jobId,promise); return promise; },
      async sha256(value) { return createHash("sha256").update(value,"utf8").digest("hex"); }, randomUUID,
    });
    apiServer = createServer(async (request,response) => { try { await sendResponse(await handler(toRequest(request,apiServer.address().port)),response); } catch(error) { response.writeHead(500,{"content-type":"application/json"}); response.end(JSON.stringify({error:String(error)})); } });
    const apiPort = await listen(apiServer);
    return Object.freeze({
      accounts:{owner:OWNER,member:MEMBER,inactive:INACTIVE,foreign:FOREIGN}, baseUrl:`http://127.0.0.1:${apiPort}/v1`, functionBaseUrl:`http://127.0.0.1:${apiPort}`, keychain, providerRuns, rpc, sql, sqlJson,
      setEnabled(value){envState.enabled=value===true;}, async drainAi(){return Promise.all(dispatched.values());},
      async stop(){await Promise.allSettled(dispatched.values());await close(apiServer);await close(restServer);pg.stop();},
    });
  } catch(error) { await close(apiServer);await close(restServer);pg.stop();throw error; }
}

export { OWNER_PERMISSIONS, MEMBER_PERMISSIONS, SERVICE_KEY };
