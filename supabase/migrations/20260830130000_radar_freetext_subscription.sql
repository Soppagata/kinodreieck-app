-- Kinodreieck · Radar · auth.uid()-gebundene Freitext-Subscription
-- Diese additive Migration fuehrt genau eine neue Browser-RPC ein. Sie startet
-- keinen Radarcheck, keinen Scheduler und keinen Anbieteraufruf.

begin;

do $$
begin
  if to_regprocedure('public.kd_radar_pilot_allowed()') is null
     or to_regprocedure('public.kd_radar_text_target_key(text)') is null
     or to_regprocedure('public.kd_radar_account_checksum(uuid)') is null then
    raise exception 'Radar Freitext-Subscription Baseline fehlt';
  end if;
end
$$;

create function public.kd_radar_pilot_set_text_subscription(
  p_target_text text,
  p_status text,
  p_operation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_key text;
  v_target_id uuid;
  v_request_hash text;
  v_previous_hash text;
  v_previous_result jsonb;
  v_unlimited boolean := false;
  v_active_others integer := 0;
  v_revision bigint;
  v_checksum text;
  v_result jsonb;
begin
  if v_actor_id is null or not public.kd_radar_pilot_allowed() then
    raise exception 'radar_pilot_forbidden' using errcode = '42501';
  end if;
  if p_operation_id is null or p_target_text is null
     or btrim(p_target_text) = '' or char_length(p_target_text) > 160
     or p_status is null or p_status not in ('active','paused','removed') then
    raise exception 'radar_text_subscription_request_invalid' using errcode = '22023';
  end if;

  v_target_key := public.kd_radar_text_target_key(p_target_text);
  if v_target_key is null then
    raise exception 'radar_text_subscription_request_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text, 0));
  v_request_hash := md5(
    'pilot-text-subscription-v1|' || v_target_key || '|' || p_target_text || '|all|' || p_status
  );
  select operation.request_hash, operation.result
    into v_previous_hash, v_previous_result
    from public.kd_radar_operations operation
   where operation.account_id = v_actor_id
     and operation.operation_id = p_operation_id;
  if found then
    if v_previous_hash is distinct from v_request_hash then
      raise exception 'radar_operation_conflict' using errcode = '23505';
    end if;
    return v_previous_result;
  end if;

  if p_status = 'active' then
    insert into public.kd_radar_targets as stored (
      target_key, target_type, target_status, canonical_title,
      external_ids, created_at, updated_at, orphaned_at
    ) values (
      v_target_key, 'text', 'active', p_target_text,
      jsonb_build_object(
        'targetText', p_target_text,
        'contractVersion', 'radar-text-v1',
        'resolvedTargets', '[]'::jsonb
      ),
      now(), now(), null
    )
    on conflict (target_key) do update
      set target_status = 'active', orphaned_at = null, updated_at = now()
      where stored.target_type = 'text'
        and stored.target_status in ('active','retired')
        and stored.canonical_title = p_target_text
        and stored.external_ids ->> 'targetText' = p_target_text
        and stored.external_ids ->> 'contractVersion' = 'radar-text-v1'
        and jsonb_typeof(stored.external_ids -> 'resolvedTargets') = 'array'
    returning stored.target_id into v_target_id;
  else
    select target.target_id
      into v_target_id
      from public.kd_radar_targets target
      join public.kd_radar_subscriptions subscription
        on subscription.target_id = target.target_id
       and subscription.account_id = v_actor_id
     where target.target_key = v_target_key
       and target.target_type = 'text'
       and target.target_status in ('active','retired')
       and target.canonical_title = p_target_text
       and target.external_ids ->> 'targetText' = p_target_text
       and target.external_ids ->> 'contractVersion' = 'radar-text-v1'
       and jsonb_typeof(target.external_ids -> 'resolvedTargets') = 'array'
     for update of target, subscription;
  end if;
  if v_target_id is null then
    raise exception 'radar_text_target_conflict' using errcode = '23505';
  end if;

  v_unlimited := coalesce((
    select capability.radar_unlimited
      from public.kd_radar_capabilities capability
     where capability.account_id = v_actor_id
  ), false);
  if p_status = 'active' and not v_unlimited then
    select count(*) into v_active_others
      from public.kd_radar_subscriptions subscription
     where subscription.account_id = v_actor_id
       and subscription.subscription_status = 'active'
       and subscription.target_id <> v_target_id;
    if v_active_others >= 10 then
      raise exception 'radar_quota_exceeded' using errcode = '23514';
    end if;
  end if;

  insert into public.kd_radar_account_state (account_id, revision)
  values (v_actor_id, 0)
  on conflict (account_id) do nothing;
  select state.revision into v_revision
    from public.kd_radar_account_state state
   where state.account_id = v_actor_id
   for update;
  v_revision := v_revision + 1;

  if p_status = 'active' then
    insert into public.kd_radar_subscriptions (
      account_id, target_id, region, scope, subscription_status,
      server_revision, last_operation_id, person_external_id, person_role,
      created_at, updated_at
    ) values (
      v_actor_id, v_target_id, 'AT', 'all', 'active',
      v_revision, p_operation_id, null, null, now(), now()
    )
    on conflict (account_id, target_id) do update
      set region = 'AT', scope = 'all', subscription_status = 'active',
          server_revision = excluded.server_revision,
          last_operation_id = excluded.last_operation_id,
          person_external_id = null, person_role = null, updated_at = now();
  elsif p_status = 'paused' then
    update public.kd_radar_subscriptions
       set region = 'AT', scope = 'all', subscription_status = 'paused',
           server_revision = v_revision, last_operation_id = p_operation_id,
           person_external_id = null, person_role = null, updated_at = now()
     where account_id = v_actor_id and target_id = v_target_id;
    if not found then
      raise exception 'radar_text_subscription_unavailable' using errcode = '22023';
    end if;
  else
    delete from public.kd_radar_subscriptions
     where account_id = v_actor_id and target_id = v_target_id;
    if not found then
      raise exception 'radar_text_subscription_unavailable' using errcode = '22023';
    end if;
  end if;

  if p_status <> 'active' then
    delete from public.kd_radar_target_shares
     where account_id = v_actor_id and target_id = v_target_id;
  end if;

  v_checksum := public.kd_radar_account_checksum(v_actor_id);
  update public.kd_radar_account_state
     set revision = v_revision, checksum = v_checksum, updated_at = now()
   where account_id = v_actor_id;
  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'targetId', v_target_key,
    'status', p_status,
    'revision', v_revision,
    'checksum', v_checksum
  );
  insert into public.kd_radar_operations (
    account_id, operation_id, request_hash, result
  ) values (
    v_actor_id, p_operation_id, v_request_hash, v_result
  );
  return v_result;
end
$$;

revoke all on function public.kd_radar_pilot_set_text_subscription(text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kd_radar_pilot_set_text_subscription(text,text,uuid)
  to authenticated;

comment on function public.kd_radar_pilot_set_text_subscription(text,text,uuid) is
  'Legt ausschliesslich das eigene auth.uid()-gebundene Freitext-Radarziel an, pausiert oder entfernt es.';

notify pgrst, 'reload schema';

commit;
