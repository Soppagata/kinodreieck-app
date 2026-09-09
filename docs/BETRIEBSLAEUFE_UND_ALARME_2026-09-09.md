# Betriebslaeufe, GitHub-Mails und Entdecken

Stand: 9. September 2026. Anlass: wiederkehrende GitHub-Fehlermails und
Entdecken-Quellenstaende vom 23. und 27. August.

**Von Max festgelegt:** Alle fuenf Entdecken-Quellen regelmaessig aktualisieren;
den bisherigen Umfang beibehalten. Die unten vorgeschlagene Betriebsordnung
ist noch keine behauptete Aktivierung oder Auslieferung.

## Gepruefter Zustand

| GitHub-Workflow | Aufgabe und heutiger Takt | Live-Zustand |
| --- | --- | --- |
| Test and deploy Cloudflare Pages | Tests und Auslieferung bei Aenderungen; kein taeglicher Datenabruf | Aktiv. Letzter Staging-Lauf erfolgreich. |
| Private Ops Monitor | Taeglich 05:23 UTC: Staging-Build, Function-Health, Kontozugang, Schutzschalter, Budgetkonfiguration und faellige Aufraeumdaten lesen | Aktiv, aber am 7., 8. und 9. September jeweils siebenmal `NOT_CONFIGURED`. |
| Supabase Keep-alive | Ungefaehr alle drei Kalendertage 06:17 UTC: Auth-Health lesen | Aktiv; letzter gelesener Lauf am 7. September erfolgreich. Der Auth-Ping belegt weder Feedaktualitaet noch erfolgreiche Datenverarbeitung. |
| Entdecken taeglich und Radar im Sechs-Tage-Takt | Ein gemeinsamer taeglicher Trigger um 02:00 UTC; Entdecken soll taeglich aktualisieren, Radar prueft faellige Ziele nach 144 Stunden | `disabled_manually`. Seit dem 5. September kein GitHub-Lauf. |
| Automatic AI six-hour checker | Stuendlich zur Minute 37 nach sechs Stunden faellige automatische KI-Jobs pruefen; bis zu drei Jobs je Aufruf | `disabled_manually`. Kann zum freigegebenen KI-Nachversuch fuehren. |

Diese Inventur betrifft die fuenf GitHub-Workflows. Sie ist kein vollstaendiges
Inventar aller Datenjobs in Supabase oder ein Zugriff auf Max' Postfach.

### Warum der Monitor jeden Tag mailt

Der Zeitplan fuehrt die Workflowdatei auf `main` aus. Dort fehlen
`environment: staging` und die kanonischen Environment-Variablen. Die
benoetigten Werte liegen im Staging-Environment; alte Repository-Variablen
und falsche Secret-Namen ergeben leere Konfiguration.

Die passende Korrektur ist bereits in `staging` vorhanden. Ein manueller
Staging-Lauf am 7. September war mit allen sieben Pruefungen erfolgreich.
Die Korrektur fehlt weiterhin auf `main`. Der Fehler ist somit die
unvollstaendige Integration des Monitors; die Mails belegen keinen Ausfall
aller App-Funktionen. Der Workflow hat nur einen Job.

Das Staging-Environment hat laut aktuellem API-Readback keine Reviewer- oder
Branch-Einschraenkung, die den geplanten Zugriff aus dem main-Zeitplan sperrt.

### Warum Entdecken auf August zurueckfaellt

1. Der gemeinsame Entdecken-/Radar-Zeitplan ist abgeschaltet.
2. Die letzten beiden gruenen GitHub-Laeufe am 4. und 5. September liefen
   erst gegen 06:30 UTC. Beide meldeten ausdruecklich `outside_window` und
   speicherten keinen neuen Feed. Die Datenbank verlangt weiterhin die
   Stunde 02 UTC. GitHub garantiert keine minutengenaue Cron-Ausfuehrung.
3. Der letzte Datenbankversuch am 6. September um 20:07 UTC endete mit
   `source_error`. Der vorherige gespeicherte 50er-Feed vom selben Tag
   enthaelt noch Joyn und OeFI. Die heutige Quellenkonfiguration ist dagegen
   Netflix plus OeFI, mit ausgeschaltetem KI-Provider.
