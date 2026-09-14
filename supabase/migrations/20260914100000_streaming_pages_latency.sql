-- Keep progressive reads narrow until the requested page has been selected.
-- The source projection, request contract, identity rules and RLS boundary stay unchanged.
begin;

create or replace function public.kd_streaming_page_new_since(p_payload jsonb,p_services text[],p_stands jsonb,
  p_comparisons jsonb,p_now timestamptz,p_anchor_start timestamptz,p_consumed_until timestamptz,
  p_has_anchor boolean,p_legacy_start timestamptz) returns timestamptz
language plpgsql stable set search_path = pg_catalog, public as $$
declare initial_services text[]:=public.kd_streaming_page_services(p_payload); current_services text[]; selected text;
  grp record; v_diff record; before_union boolean; after_union boolean; valid_add boolean;
  access_times timestamptz[]:='{}'; begin_at timestamptz; consumed_until timestamptz; access_at timestamptz;
  motn_at timestamptz; diffs jsonb; motn_entries jsonb; duration_seconds constant bigint:=1209600;
begin
  current_services:=initial_services;
  if not current_services && p_services then return null; end if;
  diffs:=case when jsonb_typeof(p_payload->'dienst_diffs')='array'
    then p_payload->'dienst_diffs' else '[]'::jsonb end;
  motn_entries:=case when jsonb_typeof(p_payload->'motn_zugaenge')='array'
    then p_payload->'motn_zugaenge' else '[]'::jsonb end;
  if jsonb_array_length(diffs)=0 and jsonb_array_length(motn_entries)=0
    and not coalesce(p_has_anchor,false) and p_legacy_start is null then return null; end if;
  if jsonb_array_length(diffs)>0 then
    if exists(select 1 from jsonb_array_elements(diffs) x(value)
      where jsonb_typeof(value)<>'object' or nullif(btrim(value->>'dienst'),'') is null
        or jsonb_typeof(value->'vorher')<>'boolean' or jsonb_typeof(value->'nachher')<>'boolean'
        or public.kd_streaming_page_timestamp(value->>'erkannt_am') is null
        or public.kd_streaming_page_timestamp(value->>'erkannt_am')>p_now) then return null; end if;
    for grp in select public.kd_streaming_page_timestamp(value->>'erkannt_am') at,
        jsonb_agg(value) diffs from jsonb_array_elements(diffs) x(value)
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
  if p_has_anchor and p_anchor_start<=p_now and p_consumed_until<=p_now then
    begin_at:=p_anchor_start; consumed_until:=p_consumed_until;
  end if;
  foreach access_at in array access_times loop
    if consumed_until is not null and access_at<=consumed_until then continue; end if;
    if begin_at is null or extract(epoch from access_at)>=extract(epoch from begin_at)+duration_seconds
      then begin_at:=access_at; end if;
    consumed_until:=access_at;
  end loop;
  if begin_at is null and p_legacy_start<=p_now
    and extract(epoch from p_now)<extract(epoch from p_legacy_start)+duration_seconds then begin_at:=p_legacy_start; end if;
  if jsonb_array_length(motn_entries)>0 then
    select min(public.kd_streaming_page_timestamp(x->>'erkannt_am')) into motn_at
      from jsonb_array_elements(motn_entries)x
     where x->>'dienst'=any(p_services) and x->>'dienst'=any(initial_services)
       and public.kd_streaming_page_timestamp(x->>'erkannt_am')<=p_now;
    begin_at:=least(begin_at,motn_at);
  end if;
  return case when begin_at is not null
    and extract(epoch from p_now)<extract(epoch from begin_at)+duration_seconds then begin_at end;
end
$$;

