# Radar-Websearch-MVP – primärer Umsetzungsplan

Stand: 17.08.2026

Adressaten: nächster Kinodreieck-Meister und genau ein Radar-Baumeister

Priorität: Dieser Plan ist für den schmalen Websearch-MVP maßgeblich. Die
älteren, breiteren Radar-Dokumente unter `docs/zukunft/` bleiben historische
und fachliche Referenzen, dürfen den hier festgelegten Kernpfad aber nicht um
Personenradar, Empfehlungen, Sharing oder allgemeine Betriebsplattformen
erweitern.

> Dieses Dokument ist ein Umsetzungsplan, keine Remote-, Backend-, Deploy-
> oder Anbieterfreigabe. Solche Wirkungen brauchen weiterhin eine aktuelle,
> objektgenaue Freigabe. Lokaler Mock-Bau darf nur beginnen, wenn der spätere
> Etappenauftrag ihn ausdrücklich erlaubt.

## 1. Ziel in einem Satz

Ein aktives Max-Radarziel löst serverseitig genau eine begrenzte Websuche aus;
belastbar belegte österreichische Kino-, Streaming-, Serien- oder Staffelstarts
werden dedupliziert mit direkten Quellen gespeichert und nach einem Reload in
`Mein Radar` angezeigt.

Der erste praktische Durchstich wird bewusst manuell über **Jetzt prüfen**
ausgelöst. Erst wenn derselbe Pfad Ende zu Ende funktioniert, ruft ihn ein
kleiner Scheduler montags und freitags erneut auf. Der Scheduler enthält keine
zweite Such- oder Auswertungslogik.

## 2. Ehrlicher Ausgangspunkt

Im Repository existieren bereits umfangreiche Radar-Grundlagen:

- lokaler Radarzustand, Abos, Receipts und UI-Projektion,
- serverseitige Tabellen für Targets, Checks, Events, Versionen und Evidenz,
- RLS-/RPC-/Pilot- und Importverträge,
- manuell prüfbare Quellendarstellung.

Der entscheidende Produktpfad fehlt jedoch noch:

- kein produktiver Radar-Websearch-Adapter,
- kein verdrahteter Radar-Runner,
- kein produktiver Radar-Scheduler,
- `radar_aktiv`, `radar_provider_aktiv` und `radar_scheduler_aktiv` sind in
  `supabase/migrations/20260809180000_event_radar_local_basis.sql`
  standardmäßig `false`,
- der bisherige Pilot kann Ereignisse technisch importieren, sucht sie aber
  nicht selbst.

Der aktuelle Checkout ist nicht automatisch die Baubasis. Genau der
Baumeister bestimmt zu Beginn einmalig den aktuellen Integrationsbranch,
Commit, Dirty-State und tatsächlich angewandten Remote-Stand. Meister und
Nebenchats wiederholen diesen Audit nicht.

## 3. Schmaler fachlicher Vertrag

### 3.1 Eingabe je Radarziel

Der Provider erhält nur globale, nicht persönliche Zieldaten:

```text
targetId
canonicalTitle
releaseYear?       # nur wenn bekannt
mediaType          # film | series
region             # fest AT
scopes             # cinema | streaming | series_start | season_start
knownEvidenceUrls? # nur zur Änderungs-/Duplikaterkennung
```

Keine Account-ID, kein Geschmacksprofil, keine Mediathek und keine anderen
Radarabos werden an den Anbieter übertragen.

### 3.2 Ausgabe des Suchpfads

Die serverseitige Antwort ist klein und strikt strukturiert:

```text
status: confirmed | insufficient_evidence | no_change
checkedAt
events[]:
  eventType: kinostart_at | streamingstart_at | serienstart | staffelstart
  eventDate: YYYY-MM-DD
  platform?: string
  seasonNumber?: integer
  evidence[]:
    url
    sourceDomain
    sourceTitle
    publishedAt?
    claim
```

Freier Fließtext, vollständige Webseiten, komplette Suchtranskripte und
Modellgedanken werden weder als Produktantwort noch als Radarereignis
gespeichert.

### 3.3 Wann eine Information belastbar ist

Ein Ereignis darf nur als `confirmed` gespeichert werden, wenn alle Punkte
erfüllt sind:

1. Titel, Jahr und Medientyp passen eindeutig zum Radarziel.
2. Das Ereignis gilt ausdrücklich für Österreich.
3. Ereignisart und taggenaues Datum stehen in der Quelle; Jahreszeiten,
   Monate oder reine Gerüchte reichen nicht.
4. Ein Streamingereignis nennt die Plattform.
5. Es gibt entweder eine passende offizielle Primärquelle oder zwei
   voneinander unabhängige seriöse Quellenfamilien.
