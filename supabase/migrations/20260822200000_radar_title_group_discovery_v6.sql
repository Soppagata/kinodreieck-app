-- Kinodreieck · Radar-Titelgruppen-Discovery v6 (additive Forward-Migration)
-- =============================================================================
-- Erlaubt einem explizit freigeschalteten kanonischen Reihenziel, ein bislang
-- unbekanntes Werk zu finden. Die Migration ist absichtlich default-off. Sie
-- veraendert keine historischen Migrationen, aktiviert keine Radar-/Provider-
-- oder Schedulerflags und erzeugt keine Abos oder Receipts.
-- =============================================================================

begin;

create table public.kd_radar_title_group_discovery_contracts (
  target_key          text        primary key,
  group_external_id   text        not null unique,
  canonical_name      text        not null,
  discovery_enabled   boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint kd_radar_title_group_discovery_target_key
    check (target_key ~ '^title-group:v1:[a-z0-9]+(-[a-z0-9]+)+$'),
  constraint kd_radar_title_group_discovery_external_id
    check (group_external_id ~ '^wikidata:Q[1-9][0-9]{0,14}$'),
  constraint kd_radar_title_group_discovery_name
    check (btrim(canonical_name) <> '' and char_length(canonical_name) <= 160)
);

alter table public.kd_radar_title_group_discovery_contracts enable row level security;
revoke all on table public.kd_radar_title_group_discovery_contracts
  from public, anon, authenticated;

insert into public.kd_radar_title_group_discovery_contracts (
  target_key, group_external_id, canonical_name, discovery_enabled
) values (
  'title-group:v1:star-wars', 'wikidata:Q462', 'Star Wars', false
) on conflict (target_key) do nothing;

create table public.kd_radar_title_group_memberships (
  group_target_id       uuid        not null references public.kd_radar_targets(target_id) on delete cascade,
  work_target_id        uuid        not null references public.kd_radar_targets(target_id) on delete cascade,
  group_external_id     text        not null,
  membership_evidence  jsonb       not null,
  evidence_state_hash   text        not null,
  first_confirmed_at    timestamptz not null default now(),
  last_verified_at      timestamptz not null,
  constraint kd_radar_title_group_memberships_pkey
    primary key (group_target_id, work_target_id),
  constraint kd_radar_title_group_membership_external_id
    check (group_external_id ~ '^wikidata:Q[1-9][0-9]{0,14}$'),
  constraint kd_radar_title_group_membership_evidence
    check (case when jsonb_typeof(membership_evidence) = 'array'
      then jsonb_array_length(membership_evidence) between 1 and 2 else false end),
  constraint kd_radar_title_group_membership_hash
    check (evidence_state_hash ~ '^[a-f0-9]{64}$')
);

alter table public.kd_radar_title_group_memberships enable row level security;
revoke all on table public.kd_radar_title_group_memberships
  from public, anon, authenticated;

comment on table public.kd_radar_title_group_discovery_contracts is
  'Default-off Registry fuer exakt kanonisch gebundene Titelgruppen-Websearch.';
comment on table public.kd_radar_title_group_memberships is
  'Separat belegte, idempotente Zugehoerigkeit eines entdeckten Werks zu einer kanonischen Titelgruppe.';

-- v5 erlaubte ausschließlich die bereits verwendeten Watchmode-/Katalog-IDs.
-- v6 erweitert nur die Mitglieds-ID auf starke IMDb-/TMDB-Werk-IDs; Form,
-- Zielbindung, Mitgliederlimit und alle v5-Metadaten bleiben unveraendert.
create or replace function public.kd_radar_title_group_metadata_valid(
  p_target_key text,
  p_canonical_title text,
  p_metadata jsonb
) returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_key_count integer;
  v_ids text[] := array[]::text[];
  v_query_key text := p_metadata ->> 'queryKey';
