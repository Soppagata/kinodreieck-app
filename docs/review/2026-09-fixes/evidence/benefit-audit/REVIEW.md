# Unabhängige Nutzen- und Regressionsnachprüfung der 49 Fixes

Kandidat `a69a32be51d8258fc4604d925f03ff35d74b4da6` gegen `14804ce389d69114feed27b92fb11ac78423cc0e`. Eigener sauberer Detachedworktree: `/private/tmp/kd-review49-benefit-audit-20260917`. Keine Produktänderung, kein Remote-/Providerlauf.

**Entscheidung: Die 49 lokalen Reparaturen beibehalten. Alle 239 ursprünglichen lokalen Abnahmekriterien sind belegt. Der gemeinsame Rollout bleibt wegen drei Altclientverträgen offen.** Ein Versprechen „nur Vorteile“ wäre falsch: zusätzliche Mutexabhängigkeit, konservativ fehlende Zuordnungen, begrenzte Zusatzreads und versionierte Backendverträge sind echte Kosten.

## Beweisgrenze

- Alle49 Originaltickets samt Ursachen/Auslösern/239 Abnahmen gelesen. Originalcriteria nochmals direkt aus den Ticketdateien extrahiert.
- Eigener sauberer Detachedworktree am exakten Kandidaten; frischer Baseline-Diff, betroffener Code und benachbarte Lese-/Schreibverträge geprüft.
- Voriger unabhängiger Bericht nur als Quellen-/Testindex verwendet; dessen Ergebnis und Kriterienevidenz nicht übernommen.
- Gezielte Originaltests erneut ausgeführt; echte Komponenten, unverändert extrahierte Appcallbacks, originale Workflowshell, Handler und SQLfunktionen. Mocks/Synthesedaten liegen an Außen-/Konto-/Providergrenzen.
- Eigene adversariale Altclientprobe für ÖFI ergänzt. Kein vollständiger neuer Repositoryreview; keine vollständige Testsuite, kein Build-/Deploy-/Remote-/Providerlauf.
- Vier initiale PGstarts scheiterten am Sandbox-shmget vor fachlicher Prüfung; identische Tests nach automatischer Freigabe lokal erneut ausgeführt und grün. Ursprüngliche Fehlerlogs bleiben erhalten. Keine Assertions gelockert.
- Browser- und PGgestelle erzeugen lokale temporäre Laufdateien; eigene Skripte, Logs und Berichte liegen ausschließlich im eigenen Evidenzverzeichnis. Produktworktree blieb sauber.

Die folgenden Statuswerte gelten für den ursprünglichen lokalen Fehler. „Behalten“ ist keine Genehmigung, den Kandidaten gegen das alte gemeinsame Backend auszuliefern. Die Rolloutentscheidung steht gesondert darunter.

## Genau 49 Ergebniszeilen

| Ticket | Lokaler Status | Urteil | Belegter Nutzen |
|---|---|---|---|
| KD-REV-E01-001 | ERLEDIGT | BEHALTEN | Gespeicherte, noch nicht aufgelöste Titelpins bleiben auf Start sichtbar; der fehlende Katalog wird gezielt angefordert. |
| KD-REV-E01-002 | ERLEDIGT | BEHALTEN | Die nächsten fünf Kinopins bleiben am Jahreswechsel tatsächlich die nächsten fünf. |
| KD-REV-E02-001 | ERLEDIGT | BEHALTEN | Verspätete Refresh-Ergebnisse stellen ausgeloggte Sitzungen nicht wieder her und beschädigen keinen späteren Login. |
| KD-REV-E02-002 | ERLEDIGT | BEHALTEN | Ein serverseitig abgelehnter, lokal frischer Bearer kann nach 401 tatsächlich erneuert werden. |
| KD-REV-E02-003 | ERLEDIGT | BEHALTEN | Ein fehlgeschlagener RLS-Prüflauf hinterlässt seine eigenen Proben nicht unnötig. |
| KD-REV-E03-001 | ERLEDIGT | BEHALTEN | Ein alter Pull kann einen inzwischen bestätigten neueren Kontowert nicht zurücksetzen. |
| KD-REV-E03-002 | ERLEDIGT | BEHALTEN | Ein leeres oder sparsames Konto erhält keine Gastreste beim Login. |
| KD-REV-E03-003 | ERLEDIGT | BEHALTEN | Der positive Löschschutztest erreicht wieder seine eigentlichen Folgeprüfungen. |
| KD-REV-E04-001 | ERLEDIGT | BEHALTEN | Blogabgleich verwechselt gleichnamige Remakes oder Werkarten weniger leicht. |
| KD-REV-E04-002 | ERLEDIGT | BEHALTEN | Bearbeitete KI-Vorschläge erhalten einen zum endgültigen Inhalt passenden Status und Herkunftstext. |
| KD-REV-E04-003 | ERLEDIGT | BEHALTEN | Ein Must-Watch-Masterlink führt trotz zuvor gesetzter Mediathekfilter zu einer sichtbaren geöffneten Karte. |
| KD-REV-E04-004 | ERLEDIGT | BEHALTEN | Eine Jahreszahl lässt sich schrittweise bearbeiten, ohne bei jedem Tastendruck gelöscht zu werden. |
| KD-REV-E04-005 | ERLEDIGT | BEHALTEN | Teilweise gespeicherte Stapel verlieren weder die fehlgeschlagenen Eingaben noch erzeugt Retry Dubletten. |
| KD-REV-E04-006 | ERLEDIGT | BEHALTEN | Der im Blog sichtbare Werktyp entspricht beim Anlegen dem gespeicherten Typ. |
| KD-REV-E05-001 | ERLEDIGT | BEHALTEN | Gemischte Kataloggenerationen können entfernte Streamingangebote nicht als aktuell wiederbeleben. |
| KD-REV-E05-002 | ERLEDIGT | BEHALTEN | Serien erhalten passende bestätigte Fakten statt durch eine falsche RPC-Werkart leer auszugehen. |
| KD-REV-E05-003 | ERLEDIGT | BEHALTEN | Falsylegacy-IDs werden tatsächlich ersetzt; neu angelegte Sonderzeichentitel bleiben erreichbar. |
| KD-REV-E06-001 | ERLEDIGT | BEHALTEN | Progressive Streamingseiten zeigen abgelaufene Quellen nicht mehr als aktuell. |
| KD-REV-E06-002 | ERLEDIGT | BEHALTEN | Gelöschte Mediathekeinträge blockieren erneutes Anlegen aus Streaming nicht mehr. |
| KD-REV-E06-003 | ERLEDIGT | BEHALTEN | Persönliche Neu-Fenster werden nach abgeschnittenen Quelldiffs nicht neu gestartet. |
| KD-REV-E07-001 | ERLEDIGT | BEHALTEN | Film und Serie mit gleicher TMDB-Nummer blenden sich nicht gegenseitig als gesehen aus. |
| KD-REV-E07-002 | ERLEDIGT | BEHALTEN | ÖFI-Titel können mit belegter Identität sicher in aktuelle Kinokarten einfließen. |
| KD-REV-E08-001 | ERLEDIGT | BEHALTEN | Ein gespeicherter Geschwisterfund bleibt bei teilweisem Speicherfehler nutzbar und sichtbar. |
| KD-REV-E08-002 | ERLEDIGT | BEHALTEN | Gleichzeitige Plattformstarts überschreiben einander nicht mehr. |
| KD-REV-E08-003 | ERLEDIGT | BEHALTEN | Eigene Personenabos lassen sich auch bei leerem Suchkatalog entfernen. |
| KD-REV-E08-004 | ERLEDIGT | BEHALTEN | Gültige Freitextabos mit IDähnlichem Inhalt machen den gesamten Feed nicht mehr unlesbar. |
| KD-REV-E08-005 | ERLEDIGT | BEHALTEN | Der Smokevertrag akzeptiert zulässige drei oder vier Freitext-Websuchen. |
| KD-REV-E09-001 | ERLEDIGT | BEHALTEN | Weitere Angaben ergänzen bestätigte Profilfilme, statt still den Bestand zu ersetzen. |
| KD-REV-E09-002 | ERLEDIGT | BEHALTEN | Heute-/Morgen-Kinosuche verwechselt den6. nicht mit16. oder26. |
| KD-REV-E09-003 | ERLEDIGT | BEHALTEN | Kino-Restfilme außerhalb des angefragten Tages verschwinden vor Ranking und Limit. |
| KD-REV-E09-004 | ERLEDIGT | BEHALTEN | Vier vermeintlich grüne Asyncprüfungen laufen jetzt tatsächlich. |
| KD-REV-E10-001 | ERLEDIGT | BEHALTEN | Null und andere nicht objektförmige JSONrequests enden kontrolliert vor allen Außenwirkungen. |
| KD-REV-E10-002 | ERLEDIGT | BEHALTEN | Ein nach Headern gescheiterter Modellkatalog wird nicht mehr als erfolgreicher leerer Katalog verbucht. |
| KD-REV-E10-003 | ERLEDIGT | BEHALTEN | Öffentliche Quellenadapter können nicht mehr nach erfolgreichen Headern unbegrenzt am Body hängen. |
| KD-REV-E10-004 | ERLEDIGT | BEHALTEN | Gleiche TMDB-Nummern verschiedener Werkarten teilen keinen Filmwissenbericht oder laufenden Request. |
| KD-REV-E11-001 | ERLEDIGT | BEHALTEN | Sichtbare Standardanzahl12 begrenzt den Reminder tatsächlich auf12 Termine. |
| KD-REV-E11-002 | ERLEDIGT | BEHALTEN | Persönlich empfohlene Kinokarten sind über Suche und Pinboard genauso erreichbar wie neutrale Karten. |
| KD-REV-E11-003 | ERLEDIGT | BEHALTEN | Legacy-Alles verknüpft widersprüchliche Werke nicht mehr allein über eine passende IDnummer. |
| KD-REV-E11-004 | ERLEDIGT | BEHALTEN | Persönliche Kinoreminder öffnen bei aktuellem Mediathekmatch die richtige Filmkarte. |
| KD-REV-E11-005 | ERLEDIGT | BEHALTEN | Leere Remindertitel verursachen weder stillen Verlust noch unhandledRejection. |
| KD-REV-E12-001 | ERLEDIGT | BEHALTEN | Radarvorschau und Schließenfläche bleiben an den Tabletgrenzen im Viewport. |
| KD-REV-E12-002 | ERLEDIGT | BEHALTEN | Kino- und Streamingdetails sind direkt mit Tastatur erreichbar. |
| KD-REV-E12-003 | ERLEDIGT | BEHALTEN | Schmale Wochenplaneditoren haben tatsächlich getrennte bedienbare Tagesflächen. |
| KD-REV-E13-001 | ERLEDIGT | BEHALTEN | Ein gerade entstandener Backlog wird vom Workflow als Rückstand statt falscher Vertragsfehler gemeldet. |
| KD-REV-E13-002 | ERLEDIGT | BEHALTEN | Abgelaufene Mailratefenster können begrenzt verschwinden, ohne alte Versandoperationen erneut freizugeben. |
| KD-REV-E13-003 | ERLEDIGT | BEHALTEN | Functionhash und Dirtyprüfung übersehen keine lokal transitiv importierten Module mehr. |
| KD-REV-E13-004 | ERLEDIGT | BEHALTEN | Der Browsergate prüft wieder den tatsächlich gewollten Hilfehero und erreicht Folgeassertionen. |
| KD-REV-E14-001 | ERLEDIGT | BEHALTEN | Radar-Faktenlookup erhält das bereits vorhandene verifizierbare Werkjahr. |
| KD-REV-E14-002 | ERLEDIGT | BEHALTEN | Katalog neu laden aktualisiert auch einen noch frischen progressiven Seitenrecord. |

## Bestätigte offene Auslieferungsverträge

Staging und Produktion teilen laut Master das Supabaseprojekt `bscjgwcntapobyxsiyce`; sechs neue Migrationen sind noch nicht remote. Der vorhandene Radar-V1bestand und die fehlenden TMDB-Filmwissenaltkennungen ändern die folgenden Request-/Readerverträge nicht. Diese Zustandsangaben wurden hier nicht remote gelesen.

### R-OFI — KD-REV-E07-002

**OFFEN / KORRIGIEREN.** Eigene repro-oefi-compat.mjs führt echten Kandidatenproducer/Resolver mit lokalen Antworten aus und lädt den Baseline-Browservertrag. Format8 und9: jeweils50 Items, eine Annotation, neuer Leser true, alter false/feed-shape-invalid. Nach Entfernen nur von annotations akzeptiert alter Leser denselben Feed.

Erhaltener Vertrag: Neue Leser brauchen die sichere ÖFIidentität; alte Leser müssen weiterhin ihren bisherigen gültigen50er-Feed erhalten.
Empfehlung: Explizite kompatible Leseprojektion beziehungsweise versionierter Readvertrag, der alten Lesern annotations nicht liefert; neue Writer/SQL erst innerhalb dieses Übergangs aktivieren. Reines frontend-first reicht für offene/offline Altclients ohne zusätzlichen Gültigkeitsvertrag nicht als vollständiger Nachweis.

Nötiger Nachweis: Matrix alt/neu Writer, Persistenz und Reader für8/9; alter Feed ohne Annotation bleibt lesbar; neuer Reader erhält sichere ÖFIkarte; Programme ohne Beleg bleiben ausgeschlossen.
Neue Kopplung/Kosten: Version/Capability muss am wirklichen Feedread bekannt sein; sonst getrennte Ablage/Version nötig. Noch kein getesteter Patch und keine Freigabe.

Betroffene Dateien: [supabase/functions/entdecken-daily-task/runner.js](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/entdecken-daily-task/runner.js), [supabase/functions/entdecken-daily-task/contract.js](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/entdecken-daily-task/contract.js), [src/lib/webDiscoveryFeed.js](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/webDiscoveryFeed.js), [supabase/migrations/20260917130000_review_entdecken_ofi_identity.sql](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917130000_review_entdecken_ofi_identity.sql).

### R-RADAR — KD-REV-E08-002

**OFFEN / KORRIGIEREN.** Kandidatvalidator akzeptiert release:v[12], Baseline nurv1. Migration ersetzt V1schlüssel aller Textfunde durch V2, behält Finding-/Eventversion-IDs und akzeptiert alte Writer. Master meldet26 reale V1-Funde; diese Bestandszahl wurde hier nicht remote gelesen.

Erhaltener Vertrag: Zwei Plattformstarts müssen erhalten bleiben; alte stabile Eventidentitäten und Altclient-Lesbarkeit dürfen nicht durch bloße Writerkompatibilität ersetzt werden.
Empfehlung: Interne V2-Plattformidentität und explizit kompatible Altclient-Feedprojektion prüfen; alternativ nachgewiesener Clientversionszaun mit entsprechend sichtbarer Altclientbehandlung. Nicht die neue Identität zurückdrehen, da sonst Plattformverlust zurückkommt.

Nötiger Nachweis: V1bestand migrieren, alte/neue Feedreader, zwei Plattformen, Pause/Remove/Reviews und idempotenter Replay über Versionsgrenzen.
Neue Kopplung/Kosten: Feedprojektion und Schlüsselidentität müssen konsistent versioniert werden. Keine blanket Zusage, dass ein simples Umbenennen des V2präfixes den Hash-/IDvertrag erfüllt.

Betroffene Dateien: [supabase/functions/radar-websearch-task/contract.js](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/radar-websearch-task/contract.js), [supabase/migrations/20260917100000_review_radar_text_identity.sql](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917100000_review_radar_text_identity.sql), [src/lib/radarPilotContracts.js](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/radarPilotContracts.js).

### R-TMDB — KD-REV-E10-004

**OFFEN / KORRIGIEREN.** Neue Helper senden movie:/tv:-Werte, alter Normierer akzeptiert nur Numeric. Neuer SQLnormierer akzeptiert nur Typed; Baselineclient sendet Numeric. Master meldetkeine vorhandenen TMDB-Filmwissenkennungen, was Datenmigration vereinfacht, aber den Requestbruch nicht löst.

Erhaltener Vertrag: Keine Film/Serien-Verwechslung; gültiger IMDb-/Film-TMDBnutzen und unabhängige persönliche Prognose bleiben nutzbar.
Empfehlung: Explicitly typed neuer Vertrag plus serverseitige kontrollierte Legacybehandlung, die Numeric nicht blind als Serie oder Film rät. Altrequests ohne sichere Werkart kontrolliert ausgrenzen oder gesicherte Filmzuordnung prüfen. Gemeinsames zeitgleiches Deploy ist bei offenen/offline Clients kein Vertrag.

Originalticket erlaubt einen guard-first Umfang: Serien-TMDB vor Cache/Adapter stoppen, Cachetyp prüfen und Numeric-Filmvertrag vorerst erhalten. Das könnte Typmigration/Trigger/mehrere Spezialfälle ersparen, verzichtet aber auf getrennte Typed-Cacheadressen und verlangt besonders sichere Alt-Mappingbehandlung. Es ist eine Scopeentscheidung, kein bereits belegter besserer Patch.

Nötiger Nachweis: Alt/neu Client gegen alt/neu Function+SQL; Film/Serie gleiche Nummer; IMDbmiss plus TMDBfallback; falscher Cachetyp; persönliche Prognose ohne Filmwissen; keine versehentliche Umdeutung von Numeric.
Neue Kopplung/Kosten: Ein Übergangsadapter kostet weniger als unkontrollierte globale Client/Server-Kopplung, muss aber nach Ende des Altvertrags bewusst entfernt werden.

Betroffene Dateien: [src/lib/filmwissen.js](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/filmwissen.js), [src/services/filmwissen.js](/private/tmp/kd-review49-benefit-audit-20260917/src/services/filmwissen.js), [supabase/functions/ai-task/index.ts](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/ai-task/index.ts), [supabase/migrations/20260917110000_review_filmwissen_identity.sql](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917110000_review_filmwissen_identity.sql).

Eigener reproduzierbarer Zusatzbeleg: [Script](repro-oefi-compat.mjs), [Ergebnis](repro-oefi-compat.json). Der alte Validator wurde aus dem Basiscommit gelesen; nur der notwendige Importpfad wurde auf die bytegleiche lokale Datendatei umgebunden. Alle externen Fetches sind gesperrt beziehungsweise durch injizierte lokale Antworten ersetzt.

## Gemeinsame Ursachen und kleinere Alternativen

### E02-001, E02-002, E03-001, E03-002

Gemeinsamer Knoten: authDriver Credentialcommit; accountDriver Remoteübernahme; uebernahme Transition.
Asynchrone Arbeit wurde gegen überholte Identität/Revision oder unvollständigen Bestand übernommen.
Die Ursache ist verwandt, aber die Schreibknoten und Bedeutungen sind verschieden: Logininstanz, Remote-Revision und vollständige Adoption dürfen nicht ein generischer boolean-current-Guard werden.

E02-001/E02-002 sind bereits in derselben Refresh-/Commitlogik vereint. Eine globale Async-Transaktionsabstraktion würde Auth, Gastrestore und Datentopfsync neu koppeln, ohne nachgewiesene Sonderfälle zu entfernen.
BEHALTEN; kein zusätzlicher gemeinsamer Zustandsmanager. Cross-tab/401/Pull/Adoption-Proben getrennt erhalten.

### E04-001, E05-003, E06-002, E07-001, E08-002, E10-004, E11-003, E14-001

Gemeinsamer Knoten: Projektion und Bestätigung von Werkidentität an verschiedenen Datenverträgen.
Typ, Jahr, Plattform oder echte aktuelle Bestandszugehörigkeit ging bei Projektion/Schlüsselbildung verloren.
Gleiche allgemeine Fehlerklasse bedeutet keine identische fachliche Identität: Releaseplattform, persönliche Master-ID, TMDB-Namespace und ÖFI-Quellbeleg sind unterschiedliche Verträge.

E06-002/E11-003 teilen bereits ordneStreamingPageTitelZu und gecachten erstelleMediathekIdentitaetsIndex. Dadurch entfallen widersprüchliche Status-/Navigationsentscheidungen; Revert würde die belegten Konflikte wieder öffnen.
BEHALTEN; kein Universal-IDresolver. Gemeinsamen bestehenden Mappingknoten weiter durch Delete/Recreate, Remakes, Typ-/Jahr-/IDkonflikte prüfen.

### E05-002, E14-001

Gemeinsamer Knoten: kd_radar_websearch_context → readCachedTitleFactsContext → kd_title_facts_lookup.
An der gemeinsam genutzten Faktensuche fehlte je eine notwendige Information: korrektes Werkartvokabular und gespeichertes Bezugsjahr.
Ein reiner Readerpatch kann ein im SQLkontext nicht geliefertes Jahr nicht wiederherstellen; ein reiner SQLpatch korrigiert keine serie/series-Serialisierung.

Die zwei schmalen Änderungen sind bereits das kleinere gemeinsame Ergebnis. Einen neuen Enricher vor den Reader zu setzen würde zusätzliche Kopplung und potenzielle Requests erzeugen.
BEHALTEN; gemeinsame produktnahe SQL→Reader→Adapter-Prüfung ist vorhanden und frisch grün.

### E09-002, E09-003

Gemeinsamer Knoten: gesuchteKinoTage und passendeKinoZeiten in src/lib/finder.js.
Master- und Restzweig hatten divergierende beziehungsweise fehlende harte Tagesfilter.
Eine kleine gemeinsame Korrektur ersetzt tatsächlich zwei lokale Datumsentscheidungen und ist bereits integriert.

Keine weitere Kalenderabstraktion: bestehender normalisierter Anzeigevertrag genügt. Universalparser brächte Zeitzonen-/Formatkopplung ohne ticketbezogenen Nutzen.
BEHALTEN; Heute/Morgen, Fulltoken, DST/Jahreswechsel und direkter Titelby-pass sind getrennte Kontrollfälle.

