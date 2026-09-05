# Nächster Masterchat: Cleanup, UX, Beobachtet und Betriebsstabilität

Stand: 04.09.2026

Status: verbindlicher Umsetzungsplan, noch nicht umgesetzt

Projekt: Kinodreieck-Privatrelease

## 1. Zweck und Geltungsgrenze

Dieser Plan führt drei bislang getrennte Arbeitsstränge in einen gemeinsamen
Umsetzungsauftrag zusammen:

1. die 17 Findings des vollständigen technischen Cleanup- und Codereviews,
2. die 14 praktischen Produktbefunde von Max vom 04.09.2026 und
3. die geplante Überarbeitung von **Beobachtet** als katalogbasiertes
   Serien-Radar-light mit Projektion konkreter neuer Folgen in „Deine Woche“.

Der neue Meister setzt diese Punkte kontrolliert um. Kein Punkt und keine ID
darf still entfallen. Überschneidungen werden gemeinsam gelöst, aber im
Meilensteinregister weiterhin nachvollziehbar zugeordnet.

Diese Datei ist selbst nur Planung und Dokumentation. Ihre Erstellung
autorisiert keine Provideranfrage, Migration, Shared-Datenmutation, Mail,
Remote-Wiederholung oder Production-Lieferung.

## 2. Wahrheitsbasis vor dem Bau

Der Review bezog sich auf den Basiscommit
`9b54577c165806c2124e4543ad9575a38642aa99`. Die End-to-End-Systemkarte liegt
auf dem lokalen Dokumentationsstand `codex/road-to-live-integration-20260902`
und begann zum Zeitpunkt dieses Plans bei
`0055007185d0ade9102f4fac33f6ddc0e011fb8c`.

Der neue Meister übernimmt diese Angaben nicht ungeprüft als aktuellen
Releasezustand. Er stellt zuerst read-only fest:

- Primärcheckout, vorhandene Worktrees, Branches, HEADs und Dirty State,
- aktuellen Stand von `origin/main` und `origin/staging`,
- ausgelieferte PWA-/Buildversionen auf Staging und Production,
- aktuelle Supabase-Migrations-, Function-, Flag- und Schedulerstände,
- aktuelle GitHub-Actions- und Environmentzustände sowie
- Erreichbarkeit und Inhalt des Single-File-Downloads.

Bestehende Änderungen im Primärcheckout gehören Max und bleiben unberührt.
Der Meister arbeitet in einem eigenen sauberen Nicht-main-Integrationsworktree.

### Sichtbelege von Max

- `/Users/max/Downloads/Bildschirmfoto 2026-09-04 um 18.01.55.png`
  zeigt die mobile Mediathek im Auswahlmodus mit 378 Filmen, großen
  Auswahlmarkern und ohne sichtbare lokale Suche.
- `/Users/max/Downloads/IMG_0273.PNG` zeigt wiederholte GitHub-Mails zu
  fehlgeschlagenen Runs sowie eine gesonderte wartende Production-Freigabe.

Die Bilder sind Beobachtungsbelege, keine technische Ursachenanalyse.

## 3. Feststehende Produktentscheidungen

