-- Kinodreieck · privater Kontogroessenbericht
-- Rein additiver, inhaltsfreier Messweg. Keine Migration wird hier ausgefuehrt.
begin;

create function public.kd_private_account_size_report(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_hash text;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_account_id is null then
    raise exception 'canonical account uuid required' using errcode = '22023';
  end if;

  v_account_hash := encode(
    extensions.digest(convert_to(p_account_id::text, 'UTF8'), 'sha256'),
    'hex'
  );

  with scope(sort_order, data_class) as (
    values
      (1, 'auth-account'::text),
      (2, 'account-access'::text),
      (3, 'personal-sync-pots'::text),
      (4, 'ai-operation-logs'::text),
      (5, 'series-watch'::text),
      (6, 'shared-articles'::text),
      (7, 'shared-claims'::text),
      (8, 'radar-capabilities-state'::text),
      (9, 'radar-subscriptions-receipts-shares'::text),
      (10, 'radar-operations-reviews'::text),
      (11, 'radar-text-findings'::text),
      (12, 'retention-information'::text),
      (13, 'deletion-status'::text)
  ),
  measurements(sort_order, row_count, stored_bytes) as (
    select 1, count(*)::bigint, coalesce(sum(pg_column_size(u)), 0)::bigint
      from auth.users u where u.id = p_account_id
    union all
    select 1, count(*)::bigint, coalesce(sum(pg_column_size(i)), 0)::bigint
      from auth.identities i where i.user_id = p_account_id
    union all
    select 2, count(*)::bigint, coalesce(sum(pg_column_size(a)), 0)::bigint
      from public.kd_account_access a where a.account_id = p_account_id
    union all
    select 3, count(*)::bigint, coalesce(sum(pg_column_size(p)), 0)::bigint
      from public.kd_personal p where p.account_id = p_account_id
    union all
    select 4, count(*)::bigint, coalesce(sum(pg_column_size(l)), 0)::bigint
      from public.kd_ai_log l where l.account_id = p_account_id
    union all
    select 5, count(*)::bigint, coalesce(sum(pg_column_size(w)), 0)::bigint
      from public.kd_series_watch w where w.account_id = p_account_id
    union all
    select 6, count(*)::bigint, coalesce(sum(pg_column_size(a)), 0)::bigint
      from public.kd_shared_articles a where a.account_id = p_account_id
    union all
    select 7, count(*)::bigint, coalesce(sum(pg_column_size(c)), 0)::bigint
      from public.kd_shared_article_claims c where c.account_id = p_account_id
    union all
    select 8, count(*)::bigint, coalesce(sum(pg_column_size(c)), 0)::bigint
      from public.kd_radar_capabilities c where c.account_id = p_account_id
    union all
    select 8, count(*)::bigint, coalesce(sum(pg_column_size(s)), 0)::bigint
      from public.kd_radar_account_state s where s.account_id = p_account_id
    union all
    select 9, count(*)::bigint, coalesce(sum(pg_column_size(s)), 0)::bigint
      from public.kd_radar_subscriptions s where s.account_id = p_account_id
    union all
    select 9, count(*)::bigint, coalesce(sum(pg_column_size(r)), 0)::bigint
      from public.kd_radar_receipts r where r.account_id = p_account_id
    union all
    select 9, count(*)::bigint, coalesce(sum(pg_column_size(s)), 0)::bigint
      from public.kd_radar_target_shares s where s.account_id = p_account_id
    union all
    select 10, count(*)::bigint, coalesce(sum(pg_column_size(o)), 0)::bigint
      from public.kd_radar_operations o where o.account_id = p_account_id
    union all
    select 10, count(*)::bigint, coalesce(sum(pg_column_size(o)), 0)::bigint
      from public.kd_radar_share_operations o where o.account_id = p_account_id
    union all
    select 10, count(*)::bigint, coalesce(sum(pg_column_size(r)), 0)::bigint
      from public.kd_radar_reviews r where r.actor_id = p_account_id
    union all
    select 10, count(*)::bigint, coalesce(sum(pg_column_size(o)), 0)::bigint
      from public.kd_radar_pilot_import_operations o where o.actor_id = p_account_id
    union all
    select 11, count(*)::bigint, coalesce(sum(pg_column_size(f)), 0)::bigint
      from public.kd_radar_text_findings f where f.account_id = p_account_id
    union all
    select 13, count(*)::bigint, coalesce(sum(pg_column_size(d)), 0)::bigint
      from public.kd_private_delete_operations d where d.account_hash = v_account_hash
  ),
  per_class as (
    select
      s.sort_order,
      s.data_class,
      coalesce(sum(m.row_count), 0)::bigint as row_count,
      coalesce(sum(m.stored_bytes), 0)::bigint as stored_bytes
    from scope s
    left join measurements m on m.sort_order = s.sort_order
    group by s.sort_order, s.data_class
  ),
  totals as (
    select
      sum(row_count)::bigint as row_count,
      sum(stored_bytes)::bigint as stored_bytes
    from per_class
  )
  select jsonb_build_object(
    'schemaVersion', 'kinodreieck-account-size-report-v1',
    'classes', (
      select jsonb_agg(
        jsonb_build_object(
          'dataClass', data_class,
          'rows', row_count,
          'bytes', stored_bytes
        ) order by sort_order
      )
      from per_class
    ),
    'totals', (
      select jsonb_build_object('rows', row_count, 'bytes', stored_bytes)
      from totals
    )
  ) into v_result;

  return v_result;
end
$$;

comment on function public.kd_private_account_size_report(uuid) is
  'Service-role-only: liefert je Release-Datenklasse ausschliesslich Zeilen- und gespeicherte Bytezahlen. Gemeinsame oder regenerierbare Katalog-, Feed-, Bild-, Cache- und Programmdaten bleiben ausgeschlossen.';

revoke all on function public.kd_private_account_size_report(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kd_private_account_size_report(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
