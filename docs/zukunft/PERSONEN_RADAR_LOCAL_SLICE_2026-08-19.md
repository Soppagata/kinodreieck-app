# Personenradar: lokaler vertikaler Slice

**Stand:** 19.08.2026
**Status:** lokal und mockbasiert gebaut; Remote-Kandidatenmigration **NICHT GEBAUT**

Der kleine Slice nutzt die vorhandenen Radar-Strukturen: dieselbe Subscription-
Outbox, denselben Feed, denselben manuellen Websearch-Aufruf und denselben lokalen
Radar-v2-Cache. Der geschlossene Discriminator besteht aus starker Personen-ID
und genau einer Rolle (`actor` oder `director`). Namen allein werden nie gematcht.

Für Gast und Einzeldatei ist die Merkfunktion rein lokal. Eine serverseitige oder
automatische Prüfung wird dort weder gestartet noch behauptet. Für Konten ist der
Personenpfad lokal gegen Mocks anschlussfähig; der bestehende Werkpfad bleibt
unverändert.

## Bewusst nicht gebaut

Der lokale Basisvertrag der Subscription-RPC und ihres Tabellenschemas enthält den
optionalen Personen-Discriminator noch nicht; über den Remote-Stand trifft diese
Etappe keine Aussage. Eine spätere additive Kandidatenmigration müsste
in derselben Subscription-Tabelle und derselben RPC genau `person_external_id` und
`person_role` ergänzen, die Kombination mit `target_type = 'person'` prüfen und die
beiden Felder im vorhandenen Feed zurückgeben. Außerdem müsste die vorhandene
Websearch-Context-RPC für ein solches Ziel den geschlossenen Personenvertrag samt
kleinem Werk-Katalog liefern. Sie darf keine zweite Tabelle, Queue, Prüfschleife
oder ein Related-Work-Untermodell einführen.

Diese Kandidatenmigration wurde in dieser Etappe weder angelegt noch angewendet.
Ebenso wurden keine Function, kein Flag und kein Secret remote verändert oder
deployt. Bis eine eigene Remote-Etappe den Vertrag prüft und freigibt, ist nur die
lokale/mockbasierte Lieferung belegt.
