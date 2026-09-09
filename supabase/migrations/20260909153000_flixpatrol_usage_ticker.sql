begin;

create table public.kd_flixpatrol_usage_state (
  singleton            boolean primary key default true check (singleton),
  plan_limit           integer not null default 1000 check (plan_limit = 1000),
  attempted_requests   bigint not null default 0 check (attempted_requests >= 0),
  completed_requests   bigint not null default 0 check (completed_requests >= 0),
  successful_requests  bigint not null default 0 check (successful_requests >= 0),
  failed_requests      bigint not null default 0 check (failed_requests >= 0),
  last_status          text not null default 'empty'
                       check (last_status in ('empty','claimed','succeeded','http_error','invalid_response','transport_error')),
  last_attempt_at      timestamptz,
  last_success_at      timestamptz,
  quota_used           integer,
  quota_available      integer,
  quota_limit          integer,
  quota_limit_extra    integer,
  quota_reset_at       text,
  quota_observed_at    timestamptz,
  updated_at           timestamptz not null default now(),
  constraint kd_flixpatrol_usage_counts_check check (
    completed_requests = successful_requests + failed_requests
    and attempted_requests >= completed_requests
  ),
  constraint kd_flixpatrol_usage_quota_check check (
    (quota_observed_at is null and quota_used is null and quota_available is null
      and quota_limit is null and quota_limit_extra is null and quota_reset_at is null)
    or
    (quota_observed_at is not null and quota_used >= 0 and quota_available >= 0
      and quota_limit > 0 and quota_limit_extra >= 0
      and quota_reset_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$')
  )
);

insert into public.kd_flixpatrol_usage_state (singleton) values (true);

create table public.kd_flixpatrol_usage_operations (
  operation_id  uuid primary key,
  request_kind  text not null check (request_kind = 'quota'),
  status        text not null default 'claimed'
                check (status in ('claimed','succeeded','http_error','invalid_response','transport_error')),
  http_status   integer check (http_status is null or http_status between 100 and 599),
  claimed_at    timestamptz not null default now(),
  finished_at   timestamptz,
  updated_at    timestamptz not null default now(),
  constraint kd_flixpatrol_usage_operation_terminal_check check (
    (status = 'claimed' and http_status is null and finished_at is null)
    or (status = 'transport_error' and http_status is null and finished_at is not null)
    or (status in ('succeeded','invalid_response') and http_status between 200 and 299 and finished_at is not null)
    or (status = 'http_error' and http_status between 100 and 599
      and not (http_status between 200 and 299) and finished_at is not null)
  ),
  constraint kd_flixpatrol_usage_operation_time_check check (
    updated_at >= claimed_at and (finished_at is null or finished_at >= claimed_at)
  )
);

comment on table public.kd_flixpatrol_usage_state is
  'Provider-Quota-Snapshot und getrennte eigene Requestzaehler; keine Addition beider Werte und kein Kosten-Gate.';
comment on table public.kd_flixpatrol_usage_operations is
  'Payloadfreies Idempotenzledger fuer begonnene FlixPatrol-Providerrequests.';

alter table public.kd_flixpatrol_usage_state enable row level security;
alter table public.kd_flixpatrol_usage_state force row level security;
alter table public.kd_flixpatrol_usage_operations enable row level security;
alter table public.kd_flixpatrol_usage_operations force row level security;

revoke all on table public.kd_flixpatrol_usage_state from public, anon, authenticated, service_role;
revoke all on table public.kd_flixpatrol_usage_operations from public, anon, authenticated, service_role;
grant select on table public.kd_flixpatrol_usage_state to service_role;
grant select on table public.kd_flixpatrol_usage_operations to service_role;

create function public.kd_flixpatrol_usage_status_internal()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'attemptedRequests', s.attempted_requests,
    'completedRequests', s.completed_requests,
    'successfulRequests', s.successful_requests,
    'failedRequests', s.failed_requests,
    'lastStatus', s.last_status,
    'lastAttemptAt', s.last_attempt_at,
    'lastSuccessAt', s.last_success_at,
    'planLimit', s.plan_limit,
    'quota', case when s.quota_observed_at is null then null else jsonb_build_object(
      'used', s.quota_used,
      'available', s.quota_available,
      'limit', s.quota_limit,
      'limitExtra', s.quota_limit_extra,
      'resetAt', s.quota_reset_at,
      'observedAt', s.quota_observed_at
    ) end
  )
  from public.kd_flixpatrol_usage_state s
  where s.singleton
$$;

create function public.kd_flixpatrol_usage_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  return public.kd_flixpatrol_usage_status_internal();
end
$$;

