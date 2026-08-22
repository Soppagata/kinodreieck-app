-- Kinodreieck · Entdecken-Wochenfeed · lokaler Migrationsvertrag
-- =============================================================================
-- STATUS: ADDITIVE FOLGEMIGRATION. NICHT OHNE SEPARATES REMOTE-FENSTER ANWENDEN.
--
-- Migriert den bestehenden `entdecken-daily-task` ohne zweite Function auf
-- einen globalen ISO-Wochenclaim. Der letzte erfolgreiche Feed bleibt bei
-- Fehlern erhalten. Ein monotoner Fencing-Token und eine harte Lease sperren
-- verspaetete Workerwrites; ein abgelaufener Versuch wird nicht automatisch
-- in derselben Woche wiederholt. Public-Aktivierung bleibt ausdruecklich aus.
-- =============================================================================

begin;

do $$
declare
  v_wert jsonb;
begin
  select wert into v_wert from public.kd_ai_limits
   where schluessel = 'task_max_tokens' for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object'
     or jsonb_typeof(v_wert #> '{entdecken-daily}') is distinct from 'number'
     or (v_wert #>> '{entdecken-daily}')::integer not in (1800, 2800) then
    raise exception 'Entdecken task_max_tokens Baseline drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{entdecken-daily}', to_jsonb(2800), false)
   where schluessel = 'task_max_tokens';
end
$$;

-- Der Endpoint darf spaeter accountlos freigeschaltet werden, bleibt durch
-- public_enabled=false aber bis zu einem eigenen Remote-Gate hart aus.
alter table public.kd_entdecken_daily_settings
  drop constraint if exists kd_entdecken_daily_settings_check;
alter table public.kd_entdecken_daily_settings
  drop constraint if exists kd_entdecken_daily_settings_check1;
alter table public.kd_entdecken_daily_settings
  add constraint kd_entdecken_weekly_noncommercial_check
  check (not commercial_enabled);
alter table public.kd_entdecken_daily_settings
  add constraint kd_entdecken_weekly_provider_requires_feed_check
  check (not provider_enabled or feed_enabled);

comment on table public.kd_entdecken_daily_settings is
  'Globaler nicht personalisierter Wochenfeed. public_enabled bleibt bis zu einem kontrollierten Remote-Gate false; commercial_enabled bleibt hart false.';

alter table public.kd_entdecken_daily_feed
  add column last_attempt_iso_week text,
  add column refreshed_iso_week text,
  add column fence_token bigint not null default 0,
  add column lease_expires_at timestamptz;

alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_last_attempt_check
  check (last_attempt_iso_week is null or last_attempt_iso_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$');
alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_refreshed_check
  check (refreshed_iso_week is null or refreshed_iso_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$');
alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_fence_check
  check (fence_token >= 0);

update public.kd_entdecken_daily_feed
   set refreshed_iso_week = payload->>'isoWeek'
 where payload->>'format' = '4'
   and payload->>'isoWeek' ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$';

comment on table public.kd_entdecken_daily_feed is
  'Ein globaler kanonischer Wochenfeed. Fehler und abgelaufene Leases ersetzen den letzten erfolgreichen Payload nie.';

create or replace function public.kd_entdecken_daily_claim()
returns jsonb
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
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_effective_feed_enabled boolean := false;
  v_refresh boolean := false;
  v_fence_token bigint;
  v_payload jsonb;
begin
  select feed_enabled, provider_enabled, public_enabled, commercial_enabled
    into v_feed_enabled, v_provider_enabled, v_public_enabled, v_commercial_enabled
    from public.kd_entdecken_daily_settings
   where singleton
   for update;
  if not found then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,
      'today',v_today,'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null);
  end if;

  select * into v_feed from public.kd_entdecken_daily_feed
   where singleton
   for update;
  if not found then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,
      'today',v_today,'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null);
  end if;

  v_effective_feed_enabled := coalesce(v_feed_enabled,false)
    and coalesce(v_public_enabled,false) and not coalesce(v_commercial_enabled,true);
  v_payload := case when v_effective_feed_enabled then v_feed.payload else null end;

  if v_effective_feed_enabled and coalesce(v_provider_enabled,false)
     and v_feed.last_attempt_iso_week is distinct from v_iso_week
     and v_feed.refreshed_iso_week is distinct from v_iso_week then
    update public.kd_entdecken_daily_feed
       set last_attempt_on = v_today,
           last_attempt_iso_week = v_iso_week,
           provider_operation_id = null,
           fence_token = fence_token + 1,
           lease_expires_at = v_now + interval '180 seconds',
           status = 'refreshing',
           last_error_code = null,
           updated_at = v_now
     where singleton
     returning fence_token into v_fence_token;
    v_refresh := found;
  end if;

  return jsonb_build_object(
    'feedEnabled',v_effective_feed_enabled,
    'providerEnabled',coalesce(v_provider_enabled,false),
    'today',v_today,
    'isoWeek',v_iso_week,
    'refresh',v_refresh,
    'fenceToken',case when v_refresh then v_fence_token else null end,
    'feed',v_payload
  );
end
$$;

revoke all on function public.kd_entdecken_daily_save(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.kd_entdecken_daily_fail(text) from public, anon, authenticated, service_role;
revoke all on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer) from public, anon, authenticated, service_role;
drop function public.kd_entdecken_daily_save(jsonb);
drop function public.kd_entdecken_daily_fail(text);
drop function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer);

create function public.kd_entdecken_daily_save(
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
  if v_count < 1 or v_count > 20 then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;

  update public.kd_entdecken_daily_feed
     set payload = p_payload,
         refreshed_on = v_today,
         refreshed_iso_week = v_iso_week,
         valid_until = v_week_end,
         status = 'ready',
         last_error_code = null,
         lease_expires_at = null,
         updated_at = v_now
   where singleton
     and status = 'refreshing'
     and last_attempt_iso_week = v_iso_week
     and fence_token = p_fence_token
     and provider_operation_id is not null
     and lease_expires_at >= v_now;
  if not found then return jsonb_build_object('ok',false,'code','state_invalid'); end if;
  return jsonb_build_object('ok',true,'status','saved');
end
$$;

create function public.kd_entdecken_daily_fail(
  p_code text,
  p_fence_token bigint
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_safe text;
  v_iso_week text := to_char((clock_timestamp() at time zone 'Europe/Vienna')::date, 'IYYY-"W"IW');
begin
  v_safe := case when p_code in (
    'provider_error','invalid_response','storage_error','source_registry_unavailable'
  ) then p_code else 'provider_error' end;
  update public.kd_entdecken_daily_feed
     set status = 'error', last_error_code = v_safe,
         lease_expires_at = null, updated_at = clock_timestamp()
   where singleton and last_attempt_iso_week = v_iso_week
     and fence_token = p_fence_token;
  return jsonb_build_object('ok',found,'status','recorded');
end
$$;

create function public.kd_entdecken_daily_auftrag_starten(
  p_operation_id uuid,
  p_reservierung numeric,
  p_search_requests integer,
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
     or v_source_count is distinct from (select count(*) from public.kd_entdecken_sources where active) then
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
    null,
    'entdecken-daily',
    p_operation_id,
    'klein',
    'entdecken-weekly-v1',
    null,
    p_reservierung
  );
end
$$;

revoke all on function public.kd_entdecken_daily_claim() from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_save(jsonb,bigint) from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_fail(text,bigint) from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint) from public, anon, authenticated;
grant execute on function public.kd_entdecken_daily_claim() to service_role;
grant execute on function public.kd_entdecken_daily_save(jsonb,bigint) to service_role;
grant execute on function public.kd_entdecken_daily_fail(text,bigint) to service_role;
grant execute on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint) to service_role;

comment on function public.kd_entdecken_daily_claim() is
  'Liefert den letzten globalen Feed und beansprucht atomar hoechstens einen Versuch je ISO-Woche; Fencing-Lease 180 Sekunden, kein Retry.';
comment on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer,bigint) is
  'Reserviert den einen allgemeinen AT-Websearch der beanspruchten ISO-Woche nach Quellen-, Provider-, Fencing- und Kostenzaun.';

do $$
begin
  if exists (
    select 1 from public.kd_entdecken_daily_settings
     where singleton and public_enabled
  ) then
    raise exception 'Entdecken public_enabled darf durch die lokale Wochenmigration nicht aktiviert werden';
  end if;
end
$$;

commit;
