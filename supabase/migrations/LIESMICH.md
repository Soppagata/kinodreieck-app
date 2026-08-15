# Datenbank-Migrationen

Dieser Ordner ist die **auditierbare Reihenfolge** aller Schemaänderungen. Die
historischen Dateien wurden von Hand im **Supabase-SQL-Editor** ausgeführt.
Gezielte neue Dateien dürfen auch über die verknüpfte Management-API laufen:

`supabase db query --linked --file <genau-eine-migration.sql>`

Am 31. Juli 2026 wurde die zuvor leere Remote-Migrationshistorie mit dem live
verifizierten Bestand abgeglichen. Alle lokalen Versionen bis einschließlich
`20260809121000_rollen_v1_access_enforcement.sql` sind seither auch remote als
angewandt markiert. Die vorgeschriebene Forward-Kette für den Private-Pilot ist:
`20260809180000_event_radar_local_basis.sql` →
`20260809220000_private_pilot_ops.sql` →
`20260810120000_private_pilot_retention_fix.sql` →
`20260814120000_radar_max_manual_pilot.sql` →
`20260815120000_private_export_radar_pilot_compat.sql`.
Die ersten drei Schritte dieser Kette sind remote verbucht; `20260814120000` und
`20260815120000` sind Source-only/offen. Vor künftigen
Läufen zuerst `npx supabase migration list --linked` prüfen; eine Migration
darf nur angewandt werden, wenn ausschließlich die erwartete neue Datei offen
ist. `20260809220000_private_pilot_ops.sql` ist lokal auf Blob-ID
`2143d36957f5be56e9973e15584d02769b9c4222` verifiziert.
Remote-bestätigt sind die Radar-Töpfe `kd_radar_operations` und
`kd_radar_share_operations` als leer verifiziert; `kd_radar_pilot_import_operations` ist in diesem Remote-Stand nicht vorhanden und daher nicht leer verifizierbar.
`export_enabled` ist im bestätigten Remote-Stand vollständig nicht vorhanden; die Addierung erfolgt
nur in `20260815120000_private_export_radar_pilot_compat.sql` mit Additiv-default `false`.
Bei Problemen bleibt der kontrollierte Weg über
`supabase db query --linked --file <genau-eine-migration.sql>` plus
anschließendes `migration repair --status applied` erhalten.

**Regel:** Was hier liegt, ist gelaufen oder läuft als Nächstes. Kein loses
Ideen-SQL im Ordner. Historische Dateien sind idempotent formuliert. Die
Rollen-v1-Access-Basis ist absichtlich strenger: Ein unerwartet vorhandener
Objektname oder ein Wiederholungslauf bricht fail-closed ab, statt eine
möglicherweise abweichende Tabelle still zu akzeptieren. Der Migrationsledger
ist deshalb vor jedem einzelnen Lauf verbindlich zu prüfen.

## Reihenfolge

Dateiname `YYYYMMDDHHMMSS_<name>.sql` — lexikografisch sortiert = Ausführungsreihenfolge.

## Laufprotokoll

