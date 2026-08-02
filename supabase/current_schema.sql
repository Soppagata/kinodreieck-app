
-- Kinodreieck: bereinigter Current-Schema-Snapshot
-- Erzeugt am 31.07.2026 aus dem verknüpften Produktionsprojekt mit
-- `supabase db dump --linked --schema public` und PostgreSQL 17; anschließend
-- auf den angewandten Stand 20260731170000 gebracht und um die als Nächstes
-- laufende additive Migration 20260802120000 ergänzt. Erwarteter Stand danach:
-- 19 Tabellen / 43 Funktionen / 13 Trigger / 25 Policies.
--
-- Enthält ausschließlich Schema: Tabellen, Constraints, Funktionen, Trigger,
-- RLS-Policies und Grants. Keine Tabellenzeilen, Konten oder Secrets.
-- Historische Migrationen bleiben unverändert die Änderungshistorie; diese
-- Datei ist der prüf- und wiederherstellbare Ist-Stand für neue Umgebungen.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."kd_ai_auftrag_beenden"("p_id" bigint, "p_status" "text", "p_modell" "text" DEFAULT NULL::"text", "p_input_tokens" integer DEFAULT NULL::integer, "p_output_tokens" integer DEFAULT NULL::integer, "p_kosten" numeric DEFAULT NULL::numeric, "p_fehlerklasse" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_status not in ('fertig', 'fehler') then
    raise exception 'Ungueltiger Endstatus: %', p_status;
  end if;
  update public.kd_ai_log
     set status          = p_status,
         modell          = coalesce(p_modell, modell),
         input_tokens    = coalesce(p_input_tokens, input_tokens),
         output_tokens   = coalesce(p_output_tokens, output_tokens),
         kosten_usd_cent = coalesce(p_kosten, kosten_usd_cent),
         fehlerklasse    = p_fehlerklasse,
         beendet_at      = now(),
         dauer_ms        = greatest(0, (extract(epoch from (now() - gestartet_at)) * 1000)::integer)
   where id = p_id;
end;
$$;


ALTER FUNCTION "public"."kd_ai_auftrag_beenden"("p_id" bigint, "p_status" "text", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_ai_auftrag_beenden"("p_id" bigint, "p_status" "text", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") IS 'Schliesst eine laufend-Zeile ab und traegt Verbrauch bzw. Fehlerklasse nach. Nur fuer service_role.';



CREATE OR REPLACE FUNCTION "public"."kd_ai_auftrag_starten"("p_account" "uuid", "p_task" "text", "p_vorgang" "uuid", "p_modell_alias" "text" DEFAULT NULL::"text", "p_prompt_version" "text" DEFAULT NULL::"text", "p_profil_version" "text" DEFAULT NULL::"text", "p_reservierung" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."kd_ai_auftrag_starten"("p_account" "uuid", "p_task" "text", "p_vorgang" "uuid", "p_modell_alias" "text", "p_prompt_version" "text", "p_profil_version" "text", "p_reservierung" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_ai_auftrag_starten_ohne_task_cap"("p_account" "uuid", "p_task" "text", "p_vorgang" "uuid", "p_modell_alias" "text" DEFAULT NULL::"text", "p_prompt_version" "text" DEFAULT NULL::"text", "p_profil_version" "text" DEFAULT NULL::"text", "p_reservierung" numeric DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_aktiv       boolean;
  v_budget      numeric;
  v_tageslimit  integer;
  v_parallel    integer;
  v_timeout_ms  integer;
  v_verbraucht  numeric;
  v_heute       integer;
  v_laufend     integer;
  v_id          bigint;
begin
  perform pg_advisory_xact_lock(778005);

  select coalesce((wert)::text::boolean, true) into v_aktiv
    from public.kd_ai_limits where schluessel = 'ai_aktiv';
  if v_aktiv is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'ai-disabled', 'grund', 'not-aus-gesetzt');
  end if;

  select (wert)::text::numeric into v_budget
    from public.kd_ai_limits where schluessel = 'monatsbudget_usd_cent';
  select (wert)::text::integer into v_tageslimit
    from public.kd_ai_limits where schluessel = 'tageslimit_auftraege';
  select (wert)::text::integer into v_parallel
    from public.kd_ai_limits where schluessel = 'parallel_max';
  select (wert)::text::integer into v_timeout_ms
    from public.kd_ai_limits where schluessel = 'timeout_ms';

  -- B3: fail-closed. Eine fehlende Grenze ist keine fehlende Grenze, sondern
  -- ein Konfigurationsfehler. Vorher liefen bei gelöschten Zeilen 40 von 40
  -- Versuchen durch.
  if v_budget is null or v_tageslimit is null or v_parallel is null then
    return jsonb_build_object('ok', false, 'code', 'server',
                              'grund', 'limitkonfiguration-unvollstaendig');
  end if;
  v_timeout_ms := coalesce(v_timeout_ms, 30000);

  -- B4: Reservierungen zählen mit. `kosten_usd_cent` trägt bei laufenden
  -- Zeilen die Schätzung; der Abschluss ersetzt sie durch den Istwert.
  select coalesce(sum(kosten_usd_cent), 0) into v_verbraucht
    from public.kd_ai_log
   where gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                         at time zone 'Europe/Vienna';
  if v_verbraucht + coalesce(p_reservierung, 0) > v_budget then
    return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'monatsbudget-erschoepft');
  end if;

  if p_account is not null then
    select count(*) into v_heute
      from public.kd_ai_log
     where account_id = p_account
       and gestartet_at >= date_trunc('day', now() at time zone 'Europe/Vienna')
                           at time zone 'Europe/Vienna';
    if v_heute >= v_tageslimit then
      return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'tageslimit-erreicht');
    end if;

    select count(*) into v_laufend
      from public.kd_ai_log
     where account_id = p_account
       and status = 'laufend'
       and gestartet_at > now() - make_interval(secs => v_timeout_ms / 1000.0);
    if v_laufend >= v_parallel then
      return jsonb_build_object('ok', false, 'code', 'limit', 'grund', 'zu-viele-gleichzeitig');
    end if;
  end if;

  insert into public.kd_ai_log
    (account_id, vorgang_id, task, status, modell_alias, prompt_version, profil_version, kosten_usd_cent)
  values
    (p_account, p_vorgang, p_task, 'laufend', p_modell_alias, p_prompt_version, p_profil_version,
     greatest(coalesce(p_reservierung, 0), 0))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'log_id', v_id, 'modell_alias', p_modell_alias);
exception
  when unique_violation then
    -- W4: eigener Code. „Nutzungslimit erreicht" war hier schlicht gelogen.
    return jsonb_build_object('ok', false, 'code', 'ai-duplicate', 'grund', 'vorgang-bereits-gestartet');
end;
$$;


