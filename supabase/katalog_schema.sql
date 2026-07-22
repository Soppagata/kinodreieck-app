-- Kinodreieck: gemeinsamer, nur lesbarer Programm-/Streamingkatalog.
-- Einmal im Supabase SQL Editor ausführen. Die Pipeline schreibt ausschließlich
-- mit service_role; PWA/Tester dürfen mit dem Publishable-Key nur SELECT.

create table if not exists public.kd_catalog (
  name text primary key check (name in ('manifest', 'programm', 'streaming')),
  payload jsonb not null,
  sha256 text,
  updated_at timestamptz not null default now()
);

alter table public.kd_catalog enable row level security;

drop policy if exists kd_catalog_read on public.kd_catalog;
create policy kd_catalog_read
  on public.kd_catalog for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.kd_catalog from anon, authenticated;
grant select on public.kd_catalog to anon, authenticated;

comment on table public.kd_catalog is
  'Von Max Pipeline gelieferte Programm-/Streamingassets; PWA read-only.';
