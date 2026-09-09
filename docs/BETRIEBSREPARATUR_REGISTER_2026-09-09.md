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
| E1 / M1, M4, M7 | `etappe_01_betrieb`; `codex/flixpatrol-e1-betrieb-20260909`; `/private/tmp/kd-flixpatrol-e1-betrieb-20260909` | Die sechs Betriebsworkflows private-ops-monitor, keepalive, automatic-ai-check, radar-six-day, entdecken-six-day, flixpatrol-usage; tools/private-ops-check.mjs und dessen Tests; tools/rls_test_personal.mjs und dedizierte RLS-Vorbereitungstests; automatic_ai_check_test.mjs, cleanup_b3_test.mjs, entdecken_weekly_trigger_test.mjs, neuer flixpatrol_usage_workflow_test.mjs; docs/BETRIEBSLAEUFE*.md | RESTAUFTRAG nach `97d0c71`: Rechtefehler und RLS-Vorbedingungen präzisieren |
| E2 / M2, M6 | `etappe_02_daten`; `codex/flixpatrol-e2-daten-20260909`; `/private/tmp/kd-flixpatrol-e2-daten-20260909` | supabase/functions/_shared/flixpatrol*.js; genau neue Migration 20260909190000_flixpatrol_data_cache.sql; flixpatrol_client_test.mjs, flixpatrol_usage_contract_test.mjs und neue flixpatrol_data_*_test.mjs; docs/FLIXPATROL_DATENVERTRAG.md | RUNNING; Titles-Suchvertrag ausdrücklich zu belegen |
| E3 / M6 | `etappe_03_identitaet`; `codex/flixpatrol-e3-identitaet-20260909`; `/private/tmp/kd-flixpatrol-e3-identitaet-20260909` | src/lib/katalog.js; neuer src/lib/externalTitleIdentity.js; katalog_test.mjs und neuer external_title_identity_test.mjs; docs/FLIXPATROL_IDENTITAET.md | DELIVERED `bcb4c63` + `e4e11fe`; 12 Helper-Tests und 104 Katalogchecks grün; Integration nach E1/E2 |

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

## Historischer Lieferstand vor dem Masterauftrag

Die folgenden Notizen sind Herkunft, keine aktive zweite Planung.

# Betriebsreparatur – gemeinsames Register

Auftrag: Die bestehenden Laeufe reparieren und bis zum eigenstaendigen,
nachweisbar funktionierenden Betrieb verfolgen. Entdecken behaelt alle fuenf
Quellen und den bisherigen 50-Titel-Umfang. Moviepilot und andere zusaetzliche
Erkennungsquellen folgen danach; die TMDB-Mail blockiert diese Reparatur nicht.

Gemeinsame Basis: `c71a0c1818377bab21d8eabd04f1d522d5dc0bde`.
Reparaturstand: `codex/ops-monitor-definition-20260909` bei `713436b`.
Aktuelle Ticker-Lieferung: `codex/flixpatrol-background-20260909` ab dem
unveraenderten Remote-main `20291726315e0069a721aac74569bcddec4db687`,
`/private/tmp/kd-ops-monitor-definition-20260909`.
Max' neueste Steuerung verlangt zuerst die API-Inventur und den funktionierenden
Hintergrundticker. Deshalb wird jetzt nur dieser additive Baustein geliefert;
der bestehende Reparaturstand bleibt fuer den anschliessenden Entdecken-Adapter
erhalten. Keine Uebernahme fremder Staging-UI-Arbeit.

