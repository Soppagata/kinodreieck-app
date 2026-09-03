-- Kinodreieck · Radar · exakte Bindung des einmaligen +6h-Retry
-- =============================================================================
-- Diese additive Migration gibt dem internen Radar-Worker nur den bereits im
-- service-only Retry-Ledger gebundenen Konto-/Zielkontext. Weder HTTP-Header
-- noch ein Request-Body koennen Konto oder Ziel bestimmen. Die zwei separaten
-- Assertions schuetzen Kostenreservierung und Ergebniswrite; der abschliessende
-- Beleg akzeptiert nur die exakt gebundene, erfolgreich finalisierte AI-Logzeile.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.kd_automatic_ai_retry_jobs') is null
     or to_regclass('public.kd_radar_daily_runs') is null
     or to_regclass('public.kd_radar_targets') is null
     or to_regclass('public.kd_radar_subscriptions') is null
     or to_regclass('public.kd_radar_settings') is null
     or to_regclass('public.kd_radar_capabilities') is null
     or to_regclass('public.kd_account_access') is null
     or to_regclass('public.kd_ai_log') is null
     or to_regprocedure('auth.role()') is null
     or to_regprocedure('public.kd_private_provider_allowed(text)') is null
     or to_regprocedure('public.kd_radar_websearch_context(uuid,text)') is null
     or to_regprocedure('public.kd_radar_text_target_key(text)') is null then
    raise exception 'Radar automatic retry binding baseline missing'
      using errcode = '55000';
  end if;
  if not coalesce((
    select relrowsecurity
      from pg_catalog.pg_class
     where oid = 'public.kd_automatic_ai_retry_jobs'::regclass
  ), false) then
    raise exception 'Radar automatic retry ledger RLS missing'
      using errcode = '55000';
  end if;
end
$$;

