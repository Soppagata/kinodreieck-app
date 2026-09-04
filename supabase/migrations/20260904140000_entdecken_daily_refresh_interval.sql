begin;

-- U-06: Der bestehende providerfreie Format-6-Pool wird taeglich frisch
-- geclaimt. Dies ersetzt ausschliesslich die bestehende Claim-RPC; Quellen,
-- Payloadformat, 50er-Menge, Owner-Override, Lease und Ein-Versuch-Grenze
-- bleiben unveraendert. Radar bleibt ein getrennter 144h-Vertrag.
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
  v_utc timestamp := v_now at time zone 'UTC';
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_enabled boolean := false;
  v_owner_override boolean := false;
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_anchor timestamptz;
  v_due boolean := false;
  v_claim boolean := false;
  v_status text := 'held';
  v_fence bigint;
begin
  if auth.role() is distinct from 'service_role'
     or p_source is null or p_source not in ('scheduled','owner') then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',coalesce(p_source,'invalid'),'claimStatus','disabled',
      'attemptCount',0,'maxAttempts',1,'feedReadback',null);
  end if;

  select feed_enabled and public_enabled and owner_private_source_enabled
         and not provider_enabled and not commercial_enabled
         and public.kd_entdecken_mixed_sources_ready(),
         staging_owner_refresh_override
    into v_enabled, v_owner_override
    from public.kd_entdecken_daily_settings
   where singleton
   for update;
  select * into v_feed from public.kd_entdecken_daily_feed where singleton for update;
  if not found then v_enabled := false; end if;

  v_anchor := case
    when v_feed.last_success_at is null then v_feed.last_public_attempt_at
    when v_feed.last_public_attempt_at is null then v_feed.last_success_at
    else greatest(v_feed.last_success_at, v_feed.last_public_attempt_at)
  end;
  v_due := v_anchor is null or v_now >= v_anchor + interval '24 hours';

  if not coalesce(v_enabled,false) then v_status := 'disabled';
  elsif p_source = 'owner' and not coalesce(v_owner_override,false) then v_status := 'disabled';
  elsif p_source = 'scheduled' and extract(hour from v_utc)::integer <> 2 then v_status := 'outside_window';
  elsif v_feed.status = 'refreshing' and v_feed.lease_expires_at > v_now then v_status := 'in_progress';
  elsif p_source = 'scheduled' and not v_due then v_status := 'not_due';
  else
    update public.kd_entdecken_daily_feed
       set last_public_attempt_at = v_now,
           last_attempt_on = v_today,
           last_attempt_iso_week = v_iso_week,
           attempt_iso_week = v_iso_week,
           attempt_count = 1,
           provider_operation_id = null,
           fence_token = fence_token + 1,
           lease_expires_at = v_now + interval '180 seconds',
           status = 'refreshing',
           last_error_code = null,
           last_failure_at = null,
           recovery_authorized_iso_week = null,
           updated_at = v_now
     where singleton
     returning fence_token into v_fence;
    v_claim := found;
    v_status := case when v_claim then 'claimed' else 'held' end;
  end if;
  return jsonb_build_object(
    'feedEnabled',coalesce(v_enabled,false),'providerEnabled',false,'today',v_today,
    'isoWeek',v_iso_week,'refresh',v_claim,
    'fenceToken',case when v_claim then v_fence else null end,
    'feed',case when coalesce(v_enabled,false) then v_feed.payload else null end,
    'requestMode',p_source,'claimStatus',v_status,
    'attemptCount',case when v_claim then 1 else 0 end,'maxAttempts',1,'feedReadback',null
  );
end
$$;

revoke all on function public.kd_entdecken_weekly_refresh_claim(text)
  from public, anon, authenticated;
grant execute on function public.kd_entdecken_weekly_refresh_claim(text)
  to service_role;

comment on function public.kd_entdecken_weekly_refresh_claim(text) is
  'Scheduled: taeglich um 02 UTC und nach 24h. Owner: nur bei kurz gesetztem Staging-Override, genau ein Claim auch innerhalb der Kadenz; maxAttempts 1. Format 6 bleibt 50 Items aus Joyn und OeFI; Radar bleibt 144h.';

commit;

-- Lokales Authoring: kein Scheduler-, Radar-, Provider-, Apply- oder Production-Write.
