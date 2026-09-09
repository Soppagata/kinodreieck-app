# FlixPatrol-Fakten im KI-Kontext

Stand: 2026-09-10

## Zweck

Die vorhandenen, serverseitig gecachten FlixPatrol-Titeldaten dürfen drei bestehende Nutzerwege ergänzen:

- persönliche Prognose für einen unbewerteten Film oder eine Serie,
- Vorschau eigener Filmerwähnungen bei der Profil-Extraktion,
- manuelle Radar-Suche für ein bereits autorisiertes strukturiertes Film- oder Serienziel.

Die Fakten sind neutraler Katalogkontext. Sie sind kein Geschmackssignal, keine Qualitätswertung und kein Beleg für aktuelle oder zukünftige Verfügbarkeit in Österreich. Chartplätze, unaufgelöste Genre- und Keyword-IDs werden nicht in KI-Aufträge projiziert.

## Gemeinsamer Lesepfad

`supabase/functions/_shared/flixpatrolFactsContext.js` kapselt den einzigen Faktenleser. Er nutzt ausschließlich die vorhandenen E2-RPCs und ist für Mocktests mit einem RPC-Reader injizierbar.

- Bei einer belegten FlixPatrol-ID liest er direkt einmal `kd_flixpatrol_titles_read`.
- Ohne diese ID liest er fünf feste AT-Charts und danach höchstens einmal bis zu 50 konkrete IDs über `kd_flixpatrol_titles_read`.
- Der E2-Titeldatensatz liefert den maßgeblichen Medientyp; der Chartwert darf ihn nicht überschreiben.
- Fehler, Zeitüberschreitung, Widerspruch oder mehrdeutige Identität ergeben leeren Zusatzkontext. Es gibt keinen Retry und keinen Provider-Fallback.

Die E3-Identitätslogik liegt einmal in `supabase/functions/_shared/externalTitleIdentity.js`. Der Browserexport verweist auf dieselbe Implementierung. Starke IDs werden zusammen mit Typ und Jahr geprüft; andernfalls braucht es exakten normalisierten Titel oder Originaltitel sowie Jahr und Typ. Remakes und ID-Widersprüche bleiben offen.

## Nutzerwege und Grenzen

Beim Forecast sendet der Browser weiterhin nur eigene Filmdaten, Identität und bestätigte Profilsignale. Die Edge Function liest den Faktenkontext nach der bestehenden Authentisierung und vor dem bereits vorhandenen Anbieteraufruf. Eine fremde Kurzbeschreibung wird im Prompt ausdrücklich als Daten behandelt. Gemeinsames Filmwissen und bestätigte Profilsignale bleiben führend; aus FlixPatrol entsteht kein WARUM-Wert. Eingeschleuste Browserfelder `filmwissen` oder `flixpatrolFakten` werden vor Kostenreservierung abgewiesen. Ein Cache-Miss bewahrt den bisherigen Forecast-Pfad.

Bei der Profil-Extraktion sieht der bestehende KI-Anbieter keine FlixPatrol-Daten. Erst die geprüfte Filmerwähnung wird serverseitig gegen den Cache gehalten. Treffer erscheinen als flüchtige „mögliche Werke, noch nicht bestätigt“. Sie ändern weder Titel noch Jahr, `masterId`, `sicher` oder Richtung des persönlichen Eintrags. Der Speichervertrag bleibt unverändert; die Hinweise werden nur getrennt im aktuellen UI-Zustand gehalten.

Beim Radar erhält nur ein autorisiertes strukturiertes Werk- oder Serienziel den optionalen Kontext. Person-, Titelgruppen- und Freitextpfade bleiben unverändert. Der Prompt stellt klar, dass Cachefakten keine Termine, AT-Verfügbarkeit, Besetzung oder Reihenmitgliedschaft belegen. Source-Registry, Datums-, Regions- und Persistenzprüfungen laufen danach gegen den unveränderten Radarrequest.

## Bewusste Nichtumbauten

K02, die E5-Importnachprüfung, wird unverändert wiederverwendet. Es gibt keinen zweiten Batchresolver, keinen neuen FlixPatrol-Request, keinen zusätzlichen KI-Aufruf, keine neue Recherche und keine Scheduleraktivierung. Blog, Diagnose, Filmwissen-Recherche, Entdecken und automatische Nachprüfung erhalten keinen neuen Faktenpfad.

## Lokale Prüfungen

Die fokussierten Mock- und UI-Tests decken feste Lesegrenzen, direkte IDs, strikte Identität, ID-Konflikt, Remake, fehlenden Typ, Cachefehler und Zeitüberschreitung ab. Sie prüfen außerdem Browserinjektion vor Reservierung, genau einen bestehenden Anbieteraufruf, unveränderte persönliche Filmwerte, unbestätigte Profilhinweise sowie die unveränderten Radar-Evidenzgrenzen.
