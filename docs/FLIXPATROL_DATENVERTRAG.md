# FlixPatrol-Datenvertrag

Dieser Unterbau stellt aktuelle österreichische Tagescharts und neutrale
Titelfakten einmal serverseitig bereit. Er enthält keine persönlichen Daten,
keine Verfügbarkeitsaussage und keinen Produktadapter. Der API-Key bleibt
serverseitig. Jeder Providerrequest läuft durch denselben Nutzungsticker.

## Belegter API-v2-Vertrag

Vertragsstand: 10. September 2026. Quellen sind die offizielle
[API-v2-Übersicht](https://flixpatrol.com/api2/),
[TOP-10-Dokumentation](https://flixpatrol.com/api2/endpoint-top10s/),
[Titles-Dokumentation](https://flixpatrol.com/api2/endpoint-titles/),
[Referenz-IDs](https://flixpatrol.com/api2/page-codes/) und
[Time-Dokumentation](https://flixpatrol.com/api2/page-time/).

- Authentifizierung ist HTTP Basic mit dem API-Key als Username und leerem
  Passwort. HTTPS ist Pflicht.
- GET /v2/top10s liefert Tageswerte. Der Client setzt ausschließlich die
  dokumentierten Filter company[eq], country[eq], type[eq],
  date[type][eq], date[from][eq], date[to][eq] und ranking[lte]=10.
  date[type]=1 bedeutet Tag. Ein Chartabruf ist genau ein
  Request und akzeptiert nur 1 bis 10 vollständige, eindeutige Ränge.
- TOP-10-type=2 bedeutet Movies, type=3 TVShows. Diese Werte sind nicht mit
  dem Titles-/Premieres-Typ gleichzusetzen. Bei Titles und Premieres bedeutet
  type=1 Movie und type=2 TvShow.
- Der am 10.09.2026 durch den begrenzten serverseitigen Vertragsabruf belegte
  TOP-10-Body verwendet die Hülle `{ type: "list", data: [...] }`; die zehn
  enthaltenen Records tragen jeweils `type: "top10s"`. Die gemeinsame
  Listenroutine akzeptiert diese Hülle nur mit mindestens einem Record und
  wenn jeder enthaltene Record den für den jeweiligen Parser erwarteten Typ
  trägt. Fremde Hüllen und gemischte Recordtypen bleiben ungültig.
- Im selben konkreten TOP-10-Body war `rankingLast: 0` bei einem Neueinstieg
  vorhanden. Der Chartnormalisierer bildet genau diesen Wert auf `null` ab.
  Positive Ganzzahlen bleiben erhalten; negative, nicht ganzzahlige, fehlende
  und anders typisierte Werte bleiben ungültig.
- GET /v2/titles/:id löst eine bekannte FlixPatrol-Titel-ID auf. IMDb- und
  TMDB-IDs sind nullable. FlixPatrol dokumentiert imdbId und tmdbId numerisch;
  der Client bewahrt den IMDb-Zahlenwert und bildet daraus zusätzlich die
  kanonische tt…-Schreibweise mit mindestens sieben Ziffern.
  Nullwerte löschen keine früher belegten Fakten. Widersprechende starke IDs
  werden als Konflikt abgewiesen.
- Beziehungen sind verschachtelte Objekte mit eigenem type und data.id.
  Der Normalisierer akzeptiert eine Relation nur mit dem passenden Namespace,
  etwa titles/ttl_…, companies/cmp_… oder countries/cnt_….
- Listenendpunkte dokumentieren Filter und einen separaten HEAD-Count, aber
  keine Pagination-Parameter oder Vollständigkeitsgarantie über Seiten. Der
  Client erfindet deshalb weder Cursor noch Seitenloop. TOP 10 wird durch Datum,
  Dienst, Land, Typ und Rang 1–10 begrenzt. Chartverbundene Titel werden gezielt
  per ID geladen.
- GET /v2/time liefert getrennte Server- und Veröffentlichungszeitwerte.
  Unveränderte Provider-Zeitstrings und unser UTC-Abrufzeitpunkt bleiben
  getrennt. Eine Zeitzone wird nicht ergänzt, wenn der Providerwert keine trägt.

Für den AT-Mix sind die offiziellen IDs zentral vorbelegt:

| Begriff | FlixPatrol-ID |
| --- | --- |
| Austria | cnt_gGE4RaeXpyz2U9Q5tEMYDwri |
| Amazon Prime | cmp_qypvowjqFhEIpCc0HlQ6VoYk |
| Disney+ | cmp_oGtsgdpOrjIu3XzTEnWPt87Y |
| Apple TV | cmp_VvmYc7OphiUds0Hgjbz5MESn |
| Apple TV Store | cmp_phDSns8OP1rtHnX6QwlEKhiq |

Apple TV und Apple TV Store bleiben unterschiedliche Quellen. Ein Chartplatz
belegt keine aktuelle österreichische Streaming-, Kauf- oder Leihverfügbarkeit.
Der deprecated Streamings-Endpunkt wird nicht verwendet.

Die offizielle API führt eigene Companies-, Countries-, Genres-, Keywords-
und Regions-Endpunkte. Diese erste Grundlage ruft sie nicht auf. Der
Vocabulary-Cache und sein service_role-RPC sind die schmale spätere Naht für
eine gezielte Referenzaktualisierung; dafür wären ein eigener gezählter
Requesttyp und ein eigener Integrationsschritt nötig.

## Suche ohne bekannte FlixPatrol-ID

Der offizielle Titles-Listenvertrag belegt gezielte Filter ohne bekannte
FlixPatrol-ID. Für title sind eq, ne, contains, starts, ends, in und nin
dokumentiert; premiere unterstützt eq/ne/gt/gte/lt/lte/null, type und die
numerischen imdbId/tmdbId unterstützen unter anderem eq und in. Zusätzlich
existieren ID-Filter für country, company, genre und keyword. Das sind
Filtermöglichkeiten, keine Eindeutigkeitsgarantie des Providers.

Der jetzt gebaute ID-lose Pfad verwendet die drei intern vorhandenen
Identitätsmerkmale und bietet
searchTitles({ title, mediaType, releaseYear }) als genau einen eng gefilterten
Request:

~~~text
title[eq]=<exakter Titel>
type[eq]=1|2
premiere[gte]=<Jahr>-01-01
premiere[lte]=<Jahr>-12-31
~~~

Die automatische Zuordnung ist absichtlich hart: normalisierter exakter Titel,
gleiches Jahr und gleicher Medientyp müssen genau eine FlixPatrol-ID ergeben.
Null Treffer bleiben not_found, mehrere IDs bleiben ambiguous_blocked.
Suchähnlichkeit, fehlendes Jahr, ein bloßer Prefix oder der erste Treffer
reichen nicht. Weil die Dokumentation keine Pagination-Vollständigkeit belegt,
ist dieser Weg kein Vollkatalogimport und kein allgemeiner Filmografie-Resolver.
Unbekannte Importtitel dürfen offen bleiben. Die unmittelbare Entdecken-
Integration löst ausschließlich IDs aus den abgeholten AT-Charts auf.

## Shared-JavaScript-Exports

supabase/functions/_shared/flixpatrolClient.js exportiert den bestehenden
parseFlixPatrolQuota, FlixPatrolClientError, FLIXPATROL_TIMEOUT_MS und
createFlixPatrolClient. createFlixPatrolClient bleibt für fetchQuota()
vertraglich kompatibel und ergänzt:

- fetchTop10({ companyId, countryId, chartType, date })
- fetchTitle({ sourceId, mediaType? })
- searchTitles({ title, mediaType, releaseYear })

Jede Methode claimt ihre Operation vor fetch, finalisiert sie genau einmal,
folgt keinen Redirects, hat höchstens 15 Sekunden Laufzeit und startet keinen
Retry. Die additiven Ledgertypen sind top10s und titles; quota und
das Usage-DTO bleiben unverändert.
Jeder Fehler nach einem erfolgreichen Claim trägt dieselbe operationId wie
beginOperation/finishOperation, damit der Serveradapter den Fehler
payloadfrei über kd_flixpatrol_data_record_failure zuordnen kann.

### Payloadfreie Antwortdiagnose

Eine verworfene JSON-Antwort erzeugt zusätzlich genau eine begrenzte Diagnose
mit schemaVersion `flixpatrol-response-shape-v1`. Sie unterscheidet nur die
festen Vertragsgruppen `quota`, `top10-list`, `title` und `title-list` sowie
die Fehlerklassen `json-error` und `contract-mismatch`. Erfasst werden
ausschließlich:

- Klassen der Wurzel-, Daten- und ausgewählten Listeneintragsform;
- tatsächliche Arraylängen samt der festen Klasse leer, 1–10 oder über 10;
- bekannte oder unbekannte Klassen der dokumentierten Enumfelder;
- Datentypen eines festen Whitelist-Feldsets und der erwarteten Relationen.

Beim TOP-10-Vertrag werden äußerer Wrapper, Film-, Company- und Country-
Relationen, Datumswrapper und Rangklasse getrennt ausgewiesen. So bleibt etwa
eine leere Liste von einer unbekannten Wrapperform oder einem falsch typisierten
Rang unterscheidbar, ohne einen Providerwert zu übernehmen.

Die festen äußeren Typwörter `collection`, `list`, `array` und `resultset`
werden als bekannte Diagnoseklassen ausgewiesen. Nur die inzwischen konkret
belegte `list`-Hülle mit durchgehend passend typisierten Records gehört zum
akzeptierten Listenvertrag. Bei einer weiterhin als `outer-shape` verworfenen
Antwort mit `root.data`-Array untersucht die Diagnose höchstens die ersten zehn
Zeilen und zeigt die Position der ersten vom bestehenden Normalisierer
verworfenen Zeile; sind alle untersuchten Zeilen einzeln gültig, zeigt sie die
erste.

Für eine Liste mit höchstens zehn Zeilen prüft die Diagnose jede Zeile einzeln
mit demselben unveränderten Normalisierer und dem erwarteten Company-, Country-,
Charttyp- und Datumsvertrag. Sie beschreibt die erste verworfene Zeile und nur
deren Position von 1 bis 10. Sind alle Einzelzeilen gültig, unterscheidet sie
Duplikate bei Quellen-ID und Rang als eigene Listenklassen. Leere, zu lange und
äußerlich falsch geformte Listen bleiben ebenfalls getrennt. Es gibt keinen
zusätzlichen Providerrequest und keine Lockerung des Parsers.

Die Datumsform unterscheidet den akzeptierten `daterange`-Wrapper von dem
ebenfalls akzeptierten direkten Datumsknoten. `rankingLast`, `valueLast` und
`daysTotal` werden ohne Zahlenwert klassifiziert. Für `rankingLast` sind das
`null`, Ganzzahl 0, negative Ganzzahl, positive Ganzzahl oder ungültig; die
anderen beiden Felder unterscheiden `null`, zulässige Ganzzahl und ungültig.
Sechs feste boolesche oder `null`-Prüffelder zeigen zusätzlich, ob Company,
Country, Charttyp und Datumsbereich dem angeforderten Vertrag entsprechen und
ob Titel-ID sowie `providerUpdatedAt` syntaktisch gültig sind. Fremdwerte werden
auch dort nie übernommen.

Die Diagnose übernimmt keine Titel, Beschreibungen, IDs, Schlüssel oder
Authorization und enumeriert keine unbekannten Feldnamen. Sie enthält weder
die URL noch Header oder die vollständige Antwort. Der Client hängt dieselbe
kleine, eingefrorene Projektion an `FLIXPATROL_INVALID_RESPONSE` und schreibt
sie einmal in das Serverlog. Der Diagnose-Logger läuft fehlertolerant; ein
synchroner Fehler oder ein abgelehntes Logger-Promise ändert weder den
gezählten Request noch dessen terminalen `invalid_response`-Abschluss. Es gibt
weiterhin keinen Retry.

### Manueller TOP-10-Vertragsabruf

Die rein serverseitige `flixpatrol-usage`-Function besitzt für die gezielte
Fehleranalyse den eindeutigen Headerwert
`x-kd-flixpatrol-usage: manual-top10-contract-v1`. Dieser Weg ist kein
Schedulerziel und wird vom natürlichen Usage-Ticker nicht verwendet. Er nutzt
dieselbe doppelte Service-Key-Prüfung, weist jeden Origin zurück und akzeptiert
nur einen bodylosen POST.

Der Providerrequest ist vollständig im Servercode gebunden: Amazon Prime,
Austria, Movies und der vorige UTC-Kalendertag. Requestparameter, Datum, URL
oder API-Key können nicht über den Aufruf übergeben werden. Der Weg ruft genau
einmal `client.fetchTop10()` auf und damit dieselben Ledger-Begin-/Finish-
Verträge, Timeout- und No-Retry-Grenzen wie der natürliche Client. Er liest
weder die Quota noch öffentliche Quellen, startet keine Titelauflösung und
schreibt keinen Chart oder Entdecken-Feed.

Bei einem gültigen Vertrag enthält die Antwort nur `ok`, den Status
`valid-contract`, `providerRequests: 1` und die Zahl der normalisierten
Chartzeilen. Bei einem Fehler bleiben Status, sichere Fehlerklasse und
konservative Requestzahl erhalten; nur bei `FLIXPATROL_INVALID_RESPONSE` darf
zusätzlich die erneut validierte Strukturdiagnose erscheinen. Providerdaten,
Usage-Stand und interne Detailfehler werden nicht ausgegeben.

supabase/functions/_shared/flixpatrolData.js exportiert:

- FLIXPATROL_TITLE_TYPES, FLIXPATROL_TOP10_TYPES und FLIXPATROL_AT_SOURCES;
- normalizeFlixPatrolTitle, normalizeFlixPatrolTitleList und
  normalizeFlixPatrolTop10List;
- describeFlixPatrolResponseShape für die feste payloadfreie Strukturdiagnose;
- normalizeTitleFingerprint, selectStrictFlixPatrolTitleCandidate und
  isFlixPatrolId.

Die Normalisierer geben nur das kleine dokumentierte Feldset weiter. Social
Links, Budget, Legacy-IDs und vollständige Providerantworten werden nicht
persistiert.

## Datenbankvertrag und RPCs

Migration 20260909190000_flixpatrol_data_cache.sql legt vier Tabellen mit
erzwungener RLS an. Direkter Tabellenzugriff ist auch für Browserrollen
entzogen. service_role schreibt nur durch:

- kd_flixpatrol_data_save_chart(p_chart jsonb) für einen vollständig validierten
  1–10er-Chart. Leer, teilweise, älter oder ungültig ersetzt den letzten guten
  Stand nicht. Ein Update muss sowohl ein mindestens gleiches Chartdatum als
  auch einen mindestens gleichen Abrufzeitpunkt besitzen.
- kd_flixpatrol_data_save_title(p_title jsonb, p_fetched_at timestamptz,
  p_fresh_until timestamptz) für
  normalisierte positive Titelfakten. Nullfelder erhalten bestehende Werte;
  ältere Antworten und starke ID-Konflikte werden nicht übernommen.
- kd_flixpatrol_data_save_title_miss(p_source_id text, p_media_type text,
  p_status text, p_checked_at timestamptz, p_fresh_until timestamptz) für
  not_found oder incomplete_blocked. Ein negativer Treffer überschreibt nie
  einen positiven.
- kd_flixpatrol_data_save_vocabulary(p_resource_type text, p_source_id text,
  p_name text, p_code text, p_media_type text, p_provider_type integer,
  p_provider_updated_at text, p_checked_at timestamptz,
  p_fresh_until timestamptz, p_source_url text) für eine gezielte, validierte
  spätere Referenzauflösung.
- kd_flixpatrol_data_record_failure(p_operation_id uuid, p_resource_type text,
  p_source_id text, p_media_type text, p_error_code text,
  p_failed_at timestamptz) für einen payloadfreien,
  idempotenten Fehlerbeleg zu einer bereits gezählten Operation.

Aktive authenticated-Konten und service_role dürfen nur diese begrenzten
Projektionen lesen. Die Browserprüfung folgt dem vorhandenen
kd_account_active()-Vertrag; anonyme oder inaktive Sitzungen erhalten 42501:

- kd_flixpatrol_chart_read(p_company_id text, p_country_id text,
  p_chart_type text) liefert aktiven
  angemeldeten Konten und service_role genau
  einen letzten Chart und fügt je Item den zentralen Faktenstatus an.
- kd_flixpatrol_titles_read(p_source_ids text[]) liefert aktiven angemeldeten
  Konten und
  service_role höchstens 50 ausdrücklich
  genannte Titel-IDs.

anon besitzt keine Ausführungsrechte. Kein RPC nimmt API-Key, Nutzertext,
Profil, Notiz oder beliebiges Schreib-JSON entgegen. Fehler-, Leer- und
Nullantworten werden nicht an die Save-RPCs weitergereicht; der Fehler-RPC hält
nur Operation, Ressourcentyp, öffentliche Quellen-ID, Medientyp, Fehlerklasse
und Zeitpunkt.
Positive und negative Titelwrites verwenden denselben transaktionalen
Advisory-Lock je FlixPatrol-ID. Dadurch gelten Positivvorrang und
ID-Konfliktschutz auch dann, wenn für die ID vor zwei parallelen Aufrufen noch
keine Cachezeile existiert.

## Integrationsnaht für E4

Der spätere Serveradapter verwendet dieselbe beginOperation-/
finishOperation-Anbindung wie die bestehende Usage-Function:

1. Je benötigtem AT-Dienst und Film-/Serientyp fetchTop10 seriell ausführen.
2. Einen validen Chart sofort mit kd_flixpatrol_data_save_chart speichern.
   Dadurch entstehen unresolved-Platzhalter nur für neue ttl_…-IDs.
3. Nur unbekannte oder abgelaufene IDs seriell mit fetchTitle auflösen und
   jeden Erfolg beziehungsweise negativen Endzustand sofort speichern.
4. Bei Provider-, Format- oder Speicherfehler nur
   kd_flixpatrol_data_record_failure schreiben. Bereits gespeicherte Charts
   und Fakten bleiben lesbar; ein Wiederanlauf arbeitet nur die offene
   Fehlmenge ab und wird nicht automatisch gestartet.
5. Den 50er-Mix aus den bestehenden ÖFI-/Netflix-Anteilen und den gezielt
   gelesenen FlixPatrol-Projektionen zusammensetzen. Erst ein vollständiger
   neuer Feed darf den bisherigen Produktfallback ersetzen.

Es gibt kein zusätzliches Quota- oder Budgetgate. Der bestehende Ticker zählt
jede Pagination- oder Lookup-Anfrage einzeln vor dem Netzwerkaufruf. Da dieser
Vertrag keine Pagination implementiert, ist aktuell jeder Methodenaufruf genau
ein gezählter Request.
