-- Gemeinsamer, accountfreier FlixPatrol-Datenbestand.
-- Ausschliesslich service_role schreibt ueber schmale RPCs. Browserrollen
-- erhalten nur begrenzte, read-only Projektionen ohne Provider-Key.

begin;

alter table public.kd_flixpatrol_usage_operations
  drop constraint kd_flixpatrol_usage_operations_request_kind_check;
alter table public.kd_flixpatrol_usage_operations
  add constraint kd_flixpatrol_usage_operations_request_kind_v2_check
  check (request_kind in ('quota','top10s','titles'));

create table public.kd_flixpatrol_vocabulary_cache (
  resource_type       text not null check (resource_type in ('companies','countries','genres','keywords','regions')),
  source_id           text not null check (source_id ~ '^(cmp|cnt|gnr|kwd|rgn)_[A-Za-z0-9]{20,40}$'),
  name                text not null check (btrim(name) = name and length(name) between 1 and 240),
  code                text check (code is null or code ~ '^[A-Z]{2}$'),
  media_type          text check (media_type is null or media_type in ('film','series')),
  provider_type       integer,
  provider_updated_at text check (provider_updated_at is null or provider_updated_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$'),
  checked_at          timestamptz not null,
  fresh_until         timestamptz not null,
  source_url          text not null check (source_url ~ '^https://flixpatrol[.]com/api2/(endpoint-(companies|countries|genres|keywords|regions)|page-codes)/$'),
  updated_at          timestamptz not null default now(),
  primary key (resource_type, source_id),
  check (fresh_until >= checked_at),
  check (
    (resource_type = 'companies' and source_id ~ '^cmp_' and code is null and media_type is null
      and (provider_type is null or provider_type between 1 and 12))
    or (resource_type = 'countries' and source_id ~ '^cnt_' and media_type is null and provider_type is null)
    or (resource_type = 'genres' and source_id ~ '^gnr_' and code is null
      and media_type in ('film','series') and provider_type in (1,2))
    or (resource_type = 'keywords' and source_id ~ '^kwd_' and code is null
      and media_type is null and provider_type is null)
    or (resource_type = 'regions' and source_id ~ '^rgn_' and code is null
      and media_type is null and provider_type between 1 and 3)
  )
);

create table public.kd_flixpatrol_title_cache (
  source_id            text primary key check (source_id ~ '^ttl_[A-Za-z0-9]{20,40}$'),
  media_type           text not null check (media_type in ('film','series')),
  status               text not null check (status in ('unresolved','resolved','not_found','incomplete_blocked')),
  title                text check (title is null or (btrim(title) = title and length(title) between 1 and 240)),
  premiere             date,
  release_year         integer check (release_year is null or release_year between 1888 and 2100),
  premiere_online      date,
  runtime_minutes      integer check (runtime_minutes is null or runtime_minutes between 1 and 2000),
  imdb_numeric_id      bigint check (imdb_numeric_id is null or imdb_numeric_id between 1 and 9999999999),
  imdb_id              text check (imdb_id is null or imdb_id ~ '^tt[0-9]{7,10}$'),
  tmdb_id              integer check (tmdb_id is null or tmdb_id between 1 and 999999999),
  country_id           text check (country_id is null or country_id ~ '^cnt_[A-Za-z0-9]{20,40}$'),
  company_id           text check (company_id is null or company_id ~ '^cmp_[A-Za-z0-9]{20,40}$'),
  genre_id             text check (genre_id is null or genre_id ~ '^gnr_[A-Za-z0-9]{20,40}$'),
  keyword_id           text check (keyword_id is null or keyword_id ~ '^kwd_[A-Za-z0-9]{20,40}$'),
  description          text check (description is null or (btrim(description) = description and length(description) between 1 and 4000)),
  provider_updated_at  text check (provider_updated_at is null or provider_updated_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$'),
  source_url           text check (source_url is null or source_url ~ '^https://flixpatrol[.]com/title/[^?#[:space:]]+/$'),
  checked_at           timestamptz not null,
  fetched_at           timestamptz,
  fresh_until          timestamptz not null,
  updated_at           timestamptz not null default now(),
  check (fresh_until >= checked_at),
  check (release_year is null or premiere is null or release_year = extract(year from premiere)::integer),
  check (imdb_id is null or imdb_numeric_id is null or substring(imdb_id from 3)::bigint = imdb_numeric_id),
  check (
    (status = 'resolved' and title is not null and provider_updated_at is not null
      and source_url is not null and fetched_at is not null)
    or
    (status <> 'resolved' and title is null and premiere is null and release_year is null
      and premiere_online is null and runtime_minutes is null and imdb_numeric_id is null
      and imdb_id is null and tmdb_id is null and country_id is null and company_id is null
      and genre_id is null and keyword_id is null and description is null
      and provider_updated_at is null and source_url is null)
  )
);

create table public.kd_flixpatrol_chart_cache (
  company_id           text not null check (company_id ~ '^cmp_[A-Za-z0-9]{20,40}$'),
  country_id           text not null check (country_id ~ '^cnt_[A-Za-z0-9]{20,40}$'),
  chart_type           text not null check (chart_type in ('movies','tvshows')),
  chart_date           date not null,
  entries              jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) between 1 and 10),
  fetched_at           timestamptz not null,
  fresh_until          timestamptz not null,
  source_url           text not null default 'https://api.flixpatrol.com/v2/top10s'
                       check (source_url = 'https://api.flixpatrol.com/v2/top10s'),
  updated_at           timestamptz not null default now(),
  primary key (company_id, country_id, chart_type),
  check (fresh_until >= fetched_at and fresh_until <= fetched_at + interval '7 days')
);

