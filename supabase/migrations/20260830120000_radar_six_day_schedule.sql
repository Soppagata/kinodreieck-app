-- Kinodreieck · Radar · automatische Pruefung im 144-Stunden-Intervall
-- =============================================================================
-- Additive Forward-Migration auf dem vorhandenen Daily-Claim. Der Scheduler
-- darf weiterhin taeglich ticken; claimbar sind nur faellige aktive
-- serverbestaetigte Konto/Ziel-Abos. Ein terminaler Versuch verschiebt die
-- naechste Faelligkeit exakt um 144 Stunden. Der vorhandene Tageszaun, die
-- Lease, das Fencing und alle Kostenzaeune bleiben unveraendert im selben
-- Runner-/Providerpfad; es gibt keinen Retry.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.kd_radar_subscriptions') is null
     or to_regclass('public.kd_radar_daily_runs') is null
     or to_regprocedure('public.kd_radar_daily_claim()') is null
     or to_regprocedure('public.kd_radar_daily_assert_lease(uuid,uuid,date,uuid)') is null
     or to_regprocedure('public.kd_radar_daily_finish(uuid,uuid,date,uuid,text)') is null then
    raise exception 'Radar 144h scheduler Baseline fehlt';
  end if;
end
$$;

alter table public.kd_radar_subscriptions
  add column next_check_at timestamptz not null default clock_timestamp();

create index kd_radar_subscriptions_due
  on public.kd_radar_subscriptions (next_check_at, account_id, target_id)
  where subscription_status = 'active';

comment on column public.kd_radar_subscriptions.next_check_at is
  'Naechste serverseitige Radar-Faelligkeit; nach jedem terminalen Versuch exakt Abschlusszeit plus 144 Stunden.';

create or replace function public.kd_radar_daily_claim()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_account_id uuid;
  v_target_id uuid;
  v_target_key text;
  v_target_type text;
  v_target_text text;
  v_fence_token uuid := gen_random_uuid();
  v_radar_aktiv boolean;
  v_provider_aktiv boolean;
  v_scheduler_aktiv boolean;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('claim',false,'status','forbidden','viennaDay',v_today);
  end if;

  select radar_aktiv, radar_provider_aktiv, radar_scheduler_aktiv
    into v_radar_aktiv, v_provider_aktiv, v_scheduler_aktiv
    from public.kd_radar_settings
   where singleton
   for key share;
  if not found
     or v_radar_aktiv is distinct from true
     or v_provider_aktiv is distinct from true
     or v_scheduler_aktiv is distinct from true then
    return jsonb_build_object('claim',false,'status','disabled','viennaDay',v_today);
  end if;

  -- Abgelaufene Leases bleiben verbraucht. Erst ihr terminaler Timeout setzt
  -- dieselbe Konto/Ziel-Subscription wieder auf exakt 144 Stunden spaeter.
  with expired as (
    update public.kd_radar_daily_runs
       set worker_status = 'failed', safe_status = 'timeout',
           terminal_at = v_now, updated_at = v_now
     where worker_status = 'leased' and lease_expires_at < v_now
    returning account_id, target_id, terminal_at
  )
  update public.kd_radar_subscriptions subscription
     set next_check_at = expired.terminal_at + interval '144 hours'
    from expired
   where subscription.account_id = expired.account_id
     and subscription.target_id = expired.target_id;

  select subscription.account_id, subscription.target_id,
         target.target_key, target.target_type,
         case when target.target_type = 'text' then target.canonical_title else null end
    into v_account_id, v_target_id, v_target_key, v_target_type, v_target_text
    from public.kd_radar_subscriptions subscription
    join public.kd_account_access access
      on access.account_id = subscription.account_id
    join public.kd_radar_capabilities capability
      on capability.account_id = subscription.account_id
    join public.kd_radar_targets target
      on target.target_id = subscription.target_id
   where access.active and access.personal_ai
     and capability.radar_pilot and capability.radar_review
     and subscription.subscription_status = 'active'
     and subscription.region = 'AT'
     and subscription.next_check_at <= v_now
     and target.target_status = 'active'
     and target.target_key !~* '^(fixture|synthetic):'
     and (
       (target.target_type in ('work','series')
        and not (target.target_type = 'series' and subscription.scope = 'cinema')
        and subscription.person_external_id is null
        and subscription.person_role is null)
       or
       (target.target_type = 'person' and subscription.scope = 'all'
        and subscription.person_external_id = target.external_ids ->> 'personExternalId'
        and subscription.person_role = target.external_ids ->> 'personRole'
        and target.target_key = 'person:' || subscription.person_external_id || ':' || subscription.person_role
        and public.kd_radar_person_target_metadata_valid(
          target.target_key, target.canonical_title, target.external_ids
        ))
       or
       (target.target_type = 'franchise' and subscription.scope = 'all'
        and subscription.person_external_id is null
        and subscription.person_role is null
        and target.target_key ~ '^title-group:v1:'
        and public.kd_radar_title_group_metadata_valid(
          target.target_key, target.canonical_title, target.external_ids -> 'titleGroup'
        ))
       or
       (target.target_type = 'text' and subscription.scope = 'all'
        and subscription.person_external_id is null
        and subscription.person_role is null
        and target.target_key = public.kd_radar_text_target_key(target.canonical_title)
        and target.external_ids ->> 'targetText' = target.canonical_title
        and target.external_ids ->> 'contractVersion' = 'radar-text-v1'
        and jsonb_typeof(target.external_ids -> 'resolvedTargets') = 'array')
     )
     and not exists (
       select 1
         from public.kd_radar_daily_runs active_run
        where active_run.account_id = subscription.account_id
          and active_run.target_id = subscription.target_id
          and active_run.worker_status = 'leased'
          and active_run.lease_expires_at >= v_now
     )
     and not exists (
       select 1
         from public.kd_radar_daily_runs run
        where run.account_id = subscription.account_id
          and run.target_id = subscription.target_id
          and run.vienna_day = v_today
     )
   order by subscription.next_check_at, subscription.updated_at,
      subscription.account_id, subscription.target_id
   for update of subscription skip locked
   limit 1;

  if not found then
    return jsonb_build_object('claim',false,'status','idle','viennaDay',v_today);
  end if;

  insert into public.kd_radar_daily_runs (
    account_id, target_id, vienna_day, fence_token,
    worker_status, safe_status, claimed_at, lease_expires_at, updated_at
  ) values (
    v_account_id, v_target_id, v_today, v_fence_token,
    'leased', 'attempt_consumed', v_now, v_now + interval '180 seconds', v_now
  ) on conflict (account_id, target_id, vienna_day) do nothing;
  if not found then
    return jsonb_build_object('claim',false,'status','idle','viennaDay',v_today);
  end if;

  return jsonb_build_object(
    'claim',true,
    'status','claimed',
    'accountId',v_account_id,
    'targetRowId',v_target_id,
    'targetId',v_target_key,
    'targetType',v_target_type,
    'targetText',v_target_text,
    'viennaDay',v_today,
    'fenceToken',v_fence_token
  );
