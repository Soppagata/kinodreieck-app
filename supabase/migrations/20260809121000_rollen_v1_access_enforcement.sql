-- Kinodreieck · Rollen-v1 · fachliche Access-Durchsetzung
-- ============================================================================
-- Phase 1: lokal vorbereitet, noch NICHT remote angewandt.
--
-- HARTES VOR-GATE FUER DEN SPAETEREN REMOTE-LAUF:
--   1. ai_aktiv=false setzen und unabhaengig ruecklesen;
--   2. 20260809120000 einzeln anwenden;
--   3. alle bestaetigten bestehenden Konten ueber service_role bootstrappen
--      und accountweise ruecklesen;
--   4. erst dann diese Datei einzeln anwenden.
--
-- Ohne Bootstrap sperrt diese Migration alle fachlich geschuetzten Kontopfade.
-- Bei einem Fehler nicht auf auth-only zurueckoeffnen: KI bleibt aus und der
-- Vertrag wird fail-closed vorwaerts repariert. Keine Zeile wird geloescht.
-- Oeffentliche Demo-/Shared-Policies und der tokenfreie Legacy-kd_store-
-- Datenvertrag bleiben erhalten. Zu breite alte Browser-GRANTs werden unten
-- ohne active-Umdeutung auf den tatsaechlich benoetigten Vertrag verengt.
-- Remote ausschliesslich als einzelne Datei anwenden. Kein unqualifiziertes
-- `supabase db push`: Der folgende Preflight muss den Bootstrap bestaetigen.
-- ============================================================================

begin;

lock table auth.users in share mode;
lock table public.kd_account_access in share mode;

/* Letzter transaktionaler Boden gegen einen versehentlichen gemeinsamen Lauf:
   Die KI muss bereits nachweislich aus sein und jedes zu diesem Zeitpunkt
   vorhandene Auth-Konto braucht exakt eine Access-Zeile. PK und FK sichern
   hoechstens-eins sowie keine verwaisten Access-Zeilen; der Join belegt
   mindestens-eins fuer jedes Auth-Konto. Jede Abweichung passiert vor der
   ersten Policy-Aenderung und rollt die ganze Datei zurueck. */
do $$
declare
  v_ai_aktiv boolean;
  v_auth_accounts bigint;
  v_access_rows bigint;
