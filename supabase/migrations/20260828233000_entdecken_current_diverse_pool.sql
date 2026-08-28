-- Kinodreieck · aktueller, quellengedeckelter Entdecken-Pool (Format 6)
-- =============================================================================
-- Additive Forward-Migration. Historische Migrationen und der bytehistorische
-- Format-5-Validator bleiben unverändert. Der aktive Format-6-Pfad ersetzt
-- Joyn durch die offiziellen Netflix-AT-Wochencharts, begrenzt Netflix auf
-- 10/25 Titel und bindet weiterhin die OeFI-/Comscore-Wochenendcharts.
-- =============================================================================

begin;

update public.kd_entdecken_sources
   set active = false,
       updated_at = clock_timestamp()
 where active
   and source_class = 'chart'
   and rights_status = 'owner_private'
   and source_id not in ('chart:netflix-weekly-at','chart:oefi-weekend-at');

insert into public.kd_entdecken_sources (
  source_id, domain, publisher_family, source_class, rights_status,
  attribution_approved, subdomains_allowed, active, terms_url, terms_checked_on
) values
  (
    'chart:netflix-weekly-at', 'netflix.com', 'Netflix, Inc.', 'chart',
    'owner_private', true, true, true,
    'https://help.netflix.com/legal/termsofuse', date '2026-08-28'
  ),
  (
    'chart:oefi-weekend-at', 'filminstitut.at', 'Österreichisches Filminstitut', 'chart',
    'owner_private', true, false, true,
    'https://filminstitut.at/impressum', date '2026-08-28'
  )
on conflict (source_id) do update
   set domain = excluded.domain,
       publisher_family = excluded.publisher_family,
       source_class = excluded.source_class,
       rights_status = excluded.rights_status,
       attribution_approved = excluded.attribution_approved,
       subdomains_allowed = excluded.subdomains_allowed,
       active = excluded.active,
       terms_url = excluded.terms_url,
       terms_checked_on = excluded.terms_checked_on,
       updated_at = clock_timestamp();

create or replace function public.kd_entdecken_public_payload_valid_v6(
  p_payload jsonb,
  p_today date
) returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_annotation jsonb;
  v_count integer;
  v_distinct integer;
  v_cinema integer;
  v_streaming_film integer;
  v_streaming_series integer;
  v_netflix integer;
  v_oefi integer;
  v_source text;
  v_type text;
  v_measured_on date;
