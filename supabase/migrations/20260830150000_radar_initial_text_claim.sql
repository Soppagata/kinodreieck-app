begin;

-- Explicit first search after a confirmed new text subscription. Reuses the
-- scheduler's account/target/day fence and lease; never creates subscriptions.
create function public.kd_radar_initial_claim(
  p_account_id uuid, p_target_key text, p_target_text text
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_subscription public.kd_radar_subscriptions%rowtype;
  v_fence_token uuid := gen_random_uuid();
  v_provider jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('claim',false,'status','forbidden');
  end if;
  -- Capability/owner/target authorization and runtime flags precede any claim.
  perform public.kd_radar_websearch_prepare_text(p_account_id,p_target_key,p_target_text,gen_random_uuid());
  if not exists (select 1 from public.kd_radar_settings
    where singleton and radar_aktiv and radar_provider_aktiv) then
    return jsonb_build_object('claim',false,'status','disabled');
  end if;
  v_provider := public.kd_private_provider_allowed('anthropic');
  if v_provider->'ok' is distinct from 'true'::jsonb
    or v_provider->>'code' is distinct from 'PROVIDER_ALLOWED' then
    return jsonb_build_object('claim',false,'status','disabled');
  end if;

  select s.* into v_subscription from public.kd_radar_subscriptions s
    join public.kd_radar_targets t on t.target_id=s.target_id
    where s.account_id=p_account_id and s.subscription_status='active'
      and s.region='AT' and s.scope='all' and t.target_status='active'
      and t.target_type='text' and t.target_key=p_target_key and t.canonical_title=p_target_text
    for update of s skip locked;
  if not found then return jsonb_build_object('claim',false,'status','busy'); end if;

  if exists (select 1 from public.kd_radar_daily_runs r
    where r.account_id=p_account_id and r.target_id=v_subscription.target_id
      and r.worker_status='leased' and r.lease_expires_at >= v_now) then
    return jsonb_build_object('claim',false,'status','busy');
  end if;

  -- An ordinary old subscription is not an initial search. A newly recreated
  -- subscription may qualify, but never defeats today's existing daily fence.
  if v_subscription.created_at < v_now - interval '15 minutes'
    or v_subscription.next_check_at > v_now
    or exists (select 1 from public.kd_radar_daily_runs r
      where r.account_id=p_account_id and r.target_id=v_subscription.target_id
        and (r.claimed_at >= v_subscription.created_at or r.vienna_day=v_today)) then
    return jsonb_build_object('claim',false,'status','no_change');
  end if;

  insert into public.kd_radar_daily_runs(account_id,target_id,vienna_day,fence_token,
    worker_status,safe_status,claimed_at,lease_expires_at,updated_at)
    values(p_account_id,v_subscription.target_id,v_today,v_fence_token,
      'leased','attempt_consumed',v_now,v_now+interval '180 seconds',v_now)
    on conflict(account_id,target_id,vienna_day) do nothing;
  if not found then return jsonb_build_object('claim',false,'status','no_change'); end if;
  return jsonb_build_object('claim',true,'status','claimed','accountId',p_account_id,
    'targetRowId',v_subscription.target_id,'targetId',p_target_key,'targetText',p_target_text,
    'targetType','text','viennaDay',v_today,'fenceToken',v_fence_token);
end $$;
revoke all on function public.kd_radar_initial_claim(uuid,text,text) from public,anon,authenticated;
grant execute on function public.kd_radar_initial_claim(uuid,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
