-- ===========================================================================
-- Etappe 5 — Härtung des KI-Unterbaus (Befunde des adversarialen Reviews)
--
-- Ausgeführt am: ................  von: ................  Ergebnis: ..........
--
-- Setzt auf 20260726160000_etappe5_ki_unterbau.sql auf. Additiv, mehrfach
-- ausführbar. Eigene Datei statt Änderung der ersten, weil die erste bereits
-- in der Produktionsdatenbank gelaufen ist — und weil zwei Funktionen eine
-- neue Signatur bekommen: `create or replace` würde die alte Fassung sonst
-- als Überladung stehen lassen und die Function könnte weiter die falsche
-- rufen.
--
-- Behobene Befunde:
--   B2  `authenticated` hatte durch Supabase-Standardrechte volles DML auf
--       kd_ai_log — inklusive TRUNCATE, und TRUNCATE unterliegt keiner RLS.
--       Ein Befehl hätte das gesamte Abrechnungsregister geleert.
--   B3  Fehlte eine Konfigurationszeile, fielen Budget, Tageslimit und
--       Parallelgrenze STILL weg (NULL-Vergleich ist niemals wahr). Jetzt
--       fail-closed: fehlende Konfiguration weist ab, statt durchzulassen.
--   B4  Das Monatsbudget wurde gegen die Summe ABGESCHLOSSENER Läufe geprüft.
--       Alles gerade Laufende war unsichtbar, weil dessen Kosten erst am Ende
--       feststehen — bei zehn Konten mit je zwei parallelen Aufträgen wurde
--       der Deckel im Test um das Zwölffache überschritten. Jetzt wird beim
--       Start eine Schätzung reserviert und am Ende durch den Istwert ersetzt.
--   B5  Bezahlte Fehlläufe (Verweigerung, Zeitgrenze, Absturz) buchten gar
--       keine Kosten. Durch die Reservierung bleiben sie gebucht; zusätzlich
--       schließt kd_ai_verwaiste_schliessen() hängende Zeilen.
--   W2  kd_ai_stand() gab JEDEM Konto den globalen Monatsverbrauch des
--       Betreibers aus, direkt neben den eigenen Zahlen.
--   W4  Ein doppelt gestarteter Vorgang meldete „Nutzungslimit erreicht".
--   N2  kd_ai_stand() zählte Laufendes mit fest verdrahteten 60 Sekunden,
--       gesperrt wurde aber nach timeout_ms.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B2 — Rechte auf kd_ai_log korrigieren
--      Supabase vergibt auf neu angelegte Tabellen in `public` per
--      Default-Privileg ALL an `authenticated`. RLS bremst SELECT/INSERT/
--      UPDATE/DELETE — TRUNCATE aber nicht. Das Grant muss also weg, nicht
--      nur die Policy fehlen.
-- ---------------------------------------------------------------------------
revoke all on table public.kd_ai_log from anon, authenticated, public;
grant select on table public.kd_ai_log to authenticated;

-- Auch der Tabelleneigentümer soll sich an die Policies halten.
alter table public.kd_ai_log    force row level security;
alter table public.kd_ai_limits force row level security;

-- ---------------------------------------------------------------------------
-- Alte Signaturen entfernen, bevor die neuen entstehen
-- ---------------------------------------------------------------------------
drop function if exists public.kd_ai_auftrag_starten(uuid, text, uuid, text, text, text);
drop function if exists public.kd_ai_stand(uuid);