create table public.kd_flixpatrol_data_failures (
  operation_id         uuid primary key references public.kd_flixpatrol_usage_operations(operation_id),
  resource_type        text not null check (resource_type in ('chart','title')),
  source_id            text not null check (
                         source_id ~ '^(ttl|cmp|cnt|gnr|kwd|rgn)_[A-Za-z0-9]{20,40}$'
                         or source_id ~ '^chart:cmp_[A-Za-z0-9]{20,40}:cnt_[A-Za-z0-9]{20,40}:(movies|tvshows)$'
                       ),
  media_type           text check (media_type is null or media_type in ('film','series')),
  error_code           text not null check (error_code in (
                         'transport_error','http_error','invalid_response',
                         'not_found','ambiguous_blocked','id_conflict','storage_error'
                       )),
  failed_at            timestamptz not null,
  created_at           timestamptz not null default now()
);

comment on table public.kd_flixpatrol_vocabulary_cache is
  'Zentrale FlixPatrol-Begriffe und IDs; Apple TV und Apple TV Store bleiben getrennte Quellen.';
comment on table public.kd_flixpatrol_title_cache is
  'Accountfreier positiver und negativer Cache fuer neutrale Titelfakten nach FlixPatrol-ID und Medientyp.';
comment on table public.kd_flixpatrol_chart_cache is
  'Je AT-Dienst und Film-/Serientyp genau der letzte vollstaendige gueltige Tageschart; kein Verfuegbarkeitsbeleg.';
comment on table public.kd_flixpatrol_data_failures is
  'Payloadfreier Fehlernachweis zu bereits gezaehlten Requests; keine Suchtexte, Nutzer- oder Providerdaten.';

alter table public.kd_flixpatrol_vocabulary_cache enable row level security;
alter table public.kd_flixpatrol_vocabulary_cache force row level security;
alter table public.kd_flixpatrol_title_cache enable row level security;
alter table public.kd_flixpatrol_title_cache force row level security;
alter table public.kd_flixpatrol_chart_cache enable row level security;
alter table public.kd_flixpatrol_chart_cache force row level security;
alter table public.kd_flixpatrol_data_failures enable row level security;
alter table public.kd_flixpatrol_data_failures force row level security;

revoke all on table public.kd_flixpatrol_vocabulary_cache from public, anon, authenticated, service_role;
revoke all on table public.kd_flixpatrol_title_cache from public, anon, authenticated, service_role;
revoke all on table public.kd_flixpatrol_chart_cache from public, anon, authenticated, service_role;
revoke all on table public.kd_flixpatrol_data_failures from public, anon, authenticated, service_role;

insert into public.kd_flixpatrol_vocabulary_cache (
  resource_type, source_id, name, code, media_type, provider_type,
  checked_at, fresh_until, source_url
) values
  ('countries','cnt_gGE4RaeXpyz2U9Q5tEMYDwri','Austria','AT',null,null,
    timestamptz '2026-09-09 00:00:00+00',timestamptz '2027-09-09 00:00:00+00','https://flixpatrol.com/api2/page-codes/'),
  ('companies','cmp_qypvowjqFhEIpCc0HlQ6VoYk','Amazon Prime',null,null,null,
    timestamptz '2026-09-09 00:00:00+00',timestamptz '2027-09-09 00:00:00+00','https://flixpatrol.com/api2/page-codes/'),
  ('companies','cmp_oGtsgdpOrjIu3XzTEnWPt87Y','Disney+',null,null,null,
    timestamptz '2026-09-09 00:00:00+00',timestamptz '2027-09-09 00:00:00+00','https://flixpatrol.com/api2/page-codes/'),
  ('companies','cmp_VvmYc7OphiUds0Hgjbz5MESn','Apple TV',null,null,null,
    timestamptz '2026-09-09 00:00:00+00',timestamptz '2027-09-09 00:00:00+00','https://flixpatrol.com/api2/page-codes/'),
  ('companies','cmp_phDSns8OP1rtHnX6QwlEKhiq','Apple TV Store',null,null,null,
    timestamptz '2026-09-09 00:00:00+00',timestamptz '2027-09-09 00:00:00+00','https://flixpatrol.com/api2/page-codes/');

