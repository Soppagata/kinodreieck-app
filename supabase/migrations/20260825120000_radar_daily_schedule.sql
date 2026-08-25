-- Kinodreieck · Radar · genau ein taeglicher Versuch je Konto/Ziel
-- =============================================================================
-- Additive Forward-Migration. Der GitHub-Zeitplan lebt bewusst ausserhalb der
-- Datenbank; diese Migration stellt nur den atomaren Europe/Vienna-Tagesclaim,
-- seine Fencing-Lease und den service-role-only Abschlussvertrag bereit.
-- Bereits der Claim verbraucht den Versuch. Fehler, Provider-Timeouts und
-- abgebrochene Worker duerfen dasselbe Konto/Ziel am selben Tag nie erneut
-- claimen. Alle vorhandenen KI-Kostenzaeune bleiben im bestehenden
-- kd_radar_websearch_auftrag_starten-/kd_ai_auftrag_starten-Pfad.
-- =============================================================================

begin;

-- Der Scheduler darf nur auf der vollstaendig vorhandenen Radar-Basis
-- aufsetzen. Unvollstaendige oder unerwartet bereits aktivierte Baselines
-- werden nicht still repariert.
do $$
declare
  v_radar_aktiv boolean;
  v_provider_aktiv boolean;
  v_scheduler_aktiv boolean;
begin
  if to_regclass('public.kd_radar_settings') is null
     or to_regclass('public.kd_radar_subscriptions') is null
     or to_regclass('public.kd_radar_targets') is null
     or to_regclass('public.kd_radar_capabilities') is null
     or to_regclass('public.kd_account_access') is null
     or to_regprocedure('public.kd_radar_websearch_context(uuid,text)') is null
     or to_regprocedure('public.kd_radar_websearch_prepare_text(uuid,text,text,uuid)') is null
     or to_regprocedure('public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer)') is null
     or to_regprocedure('public.kd_radar_person_target_metadata_valid(text,text,jsonb)') is null
     or to_regprocedure('public.kd_radar_title_group_metadata_valid(text,text,jsonb)') is null
     or to_regprocedure('public.kd_radar_text_target_key(text)') is null then
    raise exception 'Radar daily scheduler Baseline fehlt';
  end if;

  select radar_aktiv, radar_provider_aktiv, radar_scheduler_aktiv
    into v_radar_aktiv, v_provider_aktiv, v_scheduler_aktiv
    from public.kd_radar_settings
   where singleton
   for update;
  if not found
     or v_radar_aktiv is distinct from true
     or v_provider_aktiv is distinct from true
     or v_scheduler_aktiv is distinct from false then
    raise exception 'Radar daily scheduler Settings drift';
  end if;
end
$$;

create table public.kd_radar_daily_runs (
  account_id       uuid        not null references auth.users(id) on delete cascade,
  target_id        uuid        not null references public.kd_radar_targets(target_id) on delete cascade,
  vienna_day       date        not null,
  fence_token      uuid        not null default gen_random_uuid(),
  worker_status    text        not null default 'leased'
                               check (worker_status in ('leased','completed','failed')),
  safe_status      text        not null default 'attempt_consumed'
                               check (safe_status in (
                                 'attempt_consumed','confirmed','no_change',
                                 'insufficient_evidence','provider_error',
                                 'storage_error','forbidden','unavailable','timeout'
                               )),
  claimed_at       timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz not null,
  terminal_at      timestamptz,
  updated_at       timestamptz not null default clock_timestamp(),
  constraint kd_radar_daily_runs_pkey
    primary key (account_id, target_id, vienna_day),
  constraint kd_radar_daily_runs_fence_unique unique (fence_token),
  constraint kd_radar_daily_runs_lease_check
    check (lease_expires_at > claimed_at),
  constraint kd_radar_daily_runs_terminal_check check (
    (worker_status = 'leased'
      and safe_status = 'attempt_consumed'
      and terminal_at is null)
    or
    (worker_status in ('completed','failed')
      and safe_status <> 'attempt_consumed'
      and terminal_at is not null)
  )
);

create index kd_radar_daily_runs_expired_lease
  on public.kd_radar_daily_runs (lease_expires_at)
  where worker_status = 'leased';

alter table public.kd_radar_daily_runs enable row level security;
revoke all on table public.kd_radar_daily_runs from public, anon, authenticated;
grant all on table public.kd_radar_daily_runs to service_role;

comment on table public.kd_radar_daily_runs is
  'Service-only Tageszaun fuer genau einen Radar-Anbieterversuch je aktivem Konto/Ziel und Europe/Vienna-Tag; Claim ist auch bei Fehler oder Timeout endgueltig.';

