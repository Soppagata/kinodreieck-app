-- Kinodreieck blog publication v1: anonymous public projection, idempotent
-- owner mutations, bounded source preparation and cursor based public reads.
-- Uses only the existing streaming projection and kd_catalog.programm.
begin;

alter table public.kd_shared_articles
  add column if not exists contract_version text,
  add column if not exists public_revision integer not null default 1,
  add column if not exists published_content_version uuid;

alter table public.kd_shared_articles
  drop constraint if exists kd_shared_articles_public_revision_valid;
alter table public.kd_shared_articles
  add constraint kd_shared_articles_public_revision_valid
  check (public_revision > 0);

create table if not exists public.kd_blog_publication_operations (
  account_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  article_id text not null,
  action text not null check (action in ('publish','update','withdraw')),
  request_hash text not null,
  status text not null check (status in ('unknown','applied','not_applied')),
  response jsonb,
  error_code text,
  conflict_detected boolean not null default false,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (account_id, operation_id)
);

create table if not exists public.kd_blog_work_sources (
  work_key text primary key,
  sources jsonb not null check (jsonb_typeof(sources) = 'object'),
  source_fingerprint text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.kd_blog_publication_references (
  publication_id uuid not null references public.kd_shared_articles(publication_id) on delete cascade,
  private_row_id text not null,
  reference_id uuid not null default gen_random_uuid(),
  content_version uuid not null,
  rank integer not null check (rank between 1 and 15),
  title text not null check (char_length(title) between 1 and 240),
  release_year integer,
  media_type text not null check (media_type in ('film','serie','musik','sonstiges')),
  resolution_input jsonb not null check (jsonb_typeof(resolution_input)='object'),
  input_hash text not null,
  resolution_status text not null check (resolution_status in ('matched','not_found','ambiguous','unchecked','error')),
  work_key text,
  sources jsonb not null check (jsonb_typeof(sources) = 'object'),
  source_fingerprint text not null,
  updated_at timestamptz not null default now(),
  primary key (publication_id, private_row_id),
  unique (reference_id),
  unique (publication_id, rank),
  check ((resolution_status = 'matched') = (work_key is not null))
);

create table if not exists public.kd_blog_reference_refresh_state (
  singleton boolean primary key default true check (singleton),
  requested_generation bigint not null default 0 check (requested_generation >= 0),
  completed_generation bigint not null default 0 check (completed_generation >= 0),
  scan_cursor text,
  scan_complete boolean not null default true,
  last_source_event text,
  updated_at timestamptz not null default now()
);

insert into public.kd_blog_reference_refresh_state(singleton)
values(true) on conflict(singleton) do nothing;

create table if not exists public.kd_blog_reference_refresh_queue (
  unit_key text primary key,
  unit_kind text not null check (unit_kind in ('work','reference')),
  work_key text,
  reference_id uuid,
  target_generation bigint not null check (target_generation > 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  enqueued_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_error text,
  check ((unit_kind='work' and work_key is not null and reference_id is null)
      or (unit_kind='reference' and work_key is null and reference_id is not null))
);

create index if not exists kd_blog_publication_operations_article
  on public.kd_blog_publication_operations(account_id, article_id, created_at desc);
create index if not exists kd_blog_publication_references_work
  on public.kd_blog_publication_references(work_key)
  where work_key is not null;
create index if not exists kd_blog_reference_refresh_queue_due
  on public.kd_blog_reference_refresh_queue(available_at,enqueued_at,unit_key);

alter table public.kd_blog_publication_operations enable row level security;
alter table public.kd_blog_work_sources enable row level security;
alter table public.kd_blog_publication_references enable row level security;
alter table public.kd_blog_reference_refresh_state enable row level security;
alter table public.kd_blog_reference_refresh_queue enable row level security;

revoke all on public.kd_blog_publication_operations,
  public.kd_blog_work_sources, public.kd_blog_publication_references,
  public.kd_blog_reference_refresh_state, public.kd_blog_reference_refresh_queue
  from public, anon, authenticated;
grant all on public.kd_blog_publication_operations,
  public.kd_blog_work_sources, public.kd_blog_publication_references,
  public.kd_blog_reference_refresh_state, public.kd_blog_reference_refresh_queue
  to service_role;

create or replace function public.kd_blog_title_norm(p_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select nullif(btrim(regexp_replace(lower(coalesce(p_value,'')), '[^[:alnum:]]+', ' ', 'g')), '')
$$;

create or replace function public.kd_blog_media_type(p_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case lower(btrim(coalesce(p_value,'')))
    when 'movie' then 'film' when 'film' then 'film'
    when 'series' then 'serie' when 'serie' then 'serie'
    when 'tv' then 'serie' when 'tv_series' then 'serie'
    when 'music' then 'musik' when 'musik' then 'musik'
    else 'sonstiges' end
$$;

create or replace function public.kd_blog_int(p_value text) returns integer
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_value is null or btrim(p_value) !~ '^-?[0-9]+$' then return null; end if;
  return btrim(p_value)::integer;
exception when others then return null;
end
$$;

create or replace function public.kd_blog_time(p_value text) returns timestamptz
language plpgsql stable set search_path = pg_catalog as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::timestamptz;
exception when others then return null;
end
$$;

create or replace function public.kd_blog_streaming_source_id(p_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case regexp_replace(lower(btrim(coalesce(p_value,''))), '[^a-z0-9+]+', '', 'g')
    when 'netflix' then 'netflix'
    when 'primevideo' then 'prime'
    when 'amazonprimevideo' then 'prime'
    when 'disney+' then 'disney'
    when 'disneyplus' then 'disney'
    when 'appletv+' then 'apple'
    when 'appletvplus' then 'apple'
    when 'hbomax' then 'hbo'
    when 'max' then 'hbo'
    when 'paramountplus' then 'paramount'
    when 'mubi' then 'mubi'
    when 'crunchyrollpremium' then 'crunchyroll'
    when 'crunchyroll' then 'crunchyroll'
    when 'rtl+' then 'rtl'
    when 'rtlplus' then 'rtl'
    else null end
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
), keys as (
  select distinct work_group,title_norm,release_year,media_type from grouped
), stream_targets as (
  select k.work_group, jsonb_build_object(
    'kind','streaming','sourceId',public.kd_blog_streaming_source_id(svc),
    'art','programm','ref',k.output_key,'titel',k.title,
    'sourceRevision','streaming:' || k.source_revision::text,
    'checkedAt',k.generated_at,'validUntil',k.generated_at + interval '48 hours') as target
  from grouped k cross join lateral unnest(k.services) svc
  where k.output_key is not null and public.kd_blog_streaming_source_id(svc) is not null
), cinema_targets as (
  select k.work_group, jsonb_build_object(
    'kind','cinema','art','programm','ref',k.film_at_id,'titel',k.title,
    'sourceRevision',k.cinema_revision,'checkedAt',k.generated_at,
    'validUntil',k.cinema_valid_until) as target
  from grouped k
  where k.film_at_id is not null and k.cinema_valid_until > now()
)
select
  'work:' || md5(k.work_group),
  (select r.title from grouped r where r.work_group=k.work_group order by r.record_key limit 1),
  k.title_norm, k.release_year, k.media_type,
  jsonb_build_object(
    'watchmode',coalesce((select jsonb_agg(distinct r.watchmode_id) from grouped r where r.work_group=k.work_group and r.watchmode_id is not null),'[]'::jsonb),
    'imdb',coalesce((select jsonb_agg(distinct r.imdb_id) from grouped r where r.work_group=k.work_group and r.imdb_id is not null),'[]'::jsonb),
    'tmdb',coalesce((select jsonb_agg(distinct r.tmdb_id) from grouped r where r.work_group=k.work_group and r.tmdb_id is not null),'[]'::jsonb),
    'film_at',coalesce((select jsonb_agg(distinct r.film_at_id) from grouped r where r.work_group=k.work_group and r.film_at_id is not null),'[]'::jsonb)
  ),
  jsonb_build_object(
    'streaming',coalesce((select jsonb_agg(distinct st.target) from stream_targets st where st.work_group=k.work_group),'[]'::jsonb),
    'cinema',coalesce((select jsonb_agg(distinct ct.target) from cinema_targets ct where ct.work_group=k.work_group),'[]'::jsonb)
  ),
  false
from keys k
$$;

create or replace function public.kd_blog_source_envelope(p_work_key text default null)
returns jsonb
language plpgsql stable security definer
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
    select w.sources into v_targets from public.kd_blog_catalog_works() w where w.work_key=p_work_key;
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

create or replace function public.kd_blog_source_fingerprint(p_sources jsonb) returns text
language sql immutable set search_path = pg_catalog as $$
  select md5(jsonb_build_object(
    'status',p_sources->'status','validUntil',p_sources->'validUntil',
    'streamingRevision',p_sources->'streamingRevision',
    'cinemaRevision',p_sources->'cinemaRevision')::text)
$$;

create or replace function public.kd_blog_resolve_reference(p_reference jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_title text := nullif(btrim(p_reference->>'title'),'');
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

  if v_intent = 'confirm_work' then
    select w.work_key,w.identity_conflict into v_work,v_conflict
      from public.kd_blog_catalog_works() w
     where w.work_key=v_confirm and w.title_norm=v_title_norm
       and (v_year is null or w.release_year=v_year) and w.media_type=v_type;
    if v_work is null or v_conflict then
      v_sources := public.kd_blog_source_envelope(null);
      return jsonb_build_object('resolution',jsonb_build_object('status','ambiguous','workKey',null),
        'sources',v_sources,'sourceFingerprint',public.kd_blog_source_fingerprint(v_sources),
        'decisionCandidates','[]'::jsonb);
    end if;
  elsif jsonb_array_length(v_hints) > 0 then
    for v_hint in select value from jsonb_array_elements(v_hints)
    loop
      select count(*),min(w.work_key) into v_hint_count,v_hint_work
        from public.kd_blog_catalog_works() w
       where coalesce(w.identities->(v_hint->>'namespace'),'[]'::jsonb) ? (v_hint->>'value')
         and w.title_norm=v_title_norm
         and (v_year is null or w.release_year=v_year)
         and w.media_type=v_type;
      if v_hint_count <> 1 or (v_work is not null and v_work <> v_hint_work) then
        v_work := null;
        exit;
      end if;
      v_work := v_hint_work;
    end loop;
    if v_work is not null then
      select identity_conflict into v_conflict from public.kd_blog_catalog_works() where work_key=v_work;
      if v_conflict then v_work:=null; end if;
    end if;
  else
    select count(*),min(w.work_key),bool_or(w.identity_conflict)
      into v_count,v_work,v_conflict
      from public.kd_blog_catalog_works() w
     where w.title_norm=v_title_norm
       and (v_year is null or w.release_year=v_year)
       and w.media_type=v_type;
    if v_count <> 1 or coalesce(v_conflict,false) then v_work:=null; end if;
  end if;

  if v_work is not null then
    v_sources := public.kd_blog_source_envelope(v_work);
    return jsonb_build_object('resolution',jsonb_build_object('status','matched','workKey',v_work),
      'sources',v_sources,'sourceFingerprint',public.kd_blog_source_fingerprint(v_sources),
      'decisionCandidates','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('workKey',q.work_key,'title',q.title,
      'year',q.release_year,'mediaType',q.media_type) order by q.release_year,q.work_key),'[]'::jsonb)
    into v_candidates
    from (select w.* from public.kd_blog_catalog_works() w
      where w.title_norm=v_title_norm and w.media_type=v_type
      order by case when v_year is not null and w.release_year=v_year then 0 else 1 end,
        w.release_year,w.work_key limit 5) q;
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

create or replace function public.kd_blog_require_owner() returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_account uuid := auth.uid();
begin
  if v_account is null then
    raise exception 'authenticated account required' using errcode='42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode='42501';
  end if;
  return v_account;
end
$$;

create or replace function public.kd_blog_validate_write_request(p_request jsonb,p_action text)
returns void
language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  v_refs jsonb;
  v_ref jsonb;
  v_hint jsonb;
  v_rank integer;
begin
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ?& array['contractVersion','operationId','contentVersion','privateArticleId','expectedPublicRevision','article'])
    or p_request - array['contractVersion','operationId','contentVersion','privateArticleId','expectedPublicRevision','article'] <> '{}'::jsonb
    or p_request->>'contractVersion'<>'blog-publication-v1'
    or coalesce(p_request->>'operationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(p_request->>'contentVersion','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or char_length(coalesce(p_request->>'privateArticleId','')) not between 1 and 160
    or jsonb_typeof(p_request->'article')<>'object'
    or not (p_request->'article' ?& array['title','text','ordered','references'])
    or (p_request->'article') - array['title','text','ordered','references'] <> '{}'::jsonb
    or char_length(btrim(coalesce(p_request->'article'->>'title',''))) not between 1 and 240
    or char_length(btrim(coalesce(p_request->'article'->>'text',''))) < 1
    or jsonb_typeof(p_request->'article'->'ordered')<>'boolean'
    or jsonb_typeof(p_request->'article'->'references')<>'array'
    or jsonb_array_length(p_request->'article'->'references')>15 then
    raise exception 'invalid_blog_publication_request' using errcode='22023';
  end if;
  if (p_action='publish' and jsonb_typeof(p_request->'expectedPublicRevision')<>'null')
    or (p_action='update' and (jsonb_typeof(p_request->'expectedPublicRevision')<>'number'
      or public.kd_blog_int(p_request->>'expectedPublicRevision') is null
      or public.kd_blog_int(p_request->>'expectedPublicRevision')<1)) then
    raise exception 'invalid_expected_public_revision' using errcode='22023';
  end if;

  v_refs:=p_request->'article'->'references';
  if (select count(*)<>count(distinct value->>'rowId') from jsonb_array_elements(v_refs))
    or (select count(*)<>count(distinct public.kd_blog_int(value->>'rank')) from jsonb_array_elements(v_refs)) then
    raise exception 'duplicate_blog_reference_identity_or_rank' using errcode='22023';
  end if;
  v_rank:=0;
  for v_ref in select value from jsonb_array_elements(v_refs) order by public.kd_blog_int(value->>'rank')
  loop
    v_rank:=v_rank+1;
    if jsonb_typeof(v_ref)<>'object'
      or not (v_ref ?& array['rowId','rank','title','year','mediaType','resolutionIntent'])
      or v_ref - array['rowId','rank','title','year','mediaType','identityHints','resolutionIntent'] <> '{}'::jsonb
      or char_length(coalesce(v_ref->>'rowId','')) not between 1 and 160
      or public.kd_blog_int(v_ref->>'rank')<>v_rank
      or char_length(btrim(coalesce(v_ref->>'title',''))) not between 1 and 240
      or (jsonb_typeof(v_ref->'year') not in ('number','null'))
      or (jsonb_typeof(v_ref->'year')='number' and (public.kd_blog_int(v_ref->>'year') not between 1870 and 2200))
      or coalesce(v_ref->>'mediaType','') not in ('film','serie','musik','sonstiges')
      or jsonb_typeof(v_ref->'resolutionIntent')<>'object'
      or coalesce(v_ref->'resolutionIntent'->>'kind','') not in ('auto','keep_redlink','confirm_work')
      or (v_ref->'resolutionIntent'->>'kind'='confirm_work'
        and (v_ref->'resolutionIntent')-array['kind','workKey']<>'{}'::jsonb)
      or (v_ref->'resolutionIntent'->>'kind'<>'confirm_work'
        and (v_ref->'resolutionIntent')-array['kind']<>'{}'::jsonb)
      or (v_ref->'resolutionIntent'->>'kind'='confirm_work'
        and char_length(coalesce(v_ref->'resolutionIntent'->>'workKey',''))<1)
      or (v_ref->'resolutionIntent'->>'kind'<>'confirm_work' and v_ref->'resolutionIntent' ? 'workKey') then
      raise exception 'invalid_blog_reference' using errcode='22023';
    end if;
    if v_ref ? 'identityHints' then
      if jsonb_typeof(v_ref->'identityHints')<>'array' or jsonb_array_length(v_ref->'identityHints')>4
        or (select count(*)<>count(distinct value->>'namespace') from jsonb_array_elements(v_ref->'identityHints')) then
        raise exception 'invalid_blog_identity_hints' using errcode='22023';
      end if;
      for v_hint in select value from jsonb_array_elements(v_ref->'identityHints')
      loop
        if jsonb_typeof(v_hint)<>'object'
          or not (v_hint ?& array['namespace','value'])
          or v_hint - array['namespace','value'] <> '{}'::jsonb
          or coalesce(v_hint->>'namespace','') not in ('imdb','tmdb','watchmode','film_at')
          or char_length(btrim(coalesce(v_hint->>'value',''))) not between 1 and 160 then
          raise exception 'invalid_blog_identity_hint' using errcode='22023';
        end if;
      end loop;
    end if;
  end loop;
end
$$;

create or replace function public.kd_blog_operation_prepare(
  p_account uuid,p_operation uuid,p_article text,p_action text,p_request jsonb)
returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text:=md5(p_request::text);
  v_row public.kd_blog_publication_operations%rowtype;
begin
  insert into public.kd_blog_publication_operations(
    account_id,operation_id,article_id,action,request_hash,status)
  values(p_account,p_operation,p_article,p_action,v_hash,'unknown')
  on conflict(account_id,operation_id) do nothing;

  select * into v_row from public.kd_blog_publication_operations
   where account_id=p_account and operation_id=p_operation for update;
  if v_row.article_id<>p_article or v_row.action<>p_action or v_row.request_hash<>v_hash then
    update public.kd_blog_publication_operations set conflict_detected=true
     where account_id=p_account and operation_id=p_operation;
    return jsonb_build_object('state','conflict','response',jsonb_build_object(
      'contractVersion','blog-publication-v1','outcome','conflict',
      'operationId',p_operation,'contentVersion',p_request->>'contentVersion',
      'publication',null,'referenceResults','[]'::jsonb,'decisionRequests','[]'::jsonb,
      'errorCode','OPERATION_ID_CONFLICT'));
  end if;
  if v_row.status<>'unknown' and v_row.response is not null then
    return jsonb_build_object('state','replay','response',v_row.response);
  end if;
  return jsonb_build_object('state','new');
end
$$;

create or replace function public.kd_blog_operation_finish(
  p_account uuid,p_operation uuid,p_status text,p_response jsonb,p_error text default null)
returns void
language sql volatile security definer
set search_path = pg_catalog, public
as $$
  update public.kd_blog_publication_operations
     set status=p_status,response=p_response,error_code=p_error,finished_at=clock_timestamp()
   where account_id=p_account and operation_id=p_operation
$$;

create or replace function public.kd_blog_apply_publication(p_request jsonb,p_action text)
returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_account uuid;
  v_operation uuid;
  v_content uuid;
  v_article_id text;
  v_expected integer;
  v_existing public.kd_shared_articles%rowtype;
  v_publication uuid;
  v_share_token uuid;
  v_revision integer;
  v_ref jsonb;
  v_resolved jsonb;
  v_resolved_refs jsonb:='[]'::jsonb;
  v_reference_results jsonb:='[]'::jsonb;
  v_decisions jsonb:='[]'::jsonb;
  v_reference_id uuid;
  v_input_hash text;
  v_old public.kd_blog_publication_references%rowtype;
  v_sources jsonb;
  v_fingerprint text;
  v_prepare jsonb;
  v_response jsonb;
  v_status text;
  v_work text;
begin
  perform public.kd_blog_validate_write_request(p_request,p_action);
  v_account:=public.kd_blog_require_owner();
  v_operation:=(p_request->>'operationId')::uuid;
  v_content:=(p_request->>'contentVersion')::uuid;
  v_article_id:=p_request->>'privateArticleId';
  v_expected:=public.kd_blog_int(p_request->>'expectedPublicRevision');
  v_prepare:=public.kd_blog_operation_prepare(v_account,v_operation,v_article_id,p_action,p_request);
  if v_prepare->>'state' in ('conflict','replay') then return v_prepare->'response'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_account::text||':'||v_article_id,0));

  select * into v_existing from public.kd_shared_articles
   where account_id=v_account and article_id=v_article_id for update;
  if p_action='publish' and v_existing.publication_id is not null then
    v_response:=jsonb_build_object('contractVersion','blog-publication-v1','outcome','conflict',
      'operationId',v_operation,'contentVersion',v_content,'publication',jsonb_build_object(
        'publicationId',v_existing.publication_id,'shareToken',v_existing.share_token,
        'publicRevision',v_existing.public_revision,
        'publishedContentVersion',v_existing.published_content_version,'updatedAt',v_existing.updated_at),
      'referenceResults','[]'::jsonb,'decisionRequests','[]'::jsonb,'errorCode','PUBLICATION_EXISTS');
    perform public.kd_blog_operation_finish(v_account,v_operation,'not_applied',v_response,'PUBLICATION_EXISTS');
    return v_response;
  end if;
  if p_action='update' and v_existing.publication_id is null then
    v_response:=jsonb_build_object('contractVersion','blog-publication-v1','outcome','conflict',
      'operationId',v_operation,'contentVersion',v_content,'publication',null,
      'referenceResults','[]'::jsonb,'decisionRequests','[]'::jsonb,'errorCode','PUBLICATION_ABSENT');
    perform public.kd_blog_operation_finish(v_account,v_operation,'not_applied',v_response,'PUBLICATION_ABSENT');
    return v_response;
  end if;
  if p_action='update' and v_existing.public_revision<>v_expected then
    v_response:=jsonb_build_object('contractVersion','blog-publication-v1','outcome','conflict',
      'operationId',v_operation,'contentVersion',v_content,'publication',jsonb_build_object(
        'publicationId',v_existing.publication_id,'shareToken',v_existing.share_token,
        'publicRevision',v_existing.public_revision,
        'publishedContentVersion',v_existing.published_content_version,'updatedAt',v_existing.updated_at),
      'referenceResults','[]'::jsonb,'decisionRequests','[]'::jsonb,
      'expectedPublicRevision',v_expected,'actualPublicRevision',v_existing.public_revision,
      'errorCode','PUBLIC_REVISION_CONFLICT');
    perform public.kd_blog_operation_finish(v_account,v_operation,'not_applied',v_response,'PUBLIC_REVISION_CONFLICT');
    return v_response;
  end if;

  v_publication:=coalesce(v_existing.publication_id,gen_random_uuid());
  for v_ref in select value from jsonb_array_elements(p_request->'article'->'references') order by (value->>'rank')::integer
  loop
    v_input_hash:=md5((v_ref-'rank')::text);
    select * into v_old from public.kd_blog_publication_references
     where publication_id=v_publication and private_row_id=v_ref->>'rowId';
    if v_old.publication_id is not null and v_old.input_hash=v_input_hash and v_old.resolution_status='matched' then
      v_sources:=public.kd_blog_source_envelope(v_old.work_key);
      v_resolved:=jsonb_build_object('resolution',jsonb_build_object('status','matched','workKey',v_old.work_key),
        'sources',v_sources,'sourceFingerprint',public.kd_blog_source_fingerprint(v_sources),
        'decisionCandidates','[]'::jsonb);
    elsif v_old.publication_id is not null and v_old.input_hash=v_input_hash then
      v_sources:=public.kd_blog_source_envelope(null);
      v_fingerprint:=public.kd_blog_source_fingerprint(v_sources);
      if v_fingerprint=v_old.source_fingerprint then
        v_resolved:=jsonb_build_object('resolution',jsonb_build_object(
            'status',v_old.resolution_status,'workKey',v_old.work_key),
          'sources',v_old.sources,'sourceFingerprint',v_old.source_fingerprint,
          'decisionCandidates','[]'::jsonb);
      else
        v_resolved:=public.kd_blog_resolve_reference(v_ref);
      end if;
    else
      v_resolved:=public.kd_blog_resolve_reference(v_ref);
    end if;
    v_reference_id:=coalesce(v_old.reference_id,gen_random_uuid());
    v_resolved_refs:=v_resolved_refs||jsonb_build_array(jsonb_build_object(
      'input',v_ref,'inputHash',v_input_hash,'referenceId',v_reference_id,'resolved',v_resolved));
    if v_resolved->'resolution'->>'status'='ambiguous' then
      v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object(
        'rowId',v_ref->>'rowId','candidates',v_resolved->'decisionCandidates'));
    end if;
  end loop;

  if jsonb_array_length(v_decisions)>0 then
    v_response:=jsonb_build_object('contractVersion','blog-publication-v1','outcome','decision_required',
      'operationId',v_operation,'contentVersion',v_content,'publication',null,
      'referenceResults','[]'::jsonb,'decisionRequests',v_decisions,'errorCode','DECISION_REQUIRED');
    perform public.kd_blog_operation_finish(v_account,v_operation,'not_applied',v_response,'DECISION_REQUIRED');
    return v_response;
  end if;

  if p_action='publish' then
    insert into public.kd_shared_articles(publication_id,account_id,article_id,author,payload,
      contract_version,public_revision,published_content_version)
    values(v_publication,v_account,v_article_id,'Ohne Namensangabe',jsonb_build_object(
      'contractVersion','blog-publication-v1','title',p_request->'article'->>'title',
      'titel',p_request->'article'->>'title','text',p_request->'article'->>'text',
      'ordered',(p_request->'article'->>'ordered')::boolean,
      'geordnet',(p_request->'article'->>'ordered')::boolean),
      'blog-publication-v1',1,v_content)
    returning share_token,public_revision into v_share_token,v_revision;
  else
    update public.kd_shared_articles set
      author='Ohne Namensangabe',payload=jsonb_build_object(
        'contractVersion','blog-publication-v1','title',p_request->'article'->>'title',
        'titel',p_request->'article'->>'title','text',p_request->'article'->>'text',
        'ordered',(p_request->'article'->>'ordered')::boolean,
        'geordnet',(p_request->'article'->>'ordered')::boolean),
      contract_version='blog-publication-v1',public_revision=public_revision+1,
      published_content_version=v_content
    where publication_id=v_publication and account_id=v_account
    returning share_token,public_revision into v_share_token,v_revision;
  end if;

  delete from public.kd_blog_publication_references where publication_id=v_publication;
  for v_ref in select value from jsonb_array_elements(v_resolved_refs)
  loop
    v_resolved:=v_ref->'resolved';
    v_sources:=v_resolved->'sources';
    v_fingerprint:=v_resolved->>'sourceFingerprint';
    v_status:=v_resolved->'resolution'->>'status';
    v_work:=v_resolved->'resolution'->>'workKey';
    insert into public.kd_blog_publication_references(publication_id,private_row_id,reference_id,
      content_version,rank,title,release_year,media_type,resolution_input,input_hash,resolution_status,work_key,
      sources,source_fingerprint)
    values(v_publication,v_ref->'input'->>'rowId',(v_ref->>'referenceId')::uuid,v_content,
      (v_ref->'input'->>'rank')::integer,v_ref->'input'->>'title',
      coalesce(public.kd_blog_int(v_ref->'input'->>'year'),
        (select w.release_year from public.kd_blog_catalog_works() w where w.work_key=v_work)),
      v_ref->'input'->>'mediaType',v_ref->'input',
      v_ref->>'inputHash',v_status,v_work,v_sources,v_fingerprint);
    if v_status='matched' then
      insert into public.kd_blog_work_sources(work_key,sources,source_fingerprint)
      values(v_work,v_sources,v_fingerprint)
      on conflict(work_key) do update set sources=excluded.sources,
        source_fingerprint=excluded.source_fingerprint,updated_at=now();
    end if;
    v_reference_results:=v_reference_results||jsonb_build_array(jsonb_build_object(
      'rowId',v_ref->'input'->>'rowId','referenceId',v_ref->>'referenceId',
      'resolutionStatus',v_status,'workKey',v_work));
  end loop;

  select updated_at into v_existing.updated_at from public.kd_shared_articles where publication_id=v_publication;
  v_response:=jsonb_build_object('contractVersion','blog-publication-v1',
    'outcome',case when p_action='publish' then 'published' else 'updated' end,
    'operationId',v_operation,'contentVersion',v_content,
    'publication',jsonb_build_object('publicationId',v_publication,'shareToken',v_share_token,
      'publicRevision',v_revision,'publishedContentVersion',v_content,'updatedAt',v_existing.updated_at),
    'referenceResults',v_reference_results,'decisionRequests','[]'::jsonb,'errorCode',null);
  perform public.kd_blog_operation_finish(v_account,v_operation,'applied',v_response,null);
  return v_response;