| ID | Entscheidung |
|---|---|
| D-01 | **„Zuletzt hinzugefügt“ zeigt tatsächlich die zuletzt hinzugefügten persönlichen Einträge**, einschließlich normaler Mediathek-Einträge. Neue Einträge erhalten einen unveränderlichen Erstellzeitpunkt. Für Altbestände ohne Zeitstempel darf die stabile Einfügereihenfolge als ehrlicher Legacy-Fallback dienen; es werden keine exakten historischen Zeiten erfunden. |
| D-02 | Die globale Suche durchsucht alle Bereiche. Der aktuelle Bereich bleibt nur ein weicher Tie-Breaker. Ein klar besserer oder exakter Treffer aus einem anderen Bereich muss in der Topauswahl erscheinen. |
| D-03 | Tippfehlertoleranz wird zuerst deterministisch gelöst. Exakte Titel, Alternativtitel und starke Teiltreffer bleiben vorn; danach darf eine konservative, längenabhängige Edit-Distanz greifen. Keine KI im lokalen Kernsuchpfad und keine unsichere Identitätsverknüpfung. |
| D-04 | Lokale Mediathek-Suche, Filter, Sortierung und Typwechsel erhalten den Auswahlmodus und alle stabil ausgewählten IDs. Das ist bereits der Codevertrag und muss mobil sichtbar werden. Ein globaler Treffer-Sprung ist eine Navigation aus diesem Kontext und darf eine laufende Auswahl nicht still verlieren. |
| D-05 | Der Hauptbereich **Entdecken** bleibt so benannt und umfasst Empfehlungen, Radar und Blog. Dieser Hauptbereich ist Gegenstand der Performanceprüfung. Nur der heutige Streaming-Unterbereich „Entdecken“ wird sichtbar in **„Alles“** umbenannt; sein interner Schlüssel `entdecken` und bestehende Sprungziele bleiben kompatibel. |
| D-06 | Bei „Mandalorian & Grogu“ wird zuerst Feedalter, letzter erfolgreicher Lauf und Aktualisierungsintervall geprüft. Ist nur der Sechs-Tage-Stand zu alt, wird bevorzugt das vorhandene Intervall fachlich und betrieblich passend verkürzt. Websearch-Prompt, Ranking oder neue Datenquellen werden nicht ohne gegenteiligen Beleg umgebaut. |
| D-07 | Nutzerseitige Datumsanzeigen folgen `dd.mm.yyyy` beziehungsweise einer entsprechenden deutschen Langform. ISO-Daten bleiben intern für Sortierung, APIs, Eingabefelder, Migrationen und Kalenderexport erhalten. |
| D-08 | **Beobachtet**, Radar, Empfehlungen und Geschmackssignale bleiben getrennte Domänen. Beobachtet bleibt privat, katalogbasiert und startet keine eigene Websearch- oder KI-Anfrage. |
| D-09 | Sichtbare Checkboxen dürfen kleiner werden, ihre gesamte bedienbare Karten-/Label-Fläche bleibt auf Touchgeräten mindestens 44 × 44 px groß und semantisch zugänglich. |
| D-10 | Ein erwarteter Schutzabbruch darf sichtbar und erklärbar sein, aber ein fachlich fehlgeschlagener Lauf darf nicht irreführend grün erscheinen. Benachrichtigungen werden erst nach Ursachenklassifikation angepasst, nicht pauschal stummgeschaltet. |

## 4. Meilensteinregister des Meisters

Der Meister führt genau dieses Register. Detailtests oder Commits sind keine
eigenen Meilensteine.

| ID | Nutzerergebnis | Anfang |
|---|---|---|
| M-01 | Persönliche Daten, Login und Lösch-/Recoverywege sind sicher und verständlich. | OFFEN |
| M-02 | Einträge sind zuverlässig auffindbar; „Zuletzt hinzugefügt“, globale Suche und mobile Auswahl funktionieren zusammenhängend. | OFFEN |
| M-03 | Streaming lässt sich verständlich nach Jahrzehnt durchsuchen und der Hauptbereich Entdecken öffnet messbar schneller. | OFFEN |
| M-04 | Empfehlungen, Radar-Neuigkeiten und Streamingzahlen sind aktuell, erklärbar und ihrem Ziel beziehungsweise Datenstand zuordenbar. | OFFEN |
| M-05 | Beobachtete Serien erkennen neue Folgen/Staffeln verlässlich und projizieren nur belegte konkrete Termine in „Deine Woche“. | OFFEN |
| M-06 | Datumsdarstellung, Hilfe, Single File, Navigation, Touchziele und Accessibility sind konsistent und ohne Sackgassen. | OFFEN |
| M-07 | GitHub, Cloudflare, Supabase, Scheduler und Releaseartefakte bilden einen nachvollziehbaren, ruhigen und kompatiblen Betriebsweg. | OFFEN |

Statusbedeutung: `OFFEN` = Ergebnis fehlt; `GEBAUT` = Paket ist implementiert
und fokussiert belegt; `DONE` = im finalen Integrationscommit enthalten und
vom einmaligen Abschlussgate gedeckt.

## 5. Vollständiges Issue-Register

### 5.1 Technische Review-Findings

