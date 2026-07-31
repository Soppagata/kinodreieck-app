-- Kinodreieck · Architektur-Cleanup · accountgebundene Shared Blogs
-- ============================================================================
-- Eigenschaften:
--  * Der private Quellartikel bleibt in kd_personal / `kd:artikel`.
--  * Diese Tabelle enthält ausschließlich die ausdrücklich veröffentlichte Kopie.
--  * account_id wird bei INSERT serverseitig auf auth.uid() gesetzt.
--  * Direkter Tabellenzugriff zeigt einem Account nur seine eigenen Projektionen.
--  * Die Öffentlichkeit liest ausschließlich die sichere RPC ohne account_id.
--  * article_id + account_id machen Publish-Retries idempotent.
--
-- Ausgeführt: 2026-07-31  Projekt: bscjgwcntapobyxsiyce
-- von: Codex über Management-API; danach npm run test:rls 60/60 grün
-- ============================================================================

create table if not exists public.kd_shared_articles (
  publication_id uuid        primary key default gen_random_uuid(),
  account_id     uuid        not null default auth.uid()
                               references auth.users(id) on delete cascade,
  article_id     text        not null,
  author         text        not null,
  payload        jsonb       not null,
  published_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (account_id, article_id)
);

comment on table public.kd_shared_articles is
  'Explizit veroeffentlichte Blog-Projektionen. Private Quelle bleibt in kd_personal; oeffentliche RPC verbirgt account_id.';

alter table public.kd_shared_articles
  drop constraint if exists kd_shared_article_id_valid;
alter table public.kd_shared_articles
  add constraint kd_shared_article_id_valid
  check (char_length(article_id) between 1 and 160);

alter table public.kd_shared_articles
  drop constraint if exists kd_shared_author_valid;
alter table public.kd_shared_articles
  add constraint kd_shared_author_valid
  check (char_length(author) between 1 and 120);

alter table public.kd_shared_articles
  drop constraint if exists kd_shared_payload_valid;
alter table public.kd_shared_articles
  add constraint kd_shared_payload_valid
  check (
    jsonb_typeof(payload) = 'object'
    and payload ? 'titel'
    and payload ? 'text'
    and octet_length(payload::text) <= 1048576
  );

/* Autor, öffentliche ID, Artikel-ID und Zeitstempel sind serverautoritativ.
   Der Client sendet account_id nie; selbst ein manipulierter Request wird hier
   auf die tatsächliche Sitzung zurückgesetzt und danach zusätzlich von RLS
   geprüft. */
create or replace function public.kd_shared_article_touch() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'authenticated account required' using errcode = '42501';
    end if;
    new.account_id := auth.uid();
    new.publication_id := coalesce(new.publication_id, gen_random_uuid());
    new.published_at := now();
  else
    new.account_id := old.account_id;
    new.publication_id := old.publication_id;
    new.article_id := old.article_id;
    new.published_at := old.published_at;
  end if;
  new.updated_at := now();
  return new;
end
$$;

revoke all on function public.kd_shared_article_touch() from public;

drop trigger if exists kd_shared_article_touch_trg on public.kd_shared_articles;
create trigger kd_shared_article_touch_trg
  before insert or update on public.kd_shared_articles
  for each row execute function public.kd_shared_article_touch();

alter table public.kd_shared_articles enable row level security;

drop policy if exists kdsa_owner_select on public.kd_shared_articles;
create policy kdsa_owner_select on public.kd_shared_articles
  for select to authenticated
  using (account_id = (select auth.uid()));

drop policy if exists kdsa_owner_insert on public.kd_shared_articles;
create policy kdsa_owner_insert on public.kd_shared_articles
  for insert to authenticated
  with check (account_id = (select auth.uid()));

drop policy if exists kdsa_owner_update on public.kd_shared_articles;
create policy kdsa_owner_update on public.kd_shared_articles
  for update to authenticated
  using      (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

drop policy if exists kdsa_owner_delete on public.kd_shared_articles;
create policy kdsa_owner_delete on public.kd_shared_articles
  for delete to authenticated
  using (account_id = (select auth.uid()));

revoke all on table public.kd_shared_articles from public, anon;
grant select, insert, update, delete on table public.kd_shared_articles to authenticated;

/* Öffentliche, absichtlich schmale Projektion. account_id ist weder Rückgabe-
   spalte noch Filterparameter. SECURITY DEFINER ist hier bewusst: anon besitzt
   keinerlei Tabellenrecht und kann ausschließlich diesen Vertrag ausführen. */
drop function if exists public.kd_list_shared_articles();
create function public.kd_list_shared_articles()
returns table (
  publication_id uuid,
  article_id text,
  author text,
  payload jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    s.publication_id,
    s.article_id,
    s.author,
    s.payload,
    s.updated_at
  from public.kd_shared_articles as s
  order by s.updated_at desc, s.publication_id
$$;

revoke all on function public.kd_list_shared_articles() from public;
grant execute on function public.kd_list_shared_articles() to anon, authenticated;

notify pgrst, 'reload schema';
