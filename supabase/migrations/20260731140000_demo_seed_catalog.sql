-- Kinodreieck · Architektur-Cleanup · Demo-Seed in den Katalogvertrag
-- ============================================================================
-- Der kuratierte Demo-Bestand ist kein persönlicher Sync-Topf. Er liegt fortan
-- als ein validiertes Dokument `demo_seed` in kd_catalog:
--   * anon lesbar wie programm_demo / streaming_demo,
--   * mit Quelle und Stand,
--   * gleicher Vertrag für Online-PWA und lokale Beilage,
--   * keine Abhängigkeit des neuen Clients von kd_store.
--
-- Die bisherigen kd_store scope=demo-Zeilen bleiben vorläufig lesbar, damit
-- bereits ausgelieferte App-Versionen während des Übergangs weiter starten.
-- Archivierung/Löschung folgt erst nach einem bestätigten Client-Release.
--
-- Ausgeführt: 2026-07-31  Projekt: bscjgwcntapobyxsiyce
-- von: Codex über Management-API
-- ============================================================================

insert into public.kd_quellen
  (slug, betreiber, status, importart, weitergabe_erlaubt, payload_bereiche, notizen)
values
  (
    'kinodreieck_demo',
    'Kinodreieck',
    'intern_test',
    'Kuratiertes und vor der Veröffentlichung bereinigtes Demo-Dokument',
    true,
    array['demo_seed'],
    'Eigene Demo-Basis der App; keine Live-Programm- oder Streamingdaten. Darf im Downloadpaket als lokaler Seed mitgeliefert werden.'
  )
on conflict (slug) do nothing;

alter table public.kd_catalog
  drop constraint if exists kd_catalog_name_check;
alter table public.kd_catalog
  add constraint kd_catalog_name_check
  check (name in (
    'manifest', 'programm', 'streaming',
    'programm_demo', 'streaming_demo', 'demo_seed'
  ));

/* Aktuellen öffentlichen Demo-Bestand ohne Text-Roundtrip in das gemeinsame
   Dokument überführen. Ungültiges JSON oder ein fehlender Master bricht die
   Migration vor dem INSERT ab; kd_store bleibt dann unangetastet. */
do $$
declare
  b jsonb;
  p jsonb;
begin
  if to_regclass('public.kd_store') is null then
    raise exception 'kd_store fehlt; demo_seed kann nicht aus dem Bestand aufgebaut werden';
  end if;

  execute $sql$
    select jsonb_object_agg(key, value::jsonb)
      from public.kd_store
     where scope = 'demo'
  $sql$ into b;

  if b is null or not (b ? 'kd:master')
    or jsonb_typeof(b -> 'kd:master' -> 'filme') <> 'array' then
    raise exception 'Demo-Bestand ohne gueltiges kd:master.filme[]';
  end if;

  p := jsonb_build_object(
    'format', 1,
    'master', b -> 'kd:master',
    'mustwatch', coalesce(b -> 'kd:mustwatch', '{"eintraege":[]}'::jsonb),
    'streaming_dienste', coalesce(
      b -> 'kd:streaming-dienste',
      '{"quellen":[],"heuristik":true}'::jsonb
    ),
    'artikel', coalesce(b -> 'kd:artikel', '{"artikel":[]}'::jsonb),
    'kino_pins', coalesce(b -> 'kd:kino-pins', '[]'::jsonb),
    'merkliste', coalesce(b -> 'kd:merkliste', '[]'::jsonb)
  );

  insert into public.kd_catalog
    (name, payload, quelle, stand, gueltig_bis, updated_at)
  values
    ('demo_seed', p, 'kinodreieck_demo', now(), null, now())
  on conflict (name) do update
    set payload = excluded.payload,
        quelle = excluded.quelle,
        stand = excluded.stand,
        gueltig_bis = null,
        updated_at = now();
end
$$;

/* Aktuellen Guard aus 20260726120000 beibehalten und nur um demo_seed
   ergänzen. Der Seed braucht Herkunft und Stand, aber kein Ablaufdatum:
   Anders als Programmdaten behauptet er keine zeitliche Aktualität. */
create or replace function public.kd_catalog_quellen_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  q          public.kd_quellen%rowtype;
  verboten   text;
  braucht    boolean;
begin
  if tg_op = 'UPDATE' and new.quelle is null then
    new.quelle := old.quelle;
  end if;

  braucht := new.name in (
    'programm', 'streaming', 'programm_demo', 'streaming_demo', 'demo_seed'
  );

  if braucht and new.quelle is null then
    raise exception
      'Zeile %: ohne Herkunft wird nichts veroeffentlicht. Setze quelle auf einen Slug aus kd_quellen.',
      new.name;
  end if;

  if right(new.name, 5) = '_demo' then
    if new.stand is null or new.gueltig_bis is null then
      raise exception
        'Demo-Zeile %: stand und gueltig_bis sind Pflicht (ehrlicher Schnappschuss).',
        new.name;
    end if;
  end if;

  if new.name = 'demo_seed' then
    if new.stand is null
      or jsonb_typeof(new.payload) <> 'object'
      or new.payload ->> 'format' <> '1'
      or jsonb_typeof(new.payload -> 'master' -> 'filme') <> 'array'
      or octet_length(new.payload::text) > 2097152 then
      raise exception
        'demo_seed: Format 1, Stand und master.filme[] sind Pflicht; maximal 2 MiB';
    end if;
  end if;

  if new.quelle is not null then
    select * into q from public.kd_quellen where slug = new.quelle;
    if not found then
      raise exception 'Quelle % steht nicht im Register kd_quellen.', new.quelle;
    end if;
    if q.status in ('pausiert', 'widerrufen', 'abgelaufen') then
      raise exception 'Quelle % hat Status % — Veroeffentlichung gesperrt.', new.quelle, q.status;
    end if;

    if q.erlaubte_felder is not null then
      verboten := public.kd_catalog_verbotenes_feld(
        public.kd_catalog_eintraege(new.name, new.payload), q.erlaubte_felder);
      if verboten is not null then
        raise exception
          'Zeile %: Feld "%" ist fuer Quelle % nicht freigegeben (siehe kd_quellen.erlaubte_felder).',
          new.name, verboten, new.quelle;
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists kd_catalog_quellen_guard on public.kd_catalog;
create trigger kd_catalog_quellen_guard
  before insert or update on public.kd_catalog
  for each row execute function public.kd_catalog_quellen_guard();

drop policy if exists kd_catalog_read_public on public.kd_catalog;
create policy kd_catalog_read_public
  on public.kd_catalog for select
  to anon, authenticated
  using (name in ('manifest', 'programm_demo', 'streaming_demo', 'demo_seed'));

notify pgrst, 'reload schema';
