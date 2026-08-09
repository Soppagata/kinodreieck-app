-- Kinodreieck · Rollen-v1 · additive Access-Grundlage
-- ============================================================================
-- Phase 1: lokal vorbereitet, noch NICHT remote angewandt.
--
-- Diese erste Transaktion ist absichtlich noch nicht durchsetzend. Nach ihrem
-- spaeteren, einzeln freigegebenen Remote-Lauf werden die bestaetigten Konten
-- ueber service_role gebootstrapped und rueckgelesen. Erst danach darf die
-- zweite Migration die bestehenden Datenpfade auf active=true begrenzen.
-- Keine Konto-ID und keine Freigabezeile gehoert in Git.
-- Remote ausschliesslich als einzelne Datei anwenden. Kein unqualifiziertes
-- `supabase db push`: Zwischen Basis und Enforcement liegt der Bootstrap.
-- Ein unerwartet vorhandener Objektname bricht bewusst fail-closed ab.
-- ============================================================================

begin;

create table public.kd_account_access (
  account_id  uuid        not null
                           references auth.users(id) on delete cascade,
  role        text        not null default 'member'
                           constraint kd_account_access_role_valid
                           check (role in ('member', 'owner')),
  active      boolean     not null default false,
  personal_ai boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint kd_account_access_pkey primary key (account_id),
  constraint kd_account_access_personal_ai_requires_active
    check (not personal_ai or active)
);

comment on table public.kd_account_access is
  'Autoritative Rollen-v1-Freigabe je Auth-Konto. Browser lesen nur die eigene Zeile; Verwaltung ausschliesslich service_role.';
comment on column public.kd_account_access.role is
  'Fachliche Rolle member oder owner. owner hat in Rollen-v1 keine zusaetzlichen Produktrechte.';
comment on column public.kd_account_access.active is
  'Fachliche Freigabe fuer kontogebundene Remote-Datenpfade.';
comment on column public.kd_account_access.personal_ai is
  'Zusaetzliche Freigabe fuer persoenliche KI; darf nur bei active=true gesetzt sein.';

create or replace function public.kd_account_access_touch()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.account_id := old.account_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists kd_account_access_touch_trg
  on public.kd_account_access;
create trigger kd_account_access_touch_trg
  before insert or update on public.kd_account_access
  for each row execute function public.kd_account_access_touch();

alter table public.kd_account_access enable row level security;

drop policy if exists kdaa_own_select on public.kd_account_access;
create policy kdaa_own_select on public.kd_account_access
  for select to authenticated
  using (account_id = (select auth.uid()));

/* Keine Write-Policy: Auch die eigene Zeile ist im Browser read-only.
   Supabase-Default-Privileges vergeben neuen Objekten sonst zu breite Rechte;
   deshalb werden alle Browserrechte in derselben Transaktion neutralisiert. */
revoke all on table public.kd_account_access
  from public, anon, authenticated;
grant select on table public.kd_account_access to authenticated;
grant select, insert, update, delete on table public.kd_account_access
  to service_role;

/* Parameterlos und ohne ID-Orakel: Policies fragen nur die aktuelle Sitzung.
   Keine Zeile oder kein JWT ergibt false. Ein Datenbank-/Rechtefehler wird
   nicht abgefangen und beendet damit den aufrufenden Pfad ebenfalls fail-closed. */
create or replace function public.kd_account_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select a.active
      from public.kd_account_access as a
     where a.account_id = (select auth.uid())
  ), false)
$$;

comment on function public.kd_account_active() is
  'Fail-closed Rollen-v1-Pruefung fuer die aktuelle Sitzung; keine Account-ID als Parameter und kein Fremdlesen.';

revoke all on function public.kd_account_access_touch()
  from public, anon, authenticated;
revoke all on function public.kd_account_active()
  from public, anon, authenticated;
grant execute on function public.kd_account_active() to authenticated;

notify pgrst, 'reload schema';

commit;
