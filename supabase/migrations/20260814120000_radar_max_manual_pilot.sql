begin;

alter table public.kd_radar_capabilities
  add column radar_pilot boolean not null default false;

alter table public.kd_radar_capabilities
  add constraint kd_radar_review_requires_pilot
  check (not radar_review or radar_pilot);

create function public.kd_radar_pilot_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.kd_account_active() then
    return false;
  end if;

  return coalesce((
    select c.radar_pilot
      from public.kd_radar_capabilities c
     where c.account_id = v_actor_id
  ), false);
end
$$;

create function public.kd_radar_review_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.kd_radar_pilot_allowed() then
    return false;
  end if;

  return coalesce((
    select c.radar_review
      from public.kd_radar_capabilities c
     where c.account_id = v_actor_id
  ), false);
end
$$;

revoke all on function public.kd_radar_pilot_allowed()
  from public, anon, authenticated;
revoke all on function public.kd_radar_review_allowed()
  from public, anon, authenticated;

revoke execute on function public.kd_set_radar_subscription(uuid,text,text,uuid)
  from authenticated;
revoke execute on function public.kd_get_radar_feed()
  from authenticated;
revoke execute on function public.kd_set_radar_receipt(uuid,text)
  from authenticated;

create table public.kd_radar_pilot_import_operations (
  actor_id     uuid        not null references auth.users(id) on delete cascade,
  operation_id uuid        not null,
  request_hash text        not null check (request_hash ~ '^[a-f0-9]{32}$'),
  result       jsonb       not null check (jsonb_typeof(result) = 'object'),
  created_at   timestamptz not null default now(),
  constraint kd_radar_pilot_import_operations_pkey
    primary key (actor_id, operation_id)
);

alter table public.kd_radar_pilot_import_operations enable row level security;

revoke all on table public.kd_radar_pilot_import_operations
  from public, anon, authenticated;
grant all on table public.kd_radar_pilot_import_operations
  to service_role;

create function public.kd_radar_pilot_set_subscription(
  p_target_key text,
  p_scope text,
  p_status text,
  p_operation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id        uuid := auth.uid();
  v_target_id       uuid;
  v_request_hash    text;
  v_previous_hash   text;
  v_previous_result jsonb;
  v_unlimited       boolean := false;
  v_active_others   integer := 0;
  v_revision        bigint := 0;
  v_checksum        text;
  v_result          jsonb;
begin
  if not public.kd_radar_pilot_allowed() then
    raise exception 'radar_pilot_forbidden' using errcode = '42501';
  end if;
  if v_actor_id is null or p_target_key is null or p_operation_id is null
     or p_scope is null or p_scope not in ('all','cinema','streaming')
     or p_status is null or p_status not in ('active','paused','removed') then
    raise exception 'radar_pilot_request_invalid' using errcode = '22023';
  end if;

  select t.target_id
    into v_target_id
    from public.kd_radar_targets t
   where t.target_key = p_target_key
     and t.target_status = 'active'
   for key share;
  if not found then
    raise exception 'radar_target_unavailable' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text, 0));
  v_request_hash := md5('pilot-subscription|' || p_target_key || '|' || p_scope || '|' || p_status);

  select o.request_hash, o.result
    into v_previous_hash, v_previous_result
    from public.kd_radar_operations o
   where o.account_id = v_actor_id
     and o.operation_id = p_operation_id;
  if found then
    if v_previous_hash <> v_request_hash then
      raise exception 'radar_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  v_unlimited := coalesce((
    select c.radar_unlimited
      from public.kd_radar_capabilities c
     where c.account_id = v_actor_id
  ), false);

  if p_status = 'active' and not v_unlimited then
    select count(*)
      into v_active_others
      from public.kd_radar_subscriptions s
     where s.account_id = v_actor_id
       and s.subscription_status = 'active'
       and s.target_id <> v_target_id;
    if v_active_others >= 10 then
      raise exception 'radar_quota_exceeded' using errcode = '23514';
    end if;
  end if;

  insert into public.kd_radar_account_state (account_id, revision)
  values (v_actor_id, 0)
  on conflict (account_id) do nothing;

  select a.revision
    into v_revision
    from public.kd_radar_account_state a
   where a.account_id = v_actor_id
   for update;
  v_revision := v_revision + 1;

  if p_status = 'removed' then
    delete from public.kd_radar_subscriptions s
     where s.account_id = v_actor_id
       and s.target_id = v_target_id;
  else
    insert into public.kd_radar_subscriptions (
      account_id, target_id, region, scope, subscription_status,
      server_revision, last_operation_id, created_at, updated_at
    ) values (
      v_actor_id, v_target_id, 'AT', p_scope, p_status,
      v_revision, p_operation_id, now(), now()
    )
    on conflict (account_id, target_id) do update
      set region = 'AT',
          scope = excluded.scope,
          subscription_status = excluded.subscription_status,
          server_revision = excluded.server_revision,
          last_operation_id = excluded.last_operation_id,
          updated_at = now();
  end if;

  if p_status <> 'active' then
    delete from public.kd_radar_target_shares sh
     where sh.account_id = v_actor_id
       and sh.target_id = v_target_id;
  end if;
  if p_status = 'removed' then
    delete from public.kd_radar_receipts r
     using public.kd_radar_event_versions v, public.kd_radar_events e
     where r.account_id = v_actor_id
       and r.event_version_id = v.event_version_id
       and v.event_id = e.event_id
       and e.target_id = v_target_id;
  end if;

  v_checksum := public.kd_radar_account_checksum(v_actor_id);
  update public.kd_radar_account_state a
     set revision = v_revision,
         checksum = v_checksum,
         updated_at = now()
   where a.account_id = v_actor_id;

  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'targetId', p_target_key,
    'status', p_status,
    'revision', v_revision,
    'checksum', v_checksum
  );

  insert into public.kd_radar_operations (account_id, operation_id, request_hash, result)
  values (v_actor_id, p_operation_id, v_request_hash, v_result);
  return v_result;
