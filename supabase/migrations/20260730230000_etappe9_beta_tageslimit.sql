-- ===========================================================================
-- Etappe 9: Tageslimit fuer die geschlossene Beta
--
-- ADDITIV, nur Konfiguration. Ein Wert in kd_ai_limits.
--
-- Die Bauphase ist beendet. Das absichtlich hohe Zwischenlimit von 200
-- Auftraegen je Konto und Tag wird vor der ersten Tester-Einladung auf 10
-- zurueckgenommen. Der globale Monatsdeckel und der serverseitige Not-Aus
-- bleiben unveraendert.
--
-- WIEDERHOLBAR: setzt einen festen Wert, kein Inkrement.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1
      from public.kd_ai_limits
     where schluessel = 'tageslimit_auftraege'
  ) then
    raise exception 'Etappe 9: tageslimit_auftraege fehlt';
  end if;
end
$$;

update public.kd_ai_limits
   set wert = '10'::jsonb,
       notiz = 'Geschlossene Beta ab Etappe 9: hoechstens 10 KI-Auftraege pro Konto und '
               || 'Kalendertag (Europe/Vienna). Globaler Monatsdeckel und ai_aktiv-Not-Aus '
               || 'bleiben zusaetzlich wirksam.',
       geaendert_at = now()
 where schluessel = 'tageslimit_auftraege'
   and wert is distinct from '10'::jsonb;

-- Kontrolle: muss genau eine Zeile mit dem JSON-Zahlenwert 10 zeigen.
-- select schluessel, wert, notiz
--   from public.kd_ai_limits
--  where schluessel = 'tageslimit_auftraege';
