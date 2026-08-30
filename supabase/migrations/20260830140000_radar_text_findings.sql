begin;

-- Private, minimal text discoveries; deliberately not catalogue works and
-- never temporary work subscriptions. Removing an own target/account cascades.
create table public.kd_radar_text_findings (
  finding_id uuid primary key default gen_random_uuid(),
  event_version_id uuid not null default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  text_target_id uuid not null,
  release_key text not null check (release_key ~ '^release:v1:[a-f0-9]{16}$'),
  title text not null check (length(title) between 1 and 200 and title = btrim(title)),
  target_type text not null check (target_type in ('work','series')),
  category text not null check (category in ('film','series','season','special')),
  event_type text not null check (event_type in ('kinostart_at','streamingstart_at','serienstart','staffelstart')),
  event_date date not null,
  region text not null check (region in ('AT','global','unspecified')),
  platform text not null check (length(platform) between 1 and 80),
  season_number integer check (season_number between 1 and 999),
  source_url text not null check (length(source_url) <= 2048 and source_url ~ '^https://'),
  source_domain text not null check (length(source_domain) between 4 and 253),
  source_title text not null check (length(source_title) between 1 and 240),
  source_claim text not null check (length(source_claim) between 1 and 500),
  checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kd_radar_text_findings_subscription_fkey foreign key (account_id,text_target_id)
    references public.kd_radar_subscriptions(account_id,target_id) on delete cascade,
  unique (account_id,text_target_id,release_key)
);
alter table public.kd_radar_text_findings enable row level security;
revoke all on table public.kd_radar_text_findings from public,anon,authenticated,service_role;
grant select on table public.kd_radar_text_findings to authenticated;
grant select,insert,update,delete on table public.kd_radar_text_findings to service_role;
create function public.kd_radar_text_findings_read_allowed() returns boolean
language sql stable security definer set search_path=pg_catalog,public
as $$ select public.kd_radar_pilot_allowed() $$;
revoke all on function public.kd_radar_text_findings_read_allowed() from public,anon,authenticated;
grant execute on function public.kd_radar_text_findings_read_allowed() to authenticated;
create policy kd_radar_text_findings_owner_read on public.kd_radar_text_findings
  for select to authenticated using (account_id = (select auth.uid()) and public.kd_radar_text_findings_read_allowed());

