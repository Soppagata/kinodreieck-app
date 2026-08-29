begin;

-- Die bestehende Titelgruppenprojektion liefert die stabile Werk-ID, aber
-- keinen Werktitel. Der Wrapper ergaenzt nur bereits sichtbare Feedereignisse
-- aus demselben globalen Targetrecord; Abo-, Event- und Evidence-Gates bleiben
-- vollstaendig im bisherigen Feedpfad.
alter function public.kd_radar_pilot_feed(uuid[])
  rename to kd_radar_pilot_feed_work_title_internal;

revoke all on function public.kd_radar_pilot_feed_work_title_internal(uuid[])
  from public, anon, authenticated;
grant execute on function public.kd_radar_pilot_feed_work_title_internal(uuid[])
  to service_role;

create function public.kd_radar_pilot_feed(
  p_operation_ids uuid[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_feed jsonb;
  v_events jsonb := '[]'::jsonb;
begin
  v_feed := public.kd_radar_pilot_feed_work_title_internal(p_operation_ids);

  select coalesce(jsonb_agg(
    case
      when item.value ? 'title' then item.value
      when target.canonical_title is not null then
        item.value || jsonb_build_object('title',target.canonical_title)
      else item.value
    end order by item.ordinal
  ), '[]'::jsonb)
    into v_events
    from jsonb_array_elements(coalesce(v_feed -> 'events','[]'::jsonb))
      with ordinality as item(value,ordinal)
    left join public.kd_radar_targets target
      on target.target_key = item.value ->> 'targetId';

  return jsonb_set(v_feed,'{events}',v_events,false);
end
$$;

revoke all on function public.kd_radar_pilot_feed(uuid[])
  from public, anon, authenticated;
grant execute on function public.kd_radar_pilot_feed(uuid[])
  to authenticated, service_role;

comment on function public.kd_radar_pilot_feed(uuid[]) is
  'Projiziert bereits sichtbare Radarereignisse mit stabiler Werk-ID und kanonischem Werktitel.';

commit;
