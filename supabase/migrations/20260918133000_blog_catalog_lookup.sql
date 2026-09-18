begin;

-- Preserve the verified-work contract while resolving the small vocabulary of
-- raw service labels once per distinct label.  The former plan evaluated the
-- normalization function repeatedly inside a 25k-row lateral unnest.
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
set jit = off
set work_mem = '16MB'
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
), service_ids as materialized (
  select d.service_name,public.kd_blog_streaming_source_id(d.service_name) as source_id
  from (
    select distinct svc as service_name
    from grouped g cross join lateral unnest(g.services) svc
    where g.output_key is not null
  ) d
), stream_targets as (
  select g.work_group,
    jsonb_agg(distinct jsonb_build_object(
      'kind','streaming','sourceId',sid.source_id,
      'art','programm','ref',g.output_key,'titel',g.title,
      'sourceRevision','streaming:' || g.source_revision::text,
      'checkedAt',g.generated_at,'validUntil',g.generated_at + interval '48 hours'
    )) as targets
  from grouped g cross join lateral unnest(g.services) svc
  join service_ids sid on sid.service_name=svc and sid.source_id is not null
  where g.output_key is not null
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

-- Materialize the verified catalog once per transaction.  Point lookups below
-- address the temporary table directly so PostgreSQL can use its indexes;
-- filtering the set-returning kd_blog_catalog_works() wrapper would otherwise
-- scan all projected rows on every helper call.
create or replace function public.kd_blog_prepare_catalog_snapshot()
returns void
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
    execute 'analyze kd_blog_catalog_snapshot';
  end if;
end
$$;

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
  perform public.kd_blog_prepare_catalog_snapshot();
  return query execute 'select work_key,title,title_norm,release_year,media_type,
    identities,sources,identity_conflict from pg_temp.kd_blog_catalog_snapshot';
end
$$;

create or replace function public.kd_blog_catalog_work(p_work_key text)
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
  perform public.kd_blog_prepare_catalog_snapshot();
  return query execute 'select work_key,title,title_norm,release_year,media_type,
    identities,sources,identity_conflict from pg_temp.kd_blog_catalog_snapshot
    where work_key=$1' using p_work_key;
end
$$;

create or replace function public.kd_blog_verified_identity_hints(p_work_key text)
returns jsonb
language sql volatile security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'namespace',n.namespace,'value',(w.identities->n.namespace)->>0)
    order by n.ordinal),'[]'::jsonb)
  from public.kd_blog_catalog_work(p_work_key) w
  cross join (values ('imdb',1),('tmdb',2),('watchmode',3),('film_at',4)) n(namespace,ordinal)
  where jsonb_typeof(w.identities->n.namespace)='array'
    and jsonb_array_length(w.identities->n.namespace)=1
    and nullif(btrim((w.identities->n.namespace)->>0),'') is not null
$$;

create or replace function public.kd_blog_source_envelope(p_work_key text default null)
returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_stream_revision bigint;
  v_stream_checked timestamptz;
  v_program_checked timestamptz;
  v_program_valid timestamptz;
  v_program_revision text;
  v_targets jsonb := '{"streaming":[],"cinema":[]}'::jsonb;
  v_checked boolean := false;
  v_checked_at timestamptz;
  v_valid_until timestamptz;
begin
  select source_revision, generated_at into v_stream_revision,v_stream_checked
    from public.kd_streaming_page_state where singleton;
  select updated_at,coalesce(gueltig_bis,updated_at+interval '24 hours'),coalesce(stand::text,updated_at::text)
    into v_program_checked,v_program_valid,v_program_revision
    from public.kd_catalog where name='programm'
      and jsonb_typeof(coalesce(payload->'filme',payload->'data'->'filme'))='array';

  if p_work_key is not null then
    select w.sources into v_targets from public.kd_blog_catalog_work(p_work_key) w;
    v_targets := coalesce(v_targets,'{"streaming":[],"cinema":[]}'::jsonb);
  end if;

  v_checked := v_stream_checked is not null and v_stream_checked <= now()
    and v_stream_checked + interval '48 hours' > now()
    and v_program_checked is not null and v_program_checked <= now()
    and v_program_valid > now();
  if v_checked then
    v_checked_at := least(v_stream_checked,v_program_checked);
    v_valid_until := least(v_stream_checked+interval '48 hours',v_program_valid);
  end if;

  return jsonb_build_object(
    'status',case when v_checked then 'checked' else 'unchecked' end,
    'checkedAt',v_checked_at,'validUntil',v_valid_until,
    'streamingRevision',case when v_stream_revision is null then null else 'streaming:'||v_stream_revision::text end,
    'cinemaRevision',v_program_revision,
    'streaming',coalesce(v_targets->'streaming','[]'::jsonb),
    'cinema',coalesce(v_targets->'cinema','[]'::jsonb));
end
$$;