end
$$;

create or replace function public.kd_publish_blog_v1(p_request jsonb) returns jsonb
language sql volatile security definer set search_path = pg_catalog, public as $$
  select public.kd_blog_apply_publication(p_request,'publish')
$$;

create or replace function public.kd_update_blog_publication_v1(p_request jsonb) returns jsonb
language sql volatile security definer set search_path = pg_catalog, public as $$
  select public.kd_blog_apply_publication(p_request,'update')
$$;

create or replace function public.kd_blog_public_article(p_publication uuid) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_shared public.kd_shared_articles%rowtype;
  v_refs jsonb;
begin
  select * into v_shared from public.kd_shared_articles where publication_id=p_publication;
  if v_shared.publication_id is null then return null; end if;
  if v_shared.contract_version='blog-publication-v1' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'referenceId',r.reference_id,'rank',r.rank,'title',r.title,'year',r.release_year,
      'mediaType',r.media_type,'resolution',jsonb_build_object(
        'status',r.resolution_status,'workKey',r.work_key),
      'sources',coalesce(w.sources,r.sources)) order by r.rank),'[]'::jsonb)
      into v_refs
      from public.kd_blog_publication_references r
      left join public.kd_blog_work_sources w on w.work_key=r.work_key
     where r.publication_id=p_publication;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'referenceId','legacy:'||p_publication::text||':'||x.ord::text,'rank',x.ord,
      'title',coalesce(x.value->>'eingabe',x.value->>'title',x.value->>'titel'),
      'year',public.kd_blog_int(coalesce(x.value->>'jahr',x.value->>'year')),
      'mediaType',public.kd_blog_media_type(coalesce(x.value->>'typ',x.value->>'type')),
      'resolution',jsonb_build_object('status','unchecked','workKey',null),
      'sources',jsonb_build_object('status','unchecked','checkedAt',null,'validUntil',null,
        'streamingRevision',null,'cinemaRevision',null,'streaming','[]'::jsonb,'cinema','[]'::jsonb)
      ) order by x.ord),'[]'::jsonb) into v_refs
    from jsonb_array_elements(case when jsonb_typeof(v_shared.payload->'liste')='array'
      then v_shared.payload->'liste' else '[]'::jsonb end) with ordinality x(value,ord);
  end if;
  return jsonb_build_object('id',v_shared.publication_id,
    'title',coalesce(v_shared.payload->>'title',v_shared.payload->>'titel',''),
    'text',coalesce(v_shared.payload->>'text',''),
    'ordered',coalesce((v_shared.payload->>'ordered')::boolean,
      (v_shared.payload->>'geordnet')::boolean,false),'references',v_refs);
