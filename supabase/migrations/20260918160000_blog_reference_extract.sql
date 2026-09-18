-- M7: optional, explicitly initiated blog-reference extraction.
-- No raw title, blog text, provider response, account identifier or quote is
-- written to an operational log. Results remain private and expire after 24h.
begin;

insert into public.kd_ai_limits(schluessel,wert,notiz)
values ('blog_reference_extract_enabled','false'::jsonb,
  'M7 provider task; remains off until backend, client and privacy surfaces are jointly released.')
on conflict(schluessel) do nothing;

do $$
declare v jsonb;
begin
  select wert into v from public.kd_ai_limits where schluessel='blog_reference_extract_enabled' for update;
  if jsonb_typeof(v) is distinct from 'boolean' then
    raise exception 'M7 blog_reference_extract_enabled formfremd';
  end if;

  select wert into v from public.kd_ai_limits where schluessel='task_modell' for update;
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'M7 task_modell fehlt'; end if;
  if v ? 'blog-reference-extract' and v->'blog-reference-extract' is distinct from to_jsonb('gross'::text) then
    raise exception 'M7 task_modell drift';
  end if;
  update public.kd_ai_limits set wert=jsonb_set(wert,'{blog-reference-extract}',to_jsonb('gross'::text),true)
    where schluessel='task_modell';

  select wert into v from public.kd_ai_limits where schluessel='task_max_tokens' for update;
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'M7 task_max_tokens fehlt'; end if;
  if v ? 'blog-reference-extract' and v->'blog-reference-extract' is distinct from to_jsonb(8192) then
    raise exception 'M7 task_max_tokens drift';
  end if;
  update public.kd_ai_limits set wert=jsonb_set(wert,'{blog-reference-extract}',to_jsonb(8192),true)
    where schluessel='task_max_tokens';

  select wert into v from public.kd_ai_limits where schluessel='task_max_reservierung_usd_cent' for update;
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'M7 task cap fehlt'; end if;
  if v ? 'blog-reference-extract' and v->'blog-reference-extract' is distinct from to_jsonb(30) then
    raise exception 'M7 task cap drift';
  end if;
  update public.kd_ai_limits set wert=jsonb_set(wert,'{blog-reference-extract}',to_jsonb(30),true)
    where schluessel='task_max_reservierung_usd_cent';
end
$$;

create table public.kd_blog_reference_extractions(
  extraction_id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hmac text not null check(request_hmac ~ '^[a-f0-9]{64}$'),
  status text not null default 'running' check(status in ('running','succeeded','failed')),
  contract_version text not null check(contract_version='blog-reference-extract-v1'),
  model_alias text not null check(model_alias='gross'),
  prompt_version text not null check(prompt_version='blog-reference-extract-v1'),
  result_version text not null check(result_version='blog-reference-extract-v1'),
  result jsonb,
  result_bytes integer check(result_bytes between 0 and 32768),
  provider_started_at timestamptz,
  lease_expires_at timestamptz not null default clock_timestamp()+interval '65 seconds',
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
  read_window_started_at timestamptz,
  read_count integer not null default 0 check(read_count between 0 and 60),
  unique(account_id,operation_id),
  unique(account_id,request_hmac),
  constraint kd_blog_reference_extractions_terminal_shape check(
    (status='succeeded' and result is not null and result_bytes is not null and finished_at is not null)
    or (status='failed' and result is null and result_bytes is null and finished_at is not null)
    or (status='running' and result is null and result_bytes is null and finished_at is null)
  )
);
create index kd_blog_reference_extractions_account_created
  on public.kd_blog_reference_extractions(account_id,created_at desc);
create index kd_blog_reference_extractions_running
  on public.kd_blog_reference_extractions(lease_expires_at)
  where status='running';
create index kd_blog_reference_extractions_expires
  on public.kd_blog_reference_extractions(expires_at);
alter table public.kd_blog_reference_extractions enable row level security;
revoke all on public.kd_blog_reference_extractions from public,anon,authenticated;
grant all on public.kd_blog_reference_extractions to service_role;

create function public.kd_blog_reference_extract_capability_v1() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('ok',true,'contractVersion','blog-reference-extract-v1')
$$;