| ID | Prio | Kurzbefund | Ziel |
|---|---:|---|---|
| R-01 | P1 | Unvollständiger lokaler Backupdownload kann vollständige lokale Löschung freischalten. | Löschfreigabe nur nach nachweislich vollständiger Sicherung. |
| R-02 | P1 | Production zeigt Radar, obwohl der Radarclient dort hart deaktiviert ist. | Sichtbarkeit und reale Runtimefähigkeit aus derselben Capability ableiten. |
| R-03 | P1 | Entdecken-Function und committed Datenbank akzeptieren verschiedene Format-6-Verträge. | Genau einen kompatiblen Quellen-/Format-/Mengenvertrag ausliefern. |
| R-04 | P1 | Der +6h-Checker entwässert bei Gleichlauf nur einen Job pro Stunde. | Budgetbegrenzter serieller Drain plus Backlog-/Lag-Sichtbarkeit. |
| R-05 | P2 | Malformed erfolgreicher Login kann vor Identitätsprüfung persistiert werden. | Vollständigen Sitzungsvertrag vor Persistenz prüfen. |
| R-06 | P2 | Mobile Aktionen in globalen Suchtreffern sind ungefähr 22 px hoch. | Echte 44-px-Touchziele bei weiterhin kompakter Darstellung. |
| R-07 | P2 | Blogkarte ist semantisch ein Button mit verschachtelten Buttons/Eingaben. | Separater Expand-Button und korrekter Fokus-/ARIA-Vertrag. |
| R-08 | P2 | Weitere Icon-Aktionen unterschreiten mobil 44 px. | Optisch klein, aber ausreichend große Hitboxen. |
| R-09 | P2 | Fachlich fehlgeschlagener Entdecken-Refresh kann als grüner Workflow enden. | Fachlicher Terminalfehler wird rot beziehungsweise zwingend überwacht. |
| R-10 | P2 | Das Default-Browsergate deckt den account-ready Alltag kaum ab. | Kleiner netzgesperrter `private-v1`-Harness für zentrale Nutzerwege. |
| R-11 | P3 | Entdecken-Tablist ist semantisch und per Tastatur unvollständig. | Vollständiges Tabmuster oder ehrliche normale Navigation. |
| R-12 | P3 | Desktopnavigation kennzeichnet den aktiven Bereich nur visuell. | `aria-current` konsistent mit mobiler Navigation. |
| R-13 | P3 | Privacy-Recovery zeigt interne Fehlermeldungen direkt. | Stabiler nutzerverständlicher Boundary-Error-Text. |
| R-14 | P2 | Sichtbare Single-File-Links werden auf Production auf `/` umgeleitet. | Download wirklich ausliefern oder sämtliche sichtbaren Hinweise entfernen. |
| R-15 | P2 | Pages, Functions und Migrationen besitzen keinen gemeinsamen Paritätsreadback. | Read-only Releasekompatibilitätsmanifest und Gate. |
| R-16 | P2 | Private-Ops-Monitor kennt keinen ausdrücklich erlaubten Radar-Pilotzustand. | Exakte umgebungsgebundene Sollmatrizen. |
| R-17 | P3 | `masterlist-enrichment` ist clientseitig registriert, serverseitig aber ungeplant 501. | Bis zur Implementierung aus der aktiven Clientfläche entfernen. |

### 5.2 Praxisbefunde von Max

| ID | Befund und verbindliches Soll | Zugeordnet |
|---|---|---|
| U-01 | Jahrzehntregler zeigt „20er“, „30er“ usw. Der Filterbereich bleibt Jahrzehnt minus 2 bis plus 12 Jahre. Jede Regleränderung stellt automatisch „Jahr: älteste zuerst“ ein. | M-03 |
| U-02 | „Zuletzt hinzugefügt“ zeigt die wirklich letzten persönlichen Einträge. Ein zuletzt angelegter Mediathek-Titel wie Obsession darf nicht fehlen. | M-02 |
| U-03 | Bereichspriorität der globalen Suche ist weich. Exakte und deutlich passendere Treffer anderer Bereiche müssen in die Topauswahl. Tippfehler und leicht abweichende Schreibweisen dürfen die Titel-/semantische Suche nicht unnötig leeren; zuerst mit einem kleinen realen Anfragekorpus prüfen, dann konservative Toleranz bauen. | M-02 |
| U-04 | Obsession wird mit dem echten Kontostand reproduziert: Laden, lokale Suche, globale Suche, Absenden, Ranking und Sprungziel getrennt prüfen. | M-02 |
| U-05 | Nur der Streaming-Unterbereich „Entdecken“ heißt sichtbar künftig „Alles“. Interne Route, gespeicherter Zustand und Links bleiben funktionsfähig. | M-03 |
| U-06 | Mandalorian & Grogu wird durch Aktualitäts-, Aufnahme-, Identitäts-, AT-Verfügbarkeits-, Profil- und Gesehen-Gates verfolgt. Bei bestätigtem Altstand bevorzugt das bestehende Aktualisierungsintervall verkürzen. | M-04/M-07 |
| U-07 | Jede Radar-Neuigkeit zeigt subtil das zugehörige Ziel, etwa „Ziel: Nicolas Cage“. Vorhandene `targetId`-Beziehungen werden projiziert, nicht neu geraten. | M-04 |
| U-08 | Alle sichtbaren Datumswerte sind europäisch formatiert. Interne ISO-Verträge bleiben unverändert. | M-06 |
| U-09 | Im mobilen Auswahlmodus bleibt die lokale Suche sichtbar und sticky; Suchen, Filter, Typ und Sortierung erhalten Auswahlmodus und IDs. „Auswahl beenden“ wird verständlicher, beispielsweise „Fertig“. Auswahlmarker werden optisch kleiner und niemand muss 378 Karten linear durchsuchen. | M-02/M-06 |
| U-10 | Must-Watch verwendet dieselbe wiederverwendbare zugängliche Checkboxdarstellung wie der Auswahlmodus. | M-02/M-06 |
| U-11 | Vollständiger Run-Audit aller GitHub-Actions erklärt Ursache, Häufigkeit und Wiederholungsrisiko jeder roten beziehungsweise wartenden Klasse. | M-07 |
| U-12 | Der langsame Hauptbereich Entdecken – Empfehlungen, Radar und Blog – wird auf Netzwerk-, Parse- und Renderzeit vermessen und gezielt beschleunigt. Er darf nicht mit dem umzubenennenden Streaming-Unterbereich verwechselt werden. | M-03/M-04 |
| U-13 | Hilfe-Einstieg und Single-File-Status werden bereinigt. Ein alleiniger Settings-Einstieg ist nur zulässig, wenn er mobil gut auffindbar ist und der dort versprochene Download wirklich funktioniert. | M-06/M-07 |
| U-14 | Der Rückgang von ungefähr 12.000 auf ungefähr 10.000 Streamingtitel wird je Snapshot und Pipelinephase bilanziert. Es wird nicht ohne Beleg als echter Marktabgang erklärt. | M-04/M-07 |

