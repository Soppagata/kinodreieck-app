-- Kinodreieck · Radar-Websearch-MVP · Paket A (lokaler Mock-Durchstich)
-- =============================================================================
-- STATUS: NUR LOKAL VORBEREITET. NICHT REMOTE ANGEWANDT.
--
-- Diese additive Migration aktiviert weder Radar noch Provider oder Scheduler.
-- Sie gibt einer authentifizierten Function genau zwei service-role-Grenzen:
-- den globalen Kontext eines aktiven Max-Ziels und den deterministischen
-- Event-/Versions-/Evidenz-Upsert. Der bestehende Pilot-Feed bleibt die
-- Nutzerprojektion.
-- =============================================================================

begin;

alter table public.kd_radar_events
  add column season_number integer;

alter table public.kd_radar_events
  add constraint kd_radar_event_season_contract
  check (
    (event_type = 'staffelstart' and season_number between 1 and 999)
    or (event_type <> 'staffelstart' and season_number is null)
  ) not valid;

comment on column public.kd_radar_events.season_number is
  'Stabile Staffelidentitaet fuer staffelstart; kein Datum und keine Providerkennung.';

-- Eine passende offizielle Primaerquelle reicht aus. Ohne offizielle Quelle
-- bleiben zwei unabhaengige freigegebene Publisherfamilien Pflicht.
create or replace function public.kd_guard_radar_event_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_family_count   integer := 0;
  v_official_count integer := 0;
begin
  if tg_op = 'UPDATE' and (
    new.event_id is distinct from old.event_id
    or new.event_date is distinct from old.event_date
    or new.date_precision is distinct from old.date_precision
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'radar_event_version_identity_immutable' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.verification_status = 'confirmed'
     and new.verification_status <> 'confirmed' then
    raise exception 'radar_confirmed_version_immutable' using errcode = '55000';
  end if;

  if new.verification_status in ('corroborated','confirmed') then
    select count(distinct ev.publisher_family),
           count(*) filter (where ev.source_class = 'official')
      into v_family_count, v_official_count
      from public.kd_radar_evidence ev
      join public.kd_radar_sources s on s.source_id = ev.source_id
     where ev.event_version_id = new.event_version_id
       and ev.publisher_family = s.publisher_family
       and ev.source_class = s.source_class
       and ev.source_class in ('official','editorial')
       and s.active and s.rights_status = 'approved' and s.attribution_approved;
  end if;
  if new.verification_status = 'corroborated'
     and v_family_count < 1 then
    raise exception 'radar_corroboration_evidence_insufficient' using errcode = '23514';
  end if;
  if new.verification_status = 'confirmed'
     and v_official_count < 1 and v_family_count < 2 then
    raise exception 'radar_confirmation_evidence_insufficient' using errcode = '23514';
  end if;
  return new;
end
$$;

-- Liefert ausschließlich globale Zieldaten. Die Account-ID dient nur der
-- serverseitigen Autorisierung und wird nicht Teil des JSON-Ergebnisses.
create function public.kd_radar_websearch_context(
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
begin
  if p_account_id is null or p_target_key is null or btrim(p_target_key) = '' then
    raise exception 'radar_websearch_context_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.kd_account_access a
      join public.kd_radar_capabilities c on c.account_id = a.account_id
     where a.account_id = p_account_id
       and a.active and a.personal_ai
       and c.radar_pilot and c.radar_review
  ) then
    raise exception 'radar_websearch_forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'targetId', t.target_key,
           'canonicalTitle', t.canonical_title,
           'mediaType', case t.target_type when 'series' then 'series' else 'film' end,
           'region', 'AT',
           'scopes', case
             when t.target_type = 'series' then jsonb_build_array('streaming','series_start','season_start')
             when s.scope = 'cinema' then jsonb_build_array('cinema')
             when s.scope = 'streaming' then jsonb_build_array('streaming')
             else jsonb_build_array('cinema','streaming')
           end
         )
    into v_context
    from public.kd_radar_subscriptions s
    join public.kd_radar_targets t on t.target_id = s.target_id
   where s.account_id = p_account_id
     and s.subscription_status = 'active'
     and s.region = 'AT'
     and t.target_key = p_target_key
     and t.target_key !~* '^(fixture|synthetic):'
     and t.target_status = 'active'
     and t.target_type in ('work','series')
     and not (t.target_type = 'series' and s.scope = 'cinema');

  if v_context is null then
    raise exception 'radar_websearch_target_unavailable' using errcode = '42501';
  end if;
  return v_context;
end
$$;

