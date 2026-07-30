# Datenbank-Migrationen

Dieser Ordner ist die **auditierbare Reihenfolge** aller Schemaänderungen. Die
historischen Dateien wurden von Hand im **Supabase-SQL-Editor** ausgeführt.
Gezielte neue Dateien dürfen auch über die verknüpfte Management-API laufen:

`supabase db query --linked --file <genau-eine-migration.sql>`

Die alte Remote-Migrationshistorie wurde dabei nicht nachträglich erfunden und
ist deshalb leer. **Kein `db push --include-all`**: Das würde alle historischen
Dateien erneut als ausstehend behandeln. Neue Läufe bleiben dateiweise,
kontrolliert und werden unten protokolliert.

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
| `20260726120000_etappe4_guard_ausbaustufe.sql` | | | | |
| `20260726160000_etappe5_ki_unterbau.sql` | Produktion (EU-West) | 2026-07-26 | Max | erfolgreich; 11 Konfigurationszeilen |
| `20260726180000_etappe5_ki_unterbau_haertung.sql` | Produktion (EU-West) | 2026-07-26 | Max | erfolgreich; Rauchprobe danach 11/11 |
| `20260727180000_etappe6_ausgabebudget_suche.sql` | Produktion (EU-West) | 2026-07-27 | Max | erfolgreich; `task_max_tokens` fuer `intelligent-search` auf 8192 |
| `20260727190000_etappe6_tageslimit_bauphase.sql` | Produktion (EU-West) | 2026-07-27 | Max | erfolgreich; Tageslimit fuer die Bauphase auf 200 -- VOR DER TESTERRUNDE ZURUECKDREHEN |
| `20260727210000_etappe7_profil_topf.sql` | `bscjgwcntapobyxsiyce` | spätestens 2026-07-28 | ursprünglicher Lauf unbekannt; von Codex verifiziert | erfolgreich belegt; `npm run test:rls` 36/36, darunter Profil-Topf, Konto-Isolation und anon-Sperre |
| `20260729200000_etappe7_structured_output_timeout.sql` | `bscjgwcntapobyxsiyce` | 2026-07-29 | Codex über Management-API | erfolgreich; 120 s Timeout, `profile-extract` explizit Haiku/4096 Tokens; Post-Fix-Livetest grün |
| `20260729210000_etappe8_film_forecast.sql` | `bscjgwcntapobyxsiyce` | 2026-07-29 | Codex über Management-API | erfolgreich; `film-forecast` verpflichtend auf `gross`, 2048 Tokens; Function-Tests 262/262, echte Rauchprobe 17/17 und RLS 36/36 grün |
| `20260729220000_etappe8_filmwissen_cache.sql` | `bscjgwcntapobyxsiyce` | 2026-07-29 | Codex über Management-API | erfolgreich; gemeinsamer accountfreier Cache, keine Quelle vorab freigegeben; Vertragstest 44/44 und RLS 54/54 grün |
| `20260730110000_etappe8_filmwissen_synthese_sicherung.sql` | `bscjgwcntapobyxsiyce` | 2026-07-30 | Codex über Management-API | erfolgreich; fail-closed Vorbereitung und Fehlerabschluss; beide RPCs remote nur für `postgres`/`service_role` ausführbar |
| `20260730140000_etappe8_filmwissen_adapter_sperren.sql` | `bscjgwcntapobyxsiyce` | 2026-07-30 | Codex über Management-API | erfolgreich; feste Wikidata-/LOC-Kandidaten weiterhin ohne Rechte, DB-weites Rate-Limit, Reaper, Beleg-Ursprung NOT NULL und 5-US-Cent-Task-Cap remote geprüft |
| `20260730160000_etappe8_filmwissen_atomarer_abschluss.sql` | `bscjgwcntapobyxsiyce` | 2026-07-30 | Codex über Management-API | erfolgreich; Filmwissen-Publikation und zugehöriges KI-Log schließen bei Erfolg oder Anbieterfehler atomar; beide RPCs remote nur für `postgres`/`service_role` ausführbar |

## Nach Migration 1

`node tools/rls_test_personal.mjs` gegen dieselbe Datenbank laufen lassen (braucht
zwei Testaccounts, Konfiguration nur über Umgebungsvariablen — siehe Kopf der Datei).
Erst ein grüner Negativtest belegt, dass die Account-Isolation wirklich greift.

## Nach Migration 2 (Etappe 4)

Abschnitt D der Datei trennt den Katalog-Lesezugriff (E1=b): anon liest nur noch
`manifest` + `*_demo`; `programm`/`streaming` verlangen eine Sitzung. Bis Phase 2
(App sendet Sitzungs-Token am Katalogpfad) zehren Geräte vom Katalog-Cache.
Kontrollabfragen stehen am Dateiende.

## Nach Migration 3 (Etappe 4, Ausbaustufe)

Ab hier braucht **jede** bewirtschaftete Katalogzeile (`programm`, `streaming`,
`programm_demo`, `streaming_demo`) eine Herkunft aus `kd_quellen`; `manifest`
bleibt ausgenommen. Bestandszeilen sind nachgetragen, und der Guard bewahrt die
Herkunft bei Aktualisierungen — **die Mac-Pipeline muss nicht angepasst werden.**

Zwei neue Handgriffe im SQL-Editor:

- Feldfreigabe einer Quelle hinterlegen (wird erst durch den Eintrag scharf):
  `update kd_quellen set erlaubte_felder = array['titel','kino','beginn'] where slug = '…';`
- Abgelaufene Schnappschüsse: erst `select * from kd_catalog_abgelaufene();`
  ansehen, dann `select kd_catalog_abraeumen();`. Bewusst kein Automatismus.

## Was NICHT hier liegt

- `../katalog_schema.sql` — der öffentliche Katalog (`kd_catalog`), historisch vor
  Einführung dieses Ordners angelegt. Bleibt, wo es ist.
- `kd_store` (Legacy-Schlüssel-Sync) — eingefroren. Der Rückbau seiner
  `scope=user`-Policies ist ein eigener, späterer Cleanup-Schritt und bekommt dann
  eine eigene Migrationsdatei.
