begin;

-- Additive, account-scoped identity overlay. No existing finding, version,
-- receipt, subscription or personal pot is migrated/rewritten on installation.
create table public.kd_radar_identity_settings (
  account_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  applied_at timestamptz not null default now()
);
create table public.kd_radar_identity_works (
  account_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid not null,
  title text not null check(length(title) between 1 and 200 and title=btrim(title)),
  target_type text not null check(target_type in ('work','series')),
  release_year integer check(release_year between 1888 and 2100),
  external_ids jsonb not null default '{}'::jsonb check(jsonb_typeof(external_ids)='object'),
  primary key(account_id,work_id)
);
create unique index kd_radar_identity_imdb_unique on public.kd_radar_identity_works(account_id,(external_ids->>'imdb')) where external_ids ? 'imdb';
create unique index kd_radar_identity_tmdb_unique on public.kd_radar_identity_works(account_id,target_type,(external_ids->>'tmdb')) where external_ids ? 'tmdb';
create unique index kd_radar_identity_watchmode_unique on public.kd_radar_identity_works(account_id,(external_ids->>'watchmode')) where external_ids ? 'watchmode';

create table public.kd_radar_identity_aliases (
  account_id uuid not null,
  work_id uuid not null,
  alias_title text not null,
  event_type text not null,
  platform text not null,
  region text not null,
  target_type text not null check(target_type in ('work','series')),
  source_url text not null check(source_url ~ '^https://' and length(source_url)<=2048),
  season_number integer not null check(season_number between 0 and 999),
  episode_number integer not null check(episode_number between 0 and 9999),
  edition_key text not null check(length(edition_key) between 1 and 120),
  license_key text not null check(length(license_key) between 1 and 120),
  source_url_hash text generated always as (md5(source_url)) stored,
  primary key(account_id,alias_title,target_type,source_url_hash,event_type,platform,region,season_number,episode_number),
  foreign key(account_id,work_id) references public.kd_radar_identity_works(account_id,work_id) on delete cascade
);
create table public.kd_radar_identity_starts (
  account_id uuid not null,
  start_id uuid not null default gen_random_uuid(),
  work_id uuid not null,
  event_type text not null check(event_type in ('kinostart_at','streamingstart_at','serienstart','staffelstart')),
  offer_key text not null check(length(offer_key) between 1 and 160),
  region text not null check(region in ('AT','global','unspecified')),
  season_number integer not null check(season_number between 0 and 999),
  episode_number integer not null check(episode_number between 0 and 9999),
  edition_key text not null check(length(edition_key) between 1 and 120),
  license_key text not null check(length(license_key) between 1 and 120),
  primary key(account_id,start_id),
  foreign key(account_id,work_id) references public.kd_radar_identity_works(account_id,work_id) on delete cascade,
  unique(account_id,work_id,event_type,offer_key,region,season_number,episode_number,edition_key,license_key)
);
create table public.kd_radar_identity_observations (
  account_id uuid not null references auth.users(id) on delete cascade,
  observation_id uuid not null default gen_random_uuid(),
  finding_id uuid not null references public.kd_radar_text_findings(finding_id) on delete cascade,
  event_version_id uuid not null,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  captured_at timestamptz not null default now(),
  primary key(account_id,observation_id),
  unique(account_id,finding_id,event_version_id)
);
create table public.kd_radar_identity_links (
  account_id uuid not null,
  observation_id uuid not null,
  start_id uuid not null,
  primary key(account_id,observation_id),
  foreign key(account_id,observation_id) references public.kd_radar_identity_observations(account_id,observation_id) on delete cascade,
  foreign key(account_id,start_id) references public.kd_radar_identity_starts(account_id,start_id) on delete cascade
);

do $acl$
declare v_name text;
begin
  foreach v_name in array array['settings','works','aliases','starts','observations','links'] loop
    execute format('alter table public.kd_radar_identity_%I enable row level security',v_name);
    execute format('revoke all on table public.kd_radar_identity_%I from public,anon,authenticated,service_role',v_name);
    execute format('grant select on table public.kd_radar_identity_%I to authenticated',v_name);
    execute format('grant select,insert,update,delete on table public.kd_radar_identity_%I to service_role',v_name);
    execute format('create policy kd_radar_identity_own_read on public.kd_radar_identity_%I for select to authenticated using(account_id=(select auth.uid()) and public.kd_radar_text_findings_read_allowed())',v_name);
  end loop;
