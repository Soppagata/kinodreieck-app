# Zukunftsplanung: Entscheidungs- und Verworfen-Log

Stand: 09.08.2026
Audit-Scope: `FUTURE_PLAN_METADATA_ONLY`

> **Status: Zukunftsplanung – nicht implementiert.**
> Dieses Log ist aus Rollen-v1, der privaten Demo-Schlussabnahme und dem
> abgeschlossenen Audit-/Cleanup-Scope ausgeschlossen. Es dokumentiert
> Produktentscheidungen, keine gelieferten Funktionen.

## Entschieden

| Entscheidung | Begründung | Randbedingung / offene Option |
|---|---|---|
| Radar erst nach dem stabilen privaten Demo-Checkpoint bauen | Laufende Rollen-, Konto- und Gerätearbeit soll nicht durch eine neue persönliche Daten- und Kostenfläche erweitert werden | erster Zielbranch später ausschließlich `staging`; eigener Bauauftrag |
| Globale Ziele und Ereignisse von persönlichen Abos trennen | gleiche Serien/Franchises werden nur einmal geprüft; Interessen und Anzeigezustände bleiben pro Konto geschützt | Subscriberzahlen nie öffentlich oder beim Provider |
| Im Kontomodus ist die serverseitige Subscription die einzige wirksame Aboautorität | Scheduler, Limit und Rechte brauchen einen atomaren Stand; lokaler und serverseitiger Dual-Write wäre nicht heilbar | lokal bleiben Cache, Receipts und idempotente Outbox; Gastregeln bleiben rein lokal |
| Globaler Zielstatus und persönlicher Abozustand bleiben getrennt | ein Konto darf durch Pausieren niemals den Radar anderer Konten stoppen | `target_status` global; `subscription_status` pro Konto |
| Normale Konten starten mit maximal zehn unterschiedlichen aktiven Radar-Einträgen | belastbarer privater Pilot statt ungemessener 15er-Ausweitung | Event-Ziel oder Personen-Discovery-Ziel zählt je einmal; Kandidat zählt nicht; 15 frühestens nach vier Wochen gemessener Kosten, Präzision und Betriebslast |
| Das Zehnerlimit gilt nur für den neuen Radar, nicht für `Beobachtet` | bestehendes `kd_series_watch` beobachtet konkrete Serien und hat einen anderen Vertrag | eine Serienbeobachtung zählt nie; ein bewusstes Event- oder Personen-Radar-Abo zählt; kein stilles Kürzen oder Dual-Write |
| Max darf fachlich unbegrenzt viele Abos speichern | Superadmin-Nutzung soll nicht künstlich beschnitten sein | keine Umgehung globaler Lauf-, Quellen-, Privacy- oder Budgetzäune; Überhang wird verschoben |
| Superadmin-Recht als eigene Capability | Rollen-v1-`owner` besitzt bewusst keine zusätzlichen Produktrechte und darf nicht semantisch überladen werden | Arbeitstitel `radar_unlimited`; genaue Schemaform entscheidet der spätere Daten-STOP |
| Faktenreview ist eine eigene Capability | unbegrenzt abonnieren darf keine globale Tatsachenfreigabe einschließen | Arbeitstitel `radar_review`; jede Freigabe erhält ein unveränderliches Reviewlog |
| Ein globaler Check-Key wird pro Fälligkeit höchstens einmal gesucht | Kosten und Frische hängen zusätzlich von Region, Scope sowie Query-/Providerversion ab | `target + region + scope + query/provider version`; Pilotcadence fest Montag/Freitag; je Routingdimension nur eine aktive Version |
| Globale Radar-Ziele und Ereignisse sind nicht direkt browserlesbar | bereits die Existenz eines nur durch Abos entstandenen Ziels kann ein persönliches Interesse verraten | minimierte Feed-RPC nur für eigene aktive Abos; kein Direkt-SELECT |
| Eine breite Suche ersetzt drei fast gleiche Queryvarianten | mehrere Formulierungen sind keine unabhängigen Quellen und verdreifachen den Worst Case | unklare Fälle bleiben offen statt automatischer zweiter Suche |
| LLM nur zur strukturierten Kandidatenextraktion | Matching, Evidenz, Kalender und Kosten müssen reproduzierbar und fail-closed bleiben | bei unverändertem Suchhash möglichst gar kein Modellaufruf |
| Beobachtung erzeugt keine automatische Geschmackspräferenz | Recherche, Geschenk oder Neugier ist nicht gleich Vorliebe | getrennte optionale Bestätigung „auch als Vorliebe merken“ bleibt möglich |
| Radarereignis wird nicht ungefragt zum persönlichen Kalendertermin | Termine können falsch sein oder sich ändern; heutiger ICS-Export ist nur ein Snapshot | bestätigtes Event erscheint read-only in der rollierenden Woche und kann bewusst übernommen werden |
| Jede neue Terminversion muss selbst bestätigt werden | eine Verschiebung darf Evidenz und Freigabe des alten Datums nicht erben | Evidence/Review referenzieren `event_version_id`; Reminder-Update erst nach neuem Gate |
| Providerkosten insgesamt sollen ungefähr unter 20 Euro pro Monat bleiben | Max akzeptiert Zuverlässigkeit und moderate Kosten, aber keinen offenen Kostenpfad | exakter konservativer US-Cent-Deckel einschließlich Steuer-/Wechselkurspuffer wird erst am Remote-STOP festgelegt |
| Ein providerweiter Circuit-Breaker und ein gemeinsamer Kostenledger schützen alle KI-/Suchpfade | getrennte Zähler oder targetlokale Retries könnten den Gesamtdeckel trotz lokaler Limits überschreiten | bestehende Konto-KI und accountloser Radar-Systemactor reservieren atomar gegen denselben freigegebenen Deckel; Pilot-Reset nur autorisiert nach Health-/Preis-/Kostenbeleg |
| Sichtbarer Hauptbereich ist „Entdecken"; Radar ist eine interne Ansicht neben Empfehlungen und Meinungen (09.08.2026) | der bisherige Blog ist der kleinste thematisch passende Navigationsraum; ein zusätzlicher Haupttab würde das Menü überladen | technischer Key `blog` bleibt zunächst kompatibel; Blogs, Radar und Empfehlungen teilen nur die UI-Hülle, nie Tabellen/RPCs |
| `Beobachtet` und `Im Radar` sind zwei verschiedene Stati (09.08.2026) | `Beobachtet` verarbeitet nur ohnehin gelieferte Katalogänderungen; Radar sucht aktiv nach Ankündigungen | `Beobachtet` immer privat, kostenlos und ohne Webradar-Limit; aktive UI-Verben lauten „ins Radar aufnehmen“ |
| Die globale Suche bietet zwei getrennte Aktionen (09.08.2026) | derselbe Treffer kann kostenlos katalogbasiert beobachtet oder aktiv recherchiert werden; ein kombinierter Button würde die Kosten-/Privacy-Grenze verstecken | Titel/Serie: `Beobachten` und `Ins Radar`, soweit der Katalogvertrag trägt; Person: nur `Ins Radar`; jede Radar-Aktion mit Vorschau und Bestätigung |
| Entdecken erhält ein Zahnrad „Entdecken verwalten" (09.08.2026) | Nutzer brauchen einen zentralen Überblick über Beobachtet, Radar, Empfehlungseingaben und Meinungen | Desktop-Dialog/mobile Full-Sheet; jede Zeile schreibt weiterhin nur über ihren eigenen Domainservice |
| Radar kann private-default ohne Namen im kuratierten Kreis freigegeben werden (09.08.2026) | bereits global geprüfte Ziele können für andere der elf kuratierten Konten auffindbar werden, ohne Mehrfachsuche | eigener `kd_radar_target_shares`-Pfad; keine Autor-, Zeit-, Count- oder Receipt-Daten; keine mathematische Anonymitätszusage |
| Es ist keine Veröffentlichung geplant; Pilotgrenze ist Max plus höchstens zehn kuratierte Logins (09.08.2026) | aktueller Produktbetrieb bleibt bewusst privat und kontrolliert | jede Öffnung, Registrierung oder Indexierung ist ein neuer Privacy-, Rechte-, Kosten- und Betriebs-STOP |
| Empfehlungen werden deterministisch aus bestätigtem Profil und read-only Mediatheksprojektion gereiht (09.08.2026) | bestehende Daten reichen für nachvollziehbare Passung; ein LLM wäre im Ranking unnötig und instabil | kein Profilwrite; Beobachtet, Radar, Freigaben, Charts, Klicks und Blogs sind keine Geschmackssignale |
| „Neu" wird in Neuveröffentlichung, neue Dienstverfügbarkeit und Wiederaufführung getrennt (09.08.2026) | ältere Werke, Remakes und Kultvorstellungen dürfen nicht als dasselbe Ereignis erscheinen | +90-Tage-Horizont, sieben Tage „Seit kurzem"; Remake nur mit starker `remake_of`-Relation; Kult separat |
| Österreich-Charts sind getrennte Kandidatenquellen, kein gemeinsamer Popularitätsscore (09.08.2026) | Kino-, Netflix-, Prime- und Disney-Ränge messen Verschiedenes | source-genaue Labels/Zeiträume; Chartposition nie Geschmacks- oder Qualitätsurteil |
| Chart-Ingestion bleibt bis zu source-spezifischen Rechten blockiert (09.08.2026) | Netflix untersagt automatisierte Extraktion; FlixPatrol-HTML-Scraping ist verboten und API-Reuse ungeklärt; ÖFI verlangt für andere Nutzung Zustimmung und nennt Comscore | nur Adapterinterfaces/Fixtures; elf private Logins oder ein mögliches IP-Blocking ersetzen keine Erlaubnis |
| Der Chart-MVP besitzt höchstens eine neue bezahlte Quelle insgesamt (09.08.2026) | ein zweiter Rankinganbieter erhöht Kosten, Rechtefläche und Betriebsaufwand, ohne dieselbe Messgröße garantiert unabhängig zu bestätigen | bevorzugter Streamingkandidat FlixPatrol Start; JustWatch darf nur ersetzen, nicht ergänzen; Plus/Premium/Enterprise ausgeschlossen |
| FlixPatrol bleibt bis zu schriftlichem App-Anzeigerecht und eigenem Kosten-STOP blockiert (09.08.2026) | API v2 liefert die benötigten österreichischen Dienstcharts und starken IDs günstig, aber öffentliche Terms belegen serverseitigen Cache und Redisplay nicht ausreichend | maximal 15 Euro/Monat inklusive Puffer, maximal 25 Requests/Monat und innerhalb des providerübergreifenden ungefähr-20-Euro-Korridors; Kauf erst nach Ownerfreigabe |
| Watchmode und Kinoprogramm sind Kontrollbelege, keine zweiten Popularitätsränge (09.08.2026) | der vorhandene Stack kann starke Titelidentität, `AT`-Dienstverfügbarkeit, Kinostart und Spielbarkeit prüfen, aber weder Streamingviews noch Kinobesucherrang | kein Watchmode-Popularity-Ranking, keine Watchmode-Bilder, Attribution/30-Tage-Cache; Mehrdeutigkeit wird ausgeblendet |
| Kinocharts kommen bevorzugt als erlaubter ÖFI-/Comscore-Wochenfeed zu 0 Euro (09.08.2026) | ÖFI zeigt die marktweite Top 15 bereits aus der professionellen Comscore-Messung; eine zweite unabhängige Wochenmessung ist für elf Konten unverhältnismäßig | bis schriftlicher ÖFI- plus Comscore-Erlaubnis blockiert; direkter Comscore-Vertrag kein zusätzlicher MVP-Anbieter |
| Chartqualität wird fail-closed statt durch Rangmittelung abgesichert (09.08.2026) | verschiedene Quellen messen Plattformtrend, Nutzerinteresse, Angebot oder Besucher und dürfen nicht zu einer Scheingenauigkeit gemischt werden | starke ID plus Regions-/Dienstkontrolle je Item; vier Wochen wöchentliche und danach monatliche manuelle Quellenstichprobe; nach acht Tagen ohne bestätigten Stand ausblenden |
| Tavily wird für Entdecken, Empfehlungen und Charts nicht benötigt (09.08.2026) | diese Pfade sind deterministisch und besitzen strukturierte Kandidatenquellen | Tavily bleibt nur als möglicher Radar-Suchprovider hinter eigenem Rechte-/Kosten-STOP geparkt |
| Personen aus Schauspiel und Regie waren als direkte Radar-Ausbaustufe geplant (09.08.2026) | Nicolas Cage oder Robert Rodriguez sollten wie andere eigene Radar-Einträge unmittelbar in `Mein Radar` stehen | durch den `NO_GO`-Pflichtspike und den Parkeintrag unten überholt; nicht Teil von Phase 2 |
| Person → Werk bleibt bestätigungspflichtig und kostenfest (09.08.2026) | ein Name darf nicht unbemerkt Dutzende aktive Werkprüfungen erzeugen | Person zählt als ein Eintrag des Zehnerlimits; Kandidat zählt nicht; erst `Werk ins Radar` erzeugt ein weiteres reguläres Werk-Abo; keine Sammelbestätigung |
| Die Personenauflösung läuft zuerst über eine erlaubte strukturierte Quelle (09.08.2026) | Filmografien und Projektbeziehungen sind strukturierte Aussagen; eine generische Websuche pro Person wäre teuer und mehrdeutig | Pflichtspike für Schauspiel und Regie; bei unzureichender Abdeckung STOP statt stiller Wechsel zu LLM/Tavily |
| Codex/Claude kann höchstens optionale Einlesehilfe sein (09.08.2026) | ein persönlicher Operatorlauf kann bei kleinen Wochenmengen Normalisierungsarbeit sparen, ist aber weder Datenautorität noch SLA | nur erlaubte Inputs → begrenzte `proposal.json` → deterministischer Validator/Gegencheck → fixer Importer; kein Service-Role-Key, DB-Direktzugriff, Rechteersatz oder Vollretry |
| Eine Adaptionsbeziehung ist ein sichtbarer Kontexthinweis, kein stiller Ranking-Boost (09.08.2026) | folgt der bestehenden Trennung von Beobachtung und Vorliebe; zusätzlich trägt `Sonstiges` hart `bewertung: null` und liefert damit keine Präferenzstärke | Gewichtung nur nach ausdrücklicher Bestätigung; Finder, Prognose und Passung bleiben unverändert |
| Der `fa225c1f`-Deployfehler ist historisch geschlossen (09.08.2026) | Run #116 lieferte atomar korrekt, nur die feste Domain zeigte während der Propagation noch `289abff`; `bf82304` verlängerte den Domain-Retry | #117 und #120 sowie live `65a92df` grün; kein Rerun/Fix, im neuen Auftrag nur aktuellen Stand erneut belegen |

