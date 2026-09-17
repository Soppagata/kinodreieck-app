begin;

-- Text release v2 adds the exact normalized platform to the existing identity.
-- Both hashes use unsigned 32-bit arithmetic over UTF-8, identical to JS.
create function public.kd_radar_text_release_key(
  p_title text, p_date date, p_event_type text, p_target_type text,
  p_season integer, p_platform text
) returns text language plpgsql immutable set search_path=pg_catalog,public as $$
declare
  v_basis bytea := convert_to(translate(regexp_replace(btrim(p_title),' +',' ','g'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') || '|' ||
    to_char(p_date,'YYYY-MM-DD') || '|' || p_event_type || '|' || p_target_type || '|' ||
    coalesce(p_season::text,'-') || '|' || case when p_platform is null or p_platform = ''
      or lower(p_platform) in ('-','unknown','unbekannt','n/a') then '-' else p_platform end,'UTF8');
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
  return 'release:v2:' || lpad(to_hex(v_first),8,'0') || lpad(to_hex(v_second),8,'0');
end $$;
revoke all on function public.kd_radar_text_release_key(text,date,text,text,integer,text)
  from public,anon,authenticated;
grant execute on function public.kd_radar_text_release_key(text,date,text,text,integer,text) to service_role;

-- Migrate the surviving v1 evidence in place. No reconstruction of previously
-- overwritten sources is possible. Keep finding_id/event_version_id, receipts,
-- timestamps and all source fields. A collision aborts the whole transaction.
lock table public.kd_radar_text_findings in access exclusive mode;
alter table public.kd_radar_text_findings drop constraint kd_radar_text_findings_release_key_check;
alter table public.kd_radar_text_findings add constraint kd_radar_text_findings_release_key_check
  check (release_key ~ '^release:v[12]:[a-f0-9]{16}$');
update public.kd_radar_text_findings set release_key=public.kd_radar_text_release_key(
  title,event_date,event_type,target_type,season_number,platform);
alter table public.kd_radar_text_findings drop constraint kd_radar_text_findings_release_key_check;
alter table public.kd_radar_text_findings add constraint kd_radar_text_findings_release_key_check
  check (release_key ~ '^release:v2:[a-f0-9]{16}$');

-- Rolling compatibility: accept the old service payload, but derive its new
-- persistence key from validated fields. Old/new requests reach the same row.
-- Keep the existing capability, subscription lock, date and evidence guards.
do $patch$
declare v_definition text;
begin
  select pg_get_functiondef('public.kd_radar_websearch_upsert_text_finding(uuid,uuid,jsonb)'::regprocedure) into v_definition;
  if position('^release:v1:[a-f0-9]{16}$' in v_definition)=0
    or position('  insert into public.kd_radar_text_findings as f (' in v_definition)=0 then
    raise exception 'radar_text_identity_definition_drift'; end if;
  v_definition := replace(v_definition,'^release:v1:[a-f0-9]{16}$','^release:v[12]:[a-f0-9]{16}$');
  v_definition := replace(v_definition,'  v_changed boolean;','  v_changed boolean; v_release_key text;');
  v_definition := replace(v_definition,'  insert into public.kd_radar_text_findings as f (',
    $new$  v_release_key := public.kd_radar_text_release_key(
    p_payload->>'workTitle',v_date,p_payload->>'eventType',p_payload->>'workTargetType',
    (p_payload->>'seasonNumber')::integer,p_payload->>'platform');
  if p_payload->>'targetKey' like 'release:v2:%' and p_payload->>'targetKey' <> v_release_key then
    raise exception 'radar_text_identity_mismatch' using errcode='22023'; end if;
  p_payload := jsonb_set(p_payload,'{targetKey}',to_jsonb(v_release_key));
  insert into public.kd_radar_text_findings as f ($new$);
  execute v_definition;
end $patch$;
-- Tie ordering no longer depends on random event UUIDs or arrival order.
do $patch$
declare v_definition text;
begin
  select pg_get_functiondef('public.kd_radar_pilot_feed(uuid[])'::regprocedure) into v_definition;
  if position('order by f.event_date,f.title,f.finding_id' in v_definition)=0 then
    raise exception 'radar_text_feed_definition_drift'; end if;
  execute replace(v_definition,'order by f.event_date,f.title,f.finding_id',
    'order by f.event_date,f.title,f.platform,f.release_key,f.finding_id');
end $patch$;
notify pgrst, 'reload schema';
commit;