end
$$;

create function public.kd_radar_pilot_set_receipt(
  p_event_version_id uuid,
  p_status text
) returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if not public.kd_radar_pilot_allowed() then
    raise exception 'radar_pilot_forbidden' using errcode = '42501';
  end if;
  if v_actor_id is null or p_event_version_id is null
     or p_status is null
     or p_status not in ('new','seen','dismissed','accepted_week','exported_ics') then
    raise exception 'radar_receipt_invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.kd_radar_event_versions v
      join public.kd_radar_events e on e.event_id = v.event_id
      join public.kd_radar_subscriptions s on s.target_id = e.target_id
     where v.event_version_id = p_event_version_id
       and v.verification_status = 'confirmed'
       and e.current_confirmed_version_id = p_event_version_id
       and e.lifecycle_status <> 'retracted'
       and s.account_id = v_actor_id
       and s.subscription_status = 'active'
  ) then
    raise exception 'radar_event_not_subscribed' using errcode = '42501';
  end if;

  insert into public.kd_radar_receipts (
    account_id, event_version_id, receipt_status, updated_at
  ) values (
    v_actor_id, p_event_version_id, p_status, now()
  )
  on conflict (account_id, event_version_id) do update
    set receipt_status = excluded.receipt_status,
        updated_at = excluded.updated_at;
end
$$;

