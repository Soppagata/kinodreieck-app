-- Foto-/Screenshot-Stapelimport: eigene, eng begrenzte Mediennutzlast sowie
-- explizite Modell- und Antwortbudgets. Wiederholbar und additiv.

insert into public.kd_ai_limits (schluessel, wert, notiz)
values ('request_max_media_bytes', '950000'::jsonb,
  'Maximale JSON-Anfrage fuer media-batch-extract; Client komprimiert auf unter 900 KB.')
on conflict (schluessel) do update
set wert = excluded.wert,
    notiz = excluded.notiz,
    geaendert_at = now();

do $$
begin
  if not exists (select 1 from public.kd_ai_limits where schluessel = 'task_modell' and jsonb_typeof(wert) = 'object') then
    raise exception 'task_modell fehlt oder ist kein Objekt';
  end if;
  if not exists (select 1 from public.kd_ai_limits where schluessel = 'task_max_tokens' and jsonb_typeof(wert) = 'object') then
    raise exception 'task_max_tokens fehlt oder ist kein Objekt';
  end if;
end
$$;

update public.kd_ai_limits
set wert = jsonb_set(wert, '{media-batch-extract}', '"klein"'::jsonb, true),
    geaendert_at = now()
where schluessel = 'task_modell';

update public.kd_ai_limits
set wert = jsonb_set(wert, '{media-batch-extract}', '4096'::jsonb, true),
    geaendert_at = now()
where schluessel = 'task_max_tokens';

insert into public.kd_ai_limits (schluessel, wert, notiz)
values ('task_max_reservierung_usd_cent', '{"media-batch-extract":4}'::jsonb,
  'Harte Reservierungsobergrenze je KI-Aufgabe in US-Cent; Stapelimport maximal 4 Cent pro bewusstem Lauf.')
on conflict (schluessel) do update
set wert = jsonb_set(coalesce(public.kd_ai_limits.wert, '{}'::jsonb),
                     '{media-batch-extract}', '4'::jsonb, true),
    notiz = coalesce(public.kd_ai_limits.notiz, '') || ' Stapelimport: maximal 4 US-Cent je Lauf.',
    geaendert_at = now();
