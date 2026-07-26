-- ===========================================================================
-- Etappe 5 — Geschützter KI-Unterbau: Nutzungsprotokoll und Limits
--
-- Ausgeführt am: ................  von: ................  Ergebnis: ..........
-- (nach dem Lauf hier UND in supabase/migrations/LIESMICH.md eintragen)
--
-- Additiv. Mehrfach ausführbar. Fasst KEINE bestehende Tabelle an.
--
-- Was hier entsteht:
--   kd_ai_limits  Betriebskonfiguration (Not-Aus, Budgets, Modellrouting,
--                 Preise). Änderbar per SQL — ohne App-Release, genau wie
--                 kd_quelle_status_setzen in Etappe 4.
--   kd_ai_log     Ein Eintrag je KI-Vorgang. NUR Metadaten, NIE Inhalte.
--                 Das Protokoll ist zugleich der Budget- und Parallelzähler;
--                 ohne es gäbe es keine durchsetzbare Grenze.
--
-- Warum die Prüfung in der Datenbank sitzt und nicht in der Edge Function:
-- Zwei gleichzeitige Aufrufe würden im Anwendungscode beide erst zählen und
-- dann schreiben — beide sähen "Limit noch frei" und beide kämen durch. Die
-- Funktion kd_ai_auftrag_starten() prüft und schreibt in EINER Transaktion
-- unter einer Vorhängeschloss-Sperre; damit ist die Grenze auch unter
-- Gleichzeitigkeit wirklich eine Grenze.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Konfiguration
-- ---------------------------------------------------------------------------
create table if not exists public.kd_ai_limits (
  schluessel   text primary key,
  wert         jsonb not null,
  notiz        text,
  geaendert_at timestamptz not null default now()
);

comment on table public.kd_ai_limits is
  'Betriebskonfiguration des KI-Endpunkts (Not-Aus, Budgets, Routing, Preise). Nur service_role liest/schreibt; kein Client-Zugriff.';

-- ---------------------------------------------------------------------------
-- 2) Nutzungsprotokoll  (= Budgetzähler)
-- ---------------------------------------------------------------------------
create table if not exists public.kd_ai_log (
  id               bigint generated always as identity primary key,
  -- NULL = administrativer Auftrag ohne Konto (z. B. Gesundheitslauf durch Max)
  account_id       uuid references auth.users(id) on delete cascade,
  vorgang_id       uuid not null,
  task             text not null,
  status           text not null default 'laufend'
                   check (status in ('laufend', 'fertig', 'fehler')),
  modell_alias     text,
  modell           text,
  input_tokens     integer check (input_tokens  is null or input_tokens  >= 0),
  output_tokens    integer check (output_tokens is null or output_tokens >= 0),
  -- Währung ausdrücklich im Namen: der Anbieter rechnet in USD, das Guthaben
  -- ist in Euro geladen. Ein namenloses "cent" wäre eine stille Fehlerquelle.
  kosten_usd_cent  numeric(12,6) check (kosten_usd_cent is null or kosten_usd_cent >= 0),
  dauer_ms         integer,
  fehlerklasse     text,
  prompt_version   text,
  profil_version   text,
  gestartet_at     timestamptz not null default now(),
  beendet_at       timestamptz
);

comment on table public.kd_ai_log is
  'Metadaten je KI-Vorgang und zugleich Budget-/Parallelzähler. Enthält bewusst KEINE Inhalte: keine Prompts, keine Payloads, keine Suchanfragen, keine Notizen, keine Blogtexte. Aufbewahrung 90 Tage (kd_ai_log_abraeumen).';
comment on column public.kd_ai_log.status is
  'laufend = beim Start geschrieben. Erst dadurch sind Parallelität zählbar und Abstürze/Timeouts sichtbar; eine Zeile erst am Ende zu schreiben würde genau die teuren Fehlläufe verschweigen.';

-- Doppelklick-Schutz: derselbe Vorgang eines Kontos wird nicht zweimal
-- abgerechnet. Ein echter Wiederholversuch bekommt eine neue vorgang_id.
create unique index if not exists kd_ai_log_vorgang_uniq
  on public.kd_ai_log (account_id, vorgang_id);