6. Zwei URLs derselben Domain-/Publisherfamilie oder eine syndizierte Meldung
   zählen nicht als zwei Quellen.
7. Jede Evidenz besitzt eine direkte, kanonische URL.

Bei Widerspruch, Mehrdeutigkeit oder zu schwacher Evidenz lautet das Ergebnis
`insufficient_evidence`; dann entsteht kein Event-/Versions-/Evidenzwrite.

## 4. Kosten- und Tokenzaun des Produktpfads

- Genau ein potenziell zahlender Suchrequest pro Ziel und fälligem Check.
- Höchstens sechs relevante Suchtreffer in die Auswertung übernehmen.
- Kurze strukturierte Ausgabe statt Recherchebericht; Zielgröße höchstens
  ungefähr 1.200 Ausgabetokens.
- Keine automatischen Retries.
- Erfolgreiche URLs, Ergebnisfingerprints und `next_check_at` wiederverwenden;
  unveränderte Treffer nicht erneut vollständig analysieren.
- Deduplizierung, Datumsformat, Domainfamilien, Eventidentität und Upsert sind
  deterministischer Code, keine weiteren Modellaufrufe.
- Unbekannter Kostenstand, Timeout, Providerfehler, `AUTONOMIE_STOPP`, Exit 75
  oder `BUDGET_UNBEKANNT` stoppt nach `AGENTS.md`.
- Ein echter Radarfall darf später nur in den bestehenden bewachten
  `npm run test:ai:live`-Pfad integriert werden, ohne dessen maximale Zahl
  potenziell zahlender Requests zu erhöhen. Kein direkter Live-Skriptaufruf.

## 5. Umsetzungsfolge

### Paket A – lokaler Ende-zu-Ende-Vertrag

Verantwortlich: Radar-Baumeister; höchstens ein enger Bauchat, falls ein klar
abtrennbares Paket den Baumeister tatsächlich entlastet.

1. Aktuellen Radar-, Function- und Datenbankanschluss einmalig kartieren.
2. Einen kleinen Radar-Request-/Response-Vertrag und einen deterministischen
   Evidenzvalidator bauen.
3. Einen Mock-Websearch-Adapter anschließen.
4. **Jetzt prüfen** ausschließlich für Max verdrahten.
5. Bestätigte Ergebnisse über den vorhandenen Event-/Evidenzpfad speichern und
   im vorhandenen Radarfeed anzeigen.
6. Fokussiert belegen: bestätigt, unzureichend, Duplikat, Datumsänderung,
   falsches Werk, falsche Region, eine statt zwei unabhängiger Quellen,
   Providerfehler und Reload-Persistenz.

Fertig, wenn ein Mockfall denselben Weg nimmt wie später der echte Anbieter:

```text
aktives Abo -> Jetzt prüfen -> Adapter -> Validator -> Upsert -> Feed -> Reload
```

Kein neuer generischer Provider-, Remote-Window- oder Evidence-Executor ist
Teil dieses Pakets.

### Paket B – eine echte serverseitige Websuche

Erst nach grünem Paket A und eigener objektgenauer Freigabe:

1. Den kleinsten vorhandenen serverseitigen Anschluss verwenden. Wenn der
   bestehende `ai-task`-Vertrag die Funktion ohne Vermischung tragen kann,
   erhält er genau einen Radar-Task. Andernfalls entsteht eine kleine
   dedizierte Radar-Function. Keine abstrakte Multi-Provider-Plattform.
2. API-Key bleibt ausschließlich serverseitig.
3. Zunächst genau ein synthetisches Max-Ziel gegen Staging prüfen.
4. Direkte Quellen, gespeichertes Ereignis, Reload und Duplikatfreiheit
   praktisch belegen.
5. Provider bei jedem Fehler ausgeschaltet lassen; kein Retry und kein
   automatischer Folgecheck.

Function-Deploy, Secret-/Flagänderung, mögliche DB-Konfiguration und echter
Providerrequest sind getrennte Wirkungen und werden nur vom Baumeister nach
jeweils belegter Freigabe ausgeführt.

### Paket C – Scheduler auf denselben Runner setzen

Erst nach praktisch grünem Paket B:

1. Montags und freitags in `Europe/Vienna` nur fällige aktive Checks wählen.
2. Pro `check_key` den exakt in Paket B belegten Runner aufrufen.
3. Bestehenden Lease-/Fencing-/`next_check_at`-Vertrag wiederverwenden.
4. Keine parallelen Doppelchecks und keine automatischen Retries.
5. Ein Provider-/Kostenfehler beendet den Lauf; ein fachlich unzureichender
   Einzeltreffer bleibt auf dieses Ziel begrenzt.

Scheduler-Deployment und -Aktivierung benötigen eine neue direkte Freigabe.

## 6. Bewusste Nicht-Ziele

