-- Review E10-004: TMDB has separate movie / television / collection namespaces.
-- Keep the existing RPC shape; encode the media type in the TMDB key itself.
-- Numeric legacy keys are never accepted by new readers or writers. Existing
-- film mappings retain their verification; non-film mappings are quarantined
-- until explicitly verified with the typed identifier, since the old adapter
-- only resolved P4947 (movies). No legacy key is silently trusted as television.
begin;
lock table public.kd_filmwerk_kennungen in access exclusive mode;
alter table public.kd_filmwerk_kennungen drop constraint kd_fwk_kennung_form;
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
    when lower(trim(p_namespace)) in ('watchmode','film_at')
         and trim(p_kennung) ~ '^[0-9]{1,18}$'
         and ltrim(trim(p_kennung), '0') <> ''
      then ltrim(trim(p_kennung), '0')
    when lower(trim(p_namespace)) = 'tmdb'
         and trim(p_kennung) ~ '^(movie|tv|collection):[0-9]{1,18}$'
         and ltrim(split_part(trim(p_kennung), ':', 2), '0') <> ''
      then split_part(trim(p_kennung), ':', 1) || ':' || ltrim(split_part(trim(p_kennung), ':', 2), '0')
    when lower(trim(p_namespace)) = 'wikidata'
         and upper(trim(p_kennung)) ~ '^Q[1-9][0-9]{0,17}$'
      then upper(trim(p_kennung))
    when lower(trim(p_namespace)) = 'kinodreieck'
         and trim(p_kennung) ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
      then trim(p_kennung)
    else null
  end
$$;
update public.kd_filmwerk_kennungen k
   set kennung = (case w.typ when 'film' then 'movie:' when 'serie' then 'tv:' else 'collection:' end) || k.kennung,
       status = case when w.typ = 'film' then k.status else 'gesperrt' end,
       geprueft_at = case when w.typ = 'film' then k.geprueft_at else null end
  from public.kd_filmwerke w
 where k.werk_id = w.id and k.namespace = 'tmdb';
alter table public.kd_filmwerk_kennungen add constraint kd_fwk_kennung_form check (
  char_length(kennung) between 1 and 160
  and kennung ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  and public.kd_filmwissen_kennung_norm(namespace, kennung) is not null
  and kennung = public.kd_filmwissen_kennung_norm(namespace, kennung)
);

-- Protect the relationship also from direct service writes and type changes.
create or replace function public.kd_filmwissen_tmdb_typ_pruefen()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_typ text;
begin
  if tg_table_name = 'kd_filmwerke' then
    if exists (select 1 from public.kd_filmwerk_kennungen k where k.werk_id = new.id and k.namespace = 'tmdb'
        and split_part(k.kennung, ':', 1) <> case new.typ when 'film' then 'movie' when 'serie' then 'tv' else 'collection' end) then
      raise exception 'tmdb_werktyp_widerspruch' using errcode = '22023';
    end if;
  elsif new.namespace = 'tmdb' then
    select typ into v_typ from public.kd_filmwerke where id = new.werk_id for share;
    if split_part(new.kennung, ':', 1) is distinct from
       (case v_typ when 'film' then 'movie' when 'serie' then 'tv' when 'filmreihe' then 'collection' end) then
      raise exception 'tmdb_werktyp_widerspruch' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.kd_filmwissen_tmdb_typ_pruefen() from public, anon, authenticated;
create trigger kd_fwk_tmdb_typ before insert or update on public.kd_filmwerk_kennungen
  for each row execute function public.kd_filmwissen_tmdb_typ_pruefen();
create trigger kd_fw_tmdb_typ before update of typ on public.kd_filmwerke
  for each row execute function public.kd_filmwissen_tmdb_typ_pruefen();

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

  if p_kennungen ? 'tmdb' and split_part(p_kennungen->>'tmdb', ':', 1) <>
     (case p_typ when 'film' then 'movie' when 'serie' then 'tv' when 'filmreihe' then 'collection' end) then
    raise exception 'tmdb_werktyp_widerspruch' using errcode = '22023';
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
    if exists (select 1 from public.kd_filmwerke where id = v_werk and typ <> p_typ) then
      raise exception 'werktyp_widerspruch' using errcode = '22023';
    end if;
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
     and (v_namespace <> 'tmdb' or split_part(v_kennung, ':', 1) =
       case w.typ when 'film' then 'movie' when 'serie' then 'tv' when 'filmreihe' then 'collection' end)
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

create or replace function public.kd_filmwissen_synthese_vorbereiten(
  p_namespace text,
  p_kennung text,
  p_vorgang uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_namespace text := lower(trim(p_namespace));
  v_kennung text;
  v_werk uuid;
  v_version uuid;
  v_auftrag uuid;
begin
  if p_vorgang is null then
    raise exception 'vorgang_fehlt' using errcode = '22023';
  end if;
  v_kennung := public.kd_filmwissen_kennung_norm(v_namespace, p_kennung);
  if v_kennung is null then
    raise exception 'kennung_ungueltig' using errcode = '22023';
  end if;
  perform public.kd_filmwissen_verwaiste_schliessen();
  select w.id, w.aktuelle_version_id
    into v_werk, v_version
    from public.kd_filmwerk_kennungen k
    join public.kd_filmwerke w on w.id = k.werk_id
   where k.namespace = v_namespace
     and k.kennung = v_kennung
     and (v_namespace <> 'tmdb' or split_part(v_kennung, ':', 1) =
       case w.typ when 'film' then 'movie' when 'serie' then 'tv' when 'filmreihe' then 'collection' end)
     and k.status = 'geprueft'
     and w.identitaetsstatus = 'geprueft';
  if not found then
    return jsonb_build_object('status','nicht_zuordenbar');
  end if;
  if v_version is not null
     and exists (
       select 1 from public.kd_filmwissen_versionen v
        where v.id = v_version and v.werk_id = v_werk
     )
     and not exists (
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
    return jsonb_build_object(
      'status','cache_hit','werkId',v_werk,'versionId',v_version
    );
  end if;
  select a.id into v_auftrag
    from public.kd_filmwissen_auftraege a
   where a.werk_id = v_werk and a.status in ('bereit','laufend');
  if found then
    return jsonb_build_object(
      'status','bereits_laufend','werkId',v_werk,'auftragId',v_auftrag
    );
  end if;
  return jsonb_build_object('status','quellen_nicht_verfuegbar','werkId',v_werk);
end
$$;

-- Reassert the existing public boundary without granting table access.
revoke all on function public.kd_filmwissen_aktuell_lesen(text,text) from public, anon, authenticated;
grant execute on function public.kd_filmwissen_aktuell_lesen(text,text) to authenticated, service_role;
revoke all on function public.kd_filmwissen_synthese_vorbereiten(text,text,uuid) from public, anon, authenticated;
grant execute on function public.kd_filmwissen_synthese_vorbereiten(text,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
