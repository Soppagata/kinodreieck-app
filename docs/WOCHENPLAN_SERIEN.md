# Deine Woche: Folgen, Staffeln und Kinotermine

Stand: 2. August 2026

## Produktverhalten

Die Startseite folgt der festen Reihenfolge „Kino für dich“, „Deine Woche“,
„Pinboard & Serienradar“, „Must-Watch“ und „Zuletzt hinzugefügt“.
„Deine Woche“ zeigt stets heute und die sechs tatsächlich folgenden
Kalendertage als Kinotickets untereinander. Eine Auswahl oder Navigation durch
Kalenderwochen ist nicht nötig; beim Datumswechsel rückt der Ausblick weiter.

Ein Folgen- oder Staffelreminder enthält:

- Titel und Plattform,
- einen oder mehrere Wochentage,
- einen Wochenrhythmus,
- Beginn und optionale Uhrzeit,
- ein optionales Ende nach Datum oder Anzahl von Terminen,
- Notiz sowie eine optionale App- oder Web-Verknüpfung.

Die App versucht eine Verknüpfung nur über eine starke Anbieterkennung oder
einen exakt und eindeutig passenden Serientitel. Bei mehreren gleichnamigen
Serien wird nichts geraten. Der Nutzer kann den Treffer selbst wählen, nur
einen externen Link setzen oder den Reminder ganz ohne Link speichern.

Angepinnte Kinotermine werden in den passenden Sieben-Tage-Ausblick projiziert. Sie bleiben
die vorhandenen Kino-Pins; Löschen im Wochenplan entfernt deshalb denselben Pin
und keine Kopie. Kinopins und ausdrücklich beobachtete Serien erscheinen
gemeinsam im „Pinboard & Serienradar“. Neue Staffel- oder Folgenstände werden
dort zuerst und hervorgehoben angezeigt. Kalender und Pinboard bleiben getrennt:
Eine beobachtete Serie gelangt nicht automatisch in den Wochenplan.

„Beobachten“ ist ein eigener Pin-Status im ausgeklappten Streaming-Eintrag und
vollständig unabhängig von „gesehen“ oder „in deiner Mediathek“. Erst das
ausdrückliche Beobachten aktiviert Radar und serverseitige ID-Synchronisation.

## Zeit- und Datenlogik

Die Berechnung arbeitet mit der lokalen Systemzeit. Der Erinnerungsrhythmus
bleibt Montag-basiert verankert; der sichtbare Ausblick beginnt dagegen immer
am aktuellen lokalen Datum. Datumsrechnung findet mittags beziehungsweise
kalenderbasiert statt, damit Sommerzeitwechsel keine Tage verschieben. Die
Ansicht prüft die Uhr jede Minute und beim erneuten Fokussieren des Fensters.

`folge_aktuell` bedeutet eine vom Lieferanten ausdrücklich gelieferte
Folgennummer und wird als „Folge N“ angezeigt. `folgen_verfuegbar` ist dagegen
nur eine Gesamtzahl und wird nicht als aktuelle Folgennummer ausgegeben.

## Kalenderexport

Ein einzelner Termin, ein ganzer Tag, die sichtbaren sieben Tage oder die komplette
wiederkehrende Reminder-Serie kann als `.ics` exportiert werden. Die Dateien
sind für den Import in Apple Kalender und Outlook ausgelegt. Es handelt sich
bewusst um einen Schnappschuss: Spätere Änderungen im Kinodreieck ändern einen
bereits importierten Kalendertermin nicht automatisch. Ein abonnierbarer
Kalender-Feed ist nicht Bestandteil dieser Ausbaustufe.

## Speicherung und Datenschutz

Der persönliche Plan liegt unter `kd:wochenplan` und nimmt am bestehenden
Gast-, Konto-, Backup- und Restore-Verhalten teil. Remindertexte und Notizen
werden nicht an die Streaming-Pipeline weitergegeben.

Für angemeldete Nutzer synchronisiert die App ausschließlich die deduplizierten
Watchmode-IDs der ausdrücklich beobachteten Serien über `kd_set_series_watch` in
`kd_series_watch`. RLS bindet jede Zeile an `auth.uid()`. Der Browseraufruf
fragt keinen Streaminganbieter ab und verändert den bestehenden Abrufplan
nicht.

## Produktionsstand und betrieblicher Folgeschritt

Die Migration
`supabase/migrations/20260802120000_wochenplan_serienbeobachtung.sql` wurde am
2. August 2026 einzeln auf das verknüpfte Projekt angewandt. Tabelle, RLS, vier
Owner-Policies, authentifizierte RPC-Ausführung und die erweiterte
`kd:wochenplan`-Allowlist wurden danach remote belegt. Die gleichzeitig offene,
ältere Stapelimport-Migration wurde dabei nicht ausgeführt.

Für die individuelle Serienbeobachtung verbleibt die Verdrahtung des extern
betriebenen Streamingjobs:

1. Im planmäßigen Streamingjob einmal
   `select distinct watchmode_id from kd_series_watch where active` lesen.
2. Diese IDs mit der statischen Konfiguration über
   `verbindeBeobachteteIds(config, serverRows)` zusammenführen.
3. Beim ohnehin stattfindenden Anbieterabruf die vorhandene Antwort über
   `staffelstandAusQuellen` auswerten und Staffel-/Folgenfelder mit
   `reichereBeobachteteSerienAn` in den Katalog übernehmen.

Damit werden beobachtete Serien bei jedem vorhandenen Kataloglauf ausdrücklich
berücksichtigt, ohne zusätzliche Laufzeitpunkte einzuführen. Eine Änderung
wird folglich beim nächsten planmäßigen Abruf sichtbar; mehrere Änderungen
zwischen zwei Abrufen können naturgemäß zu einem gemeinsamen neuen Stand
zusammenfallen.

Der externe Scheduler und der echte Anbieter-Payload liegen nicht in diesem
Repository. Deshalb bleibt die dortige Verdrahtung bis zum kontrollierten
Rollout eine klar ausgewiesene Betriebsaufgabe und wird nicht durch Browsercode
oder einen zusätzlichen API-Timer vorgetäuscht.

## Lokale Nachweise

- `wochenplan_test.mjs`: Rhythmus, Dienstag/Sonntag, Endbedingungen,
  Folgenstand, Kinoprojektion und `.ics`.
- `staffeln_test.mjs`: unabhängige Beobachten-/Gesehen-Zustände, getrennte
  Staffel-/Folgenbaselines und Bestätigung.
- `staffel_pipeline_test.mjs`: Deduplizierung, Cache, Quota-Guard und
  Folgenfelder ohne echte Anbieteraufrufe.
- `serieswatch_test.mjs`: Gast-Sperre und ID-only-RPC-Vertrag.
- `schema_snapshot_test.mjs`: Tabellen-, RLS-, Funktions- und Grantvertrag.