create function public.kd_radar_daily_claim()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now at time zone 'Europe/Vienna')::date;
  v_account_id uuid;
  v_target_id uuid;
  v_target_key text;
  v_target_type text;
  v_target_text text;
  v_fence_token uuid := gen_random_uuid();
  v_radar_aktiv boolean;
  v_provider_aktiv boolean;
  v_scheduler_aktiv boolean;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('claim',false,'status','forbidden','viennaDay',v_today);
  end if;

  select radar_aktiv, radar_provider_aktiv, radar_scheduler_aktiv
    into v_radar_aktiv, v_provider_aktiv, v_scheduler_aktiv
    from public.kd_radar_settings
   where singleton
   for key share;
  if not found
     or v_radar_aktiv is distinct from true
     or v_provider_aktiv is distinct from true
     or v_scheduler_aktiv is distinct from true then
    return jsonb_build_object('claim',false,'status','disabled','viennaDay',v_today);
  end if;

  -- Abgelaufene Worker bleiben durch ihren Primaerschluessel fuer den Tag
  -- gesperrt; nur ihr sichere Abschlussstatus wird nachgezogen.
  update public.kd_radar_daily_runs
     set worker_status = 'failed', safe_status = 'timeout',
         terminal_at = v_now, updated_at = v_now
   where worker_status = 'leased' and lease_expires_at < v_now;

  select subscription.account_id, subscription.target_id,
         target.target_key, target.target_type,
         case when target.target_type = 'text' then target.canonical_title else null end
    into v_account_id, v_target_id, v_target_key, v_target_type, v_target_text
    from public.kd_radar_subscriptions subscription
    join public.kd_account_access access
      on access.account_id = subscription.account_id
    join public.kd_radar_capabilities capability
      on capability.account_id = subscription.account_id
    join public.kd_radar_targets target
      on target.target_id = subscription.target_id
   where access.active and access.personal_ai
     and capability.radar_pilot and capability.radar_review
     and subscription.subscription_status = 'active'
     and subscription.region = 'AT'
     and target.target_status = 'active'
     and target.target_key !~* '^(fixture|synthetic):'
     and (
       (target.target_type in ('work','series')
        and not (target.target_type = 'series' and subscription.scope = 'cinema')
        and subscription.person_external_id is null
        and subscription.person_role is null)
       or
       (target.target_type = 'person' and subscription.scope = 'all'
        and subscription.person_external_id = target.external_ids ->> 'personExternalId'
        and subscription.person_role = target.external_ids ->> 'personRole'
        and target.target_key = 'person:' || subscription.person_external_id || ':' || subscription.person_role
        and public.kd_radar_person_target_metadata_valid(
          target.target_key, target.canonical_title, target.external_ids
        ))
       or
       (target.target_type = 'franchise' and subscription.scope = 'all'
        and subscription.person_external_id is null
        and subscription.person_role is null
        and target.target_key ~ '^title-group:v1:'
        and public.kd_radar_title_group_metadata_valid(
          target.target_key, target.canonical_title, target.external_ids -> 'titleGroup'
        ))
       or
       (target.target_type = 'text' and subscription.scope = 'all'
        and subscription.person_external_id is null
        and subscription.person_role is null
        and target.target_key = public.kd_radar_text_target_key(target.canonical_title)
        and target.external_ids ->> 'targetText' = target.canonical_title
        and target.external_ids ->> 'contractVersion' = 'radar-text-v1'
        and jsonb_typeof(target.external_ids -> 'resolvedTargets') = 'array')
     )
     and not exists (
       select 1
         from public.kd_radar_daily_runs run
        where run.account_id = subscription.account_id
          and run.target_id = subscription.target_id
          and run.vienna_day = v_today
     )
   order by coalesce((
     select max(previous.vienna_day)
       from public.kd_radar_daily_runs previous
      where previous.account_id = subscription.account_id
        and previous.target_id = subscription.target_id
   ), date '1970-01-01'), subscription.updated_at,
      subscription.account_id, subscription.target_id
   for update of subscription skip locked
   limit 1;

  if not found then
    return jsonb_build_object('claim',false,'status','idle','viennaDay',v_today);
  end if;

  insert into public.kd_radar_daily_runs (
    account_id, target_id, vienna_day, fence_token,
    worker_status, safe_status, claimed_at, lease_expires_at, updated_at
  ) values (
    v_account_id, v_target_id, v_today, v_fence_token,
    'leased', 'attempt_consumed', v_now, v_now + interval '180 seconds', v_now
  ) on conflict (account_id, target_id, vienna_day) do nothing;
  if not found then
    return jsonb_build_object('claim',false,'status','idle','viennaDay',v_today);
  end if;

  return jsonb_build_object(
    'claim',true,
    'status','claimed',
    'accountId',v_account_id,
    'targetRowId',v_target_id,
    'targetId',v_target_key,
    'targetType',v_target_type,
    'targetText',v_target_text,
    'viennaDay',v_today,
    'fenceToken',v_fence_token
  );