Nach jedem Lauf hier eine Zeile ergänzen. Bereits angewandte SQL-Dateien bleiben
einschließlich ihres historischen Kopfkommentars unverändert; der Ledger ist
die Statusautorität für den Remote-Lauf.

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
| `20260801194500_stapelimport_medien.sql` | `bscjgwcntapobyxsiyce` | 2026-08-08 | Codex über verknüpfte Management-API | erfolgreich; nach fail-closed Function und vor Kostenzaun angewandt; Medienlimit 950000, Modell klein, 4096 Token und 4-US-Cent-Task-Cap remote verifiziert |
| `20260802120000_wochenplan_serienbeobachtung.sql` | `bscjgwcntapobyxsiyce` | 2026-08-02 | Codex über Management-API | erfolgreich; 17er-Personaltopf-Whitelist, private Serienbeobachtung mit vier Owner-Policies und authentifizierter atomarer RPC remote verifiziert; `npm run test:rls` danach 64/64 grün; die ältere offene Stapelimport-Migration blieb unangetastet |
| `20260802220000_shared_article_claim_tokens.sql` | `bscjgwcntapobyxsiyce` | 2026-08-02 | Codex über verknüpfte Management-API | erfolgreich; eindeutige unveränderliche Upload-Tokens, Autor-Claim beim Publish und atomare Einmal-Übernahme je Konto; `npm run test:rls` danach 67/67 grün; die ältere offene Stapelimport-Migration blieb unangetastet |
| `20260808120000_ai_anbieter_request_kostenzaun.sql` | `bscjgwcntapobyxsiyce` | 2026-08-08 | Codex über verknüpfte Management-API | erfolgreich; universeller 500-US-Cent-Vorabzaun, Sonnet-Preisboden 300/1500, Task-Caps 6/4 und service-only RPC remote verifiziert; Health grün, Rauchprobe 23/23 |
| `20260808225500_etappe9_beta_tageslimit_30.sql` | `bscjgwcntapobyxsiyce` | 2026-08-08 | Codex über verknüpfte Management-API | erfolgreich; Tageslimit numerisch auf 30 gesetzt; Betriebsschalter `ai_aktiv=true` und Not-Aus-Bereitschaft, Monatsdeckel 1000, Request-Cap 500, Task-Caps `filmwissen-synthese=6` / `media-batch-extract=4` US-Cent, Sonnet-Preisboden 300/1500 sowie Parallelität 2 unverändert verifiziert; alle 27 Migrationsversionen lokal/remote deckungsgleich |
| `20260809120000_rollen_v1_access_basis.sql` | `bscjgwcntapobyxsiyce` | 2026-08-09 | Codex über verknüpfte Management-API | erfolgreich einzeln angewandt und rückgelesen; own-select-only, keine Browser-Writes, kein anon-Recht, Helper im Browser nur authenticated/kein anon, KI vorher und danach aus; SHA-256 `3d7281e28a059f4aff0859bf2b99ebc5d2fb1a77263be1a2fcd2312032470173` |
| `20260809121000_rollen_v1_access_enforcement.sql` | `bscjgwcntapobyxsiyce` | 2026-08-09 | Codex über verknüpfte Management-API | erfolgreich nach vollständigem 3/3-Bootstrap einzeln angewandt; 15/15 Policies und 3/3 RPCs active-gated, Legacy-ACLs ohne TRUNCATE/MAINTAIN belegt; RLS `active` 73/73, `inactive` 14/14, `missing` 14/14, null Testreste, KI weiter aus; SHA-256 `d010ce9ae653b8abbcefcb6697526449427bd2772192fccc7a43f06ac1717727` |
| `20260814120000_radar_max_manual_pilot.sql` | | | | Source-only; nicht remote angewandt (REMOTE_STAND: fehlt) |
| `20260815120000_private_export_radar_pilot_compat.sql` | | | | Source-only; nicht remote angewandt (REMOTE_STAND: fehlt), SQL-Kontrakt wird lokal geprüft |

## Entscheidung zum Beta-Tageslimit (08.08.2026)

**Verworfen — nicht wieder aufmachen:**

| Ansatz | Grund | Datum |
|---|---|---|
| Dauerhaft 10 KI-Aufträge je Konto und Tag | Für realistische Nutzung zu knapp; bereits Rauchprobe plus beginnendes Eval liefen am selben Tag exakt in diese Grenze. | 2026-08-08 |

**Entschieden:**

| Entscheidung | Begründung | Randbedingung / offene Option |
|---|---|---|
| Dauerhaft 30 KI-Aufträge je Konto und Kalendertag (Europe/Vienna) | Nutzer können realistisch mehr als zehn KI-Funktionen pro Tag verwenden; Monatsbudget, 500-US-Cent-Request-Cap und Not-Aus bleiben die eigentlichen Kostenzäune. | Erst durch eine neue Owner-Entscheidung senken, wenn die realen Kosten nicht mehr tragbar sind. |

## Nach Migration 1

`node tools/rls_test_personal.mjs` gegen dieselbe Datenbank laufen lassen (braucht
zwei Testaccounts, Konfiguration nur über Umgebungsvariablen — siehe Kopf der Datei).
Erst ein grüner Negativtest belegt, dass die Account-Isolation wirklich greift.

