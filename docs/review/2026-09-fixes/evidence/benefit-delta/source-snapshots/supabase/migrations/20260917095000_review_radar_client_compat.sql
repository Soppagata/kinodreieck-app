begin;

-- The public feed keeps the original v1 work-start contract. The stored v2
-- platform identity and stable event/version UUIDs are deliberately unchanged.
-- Both generations distinguish events by UUID, not by this work-start key.
create or replace function public.kd_radar_text_wire_v1_key(
  p_title text, p_date date, p_event_type text, p_target_type text,
  p_season integer
) returns text language plpgsql immutable set search_path=pg_catalog,public as $$
declare
  v_basis bytea := convert_to(translate(regexp_replace(btrim(p_title),' +',' ','g'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') || '|' ||
    to_char(p_date,'YYYY-MM-DD') || '|' || p_event_type || '|' || p_target_type || '|' ||
    coalesce(p_season::text,'-'),'UTF8');
  v_first bigint := 2166136261;
  v_second bigint := 2654435769;
  v_byte integer;
begin
  if v_basis is null then raise exception 'radar_text_identity_invalid' using errcode='22023'; end if;
  for i in 0..length(v_basis)-1 loop
    v_byte := get_byte(v_basis,i);
    v_first := mod((v_first # v_byte)::numeric * 16777619,4294967296)::bigint;
    v_second := mod((v_second # (v_byte+i))::numeric * 2246822507,4294967296)::bigint;
  end loop;
  return 'release:v1:' || lpad(to_hex(v_first),8,'0') || lpad(to_hex(v_second),8,'0');
end $$;
revoke all on function public.kd_radar_text_wire_v1_key(text,date,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.kd_radar_text_wire_v1_key(text,date,text,text,integer) to service_role;

do $patch$
declare v_definition text;
begin
  select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[])'::regprocedure) into v_definition;
  if position('''targetId'',f.release_key' in v_definition)>0 then
    execute replace(v_definition,'''targetId'',f.release_key',
      '''targetId'',public.kd_radar_text_wire_v1_key(f.title,f.event_date,f.event_type,f.target_type,f.season_number)');
  elsif position('''targetId'',public.kd_radar_text_wire_v1_key(f.title,f.event_date,f.event_type,f.target_type,f.season_number)' in v_definition)=0 then
    raise exception 'radar_text_wire_definition_drift';
  end if;
end $patch$;
notify pgrst, 'reload schema';
commit;