create function public.kd_radar_pilot_import_event(
  p_operation_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id           uuid := auth.uid();
  v_request_hash       text;
  v_previous_hash      text;
  v_previous_result    jsonb;
  v_root_key_count     integer;
  v_evidence_key_count integer;
  v_evidence_item      jsonb;
  v_source_ids         text[] := array[]::text[];
  v_sources_valid      boolean := false;
  v_target_key         text := p_payload ->> 'targetKey';
  v_event_type         text := p_payload ->> 'eventType';
  v_date_text          text := p_payload ->> 'date';
  v_region             text := p_payload ->> 'region';
  v_platform           text := p_payload ->> 'platform';
  v_event_date         date;
  v_target_id          uuid;
  v_event_key          text;
  v_event_id           uuid := gen_random_uuid();
  v_event_version_id   uuid := gen_random_uuid();
  v_publisher_family   text;
  v_source_class       text;
  v_source_state_basis text;
  v_source_state_hash  text;
  v_retrieved_at       timestamptz;
  v_result             jsonb;
begin
  if not public.kd_radar_pilot_allowed()
     or not public.kd_radar_review_allowed() then
    raise exception 'radar_pilot_review_forbidden' using errcode = '42501';
  end if;
  if v_actor_id is null or p_operation_id is null
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'radar_import_invalid' using errcode = '22023';
  end if;

  v_request_hash := md5(p_payload::text);
  perform pg_advisory_xact_lock(
    hashtextextended(v_actor_id::text || '|' || p_operation_id::text, 0)
  );

  select o.request_hash, o.result
    into v_previous_hash, v_previous_result
    from public.kd_radar_pilot_import_operations o
   where o.actor_id = v_actor_id
     and o.operation_id = p_operation_id;
  if found then
    if v_previous_hash is distinct from v_request_hash then
      raise exception 'radar_import_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  select count(*)
    into v_root_key_count
    from jsonb_object_keys(p_payload) as root_key(key_name);
  if v_root_key_count <> 6
     or not (p_payload ?& array[
       'targetKey','eventType','date','region','platform','evidence'
     ]) then
    raise exception 'radar_import_root_keys_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'evidence') <> 'array'
     or jsonb_array_length(p_payload -> 'evidence') <> 2 then
    raise exception 'radar_import_evidence_invalid' using errcode = '22023';
  end if;

  if v_target_key is null or btrim(v_target_key) = ''
     or v_event_type is null
     or v_event_type not in (
       'kinostart_at','streamingstart_at','serienstart','staffelstart'
     )
     or v_region is distinct from 'AT'
     or v_date_text is null
     or v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'radar_import_event_invalid' using errcode = '22023';
  end if;

  v_event_date := v_date_text::date;
  if to_char(v_event_date, 'YYYY-MM-DD') <> v_date_text then
    raise exception 'radar_import_date_invalid' using errcode = '22023';
  end if;

  if v_event_type = 'streamingstart_at' then
    if v_platform is null or btrim(v_platform) = '' or v_platform = '-' then
      raise exception 'radar_import_platform_invalid' using errcode = '22023';
    end if;
  else
    if v_platform is distinct from '-' then
      raise exception 'radar_import_platform_invalid' using errcode = '22023';
    end if;
  end if;

  for v_evidence_item in
    select evidence_item.value
      from jsonb_array_elements(p_payload -> 'evidence') as evidence_item(value)
  loop
    if jsonb_typeof(v_evidence_item) <> 'object' then
      raise exception 'radar_import_evidence_item_invalid' using errcode = '22023';
    end if;
    select count(*)
      into v_evidence_key_count
      from jsonb_object_keys(v_evidence_item) as evidence_key(key_name);
    if v_evidence_key_count <> 3
       or not (v_evidence_item ?& array['sourceId','url','retrievedAt'])
       or jsonb_typeof(v_evidence_item -> 'sourceId') <> 'string'
       or jsonb_typeof(v_evidence_item -> 'url') <> 'string'
       or jsonb_typeof(v_evidence_item -> 'retrievedAt') <> 'string'
       or btrim(v_evidence_item ->> 'sourceId') = ''
       or btrim(v_evidence_item ->> 'url') = ''
       or btrim(v_evidence_item ->> 'retrievedAt') = '' then
      raise exception 'radar_import_evidence_item_invalid' using errcode = '22023';
    end if;
    v_retrieved_at := (v_evidence_item ->> 'retrievedAt')::timestamptz;
    if not isfinite(v_retrieved_at) then
      raise exception 'radar_import_evidence_time_invalid' using errcode = '22023';
    end if;
    v_source_ids := array_append(v_source_ids, v_evidence_item ->> 'sourceId');
  end loop;

  perform 1
    from public.kd_radar_sources s
   where s.source_id = any(v_source_ids)
   for key share;

  select count(distinct s.source_id) = 2
         and count(distinct s.publisher_family) = 2
    into v_sources_valid
    from public.kd_radar_sources s
   where s.source_id = any(v_source_ids)
     and s.active
     and s.rights_status = 'approved'
     and s.attribution_approved
     and s.source_class in ('official','editorial');
  if not coalesce(v_sources_valid, false) then
    raise exception 'radar_import_sources_invalid' using errcode = '23514';
  end if;

  select t.target_id
    into v_target_id
    from public.kd_radar_targets t
   where t.target_key = v_target_key
     and t.target_status = 'active'
   for key share;
  if not found then
    raise exception 'radar_target_unavailable' using errcode = '22023';
  end if;

  v_event_key := v_target_key || '|' || v_event_type || '|' || v_region || '|' || v_platform;
  perform pg_advisory_xact_lock(hashtextextended(v_event_key, 0));

  perform 1
    from public.kd_radar_events e
   where e.event_key = v_event_key;
  if found then
    raise exception 'radar_event_key_conflict' using errcode = '23505';
  end if;

  insert into public.kd_radar_events (
    event_id, event_key, target_id, event_type, region, platform,
    lifecycle_status, created_at, updated_at
  ) values (
    v_event_id, v_event_key, v_target_id, v_event_type, v_region, v_platform,
    'scheduled', now(), now()
  );

  insert into public.kd_radar_event_versions (
    event_version_id, event_id, event_date, date_precision,
    verification_status, created_at
  ) values (
    v_event_version_id, v_event_id, v_event_date, 'day',
    'candidate', now()
  );

  for v_evidence_item in
    select evidence_item.value
      from jsonb_array_elements(p_payload -> 'evidence') as evidence_item(value)
  loop
    select s.publisher_family, s.source_class
      into v_publisher_family, v_source_class
      from public.kd_radar_sources s
     where s.source_id = v_evidence_item ->> 'sourceId'
       and s.active
       and s.rights_status = 'approved'
       and s.attribution_approved
       and s.source_class in ('official','editorial');
    if not found then
      raise exception 'radar_import_source_unavailable' using errcode = '23514';
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
      v_region,
      v_platform,
      md5(
        (v_evidence_item ->> 'sourceId') || '|' ||
        (v_evidence_item ->> 'url') || '|' ||
        v_event_date::text || '|' || v_retrieved_at::text
      ) || md5(
        'evidence|' || (v_evidence_item ->> 'sourceId') || '|' ||
        (v_evidence_item ->> 'url') || '|' ||
        v_event_date::text || '|' || v_retrieved_at::text
      ),
      v_retrieved_at,
      now()
    );
  end loop;

  select string_agg(
           ev.source_id || '|' || ev.canonical_url || '|' || ev.retrieved_at::text,
           '|' order by ev.source_id, ev.canonical_url
         )
    into v_source_state_basis
    from public.kd_radar_evidence ev
   where ev.event_version_id = v_event_version_id;
  v_source_state_hash := md5(v_source_state_basis)
    || md5('confirmed|' || v_source_state_basis);

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

  insert into public.kd_radar_reviews (
    event_version_id, actor_id, decision, reason, created_at
  ) values (
    v_event_version_id, v_actor_id, 'confirm', 'manual pilot import', now()
  );

  v_result := jsonb_build_object(
    'eventId', v_event_id,
    'eventVersionId', v_event_version_id,
    'targetId', v_target_key,
    'eventType', v_event_type,
    'date', v_event_date,
    'region', v_region,
    'platform', v_platform
  );

  insert into public.kd_radar_pilot_import_operations (
    actor_id, operation_id, request_hash, result
  ) values (
    v_actor_id, p_operation_id, v_request_hash, v_result
  );
  return v_result;
