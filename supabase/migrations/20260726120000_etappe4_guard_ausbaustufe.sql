-- Kinodreieck · Etappe 4 · Migration 2: Guard-Ausbaustufe (Herkunftspflicht, Felder, Fristen)
-- ============================================================================
-- Ausführen: Supabase Dashboard → SQL Editor → komplette Datei einfügen → Run.
-- Danach eine Zeile in supabase/migrations/LIESMICH.md ergänzen.
--
-- Ausgeführt: __________  Projekt: __________  von: __________
--
-- Was diese Datei schließt:
--   Migration 1 hat das Quellenregister eingeführt, aber eine Lücke offen
--   gelassen: Katalogzeilen OHNE gesetzte `quelle` liefen am Guard vorbei. Genau
--   so schreibt die Mac-Pipeline heute `programm` und `streaming`.
--
-- Warum die Pipeline trotzdem nicht angefasst werden muss:
--   Der Guard trägt die Herkunft bei Aktualisierungen selbst nach. Kommt ein
--   UPDATE ohne `quelle`, gewinnt der bisherige Wert (`OLD.quelle`). Das deckt
--   BEIDE Schreibweisen ab — die Spalte gar nicht anzufassen und sie
--   ausdrücklich als NULL mitzuschreiben. Erst dadurch ist eine Herkunftspflicht
--   überhaupt zumutbar: Bestandszeilen laufen unverändert durch, nur neue Zeilen
--   müssen ihre Quelle nennen.
--
-- Eigenschaften:
--   * ADDITIV — kd_store, kd_personal und deren Policies bleiben unberührt.
--     Kein Check und keine Spalte wird entfernt.
--   * IDEMPOTENT — mehrfaches Ausführen ist gefahrlos.
--   * IM ZWEIFEL DURCHLASSEN — ein zu strenger Guard legt die Datenversorgung
--     lahm. Die Feldprüfung greift nur, wenn für die Quelle ausdrücklich
--     `erlaubte_felder` hinterlegt ist (heute nirgends). Sie wird scharf, sobald
--     ein Lizenzvertrag konkrete Felder benennt — dann ist sie eine Eintragung
--     im Register, kein Release.
--   * KEIN CRON — die Löschfunktion ruft Max von Hand auf. Automatisches Löschen
--     auf Verdacht ist in einem System ohne Backup-Automatik die falsche Wahl.
-- ============================================================================


-- ============================================================================
-- Abschnitt A: Herkunft der Bestandszeilen nachtragen
-- Nur wo leer — ein vorhandener Wert wird nie überschrieben.
-- ============================================================================

update public.kd_catalog set quelle = 'film_at'
 where name = 'programm' and quelle is null;

update public.kd_catalog set quelle = 'watchmode'
 where name = 'streaming' and quelle is null;


-- ============================================================================
-- Abschnitt B: Feldprüfung
-- Die Payload ist ein Dokument mit einer Liste von Einträgen. Geprüft werden die
-- Schlüssel DIESER Einträge, nicht die Hülle: die Hülle trägt Betriebsangaben
-- (stand, quelle, zeitraum), die Einträge tragen die veröffentlichten Fakten —
-- und nur um die geht es in einer Lizenzvereinbarung.
-- ============================================================================

