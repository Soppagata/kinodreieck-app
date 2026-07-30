-- ===========================================================================
-- Etappe 8, Phase D — feste Adapter freigeben und Vorbereitung atomisieren
--
-- Diese Migration gibt ausschliesslich die bereits fest implementierten
-- offiziellen Adapter fuer Wikidata (CC0) und die Library of Congress frei.
-- Freie URLs, Domains oder Quellen aus dem Browser bleiben ausgeschlossen.
--
-- Ausfuehrung: 30.07.2026 durch Codex dateiweise ueber die verknuepfte
-- Management-API; erfolgreich. Danach 276/276 Function-Tests und die
-- budgetgeschuetzte echte Rauchprobe P1-P21 gruen.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Synthese explizit auf Sonnet/gross routen
-- ---------------------------------------------------------------------------

do $ki_routing$
begin
  update public.kd_ai_limits
     set wert = jsonb_set(
           coalesce(wert, '{}'::jsonb),
           '{filmwissen-synthese}',
           '"gross"'::jsonb,
           true
         ),
         notiz = 'Zuordnung Aufgabe zu Modellalias. filmwissen-synthese nutzt '
                 || 'verpflichtend gross (Sonnet); kein stiller Fallback.',
         geaendert_at = now()
   where schluessel = 'task_modell';
  if not found then
    raise exception 'kd_ai_limits.task_modell fehlt';
  end if;

  update public.kd_ai_limits
     set wert = jsonb_set(
           coalesce(wert, '{}'::jsonb),
           '{filmwissen-synthese}',
           '2048'::jsonb,
           true
         ),
         notiz = 'Obergrenze der Antwortlaenge je Aufgabe. '
                 || 'filmwissen-synthese: 2048 Tokens.',
         geaendert_at = now()
   where schluessel = 'task_max_tokens';
  if not found then
    raise exception 'kd_ai_limits.task_max_tokens fehlt';
  end if;
end
$ki_routing$;

-- ---------------------------------------------------------------------------
-- 1. Enger Rechteentscheid fuer genau die beiden festen Adapter
-- ---------------------------------------------------------------------------

update public.kd_filmwissen_quellen
   set status = 'freigegeben',
       websuche_erlaubt = true,
       seitenabruf_erlaubt = true,
       cache_erlaubt = true,
       paraphrase_erlaubt = true,
       anzeige_erlaubt = true,
       subdomains_erlaubt = false,
       rechtsstand = date '2026-07-30',
       gueltig_bis = null,
       geaendert_at = now()
 where (
       slug = 'wikidata'
       and domain = 'www.wikidata.org'
       and adapter_key = 'wikidata-action-v1'
       and ursprung = 'wikidata-community'
       and belegklasse = 'strukturiert'
     ) or (
       slug = 'loc-nfr'
       and domain = 'www.loc.gov'
       and adapter_key = 'loc-nfr-listing-v1'
       and ursprung = 'loc-national-film-registry'
       and belegklasse = 'institutionell'
     );

do $adapter_freigabe$
begin
  if (
    select count(*) from public.kd_filmwissen_quellen
     where slug in ('wikidata','loc-nfr')
       and status = 'freigegeben'
       and websuche_erlaubt
       and seitenabruf_erlaubt
       and cache_erlaubt
       and paraphrase_erlaubt
       and anzeige_erlaubt
       and not subdomains_erlaubt
  ) <> 2 then
    raise exception 'filmwissen_adapter_freigabe_unvollstaendig';
  end if;
end
$adapter_freigabe$;

-- Der Auftrags-Hash friert auch die später ergänzten Adapter- und
-- Belegklassendaten ein. Ein Rechte- oder Adapterwechsel nach Auftragsstart
-- verhindert dadurch die Publikation.
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
      'gueltigBis', q.gueltig_bis,
      'adapterKey', q.adapter_key,
      'abrufeProMinute', q.abrufe_pro_minute,
      'ursprung', q.ursprung,
      'belegklasse', q.belegklasse
    ) order by q.slug)::text,
    'UTF8'
  ), 'sha256'), 'hex')
  from public.kd_filmwissen_quellen q
  where q.slug = any(p_slugs)