| ID | Nutzerergebnis | Zustand | Paket |
| --- | --- | --- | --- |
| M1 | Betriebscheck prueft die richtige Umgebung und meldet verstaendliche reale Fehler | LOKAL GEBAUT UND FOKUSSIERT GETESTET; INTEGRIERT; REMOTE OFFEN | A |
| M2 | Entdecken aktualisiert den vereinbarten Fuenf-Quellen-Mix und zeigt Abruf- und Quellenstand ehrlich | OFFEN | B |
| M3 | Verspaetete Zeitplanlaeufe erledigen faellige Arbeit ohne doppelte Tagesversuche | OFFEN | B |
| M4 | Entdecken und kostenpflichtiges Radar lassen sich unabhaengig betreiben | OFFEN | A+B |
| M5 | Reparatur ist ausgeliefert, automatische Laeufe und Daten-Readback sind belegt | OFFEN | Meister |
| M6 | Alle sinnvollen FlixPatrol-Einsatzstellen einschliesslich KI sind mit Datenbedarf und Ueberschreibschutz beschrieben | GEPRUEFT: 17 Produkt-/Betriebsfindings und 11 KI-Findings in `FLIXPATROL_FINDINGS_2026-09-09.md` | Meister+B2 |
| M7 | FlixPatrol-Abrufe werden im Hintergrund persistent gezaehlt und mit dem 1000er-Kontingent abgeglichen; keine Frontendanzeige, kein neues Gate | GEBAUT, GETESTET, COMMITTET, SERVER DEPLOYED UND EINE ECHTE PROBE GRUEN; taeglicher Workflow durch automatische Freigabepruefung blockiert | A2 |

## Parallelwelle

| Paket | Eigener Branch und Worktree | Exklusive Schreibflaeche | Zustand |
| --- | --- | --- | --- |
| A – Betriebschecks | `codex/ops-runs-repair-20260909`, `/private/tmp/kd-ops-runs-repair-20260909` | Monitor, Keep-alive, Automatic-AI- und neue Radar-Workflowdatei; `tools/private-ops-check.mjs`, zugehoerige Tests inkl. `cleanup_b3_test.mjs`; `docs/BETRIEBSLAEUFE_OPS_2026-09-09.md` | INTEGRIERT: `c5b855c` nach `666f74e`; Monitor 64/64, Cleanup 6/6, Automatic-AI 17/17, Betrieb 22/22 |
| B – Entdecken | `codex/entdecken-runtime-repair-20260909`, `/private/tmp/kd-entdecken-runtime-repair-20260909` | `entdecken-six-day.yml`; Entdecken-Function, Client, Migration und zugehoerige Tests | ERSTER BAUSTEIN INTEGRIERT: `9e0b3be` nach `f086ef5`; Trigger 14/14, Claim PG17 PASS, Marktmix 17/17, Client 70/70, Server 34/34 |
| A2 – Hintergrundticker | bestehender A-Worktree, neuer codex-Zweig ab `f086ef5` | neue flixpatrol-usage Function, gemeinsamer flixpatrolClient, neue Zaehler-Migration, Configblock, flixpatrol-Tests/CLI/Doku/Quota-Workflow | INTEGRIERT in aktuelle Ticker-Lieferung, durch Meister korrigiert und gezielt deployed; aktive Workflowdatei fehlt wegen nativer Freigabesperre |
| B2 – KI-Inventur | bestehender B-Worktree / aktuelle Git-Refs | nur Lesen, Bericht als Nachricht | DELIVERED; Bericht in gemeinsame Findings integriert; keine externen Aufrufe oder Dateien geaendert |

A und B sind parallel: keine gemeinsamen Produktdateien, Schemata oder
Testdateien. `cleanup_b3_test.mjs` gehoert A, alle `entdecken_*`-Tests B.
Dependencies/Lockfiles bleiben unveraendert. Der Meister liest im Paketbau
Produktdateien nur und integriert zuerst A, dann B.

Gemeinsame feste Naht: Neuer Radar-Workflow `.github/workflows/radar-six-day.yml`
mit bestehendem Radarjob; der Meister entfernt nach Integration des Ersatzes
den alten Radarjob aus `entdecken-six-day.yml`. Die festen Anzeigenamen sind
`Radar – faellige Ziele pruefen` (mit Umlauten im Workflow) und
`Entdecken – taeglicher Quellenabgleich` (mit Umlauten im Workflow).
Neue kostenpflichtige Zeitplanpfade bleiben ohne ausdrueckliche Kostenfreigabe
wirksam aus. Auto-Review blockierte die isolierte Entfernung des alten Jobs
ohne sichtbaren Ersatz sowie den neuen Radarjob mit Repository-Opt-in allein.
Paket A liefert deshalb den neuen Radarjob mit hartem `if: false`; es gibt
keinen Versuch, diese Ablehnung mit gleichwertigem Code zu umgehen.

## Tragende Quellenfrage

