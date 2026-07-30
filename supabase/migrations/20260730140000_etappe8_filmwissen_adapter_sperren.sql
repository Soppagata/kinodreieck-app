-- ===========================================================================
-- Etappe 8, Phase D — Quellenadapter und Lebenszyklus fail-closed absichern
--
-- Diese Migration aktiviert bewusst KEINE Quelle. Sie registriert nur zwei
-- feste Kandidatenadapter und schliesst vor ihrer spaeteren Freigabe die
-- sicherheitsrelevanten Datenbankluecken:
--   - verwaiste Rechercheauftraege geben ihren Unique-Slot wieder frei,
--   - Adapterziele und instanzuebergreifende Ratenlimits liegen in der DB,
--   - die unabhaengige Herkunft jedes Belegs bleibt unveraenderlich erhalten,
--   - Filmwissen-Synthese hat einen eigenen harten 5-US-Cent-Deckel.
--
-- Ausgefuehrt: 2026-07-30 durch Codex ueber die verknuepfte Management-API.
-- Remote-Nachweis: beide Quellen Status kandidat und alle Rechte aus;
-- authenticated ohne Rate-RPC, service_role mit Rate-RPC; Herkunft NOT NULL;
-- Modell gross, 2048 Ausgabetokens, Task-Cap 5 US-Cent.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Feste Adaptermetadaten und unveraenderliche Herkunft
-- ---------------------------------------------------------------------------

alter table public.kd_filmwissen_quellen
  add column if not exists adapter_key text,
  add column if not exists abrufe_pro_minute smallint,
  add column if not exists ursprung text;

update public.kd_filmwissen_quellen
   set ursprung = coalesce(ursprung, 'legacy:' || slug)
 where ursprung is null;

alter table public.kd_filmwissen_quellen
  alter column ursprung set not null;

alter table public.kd_filmwissen_quellen
  drop constraint if exists kd_fwq_adapter_key_form,
  add constraint kd_fwq_adapter_key_form check (
    adapter_key is null or adapter_key ~ '^[a-z][a-z0-9_-]{1,59}$'
  ),
  drop constraint if exists kd_fwq_abrufe_pro_minute_form,
  add constraint kd_fwq_abrufe_pro_minute_form check (
    (adapter_key is null and abrufe_pro_minute is null)
    or (adapter_key is not null and abrufe_pro_minute between 1 and 120)
  ),
  drop constraint if exists kd_fwq_ursprung_form,
  add constraint kd_fwq_ursprung_form check (
    ursprung ~ '^[a-z][a-z0-9._:-]{1,79}$'
  );

create unique index if not exists kd_fwq_adapter_key_uniq
  on public.kd_filmwissen_quellen(adapter_key)
  where adapter_key is not null;

insert into public.kd_filmwissen_quellen(
  slug,domain,betreiber,status,
  websuche_erlaubt,seitenabruf_erlaubt,cache_erlaubt,
  paraphrase_erlaubt,anzeige_erlaubt,subdomains_erlaubt,
  attribution,rechtsstand,gueltig_bis,
  adapter_key,abrufe_pro_minute,ursprung
) values
  (
    'wikidata','www.wikidata.org','Wikimedia Foundation','kandidat',
    false,false,false,false,false,false,
    'Quelle: Wikidata (CC0 1.0)',date '2026-07-30',null,
    'wikidata-action-v1',60,'wikidata-community'
  ),
  (
    'loc-nfr','www.loc.gov','Library of Congress','kandidat',
    false,false,false,false,false,false,
    'Quelle: Library of Congress, National Film Registry',date '2026-07-30',null,
    'loc-nfr-listing-v1',10,'loc-national-film-registry'
  )
on conflict (slug) do nothing;

-- Eine vorbestehende gleichnamige Zeile darf die feste Adapterzuordnung nicht
-- still umbiegen. Die Migration stoppt dann vollstaendig.
do $adapter_vertrag$
begin
  if not exists (
    select 1 from public.kd_filmwissen_quellen
     where slug = 'wikidata'
       and domain = 'www.wikidata.org'
       and adapter_key = 'wikidata-action-v1'
       and ursprung = 'wikidata-community'
  ) or not exists (
    select 1 from public.kd_filmwissen_quellen
     where slug = 'loc-nfr'
       and domain = 'www.loc.gov'
       and adapter_key = 'loc-nfr-listing-v1'
       and ursprung = 'loc-national-film-registry'
  ) then
    raise exception 'filmwissen_adapter_konflikt';
  end if;
