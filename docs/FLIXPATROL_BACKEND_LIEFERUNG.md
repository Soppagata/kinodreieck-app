# Konkretes Backend-Paket für FlixPatrol

Das Paket gehört zum Masterplan
[BETRIEBSREPARATUR_REGISTER_2026-09-09.md](BETRIEBSREPARATUR_REGISTER_2026-09-09.md).
Der finale Kandidatencommit und sein Prüfbeleg stehen dort. Dieses Dokument
beschreibt den ausdrücklich freigegebenen Umfang der gemeinsamen
Backend-Lieferung. Migrationen, Functions, Buildmarker und Berechtigungsprüfung
sind am 10. September geliefert und bestätigt. Der einzelne Initiallauf
scheiterte am ersten FlixPatrol-Antwortparser; Tagesaktivierung und erfolgreicher
neuer Feed stehen noch aus. Die konkreten Belege stehen im Register.

## Ziel und Datenumfang

Ziel ist ausschließlich Supabase-Projekt `bscjgwcntapobyxsiyce`. Staging und
Production verwenden dieses Projekt gemeinsam; die folgenden Änderungen
gelten daher für beide. Persönliche Medienlisten, Bewertungen, Notizen,
Sehstände, Profile und Kontoaktivierungen sind nicht Gegenstand des Pakets.

Die drei neuen Migrationen werden nach Abgleich der tatsächlichen
Migrationshistorie gemeinsam in einer Transaktion angewendet:

| Migration | Wirkung |
| --- | --- |
| `20260909120000_entdecken_delayed_daily_claim.sql` | Verspätete natürliche Tagesläufe dürfen den noch nicht verbrauchten Wiener Tag beanspruchen. |
| `20260909190000_flixpatrol_data_cache.sql` | Vier gemeinsame Tabellen für Vokabular, Titel, Charts und technische Fehler; begrenzte Lese-RPCs, service-role-exklusive Schreib-RPCs; Erweiterung des bestehenden Requestzählers. |
| `20260909210000_entdecken_flixpatrol_feed.sql` | Validierung, Speicherung und Readback des vollständigen 50-Titel-Feeds; bestehender gespeicherter Feed bleibt bis zum erfolgreichen neuen Lauf erhalten. |

Die neuen Tabellen erzwingen RLS. Der Browser erhält keine Tabellen-Schreibrechte
und keinen Anbieter-Key. Das Vokabular wird aus den dokumentierten festen IDs
gesät; Titel und Charts entstehen erst durch einen gezählten Datenlauf.

## Functions und Nachweis

Gezielt ausgeliefert werden nur `flixpatrol-usage`, `entdecken-daily-task`,
`ai-task` und `radar-websearch-task` aus dem integrierten Kandidaten. Die
bestehenden JWT-Einstellungen bleiben erhalten. Download und Bytevergleich
der vollständigen lokalen Quellabhängigkeiten belegen den Code; ACTIVE und
Versionsnummer allein reichen nicht.

Nach erfolgreichem Codevergleich werden `KD_FUNCTION_BUILD_VERSION` im
gemeinsamen Backend und `STAGING_EXPECTED_FUNCTION_BUILD` im bestehenden
GitHub-Staging-Environment auf den bestätigten Kandidaten gesetzt. Ein
authentifizierter Health-Readback prüft den Marker ohne KI-Anbieteraufruf.

Die reale Berechtigungsprüfung verwendet ausschließlich die vorhandenen
Testkonten A/B. Der vorhandene
`KD_RLS_ACCESS_MODE=inactive npm run test:rls`-Pfad prüft zuerst A als aktiv
und B als inaktiv. Anschließend versucht B seine eigene Freigabe zu erhöhen
und markierte Testdaten in den vorhandenen Personal-/Serien-/Shared-Pfaden
zu schreiben. Alle diese Versuche müssen abgewiesen werden. Bei korrekten
Berechtigungen entsteht kein Write. Ein unerwartet erfolgreicher Versuch
erfordert Stop, Readback und gezieltes Bereinigen der Testwirkung; keinen
blinden Wiederholungslauf. Eine reguläre Kontoaktivierung gehört nicht dazu.

Erst nach bestätigter Backend-Kompatibilität wird der bereits integrierte
E6-Frontend-Stand auf Staging veröffentlicht. Sein neues optionales
Forecast-ID-Feld wird vom bisherigen Backend noch nicht akzeptiert.

## Erster Datenlauf und natürlicher Betrieb

Nach der Backend-Lieferung kann genau ein ausdrücklich freigegebener
Initiallauf den sichtbaren Feed befüllen: höchstens fünf FlixPatrol-Charts und
25 FlixPatrol-Titel, zwei öffentliche Quellen-GETs, null kostenpflichtige
KI-Anfragen. Jeder FlixPatrol-Versuch zählt im vorhandenen Monatszähler. Kein
Retry und kein Folgeversuch bei unklarem Ergebnis. Dieser Initiallauf wäre
eine ausdrückliche Ausnahme vom bisherigen Verzicht auf manuelle Nachholruns.

Danach wird der vorbereitete Entdecken-Workflow für seinen natürlichen
02:00-UTC-Tageslauf aktiviert. Ohne Freigabe des Initiallaufs beginnt die
Befüllung erst mit dem nächsten natürlichen Termin. Der FlixPatrol-Ticker
läuft um 05:11 UTC, der Private Ops Monitor um 05:23 UTC. Automatic-AI und
bezahltes Radar werden durch dieses Paket nicht aktiviert.

Der reguläre Datenlauf samt Ticker benötigt höchstens 961 FlixPatrol-Requests
in 31 Tagen; frische Titel- und Chartcaches senken den tatsächlichen Verbrauch.
Einmalproben zählen zusätzlich. Das 1000er-Kontingent erhält kein neues Gate
und keine Frontendanzeige.

## Abbruch und bestätigter Lieferstand

Vor jeder Wirkung werden Kandidat, Ziel und der letzte bekannte Ausgang
geprüft. Bei unklarem Ausgang folgt ausschließlich Readback, kein blinder
Retry. Eine fehlgeschlagene SQL-Transaktion übernimmt keine Teilmigration.
Bei einem späteren Function- oder Datenfehler bleiben die bereits belegten
Zustände getrennt dokumentiert; der letzte gültige Feed wird nicht als neu
aktualisiert ausgegeben.

Die frühere automatische Ablehnung des realen RLS-Tests ist durch Max'
ausdrückliche Paketfreigabe beantwortet. Der reale Inaktivkonto-Test hat
14/14 Prüfungen bestanden; Staging wurde nach bestätigter Backend-Kompatibilität
erfolgreich veröffentlicht.

Der Initiallauf verbrauchte genau einen FlixPatrol-Chartrequest und zwei
öffentliche GETs. HTTP 200 mit anschließendem `invalid_response` belegt eine
abgelehnte Anbieterantwort, noch keine bestimmte Fehlerursache. Null Chart-,
Titel- und Feedwrites sind zurückgelesen. Der bestehende Feed bleibt erhalten;
der Tagesclaim und der terminale Laufbeleg werden nicht für einen blinden
Nachholversuch zurückgesetzt. Der vorbereitete Tagesworkflow bleibt bis zur
Klärung deaktiviert. Automatic-AI und kostenpflichtiges Radar bleiben aus.