exception when invalid_text_representation then
  return jsonb_build_object('id',v_shared.publication_id,
    'title',coalesce(v_shared.payload->>'title',v_shared.payload->>'titel',''),
    'text',coalesce(v_shared.payload->>'text',''),'ordered',false,'references',coalesce(v_refs,'[]'::jsonb));
end
$$;

create or replace function public.kd_blog_legacy_payload(p_publication uuid) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare v_shared public.kd_shared_articles%rowtype; v_list jsonb;
begin
  select * into v_shared from public.kd_shared_articles where publication_id=p_publication;
  if v_shared.publication_id is null then return null; end if;
  if v_shared.contract_version='blog-publication-v1' then
    select coalesce(jsonb_agg(jsonb_build_object('eingabe',r.title,'jahr',r.release_year,
      'typ',r.media_type) order by r.rank),'[]'::jsonb) into v_list
      from public.kd_blog_publication_references r where r.publication_id=p_publication;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'eingabe',coalesce(x.value->>'eingabe',x.value->>'title',x.value->>'titel'),
      'jahr',public.kd_blog_int(coalesce(x.value->>'jahr',x.value->>'year')),
      'typ',public.kd_blog_media_type(coalesce(x.value->>'typ',x.value->>'type'))) order by x.ord),'[]'::jsonb)
      into v_list from jsonb_array_elements(case when jsonb_typeof(v_shared.payload->'liste')='array'
        then v_shared.payload->'liste' else '[]'::jsonb end) with ordinality x(value,ord);
  end if;
  return jsonb_build_object('id',v_shared.publication_id::text,
    'titel',coalesce(v_shared.payload->>'title',v_shared.payload->>'titel',''),
    'autor','Ohne Namensangabe','text',coalesce(v_shared.payload->>'text',''),
    'geordnet',coalesce((v_shared.payload->>'ordered')::boolean,
      (v_shared.payload->>'geordnet')::boolean,false),
    'erstellt_am',v_shared.published_at,'liste',v_list);
