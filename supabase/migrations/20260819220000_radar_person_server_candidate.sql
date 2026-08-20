-- Kinodreieck · Radar Personen-Serverkandidat (nur lokal vorbereitet)
-- =============================================================================
-- STATUS: NICHT REMOTE ANGEWANDT.
--
-- Schmaler Ausbau des vorhandenen manuellen Radar-Websearchs: kuratierte
-- Person+Rolle -> genau ein bestehender Providerpfad -> kuratierter Werkabgleich
-- -> bestehende Target/Event/Version/Evidence-/Operations-Primitiven -> Feed.
-- Kein Scheduler, Retry, Batch, Ranking oder zweiter Provider.
-- =============================================================================

begin;

alter table public.kd_radar_targets
  drop constraint kd_radar_targets_target_type_check;
alter table public.kd_radar_targets
  add constraint kd_radar_targets_target_type_check
  check (target_type in ('work','series','franchise','person')) not valid;
alter table public.kd_radar_targets
  validate constraint kd_radar_targets_target_type_check;

create function public.kd_radar_person_target_metadata_valid(
  p_target_key text,
  p_canonical_name text,
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
  v_person_id text := p_metadata ->> 'personExternalId';
  v_role text := p_metadata ->> 'personRole';
begin
  if jsonb_typeof(p_metadata) <> 'object' then return false; end if;
  select count(*) into v_key_count from jsonb_object_keys(p_metadata);
  if v_key_count <> 3
     or not (p_metadata ?& array['personExternalId','personRole','catalog'])
     or jsonb_typeof(p_metadata -> 'personExternalId') <> 'string'
     or jsonb_typeof(p_metadata -> 'personRole') <> 'string'
     or jsonb_typeof(p_metadata -> 'catalog') <> 'array'
     or v_person_id !~ '^[a-z][a-z0-9_-]{1,31}:[^[:space:]]{1,150}$'
     or v_person_id ~* '^(fixture|synthetic):'
     or v_role not in ('actor','director')
     or p_target_key is distinct from 'person:' || v_person_id || ':' || v_role
     or btrim(p_canonical_name) = '' or char_length(p_canonical_name) > 160
     or p_canonical_name = v_person_id
     or p_canonical_name ~* '^(person|wikidata|fixture|synthetic):'
     or jsonb_array_length(p_metadata -> 'catalog') not between 1 and 6 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_metadata -> 'catalog')
  loop
    if jsonb_typeof(v_item) <> 'object' then return false; end if;
    select count(*) into v_key_count from jsonb_object_keys(v_item);
    if v_key_count <> 4
       or not (v_item ?& array['targetId','targetType','title','year'])
       or jsonb_typeof(v_item -> 'targetId') <> 'string'
       or jsonb_typeof(v_item -> 'targetType') <> 'string'
       or jsonb_typeof(v_item -> 'title') <> 'string'
       or jsonb_typeof(v_item -> 'year') <> 'number'
       or (v_item ->> 'targetId') !~ '^[a-z][a-z0-9_-]{1,31}:[^[:space:]]{1,150}$'
       or (v_item ->> 'targetId') ~* '^(fixture|synthetic):'
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

alter table public.kd_radar_targets
  add constraint kd_radar_person_target_metadata_contract
  check (
    target_type <> 'person'
    or public.kd_radar_person_target_metadata_valid(target_key, canonical_title, external_ids)
  ) not valid;
alter table public.kd_radar_targets
  validate constraint kd_radar_person_target_metadata_contract;

insert into public.kd_radar_targets (
  target_key, target_type, target_status, canonical_title, external_ids
) values
  ('catalog:dream-scenario-2023','work','active','Dream Scenario',
   '{"catalogId":"catalog:dream-scenario-2023","releaseYear":2023}'::jsonb),
  ('catalog:sin-city-2005','work','active','Sin City',
   '{"catalogId":"catalog:sin-city-2005","releaseYear":2005}'::jsonb),
  ('catalog:frances-ha-2012','work','active','Frances Ha',
   '{"catalogId":"catalog:frances-ha-2012","releaseYear":2012}'::jsonb),
  ('catalog:barbie-2023','work','active','Barbie',
   '{"catalogId":"catalog:barbie-2023","releaseYear":2023}'::jsonb),
  ('catalog:psycho-1960','work','active','Psycho',
   '{"catalogId":"catalog:psycho-1960","releaseYear":1960}'::jsonb)
on conflict (target_key) do nothing;

