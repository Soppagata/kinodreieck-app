# FlixPatrol und Betriebsreparatur – Masterplan

Stand: 10. September 2026. Master ist dieser Task. Max hat die tägliche
FlixPatrol-Automatik mit den gespeicherten Schlüsseln und höchstens einem
Quota-Request pro Tag / 31 pro Monat ausdrücklich bestätigt und die Umsetzung
mit je einem Baumeister pro Etappe beauftragt. Das Gesamtabo umfasst 1000
Requests pro Monat; alle FlixPatrol-Verbraucher verwenden denselben Zähler.
Es entsteht kein zusätzliches Kontingent-Gate und keine Frontendanzeige.

Die vollständige Inventur mit 28 Findings bleibt in
[FLIXPATROL_FINDINGS_2026-09-09.md](FLIXPATROL_FINDINGS_2026-09-09.md).
Sie ist keine Liste von 28 automatischen Umbauten. Bestehende Funktionen
werden gezielt verbessert; Bereiche ohne belegten Nutzen erhalten keinen
eigenen API-Pfad. Moviepilot und andere neue Quellen folgen erst nach dem
stabilen Betrieb. Die ausstehende TMDB-Mail blockiert diese Etappen nicht.

## Nutzerergebnisse – ein Register

Die ursprünglichen IDs M1–M7 bleiben erhalten. Die Inventur unter M6 ist
abgeschlossen; Max' neuer Umsetzungsauftrag erweitert M6 ausdrücklich um
den gemeinsamen Faktenpfad, sichere Zuordnung und die unten benannten
Verbraucher. Damit geht kein früherer Lieferstand verloren.

| ID | Fertiges Nutzerergebnis | Stand / Etappe |
| --- | --- | --- |
| M1 | Betriebschecks prüfen die richtige Umgebung; Fehlermeldungen nennen die echte Ursache und verschleiern keinen Ausfall. | DONE für Monitorlogik: natürlicher Lauf 34463011534 nennt nur den tatsächlichen Feed-Quellenfehler; Entdecken-Reparatur bleibt M2; E1 |
| M2 | Entdecken aktualisiert alle fünf Quellen im vereinbarten 50er-Mix und zeigt echte Quellenstände. | Top10-Parser real repariert; fünf Charts live gespeichert. Heutiger Owner-Test findet weitere Title-Parserabweichung; Feedabschluss offen, Tagesautomatik aktiv; E2 → E4 |
| M3 | Verspätete natürliche Tagesläufe erledigen fällige Arbeit ohne doppelte Tagesversuche. | GEBAUT und Migration live; erster natürlicher Entdecken-Lauf offen; E4 |
| M4 | Entdecken und kostenpflichtiges Radar sind getrennt betreibbar; keine versteckte neue KI-Aktivierung. | Vorreparatur integriert; E1 |
| M5 | Der gemeinsame Kandidat ist geprüft, geliefert und anhand echter Läufe sowie Datenständen belegt. | Lokales Gesamtgate, Backend-Readback und erforderliche Main-CI grün; natürlicher Feed-/Monitorabschluss offen; Master |
| M6 | FlixPatrol-Fakten werden einmal gepflegt, sicher zugeordnet und in den ausgewählten Nutzer-/KI-Funktionen ohne Überschreiben persönlicher Daten wiederverwendet. | Backend und Staging geliefert; fünf echte Charts und 50 Titelreferenzen gespeichert, Titeldetails noch offen wegen M2; E2, E3, E5, E6 |
| M7 | FlixPatrol-Abrufe werden im Hintergrund dauerhaft gezählt und täglich mit dem offiziellen Kontostand abgeglichen. | DONE; natürlicher Ticker grün; mitsamt Owner-Test und gezielter Titeldiagnose 13 Versuche terminal verbucht; E1 |

## Sechs Etappen mit je einem Baumeister

| Etappe | Ergebnis und klare Grenze | Voraussetzung | Fertigkriterium |
| --- | --- | --- | --- |
| E1 – Betrieb und Ticker | Täglicher Quota-Workflow, verständliche Monitore, saubere Entdecken-/Radar-Trennung. Die 15 Fehler des alten Live-RLS-Tests werden auf konkrete Konfigurations-/Kontozustände zurückgeführt; keine heimliche Kontoaktivierung. | Gemeinsame Basis | Workflow und Betriebsverträge lokal belegt; Master veröffentlicht den autorisierten Ticker und liest Status zurück. Ein natürlicher Lauf wird erst nach tatsächlicher Ausführung als belegt markiert. |
| E2 – Gemeinsame API-Grundlage | Gezählt arbeitender FlixPatrol-Client für Charts/Titel, quellenspezifische Normalisierung und ein gemeinsamer neutraler Fakten-/Ergebniscache mit Herkunft, Aktualität und negativen Treffern. | Gemeinsame Basis | Dokumentierte öffentliche API-Verträge, stabile Exports, additive Migration und fokussierte Mock-/PG-Tests. Bestehendes fetchQuota und Live-Zählerformat bleiben kompatibel; kein Film-/Nutzer-Write. |
| E3 – Sichere Filmzuordnung | Starke IDs zuerst, Film/Serie und Bezugsjahr prüfen; widersprüchliche oder mehrdeutige Zuordnungen bleiben offen. Die automatische Streaming/Mediathek-Projektion überschreibt keine vorhandenen Identitäten. | Gemeinsame Basis | Regressionen für Remakes, widersprechende IDs, fehlendes Jahr/Typ und sichere Positivfälle. Reine Suche darf weiterhin Vorschläge liefern; kein Umbau persönlicher Datentöpfe. |
| E4 – Aktuelles Entdecken | Echte API-Anbindung für Prime/Disney/Apple; ÖFI und Netflix weiterverwenden. 15 ÖFI + 10 Netflix + 10 Prime + 10 Disney + 5 Apple, ehrliche Quellen-/Abrufdaten, letzter guter Stand bei Fehlern. | E2 integriert, E1-Verträge fest | Wiederverwendete Caches, alle Requests gezählt, keine stille Rückkehr zum alten August-Pool, keine zusätzlichen KI-Requests. Natürlicher Tageslauf und Feed-Readback werden gesondert belegt. |
| E5 – Import und Metadaten | Importierte Filme über den gemeinsamen Faktenbestand sicherer erkennen und Lücken als belegte Ergänzungen anbieten. Finder, Karten und Empfehlungen verwenden dieselben Fakten soweit ihr bestehender Vertrag passt. | E2 + E3 integriert; E4-Datenvertrag fest | Eingabe/Korrekturen, Bewertungen, Notizen, Besitz und Sehstand bleiben führend. Keine API je Suche/Nutzer, keine neue Vollkopie in persönlichen Backups. |
| E6 – KI-Faktenkontext | Import-Nachprüfung, Prognose, Profil-Filmerwähnungen und Radar erhalten passende gecachte neutrale Fakten. Nur konkrete Informationslücken schließen. | E2 + E3 + E5 integriert | Herkunft und Identität bleiben nachvollziehbar; Chartplatz wird weder Geschmack noch AT-Verfügbarkeit. Bloganalyse, Diagnosen und ruhende Aufgaben erhalten keinen eigenen API-Loop. Bau/Tests mit Mocks; neue bezahlte KI-Läufe sind nicht Teil dieser Freigabe. |

