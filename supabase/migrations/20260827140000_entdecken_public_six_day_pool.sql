-- Kinodreieck · providerfreier Entdecken-Pool alle 144 Stunden
-- =============================================================================
-- Forward-only. Stellt den bisherigen bezahlten Redaktionsfeed auf genau eine
-- owner_private Joyn-Quelle um. Der Scheduler darf taeglich um 02:00 UTC
-- (03:00 CET / 04:00 CEST) anklopfen; nur die atomare DB-Pruefung entscheidet, ob seit
-- dem letzten Erfolg beziehungsweise verbrauchten Versuch exakt mindestens
-- 144 Stunden vergangen sind. Es gibt keinen Retry im selben Zeitfenster.
--
-- Der Singleton-Payload wird ueberschrieben: keine fremde Chart-Historie.
-- Ein Quellen-/Wikidatafehler behaelt den letzten guten Payload. Wikidata ist
-- ein serieller, gecachter Zusatz und nie Voraussetzung fuer den Joyn-Pool.
-- =============================================================================

begin;

alter table public.kd_entdecken_daily_settings
  add column owner_private_source_enabled boolean not null default false;

comment on column public.kd_entdecken_daily_settings.owner_private_source_enabled is
  'Erlaubt ausschliesslich den privaten, kostenlosen chart:joyn-at-Pfad; keine Betreiberfreigabe und keine kommerzielle Nutzung.';

-- Die alten Redaktionsquellen bleiben als nachvollziehbare Metadaten erhalten,
-- sind fuer den neuen Produktpfad aber inaktiv. owner_private behauptet keine
-- Betreiberfreigabe; Attribution und exakte Quelllinks bleiben trotzdem Pflicht.
alter table public.kd_entdecken_sources
  drop constraint if exists kd_entdecken_sources_source_id_check;
alter table public.kd_entdecken_sources
  drop constraint if exists kd_entdecken_sources_source_class_check;
alter table public.kd_entdecken_sources
  drop constraint if exists kd_entdecken_sources_rights_status_check;
alter table public.kd_entdecken_sources
  drop constraint if exists kd_entdecken_sources_check;

alter table public.kd_entdecken_sources
  add constraint kd_entdecken_sources_source_id_v2_check
  check (source_id ~ '^(editorial|chart):[a-z0-9][a-z0-9_-]{1,95}$'),
  add constraint kd_entdecken_sources_source_class_v2_check
  check (source_class in ('editorial','chart')),
  add constraint kd_entdecken_sources_rights_status_v2_check
  check (rights_status in ('pending','approved','blocked','owner_private')),
  add constraint kd_entdecken_sources_active_v2_check
  check (not active or (rights_status in ('approved','owner_private') and attribution_approved));

update public.kd_entdecken_sources
   set active = false,
       updated_at = clock_timestamp()
 where active;

insert into public.kd_entdecken_sources (
  source_id, domain, publisher_family, source_class, rights_status,
  attribution_approved, subdomains_allowed, active, terms_url, terms_checked_on
) values (
  'chart:joyn-at', 'joyn.at', 'Joyn AT / ProSiebenSat.1 PULS 4', 'chart',
  'owner_private', true, true, true,
  'https://www.joyn.at/unternehmen/agb', date '2026-08-27'
);

alter table public.kd_entdecken_daily_feed
  add column last_success_at timestamptz,
  add column last_public_attempt_at timestamptz;

alter table public.kd_entdecken_daily_feed
  drop constraint if exists kd_entdecken_daily_feed_last_error_code_check;
alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_daily_feed_last_error_code_v2_check
  check (last_error_code is null or last_error_code in (
    'provider_error','source_error','invalid_response','storage_error','source_registry_unavailable'
  ));

