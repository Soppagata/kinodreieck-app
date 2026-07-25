# Datenbank-Migrationen

Dieser Ordner ist die **auditierbare Reihenfolge** aller Schemaänderungen. Es gibt
bewusst kein CLI-Setup: die Dateien werden von Hand im **Supabase-SQL-Editor**
ausgeführt (Dashboard → SQL Editor → Datei komplett einfügen → Run).

**Regel:** Was hier liegt, ist gelaufen oder läuft als Nächstes. Kein „noch nicht
ausführen"-SQL im Ordner. Jede Datei ist idempotent formuliert, mehrfaches
Ausführen ist gefahrlos.

## Reihenfolge

Dateiname `YYYYMMDDHHMMSS_<name>.sql` — lexikografisch sortiert = Ausführungsreihenfolge.

## Laufprotokoll

Nach jedem Lauf hier eine Zeile ergänzen **und** den Kopfkommentar in der SQL-Datei
ausfüllen.

| Datei | Projekt-Ref | Datum | Ausgeführt von | Ergebnis |
|---|---|---|---|---|
| `20260725120000_kd_personal.sql` | Produktion (EU-West) | 2026-07-25 | Max | erfolgreich; `npm run test:rls` danach 18/18 grün |
| `20260725220000_etappe4_quellenregister_zugriff.sql` | | | | |

## Nach Migration 1

`node tools/rls_test_personal.mjs` gegen dieselbe Datenbank laufen lassen (braucht
zwei Testaccounts, Konfiguration nur über Umgebungsvariablen — siehe Kopf der Datei).
Erst ein grüner Negativtest belegt, dass die Account-Isolation wirklich greift.

## Nach Migration 2 (Etappe 4)

Abschnitt D der Datei trennt den Katalog-Lesezugriff (E1=b): anon liest nur noch
`manifest` + `*_demo`; `programm`/`streaming` verlangen eine Sitzung. Bis Phase 2
(App sendet Sitzungs-Token am Katalogpfad) zehren Geräte vom Katalog-Cache.
Kontrollabfragen stehen am Dateiende.

## Was NICHT hier liegt

- `../katalog_schema.sql` — der öffentliche Katalog (`kd_catalog`), historisch vor
  Einführung dieses Ordners angelegt. Bleibt, wo es ist.
- `kd_store` (Legacy-Schlüssel-Sync) — eingefroren. Der Rückbau seiner
  `scope=user`-Policies ist ein eigener, späterer Cleanup-Schritt und bekommt dann
  eine eigene Migrationsdatei.