exception when invalid_text_representation then
  return jsonb_build_object('id',v_shared.publication_id::text,
    'titel',coalesce(v_shared.payload->>'title',v_shared.payload->>'titel',''),
    'autor','Ohne Namensangabe','text',coalesce(v_shared.payload->>'text',''),
    'geordnet',false,'erstellt_am',v_shared.published_at,'liste',coalesce(v_list,'[]'::jsonb));
end
$$;

create or replace function public.kd_blog_cursor_decode(p_cursor text) returns jsonb
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_cursor is null then return null; end if;
  return convert_from(decode(p_cursor,'base64'),'UTF8')::jsonb;
exception when others then
  raise exception 'invalid_blog_cursor' using errcode='22023';
end
$$;

create or replace function public.kd_list_shared_articles_v1(p_request jsonb) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer;
  v_cursor jsonb;
  v_snapshot timestamptz;
  v_last_updated timestamptz;
  v_last_id uuid;
  v_items jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_has_more boolean:=false;
  v_row record;
  v_next text;
begin
  perform public.kd_blog_require_owner();
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ?& array['contractVersion','limit','cursor'])
    or p_request-array['contractVersion','limit','cursor']<>'{}'::jsonb
    or p_request->>'contractVersion'<>'blog-publication-v1'
    or jsonb_typeof(p_request->'limit')<>'number'
    or public.kd_blog_int(p_request->>'limit') not between 1 and 50
    or jsonb_typeof(p_request->'cursor') not in ('string','null') then
    raise exception 'invalid_blog_list_request' using errcode='22023';
  end if;
  v_limit:=public.kd_blog_int(p_request->>'limit');
  v_cursor:=public.kd_blog_cursor_decode(p_request->>'cursor');
  if v_cursor is null then
    v_snapshot:=clock_timestamp();
  else
    if v_cursor->>'contractVersion'<>'blog-publication-v1'
      or coalesce(v_cursor->>'snapshotAt','')=''
      or coalesce(v_cursor->>'lastUpdatedAt','')=''
      or coalesce(v_cursor->>'lastPublicationId','') !~* '^[0-9a-f-]{36}$' then
      raise exception 'invalid_blog_cursor' using errcode='22023';
    end if;
    begin
      v_snapshot:=(v_cursor->>'snapshotAt')::timestamptz;
      v_last_updated:=(v_cursor->>'lastUpdatedAt')::timestamptz;
      v_last_id:=(v_cursor->>'lastPublicationId')::uuid;
    exception when others then raise exception 'invalid_blog_cursor' using errcode='22023'; end;
  end if;

  for v_row in
    select s.* from public.kd_shared_articles s
     where s.updated_at<=v_snapshot
       and (v_last_updated is null or (s.updated_at,s.publication_id)<(v_last_updated,v_last_id))
     order by s.updated_at desc,s.publication_id desc limit v_limit+1
  loop
    v_count:=v_count+1;
    if v_count>v_limit then v_has_more:=true; exit; end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'publicationId',v_row.publication_id,'shareToken',v_row.share_token,
      'author','Ohne Namensangabe','publicRevision',v_row.public_revision,
      'contentVersion',coalesce(v_row.published_content_version,v_row.publication_id),
      'publishedAt',v_row.published_at,'updatedAt',v_row.updated_at,
      'article',public.kd_blog_public_article(v_row.publication_id)));
    v_last_updated:=v_row.updated_at; v_last_id:=v_row.publication_id;
  end loop;
  if v_has_more then
    v_next:=replace(encode(convert_to(jsonb_build_object('contractVersion','blog-publication-v1',
      'snapshotAt',v_snapshot,'lastUpdatedAt',v_last_updated,'lastPublicationId',v_last_id)::text,'UTF8'),'base64'),E'\n','');
  end if;
  return jsonb_build_object('contractVersion','blog-publication-v1','snapshotAt',v_snapshot,
    'items',v_items,'nextCursor',v_next,'complete',not v_has_more);
