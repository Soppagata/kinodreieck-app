-- Bounded, authenticated lookup/search over the existing neutral Streaming projection.
-- The source catalog, MotN reconciliation and projection maintenance remain authoritative.
begin;

create function public.kd_mustwatch_streaming_candidate_dto(
  p_output_key text,
  p_payload jsonb,
  p_services text[],
  p_genres text[],
  p_aliases text[]
) returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_output_key,
    'titel', nullif(btrim(coalesce(p_payload->>'titel',p_payload->>'title')),''),
    'originaltitel', nullif(btrim(coalesce(p_payload->>'originaltitel',p_payload->>'originalTitle')),''),
    'jahr', public.kd_streaming_page_year(coalesce(p_payload->>'jahr',p_payload->>'year')),
    'typ', nullif(btrim(coalesce(p_payload->>'typ',p_payload->>'type')),''),
    'watchmode_id', case
      when public.kd_streaming_page_text(coalesce(p_payload->'watchmode_id',p_payload->'watchmodeId')) is not null
        then p_output_key
      else null end,
    'streaming_id', public.kd_streaming_page_text(p_payload->'streaming_id'),
    'streaming_aliases', case when cardinality(p_aliases)>0 then to_jsonb(p_aliases) else null end,
    'imdb_id', public.kd_streaming_page_id_norm('imdb',coalesce(p_payload->>'imdb_id',p_payload->>'imdbId')),
    'tmdb_id', public.kd_streaming_page_id_norm('tmdb',coalesce(p_payload->>'tmdb_id',p_payload->>'tmdbId')),
    'genres', case when cardinality(p_genres)>0 then to_jsonb(p_genres) else null end,
    'dienste', to_jsonb(p_services)
  ))
$$;

revoke all on function public.kd_mustwatch_streaming_candidate_dto(text,jsonb,text[],text[],text[])
  from public, anon, authenticated, service_role;

