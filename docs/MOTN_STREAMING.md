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
vollständig behandelt. Eine abgeschlossene Abfrage überlappt beim nächsten
Lauf um fünf Minuten; Duplikate verändern das ursprüngliche Neu-Datum nicht.

Der tägliche Workflow verwendet die bestehende Supabase-Konfiguration des
staging-Environments; staging und Produktion lesen denselben neutralen
Backendbestand. Kein Browserbesuch erzeugt einen MotN-Request.

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