## 6. Vor-Bau-Audit: notwendige Diagnose statt Vorannahmen

### 6.1 Suche und Obsession

Der aktuelle Titelpfad normalisiert Groß-/Kleinschreibung, Umlaute,
Sonderzeichen und führende Artikel. Direkte Titelerkennung arbeitet danach im
Wesentlichen mit Teilzeichenketten; die Streaming-Entdecken-Suche hält selbst
fest, dass Tippfehler nicht abgefangen werden. Die semantischen Signale stützen
sich weitgehend auf bekannte Vokabeln und einzelne Prefixregeln.

Vor der Änderung erstellt der zuständige Baumeister einen kleinen geschlossenen
Testkorpus aus echten Nutzungsfällen, mindestens:

- `Obsession` und vollständiger vorhandener Titel,
- ein einfacher Ein-Zeichen-Tippfehler,
- fehlender/doppelter Buchstabe,
- vertauschte Buchstaben,
- deutscher Titel versus Originaltitel,
- exakt gleicher Titel in mehreren Medienarten/Jahren,
- Kombination aus Titel und Bereichswunsch sowie
- zwei Anfragen, die trotz Ähnlichkeit bewusst **nicht** gleichgesetzt werden
  dürfen.

Rankingreihenfolge:

1. exakte stabile Identität, soweit vorhanden,
2. exakt normalisierter Titel/Originaltitel,
3. starker Wort-/Teiltreffer,
4. konservativer eindeutiger Fuzzy-Treffer,
5. semantische Filter-/Rankingtreffer.

Der aktuelle Bereich wirkt erst innerhalb vergleichbarer Relevanz. Ein
Tippfehler darf nicht dazu führen, dass eine beliebige Top-Score-Liste ohne
inhaltlichen Bezug erscheint.

### 6.2 Auswahlmodus

Der vorhandene Codevertrag erhält Auswahlmodus und stabile IDs bereits bei
lokaler Suche, Filter, Sortierung und Typwechsel. Die mobile CSS-Regel blendet
die lokale Suche jedoch aus. Der Fix muss diesen bestehenden Vertrag sichtbar
machen und mit Browsertests belegen.

Ein globaler Treffer-Sprung setzt einen neuen Fokus und beendet den lokalen
Auswahlzustand. Sind Einträge markiert, darf dies nicht still geschehen:
entweder bleibt die Suche im lokalen Modus, oder der Navigationsverlust erhält
eine klare Entscheidung. Der globale Suchdialog ersetzt nicht die lokale
Auswahlsuche.

### 6.3 Mandalorian & Grogu und Entdecken-Aktualität

Zuerst werden ohne neuen Anbieterrequest folgende Zeitpunkte verglichen:

- Erzeugungszeit des aktuellen Streamingkatalogs,
- erste dort belegte Disney+-Verfügbarkeit,
- Erzeugungszeit und Alter des Entdecken-Feeds,
- letzter versuchter und letzter erfolgreicher Entdecken-Lauf,
- wirksame 144h-/Schedulergrenze sowie
- Zeitpunkt der lokalen Empfehlungsauswertung.

Ist der Feed schlicht älter als die neue Verfügbarkeit, ist die bevorzugte
Korrektur ein kürzeres Intervall innerhalb der bestehenden Pipeline. Die
gewählte Kadenz erhält eine explizite Freshness-SLA sowie Quellen-, Last- und
Kostenprüfung. Nur wenn ein frischer Feed den Film trotzdem verliert, werden
Identitäts-, Metadaten-, Gesehen- und Rankinggates korrigiert.

### 6.4 Streamingzählung

Für mindestens einen frühen ungefähr-12k-Stand und den aktuellen ungefähr-10k-
Stand wird eine gemeinsame Bilanz erzeugt:

