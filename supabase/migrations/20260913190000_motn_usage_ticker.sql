-- Reusable, read-only request ticker. No provider query or new reservation.
begin;
create function public.kd_motn_usage_status() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog,public as $$
declare s public.kd_motn_sync%rowtype; total bigint; month_count bigint; day_count bigint; rolling_count bigint;
  new_count bigint; removed_count bigint; comparison_count bigint; last_request timestamptz; oldest_rolling timestamptz;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  select * into s from public.kd_motn_sync where singleton;
  select count(*),
    count(*) filter(where started_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),
    count(*) filter(where started_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
    count(*) filter(where started_at >= now()-interval '32 days'),
    count(*) filter(where kind='new'),count(*) filter(where kind='removed'),count(*) filter(where kind='comparison'),
    max(started_at),min(started_at) filter(where started_at >= now()-interval '32 days')
    into total,month_count,day_count,rolling_count,new_count,removed_count,comparison_count,last_request,oldest_rolling
    from public.kd_motn_requests;
  return jsonb_build_object('format',1,'source','kinodreieck-reservations','observedAt',now(),
    'planLimit',1000,'providerQuota',null,
    'sinceSetup',jsonb_build_object('attemptedRequests',total,'byKind',jsonb_build_object('new',new_count,'removed',removed_count,'comparison',comparison_count)),
    'currentUtcMonth',jsonb_build_object('month',to_char(now() at time zone 'UTC','YYYY-MM'),'attemptedRequests',month_count),
    'currentUtcDay',jsonb_build_object('date',to_char(now() at time zone 'UTC','YYYY-MM-DD'),'attemptedRequests',day_count,'limit',24,'remaining',greatest(0,24-day_count)),
    'rolling32Days',jsonb_build_object('attemptedRequests',rolling_count,'limit',900,'remaining',greatest(0,900-rolling_count),'nextExpiryAt',oldest_rolling+interval '32 days'),
    'lastRequestAt',last_request,'sync',jsonb_build_object('lastRunAt',s.last_run_at,'lastFullSyncAt',s.last_full_sync_at,
      'nextSyncAllowedAt',s.last_full_sync_at+interval '48 hours','pendingChanges',s.pending_changes,'status',s.last_status,'bootstrapCompletedAt',s.bootstrap_completed_at));
end $$;
revoke all on function public.kd_motn_usage_status() from public,anon,authenticated;
grant execute on function public.kd_motn_usage_status() to service_role;
notify pgrst,'reload schema';
commit;