end
$adapter_vertrag$;

alter table public.kd_filmwissen_belege
  add column if not exists ursprung text;

update public.kd_filmwissen_belege b
   set ursprung = q.ursprung
  from public.kd_filmwissen_quellen q
 where b.quelle_slug = q.slug
   and b.ursprung is null;

alter table public.kd_filmwissen_belege
  alter column ursprung set not null,
  drop constraint if exists kd_fwb_ursprung_form,
  add constraint kd_fwb_ursprung_form check (
    ursprung ~ '^[a-z][a-z0-9._:-]{1,79}$'
  );

create or replace function public.kd_filmwissen_beleg_ursprung_setzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select q.ursprung into new.ursprung
    from public.kd_filmwissen_quellen q
   where q.slug = new.quelle_slug
     and q.status = 'freigegeben';
  if new.ursprung is null then
    raise exception 'filmwissen_beleg_ursprung_fehlt' using errcode = '22023';
  end if;
  return new;
end
$$;

drop trigger if exists kd_fwb_ursprung on public.kd_filmwissen_belege;
create trigger kd_fwb_ursprung
  before insert on public.kd_filmwissen_belege
  for each row execute function public.kd_filmwissen_beleg_ursprung_setzen();

-- ---------------------------------------------------------------------------
-- 2. Quellenweites Ratenlimit, nicht nur pro Edge-Instanz
-- ---------------------------------------------------------------------------

create table if not exists public.kd_filmwissen_quellen_abrufe (
  quelle_slug text not null references public.kd_filmwissen_quellen(slug) on delete restrict,
  fenster timestamptz not null,
  anzahl smallint not null check (anzahl between 1 and 120),
  primary key (quelle_slug, fenster),
  constraint kd_fwqa_minutenfenster check (fenster = date_trunc('minute', fenster))
);

alter table public.kd_filmwissen_quellen_abrufe enable row level security;
alter table public.kd_filmwissen_quellen_abrufe force row level security;
revoke all on table public.kd_filmwissen_quellen_abrufe
  from public, anon, authenticated;

create or replace function public.kd_filmwissen_quelle_abruf_reservieren(
  p_quelle text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := lower(trim(p_quelle));
  v_limit integer;
  v_fenster timestamptz := date_trunc('minute', clock_timestamp());
  v_anzahl integer;
begin
  if v_slug is null or v_slug !~ '^[a-z][a-z0-9_-]{1,39}$' then
    raise exception 'filmwissen_quelle_ungueltig' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('filmwissen-abruf:' || v_slug, 0));
  select abrufe_pro_minute into v_limit
    from public.kd_filmwissen_quellen
   where slug = v_slug
     and status = 'freigegeben'
     and seitenabruf_erlaubt
     and adapter_key is not null
     and (gueltig_bis is null or gueltig_bis >= current_date)
   for share;
  if not found or v_limit is null then
    return jsonb_build_object('ok',false,'code','quelle-nicht-freigegeben');
  end if;
  insert into public.kd_filmwissen_quellen_abrufe(quelle_slug,fenster,anzahl)
  values (v_slug,v_fenster,1)
  on conflict (quelle_slug,fenster) do update
     set anzahl = public.kd_filmwissen_quellen_abrufe.anzahl + 1
   where public.kd_filmwissen_quellen_abrufe.anzahl < v_limit
  returning anzahl into v_anzahl;
  if not found then
    return jsonb_build_object('ok',false,'code','quellen-rate-limit');
  end if;
  delete from public.kd_filmwissen_quellen_abrufe
   where fenster < v_fenster - interval '2 days';
  return jsonb_build_object('ok',true,'quelle',v_slug,'fenster',v_fenster,'anzahl',v_anzahl);
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Verwaiste Filmwissen-Auftraege
-- ---------------------------------------------------------------------------

create or replace function public.kd_filmwissen_verwaiste_schliessen()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timeout_ms integer;
  v_sicherheit_sec integer;
  v_anzahl integer;
