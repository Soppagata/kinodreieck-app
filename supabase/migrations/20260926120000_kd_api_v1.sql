-- Kinodreieck API v1: kontogebundene Zugänge, atomare persönliche Writes
-- und datensparsame Job-/Requestbelege. Additiv; ohne Aktivierung der Edge
-- Function entsteht keine neue öffentliche Wirkung.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.kd_api_access_v1 (
  access_id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  key_digest text not null unique check (key_digest ~ '^[0-9a-f]{64}$'),
  key_fingerprint text not null check (char_length(key_fingerprint) between 8 and 80),
  role_snapshot text not null check (role_snapshot in ('member','owner')),
  assistant_profile text not null check (assistant_profile in ('personal_owner','member')),
  permissions text[] not null,
  key_epoch bigint not null default 1 check (key_epoch > 0),
  label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (expires_at is null or expires_at > created_at)
);

create table private.kd_api_context_v1 (
  context_id uuid primary key default extensions.gen_random_uuid(),
  access_id uuid references private.kd_api_access_v1(access_id) on delete cascade,
  account_id uuid not null references auth.users(id) on delete cascade,
  effective_role text not null check (effective_role in ('member','owner')),
  assistant_profile text not null check (assistant_profile in ('app_session','personal_owner','member')),
  permissions text[] not null,
  ai_authorized boolean not null,
  account_epoch bigint not null,
  key_epoch bigint,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '5 minutes')
);

create table private.kd_api_operation_v1 (
  operation_id uuid not null,
  account_id uuid not null references auth.users(id) on delete cascade,
  access_id uuid references private.kd_api_access_v1(access_id) on delete set null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  operation text not null check (char_length(operation) between 1 and 120),
  status text not null check (status in ('accepted','running','succeeded','failed','conflict','unknown')),
  result jsonb,
  error_code text,
  root_operation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id,operation_id)
);

create table private.kd_api_request_v1 (
  request_id uuid primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  access_id uuid references private.kd_api_access_v1(access_id) on delete set null,
  operation text not null,
  allowed boolean not null,
  status_code integer not null check (status_code between 100 and 599),
  duration_ms integer not null check (duration_ms >= 0),
  operation_id uuid,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null default now() + interval '90 days'
);

