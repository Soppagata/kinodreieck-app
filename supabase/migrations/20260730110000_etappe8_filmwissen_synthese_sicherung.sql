-- ===========================================================================
-- Etappe 8, Phase D — fail-closed Vorbereitung und sicherer Fehlerabschluss
--
-- Noch gibt es keinen serverseitigen Quellenadapter und keine freigeschaltete
-- Quelle. Diese Migration baut deshalb bewusst NICHT die Recherche selbst:
-- Die Vorbereitungs-RPC kann einen gueltigen Cache-Treffer melden, endet sonst
-- aber ehrlich mit `quellen_nicht_verfuegbar`, ohne Auftrag, KI-Log oder Kosten.
--
-- Der zweite RPC schliesst die P0-Luecke fuer den spaeteren echten Ablauf:
-- Scheitert ein bereits gestarteter Rechercheauftrag, wird sein aktiver
-- Partial-Unique-Slot freigegeben. Browserrollen erhalten auf beide Funktionen
-- keinerlei Recht.
--
-- Ausgefuehrt: 2026-07-30 durch Codex ueber die verknuepfte Management-API
-- Projekt: bscjgwcntapobyxsiyce
-- Nachweis: 8/8 statische Sicherungschecks; remote nur postgres/service_role
-- besitzen EXECUTE auf den beiden neuen RPCs.
-- ===========================================================================

begin;

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

  /* Ein Cache-Treffer zaehlt nur, wenn saemtliche Rechte und Domains JETZT
     noch gueltig sind. Kein optimistischer Treffer aus einem alten Zeiger. */
  if v_version is not null
     and exists (
       select 1
         from public.kd_filmwissen_versionen v
        where v.id = v_version
          and v.werk_id = v_werk
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
      'status','cache_hit',
      'werkId',v_werk,
      'versionId',v_version
    );
  end if;

  select a.id
    into v_auftrag
    from public.kd_filmwissen_auftraege a
   where a.werk_id = v_werk
     and a.status in ('bereit','laufend');
  if found then
    return jsonb_build_object(
      'status','bereits_laufend',
      'werkId',v_werk,
      'auftragId',v_auftrag
    );
  end if;

  /* Absichtliche Sperre: Freigegebene Domains allein sind noch keine
     serverseitig geholten, URL-gebundenen Fundstellen. Erst ein spaeterer
     Adapter darf hier `bereit` liefern. */
  return jsonb_build_object('status','quellen_nicht_verfuegbar','werkId',v_werk);
end
$$;

create or replace function public.kd_filmwissen_auftrag_fehlgeschlagen(
  p_auftrag uuid,
  p_kosten numeric,
  p_fehlerklasse text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if p_auftrag is null
     or p_kosten is not null and p_kosten < 0
     or p_fehlerklasse is null
     or p_fehlerklasse !~ '^[a-z][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9._-]{0,39}){0,3}$' then
    raise exception 'filmwissen_fehlerabschluss_ungueltig' using errcode = '22023';
  end if;

  update public.kd_filmwissen_auftraege
     set status = 'fehler',
         kosten_usd_cent = coalesce(p_kosten, kosten_usd_cent),
         fehlerklasse = p_fehlerklasse,
         abgeschlossen_at = now()
   where id = p_auftrag
     and status in ('bereit','laufend')
  returning status into v_status;

  if found then
    return jsonb_build_object('status','fehler');
  end if;

  select status into v_status
    from public.kd_filmwissen_auftraege
   where id = p_auftrag;
  if not found then
    raise exception 'filmwissen_auftrag_unbekannt' using errcode = '22023';
  end if;
  return jsonb_build_object('status','bereits_abgeschlossen','auftragStatus',v_status);
end
$$;

revoke all on function public.kd_filmwissen_synthese_vorbereiten(text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.kd_filmwissen_auftrag_fehlgeschlagen(uuid,numeric,text)
  from public, anon, authenticated;

grant execute on function public.kd_filmwissen_synthese_vorbereiten(text,text,uuid)
  to service_role;
grant execute on function public.kd_filmwissen_auftrag_fehlgeschlagen(uuid,numeric,text)
  to service_role;

comment on function public.kd_filmwissen_synthese_vorbereiten(text,text,uuid) is
  'Fail-closed Vorpruefung: bestehender Cache oder ehrliches Nichtverfuegbar; legt noch keinen Rechercheauftrag an.';
comment on function public.kd_filmwissen_auftrag_fehlgeschlagen(uuid,numeric,text) is
  'Schliesst einen aktiven Filmwissensauftrag als Fehler und gibt seinen Unique-Slot frei.';

commit;