create function public.kd_flixpatrol_usage_begin(
  p_operation_id uuid,
  p_request_kind text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_inserted boolean := false;
  v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_operation_id is null or p_request_kind is distinct from 'quota' then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  insert into public.kd_flixpatrol_usage_operations (
    operation_id, request_kind, status, claimed_at, updated_at
  ) values (
    p_operation_id, p_request_kind, 'claimed', v_now, v_now
  ) on conflict (operation_id) do nothing;
  v_inserted := found;

  if not v_inserted then
    select operation.status into v_status
      from public.kd_flixpatrol_usage_operations operation
     where operation.operation_id = p_operation_id;
    return jsonb_build_object(
      'ok',true,'claim',false,'replay',true,'status',coalesce(v_status,'unknown')
    );
  end if;

  update public.kd_flixpatrol_usage_state
     set attempted_requests = attempted_requests + 1,
         last_status = 'claimed',
         last_attempt_at = v_now,
         updated_at = v_now
   where singleton;

  return jsonb_build_object('ok',true,'claim',true,'replay',false,'status','claimed');
end
$$;

create function public.kd_flixpatrol_usage_finish(
  p_operation_id uuid,
  p_status text,
  p_http_status integer,
  p_quota jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_operation public.kd_flixpatrol_usage_operations%rowtype;
  v_quota_valid boolean := false;
  v_quota_keys text[];
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_operation_id is null
     or p_status is null
     or p_status not in ('succeeded','http_error','invalid_response','transport_error')
     or (p_status = 'transport_error' and p_http_status is not null)
     or (p_status in ('succeeded','invalid_response')
       and (p_http_status is null or p_http_status not between 200 and 299))
     or (p_status = 'http_error' and (p_http_status is null
       or p_http_status not between 100 and 599 or p_http_status between 200 and 299)) then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  if p_status = 'succeeded' then
    if jsonb_typeof(p_quota) = 'object' then
      select array_agg(key order by key) into v_quota_keys
        from jsonb_object_keys(p_quota) key;
      if v_quota_keys = array['available','limit','limitExtra','resetAt','used']::text[]
         and (p_quota->>'used') ~ '^\d+$'
         and (p_quota->>'available') ~ '^\d+$'
         and (p_quota->>'limit') ~ '^[1-9]\d*$'
         and (p_quota->>'limitExtra') ~ '^\d+$'
         and (p_quota->>'resetAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$' then
        v_quota_valid := (p_quota->>'used')::numeric <= 2147483647
          and (p_quota->>'available')::numeric <= 2147483647
          and (p_quota->>'limit')::numeric <= 2147483647
          and (p_quota->>'limitExtra')::numeric <= 2147483647;
      end if;
    end if;
    if not coalesce(v_quota_valid,false) then
      return jsonb_build_object('ok',false,'code','invalid-quota');
    end if;
  elsif p_quota is not null then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  select operation.* into v_operation
    from public.kd_flixpatrol_usage_operations operation
   where operation.operation_id = p_operation_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','operation-not-found');
  end if;
  if v_operation.status <> 'claimed' then
    return jsonb_build_object(
      'ok',true,'replay',true,'status',v_operation.status,
      'usage',public.kd_flixpatrol_usage_status_internal()
    );
  end if;

  update public.kd_flixpatrol_usage_operations
     set status = p_status, http_status = p_http_status,
         finished_at = v_now, updated_at = v_now
   where operation_id = p_operation_id;

  update public.kd_flixpatrol_usage_state
     set completed_requests = completed_requests + 1,
         successful_requests = successful_requests + case when p_status = 'succeeded' then 1 else 0 end,
         failed_requests = failed_requests + case when p_status = 'succeeded' then 0 else 1 end,
         last_status = p_status,
         last_success_at = case when p_status = 'succeeded' then v_now else last_success_at end,
         quota_used = case when p_status = 'succeeded' then (p_quota->>'used')::integer else quota_used end,
         quota_available = case when p_status = 'succeeded' then (p_quota->>'available')::integer else quota_available end,
         quota_limit = case when p_status = 'succeeded' then (p_quota->>'limit')::integer else quota_limit end,
         quota_limit_extra = case when p_status = 'succeeded' then (p_quota->>'limitExtra')::integer else quota_limit_extra end,
         quota_reset_at = case when p_status = 'succeeded' then p_quota->>'resetAt' else quota_reset_at end,
         quota_observed_at = case when p_status = 'succeeded' then v_now else quota_observed_at end,
         updated_at = v_now
   where singleton;

  return jsonb_build_object(
    'ok',true,'replay',false,'status',p_status,
    'usage',public.kd_flixpatrol_usage_status_internal()
  );
end
$$;

revoke all on function public.kd_flixpatrol_usage_status_internal() from public, anon, authenticated, service_role;
revoke all on function public.kd_flixpatrol_usage_status() from public, anon, authenticated;
revoke all on function public.kd_flixpatrol_usage_begin(uuid,text) from public, anon, authenticated;
revoke all on function public.kd_flixpatrol_usage_finish(uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.kd_flixpatrol_usage_status() to service_role;
grant execute on function public.kd_flixpatrol_usage_begin(uuid,text) to service_role;
grant execute on function public.kd_flixpatrol_usage_finish(uuid,text,integer,jsonb) to service_role;

comment on function public.kd_flixpatrol_usage_begin(uuid,text) is
  'Zaehlt jeden neuen Providerrequest atomar vor dem Netzaufruf; gleiche Operationen werden nicht doppelt gezaehlt.';
comment on function public.kd_flixpatrol_usage_finish(uuid,text,integer,jsonb) is
  'Finalisiert jede Operation genau einmal; nur ein valider Erfolg ersetzt den letzten Provider-Quota-Snapshot.';

commit;