insert into public.kd_radar_targets (
  target_key, target_type, target_status, canonical_title, external_ids
) values
  ('person:wikidata:Q42869:actor','person','active','Nicolas Cage',
   '{"personExternalId":"wikidata:Q42869","personRole":"actor","catalog":[{"targetId":"catalog:dream-scenario-2023","targetType":"work","title":"Dream Scenario","year":2023}]}'::jsonb),
  ('person:wikidata:Q47284:director','person','active','Robert Rodriguez',
   '{"personExternalId":"wikidata:Q47284","personRole":"director","catalog":[{"targetId":"catalog:sin-city-2005","targetType":"work","title":"Sin City","year":2005}]}'::jsonb),
  ('person:wikidata:Q271967:actor','person','active','Greta Gerwig',
   '{"personExternalId":"wikidata:Q271967","personRole":"actor","catalog":[{"targetId":"catalog:frances-ha-2012","targetType":"work","title":"Frances Ha","year":2012}]}'::jsonb),
  ('person:wikidata:Q271967:director','person','active','Greta Gerwig',
   '{"personExternalId":"wikidata:Q271967","personRole":"director","catalog":[{"targetId":"catalog:barbie-2023","targetType":"work","title":"Barbie","year":2023}]}'::jsonb),
  ('person:wikidata:Q7374:director','person','active','Alfred Hitchcock',
   '{"personExternalId":"wikidata:Q7374","personRole":"director","catalog":[{"targetId":"catalog:psycho-1960","targetType":"work","title":"Psycho","year":1960}]}'::jsonb)
on conflict (target_key) do nothing;

do $$
begin
  if (select count(*)
        from (values
          ('catalog:dream-scenario-2023','Dream Scenario',2023),
          ('catalog:sin-city-2005','Sin City',2005),
          ('catalog:frances-ha-2012','Frances Ha',2012),
          ('catalog:barbie-2023','Barbie',2023),
          ('catalog:psycho-1960','Psycho',1960)
        ) expected(target_key,canonical_title,release_year)
        join public.kd_radar_targets t
          on t.target_key = expected.target_key
         and t.target_type = 'work' and t.target_status = 'active'
         and t.canonical_title = expected.canonical_title
         and t.external_ids ->> 'catalogId' = expected.target_key
         and t.external_ids ->> 'releaseYear' = expected.release_year::text) <> 5
     or (select count(*)
        from (values
          ('person:wikidata:Q42869:actor','Nicolas Cage',
           '{"personExternalId":"wikidata:Q42869","personRole":"actor","catalog":[{"targetId":"catalog:dream-scenario-2023","targetType":"work","title":"Dream Scenario","year":2023}]}'::jsonb),
          ('person:wikidata:Q47284:director','Robert Rodriguez',
           '{"personExternalId":"wikidata:Q47284","personRole":"director","catalog":[{"targetId":"catalog:sin-city-2005","targetType":"work","title":"Sin City","year":2005}]}'::jsonb),
          ('person:wikidata:Q271967:actor','Greta Gerwig',
           '{"personExternalId":"wikidata:Q271967","personRole":"actor","catalog":[{"targetId":"catalog:frances-ha-2012","targetType":"work","title":"Frances Ha","year":2012}]}'::jsonb),
          ('person:wikidata:Q271967:director','Greta Gerwig',
           '{"personExternalId":"wikidata:Q271967","personRole":"director","catalog":[{"targetId":"catalog:barbie-2023","targetType":"work","title":"Barbie","year":2023}]}'::jsonb),
          ('person:wikidata:Q7374:director','Alfred Hitchcock',
           '{"personExternalId":"wikidata:Q7374","personRole":"director","catalog":[{"targetId":"catalog:psycho-1960","targetType":"work","title":"Psycho","year":1960}]}'::jsonb)
        ) expected(target_key,canonical_title,metadata)
        join public.kd_radar_targets t
          on t.target_key = expected.target_key
         and t.target_type = 'person' and t.target_status = 'active'
         and t.canonical_title = expected.canonical_title
         and t.external_ids = expected.metadata
         and public.kd_radar_person_target_metadata_valid(
           t.target_key,t.canonical_title,t.external_ids
         )) <> 5 then
    raise exception 'radar_person_curated_targets_drift';
  end if;
end
$$;

alter table public.kd_radar_subscriptions
  add column person_external_id text,
  add column person_role text;

alter table public.kd_radar_subscriptions
  add constraint kd_radar_subscription_person_pair_contract
  check (
    (person_external_id is null and person_role is null)
    or (
      person_external_id ~ '^[a-z][a-z0-9_-]{1,31}:[^[:space:]]{1,150}$'
      and person_external_id !~* '^(fixture|synthetic):'
      and person_role in ('actor','director')
      and scope = 'all'
    )
  ) not valid;
alter table public.kd_radar_subscriptions
  validate constraint kd_radar_subscription_person_pair_contract;

create function public.kd_guard_radar_person_subscription()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_target_type text;
  v_target_key text;
  v_metadata jsonb;
begin
  select t.target_type, t.target_key, t.external_ids
    into v_target_type, v_target_key, v_metadata
    from public.kd_radar_targets t
   where t.target_id = new.target_id
   for key share;
  if not found then
    raise exception 'radar_person_subscription_target_missing' using errcode = '23514';
  end if;
  if v_target_type = 'person' then
    if new.scope <> 'all'
       or new.person_external_id is distinct from v_metadata ->> 'personExternalId'
       or new.person_role is distinct from v_metadata ->> 'personRole'
       or v_target_key is distinct from 'person:' || new.person_external_id || ':' || new.person_role then
      raise exception 'radar_person_subscription_contract_invalid' using errcode = '23514';
    end if;
  elsif new.person_external_id is not null or new.person_role is not null then
    raise exception 'radar_person_subscription_contract_invalid' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger kd_radar_person_subscription_guard
  before insert or update of target_id, scope, person_external_id, person_role
  on public.kd_radar_subscriptions
  for each row execute function public.kd_guard_radar_person_subscription();