create function public.kd_radar_automatic_retry_context(
  p_logical_job_id uuid,
  p_retry_provider_operation_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id       uuid;
  v_target_row_id    uuid;
  v_target_key       text;
  v_target_type      text;
  v_target_text      text;
  v_radar_vienna_day date;
  v_request           jsonb;
  v_provider          jsonb;
begin
  if auth.role() is distinct from 'service_role'
     or p_logical_job_id is null
     or p_retry_provider_operation_id is null then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;

  v_provider := public.kd_private_provider_allowed('anthropic');
  if v_provider is null
     or v_provider -> 'ok' is distinct from 'true'::jsonb
     or v_provider ->> 'code' is distinct from 'PROVIDER_ALLOWED' then
    return jsonb_build_object('ok',false,'code','unavailable');
  end if;

  select job.account_id, job.target_id, target.target_key,
         target.target_type,
         case when target.target_type = 'text'
           then target.canonical_title else null end,
         job.radar_vienna_day
    into v_account_id, v_target_row_id, v_target_key,
         v_target_type, v_target_text, v_radar_vienna_day
    from public.kd_automatic_ai_retry_jobs job
    join public.kd_radar_daily_runs run
      on run.account_id = job.account_id
     and run.target_id = job.target_id
     and run.vienna_day = job.radar_vienna_day
    join public.kd_account_access access
      on access.account_id = job.account_id
    join public.kd_radar_capabilities capability
      on capability.account_id = job.account_id
    join public.kd_radar_subscriptions subscription
      on subscription.account_id = job.account_id
     and subscription.target_id = job.target_id
    join public.kd_radar_targets target
      on target.target_id = job.target_id
    join public.kd_radar_settings settings
      on settings.singleton
   where job.logical_job_id = p_logical_job_id
     and job.task_id = 'radar-websearch-task'
     and job.trigger_source = 'scheduled'
     and job.initial_evidence_status = 'retry-required'
     and job.retry_consumed is true
     and job.retry_status = 'claimed'
     and job.retry_provider_operation_id = p_retry_provider_operation_id
     and job.check_claimed_at is not null
     and job.retry_finished_at is null
     and job.mail_status = 'not-required'
     and job.mail_operation_id is null
     and access.active and access.personal_ai
     and capability.radar_pilot and capability.radar_review
     and subscription.subscription_status = 'active'
     and subscription.region = 'AT'
     and target.target_status = 'active'
     and target.target_key !~* '^(fixture|synthetic):'
     and settings.radar_aktiv
     and settings.radar_provider_aktiv
     and settings.radar_scheduler_aktiv
     and (
       (target.target_type in ('work','series')
        and not (target.target_type = 'series' and subscription.scope = 'cinema')
        and subscription.person_external_id is null
        and subscription.person_role is null)
       or
       (target.target_type = 'person' and subscription.scope = 'all'
        and subscription.person_external_id = target.external_ids ->> 'personExternalId'
        and subscription.person_role = target.external_ids ->> 'personRole')
       or
       (target.target_type = 'franchise' and subscription.scope = 'all'
        and subscription.person_external_id is null
        and subscription.person_role is null
        and target.target_key ~ '^title-group:v1:')
       or
       (target.target_type = 'text' and subscription.scope = 'all'
        and subscription.person_external_id is null
        and subscription.person_role is null
        and target.target_key = public.kd_radar_text_target_key(target.canonical_title)
        and target.external_ids ->> 'targetText' = target.canonical_title
        and target.external_ids ->> 'contractVersion' = 'radar-text-v1'
        and jsonb_typeof(target.external_ids -> 'resolvedTargets') = 'array')
     );

  if not found then
    return jsonb_build_object('ok',false,'code','unavailable');
  end if;

  if v_target_type = 'text' then
    v_request := jsonb_build_object(
      'kind','text',
      'targetId',v_target_key,
      'targetText',v_target_text,
      'region','AT',
      'scopes',jsonb_build_array(
        'cinema','streaming','series_start','season_start'
      )
    );
  else
    begin
      v_request := public.kd_radar_websearch_context(v_account_id, v_target_key);
    exception
      when others then
        return jsonb_build_object('ok',false,'code','unavailable');
    end;
  end if;

  -- Zeitfenster bleiben an den unveraenderlichen Wiener Tagesrun gebunden,
  -- auch wenn der +6h-Check ueber Mitternacht faellt.
  if v_request ->> 'kind' = 'person' then
    v_request := jsonb_set(
      jsonb_set(v_request, '{windowStart}', to_jsonb(v_radar_vienna_day::text), false),
      '{windowEnd}', to_jsonb((v_radar_vienna_day + 6)::text), false
    );
    if v_request ->> 'windowStart' is distinct from v_radar_vienna_day::text
       or v_request ->> 'windowEnd' is distinct from (v_radar_vienna_day + 6)::text then
      return jsonb_build_object('ok',false,'code','unavailable');
    end if;
  elsif v_request ->> 'kind' = 'title_group'
        and v_request ->> 'discoveryMode' = 'canonical-group-v1' then
    v_request := jsonb_set(
      jsonb_set(v_request, '{windowStart}', to_jsonb((v_radar_vienna_day - 30)::text), false),
      '{windowEnd}', to_jsonb((v_radar_vienna_day + 14)::text), false
    );
    if v_request ->> 'windowStart' is distinct from (v_radar_vienna_day - 30)::text
       or v_request ->> 'windowEnd' is distinct from (v_radar_vienna_day + 14)::text then
      return jsonb_build_object('ok',false,'code','unavailable');
    end if;
  end if;

  if v_request is null
     or v_request ->> 'targetId' is distinct from v_target_key then
    return jsonb_build_object('ok',false,'code','unavailable');
  end if;

  return jsonb_build_object(
    'ok',true,
    'code','retry-bound',
    'logicalJobId',p_logical_job_id,
    'retryProviderOperationId',p_retry_provider_operation_id,
    'accountId',v_account_id,
    'targetRowId',v_target_row_id,
    'radarViennaDay',v_radar_vienna_day,
    'targetId',v_target_key,
    'targetText',v_target_text,
    'request',v_request
  );
end
$$;

create function public.kd_radar_automatic_retry_assert(
  p_logical_job_id uuid,
  p_retry_provider_operation_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_valid boolean := false;
begin
  if auth.role() is distinct from 'service_role'
     or p_logical_job_id is null
     or p_retry_provider_operation_id is null then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;

  select exists (
    select 1
      from public.kd_automatic_ai_retry_jobs job
     where job.logical_job_id = p_logical_job_id
       and job.task_id = 'radar-websearch-task'
       and job.trigger_source = 'scheduled'
       and job.initial_evidence_status = 'retry-required'
       and job.retry_consumed is true
       and job.retry_status = 'claimed'
       and job.retry_provider_operation_id = p_retry_provider_operation_id
       and job.check_claimed_at is not null
       and job.retry_finished_at is null
       and job.mail_status = 'not-required'
       and job.mail_operation_id is null
       and job.mail_claimed_at is null
       and job.mail_finished_at is null
  ) into v_valid;

  return case when v_valid then
    jsonb_build_object('ok',true,'code','retry-claimed')
  else
    jsonb_build_object('ok',false,'code','unavailable')
  end;
end
$$;

create function public.kd_radar_automatic_retry_result_proven(
  p_logical_job_id uuid,
  p_retry_provider_operation_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_proven boolean := false;
begin
  if auth.role() is distinct from 'service_role'
     or p_logical_job_id is null
     or p_retry_provider_operation_id is null then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;

  select exists (
    select 1
      from public.kd_automatic_ai_retry_jobs job
      join public.kd_ai_log log
        on log.account_id = job.account_id
       and log.vorgang_id = job.retry_provider_operation_id
       and log.task = 'radar-websearch'
     where job.logical_job_id = p_logical_job_id
       and job.task_id = 'radar-websearch-task'
       and job.trigger_source = 'scheduled'
       and job.initial_evidence_status = 'retry-required'
       and job.retry_consumed is true
       and job.retry_status = 'claimed'
       and job.retry_provider_operation_id = p_retry_provider_operation_id
       and job.retry_finished_at is null
       and log.gestartet_at >= job.check_claimed_at
       and log.status = 'fertig'
       and log.beendet_at is not null
       and log.beendet_at >= log.gestartet_at
       and log.kosten_usd_cent > 0
       and log.input_tokens is not null and log.input_tokens >= 0
       and log.output_tokens is not null and log.output_tokens >= 0
  ) into v_proven;

  return case when v_proven then
    jsonb_build_object('ok',true,'code','retry-succeeded')
  else
    jsonb_build_object('ok',false,'code','unproven')
  end;
end
$$;

revoke all on function public.kd_radar_automatic_retry_context(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.kd_radar_automatic_retry_assert(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.kd_radar_automatic_retry_result_proven(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.kd_radar_automatic_retry_context(uuid,uuid)
  to service_role;
grant execute on function public.kd_radar_automatic_retry_assert(uuid,uuid)
  to service_role;
grant execute on function public.kd_radar_automatic_retry_result_proven(uuid,uuid)
  to service_role;

comment on function public.kd_radar_automatic_retry_context(uuid,uuid) is
  'Laedt service-only den Konto-/Ziel-/Requestkontext ausschliesslich aus dem exakt geclaimten Ledger-Retry; HTTP darf ihn nicht frei bestimmen.';
comment on function public.kd_radar_automatic_retry_assert(uuid,uuid) is
  'Fail-closed Fencing-Assertion fuer denselben noch geclaimten Retry unmittelbar vor Kostenreservierung und Ergebniswrite.';
comment on function public.kd_radar_automatic_retry_result_proven(uuid,uuid) is
  'Belegt Erfolg nur durch die exakt gebundene terminale kd_ai_log-Operation mit positiver Kosten- und vollstaendiger Usage-Evidenz.';

notify pgrst, 'reload schema';

commit;
