-- ===========================================================================
-- Etappe 8, Block 2 — gemeinsamer Filmwissens-Cache
--
-- Schlanker, normalisierter und fail-closed Datengrund:
--   * gemeinsame Werke und weltweit eindeutige externe Kennungen,
--   * eigenes Quellen-/Rechteregister (nicht das Programmdatenregister),
--   * deduplizierte Rechercheauftraege ohne Artikel- oder Promptinhalte,
--   * unveraenderliche veroeffentlichte Versionen und Belege,
--   * genau ein atomarer Zeiger auf die aktuell zulaessige Fassung.
--
-- Browserkonten erhalten keinerlei Tabellenrecht. Angemeldete Konten duerfen
-- ausschliesslich die enge Lese-RPC aufrufen; alle Schreib-RPCs sind nur fuer
-- service_role freigegeben. Es wird keine Website vorbelegt oder freigegeben.
-- ===========================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.kd_filmwissen_kennung_norm(
  p_namespace text,
  p_kennung text
) returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select case
    when lower(trim(p_namespace)) = 'imdb'
         and lower(trim(p_kennung)) ~ '^tt[0-9]{7,10}$'
      then lower(trim(p_kennung))
    when lower(trim(p_namespace)) in ('tmdb','watchmode','film_at')
         and trim(p_kennung) ~ '^[0-9]{1,18}$'
         and ltrim(trim(p_kennung), '0') <> ''
      then ltrim(trim(p_kennung), '0')
    when lower(trim(p_namespace)) = 'wikidata'
         and upper(trim(p_kennung)) ~ '^Q[1-9][0-9]{0,17}$'
      then upper(trim(p_kennung))
    when lower(trim(p_namespace)) = 'kinodreieck'
         and trim(p_kennung) ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
      then trim(p_kennung)
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.kd_filmwissen_quellen (
  slug                    text primary key,
  domain                  text not null unique,
  betreiber               text not null,
  status                  text not null default 'kandidat'
                          check (status in ('kandidat','freigegeben','pausiert','widerrufen','abgelaufen')),
  websuche_erlaubt        boolean not null default false,
  seitenabruf_erlaubt     boolean not null default false,
  cache_erlaubt           boolean not null default false,
  paraphrase_erlaubt      boolean not null default false,
  anzeige_erlaubt         boolean not null default false,
  subdomains_erlaubt      boolean not null default false,
  attribution             text,
  rechtsstand             date,
  gueltig_bis             date,
  erstellt_at             timestamptz not null default now(),
  geaendert_at            timestamptz not null default now(),
  constraint kd_fwq_slug_form check (slug ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint kd_fwq_domain_form check (
    domain = lower(domain)
    and domain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  constraint kd_fwq_betreiber_laenge check (char_length(betreiber) between 1 and 160),
  constraint kd_fwq_attribution_laenge check (attribution is null or char_length(attribution) <= 500)
);

create table if not exists public.kd_filmwerke (
  id                    uuid primary key default gen_random_uuid(),
  typ                   text not null check (typ in ('film','filmreihe','serie')),
  titel                 text not null,
  originaltitel         text,
  jahr                  smallint not null check (jahr between 1870 and 2200),
  identitaetsstatus     text not null default 'ungeklaert'
                        check (identitaetsstatus in ('ungeklaert','geprueft','gesperrt')),
  identitaetsgrund      text,
  aktuelle_version_id   uuid,
  erstellt_at           timestamptz not null default now(),
  geaendert_at          timestamptz not null default now(),
  constraint kd_fw_titel_laenge check (char_length(titel) between 1 and 240),
  constraint kd_fw_originaltitel_laenge check (
    originaltitel is null or char_length(originaltitel) between 1 and 240
  ),
  constraint kd_fw_identitaetsgrund_laenge check (
    identitaetsgrund is null or char_length(identitaetsgrund) between 3 and 300
  )
);

create table if not exists public.kd_filmwerk_kennungen (
  namespace       text not null,
  kennung         text not null,
  werk_id         uuid not null references public.kd_filmwerke(id) on delete restrict,
  status          text not null default 'kandidat'
                  check (status in ('kandidat','geprueft','gesperrt')),
  quelle_slug     text references public.kd_filmwissen_quellen(slug) on delete restrict,
  geprueft_at     timestamptz,
  erstellt_at     timestamptz not null default now(),
  primary key (namespace, kennung),
  constraint kd_fwk_namespace check (
    namespace in ('imdb','tmdb','watchmode','film_at','wikidata','kinodreieck')
  ),
  constraint kd_fwk_kennung_form check (
    char_length(kennung) between 1 and 160
    and kennung ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    and kennung = public.kd_filmwissen_kennung_norm(namespace, kennung)
  ),
  constraint kd_fwk_geprueft_zeit check (
    (status = 'geprueft' and geprueft_at is not null)
    or status <> 'geprueft'
  )
);
create index if not exists kd_fwk_werk_idx on public.kd_filmwerk_kennungen(werk_id);
create unique index if not exists kd_fwk_ein_namespace_pro_werk
  on public.kd_filmwerk_kennungen(werk_id, namespace)
  where status <> 'gesperrt';

create table if not exists public.kd_filmwissen_auftraege (
  id                   uuid primary key default gen_random_uuid(),
  vorgang_id           uuid not null unique,
  werk_id              uuid not null references public.kd_filmwerke(id) on delete restrict,
  anlass               text not null
                       check (anlass in ('ausdruecklich','redaktionell','korrektur','ruecknahme')),
  quellen_slugs        text[] not null,
  quellen_hash         text not null,
  status               text not null default 'bereit'
                       check (status in ('bereit','laufend','fertig','fehler')),
  kosten_usd_cent      numeric(12,6) check (kosten_usd_cent is null or kosten_usd_cent >= 0),
  fehlerklasse         text,
  ergebnis_version_id  uuid,
  erstellt_at          timestamptz not null default now(),
  gestartet_at         timestamptz,
  abgeschlossen_at     timestamptz,
  constraint kd_fwa_quellen_anzahl check (cardinality(quellen_slugs) between 1 and 5),
  constraint kd_fwa_hash_form check (quellen_hash ~ '^[a-f0-9]{64}$'),
  constraint kd_fwa_fehlerklasse_form check (
    fehlerklasse is null
    or fehlerklasse ~ '^[a-z][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9._-]{0,39}){0,3}$'
  )
);
create unique index if not exists kd_fwa_ein_lauf
  on public.kd_filmwissen_auftraege(werk_id)
  where status in ('bereit','laufend');

create table if not exists public.kd_filmwissen_versionen (
  id                    uuid primary key default gen_random_uuid(),
  werk_id               uuid not null references public.kd_filmwerke(id) on delete restrict,
  version_nr            integer not null check (version_nr >= 1),
  vorgaenger_id         uuid,
  auftrag_id            uuid unique references public.kd_filmwissen_auftraege(id) on delete restrict,
  format                text not null default 'filmwissen-cache-v1'
                        check (format = 'filmwissen-cache-v1'),
  schema_version        text not null,
  rubrik_version        text not null,
  pipeline_version      text not null,
  prompt_version        text,
  warum                 smallint check (warum between 0 and 5),
  sicherheit            text not null
                        check (sicherheit in ('sehr_niedrig','niedrig','mittel','hoch')),
  kurztext              text not null,
  modell                text,
  kosten_usd_cent       numeric(12,6) not null default 0 check (kosten_usd_cent >= 0),
  paket_sha256          text not null,
  erstellt_at           timestamptz not null default now(),
  unique (werk_id, version_nr),
  unique (werk_id, id),
  constraint kd_fwv_vorgaenger_fk foreign key (werk_id, vorgaenger_id)
    references public.kd_filmwissen_versionen(werk_id, id) on delete restrict,
  constraint kd_fwv_version_form check (
    schema_version ~ '^[A-Za-z0-9._-]{1,20}$'
    and rubrik_version ~ '^[A-Za-z0-9._-]{1,20}$'
    and pipeline_version ~ '^[A-Za-z0-9._-]{1,20}$'
    and (prompt_version is null or prompt_version ~ '^[A-Za-z0-9._-]{1,20}$')
  ),
  constraint kd_fwv_kurztext_laenge check (char_length(kurztext) between 1 and 1000),
  constraint kd_fwv_modell_form check (
    modell is null or modell ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
  ),
  constraint kd_fwv_hash_form check (paket_sha256 ~ '^[a-f0-9]{64}$')
);

create table if not exists public.kd_filmwissen_belege (
  id                    uuid primary key default gen_random_uuid(),
  version_id            uuid not null references public.kd_filmwissen_versionen(id) on delete restrict,
  quelle_slug           text not null references public.kd_filmwissen_quellen(slug) on delete restrict,
  url                   text not null,
  seitentitel           text not null,
  veroeffentlicht_at    timestamptz,
  abgerufen_at          timestamptz not null,
  attribution_snapshot  text not null,
  kernaussagen          jsonb not null,
  abruf_sha256          text not null,
  erstellt_at           timestamptz not null default now(),
  unique (version_id, quelle_slug),
  constraint kd_fwb_url_https check (
    url ~ '^https://[^[:space:]]+$'
    and char_length(url) between 9 and 2048
  ),
  constraint kd_fwb_titel_laenge check (char_length(seitentitel) between 1 and 300),
  constraint kd_fwb_attribution_laenge check (char_length(attribution_snapshot) between 1 and 500),
  constraint kd_fwb_kernaussagen_form check (
    jsonb_typeof(kernaussagen) = 'array'
    and jsonb_array_length(kernaussagen) between 1 and 10
    and octet_length(kernaussagen::text) <= 8192
  ),
  constraint kd_fwb_hash_form check (abruf_sha256 ~ '^[a-f0-9]{64}$')
);
create index if not exists kd_fwb_quelle_idx on public.kd_filmwissen_belege(quelle_slug, version_id);

create table if not exists public.kd_filmwissen_zeigerlog (
  id                bigint generated always as identity primary key,
  werk_id           uuid not null references public.kd_filmwerke(id) on delete restrict,
  alte_version_id   uuid,
  neue_version_id   uuid,
  art               text not null
                    check (art in ('veroeffentlichung','quelle_gesperrt','abgelaufen','manuell')),
  grund             text not null,
  erstellt_at       timestamptz not null default now(),
  constraint kd_fwz_alt_fk foreign key (werk_id, alte_version_id)
    references public.kd_filmwissen_versionen(werk_id, id) on delete restrict,
  constraint kd_fwz_neu_fk foreign key (werk_id, neue_version_id)
    references public.kd_filmwissen_versionen(werk_id, id) on delete restrict,
  constraint kd_fwz_aenderung check (alte_version_id is distinct from neue_version_id),
  constraint kd_fwz_grund_laenge check (char_length(grund) between 3 and 300)
);
create index if not exists kd_fwz_werk_idx
  on public.kd_filmwissen_zeigerlog(werk_id, erstellt_at desc);

alter table public.kd_filmwerke
  drop constraint if exists kd_fw_aktuelle_version_fk;
alter table public.kd_filmwerke
  add constraint kd_fw_aktuelle_version_fk
  foreign key (id, aktuelle_version_id)
  references public.kd_filmwissen_versionen(werk_id, id)
  on delete restrict;

alter table public.kd_filmwissen_auftraege
  drop constraint if exists kd_fwa_ergebnis_version_fk;
alter table public.kd_filmwissen_auftraege
  add constraint kd_fwa_ergebnis_version_fk
  foreign key (werk_id, ergebnis_version_id)
  references public.kd_filmwissen_versionen(werk_id, id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 2. Zeitstempel und Unveraenderlichkeit
-- ---------------------------------------------------------------------------

create or replace function public.kd_filmwissen_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.geaendert_at := now();
  return new;
end
$$;

drop trigger if exists kd_fw_touch on public.kd_filmwerke;
create trigger kd_fw_touch
  before update on public.kd_filmwerke
  for each row execute function public.kd_filmwissen_touch();

drop trigger if exists kd_fwq_touch on public.kd_filmwissen_quellen;
create trigger kd_fwq_touch
  before update on public.kd_filmwissen_quellen
  for each row execute function public.kd_filmwissen_touch();

create or replace function public.kd_filmwissen_unveraenderlich()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'filmwissen_unveraenderlich'
    using errcode = '55000';
end
$$;

drop trigger if exists kd_fwv_unveraenderlich on public.kd_filmwissen_versionen;
create trigger kd_fwv_unveraenderlich
  before update or delete on public.kd_filmwissen_versionen
  for each row execute function public.kd_filmwissen_unveraenderlich();

drop trigger if exists kd_fwb_unveraenderlich on public.kd_filmwissen_belege;
create trigger kd_fwb_unveraenderlich
  before update or delete on public.kd_filmwissen_belege
  for each row execute function public.kd_filmwissen_unveraenderlich();

drop trigger if exists kd_fwz_unveraenderlich on public.kd_filmwissen_zeigerlog;
create trigger kd_fwz_unveraenderlich
  before update or delete on public.kd_filmwissen_zeigerlog
  for each row execute function public.kd_filmwissen_unveraenderlich();

create or replace function public.kd_filmwissen_quellen_hash(
  p_slugs text[]
) returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select encode(extensions.digest(convert_to(
    jsonb_agg(jsonb_build_object(
      'slug', q.slug,
      'domain', q.domain,
      'betreiber', q.betreiber,
      'status', q.status,
      'websuche', q.websuche_erlaubt,
      'seitenabruf', q.seitenabruf_erlaubt,
      'cache', q.cache_erlaubt,
      'paraphrase', q.paraphrase_erlaubt,
      'anzeige', q.anzeige_erlaubt,
      'subdomains', q.subdomains_erlaubt,
      'attribution', q.attribution,
      'rechtsstand', q.rechtsstand,
      'gueltigBis', q.gueltig_bis
    ) order by q.slug)::text,
    'UTF8'
  ), 'sha256'), 'hex')
  from public.kd_filmwissen_quellen q
  where q.slug = any(p_slugs)
$$;

-- ---------------------------------------------------------------------------
-- 3. Enge Lese-RPC fuer angemeldete Konten
-- ---------------------------------------------------------------------------

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

  -- Zweiter Boden neben dem Quellen-Widerrufs-RPC: selbst ein manuell falsch
  -- gesetzter Zeiger darf keine unzulaessige Quelle sichtbar machen.
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

-- ---------------------------------------------------------------------------
-- 4. Kontrollierte service_role-RPCs
-- ---------------------------------------------------------------------------

create or replace function public.kd_filmwissen_quelle_speichern(
  p_quelle jsonb
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := lower(trim(coalesce(p_quelle->>'slug','')));
  v_domain text := lower(trim(coalesce(p_quelle->>'domain','')));
  v_status text := coalesce(p_quelle->>'status','kandidat');
  v_ungueltig boolean;
  v_alte_domain text;
  v_alte_subdomains boolean;
begin
  if jsonb_typeof(p_quelle) is distinct from 'object' then
    raise exception 'quelle_ungueltig' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('filmwissen-quelle:' || v_slug, 0));
  select domain, subdomains_erlaubt
    into v_alte_domain, v_alte_subdomains
    from public.kd_filmwissen_quellen
   where slug = v_slug
   for update;

  insert into public.kd_filmwissen_quellen (
    slug, domain, betreiber, status,
    websuche_erlaubt, seitenabruf_erlaubt, cache_erlaubt,
    paraphrase_erlaubt, anzeige_erlaubt, subdomains_erlaubt,
    attribution, rechtsstand, gueltig_bis
  ) values (
    v_slug,
    v_domain,
    trim(coalesce(p_quelle->>'betreiber','')),
    v_status,
    coalesce((p_quelle->>'websucheErlaubt')::boolean, false),
    coalesce((p_quelle->>'seitenabrufErlaubt')::boolean, false),
    coalesce((p_quelle->>'cacheErlaubt')::boolean, false),
    coalesce((p_quelle->>'paraphraseErlaubt')::boolean, false),
    coalesce((p_quelle->>'anzeigeErlaubt')::boolean, false),
    coalesce((p_quelle->>'subdomainsErlaubt')::boolean, false),
    nullif(trim(coalesce(p_quelle->>'attribution','')), ''),
    nullif(p_quelle->>'rechtsstand','')::date,
    nullif(p_quelle->>'gueltigBis','')::date
  )
  on conflict (slug) do update set
    domain = excluded.domain,
    betreiber = excluded.betreiber,
    status = excluded.status,
    websuche_erlaubt = excluded.websuche_erlaubt,
    seitenabruf_erlaubt = excluded.seitenabruf_erlaubt,
    cache_erlaubt = excluded.cache_erlaubt,
    paraphrase_erlaubt = excluded.paraphrase_erlaubt,
    anzeige_erlaubt = excluded.anzeige_erlaubt,
    subdomains_erlaubt = excluded.subdomains_erlaubt,
    attribution = excluded.attribution,
    rechtsstand = excluded.rechtsstand,
    gueltig_bis = excluded.gueltig_bis;

  select not (
    status = 'freigegeben'
    and cache_erlaubt
    and paraphrase_erlaubt
    and anzeige_erlaubt
    and (gueltig_bis is null or gueltig_bis >= current_date)
  ) into v_ungueltig
  from public.kd_filmwissen_quellen
  where slug = v_slug;

  if v_ungueltig
     or v_alte_domain is distinct from v_domain
     or v_alte_subdomains is distinct from coalesce(
       (p_quelle->>'subdomainsErlaubt')::boolean,
       false
     ) then
    with betroffen as (
      select w.id, w.aktuelle_version_id
        from public.kd_filmwerke w
       join public.kd_filmwissen_belege b
          on b.version_id = w.aktuelle_version_id
       where b.quelle_slug = v_slug
       order by w.id
       for update of w
    ), geaendert as (
      update public.kd_filmwerke w
         set aktuelle_version_id = null
        from betroffen b
       where w.id = b.id
      returning w.id, b.aktuelle_version_id
    )
    insert into public.kd_filmwissen_zeigerlog(
      werk_id,alte_version_id,neue_version_id,art,grund
    )
    select id,aktuelle_version_id,null,'quelle_gesperrt',
           'Quelle nicht mehr zulaessig oder Domainkonfiguration geaendert: ' || v_slug
      from geaendert;
  end if;
  return v_slug;
end
$$;

create or replace function public.kd_filmwissen_werk_sicherstellen(
  p_typ text,
  p_titel text,
  p_originaltitel text,
  p_jahr integer,
  p_kennungen jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_werk uuid;
  v_treffer uuid[];
  v_namespace text;
  v_kennung text;
  v_betroffen integer;
begin
  if p_typ not in ('film','filmreihe','serie')
     or char_length(trim(coalesce(p_titel,''))) not between 1 and 240
     or p_jahr is null
     or p_jahr not between 1870 and 2200
     or jsonb_typeof(p_kennungen) is distinct from 'object'
     or (
       select count(*) not between 1 and 6
         from jsonb_object_keys(p_kennungen)
     )
     or exists (
       select 1
         from jsonb_each_text(p_kennungen) e
        where public.kd_filmwissen_kennung_norm(lower(e.key), e.value) is null
     ) then
    raise exception 'werk_ungueltig' using errcode = '22023';
  end if;

  -- Pro Kennung sperren (nicht pro gesamtem JSON-Objekt): Auch zwei
  -- unterschiedlich zusammengesetzte Pakete mit derselben IMDb-/TMDB-ID
  -- duerfen nie gleichzeitig zwei Werke beanspruchen.
  perform pg_advisory_xact_lock(
      hashtextextended(
        lower(e.key) || ':' ||
        public.kd_filmwissen_kennung_norm(lower(e.key), e.value),
        0
      )
    )
    from jsonb_each_text(p_kennungen) e
   order by lower(e.key), public.kd_filmwissen_kennung_norm(lower(e.key), e.value);

  select array_agg(distinct k.werk_id)
    into v_treffer
    from jsonb_each_text(p_kennungen) e
    join public.kd_filmwerk_kennungen k
      on k.namespace = lower(e.key)
     and k.kennung = public.kd_filmwissen_kennung_norm(lower(e.key), e.value)
   where k.status <> 'gesperrt';

  if coalesce(cardinality(v_treffer), 0) > 1 then
    update public.kd_filmwerke
       set identitaetsstatus = 'gesperrt',
           identitaetsgrund = 'Widerspruechliche starke Kennungen im selben Werkpaket.'
     where id = any(v_treffer);
    update public.kd_filmwerk_kennungen k
       set status = 'gesperrt'
      from jsonb_each_text(p_kennungen) e
     where k.werk_id = any(v_treffer)
       and k.namespace = lower(e.key)
       and k.kennung = public.kd_filmwissen_kennung_norm(lower(e.key), e.value);
    return jsonb_build_object(
      'status', 'konflikt',
      'werkIds', to_jsonb(v_treffer)
    );
  end if;
  if cardinality(v_treffer) = 1 then
    v_werk := v_treffer[1];
  else
    insert into public.kd_filmwerke(typ,titel,originaltitel,jahr)
    values (
      p_typ,
      trim(p_titel),
      nullif(trim(coalesce(p_originaltitel,'')), ''),
      p_jahr
    ) returning id into v_werk;
  end if;

  if exists (
    select 1
      from jsonb_each_text(p_kennungen) e
      join public.kd_filmwerk_kennungen k
        on k.werk_id = v_werk
       and k.namespace = lower(e.key)
       and k.status <> 'gesperrt'
     where k.kennung <> public.kd_filmwissen_kennung_norm(lower(e.key), e.value)
  ) then
    update public.kd_filmwerke
       set identitaetsstatus = 'gesperrt',
           identitaetsgrund = 'Mehrere starke Kennungen desselben Anbieters fuer ein Werk.'
     where id = v_werk;
    update public.kd_filmwerk_kennungen
       set status = 'gesperrt'
     where werk_id = v_werk;
    for v_namespace, v_kennung in
      select
        lower(key),
        public.kd_filmwissen_kennung_norm(lower(key), value)
      from jsonb_each_text(p_kennungen)
    loop
      insert into public.kd_filmwerk_kennungen(namespace,kennung,werk_id,status)
      values (v_namespace,v_kennung,v_werk,'gesperrt')
      on conflict (namespace,kennung) do nothing;
    end loop;
    return jsonb_build_object(
      'status','konflikt','werkId',v_werk,'grund','mehrere_kennungen_eines_anbieters'
    );
  end if;

  for v_namespace, v_kennung in
    select
      lower(key),
      public.kd_filmwissen_kennung_norm(lower(key), value)
    from jsonb_each_text(p_kennungen)
  loop
    if v_kennung is null then
      raise exception 'werkkennung_ungueltig' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.kd_filmwerk_kennungen
       where namespace = v_namespace and kennung = v_kennung and werk_id <> v_werk
    ) then
      raise exception 'werkkennung_konflikt' using errcode = '23505';
    end if;
    insert into public.kd_filmwerk_kennungen(namespace,kennung,werk_id,status)
    values (v_namespace,v_kennung,v_werk,'kandidat')
    on conflict (namespace,kennung) do nothing;
    select count(*) into v_betroffen
      from public.kd_filmwerk_kennungen
     where namespace = v_namespace
       and kennung = v_kennung
       and werk_id = v_werk;
    if v_betroffen <> 1 then
      raise exception 'werkkennung_konflikt' using errcode = '23505';
    end if;
  end loop;
  return jsonb_build_object('status','bereit','werkId',v_werk);
end
$$;

create or replace function public.kd_filmwissen_werk_pruefen(
  p_werk uuid,
  p_kennungen jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_namespace text;
  v_kennung text;
  v_anzahl integer := 0;
  v_betroffen integer;
  v_konflikte uuid[];
begin
  if not exists (select 1 from public.kd_filmwerke where id = p_werk)
     or jsonb_typeof(p_kennungen) is distinct from 'object'
     or (
       select count(*) not between 1 and 6
         from jsonb_object_keys(p_kennungen)
     )
     or exists (
       select 1
         from jsonb_each_text(p_kennungen) e
        where public.kd_filmwissen_kennung_norm(lower(e.key), e.value) is null
     ) then
    raise exception 'werk_ungueltig' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
      hashtextextended(
        lower(e.key) || ':' ||
        public.kd_filmwissen_kennung_norm(lower(e.key), e.value),
        0
      )
    )
    from jsonb_each_text(p_kennungen) e
   order by lower(e.key), public.kd_filmwissen_kennung_norm(lower(e.key), e.value);

  if exists (
    select 1
      from jsonb_each_text(p_kennungen) e
      join public.kd_filmwerk_kennungen k
        on k.werk_id = p_werk
       and k.namespace = lower(e.key)
       and k.status <> 'gesperrt'
     where k.kennung <> public.kd_filmwissen_kennung_norm(lower(e.key), e.value)
  ) then
    update public.kd_filmwerke
       set identitaetsstatus = 'gesperrt',
           identitaetsgrund = 'Mehrere starke Kennungen desselben Anbieters fuer ein Werk.'
     where id = p_werk;
    update public.kd_filmwerk_kennungen
       set status = 'gesperrt'
     where werk_id = p_werk;
    for v_namespace, v_kennung in
      select
        lower(key),
        public.kd_filmwissen_kennung_norm(lower(key), value)
      from jsonb_each_text(p_kennungen)
    loop
      insert into public.kd_filmwerk_kennungen(namespace,kennung,werk_id,status)
      values (v_namespace,v_kennung,p_werk,'gesperrt')
      on conflict (namespace,kennung) do nothing;
    end loop;
    return jsonb_build_object(
      'status','konflikt','werkId',p_werk,'grund','mehrere_kennungen_eines_anbieters'
    );
  end if;

  select array_agg(distinct k.werk_id)
    into v_konflikte
    from jsonb_each_text(p_kennungen) e
    join public.kd_filmwerk_kennungen k
      on k.namespace = lower(e.key)
     and k.kennung = public.kd_filmwissen_kennung_norm(lower(e.key), e.value)
   where k.werk_id <> p_werk;
  if coalesce(cardinality(v_konflikte), 0) > 0 then
    update public.kd_filmwerke
       set identitaetsstatus = 'gesperrt',
           identitaetsgrund = 'Eine starke Kennung beansprucht mehrere Werke.'
     where id = p_werk or id = any(v_konflikte);
    update public.kd_filmwerk_kennungen k
       set status = 'gesperrt'
      from jsonb_each_text(p_kennungen) e
     where (k.werk_id = p_werk or k.werk_id = any(v_konflikte))
       and k.namespace = lower(e.key)
       and k.kennung = public.kd_filmwissen_kennung_norm(lower(e.key), e.value);
    return jsonb_build_object(
      'status', 'konflikt',
      'werkId', p_werk,
      'andereWerkIds', to_jsonb(v_konflikte)
    );
  end if;

  for v_namespace, v_kennung in
    select
      lower(key),
      public.kd_filmwissen_kennung_norm(lower(key), value)
    from jsonb_each_text(p_kennungen)
  loop
    v_anzahl := v_anzahl + 1;
    if v_kennung is null then
      raise exception 'werkkennung_ungueltig' using errcode = '22023';
    end if;
    insert into public.kd_filmwerk_kennungen(
      namespace,kennung,werk_id,status,geprueft_at
    ) values (
      v_namespace,v_kennung,p_werk,'geprueft',now()
    )
    on conflict (namespace,kennung) do update set
      status = 'geprueft',
      geprueft_at = now()
    where kd_filmwerk_kennungen.werk_id = excluded.werk_id;
    get diagnostics v_betroffen = row_count;
    if v_betroffen <> 1 then
      raise exception 'werkkennung_konflikt' using errcode = '23505';
    end if;
  end loop;
  if v_anzahl < 1 then
    raise exception 'starke_kennung_fehlt' using errcode = '22023';
  end if;
  update public.kd_filmwerke
     set identitaetsstatus = 'geprueft',
         identitaetsgrund = null
   where id = p_werk;
  return jsonb_build_object('status','geprueft','werkId',p_werk);
end
$$;

create or replace function public.kd_filmwissen_auftrag_starten(
  p_werk uuid,
  p_vorgang uuid,
  p_anlass text,
  p_quellen text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_version uuid;
  v_quellen text[];
  v_quellen_hash text;
begin
  select aktuelle_version_id into v_version
    from public.kd_filmwerke
   where id = p_werk and identitaetsstatus = 'geprueft'
   for update;
  if not found then
    raise exception 'werk_nicht_geprueft' using errcode = '22023';
  end if;
  if v_version is not null then
    if exists (
      select 1
        from public.kd_filmwissen_belege b
        left join public.kd_filmwissen_quellen q on q.slug = b.quelle_slug
       where b.version_id = v_version
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
      update public.kd_filmwerke
         set aktuelle_version_id = null
       where id = p_werk
         and aktuelle_version_id = v_version;
      if found then
        insert into public.kd_filmwissen_zeigerlog(
          werk_id,alte_version_id,neue_version_id,art,grund
        ) values (
          p_werk,v_version,null,'abgelaufen',
          'Aktuelle Quellenrechte oder Domainkonfiguration sind nicht mehr gueltig.'
        );
      end if;
      v_version := null;
    else
      return jsonb_build_object('status','cache_hit','versionId',v_version);
    end if;
  end if;
  if p_quellen is null
     or cardinality(p_quellen) not between 1 and 5
     or (
       select count(distinct slug) <> count(*)
         from unnest(p_quellen) s(slug)
     ) then
    raise exception 'quellen_ungueltig' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_quellen) s(slug)
    left join public.kd_filmwissen_quellen q on q.slug = s.slug
    where q.slug is null
       or q.status <> 'freigegeben'
       or not q.websuche_erlaubt
       or not q.seitenabruf_erlaubt
       or not q.cache_erlaubt
       or not q.paraphrase_erlaubt
       or not q.anzeige_erlaubt
       or (q.gueltig_bis is not null and q.gueltig_bis < current_date)
  ) then
    raise exception 'quelle_nicht_freigegeben' using errcode = '42501';
  end if;

  select array_agg(q.slug order by q.slug)
    into v_quellen
    from public.kd_filmwissen_quellen q
   where q.slug = any(p_quellen);
  v_quellen_hash := public.kd_filmwissen_quellen_hash(v_quellen);

  select id into v_id
    from public.kd_filmwissen_auftraege
   where werk_id = p_werk
     and status in ('bereit','laufend');
  if found then
    return jsonb_build_object('status','bereits_laufend','auftragId',v_id);
  end if;

  begin
    insert into public.kd_filmwissen_auftraege(
      vorgang_id,werk_id,anlass,quellen_slugs,quellen_hash,status
    ) values (
      p_vorgang,p_werk,p_anlass,v_quellen,v_quellen_hash,'bereit'
    ) returning id into v_id;
  exception when unique_violation then
    select id into v_id
      from public.kd_filmwissen_auftraege
     where werk_id = p_werk
       and status in ('bereit','laufend');
    if not found then
      raise exception 'vorgang_id_bereits_vergeben' using errcode = '23505';
    end if;
    return jsonb_build_object('status','bereits_laufend','auftragId',v_id);
  end;
  return jsonb_build_object('status','neu','auftragId',v_id);
end
$$;

create or replace function public.kd_filmwissen_veroeffentlichen(
  p_auftrag uuid,
  p_version jsonb,
  p_belege jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auftrag public.kd_filmwissen_auftraege%rowtype;
  v_werk public.kd_filmwerke%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_version_nr integer;
  v_vorgaenger uuid;
  v_warum smallint;
  v_beleg jsonb;
  v_quelle public.kd_filmwissen_quellen%rowtype;
  v_slug text;
  v_url text;
  v_host text;
  v_slugs text[] := '{}';
  v_domains text[] := '{}';
  v_beleg_anzahl integer;
  v_paket_sha256 text;
  v_belege_final jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_version) is distinct from 'object'
     or jsonb_typeof(p_belege) is distinct from 'array' then
    raise exception 'filmwissen_paket_ungueltig' using errcode = '22023';
  end if;
  if not (p_version ?& array[
    'schemaVersion','rubrikVersion','pipelineVersion','promptVersion','warum',
    'sicherheit','kurztext','modell','kostenUsdCent'
  ]) or (select count(*) from jsonb_object_keys(p_version)) <> 9 then
    raise exception 'filmwissen_version_schema' using errcode = '22023';
  end if;
  if jsonb_typeof(p_version->'schemaVersion') is distinct from 'string'
     or jsonb_typeof(p_version->'rubrikVersion') is distinct from 'string'
     or jsonb_typeof(p_version->'pipelineVersion') is distinct from 'string'
     or jsonb_typeof(p_version->'sicherheit') is distinct from 'string'
     or jsonb_typeof(p_version->'kurztext') is distinct from 'string'
     or jsonb_typeof(p_version->'kostenUsdCent') is distinct from 'number'
     or jsonb_typeof(p_version->'promptVersion') not in ('string','null')
     or jsonb_typeof(p_version->'warum') not in ('number','null')
     or jsonb_typeof(p_version->'modell') not in ('string','null') then
    raise exception 'filmwissen_version_typen' using errcode = '22023';
  end if;

  select * into v_auftrag
    from public.kd_filmwissen_auftraege
   where id = p_auftrag
   for update;
  if not found or v_auftrag.status not in ('bereit','laufend') then
    raise exception 'filmwissen_auftrag_ungueltig' using errcode = '22023';
  end if;
  perform q.slug
    from public.kd_filmwissen_quellen q
   where q.slug = any(v_auftrag.quellen_slugs)
   order by q.slug
   for share;
  if (
    select count(*) <> cardinality(v_auftrag.quellen_slugs)
      from public.kd_filmwissen_quellen q
     where q.slug = any(v_auftrag.quellen_slugs)
  ) or exists (
    select 1
      from public.kd_filmwissen_quellen q
     where q.slug = any(v_auftrag.quellen_slugs)
       and (
         q.status <> 'freigegeben'
         or not q.websuche_erlaubt
         or not q.seitenabruf_erlaubt
         or not q.cache_erlaubt
         or not q.paraphrase_erlaubt
         or not q.anzeige_erlaubt
         or (q.gueltig_bis is not null and q.gueltig_bis < current_date)
       )
  ) then
    raise exception 'quelle_nicht_freigegeben' using errcode = '42501';
  end if;
  if public.kd_filmwissen_quellen_hash(v_auftrag.quellen_slugs)
     is distinct from v_auftrag.quellen_hash then
    raise exception 'quellenkonfiguration_geaendert' using errcode = '40001';
  end if;
  v_beleg_anzahl := jsonb_array_length(p_belege);
  if v_beleg_anzahl not between 1 and 5 then
    raise exception 'beleganzahl_ungueltig' using errcode = '22023';
  end if;
  v_warum := nullif(p_version->>'warum','')::smallint;
  if v_warum is not null and (v_warum not between 0 and 5 or v_beleg_anzahl < 2) then
    raise exception 'warum_nicht_ausreichend_belegt' using errcode = '22023';
  end if;

  for v_beleg in select value from jsonb_array_elements(p_belege)
  loop
    if jsonb_typeof(v_beleg) is distinct from 'object'
       or not (v_beleg ?& array[
         'quelle','url','titel','veroeffentlichtAm','abgerufenAm',
         'kernaussagen','abrufSha256'
       ])
       or (select count(*) from jsonb_object_keys(v_beleg)) <> 7 then
      raise exception 'filmwissen_beleg_schema' using errcode = '22023';
    end if;
    if jsonb_typeof(v_beleg->'quelle') is distinct from 'string'
       or jsonb_typeof(v_beleg->'url') is distinct from 'string'
       or jsonb_typeof(v_beleg->'titel') is distinct from 'string'
       or jsonb_typeof(v_beleg->'abgerufenAm') is distinct from 'string'
       or jsonb_typeof(v_beleg->'abrufSha256') is distinct from 'string'
       or jsonb_typeof(v_beleg->'veroeffentlichtAm') not in ('string','null') then
      raise exception 'filmwissen_beleg_typen' using errcode = '22023';
    end if;
    v_slug := lower(trim(v_beleg->>'quelle'));
    if v_slug = any(v_slugs) or not (v_slug = any(v_auftrag.quellen_slugs)) then
      raise exception 'filmwissen_beleg_quelle' using errcode = '22023';
    end if;
    v_slugs := array_append(v_slugs, v_slug);

    select * into v_quelle
      from public.kd_filmwissen_quellen
     where slug = v_slug
       and status = 'freigegeben'
       and cache_erlaubt
       and paraphrase_erlaubt
       and anzeige_erlaubt
       and (gueltig_bis is null or gueltig_bis >= current_date);
    if not found then
      raise exception 'quelle_nicht_freigegeben' using errcode = '42501';
    end if;

    v_url := trim(v_beleg->>'url');
    v_host := lower(substring(v_url from '^https://([^/:?#]+)'));
    if v_host is null
       or not (
         v_host = v_quelle.domain
         or (v_quelle.subdomains_erlaubt and v_host like '%.' || v_quelle.domain)
       ) then
      raise exception 'beleg_domain_falsch' using errcode = '22023';
    end if;
    if jsonb_typeof(v_beleg->'kernaussagen') is distinct from 'array'
       or jsonb_array_length(v_beleg->'kernaussagen') not between 1 and 10
       or octet_length((v_beleg->'kernaussagen')::text) > 8192
       or exists (
         select 1
           from jsonb_array_elements(v_beleg->'kernaussagen') a(wert)
          where jsonb_typeof(a.wert) is distinct from 'string'
             or char_length(trim(a.wert #>> '{}')) not between 1 and 500
             or (a.wert #>> '{}') ~ '[[:cntrl:]]'
       ) then
      raise exception 'kernaussagen_ungueltig' using errcode = '22023';
    end if;
    v_domains := array_append(v_domains, v_quelle.domain);
    v_belege_final := v_belege_final || jsonb_build_array(jsonb_build_object(
      'quelle', v_slug,
      'url', v_url,
      'titel', trim(v_beleg->>'titel'),
      'veroeffentlichtAm', v_beleg->'veroeffentlichtAm',
      'abgerufenAm', v_beleg->>'abgerufenAm',
      'attribution', coalesce(nullif(trim(v_quelle.attribution), ''), v_quelle.betreiber),
      'kernaussagen', v_beleg->'kernaussagen',
      'abrufSha256', v_beleg->>'abrufSha256'
    ));
  end loop;

  if v_warum is not null
     and (
       select count(distinct domain) < 2
         from unnest(v_domains) d(domain)
     ) then
    raise exception 'warum_braucht_zwei_domains' using errcode = '22023';
  end if;

  -- Quellen werden im obigen Lauf vor dem Werk gesperrt. Dieselbe Reihenfolge
  -- nutzt der Widerrufspfad; so kann Rechteentzug nie mit Publikation
  -- deadlocken oder nachtraeglich ueberholt werden.
  select * into v_werk
    from public.kd_filmwerke
   where id = v_auftrag.werk_id
     and identitaetsstatus = 'geprueft'
   for update;
  if not found then
    raise exception 'werk_nicht_geprueft' using errcode = '22023';
  end if;

  select coalesce(max(version_nr),0) + 1
    into v_version_nr
    from public.kd_filmwissen_versionen
   where werk_id = v_werk.id;
  v_vorgaenger := v_werk.aktuelle_version_id;
  v_paket_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object('version', p_version, 'belege', v_belege_final)::text,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.kd_filmwissen_versionen(
    id,werk_id,version_nr,vorgaenger_id,auftrag_id,
    schema_version,rubrik_version,pipeline_version,prompt_version,
    warum,sicherheit,kurztext,modell,kosten_usd_cent,paket_sha256
  ) values (
    v_version_id,v_werk.id,v_version_nr,v_vorgaenger,p_auftrag,
    p_version->>'schemaVersion',
    p_version->>'rubrikVersion',
    p_version->>'pipelineVersion',
    nullif(p_version->>'promptVersion',''),
    v_warum,
    p_version->>'sicherheit',
    p_version->>'kurztext',
    nullif(p_version->>'modell',''),
    coalesce((p_version->>'kostenUsdCent')::numeric,0),
    v_paket_sha256
  );

  for v_beleg in select value from jsonb_array_elements(v_belege_final)
  loop
    insert into public.kd_filmwissen_belege(
      version_id,quelle_slug,url,seitentitel,veroeffentlicht_at,abgerufen_at,
      attribution_snapshot,kernaussagen,abruf_sha256
    ) values (
      v_version_id,
      lower(trim(v_beleg->>'quelle')),
      trim(v_beleg->>'url'),
      trim(v_beleg->>'titel'),
      nullif(v_beleg->>'veroeffentlichtAm','')::timestamptz,
      (v_beleg->>'abgerufenAm')::timestamptz,
      v_beleg->>'attribution',
      v_beleg->'kernaussagen',
      v_beleg->>'abrufSha256'
    );
  end loop;

  update public.kd_filmwerke
     set aktuelle_version_id = v_version_id
   where id = v_werk.id;
  insert into public.kd_filmwissen_zeigerlog(
    werk_id,alte_version_id,neue_version_id,art,grund
  ) values (
    v_werk.id,v_vorgaenger,v_version_id,'veroeffentlichung',
    'Gepruefte Filmwissensfassung aus Rechercheauftrag veroeffentlicht.'
  );
  update public.kd_filmwissen_auftraege
     set status = 'fertig',
         ergebnis_version_id = v_version_id,
         kosten_usd_cent = coalesce((p_version->>'kostenUsdCent')::numeric,0),
         abgeschlossen_at = now()
   where id = p_auftrag;
  return v_version_id;
end
$$;

create or replace function public.kd_filmwissen_version_setzen(
  p_werk uuid,
  p_version uuid,
  p_grund text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alt uuid;
begin
  if char_length(trim(coalesce(p_grund,''))) not between 3 and 300 then
    raise exception 'grund_ungueltig' using errcode = '22023';
  end if;
  if p_version is not null and not exists (
    select 1 from public.kd_filmwissen_versionen v
     where v.id = p_version and v.werk_id = p_werk
  ) then
    raise exception 'version_fremdes_werk' using errcode = '23503';
  end if;
  if p_version is not null then
    perform q.slug
      from public.kd_filmwissen_belege b
      join public.kd_filmwissen_quellen q on q.slug = b.quelle_slug
     where b.version_id = p_version
     order by q.slug
     for share of q;
  end if;
  select aktuelle_version_id
    into v_alt
    from public.kd_filmwerke
   where id = p_werk
   for update;
  if not found then
    raise exception 'werk_unbekannt' using errcode = '23503';
  end if;
  if p_version is not null and exists (
    select 1
      from public.kd_filmwissen_belege b
      join public.kd_filmwissen_quellen q on q.slug = b.quelle_slug
     where b.version_id = p_version
       and (
         q.status <> 'freigegeben'
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
    raise exception 'version_quelle_gesperrt' using errcode = '42501';
  end if;
  if v_alt is not distinct from p_version then
    return;
  end if;
  update public.kd_filmwerke
     set aktuelle_version_id = p_version
   where id = p_werk;
  insert into public.kd_filmwissen_zeigerlog(
    werk_id,alte_version_id,neue_version_id,art,grund
  ) values (
    p_werk,v_alt,p_version,'manuell',trim(p_grund)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS und Grants — keine Tabelle ist eine Browser-API
-- ---------------------------------------------------------------------------

alter table public.kd_filmwissen_quellen enable row level security;
alter table public.kd_filmwerke enable row level security;
alter table public.kd_filmwerk_kennungen enable row level security;
alter table public.kd_filmwissen_auftraege enable row level security;
alter table public.kd_filmwissen_versionen enable row level security;
alter table public.kd_filmwissen_belege enable row level security;
alter table public.kd_filmwissen_zeigerlog enable row level security;

revoke all on table
  public.kd_filmwissen_quellen,
  public.kd_filmwerke,
  public.kd_filmwerk_kennungen,
  public.kd_filmwissen_auftraege,
  public.kd_filmwissen_versionen,
  public.kd_filmwissen_belege,
  public.kd_filmwissen_zeigerlog
from public, anon, authenticated, service_role;

revoke all on sequence public.kd_filmwissen_zeigerlog_id_seq
from public, anon, authenticated, service_role;

revoke all on function public.kd_filmwissen_aktuell_lesen(text,text) from public, anon;
grant execute on function public.kd_filmwissen_aktuell_lesen(text,text) to authenticated;

revoke all on function public.kd_filmwissen_quelle_speichern(jsonb) from public, anon, authenticated;
revoke all on function public.kd_filmwissen_werk_sicherstellen(text,text,text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.kd_filmwissen_werk_pruefen(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.kd_filmwissen_auftrag_starten(uuid,uuid,text,text[]) from public, anon, authenticated;
revoke all on function public.kd_filmwissen_veroeffentlichen(uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.kd_filmwissen_version_setzen(uuid,uuid,text) from public, anon, authenticated;

grant execute on function public.kd_filmwissen_quelle_speichern(jsonb) to service_role;
grant execute on function public.kd_filmwissen_werk_sicherstellen(text,text,text,integer,jsonb) to service_role;
grant execute on function public.kd_filmwissen_werk_pruefen(uuid,jsonb) to service_role;
grant execute on function public.kd_filmwissen_auftrag_starten(uuid,uuid,text,text[]) to service_role;
grant execute on function public.kd_filmwissen_veroeffentlichen(uuid,jsonb,jsonb) to service_role;
grant execute on function public.kd_filmwissen_version_setzen(uuid,uuid,text) to service_role;

revoke all on function public.kd_filmwissen_touch() from public, anon, authenticated, service_role;
revoke all on function public.kd_filmwissen_unveraenderlich() from public, anon, authenticated, service_role;
revoke all on function public.kd_filmwissen_kennung_norm(text,text) from public, anon, authenticated, service_role;
revoke all on function public.kd_filmwissen_quellen_hash(text[]) from public, anon, authenticated, service_role;

comment on table public.kd_filmwissen_quellen is
  'Fail-closed Rechte- und Technikregister fuer gezielte Filmwissen-Fundstellen. Keine Quelle ist standardmaessig freigegeben.';
comment on table public.kd_filmwissen_versionen is
  'Unveraenderliche veroeffentlichte Filmwissensfassungen. Korrektur oder Rollback aendert nur den Werkzeiger.';
comment on function public.kd_filmwissen_aktuell_lesen(text,text) is
  'Einzige Browser-Lesegrenze: starke gepruefte Kennung rein, streng begrenztes aktuell freigegebenes Filmwissen raus.';

commit;