create or replace function public.kd_streaming_page(p_request jsonb) returns jsonb
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
    or coalesce(p_request->>'limit','')!~'^[0-9]+$' or (p_request->>'limit')::integer not between 1 and 1000
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
    select b.source_key output_key,coalesce(m.services,b.services)services,
      coalesce(m.genres,b.genres)genres,coalesce(m.aliases,b.aliases)aliases,
      coalesce(m.identity_keys,b.identity_keys)identity_keys,coalesce(m.title_keys,b.title_keys)title_keys,
      coalesce(m.title_norms,b.title_norms)title_norms,coalesce(m.title_sort,b.title_sort)title_sort,
      coalesce(m.title_order,b.title_order)title_order,coalesce(m.provider_sort,b.provider_sort)provider_sort,
      coalesce(m.work_type,b.work_type)work_type,coalesce(m.release_year,b.release_year)release_year,
      coalesce(m.watchmode_id,b.watchmode_id)watchmode_id,coalesce(m.imdb_id,b.imdb_id)imdb_id,
      coalesce(m.tmdb_id,b.tmdb_id)tmdb_id
      from public.kd_streaming_page_base b left join public.kd_streaming_page_motn m on m.base_key=b.source_key
      where not coalesce(m.hidden,false)
    union all
    select output_key,services,genres,aliases,identity_keys,title_keys,title_norms,title_sort,title_order,
      provider_sort,work_type,release_year,watchmode_id,imdb_id,tmdb_id
      from public.kd_streaming_page_motn where base_key is null and not hidden
  ), selected as materialized (
    select * from effective where services&&v_services
  ), library as materialized (
    select public.kd_streaming_page_text(x->'id') library_id,
      public.kd_streaming_page_identity_keys(x) identity_keys,public.kd_streaming_page_title_keys(x) title_keys,
      public.kd_streaming_page_type(x->>'typ') work_type,public.kd_streaming_page_year(x->>'jahr') release_year,
      public.kd_streaming_page_id_norm('watchmode',x->>'watchmode_id') watchmode_id,
      public.kd_streaming_page_id_norm('imdb',x->>'imdb_id') imdb_id,
      public.kd_streaming_page_id_norm('tmdb',x->>'tmdb_id') tmdb_id
      from jsonb_array_elements(v_library)x
  ), selected_identity as materialized (
    select s.output_key,k.key from selected s cross join lateral unnest(s.identity_keys) k(key)
  ), library_identity as materialized (
    select l.library_id,k.key from library l cross join lateral unnest(l.identity_keys) k(key)
  ), selected_titles as materialized (
    select s.output_key,k.key from selected s cross join lateral unnest(s.title_keys) k(key)
  ), library_titles as materialized (
    select l.library_id,k.key from library l cross join lateral unnest(l.title_keys) k(key)
  ), candidate_matches as materialized (
    select e.output_key,l.library_id,'id' kind from selected_identity e join library_identity l using(key)
    union all
    select e.output_key,l.library_id,'title' kind from selected_titles e join library_titles l using(key)
  ), candidate_pairs as materialized (
    select output_key,library_id,bool_or(kind='id') same_id,bool_or(kind='title') same_title
      from candidate_matches group by output_key,library_id
  ), pair_evidence as (
    select c.output_key,c.library_id,c.same_id,c.same_title,
      (e.work_type is not null and l.work_type is not null
        and e.release_year is not null and l.release_year is not null) evidence_complete,
      (e.work_type=l.work_type and e.release_year=l.release_year) evidence_equal,
      ((e.watchmode_id is not null and l.watchmode_id is not null and e.watchmode_id<>l.watchmode_id)
       or (e.imdb_id is not null and l.imdb_id is not null and e.imdb_id<>l.imdb_id)
       or (e.tmdb_id is not null and l.tmdb_id is not null and e.tmdb_id<>l.tmdb_id)) id_conflict
      from candidate_pairs c join selected e using(output_key) join library l using(library_id)
  ), pairs as (
    select *,same_id and evidence_complete and evidence_equal and not id_conflict strong_valid,
      same_title and evidence_complete and evidence_equal and not id_conflict title_valid,
      (same_id and evidence_complete and (not evidence_equal or id_conflict))
        or (same_title and evidence_complete and evidence_equal and id_conflict) conflict
      from pair_evidence
  ), decisions as (
    select output_key,case
      when count(*)filter(where strong_valid)=1 and not bool_or(same_id and conflict)
        then min(library_id)filter(where strong_valid)
      when count(*)filter(where strong_valid)=0
        and count(*)filter(where title_valid)=1 and not bool_or(conflict)
        then min(library_id)filter(where title_valid) end library_id
      from pairs group by output_key
  ), selected_aliases as materialized (
    select s.output_key,a.id from selected s cross join lateral unnest(s.aliases) a(id)
  ), book_entries as materialized (
    select public.kd_streaming_page_text(x->'id') id,
      public.kd_streaming_page_timestamp(x->>'fensterBeginn') since,
      public.kd_streaming_page_timestamp(x->>'verbrauchtBis') consumed
      from jsonb_array_elements(v_personal->'newEntries')x
  ), legacy_entries as materialized (
    select public.kd_streaming_page_text(x->'id') id,public.kd_streaming_page_timestamp(x->>'firstSeenAt') since
      from jsonb_array_elements(v_personal->'legacyNew')x
  ), seen_entries as materialized (
    select distinct public.kd_streaming_page_text(x) id from jsonb_array_elements(v_personal->'seenIds')x
  ), must_watch_entries as materialized (
    select distinct public.kd_streaming_page_text(x) id from jsonb_array_elements(v_personal->'mustWatchIds')x
  ), rated_entries as materialized (
    select distinct public.kd_streaming_page_text(x) id from jsonb_array_elements(v_personal->'ratedIds')x
  ), book_decisions as materialized (
    select distinct on (a.output_key) a.output_key,b.since,b.consumed
      from selected_aliases a join book_entries b using(id)
      order by a.output_key,b.consumed desc,b.since desc
  ), legacy_decisions as materialized (
    select a.output_key,min(l.since) since from selected_aliases a join legacy_entries l using(id)
      group by a.output_key
  ), seen_decisions as materialized (
    select distinct a.output_key from selected_aliases a join seen_entries s using(id)
  ), prepared as (
    select e.*,d.library_id,b.since anchor_start,b.consumed,
      b.since is not null and b.since<=v_now and b.consumed<=v_now has_anchor,l.since legacy_start,
      sd.output_key is not null seen,m.id is not null must_watch,r.id is not null rated
      from selected e left join decisions d using(output_key)
      left join book_decisions b using(output_key) left join legacy_decisions l using(output_key)
      left join seen_decisions sd using(output_key) left join must_watch_entries m on m.id=d.library_id
      left join rated_entries r on r.id=d.library_id
  ), new_labels as materialized (
    select e.output_key,public.kd_streaming_page_new_since(
        jsonb_build_object('dienste',to_jsonb(e.services),'dienst_diffs',coalesce(m.payload,b.payload)->'dienst_diffs',
          'motn_zugaenge',coalesce(m.payload,b.payload)->'motn_zugaenge'),
        v_services,v_meta->'stand_pro_quelle',v_meta->'vergleich_stand_pro_quelle',v_now,
        e.anchor_start,e.consumed,e.has_anchor,e.legacy_start) new_since
      from prepared e join public.kd_streaming_page_base b on b.source_key=e.output_key
      left join public.kd_streaming_page_motn m on m.base_key=b.source_key
     where e.has_anchor or e.legacy_start is not null
        or jsonb_array_length(case when jsonb_typeof(coalesce(m.payload,b.payload)->'dienst_diffs')='array'
             then coalesce(m.payload,b.payload)->'dienst_diffs' else '[]'::jsonb end)>0
        or jsonb_array_length(case when jsonb_typeof(coalesce(m.payload,b.payload)->'motn_zugaenge')='array'
             then coalesce(m.payload,b.payload)->'motn_zugaenge' else '[]'::jsonb end)>0
    union all
    select e.output_key,public.kd_streaming_page_new_since(
        jsonb_build_object('dienste',to_jsonb(e.services),'dienst_diffs',m.payload->'dienst_diffs',
          'motn_zugaenge',m.payload->'motn_zugaenge'),
        v_services,v_meta->'stand_pro_quelle',v_meta->'vergleich_stand_pro_quelle',v_now,
        e.anchor_start,e.consumed,e.has_anchor,e.legacy_start) new_since
      from prepared e join public.kd_streaming_page_motn m on m.output_key=e.output_key and m.base_key is null
     where e.has_anchor or e.legacy_start is not null
        or jsonb_array_length(case when jsonb_typeof(m.payload->'dienst_diffs')='array'
             then m.payload->'dienst_diffs' else '[]'::jsonb end)>0
        or jsonb_array_length(case when jsonb_typeof(m.payload->'motn_zugaenge')='array'
             then m.payload->'motn_zugaenge' else '[]'::jsonb end)>0
  ), labeled as materialized (
    select e.*,n.new_since from prepared e left join new_labels n using(output_key)
  ), viewed as (
    select * from labeled where (v_view='all' or v_view='new' and new_since is not null
      or v_view='library' and library_id is not null)
  ), filtered as materialized (
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
      and (coalesce((v_filters->>'nurWunsch')::boolean,false)=false or must_watch)
      and (coalesce((v_filters->>'nurBewertet')::boolean,false)=false or rated)
  ), ordered as (
    select output_key,library_id,new_since,row_number() over(order by
      case when coalesce(v_filters->>'sort','titel')='titel' and coalesce(v_filters->>'richtung','auf')='auf' then title_order end asc nulls last,
      case when coalesce(v_filters->>'sort','titel')='titel' and v_filters->>'richtung'='ab' then title_order end desc nulls last,
      case when v_filters->>'sort'='jahr' and coalesce(v_filters->>'richtung','auf')='auf' then release_year end asc nulls last,
      case when v_filters->>'sort'='jahr' and v_filters->>'richtung'='ab' then release_year end desc nulls last,
      case when v_filters->>'sort'='art' and coalesce(v_filters->>'richtung','auf')='auf' then work_type end asc nulls last,
      case when v_filters->>'sort'='art' and v_filters->>'richtung'='ab' then work_type end desc nulls last,
      case when v_filters->>'sort'='anbieter' and coalesce(v_filters->>'richtung','auf')='auf' then public.kd_streaming_page_natural_key(provider_sort) end asc nulls last,
      case when v_filters->>'sort'='anbieter' and v_filters->>'richtung'='ab' then public.kd_streaming_page_natural_key(provider_sort) end desc nulls last,
      title_order asc nulls last,output_key) page_order from filtered
  ), page_keys as materialized (
    select * from ordered order by page_order offset v_offset limit v_limit
  ), page_payloads as (
    select p.*,coalesce(m.payload,b.payload) payload from page_keys p
      join public.kd_streaming_page_base b on b.source_key=p.output_key
      left join public.kd_streaming_page_motn m on m.base_key=b.source_key
    union all
    select p.*,m.payload from page_keys p join public.kd_streaming_page_motn m
      on m.output_key=p.output_key and m.base_key is null
  )
  select jsonb_build_object('all',count(*)::integer,
      'new',count(*)filter(where new_since is not null)::integer,
      'library',count(*)filter(where library_id is not null)::integer),
    (select count(*)::integer from filtered),
    coalesce((select jsonb_agg(payload
      ||case when library_id is null then '{}'::jsonb else jsonb_build_object('library_id',library_id) end
      ||case when new_since is null then '{}'::jsonb else jsonb_build_object('neu_seit',new_since) end order by page_order)
      from page_payloads),'[]'::jsonb),
    min(to_timestamp(extract(epoch from new_since)+1209600)) filter(where new_since is not null)
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

commit;