end
$$;

create function public.kd_radar_pilot_feed(
  p_operation_ids uuid[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id      uuid := auth.uid();
  v_revision      bigint := 0;
  v_checksum      text;
  v_subscriptions jsonb := '[]'::jsonb;
  v_events        jsonb := '[]'::jsonb;
  v_receipts      jsonb := '[]'::jsonb;
  v_operation_acks jsonb := '[]'::jsonb;
begin
  if not public.kd_radar_pilot_allowed() then
    raise exception 'radar_pilot_forbidden' using errcode = '42501';
  end if;
  if v_actor_id is null then
    raise exception 'anmeldung_noetig' using errcode = '42501';
  end if;

  select a.revision, a.checksum
    into v_revision, v_checksum
    from public.kd_radar_account_state a
   where a.account_id = v_actor_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'targetId', t.target_key,
    'targetType', t.target_type,
    'title', t.canonical_title,
    'region', s.region,
    'scope', s.scope,
    'status', s.subscription_status,
    'updatedAt', s.updated_at
  ) order by t.canonical_title, t.target_key), '[]'::jsonb)
    into v_subscriptions
    from public.kd_radar_subscriptions s
    join public.kd_radar_targets t on t.target_id = s.target_id
   where s.account_id = v_actor_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', e.event_id,
    'eventVersionId', v.event_version_id,
    'targetId', t.target_key,
    'eventType', e.event_type,
    'date', v.event_date,
    'region', e.region,
    'platform', e.platform,
    'lifecycleStatus', e.lifecycle_status,
    'verificationStatus', v.verification_status
  ) order by v.event_date, e.event_id), '[]'::jsonb)
    into v_events
    from public.kd_radar_subscriptions s
    join public.kd_radar_targets t on t.target_id = s.target_id
    join public.kd_radar_events e on e.target_id = s.target_id
    join public.kd_radar_event_versions v
      on v.event_id = e.event_id
     and v.event_version_id = e.current_confirmed_version_id
   where s.account_id = v_actor_id
     and s.subscription_status = 'active'
     and e.lifecycle_status <> 'retracted'
     and v.verification_status = 'confirmed';

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventVersionId', r.event_version_id,
    'status', r.receipt_status,
    'updatedAt', r.updated_at
  ) order by r.updated_at, r.event_version_id), '[]'::jsonb)
    into v_receipts
    from public.kd_radar_receipts r
   where r.account_id = v_actor_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'operationId', o.operation_id,
    'targetId', t.target_key,
    'status', o.result ->> 'status',
    'revision', (o.result ->> 'revision')::bigint,
    'checksum', o.result ->> 'checksum'
  ) order by o.created_at, o.operation_id), '[]'::jsonb)
    into v_operation_acks
    from public.kd_radar_operations o
    join public.kd_radar_targets t
      on t.target_key = o.result ->> 'targetId'
   where o.account_id = v_actor_id
     and o.operation_id = any(p_operation_ids)
     and jsonb_object_length(o.result) = 5
     and o.result ?& array['operationId','targetId','status','revision','checksum']
     and not (o.result ? 'format');

  return jsonb_build_object(
    'format', 'kd-radar-pilot-feed-v1',
    'revision', coalesce(v_revision, 0),
    'checksum', v_checksum,
    'reconciledAt', now(),
    'subscriptions', v_subscriptions,
    'events', v_events,
    'receipts', v_receipts,
    'operationAcks', v_operation_acks,
    'radarReview', public.kd_radar_review_allowed()
  );
end
$$;

revoke all on function public.kd_radar_pilot_set_subscription(text,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.kd_radar_pilot_feed(uuid[])
  from public, anon, authenticated;
revoke all on function public.kd_radar_pilot_set_receipt(uuid,text)
  from public, anon, authenticated;
revoke all on function public.kd_radar_pilot_import_event(uuid,jsonb)
  from public, anon, authenticated;

grant execute on function public.kd_radar_pilot_set_subscription(text,text,text,uuid)
  to authenticated, service_role;
grant execute on function public.kd_radar_pilot_feed(uuid[])
  to authenticated, service_role;
grant execute on function public.kd_radar_pilot_set_receipt(uuid,text)
  to authenticated, service_role;
grant execute on function public.kd_radar_pilot_import_event(uuid,jsonb)
  to authenticated, service_role;

commit;