ALTER FUNCTION "public"."kd_ai_auftrag_starten_ohne_task_cap"("p_account" "uuid", "p_task" "text", "p_vorgang" "uuid", "p_modell_alias" "text", "p_prompt_version" "text", "p_profil_version" "text", "p_reservierung" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_ai_auftrag_starten_ohne_task_cap"("p_account" "uuid", "p_task" "text", "p_vorgang" "uuid", "p_modell_alias" "text", "p_prompt_version" "text", "p_profil_version" "text", "p_reservierung" numeric) IS 'Prueft Not-Aus, Monatsbudget (inkl. Reservierungen laufender Auftraege), Tageslimit und Parallelitaet und legt bei Erfolg die laufend-Zeile mit reservierten Kosten an — atomar unter Vorhaengeschloss-Sperre. Fail-closed bei unvollstaendiger Konfiguration. Nur fuer service_role.';



CREATE OR REPLACE FUNCTION "public"."kd_ai_log_abraeumen"("p_tage" integer DEFAULT 90) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_weg integer;
begin
  delete from public.kd_ai_log
   where gestartet_at < now() - make_interval(days => greatest(1, p_tage));
  get diagnostics v_weg = row_count;
  return v_weg;
end;
$$;


ALTER FUNCTION "public"."kd_ai_log_abraeumen"("p_tage" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_ai_log_abraeumen"("p_tage" integer) IS 'Loescht Protokollzeilen aelter als p_tage (Standard 90). Von Hand auszufuehren, siehe Runbook in docs/ETAPPE_5_KI_UNTERBAU.md.';



CREATE OR REPLACE FUNCTION "public"."kd_ai_stand"("p_account" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_timeout_ms integer;
  v_budget     numeric;
  v_global     numeric;
begin
  select (wert)::text::integer into v_timeout_ms
    from public.kd_ai_limits where schluessel = 'timeout_ms';
  v_timeout_ms := coalesce(v_timeout_ms, 30000);

  select (wert)::text::numeric into v_budget
    from public.kd_ai_limits where schluessel = 'monatsbudget_usd_cent';

  select coalesce(sum(kosten_usd_cent), 0) into v_global
    from public.kd_ai_log
   where gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                         at time zone 'Europe/Vienna';

  return jsonb_build_object(
    -- W2: der eigene Verbrauch. Der globale Stand des Betreibers geht ein
    -- angemeldetes Konto nichts an; er erscheint nur noch als Ja/Nein.
    'monatVerbrauchtUsdCent', (
      select coalesce(sum(kosten_usd_cent), 0) from public.kd_ai_log
       where p_account is not null and account_id = p_account
         and gestartet_at >= date_trunc('month', now() at time zone 'Europe/Vienna')
                             at time zone 'Europe/Vienna'),
    'budgetErschoepft', (v_budget is not null and v_global >= v_budget),
    'heuteAuftraege', (
      select count(*) from public.kd_ai_log
       where p_account is not null and account_id = p_account
         and gestartet_at >= date_trunc('day', now() at time zone 'Europe/Vienna')
                             at time zone 'Europe/Vienna'),
    'laufend', (
      select count(*) from public.kd_ai_log
       where p_account is not null and account_id = p_account
         and status = 'laufend'
         and gestartet_at > now() - make_interval(secs => v_timeout_ms / 1000.0))
  );
end;
$$;


ALTER FUNCTION "public"."kd_ai_stand"("p_account" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_ai_stand"("p_account" "uuid") IS 'Nur-Lese-Momentaufnahme des EIGENEN Verbrauchs. Der globale Budgetstand erscheint nur als Ja/Nein. Legt keine Zeile an.';



CREATE OR REPLACE FUNCTION "public"."kd_ai_verwaiste_schliessen"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_timeout_ms integer;
  v_zahl       integer;
begin
  select (wert)::text::integer into v_timeout_ms
    from public.kd_ai_limits where schluessel = 'timeout_ms';
  v_timeout_ms := coalesce(v_timeout_ms, 30000);

  update public.kd_ai_log
     set status       = 'fehler',
         fehlerklasse = coalesce(fehlerklasse, 'abgebrochen-ohne-abschluss'),
         beendet_at   = now()
   where status = 'laufend'
     -- Doppelte Zeitgrenze: ein Lauf, der noch unterwegs sein KÖNNTE, wird
     -- nicht angefasst.
     and gestartet_at < now() - make_interval(secs => (v_timeout_ms * 2) / 1000.0);
  get diagnostics v_zahl = row_count;
  return v_zahl;
end;
$$;


ALTER FUNCTION "public"."kd_ai_verwaiste_schliessen"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_ai_verwaiste_schliessen"() IS 'Schliesst laufend-Zeilen, deren Lauf abgebrochen ist (aelter als die doppelte Zeitgrenze). Die reservierten Kosten bleiben gebucht. Von Hand, siehe Runbook.';



CREATE OR REPLACE FUNCTION "public"."kd_block_legacy_shared_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  if new.scope = 'shared' then
    raise exception 'legacy shared publications are retired'
      using errcode = '42501';
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."kd_block_legacy_shared_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_catalog_abgelaufene"() RETURNS TABLE("name" "text", "quelle" "text", "gueltig_bis" timestamp with time zone, "tage_ueberfaellig" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select c.name, c.quelle, c.gueltig_bis,
         round(extract(epoch from (now() - c.gueltig_bis)) / 86400.0, 1)
    from public.kd_catalog c
   where c.gueltig_bis is not null and c.gueltig_bis < now()
   order by c.gueltig_bis
$$;


ALTER FUNCTION "public"."kd_catalog_abgelaufene"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_catalog_abraeumen"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare n integer;
begin
  delete from public.kd_catalog
   where gueltig_bis is not null and gueltig_bis < now();
  get diagnostics n = row_count;
  return n;
end
$$;


ALTER FUNCTION "public"."kd_catalog_abraeumen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_catalog_eintraege"("p_name" "text", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case
    when p_name like 'programm%' then
      coalesce(p_payload -> 'filme', p_payload -> 'data' -> 'filme', '[]'::jsonb)
    when p_name like 'streaming_bekannt%'
      or p_name like 'streaming_entdecken%' then
      coalesce(p_payload -> 'titel', '[]'::jsonb)
    when p_name like 'streaming%' then
      coalesce(p_payload -> 'bekannt' -> 'titel', '[]'::jsonb)
      || coalesce(p_payload -> 'entdecken' -> 'titel', '[]'::jsonb)
    else '[]'::jsonb
  end
$$;


ALTER FUNCTION "public"."kd_catalog_eintraege"("p_name" "text", "p_payload" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_catalog_eintraege"("p_name" "text", "p_payload" "jsonb") IS 'Liste der veroeffentlichten Eintraege einer Katalog-Payload (Filme bzw. Titel).';



CREATE OR REPLACE FUNCTION "public"."kd_catalog_quellen_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  q          public.kd_quellen%rowtype;
  verboten   text;
  braucht    boolean;
begin
  if tg_op = 'UPDATE' and new.quelle is null then
    new.quelle := old.quelle;
  end if;

  braucht := new.name in (
    'programm', 'streaming', 'programm_demo', 'streaming_demo', 'demo_seed',
    'streaming_bekannt', 'streaming_entdecken',
    'streaming_bekannt_demo', 'streaming_entdecken_demo'
  );

  if braucht and new.quelle is null then
    raise exception
      'Zeile %: ohne Herkunft wird nichts veroeffentlicht. Setze quelle auf einen Slug aus kd_quellen.',
      new.name;
  end if;

  if right(new.name, 5) = '_demo' then
    if new.stand is null or new.gueltig_bis is null then
      raise exception
        'Demo-Zeile %: stand und gueltig_bis sind Pflicht (ehrlicher Schnappschuss).',
        new.name;
    end if;
  end if;

  if new.name = 'demo_seed' then
    if new.stand is null
      or jsonb_typeof(new.payload) <> 'object'
      or new.payload ->> 'format' <> '1'
      or jsonb_typeof(new.payload -> 'master' -> 'filme') <> 'array'
      or octet_length(new.payload::text) > 2097152 then
      raise exception
        'demo_seed: Format 1, Stand und master.filme[] sind Pflicht; maximal 2 MiB';
    end if;
  end if;

  if new.name like 'streaming_bekannt%'
    or new.name like 'streaming_entdecken%' then
    if jsonb_typeof(new.payload) <> 'object'
      or jsonb_typeof(new.payload -> 'titel') <> 'array' then
      raise exception 'Zeile %: payload.titel[] ist Pflicht.', new.name;
    end if;
  end if;

  if new.quelle is not null then
    select * into q from public.kd_quellen where slug = new.quelle;
    if not found then
      raise exception 'Quelle % steht nicht im Register kd_quellen.', new.quelle;
    end if;
    if q.status in ('pausiert', 'widerrufen', 'abgelaufen') then
      raise exception 'Quelle % hat Status % — Veroeffentlichung gesperrt.', new.quelle, q.status;
    end if;

    if q.erlaubte_felder is not null then
      verboten := public.kd_catalog_verbotenes_feld(
        public.kd_catalog_eintraege(new.name, new.payload), q.erlaubte_felder);
      if verboten is not null then
        raise exception
          'Zeile %: Feld "%" ist fuer Quelle % nicht freigegeben (siehe kd_quellen.erlaubte_felder).',
          new.name, verboten, new.quelle;
      end if;
    end if;
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."kd_catalog_quellen_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_catalog_streaming_aufteilen"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  bekannt_name   text;
  entdecken_name text;
begin
  if tg_op = 'DELETE' then
    if old.name not in ('streaming', 'streaming_demo') then
      return old;
    end if;
    bekannt_name := case old.name
      when 'streaming' then 'streaming_bekannt'
      else 'streaming_bekannt_demo'
    end;
    entdecken_name := case old.name
      when 'streaming' then 'streaming_entdecken'
      else 'streaming_entdecken_demo'
    end;
    delete from public.kd_catalog where name in (bekannt_name, entdecken_name);
    return old;
  end if;

  if new.name not in ('streaming', 'streaming_demo') then
    return new;
  end if;

  if jsonb_typeof(new.payload -> 'bekannt') <> 'object'
    or jsonb_typeof(new.payload -> 'bekannt' -> 'titel') <> 'array'
    or jsonb_typeof(new.payload -> 'entdecken') <> 'object'
    or jsonb_typeof(new.payload -> 'entdecken' -> 'titel') <> 'array' then
    raise exception 'Zeile %: bekannt.titel[] und entdecken.titel[] sind Pflicht.',
      new.name;
  end if;

  bekannt_name := case new.name
    when 'streaming' then 'streaming_bekannt'
    else 'streaming_bekannt_demo'
  end;
  entdecken_name := case new.name
    when 'streaming' then 'streaming_entdecken'
    else 'streaming_entdecken_demo'
  end;

  insert into public.kd_catalog
    (name, payload, sha256, updated_at, quelle, stand, gueltig_bis)
  values
    (bekannt_name, new.payload -> 'bekannt', new.sha256, new.updated_at,
      new.quelle, new.stand, new.gueltig_bis),
    (entdecken_name, new.payload -> 'entdecken', new.sha256, new.updated_at,
      new.quelle, new.stand, new.gueltig_bis)
  on conflict (name) do update
    set payload = excluded.payload,
        sha256 = excluded.sha256,
        updated_at = excluded.updated_at,
        quelle = excluded.quelle,
        stand = excluded.stand,
        gueltig_bis = excluded.gueltig_bis;

  return new;
end
$$;


ALTER FUNCTION "public"."kd_catalog_streaming_aufteilen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_catalog_verbotenes_feld"("p_eintraege" "jsonb", "p_erlaubt" "text"[]) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select k
    from jsonb_array_elements(p_eintraege) as e,
         lateral jsonb_object_keys(e.value) as k
   where not (k = any (p_erlaubt))
   limit 1
$$;


ALTER FUNCTION "public"."kd_catalog_verbotenes_feld"("p_eintraege" "jsonb", "p_erlaubt" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_adapter_vorbereiten"("p_vorgang" "uuid", "p_werk" "jsonb", "p_kennungen" "jsonb", "p_quellen" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_adapter_vorbereiten"("p_vorgang" "uuid", "p_werk" "jsonb", "p_kennungen" "jsonb", "p_quellen" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_filmwissen_adapter_vorbereiten"("p_vorgang" "uuid", "p_werk" "jsonb", "p_kennungen" "jsonb", "p_quellen" "text"[]) IS 'Atomisiert Werkzuordnung, Identitaetspruefung und Start des ausdruecklichen Filmwissen-Berichts.';



CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_aktuell_lesen"("p_namespace" "text", "p_kennung" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_aktuell_lesen"("p_namespace" "text", "p_kennung" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_filmwissen_aktuell_lesen"("p_namespace" "text", "p_kennung" "text") IS 'Einzige Browser-Lesegrenze: starke gepruefte Kennung rein, streng begrenztes aktuell freigegebenes Filmwissen raus.';



CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_auftrag_fehlgeschlagen"("p_auftrag" "uuid", "p_kosten" numeric, "p_fehlerklasse" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."kd_filmwissen_auftrag_fehlgeschlagen"("p_auftrag" "uuid", "p_kosten" numeric, "p_fehlerklasse" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_filmwissen_auftrag_fehlgeschlagen"("p_auftrag" "uuid", "p_kosten" numeric, "p_fehlerklasse" "text") IS 'Schliesst einen aktiven Filmwissensauftrag als Fehler und gibt seinen Unique-Slot frei.';



CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_auftrag_starten"("p_werk" "uuid", "p_vorgang" "uuid", "p_anlass" "text", "p_quellen" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_auftrag_starten"("p_werk" "uuid", "p_vorgang" "uuid", "p_anlass" "text", "p_quellen" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_beleg_ursprung_setzen"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_beleg_ursprung_setzen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_kennung_norm"("p_namespace" "text", "p_kennung" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."kd_filmwissen_kennung_norm"("p_namespace" "text", "p_kennung" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_loc_snapshot_lesen"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_loc_snapshot_lesen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_loc_snapshot_speichern"("p_snapshot" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."kd_filmwissen_loc_snapshot_speichern"("p_snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_quelle_abruf_reservieren"("p_quelle" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."kd_filmwissen_quelle_abruf_reservieren"("p_quelle" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_filmwissen_quelle_abruf_reservieren"("p_quelle" "text") IS 'Reserviert einen serverseitigen Adapterabruf atomar gegen das quellenweite Minutenlimit.';



CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_quelle_speichern"("p_quelle" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_quelle_speichern"("p_quelle" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_quellen_hash"("p_slugs" "text"[]) RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_quellen_hash"("p_slugs" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_synthese_abschliessen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_version" "jsonb", "p_belege" "jsonb", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_vorgang uuid;
  v_version uuid;
begin
  if p_auftrag is null
     or p_ai_log is null or p_ai_log <= 0
     or p_modell is null or p_modell !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
     or p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_kosten is null
     or p_kosten::text !~ '^[0-9]+(\.[0-9]+)?$'
     or jsonb_typeof(p_version) is distinct from 'object'
     or jsonb_typeof(p_version->'kostenUsdCent') is distinct from 'number'
     or (p_version->>'kostenUsdCent') !~ '^[0-9]+(\.[0-9]+)?$'
     or (p_version->>'kostenUsdCent')::numeric is distinct from p_kosten
     or p_version->>'modell' is distinct from p_modell then
    raise exception 'filmwissen_atomarer_abschluss_ungueltig' using errcode = '22023';
  end if;

  select vorgang_id into v_vorgang
    from public.kd_filmwissen_auftraege
   where id = p_auftrag
     and status in ('bereit','laufend');
  if not found then
    raise exception 'filmwissen_auftrag_nicht_aktiv' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.kd_ai_log
     where id = p_ai_log
       and vorgang_id = v_vorgang
       and task = 'filmwissen-synthese'
       and status = 'laufend'
  ) then
    raise exception 'filmwissen_ai_log_nicht_zugeordnet' using errcode = '22023';
  end if;

  -- Diese Funktion prueft erneut Quellen, Urspruenge und 5-Cent-Istkosten.
  -- Jeder spaetere Fehler in dieser aeusseren Funktion rollt auch ihre
  -- Publikation zurueck, weil PL/pgSQL keinen Zwischen-Commit ausfuehrt.
  v_version := public.kd_filmwissen_veroeffentlichen(
    p_auftrag,p_version,p_belege
  );

  update public.kd_ai_log
     set status = 'fertig',
         modell = p_modell,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         kosten_usd_cent = p_kosten,
         fehlerklasse = null,
         beendet_at = now(),
         dauer_ms = greatest(
           0,(extract(epoch from (now() - gestartet_at)) * 1000)::integer
         )
   where id = p_ai_log
     and vorgang_id = v_vorgang
     and task = 'filmwissen-synthese'
     and status = 'laufend';
  if not found then
    raise exception 'filmwissen_ai_log_abschluss_kollision' using errcode = '40001';
  end if;

  return jsonb_build_object('status','fertig','versionId',v_version);
end
$_$;


ALTER FUNCTION "public"."kd_filmwissen_synthese_abschliessen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_version" "jsonb", "p_belege" "jsonb", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_filmwissen_synthese_abschliessen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_version" "jsonb", "p_belege" "jsonb", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric) IS 'Publiziert Filmwissen und schliesst exakt das zugehoerige laufende KI-Log atomar; jede Abweichung rollt beides zurueck.';



CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_synthese_fehlgeschlagen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_vorgang uuid;
begin
  if p_auftrag is null
     or p_ai_log is null or p_ai_log <= 0
     or p_modell is not null
        and p_modell !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
     or p_input_tokens is not null and p_input_tokens < 0
     or p_output_tokens is not null and p_output_tokens < 0
     or p_kosten is not null
        and p_kosten::text !~ '^[0-9]+(\.[0-9]+)?$'
     or p_fehlerklasse is null
     or p_fehlerklasse !~ '^[a-z][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9._-]{0,39}){0,3}$' then
    raise exception 'filmwissen_atomarer_fehlerabschluss_ungueltig'
      using errcode = '22023';
  end if;

  select vorgang_id into v_vorgang
    from public.kd_filmwissen_auftraege
   where id = p_auftrag
     and status in ('bereit','laufend');
  if not found then
    raise exception 'filmwissen_auftrag_nicht_aktiv' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.kd_ai_log
     where id = p_ai_log
       and vorgang_id = v_vorgang
       and task = 'filmwissen-synthese'
       and status = 'laufend'
  ) then
    raise exception 'filmwissen_ai_log_nicht_zugeordnet' using errcode = '22023';
  end if;

  perform public.kd_filmwissen_auftrag_fehlgeschlagen(
    p_auftrag,p_kosten,p_fehlerklasse
  );

  update public.kd_ai_log
     set status = 'fehler',
         modell = coalesce(p_modell,modell),
         input_tokens = coalesce(p_input_tokens,input_tokens),
         output_tokens = coalesce(p_output_tokens,output_tokens),
         kosten_usd_cent = coalesce(p_kosten,kosten_usd_cent),
         fehlerklasse = p_fehlerklasse,
         beendet_at = now(),
         dauer_ms = greatest(
           0,(extract(epoch from (now() - gestartet_at)) * 1000)::integer
         )
   where id = p_ai_log
     and vorgang_id = v_vorgang
     and task = 'filmwissen-synthese'
     and status = 'laufend';
  if not found then
    raise exception 'filmwissen_ai_log_abschluss_kollision' using errcode = '40001';
  end if;

  return jsonb_build_object('status','fehler');
end
$_$;


ALTER FUNCTION "public"."kd_filmwissen_synthese_fehlgeschlagen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_filmwissen_synthese_fehlgeschlagen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") IS 'Schliesst Filmwissen-Auftrag und exakt zugeordnetes KI-Log atomar als Fehler; unbekannte Kosten bleiben reserviert.';



CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_synthese_vorbereiten"("p_namespace" "text", "p_kennung" "text", "p_vorgang" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_synthese_vorbereiten"("p_namespace" "text", "p_kennung" "text", "p_vorgang" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_filmwissen_synthese_vorbereiten"("p_namespace" "text", "p_kennung" "text", "p_vorgang" "uuid") IS 'Fail-closed Vorpruefung: bestehender Cache oder ehrliches Nichtverfuegbar; legt noch keinen Rechercheauftrag an.';



CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.geaendert_at := now();
  return new;
end
$$;


ALTER FUNCTION "public"."kd_filmwissen_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_unveraenderlich"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'filmwissen_unveraenderlich'
    using errcode = '55000';
end
$$;


ALTER FUNCTION "public"."kd_filmwissen_unveraenderlich"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_veroeffentlichen"("p_auftrag" "uuid", "p_version" "jsonb", "p_belege" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."kd_filmwissen_veroeffentlichen"("p_auftrag" "uuid", "p_version" "jsonb", "p_belege" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_veroeffentlichen_ohne_ursprungspruefung"("p_auftrag" "uuid", "p_version" "jsonb", "p_belege" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_veroeffentlichen_ohne_ursprungspruefung"("p_auftrag" "uuid", "p_version" "jsonb", "p_belege" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_version_setzen"("p_werk" "uuid", "p_version" "uuid", "p_grund" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_version_setzen"("p_werk" "uuid", "p_version" "uuid", "p_grund" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_verwaiste_schliessen"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."kd_filmwissen_verwaiste_schliessen"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."kd_filmwissen_verwaiste_schliessen"() IS 'Schliesst Filmwissen-Auftraege erst nach mindestens doppeltem Pipeline-Timeout; erhaelt unbekannte Kosten.';



CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_werk_pruefen"("p_werk" "uuid", "p_kennungen" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_werk_pruefen"("p_werk" "uuid", "p_kennungen" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_filmwissen_werk_sicherstellen"("p_typ" "text", "p_titel" "text", "p_originaltitel" "text", "p_jahr" integer, "p_kennungen" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."kd_filmwissen_werk_sicherstellen"("p_typ" "text", "p_titel" "text", "p_originaltitel" "text", "p_jahr" integer, "p_kennungen" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_key_ok"("the_owner" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.kd_owner o
    where o.owner = the_owner
      and o.key_sha256 = encode(sha256(convert_to(
            coalesce((current_setting('request.headers', true)::json ->> 'x-kd-key'), ''),
            'UTF8')), 'hex')
  );
$$;


ALTER FUNCTION "public"."kd_key_ok"("the_owner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_list_shared_articles"() RETURNS TABLE("publication_id" "uuid", "article_id" "text", "author" "text", "payload" "jsonb", "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  select
    s.publication_id,
    s.article_id,
    s.author,
    s.payload,
    s.updated_at
  from public.kd_shared_articles as s
  order by s.updated_at desc, s.publication_id
$$;


ALTER FUNCTION "public"."kd_list_shared_articles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_personal_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
  else
    new.revision := 1;
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."kd_personal_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_set_series_watch"("p_watchmode_ids" bigint[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_account uuid := auth.uid();
  v_ids bigint[] := coalesce(p_watchmode_ids, array[]::bigint[]);
begin
  if v_account is null then
    raise exception 'Anmeldung erforderlich';
  end if;
  if cardinality(v_ids) > 200 or exists (
    select 1 from unnest(v_ids) as id where id is null or id <= 0
  ) then
    raise exception 'Ungültige Serien-Beobachtungsliste';
  end if;

  delete from public.kd_series_watch where account_id = v_account;
  insert into public.kd_series_watch (account_id, watchmode_id, active, updated_at)
  select v_account, id, true, now()
    from (select distinct unnest(v_ids) as id) ids
   on conflict (account_id, watchmode_id) do update
     set active = true, updated_at = excluded.updated_at;
end;
$$;


ALTER FUNCTION "public"."kd_set_series_watch"("p_watchmode_ids" bigint[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_quelle_status_setzen"("p_slug" "text", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare q public.kd_quellen%rowtype;
begin
  select * into q from public.kd_quellen where slug = p_slug;
  if not found then
    raise exception 'Unbekannte Quelle: %', p_slug;
  end if;

  update public.kd_quellen set status = p_status where slug = p_slug;
  -- (Status-Gültigkeit prüft der Check-Constraint der Tabelle.)

  if p_status in ('widerrufen','abgelaufen') then
    delete from public.kd_catalog
     where quelle = p_slug
        or (q.payload_bereiche is not null and
            (name = any (q.payload_bereiche)
             or name = any (array(select b || '_demo'
                                  from unnest(q.payload_bereiche) as b))));
  end if;
end
$$;


ALTER FUNCTION "public"."kd_quelle_status_setzen"("p_slug" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_quellen_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end
$$;


ALTER FUNCTION "public"."kd_quellen_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_shared_article_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."kd_shared_article_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kd_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.rev := old.rev + 1; else new.rev := 1; end if;
  return new;
end $$;


ALTER FUNCTION "public"."kd_touch"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."kd_ai_limits" (
    "schluessel" "text" NOT NULL,
    "wert" "jsonb" NOT NULL,
    "notiz" "text",
    "geaendert_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."kd_ai_limits" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_ai_limits" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_ai_limits" IS 'Betriebskonfiguration des KI-Endpunkts (Not-Aus, Budgets, Routing, Preise). Nur service_role liest/schreibt; kein Client-Zugriff.';



CREATE TABLE IF NOT EXISTS "public"."kd_ai_log" (
    "id" bigint NOT NULL,
    "account_id" "uuid",
    "vorgang_id" "uuid" NOT NULL,
    "task" "text" NOT NULL,
    "status" "text" DEFAULT 'laufend'::"text" NOT NULL,
    "modell_alias" "text",
    "modell" "text",
    "input_tokens" integer,
    "output_tokens" integer,
    "kosten_usd_cent" numeric(12,6),
    "dauer_ms" integer,
    "fehlerklasse" "text",
    "prompt_version" "text",
    "profil_version" "text",
    "gestartet_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "beendet_at" timestamp with time zone,
    CONSTRAINT "kd_ai_log_input_tokens_check" CHECK ((("input_tokens" IS NULL) OR ("input_tokens" >= 0))),
    CONSTRAINT "kd_ai_log_kosten_usd_cent_check" CHECK ((("kosten_usd_cent" IS NULL) OR ("kosten_usd_cent" >= (0)::numeric))),
    CONSTRAINT "kd_ai_log_output_tokens_check" CHECK ((("output_tokens" IS NULL) OR ("output_tokens" >= 0))),
    CONSTRAINT "kd_ai_log_status_check" CHECK (("status" = ANY (ARRAY['laufend'::"text", 'fertig'::"text", 'fehler'::"text"])))
);

ALTER TABLE ONLY "public"."kd_ai_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_ai_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_ai_log" IS 'Metadaten je KI-Vorgang und zugleich Budget-/Parallelzähler. Enthält bewusst KEINE Inhalte: keine Prompts, keine Payloads, keine Suchanfragen, keine Notizen, keine Blogtexte. Aufbewahrung 90 Tage (kd_ai_log_abraeumen).';



COMMENT ON COLUMN "public"."kd_ai_log"."status" IS 'laufend = beim Start geschrieben. Erst dadurch sind Parallelität zählbar und Abstürze/Timeouts sichtbar; eine Zeile erst am Ende zu schreiben würde genau die teuren Fehlläufe verschweigen.';



ALTER TABLE "public"."kd_ai_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."kd_ai_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."kd_catalog" (
    "name" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "sha256" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quelle" "text",
    "stand" timestamp with time zone,
    "gueltig_bis" timestamp with time zone,
    CONSTRAINT "kd_catalog_name_check" CHECK (("name" = ANY (ARRAY['manifest'::"text", 'programm'::"text", 'streaming'::"text", 'programm_demo'::"text", 'streaming_demo'::"text", 'demo_seed'::"text", 'streaming_bekannt'::"text", 'streaming_entdecken'::"text", 'streaming_bekannt_demo'::"text", 'streaming_entdecken_demo'::"text"])))
);


ALTER TABLE "public"."kd_catalog" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_catalog" IS 'Von Max Pipeline gelieferte Programm-/Streamingassets; PWA read-only.';



COMMENT ON COLUMN "public"."kd_catalog"."quelle" IS 'slug aus kd_quellen; Pflicht für *_demo-Zeilen, Ausbaustufe macht sie auch für Live-Zeilen Pflicht.';



COMMENT ON COLUMN "public"."kd_catalog"."gueltig_bis" IS 'Ende der Anzeige-/Cachefrist des Payloads; bei *_demo Pflicht (ehrlicher Snapshot).';



CREATE TABLE IF NOT EXISTS "public"."kd_filmwerk_kennungen" (
    "namespace" "text" NOT NULL,
    "kennung" "text" NOT NULL,
    "werk_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'kandidat'::"text" NOT NULL,
    "quelle_slug" "text",
    "geprueft_at" timestamp with time zone,
    "erstellt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_filmwerk_kennungen_status_check" CHECK (("status" = ANY (ARRAY['kandidat'::"text", 'geprueft'::"text", 'gesperrt'::"text"]))),
    CONSTRAINT "kd_fwk_geprueft_zeit" CHECK (((("status" = 'geprueft'::"text") AND ("geprueft_at" IS NOT NULL)) OR ("status" <> 'geprueft'::"text"))),
    CONSTRAINT "kd_fwk_kennung_form" CHECK (((("char_length"("kennung") >= 1) AND ("char_length"("kennung") <= 160)) AND ("kennung" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'::"text") AND ("kennung" = "public"."kd_filmwissen_kennung_norm"("namespace", "kennung")))),
    CONSTRAINT "kd_fwk_namespace" CHECK (("namespace" = ANY (ARRAY['imdb'::"text", 'tmdb'::"text", 'watchmode'::"text", 'film_at'::"text", 'wikidata'::"text", 'kinodreieck'::"text"])))
);


ALTER TABLE "public"."kd_filmwerk_kennungen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kd_filmwerke" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "typ" "text" NOT NULL,
    "titel" "text" NOT NULL,
    "originaltitel" "text",
    "jahr" smallint NOT NULL,
    "identitaetsstatus" "text" DEFAULT 'ungeklaert'::"text" NOT NULL,
    "identitaetsgrund" "text",
    "aktuelle_version_id" "uuid",
    "erstellt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "geaendert_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_filmwerke_identitaetsstatus_check" CHECK (("identitaetsstatus" = ANY (ARRAY['ungeklaert'::"text", 'geprueft'::"text", 'gesperrt'::"text"]))),
    CONSTRAINT "kd_filmwerke_jahr_check" CHECK ((("jahr" >= 1870) AND ("jahr" <= 2200))),
    CONSTRAINT "kd_filmwerke_typ_check" CHECK (("typ" = ANY (ARRAY['film'::"text", 'filmreihe'::"text", 'serie'::"text"]))),
    CONSTRAINT "kd_fw_identitaetsgrund_laenge" CHECK ((("identitaetsgrund" IS NULL) OR (("char_length"("identitaetsgrund") >= 3) AND ("char_length"("identitaetsgrund") <= 300)))),
    CONSTRAINT "kd_fw_originaltitel_laenge" CHECK ((("originaltitel" IS NULL) OR (("char_length"("originaltitel") >= 1) AND ("char_length"("originaltitel") <= 240)))),
    CONSTRAINT "kd_fw_titel_laenge" CHECK ((("char_length"("titel") >= 1) AND ("char_length"("titel") <= 240)))
);


ALTER TABLE "public"."kd_filmwerke" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kd_filmwissen_adapter_snapshots" (
    "adapter_key" "text" NOT NULL,
    "adapter_version" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "abruf_sha256" "text" NOT NULL,
    "etag" "text",
    "abgerufen_at" timestamp with time zone NOT NULL,
    "gueltig_bis" timestamp with time zone NOT NULL,
    "erstellt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_fwas_adapter" CHECK (("adapter_key" = 'loc-nfr-listing-v1'::"text")),
    CONSTRAINT "kd_fwas_hash" CHECK (("abruf_sha256" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "kd_fwas_payload" CHECK ((("jsonb_typeof"("payload") = 'array'::"text") AND (("jsonb_array_length"("payload") >= 900) AND ("jsonb_array_length"("payload") <= 1200)) AND ("octet_length"(("payload")::"text") <= 262144))),
    CONSTRAINT "kd_fwas_version" CHECK (("adapter_version" ~ '^[a-z][a-z0-9._-]{1,59}$'::"text")),
    CONSTRAINT "kd_fwas_zeit" CHECK ((("gueltig_bis" > "abgerufen_at") AND ("gueltig_bis" <= ("abgerufen_at" + '7 days'::interval))))
);

ALTER TABLE ONLY "public"."kd_filmwissen_adapter_snapshots" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_adapter_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_filmwissen_adapter_snapshots" IS 'Service-only Cache des streng validierten LOC-Gesamtsnapshots; keine Konto- oder Profildaten.';



CREATE TABLE IF NOT EXISTS "public"."kd_filmwissen_auftraege" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vorgang_id" "uuid" NOT NULL,
    "werk_id" "uuid" NOT NULL,
    "anlass" "text" NOT NULL,
    "quellen_slugs" "text"[] NOT NULL,
    "quellen_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'bereit'::"text" NOT NULL,
    "kosten_usd_cent" numeric(12,6),
    "fehlerklasse" "text",
    "ergebnis_version_id" "uuid",
    "erstellt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gestartet_at" timestamp with time zone,
    "abgeschlossen_at" timestamp with time zone,
    CONSTRAINT "kd_filmwissen_auftraege_anlass_check" CHECK (("anlass" = ANY (ARRAY['ausdruecklich'::"text", 'redaktionell'::"text", 'korrektur'::"text", 'ruecknahme'::"text"]))),
    CONSTRAINT "kd_filmwissen_auftraege_kosten_usd_cent_check" CHECK ((("kosten_usd_cent" IS NULL) OR ("kosten_usd_cent" >= (0)::numeric))),
    CONSTRAINT "kd_filmwissen_auftraege_status_check" CHECK (("status" = ANY (ARRAY['bereit'::"text", 'laufend'::"text", 'fertig'::"text", 'fehler'::"text"]))),
    CONSTRAINT "kd_fwa_fehlerklasse_form" CHECK ((("fehlerklasse" IS NULL) OR ("fehlerklasse" ~ '^[a-z][a-z0-9-]{0,39}(:[a-z0-9][a-z0-9._-]{0,39}){0,3}$'::"text"))),
    CONSTRAINT "kd_fwa_hash_form" CHECK (("quellen_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "kd_fwa_quellen_anzahl" CHECK ((("cardinality"("quellen_slugs") >= 1) AND ("cardinality"("quellen_slugs") <= 5)))
);


ALTER TABLE "public"."kd_filmwissen_auftraege" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kd_filmwissen_belege" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "quelle_slug" "text" NOT NULL,
    "url" "text" NOT NULL,
    "seitentitel" "text" NOT NULL,
    "veroeffentlicht_at" timestamp with time zone,
    "abgerufen_at" timestamp with time zone NOT NULL,
    "attribution_snapshot" "text" NOT NULL,
    "kernaussagen" "jsonb" NOT NULL,
    "abruf_sha256" "text" NOT NULL,
    "erstellt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ursprung" "text" NOT NULL,
    "belegklasse" "text" NOT NULL,
    CONSTRAINT "kd_fwb_attribution_laenge" CHECK ((("char_length"("attribution_snapshot") >= 1) AND ("char_length"("attribution_snapshot") <= 500))),
    CONSTRAINT "kd_fwb_belegklasse_form" CHECK (("belegklasse" = ANY (ARRAY['strukturiert'::"text", 'institutionell'::"text", 'redaktionell'::"text"]))),
    CONSTRAINT "kd_fwb_hash_form" CHECK (("abruf_sha256" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "kd_fwb_kernaussagen_form" CHECK ((("jsonb_typeof"("kernaussagen") = 'array'::"text") AND (("jsonb_array_length"("kernaussagen") >= 1) AND ("jsonb_array_length"("kernaussagen") <= 10)) AND ("octet_length"(("kernaussagen")::"text") <= 8192))),
    CONSTRAINT "kd_fwb_titel_laenge" CHECK ((("char_length"("seitentitel") >= 1) AND ("char_length"("seitentitel") <= 300))),
    CONSTRAINT "kd_fwb_url_https" CHECK ((("url" ~ '^https://[^[:space:]]+$'::"text") AND (("char_length"("url") >= 9) AND ("char_length"("url") <= 2048)))),
    CONSTRAINT "kd_fwb_ursprung_form" CHECK (("ursprung" ~ '^[a-z][a-z0-9._:-]{1,79}$'::"text"))
);


ALTER TABLE "public"."kd_filmwissen_belege" OWNER TO "postgres";


COMMENT ON COLUMN "public"."kd_filmwissen_belege"."belegklasse" IS 'Unveraenderlicher Snapshot der Belegklasse zum Publikationszeitpunkt.';



CREATE TABLE IF NOT EXISTS "public"."kd_filmwissen_quellen" (
    "slug" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "betreiber" "text" NOT NULL,
    "status" "text" DEFAULT 'kandidat'::"text" NOT NULL,
    "websuche_erlaubt" boolean DEFAULT false NOT NULL,
    "seitenabruf_erlaubt" boolean DEFAULT false NOT NULL,
    "cache_erlaubt" boolean DEFAULT false NOT NULL,
    "paraphrase_erlaubt" boolean DEFAULT false NOT NULL,
    "anzeige_erlaubt" boolean DEFAULT false NOT NULL,
    "subdomains_erlaubt" boolean DEFAULT false NOT NULL,
    "attribution" "text",
    "rechtsstand" "date",
    "gueltig_bis" "date",
    "erstellt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "geaendert_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "adapter_key" "text",
    "abrufe_pro_minute" smallint,
    "ursprung" "text" NOT NULL,
    "belegklasse" "text" NOT NULL,
    CONSTRAINT "kd_filmwissen_quellen_status_check" CHECK (("status" = ANY (ARRAY['kandidat'::"text", 'freigegeben'::"text", 'pausiert'::"text", 'widerrufen'::"text", 'abgelaufen'::"text"]))),
    CONSTRAINT "kd_fwq_abrufe_pro_minute_form" CHECK (((("adapter_key" IS NULL) AND ("abrufe_pro_minute" IS NULL)) OR (("adapter_key" IS NOT NULL) AND (("abrufe_pro_minute" >= 1) AND ("abrufe_pro_minute" <= 120))))),
    CONSTRAINT "kd_fwq_adapter_key_form" CHECK ((("adapter_key" IS NULL) OR ("adapter_key" ~ '^[a-z][a-z0-9_-]{1,59}$'::"text"))),
    CONSTRAINT "kd_fwq_attribution_laenge" CHECK ((("attribution" IS NULL) OR ("char_length"("attribution") <= 500))),
    CONSTRAINT "kd_fwq_belegklasse_form" CHECK (("belegklasse" = ANY (ARRAY['strukturiert'::"text", 'institutionell'::"text", 'redaktionell'::"text"]))),
    CONSTRAINT "kd_fwq_betreiber_laenge" CHECK ((("char_length"("betreiber") >= 1) AND ("char_length"("betreiber") <= 160))),
    CONSTRAINT "kd_fwq_domain_form" CHECK ((("domain" = "lower"("domain")) AND ("domain" ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'::"text"))),
    CONSTRAINT "kd_fwq_slug_form" CHECK (("slug" ~ '^[a-z][a-z0-9_-]{1,39}$'::"text")),
    CONSTRAINT "kd_fwq_ursprung_form" CHECK (("ursprung" ~ '^[a-z][a-z0-9._:-]{1,79}$'::"text"))
);


ALTER TABLE "public"."kd_filmwissen_quellen" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_filmwissen_quellen" IS 'Fail-closed Rechte- und Technikregister fuer gezielte Filmwissen-Fundstellen. Keine Quelle ist standardmaessig freigegeben.';



COMMENT ON COLUMN "public"."kd_filmwissen_quellen"."belegklasse" IS 'Fachliche Rolle fuer die WARUM-Mindestbelegung: strukturiert zaehlt nicht allein; institutionell darf allein tragen; redaktionell braucht zwei unabhaengige Quellen.';



CREATE TABLE IF NOT EXISTS "public"."kd_filmwissen_quellen_abrufe" (
    "quelle_slug" "text" NOT NULL,
    "fenster" timestamp with time zone NOT NULL,
    "anzahl" smallint NOT NULL,
    CONSTRAINT "kd_filmwissen_quellen_abrufe_anzahl_check" CHECK ((("anzahl" >= 1) AND ("anzahl" <= 120))),
    CONSTRAINT "kd_fwqa_minutenfenster" CHECK (("fenster" = "date_trunc"('minute'::"text", "fenster")))
);

ALTER TABLE ONLY "public"."kd_filmwissen_quellen_abrufe" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_quellen_abrufe" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_filmwissen_quellen_abrufe" IS 'Instanzuebergreifender Minutenzaehler fuer feste Filmwissen-Quellenadapter; enthaelt keine Inhalte oder Personenbezug.';



CREATE TABLE IF NOT EXISTS "public"."kd_filmwissen_versionen" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "werk_id" "uuid" NOT NULL,
    "version_nr" integer NOT NULL,
    "vorgaenger_id" "uuid",
    "auftrag_id" "uuid",
    "format" "text" DEFAULT 'filmwissen-cache-v1'::"text" NOT NULL,
    "schema_version" "text" NOT NULL,
    "rubrik_version" "text" NOT NULL,
    "pipeline_version" "text" NOT NULL,
    "prompt_version" "text",
    "warum" smallint,
    "sicherheit" "text" NOT NULL,
    "kurztext" "text" NOT NULL,
    "modell" "text",
    "kosten_usd_cent" numeric(12,6) DEFAULT 0 NOT NULL,
    "paket_sha256" "text" NOT NULL,
    "erstellt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_filmwissen_versionen_format_check" CHECK (("format" = 'filmwissen-cache-v1'::"text")),
    CONSTRAINT "kd_filmwissen_versionen_kosten_usd_cent_check" CHECK (("kosten_usd_cent" >= (0)::numeric)),
    CONSTRAINT "kd_filmwissen_versionen_sicherheit_check" CHECK (("sicherheit" = ANY (ARRAY['sehr_niedrig'::"text", 'niedrig'::"text", 'mittel'::"text", 'hoch'::"text"]))),
    CONSTRAINT "kd_filmwissen_versionen_version_nr_check" CHECK (("version_nr" >= 1)),
    CONSTRAINT "kd_filmwissen_versionen_warum_check" CHECK ((("warum" >= 0) AND ("warum" <= 5))),
    CONSTRAINT "kd_fwv_hash_form" CHECK (("paket_sha256" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "kd_fwv_kurztext_laenge" CHECK ((("char_length"("kurztext") >= 1) AND ("char_length"("kurztext") <= 1000))),
    CONSTRAINT "kd_fwv_modell_form" CHECK ((("modell" IS NULL) OR ("modell" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'::"text"))),
    CONSTRAINT "kd_fwv_version_form" CHECK ((("schema_version" ~ '^[A-Za-z0-9._-]{1,20}$'::"text") AND ("rubrik_version" ~ '^[A-Za-z0-9._-]{1,20}$'::"text") AND ("pipeline_version" ~ '^[A-Za-z0-9._-]{1,20}$'::"text") AND (("prompt_version" IS NULL) OR ("prompt_version" ~ '^[A-Za-z0-9._-]{1,20}$'::"text"))))
);


ALTER TABLE "public"."kd_filmwissen_versionen" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_filmwissen_versionen" IS 'Unveraenderliche veroeffentlichte Filmwissensfassungen. Korrektur oder Rollback aendert nur den Werkzeiger.';



CREATE TABLE IF NOT EXISTS "public"."kd_filmwissen_zeigerlog" (
    "id" bigint NOT NULL,
    "werk_id" "uuid" NOT NULL,
    "alte_version_id" "uuid",
    "neue_version_id" "uuid",
    "art" "text" NOT NULL,
    "grund" "text" NOT NULL,
    "erstellt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_filmwissen_zeigerlog_art_check" CHECK (("art" = ANY (ARRAY['veroeffentlichung'::"text", 'quelle_gesperrt'::"text", 'abgelaufen'::"text", 'manuell'::"text"]))),
    CONSTRAINT "kd_fwz_aenderung" CHECK (("alte_version_id" IS DISTINCT FROM "neue_version_id")),
    CONSTRAINT "kd_fwz_grund_laenge" CHECK ((("char_length"("grund") >= 3) AND ("char_length"("grund") <= 300)))
);


ALTER TABLE "public"."kd_filmwissen_zeigerlog" OWNER TO "postgres";


ALTER TABLE "public"."kd_filmwissen_zeigerlog" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."kd_filmwissen_zeigerlog_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."kd_legacy_shared_archive" (
    "owner" "text" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "author" "text",
    "updated_at" timestamp with time zone,
    "archived_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kd_legacy_shared_archive" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_legacy_shared_archive" IS 'Rueckholbares, nicht oeffentliches Archiv der ehemaligen kd_store scope=shared-Zeilen.';



CREATE TABLE IF NOT EXISTS "public"."kd_owner" (
    "owner" "text" NOT NULL,
    "key_sha256" "text" NOT NULL
);


ALTER TABLE "public"."kd_owner" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kd_personal" (
    "account_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "revision" bigint DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_personal_key_erlaubt" CHECK (("key" = ANY (ARRAY['kd:master'::"text", 'kd:artikel'::"text", 'kd:kino-pins'::"text", 'kd:wochenplan'::"text", 'kd:merkliste'::"text", 'kd:vokabular'::"text", 'kd:einstellungen'::"text", 'kd:entdecken-status'::"text", 'kd:autor-name'::"text", 'kd:streaming-dienste'::"text", 'kd:mustwatch'::"text", 'kd:achievements'::"text", 'kd:zeitgrenze'::"text", 'kd:filter-mediathek'::"text", 'kd:filter-kino'::"text", 'kd:filter-streaming'::"text", 'kd:geschmacksprofil'::"text"]))),
    CONSTRAINT "kd_personal_value_max" CHECK (("octet_length"("value") <= 1048576))
);


ALTER TABLE "public"."kd_personal" OWNER TO "postgres";


COMMENT ON CONSTRAINT "kd_personal_key_erlaubt" ON "public"."kd_personal" IS 'Erlaubte Toepfe (17, Stand Deine Woche). Neuer Topf = additive Migration, die ALLE Werte neu setzt.';



CREATE TABLE IF NOT EXISTS "public"."kd_series_watch" (
    "account_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "watchmode_id" bigint NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_series_watch_pkey" PRIMARY KEY ("account_id", "watchmode_id"),
    CONSTRAINT "kd_series_watch_id_positive" CHECK (("watchmode_id" > 0))
);


ALTER TABLE "public"."kd_series_watch" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_series_watch" IS 'Private accountgebundene Watchmode-IDs fuer den bestehenden planmaessigen Kataloglauf.';



CREATE TABLE IF NOT EXISTS "public"."kd_quellen" (
    "slug" "text" NOT NULL,
    "betreiber" "text" NOT NULL,
    "url" "text",
    "kontakt" "text",
    "status" "text" DEFAULT 'offen'::"text" NOT NULL,
    "prioritaet" integer,
    "spielstaetten" "text",
    "erlaubte_felder" "text"[],
    "max_abruf_frequenz" "text",
    "importart" "text",
    "attribution" "text",
    "weitergabe_erlaubt" boolean DEFAULT false NOT NULL,
    "lizenz_beginn" "date",
    "lizenz_ablauf" "date",
    "cache_frist_tage" integer,
    "loesch_frist_tage" integer,
    "payload_bereiche" "text"[],
    "notizen" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_quellen_status_check" CHECK (("status" = ANY (ARRAY['offen'::"text", 'angefragt'::"text", 'freigegeben'::"text", 'pausiert'::"text", 'widerrufen'::"text", 'abgelaufen'::"text", 'intern_test'::"text"])))
);


ALTER TABLE "public"."kd_quellen" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_quellen" IS 'Quellenregister Etappe 4: Freigabestatus je Programmdatenquelle. Schreiben nur service_role/SQL-Editor; Tester lesen, anon sieht nichts.';



CREATE TABLE IF NOT EXISTS "public"."kd_shared_articles" (
    "publication_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "article_id" "text" NOT NULL,
    "author" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "kd_shared_article_id_valid" CHECK ((("char_length"("article_id") >= 1) AND ("char_length"("article_id") <= 160))),
    CONSTRAINT "kd_shared_author_valid" CHECK ((("char_length"("author") >= 1) AND ("char_length"("author") <= 120))),
    CONSTRAINT "kd_shared_payload_valid" CHECK ((("jsonb_typeof"("payload") = 'object'::"text") AND ("payload" ? 'titel'::"text") AND ("payload" ? 'text'::"text") AND ("octet_length"(("payload")::"text") <= 1048576)))
);


ALTER TABLE "public"."kd_shared_articles" OWNER TO "postgres";


COMMENT ON TABLE "public"."kd_shared_articles" IS 'Explizit veroeffentlichte Blog-Projektionen. Private Quelle bleibt in kd_personal; oeffentliche RPC verbirgt account_id.';



CREATE TABLE IF NOT EXISTS "public"."kd_store" (
    "owner" "text" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text",
    "scope" "text" DEFAULT 'user'::"text" NOT NULL,
    "author" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rev" bigint DEFAULT 1 NOT NULL,
    CONSTRAINT "kd_store_scope_check" CHECK (("scope" = ANY (ARRAY['demo'::"text", 'user'::"text", 'shared'::"text"])))
);


ALTER TABLE "public"."kd_store" OWNER TO "postgres";


ALTER TABLE ONLY "public"."kd_ai_limits"
    ADD CONSTRAINT "kd_ai_limits_pkey" PRIMARY KEY ("schluessel");



ALTER TABLE ONLY "public"."kd_ai_log"
    ADD CONSTRAINT "kd_ai_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kd_catalog"
    ADD CONSTRAINT "kd_catalog_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."kd_filmwerk_kennungen"
    ADD CONSTRAINT "kd_filmwerk_kennungen_pkey" PRIMARY KEY ("namespace", "kennung");



ALTER TABLE ONLY "public"."kd_filmwerke"
    ADD CONSTRAINT "kd_filmwerke_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kd_filmwissen_adapter_snapshots"
    ADD CONSTRAINT "kd_filmwissen_adapter_snapshots_pkey" PRIMARY KEY ("adapter_key");



ALTER TABLE ONLY "public"."kd_filmwissen_auftraege"
    ADD CONSTRAINT "kd_filmwissen_auftraege_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kd_filmwissen_auftraege"
    ADD CONSTRAINT "kd_filmwissen_auftraege_vorgang_id_key" UNIQUE ("vorgang_id");



ALTER TABLE ONLY "public"."kd_filmwissen_belege"
    ADD CONSTRAINT "kd_filmwissen_belege_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kd_filmwissen_belege"
    ADD CONSTRAINT "kd_filmwissen_belege_version_id_quelle_slug_key" UNIQUE ("version_id", "quelle_slug");



ALTER TABLE ONLY "public"."kd_filmwissen_quellen_abrufe"
    ADD CONSTRAINT "kd_filmwissen_quellen_abrufe_pkey" PRIMARY KEY ("quelle_slug", "fenster");



ALTER TABLE ONLY "public"."kd_filmwissen_quellen"
    ADD CONSTRAINT "kd_filmwissen_quellen_domain_key" UNIQUE ("domain");



ALTER TABLE ONLY "public"."kd_filmwissen_quellen"
    ADD CONSTRAINT "kd_filmwissen_quellen_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."kd_filmwissen_versionen"
    ADD CONSTRAINT "kd_filmwissen_versionen_auftrag_id_key" UNIQUE ("auftrag_id");



ALTER TABLE ONLY "public"."kd_filmwissen_versionen"
    ADD CONSTRAINT "kd_filmwissen_versionen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kd_filmwissen_versionen"
    ADD CONSTRAINT "kd_filmwissen_versionen_werk_id_id_key" UNIQUE ("werk_id", "id");



ALTER TABLE ONLY "public"."kd_filmwissen_versionen"
    ADD CONSTRAINT "kd_filmwissen_versionen_werk_id_version_nr_key" UNIQUE ("werk_id", "version_nr");



ALTER TABLE ONLY "public"."kd_filmwissen_zeigerlog"
    ADD CONSTRAINT "kd_filmwissen_zeigerlog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kd_legacy_shared_archive"
    ADD CONSTRAINT "kd_legacy_shared_archive_pkey" PRIMARY KEY ("owner", "key");



ALTER TABLE ONLY "public"."kd_owner"
    ADD CONSTRAINT "kd_owner_pkey" PRIMARY KEY ("owner");



ALTER TABLE ONLY "public"."kd_personal"
    ADD CONSTRAINT "kd_personal_pkey" PRIMARY KEY ("account_id", "key");



ALTER TABLE ONLY "public"."kd_quellen"
    ADD CONSTRAINT "kd_quellen_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."kd_shared_articles"
    ADD CONSTRAINT "kd_shared_articles_account_id_article_id_key" UNIQUE ("account_id", "article_id");



ALTER TABLE ONLY "public"."kd_shared_articles"
    ADD CONSTRAINT "kd_shared_articles_pkey" PRIMARY KEY ("publication_id");



ALTER TABLE ONLY "public"."kd_store"
    ADD CONSTRAINT "kd_store_pkey" PRIMARY KEY ("owner", "key");



CREATE INDEX "kd_ai_log_konto_zeit" ON "public"."kd_ai_log" USING "btree" ("account_id", "gestartet_at" DESC);



CREATE INDEX "kd_ai_log_laufend" ON "public"."kd_ai_log" USING "btree" ("gestartet_at") WHERE ("status" = 'laufend'::"text");



CREATE UNIQUE INDEX "kd_ai_log_vorgang_uniq" ON "public"."kd_ai_log" USING "btree" ("account_id", "vorgang_id");



CREATE INDEX "kd_ai_log_zeit" ON "public"."kd_ai_log" USING "btree" ("gestartet_at" DESC);



CREATE UNIQUE INDEX "kd_fwa_ein_lauf" ON "public"."kd_filmwissen_auftraege" USING "btree" ("werk_id") WHERE ("status" = ANY (ARRAY['bereit'::"text", 'laufend'::"text"]));



CREATE INDEX "kd_fwb_quelle_idx" ON "public"."kd_filmwissen_belege" USING "btree" ("quelle_slug", "version_id");



CREATE UNIQUE INDEX "kd_fwk_ein_namespace_pro_werk" ON "public"."kd_filmwerk_kennungen" USING "btree" ("werk_id", "namespace") WHERE ("status" <> 'gesperrt'::"text");



CREATE INDEX "kd_fwk_werk_idx" ON "public"."kd_filmwerk_kennungen" USING "btree" ("werk_id");



CREATE UNIQUE INDEX "kd_fwq_adapter_key_uniq" ON "public"."kd_filmwissen_quellen" USING "btree" ("adapter_key") WHERE ("adapter_key" IS NOT NULL);



CREATE INDEX "kd_fwz_werk_idx" ON "public"."kd_filmwissen_zeigerlog" USING "btree" ("werk_id", "erstellt_at" DESC);



CREATE OR REPLACE TRIGGER "kd_block_legacy_shared_write_trg" BEFORE INSERT OR UPDATE ON "public"."kd_store" FOR EACH ROW EXECUTE FUNCTION "public"."kd_block_legacy_shared_write"();



CREATE OR REPLACE TRIGGER "kd_catalog_quellen_guard" BEFORE INSERT OR UPDATE ON "public"."kd_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."kd_catalog_quellen_guard"();


CREATE OR REPLACE TRIGGER "kd_catalog_streaming_split" AFTER INSERT OR DELETE OR UPDATE ON "public"."kd_catalog" FOR EACH ROW EXECUTE FUNCTION "public"."kd_catalog_streaming_aufteilen"();



CREATE OR REPLACE TRIGGER "kd_fw_touch" BEFORE UPDATE ON "public"."kd_filmwerke" FOR EACH ROW EXECUTE FUNCTION "public"."kd_filmwissen_touch"();



CREATE OR REPLACE TRIGGER "kd_fwb_unveraenderlich" BEFORE DELETE OR UPDATE ON "public"."kd_filmwissen_belege" FOR EACH ROW EXECUTE FUNCTION "public"."kd_filmwissen_unveraenderlich"();



CREATE OR REPLACE TRIGGER "kd_fwb_ursprung" BEFORE INSERT ON "public"."kd_filmwissen_belege" FOR EACH ROW EXECUTE FUNCTION "public"."kd_filmwissen_beleg_ursprung_setzen"();



CREATE OR REPLACE TRIGGER "kd_fwq_touch" BEFORE UPDATE ON "public"."kd_filmwissen_quellen" FOR EACH ROW EXECUTE FUNCTION "public"."kd_filmwissen_touch"();



CREATE OR REPLACE TRIGGER "kd_fwv_unveraenderlich" BEFORE DELETE OR UPDATE ON "public"."kd_filmwissen_versionen" FOR EACH ROW EXECUTE FUNCTION "public"."kd_filmwissen_unveraenderlich"();



CREATE OR REPLACE TRIGGER "kd_fwz_unveraenderlich" BEFORE DELETE OR UPDATE ON "public"."kd_filmwissen_zeigerlog" FOR EACH ROW EXECUTE FUNCTION "public"."kd_filmwissen_unveraenderlich"();



CREATE OR REPLACE TRIGGER "kd_personal_touch_trg" BEFORE INSERT OR UPDATE ON "public"."kd_personal" FOR EACH ROW EXECUTE FUNCTION "public"."kd_personal_touch"();



CREATE OR REPLACE TRIGGER "kd_quellen_touch" BEFORE UPDATE ON "public"."kd_quellen" FOR EACH ROW EXECUTE FUNCTION "public"."kd_quellen_touch"();



CREATE OR REPLACE TRIGGER "kd_shared_article_touch_trg" BEFORE INSERT OR UPDATE ON "public"."kd_shared_articles" FOR EACH ROW EXECUTE FUNCTION "public"."kd_shared_article_touch"();



CREATE OR REPLACE TRIGGER "kd_touch_trg" BEFORE INSERT OR UPDATE ON "public"."kd_store" FOR EACH ROW EXECUTE FUNCTION "public"."kd_touch"();



ALTER TABLE ONLY "public"."kd_ai_log"
    ADD CONSTRAINT "kd_ai_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kd_filmwerk_kennungen"
    ADD CONSTRAINT "kd_filmwerk_kennungen_quelle_slug_fkey" FOREIGN KEY ("quelle_slug") REFERENCES "public"."kd_filmwissen_quellen"("slug") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwerk_kennungen"
    ADD CONSTRAINT "kd_filmwerk_kennungen_werk_id_fkey" FOREIGN KEY ("werk_id") REFERENCES "public"."kd_filmwerke"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_auftraege"
    ADD CONSTRAINT "kd_filmwissen_auftraege_werk_id_fkey" FOREIGN KEY ("werk_id") REFERENCES "public"."kd_filmwerke"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_belege"
    ADD CONSTRAINT "kd_filmwissen_belege_quelle_slug_fkey" FOREIGN KEY ("quelle_slug") REFERENCES "public"."kd_filmwissen_quellen"("slug") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_belege"
    ADD CONSTRAINT "kd_filmwissen_belege_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."kd_filmwissen_versionen"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_quellen_abrufe"
    ADD CONSTRAINT "kd_filmwissen_quellen_abrufe_quelle_slug_fkey" FOREIGN KEY ("quelle_slug") REFERENCES "public"."kd_filmwissen_quellen"("slug") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_versionen"
    ADD CONSTRAINT "kd_filmwissen_versionen_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "public"."kd_filmwissen_auftraege"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_versionen"
    ADD CONSTRAINT "kd_filmwissen_versionen_werk_id_fkey" FOREIGN KEY ("werk_id") REFERENCES "public"."kd_filmwerke"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_zeigerlog"
    ADD CONSTRAINT "kd_filmwissen_zeigerlog_werk_id_fkey" FOREIGN KEY ("werk_id") REFERENCES "public"."kd_filmwerke"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwerke"
    ADD CONSTRAINT "kd_fw_aktuelle_version_fk" FOREIGN KEY ("id", "aktuelle_version_id") REFERENCES "public"."kd_filmwissen_versionen"("werk_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_auftraege"
    ADD CONSTRAINT "kd_fwa_ergebnis_version_fk" FOREIGN KEY ("werk_id", "ergebnis_version_id") REFERENCES "public"."kd_filmwissen_versionen"("werk_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_versionen"
    ADD CONSTRAINT "kd_fwv_vorgaenger_fk" FOREIGN KEY ("werk_id", "vorgaenger_id") REFERENCES "public"."kd_filmwissen_versionen"("werk_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_zeigerlog"
    ADD CONSTRAINT "kd_fwz_alt_fk" FOREIGN KEY ("werk_id", "alte_version_id") REFERENCES "public"."kd_filmwissen_versionen"("werk_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_filmwissen_zeigerlog"
    ADD CONSTRAINT "kd_fwz_neu_fk" FOREIGN KEY ("werk_id", "neue_version_id") REFERENCES "public"."kd_filmwissen_versionen"("werk_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kd_personal"
    ADD CONSTRAINT "kd_personal_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kd_shared_articles"
    ADD CONSTRAINT "kd_shared_articles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "del_shared" ON "public"."kd_store" FOR DELETE TO "anon" USING ((("scope" = 'shared'::"text") AND "public"."kd_key_ok"("owner")));



CREATE POLICY "del_user" ON "public"."kd_store" FOR DELETE TO "anon" USING ((("scope" = 'user'::"text") AND "public"."kd_key_ok"("owner")));



CREATE POLICY "ins_shared" ON "public"."kd_store" FOR INSERT TO "anon" WITH CHECK ((("scope" = 'shared'::"text") AND ("key" ~~ 'kd:blog:%'::"text") AND "public"."kd_key_ok"("owner")));



CREATE POLICY "ins_user" ON "public"."kd_store" FOR INSERT TO "anon" WITH CHECK ((("scope" = 'user'::"text") AND "public"."kd_key_ok"("owner")));



ALTER TABLE "public"."kd_ai_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_ai_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kd_catalog_read_konto" ON "public"."kd_catalog" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "kd_catalog_read_public" ON "public"."kd_catalog" FOR SELECT TO "authenticated", "anon" USING (("name" = ANY (ARRAY['manifest'::"text", 'programm_demo'::"text", 'streaming_demo'::"text", 'demo_seed'::"text", 'streaming_bekannt_demo'::"text", 'streaming_entdecken_demo'::"text"])));



ALTER TABLE "public"."kd_filmwerk_kennungen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwerke" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_adapter_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_auftraege" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_belege" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_quellen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_quellen_abrufe" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_versionen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_filmwissen_zeigerlog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_owner" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_personal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_series_watch" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_quellen" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kd_quellen_read_konto" ON "public"."kd_quellen" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."kd_shared_articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kd_store" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kdai_log_sel" ON "public"."kd_ai_log" FOR SELECT TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdp_del" ON "public"."kd_personal" FOR DELETE TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdp_ins" ON "public"."kd_personal" FOR INSERT TO "authenticated" WITH CHECK (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdp_sel" ON "public"."kd_personal" FOR SELECT TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdp_upd" ON "public"."kd_personal" FOR UPDATE TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdsw_del" ON "public"."kd_series_watch" FOR DELETE TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid")));


CREATE POLICY "kdsw_ins" ON "public"."kd_series_watch" FOR INSERT TO "authenticated" WITH CHECK (("account_id" = ( SELECT "auth"."uid"() AS "uid")));


CREATE POLICY "kdsw_sel" ON "public"."kd_series_watch" FOR SELECT TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid")));


CREATE POLICY "kdsw_upd" ON "public"."kd_series_watch" FOR UPDATE TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdsa_owner_delete" ON "public"."kd_shared_articles" FOR DELETE TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdsa_owner_insert" ON "public"."kd_shared_articles" FOR INSERT TO "authenticated" WITH CHECK (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdsa_owner_select" ON "public"."kd_shared_articles" FOR SELECT TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "kdsa_owner_update" ON "public"."kd_shared_articles" FOR UPDATE TO "authenticated" USING (("account_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("account_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "sel_demo" ON "public"."kd_store" FOR SELECT TO "anon" USING (("scope" = 'demo'::"text"));



CREATE POLICY "sel_shared" ON "public"."kd_store" FOR SELECT TO "anon" USING (("scope" = 'shared'::"text"));



CREATE POLICY "sel_user" ON "public"."kd_store" FOR SELECT TO "anon" USING ((("scope" = 'user'::"text") AND "public"."kd_key_ok"("owner")));



CREATE POLICY "upd_shared" ON "public"."kd_store" FOR UPDATE TO "anon" USING ((("scope" = 'shared'::"text") AND "public"."kd_key_ok"("owner"))) WITH CHECK ((("scope" = 'shared'::"text") AND ("key" ~~ 'kd:blog:%'::"text") AND "public"."kd_key_ok"("owner")));



CREATE POLICY "upd_user" ON "public"."kd_store" FOR UPDATE TO "anon" USING ((("scope" = 'user'::"text") AND "public"."kd_key_ok"("owner"))) WITH CHECK ((("scope" = 'user'::"text") AND "public"."kd_key_ok"("owner")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_ai_auftrag_beenden"("p_id" bigint, "p_status" "text", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_ai_auftrag_beenden"("p_id" bigint, "p_status" "text", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_ai_auftrag_starten"("p_account" "uuid", "p_task" "text", "p_vorgang" "uuid", "p_modell_alias" "text", "p_prompt_version" "text", "p_profil_version" "text", "p_reservierung" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_ai_auftrag_starten"("p_account" "uuid", "p_task" "text", "p_vorgang" "uuid", "p_modell_alias" "text", "p_prompt_version" "text", "p_profil_version" "text", "p_reservierung" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_ai_auftrag_starten_ohne_task_cap"("p_account" "uuid", "p_task" "text", "p_vorgang" "uuid", "p_modell_alias" "text", "p_prompt_version" "text", "p_profil_version" "text", "p_reservierung" numeric) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."kd_ai_log_abraeumen"("p_tage" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_ai_log_abraeumen"("p_tage" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_ai_stand"("p_account" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_ai_stand"("p_account" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_ai_verwaiste_schliessen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_ai_verwaiste_schliessen"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_block_legacy_shared_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_block_legacy_shared_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."kd_block_legacy_shared_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_block_legacy_shared_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."kd_catalog_abgelaufene"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_catalog_abgelaufene"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_catalog_abraeumen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_catalog_abraeumen"() TO "service_role";



GRANT ALL ON FUNCTION "public"."kd_catalog_eintraege"("p_name" "text", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."kd_catalog_eintraege"("p_name" "text", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_catalog_eintraege"("p_name" "text", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."kd_catalog_quellen_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."kd_catalog_quellen_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_catalog_quellen_guard"() TO "service_role";


REVOKE ALL ON FUNCTION "public"."kd_catalog_streaming_aufteilen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_catalog_streaming_aufteilen"() TO "service_role";



GRANT ALL ON FUNCTION "public"."kd_catalog_verbotenes_feld"("p_eintraege" "jsonb", "p_erlaubt" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."kd_catalog_verbotenes_feld"("p_eintraege" "jsonb", "p_erlaubt" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_catalog_verbotenes_feld"("p_eintraege" "jsonb", "p_erlaubt" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_adapter_vorbereiten"("p_vorgang" "uuid", "p_werk" "jsonb", "p_kennungen" "jsonb", "p_quellen" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_adapter_vorbereiten"("p_vorgang" "uuid", "p_werk" "jsonb", "p_kennungen" "jsonb", "p_quellen" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_aktuell_lesen"("p_namespace" "text", "p_kennung" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_aktuell_lesen"("p_namespace" "text", "p_kennung" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_filmwissen_aktuell_lesen"("p_namespace" "text", "p_kennung" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_auftrag_fehlgeschlagen"("p_auftrag" "uuid", "p_kosten" numeric, "p_fehlerklasse" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_auftrag_fehlgeschlagen"("p_auftrag" "uuid", "p_kosten" numeric, "p_fehlerklasse" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_auftrag_starten"("p_werk" "uuid", "p_vorgang" "uuid", "p_anlass" "text", "p_quellen" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_auftrag_starten"("p_werk" "uuid", "p_vorgang" "uuid", "p_anlass" "text", "p_quellen" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_beleg_ursprung_setzen"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_kennung_norm"("p_namespace" "text", "p_kennung" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_loc_snapshot_lesen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_loc_snapshot_lesen"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_loc_snapshot_speichern"("p_snapshot" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_loc_snapshot_speichern"("p_snapshot" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_quelle_abruf_reservieren"("p_quelle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_quelle_abruf_reservieren"("p_quelle" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_quelle_speichern"("p_quelle" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_quelle_speichern"("p_quelle" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_quellen_hash"("p_slugs" "text"[]) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_synthese_abschliessen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_version" "jsonb", "p_belege" "jsonb", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_synthese_abschliessen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_version" "jsonb", "p_belege" "jsonb", "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_synthese_fehlgeschlagen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_synthese_fehlgeschlagen"("p_auftrag" "uuid", "p_ai_log" bigint, "p_modell" "text", "p_input_tokens" integer, "p_output_tokens" integer, "p_kosten" numeric, "p_fehlerklasse" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_synthese_vorbereiten"("p_namespace" "text", "p_kennung" "text", "p_vorgang" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_synthese_vorbereiten"("p_namespace" "text", "p_kennung" "text", "p_vorgang" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_touch"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_unveraenderlich"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_veroeffentlichen"("p_auftrag" "uuid", "p_version" "jsonb", "p_belege" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_veroeffentlichen"("p_auftrag" "uuid", "p_version" "jsonb", "p_belege" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_veroeffentlichen_ohne_ursprungspruefung"("p_auftrag" "uuid", "p_version" "jsonb", "p_belege" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_version_setzen"("p_werk" "uuid", "p_version" "uuid", "p_grund" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_version_setzen"("p_werk" "uuid", "p_version" "uuid", "p_grund" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_verwaiste_schliessen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_verwaiste_schliessen"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_werk_pruefen"("p_werk" "uuid", "p_kennungen" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_werk_pruefen"("p_werk" "uuid", "p_kennungen" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_filmwissen_werk_sicherstellen"("p_typ" "text", "p_titel" "text", "p_originaltitel" "text", "p_jahr" integer, "p_kennungen" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_filmwissen_werk_sicherstellen"("p_typ" "text", "p_titel" "text", "p_originaltitel" "text", "p_jahr" integer, "p_kennungen" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."kd_key_ok"("the_owner" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."kd_key_ok"("the_owner" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_key_ok"("the_owner" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_list_shared_articles"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_list_shared_articles"() TO "anon";
GRANT ALL ON FUNCTION "public"."kd_list_shared_articles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_list_shared_articles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."kd_personal_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."kd_personal_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_personal_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_set_series_watch"("p_watchmode_ids" bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_set_series_watch"("p_watchmode_ids" bigint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_set_series_watch"("p_watchmode_ids" bigint[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_quelle_status_setzen"("p_slug" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_quelle_status_setzen"("p_slug" "text", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."kd_quellen_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."kd_quellen_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_quellen_touch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."kd_shared_article_touch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kd_shared_article_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."kd_shared_article_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_shared_article_touch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."kd_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."kd_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."kd_touch"() TO "service_role";



GRANT ALL ON TABLE "public"."kd_ai_limits" TO "service_role";



GRANT ALL ON TABLE "public"."kd_ai_log" TO "service_role";
GRANT SELECT ON TABLE "public"."kd_ai_log" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."kd_ai_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."kd_ai_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."kd_ai_log_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."kd_catalog" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."kd_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."kd_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."kd_filmwissen_adapter_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."kd_filmwissen_quellen_abrufe" TO "service_role";



GRANT ALL ON TABLE "public"."kd_legacy_shared_archive" TO "service_role";



GRANT ALL ON TABLE "public"."kd_owner" TO "authenticated";
GRANT ALL ON TABLE "public"."kd_owner" TO "service_role";



GRANT ALL ON TABLE "public"."kd_personal" TO "authenticated";
GRANT ALL ON TABLE "public"."kd_personal" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."kd_series_watch" TO "authenticated";
GRANT ALL ON TABLE "public"."kd_series_watch" TO "service_role";



GRANT ALL ON TABLE "public"."kd_quellen" TO "service_role";
GRANT SELECT ON TABLE "public"."kd_quellen" TO "authenticated";



GRANT ALL ON TABLE "public"."kd_shared_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."kd_shared_articles" TO "service_role";



GRANT ALL ON TABLE "public"."kd_store" TO "anon";
GRANT ALL ON TABLE "public"."kd_store" TO "authenticated";
GRANT ALL ON TABLE "public"."kd_store" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
