-- Kinodreieck · Architektur-Cleanup · Streaming-Katalog wirklich lazy laden
-- ============================================================================
-- Die bisherigen Zeilen `streaming` und `streaming_demo` enthalten sowohl den
-- kleinen Bestandsteil `bekannt` als auch den großen Entdecken-Katalog. Neue
-- Clients lesen getrennte Zeilen. Ein Trigger hält sie aus den bisherigen
-- kombinierten Pipeline-Writes aktuell, damit kein paralleler Publisher nötig
-- wird und bereits ausgelieferte Clients unverändert weiterarbeiten.
--
-- Rückbau ist verlustfrei: Trigger entfernen und die vier neuen Zeilen löschen;
-- die bisherigen kombinierten Zeilen bleiben während der Übergangszeit bestehen.

alter table public.kd_catalog
  drop constraint if exists kd_catalog_name_check;
alter table public.kd_catalog
  add constraint kd_catalog_name_check
  check (name in (
    'manifest', 'programm', 'streaming',
    'programm_demo', 'streaming_demo', 'demo_seed',
    'streaming_bekannt', 'streaming_entdecken',
    'streaming_bekannt_demo', 'streaming_entdecken_demo'
  ));

create or replace function public.kd_catalog_eintraege(
  p_name text,
  p_payload jsonb
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_name like 'programm%' then
      coalesce(p_payload -> 'filme', p_payload -> 'data' -> 'filme', '[]'::jsonb)
    when p_name like 'streaming_bekannt%'
      or p_name like 'streaming_entdecken%' then
      coalesce(p_payload -> 'titel', '[]'::jsonb)
    when p_name like 'streaming%' then
      coalesce(p_payload -> 'bekannt' -> 'titel', '[]'::jsonb)
      || coalesce(p_payload -> 'entdecken' -> 'titel', '[]'::jsonb)
    else '[]'::jsonb
  end
$$;

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
    'programm', 'streaming', 'programm_demo', 'streaming_demo', 'demo_seed',
    'streaming_bekannt', 'streaming_entdecken',
    'streaming_bekannt_demo', 'streaming_entdecken_demo'
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

  if new.name like 'streaming_bekannt%'
    or new.name like 'streaming_entdecken%' then
    if jsonb_typeof(new.payload) <> 'object'
      or jsonb_typeof(new.payload -> 'titel') <> 'array' then
      raise exception 'Zeile %: payload.titel[] ist Pflicht.', new.name;
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

create or replace function public.kd_catalog_streaming_aufteilen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bekannt_name   text;
  entdecken_name text;
begin
  if tg_op = 'DELETE' then
    if old.name not in ('streaming', 'streaming_demo') then
      return old;
    end if;
    bekannt_name := case old.name
      when 'streaming' then 'streaming_bekannt'
      else 'streaming_bekannt_demo'
    end;
    entdecken_name := case old.name
      when 'streaming' then 'streaming_entdecken'
      else 'streaming_entdecken_demo'
    end;
    delete from public.kd_catalog where name in (bekannt_name, entdecken_name);
    return old;
  end if;

  if new.name not in ('streaming', 'streaming_demo') then
    return new;
  end if;

  if jsonb_typeof(new.payload -> 'bekannt') <> 'object'
    or jsonb_typeof(new.payload -> 'bekannt' -> 'titel') <> 'array'
    or jsonb_typeof(new.payload -> 'entdecken') <> 'object'
    or jsonb_typeof(new.payload -> 'entdecken' -> 'titel') <> 'array' then
    raise exception 'Zeile %: bekannt.titel[] und entdecken.titel[] sind Pflicht.',
      new.name;
  end if;

  bekannt_name := case new.name
    when 'streaming' then 'streaming_bekannt'
    else 'streaming_bekannt_demo'
  end;
  entdecken_name := case new.name
    when 'streaming' then 'streaming_entdecken'
    else 'streaming_entdecken_demo'
  end;

  insert into public.kd_catalog
    (name, payload, sha256, updated_at, quelle, stand, gueltig_bis)
  values
    (bekannt_name, new.payload -> 'bekannt', new.sha256, new.updated_at,
      new.quelle, new.stand, new.gueltig_bis),
    (entdecken_name, new.payload -> 'entdecken', new.sha256, new.updated_at,
      new.quelle, new.stand, new.gueltig_bis)
  on conflict (name) do update
    set payload = excluded.payload,
        sha256 = excluded.sha256,
        updated_at = excluded.updated_at,
        quelle = excluded.quelle,
        stand = excluded.stand,
        gueltig_bis = excluded.gueltig_bis;

  return new;
end
$$;

drop trigger if exists kd_catalog_streaming_split on public.kd_catalog;
create trigger kd_catalog_streaming_split
  after insert or update or delete on public.kd_catalog
  for each row
  execute function public.kd_catalog_streaming_aufteilen();

/* Bestand initial aufteilen; spätere Pipeline-Writes laufen über den Trigger. */
update public.kd_catalog
   set updated_at = updated_at
 where name in ('streaming', 'streaming_demo');

drop policy if exists kd_catalog_read_public on public.kd_catalog;
create policy kd_catalog_read_public
  on public.kd_catalog for select
  to anon, authenticated
  using (name in (
    'manifest', 'programm_demo', 'streaming_demo', 'demo_seed',
    'streaming_bekannt_demo', 'streaming_entdecken_demo'
  ));

revoke execute on function public.kd_catalog_streaming_aufteilen()
  from public, anon, authenticated;
grant execute on function public.kd_catalog_streaming_aufteilen()
  to service_role;

notify pgrst, 'reload schema';