Die drei bisherigen FlixPatrol-Weblisten sowie robots/Terms antworteten im
einmaligen begrenzten Direktabruf am 9. September jeweils HTTP 403; kein
Retry. Offizielle API ist verfuegbar, benoetigt aber einen bezahlten Zugang.
Max hat am 9. September ein FlixPatrol-Konto mit API eingerichtet und den
offiziellen API-Weg gewaehlt. Anleitung: im Supabase-Projekt
`bscjgwcntapobyxsiyce` unter Edge Functions / Secrets genau
`FLIXPATROL_API_KEY` speichern. Der Wert gehoert nicht in Chat oder Git.
Max bestaetigte anschliessend die Ablage und 1000 Requests pro Monat. Der
Secret-Name wurde danach live als vorhanden bestaetigt; kein Wert ausgegeben.
Neue ausdrueckliche Steuerung: erst alle API-Einsatzstellen erforschen, auch
KI; keine breite Produktueberarbeitung vor der Findings-Liste. Nur der
Hintergrundticker wird jetzt zusaetzlich gebaut. Max verlangt KEIN eigenes
Freigabe-/Budgetgate fuer FlixPatrol, wohl aber laufendes Mitzaehlen.
Der Providerstand und eigene protokollierte Requests werden getrennt gehalten
und niemals addiert. Die erste erfolgreiche Tickerprobe am 9. September um
18:34 UTC zaehlt genau einen eigenen Request / einen Erfolg / null Fehler;
der Provider meldet separat null verbraucht und 1000 verfuegbar.
Der Quellenmix wird nicht still auf 25 Titel reduziert. Die API wird zuerst
fuer Prime Video, Disney+ und Apple TV+ im vorhandenen Entdecken-Pfad genutzt;
Filmerkennung ist ein spaeterer Schritt. IMDb-/TMDB-IDs sind dokumentierte,
aber nullable Metadaten; Vollstaendigkeit ist noch nicht live belegt.

## Liefergrenzen

Lokaler Bau/Tests/Commit laufen durch. Max hat den FlixPatrol-Hintergrundticker
einschliesslich laufender Zaehlung bei 1000 Requests/Monat ausdruecklich
beauftragt und kein zusaetzliches Gate gewuenscht. Dazu gehoeren eine schmale
getestete Zaehler-Migration, die serverseitige Function und ihr Quota-Abgleich.
Diese Freigabe umfasst keine neuen KI-Kosten oder breite Produktumbauten.
Keine manuell gestarteten bezahlten Smoke-/Eval-Pfade ausserhalb AGENTS.md.
Geschuetzte Production-Freigaben bleiben Nutzerhandlungen.

## Plattformblockade beim taeglichen Ticker

Die automatische Freigabepruefung hat das Anlegen des taeglich aktiven
GitHub-Workflows mit Server-Schluessel und indirektem FlixPatrol-Quota-GET
abgelehnt. Sie verlangt eine ausdrueckliche Freigabe dieser Credential-Nutzung
und der taeglichen Ein-Request-Wirkung. Der abgelehnte Workflow wird weder
identisch wiederholt noch ueber einen anderen Scheduler umgangen. Lokaler
Zaehlerbau, Tests und der Findingsbericht laufen weiter. Dies ist keine neue
Budgetbedingung im Produkt.

## Ticker-Lieferbeleg

Codecommit `058eb08`; die zwei Tabellen und vier RPCs aus Migration
`20260909153000` sind remote vorhanden und zugriffsgeschuetzt. Function
`flixpatrol-usage` Version 2 ist aktiv und in allen drei Dateien bytegleich
zurueckgelesen. Vorhandene sechs Functions unveraendert. Vollstaendiges
`npm test` samt Build, Deno-Typcheck und 56 Tickerchecks gruen;
bestehende KI-Function-Mocks 334/334 gruen. Kein Push/CI-Lauf fuer diesen
Branch und noch keine taegliche Ausfuehrung.

Der zusaetzlich vorgeschriebene Live-RLS-Gesamttest hat 58 bestandene Checks
und 15 Fehler bei inaktivem Testkonto B und anonymen 401-Antworten. Cleanup
erfolgreich; Testkonten unveraendert. Die neuen Tickerrechte sind separat
remote geprueft. Dieser Befund bleibt fuer die Betriebsreparatur offen.
Die Einzelheiten und der konkrete taegliche Workflowentwurf stehen in
`FLIXPATROL_TICKER.md`.