end
$$;

create or replace function public.kd_blog_publication_capabilities() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  perform public.kd_blog_require_owner();
  return jsonb_build_object('contractVersion','blog-publication-v1','enabled',true,
    'anonymousProjection',true,'maxReferences',15,'cursorPagination',true,
    'ownerReadback',true,'legacyProjectionSafe',true,'rpcs',jsonb_build_array(
      'kd_publish_blog_v1','kd_update_blog_publication_v1','kd_withdraw_blog_publication_v1',
      'kd_read_own_blog_publication_v1','kd_list_shared_articles_v1'));
end
$$;

create or replace function public.kd_read_own_blog_publication_v1(p_request jsonb) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_account uuid;
  v_article text;
  v_operation uuid;
  v_shared public.kd_shared_articles%rowtype;
  v_op public.kd_blog_publication_operations%rowtype;
  v_current jsonb;
  v_operation_result jsonb;
begin
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ?& array['contractVersion','privateArticleId'])
    or p_request-array['contractVersion','privateArticleId','operationId']<>'{}'::jsonb
    or p_request->>'contractVersion'<>'blog-publication-v1'
    or char_length(coalesce(p_request->>'privateArticleId','')) not between 1 and 160
    or (p_request ? 'operationId' and jsonb_typeof(p_request->'operationId') not in ('string','null'))
    or (p_request ? 'operationId' and jsonb_typeof(p_request->'operationId')='string'
      and coalesce(p_request->>'operationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'invalid_blog_owner_readback_request' using errcode='22023';
  end if;
  v_account:=public.kd_blog_require_owner();
  v_article:=p_request->>'privateArticleId';
  if nullif(p_request->>'operationId','') is not null then v_operation:=(p_request->>'operationId')::uuid; end if;
  select * into v_shared from public.kd_shared_articles
   where account_id=v_account and article_id=v_article;
  if v_shared.publication_id is not null then
    v_current:=jsonb_build_object('publicationId',v_shared.publication_id,
      'shareToken',v_shared.share_token,'publicRevision',v_shared.public_revision,
      'publishedContentVersion',case when v_shared.contract_version='blog-publication-v1'
        then v_shared.published_content_version else null end,'updatedAt',v_shared.updated_at);
  end if;
  if v_operation is not null then
    select * into v_op from public.kd_blog_publication_operations
     where account_id=v_account and operation_id=v_operation;
    if v_op.operation_id is not null then
      if v_op.article_id<>v_article or v_op.conflict_detected then
        v_operation_result:=jsonb_build_object('operationId',v_operation,'action',v_op.action,
          'status','conflict','result',null,'errorCode','OPERATION_ID_CONFLICT');
      else
        v_operation_result:=jsonb_build_object('operationId',v_operation,'action',v_op.action,
          'status',v_op.status,'result',case when v_op.status='applied' then v_op.response else null end,
          'errorCode',v_op.error_code);
      end if;
    end if;
  end if;
  return jsonb_build_object('contractVersion','blog-publication-v1','privateArticleId',v_article,
    'currentPublication',v_current,'operation',v_operation_result,
    'legacyReloadRequired',coalesce(v_shared.publication_id is not null
      and v_shared.contract_version is distinct from 'blog-publication-v1',false));
end
$$;

create or replace function public.kd_withdraw_blog_publication_v1(p_request jsonb) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_account uuid;
  v_article text;
  v_operation uuid;
  v_expected integer;
  v_prepare jsonb;
  v_shared public.kd_shared_articles%rowtype;
  v_response jsonb;
begin
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ?& array['contractVersion','operationId','privateArticleId','expectedPublicRevision'])
    or p_request-array['contractVersion','operationId','privateArticleId','expectedPublicRevision']<>'{}'::jsonb
    or p_request->>'contractVersion'<>'blog-publication-v1'
    or coalesce(p_request->>'operationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or char_length(coalesce(p_request->>'privateArticleId','')) not between 1 and 160
    or jsonb_typeof(p_request->'expectedPublicRevision')<>'number'
    or public.kd_blog_int(p_request->>'expectedPublicRevision')<1 then
    raise exception 'invalid_blog_withdraw_request' using errcode='22023';
  end if;
  v_account:=public.kd_blog_require_owner(); v_article:=p_request->>'privateArticleId';
  v_operation:=(p_request->>'operationId')::uuid;
  v_expected:=public.kd_blog_int(p_request->>'expectedPublicRevision');
  v_prepare:=public.kd_blog_operation_prepare(v_account,v_operation,v_article,'withdraw',p_request);
  if v_prepare->>'state' in ('conflict','replay') then return v_prepare->'response'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_account::text||':'||v_article,0));
  select * into v_shared from public.kd_shared_articles
   where account_id=v_account and article_id=v_article for update;
  if v_shared.publication_id is null then
    v_response:=jsonb_build_object('contractVersion','blog-publication-v1','outcome','absent',
      'operationId',v_operation,'publicationId',null,'errorCode',null);
    perform public.kd_blog_operation_finish(v_account,v_operation,'applied',v_response,null);
    return v_response;
  end if;
  if v_shared.public_revision<>v_expected then
    v_response:=jsonb_build_object('contractVersion','blog-publication-v1','outcome','conflict',
      'operationId',v_operation,'publicationId',v_shared.publication_id,
      'expectedPublicRevision',v_expected,'actualPublicRevision',v_shared.public_revision,
      'errorCode','PUBLIC_REVISION_CONFLICT');
    perform public.kd_blog_operation_finish(v_account,v_operation,'not_applied',v_response,'PUBLIC_REVISION_CONFLICT');
    return v_response;
  end if;
  delete from public.kd_shared_articles where publication_id=v_shared.publication_id and account_id=v_account;
  v_response:=jsonb_build_object('contractVersion','blog-publication-v1','outcome','withdrawn',
    'operationId',v_operation,'publicationId',v_shared.publication_id,'errorCode',null);
  perform public.kd_blog_operation_finish(v_account,v_operation,'applied',v_response,null);
  return v_response;
