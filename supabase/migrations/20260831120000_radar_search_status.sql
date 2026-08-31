-- Read-only metadata for returned, owned targets. No subscription/checksum,
-- scheduler, lease, provider, RLS or table changes. The one-argument RPC and
-- its ACL remain untouched for old PWAs. The overload has no default argument.
begin;

create function public.kd_radar_pilot_feed(p_operation_ids uuid[], p_include_search_status boolean) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_feed jsonb; v_search_statuses jsonb;
begin
  -- Retains the existing capability and auth.uid() checks.
  v_feed := public.kd_radar_pilot_feed(p_operation_ids);
  if p_include_search_status is distinct from true then return v_feed; end if;

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

  return v_feed || jsonb_build_object('searchStatuses',v_search_statuses);
end $$;

revoke all on function public.kd_radar_pilot_feed(uuid[],boolean) from public,anon,authenticated;
grant execute on function public.kd_radar_pilot_feed(uuid[],boolean) to authenticated,service_role;
commit;
