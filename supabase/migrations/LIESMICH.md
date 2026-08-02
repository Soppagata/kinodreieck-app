# Datenbank-Migrationen

Dieser Ordner ist die **auditierbare Reihenfolge** aller Schemaänderungen. Die
historischen Dateien wurden von Hand im **Supabase-SQL-Editor** ausgeführt.
Gezielte neue Dateien dürfen auch über die verknüpfte Management-API laufen:

`supabase db query --linked --file <genau-eine-migration.sql>`

Am 31. Juli 2026 wurde die zuvor leere Remote-Migrationshistorie mit dem live
verifizierten Bestand abgeglichen. Alle lokalen Versionen bis einschließlich
`20260731170000` sind seither auch remote als angewandt markiert. Vor künftigen
Läufen zuerst `npx supabase migration list --linked` prüfen; eine Migration
darf nur angewandt werden, wenn ausschließlich die erwartete neue Datei offen
ist. Bei Problemen bleibt der kontrollierte Weg über
`supabase db query --linked --file <genau-eine-migration.sql>` plus
anschließendes `migration repair --status applied` erhalten.

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
| `20260730180000_etappe8_filmwissen_belegklassen.sql` | `bscjgwcntapobyxsiyce` | 2026-07-30 | Codex über Management-API | erfolgreich; institutionell/ redaktionell/ strukturiert als eingefrorene Belegklasse; LOC institutionell, Wikidata strukturiert, alle Quellenrechte weiterhin aus und Publikation service-only remote geprüft |
| `20260730210000_etappe8_filmwissen_adapter_betrieb.sql` | `bscjgwcntapobyxsiyce` | 2026-07-30 | Codex über Management-API | erfolgreich; ausschließlich Wikidata und LOC freigegeben, atomare Adaptervorbereitung, service-only LOC-Snapshot, `filmwissen-synthese` auf Sonnet/2048 Tokens; echte Rauchprobe P1–P21 grün |
| `20260730230000_etappe9_beta_tageslimit.sql` | `bscjgwcntapobyxsiyce` | 2026-07-30 | Codex über Management-API | erfolgreich; Bauphasenlimit von 200 auf 10 Aufträge pro Konto und Tag gesenkt; Wert und Bereitschaft des `ai_aktiv`-Not-Aus danach remote verifiziert |
| `20260730231000_etappe9_beta_antwortlimit.sql` | `bscjgwcntapobyxsiyce` | 2026-07-30 | Codex über Management-API | erfolgreich; `intelligent-search` für die geschlossene Beta von 8192 auf 4096 Ausgabetokens begrenzt und remote verifiziert |
| `20260731120000_shared_articles.sql` | `bscjgwcntapobyxsiyce` | 2026-07-31 | Codex über Management-API | erfolgreich; accountgebundene öffentliche Blog-Projektionen, direkte Tabelle privat, schmale anon-RPC; `npm run test:rls` danach 60/60 grün |
| `20260731121000_archive_legacy_shared.sql` | `bscjgwcntapobyxsiyce` | 2026-07-31 | Codex über Management-API | erfolgreich; vor Lauf 0 Legacy-Shared-Zeilen, Archiv 0, aktive Legacy-Zeilen 0, Schreibblock aktiv und live verifiziert |
| `20260731140000_demo_seed_catalog.sql` | `bscjgwcntapobyxsiyce` | 2026-07-31 | Codex über Management-API | erfolgreich; 120 Filme als validierter Format-1-Seed in `kd_catalog`, anonyme und angemeldete Sichtbarkeit sowie unveränderte Zugriffstrennung mit `npm run test:rls` 63/63 belegt; vier Legacy-Demozeilen für ausgelieferte Clients bewusst noch erhalten |
| `20260731170000_split_streaming_catalog.sql` | `bscjgwcntapobyxsiyce` | 2026-07-31 | Codex über Management-API | erfolgreich; bekannte und vollständige Streamingtitel in vier getrennte Live-/Demo-Zeilen aufgeteilt, Trigger hält alte Pipeline-Writes kompatibel; 42 Funktionen, 13 Trigger und 21 Policies live verifiziert, `npm run test:rls` 64/64 grün |
| `20260802120000_wochenplan_serienbeobachtung.sql` | `bscjgwcntapobyxsiyce` | 2026-08-02 | Codex über Management-API | erfolgreich; 17er-Personaltopf-Whitelist, private Serienbeobachtung mit vier Owner-Policies und authentifizierter atomarer RPC remote verifiziert; `npm run test:rls` danach 64/64 grün; die ältere offene Stapelimport-Migration blieb unangetastet |
| `20260802220000_shared_article_claim_tokens.sql` | `bscjgwcntapobyxsiyce` | 2026-08-02 | Codex über verknüpfte Management-API | erfolgreich; eindeutige unveränderliche Upload-Tokens, Autor-Claim beim Publish und atomare Einmal-Übernahme je Konto; `npm run test:rls` danach 67/67 grün; die ältere offene Stapelimport-Migration blieb unangetastet |

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

- `../katalog_schema.sql` — das historische Basisschema von `kd_catalog`.
- `../current_schema.sql` — der datenfreie Ist-Stand aller Anwendungstabellen,
  Funktionen, Trigger, Policies und Grants, einschließlich des alten
  `kd_store`-Basisschemas.

`kd_store` (Legacy-Schlüssel-Sync) ist eingefroren. Der Rückbau seiner
`scope=user`-Policies ist ein eigener, späterer Cleanup-Schritt und bekommt
dann eine additive Migrationsdatei.