create table public.kd_api_job_v1 (
  job_id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  root_operation_id uuid not null,
  request_id uuid not null,
  access_id uuid not null references private.kd_api_access_v1(access_id) on delete restrict,
  origin_profile text not null check (origin_profile in ('personal_owner','member')),
  origin_permissions text[] not null,
  origin_ai_authorized boolean not null,
  origin jsonb not null,
  kind text not null check (char_length(kind) between 1 and 100),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  status text not null check (status in ('accepted','queued','running','succeeded','failed','cancelled','unknown')),
  result jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.kd_api_job_v1 enable row level security;
revoke all on table public.kd_api_job_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.kd_api_job_v1 to service_role;

create table private.kd_api_preview_v1 (
  preview_id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  preview_hash text not null check (preview_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  sections text[] not null,
  expected_revisions jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  applied_at timestamptz
);

create table private.kd_api_cursor_secret_v1 (
  singleton boolean primary key default true check (singleton),
  secret bytea not null check (octet_length(secret)=32),
  created_at timestamptz not null default now()
);
insert into private.kd_api_cursor_secret_v1(singleton,secret)
values(true,extensions.gen_random_bytes(32));

revoke all on all tables in schema private from public,anon,authenticated;
revoke all on all tables in schema private from service_role;

create function private.kd_api_account_epoch_v1(p_updated_at timestamptz)
returns bigint language sql immutable set search_path=pg_catalog as $$
  select floor(extract(epoch from p_updated_at) * 1000000)::bigint
$$;

create function private.kd_api_permissions_valid_v1(p_profile text,p_permissions text[])
returns boolean language sql immutable set search_path=pg_catalog as $$
  select p_permissions is not null
    and cardinality(p_permissions) between 1 and 32
    and not exists(select 1 from unnest(p_permissions) p where p !~ '^[a-z][a-z0-9.*_-]{0,63}$')
    and cardinality(p_permissions)=cardinality(array(select distinct p from unnest(p_permissions) p))
    and (p_profile='personal_owner' or not (p_permissions && array['ai.run','diagnostics.read']))
$$;

create function private.kd_api_result_error_v1(p_code text,p_operation uuid default null,p_current bigint default null)
returns jsonb language sql immutable set search_path=pg_catalog as $$
  select jsonb_strip_nulls(jsonb_build_object('ok',false,'code',p_code,'operationId',p_operation,'currentRevision',p_current))
$$;

create function private.kd_api_cursor_encode_v1(p_payload jsonb)
returns text language plpgsql stable security definer set search_path=pg_catalog,private as $$
declare v_secret bytea; v_body text;
begin
  select secret into v_secret from private.kd_api_cursor_secret_v1 where singleton;
  v_body:=rtrim(replace(replace(replace(encode(convert_to(p_payload::text,'UTF8'),'base64'),E'\n',''),'+','-'),'/','_'),'=');
  return v_body||'.'||encode(extensions.hmac(convert_to(v_body,'UTF8'),v_secret,'sha256'),'hex');
end
$$;

create function private.kd_api_cursor_decode_v1(p_cursor text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $$
declare v_secret bytea; v_body text; v_signature text; v_padding text;
begin
  if p_cursor is null then return null; end if;
  if p_cursor !~ '^[A-Za-z0-9_-]+\.[0-9a-f]{64}$' then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  v_body:=split_part(p_cursor,'.',1); v_signature:=split_part(p_cursor,'.',2);
  select secret into v_secret from private.kd_api_cursor_secret_v1 where singleton;
  if encode(extensions.hmac(convert_to(v_body,'UTF8'),v_secret,'sha256'),'hex')<>v_signature then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  v_padding:=repeat('=',(4-length(v_body)%4)%4);
  return convert_from(decode(replace(replace(v_body,'-','+'),'_','/')||v_padding,'base64'),'UTF8')::jsonb;
exception when invalid_text_representation or invalid_parameter_value then raise exception 'VALIDATION_FAILED' using errcode='22023';
end
$$;

create function private.kd_api_resolve_key_v1(p_key_digest text,p_request_id uuid,p_now timestamptz)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_access private.kd_api_access_v1%rowtype; v_account public.kd_account_access%rowtype;
  v_context uuid; v_epoch bigint; v_ai boolean;
begin
  if p_request_id is null or p_now is null or p_key_digest !~ '^[0-9a-f]{64}$' then
    return private.kd_api_result_error_v1('UNAUTHENTICATED');
  end if;
  select * into v_access from private.kd_api_access_v1 where key_digest=p_key_digest for update;
  if v_access.access_id is null then return private.kd_api_result_error_v1('UNAUTHENTICATED'); end if;
  if v_access.revoked_at is not null then return private.kd_api_result_error_v1('ACCESS_REVOKED'); end if;
  if v_access.expires_at is not null and v_access.expires_at<=p_now then return private.kd_api_result_error_v1('ACCESS_REVOKED'); end if;
  select * into v_account from public.kd_account_access where account_id=v_access.account_id;
  if v_account.account_id is null or not v_account.active then return private.kd_api_result_error_v1('ACCOUNT_INACTIVE'); end if;
  if v_access.assistant_profile='personal_owner' and v_account.role<>'owner' then
    return private.kd_api_result_error_v1('FORBIDDEN');
  end if;
  v_ai:=v_access.assistant_profile='personal_owner' and v_account.role='owner' and v_account.personal_ai
    and 'ai.run'=any(v_access.permissions);
  v_epoch:=private.kd_api_account_epoch_v1(v_account.updated_at);
  insert into private.kd_api_context_v1(access_id,account_id,effective_role,assistant_profile,permissions,
      ai_authorized,account_epoch,key_epoch,expires_at)
    values(v_access.access_id,v_access.account_id,v_account.role,v_access.assistant_profile,v_access.permissions,
      v_ai,v_epoch,v_access.key_epoch,p_now+interval '5 minutes') returning context_id into v_context;
  update private.kd_api_access_v1 set last_used_at=p_now where access_id=v_access.access_id;
  return jsonb_build_object('ok',true,'contextId',v_context,'accountId',v_access.account_id,
    'effectiveRole',v_account.role,'assistantProfile',v_access.assistant_profile,
    'permissions',to_jsonb(v_access.permissions),'aiAuthorized',v_ai,'accountEpoch',v_epoch,
    'expiresAt',p_now+interval '5 minutes');
end
$$;

create function public.kd_api_resolve_key_v1(p_key_digest text,p_request_id uuid,p_now timestamptz)
returns jsonb language sql volatile security definer set search_path=pg_catalog,private as $$
  select private.kd_api_resolve_key_v1(p_key_digest,p_request_id,p_now)
$$;

-- App sessions are validated by the Edge function with getUser(token). This
-- wrapper creates no login/token and therefore cannot widen the JWT.
create function public.kd_api_resolve_session_v1(p_account_id uuid,p_request_id uuid,p_now timestamptz)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_account public.kd_account_access%rowtype; v_context uuid; v_epoch bigint;
  v_permissions text[]:=array['library.read','library.write','blog.read','blog.write','blog.publish',
    'personal.read','personal.write','account.export','package.preview','package.apply',
    'schedule.read','schedule.write','radar.read','radar.write'];
begin
  select * into v_account from public.kd_account_access where account_id=p_account_id;
  if v_account.account_id is null or not v_account.active then return private.kd_api_result_error_v1('ACCOUNT_INACTIVE'); end if;
  v_epoch:=private.kd_api_account_epoch_v1(v_account.updated_at);
  insert into private.kd_api_context_v1(account_id,effective_role,assistant_profile,permissions,ai_authorized,
      account_epoch,expires_at)
    values(p_account_id,v_account.role,'app_session',v_permissions,false,v_epoch,p_now+interval '5 minutes')
    returning context_id into v_context;
  return jsonb_build_object('ok',true,'contextId',v_context,'accountId',p_account_id,'effectiveRole',v_account.role,
    'assistantProfile','app_session','permissions',to_jsonb(v_permissions),'aiAuthorized',false,
    'accountEpoch',v_epoch,'expiresAt',p_now+interval '5 minutes');
end
$$;

create function private.kd_api_require_context_v1(p_context_id uuid,p_permission text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_context private.kd_api_context_v1%rowtype; v_account public.kd_account_access%rowtype;
  v_access private.kd_api_access_v1%rowtype; v_epoch bigint;
begin
  select * into v_context from private.kd_api_context_v1 where context_id=p_context_id;
  if v_context.context_id is null or v_context.expires_at<=clock_timestamp() then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
  select * into v_account from public.kd_account_access where account_id=v_context.account_id;
  if v_account.account_id is null or not v_account.active then raise exception 'ACCOUNT_INACTIVE' using errcode='42501'; end if;
  v_epoch:=private.kd_api_account_epoch_v1(v_account.updated_at);
  if v_epoch<>v_context.account_epoch or v_account.role<>v_context.effective_role then raise exception 'ACCOUNT_INACTIVE' using errcode='42501'; end if;
  if v_context.access_id is not null then
    select * into v_access from private.kd_api_access_v1 where access_id=v_context.access_id;
    if v_access.access_id is null or v_access.revoked_at is not null or (v_access.expires_at is not null and v_access.expires_at<=clock_timestamp())
      or v_access.key_epoch<>v_context.key_epoch then raise exception 'ACCESS_REVOKED' using errcode='42501'; end if;
  end if;
  if p_permission is not null and not (p_permission=any(v_context.permissions)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_permission like 'ai.%' and (v_context.assistant_profile<>'personal_owner' or not v_context.ai_authorized
      or v_account.role<>'owner' or not v_account.personal_ai) then raise exception 'AI_DISABLED' using errcode='42501'; end if;
  if p_permission like 'diagnostics.%' and v_context.assistant_profile<>'personal_owner' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object('accountId',v_context.account_id,'accessId',v_context.access_id,
    'effectiveRole',v_account.role,'assistantProfile',v_context.assistant_profile,
    'permissions',to_jsonb(v_context.permissions),'aiAuthorized',v_context.ai_authorized,
    'accountEpoch',v_context.account_epoch);
end
$$;

create function private.kd_api_operation_claim_v1(p_context jsonb,p_operation_id uuid,p_request_hash text,p_operation text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private as $$
declare v_row private.kd_api_operation_v1%rowtype;
begin
  if p_operation_id is null or p_request_hash !~ '^[0-9a-f]{64}$' then return private.kd_api_result_error_v1('VALIDATION_FAILED',p_operation_id); end if;
  select * into v_row from private.kd_api_operation_v1 where account_id=(p_context->>'accountId')::uuid and operation_id=p_operation_id for update;
  if v_row.operation_id is not null then
    if v_row.request_hash<>p_request_hash or v_row.operation<>p_operation then return private.kd_api_result_error_v1('IDEMPOTENCY_MISMATCH',p_operation_id); end if;
    return jsonb_build_object('ok',true,'replayed',true,'status',v_row.status,'result',v_row.result);
  end if;
  insert into private.kd_api_operation_v1(operation_id,account_id,access_id,request_hash,operation,status,root_operation_id)
    values(p_operation_id,(p_context->>'accountId')::uuid,nullif(p_context->>'accessId','')::uuid,p_request_hash,p_operation,'accepted',p_operation_id);
  return jsonb_build_object('ok',true,'replayed',false);
end
$$;

create function private.kd_api_access_result_v1(p_operation uuid,p_access private.kd_api_access_v1)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('operationId',p_operation,'accessId',p_access.access_id,'accountId',p_access.account_id,
  'assistantProfile',p_access.assistant_profile,'permissions',to_jsonb(p_access.permissions),
  'keyFingerprint',p_access.key_fingerprint,'keyEpoch',p_access.key_epoch,'createdAt',p_access.created_at,
  'expiresAt',p_access.expires_at,'revokedAt',p_access.revoked_at)
$$;

create function public.kd_api_issue_access_v1(p_operation_id uuid,p_account_id uuid,p_assistant_profile text,
  p_permissions text[],p_key_digest text,p_key_fingerprint text,p_expires_at timestamptz default null,p_label text default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_account public.kd_account_access%rowtype; v_access private.kd_api_access_v1%rowtype;
  v_existing private.kd_api_operation_v1%rowtype; v_hash text; v_result jsonb;
begin
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('account',p_account_id,'profile',p_assistant_profile,'permissions',p_permissions,
    'digest',p_key_digest,'fingerprint',p_key_fingerprint,'expires',p_expires_at,'label',p_label)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from private.kd_api_operation_v1 where account_id=p_account_id and operation_id=p_operation_id for update;
  if v_existing.operation_id is not null then
    if v_existing.request_hash<>v_hash or v_existing.operation<>'access.issue' then return private.kd_api_result_error_v1('IDEMPOTENCY_MISMATCH',p_operation_id); end if;
    return v_existing.result;
  end if;
  select * into v_account from public.kd_account_access where account_id=p_account_id;
  if v_account.account_id is null or not v_account.active then return private.kd_api_result_error_v1('ACCOUNT_INACTIVE',p_operation_id); end if;
  if p_assistant_profile not in ('personal_owner','member') or not private.kd_api_permissions_valid_v1(p_assistant_profile,p_permissions)
    or (p_assistant_profile='personal_owner' and v_account.role<>'owner') or p_key_digest !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(p_key_fingerprint,'')) not between 8 and 80 then
    return private.kd_api_result_error_v1('VALIDATION_FAILED',p_operation_id);
  end if;
  insert into private.kd_api_access_v1(account_id,key_digest,key_fingerprint,role_snapshot,assistant_profile,permissions,expires_at,label)
    values(p_account_id,p_key_digest,p_key_fingerprint,v_account.role,p_assistant_profile,p_permissions,p_expires_at,p_label)
    returning * into v_access;
  v_result:=private.kd_api_access_result_v1(p_operation_id,v_access);
  insert into private.kd_api_operation_v1(operation_id,account_id,access_id,request_hash,operation,status,result,root_operation_id)
    values(p_operation_id,p_account_id,v_access.access_id,v_hash,'access.issue','succeeded',v_result,p_operation_id);
  return v_result;
exception when unique_violation then return private.kd_api_result_error_v1('IDEMPOTENCY_MISMATCH',p_operation_id);
end
$$;

create function public.kd_api_rotate_access_v1(p_operation_id uuid,p_access_id uuid,p_new_key_digest text,
  p_new_key_fingerprint text,p_expected_key_epoch bigint)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private as $$
declare v_access private.kd_api_access_v1%rowtype; v_existing private.kd_api_operation_v1%rowtype; v_hash text; v_result jsonb;
begin
  select * into v_access from private.kd_api_access_v1 where access_id=p_access_id for update;
  if v_access.access_id is null then return private.kd_api_result_error_v1('NOT_FOUND',p_operation_id); end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('access',p_access_id,'digest',p_new_key_digest,'fingerprint',p_new_key_fingerprint,'epoch',p_expected_key_epoch)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from private.kd_api_operation_v1 where account_id=v_access.account_id and operation_id=p_operation_id for update;
  if v_existing.operation_id is not null then
    if v_existing.request_hash<>v_hash or v_existing.operation<>'access.rotate' then return private.kd_api_result_error_v1('IDEMPOTENCY_MISMATCH',p_operation_id); end if;
    return v_existing.result;
  end if;
  if v_access.revoked_at is not null then return private.kd_api_result_error_v1('ACCESS_REVOKED',p_operation_id); end if;
  if v_access.key_epoch<>p_expected_key_epoch then return private.kd_api_result_error_v1('REVISION_CONFLICT',p_operation_id,v_access.key_epoch); end if;
  if p_new_key_digest !~ '^[0-9a-f]{64}$' or char_length(coalesce(p_new_key_fingerprint,'')) not between 8 and 80 then return private.kd_api_result_error_v1('VALIDATION_FAILED',p_operation_id); end if;
  update private.kd_api_access_v1 set key_digest=p_new_key_digest,key_fingerprint=p_new_key_fingerprint,key_epoch=key_epoch+1
    where access_id=p_access_id returning * into v_access;
  v_result:=private.kd_api_access_result_v1(p_operation_id,v_access);
  insert into private.kd_api_operation_v1(operation_id,account_id,access_id,request_hash,operation,status,result,root_operation_id)
    values(p_operation_id,v_access.account_id,p_access_id,v_hash,'access.rotate','succeeded',v_result,p_operation_id);
  return v_result;
exception when unique_violation then return private.kd_api_result_error_v1('IDEMPOTENCY_MISMATCH',p_operation_id);
end
$$;

create function public.kd_api_revoke_access_v1(p_operation_id uuid,p_access_id uuid,p_expected_key_epoch bigint,p_reason_code text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private as $$
declare v_access private.kd_api_access_v1%rowtype; v_existing private.kd_api_operation_v1%rowtype; v_hash text; v_result jsonb;
begin
  select * into v_access from private.kd_api_access_v1 where access_id=p_access_id for update;
  if v_access.access_id is null then return private.kd_api_result_error_v1('NOT_FOUND',p_operation_id); end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('access',p_access_id,'epoch',p_expected_key_epoch,'reason',p_reason_code)::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from private.kd_api_operation_v1 where account_id=v_access.account_id and operation_id=p_operation_id for update;
  if v_existing.operation_id is not null then
    if v_existing.request_hash<>v_hash or v_existing.operation<>'access.revoke' then return private.kd_api_result_error_v1('IDEMPOTENCY_MISMATCH',p_operation_id); end if;
    return v_existing.result;
  end if;
  if v_access.key_epoch<>p_expected_key_epoch then return private.kd_api_result_error_v1('REVISION_CONFLICT',p_operation_id,v_access.key_epoch); end if;
  if coalesce(p_reason_code,'') !~ '^[A-Z][A-Z0-9_]{1,63}$' then return private.kd_api_result_error_v1('VALIDATION_FAILED',p_operation_id); end if;
  update private.kd_api_access_v1 set revoked_at=coalesce(revoked_at,clock_timestamp()),key_epoch=key_epoch+1
    where access_id=p_access_id returning * into v_access;
  v_result:=private.kd_api_access_result_v1(p_operation_id,v_access);
  insert into private.kd_api_operation_v1(operation_id,account_id,access_id,request_hash,operation,status,result,error_code,root_operation_id)
    values(p_operation_id,v_access.account_id,p_access_id,v_hash,'access.revoke','succeeded',v_result,p_reason_code,p_operation_id);
  return v_result;
end
$$;

create function private.kd_api_bucket_shape_v1(p_bucket text,p_value jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog as $$
begin
  if p_bucket='kd:master' then return coalesce(p_value,'{}'::jsonb);
  elsif p_bucket='kd:artikel' then return coalesce(p_value,'{"artikel":[]}'::jsonb);
  elsif p_bucket='kd:wochenplan' then return coalesce(p_value,'{"version":1,"eintraege":[]}'::jsonb);
  elsif p_bucket='kd:radar' then return coalesce(p_value,'{"items":[]}'::jsonb);
  elsif p_bucket='kd:einstellungen' then return coalesce(p_value,'{}'::jsonb);
  else return coalesce(p_value,'[]'::jsonb); end if;
end
$$;

create function private.kd_api_bucket_items_v1(p_bucket text,p_value jsonb)
returns jsonb language sql immutable set search_path=pg_catalog,private as $$
 select case p_bucket when 'kd:master' then coalesce(p_value->'filme','[]'::jsonb)
  when 'kd:artikel' then coalesce(p_value->'artikel','[]'::jsonb)
  when 'kd:wochenplan' then coalesce(p_value->'eintraege','[]'::jsonb)
  when 'kd:radar' then case when jsonb_typeof(p_value)='array' then p_value else coalesce(p_value->'items',p_value->'subscriptions','[]'::jsonb) end
  when 'kd:einstellungen' then jsonb_build_array(coalesce(p_value,'{}'::jsonb))
  else case when jsonb_typeof(p_value)='array' then p_value else coalesce(p_value->'items','[]'::jsonb) end end
$$;

create function private.kd_api_bucket_with_items_v1(p_bucket text,p_value jsonb,p_items jsonb)
returns jsonb language sql immutable set search_path=pg_catalog,private as $$
 select case p_bucket when 'kd:master' then jsonb_set(private.kd_api_bucket_shape_v1(p_bucket,p_value),'{filme}',p_items,true)
  when 'kd:artikel' then jsonb_set(private.kd_api_bucket_shape_v1(p_bucket,p_value),'{artikel}',p_items,true)
  when 'kd:wochenplan' then jsonb_set(private.kd_api_bucket_shape_v1(p_bucket,p_value),'{eintraege}',p_items,true)
  when 'kd:radar' then case when jsonb_typeof(p_value)='array' then p_items else jsonb_set(private.kd_api_bucket_shape_v1(p_bucket,p_value),'{items}',p_items,true) end
  when 'kd:einstellungen' then coalesce(p_items->0,'{}'::jsonb)
  else p_items end
$$;

create function private.kd_api_bucket_permission_v1(p_bucket text,p_write boolean)
returns text language sql immutable set search_path=pg_catalog as $$
 select case when p_bucket='kd:master' then 'library.'||case when p_write then 'write' else 'read' end
  when p_bucket='kd:artikel' then 'blog.'||case when p_write then 'write' else 'read' end
  when p_bucket='kd:wochenplan' then 'schedule.'||case when p_write then 'write' else 'read' end
  when p_bucket='kd:radar' then 'radar.'||case when p_write then 'write' else 'read' end
  else 'personal.'||case when p_write then 'write' else 'read' end end
$$;

create function public.kd_api_read_personal_v1(p_context_id uuid,p_bucket text,p_entity_id text default null,p_query jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_row public.kd_personal%rowtype; v_data jsonb; v_items jsonb; v_filtered jsonb;
  v_limit integer; v_offset integer; v_query text; v_type text; v_cursor jsonb; v_next text;
begin
  if p_bucket not in ('kd:master','kd:artikel','kd:mustwatch','kd:einstellungen','kd:wochenplan','kd:radar','kd:kino-pins','kd:entdecken-pins','kd:merkliste','kd:vokabular','kd:streaming-dienste') then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  v_context:=private.kd_api_require_context_v1(p_context_id,private.kd_api_bucket_permission_v1(p_bucket,false));
  select * into v_row from public.kd_personal where account_id=(v_context->>'accountId')::uuid and key=p_bucket;
  begin v_data:=private.kd_api_bucket_shape_v1(p_bucket,case when v_row.key is null then null else v_row.value::jsonb end); exception when others then raise exception 'VALIDATION_FAILED' using errcode='22023'; end;
  v_items:=private.kd_api_bucket_items_v1(p_bucket,v_data);
  if jsonb_typeof(v_items)<>'array' then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  if p_entity_id is not null then
    select value into v_filtered from jsonb_array_elements(v_items) where value->>'id'=p_entity_id limit 1;
    if v_filtered is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
    return jsonb_build_object('bucket',p_bucket,'revision',coalesce(v_row.revision,0),'item',v_filtered,'nextCursor',null);
  end if;
  v_limit:=least(greatest(coalesce((p_query->>'limit')::integer,20),1),100);
  v_cursor:=private.kd_api_cursor_decode_v1(nullif(p_query->>'cursor',''));
  if v_cursor is null then v_offset:=0;
  elsif v_cursor->>'accountId'<>v_context->>'accountId' or v_cursor->>'bucket'<>p_bucket
    or coalesce((v_cursor->>'revision')::bigint,-1)<>coalesce(v_row.revision,0)
    or coalesce((v_cursor->>'offset')::integer,-1)<0 then raise exception 'VALIDATION_FAILED' using errcode='22023';
  else v_offset:=(v_cursor->>'offset')::integer; end if;
  v_query:=lower(btrim(coalesce(p_query->>'query',''))); v_type:=coalesce(p_query->>'type','');
  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_filtered from (
    select value from jsonb_array_elements(v_items) with ordinality e(value,n)
    where (v_query='' or lower(coalesce(value->>'titel',value->>'title','')) like '%'||v_query||'%')
      and (v_type='' or coalesce(value->>'typ',value->>'type','')=v_type)
    order by n offset v_offset limit v_limit) q;
  if jsonb_array_length(v_filtered)=v_limit then v_next:=private.kd_api_cursor_encode_v1(jsonb_build_object('accountId',v_context->>'accountId',
    'bucket',p_bucket,'revision',coalesce(v_row.revision,0),'offset',v_offset+v_limit)); end if;
  return jsonb_build_object('bucket',p_bucket,'revision',coalesce(v_row.revision,0),'items',v_filtered,'nextCursor',v_next);
exception when invalid_text_representation then raise exception 'VALIDATION_FAILED' using errcode='22023';
end
$$;

create function public.kd_api_mutate_personal_v1(p_context_id uuid,p_bucket text,p_expected_revision bigint,
  p_operation_id uuid,p_request_hash text,p_action text,p_entity_id text,p_payload jsonb,p_origin jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_claim jsonb; v_row public.kd_personal%rowtype; v_data jsonb; v_items jsonb; v_new_items jsonb;
  v_entity jsonb; v_revision bigint; v_result jsonb; v_found boolean;
begin
  if p_bucket not in ('kd:master','kd:artikel','kd:mustwatch','kd:einstellungen','kd:wochenplan','kd:radar','kd:kino-pins','kd:entdecken-pins','kd:merkliste','kd:vokabular','kd:streaming-dienste')
    or p_action not in ('create','update','remove','replace') or p_expected_revision<0 or jsonb_typeof(p_payload)<>'object'
    or jsonb_typeof(p_origin)<>'object' then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  v_context:=private.kd_api_require_context_v1(p_context_id,private.kd_api_bucket_permission_v1(p_bucket,true));
  v_claim:=private.kd_api_operation_claim_v1(v_context,p_operation_id,p_request_hash,'personal.'||p_action||':'||p_bucket);
  if not (v_claim->>'ok')::boolean then return v_claim; end if;
  if (v_claim->>'replayed')::boolean then return (v_claim->'result')||jsonb_build_object('replayed',true); end if;
  select * into v_row from public.kd_personal where account_id=(v_context->>'accountId')::uuid and key=p_bucket for update;
  v_revision:=coalesce(v_row.revision,0);
  if v_revision<>p_expected_revision then
    delete from private.kd_api_operation_v1 where account_id=(v_context->>'accountId')::uuid and operation_id=p_operation_id;
    return private.kd_api_result_error_v1('REVISION_CONFLICT',p_operation_id,v_revision);
  end if;
  begin v_data:=private.kd_api_bucket_shape_v1(p_bucket,case when v_row.key is null then null else v_row.value::jsonb end); exception when others then raise exception 'VALIDATION_FAILED' using errcode='22023'; end;
  v_items:=private.kd_api_bucket_items_v1(p_bucket,v_data);
  if jsonb_typeof(v_items)<>'array' then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  if p_action='replace' then v_entity:=p_payload; v_data:=p_payload;
  elsif p_action='create' then
    v_entity:=p_payload||jsonb_build_object('id',coalesce(nullif(p_entity_id,''),p_payload->>'id',extensions.gen_random_uuid()::text));
    if exists(select 1 from jsonb_array_elements(v_items) where value->>'id'=v_entity->>'id') then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
    v_data:=private.kd_api_bucket_with_items_v1(p_bucket,v_data,v_items||jsonb_build_array(v_entity));
  elsif p_action='update' then
    select exists(select 1 from jsonb_array_elements(v_items) where value->>'id'=p_entity_id) into v_found;
    if not v_found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
    select coalesce(jsonb_agg(case when value->>'id'=p_entity_id then value||p_payload else value end),'[]'::jsonb)
      into v_new_items from jsonb_array_elements(v_items);
    select value into v_entity from jsonb_array_elements(v_new_items) where value->>'id'=p_entity_id limit 1;
    v_data:=private.kd_api_bucket_with_items_v1(p_bucket,v_data,v_new_items);
  else
    select exists(select 1 from jsonb_array_elements(v_items) where value->>'id'=p_entity_id) into v_found;
    if not v_found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
    select coalesce(jsonb_agg(value),'[]'::jsonb) into v_new_items from jsonb_array_elements(v_items) where value->>'id'<>p_entity_id;
    v_entity:=jsonb_build_object('id',p_entity_id,'deleted',true);
    v_data:=private.kd_api_bucket_with_items_v1(p_bucket,v_data,v_new_items);
  end if;
  if octet_length(v_data::text)>1048576 then raise exception 'PAYLOAD_TOO_LARGE' using errcode='22023'; end if;
  if v_row.key is null then
    insert into public.kd_personal(account_id,key,value,revision) values((v_context->>'accountId')::uuid,p_bucket,v_data::text,1) returning revision into v_revision;
  else
    update public.kd_personal set value=v_data::text where account_id=(v_context->>'accountId')::uuid and key=p_bucket returning revision into v_revision;
  end if;
  v_result:=jsonb_build_object('operationId',p_operation_id,'status','succeeded','bucket',p_bucket,'entityId',p_entity_id,
    'revision',v_revision,'entity',v_entity,'replayed',false);
  update private.kd_api_operation_v1 set status='succeeded',result=v_result,updated_at=clock_timestamp()
    where account_id=(v_context->>'accountId')::uuid and operation_id=p_operation_id;
  return v_result;
end
$$;

create function public.kd_api_preview_package_v1(p_context_id uuid,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_sections text[]:=array[]::text[]; v_expected jsonb; v_id uuid; v_hash text;
  v_master jsonb:='{"filme":[]}'::jsonb; v_articles jsonb:='{"artikel":[]}'::jsonb; v_plan jsonb:='{}'::jsonb;
  v_items jsonb; v_item jsonb; v_area text; v_bucket text; v_account uuid;
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,'package.preview');
  if jsonb_typeof(p_payload)<>'object' or coalesce(p_payload->>'format','')<>'kinodreieck-paket'
    or coalesce(p_payload->>'version','')<>'1' or jsonb_typeof(p_payload->'bereiche')<>'object'
    or exists(select 1 from jsonb_object_keys(p_payload->'bereiche') key where key not in ('filme','serien','musik','sonstiges','artikel'))
    then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  v_account:=(v_context->>'accountId')::uuid;
  begin select value::jsonb into v_master from public.kd_personal where account_id=v_account and key='kd:master'; exception when others then raise exception 'VALIDATION_FAILED' using errcode='22023'; end;
  begin select value::jsonb into v_articles from public.kd_personal where account_id=v_account and key='kd:artikel'; exception when others then raise exception 'VALIDATION_FAILED' using errcode='22023'; end;
  v_master:=private.kd_api_bucket_shape_v1('kd:master',v_master); v_articles:=private.kd_api_bucket_shape_v1('kd:artikel',v_articles);
  v_items:=private.kd_api_bucket_items_v1('kd:master',v_master);
  foreach v_area in array array['filme','serien','musik','sonstiges'] loop
    if p_payload->'bereiche'?v_area then
      if jsonb_typeof(p_payload->'bereiche'->v_area)<>'array' then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
      for v_item in select value from jsonb_array_elements(p_payload->'bereiche'->v_area) loop
        if jsonb_typeof(v_item)<>'object' or char_length(btrim(coalesce(v_item->>'titel',''))) not between 1 and 500 then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
        if not exists(select 1 from jsonb_array_elements(v_items) x where lower(btrim(x->>'titel'))=lower(btrim(v_item->>'titel'))
          and coalesce(x->>'jahr','')=coalesce(v_item->>'jahr','')) then
          v_items:=v_items||jsonb_build_array(v_item||jsonb_build_object('id',extensions.gen_random_uuid()::text,
            'typ',case v_area when 'filme' then 'film' when 'serien' then 'serie' when 'musik' then 'musik' else coalesce(v_item->>'typ','sonstiges') end,
            'bewertet_von',coalesce(v_item->>'bewertet_von',p_payload->>'autor','unbekannt')));
        end if;
      end loop;
    end if;
  end loop;
  if v_items<>private.kd_api_bucket_items_v1('kd:master',v_master) then
    v_master:=private.kd_api_bucket_with_items_v1('kd:master',v_master,v_items); v_sections:=array_append(v_sections,'library'); v_plan:=v_plan||jsonb_build_object('library',v_master);
  end if;
  v_items:=private.kd_api_bucket_items_v1('kd:artikel',v_articles);
  if p_payload->'bereiche'?'artikel' then
    if jsonb_typeof(p_payload->'bereiche'->'artikel')<>'array' then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
    for v_item in select value from jsonb_array_elements(p_payload->'bereiche'->'artikel') loop
      if jsonb_typeof(v_item)<>'object' or char_length(btrim(coalesce(v_item->>'titel',''))) not between 1 and 500 then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
      if not exists(select 1 from jsonb_array_elements(v_items) x where lower(btrim(x->>'titel'))=lower(btrim(v_item->>'titel'))
        and lower(btrim(coalesce(x->>'autor','')))=lower(btrim(coalesce(v_item->>'autor',p_payload->>'autor','unbekannt')))) then
        v_items:=v_items||jsonb_build_array(v_item||jsonb_build_object('id',extensions.gen_random_uuid()::text,'status','entwurf',
          'autor',coalesce(v_item->>'autor',p_payload->>'autor','unbekannt')));
      end if;
    end loop;
  end if;
  if v_items<>private.kd_api_bucket_items_v1('kd:artikel',v_articles) then
    v_articles:=private.kd_api_bucket_with_items_v1('kd:artikel',v_articles,v_items); v_sections:=array_append(v_sections,'blogDrafts'); v_plan:=v_plan||jsonb_build_object('blogDrafts',v_articles);
  end if;
  select coalesce(jsonb_object_agg(s.bucket,coalesce(p.revision,0)),'{}'::jsonb) into v_expected
    from (select unnest(v_sections) section) x
    cross join lateral (select case x.section when 'library' then 'kd:master' when 'blogDrafts' then 'kd:artikel'
      when 'mustWatch' then 'kd:mustwatch' when 'settings' then 'kd:einstellungen' when 'schedule' then 'kd:wochenplan'
      when 'radar' then 'kd:radar' when 'cinemaPins' then 'kd:kino-pins' else 'kd:entdecken-pins' end bucket) s
    left join public.kd_personal p on p.account_id=(v_context->>'accountId')::uuid and p.key=s.bucket;
  v_hash:=encode(extensions.digest(convert_to(v_plan::text,'UTF8'),'sha256'),'hex');
  insert into private.kd_api_preview_v1(account_id,preview_hash,payload,sections,expected_revisions)
    values(v_account,v_hash,v_plan,v_sections,v_expected) returning preview_id into v_id;
  return jsonb_build_object('previewId',v_id,'previewHash',v_hash,'sections',to_jsonb(v_sections),'expectedRevisions',v_expected,
    'expiresAt',clock_timestamp()+interval '30 minutes','aiAuthorized',false);
end
$$;

create function public.kd_api_apply_package_v1(p_context_id uuid,p_expected_revisions jsonb,p_operation_id uuid,
  p_request_hash text,p_preview_hash text,p_sections text[],p_payload jsonb,p_origin jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_claim jsonb; v_preview private.kd_api_preview_v1%rowtype; v_section text; v_bucket text;
  v_expected bigint; v_current bigint; v_value jsonb; v_revisions jsonb:='{}'::jsonb; v_result jsonb;
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,'package.apply');
  v_claim:=private.kd_api_operation_claim_v1(v_context,p_operation_id,p_request_hash,'package.apply');
  if not (v_claim->>'ok')::boolean then return v_claim; end if;
  if (v_claim->>'replayed')::boolean then return (v_claim->'result')||jsonb_build_object('replayed',true); end if;
  select * into v_preview from private.kd_api_preview_v1 where account_id=(v_context->>'accountId')::uuid
    and preview_hash=p_preview_hash and expires_at>clock_timestamp() and applied_at is null for update;
  if v_preview.preview_id is null or v_preview.payload<>p_payload
    or v_preview.expected_revisions<>p_expected_revisions or p_sections is null
    or exists(select 1 from unnest(p_sections) s where not s=any(v_preview.sections))
    then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  for v_bucket in select case s when 'library' then 'kd:master' when 'blogDrafts' then 'kd:artikel'
      when 'mustWatch' then 'kd:mustwatch' when 'settings' then 'kd:einstellungen' when 'schedule' then 'kd:wochenplan'
      when 'radar' then 'kd:radar' when 'cinemaPins' then 'kd:kino-pins' else 'kd:entdecken-pins' end
      from unnest(p_sections) s order by 1 loop
    perform 1 from public.kd_personal where account_id=(v_context->>'accountId')::uuid and key=v_bucket for update;
  end loop;
  foreach v_section in array p_sections loop
    v_bucket:=case v_section when 'library' then 'kd:master' when 'blogDrafts' then 'kd:artikel'
      when 'mustWatch' then 'kd:mustwatch' when 'settings' then 'kd:einstellungen' when 'schedule' then 'kd:wochenplan'
      when 'radar' then 'kd:radar' when 'cinemaPins' then 'kd:kino-pins' else 'kd:entdecken-pins' end;
    v_expected:=coalesce((p_expected_revisions->>v_bucket)::bigint,-1);
    select coalesce(revision,0) into v_current from public.kd_personal where account_id=(v_context->>'accountId')::uuid and key=v_bucket;
    v_current:=coalesce(v_current,0);
    if v_expected<>v_current then raise exception 'REVISION_CONFLICT:%',v_bucket using errcode='40001'; end if;
  end loop;
  foreach v_section in array p_sections loop
    v_bucket:=case v_section when 'library' then 'kd:master' when 'blogDrafts' then 'kd:artikel'
      when 'mustWatch' then 'kd:mustwatch' when 'settings' then 'kd:einstellungen' when 'schedule' then 'kd:wochenplan'
      when 'radar' then 'kd:radar' when 'cinemaPins' then 'kd:kino-pins' else 'kd:entdecken-pins' end;
    v_value:=p_payload->v_section;
    if octet_length(v_value::text)>1048576 then raise exception 'PAYLOAD_TOO_LARGE' using errcode='22023'; end if;
    insert into public.kd_personal(account_id,key,value,revision) values((v_context->>'accountId')::uuid,v_bucket,v_value::text,1)
      on conflict(account_id,key) do update set value=excluded.value returning revision into v_current;
    v_revisions:=v_revisions||jsonb_build_object(v_bucket,v_current);
  end loop;
  update private.kd_api_preview_v1 set applied_at=clock_timestamp() where preview_id=v_preview.preview_id;
  v_result:=jsonb_build_object('operationId',p_operation_id,'status','succeeded','revision',0,'revisions',v_revisions,
    'entity',jsonb_build_object('sections',to_jsonb(p_sections),'aiAuthorized',false),'replayed',false);
  update private.kd_api_operation_v1 set status='succeeded',result=v_result,updated_at=clock_timestamp()
    where account_id=(v_context->>'accountId')::uuid and operation_id=p_operation_id;
  return v_result;
end
$$;

create function public.kd_api_apply_preview_v1(p_context_id uuid,p_preview_id uuid,p_sections text[],
  p_operation_id uuid,p_request_hash text,p_origin jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_preview private.kd_api_preview_v1%rowtype;
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,'package.apply');
  select * into v_preview from private.kd_api_preview_v1 where preview_id=p_preview_id
    and account_id=(v_context->>'accountId')::uuid and expires_at>clock_timestamp();
  if v_preview.preview_id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if p_sections is null or exists(select 1 from unnest(p_sections) s where not s=any(v_preview.sections)) then
    raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  return public.kd_api_apply_package_v1(p_context_id,v_preview.expected_revisions,p_operation_id,p_request_hash,
    v_preview.preview_hash,p_sections,v_preview.payload,p_origin);
end
$$;

create function public.kd_api_mutate_blog_v1(p_context_id uuid,p_expected_private_revision bigint,p_operation_id uuid,
  p_request_hash text,p_action text,p_private_article_id text,p_expected_public_revision bigint,p_payload jsonb,p_origin jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public,auth as $$
declare v_context jsonb; v_claim jsonb; v_request jsonb; v_response jsonb; v_contract_action text; v_result jsonb;
  v_references jsonb;
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,'blog.publish');
  if p_action not in ('publish','update','unpublish','delete') then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  v_claim:=private.kd_api_operation_claim_v1(v_context,p_operation_id,p_request_hash,'blog.'||p_action);
  if not (v_claim->>'ok')::boolean then return v_claim; end if;
  if (v_claim->>'replayed')::boolean then return (v_claim->'result')||jsonb_build_object('replayed',true); end if;
  perform set_config('request.jwt.claim.sub',v_context->>'accountId',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  if p_action in ('publish','update') then
    v_contract_action:=case when p_action='publish' then 'publish' else 'update' end;
    select coalesce(jsonb_agg(jsonb_build_object('rowId',coalesce(value->>'id','ref-'||n::text),'rank',n,
      'title',coalesce(value->>'eingabe',value->>'title',''),'year',case when value->>'jahr' ~ '^[0-9]{1,4}$' then to_jsonb((value->>'jahr')::integer) else 'null'::jsonb end,
      'mediaType',case coalesce(value->>'typ','sonstiges') when 'film' then 'film' when 'serie' then 'serie' when 'musik' then 'musik' else 'sonstiges' end,
      'resolutionIntent',jsonb_build_object('kind','auto')) order by n),'[]'::jsonb) into v_references
      from jsonb_array_elements(coalesce(p_payload->'liste','[]'::jsonb)) with ordinality e(value,n);
    v_request:=jsonb_build_object('contractVersion','blog-publication-v3','operationId',p_operation_id,
      'contentVersion',coalesce(p_payload->>'contentVersion',extensions.gen_random_uuid()::text),'privateArticleId',p_private_article_id,
      'expectedPublicRevision',case when p_action='publish' then null else p_expected_public_revision end,
      'article',jsonb_build_object('title',coalesce(p_payload->>'titel',''),'text',coalesce(p_payload->>'text',''),
        'ordered',coalesce((p_payload->>'geordnet')::boolean,false),'references',v_references),
      'authorDecision',jsonb_build_object('mode',case when coalesce((p_payload->>'anonymous')::boolean,true) then 'anonymous' else 'profile' end,
        'expectedAuthor',case when coalesce((p_payload->>'anonymous')::boolean,true) then null else p_payload->>'autor' end));
    if p_action='publish' then v_response:=public.kd_publish_blog_v3(v_request); else v_response:=public.kd_update_blog_publication_v3(v_request); end if;
  else
    v_request:=jsonb_build_object('contractVersion','blog-publication-v3','operationId',p_operation_id,
      'privateArticleId',p_private_article_id,'expectedPublicRevision',p_expected_public_revision);
    v_response:=public.kd_withdraw_blog_publication_v3(v_request);
  end if;
  v_result:=jsonb_build_object('operationId',p_operation_id,'status',case when v_response->>'outcome' like '%conflict%' then 'conflict' else 'succeeded' end,
    'revision',p_expected_private_revision,'entity',v_response,'replayed',false);
  update private.kd_api_operation_v1 set status=v_result->>'status',result=v_result,updated_at=clock_timestamp()
    where account_id=(v_context->>'accountId')::uuid and operation_id=p_operation_id;
  return v_result;
end
$$;

create function public.kd_api_list_blog_publications_v1(p_context_id uuid,p_cursor text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private,public,auth as $$
declare v_context jsonb; v_cursor jsonb; v_inner text; v_result jsonb; v_next text;
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,'blog.read');
  v_cursor:=private.kd_api_cursor_decode_v1(nullif(p_cursor,''));
  if v_cursor is not null then
    if v_cursor->>'accountId'<>v_context->>'accountId' or v_cursor->>'kind'<>'blog-publications' then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
    v_inner:=v_cursor->>'inner';
  end if;
  perform set_config('request.jwt.claim.sub',v_context->>'accountId',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_result:=public.kd_list_shared_articles_v3(jsonb_build_object('contractVersion','blog-publication-v3',
    'limit',least(greatest(coalesce(p_limit,20),1),50),'cursor',v_inner));
  if nullif(v_result->>'nextCursor','') is not null then v_next:=private.kd_api_cursor_encode_v1(jsonb_build_object(
    'accountId',v_context->>'accountId','kind','blog-publications','inner',v_result->>'nextCursor')); end if;
  return jsonb_set(v_result,'{nextCursor}',coalesce(to_jsonb(v_next),'null'::jsonb),true);
end
$$;

create function public.kd_api_read_blog_publication_v1(p_context_id uuid,p_publication_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_result jsonb;
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,'blog.read');
  select jsonb_build_object('id',s.publication_id,'status','published','contentVersion',s.published_content_version,
    'titel',coalesce(s.payload->>'title',s.payload->>'titel',''),'text',coalesce(s.payload->>'text',''),
    'geordnet',coalesce((s.payload->>'ordered')::boolean,false),'liste',public.kd_blog_public_article(s.publication_id)->'references',
    'autor',case when s.author_mode='profile' then s.author else 'Ohne Namensangabe' end)
    into v_result from public.kd_shared_articles s where s.publication_id=p_publication_id;
  if v_result is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  return v_result;
end
$$;

create function public.kd_api_enqueue_ai_job_v1(p_context_id uuid,p_operation_id uuid,p_request_hash text,
  p_kind text,p_payload jsonb,p_origin jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_claim jsonb; v_job public.kd_api_job_v1%rowtype; v_result jsonb;
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,'ai.run');
  if jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_origin)<>'object'
    or not (p_origin ?& array['requestId','rootOperationId','surface','clientVersion'])
    or p_origin-array['requestId','rootOperationId','surface','clientVersion']<>'{}'::jsonb
    or p_origin->>'rootOperationId'<>p_operation_id::text or char_length(p_kind) not between 1 and 100 then
    return private.kd_api_result_error_v1('ORIGIN_REQUIRED',p_operation_id);
  end if;
  v_claim:=private.kd_api_operation_claim_v1(v_context,p_operation_id,p_request_hash,'ai.job:'||p_kind);
  if not (v_claim->>'ok')::boolean then return v_claim; end if;
  if (v_claim->>'replayed')::boolean then
    select * into v_job from public.kd_api_job_v1 where account_id=(v_context->>'accountId')::uuid and root_operation_id=p_operation_id order by created_at limit 1;
    if v_job.job_id is not null then return jsonb_build_object('id',v_job.job_id,'operationId',p_operation_id,'status',v_job.status,
      'result',v_job.result,'error',v_job.error,'createdAt',v_job.created_at,'updatedAt',v_job.updated_at,'finishedAt',v_job.finished_at,'replayed',true); end if;
    return (v_claim->'result')||jsonb_build_object('replayed',true);
  end if;
  insert into public.kd_api_job_v1(account_id,root_operation_id,request_id,access_id,origin_profile,origin_permissions,
      origin_ai_authorized,origin,kind,payload,status)
    values((v_context->>'accountId')::uuid,p_operation_id,(p_origin->>'requestId')::uuid,(v_context->>'accessId')::uuid,
      v_context->>'assistantProfile',array(select jsonb_array_elements_text(v_context->'permissions')),
      (v_context->>'aiAuthorized')::boolean,p_origin||jsonb_build_object('accountId',v_context->>'accountId','accessId',v_context->>'accessId',
        'assistantProfile',v_context->>'assistantProfile','permissions',v_context->'permissions','aiAuthorized',(v_context->>'aiAuthorized')::boolean,
        'accountEpoch',(v_context->>'accountEpoch')::bigint),p_kind,p_payload,'queued') returning * into v_job;
  v_result:=jsonb_build_object('id',v_job.job_id,'operationId',p_operation_id,'status',v_job.status,'result',null,'error',null,
    'createdAt',v_job.created_at,'updatedAt',v_job.updated_at,'finishedAt',null,'replayed',false);
  update private.kd_api_operation_v1 set status='running',result=v_result,updated_at=clock_timestamp()
    where account_id=(v_context->>'accountId')::uuid and operation_id=p_operation_id;
  return v_result;
end
$$;

create function public.kd_api_read_job_v1(p_context_id uuid,p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_job public.kd_api_job_v1%rowtype;
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,'ai.run');
  select * into v_job from public.kd_api_job_v1 where job_id=p_job_id and account_id=(v_context->>'accountId')::uuid;
  if v_job.job_id is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  return jsonb_build_object('id',v_job.job_id,'operationId',v_job.root_operation_id,'status',v_job.status,
    'result',v_job.result,'error',v_job.error,'createdAt',v_job.created_at,'updatedAt',v_job.updated_at,'finishedAt',v_job.finished_at);
end
$$;

create function public.kd_api_claim_ai_job_v1(p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_job public.kd_api_job_v1%rowtype; v_access private.kd_api_access_v1%rowtype; v_account public.kd_account_access%rowtype;
begin
  select * into v_job from public.kd_api_job_v1 where job_id=p_job_id for update;
  if v_job.job_id is null then return private.kd_api_result_error_v1('NOT_FOUND'); end if;
  if v_job.status not in ('queued','running') then return jsonb_build_object('ok',true,'execute',false,'status',v_job.status); end if;
  select * into v_access from private.kd_api_access_v1 where access_id=v_job.access_id;
  select * into v_account from public.kd_account_access where account_id=v_job.account_id;
  if v_access.access_id is null or v_access.revoked_at is not null or v_access.assistant_profile<>'personal_owner'
    or not ('ai.run'=any(v_access.permissions)) or v_account.account_id is null or not v_account.active
    or v_account.role<>'owner' or not v_account.personal_ai or not v_job.origin_ai_authorized then
    update public.kd_api_job_v1 set status='failed',error=jsonb_build_object('code','AI_DISABLED'),updated_at=clock_timestamp(),finished_at=clock_timestamp() where job_id=p_job_id;
    update private.kd_api_operation_v1 set status='failed',result=jsonb_build_object('id',v_job.job_id,'operationId',v_job.root_operation_id,
      'status','failed','result',null,'error',jsonb_build_object('code','AI_DISABLED'),'createdAt',v_job.created_at,
      'updatedAt',clock_timestamp(),'finishedAt',clock_timestamp()),error_code='AI_DISABLED',updated_at=clock_timestamp()
      where account_id=v_job.account_id and operation_id=v_job.root_operation_id;
    return private.kd_api_result_error_v1('AI_DISABLED');
  end if;
  if v_job.status='queued' then update public.kd_api_job_v1 set status='running',updated_at=clock_timestamp() where job_id=p_job_id; end if;
  return jsonb_build_object('ok',true,'execute',true,'jobId',v_job.job_id,'accountId',v_job.account_id,
    'operationId',v_job.root_operation_id,'kind',v_job.kind,'payload',v_job.payload,'origin',v_job.origin);
end
$$;

create function public.kd_api_finish_ai_job_v1(p_job_id uuid,p_succeeded boolean,p_result jsonb,p_error jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_job public.kd_api_job_v1%rowtype; v_status text;
begin
  select * into v_job from public.kd_api_job_v1 where job_id=p_job_id for update;
  if v_job.job_id is null then return private.kd_api_result_error_v1('NOT_FOUND'); end if;
  if v_job.status in ('succeeded','failed','cancelled') then return jsonb_build_object('ok',true,'status',v_job.status,'replayed',true); end if;
  v_status:=case when p_succeeded then 'succeeded' else 'failed' end;
  update public.kd_api_job_v1 set status=v_status,result=case when p_succeeded then p_result else null end,
    error=case when p_succeeded then null else coalesce(p_error,jsonb_build_object('code','TEMPORARILY_UNAVAILABLE')) end,
    updated_at=clock_timestamp(),finished_at=clock_timestamp() where job_id=p_job_id;
  update private.kd_api_operation_v1 set status=v_status,result=jsonb_build_object('id',v_job.job_id,'operationId',v_job.root_operation_id,
    'status',v_status,'result',case when p_succeeded then p_result else null end,'error',case when p_succeeded then null else p_error end,
    'createdAt',v_job.created_at,'updatedAt',clock_timestamp(),'finishedAt',clock_timestamp()),updated_at=clock_timestamp()
    where account_id=v_job.account_id and operation_id=v_job.root_operation_id;
  return jsonb_build_object('ok',true,'status',v_status,'replayed',false);
end
$$;

create function public.kd_api_mark_ai_job_unknown_v1(p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,private,public as $$
declare v_job public.kd_api_job_v1%rowtype;
begin
  select * into v_job from public.kd_api_job_v1 where job_id=p_job_id for update;
  if v_job.job_id is null then return private.kd_api_result_error_v1('NOT_FOUND'); end if;
  if v_job.status in ('succeeded','failed','cancelled') then return jsonb_build_object('ok',true,'status',v_job.status); end if;
  update public.kd_api_job_v1 set status='unknown',error=jsonb_build_object('code','TEMPORARILY_UNAVAILABLE','retryable',true),updated_at=clock_timestamp() where job_id=p_job_id;
  update private.kd_api_operation_v1 set status='unknown',result=jsonb_build_object('id',v_job.job_id,'operationId',v_job.root_operation_id,
    'status','unknown','result',null,'error',jsonb_build_object('code','TEMPORARILY_UNAVAILABLE','retryable',true),
    'createdAt',v_job.created_at,'updatedAt',clock_timestamp(),'finishedAt',null),updated_at=clock_timestamp()
    where account_id=v_job.account_id and operation_id=v_job.root_operation_id;
  return jsonb_build_object('ok',true,'status','unknown');
end
$$;

create function public.kd_api_capabilities_v1(p_context_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $$
declare v_context jsonb; v_tools text[]:=array['capabilities_get','library_search','library_get','library_add','library_update','library_remove',
 'library_export_selection','blog_drafts_list','blog_draft_get','blog_draft_create','blog_draft_update','blog_draft_remove','blog_publish','blog_unpublish',
 'blog_publications_list','blog_publication_get','mustwatch_list','mustwatch_add','mustwatch_update','mustwatch_remove','settings_get','settings_update',
 'account_export','package_preview','package_apply','schedule_list','schedule_add','schedule_update','schedule_remove','radar_list','radar_add','radar_update','radar_remove'];
begin
  v_context:=private.kd_api_require_context_v1(p_context_id,null);
  if v_context->>'assistantProfile'='personal_owner' and (v_context->>'aiAuthorized')::boolean then v_tools:=v_tools||array['ai_job_start','ai_job_get']; end if;
  if v_context->>'assistantProfile'='personal_owner' and 'diagnostics.read'=any(array(select jsonb_array_elements_text(v_context->'permissions'))) then
    v_tools:=v_tools||array['usage_get','requests_list','backend_status_get','backend_diagnostics_get','backend_usage_get']; end if;
  return jsonb_build_object('contractVersion','kd-api-v1','identity',case v_context->>'assistantProfile' when 'app_session' then 'app_session' when 'personal_owner' then 'personal_owner_assistant' else 'member_assistant' end,
    'tools',to_jsonb(v_tools),'limits',jsonb_build_object('pageMax',100,'contextSeconds',300));
end
$$;

create function private.kd_api_usage_projection_v1(p_account uuid,p_from timestamptz,p_to timestamptz,p_global boolean)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private,public as $$
declare v_started timestamptz; v_requests bigint; v_jobs bigint; v_provider bigint; v_cost numeric; v_has_ai boolean;
begin
  select min(created_at),count(*) into v_started,v_requests from private.kd_api_request_v1
    where created_at>=p_from and created_at<p_to and (p_global or account_id=p_account);
  select count(*) into v_jobs from public.kd_api_job_v1 where created_at>=p_from and created_at<p_to and (p_global or account_id=p_account);
  select to_regclass('public.kd_ai_log') is not null into v_has_ai;
  if v_has_ai then
    execute 'select count(*),coalesce(sum(kosten_usd_cent),0) from public.kd_ai_log where gestartet_at >= $1 and gestartet_at < $2 and ($3 or account_id=$4)'
      into v_provider,v_cost using p_from,p_to,p_global,p_account;
  end if;
  return jsonb_build_object('from',p_from,'to',p_to,'timezone','Europe/Vienna','collectionStartedAt',v_started,
    'coverage',case when v_started is null then 'unknown' else 'partial' end,'requests',case when v_started is null then null else v_requests end,
    'logicalJobs',case when v_started is null then null else v_jobs end,'providerRequests',case when v_has_ai then v_provider else null end,
    'websearchCalls',null,'cost',case when v_has_ai then jsonb_build_object('currency','USD','cent',v_cost) else null end);
end
$$;

create function public.kd_api_usage_v1(p_context_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $$
declare v_context jsonb; begin v_context:=private.kd_api_require_context_v1(p_context_id,'diagnostics.read');
 return private.kd_api_usage_projection_v1((v_context->>'accountId')::uuid,p_from,p_to,false); end $$;

create function public.kd_api_backend_usage_v1(p_context_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $$
begin perform private.kd_api_require_context_v1(p_context_id,'diagnostics.read');
 return private.kd_api_usage_projection_v1(null,p_from,p_to,true); end $$;

create function public.kd_api_requests_v1(p_context_id uuid,p_cursor text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $$
declare v_context jsonb; v_offset integer:=0; v_items jsonb; v_cursor jsonb; v_next text;
begin v_context:=private.kd_api_require_context_v1(p_context_id,'diagnostics.read'); p_limit:=least(greatest(coalesce(p_limit,20),1),100);
 v_cursor:=private.kd_api_cursor_decode_v1(nullif(p_cursor,''));
 if v_cursor is not null then
  if v_cursor->>'accountId'<>v_context->>'accountId' or v_cursor->>'kind'<>'requests' or coalesce((v_cursor->>'offset')::integer,-1)<0 then raise exception 'VALIDATION_FAILED' using errcode='22023'; end if;
  v_offset:=(v_cursor->>'offset')::integer;
 end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_items from (select request_id "requestId",operation,allowed,status_code "statusCode",duration_ms "durationMs",operation_id "operationId",created_at "createdAt"
  from private.kd_api_request_v1 where account_id=(v_context->>'accountId')::uuid order by created_at desc,request_id desc offset v_offset limit p_limit) q;
 if jsonb_array_length(v_items)=p_limit then v_next:=private.kd_api_cursor_encode_v1(jsonb_build_object('accountId',v_context->>'accountId','kind','requests','offset',v_offset+p_limit)); end if;
 return jsonb_build_object('items',v_items,'nextCursor',v_next); end $$;

create function public.kd_api_backend_status_v1(p_context_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private,public as $$
begin perform private.kd_api_require_context_v1(p_context_id,'diagnostics.read');
 return jsonb_build_object('contractVersion','kd-api-v1','database','reachable','apiGate','edge-controlled','checkedAt',clock_timestamp()); end $$;

create function public.kd_api_backend_diagnostics_v1(p_context_id uuid,p_cursor text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $$
begin perform private.kd_api_require_context_v1(p_context_id,'diagnostics.read');
 return jsonb_build_object('items','[]'::jsonb,'nextCursor',null,'coverage','unknown','collectionStartedAt',null); end $$;

create function public.kd_api_account_export_v1(p_context_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private,public as $$
declare v_context jsonb; v_buckets jsonb;
begin v_context:=private.kd_api_require_context_v1(p_context_id,'account.export');
 select coalesce(jsonb_object_agg(key,jsonb_build_object('revision',revision,'value',value::jsonb)),'{}'::jsonb) into v_buckets
  from public.kd_personal where account_id=(v_context->>'accountId')::uuid;
 return jsonb_build_object('format','kinodreieck-paket-v1','exportedAt',clock_timestamp(),'buckets',v_buckets); end $$;

create function public.kd_api_record_request_v1(p_context_id uuid,p_request_id uuid,p_operation text,p_allowed boolean,
  p_status_code integer,p_duration_ms integer,p_operation_id uuid default null)
returns void language plpgsql volatile security definer set search_path=pg_catalog,private as $$
declare v_context jsonb; begin v_context:=private.kd_api_require_context_v1(p_context_id,null);
 insert into private.kd_api_request_v1(request_id,account_id,access_id,operation,allowed,status_code,duration_ms,operation_id)
 values(p_request_id,(v_context->>'accountId')::uuid,nullif(v_context->>'accessId','')::uuid,p_operation,p_allowed,p_status_code,p_duration_ms,p_operation_id)
 on conflict(request_id) do nothing; end $$;

revoke all on all functions in schema private from public,anon,authenticated,service_role;

do $$ declare r record; begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'kd_api_%_v1' loop
   execute format('revoke all on function %s from public,anon,authenticated',r.sig);
   execute format('grant execute on function %s to service_role',r.sig);
 end loop;
end $$;

create index kd_api_context_expiry_v1 on private.kd_api_context_v1(expires_at);
create index kd_api_request_account_time_v1 on private.kd_api_request_v1(account_id,created_at desc);
create index kd_api_job_account_time_v1 on public.kd_api_job_v1(account_id,created_at desc);

notify pgrst,'reload schema';
commit;