create index if not exists kd_ai_log_konto_zeit
  on public.kd_ai_log (account_id, gestartet_at desc);
create index if not exists kd_ai_log_zeit
  on public.kd_ai_log (gestartet_at desc);
create index if not exists kd_ai_log_laufend
  on public.kd_ai_log (gestartet_at) where status = 'laufend';

-- ---------------------------------------------------------------------------
-- 3) RLS
--    kd_ai_log: ein Konto sieht ausschließlich die eigenen Zeilen — und nur
--    lesend. Geschrieben wird allein durch die Edge Function (service_role,
--    umgeht RLS). kd_ai_limits ist für Clients vollständig zu.
--    (select auth.uid()) statt auth.uid(): InitPlan-Caching, wie in kd_personal.
-- ---------------------------------------------------------------------------
alter table public.kd_ai_log    enable row level security;
alter table public.kd_ai_limits enable row level security;

drop policy if exists kdai_log_sel on public.kd_ai_log;
create policy kdai_log_sel on public.kd_ai_log for select to authenticated
  using (account_id = (select auth.uid()));

-- Bewusst KEINE insert/update/delete-Policy für authenticated: ein Konto darf
-- seinen eigenen Verbrauch nicht umschreiben oder löschen.
-- kd_ai_limits bekommt bewusst GAR KEINE Policy: RLS an + keine Policy = dicht.

