begin;

alter function public.kd_check_radar_event_pointers()
  security definer;
alter function public.kd_check_radar_event_pointers()
  set search_path = pg_catalog, public;

alter function public.kd_check_radar_confirmed_version_pointer()
  security definer;
alter function public.kd_check_radar_confirmed_version_pointer()
  set search_path = pg_catalog, public;

commit;
