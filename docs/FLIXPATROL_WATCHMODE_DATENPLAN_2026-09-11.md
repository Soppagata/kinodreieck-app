# Streaming und Entdecken: FlixPatrol und Watchmode gezielter nutzen

Stand: 11. September 2026. Max hat den Plan zur Umsetzung freigegeben. Dieser
Plan ergänzt die abgeschlossene Betriebsreparatur; deren Lieferregister bleibt
[BETRIEBSREPARATUR_REGISTER_2026-09-09.md](BETRIEBSREPARATUR_REGISTER_2026-09-09.md).

## PWA-Rueckmeldung vom 11.09.: gezielte UI-Nacharbeit

Die gezielte Nacharbeit U1–U5 ist auf Staging `b64953e` abgeschlossen und am
11.09. um 19:23 UTC inklusive Build und Service Worker rueckgelesen. Sie ersetzt
`72fb246` als aktuellen PWA-Kandidaten vor R5. Max' physischer PWA-Test bleibt
der vereinbarte naechste Schritt. Keine zusaetzliche Audit- oder Freigabeschleife.

| Teil von R4 | Ergebnis | Paket / Stand |
| --- | --- | --- |
| U1 | Must-Watch und Streaming/Alles verwenden das vorhandene Neu-Kartenlayout mit Pin, Markierung, Gesehen sowie explizitem Mediathek-Anlegen/Verknuepfen. | DONE `b64953e`: gemeinsame Karten plus ownergebundene lokale Pins und Navigation vom Start |
| U2 | KI-Kurzbeschreibungen bleiben; Kosten-/Websuche-Betriebstexte und der redundante Korrekturbutton entfallen. Kino ohne Weiterleit-Pfeile; Empfehlungsdetails zugeklappt mit titelnahem Chevron und erhaltenem Quellenlink. | DONE `b64953e` |
| U3 | Quellenstaende sind mobil lesbar. Obsoleter Backup-Hinweis entfaellt; Exporterinnerung und tatsaechlich fehlgeschlagene Speicherung werden korrekt getrennt. | DONE `b64953e`: Quellkarten und gestapelte Zusammenfassung auch bei 320 px; begrenzte Beobachtung laufender Konto-Synchronisation |
| U4 | Die zwei KI-Servermeldungen sind mit zeitnaher, providerfreier Betriebsdiagnose eingeordnet; belegte Fehler werden gezielt behoben oder konkret benannt. | DONE: Quellenfehler eingegrenzt und UI-Text korrigiert; externe LOC-Sperre bleibt unten dokumentierter Befund |
| U5 | Gemeinsamer Kandidat lokal geprueft, auf Staging gepusht, CI/Build/PWA rueckgelesen. | DONE `b64953e`, CI `34637643291`, Readback 11.09. 19:23 UTC |

**Parallelmatrix:** Alle drei Pakete starten vom selben Commit dieser Planergänzung,
in getrennten Worktrees. Karten besitzt StreamingTab, MediathekTab, MustWatchListe
und eigene neue Kartenkomponenten/-Styles sowie zugehoerige Kartentests. Texte
besitzt FilmwissenBereich, PrognoseBereich, EintragForm, useIntelligenceController
(nur Produkttexte), EntdeckenTab, KinoLinks und eigene Styles/Tests. Settings
besitzt DatenTab, KatalogAuditStatus, useBackupExportController,
backupExportController und die zugehoerigen Sicherungs-/Settings-Tests.
App.jsx, index.css, ui.jsx, Daten-/Providervertraege, Schema, Lockfile, package.json
und CI bleiben waehrend des Baus read-only. Neue Styles werden direkt aus den
zugeordneten Komponenten importiert. Einzige vorab benannte Integrationsnaht:
der Master reicht vorhandene Pin-Callbacks an MediathekTab weiter; bei Bedarf
bindet er den bestehenden Kontomodus an die Exporthinweis-Projektion.
Nach erster Integration folgt ein kleines disjunktes Delta: Karten erweitert
nur den vorhandenen Pin-Resolver/StartTab um exakte lokale Must-Watch-IDs;
Texte praezisiert ausschliesslich die UI-Uebersetzung bestehender
Filmwissen-Quellenfehler; Settings begrenzt die Statusbeobachtung auf laufende
Synchronisation, ohne dauernde Root-Renders. Alle starten von `42dde0d`.
Kein automatisches Titelmatching, keine neue Persistenzarchitektur, kein
bezahlter KI-Aufruf, keine Backend-/Scheduler-Aenderung fuer reine UI-Arbeit.

**U4, providerfreie Betriebsdaten (11.09., 18:47–18:53 UTC):**
Im Testfenster 17:30–18:47 UTC steht genau eine KI-Operation im inhaltsfreien
Log: `film-forecast`, 18:18:09–18:18:26 UTC, erfolgreich mit Sonnet 5.
Die Gatewayfehler betreffen `ai-task` um 18:17:56 und 18:22:40 UTC (HTTP 500).
Die Quellenzaehler belegen je einen Wikidata- und LOC-Abruf in den Minuten
18:17 und 18:22; kein Filmwissen-Auftrag oder zahlender KI-Lauf entstand.
Quellenfreigaben und Kontaktkonfiguration sind vorhanden. Die historische
HTTP-Antworthuelle wurde nicht gespeichert; ihr exakter Quellenfehlercode ist
daher nicht rueckwirkend beweisbar. Ein einzelner aktueller oeffentlicher
LOC-Abruf mit dem vorhandenen Adapter wurde mit HTTP 403 abgewiesen.
Kein weiterer Quellenretry, keine Umgehung, keine neue Quelle oder KI-Probe.
Die offizielle Claude-Statusseite meldete die API gleichzeitig betriebsbereit.
Folge: konkrete Recherchequellenfehler in der UI passend benennen; den
externen LOC-Zugriff nicht durch einen Quellen-/Backendumbau in diesem UI-Paket
ersetzen. Bereinigte lokale Belege: `/private/tmp/kd-ui-feedback-evidence-20260911`.

**U3 Sicherungsmodell:** Konto-Sync speichert automatisch. Die bisherige
Warnung verglich ausschliesslich gegen den letzten manuellen JSON-Export.
Die neue Projektion beruecksichtigt bestaetigte Topfstaende und behaelt
Pending-/Konflikt-/Stale-/Schema-/Groessengrenzen bei. Lokale Rueckholstaende
sind keine unabhaengige Sicherheitskopie; der portable Export bleibt manuell.

