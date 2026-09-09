# Betriebslaeufe: Zweck, Zustände und Aktivierungsgrenzen

Stand: 9. September 2026. Dieses Dokument beschreibt den lokalen
Integrationskandidaten. Es aktiviert keinen Workflow, startet keinen Lauf und
erteilt keine Kostenfreigabe.

## Die fünf Betriebslaeufe

| Workflow | Zeitplan | Zweck | Wirkung und Grenze |
| --- | --- | --- | --- |
| `Private Ops Monitor` | täglich 05:23 UTC, zusätzlich manuell startbar | Liest Staging-Build, Function-Build, Monitorrolle, Betriebsschalter, Budgetzaeune, trockene Aufbewahrungsfaelligkeit und Entdecken-Feedzustand. | Rein lesend. Der Workflow bindet das GitHub-Environment `staging`, checkt den Branch `staging` aus und nimmt dessen Commit als Build-Soll. |
| `Supabase Keep-alive` | alle drei Tage 06:17 UTC, zusätzlich manuell startbar | Prüft genau den öffentlichen Supabase-Auth-Health-Vertrag. | Ein GET, keine Tabellen- oder Nutzdatenmutation. Variablen kommen aus dem Environment `staging`. |
| `Entdecken – täglicher Quellenabgleich` | täglich 02:00 UTC | Prüft und aktualisiert den öffentlichen Entdecken-Feed unabhängig von Radar. | Konfiguration aus `staging`. Fachliche Fehler bleiben rot; nur ein bereits erfolgreich aktualisierter vollständiger Tagesstand ist ein grüner Faelligkeits-No-op. Remote noch deaktiviert. |
| `Radar – fällige Ziele prüfen` | täglich 02:00 UTC | Prüft im bestehenden 144-Stunden-Vertrag höchstens zehn faellige Radar-Ziele seriell. | Im vorliegenden Kandidaten hart mit `if: false` gesperrt. Selbst nach einer späteren Codefreigabe ist zusätzlich `KD_RADAR_SCHEDULE_ENABLED == 'true'` erforderlich. |
| `Automatic AI six-hour checker` | stündlich zur Minute 37 | Bearbeitet höchstens drei faellige KI-Nachpruefungen seriell. | Der Job läuft nur bei `KD_AUTOMATIC_AI_SCHEDULE_ENABLED == 'true'`. Der Workflow ist remote weiterhin `disabled_manually`; dieser Kandidat aktiviert ihn nicht. |

Entdecken und Radar stehen als getrennte Workflows nebeneinander. Ein
providerfreier Entdecken-Lauf kann damit keine Radar- oder KI-Arbeit
mitaktivieren. Der Radar-Job wurde aus dem bisherigen kombinierten Workflow
mit unverändertem Request-, Timeout-, Antwort- und Kein-Retry-Vertrag
übernommen. Der alte Radar-Job ist im integrierten Kandidaten aus dem
Entdecken-Workflow entfernt.

## Was ein Run bedeutet

- **OK:** Der jeweilige Vertrag wurde vollständig gelesen und validiert.
- **No-op:** Eine aktivierte Aufgabe war nicht faellig oder bereits erledigt.
  Das ist ein erwarteter, grüner Zustand.
- **Warnung:** Der Private-Ops-Monitor sieht faellige
  Aufbewahrungspruefungen oder einen gerade laufenden Feedrefresh; Automatic AI
  meldet nach seinem festen Dreierlimit weiteren Rückstand.
- **Wirkungsgesperrt:** Der kostenpflichtige Job wurde wegen der
  Aktivierungsgrenze gar nicht gestartet. Der vorgeschaltete Job schreibt
  diesen Zustand in die GitHub-Schrittzusammenfassung.
- **Störung:** Konfiguration fehlt, ein Vertrag ist nicht lesbar oder
  ungueltig, ein ausgelieferter Build weicht ab, ein Budgetzaun ist unbekannt
  oder ein fachlicher Feed-/Providerfehler liegt vor. Der Job endet rot.

Ein roter Run bleibt rot. Die neuen Zusammenfassungen erklären den ersten
sicheren Grund über GitHub-Annotationen und `GITHUB_STEP_SUMMARY`; es gibt
keinen `continue-on-error`, keinen Workflow-Retry und keine automatische
Mailunterdrückung.

## Entdecken im Private-Ops-Monitor

Der Monitor liest genau eine Zeile aus `kd_entdecken_daily_feed`. Ausgegeben
werden nur Status, letzter Versuch, letzter erfolgreicher Stand, Gueltigkeit,
Formatnummer und Anzahl eindeutiger Quellen. Der Feed-Payload und die
Quellen-IDs werden nicht geloggt.

Die Bewertung setzt weder 25 oder 50 Titel noch eine feste Formatnummer oder
eine feste Quellenzahl voraus:

- `ready` braucht eine positive ganzzahlige Formatnummer, mindestens eine
  eindeutige nichtleere Quellen-ID und konsistente Datumsfelder;
- ein abgelaufener `ready`-Feed ist `FEED_EXPIRED` und rot;
- `error` wird mit dem bereinigten fachlichen Fehlercode, etwa
  `FEED_ERROR_SOURCE_ERROR`, rot und verständlich sichtbar;
- `empty`, ein nicht lesbarer Datensatz oder ein ungueltiger Minimalvertrag
  sind rot;
- `refreshing` ist sichtbar, aber zunächst nur eine Warnung.

Damit wird der aktuell beobachtete Zustand `error/source_error` als fachliche
Störung ausgewiesen, ohne den getrennt laufenden Entdecken-Umbau vorwegzunehmen.

## Konfiguration ohne Secretwerte

Die Workflows verwenden die bestehenden Staging-Namen `APP_URL`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`STAGING_EXPECTED_FUNCTION_BUILD`, `SUPABASE_SERVICE_ROLE_KEY`,
`MONITOR_ACCOUNT_EMAIL`, `MONITOR_ACCOUNT_PASSWORD` und
`SUPABASE_RADAR_SCHEDULER`. Werte werden weder dokumentiert noch in
Zusammenfassungen geschrieben.

Der rein lesende Befund vom 9. September 2026 ergab keine offenen
Automatic-AI-Retry-Jobs, ein Monatsbudget von 1000 US-Cent, eine
Radar-Taskreservierung von 20 US-Cent und den allgemeinen harten
Requestzaun von 500 US-Cent. Diese Werte beschreiben Konfiguration. Sie sind
keine Freigabe für einen kostenpflichtigen Lauf oder die Aktivierung eines
Zeitplans.

## Sichere Inbetriebnahme

1. Den Kandidaten integrieren und die alten kombinierten Radar-Zeilen über die
   benannte Entdecken-Naht entfernen.
2. Keine der beiden kostenpflichtigen Automationen im selben Schritt
   aktivieren.
3. Den ersten natürlichen Private-Ops- und Keep-alive-Lauf anhand ihrer
   Schrittzusammenfassungen lesen. `NOT_CONFIGURED` oder ein anderer echter
   Fehler bleibt ein Reparaturfall.
4. Radar oder Automatic AI erst nach eigener Kosten-/Wirkungsentscheidung
   freigeben. Für Radar müssen sowohl die harte `if: false`-Sperre bewusst
   geändert als auch das Repository-Opt-in exakt gesetzt werden.
5. Nach einer späteren Aktivierung den ersten natürlichen Lauf beobachten;
   nicht manuell dispatchen oder einen roten kostenpflichtigen Lauf blind
   wiederholen.
