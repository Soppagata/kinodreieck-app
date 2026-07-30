-- ===========================================================================
-- Etappe 8, Phase D — Filmwissen und KI-Protokoll atomar abschliessen
--
-- Eine gemeinsame Filmwissen-Version darf nie sichtbar sein, waehrend das
-- zugehoerige KI-Protokoll noch `laufend` meldet. Erfolg und Fehler werden
-- deshalb ueber service-only RPCs in genau einer DB-Transaktion geschlossen.
-- Die Migration aktiviert weder Quellen noch den Providerpfad.
--
-- Ausgefuehrt: 2026-07-30 durch Codex ueber die verknuepfte Management-API.
-- Remote-Nachweis: authenticated auf beiden RPCs false, service_role true.
-- ===========================================================================

begin;

create or replace function public.kd_filmwissen_synthese_abschliessen(
  p_auftrag uuid,
  p_ai_log bigint,
  p_version jsonb,
  p_belege jsonb,
  p_modell text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_kosten numeric
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vorgang uuid;
  v_version uuid;
begin
  if p_auftrag is null
     or p_ai_log is null or p_ai_log <= 0
     or p_modell is null or p_modell !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
     or p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_kosten is null
     or p_kosten::text !~ '^[0-9]+(\.[0-9]+)?$'
     or jsonb_typeof(p_version) is distinct from 'object'
     or jsonb_typeof(p_version->'kostenUsdCent') is distinct from 'number'
     or (p_version->>'kostenUsdCent') !~ '^[0-9]+(\.[0-9]+)?$'
     or (p_version->>'kostenUsdCent')::numeric is distinct from p_kosten
     or p_version->>'modell' is distinct from p_modell then
    raise exception 'filmwissen_atomarer_abschluss_ungueltig' using errcode = '22023';
  end if;

  select vorgang_id into v_vorgang
    from public.kd_filmwissen_auftraege
   where id = p_auftrag
     and status in ('bereit','laufend');
  if not found then
    raise exception 'filmwissen_auftrag_nicht_aktiv' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.kd_ai_log
     where id = p_ai_log
       and vorgang_id = v_vorgang
       and task = 'filmwissen-synthese'
       and status = 'laufend'
  ) then
    raise exception 'filmwissen_ai_log_nicht_zugeordnet' using errcode = '22023';
  end if;

  -- Diese Funktion prueft erneut Quellen, Urspruenge und 5-Cent-Istkosten.
  -- Jeder spaetere Fehler in dieser aeusseren Funktion rollt auch ihre
  -- Publikation zurueck, weil PL/pgSQL keinen Zwischen-Commit ausfuehrt.
  v_version := public.kd_filmwissen_veroeffentlichen(
    p_auftrag,p_version,p_belege
  );

  update public.kd_ai_log
     set status = 'fertig',
         modell = p_modell,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         kosten_usd_cent = p_kosten,
         fehlerklasse = null,
         beendet_at = now(),
         dauer_ms = greatest(
           0,(extract(epoch from (now() - gestartet_at)) * 1000)::integer
         )
   where id = p_ai_log
     and vorgang_id = v_vorgang
     and task = 'filmwissen-synthese'
     and status = 'laufend';
  if not found then
    raise exception 'filmwissen_ai_log_abschluss_kollision' using errcode = '40001';
  end if;

  return jsonb_build_object('status','fertig','versionId',v_version);
end
$$;

create or replace function public.kd_filmwissen_synthese_fehlgeschlagen(
  p_auftrag uuid,
  p_ai_log bigint,
  p_modell text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_kosten numeric,
  p_fehlerklasse text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vorgang uuid;
begin
  if p_auftrag is null
     or p_ai_log is null or p_ai_log <= 0
     or p_modell is not null
        and p_modell !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
     or p_input_tokens is not null and p_input_tokens < 0
     or p_output_tokens is not null and p_output_tokens < 0
     or p_kosten is not null
        and p_kosten::text !~ '^[0-9]+(\.[0-9]+)?$'
     or p_fehlerklasse is null
     or p_fehlerklasse !~ '^[a-z][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9._-]{0,39}){0,3}$' then
    raise exception 'filmwissen_atomarer_fehlerabschluss_ungueltig'
      using errcode = '22023';
  end if;

  select vorgang_id into v_vorgang
    from public.kd_filmwissen_auftraege
   where id = p_auftrag
     and status in ('bereit','laufend');
  if not found then
    raise exception 'filmwissen_auftrag_nicht_aktiv' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.kd_ai_log
     where id = p_ai_log
       and vorgang_id = v_vorgang
       and task = 'filmwissen-synthese'
       and status = 'laufend'
  ) then
    raise exception 'filmwissen_ai_log_nicht_zugeordnet' using errcode = '22023';
  end if;

  perform public.kd_filmwissen_auftrag_fehlgeschlagen(
    p_auftrag,p_kosten,p_fehlerklasse
  );

  update public.kd_ai_log
     set status = 'fehler',
         modell = coalesce(p_modell,modell),
         input_tokens = coalesce(p_input_tokens,input_tokens),
         output_tokens = coalesce(p_output_tokens,output_tokens),
         kosten_usd_cent = coalesce(p_kosten,kosten_usd_cent),
         fehlerklasse = p_fehlerklasse,
         beendet_at = now(),
         dauer_ms = greatest(
           0,(extract(epoch from (now() - gestartet_at)) * 1000)::integer
         )
   where id = p_ai_log
     and vorgang_id = v_vorgang
     and task = 'filmwissen-synthese'
     and status = 'laufend';
  if not found then
    raise exception 'filmwissen_ai_log_abschluss_kollision' using errcode = '40001';
  end if;

  return jsonb_build_object('status','fehler');
end
$$;

revoke all on function public.kd_filmwissen_synthese_abschliessen(
  uuid,bigint,jsonb,jsonb,text,integer,integer,numeric
) from public, anon, authenticated;
revoke all on function public.kd_filmwissen_synthese_fehlgeschlagen(
  uuid,bigint,text,integer,integer,numeric,text
) from public, anon, authenticated;

grant execute on function public.kd_filmwissen_synthese_abschliessen(
  uuid,bigint,jsonb,jsonb,text,integer,integer,numeric
) to service_role;
grant execute on function public.kd_filmwissen_synthese_fehlgeschlagen(
  uuid,bigint,text,integer,integer,numeric,text
) to service_role;

comment on function public.kd_filmwissen_synthese_abschliessen(
  uuid,bigint,jsonb,jsonb,text,integer,integer,numeric
) is
  'Publiziert Filmwissen und schliesst exakt das zugehoerige laufende KI-Log atomar; jede Abweichung rollt beides zurueck.';
comment on function public.kd_filmwissen_synthese_fehlgeschlagen(
  uuid,bigint,text,integer,integer,numeric,text
) is
  'Schliesst Filmwissen-Auftrag und exakt zugeordnetes KI-Log atomar als Fehler; unbekannte Kosten bleiben reserviert.';

commit;
