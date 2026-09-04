# C2 · Entdecken-Leichtpfad (U-12)

## Aussage

Der Hauptbereich **Entdecken** lädt den vollständigen Streaming-Entdecken-
Katalog weder beim normalen Öffnen noch bei einem Konto-Kontextwechsel. Seine
erste sinnvolle Ansicht kommt aus dem gebündelten, providerfreien Marktfeed und
dem kleinen Bekannt-Katalog. Der Vollkatalog bleibt für **Streaming → Alles**,
einen expliziten Streaming-Sprung, die globale bereichsübergreifende Suche und
das manuelle Katalog-Nachladen erhalten. Das bloße Öffnen von Streaming → Mein
Programm lädt ihn noch nicht.

## Belegte Ausgangsbasis

Read-only-Messung vor C2 am vollständigen Katalogpfad:

| Messgröße | Vorher |
| --- | ---: |
| Vollkatalog, unkomprimiert | 3.261.785 B |
| Vollkatalog, gzip | 409.299 B |
| JSON-Parse | ca. 10,23 ms |
| Kandidatenprojektion | ca. 17,49 ms |
| Empfehlungsprojektion | ca. 9–18 ms |

## Lokaler Nachweis

`tests/cleanup-c2.spec.mjs` prüft den echten App-Nutzerpfad bei 393 × 852 px
providerfrei in Chromium und WebKit. Der Test protokolliert je Browser die
Requestkette, die Antwortgröße des kleinen Katalogs, Vollkatalog-Requests,
Vollkatalog-Parse/-Projektion, Zeit bis zu sechs montierten Feedkarten sowie
den warmen Wiederaufruf.

| Browser | Requestkette bis Entdecken | kleiner Fixture-Payload | Vollkatalog | Parse / Projektion | Karten | kalt | warm |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Chromium | Account → Personal → Programm → Bekannt | 571 B | 0 Requests / 0 B | 0 / 0 ms | 6 | 385,9 ms | 339,4 ms |
| WebKit | Account → Personal → Programm → Bekannt | 571 B | 0 Requests / 0 B | 0 / 0 ms | 6 | 448,0 ms | 414,0 ms |

Ein zweiter Browserpfad belegt in beiden Engines die Bedarfskante: Erst das
Absenden der globalen Suche nach `Zulu Fund` löst genau einen
`streaming_entdecken`-Request aus und liefert den Treffer aus dessen direkter
Antwort. **Streaming → Alles** wird im ersten Pfad genauso erst beim bewussten
Untertab-Wechsel geladen. Die 571 B sind die deterministische kleine
Testantwort, keine Messung eines ausgelieferten Produktions-Payloads.

## Beweisgrenzen

- Die Zeitwerte sind lokale Browsermessungen und kein physischer iPhone-PWA-
  Nachweis.
- `0 ms` für Parse/Projektion bedeutet: Der Vollkatalogpfad wurde nicht
  ausgeführt; es ist keine synthetisch beschleunigte Vollkatalogmessung.
- Der Test nutzt einen lokalen, kontrollierten Supabase-Vertragsstub. Er löst
  keine Provider-, Shared-Data-, Migrations-, Push- oder Deploywirkung aus.