E1/E2/E3 starten gleichzeitig. E4 folgt nach eingefrorener E2-Grundlage;
E5 darf erst parallel zu E4 starten, wenn beide Write-Flächen und Datenverträge
nachweislich disjunkt sind. Andernfalls folgt E5 direkt danach. E6 folgt wegen
des gemeinsamen Fakten- und Importvertrags. Das ist eine Datenabhängigkeit,
keine zusätzliche Freigaberunde.

## Parallelwelle 1

- Gemeinsamer Nicht-main-Basiscommit: `d6554cfa03d0c9c62ac43f0f6d6d954b62fa381d`.
- Darin sind die bereits gelieferten Betriebsreparaturen `713436b` und der
  live geprüfte Tickerstand `3ce4d7d` zusammengeführt; Dokumentkonflikte wurden
  zugunsten der vollständigen aktuellen Findings/Belege gelöst.
- Masterzweig: `codex/flixpatrol-master-20260909`.
- Masterworktree: `/private/tmp/kd-flixpatrol-master-20260909`.
- Alle drei Baumeister starten exakt auf dieser Basis, arbeiten lokal und
  ziehen keine Commits der anderen Baumeister ein. Keine weiteren Bauchats.

| Paket / zugewiesene IDs | Eigener Task / Branch / Worktree | Exklusive Write-Flächen | Zustand |
| --- | --- | --- | --- |
| E1 / M1, M4, M7 | `etappe_01_betrieb`; `codex/flixpatrol-e1-betrieb-20260909`; `/private/tmp/kd-flixpatrol-e1-betrieb-20260909` | Die sechs Betriebsworkflows private-ops-monitor, keepalive, automatic-ai-check, radar-six-day, entdecken-six-day, flixpatrol-usage; tools/private-ops-check.mjs und dessen Tests; tools/rls_test_personal.mjs und dedizierte RLS-Vorbereitungstests; automatic_ai_check_test.mjs, cleanup_b3_test.mjs, entdecken_weekly_trigger_test.mjs, neuer flixpatrol_usage_workflow_test.mjs; docs/BETRIEBSLAEUFE*.md | INTEGRATED als `d7bc9eb` + `66d7ee1`; 114 Paketchecks und 15 Delta-Checks grün; gemeinsamer lokaler und CI-Abschlusslauf grün |
| E2 / M2, M6 | `etappe_02_daten`; `codex/flixpatrol-e2-daten-20260909`; `/private/tmp/kd-flixpatrol-e2-daten-20260909` | supabase/functions/_shared/flixpatrol*.js; genau neue Migration 20260909190000_flixpatrol_data_cache.sql; flixpatrol_client_test.mjs, flixpatrol_usage_contract_test.mjs und neue flixpatrol_data_*_test.mjs; docs/FLIXPATROL_DATENVERTRAG.md | INTEGRATED als `c99447e` + `c9a8c54`; 58 JS- und 10 PG-Checks grün, einschließlich paralleler Titelwrites |
| E3 / M6 | `etappe_03_identitaet`; `codex/flixpatrol-e3-identitaet-20260909`; `/private/tmp/kd-flixpatrol-e3-identitaet-20260909` | src/lib/katalog.js; neuer src/lib/externalTitleIdentity.js; katalog_test.mjs und neuer external_title_identity_test.mjs; docs/FLIXPATROL_IDENTITAET.md | INTEGRATED als `9eacb18` + `f27252b`; 12 Helper-Tests und 104 Katalogchecks grün; gemeinsamer lokaler und CI-Abschlusslauf grün |

Eingefroren: alle bestehenden SQL-Migrationsbytes; Function-Handler und
Runtime-Verdrahtung außerhalb der jeweils benannten Fläche; Entdecken- und
KI-Produktdateien; package.json, sämtliche Lockfiles, Dependencies, globale
Styles, persönliche Datenregister sowie die drei Master-/Ticker-/Findingsdocs.
Der Master besitzt ausschließlich die Testeinbindung und dokumentierte kleine
Integrationsnähte. Eine neue fachliche Abhängigkeit geht als BLOCKER:SCOPE_DRIFT
zurück; nur betroffene Pakete warten.