### E04-002, E09-001, E04-005

Gemeinsamer Knoten: Bewertungsinhalt, Profilrahmenannahme und kandidatenweises Stapelergebnis.
Einstiegs-/Teilerfolgsflags ersetzten teilweise die Prüfung des endgültig gespeicherten Inhalts.
E04-002 teilt bereits den reinen Bewertungsvergleich; E09-001 vereinigt am einen finalen Rahmenknoten; E04-005 speichert pro Kandidat. Das sind die tatsächlichen Bestätigungsgrenzen.

Generischer Merge-and-save-Helfer würde Profilidentität, Bewertungssemantik und Batchfehlerstatus vermischen; keine nachgewiesene Zeilen- oder Sonderfallersparnis.
BEHALTEN; keine zusätzliche Persistenzabstraktion.

### E01-001, E04-003, E11-002, E11-004, E12-002

Gemeinsamer Knoten: Start-Projektion → Appnavigation → lokale Fokus-/Disclosurezustände.
Eine Anzeige-/Navigationsvariante verlor vorhandene Identität oder quittierte vor sichtbarem Ziel.
Ein Pin kann ausstehend sein, ein Fokus braucht sichtbares DOM, ein Reminder aktuelle Quelle. Diese Unterschiede sind produktrelevant.

Ein gemeinsamer Navigationscontroller würde mehrere Tabzustände neu koppeln. Aktuell reichen unveränderte Appcallbacks plus lokale sichtbare Zielguards und native Buttons.
BEHALTEN; dieselben Nutzerwege komponentenübergreifend testen, keinen Routerumbau beginnen.

### E06-001, E06-003, E14-002, E05-001

Gemeinsamer Knoten: Streamingpage-Kontext/Fristen plus eigenständiges Known/Discover-Paar.
Quellgeneration, fachlicher Ablauf, persönlicher Verbrauch und manuelle Refreshabsicht sind unabhängige Informationen, die vorher nicht vollständig weitergetragen wurden.
Ein einzelner Cache-TTL oder globales Leeren kann diese vier Verträge nicht korrekt ersetzen.

sourceExpiresAt, newAnchors und Refreshrevision sind zielgenaue Felder am bestehenden Controller. Zusammenlegung der SQLmigration ist bereits erfolgt; alte Migrationen zu editieren wäre kein sicherer Vereinfachungsschritt.
BEHALTEN; keinen pauschalen Vollkatalogrefresh einführen. Anker-Requery ist begrenzt belegt.

### E10-002, E10-003

Gemeinsamer Knoten: Bodylesedauer und Abschluss des Modell-/Quellentransports.
HTTPheader wurden zu früh als Ende des relevanten Vorgangs behandelt.
Gemeinsames Prinzip, aber verschiedene Aufräum-/Kostenverträge: öffentlicher Quellenreader versus protokollierte Diagnosereservierung.

Ein neuer Fetchwrapper müsste Ressourcen-, Fehler- und Kostenklassen angleichen und würde bestehende Sicherheitsgrenzen koppeln.
BEHALTEN; Timerlebensdauer und vollständige Erfolgsstruktur an ihren bestehenden Knoten halten.

### E02-003, E03-003, E08-005, E09-004, E13-001, E13-003, E13-004

Gemeinsamer Knoten: Verschiedene Prüfwerkzeuge lesen oder erzeugen den Produktvertrag.
Test-/Workflowvertrag driftete vom Produkt, war unvollständig oder lief gar nicht.
Nicht sieben Produktdefekte. Die Änderungen erhöhen Beweiskraft und Zuverlässigkeit der Werkzeuge; sie rechtfertigen keine gemeinsame neue Testplattform.

Gezielte Originalcodeausführung, Sentinels, Closuregraph und gültige Fixture sind jeweils bereits die kleineren Korrekturen.
BEHALTEN; Assertions weder pauschal lockern noch alte Solltexte zurücknehmen.

## Einzelabgleich aller Abnahmen

### KD-REV-E01-001 · Gespeicherter Titel-Pin bleibt nach frischem Start unsichtbar

**ERLEDIGT · BEHALTEN.** Gespeicherte, noch nicht aufgelöste Titelpins bleiben auf Start sichtbar; der fehlende Katalog wird gezielt angefordert.
Ursprüngliche Ursache: Die bedarfsgesteuerte Katalogladung ist für Titel-Pins nicht bis zum Start-Pinboard verdrahtet:
Verhalten: Ein ausstehender Zustand und höchstens ein Vollabruf je Owner/Mount kommen hinzu.
Risiko und Komplexität: Der erste betroffene Start kann einen großen Vollkatalog laden. Offline oder bei Mehrdeutigkeit bleibt der Pin ausstehend; kein Löschrisiko und keine behauptete Auflösung.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E01-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E01/KD-REV-E01-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/tabs/StartTab.jsx:228](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/StartTab.jsx:228), [src/tabs/StartTab.jsx:241](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/StartTab.jsx:241), [src/App.jsx:1559](/private/tmp/kd-review49-benefit-audit-20260917/src/App.jsx:1559).
Frische Belege: [review49_p10b_browser_test.log](review49_p10b_browser_test.log).

1. **ERLEDIGT** — Ein frischer Online-Start mit gültigem bestätigtem Format-1-Pin außerhalb Known/Kino zeigt entweder den Pin oder einen zutreffenden ausstehenden Zustand – nie „Noch leer“ für diesen vorhandenen Bestand.
   Nachweis: Frischer Mount zeigt den gespeicherten ausstehenden Pin statt leer.
2. **ERLEDIGT** — Nach erfolgreicher gezielter Auflösung ist der Pin ohne vorherigen Fachbereichsbesuch sichtbar und navigiert zum korrekten Werk.
   Nachweis: Verzögerte Antwort löst den Pin auf; Klick führt zu Watchmode 901.
3. **ERLEDIGT** — Fehlende, fehlerhafte oder mehrdeutige Katalogantworten löschen keinen Pin und behaupten keine erfolgreiche Auflösung.
   Nachweis: Missing, Fehler und Mehrdeutigkeit erhalten identische Speicherbytes.
4. **ERLEDIGT** — Ein leerer Pinbestand löst keinen unnötigen Vollkatalogabruf aus; vorhandene Katalogtreffer sowie Must-Watch- und Kinopins behalten ihr Verhalten.
   Nachweis: Leerbestand, Known-Treffer, Must-Watch und Kinopins vermeiden den Zusatzabruf.
5. **ERLEDIGT** — Ein fokussierter gemounteter Regressionstest deckt Speichern, frischen Start und verzögerte Katalogdaten mit Mock-Konto ab.
   Nachweis: Echter StartTab und Pin-Hook mit extrahierten unveränderten App-Callbacks durchlaufen Save/Unmount/Remount in beiden Browsern.

### KD-REV-E01-002 · Start-Pinboard sortiert Januartermine vor Dezember und kann den nächsten Termin ausblenden

**ERLEDIGT · BEHALTEN.** Die nächsten fünf Kinopins bleiben am Jahreswechsel tatsächlich die nächsten fünf.
Ursprüngliche Ursache: `pinSortWert` extrahiert aus dem formatierten Termin ausschließlich Monat, Tag und Uhrzeit. Jahr und Bezugsdatum fehlen, also ist jeder Januarwert kleiner als jeder Dezemberwert. `StartDashboard` formatiert zuerst, sortiert mit diesem Schlüssel und schneidet danach auf fünf Einträge.
Verhalten: Sortiert den Rohtermin einschließlich Jahr vor Formatierung und Limit.
Risiko und Komplexität: Sehr kleine lokale Projektion. Ungültige Termine stehen weiterhin hinten; keine neue globale Datumsschicht.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E01-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E01/KD-REV-E01-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/tabs/StartTab.jsx:156](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/StartTab.jsx:156), [src/tabs/StartTab.jsx:190](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/StartTab.jsx:190).
Frische Belege: [review49_p09_product_test.log](review49_p09_product_test.log).

1. **ERLEDIGT** — Bei festem 31.12.2026 10:00 Europe/Vienna und den sechs nach echter Programmnormierung gültigen Fixtures zeigt das Pinboard Film 0, 1, 2, 3, 4; Film 5 entfällt durch das Limit.
   Nachweis: Normierte sechs Programmeinträge liefern am festen 31.12. die erwarteten ersten fünf.
2. **ERLEDIGT** — Bei zwei gültigen Pins vom 31.12. und 01.01. steht der Dezembertermin zuerst.
   Nachweis: Dezembertermin steht vor Januar.
3. **ERLEDIGT** — Gleichjährige Pins bleiben nach Tag und Uhrzeit korrekt geordnet; die Fünfergrenze bleibt bestehen.
   Nachweis: Gleichjähriges Datum, Uhrzeit und Limit bleiben geprüft.
4. **ERLEDIGT** — Katalogauflösung und Ablaufprüfung bleiben aktiv; kein fehlender Programmtreffer wird künstlich zur Testerfüllung verwendet.
   Nachweis: Echte Programmnormierung und Katalogauflösung laufen mit; fehlende Treffer werden nicht künstlich erzeugt.
5. **ERLEDIGT** — Falls ein gemeinsamer Parser verwendet wird, berücksichtigt er ISO-Terminjahre vor der Anzeigeformatierung und erhält die bestehende lokale Uhrzeitsemantik.
   Nachweis: Bestehender kinoPinTermin liest das ISO-Jahr vor der Anzeigeumwandlung.

### KD-REV-E02-001 · Verspäteter Tokenrefresh kann abgemeldete oder neue Sitzung überschreiben

**ERLEDIGT · BEHALTEN.** Verspätete Refresh-Ergebnisse stellen ausgeloggte Sitzungen nicht wieder her und beschädigen keinen späteren Login.
Ursprüngliche Ursache: Die Operation hält nur die vor `await` gelesene Sitzung `frisch` fest. Die Antwortprüfung bindet sie an Konto-ID und Mail von A, prüft aber nicht, ob der lokale Schlüssel oder eine Operationsgeneration seit Requestbeginn gewechselt hat. Der Commit geschieht danach direkt. Der Web-Lock schützt ausschließlich Refreshs; `signIn` und `signOut` nehmen ihn nicht. Auth-Service-Generationen schützen nur die spätere Snapshot-Publikation, nicht die bereits erfolgte Treibermutation. Die Coordinator-Queue umfasst zudem keinen direkten Tokenabruf eines anderen Dienstes und existiert pro Instanz.
Verhalten: Logininstanz plus Credentialversion binden jeden Commit; kurze IDB-Transaktion serialisiert browserübergreifend.
Risiko und Komplexität: Höchste zusätzliche Clientkomplexität der Serie. Bei fehlendem sicherem Browsermutex werden Credential-Commits bewusst abgelehnt. HTTP liegt außerhalb des Mutex; alte Browser ohne diesen Commitvertrag bleiben ein gemischter Clientfall.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E02-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E02/KD-REV-E02-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/authDriver.js:109](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/authDriver.js:109), [src/lib/authDriver.js:352](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/authDriver.js:352), [src/lib/authDriver.js:395](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/authDriver.js:395).
Frische Belege: [authdriver.log](authdriver.log), [review49_p01_browser_test.log](review49_p01_browser_test.log).

1. **ERLEDIGT** — Ein ausstehendes direktes `getAccessToken(A)` plus abgeschlossener Coordinator-Logout darf nach spätem Erfolg keinen Sessionkey wiederherstellen; Resume bleibt Gast.
   Nachweis: Late Success nach Logout lässt Sessionkey gelöscht; Resume bleibt Gast.
2. **ERLEDIGT** — Ein B-Sign-in über einen anderen Coordinator darf durch späten A-Erfolg und `invalid_grant` weder ersetzt noch gelöscht werden; B bleibt nach Resume angemeldet.
   Nachweis: Neuer B-Login überlebt späten A-Erfolg und invalid_grant.
3. **ERLEDIGT** — Der Schutz deckt Logout plus erneuten Login desselben Kontos und den Mehrtab-Fall ab; seine Operationsidentität ist stärker als die Konto-ID.
   Nachweis: Neue Sitzungs-ID trennt auch erneuten Login desselben Kontos; native Zwei-Tab-Tests laufen mit und ohne Web Locks.
4. **ERLEDIGT** — Bei unveränderter aktueller Sitzung rotiert ein gültiger Refresh weiter normal; `invalid_grant` entfernt nur diese Sitzung, Netzwerkfehler erhalten sie, und der bestehende Single-Flight-Vertrag bleibt bestehen.
   Nachweis: Normale Rotation, terminales invalid_grant, Offlineerhalt und Single-Flight bleiben positiv/negativ geprüft.
5. **ERLEDIGT** — Tests verwenden den echten Auth-Treiber mit verzögerten Mock-Antworten und prüfen Persistenz sowie UI-Snapshot. Shared-Lock-/Fallback-Fälle und ein nachfolgendes Resume sind enthalten.
   Nachweis: 39 Authprüfungen und 18 native Browserfälle prüfen echte Persistenz, Snapshot, Mutex/Fallback und Resume.

### KD-REV-E02-002 · Erzwungener Refresh nach HTTP 401 kann dasselbe Token wiederverwenden

**ERLEDIGT · BEHALTEN.** Ein serverseitig abgelehnter, lokal frischer Bearer kann nach 401 tatsächlich erneuert werden.
Ursprüngliche Ursache: Das Force-Flag wird in `getAccessToken` nicht an `refresh` oder `refreshIntern` übergeben. `refreshIntern` verwendet seinen Ablauf-Schnellpfad ohne Force-Kontext. Dieser Schnellpfad ist für die sinnvolle Übernahme eines bereits von einem anderen Tab rotierten Tokens gedacht, kann aber nicht zwischen einem tatsächlich anderen Bearer und genau dem gerade serverseitig abgelehnten Bearer unterscheiden.
Verhalten: Force trägt die Identität des abgelehnten Tokens bis zum Refresh; ein inzwischen anderer gültiger Bearer darf übernommen werden.
Risiko und Komplexität: Teilt den Commitvertrag mit E02-001. Zusätzliche Rotation entsteht nur für den abgelehnten Bearer; keine unbeschränkte Retrystufe.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E02-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E02/KD-REV-E02-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/authDriver.js:352](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/authDriver.js:352), [src/lib/authDriver.js:395](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/authDriver.js:395).
Frische Belege: [authdriver.log](authdriver.log), [review49_p01_browser_test.log](review49_p01_browser_test.log).

1. **ERLEDIGT** — Nach erstem REST-401 eines lokal noch mehr als fünf Minuten gültigen Tokens und mit gültigem Refresh-Token erfolgt genau ein Refresh-HTTP-Request und genau ein Retry mit neuem Bearer.
   Nachweis: 401 führt zu genau einem Refresh und einem REST-Retry mit neuem Bearer.
2. **ERLEDIGT** — Derselbe Nachweis gilt mit und ohne Web-Lock sowie bei hinter Serverzeit liegender Geräteuhr; eine manuell manipulierte gespeicherte Sitzung ist nicht die einzige Reproduktion.
   Nachweis: Web-Lock-/Fallback- und Uhrversatzfälle sind im Authgestell enthalten.
3. **ERLEDIGT** — Ein im Lock sichtbar von anderem Tab erneuerter Bearer wird ohne unnötige Rotation übernommen; Konto-ID-/Kontextwechsel brechen sicher ab.
   Nachweis: Im Lock erneuerter Token wird übernommen; Konto-/Loginwechsel wird abgebrochen.
4. **ERLEDIGT** — Normale frische Tokens ohne Force verursachen keinen Auth-Request. Parallele reguläre und erzwungene Erneuerungen erzeugen keinen Refresh-Sturm und verlieren die erzwungene Erneuerung nicht.
   Nachweis: Regulär frischer Token bleibt requestfrei; regulärer/erzwungener paralleler Lauf verliert Force nicht.
5. **ERLEDIGT** — Bleibt der neue Bearer bei 401 oder ist die Sitzung nicht erneuerbar, endet der Account-Versuch begrenzt: kein Endlos-Retry, keine falsche Erfolgsmeldung und keine lokale Datenlöschung.
   Nachweis: Zweites 401 und fehlende Erneuerbarkeit enden begrenzt und ohne lokale Datenlöschung.

### KD-REV-E02-003 · Transportfehler im RLS-Test überspringt die Bereinigung eigener Testproben

**ERLEDIGT · BEHALTEN.** Ein fehlgeschlagener RLS-Prüflauf hinterlässt seine eigenen Proben nicht unnötig.
Ursprüngliche Ursache: `rest` erwartet die Fetch-Antwort direkt; nur Fehler beim JSON-Lesen werden gefangen. Die T7/T3-Sequenz läuft als Top-Level-`await` ohne umschließendes `try/finally`; Cleanup und Probenverwaltung werden erst weit danach erreicht. Die dort vorhandene Account-/Key-/Wertprüfung kann nach der Rejection deshalb nicht wirken. Der normale Wrapper startet dieses Skript als Kindprozess und propagiert dessen Exit; sein `finally` gibt für den RLS-Modus nur einen nicht belegten KI-Lock frei, ohne Datenbereinigung.
Verhalten: Probeabsicht wird vor dem Write registriert; gemeinsames finally bereinigt jede Probe separat und wertgebunden.
Risiko und Komplexität: Mehr Testwerkzeugcode und gezielte Cleanup-Reads. Unklare/geänderte Daten werden erhalten; Cleanupfehler bleiben sichtbar und dürfen den ursprünglichen Fehler nicht grün machen.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E02-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E02/KD-REV-E02-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [tools/rls_test_personal.mjs:375](/private/tmp/kd-review49-benefit-audit-20260917/tools/rls_test_personal.mjs:375), [tools/rls_test_personal.mjs:416](/private/tmp/kd-review49-benefit-audit-20260917/tools/rls_test_personal.mjs:416), [tools/rls_test_personal.mjs:932](/private/tmp/kd-review49-benefit-audit-20260917/tools/rls_test_personal.mjs:932).
Frische Belege: [review49_p03_rls_test.log](review49_p03_rls_test.log).

1. **ERLEDIGT** — Mit vollständig gemocktem Fetch: T7 ist erfolgreich, T3 wirft einmalig; As eigene Probe wird danach account-/key-/wertgebunden gelöscht und der Lauf endet weiterhin fehlerhaft.
   Nachweis: T3-Abbruch nach erfolgreichem Write räumt As eigene Probe auf und endet weiter rot.
2. **ERLEDIGT** — Ist ein Cleanup-Request nicht erreichbar oder fehlerhaft, werden weitere registrierte Proben trotzdem separat behandelt; nicht entfernte Proben erhalten sichere Zuordnung und Fehlerstatus.
   Nachweis: Fehlgeschlagenes Cleanup verhindert andere Bereinigungen nicht; sichere Probezuordnung bleibt im Fehler.
3. **ERLEDIGT** — Vorhandene oder zwischenzeitlich geänderte Werte werden nie gelöscht; Freitopf- und Rollen-Guards bleiben aktiv.
   Nachweis: Fremde/geänderte Werte und vorhandene Profile werden erhalten.
4. **ERLEDIGT** — Nach erfolgreicher Abbruchbereinigung kann ein Folgelauf denselben zuvor freien Topf wieder nutzen. Ein Abbruch vor der ersten Probe löst keine Löschung fremder Daten aus.
   Nachweis: Abbruch vor Erstprobe löscht nichts; Folgeausführung kann den bereinigten Topf nutzen.
5. **ERLEDIGT** — Beim regulären Abschluss werden eigene A-/B-/Profil-/Shared-Proben weiter bereinigt und vorhandene Profildaten bewahrt.
   Nachweis: Tatsächlich ausgeführtes Original-CLI mit Mockfetch deckt normalen A/B/Profil/Shared-Abschluss ab.

### KD-REV-E03-001 · Verspäteter Pull setzt bestätigten Kontostand zurück

**ERLEDIGT · BEHALTEN.** Ein alter Pull kann einen inzwischen bestätigten neueren Kontowert nicht zurücksetzen.
Ursprüngliche Ursache: Der Pull wartet auf GET außerhalb der pro Schlüssel geführten Commit-Queue. Nach Rückkehr prüft er nur den aktuellen Fehler-/Pending-Zustand. Nach dem erfolgreichen Commit ist dieser leer; eine Prüfung auf `row.revision < getVer(key)` oder eine gleichwertige Pull/Write-Ordnung fehlt. Dadurch ersetzen die Zeilen 308–321 den Cache und die Revision mit der alten Antwort; Zeile 327 publiziert sie.
Verhalten: Vergleicht Remote-Revision vor Cache, Metadaten und Veröffentlichung.
Risiko und Komplexität: Kleine monotone Übernahmeprüfung im vorhandenen Driver. Sie ordnet Antworten, ohne alle Requests global zu serialisieren.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E03-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E03/KD-REV-E03-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/accountDriver.js:247](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/accountDriver.js:247), [src/lib/accountDriver.js:285](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/accountDriver.js:285).
Frische Belege: [review49_p02_pull_revision_test.log](review49_p02_pull_revision_test.log).

1. **ERLEDIGT** — Deferred GET(A/1), danach bestätigter PATCH(B/2), dann die alte GET-Antwort: Cache und bekannte Revision bleiben B/2; A wird nicht publiziert.
   Nachweis: Deferred GET Revision 1 nach PATCH Revision 2 lässt Wert und Revision 2 bestehen.
2. **ERLEDIGT** — Eine Folgemutation derselben Sequenz baut auf B auf und erzeugt keinen ausschließlich vom veralteten Pull verursachten Revisionskonflikt.
   Nachweis: Folgemutation baut auf dem bestätigten Wert auf.
3. **ERLEDIGT** — Ein tatsächlich neuerer Remote-Stand wird weiterhin übernommen und publiziert, sofern kein geschützter lokaler Zustand dagegensteht.
   Nachweis: Neuerer erlaubter Remote-Stand wird übernommen und publiziert.
