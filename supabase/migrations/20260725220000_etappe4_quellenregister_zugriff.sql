-- Kinodreieck · Etappe 4 · Migration 1: Quellenregister & getrennter Katalogzugriff
-- ============================================================================
-- Ausführen: Supabase Dashboard → SQL Editor → komplette Datei einfügen → Run.
-- Danach eine Zeile in supabase/migrations/LIESMICH.md ergänzen.
--
-- Ausgeführt: __________  Projekt: __________  von: __________
--
-- Eigenschaften:
--  * ADDITIV — kd_store, kd_personal und deren Policies bleiben unberührt.
--    kd_catalog bekommt drei neue, nullbare Spalten und zwei neue erlaubte
--    Zeilennamen (programm_demo, streaming_demo); bestehende Zeilen und die
--    Pipeline-Schreibvorgänge laufen unverändert weiter.
--  * IDEMPOTENT — mehrfaches Ausführen ist gefahrlos. Die Register-Seeds
--    nutzen ON CONFLICT DO NOTHING; spätere Hand-Änderungen im Register
--    werden bei erneutem Lauf NICHT überschrieben.
--  * BEWUSSTER SCHNITT (Entscheidung E1=b, 25.07.2026): Abschnitt D trennt
--    den Lesezugriff. Ab dann liest anon nur noch manifest + *_demo;
--    programm/streaming verlangen eine angemeldete Sitzung. Die App schickt
--    auf dem Katalogpfad heute nur den Publishable-Key → bis Phase 2
--    (Sitzungs-Token am Katalogpfad) liefert auch Testern der Live-Abruf
--    nichts Neues; bestehende Geräte zehren vom lokalen Katalog-Cache.
--    Der Pipeline-SCHREIBWEG (service_role) ist nicht betroffen.
--  * DURCHSETZUNG IN DER DATENBANK (Entscheidung E4): Trigger + Statusfunktion
--    wirken für JEDEN Schreiber (Mac-Pipeline, SQL-Editor, künftige Tools) —
--    kein Umbau der launchd-Jobs nötig. Ausbaustufe (eigene Migration in
--    Phase 4): quelle-Pflicht für Live-Assets + Feld-Whitelist-Prüfung.
-- ============================================================================


-- ============================================================================
-- Abschnitt A: Quellenregister kd_quellen
-- Ein Datensatz je Programmdatenquelle. Minimal (E3), aber mit Skalierungs-
-- feldern: erlaubte_felder, payload_bereiche, Fristen und Lizenzfenster sind
-- vorbereitet, ohne dass heute etwas davon Pflicht wäre.
-- ============================================================================

