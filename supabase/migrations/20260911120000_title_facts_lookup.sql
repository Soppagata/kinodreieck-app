-- Additive, account-guarded access to cached neutral title facts by strong IDs.
-- No provider call, chart membership, personal data, or availability inference.

begin;

alter table public.kd_flixpatrol_usage_operations
  drop constraint if exists kd_flixpatrol_usage_operations_request_kind_v2_check;
alter table public.kd_flixpatrol_usage_operations
  add constraint kd_flixpatrol_usage_operations_request_kind_v3_check
  check (request_kind in ('quota','top10s','titles','genres','keywords'));

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
     or p_request_kind not in ('quota','top10s','titles','genres','keywords') then
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

create or replace function public.kd_title_facts_projection_internal(p_source_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion','title-facts-projection-v1',
    'source','flixpatrol',
    'sourceId',title.source_id,
    'mediaType',title.media_type,
    'status',title.status,
    'title',title.title,
    'premiere',title.premiere,
    'releaseYear',title.release_year,
    'premiereOnline',title.premiere_online,
    'runtimeMinutes',title.runtime_minutes,
    'imdbId',title.imdb_id,
    'tmdbId',title.tmdb_id,
    'countryId',title.country_id,
    'companyId',title.company_id,
    'genreId',title.genre_id,
    'keywordId',title.keyword_id,
    'description',title.description,
    'descriptionLanguage',null,
    'providerUpdatedAt',title.provider_updated_at,
    'sourceUrl',title.source_url,
    'checkedAt',title.checked_at,
    'fetchedAt',title.fetched_at,
    'freshUntil',title.fresh_until,
    'fresh',title.fresh_until >= statement_timestamp(),
    'genres',case when genre.source_id is null then '[]'::jsonb else jsonb_build_array(
      jsonb_build_object('id',genre.source_id,'name',genre.name)
    ) end,
    'keywords',case when keyword.source_id is null then '[]'::jsonb else jsonb_build_array(
      jsonb_build_object('id',keyword.source_id,'name',keyword.name)
    ) end
  )) order by title.source_id),'[]'::jsonb)
  from public.kd_flixpatrol_title_cache title
  left join public.kd_flixpatrol_vocabulary_cache genre
    on genre.resource_type = 'genres' and genre.source_id = title.genre_id
  left join public.kd_flixpatrol_vocabulary_cache keyword
    on keyword.resource_type = 'keywords' and keyword.source_id = title.keyword_id
  where title.source_id = any(p_source_ids)
$$;

revoke all on function public.kd_title_facts_projection_internal(text[])
  from public, anon, authenticated, service_role;

create or replace function public.kd_flixpatrol_titles_read(p_source_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if auth.role() = 'authenticated' and not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if auth.role() not in ('authenticated','service_role') or auth.role() is null then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  v_count := coalesce(cardinality(p_source_ids),0);
  if v_count not between 1 and 50
     or cardinality(array(select distinct value from unnest(p_source_ids) value)) <> v_count
     or exists (select 1 from unnest(p_source_ids) value where value !~ '^ttl_[A-Za-z0-9]{20,40}$') then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;
  return jsonb_build_object('ok',true,'items',public.kd_title_facts_projection_internal(p_source_ids));
end
$$;

create function public.kd_title_facts_lookup(p_identities jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_source_ids text[];
begin
  if auth.role() = 'authenticated' and not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if auth.role() not in ('authenticated','service_role') or auth.role() is null then
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  if jsonb_typeof(p_identities) is distinct from 'array' then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;
  v_count := jsonb_array_length(p_identities);
  if v_count not between 1 and 50 or exists (
    select 1
    from jsonb_array_elements(p_identities) identity(value)
    where jsonb_typeof(value) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(value)) not between 1 and 4
       or exists (
         select 1 from jsonb_object_keys(value) key
         where key not in ('flixpatrolId','imdbId','tmdbId','mediaType')
       )
       or not (value ? 'flixpatrolId' or value ? 'imdbId' or value ? 'tmdbId')
       or (value ? 'flixpatrolId' and (
         jsonb_typeof(value->'flixpatrolId') is distinct from 'string'
         or value->>'flixpatrolId' !~ '^ttl_[A-Za-z0-9]{20,40}$'
       ))
       or (value ? 'imdbId' and (
         jsonb_typeof(value->'imdbId') is distinct from 'string'
         or value->>'imdbId' !~ '^tt[0-9]{7,10}$'
       ))
       or (value ? 'tmdbId' and (
         jsonb_typeof(value->'tmdbId') is distinct from 'string'
         or value->>'tmdbId' !~ '^[1-9][0-9]{0,8}$'
       ))
       or (value ? 'mediaType' and (
         jsonb_typeof(value->'mediaType') is distinct from 'string'
         or value->>'mediaType' not in ('film','series')
       ))
  ) then
    return jsonb_build_object('ok',false,'code','invalid-request');
  end if;

  with identities as (
    select value, ordinality
    from jsonb_array_elements(p_identities) with ordinality identity(value, ordinality)
  ), matches as (
    select identity.ordinality, title.source_id
    from identities identity
    join public.kd_flixpatrol_title_cache title
      on title.status = 'resolved'
     and (not (identity.value ? 'flixpatrolId') or title.source_id = identity.value->>'flixpatrolId')
     and (not (identity.value ? 'imdbId') or title.imdb_id = identity.value->>'imdbId')
     and (not (identity.value ? 'tmdbId') or title.tmdb_id::text = identity.value->>'tmdbId')
     and (not (identity.value ? 'mediaType') or title.media_type = identity.value->>'mediaType')
  ), unambiguous as (
    select min(source_id) source_id
    from matches
    group by ordinality
    having count(distinct source_id) = 1
  )
  select coalesce(array_agg(distinct source_id order by source_id),'{}'::text[])
    into v_source_ids from unambiguous;

  return jsonb_build_object(
    'ok',true,
    'schemaVersion','title-facts-projection-v1',
    'items',public.kd_title_facts_projection_internal(v_source_ids)
  );
end
$$;

revoke all on function public.kd_flixpatrol_titles_read(text[])
  from public, anon;
grant execute on function public.kd_flixpatrol_titles_read(text[])
  to authenticated, service_role;
revoke all on function public.kd_title_facts_lookup(jsonb)
  from public, anon;
grant execute on function public.kd_title_facts_lookup(jsonb)
  to authenticated, service_role;

comment on function public.kd_title_facts_lookup(jsonb) is
  'Read-only Faktenprojektion fuer hoechstens 50 starke, namenfreie Titelidentitaeten; mehrdeutige oder widerspruechliche IDs liefern keinen Treffer.';

commit;