4. **ERLEDIGT** — Noch ausstehende Writes, bestehende Konflikte, terminal abgelehnte Werte und Accountwechsel bleiben geschützt.
   Nachweis: Pending, Konflikt, Ablehnung und ungültiger Accountkontext bleiben geschützt.
5. **ERLEDIGT** — Ein zulässiges Überschreiben setzt weiterhin den erfolgreichen Snapshot voraus.
   Nachweis: Erfolgreicher Snapshot bleibt Voraussetzung des erlaubten Überschreibens.

### KD-REV-E03-002 · Kontoload übernimmt fehlende Server-Töpfe aus dem Gastcache

**ERLEDIGT · BEHALTEN.** Ein leeres oder sparsames Konto erhält keine Gastreste beim Login.
Ursprüngliche Ursache: Der Fehlende-Zeile-Zweig in `syncPull()` führt mit `continue` fort, ohne den lokalen Topf zu entfernen oder durch einen leeren Kontowert zu ersetzen. Die Adoptionsroutine sichert/bindet davor lediglich den Rückholpunkt. Die folgenden Owner-, Epoch- und Transitionprüfungen verifizieren die Kontobindung, nicht die vollständige Inhaltsgleichheit der persönlichen Töpfe.
Verhalten: Nur Kontoadoption ersetzt auch fehlende Remote-Töpfe; alltäglicher Pull bleibt erhaltend.
Risiko und Komplexität: Eine explizite Optionsweitergabe statt globaler Löschsemantik. Zusätzliche Null-/Löschreadbacks während des Übergangs; Fehler führen weiterhin zu Restore oder Privacy-Lock.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E03-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E03/KD-REV-E03-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/services/uebernahme.js:298](/private/tmp/kd-review49-benefit-audit-20260917/src/services/uebernahme.js:298), [src/services/uebernahme.js:319](/private/tmp/kd-review49-benefit-audit-20260917/src/services/uebernahme.js:319), [src/lib/accountDriver.js:247](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/accountDriver.js:247), [src/services/storage.js:212](/private/tmp/kd-review49-benefit-audit-20260917/src/services/storage.js:212).
Frische Belege: [review49_p02_account_load_test.log](review49_p02_account_load_test.log).

1. **ERLEDIGT** — Nichtleerer Gast plus Login in ein leeres Konto: `account-ready`, alle betroffenen persönlichen Töpfe sind leer/abwesend, der Store liefert keine Gastdaten und der Login erzeugt keine persönlichen Uploads.
   Nachweis: Leeres Konto wird ohne persönliche Uploads account-ready und zeigt keine Gasttöpfe.
2. **ERLEDIGT** — Nichtleerer Gast plus sparsames Konto: vorhandene Remote-Töpfe werden übernommen; fehlende Töpfe zeigen keine Gastreste; explizit leere Remote-Werte bleiben korrekt.
   Nachweis: Sparsames Konto übernimmt vorhandene Werte und entfernt fehlende Gastreste.
3. **ERLEDIGT** — Nach Kontoload neu angelegte oder bearbeitete Kontoinhalte enthalten keine alten Gastdatensätze, sofern keine ausdrückliche Gastübernahme gewählt wurde.
   Nachweis: Neue Kontoinhalte bauen auf dem bereinigten Konto auf.
4. **ERLEDIGT** — Rückholpunkt und Logout stellen die ursprünglichen Gastrohwerte bytegenau wieder her.
   Nachweis: Logout stellt den Gastrohbestand bytegleich wieder her.
5. **ERLEDIGT** — Fehler bei Snapshot, Pull oder lokaler Ersetzung aktivieren keinen gemischten Kontocache; Transition-, Owner- und Epoch-Grenzen bleiben wirksam.
   Nachweis: Snapshot-, Pull-, Silent-replace- und Restorefehler werden im echten Übernahme-/Driververbund erprobt.
6. **ERLEDIGT** — Normale Konto-Pulls bewahren echte ungesyncte Kontoänderungen; die explizite Gast-zu-Konto-Übernahme bleibt separat funktionsfähig.
   Nachweis: Normale Pending-Kontoänderungen bleiben erhalten; ausdrückliche Gastübernahme bleibt separat geprüft.

### KD-REV-E03-003 · Gültige Löschschutz-Fixture lässt Titel-Pins ungültig

**ERLEDIGT · BEHALTEN.** Der positive Löschschutztest erreicht wieder seine eigentlichen Folgeprüfungen.
Ursprüngliche Ursache: Die Fixture initialisiert alle Löschschlüssel mit präfixiertem Text, definiert dann die angeblich vollständige `registryRohwerte`-Map, lässt darin aber `K.entdeckenPins` aus. Der Registryeintrag für Titel-Pins ist ein `jsonEintrag`: `JSON.parse` warnt bei dem noch vorhandenen Nicht-JSON-Text. Die Vollständigkeitsprüfung sperrt deshalb den Download-Guard. Diese Sperre ist das korrekte Produktverhalten; die Ursache liegt allein in der vermeintlich gültigen Testfixture.
Verhalten: Die vollständige Gastfixture enthält gültige leere Entdecken-Pins.
Risiko und Komplexität: Reine Testdatenkorrektur; keine Lockerung der Produktregistry. Heute zehn statt ursprünglich neun Checks durch zusätzliche Vollständigkeitsprüfung.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E03-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E03/KD-REV-E03-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [local_data_safety_test.mjs:85](/private/tmp/kd-review49-benefit-audit-20260917/local_data_safety_test.mjs:85).
Frische Belege: [local_data_safety_test.log](local_data_safety_test.log).

1. **ERLEDIGT** — `node local_data_safety_test.mjs` läuft mit der gültigen Fixture am Prüfstand vollständig und meldet alle 9 Checks.
   Nachweis: Einzeltest läuft vollständig; alle ursprünglichen neun plus neue Fixtureprüfung bestehen.
2. **ERLEDIGT** — Die gültige Fixture enthält für `K.entdeckenPins` gültiges JSON; ihr Backup erzeugt keine Warnung und gilt als vollständig.
   Nachweis: Leeres Pin-JSON ist registrykonform und macht Backup vollständig.
3. **ERLEDIGT** — Vorhandener ungültiger Pin-JSON-Text sperrt die Löschfreigabe weiterhin vor jeder Löschung.
   Nachweis: Defektes JSON sperrt Löschung weiterhin.
4. **ERLEDIGT** — Kontextwechsel, stille Teilfehler mit Rollback und Kontowechsel werden nach dem positiven Fall tatsächlich erreicht.
   Nachweis: Kontextwechsel, stiller Teilfehler/Rollback und Kontowechsel werden nach dem positiven Fall wirklich ausgeführt.

### KD-REV-E04-001 · Blogabgleich verwirft bekannte Must-Watch-Metadaten

**ERLEDIGT · BEHALTEN.** Blogabgleich verwechselt gleichnamige Remakes oder Werkarten weniger leicht.
Ursprüngliche Ursache: Primäre Ursache ist die verlustbehaftete Projektion der Must-Watch-Einträge:
Verhalten: Must-Watch-Projektion erhält Jahr und Typ; Masterersetzung nutzt dieselbe Referenzprojektion.
Risiko und Komplexität: Sehr kleine Vertragserhaltung; unbekannte alte Metadaten werden nicht erfunden. Bereits bewusst gesetzte Refs bleiben stabil.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E04-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E04/KD-REV-E04-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/libraryProjection.js:19](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/libraryProjection.js:19), [src/lib/libraryProjection.js:245](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/libraryProjection.js:245).
Frische Belege: [review49_p04_personal_test.log](review49_p04_personal_test.log).

1. **ERLEDIGT** — Must-Watch The Thing (1982, Film), leerer Master und Blog The Thing (2011, Film) ergeben keinen automatischen Must-Watch-Link.
   Nachweis: The Thing 1982 versus 2011 erzeugt keinen Auto-Link.
2. **ERLEDIGT** — Ein eindeutiger Must-Watch-Eintrag Dark (2017, Serie) wird aus dem gleichartigen Blogeintrag korrekt verlinkt.
   Nachweis: Dark 2017 Serie wird eindeutig verlinkt.
3. **ERLEDIGT** — Beide Fälle gelten für baueRefUniversum plus gleicheArtikelAb beziehungsweise heileRotlinks sowie für planeMasterErsetzung.
   Nachweis: Normalabgleich, Rotlinkheilung und Masterersetzung führen durch dieselbe Projektion.
4. **ERLEDIGT** — Bekannte Metadaten bleiben in allen Projektionen erhalten; Eingabeobjekte werden nicht mutiert.
   Nachweis: Jahr/Typ bleiben erhalten, Eingaben unverändert.
5. **ERLEDIGT** — Kontrollfälle decken korrekten Master-Jahrestreffer, Mehrdeutigkeit, Altbestand ohne Metadaten und bewusst gesetzte bestehende Refs ab.
   Nachweis: Mastertreffer, Mehrdeutigkeit, metadatenarmer Altbestand und gesetzte Refs sind Gegenproben.

### KD-REV-E04-002 · Bearbeitete KI-Vorschläge werden als angenommen gespeichert

**ERLEDIGT · BEHALTEN.** Bearbeitete KI-Vorschläge erhalten einen zum endgültigen Inhalt passenden Status und Herkunftstext.
Ursprüngliche Ursache: FilmCard speichert beim Übernahme-Einstieg nur das Einstiegsflag prognoseEntwurf, nicht den resultierenden Editorwert:
Verhalten: FilmCard und EintragForm teilen einen reinen Inhaltsvergleich; Notizen zählen nicht als Bewertungsänderung.
Risiko und Komplexität: Elf Zeilen gemeinsame Fachlogik ersetzen divergierende Entscheidungen. Auch manuell exakt gleiche Inhalte können nun angenommen heißen; das Urteil folgt Inhalt statt Einstiegsknopf.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E04-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E04/KD-REV-E04-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/components/FilmCard.jsx:294](/private/tmp/kd-review49-benefit-audit-20260917/src/components/FilmCard.jsx:294), [src/lib/bewertungsvergleich.js:1](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/bewertungsvergleich.js:1).
Frische Belege: [review49_p04_personal_test.log](review49_p04_personal_test.log).

1. **ERLEDIGT** — Unveränderte offene Prognose übernehmen und speichern ergibt angenommen; das ursprüngliche Ergebnis bleibt erhalten.
   Nachweis: Unveränderte offene Übernahme bleibt angenommen mit unverändertem Prognoseergebnis.
2. **ERLEDIGT** — Nach Übernahme jeweils Achse, Kategorie oder Begründung ändern und speichern ergibt korrigiert; die Nutzerwerte bleiben erhalten und die UI zeigt von dir korrigiert.
   Nachweis: Achse, Kategorie und Begründung erzeugen korrigiert samt sichtbarer UI und korrekter Herkunft.
3. **ERLEDIGT** — Eine bereits angenommene Prognose erneut übernehmen, verändern und speichern ergibt korrigiert.
   Nachweis: Bereits angenommene Prognose kann über denselben Weg korrigiert werden.
4. **ERLEDIGT** — Nur die Notiz ändern oder die Bewertungsfelder vor dem Speichern wieder exakt zurücksetzen ergibt angenommen.
   Nachweis: Notiz und Rücksetzen auf Originalwerte bleiben angenommen.
5. **ERLEDIGT** — Manueller Bewertungsweg, EintragForm, unvollständige Prognosefelder und Fehlerpfade beim Speichern behalten ihre bisherigen Guards.
   Nachweis: Manueller Einstieg, unvollständige Übernahme und Speicherfehler sind aktiv geprüft; Formular verwendet denselben gelesenen Vergleich.

### KD-REV-E04-003 · Must-Watch-Masterlink verliert sein Ziel hinter Mediathekfiltern

**ERLEDIGT · BEHALTEN.** Ein Must-Watch-Masterlink führt trotz zuvor gesetzter Mediathekfilter zu einer sichtbaren geöffneten Karte.
Ursprüngliche Ursache: Die Fokusbehandlung stellt Ansicht und Typ ein, räumt aber keine ausschließenden Filter auf und quittiert den Fokus unabhängig davon, ob das Ziel sichtbar aufgelöst wurde:
Verhalten: Navigation stellt passende Ansicht/Typ/Filter her und quittiert erst nach sichtbarer Projektion plus DOMziel.
Risiko und Komplexität: Mehr UIzustand im bestehenden Fokuspfad; bewusstes Zurücksetzen der Filter ist sichtbare Navigationswirkung. Kein neuer Navigationsmanager.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E04-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E04/KD-REV-E04-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/tabs/MediathekTab.jsx:226](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/MediathekTab.jsx:226), [src/tabs/MediathekTab.jsx:415](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/MediathekTab.jsx:415).
Frische Belege: [review49_p10a_mediathek_focus_test.log](review49_p10a_mediathek_focus_test.log).

1. **ERLEDIGT** — Mit aktiver Suche Alpha öffnet ein Must-Watch-Masterlink auf Zulu die sichtbare, aufgeklappte Zulu-Karte ohne manuelles Leeren der Suche.
   Nachweis: Alpha-Suche zu Zulu-Link öffnet sichtbare Zulu-Karte.
2. **ERLEDIGT** — Ein gültiges Ziel verliert seinen Fokus nicht still, solange es nur wegen lokaler Filter unsichtbar ist.
   Nachweis: Fehlendes/hidden/inert Ziel verbraucht den Auftrag nicht.
3. **ERLEDIGT** — Gezielt getestete Regressionen decken Suche, ausschließenden Genre-, Kategorie- und Besitzfilter sowie einen tatsächlich erreichbaren A-Z- oder Dekadenfall ab.
   Nachweis: Such-, Genre-, Kategorie-, Besitz-, Buchstaben- und Dekadenfälle laufen gemountet.
4. **ERLEDIGT** — Kontrollpfad ohne Filter und automatische Wahl des passenden Medientyps funktionieren fort; Navigation verändert keine gespeicherten Daten.
   Nachweis: Ungefilterter Pfad, Typwechsel und Auswahlmodus erhalten Vertrag; null Datenwrites.

### KD-REV-E04-004 · Karteneditor verwirft unvollständige Must-Watch-Jahreseingaben

**ERLEDIGT · BEHALTEN.** Eine Jahreszahl lässt sich schrittweise bearbeiten, ohne bei jedem Tastendruck gelöscht zu werden.
Ursprüngliche Ursache: MetaFelder ist ein kontrolliertes Input ohne eigenen Entwurf; die Karteninstanz bezieht value direkt aus e.jahr und ruft onUpdate bei jeder Änderung:
Verhalten: Lokaler Stringentwurf mit ausdrücklicher Bestätigung trennt Eingabe von persistentem Jahr.
Risiko und Komplexität: Zusätzlicher Entwurfszustand und Speichern/Abbrechen-Schritte sind angemessen; andere Metadaten bleiben unverändert. Ungültige Eingabe wird nicht als Nullwert gespeichert.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E04-004](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E04/KD-REV-E04-004.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/components/MustWatchListe.jsx:57](/private/tmp/kd-review49-benefit-audit-20260917/src/components/MustWatchListe.jsx:57).
Frische Belege: [review49_p04_personal_test.log](review49_p04_personal_test.log).

1. **ERLEDIGT** — Ein Integrationstest mit MustWatchListe und echtem useMustwatchController zeigt 1, 19, 198 und 1982 über einzelne React- und Storage-Ticks sichtbar als Entwurf; der Commit persistiert numerisch 1982.
   Nachweis: Echte Liste/Controller halten 1,19,198,1982 über Ticks; Commit schreibt numerisch 1982.
2. **ERLEDIGT** — Bei bestehendem 1982 darf Backspace auf 198 nicht zu stillschweigendem jahr:null führen; Ergänzen auf 1983 und Commit funktionieren.
   Nachweis: Backspace von 1982 auf 198 bleibt Entwurf; Ergänzung zu 1983 speichert korrekt.
3. **ERLEDIGT** — Bewusstes Leeren und Bestätigen kann das optionale Jahr weiterhin auf null setzen. Eine ungültige nichtleere abgeschlossene Eingabe überschreibt kein gültiges Jahr still.
   Nachweis: Bewusst bestätigtes Leeren schreibt null; ungültiger nichtleerer Wert überschreibt kein Jahr.
4. **ERLEDIGT** — Vollständiges Einsetzen, schrittweise Neuanlage, Abbruch und fehlgeschlagene Speicherung bleiben verständlich; die Persistenz enthält nur gültige Jahreszahlen oder null.
   Nachweis: Paste, Neuerfassung, Escape/Abbruch und Fehler lassen nur gültige Werte in Persistenz.

### KD-REV-E04-005 · Stapelimport verwirft korrigierte Fehlkandidaten nach Einzelwritefehler

**ERLEDIGT · BEHALTEN.** Teilweise gespeicherte Stapel verlieren weder die fehlgeschlagenen Eingaben noch erzeugt Retry Dubletten.
Ursprüngliche Ursache: Der Ergebnisvertrag enthält weder fehlgeschlagene Kandidaten noch einen kandidatenspezifischen Status:
Verhalten: Speicherergebnis wird je Kandidat festgehalten; nur fehlgeschlagene Kandidaten verbleiben in der Vorschau.
Risiko und Komplexität: Mehr Ergebnis-/UIzustand, aber kein neues Batchframework. Null bleibt konservativ nicht gespeichert, auch wenn es eine Dublette statt Transportfehler war.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E04-005](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E04/KD-REV-E04-005.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/stapelimport.js:268](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/stapelimport.js:268), [src/components/StapelImport.jsx:133](/private/tmp/kd-review49-benefit-audit-20260917/src/components/StapelImport.jsx:133).
Frische Belege: [review49_p04_personal_test.log](review49_p04_personal_test.log).

1. **ERLEDIGT** — Der produktive addFilm-Pfad id/null/id behält exakt den fehlgeschlagenen Kandidaten einschließlich Quelle, Staffeln, Faktenwahl und Auswahl; die UI weist zwei erfolgreiche und einen fehlgeschlagenen Eintrag aus.
   Nachweis: id/null/id erhält exakt Restkandidat samt Quelle, Staffeln, Faktenwahl und Auswahl.
2. **ERLEDIGT** — Erneutes Übernehmen adressiert nur den verbliebenen Fehlkandidaten. Bereits erfolgreiche Kandidaten werden nicht erneut geschrieben; die KI wird nicht erneut aufgerufen.
   Nachweis: Retry adressiert nur den Rest, kein zweiter KI-Lauf.
3. **ERLEDIGT** — Bei null/null/null bleibt die gesamte korrigierte Auswahl erhalten.
   Nachweis: null/null/null erhält alle korrigierten Kandidaten.
4. **ERLEDIGT** — Vollständiger Erfolg darf die Vorschau weiterhin schließen; Doppelklick verursacht keine doppelte Übernahme.
   Nachweis: Gesamterfolg schließt; laufende Speicherung verhindert doppelte Übernahme.
5. **ERLEDIGT** — Konto- und Generationsguards bleiben wirksam. Als Dublette klassifizierte Fälle sind von Speicherfehlern unterscheidbar oder werden konservativ behandelt.
   Nachweis: Kontextwechsel stoppt Rest/Abschlussanzeige; unklare Nullergebnisse bleiben konservativ erhalten.

### KD-REV-E04-006 · Blog-Rotlink speichert nach Film-Serien-Wechsel den alten Typ

**ERLEDIGT · BEHALTEN.** Der im Blog sichtbare Werktyp entspricht beim Anlegen dem gespeicherten Typ.
Ursprüngliche Ursache: BlogTab verändert beim äußeren Wechsel nur neuTyp beziehungsweise rotTyp und übergibt damit neue typOptionen. Film und Serie verbleiben beide im selben hatDreieck-Zweig ohne wechselnden Key; FilmForm bleibt dieselbe Komponenteninstanz:
Verhalten: FilmForm leitet einen sofort gültigen effektiven Typ aus aktuellen erlaubten Optionen ab.
Risiko und Komplexität: Kleine Synchronisation zwischen äußerer Auswahl und bestehendem Entwurf; direkter Typwechsel bewahrt sonstige Eingaben.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E04-006](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E04/KD-REV-E04-006.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/components/EintragForm.jsx:45](/private/tmp/kd-review49-benefit-audit-20260917/src/components/EintragForm.jsx:45), [src/components/EintragForm.jsx:64](/private/tmp/kd-review49-benefit-audit-20260917/src/components/EintragForm.jsx:64).
Frische Belege: [review49_p04_personal_test.log](review49_p04_personal_test.log).

1. **ERLEDIGT** — In Abgleich und privater Leseansicht speichert Film zu Serie typ=serie und Serie zu Film typ=film.
   Nachweis: Beide Blogwege speichern Film zu Serie und Serie zu Film korrekt.
2. **ERLEDIGT** — Äußerer Selektor, innerer Selektor, Validierung und Save-Payload verwenden durchgehend denselben aktuellen Typ.
   Nachweis: Innere/äußere Auswahl, Validierung und Save benutzen denselben effektiven Typ.
3. **ERLEDIGT** — Ohne Wechsel und beim Wechsel über Musik oder Sonstiges bleibt die bisher korrekte Anlage erhalten.
   Nachweis: Unveränderter Typ und Umwege über Musik/Sonstiges sind geprüft.
4. **ERLEDIGT** — Direkter Typwechsel verwirft andere gültige Formulareingaben nicht unbeabsichtigt.
   Nachweis: Eigener Titelentwurf überlebt direkten Wechsel.
5. **ERLEDIGT** — Die Referenz wird weiterhin erst nach bestätigter Anlage gesetzt; Regressionstests benötigen keine Netz- oder Provideraufrufe.
   Nachweis: Referenz entsteht erst nach bestätigter Anlage; alle Wege mit echten Komponenten und null Netz.

### KD-REV-E05-001 · Fehlgeschlagener Known-Nachzug mischt entfernte Angebote in lokale Consumer

