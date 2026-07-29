-- ===========================================================================
-- Etappe 8, Block 1: film-forecast explizit auf Sonnet/gross routen
--
-- Die Edge Function behandelt diese Zuordnung als Pflicht: Fehlt sie oder
-- zeigt sie auf einen anderen Alias, endet film-forecast vor Reservierung und
-- Anbieteraufruf. Damit kann ein ausgelassener Migrationsschritt nicht still
-- einen bezahlten Haiku-Aufruf erzeugen.
--
-- Ausgeführt: 2026-07-29 durch Codex über die verknüpfte Management-API auf
-- Projekt bscjgwcntapobyxsiyce. Ergebnis erfolgreich; anschließende echte
-- Rauchprobe 17/17 und RLS-Negativtest 36/36 grün.
--
-- Wiederholbar und additiv: jsonb_set ersetzt nur den einen Task-Eintrag und
-- erhaelt alle bereits vorhandenen Aufgaben.
-- ===========================================================================

begin;

do $migration$
begin
  update public.kd_ai_limits
     set wert = jsonb_set(coalesce(wert, '{}'::jsonb), '{film-forecast}', '"gross"'::jsonb, true),
         notiz = 'Zuordnung Aufgabe zu Modellalias. film-forecast nutzt verpflichtend gross (Sonnet); '
                 || 'die Edge Function faellt fuer diesen Task nie still auf klein zurueck.',
         geaendert_at = now()
   where schluessel = 'task_modell';
  if not found then
    raise exception 'kd_ai_limits.task_modell fehlt';
  end if;

  update public.kd_ai_limits
     set wert = jsonb_set(coalesce(wert, '{}'::jsonb), '{film-forecast}', '2048'::jsonb, true),
         notiz = 'Obergrenze der Antwortlaenge je Aufgabe. film-forecast: 2048 Tokens; '
                 || 'reichlich fuer das strikte Prognoseschema und hoechstens 20 Signal-IDs.',
         geaendert_at = now()
   where schluessel = 'task_max_tokens';
  if not found then
    raise exception 'kd_ai_limits.task_max_tokens fehlt';
  end if;
end
$migration$;

commit;

-- Kontrolle:
-- select schluessel, wert
--   from public.kd_ai_limits
--  where schluessel in ('task_modell', 'task_max_tokens')
--  order by schluessel;
