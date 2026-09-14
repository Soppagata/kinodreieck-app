-- Kinodreieck · kontogebundene Entdecken-Titelpins
-- STATUS: NUR LOKAL VORBEREITET. NICHT REMOTE ANGEWANDT.

begin;

/* Der CHECK ist nicht erweiterbar. Deshalb wird der vollstaendige bestehende
   Vertrag wiederholt und ausschliesslich kd:entdecken-pins hinzugefuegt. */
alter table public.kd_personal
  drop constraint if exists kd_personal_key_erlaubt;
alter table public.kd_personal
  add constraint kd_personal_key_erlaubt
  check (key in (
    'kd:master', 'kd:artikel', 'kd:kino-pins', 'kd:entdecken-pins',
    'kd:wochenplan', 'kd:radar', 'kd:merkliste', 'kd:vokabular',
    'kd:einstellungen', 'kd:entdecken-status', 'kd:autor-name',
    'kd:streaming-dienste', 'kd:mustwatch', 'kd:achievements',
    'kd:zeitgrenze', 'kd:filter-mediathek', 'kd:filter-kino',
    'kd:filter-streaming', 'kd:geschmacksprofil'
  ));
comment on constraint kd_personal_key_erlaubt on public.kd_personal is
  'Erlaubte persoenliche Toepfe (19, inklusive kontogebundener Titel-Pins).';

-- Gegenprobe nach dem spaeter getrennt freigegebenen Remote-Lauf:
-- insert into public.kd_personal(key,value) values ('kd:boeser-topf','[]');
-- Erwartung: SQLSTATE 23514 durch kd_personal_key_erlaubt.

notify pgrst, 'reload schema';

commit;
