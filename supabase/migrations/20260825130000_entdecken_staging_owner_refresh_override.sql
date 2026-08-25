-- Kinodreieck · Entdecken-Wochenfeed · temporaerer Staging-Owner-Refresh
-- =============================================================================
-- Fail-closed Forward-Migration fuer die kontrollierte Empfehlungsabnahme.
-- Der normale Scheduler und alle Fresh-DBs bleiben bei drei Wochenversuchen.
-- Nur ein expliziter Owner-Refresh darf bei einem separat gesetzten, standard-
-- maessig falschen Staging-Flag bis zum technischen Hoechstwert 100 claimen.
-- Ein erfolgreicher Feed sperrt weiterhin jeden weiteren Wochenrefresh.
-- =============================================================================

begin;

alter table public.kd_entdecken_daily_settings
  add column staging_owner_refresh_override boolean not null default false;

comment on column public.kd_entdecken_daily_settings.staging_owner_refresh_override is
  'Temporaerer Staging-only Owner-Refresh-Override. Default false; nie fuer Scheduler, Default-Branch oder Produktion aktivieren.';

alter table public.kd_entdecken_daily_feed
  drop constraint kd_entdecken_weekly_attempt_count_check;
alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_attempt_count_check
  check ((attempt_iso_week is null and attempt_count = 0)
    or (attempt_iso_week is not null and attempt_count between 1 and 100));

create or replace function public.kd_entdecken_weekly_refresh_claim(
  p_source text
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
  v_owner_refresh_override boolean := false;
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_effective_feed_enabled boolean := false;
  v_payload jsonb;
  v_attempt_count integer := 0;
  v_max_attempts integer := 3;
  v_refresh boolean := false;
  v_claim_status text := 'held';
  v_fence_token bigint;
  v_next_attempt integer;
  v_first_attempt boolean := false;
  v_failed_retry boolean := false;
  v_abandoned_retry boolean := false;
begin
  if auth.role() is distinct from 'service_role'
     or p_source not in ('scheduled','owner') then
    return jsonb_build_object(
      'feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',coalesce(p_source,'invalid'),'claimStatus','disabled',
      'attemptCount',0,'maxAttempts',3,'feedReadback',null
    );
  end if;

  select feed_enabled, provider_enabled, public_enabled, commercial_enabled,
         staging_owner_refresh_override
    into v_feed_enabled, v_provider_enabled, v_public_enabled, v_commercial_enabled,
         v_owner_refresh_override
    from public.kd_entdecken_daily_settings
   where singleton
   for update;
  if not found then
    return jsonb_build_object(
      'feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',p_source,'claimStatus','disabled','attemptCount',0,
      'maxAttempts',3,'feedReadback',null
    );
  end if;

  v_max_attempts := case
    when p_source = 'owner' and coalesce(v_owner_refresh_override,false) then 100
    else 3
  end;

  select * into v_feed
    from public.kd_entdecken_daily_feed
   where singleton
   for update;
  if not found then
    return jsonb_build_object(
      'feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',p_source,'claimStatus','disabled','attemptCount',0,
      'maxAttempts',v_max_attempts,'feedReadback',null
    );
  end if;

  v_effective_feed_enabled := coalesce(v_feed_enabled,false)
    and coalesce(v_public_enabled,false) and not coalesce(v_commercial_enabled,true);
  v_payload := case when v_effective_feed_enabled then v_feed.payload else null end;
  v_attempt_count := case when v_feed.attempt_iso_week = v_iso_week
    then v_feed.attempt_count else 0 end;
  v_first_attempt := v_feed.last_attempt_iso_week is distinct from v_iso_week
    or v_feed.attempt_iso_week is distinct from v_iso_week;
  v_failed_retry := v_feed.status = 'error'
    and v_feed.last_attempt_iso_week = v_iso_week
    and v_feed.last_failure_at is not null
    and ((p_source = 'owner' and coalesce(v_owner_refresh_override,false))
      or v_feed.last_failure_at <= v_now - interval '15 minutes')
    and (v_feed.lease_expires_at is null or v_feed.lease_expires_at <= v_now);
  v_abandoned_retry := v_feed.status = 'refreshing'
    and v_feed.last_attempt_iso_week = v_iso_week
    and v_feed.lease_expires_at is not null
    and v_feed.lease_expires_at <= v_now;

  if not v_effective_feed_enabled or not coalesce(v_provider_enabled,false) then
    v_claim_status := 'disabled';
  elsif v_feed.refreshed_iso_week = v_iso_week then
    v_claim_status := 'already_fresh';
  elsif v_feed.status = 'refreshing' and v_feed.lease_expires_at > v_now then
    v_claim_status := 'in_progress';
  elsif v_attempt_count >= v_max_attempts then
    v_claim_status := 'exhausted';
  elsif v_first_attempt or v_failed_retry or v_abandoned_retry then
    update public.kd_entdecken_daily_feed
       set last_attempt_on = v_today,
           last_attempt_iso_week = v_iso_week,
           attempt_iso_week = v_iso_week,
           attempt_count = case when attempt_iso_week = v_iso_week
             then attempt_count + 1 else 1 end,
           provider_operation_id = null,
           fence_token = fence_token + 1,
           lease_expires_at = v_now + interval '180 seconds',
           status = 'refreshing',
           last_error_code = null,
           recovery_authorized_iso_week = null,
           last_failure_at = null,
           updated_at = v_now
     where singleton
     returning fence_token, attempt_count into v_fence_token, v_next_attempt;
    v_refresh := found;
    v_claim_status := case when v_refresh then 'claimed' else 'held' end;
    if v_refresh then v_attempt_count := v_next_attempt; end if;
  elsif v_feed.status = 'error' then
    v_claim_status := 'cooldown';
  else
    v_claim_status := 'held';
  end if;

  return jsonb_build_object(
    'feedEnabled',v_effective_feed_enabled,
    'providerEnabled',coalesce(v_provider_enabled,false),
    'today',v_today,
    'isoWeek',v_iso_week,
    'refresh',v_refresh,
    'fenceToken',case when v_refresh then v_fence_token else null end,
    'feed',v_payload,
    'requestMode',p_source,
    'claimStatus',v_claim_status,
    'attemptCount',v_attempt_count,
    'maxAttempts',v_max_attempts,
    'feedReadback',null
  );
end
$$;

revoke all on function public.kd_entdecken_weekly_refresh_claim(text)
  from public, anon, authenticated;
grant execute on function public.kd_entdecken_weekly_refresh_claim(text)
  to service_role;

comment on function public.kd_entdecken_weekly_refresh_claim(text) is
  'Scheduled bleibt bei drei Versuchen und 15-Minuten-Fehlercooldown; nur Owner plus temporaerem Staging-Flag darf bis 100 und nach verbuchtem Fehler sofort erneut claimen. Erfolgssperre und Fencing bleiben unveraendert.';

commit;
