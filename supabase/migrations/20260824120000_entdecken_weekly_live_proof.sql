-- Kinodreieck · Entdecken-Wochenfeed · persistenter Live-Beleg
-- =============================================================================
-- Additive Forward-Migration. Sie bindet den ausdruecklichen Owner-Recovery an
-- dessen bestehenden Kostenstand, verlangt vor jedem neuen Feed einen fertig
-- abgerechneten identischen Providerlog und stellt danach einen unabhaengigen
-- service-role-only Readback bereit. Der normale globale Browserpfad bleibt
-- accountlos; Konten, Profile und lokale Katalogdaten erreichen den Provider
-- nie. Ein Fehler ersetzt den letzten erfolgreichen Feed weiterhin nicht.
-- =============================================================================

begin;

-- Neue, accountfaehige Ueberladung nur fuer den bereits owner-geprueften
-- Recoverypfad. Die vorhandene Vierparameterfunktion bleibt fuer globale
-- accountlose Aufrufe kompatibel.
create function public.kd_entdecken_daily_auftrag_starten(
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
    'entdecken-weekly-v1',
    null,
    p_reservierung
  );
end
$$;

revoke all on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint,uuid)
  from public, anon, authenticated;
grant execute on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint,uuid)
  to service_role;

-- Nur ein fertig abgerechneter Log derselben reservierten Operation darf den
-- letzten guten Payload ersetzen. Neue Feeds enthalten exakt 5 bis 7 Titel;
-- historische gueltige Cachepayloads werden dadurch nicht geloescht.
create or replace function public.kd_entdecken_daily_save(
  p_payload jsonb,
  p_fence_token bigint
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
  v_week_end date := v_today + (7 - extract(isodow from v_today)::integer);
  v_count integer;
  v_operation_id uuid;
  v_log_count integer;
begin
  if p_fence_token is null or p_fence_token <= 0
     or jsonb_typeof(p_payload) is distinct from 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) is distinct from 8::bigint
     or p_payload->>'format' is distinct from '4'
     or p_payload->>'feedId' is distinct from 'websearch:weekly-positive-at'
     or p_payload->>'region' is distinct from 'AT'
     or p_payload->>'sourceId' is distinct from 'websearch:weekly-positive'
     or p_payload->>'isoWeek' is distinct from v_iso_week
     or p_payload->>'refreshedOn' is distinct from v_today::text
     or p_payload->>'validUntil' is distinct from v_week_end::text
     or jsonb_typeof(p_payload->'items') is distinct from 'array' then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;
  begin
    v_count := jsonb_array_length(p_payload->'items');
  exception when others then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end;
  if v_count < 5 or v_count > 7 then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;

  select provider_operation_id into v_operation_id
    from public.kd_entdecken_daily_feed
   where singleton
     and status = 'refreshing'
     and last_attempt_iso_week = v_iso_week
     and fence_token = p_fence_token
     and provider_operation_id is not null
     and lease_expires_at >= v_now
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','state_invalid');
  end if;

  select count(*) into v_log_count
    from public.kd_ai_log
   where vorgang_id = v_operation_id
     and task = 'entdecken-daily'
     and status = 'fertig'
     and modell is not null
     and input_tokens is not null and output_tokens is not null
     and kosten_usd_cent > 0
     and beendet_at is not null
     and fehlerklasse is null;
  if v_log_count is distinct from 1 then
    return jsonb_build_object('ok',false,'code','provider_log_unverified');
  end if;

  update public.kd_entdecken_daily_feed
     set payload = p_payload,
         refreshed_on = v_today,
         refreshed_iso_week = v_iso_week,
         valid_until = v_week_end,
         status = 'ready',
         last_error_code = null,
         lease_expires_at = null,
         recovery_authorized_iso_week = null,
         last_failure_at = null,
         updated_at = v_now
   where singleton
     and status = 'refreshing'
     and last_attempt_iso_week = v_iso_week
     and fence_token = p_fence_token
     and provider_operation_id = v_operation_id
     and lease_expires_at >= v_now;
  if not found then return jsonb_build_object('ok',false,'code','state_invalid'); end if;
  return jsonb_build_object('ok',true,'status','saved');
end
$$;

