begin;

-- Keep the existing catalog contract, but aggregate identities and source
-- targets once per work group.  The previous projection executed correlated
-- subqueries for every projected work and became quadratic at production
-- catalog size.
create or replace function public.kd_blog_catalog_works_setwise()
returns table (
  work_key text,
  title text,
  title_norm text,
  release_year integer,
  media_type text,
  identities jsonb,
  sources jsonb,
  identity_conflict boolean
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
with stream_state as (
  select source_revision, generated_at
    from public.kd_streaming_page_state where singleton
), stream_effective as (
  select distinct on (x.output_key) x.* from (
    select m.output_key, m.payload, m.services, m.work_type, m.release_year,
      m.watchmode_id, m.imdb_id, m.tmdb_id, 1 as priority
      from public.kd_streaming_page_motn m where not m.hidden
    union all
    select b.source_key, b.payload, b.services, b.work_type, b.release_year,
      b.watchmode_id, b.imdb_id, b.tmdb_id, 2
      from public.kd_streaming_page_base b
  ) x order by x.output_key, x.priority
), stream_records as (
  select
    's:' || e.output_key as record_key,
    e.output_key,
    coalesce(nullif(e.payload->>'titel',''), nullif(e.payload->>'title','')) as title,
    public.kd_blog_title_norm(coalesce(e.payload->>'titel',e.payload->>'title')) as title_norm,
    coalesce(e.release_year, public.kd_blog_int(coalesce(e.payload->>'jahr',e.payload->>'year'))) as release_year,
    public.kd_blog_media_type(coalesce(e.work_type,e.payload->>'typ',e.payload->>'type')) as media_type,
    e.watchmode_id, e.imdb_id, e.tmdb_id, null::text as film_at_id,
    e.services, s.source_revision, s.generated_at,
    null::timestamptz as cinema_valid_until, null::text as cinema_revision
  from stream_effective e cross join stream_state s
  where public.kd_blog_title_norm(coalesce(e.payload->>'titel',e.payload->>'title')) is not null
), program_root as (
  select coalesce(c.payload->'filme',c.payload->'data'->'filme') as filme,
    c.updated_at, c.stand,
    coalesce(c.gueltig_bis, c.updated_at + interval '24 hours') as catalog_valid_until
  from public.kd_catalog c
  where c.name = 'programm'
    and jsonb_typeof(coalesce(c.payload->'filme',c.payload->'data'->'filme')) = 'array'
), program_records as (
  select
    'c:' || (f.value->>'film_at_id') as record_key,
    null::text as output_key,
    coalesce(nullif(f.value->>'titel',''),nullif(f.value->>'t','')) as title,
    public.kd_blog_title_norm(coalesce(f.value->>'titel',f.value->>'t')) as title_norm,
    public.kd_blog_int(coalesce(f.value->>'jahr',f.value->>'j')) as release_year,
    'film'::text as media_type,
    null::text as watchmode_id, null::text as imdb_id, null::text as tmdb_id,
    nullif(btrim(f.value->>'film_at_id'),'') as film_at_id,
    '{}'::text[] as services, 0::bigint as source_revision, p.updated_at as generated_at,
    case when times.last_showing is null then null
      else least(p.catalog_valid_until, times.last_showing + interval '3 hours') end as cinema_valid_until,
    coalesce(p.stand::text,p.updated_at::text) as cinema_revision
  from program_root p cross join lateral jsonb_array_elements(p.filme) f(value)
  left join lateral (
    select max(public.kd_blog_time(v.value->>'zeit')) as last_showing
      from jsonb_array_elements(case when jsonb_typeof(f.value->'vorstellungen')='array'
        then f.value->'vorstellungen' else '[]'::jsonb end) v(value)
     where public.kd_blog_time(v.value->>'zeit') > now()
  ) times on true
  where nullif(btrim(f.value->>'film_at_id'),'') is not null
    and public.kd_blog_title_norm(coalesce(f.value->>'titel',f.value->>'t')) is not null
), records as (
  select * from stream_records
  union all
  select * from program_records
), keyed as (
  select r.*, coalesce(r.title_norm,'') || '|' || coalesce(r.release_year::text,'') || '|' || r.media_type as composite
  from records r
), composite_conflicts as (
  select composite,
    count(distinct watchmode_id)>1 or count(distinct imdb_id)>1
      or count(distinct tmdb_id)>1 or count(distinct film_at_id)>1 as identity_conflict
  from keyed group by composite
), grouped as (
  select k.*,
    case when c.identity_conflict then k.composite || '|' || k.record_key else k.composite end as work_group
  from keyed k join composite_conflicts c using(composite)
), work_aggregates as (
  select
    g.work_group,
    (array_agg(g.title order by g.record_key))[1] as title,
    min(g.title_norm) as title_norm,
    min(g.release_year) as release_year,
    min(g.media_type) as media_type,
    jsonb_build_object(
      'watchmode',coalesce(jsonb_agg(distinct g.watchmode_id) filter (where g.watchmode_id is not null),'[]'::jsonb),
      'imdb',coalesce(jsonb_agg(distinct g.imdb_id) filter (where g.imdb_id is not null),'[]'::jsonb),
      'tmdb',coalesce(jsonb_agg(distinct g.tmdb_id) filter (where g.tmdb_id is not null),'[]'::jsonb),
      'film_at',coalesce(jsonb_agg(distinct g.film_at_id) filter (where g.film_at_id is not null),'[]'::jsonb)
    ) as identities
  from grouped g
  group by g.work_group
), stream_targets as (
  select g.work_group,
    jsonb_agg(distinct jsonb_build_object(
      'kind','streaming','sourceId',public.kd_blog_streaming_source_id(svc),
      'art','programm','ref',g.output_key,'titel',g.title,
      'sourceRevision','streaming:' || g.source_revision::text,
      'checkedAt',g.generated_at,'validUntil',g.generated_at + interval '48 hours'
    )) as targets
  from grouped g cross join lateral unnest(g.services) svc
  where g.output_key is not null and public.kd_blog_streaming_source_id(svc) is not null
  group by g.work_group
), cinema_targets as (
  select g.work_group,
    jsonb_agg(distinct jsonb_build_object(
      'kind','cinema','art','programm','ref',g.film_at_id,'titel',g.title,
      'sourceRevision',g.cinema_revision,'checkedAt',g.generated_at,
      'validUntil',g.cinema_valid_until
    )) as targets
  from grouped g
  where g.film_at_id is not null and g.cinema_valid_until > now()
  group by g.work_group
)
select
  'work:' || md5(w.work_group),
  w.title,
  w.title_norm,
  w.release_year,
  w.media_type,
  w.identities,
  jsonb_build_object(
    'streaming',coalesce(s.targets,'[]'::jsonb),
    'cinema',coalesce(c.targets,'[]'::jsonb)
  ),
  false
from work_aggregates w
left join stream_targets s using(work_group)
left join cinema_targets c using(work_group)
$$;

comment on function public.kd_blog_catalog_works_setwise() is
  'Backend-only setwise projection used to build one transaction-local catalog snapshot.';

-- Resolver, source projection and publication helpers can ask for the same
-- catalog several times in one RPC (up to 15 references).  Build the verified
-- projection once per transaction and index the private temp snapshot for all
-- subsequent point lookups in that RPC.  ON COMMIT DROP prevents stale data
-- from crossing requests on a pooled database connection.
create or replace function public.kd_blog_catalog_works()
returns table (
  work_key text,
  title text,
  title_norm text,
  release_year integer,
  media_type text,
  identities jsonb,
  sources jsonb,
  identity_conflict boolean
)
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
begin
  if to_regclass('pg_temp.kd_blog_catalog_snapshot') is null then
    execute 'create temporary table kd_blog_catalog_snapshot on commit drop as
      select * from public.kd_blog_catalog_works_setwise()';
    execute 'create unique index kd_blog_catalog_snapshot_work_key_idx
      on kd_blog_catalog_snapshot(work_key)';
    execute 'create index kd_blog_catalog_snapshot_title_idx
      on kd_blog_catalog_snapshot(title_norm,release_year,media_type)';
    execute 'create index kd_blog_catalog_snapshot_identities_idx
      on kd_blog_catalog_snapshot using gin(identities)';
  end if;
  return query execute 'select work_key,title,title_norm,release_year,media_type,
    identities,sources,identity_conflict from pg_temp.kd_blog_catalog_snapshot';
end
$$;

comment on function public.kd_blog_catalog_works() is
  'Backend-only transaction-local projection of verified catalog works and current neutral source targets.';

revoke all on function public.kd_blog_catalog_works_setwise() from public,anon,authenticated,service_role;

commit;
