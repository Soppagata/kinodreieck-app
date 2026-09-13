-- The first 14-day backfill can resume successful pages on the same day.
-- A separate fixed 80-request ceiling remains within the free-plan allowance;
-- daily operation then returns to 24, with the unchanged 900/32-day cap.
begin;
alter table public.kd_motn_sync add column bootstrap_completed_at timestamptz;

create or replace function public.kd_motn_claim(p_token uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.kd_motn_sync%rowtype; k text; c jsonb; result jsonb := '{}'::jsonb; epoch_now bigint := extract(epoch from now())::bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  select * into s from public.kd_motn_sync where singleton for update;
  if s.lease_until > now() then return jsonb_build_object('ok',true,'claimed',false,'status','busy'); end if;
  if s.last_run_at >= (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')
    and not (s.bootstrap_completed_at is null and s.last_status='limited') then return jsonb_build_object('ok',true,'claimed',false,'status','not_due'); end if;
  foreach k in array array['new','removed'] loop
    c := s.checkpoints->k;
    if c is null or coalesce((c->>'done')::boolean,false) then
      c := jsonb_build_object('from',greatest(coalesce((c->>'to')::bigint - 300,epoch_now - 14*86400),epoch_now - 30*86400),
        'to',epoch_now,'cursor',null,'done',false);
    elsif (c->>'from')::bigint < epoch_now - 31*86400 then
      update public.kd_motn_sync set last_status='checkpoint_expired' where singleton;
      return jsonb_build_object('ok',false,'claimed',false,'status','checkpoint_expired');
    end if;
    result := result || jsonb_build_object(k,c);
  end loop;
  update public.kd_motn_sync set lease_token=p_token, lease_until=now()+interval '10 minutes',
    last_run_at=now(), last_status='running', checkpoints=result where singleton;
  return jsonb_build_object('ok',true,'claimed',true,'checkpoints',result);
end $$;

create or replace function public.kd_motn_reserve(p_token uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.kd_motn_sync%rowtype; rolling integer; daily integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  select * into s from public.kd_motn_sync where singleton for update;
  if p_token is null or s.lease_token is null or s.lease_until is null
    or s.lease_token is distinct from p_token or s.lease_until <= now() or p_kind not in ('new','removed') then
    return jsonb_build_object('reserved',false,'status','invalid_lease'); end if;
  select count(*),count(*) filter(where started_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')
    into rolling,daily from public.kd_motn_requests where started_at >= now()-interval '32 days';
  if rolling >= 900
    or (s.bootstrap_completed_at is null and (select count(*) from public.kd_motn_requests)>=80)
    or (s.bootstrap_completed_at is not null and daily>=24) then return jsonb_build_object('reserved',false,'status','quota_limit'); end if;
  insert into public.kd_motn_requests(kind,run_token) values(p_kind,p_token);
  return jsonb_build_object('reserved',true);
end $$;

create or replace function public.kd_motn_finish(p_token uuid,p_status text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  if p_status not in ('succeeded','limited','error') then raise exception 'invalid status'; end if;
  update public.kd_motn_sync set lease_token=null,lease_until=null,last_status=p_status,
    bootstrap_completed_at=case when p_status='succeeded' then coalesce(bootstrap_completed_at,now()) else bootstrap_completed_at end
    where singleton and lease_token=p_token;
  return jsonb_build_object('ok',found);
end $$;

notify pgrst,'reload schema';
commit;