## Geparkt – nur unter genannter Bedingung wieder öffnen

| Ansatz | Wiedervorlagebedingung | Datum |
|---|---|---|
| Automatische Personen-Discovery für Schauspiel und Regie | neuer Owner-STOP sowie rechtlich und technisch geprüfter Quellen-/Scope-Spike mit mindestens 80 % vorab definiertem Projekt-Recall, null angenommenen falschen Rollenbeziehungen und tragbarer Ambiguitäts-/Lastmessung | 09.08.2026 |
| Erhöhung normaler Konten von zehn auf 15 Radar-Abos | mindestens vier Wochen reale Messung; Kosten, Präzision, Quota und Fairness bleiben im freigegebenen Rahmen | 09.08.2026 |
| Web-Push, E-Mail und Betriebssystembenachrichtigungen | Radar-Grundsystem ist stabil; eigener Opt-in-, Datenschutz- und Zustellplan liegt vor | 09.08.2026 |
| Abonnierbarer Kalenderfeed oder direkte Kalenderintegration | Snapshot-ICS reicht nach echtem Einsatz nicht; Berechtigungs-, Update-, Lösch- und Rückwegvertrag ist geklärt | 09.08.2026 |
| Zusätzlicher eigener Hauptnavigationstab „Empfehlungen“ | nur wieder öffnen, wenn der zu `Entdecken` umbenannte Blogbereich im echten Mobile-Spike nachweislich nicht verständlich tragfähig ist | 09.08.2026 |
| Automatische Geschmacksübernahme aus Beobachtungen | Nutzer verlangen dies und eine getrennte, ausdrückliche Bestätigung ist gestaltet und getestet | 09.08.2026 |
| Adaptive oder tägliche bezahlte Zielprüfung | Mon/Fri verpasst nachweislich wichtige Änderungen und Budgetsimulation plus echter Verbrauch bleiben unter dem Gesamtdeckel | 09.08.2026 |
| Vollautomatische Überführung des bestehenden Serienradars | Bestandsinventur, Vorschau, Parität und wiederaufnehmbarer Migrationsvertrag sind belegt | 09.08.2026 |
| Tavily als Produktionsquelle | Speicher-, Weiterverwendungs-, Attribution-, Datenschutz- und DPA-Rechte sind für den exakten Produktweg schriftlich ausreichend | 09.08.2026 |
| JustWatch als exklusive Streaming-Chartquelle | FlixPatrol erhält kein ausreichendes Nutzungsrecht oder scheidet qualitativ aus; JustWatch-Vertrag erlaubt den Elf-Konten-Pfad und Gesamtpreis bleibt im selben 15-Euro-Unterdeckel | 09.08.2026 |
| Zweiter bezahlter Rankinganbieter | Shadow-/Stichproben belegen trotz korrekter IDs, Region und Verfügbarkeit einen für Nutzer relevanten Qualitätsfehler, der nicht mit Quellenlabel oder manueller QA lösbar ist; neuer Kosten-/Rechteauftrag nötig | 09.08.2026 |
| Direkte Claude-Websuche für jeden Zielcheck | Payload-/Kosten-Spike belegt Modellunterstützung, `max_uses: 1`, Präzision und Monatskosten unter dem Ownerdeckel | 09.08.2026 |
| Weitere Discovery-Targets (Buch, Videospiel, Studio, Theaterstück sowie Komposition/Drehbuch) | Personenpfad für Schauspiel/Regie läuft stabil; eigener Nutzen-, Daten-, Fan-out- und Privacyvertrag liegt vor | 09.08.2026 |
| Ereignistyp „neues Projekt angekündigt" | Anbahnungs- und Besetzungsmeldungen haben ein eigenes Evidenzproblem; erst nach belegtem Discovery-Pfad und eigenem Gate erneut prüfen | 09.08.2026 |
| Automatische Übernahme bestehender `Persönlichkeit`-Einträge der Mediathek in Radar-Abos | dieselbe Bedingung wie bei der Serienübernahme: Inventur, Vorschau, Parität, wiederaufnehmbarer Vertrag | 09.08.2026 |