**ERLEDIGT · BEHALTEN.** Gemischte Kataloggenerationen können entfernte Streamingangebote nicht als aktuell wiederbeleben.
Ursprüngliche Ursache: Die Generationserkennung schützt nur Quellenmetadaten; sie steuert nicht den Titelmerge. Der Browsercache kann bei einem fehlgeschlagenen Direktread den älteren Payload mitsamt dessen Metadaten zurückgeben (eingefrorene `katalog.js`:334-359; `src/lib/katalog.js` am Prüfcommit). `loadArea` gibt diesen Stand weiter (eingefrorene `catalog.js`:311-319 und 369-378; `src/services/catalog.js` am Prüfcommit).
Verhalten: Ein nicht passendes Known/Discover-Paar wird beschränkt markiert und darf keine alte Dienstunion bilden.
Risiko und Komplexität: Bei Ausfall wird weniger Verfügbarkeit gezeigt, dafür keine falsche aktuelle Verfügbarkeit. Der Konflikt bleibt wiederherstellbar; progressive Seiten bleiben eigene Generationen.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E05-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E05/KD-REV-E05-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/App.jsx:1559](/private/tmp/kd-review49-benefit-audit-20260917/src/App.jsx:1559), [src/lib/katalog.js:472](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/katalog.js:472).
Frische Belege: [review49_p07_generation_test.log](review49_p07_generation_test.log).

1. **ERLEDIGT** — Mocktest für Boot Known A, Discover B mit entferntem ausgewähltem Dienst und Known-Refresh aus Cache A: Finder, Badges und Legacy-`Mein Programm` geben keinen alten Dienst oder Link als aktuelle Verfügbarkeit aus.
   Nachweis: Known A/Discover B/Cache A entfernt alten Dienst und Link aus Finder/Mein Programm.
2. **ERLEDIGT** — Derselbe Schutz gilt für geworfenen Refresh ohne Cache sowie für einen erfolgreichen Read, dessen Generation weiterhin nicht zu Discover passt.
   Nachweis: Throw-ohne-Cache und falscher erfolgreicher Nachzug sind eigene Fälle.
3. **ERLEDIGT** — Der Konflikt bleibt für Wiederherstellung erkennbar; ein späterer erlaubter Refresh kann ein passendes Paar übernehmen.
   Nachweis: Konflikt bleibt sichtbar; späterer passender Nachzug heilt ihn.
4. **ERLEDIGT** — Die sichtbare Herkunft behauptet keinen frischen Gesamtkatalog, wenn verwendete Angebote aus einem alten Teil stammen.
   Nachweis: Herkunft meldet abgelaufen/generationKonflikt statt frischen Vollkatalog.
5. **ERLEDIGT** — Kontrolle: Passender Known-Nachzug B entfernt das Angebot; zwei Lanes derselben Generation behalten ihre legitime Union.
   Nachweis: Passendes B entfernt Altangebot; gleiches B/B bewahrt legitime Union.
6. **ERLEDIGT** — `Alles`/`Neu` bleiben bei Mismatch geschützt; der normale progressive Seitenpfad bleibt unverändert.
   Nachweis: Alles/Neu erhalten begrenzten Umfang; unabhängige progressive Fristen-/Browserprüfungen bleiben grün.

### KD-REV-E05-002 · Serien-Faktenlookup sendet den internen statt des SQL-Vertragswerts

**ERLEDIGT · BEHALTEN.** Serien erhalten passende bestätigte Fakten statt durch eine falsche RPC-Werkart leer auszugehen.
Ursprüngliche Ursache: Die Funktion `mediaType()` ist als interne Normalisierung geeignet, aber nicht als RPC-Adapter: Sie bildet `series` und `serie` beide auf `serie` (`flixpatrolFactsContext.js`:22). In `load()` wird dieser interne Wert an `kd_title_facts_lookup` weitergereicht (`flixpatrolFactsContext.js`:265-278). SQL validiert `mediaType` strikt gegen `('film','series')` und macht einen ID-basierten Cache-Join ohne Chart-Bezug (`20260911120000_title_facts_lookup.sql`:169-201). Eine Suche im gesamten Migrationsbaum ergab keine spätere Vertragskorrektur.
Verhalten: Normalisiert an genau der SQL-Grenze auf film/series.
Risiko und Komplexität: Einzeiliger Adaptervertrag statt Änderung interner serie-Werte; keine Migration für dieses Ticket.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E05-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E05/KD-REV-E05-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/functions/_shared/flixpatrolFactsContext.js:266](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/_shared/flixpatrolFactsContext.js:266).
Frische Belege: [review49_p05_pg17_test.log](review49_p05_pg17_test.log), [ai_task_P06.log](ai_task_P06.log).

1. **ERLEDIGT** — Serienidentitäten mit gültigem Jahr und nur IMDb beziehungsweise nur TMDb senden `mediaType: "series"` und liefern außerhalb aller Charts einen passenden resolved Cachetitel.
   Nachweis: IMDb-only und TMDB-only Serien außerhalb Charts werden durch echte SQL-Validierung aufgelöst.
2. **ERLEDIGT** — Beide Reader-Eingaben `typ: "serie"` und `typ: "series"` funktionieren; der Forecast darf intern weiter `serie` verwenden.
   Nachweis: serie und series werden beide zu series am RPC; interner Forecast bleibt serie.
3. **ERLEDIGT** — Filmlookup, direkte FlixPatrol-ID und Chartfallback bleiben funktionsfähig.
   Nachweis: Film, direkte ID und Chartfallback funktionieren.
4. **ERLEDIGT** — ID-Konflikte, mehrdeutige SQL-Treffer sowie fehlendes oder widersprüchliches Jahr bleiben ohne ungesicherten Kontext.
   Nachweis: Fehlendes/widersprüchliches Jahr sowie IDkonflikte/Mehrdeutigkeit liefern keinen unsicheren Fakt.
5. **ERLEDIGT** — Ein Regressionstest prüft echte SQL-Vertragsvalidierung oder einen strikt vertragstreuen Mock; ein argumentunabhängiger Erfolgs-Mock genügt nicht.
   Nachweis: PG17-Test führt echten Reader gegen echte SQL-Funktion aus; kein argumentblinder Erfolgsstub.

### KD-REV-E05-003 · `ensureIds` bewahrt leere Alt-IDs und koppelt dadurch Einträge

**ERLEDIGT · BEHALTEN.** Falsylegacy-IDs werden tatsächlich ersetzt; neu angelegte Sonderzeichentitel bleiben erreichbar.
Ursprüngliche Ursache: Ursache und Auslöser stehen im verlinkten Originalticket.
Verhalten: Zentraler Normalisierer schreibt generierte ID nach Originalfeldern, addFilm verwendet das normalisierte Ergebnis.
Risiko und Komplexität: Minimaler Fix an den zwei echten Identitätsgrenzen. Zufallsfallback für nicht sluggierbare Titel bleibt bestehendes Verhalten.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E05-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E05/KD-REV-E05-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/match.js:138](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/match.js:138), [src/App.jsx:1238](/private/tmp/kd-review49-benefit-audit-20260917/src/App.jsx:1238).
Frische Belege: [review49_p04_personal_test.log](review49_p04_personal_test.log), [controllers_test.log](controllers_test.log).

1. **ERLEDIGT** — `ensureIds` liefert für `id: null`, `id: ""`, fehlendes `id` und andere falsy Altwerte nichtleere eindeutige IDs; ein erneuter Lauf erhält die IDs.
   Nachweis: Null, Leerstring, fehlend und weitere Falsywerte werden eindeutig/stabil normalisiert.
2. **ERLEDIGT** — Gültige IDs bleiben bestehen; Kollisionen mit existierenden sowie im gleichen Lauf neu vergebenen IDs bleiben verhindert.
   Nachweis: Bestehende IDs und beide Kollisionsarten bleiben geprüft.
3. **ERLEDIGT** — Der aktuelle Musikpfad mit `!!!` und leerem Jahr persistiert und gibt eine gültige ID zurück; der Eintrag bleibt nach Reload auswählbar.
   Nachweis: Musik mit !!! und leerem Jahr persistiert samt echter Rückgabe-ID.
4. **ERLEDIGT** — Ein zweiter Satzzeichen-Titel mit leerem Rohslug wird nicht als Dublette abgewiesen.
   Nachweis: Zweiter Sonderzeichentitel wird nicht pauschal als leere Dublette verworfen.
5. **ERLEDIGT** — Wiederhergestellte null-/Leerstring-ID-Paare sind vor Nutzung getrennt; ein Einzeledit verändert nur das gewählte Werk. Ein Bibliothekstest genügt; ein neuer UI-Restore ist nicht erforderlich.
   Nachweis: Normalisierte Altpaare bleiben beim Einzeledit getrennt; echter Appcallback und Controllerkontrolle laufen.

### KD-REV-E06-001 · Progressive Streaming-Seiten verlieren die Quellkatalog-Ablauffrist bei Revalidierung

**ERLEDIGT · BEHALTEN.** Progressive Streamingseiten zeigen abgelaufene Quellen nicht mehr als aktuell.
Ursprüngliche Ursache: Die Serverfunktion lädt die Projektionsmetadaten, prüft jedoch nur eine positive `source_revision`; `gueltig_bis` wird nicht als Read-Guard ausgewertet. Die Rückgabe enthält `meta`, aber `nextExpiryAt` entsteht ausschließlich aus `new_since`.
Verhalten: Quellfrist wird von Neu-Frist getrennt durch RPC, Cache, Controller und UI getragen.
Risiko und Komplexität: Etwas mehr Fristzustand; alte Items können als veraltet sichtbar bleiben. Ein HTTP200 erneuert fachliche Frische nicht. Additive Antwortfelder sind für bisherigen normalisierenden Leser verträglich.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E06-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E06/KD-REV-E06-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/streamingPage.js:171](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/streamingPage.js:171), [src/lib/streamingPage.js:218](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/streamingPage.js:218), [src/controllers/useStreamingPageController.js:150](/private/tmp/kd-review49-benefit-audit-20260917/src/controllers/useStreamingPageController.js:150), [supabase/migrations/20260917120000_review_streaming_freshness_anchors.sql:5](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917120000_review_streaming_freshness_anchors.sql:5).
Frische Belege: [review49_p07_state_test.log](review49_p07_state_test.log), [review49_p07_pg_test.log](review49_p07_pg_test.log), [review49_p07_browser_test.log](review49_p07_browser_test.log), [streaming_page_cache_test.log](streaming_page_cache_test.log).

1. **ERLEDIGT** — Eine vor Ablauf geladene progressive Seite wird bei Ablauf oder Wiederaufnahme als veraltet/nicht verfügbar behandelt, auch wenn Known zuvor geladen wurde und nicht neu lädt.
   Nachweis: Offener Tab und Wiederaufnahme erkennen Quellablauf unabhängig von Known.
2. **ERLEDIGT** — Eine erneute Antwort derselben bereits abgelaufenen Projektion entfernt den Hinweis nicht und verlängert ihre Quellfrist nicht.
   Nachweis: Stale200 bleibt stale mit identischer Quellfrist.
3. **ERLEDIGT** — Cachewiederverwendung berücksichtigt eine endliche Quellfrist; `null` erzeugt keine erfundene Ablaufzeit.
   Nachweis: Cache berücksichtigt endliche Frist; null erfindet keine Frist.
4. **ERLEDIGT** — Ein beim Start bereits abgelaufener Quellstand ist unabhängig von Verzögerung oder Fehlschlag des Known-Ladens als nicht frisch erkennbar.
   Nachweis: Schon beim Start abgelaufene Quelle wird sichtbar erkannt.
5. **ERLEDIGT** — Ein tatsächlich neuer gültiger Quellstand hebt den Hinweis auf; Neu-Fristen bleiben funktionsgleich und es entsteht keine Refresh-Schleife.
   Nachweis: Neuer gültiger Stand hebt Warnung auf; keine Refreshschleife.
6. **ERLEDIGT** — Ein fokussierter lokaler RPC-, Controller-/Cache- und UI-Test deckt offenen Tab und Wiederaufnahme ab. Dazu sind keine Live-Anbieteranfragen erforderlich.
   Nachweis: PG17/React, Cachetest und beide Browser prüfen die zusammenhängenden Ebenen.

### KD-REV-E06-002 · Verwaiste Mediathek-Status-ID verhindert erneute Eintragserstellung im progressiven Streaming

**ERLEDIGT · BEHALTEN.** Gelöschte Mediathekeinträge blockieren erneutes Anlegen aus Streaming nicht mehr.
Ursprüngliche Ursache: Zwei unterschiedliche Wahrheiten werden verwendet: `bestaetigteMediathekIdFuer` prüft im progressiven Modus `library_id` gegen den aktuellen `masterIndex` und schützt damit die Navigation. `mediathekIdFuer` nimmt für die Erstellbarkeitsprüfung dagegen zuerst die rohe Status-ID. Der vorhandene Bereinigungsmechanismus wird bei `progressiveEnabled` vollständig übersprungen.
Verhalten: Navigation, Erstellen und Gesehenübernahme nutzen dieselbe aktuell bestätigte Zuordnung.
Risiko und Komplexität: Keine pauschale Löschung historischer Gesehenfelder. Bei noch ungeladenem Master bleiben Aktionen vorsichtig; vorhandener gecachter Identitätsindex vermeidet wiederholten Vollindexbau.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E06-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E06/KD-REV-E06-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/tabs/StreamingTab.jsx:55](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/StreamingTab.jsx:55), [src/lib/staffeln.js:49](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/staffeln.js:49), [src/lib/staffeln.js:106](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/staffeln.js:106).
Frische Belege: [review49_p07_browser_test.log](review49_p07_browser_test.log), [review49_p07_state_test.log](review49_p07_state_test.log).

1. **ERLEDIGT** — Einen Titel über Alles anlegen, regulär löschen und auf einer fertig geladenen progressiven Seite erneut anzeigen: „Zum Eintrag“ fehlt, „Eintrag erstellen“ ist verfügbar und eine erneute Anlage funktioniert.
   Nachweis: Alles: Anlegen, löschen, erneut erstellen läuft durch echte UI/Controller.
2. **ERLEDIGT** — Derselbe Ablauf funktioniert in Neu, sofern der Titel weiter zur Neu-Auswahl gehört.
   Nachweis: Neu durchläuft denselben Ablauf.
3. **ERLEDIGT** — Ein als gesehen markierter Titel behält den Gesehen-Status nach der Löschung und bietet „In Mediathek übernehmen“; eine verwaiste ID blockiert die Übernahme nicht.
   Nachweis: Gesehenstatus bleibt erhalten, verwaiste ID blockiert Übernahme nicht.
4. **ERLEDIGT** — Bei einem tatsächlich vorhandenen Mediathek-Eintrag bleiben sichere Navigation und das Verbergen doppelter Erstellung erhalten.
   Nachweis: Vorhandene eindeutige Verknüpfung navigiert und verhindert doppelte Anlage.
5. **ERLEDIGT** — Keine gültige Verknüpfung wird bei noch nicht geladenem Master, Accountwechsel oder teilweiser Seite voreilig entfernt; die vorhandene Legacy-Bereinigung bleibt wirksam.
   Nachweis: Unvollständiger Master, Accountwechsel und Teilseite werden nicht als Bestandslöschung interpretiert.

### KD-REV-E06-003 · Progressiver Streamingpfad persistiert keine Neu-Fristanker und datiert verbrauchte Zugänge nach Diff-Pruning neu

**ERLEDIGT · BEHALTEN.** Persönliche Neu-Fenster werden nach abgeschnittenen Quelldiffs nicht neu gestartet.
Ursprüngliche Ursache: `useStreamingNeuController` reicht nur vorhandene Fristenbucheinträge in die Seitenanfrage. Seine einzige Aktualisierung hängt an `aktiverBeleg`, der nur durch die Vollkatalogübernahme gesetzt wird. Der Seitencontroller verarbeitet dagegen Antworten einschließlich `nextExpiryAt` lediglich flüchtig und besitzt keinen Rückkanal in die Fristpersistenz. SQL verarbeitet vorhandene Start-/Verbrauchsanker korrekt, kann bei `newEntries=[]` und verlorenen älteren Diffs jedoch nur den Restzugang rekonstruieren. Beim Katalogwechsel ersetzt die Projektion ihre Basiszeilen und erhält historische Diffs nicht separat.
Verhalten: RPC liefert belegten Beginn und Verbrauchszeit; owner-/dienstgebundenes Fristenbuch übernimmt qualifizierte Seitenanker.
Risiko und Komplexität: Größter Streamingzusatz; ein begrenzter Requery nach Ankerübernahme ist realer Preis. Kein Vollkatalogzwang und keine Abrufzeit als Beleg. Ohne neue Migration ist dieser Nutzen noch nicht verfügbar.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E06-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E06/KD-REV-E06-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/controllers/useStreamingNeuController.js:21](/private/tmp/kd-review49-benefit-audit-20260917/src/controllers/useStreamingNeuController.js:21), [src/controllers/useStreamingNeuController.js:78](/private/tmp/kd-review49-benefit-audit-20260917/src/controllers/useStreamingNeuController.js:78), [src/App.jsx:922](/private/tmp/kd-review49-benefit-audit-20260917/src/App.jsx:922), [supabase/migrations/20260917120000_review_streaming_freshness_anchors.sql:5](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917120000_review_streaming_freshness_anchors.sql:5).
Frische Belege: [review49_p07_pg_test.log](review49_p07_pg_test.log), [review49_p07_state_test.log](review49_p07_state_test.log).

1. **ERLEDIGT** — Frischer Cache, erfolgreicher Seiten-RPC und Tag-1/Tag-2/Tag-4-Verlauf erhalten im progressiven Pfad den Beginn Tag 1 und den verbrauchten Wiederzugang Tag 4 — ohne Vollkatalog-Fallback.
   Nachweis: Tag1/Tag2/Tag4 mit realem SQL/React bewahrt Beginn1 und Verbrauch4 ohne Vollfallback.
2. **ERLEDIGT** — Nach einem gültigen Katalogwechsel auf den bloßen Tag-4-Restdiff liefert Tag 16 weder Neu-Karte noch Neu-Zähler (`total/new count=0`); dies bleibt nach Reload/Remount mit Gerätecache erhalten.
   Nachweis: Tag16 bleibt nach Restdiff/Remount ohne Neuitem und Neuzähler.
3. **ERLEDIGT** — Ein tatsächlicher weiterer Zugang nach Ablauf des ursprünglichen Fensters kann ein neues 14-Tage-Fenster beginnen; wiederholte Seitenabrufe und Cachetreffer verlängern keine Frist.
   Nachweis: Später echter Zugang darf neues Fenster eröffnen; Wiederholung verlängert nichts.
4. **ERLEDIGT** — Regression deckt Account-/Dienstauswahlbindung und veraltete Seitenantworten ab; fremde oder veraltete Anker werden nicht übernommen.
   Nachweis: Owner, Dienste, Epoch und veraltete Antworten werden verworfen.
5. **ERLEDIGT** — Bestehende gültige Anker und MotN-Zugangszeiten bleiben wirksam; ein normal erfolgreicher Seitenbetrieb benötigt weiterhin keinen `streaming_entdecken`-Vollabruf.
   Nachweis: Bestehende Anker und MotN-Zeiten bleiben wirksam; vier Seitenreads und null Vollfallbacks im Integrationslauf.

### KD-REV-E07-001 · Gesehen-Abgleich blendet andere Werkart bei gleicher numerischer TMDB-ID aus

