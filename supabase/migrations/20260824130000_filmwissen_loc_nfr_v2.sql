-- ===========================================================================
-- Filmwissen: offizieller LOC-NFR-Adapter v2
--
-- Der LOC-Seitenendpunkt liefert den Registry-Inhalt nicht mehr als
-- `content.markup`-String, sondern als typisierte Komponenten-/Itemliste.
-- Der neue Adapter besitzt deshalb einen eigenen Cache-Key. Ein vorhandener
-- v1-Snapshot bleibt bytegleich bestehen und wird weder gelesen noch
-- ueberschrieben; der erste v2-Abruf erzeugt eine additive v2-Zeile.
-- ===========================================================================

begin;

do $loc_v2_quelle$
declare
  v_anzahl integer;
begin
  update public.kd_filmwissen_quellen
     set adapter_key = 'loc-nfr-listing-v2',
         rechtsstand = date '2026-08-24',
         geaendert_at = now()
   where slug = 'loc-nfr'
     and domain = 'www.loc.gov'
     and betreiber = 'Library of Congress'
     and status = 'freigegeben'
     and websuche_erlaubt
     and seitenabruf_erlaubt
     and cache_erlaubt
     and paraphrase_erlaubt
     and anzeige_erlaubt
     and not subdomains_erlaubt
     and adapter_key = 'loc-nfr-listing-v1'
     and abrufe_pro_minute = 10
     and ursprung = 'loc-national-film-registry'
     and belegklasse = 'institutionell';
  get diagnostics v_anzahl = row_count;
  if v_anzahl = 0 and exists (
    select 1 from public.kd_filmwissen_quellen
     where slug = 'loc-nfr'
       and domain = 'www.loc.gov'
       and betreiber = 'Library of Congress'
       and status = 'freigegeben'
       and websuche_erlaubt
       and seitenabruf_erlaubt
       and cache_erlaubt
       and paraphrase_erlaubt
       and anzeige_erlaubt
       and not subdomains_erlaubt
       and adapter_key = 'loc-nfr-listing-v2'
       and abrufe_pro_minute = 10
       and ursprung = 'loc-national-film-registry'
       and belegklasse = 'institutionell'
  ) then
    null;
  elsif v_anzahl <> 1 then
    raise exception 'filmwissen_loc_v2_quellenvertrag';
  end if;
end
$loc_v2_quelle$;

alter table public.kd_filmwissen_adapter_snapshots
  drop constraint if exists kd_fwas_adapter,
  add constraint kd_fwas_adapter check (
    adapter_key in ('loc-nfr-listing-v1', 'loc-nfr-listing-v2')
  );

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
       and adapter_key = 'loc-nfr-listing-v2'
       and status = 'freigegeben'
       and seitenabruf_erlaubt
       and cache_erlaubt
       and (gueltig_bis is null or gueltig_bis >= current_date)
  ) then
    return jsonb_build_object('status','gesperrt');
  end if;
  select * into v
    from public.kd_filmwissen_adapter_snapshots
   where adapter_key = 'loc-nfr-listing-v2'
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
     or p_snapshot->>'adapterVersion' is distinct from 'loc-nfr-listing-v2'
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
       and adapter_key = 'loc-nfr-listing-v2'
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
    'loc-nfr-listing-v2','loc-nfr-listing-v2',v_eintraege,
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

revoke all on function public.kd_filmwissen_loc_snapshot_lesen()
  from public, anon, authenticated;
revoke all on function public.kd_filmwissen_loc_snapshot_speichern(jsonb)
  from public, anon, authenticated;
grant execute on function public.kd_filmwissen_loc_snapshot_lesen()
  to service_role;
grant execute on function public.kd_filmwissen_loc_snapshot_speichern(jsonb)
  to service_role;

comment on function public.kd_filmwissen_loc_snapshot_lesen() is
  'Liest ausschliesslich den kurzlebigen LOC-NFR-v2-Snapshot; v1 bleibt historisch unangetastet.';
comment on function public.kd_filmwissen_loc_snapshot_speichern(jsonb) is
  'Speichert ausschliesslich einen streng validierten LOC-NFR-v2-Snapshot unter eigenem Cache-Key.';

commit;