revoke all on table public.kd_ai_log    from anon, public;
revoke all on table public.kd_ai_limits from anon, authenticated, public;
grant select on table public.kd_ai_log to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Startkonfiguration
--    Nur einfügen, nie überschreiben — ein zweiter Lauf darf von Hand
--    angepasste Betriebswerte nicht zurücksetzen.
-- ---------------------------------------------------------------------------
insert into public.kd_ai_limits (schluessel, wert, notiz) values
  ('ai_aktiv', 'true'::jsonb,
   'Not-Aus. false schaltet alle KI-Aufgaben sofort ab; die App meldet ai-disabled und bleibt sonst voll nutzbar.'),

  ('monatsbudget_usd_cent', '1000'::jsonb,
   'Gesamtdeckel über ALLE Konten je Kalendermonat (Europe/Vienna), in US-Cent. 1000 = 10 USD.'),

  ('tageslimit_auftraege', '25'::jsonb,
   'Aufträge pro Konto und Kalendertag (Europe/Vienna).'),

  ('parallel_max', '2'::jsonb,
   'Gleichzeitig laufende Aufträge pro Konto.'),

  ('timeout_ms', '30000'::jsonb,
   'Zeitgrenze für den Anbieter-Aufruf. Zugleich die Frist, nach der eine laufend-Zeile als tot gilt und nicht mehr auf die Parallelität zählt.'),

  ('request_max_bytes', '32768'::jsonb,
   'Obergrenze des Auftrags-Payloads. Bewusst weit unter der Anbietergrenze (32 MB) — unsere Aufgaben sind klein, und kleine Prompts sind Programm.'),

  ('antwort_max_bytes', '262144'::jsonb,
   'Obergrenze der Anbieterantwort, bevor sie verworfen wird.'),

  ('modell_alias', '{"klein": "claude-haiku-4-5", "gross": "claude-sonnet-5"}'::jsonb,
   'Aliasse statt fester Modellnamen: ein Modellwechsel ist damit eine SQL-Zeile, kein Release. Die IDs stammen aus der Anbieterdoku (26.07.2026) und werden vor dem ersten echten Aufruf per GET /v1/models empirisch bestaetigt.'),

  ('task_modell', '{"health": "klein", "echo-struct": "klein", "intelligent-search": "gross", "masterlist-enrichment": "gross"}'::jsonb,
   'Zuordnung Aufgabe -> Modellalias. Sonnet fuer Suche und Bewertung, Haiku fuer kleine Aufgaben (Entscheidung Max, 26.07.2026).'),

  ('task_max_tokens', '{"echo-struct": 256, "intelligent-search": 1024, "masterlist-enrichment": 2048}'::jsonb,
   'Obergrenze der Antwortlaenge je Aufgabe (Pflichtfeld max_tokens der Anbieter-API).'),

  ('preise_usd_cent_pro_mtok',
   '{"claude-haiku-4-5": {"in": 100, "out": 500}, "claude-sonnet-5": {"in": 200, "out": 1000}}'::jsonb,
   'US-Cent je 1 Mio Tokens, Stand 26.07.2026. ACHTUNG: Sonnet 5 laeuft bis 31.08.2026 zum Einfuehrungspreis (200/1000); danach gelten 300/1500 — dann diese Zeile aktualisieren, sonst rechnet der Budgetzaehler zu niedrig.')
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------------
-- 5) Auftrag starten: prüfen UND protokollieren in einem Zug
--    Rückgabe (jsonb):
--      { "ok": true,  "log_id": 123, "modell_alias": "klein" }
--      { "ok": false, "code": "limit" | "ai-disabled", "grund": "..." }
-- ---------------------------------------------------------------------------
create or replace function public.kd_ai_auftrag_starten(
  p_account        uuid,
  p_task           text,
  p_vorgang        uuid,
  p_modell_alias   text default null,
  p_prompt_version text default null,
  p_profil_version text default null
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
  -- Eine globale Sperre für die gesamte Prüf-und-Schreib-Folge. Ohne sie
  -- könnten zwei gleichzeitige Aufrufe beide "noch frei" sehen. Bei den hier
  -- erwarteten Mengen (Dutzende Aufträge pro Tag) kostet das nichts.
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

  -- Monatsbudget: über ALLE Konten, Kalendermonat in Max' Zeitzone.
  if v_budget is not null then
    select coalesce(sum(kosten_usd_cent), 0) into v_verbraucht
      from public.kd_ai_log
     where gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                           at time zone 'Europe/Vienna';
    if v_verbraucht >= v_budget then
      return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'monatsbudget-erschoepft');
    end if;
  end if;

  if p_account is not null and v_tageslimit is not null then
    select count(*) into v_heute
      from public.kd_ai_log
     where account_id = p_account
       and gestartet_at >= date_trunc('day', now() at time zone 'Europe/Vienna')
                           at time zone 'Europe/Vienna';
    if v_heute >= v_tageslimit then
      return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'tageslimit-erreicht');
    end if;
  end if;

  -- Parallelität: nur wirklich noch laufende Vorgänge zählen. Eine Zeile, die
  -- älter als die Zeitgrenze ist, gehört zu einem abgestürzten Lauf und darf
  -- das Konto nicht dauerhaft blockieren.
  if p_account is not null and v_parallel is not null then
    select count(*) into v_laufend
      from public.kd_ai_log
     where account_id = p_account
       and status = 'laufend'
       and gestartet_at > now() - make_interval(secs => coalesce(v_timeout_ms, 30000) / 1000.0);
    if v_laufend >= v_parallel then
      return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'zu-viele-gleichzeitig');
    end if;
  end if;

  insert into public.kd_ai_log
    (account_id, vorgang_id, task, status, modell_alias, prompt_version, profil_version)
  values
    (p_account, p_vorgang, p_task, 'laufend', p_modell_alias, p_prompt_version, p_profil_version)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'log_id', v_id, 'modell_alias', p_modell_alias);
exception
  when unique_violation then
    -- Derselbe Vorgang wurde schon abgerechnet (Doppelklick, doppelter Retry).
    return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'vorgang-bereits-gestartet');
end;
$$;

comment on function public.kd_ai_auftrag_starten is
  'Prueft Not-Aus, Monatsbudget, Tageslimit und Parallelitaet und legt bei Erfolg die laufend-Zeile an — atomar unter Vorhaengeschloss-Sperre. Nur fuer service_role.';

