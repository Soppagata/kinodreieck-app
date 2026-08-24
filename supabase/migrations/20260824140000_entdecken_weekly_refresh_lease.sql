-- Kinodreieck · Entdecken-Wochenfeed · expliziter Refresh mit Recovery-Lease
-- =============================================================================
-- Additive Forward-Migration. Normale GET-/Health-/Browserreads sind ab jetzt
-- strikt read-only. Nur ein ausdruecklicher scheduled- oder owner-Refresh darf
-- claimen. Ein Fehler oder abgelaufener Worker darf nach 15 Minuten erneut
-- claimen; insgesamt bleiben hoechstens drei Versuche je ISO-Woche erlaubt.
-- Ein erfolgreicher Feed sperrt jeden weiteren Wochenrefresh. Der letzte gute
-- Payload und seine Kostenprovenienz bleiben bei Folgefehlern unveraendert.
-- =============================================================================

begin;

alter table public.kd_entdecken_daily_feed
  add column attempt_iso_week text,
  add column attempt_count integer not null default 0,
  add column ready_provider_operation_id uuid,
  add column ready_fence_token bigint;

alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_attempt_iso_week_check
  check (attempt_iso_week is null
    or attempt_iso_week ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$');
alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_attempt_count_check
  check ((attempt_iso_week is null and attempt_count = 0)
    or (attempt_iso_week is not null and attempt_count between 1 and 3));
alter table public.kd_entdecken_daily_feed
  add constraint kd_entdecken_weekly_ready_fence_check
  check (ready_fence_token is null or ready_fence_token > 0);

-- Bestehende Wochenversuche werden konservativ uebernommen. Eine bereits
-- verbrauchte Recovery zaehlt als zweiter Versuch, damit die Migration keinen
-- Request unsichtbar macht. Nur ein aktuell fertiger Feed besitzt sicher die
-- dazugehoerige alte Operation und kann deshalb rueckwirkend gebunden werden.
update public.kd_entdecken_daily_feed
   set attempt_iso_week = last_attempt_iso_week,
       attempt_count = case
         when last_attempt_iso_week is null then 0
         when recovery_attempted_iso_week = last_attempt_iso_week then 2
         else 1
       end,
       ready_provider_operation_id = case
         when status = 'ready' and payload is not null then provider_operation_id
         else null
       end,
       ready_fence_token = case
         when status = 'ready' and payload is not null then fence_token
         else null
       end
 where singleton;

-- Inhaltsarmer Readback fuer Browser, Health und Harness. Er sperrt keine
-- Zeile, veraendert keinen Claim und startet weder Setup noch Provider.
create function public.kd_entdecken_weekly_feed_status()
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
  v_feed_enabled boolean;
  v_provider_enabled boolean;
  v_public_enabled boolean;
  v_commercial_enabled boolean;
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_effective_feed_enabled boolean := false;
  v_payload jsonb;
  v_attempt_count integer := 0;
  v_readback jsonb := null;
  v_log_id bigint;
  v_cost numeric;
  v_log_count integer := 0;
  v_item_count integer := 0;
  v_evidence_count integer := 0;
  v_source_count integer := 0;
  v_approved_source_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object(
      'feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode','read','claimStatus','disabled','attemptCount',0,
      'maxAttempts',3,'feedReadback',null
    );
  end if;

  select feed_enabled, provider_enabled, public_enabled, commercial_enabled
    into v_feed_enabled, v_provider_enabled, v_public_enabled, v_commercial_enabled
    from public.kd_entdecken_daily_settings
   where singleton;
  select * into v_feed
    from public.kd_entdecken_daily_feed
   where singleton;
  if not found then
    return jsonb_build_object(
      'feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode','read','claimStatus','disabled','attemptCount',0,
      'maxAttempts',3,'feedReadback',null
    );
  end if;

  v_effective_feed_enabled := coalesce(v_feed_enabled,false)
    and coalesce(v_public_enabled,false) and not coalesce(v_commercial_enabled,true);
  v_payload := case when v_effective_feed_enabled then v_feed.payload else null end;
  v_attempt_count := case when v_feed.attempt_iso_week = v_iso_week
    then v_feed.attempt_count else 0 end;

  if v_payload is not null
     and jsonb_typeof(v_payload->'items') = 'array'
     and v_feed.ready_provider_operation_id is not null
     and v_feed.ready_fence_token is not null then
    select count(*), min(id), min(kosten_usd_cent)
      into v_log_count, v_log_id, v_cost
      from public.kd_ai_log
     where vorgang_id = v_feed.ready_provider_operation_id
       and task = 'entdecken-daily'
       and status = 'fertig'
       and modell is not null
       and input_tokens is not null and output_tokens is not null
       and kosten_usd_cent > 0
       and beendet_at is not null
       and fehlerklasse is null;
    if v_log_count = 1 then
      begin
        v_item_count := jsonb_array_length(v_payload->'items');
        select count(*) into v_evidence_count
          from jsonb_array_elements(v_payload->'items') as item(value)
          cross join lateral jsonb_array_elements(item.value->'evidence') as evidence(value);
        select count(distinct source.source_id) into v_source_count
          from jsonb_array_elements(v_payload->'items') as item(value)
          cross join lateral jsonb_array_elements(item.value->'evidence') as evidence(value)
          join public.kd_entdecken_sources source
            on evidence.value->>'domain' = source.domain
            or (source.subdomains_allowed
              and evidence.value->>'domain' like '%.' || source.domain)
         where source.active and source.rights_status = 'approved'
           and source.attribution_approved and source.source_class = 'editorial';
        select count(*) into v_approved_source_count
          from public.kd_entdecken_sources
         where active and rights_status = 'approved'
           and attribution_approved and source_class = 'editorial';
        if v_item_count between 5 and 7
           and v_evidence_count >= v_item_count
           and v_source_count > 0
           and v_approved_source_count >= v_source_count then
          v_readback := jsonb_build_object(
            'schemaVersion','entdecken-weekly-readback-v1',
            'feedId',v_payload->>'feedId',
            'region',v_payload->>'region',
            'isoWeek',v_payload->>'isoWeek',
            'refreshedOn',v_payload->>'refreshedOn',
            'validUntil',v_payload->>'validUntil',
            'itemCount',v_item_count,
            'evidenceCount',v_evidence_count,
            'sourceCount',v_source_count,
            'approvedSourceCount',v_approved_source_count,
            'providerLogId',v_log_id,
            'costUsdCent',v_cost
          );
        end if;
      exception when others then
        v_readback := null;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'feedEnabled',v_effective_feed_enabled,
    'providerEnabled',coalesce(v_provider_enabled,false),
    'today',v_today,
    'isoWeek',v_iso_week,
    'refresh',false,
    'fenceToken',null,
    'feed',v_payload,
    'requestMode','read',
    'claimStatus','read_only',
    'attemptCount',v_attempt_count,
    'maxAttempts',3,
    'feedReadback',v_readback
  );