create function public.kd_radar_pilot_set_subscription(
  p_target_key text,
  p_scope text,
  p_status text,
  p_operation_id uuid,
  p_person_external_id text,
  p_person_role text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_id uuid;
  v_request_hash text;
  v_previous_hash text;
  v_previous_result jsonb;
  v_unlimited boolean := false;
  v_active_others integer := 0;
  v_revision bigint := 0;
  v_checksum text;
  v_result jsonb;
begin
  if not public.kd_radar_pilot_allowed() then
    raise exception 'radar_pilot_forbidden' using errcode = '42501';
  end if;
  if v_actor_id is null or p_target_key is null or p_operation_id is null
     or p_scope is distinct from 'all'
     or p_status not in ('active','paused','removed')
     or p_person_external_id !~ '^[a-z][a-z0-9_-]{1,31}:[^[:space:]]{1,150}$'
     or p_person_external_id ~* '^(fixture|synthetic):'
     or p_person_role not in ('actor','director')
     or p_target_key is distinct from 'person:' || p_person_external_id || ':' || p_person_role then
    raise exception 'radar_person_subscription_request_invalid' using errcode = '22023';
  end if;

  select t.target_id into v_target_id
    from public.kd_radar_targets t
   where t.target_key = p_target_key
     and t.target_type = 'person'
     and t.target_status = 'active'
     and t.external_ids ->> 'personExternalId' = p_person_external_id
     and t.external_ids ->> 'personRole' = p_person_role
     and public.kd_radar_person_target_metadata_valid(
       t.target_key, t.canonical_title, t.external_ids
     )
   for key share;
  if not found then
    raise exception 'radar_person_target_unavailable' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text, 0));
  v_request_hash := md5(
    'pilot-person-subscription|' || p_target_key || '|' || p_person_external_id
    || '|' || p_person_role || '|' || p_status
  );
  select o.request_hash, o.result into v_previous_hash, v_previous_result
    from public.kd_radar_operations o
   where o.account_id = v_actor_id and o.operation_id = p_operation_id;
  if found then
    if v_previous_hash <> v_request_hash then
      raise exception 'radar_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  v_unlimited := coalesce((select c.radar_unlimited
    from public.kd_radar_capabilities c where c.account_id = v_actor_id), false);
  if p_status = 'active' and not v_unlimited then
    select count(*) into v_active_others
      from public.kd_radar_subscriptions s
     where s.account_id = v_actor_id
       and s.subscription_status = 'active'
       and s.target_id <> v_target_id;
    if v_active_others >= 10 then
      raise exception 'radar_quota_exceeded' using errcode = '23514';
    end if;
  end if;

  insert into public.kd_radar_account_state (account_id, revision)
  values (v_actor_id, 0) on conflict (account_id) do nothing;
  select a.revision into v_revision from public.kd_radar_account_state a
   where a.account_id = v_actor_id for update;
  v_revision := v_revision + 1;

  if p_status = 'removed' then
    delete from public.kd_radar_subscriptions s
     where s.account_id = v_actor_id and s.target_id = v_target_id;
  else
    insert into public.kd_radar_subscriptions (
      account_id, target_id, region, scope, subscription_status,
      server_revision, last_operation_id, person_external_id, person_role,
      created_at, updated_at
    ) values (
      v_actor_id, v_target_id, 'AT', 'all', p_status,
      v_revision, p_operation_id, p_person_external_id, p_person_role,
      now(), now()
    )
    on conflict (account_id, target_id) do update
      set region = 'AT', scope = 'all',
          subscription_status = excluded.subscription_status,
          server_revision = excluded.server_revision,
          last_operation_id = excluded.last_operation_id,
          person_external_id = excluded.person_external_id,
          person_role = excluded.person_role,
          updated_at = now();
  end if;
  if p_status <> 'active' then
    delete from public.kd_radar_target_shares sh
     where sh.account_id = v_actor_id and sh.target_id = v_target_id;
  end if;

  v_checksum := public.kd_radar_account_checksum(v_actor_id);
  update public.kd_radar_account_state a
     set revision = v_revision, checksum = v_checksum, updated_at = now()
   where a.account_id = v_actor_id;
  v_result := jsonb_build_object(
    'operationId', p_operation_id, 'targetId', p_target_key,
    'status', p_status, 'revision', v_revision, 'checksum', v_checksum
  );
  insert into public.kd_radar_operations (account_id, operation_id, request_hash, result)
  values (v_actor_id, p_operation_id, v_request_hash, v_result);
  return v_result;
