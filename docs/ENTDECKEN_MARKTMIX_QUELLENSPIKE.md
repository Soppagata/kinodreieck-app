# Entdecken-Marktmix: Quellenmatrix und Read-only-Spike

Stand: 27. August 2026. Zweck: privater Kinodreieck-Produktpfad in Österreich.
Alle Requests waren einzelne unangemeldete `GET`s ohne Proxy, Tarnung oder
Retry. Rohcaptures lagen nur unter `/private/tmp` und sind nicht Teil des
Repositories.

## Kleine Quellenmatrix

| Quelle | Echte Probe | Nutzen im Produkt | Rechte-/Betriebsgrenze | Entscheidung |
|---|---:|---|---|---|
| Joyn Österreich, offizielle Meistgesehen-Seiten | 2 GETs; 100 eindeutige Karten, 99 mit Genre | aktuelle Streamingfilme und Serien; 35 Titel im Mix | Nutzungsbedingungen nur für den privaten Pfad ausgewertet; HTML-Struktur kann driften | bestehenden 50er-Adapter unverändert als Streamingquelle und Fallback behalten |
| Österreichisches Filminstitut, offizielle Wochenendcharts (Comscore) | 1 GET; 15/15 streng lesbare Rangzeilen | aktueller österreichischer Kinomarkt | Impressum erlaubt private Nutzung; bei Struktur-/Quellendrift kein neuer Pool | 15 Kinotitel ergänzen, nie teilaktualisieren |
| Wikidata, offizielle REST API v1 | eindeutiger, fehlender, unvollständiger und mehrdeutiger Suchfall; keine Retries | kostenlose QID-, Jahr-, Medienart-, IMDb- und TMDB-Anreicherung | CC0; serielle Limits, identifizierender User-Agent und negativer Cache | Action-API-Pfad mit `maxlag` durch REST v1 ersetzen; exakt eine QID vor Entity-Read |

Nicht übernommen wurden Login-/Personalisierungsquellen, inoffizielle Wrapper,
Anti-Bot-Pfade und Quellen, deren Ergebnis weder aktuelle Popularität noch eine
eindeutige Werkidentität belegt.

## Befund vor dem Bau

Der reale Action-API-Aufruf des bisherigen Wikidata-Resolvers endete vor jeder
Entity mit `maxlag`. Deshalb waren 0 Annotationen und 0 Cachezeilen ein
erklärbarer Pfadbefund und kein Beleg für „keine Metadaten vorhanden“.

Der bisherige persönliche Funnel konnte bei einer normalen, aber nicht auf Joyn
eingeschränkten Dienstewahl anonymisiert so abbrechen:

`50 Kandidaten → 0 dienstekompatibel → 0 Metadaten → 0 nach Ausschlüssen → 0 Profilpassungen → 0 sichtbar`

Der neue Format-6-Mockpfad belegt mit ausschließlich synthetischen Titeln:

`50 Kandidaten → 35 Personalisierungsmetadaten → 34 nach Seen/Ausschluss → 11 Profilpassungen → 6 sichtbar`

## Bauentscheidung

- Format 5 und der funktionierende Joyn-50er bleiben lesbar und unverändert.
- Format 6 wird nur als vollständiger Pool aus 15 Kino-, 18 Streamingfilm- und
  17 Serientiteln gespeichert. Jeder Quellenausfall behält den letzten guten
  Pool.
- `popularity`, `availability` und die erst lokal ermittelten Profilgründe sind
  getrennte Fakten. Keine Rangzahl entscheidet einen persönlichen Gleichstand.
- Titel-Matching ohne gemeinsame ID ist nur exakt mit Jahr und Medientyp
  zulässig. Mehrere exakte Wikidata-QIDs werden negativ gecacht, nie geraten.
- Format 6 benötigt vor einer Außenwirkung noch Quellenregister-/Persistenz-
  Migration, Deployment und reale Produktabnahme; diese Etappe führt keines
  davon aus.

## Additiver Quellenentscheid E4

Stand: 28. August 2026. Nutzerfeedback hat die Joyn-Stream-TV-Liste als
Popularitätsquelle fachlich verworfen: In der initialen iPhone-Auswahl war sie
dominant und enthielt keine belastbar aktuellen Charttitel. Historische
Format-5-Verträge bleiben als bytehistorischer Failover lesbar, aber Joyn ist
keine aktive Quelle für einen neu erzeugten Format-6-Pool und erscheint nicht
mehr in der sichtbaren Popularitätslane. Die persönliche Matchingstrecke bleibt
für den Übergang unverändert lesbar.

| Quelle | Empirischer Vertrag ohne Titel/Rohpayload | Rechte-/Betriebsgrenze | Entscheidung |
|---|---|---|---|
| Netflix Top 10, offizieller Länder-TSV | HTTP 200, TSV mit exakt 8 belegten Feldern; aktuelle AT-Woche mit je Rang 1–10 für Film und TV | nur owner-privater Pilot; öffentliche oder kommerzielle Weiterverwendung braucht eine eigene Rechteentscheidung; großes Archiv wird nur bis zum aktuellen AT-Block gestreamt | 5 Filme plus 5 Serien, harte Obergrenze 10/25 |
| Österreichisches Filminstitut / Comscore | 15 aktuelle, streng lesbare AT-Wochenendchart-Zeilen | owner-privater Pilot; Struktur- oder Aktualitätsdrift stoppt den gesamten neuen Pool | 15 Kinofilme, weiterhin aktiv |
| Apple RSS | aktueller offizieller Generator bietet keine Film-/TV-Charts | alte Links sind kein belastbarer Betriebsvertrag; Scraping ist ausgeschlossen | verworfen |
| Disney+ Top 10 | offizielle länderspezifische Liste nur in der App, kein öffentlicher Datenpfad | kein ratenbarer oder scrape-basierter Adapter | verworfen |
| AGF Streaming | öffentliche Monatslisten für Deutschland; gemischte Events/Episoden | Datenbezug und Nutzung sind angebotspflichtig; kein AT-Wochenvertrag | verworfen |
| JustWatch Partner API | dokumentierte Partner-API mit Token | ohne Partnervertrag, Token und Rechtefreigabe kein owner-privater Gratispfad | verworfen |

Der neue ehrliche Format-6-Vertrag umfasst deshalb 25 statt 50 Titel: 15 Kino,
5 Streamingfilme und 5 Serien. Keine Quelle darf mehr als 40 Prozent des Pools
stellen. Der Refresh ist unteilbar und retryfrei; bei fehlender, veralteter
oder strukturell gedrifteter Quelle bleibt der letzte gute Pool sichtbar.
