# FlixPatrol: sichere Titelidentitaet

Der reine Helper `src/lib/externalTitleIdentity.js` verbindet einen externen
Titel mit einem eigenen Katalogeintrag, ohne einen Bestand zu mutieren oder zu
speichern. Er ist die gemeinsame Identitaetsgrenze fuer den bestehenden
Streamingkatalog und eine spaetere FlixPatrol-Anreicherung.

## Oeffentlicher Vertrag

`ordneExternenTitelZu(extern, eigeneEintraege)` liefert einen der Zustaende
`matched`, `unmatched`, `ambiguous` oder `conflict`. Nur `matched` enthaelt mit
`match` den unveraenderten eigenen Eintrag. `matchedBy` unterscheidet
`strong-id` und `title-year-type`.

Eine automatische Zuordnung setzt auf beiden Seiten ein plausibles
Referenzjahr und einen eindeutig normalisierbaren Film-/Serientyp voraus.
Akzeptierte Typvarianten sind `film`/`movie` sowie
`serie`/`series`/`tv`/`tv_series`/`tv series`/`show`. Ein fehlender Typ wird
nicht pauschal als Film gedeutet. Der vorhandene Streaming-Entdecken-Vertrag
liefert den Typ bereits explizit; ein bekannter Streamingtitel uebernimmt ihn
beim Zusammenfuehren aus diesem neutralen Katalogdatensatz.

Zuerst werden gemeinsame Watchmode-, IMDb-, TMDB- oder FlixPatrol-IDs
verglichen. Eine passende starke ID gewinnt vor titelbasierten Kandidaten.
Widerspricht eine weitere gemeinsame ID, bleibt das Paar `conflict`. TMDB-IDs
werden wegen moeglicher Film-/Serien-Kollisionen nie ohne den Typguard benutzt.

Ohne gemeinsame starke ID gilt ausschließlich: genau gleicher normalisierter
Titel oder Originaltitel, exakt gleiches Referenzjahr und gleicher Werktyp.
Jahrestoleranzen, Prefix-, Teilstring- und Fuzzy-Matches sind fuer diese
automatische Zuordnung verboten. Mehrere passende eigene Eintraege liefern
`ambiguous` und damit keine Verbindung. Tolerante Suchvorschlaege koennen
ausserhalb dieses Helpers bestehen bleiben.

`ergaenzeFehlendeExterneKennungen(eigen, extern)` erzeugt eine neue Projektion.
Vorhandene eigene IDs bleiben bytegetreu fuehrend; nur fehlende ID-Felder werden
ergaenzt. Der Aufrufer darf diese Funktion erst nach einer bestaetigten
Identitaet verwenden. Verfuegbarkeit, ausgewaehlte Dienste und persoenliche
Besitz-/Gesehenwerte gehoeren nicht zur Identitaetsentscheidung.

## Einbindung

`src/lib/katalog.js::baueStreamingAnsichten` verwendet den Helper beim lokalen
Abzug des aktiven Mediathek-Masters vom neutralen Streamingkatalog. Unsichere,
mehrdeutige oder widerspruechliche Titel bleiben in `Entdecken`. Die Ausgabe
fuegt weiterhin Dienste, URLs und Serienstand als Anzeigeprojektion hinzu; sie
schreibt weder in den Master noch in persoenliche Datentoepfe.

Ein spaeterer FlixPatrol-Adapter soll seine Rohfelder zuerst in diesen kleinen
Vertrag (`titel`/`originaltitel`, `jahr`, `typ`, belegte IDs) projizieren. Er
darf fehlende Pflichtbelege nicht aus Suchnaehe oder Defaults erfinden.
