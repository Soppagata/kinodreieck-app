# Kinodreieck: Plan für lizenzsaubere Programmdaten

Stand: 22. Juli 2026. Dieses Dokument ist eine technische und organisatorische
Planungsgrundlage, keine individuelle Rechtsberatung.

## Kurzentscheidung

Die Programme direkt bei den Kinos zu beziehen ist technisch sinnvoller und
voraussichtlich weniger riskant als die vollständige Wiener Sammlung von film.at
zu übernehmen. Öffentlich sichtbar bedeutet aber nicht automatisch frei zur
kommerziellen Weiterverwendung. Der produktive Zielweg lautet daher:

1. schriftliche Erlaubnis oder lizenzierter Feed,
2. automatischer Direktimport nur für freigegebene Quellen,
3. Veröffentlichung ausschließlich der vereinbarten Fakten,
4. kein Import von Beschreibungen, Plakaten, Fotos, Trailern oder Logos ohne
   eigenes Nutzungsrecht.

Scraping ohne Erlaubnis bleibt höchstens ein lokaler technischer Prototyp und
keine belastbare Produktionsquelle.

## Warum das Aufteilen allein nicht genügt

- Spielzeit, Filmtitel und Kinoname sind als einzelne Fakten typischerweise nicht
  urheberrechtlich geschützt. Eine systematisch gepflegte Sammlung kann dennoch
  als Datenbank geschützt sein.
- § 76c UrhG schützt Datenbanken bei wesentlicher Investition in Beschaffung,
  Prüfung oder Darstellung. § 76d erfasst auch die wiederholte und systematische
  Übernahme kleiner Teile, wenn sie der normalen Verwertung entgegensteht oder
  berechtigte Interessen unzumutbar beeinträchtigt.
- Der EuGH unterscheidet zwar zwischen Investitionen in das Erzeugen von Daten
  und Investitionen in deren Beschaffung, Prüfung und Darstellung. Das macht den
  Schutz eines selbst erstellten Spielplans weniger eindeutig als den Schutz
  eines Aggregators, ist aber keine pauschale Scraping-Erlaubnis.
- Eine frei erreichbare Seite oder ein undokumentierter JSON-Endpunkt ist keine
  Lizenz. `robots.txt` regelt Crawler-Zugriffe, nicht die Berechtigung zur
  anschließenden kommerziellen Wiederveröffentlichung.
- Eine kostenlose App ist nicht automatisch außerhalb dieser Regeln. Entscheidend
  sind unter anderem Umfang, Systematik, Wiederveröffentlichung, Vertragslage und
  Auswirkungen auf die normale Verwertung.
- Die Aussage aus der angehängten KI-Antwort, der bisherige lokale Abruf sei über
  eine „Privatkopie“ pauschal unbedenklich, ist zu weit. § 76d Abs. 3 Z 1 nimmt
  gerade elektronische Datenbanken, deren Elemente einzeln elektronisch
  zugänglich sind, von der dortigen Privatnutzungs-Ausnahme aus. Das bedeutet
  nicht automatisch, dass jeder lokale Test rechtswidrig ist; auf diese Ausnahme
  sollte das Projekt seine Sicherheit aber nicht stützen.

Primärquellen:

- [Österreichisches Urheberrechtsgesetz § 76c](https://www.ris.bka.gv.at/eli/bgbl/1936/111/P76c/NOR12040041)
- [Österreichisches Urheberrechtsgesetz § 76d](https://www.ris.bka.gv.at/eli/bgbl/1936/111/P76d/NOR40241419)
- [EU-Datenbankrichtlinie 96/9/EG, insbesondere Art. 7](https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=CELEX:31996L0009)
- [EuGH C-203/02, British Horseracing Board](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:62002CJ0203)
- [EuGH C-604/10, Football Dataco](https://curia.europa.eu/jcms/upload/docs/application/pdf/2012-03/cp120016de.pdf)
- [EuGH C-762/19, CV-Online Latvia](https://infocuria.curia.europa.eu/tabs/redirect/juris/liste.jsf?language=de&num=C-762/19)
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)

## Quellenstrategie für Wien

### Bevorzugte Lizenzroute: International Showtimes API

International Showtimes bietet eine kommerzielle Showtimes-API ausdrücklich für
Apps, Publisher und Discovery-Plattformen an. Österreich ist technisch als
Markt (`AT`) vorgesehen; mit TVmedia/VGN nennt der Anbieter außerdem einen
österreichischen Produktivkunden. Die API liefert Kino-, Film- und
Vorstellungsdaten, Sprach- und Untertitelinformationen, Formate und je nach Tarif
Ticketlinks. Sie passt damit nahezu direkt auf das normalisierte
Kinodreieck-Programmformat.

Preisstand 22. Juli 2026, jeweils pro Markt und Monat:

- 7 Tage Testzugang: 0 Euro,
- Basic: ab 149 Euro; Vorstellungsdaten, aber keine Sprache/Untertitel,
- Business: ab 299 Euro; einschließlich Sprache/Untertitel und XML/CSV, jedoch
  laut Tarifvergleich ohne Vorstellungsformate und Ticketlinks,
- Enterprise: Preis auf Anfrage; vollständige Formate und Ticketlinks.

Für Kinodreieck ist Business die realistische Mindeststufe, sofern OV/OmU und
Untertitel erhalten bleiben sollen. Direkte allgemeine Kino-Weblinks könnten
weiter aus dem eigenen Kinoverzeichnis kommen; echte Ticket-Deep-Links und
Premiumformate würden voraussichtlich Enterprise erfordern.

Vor einer Entscheidung wird der kostenlose Testzugang gegen die vollständige
Wiener Soll-Liste geprüft: jedes Kino, mindestens sieben Programmtage,
Sonderveranstaltungen, OV/OmU/OmeU, kurzfristige Änderungen und Dubletten. Der
Vertrag muss außerdem ausdrücklich erlauben, die Daten serverseitig zu cachen,
in der eigenen Datenbank zu normalisieren und den App-Nutzern öffentlich sowie
kommerziell anzuzeigen. Da der Anbieter die Daten laut eigener Beschreibung mit
einer Crawling-Engine direkt aus Quellen gewinnt, sollte er die notwendigen
Rechte zur Bereitstellung und Nutzung vertraglich zusichern.

- [International Showtimes: Showtimes API](https://www.internationalshowtimes.com/showtimes-api)
- [Preise und Tarifvergleich](https://www.internationalshowtimes.com/pricing)
- [API-Dokumentation v5](https://api.internationalshowtimes.com/documentation/v5/)
- [Österreichischer Anwendungsfall TVmedia/VGN](https://www.internationalshowtimes.com/use-cases/case-stady-1)

### Vergleichsangebot: MovieGlu

MovieGlu ist ebenfalls ein etablierter kommerzieller Datenlieferant für Kino- und
Vorstellungsdaten, Apps und Websites. Die API bietet Kinosuche, Programme je Kino
und Tag, Filmmetadaten, technische Formate und Ticket-Deep-Links. Der Endpunkt
`cinemaShowTimes` darf laut Dokumentation gecacht werden und wäre daher für die
zentrale Kinodreieck-Importpipeline geeignet.

Für Österreich bleiben jedoch mehr offene Punkte als bei International
Showtimes:

- Österreich ist nicht unter den öffentlich auswählbaren Ländern für die
  kostenlose Evaluation; dort stehen derzeit nur Vereinigtes Königreich,
  Frankreich, Deutschland, Spanien, Irland, USA, Indien, Kanada und Australien.
  Österreich kann im Freitext als gewünschter Markt genannt werden und muss
  direkt angefragt werden.
- Preise werden nicht veröffentlicht, sondern nach Ländern, Standorten und
  Requestvolumen angeboten.
- Die öffentliche Showtimes-Dokumentation unterscheidet `Standard`, `3D`, `IMAX`,
  `IMAX3D` und `Other`, dokumentiert aber keine verlässlichen Felder für
  Vorführungssprache und Untertitel. Für OV/OmU/OmeU muss MovieGlu die konkrete
  Verfügbarkeit im österreichischen Feed bestätigen.
- Datum und lokale Startzeit kommen getrennt und werden laut Anbieter nicht um
  Zeitzone oder Sommerzeit bereinigt. Das muss der Importer für Wien selbst
  normalisieren.
- Die Evaluationslizenz erlaubt weder öffentliche Anzeige noch Speicherung auf
  eigenen Servern. Erst der individuelle Produktionsvertrag kann den benötigten
  DB-Cache und die kommerzielle App-Nutzung erlauben.

MovieGlu ist daher ein sinnvoller Preisdruck- und Fallback-Kandidat. Ein Angebot
wird nur dann technisch gleichwertig, wenn Österreich vollständig verfügbar ist
und OV/OmU samt Untertiteln pro Vorstellung geliefert werden. Andernfalls würde
ein zentraler Teil der aktuellen Kinodreieck-Funktion verloren gehen.

- [MovieGlu: Produkt und Abdeckung](https://movieglu.com/about/)
- [MovieGlu: Preise auf Anfrage](https://movieglu.com/pricing/)
- [MovieGlu: Registrierung und Evaluationsländer](https://api-registration.movieglu.com/)
- [MovieGlu: cinemaShowTimes-Dokumentation](https://developer.movieglu.com/v2/api-index/cinemashowtimes/)
- [MovieGlu: Evaluationsbedingungen](https://developer.movieglu.com/company/terms-of-use/)

Das Quellenregister in `KINOQUELLEN_WIEN.csv` bildet die aktuelle Kernabdeckung
der App ab. Statt rund 30 einzelne Gespräche sind zunächst sechs Bündel möglich:

1. **nonstop Kinoabo**: zentraler Ansprechpartner für 18 reguläre Wiener
   Programmorte und zusätzlich „Kino wie noch nie“. Vor Verwendung muss geklärt
   werden, ob nonstop die Daten nicht nur anzeigen, sondern auch an Kinodreieck
   zur Weiterverwendung lizenzieren darf.
2. **Cineplexx**: neun Wiener Programme, davon Actors Studio und Urania mit
   Überschneidung zu nonstop.
3. **Hollywood Megaplex**: Gasometer und SCN.
4. **Lugner Kino**.
5. **Autokino Wien**: Randgebiet außerhalb der strengen Wiener Stadtgrenze, aber
   bereits Teil der aktuellen App-Abdeckung.
6. **WIENXTRA-Cinemagic**: eigenständiges kuratiertes Programm in der Urania.

### Aggregator-Abkürzung: Uncut

Uncut ist als siebte, strategisch besonders interessante Route zu behandeln.
Die Seite führt praktisch alle regulären Wiener Kinos, einschließlich
Filmmuseum und Cinemagic, sowie mehrere Sommerkinos. Betreiber und direkter
Ansprechpartner ist Harald Zettler als Einzelunternehmer. Es sind keine
öffentlichen API-, Inhalts- oder Weiterverwendungslizenzen auffindbar; das ist
weder eine Erlaubnis noch ein Ablehnungssignal.

Eine Kooperation ist realistisch genug für eine prioritäre Anfrage, weil die
Entscheidung offenbar bei einem direkt erreichbaren Inhaber liegt und Uncut
geschäftliche Anfragen ausdrücklich entgegennimmt. Der zentrale Prüfpunkt ist,
ob Uncut die Programmdaten selbst lizenzieren beziehungsweise unterlizenzieren
darf. Ein guter Pilot wäre Wien, reine Vorstellungsfakten, geringe Abruffrequenz,
klare Uncut-Nennung und Rücklinks. Ein kostenloses, unbeschränktes kommerzielles
Vollrecht ist deutlich weniger wahrscheinlich als ein begrenzter Pilot, eine
bezahlte Datenlizenz oder eine sichtbare Medienpartnerschaft.

- [Uncut: Kontakt und Impressum](https://www.uncut.at/kontakt/)
- [Uncut: Wiener Kinos](https://www.uncut.at/wien/kinos/)
- [Uncut: Wiener Kinoprogramm](https://www.uncut.at/wien/kinoprogramm/)

Die städtische Liste bestätigt die Wiener Programmkinos; die aktuelle
nonstop-Liste nennt ihre teilnehmenden Häuser. Beide Listen sind Inventarquellen,
nicht automatisch Lizenzen für die Programmdaten.

- [Stadt Wien: Programmkinos](https://www.wien.gv.at/kultur/programmkinos)
- [nonstop: teilnehmende Kinos](https://nonstopkino.at/kinos/)

Saisonale Quellen wie Rathausplatz, Kino am Dach, VOLXkino, FRAME[O]UT,
dotdotdot, Stumm & Laut, Sunset Cinema, Architektur.Film.Sommer und Sommerkino
am Markt kommen nach stabiler Kernabdeckung als Phase 2 hinzu. Die jeweils
aktuelle Inventarliste führt die [Stadt Wien](https://www.wien.gv.at/kultur/sommerkinos).

## Was in jede schriftliche Freigabe gehört

Die Zusage sollte nicht nur „ihr dürft unsere Website verwenden“ lauten, sondern
mindestens diese Punkte beantworten:

- automatisierter Abruf erlaubt; bevorzugt JSON, XML, CSV, ICS oder regelmäßiger
  Datei-/E-Mail-Export statt HTML-Scraping,
- konkrete Domains/Endpunkte und maximale Abruffrequenz,
- erlaubte Felder: Kino, Filmtitel, Datum, Uhrzeit, Fassung, Saal/Format,
- öffentliche und gegebenenfalls kommerzielle Anzeige in Kinodreieck,
- Cache-, Archiv- und Löschfristen,
- Quellenhinweis und direkter Buchungslink,
- Recht zur Normalisierung und Zusammenführung mit anderen Kinoquellen,
- bei Aggregatoren ausdrücklich das Recht zur Weitergabe beziehungsweise
  Unterlizenzierung,
- gesonderte Entscheidung, ob Programmdaten in einem Downloadpaket weitergegeben
  werden dürfen,
- Umgang mit Änderungen, Widerruf, Fehlerkorrekturen und Abschaltung.

Ohne ausdrückliches Weitergaberecht enthält ein App-Download nur Anwendung,
Schema und Verbindungskonfiguration. Die aktuellen Programmdaten werden dann
zur Laufzeit aus der lesegeschützten Veröffentlichungs-API geladen und nicht im
Download mitverteilt.

## Empfohlenes Datenmodell

Die vorhandene Trennung aus App, gemeinsamem Katalog und persönlichen Daten wird
beibehalten und geschärft:

1. **Quellenregister**: Betreiber, URL, Kontakt, Erlaubnisstatus, erlaubte Felder,
   Frequenz, Lizenzablauf und technische Importart.
2. **Quelladapter**: ein kleiner Adapter pro freigegebenem Betreiber; kein Abruf,
   wenn die Quelle auf `paused`, `revoked` oder `expired` steht.
3. **Staging**: kurzfristige technische Rohdaten, Fehlerprotokoll und Prüfsumme.
   Vollständiges HTML nur so lange behalten, wie es für Fehlersuche und die
   Vereinbarung nötig ist.
4. **Normalisierung**: `cinemas`, `films`, `screenings`, `source_runs` und
   `source_permissions`. Jede Vorstellung behält Quelle, Abrufzeit und direkten
   Buchungslink.
5. **Publikationskatalog**: nur vereinbarte Fakten, read-only für die App. Der
   bestehende `kd_catalog` ist dafür bereits ein guter Anfang.
6. **Persönlicher Speicher**: Bewertungen, Merkliste und Artikel getrennt vom
   öffentlichen Programmkatalog; lokaler Gastmodus und optionaler DB-Sync.

Die minimal veröffentlichte Vorstellung besteht aus:

```text
source_id, cinema_id, film_title, starts_at, version, format,
booking_url, fetched_at, valid_until
```

Filmbeschreibungen, Plakate, Standbilder, Trailer, Pressetexte und Kinologos
bleiben draußen, solange dafür keine separate Lizenz dokumentiert ist.

## Datenschutz und Produktbetrieb

Kinoprogramme selbst sind keine personenbezogenen Daten. Die DSGVO-Fragen
entstehen vor allem durch Accounts, Sync-Schlüssel, IP-/Serverlogs, persönliche
Bewertungen, Merkliste, Newsletter, Support und Analysewerkzeuge. Die Herkunft
des Spielplans von film.at oder einer Kinoseite ändert diesen Datenschutzteil
nicht wesentlich.

Für den Produktstart sind mindestens nötig:

- Gastmodus ohne Account und ohne Tracking als Standard,
- Datenminimierung, Löschfunktion, Export und dokumentierte Aufbewahrungsfristen,
- Datenschutzerklärung, Impressum und Verzeichnis der eingesetzten Dienstleister,
- Auftragsverarbeitungsverträge und passende Hosting-/Datenbankregion,
- technisch getrennte öffentliche Katalogdaten und private Nutzerdaten,
- keine geheimen Service-Schlüssel im App-Download.

Die österreichische Datenschutzbehörde beschreibt Verantwortlichkeit,
Datenminimierung und Datenschutz durch Voreinstellungen in ihrer
[Pflichtenübersicht](https://dsb.gv.at/rechte-pflichten/ihre-pflichten-als-verantwortlicher).

## GitHub-Ausstieg

GitHub muss in drei getrennten Rollen betrachtet werden:

- **Laufzeit-Sync**: kann durch den vorhandenen Supabase-Treiber ersetzt werden.
- **Hosting**: der vorhandene Web-Build oder die einzelne HTML-Datei kann auf
  einem anderen Webhost bereitgestellt werden.
- **Quellcodeverwaltung**: kann intern vorerst auf GitHub bleiben, ohne dass die
  Produkt-App davon abhängt; ein vollständiger Plattformwechsel kann später zu
  einem privaten Git-Server oder einer anderen Versionsverwaltung erfolgen.

Der Code besitzt bereits Single-HTML-Build, Paketexport/-import, zentralen
read-only Katalog und einen Postgres/Supabase-Sync. Der nächste Schritt ist daher
kein Neuaufbau, sondern das Abschalten des GitHub-Pfads nach einer kontrollierten
Migration.

## Reihenfolge bis zu einem öffentlichen Pilot

1. Keine film.at-Daten in einen öffentlichen oder kommerziellen Build übernehmen.
2. Einseitige Projektbeschreibung und standardisierte Erlaubnisanfrage erstellen.
3. Siebentägigen Testzugang von International Showtimes verwenden und die
   vollständige Wiener Abdeckung sowie OV/OmU-Qualität messen.
4. Angebot und Vertragsentwurf für den österreichischen Markt einholen; Cache,
   öffentliche App-Anzeige und Rechtekette ausdrücklich bestätigen lassen.
5. Parallel ein MovieGlu-Angebot für Österreich anfordern und die Verfügbarkeit
   von OV/OmU/OmeU sowie Untertitelangaben schriftlich bestätigen lassen.
6. Uncut als mögliche Aggregator-Kooperation anfragen und parallel klären, ob
   deren Rechtekette eine Weiterlizenzierung erlaubt.
7. Danach nonstop und Cineplexx anfragen; damit ist der größte Teil der Abdeckung
   auch ohne Aggregator mit zwei Gesprächen erreichbar.
8. Danach Hollywood Megaplex, Lugner Kino, Autokino und WIENXTRA anfragen.
9. Mit ein oder zwei schriftlich freigegebenen Quellen den Importer und das
   Quellenregister als Pilot bauen.
10. Nur die freigegebenen Häuser öffentlich anzeigen; fehlende Kinos als
   „Datenfreigabe ausständig“ markieren statt heimlich zu ergänzen.
11. Datenschutz-/Impressumsprüfung und kurze anwaltliche Prüfung der Musterzusage
   vor dem öffentlichen Start.
12. Saisonale Programme als eigene zweite Welle lizenzieren und anbinden.
