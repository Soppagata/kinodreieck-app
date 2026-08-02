-- Kinodreieck · einmalige Blog-Übernahme pro Konto
-- ============================================================================
-- Jede veröffentlichte Blog-Projektion besitzt einen unveränderlichen,
-- zufälligen Upload-Token. Ein Konto kann diesen Token genau einmal claimen.
-- Die Einmaligkeit liegt absichtlich in der Datenbank: zwei Browser oder zwei
-- gleichzeitige Klicks können die Regel dadurch nicht umgehen.
--
-- Ausgeführt: 2026-08-02  Projekt: bscjgwcntapobyxsiyce
-- von: Codex über die verknüpfte Management-API; danach npm run test:rls
-- 67/67 grün (inklusive Autor-Sperre und exakt-einmal-Claim mit zwei Konten).

alter table public.kd_shared_articles
  add column if not exists share_token uuid;

update public.kd_shared_articles
set share_token = gen_random_uuid()
where share_token is null;

alter table public.kd_shared_articles
  alter column share_token set default gen_random_uuid(),
  alter column share_token set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kd_shared_articles_share_token_key'
      and conrelid = 'public.kd_shared_articles'::regclass
  ) then
    alter table public.kd_shared_articles
      add constraint kd_shared_articles_share_token_key unique (share_token);
  end if;
end
$$;

comment on column public.kd_shared_articles.share_token is
  'Unveraenderlicher, oeffentlicher Upload-Token einer Blog-Projektion.';

/* Auch ein manipuliertes Update darf keinen neuen Token für dieselbe
   Projektion erzeugen. Erst Löschen + erneutes Veröffentlichen ist ein neuer
   Upload und erhält durch den Default einen neuen Token. */
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
    new.share_token := gen_random_uuid();
    new.published_at := now();
  else
    new.account_id := old.account_id;
    new.publication_id := old.publication_id;
    new.share_token := old.share_token;
    new.article_id := old.article_id;
    new.published_at := old.published_at;
  end if;
  new.updated_at := now();
  return new;
end
$$;

revoke all on function public.kd_shared_article_touch() from public;

create table if not exists public.kd_shared_article_claims (
  account_id  uuid        not null references auth.users(id) on delete cascade,
  share_token uuid        not null references public.kd_shared_articles(share_token) on delete cascade,
  claimed_at  timestamptz not null default now(),
  primary key (account_id, share_token)
);

comment on table public.kd_shared_article_claims is
  'Serverseitige Einmal-Sperre: ein Account kann jeden Blog-Upload-Token nur einmal uebernehmen.';

alter table public.kd_shared_article_claims enable row level security;
revoke all on table public.kd_shared_article_claims from public, anon, authenticated;

/* Der veröffentlichende Account besitzt seinen eigenen Blog bereits. Deshalb
   wird der Token beim bestehenden Bestand und bei jedem neuen INSERT sofort
   als verbraucht markiert. */
insert into public.kd_shared_article_claims (account_id, share_token, claimed_at)
select account_id, share_token, published_at
from public.kd_shared_articles
on conflict (account_id, share_token) do nothing;

create or replace function public.kd_seed_shared_article_owner_claim() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.kd_shared_article_claims (account_id, share_token)
  values (new.account_id, new.share_token)
  on conflict (account_id, share_token) do nothing;
  return new;
end
$$;

revoke all on function public.kd_seed_shared_article_owner_claim() from public, anon, authenticated;

drop trigger if exists kd_shared_article_owner_claim_trg on public.kd_shared_articles;
create trigger kd_shared_article_owner_claim_trg
  after insert on public.kd_shared_articles
  for each row execute function public.kd_seed_shared_article_owner_claim();

/* Die öffentliche Liste enthält keine Account-ID. Der zufällige Token ist die
   einzige Kennung, die ein angemeldetes Konto an die atomare Claim-RPC sendet. */
drop function if exists public.kd_list_shared_articles();
create function public.kd_list_shared_articles()
returns table (
  publication_id uuid,
  share_token uuid,
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
    s.share_token,
    s.article_id,
    s.author,
    s.payload,
    s.updated_at
  from public.kd_shared_articles as s
  order by s.updated_at desc, s.publication_id
$$;

revoke all on function public.kd_list_shared_articles() from public;
grant execute on function public.kd_list_shared_articles() to anon, authenticated;

create or replace function public.kd_claim_shared_article(p_share_token uuid)
returns table (
  publication_id uuid,
  share_token uuid,
  article_id text,
  author text,
  payload jsonb,
  updated_at timestamptz,
  claimed boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid := auth.uid();
  v_claimed boolean := false;
begin
  if v_account_id is null then
    raise exception 'authenticated account required' using errcode = '42501';
  end if;
  if p_share_token is null then
    raise exception 'share token required' using errcode = '22023';
  end if;

  insert into public.kd_shared_article_claims (account_id, share_token)
  select v_account_id, s.share_token
  from public.kd_shared_articles as s
  where s.share_token = p_share_token
  on conflict on constraint kd_shared_article_claims_pkey do nothing
  returning true into v_claimed;

  return query
  select
    s.publication_id,
    s.share_token,
    s.article_id,
    s.author,
    s.payload,
    s.updated_at,
    coalesce(v_claimed, false)
  from public.kd_shared_articles as s
  where s.share_token = p_share_token;
end
$$;

revoke all on function public.kd_claim_shared_article(uuid) from public, anon;
grant execute on function public.kd_claim_shared_article(uuid) to authenticated;

notify pgrst, 'reload schema';