-- ---------------------------------------------------------------------------
-- 6) Auftrag abschließen (Erfolg wie Fehler)
-- ---------------------------------------------------------------------------
create or replace function public.kd_ai_auftrag_beenden(
  p_id            bigint,
  p_status        text,
  p_modell        text default null,
  p_input_tokens  integer default null,
  p_output_tokens integer default null,
  p_kosten        numeric default null,
  p_fehlerklasse  text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('fertig', 'fehler') then
    raise exception 'Ungueltiger Endstatus: %', p_status;
  end if;
  update public.kd_ai_log
     set status          = p_status,
         modell          = coalesce(p_modell, modell),
         input_tokens    = coalesce(p_input_tokens, input_tokens),
         output_tokens   = coalesce(p_output_tokens, output_tokens),
         kosten_usd_cent = coalesce(p_kosten, kosten_usd_cent),
         fehlerklasse    = p_fehlerklasse,
         beendet_at      = now(),
         dauer_ms        = greatest(0, (extract(epoch from (now() - gestartet_at)) * 1000)::integer)
   where id = p_id;
end;
$$;

comment on function public.kd_ai_auftrag_beenden is
  'Schliesst eine laufend-Zeile ab und traegt Verbrauch bzw. Fehlerklasse nach. Nur fuer service_role.';

-- ---------------------------------------------------------------------------
-- 6b) Verbrauchsstand lesen (für den Gesundheitsbericht)
--     Kostet nichts, legt keine Zeile an und zählt auf kein Limit — der
--     Gesundheitslauf soll das Tageskontingent nicht selbst aufbrauchen.
-- ---------------------------------------------------------------------------
create or replace function public.kd_ai_stand(p_account uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'monatVerbrauchtUsdCent', (
      select coalesce(sum(kosten_usd_cent), 0) from public.kd_ai_log
       where gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                             at time zone 'Europe/Vienna'),
    'heuteAuftraege', (
      select count(*) from public.kd_ai_log
       where p_account is not null and account_id = p_account
         and gestartet_at >= date_trunc('day', now() at time zone 'Europe/Vienna')
                             at time zone 'Europe/Vienna'),
    'laufend', (
      select count(*) from public.kd_ai_log
       where p_account is not null and account_id = p_account
         and status = 'laufend'
         and gestartet_at > now() - interval '60 seconds')
  );
$$;

comment on function public.kd_ai_stand is
  'Nur-Lese-Momentaufnahme des Verbrauchs fuer den Gesundheitsbericht. Legt keine Zeile an.';

-- ---------------------------------------------------------------------------
-- 7) Aufbewahrung: 90 Tage, Löschung von Hand (Runbook)
--    Bewusst kein Cron — dieselbe Begründung wie beim Katalog-Abräumen in
--    Etappe 4: automatisches Löschen auf Verdacht ist in einem System ohne
--    Backup-Automatik die falsche Wahl.
-- ---------------------------------------------------------------------------
create or replace function public.kd_ai_log_abraeumen(p_tage integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_weg integer;
begin
  delete from public.kd_ai_log
   where gestartet_at < now() - make_interval(days => greatest(1, p_tage));
  get diagnostics v_weg = row_count;
  return v_weg;
end;
$$;

comment on function public.kd_ai_log_abraeumen is
  'Loescht Protokollzeilen aelter als p_tage (Standard 90). Von Hand auszufuehren, siehe Runbook in docs/ETAPPE_5_KI_UNTERBAU.md.';

-- Die drei Funktionen sind Betriebsmittel des Servers, nicht der App.
revoke execute on function public.kd_ai_auftrag_starten(uuid, text, uuid, text, text, text) from anon, authenticated, public;
revoke execute on function public.kd_ai_auftrag_beenden(bigint, text, text, integer, integer, numeric, text) from anon, authenticated, public;
revoke execute on function public.kd_ai_log_abraeumen(integer) from anon, authenticated, public;
revoke execute on function public.kd_ai_stand(uuid) from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 8) Selbstprobe (nur Anzeige, ändert nichts)
-- ---------------------------------------------------------------------------
do $$
declare v_zeilen integer;
begin
  select count(*) into v_zeilen from public.kd_ai_limits;
  raise notice 'kd_ai_limits: % Konfigurationszeilen', v_zeilen;
  raise notice 'kd_ai_log: Tabelle bereit, RLS aktiv, nur eigene Zeilen lesbar.';
end $$;