create or replace function public.kd_catalog_eintraege(p_name text, p_payload jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p_name like 'programm%' then
      coalesce(p_payload -> 'filme', p_payload -> 'data' -> 'filme', '[]'::jsonb)
    when p_name like 'streaming%' then
      coalesce(p_payload -> 'bekannt' -> 'titel', '[]'::jsonb)
      || coalesce(p_payload -> 'entdecken' -> 'titel', '[]'::jsonb)
    else '[]'::jsonb
  end
$$;

comment on function public.kd_catalog_eintraege(text, jsonb) is
  'Liste der veroeffentlichten Eintraege einer Katalog-Payload (Filme bzw. Titel).';

/* Erstes Feld, das nicht in der Positivliste steht — oder NULL, wenn alles passt.
   Bewusst als Positivliste: was nicht ausdruecklich vereinbart ist, ist nicht
   veroeffentlicht. Eine Negativliste wuerde jedes neue Feld der Quelle
   stillschweigend durchlassen. */
create or replace function public.kd_catalog_verbotenes_feld(p_eintraege jsonb, p_erlaubt text[])
returns text
language sql
immutable
set search_path = public
as $$
  select k
    from jsonb_array_elements(p_eintraege) as e,
         lateral jsonb_object_keys(e.value) as k
   where not (k = any (p_erlaubt))
   limit 1
$$;


-- ============================================================================
-- Abschnitt C: Guard ersetzen
-- Reihenfolge im Trigger ist Absicht: erst Herkunft nachtragen, dann Pflichten
-- prüfen. Sonst würde die Pflicht genau die Schreibvorgänge treffen, die sie
-- gar nicht meint.
-- ============================================================================

create or replace function public.kd_catalog_quellen_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  q          public.kd_quellen%rowtype;
  verboten   text;
  braucht    boolean;
begin
  -- (1) Herkunft bei Aktualisierungen bewahren. Deckt beide Schreibweisen der
  --     Pipeline ab: Spalte nicht angefasst und Spalte ausdrücklich NULL.
  if tg_op = 'UPDATE' and new.quelle is null then
    new.quelle := old.quelle;
  end if;

  -- (2) Welche Zeilen brauchen zwingend eine Herkunft?
  --     Die vier bewirtschafteten Katalogzeilen; `manifest` ist reine
  --     Verbindungsauskunft und bleibt ausgenommen.
  braucht := new.name in ('programm', 'streaming', 'programm_demo', 'streaming_demo');

  if braucht and new.quelle is null then
    raise exception
      'Zeile %: ohne Herkunft wird nichts veroeffentlicht. Setze quelle auf einen Slug aus kd_quellen.',
      new.name;
  end if;

  -- (3) Demo-Zeilen sind oeffentlich lesbar und muessen datiert und befristet
  --     sein — ein Schnappschuss ohne Stand ist von aktuellen Daten nicht zu
  --     unterscheiden.
  if right(new.name, 5) = '_demo' then
    if new.stand is null or new.gueltig_bis is null then
      raise exception
        'Demo-Zeile %: stand und gueltig_bis sind Pflicht (ehrlicher Schnappschuss).',
        new.name;
    end if;
  end if;

  -- (4) Registerpflicht und Status.
  if new.quelle is not null then
    select * into q from public.kd_quellen where slug = new.quelle;
    if not found then
      raise exception 'Quelle % steht nicht im Register kd_quellen.', new.quelle;
    end if;
    if q.status in ('pausiert', 'widerrufen', 'abgelaufen') then
      raise exception 'Quelle % hat Status % — Veroeffentlichung gesperrt.', new.quelle, q.status;
    end if;

    -- (5) Feld-Whitelist, nur wenn fuer die Quelle hinterlegt.
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

drop trigger if exists kd_catalog_quellen_guard on public.kd_catalog;
create trigger kd_catalog_quellen_guard
  before insert or update on public.kd_catalog
  for each row execute function public.kd_catalog_quellen_guard();


-- ============================================================================
-- Abschnitt D: Löschfristen
-- Aufruf im SQL-Editor. Vorher immer die Vorschau ansehen — die Funktion loescht
-- endgueltig, und ein geloeschter Katalog laesst sich nur durch einen neuen
-- Pipeline-Lauf beziehungsweise einen neuen Schnappschuss ersetzen.
--   Vorschau:  select * from public.kd_catalog_abgelaufene();
--   Abraeumen: select public.kd_catalog_abraeumen();
-- ============================================================================

create or replace function public.kd_catalog_abgelaufene()
returns table (name text, quelle text, gueltig_bis timestamptz, tage_ueberfaellig numeric)
language sql
stable
set search_path = public
as $$
  select c.name, c.quelle, c.gueltig_bis,
         round(extract(epoch from (now() - c.gueltig_bis)) / 86400.0, 1)
    from public.kd_catalog c
   where c.gueltig_bis is not null and c.gueltig_bis < now()
   order by c.gueltig_bis
$$;

create or replace function public.kd_catalog_abraeumen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.kd_catalog
   where gueltig_bis is not null and gueltig_bis < now();
  get diagnostics n = row_count;
  return n;
end
$$;

revoke execute on function public.kd_catalog_abraeumen() from public, anon, authenticated;
revoke execute on function public.kd_catalog_abgelaufene() from anon;


-- ============================================================================
-- Kontrolle nach dem Lauf (erwartete Ergebnisse):
--   select name, quelle from kd_catalog order by name;
--     -> manifest ohne Quelle; programm = film_at; streaming = watchmode
--   update kd_catalog set updated_at = now() where name = 'programm';
--     -> laeuft durch, quelle bleibt film_at   (Pipeline-Probe)
--   insert into kd_catalog (name, payload) values ('programm', '{}');
--     -> Fehler „ohne Herkunft wird nichts veroeffentlicht" (Konflikt/Guard)
--   select * from kd_catalog_abgelaufene();
--     -> leer, solange kein Schnappschuss abgelaufen ist
-- ============================================================================