begin
  select case
           when jsonb_typeof(wert) = 'number' and (wert #>> '{}') ~ '^[0-9]+$'
           then (wert #>> '{}')::integer
           else null
         end
    into v_timeout_ms
    from public.kd_ai_limits
   where schluessel = 'timeout_ms';
  if v_timeout_ms is null or v_timeout_ms < 1 or v_timeout_ms > 600000 then
    raise exception 'filmwissen_timeout_unbekannt';
  end if;
  v_sicherheit_sec := greatest(120, ceil(v_timeout_ms * 2.0 / 1000.0)::integer);
  update public.kd_filmwissen_auftraege
     set status = 'fehler',
         fehlerklasse = 'abgebrochen-ohne-abschluss',
         abgeschlossen_at = now()
   where (
     status = 'bereit'
     and erstellt_at < now() - make_interval(secs => v_sicherheit_sec)
   ) or (
     status = 'laufend'
     and gestartet_at is not null
     and gestartet_at < now() - make_interval(secs => v_sicherheit_sec)
   );
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end
$$;

-- Der fail-closed Vorbereitungspfad fuehrt die Bereinigung vor der
-- Dublettenpruefung aus. Er aktiviert weiterhin keinen Adapter.
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

-- ---------------------------------------------------------------------------
-- 4. Unabhaengige Urspruenge vor jeder Publikation
-- ---------------------------------------------------------------------------

alter function public.kd_filmwissen_veroeffentlichen(uuid,jsonb,jsonb)
  rename to kd_filmwissen_veroeffentlichen_ohne_ursprungspruefung;

revoke all on function
  public.kd_filmwissen_veroeffentlichen_ohne_ursprungspruefung(uuid,jsonb,jsonb)
  from public, anon, authenticated, service_role;

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
  v_slugs text[];
  v_domains integer;
  v_urspruenge integer;
  v_kosten numeric;
  v_cap jsonb;
begin
  if jsonb_typeof(p_belege) is distinct from 'array'
     or jsonb_array_length(p_belege) not between 2 and 5
     or exists (
       select 1 from jsonb_array_elements(p_belege) b
        where jsonb_typeof(b) is distinct from 'object'
           or jsonb_typeof(b->'quelle') is distinct from 'string'
     ) then
    raise exception 'filmwissen_belege_unabhaengig_ungueltig' using errcode = '22023';
  end if;
  select array_agg(lower(trim(b->>'quelle')) order by lower(trim(b->>'quelle')))
    into v_slugs
    from jsonb_array_elements(p_belege) b;
  if cardinality(v_slugs) <> (
       select count(distinct slug) from unnest(v_slugs) s(slug)
     ) then
    raise exception 'filmwissen_beleg_quelle_doppelt' using errcode = '22023';
  end if;
  perform q.slug
    from public.kd_filmwissen_quellen q
   where q.slug = any(v_slugs)
   order by q.slug
   for share;
  select count(distinct q.domain), count(distinct q.ursprung)
    into v_domains, v_urspruenge
    from public.kd_filmwissen_quellen q
   where q.slug = any(v_slugs)
     and q.status = 'freigegeben';
  if v_domains < 2 or v_urspruenge < 2 then
    raise exception 'filmwissen_belege_nicht_unabhaengig' using errcode = '22023';
  end if;
  if jsonb_typeof(p_version) is distinct from 'object'
     or jsonb_typeof(p_version->'kostenUsdCent') is distinct from 'number' then
    raise exception 'filmwissen_kosten_ungueltig' using errcode = '22023';
  end if;
  v_kosten := (p_version->>'kostenUsdCent')::numeric;
  select wert->'filmwissen-synthese' into v_cap
    from public.kd_ai_limits
   where schluessel = 'task_max_reservierung_usd_cent';
  if jsonb_typeof(v_cap) is distinct from 'number'
     or (v_cap #>> '{}') !~ '^[0-9]+(\.[0-9]+)?$'
     or v_kosten::text !~ '^[0-9]+(\.[0-9]+)?$'
     or v_kosten > (v_cap #>> '{}')::numeric then
    raise exception 'filmwissen_kostenlimit' using errcode = '22023';
  end if;
  return public.kd_filmwissen_veroeffentlichen_ohne_ursprungspruefung(
    p_auftrag,p_version,p_belege
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Task-spezifischer Kostenzaun vor dem KI-Log
-- ---------------------------------------------------------------------------

insert into public.kd_ai_limits(schluessel,wert,notiz)
values (
  'task_max_reservierung_usd_cent',
  '{"filmwissen-synthese":5}'::jsonb,
  'Harte Reservierungsobergrenze je KI-Aufgabe in US-Cent. Fehlender oder formfremder Filmwissen-Wert sperrt den Aufruf.'
)
on conflict (schluessel) do update
   set wert = jsonb_set(
         coalesce(public.kd_ai_limits.wert,'{}'::jsonb),
         '{filmwissen-synthese}','5'::jsonb,true
       ),
       notiz = excluded.notiz,
       geaendert_at = now();

update public.kd_ai_limits
   set wert = jsonb_set(coalesce(wert,'{}'::jsonb),'{filmwissen-synthese}','"gross"'::jsonb,true),
       geaendert_at = now()
 where schluessel = 'task_modell';
update public.kd_ai_limits
   set wert = jsonb_set(coalesce(wert,'{}'::jsonb),'{filmwissen-synthese}','2048'::jsonb,true),
       geaendert_at = now()
 where schluessel = 'task_max_tokens';

do $ki_konfiguration$
begin
  if not exists (
    select 1 from public.kd_ai_limits
     where schluessel = 'task_modell'
       and wert->>'filmwissen-synthese' = 'gross'
  ) or not exists (
    select 1 from public.kd_ai_limits
     where schluessel = 'task_max_tokens'
       and wert->>'filmwissen-synthese' = '2048'
  ) then
    raise exception 'filmwissen_ki_konfiguration_fehlt';
  end if;
end
$ki_konfiguration$;

alter function public.kd_ai_auftrag_starten(uuid,text,uuid,text,text,text,numeric)
  rename to kd_ai_auftrag_starten_ohne_task_cap;

revoke all on function
  public.kd_ai_auftrag_starten_ohne_task_cap(uuid,text,uuid,text,text,text,numeric)
  from public, anon, authenticated, service_role;

create or replace function public.kd_ai_auftrag_starten(
  p_account uuid,
  p_task text,
  p_vorgang uuid,
  p_modell_alias text default null,
  p_prompt_version text default null,
  p_profil_version text default null,
  p_reservierung numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cap jsonb;
begin
  if p_task = 'filmwissen-synthese' then
    select wert->p_task into v_cap
      from public.kd_ai_limits
     where schluessel = 'task_max_reservierung_usd_cent';
    if p_modell_alias is distinct from 'gross'
       or jsonb_typeof(v_cap) is distinct from 'number'
       or (v_cap #>> '{}') !~ '^[0-9]+(\.[0-9]+)?$'
       or p_reservierung is null
       or p_reservierung::text !~ '^[0-9]+(\.[0-9]+)?$' then
      return jsonb_build_object(
        'ok',false,'code','server','grund','task-kostenkonfiguration-ungueltig'
      );
    end if;
    if p_reservierung > (v_cap #>> '{}')::numeric then
      return jsonb_build_object(
        'ok',false,'code','limit','grund','task-kostenlimit-ueberschritten'
      );
    end if;
  end if;
  return public.kd_ai_auftrag_starten_ohne_task_cap(
    p_account,p_task,p_vorgang,p_modell_alias,p_prompt_version,
    p_profil_version,p_reservierung
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Rechte: Browser sieht keine neuen Steuerpfade
-- ---------------------------------------------------------------------------

revoke all on function public.kd_filmwissen_beleg_ursprung_setzen()
  from public, anon, authenticated, service_role;
revoke all on function public.kd_filmwissen_quelle_abruf_reservieren(text)
  from public, anon, authenticated;
revoke all on function public.kd_filmwissen_verwaiste_schliessen()
  from public, anon, authenticated;
revoke all on function public.kd_filmwissen_synthese_vorbereiten(text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.kd_filmwissen_veroeffentlichen(uuid,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.kd_ai_auftrag_starten(uuid,text,uuid,text,text,text,numeric)
  from public, anon, authenticated;

grant execute on function public.kd_filmwissen_quelle_abruf_reservieren(text)
  to service_role;
grant execute on function public.kd_filmwissen_verwaiste_schliessen()
  to service_role;
grant execute on function public.kd_filmwissen_synthese_vorbereiten(text,text,uuid)
  to service_role;
grant execute on function public.kd_filmwissen_veroeffentlichen(uuid,jsonb,jsonb)
  to service_role;
grant execute on function public.kd_ai_auftrag_starten(uuid,text,uuid,text,text,text,numeric)
  to service_role;

comment on table public.kd_filmwissen_quellen_abrufe is
  'Instanzuebergreifender Minutenzaehler fuer feste Filmwissen-Quellenadapter; enthaelt keine Inhalte oder Personenbezug.';
comment on function public.kd_filmwissen_verwaiste_schliessen() is
  'Schliesst Filmwissen-Auftraege erst nach mindestens doppeltem Pipeline-Timeout; erhaelt unbekannte Kosten.';
comment on function public.kd_filmwissen_quelle_abruf_reservieren(text) is
  'Reserviert einen serverseitigen Adapterabruf atomar gegen das quellenweite Minutenlimit.';

commit;
