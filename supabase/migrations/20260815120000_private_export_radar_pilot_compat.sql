-- Kinodreieck · E15-Export / E16-Max-Pilot Kompatibilitaet
-- Rein additive, fail-closed Forward-Migration. Alle Schalter bleiben AUS.
begin;

alter table public.kd_private_settings
  add column export_enabled boolean not null default false;

-- Die Pilot-Import-Tabelle wurde vor dieser Retention-Erweiterung angelegt.
-- Nur ihre exakt erwartete, leere Erstfassung darf atomar fortgeschrieben
-- werden. Fehlende Tabelle, Schema-Drift oder Bestand brechen die Transaktion.
do $$
declare
  v_table regclass := to_regclass('public.kd_radar_pilot_import_operations');
  v_columns text[];
  v_constraints text[];
  v_row_count bigint;
  v_rls_enabled boolean;
begin
  if v_table is null then
    raise exception 'kd_radar_pilot_import_operations_missing'
      using errcode = '55000';
  end if;

  select array_agg(
           format(
             '%s:%s:%s:%s',
             c.column_name,
             c.udt_name,
             c.is_nullable,
             case
               when c.column_default is null then '-'
               when c.column_name = 'created_at'
                    and lower(c.column_default) = 'now()' then 'now'
               else 'unexpected-default'
             end
           ) order by c.ordinal_position
         )
    into v_columns
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'kd_radar_pilot_import_operations';

  if v_columns is distinct from array[
    'actor_id:uuid:NO:-',
    'operation_id:uuid:NO:-',
    'request_hash:text:NO:-',
    'result:jsonb:NO:-',
    'created_at:timestamptz:NO:now'
  ]::text[] then
    raise exception 'kd_radar_pilot_import_operations_schema_drift'
      using errcode = '55000';
  end if;

  select c.relrowsecurity
    into v_rls_enabled
    from pg_catalog.pg_class c
   where c.oid = v_table;
  if v_rls_enabled is distinct from true then
    raise exception 'kd_radar_pilot_import_operations_rls_drift'
      using errcode = '55000';
  end if;

  select array_agg(
           format(
             '%s:%s:%s:%s:%s:%s:%s',
             pc.conname,
             pc.contype,
             pc.condeferrable,
             pc.condeferred,
             pc.convalidated,
             pc.connoinherit,
             regexp_replace(
               replace(lower(pg_get_constraintdef(pc.oid, true)), '::text', ''),
               '[[:space:]]+',
               '',
               'g'
             )
           ) order by pc.conname
         )
    into v_constraints
    from pg_catalog.pg_constraint pc
   where pc.conrelid = v_table;

  if v_constraints is distinct from array[
    'kd_radar_pilot_import_operations_actor_id_fkey:f:false:false:true:true:foreignkey(actor_id)referencesauth.users(id)ondeletecascade',
    'kd_radar_pilot_import_operations_pkey:p:false:false:true:true:primarykey(actor_id,operation_id)',
    'kd_radar_pilot_import_operations_request_hash_check:c:false:false:true:false:check(request_hash~''^[a-f0-9]{32}$'')',
    'kd_radar_pilot_import_operations_result_check:c:false:false:true:false:check(jsonb_typeof(result)=''object'')'
  ]::text[] then
    raise exception 'kd_radar_pilot_import_operations_constraint_drift'
      using errcode = '55000';
  end if;

  execute 'select count(*) from public.kd_radar_pilot_import_operations'
    into v_row_count;
  if v_row_count <> 0 then
    raise exception 'kd_radar_pilot_import_operations_not_empty'
      using errcode = '55000';
  end if;
end
$$;

alter table public.kd_radar_pilot_import_operations
  add column terminal_at timestamptz,
  add column expires_at timestamptz;

create index kd_radar_pilot_import_operations_expires
  on public.kd_radar_pilot_import_operations (expires_at)
  where expires_at is not null;

create trigger kd_radar_pilot_import_operations_private_ttl
  before insert or update on public.kd_radar_pilot_import_operations
  for each row execute function public.kd_private_mark_operation_ttl();

insert into public.kd_private_delete_map (
  storage_class, account_column, action, reason
) values (
  'kd_radar_pilot_import_operations',
  'actor_id',
  'cascade',
  'private-pilot import idempotency results'
);

