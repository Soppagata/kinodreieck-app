-- Kinodreieck · Entdecken-Wochenfeed · Promptvertrag v2
-- =============================================================================
-- Forward-only: Der Anbieteradapter fordert mit v2 einen groesseren, weiterhin
-- streng belegten Kandidatenpuffer an und normalisiert nur sichere syntaktische
-- Varianten. Der zugehoerige Kostenlog muss deshalb dieselbe Promptversion
-- tragen. Kostenzaeune, Quellenregister, Lease/Fencing und Berechtigungen
-- bleiben unveraendert.
-- =============================================================================

begin;

create or replace function public.kd_entdecken_daily_auftrag_starten(
  p_operation_id uuid,
  p_reservierung numeric,
  p_search_requests integer,
  p_fence_token bigint,
  p_account uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_feed_enabled boolean;
  v_provider_enabled boolean;
  v_public_enabled boolean;
  v_commercial_enabled boolean;
  v_provider jsonb;
  v_fee numeric;
  v_task_cap numeric;
  v_source_count integer;
begin
  if p_operation_id is null or p_search_requests is distinct from 1
     or p_fence_token is null or p_fence_token <= 0
     or p_reservierung is null
     or p_reservierung::text !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok',false,'code','server','grund','entdecken-weekly-request-invalid');
  end if;
  if p_account is not null and not exists (
    select 1 from public.kd_account_access
     where account_id = p_account and role = 'owner'
       and active and personal_ai
  ) then
    return jsonb_build_object('ok',false,'code','disabled','grund','entdecken-weekly-account-invalid');
  end if;

  select feed_enabled, provider_enabled, public_enabled, commercial_enabled
    into v_feed_enabled, v_provider_enabled, v_public_enabled, v_commercial_enabled
    from public.kd_entdecken_daily_settings
   where singleton
   for key share;
  if not coalesce(v_feed_enabled,false) or not coalesce(v_provider_enabled,false)
     or not coalesce(v_public_enabled,false) or coalesce(v_commercial_enabled,true) then
    return jsonb_build_object('ok',false,'code','disabled','grund','entdecken-weekly-off');
  end if;

  perform 1 from public.kd_entdecken_daily_feed where singleton for update;
  if not found or not exists (
    select 1 from public.kd_entdecken_daily_feed
     where singleton and status = 'refreshing'
       and last_attempt_iso_week = v_iso_week
       and fence_token = p_fence_token
       and provider_operation_id is null
       and lease_expires_at >= v_now
  ) then
    return jsonb_build_object('ok',false,'code','limit','grund','entdecken-weekly-already-attempted');
  end if;

  select count(*) into v_source_count
    from public.kd_entdecken_sources
   where active and rights_status = 'approved' and attribution_approved
     and source_class = 'editorial' and terms_checked_on is not null
     and terms_url ~ '^https://';
  if v_source_count is distinct from 2
     or v_source_count is distinct from (
       select count(*) from public.kd_entdecken_sources where active
     ) then
    return jsonb_build_object('ok',false,'code','disabled','grund','entdecken-weekly-sources-unavailable');
  end if;

  v_provider := public.kd_private_provider_allowed('anthropic');
  if v_provider is null or v_provider->>'code' is distinct from 'PROVIDER_ALLOWED'
     or (v_provider->>'ok')::boolean is distinct from true then
    return jsonb_build_object('ok',false,'code','disabled','grund','provider-off');
  end if;

  select (wert #>> '{}')::numeric into v_fee
    from public.kd_ai_limits
   where schluessel = 'websearch_usd_cent_pro_request'
     and jsonb_typeof(wert) = 'number';
  select (wert #>> '{entdecken-daily}')::numeric into v_task_cap
    from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent'
     and jsonb_typeof(wert) = 'object'
     and jsonb_typeof(wert #> '{entdecken-daily}') = 'number';
  if v_fee is distinct from 1 or v_task_cap is distinct from 5
     or p_reservierung < v_fee or p_reservierung > v_task_cap then
    return jsonb_build_object('ok',false,'code','server','grund','entdecken-weekly-cost-config-invalid');
  end if;

  update public.kd_entdecken_daily_feed
     set provider_operation_id = p_operation_id, updated_at = v_now
   where singleton and status = 'refreshing'
     and last_attempt_iso_week = v_iso_week
     and fence_token = p_fence_token
     and provider_operation_id is null
     and lease_expires_at >= v_now;
  if not found then
    return jsonb_build_object('ok',false,'code','limit','grund','entdecken-weekly-already-attempted');
  end if;

  return public.kd_ai_auftrag_starten(
    p_account,
    'entdecken-daily',
    p_operation_id,
    'klein',
    'entdecken-weekly-v2',
    null,
    p_reservierung
  );
end
$$;

revoke all on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint,uuid)
  from public, anon, authenticated;
grant execute on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint,uuid)
  to service_role;

comment on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint,uuid) is
  'Startet genau einen owner-gebundenen Entdecken-Websearch unter Quellen-, Lease-, Kosten- und Prompt-v2-Vertrag; nur fuer service_role.';

commit;

-- Staging-Readback nach exakt einmaliger Anwendung:
-- select count(*) from supabase_migrations.schema_migrations where version = '20260825200000';
-- select pg_get_functiondef('public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint,uuid)'::regprocedure);