begin
  if jsonb_typeof(p_metadata) <> 'object' then return false; end if;
  select count(*) into v_key_count from jsonb_object_keys(p_metadata);
  if v_key_count <> 5
     or not (p_metadata ?& array['format','queryVersion','queryKey','displayName','members'])
     or p_metadata ->> 'format' is distinct from 'kd-radar-title-group-v1'
     or p_metadata ->> 'queryVersion' is distinct from 'title-group-query-v1'
     or jsonb_typeof(p_metadata -> 'queryKey') <> 'string'
     or jsonb_typeof(p_metadata -> 'displayName') <> 'string'
     or jsonb_typeof(p_metadata -> 'members') <> 'array'
     or v_query_key !~ '^[a-z0-9]+( [a-z0-9]+)+$'
     or char_length(replace(v_query_key, ' ', '')) < 8
     or char_length(v_query_key) > 100
     or p_target_key is distinct from 'title-group:v1:' || replace(v_query_key, ' ', '-')
     or btrim(p_metadata ->> 'displayName') = ''
     or char_length(p_metadata ->> 'displayName') > 160
     or p_canonical_title is distinct from p_metadata ->> 'displayName'
     or p_canonical_title ~* '^(work|watchmode|fixture|catalog|tmdb|imdb|wikidata):'
     or jsonb_array_length(p_metadata -> 'members') not between 2 and 20 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_metadata -> 'members')
  loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    select count(*) into v_key_count from jsonb_object_keys(v_item);
    if v_key_count <> 4
       or not (v_item ?& array['targetId','targetType','title','year'])
       or jsonb_typeof(v_item -> 'targetId') <> 'string'
       or jsonb_typeof(v_item -> 'targetType') <> 'string'
       or jsonb_typeof(v_item -> 'title') <> 'string'
       or jsonb_typeof(v_item -> 'year') <> 'number'
       or (
         (v_item ->> 'targetId') !~ '^(watchmode|catalog):[^[:space:]]{1,150}$'
         and (v_item ->> 'targetId') !~ '^(imdb:tt[1-9][0-9]{6,10}|tmdb:(movie|tv):[1-9][0-9]{0,11})$'
       )
       or ((v_item ->> 'targetId') ~ '^tmdb:movie:' and (v_item ->> 'targetType') <> 'work')
       or ((v_item ->> 'targetId') ~ '^tmdb:tv:' and (v_item ->> 'targetType') <> 'series')
       or (v_item ->> 'targetType') not in ('work','series')
       or btrim(v_item ->> 'title') = '' or char_length(v_item ->> 'title') > 200
       or (v_item ->> 'title') ~* '^(work|watchmode|fixture|catalog|tmdb|imdb|wikidata):'
       or (v_item ->> 'year') !~ '^[0-9]{4}$'
       or (v_item ->> 'year')::integer not between 1888 and 2100 then
      return false;
    end if;
    v_ids := array_append(v_ids, v_item ->> 'targetId');
  end loop;
  return (select count(distinct item) = cardinality(v_ids) from unnest(v_ids) item);
end
$$;