create function public.kd_flixpatrol_data_save_vocabulary(
  p_resource_type text,
  p_source_id text,
  p_name text,
  p_code text,
  p_media_type text,
  p_provider_type integer,
  p_provider_updated_at text,
  p_checked_at timestamptz,
  p_fresh_until timestamptz,
  p_source_url text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_checked_at is null or p_fresh_until is null or p_fresh_until < p_checked_at then
    return jsonb_build_object('ok',false,'code','invalid-response');
  end if;
  insert into public.kd_flixpatrol_vocabulary_cache (
    resource_type, source_id, name, code, media_type, provider_type,
    provider_updated_at, checked_at, fresh_until, source_url, updated_at
  ) values (
    p_resource_type, p_source_id, p_name, p_code, p_media_type, p_provider_type,
    p_provider_updated_at, p_checked_at, p_fresh_until, p_source_url, clock_timestamp()
  ) on conflict (resource_type, source_id) do update
    set name = excluded.name,
        code = coalesce(excluded.code, kd_flixpatrol_vocabulary_cache.code),
        media_type = coalesce(excluded.media_type, kd_flixpatrol_vocabulary_cache.media_type),
        provider_type = coalesce(excluded.provider_type, kd_flixpatrol_vocabulary_cache.provider_type),
        provider_updated_at = coalesce(excluded.provider_updated_at, kd_flixpatrol_vocabulary_cache.provider_updated_at),
        checked_at = excluded.checked_at,
        fresh_until = excluded.fresh_until,
        source_url = excluded.source_url,
        updated_at = clock_timestamp()
    where excluded.checked_at >= kd_flixpatrol_vocabulary_cache.checked_at;
  return jsonb_build_object('ok',true,'saved',found);
exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok',false,'code','invalid-response');
end
$$;

create function public.kd_flixpatrol_data_save_title(
  p_title jsonb,
  p_fetched_at timestamptz,
  p_fresh_until timestamptz
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.kd_flixpatrol_title_cache%rowtype;
  v_source_id text;
  v_media_type text;
  v_imdb_numeric bigint;
  v_imdb_id text;
  v_tmdb_id integer;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if jsonb_typeof(p_title) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_title)) <> 17
     or not (p_title ?& array[
       'sourceId','mediaType','title','premiere','releaseYear','premiereOnline',
       'runtimeMinutes','imdbNumericId','imdbId','tmdbId','countryId','companyId',
       'genreId','keywordId','description','providerUpdatedAt','sourceUrl'
     ])
     or jsonb_typeof(p_title->'sourceId') is distinct from 'string'
     or jsonb_typeof(p_title->'mediaType') is distinct from 'string'
     or jsonb_typeof(p_title->'title') is distinct from 'string'
     or jsonb_typeof(p_title->'providerUpdatedAt') is distinct from 'string'
     or jsonb_typeof(p_title->'sourceUrl') is distinct from 'string'
     or jsonb_typeof(p_title->'premiere') not in ('null','string')
     or jsonb_typeof(p_title->'premiereOnline') not in ('null','string')
     or jsonb_typeof(p_title->'releaseYear') not in ('null','number')
     or (jsonb_typeof(p_title->'releaseYear') = 'number' and p_title->>'releaseYear' !~ '^[0-9]+$')
     or jsonb_typeof(p_title->'runtimeMinutes') not in ('null','number')
     or (jsonb_typeof(p_title->'runtimeMinutes') = 'number' and p_title->>'runtimeMinutes' !~ '^[0-9]+$')
     or jsonb_typeof(p_title->'imdbNumericId') not in ('null','string')
     or jsonb_typeof(p_title->'imdbId') not in ('null','string')
     or jsonb_typeof(p_title->'tmdbId') not in ('null','string')
     or jsonb_typeof(p_title->'countryId') not in ('null','string')
     or jsonb_typeof(p_title->'companyId') not in ('null','string')
     or jsonb_typeof(p_title->'genreId') not in ('null','string')
     or jsonb_typeof(p_title->'keywordId') not in ('null','string')
     or jsonb_typeof(p_title->'description') not in ('null','string')
     or p_fetched_at is null or p_fresh_until is null or p_fresh_until < p_fetched_at
     or p_fresh_until > p_fetched_at + interval '90 days' then
    return jsonb_build_object('ok',false,'code','invalid-response');
  end if;
  v_source_id := p_title->>'sourceId';
  v_media_type := p_title->>'mediaType';
  v_imdb_numeric := nullif(p_title->>'imdbNumericId','')::bigint;
  v_imdb_id := nullif(p_title->>'imdbId','');
  v_tmdb_id := nullif(p_title->>'tmdbId','')::integer;
  if v_source_id !~ '^ttl_[A-Za-z0-9]{20,40}$' or v_media_type not in ('film','series') then
    return jsonb_build_object('ok',false,'code','invalid-response');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_source_id, 8317561));
  select * into v_existing from public.kd_flixpatrol_title_cache where source_id = v_source_id for update;
  if found and v_existing.media_type is distinct from v_media_type then
    return jsonb_build_object('ok',false,'code','media-type-conflict');
  end if;
  if found and v_existing.status = 'resolved' and (
       (v_existing.imdb_id is not null and v_imdb_id is not null and v_existing.imdb_id <> v_imdb_id)
       or (v_existing.tmdb_id is not null and v_tmdb_id is not null and v_existing.tmdb_id <> v_tmdb_id)
     ) then
    return jsonb_build_object('ok',false,'code','id-conflict');
  end if;
  if found and v_existing.fetched_at is not null and p_fetched_at < v_existing.fetched_at then
    return jsonb_build_object('ok',true,'saved',false,'preserved',true,'status',v_existing.status);
  end if;

  insert into public.kd_flixpatrol_title_cache (
    source_id, media_type, status, title, premiere, release_year, premiere_online,
    runtime_minutes, imdb_numeric_id, imdb_id, tmdb_id, country_id, company_id,
    genre_id, keyword_id, description, provider_updated_at, source_url,
    checked_at, fetched_at, fresh_until, updated_at
  ) values (
    v_source_id, v_media_type, 'resolved', p_title->>'title',
    nullif(p_title->>'premiere','')::date, nullif(p_title->>'releaseYear','')::integer,
    nullif(p_title->>'premiereOnline','')::date, nullif(p_title->>'runtimeMinutes','')::integer,
    v_imdb_numeric, v_imdb_id, v_tmdb_id,
    nullif(p_title->>'countryId',''), nullif(p_title->>'companyId',''),
    nullif(p_title->>'genreId',''), nullif(p_title->>'keywordId',''),
    nullif(p_title->>'description',''), p_title->>'providerUpdatedAt',
    p_title->>'sourceUrl', p_fetched_at, p_fetched_at, p_fresh_until, clock_timestamp()
  ) on conflict (source_id) do update
    set status = 'resolved',
        title = excluded.title,
        premiere = coalesce(excluded.premiere, kd_flixpatrol_title_cache.premiere),
        release_year = coalesce(excluded.release_year, kd_flixpatrol_title_cache.release_year),
        premiere_online = coalesce(excluded.premiere_online, kd_flixpatrol_title_cache.premiere_online),
        runtime_minutes = coalesce(excluded.runtime_minutes, kd_flixpatrol_title_cache.runtime_minutes),
        imdb_numeric_id = coalesce(excluded.imdb_numeric_id, kd_flixpatrol_title_cache.imdb_numeric_id),
        imdb_id = coalesce(excluded.imdb_id, kd_flixpatrol_title_cache.imdb_id),
        tmdb_id = coalesce(excluded.tmdb_id, kd_flixpatrol_title_cache.tmdb_id),
        country_id = coalesce(excluded.country_id, kd_flixpatrol_title_cache.country_id),
        company_id = coalesce(excluded.company_id, kd_flixpatrol_title_cache.company_id),
        genre_id = coalesce(excluded.genre_id, kd_flixpatrol_title_cache.genre_id),
        keyword_id = coalesce(excluded.keyword_id, kd_flixpatrol_title_cache.keyword_id),
        description = coalesce(excluded.description, kd_flixpatrol_title_cache.description),
        provider_updated_at = excluded.provider_updated_at,
        source_url = excluded.source_url,
        checked_at = excluded.checked_at,
        fetched_at = excluded.fetched_at,
        fresh_until = excluded.fresh_until,
        updated_at = clock_timestamp();
  return jsonb_build_object('ok',true,'saved',true,'status','resolved');
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
  return jsonb_build_object('ok',false,'code','invalid-response');
