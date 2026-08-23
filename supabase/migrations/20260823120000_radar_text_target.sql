begin;

create function public.kd_radar_text_target_key(p_target_text text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_bytes bytea := convert_to(p_target_text, 'UTF8');
  v_first bigint := 2166136261;
  v_second bigint := 2654435769;
  v_index integer;
  v_byte integer;
begin
  if btrim(p_target_text) = '' or char_length(p_target_text) > 160 then return null; end if;
  for v_index in 0..length(v_bytes) - 1 loop
    v_byte := get_byte(v_bytes, v_index);
    v_first := mod((v_first # v_byte::bigint)::numeric * 16777619::numeric, 4294967296)::bigint;
    v_second := mod(
      (v_second # (v_byte + v_index)::bigint)::numeric * 2246822507::numeric,
      4294967296
    )::bigint;
  end loop;
  return 'text:' || lpad(to_hex(v_first), 8, '0') || lpad(to_hex(v_second), 8, '0');
end
$$;

alter table public.kd_radar_targets drop constraint kd_radar_targets_target_type_check;
alter table public.kd_radar_targets add constraint kd_radar_targets_target_type_check
  check (target_type in ('work','series','franchise','person','text')) not valid;
alter table public.kd_radar_targets validate constraint kd_radar_targets_target_type_check;

alter table public.kd_radar_targets add constraint kd_radar_text_target_metadata_check check (
  target_type <> 'text' or (
    target_key = public.kd_radar_text_target_key(canonical_title)
    and external_ids ->> 'targetText' = canonical_title
    and external_ids ->> 'contractVersion' = 'radar-text-v1'
    and jsonb_typeof(external_ids -> 'resolvedTargets') = 'array'
  )
) not valid;
alter table public.kd_radar_targets validate constraint kd_radar_text_target_metadata_check;

create function public.kd_radar_websearch_prepare_text(
  p_account_id uuid,
  p_target_key text,
  p_target_text text,
  p_operation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_id uuid;
  v_revision bigint;
  v_checksum text;
  v_unlimited boolean := false;
  v_active_others integer := 0;
  v_result jsonb;
begin
  if p_account_id is null or p_operation_id is null or p_target_text is null
     or btrim(p_target_text) = '' or char_length(p_target_text) > 160
     or p_target_key is distinct from public.kd_radar_text_target_key(p_target_text) then
    raise exception 'radar_text_prepare_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.kd_account_access access
    join public.kd_radar_capabilities capability on capability.account_id = access.account_id
    where access.account_id = p_account_id and access.active and access.personal_ai
      and capability.radar_pilot and capability.radar_review
  ) then
    raise exception 'radar_websearch_forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text || '|' || p_target_key, 0));
  insert into public.kd_radar_targets (
    target_key,target_type,target_status,canonical_title,external_ids,created_at,updated_at
  ) values (
    p_target_key,'text','active',p_target_text,
    jsonb_build_object(
      'targetText',p_target_text,'contractVersion','radar-text-v1','resolvedTargets','[]'::jsonb
    ),now(),now()
  ) on conflict (target_key) do nothing;

  select target.target_id into v_target_id
    from public.kd_radar_targets target
   where target.target_key = p_target_key and target.target_type = 'text'
     and target.target_status = 'active' and target.canonical_title = p_target_text
     and target.external_ids ->> 'targetText' = p_target_text
     and target.external_ids ->> 'contractVersion' = 'radar-text-v1'
     and jsonb_typeof(target.external_ids -> 'resolvedTargets') = 'array'
   for update;
  if not found then raise exception 'radar_text_target_conflict' using errcode = '23505'; end if;

  if not exists (
    select 1 from public.kd_radar_subscriptions subscription
     where subscription.account_id = p_account_id and subscription.target_id = v_target_id
       and subscription.subscription_status = 'active' and subscription.region = 'AT'
       and subscription.scope = 'all'
  ) then
    v_unlimited := coalesce((select capability.radar_unlimited
      from public.kd_radar_capabilities capability where capability.account_id = p_account_id), false);
    if not v_unlimited then
      select count(*) into v_active_others from public.kd_radar_subscriptions subscription
       where subscription.account_id = p_account_id
         and subscription.subscription_status = 'active' and subscription.target_id <> v_target_id;
      if v_active_others >= 10 then raise exception 'radar_quota_exceeded' using errcode = '23514'; end if;
    end if;
    insert into public.kd_radar_account_state (account_id,revision)
    values (p_account_id,0) on conflict (account_id) do nothing;
    select state.revision into v_revision from public.kd_radar_account_state state
     where state.account_id = p_account_id for update;
    v_revision := v_revision + 1;
    insert into public.kd_radar_subscriptions (
      account_id,target_id,region,scope,subscription_status,server_revision,last_operation_id,created_at,updated_at
    ) values (
      p_account_id,v_target_id,'AT','all','active',v_revision,p_operation_id,now(),now()
    ) on conflict (account_id,target_id) do update set
      region='AT',scope='all',subscription_status='active',server_revision=excluded.server_revision,
      last_operation_id=excluded.last_operation_id,person_external_id=null,person_role=null,updated_at=now();
    v_checksum := public.kd_radar_account_checksum(p_account_id);
    update public.kd_radar_account_state state
       set revision=v_revision,checksum=v_checksum,updated_at=now()
     where state.account_id=p_account_id;
    v_result := jsonb_build_object(
      'operationId',p_operation_id,'targetId',p_target_key,'status','active',
      'revision',v_revision,'checksum',v_checksum
    );
    insert into public.kd_radar_operations (account_id,operation_id,request_hash,result,terminal_at,created_at)
    values (p_account_id,p_operation_id,md5('radar-text-prepare|' || p_target_key || '|' || p_target_text),v_result,now(),now());
  end if;

  return jsonb_build_object(
    'kind','text','targetId',p_target_key,'targetText',p_target_text,'region','AT',
    'scopes',jsonb_build_array('cinema','streaming','series_start','season_start')
  );
end
$$;

-- Nur der bestehende Kostenstart erhält genau den neuen Typ.
-- Der Driftguard stoppt, falls ihre belegte Definition nicht mehr passt.
do $radar_text_forward_patch$
declare
  v_definition text;
  v_old text := $old$t.target_type in ('work','series')$old$;
  v_new text := $new$t.target_type in ('work','series','text')$new$;
begin
  select pg_get_functiondef(
    'public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer)'::regprocedure
  ) into v_definition;
  if position(v_old in v_definition) = 0 or position(v_new in v_definition) > 0 then
    raise exception 'radar_text_reservation_definition_drift';
  end if;
  execute replace(v_definition,v_old,v_new);

end
$radar_text_forward_patch$;

create function public.kd_radar_websearch_upsert_text_event(
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
  v_key_count integer;
  v_text_key text := p_payload ->> 'textTargetKey';
  v_target_text text := p_payload ->> 'targetText';
  v_work_key text := p_payload ->> 'targetKey';
  v_work_type text := p_payload ->> 'workTargetType';
  v_work_title text := p_payload ->> 'workTitle';
  v_work_year integer;
  v_checked_at timestamptz;
  v_item jsonb;
  v_count integer;
  v_item_keys integer;
  v_source_ids text[] := array[]::text[];
  v_source_urls text[] := array[]::text[];
  v_source_families text[] := array[]::text[];
  v_official_count integer := 0;
  v_source_domain text;
  v_source_family text;
  v_source_class text;
  v_subdomains_allowed boolean;
  v_source_host text;
  v_retrieved_at timestamptz;
  v_resolved jsonb;
  v_work_target_id uuid;
  v_direct_status text;
  v_direct_scope text;
  v_direct_region text;
  v_direct_inserted boolean := false;
  v_direct_changed boolean := false;
  v_revision bigint;
  v_inner_hash text;
  v_inner_operation_id uuid;
  v_request_hash text;
  v_previous_hash text;
  v_previous_result jsonb;
  v_core_payload jsonb;
  v_result jsonb;
begin
  if p_account_id is null or p_operation_id is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'radar_text_event_invalid' using errcode = '22023';
  end if;
  select count(*) into v_key_count from jsonb_object_keys(p_payload);
  if v_key_count <> 14 or not (p_payload ?& array[
    'targetKey','eventType','date','region','platform','seasonNumber','evidence',
    'textTargetKey','targetText','workTargetType','workTitle','workYear','checkedAt','relationEvidence'
  ]) or jsonb_typeof(p_payload -> 'evidence') <> 'array'
     or jsonb_typeof(p_payload -> 'relationEvidence') <> 'array' then
    raise exception 'radar_text_event_shape_invalid' using errcode = '22023';
  end if;
  if v_target_text is null or btrim(v_target_text) = '' or char_length(v_target_text) > 160
     or v_text_key is distinct from public.kd_radar_text_target_key(v_target_text)
     or v_work_type not in ('work','series')
     or not (
       v_work_key ~ '^imdb:tt[1-9][0-9]{6,10}$'
       or (v_work_type = 'work' and v_work_key ~ '^tmdb:movie:[1-9][0-9]{0,11}$')
       or (v_work_type = 'series' and v_work_key ~ '^tmdb:tv:[1-9][0-9]{0,11}$')
     ) or btrim(v_work_title) = '' or char_length(v_work_title) > 200
     or (p_payload ->> 'workYear') !~ '^[0-9]{4}$'
     or (p_payload ->> 'checkedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$' then
    raise exception 'radar_text_event_contract_invalid' using errcode = '22023';
  end if;
  v_work_year := (p_payload ->> 'workYear')::integer;
  v_checked_at := (p_payload ->> 'checkedAt')::timestamptz;
  if v_work_year not between 1888 and 2100 or not isfinite(v_checked_at) then
    raise exception 'radar_text_event_contract_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.kd_radar_subscriptions subscription
    join public.kd_radar_targets target on target.target_id = subscription.target_id
    where subscription.account_id = p_account_id and subscription.subscription_status = 'active'
      and subscription.region = 'AT' and subscription.scope = 'all'
      and target.target_key = v_text_key and target.target_type = 'text'
      and target.target_status = 'active' and target.canonical_title = v_target_text
      and target.external_ids ->> 'targetText' = v_target_text
  ) then raise exception 'radar_text_target_unavailable' using errcode = '42501'; end if;

  v_request_hash := md5(p_payload::text);
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,0));
  select operation.request_hash,operation.result into v_previous_hash,v_previous_result
    from public.kd_radar_operations operation
   where operation.account_id=p_account_id and operation.operation_id=p_operation_id;
  if found then
    if v_previous_hash is distinct from v_request_hash then
      raise exception 'radar_websearch_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  v_count := jsonb_array_length(p_payload -> 'relationEvidence');
  if v_count not between 1 and 2 then raise exception 'radar_text_relation_evidence_invalid' using errcode = '23514'; end if;
  for v_item in select value from jsonb_array_elements(p_payload -> 'relationEvidence') loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'radar_text_relation_evidence_invalid' using errcode = '23514';
    end if;
    select count(*) into v_item_keys from jsonb_object_keys(v_item);
    if v_item_keys <> 3
       or not (v_item ?& array['sourceId','url','retrievedAt'])
       or (v_item ->> 'url') !~ '^https://[^[:space:]#]+$' then
      raise exception 'radar_text_relation_evidence_invalid' using errcode = '23514';
    end if;
    v_retrieved_at := (v_item ->> 'retrievedAt')::timestamptz;
    if not isfinite(v_retrieved_at) or v_retrieved_at > v_checked_at
       or exists (select 1 from jsonb_array_elements(p_payload -> 'evidence') event_item(value)
                   where event_item.value ->> 'url' = v_item ->> 'url') then
      raise exception 'radar_text_relation_evidence_invalid' using errcode = '23514';
    end if;
    select source.domain,source.publisher_family,source.source_class,source.subdomains_allowed
      into v_source_domain,v_source_family,v_source_class,v_subdomains_allowed
      from public.kd_radar_sources source
     where source.source_id = v_item ->> 'sourceId' and source.active
       and source.rights_status = 'approved' and source.attribution_approved
       and source.source_class in ('official','editorial') for key share;
    if not found then raise exception 'radar_text_relation_source_unavailable' using errcode = '23514'; end if;
    v_source_host := lower(substring(v_item ->> 'url' from '^https://([^/?#]+)'));
    if v_source_host is null or not (v_source_host = v_source_domain
       or (v_subdomains_allowed and right(v_source_host,char_length(v_source_domain)+1)='.'||v_source_domain)) then
      raise exception 'radar_text_relation_source_mismatch' using errcode = '23514';
    end if;
    v_source_ids := array_append(v_source_ids,v_item ->> 'sourceId');
    v_source_urls := array_append(v_source_urls,v_item ->> 'url');
    v_source_families := array_append(v_source_families,v_source_family);
    if v_source_class = 'official' then v_official_count := v_official_count + 1; end if;
  end loop;
  if (select count(distinct value) from unnest(v_source_ids) value) <> v_count
     or (select count(distinct value) from unnest(v_source_urls) value) <> v_count
     or (v_official_count = 0 and (select count(distinct value) from unnest(v_source_families) value) < 2) then
    raise exception 'radar_text_relation_sources_insufficient' using errcode = '23514';
  end if;

  insert into public.kd_radar_targets (
    target_key,target_type,target_status,canonical_title,external_ids,created_at,updated_at
  ) values (
    v_work_key,v_work_type,'active',v_work_title,
    jsonb_build_object('releaseYear',v_work_year::text,'providerResolved',true),now(),now()
  ) on conflict (target_key) do nothing;
  select target.target_id into v_work_target_id
    from public.kd_radar_targets target where target.target_key=v_work_key
      and target.target_type=v_work_type and target.target_status='active'
      and target.canonical_title=v_work_title and target.external_ids ->> 'releaseYear'=v_work_year::text
   for key share;
  if not found then raise exception 'radar_text_resolved_target_conflict' using errcode = '23505'; end if;

  v_resolved := jsonb_build_object(
    'targetId',v_work_key,'targetType',v_work_type,'title',v_work_title,'year',v_work_year,
    'relationEvidence',p_payload -> 'relationEvidence'
  );
  update public.kd_radar_targets target set
    external_ids=jsonb_set(target.external_ids,'{resolvedTargets}',
      case when exists (
        select 1 from jsonb_array_elements(target.external_ids -> 'resolvedTargets') member
         where member ->> 'targetId'=v_work_key
      ) then target.external_ids -> 'resolvedTargets'
      else (target.external_ids -> 'resolvedTargets') || jsonb_build_array(v_resolved) end,true),
    updated_at=now()
   where target.target_key=v_text_key and target.target_type='text';

  v_core_payload := jsonb_build_object(
    'targetKey',v_work_key,'eventType',p_payload -> 'eventType','date',p_payload -> 'date',
    'region',p_payload -> 'region','platform',p_payload -> 'platform',
    'seasonNumber',p_payload -> 'seasonNumber','evidence',p_payload -> 'evidence'
  );
  select subscription.subscription_status,subscription.scope,subscription.region
    into v_direct_status,v_direct_scope,v_direct_region
    from public.kd_radar_subscriptions subscription
   where subscription.account_id=p_account_id and subscription.target_id=v_work_target_id
   for update;
  if not found then
    select greatest(coalesce(state.revision,0),1) into v_revision
      from public.kd_radar_account_state state where state.account_id=p_account_id;
    v_revision := coalesce(v_revision,1);
    insert into public.kd_radar_subscriptions (
      account_id,target_id,region,scope,subscription_status,server_revision,
      last_operation_id,person_external_id,person_role,created_at,updated_at
    ) values (
      p_account_id,v_work_target_id,'AT','all','active',v_revision,
      p_operation_id,null,null,now(),now()
    );
    v_direct_inserted := true;
  elsif v_direct_status is distinct from 'active'
     or v_direct_scope is distinct from 'all'
     or v_direct_region is distinct from 'AT' then
    update public.kd_radar_subscriptions
       set subscription_status='active',scope='all',region='AT'
     where account_id=p_account_id and target_id=v_work_target_id;
    v_direct_changed := true;
  end if;

  v_inner_hash := md5(p_operation_id::text || '|radar-text-inner|' || v_text_key || '|' || v_work_key);
  v_inner_operation_id := (
    substr(v_inner_hash,1,8) || '-' || substr(v_inner_hash,9,4) || '-4' ||
    substr(v_inner_hash,14,3) || '-8' || substr(v_inner_hash,18,3) || '-' ||
    substr(v_inner_hash,21,12)
  )::uuid;
  v_result := public.kd_radar_websearch_upsert_event(
    p_account_id,v_inner_operation_id,v_core_payload
  );

  if v_direct_inserted then
    delete from public.kd_radar_subscriptions
     where account_id=p_account_id and target_id=v_work_target_id;
  elsif v_direct_changed then
    update public.kd_radar_subscriptions
       set subscription_status=v_direct_status,scope=v_direct_scope,region=v_direct_region
     where account_id=p_account_id and target_id=v_work_target_id;
  end if;

  v_result := v_result || jsonb_build_object(
    'format','kd-radar-text-event-v1','textTargetId',v_text_key,
    'targetId',v_work_key,'targetType',v_work_type,'title',v_work_title,
    'year',v_work_year,'checkedAt',p_payload ->> 'checkedAt'
  );
  insert into public.kd_radar_operations (
    account_id,operation_id,request_hash,result,terminal_at,created_at
  ) values (p_account_id,p_operation_id,v_request_hash,v_result,now(),now());
  return v_result;
end
$$;

alter function public.kd_radar_pilot_feed(uuid[])
  rename to kd_radar_pilot_feed_text_internal;
revoke all on function public.kd_radar_pilot_feed_text_internal(uuid[])
  from public,anon,authenticated;
grant execute on function public.kd_radar_pilot_feed_text_internal(uuid[]) to service_role;

create function public.kd_radar_pilot_feed(p_operation_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_feed jsonb;
  v_text_events jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
begin
  v_feed := public.kd_radar_pilot_feed_text_internal(p_operation_ids);
  with text_operations as materialized (
    select operation.result,operation.created_at
    from public.kd_radar_operations operation
    join public.kd_radar_subscriptions subscription on subscription.account_id=operation.account_id
    join public.kd_radar_targets text_target on text_target.target_id=subscription.target_id
      and text_target.target_key=operation.result ->> 'textTargetId'
    where operation.account_id=v_actor_id
      and operation.result ->> 'format'='kd-radar-text-event-v1'
      and (operation.result ->> 'eventId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (operation.result ->> 'eventVersionId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and subscription.subscription_status='active' and subscription.region='AT'
      and subscription.scope='all' and text_target.target_type='text'
      and text_target.target_status='active'
      and text_target.target_key=public.kd_radar_text_target_key(text_target.canonical_title)
      and text_target.external_ids ->> 'targetText'=text_target.canonical_title
  ), text_versions as (
    select distinct on (operation.result ->> 'eventVersionId')
      version.event_version_id,event.event_id,work.target_key,work.canonical_title,
      event.event_type,version.event_date,event.region,event.platform,event.season_number,
      event.lifecycle_status,version.verification_status
    from text_operations operation
    join public.kd_radar_event_versions version
      on version.event_version_id=(operation.result ->> 'eventVersionId')::uuid
      and version.verification_status='confirmed'
    join public.kd_radar_events event
      on event.event_id=(operation.result ->> 'eventId')::uuid and event.event_id=version.event_id
    join public.kd_radar_targets work
      on work.target_id=event.target_id and work.target_key=operation.result ->> 'targetId'
      and work.target_type=operation.result ->> 'targetType'
      and work.canonical_title=operation.result ->> 'title'
      and work.external_ids ->> 'releaseYear'=operation.result ->> 'year'
    order by operation.result ->> 'eventVersionId',operation.created_at desc
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'eventId',item.event_id,'eventVersionId',item.event_version_id,
      'targetId',item.target_key,'title',item.canonical_title,
      'eventType',item.event_type,'date',item.event_date,'region',item.region,
      'platform',item.platform,'lifecycleStatus',item.lifecycle_status,
      'verificationStatus',item.verification_status,'evidence',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'sourceId',evidence.source_id,'sourceDomain',source.domain,
          'url',evidence.canonical_url,'retrievedAt',evidence.retrieved_at
        ) order by evidence.source_id,evidence.canonical_url,evidence.retrieved_at),'[]'::jsonb)
        from public.kd_radar_evidence evidence
        join public.kd_radar_sources source on source.source_id=evidence.source_id
        where evidence.event_version_id=item.event_version_id
      )
    ) || case when item.season_number is null then '{}'::jsonb
      else jsonb_build_object('seasonNumber',item.season_number) end
    order by item.event_date,item.target_key,item.event_version_id
  ),'[]'::jsonb) into v_text_events from text_versions item;

  select coalesce(jsonb_agg(candidate.value order by candidate.value ->> 'date',candidate.value ->> 'targetId'),'[]'::jsonb)
    into v_events from (
      select distinct on (item.value ->> 'eventVersionId') item.value
      from jsonb_array_elements(coalesce(v_feed -> 'events','[]'::jsonb) || v_text_events) item(value)
      order by item.value ->> 'eventVersionId',(item.value ? 'title') desc
    ) candidate;
  return jsonb_set(v_feed,'{events}',v_events,false);
end
$$;

revoke all on function public.kd_radar_text_target_key(text) from public,anon,authenticated;
revoke all on function public.kd_radar_websearch_prepare_text(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.kd_radar_websearch_upsert_text_event(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.kd_radar_pilot_feed(uuid[]) from public,anon,authenticated;
grant execute on function public.kd_radar_text_target_key(text) to service_role;
grant execute on function public.kd_radar_websearch_prepare_text(uuid,text,text,uuid) to service_role;
grant execute on function public.kd_radar_websearch_upsert_text_event(uuid,uuid,jsonb) to service_role;
grant execute on function public.kd_radar_pilot_feed(uuid[]) to authenticated,service_role;

comment on function public.kd_radar_websearch_prepare_text(uuid,text,text,uuid) is
  'Registriert den unveraenderten Freitext erst beim expliziten Check, autorisiert das Konto und liefert den Providerkontext.';
comment on function public.kd_radar_websearch_upsert_text_event(uuid,uuid,jsonb) is
  'Persistiert nur stark identifizierte, separat relations- und terminbelegte Freitextfunde ueber den bestehenden Eventpfad.';

commit;
