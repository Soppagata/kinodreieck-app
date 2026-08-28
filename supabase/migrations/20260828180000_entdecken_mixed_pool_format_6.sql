-- Kinodreieck · providerfreier Entdecken-Marktmix Format 6
-- =============================================================================
-- Additive Forward-Migration. Historische Format-5-/Joyn-Funktionen und
-- Migrationen bleiben als Failover-Provenienz erhalten. Der aktuelle
-- Produktpfad bindet genau Joyn AT und das Österreichische Filminstitut,
-- validiert 15 Kino-, 18 Streamingfilm- und 17 Serien-Einträge und erlaubt
-- den Owner-Claim nur während des expliziten Staging-Overrides ohne
-- Scheduler- oder Anbieteränderung.
-- =============================================================================

begin;

update public.kd_entdecken_sources
   set active = false,
       updated_at = clock_timestamp()
 where active
   and source_id not in ('chart:joyn-at','chart:oefi-weekend-at');

insert into public.kd_entdecken_sources (
  source_id, domain, publisher_family, source_class, rights_status,
  attribution_approved, subdomains_allowed, active, terms_url, terms_checked_on
) values
  (
    'chart:joyn-at', 'joyn.at', 'Joyn AT / ProSiebenSat.1 PULS 4', 'chart',
    'owner_private', true, true, true,
    'https://www.joyn.at/nutzungsbedingungen', date '2026-08-27'
  ),
  (
    'chart:oefi-weekend-at', 'filminstitut.at', 'Österreichisches Filminstitut', 'chart',
    'owner_private', true, false, true,
    'https://filminstitut.at/impressum', date '2026-08-27'
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

-- Der bytehistorische Format-5-Validator bleibt unverändert unter eigenem
-- Namen bestehen. Der öffentliche Name wird darunter als Dualformat-Dispatcher
-- neu angelegt.
alter function public.kd_entdecken_public_payload_valid(jsonb,date)
  rename to kd_entdecken_public_payload_valid_v5;

create function public.kd_entdecken_public_payload_valid_v6(
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
  v_source text;
  v_type text;
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
           or value #>> '{}' not in ('chart:joyn-at','chart:oefi-weekend-at')
     )
     or (select count(distinct value #>> '{}')
           from pg_catalog.jsonb_array_elements(p_payload->'sourceIds')) is distinct from 2::bigint
     or jsonb_typeof(p_payload->'items') is distinct from 'array'
     or jsonb_array_length(p_payload->'items') is distinct from 50
     or jsonb_typeof(p_payload->'annotations') is distinct from 'array'
     or jsonb_array_length(p_payload->'annotations') > 50 then
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
       or v_item->>'sourceId' not in ('chart:joyn-at','chart:oefi-weekend-at')
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
    if v_source = 'chart:joyn-at' then
      if v_item->>'sourceLabel' is distinct from 'Joyn Österreich'
         or v_item#>>'{availability,market}' is distinct from 'streaming'
         or v_item#>>'{availability,service}' is distinct from 'Joyn'
         or v_count not between 1 and 4
         or v_item#>>'{popularity,metric}' is distinct from 'source-chart-rank'
         or jsonb_typeof(v_item#>'{popularity,value}') is distinct from 'null'
         or v_item#>>'{popularity,measuredOn}' is distinct from p_today::text
         or (v_type = 'film' and v_item->>'sourceUrl' !~ '^https://www[.]joyn[.]at/filme/[^?#[:space:]]+$')
         or (v_type = 'series' and v_item->>'sourceUrl' !~ '^https://www[.]joyn[.]at/serien/[^?#[:space:]]+$') then
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
    )
    into v_cinema, v_streaming_film, v_streaming_series
    from pg_catalog.jsonb_array_elements(p_payload->'items');
  if v_cinema is distinct from 15
     or v_streaming_film is distinct from 18
     or v_streaming_series is distinct from 17
     or (select count(distinct value->>'sourceItemId')
           from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 50::bigint
     or (select count(distinct lower(value->>'title'))
           from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 50::bigint
     or (select count(distinct (value->>'sourceId') || '|' || (value->>'mediaType')
           || '|' || (value#>>'{popularity,rank}'))
           from pg_catalog.jsonb_array_elements(p_payload->'items')) is distinct from 50::bigint
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

create function public.kd_entdecken_public_payload_valid(
  p_payload jsonb,
  p_today date
) returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case p_payload->>'format'
    when '6' then public.kd_entdecken_public_payload_valid_v6(p_payload,p_today)
    when '5' then public.kd_entdecken_public_payload_valid_v5(p_payload,p_today)
    else false
  end
$$;

create function public.kd_entdecken_mixed_sources_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (select count(*) from public.kd_entdecken_sources where active) = 2
    and exists (
      select 1 from public.kd_entdecken_sources
       where source_id = 'chart:joyn-at'
         and domain = 'joyn.at'
         and publisher_family = 'Joyn AT / ProSiebenSat.1 PULS 4'
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
         and public.kd_entdecken_mixed_sources_ready()
    into v_enabled
    from public.kd_entdecken_daily_settings
   where singleton;
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

create or replace function public.kd_entdecken_weekly_refresh_claim(
  p_source text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_utc timestamp := v_now at time zone 'UTC';
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_enabled boolean := false;
  v_owner_override boolean := false;
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_anchor timestamptz;
  v_due boolean := false;
  v_claim boolean := false;
  v_status text := 'held';
  v_fence bigint;
begin
  if auth.role() is distinct from 'service_role'
     or p_source is null or p_source not in ('scheduled','owner') then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',coalesce(p_source,'invalid'),'claimStatus','disabled',
      'attemptCount',0,'maxAttempts',1,'feedReadback',null);
  end if;

  select feed_enabled and public_enabled and owner_private_source_enabled
         and not provider_enabled and not commercial_enabled
         and public.kd_entdecken_mixed_sources_ready(),
         staging_owner_refresh_override
    into v_enabled, v_owner_override
    from public.kd_entdecken_daily_settings
   where singleton
   for update;
  select * into v_feed from public.kd_entdecken_daily_feed where singleton for update;
  if not found then v_enabled := false; end if;

  v_anchor := case
    when v_feed.last_success_at is null then v_feed.last_public_attempt_at
    when v_feed.last_public_attempt_at is null then v_feed.last_success_at
    else greatest(v_feed.last_success_at, v_feed.last_public_attempt_at)
  end;
  v_due := v_anchor is null or v_now >= v_anchor + interval '144 hours';

  if not coalesce(v_enabled,false) then v_status := 'disabled';
  elsif p_source = 'owner' and not coalesce(v_owner_override,false) then v_status := 'disabled';
  elsif p_source = 'scheduled' and extract(hour from v_utc)::integer <> 2 then v_status := 'outside_window';
  elsif v_feed.status = 'refreshing' and v_feed.lease_expires_at > v_now then v_status := 'in_progress';
  elsif p_source = 'scheduled' and not v_due then v_status := 'not_due';
  else
    update public.kd_entdecken_daily_feed
       set last_public_attempt_at = v_now,
           last_attempt_on = v_today,
           last_attempt_iso_week = v_iso_week,
           attempt_iso_week = v_iso_week,
           attempt_count = 1,
           provider_operation_id = null,
           fence_token = fence_token + 1,
           lease_expires_at = v_now + interval '180 seconds',
           status = 'refreshing',
           last_error_code = null,
           last_failure_at = null,
           recovery_authorized_iso_week = null,
           updated_at = v_now
     where singleton
     returning fence_token into v_fence;
    v_claim := found;
    v_status := case when v_claim then 'claimed' else 'held' end;
  end if;
  return jsonb_build_object(
    'feedEnabled',coalesce(v_enabled,false),'providerEnabled',false,'today',v_today,
    'isoWeek',v_iso_week,'refresh',v_claim,
    'fenceToken',case when v_claim then v_fence else null end,
    'feed',case when coalesce(v_enabled,false) then v_feed.payload else null end,
    'requestMode',p_source,'claimStatus',v_status,
    'attemptCount',case when v_claim then 1 else 0 end,'maxAttempts',1,'feedReadback',null
  );
end
$$;

create or replace function public.kd_entdecken_daily_save(
  p_payload jsonb,
  p_fence_token bigint
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_format text := p_payload->>'format';
  v_joyn_ready boolean := false;
begin
  if p_fence_token is null or p_fence_token <= 0
     or not public.kd_entdecken_public_payload_valid(p_payload, v_today) then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;
  lock table public.kd_entdecken_sources in share mode;
  select exists (
    select 1 from public.kd_entdecken_sources
     where source_id = 'chart:joyn-at' and domain = 'joyn.at'
       and source_class = 'chart' and rights_status = 'owner_private'
       and attribution_approved and active
  ) into v_joyn_ready;
  if (v_format = '6' and not public.kd_entdecken_mixed_sources_ready())
     or (v_format = '5' and not v_joyn_ready) then
    return jsonb_build_object('ok',false,'code','source_registry_unavailable');
  end if;
  update public.kd_entdecken_daily_feed
     set payload = p_payload,
         refreshed_on = v_today,
         refreshed_iso_week = p_payload->>'isoWeek',
         valid_until = v_today + 6,
         last_success_at = v_now,
         status = 'ready',
         last_error_code = null,
         lease_expires_at = null,
         last_failure_at = null,
         provider_operation_id = null,
         ready_provider_operation_id = null,
         ready_fence_token = p_fence_token,
         recovery_authorized_iso_week = null,
         updated_at = v_now
   where singleton and status = 'refreshing'
     and fence_token = p_fence_token
     and last_public_attempt_at is not null
     and lease_expires_at >= v_now;
  if not found then return jsonb_build_object('ok',false,'code','state_invalid'); end if;
  return jsonb_build_object('ok',true,'status','saved');
end
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
  v_format text;
begin
  if auth.role() is distinct from 'service_role'
     or p_fence_token is null or p_fence_token <= 0 then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  select payload, refreshed_on into v_payload, v_refreshed
    from public.kd_entdecken_daily_feed
   where singleton and status = 'ready' and ready_fence_token = p_fence_token;
  if not found or not public.kd_entdecken_public_payload_valid(v_payload, v_refreshed) then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  v_format := v_payload->>'format';
  if v_format = '6' then
    if not public.kd_entdecken_mixed_sources_ready() then
      return jsonb_build_object('ok',false,'status','unverified');
    end if;
    return jsonb_build_object(
      'ok',true,'status','verified','feed',v_payload,'fenceToken',p_fence_token,
      'provenance',jsonb_build_object(
        'itemCount',50,'sourceCount',2,
        'sourceIds',jsonb_build_array('chart:joyn-at','chart:oefi-weekend-at'),
        'rightsStatus','owner_private'
      )
    );
  end if;
  if not exists (
    select 1 from public.kd_entdecken_sources
     where source_id = 'chart:joyn-at' and domain = 'joyn.at'
       and source_class = 'chart' and rights_status = 'owner_private'
       and attribution_approved and active
  ) then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  return jsonb_build_object(
    'ok',true,'status','verified','feed',v_payload,'fenceToken',p_fence_token,
    'provenance',jsonb_build_object(
      'itemCount',50,'sourceCount',1,'sourceId','chart:joyn-at','rightsStatus','owner_private'
    )
  );
end
$$;

revoke all on function public.kd_entdecken_public_payload_valid_v5(jsonb,date)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_public_payload_valid_v6(jsonb,date)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_public_payload_valid(jsonb,date)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_mixed_sources_ready()
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_weekly_feed_status()
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_weekly_refresh_claim(text)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_save(jsonb,bigint)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_public_feed_readback(bigint)
  from public, anon, authenticated;

grant execute on function public.kd_entdecken_public_payload_valid_v5(jsonb,date) to service_role;
grant execute on function public.kd_entdecken_public_payload_valid_v6(jsonb,date) to service_role;
grant execute on function public.kd_entdecken_public_payload_valid(jsonb,date) to service_role;
grant execute on function public.kd_entdecken_mixed_sources_ready() to service_role;
grant execute on function public.kd_entdecken_weekly_feed_status() to service_role;
grant execute on function public.kd_entdecken_weekly_refresh_claim(text) to service_role;
grant execute on function public.kd_entdecken_daily_save(jsonb,bigint) to service_role;
grant execute on function public.kd_entdecken_public_feed_readback(bigint) to service_role;

comment on function public.kd_entdecken_public_payload_valid_v5(jsonb,date) is
  'Bytehistorischer Format-5-/Joyn-Validator aus 20260827140000; unverändert als Failover erhalten.';
comment on function public.kd_entdecken_public_payload_valid_v6(jsonb,date) is
  'Fail-closed Format-6-Validator: 50 eindeutige Items, zwei owner_private Quellen, 15 Kino/18 Streamingfilm/17 Serien.';
comment on function public.kd_entdecken_weekly_refresh_claim(text) is
  'Scheduled: 02 UTC und 144h. Owner: nur bei kurz gesetztem Staging-Override, genau ein Claim auch innerhalb der Kadenz; maxAttempts 1.';
comment on function public.kd_entdecken_public_feed_readback(bigint) is
  'Providerfreier Fence-Readback fuer Format 6 mit zwei Quellen; historisches Format 5 bleibt als Joyn-Failover lesbar.';

do $$
begin
  if not exists (
    select 1 from public.kd_entdecken_daily_settings
     where singleton and owner_private_source_enabled and feed_enabled
       and public_enabled and not provider_enabled and not commercial_enabled
       and not staging_owner_refresh_override
  ) then
    raise exception 'Entdecken Format-6-Settings nicht sicher';
  end if;
  if not public.kd_entdecken_mixed_sources_ready() then
    raise exception 'Entdecken Format-6-Quellenstand driftet';
  end if;
  if to_regprocedure('public.kd_entdecken_public_payload_valid_v5(jsonb,date)') is null
     or to_regprocedure('public.kd_entdecken_public_payload_valid_v6(jsonb,date)') is null then
    raise exception 'Entdecken Dualformat-Provenienz fehlt';
  end if;
end
$$;

commit;

-- Kein Scheduler-, Radar-, Provider- oder Production-Write in dieser Migration.