4. Der Client verwirft Joyn-haltige Serverfeeds und zeigt dann den eingebauten
   50er-Pool vom 29. August, dessen bestaetigter Zeitraum am 4. September
   endete. Darin sind OeFI und Netflix auf den 23. August, Apple TV+ auf den
   27. August datiert; Prime Video und Disney+ auf den 29. August.
5. Der produktive Quellenleser implementiert nur 25 Titel aus OeFI und
   Netflix. Prime Video, Disney+ und Apple TV+ haben bisher nur manuell
   hinterlegte Snapshots. Einschalten allein erfuellt den gewuenschten
   Fuenf-Quellen-Betrieb daher nicht.

Der Datenbank-Readback lief mit `transaction_read_only=on`. Es wurde kein
Refresh-Claim und kein Feed-Write ausgefuehrt. Ein einmaliger separater Test
des bestehenden Quellenlesers am 9. September lieferte mit genau zwei
oeffentlichen GETs erfolgreich 25 Titel aus OeFI/Netflix. Das belegt die
heutige Lesbarkeit dieser zwei Quellen vom Mac, nicht die damalige
Fehlerursache, eine Speicherung oder die vollstaendige Serverausfuehrung.

## Vorgeschlagene Betriebsordnung

- **Tests und Deployments:** behalten. Ein fehlgeschlagener Test oder eine
  fehlgeschlagene Auslieferung bleibt ein echter Alarm. Eine auf Freigabe
  wartende Produktion ist ein eigener Zustand.
- **Staging-Betriebscheck:** einmal taeglich, lesend und ohne KI-Kosten.
  Die vorhandene Korrektur muss in die vom Zeitplan verwendete main-Datei.
  Danach den ersten tatsaechlichen Zeitplanlauf pruefen. Der Check soll
  kuenftig auch Feedalter und letzten Aktualisierungsfehler sichtbar machen.
- **Keep-alive:** nach bestaetigtem taeglichem Betriebscheck als redundant
  pruefen und gegebenenfalls stilllegen. Nicht gleichzeitig den defekten
  Monitor und den letzten funktionierenden Health-Ping abschalten.
- **Entdecken:** eigener, vom Radar unabhaengiger Workflow; einmal pro Wiener
  Kalendertag alle fuenf Quellen auf neue Daten pruefen. Eine verspaetete
  GitHub-Ausfuehrung darf nicht allein wegen der Uhrzeit verworfen werden.
  Der atomare Tages-Claim verhindert einen zweiten Versuch am selben Tag.
- **Radar:** eigener Workflow; faellige, aktiv abonnierte Ziele im bestehenden
  Sechs-Tage-Takt. Kostenpflichtige Radararbeit und ihr KI-Nachpruefer werden
  nicht durch die kostenlose Entdecken-Aktivierung mit eingeschaltet.
- **KI-Nachpruefer:** nur gemeinsam mit einem bewusst aktivierten automatischen
  KI-Pfad betreiben. Er ist keine Voraussetzung fuer den providerfreien
  Entdecken-Quellenabruf.

### Entdecken: bestaetigter Umfang und Erfolgskriterium

Der bestehende Mix bleibt Ziel: 50 Titel aus 15 OeFI-Kinotiteln, 10 Netflix-,
10 Prime-Video-, 10 Disney+- und 5 Apple-TV+-Titeln. Die regelmaessigen
Quellenpfade fuer Prime, Disney und Apple muessen noch umgesetzt und belegt
werden. Ein kostenlos nutzbarer Automatikzugriff auf deren bisherige
Snapshot-Quelle ist mit diesem Audit nicht nachgewiesen; bezahlte APIs sind
nicht stillschweigend eingeschlossen.

Taeglich pruefen bedeutet nicht, dass eine Wochenchart taeglich neue Werte
veroeffentlicht. Die Anzeige trennt deshalb **zuletzt erfolgreich abgerufen**
und **Quellenstand**. Ein Quellendatum wird nicht auf heute umetikettiert.
Wenn eine Quelle ausfaellt, bleibt ihr letzter bestaetigter Stand erkennbar
alt. Ein Teilfehler darf nicht unsichtbar den ganzen Bereich auf einen festen
August-Pool zuruecksetzen. Persoenliche Passung bleibt der vorhandene lokale
Abgleich; dafuer ist kein weiterer taeglicher KI-Lauf erforderlich.