end
$$;

-- Einziger neuer Claim-Einstieg. Durch den Zeilenlock gewinnt bei Parallelitaet
-- exakt ein Aufruf. Fehler und abgelaufene Leases duerfen spaeter, aber nie im
-- selben Functionlauf, bis zum festen Wochenmaximum erneut beansprucht werden.
create function public.kd_entdecken_weekly_refresh_claim(
  p_source text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_feed_enabled boolean;
  v_provider_enabled boolean;
  v_public_enabled boolean;
  v_commercial_enabled boolean;
  v_feed public.kd_entdecken_daily_feed%rowtype;
  v_effective_feed_enabled boolean := false;
  v_payload jsonb;
  v_attempt_count integer := 0;
  v_refresh boolean := false;
  v_claim_status text := 'held';
  v_fence_token bigint;
  v_next_attempt integer;
  v_first_attempt boolean := false;
  v_failed_retry boolean := false;
  v_abandoned_retry boolean := false;
begin
  if auth.role() is distinct from 'service_role'
     or p_source not in ('scheduled','owner') then
    return jsonb_build_object(
      'feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',coalesce(p_source,'invalid'),'claimStatus','disabled',
      'attemptCount',0,'maxAttempts',3,'feedReadback',null
    );
  end if;

  select feed_enabled, provider_enabled, public_enabled, commercial_enabled
    into v_feed_enabled, v_provider_enabled, v_public_enabled, v_commercial_enabled
    from public.kd_entdecken_daily_settings
   where singleton
   for update;
  if not found then
    return jsonb_build_object(
      'feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',p_source,'claimStatus','disabled','attemptCount',0,
      'maxAttempts',3,'feedReadback',null
    );
  end if;

  select * into v_feed
    from public.kd_entdecken_daily_feed
   where singleton
   for update;
  if not found then
    return jsonb_build_object(
      'feedEnabled',false,'providerEnabled',false,'today',v_today,
      'isoWeek',v_iso_week,'refresh',false,'fenceToken',null,'feed',null,
      'requestMode',p_source,'claimStatus','disabled','attemptCount',0,
      'maxAttempts',3,'feedReadback',null
    );
  end if;

  v_effective_feed_enabled := coalesce(v_feed_enabled,false)
    and coalesce(v_public_enabled,false) and not coalesce(v_commercial_enabled,true);
  v_payload := case when v_effective_feed_enabled then v_feed.payload else null end;
  v_attempt_count := case when v_feed.attempt_iso_week = v_iso_week
    then v_feed.attempt_count else 0 end;
  v_first_attempt := v_feed.last_attempt_iso_week is distinct from v_iso_week
    or v_feed.attempt_iso_week is distinct from v_iso_week;
  v_failed_retry := v_feed.status = 'error'
    and v_feed.last_attempt_iso_week = v_iso_week
    and v_feed.last_failure_at is not null
    and v_feed.last_failure_at <= v_now - interval '15 minutes'
    and (v_feed.lease_expires_at is null or v_feed.lease_expires_at <= v_now);
  v_abandoned_retry := v_feed.status = 'refreshing'
    and v_feed.last_attempt_iso_week = v_iso_week
    and v_feed.lease_expires_at is not null
    and v_feed.lease_expires_at <= v_now;

  if not v_effective_feed_enabled or not coalesce(v_provider_enabled,false) then
    v_claim_status := 'disabled';
  elsif v_feed.refreshed_iso_week = v_iso_week then
    v_claim_status := 'already_fresh';
  elsif v_feed.status = 'refreshing' and v_feed.lease_expires_at > v_now then
    v_claim_status := 'in_progress';
  elsif v_attempt_count >= 3 then
    v_claim_status := 'exhausted';
  elsif v_first_attempt or v_failed_retry or v_abandoned_retry then
    update public.kd_entdecken_daily_feed
       set last_attempt_on = v_today,
           last_attempt_iso_week = v_iso_week,
           attempt_iso_week = v_iso_week,
           attempt_count = case when attempt_iso_week = v_iso_week
             then attempt_count + 1 else 1 end,
           provider_operation_id = null,
           fence_token = fence_token + 1,
           lease_expires_at = v_now + interval '180 seconds',
           status = 'refreshing',
           last_error_code = null,
           recovery_authorized_iso_week = null,
           last_failure_at = null,
           updated_at = v_now
     where singleton
     returning fence_token, attempt_count into v_fence_token, v_next_attempt;
    v_refresh := found;
    v_claim_status := case when v_refresh then 'claimed' else 'held' end;
    if v_refresh then v_attempt_count := v_next_attempt; end if;
  elsif v_feed.status = 'error' then
    v_claim_status := 'cooldown';
  else
    v_claim_status := 'held';
  end if;

  return jsonb_build_object(
    'feedEnabled',v_effective_feed_enabled,
    'providerEnabled',coalesce(v_provider_enabled,false),
    'today',v_today,
    'isoWeek',v_iso_week,
    'refresh',v_refresh,
    'fenceToken',case when v_refresh then v_fence_token else null end,
    'feed',v_payload,
    'requestMode',p_source,
    'claimStatus',v_claim_status,
    'attemptCount',v_attempt_count,
    'maxAttempts',3,
    'feedReadback',null
  );
end
$$;

-- Kompatibilitaet: alte GET-Functions koennen nach dieser Migration keinen
-- Claim mehr konsumieren. Die alte Recovery-RPC delegiert auf denselben neuen
-- Zaun und besitzt kein zusaetzliches Wochenkontingent.
create or replace function public.kd_entdecken_daily_claim()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.kd_entdecken_weekly_feed_status();
$$;

create or replace function public.kd_entdecken_daily_recovery_claim()
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select public.kd_entdecken_weekly_refresh_claim('owner');
$$;

-- Ein Save bindet die erfolgreiche Operation separat vom naechsten Versuch.
-- Dadurch bleibt ein alter guter Feed samt Readback auch dann beweisbar, wenn
-- ein spaeterer Wochenclaim fehlschlaegt.
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
  v_iso_week text := to_char(v_today, 'IYYY-"W"IW');
  v_week_end date := v_today + (7 - extract(isodow from v_today)::integer);
  v_count integer;
  v_operation_id uuid;
  v_log_count integer;
begin
  if p_fence_token is null or p_fence_token <= 0
     or jsonb_typeof(p_payload) is distinct from 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(p_payload)) is distinct from 8::bigint
     or p_payload->>'format' is distinct from '4'
     or p_payload->>'feedId' is distinct from 'websearch:weekly-positive-at'
     or p_payload->>'region' is distinct from 'AT'
     or p_payload->>'sourceId' is distinct from 'websearch:weekly-positive'
     or p_payload->>'isoWeek' is distinct from v_iso_week
     or p_payload->>'refreshedOn' is distinct from v_today::text
     or p_payload->>'validUntil' is distinct from v_week_end::text
     or jsonb_typeof(p_payload->'items') is distinct from 'array' then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;
  begin
    v_count := jsonb_array_length(p_payload->'items');
  exception when others then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end;
  if v_count < 5 or v_count > 7 then
    return jsonb_build_object('ok',false,'code','invalid_response');
  end if;

  select provider_operation_id into v_operation_id
    from public.kd_entdecken_daily_feed
   where singleton
     and status = 'refreshing'
     and last_attempt_iso_week = v_iso_week
     and fence_token = p_fence_token
     and provider_operation_id is not null
     and lease_expires_at >= v_now
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','state_invalid');
  end if;

  select count(*) into v_log_count
    from public.kd_ai_log
   where vorgang_id = v_operation_id
     and task = 'entdecken-daily'
     and status = 'fertig'
     and modell is not null
     and input_tokens is not null and output_tokens is not null
     and kosten_usd_cent > 0
     and beendet_at is not null
     and fehlerklasse is null;
  if v_log_count is distinct from 1 then
    return jsonb_build_object('ok',false,'code','provider_log_unverified');
  end if;

  update public.kd_entdecken_daily_feed
     set payload = p_payload,
         refreshed_on = v_today,
         refreshed_iso_week = v_iso_week,
         valid_until = v_week_end,
         status = 'ready',
         last_error_code = null,
         lease_expires_at = null,
         recovery_authorized_iso_week = null,
         last_failure_at = null,
         ready_provider_operation_id = v_operation_id,
         ready_fence_token = p_fence_token,
         updated_at = v_now
   where singleton
     and status = 'refreshing'
     and last_attempt_iso_week = v_iso_week
     and fence_token = p_fence_token
     and provider_operation_id = v_operation_id
     and lease_expires_at >= v_now;
  if not found then return jsonb_build_object('ok',false,'code','state_invalid'); end if;
  return jsonb_build_object('ok',true,'status','saved');