end
$$;

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

  select case when t.target_type = 'person' then
    jsonb_build_object(
      'kind','person', 'targetId',t.target_key,
      'personExternalId',s.person_external_id,
      'canonicalName',t.canonical_title, 'role',s.person_role,
      'region','AT', 'windowStart',v_today::text,
      'windowEnd',(v_today + 6)::text, 'catalog',t.external_ids -> 'catalog'
    )
  else
    jsonb_build_object(
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
     );
  if v_context is null then
    raise exception 'radar_websearch_target_unavailable' using errcode = '42501';
  end if;
  return v_context;
end
$$;

create function public.kd_radar_websearch_upsert_person_event(
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
  v_request_hash text;
  v_previous_hash text;
  v_previous_result jsonb;
  v_root_key_count integer;
  v_evidence_key_count integer;
  v_evidence_count integer;
  v_evidence_item jsonb;
  v_source_ids text[] := array[]::text[];
  v_source_count integer := 0;
  v_family_count integer := 0;
  v_official_count integer := 0;
  v_target_key text := p_payload ->> 'targetKey';
  v_person_target_key text := p_payload ->> 'personTargetKey';
  v_person_external_id text := p_payload ->> 'personExternalId';
  v_person_role text := p_payload ->> 'personRole';
  v_person_name text := p_payload ->> 'personName';
  v_target_type text := p_payload ->> 'workTargetType';
  v_work_title text := p_payload ->> 'workTitle';
  v_work_year integer;
  v_event_type text := p_payload ->> 'eventType';
  v_date_text text := p_payload ->> 'date';
  v_region text := p_payload ->> 'region';
  v_platform text := p_payload ->> 'platform';
  v_checked_at_text text := p_payload ->> 'checkedAt';
  v_window_start_text text := p_payload ->> 'windowStart';
  v_window_end_text text := p_payload ->> 'windowEnd';
  v_checked_at timestamptz;
  v_window_start date;
  v_window_end date;
  v_event_date date;
  v_target_id uuid;
  v_event_key text;
  v_event_id uuid;
  v_current_version_id uuid;
  v_event_version_id uuid := gen_random_uuid();
  v_current_date date;
  v_current_source_hash text;
  v_source_state_basis text;
  v_source_state_hash text;
  v_publisher_family text;
  v_source_class text;
  v_retrieved_at timestamptz;
  v_status text;
  v_result jsonb;
begin
  if p_account_id is null or p_operation_id is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'radar_person_upsert_invalid' using errcode = '22023';
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
  if v_root_key_count <> 17 or not (p_payload ?& array[
       'targetKey','eventType','date','region','platform','seasonNumber','evidence',
       'personTargetKey','personExternalId','personRole','personName',
       'workTargetType','workTitle','workYear','checkedAt','windowStart','windowEnd'
     ])
     or jsonb_typeof(p_payload -> 'targetKey') <> 'string'
     or jsonb_typeof(p_payload -> 'eventType') <> 'string'
     or jsonb_typeof(p_payload -> 'date') <> 'string'
     or jsonb_typeof(p_payload -> 'region') <> 'string'
     or jsonb_typeof(p_payload -> 'platform') <> 'string'
     or jsonb_typeof(p_payload -> 'seasonNumber') <> 'null'
     or jsonb_typeof(p_payload -> 'evidence') <> 'array'
     or jsonb_typeof(p_payload -> 'personTargetKey') <> 'string'
     or jsonb_typeof(p_payload -> 'personExternalId') <> 'string'
     or jsonb_typeof(p_payload -> 'personRole') <> 'string'
     or jsonb_typeof(p_payload -> 'personName') <> 'string'
     or jsonb_typeof(p_payload -> 'workTargetType') <> 'string'
     or jsonb_typeof(p_payload -> 'workTitle') <> 'string'
     or jsonb_typeof(p_payload -> 'workYear') <> 'number'
     or jsonb_typeof(p_payload -> 'checkedAt') <> 'string'
     or jsonb_typeof(p_payload -> 'windowStart') <> 'string'
     or jsonb_typeof(p_payload -> 'windowEnd') <> 'string' then
    raise exception 'radar_person_payload_invalid' using errcode = '22023';
  end if;
  if (p_payload ->> 'workYear') !~ '^[0-9]{4}$' then
    raise exception 'radar_person_work_invalid' using errcode = '22023';
  end if;
  v_work_year := (p_payload ->> 'workYear')::integer;
  if v_person_external_id !~ '^[a-z][a-z0-9_-]{1,31}:[^[:space:]]{1,150}$'
     or v_person_external_id ~* '^(fixture|synthetic):'
     or v_person_role not in ('actor','director')
     or v_person_target_key is distinct from 'person:' || v_person_external_id || ':' || v_person_role
     or btrim(v_person_name) = '' or v_person_name = v_person_external_id
     or v_target_key !~ '^[a-z][a-z0-9_-]{1,31}:[^[:space:]]{1,150}$'
     or v_target_key ~* '^(fixture|synthetic):'
     or v_target_type not in ('work','series')
     or btrim(v_work_title) = '' or v_work_year not between 1888 and 2100
     or v_region is distinct from 'AT'
     or v_event_type not in ('kinostart_at','streamingstart_at','serienstart')
     or v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or v_window_start_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or v_window_end_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or v_checked_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$' then
    raise exception 'radar_person_contract_invalid' using errcode = '22023';
  end if;
  v_event_date := v_date_text::date;
  v_window_start := v_window_start_text::date;
  v_window_end := v_window_end_text::date;
  v_checked_at := v_checked_at_text::timestamptz;
  if to_char(v_event_date,'YYYY-MM-DD') <> v_date_text
     or to_char(v_window_start,'YYYY-MM-DD') <> v_window_start_text
     or to_char(v_window_end,'YYYY-MM-DD') <> v_window_end_text
     or v_window_end - v_window_start <> 6
     or v_event_date not between v_window_start and v_window_end
     or not isfinite(v_checked_at)
     or (v_event_type = 'streamingstart_at' and (btrim(v_platform) = '' or v_platform = '-'))
     or (v_event_type <> 'streamingstart_at' and v_platform is distinct from '-')
     or (v_target_type = 'work' and v_event_type = 'serienstart')
     or (v_target_type = 'series' and v_event_type = 'kinostart_at') then
    raise exception 'radar_person_event_invalid' using errcode = '23514';
  end if;

  select wt.target_id into v_target_id
    from public.kd_radar_subscriptions ps
    join public.kd_radar_targets pt on pt.target_id = ps.target_id
    join lateral jsonb_array_elements(pt.external_ids -> 'catalog') catalog(item) on true
    join public.kd_radar_targets wt on wt.target_key = catalog.item ->> 'targetId'
   where ps.account_id = p_account_id
     and ps.subscription_status = 'active' and ps.region = 'AT' and ps.scope = 'all'
     and pt.target_key = v_person_target_key and pt.target_type = 'person'
     and pt.target_status = 'active'
     and ps.person_external_id = v_person_external_id
     and ps.person_role = v_person_role
     and pt.canonical_title = v_person_name
     and pt.external_ids ->> 'personExternalId' = v_person_external_id
     and pt.external_ids ->> 'personRole' = v_person_role
     and public.kd_radar_person_target_metadata_valid(
       pt.target_key, pt.canonical_title, pt.external_ids
     )
     and catalog.item ->> 'targetId' = v_target_key
     and catalog.item ->> 'targetType' = v_target_type
     and catalog.item ->> 'title' = v_work_title
     and (catalog.item ->> 'year')::integer = v_work_year
     and wt.target_type = v_target_type and wt.target_status = 'active'
     and wt.canonical_title = v_work_title
     and (wt.external_ids ->> 'releaseYear')::integer = v_work_year
   for key share of ps, pt, wt;
  if not found then
    raise exception 'radar_person_curated_match_unavailable' using errcode = '42501';
  end if;

  v_evidence_count := jsonb_array_length(p_payload -> 'evidence');
  if v_evidence_count < 1 or v_evidence_count > 2 then
    raise exception 'radar_websearch_evidence_invalid' using errcode = '22023';
  end if;
  for v_evidence_item in select value from jsonb_array_elements(p_payload -> 'evidence')
  loop
    if jsonb_typeof(v_evidence_item) <> 'object' then
      raise exception 'radar_websearch_evidence_item_invalid' using errcode = '22023';
    end if;
    select count(*) into v_evidence_key_count from jsonb_object_keys(v_evidence_item);
    if v_evidence_key_count <> 3
       or not (v_evidence_item ?& array['sourceId','url','retrievedAt'])
       or jsonb_typeof(v_evidence_item -> 'sourceId') <> 'string'
       or jsonb_typeof(v_evidence_item -> 'url') <> 'string'
       or jsonb_typeof(v_evidence_item -> 'retrievedAt') <> 'string'
       or btrim(v_evidence_item ->> 'sourceId') = ''
       or btrim(v_evidence_item ->> 'url') = '' then
      raise exception 'radar_websearch_evidence_item_invalid' using errcode = '22023';
    end if;
    v_retrieved_at := (v_evidence_item ->> 'retrievedAt')::timestamptz;
    if not isfinite(v_retrieved_at) or v_retrieved_at > v_checked_at then
      raise exception 'radar_websearch_evidence_time_invalid' using errcode = '23514';
    end if;
    v_source_ids := array_append(v_source_ids, v_evidence_item ->> 'sourceId');
  end loop;
  if (select count(distinct source_id) from unnest(v_source_ids) source_id) <> v_evidence_count then
    raise exception 'radar_websearch_source_duplicate' using errcode = '23514';
  end if;
  perform 1 from public.kd_radar_sources s where s.source_id = any(v_source_ids) for key share;
  select count(distinct s.source_id), count(distinct s.publisher_family),
         count(*) filter (where s.source_class = 'official')
    into v_source_count, v_family_count, v_official_count
    from public.kd_radar_sources s
   where s.source_id = any(v_source_ids) and s.active
     and s.rights_status = 'approved' and s.attribution_approved
     and s.source_class in ('official','editorial');
  if v_source_count <> v_evidence_count or (v_official_count < 1 and v_family_count < 2) then
    raise exception 'radar_websearch_sources_insufficient' using errcode = '23514';
  end if;

  v_request_hash := md5(p_payload::text);
  perform pg_advisory_xact_lock(hashtextextended(
    p_account_id::text || '|' || p_operation_id::text, 0
  ));
  select o.request_hash, o.result into v_previous_hash, v_previous_result
    from public.kd_radar_operations o
   where o.account_id = p_account_id and o.operation_id = p_operation_id;
  if found then
    if v_previous_hash is distinct from v_request_hash then
      raise exception 'radar_websearch_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  select string_agg((item.value ->> 'sourceId') || '|' || (item.value ->> 'url'),
                    '|' order by item.value ->> 'sourceId', item.value ->> 'url')
    into v_source_state_basis
    from jsonb_array_elements(p_payload -> 'evidence') item(value);
  v_source_state_hash := md5(v_source_state_basis)
    || md5('radar-websearch-v1|' || v_source_state_basis);
  v_event_key := v_target_key || '|' || v_event_type || '|AT|' || v_platform || '|-';
  perform pg_advisory_xact_lock(hashtextextended(v_event_key, 0));
  select e.event_id, e.current_confirmed_version_id
    into v_event_id, v_current_version_id
    from public.kd_radar_events e
   where e.event_key = v_event_key and e.target_id = v_target_id
     and e.event_type = v_event_type and e.region = 'AT'
     and e.platform = v_platform and e.season_number is null
   for update;
  if not found then
    v_event_id := gen_random_uuid();
    insert into public.kd_radar_events (
      event_id,event_key,target_id,event_type,region,platform,season_number,
      lifecycle_status,created_at,updated_at
    ) values (
      v_event_id,v_event_key,v_target_id,v_event_type,'AT',v_platform,null,
      'scheduled',now(),now()
    );
    v_current_version_id := null;
  end if;
  if v_current_version_id is not null then
    select v.event_date, v.source_state_hash into v_current_date, v_current_source_hash
      from public.kd_radar_event_versions v
     where v.event_version_id = v_current_version_id and v.event_id = v_event_id
       and v.verification_status = 'confirmed';
  end if;
  if v_current_date = v_event_date and v_current_source_hash = v_source_state_hash then
    v_event_version_id := v_current_version_id;
    v_status := 'no_change';
  else
    insert into public.kd_radar_event_versions (
      event_version_id,event_id,event_date,date_precision,verification_status,created_at
    ) values (
      v_event_version_id,v_event_id,v_event_date,'day','candidate',now()
    );
    for v_evidence_item in select value from jsonb_array_elements(p_payload -> 'evidence')
    loop
      select s.publisher_family, s.source_class into v_publisher_family, v_source_class
        from public.kd_radar_sources s
       where s.source_id = v_evidence_item ->> 'sourceId' and s.active
         and s.rights_status = 'approved' and s.attribution_approved
         and s.source_class in ('official','editorial');
      if not found then
        raise exception 'radar_websearch_source_unavailable' using errcode = '23514';
      end if;
      v_retrieved_at := (v_evidence_item ->> 'retrievedAt')::timestamptz;
      insert into public.kd_radar_evidence (
        event_version_id,source_id,canonical_url,publisher_family,source_class,
        claimed_date,event_type,region,platform,fingerprint,retrieved_at,created_at
      ) values (
        v_event_version_id,v_evidence_item ->> 'sourceId',v_evidence_item ->> 'url',
        v_publisher_family,v_source_class,v_event_date,v_event_type,'AT',v_platform,
        md5((v_evidence_item ->> 'sourceId') || '|' || (v_evidence_item ->> 'url') || '|' || v_event_date::text)
          || md5('radar-websearch-evidence-v1|' || (v_evidence_item ->> 'sourceId') || '|' || (v_evidence_item ->> 'url') || '|' || v_event_date::text),
        v_retrieved_at,now()
      );
    end loop;
    update public.kd_radar_event_versions v
       set verification_status = 'confirmed', source_state_hash = v_source_state_hash,
           last_verified_at = now()
     where v.event_version_id = v_event_version_id;
    update public.kd_radar_events e
       set current_candidate_version_id = v_event_version_id,
           current_confirmed_version_id = v_event_version_id, updated_at = now()
     where e.event_id = v_event_id;
    v_status := 'confirmed';
  end if;

  v_result := jsonb_build_object(
    'format','kd-radar-person-event-v1', 'status',v_status,
    'eventId',v_event_id, 'eventVersionId',v_event_version_id,
    'personTargetKey',v_person_target_key,
    'personExternalId',v_person_external_id, 'personRole',v_person_role,
    'personName',v_person_name, 'workTargetKey',v_target_key,
    'workTargetType',v_target_type, 'workTitle',v_work_title,
    'workYear',v_work_year, 'checkedAt',v_checked_at_text,
    'windowStart',v_window_start_text, 'windowEnd',v_window_end_text
  );
  insert into public.kd_radar_operations (
    account_id,operation_id,request_hash,result,terminal_at,created_at
  ) values (
    p_account_id,p_operation_id,v_request_hash,v_result,now(),now()
  );
  return v_result;
