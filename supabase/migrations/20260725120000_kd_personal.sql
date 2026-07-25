-- Kinodreieck · Etappe 3 · Migration 1: persönlicher Accountspeicher
-- ============================================================================
-- Ausführen: Supabase Dashboard → SQL Editor → komplette Datei einfügen → Run.
-- Danach eine Zeile in supabase/migrations/LIESMICH.md ergänzen.
--
-- Ausgeführt: __________  Projekt: __________  von: __________
--
-- Eigenschaften:
--  * ADDITIV — fasst kd_store, kd_catalog und deren Policies mit keiner Zeile an.
--  * IDEMPOTENT — mehrfaches Ausführen ist gefahrlos.
--  * account_id kommt IMMER serverseitig aus der Sitzung (Default auth.uid()).
--    Ein Client sendet nie eine Account-ID; der WITH-CHECK ist die zweite Sperre.
--  * value ist TEXT (nicht jsonb): die App legt localStorage-Strings verbatim ab.
--    jsonb würde beim Lesen geparst zurückkommen und die Verbatim-Semantik des
--    Treibers brechen; ausserdem ist octet_length(text) deterministisch messbar.
-- ============================================================================

create table if not exists public.kd_personal (
  account_id uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  key        text        not null,
  value      text        not null,
  revision   bigint      not null default 1,
  updated_at timestamptz not null default now(),
  primary key (account_id, key)
);

comment on table public.kd_personal is
  'Persoenliche Sync-Toepfe pro Auth-Account (ein Dokument je key). RLS: nur auth.uid(). Kein anon-Zugriff.';

-- Anti-Flutung 1: nur die 15 bekannten Toepfe. Ein neuer Topf = eine Ein-Zeilen-Migration.
alter table public.kd_personal drop constraint if exists kd_personal_key_erlaubt;
alter table public.kd_personal add constraint kd_personal_key_erlaubt check (key in (
  'kd:master', 'kd:artikel', 'kd:kino-pins', 'kd:merkliste', 'kd:vokabular',
  'kd:einstellungen', 'kd:entdecken-status', 'kd:autor-name', 'kd:streaming-dienste',
  'kd:mustwatch', 'kd:achievements',
  'kd:zeitgrenze', 'kd:filter-mediathek', 'kd:filter-kino', 'kd:filter-streaming'
));

-- Anti-Flutung 2: 1 MiB je Topf. Groesster realer Topf (kd:master, ~255 Filme) liegt
-- bei 150-400 KB → mehrfacher Headroom, aber harte Obergrenze. 15 Toepfe × 1 MiB
-- ergibt strukturell max. 15 MiB je Account; eine Summenpruefung eruebrigt sich damit.
alter table public.kd_personal drop constraint if exists kd_personal_value_max;
alter table public.kd_personal add constraint kd_personal_value_max check (octet_length(value) <= 1048576);

-- Server-autoritatives updated_at/revision. Eigene Funktion, damit kd_touch (kd_store,
-- eingefroren) unangetastet bleibt. Client-gesendete Werte sind wirkungslos.
create or replace function public.kd_personal_touch() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;
  return new;
end
$$;

drop trigger if exists kd_personal_touch_trg on public.kd_personal;
create trigger kd_personal_touch_trg
  before insert or update on public.kd_personal
  for each row execute function public.kd_personal_touch();

-- ---------------------------------------------------------------------------
-- RLS: ausschliesslich die eigene Sitzung. Kein anon, kein public.
-- (select auth.uid()) statt auth.uid(): InitPlan-Caching, nutzt das PK-Praefix.
-- ---------------------------------------------------------------------------
alter table public.kd_personal enable row level security;

drop policy if exists kdp_sel on public.kd_personal;
create policy kdp_sel on public.kd_personal for select to authenticated
  using (account_id = (select auth.uid()));

drop policy if exists kdp_ins on public.kd_personal;
create policy kdp_ins on public.kd_personal for insert to authenticated
  with check (account_id = (select auth.uid()));

drop policy if exists kdp_upd on public.kd_personal;
create policy kdp_upd on public.kd_personal for update to authenticated
  using      (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- DELETE wird vom Alltags-Treiber NIE benutzt (delete bleibt lokal). Gebraucht von:
-- (a) Uebernahme-Rollback, (b) tools/rls_test_personal.mjs Cleanup,
-- (c) spaeterer Selbstbedienungs-Loeschung (Etappe 7).
drop policy if exists kdp_del on public.kd_personal;
create policy kdp_del on public.kd_personal for delete to authenticated
  using (account_id = (select auth.uid()));

-- Doppelte Verteidigung: kein Grant fuer anon (403 vor jeder RLS-Auswertung)
-- UND keine anon-Policy (selbst bei versehentlichem Grant nur leeres Ergebnis).
revoke all on table public.kd_personal from anon;
revoke all on table public.kd_personal from public;
grant select, insert, update, delete on table public.kd_personal to authenticated;

-- PostgREST-Schemacache neu laden, damit die Tabelle sofort erreichbar ist.
notify pgrst, 'reload schema';
