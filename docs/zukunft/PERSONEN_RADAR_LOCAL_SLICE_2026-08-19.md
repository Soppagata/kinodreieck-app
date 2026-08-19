# Personenradar: lokaler vertikaler Slice

**Stand:** 19.08.2026
**Status:** lokaler Serverkandidat gebaut und mockbasiert geprüft; **NICHT REMOTE ANGEWANDT**

Der kleine Slice nutzt die vorhandenen Radar-Strukturen: dieselbe Subscription-
Outbox, denselben Feed, denselben manuellen Websearch-Aufruf und denselben lokalen
Radar-v2-Cache. Der geschlossene Discriminator besteht aus starker Personen-ID
und genau einer Rolle (`actor` oder `director`). Namen allein werden nie gematcht.

Für Gast und Einzeldatei ist die Merkfunktion rein lokal. Eine serverseitige oder
automatische Prüfung wird dort weder gestartet noch behauptet. Für Konten ist ein
lokaler Serverkandidat vorbereitet: dieselbe Subscription-Tabelle ergänzt genau
`person_external_id` und `person_role`; dieselbe Function führt genau einen
manuellen Websearch aus; ein bestätigtes kuratiertes Werk landet in den vorhandenen
Target-, Event-, Versions-, Evidence- und Operations-Primitiven und wird über den
vorhandenen Feed wieder geladen. Der vierparametrige Werkpfad bleibt erhalten.

## Lokale Kandidatengrenze

Die additive Migration
`20260819220000_radar_person_server_candidate.sql` verändert keine historische
Migration und erzeugt keine neue Tabelle. Sie schließt den Discriminator gegen ein
intern kuratiertes Personenziel, dessen starke ID, Rolle und kleinen Werkkatalog.
Rollenwiderspruch, Namensabgleich ohne ID, unbekanntes Werk und nicht kuratierte
Evidenz stoppen fail-closed. Der Kostenpfad bewahrt die atomare allgemeine
Reservierung; unbekannter Verbrauch wird nicht als Erfolg behandelt.

## Bewusst nicht geliefert

Die Kandidatenmigration wurde nur lokal gebaut und auf einer synthetischen lokalen
PG17-Kette geprüft. Keine Migration und keine Function wurde remote angewendet oder
deployt; kein Flag und kein Secret wurde verändert. Scheduler, Retry, Batch,
Ranking, Historienmodell, zweite Personenplattform und zweiter Provider bleiben
außerhalb dieses Slices. Remote-Fähigkeit und praktische Live-Abnahme sind damit
nicht belegt.