create function public.kd_blog_reference_extract_prepare_v1(
  p_account uuid,p_operation uuid,p_request_hmac text,
  p_contract_version text,p_model_alias text,p_prompt_version text,p_result_version text,
  p_reservation_usd_cent numeric
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_existing public.kd_blog_reference_extractions%rowtype;
  v_recent_minute integer;
  v_today integer;
  v_running_account integer;
  v_running_global integer;
  v_result_count integer;
  v_result_bytes bigint;
begin
  if current_user not in ('postgres','service_role') then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_account is null or p_operation is null or p_request_hmac !~ '^[a-f0-9]{64}$'
    or p_contract_version is distinct from 'blog-reference-extract-v1'
    or p_model_alias is distinct from 'gross'
    or p_prompt_version is distinct from 'blog-reference-extract-v1'
    or p_result_version is distinct from 'blog-reference-extract-v1'
    or p_reservation_usd_cent is null
    or p_reservation_usd_cent::text !~ '^[0-9]+(\.[0-9]+)?$'
    or p_reservation_usd_cent<=0 then
    return jsonb_build_object('ok',false,'code','invalid-response','grund','blog-reference-start-form');
  end if;
  if p_reservation_usd_cent>30 then
    return jsonb_build_object('ok',false,'code','limit','grund','blog-reference-task-kostenlimit');
  end if;
  if not exists(select 1 from public.kd_ai_limits
    where schluessel='blog_reference_extract_enabled' and wert='true'::jsonb) then
    return jsonb_build_object('ok',false,'code','ai-disabled','grund','blog-reference-extract-aus');
  end if;
  if not exists(select 1 from public.kd_account_access
    where account_id=p_account and active and personal_ai) then
    return jsonb_build_object('ok',false,'code','forbidden','grund','persoenliche-ki-nicht-freigegeben');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kd_blog_reference_extract:global',0));
  perform pg_advisory_xact_lock(hashtextextended('kd_blog_reference_extract:'||p_account::text,0));

  select * into v_existing from public.kd_blog_reference_extractions
    where account_id=p_account and operation_id=p_operation for update;
  if found and v_existing.request_hmac<>p_request_hmac then
    return jsonb_build_object('ok',false,'code','ai-duplicate','grund','vorgang-inhalt-konflikt');
  end if;

  select * into v_existing from public.kd_blog_reference_extractions
    where account_id=p_account and request_hmac=p_request_hmac for update;
  if found then
    if v_existing.status='succeeded' and v_existing.expires_at>clock_timestamp() then
      if v_existing.read_window_started_at is null
        or v_existing.read_window_started_at<=clock_timestamp()-interval '1 minute' then
        update public.kd_blog_reference_extractions set
          read_window_started_at=clock_timestamp(),read_count=1
          where extraction_id=v_existing.extraction_id;
      elsif v_existing.read_count>=60 then
        return jsonb_build_object('ok',false,'code','limit','grund','blog-reference-leserate');
      else
        update public.kd_blog_reference_extractions set read_count=read_count+1
          where extraction_id=v_existing.extraction_id;
      end if;
      return jsonb_build_object('ok',true,'status','cache_hit','data',v_existing.result);
    end if;
    return jsonb_build_object('ok',false,'code','ai-duplicate','grund',
      case when v_existing.status='running' and v_existing.lease_expires_at>clock_timestamp()
        then 'blog-reference-bereits-laufend' else 'blog-reference-terminal-oder-abgelaufen' end);
  end if;

  select count(*) into v_recent_minute from public.kd_blog_reference_extractions
    where account_id=p_account and created_at>clock_timestamp()-interval '1 minute';
  select count(*) into v_today from public.kd_blog_reference_extractions
    where account_id=p_account and created_at>=date_trunc('day',clock_timestamp() at time zone 'Europe/Vienna') at time zone 'Europe/Vienna';
  select count(*) into v_running_account from public.kd_blog_reference_extractions
    where account_id=p_account and status='running' and lease_expires_at>clock_timestamp();
  select count(*) into v_running_global from public.kd_blog_reference_extractions
    where status='running' and lease_expires_at>clock_timestamp();
  select count(*),coalesce(sum(result_bytes),0) into v_result_count,v_result_bytes
    from public.kd_blog_reference_extractions where account_id=p_account and status='succeeded';
  if v_recent_minute>=3 then return jsonb_build_object('ok',false,'code','limit','grund','blog-reference-minute-limit'); end if;
  if v_today>=10 then return jsonb_build_object('ok',false,'code','limit','grund','blog-reference-tageslimit'); end if;
  if v_running_account>=1 then return jsonb_build_object('ok',false,'code','limit','grund','blog-reference-konto-parallel'); end if;
  if v_running_global>=4 then return jsonb_build_object('ok',false,'code','limit','grund','blog-reference-global-parallel'); end if;
  if v_result_count>=10 or v_result_bytes>327680-32768 then
    return jsonb_build_object('ok',false,'code','limit','grund','blog-reference-speicherlimit');
  end if;
  insert into public.kd_blog_reference_extractions(
    account_id,operation_id,request_hmac,contract_version,model_alias,prompt_version,result_version)
  values(p_account,p_operation,p_request_hmac,p_contract_version,p_model_alias,p_prompt_version,p_result_version);
  return jsonb_build_object('ok',true,'status','new');
exception when unique_violation then
  return jsonb_build_object('ok',false,'code','ai-duplicate','grund','blog-reference-race');
end
$$;

create function public.kd_blog_reference_extract_provider_started_v1(p_account uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_count integer;
begin
  if current_user not in ('postgres','service_role') then raise exception 'service role required' using errcode='42501'; end if;
  update public.kd_blog_reference_extractions set provider_started_at=clock_timestamp()
    where account_id=p_account and operation_id=p_operation and status='running'
      and provider_started_at is null and lease_expires_at>clock_timestamp();
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',v_count=1);
end
$$;

create function public.kd_blog_reference_extract_cancel_v1(p_account uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_count integer;
begin
  if current_user not in ('postgres','service_role') then raise exception 'service role required' using errcode='42501'; end if;
  delete from public.kd_blog_reference_extractions
    where account_id=p_account and operation_id=p_operation and status='running' and provider_started_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',v_count=1);
end
$$;

create function public.kd_blog_reference_extract_finish_v1(
  p_account uuid,p_operation uuid,p_succeeded boolean,p_result jsonb default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_row public.kd_blog_reference_extractions%rowtype;
  v_expires timestamptz; v_final jsonb; v_bytes integer; v_count integer; v_total bigint;
begin
  if current_user not in ('postgres','service_role') then raise exception 'service role required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kd_blog_reference_extract:'||p_account::text,0));
  select * into v_row from public.kd_blog_reference_extractions
    where account_id=p_account and operation_id=p_operation for update;
  if not found then return jsonb_build_object('ok',false,'code','not-found'); end if;
  if v_row.status='succeeded' then return jsonb_build_object('ok',true,'status','succeeded','data',v_row.result); end if;
  if v_row.status='failed' then return jsonb_build_object('ok',not p_succeeded,'status','failed'); end if;
  if not p_succeeded then
    update public.kd_blog_reference_extractions set status='failed',finished_at=clock_timestamp(),
      lease_expires_at=least(lease_expires_at,clock_timestamp()) where extraction_id=v_row.extraction_id;
    return jsonb_build_object('ok',true,'status','failed');
  end if;
  if v_row.provider_started_at is null or jsonb_typeof(p_result)<>'object'
    or not (p_result ?& array['contractVersion','candidates','partial'])
    or p_result-array['contractVersion','candidates','partial']<>'{}'::jsonb
    or p_result->>'contractVersion'<>'blog-reference-extract-v1'
    or jsonb_typeof(p_result->'candidates')<>'array'
    or jsonb_array_length(p_result->'candidates')>50
    or jsonb_typeof(p_result->'partial')<>'boolean' then
    update public.kd_blog_reference_extractions set status='failed',finished_at=clock_timestamp()
      where extraction_id=v_row.extraction_id;
    return jsonb_build_object('ok',false,'code','invalid-response','grund','blog-reference-result-form');
  end if;
  v_expires:=v_row.created_at+interval '24 hours';
  v_final:=p_result||jsonb_build_object('expiresAt',to_char(v_expires at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  v_bytes:=octet_length(v_final::text);
  select count(*),coalesce(sum(result_bytes),0) into v_count,v_total
    from public.kd_blog_reference_extractions where account_id=p_account and status='succeeded'
      and extraction_id<>v_row.extraction_id;
  if v_bytes>32768 or v_count>=10 or v_total+v_bytes>327680 then
    update public.kd_blog_reference_extractions set status='failed',finished_at=clock_timestamp()
      where extraction_id=v_row.extraction_id;
    return jsonb_build_object('ok',false,'code','limit','grund','blog-reference-result-speicherlimit');
  end if;
  update public.kd_blog_reference_extractions set status='succeeded',result=v_final,result_bytes=v_bytes,
    finished_at=clock_timestamp(),expires_at=v_expires,lease_expires_at=least(lease_expires_at,clock_timestamp())
    where extraction_id=v_row.extraction_id;
  return jsonb_build_object('ok',true,'status','succeeded','data',v_final);
end
$$;

create function public.kd_blog_reference_extract_purge_v1(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,200),1),500); v_deleted integer;
begin
  if current_user not in ('postgres','service_role') then raise exception 'service role required' using errcode='42501'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('kd_blog_reference_extract_purge_v1',0)) then
    return jsonb_build_object('ok',false,'code','LOCKED');
  end if;
  delete from public.kd_blog_reference_extractions where extraction_id in(
    select extraction_id from public.kd_blog_reference_extractions where expires_at<=clock_timestamp()
      order by expires_at limit v_limit for update skip locked);
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('ok',true,'purged',v_deleted,'limit',v_limit);
end
$$;

insert into public.kd_private_delete_map(storage_class,account_column,action,reason)
values('kd_blog_reference_extractions','account_id','cascade',
  'Private blog-reference extraction results cascade with auth account');

create function public.kd_blog_reference_extract_own_data(p_account_id uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'operationId',operation_id,'contractVersion',contract_version,'modelAlias',model_alias,
    'promptVersion',prompt_version,'resultVersion',result_version,'status',status,
    'result',result,'createdAt',created_at,'finishedAt',finished_at,'expiresAt',expires_at)
    order by created_at,extraction_id),'[]'::jsonb)
  from public.kd_blog_reference_extractions where account_id=p_account_id
