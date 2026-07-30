-- ===========================================================================
-- Etappe 9: Antwortlimit der intelligenten Suche fuer die Beta
--
-- ADDITIV, nur Konfiguration. Der bestehende JSON-Schluessel wird gesetzt.
--
-- Die groesste dokumentierte Etappe-6-Vertragsantwort brauchte rund 3000
-- Tokens. 4096 behaelt ausreichend Reserve, halbiert aber die moegliche
-- unnoetige Ausgabe gegenueber dem bewusst grosszuegigen Bauwert 8192.
--
-- WIEDERHOLBAR: setzt einen festen Wert, kein Inkrement.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1
      from public.kd_ai_limits
     where schluessel = 'task_max_tokens'
       and jsonb_typeof(wert) = 'object'
  ) then
    raise exception 'Etappe 9: task_max_tokens fehlt oder ist kein Objekt';
  end if;
end
$$;

update public.kd_ai_limits
   set wert = jsonb_set(wert, '{intelligent-search}', '4096'::jsonb, true),
       notiz = coalesce(notiz, '')
               || ' Etappe 9: intelligent-search fuer die geschlossene Beta von 8192 '
               || 'auf 4096 Ausgabetokens begrenzt; dokumentierter Hoechstbedarf rund 3000.',
       geaendert_at = now()
 where schluessel = 'task_max_tokens'
   and wert->'intelligent-search' is distinct from '4096'::jsonb;

-- Kontrolle: muss "intelligent-search": 4096 enthalten.
-- select schluessel, wert
--   from public.kd_ai_limits
--  where schluessel = 'task_max_tokens';