end
$$;

drop function if exists public.kd_list_shared_articles();
create function public.kd_list_shared_articles()
returns table(publication_id uuid,share_token uuid,article_id text,author text,payload jsonb,updated_at timestamptz)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.kd_blog_require_owner();
  return query select s.publication_id,s.share_token,s.publication_id::text,'Ohne Namensangabe'::text,
    public.kd_blog_legacy_payload(s.publication_id),s.updated_at
  from public.kd_shared_articles s order by s.updated_at desc,s.publication_id desc;
end
$$;

create or replace function public.kd_claim_shared_article(p_share_token uuid)
returns table(publication_id uuid,share_token uuid,article_id text,author text,payload jsonb,
  updated_at timestamptz,claimed boolean)
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare v_account uuid:=auth.uid(); v_claimed boolean:=false;
begin
  if v_account is null then raise exception 'authenticated account required' using errcode='42501'; end if;
  if not public.kd_account_active() then raise exception 'account_inactive' using errcode='42501'; end if;
  if p_share_token is null then raise exception 'share token required' using errcode='22023'; end if;
  insert into public.kd_shared_article_claims(account_id,share_token)
    select v_account,s.share_token from public.kd_shared_articles s where s.share_token=p_share_token
    on conflict on constraint kd_shared_article_claims_pkey do nothing returning true into v_claimed;
  return query select s.publication_id,s.share_token,s.publication_id::text,
    'Ohne Namensangabe'::text,public.kd_blog_legacy_payload(s.publication_id),s.updated_at,
    coalesce(v_claimed,false) from public.kd_shared_articles s where s.share_token=p_share_token;
