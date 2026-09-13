-- A small daily check; changed windows are imported only after the 48h cooldown.
-- Incomplete imports keep their exact cursor and may finish on the next day.
begin;
alter table public.kd_motn_sync
  add column last_full_sync_at timestamptz,
  add column run_mode text not null default 'sync' check (run_mode in ('sync','probe')),
  add column probe_windows jsonb not null default '{}'::jsonb,
  add column pending_changes boolean not null default false;
update public.kd_motn_sync set last_full_sync_at=last_success_at
  where bootstrap_completed_at is not null
    and checkpoints->'new'->>'done'='true' and checkpoints->'removed'->>'done'='true';

create or replace function public.kd_motn_claim(p_token uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog,public as $$
declare s public.kd_motn_sync%rowtype; k text; c jsonb; result jsonb := '{}'::jsonb;
  epoch_now bigint := floor(extract(epoch from now()))::bigint; mode text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  if p_token is null then raise exception 'token required'; end if;
  select * into s from public.kd_motn_sync where singleton for update;
  if s.lease_until > now() then return jsonb_build_object('ok',true,'claimed',false,'status','busy'); end if;
  if s.last_run_at >= (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')
    and not (s.bootstrap_completed_at is null and s.last_status='limited') then
    return jsonb_build_object('ok',true,'claimed',false,'status','not_due'); end if;
  mode := case when s.bootstrap_completed_at is null
    or (s.run_mode='sync' and (s.checkpoints->'new'->>'done' is distinct from 'true'
      or s.checkpoints->'removed'->>'done' is distinct from 'true')) then 'sync' else 'probe' end;
  foreach k in array array['new','removed'] loop
    c := s.checkpoints->k;
    if mode='probe' or c is null then
      c := jsonb_build_object('from',coalesce((c->>'to')::bigint+1,epoch_now-14*86400),
        'to',epoch_now,'cursor',null,'done',false);
    end if;
    if (c->>'from')::bigint < epoch_now-31*86400 then
      update public.kd_motn_sync set last_status='checkpoint_expired' where singleton;
      return jsonb_build_object('ok',false,'claimed',false,'status','checkpoint_expired');
    end if;
    result := result || jsonb_build_object(k,c);
  end loop;
  update public.kd_motn_sync set lease_token=p_token,lease_until=now()+interval '10 minutes',
    last_run_at=now(),last_status='running',run_mode=mode,
    checkpoints=case when mode='sync' then result else checkpoints end,
    probe_windows=case when mode='probe' then result else '{}'::jsonb end where singleton;
  return jsonb_build_object('ok',true,'claimed',true,'mode',mode,'checkpoints',result);
end $$;

create function public.kd_motn_probe_result(p_token uuid,p_has_changes boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog,public as $$
declare s public.kd_motn_sync%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  select * into s from public.kd_motn_sync where singleton for update;
  if p_token is null or s.lease_token is distinct from p_token or s.lease_until is null
    or s.lease_until<=now() or s.run_mode<>'probe' or p_has_changes is null then
    return jsonb_build_object('ok',false,'status','invalid_probe'); end if;
  if not p_has_changes then
    update public.kd_motn_sync set checkpoints=jsonb_set(jsonb_set(probe_windows,'{new,done}','true'),'{removed,done}','true'),
      probe_windows='{}'::jsonb,pending_changes=false where singleton;
    return jsonb_build_object('ok',true,'status','unchanged');
  end if;
  if s.last_full_sync_at > now()-interval '48 hours' then
    update public.kd_motn_sync set pending_changes=true where singleton;
    return jsonb_build_object('ok',true,'status','cooldown');
  end if;
  update public.kd_motn_sync set checkpoints=probe_windows,probe_windows='{}'::jsonb,
    run_mode='sync',pending_changes=true where singleton;
  return jsonb_build_object('ok',true,'status','sync');
end $$;

create or replace function public.kd_motn_finish(p_token uuid,p_status text) returns jsonb
language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  if p_status not in ('succeeded','limited','error','unchanged','cooldown') then raise exception 'invalid status'; end if;
  update public.kd_motn_sync set lease_token=null,lease_until=null,last_status=p_status,
    last_full_sync_at=case when p_status='succeeded' then now() else last_full_sync_at end,
    pending_changes=case when p_status in ('succeeded','unchanged') then false else pending_changes end,
    bootstrap_completed_at=case when p_status='succeeded' or (p_status='limited' and (select count(*) from public.kd_motn_requests)>=80)
      then coalesce(bootstrap_completed_at,now()) else bootstrap_completed_at end
    where singleton and lease_token=p_token and (p_status<>'succeeded' or (run_mode='sync'
      and checkpoints->'new'->>'done'='true' and checkpoints->'removed'->>'done'='true'));
  return jsonb_build_object('ok',found);
end $$;

-- Keep the original atomic page upsert; deny it while a run only checks changes.
alter function public.kd_motn_commit_page(uuid,text,text,text,jsonb,integer) rename to kd_motn_commit_sync_page;
revoke all on function public.kd_motn_commit_sync_page(uuid,text,text,text,jsonb,integer) from public,anon,authenticated,service_role;
create function public.kd_motn_commit_page(p_token uuid,p_kind text,p_cursor text,p_next_cursor text,p_records jsonb,p_skipped integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  perform 1 from public.kd_motn_sync where singleton and run_mode='sync' for update;
  if not found then return jsonb_build_object('ok',false,'status','probe_only'); end if;
  return public.kd_motn_commit_sync_page(p_token,p_kind,p_cursor,p_next_cursor,p_records,p_skipped);
end $$;
revoke all on function public.kd_motn_probe_result(uuid,boolean),public.kd_motn_commit_page(uuid,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.kd_motn_probe_result(uuid,boolean),public.kd_motn_commit_page(uuid,text,text,text,jsonb,integer) to service_role;
notify pgrst,'reload schema';
commit;