**U5 Liefernachweis:** Vollstaendiges `npm test` einschliesslich Client-Mocks,
lokaler PostgreSQL-Pruefungen, Einzeldatei, Build und 72/72 Pages-Checks ist gruen.
Die private Browsersuite umfasste 82 Faelle: Nach den gezielten Korrekturen
bestanden alle 18 betroffenen Faelle erneut in Chromium/WebKit; die 64 uebrigen
waren zuvor gruen. Die Kartenaktionen und Quellenstaende wurden bei 320/393 px
auch visuell geprueft. In [CI-Lauf 34637643291](https://github.com/Soppagata/kinodreieck-app/actions/runs/34637643291)
bestanden Test-Suiten inklusive Function-Mocks, 46 Chromium- und 46 WebKit-Faelle
sowie das automatische Staging-Deployment. Der normale angemeldete Readback
um 19:23 UTC bestaetigte einen frischen Format-9-Feed mit 50 Titeln und zwei
frische Netflix-Fakten; null Feedwrites, null FlixPatrol- und null KI-Requests.
Domain, Build, Service Worker, Shell-Dateien und privater Katalogzugriff stimmen
mit `b64953ed46fa255e78dc17aa5ddab7a6b77ee854` ueberein. Es gab fuer dieses
UI-Paket keine Backend-, Migrations-, Scheduler- oder Anbieter-Aktivierung.
Belege: `/private/tmp/kd-ui-feedback-evidence-20260911/`. Ein anschliessender
reiner Dokumentationscommit bleibt auf dem Kandidatenbranch und loest kein
erneutes Staging-Deployment aus.

## Verbindlicher Restweg ab 11.09.2026

Max beauftragt die Auflösung des Netflix-Blockers und aller notierten
Daten-/Betriebsbefunde mit Subchats. Reihenfolge: fertige Staging-Lieferung →
Max testet kurz auf der PWA → Merge/Production-Readback → isolierte Staging-
Sandbox samt persönlichem Control-Backend. Diese Folge ersetzt die bisherige
Vertagung der unten historisch dokumentierten Befunde.

| ID | Ergebnis und Fertigkriterium | Zuständigkeit / Stand |
| --- | --- | --- |
| R1 | Netflix nutzt den täglichen FlixPatrol-Feed; Ursache des realen Bündelfehlers belegt, Vertrag korrigiert, erster Feed erfolgreich und normaler Client-Read bestätigt. | Backend `16dae19`, Staging `72fb246`: Feed/Fakten live bestätigt, Abschlussprüfung grün. DONE |
| R2 | Watchmode-IDs und gezielte deutsche Details erreichen den Katalog; zusätzliche Werktypen sind empirisch geklärt und nur mit belegtem Mapping aufgenommen. Bestehende 14-Tage-Fristen bleiben erhalten. | Produzent `39735ae`: IDs und fünf Details veröffentlicht; Typmapping gebaut, Aktivierung bleibt am belegten Quotenrest. GEBAUT / REST |
| R3 | Fehlendes Namenssignal und tatsächliche Datenfrische sind geklärt und korrigiert; die Build-Chunkwarnung ist gezielt bereinigt. Kein Umbau funktionierender Nutzerwege. | Namenssignal und Zeitstempel veröffentlicht; Build und vollständige Lieferprüfung auf `72fb246` grün. DONE |
| R4 | Integrierter Stand ist getestet, gepusht und auf Staging inklusive Feed, Fakten und Service Worker rückgelesen; kompakte PWA-Prüfpunkte für Max. | DONE inklusive U1–U5: Staging `b64953e`, CI `34637643291`, normaler Feed-/Fakten-/PWA-Readback am 11.09. 19:23 UTC gruen |
| R5 | Nach Max' PWA-Test: Staging-Produktstand in Main, gewollte Produktionsschalter gesetzt, Production ausgeliefert und rückgelesen. | Master; abhängig von R4 und Max' Testergebnis. OFFEN |
| R6 | Produktionsjobs besitzen ein eindeutiges Produktionsziel; Staging erhält getrenntes Pages-/Supabase-Ziel, neutrale Seeds und zunächst ausgeschaltete Anbieter/Scheduler. Control liest datierten Status über begrenzte serverseitige Wege. | Folgewelle nach R5; vorhandenen Sandbox-Vertrag konkret ausfüllen. OFFEN |

**Bauaufteilung:** Zwei unabhängige App-Pakete starten vom selben
committeden Planstand: Backend besitzt FlixPatrol-Client/Normalisierung,
Entdecken-Adapter und zugehörige Tests; App besitzt die kleinste notwendige
Build-Aufteilung und ihre gezielten Schutzprüfungen. Keine gemeinsame Änderung
an `package.json`, Lockfile, Migrationen oder Deploy-Workflows während dieser
Welle ohne Master-Zuordnung. Die getrennte Produzenten-Etappe startet von
`0fd4ac1866210eea49a8c3a89ecfae08197729ea` und hält das bestehende Katalog-/
Fakten-DTO unverändert. R1 besitzt zusätzlich den Antwortvalidator in
`entdecken-six-day.yml`: Er muss Format 9, sieben Charts und die gezählten
Genre-/Keyword-Bündel korrekt erkennen; Zeitplan und Environment bleiben in
dieser Welle unverändert. Der Master besitzt dieses Register, Live-Reads,
Providerläufe, Integration und Lieferung. Kein zusätzlicher Reviewchat.

**Begrenzte echte Abrufe:** Zuerst gespeicherte Antwortdiagnostik und bestehende
Cachebelege auswerten. Für R1 höchstens zwei zusätzliche Diagnoserequests,
eine frische Quota-Messung und ein Feedlauf mit höchstens 13 FlixPatrol-
Requests: insgesamt höchstens 16 neue gezählte Versuche im unveränderten
1000er-Monatszähler. Kein blinder Retry. Für R2 höchstens sechs Details über
bekannte Watchmode-IDs und drei gezielte Werktyp-Seiten plus höchstens eine
Statusabfrage; bestehender 2000er-Zyklus-/500er-Jobzaun und 28er-Detailanteil
bleiben maßgeblich. Jeder Lauf braucht einen aktuellen verlässlichen Stand.
Kein bezahlter KI-Lauf und kein Vollkatalogabruf zur Probe.

Der Nutzerauftrag erneuert die Aktivierung nach dem bekannten, vollständig
verbuchten Fehler. Der alte Lauf wird weder wiederverwendet noch seine Zähler
zurückgesetzt. Neue Datenwirkung wird vorher konkret an Ziel, Commit und
Menge gebunden. Die Sandbox wird erst nach Production-Erfolg umgeschaltet;
ihre Provisionierung verwendet belegte getrennte Ziele und keinen
unbemerkt kostenpflichtigen Tarif. Neue Zugangsdaten bleiben außerhalb von
Chat, Git und Browser. Bestehende persönliche Daten werden nicht kopiert.

**Vorbereiteter Übergang R5/R6, frisch gelesen am 11.09.:** Beide Domains
verwenden derzeit Pages-Projekt `kinodreieck` und Supabase
`bscjgwcntapobyxsiyce`. Die Supabase-Organisation hat den Free-Tarif und genau
ein sichtbares Projekt; ein Sandbox-Projekt existiert noch nicht. Ziel ist
ein eigenes Pages-Projekt `kinodreieck-sandbox` mit der bestehenden
Staging-Domain und einer getrennten Supabase-Ref. Cloudflare Access schützt
Hostname und Assets für Max; App-Login und serverseitige Zielbindung bleiben
zusätzlich bestehen. Die Provisionierung wird erst nach R5 konkret geprüft.

Die Produktionsumgebung hat einen Deployment-Reviewer. Unbeaufsichtigte
Datenjobs erhalten deshalb eine eigene, auf `main` begrenzte Umgebung
`production-data`, bevor `staging` umgebunden wird. Dies betrifft neben
Entdecken/FlixPatrol auch Radar, Keep-alive und Private Ops Monitor; der
deaktivierte KI-Check bleibt deaktiviert und bekommt kein Sandbox-Ziel.
Control startet mit lesbarem Build-, Quellen-, Frische-, Job- und Budgetstatus
sowie klar getrennten Sandbox-Eingaben. Neue produktive Schreib- oder
Providerknöpfe gehören erst in einen eigenen konkret begrenzten Auftrag.

## Bestätigte Daten-Lieferung vor der UI-Nacharbeit

**Netflix über FlixPatrol ist aktiv.** Backend `16dae19` wurde gezielt für
`flixpatrol-usage` und `entdecken-daily-task` ausgeliefert; die unveränderten
KI-/Radar-Funktionsquellen wurden ebenfalls anhand ihrer tatsächlichen Bytes
bestätigt. Drei vereinbarte Schalter und der bestehende Backend-Buildmarker
sind gesetzt. Keine neue Migration und kein bezahlter KI-Lauf.

Der Netflix-Bündelfehler ist belegt: Ein Charteintrag an Serienrang 2 wird
von der Titel-API als Film geliefert. Alle zehn IDs des Bündels waren korrekt;
der Typkonflikt ließ zuvor das ganze Bündel scheitern. Nur im neuen Format 9
wird dieser Eintrag nun mit einem eintägigen `incomplete_blocked` ausgesetzt.
Die übrigen exakten Treffer bleiben verwendbar, Serienrang 6 rückt nach.
Format 8 behält seinen bisherigen strikten Vertrag.

Der erneute einmalige Owner-Lauf am 11.09., 14:58 UTC, war erfolgreich:
Format 9, 50 Titel (15 Kino, 10 Netflix, 10 Prime Video, 10 Disney+, 5 Apple TV),
ein Feedwrite und vier neue FlixPatrol-Requests. Bereits vorhandene Charts
wurden wiederverwendet; nötig waren zwei Titel-, ein Genre- und ein Keyword-
Bündel. Der Feed ist `ready`, der Fehlercode leer und der Owner-Override wieder
aus. Netflix-Konflikt und Rang-6-Ersatz wurden im gespeicherten Feed bestätigt.
In diesem Restauftrag insgesamt sechs zusätzliche FlixPatrol-Requests
(eine Quota-, eine Diagnose- und vier Feedanfragen); eigener Monatszähler
59/59 vollständig abgeschlossen. Der erste natürliche Format-9-Tageslauf
bleibt als spätere Betriebsbeobachtung offen, ohne manuellen Wiederholungslauf.

**Watchmode-Produzent `39735ae` ist integriert und auf beiden bisherigen
Datenbranches gepusht.** Die drei vorher vorhandenen generierten Änderungen
blieben bytegleich erhalten. Eine providerfreie Katalogveröffentlichung hat
226 bekannte Titel mit IMDb-/TMDB-IDs und fünf gespeicherten Detailtexten
bereitgestellt. 24.502 Entdecken-Titel, Dienstauswahl und vorhandene Neu-Fristen
bleiben erhalten; zwölf vorhandene Namenssignale werden wieder berücksichtigt.
Der Originalpfad der bereits vorhandenen Namensliste ist lokal konfiguriert.
Quellstand (10.09.), Projektion und tatsächliche Veröffentlichung (11.09.)
bleiben getrennte Werte; `updated_at` wird bei echten Katalogwrites gesetzt.
Streaming, beide durch den bestehenden Trigger erzeugten Teilpayloads und
Manifest wurden gelesen; der Kino-Katalog blieb unverändert.

Die begrenzte Watchmode-Probe verbrauchte neun der höchstens zehn Anfragen.
Drei Werktyp-Seiten und fünf von sechs deutschen Detailantworten sind gesichert.
Die erste Seite wurde nach einem leeren optionalen IMDb-Feld offline aus dem
bereits gespeicherten Beleg normalisiert, ohne sie erneut anzufragen. Der
letzte Detaildatensatz (Watchmode-ID `19751`) hatte keinen gültigen Antworttitel
und bleibt ohne Cacheeintrag; die künftige Normalisierung kann erst nach
exakter ID-/Jahr-/Typbindung auf den Katalogtitel zurückfallen. Es gab keinen
zweiten Resume, keinen Detail-Retry und keine zusätzliche Statusanfrage.
Konservativer Zyklusstand: 1.001/2.000. Die fünf lesbaren Beschreibungen sind
inhaltlich deutsch; die API bestätigt die Antwortsprache nicht ausdrücklich,
deshalb bleibt dieses Sprachmetadatum unbekannt.

Zusätzliche Werktypen sind empirisch belegt und im öffentlichen Film-/Serien-
Vertrag gemappt: 420 Netflix-Miniserien (erste 250 gelesen), 155 Prime-TV-Filme
plus ein Special sowie 180 Disney-Kurzfilme. Die reguläre Aktivierung bleibt
aus: Der konservative Pflichtforecast beträgt 1.972/2.000, nach der Probe
bleiben 19 Anfragen Reserve. Mit dem jüngsten kleineren Fünferlauf wären
rechnerisch 58 frei; die belegte Mindesterweiterung benötigt bereits 48.
Unbekannt sind zusätzliche Seiten aller 39 Quellen und neu berechtigte
Deeplinkziele. Die Bedingung wäre `13f + 3F + 2d <= 58`; bereits vier
zusätzliche Seiten je Fünferlauf überschreiten diesen Rahmen. Es wird kein
unbelegter Filter oder höheres Limit aktiviert. Spätere Messung und Aktivierung
gehören in die Sandbox-Planung; 48-Stunden-/12-Tage-Takt bleiben unverändert.
Ein späterer Erstimport zusätzlicher Typen erzeugt dank eigener Baseline
keinen Schub alter Titel unter `Neu`.

**Staging `72fb246` ist gepusht, CI-grün und ausgeliefert.** Vollständiges
`npm test` einschließlich synthetischer PostgreSQL-Prüfungen, Einzeldatei,
Build und 72/72 Pages-Checks sowie 341 Function-Mocks bestanden. In
[CI-Lauf 34618596758](https://github.com/Soppagata/kinodreieck-app/actions/runs/34618596758)
bestanden außerdem 46 Chromium- und 46 WebKit-Fälle und das Deployment.
Die gezielte Build-Aufteilung entfernt die Chunkgrößenwarnung, ohne Tabs oder
Nutzerzustand umzubauen. Die vier zunächst gefundenen Auslieferungsprüfungen
prüfen jetzt alle tatsächlich gebundenen Shell-Bundles; Login-, Secret- und
Offline-Schutzanker bleiben erhalten.

Der normale angemeldete Clientweg wurde am 11.09. um 16:00 UTC bestätigt:
ein GET lädt den frischen Format-9-Feed mit 50 Titeln vom Server, ein weiterer
Cache-Read zwei frische Netflix-Fakten. Null Feedwrites, null FlixPatrol-
und null KI-Requests beim Readback. Build, Service Worker, gebundene Shell-
Dateien und privater Katalogzugriff wurden ebenfalls geprüft. Physischer
PWA-Test durch Max bleibt der ausdrücklich vereinbarte nächste Schritt.

Der nächtliche GitHub-Job läuft vom Defaultbranch. Deshalb wurde die bereits
geprüfte Format-8/9-Antwortvalidierung separat als `cc016a2` auf `main`
übernommen: nur Workflow und seine beiden Tests, keine Produktdateien.
Auch dessen CI-Prüfungen sind grün; die geschützte Production-Auslieferung
wurde nicht freigegeben. So erkennt der nächste natürliche Job den aktiven
Format-9-Feed auch dann, wenn der vollständige Produktmerge später folgt.
Die tatsächliche Production-Version bleibt frisch bestätigt `3b82a73`; dort
ist der Tagesfeed im Client weiterhin ausgeschaltet.

**Ab hier:** Max testet [die Staging-PWA](https://staging.kinodreieck.at) auf dem
aktuellen UI-Stand `b64953e` kurz: Must-Watch-Kartenaktionen und Pin auf Start,
Entdecken-Details, Streaming `Alles`/`Neu`, mobile Quellenstaende und einmal
Speichern im Konto; anschliessend schliessen und neu oeffnen. Nach seinem
Testergebnis folgt der freigegebene
Produktmerge mit bewusster Production-Konfiguration und Readback. Erst danach
werden Staging und die produktiven Datenjobs auf die oben konkretisierten
getrennten Ziele gebunden. Die zusätzliche Watchmode-Typaktivierung bleibt
wegen der belegten Quotenfrage offen; sie blockiert diesen Produktmerge nicht.

Der damalige Dokumentationsnachtrag auf dem Daten-Kandidatenbranch enthaelt
den Readback von `72fb246`. Der neuere UI-Liefernachweis fuer `b64953e` steht
oben unter U5; dessen Dokumentationsnachtrag loest ebenfalls kein Deployment aus.

Technische Belege der Daten-Lieferung: `/private/tmp/kd-rest-delivery-20260911/`.
Die ältere Lieferung unter `/private/tmp/kd-data-plan-delivery-20260911/`
bleibt unverändert als Historie erhalten.

## Empfehlung

Watchmode bleibt die Quelle für den österreichischen Streamingbestand,
Dienste, Angebotsarten und Links. FlixPatrol liefert datierte Popularität und
zusätzliche neutrale Filmfakten. Beide speisen eine gemeinsame Faktenprojektion.
Deutsche Titel und Beschreibungen sollten bevorzugt aus vorhandenen lokalen
Quellen oder gezielt aus Watchmode-Details kommen. Vorhandene FlixPatrol-Texte
bleiben eine brauchbare Ergänzung. Der größere Nutzen entsteht zunächst durch
vollständige Weitergabe und Wiederverwendung vorhandener Daten.

Die Reihenfolge aus dem Masterchat bleibt: stabiler Produktbetrieb und
akzeptierter Produktstand, Production-Zusammenführung, danach persönliche
Control-/Sandbox-Fläche. Die weiter unten genannten Ausbauschritte sind keine
nachträglich erfundenen Merge-Voraussetzungen.

## Ausgangsbefund vor dem Bau

- Vollständige Benutzer-/Ergebnisfolge von „GitHub Runs und Entdecken prüfen“
  einschließlich E15 und des natürlichen Tageslaufs vom 11.09.; außerdem der
  verfügbare Verlauf von „Staging/Prod-Stand prüfen“ und der Sandbox-Vertrag.
- Aktueller Masterworktree: `cb9819949d296cde952fecc08da45f4c78e08676`.
  GitHub-Refs frisch gelesen: `staging=34e772b989c09a359a23ebcdba6fcb11ced9d0f0`,
  `main=bf74f257c4ef541eb1ab1c7d3c54ecbb9b8fff26`. Der Master hat darüber
  einen Abschlussdokumentationscommit. Der normale App-Hauptcheckout ist älter
  und enthält vorhandene lokale Änderungen; er war nicht die Analysebasis.
- Watchmode-Produzent im zweiten Repository
  `/Users/max/Documents/GitHub/Kinodreieck`, Commit `55b8392`;
  gespeicherter Katalog vom 10.09., 22:02 UTC. Generierte Dateien dort sind
  bereits verändert und wurden nicht bearbeitet.
- Aktuelle öffentliche FlixPatrol-v2-Dokumentation sowie Watchmodes offizielles
  OpenAPI-Schema, Version `1.1.10`, aus dem aktuellen API Explorer.
- Keine neuen authentifizierten Anbieterabrufe, Datenbankänderungen, Tests,
  Scheduleränderungen, Deployments oder Merges in diesem Analyseauftrag.

**Beleggrenze:** Betriebszahlen stammen aus den gespeicherten Belegen mit
Datum, nicht aus einer erneuten Live-Kontoprüfung. Der Feed-Readback vom 11.09.,
07:22 UTC bestätigt 50 Titel, fünf Quellen und den Stand 11.09. Die neueste
physische iPhone/PWA-Abnahme wird dadurch nicht ersetzt.

## Bestehender Betrieb zum Analysezeitpunkt

| Bereich | Bestehender Datenweg | Bedeutung |
| --- | --- | --- |
| Streaming: Alles | Watchmode `/list-titles`, seitenweise je AT-Dienst; fünf ausgewählte Dienste nach 48 Stunden, alle 39 Quellen nach zwölf Tagen | Der letzte Beleg enthält 9.348 Titel der Fünferauswahl. Ein Gesamtlauf ersetzt den gleichzeitig fälligen kleinen Lauf. |
| Streaming: Mein Programm | Derselbe Katalog, streng mit der persönlichen Mediathek verbunden; zusätzliche gecachte Quellenlinks | Letzter Beleg: 123 ausgewählte Treffer. |
| Streaming: Neu | Quellenbezogene Katalogdifferenzen und individuelles Fristenbuch | 14 × 24 Stunden ab Erkennung; kein Neustart der Frist durch einen neuen Abruf. Eine Dienstpremiere oder ein Chartneueinstieg ersetzt diese Regel nicht. |
| Entdecken: Grundpool | 15 ÖFI-Kinotitel, zehn Netflix-Titel aus der öffentlichen Wochenquelle, je zehn Prime/Disney und fünf Apple-TV-Filme aus FlixPatrol | FlixPatrol wird gegenwärtig für fünf Tagescharts und maximal 25 ausgewählte Titelauflösungen verwendet. Netflix läuft noch nicht über FlixPatrol. |
| Entdecken: persönliche Auswahl | Ausgewählte Dienste filtern den Pool; aktuelle Kinovorschläge ergänzen bis 50; daraus bis zu sechs persönliche/erkundende Empfehlungen | Bereits in E9/E10 gebaut. Die sichtbaren 50 sind nicht die gesamte Streamingbibliothek. |
| Fakten und KI | Gemeinsamer FlixPatrol-Cache, Importhinweise, Prognose-/Radar-/Profilkontext | Positive Titelfakten 30 Tage, negative Ergebnisse einen Tag gecacht; keine Anbieteranfrage je Nutzer oder KI-Aufruf. KI-Anbindung ist mit Mocks geprüft, die vollständige echte KI-Kette ist separat. |
| Beschreibungen | FlixPatrol und vorhandenes Kinoprogramm werden für Entdecken flüchtig ergänzt | E15: Beliebte Titel klappen Texte per Titel auf; Für mich zeigt Texte direkt. |

Die am 10.09. gespeicherte Vergleichsprobe hatte 25 FlixPatrol-Fakten mit
25 Beschreibungen. Nach dem damaligen Dienstefilter entstanden 30 Streaming-
und 20 Kinovorschläge sowie sechs Empfehlungen. Keiner der Empfehlungstexte
hatte in dieser Probe einen zusätzlichen Beschreibungsgrund. Das beweist
weder schlechten Geschmack noch generelle Wirkungslosigkeit des Inhaltsabgleichs.

## Festgestellte Lücken und vereinbarter Scope

| Befund | Warum er relevant ist | Vorgeschlagene Änderung |
| --- | --- | --- |
| **Fakten verlassen den Cache unvollständig.** `flixpatrolData.js` und SQL speichern `genreId`/`keywordId`; die gemeinsame Browserprojektion reicht sie nicht weiter. Der Feed setzt `genres: []`. | Ein offizielles Genre oder Thema wird für Karten und Empfehlungen nicht nutzbar. Der neue Beschreibungsabgleich erkennt nur eine kleine gepflegte Menge deutscher/englischer Begriffe. | Benötigte Referenz-IDs zentral auflösen, in das vorhandene Vokabular übersetzen und als neutrale Genre-/Themenwerte projizieren. Kein neues Rankingmodell nötig. |
| **Der Watchmode-Export ist inhaltlich sehr dünn.** Im gespeicherten Rohkatalog haben 24.728 Titel weder Beschreibungen noch Genres. | Der Produzent liest die schlanke Listenroute. Fehlende Felder werden defensiv erwartet, aber diese Route verspricht im Schema keine Beschreibung und keine Genres. | Listendaten als Bestandsbasis behalten; einen kleinen separaten Detailcache für wirklich benötigte Titel ergänzen. |
| **Vorhandene IDs gehen beim Known-Export verloren.** Alle 226 Known-Titel besitzen im Rohkatalog IMDb- und TMDB-ID; im Known-Export sind beide bei allen 226 leer. | Das erschwert sichere Zuordnung gerade bei abweichenden deutschen/englischen Titeln. Erneute Auflösung wäre unnötig. | Beide IDs über die bereits identische Watchmode-ID mitliefern. Persönliche Angaben bleiben führend; Konflikte nicht überschreiben. Keine Anbieterrequests. |
| **FlixPatrol-Faktenzugriff hängt überwiegend an heutigen Charts.** Browser lädt fünf Charts und dann deren höchstens 50 IDs; ohne direkte FlixPatrol-ID verwendet auch der KI-Kontext diese Auswahl. | Ein Titel kann im zentralen Faktenbestand liegen und trotzdem nach Verlassen der Charts für andere Verbraucher unerreichbar sein. | Vorhandene Fakten auch nach bekannten IMDb-/TMDB-/FlixPatrol-IDs gebündelt lesen. Es geht um Zugriff auf den Cache, nicht um Vollimport. |
| **Streaming-Karten schöpfen den Faktenbestand nicht aus.** Die neutralen Alles/Neu-Karten rendern Genres, aber keinen gemeinsamen Beschreibungstext. | Bereits bezahlte Informationen helfen dort bisher kaum. | Beim Aufklappen dieselbe Beschreibung, belegte Laufzeit und Genreprojektion verwenden; keine eigene Detailanfrage aus der Karte. |
| **Chartzugehörigkeit wird im Entdecken-Modell als bestätigte Verfügbarkeit behandelt.** Der Adapter setzt AT/SVOD, der Consumer `availabilityConfirmed: true`. | Das Dokument sagt bereits, dass Charts kein aktueller Angebotsbeleg sind. Ein Chartland oder ein Prime-Chart beweist keinen konkreten Channelzugang. | Popularitätsbeleg und aktuellen Watchmode-Angebotsbeleg getrennt führen. Fehlende Bestätigung ehrlich behandeln; niemals DE-Verfügbarkeit auf AT übertragen. Ausgewählte Dienste und Kinofüllung erhalten. |
| **Alles ist aktuell auf zwei Watchmode-Typen beschränkt.** Der Request und Known-Exporter akzeptieren nur `movie` und `tv_series`. | Die API kennt zusätzlich unter anderem Miniserien und TV-Filme. Ob und wie viele für die aktuellen Dienste fehlen, ist noch nicht gemessen. | Als begrenzte Abdeckungsprobe untersuchen. Erst danach bewusst unterstützte Typen samt Identitätsmapping erweitern und Seitenbudget neu berechnen. Keine ungeprüfte Zuordnung aller TV-Typen zu Serien. |

Relevanter Code: [FlixPatrol-Projektion](../supabase/functions/_shared/flixpatrolFacts.js),
[Faktenservice](../src/services/flixpatrolFacts.js),
[Entdecken-Adapter](../supabase/functions/entdecken-daily-task/flixpatrolMixAdapter.js),
[Entdecken-Projektion](../src/lib/entdeckenUi.js),
[Beschreibungsprojektion](../src/lib/entdeckenProjection.js),
[Inhaltsabgleich](../src/lib/recommendationContent.js),
[Streaming-Karten](../src/tabs/StreamingTab.jsx).
Im Produzenten: `KinoFilm/Programmdateien/System/fetch_streaming_katalog.js`
und `build_streaming_ansicht.js`.

## Was die APIs zusätzlich belegen

**FlixPatrol:** Der Titles-Vertrag enthält Beschreibung, Laufzeit, IDs sowie
Genre- und Keywordbeziehungen. Eine deutsche Übersetzungsoption ist dort
nicht dokumentiert. Genres und Keywords besitzen eigene Referenzendpunkte.
Ein `id[in]`-Filter ermöglicht laut Dokumentation eine Titelliste mit mehreren
IDs; Vollständigkeit, Größenlimit und Antwortverhalten unseres Kontos sind
damit noch nicht praktisch bestätigt. Quellen:
[Titles](https://flixpatrol.com/api2/endpoint-titles/),
[Genres](https://flixpatrol.com/api2/endpoint-genres/),
[Keywords](https://flixpatrol.com/api2/endpoint-keywords/).

**Watchmode:** Der aktuelle Detailvertrag unterstützt `language` für lokalisierte
Titel und Inhaltsangaben. Abruf mit Watchmode-ID kostet einen Credit, mit
IMDb-/TMDB-ID zwei; jede angehängte Datenart kostet zusätzlich einen Credit.
Deshalb vorhandene Watchmode-IDs nutzen und Details ohne unnötige Anhänge
laden. `plot_overview` kann laut Schema KI-ergänzt sein; `will_you_like_this`
und `review_summary` sind als KI-generiert beschrieben. Solche allgemeinen
Texte sind keine persönliche KD-Empfehlungsbegründung. `language=de` ist ein
belegter Parameterweg, aber die deutsche Textabdeckung bleibt zu messen.
Quelle: [API Explorer](https://api.watchmode.com/docs/) und das dort geladene
[OpenAPI-Schema](https://api.watchmode.com/openapi.json?v=f6d94e1c143a4bf0).

**Keine verlässliche Ablösung des AT-Katalogs durch FlixPatrol:** Die aktuelle
Streamings-Dokumentation kennzeichnet den Endpunkt als deprecated und zählt
zehn Länder ohne Österreich auf. Auch Premieres enthält keine Länderbindung.
Markets kann Datenabdeckung und letzte Chartaktualisierung überwachen,
ersetzt aber keinen Titel-Angebotsnachweis. Quellen:
[Streamings](https://flixpatrol.com/api2/endpoint-streamings/),
[Premieres](https://flixpatrol.com/api2/endpoint-premieres/),
[Markets](https://flixpatrol.com/api2/endpoint-markets/).

## Umsetzungsreihenfolge

1. **Vorhandene Daten richtig durchreichen.** Known-IDs erhalten; Cachezugriff
   von heutigen Charts lösen; Herkunft, Sprache und Datum der Beschreibung
   mitführen. Persönlicher Titel/Text gewinnt, danach vorhandener passender
   deutscher Quellentext, danach belegter fremdsprachiger Text als solcher.
   Beschreibungsquelle und Chartquelle bekommen jeweils den richtigen Link.
   Fertig, wenn Entdecken/Streaming denselben Fakt lesen und bei Chartwechsel
   keinen bereits gespeicherten Text verlieren. Keine neue externe Quelle.

2. **FlixPatrol effizienter auslesen.** Eine kleine gezählte Probe für
   `titles` mit mehreren bekannten IDs, zusätzlich die tatsächlich benötigten
   Genre-/Keywordreferenzen. Erwartete und gelieferte ID-Mengen vergleichen;
   Teilmengen oder Typkonflikte nie als vollständig verbuchen. Kleine Bündel,
   unmittelbare Einzelcheckpoints und Wiederverwendung der bisherigen Erfolge.
   Wenn der Vertrag nicht trägt, den bestehenden Einzel-ID-Pfad beibehalten.
   Danach strukturierte Fakten für das bestehende Ranking und Karten nutzen.

3. **Beschreibungen gezielt vervollständigen.** Vor größerem Lauf eine kleine
   Watchmode-Probe mit höchstens sechs vorhandenen Watchmode-IDs, `language=de`,
   ohne Anhänge: Filme und Serien, Netflix-Kandidaten ohne FlixPatrol-Fakten,
   ein Titel mit abweichendem deutschem Namen. Prüfen: ID/Typ/Jahr, echte deutsche
   Titel-/Textabdeckung, Null-/Fallbackfälle und gebuchte Credits. Erst danach
   die sichtbaren Entdecken-Kandidaten priorisieren, anschließend relevante
   Streaming-Titel mit konkreter Inhaltslücke. Bereits vorhandene passende
   Fakten nicht nochmals holen; neutrale Texte einmal zentral cachen.

4. **Aktualität und Angebotsbelege vereinheitlichen.** Optional Netflix ebenfalls
   über FlixPatrol-Tagescharts beziehen: Dann haben die vier Streamingmarken
   dieselbe zeitliche Grundlage. Die bisherige Netflix-Wochenquelle wäre bewusst
   ersetzt oder klar getrennt als Wochenbeleg geführt. Bestehende 50er-Aufteilung
   und Dienstefilter erhalten. Neue Tagescharts erst nach Budget- und
   Batchnachweis aktivieren. Parallel Chart-/Angebotsbelege auseinanderziehen
   und die begrenzte Watchmode-Werktyp-Abdeckung klären. „Neu“ bleibt unverändert
   ein Dienstediff, auch nach Text-, Typ- oder Quellenumstellungen: eine neue
   Importabdeckung darf keinen Altbestands-Neuflut erzeugen.

5. **Control-/Sandbox später auf dieselben Messwerte setzen.** Lesbar machen:
   letzter Versuch, letzter erfolgreicher Datenstand, nächste Fälligkeit,
   Requests/Credits je Verbraucher, Cachetreffer, Beschreibungssprache und
   Abdeckung, offene Identitäten, fehlende Angebotsbestätigung. Ein Teilquellenfehler
   soll zeigen, welcher Anteil alt ist; keine neue Abrufzeit als frische Quelle.
   Eine Änderung vom atomaren 50er-Feed zu Teilveröffentlichung wäre ein eigener
   Vertragsschritt, nicht beiläufiger Bestandteil der Metadatenkorrektur.

## Kontingente und erwarteter Aufwand

Die beiden Kontingente werden nicht zusammengerechnet. Watchmode-Credits und
FlixPatrol-Aufrufe bleiben separat, jeweils mit allen Verbrauchern im eigenen
gemeinsamen Zähler. Ein zusammengebauter HTTP-Request kann bei Watchmode mehrere
Credits kosten; die bestehende Eins-zu-eins-Zählung darf dafür nicht unverändert
wiederverwendet werden.

| Variante | Rechnung für 31 Tage | Einordnung |
| --- | --- | --- |
| FlixPatrol heute, kalter Titelcache in jedem Lauf | `(5 Charts + 25 Titel + 1 Quota) × 31 = 961` | Bestehende Obergrenze; Einmalproben zusätzlich. Der Lauf vom 11.09. brauchte laut Beleg nur neun Datenrequests. |
| Derselbe Umfang, nach erfolgreicher Bündelprobe mit zehn IDs je Request | `(5 Charts + 3 Titelbatches + 2 Vokabular + 1 Quota) × 31 = 341` | Konservative Planung einschließlich der beiden neuen Vokabulararten, keine gemessene Ersparnis. Cachetreffer können weiter reduzieren. Diagnose-/andere Verbraucher kommen hinzu. |
| Zusätzlich Netflix Film/Serie täglich; maximal 35 Titel, Bündel zu zehn | `(7 Charts + 4 Titelbatches + 2 Vokabular + 1 Quota) × 31 = 434` | Bedingt durch den echten Batchbeleg. Diagnose-/andere Verbraucher kommen hinzu. Ohne Bündelung wären bereits ohne Vokabular bis zu 1.333 möglich und damit zu viel. |
| Watchmode bisheriger Betrieb | Simulation rund 1.386–1.843, konservativ bis 1.972 Credits je Zyklus | Abo laut hinterlegtem Setup 2.500; bestehende technische Grenze 2.000, je logischem Lauf 500. Größeres Abo bedeutet nicht automatisch großen freien Puffer. |
| Watchmode-Details | Ein Credit je bestehender Watchmode-ID ohne Anhänge; maximal sechs pro explizitem Lauf | Optionales Detailbudget höchstens 28 Credits pro Zyklus im bestehenden gemeinsamen 2.000er-Zähler: konservative Pflichtlaufprognose 1.972 plus 28. Kein eigener zweiter Verbrauchszähler und kein automatischer Zusatzlauf. |

Der letzte gespeicherte FlixPatrol-Nachweis zählt 47 eigene Versuche. Der darin
enthaltene offizielle Quota-Wert ist älter und separat datiert; daraus wird kein
aktuelles Restkontingent abgeleitet. Watchmode meldete nach dem dokumentierten
48h-Lauf 992 verbrauchte Credits. Vor späteren echten Proben beide tatsächlichen
Kontostände und bestehenden Regeln erneut lesen. Keine neuen Gates, zusätzlichen
Abos oder Anbieteraufrufe sind durch diesen Plan eingerichtet.

## Übergang zur persönlichen Sandbox

Ein konkreter Übergangspunkt liegt in
[entdecken-six-day.yml](../.github/workflows/entdecken-six-day.yml) und
[flixpatrol-usage.yml](../.github/workflows/flixpatrol-usage.yml): Beide beziehen
die produktiven Datenzugänge aktuell aus `environment: staging`. Vor Umstellung
dieser Umgebung auf eine isolierte Sandbox muss die Produktionsversorgung ein
eindeutiges eigenes Ziel erhalten. Sonst würden die Datenjobs der falschen
Datenbank folgen.

Production behält einen gemeinsamen Ingest und Cache. Die Control-Fläche liest
begrenzte Produktionsstatusdaten über einen serverseitig geschützten Weg;
Service-Role- und Anbieterkeys gehören nicht in den Browser. Experimente laufen
im getrennten Sandbox-Backend mit ausgewählten neutralen Testdaten und zunächst
ohne eigene automatische Providerjobs. Ein zweiter täglicher Abruf desselben
FlixPatrol-Bestands ist dafür nicht nötig. Der spätere KI-Assistent bekommt
beobachtbaren Status; Schreib- und Provideraktionen werden erst im konkreten
Control-Vertrag festgelegt.

## Abnahme des späteren Baus

- Derselbe Film wird trotz übersetztem Titel über die vorhandenen starken IDs
  zugeordnet; Remakes, Typkonflikte und manuelle Korrekturen bleiben geschützt.
- Anzahl sichtbarer Titel mit Beschreibung/Genre und Sprache vorher/nachher
  messen; Quellen- und Chartdatum bleiben getrennt.
- Nur ausgewählte Dienste, Kino ergänzt den vereinbarten Pool; Popularität
  bleibt von persönlicher Passung und Angebotsbestätigung getrennt.
- Neuer Chartplatz, neue Beschreibung, breitere Typabdeckung und Aktualisierung
  eines anderen Dienstes verändern keine bestehende 14-Tage-Frist.
- Bündel mit fehlenden/mehrdeutigen IDs, Cacheausfall und ausgeschaltete Provider
  verdecken keine Datenlücke und löschen keinen gültigen persönlichen Bestand.
- Fokussierte lokale Prüfungen während des Baus, ein passender Abschlusslauf;
  zusätzliche bezahlte KI-Praxisprüfung nur als eigener beauftragter Schritt.

## Umsetzung dieses Auftrags

Master: `/private/tmp/kd-data-plan-master-20260911`, Branch
`codex/data-plan-master-20260911`, Ausgang `cb98199`.
Arbeitsweg: gemeinsame Foundation, danach abhängige Produktintegration.
Der Watchmode-Produzent wird als eigene Etappe im getrennten Repository
bearbeitet und bekommt einen eigenen Integrationskandidaten. Der normale
App-Hauptcheckout und vorhandene generierte Dateien bleiben unberührt.

| ID | Nutzerergebnis | Stand |
| --- | --- | --- |
| D1 | Vorhandene Identitäten und neutrale Fakten bleiben vollständig und unabhängig von aktuellen Chartplätzen nutzbar. | DONE auf Staging `ee8ef91`; neuer Cache-Lookup live rückgelesen |
| D2 | FlixPatrol kann benötigte Titel und Begriffe sparsam und nachweisbar vollständig laden; Netflix ist für denselben Tagesweg vorbereitet. | GEBAUT und gepusht; Zwei-ID-Probe bestanden, reales Titelbündel gescheitert; Netflix-/Batchmodus wieder aus |
| D3 | Entdecken und aufgeklappte Streaming-Karten nutzen dieselben belegten Texte/Genres; Dienste, persönliche Daten und Neu-Fristen bleiben geschützt. | DONE auf Staging `ee8ef91`; lokale Suite und CI-Browser grün |
| D4 | Watchmode ergänzt deutsche Details gezielt im bestehenden Kontingent und erhält bekannte externe IDs im Export. | CODE GELIEFERT: `0fd4ac1`, gepusht und im Produzenten integriert; Daten beim nächsten regulären Export, Sprachprobe offen |
| D5 | Der gemeinsame lokale Kandidat ist geprüft; offene Vertrags-/Liefergrenzen und spätere Befunde sind konkret dokumentiert. | APP GELIEFERT; Netflix-Blocker und spätere Befunde dokumentiert; physische PWA-Abnahme offen |

Die spätere Control-/Sandbox-Oberfläche, Infrastrukturtrennung, Änderung der
laufenden Schedulerziele und Erweiterung der Watchmode-Werktypen werden in
diesem Auftrag nicht gebaut. Die Analyse hierzu bleibt als spätere Arbeit
erhalten. Netflix-Umschaltung setzt den im Plan geforderten Bündel-/Budgetbeleg
voraus; bis dahin bleibt der laufende Quellenweg funktionsfähig.

### Befunde vor der Aktivierung (historischer Ausgangsstand)

- Netflix wurde ursprünglich auf der funktionierenden öffentlichen Wochenquelle
  belassen; FlixPatrol ergänzte die fehlenden Prime-/Disney-/Apple-Quellen.
  Die offizielle Companies-Dokumentation belegt inzwischen Netflix eindeutig
  als `cmp_IA6TdMqwf6kuyQvxo9bJ4nKX`. Die Tagesquelle ist damit adressierbar;
  der praktisch bestätigte Bündelvertrag bleibt Voraussetzung für die Umschaltung.
  Quelle: [Companies](https://flixpatrol.com/api2/endpoint-companies/).
- Die bisherigen Diagnosewege unterstützten nur einzelne festgelegte
  Titel-/Chartproben. Ein eigener gezählter Zwei-ID-Diagnoseweg ist jetzt
  lokal gebaut; der echte Aufruf steht aus. Der Beleg zweier Titles-IDs
  bestätigt weder größere Mengen noch Genre-/Keywordantworten automatisch.
  Konkrete Reihenfolge: [Aktivierungsvertrag](FLIXPATROL_BATCH_FORMAT9_AKTIVIERUNG.md).
- Die Erweiterung der Watchmode-Werktypen und die später nötige eindeutige
  Produktionsbindung der derzeitigen `environment: staging`-Datenjobs bleiben
  wie vereinbart spätere Arbeit.

- Werkzeugbefund beim Bau: Die ersten `apply_patch`-Aufrufe der beiden
  Baupakete hingen fest und wurden wirkungslos abgebrochen. Keine Dateien,
  Anbieteraufrufe oder Shared-Daten wurden dadurch verändert. Die Ursache
  dieses Werkzeugfehlers wird später behandelt; der Bau wurde mit lokalen
  Dateischreibbefehlen abgeschlossen.
- Frischer lesender Stand vom 11.09., 09:31 UTC: gemeinsamer FlixPatrol-Zähler
  47 Versuche, 47 abgeschlossen; der offizielle Quota-Snapshot stammt weiterhin
  vom 10.09., 09:41 UTC. Für die Reads wurden null Anbieterrequests verwendet.
- Gesicherter Vorhervergleich (11.09., 09:46 UTC): 29 gespeicherte
  FlixPatrol-Beschreibungen; im Watchmode-Katalog vom 10.09., 22:02 UTC passen
  22 Titel eindeutig über IMDb-ID, Jahr und Werktyp, davon 17 bei den fünf
  ausgewählten Diensten. Fehlende Angebotsbelege der übrigen Titel werden
  nicht durch ähnliche Namen ersetzt. Die Messung startet keinen Provider.

- Aktivierungsreihenfolge Netflix: Ein eigenständig gekennzeichneter
  Tagesfeed braucht einen kompatiblen Feedvertrag. Alle aktiven Consumer
  müssen Format 9 unterstützen. Der spätere Live-Readback bestätigt, dass
  Production seinen Feed ausgeschaltet hat; der alte Production-Build
  blockiert die ausdrückliche Staging-Aktivierung deshalb nicht. Der bestehende
  Wochen-/Format-8-Weg bleibt für eine sichere Rücknahme gültig. Das ist eine Grenze der optionalen
  Quellenumschaltung, keine zusätzliche Voraussetzung für den bisherigen Merge.

- Bestehender Produzentenbefund aus beiden providerfreien Vergleichsexporten:
  `max_namen_liste_v1.json` fehlt im normalen Suchpfad; das zusätzliche
  Namenssignal der alten Heuristik ist deshalb bereits vorher inaktiv.
  Dieser Nebenbefund wird später behandelt und ist nicht verändert worden.
- Eine echte deutsche Watchmode-Sprachprobe und der FlixPatrol-Bündelbeleg
  stehen noch aus. Der Detailcache kennzeichnet die angefragte Sprache
  separat und behauptet keine belegte deutsche Antwort. Kein Probe-Ergebnis
  wird aus den lokalen Mocks abgeleitet.

### Paketbindung

- Foundation D1/D2: `/private/tmp/kd-data-plan-foundation-20260911`, Basis
  `f3abe990dea3604f5d3b053c8fcc21e2d28ee876`. Besitzt gemeinsamen Providerclient,
  Faktennormalisierung, Cache-Lookup-RPC, Faktenservice, Vertragsdokumentation
  und die dazugehörigen fokussierten Tests. Folgepakete starten nach Integration.
- Eigene Produzenten-Etappe D4:
  `/private/tmp/kd-watchmode-data-plan-20260911`, Basis
  `55b8392e0d9c552c40dfb8cf3b1922326cd673d9`. Besitzt Known-Export,
  separaten Detailcache/CLI und eigene Tests. Keine generierten Echtdaten,
  bestehenden Abrufpläne oder Kontingentgrenzen ändern.
- Parallele App-Welle auf exakt `c3dee65716ae08883b2e9e60e5a407a804e7a101`:
  `kd-data-plan-product-20260911` besitzt Katalog-/Entdeckenprojektion,
  Faktenwiring und die beiden Kartenansichten. `kd-data-plan-backend-20260911`
  besitzt den Entdecken-Adapter, den kompatiblen Feedparser und eine additive
  Feedmigration. Foundation, Workflows und persönliche Daten sind kein Scope
  dieser Welle. Der Master übernimmt die fertigen, fokussiert geprüften Pakete.
- Eingefrorene Repo-Naht: optionale `title_facts` je exportiertem Titel mit
  `title-facts-projection-v1`. `film`/`series`, starke Identitäten,
  Herkunft und Zeitbelege sind explizit. Unbekannte Beschreibungssprache
  bleibt `null`; angefragte Sprache ist davon getrennt.

### Lieferbelege

- Foundation-Commit `b979974`, in den Master als `4a55123` übernommen.
  Neue Clientprüfung 7/7, neuer Faktenservice 9/9, bestehende Data-/Client-/
  Faktenlib-/Service-/Kontextprüfungen 11/15/9/12/9 bestanden. Synthetische
  PostgreSQL-Prüfung einschließlich RLS und mehrdeutiger IDs: 5/5 bestanden.
- Watchmode-Produzent: separater lokaler Commit `c7d61889345466661ac6ee7f0fe131bb8a88557a`.
  Details zuletzt 14/14 und bestehende Härtung 33/33 bestanden. Keine generierten
  Echtdaten, Liveabfragen oder Scheduleränderungen.
- Bei lokalen Werkzeugfreigaben blieben Unterläufe hängen. Der Master hat
  diese wirkungslosen Starts beendet und übernimmt nötige lokale Git-/PG-
  Schritte selbst. Unkritische lokale Freigaben sind durch Max ausdrücklich
  delegiert; technisch notwendige Sandboxfreigaben bleiben Werkzeuggrenzen.
- Ergänzende lokale Integrationsbelege: datierte Chartbelege bleiben beim
  Identitätslookup erhalten (`8c9fca0`). Die Forecast-Außennaht behält ihren
  bestehenden Payloadvertrag (`49dd685`); vier gezielte Deno-HTTP-Mocks prüfen
  Altweg, direkten ID-Weg, Chart-unabhängigen ID-Cache und Cachefehler. Keine
  echte KI-Anfrage. Optionaler Watchmode-Cachefehler stoppt den normalen
  Export nicht (`0fd4ac1`); der Detail-CLI bleibt bei diesem Fehler gesperrt.
- Watchmode-Lieferpipeline: 11/11 Mockprüfungen bestanden. Echter lokaler
  Vorher-/Nachher-Export desselben Katalogs, ohne Anbieter: weiterhin 226
  Known- und 24.502 Entdecken-Titel. Im Known-Export steigen vollständige
  IMDb-/TMDB-ID-Paare von 0 auf 226. Alle bisher vorhandenen Felder jedes
  Titels bleiben identisch; kein Detailtext wird erfunden. Vergleichsbeleg:
  `/private/tmp/kd-watchmode-export-comparison-20260911.json`.
- Produktintegration `4167e2a`: neue Faktenprojektion 10/10; bestehende
  Streaming-DOM-Prüfung 44/44, Katalog 116 plus 13 Identitätsfälle und Build
  bestanden. Neutrale Providerbeschreibungen werden nur angezeigt; persönliche
  Titel, Notizen und gespeicherte Bewertungen werden nicht übernommen/überschrieben.
- Backendintegration `31826b7`: Batch-/Format-9-Prüfung 47/47, alter Adapter
  53/53, Functionkonfiguration 19/19, gezählte Diagnostik 13/13; synthetisches
  PostgreSQL 17.10 mit alter und neuer Feedvariante, Service-Rollen und
  Vokabulargrenzen 7/7. Keine Shared-Migration ausgeführt.
- Gemeinsame Feednaht `caa8b4e`: 19 bisherige Frontendprüfungen plus sieben
  neue Integrationsfälle. Beide Feedvarianten durchlaufen dieselbe reale
  Karten-/Dienst-/Identitätsprojektion und den tatsächlich gerenderten Tab.
  Reine Format-9-Reads ohne Adaptertelemetrie bleiben lesbar; Charts allein
  erzeugen keine bestätigte Verfügbarkeit.
- Vorher-/Nachhermessung mit realem Katalog und 29 gespeicherten Fakten,
  aber rein lokal und ohne persönliche Mediathek: unverändert 9.348 Titel
  und 96 Titel mit Genreangaben bei den fünf ausgewählten Diensten; nutzbare
  Beschreibungen steigen von 0 auf 17, alle 17 mit Quelle und Datum.
  Belege: `/private/tmp/kd-data-plan-product-before.json` und
  `/private/tmp/kd-data-plan-product-after.json`. Kein Anbieterrequest.
- Repoübergreifende DTO-Probe Watchmode-Produzent → App-Projektion:
  sieben synthetische Assertions bestanden, Schema/IDs/Quelle/Genres bleiben
  erhalten, unbekannte Antwortsprache bleibt unbekannt, lokaler Titel gewinnt.
- Function-Abschlussprüfung auf dem integrierten Stand:
  `npm run test:function` mit 341/341 Deno-Mocks, Exit 0. Kein echter KI-Aufruf.
- Die Gesamtsuite wurde zunächst durch den bestehenden sauberen-Commit-
  Vertrag des historischen Einmallaufs gestoppt (`RELEASE_CLOSURE_DIRTY`),
  weil die Testsuite-Erweiterung noch uncommitted war. Der identische alte
  Test besteht im bisherigen Master. Der Integrationscode wurde anschließend
  regulär committed; keine Schutzregel oder Erwartung wurde abgeschwächt.
- Zwei historische Format-5-Testfixtures hatten bislang Chartzugehörigkeit
  ohne Angebotsbeleg als persönliche Empfehlung erwartet. `5a31213` prüft
  nun ausdrücklich den leeren Fall und getrennt die bestätigte Watchmode-
  Auswahl einschließlich Gesehenfilter und Sechsergrenze (je 9/9). Die
  Produktlogik wurde dafür nicht nochmals verändert.
- Abschluss auf App-Code `5a31213`: vollständiges `npm test` mit Exit 0,
  einschließlich neuer Fakten-/Batch-/Format-9-Checks, synthetischer PostgreSQL-
  Tests, vorhandener Funktions-/DOM-/Daten-/Kontoschutzprüfungen, Einzeldatei,
  Vite-Build (238 Module) und Pages-Prüfung (72/72). Der bestehende Hinweis
  auf große Build-Chunks bleibt ein späterer Performancebefund; dafür wurde
  kein funktionierender Produktbereich umgebaut.
  Log: `/private/tmp/kd-data-plan-final-npm-test.log`.
  Function-Log: `/private/tmp/kd-data-plan-final-function-test.log`.
- Historischer lokaler Endreadback vor der Lieferfortsetzung: beide
  Integrationskandidaten waren committed; die ursprünglichen lokalen
  Änderungen in den Hauptcheckouts waren erhalten. Push, CI, Deployment und
  Live-Aktivierung waren zu diesem Zeitpunkt noch nicht erfolgt. Den
  tatsächlichen späteren Lieferstand nennt der erste Abschnitt dieses Plans.

## Weitere Befunde aus der tatsächlichen Lieferung

- Behoben: Eine Host-Zeitzonenabhängigkeit im neuen Quellen-Datum wurde im
  ersten CI-Lauf sichtbar. Der bestehende Europe/Vienna-Helfer wird jetzt
  wiederverwendet; UTC-/Wien-Probe und vollständige Suite sind grün.
- Behoben: Fünf Cage-/Streaming-Browserfälle verloren ihren Katalog, weil
  die additive Faktenmethode auch bei bestehenden schmalen Katalogadaptern
  vorausgesetzt wurde. Ein Guard hält sie optional; alle zehn betroffenen
  Chromium-/WebKit-Fälle bestehen mit unveränderten Erwartungen. Keine
  Cage-Logik umgebaut.
- Kein Publisher-Umbau nötig: Der remote aktive Trigger
  `kd_catalog_streaming_split` reicht bereits beide vollständigen Teilpayloads
  an die aktuellen PWA-Assets weiter; beide Payloads sind gleich. Ein zunächst
  vermuteter Publisherfehler wurde durch den Live-Readback widerlegt.
- Behoben im erneuerten Restauftrag: `kd_catalog.updated_at` enthielt alte
  Werte vom 22.07. Der Publisher setzt jetzt die tatsächliche Schreibzeit;
  der Quellenstand bleibt separat erhalten. Live-Readback für Streaming erfolgt.
- Im erneuerten Restauftrag bearbeitet: deutsche Watchmode-Probe, Typmapping,
  Namenssignal, tatsächliche Frische und Chunk-Aufteilung. Offen bleiben die
  quotengebundene Typaktivierung und der ausdrücklich nach dem PWA-Test
  folgende Merge samt Produktionsbindung/Sandbox-Trennung.

Technische Belege: `/private/tmp/kd-data-plan-delivery-20260911/`.
Frühere lokale Prüfstände im Plan sind historische Bau-Evidenz;
der Abschnitt zur aktuellen Lieferung ist die Statusautorität.
