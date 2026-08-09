-- Kinodreieck · Private-Pilot Retention-Fortschreibung
-- Vorwaertskompatible Korrektur: zwecklose Radarziele werden sofort
-- deaktiviert und nach 30 Tagen graphvertraeglich, einzeln isoliert gepurgt.
-- Purge und Scheduler bleiben unveraendert AUS.
begin;

create or replace function public.kd_private_refresh_target_orphan()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_target_id uuid;
  v_has_active_subscription boolean;
begin
  v_target_id := case when tg_op = 'DELETE' then old.target_id else new.target_id end;
  select exists (
    select 1
      from public.kd_radar_subscriptions s
     where s.target_id = v_target_id
       and s.subscription_status = 'active'
  ) into v_has_active_subscription;

  update public.kd_radar_targets t
     set target_status = case when v_has_active_subscription then 'active' else 'retired' end,
         orphaned_at = case
           when v_has_active_subscription then null
           else coalesce(t.orphaned_at, now())
         end
   where t.target_id = v_target_id;

  if not v_has_active_subscription then
    update public.kd_radar_checks
       set active = false
     where target_id = v_target_id
       and active;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

-- Bestaetigte Evidenz bleibt gegen normale Loeschungen unveraenderlich. Nur
-- der service-only Retentionlauf darf sie zusammen mit einem seit 30 Tagen
-- zwecklosen Ziel graphvertraeglich entfernen.
create or replace function public.kd_guard_radar_evidence_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('postgres', 'service_role')
     and current_setting('kd.private_retention_purge', true) = '1' then
    return old;
  end if;
  if exists (
    select 1 from public.kd_radar_event_versions
     where event_version_id = old.event_version_id
       and verification_status in ('corroborated','confirmed')
  ) then
    raise exception 'radar_verified_evidence_delete_forbidden' using errcode = '55000';
  end if;
  return old;
end
$$;

create or replace function public.kd_private_retention_run(
  p_dry_run boolean default true,
  p_limit integer default 200
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_ops integer;
  v_share_ops integer;
  v_checks integer;
  v_ai integer;
  v_delete integer;
  v_targets integer;
  v_purged_targets integer := 0;
  v_failed_targets integer := 0;
  v_target_id uuid;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('kd_private_retention_run', 0)) then
    return jsonb_build_object('ok', false, 'code', 'LOCKED');
  end if;

  select least(count(*), v_limit)::integer into v_ops
    from public.kd_radar_operations
   where coalesce(expires_at, created_at + interval '30 days') <= now();
  select least(count(*), v_limit)::integer into v_share_ops
    from public.kd_radar_share_operations
   where coalesce(expires_at, created_at + interval '30 days') <= now();
  select least(count(*), v_limit)::integer into v_checks
    from public.kd_radar_checks
   where expires_at <= now();
  select least(count(*), v_limit)::integer into v_ai
    from public.kd_ai_log
   where gestartet_at <= now() - interval '90 days';
  select least(count(*), v_limit)::integer into v_delete
    from public.kd_private_delete_operations
   where expires_at <= now();
  select least(count(*), v_limit)::integer into v_targets
    from public.kd_radar_targets t
   where t.orphaned_at <= now() - interval '30 days'
     and not exists (
       select 1 from public.kd_radar_subscriptions s
        where s.target_id = t.target_id and s.subscription_status = 'active'
     );

  if not p_dry_run then
    if not exists (
      select 1 from public.kd_private_settings
       where singleton and purge_enabled
    ) then
      return jsonb_build_object('ok', false, 'code', 'PURGE_DISABLED', 'dryRun', false);
    end if;

    delete from public.kd_radar_operations
     where ctid in (
       select ctid from public.kd_radar_operations
        where coalesce(expires_at, created_at + interval '30 days') <= now()
        order by expires_at nulls first, created_at limit v_limit
     );
    delete from public.kd_radar_share_operations
     where ctid in (
       select ctid from public.kd_radar_share_operations
        where coalesce(expires_at, created_at + interval '30 days') <= now()
        order by expires_at nulls first, created_at limit v_limit
     );
    update public.kd_radar_checks newer
       set superseded_by = null
     where newer.superseded_by in (
       select expired.check_id from public.kd_radar_checks expired
        where expired.expires_at <= now()
        order by expired.expires_at limit v_limit
     );
    delete from public.kd_radar_checks
     where check_id in (
       select check_id from public.kd_radar_checks
        where expires_at <= now()
        order by expires_at limit v_limit
     );
    delete from public.kd_ai_log
     where ctid in (
       select ctid from public.kd_ai_log
        where gestartet_at <= now() - interval '90 days'
        order by gestartet_at limit v_limit
     );
    delete from public.kd_private_delete_operations
     where ctid in (
       select ctid from public.kd_private_delete_operations
        where expires_at <= now()
        order by expires_at limit v_limit
     );

    for v_target_id in
      select t.target_id
        from public.kd_radar_targets t
       where t.orphaned_at <= now() - interval '30 days'
         and not exists (
           select 1 from public.kd_radar_subscriptions s
            where s.target_id = t.target_id and s.subscription_status = 'active'
         )
       order by t.orphaned_at, t.target_id limit v_limit
    loop
      begin
        perform set_config('kd.private_retention_purge', '1', true);
        delete from public.kd_radar_reviews r
         using public.kd_radar_event_versions v, public.kd_radar_events e
         where r.event_version_id = v.event_version_id
           and v.event_id = e.event_id
           and e.target_id = v_target_id;
        delete from public.kd_radar_targets where target_id = v_target_id;
        perform set_config('kd.private_retention_purge', '0', true);
        v_purged_targets := v_purged_targets + 1;
      exception when others then
        perform set_config('kd.private_retention_purge', '0', true);
        v_failed_targets := v_failed_targets + 1;
      end;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'dryRun', p_dry_run,
    'due', jsonb_build_object(
      'operations', v_ops,
      'shareOperations', v_share_ops,
      'checks', v_checks,
      'aiLogs', v_ai,
      'deleteLedger', v_delete,
      'orphanTargets', v_targets
    ),
    'result', jsonb_build_object(
      'purgedTargets', v_purged_targets,
      'failedTargets', v_failed_targets
    )
  );
end
$$;

revoke all on function public.kd_private_refresh_target_orphan(),
  public.kd_guard_radar_evidence_delete(),
  public.kd_private_retention_run(boolean, integer)
  from public, anon, authenticated;
grant execute on function public.kd_private_refresh_target_orphan(),
  public.kd_guard_radar_evidence_delete(),
  public.kd_private_retention_run(boolean, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