-- Ein eventuell laufender alter Providerclaim wird nicht in den kostenlosen
-- Pfad uebernommen. Der letzte Payload bleibt bis zum ersten sicheren Joyn-
-- Erfolg sichtbar; nur alte Lease-/Providerbindung und Versuchszaehler enden.
update public.kd_entdecken_daily_feed
   set status = case when payload is null then 'empty' else 'ready' end,
       provider_operation_id = null,
       ready_provider_operation_id = null,
       ready_fence_token = null,
       lease_expires_at = null,
       last_error_code = null,
       last_failure_at = null,
       attempt_iso_week = null,
       attempt_count = 0,
       recovery_authorized_iso_week = null,
       updated_at = clock_timestamp()
 where singleton;

-- Die Legacy-Spalte staging_owner_refresh_override liegt in Settings, nicht
-- im Feed. Sie wird bewusst und kontrolliert deaktiviert.
update public.kd_entdecken_daily_settings
   set owner_pilot_enabled = true,
       feed_enabled = true,
       provider_enabled = false,
       public_enabled = true,
       commercial_enabled = false,
       owner_private_source_enabled = true,
       staging_owner_refresh_override = false,
       updated_at = clock_timestamp()
 where singleton;

create table public.kd_entdecken_wikidata_cache (
  source_item_id       text primary key
                       check (source_item_id ~ '^[fs]_[a-z0-9]+(-[a-z0-9]+)*$'
                         and length(source_item_id) <= 182),
  title_fingerprint    text not null check (title_fingerprint ~ '^[a-f0-9]{16}$'),
  media_type           text not null check (media_type in ('film','series')),
  resolver_version     integer not null check (resolver_version > 0),
  status               text not null check (status in (
                         'resolved','not_found','ambiguous_blocked','incomplete_blocked'
                       )),
  qid                  text check (qid is null or qid ~ '^Q[1-9][0-9]*$'),
  release_year         integer check (release_year is null or release_year between 1888 and 2100),
  imdb_id              text check (imdb_id is null or imdb_id ~ '^tt[0-9]{7,10}$'),
  tmdb_id              text check (tmdb_id is null or tmdb_id ~ '^[1-9][0-9]{0,8}$'),
  wikidata_revision_id bigint check (wikidata_revision_id is null or wikidata_revision_id > 0),
  resolved_at          timestamptz not null,
  checked_at           timestamptz not null,
  updated_at           timestamptz not null default now(),
  check (
    (status = 'resolved' and qid is not null
      and (release_year is not null or imdb_id is not null or tmdb_id is not null))
    or
    (status <> 'resolved' and qid is null and release_year is null
      and imdb_id is null and tmdb_id is null and wikidata_revision_id is null)
  )
);

comment on table public.kd_entdecken_wikidata_cache is
  'Persistenter positiver und negativer Cache fuer den seriellen Wikidata-Resolver. Keine Nutzer-, Profil- oder Joyn-Rohdaten.';

alter table public.kd_entdecken_wikidata_cache enable row level security;
alter table public.kd_entdecken_wikidata_cache force row level security;
revoke all on table public.kd_entdecken_wikidata_cache from public, anon, authenticated;
grant select, insert, update on table public.kd_entdecken_wikidata_cache to service_role;

-- Tiefe DB-Validierung des einzigen erlaubten Format-5-Payloads. Die Function
-- faengt auch Cast-/JSON-Fehler ab und liefert dann false statt Teilwrites.
create function public.kd_entdecken_public_payload_valid(
  p_payload jsonb,
  p_today date
) returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_annotation jsonb;
  v_count integer;
  v_distinct integer;
  v_type text;