-- Authorization only: a check must not create or reactivate any subscription.
-- The separate provider-free create/pause/remove RPC is unchanged.
create or replace function public.kd_radar_websearch_prepare_text(
  p_account_id uuid, p_target_key text, p_target_text text, p_operation_id uuid
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public as $$
begin
  if p_account_id is null or p_operation_id is null
    or p_target_key is distinct from public.kd_radar_text_target_key(p_target_text)
    or not exists (
      select 1 from public.kd_account_access a
      join public.kd_radar_capabilities c on c.account_id=a.account_id
      join public.kd_radar_subscriptions s on s.account_id=a.account_id
      join public.kd_radar_targets t on t.target_id=s.target_id
      where a.account_id=p_account_id and a.active and a.personal_ai
        and c.radar_pilot and c.radar_review and s.subscription_status='active'
        and s.region='AT' and s.scope='all' and t.target_type='text'
        and t.target_status='active' and t.target_key=p_target_key
        and t.canonical_title=p_target_text and t.external_ids->>'targetText'=p_target_text
    ) then raise exception 'radar_websearch_forbidden' using errcode='42501'; end if;
  return jsonb_build_object('kind','text','targetId',p_target_key,'targetText',p_target_text,
    'region','AT','scopes',jsonb_build_array('cinema','streaming','series_start','season_start'));
end $$;

create function public.kd_radar_websearch_upsert_text_finding(
  p_user_id uuid, p_operation_id uuid, p_payload jsonb
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_target_id uuid;
  v_proof jsonb;
  v_date date;
  v_checked timestamptz;
  v_finding public.kd_radar_text_findings%rowtype;
  v_changed boolean;
begin
  -- The only executable role is service_role. Account and capability binding
  -- is rechecked in the write transaction, including pause/remove races.
  perform public.kd_radar_websearch_prepare_text(p_user_id,p_payload->>'textTargetKey',
    p_payload->>'targetText',p_operation_id);
  select t.target_id into v_target_id from public.kd_radar_targets t
    join public.kd_radar_subscriptions s on s.target_id=t.target_id and s.account_id=p_user_id
    where t.target_key=p_payload->>'textTargetKey' and s.subscription_status='active'
    for update of s;
  if v_target_id is null then raise exception 'radar_websearch_forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_payload->>'targetKey','') !~ '^release:v1:[a-f0-9]{16}$'
    or coalesce(p_payload->>'workTitle','') = ''
    or coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_payload->'evidence') is distinct from 'array'
    or jsonb_array_length(p_payload->'evidence') not between 1 and 6
    then raise exception 'radar_text_finding_invalid' using errcode='22023'; end if;
  v_date := (p_payload->>'date')::date;
  v_checked := (p_payload->>'checkedAt')::timestamptz;
  if v_checked is null or not isfinite(v_checked) or v_checked > now()+interval '5 minutes'
    or v_date < v_checked::date-365 or v_date > v_checked::date+3650
    then raise exception 'radar_text_finding_date_invalid' using errcode='22023'; end if;
  v_proof := p_payload->'evidence'->0;
  if coalesce(v_proof->>'sourceDomain','') !~ '^[a-z0-9][a-z0-9.-]+\.[a-z0-9-]+$'
    or split_part(substr(coalesce(v_proof->>'url',''),9),'/',1) <> v_proof->>'sourceDomain'
    or v_proof->>'url' ~ '[[:space:]#@]'
    or p_payload->>'workTitle' ~ '[[:cntrl:]]'
    or p_payload->>'platform' ~ '[[:cntrl:]]'
    or (p_payload->>'seasonNumber' is not null and p_payload->>'eventType'<>'staffelstart')
    or (p_payload->>'workTargetType'='work' and p_payload->>'eventType' in ('serienstart','staffelstart'))
    or (p_payload->>'workTargetType'='series' and p_payload->>'eventType'='kinostart_at')
    then raise exception 'radar_text_finding_evidence_invalid' using errcode='22023'; end if;
  insert into public.kd_radar_text_findings as f (
    account_id,text_target_id,release_key,title,target_type,category,event_type,event_date,
    region,platform,season_number,source_url,source_domain,source_title,source_claim,checked_at
  ) values (
    p_user_id,v_target_id,p_payload->>'targetKey',p_payload->>'workTitle',p_payload->>'workTargetType',
    p_payload->>'category',p_payload->>'eventType',v_date,p_payload->>'region',
    coalesce(p_payload->>'platform','-'),(p_payload->>'seasonNumber')::integer,
    v_proof->>'url',v_proof->>'sourceDomain',v_proof->>'sourceTitle',v_proof->>'claim',v_checked
  ) on conflict (account_id,text_target_id,release_key) do update set
    title=excluded.title,target_type=excluded.target_type,category=excluded.category,
    event_type=excluded.event_type,event_date=excluded.event_date,region=excluded.region,
    platform=excluded.platform,season_number=excluded.season_number,
    source_url=excluded.source_url,source_domain=excluded.source_domain,
    source_title=excluded.source_title,source_claim=excluded.source_claim,checked_at=excluded.checked_at,
    updated_at=now(),event_version_id=gen_random_uuid()
    where (f.title,f.target_type,f.category,f.event_type,f.event_date,f.region,f.platform,f.season_number,f.source_url)
      is distinct from (excluded.title,excluded.target_type,excluded.category,excluded.event_type,
        excluded.event_date,excluded.region,excluded.platform,excluded.season_number,excluded.source_url)
  returning * into v_finding;
  v_changed := found;
  if not v_changed then select * into strict v_finding from public.kd_radar_text_findings
    where account_id=p_user_id and text_target_id=v_target_id and release_key=p_payload->>'targetKey'; end if;
  return jsonb_build_object('status',case when v_changed then 'confirmed' else 'no_change' end,
    'eventId',v_finding.finding_id,'eventVersionId',v_finding.event_version_id);
end $$;
revoke all on function public.kd_radar_websearch_upsert_text_finding(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kd_radar_websearch_upsert_text_finding(uuid,uuid,jsonb) to service_role;

alter function public.kd_radar_pilot_feed(uuid[]) rename to kd_radar_pilot_feed_findings_internal;
revoke all on function public.kd_radar_pilot_feed_findings_internal(uuid[]) from public,anon,authenticated;
grant execute on function public.kd_radar_pilot_feed_findings_internal(uuid[]) to service_role;
create function public.kd_radar_pilot_feed(p_operation_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_feed jsonb; v_events jsonb;
begin
  v_feed := public.kd_radar_pilot_feed_findings_internal(p_operation_ids);
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId',f.finding_id,'eventVersionId',f.event_version_id,'targetId',f.release_key,
    'title',f.title,'targetType',f.target_type,'category',f.category,
    'eventType',f.event_type,'date',f.event_date,'region',f.region,'platform',f.platform,
    'lifecycleStatus','scheduled','verificationStatus','confirmed',
    'evidence',jsonb_build_array(jsonb_build_object('sourceId',left('web:'||f.source_domain,128),
      'sourceDomain',f.source_domain,'url',f.source_url,'retrievedAt',f.checked_at))
  ) || case when f.season_number is null then '{}'::jsonb else jsonb_build_object('seasonNumber',f.season_number) end
    order by f.event_date,f.title,f.finding_id),'[]'::jsonb) into v_events
    from public.kd_radar_text_findings f
    join public.kd_radar_subscriptions s on s.account_id=f.account_id and s.target_id=f.text_target_id
    join public.kd_radar_targets t on t.target_id=s.target_id
    where f.account_id=auth.uid() and s.subscription_status='active'
      and s.region='AT' and s.scope='all' and t.target_type='text' and t.target_status='active';
  return jsonb_set(v_feed,'{events}',coalesce(v_feed->'events','[]'::jsonb)||v_events,false);
