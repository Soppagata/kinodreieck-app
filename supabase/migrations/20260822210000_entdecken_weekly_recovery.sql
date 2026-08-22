-- Kinodreieck · Entdecken-Wochenfeed · einmalig autorisierbare Recovery
-- =============================================================================
-- Additive Forward-Migration. Ein fehlgeschlagener Wochenclaim bleibt weiter
-- gesperrt, bis service_role nach mindestens 15 Minuten genau diese ISO-Woche
-- ausdruecklich freigibt. Der Claim verbraucht die Freigabe atomar; pro Woche
-- ist hoechstens ein Recoveryversuch moeglich. Kein Scheduler und kein Retry.
-- =============================================================================

begin;

alter table public.kd_entdecken_daily_feed
  add column recovery_authorized_iso_week text,
  add column recovery_attempted_iso_week text,
  add column last_failure_at timestamptz;

alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_recovery_authorized_check
  check (recovery_authorized_iso_week is null
    or recovery_authorized_iso_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$');
alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_recovery_attempted_check
  check (recovery_attempted_iso_week is null
    or recovery_attempted_iso_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$');

update public.kd_entdecken_daily_feed
   set last_failure_at = updated_at
 where singleton and status = 'error' and last_failure_at is null;

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
  v_recovery boolean := false;
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
  v_recovery := v_feed.status = 'error'
    and v_feed.last_attempt_iso_week = v_iso_week
    and v_feed.refreshed_iso_week is distinct from v_iso_week
    and v_feed.recovery_authorized_iso_week = v_iso_week
    and v_feed.recovery_attempted_iso_week is distinct from v_iso_week
    and v_feed.last_failure_at is not null
    and v_feed.last_failure_at <= v_now - interval '15 minutes'
    and (v_feed.lease_expires_at is null or v_feed.lease_expires_at <= v_now);

  if v_effective_feed_enabled and coalesce(v_provider_enabled,false)
     and v_feed.refreshed_iso_week is distinct from v_iso_week
     and (v_feed.last_attempt_iso_week is distinct from v_iso_week or v_recovery) then
    update public.kd_entdecken_daily_feed
       set last_attempt_on = v_today,
           last_attempt_iso_week = v_iso_week,
           provider_operation_id = null,
           fence_token = fence_token + 1,
           lease_expires_at = v_now + interval '180 seconds',
           status = 'refreshing',
           last_error_code = null,
           recovery_authorized_iso_week = null,
           recovery_attempted_iso_week = case when v_recovery then v_iso_week else recovery_attempted_iso_week end,
           last_failure_at = null,
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
         recovery_authorized_iso_week = null,
         last_failure_at = null,
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

create or replace function public.kd_entdecken_daily_fail(
  p_code text,
  p_fence_token bigint
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_safe text;
  v_iso_week text := to_char((v_now at time zone 'Europe/Vienna')::date, 'IYYY-"W"IW');
begin
  v_safe := case when p_code in (
    'provider_error','invalid_response','storage_error','source_registry_unavailable'
  ) then p_code else 'provider_error' end;
  update public.kd_entdecken_daily_feed
     set status = 'error', last_error_code = v_safe,
         lease_expires_at = null, last_failure_at = v_now, updated_at = v_now
   where singleton and status = 'refreshing'
     and last_attempt_iso_week = v_iso_week
     and fence_token = p_fence_token;
  return jsonb_build_object('ok',found,'status','recorded');
end
$$;

create function public.kd_entdecken_weekly_recovery_authorize(
  p_iso_week text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_iso_week text := to_char((v_now at time zone 'Europe/Vienna')::date, 'IYYY-"W"IW');
begin
  if p_iso_week is distinct from v_iso_week then
    return jsonb_build_object('ok',false,'status','not_authorized');
  end if;
  update public.kd_entdecken_daily_feed
     set recovery_authorized_iso_week = v_iso_week,
         updated_at = v_now
   where singleton
     and status = 'error'
     and last_attempt_iso_week = v_iso_week
     and refreshed_iso_week is distinct from v_iso_week
     and recovery_authorized_iso_week is distinct from v_iso_week
     and recovery_attempted_iso_week is distinct from v_iso_week
     and last_failure_at is not null
     and last_failure_at <= v_now - interval '15 minutes'
     and (lease_expires_at is null or lease_expires_at <= v_now);
  return jsonb_build_object('ok',found,'status',case when found then 'authorized' else 'not_authorized' end);
end
$$;

revoke all on function public.kd_entdecken_weekly_recovery_authorize(text)
  from public, anon, authenticated;
grant execute on function public.kd_entdecken_weekly_recovery_authorize(text)
  to service_role;

comment on function public.kd_entdecken_daily_claim() is
  'Atomarer Wochenclaim: ein Normalversuch plus hoechstens ein zuvor service-role-autorisiertes Recovery nach 15 Minuten Cooldown.';
comment on function public.kd_entdecken_weekly_recovery_authorize(text) is
  'Default-off Einzelautorisierung fuer genau einen fehlgeschlagenen Wochenfeed-Recoveryclaim nach Cooldown; startet selbst keinen Providerrequest.';

commit;