create function public.kd_mustwatch_streaming_candidates(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text := auth.role();
  v_account uuid := auth.uid();
  v_ids jsonb;
  v_id_count integer;
  v_query text;
  v_query_norm text;
  v_limit integer;
  v_source bigint;
  v_meta jsonb;
  v_expires timestamptz;
  v_version text;
  v_items jsonb := '[]'::jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if v_role is distinct from 'authenticated' or v_account is null then
    raise exception 'authenticated account required' using errcode='42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode='42501';
  end if;

  if jsonb_typeof(p_request) is distinct from 'object'
    or octet_length(p_request::text)>262144
    or p_request->'format' is distinct from '1'::jsonb
    or jsonb_typeof(p_request->'ids') is distinct from 'array'
    or jsonb_typeof(p_request->'query') is distinct from 'string'
    or jsonb_typeof(p_request->'limit') is distinct from 'number'
    or coalesce(p_request->>'limit','')!~'^[0-9]+$'
    or (p_request->>'limit')::integer not between 1 and 20
    or exists(select 1 from jsonb_object_keys(p_request) key
      where key not in ('format','ids','query','limit'))
  then
    raise exception 'invalid must-watch streaming request' using errcode='22023';
  end if;

  v_ids := p_request->'ids';
  v_id_count := jsonb_array_length(v_ids);
  v_query := btrim(p_request->>'query');
  v_limit := (p_request->>'limit')::integer;
  if v_id_count>500 or length(p_request->>'query')>160
    or (v_id_count>0 and v_query<>'')
    or exists(select 1 from jsonb_array_elements(v_ids) id
      where jsonb_typeof(id)<>'string' or length(id#>>'{}')>256
        or length(btrim(id#>>'{}'))<1)
    or (select count(*)<>count(distinct btrim(id#>>'{}')) from jsonb_array_elements(v_ids) id)
  then
    raise exception 'invalid must-watch streaming mode' using errcode='22023';
  end if;

  select source_revision,meta into v_source,v_meta
    from public.kd_streaming_page_state where singleton;
  v_version := 'mw1-'||coalesce(to_hex(v_source),'unavailable');
  v_expires := public.kd_streaming_page_timestamp(v_meta->>'gueltig_bis');
  if not found or coalesce(v_source,0)=0 or (v_expires is not null and v_expires<=v_now) then
    return jsonb_build_object('format',1,'status','unavailable','version',v_version,
      'expiresAt',v_expires,'items','[]'::jsonb);
  end if;

  if v_id_count=0 and v_query='' then
    return jsonb_build_object('format',1,'status','ready','version',v_version,
      'expiresAt',v_expires,'items','[]'::jsonb);
  end if;
  v_query_norm := public.kd_streaming_page_title_norm(v_query);

  if v_id_count>0 then
    with raw_current_titles as materialized (
      select b.source_key output_key,'base'::text source_kind,b.aliases,b.title_order
        from public.kd_streaming_page_base b
       where cardinality(b.services)>0
         and not exists(select 1 from public.kd_streaming_page_motn m where m.base_key=b.source_key)
      union all
      select b.source_key,'motn',m.aliases,coalesce(m.title_order,b.title_order)
        from public.kd_streaming_page_motn m
        join public.kd_streaming_page_base b on b.source_key=m.base_key
       where not m.hidden and cardinality(m.services)>0
      union all
      select m.output_key,'motn',m.aliases,m.title_order
        from public.kd_streaming_page_motn m
       where m.base_key is null and not m.hidden and cardinality(m.services)>0
    ), alias_occurrences as materialized (
      select distinct output_key,alias from (
        select output_key,output_key alias from raw_current_titles
        union all
        select title.output_key,alias from raw_current_titles title
          cross join lateral unnest(title.aliases) alias
         where length(alias) between 1 and 256
      ) values_by_title
    ), alias_owners as materialized (
      select alias,count(distinct output_key) owner_count
        from alias_occurrences group by alias
    ), safe_aliases as materialized (
      select occurrence.output_key,array_agg(occurrence.alias
        order by (occurrence.alias=occurrence.output_key) desc,occurrence.alias) aliases
        from alias_occurrences occurrence
        join alias_owners owner using(alias)
       where occurrence.alias=occurrence.output_key
          or owner.owner_count=1
       group by occurrence.output_key
    ), current_titles as materialized (
      select raw.output_key,raw.source_kind,safe.aliases,raw.title_order
        from raw_current_titles raw join safe_aliases safe using(output_key)
    ), requested as materialized (
      select btrim(value) id,ordinality::bigint ord
        from jsonb_array_elements_text(v_ids) with ordinality entry(value,ordinality)
    ), exact_matches as materialized (
      select requested.ord,current_titles.* from requested
      join current_titles on current_titles.output_key=requested.id
    ), alias_candidates as materialized (
      select requested.ord,current_titles.* from requested
      join current_titles on requested.id=any(current_titles.aliases)
      where not exists(select 1 from exact_matches exact where exact.ord=requested.ord)
    ), unique_aliases as (
      select ord from alias_candidates group by ord having count(distinct output_key)=1
    ), resolved as (
      select * from exact_matches
      union all
      select alias_candidates.* from alias_candidates join unique_aliases using(ord)
    ), chosen as (
      select distinct on(output_key) * from resolved order by output_key,ord
    ), selected_payloads as (
      select chosen.ord,chosen.output_key,chosen.title_order,
        case when chosen.source_kind='base' then b.payload else m.payload end payload,
        case when chosen.source_kind='base' then b.services else m.services end services,
        case when chosen.source_kind='base' then b.genres else m.genres end genres,
        chosen.aliases
        from chosen
        left join public.kd_streaming_page_base b
          on chosen.source_kind='base' and b.source_key=chosen.output_key
        left join public.kd_streaming_page_motn m
          on chosen.source_kind='motn' and m.output_key=chosen.output_key
    )
    select coalesce(jsonb_agg(public.kd_mustwatch_streaming_candidate_dto(
      output_key,payload,services,genres,aliases) order by ord),'[]'::jsonb)
      into v_items from selected_payloads
     where nullif(btrim(coalesce(payload->>'titel',payload->>'title')),'') is not null;
  elsif v_query_norm is not null then
    with raw_current_titles as materialized (
      select b.source_key output_key,'base'::text source_kind,b.aliases,b.title_order,b.title_norms
        from public.kd_streaming_page_base b
       where cardinality(b.services)>0
         and not exists(select 1 from public.kd_streaming_page_motn m where m.base_key=b.source_key)
      union all
      select b.source_key,'motn',m.aliases,coalesce(m.title_order,b.title_order),m.title_norms
        from public.kd_streaming_page_motn m
        join public.kd_streaming_page_base b on b.source_key=m.base_key
       where not m.hidden and cardinality(m.services)>0
      union all
      select m.output_key,'motn',m.aliases,m.title_order,m.title_norms
        from public.kd_streaming_page_motn m
       where m.base_key is null and not m.hidden and cardinality(m.services)>0
    ), alias_occurrences as materialized (
      select distinct output_key,alias from (
        select output_key,output_key alias from raw_current_titles
        union all
        select title.output_key,alias from raw_current_titles title
          cross join lateral unnest(title.aliases) alias
         where length(alias) between 1 and 256
      ) values_by_title
    ), alias_owners as materialized (
      select alias,count(distinct output_key) owner_count
        from alias_occurrences group by alias
    ), safe_aliases as materialized (
      select occurrence.output_key,array_agg(occurrence.alias
        order by (occurrence.alias=occurrence.output_key) desc,occurrence.alias) aliases
        from alias_occurrences occurrence
        join alias_owners owner using(alias)
       where occurrence.alias=occurrence.output_key
          or owner.owner_count=1
       group by occurrence.output_key
    ), current_titles as materialized (
      select raw.output_key,raw.source_kind,safe.aliases,raw.title_order,raw.title_norms
        from raw_current_titles raw join safe_aliases safe using(output_key)
    ), matches as materialized (
      select * from current_titles
       where exists(select 1 from unnest(title_norms) title where title like '%'||v_query_norm||'%')
       order by title_order nulls last,output_key
       limit v_limit
    ), selected_payloads as (
      select matches.output_key,matches.title_order,
        case when matches.source_kind='base' then b.payload else m.payload end payload,
        case when matches.source_kind='base' then b.services else m.services end services,
        case when matches.source_kind='base' then b.genres else m.genres end genres,
        matches.aliases
        from matches
        left join public.kd_streaming_page_base b
          on matches.source_kind='base' and b.source_key=matches.output_key
        left join public.kd_streaming_page_motn m
          on matches.source_kind='motn' and m.output_key=matches.output_key
    )
    select coalesce(jsonb_agg(public.kd_mustwatch_streaming_candidate_dto(
      output_key,payload,services,genres,aliases) order by title_order nulls last,output_key),'[]'::jsonb)
      into v_items from selected_payloads
     where nullif(btrim(coalesce(payload->>'titel',payload->>'title')),'') is not null;
  end if;

  return jsonb_build_object('format',1,'status','ready','version',v_version,
    'expiresAt',v_expires,'items',v_items);
end
$$;

revoke all on function public.kd_mustwatch_streaming_candidates(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kd_mustwatch_streaming_candidates(jsonb) to authenticated;

comment on function public.kd_mustwatch_streaming_candidates(jsonb) is
  'Bounded authenticated lookup/search over the current neutral Streaming projection; no personal fields or writes.';

notify pgrst, 'reload schema';

commit;
