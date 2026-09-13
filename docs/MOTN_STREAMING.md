# Movie of the Night: österreichische Streaming-Ergänzung

Owner-Entscheid 13.09.2026: Watchmode bleibt der Grundbestand. MotN liefert
Neuzugänge und maßgebliche Verfügbarkeitskorrekturen für Österreich. Nach
14 vollen Tagen endet ausschließlich Neu; ein von Watchmode noch nicht
übernommenes Angebot bleibt unter Alles und in Entdecken erhalten.
Übernahme und Entfernung gelten pro Werk, Dienst und Abo-Angebot. Prime
Channels folgen weiterhin ihrem bisherigen Datenweg.

Der direkte Entwicklerzugang nutzt `https://api.movieofthenight.com/v4`,
`X-API-Key` und das bestehende Supabase-Secret `MotN_API_key`. Anbieterkeys
und Live-Anfragen bleiben vollständig auf dem Server.

Die ersten vier Vergleichsabfragen vom 13.09.2026 bestätigten beide bekannten
Disney+-Titel, das fehlende Netflix-Angebot von Kung Fu Panda 2 sowie jeweils
eine Seite echter AT-Neuzugänge und Entfernungen. Entfernungsmeldungen können
abweichend von der Dokumentation keinen Link enthalten. Ein entfernter Link
allein entfernt kein weiterhin bestehendes Abo-Angebot desselben Dienstes.

`kd_motn_offers` enthält nur neutrale Anbieterinformationen und dauerhafte
Entfernungen. Starke IMDb-/TMDb-IDs und der Werktyp verbinden die Bestände. Fehlen gemeinsame
IDs im Watchmode-Bestand, gilt nur ein eindeutiger exakter Titel oder
Originaltitel mit gleichem Bezugsjahr und Film-/Serientyp;
mehrdeutige oder widersprüchliche Identitäten bleiben unverbunden.
`kd_streaming_catalog` liest Watchmode und MotN in derselben Datenbankabfrage
unter der bestehenden Konto-RLS. Fehler verwenden den bereits bestehenden
Cache für die vollständige kombinierte Antwort.

Der gemeinsame Serverlauf reserviert jede Anfrage vor dem Abruf. Grenzen:
24 Anfragen pro UTC-Tag. Die einmalige Startbefüllung hat stattdessen insgesamt
höchstens 80 Anfragen einschließlich der vier Vergleichsabfragen. Für beide
Wege gelten 900 innerhalb von 32 Tagen. Ist die Startbefüllung nach 80 Anfragen
noch unvollständig, setzt der nächste reguläre Tag mit maximal 24 fort; maximal zwölf Seiten je
Änderungsart und Lauf. Das kostenlose Anbieterlimit ist zusätzlich hart und
erzeugt keine Überziehungsgebühren. Jede erfolgreich geladene Seite wird mit
ihrem Cursor atomar gespeichert. Fehler werden im Lauf nicht wiederholt;
der nächste tägliche Lauf setzt am offenen Cursor fort. Die Startbefüllung darf nach erfolgreich gespeicherten Seiten am selben Tag weiterlaufen; Fehler geben keinen sofortigen Wiederholungsweg frei. Ein über 31 Tage
alter unvollständiger Abruf wird als veraltet gestoppt und nicht still als
vollständig behandelt. Abgeschlossene Sekundenfenster schließen unmittelbar
aneinander an; Duplikate verändern das ursprüngliche Neu-Datum nicht.

Seit dem anschließenden Owner-Entscheid gilt: Watchmode erneuert alle 39 Quellen
wöchentlich. MotN prüft täglich um 05:27 UTC mit höchstens zwei ersten Seiten
(neue und entfernte Angebote). Leere Fenster werden abgeschlossen. Bei Änderungen
wird nur dann weitergeblättert und importiert, wenn der letzte vollständige Abgleich
mindestens 48 Stunden zurückliegt. Die beiden Prüfseiten werden dabei direkt
wiederverwendet. Während der Sperre bleibt der Importcursor unverändert und der
Änderungsbedarf gespeichert. Der nächste freigegebene Tageslauf holt das Fenster
nach; die 48 Stunden sind deshalb keine maximale Ende-zu-Ende-Latenz. Bereits
begonnene, begrenzte Importe setzen ihren exakten Cursor fort, bis beide Arten
fertig sind; erst dann beginnt die neue Sperre. Eine tägliche Prüfung ohne
Änderungen verlängert die Sperre nicht.

Die gemessenen 54 Anfragen für 14 Tage entsprechen hochgerechnet rund 120 für
31 Tage. Mit maximal 62 täglichen Prüfseiten und Rundungsreserve sind etwa
150–200 Anfragen pro Monat plausibel, keine garantierte Verbrauchsmenge.
Prüfungen und Importe zählen gemeinsam gegen 900 in 32 Tagen. Andere manuelle
Nutzung desselben MotN-Abos liegt außerhalb dieses App-Zählers.

Der tägliche Workflow verwendet die bestehende Supabase-Konfiguration des
staging-Environments; staging und Produktion lesen denselben neutralen
Backendbestand. Kein Browserbesuch erzeugt einen MotN-Request.

## Verbrauchsticker für die spätere Staging-Sandbox

`POST /functions/v1/streaming-motn` mit `x-kd-motn: usage-at-v1`, leerem
Body und denselben serverseitigen Zugangsdaten wie der Scheduler liefert
`{ok:true,status:"read",providerRequests:0,usage:{...}}`. Alternativ kann der
Server direkt `kd_motn_usage_status()` aufrufen. Lokal liest
`node tools/motn-usage.mjs` mit `SUPABASE_URL` und
`SUPABASE_SERVICE_ROLE_KEY` denselben JSON-Vertrag.