`Rohzeilen je Quelle/Dienst -> gültige AT-Verfügbarkeit -> Identitätsauflösung
-> Deduplizierung -> vollständiger/limitierter Snapshot -> Dienstefilter ->
Mediathek-Abzug -> sichtbare Zahl`.

Zusätzlich werden hinzugekommene, entfernte und nur umidentifizierte Titel
getrennt. Die Oberfläche soll anschließend benennen, welche Zahl sie zeigt,
von wann der Snapshot stammt und ob er vollständig oder eingeschränkt ist.

### 6.5 Performance des Hauptbereichs Entdecken

Gemessen werden mindestens:

- übertragene Bytes und Requestkette,
- Zeit bis erste sinnvolle Darstellung,
- JSON-Parse-/Projektionszeit,
- React-Renderzeit und Anzahl gemounteter Karten,
- kalter und warmer PWA-Start sowie
- 393-px-WebKit und – nach Staging – die installierte iPhone-PWA.

Bekannte Hypothese: Der Hauptbereich lädt derzeit auch den mehrmegabytegroßen
vollständigen Streamingkatalog. Bevorzugte Lösungen sind ein kleiner
Such-/Matchingindex, getrenntes Nachladen nach Unteransicht und eine frühe
Darstellung aus dem kleinen Empfehlungsfeed. Eine reine Spinnerkosmetik gilt
nicht als Performancekorrektur.

## 7. Vollständiger GitHub-Actions-Audit

Der Audit umfasst **alle** Workflows, nicht nur die vier Mails im Screenshot.
Im reviewten Stand sind dies mindestens:

1. `Automatic AI six-hour checker`,
2. `Test and deploy Cloudflare Pages`,
3. `Entdecken und Radar im Sechs-Tage-Takt`,
4. `Supabase Keep-alive` und
5. `Private Ops Monitor`.

Read-only werden zunächst 30 Tage Laufhistorie ausgewertet; bei selteneren
Klassen wird gezielt bis 90 Tage erweitert. Pro Workflow entstehen:

- Trigger, nominelle und tatsächliche Kadenz,
- Anzahl erfolgreich/fehlgeschlagen/abgebrochen/übersprungen/wartend,
- erster ursächlicher Job und Schritt statt bloßer Folgefehler,
- Klassifikation als Codefehler, Vertragsdrift, Secret/Permission,
  Environment-Freigabe, absichtlicher Guard, Timeout, Konkurrenz oder
  Plattformstörung,
- automatische und manuelle Wiederholungen,
- Concurrency-/Backlog-/Lag-Verhalten,
- Zusammenhang mit Pages, Supabase, Functions, Migrationen und Flags,
- ausgelöste Mailklasse und erwartete künftige Häufigkeit sowie
- kleinste Korrektur und erforderlicher Regressionstest.

„Production deployment awaits review“ wird als wartende
Environment-Freigabe untersucht und nicht automatisch als fehlgeschlagener
Run verbucht. Während des Audits werden keine Runs neu gestartet, abgebrochen,
dispatcht oder durch Secret-/Environmentänderungen beeinflusst.

Zielzustand: Jeder rote Lauf ist unerwartet und handlungsrelevant; erwartete
No-op-/Noch-nicht-fällig-Zustände sind ehrlich modelliert; fachliche Fehler
bleiben sichtbar; wiederholtes E-Mail-Rauschen besitzt eine konkrete behobene
Ursache statt bloßer Stummschaltung.

## 8. Beobachtet 2.0 – vorhandene Bausteine weiterverwenden

### 8.1 Bestehender Pfad

~~~text
Streamingkarte: Beobachten
  -> privater entdeckenStatus mit Watchmode-ID und Basisstand
  -> accountgebundener seriesWatchService / kd_series_watch
  -> vorhandener planmäßiger Streamingkataloglauf
  -> Staffel-/Folgenfelder im Katalog
  -> staffelHinweis / neueStaffeln
  -> Pinboard & Serienradar auf der Startseite
~~~

Dieser Pfad wird erweitert, nicht durch ein neues Webradar ersetzt.

### 8.2 Zielpfad

~~~text
neuer Katalogstand
  -> stabile Serienidentität und vorher bestätigte Baseline
  -> echte positive Staffel-/Folgendelta-Erkennung
  -> konkretes Veröffentlichungsdatum vorhanden?
       nein -> nur subtiler Radar-light-Hinweis im Pinboard
       ja   -> stabiles Serienereignis erzeugen
                -> heute oder Zukunft in Europe/Vienna?
                     nein -> nicht in den Wochenkalender projizieren
                     ja   -> bei Tag innerhalb „heute + 6 Tage“
                             dynamisch in „Deine Woche“ anzeigen
~~~

### 8.3 Ereignisvertrag