Kollisionsprüfung: Dateien/Generatoren, Exports, Schema/State/Config, Tests,
Dependencies und Remote-Wirkungen sind zugeordnet. E1×E2, E1×E3 und E2×E3 sind
PARALLEL_OK: keine gemeinsame Schreibfläche, keine Output-Abhängigkeit.
Die gemeinsame bestehende Quota-Schnittstelle bleibt unverändert.
Integrationsreihenfolge: E1 → E2 → E3. Danach genau ein vollständiger lokaler
Abschlusslauf auf dem integrierten Kandidaten; keine parallelen PG-Serverstarts.
Baumeister führen nur fokussierte Tests aus, PostgreSQL-Tests dieser Welle
gehören exklusiv E2. Der Master startet währenddessen keine PG-Suite.

Master-Nähte: neue Tests in bestehende Einstiege eingebunden. Der vorhandene
Usage-PG-Test behält seinen kurzen Socketpfad; die CI legt `/private/tmp`
bereits an. E2s neuer Test verwendet einen portablen temporären Pfad und
Loopback statt langer macOS-Socketpfade. `package.json`, Lockfiles und feste
Live-Provenienzhashes unverändert.

Welle 1 lokal bestanden: `npm test` einschließlich temporärer PostgreSQL-
Datenbanken, Einzeldatei- und Pages-Build, Exit 0 am 9. September um 20:28 UTC.
Deno-Check der Usage-Function ebenfalls grün. Zwei historische Testnähte
wurden berichtigt: positive Freigabefälle lesen nun den unveränderlichen
damals genehmigten Git-Stand; der echte aktuelle Produktstand wird weiterhin
als Drift abgewiesen. Der Radar-Test prüft den getrennten, hart deaktivierten
Radar-Workflow. Kein Provenienzhash, Livekommando oder Providerzaun geändert.
Belege: `/private/tmp/kd-flixpatrol-wave1-test.log` und
`/private/tmp/kd-flixpatrol-wave1-deno.log`. Keine neuen FlixPatrol-/KI-Requests.

### Parallelwelle 2 – E4/E5

Gemeinsame geprüfte Basis: `f981d91688414b2e71bf591a146c8f6e8990a750`.
Die vollständige erste Welle ist lokal und in beiden GitHub-CI-Läufen grün;
ihre Paketlieferungen sind integriert und auf Staging zurückgelesen.

| Paket | Task / Branch / Worktree | Exklusive Write-Flächen |
| --- | --- | --- |
| E4 / M2, M3, M6 | `etappe_04_entdecken`; `codex/flixpatrol-e4-entdecken-20260909`; `/private/tmp/kd-flixpatrol-e4-entdecken-20260909` | supabase/functions/entdecken-daily-task/{index.ts,runner.js,contract.js,responseContract.js,readbackContract.js,publicMixAdapter.js} und neuer flixpatrolMixAdapter.js; _shared/entdeckenFacts.js; src/services/entdeckenDailyFeed.js; src/lib/{webDiscoveryFeed,popularityContracts,entdeckenFacts,entdeckenFreshness,entdeckenUi}.js; src/controllers/useWebDiscoveryFeed.js; src/tabs/EntdeckenTab.jsx; .github/workflows/entdecken-six-day.yml; genau neue 20260909210000_entdecken_flixpatrol_feed.sql; dedizierte entdecken_*_test.mjs außer Provenienz-/Live-Testwerkzeugen; neue docs/FLIXPATROL_ENTDECKEN.md |
| E5 / M6 | `etappe_05_import`; `codex/flixpatrol-e5-import-20260909`; `/private/tmp/kd-flixpatrol-e5-import-20260909` | src/components/StapelImport.jsx; src/lib/stapelimport.js; neue src/{services,lib}/flixpatrolFacts.js; src/services/catalog.js; src/lib/katalog.js; katalog_test.mjs, stapelimport_test.mjs, stapelimport_partial_ui_test.mjs und neue flixpatrol_facts_*_test.mjs; neue docs/FLIXPATROL_IMPORT.md |

Kollisionsprüfung E4×E5: PARALLEL_OK für Dateien, Exports, Datenzustand,
Generatoren, Tests und Dependencies. Beide lesen ausschließlich den
eingefrorenen E2-Cachevertrag und E3-Identitätshelper. E5 nutzt die fünf
Chart-Read-RPCs und ein gebündeltes Titles-Read für höchstens 50 konkrete IDs;
die echte Cache-MediaType ist maßgeblich. E5 benötigt keinen E4-Output.
Gemeinsame Testeinbindung bleibt beim Master, PostgreSQL exklusiv bei E4.

Bestätigte E5-Naht: `StapelImport` war im Ausgangsstand nirgends in der App
eingebunden. E5 erhält deshalb zusätzlich ausschließlich die nötige
Prop-/Schalterverdrahtung in `src/App.jsx`, einen aufklappbaren Einstieg bei der
Eintragserfassung in `src/tabs/MediathekTab.jsx` und einen dedizierten
Mediathek-UI-Test. E4 berührt diese Dateien nicht. Konto-/Kontextwechsel und
Unmount müssen laufende Vorschauen beziehungsweise weitere Importwrites
abbrechen; bestehende Einzelanlage und Auswahl bleiben erhalten.

E4 plant höchstens fünf Chartabfragen und 25 gezielte Titelabfragen pro
Tageslauf, nur für benötigte fehlende/veraltete Cacheeinträge. Zusammen mit
dem Ticker ergibt der reguläre Tagespfad selbst ohne Cachetreffer höchstens
961 Requests in 31 Tagen. Keine Such-/Paginationsloops und kein Quota-Gate.
Chartdatum, Abrufzeit und Verfügbarkeit bleiben getrennt; fehlende Abdeckung
darf weder erfundene Titel noch einen als aktuell bezeichneten August-Pool ergeben.

Eingefroren bleiben alle älteren Migrationen, E2-Client/Cache-RPCs,
E3-Identitätshelper, package.json/Lockfiles, globale Styles, persönliche
Datentöpfe und sämtliche bezahlten Livekommandos/Provenienzhashes. Keine
Baumeister-Außenwirkung, keine weiteren Agenten. Fachlicher Scope-Drift geht
vor einem Edit zum Master; nur die betroffene Fläche wartet. Integration E4 → E5,
danach ein gemeinsamer lokaler Abschlusslauf. E6 startet auf dessen Ergebnis.