`usage` Format 1 enthält seit Einrichtung und für den UTC-Monat/Tag gebuchte
Anfragen, die Aufteilung neue/entfernte/Vergleich, den 900er-Deckel mit
32-Tage-Rest, letzte Prüfung und vollständigen Abgleich, Ende der 48-Stunden-Sperre
und vorgemerkte Änderungen. `source: "kinodreieck-reservations"` kennzeichnet
den konservativen eigenen Zähler. `providerQuota: null` bedeutet: offizielle
MotN-Nutzung, fremde Abfragen desselben Abos und dessen Abrechnungsreset werden
nicht als bekannt ausgegeben. Das Planlimit 1.000 bleibt ein getrennter Wert.

Der Ticker liest ausschließlich vorhandene Daten, bucht keine Anfrage und
funktioniert auch ohne MotN-Key. Wie der bestehende FlixPatrol-Ticker ist er
nur serverseitig zugänglich. Das spätere Sandbox-Element bindet seinen
authentifizierten Backend-Leseweg an; ein Service-Key gehört nicht ins UI.

Primärverträge, geprüft am 13.09.2026:

- https://docs.movieofthenight.com/guide/authentication
- https://docs.movieofthenight.com/resource/changes
- https://docs.movieofthenight.com/resource/shows
- https://docs.movieofthenight.com/guide/countries-and-services
- https://www.movieofthenight.com/about/api/pricing

Die Preis-FAQ erlaubt dauerhafte lokale Zwischenspeicherung und kommerzielle
Nutzung auch im kostenlosen Tarif. Die Quellenattribution erscheint im
Streamingbereich; es werden keine persönlichen Bewertungen oder Nutzerprofile
an MotN übertragen.

## Betriebsnachweis vom 13.09.2026

Der erste 14-Tage-Zeitraum bis 14:51 UTC ist vollständig verarbeitet:
1.338 Angebotsänderungen, beide Cursor abgeschlossen, null übersprungene
Datensätze. Die Serverfunktion v2 benötigte dafür 54 MotN-Anfragen; zusammen
mit den vier vorherigen Vergleichsabfragen sind 58 im gemeinsamen Ledger
gebucht. Weitere Browserbesuche erzeugen keine Anbieteranfrage.

Der tatsächliche kombinierte REST-Leseweg lieferte beide Kataloge erfolgreich
(ca. 1,4 MB / 8,0 MB; bei dieser Messung 1,3 / 1,9 Sekunden). Die reine
Produktprojektion bestätigt je genau einen Eintrag für Kung Fu Panda 2 und
The Road to El Dorado, beide bei Disney+ und innerhalb ihrer Neu-Frist.
Netflix ist bei Kung Fu Panda 2 entfernt. Der zweite Titel wird über seinen
eindeutigen Originaltitel mit Jahr und Filmtyp verbunden.

Die vollständige lokale npm-Testsuite, die gezielten MotN-Tests, zehn lokale
PostgreSQL-Prüfungen und sechs mobile Browserfälle in Chromium/WebKit sind
geprüft. Neue Rollenrechte wurden zusätzlich direkt auf Supabase positiv
und negativ gelesen: aktives Konto sieht den kombinierten Katalog; ohne
aktive Kontofreigabe sind beide Mengen leer. Browser dürfen weder Angebote
schreiben noch Import oder Anfragelog aufrufen. Der ältere allgemeine
`npm run test:rls` stoppte schon vor Testwrites, weil die hinterlegten
Zugangsdaten für `testa` nicht mehr anmelden können; dieser ältere Gesamttest
wird nicht als bestanden ausgewiesen.

## Nachtrag: Intervalle und Ticker

Die anschließende Intervallumstellung besteht 26 gezielte JavaScript-Fälle,
16 lokale PostgreSQL-Prüfungen, die vollständige lokale npm-Suite und sechs
mobile Chromium-/WebKit-Fälle. Supabase-Funktion v4 ist ACTIVE; alle sechs
bereitgestellten Quelldateien wurden bytegleich rückgelesen. Der Ticker meldet
58 gebuchte Anfragen (32 neue, 22 entfernte, vier Vergleiche), 842 verbleibende
im 32-Tage-App-Deckel. Ticker und erneuter Tagesaufruf erzeugten jeweils keine
Anbieteranfrage; der Tagesaufruf antwortete `not_due`.

Der aktive Watchmode-Lieferant und seine beiden bisherigen Datenbranches
stehen auf `2262d7e` (Wochenrhythmus; 35 plus elf Mockprüfungen). Seine drei
vorher vorhandenen generierten Änderungen wurden bytegleich erhalten.
Der letzte Abruf war lokal fertig, die morgendliche Supabase-Übertragung
jedoch an einem Statement-Timeout gescheitert. Ausschließlich die bereits
fertige Streaming-Lieferung und ihr Manifest wurden fortgesetzt: erfolgreich
in 9,4 Sekunden, alle drei Serverzeilen mit demselben Exporthash rückgelesen,
kein erneuter Anbieterabruf und keine Kino-Änderung. Der passende Pending-Lauf
ist abgeschlossen. Nächste Wochenfälligkeit: 14.09.2026, 11:05 UTC; der
bestehende stündliche Mac-Ticker führt sie bei laufendem Rechner aus.