**ERLEDIGT · BEHALTEN.** Film und Serie mit gleicher TMDB-Nummer blenden sich nicht gegenseitig als gesehen aus.
Ursprüngliche Ursache: Am Prüfcommit extrahiert `strongIds` TMDB als untypisierten String: `/private/tmp/kd-vollreview-20260916/source/src/lib/entdeckenUi.js:627` bis `:636` (Repository: `src/lib/entdeckenUi.js`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`).
Verhalten: Lokaler Seenabgleich prüft die beidseitige Werkart vor dem IDtreffer.
Risiko und Komplexität: Sehr kleiner richtiger Fachguard; kein generelles Matchingrefactoring und keine neue Datenquelle.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E07-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E07/KD-REV-E07-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/entdeckenUi.js:647](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/entdeckenUi.js:647).
Frische Belege: [review49_p08_entdecken_test.log](review49_p08_entdecken_test.log).

1. **ERLEDIGT** — Gültige Format-8- und Format-9-Feeds: gleiche numerische TMDB-ID bei Film versus Serie erzeugt in beiden Richtungen kein `seen=true`.
   Nachweis: Format8/9 und beide Film/Serie-Richtungen verhindern false seen.
2. **ERLEDIGT** — Unter sonst gleichen Voraussetzungen bleibt die Zielkarte in `popularPool`; bei bestätigter lokaler Verfügbarkeit und Profilgrund bleibt sie auch in `personal`.
   Nachweis: Popularpool und bei gültiger Verfügbarkeit persönliche Karte bleiben enthalten.
3. **ERLEDIGT** — Gleiche Werkart bei bestätigter gleicher Identität wird weiterhin als gesehen ausgeblendet; ein unbewerteter Eintrag ohne anderes Sehmerkmal nicht.
   Nachweis: Gleicher Typ/Identität bleibt gesehen; unbewertet allein reicht nicht.
4. **ERLEDIGT** — Widersprechende gemeinsame IDs führen weiterhin zu keinem Gesehen-Treffer; der bestehende typgebundene Titel-/Jahr-Fallback bleibt wirksam.
   Nachweis: Widersprechende IDs und typgebundener Titel/Jahr-Fallback behalten Schutz.
5. **ERLEDIGT** — Die Regression deckt `master` und als gesehen markierte `catalogCandidates` ab; sie benötigt keinen Liveanbieteraufruf.
   Nachweis: Master und markierte Katalogkandidaten werden im echten Feedpfad getestet, null Netz.

### KD-REV-E07-002 · Format 8/9 verlieren ÖFI-Kinochartbelege vor der Anzeige

**ERLEDIGT · BEHALTEN.** ÖFI-Titel können mit belegter Identität sicher in aktuelle Kinokarten einfließen.
Ursprüngliche Ursache: Der Produzent leert die Werkidentität für öffentliche ÖFI-Einträge ausdrücklich in `/private/tmp/kd-vollreview-20260916/source/supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js:226` bis `:232`: `releaseYear: null` und `externalIds: {}` (Repository: `supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js`, Commit `14804ce389d69114feed27b92fb11ac78423cc0e`).
Verhalten: Bestehender Resolver ergänzt optionale annotations in Formaten8/9; Matcher bleibt streng.
Risiko und Komplexität: Zusätzliche begrenzte Resolverarbeit und SQL-/Browservertrag. Optionales Scheitern erhält Grundfeed. Alter strenger Browser verwirft mit Annotation den gesamten Feed: kompatibler Rollout bleibt offen.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E07-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E07/KD-REV-E07-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/functions/entdecken-daily-task/runner.js:200](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/entdecken-daily-task/runner.js:200), [supabase/functions/entdecken-daily-task/contract.js:657](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/entdecken-daily-task/contract.js:657), [src/lib/webDiscoveryFeed.js:657](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/webDiscoveryFeed.js:657), [src/lib/entdeckenUi.js:677](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/entdeckenUi.js:677), [supabase/migrations/20260917130000_review_entdecken_ofi_identity.sql:52](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917130000_review_entdecken_ofi_identity.sql:52).
Frische Belege: [review49_p08_entdecken_test.log](review49_p08_entdecken_test.log), [review49_p08_pg17_test.log](review49_p08_pg17_test.log), [repro-oefi-compat.json](repro-oefi-compat.json).

1. **ERLEDIGT** — Mindestens ein vom realen Produzentenvertrag erzeugter gültiger Feed mit sicher angereichertem ÖFI-Film passiert Server-, Persistenz- und Browservalidierung und erscheint bei passendem aktuellem Programm genau einmal mit `film_at_id`, unverändertem ÖFI-Rang, Besucherzahl, Messdatum und Quellenlink.
   Nachweis: Echter Producer/Resolver mit lokalen Antworten und echter SQL-Persistenz liefert genau eine ÖFI-Karte samt Quellenmetadaten.
2. **ERLEDIGT** — Beide weiterhin unterstützten Liveformate — oder ihre ausdrücklich kompatible Migration — sind abgedeckt; eine nur auf Format 7 beruhende Prüfung genügt nicht.
   Nachweis: Beide Formate8/9 passieren neue Server/SQL/Browser. Eigene Gegenprobe zeigt zugleich alten Leserbruch.
3. **ERLEDIGT** — Fehlende Identitätsbelege, Remakes, Typkonflikte, mehrdeutige Treffer sowie fehlende oder veraltete Vorstellungen erzeugen weiter keine Chartkarte.
   Nachweis: Fehlbeleg, Remake, Typkonflikt, Mehrdeutigkeit und veraltete/fehlende Vorstellung erzeugen keine Karte.
4. **ERLEDIGT** — Lokale Füller ohne ÖFI-Nachweis erhalten keine künstliche Popularität; Streaming-Dienstfilter und 50er-Pool bleiben erhalten.
   Nachweis: Füller erhalten keine erfundene Popularität; Dienstfilter und 50er-Pool bestehen.

**Rollout separat OFFEN:** R-OFI: alter Browser verwirft Feed mit annotations vollständig. Neuer SQL-/Producerstand darf dem alten Leser nicht ungefiltert serviert werden.

### KD-REV-E08-001 · Browser verwirft einen belegten Speicher-Teilerfolg als `unavailable`

**ERLEDIGT · BEHALTEN.** Ein gespeicherter Geschwisterfund bleibt bei teilweisem Speicherfehler nutzbar und sichtbar.
Ursprüngliche Ursache: Der Provider-Receipt beschreibt den tatsächlich geparsten Anbieterbefund, bevor die Speicherung beginnt. Bei einem nachgelagerten gemischten Speichererfolg setzt der Runner nur den Präsentationsmodus auf `partial`, lässt den Receipt aber absichtlich unverändert. Der Handler serialisiert beide Werte. Die Browser-Validierung verlangt fälschlich Gleichheit beider Modi, obwohl genau dieser Speicherteilfehler eine zulässige Abweichung erzeugt.
Verhalten: Unveränderter Providerreceipt wird von expliziten Speicherzählern und erlaubter Präsentationsabstufung getrennt.
Risiko und Komplexität: Zusätzlicher Antwortvertrag mit strikter Korrelation; notwendige Komplexität statt pauschaler Lockerung. Kein automatisches Wiederholen bezahlter Arbeit.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E08-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E08/KD-REV-E08-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/functions/radar-websearch-task/runner.js:285](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/radar-websearch-task/runner.js:285), [src/services/radarWebsearch.js:132](/private/tmp/kd-review49-benefit-audit-20260917/src/services/radarWebsearch.js:132), [supabase/functions/radar-websearch-task/index.ts:761](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/radar-websearch-task/index.ts:761).
Frische Belege: [review49_p05_partial_test.log](review49_p05_partial_test.log).

1. **ERLEDIGT** — Ein fokussierter Integrationstest mit echtem Adapter/Receipt, Handler und Browser-Service akzeptiert bei zwei gültigen Kandidaten, einem erfolgreichen und einem fehlschlagenden Mock-Upsert den Teilerfolg: `confirmed`, `writes: 1`, ein gespeicherter Feedfund und `partial`.
   Nachweis: Echter Adapter/Handler/Service akzeptiert einen erfolgreichen und einen fehlgeschlagenen Upsert als confirmed/writes1/partial.
2. **ERLEDIGT** — Dieser Fall liefert nicht pauschal `unavailable`; der Browser-Service hält die Speicherwarnung verfügbar und der Controller klassifiziert die initiale Suche nicht insgesamt als nicht verfügbar.
   Nachweis: Speicherwarnung bleibt; initialer Controller fällt nicht pauschal auf unavailable.
3. **ERLEDIGT** — Vollständiger `structured`-Erfolg und bereits providerseitig `partial` klassifizierte Antworten bleiben akzeptiert. Unzulässige oder manipulierte Moduskombinationen bleiben abgewiesen.
   Nachweis: Structured, providerpartial und elf Manipulationsfälle werden gegengeprüft.
4. **ERLEDIGT** — Der Receipt bleibt unverändert als Nachweis des konsumierten Providerresultats. Kein zusätzlicher Providerrequest und kein automatischer Retry werden eingeführt.
   Nachweis: Receipt bleibt unverändert; jeder Fall hat genau einen Mockproviderrequest.
5. **ERLEDIGT** — Der persistierte Geschwisterfund bleibt nach regulärem Feed-Sync sichtbar; Modellkandidaten werden weiterhin nicht direkt als gespeicherte UI-Daten übernommen.
   Nachweis: Fund wird aus regulärem Pilotfeed nachgelesen; Kandidaten werden nicht direkt als persistiert dargestellt.

### KD-REV-E08-002 · Verschiedene Plattformfunde überschreiben sich beim selben Werkstart

**ERLEDIGT · BEHALTEN.** Gleichzeitige Plattformstarts überschreiben einander nicht mehr.
Ursprüngliche Ursache: Die Evaluator-Deduplikation und die Persistenzidentität haben unterschiedliche Verträge: `candidateKey` enthält `platform`, die erzeugte `release:v1:`-ID dagegen nicht. Der Runner übergibt diese Release-ID unverändert als Text-`targetKey`; die Tabelle erzwingt pro Konto/Textziel/Release-ID nur einen Datensatz und aktualisiert bei Konflikt gerade die Plattform- und Belegfelder. Es gibt keine Aggregation oder spätere Rekonstruktion beider Plattformen.
Verhalten: Gemeinsamer Textfundschlüssel enthält Plattform; SQL migriert V1 zu V2 und nimmt alte Schreibschlüssel definiert entgegen.
Risiko und Komplexität: Echte Identitätsmigration, die alte Event-UUIDs erhält. Sie erhält jedoch nicht den V1-Lesevertrag alter Browser. Frühere bereits überschriebene Plattformbelege werden nicht rekonstruiert.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E08-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E08/KD-REV-E08-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/functions/radar-websearch-task/contract.js:526](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/radar-websearch-task/contract.js:526), [supabase/migrations/20260917100000_review_radar_text_identity.sql:5](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917100000_review_radar_text_identity.sql:5), [src/lib/radarPilotContracts.js:297](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/radarPilotContracts.js:297).
Frische Belege: [review49_p05_pg17_test.log](review49_p05_pg17_test.log).

1. **ERLEDIGT** — Zwei gültige gleichzeitige Plattformstarts desselben Werks bleiben über Parser → Evaluator → Runner → realen SQL-Upsert → Feed mitsamt beiden Plattformen und zugehörigen Quellen erhalten.
   Nachweis: Parser/Evaluator/Runner und realer SQL-Upsert erhalten beide Plattformen/Quellen.
2. **ERLEDIGT** — Umgekehrte Kandidatenreihenfolge führt zum selben fachlichen Endzustand.
   Nachweis: Umgekehrte Reihenfolge ergibt gleichen fachlichen Endstand.
3. **ERLEDIGT** — Ein identischer Wiederholungsfund bleibt idempotent (`no_change`, keine unnötige neue Version).
   Nachweis: Replay bleibt no_change ohne neue Version.
4. **ERLEDIGT** — Bestehende Textfunde erhalten bei einer Identitätsänderung einen definierten kompatiblen Umgang ohne stille Verdoppelung oder Verlust.
   Nachweis: Neue Leser erhalten migrierte Bestands-UUIDs/Versionen; alte Leser brauchen gesonderte Übergangslösung.
5. **ERLEDIGT** — Account-/Abobindung, Pause/Entfernen und die unveränderten strukturierten Pfade bleiben erhalten; es entsteht kein zusätzlicher Providerrequest.
   Nachweis: Account/Abobindung, Pause und strukturierter Pfad bleiben; keine zusätzlichen Providerrequests.

**Rollout separat OFFEN:** R-RADAR: migrierte release:v2-Bestandsfunde sind für alte release:v1-only Reader nicht lesbar. V1-Schreibkompatibilität allein erfüllt keinen Altclientvertrag.

### KD-REV-E08-003 · Bestehende Personen-Abos lassen sich mit leerem Katalog nicht entfernen

**ERLEDIGT · BEHALTEN.** Eigene Personenabos lassen sich auch bei leerem Suchkatalog entfernen.
Ursprüngliche Ursache: Die Controllerfunktion koppelt jede Personenaktion einschließlich `remove` an `findPersonRadarCatalogIdentity` ohne übergebenen Katalog. Der absichtlich leere Standardkatalog führt dadurch eine gültige, aus dem eigenen bestätigten Feed stammende Identität zu `null`. Der alternative lokale Pfad setzt einen injizierten Gast-Executor voraus und ist für den Kontopfad nicht einschlägig. App bindet den Controller ohne Kataloginjektion an die UI.
Verhalten: Remove validiert gegen bestätigtes eigenes Abo statt gegen Anlagekatalog.
Risiko und Komplexität: Entkoppelt gezielt eine Lebenszyklusaktion. Neue Anlage bleibt kataloggebunden; Fehlerzustände werden sichtbar.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E08-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E08/KD-REV-E08-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/controllers/useEntdeckenRadarController.js:414](/private/tmp/kd-review49-benefit-audit-20260917/src/controllers/useEntdeckenRadarController.js:414), [src/tabs/EntdeckenTab.jsx:99](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/EntdeckenTab.jsx:99).
Frische Belege: [review49_p05_person_ui_test.log](review49_p05_person_ui_test.log).

1. **ERLEDIGT** — Ein gültiges eigenes aktives Personen-Abo lässt sich trotz leerem `PERSON_RADAR_CATALOG` im echten Verwaltungsdialog entfernen; genau eine passende Account-Outbox-Operation nutzt die bestehende Personen-Subscription-Route.
   Nachweis: Echter Dialog/Controller/Outbox entfernt aktives bestätigtes eigenes Abo genau einmal.
2. **ERLEDIGT** — Nach bestätigtem Feed-Sync ist das Abo ausgeblendet und bleibt auch nach Neuladen entfernt.
   Nachweis: Bestätigter Feed/Reload hält Entfernung.
3. **ERLEDIGT** — Dasselbe funktioniert für ein eigenes pausiertes Personen-Abo, sofern die Radarverwaltung erreichbar ist.
   Nachweis: Pausiertes eigenes Abo wird ebenfalls entfernt.
4. **ERLEDIGT** — Unbekannte, fremde oder nicht bestätigte Identitäten dürfen keine Mutation auslösen; Accountwechsel und Kontextguards bleiben wirksam.
   Nachweis: Fremde/unbekannte/unbestätigte Identität und Kontextwechsel lösen keine Mutation aus.
5. **ERLEDIGT** — Ablehnung oder Speicher-/Syncfehler erzeugen eine sichtbare Erklärung, keine vorgetäuschte erfolgreiche Entfernung.
   Nachweis: Ablehnung, Sync- und Storagefehler zeigen Erklärung statt falscher Erfolgsmeldung.

### KD-REV-E08-004 · Zulässiger ID-artiger Freitext blockiert den eigenen Radarfeed und die Entfernung

**ERLEDIGT · BEHALTEN.** Gültige Freitextabos mit IDähnlichem Inhalt machen den gesamten Feed nicht mehr unlesbar.
Ursprüngliche Ursache: Der Freitextvertrag beim Anlegen ist bewusst breiter als die allgemeine Werk-/Titelvalidierung. `validateSubscription` erkennt zwar Textziele, verwendet für deren `title` aber ohne Ausnahme den restriktiven `validTitle`-Guard. Die SQL-Projektion gibt genau den gespeicherten Freitext als `subscription.title` zurück; der Service fail-closed vor jeder weiteren Verarbeitung.
Verhalten: Texttargets benutzen ihren eigenen Textvertrag; Nichttexttitel behalten Präfixsperre.
Risiko und Komplexität: Schmale typabhängige Validation statt globale Lockerung. Echte Freitextlänge bleibt begrenzt.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E08-004](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E08/KD-REV-E08-004.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/radarPilotContracts.js:224](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/radarPilotContracts.js:224), [supabase/migrations/20260917100000_review_radar_text_identity.sql:5](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917100000_review_radar_text_identity.sql:5).
Frische Belege: [review49_p05_pg17_test.log](review49_p05_pg17_test.log).

1. **ERLEDIGT** — `IMDb:tt0068646` und weitere bislang gesperrte Präfixe sind als Textabos über Queue → SQL-Setter → SQL-Feed → Pilotservice nach frischem Cache lesbar.
   Nachweis: Sieben Präfixe gehen durch Queue/SQL/Feed/frische Reconciliation.
2. **ERLEDIGT** — Ein solches Abo blockiert weder weitere eigene Abos/Funde noch deren Reconciliation.
   Nachweis: Geschwisterabos und Funde bleiben lesbar.
3. **ERLEDIGT** — Pausieren und Entfernen funktionieren über den regulären Service ohne direkte Datenbankreparatur.
   Nachweis: Reguläres Pause/Remove funktioniert ohne DBreparatur.
4. **ERLEDIGT** — Leertext, Nichtstrings und überschrittene Freitextlänge bleiben ungültig; technische ID-Präfixe bleiben für Nicht-Text-Werktitel ungültig.
   Nachweis: Leertext, Nichtstrings, Überlänge und technische Nichttexttitel bleiben abgewiesen.
5. **ERLEDIGT** — Normale Texte, Feedvarianten und Kontotrennung behalten ihr bisheriges Verhalten.
   Nachweis: Normaltext, Feedvarianten und Accountgrenzen bleiben kontrolliert.

### KD-REV-E08-005 · Freitext-Abnahmesmoke lehnt zulässige Antworten mit mehreren Websuchen ab

**ERLEDIGT · BEHALTEN.** Der Smokevertrag akzeptiert zulässige drei oder vier Freitext-Websuchen.
Ursprüngliche Ursache: Der Freitext-Smoke enthält den veralteten Ein-Suchaufruf-Vertrag. Der Textadapter baut dagegen `max_uses: 4`, akzeptiert bei der Auswertung exakt 1 bis 4 tatsächliche Suchaufrufe und reicht den Zähler unverändert über Telemetrie und Functionantwort durch. Der Fehler entsteht erst im Testwerkzeug-Readback.
Verhalten: Zählerprüfung und Meldung entsprechen dem bestehenden maximalen Textvertrag1–4.
Risiko und Komplexität: Reine Prüfwerkzeugkorrektur; Requests, Budget und Provenienz werden nicht erweitert.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E08-005](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E08/KD-REV-E08-005.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [tools/radar_freitext_live_contract.mjs:102](/private/tmp/kd-review49-benefit-audit-20260917/tools/radar_freitext_live_contract.mjs:102), [tools/ai_smoke.mjs:1376](/private/tmp/kd-review49-benefit-audit-20260917/tools/ai_smoke.mjs:1376).
Frische Belege: [review49_p03_radar_test.log](review49_p03_radar_test.log), [radar_freitext_live_contract_test.log](radar_freitext_live_contract_test.log).

1. **ERLEDIGT** — Readback akzeptiert genau einen Providerrequest und `searchRequests` 1, 2, 3 oder 4.
   Nachweis: Ein Providerrequest mit1,2,3,4 Suchen wird akzeptiert.
2. **ERLEDIGT** — 0, 5, negative, gebrochene, nichtnumerische oder fehlende Zähler sowie `providerRequests` ungleich 1 bleiben abgewiesen.
   Nachweis: 15 ungültige Zähler-/Providerkombinationen bleiben rot.
3. **ERLEDIGT** — `phaseCode`, Präsentation, Receipt-Provenienz sowie Feed- und Ergebnisprüfungen bleiben wirksam.
   Nachweis: Phase, Präsentation, Receipt und Feed/Resultat bleiben validiert.
4. **ERLEDIGT** — Ein fokussierter Mocktest führt mindestens eine Drei-Suchen-Antwort durch echten Adapter/Runner und Readback; der Smoke-Meldungstext beschreibt den Textvertrag korrekt.
   Nachweis: Echte lokale Adapter/Runner/Readbackkette führt drei Suchen durch; Smokezeichenfolge stimmt.

### KD-REV-E09-001 · Weitere Angaben ersetzt bestätigte Profilfilme ohne Löschhinweis

**ERLEDIGT · BEHALTEN.** Weitere Angaben ergänzen bestätigte Profilfilme, statt still den Bestand zu ersetzen.
Ursprüngliche Ursache: Die Ursache liegt im gemeinsamen Rahmen-Übernahmepfad, nicht im Speichern selbst:
Verhalten: Gemeinsame Rahmenübernahme vereinigt nach Master-ID oder eindeutiger Filmidentität; Richtungsänderung wird sichtbar.
Risiko und Komplexität: Mehr Fachlogik für Duplikate, aber nur ein Annahmeknoten. Viele Ergänzungen können bestehende Größenlimits erreichen; fehlende Identität führt konservativ nicht zum Überschreiben.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E09-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E09/KD-REV-E09-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/profil.js:708](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/profil.js:708), [src/lib/profil.js:716](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/profil.js:716), [src/lib/profil.js:768](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/profil.js:768), [src/components/GeschmackBereich.jsx:370](/private/tmp/kd-review49-benefit-audit-20260917/src/components/GeschmackBereich.jsx:370), [src/components/DreiFragen.jsx:4](/private/tmp/kd-review49-benefit-audit-20260917/src/components/DreiFragen.jsx:4), [src/lib/profil.js:730](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/profil.js:730).
Frische Belege: [review49_p04_personal_test.log](review49_p04_personal_test.log), [extraktion_test.log](extraktion_test.log).

1. **ERLEDIGT** — Profil mit A, weitere Angaben nur B, Bestätigung, Speichern und erneutes Laden ergeben A und B — oder ein separat getesteter, explizit sichtbarer Ersatz.
   Nachweis: A plus bestätigtes B speichert und lädt A+B.
2. **ERLEDIGT** — Keine neue Filmauswahl und Abbruch bewahren bestätigte Filme.
   Nachweis: Keine Auswahl, leere Teilliste und Abbruch erhalten Bestand.
3. **ERLEDIGT** — Die erneute Auswahl desselben Films erzeugt keine Dublette und verliert keinen anderen Film; eine geänderte Richtung wird eindeutig sichtbar behandelt.
   Nachweis: Erneute Auswahl vermeidet Dublette; eindeutige Richtungskorrektur ist sichtbar.
4. **ERLEDIGT** — Ein vorhandener Film außerhalb des aktuellen Angebots bleibt bei einer Ergänzung erhalten.
   Nachweis: Nicht mehr angebotener Altfilm bleibt erhalten.
5. **ERLEDIGT** — Ein gemockter KI-Verfeinerungsfall mit Teil-Filmliste folgt derselben Bestandserhaltungsregel; nur bestätigte Vorschläge dürfen ergänzt werden.
   Nachweis: Gemockte KI-Teilliste nutzt dieselbe endgültige Übernahme; nur bestätigter Vorschlag wird ergänzt.
6. **ERLEDIGT** — Einwilligung, Vorschau-Gate, Rahmenvalidierung und der Versionsschritt pro bestätigtem Durchlauf bleiben wirksam.
   Nachweis: Einwilligung, Vorschau, Validierung und Versionsschritt bleiben in Produkt-/Extraktionstests wirksam.

### KD-REV-E09-002 · Finder-Kinozeitfilter verwechselt einstellige Tage mit späteren Terminen

**ERLEDIGT · BEHALTEN.** Heute-/Morgen-Kinosuche verwechselt den6. nicht mit16. oder26.
Ursprüngliche Ursache: - `src/lib/finder.js:323` bildet den ungepolsterten Schlüssel `T.M.`. `…:361-367` filtert anschließend mit `s.includes(t)` und betrachtet das fälschlich gefüllte Terminarray als ausreichenden Nachweis. - `src/lib/programm.js:120-176` begrenzt den regulären film.at-Lauf auf heute plus drei Tage, führt bei leerem Fenster aber ausdrücklich alle zukünftigen Termine fort (`…:171-174`). `…:99-117` bereinigt Altformatdaten nur nach Vergangenheit und behält Zukunftstermine. - Die App normalisiert Payloads und Cachewerte (`src/App.jsx:576-586`, `…:816-826`), erzeugt die Kinozuordnung (`src/App.jsx:1314-1316`) und übergibt das Ergebnis ohne weitere Datumsprüfung an den Finder (`src/tabs/FinderTab.jsx:152-184`). Treffer und `kino.zeiten` werden anschließend gerendert (`…:425-438`, `…:875-885`).
Verhalten: Beide Suchzweige vergleichen vollständige Tages-/Monatstoken über denselben Helper.
Risiko und Komplexität: Kleiner Parser für bereits normierte Anzeigezeiten; kein universeller Datumparser. Explizite Titelby-pässe und weiche Zeitsemantik bleiben bewusst erhalten.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E09-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E09/KD-REV-E09-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/finder.js:328](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/finder.js:328), [src/lib/finder.js:339](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/finder.js:339).
Frische Belege: [review49_p11_finder_test.log](review49_p11_finder_test.log).

1. **ERLEDIGT** — Bei eingefrorenem 6. September schließen „heute im Kino“ 16.9. und 26.9. aus — auch im film.at-Fallback und nach Cache-Re-Normalisierung.
   Nachweis: 6.9 schließt16/26 aus, auch nach echter Normalisierung/Fallback/Cache.
2. **ERLEDIGT** — „Morgen im Kino“ behält 7.9., schließt 17.9. und 27.9. aus.
   Nachweis: 7.9 schließt17/27 aus.
3. **ERLEDIGT** — Gleichdatierte Termine bleiben erhalten; ausgegebene `zeitenAlle` enthalten nur passende Tage, soweit kein dokumentierter direkter Titel-Bypass greift.
   Nachweis: Ausgegebene zugeordnete Zeiten enthalten nur erlaubte Tage.
4. **ERLEDIGT** — Vorhandene Verträge für direkte Titel, Zeit ohne Kinoquelle und die Vier-Tage-Normalisierung bleiben durch gezielte Kontrollfälle erhalten.
   Nachweis: Direkttitel, Zeit ohne Kino, Normalisierungsfenster sowie DST/Jahreswechsel haben Gegenproben.

### KD-REV-E09-003 · Unbewertete Kino-Funde ignorieren den ausdrücklichen Heute-/Morgenfilter

**ERLEDIGT · BEHALTEN.** Kino-Restfilme außerhalb des angefragten Tages verschwinden vor Ranking und Limit.
Ursprüngliche Ursache: - `src/lib/finder.js:491-555` öffnet in `sucheKino` das Gate bei `quellen.includes("kino")`, prüft in der Schleife Genre/Jahr/Ausschlüsse, aber weder `sig.zeit` noch `pf.z`. Folglich gelangen alle passenden Restfilme in `treffer`. - `src/tabs/FinderTab.jsx:152-184` übergibt `kinoMatches.rest` direkt an `sucheKino`. `…:315-357` zeigt `zeit` als **harten** Filter. `…:902-916` rendert die gelieferten Restfunde ohne nachgelagerte Tagesprüfung. - `src/App.jsx:1314-1328` erzeugt `kinoMatches`; `restSichtbar` ist eine getrennte Kino-Tab-Projektion und nicht der Finder-Eingang. Die globale Suche erzeugt dieselbe Antwort und verdichtet sie anschließend (`src/App.jsx:1371-1380`). Die Verdichtung selbst filtert nicht nach Datum (`src/lib/globalSearchProjection.js:37-66`). - Die Normalisierung liefert regulär mehrere Anzeigetage (`src/lib/programm.js:120-176`); dadurch ist ein zukünftiger Resttermin ein normaler Finder-Eingang und kein Sonderzustand.
Verhalten: Restzweig benutzt denselben Tagesfilter wie Masterzweig.
Risiko und Komplexität: Kleine gemeinsame Logik; Kinofilme mit mindestens einem passenden Termin bleiben. Die Karte kann weiter zusätzliche Termine zeigen; das Ticket fordert hier die Filmauswahl.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E09-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E09/KD-REV-E09-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/finder.js:503](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/finder.js:503).
Frische Belege: [review49_p11_finder_test.log](review49_p11_finder_test.log).

1. **ERLEDIGT** — Ein normalisiertes Programm mit Restfilmen nur heute, morgen und übermorgen liefert für „heute im Kino“ nur heute und für „morgen im Kino“ nur morgen.
   Nachweis: Heute/morgen/übermorgen im echten normierten Programm wird korrekt getrennt.
2. **ERLEDIGT** — Antwortfunktion, gerenderter Finder und kompakte globale Liste zeigen keinen Restfilm außerhalb des angefragten Tages.
   Nachweis: Antwort, Finder-DOM und kompakte Globalliste zeigen nur passende Restfilme.
3. **ERLEDIGT** — Ein Restfilm mit mehreren Terminen bleibt bei mindestens einem passenden Termin enthalten.
   Nachweis: Mehrterminfilm bleibt bei mindestens einem passenden Termin.
4. **ERLEDIGT** — Die Kontrollanfrage „im Kino“ ohne Tag zeigt alle sonst passenden Restfilme; Genre-/Jahresfilter und Titelverträge bleiben erhalten.
   Nachweis: Ohne Tag bleibt Bestand; Genre/Jahr/Titelverträge sind kontrolliert.
5. **ERLEDIGT** — Ein isolierter Regressionstest deckt beide Tage und einen gemischten Bestand aus zugeordneten Masterfilmen und Restfilmen ab, ohne Netz oder Provider.
   Nachweis: Gemischter Master-/Restbestand und beide Tage laufen mit null Netz.

### KD-REV-E09-004 · Vier Bloganalyse-Regressionstests bestehen ohne Ausführung ihrer Testkörper

**ERLEDIGT · BEHALTEN.** Vier vermeintlich grüne Asyncprüfungen laufen jetzt tatsächlich.
Ursprüngliche Ursache: - `blogprofilanalyse_test.mjs:36-42` erwartet bei `checkAsync` bereits ein ausgewertetes Promise/Ergebnis und ruft keinen Callback auf. `…:26-34` prüft den zurückgegebenen Wert nur auf Truthiness. - Bei `…:673-684`, `…:686-699`, `…:1012-1018` und `…:1020-1027` schließen die asynchronen IIFEs mit `}))` statt mit `})())`; ihre Körper werden daher nie betreten. Benachbarte Proben verwenden den aufgerufenen IIFE-Ausdruck, etwa `…:701-710`. - Die Abschlusskontrolle schlägt ausschließlich bei `rot.length > 0` fehl (`…:1080-1084`). Die stillen Funktionsobjekte erhöhen `ok`, nicht `rot`. - Der Test ist in `scripts.test` enthalten (`package.json`); der reguläre CI-Pfad führt `npm test` aus (`.github/workflows/deploy.yml:39-42`).
Verhalten: IIFEs werden aufgerufen; checkAsync lehnt unaufgerufene Funktionen ab.
Risiko und Komplexität: Reiner Testfix ohne Produktänderung. Sentinelproben sind sinnvoll, weil sie das ursprüngliche falsche Grün ausschließen.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E09-004](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E09/KD-REV-E09-004.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [blogprofilanalyse_test.mjs:36](/private/tmp/kd-review49-benefit-audit-20260917/blogprofilanalyse_test.mjs:36).
Frische Belege: [review49_p03_blog_execution_test.log](review49_p03_blog_execution_test.log), [blogprofilanalyse_test.log](blogprofilanalyse_test.log).

1. **ERLEDIGT** — Der normale Einzeldateilauf betritt alle vier Testkörper.
   Nachweis: Alle vier Körper werden vom Originaltest betreten.
2. **ERLEDIGT** — Die vier ursprünglichen Assertions bestehen gegen unveränderte Produktmodule.
   Nachweis: Ursprüngliche Assertions bestehen; normaler Test meldet149 erfolgreich.
3. **ERLEDIGT** — Je eine gezielte lokale Sentinel-Mutation in jedem der vier Körper wird als Fehler gezählt und ergibt einen von null verschiedenen Prozess-Exit.
   Nachweis: Jeder einzelne Sentinel führt im eigenen Prozess zu Fehlerexit.
4. **ERLEDIGT** — Falls der Helfer abgesichert wird, darf er ein unaufgerufenes Funktionsobjekt nicht als erfolgreiche Assertion verbuchen.
   Nachweis: Funktionsobjekt wird ausdrücklich abgewiesen.

### KD-REV-E10-001 · JSON-null verwirft den AI-Handler statt einer kontrollierten Fehlerantwort

**ERLEDIGT · BEHALTEN.** Null und andere nicht objektförmige JSONrequests enden kontrolliert vor allen Außenwirkungen.
Ursprüngliche Ursache: Der TypeScript-Cast `Record<string, unknown>` validiert die Laufzeitform des Parse-Ergebnisses nicht. Der Parse-Catch deckt nur syntaktisch ungültiges JSON ab. Der erste Propertyzugriff liegt danach, aber vor Aktivierungsschalter und allen weiteren Gates; `Deno.serve` registriert den Handler direkt ohne zusätzliche anwendungsseitige Fehlerhülle.
Verhalten: Schmale Objektwurzelprüfung direkt nach JSON.parse.
Risiko und Komplexität: Bewusste Erweiterung des Formguards auf Arrays/Primitive; gültige Nullfelder bleiben zulässig. Kein Handlerumbau.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E10-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E10/KD-REV-E10-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/functions/ai-task/index.ts:4041](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/ai-task/index.ts:4041).
Frische Belege: [ai_task_P06.log](ai_task_P06.log), [ai_task_neighbor_guards.log](ai_task_neighbor_guards.log).

1. **ERLEDIGT** — `null` und Whitespace-`null` liefern mit aktivem wie deaktiviertem KI-Schalter kontrolliert 400/`invalid-response`; das Promise wird nicht verworfen.
   Nachweis: Null und Whitespace-null ergeben400 in beiden Aktivierungsmodi.
2. **ERLEDIGT** — Die Ablehnung geschieht vor `createClient`, Auth, DB und Provider und benötigt keinen Netzwerkaufruf.
   Nachweis: Mockaufrufzahl bleibt0 vor Auth/DB/Provider.
3. **ERLEDIGT** — Malformed JSON, `OPTIONS`, Nicht-POST und normale Objektrequests behalten ihr bisheriges Verhalten.
   Nachweis: Originalfälle OPTIONS, NichtPOST und kaputtes JSON bestehen in separatem Handlerfilter.
4. **ERLEDIGT** — Arrays und primitive JSON-Wurzeln werden bewusst in den Formvertrag aufgenommen und getestet; zulässige `null`-Felder innerhalb eines gültigen Requestobjekts werden nicht pauschal abgelehnt.
   Nachweis: Arrays und Primitive werden abgelehnt, null als Objektfeld bleibt gültig.

### KD-REV-E10-002 · Modelldiagnose meldet Body-Timeout und unlesbares JSON als erfolgreichen leeren Katalog

**ERLEDIGT · BEHALTEN.** Ein nach Headern gescheiterter Modellkatalog wird nicht mehr als erfolgreicher leerer Katalog verbucht.
Ursprüngliche Ursache: `antwort` wird unmittelbar nach Empfang der Header gesetzt. Der äußere Catch setzt bei einem Abort zwar `diagZeitUeberschritten`, der auswertende Fehlerzweig prüft jedoch nur `!antwort`. Deshalb läuft bei vorhandener HTTP-200-Response der Erfolgspfad weiter. Ein gewöhnlicher Parsefehler setzt `daten = null`; der Nullish-Fallback erzeugt `[]` und der Erfolgsabschluss erfolgt unbedingt.
Verhalten: Erfolg setzt fertig gelesene gültige Struktur voraus; Timeout und Antwortfehler schließen gezielt ab.
Risiko und Komplexität: Zusätzliche Strukturvalidierung im vorhandenen Diagnosezweig. Gültige leere Liste bleibt als Diagnose erlaubt, P8 verlangt weiterhin eine ID.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E10-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E10/KD-REV-E10-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/functions/ai-task/index.ts:4394](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/ai-task/index.ts:4394), [supabase/functions/ai-task/index.ts:4431](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/ai-task/index.ts:4431), [supabase/functions/ai-task/index.ts:4453](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/ai-task/index.ts:4453).
Frische Belege: [ai_task_P06.log](ai_task_P06.log), [ai_task_neighbor_guards.log](ai_task_neighbor_guards.log).

1. **ERLEDIGT** — HTTP 200 mit Bodyabort nach Headern liefert `ok:false`, Fehlerstatus, Grund `anbieter-zeitgrenze` und genau einen Fehlerabschluss mit Kosten 0.
   Nachweis: Postheaderabort liefert Zeitgrenze, Fehler und genau einen Nullkostenabschluss.
2. **ERLEDIGT** — HTTP 200 mit ungültigem JSON oder fehlender gültiger Katalogstruktur liefert einen definierten Antwortfehler statt 200/`[]`.
   Nachweis: Bodyfehler, invalidJSON/null/array/missing/bad-item werden nicht grün.
3. **ERLEDIGT** — Eine gültige Modellliste bleibt HTTP 200/`ok:true` und wird genau einmal fertig abgeschlossen.
   Nachweis: Originaler nichtleerer Katalog und gültiger leerer Katalog schließen einmal erfolgreich.
4. **ERLEDIGT** — Netzfehler vor Headern, HTTP-Fehler und abgelehnte Start-RPCs behalten ihre Fehler- bzw. Sperrwirkung; bei Startablehnung erfolgt kein Anbieteraufruf.
   Nachweis: Originale Startablehnung, Vorheadernetzfehler und HTTPfehler bleiben wirksam.
5. **ERLEDIGT** — P8 bleibt ohne Modell-ID gesperrt; die bestehenden Sicherheitsgrenzen regressieren nicht.
   Nachweis: P8-Originalblock stoppt ohne ID; Notaus/Registry-/Nullkostengrenzen sind mitgeprüft.

### KD-REV-E10-003 · Filmwissen-Quellenadapter hebt das Timeout vor dem Lesen des Antwortbodys auf

**ERLEDIGT · BEHALTEN.** Öffentliche Quellenadapter können nicht mehr nach erfolgreichen Headern unbegrenzt am Body hängen.
Ursprüngliche Ursache: Der `try`/`catch`/`finally`-Block des gemeinsamen `holeJson` umfasst nur `fetch`. Das `finally` löscht den Abbruchmechanismus an Zeile 190; danach wartet der Bodyleser an Zeile 134 beziehungsweise dessen Aufruf an Zeile 213. Die Umwandlung eines `AbortError` in `adapter-timeout` liegt ebenfalls außerhalb möglicher Body-Lesefehler.
Verhalten: Timer deckt die gesamte begrenzte Bodydekodierung ab; Reader wird in finally freigegeben.
Risiko und Komplexität: Kleine Lebensdauerreparatur am Transport. Reale Fetch-Abbruchwirkung bleibt Voraussetzung, nicht jeder beliebige Mock muss AbortSignal ignorieren dürfen.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E10-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E10/KD-REV-E10-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/functions/filmwissen-task/quellen.ts:122](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/filmwissen-task/quellen.ts:122), [supabase/functions/filmwissen-task/quellen.ts:158](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/filmwissen-task/quellen.ts:158), [supabase/functions/filmwissen-task/quellen.ts:232](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/filmwissen-task/quellen.ts:232).
Frische Belege: [review49_p06_transport_test.log](review49_p06_transport_test.log).

1. **ERLEDIGT** — Ein sofortiger HTTP-200-Header mit offenem Body endet innerhalb Frist plus kleiner Laufzeittoleranz mit `adapter-timeout`; dies ist für beide öffentlichen Adapter mit abbrechbaren Mock-Streams belegt.
   Nachweis: Offener Body beider Adapter endet mit adapter-timeout innerhalb25ms plus Toleranz.
2. **ERLEDIGT** — Dasselbe gilt für einen Body, der nach einem kleinen ersten Chunk stockt.
   Nachweis: Stocken nach erstem Chunk endet ebenso.
3. **ERLEDIGT** — Header-Stall bleibt `adapter-timeout`; ein vollständig rechtzeitig gelieferter gültiger Body wird normal verarbeitet.
   Nachweis: Headerstall und rechtzeitiger gültiger Body bleiben korrekt.
4. **ERLEDIGT** — Nach Abbruch erfolgt keine weitere erfolgreiche Bodyverarbeitung/Auflösung; Timer und Streamressourcen werden freigegeben.
   Nachweis: Reader ist nach Fehler entsperrt und rechtzeitig fertiger Request wird nachträglich nicht abgebrochen.
5. **ERLEDIGT** — HTTP-, Rate-Limit-, Content-Type-, Größen-, UTF-8- und JSON-Fehler bleiben sinnvoll klassifiziert.
   Nachweis: 32 Transportfälle erhalten HTTP/Rate/Type/Size/UTF8/JSONklassifikation.

### KD-REV-E10-004 · Filmwissen verliert den TMDB-Medientyp und ordnet Filmbelege Serien zu

**ERLEDIGT · BEHALTEN.** Gleiche TMDB-Nummern verschiedener Werkarten teilen keinen Filmwissenbericht oder laufenden Request.
Ursprüngliche Ursache: Der Identitätsvertrag beschränkt sich durchgängig auf `namespace` und `kennung`; `film.typ` wird im Helper verworfen. Der SQL-Primärschlüssel und die Read-RPC übertragen keinen angefragten Werktyp. Der Decoder prüft nur, ob die Antwort ein erlaubter Werktyp ist, nicht dessen Übereinstimmung mit dem Anfragewerk. Die Forecast-Übernahme entfernt `cache.werk`, bevor sie den Kandidaten validiert.
Verhalten: Typed Kennungen an Filmwissengrenze, Typprüfung im Cache/Forecast und film-only Quellenfence; persönliche TMDB-Felder bleiben numerisch.
Risiko und Komplexität: Hoher Migrations-/Rolloutpreis gegenüber einem bloßen Serienfence. Neuer Client passt nicht zum alten Server; alter Client nicht zum strikten neuen TMDBnormierer. Gemischter Betrieb braucht Übergang.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E10-004](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E10/KD-REV-E10-004.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/filmwissen.js:23](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/filmwissen.js:23), [src/services/filmwissen.js:37](/private/tmp/kd-review49-benefit-audit-20260917/src/services/filmwissen.js:37), [src/components/EintragForm.jsx:128](/private/tmp/kd-review49-benefit-audit-20260917/src/components/EintragForm.jsx:128), [src/components/EintragForm.jsx:158](/private/tmp/kd-review49-benefit-audit-20260917/src/components/EintragForm.jsx:158), [tools/filmwissen_live_target.mjs:57](/private/tmp/kd-review49-benefit-audit-20260917/tools/filmwissen_live_target.mjs:57), [tools/ai_smoke.mjs:1010](/private/tmp/kd-review49-benefit-audit-20260917/tools/ai_smoke.mjs:1010), [supabase/migrations/20260917110000_review_filmwissen_identity.sql:10](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917110000_review_filmwissen_identity.sql:10).
Frische Belege: [review49_p06_identity_test.log](review49_p06_identity_test.log), [review49_p06_sql_test.log](review49_p06_sql_test.log), [ai_task_P06.log](ai_task_P06.log), [review49_p06_form_identity_test.log](review49_p06_form_identity_test.log), [filmwissen_live_target_test.log](filmwissen_live_target_test.log).

1. **ERLEDIGT** — Film und Serie mit gleicher TMDB-Nummer teilen weder Filmwissen-Identität noch In-flight-Deduplizierung.
   Nachweis: Film/Serie mit77 erzeugen getrennte Identität und In-flight-Keys.
2. **ERLEDIGT** — Serien-Read und -Recherche akzeptieren keinen Filmbericht als belegt, auch nicht nach IMDb-`cache_miss`.
   Nachweis: Falscher Filmbericht wird auch nach IMDbmiss nicht als Serienbeleg akzeptiert.
3. **ERLEDIGT** — Der Film-only-Adapter weist eine Serien-TMDB-Anfrage vor Quellenzugriff ab, oder ein expliziter Serienadapter verwendet einen korrekten typisierten Vertrag.
   Nachweis: tv-TMDB endet vor Quellen, Vorbereitung und Kosten.
4. **ERLEDIGT** — Der Forecast prüft die Cache-Werkidentität; ein Filmbericht erzeugt für eine Serie keine Filmwissen-Provenienz.
   Nachweis: Echter Forecast verwirft falschen Typ und meldet persönliche Schätzung statt Filmwissenprovenienz.
5. **ERLEDIGT** — Gültige IMDb-Treffer und reguläre Film-TMDB-Treffer bleiben funktionsfähig.
   Nachweis: IMDb und movie-TMDB samt Quellensynthese und36 Formularfällen bleiben gültig.
6. **ERLEDIGT** — Migration und Read-RPC unterscheiden Film und Serie mit gleicher numerischer TMDB-ID sicher; Altkennungen sind eindeutig behandelt.
   Nachweis: PG17 migriert Filmkennungen, sperrt unsichere Nichtfilmaltzuordnung und trennt movie/tv/collection; Rolloutfrage bleibt separat offen.

**Rollout separat OFFEN:** R-TMDB: typed neue Requests und alte Numericrequests benötigen einen expliziten Client-/Function-/SQL-Übergang; keine sichere Release-Reihenfolge durch bloß gleichzeitiges Deployen.

### KD-REV-E11-001 · Standardwert 12 wird als unbegrenzte Wiederholung gespeichert

**ERLEDIGT · BEHALTEN.** Sichtbare Standardanzahl12 begrenzt den Reminder tatsächlich auf12 Termine.
Ursprüngliche Ursache: Der Select ersetzt ende beim Wechsel nur durch den Typ. Das danach sichtbare kontrollierte Zahlenfeld zeigt zwar den Fallback 12, schreibt ihn aber ohne change-Ereignis nicht in den Entwurf. Der Submit übergibt den Entwurf unverändert; neuerFolgenReminder normalisiert die fehlende Anzahl. Number(undefined) ist nicht ganzzahlig und normalisiereEnde fällt deshalb auf typ:nie zurück. Die spätere Persistenz kann diese verlorene Absicht nicht rekonstruieren.
Verhalten: Auswahlwechsel setzt12 im Entwurf statt nur im Anzeigefallback.
Risiko und Komplexität: Sehr kleiner UIzustandsfix; bewusstes Wechseln der Endart setzt den vorgesehenen Standard. Bestehende Anzahl bleibt beim bloßen Bearbeiten erhalten.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E11-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E11/KD-REV-E11-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/components/Wochenplan.jsx:209](/private/tmp/kd-review49-benefit-audit-20260917/src/components/Wochenplan.jsx:209), [src/components/Wochenplan.jsx:213](/private/tmp/kd-review49-benefit-audit-20260917/src/components/Wochenplan.jsx:213).
Frische Belege: [review49_p09_browser_test.log](review49_p09_browser_test.log), [review49_p09_product_test.log](review49_p09_product_test.log).

1. **ERLEDIGT** — Ein neuer gültiger Reminder mit „nach Terminen“ und unverändert sichtbarer 12 speichert ende={typ:anzahl, anzahl:12}.
   Nachweis: Fünf Reminderarten speichern unveränderten sichtbaren Standard12.
2. **ERLEDIGT** — Der 12. passende Termin ist fällig, der 13. nicht; der Serien-ICS enthält COUNT=12.
   Nachweis: Termin12 fällig,13 nicht; ICS COUNT12.
3. **ERLEDIGT** — Explizit eingegebene Zahlen und bestehende begrenzte Reminder bleiben korrekt.
   Nachweis: Bestehende7 und explizite9 werden erhalten.
4. **ERLEDIGT** — Beim Wechsel von nie oder datum nach anzahl stimmen sichtbarer und gespeicherter Wert auch im Bearbeitungsmodus überein.
   Nachweis: Wechsel von nie/datum nach Anzahl ist im Bearbeitungsmodus konsistent.
5. **ERLEDIGT** — Nach erfolgreichem Speichern und JSON-Readback bleibt die Anzahl erhalten; bewusstes nie und ein Enddatum behalten ihre bisherige Bedeutung.
   Nachweis: JSON-/LocalStorage-Rücklesen hält Werte; nie und Datum bleiben gültig.

### KD-REV-E11-002 · Persönliche Kinoempfehlungen verlieren Fokusnavigation

**ERLEDIGT · BEHALTEN.** Persönlich empfohlene Kinokarten sind über Suche und Pinboard genauso erreichbar wie neutrale Karten.
Ursprüngliche Ursache: KinoTab entfernt empfohlene film.at-IDs aus restGefiltert, rendert deren Ersatzkarten aber ohne Wrapper-Anker, tabIndex und fokusAktiv. Der Fokus-Effect sucht ausschließlich data-kino-suchtreffer und quittiert auch den Fall ohne Ziel. KompaktEintrag öffnet nur bei truthy fokusAktiv, dessen Default im Empfehlungspfad false bleibt.
Verhalten: Empfehlungslane erhält denselben stabilen Fokusanker, Wrapper und Öffnungssignal; ohne Ziel keine Quittierung.
Risiko und Komplexität: Kleine Wiederherstellung eines gemeinsamen UIvertrags. Kein neues Ranking, kein RAF-Retryloop; Datenänderung kann ausstehenden Fokus erneut zustellen.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E11-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E11/KD-REV-E11-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/tabs/KinoTab.jsx:111](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/KinoTab.jsx:111), [src/tabs/KinoTab.jsx:490](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/KinoTab.jsx:490), [src/tabs/KinoTab.jsx:497](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/KinoTab.jsx:497).
Frische Belege: [review49_p10b_browser_test.log](review49_p10b_browser_test.log).

1. **ERLEDIGT** — Derselbe gültige Programmeintrag wird mit und ohne passendes Profil nach art:programm-Fokusauftrag fokussiert, mit scrollIntoView adressiert und geöffnet.
   Nachweis: Mit/ohne Profil erhalten identische Programm-ID echten Fokus, Scroll und offene Details.
2. **ERLEDIGT** — Das gilt sowohl bei Fokus bereits beim Mount (Tabwechsel) als auch bei einem neuen Auftrag im geöffneten KinoTab.
   Nachweis: Mountauftrag und neuer Auftrag im geöffneten Tab sind geprüft.
3. **ERLEDIGT** — App darf den erfolgreich zugestellten Fokusauftrag löschen, ohne die geöffneten Details wieder zu schließen.
   Nachweis: Löschen des zugestellten Fokus schließt Details nicht.
4. **ERLEDIGT** — Globale Suche und auflösbarer Kino-Pin verwenden dieselbe stabile Programmidentität; der Film erscheint weiter genau einmal.
   Nachweis: Echte Appcallbackkette für Suche/Kinopin/Titelpin führt zum selben einmaligen Ziel.
5. **ERLEDIGT** — Neutrale Restkarten und gematchte Mediathek-Karten behalten ihr bisheriges Fokusverhalten.
   Nachweis: Neutrale Karte und gematchte Masterkarte bleiben funktional.

### KD-REV-E11-003 · Legacy-Streamingabgleich verknüpft Konfliktfälle mit falschem Mediathekwerk

**ERLEDIGT · BEHALTEN.** Legacy-Alles verknüpft widersprüchliche Werke nicht mehr allein über eine passende IDnummer.
Ursprüngliche Ursache: gleicheMediathekStatusAb nutzt im Nicht-MotN-Zweig die erste gemeinsame Watchmode-, IMDb- oder TMDb-ID in Masterreihenfolge. Dieser Pfad prüft weder Typ/Jahr noch widersprechende andere IDs oder Mehrdeutigkeit. Die Nachbereinigung akzeptiert jede noch existente mediathek_id. bestaetigteMediathekNavigationId wiederholt den lockeren Abgleich und bestätigt nur erneut irgendeine gemeinsame ID; der zuvor erkannte Konflikt wird nicht wiederhergestellt.
Verhalten: Legacystatus und progressive Aktionen nutzen die vorhandene strenge Identitätsentscheidung.
Risiko und Komplexität: Bewusster Verlust unsicherer alter Links; Gesehenhistorie bleibt. Bereits existierender WeakMapindex vermeidet zusätzliche lineare Indexbauten pro Karte.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E11-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E11/KD-REV-E11-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/lib/staffeln.js:49](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/staffeln.js:49), [src/lib/staffeln.js:106](/private/tmp/kd-review49-benefit-audit-20260917/src/lib/staffeln.js:106), [src/tabs/StreamingTab.jsx:55](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/StreamingTab.jsx:55).
Frische Belege: [review49_p07_state_test.log](review49_p07_state_test.log), [review49_p07_browser_test.log](review49_p07_browser_test.log).

1. **ERLEDIGT** — Gleiche TMDb-ID bei widersprüchlicher Werkart oder Bezugsjahr führt nach baueStreamingAnsichten zu keinem Mediathekstatus und keinem Navigationsziel.
   Nachweis: TMDBtyp-/Jahrkonflikt liefert weder Statuszuordnung noch Navigation.
2. **ERLEDIGT** — Gemeinsame ID mit widersprechender weiterer starker ID sowie mehrere widersprüchliche Kandidaten erzeugen unabhängig von Masterreihenfolge keine automatische Verknüpfung.
   Nachweis: Weitere IDkonflikte und mehrdeutige Reihenfolgen verknüpfen nicht automatisch.
3. **ERLEDIGT** — Eine bereits falsch gespeicherte, noch existente mediathek_id bleibt bei erneut bestätigtem Konflikt weder gültige Zuordnung noch Link; gesehen und unabhängige historische Felder bleiben erhalten.
   Nachweis: Falsch gespeicherte existierende ID wird bei Konflikt entfernt, Gesehenfelder erhalten.
4. **ERLEDIGT** — Der gerenderte Legacy-Alles-Pfad zeigt keinen falschen „Zum Eintrag“-Link und ermöglicht für den Konflikttitel eine eigene Erstellung.
   Nachweis: Legacybrowser zeigt Erstellen statt falschem Link.
5. **ERLEDIGT** — Gültige eindeutige Identitäten und bestehende strenge Known-/progressive Zuordnungen funktionieren weiter; der Missing-RPC-Fallback bleibt mit Mocks testbar.
   Nachweis: Gültige eindeutige Zuordnung sowie Missing-RPC-Fallback und progressive Kontrollen bestehen.

### KD-REV-E11-004 · Persönlicher Kinoreminder verliert beim Öffnen die Filmreferenz eines Mediathektreffers

**ERLEDIGT · BEHALTEN.** Persönliche Kinoreminder öffnen bei aktuellem Mediathekmatch die richtige Filmkarte.
Ursprüngliche Ursache: StartTab baut für gematchte Kinofilme einen kinoKatalog-Eintrag mit programm_ref und film_ref. reminderVerknuepfung bewahrt diese Quelle, erzeugt als Ziel aber nur die Programmreferenz. wochenansicht hält film_ref ausschließlich in quelle. Wochenplan.ansehen erweitert den Reminder nur um programm_ref. Der unverändert durch StartTab an App weitergereichte Callback wählt die Fokusart allein anhand eines obersten film_ref; dieses fehlt beim persönlichen Reminder. Der Normalisierer übernimmt auch aus alten gespeicherten Daten keine oberste film_ref, sodass kein späterer Reparaturpfad vorhanden ist.
Verhalten: Klicktransport erhält die aktuell aufgelöste film_ref zusätzlich zur Programmreferenz.
Risiko und Komplexität: Ein Referenzfeld im vorhandenen Pfad statt neuer Suchlogik. Gelöste/fehlende Ziele bleiben ohne irreführende Aktion.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E11-004](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E11/KD-REV-E11-004.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/components/Wochenplan.jsx:329](/private/tmp/kd-review49-benefit-audit-20260917/src/components/Wochenplan.jsx:329), [src/tabs/StartTab.jsx:364](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/StartTab.jsx:364), [src/App.jsx:1923](/private/tmp/kd-review49-benefit-audit-20260917/src/App.jsx:1923).
Frische Belege: [review49_p09_product_test.log](review49_p09_product_test.log), [review49_p10b_browser_test.log](review49_p10b_browser_test.log).

1. **ERLEDIGT** — Ein automatisch verknüpfter persönlicher Kinoreminder zu einem Mediathekmatch öffnet, fokussiert und scrollt zu film:<Master-ID>.
   Nachweis: Automatischer Reminder öffnet/fokussiert/scrollt echte Masterkarte.
2. **ERLEDIGT** — Das gilt für manuelle Verknüpfung und für einen zuvor ungematchten, inzwischen zur Mediathek hinzugefügten Film anhand der aktuell aufgelösten Filmreferenz.
   Nachweis: Manuelle Verknüpfung und inzwischen angelegter Film verwenden aktuelle Referenz.
3. **ERLEDIGT** — Ein neutraler Programmeintrag ohne Mediathekmatch behält programm:<Programm-ID>; Pins und Vorschläge bleiben funktionsfähig.
   Nachweis: Neutrales Programmziel, Pin und Vorschlag bleiben Programm-/Filmidentitätstreu.
4. **ERLEDIGT** — Fehlende oder explizit gelöste Ziele zeigen keinen irreführenden Öffnungsbutton.
   Nachweis: Detached/fehlende Ziele haben keinen falschen Öffnungsbutton.
5. **ERLEDIGT** — Ein Regressionstest durchläuft Reminderprojektion, Klicktransport und tatsächliche Zielkarte; das Prüfen von quelle oder ziel allein genügt nicht.
   Nachweis: Originalprojektion, Wochenplanklick, Appcallback und echte Kinozielkarte werden zusammen ausgeführt.

### KD-REV-E11-005 · Leerzeichentitel löst beim Speichern eines Reminders eine unbehandelte Promise-Ablehnung aus

**ERLEDIGT · BEHALTEN.** Leere Remindertitel verursachen weder stillen Verlust noch unhandledRejection.
Ursprüngliche Ursache: ReminderEditor prüft nur die native required-Bedingung, nicht den getrimmten Titel. normalisiereWochenplan verwirft diesen Titel und neuerFolgenReminder liefert deshalb null. Wochenplan.speichere behandelt dieses nullable Ergebnis trotzdem als Objekt; der Zugriff e.id erfolgt vor schreibePlan und somit vor dessen try/catch. Eine spätere Persistenznormalisierung kann den Pfad nicht abfangen.
Verhalten: Trimvalidierung erklärt den Fehler im Formular; nullable Konstruktorergebnis wird vor Zugriff abgefangen.
Risiko und Komplexität: Kleine lokale Eingabegrenze. Kein Datenmodellwechsel und keine bestehende Planlöschung.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E11-005](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E11/KD-REV-E11-005.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/components/Wochenplan.jsx:99](/private/tmp/kd-review49-benefit-audit-20260917/src/components/Wochenplan.jsx:99), [src/components/Wochenplan.jsx:156](/private/tmp/kd-review49-benefit-audit-20260917/src/components/Wochenplan.jsx:156), [src/components/Wochenplan.jsx:306](/private/tmp/kd-review49-benefit-audit-20260917/src/components/Wochenplan.jsx:306).
Frische Belege: [review49_p09_browser_test.log](review49_p09_browser_test.log), [review49_p09_product_test.log](review49_p09_product_test.log).

1. **ERLEDIGT** — Leerstring und reine Leerzeichen werden beim Anlegen sowie beim Bearbeiten verständlich zurückgewiesen, bei leerem und nichtleerem Plan.
   Nachweis: Leerstring/Whitespace in Neu/Bearbeiten bei leerem/vorhandenem Plan zeigen Fehler.
2. **ERLEDIGT** — Bei ungültigem Titel gibt es keinen unhandledRejection, keinen Aufruf von onPlanAendern und keine Planänderung.
   Nachweis: Keine Writes, Planänderung oder unhandledRejection.
3. **ERLEDIGT** — Das Formular bleibt korrigierbar; ein anschließend gültiger Titel wird genau einmal gespeichert.
   Nachweis: Korrektur im offenen Formular speichert genau einmal.
4. **ERLEDIGT** — Gültige neue und bearbeitete Reminder behalten ihr Verhalten; nullable Konstruktorergebnisse werden vor Objektzugriff abgefangen.
   Nachweis: Gültige Pfade bleiben; Konstruktor-Null wird im produktiven Callback abgefangen.

### KD-REV-E12-001 · Radar-Vorschau schneidet Kopf und Schließen-Fläche im Zwischen-Breakpoint ab

**ERLEDIGT · BEHALTEN.** Radarvorschau und Schließenfläche bleiben an den Tabletgrenzen im Viewport.
Ursprüngliche Ursache: Die CSS-Kaskade widerspricht im Zwischenbereich der Vollhöhen-Regel:
Verhalten: Generisches Layerpadding wird für die vorhandene Vollhöhenregel bis760px konsistent.
Risiko und Komplexität: Zwei CSSzeilen, keine neue Layoutarchitektur. Physische iPhone-Safe-Area bleibt unbelegt.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E12-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E12/KD-REV-E12-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/styles/design-secondary.css:264](/private/tmp/kd-review49-benefit-audit-20260917/src/styles/design-secondary.css:264), [src/styles/design-secondary.css:271](/private/tmp/kd-review49-benefit-audit-20260917/src/styles/design-secondary.css:271).
Frische Belege: [review49_p05_layout_test.log](review49_p05_layout_test.log).

1. **ERLEDIGT** — Mit der originalen Radar-Vorschau und finaler CSS-Importreihenfolge liegen bei `521x800`, `600x800`, `667x375` und `760x800` Dialog, Vorschauhinweis, Dialogkopf und die gesamte 44-Pixel-Schließen-Fläche innerhalb des Viewports.
   Nachweis: 521,600,667quer und760: reale Dialog-/44px-Geometrie liegt im Viewport.
2. **ERLEDIGT** — Nach dem originalen Autofokus und bei `scrollTop=0` sind die Elemente unmittelbar sichtbar; kein Fokus- oder Scroll-Trick ist nötig.
   Nachweis: Autofokus und scrollTop0 benötigen keinen Rettungsscroll.
3. **ERLEDIGT** — `393x852` und `520x800` behalten die funktionierende mobile Darstellung; `761x800` und `1280x900` behalten den zentrierten Desktopdialog.
   Nachweis: 393/520 mobil und761/1280 desktop bleiben korrekt.
4. **ERLEDIGT** — Touch-Schließen, Abbrechen und Keyboard-Escape funktionieren weiterhin. Die Manager-Safe-Area-Ausnahme bleibt unverändert wirksam.
   Nachweis: Touchclose, Abbrechen, Escape und Managerausnahme bestehen.
5. **ERLEDIGT** — Mindestens Chromium und WebKit decken die Grenzbreiten ab. Eine physische iPhone-/PWA-Safe-Area-Prüfung ist zusätzlich erforderlich, falls eine entsprechende Geräteabnahme behauptet werden soll.
   Nachweis: Chromium und WebKit prüfen alle Grenzbreiten; daraus folgt keine Geräteabnahme.

### KD-REV-E12-002 · Kino- und Streaming-Katalogkarten haben keinen direkten Tastatur-Detailzugang

**ERLEDIGT · BEHALTEN.** Kino- und Streamingdetails sind direkt mit Tastatur erreichbar.
Ursprüngliche Ursache: - `/private/tmp/kd-vollreview-20260916/source/src/tabs/KinoTab.jsx:585`–`...:624` (`src/tabs/KinoTab.jsx:585-624`): `KompaktEintrag` startet mit `offen=false`; der Kartenkopf in Zeilen 597–599 schaltet ausschließlich per Maus-`onClick`. Der an `offen` gebundene Block ab Zeile 624 enthält Terminbuttons und Formularzugang.
Verhalten: Benannte native Buttons mit aria-expanded ergänzen die bestehenden Disclosurewege.
Risiko und Komplexität: Bewusster zusätzlicher Tabstopp; innere Aktionen bleiben eigene Ziele statt verschachtelter Buttons. Kleine UIänderung.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E12-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E12/KD-REV-E12-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/tabs/KinoTab.jsx:631](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/KinoTab.jsx:631), [src/tabs/StreamingTab.jsx:890](/private/tmp/kd-review49-benefit-audit-20260917/src/tabs/StreamingTab.jsx:890), [src/styles/streaming-progressive.css:46](/private/tmp/kd-review49-benefit-audit-20260917/src/styles/streaming-progressive.css:46).
Frische Belege: [review49_p07_browser_test.log](review49_p07_browser_test.log), [review49_p10b_browser_test.log](review49_p10b_browser_test.log).

1. **ERLEDIGT** — In Kino/„Läuft auch“ und bei Kino-Profil-Empfehlungen außerhalb der Mediathek erreicht Tab einen benannten Detailtrigger; Enter und Leertaste öffnen und schließen. Anschließend sind vorhandene Terminpins und „Eintrag erstellen“ erreichbar.
   Nachweis: Kino neutral/Empfehlung: Tab, Enter/Space, Terminpin und Anlage erreichbar.
2. **ERLEDIGT** — In Streaming/„Alles“ und „Neu“ funktioniert derselbe direkte Weg für ungesehene, gesehene und bereits zugeordnete Titel — ohne Statusänderung, zusätzliche Suche oder Mausklick.
   Nachweis: Streaming Alles/Neu mit ungesehen/gesehen/zugeordnet wird nativ bedient.
3. **ERLEDIGT** — Das Aktivieren innerer Links, Pin-, Merk-, Gesehen-, Formular- oder Terminaktionen löst nicht zusätzlich das Disclosure aus. Bestehender Suchfokus darf weiter gezielt öffnen.
   Nachweis: Innere Aktionen schalten Disclosure nicht nebenbei; Fokusnavigation öffnet gezielt.
4. **ERLEDIGT** — Fokussierte lokale Browsertests verwenden native Tab-, Enter- und Leertasten-Eingaben, prüfen `aria-expanded` sowie den sichtbaren Zustand und bewahren die bestehenden Gesehen-/Zuordnungsbedingungen.
   Nachweis: Beide Browser prüfen Tastatur, aria-expanded, sichtbaren Zustand und Zuordnungsbedingungen.

### KD-REV-E12-003 · Wochentag-Labels im Wochenplan-Editor überlappen auf schmalen Viewports

**ERLEDIGT · BEHALTEN.** Schmale Wochenplaneditoren haben tatsächlich getrennte bedienbare Tagesflächen.
Ursprüngliche Ursache: - `/private/tmp/kd-vollreview-20260916/source/src/index.css:1514`–`...:1520` (`src/index.css:1514-1520` am Prüfcommit) definiert sieben `minmax(0,1fr)`-Gridspalten und setzt für die enthaltenen Labels zugleich `min-width:44px`.
Verhalten: Grid bricht ab44px Mindestbreite um statt sieben Spalten zu erzwingen.
Risiko und Komplexität: Ein CSSwechsel kann mehr vertikale Höhe brauchen; das ist der notwendige Preis echter Touchflächen. Daten-/Checkboxlogik bleibt gleich.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E12-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E12/KD-REV-E12-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/index.css:1514](/private/tmp/kd-review49-benefit-audit-20260917/src/index.css:1514), [src/index.css:1516](/private/tmp/kd-review49-benefit-audit-20260917/src/index.css:1516).
Frische Belege: [review49_p09_browser_test.log](review49_p09_browser_test.log).

1. **ERLEDIGT** — Bei 320, 375, 393 und 430 CSS-Pixeln liegen die Tageslabels in Chromium und WebKit, jeweils in allen vier Themes, vollständig im Fieldset und überlappen paarweise nicht.
   Nachweis: Vier Breiten mal vier Themes mal zwei Engines bestehen in Neu und Bearbeiten.
2. **ERLEDIGT** — Jedes Label besitzt mindestens eine echte 44×44-CSS-Pixel-Touchfläche; Zwischenräume gehören nicht zum Nachbarlabel.
   Nachweis: Jedes Label ist mindestens44x44 und vollständig enthalten.
3. **ERLEDIGT** — Native Klicks/Taps in Zentren und nahe den Rändern aller sieben Tagesflächen toggeln ausschließlich den zugehörigen Tag. Die übrigen Checkboxzustände bleiben unverändert; der bestehende Guard für mindestens einen ausgewählten Tag bleibt erhalten.
   Nachweis: Center/Edge-Taps aller sieben Labels ändern nur ihren Tag; Mindest-ein-Tag-Guard bleibt.
4. **ERLEDIGT** — Eine gezielte Regression misst Label-Rechtecke und tatsächliche Trefferzuordnung. Ein alleiniger `scrollWidth/clientWidth`-Vergleich genügt nicht.
   Nachweis: Gemessene Rechtecke und elementFromPoint statt bloßer Scrollbreite liegen als Geometrie-JSON vor.
5. **ERLEDIGT** — Neueintrag und Bearbeiten verwenden weiterhin denselben funktionierenden Editor. Live-Anbieter- oder Remote-Schreibtests sind nicht erforderlich.
   Nachweis: Beide Editorwege verwenden unveränderte Komponenten und lokale Persistenz.

### KD-REV-E13-001 · Workflow verwirft gültigen Backlog ohne bearbeiteten Job

**ERLEDIGT · BEHALTEN.** Ein gerade entstandener Backlog wird vom Workflow als Rückstand statt falscher Vertragsfehler gemeldet.
Ursprüngliche Ursache: Die Workflow-Invariante verwechselt „kein Job in diesem Claim verarbeitet“ mit „kein Rückstand vorhanden“. Der Core-Vertrag bildet jedoch ein späteres, unabhängiges Backlog ab: `remainingDueJobs > 0` ergibt `backlog`, sonst ergibt ein verarbeiteter Job `drained`, andernfalls `idle`.
Verhalten: Eine Zustandsäquivalenz entspricht jetzt der Corepriorität Backlog vor Idle.
Risiko und Komplexität: Einzeiliger Parserfix; kein Scheduler-/Claim-/Providerumbau. Gültiger Rückstand bleibt Warnung, nicht erledigt.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E13-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E13/KD-REV-E13-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [.github/workflows/automatic-ai-check.yml:118](/private/tmp/kd-review49-benefit-audit-20260917/.github/workflows/automatic-ai-check.yml:118).
Frische Belege: [review49_p12_workflow_test.log](review49_p12_workflow_test.log).

1. **ERLEDIGT** — Ein unveränderter Core-Lauf mit `idle`-Claim und danach positivem, gültigem Backlog wird akzeptiert, auch mit `processedJobs: 0` und Lag `0`.
   Nachweis: Originalcore mit idleclaim und später fälligem Job liefert backlog/0/lag0.
2. **ERLEDIGT** — Diese Antwort erreicht die Rückstandswarnung, nicht „ungültiger Antwortvertrag“.
   Nachweis: Unveränderter extrahierter Workflowshell erreicht echte Warning und Step-Summary.
3. **ERLEDIGT** — `idle` mit `0/0`, `drained` mit `>0/0` und `backlog` mit `>0/>0` bleiben gültig.
   Nachweis: Die übrigen gültigen Kombinationen folgen weiterhin der gelesenen Zähler-/Zustandsformel.
4. **ERLEDIGT** — Inkonsistente Code-/Backlogzustände, ungültiger Lag, falsche Zählersummen, Zusatzfelder und überschrittene Limits bleiben fail-closed abgewiesen.
   Nachweis: 16 inkonsistente Zustände/Zähler/Extras/Limits bleiben im Originalshell rot.
5. **ERLEDIGT** — Die fokussierte Mock-Regression belegt, dass der Zeitgrenzenfall keine zusätzlichen Claims, Providerrequests oder Mails auslöst.
   Nachweis: Nur claimDue und inspectBacklog werden aufgerufen; Anbieter/Mail/Settlement sind harte Fehlerstubs.

### KD-REV-E13-002 · Abgelaufene Mail-Ratenbuckets werden weder bereinigt noch als fällig gemeldet

**ERLEDIGT · BEHALTEN.** Abgelaufene Mailratefenster können begrenzt verschwinden, ohne alte Versandoperationen erneut freizugeben.
Ursprüngliche Ursache: Die Mailmigration führt ein vom Operationsledger absichtlich entkoppeltes, zeitfensterbasiertes Rate-Ledger ein, ohne die bestehende Retentionfunktion um dieses Ledger zu erweitern. Die Primärschlüssel enthalten `window_started_at`; neue Fenster werden folglich neu angelegt, alte weder wiederverwendet noch entfernt.
Verhalten: Bestehende Retention erhält indizierte Bucketzählung und limitierte Löschung.
Risiko und Komplexität: Additive SQLfunktionkopie ist lang, fachliches Delta klein. Operationsledger wächst bewusst weiter; dessen Änderung wäre ein eigenes Idempotenzkonzept.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E13-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E13/KD-REV-E13-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/migrations/20260917123000_review_mail_rate_bucket_retention.sql:8](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917123000_review_mail_rate_bucket_retention.sql:8), [tools/private_ops_monitor_test.mjs:233](/private/tmp/kd-review49-benefit-audit-20260917/tools/private_ops_monitor_test.mjs:233).
Frische Belege: [review49_p12_retention_pg17_test.log](review49_p12_retention_pg17_test.log), [private_ops_monitor_test.log](private_ops_monitor_test.log).

1. **ERLEDIGT** — Dryrun meldet abgelaufene Mail-Ratenbuckets getrennt und ohne Mutation; der Monitor erkennt daraus fällige Mailbereinigung.
   Nachweis: Dryrun meldet nur abgelaufene Buckets ohne Mutation; Monitorfixture erkennt Bedarf.
2. **ERLEDIGT** — Bei aktiviertem Purge werden höchstens die pro Lauf erlaubten abgelaufenen Buckets entfernt; bei deaktiviertem Purge keine.
   Nachweis: Disabledpurge löscht nichts; Limits1/200/500 und Wiederholung gelten.
3. **ERLEDIGT** — Aktive Fenster und ihre Zähler bleiben unverändert; konkurrierende Begin-Aufrufe behalten die Rate-Grenzen.
   Nachweis: Aktive Counter bleiben; zwölf parallele Begins halten Limit4 trotz Purge.
4. **ERLEDIGT** — Wiederholte Nutzung nach Ablauf lässt alte Bucketfenster begrenzt verschwinden statt sie zeitlich unbeschränkt anzusammeln.
   Nachweis: Wiederholte Fenster werden begrenzt entfernt; gesperrte Zeilen werden übersprungen.
5. **ERLEDIGT** — Alte `accepted`-, `rejected`-, `unknown`- und abgelaufene `claimed`-Operationen bleiben gegen erneuten Versand derselben `operation_id` geschützt.
   Nachweis: Accepted/rejected/unknown/claimed-IDs bleiben Replay/Conflict; Begin/Finishdefinitionen bytegleich.

### KD-REV-E13-003 · ai-task-Release-Hash und lokaler Dirty-Check lassen drei eingebundene Quellen aus

**ERLEDIGT · BEHALTEN.** Functionhash und Dirtyprüfung übersehen keine lokal transitiv importierten Module mehr.
Ursprüngliche Ursache: Die DATEIEN-Konstante wurde nach drei hinzugekommenen Importen nicht erweitert. Die fokussierte Vertragsprüfung dupliziert dieselbe Acht-Dateien-Liste und behauptet lediglich deren Gleichheit mit der Toolausgabe; sie bestimmt oder validiert keine tatsächliche Importabdeckung (Testliste, Gleichheitstest).
Verhalten: Ein deterministischer Importabschluss ersetzt die unvollständige Dateiliste für beide Zwecke.
Risiko und Komplexität: Parserabhängigkeit im Prüfwerkzeug, strikt nichtliteral-dynamische Imports werden abgewiesen. Keine Änderung des Deploynachweises zu einem Remotenachweis.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E13-003](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E13/KD-REV-E13-003.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [tools/function-release-info.mjs:16](/private/tmp/kd-review49-benefit-audit-20260917/tools/function-release-info.mjs:16), [tools/function-release-info.mjs:191](/private/tmp/kd-review49-benefit-audit-20260917/tools/function-release-info.mjs:191), [tools/function-release-info.mjs:230](/private/tmp/kd-review49-benefit-audit-20260917/tools/function-release-info.mjs:230).
Frische Belege: [function_release_test.log](function_release_test.log), [review49_p03_release_test.log](review49_p03_release_test.log).

1. **ERLEDIGT** — Die aktuelle Closure umfasst alle elf lokalen Dateien, einschließlich der drei ausgelassenen Module.
   Nachweis: Alle elf aktuellen lokalen Module gehören zur Closure.
2. **ERLEDIGT** — Nicht committete Änderungen an jeder direkt oder transitiv eingebundenen Datei werden vom CLI abgewiesen; eine weitere lokale Abhängigkeit kann nicht still fehlen.
   Nachweis: Jede uncommittete Closureänderung und neu hinzugefügte Abhängigkeit wird erfasst.
3. **ERLEDIGT** — Eine ausschließlich committete Byte- oder Verhaltensänderung jeder Closure-Datei ändert `sourceSha256` und `deployContractSha256`; gleiche Inputs bleiben deterministisch.
   Nachweis: Commitänderung je Modul ändert beide Hashes; Wiederholung ist deterministisch.
4. **ERLEDIGT** — Regressionstests bestimmen oder prüfen die Importabdeckung unabhängig von einer duplizierten festen Erwartungsliste.
   Nachweis: Parserproben decken Reexports, Typimports, Literaldynamicimports, Zyklen und Täuschtext ab.
5. **ERLEDIGT** — Config-/JWT-Prüfung, rohe Git-Blob-Hashbildung, der vollständige Runbook-Dirty-Check und die separaten Readback-Schutzschritte bleiben wirksam.
   Nachweis: Rohe Gitblobs, Config/JWT/Projekt/Functionbindung und separater Readback bleiben erhalten.

### KD-REV-E13-004 · Privat-v1-Browsergate erwartet einen entfernten Hilfe-Hero

**ERLEDIGT · BEHALTEN.** Der Browsergate prüft wieder den tatsächlich gewollten Hilfehero und erreicht Folgeassertionen.
Ursprüngliche Ursache: Die exakte Testassertion ist gegenüber dem beabsichtigten Produktions-Copy-Vertrag veraltet. Es gibt keinen Guard, alternativen aktiven `src`-Produzenten oder Migrationspfad, der für diese Fixture noch den alten Text rendern würde. Der Production-Copy-Vertrag verlangt ausdrücklich den neuen Text und die Abwesenheit des alten (`production_copy_surface_test.mjs:174`).
Verhalten: Nur erwarteter Text plus ausdrückliches Verbot des alten Texts ändern sich.
Risiko und Komplexität: Reiner Testfix; kein Produkttextwechsel, keine abgeschwächte Fixture.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E13-004](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E13/KD-REV-E13-004.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [tests/private-v1/private-v1.spec.mjs:276](/private/tmp/kd-review49-benefit-audit-20260917/tests/private-v1/private-v1.spec.mjs:276).
Frische Belege: [private_v1_hero.log](private_v1_hero.log), [production_copy_surface_test.log](production_copy_surface_test.log).

1. **ERLEDIGT** — Der ausgewählte Originaltest mit dem korrigierten Erwartungstext besteht gegen unveränderten Produktcode in Chromium und WebKit.
   Nachweis: Ausgewählter Originaltest besteht frisch in Chromium und WebKit.
2. **ERLEDIGT** — Hilfe bleibt über Settings erreichbar und zeigt den persönlichen Plattform-Hero.
   Nachweis: Settingshilfe zeigt persönlichen Plattformhero.
3. **ERLEDIGT** — Menü-, Audit- und Touch-Assertions nach dem Hero laufen vollständig; Netzzaun und `retries: 0` bleiben erhalten.
   Nachweis: Nachfolgende Menü/Audit/Touchassertionen laufen, retries0 und Netzfence bleiben.
4. **ERLEDIGT** — Der Production-Copy-Vertrag „neuer Text vorhanden, alter Text nicht vorhanden“ bleibt gewahrt.
   Nachweis: Production-Copytest prüft neuen und fehlenden alten Text separat.

### KD-REV-E14-001 · Strukturierter Radar-Werkkontext verliert gespeichertes Bezugsjahr

**ERLEDIGT · BEHALTEN.** Radar-Faktenlookup erhält das bereits vorhandene verifizierbare Werkjahr.
Ursprüngliche Ursache: Die letzte vollständige Definition des strukturierten Werkzweigs projektiert `targetId`, Titel, Typ, Region und Scopes, aber nicht `external_ids.releaseYear`. Der September-Patch ändert dort nur die Berechtigung; kein nachgelagerter Aufrufer ergänzt das Jahr. Der gemeinsame Typ-/Jahr-Guard ist nicht die Ursache und soll erhalten bleiben.
Verhalten: Effektiver SQLkontext projiziert das vorhandene releaseYear; Readergrenze bleibt streng.
Risiko und Komplexität: Migration ersetzt eine eng identifizierte Stelle der bestehenden Funktion und bricht bei unerwarteter Definition ab. Kein Rückschluss/Erraten fehlender Jahre.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E14-001](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E14/KD-REV-E14-001.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [supabase/migrations/20260917101000_review_radar_context_year.sql:7](/private/tmp/kd-review49-benefit-audit-20260917/supabase/migrations/20260917101000_review_radar_context_year.sql:7), [supabase/functions/_shared/flixpatrolFactsContext.js:266](/private/tmp/kd-review49-benefit-audit-20260917/supabase/functions/_shared/flixpatrolFactsContext.js:266).
Frische Belege: [review49_p05_pg17_test.log](review49_p05_pg17_test.log).

1. **ERLEDIGT** — Ein regulär über Produkt-RPCs angelegtes und separat abonniertes Filmwerk gibt sein gespeichertes, valides Jahr im effektiven `kd_radar_websearch_context` aus.
   Nachweis: Werkanlage plus separates Abo über echte RPCs liefern Jahr im effektiven Kontext.
2. **ERLEDIGT** — Bei gleicher starker ID, Werkart und Jahr enthält der Request an einen Mock-Suchadapter `flixpatrolFakten`; der Test nutzt den effektiv aus SQL gelesenen Kontext statt eines handgebauten Jahresrequests.
   Nachweis: Echter Kontext führt über Produktreader zu Fakten im Suchadapterrequest.
3. **ERLEDIGT** — Fehlendes, ungültiges oder widersprüchliches Jahr liefert weiterhin keinen Fakt, während die normale Suche benutzbar bleibt.
   Nachweis: Sechs Varianten prüfen fehlend/ungültig/widersprüchlich ohne Suche zu blockieren.
4. **ERLEDIGT** — Es entstehen weder zusätzliche Provideranfragen noch Cache-Schreibungen; Berechtigungs-, Personen-, Titelgruppen- und Freitextverträge bleiben unverändert.
   Nachweis: Keine zusätzlichen Suchen oder Cachewrites; vorhandene Rollen-/Targetpfade bleiben.
5. **ERLEDIGT** — Nach dem separaten Serien-Mappingfix E05-F002 wird ein Serienfall an derselben SQL-Kontext/Reader-Grenze geprüft.
   Nachweis: Film und Serie laufen an derselben SQL-/Readergrenze, Serie mit E05-002normalisierung.

### KD-REV-E14-002 · Manueller Katalogrefresh invalidiert frischen progressiven Streamingcache nicht

**ERLEDIGT · BEHALTEN.** Katalog neu laden aktualisiert auch einen noch frischen progressiven Seitenrecord.
Ursprüngliche Ursache: `refreshKatalog` erhöht nur die Legacy-Generation und leert Legacy-Refs. Die dauerhaft im App-Body gehaltene Page-Controller-Revision enthält ausschließlich Konto und Storageowner. Nach `ladeStreamingDateien` erreichen den Page-Kontext nur die persönlichen Fristanker. Bei wertgleichen persönlichen Daten verwirft `setContext` neue Objektidentitäten über die stabile Signatur; `resumeRecord` startet für einen vollständigen frischen Record keinen Initial- oder Hintergrundread.
Verhalten: Eigene monotone Refreshrevision fließt in vorhandenen Controllerkontext.
Risiko und Komplexität: Sehr kleines Signal statt neuem Cachemanager. Expliziter Refresh verursacht berechtigt einen zusätzlichen Seitenread, normale Wiederverwendung bleibt.
Urteil: Die Änderung beseitigt die ursprüngliche Ursache am betroffenen Vertragsknoten; der belegte Nutzeneffekt rechtfertigt die hier ausgewiesenen Kosten.

Originalquelle: [KD-REV-E14-002](/private/tmp/kd-review49-benefit-audit-20260917/docs/review/2026-09-vollreview/tickets/E14/KD-REV-E14-002.md). Vorher/Nachher: [frischer Kandidatendiff](baseline-to-candidate.patch).
Aktuelle Fundstellen: [src/App.jsx:920](/private/tmp/kd-review49-benefit-audit-20260917/src/App.jsx:920), [src/App.jsx:930](/private/tmp/kd-review49-benefit-audit-20260917/src/App.jsx:930), [src/controllers/useStreamingPageController.js:414](/private/tmp/kd-review49-benefit-audit-20260917/src/controllers/useStreamingPageController.js:414).
Frische Belege: [review49_p07_state_test.log](review49_p07_state_test.log).

1. **ERLEDIGT** — Ein vollständiger Seitenrecord unter fünf Minuten wird nach „Katalog neu laden“ und Rückkehr zur gleichen Ansicht erneut angefordert, auch wenn `newEntries`, `legacyNew`, Dienste und Mediathek wertgleich bleiben.
   Nachweis: Inaktiver frischer Record wird trotz wertgleicher Dienste/Master/Marker neu angefordert.
2. **ERLEDIGT** — Eine reine Titel-/Metadatenkorrektur des neuen Katalogstands ist nach erfolgreicher Seitenantwort sichtbar; erfolgreiche Legacy-Reads genügen nicht als Abnahmebeleg.
   Nachweis: Neue Metadatenversion wird im Seitenzustand sichtbar; Legacyreads allein zählen nicht.
3. **ERLEDIGT** — Die Invalidierung funktioniert bei inaktivem Streamingtab und mehrfachen Rendern, ohne denselben manuellen Refresh unnötig mehrfach anzufordern.
   Nachweis: Mehrere Render erzeugen nur einen Wiederanlauf je manueller Revision.
4. **ERLEDIGT** — Eine späte Antwort eines vor dem Refresh gestarteten Seitenlaufs kann den neuen Stand nicht überschreiben; Accountwechsel und bestehende Abbruchgrenzen bleiben wirksam.
   Nachweis: Vorherige späte Antwort wird durch Generation/Epoch verworfen.
5. **ERLEDIGT** — Ohne manuellen Refresh wird der frische Record weiterhin wiederverwendet; Fristenbuchwerte und 14-Tage-Fenster werden nicht künstlich geändert.
   Nachweis: Ohne manuellen Refresh bleibt frischer Record; Neuanker und14Tage bleiben unverändert.

## Nachvollziehbarkeit und verbleibende Grenzen

[Maschinenbericht mit49 eindeutigen Tickets und239 Kriterien](REVIEW.json), [direkt extrahierte Originalabnahme](acceptance-original.json), [Quellhashes](source-manifest.json), [Originalticket-Hashes](ticket-sources.json), [Browsergeometrie](p09-browser-geometry.json).

- Keine Aussage über CI, Deploymentbytegleichheit, aktiven Functionstand, aktuellen Anbieterzustand oder physisches iPhone/PWA.
- Sechs Migrationen laut aktuellem Masterbefund unremote; Staging und Produktion teilen dasselbe Supabaseprojekt. Ein Staging-SQLwrite wäre daher gemeinsame Außenwirkung.
- 26 Radar-V1funde und null TMDB-Filmwissenbestandskennungen wurden vom Master übermittelt, hier nicht remote verifiziert.
- E13-F005 bleibt separat ungeklärt und ist kein50. Ticket.
- Die frühere Baseline wurde nicht als Gesamtsystem erneut ausgeführt; ihr Fehlernachweis liegt in den gelesenen Originaltickets und dem unabhängigen statischen Vorher/Nachher-Abgleich.
- Ein neuer umfangreicher Umbau wurde nicht empirisch validiert. Die Alternativen sind Entscheidungen mit expliziten Folgeprüfungen, keine fertig gebauten Ersatzfixes.

Alle neu ausgeführten Einzelprüfungen und ihre Logs sind im JSON unter `testEvidence` verzeichnet. Deno wurde ohne Netzrecht und mit `--cached-only` ausgeführt. Die sechs neuen Handlerfälle sowie gezielte alte Nachbarguards bestehen; das übrige Handlerfile wurde bewusst nicht als vollständige Suite gestartet.
