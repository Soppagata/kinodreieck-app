-- Universeller Kostenzaun vor jedem zahlenden KI-Anbieterrequest.
--
-- Owner-Vorgabe Max, 08.08.2026:
--   * hoechstens 500 US-Cent technische Kostennaeherung je Request;
--   * nie nur nachtraeglich pruefen.
--
-- Die Function berechnet die Reservierung aus exakt dem Anbieterkoerper. Diese
-- RPC prueft dieselbe Reservierung noch einmal atomar vor dem KI-Log. Ein
-- Betriebswert darf den Owner-Deckel unterschreiten, aber niemals erhoehen.

insert into public.kd_ai_limits (schluessel, wert, notiz)
values (
  'anbieter_request_max_usd_cent',
  '500'::jsonb,
  'Universeller harter Vorab-Zaun je zahlendem Anbieterrequest in US-Cent; maximal 500, engere Werte erlaubt.'
)
on conflict (schluessel) do update
set wert = case
      when jsonb_typeof(public.kd_ai_limits.wert) = 'number'
       and (public.kd_ai_limits.wert #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$'
       and (public.kd_ai_limits.wert #>> '{}')::numeric > 0
       and (public.kd_ai_limits.wert #>> '{}')::numeric <= 500
        then public.kd_ai_limits.wert
      else excluded.wert
    end,
    notiz = excluded.notiz,
    geaendert_at = now();

-- Sonnet 5 besitzt nur bis 31.08.2026 den Einfuehrungspreis 200/1000.
-- Der unverrueckbare Function-Boden reserviert bereits jetzt den
-- angekuendigten Regelpreis 300/1500. Dieselbe Migration hebt deshalb die
-- serverseitige Preistabelle mindestens dorthin an und bewahrt hoehere Werte.
insert into public.kd_ai_limits (schluessel, wert, notiz)
values (
  'preise_usd_cent_pro_mtok',
  '{"claude-haiku-4-5-20251001":{"in":100,"out":500},"claude-sonnet-5":{"in":300,"out":1500}}'::jsonb,
  'US-Cent je 1 Mio. Tokens; Sonnet 5 mindestens zum ab 01.09.2026 angekuendigten Regelpreis 300/1500.'
)
on conflict (schluessel) do update
set wert = (
      case when jsonb_typeof(public.kd_ai_limits.wert) = 'object'
        then public.kd_ai_limits.wert
        else '{"claude-haiku-4-5-20251001":{"in":100,"out":500}}'::jsonb
      end
    ) || jsonb_build_object(
      'claude-sonnet-5',
      jsonb_build_object(
        'in', greatest(
          case
            when jsonb_typeof(public.kd_ai_limits.wert #> '{claude-sonnet-5,in}') = 'number'
             and (public.kd_ai_limits.wert #>> '{claude-sonnet-5,in}') ~ '^[0-9]+(\.[0-9]+)?$'
              then (public.kd_ai_limits.wert #>> '{claude-sonnet-5,in}')::numeric
            else 300::numeric
          end,
          300::numeric
        ),
        'out', greatest(
          case
            when jsonb_typeof(public.kd_ai_limits.wert #> '{claude-sonnet-5,out}') = 'number'
             and (public.kd_ai_limits.wert #>> '{claude-sonnet-5,out}') ~ '^[0-9]+(\.[0-9]+)?$'
              then (public.kd_ai_limits.wert #>> '{claude-sonnet-5,out}')::numeric
            else 1500::numeric
          end,
          1500::numeric
        )
      )
    ),
    notiz = excluded.notiz,
    geaendert_at = now();

-- Mit dem vorgezogenen Sonnet-Regelpreis kostet der vollstaendige reale
-- Filmwissen-Referenzauftrag konservativ mehr als 5 US-Cent. Sechs US-Cent
-- erhalten diesen Pfad, bleiben aber ein enger Task-Cap weit unter dem
-- universellen 500-Cent-Zaun. Bereits bewusst hoehere Werte bis zum
-- Owner-Maximum bleiben erhalten; formfremde oder groessere Werte werden
-- sicher in den Bereich 6..500 normalisiert.
insert into public.kd_ai_limits (schluessel, wert, notiz)
values (
  'task_max_reservierung_usd_cent',
  '{"filmwissen-synthese":6,"media-batch-extract":4}'::jsonb,
  'Engere Vorab-Caps je Task; Filmwissen mindestens 6 US-Cent zum Sonnet-Regelpreis 300/1500, hoechstens universeller Owner-Cap.'
)
on conflict (schluessel) do update
set wert = (
      case when jsonb_typeof(public.kd_ai_limits.wert) = 'object'
        then public.kd_ai_limits.wert
        else '{"media-batch-extract":4}'::jsonb
      end
    ) || jsonb_build_object(
      'media-batch-extract',
      case
        when jsonb_typeof(public.kd_ai_limits.wert #> '{media-batch-extract}') = 'number'
         and (public.kd_ai_limits.wert #>> '{media-batch-extract}') ~ '^[0-9]+(\.[0-9]+)?$'
         and (public.kd_ai_limits.wert #>> '{media-batch-extract}')::numeric > 0
         and (public.kd_ai_limits.wert #>> '{media-batch-extract}')::numeric <= 500
          then (public.kd_ai_limits.wert #>> '{media-batch-extract}')::numeric
        else 4::numeric
      end
    ) || jsonb_build_object(
      'filmwissen-synthese',
      least(
        greatest(
          case
            when jsonb_typeof(public.kd_ai_limits.wert #> '{filmwissen-synthese}') = 'number'
             and (public.kd_ai_limits.wert #>> '{filmwissen-synthese}') ~ '^[0-9]+(\.[0-9]+)?$'
              then (public.kd_ai_limits.wert #>> '{filmwissen-synthese}')::numeric
            else 6::numeric
          end,
          6::numeric
        ),
        500::numeric
      )
    ),
    notiz = excluded.notiz,
    geaendert_at = now();

create or replace function public.kd_ai_auftrag_starten(
  p_account uuid,
  p_task text,
  p_vorgang uuid,
  p_modell_alias text default null,
  p_prompt_version text default null,
  p_profil_version text default null,
  p_reservierung numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_global_cap jsonb;
  v_task_cap jsonb;
  v_wirksam numeric;
begin
  select wert into v_global_cap
    from public.kd_ai_limits
   where schluessel = 'anbieter_request_max_usd_cent';

  if jsonb_typeof(v_global_cap) is distinct from 'number'
     or (v_global_cap #>> '{}') !~ '^[0-9]+(\.[0-9]+)?$'
     or (v_global_cap #>> '{}')::numeric <= 0
     or (v_global_cap #>> '{}')::numeric > 500
     or p_reservierung is null
     or p_reservierung::text !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object(
      'ok',false,'code','server','grund','anbieter-request-kostenzaun-ungueltig'
    );
  end if;

  v_wirksam := (v_global_cap #>> '{}')::numeric;
  if p_task = 'filmwissen-synthese'
     and p_modell_alias is distinct from 'gross' then
    return jsonb_build_object(
      'ok',false,'code','server','grund','task-kostenkonfiguration-ungueltig'
    );
  end if;
  select wert->p_task into v_task_cap
    from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent';

  if v_task_cap is not null then
    if jsonb_typeof(v_task_cap) is distinct from 'number'
       or (v_task_cap #>> '{}') !~ '^[0-9]+(\.[0-9]+)?$'
       or (v_task_cap #>> '{}')::numeric <= 0
       or (v_task_cap #>> '{}')::numeric > v_wirksam then
      return jsonb_build_object(
        'ok',false,'code','server','grund','task-kostenkonfiguration-ungueltig'
      );
    end if;
    v_wirksam := least(v_wirksam, (v_task_cap #>> '{}')::numeric);
  elsif p_task in ('filmwissen-synthese', 'media-batch-extract') then
    return jsonb_build_object(
      'ok',false,'code','server','grund','task-kostenkonfiguration-ungueltig'
    );
  end if;

  if p_reservierung > v_wirksam then
    return jsonb_build_object(
      'ok',false,'code','limit','grund','anbieter-request-kostenlimit-ueberschritten'
    );
  end if;

  return public.kd_ai_auftrag_starten_ohne_task_cap(
    p_account,p_task,p_vorgang,p_modell_alias,p_prompt_version,
    p_profil_version,p_reservierung
  );
end
$$;

revoke all on function
  public.kd_ai_auftrag_starten(uuid,text,uuid,text,text,text,numeric)
  from public, anon, authenticated;
grant execute on function
  public.kd_ai_auftrag_starten(uuid,text,uuid,text,text,text,numeric)
  to service_role;

comment on function
  public.kd_ai_auftrag_starten(uuid,text,uuid,text,text,text,numeric)
is 'Prueft vor jedem Anbieterrequest atomar universellen Owner-Cap (maximal 500 US-Cent), optionale engere Task-Caps, Not-Aus, Monatsbudget, Tageslimit und Parallelitaet; nur service_role.';

do $$
begin
  if not exists (
    select 1 from public.kd_ai_limits
     where schluessel = 'anbieter_request_max_usd_cent'
       and jsonb_typeof(wert) = 'number'
       and (wert #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$'
       and (wert #>> '{}')::numeric > 0
       and (wert #>> '{}')::numeric <= 500
  ) then
    raise exception 'anbieter_request_kostenzaun_fehlt';
  end if;
  if not exists (
    select 1 from public.kd_ai_limits
     where schluessel = 'preise_usd_cent_pro_mtok'
       and jsonb_typeof(wert #> '{claude-sonnet-5,in}') = 'number'
       and (wert #>> '{claude-sonnet-5,in}')::numeric >= 300
       and jsonb_typeof(wert #> '{claude-sonnet-5,out}') = 'number'
       and (wert #>> '{claude-sonnet-5,out}')::numeric >= 1500
  ) then
    raise exception 'sonnet_5_preisboden_fehlt';
  end if;
  if not exists (
    select 1 from public.kd_ai_limits
     where schluessel = 'task_max_reservierung_usd_cent'
       and jsonb_typeof(wert #> '{filmwissen-synthese}') = 'number'
       and (wert #>> '{filmwissen-synthese}')::numeric >= 6
       and (wert #>> '{filmwissen-synthese}')::numeric <= 500
  ) then
    raise exception 'filmwissen_task_cap_ungueltig';
  end if;
  if not exists (
    select 1 from public.kd_ai_limits
     where schluessel = 'task_max_reservierung_usd_cent'
       and jsonb_typeof(wert #> '{media-batch-extract}') = 'number'
       and (wert #>> '{media-batch-extract}')::numeric > 0
       and (wert #>> '{media-batch-extract}')::numeric <= 500
  ) then
    raise exception 'media_batch_task_cap_ungueltig';
  end if;
end
$$;
