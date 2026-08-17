-- Kinodreieck · Radar-Websearch-MVP · Paket B (lokaler Anbieteranschluss)
-- =============================================================================
-- STATUS: NUR LOKAL VORBEREITET. NICHT REMOTE ANGEWANDT.
--
-- Additive, fail-closed Konfiguration fuer genau einen manuellen Anthropic-
-- Websearch. Diese Migration aktiviert weder Radar, Provider noch Scheduler
-- und enthaelt weder Ziel-, Konto-, Quellen- noch Secretwerte.
-- =============================================================================

begin;

do $$
declare
  v_wert jsonb;
begin
  select wert into v_wert from public.kd_ai_limits
   where schluessel = 'task_modell' for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'Paket B task_modell fehlt oder ist formfremd';
  end if;
  if v_wert ? 'radar-websearch'
     and v_wert->'radar-websearch' is distinct from to_jsonb('klein'::text) then
    raise exception 'Paket B task_modell drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{radar-websearch}', to_jsonb('klein'::text), true)
   where schluessel = 'task_modell';

  select wert into v_wert from public.kd_ai_limits
   where schluessel = 'task_max_tokens' for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'Paket B task_max_tokens fehlt oder ist formfremd';
  end if;
  if v_wert ? 'radar-websearch'
     and v_wert->'radar-websearch' is distinct from to_jsonb(1200) then
    raise exception 'Paket B task_max_tokens drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{radar-websearch}', to_jsonb(1200), true)
   where schluessel = 'task_max_tokens';

  select wert into v_wert from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent' for update;
  if not found or jsonb_typeof(v_wert) is distinct from 'object' then
    raise exception 'Paket B task_max_reservierung_usd_cent fehlt oder ist formfremd';
  end if;
  if v_wert ? 'radar-websearch'
     and v_wert->'radar-websearch' is distinct from to_jsonb(5) then
    raise exception 'Paket B task_max_reservierung_usd_cent drift';
  end if;
  update public.kd_ai_limits
     set wert = jsonb_set(wert, '{radar-websearch}', to_jsonb(5), true)
   where schluessel = 'task_max_reservierung_usd_cent';
end
$$;

insert into public.kd_ai_limits (schluessel, wert, notiz)
values (
  'websearch_usd_cent_pro_request',
  '1'::jsonb,
  'Anthropic Web Search: 1 US-Cent je erfolgreicher Suche; Bestandteil der Vorabreservierung.'
)
on conflict (schluessel) do nothing;

do $$
begin
  if not exists (
    select 1 from public.kd_ai_limits
     where schluessel = 'websearch_usd_cent_pro_request'
       and jsonb_typeof(wert) = 'number'
       and (wert #>> '{}')::numeric = 1
  ) then
    raise exception 'Paket B Websearch-Gebuehr fehlt oder driftet';
  end if;
end
$$;

-- Unmittelbar vor dem Netzwerkaufruf bindet diese service-role-only RPC den
-- bereits autorisierten Zielkontext an Radar-, Provider- und Kosten-Not-Aus.
-- Die allgemeine kd_ai_auftrag_starten-RPC behaelt Monats-, Tages-, Parallel-
-- und Owner-Cap und legt die eine laufende Kostenzeile atomar an.
create function public.kd_radar_websearch_auftrag_starten(
  p_account_id uuid,
  p_target_key text,
  p_operation_id uuid,
  p_reservierung numeric,
  p_search_requests integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_radar_aktiv boolean;
  v_provider_aktiv boolean;
  v_provider jsonb;
  v_fee numeric;
  v_task_cap numeric;
begin
  if p_account_id is null or p_operation_id is null
     or p_target_key is null or btrim(p_target_key) = ''
     or p_search_requests is distinct from 1
     or p_reservierung is null
     or p_reservierung::text !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok',false,'code','server','grund','radar-websearch-request-invalid');
  end if;

  select radar_aktiv, radar_provider_aktiv
    into v_radar_aktiv, v_provider_aktiv
    from public.kd_radar_settings
   where singleton
   for key share;
  if not coalesce(v_radar_aktiv, false) then
    return jsonb_build_object('ok',false,'code','disabled','grund','radar-off');
  end if;
  if not coalesce(v_provider_aktiv, false) then
    return jsonb_build_object('ok',false,'code','disabled','grund','radar-provider-off');
  end if;

  if not exists (
    select 1
      from public.kd_account_access a
      join public.kd_radar_capabilities c on c.account_id = a.account_id
      join public.kd_radar_subscriptions s on s.account_id = a.account_id
      join public.kd_radar_targets t on t.target_id = s.target_id
     where a.account_id = p_account_id
       and a.active and a.personal_ai
       and c.radar_pilot and c.radar_review
       and s.subscription_status = 'active' and s.region = 'AT'
       and t.target_key = p_target_key
       and t.target_key !~* '^(fixture|synthetic):'
       and t.target_status = 'active'
       and t.target_type in ('work','series')
       and not (t.target_type = 'series' and s.scope = 'cinema')
  ) then
    return jsonb_build_object('ok',false,'code','forbidden','grund','radar-target-forbidden');
  end if;

  v_provider := public.kd_private_provider_allowed('anthropic');
  if v_provider is null or v_provider->>'code' is distinct from 'PROVIDER_ALLOWED'
     or (v_provider->>'ok')::boolean is distinct from true then
    return jsonb_build_object('ok',false,'code','disabled','grund','provider-off');
  end if;

  select (wert #>> '{}')::numeric into v_fee
    from public.kd_ai_limits
   where schluessel = 'websearch_usd_cent_pro_request'
     and jsonb_typeof(wert) = 'number';
  select (wert #>> '{radar-websearch}')::numeric into v_task_cap
    from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent'
     and jsonb_typeof(wert) = 'object'
     and jsonb_typeof(wert #> '{radar-websearch}') = 'number';
  if v_fee is distinct from 1 or v_task_cap is distinct from 5
     or p_reservierung < v_fee or p_reservierung > v_task_cap then
    return jsonb_build_object('ok',false,'code','server','grund','radar-websearch-cost-config-invalid');
  end if;

  return public.kd_ai_auftrag_starten(
    p_account_id,
    'radar-websearch',
    p_operation_id,
    'klein',
    'radar-websearch-v1',
    null,
    p_reservierung
  );
end
$$;

revoke all on function public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer)
  from public, anon, authenticated;
grant execute on function public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer)
  to service_role;

comment on function public.kd_radar_websearch_auftrag_starten(uuid,text,uuid,numeric,integer) is
  'Reserviert genau einen manuellen Radar-Websearch nach Ziel-, Capability-, Radar-, Provider-, Suchgebuehr- und allgemeinem KI-Kostenzaun; nur service_role.';

commit;