begin
  select case
           when jsonb_typeof(wert) = 'boolean' then (wert #>> '{}')::boolean
           else null
         end
    into v_ai_aktiv
    from public.kd_ai_limits
   where schluessel = 'ai_aktiv'
   for update;

  if v_ai_aktiv is distinct from false then
    raise exception 'rollen_v1_preflight_ai_aktiv_muss_false_sein'
      using errcode = '55000';
  end if;

  select count(*) into v_auth_accounts from auth.users;
  select count(*) into v_access_rows from public.kd_account_access;

  if v_access_rows <> v_auth_accounts or exists (
    select 1
      from auth.users as u
      left join public.kd_account_access as a on a.account_id = u.id
     where a.account_id is null
  ) then
    raise exception
      'rollen_v1_preflight_bootstrap_unvollstaendig: auth_accounts=%, access_rows=%',
      v_auth_accounts, v_access_rows
      using errcode = '55000';
  end if;
end
$$;

-- Persoenlicher Sync-Speicher: eigene Account-ID UND active=true.
drop policy if exists kdp_sel on public.kd_personal;
create policy kdp_sel on public.kd_personal for select to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdp_ins on public.kd_personal;
create policy kdp_ins on public.kd_personal for insert to authenticated
  with check (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdp_upd on public.kd_personal;
create policy kdp_upd on public.kd_personal for update to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  )
  with check (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdp_del on public.kd_personal;
create policy kdp_del on public.kd_personal for delete to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

-- Ausdruecklich beobachtete Serien-IDs: keine neue Beobachtungs- oder
-- Geschmacksregel, nur dieselbe fachliche Zugriffssperre wie kd_personal.
drop policy if exists kdsw_sel on public.kd_series_watch;
create policy kdsw_sel on public.kd_series_watch for select to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdsw_ins on public.kd_series_watch;
create policy kdsw_ins on public.kd_series_watch for insert to authenticated
  with check (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdsw_upd on public.kd_series_watch;
create policy kdsw_upd on public.kd_series_watch for update to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  )
  with check (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdsw_del on public.kd_series_watch;
create policy kdsw_del on public.kd_series_watch for delete to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

create or replace function public.kd_set_series_watch(p_watchmode_ids bigint[])
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_account uuid := auth.uid();
  v_ids bigint[] := coalesce(p_watchmode_ids, array[]::bigint[]);
begin
  if v_account is null then
    raise exception 'Anmeldung erforderlich' using errcode = '42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if cardinality(v_ids) > 200 or exists (
    select 1 from unnest(v_ids) as id where id is null or id <= 0
  ) then
    raise exception 'Ungueltige Serien-Beobachtungsliste' using errcode = '22023';
  end if;

  delete from public.kd_series_watch where account_id = v_account;
  insert into public.kd_series_watch (account_id, watchmode_id, active, updated_at)
  select v_account, id, true, now()
    from (select distinct unnest(v_ids) as id) ids
   on conflict (account_id, watchmode_id) do update
     set active = true, updated_at = excluded.updated_at;
end;
$$;

-- Eigene Shared-Publish-Projektionen: public list bleibt unten unangetastet.
drop policy if exists kdsa_owner_select on public.kd_shared_articles;
create policy kdsa_owner_select on public.kd_shared_articles
  for select to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdsa_owner_insert on public.kd_shared_articles;
create policy kdsa_owner_insert on public.kd_shared_articles
  for insert to authenticated
  with check (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdsa_owner_update on public.kd_shared_articles;
create policy kdsa_owner_update on public.kd_shared_articles
  for update to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  )
  with check (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

drop policy if exists kdsa_owner_delete on public.kd_shared_articles;
create policy kdsa_owner_delete on public.kd_shared_articles
  for delete to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

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
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
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

-- Eigenes KI-Log ist nur fuer aktive Konten lesbar. Schreiben bleibt service-only.
drop policy if exists kdai_log_sel on public.kd_ai_log;
create policy kdai_log_sel on public.kd_ai_log for select to authenticated
  using (
    account_id = (select auth.uid())
    and (select public.kd_account_active())
  );

-- Live-Katalog/Quellen nur aktiv; oeffentliche Demo-Policy bleibt unveraendert.
drop policy if exists kd_catalog_read_konto on public.kd_catalog;
create policy kd_catalog_read_konto on public.kd_catalog
  for select to authenticated
  using ((select public.kd_account_active()));

drop policy if exists kd_quellen_read_konto on public.kd_quellen;
create policy kd_quellen_read_konto on public.kd_quellen
  for select to authenticated
  using ((select public.kd_account_active()));

-- SECURITY-DEFINER-Lesegrenze: Check vor Kennungsvalidierung und Datenzugriff.
create or replace function public.kd_filmwissen_aktuell_lesen(
  p_namespace text,
  p_kennung text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_namespace text := lower(trim(coalesce(p_namespace, '')));
  v_kennung text := public.kd_filmwissen_kennung_norm(
    lower(trim(coalesce(p_namespace, ''))),
    p_kennung
  );
  v_werk public.kd_filmwerke%rowtype;
  v_version public.kd_filmwissen_versionen%rowtype;
  v_fundstellen jsonb;
begin
  if auth.uid() is null then
    raise exception 'anmeldung_noetig' using errcode = '42501';
  end if;
  if not public.kd_account_active() then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if v_kennung is null then
    raise exception 'kennung_ungueltig' using errcode = '22023';
  end if;

  select w.* into v_werk
    from public.kd_filmwerk_kennungen k
    join public.kd_filmwerke w on w.id = k.werk_id
   where k.namespace = v_namespace
     and k.kennung = v_kennung
     and k.status = 'geprueft'
     and w.identitaetsstatus = 'geprueft';

  if not found or v_werk.aktuelle_version_id is null then
    return jsonb_build_object('format','filmwissen-cache-v1','status','cache_miss');
  end if;

  select * into v_version
    from public.kd_filmwissen_versionen
   where id = v_werk.aktuelle_version_id
     and werk_id = v_werk.id;
  if not found then
    return jsonb_build_object('format','filmwissen-cache-v1','status','cache_miss');
  end if;

  if exists (
    select 1
      from public.kd_filmwissen_belege b
      left join public.kd_filmwissen_quellen q on q.slug = b.quelle_slug
     where b.version_id = v_version.id
       and (
         q.slug is null
         or q.status <> 'freigegeben'
         or not q.cache_erlaubt
         or not q.paraphrase_erlaubt
         or not q.anzeige_erlaubt
         or (q.gueltig_bis is not null and q.gueltig_bis < current_date)
         or lower(substring(b.url from '^https://([^/:?#]+)')) is null
         or (
           lower(substring(b.url from '^https://([^/:?#]+)')) <> q.domain
           and not (
             q.subdomains_erlaubt
             and lower(substring(b.url from '^https://([^/:?#]+)')) like '%.' || q.domain
           )
         )
       )
  ) then
    return jsonb_build_object('format','filmwissen-cache-v1','status','gesperrt');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'quelle', b.quelle_slug,
      'domain', q.domain,
      'titel', b.seitentitel,
      'url', b.url,
      'veroeffentlichtAm', b.veroeffentlicht_at,
      'abgerufenAm', b.abgerufen_at,
      'attribution', b.attribution_snapshot,
      'kernaussagen', b.kernaussagen
    ) order by b.quelle_slug), '[]'::jsonb)
    into v_fundstellen
    from public.kd_filmwissen_belege b
    join public.kd_filmwissen_quellen q on q.slug = b.quelle_slug
   where b.version_id = v_version.id;

  return jsonb_build_object(
    'format', 'filmwissen-cache-v1',
    'status', case when v_version.warum is null then 'nicht_belegt' else 'belegt' end,
    'werk', jsonb_build_object(
      'id', v_werk.id,
      'typ', v_werk.typ,
      'titel', v_werk.titel,
      'originaltitel', v_werk.originaltitel,
      'jahr', v_werk.jahr
    ),
    'version', jsonb_build_object(
      'id', v_version.id,
      'nr', v_version.version_nr,
      'schemaVersion', v_version.schema_version,
      'rubrikVersion', v_version.rubrik_version,
      'stand', v_version.erstellt_at
    ),
    'warum', jsonb_build_object(
      'wert', v_version.warum,
      'sicherheit', v_version.sicherheit,
      'kurztext', v_version.kurztext
    ),
    'fundstellen', v_fundstellen
  );
end
$$;

/* RLS schuetzt DML, aber nicht TRUNCATE/MAINTAIN. Die bereits bestaetigten
   Browservertraege werden deshalb auf die wirklich benoetigten Rechte
   verengt; service_role-Rechte bleiben bestehen. */
revoke all on table public.kd_personal from public, anon, authenticated;
grant select, insert, update, delete on table public.kd_personal to authenticated;

revoke all on table public.kd_series_watch from public, anon, authenticated;
grant select, insert, update, delete on table public.kd_series_watch to authenticated;

revoke all on table public.kd_shared_articles from public, anon, authenticated;
grant select, insert, update, delete on table public.kd_shared_articles to authenticated;

revoke all on table public.kd_ai_log from public, anon, authenticated;
grant select on table public.kd_ai_log to authenticated;
revoke all on sequence public.kd_ai_log_id_seq from public, anon, authenticated;

revoke all on table public.kd_catalog from public, anon, authenticated;
grant select on table public.kd_catalog to anon, authenticated;

revoke all on table public.kd_quellen from public, anon, authenticated;
grant select on table public.kd_quellen to authenticated;

/* Legacy bleibt ein eigener, tokenfreier Vertrag und bekommt KEIN active-Gate.
   Die vorhandenen Policies autorisieren ausschliesslich anon und binden
   scope=user ueber kd_key_ok(owner) an den x-kd-key-Header. Deshalb braucht
   der Altclient genau SELECT/INSERT/UPDATE/DELETE auf kd_store, aber weder
   TRUNCATE noch MAINTAIN. Eine authenticated-Sitzung soll diese anon-Policies
   weiterhin nicht erben. kd_owner bleibt direkt vollstaendig browsergesperrt;
   die schmale SECURITY-DEFINER-Grenze kd_key_ok darf fuer anon lesen. */
revoke all on table public.kd_store from public, anon, authenticated;
grant select, insert, update, delete on table public.kd_store to anon;
grant all on table public.kd_store to service_role;

revoke all on table public.kd_owner from public, anon, authenticated;
grant all on table public.kd_owner to service_role;

revoke all on function public.kd_key_ok(text)
  from public, anon, authenticated;
grant execute on function public.kd_key_ok(text)
  to anon, service_role;

/* Default-EXECUTE nach CREATE OR REPLACE ebenfalls wieder auf den bestaetigten
   Vertrag begrenzen. Oeffentliche kd_list_shared_articles() bleibt unberuehrt. */
revoke all on function public.kd_set_series_watch(bigint[])
  from public, anon, authenticated;
grant execute on function public.kd_set_series_watch(bigint[])
  to authenticated, service_role;

revoke all on function public.kd_claim_shared_article(uuid)
  from public, anon, authenticated;
grant execute on function public.kd_claim_shared_article(uuid)
  to authenticated, service_role;

revoke all on function public.kd_filmwissen_aktuell_lesen(text, text)
  from public, anon, authenticated;
grant execute on function public.kd_filmwissen_aktuell_lesen(text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