end
$$;

create function public.kd_flixpatrol_data_save_title_miss(
  p_source_id text,
  p_media_type text,
  p_status text,
  p_checked_at timestamptz,
  p_fresh_until timestamptz
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.kd_flixpatrol_title_cache%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_source_id !~ '^ttl_[A-Za-z0-9]{20,40}$' or p_media_type not in ('film','series')
     or p_status not in ('not_found','incomplete_blocked') or p_checked_at is null or p_fresh_until is null
     or p_fresh_until < p_checked_at or p_fresh_until > p_checked_at + interval '90 days' then
    return jsonb_build_object('ok',false,'code','invalid-response');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_source_id, 8317561));
  select * into v_existing from public.kd_flixpatrol_title_cache where source_id = p_source_id for update;
  if found and v_existing.media_type is distinct from p_media_type then
    return jsonb_build_object('ok',false,'code','media-type-conflict');
  end if;
  if found and v_existing.status = 'resolved' then
    return jsonb_build_object('ok',true,'saved',false,'preserved',true,'status','resolved');
  end if;
  if found and p_checked_at < v_existing.checked_at then
    return jsonb_build_object('ok',true,'saved',false,'preserved',true,'status',v_existing.status);
  end if;
  insert into public.kd_flixpatrol_title_cache (
    source_id, media_type, status, checked_at, fresh_until, updated_at
  ) values (
    p_source_id, p_media_type, p_status, p_checked_at, p_fresh_until, clock_timestamp()
  ) on conflict (source_id) do update
    set status = excluded.status, checked_at = excluded.checked_at,
        fresh_until = excluded.fresh_until, updated_at = clock_timestamp();
  return jsonb_build_object('ok',true,'saved',true,'status',p_status);