create or replace function public.kd_blog_resolve_reference(p_reference jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_title_norm text := public.kd_blog_title_norm(p_reference->>'title');
  v_year integer := public.kd_blog_int(p_reference->>'year');
  v_type text := public.kd_blog_media_type(p_reference->>'mediaType');
  v_intent text := p_reference->'resolutionIntent'->>'kind';
  v_confirm text := p_reference->'resolutionIntent'->>'workKey';
  v_hints jsonb := coalesce(p_reference->'identityHints','[]'::jsonb);
  v_hint jsonb;
  v_hint_count integer;
  v_hint_work text;
  v_work text;
  v_count integer;
  v_conflict boolean;
  v_sources jsonb;
  v_candidates jsonb := '[]'::jsonb;
begin
  if v_intent = 'keep_redlink' then
    v_sources := public.kd_blog_source_envelope(null);
    return jsonb_build_object('resolution',jsonb_build_object('status','not_found','workKey',null),
      'sources',v_sources,'sourceFingerprint',public.kd_blog_source_fingerprint(v_sources),
      'decisionCandidates','[]'::jsonb);
  end if;

  perform public.kd_blog_prepare_catalog_snapshot();
  if v_intent = 'confirm_work' then
    execute 'select work_key,identity_conflict from pg_temp.kd_blog_catalog_snapshot
      where work_key=$1 and title_norm=$2 and ($3 is null or release_year=$3) and media_type=$4'
      into v_work,v_conflict using v_confirm,v_title_norm,v_year,v_type;
    if v_work is null or v_conflict then
      v_sources := public.kd_blog_source_envelope(null);
      return jsonb_build_object('resolution',jsonb_build_object('status','ambiguous','workKey',null),
        'sources',v_sources,'sourceFingerprint',public.kd_blog_source_fingerprint(v_sources),
        'decisionCandidates','[]'::jsonb);
    end if;
  elsif jsonb_array_length(v_hints) > 0 then
    for v_hint in select value from jsonb_array_elements(v_hints)
    loop
      execute 'select count(*),min(work_key) from pg_temp.kd_blog_catalog_snapshot
        where identities @> jsonb_build_object($1,jsonb_build_array($2))
          and title_norm=$3 and ($4 is null or release_year=$4) and media_type=$5'
        into v_hint_count,v_hint_work using v_hint->>'namespace',v_hint->>'value',v_title_norm,v_year,v_type;
      if v_hint_count <> 1 or (v_work is not null and v_work <> v_hint_work) then
        v_work := null;
        exit;
      end if;
      v_work := v_hint_work;
    end loop;
    if v_work is not null then
      execute 'select identity_conflict from pg_temp.kd_blog_catalog_snapshot where work_key=$1'
        into v_conflict using v_work;
      if v_conflict then v_work:=null; end if;
    end if;
  else
    execute 'select count(*),min(work_key),bool_or(identity_conflict)
      from pg_temp.kd_blog_catalog_snapshot
      where title_norm=$1 and ($2 is null or release_year=$2) and media_type=$3'
      into v_count,v_work,v_conflict using v_title_norm,v_year,v_type;
    if v_count <> 1 or coalesce(v_conflict,false) then v_work:=null; end if;
  end if;

  if v_work is not null then
    v_sources := public.kd_blog_source_envelope(v_work);
    return jsonb_build_object('resolution',jsonb_build_object('status','matched','workKey',v_work),
      'sources',v_sources,'sourceFingerprint',public.kd_blog_source_fingerprint(v_sources),
      'decisionCandidates','[]'::jsonb);
  end if;

  execute 'select coalesce(jsonb_agg(jsonb_build_object(''workKey'',q.work_key,''title'',q.title,
      ''year'',q.release_year,''mediaType'',q.media_type) order by q.release_year,q.work_key),''[]''::jsonb)
    from (select work_key,title,release_year,media_type
      from pg_temp.kd_blog_catalog_snapshot where title_norm=$1 and media_type=$2
      order by case when $3 is not null and release_year=$3 then 0 else 1 end,
        release_year,work_key limit 5) q'
    into v_candidates using v_title_norm,v_type,v_year;
  v_sources := public.kd_blog_source_envelope(null);
  if jsonb_array_length(v_candidates)>0 or jsonb_array_length(v_hints)>0 or v_intent='confirm_work' then
    return jsonb_build_object('resolution',jsonb_build_object('status','ambiguous','workKey',null),
      'sources',v_sources,'sourceFingerprint',public.kd_blog_source_fingerprint(v_sources),
      'decisionCandidates',v_candidates);
  end if;
  return jsonb_build_object('resolution',jsonb_build_object(
      'status',case when v_sources->>'status'='checked' then 'not_found' else 'unchecked' end,
      'workKey',null),
    'sources',v_sources,'sourceFingerprint',public.kd_blog_source_fingerprint(v_sources),
    'decisionCandidates','[]'::jsonb);
end
$$;

comment on function public.kd_blog_prepare_catalog_snapshot() is
  'Backend-only creator for a transaction-local verified catalog snapshot.';
comment on function public.kd_blog_catalog_work(text) is
  'Backend-only indexed lookup in the transaction-local verified catalog snapshot.';

revoke all on function public.kd_blog_prepare_catalog_snapshot() from public,anon,authenticated,service_role;
revoke all on function public.kd_blog_catalog_work(text) from public,anon,authenticated,service_role;

commit;
