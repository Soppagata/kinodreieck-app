# Streaming und Entdecken: FlixPatrol und Watchmode gezielter nutzen

Stand: 11. September 2026. Max hat den Plan zur Umsetzung freigegeben. Dieser
Plan ergänzt die abgeschlossene Betriebsreparatur; deren Lieferregister bleibt
[BETRIEBSREPARATUR_REGISTER_2026-09-09.md](BETRIEBSREPARATUR_REGISTER_2026-09-09.md).

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

## Was geprüft wurde

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

## Bereits gebaut und tatsächlich verwendet

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

## Konkrete Lücken

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
| Derselbe Umfang, nach erfolgreicher Bündelprobe mit zehn IDs je Request | `(5 + 3 + 1) × 31 = 279` | Bedingte Planung, keine gemessene Ersparnis. Cachetreffer können weiter reduzieren. |
| Zusätzlich Netflix Film/Serie täglich; maximal 35 Titel, Bündel zu zehn | `(7 + 4 + 1) × 31 = 372` | Ebenfalls bedingt. Vokabular-/Diagnose-/andere Abrufe kommen hinzu. Ohne Bündelung wären bis zu 1.333 möglich und damit zu viel. |
| Watchmode bisheriger Betrieb | Simulation rund 1.386–1.843, konservativ bis 1.972 Credits je Zyklus | Abo laut hinterlegtem Setup 2.500; bestehende technische Grenze 2.000, je logischem Lauf 500. Größeres Abo bedeutet nicht automatisch großen freien Puffer. |
| Watchmode-Details | Ein Credit je bestehender Watchmode-ID ohne Anhänge | 50 fehlende Titel einmalig entsprechen 50 Credits; 50 täglich wären schon 1.550 zusätzlich. Nur passende Restkapazität nach erwarteten Pflichtläufen verplanen. |

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
Hauptcheckout und vorhandene generierte Dateien bleiben unberührt.

| ID | Nutzerergebnis | Stand |
| --- | --- | --- |
| D1 | Vorhandene Identitäten und neutrale Fakten bleiben vollständig und unabhängig von aktuellen Chartplätzen nutzbar. | OFFEN |
| D2 | FlixPatrol kann benötigte Titel und Begriffe sparsam und nachweisbar vollständig laden; Netflix ist für denselben Tagesweg vorbereitet. | OFFEN |
| D3 | Entdecken und aufgeklappte Streaming-Karten nutzen dieselben belegten Texte/Genres; Dienste, persönliche Daten und Neu-Fristen bleiben geschützt. | OFFEN |
| D4 | Watchmode ergänzt deutsche Details gezielt im bestehenden Kontingent und erhält bekannte externe IDs im Export. | OFFEN |
| D5 | Der gemeinsame lokale Kandidat ist geprüft; offene Vertrags-/Liefergrenzen und spätere Befunde sind konkret dokumentiert. | OFFEN |

Die spätere Control-/Sandbox-Oberfläche, Infrastrukturtrennung, Änderung der
laufenden Schedulerziele und Erweiterung der Watchmode-Werktypen werden in
diesem Auftrag nicht gebaut. Die Analyse hierzu bleibt als spätere Arbeit
erhalten. Netflix-Umschaltung setzt den im Plan geforderten Bündel-/Budgetbeleg
voraus; bis dahin bleibt der laufende Quellenweg funktionsfähig.

### Festgehaltene Blocker und spätere Befunde

- Netflix wurde ursprünglich auf der funktionierenden öffentlichen Wochenquelle
  belassen; FlixPatrol ergänzte die fehlenden Prime-/Disney-/Apple-Quellen.
  Die offizielle Companies-Dokumentation belegt inzwischen Netflix eindeutig
  als `cmp_IA6TdMqwf6kuyQvxo9bJ4nKX`. Die Tagesquelle ist damit adressierbar;
  der praktisch bestätigte Bündelvertrag bleibt Voraussetzung für die Umschaltung.
  Quelle: [Companies](https://flixpatrol.com/api2/endpoint-companies/).
- Die gezählten vorhandenen Diagnosewege unterstützen nur einzelne festgelegte
  Titel-/Chartproben. Ein echter Bündelbeleg erfordert einen passenden neuen
  Diagnoseweg; ein vorhandener Einzelbeleg wird nicht als Bündelbeleg ausgegeben.
- Die Erweiterung der Watchmode-Werktypen und die später nötige eindeutige
  Produktionsbindung der derzeitigen `environment: staging`-Datenjobs bleiben
  wie vereinbart spätere Arbeit.

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
- Eingefrorene Repo-Naht: optionale `title_facts` je exportiertem Titel mit
  `title-facts-projection-v1`. `film`/`series`, starke Identitäten,
  Herkunft und Zeitbelege sind explizit. Unbekannte Beschreibungssprache
  bleibt `null`; angefragte Sprache ist davon getrennt.

### Lieferbelege

Noch kein neuer Lieferkandidat. Die obigen alten Belege beschreiben nur die
Ausgangslage dieses Auftrags.