-- ---------------------------------------------------------------------------
-- B3/B4/W4 — Auftrag starten: fail-closed und mit Reservierung
-- ---------------------------------------------------------------------------
create or replace function public.kd_ai_auftrag_starten(
  p_account        uuid,
  p_task           text,
  p_vorgang        uuid,
  p_modell_alias   text default null,
  p_prompt_version text default null,
  p_profil_version text default null,
  p_reservierung   numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aktiv       boolean;
  v_budget      numeric;
  v_tageslimit  integer;
  v_parallel    integer;
  v_timeout_ms  integer;
  v_verbraucht  numeric;
  v_heute       integer;
  v_laufend     integer;
  v_id          bigint;
begin
  perform pg_advisory_xact_lock(778005);

  select coalesce((wert)::text::boolean, true) into v_aktiv
    from public.kd_ai_limits where schluessel = 'ai_aktiv';
  if v_aktiv is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'ai-disabled', 'grund', 'not-aus-gesetzt');
  end if;

  select (wert)::text::numeric into v_budget
    from public.kd_ai_limits where schluessel = 'monatsbudget_usd_cent';
  select (wert)::text::integer into v_tageslimit
    from public.kd_ai_limits where schluessel = 'tageslimit_auftraege';
  select (wert)::text::integer into v_parallel
    from public.kd_ai_limits where schluessel = 'parallel_max';
  select (wert)::text::integer into v_timeout_ms
    from public.kd_ai_limits where schluessel = 'timeout_ms';

  -- B3: fail-closed. Eine fehlende Grenze ist keine fehlende Grenze, sondern
  -- ein Konfigurationsfehler. Vorher liefen bei gelöschten Zeilen 40 von 40
  -- Versuchen durch.
  if v_budget is null or v_tageslimit is null or v_parallel is null then
    return jsonb_build_object('ok', false, 'code', 'server',
                              'grund', 'limitkonfiguration-unvollstaendig');
  end if;
  v_timeout_ms := coalesce(v_timeout_ms, 30000);

  -- B4: Reservierungen zählen mit. `kosten_usd_cent` trägt bei laufenden
  -- Zeilen die Schätzung; der Abschluss ersetzt sie durch den Istwert.
  select coalesce(sum(kosten_usd_cent), 0) into v_verbraucht
    from public.kd_ai_log
   where gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                         at time zone 'Europe/Vienna';
  if v_verbraucht + coalesce(p_reservierung, 0) > v_budget then
    return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'monatsbudget-erschoepft');
  end if;

  if p_account is not null then
    select count(*) into v_heute
      from public.kd_ai_log
     where account_id = p_account
       and gestartet_at >= date_trunc('day', now() at time zone 'Europe/Vienna')
                           at time zone 'Europe/Vienna';
    if v_heute >= v_tageslimit then
      return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'tageslimit-erreicht');
    end if;

    select count(*) into v_laufend
      from public.kd_ai_log
     where account_id = p_account
       and status = 'laufend'
       and gestartet_at > now() - make_interval(secs => v_timeout_ms / 1000.0);
    if v_laufend >= v_parallel then
      return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'zu-viele-gleichzeitig');
    end if;
  end if;

  insert into public.kd_ai_log
    (account_id, vorgang_id, task, status, modell_alias, prompt_version, profil_version, kosten_usd_cent)
  values
    (p_account, p_vorgang, p_task, 'laufend', p_modell_alias, p_prompt_version, p_profil_version,
     greatest(coalesce(p_reservierung, 0), 0))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'log_id', v_id, 'modell_alias', p_modell_alias);
exception
  when unique_violation then
    -- W4: eigener Code. „Nutzungslimit erreicht" war hier schlicht gelogen.
    return jsonb_build_object('ok', false, 'code', 'ai-duplicate', 'grund', 'vorgang-bereits-gestartet');
end;
$$;

comment on function public.kd_ai_auftrag_starten is
  'Prueft Not-Aus, Monatsbudget (inkl. Reservierungen laufender Auftraege), Tageslimit und Parallelitaet und legt bei Erfolg die laufend-Zeile mit reservierten Kosten an — atomar unter Vorhaengeschloss-Sperre. Fail-closed bei unvollstaendiger Konfiguration. Nur fuer service_role.';