Ein gruenes HTTP-Ergebnis oder `outside_window` zaehlt nicht als erfolgreiche
Aktualisierung. Als geliefert gilt der vereinbarte Quellenmix erst nach
gespeichertem Feed, passendem Readback und sichtbarem Datenstand in Staging.

### Mailregeln

- GitHub-Fehlermails nicht pauschal nach Absender wegfiltern: sonst gehen
  auch echte Test- und Deploymentfehler unter.
- Fehlende Monitorkonfiguration reparieren; sie weder als taeglichen
  Normalzustand hinnehmen noch mit einem kuenstlich gruenen Exit verstecken.
- Geplante Inaktivitaet, noch nicht faellige Arbeit und eine bereits
  bearbeitete Tagesaufgabe sind keine Stoerung. Eine ausgebliebene faellige
  Aktualisierung oder nicht lesbare Quelle ist dagegen sichtbar zu melden.
- `notifications@github.com` und eine Repository-Adresse unter
  `noreply.github.com` passen zu GitHub-Benachrichtigungen. Ein Postfachzugriff
  oder Aenderungen an den Mailfiltern waren fuer diese Diagnose nicht noetig.
  Die konkreten Mailheader wurden nicht gelesen.

## Lokaler Lieferstand dieser Vorbereitung

Basis: aktuelles remote main `20291726315e0069a721aac74569bcddec4db687`.
Lokaler Branch: `codex/ops-monitor-definition-20260909`.

Die bestehende Staging-Monitorkorrektur und ihre fuenf zugehoerigen
Regressionspruefungen wurden als isolierter main-Kandidat uebernommen.
Ergebnis: **55/55 Mockpruefungen**, null echte Netzaufrufe im Test;
`git diff --check` ohne Fehler. Die geaenderte Workflowdatei bindet das
Staging-Environment, checkt staging aus und verwendet dessen Commit als
App-Build-Soll sowie die vorhandenen Deployment-Variablen.

Noch kein Push, keine neue CI-Ausfuehrung, kein Deployment und keine
Workflow-Aktivierung durch diesen Task. Der laufende taegliche Monitor ist
damit noch nicht remote repariert. Die benoetigte Entdecken-Erweiterung und
Zeitfensterkorrektur sind mit dieser Betriebsdefinition beschrieben, noch
nicht implementiert. Die physische iPhone-PWA wurde nicht bedient.

## Nachweise

- [Fehlgeschlagener Monitor vom 9. September](https://github.com/Soppagata/kinodreieck-app/actions/runs/34337395770)
- [Fehlgeschlagener Monitor vom 8. September](https://github.com/Soppagata/kinodreieck-app/actions/runs/34212310719)
- [Fehlgeschlagener Monitor vom 7. September](https://github.com/Soppagata/kinodreieck-app/actions/runs/34111840506)
- [Erfolgreicher manueller Staging-Monitor](https://github.com/Soppagata/kinodreieck-app/actions/runs/34109368996)
- [Gruener Entdecken-Lauf ohne Aktualisierung vom 5. September](https://github.com/Soppagata/kinodreieck-app/actions/runs/33949770562)
- [Gruener Entdecken-Lauf ohne Aktualisierung vom 4. September](https://github.com/Soppagata/kinodreieck-app/actions/runs/33845243484)
- [Aktueller erfolgreicher Staging-Deploy](https://github.com/Soppagata/kinodreieck-app/actions/runs/34287270050)
- [GitHub: Verzoegerungen und Default-Branch von Zeitplanlaeufen](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub: Benachrichtigungen fuer Workflowlaeufe](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs)

Readback: Staging meldete `ce846a3381f1918a1843304a7d84fed0e7aea68b`,
Produktion weiterhin `3b82a7305c16d5a74ba7a24786e5db068e61db95`.
Das sind datierte Beobachtungen und kein automatisch fortgeschriebener
Release-Status.