end
$$;

create or replace function public.kd_blog_mark_reference_refresh_dirty(p_source text)
returns bigint
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare v_generation bigint;
begin
  update public.kd_blog_reference_refresh_state
     set requested_generation=requested_generation+1,
         scan_cursor=null,scan_complete=false,last_source_event=left(p_source,160),updated_at=clock_timestamp()
   where singleton returning requested_generation into v_generation;
  return v_generation;
end
$$;

create or replace function public.kd_blog_reference_source_changed()
returns trigger
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare v_changed boolean:=false;
begin
  if tg_table_name='kd_streaming_page_state' then
    v_changed:=tg_op<>'UPDATE' or old.source_revision is distinct from new.source_revision
      or old.generated_at is distinct from new.generated_at or old.meta is distinct from new.meta;
  elsif tg_table_name='kd_catalog' then
    if tg_op='INSERT' then
      v_changed:=new.name='programm';
    elsif tg_op='DELETE' then
      v_changed:=old.name='programm';
    else
      v_changed:=(old.name='programm' or new.name='programm') and (
        old.name is distinct from new.name or old.payload is distinct from new.payload
        or old.sha256 is distinct from new.sha256 or old.updated_at is distinct from new.updated_at
        or old.stand is distinct from new.stand or old.gueltig_bis is distinct from new.gueltig_bis);
    end if;
  end if;
  if v_changed then
    perform public.kd_blog_mark_reference_refresh_dirty(tg_table_name||':'||lower(tg_op));
  end if;
  return coalesce(new,old);
end
$$;

drop trigger if exists kd_blog_streaming_reference_dirty on public.kd_streaming_page_state;
create trigger kd_blog_streaming_reference_dirty
after insert or update or delete on public.kd_streaming_page_state
for each row execute function public.kd_blog_reference_source_changed();

drop trigger if exists kd_blog_program_reference_dirty on public.kd_catalog;
create trigger kd_blog_program_reference_dirty
after insert or update or delete on public.kd_catalog
for each row execute function public.kd_blog_reference_source_changed();

create or replace function public.kd_run_blog_reference_refresh_batch(p_limit integer default 50)
returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_state public.kd_blog_reference_refresh_state%rowtype;
  v_unit record;
  v_queue public.kd_blog_reference_refresh_queue%rowtype;
  v_refrow public.kd_blog_publication_references%rowtype;
  v_resolved jsonb;
  v_status text;
  v_work_key text;
  v_sources jsonb;
  v_fingerprint text;
  v_old_fingerprint text;
  v_last_key text;
  v_error text;
  v_enqueued integer:=0;
  v_scanned integer:=0;
  v_updated integer:=0;
  v_unchanged integer:=0;
  v_errors integer:=0;
  v_pending integer:=0;
begin
  if p_limit not between 1 and 500 then
    raise exception 'invalid_blog_refresh_limit' using errcode='22023';
  end if;

  select * into v_state from public.kd_blog_reference_refresh_state where singleton for update;
  if not v_state.scan_complete then
    for v_unit in
      with units as (
        select 'work:'||r.work_key as unit_key,'work'::text as unit_kind,
          r.work_key,null::uuid as reference_id
        from public.kd_blog_publication_references r
        join public.kd_shared_articles s on s.publication_id=r.publication_id
        where r.work_key is not null and r.content_version=s.published_content_version
        group by r.work_key
        union all
        select 'reference:'||r.reference_id::text,'reference'::text,null::text,r.reference_id
        from public.kd_blog_publication_references r
        join public.kd_shared_articles s on s.publication_id=r.publication_id
        where r.work_key is null and r.content_version=s.published_content_version
      )
      select * from units where unit_key>coalesce(v_state.scan_cursor,'')
      order by unit_key limit p_limit
    loop
      insert into public.kd_blog_reference_refresh_queue(
        unit_key,unit_kind,work_key,reference_id,target_generation)
      values(v_unit.unit_key,v_unit.unit_kind,v_unit.work_key,v_unit.reference_id,
        v_state.requested_generation)
      on conflict(unit_key) do update set
        unit_kind=excluded.unit_kind,work_key=excluded.work_key,reference_id=excluded.reference_id,
        target_generation=excluded.target_generation,
        attempt_count=case when public.kd_blog_reference_refresh_queue.target_generation
          < excluded.target_generation then 0 else public.kd_blog_reference_refresh_queue.attempt_count end,
        available_at=case when public.kd_blog_reference_refresh_queue.target_generation
          < excluded.target_generation then now() else public.kd_blog_reference_refresh_queue.available_at end,
        last_error=case when public.kd_blog_reference_refresh_queue.target_generation
          < excluded.target_generation then null else public.kd_blog_reference_refresh_queue.last_error end;
      v_enqueued:=v_enqueued+1;
      v_last_key:=v_unit.unit_key;
    end loop;
    update public.kd_blog_reference_refresh_state set
      scan_cursor=coalesce(v_last_key,scan_cursor),scan_complete=(v_enqueued<p_limit),updated_at=clock_timestamp()
    where singleton;
    v_state.scan_complete:=(v_enqueued<p_limit);
  end if;

  for v_queue in
    select * from public.kd_blog_reference_refresh_queue
    where target_generation<=v_state.requested_generation and available_at<=now()
    order by available_at,enqueued_at,unit_key limit p_limit for update skip locked
  loop
    v_scanned:=v_scanned+1;
    begin
      if v_queue.unit_kind='work' then
        if not exists (
          select 1 from public.kd_blog_publication_references r
          join public.kd_shared_articles s on s.publication_id=r.publication_id
          where r.work_key=v_queue.work_key and r.content_version=s.published_content_version
        ) then
          v_unchanged:=v_unchanged+1;
        else
          select source_fingerprint into v_old_fingerprint
          from public.kd_blog_work_sources where work_key=v_queue.work_key;
          v_sources:=public.kd_blog_source_envelope(v_queue.work_key);
          v_fingerprint:=public.kd_blog_source_fingerprint(v_sources);
          if v_fingerprint is not distinct from v_old_fingerprint then
            v_unchanged:=v_unchanged+1;
          else
            insert into public.kd_blog_work_sources(work_key,sources,source_fingerprint)
            values(v_queue.work_key,v_sources,v_fingerprint)
            on conflict(work_key) do update set sources=excluded.sources,
              source_fingerprint=excluded.source_fingerprint,updated_at=now();
            v_updated:=v_updated+1;
          end if;
        end if;
      else
        v_refrow:=null;
        select r.* into v_refrow from public.kd_blog_publication_references r
        join public.kd_shared_articles s on s.publication_id=r.publication_id
        where r.reference_id=v_queue.reference_id and r.content_version=s.published_content_version;
        if v_refrow.reference_id is null then
          v_unchanged:=v_unchanged+1;
        else
          v_resolved:=public.kd_blog_resolve_reference(v_refrow.resolution_input);
          v_sources:=v_resolved->'sources';
          v_fingerprint:=v_resolved->>'sourceFingerprint';
          v_status:=v_resolved->'resolution'->>'status';
          v_work_key:=v_resolved->'resolution'->>'workKey';
          if v_fingerprint is not distinct from v_refrow.source_fingerprint
            and v_status=v_refrow.resolution_status and v_work_key is not distinct from v_refrow.work_key then
            v_unchanged:=v_unchanged+1;
          else
            update public.kd_blog_publication_references set resolution_status=v_status,
              work_key=v_work_key,
              release_year=coalesce(release_year,(select w.release_year
                from public.kd_blog_catalog_works() w where w.work_key=v_work_key)),
              sources=v_sources,source_fingerprint=v_fingerprint,updated_at=now()
            where publication_id=v_refrow.publication_id and reference_id=v_refrow.reference_id
              and content_version=v_refrow.content_version;
            if v_status='matched' then
              insert into public.kd_blog_work_sources(work_key,sources,source_fingerprint)
              values(v_work_key,v_sources,v_fingerprint)
              on conflict(work_key) do update set sources=excluded.sources,
                source_fingerprint=excluded.source_fingerprint,updated_at=now();
            end if;
            v_updated:=v_updated+1;
          end if;
        end if;
      end if;
      delete from public.kd_blog_reference_refresh_queue
      where unit_key=v_queue.unit_key and target_generation=v_queue.target_generation;
    exception when others then
      get stacked diagnostics v_error=message_text;
      update public.kd_blog_reference_refresh_queue set
        attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
        available_at=clock_timestamp()+interval '1 minute'*least(attempt_count+1,60),
        last_error=left(v_error,500)
      where unit_key=v_queue.unit_key;
      v_errors:=v_errors+1;
    end;
  end loop;

  select count(*) into v_pending from public.kd_blog_reference_refresh_queue
  where target_generation<=v_state.requested_generation;
  update public.kd_blog_reference_refresh_state set
    completed_generation=case when scan_complete and v_pending=0 then requested_generation else completed_generation end,
    updated_at=clock_timestamp()
  where singleton;

  return jsonb_build_object('status','completed','generation',v_state.requested_generation,
    'enqueued',v_enqueued,'scanned',v_scanned,'updated',v_updated,
    'unchanged',v_unchanged,'errors',v_errors,'pending',v_pending,
    'scanComplete',v_state.scan_complete,'limit',p_limit);