-- Ein spaeteres Pause-/Resume-Upsert derselben Gruppe darf ein bereits stark
-- belegtes Discovery-Mitglied nicht wieder aus dem serverseitigen Katalog
-- entfernen. Der Trigger fuegt ausschließlich persistierte Mitgliedschaften
-- zurueck und laesst den 20er-Zaun unveraendert fail-closed.
create function public.kd_radar_title_group_preserve_discovered_members()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_members jsonb;
begin
  if new.target_type <> 'franchise' or new.target_key !~ '^title-group:v1:' then
    return new;
  end if;
  if jsonb_typeof(new.external_ids #> '{titleGroup,members}') <> 'array' then
    return new;
  end if;

  with candidates as (
    select member.value as item, 1 as priority
      from jsonb_array_elements(new.external_ids #> '{titleGroup,members}') member(value)
    union all
    select jsonb_build_object(
      'targetId',wt.target_key, 'targetType',wt.target_type,
      'title',wt.canonical_title, 'year',(wt.external_ids ->> 'releaseYear')::integer
    ), 0
      from public.kd_radar_title_group_memberships membership
      join public.kd_radar_targets wt on wt.target_id = membership.work_target_id
     where membership.group_target_id = new.target_id
  ), deduplicated as (
    select distinct on (item ->> 'targetId') item
      from candidates
     order by item ->> 'targetId', priority
  )
  select coalesce(jsonb_agg(item order by item ->> 'targetId'), '[]'::jsonb)
    into v_members from deduplicated;

  if jsonb_array_length(v_members) > 20 then
    raise exception 'radar_title_group_member_limit' using errcode = '23514';
  end if;
  new.external_ids := jsonb_set(new.external_ids, '{titleGroup,members}', v_members, false);
  if not public.kd_radar_title_group_metadata_valid(
    new.target_key, new.canonical_title, new.external_ids -> 'titleGroup'
  ) then
    raise exception 'radar_title_group_discovered_member_drift' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger kd_radar_title_group_preserve_discovered_members
  before update of external_ids on public.kd_radar_targets
  for each row execute function public.kd_radar_title_group_preserve_discovered_members();

create or replace function public.kd_radar_websearch_context(
  p_account_id uuid,
  p_target_key text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_context jsonb;
  v_today date := (current_timestamp at time zone 'Europe/Vienna')::date;
begin
  if p_account_id is null or p_target_key is null or btrim(p_target_key) = '' then
    raise exception 'radar_websearch_context_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.kd_account_access a
    join public.kd_radar_capabilities c on c.account_id = a.account_id
    where a.account_id = p_account_id and a.active and a.personal_ai
      and c.radar_pilot and c.radar_review
  ) then
    raise exception 'radar_websearch_forbidden' using errcode = '42501';
  end if;

  select case
    when t.target_type = 'person' then jsonb_build_object(
      'kind','person', 'targetId',t.target_key,
      'personExternalId',s.person_external_id,
      'canonicalName',t.canonical_title, 'role',s.person_role,
      'region','AT', 'windowStart',v_today::text,
      'windowEnd',(v_today + 6)::text, 'catalog',t.external_ids -> 'catalog'
    )
    when t.target_type = 'franchise' and t.target_key ~ '^title-group:v1:' then
      case when coalesce(discovery.discovery_enabled, false) then jsonb_build_object(
        'kind','title_group', 'targetId',t.target_key,
        'queryVersion','title-group-query-v2',
        'queryKey',t.external_ids #>> '{titleGroup,queryKey}',
        'displayName',t.external_ids #>> '{titleGroup,displayName}',
        'region','AT', 'catalog',t.external_ids #> '{titleGroup,members}',
        'discoveryMode','canonical-group-v1',
        'groupExternalId',discovery.group_external_id,
        'canonicalGroupName',discovery.canonical_name,
        'windowStart',(v_today - 30)::text, 'windowEnd',(v_today + 14)::text
      ) else jsonb_build_object(
        'kind','title_group', 'targetId',t.target_key,
        'queryVersion',t.external_ids #>> '{titleGroup,queryVersion}',
        'queryKey',t.external_ids #>> '{titleGroup,queryKey}',
        'displayName',t.external_ids #>> '{titleGroup,displayName}',
        'region','AT', 'catalog',t.external_ids #> '{titleGroup,members}'
      ) end
    else jsonb_build_object(
      'targetId',t.target_key, 'canonicalTitle',t.canonical_title,
      'mediaType',case t.target_type when 'series' then 'series' else 'film' end,
      'region','AT',
      'scopes',case
        when t.target_type = 'series' then jsonb_build_array('streaming','series_start','season_start')
        when s.scope = 'cinema' then jsonb_build_array('cinema')
        when s.scope = 'streaming' then jsonb_build_array('streaming')
        else jsonb_build_array('cinema','streaming')
      end
    ) end
    into v_context
    from public.kd_radar_subscriptions s
    join public.kd_radar_targets t on t.target_id = s.target_id
    left join public.kd_radar_title_group_discovery_contracts discovery
      on discovery.target_key = t.target_key
     and discovery.canonical_name = t.canonical_title
   where s.account_id = p_account_id
     and s.subscription_status = 'active' and s.region = 'AT'
     and t.target_key = p_target_key
     and t.target_key !~* '^(fixture|synthetic):'
     and t.target_status = 'active'
     and (
       (t.target_type in ('work','series')
        and not (t.target_type = 'series' and s.scope = 'cinema')
        and s.person_external_id is null and s.person_role is null)
       or
       (t.target_type = 'person' and s.scope = 'all'
        and s.person_external_id = t.external_ids ->> 'personExternalId'
        and s.person_role = t.external_ids ->> 'personRole'
        and t.target_key = 'person:' || s.person_external_id || ':' || s.person_role
        and public.kd_radar_person_target_metadata_valid(
          t.target_key, t.canonical_title, t.external_ids
        ))
       or
       (t.target_type = 'franchise' and s.scope = 'all'
        and s.person_external_id is null and s.person_role is null
        and t.target_key ~ '^title-group:v1:'
        and public.kd_radar_title_group_metadata_valid(
          t.target_key, t.canonical_title, t.external_ids -> 'titleGroup'
        ))
     );
  if v_context is null then
    raise exception 'radar_websearch_target_unavailable' using errcode = '42501';
  end if;
  return v_context;
end
$$;

create function public.kd_radar_websearch_upsert_title_group_discovery_event(
  p_account_id uuid,
  p_operation_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_root_key_count integer;
  v_group_target_key text := p_payload ->> 'titleGroupTargetKey';
  v_target_key text := p_payload ->> 'targetKey';
  v_work_target_type text := p_payload ->> 'workTargetType';
  v_work_title text := p_payload ->> 'workTitle';
  v_work_year integer;
  v_group_external_id text := p_payload ->> 'groupExternalId';
  v_checked_at timestamptz;
  v_event_date date;
  v_window_start date;
  v_window_end date;
  v_group_target_id uuid;
  v_work_target_id uuid;
  v_members jsonb;
  v_known_member boolean := false;
  v_evidence_item jsonb;
  v_evidence_count integer;
  v_evidence_key_count integer;
  v_retrieved_at timestamptz;
  v_source_domain text;
  v_source_family text;
  v_source_class text;
  v_subdomains_allowed boolean;
  v_source_host text;
  v_source_ids text[] := array[]::text[];
  v_source_urls text[] := array[]::text[];
  v_source_families text[] := array[]::text[];
  v_official_count integer := 0;
  v_evidence_basis text;
  v_evidence_hash text;
  v_event_source_basis text;
  v_event_source_hash text;
  v_event_type text := p_payload ->> 'eventType';
  v_platform text := p_payload ->> 'platform';
  v_season_number integer;
  v_event_key text;
  v_event_id uuid;
  v_current_version_id uuid;
  v_event_version_id uuid := gen_random_uuid();
  v_current_date date;
  v_current_source_hash text;
  v_publisher_family text;
  v_persisted_source_class text;
  v_request_hash text;
  v_previous_hash text;
  v_previous_result jsonb;
  v_core_result jsonb;
  v_result jsonb;
begin
  if p_account_id is null or p_operation_id is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'radar_title_group_discovery_upsert_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.kd_account_access a
    join public.kd_radar_capabilities c on c.account_id = a.account_id
    where a.account_id = p_account_id and a.active and a.personal_ai
      and c.radar_pilot and c.radar_review
  ) then
    raise exception 'radar_websearch_forbidden' using errcode = '42501';
  end if;

  select count(*) into v_root_key_count from jsonb_object_keys(p_payload);
  if v_root_key_count <> 21
     or not (p_payload ?& array[
       'targetKey','eventType','date','region','platform','seasonNumber','evidence',
       'titleGroupTargetKey','queryVersion','queryKey','displayName',
       'workTargetType','workTitle','workYear','checkedAt',
       'discoveryMode','groupExternalId','canonicalGroupName',
       'windowStart','windowEnd','membershipEvidence'
     ])
     or jsonb_typeof(p_payload -> 'evidence') <> 'array'
     or jsonb_typeof(p_payload -> 'membershipEvidence') <> 'array'
     or jsonb_typeof(p_payload -> 'targetKey') <> 'string'
     or jsonb_typeof(p_payload -> 'eventType') <> 'string'
     or jsonb_typeof(p_payload -> 'date') <> 'string'
     or jsonb_typeof(p_payload -> 'region') <> 'string'
     or jsonb_typeof(p_payload -> 'platform') <> 'string'
     or jsonb_typeof(p_payload -> 'titleGroupTargetKey') <> 'string'
     or jsonb_typeof(p_payload -> 'queryVersion') <> 'string'
     or jsonb_typeof(p_payload -> 'queryKey') <> 'string'
     or jsonb_typeof(p_payload -> 'displayName') <> 'string'
     or jsonb_typeof(p_payload -> 'workTargetType') <> 'string'
     or jsonb_typeof(p_payload -> 'workTitle') <> 'string'
     or jsonb_typeof(p_payload -> 'workYear') <> 'number'
     or jsonb_typeof(p_payload -> 'checkedAt') <> 'string'
     or jsonb_typeof(p_payload -> 'discoveryMode') <> 'string'
     or jsonb_typeof(p_payload -> 'groupExternalId') <> 'string'
     or jsonb_typeof(p_payload -> 'canonicalGroupName') <> 'string'
     or jsonb_typeof(p_payload -> 'windowStart') <> 'string'
     or jsonb_typeof(p_payload -> 'windowEnd') <> 'string' then
    raise exception 'radar_title_group_discovery_payload_invalid' using errcode = '22023';
  end if;
  if (p_payload ->> 'workYear') !~ '^[0-9]{4}$'
     or (p_payload ->> 'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or (p_payload ->> 'windowStart') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or (p_payload ->> 'windowEnd') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or (p_payload ->> 'checkedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$' then
    raise exception 'radar_title_group_discovery_time_invalid' using errcode = '22023';
  end if;

  v_work_year := (p_payload ->> 'workYear')::integer;
  v_event_date := (p_payload ->> 'date')::date;
  v_window_start := (p_payload ->> 'windowStart')::date;
  v_window_end := (p_payload ->> 'windowEnd')::date;
  v_checked_at := (p_payload ->> 'checkedAt')::timestamptz;
  if not isfinite(v_checked_at)
     or to_char(v_event_date,'YYYY-MM-DD') <> p_payload ->> 'date'
     or to_char(v_window_start,'YYYY-MM-DD') <> p_payload ->> 'windowStart'
     or to_char(v_window_end,'YYYY-MM-DD') <> p_payload ->> 'windowEnd'
     or v_window_end - v_window_start <> 44
     or v_event_date not between v_window_start and v_window_end
     or v_work_year not between 1888 and 2100
     or v_work_target_type not in ('work','series')
     or v_event_type not in ('kinostart_at','streamingstart_at','serienstart','staffelstart')
     or p_payload ->> 'region' is distinct from 'AT'
     or (v_work_target_type = 'work' and v_event_type in ('serienstart','staffelstart'))
     or (v_work_target_type = 'series' and v_event_type = 'kinostart_at')
     or p_payload ->> 'queryVersion' is distinct from 'title-group-query-v2'
     or p_payload ->> 'discoveryMode' is distinct from 'canonical-group-v1'
     or v_group_external_id !~ '^wikidata:Q[1-9][0-9]{0,14}$'
     or p_payload ->> 'displayName' is distinct from p_payload ->> 'canonicalGroupName'
     or v_group_target_key is distinct from 'title-group:v1:' || replace(p_payload ->> 'queryKey',' ','-')
     or btrim(v_work_title) = '' or char_length(v_work_title) > 200
     or v_work_title ~* '^(work|watchmode|fixture|catalog|tmdb|imdb|wikidata):' then
    raise exception 'radar_title_group_discovery_contract_invalid' using errcode = '22023';
  end if;
  if v_event_type = 'streamingstart_at' then
    if btrim(v_platform) = '' or v_platform = '-' or char_length(v_platform) > 80 then
      raise exception 'radar_title_group_discovery_platform_invalid' using errcode = '22023';
    end if;
  elsif v_platform is distinct from '-' then
    raise exception 'radar_title_group_discovery_platform_invalid' using errcode = '22023';
  end if;
  if v_event_type = 'staffelstart' then
    if jsonb_typeof(p_payload -> 'seasonNumber') <> 'number'
       or (p_payload ->> 'seasonNumber') !~ '^[0-9]+$' then
      raise exception 'radar_title_group_discovery_season_invalid' using errcode = '22023';
    end if;
    v_season_number := (p_payload ->> 'seasonNumber')::integer;
    if v_season_number not between 1 and 999 then
      raise exception 'radar_title_group_discovery_season_invalid' using errcode = '22023';
    end if;
  elsif jsonb_typeof(p_payload -> 'seasonNumber') <> 'null' then
    raise exception 'radar_title_group_discovery_season_invalid' using errcode = '22023';
  end if;

  v_evidence_count := jsonb_array_length(p_payload -> 'membershipEvidence');
  if v_evidence_count not between 1 and 2 then
    raise exception 'radar_title_group_membership_evidence_invalid' using errcode = '22023';
  end if;
  for v_evidence_item in select value from jsonb_array_elements(p_payload -> 'membershipEvidence')
  loop
    if jsonb_typeof(v_evidence_item) <> 'object' then
      raise exception 'radar_title_group_membership_evidence_invalid' using errcode = '22023';
    end if;
    select count(*) into v_evidence_key_count from jsonb_object_keys(v_evidence_item);
    if v_evidence_key_count <> 3
       or not (v_evidence_item ?& array['sourceId','url','retrievedAt'])
       or jsonb_typeof(v_evidence_item -> 'sourceId') <> 'string'
       or jsonb_typeof(v_evidence_item -> 'url') <> 'string'
       or jsonb_typeof(v_evidence_item -> 'retrievedAt') <> 'string'
       or (v_evidence_item ->> 'url') !~ '^https://[^[:space:]#]+$' then
      raise exception 'radar_title_group_membership_evidence_invalid' using errcode = '22023';
    end if;
    v_retrieved_at := (v_evidence_item ->> 'retrievedAt')::timestamptz;
    if not isfinite(v_retrieved_at) or v_retrieved_at > v_checked_at then
      raise exception 'radar_title_group_membership_evidence_time_invalid' using errcode = '23514';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_payload -> 'evidence') event_evidence(value)
       where event_evidence.value ->> 'url' = v_evidence_item ->> 'url'
    ) then
      raise exception 'radar_title_group_membership_evidence_not_separate' using errcode = '23514';
    end if;

    select source.domain,source.publisher_family,source.source_class,source.subdomains_allowed
      into v_source_domain,v_source_family,v_source_class,v_subdomains_allowed
      from public.kd_radar_sources source
     where source.source_id = v_evidence_item ->> 'sourceId'
       and source.active and source.rights_status = 'approved'
       and source.attribution_approved and source.source_class in ('official','editorial')
     for key share;
    if not found then
      raise exception 'radar_title_group_membership_source_unavailable' using errcode = '23514';
    end if;
    v_source_host := lower(substring(v_evidence_item ->> 'url' from '^https://([^/?#]+)'));
    if v_source_host is null
       or not (v_source_host = v_source_domain
         or (v_subdomains_allowed and right(v_source_host,char_length(v_source_domain) + 1) = '.' || v_source_domain)) then
      raise exception 'radar_title_group_membership_source_mismatch' using errcode = '23514';
    end if;
    v_source_ids := array_append(v_source_ids,v_evidence_item ->> 'sourceId');
    v_source_urls := array_append(v_source_urls,v_evidence_item ->> 'url');
    v_source_families := array_append(v_source_families,v_source_family);
    if v_source_class = 'official' then v_official_count := v_official_count + 1; end if;
  end loop;
  if (select count(distinct item) from unnest(v_source_ids) item) <> v_evidence_count
     or (select count(distinct item) from unnest(v_source_urls) item) <> v_evidence_count
     or (v_official_count = 0
       and (select count(distinct item) from unnest(v_source_families) item) < 2) then
    raise exception 'radar_title_group_membership_sources_insufficient' using errcode = '23514';
  end if;

  select string_agg(
    (item.value ->> 'sourceId') || '|' || (item.value ->> 'url'),
    '|' order by item.value ->> 'sourceId',item.value ->> 'url'
  ) into v_evidence_basis
    from jsonb_array_elements(p_payload -> 'membershipEvidence') item(value);
  v_evidence_hash := md5(v_evidence_basis)
    || md5('radar-title-group-membership-v1|' || v_evidence_basis);

  -- Termin-/Verfuegbarkeitsevidenz bleibt ein eigener, ebenso strenger
  -- Belegsatz. Kein Membership-Beleg wird als Datumsbeleg wiederverwendet.
  v_source_ids := array[]::text[];
  v_source_urls := array[]::text[];
  v_source_families := array[]::text[];
  v_official_count := 0;
  v_evidence_count := jsonb_array_length(p_payload -> 'evidence');
  if v_evidence_count not between 1 and 2 then
    raise exception 'radar_title_group_event_evidence_invalid' using errcode = '22023';
  end if;
  for v_evidence_item in select value from jsonb_array_elements(p_payload -> 'evidence')
  loop
    if jsonb_typeof(v_evidence_item) <> 'object' then
      raise exception 'radar_title_group_event_evidence_invalid' using errcode = '22023';
    end if;
    select count(*) into v_evidence_key_count from jsonb_object_keys(v_evidence_item);
    if v_evidence_key_count <> 3
       or not (v_evidence_item ?& array['sourceId','url','retrievedAt'])
       or jsonb_typeof(v_evidence_item -> 'sourceId') <> 'string'
       or jsonb_typeof(v_evidence_item -> 'url') <> 'string'
       or jsonb_typeof(v_evidence_item -> 'retrievedAt') <> 'string'
       or (v_evidence_item ->> 'url') !~ '^https://[^[:space:]#]+$' then
      raise exception 'radar_title_group_event_evidence_invalid' using errcode = '22023';
    end if;
    v_retrieved_at := (v_evidence_item ->> 'retrievedAt')::timestamptz;
    if not isfinite(v_retrieved_at) or v_retrieved_at > v_checked_at then
      raise exception 'radar_title_group_event_evidence_time_invalid' using errcode = '23514';
    end if;

    select source.domain,source.publisher_family,source.source_class,source.subdomains_allowed
      into v_source_domain,v_source_family,v_source_class,v_subdomains_allowed
      from public.kd_radar_sources source
     where source.source_id = v_evidence_item ->> 'sourceId'
       and source.active and source.rights_status = 'approved'
       and source.attribution_approved and source.source_class in ('official','editorial')
     for key share;
    if not found then
      raise exception 'radar_title_group_event_source_unavailable' using errcode = '23514';
    end if;
    v_source_host := lower(substring(v_evidence_item ->> 'url' from '^https://([^/?#]+)'));
    if v_source_host is null
       or not (v_source_host = v_source_domain
         or (v_subdomains_allowed and right(v_source_host,char_length(v_source_domain) + 1) = '.' || v_source_domain)) then
      raise exception 'radar_title_group_event_source_mismatch' using errcode = '23514';
    end if;
    v_source_ids := array_append(v_source_ids,v_evidence_item ->> 'sourceId');
    v_source_urls := array_append(v_source_urls,v_evidence_item ->> 'url');
    v_source_families := array_append(v_source_families,v_source_family);
    if v_source_class = 'official' then v_official_count := v_official_count + 1; end if;
  end loop;
  if (select count(distinct item) from unnest(v_source_ids) item) <> v_evidence_count
     or (select count(distinct item) from unnest(v_source_urls) item) <> v_evidence_count
     or (v_official_count = 0
       and (select count(distinct item) from unnest(v_source_families) item) < 2) then
    raise exception 'radar_title_group_event_sources_insufficient' using errcode = '23514';
  end if;
  select string_agg(
    (item.value ->> 'sourceId') || '|' || (item.value ->> 'url'),
    '|' order by item.value ->> 'sourceId',item.value ->> 'url'
  ) into v_event_source_basis
    from jsonb_array_elements(p_payload -> 'evidence') item(value);
  v_event_source_hash := md5(v_event_source_basis)
    || md5('radar-websearch-v1|' || v_event_source_basis);
  v_request_hash := md5(p_payload::text);

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,0));
  select operation.request_hash,operation.result into v_previous_hash,v_previous_result
    from public.kd_radar_operations operation
   where operation.account_id = p_account_id and operation.operation_id = p_operation_id;
  if found then
    if v_previous_hash is distinct from v_request_hash then
      raise exception 'radar_websearch_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  select group_target.target_id,group_target.external_ids #> '{titleGroup,members}'
    into v_group_target_id,v_members
    from public.kd_radar_subscriptions subscription
    join public.kd_radar_targets group_target on group_target.target_id = subscription.target_id
    join public.kd_radar_title_group_discovery_contracts discovery
      on discovery.target_key = group_target.target_key
     and discovery.discovery_enabled
     and discovery.group_external_id = v_group_external_id
     and discovery.canonical_name = p_payload ->> 'canonicalGroupName'
   where subscription.account_id = p_account_id
     and subscription.subscription_status = 'active'
     and subscription.region = 'AT' and subscription.scope = 'all'
     and subscription.person_external_id is null and subscription.person_role is null
     and group_target.target_key = v_group_target_key
     and group_target.target_type = 'franchise' and group_target.target_status = 'active'
     and group_target.canonical_title = p_payload ->> 'displayName'
     and group_target.external_ids #>> '{titleGroup,queryKey}' = p_payload ->> 'queryKey'
     and public.kd_radar_title_group_metadata_valid(
       group_target.target_key,group_target.canonical_title,group_target.external_ids -> 'titleGroup'
     )
   for update of group_target;
  if not found then
    raise exception 'radar_title_group_discovery_target_unavailable' using errcode = '42501';
  end if;

  select true into v_known_member
    from jsonb_array_elements(v_members) member(value)
   where member.value ->> 'targetId' = v_target_key
     and member.value ->> 'targetType' = v_work_target_type
     and member.value ->> 'title' = v_work_title
     and (member.value ->> 'year')::integer = v_work_year;
  v_known_member := coalesce(v_known_member,false);
  if not v_known_member and not (
    (v_target_key ~ '^imdb:tt[1-9][0-9]{6,10}$')
    or (v_target_key ~ '^tmdb:movie:[1-9][0-9]{0,11}$' and v_work_target_type = 'work')
    or (v_target_key ~ '^tmdb:tv:[1-9][0-9]{0,11}$' and v_work_target_type = 'series')
  ) then
    raise exception 'radar_title_group_discovery_work_id_weak' using errcode = '23514';
  end if;

  insert into public.kd_radar_targets (
    target_key,target_type,target_status,canonical_title,external_ids
  ) values (
    v_target_key,v_work_target_type,'active',v_work_title,
    jsonb_build_object('releaseYear',v_work_year)
  ) on conflict (target_key) do nothing;
  select target.target_id into v_work_target_id
    from public.kd_radar_targets target
   where target.target_key = v_target_key
     and target.target_type = v_work_target_type
     and target.target_status = 'active'
     and target.canonical_title = v_work_title
     and target.external_ids ->> 'releaseYear' = v_work_year::text
   for key share;
  if not found then
    raise exception 'radar_title_group_discovery_work_drift' using errcode = '23514';
  end if;

  insert into public.kd_radar_title_group_memberships as membership (
    group_target_id,work_target_id,group_external_id,membership_evidence,
    evidence_state_hash,first_confirmed_at,last_verified_at
  ) values (
    v_group_target_id,v_work_target_id,v_group_external_id,
    p_payload -> 'membershipEvidence',v_evidence_hash,now(),v_checked_at
  ) on conflict (group_target_id,work_target_id) do update
    set membership_evidence = excluded.membership_evidence,
        evidence_state_hash = excluded.evidence_state_hash,
        last_verified_at = excluded.last_verified_at
    where membership.group_external_id = excluded.group_external_id
      and (
        membership.evidence_state_hash is distinct from excluded.evidence_state_hash
        or membership.last_verified_at < excluded.last_verified_at
      );
  perform 1 from public.kd_radar_title_group_memberships membership
   where membership.group_target_id = v_group_target_id
     and membership.work_target_id = v_work_target_id
     and membership.group_external_id = v_group_external_id;
  if not found then
    raise exception 'radar_title_group_membership_drift' using errcode = '23514';
  end if;

  if not v_known_member then
    if jsonb_array_length(v_members) >= 20 then
      raise exception 'radar_title_group_member_limit' using errcode = '23514';
    end if;
    update public.kd_radar_targets group_target
       set external_ids = jsonb_set(
         group_target.external_ids,'{titleGroup,members}',
         v_members || jsonb_build_array(jsonb_build_object(
           'targetId',v_target_key,'targetType',v_work_target_type,
           'title',v_work_title,'year',v_work_year
         )),false
       ), updated_at = now()
     where group_target.target_id = v_group_target_id;
  end if;

  -- Das aktive Gruppen-Abo ist die einzige Nutzerautorisierung. Der globale
  -- Eventwrite verwendet den oben gesperrten, exakt validierten Werkdatensatz
  -- direkt und legt weder dauerhaft noch temporaer ein Werkabo an.
  v_event_key := v_target_key || '|' || v_event_type || '|AT|' || v_platform
    || '|' || coalesce(v_season_number::text,'-');
  perform pg_advisory_xact_lock(hashtextextended(v_event_key,0));
  select event.event_id,event.current_confirmed_version_id
    into v_event_id,v_current_version_id
    from public.kd_radar_events event
   where event.event_key = v_event_key
     and event.target_id = v_work_target_id
     and event.event_type = v_event_type
     and event.region = 'AT'
     and event.platform = v_platform
     and event.season_number is not distinct from v_season_number
   for update;
  if not found then
    v_event_id := gen_random_uuid();
    insert into public.kd_radar_events (
      event_id,event_key,target_id,event_type,region,platform,season_number,
      lifecycle_status,created_at,updated_at
    ) values (
      v_event_id,v_event_key,v_work_target_id,v_event_type,'AT',v_platform,
      v_season_number,'scheduled',now(),now()
    );
    v_current_version_id := null;
  end if;

  if v_current_version_id is not null then
    select version.event_date,version.source_state_hash
      into v_current_date,v_current_source_hash
      from public.kd_radar_event_versions version
     where version.event_version_id = v_current_version_id
       and version.event_id = v_event_id
       and version.verification_status = 'confirmed';
  end if;
  if v_current_date = v_event_date and v_current_source_hash = v_event_source_hash then
    v_core_result := jsonb_build_object(
      'status','no_change','eventId',v_event_id,'eventVersionId',v_current_version_id
    );
  else
    insert into public.kd_radar_event_versions (
      event_version_id,event_id,event_date,date_precision,verification_status,created_at
    ) values (
      v_event_version_id,v_event_id,v_event_date,'day','candidate',now()
    );
    for v_evidence_item in select value from jsonb_array_elements(p_payload -> 'evidence')
    loop
      select source.publisher_family,source.source_class
        into v_publisher_family,v_persisted_source_class
        from public.kd_radar_sources source
       where source.source_id = v_evidence_item ->> 'sourceId'
         and source.active and source.rights_status = 'approved'
         and source.attribution_approved and source.source_class in ('official','editorial');
      if not found then
        raise exception 'radar_title_group_event_source_unavailable' using errcode = '23514';
      end if;
      v_retrieved_at := (v_evidence_item ->> 'retrievedAt')::timestamptz;
      insert into public.kd_radar_evidence (
        event_version_id,source_id,canonical_url,publisher_family,source_class,
        claimed_date,event_type,region,platform,fingerprint,retrieved_at,created_at
      ) values (
        v_event_version_id,v_evidence_item ->> 'sourceId',v_evidence_item ->> 'url',
        v_publisher_family,v_persisted_source_class,v_event_date,v_event_type,'AT',v_platform,
        md5((v_evidence_item ->> 'sourceId') || '|' || (v_evidence_item ->> 'url') || '|' || v_event_date::text)
          || md5('radar-websearch-evidence-v1|' || (v_evidence_item ->> 'sourceId') || '|' || (v_evidence_item ->> 'url') || '|' || v_event_date::text),
        v_retrieved_at,now()
      );
    end loop;
    update public.kd_radar_event_versions version
       set verification_status = 'confirmed',source_state_hash = v_event_source_hash,
           last_verified_at = v_checked_at
     where version.event_version_id = v_event_version_id;
    update public.kd_radar_events event
       set current_candidate_version_id = v_event_version_id,
           current_confirmed_version_id = v_event_version_id,updated_at = now()
     where event.event_id = v_event_id;
    v_core_result := jsonb_build_object(
      'status','confirmed','eventId',v_event_id,'eventVersionId',v_event_version_id
    );
  end if;
  v_result := v_core_result || jsonb_build_object(
    'format','kd-radar-title-group-event-v2',
    'queryVersion','title-group-query-v2',
    'groupExternalId',v_group_external_id,
    'membershipEvidenceHash',v_evidence_hash
  );
  insert into public.kd_radar_operations (
    account_id,operation_id,request_hash,result,terminal_at,created_at
  ) values (
    p_account_id,p_operation_id,v_request_hash,v_result,now(),now()
  );
  return v_result;
end
$$;

revoke all on function public.kd_radar_title_group_preserve_discovered_members()
  from public, anon, authenticated;
revoke all on function public.kd_radar_websearch_upsert_title_group_discovery_event(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.kd_radar_websearch_upsert_title_group_discovery_event(uuid,uuid,jsonb)
  to service_role;

comment on function public.kd_radar_websearch_upsert_title_group_discovery_event(uuid,uuid,jsonb) is
  'Persistiert genau einen stark identifizierten, separat zugehoerigkeits- und terminbelegten Titelgruppenfund; erzeugt weder Abo noch Receipt.';

commit;
