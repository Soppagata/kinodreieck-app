-- Kinodreieck · Entdecken-Wochenfeed · atomarer Owner-Recoveryclaim
-- ============================================================================
-- Additive Forward-Migration. Die bereits bestehende Default-off-Autorisierung
-- und der eigentliche Wochenclaim laufen in genau einer Datenbanktransaktion.
-- Damit kann zwischen Freigabe und Claim weder ein Browserrequest dazwischen-
-- greifen noch nach einem lokalen Hüllenfehler eine offene Freigabe verbleiben.
-- Der Aufruf bleibt service_role-only; die Edge Function prüft davor den
-- authentifizierten, aktiven Owner mit persönlicher KI-Freigabe.
-- ============================================================================

begin;

create function public.kd_entdecken_daily_recovery_claim()
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_iso_week text := to_char((v_now at time zone 'Europe/Vienna')::date, 'IYYY-"W"IW');
  v_authorization jsonb;
  v_claim jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    return jsonb_build_object('ok',false,'status','not_authorized');
  end if;

  v_authorization := public.kd_entdecken_weekly_recovery_authorize(v_iso_week);
  if coalesce((v_authorization->>'ok')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'status','not_authorized');
  end if;

  v_claim := public.kd_entdecken_daily_claim();
  if coalesce((v_claim->>'refresh')::boolean,false) is not true then
    raise exception using
      errcode = 'P0001',
      message = 'entdecken-weekly-recovery-claim-rejected';
  end if;
  return v_claim || jsonb_build_object('recovery',true);
end
$$;

revoke all on function public.kd_entdecken_daily_recovery_claim()
  from public, anon, authenticated;
grant execute on function public.kd_entdecken_daily_recovery_claim()
  to service_role;

comment on function public.kd_entdecken_daily_recovery_claim() is
  'Service-role-only, atomarer Einzel-Recoveryclaim nach bestehendem Wochen-Cooldown; Freigabe und Claim sind nicht getrennt sichtbar.';

commit;