Ein projizierbares Ereignis benötigt mindestens:

- stabile Serien-ID/Watchmode-ID,
- Staffel und/oder Folge als belastbare Identität,
- konkretes Veröffentlichungsdatum,
- Plattform beziehungsweise belegte Verfügbarkeit,
- Zeitpunkt/Frische des geprüften Katalogstands und
- einen deduplizierbaren Ereignisschlüssel.

Ein bloßer Anstieg von `folgen_verfuegbar` ohne Datum darf keine erfundene
Kalenderzeile erzeugen. Mehrere Katalogläufe dürfen dasselbe Ereignis nicht
duplizieren. Beim erstmaligen Beobachten wird der aktuelle Stand weiterhin
still als Basis übernommen, damit alte Folgen nicht als neu erscheinen.

Die Kalenderdarstellung ist eine abgeleitete Projektion wie bei Kinopins und
keine Kopie in die manuelle Reminderliste. „Stand bestätigen“ verändert nur
die Beobachtungsbaseline. Das Entfernen aus Beobachtet entfernt die Projektion,
nicht unabhängige manuelle Reminder.

## 9. Etappen- und Paketfolge

Der neue Meister verwendet `kinodreieck-etappen-orchestrierung` und entscheidet
auf der frisch geprüften Basis einmal zwischen SOLO und
`FOUNDATION -> PARALLEL_WAVE`. Maximal drei wirklich disjunkte Pakete laufen
gleichzeitig. `src/App.jsx`, `src/index.css`, gemeinsame Schemas und öffentliche
Verträge dürfen nie mehreren Write-Ownern derselben Welle gehören.

### Etappe A – read-only Fundament

- Wahrheitsbasis aus Abschnitt 2,
- Diagnosen aus Abschnitt 6,
- vollständiger Actions-Audit aus Abschnitt 7,
- verbindliche Write-Ownership-/Parallelmatrix und
- aktualisiertes Meilensteinregister.

Noch keine Provideraufrufe oder Remote-/Shared-Mutationen.

### Etappe B – erste Welle: kritische Grenzen

Bis zu drei disjunkte Pakete:

| Paket | Scope | Hauptzuordnung |
|---|---|---|
| B-1 Sicherheit und Recovery | R-01, R-05, R-13 | M-01 |
| B-2 Release- und Datenvertrag | R-02, R-03, R-14, R-15, R-17 | M-04/M-06/M-07 |
| B-3 Scheduler, Monitoring und Actions | R-04, R-09, R-16, U-12 | M-07 |

`deploy.yml` gehört dabei ausschließlich B-2; die übrigen Scheduler-/Monitor-
Workflows ausschließlich B-3. Ergibt die aktuelle Basis eine andere echte
Überschneidung, werden nur die kollidierenden Pakete sequenziell angeordnet.

### Etappe C – zweite Welle: Nutzerwege

| Paket | Scope | Hauptzuordnung |
|---|---|---|
| C-1 Auffinden, Chronik und Auswahl | D-01 bis D-04; U-02 bis U-04, U-09, U-10; R-06, R-08 | M-02/M-06 |
| C-2 Streaming und Hauptbereich-Performance | U-01, U-05, U-12 | M-03 |
| C-3 Empfehlungen, Radar und Katalogwahrheit | D-06; U-06, U-07, U-14 | M-04/M-07 |

Diese Pakete dürfen nur parallel laufen, wenn der Meister gemeinsame App-
Orchestrierung und globale Styles vorher eindeutig einem Owner oder einer
kleinen Foundation zugeordnet hat. Erzwungene Parallelität mit späteren
Großkonflikten ist nicht zulässig.

### Etappe D – abhängige Abschlusswelle

| Paket | Scope | Hauptzuordnung |
|---|---|---|
| D-1 Beobachtet 2.0 | Abschnitt 8, bestehende Series-Watch-/Staffel-/Wochenplanpfade | M-05 |
| D-2 globale Konsistenz | U-08, U-13, R-07, R-11, R-12 sowie verbleibende Touch-/Hilfetexte | M-06 |
| D-3 account-ready Browsergate | R-10 und Regressionen aller reparierten Hauptnutzerwege | M-01 bis M-07 |

D-1 beginnt erst nach belastbarer Katalog-/Freshness-Klärung aus C-3.
D-2 läuft nach den größeren UI-Paketen, damit Datums-/ARIA-/Hilfekorrekturen
nicht mehrfach über dieselben Flächen verteilt werden.

## 10. Fokussierte Abnahmekriterien

### Suche, Chronik und Auswahl

- Ein neu angelegter Mediathek-Eintrag erscheint als neuester Eintrag auf der
  Startseite; Obsession ist ein Regressionstest.
- Exakte Titel aus einem anderen Bereich schlagen schwächere Treffer des
  aktuellen Bereichs.