-- Deterministischer Upsert in die vorhandenen Radar-Tabellen. Der Payload ist
-- bereits durch den Function-Validator auf Ziel, AT, Datum und Evidenz
-- reduziert. Quellenklasse und Publisherfamilie werden erneut aus dem
-- serverseitigen Register gelesen und niemals aus der Anbieterantwort vertraut.
create function public.kd_radar_websearch_upsert_event(
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
  v_request_hash         text;
  v_previous_hash        text;
  v_previous_result      jsonb;
  v_root_key_count       integer;
  v_evidence_key_count   integer;
  v_evidence_count       integer;
  v_evidence_item        jsonb;
  v_source_ids           text[] := array[]::text[];
  v_source_count         integer := 0;
  v_family_count         integer := 0;
  v_official_count       integer := 0;
  v_target_key           text := p_payload ->> 'targetKey';
  v_event_type           text := p_payload ->> 'eventType';
  v_date_text            text := p_payload ->> 'date';
  v_region               text := p_payload ->> 'region';
  v_platform             text := p_payload ->> 'platform';
  v_season_number        integer;
  v_event_date           date;
  v_target_id            uuid;
  v_target_type          text;
  v_subscription_scope   text;
  v_event_key            text;
  v_event_id             uuid;
  v_current_version_id   uuid;
  v_event_version_id     uuid := gen_random_uuid();
  v_current_date         date;
  v_current_source_hash  text;
  v_source_state_basis   text;
  v_source_state_hash    text;
  v_publisher_family     text;
  v_source_class         text;
  v_retrieved_at         timestamptz;
  v_result               jsonb;
begin
  if p_account_id is null or p_operation_id is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'radar_websearch_upsert_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.kd_account_access a
      join public.kd_radar_capabilities c on c.account_id = a.account_id
     where a.account_id = p_account_id
       and a.active and a.personal_ai
       and c.radar_pilot and c.radar_review
  ) then
    raise exception 'radar_websearch_forbidden' using errcode = '42501';
  end if;

  select count(*) into v_root_key_count
    from jsonb_object_keys(p_payload) as root_key(key_name);
  if v_root_key_count <> 7
     or not (p_payload ?& array[
       'targetKey','eventType','date','region','platform','seasonNumber','evidence'
     ])
     or jsonb_typeof(p_payload -> 'targetKey') <> 'string'
     or jsonb_typeof(p_payload -> 'eventType') <> 'string'
     or jsonb_typeof(p_payload -> 'date') <> 'string'
     or jsonb_typeof(p_payload -> 'region') <> 'string'
     or jsonb_typeof(p_payload -> 'platform') <> 'string'
     or jsonb_typeof(p_payload -> 'evidence') <> 'array' then
    raise exception 'radar_websearch_payload_invalid' using errcode = '22023';
  end if;
  v_evidence_count := jsonb_array_length(p_payload -> 'evidence');
  if v_evidence_count < 1 or v_evidence_count > 2 then
    raise exception 'radar_websearch_evidence_invalid' using errcode = '22023';
  end if;
  if v_target_key is null or btrim(v_target_key) = ''
     or v_event_type not in ('kinostart_at','streamingstart_at','serienstart','staffelstart')
     or v_region is distinct from 'AT'
     or v_date_text is null or v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'radar_websearch_event_invalid' using errcode = '22023';
  end if;
  v_event_date := v_date_text::date;
  if to_char(v_event_date, 'YYYY-MM-DD') <> v_date_text then
    raise exception 'radar_websearch_date_invalid' using errcode = '22023';
  end if;
  if v_event_type = 'streamingstart_at' then
    if v_platform is null or btrim(v_platform) = '' or v_platform = '-' then
      raise exception 'radar_websearch_platform_invalid' using errcode = '22023';
    end if;
  elsif v_platform is distinct from '-' then
    raise exception 'radar_websearch_platform_invalid' using errcode = '22023';
  end if;
  if v_event_type = 'staffelstart' then
    if jsonb_typeof(p_payload -> 'seasonNumber') <> 'number'
       or (p_payload ->> 'seasonNumber') !~ '^[0-9]+$' then
      raise exception 'radar_websearch_season_invalid' using errcode = '22023';
    end if;
    v_season_number := (p_payload ->> 'seasonNumber')::integer;
    if v_season_number < 1 or v_season_number > 999 then
      raise exception 'radar_websearch_season_invalid' using errcode = '22023';
    end if;
  elsif jsonb_typeof(p_payload -> 'seasonNumber') <> 'null' then
    raise exception 'radar_websearch_season_invalid' using errcode = '22023';
  end if;

  for v_evidence_item in
    select evidence_item.value
      from jsonb_array_elements(p_payload -> 'evidence') as evidence_item(value)
  loop
    if jsonb_typeof(v_evidence_item) <> 'object' then
      raise exception 'radar_websearch_evidence_item_invalid' using errcode = '22023';
    end if;
    select count(*) into v_evidence_key_count
      from jsonb_object_keys(v_evidence_item) as evidence_key(key_name);
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
    if not isfinite(v_retrieved_at) then
      raise exception 'radar_websearch_evidence_time_invalid' using errcode = '22023';
    end if;
    v_source_ids := array_append(v_source_ids, v_evidence_item ->> 'sourceId');
  end loop;
  if (select count(distinct source_id) from unnest(v_source_ids) source_id) <> v_evidence_count then
    raise exception 'radar_websearch_source_duplicate' using errcode = '23514';
  end if;

  perform 1 from public.kd_radar_sources s
   where s.source_id = any(v_source_ids)
   for key share;
  select count(distinct s.source_id), count(distinct s.publisher_family),
         count(*) filter (where s.source_class = 'official')
    into v_source_count, v_family_count, v_official_count
    from public.kd_radar_sources s
   where s.source_id = any(v_source_ids)
     and s.active and s.rights_status = 'approved' and s.attribution_approved
     and s.source_class in ('official','editorial');
  if v_source_count <> v_evidence_count
     or (v_official_count < 1 and v_family_count < 2) then
    raise exception 'radar_websearch_sources_insufficient' using errcode = '23514';
  end if;

  select t.target_id, t.target_type, s.scope
    into v_target_id, v_target_type, v_subscription_scope
    from public.kd_radar_subscriptions s
    join public.kd_radar_targets t on t.target_id = s.target_id
   where s.account_id = p_account_id
     and s.subscription_status = 'active'
     and s.region = 'AT'
     and t.target_key = v_target_key
     and t.target_key !~* '^(fixture|synthetic):'
     and t.target_status = 'active'
     and t.target_type in ('work','series')
   for key share of s, t;
  if not found then
    raise exception 'radar_websearch_target_unavailable' using errcode = '42501';
  end if;
  if (v_target_type = 'work' and v_event_type in ('serienstart','staffelstart'))
     or (v_target_type = 'series' and v_event_type = 'kinostart_at')
     or (v_target_type = 'work' and v_subscription_scope = 'cinema'
         and v_event_type <> 'kinostart_at')
     or (v_target_type = 'work' and v_subscription_scope = 'streaming'
         and v_event_type <> 'streamingstart_at') then
    raise exception 'radar_websearch_event_outside_subscription' using errcode = '23514';
  end if;

  v_request_hash := md5(p_payload::text);
  perform pg_advisory_xact_lock(hashtextextended(
    p_account_id::text || '|' || p_operation_id::text, 0
  ));
  select o.request_hash, o.result
    into v_previous_hash, v_previous_result
    from public.kd_radar_operations o
   where o.account_id = p_account_id and o.operation_id = p_operation_id;
  if found then
    if v_previous_hash is distinct from v_request_hash then
      raise exception 'radar_websearch_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  select string_agg(
           item.value ->> 'sourceId' || '|' || item.value ->> 'url',
           '|' order by item.value ->> 'sourceId', item.value ->> 'url'
         )
    into v_source_state_basis
    from jsonb_array_elements(p_payload -> 'evidence') as item(value);
  v_source_state_hash := md5(v_source_state_basis)
    || md5('radar-websearch-v1|' || v_source_state_basis);
  v_event_key := v_target_key || '|' || v_event_type || '|AT|' || v_platform
    || '|' || coalesce(v_season_number::text, '-');
  perform pg_advisory_xact_lock(hashtextextended(v_event_key, 0));

  select e.event_id, e.current_confirmed_version_id
    into v_event_id, v_current_version_id
    from public.kd_radar_events e
   where e.event_key = v_event_key
     and e.target_id = v_target_id
     and e.event_type = v_event_type
     and e.region = 'AT'
     and e.platform = v_platform
     and e.season_number is not distinct from v_season_number
   for update;
  if not found then
    v_event_id := gen_random_uuid();
    insert into public.kd_radar_events (
      event_id, event_key, target_id, event_type, region, platform,
      season_number, lifecycle_status, created_at, updated_at
    ) values (
      v_event_id, v_event_key, v_target_id, v_event_type, 'AT', v_platform,
      v_season_number, 'scheduled', now(), now()
    );
    v_current_version_id := null;
  end if;

  if v_current_version_id is not null then
    select v.event_date, v.source_state_hash
      into v_current_date, v_current_source_hash
      from public.kd_radar_event_versions v
     where v.event_version_id = v_current_version_id
       and v.event_id = v_event_id
       and v.verification_status = 'confirmed';
  end if;
  if v_current_date = v_event_date
     and v_current_source_hash = v_source_state_hash then
    v_result := jsonb_build_object(
      'status', 'no_change',
      'eventId', v_event_id,
      'eventVersionId', v_current_version_id
    );
    insert into public.kd_radar_operations (
      account_id, operation_id, request_hash, result, terminal_at, created_at
    ) values (
      p_account_id, p_operation_id, v_request_hash, v_result, now(), now()
    );
    return v_result;
  end if;

  insert into public.kd_radar_event_versions (
    event_version_id, event_id, event_date, date_precision,
    verification_status, created_at
  ) values (
    v_event_version_id, v_event_id, v_event_date, 'day', 'candidate', now()
  );

  for v_evidence_item in
    select evidence_item.value
      from jsonb_array_elements(p_payload -> 'evidence') as evidence_item(value)
  loop
    select s.publisher_family, s.source_class
      into v_publisher_family, v_source_class
      from public.kd_radar_sources s
     where s.source_id = v_evidence_item ->> 'sourceId'
       and s.active and s.rights_status = 'approved' and s.attribution_approved
       and s.source_class in ('official','editorial');
    if not found then
      raise exception 'radar_websearch_source_unavailable' using errcode = '23514';
    end if;
    v_retrieved_at := (v_evidence_item ->> 'retrievedAt')::timestamptz;
    insert into public.kd_radar_evidence (
      event_version_id, source_id, canonical_url, publisher_family,
      source_class, claimed_date, event_type, region, platform,
      fingerprint, retrieved_at, created_at
    ) values (
      v_event_version_id,
      v_evidence_item ->> 'sourceId',
      v_evidence_item ->> 'url',
      v_publisher_family,
      v_source_class,
      v_event_date,
      v_event_type,
      'AT',
      v_platform,
      md5((v_evidence_item ->> 'sourceId') || '|' || (v_evidence_item ->> 'url') || '|' || v_event_date::text)
        || md5('radar-websearch-evidence-v1|' || (v_evidence_item ->> 'sourceId') || '|' || (v_evidence_item ->> 'url') || '|' || v_event_date::text),
      v_retrieved_at,
      now()
    );
  end loop;

  update public.kd_radar_event_versions v
     set verification_status = 'confirmed',
         source_state_hash = v_source_state_hash,
         last_verified_at = now()
   where v.event_version_id = v_event_version_id;
  update public.kd_radar_events e
     set current_candidate_version_id = v_event_version_id,
         current_confirmed_version_id = v_event_version_id,
         updated_at = now()
   where e.event_id = v_event_id;

  v_result := jsonb_build_object(
    'status', 'confirmed',
    'eventId', v_event_id,
    'eventVersionId', v_event_version_id
  );
  insert into public.kd_radar_operations (
    account_id, operation_id, request_hash, result, terminal_at, created_at
  ) values (
    p_account_id, p_operation_id, v_request_hash, v_result, now(), now()
  );
  return v_result;
