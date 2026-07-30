-- ===========================================================================
-- Etappe 8, Phase D — vereinfachte Mindestbelegung aus dem Produkt-Steckbrief
--
-- Strukturquellen sichern Identitaet und Fakten, sind aber keine qualitative
-- Einordnung. Fuer einen WARUM-Zahlenwert gilt:
--   a) mindestens eine ausdrueckliche institutionelle Einordnung, oder
--   b) mindestens zwei unabhaengige verantwortete redaktionelle Quellen.
--
-- Der bestehende Publikationskern speichert weiterhin das gesamte kleine
-- Belegpaket (im ersten Adapterpaar Wikidata + LOC). Die qualitative
-- Mindestbelegung wird separat anhand der eingefrorenen Belegklasse geprueft.
-- Keine Quelle und kein Provider wird durch diese Migration aktiviert.
--
-- Ausgefuehrt: 2026-07-30 durch Codex ueber die verknuepfte Management-API.
-- Remote-Nachweis: LOC institutionell, Wikidata strukturiert, beide Kandidat
-- mit allen Rechten aus; Belegklasse NOT NULL; Publikation service-only.
-- ===========================================================================

begin;

alter table public.kd_filmwissen_quellen
  add column if not exists belegklasse text;

update public.kd_filmwissen_quellen
   set belegklasse = case slug
     when 'wikidata' then 'strukturiert'
     when 'loc-nfr' then 'institutionell'
     else 'strukturiert'
   end
 where belegklasse is null;

alter table public.kd_filmwissen_quellen
  alter column belegklasse set not null,
  drop constraint if exists kd_fwq_belegklasse_form,
  add constraint kd_fwq_belegklasse_form check (
    belegklasse in ('strukturiert','institutionell','redaktionell')
  );

alter table public.kd_filmwissen_belege
  add column if not exists belegklasse text;

update public.kd_filmwissen_belege b
   set belegklasse = q.belegklasse
  from public.kd_filmwissen_quellen q
 where b.quelle_slug = q.slug
   and b.belegklasse is null;

alter table public.kd_filmwissen_belege
  alter column belegklasse set not null,
  drop constraint if exists kd_fwb_belegklasse_form,
  add constraint kd_fwb_belegklasse_form check (
    belegklasse in ('strukturiert','institutionell','redaktionell')
  );

create or replace function public.kd_filmwissen_beleg_ursprung_setzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select q.ursprung, q.belegklasse
    into new.ursprung, new.belegklasse
    from public.kd_filmwissen_quellen q
   where q.slug = new.quelle_slug
     and q.status = 'freigegeben';
  if new.ursprung is null or new.belegklasse is null then
    raise exception 'filmwissen_beleg_herkunft_fehlt' using errcode = '22023';
  end if;
  return new;
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
  v_slugs text[];
  v_verantwortete integer;
  v_verantwortete_domains integer;
  v_verantwortete_urspruenge integer;
  v_institutionell integer;
  v_kosten numeric;
  v_cap jsonb;
begin
  -- Der interne, unveraenderliche Publikationskern erwartet das vollstaendige
  -- Belegpaket. Beim ersten Adapterpaar sind das Strukturidentitaet plus
  -- institutioneller Beleg; die Strukturquelle zaehlt fachlich nicht mit.
  if jsonb_typeof(p_belege) is distinct from 'array'
     or jsonb_array_length(p_belege) not between 2 and 5
     or exists (
       select 1 from jsonb_array_elements(p_belege) b
        where jsonb_typeof(b) is distinct from 'object'
           or jsonb_typeof(b->'quelle') is distinct from 'string'
     ) then
    raise exception 'filmwissen_belege_ungueltig' using errcode = '22023';
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

  select
    count(*) filter (
      where q.belegklasse in ('institutionell','redaktionell')
    ),
    count(distinct q.domain) filter (
      where q.belegklasse in ('institutionell','redaktionell')
    ),
    count(distinct q.ursprung) filter (
      where q.belegklasse in ('institutionell','redaktionell')
    ),
    count(*) filter (where q.belegklasse = 'institutionell')
    into v_verantwortete, v_verantwortete_domains,
         v_verantwortete_urspruenge, v_institutionell
    from public.kd_filmwissen_quellen q
   where q.slug = any(v_slugs)
     and q.status = 'freigegeben';

  if v_institutionell < 1
     and (
       v_verantwortete < 2
       or v_verantwortete_domains < 2
       or v_verantwortete_urspruenge < 2
     ) then
    raise exception 'filmwissen_mindestbelegung_fehlt' using errcode = '22023';
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

revoke all on function public.kd_filmwissen_beleg_ursprung_setzen()
  from public, anon, authenticated, service_role;
revoke all on function public.kd_filmwissen_veroeffentlichen(uuid,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.kd_filmwissen_veroeffentlichen(uuid,jsonb,jsonb)
  to service_role;

comment on column public.kd_filmwissen_quellen.belegklasse is
  'Fachliche Rolle fuer die WARUM-Mindestbelegung: strukturiert zaehlt nicht allein; institutionell darf allein tragen; redaktionell braucht zwei unabhaengige Quellen.';
comment on column public.kd_filmwissen_belege.belegklasse is
  'Unveraenderlicher Snapshot der Belegklasse zum Publikationszeitpunkt.';

commit;