E5 ist DELIVERED und nach statischer Abnahme angenommen: `0eedc126` plus
`2e65d55`, 308 fokussierte Checks grün. Die Nachbesserung erhält vorhandene
IDs/Originaltitel, zeigt Ergänzungswerte verständlich und begrenzt den
kontogebundenen Cache zeitlich. Konto-/Projektwechsel, explizites Verwerfen
und React-StrictMode sind geprüft. Im Master integriert als `ad2e23b` + `520cd3b`.
Vor E4/E5 wurde das gelieferte E3-Delta `e83188d15b80112df2810834041f9c485030aee5`
als `56dce92` übernommen: opaque FlixPatrol-IDs bleiben bytegetreu und case-sensitiv.

E4 ist als `29f57dd` plus `c258f77` integriert und angenommen. Die gezielte
Nachbesserung akzeptiert vollständige Charts mit fünf bis zehn Werken, ersetzt
cachebekannte Dubletten aus vorhandenen Rangfolgern und weist ungültige
SQL-Datumsfelder ab. 53 Adapter-, 17 Function- und fünf PG-Delta-Checks grün.

Welle 2 vollständig lokal bestanden auf `c258f7732a0bc08fe2f6c8b8f7567505dccec884`:
`npm run pretest` und anschließend `npm --ignore-scripts test`, jeweils Exit 0,
einschließlich isolierter PostgreSQL-Datenbanken, Einzeldatei- und Pages-Build.
Belege: `/private/tmp/kd-flixpatrol-wave2-pretest.log` und
`/private/tmp/kd-flixpatrol-wave2-test.log`. Die erste Vorlaufunterbrechung war
eine durch E3 ungültig gewordene kurze Test-ID; jetzt prüft dieselbe Assertion
eine gültige case-sensitive ID. Kein Produktguard gelockert.
Die Master-Testnähte bestehen zusätzlich 14 Trigger-, 108 Keychain- und
48 Radar-Vertragschecks. Historische bezahlte Freigaben werden aus ihren
unveränderlichen Git-Bytes geprüft; der neue Produktstand bleibt dort gesperrt.
`package.json` und alle bezahlten Freigabehashes sind unverändert.

### Folgewelle 3 – E6

- Exakte geprüfte Basis: `c258f7732a0bc08fe2f6c8b8f7567505dccec884`.
- Baumeister `etappe_06_ki`, Branch `codex/flixpatrol-e6-ki-20260909`, Worktree
  `/private/tmp/kd-flixpatrol-e6-ki-20260909`; Sol/high für die komplexe
  serverseitige Provider-/Auth-/Privacy-Grenze.
- M6: Cachekontext für Prognose, flüchtige Hinweise zu Profil-Filmerwähnungen
  und Identität geeigneter strukturierter Radar-Ziele. E5-Importnachprüfung
  bleibt der einzige Importresolver; keine zweite Kopie oder zusätzliche KI.
- Exklusive Flächen: ai-task/index.ts und neuer gemeinsamer reiner
  FlixPatrol-Faktenkontext; nötige reine Identity-/Facts-Module mit kompatiblen
  Frontend-Reexports; Prognoseauftrag/-Service und ggf. Promptversion;
  extraktion.js, GeschmackBereich/DreiFragen/ProfilAnsicht; gezielte
  Radar-Handler-/Runner-/Adapter-/Vertragsnähte; eigene Mock-/UI-/Functiontests
  und FLIXPATROL_KI_KONTEXT.md. Kein persönliches Schema oder Speicherformat.
- Alle SQL-Dateien, E2-Client/RPCs, E4-Entdecken, E5-Importservice/-Komponente,
  package/Lockfiles, Styles und bezahlte Gates sind eingefroren. Keine
  Außenwirkung/PG-Starts oder weiteren Agenten. Master besitzt die
  Testeinbindung und gemeinsame Lieferung; größere Deltas gehen an E6 zurück.

E6 ist als `9480c34` plus `4239a29` aus den Baumeister-Commits
`b2a33134c683ae18fed83154cd745167bc612769` und
`5ea014e32d24d78098cef8307914f6572611440c` integriert und angenommen.
Die fokussierten Kontext-/Radar-/UI-Tests sind grün; nach dem angeforderten
Delta besteht der Function-Mocklauf 340/340. Widersprüche zwischen
`film.externeIds` und `filmkennung` stoppen vor Cache-/Kosten-/Providerzugriff.
Strukturierte Radar-IDs erhalten führende IMDb-Nullen; TMDB-IDs bleiben an
Film beziehungsweise Serie gebunden. Herkunft und Aktualität der neutralen
Fakten sind getrennt von Geschmack, Nutzerprofil und Verfügbarkeitsbehauptungen.

Benannte Master-Nähte in `2cb43a9`: TMDB-TV verwendet den gemeinsamen
kanonischen Typ `series`, abgesichert durch positive Aliasfälle und einen
negativen Filmfall. Präzise JSDoc-Optionen und der optionale Setup-Parameter
beseitigen die tatsächlichen Deno-Typfehler; keine fachliche Freigabe erweitert.
Der Deno-Check des Radar-Handlers ist grün.

Das neue Forecast-Requestfeld verlangt die neue Function. Die E6-Frontend-
Lieferung wurde deshalb bis zur passenden Backend-Lieferung zurückgehalten
und am 10. September anschließend veröffentlicht; Belege stehen unten.

### Gemeinsamer lokaler Abschluss

