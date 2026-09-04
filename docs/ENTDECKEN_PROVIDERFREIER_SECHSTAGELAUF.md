# Entdecken: providerfreier Tages-Pool

Ursprungsstand: 27. August 2026; lokale Kadenzfortschreibung: 4. September
2026. Dies ist der lokale Produkt- und Betriebsvertrag. Die Fortschreibung
authored nur den Kandidaten und aktiviert weder Remote-Zeitplan noch Migration
oder Deployment. Radar bleibt ein getrennter Sechs-Tage-Vertrag.

## Reale Vorabspikes

Der Joyn-Spike nutzte genau einen unangemeldeten `GET` pro freigegebener
Listen-URL, ohne Cookies, Token, Redirect, Retry oder Tarnung:

| Liste | HTTP | Bytes | eindeutige Karten |
|---|---:|---:|---:|
| Meistgesehene Filme | 200 | 198.354 | 50 |
| Meistgesehene Serien | 200 | 192.898 | 50 |

Zusammen waren 100 Titel und Joyn-Pfade eindeutig; damit ist das tragende
Vorabkriterium von mindestens 50 Titeln erfüllt. Sonderzeichen wie `&`,
Apostroph, Umlaute, Ellipse, Frage- und Ausrufezeichen waren enthalten. Der
Adapter verlangt, dass die sichtbaren 50 Karten je Liste exakt mit den
strukturierten Karten desselben HTML-Responses übereinstimmen. Eine
unvollständige, blockierte oder formfremde Antwort verwirft den neuen Snapshot
vollständig. `401`, `403`, `429` und CAPTCHA lösen keinen Retry aus.

Der reale Wikidata-Spike verwendete ausschließlich die offizielle Wikibase-
Action-API. Von 20 absichtlich gemischten unbekannten Joyn-Titeln wurden 14
eindeutig mit QID und Typ sowie Jahr oder stabiler IMDb-/TMDB-ID aufgelöst:
`14/20 = 70 %`, bei `0` bekannten False Positives. Ein Titel war mehrdeutig,
vier wurden nicht gefunden und einer war unvollständig. Ein einzelner
gebündelter WDQS-Versuch lieferte innerhalb von 30 Sekunden keine Antwort und
wurde nicht wiederholt. Deshalb verwendet das Produkt keinen WDQS-Batch.

Primärverträge:

- [Wikidata Data access](https://www.wikidata.org/wiki/Wikidata:Data_access)
- [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API)
- [MediaWiki API etiquette](https://www.mediawiki.org/wiki/API:Etiquette/en)
- [Wikimedia User-Agent Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)
- [Wikidata Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)

## Gespeicherter Quellenvertrag

Aus dem flüchtigen Joyn-HTML bleiben je Poolzeile ausschließlich diese neun
belegten Felder:

`title`, `sourceItemId`, `mediaType`, `genres`, `licenseTypes`,
`sourcePosition`, `listDate`, `sourceUrl`, `fetchedAt`.

`sourceItemId` wird stabil aus Medientyp und kanonischem Joyn-Pfad abgeleitet.
Die nur im internen Next-RSC enthaltene Asset-ID dient beim Lesen als
Crosscheck, wird aber weder Identitaet noch Cache-Schluessel.

Beschreibung, Rezensionstext, Bilder, Logos und der Rohpayload werden nicht
gespeichert. Der Singleton enthält exakt 50 aktuelle Zeilen und überschreibt
den vorherigen Snapshot; es gibt keine fremde Chart-Historie. Die Quelle ist
als `owner_private`, `commercial_enabled=false` eingetragen. Das behauptet
keine Betreiberfreigabe und ist keine Freigabe für öffentliche oder
kommerzielle Nutzung.

## Wikidata: Zusatz, nicht Voraussetzung

Nur im Cache noch unbekannte `sourceItemId`-/Titel-/Typ-Fingerprints werden
seriell aufgelöst. Pro Lauf gelten:

- höchstens 20 unbekannte Titel und 40 Requests,
- höchstens vier Sekunden pro Request und 60 Sekunden insgesamt,
- ein klarer `Api-User-Agent`, `maxlag=1`, keine Parallelität und kein Retry,
- persistenter positiver und negativer Cache nach jedem Titel,
- `429`, Timeout, Maxlag, Transport- oder Cachefehler beendet nur die
  Anreicherung; der vollständige Joyn-Basispool bleibt speicherbar.

Eine Annotation enthält nur `sourceItemId`, `qid`, `mediaType`, `releaseYear`,
stabile IMDb-/TMDB-IDs und `resolvedAt`. Mehrdeutige Kandidaten werden nie
geraten. Bekannte unveränderte Fingerprints lösen keinen erneuten Request aus.

## Was persönlich verglichen wird

Mediathek, globaler Katalog und externer Pool bleiben getrennte Wahrheiten:

- **Joyn-Kandidat:** stabile Joyn-ID, Film/Serie, Quellgenres,
  `licenseTypes`, aktueller AT-Quelllink; Wikidata-ID/Jahr optional.
- **Profil:** ausschließlich bestätigte `signale`, niemals offene Vorschläge.
  Explizite Genrewerte werden über eine kleine feste Synonymtabelle auf die
  vorhandenen Profilgenres abgebildet. Ein blockierendes negatives Signal
  schließt aus.
- **Mediathek:** nur Gesehen-Ausschluss und echte positive Vergleichsbelege.
  Positiv heißt: alle drei Bewertungsachsen sind vollständig und ergeben
  zusammen mindestens 10. Kandidatenmerkmale werden nicht aus einem ähnlich
  benannten Mediathekseintrag zurückkopiert.
- **Verfügbarkeit:** Für die persönliche Joyn-Lane muss Joyn ausgewählt sein;
  die Quellkarte selbst belegt die aktuelle österreichische Verfügbarkeit.

Mindestens ein kompatibles Profilgenre oder eine echte positiv bewertete
Genrepassung ist Pflicht. Eine Listenposition ist nur Reihenfolge und niemals
Passungsersatz. Fehlende oder inkompatible Genres erscheinen daher
ausschließlich unter **Diese Woche beliebt**. Der lokale Rang wählt höchstens
sechs persönliche Titel; die separate Beliebtheitsliste zeigt bis zu sechs
weitere, ungesehene und duplikatfreie Titel in Quellenreihenfolge.

Der Gesehenfilter bevorzugt vorhandene Joyn-IDs. Fehlen sie, wird nur ein exakt
normalisierter Titel plus Typ gleichgesetzt. Mehrdeutigkeit wird blockiert;
False Negatives sind zugunsten von null False Positives akzeptiert.

## Kino „Für mich“

Joyn wird nicht mit dem Kinoprogramm gejoint. Stattdessen dürfen aktuelle reale
Kinoeinträge außerhalb der Mediathek direkt in **Läuft & passt zu dir**
erscheinen, wenn sie eine eindeutige `film_at_id`, Filmtyp, Jahr, Termine und
kompatible lokale Genres besitzen. Bereits gematchte oder mehrdeutige Einträge
werden nicht verdoppelt. Dieselbe bestehende Kinokarte wird nur zwischen den
Lanes verschoben; Kino-, Detail- und Buchungslinks bleiben identisch.

## Zeit- und Kostengrenze

GitHub stößt täglich um `02:00 UTC` an: `03:00 CET` beziehungsweise `04:00
CEST`. Der lokale Kandidat claimt atomar erst, wenn seit dem letzten
erfolgreichen oder verbrauchten Versuch mindestens 24 Stunden vergangen sind.
Der Lauf hat genau einen Versuch, dieselbe 180-Sekunden-Lease und drei
providerfreie Quell-GETs für den Format-6-Pool aus zwei Joyn-Listen und ÖFI. Joyn,
ÖFI-Quelle und Wikidata verursachen im implementierten Vertrag keine KI-
Anbieterkosten; `providerRequests=0` und `searchRequests=0` sind harte
Workflowbedingungen.

Die additive 24h-Migrationsdatei ist autorisiert lokal authored, aber nicht
angewandt. Der Schedule wirkt erst, wenn die Workflowdatei im
GitHub-Default-Branch liegt und die getrennten Releasegrenzen erfüllt sind.
Push, CI, Migration-Apply, Function-Deploy und praktische Staging-Abnahme sind
eigene Liefergrenzen und nicht Teil dieser lokalen Etappe.