end
$$;

revoke all on function public.kd_entdecken_weekly_feed_status()
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_weekly_refresh_claim(text)
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_claim()
  from public, anon, authenticated;
revoke all on function public.kd_entdecken_daily_recovery_claim()
  from public, anon, authenticated;
grant execute on function public.kd_entdecken_weekly_feed_status()
  to service_role;
grant execute on function public.kd_entdecken_weekly_refresh_claim(text)
  to service_role;
grant execute on function public.kd_entdecken_daily_claim()
  to service_role;
grant execute on function public.kd_entdecken_daily_recovery_claim()
  to service_role;

comment on function public.kd_entdecken_weekly_feed_status() is
  'Read-only Wochenfeed-/Claimstatus samt inhaltsarmem Persistenzreadback; konsumiert nie einen Claim.';
comment on function public.kd_entdecken_weekly_refresh_claim(text) is
  'Expliziter scheduled-/owner-Claim: maximal drei Versuche, maximal ein erfolgreicher Feed je ISO-Woche, Fencing-Lease 180 Sekunden.';
comment on function public.kd_entdecken_daily_claim() is
  'Kompatibler read-only Alias; normale GET-/Health-Aufrufe starten niemals Providerarbeit.';
comment on function public.kd_entdecken_daily_recovery_claim() is
  'Kompatibler Owner-Alias auf denselben begrenzten Wochenclaim; kein separates Recoverykontingent.';

commit;
