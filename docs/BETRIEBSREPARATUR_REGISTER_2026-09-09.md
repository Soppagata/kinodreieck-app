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
