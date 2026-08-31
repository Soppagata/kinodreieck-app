-- Read-only metadata for returned, owned targets. No subscription/checksum,
-- scheduler, lease, provider, RLS, table or ACL changes.
begin;

create or replace function public.kd_radar_pilot_feed(p_operation_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_feed jsonb; v_events jsonb; v_search_statuses jsonb;
begin
  -- Retains the existing capability and auth.uid() checks.
  v_feed := public.kd_radar_pilot_feed_findings_internal(p_operation_ids);
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId',f.finding_id,'eventVersionId',f.event_version_id,'targetId',f.release_key,
    'title',f.title,'targetType',f.target_type,'category',f.category,
    'eventType',f.event_type,'date',f.event_date,'region',f.region,'platform',f.platform,
    'lifecycleStatus','scheduled','verificationStatus','confirmed',
    'evidence',jsonb_build_array(jsonb_build_object('sourceId',left('web:'||f.source_domain,128),
      'sourceDomain',f.source_domain,'url',f.source_url,'retrievedAt',f.checked_at))
  ) || case when f.season_number is null then '{}'::jsonb else jsonb_build_object('seasonNumber',f.season_number) end
    order by f.event_date,f.title,f.finding_id),'[]'::jsonb) into v_events
    from public.kd_radar_text_findings f
    join public.kd_radar_subscriptions s on s.account_id=f.account_id and s.target_id=f.text_target_id
    join public.kd_radar_targets t on t.target_id=s.target_id
    where f.account_id=auth.uid() and s.subscription_status='active'
      and s.region='AT' and s.scope='all' and t.target_type='text' and t.target_status='active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'targetId',t.target_key,
    'status',case when r.claimed_at is null then 'never'
      when r.worker_status='leased' then
        case when r.lease_expires_at > now() then 'searching' else 'timeout' end
      else r.safe_status end,
    'checkedAt',case when r.worker_status='leased' and r.lease_expires_at <= now()
      then r.lease_expires_at else coalesce(r.terminal_at,r.claimed_at) end
  ) order by t.target_key),'[]'::jsonb) into v_search_statuses
    from public.kd_radar_subscriptions s
    join public.kd_radar_targets t on t.target_id=s.target_id
    left join lateral (
      select run.claimed_at,run.worker_status,run.safe_status,run.lease_expires_at,run.terminal_at
      from public.kd_radar_daily_runs run
      where run.account_id=auth.uid() and run.target_id=s.target_id
      order by run.claimed_at desc,run.vienna_day desc limit 1
    ) r on true
    where s.account_id=auth.uid()
      and exists (select 1 from jsonb_array_elements(v_feed->'subscriptions') entry
        where entry->>'targetId'=t.target_key);

  return jsonb_set(v_feed,'{events}',coalesce(v_feed->'events','[]'::jsonb)||v_events,false)
    || jsonb_build_object('searchStatuses',v_search_statuses);
end $$;

-- CREATE OR REPLACE preserves the existing authenticated/service_role ACL.
commit;
