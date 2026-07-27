-- ===========================================================================
-- Etappe 7: Topf `kd:geschmacksprofil` in der Key-Whitelist zulassen
--
-- ADDITIV. Kein Schemawechsel, keine Datenänderung, keine neue Tabelle.
-- Genau eine Zeile Wirkung: die erlaubte Key-Menge wächst von 15 auf 16.
--
-- WARUM ES DIESE MIGRATION BRAUCHT
-- Die Etappen-7-Planung ging von „keine Migration" aus, weil das Profil in
-- `kd_personal` liegt und dort schon RLS, Größenlimit und Revisions-Trigger
-- greifen. Das Phase-0-Audit hat das widerlegt: Die Key-Liste ist ein
-- CHECK-Constraint in der Datenbank (20260725120000_kd_personal.sql:31-37),
-- kein Anwendungscode. Ein nicht gelisteter Key wird mit Postgres 23514
-- abgewiesen -- und der Treiber behandelt genau diesen Fehler als TERMINAL,
-- ohne Wiederholung (src/lib/accountDriver.js:158-161). Ohne diese Migration
-- schlüge jeder Profil-Sync still und endgültig fehl.
-- Die Ursprungsmigration schreibt den Weg selbst vor: „Ein neuer Topf = eine
-- Ein-Zeilen-Migration" (Z. 30).
--
-- WARUM ALLE 16 WERTE HIER STEHEN
-- Ein CHECK-Constraint ist nicht erweiterbar; er muss fallen und neu gesetzt
-- werden. Die 15 Bestandskeys stehen deshalb wortgleich noch einmal darin.
-- Ein vergessener Bestandskey würde den Sync ALLER Konten für diesen Topf
-- sofort und terminal brechen -- die Liste unten ist Zeichen für Zeichen aus
-- der Ursprungsmigration übernommen und darf nicht „aufgeräumt" werden.
--
-- NAMENSWAHL
-- `kd:geschmacksprofil`, nicht `geschmacksprofil`: Alle 15 Bestandskeys
-- tragen das `kd:`-Präfix, die zentrale Schlüsselliste (src/lib/storage.js)
-- setzt es voraus, und accountdriver_test.mjs:99 prüft es („Alle Töpfe stehen
-- auch in der zentralen Schlüsselliste").
--
-- GRÖSSE
-- Das Größenlimit von 1 MiB je Topf gilt unverändert und trägt mit weitem
-- Abstand: ein Profil mit Signalen und Prompt-Fassung liegt bei ~6 KB.
--
-- RLS
-- Unverändert. Die vier Policies auf `kd_personal` sind zeilen-, nicht
-- keybasiert und greifen auf `auth.uid()`; der neue Topf erbt sie ohne Zutun.
-- Es entsteht KEIN anon-Zugriff.
--
-- WIEDERHOLBAR: setzt eine feste Menge, kein Inkrement. Mehrfaches Ausführen
-- ist folgenlos.
-- ===========================================================================

alter table public.kd_personal drop constraint if exists kd_personal_key_erlaubt;
alter table public.kd_personal add constraint kd_personal_key_erlaubt check (key in (
  'kd:master', 'kd:artikel', 'kd:kino-pins', 'kd:merkliste', 'kd:vokabular',
  'kd:einstellungen', 'kd:entdecken-status', 'kd:autor-name', 'kd:streaming-dienste',
  'kd:mustwatch', 'kd:achievements',
  'kd:zeitgrenze', 'kd:filter-mediathek', 'kd:filter-kino', 'kd:filter-streaming',
  'kd:geschmacksprofil'
));

comment on constraint kd_personal_key_erlaubt on public.kd_personal is
  'Erlaubte Toepfe (16, Stand Etappe 7). Neuer Topf = neue Ein-Zeilen-Migration, die ALLE Werte neu setzt.';

-- Kontrolle: muss 16 Werte zeigen, darunter kd:geschmacksprofil.
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'kd_personal_key_erlaubt';
--
-- Gegenprobe (muss mit 23514 scheitern):
--   insert into public.kd_personal (account_id, key, value)
--   values (auth.uid(), 'kd:boeser-topf', '{}');
