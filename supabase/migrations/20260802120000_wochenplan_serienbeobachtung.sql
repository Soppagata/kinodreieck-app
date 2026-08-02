-- Kinodreieck · Deine Woche + serverlesbare Serienbeobachtungen
-- ============================================================================
-- Remote angewandt am 2. August 2026 auf Produktion (EU-West). Sie
--   1) erlaubt den persönlichen Wochenplan im bestehenden Kontosync und
--   2) hält nur deduplizierte Watchmode-IDs für den planmäßigen Katalogjob.
-- Keine Anbieterabfragen, keine Terminfrequenz und keine privaten Remindertexte
-- werden serverseitig verändert oder veröffentlicht.

alter table public.kd_personal
  drop constraint if exists kd_personal_key_erlaubt;
alter table public.kd_personal
  add constraint kd_personal_key_erlaubt
  check (key in (
    'kd:master', 'kd:artikel', 'kd:kino-pins', 'kd:wochenplan',
    'kd:merkliste', 'kd:vokabular', 'kd:einstellungen',
    'kd:entdecken-status', 'kd:autor-name', 'kd:streaming-dienste',
    'kd:mustwatch', 'kd:achievements', 'kd:zeitgrenze',
    'kd:filter-mediathek', 'kd:filter-kino', 'kd:filter-streaming',
    'kd:geschmacksprofil'
  ));
comment on constraint kd_personal_key_erlaubt on public.kd_personal is
  'Erlaubte Töpfe (17, Stand Deine Woche). Neuer Topf = additive Migration, die alle Werte neu setzt.';

create table if not exists public.kd_series_watch (
  account_id uuid not null default auth.uid(),
  watchmode_id bigint not null check (watchmode_id > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, watchmode_id)
);

comment on table public.kd_series_watch is
  'Private, accountgebundene Watchmode-IDs. Service-Role liest aktive IDs dedupliziert für den bestehenden Kataloglauf.';

alter table public.kd_series_watch enable row level security;

drop policy if exists kdsw_sel on public.kd_series_watch;
create policy kdsw_sel on public.kd_series_watch
  for select to authenticated
  using (account_id = (select auth.uid()));

drop policy if exists kdsw_ins on public.kd_series_watch;
create policy kdsw_ins on public.kd_series_watch
  for insert to authenticated
  with check (account_id = (select auth.uid()));

drop policy if exists kdsw_upd on public.kd_series_watch;
create policy kdsw_upd on public.kd_series_watch
  for update to authenticated
  using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

drop policy if exists kdsw_del on public.kd_series_watch;
create policy kdsw_del on public.kd_series_watch
  for delete to authenticated
  using (account_id = (select auth.uid()));

create or replace function public.kd_set_series_watch(p_watchmode_ids bigint[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_account uuid := auth.uid();
  v_ids bigint[] := coalesce(p_watchmode_ids, array[]::bigint[]);
begin
  if v_account is null then
    raise exception 'Anmeldung erforderlich';
  end if;
  if cardinality(v_ids) > 200 or exists (
    select 1 from unnest(v_ids) as id where id is null or id <= 0
  ) then
    raise exception 'Ungültige Serien-Beobachtungsliste';
  end if;

  delete from public.kd_series_watch where account_id = v_account;
  insert into public.kd_series_watch (account_id, watchmode_id, active, updated_at)
  select v_account, id, true, now()
    from (select distinct unnest(v_ids) as id) ids
   on conflict (account_id, watchmode_id) do update
     set active = true, updated_at = excluded.updated_at;
end;
$$;

revoke all on table public.kd_series_watch from anon;
grant select, insert, update, delete on table public.kd_series_watch to authenticated;
grant all on table public.kd_series_watch to service_role;

revoke all on function public.kd_set_series_watch(bigint[]) from public;
revoke all on function public.kd_set_series_watch(bigint[]) from anon;
grant execute on function public.kd_set_series_watch(bigint[]) to authenticated;
grant execute on function public.kd_set_series_watch(bigint[]) to service_role;

-- Kontrollabfragen nach dem Lauf:
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'kd_personal_key_erlaubt';
-- select relname, relrowsecurity from pg_class where relname = 'kd_series_watch';
-- select proname, prosecdef from pg_proc where proname = 'kd_set_series_watch'; -- prosecdef muss false sein
-- Gegenprobe nach dem Lauf: Ein Insert in kd_personal mit key='kd:boeser-topf'
-- muss weiterhin mit SQLSTATE 23514 am geschlossenen CHECK scheitern.
