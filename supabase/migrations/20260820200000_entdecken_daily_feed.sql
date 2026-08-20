-- Kinodreieck · Entdecken-Tagesfeed · Etappe 3 (privater Owner-Pilot)
-- =============================================================================
-- STATUS: ADDITIVE ERSTANLAGE. DARF NIE ALS HISTORISCHE MIGRATION WIEDERHOLT WERDEN.
--
-- Privater, nichtkommerzieller Max-only-Feed fuer redaktionell belegte
-- Film-/Serientipps. Browser-Public, kommerzielle Nutzung, Scheduler und
-- Frontendflag bleiben hart aus. Ein Anbieterrequest ist auch bei parallelen
-- GETs hoechstens einmal je Wien-Kalendertag reservierbar.
-- =============================================================================

begin;

do $$
declare
  v_wert jsonb;
begin
  select wert into v_wert from public.kd_ai_limits
   where schluessel = 'task_modell' for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'Entdecken task_modell fehlt oder ist formfremd';
  end if;
  if v_wert ? 'entdecken-daily'
     and v_wert->'entdecken-daily' is distinct from to_jsonb('klein'::text) then
    raise exception 'Entdecken task_modell drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{entdecken-daily}', to_jsonb('klein'::text), true)
   where schluessel = 'task_modell';

  select wert into v_wert from public.kd_ai_limits
   where schluessel = 'task_max_tokens' for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'Entdecken task_max_tokens fehlt oder ist formfremd';
  end if;
  if v_wert ? 'entdecken-daily'
     and v_wert->'entdecken-daily' is distinct from to_jsonb(1800) then
    raise exception 'Entdecken task_max_tokens drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{entdecken-daily}', to_jsonb(1800), true)
   where schluessel = 'task_max_tokens';

  select wert into v_wert from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent' for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'Entdecken task_max_reservierung_usd_cent fehlt oder ist formfremd';
  end if;
  if v_wert ? 'entdecken-daily'
     and v_wert->'entdecken-daily' is distinct from to_jsonb(5) then
    raise exception 'Entdecken task_max_reservierung_usd_cent drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{entdecken-daily}', to_jsonb(5), true)
   where schluessel = 'task_max_reservierung_usd_cent';

  if not exists (
    select 1 from public.kd_ai_limits
     where schluessel = 'websearch_usd_cent_pro_request'
       and jsonb_typeof(wert) = 'number'
       and (wert #>> '{}')::numeric = 1
  ) then
    raise exception 'Entdecken Websearch-Gebuehr fehlt oder driftet';
  end if;
end
$$;

create table public.kd_entdecken_daily_settings (
  singleton                   boolean primary key default true check (singleton),
  owner_pilot_enabled         boolean not null default false,
  feed_enabled                boolean not null default false,
  provider_enabled            boolean not null default false,
  public_enabled              boolean not null default false,
  commercial_enabled          boolean not null default false,
  updated_at                  timestamptz not null default now(),
  check (not public_enabled and not commercial_enabled),
  check (not provider_enabled or (owner_pilot_enabled and feed_enabled))
);

insert into public.kd_entdecken_daily_settings
  (singleton, owner_pilot_enabled, feed_enabled, provider_enabled, public_enabled, commercial_enabled)
values (true, false, false, false, false, false);

comment on table public.kd_entdecken_daily_settings is
  'Privater Max-only-Pilot. Public, kommerziell und Scheduler bleiben ausserhalb dieses Vertrages hart aus.';

create table public.kd_entdecken_sources (
  source_id             text primary key
                        check (source_id ~ '^editorial:[a-z0-9][a-z0-9_-]{1,95}$'),
  domain                text not null unique
                        check (domain = lower(domain) and domain ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' and position('.' in domain) > 0),
  publisher_family      text not null check (btrim(publisher_family) = publisher_family and length(publisher_family) between 1 and 120),
  source_class          text not null default 'editorial' check (source_class = 'editorial'),
  rights_status         text not null default 'pending' check (rights_status in ('pending','approved','blocked')),
  attribution_approved  boolean not null default false,
  subdomains_allowed    boolean not null default false,
  active                boolean not null default false,
  terms_url             text not null check (terms_url ~ '^https://[^[:space:]#]+$'),
  terms_checked_on      date not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (not active or (rights_status = 'approved' and attribution_approved))
);

comment on table public.kd_entdecken_sources is
  'Service-role-only Quellenregister fuer den privaten, nichtkommerziellen Pilot; gespeichert werden keine Rezensionstexte, Zitate, Bilder oder Logos.';

insert into public.kd_entdecken_sources (
  source_id, domain, publisher_family, source_class, rights_status,
  attribution_approved, subdomains_allowed, active, terms_url, terms_checked_on
) values
  (
    'editorial:derstandard', 'derstandard.at', 'DER STANDARD', 'editorial', 'approved',
    true, true, true, 'https://about.derstandard.at/nutzungsbedingungen/', date '2026-08-20'
  ),
  (
    'editorial:filmat', 'film.at', 'film.at / k-digital Medien', 'editorial', 'approved',
    true, true, true, 'https://www.film.at/kontakt-impressum-redaktion-filmat/401835922', date '2026-08-20'
  );

create table public.kd_entdecken_daily_feed (
  singleton              boolean primary key default true check (singleton),
  payload                jsonb,
  refreshed_on           date,
  valid_until            date,
  last_attempt_on        date,
  provider_operation_id  uuid,
  status                 text not null default 'empty'
                         check (status in ('empty','ready','refreshing','error')),
  last_error_code        text check (last_error_code is null or last_error_code in (
                           'provider_error','invalid_response','storage_error','source_registry_unavailable'
                         )),
  updated_at             timestamptz not null default now(),
  check ((payload is null and refreshed_on is null and valid_until is null)
      or (payload is not null and refreshed_on is not null and valid_until >= refreshed_on))
);

insert into public.kd_entdecken_daily_feed (singleton) values (true);

comment on table public.kd_entdecken_daily_feed is
  'Ein globaler kanonischer Webtipps-Feed. Fehler ersetzen einen noch gueltigen alten Feed nicht.';

alter table public.kd_entdecken_daily_settings enable row level security;
alter table public.kd_entdecken_daily_settings force row level security;
alter table public.kd_entdecken_sources enable row level security;
alter table public.kd_entdecken_sources force row level security;
alter table public.kd_entdecken_daily_feed enable row level security;
alter table public.kd_entdecken_daily_feed force row level security;

revoke all on table public.kd_entdecken_daily_settings from public, anon, authenticated;
revoke all on table public.kd_entdecken_sources from public, anon, authenticated;
revoke all on table public.kd_entdecken_daily_feed from public, anon, authenticated;
grant select, update on table public.kd_entdecken_daily_settings to service_role;
grant select, insert, update, delete on table public.kd_entdecken_sources to service_role;
grant select, update on table public.kd_entdecken_daily_feed to service_role;

-- Sperrt Settings und Feed atomar. `last_attempt_on` wird VOR jedem moeglichen
-- Netzaufruf gesetzt. Ein Absturz verbraucht damit den Tagesversuch, statt bei
-- jedem Client-GET eine neue bezahlte Suche anzustossen.
create function public.kd_entdecken_daily_claim()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_today date := (now() at time zone 'Europe/Vienna')::date;
  v_feed_enabled boolean;
  v_provider_enabled boolean;
  v_owner_pilot_enabled boolean;
  v_public_enabled boolean;
  v_commercial_enabled boolean;
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_refresh boolean := false;
  v_payload jsonb;
begin
  select owner_pilot_enabled, feed_enabled, provider_enabled, public_enabled, commercial_enabled
    into v_owner_pilot_enabled, v_feed_enabled, v_provider_enabled, v_public_enabled, v_commercial_enabled
    from public.kd_entdecken_daily_settings
   where singleton
   for update;
  if not found then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,
      'today',v_today,'refresh',false,'feed',null);
  end if;

  select * into v_feed from public.kd_entdecken_daily_feed
   where singleton
   for update;
  if not found then
    return jsonb_build_object('feedEnabled',false,'providerEnabled',false,
      'today',v_today,'refresh',false,'feed',null);
  end if;

  if v_feed.payload is not null and v_feed.valid_until >= v_today then
    v_payload := v_feed.payload;
  else
    v_payload := null;
  end if;

  if v_owner_pilot_enabled and v_feed_enabled and v_provider_enabled
     and not v_public_enabled and not v_commercial_enabled
     and v_feed.last_attempt_on is distinct from v_today
     and v_feed.refreshed_on is distinct from v_today then
    update public.kd_entdecken_daily_feed
       set last_attempt_on = v_today,
           provider_operation_id = null,
           status = 'refreshing',
           last_error_code = null,
           updated_at = now()
     where singleton;
    v_refresh := true;
  end if;

  return jsonb_build_object(
    'feedEnabled',v_feed_enabled,
    'providerEnabled',v_provider_enabled,
    'today',v_today,
    'refresh',v_refresh,
    'feed',v_payload
  );
end
$$;

create function public.kd_entdecken_daily_save(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_today date := (now() at time zone 'Europe/Vienna')::date;
  v_valid_until date;
  v_count integer;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) is distinct from 7::bigint
     or p_payload->>'format' is distinct from '3'
     or p_payload->>'feedId' is distinct from 'websearch:daily-tips-at'
     or p_payload->>'region' is distinct from 'AT'
     or p_payload->>'sourceId' is distinct from 'websearch:daily-tips'
     or p_payload->>'refreshedOn' is distinct from v_today::text
     or jsonb_typeof(p_payload->'items') is distinct from 'array' then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;
  begin
    v_valid_until := (p_payload->>'validUntil')::date;
    v_count := jsonb_array_length(p_payload->'items');
  exception when others then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end;
  if v_valid_until is distinct from v_today + 6 or v_count < 1 or v_count > 20 then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;

  update public.kd_entdecken_daily_feed
     set payload = p_payload,
         refreshed_on = v_today,
         valid_until = v_valid_until,
         status = 'ready',
         last_error_code = null,
         updated_at = now()
   where singleton
     and status = 'refreshing'
     and last_attempt_on = v_today
     and provider_operation_id is not null;
  if not found then return jsonb_build_object('ok',false,'code','state_invalid'); end if;
  return jsonb_build_object('ok',true,'status','saved');
end
$$;

create function public.kd_entdecken_daily_fail(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_safe text;
  v_today date := (now() at time zone 'Europe/Vienna')::date;
begin
  v_safe := case when p_code in (
    'provider_error','invalid_response','storage_error','source_registry_unavailable'
  ) then p_code else 'provider_error' end;
  update public.kd_entdecken_daily_feed
     set status = 'error', last_error_code = v_safe, updated_at = now()
   where singleton and last_attempt_on = v_today;
  return jsonb_build_object('ok',found,'status','recorded');
end
$$;

-- Ein zweites atomisches Schloss liegt unmittelbar vor dem Anbieterrequest.
-- Dieselbe Tagesoperation kann auch service-role-intern nicht doppelt
-- reserviert werden. Quellen muessen vollstaendig freigegeben sein.
create function public.kd_entdecken_daily_auftrag_starten(
  p_operation_id uuid,
  p_reservierung numeric,
  p_search_requests integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_today date := (now() at time zone 'Europe/Vienna')::date;
  v_feed_enabled boolean;
  v_provider_enabled boolean;
  v_owner_pilot_enabled boolean;
  v_public_enabled boolean;
  v_commercial_enabled boolean;
  v_provider jsonb;
  v_fee numeric;
  v_task_cap numeric;
  v_source_count integer;
begin
  if p_operation_id is null or p_search_requests is distinct from 1
     or p_reservierung is null
     or p_reservierung::text !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok',false,'code','server','grund','entdecken-daily-request-invalid');
  end if;

  select owner_pilot_enabled, feed_enabled, provider_enabled, public_enabled, commercial_enabled
    into v_owner_pilot_enabled, v_feed_enabled, v_provider_enabled, v_public_enabled, v_commercial_enabled
    from public.kd_entdecken_daily_settings
   where singleton
   for key share;
  if not coalesce(v_owner_pilot_enabled,false)
     or not coalesce(v_feed_enabled,false) or not coalesce(v_provider_enabled,false)
     or coalesce(v_public_enabled,true) or coalesce(v_commercial_enabled,true) then
    return jsonb_build_object('ok',false,'code','disabled','grund','entdecken-daily-off');
  end if;

  perform 1 from public.kd_entdecken_daily_feed
   where singleton
   for update;
  if not exists (
    select 1 from public.kd_entdecken_daily_feed
     where singleton and status = 'refreshing' and last_attempt_on = v_today
       and provider_operation_id is null
  ) then
    return jsonb_build_object('ok',false,'code','limit','grund','entdecken-daily-already-attempted');
  end if;

  select count(*) into v_source_count
    from public.kd_entdecken_sources
   where active and rights_status = 'approved' and attribution_approved
     and source_class = 'editorial' and terms_checked_on is not null
     and terms_url ~ '^https://';
  if v_source_count is distinct from 2
     or v_source_count is distinct from (select count(*) from public.kd_entdecken_sources where active) then
    return jsonb_build_object('ok',false,'code','disabled','grund','entdecken-daily-sources-unavailable');
  end if;

  v_provider := public.kd_private_provider_allowed('anthropic');
  if v_provider is null or v_provider->>'code' is distinct from 'PROVIDER_ALLOWED'
     or (v_provider->>'ok')::boolean is distinct from true then
    return jsonb_build_object('ok',false,'code','disabled','grund','provider-off');
  end if;

  select (wert #>> '{}')::numeric into v_fee
    from public.kd_ai_limits
   where schluessel = 'websearch_usd_cent_pro_request'
     and jsonb_typeof(wert) = 'number';
  select (wert #>> '{entdecken-daily}')::numeric into v_task_cap
    from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent'
     and jsonb_typeof(wert) = 'object'
     and jsonb_typeof(wert #> '{entdecken-daily}') = 'number';
  if v_fee is distinct from 1 or v_task_cap is distinct from 5
     or p_reservierung < v_fee or p_reservierung > v_task_cap then
    return jsonb_build_object('ok',false,'code','server','grund','entdecken-daily-cost-config-invalid');
  end if;

  update public.kd_entdecken_daily_feed
     set provider_operation_id = p_operation_id, updated_at = now()
   where singleton and status = 'refreshing' and last_attempt_on = v_today
     and provider_operation_id is null;
  if not found then
    return jsonb_build_object('ok',false,'code','limit','grund','entdecken-daily-already-attempted');
  end if;

  return public.kd_ai_auftrag_starten(
    null,
    'entdecken-daily',
    p_operation_id,
    'klein',
    'entdecken-daily-v1',
    null,
    p_reservierung
  );
end
$$;

revoke all on function public.kd_entdecken_daily_claim() from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_save(jsonb) from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_fail(text) from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer) from public, anon, authenticated;
grant execute on function public.kd_entdecken_daily_claim() to service_role;
grant execute on function public.kd_entdecken_daily_save(jsonb) to service_role;
grant execute on function public.kd_entdecken_daily_fail(text) to service_role;
grant execute on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer) to service_role;

comment on function public.kd_entdecken_daily_claim() is
  'Liefert einen noch gueltigen globalen Feed und beansprucht hoechstens einen Refresh je Wien-Kalendertag; nur service_role.';
comment on function public.kd_entdecken_daily_auftrag_starten(uuid,numeric,integer) is
  'Reserviert den einen taeglichen globalen Websearch nach Quellen-, Provider- und allgemeinem KI-Kostenzaun; kein Nutzerpayload, nur service_role.';

-- Aktivierung erst am Ende derselben atomaren Erstanlage. Zu diesem Zeitpunkt
-- muss die neue Function bereits mit serverseitigem Own-Row-Owner-Gate deployed
-- sein. Public/kommerziell bleiben durch CHECK und Readback unveraenderbar aus.
update public.kd_entdecken_daily_settings
   set owner_pilot_enabled = true,
       feed_enabled = true,
       provider_enabled = true,
       updated_at = now()
 where singleton
   and not public_enabled
   and not commercial_enabled;
do $$
begin
  if not exists (
    select 1 from public.kd_entdecken_daily_settings
     where singleton and owner_pilot_enabled and feed_enabled and provider_enabled
       and not public_enabled and not commercial_enabled
  ) then
    raise exception 'Entdecken privater Owner-Pilot konnte nicht fail-closed aktiviert werden';
  end if;
end
$$;

commit;
