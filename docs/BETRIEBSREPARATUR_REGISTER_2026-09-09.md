# FlixPatrol und Betriebsreparatur – Masterplan

Stand: 9. September 2026. Master ist dieser Task. Max hat die tägliche
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
| M1 | Betriebschecks prüfen die richtige Umgebung; Fehlermeldungen nennen die echte Ursache und verschleiern keinen Ausfall. | Vorreparatur integriert; E1 |
| M2 | Entdecken aktualisiert alle fünf Quellen im vereinbarten 50er-Mix und zeigt echte Quellenstände. | OFFEN; E2 → E4 |
| M3 | Verspätete natürliche Tagesläufe erledigen fällige Arbeit ohne doppelte Tagesversuche. | Vorreparatur integriert; E4 |
| M4 | Entdecken und kostenpflichtiges Radar sind getrennt betreibbar; keine versteckte neue KI-Aktivierung. | Vorreparatur integriert; E1 |
| M5 | Der gemeinsame Kandidat ist geprüft, geliefert und anhand echter Läufe sowie Datenständen belegt. | OFFEN; Master nach den Wellen |
| M6 | FlixPatrol-Fakten werden einmal gepflegt, sicher zugeordnet und in den ausgewählten Nutzer-/KI-Funktionen ohne Überschreiben persönlicher Daten wiederverwendet. | Inventur GEPRÜFT; Umsetzung E2, E3, E5, E6 |
| M7 | FlixPatrol-Abrufe werden im Hintergrund dauerhaft gezählt und täglich mit dem offiziellen Kontostand abgeglichen. | Server gebaut/live geprüft; tägliche Aktivierung jetzt freigegeben; E1 |

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
| E1 / M1, M4, M7 | `etappe_01_betrieb`; `codex/flixpatrol-e1-betrieb-20260909`; `/private/tmp/kd-flixpatrol-e1-betrieb-20260909` | Die sechs Betriebsworkflows private-ops-monitor, keepalive, automatic-ai-check, radar-six-day, entdecken-six-day, flixpatrol-usage; tools/private-ops-check.mjs und dessen Tests; tools/rls_test_personal.mjs und dedizierte RLS-Vorbereitungstests; automatic_ai_check_test.mjs, cleanup_b3_test.mjs, entdecken_weekly_trigger_test.mjs, neuer flixpatrol_usage_workflow_test.mjs; docs/BETRIEBSLAEUFE*.md | INTEGRATED als `d7bc9eb` + `66d7ee1`; 114 Paketchecks und 15 Delta-Checks grün; gemeinsamer Abschlusslauf offen |
| E2 / M2, M6 | `etappe_02_daten`; `codex/flixpatrol-e2-daten-20260909`; `/private/tmp/kd-flixpatrol-e2-daten-20260909` | supabase/functions/_shared/flixpatrol*.js; genau neue Migration 20260909190000_flixpatrol_data_cache.sql; flixpatrol_client_test.mjs, flixpatrol_usage_contract_test.mjs und neue flixpatrol_data_*_test.mjs; docs/FLIXPATROL_DATENVERTRAG.md | INTEGRATED als `c99447e` + `c9a8c54`; 58 JS- und 10 PG-Checks grün, einschließlich paralleler Titelwrites |
| E3 / M6 | `etappe_03_identitaet`; `codex/flixpatrol-e3-identitaet-20260909`; `/private/tmp/kd-flixpatrol-e3-identitaet-20260909` | src/lib/katalog.js; neuer src/lib/externalTitleIdentity.js; katalog_test.mjs und neuer external_title_identity_test.mjs; docs/FLIXPATROL_IDENTITAET.md | INTEGRATED als `9eacb18` + `f27252b`; 12 Helper-Tests und 104 Katalogchecks grün; gemeinsamer Abschlusslauf offen |

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

### Vorbereitete Folgewelle E4/E5

Nach E2/E3-Integration und dem gemeinsamen Abschlusslauf wird der konkrete
Basiscommit hier eingetragen. E4 erhält den Entdecken-Function-/Feedpfad,
seine Frontend-Leseverträge und genau eine additive Format-Migration. E5
erhält Importvorschau, die neutrale Frontend-Faktenprojektion und deren
Katalogverbraucher. Beide lesen den dann eingefrorenen E2-Cachevertrag und
E3-Identitätshelper; E5 hängt nicht von einem bereits befüllten Livefeed ab.
Gemeinsame Testeinbindung bleibt beim Master, PostgreSQL exklusiv bei E4.
Die endgültige Dateiliste wird vor Dispatch auf Überlappungen geprüft.

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

## Aktuell belegter Ausgang

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