Produktkandidat: `2cb43a9734d4ca7ac952a08754a1a3500cdef4e0`.
`npm test` ist vollständig mit Exit 0 abgeschlossen: Vorprüfung, sämtliche
Mock-Suiten, isolierte PostgreSQL-Verträge, Einzeldatei-Build und Pages-Build.
Belege: `/private/tmp/kd-flixpatrol-final-test.log` und
`/private/tmp/kd-flixpatrol-wave3-deno.log`.
Der abschließende Dokumentationscommit verändert keine Produktbytes und
wird als vollständiger Kandidat zusätzlich durch GitHub-CI geprüft.

Die E6-Staging-Integration wurde lokal bis `c634d7a` vorbereitet und mit dem
abschließenden Dokumentationsstand `019b4ab` am 10. September veröffentlicht.
Sie erhält die eigenständigen Staging-Änderungen einschließlich
der vorhandenen Button-Typografie. 407 Extraktions- und 278 Geschmack-UI-
Checks sind grün. Alle 33 lokalen Quelldateien der vier auszuliefernden
Functions sind zwischen Master und vorbereitetem Staging bytegleich.
`package.json`, sämtliche Lockfiles und bezahlte Live-Provenienzhashes bleiben
unverändert. Die sechs bestehenden Änderungen im Hauptcheckout sind erhalten.
Bis zum lokalen Abschluss entstanden keine neuen echten FlixPatrol- oder
KI-Anbieterrequests. Die spätere Lieferwirkung ist unten getrennt belegt.

## Lieferung und Verbrauch

Der Master übernimmt nach DELIVERED die Commits sequenziell, löst nur kleine
benannte Nähte und vergibt DONE erst mit Kandidatencommit und Abschlussbeleg.
Der ausdrücklich freigegebene tägliche Ticker wird nach Prüfung auf dem
Default-Branch eingerichtet. Keine manuellen Nachholschleifen oder Retries.
Der bestehende FlixPatrol-Key bleibt ausschließlich serverseitig. Alle weiteren
FlixPatrol-Requests müssen denselben persistenten Zähler verwenden und bleiben
im beauftragten 1000er-Monatsrahmen; es wird kein zusätzliches Gate gebaut.

Vor Shared-/Providerwirkungen prüft der Master die konkrete Version, das Ziel
und den bisherigen Ausgang. Die neuen Datenadapter werden erst als geliefert
bezeichnet, wenn Migration/Function/Feed tatsächlich zurückgelesen sind.
Die bestehende Production-Umgebungsfreigabe bleibt eine Nutzerhandlung.
Die getrennten Zustände gebaut / getestet / committed / gepusht / CI-grün /
deployed / natürliche Ausführung / praktische PWA-Abnahme bleiben sichtbar.
Keine neue Aktivierung kostenpflichtiger KI durch diesen Datenauftrag.

