-- Some Watchmode inventory rows have no IMDb/TMDb IDs. Only exact title or
-- original title plus reference year and media type can acknowledge them.
-- Conflicting external IDs or multiple Watchmode candidates remain blocked.
begin;
create or replace function public.kd_motn_reconcile_watchmode() returns jsonb
language plpgsql security definer set search_path = pg_catalog,public as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  with wm as materialized (
    select t->>'watchmode_id' id,t->>'imdb_id' imdb,t->>'tmdb_id' tmdb,t->'dienste' services,t->>'jahr' release_year,
      lower(trim(t->>'titel')) title,lower(trim(t->>'originaltitel')) original_title,
      case when t->>'typ' in ('movie','film') then 'film'
        when t->>'typ' in ('tv_series','serie','series') then 'serie' end media_type
    from public.kd_catalog c cross join lateral jsonb_array_elements(c.payload->'titel') t
    where c.name in ('streaming_entdecken','streaming_bekannt') and t->>'watchmode_id' is not null
  ), wm_keys as materialized (
    select wm.*,k.identity_key from wm cross join lateral
      (values ('imdb:'||imdb),('tmdb:'||media_type||':'||tmdb),
        ('title:'||media_type||':'||release_year||':'||title),
        ('title:'||media_type||':'||release_year||':'||original_title)) k(identity_key)
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
      ('tmdb:'||(m.show_data->>'typ')||':'||(m.show_data->>'tmdb_id')),
      ('title:'||(m.show_data->>'typ')||':'||(m.show_data->>'jahr')||':'||lower(trim(m.show_data->>'titel'))),
      ('title:'||(m.show_data->>'typ')||':'||(m.show_data->>'jahr')||':'||lower(trim(m.show_data->>'originaltitel')))) k(identity_key)
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

-- Exhausting the initial allowance still permits the next normal daily run.
create or replace function public.kd_motn_finish(p_token uuid,p_status text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service required' using errcode='42501'; end if;
  if p_status not in ('succeeded','limited','error') then raise exception 'invalid status'; end if;
  update public.kd_motn_sync set lease_token=null,lease_until=null,last_status=p_status,
    bootstrap_completed_at=case when p_status='succeeded' or (p_status='limited' and (select count(*) from public.kd_motn_requests)>=80) then coalesce(bootstrap_completed_at,now()) else bootstrap_completed_at end
    where singleton and lease_token=p_token;
  return jsonb_build_object('ok',found);
end $$;
notify pgrst,'reload schema';
commit;