end
$$;

alter function public.kd_radar_pilot_feed(uuid[])
  rename to kd_radar_pilot_feed_work_internal;
revoke all on function public.kd_radar_pilot_feed_work_internal(uuid[])
  from public, anon, authenticated;
grant execute on function public.kd_radar_pilot_feed_work_internal(uuid[])
  to service_role;

create function public.kd_radar_pilot_feed(
  p_operation_ids uuid[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_feed jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_person_results jsonb := '[]'::jsonb;
begin
  v_feed := public.kd_radar_pilot_feed_work_internal(p_operation_ids);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'targetId',t.target_key, 'targetType',t.target_type,
      'title',t.canonical_title, 'region',s.region, 'scope',s.scope,
      'status',s.subscription_status, 'updatedAt',s.updated_at
    ) || case when t.target_type = 'person' then jsonb_build_object(
      'personExternalId',s.person_external_id, 'personRole',s.person_role
    ) else '{}'::jsonb end
    order by t.canonical_title,t.target_key
  ), '[]'::jsonb) into v_subscriptions
  from public.kd_radar_subscriptions s
  join public.kd_radar_targets t on t.target_id = s.target_id
  where s.account_id = v_actor_id;

  with person_operations as materialized (
    select o.result, o.created_at
    from public.kd_radar_operations o
    join public.kd_radar_subscriptions s on s.account_id = o.account_id
    join public.kd_radar_targets pt on pt.target_id = s.target_id
      and pt.target_key = o.result ->> 'personTargetKey'
    where o.account_id = v_actor_id
      and o.result ->> 'format' = 'kd-radar-person-event-v1'
      and s.subscription_status = 'active' and s.region = 'AT' and s.scope = 'all'
      and pt.target_type = 'person' and pt.target_status = 'active'
      and s.person_external_id = o.result ->> 'personExternalId'
      and s.person_role = o.result ->> 'personRole'
      and pt.canonical_title = o.result ->> 'personName'
  ), latest_checks as (
    select result ->> 'personTargetKey' as person_target_key,
           max((result ->> 'checkedAt')::timestamptz) as checked_at
    from person_operations group by result ->> 'personTargetKey'
  ), candidate_rows as (
    select distinct on (
      po.result ->> 'personTargetKey', po.result ->> 'eventVersionId'
    ) po.result, e.event_type, e.region, e.platform, v.event_date
    from person_operations po
    join latest_checks lc on lc.person_target_key = po.result ->> 'personTargetKey'
      and lc.checked_at = (po.result ->> 'checkedAt')::timestamptz
    join public.kd_radar_event_versions v
      on v.event_version_id = (po.result ->> 'eventVersionId')::uuid
      and v.verification_status = 'confirmed'
    join public.kd_radar_events e
      on e.event_id = (po.result ->> 'eventId')::uuid and e.event_id = v.event_id
    join public.kd_radar_targets wt
      on wt.target_id = e.target_id
      and wt.target_key = po.result ->> 'workTargetKey'
      and wt.target_type = po.result ->> 'workTargetType'
      and wt.canonical_title = po.result ->> 'workTitle'
    order by po.result ->> 'personTargetKey', po.result ->> 'eventVersionId', po.created_at desc
  )
  select coalesce(jsonb_agg(grouped.person_result order by grouped.person_name, grouped.person_target_key), '[]'::jsonb)
    into v_person_results
    from (
      select cr.result ->> 'personTargetKey' as person_target_key,
             cr.result ->> 'personName' as person_name,
             jsonb_build_object(
               'targetId',cr.result ->> 'personTargetKey', 'status','confirmed',
               'checkedAt',cr.result ->> 'checkedAt',
               'windowStart',cr.result ->> 'windowStart',
               'windowEnd',cr.result ->> 'windowEnd',
               'person',jsonb_build_object(
                 'personExternalId',cr.result ->> 'personExternalId',
                 'name',cr.result ->> 'personName',
                 'role',cr.result ->> 'personRole', 'canonical',true
               ),
               'candidates',jsonb_agg(jsonb_build_object(
                 'targetId',cr.result ->> 'workTargetKey',
                 'targetType',cr.result ->> 'workTargetType',
                 'title',cr.result ->> 'workTitle',
                 'year',(cr.result ->> 'workYear')::integer,
                 'role',cr.result ->> 'personRole', 'eventType',cr.event_type,
                 'date',cr.event_date, 'region',cr.region, 'platform',cr.platform,
                 'evidence',(
                   select coalesce(jsonb_agg(jsonb_build_object(
                     'sourceId',ev.source_id, 'sourceDomain',rs.domain,
                     'url',ev.canonical_url, 'retrievedAt',ev.retrieved_at
                   ) order by ev.source_id,ev.canonical_url,ev.retrieved_at), '[]'::jsonb)
                   from public.kd_radar_evidence ev
                   join public.kd_radar_sources rs on rs.source_id = ev.source_id
                   where ev.event_version_id = (cr.result ->> 'eventVersionId')::uuid
                 )
               ) order by cr.event_date,cr.result ->> 'workTitle',cr.result ->> 'workTargetKey')
             ) as person_result
      from candidate_rows cr
      group by cr.result ->> 'personTargetKey',cr.result ->> 'personName',
               cr.result ->> 'personExternalId',cr.result ->> 'personRole',
               cr.result ->> 'checkedAt',cr.result ->> 'windowStart',cr.result ->> 'windowEnd'
    ) grouped;

  return v_feed || jsonb_build_object(
    'format','kd-radar-pilot-feed-v2',
    'subscriptions',v_subscriptions,
    'personResults',v_person_results
  );