end
$$;

create or replace function public.kd_refresh_blog_reference_sources_v1(p_request jsonb) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer;
  v_publication uuid;
  v_generation bigint;
  v_result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role required' using errcode='42501'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object'
    or not (p_request ? 'limit')
    or p_request-array['limit','publicationId']<>'{}'::jsonb
    or jsonb_typeof(p_request->'limit')<>'number'
    or public.kd_blog_int(p_request->>'limit') not between 1 and 500
    or (p_request ? 'publicationId' and jsonb_typeof(p_request->'publicationId') not in ('string','null'))
    or (p_request ? 'publicationId' and jsonb_typeof(p_request->'publicationId')='string'
      and coalesce(p_request->>'publicationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'invalid_blog_refresh_request' using errcode='22023';
  end if;
  v_limit:=public.kd_blog_int(p_request->>'limit');
  if nullif(p_request->>'publicationId','') is not null then
    v_publication:=(p_request->>'publicationId')::uuid;
    select requested_generation into v_generation from public.kd_blog_reference_refresh_state where singleton;
    insert into public.kd_blog_reference_refresh_queue(
      unit_key,unit_kind,work_key,reference_id,target_generation)
    select case when r.work_key is null then 'reference:'||r.reference_id::text else 'work:'||r.work_key end,
      case when r.work_key is null then 'reference' else 'work' end,
      r.work_key,case when r.work_key is null then r.reference_id end,v_generation
    from public.kd_blog_publication_references r
    join public.kd_shared_articles s on s.publication_id=r.publication_id
    where r.publication_id=v_publication and r.content_version=s.published_content_version
    on conflict(unit_key) do update set target_generation=excluded.target_generation,
      available_at=least(public.kd_blog_reference_refresh_queue.available_at,now());
  end if;
  v_result:=public.kd_run_blog_reference_refresh_batch(v_limit);
  return v_result||jsonb_build_object('publicationId',v_publication);
end
$$;

select public.kd_blog_mark_reference_refresh_dirty('migration:blog-publication-v1');

do $$
declare v_job bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('cron.unschedule(bigint)') is null then
    raise exception 'blog_reference_refresh_requires_pg_cron';
  end if;
  for v_job in execute 'select jobid from cron.job where jobname=$1'
    using 'kd-blog-reference-refresh-v1'
  loop
    execute 'select cron.unschedule($1)' using v_job;
  end loop;
  execute 'select cron.schedule($1,$2,$3)'
    using 'kd-blog-reference-refresh-v1','*/5 * * * *',
      'select public.kd_run_blog_reference_refresh_batch(50);';
end
$$;

revoke all on function public.kd_blog_title_norm(text),public.kd_blog_media_type(text),
  public.kd_blog_int(text),public.kd_blog_time(text),public.kd_blog_streaming_source_id(text),
  public.kd_blog_catalog_works(),public.kd_blog_source_envelope(text),
  public.kd_blog_source_fingerprint(jsonb),public.kd_blog_resolve_reference(jsonb),
  public.kd_blog_require_owner(),public.kd_blog_validate_write_request(jsonb,text),
  public.kd_blog_operation_prepare(uuid,uuid,text,text,jsonb),
  public.kd_blog_operation_finish(uuid,uuid,text,jsonb,text),
  public.kd_blog_apply_publication(jsonb,text),public.kd_blog_public_article(uuid),
  public.kd_blog_legacy_payload(uuid),public.kd_blog_cursor_decode(text),
  public.kd_blog_mark_reference_refresh_dirty(text),public.kd_blog_reference_source_changed(),
  public.kd_run_blog_reference_refresh_batch(integer)
  from public,anon,authenticated;
revoke all on function public.kd_blog_mark_reference_refresh_dirty(text),
  public.kd_blog_reference_source_changed(),public.kd_run_blog_reference_refresh_batch(integer)
  from service_role;

revoke all on function public.kd_publish_blog_v1(jsonb),
  public.kd_update_blog_publication_v1(jsonb),public.kd_withdraw_blog_publication_v1(jsonb),
  public.kd_read_own_blog_publication_v1(jsonb),public.kd_list_shared_articles_v1(jsonb),
  public.kd_blog_publication_capabilities(),public.kd_refresh_blog_reference_sources_v1(jsonb),
  public.kd_list_shared_articles(),public.kd_claim_shared_article(uuid)
  from public,anon,authenticated;
grant execute on function public.kd_blog_publication_capabilities(),
  public.kd_list_shared_articles_v1(jsonb),public.kd_list_shared_articles()
  to authenticated;
grant execute on function public.kd_publish_blog_v1(jsonb),
  public.kd_update_blog_publication_v1(jsonb),public.kd_withdraw_blog_publication_v1(jsonb),
  public.kd_read_own_blog_publication_v1(jsonb),public.kd_claim_shared_article(uuid)
  to authenticated,service_role;
grant execute on function public.kd_refresh_blog_reference_sources_v1(jsonb) to service_role;

revoke all on table public.kd_shared_articles from public,anon,authenticated;
grant all on table public.kd_shared_articles to service_role;

notify pgrst,'reload schema';
commit;