## Rollen-v1: getrennte Remote-Reihenfolge

Die beiden Rollen-v1-Dateien werden remote ausschließlich einzeln angewandt.
Ein unqualifiziertes `supabase db push` über beide Dateien ist verboten, weil
zwischen ihnen der bestätigte Bootstrap liegt. Der freizugebende Betriebsweg
ist:

1. `ai_aktiv=false` setzen und unabhängig rücklesen;
2. ausschließlich `20260809120000_rollen_v1_access_basis.sql` anwenden;
3. bestätigte bestehende Konten außerhalb des Repositories per `service_role`
   bootstrappen und jede Freigabe rücklesen;
4. erst danach `20260809121000_rollen_v1_access_enforcement.sql` anwenden;
5. RLS-Vertrag in den drei Modi `active`, `inactive` und `missing` ausführen;
6. KI bleibt bis zum späteren Function-/Staging-Gate ausgeschaltet.

**Kompatibilitätsgrenze am STOP:** Der statische Befund für den bestehenden
Frontend-Stand `bf82304` ist enger als „inaktiv sieht nichts“: Mit gültigem
Sitzungstoken wählt dieser Stand weiterhin den Live-Katalogpfad. Bei
`active=false` sperrt dessen RLS die Serverzeilen mit HTTP 200 und leerer Menge,
der alte Katalogpfad kann aber einen bereits vorhandenen lokalen Live-Cache
anzeigen. Derselbe Stand kennt noch keine Access-Maske für lokale persönliche
Caches. Ein dediziertes inaktives Testkonto kann im alten Produktionsfrontend
daher vorhandene lokale Altdaten sehen; Serverdaten und Serverwrites bleiben
gesperrt. Für vollständig und rückgelesen aktiv gebootstrappte bestehende
Produktionskonten entsteht dagegen kein Rollen-v1-Lockout. Diese Frontend-
Einschränkung bleibt am Remote-STOP offen und wird nicht als serverseitiges
RLS-Leck umgedeutet.

`tools/rls_test_personal.mjs` verändert Access-Zeilen nicht selbst. Der aktive
Modus benötigt zwei kontrolliert aktive Testkonten und beweist den bisherigen
vollständigen Konto-Isolationsvertrag. Für die beiden fail-closed Modi wird
Testkonto B vor dem jeweiligen Lauf über den vertrauenswürdigen Adminweg auf
`active=false` gesetzt beziehungsweise seine Access-Zeile kontrolliert
entfernt. Danach wird die bestätigte finale Kontomatrix wiederhergestellt und
rückgelesen:

```sh
KD_RLS_ACCESS_MODE=active npm run test:rls
KD_RLS_ACCESS_MODE=inactive npm run test:rls
KD_RLS_ACCESS_MODE=missing npm run test:rls
```

Keiner dieser Testläufe enthält einen Anbieterrequest. Bei Fehlern bleibt die
KI aus; die Durchsetzung wird nicht auf den alten auth-only-Vertrag
zurückgerollt, sondern fail-closed vorwärts repariert.

Der lokale Schema-Vertrag prüft zusätzlich die Legacy-ACLs ausdrücklich gegen
RLS-Umgehung: anon erhält auf `kd_store` ausschließlich
`SELECT/INSERT/UPDATE/DELETE`, authenticated dort nichts; weder `TRUNCATE` noch
`MAINTAIN` ist damit für Browserrollen enthalten. `kd_owner` hat keinen direkten
Browserzugriff. `kd_key_ok(text)` bleibt als SECURITY-DEFINER-Lesepfad nur für
anon (und den service_role-Betriebsweg) ausführbar. Die bestehenden
`kd_store`-Policies und der Header-Vertrag `x-kd-key` werden nicht verändert.

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

`kd_store` (Legacy-Schlüssel-Sync) ist auf Datenmodell und Policies eingefroren.
Rollen-v1 korrigiert ausschließlich die zu breiten Tabellenrechte auf den
bereits bestehenden tokenfreien anon-Vertrag. Der Rückbau seiner
`scope=user`-Policies ist weiterhin ein eigener, späterer Cleanup-Schritt und
bekommt dann eine additive Migrationsdatei.
