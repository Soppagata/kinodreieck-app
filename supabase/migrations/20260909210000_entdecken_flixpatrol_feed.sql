-- Kinodreieck · natürlicher Entdecken-Tagesfeed mit FlixPatrol (Format 8)
-- =============================================================================
-- Additive Forward-Migration. Der gespeicherte Format-6-Feed bleibt lesbar und
-- wird erst nach einem vollständigen, fence-gebundenen Format-8-Erfolg ersetzt.
-- FlixPatrol-Untercharts werden nicht in das domain-eindeutige Quellenregister
-- dupliziert; ihre festen IDs stammen aus dem separaten E2-Vokabular.
-- =============================================================================

begin;

create function public.kd_entdecken_public_payload_valid_v8(
  p_payload jsonb,
  p_today date
) returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_source text;
  v_type text;
  v_service text;
  v_count integer;
  v_distinct integer;
  v_measured date;
  v_chart_date date;
  v_fetched timestamptz;
begin
  if p_today is null or jsonb_typeof(p_payload) is distinct from 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) is distinct from 10::bigint
     or not (p_payload ?& array[
       'format','feedId','region','sourceId','sourceIds','isoWeek','chartDate',
       'refreshedOn','validUntil','items'
     ])
     or jsonb_typeof(p_payload->'format') is distinct from 'number'
     or jsonb_typeof(p_payload->'feedId') is distinct from 'string'
     or jsonb_typeof(p_payload->'region') is distinct from 'string'
     or jsonb_typeof(p_payload->'sourceId') is distinct from 'string'
     or jsonb_typeof(p_payload->'isoWeek') is distinct from 'string'
     or jsonb_typeof(p_payload->'chartDate') is distinct from 'string'
     or jsonb_typeof(p_payload->'refreshedOn') is distinct from 'string'
     or jsonb_typeof(p_payload->'validUntil') is distinct from 'string'
     or p_payload->>'format' is distinct from '8'
     or p_payload->>'feedId' is distinct from 'public:daily-market-mix-at-v2'
     or p_payload->>'region' is distinct from 'AT'
     or p_payload->>'sourceId' is distinct from 'chart:daily-market-mix-at'
     or p_payload->>'isoWeek' is distinct from to_char(p_today, 'IYYY-"W"IW')
     or p_payload->>'refreshedOn' is distinct from p_today::text
     or p_payload->>'validUntil' is distinct from p_today::text
     or p_payload->>'chartDate' is distinct from (p_today - 1)::text
     or jsonb_typeof(p_payload->'sourceIds') is distinct from 'array'
     or jsonb_array_length(p_payload->'sourceIds') is distinct from 5
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(p_payload->'sourceIds') source_id(value)
        where jsonb_typeof(value) is distinct from 'string'
          or value #>> '{}' not in (
            'chart:oefi-weekend-at','chart:netflix-weekly-at',
            'chart:flixpatrol-prime-at','chart:flixpatrol-disney-at',
            'chart:flixpatrol-apple-tv-at'
          )
     )
     or (select count(distinct value #>> '{}')
           from pg_catalog.jsonb_array_elements(p_payload->'sourceIds')) is distinct from 5::bigint
     or jsonb_typeof(p_payload->'items') is distinct from 'array'
     or jsonb_array_length(p_payload->'items') is distinct from 50 then
    return false;
  end if;
  v_chart_date := (p_payload->>'chartDate')::date;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_payload->'items') loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_item)) is distinct from 12::bigint
       or not (v_item ?& array[
         'title','sourceItemId','sourceId','sourceLabel','mediaType','releaseYear',
         'externalIds','genres','availability','popularity','sourceUrl','fetchedAt'
       ])
       or jsonb_typeof(v_item->'title') is distinct from 'string'
       or jsonb_typeof(v_item->'sourceItemId') is distinct from 'string'
       or jsonb_typeof(v_item->'sourceId') is distinct from 'string'
       or jsonb_typeof(v_item->'sourceLabel') is distinct from 'string'
       or jsonb_typeof(v_item->'mediaType') is distinct from 'string'
       or jsonb_typeof(v_item->'sourceUrl') is distinct from 'string'
       or jsonb_typeof(v_item->'fetchedAt') is distinct from 'string'
       or btrim(v_item->>'title') is distinct from v_item->>'title'
       or length(v_item->>'title') not between 1 and 200
       or v_item->>'sourceId' not in (
         'chart:oefi-weekend-at','chart:netflix-weekly-at',
         'chart:flixpatrol-prime-at','chart:flixpatrol-disney-at',
         'chart:flixpatrol-apple-tv-at'
       )
       or v_item->>'mediaType' not in ('film','series')
       or jsonb_typeof(v_item->'genres') is distinct from 'array'
       or jsonb_array_length(v_item->'genres') > 8
       or jsonb_typeof(v_item->'availability') is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_item->'availability')) is distinct from 4::bigint
       or not (v_item->'availability' ?& array['region','market','service','licenseTypes'])
       or jsonb_typeof(v_item#>'{availability,region}') is distinct from 'string'
       or jsonb_typeof(v_item#>'{availability,market}') is distinct from 'string'
       or jsonb_typeof(v_item#>'{availability,service}') not in ('string','null')
       or v_item#>>'{availability,region}' is distinct from 'AT'
       or jsonb_typeof(v_item#>'{availability,licenseTypes}') is distinct from 'array'
       or jsonb_typeof(v_item->'popularity') is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_item->'popularity')) is distinct from 4::bigint
       or not (v_item->'popularity' ?& array['metric','rank','measuredOn','value'])
       or jsonb_typeof(v_item#>'{popularity,metric}') is distinct from 'string'
       or jsonb_typeof(v_item#>'{popularity,measuredOn}') is distinct from 'string'
       or jsonb_typeof(v_item#>'{popularity,rank}') is distinct from 'number'
       or v_item#>>'{popularity,rank}' !~ '^[0-9]+$'
       or (v_item#>>'{popularity,rank}')::integer not between 1 and 50
       or v_item#>>'{popularity,measuredOn}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or v_item#>>'{popularity,measuredOn}' > p_today::text
       or v_item->>'fetchedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
       or jsonb_typeof(v_item->'externalIds') is distinct from 'object' then
      return false;
    end if;
    v_fetched := (v_item->>'fetchedAt')::timestamptz;

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
      select 1 from pg_catalog.jsonb_array_elements(v_item#>'{availability,licenseTypes}') license(value)
       where jsonb_typeof(value) is distinct from 'string'
          or value #>> '{}' not in ('AVOD','FVOD','SVOD')
    ) then return false; end if;

    v_source := v_item->>'sourceId';
    v_type := v_item->>'mediaType';
    v_service := v_item#>>'{availability,service}';
    v_measured := (v_item#>>'{popularity,measuredOn}')::date;
    if v_source in ('chart:oefi-weekend-at','chart:netflix-weekly-at') then
      if jsonb_typeof(v_item->'releaseYear') is distinct from 'null'
         or (select count(*) from pg_catalog.jsonb_object_keys(v_item->'externalIds')) is distinct from 0::bigint
         or v_item->>'sourceItemId' !~ '^[fs]_[a-z0-9]+(-[a-z0-9]+)*$'
         or length(v_item->>'sourceItemId') > 182 then return false; end if;
      if v_source = 'chart:oefi-weekend-at' then
        if v_item->>'sourceLabel' is distinct from 'Österreichisches Filminstitut'
           or v_type is distinct from 'film'
           or v_item#>>'{availability,market}' is distinct from 'cinema'
           or jsonb_typeof(v_item#>'{availability,service}') is distinct from 'null'
           or v_count is distinct from 0
           or v_item#>>'{popularity,metric}' is distinct from 'weekend-admissions'
           or jsonb_typeof(v_item#>'{popularity,value}') is distinct from 'number'
           or v_item#>>'{popularity,value}' !~ '^[0-9]+$'
           or v_item->>'sourceUrl' is distinct from 'https://filminstitut.at/charts' then return false; end if;
      else
        if v_item->>'sourceLabel' is distinct from 'Netflix Top 10 Österreich'
           or v_item#>>'{availability,market}' is distinct from 'streaming'
           or v_service is distinct from 'Netflix'
           or v_count is distinct from 1
           or v_item#>>'{availability,licenseTypes,0}' is distinct from 'SVOD'
           or v_item#>>'{popularity,metric}' is distinct from 'weekly-country-rank'
           or jsonb_typeof(v_item#>'{popularity,value}') is distinct from 'null'
           or v_measured < p_today - 9
           or extract(isodow from v_measured)::integer is distinct from 7
           or (v_type = 'film' and v_item->>'sourceUrl' is distinct from 'https://www.netflix.com/tudum/top10/austria/films')
           or (v_type = 'series' and v_item->>'sourceUrl' is distinct from 'https://www.netflix.com/tudum/top10/austria/tv') then return false; end if;
      end if;
    else
      if v_item->>'sourceItemId' !~ '^ttl_[A-Za-z0-9]{20,40}$'
         or jsonb_typeof(v_item->'releaseYear') is distinct from 'number'
         or v_item->>'releaseYear' !~ '^[0-9]+$'
         or (v_item->>'releaseYear')::integer not between 1888 and 2100
         or (select count(*) from pg_catalog.jsonb_object_keys(v_item->'externalIds')) not between 1 and 3
         or not (v_item->'externalIds' ? 'flixpatrol')
         or v_item#>>'{externalIds,flixpatrol}' is distinct from v_item->>'sourceItemId'
         or exists (
           select 1 from pg_catalog.jsonb_object_keys(v_item->'externalIds') external_key(name)
            where name not in ('flixpatrol','imdb','tmdb')
         )
         or (v_item->'externalIds' ? 'imdb' and v_item#>>'{externalIds,imdb}' !~ '^tt[0-9]{7,10}$')
         or (v_item->'externalIds' ? 'tmdb' and v_item#>>'{externalIds,tmdb}' !~ '^[1-9][0-9]{0,8}$')
         or v_item#>>'{availability,market}' is distinct from 'streaming'
         or v_count is distinct from 1
         or v_item#>>'{availability,licenseTypes,0}' is distinct from 'SVOD'
         or v_item#>>'{popularity,metric}' is distinct from 'daily-provider-rank'
         or jsonb_typeof(v_item#>'{popularity,value}') is distinct from 'null'
         or (v_item#>>'{popularity,rank}')::integer > 10
         or v_measured is distinct from v_chart_date then return false; end if;
      if v_source = 'chart:flixpatrol-prime-at' and (
           v_item->>'sourceLabel' is distinct from 'Prime Video · Top 10 Österreich (FlixPatrol)'
           or v_service is distinct from 'Prime Video'
           or v_item->>'sourceUrl' is distinct from 'https://flixpatrol.com/top10/amazon-prime/austria/'
         ) then return false;
      elsif v_source = 'chart:flixpatrol-disney-at' and (
           v_item->>'sourceLabel' is distinct from 'Disney+ · Top 10 Österreich (FlixPatrol)'
           or v_service is distinct from 'Disney+'
           or v_item->>'sourceUrl' is distinct from 'https://flixpatrol.com/top10/disney/austria/'
         ) then return false;
      elsif v_source = 'chart:flixpatrol-apple-tv-at' and (
           v_type is distinct from 'film'
           or v_item->>'sourceLabel' is distinct from 'Apple TV · Top 10 Österreich (FlixPatrol)'
           or v_service is distinct from 'Apple TV'
           or v_item->>'sourceUrl' is distinct from 'https://flixpatrol.com/top10/apple-tv/austria/'
         ) then return false;
      end if;
    end if;
  end loop;

  if (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:oefi-weekend-at') is distinct from 15::bigint
     or (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:netflix-weekly-at') is distinct from 10::bigint
     or (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:flixpatrol-prime-at') is distinct from 10::bigint
     or (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:flixpatrol-disney-at') is distinct from 10::bigint
     or (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:flixpatrol-apple-tv-at') is distinct from 5::bigint
     or (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:flixpatrol-prime-at' and value->>'mediaType' = 'film') is distinct from 5::bigint
     or (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:flixpatrol-prime-at' and value->>'mediaType' = 'series') is distinct from 5::bigint
     or (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:flixpatrol-disney-at' and value->>'mediaType' = 'film') is distinct from 5::bigint
     or (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
       where value->>'sourceId' = 'chart:flixpatrol-disney-at' and value->>'mediaType' = 'series') is distinct from 5::bigint
     or (select count(distinct value->>'sourceItemId')
       from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 50::bigint
     or (select count(distinct (value->>'mediaType') || '|' || lower(value->>'title'))
       from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 50::bigint
     or (select count(distinct (value->>'sourceId') || '|' || (value->>'mediaType') || '|' || (value#>>'{popularity,rank}'))
       from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 50::bigint then
    return false;
  end if;
  return true;
exception when others then
  return false;
end
$$;

create or replace function public.kd_entdecken_public_payload_valid(p_payload jsonb, p_today date)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case p_payload->>'format'
    when '8' then public.kd_entdecken_public_payload_valid_v8(p_payload,p_today)
    when '6' then public.kd_entdecken_public_payload_valid_v6(p_payload,p_today)
    when '5' then public.kd_entdecken_public_payload_valid_v5(p_payload,p_today)
    else false
  end
$$;

create function public.kd_entdecken_flixpatrol_sources_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.kd_entdecken_mixed_sources_ready()
    and exists (select 1 from public.kd_flixpatrol_vocabulary_cache
      where resource_type='countries' and source_id='cnt_gGE4RaeXpyz2U9Q5tEMYDwri' and code='AT' and name='Austria')
    and exists (select 1 from public.kd_flixpatrol_vocabulary_cache
      where resource_type='companies' and source_id='cmp_qypvowjqFhEIpCc0HlQ6VoYk' and name='Amazon Prime')
    and exists (select 1 from public.kd_flixpatrol_vocabulary_cache
      where resource_type='companies' and source_id='cmp_oGtsgdpOrjIu3XzTEnWPt87Y' and name='Disney+')
    and exists (select 1 from public.kd_flixpatrol_vocabulary_cache
      where resource_type='companies' and source_id='cmp_VvmYc7OphiUds0Hgjbz5MESn' and name='Apple TV')
$$;

create or replace function public.kd_entdecken_weekly_feed_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_enabled boolean := false;
  v_feed public.kd_entdecken_daily_feed%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode','read','claimStatus','disabled','attemptCount',0,'maxAttempts',1,'feedReadback',null);
  end if;
  select feed_enabled and public_enabled and owner_private_source_enabled
         and not provider_enabled and not commercial_enabled
         and public.kd_entdecken_flixpatrol_sources_ready()
    into v_enabled from public.kd_entdecken_daily_settings where singleton;
  select * into v_feed from public.kd_entdecken_daily_feed where singleton;
  if not found then v_enabled := false; end if;
  return jsonb_build_object(
    'feedEnabled',coalesce(v_enabled,false),'providerEnabled',false,'today',v_today,
    'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,
    'feed',case when coalesce(v_enabled,false) then v_feed.payload else null end,
    'requestMode','read','claimStatus','read_only','attemptCount',0,'maxAttempts',1,'feedReadback',null
  );
end
$$;

create or replace function public.kd_entdecken_weekly_refresh_claim(p_source text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_enabled boolean := false;
  v_owner_override boolean := false;
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_anchor timestamptz;
  v_last_attempt_day date;
  v_due boolean := false;
  v_claim boolean := false;
  v_status text := 'held';
  v_fence bigint;
begin
  if auth.role() is distinct from 'service_role' or p_source is null or p_source not in ('scheduled','owner') then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',coalesce(p_source,'invalid'),'claimStatus','disabled',
      'attemptCount',0,'maxAttempts',1,'feedReadback',null);
  end if;
  select feed_enabled and public_enabled and owner_private_source_enabled
         and not provider_enabled and not commercial_enabled
         and public.kd_entdecken_flixpatrol_sources_ready(), staging_owner_refresh_override
    into v_enabled, v_owner_override
    from public.kd_entdecken_daily_settings where singleton for update;
  select * into v_feed from public.kd_entdecken_daily_feed where singleton for update;
  if not found then v_enabled := false; end if;
  v_anchor := case
    when v_feed.last_success_at is null then v_feed.last_public_attempt_at
    when v_feed.last_public_attempt_at is null then v_feed.last_success_at
    else greatest(v_feed.last_success_at, v_feed.last_public_attempt_at)
  end;
  v_last_attempt_day := coalesce(v_feed.last_attempt_on,(v_anchor at time zone 'Europe/Vienna')::date);
  v_due := v_last_attempt_day is null or v_last_attempt_day < v_today;
  if not coalesce(v_enabled,false) then v_status := 'disabled';
  elsif p_source = 'owner' and not coalesce(v_owner_override,false) then v_status := 'disabled';
  elsif v_feed.status = 'refreshing' and v_feed.lease_expires_at > v_now then v_status := 'in_progress';
  elsif p_source = 'scheduled' and not v_due then
    v_status := case
      when v_feed.status = 'ready' and (v_feed.last_success_at at time zone 'Europe/Vienna')::date = v_today then 'not_due'
      when v_feed.status = 'error' then 'failed' else 'held' end;
  else
    update public.kd_entdecken_daily_feed
       set last_public_attempt_at=v_now,last_attempt_on=v_today,last_attempt_iso_week=v_iso_week,
           attempt_iso_week=v_iso_week,attempt_count=1,provider_operation_id=null,
           fence_token=fence_token+1,lease_expires_at=v_now+interval '180 seconds',
           status='refreshing',last_error_code=null,last_failure_at=null,
           recovery_authorized_iso_week=null,updated_at=v_now
     where singleton returning fence_token into v_fence;
    v_claim := found;
    v_status := case when v_claim then 'claimed' else 'held' end;
  end if;
  return jsonb_build_object(
    'feedEnabled',coalesce(v_enabled,false),'providerEnabled',false,'today',v_today,
    'isoWeek',v_iso_week,'refresh',v_claim,'fenceToken',case when v_claim then v_fence else null end,
    'feed',case when coalesce(v_enabled,false) then v_feed.payload else null end,
    'requestMode',p_source,'claimStatus',v_status,
    'attemptCount',case when v_claim then 1 else 0 end,'maxAttempts',1,'feedReadback',null
  );
end
$$;

create or replace function public.kd_entdecken_daily_save(p_payload jsonb, p_fence_token bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
begin
  if auth.role() is distinct from 'service_role' or p_fence_token is null or p_fence_token <= 0
     or not public.kd_entdecken_public_payload_valid(p_payload,v_today) then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;
  lock table public.kd_entdecken_sources in share mode;
  lock table public.kd_flixpatrol_vocabulary_cache in share mode;
  if (p_payload->>'format' = '8' and not public.kd_entdecken_flixpatrol_sources_ready())
     or (p_payload->>'format' = '6' and not public.kd_entdecken_mixed_sources_ready()) then
    return jsonb_build_object('ok',false,'code','source_registry_unavailable');
  end if;
  update public.kd_entdecken_daily_feed
     set payload=p_payload,refreshed_on=v_today,refreshed_iso_week=p_payload->>'isoWeek',
         valid_until=(p_payload->>'validUntil')::date,last_success_at=v_now,status='ready',
         last_error_code=null,lease_expires_at=null,last_failure_at=null,
         provider_operation_id=null,ready_provider_operation_id=null,
         ready_fence_token=p_fence_token,recovery_authorized_iso_week=null,updated_at=v_now
   where singleton and status='refreshing' and fence_token=p_fence_token
     and last_public_attempt_at is not null and lease_expires_at >= v_now;
  if not found then return jsonb_build_object('ok',false,'code','state_invalid'); end if;
  return jsonb_build_object('ok',true,'status','saved');
end
$$;

create or replace function public.kd_entdecken_public_feed_readback(p_fence_token bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb;
  v_refreshed date;
begin
  if auth.role() is distinct from 'service_role' or p_fence_token is null or p_fence_token <= 0 then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  select payload,refreshed_on into v_payload,v_refreshed from public.kd_entdecken_daily_feed
   where singleton and status='ready' and ready_fence_token=p_fence_token;
  if not found or not public.kd_entdecken_public_payload_valid(v_payload,v_refreshed) then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  if v_payload->>'format' = '8' and public.kd_entdecken_flixpatrol_sources_ready() then
    return jsonb_build_object(
      'ok',true,'status','verified','feed',v_payload,'fenceToken',p_fence_token,
      'provenance',jsonb_build_object(
        'itemCount',50,'sourceCount',5,'sourceIds',v_payload->'sourceIds','rightsStatus','owner_private'
      )
    );
  elsif v_payload->>'format' = '6' and public.kd_entdecken_mixed_sources_ready() then
    return jsonb_build_object(
      'ok',true,'status','verified','feed',v_payload,'fenceToken',p_fence_token,
      'provenance',jsonb_build_object(
        'itemCount',25,'sourceCount',2,'sourceIds',v_payload->'sourceIds','rightsStatus','owner_private'
      )
    );
  end if;
  return jsonb_build_object('ok',false,'status','unverified');
end
$$;

revoke all on function public.kd_entdecken_public_payload_valid_v8(jsonb,date) from public,anon,authenticated;
revoke all on function public.kd_entdecken_flixpatrol_sources_ready() from public,anon,authenticated;
revoke all on function public.kd_entdecken_public_payload_valid(jsonb,date) from public,anon,authenticated;
revoke all on function public.kd_entdecken_weekly_feed_status() from public,anon,authenticated;
revoke all on function public.kd_entdecken_weekly_refresh_claim(text) from public,anon,authenticated;
revoke all on function public.kd_entdecken_daily_save(jsonb,bigint) from public,anon,authenticated;
revoke all on function public.kd_entdecken_public_feed_readback(bigint) from public,anon,authenticated;

grant execute on function public.kd_entdecken_public_payload_valid_v8(jsonb,date) to service_role;
grant execute on function public.kd_entdecken_flixpatrol_sources_ready() to service_role;
grant execute on function public.kd_entdecken_public_payload_valid(jsonb,date) to service_role;
grant execute on function public.kd_entdecken_weekly_feed_status() to service_role;
grant execute on function public.kd_entdecken_weekly_refresh_claim(text) to service_role;
grant execute on function public.kd_entdecken_daily_save(jsonb,bigint) to service_role;
grant execute on function public.kd_entdecken_public_feed_readback(bigint) to service_role;

comment on function public.kd_entdecken_public_payload_valid_v8(jsonb,date) is
  'Format 8: exakt 50 eindeutige AT-Titel; 15 OeFI, 10 Netflix, 10 Prime, 10 Disney und 5 Apple-TV-Filme mit getrenntem Quellen- und Abrufdatum.';
comment on function public.kd_entdecken_flixpatrol_sources_ready() is
  'Verlangt die zwei bestehenden owner_private-Quellen und die vier fest belegten E2-Vokabular-IDs; Apple TV Store wird nicht akzeptiert.';
comment on function public.kd_entdecken_daily_save(jsonb,bigint) is
  'Ersetzt den letzten guten Feed nur nach vollständiger Formatprüfung und gültigem Tages-Fence; Format 6 bleibt lesekompatibel.';
comment on function public.kd_entdecken_public_feed_readback(bigint) is
  'Fence-Readback für Format 8 mit 50/5-Provenienz sowie den gespeicherten Format-6-Bestand mit 25/2.';

commit;