$$;
revoke all on function public.kd_blog_reference_extract_own_data(uuid)
  from public,anon,authenticated;
grant execute on function public.kd_blog_reference_extract_own_data(uuid) to service_role;

revoke all on function public.kd_blog_reference_extract_capability_v1(),
  public.kd_blog_reference_extract_prepare_v1(uuid,uuid,text,text,text,text,text,numeric),
  public.kd_blog_reference_extract_provider_started_v1(uuid,uuid),
  public.kd_blog_reference_extract_cancel_v1(uuid,uuid),
  public.kd_blog_reference_extract_finish_v1(uuid,uuid,boolean,jsonb),
  public.kd_blog_reference_extract_purge_v1(integer)
  from public,anon,authenticated;
grant execute on function public.kd_blog_reference_extract_capability_v1(),
  public.kd_blog_reference_extract_prepare_v1(uuid,uuid,text,text,text,text,text,numeric),
  public.kd_blog_reference_extract_provider_started_v1(uuid,uuid),
  public.kd_blog_reference_extract_cancel_v1(uuid,uuid),
  public.kd_blog_reference_extract_finish_v1(uuid,uuid,boolean,jsonb),
  public.kd_blog_reference_extract_purge_v1(integer)
  to service_role;

do $$
declare v_job bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('cron.unschedule(bigint)') is null then
    raise exception 'blog_reference_extract_requires_pg_cron';
  end if;
  for v_job in execute 'select jobid from cron.job where jobname=$1'
    using 'kd-blog-reference-extract-purge-v1'
  loop
    execute 'select cron.unschedule($1)' using v_job;
  end loop;
  execute 'select cron.schedule($1,$2,$3)' using
    'kd-blog-reference-extract-purge-v1','17 * * * *',
    'select public.kd_blog_reference_extract_purge_v1(200);';
end
$$;

notify pgrst,'reload schema';
commit;
