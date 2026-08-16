-- E17A: ausschliesslich additive, fail-closed Taskkonfiguration.
-- Andere JSON-Schluessel und alle anderen Konfigurationszeilen bleiben gleich.

do $$
declare
  v_wert jsonb;
begin
  select wert into v_wert
    from public.kd_ai_limits
   where schluessel = 'task_modell'
   for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'E17A task_modell fehlt oder ist formfremd';
  end if;
  if v_wert ? 'blog-profile-extract'
     and v_wert->'blog-profile-extract' is distinct from to_jsonb('klein'::text) then
    raise exception 'E17A task_modell drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{blog-profile-extract}', to_jsonb('klein'::text), true)
   where schluessel = 'task_modell';

  select wert into v_wert
    from public.kd_ai_limits
   where schluessel = 'task_max_tokens'
   for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'E17A task_max_tokens fehlt oder ist formfremd';
  end if;
  if v_wert ? 'blog-profile-extract'
     and v_wert->'blog-profile-extract' is distinct from to_jsonb(2048) then
    raise exception 'E17A task_max_tokens drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{blog-profile-extract}', to_jsonb(2048), true)
   where schluessel = 'task_max_tokens';

  select wert into v_wert
    from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent'
   for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'E17A task_max_reservierung_usd_cent fehlt oder ist formfremd';
  end if;
  if v_wert ? 'blog-profile-extract'
     and v_wert->'blog-profile-extract' is distinct from to_jsonb(5) then
    raise exception 'E17A task_max_reservierung_usd_cent drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{blog-profile-extract}', to_jsonb(5), true)
   where schluessel = 'task_max_reservierung_usd_cent';
end
$$;
