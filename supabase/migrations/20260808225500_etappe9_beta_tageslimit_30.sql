-- Etappe 9: realistisches KI-Tageslimit fuer die geschlossene Beta.
--
-- Owner-Entscheid Max, 08.08.2026:
--   * 10 KI-Auftraege pro Konto und Tag sind fuer reale Nutzung zu knapp;
--   * 30 bleiben dauerhaft aktiv und werden erst bei tatsaechlich nicht mehr
--     tragbaren Kosten durch eine spaetere, eigene Migration gesenkt.
--
-- Ausgefuehrt am 08.08.2026 auf Projekt bscjgwcntapobyxsiyce durch Codex ueber
-- die verknuepfte Management-API. Remote belegt: tageslimit_auftraege = 30,
-- ai_aktiv = true, Monatsbudget = 1000, Anbieterrequest-Cap = 500,
-- Task-Caps filmwissen-synthese = 6 und media-batch-extract = 4 US-Cent,
-- Sonnet-Preisboden = 300/1500 und parallel_max = 2.
-- Nach `migration repair --status applied` sind alle 27 lokalen und remote
-- Migrationsversionen bis einschliesslich 20260808225500 deckungsgleich.
--
-- ADDITIV und wiederholbar: genau ein bestehender Konfigurationswert wird auf
-- den neuen festen Wert gesetzt. Monatsbudget, Request-Cap, Parallelitaet und
-- Not-Aus bleiben unveraendert.

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
   set wert = '30'::jsonb,
       notiz = 'Geschlossene Beta ab Owner-Entscheid 08.08.2026: hoechstens 30 KI-Auftraege pro Konto und Kalendertag (Europe/Vienna). Erst bei tatsaechlich nicht mehr tragbaren Kosten durch eine neue Migration senken; Monatsdeckel, Request-Cap und ai_aktiv-Not-Aus bleiben zusaetzlich wirksam.',
       geaendert_at = now()
 where schluessel = 'tageslimit_auftraege'
   and wert is distinct from '30'::jsonb;

do $$
begin
  if not exists (
    select 1
      from public.kd_ai_limits
     where schluessel = 'tageslimit_auftraege'
       and jsonb_typeof(wert) = 'number'
       and (wert #>> '{}')::numeric = 30
  ) then
    raise exception 'Etappe 9: tageslimit_auftraege ist nicht exakt 30';
  end if;
end
$$;