-- Zweiter RPC nach dem Save: liest den tatsaechlich gespeicherten Payload und
-- denselben fertigen Kostenlog. Die HTTP-Huelle projiziert daraus nur einen
-- inhaltsfreien Beleg; der normale Feed behaelt seine Quellenlinks.
create function public.kd_entdecken_weekly_feed_readback(
  p_fence_token bigint,
  p_provider_log_id bigint
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_iso_week text := to_char((statement_timestamp() at time zone 'Europe/Vienna')::date, 'IYYY-"W"IW');
  v_payload jsonb;
  v_fence_token bigint;
  v_log_id bigint;
  v_operation_id uuid;
  v_task text;
  v_status text;
  v_model text;
  v_input_tokens integer;
  v_output_tokens integer;
  v_cost numeric;
  v_evidence_count integer;
  v_source_count integer;
  v_approved_source_count integer;
begin
  if auth.role() is distinct from 'service_role'
     or p_fence_token is null or p_fence_token <= 0
     or p_provider_log_id is null or p_provider_log_id <= 0 then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;

  select f.payload, f.fence_token,
         l.id, l.vorgang_id, l.task, l.status, l.modell,
         l.input_tokens, l.output_tokens, l.kosten_usd_cent
    into v_payload, v_fence_token,
         v_log_id, v_operation_id, v_task, v_status, v_model,
         v_input_tokens, v_output_tokens, v_cost
    from public.kd_entdecken_daily_feed f
    join public.kd_ai_log l
      on l.vorgang_id = f.provider_operation_id
   where f.singleton
     and f.status = 'ready'
     and f.refreshed_iso_week = v_iso_week
     and f.fence_token = p_fence_token
     and l.id = p_provider_log_id
     and l.task = 'entdecken-daily'
     and l.status = 'fertig'
     and l.modell is not null
     and l.input_tokens is not null and l.output_tokens is not null
     and l.kosten_usd_cent > 0
     and l.beendet_at is not null
     and l.fehlerklasse is null;
  if not found or jsonb_typeof(v_payload->'items') is distinct from 'array'
     or jsonb_array_length(v_payload->'items') < 5
     or jsonb_array_length(v_payload->'items') > 7 then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;

  select count(*) into v_evidence_count
    from jsonb_array_elements(v_payload->'items') as item(value)
    cross join lateral jsonb_array_elements(item.value->'evidence') as evidence(value);
  select count(distinct source.source_id) into v_source_count
    from jsonb_array_elements(v_payload->'items') as item(value)
    cross join lateral jsonb_array_elements(item.value->'evidence') as evidence(value)
    join public.kd_entdecken_sources source
      on evidence.value->>'domain' = source.domain
      or (source.subdomains_allowed
        and evidence.value->>'domain' like '%.' || source.domain)
   where source.active and source.rights_status = 'approved'
     and source.attribution_approved and source.source_class = 'editorial';
  select count(*) into v_approved_source_count
    from public.kd_entdecken_sources
   where active and rights_status = 'approved'
     and attribution_approved and source_class = 'editorial';
  if v_evidence_count < jsonb_array_length(v_payload->'items')
     or v_source_count < 1
     or v_approved_source_count < v_source_count then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;

  return jsonb_build_object(
    'ok',true,
    'status','verified',
    'feed',v_payload,
    'fenceToken',v_fence_token,
    'providerLog',jsonb_build_object(
      'logId',v_log_id,
      'operationId',v_operation_id,
      'task',v_task,
      'status',v_status,
      'model',v_model,
      'inputTokens',v_input_tokens,
      'outputTokens',v_output_tokens,
      'costUsdCent',v_cost
    ),
    'provenance',jsonb_build_object(
      'evidenceCount',v_evidence_count,
      'sourceCount',v_source_count,
      'approvedSourceCount',v_approved_source_count
    )
  );
end
$$;

revoke all on function public.kd_entdecken_weekly_feed_readback(bigint,bigint)
  from public, anon, authenticated;
grant execute on function public.kd_entdecken_weekly_feed_readback(bigint,bigint)
  to service_role;

comment on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint,uuid) is
  'Owner-gepruefte Recovery-Ueberladung: bindet ausschliesslich den Kostenlog an das Testkonto; Providerinput und Feed bleiben global.';
comment on function public.kd_entdecken_weekly_feed_readback(bigint,bigint) is
  'Service-role-only Readback des gespeicherten 5-bis-7-Titel-Wochenfeeds und desselben fertig abgerechneten Providerlogs.';

commit;
