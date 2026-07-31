-- Kinodreieck · Architektur-Cleanup · Legacy-Shared reversibel stilllegen
-- ============================================================================
-- Die alte Tabelle kd_store kann bereits öffentlich lesbare scope=shared-Zeilen
-- enthalten. Nur den App-Read umzuschalten würde diese Inhalte im Backend
-- öffentlich liegen lassen. Deshalb:
--   1. vollständige Kopie in eine nicht freigegebene Archivtabelle,
--   2. erst danach Löschung der erfolgreich archivierten öffentlichen Zeilen,
--   3. Trigger blockiert neue Legacy-Publikationen alter Clients.
--
-- Die Inhalte bleiben für eine kontrollierte manuelle Wiederherstellung
-- erhalten; es wird keine Legacy-owner-Zeile heuristisch einem Authkonto
-- zugeordnet.
--
-- Ausgeführt: 2026-07-31  Projekt: bscjgwcntapobyxsiyce
-- von: Codex über Management-API; vor dem Lauf 0 scope=shared-Zeilen,
-- danach Archiv 0 / Legacy aktiv 0 / Schreibblock verifiziert
-- ============================================================================

create table if not exists public.kd_legacy_shared_archive (
  owner       text        not null,
  key         text        not null,
  value       text        not null,
  author      text,
  updated_at  timestamptz,
  archived_at timestamptz not null default now(),
  primary key (owner, key)
);

comment on table public.kd_legacy_shared_archive is
  'Rueckholbares, nicht oeffentliches Archiv der ehemaligen kd_store scope=shared-Zeilen.';

revoke all on table public.kd_legacy_shared_archive from public, anon, authenticated;

do $$
begin
  if to_regclass('public.kd_store') is not null then
    execute $sql$
      insert into public.kd_legacy_shared_archive
        (owner, key, value, author, updated_at)
      select owner, key, value, author, updated_at
      from public.kd_store
      where scope = 'shared'
      on conflict (owner, key) do update
      set value = excluded.value,
          author = excluded.author,
          updated_at = excluded.updated_at,
          archived_at = now()
    $sql$;

    execute $sql$
      delete from public.kd_store as s
      using public.kd_legacy_shared_archive as a
      where s.scope = 'shared'
        and s.owner = a.owner
        and s.key = a.key
    $sql$;
  end if;
end
$$;

/* Alte App-Versionen dürfen keine scope=shared-Zeile neu anlegen. Andere
   kd_store-Bereiche bleiben vollständig unangetastet. */
create or replace function public.kd_block_legacy_shared_write() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.scope = 'shared' then
    raise exception 'legacy shared publications are retired'
      using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function public.kd_block_legacy_shared_write() from public;

do $$
begin
  if to_regclass('public.kd_store') is not null then
    execute 'drop trigger if exists kd_block_legacy_shared_write_trg on public.kd_store';
    execute $sql$
      create trigger kd_block_legacy_shared_write_trg
      before insert or update on public.kd_store
      for each row execute function public.kd_block_legacy_shared_write()
    $sql$;
  end if;
end
$$;

notify pgrst, 'reload schema';