end $$;
revoke all on function public.kd_radar_pilot_feed(uuid[]) from public,anon,authenticated;
grant execute on function public.kd_radar_pilot_feed(uuid[]) to authenticated,service_role;

alter function public.kd_private_own_data(uuid) rename to kd_private_own_data_text_internal;
revoke all on function public.kd_private_own_data_text_internal(uuid) from public,anon,authenticated;
grant execute on function public.kd_private_own_data_text_internal(uuid) to service_role;
create function public.kd_private_own_data(p_account_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_result jsonb;
begin
  v_result := public.kd_private_own_data_text_internal(p_account_id);
  return jsonb_set(v_result,'{radar,textFindings}',coalesce((select jsonb_agg(to_jsonb(f)-'account_id'
    order by f.created_at,f.finding_id) from public.kd_radar_text_findings f
    where f.account_id=p_account_id),'[]'::jsonb),true);
end $$;
revoke all on function public.kd_private_own_data(uuid) from public,anon,authenticated;
grant execute on function public.kd_private_own_data(uuid) to service_role;
insert into public.kd_private_delete_map(storage_class,account_column,action,reason)
values ('kd_radar_text_findings','account_id','cascade','Private text findings cascade on account or subscription deletion');

-- Only text gets up to four search uses. Structured paths retain one use and
-- their 1200-output-token/5-cent adapter cap. Haiku alias/prices are unchanged.
update public.kd_ai_limits set wert=jsonb_set(wert,'{radar-websearch}','2400'::jsonb)
  where schluessel='task_max_tokens';
update public.kd_ai_limits set wert=jsonb_set(wert,'{radar-websearch}','20'::jsonb)
  where schluessel='task_max_reservierung_usd_cent';
do $patch$
declare v_definition text;
begin
  select pg_get_functiondef('public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer)'::regprocedure) into v_definition;
  if position('p_search_requests is distinct from 1' in v_definition)=0
    or position('v_task_cap is distinct from 5' in v_definition)=0 then
    raise exception 'radar_text_cost_definition_drift'; end if;
  v_definition := replace(v_definition,'p_search_requests is distinct from 1',
    $new$(p_search_requests is null or p_search_requests not between 1 and 4
      or (p_search_requests<>1 and not exists (select 1 from public.kd_radar_targets text_target
        where text_target.target_key=p_target_key and text_target.target_type='text')))$new$);
  v_definition := replace(v_definition,'v_task_cap is distinct from 5','v_task_cap is distinct from 20');
  v_definition := replace(v_definition,'p_reservierung < v_fee','p_reservierung < v_fee * p_search_requests');
  v_definition := replace(v_definition,'p_reservierung > v_task_cap',
    $new$p_reservierung > (case when exists (select 1 from public.kd_radar_targets text_target
      where text_target.target_key=p_target_key and text_target.target_type='text') then v_task_cap else 5 end)$new$);
  execute v_definition;
end $patch$;
notify pgrst, 'reload schema';
commit;
