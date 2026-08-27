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
