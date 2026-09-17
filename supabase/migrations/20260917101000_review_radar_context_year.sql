begin;
-- Preserve the effective function (including current authorization). Add only
-- an already stored, valid numeric year to structured work/series contexts.
do $patch$
declare v_definition text;
begin
  select pg_get_functiondef('public.kd_radar_websearch_context(uuid,text)'::regprocedure) into v_definition;
  if position('    ) end
    into v_context' in v_definition)=0 then
    raise exception 'radar_context_year_definition_drift'; end if;
  v_definition := replace(v_definition,'    ) end
    into v_context',
    $new$    ) || case when jsonb_typeof(t.external_ids->'releaseYear')='number'
      and (t.external_ids->>'releaseYear') ~ '^[0-9]{4}$' then
        case when (t.external_ids->>'releaseYear')::integer between 1888
          and extract(year from current_timestamp at time zone 'UTC')::integer+10
        then jsonb_build_object('releaseYear',(t.external_ids->>'releaseYear')::integer)
        else '{}'::jsonb end
      else '{}'::jsonb end end
    into v_context$new$);
  execute v_definition;
end $patch$;
notify pgrst, 'reload schema';
commit;
