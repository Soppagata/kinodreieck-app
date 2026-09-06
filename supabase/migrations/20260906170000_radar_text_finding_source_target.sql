-- Projiziert die bereits persistierte, echte Textziel-Referenz in den eigenen
-- Radarfeed. Keine Tabelle, kein Backfill, kein Scheduler und kein Anbieter.
begin;

do $$
begin
  if to_regprocedure('public.kd_radar_pilot_feed_findings_internal(uuid[])') is null
     or to_regprocedure('public.kd_radar_pilot_feed(uuid[])') is null
     or to_regclass('public.kd_radar_text_findings') is null then
    raise exception 'Radar Textfund-Baseline fehlt';
  end if;
end
$$;

create or replace function public.kd_radar_pilot_feed(p_operation_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_feed jsonb; v_events jsonb;
begin
  v_feed := public.kd_radar_pilot_feed_findings_internal(p_operation_ids);
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId',f.finding_id,'eventVersionId',f.event_version_id,'targetId',f.release_key,
    'sourceTargetKey','text:'||t.target_key,
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
  return jsonb_set(v_feed,'{events}',coalesce(v_feed->'events','[]'::jsonb)||v_events,false);
end $$;

revoke all on function public.kd_radar_pilot_feed(uuid[]) from public,anon,authenticated;
grant execute on function public.kd_radar_pilot_feed(uuid[]) to authenticated,service_role;
comment on function public.kd_radar_pilot_feed(uuid[]) is
  'Liefert eigene Radarereignisse; private Textfunde tragen ihre persistierte Textziel-Referenz.';

notify pgrst, 'reload schema';
commit;
