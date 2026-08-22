-- Kinodreieck · Radar-Titelgruppen (additive Forward-Migration)
-- =============================================================================
-- Persistiert eine nicht-kanonische, versionierte Suchgruppe als genau ein
-- Radarziel. Die Gruppe enthält ausschließlich konkrete starke Werk-IDs; der
-- Provider sieht nur diese Mitglieder und der Eventwrite validiert jedes Werk
-- erneut. Aktiviert weder Radar-/Providerflags noch Scheduler oder Abos.
-- =============================================================================

begin;

create function public.kd_radar_title_group_metadata_valid(
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
       or (v_item ->> 'targetId') !~ '^(watchmode|catalog):[^[:space:]]{1,150}$'
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

alter function public.kd_radar_pilot_feed(uuid[])
  rename to kd_radar_pilot_feed_person_internal;
revoke all on function public.kd_radar_pilot_feed_person_internal(uuid[])
  from public, anon, authenticated;
grant execute on function public.kd_radar_pilot_feed_person_internal(uuid[])
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
  v_group_events jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
begin
  v_feed := public.kd_radar_pilot_feed_person_internal(p_operation_ids);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'targetId',t.target_key, 'targetType',t.target_type,
      'title',t.canonical_title, 'region',s.region, 'scope',s.scope,
      'status',s.subscription_status, 'updatedAt',s.updated_at
    ) || case
      when t.target_type = 'person' then jsonb_build_object(
        'personExternalId',s.person_external_id, 'personRole',s.person_role
      )
      when t.target_type = 'franchise' and t.target_key ~ '^title-group:v1:' then
        jsonb_build_object('titleGroup',t.external_ids -> 'titleGroup')
      else '{}'::jsonb end
    order by t.canonical_title,t.target_key
  ), '[]'::jsonb) into v_subscriptions
  from public.kd_radar_subscriptions s
  join public.kd_radar_targets t on t.target_id = s.target_id
  where s.account_id = v_actor_id;

  with group_versions as (
    select distinct v.event_version_id, e.event_id, wt.target_key, e.event_type,
           v.event_date, e.region, e.platform, e.season_number,
           e.lifecycle_status, v.verification_status
    from public.kd_radar_subscriptions gs
    join public.kd_radar_targets gt on gt.target_id = gs.target_id
    join lateral jsonb_array_elements(
      case when gt.target_type = 'franchise'
        then coalesce(gt.external_ids #> '{titleGroup,members}', '[]'::jsonb)
        else '[]'::jsonb end
    ) member(item) on true
    join public.kd_radar_targets wt on wt.target_key = member.item ->> 'targetId'
    join public.kd_radar_events e on e.target_id = wt.target_id
    join public.kd_radar_event_versions v
      on v.event_version_id = e.current_confirmed_version_id and v.event_id = e.event_id
    where gs.account_id = v_actor_id
      and gs.subscription_status = 'active' and gs.region = 'AT' and gs.scope = 'all'
      and gs.person_external_id is null and gs.person_role is null
      and gt.target_type = 'franchise' and gt.target_status = 'active'
      and gt.target_key ~ '^title-group:v1:'
      and public.kd_radar_title_group_metadata_valid(
        gt.target_key,gt.canonical_title,gt.external_ids -> 'titleGroup'
      )
      and member.item ->> 'targetType' = wt.target_type
      and member.item ->> 'title' = wt.canonical_title
      and member.item ->> 'year' = wt.external_ids ->> 'releaseYear'
      and v.verification_status = 'confirmed'
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'eventId',gv.event_id, 'eventVersionId',gv.event_version_id,
      'targetId',gv.target_key, 'eventType',gv.event_type,
      'date',gv.event_date, 'region',gv.region, 'platform',gv.platform,
      'lifecycleStatus',gv.lifecycle_status,
      'verificationStatus',gv.verification_status,
      'evidence',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'sourceId',ev.source_id, 'sourceDomain',rs.domain,
          'url',ev.canonical_url, 'retrievedAt',ev.retrieved_at
        ) order by ev.source_id,ev.canonical_url,ev.retrieved_at), '[]'::jsonb)
        from public.kd_radar_evidence ev
        join public.kd_radar_sources rs on rs.source_id = ev.source_id
        where ev.event_version_id = gv.event_version_id
      )
    ) || case when gv.season_number is null then '{}'::jsonb
      else jsonb_build_object('seasonNumber',gv.season_number) end
    order by gv.event_date,gv.target_key,gv.event_version_id
  ), '[]'::jsonb) into v_group_events
  from group_versions gv;

  select coalesce(jsonb_agg(item.value order by item.value ->> 'date', item.value ->> 'targetId'), '[]'::jsonb)
    into v_events
    from (
      select distinct on (candidate.value ->> 'eventVersionId') candidate.value
      from jsonb_array_elements(coalesce(v_feed -> 'events','[]'::jsonb) || v_group_events) candidate(value)
      order by candidate.value ->> 'eventVersionId'
    ) item;

  return jsonb_set(
    jsonb_set(v_feed, '{subscriptions}', v_subscriptions, false),
    '{events}', v_events, false
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
        or
        (t.target_type = 'franchise' and s.scope = 'all'
         and s.person_external_id is null and s.person_role is null
         and t.target_key ~ '^title-group:v1:'
         and public.kd_radar_title_group_metadata_valid(
           t.target_key,t.canonical_title,t.external_ids -> 'titleGroup'
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

alter table public.kd_radar_targets
  add constraint kd_radar_title_group_target_contract
  check (
    target_key !~ '^title-group:v1:'
    or (
      target_type = 'franchise'
      and target_status = 'active'
      and jsonb_typeof(external_ids -> 'titleGroup') = 'object'
      and external_ids = jsonb_build_object('titleGroup', external_ids -> 'titleGroup')
      and public.kd_radar_title_group_metadata_valid(
        target_key, canonical_title, external_ids -> 'titleGroup'
      )
    )
  ) not valid;
alter table public.kd_radar_targets
  validate constraint kd_radar_title_group_target_contract;

create function public.kd_radar_pilot_set_title_group(
  p_target_key text,
  p_scope text,
  p_status text,
  p_operation_id uuid,
  p_title_group jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_id uuid;
  v_item jsonb;
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
  if v_actor_id is null or p_operation_id is null
     or p_scope is distinct from 'all'
     or p_status not in ('active','paused','removed')
     or not public.kd_radar_title_group_metadata_valid(
       p_target_key, p_title_group ->> 'displayName', p_title_group
     ) then
    raise exception 'radar_title_group_request_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text, 0));
  v_request_hash := md5(
    'pilot-title-group|' || p_target_key || '|' || p_status || '|' || p_title_group::text
  );
  select o.request_hash, o.result into v_previous_hash, v_previous_result
    from public.kd_radar_operations o
   where o.account_id = v_actor_id and o.operation_id = p_operation_id;
  if found then
    if v_previous_hash is distinct from v_request_hash then
      raise exception 'radar_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  for v_item in select value from jsonb_array_elements(p_title_group -> 'members')
  loop
    insert into public.kd_radar_targets (
      target_key, target_type, target_status, canonical_title, external_ids
    ) values (
      v_item ->> 'targetId', v_item ->> 'targetType', 'active', v_item ->> 'title',
      jsonb_build_object('releaseYear', (v_item ->> 'year')::integer)
    ) on conflict (target_key) do nothing;

    perform 1 from public.kd_radar_targets t
     where t.target_key = v_item ->> 'targetId'
       and t.target_type = v_item ->> 'targetType'
       and t.target_status = 'active'
       and t.canonical_title = v_item ->> 'title'
       and t.external_ids ->> 'releaseYear' = v_item ->> 'year'
     for key share;
    if not found then
      raise exception 'radar_title_group_member_drift' using errcode = '23514';
    end if;
  end loop;

  insert into public.kd_radar_targets as target (
    target_key, target_type, target_status, canonical_title, external_ids
  ) values (
    p_target_key, 'franchise', 'active', p_title_group ->> 'displayName',
    jsonb_build_object('titleGroup', p_title_group)
  ) on conflict (target_key) do update
    set canonical_title = excluded.canonical_title,
        external_ids = excluded.external_ids,
        updated_at = now()
    where target.target_type = 'franchise'
      and target.target_status = 'active'
      and target.external_ids #>> '{titleGroup,queryVersion}' = p_title_group ->> 'queryVersion'
      and target.external_ids #>> '{titleGroup,queryKey}' = p_title_group ->> 'queryKey'
  returning target_id into v_target_id;
  if v_target_id is null then
    raise exception 'radar_title_group_target_drift' using errcode = '23514';
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
      v_revision, p_operation_id, null, null, now(), now()
    )
    on conflict (account_id, target_id) do update
      set region = 'AT', scope = 'all',
          subscription_status = excluded.subscription_status,
          server_revision = excluded.server_revision,
          last_operation_id = excluded.last_operation_id,
          person_external_id = null, person_role = null,
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

  select case
    when t.target_type = 'person' then jsonb_build_object(
      'kind','person', 'targetId',t.target_key,
      'personExternalId',s.person_external_id,
      'canonicalName',t.canonical_title, 'role',s.person_role,
      'region','AT', 'windowStart',v_today::text,
      'windowEnd',(v_today + 6)::text, 'catalog',t.external_ids -> 'catalog'
    )
    when t.target_type = 'franchise' and t.target_key ~ '^title-group:v1:' then jsonb_build_object(
      'kind','title_group', 'targetId',t.target_key,
      'queryVersion',t.external_ids #>> '{titleGroup,queryVersion}',
      'queryKey',t.external_ids #>> '{titleGroup,queryKey}',
      'displayName',t.external_ids #>> '{titleGroup,displayName}',
      'region','AT', 'catalog',t.external_ids #> '{titleGroup,members}'
    )
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

-- Der historische Werk-Upsert besitzt in seiner source_state_basis genau eine
-- auf PG17 mehrdeutig geparste JSONB-Verkettung. Historische Migrationen
-- bleiben unverändert; diese Forward-Korrektur ersetzt ausschließlich die
-- belegte Ausdrucksfolge und stoppt bei jeder unbekannten Funktionsdrift.
do $core_forward_repair$
declare
  v_definition text;
  v_buggy text := $buggy$item.value ->> 'sourceId' || '|' || item.value ->> 'url'$buggy$;
  v_fixed text := $fixed$(item.value ->> 'sourceId') || '|' || (item.value ->> 'url')$fixed$;
begin
  select pg_get_functiondef(
    'public.kd_radar_websearch_upsert_event(uuid,uuid,jsonb)'::regprocedure
  ) into v_definition;
  if position(v_buggy in v_definition) > 0
     and position(v_fixed in v_definition) = 0 then
    v_definition := replace(v_definition, v_buggy, v_fixed);
    if position(v_buggy in v_definition) > 0
       or position(v_fixed in v_definition) = 0 then
      raise exception 'radar_websearch_core_forward_repair_failed' using errcode = '23514';
    end if;
    execute v_definition;
  elsif position(v_buggy in v_definition) = 0
        and position(v_fixed in v_definition) > 0 then
    null;
  else
    raise exception 'radar_websearch_core_definition_drift' using errcode = '23514';
  end if;
end
$core_forward_repair$;

create function public.kd_radar_websearch_upsert_title_group_event(
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
  v_target_key text := p_payload ->> 'targetKey';
  v_group_target_key text := p_payload ->> 'titleGroupTargetKey';
  v_query_version text := p_payload ->> 'queryVersion';
  v_query_key text := p_payload ->> 'queryKey';
  v_display_name text := p_payload ->> 'displayName';
  v_work_target_type text := p_payload ->> 'workTargetType';
  v_work_title text := p_payload ->> 'workTitle';
  v_work_year integer;
  v_checked_at_text text := p_payload ->> 'checkedAt';
  v_checked_at timestamptz;
  v_evidence_item jsonb;
  v_retrieved_at timestamptz;
  v_work_target_id uuid;
  v_direct_status text;
  v_direct_inserted boolean := false;
  v_direct_paused boolean := false;
  v_revision bigint;
  v_inner_hash text;
  v_inner_operation_id uuid;
  v_base_payload jsonb;
  v_request_hash text;
  v_previous_hash text;
  v_previous_result jsonb;
  v_core_result jsonb;
  v_result jsonb;
begin
  if p_account_id is null or p_operation_id is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'radar_title_group_upsert_invalid' using errcode = '22023';
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
  if v_root_key_count <> 15
     or not (p_payload ?& array[
       'targetKey','eventType','date','region','platform','seasonNumber','evidence',
       'titleGroupTargetKey','queryVersion','queryKey','displayName',
       'workTargetType','workTitle','workYear','checkedAt'
     ])
     or jsonb_typeof(p_payload -> 'titleGroupTargetKey') <> 'string'
     or jsonb_typeof(p_payload -> 'queryVersion') <> 'string'
     or jsonb_typeof(p_payload -> 'queryKey') <> 'string'
     or jsonb_typeof(p_payload -> 'displayName') <> 'string'
     or jsonb_typeof(p_payload -> 'workTargetType') <> 'string'
     or jsonb_typeof(p_payload -> 'workTitle') <> 'string'
     or jsonb_typeof(p_payload -> 'workYear') <> 'number'
     or jsonb_typeof(p_payload -> 'checkedAt') <> 'string'
     or jsonb_typeof(p_payload -> 'evidence') <> 'array'
     or (p_payload ->> 'workYear') !~ '^[0-9]{4}$'
     or v_checked_at_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$' then
    raise exception 'radar_title_group_payload_invalid' using errcode = '22023';
  end if;
  v_work_year := (p_payload ->> 'workYear')::integer;
  v_checked_at := v_checked_at_text::timestamptz;
  if not isfinite(v_checked_at) or v_work_year not between 1888 and 2100
     or v_work_target_type not in ('work','series')
     or v_query_version is distinct from 'title-group-query-v1'
     or v_group_target_key is distinct from 'title-group:v1:' || replace(v_query_key, ' ', '-')
     or v_target_key !~ '^(watchmode|catalog):[^[:space:]]{1,150}$'
     or btrim(v_work_title) = '' or btrim(v_display_name) = '' then
    raise exception 'radar_title_group_contract_invalid' using errcode = '22023';
  end if;

  for v_evidence_item in select value from jsonb_array_elements(p_payload -> 'evidence')
  loop
    if jsonb_typeof(v_evidence_item) <> 'object'
       or jsonb_typeof(v_evidence_item -> 'retrievedAt') <> 'string' then
      raise exception 'radar_title_group_evidence_invalid' using errcode = '22023';
    end if;
    v_retrieved_at := (v_evidence_item ->> 'retrievedAt')::timestamptz;
    if not isfinite(v_retrieved_at) or v_retrieved_at > v_checked_at then
      raise exception 'radar_title_group_evidence_time_invalid' using errcode = '23514';
    end if;
  end loop;

  select wt.target_id into v_work_target_id
    from public.kd_radar_subscriptions gs
    join public.kd_radar_targets gt on gt.target_id = gs.target_id
    join lateral jsonb_array_elements(
      coalesce(gt.external_ids #> '{titleGroup,members}', '[]'::jsonb)
    ) member(item) on true
    join public.kd_radar_targets wt on wt.target_key = member.item ->> 'targetId'
   where gs.account_id = p_account_id
     and gs.subscription_status = 'active' and gs.region = 'AT' and gs.scope = 'all'
     and gs.person_external_id is null and gs.person_role is null
     and gt.target_key = v_group_target_key and gt.target_type = 'franchise'
     and gt.target_status = 'active'
     and gt.canonical_title = v_display_name
     and gt.external_ids #>> '{titleGroup,queryVersion}' = v_query_version
     and gt.external_ids #>> '{titleGroup,queryKey}' = v_query_key
     and public.kd_radar_title_group_metadata_valid(
       gt.target_key, gt.canonical_title, gt.external_ids -> 'titleGroup'
     )
     and member.item ->> 'targetId' = v_target_key
     and member.item ->> 'targetType' = v_work_target_type
     and member.item ->> 'title' = v_work_title
     and (member.item ->> 'year')::integer = v_work_year
     and wt.target_type = v_work_target_type and wt.target_status = 'active'
     and wt.canonical_title = v_work_title
     and wt.external_ids ->> 'releaseYear' = v_work_year::text
   for key share of gs, gt, wt;
  if not found then
    raise exception 'radar_title_group_member_unavailable' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));
  v_request_hash := md5(p_payload::text);
  select o.request_hash, o.result into v_previous_hash, v_previous_result
    from public.kd_radar_operations o
   where o.account_id = p_account_id and o.operation_id = p_operation_id;
  if found then
    if v_previous_hash is distinct from v_request_hash then
      raise exception 'radar_websearch_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  select s.subscription_status into v_direct_status
    from public.kd_radar_subscriptions s
   where s.account_id = p_account_id and s.target_id = v_work_target_id
   for update;
  if not found then
    select greatest(coalesce(a.revision, 0), 1) into v_revision
      from public.kd_radar_account_state a where a.account_id = p_account_id;
    v_revision := coalesce(v_revision, 1);
    insert into public.kd_radar_subscriptions (
      account_id,target_id,region,scope,subscription_status,server_revision,
      last_operation_id,person_external_id,person_role,created_at,updated_at
    ) values (
      p_account_id,v_work_target_id,'AT','all','active',v_revision,
      p_operation_id,null,null,now(),now()
    );
    v_direct_inserted := true;
  elsif v_direct_status = 'paused' then
    update public.kd_radar_subscriptions
       set subscription_status = 'active'
     where account_id = p_account_id and target_id = v_work_target_id;
    v_direct_paused := true;
  end if;

  v_base_payload := jsonb_build_object(
    'targetKey',p_payload -> 'targetKey', 'eventType',p_payload -> 'eventType',
    'date',p_payload -> 'date', 'region',p_payload -> 'region',
    'platform',p_payload -> 'platform', 'seasonNumber',p_payload -> 'seasonNumber',
    'evidence',p_payload -> 'evidence'
  );
  v_inner_hash := md5(p_operation_id::text || '|title-group-inner|' || v_group_target_key);
  v_inner_operation_id := (
    substr(v_inner_hash,1,8) || '-' || substr(v_inner_hash,9,4) || '-4' ||
    substr(v_inner_hash,14,3) || '-8' || substr(v_inner_hash,18,3) || '-' ||
    substr(v_inner_hash,21,12)
  )::uuid;
  v_core_result := public.kd_radar_websearch_upsert_event(
    p_account_id, v_inner_operation_id, v_base_payload
  );

  if v_direct_inserted then
    delete from public.kd_radar_subscriptions
     where account_id = p_account_id and target_id = v_work_target_id;
  elsif v_direct_paused then
    update public.kd_radar_subscriptions
       set subscription_status = 'paused'
     where account_id = p_account_id and target_id = v_work_target_id;
  end if;

  v_result := v_core_result || jsonb_build_object(
    'format','kd-radar-title-group-event-v1',
    'titleGroupTargetKey',v_group_target_key,
    'queryVersion',v_query_version, 'queryKey',v_query_key,
    'displayName',v_display_name, 'workTargetKey',v_target_key,
    'workTargetType',v_work_target_type, 'workTitle',v_work_title,
    'workYear',v_work_year, 'checkedAt',v_checked_at_text
  );
  insert into public.kd_radar_operations (
    account_id,operation_id,request_hash,result,terminal_at,created_at
  ) values (
    p_account_id,p_operation_id,v_request_hash,v_result,now(),now()
  );
  return v_result;
end
$$;

revoke all on function public.kd_radar_title_group_metadata_valid(text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.kd_radar_pilot_set_title_group(text,text,text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.kd_radar_websearch_upsert_title_group_event(uuid,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.kd_radar_pilot_feed(uuid[])
  from public, anon, authenticated;

grant execute on function public.kd_radar_title_group_metadata_valid(text,text,jsonb)
  to service_role;
grant execute on function public.kd_radar_pilot_set_title_group(text,text,text,uuid,jsonb)
  to authenticated, service_role;
grant execute on function public.kd_radar_websearch_upsert_title_group_event(uuid,uuid,jsonb)
  to service_role;
grant execute on function public.kd_radar_pilot_feed(uuid[])
  to authenticated, service_role;

comment on function public.kd_radar_pilot_set_title_group(text,text,text,uuid,jsonb) is
  'Persistiert eine versionierte Suchgruppe als ein Radarziel und validiert alle konkreten Mitglieder erneut.';
comment on function public.kd_radar_websearch_upsert_title_group_event(uuid,uuid,jsonb) is
  'Expandiert einen validierten Titelgruppenfund auf genau ein konkretes Mitglied und delegiert dessen Evidence-Upsert an den bestehenden Werkvertrag.';

commit;