end
$$;

create or replace function public.kd_radar_websearch_auftrag_starten(
  p_account_id uuid,
  p_target_key text,
  p_operation_id uuid,
  p_reservierung numeric,
  p_search_requests integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_radar_aktiv boolean;
  v_provider_aktiv boolean;
  v_provider jsonb;
  v_fee numeric;
  v_task_cap numeric;
begin
  if p_account_id is null or p_operation_id is null
     or p_target_key is null or btrim(p_target_key) = ''
     or p_search_requests is distinct from 1
     or p_reservierung is null
     or p_reservierung::text !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok',false,'code','server','grund','radar-websearch-request-invalid');
  end if;
  select radar_aktiv,radar_provider_aktiv into v_radar_aktiv,v_provider_aktiv
    from public.kd_radar_settings where singleton for key share;
  if not coalesce(v_radar_aktiv,false) then
    return jsonb_build_object('ok',false,'code','disabled','grund','radar-off');
  end if;
  if not coalesce(v_provider_aktiv,false) then
    return jsonb_build_object('ok',false,'code','disabled','grund','radar-provider-off');
  end if;
  if not exists (
    select 1 from public.kd_account_access a
    join public.kd_radar_capabilities c on c.account_id = a.account_id
    join public.kd_radar_subscriptions s on s.account_id = a.account_id
    join public.kd_radar_targets t on t.target_id = s.target_id
    where a.account_id = p_account_id and a.active and a.personal_ai
      and c.radar_pilot and c.radar_review
      and s.subscription_status = 'active' and s.region = 'AT'
      and t.target_key = p_target_key and t.target_key !~* '^(fixture|synthetic):'
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
           t.target_key,t.canonical_title,t.external_ids
         ))
      )
  ) then
    return jsonb_build_object('ok',false,'code','forbidden','grund','radar-target-forbidden');
  end if;
  v_provider := public.kd_private_provider_allowed('anthropic');
  if v_provider is null or v_provider ->> 'code' is distinct from 'PROVIDER_ALLOWED'
     or (v_provider ->> 'ok')::boolean is distinct from true then
    return jsonb_build_object('ok',false,'code','disabled','grund','provider-off');
  end if;
  select (wert #>> '{}')::numeric into v_fee from public.kd_ai_limits
   where schluessel = 'websearch_usd_cent_pro_request' and jsonb_typeof(wert) = 'number';
  select (wert #>> '{radar-websearch}')::numeric into v_task_cap from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent'
     and jsonb_typeof(wert) = 'object'
     and jsonb_typeof(wert #> '{radar-websearch}') = 'number';
  if v_fee is distinct from 1 or v_task_cap is distinct from 5
     or p_reservierung < v_fee or p_reservierung > v_task_cap then
    return jsonb_build_object('ok',false,'code','server','grund','radar-websearch-cost-config-invalid');
  end if;
  return public.kd_ai_auftrag_starten(
    p_account_id,'radar-websearch',p_operation_id,'klein',
    'radar-websearch-v1',null,p_reservierung
  );
end
$$;

revoke all on function public.kd_radar_person_target_metadata_valid(text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.kd_guard_radar_person_subscription()
  from public, anon, authenticated;
revoke all on function public.kd_radar_pilot_set_subscription(text,text,text,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.kd_radar_websearch_context(uuid,text)
  from public, anon, authenticated;
revoke all on function public.kd_radar_websearch_upsert_person_event(uuid,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.kd_radar_pilot_feed(uuid[])
  from public, anon, authenticated;
revoke all on function public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer)
  from public, anon, authenticated;

grant execute on function public.kd_radar_person_target_metadata_valid(text,text,jsonb)
  to service_role;
grant execute on function public.kd_guard_radar_person_subscription()
  to service_role;
grant execute on function public.kd_radar_pilot_set_subscription(text,text,text,uuid,text,text)
  to authenticated, service_role;
grant execute on function public.kd_radar_websearch_context(uuid,text)
  to service_role;
grant execute on function public.kd_radar_websearch_upsert_person_event(uuid,uuid,jsonb)
  to service_role;
grant execute on function public.kd_radar_pilot_feed(uuid[])
  to authenticated, service_role;
grant execute on function public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer)
  to service_role;

comment on function public.kd_radar_websearch_upsert_person_event(uuid,uuid,jsonb) is
  'Persistiert einen kuratiert gematchten Personenfund in vorhandene Werk-/Event-/Evidenz-Primitiven und bindet ihn accountbezogen ueber den bestehenden Operationsweg an den Feed.';

commit;