begin
  if p_today is null or jsonb_typeof(p_payload) is distinct from 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) is distinct from 9::bigint
     or not (p_payload ?& array[
       'format','feedId','region','sourceId','isoWeek','refreshedOn','validUntil','items','annotations'
     ])
     or p_payload->>'format' is distinct from '5'
     or p_payload->>'feedId' is distinct from 'public:weekly-popular-at'
     or p_payload->>'region' is distinct from 'AT'
     or p_payload->>'sourceId' is distinct from 'chart:joyn-at'
     or p_payload->>'isoWeek' is distinct from to_char(p_today, 'IYYY-"W"IW')
     or p_payload->>'refreshedOn' is distinct from p_today::text
     or p_payload->>'validUntil' is distinct from (p_today + 6)::text
     or jsonb_typeof(p_payload->'items') is distinct from 'array'
     or jsonb_array_length(p_payload->'items') is distinct from 50
     or jsonb_typeof(p_payload->'annotations') is distinct from 'array'
     or jsonb_array_length(p_payload->'annotations') > 50 then
    return false;
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_payload->'items') loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_item)) is distinct from 9::bigint
       or not (v_item ?& array[
         'title','sourceItemId','mediaType','genres','licenseTypes',
         'sourcePosition','listDate','sourceUrl','fetchedAt'
       ])
       or btrim(v_item->>'title') is distinct from v_item->>'title'
       or length(v_item->>'title') not between 1 and 200
       or v_item->>'sourceItemId' !~ '^[fs]_[a-z0-9]+(-[a-z0-9]+)*$'
       or length(v_item->>'sourceItemId') > 182
       or v_item->>'mediaType' not in ('film','series')
       or jsonb_typeof(v_item->'genres') is distinct from 'array'
       or jsonb_array_length(v_item->'genres') > 8
       or jsonb_typeof(v_item->'licenseTypes') is distinct from 'array'
       or jsonb_array_length(v_item->'licenseTypes') not between 1 and 4
       or jsonb_typeof(v_item->'sourcePosition') is distinct from 'number'
       or (v_item->>'sourcePosition')::integer not between 1 and 50
       or v_item->>'listDate' is distinct from p_today::text
       or v_item->>'fetchedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' then
      return false;
    end if;
    v_type := v_item->>'mediaType';
    if (v_type = 'film' and v_item->>'sourceUrl' !~ '^https://www[.]joyn[.]at/filme/[^?#[:space:]]+$')
       or (v_type = 'series' and v_item->>'sourceUrl' !~ '^https://www[.]joyn[.]at/serien/[^?#[:space:]]+$') then
      return false;
    end if;

    select count(*), count(distinct lower(value #>> '{}'))
      into v_count, v_distinct
      from pg_catalog.jsonb_array_elements(v_item->'genres');
    if v_count is distinct from v_distinct or exists (
      select 1 from pg_catalog.jsonb_array_elements(v_item->'genres') genre(value)
       where jsonb_typeof(value) is distinct from 'string'
          or btrim(value #>> '{}') is distinct from value #>> '{}'
          or length(value #>> '{}') not between 1 and 80
    ) then return false; end if;

    select count(*), count(distinct value #>> '{}')
      into v_count, v_distinct
      from pg_catalog.jsonb_array_elements(v_item->'licenseTypes');
    if v_count is distinct from v_distinct or exists (
      select 1 from pg_catalog.jsonb_array_elements(v_item->'licenseTypes') license(value)
       where jsonb_typeof(value) is distinct from 'string'
          or value #>> '{}' not in ('AVOD','FVOD','SVOD')
    ) then return false; end if;
  end loop;

  if (select count(distinct value->>'sourceItemId') from pg_catalog.jsonb_array_elements(p_payload->'items')) <> 50
     or (select count(distinct lower(value->>'title')) from pg_catalog.jsonb_array_elements(p_payload->'items')) <> 50
     or (select count(distinct value->>'sourceUrl') from pg_catalog.jsonb_array_elements(p_payload->'items')) <> 50
     or (select count(distinct (value->>'mediaType') || '|' || (value->>'sourcePosition'))
           from pg_catalog.jsonb_array_elements(p_payload->'items')) <> 50
     or (select count(distinct value->>'fetchedAt') from pg_catalog.jsonb_array_elements(p_payload->'items')) <> 1 then
    return false;
  end if;

  for v_annotation in select value from pg_catalog.jsonb_array_elements(p_payload->'annotations') loop
    if jsonb_typeof(v_annotation) is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_annotation)) is distinct from 6::bigint
       or not (v_annotation ?& array[
         'sourceItemId','qid','mediaType','releaseYear','externalIds','resolvedAt'
       ])
       or v_annotation->>'qid' !~ '^Q[1-9][0-9]*$'
       or v_annotation->>'mediaType' not in ('film','series')
       or jsonb_typeof(v_annotation->'externalIds') is distinct from 'object'
       or (select count(*) from pg_catalog.jsonb_object_keys(v_annotation->'externalIds')) > 2
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(v_annotation->'externalIds') as external_key(name)
          where name not in ('imdb','tmdb')
       )
       or (v_annotation->'externalIds' ? 'imdb' and v_annotation#>>'{externalIds,imdb}' !~ '^tt[0-9]{7,10}$')
       or (v_annotation->'externalIds' ? 'tmdb' and v_annotation#>>'{externalIds,tmdb}' !~ '^[1-9][0-9]{0,8}$')
       or (jsonb_typeof(v_annotation->'releaseYear') not in ('null','number'))
       or (jsonb_typeof(v_annotation->'releaseYear') = 'number'
           and (v_annotation->>'releaseYear')::integer not between 1888 and 2100)
       or (jsonb_typeof(v_annotation->'releaseYear') = 'null'
           and (select count(*) from pg_catalog.jsonb_object_keys(v_annotation->'externalIds')) = 0)
       or v_annotation->>'resolvedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
       or not exists (
         select 1 from pg_catalog.jsonb_array_elements(p_payload->'items') item(value)
          where value->>'sourceItemId' = v_annotation->>'sourceItemId'
            and value->>'mediaType' = v_annotation->>'mediaType'
       ) then return false; end if;
  end loop;
  if (select count(*) from pg_catalog.jsonb_array_elements(p_payload->'annotations'))
     is distinct from
     (select count(distinct value->>'sourceItemId') from pg_catalog.jsonb_array_elements(p_payload->'annotations')) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end
$$;

create or replace function public.kd_entdecken_weekly_feed_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_enabled boolean := false;
  v_feed public.kd_entdecken_daily_feed%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode','read','claimStatus','disabled','attemptCount',0,'maxAttempts',1,'feedReadback',null);
  end if;
  select feed_enabled and public_enabled and owner_private_source_enabled and not commercial_enabled
         and (select count(*) from public.kd_entdecken_sources where active) = 1
         and exists (
           select 1 from public.kd_entdecken_sources
            where source_id = 'chart:joyn-at' and domain = 'joyn.at'
              and source_class = 'chart' and rights_status = 'owner_private'
              and attribution_approved and active
         )
    into v_enabled from public.kd_entdecken_daily_settings where singleton;
  select * into v_feed from public.kd_entdecken_daily_feed where singleton;
  if not found then v_enabled := false; end if;
  return jsonb_build_object(
    'feedEnabled',coalesce(v_enabled,false),'providerEnabled',false,'today',v_today,
    'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,
    'feed',case when coalesce(v_enabled,false) then v_feed.payload else null end,
    'requestMode','read','claimStatus','read_only','attemptCount',0,'maxAttempts',1,'feedReadback',null
  );
end
$$;

create or replace function public.kd_entdecken_weekly_refresh_claim(
  p_source text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_utc timestamp := v_now at time zone 'UTC';
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_enabled boolean := false;
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_anchor timestamptz;
  v_due boolean := false;
  v_claim boolean := false;
  v_status text := 'held';
  v_fence bigint;
begin
  if auth.role() is distinct from 'service_role' or p_source is distinct from 'scheduled' then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',coalesce(p_source,'invalid'),'claimStatus','disabled',
      'attemptCount',0,'maxAttempts',1,'feedReadback',null);
  end if;
  select feed_enabled and public_enabled and owner_private_source_enabled and not commercial_enabled
         and (select count(*) from public.kd_entdecken_sources where active) = 1
         and exists (
           select 1 from public.kd_entdecken_sources
            where source_id = 'chart:joyn-at' and domain = 'joyn.at'
              and source_class = 'chart' and rights_status = 'owner_private'
              and attribution_approved and active
         )
    into v_enabled from public.kd_entdecken_daily_settings where singleton for update;
  select * into v_feed from public.kd_entdecken_daily_feed where singleton for update;
  if not found then v_enabled := false; end if;

  v_anchor := case
    when v_feed.last_success_at is null then v_feed.last_public_attempt_at
    when v_feed.last_public_attempt_at is null then v_feed.last_success_at
    else greatest(v_feed.last_success_at, v_feed.last_public_attempt_at)
  end;
  v_due := v_anchor is null or v_now >= v_anchor + interval '144 hours';

  if not coalesce(v_enabled,false) then v_status := 'disabled';
  elsif extract(hour from v_utc)::integer <> 2 then v_status := 'outside_window';
  elsif v_feed.status = 'refreshing' and v_feed.lease_expires_at > v_now then v_status := 'in_progress';
  elsif not v_due then v_status := 'not_due';
  else
    update public.kd_entdecken_daily_feed
       set last_public_attempt_at = v_now,
           last_attempt_on = v_today,
           last_attempt_iso_week = v_iso_week,
           attempt_iso_week = v_iso_week,
           attempt_count = 1,
           provider_operation_id = null,
           fence_token = fence_token + 1,
           lease_expires_at = v_now + interval '180 seconds',
           status = 'refreshing',
           last_error_code = null,
           last_failure_at = null,
           recovery_authorized_iso_week = null,
           updated_at = v_now
     where singleton
     returning fence_token into v_fence;
    v_claim := found;
    v_status := case when v_claim then 'claimed' else 'held' end;
  end if;
  return jsonb_build_object(
    'feedEnabled',coalesce(v_enabled,false),'providerEnabled',false,'today',v_today,
    'isoWeek',v_iso_week,'refresh',v_claim,
    'fenceToken',case when v_claim then v_fence else null end,
    'feed',case when coalesce(v_enabled,false) then v_feed.payload else null end,
    'requestMode','scheduled','claimStatus',v_status,
    'attemptCount',case when v_claim then 1 else 0 end,'maxAttempts',1,'feedReadback',null
  );
end
$$;

create or replace function public.kd_entdecken_daily_claim()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$ select public.kd_entdecken_weekly_feed_status(); $$;

create or replace function public.kd_entdecken_daily_recovery_claim()
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$ select public.kd_entdecken_weekly_refresh_claim('owner'); $$;

create or replace function public.kd_entdecken_daily_save(
  p_payload jsonb,
  p_fence_token bigint
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_source_count integer;
begin
  if p_fence_token is null or p_fence_token <= 0
     or not public.kd_entdecken_public_payload_valid(p_payload, v_today) then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;
  -- SHARE sperrt parallele INSERT/UPDATE/DELETE bis Save und Quellenbeleg
  -- gemeinsam abgeschlossen sind; so kann kein ungepruefter Payload stehen.
  lock table public.kd_entdecken_sources in share mode;
  select count(*) into v_source_count from public.kd_entdecken_sources where active;
  if v_source_count is distinct from 1 or not exists (
    select 1 from public.kd_entdecken_sources
     where source_id = 'chart:joyn-at' and domain = 'joyn.at'
       and source_class = 'chart' and rights_status = 'owner_private'
       and attribution_approved and active
  ) then
    return jsonb_build_object('ok',false,'code','source_registry_unavailable');
  end if;
  update public.kd_entdecken_daily_feed
     set payload = p_payload,
         refreshed_on = v_today,
         refreshed_iso_week = p_payload->>'isoWeek',
         valid_until = v_today + 6,
         last_success_at = v_now,
         status = 'ready',
         last_error_code = null,
         lease_expires_at = null,
         last_failure_at = null,
         provider_operation_id = null,
         ready_provider_operation_id = null,
         ready_fence_token = p_fence_token,
         recovery_authorized_iso_week = null,
         updated_at = v_now
   where singleton and status = 'refreshing'
     and fence_token = p_fence_token
     and last_public_attempt_at is not null
     and lease_expires_at >= v_now;
  if not found then return jsonb_build_object('ok',false,'code','state_invalid'); end if;
  return jsonb_build_object('ok',true,'status','saved');
end
$$;

create or replace function public.kd_entdecken_daily_fail(
  p_code text,
  p_fence_token bigint
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_safe text := case when p_code in (
    'source_error','invalid_response','storage_error','source_registry_unavailable'
  ) then p_code else 'source_error' end;
begin
  update public.kd_entdecken_daily_feed
     set status = 'error', last_error_code = v_safe,
         lease_expires_at = null, last_failure_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where singleton and status = 'refreshing'
     and fence_token = p_fence_token;
  return jsonb_build_object('ok',found,'status','recorded');
end
$$;

create function public.kd_entdecken_public_feed_readback(
  p_fence_token bigint
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb;
  v_refreshed date;
  v_source_count integer;
begin
  if auth.role() is distinct from 'service_role'
     or p_fence_token is null or p_fence_token <= 0 then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  select payload, refreshed_on into v_payload, v_refreshed
    from public.kd_entdecken_daily_feed
   where singleton and status = 'ready' and ready_fence_token = p_fence_token;
  if not found or not public.kd_entdecken_public_payload_valid(v_payload, v_refreshed) then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  select count(*) into v_source_count from public.kd_entdecken_sources where active;
  if v_source_count is distinct from 1 or not exists (
    select 1 from public.kd_entdecken_sources
     where source_id = 'chart:joyn-at' and domain = 'joyn.at'
       and source_class = 'chart' and rights_status = 'owner_private'
       and attribution_approved and active
  ) then
    return jsonb_build_object('ok',false,'status','unverified');
  end if;
  return jsonb_build_object(
    'ok',true,'status','verified','feed',v_payload,'fenceToken',p_fence_token,
    'provenance',jsonb_build_object(
      'itemCount',50,'sourceCount',1,'sourceId','chart:joyn-at','rightsStatus','owner_private'
    )
  );
end
$$;

revoke all on function public.kd_entdecken_public_payload_valid(jsonb,date)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_weekly_feed_status()
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_weekly_refresh_claim(text)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_claim()
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_recovery_claim()
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_save(jsonb,bigint)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_fail(text,bigint)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_public_feed_readback(bigint)
  from public, anon, authenticated;

grant execute on function public.kd_entdecken_public_payload_valid(jsonb,date) to service_role;
grant execute on function public.kd_entdecken_weekly_feed_status() to service_role;
grant execute on function public.kd_entdecken_weekly_refresh_claim(text) to service_role;
grant execute on function public.kd_entdecken_daily_claim() to service_role;
grant execute on function public.kd_entdecken_daily_recovery_claim() to service_role;
grant execute on function public.kd_entdecken_daily_save(jsonb,bigint) to service_role;
grant execute on function public.kd_entdecken_daily_fail(text,bigint) to service_role;
grant execute on function public.kd_entdecken_public_feed_readback(bigint) to service_role;

comment on function public.kd_entdecken_weekly_refresh_claim(text) is
  'Nur scheduled, nur 02:00-02:59 UTC (03 Uhr CET / 04 Uhr CEST), atomar fruehestens 144 Stunden nach letztem Erfolg oder verbrauchtem Versuch; maxAttempts 1.';
comment on function public.kd_entdecken_public_feed_readback(bigint) is
  'Providerfreier, inhaltsarmer Save-Readback fuer exakt einen Format-5-Joyn-Pool mit owner_private-Provenienz.';

do $$
begin
  if not exists (
    select 1 from public.kd_entdecken_daily_settings
     where singleton and owner_private_source_enabled and feed_enabled
       and public_enabled and not provider_enabled and not commercial_enabled
       and not staging_owner_refresh_override
  ) then raise exception 'Entdecken owner_private Settings nicht sicher hergestellt'; end if;
  if (select count(*) from public.kd_entdecken_sources where active) is distinct from 1
     or not exists (
       select 1 from public.kd_entdecken_sources
        where source_id = 'chart:joyn-at' and rights_status = 'owner_private'
          and source_class = 'chart' and active
     ) then raise exception 'Entdecken owner_private Quellenstand driftet'; end if;
end
$$;

commit;

-- Diese Migration nur in einem separat freigegebenen Remote-Fenster anwenden.
-- Der GitHub-Zeitplan wird erst im Default-Branch aktiv.