end $acl$;

create function public.kd_radar_identity_title(p_title text) returns text
language sql immutable set search_path=pg_catalog,public as $$
  select translate(regexp_replace(btrim(normalize(p_title,NFC)),' +',' ','g'),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')
$$;
create function public.kd_radar_identity_episode(p_title text) returns integer
language plpgsql immutable set search_path=pg_catalog,public as $$
declare v_count integer;v_number integer;
begin
  select count(*),max(coalesce(m[1],m[2])::integer) into v_count,v_number
    from regexp_matches(p_title,'(?:\m(?:folge|episode)[[:space:]]+([0-9]{1,4})\M|\mS[0-9]{1,3}[[:space:]]*E([0-9]{1,4})\M)','gi') m;
  return case when v_count>1 or (v_count=1 and (v_number<1 or p_title ~* '(?:\m(?:folge|episode)[[:space:]]+[0-9]{1,4}|\mS[0-9]{1,3}[[:space:]]*E[0-9]{1,4})[[:space:]]*(?:[-–—/&][[:space:]]*[0-9]|(?:und|and|bis|to)\M)'))
    then -1 when v_count=1 and v_number>0 then v_number else 0 end;
end $$;
revoke all on function public.kd_radar_identity_title(text),public.kd_radar_identity_episode(text) from public,anon,authenticated;
grant execute on function public.kd_radar_identity_title(text),public.kd_radar_identity_episode(text) to service_role;

-- Existing v2 keys omit region. After a profile opts in, reuse an existing
-- identical v2 row, otherwise store a v3 key including market. Never rewrite
-- old keys or accept an unchecked client key; the existing v2 guard runs first.
alter table public.kd_radar_text_findings drop constraint kd_radar_text_findings_release_key_check;
alter table public.kd_radar_text_findings add constraint kd_radar_text_findings_release_key_check
  check(release_key ~ '^release:v2:[a-f0-9]{16}$' or release_key ~ '^release:v3:[a-f0-9]{64}$');
create function public.kd_radar_identity_storage_key(p_account uuid,p_target uuid,p_payload jsonb,p_v2 text) returns text
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_key text;
begin
  if not exists(select 1 from public.kd_radar_identity_settings where account_id=p_account) then return p_v2;end if;
  if exists(select 1 from public.kd_radar_text_findings f where f.account_id=p_account and f.text_target_id=p_target
      and f.release_key=p_v2 and f.region=p_payload->>'region'
      and public.kd_radar_identity_title(f.title)=public.kd_radar_identity_title(p_payload->>'workTitle')
      and f.event_date=(p_payload->>'date')::date and f.event_type=p_payload->>'eventType'
      and f.target_type=p_payload->>'workTargetType' and f.season_number is not distinct from (p_payload->>'seasonNumber')::integer
      and f.platform=coalesce(p_payload->>'platform','-')) then return p_v2;end if;
  v_key:='release:v3:'||encode(sha256(convert_to(jsonb_build_array(
    public.kd_radar_identity_title(p_payload->>'workTitle'),p_payload->>'date',p_payload->>'eventType',
    p_payload->>'workTargetType',p_payload->'seasonNumber',coalesce(p_payload->>'platform','-'),p_payload->>'region')::text,'UTF8')),'hex');
  return v_key;
end $$;
revoke all on function public.kd_radar_identity_storage_key(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.kd_radar_identity_storage_key(uuid,uuid,jsonb,text) to service_role;
do $storage_guard$
declare v_definition text;v_anchor text:=$anchor$  p_payload := jsonb_set(p_payload,'{targetKey}',to_jsonb(v_release_key));$anchor$;
begin
  select pg_get_functiondef('public.kd_radar_websearch_upsert_text_finding(uuid,uuid,jsonb)'::regprocedure) into v_definition;
  if position(v_anchor in v_definition)=0 then raise exception 'radar_identity_storage_definition_drift';end if;
  execute replace(v_definition,v_anchor,
    '  v_release_key := public.kd_radar_identity_storage_key(p_user_id,v_target_id,p_payload,v_release_key);'||chr(10)||v_anchor);
end $storage_guard$;

create function public.kd_radar_identity_capture(p_finding_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public set timezone='UTC' as $$
declare
  f public.kd_radar_text_findings%rowtype;
  a public.kd_radar_identity_aliases%rowtype;
  v_payload jsonb;v_observation_id uuid;v_start_id uuid;v_offer text;v_existing jsonb;
begin
  select * into strict f from public.kd_radar_text_findings where finding_id=p_finding_id;
  if not exists(select 1 from public.kd_radar_identity_settings where account_id=f.account_id) then return;end if;
  v_payload:=to_jsonb(f)-'account_id';
  insert into public.kd_radar_identity_observations(account_id,finding_id,event_version_id,payload)
    values(f.account_id,f.finding_id,f.event_version_id,v_payload)
    on conflict(account_id,finding_id,event_version_id) do nothing;
  select observation_id,payload into v_observation_id,v_existing from public.kd_radar_identity_observations
    where account_id=f.account_id and finding_id=f.finding_id and event_version_id=f.event_version_id;
  if v_existing is distinct from v_payload then raise exception 'radar_identity_observation_changed' using errcode='22023';end if;
  select alias.* into a from public.kd_radar_identity_aliases alias
    join public.kd_radar_identity_works w on w.account_id=alias.account_id and w.work_id=alias.work_id and w.target_type=f.target_type
    where alias.account_id=f.account_id and alias.alias_title=public.kd_radar_identity_title(f.title)
      and alias.target_type=f.target_type and alias.source_url=f.source_url and alias.event_type=f.event_type and alias.platform=f.platform and alias.region=f.region
      and alias.season_number=coalesce(f.season_number,0)
      and alias.episode_number=public.kd_radar_identity_episode(f.title);
  if not found then return;end if;
  v_offer:=case when f.event_type='kinostart_at' and f.platform='-' then 'cinema'
    when public.kd_radar_identity_title(f.platform) in ('-','unknown','unbekannt','n/a') then 'unresolved:'||f.finding_id
    else 'literal:'||f.platform end;
  insert into public.kd_radar_identity_starts(account_id,work_id,event_type,offer_key,region,season_number,episode_number,edition_key,license_key)
    values(f.account_id,a.work_id,f.event_type,v_offer,f.region,coalesce(f.season_number,0),a.episode_number,a.edition_key,a.license_key)
    on conflict(account_id,work_id,event_type,offer_key,region,season_number,episode_number,edition_key,license_key) do nothing;
  select start_id into strict v_start_id from public.kd_radar_identity_starts
    where account_id=f.account_id and work_id=a.work_id and event_type=f.event_type and offer_key=v_offer
      and region=f.region and season_number=coalesce(f.season_number,0) and episode_number=a.episode_number and edition_key=a.edition_key and license_key=a.license_key;
  insert into public.kd_radar_identity_links(account_id,observation_id,start_id)
    values(f.account_id,v_observation_id,v_start_id) on conflict(account_id,observation_id) do nothing;
  if not exists(select 1 from public.kd_radar_identity_links where account_id=f.account_id and observation_id=v_observation_id and start_id=v_start_id)
    then raise exception 'radar_identity_assignment_conflict' using errcode='22023';end if;
end $$;
revoke all on function public.kd_radar_identity_capture(uuid) from public,anon,authenticated;
grant execute on function public.kd_radar_identity_capture(uuid) to service_role;

create function public.kd_radar_identity_after_finding() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.kd_radar_identity_capture(new.finding_id);return new;
end $$;
revoke all on function public.kd_radar_identity_after_finding() from public,anon,authenticated;
create trigger kd_radar_identity_after_finding after insert or update on public.kd_radar_text_findings
  for each row execute function public.kd_radar_identity_after_finding();

-- One explicit, atomic owner application. The manifest contains the entire
-- reviewed snapshot; drift fails before activation. No API/model requests.
create function public.kd_radar_identity_apply(p_manifest jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_account uuid:=auth.uid();v_row jsonb;v_work jsonb;v_assignment jsonb;
  f public.kd_radar_text_findings%rowtype;v_id uuid;v_match integer;v_alias public.kd_radar_identity_aliases%rowtype;
begin
  if v_account is null or not exists(select 1 from public.kd_account_access a join public.kd_radar_capabilities c using(account_id)
      where a.account_id=v_account and a.role='owner' and a.active and a.personal_ai and c.radar_pilot and c.radar_review)
    then raise exception 'radar_identity_forbidden' using errcode='42501';end if;
  if jsonb_typeof(p_manifest) is distinct from 'object' or p_manifest->>'format' is distinct from 'kd-radar-identity-manifest-v1'
      or p_manifest->>'accountId' is distinct from v_account::text
      or jsonb_typeof(p_manifest->'snapshot') is distinct from 'array'
      or jsonb_typeof(p_manifest->'assignments') is distinct from 'array'
      or jsonb_typeof(p_manifest->'works') is distinct from 'array'
      or jsonb_array_length(p_manifest->'snapshot')>2000
    then raise exception 'radar_identity_manifest_invalid' using errcode='22023';end if;
  -- Short write lock prevents a new finding from racing the reviewed inventory.
  lock table public.kd_radar_text_findings in share row exclusive mode;
  if jsonb_array_length(p_manifest->'snapshot')<>(select count(*) from public.kd_radar_text_findings where account_id=v_account)
      or jsonb_array_length(p_manifest->'assignments')<>jsonb_array_length(p_manifest->'snapshot')
      or (select count(distinct (e->>'finding_id')::uuid) from jsonb_array_elements(p_manifest->'snapshot') e)<>jsonb_array_length(p_manifest->'snapshot')
      or (select count(distinct (e->>'eventId')::uuid) from jsonb_array_elements(p_manifest->'assignments') e)<>jsonb_array_length(p_manifest->'snapshot')
    then raise exception 'radar_identity_snapshot_drift' using errcode='22023';end if;
  for v_row in select value from jsonb_array_elements(p_manifest->'snapshot') loop
    select * into f from public.kd_radar_text_findings where account_id=v_account and finding_id=(v_row->>'finding_id')::uuid for update;
    if not found or (to_jsonb(f)-array['account_id','checked_at','created_at','updated_at']) is distinct from (v_row-array['checked_at','created_at','updated_at'])
      or f.checked_at is distinct from (v_row->>'checked_at')::timestamptz
      or f.created_at is distinct from (v_row->>'created_at')::timestamptz
      or f.updated_at is distinct from (v_row->>'updated_at')::timestamptz
      then raise exception 'radar_identity_snapshot_drift' using errcode='22023';end if;
  end loop;
  for v_work in select value from jsonb_array_elements(p_manifest->'works') loop
    if jsonb_typeof(v_work->'externalIds') is distinct from 'object'
      or exists(select 1 from jsonb_each(v_work->'externalIds') e where e.key not in ('imdb','tmdb','watchmode')
        or jsonb_typeof(e.value)<>'string' or case when e.key='imdb' then e.value#>>'{}' !~ '^tt[0-9]{7,10}$' else e.value#>>'{}' !~ '^[1-9][0-9]{0,11}$' end)
      then raise exception 'radar_identity_work_invalid' using errcode='22023';end if;
    insert into public.kd_radar_identity_works(account_id,work_id,title,target_type,release_year,external_ids)
      values(v_account,(v_work->>'workId')::uuid,v_work->>'title',v_work->>'targetType',(v_work->>'releaseYear')::integer,v_work->'externalIds')
      on conflict(account_id,work_id) do nothing;
    if not exists(select 1 from public.kd_radar_identity_works where account_id=v_account and work_id=(v_work->>'workId')::uuid
      and title=v_work->>'title' and target_type=v_work->>'targetType' and release_year is not distinct from (v_work->>'releaseYear')::integer
      and external_ids=v_work->'externalIds') then raise exception 'radar_identity_work_conflict' using errcode='22023';end if;
  end loop;
  for v_assignment in select value from jsonb_array_elements(p_manifest->'assignments') loop
    select * into f from public.kd_radar_text_findings where account_id=v_account and finding_id=(v_assignment->>'eventId')::uuid;
    if not found or coalesce(length(v_assignment->>'reason'),0) not between 1 and 500
      then raise exception 'radar_identity_assignment_invalid' using errcode='22023';end if;
    if v_assignment->>'workId' is null then
      if v_assignment->>'editionKey' is not null or v_assignment->>'licenseKey' is not null then raise exception 'radar_identity_assignment_invalid' using errcode='22023';end if;
      continue;
    end if;
    if public.kd_radar_identity_episode(f.title)<0 or not exists(select 1 from public.kd_radar_identity_works
      where account_id=v_account and work_id=(v_assignment->>'workId')::uuid and target_type=f.target_type)
      then raise exception 'radar_identity_assignment_invalid' using errcode='22023';end if;
    insert into public.kd_radar_identity_aliases(account_id,work_id,alias_title,target_type,source_url,event_type,platform,region,season_number,episode_number,edition_key,license_key)
      values(v_account,(v_assignment->>'workId')::uuid,public.kd_radar_identity_title(f.title),f.target_type,f.source_url,f.event_type,f.platform,f.region,
        coalesce(f.season_number,0),public.kd_radar_identity_episode(f.title),v_assignment->>'editionKey',v_assignment->>'licenseKey') on conflict do nothing;
    select * into v_alias from public.kd_radar_identity_aliases where account_id=v_account and alias_title=public.kd_radar_identity_title(f.title)
      and target_type=f.target_type and source_url=f.source_url and event_type=f.event_type and platform=f.platform and region=f.region and season_number=coalesce(f.season_number,0) and episode_number=public.kd_radar_identity_episode(f.title);
    if v_alias.work_id is distinct from (v_assignment->>'workId')::uuid or v_alias.edition_key is distinct from v_assignment->>'editionKey' or v_alias.license_key is distinct from v_assignment->>'licenseKey'
      then raise exception 'radar_identity_alias_ambiguous' using errcode='22023';end if;
  end loop;
  insert into public.kd_radar_identity_settings(account_id,enabled) values(v_account,true)
    on conflict(account_id) do update set enabled=true;
  for v_id in select finding_id from public.kd_radar_text_findings where account_id=v_account loop
    perform public.kd_radar_identity_capture(v_id);
  end loop;
  return jsonb_build_object('ok',true,'originalCount',(select count(*) from public.kd_radar_text_findings where account_id=v_account),
    'observationCount',(select count(*) from public.kd_radar_identity_observations where account_id=v_account),
    'startCount',(select count(*) from public.kd_radar_identity_starts where account_id=v_account));
end $$;
revoke all on function public.kd_radar_identity_apply(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.kd_radar_identity_apply(jsonb) to authenticated;

create function public.kd_radar_identity_disable() returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.kd_account_access where account_id=auth.uid() and role='owner' and active)
    then raise exception 'radar_identity_forbidden' using errcode='42501';end if;
  update public.kd_radar_identity_settings set enabled=false where account_id=auth.uid();
end $$;
revoke all on function public.kd_radar_identity_disable() from public,anon,authenticated,service_role;
grant execute on function public.kd_radar_identity_disable() to authenticated;

create function public.kd_radar_pilot_feed_stable_v1(p_operation_ids uuid[],p_include_search_status boolean) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_feed jsonb;v_rows jsonb:='[]';v_history jsonb:='[]';v_extra jsonb:='[]';v_enabled boolean:=false;
begin
  v_feed:=public.kd_radar_pilot_feed_search_access(p_operation_ids,p_include_search_status);
  select coalesce(enabled,false) into v_enabled from public.kd_radar_identity_settings where account_id=auth.uid();
  if coalesce(v_enabled,false) then
    -- Earlier versions stay visible in the versioned feed while their original
    -- finding still belongs to an active subscription. UUIDs and receipts are
    -- retained; only the new view groups them into a stable start/history.
    select coalesce(jsonb_agg(jsonb_build_object(
      'eventId',o.finding_id,'eventVersionId',o.event_version_id,
      'targetId',public.kd_radar_text_wire_v1_key(o.payload->>'title',(o.payload->>'event_date')::date,
        o.payload->>'event_type',o.payload->>'target_type',(o.payload->>'season_number')::integer),
      'sourceTargetKey',e->>'sourceTargetKey','title',o.payload->>'title','targetType',o.payload->>'target_type',
      'category',o.payload->>'category','eventType',o.payload->>'event_type','date',o.payload->>'event_date',
      'region',o.payload->>'region','platform',o.payload->>'platform','lifecycleStatus','scheduled','verificationStatus','confirmed',
      'evidence',jsonb_build_array(jsonb_build_object('sourceId',left('web:'||(o.payload->>'source_domain'),128),
        'sourceDomain',o.payload->>'source_domain','url',o.payload->>'source_url','retrievedAt',o.payload->>'checked_at'))
      )||case when o.payload->>'season_number' is null then '{}'::jsonb else jsonb_build_object('seasonNumber',(o.payload->>'season_number')::integer) end
      order by o.finding_id,o.event_version_id),'[]') into v_extra
      from jsonb_array_elements(v_feed->'events') e
      join public.kd_radar_identity_observations o on o.account_id=auth.uid() and o.finding_id::text=e->>'eventId' and o.event_version_id::text<>e->>'eventVersionId'
      join public.kd_radar_identity_links l using(account_id,observation_id);
    v_feed:=jsonb_set(v_feed,'{events}',(v_feed->'events')||v_extra);
    select coalesce(jsonb_agg(jsonb_build_object('eventId',f.finding_id,'eventVersionId',o.event_version_id,'workId',w.work_id,
      'startId',s.start_id,'title',w.title,'episodeNumber',nullif(s.episode_number,0),'editionKey',s.edition_key,'licenseKey',s.license_key) order by f.finding_id),'[]') into v_rows
      from jsonb_array_elements(v_feed->'events') e
      join public.kd_radar_text_findings f on f.finding_id::text=e->>'eventId' and f.account_id=auth.uid()
      join public.kd_radar_identity_observations o on o.account_id=f.account_id and o.finding_id=f.finding_id and o.event_version_id::text=e->>'eventVersionId'
      join public.kd_radar_identity_links l on l.account_id=o.account_id and l.observation_id=o.observation_id
      join public.kd_radar_identity_starts s on s.account_id=l.account_id and s.start_id=l.start_id
      join public.kd_radar_identity_works w on w.account_id=s.account_id and w.work_id=s.work_id;
    select coalesce(jsonb_agg(jsonb_build_object('observationId',o.observation_id,'eventId',o.finding_id,'eventVersionId',o.event_version_id,
      'startId',l.start_id,'date',o.payload->>'event_date','title',o.payload->>'title','sourceUrl',o.payload->>'source_url',
      'sourceDomain',o.payload->>'source_domain','checkedAt',o.payload->>'checked_at','sourceClaim',o.payload->>'source_claim') order by o.captured_at,o.observation_id),'[]') into v_history
      from public.kd_radar_identity_observations o join public.kd_radar_identity_links l using(account_id,observation_id)
      where o.account_id=auth.uid() and exists(select 1 from jsonb_array_elements(v_rows) r where r->>'startId'=l.start_id::text);
  end if;
  return jsonb_build_object('format','kd-radar-stable-feed-v1','feed',v_feed,'identities',jsonb_build_object(
    'format','kd-radar-identities-v1','accountId',auth.uid(),'enabled',coalesce(v_enabled,false),'rows',v_rows,'history',v_history));
end $$;
revoke all on function public.kd_radar_pilot_feed_stable_v1(uuid[],boolean) from public,anon,authenticated,service_role;
grant execute on function public.kd_radar_pilot_feed_stable_v1(uuid[],boolean) to authenticated;

-- A separate own-data read exports this new graph without adding fields to
-- strict legacy account-self-service responses.
create function public.kd_radar_identity_export_v1() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_result jsonb;v_rows jsonb;v_name text;
begin
  if auth.uid() is null or not public.kd_radar_text_findings_read_allowed() then
    raise exception 'radar_identity_forbidden' using errcode='42501';end if;
  v_result:=jsonb_build_object('format','kd-radar-identity-backup-v1','accountId',auth.uid());
  foreach v_name in array array['settings','works','aliases','starts','observations','links'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)-''account_id'' order by to_jsonb(x)::text),''[]''::jsonb) from public.kd_radar_identity_%I x where account_id=$1',v_name)
      into v_rows using auth.uid();
    v_result:=jsonb_set(v_result,array[v_name],v_rows,true);
  end loop;
  return v_result;
end $$;
revoke all on function public.kd_radar_identity_export_v1() from public,anon,authenticated,service_role;
grant execute on function public.kd_radar_identity_export_v1() to authenticated;

-- Separate versioned cache: legacy kd:radar/outboxes remain byte-compatible.
-- Gegenprobe: ein unbekannter 'kd:boeser-topf' bleibt mit SQLSTATE 23514 gesperrt.
do $cache_key$
declare v_check text;
begin
  if to_regclass('public.kd_personal') is not null then
    select pg_get_constraintdef(oid) into strict v_check from pg_constraint
      where conrelid='public.kd_personal'::regclass and conname='kd_personal_key_erlaubt';
    execute 'alter table public.kd_personal drop constraint kd_personal_key_erlaubt';
    execute 'alter table public.kd_personal add constraint kd_personal_key_erlaubt CHECK (key=''kd:radar-identities:v1'' OR ('||substr(v_check,8,length(v_check)-8)||'))';
  end if;
end $cache_key$;

notify pgrst,'reload schema';
commit;
