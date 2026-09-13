-- MotN supplements AT subscription availability. Watchmode payloads and all
-- personal account data remain in their existing tables.
begin;

create table public.kd_motn_offers (
  show_id text not null check (show_id ~ '^[0-9]{1,12}$'),
  service_id text not null check (service_id in ('netflix','prime','disney','apple','hbo','paramount','mubi','crunchyroll','rtl')),
  country text not null default 'AT' check (country = 'AT'),
  available boolean not null,
  event_at timestamptz not null,
  added_at timestamptz,
  checked_at timestamptz not null,
  watchmode_seen_at timestamptz,
  link text check (link is null or link ~ '^https://'),
  show_data jsonb not null check (jsonb_typeof(show_data) = 'object' and show_data->>'motn_id' = show_id),
  primary key(show_id, service_id),
  check (not available or link is not null),
  check (added_at is null or added_at <= checked_at)
);
create table public.kd_motn_sync (
  singleton boolean primary key default true check (singleton),
  checkpoints jsonb not null default '{}'::jsonb,
  lease_token uuid,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_status text not null default 'empty',
  accepted bigint not null default 0,
  skipped bigint not null default 0
);
insert into public.kd_motn_sync(singleton) values(true);
create table public.kd_motn_requests (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  kind text not null check(kind in ('new','removed','comparison')),
  run_token uuid
);
create index kd_motn_requests_started on public.kd_motn_requests(started_at);
-- Four completed, catalog-free comparison calls on this same subscription.
insert into public.kd_motn_requests(started_at,kind)
select '2026-09-13T14:05:00Z'::timestamptz, 'comparison' from generate_series(1,4);

alter table public.kd_motn_offers enable row level security;
alter table public.kd_motn_sync enable row level security;
alter table public.kd_motn_requests enable row level security;
revoke all on public.kd_motn_offers, public.kd_motn_sync, public.kd_motn_requests from public, anon, authenticated;
grant select on public.kd_motn_offers to authenticated;
create policy kd_motn_offers_read_active on public.kd_motn_offers for select to authenticated
  using ((select public.kd_account_active()));
grant all on public.kd_motn_offers, public.kd_motn_sync, public.kd_motn_requests to service_role;
grant usage on sequence public.kd_motn_requests_id_seq to service_role;

