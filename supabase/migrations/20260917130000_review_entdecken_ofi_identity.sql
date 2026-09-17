-- P08 / E07-002: additive OEFI-Identitaetsannotation fuer Format 8 UND 9.
-- Bestehende rohe Chartzeilen, Mengen, Dienste und Save-/Lease-Vertraege bleiben
-- durch die bisherigen v8/v9-Validatoren geschuetzt. Alte Feeds ohne Annotation
-- bleiben lesbar. Neue Annotationen stammen ausschliesslich vom bestehenden
-- Wikidata-Resolver (QID, Jahr, optionale IMDb/TMDB-ID, Aufloesezeit).
begin;

create function public.kd_entdecken_oefi_annotations_valid(p_payload jsonb, p_today date)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare
  v_annotation jsonb;
  v_time timestamptz;
begin
  if not (p_payload ? 'annotations') then return true; end if;
  if jsonb_typeof(p_payload->'annotations') is distinct from 'array'
     or jsonb_array_length(p_payload->'annotations') > 15 then return false; end if;
  for v_annotation in select value from jsonb_array_elements(p_payload->'annotations') loop
    if jsonb_typeof(v_annotation) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_annotation)) <> 6
       or not (v_annotation ?& array['sourceItemId','qid','mediaType','releaseYear','externalIds','resolvedAt'])
       or jsonb_typeof(v_annotation->'sourceItemId') is distinct from 'string'
       or jsonb_typeof(v_annotation->'qid') is distinct from 'string'
       or v_annotation->>'qid' !~ '^Q[1-9][0-9]*$'
       or v_annotation->>'mediaType' is distinct from 'film'
       or jsonb_typeof(v_annotation->'releaseYear') is distinct from 'number'
       or v_annotation->>'releaseYear' !~ '^[0-9]+$'
       or (v_annotation->>'releaseYear')::integer not between 1888 and extract(year from p_today)::integer + 10
       or jsonb_typeof(v_annotation->'externalIds') is distinct from 'object'
       or exists (select 1 from jsonb_each(v_annotation->'externalIds') e
         where e.key not in ('imdb','tmdb') or jsonb_typeof(e.value) is distinct from 'string'
           or (e.key='imdb' and e.value#>>'{}' !~ '^tt[0-9]{7,10}$')
           or (e.key='tmdb' and e.value#>>'{}' !~ '^[1-9][0-9]{0,8}$'))
       or jsonb_typeof(v_annotation->'resolvedAt') is distinct from 'string'
       or v_annotation->>'resolvedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
       or (select count(*) from jsonb_array_elements(p_payload->'items') i
         where i->>'sourceItemId'=v_annotation->>'sourceItemId'
           and i->>'sourceId'='chart:oefi-weekend-at' and i->>'mediaType'='film') <> 1
    then return false; end if;
    v_time := (v_annotation->>'resolvedAt')::timestamptz;
    if to_char(v_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       is distinct from v_annotation->>'resolvedAt' then return false; end if;
  end loop;
  return (select count(distinct value->>'sourceItemId') from jsonb_array_elements(p_payload->'annotations'))
    = jsonb_array_length(p_payload->'annotations');
exception when others then return false;
end
$$;

-- Der zentrale Validator wird von echtem Save, Status und Readback verwendet.
-- Die formatbezogenen Basisvalidatoren bleiben unveraendert und pruefen den
-- vollstaendigen urspruenglichen Vertrag nach Abtrennen der neuen Annotation.
create or replace function public.kd_entdecken_public_payload_valid(p_payload jsonb,p_today date)
returns boolean language sql immutable set search_path=pg_catalog,public as $$
  select case p_payload->>'format'
    when '9' then public.kd_entdecken_public_payload_valid_v9(p_payload-'annotations',p_today)
      and public.kd_entdecken_oefi_annotations_valid(p_payload,p_today)
    when '8' then public.kd_entdecken_public_payload_valid_v8(p_payload-'annotations',p_today)
      and public.kd_entdecken_oefi_annotations_valid(p_payload,p_today)
    when '6' then public.kd_entdecken_public_payload_valid_v6(p_payload,p_today)
    when '5' then public.kd_entdecken_public_payload_valid_v5(p_payload,p_today)
    else false end
$$;
revoke all on function public.kd_entdecken_oefi_annotations_valid(jsonb,date) from public,anon,authenticated;
grant execute on function public.kd_entdecken_oefi_annotations_valid(jsonb,date) to service_role;
commit;