-- ---------------------------------------------------------------------------
-- W2/N2 — Verbrauchsstand: eigener Verbrauch, korrektes Zeitfenster
-- ---------------------------------------------------------------------------
create or replace function public.kd_ai_stand(p_account uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timeout_ms integer;
  v_budget     numeric;
  v_global     numeric;
begin
  select (wert)::text::integer into v_timeout_ms
    from public.kd_ai_limits where schluessel = 'timeout_ms';
  v_timeout_ms := coalesce(v_timeout_ms, 30000);

  select (wert)::text::numeric into v_budget
    from public.kd_ai_limits where schluessel = 'monatsbudget_usd_cent';

  select coalesce(sum(kosten_usd_cent), 0) into v_global
    from public.kd_ai_log
   where gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                         at time zone 'Europe/Vienna';

  return jsonb_build_object(
    -- W2: der eigene Verbrauch. Der globale Stand des Betreibers geht ein
    -- angemeldetes Konto nichts an; er erscheint nur noch als Ja/Nein.
    'monatVerbrauchtUsdCent', (
      select coalesce(sum(kosten_usd_cent), 0) from public.kd_ai_log
       where p_account is not null and account_id = p_account
         and gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                             at time zone 'Europe/Vienna'),
    'budgetErschoepft', (v_budget is not null and v_global >= v_budget),
    'heuteAuftraege', (
      select count(*) from public.kd_ai_log
       where p_account is not null and account_id = p_account
         and gestartet_at >= date_trunc('day', now() at time zone 'Europe/Vienna')
                             at time zone 'Europe/Vienna'),
    'laufend', (
      select count(*) from public.kd_ai_log
       where p_account is not null and account_id = p_account
         and status = 'laufend'
         and gestartet_at > now() - make_interval(secs => v_timeout_ms / 1000.0))
  );
end;
$$;

comment on function public.kd_ai_stand is
  'Nur-Lese-Momentaufnahme des EIGENEN Verbrauchs. Der globale Budgetstand erscheint nur als Ja/Nein. Legt keine Zeile an.';

-- ---------------------------------------------------------------------------
-- B5 — Geisterzeilen schließen
--      Ein Prozessabbruch nach dem Anbieteraufruf (Plattform-Zeitgrenze,
--      Absturz) lässt die Zeile für immer auf `laufend` stehen. Die
--      reservierten Kosten bleiben dadurch gebucht — richtig so —, aber der
--      Zustand wäre gelogen.
-- ---------------------------------------------------------------------------
create or replace function public.kd_ai_verwaiste_schliessen()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timeout_ms integer;
  v_zahl       integer;
begin
  select (wert)::text::integer into v_timeout_ms
    from public.kd_ai_limits where schluessel = 'timeout_ms';
  v_timeout_ms := coalesce(v_timeout_ms, 30000);

  update public.kd_ai_log
     set status       = 'fehler',
         fehlerklasse = coalesce(fehlerklasse, 'abgebrochen-ohne-abschluss'),
         beendet_at   = now()
   where status = 'laufend'
     -- Doppelte Zeitgrenze: ein Lauf, der noch unterwegs sein KÖNNTE, wird
     -- nicht angefasst.
     and gestartet_at < now() - make_interval(secs => (v_timeout_ms * 2) / 1000.0);
  get diagnostics v_zahl = row_count;
  return v_zahl;
end;
$$;

comment on function public.kd_ai_verwaiste_schliessen is
  'Schliesst laufend-Zeilen, deren Lauf abgebrochen ist (aelter als die doppelte Zeitgrenze). Die reservierten Kosten bleiben gebucht. Von Hand, siehe Runbook.';

-- ---------------------------------------------------------------------------
-- Rechte der Funktionen (auch für die neuen Signaturen)
-- ---------------------------------------------------------------------------
revoke execute on function public.kd_ai_auftrag_starten(uuid, text, uuid, text, text, text, numeric) from anon, authenticated, public;
revoke execute on function public.kd_ai_stand(uuid) from anon, authenticated, public;
revoke execute on function public.kd_ai_verwaiste_schliessen() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Selbstprobe
-- ---------------------------------------------------------------------------
do $$
declare
  v_rechte text;
  v_fn     integer;
begin
  select string_agg(privilege_type, ',' order by privilege_type) into v_rechte
    from information_schema.role_table_grants
   where table_name = 'kd_ai_log' and grantee = 'authenticated';
  raise notice 'kd_ai_log / authenticated: % (erwartet: SELECT)', coalesce(v_rechte, 'keine');

  select count(*) into v_fn from pg_proc
   where proname = 'kd_ai_auftrag_starten' and pronamespace = 'public'::regnamespace;
  raise notice 'kd_ai_auftrag_starten: % Fassung(en) (erwartet: 1)', v_fn;
end $$;