- Definierte Tippfehler liefern den eindeutigen richtigen Titel; definierte
  Gegenbeispiele bleiben getrennt.
- Die Topauswahl enthält bei mehreren relevanten Bereichen eine sinnvolle
  Mischung und die vollständige Ergebnisansicht verliert nichts.
- Lokale Suche im Auswahlmodus bleibt mobil sichtbar; ausgewählte IDs bleiben
  bei Suche, Filter, Typ und Sortierung erhalten.
- Kein stiller Auswahlverlust durch globale Navigation.

### Streaming und Entdecken

- Jahrzehntlabel und unveränderter Minus-2-/Plus-12-Bereich sind separat
  getestet; Regleränderung sortiert ältestes Jahr zuerst.
- Nur das Streaming-Untertab heißt „Alles“; alle bestehenden Sprünge landen
  weiterhin richtig.
- Der Hauptbereich Entdecken zeigt früher verwertbaren Inhalt und besitzt einen
  dokumentierten Vorher-/Nachher-Messwert.
- Mandalorian & Grogu besitzt entweder einen erklärbaren aktuellen Ausschluss
  oder erscheint nach der belegten Freshness-Korrektur passend unter „Für mich“.
- Radar-Neuigkeiten zeigen ihr Ziel.
- Die 12k->10k-Differenz ist je Pipelinephase erklärt; die UI nennt Umfang und
  Stand des angezeigten Snapshots.

### Beobachtet

- Erstes Beobachten meldet keinen Altbestand als neu.
- Eine belegte neue Folge mit Datum innerhalb der nächsten sieben Tage erscheint
  genau einmal am richtigen Tag in „Deine Woche“.
- Ein Folgenanstieg ohne Datum bleibt ausschließlich ein Pinboard-Hinweis.
- Vergangene Termine werden nicht als aktuelle Woche projiziert.
- Europe/Vienna, Tageswechsel und Sommerzeitgrenzen sind deterministisch
  getestet.
- Beobachtet erzeugt weder Radarabo noch Profilwrite noch zusätzlichen
  Providerrequest.

### Betrieb und Release

- Jeder der fünf Workflows besitzt eine erklärte Erfolgs-, No-op-, Warte- und
  Fehlersemantik.
- Kein fachlicher Entdecken-Fehler endet grün.
- +6h-Backlog und ältester Lag sind begrenzt und sichtbar.
- Erwartete Radar-Flagmatrix ist je Umgebung exakt und fail-closed.
- Webcommit, Functionversionen und notwendige Migrationen werden gemeinsam
  read-only verglichen.
- Single File wird mit korrektem Inhalt ausgeliefert oder nirgends mehr
  versprochen; ein Redirect auf die Startseite gilt nicht als Downloadbeleg.

## 11. Prüf- und Lieferökonomie

- Jeder Paket-Baumeister führt nur fokussierte Mock-/Vertrags-/Browserchecks
  seines Scopes aus und liefert genau einen nachvollziehbaren Commit.
- In einer Parallelwelle gibt es keine Pushes, Deployments, Migrationen,
  Shared-Datenwrites oder Live-/Provideraufrufe aus den Paketen.
- Nach Integration aller Pakete führt der Meister genau einen angemessenen
  lokalen Abschlusslauf auf dem finalen Kandidaten aus: vollständige Mocksuite,
  Functiontests, account-ready Chromium/WebKit, Build/Single File, Diff- und
  Leakprüfung.
- Normale Tests bleiben providerfrei. Echte KI-/Websearch-/Providerläufe dürfen
  ausschließlich über die in `AGENTS.md` erlaubten seriellen Befehle und nur
  innerhalb einer ausdrücklichen taskweiten Kostenfreigabe erfolgen. Exit 75,
  `AUTONOMIE_STOPP` oder `BUDGET_UNBEKANNT` beendet weitere echte Tests sofort.
- Vor Migration, Shared-Datenänderung oder anderer schwer rückrollbarer Wirkung
  ist die konkrete Wirkungskette gesondert zu autorisieren.
- Eine autorisierte Staging-Lieferung umfasst force-freien Push, CI, Deploy und
  Readback. Die praktische installierte iPhone-PWA-Abnahme bleibt davon getrennt.
- Gebaut, getestet, committed, gepusht, CI-grün, deployed und praktisch
  abgenommen werden am Ende separat berichtet. Unbelegte Grenzen heißen
  `NICHT BELEGT`.

## 12. Kopierfertiger Handoff-Prompt für den neuen Meister

~~~text
Du bist der neue Umsetzungs-Meister für den Kinodreieck-Privatrelease.

Lies zuerst vollständig:
/Users/max/Documents/GitHub/kinodreieck-app/docs/NAECHSTER_MASTERCHAT_CLEANUP_UX_2026-09-04.md