Bis der oben beschriebene Durchstich praktisch funktioniert, sind nicht Teil
dieser Etappe:

- Personenradar und automatische Werkvorschläge,
- Empfehlungen, Charts und Geschmacksableitungen,
- Radar-Sharing oder öffentliche Ziele,
- Push, E-Mail, Kalenderfeed oder Betriebssystembenachrichtigungen,
- mehrere Suchanbieter oder automatische Providerwahl,
- Volltextspeicherung, Scraping oder Artikelarchiv,
- neue allgemeine Backup-/Restore-/Release-Frameworks,
- Umbau funktionierender Radar-Tabellen ohne konkret belegte Notwendigkeit,
- normale Testkonten oder breiter Rollout vor Max' praktischer Abnahme.

## 7. Chat-, Prüf- und Backupökonomie

Für diese Etappe gilt ausdrücklich:

- Der Meister liest diesen Plan, entscheidet die Etappe und startet genau
  einen Radar-Baumeister. Er führt keine Repo-Vollsuchen, Tests, Backups,
  Restoreproben, CI-/Deployprüfungen oder Remote-Fenster selbst aus.
- Nur der Baumeister führt den einmaligen Baseline-Audit, statische
  Integrationsprüfung, vollständige Tests/Builds, Backups/Restoreproben,
  Remote-Pre-/Postflight, Deployments und echte Anbieterläufe aus.
- Ein Bau-/Korrekturchat bekommt nur Ziel, exakten Ausgangscommit,
  Dateihoheit, fokussierte Tests und STOPs. Er prüft weder das Gesamtprojekt
  noch Remotes/CI/Deployments und erstellt kein Backup.
- Es gibt keinen eigenen Prüf-, Review-, Harness-, Lieferstands- oder
  Remote-Readiness-Chat. Der Baumeister prüft den finalen Diff, die
  Integrationswirkung und alle Liefergrenzen selbst.
- Der Baumeister behebt kleine Findings selbst oder gibt sie als Restauftrag
  an denselben Bauchat. Es entsteht keine Kette aus Prüf-, Korrektur- und
  Nachprüfchats.
- Alle Nebenrollen verwenden den kompakten, vom Baumeister erzeugten
  Evidenzkern; nach Kontextkomprimierung wird nicht von vorne auditiert.
- Der Startauftrag an einen Bauchat bleibt möglichst unter 600 Wörtern und
  verweist bei langen Verträgen auf Commit/Datei/Zeile. Danach kommunizieren
  Baumeister und Bauchat nur mit `BLOCKER`, `CHECKPOINT` vor Pause oder
  Kontextverlust sowie `DONE`; keine Routine-Statusmeldungen, Rohlogs oder
  Auftragswiederholungen. Restaufträge enthalten nur das Delta.

## 8. Definition of Done

Der Radar-MVP ist erst fertig, wenn:

1. Max ein eindeutiges Werk ins Radar aufnehmen kann.
2. **Jetzt prüfen** genau einen serverseitigen Websearch-Request auslöst.
3. Ein belastbar bestätigtes österreichisches Ereignis mit direkten Quellen
   erscheint und nach Reload erhalten bleibt.
4. Unzureichende Evidenz keinen Eventwrite erzeugt.
5. Derselbe Treffer kein Duplikat erzeugt; ein geändertes bestätigtes Datum
   eine nachvollziehbare neue Version erzeugt.
6. Persönliche Daten nie Teil des Providerpayloads sind.
7. Fehler, Timeout und unbekannte Kosten ohne Retry und ohne falschen
   Erfolgsstatus stoppen.
8. Der Scheduler anschließend denselben belegten Runner montags und freitags
   ausführt oder ehrlich als noch nicht aktiviert ausgewiesen wird.
9. Gebaut, getestet, committed, gepusht, CI-grün, Function deployed,
   Backendwirkung, Providerpraxis und Schedulerpraxis separat berichtet sind.

## 9. Startanweisung für den neuen Meister

1. Diesen Plan als primären Radar-MVP-Auftrag lesen und dem isolierten
   Baumeister den absoluten read-only Pfad
   `/Users/max/Documents/GitHub/kinodreieck-app/RADAR_WEBSEARCH_MVP_UMSETZUNGSPLAN.md`
   übergeben. Dadurch ist der Plan auch ohne Commit im anderen Worktree
   eindeutig auffindbar; der Baumeister verändert die Datei dort nicht.
2. Keine neue allgemeine Radarplanung eröffnen.
3. Genau einen Baumeister für Paket A starten; Ausgangsref und Rechte im
   Etappenauftrag aktuell belegen.
4. Paket B und C nur nach ihren echten Freigabegrenzen öffnen.
5. Aktive Meister-/Baumeistertasks anpinnen und nach vollständiger Übergabe
   wieder lösen.