$$;

-- ---------------------------------------------------------------------------
-- 2. Gemeinsamer, kurzlebiger LOC-Snapshot statt Vollabruf pro Werk
-- ---------------------------------------------------------------------------

create table if not exists public.kd_filmwissen_adapter_snapshots (
  adapter_key     text primary key,
  adapter_version text not null,
  payload         jsonb not null,
  abruf_sha256    text not null,
  etag            text,
  abgerufen_at    timestamptz not null,
  gueltig_bis     timestamptz not null,
  erstellt_at     timestamptz not null default now(),
  constraint kd_fwas_adapter check (
    adapter_key = 'loc-nfr-listing-v1'
  ),
  constraint kd_fwas_version check (
    adapter_version ~ '^[a-z][a-z0-9._-]{1,59}$'
  ),
  constraint kd_fwas_payload check (
    jsonb_typeof(payload) = 'array'
    and jsonb_array_length(payload) between 900 and 1200
    and octet_length(payload::text) <= 262144
  ),
  constraint kd_fwas_hash check (
    abruf_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint kd_fwas_zeit check (
    gueltig_bis > abgerufen_at
    and gueltig_bis <= abgerufen_at + interval '7 days'
  )
);

alter table public.kd_filmwissen_adapter_snapshots enable row level security;
alter table public.kd_filmwissen_adapter_snapshots force row level security;
revoke all on table public.kd_filmwissen_adapter_snapshots
  from public, anon, authenticated;

create or replace function public.kd_filmwissen_loc_snapshot_lesen()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.kd_filmwissen_adapter_snapshots%rowtype;
begin
  if not exists (
    select 1 from public.kd_filmwissen_quellen
     where slug = 'loc-nfr'
       and adapter_key = 'loc-nfr-listing-v1'
       and status = 'freigegeben'
       and seitenabruf_erlaubt
       and cache_erlaubt
       and (gueltig_bis is null or gueltig_bis >= current_date)
  ) then
    return jsonb_build_object('status','gesperrt');
  end if;
  select * into v
    from public.kd_filmwissen_adapter_snapshots
   where adapter_key = 'loc-nfr-listing-v1'
     and gueltig_bis > now();
  if not found then
    return jsonb_build_object('status','miss');
  end if;
  return jsonb_build_object(
    'status','hit',
    'adapterVersion',v.adapter_version,
    'eintraege',v.payload,
    'abrufSha256',v.abruf_sha256,
    'etag',v.etag,
    'abgerufenAm',v.abgerufen_at
  );
end
$$;

create or replace function public.kd_filmwissen_loc_snapshot_speichern(
  p_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eintraege jsonb;
  v_abgerufen timestamptz;
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object'
     or not (p_snapshot ?& array[
       'adapterVersion','eintraege','abrufSha256','etag','abgerufenAm'
     ])
     or (select count(*) from jsonb_object_keys(p_snapshot)) <> 5
     or p_snapshot->>'adapterVersion' is distinct from 'loc-nfr-listing-v1'
     or jsonb_typeof(p_snapshot->'eintraege') is distinct from 'array'
     or jsonb_array_length(p_snapshot->'eintraege') not between 900 and 1200
     or octet_length((p_snapshot->'eintraege')::text) > 262144
     or coalesce(p_snapshot->>'abrufSha256','') !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_snapshot->'etag') not in ('string','null')
     or jsonb_typeof(p_snapshot->'abgerufenAm') is distinct from 'string' then
    raise exception 'filmwissen_loc_snapshot_ungueltig' using errcode = '22023';
  end if;
  v_eintraege := p_snapshot->'eintraege';
  v_abgerufen := (p_snapshot->>'abgerufenAm')::timestamptz;
  if v_abgerufen > now() + interval '5 minutes'
     or v_abgerufen < now() - interval '1 day' then
    raise exception 'filmwissen_loc_snapshot_zeit' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.kd_filmwissen_quellen
     where slug = 'loc-nfr'
       and adapter_key = 'loc-nfr-listing-v1'
       and status = 'freigegeben'
       and seitenabruf_erlaubt
       and cache_erlaubt
       and (gueltig_bis is null or gueltig_bis >= current_date)
  ) then
    raise exception 'filmwissen_loc_gesperrt' using errcode = '42501';
  end if;
  insert into public.kd_filmwissen_adapter_snapshots(
    adapter_key,adapter_version,payload,abruf_sha256,etag,
    abgerufen_at,gueltig_bis
  ) values (
    'loc-nfr-listing-v1','loc-nfr-listing-v1',v_eintraege,
    p_snapshot->>'abrufSha256',nullif(p_snapshot->>'etag',''),
    v_abgerufen,v_abgerufen + interval '24 hours'
  )
  on conflict (adapter_key) do update set
    adapter_version = excluded.adapter_version,
    payload = excluded.payload,
    abruf_sha256 = excluded.abruf_sha256,
    etag = excluded.etag,
    abgerufen_at = excluded.abgerufen_at,
    gueltig_bis = excluded.gueltig_bis,
    erstellt_at = now();
  return jsonb_build_object(
    'status','gespeichert',
    'gueltigBis',v_abgerufen + interval '24 hours'
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Werkidentitaet, Quellenpaket und Auftrag in einer Transaktion
-- ---------------------------------------------------------------------------

create or replace function public.kd_filmwissen_adapter_vorbereiten(
  p_vorgang uuid,
  p_werk jsonb,
  p_kennungen jsonb,
  p_quellen text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_werk jsonb;
  v_pruefung jsonb;
  v_auftrag jsonb;
  v_werk_id uuid;
begin
  if p_vorgang is null
     or jsonb_typeof(p_werk) is distinct from 'object'
     or not (p_werk ?& array['typ','titel','originaltitel','jahr'])
     or (select count(*) from jsonb_object_keys(p_werk)) <> 4
     or jsonb_typeof(p_kennungen) is distinct from 'object'
     or p_quellen is null
     or cardinality(p_quellen) not between 1 and 5 then
    raise exception 'filmwissen_adapter_vorbereitung_ungueltig'
      using errcode = '22023';
  end if;

  v_werk := public.kd_filmwissen_werk_sicherstellen(
    p_werk->>'typ',
    p_werk->>'titel',
    nullif(p_werk->>'originaltitel',''),
    (p_werk->>'jahr')::integer,
    p_kennungen
  );
  if v_werk->>'status' = 'konflikt' then return v_werk; end if;
  v_werk_id := (v_werk->>'werkId')::uuid;

  v_pruefung := public.kd_filmwissen_werk_pruefen(v_werk_id,p_kennungen);
  if v_pruefung->>'status' <> 'geprueft' then return v_pruefung; end if;

  v_auftrag := public.kd_filmwissen_auftrag_starten(
    v_werk_id,p_vorgang,'ausdruecklich',p_quellen
  );
  return v_auftrag || jsonb_build_object('werkId',v_werk_id);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Browserrollen bleiben von allen Betriebsnaehte ausgeschlossen
-- ---------------------------------------------------------------------------

revoke all on function public.kd_filmwissen_loc_snapshot_lesen()
  from public, anon, authenticated;
revoke all on function public.kd_filmwissen_loc_snapshot_speichern(jsonb)
  from public, anon, authenticated;
revoke all on function public.kd_filmwissen_adapter_vorbereiten(
  uuid,jsonb,jsonb,text[]
) from public, anon, authenticated;

grant execute on function public.kd_filmwissen_loc_snapshot_lesen()
  to service_role;
grant execute on function public.kd_filmwissen_loc_snapshot_speichern(jsonb)
  to service_role;
grant execute on function public.kd_filmwissen_adapter_vorbereiten(
  uuid,jsonb,jsonb,text[]
) to service_role;

comment on table public.kd_filmwissen_adapter_snapshots is
  'Service-only Cache des streng validierten LOC-Gesamtsnapshots; keine Konto- oder Profildaten.';
comment on function public.kd_filmwissen_adapter_vorbereiten(
  uuid,jsonb,jsonb,text[]
) is
  'Atomisiert Werkzuordnung, Identitaetspruefung und Start des ausdruecklichen Filmwissen-Berichts.';

commit;