create or replace function public.kd_private_own_data(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text := encode(extensions.digest(convert_to(p_account_id::text, 'UTF8'), 'sha256'), 'hex');
  v_result jsonb;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'access', (select to_jsonb(a) - 'account_id' from public.kd_account_access a where a.account_id = p_account_id),
    'personal', coalesce((select jsonb_agg(to_jsonb(p) - 'account_id' order by p.key) from public.kd_personal p where p.account_id = p_account_id), '[]'::jsonb),
    'aiLogs', coalesce((select jsonb_agg(jsonb_build_object('operationId', l.vorgang_id, 'task', l.task, 'status', l.status, 'modelAlias', l.modell_alias, 'promptVersion', l.prompt_version, 'profileVersion', l.profil_version, 'costUsdCent', l.kosten_usd_cent, 'startedAt', l.gestartet_at, 'finishedAt', l.beendet_at) order by l.gestartet_at) from public.kd_ai_log l where l.account_id = p_account_id), '[]'::jsonb),
    'seriesWatch', coalesce((select jsonb_agg(to_jsonb(w) - 'account_id' order by w.updated_at) from public.kd_series_watch w where w.account_id = p_account_id), '[]'::jsonb),
    'sharedArticles', coalesce((select jsonb_agg(to_jsonb(a) - 'account_id' order by a.updated_at) from public.kd_shared_articles a where a.account_id = p_account_id), '[]'::jsonb),
    'sharedClaims', coalesce((select jsonb_agg(to_jsonb(c) - 'account_id' order by c.claimed_at) from public.kd_shared_article_claims c where c.account_id = p_account_id), '[]'::jsonb),
    'radar', jsonb_build_object(
      'capabilities', (select jsonb_build_object(
        'radar_unlimited', c.radar_unlimited,
        'radar_review', c.radar_review,
        'radar_pilot', c.radar_pilot,
        'updated_at', c.updated_at
      ) from public.kd_radar_capabilities c where c.account_id = p_account_id),
      'accountState', (select to_jsonb(st) - 'account_id' from public.kd_radar_account_state st where st.account_id = p_account_id),
      'subscriptions', coalesce((select jsonb_agg(to_jsonb(s) - 'account_id' order by s.updated_at) from public.kd_radar_subscriptions s where s.account_id = p_account_id), '[]'::jsonb),
      'receipts', coalesce((select jsonb_agg(to_jsonb(r) - 'account_id' order by r.updated_at) from public.kd_radar_receipts r where r.account_id = p_account_id), '[]'::jsonb),
      'shares', coalesce((select jsonb_agg(to_jsonb(sh) - 'account_id' order by sh.updated_at) from public.kd_radar_target_shares sh where sh.account_id = p_account_id), '[]'::jsonb),
      'operations', coalesce((select jsonb_agg(to_jsonb(o) - 'account_id' order by o.created_at) from public.kd_radar_operations o where o.account_id = p_account_id), '[]'::jsonb),
      'shareOperations', coalesce((select jsonb_agg(to_jsonb(o) - 'account_id' order by o.created_at) from public.kd_radar_share_operations o where o.account_id = p_account_id), '[]'::jsonb),
      'reviews', coalesce((select jsonb_agg(to_jsonb(rv) - 'actor_id' order by rv.created_at) from public.kd_radar_reviews rv where rv.actor_id = p_account_id), '[]'::jsonb),
      'importOperations', coalesce((select jsonb_agg(jsonb_build_object(
        'operation_id', o.operation_id,
        'request_hash', o.request_hash,
        'result', o.result,
        'terminal_at', o.terminal_at,
        'expires_at', o.expires_at,
        'created_at', o.created_at
      ) order by o.created_at, o.operation_id) from public.kd_radar_pilot_import_operations o where o.actor_id = p_account_id), '[]'::jsonb)
    ),
    'retention', (select coalesce(jsonb_agg(to_jsonb(rr) order by rr.data_class), '[]'::jsonb) from public.kd_private_retention_registry rr),
    'deletion', jsonb_build_object(
      'enabled', coalesce((select s.delete_enabled from public.kd_private_settings s where s.singleton), false),
      'lastStatus', (select o.status from public.kd_private_delete_operations o where o.account_hash = v_hash order by o.started_at desc limit 1)
    )
  ) into v_result;
  return v_result;
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
  v_pilot_import_ops integer;
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
  select least(count(*), v_limit)::integer into v_pilot_import_ops
    from public.kd_radar_pilot_import_operations
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
    delete from public.kd_radar_pilot_import_operations
     where ctid in (
       select ctid from public.kd_radar_pilot_import_operations
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
      'pilotImportOperations', v_pilot_import_ops,
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

revoke all on table public.kd_radar_pilot_import_operations
  from public, anon, authenticated;
grant all on table public.kd_radar_pilot_import_operations
  to service_role;

revoke all on function public.kd_private_mark_operation_ttl(),
  public.kd_private_own_data(uuid),
  public.kd_private_retention_run(boolean, integer)
  from public, anon, authenticated;
grant execute on function public.kd_private_mark_operation_ttl(),
  public.kd_private_own_data(uuid),
  public.kd_private_retention_run(boolean, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