create function public.kd_motn_claim(p_token uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.kd_motn_sync%rowtype; k text; c jsonb; result jsonb := '{}'::jsonb; epoch_now bigint := extract(epoch from now())::bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  select * into s from public.kd_motn_sync where singleton for update;
  if s.lease_until > now() then return jsonb_build_object('ok',true,'claimed',false,'status','busy'); end if;
  if s.last_run_at > now() - interval '20 hours' then return jsonb_build_object('ok',true,'claimed',false,'status','not_due'); end if;
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

create function public.kd_motn_reserve(p_token uuid,p_kind text) returns jsonb
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
  if rolling >= 900 or daily >= 24 then return jsonb_build_object('reserved',false,'status','quota_limit'); end if;
  insert into public.kd_motn_requests(kind,run_token) values(p_kind,p_token);
  return jsonb_build_object('reserved',true);
end $$;

create function public.kd_motn_commit_page(p_token uuid,p_kind text,p_cursor text,p_next_cursor text,p_records jsonb,p_skipped integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.kd_motn_sync%rowtype; c jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  select * into s from public.kd_motn_sync where singleton for update;
  c := s.checkpoints->p_kind;
  if p_token is null or s.lease_token is null or s.lease_until is null
    or s.lease_token is distinct from p_token or s.lease_until <= now() or c is null
    or c->>'cursor' is distinct from p_cursor or coalesce((c->>'done')::boolean,false)
    or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records)>25 or p_skipped not between 0 and 25 then
    return jsonb_build_object('ok',false,'status','invalid_page'); end if;
  insert into public.kd_motn_offers(show_id,service_id,country,available,event_at,added_at,checked_at,link,show_data)
  select distinct on (r.show_id,r.service_id) r.show_id,r.service_id,r.country,r.available,r.event_at,r.added_at,r.checked_at,r.link,r.show_data
    from jsonb_to_recordset(p_records) as r(show_id text,service_id text,country text,available boolean,event_at timestamptz,added_at timestamptz,checked_at timestamptz,link text,show_data jsonb)
    order by r.show_id,r.service_id,r.event_at desc
  on conflict(show_id,service_id) do update set
    available=excluded.available,event_at=excluded.event_at,
    added_at=case when public.kd_motn_offers.available and excluded.available
      then least(public.kd_motn_offers.added_at,excluded.added_at) else excluded.added_at end,
    watchmode_seen_at=case when public.kd_motn_offers.available and excluded.available
      then public.kd_motn_offers.watchmode_seen_at else null end,
    checked_at=excluded.checked_at,link=excluded.link,show_data=excluded.show_data
  where excluded.checked_at >= public.kd_motn_offers.checked_at;
  c := c || jsonb_build_object('cursor',p_next_cursor,'done',p_next_cursor is null);
  update public.kd_motn_sync set checkpoints=jsonb_set(checkpoints,array[p_kind],c),
    accepted=accepted+jsonb_array_length(p_records),skipped=skipped+p_skipped,last_success_at=now() where singleton;
  return jsonb_build_object('ok',true);
end $$;

create function public.kd_motn_finish(p_token uuid,p_status text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  if p_status not in ('succeeded','limited','error') then raise exception 'invalid status'; end if;
  update public.kd_motn_sync set lease_token=null,lease_until=null,last_status=p_status
    where singleton and lease_token=p_token;
  return jsonb_build_object('ok',found);
end $$;

create function public.kd_motn_reconcile_watchmode() returns jsonb
language plpgsql security definer set search_path = pg_catalog,public as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  with wm as materialized (
    select t->>'watchmode_id' id,t->>'imdb_id' imdb,t->>'tmdb_id' tmdb,t->'dienste' services,
      case when t->>'typ' in ('movie','film') then 'film'
        when t->>'typ' in ('tv_series','serie','series') then 'serie' end media_type
    from public.kd_catalog c cross join lateral jsonb_array_elements(c.payload->'titel') t
    where c.name in ('streaming_entdecken','streaming_bekannt') and t->>'watchmode_id' is not null
  ), wm_keys as materialized (
    select wm.*,k.identity_key from wm cross join lateral
      (values ('imdb:'||imdb),('tmdb:'||media_type||':'||tmdb)) k(identity_key)
    where k.identity_key is not null
  ), services(id,name) as (values ('netflix','Netflix'),('prime','Prime Video'),('disney','Disney+'),
    ('apple','AppleTV+'),('hbo','HBO Max'),('paramount','Paramount Plus'),('mubi','MUBI'),
    ('crunchyroll','Crunchyroll Premium'),('rtl','RTL+')),
  matches as (
    select m.show_id,m.service_id,count(distinct w.id) candidates,
      bool_or(w.services ? s.name) service_present,
      bool_and(coalesce(w.media_type=m.show_data->>'typ',false)
        and (w.imdb is null or m.show_data->>'imdb_id' is null or w.imdb=m.show_data->>'imdb_id')
        and (w.tmdb is null or m.show_data->>'tmdb_id' is null or w.tmdb=m.show_data->>'tmdb_id')) identities_agree
    from public.kd_motn_offers m join services s on s.id=m.service_id
    cross join lateral (values ('imdb:'||(m.show_data->>'imdb_id')),
      ('tmdb:'||(m.show_data->>'typ')||':'||(m.show_data->>'tmdb_id'))) k(identity_key)
    join wm_keys w on w.identity_key=k.identity_key
    where m.available and m.watchmode_seen_at is null
    group by m.show_id,m.service_id
  )
  update public.kd_motn_offers m set watchmode_seen_at=now() from matches x
    where m.show_id=x.show_id and m.service_id=x.service_id
      and x.candidates=1 and x.service_present and x.identities_agree;
  get diagnostics changed=row_count;
  return jsonb_build_object('ok',true,'acknowledged',changed);
end $$;

-- Same atomic HTTP read/cache boundary as the existing catalog read. A later
-- Watchmode upload cannot erase MotN corrections or resurrect removed offers.
create function public.kd_streaming_catalog(p_name text)
returns table(payload jsonb,updated_at timestamptz,quelle text,stand timestamptz,gueltig_bis timestamptz)
language sql stable security invoker set search_path = pg_catalog,public as $$
  select c.payload || jsonb_build_object('motn',jsonb_build_object('format',1,'country','AT',
      'offers',coalesce((select jsonb_agg(to_jsonb(m) order by m.show_id,m.service_id) from public.kd_motn_offers m),'[]'::jsonb))),
    c.updated_at,c.quelle,c.stand,c.gueltig_bis
  from public.kd_catalog c where c.name=p_name and p_name in ('streaming','streaming_bekannt','streaming_entdecken') limit 1
$$;

revoke all on function public.kd_motn_claim(uuid),public.kd_motn_reserve(uuid,text),
  public.kd_motn_commit_page(uuid,text,text,text,jsonb,integer),public.kd_motn_finish(uuid,text) from public,anon,authenticated;
grant execute on function public.kd_motn_claim(uuid),public.kd_motn_reserve(uuid,text),
  public.kd_motn_commit_page(uuid,text,text,text,jsonb,integer),public.kd_motn_finish(uuid,text) to service_role;
revoke all on function public.kd_motn_reconcile_watchmode() from public,anon,authenticated;
grant execute on function public.kd_motn_reconcile_watchmode() to service_role;
revoke all on function public.kd_streaming_catalog(text) from public,anon;
grant execute on function public.kd_streaming_catalog(text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
