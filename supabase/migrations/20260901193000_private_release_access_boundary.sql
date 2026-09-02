-- Kinodreieck · Privatrelease · oeffentliche Datenwege schliessen
-- ============================================================================
-- Lokal vorbereitet, NICHT remote angewandt. Die Migration veraendert keine
-- Nutzdaten. Sie entfernt ausschliesslich historische anonyme Lese-/Legacy-
-- Rechte; aktive Konten behalten die vorhandenen RLS-gebundenen Datenwege.
-- Remote nur als einzeln autorisierte Migration mit Readback ausfuehren.
-- ============================================================================

begin;

/* Katalog: Auch Manifest und alte Demozeilen sind im Privatrelease nicht mehr
   oeffentlich. Der bestehende Konto-Policyvertrag bleibt unveraendert und
   fragt fail-closed public.kd_account_active() ab. */
drop policy if exists kd_catalog_read_public on public.kd_catalog;
revoke all on table public.kd_catalog from public, anon, authenticated;
grant select on table public.kd_catalog to authenticated;
grant all on table public.kd_catalog to service_role;

/* Tokenfreier Altvertrag kd_store: alte Gast-/Demo-/Shared-Clients duerfen die
   private Sperre nicht ueber einen historischen Header-Key umgehen. */
drop policy if exists sel_demo on public.kd_store;
drop policy if exists sel_shared on public.kd_store;
drop policy if exists sel_user on public.kd_store;
drop policy if exists ins_shared on public.kd_store;
drop policy if exists ins_user on public.kd_store;
drop policy if exists upd_shared on public.kd_store;
drop policy if exists upd_user on public.kd_store;
drop policy if exists del_shared on public.kd_store;
drop policy if exists del_user on public.kd_store;
revoke all on table public.kd_store from public, anon, authenticated;
grant all on table public.kd_store to service_role;
revoke all on function public.kd_key_ok(text) from public, anon, authenticated;
grant execute on function public.kd_key_ok(text) to service_role;

/* Sharing bleibt fuer aktive Konten inhaltlich gleich, ist aber nicht mehr
   anonym auflistbar. Fehlende, inaktive oder unlesbare Rechte enden vor dem
   ersten Artikelzugriff. */
create or replace function public.kd_list_shared_articles()
returns table (
  publication_id uuid,
  share_token uuid,
  article_id text,
  author text,
  payload jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'authenticated account required' using errcode = '42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  return query
  select
    s.publication_id,
    s.share_token,
    s.article_id,
    s.author,
    s.payload,
    s.updated_at
  from public.kd_shared_articles as s
  order by s.updated_at desc, s.publication_id;
end
$$;

revoke all on function public.kd_list_shared_articles()
  from public, anon, authenticated;
grant execute on function public.kd_list_shared_articles()
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