exception when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow then
  return jsonb_build_object('ok',false,'code','invalid-response');
end
$$;

create function public.kd_flixpatrol_data_save_chart(p_chart jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_company_id text;
  v_country_id text;
  v_chart_type text;
  v_media_type text;
  v_chart_date date;
  v_fetched_at timestamptz;
  v_fresh_until timestamptz;
  v_title_count bigint;
  v_rank_count bigint;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if jsonb_typeof(p_chart) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_chart)) <> 7
     or not (p_chart ?& array['companyId','countryId','chartType','chartDate','items','fetchedAt','freshUntil'])
     or jsonb_typeof(p_chart->'items') is distinct from 'array'
     or jsonb_array_length(p_chart->'items') not between 1 and 10
     or coalesce(p_chart->>'chartDate','') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_chart->>'fetchedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{1,6})?(Z|[+-]\d{2}:?\d{2})$'
     or coalesce(p_chart->>'freshUntil','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{1,6})?(Z|[+-]\d{2}:?\d{2})$' then
    return jsonb_build_object('ok',false,'code','invalid-response');
  end if;
  v_company_id := p_chart->>'companyId';
  v_country_id := p_chart->>'countryId';
  v_chart_type := p_chart->>'chartType';
  v_media_type := case v_chart_type when 'movies' then 'film' when 'tvshows' then 'series' else null end;
  v_chart_date := (p_chart->>'chartDate')::date;
  v_fetched_at := (p_chart->>'fetchedAt')::timestamptz;
  v_fresh_until := (p_chart->>'freshUntil')::timestamptz;
  if v_media_type is null or v_fresh_until < v_fetched_at
     or v_fresh_until > v_fetched_at + interval '7 days' then
    return jsonb_build_object('ok',false,'code','invalid-response');
  end if;

  for v_item in select value from jsonb_array_elements(p_chart->'items') loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 8
       or not (v_item ?& array[
         'sourceId','mediaType','ranking','rankingLast','value','valueLast','daysTotal','providerUpdatedAt'
       ])
       or v_item->>'mediaType' is distinct from v_media_type
       or coalesce(v_item->>'sourceId','') !~ '^ttl_[A-Za-z0-9]{20,40}$'
       or jsonb_typeof(v_item->'ranking') is distinct from 'number'
       or v_item->>'ranking' !~ '^[0-9]+$'
       or (v_item->>'ranking')::integer not between 1 and 10
       or jsonb_typeof(v_item->'value') is distinct from 'number'
       or v_item->>'value' !~ '^[0-9]+$'
       or (v_item->>'value')::bigint < 0
       or (jsonb_typeof(v_item->'rankingLast') not in ('null','number'))
       or (jsonb_typeof(v_item->'rankingLast') = 'number' and (v_item->>'rankingLast' !~ '^[0-9]+$' or (v_item->>'rankingLast')::integer < 1))
       or (jsonb_typeof(v_item->'valueLast') not in ('null','number'))
       or (jsonb_typeof(v_item->'valueLast') = 'number' and (v_item->>'valueLast' !~ '^[0-9]+$' or (v_item->>'valueLast')::bigint < 0))
       or (jsonb_typeof(v_item->'daysTotal') not in ('null','number'))
       or (jsonb_typeof(v_item->'daysTotal') = 'number' and (v_item->>'daysTotal' !~ '^[0-9]+$' or (v_item->>'daysTotal')::integer < 0))
       or coalesce(v_item->>'providerUpdatedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$' then
      return jsonb_build_object('ok',false,'code','invalid-response');
    end if;
  end loop;
  select count(distinct value->>'sourceId'), count(distinct value->>'ranking')
    into v_title_count, v_rank_count from jsonb_array_elements(p_chart->'items');
  if v_title_count <> jsonb_array_length(p_chart->'items')
     or v_rank_count <> jsonb_array_length(p_chart->'items') then
    return jsonb_build_object('ok',false,'code','invalid-response');
  end if;

  insert into public.kd_flixpatrol_title_cache (
    source_id, media_type, status, checked_at, fresh_until, updated_at
  )
  select item->>'sourceId', v_media_type, 'unresolved', v_fetched_at, v_fetched_at, clock_timestamp()
    from jsonb_array_elements(p_chart->'items') item
  on conflict (source_id) do nothing;

  insert into public.kd_flixpatrol_chart_cache (
    company_id, country_id, chart_type, chart_date, entries, fetched_at, fresh_until, updated_at
  ) values (
    v_company_id, v_country_id, v_chart_type, v_chart_date, p_chart->'items',
    v_fetched_at, v_fresh_until, clock_timestamp()
  ) on conflict (company_id, country_id, chart_type) do update
    set chart_date = excluded.chart_date, entries = excluded.entries,
        fetched_at = excluded.fetched_at, fresh_until = excluded.fresh_until,
        updated_at = clock_timestamp()
    where excluded.fetched_at >= kd_flixpatrol_chart_cache.fetched_at
      and excluded.chart_date >= kd_flixpatrol_chart_cache.chart_date;
  return jsonb_build_object('ok',true,'saved',found,'itemCount',jsonb_array_length(p_chart->'items'));
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
  return jsonb_build_object('ok',false,'code','invalid-response');
end
$$;

create function public.kd_flixpatrol_data_record_failure(
  p_operation_id uuid,
  p_resource_type text,
  p_source_id text,
  p_media_type text,
  p_error_code text,
  p_failed_at timestamptz
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  insert into public.kd_flixpatrol_data_failures (
    operation_id, resource_type, source_id, media_type, error_code, failed_at
  ) values (
    p_operation_id, p_resource_type, p_source_id, p_media_type, p_error_code, p_failed_at
  ) on conflict (operation_id) do nothing;
  return jsonb_build_object('ok',true,'saved',found);
exception when check_violation or foreign_key_violation or not_null_violation then
  return jsonb_build_object('ok',false,'code','invalid-failure');
end
$$;

create function public.kd_flixpatrol_chart_read(
  p_company_id text,
  p_country_id text,
  p_chart_type text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_chart public.kd_flixpatrol_chart_cache%rowtype;
  v_items jsonb;
begin
  if auth.role() = 'authenticated' and not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if auth.role() not in ('authenticated','service_role') or auth.role() is null then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_company_id !~ '^cmp_[A-Za-z0-9]{20,40}$'
     or p_country_id !~ '^cnt_[A-Za-z0-9]{20,40}$'
     or p_chart_type not in ('movies','tvshows') then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;
  select * into v_chart from public.kd_flixpatrol_chart_cache
   where company_id = p_company_id and country_id = p_country_id and chart_type = p_chart_type;
  if not found then return jsonb_build_object('ok',true,'chart',null); end if;

  select jsonb_agg(
    item.value || jsonb_build_object(
      'facts', jsonb_strip_nulls(jsonb_build_object(
        'status', title.status,
        'title', title.title,
        'premiere', title.premiere,
        'releaseYear', title.release_year,
        'premiereOnline', title.premiere_online,
        'runtimeMinutes', title.runtime_minutes,
        'imdbId', title.imdb_id,
        'tmdbId', title.tmdb_id,
        'countryId', title.country_id,
        'companyId', title.company_id,
        'genreId', title.genre_id,
        'keywordId', title.keyword_id,
        'description', title.description,
        'providerUpdatedAt', title.provider_updated_at,
        'sourceUrl', title.source_url,
        'checkedAt', title.checked_at,
        'freshUntil', title.fresh_until
      ))
    ) order by item.ordinality
  ) into v_items
  from jsonb_array_elements(v_chart.entries) with ordinality item(value, ordinality)
  left join public.kd_flixpatrol_title_cache title on title.source_id = item.value->>'sourceId';

  return jsonb_build_object(
    'ok',true,
    'chart',jsonb_build_object(
      'companyId',v_chart.company_id,
      'countryId',v_chart.country_id,
      'chartType',v_chart.chart_type,
      'chartDate',v_chart.chart_date,
      'fetchedAt',v_chart.fetched_at,
      'freshUntil',v_chart.fresh_until,
      'fresh',v_chart.fresh_until >= statement_timestamp(),
      'sourceUrl',v_chart.source_url,
      'items',v_items
    )
  );
end
$$;

create function public.kd_flixpatrol_titles_read(p_source_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_items jsonb;
begin
  if auth.role() = 'authenticated' and not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if auth.role() not in ('authenticated','service_role') or auth.role() is null then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  v_count := coalesce(cardinality(p_source_ids),0);
  if v_count not between 1 and 50 or exists (
    select 1 from unnest(p_source_ids) value where value !~ '^ttl_[A-Za-z0-9]{20,40}$'
  ) then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sourceId',title.source_id,'mediaType',title.media_type,'status',title.status,
    'title',title.title,'premiere',title.premiere,'releaseYear',title.release_year,
    'premiereOnline',title.premiere_online,'runtimeMinutes',title.runtime_minutes,
    'imdbId',title.imdb_id,'tmdbId',title.tmdb_id,'countryId',title.country_id,
    'companyId',title.company_id,'genreId',title.genre_id,'keywordId',title.keyword_id,
    'description',title.description,'providerUpdatedAt',title.provider_updated_at,
    'sourceUrl',title.source_url,'checkedAt',title.checked_at,'freshUntil',title.fresh_until,
    'fresh',title.fresh_until >= statement_timestamp()
  )) order by title.source_id),'[]'::jsonb) into v_items
  from public.kd_flixpatrol_title_cache title where title.source_id = any(p_source_ids);
  return jsonb_build_object('ok',true,'items',v_items);
end
$$;

create or replace function public.kd_flixpatrol_usage_begin(
  p_operation_id uuid,
  p_request_kind text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_inserted boolean := false;
  v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_operation_id is null or p_request_kind is null
     or p_request_kind not in ('quota','top10s','titles') then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;
  insert into public.kd_flixpatrol_usage_operations (
    operation_id, request_kind, status, claimed_at, updated_at
  ) values (p_operation_id, p_request_kind, 'claimed', v_now, v_now)
  on conflict (operation_id) do nothing;
  v_inserted := found;
  if not v_inserted then
    select operation.status into v_status from public.kd_flixpatrol_usage_operations operation
     where operation.operation_id = p_operation_id;
    return jsonb_build_object('ok',true,'claim',false,'replay',true,'status',coalesce(v_status,'unknown'));
  end if;
  update public.kd_flixpatrol_usage_state
     set attempted_requests = attempted_requests + 1, last_status = 'claimed',
         last_attempt_at = v_now, updated_at = v_now where singleton;
  return jsonb_build_object('ok',true,'claim',true,'replay',false,'status','claimed');
end
$$;

create or replace function public.kd_flixpatrol_usage_finish(
  p_operation_id uuid,
  p_status text,
  p_http_status integer,
  p_quota jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_operation public.kd_flixpatrol_usage_operations%rowtype;
  v_quota_valid boolean := false;
  v_quota_keys text[];
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if p_operation_id is null or p_status is null
     or p_status not in ('succeeded','http_error','invalid_response','transport_error')
     or (p_status = 'transport_error' and p_http_status is not null)
     or (p_status in ('succeeded','invalid_response') and (p_http_status is null or p_http_status not between 200 and 299))
     or (p_status = 'http_error' and (p_http_status is null or p_http_status not between 100 and 599
       or p_http_status between 200 and 299)) then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;
  select operation.* into v_operation from public.kd_flixpatrol_usage_operations operation
   where operation.operation_id = p_operation_id for update;
  if not found then return jsonb_build_object('ok',false,'code','operation-not-found'); end if;
  if v_operation.status <> 'claimed' then
    return jsonb_build_object('ok',true,'replay',true,'status',v_operation.status,
      'usage',public.kd_flixpatrol_usage_status_internal());
  end if;

  if v_operation.request_kind = 'quota' and p_status = 'succeeded' then
    if jsonb_typeof(p_quota) = 'object' then
      select array_agg(key order by key) into v_quota_keys from jsonb_object_keys(p_quota) key;
      if v_quota_keys = array['available','limit','limitExtra','resetAt','used']::text[]
         and (p_quota->>'used') ~ '^\d+$' and (p_quota->>'available') ~ '^\d+$'
         and (p_quota->>'limit') ~ '^[1-9]\d*$' and (p_quota->>'limitExtra') ~ '^\d+$'
         and (p_quota->>'resetAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$' then
        v_quota_valid := (p_quota->>'used')::numeric <= 2147483647
          and (p_quota->>'available')::numeric <= 2147483647
          and (p_quota->>'limit')::numeric <= 2147483647
          and (p_quota->>'limitExtra')::numeric <= 2147483647;
      end if;
    end if;
    if not coalesce(v_quota_valid,false) then
      return jsonb_build_object('ok',false,'code','invalid-quota');
    end if;
  elsif p_quota is not null then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  update public.kd_flixpatrol_usage_operations
     set status = p_status, http_status = p_http_status, finished_at = v_now, updated_at = v_now
   where operation_id = p_operation_id;
  update public.kd_flixpatrol_usage_state
     set completed_requests = completed_requests + 1,
         successful_requests = successful_requests + case when p_status = 'succeeded' then 1 else 0 end,
         failed_requests = failed_requests + case when p_status = 'succeeded' then 0 else 1 end,
         last_status = p_status,
         last_success_at = case when p_status = 'succeeded' then v_now else last_success_at end,
         quota_used = case when v_operation.request_kind = 'quota' and p_status = 'succeeded'
           and (quota_request_started_at is null or v_operation.claimed_at >= quota_request_started_at)
           then (p_quota->>'used')::integer else quota_used end,
         quota_available = case when v_operation.request_kind = 'quota' and p_status = 'succeeded'
           and (quota_request_started_at is null or v_operation.claimed_at >= quota_request_started_at)
           then (p_quota->>'available')::integer else quota_available end,
         quota_limit = case when v_operation.request_kind = 'quota' and p_status = 'succeeded'
           and (quota_request_started_at is null or v_operation.claimed_at >= quota_request_started_at)
           then (p_quota->>'limit')::integer else quota_limit end,
         quota_limit_extra = case when v_operation.request_kind = 'quota' and p_status = 'succeeded'
           and (quota_request_started_at is null or v_operation.claimed_at >= quota_request_started_at)
           then (p_quota->>'limitExtra')::integer else quota_limit_extra end,
         quota_reset_at = case when v_operation.request_kind = 'quota' and p_status = 'succeeded'
           and (quota_request_started_at is null or v_operation.claimed_at >= quota_request_started_at)
           then p_quota->>'resetAt' else quota_reset_at end,
         quota_request_started_at = case when v_operation.request_kind = 'quota' and p_status = 'succeeded'
           and (quota_request_started_at is null or v_operation.claimed_at >= quota_request_started_at)
           then v_operation.claimed_at else quota_request_started_at end,
         quota_observed_at = case when v_operation.request_kind = 'quota' and p_status = 'succeeded'
           and (quota_request_started_at is null or v_operation.claimed_at >= quota_request_started_at)
           then v_now else quota_observed_at end,
         updated_at = v_now
   where singleton;
  return jsonb_build_object('ok',true,'replay',false,'status',p_status,
    'usage',public.kd_flixpatrol_usage_status_internal());
end
$$;

revoke all on function public.kd_flixpatrol_data_save_vocabulary(text,text,text,text,text,integer,text,timestamptz,timestamptz,text) from public, anon, authenticated;
revoke all on function public.kd_flixpatrol_data_save_title(jsonb,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.kd_flixpatrol_data_save_title_miss(text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.kd_flixpatrol_data_save_chart(jsonb) from public, anon, authenticated;
revoke all on function public.kd_flixpatrol_data_record_failure(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.kd_flixpatrol_chart_read(text,text,text) from public, anon;
revoke all on function public.kd_flixpatrol_titles_read(text[]) from public, anon;
grant execute on function public.kd_flixpatrol_data_save_vocabulary(text,text,text,text,text,integer,text,timestamptz,timestamptz,text) to service_role;
grant execute on function public.kd_flixpatrol_data_save_title(jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.kd_flixpatrol_data_save_title_miss(text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.kd_flixpatrol_data_save_chart(jsonb) to service_role;
grant execute on function public.kd_flixpatrol_data_record_failure(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.kd_flixpatrol_chart_read(text,text,text) to authenticated, service_role;
grant execute on function public.kd_flixpatrol_titles_read(text[]) to authenticated, service_role;

comment on function public.kd_flixpatrol_chart_read(text,text,text) is
  'Begrenzte Verbraucherprojektion eines accountunabhaengigen Charts fuer aktive Konten und service_role.';
comment on function public.kd_flixpatrol_titles_read(text[]) is
  'Read-only Projektion fuer hoechstens 50 explizite FlixPatrol-Titel-IDs.';

commit;
