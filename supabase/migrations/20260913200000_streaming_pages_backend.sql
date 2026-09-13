-- Progressive, authenticated Streaming pages over a reusable neutral projection.
-- The source catalog and MotN tables remain authoritative and are never changed here.
begin;

create table public.kd_streaming_page_state (
  singleton boolean primary key default true check (singleton),
  source_revision bigint not null default 0 check (source_revision >= 0),
  generated_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object')
);
insert into public.kd_streaming_page_state(singleton) values (true);

create table public.kd_streaming_page_base (
  source_key text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  services text[] not null default '{}',
  genres text[] not null default '{}',
  aliases text[] not null default '{}',
  identity_keys text[] not null default '{}',
  title_keys text[] not null default '{}',
  title_norms text[] not null default '{}',
  title_sort text,
  title_order text,
  provider_sort text,
  work_type text,
  release_year integer,
  watchmode_id text,
  imdb_id text,
  tmdb_id text,
  known boolean not null default false
);

create table public.kd_streaming_page_motn (
  show_id text primary key,
  base_key text,
  output_key text not null unique,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  services text[] not null default '{}',
  genres text[] not null default '{}',
  aliases text[] not null default '{}',
  identity_keys text[] not null default '{}',
  title_keys text[] not null default '{}',
  title_norms text[] not null default '{}',
  title_sort text,
  title_order text,
  provider_sort text,
  work_type text,
  release_year integer,
  watchmode_id text,
  imdb_id text,
  tmdb_id text,
  known boolean not null default false,
  hidden boolean not null default false,
  match_kind text not null check (match_kind in ('strong-id','title-year-type','unmatched'))
);

create index kd_streaming_page_base_services on public.kd_streaming_page_base using gin(services);
create index kd_streaming_page_base_identity on public.kd_streaming_page_base using gin(identity_keys);
create index kd_streaming_page_base_titles on public.kd_streaming_page_base using gin(title_keys);
create index kd_streaming_page_base_title_norms on public.kd_streaming_page_base using gin(title_norms);
create index kd_streaming_page_base_imdb on public.kd_streaming_page_base(imdb_id) where imdb_id is not null;
create index kd_streaming_page_base_tmdb on public.kd_streaming_page_base(work_type,tmdb_id) where tmdb_id is not null;
create index kd_streaming_page_base_title_fallback on public.kd_streaming_page_base(work_type,release_year);
create index kd_streaming_page_motn_services on public.kd_streaming_page_motn using gin(services);
create index kd_streaming_page_motn_base on public.kd_streaming_page_motn(base_key);

alter table public.kd_streaming_page_state enable row level security;
alter table public.kd_streaming_page_base enable row level security;
alter table public.kd_streaming_page_motn enable row level security;
revoke all on public.kd_streaming_page_state, public.kd_streaming_page_base,
  public.kd_streaming_page_motn from public, anon, authenticated;
grant all on public.kd_streaming_page_state, public.kd_streaming_page_base,
  public.kd_streaming_page_motn to service_role;