end
$$;

create function public.kd_radar_daily_assert_lease(
  p_account_id uuid,
  p_target_id uuid,
  p_vienna_day date,
  p_fence_token uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  if auth.role() is distinct from 'service_role'
     or p_account_id is null or p_target_id is null
     or p_vienna_day is null or p_fence_token is null
     or not exists (
       select 1 from public.kd_radar_settings
        where singleton and radar_aktiv and radar_provider_aktiv and radar_scheduler_aktiv
     ) then
    return jsonb_build_object('ok',false,'status','forbidden');
  end if;
  if exists (
    select 1 from public.kd_radar_daily_runs
     where account_id = p_account_id and target_id = p_target_id
       and vienna_day = p_vienna_day and fence_token = p_fence_token
       and worker_status = 'leased' and lease_expires_at >= v_now
  ) then
    return jsonb_build_object('ok',true,'status','leased');
  end if;
  return jsonb_build_object('ok',false,'status','expired');
end
$$;

create function public.kd_radar_daily_finish(
  p_account_id uuid,
  p_target_id uuid,
  p_vienna_day date,
  p_fence_token uuid,
  p_safe_status text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_worker_status text;
begin
  if auth.role() is distinct from 'service_role'
     or p_account_id is null or p_target_id is null
     or p_vienna_day is null or p_fence_token is null
     or p_safe_status is null or p_safe_status not in (
       'confirmed','no_change','insufficient_evidence','provider_error',
       'storage_error','forbidden','unavailable'
     ) then
    return jsonb_build_object('ok',false,'status','forbidden');
  end if;

  update public.kd_radar_daily_runs
     set worker_status = 'failed', safe_status = 'timeout',
         terminal_at = v_now, updated_at = v_now
   where account_id = p_account_id and target_id = p_target_id
     and vienna_day = p_vienna_day and fence_token = p_fence_token
     and worker_status = 'leased' and lease_expires_at < v_now;
  if found then
    return jsonb_build_object('ok',true,'status','failed');
  end if;

  v_worker_status := case when p_safe_status in (
    'confirmed','no_change','insufficient_evidence'
  ) then 'completed' else 'failed' end;
  update public.kd_radar_daily_runs
     set worker_status = v_worker_status, safe_status = p_safe_status,
         terminal_at = v_now, updated_at = v_now
   where account_id = p_account_id and target_id = p_target_id
     and vienna_day = p_vienna_day and fence_token = p_fence_token
     and worker_status = 'leased' and lease_expires_at >= v_now;
  if not found then
    return jsonb_build_object('ok',false,'status','state_invalid');
  end if;
  return jsonb_build_object('ok',true,'status',v_worker_status);
end
$$;

revoke all on function public.kd_radar_daily_claim()
  from public, anon, authenticated;
revoke all on function public.kd_radar_daily_assert_lease(uuid,uuid,date,uuid)
  from public, anon, authenticated;
revoke all on function public.kd_radar_daily_finish(uuid,uuid,date,uuid,text)
  from public, anon, authenticated;
grant execute on function public.kd_radar_daily_claim() to service_role;
grant execute on function public.kd_radar_daily_assert_lease(uuid,uuid,date,uuid)
  to service_role;
grant execute on function public.kd_radar_daily_finish(uuid,uuid,date,uuid,text)
  to service_role;

comment on function public.kd_radar_daily_claim() is
  'Claimt atomar den naechsten aktiven capability-berechtigten AT-Konto/Ziel-Pfad fuer genau einen Europe/Vienna-Tag; kein Tagesretry.';
comment on function public.kd_radar_daily_assert_lease(uuid,uuid,date,uuid) is
  'Fencing-Wache unmittelbar vor Kostenreservierung und Eventwrite des taeglichen Radar-Workers.';
comment on function public.kd_radar_daily_finish(uuid,uuid,date,uuid,text) is
  'Schliesst den Tagesversuch nur mit einem kleinen sicheren Ergebniscode ab; abgelaufene Leases werden timeout.';

do $$
begin
  update public.kd_radar_settings
     set radar_scheduler_aktiv = true, updated_at = clock_timestamp()
   where singleton
     and radar_aktiv is true
     and radar_provider_aktiv is true
     and radar_scheduler_aktiv is false;
  if not found then
    raise exception 'Radar daily scheduler Aktivierung drift';
  end if;
end
$$;

commit;