Verwende für den gesamten Ablauf den Skill
`kinodreieck-etappen-orchestrierung`. Verwende keinen zusätzlichen allgemeinen
Prozess-, Review-, Release-, Status-, Handoff- oder Kontextskill. Fachskills
sind nur erlaubt, wenn sie eine konkrete technische Domäne abdecken und keine
zweite Prozesskette eröffnen.

Ziel ist die vollständige Umsetzung des dortigen Registers: R-01 bis R-17,
U-01 bis U-14, D-01 bis D-10 sowie Beobachtet 2.0. Keine ID darf still
entfallen.
Halte ausschließlich die sieben Nutzermeilensteine M-01 bis M-07 als zentrales
Register.

Beginne read-only mit Etappe A: Ermittle den aktuellen Checkout-/Worktree-/
Branch-/HEAD-/Dirty-State, origin/main und origin/staging, die ausgelieferten
PWA-Builds, Supabase-Verträge und den vollständigen GitHub-Actions-Stand.
Übernimm weder den Reviewcommit noch Bildschirmbeobachtungen ungeprüft als
aktuelle Wahrheit. Untersuche Obsession, die Suchstrenge, Mandalorian & Grogu,
den 12k->10k-Katalogrückgang, die Entdecken-Performance und Single File genau
nach dem Plan. Der Run-Audit umfasst alle Workflows und startet oder wiederholt
keinen Run.

Arbeite nie im dirty Primärcheckout und nie direkt auf main. Lege einen eigenen
sauberen Integrationsworktree auf der belegten gemeinsamen Nicht-main-Basis an.
Entscheide danach einmal zwischen SOLO und FOUNDATION -> PARALLEL_WAVE. Nutze
höchstens drei disjunkte Paket-Baumeister gleichzeitig. Jeder erhält einen
eigenen Branch/Worktree, exakte Write-Ownership, zugeordnete IDs und fokussierte
Fertigkriterien. src/App.jsx, src/index.css, globale Verträge, Schemas,
Dependencies und Fixtures dürfen in derselben Welle jeweils nur einen
Write-Owner haben. Bei Überschneidung arbeite sequenziell statt Parallelität zu
erzwingen.

Setze die Etappen B, C und D in der im Plan festgelegten Abhängigkeit um. Der
Meister bleibt während des Paketbaus in Produktdateien read-only, integriert
DELIVERED-Commits im eigenen Worktree und löst nur kleine benannte Nähte. Neue
Fachlogik geht als Delta-Restauftrag an den zuständigen Baumeister.

Wichtige feste Produktentscheidungen:
- „Zuletzt hinzugefügt“ zeigt echte letzte persönliche Einträge einschließlich
  Mediathek; neue Eintragszeitpunkte sind unveränderlich.
- Die Bereichspriorität der globalen Suche ist nur ein Tie-Breaker. Exaktere
  Treffer anderer Bereiche gehören in die Topauswahl.
- Tippfehlertoleranz bleibt deterministisch und fail-closed; kein LLM im
  lokalen Suchkern.
- Lokale Suche/Filter/Sortierung erhalten den Auswahlmodus und seine IDs.
- Hauptbereich Entdecken = Empfehlungen/Radar/Blog und Performanceziel.
  Streaming-Unterbereich Entdecken = sichtbare Umbenennung in „Alles“, interne
  Route bleibt kompatibel.
- Bei Mandalorian & Grogu zuerst Freshness und Intervall prüfen; bei bestätigtem
  Altstand bevorzugt die bestehende Kadenz verkürzen, nicht voreilig Prompt,
  Ranking oder Datenquelle umbauen.
- Sichtbare Daten europäisch formatieren, ISO intern behalten.
- Beobachtet bleibt privat, katalogbasiert, kostenfrei und von Radar/Profil
  getrennt; nur belegte konkrete neue Folgentermine gelangen abgeleitet in
  „Deine Woche“.

Führe pro Paket nur fokussierte Prüfungen aus und nach vollständiger Integration
genau einen gemeinsamen lokalen Abschlusslauf. Keine kostenpflichtige
Providerwirkung ohne ausdrückliche Freigabe und die AGENTS.md-Zäune; keine
Migration oder sensible Shared-Datenwirkung ohne die dafür erforderliche
Autorisierung. Eine spätere autorisierte Lieferung wird bis CI, Deploy und
Readback verfolgt; physische iPhone-PWA-Abnahme bleibt ein eigener Beleg.

Berichte zuerst kompakt die belegte Basis, das Meilensteinregister und die
Write-Ownership-/Wellenmatrix. Arbeite danach autonom durch die freigegebenen
lokalen Etappen und halte gebaut, getestet, committed, gepusht, CI-grün,
deployed und praktisch abgenommen strikt getrennt.
~~~