create table if not exists public.kd_quellen (
  slug               text primary key,
  betreiber          text not null,
  url                text,
  kontakt            text,
  status             text not null default 'offen'
                     check (status in ('offen','angefragt','freigegeben',
                                       'pausiert','widerrufen','abgelaufen',
                                       'intern_test')),
  prioritaet         integer,
  spielstaetten      text,
  erlaubte_felder    text[],        -- NULL = nichts vereinbart (nur Doku-Soll)
  max_abruf_frequenz text,
  importart          text,
  attribution        text,
  weitergabe_erlaubt boolean not null default false,  -- Downloadpaket-Frage
  lizenz_beginn      date,
  lizenz_ablauf      date,
  cache_frist_tage   integer,
  loesch_frist_tage  integer,
  payload_bereiche   text[],        -- welche kd_catalog-Zeilen die Quelle speist
  notizen            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.kd_quellen is
  'Quellenregister Etappe 4: Freigabestatus je Programmdatenquelle. Schreiben nur service_role/SQL-Editor; Tester lesen, anon sieht nichts.';

alter table public.kd_quellen enable row level security;

drop policy if exists kd_quellen_read_konto on public.kd_quellen;
create policy kd_quellen_read_konto
  on public.kd_quellen for select
  to authenticated
  using (true);

revoke all on table public.kd_quellen from anon, authenticated;
grant select on table public.kd_quellen to authenticated;

-- updated_at automatisch pflegen
create or replace function public.kd_quellen_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists kd_quellen_touch on public.kd_quellen;
create trigger kd_quellen_touch
  before update on public.kd_quellen
  for each row execute function public.kd_quellen_touch();

-- ----------------------------------------------------------------------------
-- Seeds: De-facto-Quellen (ehrlicher Ist-Zustand) + Anfrage-Kandidaten aus
-- docs/KINOQUELLEN_WIEN.csv. ON CONFLICT DO NOTHING — Hand-Pflege gewinnt.
-- ----------------------------------------------------------------------------

insert into public.kd_quellen
  (slug, betreiber, url, status, prioritaet, spielstaetten, importart, payload_bereiche, notizen)
values
  ('film_at', 'film.at (De-facto-Abruf der Mac-Pipeline)',
   'https://www.film.at/', 'intern_test', null,
   'Wiener Gesamtprogramm (inkl. nonstop-Anteile)',
   'Bestehender Pipeline-Abruf, kein Vertrag',
   array['programm'],
   'Speist heute die kd_catalog-Zeile programm. Status intern_test = nur angemeldete geschlossene Beta (E1=b), keine öffentliche Wiederveröffentlichung, keine Weitergabe im Downloadpaket.'),

  ('watchmode', 'Watchmode API',
   'https://api.watchmode.com/', 'intern_test', null,
   'Streaming-Verfügbarkeiten AT',
   'API mit Quota, gemäß API-Terms',
   array['streaming'],
   'Speist die kd_catalog-Zeile streaming (entdecken-Teil). Nur angemeldete Beta; Weitergabe-/Anzeige-Rechte für öffentlichen Betrieb ungeklärt.'),

  ('international_showtimes', 'International Showtimes',
   'https://www.internationalshowtimes.com/showtimes-api', 'offen', 0,
   'Österreichischer Markt; Wiener Abdeckung im 7-Tage-Test zu messen',
   'Kommerzielle API; Test → Business/Enterprise-Angebot',
   null,
   'Bevorzugte Lizenzroute laut PROGRAMMDATEN_PLAN. Business ab 299 EUR/Monat/Markt mit Sprache/Untertiteln; Cache-, Anzeige- und Rechtekette vertraglich bestätigen lassen.'),

  ('movieglu', 'MovieGlu',
   'https://movieglu.com/', 'offen', 1,
   'Österreich-Abdeckung direkt zu bestätigen',
   'Kommerzielle API; individuelles AT-Angebot nötig',
   null,
   'Preisdruck-/Fallback-Kandidat. OV/OmU/Untertitel-Felder für AT unbestätigt; Zeitzonen-Normalisierung nötig; Evaluationslizenz erlaubt weder öffentliche Anzeige noch Server-Speicherung.'),

  ('uncut', 'Uncut (Harald Zettler, Einzelunternehmer)',
   'https://www.uncut.at/wien/kinoprogramm/', 'offen', 1,
   'Praktisch alle regulären Wiener Kinos + Sommerkinos',
   'Partner-Feed/Kooperation anzufragen',
   null,
   'Aggregator-Abkürzung; zentraler Prüfpunkt ist die Rechtekette/Unterlizenzierung. Realistisch: bezahlter oder co-gebrandeter Wien-Pilot mit Attribution und Rücklinks.'),

  ('nonstop', 'nonstop Kinoabo',
   'https://nonstopkino.at/programm/', 'offen', 1,
   '18 reguläre Programmorte + saisonal Kino wie noch nie',
   'Partner-Feed/API anzufragen',
   null,
   'Zentraler Ansprechpartner für die Programmkinos; klären, ob nonstop zur Weiterlizenzierung berechtigt ist. Überschneidung mit Cineplexx bei Actors Studio und Urania.'),

  ('cineplexx', 'Cineplexx',
   'https://www.cineplexx.at/kinoprogramm/', 'offen', 1,
   '9 Wiener Programme',
   'Offiziellen Partner-Feed/API anzufragen',
   null,
   'Mit nonstop zusammen der größte Teil der Abdeckung in zwei Gesprächen.'),

  ('hollywood_megaplex', 'Hollywood Megaplex',
   'https://www.megaplex.at/kinoprogramm/wien-scn', 'offen', 2,
   'Gasometer + SCN',
   'Partner-Feed/API anzufragen',
   null, null),

  ('lugner_kino', 'Lugner Kino City',
   'https://lugnerkino.at/programm/spielplan/', 'offen', 2,
   'Lugner Kino City',
   'Feed oder schriftlich erlaubten Direktimport anfragen',
   null, null),

  ('autokino_wien', 'Autokino Wien',
   'https://www.autokino.at/kinoprogramm-wien', 'offen', 3,
   'Autokino Wien (Randgebiet, Teil der App-Abdeckung)',
   'Feed oder schriftlich erlaubten Direktimport anfragen',
   null, null),

  ('wienxtra_cinemagic', 'WIENXTRA-Cinemagic',
   'https://www.wienxtra.at/cinemagic/', 'offen', 3,
   'Kuratiertes Programm am Standort Urania',
   'Strukturierten Veranstaltungsexport anfragen',
   null, null),

  ('stadt_wien_sommerkinos', 'Wiener Sommerkinos (je Veranstalter)',
   'https://www.wien.gv.at/kultur/sommerkinos', 'offen', 4,
   'dotdotdot, Rathausplatz, FRAME[O]UT, Kino am Dach, VOLXkino u. a.',
   'Je Veranstalter einzeln; Stadtseite nur Inventar',
   null,
   'Phase 2 nach stabiler Kernabdeckung; wechselnde Veranstalter und Orte.')
on conflict (slug) do nothing;


-- ============================================================================
-- Abschnitt B: kd_catalog — Herkunfts-Metadaten + Demo-Zeilennamen
-- ============================================================================

alter table public.kd_catalog add column if not exists quelle      text;
alter table public.kd_catalog add column if not exists stand       timestamptz;
alter table public.kd_catalog add column if not exists gueltig_bis timestamptz;

comment on column public.kd_catalog.quelle is
  'slug aus kd_quellen; Pflicht für *_demo-Zeilen, Ausbaustufe macht sie auch für Live-Zeilen Pflicht.';
comment on column public.kd_catalog.gueltig_bis is
  'Ende der Anzeige-/Cachefrist des Payloads; bei *_demo Pflicht (ehrlicher Snapshot).';

-- name-Check um die beiden Demo-Zeilen erweitern.
-- (kd_catalog hat genau einen Check-Constraint: den name-Check aus
-- katalog_schema.sql; er wird ersetzt.)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.kd_catalog'::regclass and contype = 'c'
  loop
    execute format('alter table public.kd_catalog drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.kd_catalog
  add constraint kd_catalog_name_check
  check (name in ('manifest','programm','streaming','programm_demo','streaming_demo'));


-- ============================================================================
-- Abschnitt C: Durchsetzung in der Datenbank (E4)
-- Trigger wirken auch für service_role — die Datenbank ist die letzte Instanz,
-- egal welcher Prozess schreibt.
-- ============================================================================

create or replace function public.kd_catalog_quellen_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare s text;
begin
  -- Demo-Snapshots brauchen ehrliche Metadaten (Quelle, Stand, Ablauf).
  if right(new.name, 5) = '_demo' then
    if new.quelle is null or new.stand is null or new.gueltig_bis is null then
      raise exception 'Demo-Zeile %: quelle, stand und gueltig_bis sind Pflicht (ehrlicher Snapshot).', new.name;
    end if;
  end if;

  -- Sobald eine Quelle deklariert ist, gilt das Register.
  if new.quelle is not null then
    select status into s from public.kd_quellen where slug = new.quelle;
    if s is null then
      raise exception 'Quelle % steht nicht im Register kd_quellen.', new.quelle;
    end if;
    if s in ('pausiert','widerrufen','abgelaufen') then
      raise exception 'Quelle % hat Status % — Veröffentlichung gesperrt.', new.quelle, s;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists kd_catalog_quellen_guard on public.kd_catalog;
create trigger kd_catalog_quellen_guard
  before insert or update on public.kd_catalog
  for each row execute function public.kd_catalog_quellen_guard();

-- Widerruf/Pause als reiner Datenbank-Akt (Abnahmekriterium: ohne App-Release).
--   pausiert   → kein neuer Import (Guard oben); vorhandene Daten bleiben.
--   widerrufen → Status + zugehörige Katalog-Zeilen (inkl. *_demo) sofort raus.
--   abgelaufen → wie widerrufen.
-- Aufruf (SQL-Editor): select public.kd_quelle_status_setzen('film_at', 'pausiert');
create or replace function public.kd_quelle_status_setzen(p_slug text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare q public.kd_quellen%rowtype;
begin
  select * into q from public.kd_quellen where slug = p_slug;
  if not found then
    raise exception 'Unbekannte Quelle: %', p_slug;
  end if;

  update public.kd_quellen set status = p_status where slug = p_slug;
  -- (Status-Gültigkeit prüft der Check-Constraint der Tabelle.)

  if p_status in ('widerrufen','abgelaufen') then
    delete from public.kd_catalog
     where quelle = p_slug
        or (q.payload_bereiche is not null and
            (name = any (q.payload_bereiche)
             or name = any (array(select b || '_demo'
                                  from unnest(q.payload_bereiche) as b))));
  end if;
end
$$;

revoke execute on function public.kd_quelle_status_setzen(text, text)
  from public, anon, authenticated;


-- ============================================================================
-- Abschnitt D: Lesezugriff trennen (BEWUSSTER SCHNITT, E1=b)
-- anon: nur manifest + Demo-Snapshots. Angemeldete Konten: alles.
-- Konsequenz bis Phase 2 siehe Kopfkommentar.
-- ============================================================================

drop policy if exists kd_catalog_read on public.kd_catalog;
drop policy if exists kd_catalog_read_public on public.kd_catalog;
drop policy if exists kd_catalog_read_konto on public.kd_catalog;

create policy kd_catalog_read_public
  on public.kd_catalog for select
  to anon, authenticated
  using (name in ('manifest','programm_demo','streaming_demo'));

create policy kd_catalog_read_konto
  on public.kd_catalog for select
  to authenticated
  using (true);

-- ============================================================================
-- Kontrolle nach dem Lauf (erwartete Ergebnisse):
--   select count(*) from kd_quellen;                         -- 12
--   select name, quelle, stand from kd_catalog;              -- 3 Zeilen, quelle NULL
--   select public.kd_quelle_status_setzen('lugner_kino','angefragt');  -- ok
--   select public.kd_quelle_status_setzen('lugner_kino','offen');      -- zurück
-- Anon-Probe (curl mit Publishable-Key): programm liefert leer, manifest liefert.
-- ============================================================================