begin
  if p_today is null or jsonb_typeof(p_payload) is distinct from 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) is distinct from 10::bigint
     or not (p_payload ?& array[
       'format','feedId','region','sourceId','sourceIds','isoWeek',
       'refreshedOn','validUntil','items','annotations'
     ])
     or p_payload->>'format' is distinct from '6'
     or p_payload->>'feedId' is distinct from 'public:weekly-market-mix-at'
     or p_payload->>'region' is distinct from 'AT'
     or p_payload->>'sourceId' is distinct from 'chart:market-mix-at'
     or p_payload->>'isoWeek' is distinct from to_char(p_today, 'IYYY-"W"IW')
     or p_payload->>'refreshedOn' is distinct from p_today::text
     or p_payload->>'validUntil' is distinct from (p_today + 6)::text
     or jsonb_typeof(p_payload->'sourceIds') is distinct from 'array'
     or jsonb_array_length(p_payload->'sourceIds') is distinct from 2
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(p_payload->'sourceIds') source_id(value)
        where jsonb_typeof(value) is distinct from 'string'
           or value #>> '{}' not in ('chart:netflix-weekly-at','chart:oefi-weekend-at')
     )
     or (select count(distinct value #>> '{}')
           from pg_catalog.jsonb_array_elements(p_payload->'sourceIds')) is distinct from 2::bigint
     or jsonb_typeof(p_payload->'items') is distinct from 'array'
     or jsonb_array_length(p_payload->'items') is distinct from 25
     or jsonb_typeof(p_payload->'annotations') is distinct from 'array'
     or jsonb_array_length(p_payload->'annotations') > 25 then
    return false;
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_payload->'items') loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_item)) is distinct from 10::bigint
       or not (v_item ?& array[
         'title','sourceItemId','sourceId','sourceLabel','mediaType','genres',
         'availability','popularity','sourceUrl','fetchedAt'
       ])
       or btrim(v_item->>'title') is distinct from v_item->>'title'
       or length(v_item->>'title') not between 1 and 200
       or v_item->>'sourceItemId' !~ '^[fs]_[a-z0-9]+(-[a-z0-9]+)*$'
       or length(v_item->>'sourceItemId') > 182
       or v_item->>'sourceId' not in ('chart:netflix-weekly-at','chart:oefi-weekend-at')
       or v_item->>'mediaType' not in ('film','series')
       or jsonb_typeof(v_item->'genres') is distinct from 'array'
       or jsonb_array_length(v_item->'genres') > 8
       or jsonb_typeof(v_item->'availability') is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_item->'availability')) is distinct from 4::bigint
       or not (v_item->'availability' ?& array['region','market','service','licenseTypes'])
       or v_item#>>'{availability,region}' is distinct from 'AT'
       or v_item#>>'{availability,market}' not in ('cinema','streaming')
       or jsonb_typeof(v_item#>'{availability,licenseTypes}') is distinct from 'array'
       or jsonb_array_length(v_item#>'{availability,licenseTypes}') > 4
       or jsonb_typeof(v_item->'popularity') is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_item->'popularity')) is distinct from 4::bigint
       or not (v_item->'popularity' ?& array['metric','rank','measuredOn','value'])
       or jsonb_typeof(v_item#>'{popularity,rank}') is distinct from 'number'
       or (v_item#>>'{popularity,rank}')::integer not between 1 and 50
       or v_item#>>'{popularity,measuredOn}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or v_item#>>'{popularity,measuredOn}' > p_today::text
       or v_item->>'fetchedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' then
      return false;
    end if;

    select count(*), count(distinct lower(value #>> '{}'))
      into v_count, v_distinct
      from pg_catalog.jsonb_array_elements(v_item->'genres');
    if v_count is distinct from v_distinct or exists (
      select 1 from pg_catalog.jsonb_array_elements(v_item->'genres') genre(value)
       where jsonb_typeof(value) is distinct from 'string'
          or btrim(value #>> '{}') is distinct from value #>> '{}'
          or length(value #>> '{}') not between 1 and 80
    ) then return false; end if;

    select count(*), count(distinct value #>> '{}')
      into v_count, v_distinct
      from pg_catalog.jsonb_array_elements(v_item#>'{availability,licenseTypes}');
    if v_count is distinct from v_distinct or exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_item#>'{availability,licenseTypes}') license(value)
       where jsonb_typeof(value) is distinct from 'string'
          or value #>> '{}' not in ('AVOD','FVOD','SVOD')
    ) then return false; end if;

    v_source := v_item->>'sourceId';
    v_type := v_item->>'mediaType';
    v_measured_on := (v_item#>>'{popularity,measuredOn}')::date;
    if v_source = 'chart:netflix-weekly-at' then
      if v_item->>'sourceLabel' is distinct from 'Netflix Top 10 Österreich'
         or v_item#>>'{availability,market}' is distinct from 'streaming'
         or v_item#>>'{availability,service}' is distinct from 'Netflix'
         or v_count is distinct from 1
         or v_item#>>'{availability,licenseTypes,0}' is distinct from 'SVOD'
         or v_item#>>'{popularity,metric}' is distinct from 'weekly-country-rank'
         or jsonb_typeof(v_item#>'{popularity,value}') is distinct from 'null'
         or v_measured_on < p_today - 9
         or extract(isodow from v_measured_on)::integer is distinct from 7
         or (v_type = 'film' and v_item->>'sourceUrl' is distinct from
           'https://www.netflix.com/tudum/top10/austria/films')
         or (v_type = 'series' and v_item->>'sourceUrl' is distinct from
           'https://www.netflix.com/tudum/top10/austria/tv') then
        return false;
      end if;
    elsif v_source = 'chart:oefi-weekend-at' then
      if v_item->>'sourceLabel' is distinct from 'Österreichisches Filminstitut'
         or v_type is distinct from 'film'
         or v_item#>>'{availability,market}' is distinct from 'cinema'
         or jsonb_typeof(v_item#>'{availability,service}') is distinct from 'null'
         or v_count is distinct from 0
         or v_item#>>'{popularity,metric}' is distinct from 'weekend-admissions'
         or jsonb_typeof(v_item#>'{popularity,value}') is distinct from 'number'
         or (v_item#>>'{popularity,value}')::bigint < 0
         or v_item->>'sourceUrl' is distinct from 'https://filminstitut.at/charts' then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  select
    count(*) filter (where value#>>'{availability,market}' = 'cinema'),
    count(*) filter (
      where value#>>'{availability,market}' = 'streaming' and value->>'mediaType' = 'film'
    ),
    count(*) filter (
      where value#>>'{availability,market}' = 'streaming' and value->>'mediaType' = 'series'
    ),
    count(*) filter (where value->>'sourceId' = 'chart:netflix-weekly-at'),
    count(*) filter (where value->>'sourceId' = 'chart:oefi-weekend-at')
    into v_cinema, v_streaming_film, v_streaming_series, v_netflix, v_oefi
    from pg_catalog.jsonb_array_elements(p_payload->'items');
  if v_cinema is distinct from 15
     or v_streaming_film is distinct from 5
     or v_streaming_series is distinct from 5
     or v_netflix is distinct from 10
     or v_oefi is distinct from 15
     or (select count(distinct value->>'sourceItemId')
           from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 25::bigint
     or (select count(distinct lower(value->>'title'))
           from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 25::bigint
     or (select count(distinct (value->>'sourceId') || '|' || (value->>'mediaType')
           || '|' || (value#>>'{popularity,rank}'))
           from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 25::bigint
     or (select count(distinct value->>'fetchedAt')
           from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 1::bigint then
    return false;
  end if;

  for v_annotation in select value from pg_catalog.jsonb_array_elements(p_payload->'annotations') loop
    if jsonb_typeof(v_annotation) is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_annotation)) is distinct from 6::bigint
       or not (v_annotation ?& array[
         'sourceItemId','qid','mediaType','releaseYear','externalIds','resolvedAt'
       ])
       or v_annotation->>'qid' !~ '^Q[1-9][0-9]*$'
       or v_annotation->>'mediaType' not in ('film','series')
       or jsonb_typeof(v_annotation->'externalIds') is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_annotation->'externalIds')) > 2
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(v_annotation->'externalIds') external_key(name)
          where name not in ('imdb','tmdb')
       )
       or (v_annotation->'externalIds' ? 'imdb'
           and v_annotation#>>'{externalIds,imdb}' !~ '^tt[0-9]{7,10}$')
       or (v_annotation->'externalIds' ? 'tmdb'
           and v_annotation#>>'{externalIds,tmdb}' !~ '^[1-9][0-9]{0,8}$')
       or jsonb_typeof(v_annotation->'releaseYear') not in ('null','number')
       or (jsonb_typeof(v_annotation->'releaseYear') = 'number'
           and (v_annotation->>'releaseYear')::integer not between 1888 and 2100)
       or (jsonb_typeof(v_annotation->'releaseYear') = 'null'
           and (select count(*) from pg_catalog.jsonb_object_keys(v_annotation->'externalIds')) = 0)
       or v_annotation->>'resolvedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
       or not exists (
         select 1 from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
          where value->>'sourceItemId' = v_annotation->>'sourceItemId'
            and value->>'mediaType' = v_annotation->>'mediaType'
       ) then return false; end if;
  end loop;
  if (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'annotations'))
     is distinct from
     (select count(distinct value->>'sourceItemId')
        from pg_catalog.jsonb_array_elements(p_payload->'annotations')) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end
$$;

create or replace function public.kd_entdecken_mixed_sources_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (select count(*) from public.kd_entdecken_sources
      where active and source_class = 'chart' and rights_status = 'owner_private') = 2
    and exists (
      select 1 from public.kd_entdecken_sources
       where source_id = 'chart:netflix-weekly-at'
         and domain = 'netflix.com'
         and publisher_family = 'Netflix, Inc.'
         and source_class = 'chart'
         and rights_status = 'owner_private'
         and attribution_approved
         and subdomains_allowed
         and active
    )
    and exists (
      select 1 from public.kd_entdecken_sources
       where source_id = 'chart:oefi-weekend-at'
         and domain = 'filminstitut.at'
         and publisher_family = 'Österreichisches Filminstitut'
         and source_class = 'chart'
         and rights_status = 'owner_private'
         and attribution_approved
         and not subdomains_allowed
         and active
    )
$$;

create or replace function public.kd_entdecken_public_feed_readback(
  p_fence_token bigint
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb;
  v_refreshed date;
begin
  if auth.role() is distinct from 'service_role'
     or p_fence_token is null or p_fence_token <= 0 then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  select payload, refreshed_on into v_payload, v_refreshed
    from public.kd_entdecken_daily_feed
   where singleton and status = 'ready' and ready_fence_token = p_fence_token;
  if not found
     or v_payload->>'format' is distinct from '6'
     or not public.kd_entdecken_public_payload_valid_v6(v_payload, v_refreshed)
     or not public.kd_entdecken_mixed_sources_ready() then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  return jsonb_build_object(
    'ok',true,'status','verified','feed',v_payload,'fenceToken',p_fence_token,
    'provenance',jsonb_build_object(
      'itemCount',25,'sourceCount',2,
      'sourceIds',jsonb_build_array('chart:netflix-weekly-at','chart:oefi-weekend-at'),
      'rightsStatus','owner_private'
    )
  );
end
$$;

revoke all on function public.kd_entdecken_public_payload_valid_v6(jsonb,date)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_mixed_sources_ready()
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_public_feed_readback(bigint)
  from public, anon, authenticated;

grant execute on function public.kd_entdecken_public_payload_valid_v6(jsonb,date) to service_role;
grant execute on function public.kd_entdecken_mixed_sources_ready() to service_role;
grant execute on function public.kd_entdecken_public_feed_readback(bigint) to service_role;

comment on function public.kd_entdecken_public_payload_valid_v6(jsonb,date) is
  'Fail-closed Format-6-Validator: 25 eindeutige Items, OeFI 15 und Netflix AT 5 Filme plus 5 Serien; Netflix-Quellenanteil maximal 40 Prozent.';
comment on function public.kd_entdecken_mixed_sources_ready() is
  'Bindet fuer den aktiven privaten Format-6-Pfad ausschliesslich Netflix AT und OeFI; Joyn bleibt inaktiv.';
comment on function public.kd_entdecken_public_feed_readback(bigint) is
  'Providerfreier Fence-Readback fuer den aktuellen Format-6-Pool mit 25 Items und zwei hart gebundenen Quellen.';

commit;