end
$$;

-- Die bisherige Feedlogik bleibt unverändert und wird nur um die gespeicherte
-- Staffelnummer ergänzt. Direkter Browserzugriff auf die interne Fassung wird
-- entzogen; die öffentliche Pilotsignatur bleibt kompatibel.
alter function public.kd_radar_pilot_feed(uuid[])
  rename to kd_radar_pilot_feed_v1_internal;

revoke all on function public.kd_radar_pilot_feed_v1_internal(uuid[])
  from public, anon, authenticated;
grant execute on function public.kd_radar_pilot_feed_v1_internal(uuid[])
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
  v_feed jsonb;
  v_events jsonb;
begin
  v_feed := public.kd_radar_pilot_feed_v1_internal(p_operation_ids);
  select coalesce(jsonb_agg(
           item.value || jsonb_build_object('seasonNumber', e.season_number)
           order by item.ordinality
         ), '[]'::jsonb)
    into v_events
    from jsonb_array_elements(v_feed -> 'events') with ordinality as item(value, ordinality)
    join public.kd_radar_events e
      on e.event_id = (item.value ->> 'eventId')::uuid;
  return jsonb_set(v_feed, '{events}', v_events, false);
end
$$;

revoke all on function public.kd_radar_websearch_context(uuid,text)
  from public, anon, authenticated;
revoke all on function public.kd_radar_websearch_upsert_event(uuid,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.kd_radar_pilot_feed(uuid[])
  from public, anon, authenticated;

grant execute on function public.kd_radar_websearch_context(uuid,text)
  to service_role;
grant execute on function public.kd_radar_websearch_upsert_event(uuid,uuid,jsonb)
  to service_role;
grant execute on function public.kd_radar_pilot_feed(uuid[])
  to authenticated, service_role;

commit;
