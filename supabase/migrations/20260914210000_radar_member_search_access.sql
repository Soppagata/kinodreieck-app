-- Kinodreieck · Radar · normale Suche von Reviewrechten trennen
-- ============================================================================
-- Die normale Suchberechtigung besteht aus active + personal_ai + radar_pilot.
-- radar_review bleibt ausschliesslich fuer manuelle globale Review-/Importwege.
-- Kontowerte, Kosten- und Mengengrenzen werden von dieser Migration nicht
-- geaendert; die Freigabe konkreter Konten bleibt eine getrennte Operation.

begin;

create function public.kd_radar_search_allowed(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_account_id is not null and coalesce((
    select access.active and access.personal_ai and capability.radar_pilot
      from public.kd_account_access access
      join public.kd_radar_capabilities capability
        on capability.account_id = access.account_id
     where access.account_id = p_account_id
  ), false)
$$;

revoke all on function public.kd_radar_search_allowed(uuid)
  from public, anon, authenticated;
grant execute on function public.kd_radar_search_allowed(uuid)
  to service_role;

/* Nur die ungewollte radar_review-Kopplung wird entfernt. Jede Definition
   wird vor dem atomaren Patch exakt gezaehlt; Drift bricht die Migration ab. */
do $patch_search_functions$
declare
  v_signature regprocedure;
  v_definition text;
  v_pattern text := 'and a\.active and a\.personal_ai\s+and c\.radar_pilot and c\.radar_review';
  v_signatures regprocedure[] := array[
    'public.kd_radar_websearch_context(uuid,text)'::regprocedure,
    'public.kd_radar_websearch_upsert_event(uuid,uuid,jsonb)'::regprocedure,
    'public.kd_radar_websearch_upsert_person_event(uuid,uuid,jsonb)'::regprocedure,
    'public.kd_radar_websearch_upsert_title_group_event(uuid,uuid,jsonb)'::regprocedure,
    'public.kd_radar_websearch_upsert_title_group_discovery_event(uuid,uuid,jsonb)'::regprocedure,
    'public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer)'::regprocedure
  ];
begin
  foreach v_signature in array v_signatures loop
    select pg_get_functiondef(v_signature) into v_definition;
    if regexp_count(v_definition, v_pattern, 1, 'n') <> 1 then
      raise exception 'radar_search_definition_drift: %', v_signature;
    end if;
    v_definition := regexp_replace(
      v_definition,
      v_pattern,
      'and public.kd_radar_search_allowed(p_account_id)',
      'n'
    );
    execute v_definition;
  end loop;
end
$patch_search_functions$;

do $patch_text_prepare$
declare
  v_definition text;
  v_pattern text := 'and a\.active and a\.personal_ai\s+and c\.radar_pilot and c\.radar_review';
begin
  select pg_get_functiondef(
    'public.kd_radar_websearch_prepare_text(uuid,text,text,uuid)'::regprocedure
  ) into v_definition;
  if regexp_count(v_definition, v_pattern, 1, 'n') <> 1 then
    raise exception 'radar_text_search_definition_drift';
  end if;
  v_definition := regexp_replace(
    v_definition,
    v_pattern,
    'and public.kd_radar_search_allowed(p_account_id)',
    'n'
  );
  execute v_definition;
end
$patch_text_prepare$;

do $patch_scheduler$
declare
  v_definition text;
  v_pattern text := 'access\.active and access\.personal_ai\s+and capability\.radar_pilot and capability\.radar_review';
begin
  select pg_get_functiondef('public.kd_radar_daily_claim()'::regprocedure)
    into v_definition;
  if regexp_count(v_definition, v_pattern, 1, 'n') <> 1 then
    raise exception 'radar_scheduler_search_definition_drift';
  end if;
  v_definition := regexp_replace(
    v_definition,
    v_pattern,
    'public.kd_radar_search_allowed(subscription.account_id)',
    'n'
  );
  execute v_definition;
end
$patch_scheduler$;

do $patch_retry_context$
declare
  v_definition text;
  v_pattern text := 'access\.active and access\.personal_ai\s+and capability\.radar_pilot and capability\.radar_review';
begin
  select pg_get_functiondef(
    'public.kd_radar_automatic_retry_context(uuid,uuid)'::regprocedure
  ) into v_definition;
  if regexp_count(v_definition, v_pattern, 1, 'n') <> 1 then
    raise exception 'radar_retry_search_definition_drift';
  end if;
  v_definition := regexp_replace(
    v_definition,
    v_pattern,
    'public.kd_radar_search_allowed(job.account_id)',
    'n'
  );
  execute v_definition;
end
$patch_retry_context$;

create or replace function public.kd_radar_automatic_retry_assert(
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
       and public.kd_radar_search_allowed(job.account_id)
  ) into v_valid;

  return case when v_valid then
    jsonb_build_object('ok',true,'code','retry-claimed')
  else
    jsonb_build_object('ok',false,'code','unavailable')
  end;
end
$$;

revoke all on function public.kd_radar_automatic_retry_assert(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.kd_radar_automatic_retry_assert(uuid,uuid)
  to service_role;

/* Nur der neue, namentlich getrennte RPC attestiert radarSearch. Die bereits
   produktiven Ein- und Zwei-Argument-Signaturen bleiben fuer installierte
   alte PWAs bytegenau unveraendert. */
create function public.kd_radar_pilot_feed_search_access(
  p_operation_ids uuid[], p_include_search_status boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_feed jsonb;
  v_search_statuses jsonb;
begin
  v_feed := public.kd_radar_pilot_feed(p_operation_ids,p_include_search_status);
  if p_include_search_status is distinct from true then
    return v_feed || jsonb_build_object(
      'radarSearch',public.kd_radar_search_allowed(auth.uid())
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'targetId',target.target_key,
    'status',case when run.claimed_at is null then 'never'
      when run.worker_status='leased' then
        case when run.lease_expires_at > now() then 'searching' else 'timeout' end
      else run.safe_status end,
    'checkedAt',case when run.worker_status='leased' and run.lease_expires_at <= now()
      then run.lease_expires_at else coalesce(run.terminal_at,run.claimed_at) end
  ) order by target.target_key),'[]'::jsonb) into v_search_statuses
    from public.kd_radar_subscriptions subscription
    join public.kd_radar_targets target on target.target_id=subscription.target_id
    left join lateral (
      select history.claimed_at,history.worker_status,history.safe_status,
             history.lease_expires_at,history.terminal_at
        from public.kd_radar_daily_runs history
       where history.account_id=auth.uid()
         and history.target_id=subscription.target_id
       order by history.claimed_at desc,history.vienna_day desc
       limit 1
    ) run on true
   where subscription.account_id=auth.uid()
     and exists (
       select 1 from jsonb_array_elements(v_feed->'subscriptions') entry
        where entry->>'targetId'=target.target_key
     );

  return v_feed || jsonb_build_object(
    'searchStatuses',v_search_statuses,
    'radarSearch',public.kd_radar_search_allowed(auth.uid())
  );
end
$$;

revoke all on function public.kd_radar_pilot_feed_search_access(uuid[],boolean)
  from public, anon, authenticated;
grant execute on function public.kd_radar_pilot_feed_search_access(uuid[],boolean)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