create function public.kd_streaming_page_text(p_value jsonb) returns text
language sql immutable set search_path = pg_catalog as $$
  select nullif(btrim(case when jsonb_typeof(p_value) in ('string','number')
    then p_value #>> '{}' else '' end),'')
$$;

create function public.kd_streaming_page_type(p_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case lower(btrim(coalesce(p_value,'')))
    when 'film' then 'film' when 'movie' then 'film'
    when 'serie' then 'series' when 'series' then 'series'
    when 'tv' then 'series' when 'tv_series' then 'series'
    when 'tv series' then 'series' when 'show' then 'series'
    else null end
$$;

create function public.kd_streaming_page_title_norm(p_value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select nullif(btrim(regexp_replace(translate(lower(coalesce(p_value,'')),
    'áàâäãåāăąçćčďđéèêëēėęěíìîïīłľńňñóòôöõøōřŕśšťúùûüūůýÿžźżæœß',
    'aaaaaaaaacccddeeeeeeeeiiiiillnnnooooooorrsstuuuuuuyyzzzaos'),
    '[^a-z0-9]+',' ','g')),'')
$$;

-- Portable numeric title order ("Film 2" before "Film 10") on the same
-- accent/case-insensitive German-facing normalization used by the UI filters.
create function public.kd_streaming_page_natural_key(p_value text) returns text
language sql immutable set search_path = pg_catalog, public as $$
  select case when public.kd_streaming_page_title_norm(p_value) is null then null else coalesce((
    select string_agg(case when part[1]~'^[0-9]+$'
      then chr(1)||lpad(length(trim(leading '0' from part[1]))::text,6,'0')
        ||coalesce(nullif(trim(leading '0' from part[1]),''),'0')
      else chr(2)||part[1] end,'' order by ord)
      from regexp_matches(public.kd_streaming_page_title_norm(p_value),'([0-9]+|[^0-9]+)','g')
        with ordinality x(part,ord)
  ),'') end
$$;

create function public.kd_streaming_page_timestamp(p_value text) returns timestamptz
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_value is null or length(p_value) > 64 then return null; end if;
  return p_value::timestamptz;
exception when others then return null;
end
$$;

create function public.kd_streaming_page_neutralize(p_item jsonb) returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select coalesce(p_item,'{}'::jsonb)
    - array['id','bewertung','bewertet_von','begruendung','kategorie','must_watch',
      'notiz','status','gesehen','eigene_stimmungen','prognose','prognose_freigabe']
$$;

create function public.kd_streaming_page_stream_key(p_item jsonb) returns text
language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(public.kd_streaming_page_text(p_item->'watchmode_id'),
    public.kd_streaming_page_text(p_item->'watchmodeId'),
    public.kd_streaming_page_text(p_item->'streaming_id'))
$$;

create function public.kd_streaming_page_aliases(p_item jsonb) returns text[]
language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(array(
    select v from (
      select public.kd_streaming_page_stream_key(p_item) v, 0 ord
      union all
      select nullif(btrim(a.value),''), a.ordinality::integer
      from jsonb_array_elements_text(case when jsonb_typeof(p_item->'streaming_aliases')='array'
        then p_item->'streaming_aliases' else '[]'::jsonb end) with ordinality a(value,ordinality)
    ) x where v is not null group by v order by min(ord), v
  ),'{}'::text[])
$$;

create function public.kd_streaming_page_identity_keys(p_item jsonb) returns text[]
language sql immutable set search_path = pg_catalog, public as $$
  with v as (
    select public.kd_streaming_page_type(coalesce(p_item->>'typ',p_item->>'type')) typ,
      public.kd_streaming_page_text(coalesce(p_item->'watchmode_id',p_item->'watchmodeId')) watchmode,
      lower(public.kd_streaming_page_text(coalesce(p_item->'imdb_id',p_item->'imdbId'))) imdb,
      public.kd_streaming_page_text(coalesce(p_item->'tmdb_id',p_item->'tmdbId')) tmdb,
      public.kd_streaming_page_aliases(p_item) aliases
  )
  select coalesce(array(select distinct key from (
    select case when watchmode ~ '^[1-9][0-9]*$' then 'watchmode:'||watchmode end key from v
    union all select case when imdb ~ '^tt[0-9]{5,12}$' then 'imdb:'||imdb end from v
    union all select case when typ is not null and tmdb ~ '^[1-9][0-9]*$' then 'tmdb:'||typ||':'||tmdb end from v
    union all select 'streaming:'||a from v cross join unnest(aliases) a where a is not null
  ) q where key is not null order by key),'{}'::text[])
$$;

create function public.kd_streaming_page_title_norms(p_item jsonb) returns text[]
language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(array(select distinct v from (values
    (public.kd_streaming_page_title_norm(coalesce(p_item->>'titel',p_item->>'title'))),
    (public.kd_streaming_page_title_norm(coalesce(p_item->>'originaltitel',p_item->>'originalTitle')))
  ) x(v) where v is not null order by v),'{}'::text[])
$$;

create function public.kd_streaming_page_title_keys(p_item jsonb) returns text[]
language sql immutable set search_path = pg_catalog, public as $$
  with v as (
    select public.kd_streaming_page_type(coalesce(p_item->>'typ',p_item->>'type')) typ,
      case when coalesce(p_item->>'jahr',p_item->>'year') ~ '^[0-9]{4}$'
        then coalesce(p_item->>'jahr',p_item->>'year')::integer end jahr,
      public.kd_streaming_page_title_norms(p_item) titles
  )
  select coalesce(array(select typ||':'||jahr::text||':'||title
    from v cross join unnest(titles) title
    where typ is not null and jahr between 1870 and 2999 order by title),'{}'::text[])
$$;

create function public.kd_streaming_page_services(p_item jsonb) returns text[]
language sql immutable set search_path = pg_catalog as $$
  select coalesce(array(select distinct btrim(value) from jsonb_array_elements_text(
    case when jsonb_typeof(p_item->'dienste')='array' then p_item->'dienste' else '[]'::jsonb end)
    where btrim(value)<>'' order by btrim(value)),'{}'::text[])
$$;

create function public.kd_streaming_page_genres(p_item jsonb) returns text[]
language sql immutable set search_path = pg_catalog as $$
  select coalesce(array(select distinct btrim(value) from jsonb_array_elements_text(
    case when jsonb_typeof(coalesce(p_item->'genres',p_item->'genre'))='array'
      then coalesce(p_item->'genres',p_item->'genre') else '[]'::jsonb end)
    where btrim(value)<>'' order by btrim(value)),'{}'::text[])
$$;

create function public.kd_streaming_page_bump(p_meta jsonb default null) returns void
language sql volatile security definer set search_path = pg_catalog, public as $$
  update public.kd_streaming_page_state
     set source_revision=source_revision+1, generated_at=now(),
         meta=coalesce(p_meta,meta)
   where singleton
$$;

create function public.kd_streaming_page_rebuild_motn(p_show_id text, p_bump boolean default true)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  v_data jsonb; v_checked timestamptz; v_base_key text; v_payload jsonb;
  v_services text[]; v_aliases text[]; v_web jsonb; v_zugaenge jsonb := '[]'::jsonb;
  v_type text; v_year integer; v_imdb text; v_tmdb text; v_strong_count integer;
  v_title_valid integer; v_title_conflict integer; v_match text; v_hidden boolean := false;
  v_snapshot_services jsonb; v_snapshot_offers jsonb; r record;
begin
  delete from public.kd_streaming_page_motn where show_id=p_show_id;
  select show_data,checked_at into v_data,v_checked from public.kd_motn_offers
    where show_id=p_show_id order by checked_at desc,service_id limit 1;
  if not found then if p_bump then perform public.kd_streaming_page_bump(); end if; return; end if;
  v_type := public.kd_streaming_page_type(v_data->>'typ');
  v_year := case when v_data->>'jahr' ~ '^[0-9]{4}$' then (v_data->>'jahr')::integer end;
  v_imdb := case when lower(v_data->>'imdb_id') ~ '^tt[0-9]{5,12}$' then lower(v_data->>'imdb_id') end;
  v_tmdb := case when v_data->>'tmdb_id' ~ '^[1-9][0-9]*$' then v_data->>'tmdb_id' end;
  if v_imdb is null and (v_type is null or v_tmdb is null) then
    if p_bump then perform public.kd_streaming_page_bump(); end if; return;
  end if;

  select count(*)::integer,min(source_key) into v_strong_count,v_base_key
    from public.kd_streaming_page_base b
   where (v_imdb is not null and b.imdb_id=v_imdb)
      or (v_type is not null and v_tmdb is not null and b.work_type=v_type and b.tmdb_id=v_tmdb);
  if v_strong_count=1 then
    select case when (v_type is not null and b.work_type is not null and v_type<>b.work_type)
        or (v_imdb is not null and b.imdb_id is not null and v_imdb<>b.imdb_id)
        or (v_tmdb is not null and b.tmdb_id is not null and v_tmdb<>b.tmdb_id)
      then null else b.source_key end into v_base_key
      from public.kd_streaming_page_base b where b.source_key=v_base_key;
    if v_base_key is null then if p_bump then perform public.kd_streaming_page_bump(); end if; return; end if;
    v_match := 'strong-id';
  elsif v_strong_count>1 then
    if p_bump then perform public.kd_streaming_page_bump(); end if; return;
  else
    select count(*) filter(where not (
        (v_imdb is not null and b.imdb_id is not null and v_imdb<>b.imdb_id)
        or (v_tmdb is not null and b.tmdb_id is not null and v_tmdb<>b.tmdb_id)))::integer,
      count(*) filter(where (v_imdb is not null and b.imdb_id is not null and v_imdb<>b.imdb_id)
        or (v_tmdb is not null and b.tmdb_id is not null and v_tmdb<>b.tmdb_id))::integer,
      min(b.source_key) filter(where not (
        (v_imdb is not null and b.imdb_id is not null and v_imdb<>b.imdb_id)
        or (v_tmdb is not null and b.tmdb_id is not null and v_tmdb<>b.tmdb_id)))
      into v_title_valid,v_title_conflict,v_base_key
      from public.kd_streaming_page_base b
     where v_type is not null and v_year is not null and b.work_type=v_type and b.release_year=v_year
       and b.title_norms && public.kd_streaming_page_title_norms(v_data);
    if v_title_valid=1 and v_title_conflict=0 then v_match := 'title-year-type';
    else v_base_key := null; end if;
  end if;

  if v_base_key is not null then
    select payload,services,aliases into v_payload,v_services,v_aliases
      from public.kd_streaming_page_base where source_key=v_base_key;
  else
    if not exists(select 1 from public.kd_motn_offers
      where show_id=p_show_id and available and watchmode_seen_at is null) then
      if p_bump then perform public.kd_streaming_page_bump(); end if; return;
    end if;
    v_match := 'unmatched';
    v_payload := public.kd_streaming_page_neutralize(v_data)
      || jsonb_build_object('watchmode_id',null,'streaming_id','motn:'||p_show_id,
        'relevanz',0,'relevanz_signale','[]'::jsonb);
    v_services := '{}'; v_aliases := array['motn:'||p_show_id];
  end if;
  v_web := case when jsonb_typeof(v_payload->'web_urls')='object' then v_payload->'web_urls' else '{}'::jsonb end;
  v_aliases := array(select distinct x from unnest(v_aliases || array['motn:'||p_show_id]
    || case when v_payload->>'watchmode_id' is null then '{}'::text[] else array[v_payload->>'watchmode_id'] end) x order by x);
  v_snapshot_services := v_data->'at_subscription_services';
  v_snapshot_offers := v_data->'at_subscription_offers';
  if jsonb_typeof(v_snapshot_services)='array' then
    for r in select * from (values ('netflix','Netflix'),('prime','Prime Video'),('disney','Disney+'),
      ('apple','AppleTV+'),('hbo','HBO Max'),('paramount','Paramount Plus'),('mubi','MUBI'),
      ('crunchyroll','Crunchyroll Premium'),('rtl','RTL+')) s(service_id,service_name)
    loop
      if not (v_snapshot_services ? r.service_id) then
        v_services := array_remove(v_services,r.service_name); v_web := v_web-r.service_name;
      end if;
    end loop;
  end if;
  for r in
    select o.*,s.service_name from public.kd_motn_offers o join (values
      ('netflix','Netflix'),('prime','Prime Video'),('disney','Disney+'),('apple','AppleTV+'),
      ('hbo','HBO Max'),('paramount','Paramount Plus'),('mubi','MUBI'),
      ('crunchyroll','Crunchyroll Premium'),('rtl','RTL+')) s(service_id,service_name)
      on s.service_id=o.service_id where o.show_id=p_show_id order by o.service_id
  loop
    if not r.available then
      v_services := array_remove(v_services,r.service_name); v_web := v_web-r.service_name;
    elsif r.watchmode_seen_at is null or r.service_name=any(v_services) then
      if not r.service_name=any(v_services) then v_services := v_services||r.service_name; end if;
      if r.link is not null then v_web := v_web||jsonb_build_object(r.service_name,r.link); end if;
      if r.added_at is not null and r.added_at<=now() then
        v_zugaenge := v_zugaenge||jsonb_build_array(jsonb_build_object('dienst',r.service_name,'erkannt_am',r.added_at));
      end if;
    end if;
  end loop;
  select coalesce(array_agg(distinct x order by x),'{}') into v_services from unnest(v_services) x;
  v_payload := v_payload || jsonb_build_object('motn_id',p_show_id,'motn_match',v_match,
    'streaming_aliases',to_jsonb(v_aliases),'motn_zugaenge',v_zugaenge,
    'motn_checked_at',v_checked,'motn_source_url','https://www.movieofthenight.com/about/api',
    'dienste',to_jsonb(v_services),'web_urls',v_web);
  if v_payload->>'imdb_id' is null and v_imdb is not null then v_payload:=v_payload||jsonb_build_object('imdb_id',v_imdb); end if;
  if v_payload->>'tmdb_id' is null and v_tmdb is not null then v_payload:=v_payload||jsonb_build_object('tmdb_id',v_tmdb); end if;
  if v_base_key is not null and jsonb_typeof(v_payload->'dienst_diffs')='array' then
    v_payload := jsonb_set(v_payload,'{dienst_diffs}',coalesce((select jsonb_agg(d)
      from jsonb_array_elements(v_payload->'dienst_diffs') d where not exists(
        select 1 from public.kd_motn_offers o join (values ('netflix','Netflix'),('prime','Prime Video'),
          ('disney','Disney+'),('apple','AppleTV+'),('hbo','HBO Max'),('paramount','Paramount Plus'),
          ('mubi','MUBI'),('crunchyroll','Crunchyroll Premium'),('rtl','RTL+')) s(id,name) on s.id=o.service_id
         where o.show_id=p_show_id and s.name=d->>'dienst')),'[]'::jsonb));
  end if;
  v_hidden := cardinality(v_services)=0;
  insert into public.kd_streaming_page_motn(show_id,base_key,output_key,payload,services,genres,aliases,
    identity_keys,title_keys,title_norms,title_sort,title_order,provider_sort,work_type,release_year,
    watchmode_id,imdb_id,tmdb_id,known,hidden,match_kind)
  select p_show_id,v_base_key,coalesce(v_base_key,'motn:'||p_show_id),v_payload,v_services,
    public.kd_streaming_page_genres(v_payload),public.kd_streaming_page_aliases(v_payload),
    public.kd_streaming_page_identity_keys(v_payload),public.kd_streaming_page_title_keys(v_payload),
    public.kd_streaming_page_title_norms(v_payload),public.kd_streaming_page_title_norm(v_payload->>'titel'),
    public.kd_streaming_page_natural_key(v_payload->>'titel'),
    (select min(x) from unnest(v_services)x),public.kd_streaming_page_type(v_payload->>'typ'),
    case when v_payload->>'jahr'~'^[0-9]{4}$' then (v_payload->>'jahr')::integer end,
    case when v_payload->>'watchmode_id'~'^[1-9][0-9]*$' then v_payload->>'watchmode_id' end,
    case when lower(v_payload->>'imdb_id')~'^tt[0-9]{5,12}$' then lower(v_payload->>'imdb_id') end,
    case when v_payload->>'tmdb_id'~'^[1-9][0-9]*$' then v_payload->>'tmdb_id' end,
    coalesce((select known from public.kd_streaming_page_base where source_key=v_base_key),false),v_hidden,v_match
  on conflict(output_key) do nothing;
  if p_bump then perform public.kd_streaming_page_bump(); end if;
end
$$;

create function public.kd_streaming_page_refresh() returns boolean
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_known jsonb; v_discover jsonb; v_known_row public.kd_catalog%rowtype;
  v_discover_row public.kd_catalog%rowtype; v_known_stand text; v_discover_stand text; r record; v_meta jsonb;
begin
  select * into v_known_row from public.kd_catalog where name='streaming_bekannt';
  select * into v_discover_row from public.kd_catalog where name='streaming_entdecken';
  if v_discover_row.name is null or jsonb_typeof(v_discover_row.payload->'titel')<>'array' then return false; end if;
  v_known:=coalesce(v_known_row.payload,'{"titel":[]}'::jsonb); v_discover:=v_discover_row.payload;
  v_known_stand:=nullif(v_known->>'katalog_stand',''); v_discover_stand:=nullif(v_discover->>'katalog_stand','');
  if v_known_row.name is not null and v_known_stand is distinct from v_discover_stand then return false; end if;
  delete from public.kd_streaming_page_motn; delete from public.kd_streaming_page_base;
  with raw as (
    select public.kd_streaming_page_stream_key(item) source_key,item,1 lane,ord::bigint
      from jsonb_array_elements(v_discover->'titel') with ordinality x(item,ord)
    union all
    select public.kd_streaming_page_stream_key(item),item,2,ord::bigint
      from jsonb_array_elements(case when jsonb_typeof(v_known->'titel')='array' then v_known->'titel' else '[]'::jsonb end)
        with ordinality x(item,ord)
  ), valid as (select * from raw where source_key is not null), winners as (
    select distinct on(source_key) source_key,item,lane,ord from valid order by source_key,lane desc,ord desc
  ), service_values as (
    select source_key,value,min(lane*1000000000+ord*10000+aord)::bigint first_pos
      from valid cross join lateral jsonb_array_elements_text(case when jsonb_typeof(item->'dienste')='array'
        then item->'dienste' else '[]'::jsonb end) with ordinality a(value,aord)
     where btrim(value)<>'' group by source_key,value
  ), services as (
    select source_key,jsonb_agg(value order by first_pos) value from service_values group by source_key
  ), genre_values as (
    select source_key,value,min(lane*1000000000+ord*10000+aord)::bigint first_pos
      from valid cross join lateral jsonb_array_elements_text(case when jsonb_typeof(coalesce(item->'genres',item->'genre'))='array'
        then coalesce(item->'genres',item->'genre') else '[]'::jsonb end) with ordinality a(value,aord)
     where btrim(value)<>'' group by source_key,value
  ), genres as (
    select source_key,jsonb_agg(value order by first_pos) value from genre_values group by source_key
  ), diffs as (
    select distinct on(source_key) source_key,item->'dienst_diffs' value from valid
      where jsonb_typeof(item->'dienst_diffs')='array' order by source_key,lane desc,ord desc
  ), arrays as (
    select v.source_key,coalesce(s.value,'[]'::jsonb) services,coalesce(g.value,'[]'::jsonb) genres,
      d.value diffs,bool_or(v.lane=2) known from valid v left join services s using(source_key)
      left join genres g using(source_key) left join diffs d using(source_key)
     group by v.source_key,s.value,g.value,d.value
  ), projected as (
    select w.source_key,
      public.kd_streaming_page_neutralize((w.item- 'dienst_diffs') || jsonb_build_object('dienste',a.services,'genres',a.genres)
        || case when a.diffs is null then '{}'::jsonb else jsonb_build_object('dienst_diffs',a.diffs) end) payload,a.known
      from winners w join arrays a using(source_key)
  )
  insert into public.kd_streaming_page_base(source_key,payload,services,genres,aliases,identity_keys,title_keys,title_norms,
    title_sort,title_order,provider_sort,work_type,release_year,watchmode_id,imdb_id,tmdb_id,known)
  select source_key,payload,public.kd_streaming_page_services(payload),public.kd_streaming_page_genres(payload),
    public.kd_streaming_page_aliases(payload),public.kd_streaming_page_identity_keys(payload),
    public.kd_streaming_page_title_keys(payload),public.kd_streaming_page_title_norms(payload),
    public.kd_streaming_page_title_norm(payload->>'titel'),
    public.kd_streaming_page_natural_key(payload->>'titel'),
    (select min(x) from unnest(public.kd_streaming_page_services(payload)) x),
    public.kd_streaming_page_type(payload->>'typ'),
    case when payload->>'jahr'~'^[0-9]{4}$' then (payload->>'jahr')::integer end,
    case when payload->>'watchmode_id'~'^[1-9][0-9]*$' then payload->>'watchmode_id' end,
    case when lower(payload->>'imdb_id')~'^tt[0-9]{5,12}$' then lower(payload->>'imdb_id') end,
    case when payload->>'tmdb_id'~'^[1-9][0-9]*$' then payload->>'tmdb_id' end,known from projected;
  for r in select distinct show_id from public.kd_motn_offers order by show_id loop
    perform public.kd_streaming_page_rebuild_motn(r.show_id,false);
  end loop;
  v_meta:=jsonb_build_object('stand',coalesce(v_discover->'stand',v_known->'stand',to_jsonb(v_discover_row.stand)),
    'katalog_stand',coalesce(v_discover->'katalog_stand',v_known->'katalog_stand',to_jsonb(v_discover_row.stand)),
    'gueltig_bis',to_jsonb(v_discover_row.gueltig_bis),
    'stand_pro_quelle',coalesce(v_known->'stand_pro_quelle','{}')||coalesce(v_discover->'stand_pro_quelle','{}'),
    'vergleich_stand_pro_quelle',coalesce(v_known->'vergleich_stand_pro_quelle','{}')||coalesce(v_discover->'vergleich_stand_pro_quelle','{}'));
  perform public.kd_streaming_page_bump(v_meta); return true;
end
$$;

create function public.kd_streaming_page_catalog_changed() returns trigger
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if exists(select 1 from new_rows where name in ('streaming_bekannt','streaming_entdecken')) then
    perform public.kd_streaming_page_refresh();
  end if; return null;
end
$$;
create function public.kd_streaming_page_catalog_deleted() returns trigger
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if exists(select 1 from old_rows where name in ('streaming_bekannt','streaming_entdecken')) then
    perform public.kd_streaming_page_refresh();
  end if; return null;
end
$$;
create trigger kd_streaming_page_catalog_insert after insert on public.kd_catalog
  referencing new table as new_rows for each statement execute function public.kd_streaming_page_catalog_changed();
create trigger kd_streaming_page_catalog_update after update on public.kd_catalog
  referencing new table as new_rows for each statement execute function public.kd_streaming_page_catalog_changed();
create trigger kd_streaming_page_catalog_delete after delete on public.kd_catalog
  referencing old table as old_rows for each statement execute function public.kd_streaming_page_catalog_deleted();

create function public.kd_streaming_page_motn_changed() returns trigger
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if tg_op='DELETE' then
    perform public.kd_streaming_page_rebuild_motn(old.show_id,true);
  elsif tg_op='INSERT' then
    perform public.kd_streaming_page_rebuild_motn(new.show_id,true);
  elsif old.show_id is distinct from new.show_id then
    perform public.kd_streaming_page_rebuild_motn(old.show_id,false);
    perform public.kd_streaming_page_rebuild_motn(new.show_id,true);
  else
    perform public.kd_streaming_page_rebuild_motn(new.show_id,true);
  end if;
  return null;
end
$$;
create trigger kd_streaming_page_motn_row after insert or update or delete on public.kd_motn_offers
  for each row execute function public.kd_streaming_page_motn_changed();

create function public.kd_streaming_page_new_since(p_payload jsonb,p_services text[],p_stands jsonb,
  p_comparisons jsonb,p_now timestamptz) returns timestamptz
language plpgsql stable set search_path = pg_catalog, public as $$
declare current_services text[]:=public.kd_streaming_page_services(p_payload); selected text;
  grp record; v_diff record; before_union boolean; after_union boolean; valid_add boolean;
  access_times timestamptz[]:='{}'; begin_at timestamptz; access_at timestamptz;
begin
  if not current_services && p_services then return null; end if;
  if jsonb_typeof(p_payload->'dienst_diffs')='array' then
    if exists(select 1 from jsonb_array_elements(p_payload->'dienst_diffs') x(value)
      where jsonb_typeof(value)<>'object' or nullif(btrim(value->>'dienst'),'') is null
        or jsonb_typeof(value->'vorher')<>'boolean' or jsonb_typeof(value->'nachher')<>'boolean'
        or public.kd_streaming_page_timestamp(value->>'erkannt_am') is null
        or public.kd_streaming_page_timestamp(value->>'erkannt_am')>p_now) then return null; end if;
    for grp in select public.kd_streaming_page_timestamp(value->>'erkannt_am') at,
        jsonb_agg(value) diffs from jsonb_array_elements(p_payload->'dienst_diffs') x(value)
      group by public.kd_streaming_page_timestamp(value->>'erkannt_am') order by 1 desc
    loop
      if (select count(*)<>count(distinct x->>'dienst') from jsonb_array_elements(grp.diffs)x) then return null; end if;
      after_union:=current_services&&p_services; valid_add:=false;
      for v_diff in select value from jsonb_array_elements(grp.diffs)x(value) loop
        if ((v_diff.value->>'dienst')=any(current_services)) is distinct from ((v_diff.value->>'nachher')::boolean) then return null; end if;
        if (v_diff.value->>'vorher')::boolean then
          if not (v_diff.value->>'dienst')=any(current_services) then current_services:=current_services||(v_diff.value->>'dienst'); end if;
        else current_services:=array_remove(current_services,v_diff.value->>'dienst'); end if;
        if (v_diff.value->>'dienst')=any(p_services) and not (v_diff.value->>'vorher')::boolean and (v_diff.value->>'nachher')::boolean
          and public.kd_streaming_page_timestamp(p_stands->>(v_diff.value->>'dienst'))>=grp.at
          and public.kd_streaming_page_timestamp(p_comparisons->>(v_diff.value->>'dienst'))>=grp.at then valid_add:=true; end if;
      end loop;
      before_union:=current_services&&p_services;
      if not before_union and after_union and valid_add then access_times:=array_prepend(grp.at,access_times); end if;
    end loop;
  end if;
  foreach access_at in array access_times loop
    if begin_at is null or access_at>=begin_at+interval '14 days' then begin_at:=access_at; end if;
  end loop;
  select least(begin_at,min(public.kd_streaming_page_timestamp(x->>'erkannt_am'))) into begin_at
    from jsonb_array_elements(case when jsonb_typeof(p_payload->'motn_zugaenge')='array'
      then p_payload->'motn_zugaenge' else '[]'::jsonb end)x
   where x->>'dienst'=any(p_services) and x->>'dienst'=any(public.kd_streaming_page_services(p_payload))
     and public.kd_streaming_page_timestamp(x->>'erkannt_am')<=p_now;
  return case when begin_at is not null and p_now<begin_at+interval '14 days' then begin_at end;
end
$$;

create function public.kd_streaming_page_cursor_encode(p_value jsonb) returns text
language sql immutable set search_path = pg_catalog as $$
  select rtrim(translate(regexp_replace(encode(convert_to(p_value::text,'UTF8'),'base64'),'\s','','g'),'+/','-_'),'=')
$$;
create function public.kd_streaming_page_cursor_decode(p_value text) returns jsonb
language plpgsql immutable set search_path = pg_catalog as $$
declare v text;
begin
  if p_value is null or length(p_value)>2048 or p_value!~'^[A-Za-z0-9_-]+$' then return null; end if;
  v:=translate(p_value,'-_','+/'); v:=v||repeat('=',(4-length(v)%4)%4);
  return convert_from(decode(v,'base64'),'UTF8')::jsonb;
exception when others then return null;
end
$$;

create function public.kd_streaming_page(p_request jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_role text:=auth.role(); v_account uuid:=auth.uid(); v_services text[]; v_view text;
  v_limit integer; v_cursor_text text; v_cursor jsonb; v_offset integer:=0; v_filters jsonb;
  v_library jsonb; v_personal jsonb; v_source bigint; v_generated timestamptz; v_meta jsonb;
  v_fingerprint text; v_version text; v_counts jsonb; v_total integer; v_items jsonb;
  v_expiry timestamptz; v_next text; v_now timestamptz:=statement_timestamp();
begin
  if v_role is distinct from 'authenticated' or v_account is null then raise exception 'authenticated account required' using errcode='42501'; end if;
  if not public.kd_account_active() then raise exception 'account_inactive' using errcode='42501'; end if;
  if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>4194304
    or p_request->>'format' is distinct from '1' or coalesce(p_request->>'view','') not in ('all','new','library')
    or jsonb_typeof(p_request->'services') is distinct from 'array' or jsonb_array_length(p_request->'services')>64
    or jsonb_typeof(p_request->'filters') is distinct from 'object' or jsonb_typeof(p_request->'library') is distinct from 'array'
    or jsonb_array_length(p_request->'library')>5000 or jsonb_typeof(p_request->'personal') is distinct from 'object'
    or coalesce(p_request->>'limit','')!~'^[0-9]+$' or (p_request->>'limit')::integer not between 1 and 200
    or (p_request->'cursor'<>'null'::jsonb and (jsonb_typeof(p_request->'cursor')<>'string' or length(p_request->>'cursor')>2048))
  then raise exception 'invalid streaming page request' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_request)k where k not in
      ('format','services','view','limit','cursor','filters','library','personal'))
    or exists(select 1 from jsonb_object_keys(p_request->'filters')k where k not in
      ('suche','plattform','typ','genre','dekade','buchstabe','sort','richtung','status','nurWunsch','nurBewertet'))
    or exists(select 1 from jsonb_object_keys(p_request->'personal')k where k not in
      ('seenIds','mustWatchIds','ratedIds','newEntries','legacyNew'))
  then raise exception 'invalid streaming page request fields' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_request->'services')x
      where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 80)
    or exists(select 1 from jsonb_array_elements(p_request->'library')x
      where jsonb_typeof(x)<>'object' or not (x ? 'id') or public.kd_streaming_page_text(x->'id') is null
        or length(public.kd_streaming_page_text(x->'id'))>256 or octet_length(x::text)>4096
        or exists(select 1 from jsonb_object_keys(x)k where k not in
          ('id','watchmode_id','streaming_id','imdb_id','tmdb_id','titel','originaltitel','jahr','typ')))
    or (select count(*)<>count(distinct public.kd_streaming_page_text(x->'id')) from jsonb_array_elements(p_request->'library')x)
    or jsonb_typeof(p_request->'personal'->'seenIds') is distinct from 'array'
    or jsonb_typeof(p_request->'personal'->'mustWatchIds') is distinct from 'array'
    or jsonb_typeof(p_request->'personal'->'ratedIds') is distinct from 'array'
    or jsonb_typeof(p_request->'personal'->'newEntries') is distinct from 'array'
    or jsonb_typeof(p_request->'personal'->'legacyNew') is distinct from 'array'
    or jsonb_array_length(p_request->'personal'->'seenIds')>10000
    or jsonb_array_length(p_request->'personal'->'mustWatchIds')>5000
    or jsonb_array_length(p_request->'personal'->'ratedIds')>5000
    or jsonb_array_length(p_request->'personal'->'newEntries')>5000
    or jsonb_array_length(p_request->'personal'->'legacyNew')>5000
    or exists(select 1 from jsonb_array_elements((p_request->'personal'->'seenIds')
      ||(p_request->'personal'->'mustWatchIds')||(p_request->'personal'->'ratedIds'))x
      where jsonb_typeof(x) not in ('string','number') or public.kd_streaming_page_text(x) is null
        or length(public.kd_streaming_page_text(x))>256)
  then raise exception 'invalid streaming page identities' using errcode='22023'; end if;
  v_filters:=p_request->'filters';
  if coalesce(v_filters->>'sort','titel') not in ('titel','jahr','art','anbieter')
    or coalesce(v_filters->>'richtung','auf') not in ('auf','ab')
    or coalesce(v_filters->>'status','') not in ('','gesehen','ungesehen')
    or coalesce(v_filters->>'typ','') not in ('','movie','tv_series')
    or length(coalesce(v_filters->>'suche',''))>160
    or length(coalesce(v_filters->>'plattform',''))>80
    or length(coalesce(v_filters->>'genre',''))>80
    or length(coalesce(v_filters->>'buchstabe',''))>1
    or (coalesce(v_filters->>'buchstabe','')<>'' and upper(v_filters->>'buchstabe')!~'^[A-Z]$')
    or (v_filters->'nurWunsch' is not null and jsonb_typeof(v_filters->'nurWunsch')<>'boolean')
    or (v_filters->'nurBewertet' is not null and jsonb_typeof(v_filters->'nurBewertet')<>'boolean')
    or (v_filters->'dekade' is not null and v_filters->'dekade'<>'null'::jsonb
      and (v_filters->>'dekade'!~'^[0-9]{4}$' or (v_filters->>'dekade')::integer not between 1880 and 2200))
  then raise exception 'invalid streaming page filters' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_request->'personal'->'newEntries')x
      where jsonb_typeof(x)<>'object' or public.kd_streaming_page_text(x->'id') is null
        or length(public.kd_streaming_page_text(x->'id'))>256
        or public.kd_streaming_page_timestamp(x->>'fensterBeginn') is null
        or public.kd_streaming_page_timestamp(x->>'verbrauchtBis') is null
        or public.kd_streaming_page_timestamp(x->>'verbrauchtBis')<public.kd_streaming_page_timestamp(x->>'fensterBeginn')
        or exists(select 1 from jsonb_object_keys(x)k where k not in ('id','fensterBeginn','verbrauchtBis')))
    or exists(select 1 from jsonb_array_elements(p_request->'personal'->'legacyNew')x
      where jsonb_typeof(x)<>'object' or public.kd_streaming_page_text(x->'id') is null
        or length(public.kd_streaming_page_text(x->'id'))>256
        or public.kd_streaming_page_timestamp(x->>'firstSeenAt') is null
        or exists(select 1 from jsonb_object_keys(x)k where k not in ('id','firstSeenAt')))
  then raise exception 'invalid streaming page time anchors' using errcode='22023'; end if;
  select coalesce(array_agg(distinct btrim(x#>>'{}') order by btrim(x#>>'{}')),'{}') into v_services
    from jsonb_array_elements(p_request->'services')x;
  v_view:=p_request->>'view'; v_limit:=(p_request->>'limit')::integer;
  v_cursor_text:=p_request->>'cursor'; v_library:=p_request->'library'; v_personal:=p_request->'personal';
  select source_revision,generated_at,meta into v_source,v_generated,v_meta from public.kd_streaming_page_state where singleton;
  if not found or v_source=0 then raise exception 'streaming_page_projection_unavailable' using errcode='55000'; end if;
  v_fingerprint:=md5(jsonb_build_object('account',v_account,'services',to_jsonb(v_services),'view',v_view,
    'filters',v_filters,'library',v_library,'personal',v_personal)::text);
  if v_cursor_text is not null then
    v_cursor:=public.kd_streaming_page_cursor_decode(v_cursor_text);
    if jsonb_typeof(v_cursor)<>'object' or v_cursor->>'q' is distinct from v_fingerprint
      or v_cursor->>'o'!~'^[0-9]+$' or (v_cursor->>'o')::bigint>10000000 then
      raise exception 'invalid streaming page cursor' using errcode='22023'; end if;
    v_offset:=(v_cursor->>'o')::integer;
  end if;
  with effective as (
    select b.source_key output_key,coalesce(m.payload,b.payload)payload,coalesce(m.services,b.services)services,
      coalesce(m.genres,b.genres)genres,coalesce(m.aliases,b.aliases)aliases,
      coalesce(m.identity_keys,b.identity_keys)identity_keys,coalesce(m.title_keys,b.title_keys)title_keys,
      coalesce(m.title_norms,b.title_norms)title_norms,coalesce(m.title_sort,b.title_sort)title_sort,
      coalesce(m.title_order,b.title_order)title_order,
      coalesce(m.provider_sort,b.provider_sort)provider_sort,coalesce(m.work_type,b.work_type)work_type,
      coalesce(m.release_year,b.release_year)release_year,coalesce(m.watchmode_id,b.watchmode_id)watchmode_id,
      coalesce(m.imdb_id,b.imdb_id)imdb_id,coalesce(m.tmdb_id,b.tmdb_id)tmdb_id,coalesce(m.known,b.known)known
      from public.kd_streaming_page_base b left join public.kd_streaming_page_motn m on m.base_key=b.source_key
      where not coalesce(m.hidden,false)
    union all
    select output_key,payload,services,genres,aliases,identity_keys,title_keys,title_norms,title_sort,title_order,provider_sort,
      work_type,release_year,watchmode_id,imdb_id,tmdb_id,known from public.kd_streaming_page_motn
      where base_key is null and not hidden
  ), library as (
    select public.kd_streaming_page_text(x->'id') library_id,x,
      public.kd_streaming_page_identity_keys(x) identity_keys,public.kd_streaming_page_title_keys(x) title_keys,
      public.kd_streaming_page_type(x->>'typ') work_type,
      case when x->>'jahr'~'^[0-9]{4}$' then (x->>'jahr')::integer end release_year,
      case when x->>'watchmode_id'~'^[1-9][0-9]*$' then x->>'watchmode_id' end watchmode_id,
      case when lower(x->>'imdb_id')~'^tt[0-9]{5,12}$' then lower(x->>'imdb_id') end imdb_id,
      case when x->>'tmdb_id'~'^[1-9][0-9]*$' then x->>'tmdb_id' end tmdb_id
      from jsonb_array_elements(v_library)x
  ), pairs as (
    select e.output_key,l.library_id,
      e.identity_keys&&l.identity_keys same_id,e.title_keys&&l.title_keys same_title,
      (e.work_type is distinct from l.work_type or e.release_year is distinct from l.release_year
       or (e.watchmode_id is not null and l.watchmode_id is not null and e.watchmode_id<>l.watchmode_id)
       or (e.imdb_id is not null and l.imdb_id is not null and e.imdb_id<>l.imdb_id)
       or (e.tmdb_id is not null and l.tmdb_id is not null and e.tmdb_id<>l.tmdb_id)) conflict
      from effective e join library l on e.identity_keys&&l.identity_keys or e.title_keys&&l.title_keys
  ), decisions as (
    select output_key,case
      when count(*)filter(where same_id and not conflict)=1 and not bool_or(same_id and conflict)
        then min(library_id)filter(where same_id and not conflict)
      when count(*)filter(where same_id and not conflict)=0
        and count(*)filter(where same_title and not conflict)=1 and not bool_or(same_title and conflict)
        then min(library_id)filter(where same_title and not conflict) end library_id
      from pairs group by output_key
  ), anchors as (
    select public.kd_streaming_page_text(x->'id') id,public.kd_streaming_page_timestamp(x->>'fensterBeginn') since
      from jsonb_array_elements(v_personal->'newEntries')x
    union all
    select public.kd_streaming_page_text(x->'id'),public.kd_streaming_page_timestamp(x->>'firstSeenAt')
      from jsonb_array_elements(v_personal->'legacyNew')x
  ), labeled as (
    select e.*,d.library_id,
      exists(select 1 from jsonb_array_elements(v_personal->'seenIds')s
        where public.kd_streaming_page_text(s)=any(e.aliases)) seen,
      coalesce((select min(a.since) from anchors a where a.id=any(e.aliases)
        and a.since<=v_now and v_now<a.since+interval '14 days'),
        public.kd_streaming_page_new_since(e.payload,v_services,v_meta->'stand_pro_quelle',
          v_meta->'vergleich_stand_pro_quelle',v_now)) new_since
      from effective e left join decisions d using(output_key) where e.services&&v_services
  ), viewed as (
    select * from labeled where (v_view='all' or v_view='new' and new_since is not null
      or v_view='library' and library_id is not null)
  ), filtered as (
    select * from viewed where
      (nullif(v_filters->>'suche','') is null or exists(select 1 from unnest(title_norms)t
        where t like '%'||public.kd_streaming_page_title_norm(v_filters->>'suche')||'%'))
      and (nullif(v_filters->>'plattform','') is null or v_filters->>'plattform'=any(services))
      and (nullif(v_filters->>'typ','') is null or work_type=case v_filters->>'typ' when 'movie' then 'film' else 'series' end)
      and (nullif(v_filters->>'genre','') is null or exists(select 1 from unnest(genres)g
        where public.kd_streaming_page_title_norm(g)=public.kd_streaming_page_title_norm(v_filters->>'genre')))
      and (v_filters->'dekade' is null or v_filters->'dekade'='null'::jsonb
        or release_year between (v_filters->>'dekade')::integer-2 and (v_filters->>'dekade')::integer+12)
      and (nullif(v_filters->>'buchstabe','') is null or upper(left(title_sort,1))=upper(v_filters->>'buchstabe'))
      and (nullif(v_filters->>'status','') is null or (v_filters->>'status'='gesehen')=seen)
      and (coalesce((v_filters->>'nurWunsch')::boolean,false)=false or library_id is not null and exists(
        select 1 from jsonb_array_elements(v_personal->'mustWatchIds')x where public.kd_streaming_page_text(x)=library_id))
      and (coalesce((v_filters->>'nurBewertet')::boolean,false)=false or library_id is not null and exists(
        select 1 from jsonb_array_elements(v_personal->'ratedIds')x where public.kd_streaming_page_text(x)=library_id))
  ), ordered as (
    select *,row_number() over(order by
      case when coalesce(v_filters->>'sort','titel')='titel' and coalesce(v_filters->>'richtung','auf')='auf' then title_order end asc nulls last,
      case when coalesce(v_filters->>'sort','titel')='titel' and v_filters->>'richtung'='ab' then title_order end desc nulls last,
      case when v_filters->>'sort'='jahr' and coalesce(v_filters->>'richtung','auf')='auf' then release_year end asc nulls last,
      case when v_filters->>'sort'='jahr' and v_filters->>'richtung'='ab' then release_year end desc nulls last,
      case when v_filters->>'sort'='art' and coalesce(v_filters->>'richtung','auf')='auf' then work_type end asc nulls last,
      case when v_filters->>'sort'='art' and v_filters->>'richtung'='ab' then work_type end desc nulls last,
      case when v_filters->>'sort'='anbieter' and coalesce(v_filters->>'richtung','auf')='auf' then public.kd_streaming_page_natural_key(provider_sort) end asc nulls last,
      case when v_filters->>'sort'='anbieter' and v_filters->>'richtung'='ab' then public.kd_streaming_page_natural_key(provider_sort) end desc nulls last,
      title_order asc nulls last,output_key) page_order from filtered
  ), page as (select * from ordered order by page_order offset v_offset limit v_limit)
  select jsonb_build_object('all',count(*)::integer,
      'new',count(*)filter(where new_since is not null)::integer,
      'library',count(*)filter(where library_id is not null)::integer),
    (select count(*)::integer from filtered),
    coalesce((select jsonb_agg(payload
      ||case when library_id is null then '{}'::jsonb else jsonb_build_object('library_id',library_id) end
      ||case when new_since is null then '{}'::jsonb else jsonb_build_object('neu_seit',new_since) end order by page_order)
      from page),'[]'::jsonb),
    min(new_since+interval '14 days') filter(where new_since is not null)
    into v_counts,v_total,v_items,v_expiry from labeled;
  v_version:='sp1-'||to_hex(v_source)||'-e'||coalesce(extract(epoch from v_expiry)::bigint::text,'stable');
  if v_cursor is not null and v_cursor->>'v' is distinct from v_version then
    return jsonb_build_object('format',1,'status','version_changed','version',v_version); end if;
  if v_offset+jsonb_array_length(v_items)<v_total then
    v_next:=public.kd_streaming_page_cursor_encode(jsonb_build_object('v',v_version,'q',v_fingerprint,
      'o',v_offset+jsonb_array_length(v_items))); end if;
  return jsonb_build_object('format',1,'status','ready','region','AT','version',v_version,
    'generatedAt',v_generated,'counts',v_counts,'total',v_total,'items',v_items,'nextCursor',v_next,
    'complete',v_next is null,'nextExpiryAt',v_expiry,'meta',v_meta||jsonb_build_object('motn_checked_at',
      (select max(checked_at) from public.kd_motn_offers)));
end
$$;

revoke all on function public.kd_streaming_page_text(jsonb),public.kd_streaming_page_type(text),
  public.kd_streaming_page_title_norm(text),public.kd_streaming_page_natural_key(text),public.kd_streaming_page_timestamp(text),
  public.kd_streaming_page_neutralize(jsonb),public.kd_streaming_page_stream_key(jsonb),
  public.kd_streaming_page_aliases(jsonb),public.kd_streaming_page_identity_keys(jsonb),
  public.kd_streaming_page_title_norms(jsonb),public.kd_streaming_page_title_keys(jsonb),
  public.kd_streaming_page_services(jsonb),public.kd_streaming_page_genres(jsonb),
  public.kd_streaming_page_bump(jsonb),public.kd_streaming_page_rebuild_motn(text,boolean),
  public.kd_streaming_page_refresh(),public.kd_streaming_page_catalog_changed(),
  public.kd_streaming_page_catalog_deleted(),public.kd_streaming_page_motn_changed(),
  public.kd_streaming_page_new_since(jsonb,text[],jsonb,jsonb,timestamptz),
  public.kd_streaming_page_cursor_encode(jsonb),public.kd_streaming_page_cursor_decode(text),
  public.kd_streaming_page(jsonb) from public,anon,authenticated;
grant execute on function public.kd_streaming_page(jsonb) to authenticated;
grant execute on function public.kd_streaming_page_refresh(),public.kd_streaming_page_rebuild_motn(text,boolean) to service_role;

select public.kd_streaming_page_refresh();
notify pgrst,'reload schema';
commit;