## Verworfen – nicht ohne neue Fakten wieder aufmachen

| Ansatz | Grund | Datum |
|---|---|---|
| Zwei Queryvarianten mit gleichem Datum gelten als Bestätigung | sie können dieselbe URL, Publisherfamilie oder syndizierte Falschmeldung wiederholen | 09.08.2026 |
| Artikel-, Indexierungs- oder `published_date` als Release-Datum verwenden | diese Felder beschreiben die Seite beziehungsweise Meldung, nicht das Werk | 09.08.2026 |
| Direktes automatisiertes film.at-Scraping ohne schriftliche Erlaubnis | mangels schriftlicher Nutzungserlaubnis ausgeschlossen; die dann aktuellen Primärbedingungen sind in Phase 0 erneut zu prüfen ([Kurier-ANB, Abruf 09.08.2026](https://kurier.at/info/anb/254619647)); Admin-only ändert die Rechtslage nicht | 09.08.2026 |
| `owner` still zum Superadmin machen | widerspricht Rollen-v1 und vermischt fachliche Rechte mit bestehenden Owner-Begriffen | 09.08.2026 |
| Superadmin darf Kosten- oder Monatszäune umgehen | ein fachlich unbegrenztes Abo-Set ist kein unbegrenztes Anbieterbudget | 09.08.2026 |
| Ein Ereignis je Account separat speichern oder suchen | dupliziert Fakten, Kosten und Fehler; persönliche Unterschiede gehören in Subscription/Receipt | 09.08.2026 |
| LLM bestätigt selbst Ereignis oder Kalendertermin | probabilistische Ausgabe darf nicht zur ungeprüften Fakten- oder Kalenderwahrheit werden | 09.08.2026 |
| `person` als gleichrangiger vierter Wert von `kd_radar_targets` | Personen haben keinen geschlossenen Release-Ereigniskatalog und würden Deduplizierung sowie Kostenzaun brechen | 09.08.2026 |
| Personen-Abo aktiviert alle gefundenen Werke automatisch | ein einzelner Name könnte unbemerkt Quota und Providerkosten vervielfachen | 09.08.2026 |
| Codex/Claude scrapt gesperrte Chartseiten und schreibt direkt mit Service-Role in die DB | persönliches Abo und kleine Nutzerzahl ersetzen weder Quellenrechte noch Validierung; direkter DB-Zugriff macht Modellfehler und Wiederanlauf irreversibel | 09.08.2026 |
| Unbestätigte Hinweise automatisch in `kd:wochenplan` oder externe Kalender schreiben | falsche und verschobene Termine würden persönliche Daten dauerhaft verunreinigen | 09.08.2026 |
| Bestehende `kd_series_watch`-Zeilen still auf zehn kürzen | möglicher Datenverlust und fachlich anderer bestehender Vertrag | 09.08.2026 |
| Drei Suchrequests je Check-Key und Lauf als MVP | bei 100 unterschiedlichen Check-Keys entstünden 600 statt 200 Suchen pro Woche, ohne dreifache unabhängige Evidenz | 09.08.2026 |
| Fehlgeschlagenen Batch sofort vollständig wiederholen | erzeugt Requeststürme, Duplikate und unkontrollierte Kosten; Wiederanlauf nur über Fehlmenge | 09.08.2026 |
| Radar-Share in `kd_shared_articles` oder einer gemeinsamen Social-Tabelle speichern | Blogpayload, Autor-/Tokenvertrag und Radar-Privacy sind fachlich unvereinbar | 09.08.2026 |
| Netflix-, FlixPatrol- oder ÖFI-Seiten im privaten Elf-Konten-Pilot einfach wöchentlich scrapen | kleine Reichweite senkt Exposition, hebt aber automatisierungs-, speicher- und weitergabebezogene Bedingungen nicht auf | 09.08.2026 |
| Chartpositionen in das Geschmacksprofil schreiben | nationale Nutzung ist weder persönliche Vorliebe noch Qualitätsurteil | 09.08.2026 |
| Watchmode-, TMDB- oder Trakt-Popularity als „in Österreich beliebt“ ausgeben | die Kennzahlen sind keine belegte österreichische Nutzung und ein Regionsfilter ändert die Popularitätsmetrik nicht rückwirkend | 09.08.2026 |
| Digital i, BB Media HITS oder Ampere für den Elf-Konten-Chart-MVP | Digital i/Ampere decken Österreich im relevanten veröffentlichten Produkt nicht ab; BB Media ist teurer und misst einen Social-/Datenbank-/Pirateriekomposit statt Dienst-Top-10 | 09.08.2026 |
| JustWatch und FlixPatrol im MVP parallel betreiben | doppelte Verträge und Kosten für unterschiedliche Messgrößen; Unterschiede wären kein Fehler und dürften ohnehin nicht gemittelt werden | 09.08.2026 |

## Noch ausdrückliche Owner-Entscheidungen vor dem Bau

1. ~~Sichtbarer Name: „Dein Radar”, „Empfehlungen” oder eine Kombination?~~
   **Entschieden am 09.08.2026: Hauptbereich „Entdecken”, darin
   `Empfehlungen | Radar | Meinungen`; `Beobachtet` bleibt ein eigener privater
   kostenloser Status.**
2. ~~Aktionen in der globalen Suche?~~ **Entschieden am 09.08.2026: Titel und
   Serien erhalten, soweit fachlich unterstützt, getrennt `Beobachten` und `Ins
   Radar`; Personen ausschließlich `Ins Radar`.**
3. ~~Personen erst später oder direkt im Radar?~~ **Entschieden am 09.08.2026:
   Schauspiel und Regie direkt als Personen-Discovery-Abo in `Mein Radar`;
   Kandidatenwerke einzeln bestätigen; Bücher/Spiele und weitere Rollen
   geparkt.**
4. Welche bestehenden Serienbeobachtungen sollen nach Vorschau als allgemeine
   Radar-Abos übernommen werden?
5. Exakter MVP-Ereigniskatalog und Standardregion Österreich?
6. Providerweg: Such-API plus Haiku bei Änderungen oder Claude-Websuche direkt?
7. Schedulerort nach Inventur des externen Streamingjobs?
8. Exakter providerübergreifender Monatsdeckel in US-Cent und Aufteilung des
   bestehenden 1.000-US-Cent-KI-Budgets?
9. Darf das anfängliche Gate aus zwei unabhängigen belastbaren Quellen
   beziehungsweise manueller Bestätigung nach einem belegten Shadow-Pilot für
   bestimmte offizielle Primärquellen gelockert werden?
10. Darf nach schriftlicher Rechtebestätigung FlixPatrol Start innerhalb des
   15-Euro-Unterdeckels und des unverändert ungefähr 20 Euro großen
   Gesamtproviderkorridors gekauft werden? Ohne ausdrückliches Ja bleiben alle
   echten Streamingcharts aus.