Erste Welle veröffentlicht: `main` bei `5dbdf6b`, `staging` bei `2057494`.
Staging wurde mit dem eigenen Task-Diff auf `ce846a3` aufgebaut; die dortigen
UI-Änderungen bleiben erhalten. Die drei Integrationsprüfungen liefern
64 Monitor-, 70 Entdecken- und 108 Keychainchecks. Nach einer gezielten
Linux-Korrektur am temporären PG-Serverstart sind die CI-Tests in
[main](https://github.com/Soppagata/kinodreieck-app/actions/runs/34402755863) und
[staging](https://github.com/Soppagata/kinodreieck-app/actions/runs/34402746417)
grün: vollständige Suiten/Function-Mocks, Chromium und WebKit. Staging-Deploy
und direkte Domain-Metadaten bestätigen `2057494189a480689f61f3f8032cea79757a3732`.
Production wartet weiterhin an der bestehenden Umgebungsfreigabe. Die
Linux-Naht deaktiviert nur den nicht benötigten System-Unix-Socket und lässt
alle PG-Vertragsprüfungen aktiv; keine Migration oder Produktlogik geändert.
Der Ticker ist jetzt bei GitHub als `active` registriert (Workflow 354372774),
erster natürlicher Lauf noch ausstehend. Entdecken und Automatic-AI bleiben
`disabled_manually`; der separate Radar-Workflow hat weiterhin sein hartes
`false` vor dem wirksamen Job.

Zweite Welle veröffentlicht: `main` bei
`f375d95d75c57b9091f97886776445c0773bfb0a`, `staging` bei
`ee4eb7e65127484d2af3468045ad116945b665c5`. Die gezielte Staging-Integration
erhält dessen zusätzliche App-/Mediathek-/Entdecken-Änderungen. 10 Import-UI-,
18 FlixPatrol-Frontend-, 70 Entdecken- und 120 Mediathek-Auswahlchecks grün.
Die vollständigen CI-Suiten einschließlich Chromium und WebKit sind in
[main](https://github.com/Soppagata/kinodreieck-app/actions/runs/34410312170) und
[staging](https://github.com/Soppagata/kinodreieck-app/actions/runs/34410334172)
grün. Staging-Deploy und direkter Domain-Readback am 9. September um 22:11 UTC
bestätigen `ee4eb7e`; Beleg
`/private/tmp/kd-ops-audit-20260909/master-wave2-staging-build.json`.
Production bleibt an der vorhandenen Umgebungsfreigabe. Die sichtbare
Frontend-Lieferung belegt noch keine neuen Cachetabellen oder Feedbefüllung.
Der konkrete gemeinsame Backend-Umfang steht in
[FLIXPATROL_BACKEND_LIEFERUNG.md](FLIXPATROL_BACKEND_LIEFERUNG.md).

Die automatische Freigabeprüfung hat den geplanten Live-RLS-Test mit temporären
Shared-Testwrites abgelehnt: Eine ausdrückliche Freigabe von Ziel/Umfang sei in
den Nutzernachrichten nicht belegt. Dieser Test wurde nicht gestartet. Keine
Umgehung; die lokalen Tests und lesenden Vorbedingungen bleiben gültig. Eine
konkrete gemeinsame Datenbank-/Backend-Lieferung einschließlich nötiger Tests
wird erst am fertigen, überprüfbaren Kandidaten zur Freigabe vorgelegt.

## Freigegebene Backend-Lieferung am 10. September

Max hat das konkrete [Backend-Paket](FLIXPATROL_BACKEND_LIEFERUNG.md)
ausdrücklich freigegeben. Die frühere Ablehnung des realen RLS-Tests ist damit
beantwortet. Ziel bleibt ausschließlich das gemeinsam verwendete Projekt
`bscjgwcntapobyxsiyce`; der spätere private Staging-Control-/Sandbox-Umbau
gehört nicht zu diesem Abschluss. Die Reihenfolge aus dem Task
„Staging/Prod-Stand prüfen“ ist: echte FlixPatrol-Läufe stabilisieren und
aktivieren, danach den akzeptierten Staging-Produktstand mergen, anschließend
die persönliche Control-/Sandbox-Plattform gestalten.

- Die drei Paketmigrationen `20260909120000`, `20260909190000` und
  `20260909210000` sind in einer Transaktion angewendet und zurückgelesen.
  Alle sechs FlixPatrol-Tabellen erzwingen RLS; 74 Migrationen sind verbucht.
- Die vier Functions sind vollständig auf den freigegebenen Kandidaten
  `9bb2133c3361a52ad1f85f5be5dfe6f1eb734947` zurückverglichen: Usage v4,
  Entdecken v65, AI v84 und Radar v62. Die Quellabhängigkeiten wurden nach dem
  Setzen des gemeinsamen Buildmarkers erneut heruntergeladen und verglichen;
  das Setzen des Secrets erhöht auch ohne weitere Codeänderung die
  Function-Versionen. JWT-Einstellungen bleiben erhalten.
- Backend- und GitHub-Staging-Buildmarker zeigen diesen Kandidaten. Der
  authentifizierte Health-Readback ist grün. Der reale bestehende
  Inaktivkonto-RLS-Pfad besteht 14/14 Prüfungen; keine Testkonten aktiviert,
  keine kostenpflichtige KI aufgerufen.
- Staging ist bei `019b4ab25e08e9fa12481894b3522829e1d4aba4` ausgeliefert.
  [CI 34465525047](https://github.com/Soppagata/kinodreieck-app/actions/runs/34465525047)
  besteht Suite, Chromium, WebKit, Deploy sowie atomaren und Domain-Smoke.
  Ein direkter `build-meta.json`-Readback bestätigt dieselbe Kennung.

Der einzelne freigegebene Initiallauf um 10:12 UTC hat zwei öffentliche
Quellen-GETs und genau einen FlixPatrol-Chartrequest ausgeführt. Der erste
Prime-AT-Movies-Chart für den 9. September erhielt HTTP 200, wurde aber vom
Client als `invalid_response` abgelehnt. Es entstanden null Chart-, Titel-
oder Feedwrites. Die Antwortdaten wurden nicht gespeichert; die Ursache
wurde deshalb anschließend mit gezielten payloadfreien Diagnosen belegt
(siehe Reparaturabschluss unten). Der terminale Initiallauf wird nicht
wiederholt und sein Tagesclaim nicht zurückgesetzt. Production-Abnahme
und -Merge bleiben bis zum natürlichen Betriebsnachweis offen.

Der natürliche
[Tickerlauf 34462038347](https://github.com/Soppagata/kinodreieck-app/actions/runs/34462038347)
war um 09:41 UTC erfolgreich. Der lokale Monatszähler weist danach mitsamt
Initiallauf drei Versuche aus: zwei Erfolge, ein `invalid_response`.
Der offizielle Kontostand von 09:41 UTC meldete separat 0 verbraucht / 1000
verfügbar und liegt zeitlich vor dem Chartrequest; beide Zahlen werden nicht
addiert oder als gleichzeitige Messung ausgegeben.
Der natürliche
[Monitorlauf 34463011534](https://github.com/Soppagata/kinodreieck-app/actions/runs/34463011534)
bestätigt sieben Betriebsprüfungen und meldet ausschließlich
`FEED_ERROR_SOURCE_ERROR`. Diese Meldung beschreibt weiterhin einen echten
Fehler. Der erhaltene alte Feed hat Format 6, `refreshedOn=2026-09-06` und
`lastAttemptOn=2026-09-10`; der Abrufversuch macht die Quellen nicht frischer.

E4 liefert die payloadfreie Diagnosekorrektur als
`81bfae9e239ee1359f2b24c4ba5f87cdeb41e01a`; Master integriert sie als `a537af6`,
Staging als `e1f407e`. Die Diagnose unterscheidet JSON-Fehler,
Vertragsabweichungen, Listenlängen, Wrapper-, Relations-, Datums- und
Rangklassen. Fremde Werte, Titel, IDs und Schlüssel werden nicht geloggt.
15 Client- und neun Datenvertragschecks sowie Deno sind grün. Parserregeln,
Matching, Zählervertrag und Retry-Verhalten werden nicht gelockert.
Der zugehörige einzelne serverseitige Top10-Diagnoseabruf ist als E4-Delta
`a7e5fdcb157003d27725d1907723e716fda87608` geliefert und als `85fea89`
integriert. 70 fokussierte Checks und der Deno-Check des echten Usage-Handlers
sind grün. Der bestehende Service-Key-geschützte Usage-Endpunkt akzeptiert
dafür ausschließlich den zusätzlichen POST-Headerwert
`manual-top10-contract-v1`. Er ruft genau Prime/AT/Movies für den vorigen
UTC-Tag auf, verwendet den bestehenden Nutzungszähler und lässt Feed,
Daten-Caches und Tagesclaim unberührt. Die Diagnose findet auch den ersten
späteren ungültigen Listeneintrag; der bestehende Parser entscheidet weiter
unverändert. Der Master rechnet diesen Einzelabruf auf den bereits
freigegebenen 30-Request-Umfang an; er wiederholt nicht den Initial-Feedlauf.

Belege liegen unter `/private/tmp/kd-ops-audit-20260909` in
`flixpatrol-final-integration-receipt.json`, den vier
`flixpatrol-package-source-*.json`, `flixpatrol-approved-health.json`,
`flixpatrol-approved-initial.json`, `flixpatrol-initial-failure-readback.json`
und `flixpatrol-approved-staging-build.json`. RLS-Log:
`/private/tmp/kd-flixpatrol-approved-rls-confirmed-20260910.log`.

## Bestätigte Parserreparatur und Tagesaktivierung

Zwei einzelne gezählte Diagnosen belegen die tatsächliche API-Form: die
Top10-Antwort ist eine `list`-Hülle mit zehn typisierten `top10s`-Records;
ein Neueinsteiger an Rang 7 hat `rankingLast: 0`. Alle erwarteten Company-,
Österreich-, Charttyp-, Tages-, Titel-ID- und Aktualisierungszeitprüfungen
sind dabei erfüllt. Es werden ausschließlich Strukturklassen und boolesche
Prüfergebnisse gespeichert, keine Anbieterpayloads oder Titelkopien.

E4 liefert die eng begrenzte Korrektur als `84bc913`: zusätzliche typisierte
`list`-Hülle und Abbildung des belegten Nullplatz-Sentinels auf `null`.
Andere Container, untypisierte oder gemischte Records, negative Vorplätze
und alle bisherigen Identitäts-/Datumsabweichungen bleiben ungültig.
Master integriert den Code als
`10fc6eecbc709244d9503bf286d3a8955f8aeb18`, Staging als
`c344b02261fe943acba4fba7a54ffb946a279600`. 34 fokussierte Checks, beide
Deno-Checks und das einmalige abschließende `npm test` sind grün.
Gesamtgate-Log: `/private/tmp/kd-flixpatrol-contract-repair-final-test.log`.

Die einmalige reale Vertragsprüfung um 11:28 UTC bestätigt HTTP 200,
`valid-contract` und zehn akzeptierte Einträge. Genau ein Request wurde
vorher/nachher gezählt; Feed, Titel-/Chartcache und Tagesclaim bleiben
unverändert. Beleg: `flixpatrol-top10-repaired-once.json`. Mitsamt Initiallauf
und beiden Diagnosen sind damit vier der freigegebenen 30 Datenrequests
verwendet. Der gemeinsame Septemberzähler steht auf sechs Versuchen:
drei Erfolge, drei `invalid_response`; null offene Versuche und null
kostenpflichtige KI-Requests. Der offizielle Quotasnapshot von 09:41 UTC
ist älter als diese Datenabrufe und wird nicht als neuer Saldo ausgegeben.

Alle vier Functions sind aus `10fc6ee` ausgeliefert und nach dem Setzen der
Buildmarker erneut vollständig heruntergeladen und byteverglichen:
Usage v8 / JWT false, Entdecken v67 / false, AI v86 / true, Radar v64 / false.
Backend- und Staging-Erwartungsmarker zeigen denselben Commit; der
authentifizierte Health-Readback um 11:31 UTC bestätigt ihn mit HTTP 200.
Keine neue Migration, keine erneute Berechtigungsprüfung und kein persönlicher
Datenwrite waren für diese Parserkorrektur nötig.

Der natürliche Entdecken-Workflow `345914419` wurde am 10. September um
11:31 UTC im bereits freigegebenen Umfang aktiviert und als `active`
zurückgelesen. Die Aktivierung stützt sich auf den bestätigten reparierten
API-Vertrag; der Initialbeleg bleibt ausdrücklich `failed_confirmed`.
Es gab keinen manuellen Workflowstart und keine Tagesclaim-Rücksetzung.
Der nächste natürliche Termin ist der 11. September um 02:00 UTC
(04:00 Uhr Wien); tatsächliche GitHub-Startzeiten können später liegen.
Automatic-AI bleibt deaktiviert, das kostenpflichtige Radar hart ausgeschaltet.

Die erforderlichen Prüfungen der
[Main-CI 34471599041](https://github.com/Soppagata/kinodreieck-app/actions/runs/34471599041)
sind grün; Production wartet weiter am bestehenden geschützten
Freigabeschritt. Der
[Staging-Lauf 34471737786](https://github.com/Soppagata/kinodreieck-app/actions/runs/34471737786)
ist einschließlich Suite, Chromium, WebKit und Deployment grün. Der atomare
Stand `https://022fa766.kinodreieck.pages.dev` und die Staging-Domain bestehen
Build-/Serviceworker-/Login-/Header-Smoke samt abgewiesenem anonymem
Katalogzugriff. Der zusätzliche direkte `build-meta.json`-Readback bestätigt
`c344b02261fe943acba4fba7a54ffb946a279600` und `appEnvironment=staging`.
Die Abschlussdokumentation liegt auf dem Master-Koordinationsbranch; der
ausgelieferte Produkt-/Functioncode bleibt der oben geprüfte Commit.

**Noch offen:** der erste erfolgreiche natürliche 50-Titel-Feed mit fünf
Quellen samt gespeichertem Readback und anschließend grünem Private Ops
Monitor. Der alte Feed ist durch die Vertragsprüfung nicht aktualisiert.
Die Task-Nachprüfung `flixpatrol-erstbetrieb-pr-fen` prüft alle drei Stunden
rein lesend und bleibt ohne neue handlungsrelevante Evidenz still. Sie startet
keine Providerprobe, keinen manuellen Feedlauf und keine kostenpflichtige KI.
Nach erfolgreichem Betriebsnachweis folgen der bereits bedingt freigegebene
Staging-Merge und getrennt davon die persönliche Control-/Sandbox-Plattform.

Zusätzliche Belege im bestehenden Auditordner:
`flixpatrol-top10-diagnostic-once.json`,
`flixpatrol-top10-inner-shape-once.json`,
`flixpatrol-top10-repaired-once.json`, `flixpatrol-repaired-markers.json`,
`flixpatrol-repaired-health.json`, `flixpatrol-repaired-schedule.json`.
Der Staging-Readback liegt in `flixpatrol-repaired-staging-build.json`.
Historische Function-Nachweise bleiben in `backend-delivery-9bb2133`,
`diagnostic-delivery-04bbda1` und `diagnostic-delivery-8787455` erhalten.

## Heutiger vollständiger Test auf Max' ausdrücklichen Wunsch

Max lässt am 10. September den morgigen Zeitplan bestehen und beauftragt
ausdrücklich den vollständigen Datenlauf jetzt. Die unmittelbare Abnahme
erfolgt deshalb anhand dieses manuellen Datenlaufs mit gespeichertem Feed
und anschließendem Betriebsmonitor. Die natürliche Ausführung morgen bleibt
als ergänzende Betriebsbeobachtung bestehen; keine zusätzliche KI-Liveprüfung
wird nachträglich zur Merge-Bedingung.

Der vorhandene authentifizierte Owner-Pfad wird genutzt. Seine temporäre
Freigabe wurde nur für den Aufruf gesetzt und danach nachweislich wieder
geschlossen. Kein Kalenderclaim wurde gelöscht, kein Scheduler verändert.
Der Lauf von 12:16 UTC lieferte fünf erfolgreiche Charts, scheiterte aber
am ersten Titel-Detailparser: fünf Chart- und ein Titelrequest, null Feedwrites,
null kostenpflichtige KI. Der gemeinsame Monatszähler steht auf zwölf
terminalen Versuchen (acht Erfolge, vier Fehler). Fünf Charts mit je zehn
Referenzen sind dauerhaft gespeichert; 49 Titel sind `unresolved`, genau
der fehlgeschlagene Titel `incomplete_blocked`.

E4 erhält das eng begrenzte Diagnose-/Korrekturdelta für den Titelvertrag.
Die fehlgeschlagene Referenz ist durch den bestehenden technischen Fehlerbeleg
gebunden. Erfolgreiche Chart-Checkpoints werden beim Fortsetzen wiederverwendet.
Erst nach belegter Parserkorrektur darf die einzelne dadurch überholte negative
Titelmarkierung zur Neuvalidierung ablaufen; kein globales Cacheleeren.

Belege: `flixpatrol-owner-now-once.json`,
`flixpatrol-owner-now-partial-cache.json` und
`flixpatrol-owner-now-title-diagnostic-logs.json` im bestehenden Auditordner.
Die letzte Datei enthält ausschließlich bereits vorhandene Strukturdiagnosen
aus Function-Logs, keine zusätzliche Anbieterabfrage und keine Rohpayloads.

Das Diagnose-Delta `c46a87e` ist als `0e1ef47` integriert und in der
Usage-Function v9 bytegleich ausgeliefert. Der genau einmal ausgeführte
servicegeschützte Titelabruf um 12:45 UTC belegt `length=0` als einzige
abweichende Vertragsklasse. Alle übrigen Datums-, Zahlen-, Text-, Relations-,
URL- und Zeitstempelprüfungen sind gültig; Quell-ID und Medientyp stimmen mit
der angefragten Referenz überein. E4 korrigiert deshalb gezielt die Laufzeit
von Provider-Nullwert `0` zu internem `null`; andere Verträge bleiben streng.
Der Monatszähler steht danach bei 13 abgeschlossenen Versuchen (acht Erfolge,
fünf Fehler). Feed und Cache blieben bei der Diagnose unverändert.
Beleg: `flixpatrol-title-contract-once.json` im bestehenden Auditordner.

Die vorhandene Nachprüfungsautomation wurde an Max' aktuelle Abnahme angepasst:
Der vollständige manuelle Test heute mit anschließendem grünem Monitor zählt;
die natürliche Ausführung morgen bleibt eine zusätzliche Betriebsbeobachtung.

## Historischer Ausgang am 9. September

Ticker: Migration `20260909153000`, Function v2, Quellcodebytegleichheit,
ein echter Quota-GET / ein Erfolg / null Fehler. Anbieter separat 0 verbraucht,
1000 verfügbar (9. September, 18:34 UTC). Lokale vollständige Suite samt Build,
Deno-Check und 56 Tickerchecks grün. Der alte Live-RLS-Gesamttest meldete
58 bestandene Checks / 15 Fehler; Testdaten wurden aufgeräumt. Kein neuer
Providerrequest für die Planerstellung. Hauptcheckout mit Nutzeränderungen
bleibt unberührt.

Öffentliche Quellenprobe des Masters um 19:36 UTC: Der bestehende Adapter
liest mit genau zwei unangemeldeten GETs 15 ÖFI- und 10 Netflix-Titel.
ÖFI liefert den Chartstand 30. August, der maschinenlesbare Netflix-Datensatz
bereits 6. September (die sichtbare Netflix-Webseite zeigte noch 30. August).
E4 muss Quellenstand und Abrufzeit getrennt erhalten. Keine Writes und kein
FlixPatrol-Request. Beleg: `/private/tmp/kd-ops-audit-20260909/master-public-source-spike.json`.

## Herkunft der integrierten Vorarbeiten

- Betriebs-/Entdecken-Vorreparatur: `codex/ops-monitor-definition-20260909`
  bei `713436b`; Betriebschecks, verspäteter Tagesclaim und Trennung der Jobs.
- Ticker und vollständige Inventur: `codex/flixpatrol-background-20260909`
  bei `3ce4d7d`; echte Quota-Probe und Function-Bytevergleich dokumentiert in
  [FLIXPATROL_TICKER.md](FLIXPATROL_TICKER.md).
- Gemeinsame Integration dieser gelieferten Vorarbeiten: `d6554cf`.
  Die frühere native Blockade des täglichen Workflows ist durch Max' jüngste
  ausdrückliche Zustimmung beantwortet. Frühere Liefer- und Sperrstände
  bleiben in der Git-Historie und gelten nicht als aktueller Plan.