end
$$;

create or replace function public.kd_radar_daily_finish(
  p_account_id uuid,
  p_target_id uuid,
  p_vienna_day date,
  p_fence_token uuid,
  p_safe_status text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_worker_status text;
begin
  if auth.role() is distinct from 'service_role'
     or p_account_id is null or p_target_id is null
     or p_vienna_day is null or p_fence_token is null
     or p_safe_status is null or p_safe_status not in (
       'confirmed','no_change','insufficient_evidence','provider_error',
       'storage_error','forbidden','unavailable'
     ) then
    return jsonb_build_object('ok',false,'status','forbidden');
  end if;

  update public.kd_radar_daily_runs
     set worker_status = 'failed', safe_status = 'timeout',
         terminal_at = v_now, updated_at = v_now
   where account_id = p_account_id and target_id = p_target_id
     and vienna_day = p_vienna_day and fence_token = p_fence_token
     and worker_status = 'leased' and lease_expires_at < v_now;
  if found then
    update public.kd_radar_subscriptions
       set next_check_at = v_now + interval '144 hours'
     where account_id = p_account_id and target_id = p_target_id;
    return jsonb_build_object('ok',true,'status','failed');
  end if;

  v_worker_status := case when p_safe_status in (
    'confirmed','no_change','insufficient_evidence'
  ) then 'completed' else 'failed' end;
  update public.kd_radar_daily_runs
     set worker_status = v_worker_status, safe_status = p_safe_status,
         terminal_at = v_now, updated_at = v_now
   where account_id = p_account_id and target_id = p_target_id
     and vienna_day = p_vienna_day and fence_token = p_fence_token
     and worker_status = 'leased' and lease_expires_at >= v_now;
  if not found then
    return jsonb_build_object('ok',false,'status','state_invalid');
  end if;

  update public.kd_radar_subscriptions
     set next_check_at = v_now + interval '144 hours'
   where account_id = p_account_id and target_id = p_target_id;
  return jsonb_build_object('ok',true,'status',v_worker_status);
end
$$;

revoke all on function public.kd_radar_daily_claim()
  from public, anon, authenticated;
revoke all on function public.kd_radar_daily_finish(uuid,uuid,date,uuid,text)
  from public, anon, authenticated;
grant execute on function public.kd_radar_daily_claim() to service_role;
grant execute on function public.kd_radar_daily_finish(uuid,uuid,date,uuid,text)
  to service_role;

comment on function public.kd_radar_daily_claim() is
  'Claimt atomar hoechstens ein faelliges aktives AT-Konto/Ziel-Abo; Scheduler-Ticks zwischen den 144h bleiben idle.';
comment on function public.kd_radar_daily_finish(uuid,uuid,date,uuid,text) is
  'Schliesst den gefenceten Versuch terminal ab und setzt dessen naechste Konto/Ziel-Faelligkeit auf Abschluss plus 144 Stunden.';

commit;
