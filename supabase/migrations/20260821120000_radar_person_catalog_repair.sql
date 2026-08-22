-- Kinodreieck · Personenradar-Katalog Forwardrepair 4/5 -> 5/5
-- =============================================================================
-- Additive Reparatur ausschliesslich fuer die fuenf bereits in 20260819220000
-- kuratierten globalen Person+Rolle-Ziele. Historische Migrationen werden nie
-- erneut angewandt. Abos, Ereignisse, Kontofaehigkeiten, Rollen und Betriebs-
-- flags bleiben unberuehrt. Ein unbekannter oder widerspruechlicher Ausgangs-
-- stand stoppt die gesamte Transaktion fail-closed.
-- =============================================================================

begin;

do $repair$
declare
  v_expected constant jsonb := $expected$[
    {
      "targetKey":"person:wikidata:Q42869:actor",
      "personExternalId":"wikidata:Q42869",
      "role":"actor",
      "name":"Nicolas Cage",
      "workTargetKey":"catalog:dream-scenario-2023",
      "workTitle":"Dream Scenario",
      "workYear":2023
    },
    {
      "targetKey":"person:wikidata:Q47284:director",
      "personExternalId":"wikidata:Q47284",
      "role":"director",
      "name":"Robert Rodriguez",
      "workTargetKey":"catalog:sin-city-2005",
      "workTitle":"Sin City",
      "workYear":2005
    },
    {
      "targetKey":"person:wikidata:Q271967:actor",
      "personExternalId":"wikidata:Q271967",
      "role":"actor",
      "name":"Greta Gerwig",
      "workTargetKey":"catalog:frances-ha-2012",
      "workTitle":"Frances Ha",
      "workYear":2012
    },
    {
      "targetKey":"person:wikidata:Q271967:director",
      "personExternalId":"wikidata:Q271967",
      "role":"director",
      "name":"Greta Gerwig",
      "workTargetKey":"catalog:barbie-2023",
      "workTitle":"Barbie",
      "workYear":2023
    },
    {
      "targetKey":"person:wikidata:Q7374:director",
      "personExternalId":"wikidata:Q7374",
      "role":"director",
      "name":"Alfred Hitchcock",
      "workTargetKey":"catalog:psycho-1960",
      "workTitle":"Psycho",
      "workYear":1960
    }
  ]$expected$::jsonb;
  v_work_count integer;
  v_present_count integer;
  v_exact_count integer;
  v_inserted integer;
begin
  if to_regclass('public.kd_radar_targets') is null
     or to_regprocedure(
       'public.kd_radar_person_target_metadata_valid(text,text,jsonb)'
     ) is null then
    raise exception 'radar_person_catalog_contract_missing';
  end if;

  if jsonb_array_length(v_expected) <> 5
     or exists (
       select 1
       from jsonb_array_elements(v_expected) item
       where item ->> 'personExternalId' !~ '^wikidata:Q[1-9][0-9]{0,15}$'
          or item ->> 'role' not in ('actor','director')
          or item ->> 'targetKey' is distinct from
            'person:' || (item ->> 'personExternalId') || ':' || (item ->> 'role')
     ) then
    raise exception 'radar_person_catalog_expected_contract_invalid';
  end if;

  lock table public.kd_radar_targets in share row exclusive mode;

  select count(*) into v_work_count
  from jsonb_array_elements(v_expected) item
  join public.kd_radar_targets target
    on target.target_key = item ->> 'workTargetKey'
   and target.target_type = 'work'
   and target.target_status = 'active'
   and target.canonical_title = item ->> 'workTitle'
   and target.external_ids ->> 'catalogId' = item ->> 'workTargetKey'
   and target.external_ids ->> 'releaseYear' = item ->> 'workYear';

  if v_work_count <> 5 then
    raise exception 'radar_person_catalog_work_seed_drift';
  end if;

  select
    count(target.target_id),
    count(target.target_id) filter (where
      target.target_type = 'person'
      and target.target_status = 'active'
      and target.canonical_title = item ->> 'name'
      and target.external_ids = jsonb_build_object(
        'personExternalId', item ->> 'personExternalId',
        'personRole', item ->> 'role',
        'catalog', jsonb_build_array(jsonb_build_object(
          'targetId', item ->> 'workTargetKey',
          'targetType', 'work',
          'title', item ->> 'workTitle',
          'year', (item ->> 'workYear')::integer
        ))
      )
      and public.kd_radar_person_target_metadata_valid(
        target.target_key, target.canonical_title, target.external_ids
      )
    )
    into v_present_count, v_exact_count
  from jsonb_array_elements(v_expected) item
  left join public.kd_radar_targets target
    on target.target_key = item ->> 'targetKey';

  if v_present_count <> v_exact_count then
    raise exception 'radar_person_catalog_person_seed_drift';
  end if;
  if v_present_count not in (4, 5) then
    raise exception 'radar_person_catalog_baseline_count_drift';
  end if;

  insert into public.kd_radar_targets (
    target_key, target_type, target_status, canonical_title, external_ids
  )
  select
    item ->> 'targetKey',
    'person',
    'active',
    item ->> 'name',
    jsonb_build_object(
      'personExternalId', item ->> 'personExternalId',
      'personRole', item ->> 'role',
      'catalog', jsonb_build_array(jsonb_build_object(
        'targetId', item ->> 'workTargetKey',
        'targetType', 'work',
        'title', item ->> 'workTitle',
        'year', (item ->> 'workYear')::integer
      ))
    )
  from jsonb_array_elements(v_expected) item
  on conflict (target_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted <> 5 - v_present_count then
    raise exception 'radar_person_catalog_repair_write_drift';
  end if;

  select count(*) into v_exact_count
  from jsonb_array_elements(v_expected) item
  join public.kd_radar_targets target
    on target.target_key = item ->> 'targetKey'
   and target.target_type = 'person'
   and target.target_status = 'active'
   and target.canonical_title = item ->> 'name'
   and target.external_ids = jsonb_build_object(
     'personExternalId', item ->> 'personExternalId',
     'personRole', item ->> 'role',
     'catalog', jsonb_build_array(jsonb_build_object(
       'targetId', item ->> 'workTargetKey',
       'targetType', 'work',
       'title', item ->> 'workTitle',
       'year', (item ->> 'workYear')::integer
     ))
   )
   and public.kd_radar_person_target_metadata_valid(
     target.target_key, target.canonical_title, target.external_ids
   );

  if v_exact_count <> 5 then
    raise exception 'radar_person_catalog_repair_postcondition';
  end if;
end
$repair$;

commit;
