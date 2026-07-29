-- ===========================================================================
-- Etappe 7: erste Structured-Output-Kompilierung innerhalb der Function tragen
--
-- AUSGANGSBEFUND 29.07.2026
-- Der erste echte `profile-extract`-Aufruf endete nach exakt der globalen
-- Anbietergrenze von 30 Sekunden als `anbieter-zeitgrenze`. Der Anbieter
-- kompiliert ein neues Structured-Output-Schema beim ersten Einsatz zu einer
-- Grammatik und cached diese anschließend. Seine offizielle Dokumentation
-- weist ausdrücklich auf zusätzliche Erstaufruf-Latenz hin.
--
-- WARUM 120 SEKUNDEN
-- Supabase lässt auf dem Free-Plan 150 Sekunden bis zum Request-Idle-Timeout.
-- 120 Sekunden geben der Schemakompilierung Raum und lassen 30 Sekunden
-- Reserve für Auth, Datenbankgrenzen, Prüfung und Antwort. Der Wert wird
-- GLOBAL in `timeout_ms` erhöht, nicht nur im TypeScript-Client: dieselbe
-- Konfiguration bestimmt in `kd_ai_auftrag_starten`, wie lange laufende
-- Reservierungen auf `parallel_max` zählen. Zwei verschiedene Zeitgrenzen
-- würden nach 30 Sekunden neue Aufträge zulassen, während der erste noch
-- beim Anbieter arbeitet.
--
-- WARUM 4096 TOKENS UND HAIKU EXPLIZIT
-- Die Function hatte für `profile-extract` mangels Live-Konfiguration den
-- Code-Fallback 8192 und den Modell-Fallback `klein` verwendet. Das funktion-
-- iert, ist im Betriebsstand aber unsichtbar. Die Aufgabe erhält deshalb den
-- expliziten Alias `klein` und ein reichliches Ausgabebudget von 4096 Tokens.
-- Die eigenen Mengengrenzen (20 Signale, 12 Filme, 6 offene Einträge) passen
-- darunter; zugleich halbiert sich die konservative Kostenreservierung.
--
-- WIEDERHOLBAR
-- `jsonb_set` ersetzt nur den einen Task-Eintrag und erhält alle bestehenden
-- Aufgaben. Mehrfaches Ausführen ist folgenlos.
-- ===========================================================================

begin;

do $migration$
begin
  update public.kd_ai_limits
     set wert = '120000'::jsonb,
         notiz = 'Zeitgrenze fuer Anbieteraufruf und Parallel-Reservierung. '
                 || 'Seit Etappe 7: 120 s fuer die Erstkompilierung von Structured-Output-Grammatiken; '
                 || '30 s Reserve bis zum Supabase-Request-Idle-Timeout von 150 s.',
         geaendert_at = now()
   where schluessel = 'timeout_ms';
  if not found then
    raise exception 'kd_ai_limits.timeout_ms fehlt';
  end if;

  update public.kd_ai_limits
     set wert = jsonb_set(coalesce(wert, '{}'::jsonb), '{profile-extract}', '4096'::jsonb, true),
         notiz = 'Obergrenze der Antwortlaenge je Aufgabe. profile-extract: 4096 Tokens; '
                 || 'reichlich fuer die eigenen Mengengrenzen, aber kleiner als der fruehere 8192-Fallback.',
         geaendert_at = now()
   where schluessel = 'task_max_tokens';
  if not found then
    raise exception 'kd_ai_limits.task_max_tokens fehlt';
  end if;

  update public.kd_ai_limits
     set wert = jsonb_set(coalesce(wert, '{}'::jsonb), '{profile-extract}', '"klein"'::jsonb, true),
         notiz = 'Zuordnung Aufgabe zu Modellalias. profile-extract nutzt explizit klein (Haiku).',
         geaendert_at = now()
   where schluessel = 'task_modell';
  if not found then
    raise exception 'kd_ai_limits.task_modell fehlt';
  end if;
end
$migration$;

commit;

-- Kontrolle:
-- select schluessel, wert
--   from public.kd_ai_limits
--  where schluessel in ('timeout_ms', 'task_max_tokens', 'task_modell')
--  order by schluessel;
